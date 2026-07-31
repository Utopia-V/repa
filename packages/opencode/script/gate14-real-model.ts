import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY } from "@opencode-ai/core/learner-navigation/default-course-v2"
import type { DefaultCourseAgentActionProvenance } from "@opencode-ai/core/learner-navigation/schema"
import {
  LearnerDefaultCourseDispositionTable,
  LearnerDefaultCourseProposalTable,
} from "@opencode-ai/core/learner-navigation/sql"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningCommandInvocationTable } from "@opencode-ai/core/learning-command/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { eq, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { AppRuntime } from "../src/effect/app-runtime"
import { InstanceRef } from "../src/effect/instance-ref"
import { EventV2Bridge } from "../src/event-v2-bridge"
import { Permission } from "../src/permission"
import { InstanceStore } from "../src/project/instance-store"
import { MessageID, SessionID } from "../src/session/schema"
import { Session } from "../src/session/session"
import { SessionPrompt } from "../src/session/prompt"
import { COURSE_QUERY_TOOL_ID, LEARNING_NAVIGATION_QUERY_TOOL_ID } from "../src/tool/course-navigation-query"

if (process.env.REPA_GATE14_REAL_MODEL_APPROVED !== "1") {
  throw new Error("Set REPA_GATE14_REAL_MODEL_APPROVED=1 only for the maintainer-authorized qualification")
}
if (!process.env.REPA_CONFIG_CONTENT || !process.env.REPA_AUTH_CONTENT || !process.env.REPA_DB) {
  throw new Error("The real-model qualification requires isolated config, auth projection, and database inputs")
}

const capability = LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
const model = {
  providerID: ProviderV2.ID.openai,
  modelID: ModelV2.ID.make("gpt-5.5"),
}
const navigationOnly = [
  { permission: "*", pattern: "*", action: "deny" as const },
  { permission: COURSE_QUERY_TOOL_ID, pattern: "*", action: "allow" as const },
  { permission: LEARNING_NAVIGATION_QUERY_TOOL_ID, pattern: "*", action: "allow" as const },
  { permission: capability, pattern: "*", action: "allow" as const },
]

type CompletedToolPart = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }

