import { Database } from "@opencode-ai/core/database/database"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { TurnModelOperationTable } from "@opencode-ai/core/turn/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { AppRuntime } from "../src/effect/app-runtime"
import { InstanceRef } from "../src/effect/instance-ref"
import { InstanceStore } from "../src/project/instance-store"
import { entryBody } from "../src/cli/cmd/run/entry.body"
import { toolInlineInfo } from "../src/cli/cmd/run/tool"
import type { StreamCommit } from "../src/cli/cmd/run/types"
import { MessageID, SessionID } from "../src/session/schema"
import { Session } from "../src/session/session"
import { SessionPrompt } from "../src/session/prompt"

if (process.env.REPA_GATE15_REAL_MODEL_APPROVED !== "1") {
  throw new Error("Set REPA_GATE15_REAL_MODEL_APPROVED=1 only after explicit maintainer authorization")
}
if (!process.env.REPA_CONFIG_CONTENT || !process.env.REPA_AUTH_CONTENT || !process.env.REPA_DB) {
  throw new Error("The real-model evidence run requires isolated config, auth projection, and database inputs")
}

const model = {
  providerID: ProviderV2.ID.openai,
  modelID: ModelV2.ID.make("gpt-5.5"),
}
const capability = LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY
const retainedOnly = [
  { permission: "*", pattern: "*", action: "deny" as const },
  { permission: capability, pattern: "*", action: "allow" as const },
]
const noTools = [{ permission: "*", pattern: "*", action: "deny" as const }]
const windowMilliseconds = 5 * 60_000

type CompletedToolPart = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }

function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Gate 15 real-model evidence failed: ${message}`)
}

function boundaryIn(timeZone: string, instant: number) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      hourCycle: "h23",
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  )
  const offset =
    values.timeZoneName === "GMT" || values.timeZoneName === "UTC" ? "+00:00" : values.timeZoneName?.replace(/^GMT/, "")
  requireEvidence(offset && /^[+-]\d{2}:\d{2}$/.test(offset), `could not resolve an offset for ${timeZone}`)
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}.${values.fractionalSecond}${offset}`
}

function completedRetainedTools(messages: readonly SessionV1.WithParts[]) {
  return messages
    .flatMap((message) => message.parts)
    .filter(
      (part): part is CompletedToolPart =>
        part.type === "tool" && part.tool === capability && part.state.status === "completed",
    )
}

function terminalProjection(part: CompletedToolPart) {
  const projected = part as unknown as ToolPart
  return {
    inline: toolInlineInfo(projected),
    final: entryBody({
      kind: "tool",
      text: "",
      phase: "final",
      source: "tool",
      tool: part.tool,
      toolState: "completed",
      part: projected,
    } satisfies StreamCommit),
  }
}

function conciseText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 800)
}

