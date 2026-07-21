import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { AdmittedLearnerOccurrenceTable } from "@opencode-ai/core/learning-command/occurrence.sql"
import { LearningCommandInvocationTable } from "@opencode-ai/core/learning-command/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { and, eq } from "drizzle-orm"
import { Effect, Exit, Layer } from "effect"
import { isDeepStrictEqual } from "node:util"
import { entryBody } from "../src/cli/cmd/run/entry.body"
import { toolInlineInfo, toolPermissionInfo } from "../src/cli/cmd/run/tool"
import type { StreamCommit } from "../src/cli/cmd/run/types"
import { AppRuntime } from "../src/effect/app-runtime"
import { InstanceRef } from "../src/effect/instance-ref"
import { EventV2Bridge } from "../src/event-v2-bridge"
import { Permission } from "../src/permission"
import { InstanceStore } from "../src/project/instance-store"
import { MessageID, SessionID } from "../src/session/schema"
import { Session } from "../src/session/session"
import { SessionPrompt } from "../src/session/prompt"

if (process.env.REPA_GATE16_REAL_MODEL_APPROVED !== "1") {
  throw new Error("Set REPA_GATE16_REAL_MODEL_APPROVED=1 only after explicit maintainer authorization")
}
if (!process.env.REPA_CONFIG_CONTENT || !process.env.REPA_AUTH_CONTENT || !process.env.REPA_DB) {
  throw new Error("The real-model evidence run requires isolated config, auth projection, and database inputs")
}

const capability = LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY
const model = {
  providerID: ProviderV2.ID.openai,
  modelID: ModelV2.ID.make("gpt-5.5"),
}
const goalOnly = [
  { permission: "*", pattern: "*", action: "deny" as const },
  { permission: capability, pattern: LearnerGoal.PERMISSION_PATTERN, action: "allow" as const },
]
const targetDate = "2026-09-15"
const targetTimeZone = "Asia/Shanghai"

type CompletedToolPart = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }
type GoalInvocationRow = typeof LearningCommandInvocationTable.$inferSelect

type ConfirmationExpectation = Readonly<{
  label: string
  sessionID: SessionID
  goalsBefore: number
  validate: (confirmation: LearnerGoal.ConfirmationSnapshot, surface: string) => void
}>