function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Gate 14 real-model qualification failed: ${message}`)
}

function conciseText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1_200)
}

function toolParts(messages: readonly SessionV1.WithParts[]) {
  return messages.flatMap((message) => message.parts).filter((part): part is SessionV1.ToolPart => part.type === "tool")
}

function completedTools(messages: readonly SessionV1.WithParts[]) {
  return toolParts(messages).filter((part): part is CompletedToolPart => part.state.status === "completed")
}

try {
  const evidence = await AppRuntime.runPromise(
    InstanceStore.Service.use((store) =>
      store.load({ directory: process.cwd() }).pipe(
        Effect.flatMap((ctx) =>
          Effect.gen(function* () {
            const database = yield* Database.Service
            const events = yield* EventV2Bridge.Service
            const permission = yield* Permission.Service
            const prompts = yield* SessionPrompt.Service
            const sessions = yield* Session.Service

            const courseLayer = LayerNode.compile(Course.node, [
              [Database.node, Layer.succeed(Database.Service, database)],
            ])
            const courses = yield* Course.Service.use((service) =>
              Effect.all({
                direct: service.createCourse({ title: "Distributed Systems" }),
                ambiguousA: service.createCourse({ title: "Algorithms" }),
                ambiguousB: service.createCourse({ title: "Algorithms" }),
                accepted: service.createCourse({ title: "Linear Algebra" }),
              }),
            ).pipe(Effect.provide(courseLayer))

            const permissionRequests: string[] = []
            const unsubscribe = yield* events.listen((event) => {
              if (event.type !== Permission.Event.Asked.type) return Effect.void
              const request = event.data as PermissionV1.Request
              permissionRequests.push(request.id)
              return permission.reply({ requestID: request.id, reply: "reject" }).pipe(Effect.orDie)
            })
            yield* Effect.addFinalizer(() => unsubscribe)

            const currentDefault = () => database.db.transaction((tx) => LearnerNavigation.readCurrentDefault(tx))
            const proposalCount = () =>
              database.db
                .get<{ count: number }>(sql`SELECT count(*) AS count FROM ${LearnerDefaultCourseProposalTable}`)
                .pipe(
                  Effect.orDie,
                  Effect.map((row) => row?.count ?? 0),
                )

            const runTurn = Effect.fn("Gate14RealModel.runTurn")(function* (input: {
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
                limits: { model: 5, tool: 4 },
                ...(input.title ? { session: { title: input.title, permission: navigationOnly } } : {}),
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
              return {
                label: input.label,
                sessionID: input.sessionID,
                turnID,
                messages,
                text: assistants
                  .flatMap((message) => message.parts)
                  .filter((part): part is SessionV1.TextPart => part.type === "text")
                  .map((part) => conciseText(part.text))
                  .filter(Boolean),
                tools: completedTools(assistants),
                allToolParts: toolParts(assistants),
              }
            })

            const captureCommand = Effect.fn("Gate14RealModel.captureCommand")(function* (part: CompletedToolPart) {
              const invocation = yield* database.db
                .select()
                .from(LearningCommandInvocationTable)
                .where(eq(LearningCommandInvocationTable.part_id, part.id))
                .get()
                .pipe(Effect.orDie)
              const disposition = yield* database.db
                .select()
                .from(LearnerDefaultCourseDispositionTable)
                .where(eq(LearnerDefaultCourseDispositionTable.invocation_part_id, part.id))
                .get()
                .pipe(Effect.orDie)
              requireEvidence(invocation, `command ${part.id} lost physical admission`)
              requireEvidence(disposition, `command ${part.id} lost its domain disposition`)
              requireEvidence(invocation.command_version === 3, `command ${part.id} did not use V3`)
              requireEvidence(
                invocation.authorization_basis === "agent_action",
                `command ${part.id} used shadow authority`,
              )
              requireEvidence(disposition.disposition === "agent_action_v3", `command ${part.id} lost Agent issuance`)
              const provenance = disposition.agent_action_provenance as DefaultCourseAgentActionProvenance
              requireEvidence(provenance?.kind === "root", `command ${part.id} did not retain root provenance`)
              return {
                partID: part.id,
                callID: part.callID,
                outcome: part.state.metadata.outcome,
                commandVersion: invocation.command_version,
                authorizationBasis: invocation.authorization_basis,
                disposition: disposition.disposition,
                provenance: {
                  kind: provenance.kind,
                  occurrenceID: provenance.occurrenceID,
                  causalRootOccurrenceID: provenance.causalRootOccurrenceID,
                  sessionID: provenance.sessionID,
                  turnID: provenance.turnID,
                  assistantMessageID: provenance.assistantMessageID,
                },
              }
            })

            requireEvidence((yield* proposalCount()) === 0, "isolated V14 database already contained a proposal")

            const directSessionID = SessionID.create()
            const direct = yield* runTurn({
              label: "clear direct default request",
              sessionID: directSessionID,
              title: "Gate 14 clear direct request",
              text: "把我的“Distributed Systems”课程设为默认课程。需要时读取课程列表；不要让我提供数据库 ID。",
            })
            const directCommand = direct.tools.filter((part) => part.tool === capability)
            requireEvidence(
              direct.tools.some((part) => part.tool === COURSE_QUERY_TOOL_ID),
              "clear request did not use the Course owner read",
            )
            requireEvidence(
              directCommand.length === 1,
              "clear request did not issue exactly one default-Course command",
            )
            requireEvidence(
              direct.allToolParts.every((part) => part.tool !== PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
              "clear request reached the retired proposal tool",
            )
            const directState = yield* currentDefault()
            requireEvidence(directState.courseID === courses.direct.id, "clear request selected the wrong Course")
            const directPath = yield* captureCommand(directCommand[0]!)

            const ambiguousSessionID = SessionID.create()
            const ambiguous = yield* runTurn({
              label: "real duplicate-title ambiguity",
              sessionID: ambiguousSessionID,
              title: "Gate 14 duplicate-title ambiguity",
              text: "把“Algorithms”设为默认课程。我有两门同名课程；如果现有信息不足以区分，就只问我一个澄清问题，不要猜，也不要修改。",
            })
            requireEvidence(
              ambiguous.tools.some((part) => part.tool === COURSE_QUERY_TOOL_ID),
              "ambiguous request did not inspect the Course owner",
            )
            requireEvidence(
              ambiguous.allToolParts.every((part) => part.tool !== capability),
              "ambiguous request issued a write",
            )
            requireEvidence(
              ambiguous.text.length === 1,
              "ambiguous request did not produce one bounded clarification response",
            )
            const afterAmbiguous = yield* currentDefault()
            requireEvidence(
              afterAmbiguous.courseID === courses.direct.id,
              "ambiguous request changed the existing default",
            )

            const acceptedSessionID = SessionID.create()
            const suggestion = yield* runTurn({
              label: "non-writing Course suggestion",
              sessionID: acceptedSessionID,
              title: "Gate 14 later conversational acceptance",
              text: "我考虑把默认课程改成“Linear Algebra”。先读取当前课程并告诉我你会选哪一门，但这一步不要修改；等我确认。",
            })
            requireEvidence(
              suggestion.tools.some(
                (part) => part.tool === COURSE_QUERY_TOOL_ID || part.tool === LEARNING_NAVIGATION_QUERY_TOOL_ID,
              ),
              "suggestion did not read navigation owner state",
            )
            requireEvidence(
              suggestion.allToolParts.every((part) => part.tool !== capability),
              "suggestion wrote before learner acceptance",
            )
            requireEvidence(
              suggestion.text.some((text) => text.includes("Linear Algebra")),
              "suggestion did not identify the intended Course",
            )

            const accepted = yield* runTurn({
              label: "later conversational acceptance",
              sessionID: acceptedSessionID,
              text: "可以，就把你刚才建议的那门设为默认课程。",
            })
            const acceptedCommand = accepted.tools.filter((part) => part.tool === capability)
            requireEvidence(
              acceptedCommand.length === 1,
              "later conversational acceptance did not issue exactly one default-Course command",
            )
            requireEvidence(
              accepted.allToolParts.every((part) => part.tool !== PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
              "later conversational acceptance reached the retired proposal tool",
            )
            const acceptedState = yield* currentDefault()
            requireEvidence(
              acceptedState.courseID === courses.accepted.id,
              "later acceptance selected the wrong Course",
            )
            const acceptedPath = yield* captureCommand(acceptedCommand[0]!)

            requireEvidence(permissionRequests.length === 0, "effective allow still produced a permission prompt")
            requireEvidence((yield* proposalCount()) === 0, "current Agent path created a historical proposal row")

            return {
              run: "gate14-openai-oauth-real-model-01",
              model,
              limits: { sessions: 3, turns: 4, maxModelOperationsPerTurn: 5, maxToolCallsPerTurn: 4 },
              courses: {
                direct: { id: courses.direct.id, title: courses.direct.title },
                ambiguous: [
                  { id: courses.ambiguousA.id, title: courses.ambiguousA.title },
                  { id: courses.ambiguousB.id, title: courses.ambiguousB.title },
                ],
                accepted: { id: courses.accepted.id, title: courses.accepted.title },
              },
              observations: {
                direct: {
                  text: direct.text,
                  tools: direct.tools.map((part) => part.tool),
                  state: directState,
                  path: directPath,
                },
                ambiguity: {
                  text: ambiguous.text,
                  tools: ambiguous.tools.map((part) => part.tool),
                  state: afterAmbiguous,
                },
                suggestion: {
                  text: suggestion.text,
                  tools: suggestion.tools.map((part) => part.tool),
                },
                acceptance: {
                  text: accepted.text,
                  tools: accepted.tools.map((part) => part.tool),
                  state: acceptedState,
                  path: acceptedPath,
                },
              },
              permissionRequests,
              proposalRows: yield* proposalCount(),
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