try {
  const evidence = await AppRuntime.runPromise(
    InstanceStore.Service.use((store) =>
      store.load({ directory: process.cwd() }).pipe(
        Effect.flatMap((ctx) =>
          Effect.gen(function* () {
            const database = yield* Database.Service
            const prompts = yield* SessionPrompt.Service
            const sessions = yield* Session.Service

            const runTurn = Effect.fn("Gate15RealModel.runTurn")(function* (input: {
              readonly label: string
              readonly sessionID: SessionID
              readonly text: string
              readonly title?: string
              readonly allowRetained?: boolean
            }) {
              const before = yield* sessions
                .messages({ sessionID: input.sessionID })
                .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed([])))
              const turnID = Turn.ID.create()
              yield* prompts.start({
                sessionID: input.sessionID,
                turnID,
                inputID: Turn.InputID.create(),
                messageID: MessageID.ascending(),
                agent: "repa",
                model,
                limits: input.allowRetained ? { model: 3, tool: 2 } : { model: 1, tool: 0 },
                ...(input.title
                  ? {
                      session: {
                        title: input.title,
                        permission: input.allowRetained ? retainedOnly : noTools,
                      },
                    }
                  : {}),
                parts: [{ type: "text", text: input.text }],
              })
              const terminal = yield* prompts.awaitTurn(input.sessionID, turnID)
              requireEvidence(terminal.terminal, `${input.label} did not terminalize`)
              requireEvidence(
                terminal.terminal.outcome === "completed",
                `${input.label} terminated as ${terminal.terminal.outcome}/${terminal.terminal.reason}`,
              )
              const operations = yield* database.db
                .select({
                  assistantMessageID: TurnModelOperationTable.assistant_message_id,
                  ordinal: TurnModelOperationTable.ordinal,
                })
                .from(TurnModelOperationTable)
                .where(eq(TurnModelOperationTable.turn_id, turnID))
                .orderBy(asc(TurnModelOperationTable.ordinal))
                .all()
                .pipe(Effect.orDie)
              const cuts = yield* Effect.forEach(operations, (operation) =>
                database.db.transaction((tx) => RetainedSteering.readCut(tx, operation.assistantMessageID)),
              )
              requireEvidence(
                cuts.every((cut) => cut.type === "available"),
                `${input.label} did not retain every eligible model-operation cut`,
              )
              const messages = yield* sessions.messages({ sessionID: input.sessionID })
              const operationIDs = new Set(operations.map((operation) => operation.assistantMessageID))
              const assistantMessages = messages.filter(
                (message) => message.info.role === "assistant" && operationIDs.has(message.info.id),
              )
              const text = assistantMessages
                .flatMap((message) => message.parts)
                .filter((part): part is SessionV1.TextPart => part.type === "text")
                .map((part) => conciseText(part.text))
                .filter(Boolean)
              return {
                label: input.label,
                sessionID: input.sessionID,
                turnID,
                priorSessionMessages: before.length,
                sessionMessages: messages.length,
                terminal: { outcome: terminal.terminal.outcome, reason: terminal.terminal.reason },
                assistants: assistantMessages.map((message) => ({
                  id: message.info.id,
                  finish: message.info.role === "assistant" ? message.info.finish : undefined,
                  tokens: message.info.role === "assistant" ? message.info.tokens : undefined,
                })),
                text,
                tools: completedRetainedTools(assistantMessages),
                cuts: cuts.map((read) => {
                  requireEvidence(read.type === "available", `${input.label} stored an unavailable cut`)
                  return read.cut
                }),
              }
            })

            const snapshot = (asOf = Date.now()) =>
              database.db.transaction((tx) => RetainedSteering.readActiveSnapshot(tx, asOf))

            const negativeSessionID = SessionID.create()
            const negative = yield* runTurn({
              label: "course-local-negative",
              sessionID: negativeSessionID,
              title: "Gate 15 Course-specific negative qualification",
              allowRetained: true,
              text: "In this algebra Course, today do not quiz me. Explain completing the square with one worked example in under 100 words.",
            })
            const afterNegative = yield* snapshot()
            requireEvidence(negative.tools.length === 0, "Course-local language invoked learning-wide retention")
            requireEvidence(afterNegative.items.length === 0, "Course-local language created cross-Course policy")
            requireEvidence(negative.text.length > 0, "Course-local request did not receive a useful continuation")

            const sourceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
            requireEvidence(sourceTimeZone, "the positive source timezone was unavailable")
            const validUntilInstant = Date.now() + windowMilliseconds
            const validUntil = boundaryIn(sourceTimeZone, validUntilInstant)
            const positiveSessionID = SessionID.create()
            const positiveSource = `Across all my learning until ${validUntil}, do not quiz me. Teach me why multiplying two negative numbers gives a positive number using a concrete analogy, and continue teaching after saving this instruction. Keep the explanation under 120 words.`
            const positive = yield* runTurn({
              label: "learning-wide-create",
              sessionID: positiveSessionID,
              title: "Gate 15 learning-wide positive qualification",
              allowRetained: true,
              text: positiveSource,
            })
            requireEvidence(
              positive.tools.length === 1,
              "explicit learning-wide source did not commit exactly one tool result",
            )
            const create = positive.tools[0]!
            const createInput = create.state.input as Record<string, unknown>
            requireEvidence(createInput.action === "create", "positive tool result was not a create")
            requireEvidence(
              typeof createInput.sourceExcerpt === "string" && positiveSource.includes(createInput.sourceExcerpt),
              "positive tool source excerpt was not exact learner text",
            )
            requireEvidence(
              createInput.validUntil === validUntil,
              "positive tool did not preserve the exact finite boundary",
            )
            requireEvidence(create.state.metadata.outcome === "applied", "positive tool did not apply")
            requireEvidence(
              positive.text.length > 0,
              "Tutor did not continue with a useful compatible move after commit",
            )
            const afterCreate = yield* snapshot()
            requireEvidence(afterCreate.items.length === 1, "positive trace did not produce one active policy")
            const created = afterCreate.items[0]!
            requireEvidence(created.transition.version === 1, "created policy did not begin at version 1")
            requireEvidence(
              created.source.originSessionID === positiveSessionID,
              "created policy did not preserve the positive source Session",
            )
            requireEvidence(
              positive.cuts.at(-1)?.items.some((item) => item.transitionID === created.transition.id),
              "post-commit continuation did not receive the committed exact policy cut",
            )

            const freshSessionID = SessionID.create()
            const fresh = yield* runTurn({
              label: "fresh-session-retained-policy",
              sessionID: freshSessionID,
              title: "Gate 15 fresh Session retained-policy sample",
              text: "Teach me why a square's diagonals are perpendicular. Choose a useful move and keep it under 100 words.",
            })
            requireEvidence(fresh.priorSessionMessages === 0, "fresh Session imported old transcript messages")
            requireEvidence(
              fresh.cuts[0]?.items.some((item) => item.transitionID === created.transition.id),
              "fresh Session did not receive the exact retained revision",
            )
            requireEvidence(fresh.text.length > 0, "fresh Session did not produce a useful compatible response")

            const exceptionRevision = afterCreate.steeringRevision
            const exceptionSessionID = SessionID.create()
            const exception = yield* runTurn({
              label: "one-turn-specific-exception",
              sessionID: exceptionSessionID,
              title: "Gate 15 one-Turn specific exception",
              text: "For this turn only, override the no-quiz condition and give me exactly one tiny assessment question about square diagonals. Do not answer it for me.",
            })
            requireEvidence(
              exception.cuts[0]?.items.some((item) => item.transitionID === created.transition.id),
              "current exception did not receive the retained policy it locally overrode",
            )
            requireEvidence(
              exception.text.join(" ").includes("?"),
              "current exception did not offer the requested assessment",
            )
            const afterException = yield* snapshot()
            requireEvidence(
              afterException.steeringRevision === exceptionRevision &&
                afterException.items[0]?.transition.id === created.transition.id,
              "one-Turn exception erased or revised retained state",
            )

            const laterSessionID = SessionID.create()
            const later = yield* runTurn({
              label: "later-turn-policy-returns",
              sessionID: laterSessionID,
              title: "Gate 15 later retained-policy sample",
              text: "Teach me the same square-diagonal idea with a different useful move. Keep it under 100 words.",
            })
            requireEvidence(
              later.cuts[0]?.items.some((item) => item.transitionID === created.transition.id),
              "later Turn did not receive the retained policy again",
            )
            requireEvidence(later.text.length > 0, "later Turn did not continue teaching")

            requireEvidence(
              Date.now() < validUntilInstant - 30_000,
              "real-provider trace exhausted its correction window",
            )
            const correctionSessionID = SessionID.create()
            const correctionSource = `Across all my learning until ${validUntil}, replace that retained rule: after a short explanation, offer exactly one optional one-question check. Keep teaching after saving the correction.`
            const correction = yield* runTurn({
              label: "explicit-correction",
              sessionID: correctionSessionID,
              title: "Gate 15 explicit retained-policy correction",
              allowRetained: true,
              text: correctionSource,
            })
            requireEvidence(correction.tools.length === 1, "explicit correction did not commit exactly one tool result")
            const replace = correction.tools[0]!
            const replaceInput = replace.state.input as Record<string, unknown>
            requireEvidence(replaceInput.action === "replace", "explicit correction was not a replace")
            requireEvidence(
              replaceInput.policyID === created.transition.policyID,
              "explicit correction targeted a different policy",
            )
            requireEvidence(
              replaceInput.expectedHeadID === created.transition.id,
              "explicit correction used the wrong head",
            )
            requireEvidence(replaceInput.expectedVersion === 1, "explicit correction used the wrong version")
            requireEvidence(replaceInput.validUntil === validUntil, "explicit correction changed the finite boundary")
            requireEvidence(replace.state.metadata.outcome === "applied", "explicit correction did not apply")
            const afterCorrection = yield* snapshot()
            requireEvidence(afterCorrection.items.length === 1, "explicit correction changed policy cardinality")
            const corrected = afterCorrection.items[0]!
            requireEvidence(
              corrected.transition.policyID === created.transition.policyID,
              "explicit correction forked policy identity",
            )
            requireEvidence(
              corrected.transition.version === 2 && corrected.transition.predecessorID === created.transition.id,
              "explicit correction did not create the next linear revision",
            )
            requireEvidence(
              correction.cuts.at(-1)?.items.some((item) => item.transitionID === corrected.transition.id),
              "post-correction continuation did not receive revision 2",
            )

            const correctedSampleSessionID = SessionID.create()
            const correctedSample = yield* runTurn({
              label: "corrected-next-sample",
              sessionID: correctedSampleSessionID,
              title: "Gate 15 corrected-policy sample",
              text: "Teach me why zero factorial equals one in under 100 words.",
            })
            requireEvidence(
              correctedSample.cuts[0]?.items.some((item) => item.transitionID === corrected.transition.id),
              "next sample did not receive corrected revision 2",
            )
            requireEvidence(correctedSample.text.length > 0, "corrected next sample did not continue teaching")

            const remaining = validUntilInstant + 1_000 - Date.now()
            if (remaining > 0) yield* Effect.sleep(remaining)
            const beforeExpirySample = yield* snapshot(validUntilInstant)
            requireEvidence(beforeExpirySample.items.length === 0, "exact expiry boundary still exposed the policy")
            const expirySessionID = SessionID.create()
            const expired = yield* runTurn({
              label: "fresh-sample-after-expiry",
              sessionID: expirySessionID,
              title: "Gate 15 expired-policy sample",
              text: "Teach me one concise intuition for conditional probability.",
            })
            requireEvidence(expired.cuts[0]?.items.length === 0, "fresh sample after expiry still received policy")
            const expiredPolicy = yield* database.db.transaction((tx) =>
              RetainedSteering.readPolicy(tx, { policyID: created.transition.policyID, asOf: Date.now() }),
            )
            requireEvidence(expiredPolicy.head?.status === "operative_expired", "policy history did not report expiry")
            requireEvidence(
              expiredPolicy.steeringRevision === afterCorrection.steeringRevision,
              "expiry sample created a policy transition",
            )

            return {
              run: "gate15-openai-oauth-real-model-01",
              provider: "openai",
              model: "gpt-5.5",
              sourceTimeZone,
              validUntil,
              policy: {
                id: created.transition.policyID,
                createdTransitionID: created.transition.id,
                correctedTransitionID: corrected.transition.id,
                finalVersion: corrected.transition.version,
                finalStatus: expiredPolicy.head.status,
                steeringRevision: expiredPolicy.steeringRevision,
              },
              qualification: {
                negative: {
                  sessionID: negative.sessionID,
                  turnID: negative.turnID,
                  toolCalls: negative.tools.length,
                  activePoliciesAfter: afterNegative.items.length,
                  response: negative.text,
                },
                positive: {
                  sessionID: positive.sessionID,
                  turnID: positive.turnID,
                  action: createInput.action,
                  sourceExcerpt: createInput.sourceExcerpt,
                  operativeInstruction: createInput.operativeInstruction,
                  validUntil: createInput.validUntil,
                  acknowledgement: terminalProjection(create),
                  response: positive.text,
                  postCommitCut: positive.cuts.at(-1)?.fingerprint,
                },
              },
              continuation: {
                freshSession: {
                  sessionID: fresh.sessionID,
                  priorMessages: fresh.priorSessionMessages,
                  cutFingerprint: fresh.cuts[0]?.fingerprint,
                  transitionIDs: fresh.cuts[0]?.items.map((item) => item.transitionID),
                  response: fresh.text,
                },
                currentException: {
                  cutFingerprint: exception.cuts[0]?.fingerprint,
                  steeringRevisionAfter: afterException.steeringRevision,
                  response: exception.text,
                },
                laterTurn: {
                  cutFingerprint: later.cuts[0]?.fingerprint,
                  response: later.text,
                },
              },
              correction: {
                action: replaceInput.action,
                policyID: replaceInput.policyID,
                expectedHeadID: replaceInput.expectedHeadID,
                expectedVersion: replaceInput.expectedVersion,
                acknowledgement: terminalProjection(replace),
                postCommitCut: correction.cuts.at(-1)?.fingerprint,
                nextSampleCut: correctedSample.cuts[0]?.fingerprint,
                nextSampleResponse: correctedSample.text,
              },
              expiry: {
                exactBoundaryActiveItems: beforeExpirySample.items.length,
                freshSessionID: expired.sessionID,
                cutFingerprint: expired.cuts[0]?.fingerprint,
                activeItems: expired.cuts[0]?.items.length,
                response: expired.text,
              },
            }
          }).pipe(Effect.scoped, Effect.provideService(InstanceRef, ctx), Effect.ensuring(store.dispose(ctx))),
        ),
      ),
    ),
  )
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  await import("../src/server/server").then(({ Server }) => Server.disposeDefault()).catch(() => {})
  await AppRuntime.dispose()
}
