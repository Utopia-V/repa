import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import {
  LearnerGoalCapabilitySettlementV2Table,
  LearnerGoalCommandTable,
  LearnerGoalCommitSealTable,
  LearnerGoalDispositionV2Table,
} from "@opencode-ai/core/learner-goal/sql"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { AdmittedLearnerOccurrenceTable } from "@opencode-ai/core/learning-command/occurrence.sql"
import { LearningCommandInvocationTable } from "@opencode-ai/core/learning-command/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { eq, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { isDeepStrictEqual } from "node:util"
import { entryBody } from "../src/cli/cmd/run/entry.body"
import { toolInlineInfo } from "../src/cli/cmd/run/tool"
import type { StreamCommit } from "../src/cli/cmd/run/types"
import { AppRuntime } from "../src/effect/app-runtime"
import { InstanceRef } from "../src/effect/instance-ref"
import { EventV2Bridge } from "../src/event-v2-bridge"
import { Permission } from "../src/permission"
import { InstanceStore } from "../src/project/instance-store"
import { MessageID, SessionID } from "../src/session/schema"
import { Session } from "../src/session/session"
import { SessionPrompt } from "../src/session/prompt"
import { COURSE_QUERY_TOOL_ID } from "../src/tool/course-navigation-query"
import { LEARNER_GOAL_QUERY_TOOL_ID } from "../src/tool/learner-goal-query"

if (process.env.REPA_GATE16_REAL_MODEL_APPROVED !== "1") {
  throw new Error("Set REPA_GATE16_REAL_MODEL_APPROVED=1 only for the maintainer-authorized qualification")
}
const workspace = process.env.REPA_GATE16_WORKDIR

if (!process.env.REPA_CONFIG_CONTENT || !process.env.REPA_AUTH_CONTENT || !process.env.REPA_DB || !workspace) {
  throw new Error(
    "The real-model qualification requires isolated workspace, config, auth projection, and database inputs",
  )
}

const capability = LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY
const model = {
  providerID: ProviderV2.ID.openai,
  modelID: ModelV2.ID.make("gpt-5.5"),
}
const goalAgent = [
  { permission: "*", pattern: "*", action: "deny" as const },
  { permission: COURSE_QUERY_TOOL_ID, pattern: "*", action: "allow" as const },
  { permission: LEARNER_GOAL_QUERY_TOOL_ID, pattern: "*", action: "allow" as const },
  { permission: capability, pattern: LearnerGoal.PERMISSION_PATTERN, action: "allow" as const },
]
const permittedTools = new Set([COURSE_QUERY_TOOL_ID, LEARNER_GOAL_QUERY_TOOL_ID, capability])
const forbiddenWriteInputKeys = new Set([
  "authorization",
  "authorizationBasis",
  "candidate",
  "confirmation",
  "expectedVersion",
  "fieldBases",
  "newGoalID",
  "newRevisionID",
  "proposal",
  "sourceExcerpt",
])

type CompletedToolPart = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }

function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Gate 16 real-model qualification failed: ${message}`)
}

function conciseText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1_200)
}

function textDigest(value: readonly string[]) {
  return new Bun.CryptoHasher("sha256").update(value.join("\n")).digest("hex")
}

function toolParts(messages: readonly SessionV1.WithParts[]) {
  return messages.flatMap((message) => message.parts).filter((part): part is SessionV1.ToolPart => part.type === "tool")
}

function completedTools(messages: readonly SessionV1.WithParts[]) {
  return toolParts(messages).filter((part): part is CompletedToolPart => part.state.status === "completed")
}

function forbiddenInputPaths(value: unknown, path = "input"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenInputPaths(item, `${path}[${index}]`))
  if (!value || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, item]) => [
    ...(forbiddenWriteInputKeys.has(key) ? [`${path}.${key}`] : []),
    ...forbiddenInputPaths(item, `${path}.${key}`),
  ])
}

function foreignStatePaths(value: unknown, path = "goal"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => foreignStatePaths(item, `${path}[${index}]`))
  if (!value || typeof value !== "object") return []
  const forbidden = new Set([
    "assignment",
    "assignments",
    "evidence",
    "mastery",
    "priorities",
    "priority",
    "schedule",
    "schedules",
  ])
  return Object.entries(value).flatMap(([key, item]) => [
    ...(forbidden.has(key.toLowerCase()) ? [`${path}.${key}`] : []),
    ...foreignStatePaths(item, `${path}.${key}`),
  ])
}

function goalProjection(goal: LearnerGoal.GoalRead) {
  return {
    goalID: goal.goalID,
    revisionID: goal.head.id,
    version: goal.head.version,
    schemaVersion: goal.head.schemaVersion,
    outcome: goal.head.outcome,
    conditions: goal.head.conditions,
    scope: goal.head.scope,
    target: goal.head.target,
    disposition: goal.head.disposition,
    occurrenceID: goal.head.occurrenceID,
    effectID: goal.head.effectID,
  }
}

function scopeMeaning(scope: LearnerGoal.GoalRead["head"]["scope"]) {
  if (scope.type === "learner_home") return scope
  return {
    type: scope.type,
    courseIDs: scope.courses.map((course) => course.courseID).sort(),
  }
}

function terminalProjection(part: CompletedToolPart) {
  const projected = part as unknown as ToolPart
  return {
    title: part.state.title,
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

try {
  const evidence = await AppRuntime.runPromise(
    InstanceStore.Service.use((store) =>
      store.load({ directory: workspace }).pipe(
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
            const course = yield* Course.Service.use((service) =>
              service.createCourse({ title: "Operating Systems" }),
            ).pipe(Effect.provide(courseLayer))

            const readGoals = (asOf = Date.now()) => database.db.transaction((tx) => LearnerGoal.discover(tx, asOf))
            const legacyCommandCount = () =>
              database.db.get<{ count: number }>(sql`SELECT count(*) AS count FROM ${LearnerGoalCommandTable}`).pipe(
                Effect.orDie,
                Effect.map((row) => row?.count ?? 0),
              )

            requireEvidence((yield* readGoals()).items.length === 0, "the isolated Goal owner was not empty")
            requireEvidence(
              (yield* legacyCommandCount()) === 0,
              "the isolated database contained historical Goal commands",
            )

            const permissionRequests: string[] = []
            const unsubscribe = yield* events.listen((event) => {
              if (event.type !== Permission.Event.Asked.type) return Effect.void
              const request = event.data as PermissionV1.Request
              permissionRequests.push(request.id)
              return permission.reply({ requestID: request.id, reply: "reject" }).pipe(Effect.orDie)
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
                limits: { model: 5, tool: 4 },
                ...(input.title ? { session: { title: input.title, permission: goalAgent } } : {}),
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
              const tools = completedTools(assistants)
              requireEvidence(
                tools.every((part) => permittedTools.has(part.tool)),
                `${input.label} reached a tool outside the bounded Goal/Course surface`,
              )
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
                tools,
                writeTools: tools.filter((part) => part.tool === capability),
              }
            })

            const captureCommand = Effect.fn("Gate16RealModel.captureCommand")(function* (part: CompletedToolPart) {
              const invocation = yield* database.db
                .select()
                .from(LearningCommandInvocationTable)
                .where(eq(LearningCommandInvocationTable.part_id, part.id))
                .get()
                .pipe(Effect.orDie)
              const disposition = yield* database.db
                .select()
                .from(LearnerGoalDispositionV2Table)
                .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, part.id))
                .get()
                .pipe(Effect.orDie)
              const capabilitySettlement = yield* database.db
                .select()
                .from(LearnerGoalCapabilitySettlementV2Table)
                .where(eq(LearnerGoalCapabilitySettlementV2Table.invocation_part_id, part.id))
                .get()
                .pipe(Effect.orDie)
              const seal = yield* database.db
                .select()
                .from(LearnerGoalCommitSealTable)
                .where(eq(LearnerGoalCommitSealTable.invocation_part_id, part.id))
                .get()
                .pipe(Effect.orDie)

              requireEvidence(invocation, `tool ${part.id} lost physical admission`)
              requireEvidence(disposition, `tool ${part.id} lost its Goal disposition`)
              requireEvidence(capabilitySettlement, `tool ${part.id} lost capability settlement`)
              requireEvidence(seal, `tool ${part.id} lost its applied effect seal`)
              requireEvidence(invocation.command_name === capability, `tool ${part.id} changed command identity`)
              requireEvidence(invocation.command_version === 2, `tool ${part.id} did not use Goal V2`)
              requireEvidence(invocation.capability_identity === capability, `tool ${part.id} changed capability`)
              requireEvidence(invocation.capability_version === 2, `tool ${part.id} changed capability version`)
              requireEvidence(
                invocation.authorization_basis === "agent_action",
                `tool ${part.id} used shadow authority`,
              )
              requireEvidence(invocation.status === "applied", `tool ${part.id} was not applied`)
              requireEvidence(disposition.disposition === "candidate_v2", `tool ${part.id} was not a current candidate`)
              requireEvidence(
                disposition.legacy_command_part_id === null,
                `tool ${part.id} created a historical command`,
              )
              requireEvidence(
                disposition.agent_action_provenance?.kind === "root",
                `tool ${part.id} lost root issuance`,
              )
              requireEvidence(
                disposition.agent_action_provenance.lineage.length === 0,
                `tool ${part.id} invented delegated lineage`,
              )
              requireEvidence(
                disposition.agent_action_provenance.occurrenceID === invocation.occurrence_id,
                `tool ${part.id} changed its causal occurrence`,
              )
              requireEvidence(
                capabilitySettlement.outcome === "policy_allow",
                `tool ${part.id} did not use ordinary configured allow`,
              )
              requireEvidence(capabilitySettlement.permission_request_id === null, `tool ${part.id} invented a prompt`)
              requireEvidence(forbiddenInputPaths(part.state.input).length === 0, `tool ${part.id} used retired input`)

              const occurrence = yield* database.db
                .select()
                .from(AdmittedLearnerOccurrenceTable)
                .where(eq(AdmittedLearnerOccurrenceTable.id, invocation.occurrence_id))
                .get()
                .pipe(Effect.orDie)
              requireEvidence(occurrence, `tool ${part.id} lost its learner occurrence`)
              requireEvidence(
                occurrence.origin_session_id === invocation.session_id &&
                  occurrence.origin_message_id === invocation.parent_user_message_id,
                `tool ${part.id} occurrence changed its learner source`,
              )
              requireEvidence(part.messageID === invocation.assistant_message_id, `tool ${part.id} message diverged`)
              requireEvidence(part.callID === invocation.provider_call_id, `tool ${part.id} call diverged`)
              requireEvidence(part.sessionID === invocation.session_id, `tool ${part.id} Session diverged`)

              const output = JSON.parse(part.state.output) as {
                settlement?: { outcome?: string; effectID?: string }
                disposition?: string
                agentAction?: { kind?: string }
                capabilityOutcome?: string
              }
              requireEvidence(output.settlement?.outcome === "applied", `tool ${part.id} output was not applied`)
              requireEvidence(output.disposition === "candidate_v2", `tool ${part.id} output lost disposition`)
              requireEvidence(output.agentAction?.kind === "root", `tool ${part.id} output lost issuance`)
              requireEvidence(output.capabilityOutcome === "policy_allow", `tool ${part.id} output lost capability`)
              requireEvidence(output.settlement.effectID === seal.effect_id, `tool ${part.id} output changed effect`)

              return {
                sessionID: invocation.session_id,
                turnID: invocation.turn_id,
                inputID: invocation.input_id,
                occurrenceID: invocation.occurrence_id,
                parentUserMessageID: invocation.parent_user_message_id,
                assistantMessageID: invocation.assistant_message_id,
                partID: invocation.part_id,
                callID: invocation.provider_call_id,
                commandVersion: invocation.command_version,
                capabilityVersion: invocation.capability_version,
                disposition: disposition.disposition,
                issuance: disposition.agent_action_provenance.kind,
                capabilityOutcome: capabilitySettlement.outcome,
                effectID: seal.effect_id,
                input: part.state.input,
                canonicalCommand: disposition.canonical_command,
                terminal: terminalProjection(part),
              }
            })

            const discussionSessionID = SessionID.create()
            const discussion = yield* runTurn({
              label: "quoted hypothetical and progress discussion",
              sessionID: discussionSessionID,
              title: "Gate 16 non-writing discussion",
              text: "请分析这句假设为什么还不是一个清晰的学习目标：‘以后也许应该把操作系统都学会。’这只是引用，不是我要保存的目标。我今天看完一节课也只是进度报告，不要因此创建目标或改变任何目标状态。",
            })
            requireEvidence(discussion.writeTools.length === 0, "discussion issued a Goal write")
            requireEvidence(discussion.text.length > 0, "discussion produced no useful response")
            requireEvidence((yield* readGoals()).items.length === 0, "discussion changed Goal owner state")

            const createSessionID = SessionID.create()
            const create = yield* runTurn({
              label: "clear natural-language Goal creation",
              sessionID: createSessionID,
              title: "Gate 16 natural Goal creation",
              text: "我决定把‘掌握操作系统中的虚拟内存’作为长期学习目标。完成标准是我能解释地址转换，并比较 FIFO、LRU 等页面置换策略。它属于我的 ‘Operating Systems’ 课程。请保存；需要精确课程信息时自己读取，不要让我输入内部 ID。",
            })
            requireEvidence(
              create.tools.some((part) => part.tool === COURSE_QUERY_TOOL_ID),
              "clear creation did not lazily read the Course owner",
            )
            requireEvidence(create.writeTools.length === 1, "clear creation did not issue exactly one Goal write")
            const createPath = yield* captureCommand(create.writeTools[0]!)
            const afterCreate = yield* readGoals()
            requireEvidence(afterCreate.items.length === 1, "clear creation did not create exactly one Goal")
            const initialGoal = afterCreate.items[0]!
            requireEvidence(initialGoal.head.schemaVersion === 2, "clear creation stored a historical Goal revision")
            requireEvidence(initialGoal.head.scope.type === "courses", "clear creation lost its Course scope")
            requireEvidence(
              initialGoal.head.scope.courses.some((item) => item.courseID === course.id),
              "clear creation selected another Course",
            )
            requireEvidence(
              initialGoal.head.disposition.type === "active",
              "clear creation invented a lifecycle change",
            )
            requireEvidence(initialGoal.head.effectID === createPath.effectID, "clear creation lost its tool effect")

            const updateSessionID = SessionID.create()
            const correctedOutcome = "能独立讲清虚拟内存机制并分析页面置换取舍"
            const update = yield* runTurn({
              label: "fresh-Session contextual Goal update",
              sessionID: updateSessionID,
              title: "Gate 16 contextual Goal update",
              text: `把我现有的那个关于虚拟内存的学习目标调整一下：结果改成“${correctedOutcome}”，其他内容和状态保持不变。你自己读取当前 Goal 来定位，不要让我提供内部 ID。`,
            })
            requireEvidence(
              update.tools.some((part) => part.tool === LEARNER_GOAL_QUERY_TOOL_ID),
              "contextual update did not read the Goal owner",
            )
            requireEvidence(update.writeTools.length === 1, "contextual update did not issue exactly one Goal write")
            const updatePath = yield* captureCommand(update.writeTools[0]!)
            const afterUpdate = yield* readGoals()
            requireEvidence(afterUpdate.items.length === 1, "contextual update created or removed a Goal")
            const correctedGoal = afterUpdate.items[0]!
            requireEvidence(
              correctedGoal.goalID === initialGoal.goalID,
              "contextual update chose another Goal identity",
            )
            requireEvidence(
              correctedGoal.head.id !== initialGoal.head.id,
              "contextual update did not create a revision",
            )
            requireEvidence(
              correctedGoal.head.outcome === correctedOutcome,
              "contextual update changed learner meaning",
            )
            requireEvidence(
              isDeepStrictEqual(correctedGoal.head.conditions, initialGoal.head.conditions),
              "contextual update changed carried conditions",
            )
            requireEvidence(
              isDeepStrictEqual(scopeMeaning(correctedGoal.head.scope), scopeMeaning(initialGoal.head.scope)),
              "contextual update changed carried scope",
            )
            requireEvidence(
              isDeepStrictEqual(correctedGoal.head.target, initialGoal.head.target),
              "contextual update changed carried target",
            )
            requireEvidence(correctedGoal.head.disposition.type === "active", "contextual update changed lifecycle")
            requireEvidence(correctedGoal.head.effectID === updatePath.effectID, "contextual update lost its effect")

            const acceptanceSessionID = SessionID.create()
            const suggestion = yield* runTurn({
              label: "Tutor suggestion without learner acceptance",
              sessionID: acceptanceSessionID,
              title: "Gate 16 conversational acceptance",
              text: "我可能还想为 CPU 调度建立一个学习目标。先按考试复习场景帮我提出一个具体结果和完成标准，但这一步只建议，不要保存；等我确认。",
            })
            requireEvidence(suggestion.writeTools.length === 0, "Tutor suggestion wrote before learner acceptance")
            requireEvidence(suggestion.text.length > 0, "Tutor suggestion produced no useful proposal")
            requireEvidence((yield* readGoals()).items.length === 1, "Tutor suggestion changed Goal owner state")

            const acceptance = yield* runTurn({
              label: "ordinary short acceptance",
              sessionID: acceptanceSessionID,
              text: "对，就按你刚才建议的内容保存为新的学习目标，仍属于 Operating Systems 课程。",
            })
            requireEvidence(acceptance.writeTools.length === 1, "short acceptance did not issue exactly one Goal write")
            const acceptancePath = yield* captureCommand(acceptance.writeTools[0]!)
            const afterAcceptance = yield* readGoals()
            requireEvidence(afterAcceptance.items.length === 2, "short acceptance did not create one new Goal")
            const acceptedGoal = afterAcceptance.items.find((item) => item.goalID !== correctedGoal.goalID)
            requireEvidence(acceptedGoal, "short acceptance reused the contextual Goal identity")
            requireEvidence(acceptedGoal.head.schemaVersion === 2, "short acceptance stored a historical revision")
            requireEvidence(acceptedGoal.head.scope.type === "courses", "short acceptance lost Course scope")
            requireEvidence(
              acceptedGoal.head.scope.courses.some((item) => item.courseID === course.id),
              "short acceptance selected another Course",
            )
            requireEvidence(acceptedGoal.head.disposition.type === "active", "short acceptance changed lifecycle")
            requireEvidence(acceptedGoal.head.effectID === acceptancePath.effectID, "short acceptance lost its effect")

            const ambiguitySessionID = SessionID.create()
            const beforeAmbiguity = afterAcceptance.items.map(goalProjection)
            const ambiguity = yield* runTurn({
              label: "materially ambiguous contextual change",
              sessionID: ambiguitySessionID,
              title: "Gate 16 ordinary clarification",
              text: "我想把之前那个操作系统学习目标改一下，但‘之前那个’可能指虚拟内存或 CPU 调度，而且我还没决定是改结果还是完成标准。请先问一个必要的澄清问题；在我回答前不要保存或修改。",
            })
            requireEvidence(ambiguity.writeTools.length === 0, "ambiguous change wrote before clarification")
            requireEvidence(ambiguity.text.length > 0, "ambiguous change produced no clarification")
            requireEvidence(
              isDeepStrictEqual((yield* readGoals()).items.map(goalProjection), beforeAmbiguity),
              "ambiguous change mutated Goal state",
            )

            requireEvidence(permissionRequests.length === 0, "effective allow produced a Gate-specific prompt")
            requireEvidence((yield* legacyCommandCount()) === 0, "current Agent path created a historical V1 command")
            requireEvidence(
              foreignStatePaths(afterAcceptance.items.map(goalProjection)).length === 0,
              "the Goal owner absorbed Assignment, evidence, mastery, priority, or schedule state",
            )
            requireEvidence(
              new Set([createPath.occurrenceID, updatePath.occurrenceID, acceptancePath.occurrenceID]).size === 3,
              "distinct learner Turns reused one occurrence",
            )
            requireEvidence(
              new Set([createPath.effectID, updatePath.effectID, acceptancePath.effectID]).size === 3,
              "distinct Goal writes reused one effect",
            )

            return {
              run: "gate16-openai-oauth-agent-native-01",
              model,
              limits: { sessions: 5, turns: 6, maxModelOperationsPerTurn: 5, maxToolCallsPerTurn: 4 },
              isolatedFixture: { courseID: course.id, courseTitle: course.title },
              observations: {
                discussion: {
                  claim: "quoted, hypothetical, and progress discussion remains useful and does not write",
                  responseCharacters: discussion.text.join("\n").length,
                  responseDigest: textDigest(discussion.text),
                  tools: discussion.tools.map((part) => part.tool),
                },
                creation: {
                  claim: "clear natural language creates a Course-scoped Goal without learner-entered IDs",
                  tools: create.tools.map((part) => part.tool),
                  path: createPath,
                  goal: goalProjection(initialGoal),
                },
                contextualUpdate: {
                  claim: "a fresh Session resolves a contextual Goal reference through owner reads",
                  tools: update.tools.map((part) => part.tool),
                  path: updatePath,
                  before: goalProjection(initialGoal),
                  after: goalProjection(correctedGoal),
                },
                shortAcceptance: {
                  claim: "a Tutor suggestion does not write and ordinary short acceptance uses the same typed command",
                  suggestion: {
                    responseCharacters: suggestion.text.join("\n").length,
                    responseDigest: textDigest(suggestion.text),
                    tools: suggestion.tools.map((part) => part.tool),
                  },
                  acceptanceTools: acceptance.tools.map((part) => part.tool),
                  path: acceptancePath,
                  goal: goalProjection(acceptedGoal),
                },
                ambiguity: {
                  claim: "material ambiguity produces ordinary clarification before any write",
                  responseCharacters: ambiguity.text.join("\n").length,
                  responseDigest: textDigest(ambiguity.text),
                  tools: ambiguity.tools.map((part) => part.tool),
                },
              },
              permissionRequests,
              historicalCommandRows: yield* legacyCommandCount(),
            }
          }).pipe(Effect.scoped, Effect.provideService(InstanceRef, ctx), Effect.ensuring(store.dispose(ctx))),
        ),
      ),
    ),
  )
  const serialized = JSON.stringify(evidence, null, 2)
  for (const secret of [process.env.REPA_CONFIG_CONTENT, process.env.REPA_AUTH_CONTENT]) {
    if (secret.length >= 16) {
      requireEvidence(!serialized.includes(secret), "evidence output included an isolated secret input")
    }
  }
  console.log(serialized)
} finally {
  const { Server } = await import("../src/server/server")
  await Server.disposeDefault().catch(() => {})
  await AppRuntime.dispose()
}