function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Gate 16 real-model evidence failed: ${message}`)
}

function conciseText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function textDigest(value: readonly string[]) {
  return new Bun.CryptoHasher("sha256").update(value.join("\n")).digest("hex")
}

function toolParts(messages: readonly SessionV1.WithParts[]) {
  return messages.flatMap((message) => message.parts).filter((part): part is SessionV1.ToolPart => part.type === "tool")
}

function completedGoalTools(messages: readonly SessionV1.WithParts[]) {
  return toolParts(messages).filter(
    (part): part is CompletedToolPart => part.tool === capability && part.state.status === "completed",
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

function stableGoalPermissionRequestID(partID: SessionV1.PartID, callID: string) {
  const digest = new Bun.CryptoHasher("sha256")
    .update(JSON.stringify({ command: capability, partID, callID }))
    .digest("hex")
  return PermissionV1.ID.ascending(`per_${digest.slice(0, 26)}`)
}

function forbiddenGoalKeys(value: unknown, path = "candidate"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenGoalKeys(item, `${path}[${index}]`))
  if (!value || typeof value !== "object") return []
  const forbidden = new Set([
    "assignment",
    "assignments",
    "priority",
    "priorities",
    "schedule",
    "schedules",
    "mastery",
    "evidence",
  ])
  return Object.entries(value).flatMap(([key, item]) => [
    ...(forbidden.has(key.toLowerCase()) ? [`${path}.${key}`] : []),
    ...forbiddenGoalKeys(item, `${path}.${key}`),
  ])
}

function goalProjection(goal: LearnerGoal.GoalRead) {
  return {
    goalID: goal.goalID,
    revisionID: goal.head.id,
    version: goal.head.version,
    outcome: goal.head.outcome,
    conditions: goal.head.conditions,
    scope: goal.head.scope,
    target: goal.head.target,
    targetRelation: goal.head.targetRelation,
    disposition: goal.head.disposition,
    fieldBases: goal.head.fieldBases,
    occurrenceID: goal.head.occurrenceID,
    effectID: goal.head.effectID,
  }
}

function topicKind(goal: Pick<LearnerGoal.Revision, "outcome" | "conditions">) {
  const text = `${goal.outcome} ${goal.conditions.join(" ")}`.toLowerCase()
  if (/virtual memory|page replacement|address translation/.test(text)) return "virtual-memory"
  if (/cpu scheduling|scheduling algorithm|round[- ]robin|process scheduling/.test(text)) return "cpu-scheduling"
  return "unknown"
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
            const events = yield* EventV2Bridge.Service
            const permission = yield* Permission.Service

            const readGoals = (asOf = Date.now()) => database.db.transaction((tx) => LearnerGoal.discover(tx, asOf))

            const courseLayer = LayerNode.compile(Course.node, [
              [Database.node, Layer.succeed(Database.Service, database)],
            ])
            const course = yield* Course.Service.use((courses) =>
              courses.createCourse({ title: "Operating Systems" }),
            ).pipe(Effect.provide(courseLayer))
            requireEvidence((yield* readGoals()).items.length === 0, "the isolated Goal owner was not empty")

            let expectedConfirmation: ConfirmationExpectation | undefined
            const permissionFailures: string[] = []
            const confirmationCaptures: Array<{
              label: string
              requestID: PermissionV1.ID
              sessionID: SessionID
              tool: { messageID: string; callID: string }
              request: {
                permission: string
                patterns: readonly string[]
                always: readonly string[]
                onceOnly: boolean
                authorizationBasis: string
              }
              preCommit: {
                invocationStatus: GoalInvocationRow["status"]
                goalEffectID: GoalInvocationRow["goal_effect_id"]
                ownerGoalCount: number
                durableDraftPersisted: boolean
              }
              confirmation: LearnerGoal.ConfirmationSnapshot
              surface: { title: string; lines: readonly string[] }
              reply: "once"
            }> = []

            const unsubscribe = yield* events.listen((event) => {
              if (event.type !== Permission.Event.Asked.type) return Effect.void
              return Effect.gen(function* () {
                const request = event.data as PermissionV1.Request
                const expected = expectedConfirmation
                if (!expected) {
                  permissionFailures.push("unexpected permission prompt")
                  yield* permission.reply({ requestID: request.id, reply: "reject" }).pipe(Effect.orDie)
                  return
                }

                const attempt = yield* Effect.gen(function* () {
                  requireEvidence(request.sessionID === expected.sessionID, `${expected.label} used another Session`)
                  requireEvidence(
                    request.permission === capability,
                    `${expected.label} prompted for another capability`,
                  )
                  requireEvidence(
                    isDeepStrictEqual(request.patterns, [LearnerGoal.PERMISSION_PATTERN]),
                    `${expected.label} used another permission pattern`,
                  )
                  requireEvidence(request.always.length === 0, `${expected.label} offered persistent approval`)
                  requireEvidence(request.metadata.onceOnly === true, `${expected.label} was not once-only`)
                  requireEvidence(
                    request.metadata.authorizationBasis === "learner_acceptance",
                    `${expected.label} had another authorization basis`,
                  )
                  const requestTool = request.tool
                  requireEvidence(requestTool, `${expected.label} lost its exact tool path`)
                  const invocation = yield* database.db
                    .select()
                    .from(LearningCommandInvocationTable)
                    .where(
                      and(
                        eq(LearningCommandInvocationTable.assistant_message_id, MessageID.make(requestTool.messageID)),
                        eq(LearningCommandInvocationTable.provider_call_id, requestTool.callID),
                      ),
                    )
                    .get()
                    .pipe(Effect.orDie)
                  requireEvidence(invocation, `${expected.label} had no admitted invocation`)
                  requireEvidence(
                    invocation.session_id === request.sessionID,
                    `${expected.label} invocation changed Session`,
                  )
                  requireEvidence(invocation.status === "admitted", `${expected.label} committed before confirmation`)
                  requireEvidence(
                    invocation.goal_effect_id === null,
                    `${expected.label} had a Goal effect before confirmation`,
                  )
                  requireEvidence(invocation.settlement === null, `${expected.label} settled before confirmation`)
                  requireEvidence(
                    invocation.authorization_basis === "learner_acceptance",
                    `${expected.label} invocation lost accepted authority`,
                  )
                  requireEvidence(
                    invocation.permission_request_id === request.id,
                    `${expected.label} invocation lost its permission request`,
                  )
                  requireEvidence(
                    request.id === stableGoalPermissionRequestID(invocation.part_id, invocation.provider_call_id),
                    `${expected.label} permission ID was not the exact stable tool-path ID`,
                  )
                  const confirmation = request.metadata.confirmation as LearnerGoal.ConfirmationSnapshot
                  requireEvidence(
                    confirmation?.schemaVersion === LearnerGoal.SCHEMA_VERSION,
                    `${expected.label} had a malformed confirmation`,
                  )
                  requireEvidence(
                    invocation.goal_confirmation_snapshot === null,
                    `${expected.label} persisted a forbidden durable draft before learner approval`,
                  )
                  const owner = yield* readGoals()
                  requireEvidence(
                    owner.items.length === expected.goalsBefore,
                    `${expected.label} changed Goal owner state before confirmation`,
                  )
                  const surface = toolPermissionInfo(
                    request.permission,
                    { ...request.metadata },
                    { ...request.metadata },
                    [...request.patterns],
                  )
                  requireEvidence(surface, `${expected.label} had no exact CLI confirmation surface`)
                  const surfaceText = [surface.title, ...surface.lines].join("\n")
                  requireEvidence(
                    surfaceText.includes("one-time learner acceptance"),
                    `${expected.label} surface did not say one-time acceptance`,
                  )
                  expected.validate(confirmation, surfaceText)
                  return {
                    label: expected.label,
                    requestID: request.id,
                    sessionID: request.sessionID,
                    tool: { messageID: requestTool.messageID, callID: requestTool.callID },
                    request: {
                      permission: request.permission,
                      patterns: [...request.patterns],
                      always: [...request.always],
                      onceOnly: request.metadata.onceOnly === true,
                      authorizationBasis: String(request.metadata.authorizationBasis),
                    },
                    preCommit: {
                      invocationStatus: invocation.status,
                      goalEffectID: invocation.goal_effect_id,
                      ownerGoalCount: owner.items.length,
                      durableDraftPersisted: invocation.goal_confirmation_snapshot !== null,
                    },
                    confirmation,
                    surface: { title: surface.title, lines: [...surface.lines] },
                    reply: "once" as const,
                  }
                }).pipe(Effect.exit)

                expectedConfirmation = undefined
                if (Exit.isFailure(attempt)) {
                  permissionFailures.push(`${expected.label} exact confirmation validation failed`)
                  yield* permission.reply({ requestID: request.id, reply: "reject" }).pipe(Effect.orDie)
                  return
                }
                confirmationCaptures.push(attempt.value)
                yield* permission.reply({ requestID: request.id, reply: "once" }).pipe(Effect.orDie)
              })
            })
            yield* Effect.addFinalizer(() => unsubscribe)

            const runTurn = Effect.fn("Gate16RealModel.runTurn")(function* (input: {
              readonly label: string
              readonly sessionID: SessionID
              readonly text: string
              readonly title?: string
            }) {
              const before = yield* sessions
                .messages({ sessionID: input.sessionID })
                .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed([])))
              const beforeIDs = new Set(before.map((message) => message.info.id))
              const turnID = Turn.ID.create()
              yield* prompts.start({
                sessionID: input.sessionID,
                turnID,
                inputID: Turn.InputID.create(),
                messageID: MessageID.ascending(),
                agent: "repa",
                model,
                limits: { model: 5, tool: 3 },
                ...(input.title ? { session: { title: input.title, permission: goalOnly } } : {}),
                parts: [{ type: "text", text: input.text }],
              })
              const terminal = yield* prompts.awaitTurn(input.sessionID, turnID)
              requireEvidence(terminal.terminal, `${input.label} did not terminalize`)
              requireEvidence(
                terminal.terminal.outcome === "completed",
                `${input.label} terminated as ${terminal.terminal.outcome}/${terminal.terminal.reason}`,
              )
              const messages = yield* sessions.messages({ sessionID: input.sessionID })
              const current = messages.filter((message) => !beforeIDs.has(message.info.id))
              const assistants = current.filter((message) => message.info.role === "assistant")
              const text = assistants
                .flatMap((message) => message.parts)
                .filter((part): part is SessionV1.TextPart => part.type === "text")
                .map((part) => conciseText(part.text))
                .filter(Boolean)
              return {
                label: input.label,
                sessionID: input.sessionID,
                turnID,
                messages,
                current,
                text,
                tools: toolParts(assistants),
                goalTools: completedGoalTools(assistants),
              }
            })

            const captureToolPath = Effect.fn("Gate16RealModel.captureToolPath")(function* (
              messages: readonly SessionV1.WithParts[],
              part: CompletedToolPart,
            ) {
              const invocation = yield* database.db
                .select()
                .from(LearningCommandInvocationTable)
                .where(eq(LearningCommandInvocationTable.part_id, part.id))
                .get()
                .pipe(Effect.orDie)
              requireEvidence(invocation, `tool ${part.id} lost its invocation row`)
              const occurrence = yield* database.db
                .select()
                .from(AdmittedLearnerOccurrenceTable)
                .where(eq(AdmittedLearnerOccurrenceTable.id, invocation.occurrence_id))
                .get()
                .pipe(Effect.orDie)
              requireEvidence(occurrence, `tool ${part.id} lost its source occurrence`)
              const assistant = messages.find((message) => message.info.id === invocation.assistant_message_id)
              const parent = messages.find((message) => message.info.id === invocation.parent_user_message_id)
              requireEvidence(assistant?.info.role === "assistant", `tool ${part.id} lost its assistant message`)
              requireEvidence(parent?.info.role === "user", `tool ${part.id} lost its parent learner message`)
              requireEvidence(
                assistant.info.parentID === invocation.parent_user_message_id,
                `tool ${part.id} assistant parent diverged`,
              )
              requireEvidence(part.messageID === invocation.assistant_message_id, `tool ${part.id} message diverged`)
              requireEvidence(part.callID === invocation.provider_call_id, `tool ${part.id} call diverged`)
              requireEvidence(part.sessionID === invocation.session_id, `tool ${part.id} Session diverged`)
              requireEvidence(invocation.turn_id && invocation.input_id, `tool ${part.id} lost its Turn path`)
              requireEvidence(invocation.command_name === capability, `tool ${part.id} changed command name`)
              requireEvidence(invocation.command_version === 1, `tool ${part.id} changed command version`)
              requireEvidence(invocation.capability_identity === capability, `tool ${part.id} changed capability`)
              requireEvidence(invocation.capability_version === 1, `tool ${part.id} changed capability version`)
              requireEvidence(invocation.status === "applied", `tool ${part.id} was not applied`)
              requireEvidence(invocation.goal_effect_id, `tool ${part.id} lost its Goal effect`)
              requireEvidence(
                occurrence.origin_session_id === invocation.session_id &&
                  occurrence.origin_message_id === invocation.parent_user_message_id,
                `tool ${part.id} occurrence did not name its exact learner source`,
              )
              const input = part.state.input as Record<string, unknown>
              requireEvidence(
                input.authorizationBasis === invocation.authorization_basis,
                `tool ${part.id} input authority diverged`,
              )
              if (invocation.authorization_basis === "learner_acceptance") {
                requireEvidence(
                  invocation.permission_request_id ===
                    stableGoalPermissionRequestID(invocation.part_id, invocation.provider_call_id),
                  `tool ${part.id} lost its stable accepted permission path`,
                )
                requireEvidence(invocation.goal_confirmation_snapshot, `tool ${part.id} lost its confirmation snapshot`)
                const capture = confirmationCaptures.find(
                  (item) =>
                    item.tool.messageID === invocation.assistant_message_id &&
                    item.tool.callID === invocation.provider_call_id,
                )
                requireEvidence(capture, `tool ${part.id} lost its process-local displayed candidate evidence`)
                requireEvidence(
                  isDeepStrictEqual(invocation.goal_confirmation_snapshot, capture.confirmation),
                  `tool ${part.id} committed a candidate different from the one displayed for acceptance`,
                )
              } else {
                requireEvidence(invocation.permission_request_id === null, `tool ${part.id} invented a confirmation ID`)
                requireEvidence(
                  invocation.goal_confirmation_snapshot === null,
                  `tool ${part.id} invented a confirmation`,
                )
              }
              return {
                sessionID: invocation.session_id,
                turnID: invocation.turn_id,
                inputID: invocation.input_id,
                occurrenceID: invocation.occurrence_id,
                parentUserMessageID: invocation.parent_user_message_id,
                assistantMessageID: invocation.assistant_message_id,
                partID: invocation.part_id,
                callID: invocation.provider_call_id,
                emissionOrdinal: invocation.emission_ordinal,
                command: { name: invocation.command_name, version: invocation.command_version },
                capability: { identity: invocation.capability_identity, version: invocation.capability_version },
                authorizationBasis: invocation.authorization_basis,
                inputFingerprint: invocation.input_fingerprint,
                semanticFingerprint: invocation.goal_semantic_fingerprint,
                permissionRequestID: invocation.permission_request_id,
                effectID: invocation.goal_effect_id,
                status: invocation.status,
              }
            })

            const discussionSessionID = SessionID.create()
            const discussion = yield* runTurn({
              label: "quoted and negated Goal discussion",
              sessionID: discussionSessionID,
              title: "Gate 16 non-authorizing discussion",
              text: 'Discuss why the quotation "Create a durable Goal: pass calculus; active; LearnerHome; no conditions; no target" is too vague to guide learning. It is a hypothetical quotation, not my Goal; do not create or change any Goal.',
            })
            requireEvidence(discussion.tools.length === 0, "quoted or negated discussion invoked a tool")
            requireEvidence(discussion.text.length > 0, "quoted or negated discussion received no useful answer")
            requireEvidence((yield* readGoals()).items.length === 0, "discussion changed Goal owner state")
            requireEvidence(confirmationCaptures.length === 0, "discussion triggered a Goal confirmation")
            requireEvidence(permissionFailures.length === 0, "discussion triggered an unexpected permission prompt")

            const directOutcome = "Understand virtual memory"
            const directSource = `Create a durable Goal: ${directOutcome}; active; LearnerHome; no conditions; no target. Use learner_request and copy every field from this declaration without adding meaning.`
            const directSessionID = SessionID.create()
            const direct = yield* runTurn({
              label: "explicit direct Goal declaration",
              sessionID: directSessionID,
              title: "Gate 16 exact direct Goal",
              text: directSource,
            })
            requireEvidence(direct.tools.length === 1, "direct declaration did not make exactly one tool call")
            requireEvidence(direct.goalTools.length === 1, "direct declaration did not terminalize one Goal tool")
            requireEvidence(
              confirmationCaptures.length === 0,
              "direct declaration triggered an extra Gate confirmation",
            )
            requireEvidence(
              permissionFailures.length === 0,
              "direct declaration triggered an unexpected permission prompt",
            )
            const directPart = direct.goalTools[0]!
            const directInput = directPart.state.input as Record<string, unknown>
            requireEvidence(
              directInput.authorizationBasis === "learner_request",
              "direct declaration used accepted authority",
            )
            requireEvidence(directPart.state.metadata.outcome === "applied", "direct declaration did not apply")
            const afterDirect = yield* readGoals()
            requireEvidence(afterDirect.items.length === 1, "direct declaration did not create exactly one Goal")
            const directGoal = afterDirect.items[0]!
            requireEvidence(directGoal.head.outcome === directOutcome, "direct declaration changed the exact outcome")
            requireEvidence(directGoal.head.conditions.length === 0, "direct declaration invented conditions")
            requireEvidence(directGoal.head.scope.type === "learner_home", "direct declaration narrowed scope")
            requireEvidence(directGoal.head.target.type === "absent", "direct declaration invented a target")
            requireEvidence(directGoal.head.disposition.type === "active", "direct declaration changed lifecycle")
            const directAcknowledgement = terminalProjection(directPart)
            requireEvidence(
              JSON.stringify(directAcknowledgement).includes(directOutcome),
              "direct acknowledgement omitted exact Goal meaning",
            )
            requireEvidence(
              !JSON.stringify(directAcknowledgement).includes('"receiptID"'),
              "direct acknowledgement exposed raw settlement",
            )

            const examSessionID = SessionID.create()
            const clarification = yield* runTurn({
              label: "ambiguous exam Goal clarification",
              sessionID: examSessionID,
              title: "Gate 16 ambiguous Goal clarification",
              text: "I have an operating-systems exam later this term and may want two durable Goals, but I have not supplied exact outcomes, done conditions, the Course identity, or a target date. Ask the necessary clarification questions only. Do not propose or save any Goal yet.",
            })
            requireEvidence(clarification.tools.length === 0, "ambiguous request wrote or proposed a Goal tool")
            requireEvidence((yield* readGoals()).items.length === 1, "ambiguous request changed Goal owner state")
            requireEvidence(confirmationCaptures.length === 0, "ambiguous request triggered a confirmation")
            requireEvidence(permissionFailures.length === 0, "ambiguous request triggered an unexpected prompt")
            const clarificationText = clarification.text.join(" ")
            const clarifiedDimensions = [
              /outcome|achieve|learn/i.test(clarificationText) ? "outcome" : undefined,
              /condition|done|demonstrate|success/i.test(clarificationText) ? "conditions" : undefined,
              /course/i.test(clarificationText) ? "Course" : undefined,
              /date|deadline|target|when/i.test(clarificationText) ? "target" : undefined,
            ].filter((value): value is string => Boolean(value))
            requireEvidence(
              clarificationText.includes("?") && clarifiedDimensions.length >= 3,
              "ambiguous request did not receive a genuine clarification move",
            )

            expectedConfirmation = {
              label: "two-Goal exam candidate",
              sessionID: examSessionID,
              goalsBefore: 1,
              validate: (confirmation, surface) => {
                requireEvidence(
                  confirmation.authorizationBasis === "learner_acceptance",
                  "exam candidate was not accepted",
                )
                requireEvidence(confirmation.goalBases.length === 0, "exam create candidate claimed current Goal bases")
                requireEvidence(
                  confirmation.command.operations.length === 2,
                  "exam candidate did not contain two operations",
                )
                requireEvidence(
                  confirmation.command.operations.every((operation) => operation.type === "create"),
                  "exam candidate operations were not independent creates",
                )
                for (const operation of confirmation.command.operations) {
                  requireEvidence(operation.type === "create", "exam candidate contained a non-create operation")
                  requireEvidence(operation.disposition === "active", "exam candidate invented lifecycle state")
                  requireEvidence(operation.snapshot.conditions.length > 0, "exam candidate had no done condition")
                  requireEvidence(operation.snapshot.scope.type === "courses", "exam candidate was not Course-scoped")
                  requireEvidence(operation.snapshot.scope.courses.length === 1, "exam candidate widened Course scope")
                  const membership = operation.snapshot.scope.courses[0]!
                  requireEvidence(membership.courseID === course.id, "exam candidate named another Course")
                  requireEvidence(membership.basis.type === "new", "exam candidate did not bind current Course owner")
                  requireEvidence(
                    membership.basis.type === "new" && membership.basis.expectedCourseVersion === course.stateVersion,
                    "exam candidate used another Course version",
                  )
                  requireEvidence(
                    operation.snapshot.target.type === "local_date",
                    "exam candidate used another target kind",
                  )
                  requireEvidence(
                    operation.snapshot.target.type === "local_date" &&
                      operation.snapshot.target.date === targetDate &&
                      operation.snapshot.target.timeZone === targetTimeZone &&
                      operation.snapshot.target.sourceExpression === targetDate &&
                      operation.snapshot.target.normalizationBasis === "explicit_date",
                    "exam candidate changed the exact local-date target",
                  )
                  requireEvidence(
                    operation.snapshot.fieldBases.outcome.type === "accepted" &&
                      operation.snapshot.fieldBases.conditions.type === "accepted",
                    "exam candidate did not mark its model-expanded meaning as accepted",
                  )
                  requireEvidence(
                    operation.snapshot.fieldBases.scope.type === "authored" &&
                      operation.snapshot.fieldBases.scope.sourceExcerpt.includes(course.id) &&
                      operation.snapshot.fieldBases.target.type === "authored" &&
                      operation.snapshot.fieldBases.target.sourceExcerpt.includes(targetDate) &&
                      operation.snapshot.fieldBases.disposition.type === "authored" &&
                      operation.snapshot.fieldBases.disposition.sourceExcerpt.includes("active"),
                    "exam candidate lost exact learner-authored scope, target, or disposition",
                  )
                  requireEvidence(surface.includes(operation.snapshot.outcome), "exam surface omitted an outcome")
                  for (const condition of operation.snapshot.conditions) {
                    requireEvidence(surface.includes(condition), "exam surface omitted a condition")
                  }
                }
                const topics = confirmation.command.operations.map((operation) => topicKind(operation.snapshot))
                requireEvidence(topics.includes("virtual-memory"), "exam candidate omitted virtual memory")
                requireEvidence(topics.includes("cpu-scheduling"), "exam candidate omitted CPU scheduling")
                requireEvidence(confirmation.courseBases.length === 2, "exam candidate omitted exact Course bases")
                requireEvidence(
                  confirmation.courseBases.every(
                    (basis, index) =>
                      basis.operationOrdinal === index &&
                      basis.revisionRole === "source" &&
                      basis.courseID === course.id &&
                      basis.courseTitle === course.title &&
                      basis.admission.type === "new" &&
                      basis.admission.courseVersion === course.stateVersion &&
                      basis.availability.state === "available" &&
                      basis.availability.title === course.title,
                  ),
                  "exam candidate Course bases were not exact and available",
                )
                requireEvidence(surface.includes(course.id), "exam surface omitted the exact Course")
                requireEvidence(surface.includes(targetDate), "exam surface omitted the exact target")
                requireEvidence(
                  forbiddenGoalKeys(confirmation.command).length === 0,
                  "exam candidate added foreign state",
                )
              },
            }
            const examCaptureIndex = confirmationCaptures.length
            const exam = yield* runTurn({
              label: "accepted two-Goal exam candidate",
              sessionID: examSessionID,
              text: `Here are the clarifications. Use only Course "${course.title}" with exact ID ${course.id} at current version ${course.stateVersion}. Use target local date ${targetDate} in time zone ${targetTimeZone}, with sourceExpression exactly ${targetDate} and normalizationBasis explicit_date. I want exactly two independent active durable Goals: one for virtual memory and one for CPU scheduling. You choose and write the exact outcomes and useful done conditions for exam preparation. Because that meaning is model-expanded, do not use learner_request: submit one update_learner_goals candidate with authorizationBasis learner_acceptance and exactly two create operations. Mark the model-chosen outcomes and conditions accepted; preserve my exact Course scope, target, and active disposition with authored source excerpts. Do not create Assignment, priority, schedule, evidence, or mastery state. The host must show the complete exact candidate once before any commit.`,
            })
            requireEvidence(expectedConfirmation === undefined, "exam candidate never reached exact confirmation")
            requireEvidence(permissionFailures.length === 0, "exam candidate failed closed")
            requireEvidence(
              confirmationCaptures.length === examCaptureIndex + 1,
              "exam candidate did not produce exactly one confirmation",
            )
            requireEvidence(exam.tools.length === 1, "exam candidate made more than one tool call")
            requireEvidence(exam.goalTools.length === 1, "exam candidate did not terminalize one Goal tool")
            const examPart = exam.goalTools[0]!
            const examInput = examPart.state.input as Record<string, unknown>
            requireEvidence(examInput.authorizationBasis === "learner_acceptance", "exam tool used direct authority")
            requireEvidence(examPart.state.metadata.outcome === "applied", "exam candidate did not apply")
            const afterExam = yield* readGoals()
            requireEvidence(afterExam.items.length === 3, "exam candidate did not create two independent Goals")
            const examGoals = afterExam.items.filter((goal) => goal.head.source.originSessionID === examSessionID)
            requireEvidence(examGoals.length === 2, "exam candidate Goals lost their exact source Session")
            requireEvidence(
              new Set(examGoals.map((goal) => goal.goalID)).size === 2,
              "exam candidate reused one Goal identity",
            )
            requireEvidence(
              new Set(examGoals.map((goal) => topicKind(goal.head))).size === 2 &&
                examGoals.some((goal) => topicKind(goal.head) === "virtual-memory") &&
                examGoals.some((goal) => topicKind(goal.head) === "cpu-scheduling"),
              "exam candidate did not persist one Goal per requested topic",
            )
            for (const goal of examGoals) {
              requireEvidence(goal.head.disposition.type === "active", "exam Goal did not remain active")
              requireEvidence(goal.head.scope.type === "courses", "exam Goal lost Course scope")
              requireEvidence(
                goal.head.scope.type === "courses" &&
                  goal.head.scope.courses.length === 1 &&
                  goal.head.scope.courses[0]?.courseID === course.id,
                "exam Goal stored another Course",
              )
              requireEvidence(
                goal.head.target.type === "local_date" &&
                  goal.head.target.date === targetDate &&
                  goal.head.target.timeZone === targetTimeZone,
                "exam Goal stored another target",
              )
              requireEvidence(forbiddenGoalKeys(goal.head).length === 0, "exam Goal stored foreign state")
            }

            const virtualGoal = examGoals.find((goal) => topicKind(goal.head) === "virtual-memory")!
            requireEvidence(virtualGoal, "virtual-memory Goal was unavailable for correction")
            const correctionOutcome = "Explain virtual-memory translation and replacement under exam conditions"
            const correctionSessionID = examSessionID
            expectedConfirmation = {
              label: "later contextual Goal correction",
              sessionID: correctionSessionID,
              goalsBefore: 3,
              validate: (confirmation, surface) => {
                requireEvidence(confirmation.authorizationBasis === "learner_acceptance", "correction was not accepted")
                requireEvidence(
                  confirmation.command.operations.length === 1,
                  "correction contained multiple operations",
                )
                const operation = confirmation.command.operations[0]!
                requireEvidence(operation.type === "update", "correction was not an update")
                requireEvidence(operation.goalID === virtualGoal.goalID, "correction named another Goal")
                requireEvidence(operation.expectedHeadID === virtualGoal.head.id, "correction named another head")
                requireEvidence(
                  operation.expectedVersion === virtualGoal.head.version,
                  "correction named another version",
                )
                requireEvidence(
                  operation.snapshot.outcome === correctionOutcome,
                  "correction changed the requested outcome",
                )
                requireEvidence(
                  isDeepStrictEqual(operation.snapshot.conditions, virtualGoal.head.conditions),
                  "correction changed conditions",
                )
                requireEvidence(operation.snapshot.scope.type === "courses", "correction changed scope kind")
                const membership = operation.snapshot.scope.courses[0]
                requireEvidence(
                  operation.snapshot.scope.courses.length === 1 &&
                    membership?.courseID === course.id &&
                    membership.basis.type === "carried" &&
                    membership.basis.predecessorRevisionID === virtualGoal.head.id,
                  "correction did not carry exact Course scope",
                )
                requireEvidence(
                  isDeepStrictEqual(operation.snapshot.target, virtualGoal.head.target),
                  "correction changed target",
                )
                requireEvidence(operation.disposition.type === "active", "correction changed active disposition")
                requireEvidence(
                  operation.snapshot.fieldBases.conditions.type === "accepted" &&
                    operation.snapshot.fieldBases.scope.type === "accepted" &&
                    operation.snapshot.fieldBases.target.type === "accepted" &&
                    operation.snapshot.fieldBases.disposition.type === "carried" &&
                    operation.snapshot.fieldBases.disposition.predecessorRevisionID === virtualGoal.head.id,
                  "correction did not reauthorize dependency-sensitive fields and carry active disposition",
                )
                requireEvidence(
                  operation.snapshot.fieldBases.outcome.type === "authored" &&
                    operation.snapshot.fieldBases.outcome.sourceExcerpt.includes(correctionOutcome),
                  "correction did not preserve the exact learner-authored outcome",
                )
                requireEvidence(confirmation.goalBases.length === 1, "correction omitted its current Goal base")
                requireEvidence(
                  confirmation.goalBases[0]?.goalID === virtualGoal.goalID &&
                    confirmation.goalBases[0]?.revisionID === virtualGoal.head.id &&
                    confirmation.goalBases[0]?.version === virtualGoal.head.version &&
                    confirmation.goalBases[0]?.outcome === virtualGoal.head.outcome &&
                    confirmation.goalBases[0]?.disposition === "active",
                  "correction Goal base was not exact",
                )
                requireEvidence(confirmation.courseBases.length === 1, "correction omitted its carried Course base")
                const courseBase = confirmation.courseBases[0]
                requireEvidence(
                  courseBase?.courseID === course.id &&
                    courseBase.courseTitle === course.title &&
                    courseBase.admission.type === "carried" &&
                    courseBase.admission.predecessorRevisionID === virtualGoal.head.id &&
                    courseBase.availability.state === "available",
                  "correction Course base was not exact and available",
                )
                requireEvidence(surface.includes(virtualGoal.goalID), "correction surface omitted Goal identity")
                requireEvidence(surface.includes(virtualGoal.head.id), "correction surface omitted current head")
                requireEvidence(surface.includes(correctionOutcome), "correction surface omitted new outcome")
                requireEvidence(surface.includes(targetDate), "correction surface omitted preserved target")
                requireEvidence(forbiddenGoalKeys(confirmation.command).length === 0, "correction added foreign state")
              },
            }
            const correctionCaptureIndex = confirmationCaptures.length
            const correction = yield* runTurn({
              label: "later contextual Goal correction",
              sessionID: correctionSessionID,
              text: `Correct durable Goal ${virtualGoal.goalID} at exact head ${virtualGoal.head.id}, version ${virtualGoal.head.version}. Change only its outcome to exactly "${correctionOutcome}" and keep that exact outcome authored from this sentence. Preserve the exact current conditions, Course scope, and target values, but because the outcome changes, reauthorize those three complete fields for the revised meaning with accepted field bases. Keep the Course membership admission carried from predecessor revision ${virtualGoal.head.id}, and carry only the unchanged active disposition field from that predecessor. This correction depends on contextual continuity, so submit exactly one update operation with authorizationBasis learner_acceptance for one-time exact confirmation. Do not create Assignment, priority, schedule, evidence, mastery, or any automatic lifecycle change.`,
            })
            requireEvidence(expectedConfirmation === undefined, "correction never reached exact confirmation")
            requireEvidence(permissionFailures.length === 0, "correction failed closed")
            requireEvidence(
              confirmationCaptures.length === correctionCaptureIndex + 1,
              "correction did not produce exactly one confirmation",
            )
            requireEvidence(correction.tools.length === 1, "correction made more than one tool call")
            requireEvidence(correction.goalTools.length === 1, "correction did not terminalize one Goal tool")
            const correctionPart = correction.goalTools[0]!
            const correctionInput = correctionPart.state.input as Record<string, unknown>
            requireEvidence(
              correctionInput.authorizationBasis === "learner_acceptance",
              "contextual correction incorrectly used direct authority",
            )
            requireEvidence(correctionPart.state.metadata.outcome === "applied", "correction did not apply")

            const afterTarget = Date.parse("2026-09-16T12:00:00+08:00")
            const correctedRead = yield* database.db.transaction((tx) =>
              LearnerGoal.readCurrent(tx, virtualGoal.goalID, afterTarget),
            )
            requireEvidence(correctedRead, "corrected Goal disappeared")
            const correctedGoal = correctedRead.head
            requireEvidence(correctedGoal.id !== virtualGoal.head.id, "correction did not create a new revision")
            requireEvidence(
              correctedGoal.predecessorID === virtualGoal.head.id,
              "correction lost predecessor continuity",
            )
            requireEvidence(
              correctedGoal.version === virtualGoal.head.version + 1,
              "correction did not advance one version",
            )
            requireEvidence(correctedGoal.outcome === correctionOutcome, "Goal read did not expose corrected outcome")
            requireEvidence(
              isDeepStrictEqual(correctedGoal.conditions, virtualGoal.head.conditions),
              "Goal read changed conditions during correction",
            )
            requireEvidence(
              isDeepStrictEqual(correctedGoal.target, virtualGoal.head.target),
              "Goal read changed target",
            )
            requireEvidence(
              correctedGoal.disposition.type === "active",
              "target passage changed lifecycle automatically",
            )
            requireEvidence(
              correctedGoal.targetRelation === "after",
              "trusted later read did not derive target passage",
            )
            requireEvidence(forbiddenGoalKeys(correctedGoal).length === 0, "corrected Goal read exposed foreign state")
            const afterCorrection = yield* readGoals(afterTarget)
            requireEvidence(afterCorrection.items.length === 3, "correction created or removed another Goal")
            const unchanged = afterCorrection.items.filter((goal) => goal.goalID !== virtualGoal.goalID)
            requireEvidence(
              unchanged.some((goal) => goal.goalID === directGoal.goalID && goal.head.id === directGoal.head.id),
              "correction changed the direct Goal",
            )
            requireEvidence(
              unchanged.some((goal) =>
                examGoals.some((examGoal) => examGoal.goalID === goal.goalID && examGoal.head.id === goal.head.id),
              ),
              "correction changed the other exam Goal",
            )

            const directPath = yield* captureToolPath(direct.messages, directPart)
            const examPath = yield* captureToolPath(exam.messages, examPart)
            const correctionPath = yield* captureToolPath(correction.messages, correctionPart)
            requireEvidence(
              directGoal.head.occurrenceID === directPath.occurrenceID,
              "direct Goal lost occurrence path",
            )
            requireEvidence(directGoal.head.effectID === directPath.effectID, "direct Goal lost tool effect path")
            requireEvidence(
              examGoals.every(
                (goal) => goal.head.occurrenceID === examPath.occurrenceID && goal.head.effectID === examPath.effectID,
              ),
              "exam Goals lost their shared atomic occurrence/tool path",
            )
            requireEvidence(
              correctedGoal.occurrenceID === correctionPath.occurrenceID,
              "correction lost occurrence path",
            )
            requireEvidence(correctedGoal.effectID === correctionPath.effectID, "correction lost tool effect path")
            requireEvidence(
              [discussion, direct, clarification, exam, correction]
                .flatMap((turn) => turn.tools)
                .every((part) => part.tool === capability),
              "the guarded carrier invoked a non-Goal tool",
            )
            requireEvidence(
              Number(confirmationCaptures.length) === 2,
              "the carrier did not observe exactly two confirmations",
            )

            const examConfirmation = confirmationCaptures.find(
              (capture) => capture.label === "two-Goal exam candidate",
            )!
            const correctionConfirmation = confirmationCaptures.find(
              (capture) => capture.label === "later contextual Goal correction",
            )!
            requireEvidence(
              examConfirmation && correctionConfirmation,
              "the exact confirmation evidence was incomplete",
            )

            return {
              run: "gate16-openai-oauth-real-model-02",
              provider: "openai",
              model: "gpt-5.5",
              isolatedFixture: {
                courseID: course.id,
                courseTitle: course.title,
                courseVersion: course.stateVersion,
              },
              observations: [
                {
                  id: 1,
                  claim: "direct explicit create commits without an extra Gate confirmation",
                  authorizationBasis: directPath.authorizationBasis,
                  confirmationPrompts: 0,
                  goal: goalProjection(directGoal),
                  acknowledgement: directAcknowledgement,
                },
                {
                  id: 2,
                  claim: "quoted, hypothetical, and negated discussion does not write",
                  toolCalls: discussion.tools.length,
                  ownerGoalsBefore: 0,
                  ownerGoalsAfter: 0,
                  responseCharacters: discussion.text.join("\n").length,
                  responseDigest: textDigest(discussion.text),
                },
                {
                  id: 3,
                  claim: "ambiguity is clarified and the exact model-expanded candidate is visible before commit",
                  clarification: {
                    toolCalls: clarification.tools.length,
                    dimensions: clarifiedDimensions,
                    responseCharacters: clarification.text.join("\n").length,
                    responseDigest: textDigest(clarification.text),
                  },
                  confirmation: examConfirmation,
                },
                {
                  id: 4,
                  claim: "one accepted exam candidate creates two independent exact Course/target Goals only",
                  atomicToolCalls: exam.goalTools.length,
                  goals: examGoals.map(goalProjection),
                  forbiddenStateKeys: examGoals.flatMap((goal) => forbiddenGoalKeys(goal.head)),
                  nonGoalToolCalls: exam.tools.filter((part) => part.tool !== capability).length,
                },
                {
                  id: 5,
                  claim:
                    "each durable change retains its exact occurrence, Turn, message, part, call, authority, and effect path",
                  paths: { direct: directPath, exam: examPath, correction: correctionPath },
                },
                {
                  id: 6,
                  claim: "later correction changes Goal read without foreign state or automatic lifecycle",
                  confirmation: correctionConfirmation,
                  before: goalProjection(virtualGoal),
                  after: goalProjection(correctedRead),
                  trustedReadAfterTarget: { asOf: afterTarget, targetRelation: correctedGoal.targetRelation },
                  forbiddenStateKeys: forbiddenGoalKeys(correctedGoal),
                  ownerGoalCount: afterCorrection.items.length,
                },
              ],
            }
          }).pipe(Effect.scoped, Effect.provideService(InstanceRef, ctx), Effect.ensuring(store.dispose(ctx))),
        ),
      ),
    ),
  )
  const serialized = JSON.stringify(evidence, null, 2)
  for (const secret of [process.env.REPA_CONFIG_CONTENT, process.env.REPA_AUTH_CONTENT]) {
    if (secret.length >= 16)
      requireEvidence(!serialized.includes(secret), "evidence output included an isolated secret input")
  }
  console.log(serialized)
} finally {
  const { Server } = await import("../src/server/server")
  await Server.disposeDefault().catch(() => {})
  await AppRuntime.dispose()
}
