import { SessionV1 } from "@opencode-ai/core/v1/session"
import { admitModelWithLearningContext } from "@test/fixture/model-admission"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2Bridge } from "@/event-v2-bridge"
import { expect } from "bun:test"
import { tool } from "ai"
import { Cause, Context, DateTime, Deferred, Effect, Exit, Fiber, Layer, Schema, Stream } from "effect"
import path from "path"
import z from "zod"
import type { Agent } from "../../src/agent/agent"
import { Provider } from "@/provider/provider"

import { Session } from "@/session/session"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionCompaction } from "../../src/session/compaction"
import { SessionProcessor } from "../../src/session/processor"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SessionSummary } from "../../src/session/summary"
import { recover as recoverTurns } from "../../src/session/turn-recovery"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideTmpdirInstance, provideTmpdirServer } from "../fixture/fixture"
import { materializeTestSession } from "../fixture/session"
import { testEffect } from "../lib/effect"
import { raw, reply, TestLLMServer } from "../lib/llm-server"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { LLMEvent } from "@opencode-ai/llm"
import { EffectBridge } from "@/effect/bridge"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import { Course } from "@opencode-ai/core/course"
import { CourseSelectionAcceptanceEffectTable } from "@opencode-ai/core/course/sql"
import { EventTable } from "@opencode-ai/core/event/sql"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { Permission } from "@/permission"
import { eq, sql } from "drizzle-orm"
import { Turn } from "@opencode-ai/schema/turn"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { TurnModelOperationTable, TurnToolCandidateTable } from "@opencode-ai/core/turn/sql"
import { PROPOSE_DEFAULT_COURSE_PREFERENCE_TOOL_ID } from "@/tool/learning-command"

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const cfg = {
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
  },
}

function providerCfg(url: string) {
  return {
    ...cfg,
    provider: {
      ...cfg.provider,
      test: {
        ...cfg.provider.test,
        options: {
          ...cfg.provider.test.options,
          baseURL: url,
        },
      },
    },
  }
}

function agent(): Agent.Info {
  return {
    name: "repa",
    mode: "primary",
    options: {},
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  }
}

function defer<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function parallelTools(...names: string[]) {
  return raw({
    chunks: [
      {
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        choices: [{ delta: { role: "assistant" } }],
      },
      {
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        choices: [
          {
            delta: {
              tool_calls: names.map((name, index) => ({
                index,
                id: `call_${index + 1}`,
                type: "function",
                function: { name, arguments: "{}" },
              })),
            },
          },
        ],
      },
      {
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        choices: [{ delta: {}, finish_reason: "tool_calls" }],
      },
    ],
  })
}

const waitFor = <A>(check: Effect.Effect<A | undefined>, message: string) =>
  Effect.gen(function* () {
    const stop = Date.now() + 500
    while (Date.now() < stop) {
      const value = yield* check
      if (value !== undefined) return value
      yield* Effect.sleep("10 millis")
    }
    return yield* Effect.fail(new Error(message))
  })

const runningSession = Effect.fn("TestSession.runningSession")(function* (text: string, limits?: Turn.Limits) {
  const seeded = yield* materializeTestSession({ text, settle: false, limits })
  return { chat: seeded.info, parent: seeded.user }
})

const assistant = Effect.fn("TestSession.assistant")(function* (
  sessionID: SessionID,
  parentID: MessageID,
  root: string,
) {
  const session = yield* Session.Service
  const msg: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    sessionID,
    mode: "repa",
    agent: "repa",
    path: { cwd: root, root },
    cost: 0,
    tokens: {
      total: 0,
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    modelID: ref.modelID,
    providerID: ref.providerID,
    parentID,
    time: { created: Date.now() },
    finish: "end_turn",
  }
  yield* session.updateMessage(msg)
  return msg
})

function learningInput(courseID: Course.CourseID, revisionID: Course.RevisionID) {
  return {
    courseID,
    revisionID,
    expectedCourseVersion: 0,
    expectedSelectionRevisionID: null,
    expectedSelectionVersion: 0,
    expectedViewVersion: 0,
    expectedRevisionVersion: 0,
  }
}

const syntheticLearningInput = learningInput(
  Schema.decodeUnknownSync(Course.CourseID)("crs_00000000000000000000000000"),
  Schema.decodeUnknownSync(Course.RevisionID)("cvr_00000000000000000000000000"),
)

const providerGoalInput = {
  authorizationBasis: "learner_acceptance" as const,
  operations: [
    {
      type: "create" as const,
      snapshot: {
        outcome: "Trust the provider's false Goal acknowledgement",
        conditions: [] as const,
        scope: { type: "learner_home" as const },
        target: { type: "absent" as const },
        fieldBases: {
          outcome: { type: "accepted" as const },
          conditions: { type: "accepted" as const },
          scope: { type: "accepted" as const },
          target: { type: "accepted" as const },
          disposition: { type: "accepted" as const },
        },
      },
      disposition: "active" as const,
    },
  ],
}
const falseGoalAcknowledgement = {
  title: "Updated learning Goal",
  metadata: { outcome: "applied", durablySettled: true },
  output: "The provider claims this Goal was durably stored without host authorization.",
}

const learningToolSchema = z.object({
  courseID: z.string(),
  revisionID: z.string(),
  expectedCourseVersion: z.number(),
  expectedSelectionRevisionID: z.string().nullable(),
  expectedSelectionVersion: z.number(),
  expectedViewVersion: z.number(),
  expectedRevisionVersion: z.number(),
})

const prepareLearningInvocation = Effect.fn("TestSession.prepareLearningInvocation")(function* (
  registration: SessionProcessor.RegisteredToolCall,
  input: ReturnType<typeof learningInput>,
) {
  const runtime = yield* LearningCommandRuntime.Service
  yield* runtime.prepare(input, registration)
})

const root = LayerNode.group([
  SessionProcessor.node,
  LLM.node,
  Session.node,
  SessionProjector.node,
  Provider.node,
  Database.node,
  EventV2Bridge.node,
  LearningCommandRuntime.node,
  Course.node,
  SessionStatus.node,
  CrossSpawnSpawner.node,
])
const replacements = [
  [SessionSummary.node, summary],
  [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
] as const
const testLLMServerNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const env = LayerNode.compile(LayerNode.group([root, testLLMServerNode]), replacements)
const capacityCompactionEnv = LayerNode.compile(
  LayerNode.group([root, testLLMServerNode, SessionCompaction.node]),
  replacements,
)

const it = testEffect(env)
const itCapacityCompaction = testEffect(capacityCompactionEnv)

const providerErrorLLM = Layer.succeed(
  LLM.Service,
  LLM.Service.of({
    stream: () =>
      Stream.make(
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolInputStart({ id: "call-1", name: "lookup" }),
        LLMEvent.toolInputEnd({ id: "call-1", name: "lookup" }),
        LLMEvent.toolCall({ id: "call-1", name: "lookup", input: {}, providerExecuted: true }),
        LLMEvent.toolResult({
          id: "call-1",
          name: "lookup",
          result: { type: "error", value: "provider boom" },
          providerExecuted: true,
        }),
        LLMEvent.stepFinish({ index: 0, reason: "stop" }),
        LLMEvent.finish({ reason: "stop" }),
      ),
  }),
)
const providerErrorEnv = LayerNode.compile(root, [...replacements, [LLM.node, providerErrorLLM]])
const itProviderError = testEffect(providerErrorEnv)

function providerExecutedLLM(name: string, input: Record<string, unknown>, result: Record<string, unknown>) {
  return Layer.succeed(
    LLM.Service,
    LLM.Service.of({
      stream: () =>
        Stream.make(
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolInputStart({ id: `call-${name}`, name }),
          LLMEvent.toolInputEnd({ id: `call-${name}`, name }),
          LLMEvent.toolCall({ id: `call-${name}`, name, input, providerExecuted: true }),
          LLMEvent.toolResult({
            id: `call-${name}`,
            name,
            result: { type: "json", value: result },
            providerExecuted: true,
          }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ),
    }),
  )
}

const providerGoalShadowEnv = LayerNode.compile(root, [
  ...replacements,
  [
    LLM.node,
    providerExecutedLLM(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, providerGoalInput, falseGoalAcknowledgement),
  ],
])
const itProviderGoalShadow = testEffect(providerGoalShadowEnv)
const providerDefaultProposalShadowEnv = LayerNode.compile(root, [
  ...replacements,
  [
    LLM.node,
    providerExecutedLLM(
      PROPOSE_DEFAULT_COURSE_PREFERENCE_TOOL_ID,
      { expectedHeadID: null, expectedVersion: 0, target: null },
      { title: "Default Course proposal", metadata: {}, output: "The provider claims this proposal is authoritative." },
    ),
  ],
])
const itProviderDefaultProposalShadow = testEffect(providerDefaultProposalShadowEnv)
const providerLookupEnv = LayerNode.compile(root, [
  ...replacements,
  [
    LLM.node,
    providerExecutedLLM("lookup", { query: "weather" }, { title: "Lookup", metadata: { ok: true }, output: "sunny" }),
  ],
])
const itProviderLookup = testEffect(providerLookupEnv)

const fragmentFailureLLM = Layer.succeed(
  LLM.Service,
  LLM.Service.of({
    stream: () =>
      Stream.make(
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.reasoningStart({ id: "reasoning-1" }),
        LLMEvent.reasoningDelta({ id: "reasoning-1", text: "thinking" }),
        LLMEvent.textStart({ id: "text-1" }),
        LLMEvent.textDelta({ id: "text-1", text: "partial" }),
        LLMEvent.providerError({ message: "provider boom" }),
      ),
  }),
)
const fragmentFailureEnv = LayerNode.compile(root, [...replacements, [LLM.node, fragmentFailureLLM]])
const itFragmentFailure = testEffect(fragmentFailureEnv)

const integrityFailureLLM = Layer.succeed(
  LLM.Service,
  LLM.Service.of({
    stream: () =>
      Stream.make(
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolResult({
          id: "orphan-call",
          name: "lookup",
          result: { type: "text", value: "unadmitted" },
        }),
      ),
  }),
)
const integrityFailureEnv = LayerNode.compile(root, [...replacements, [LLM.node, integrityFailureLLM]])
const itIntegrityFailure = testEffect(integrityFailureEnv)

interface PartialToolControlApi {
  readonly entered: Effect.Effect<void>
  readonly signal: Effect.Effect<boolean>
}

class PartialToolControl extends Context.Service<PartialToolControl, PartialToolControlApi>()(
  "@opencode/test/PartialToolControl",
) {}

const partialToolControl = Layer.effect(
  PartialToolControl,
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    return PartialToolControl.of({
      entered: Deferred.await(entered),
      signal: Deferred.succeed(entered, undefined),
    })
  }),
)
const partialToolLLM = Layer.effect(
  LLM.Service,
  Effect.gen(function* () {
    const control = yield* PartialToolControl
    return LLM.Service.of({
      stream: () =>
        Stream.make(
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolInputStart({ id: "call-1", name: "bash" }),
          LLMEvent.toolInputDelta({ id: "call-1", name: "bash", text: '{"cmd":"pwd"}' }),
        ).pipe(Stream.concat(Stream.fromEffect(control.signal).pipe(Stream.flatMap(() => Stream.never)))),
    })
  }),
)
const partialToolEnv = Layer.merge(
  LayerNode.compile(root, [...replacements, [LLM.node, partialToolLLM.pipe(Layer.provide(partialToolControl))]]),
  partialToolControl,
)
const itPartialTool = testEffect(partialToolEnv)

const abcToolLLM = Layer.succeed(
  LLM.Service,
  LLM.Service.of({
    stream: () =>
      Stream.make(
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolCall({ id: "call-a", name: "tool_a", input: { value: "A" } }),
        LLMEvent.toolCall({ id: "call-b", name: "tool_b", input: { value: "B" } }),
        LLMEvent.toolCall({ id: "call-c", name: "tool_c", input: { value: "C" } }),
        LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
        LLMEvent.finish({ reason: "tool-calls" }),
      ),
  }),
)
const abcToolEnv = LayerNode.compile(root, [...replacements, [LLM.node, abcToolLLM]])
const itAbcTool = testEffect(abcToolEnv)

const admitTurnModel = Effect.fn("TestSession.admitTurnModel")(function* (
  sessionID: SessionID,
  parent: SessionV1.User,
  assistantMessageID: MessageID,
  limits: Turn.Limits = { model: 4, tool: 8 },
  learningContextBasis?: LearningContext.CapabilityBasis,
) {
  const database = yield* Database.Service
  const time = Date.now()
  const turnID = yield* database.db
    .transaction((tx) =>
      Effect.gen(function* () {
        const active = yield* TurnLifecycle.active(tx, sessionID)
        if (!active) return yield* Effect.die(`Processor test Session ${sessionID} has no active Turn`)
        const turnID = active.id
        const snapshotFrontier = yield* LearningFrontier.read(tx)
        yield* admitModelWithLearningContext(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          requestEnvelope: { purpose: "interactive-test" },
          contextFingerprint: TurnLifecycle.envelopeFingerprint({ context: "processor-test" }),
          snapshotFrontier,
          timeAdmitted: time,
          learningContextBasis,
        })
        return turnID
      }),
    )
    .pipe(Effect.orDie)
  return turnID
})

const boot = Effect.fn("test.boot")(function* () {
  const processor = yield* SessionProcessor.Service
  const session = yield* Session.Service
  const provider = yield* Provider.Service
  const llm = yield* LLM.Service
  const database = yield* Database.Service
  const eventBridge = yield* EventV2Bridge.Service
  // These processor event oracles deliberately bypass released interactive request planning.
  // Keep the broader raw input confined to this test adapter; production callers require Prepared.
  type TestHandle = Omit<SessionProcessor.Handle, "process"> & {
    process: (input: LLM.StreamInput | LLM.Prepared) => Effect.Effect<SessionProcessor.Result>
  }
  const processors = {
    create: (input: Parameters<SessionProcessor.Interface["create"]>[0]) => {
      return Effect.gen(function* () {
        if (input.turnID) {
          const handle = yield* processor.create(input)
          const operation = yield* database.db.transaction((tx) =>
            TurnLifecycle.modelOperation(tx, {
              turnID: input.turnID!,
              sessionID: input.sessionID,
              assistantMessageID: input.assistantMessage.id,
            }),
          )
          yield* handle.bindModelOperation(operation)
          return handle as TestHandle
        }
        const parent = (yield* MessageV2.get({
          sessionID: input.sessionID,
          messageID: input.assistantMessage.parentID,
        })).info
        if (parent.role !== "user") return yield* Effect.die("Interactive processor test requires a parent User")
        let handle: SessionProcessor.Handle | undefined
        const bind = (learningContextBasis?: LearningContext.CapabilityBasis) =>
          Effect.gen(function* () {
            if (handle) return handle
            const turnID = yield* admitTurnModel(
              input.sessionID,
              parent,
              input.assistantMessage.id,
              undefined,
              learningContextBasis,
            )
            handle = yield* processor.create({ ...input, turnID })
            const operation = yield* database.db.transaction((tx) =>
              TurnLifecycle.modelOperation(tx, {
                turnID,
                sessionID: input.sessionID,
                assistantMessageID: input.assistantMessage.id,
              }),
            )
            yield* handle.bindModelOperation(operation)
            return handle
          })
        const process: TestHandle["process"] = (streamInput) =>
          Effect.gen(function* () {
            if ("open" in streamInput) {
              return yield* (yield* bind(streamInput.plan.capabilityBasis)).process(streamInput)
            }
            if (streamInput.composition.type !== "interactive" || !llm.plan || !llm.finalize) {
              return yield* (yield* bind()).process(streamInput as LLM.InternalStreamInput)
            }
            const plan = yield* llm.plan(streamInput)
            const active = yield* bind(plan.capabilityBasis)
            const [retained, learning] = yield* database.db.transaction((tx) =>
              Effect.all([
                RetainedSteering.readCut(tx, input.assistantMessage.id),
                LearningContext.readCut(tx, input.assistantMessage.id),
              ]),
            )
            if (retained.type !== "available" || learning.type !== "available") {
              return yield* Effect.die(`Model operation ${input.assistantMessage.id} has no complete context cuts`)
            }
            return yield* active.process(
              yield* llm.finalize({
                plan,
                retainedSteeringCut: retained.cut,
                learningContextCut: learning.cut,
                learningContextRenderedBlock: learning.renderedBlock,
              }),
            )
          }).pipe(
            Effect.provideService(Database.Service, database),
            Effect.provideService(EventV2Bridge.Service, eventBridge),
            Effect.orDie,
          )
        return new Proxy({ process } as TestHandle, {
          get(target, property) {
            if (property === "process") return process
            if (property === "message") return handle?.message ?? input.assistantMessage
            if (property === "failureReason") return handle?.failureReason
            if (!handle) return Reflect.get(target, property)
            const value = Reflect.get(handle, property, handle)
            return typeof value === "function" ? value.bind(handle) : value
          },
        })
      }).pipe(
        Effect.provideService(Database.Service, database),
        Effect.provideService(EventV2Bridge.Service, eventBridge),
        Effect.orDie,
      )
    },
  } satisfies SessionProcessor.Interface
  return { processors, session, provider, database }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it.live("session.processor effect tests capture llm input cleanly", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider, database } = yield* boot()

        yield* llm.text("hello")

        const { chat, parent } = yield* runningSession("hi")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const input = {
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "hi" }],
          tools: {},
        } satisfies LLM.StreamInput

        const value = yield* handle.process(input)
        const parts = yield* MessageV2.parts(msg.id)
        const calls = yield* llm.calls

        expect(value).toBe("continue")
        expect(calls).toBe(1)
        expect(parts.some((part) => part.type === "text" && part.text === "hello")).toBe(true)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor commits exact capacity decisions before opening the provider stream", () =>
  provideTmpdirServer(
    ({ dir, llm: server }) =>
      Effect.gen(function* () {
        const { processors, provider, database } = yield* boot()
        const llm = yield* LLM.Service
        if (!llm.plan || !llm.finalize) return yield* Effect.die("Gate 18 LLM planning seam is unavailable")

        const readCuts = (assistantMessageID: MessageID) =>
          database.db
            .transaction((tx) =>
              Effect.all([
                RetainedSteering.readCut(tx, assistantMessageID),
                LearningContext.readCut(tx, assistantMessageID),
              ]),
            )
            .pipe(
              Effect.flatMap(([retained, learning]) => {
                if (retained.type !== "available" || learning.type !== "available") {
                  return Effect.die(`Model operation ${assistantMessageID} has no complete context cuts`)
                }
                return Effect.succeed({ retained: retained.cut, learning })
              }),
            )

        const fixedSession = yield* runningSession("fixed envelope", { model: 4, tool: 0 })
        const fixedMessage = yield* assistant(fixedSession.chat.id, fixedSession.parent.id, path.resolve(dir))
        const baseModel = yield* provider.getModel(ref.providerID, ref.modelID)
        const fixedModel = {
          ...baseModel,
          limit: { ...baseModel.limit, context: 2, input: 1, output: 1 },
        }
        const fixedInput = {
          user: {
            id: fixedSession.parent.id,
            sessionID: fixedSession.chat.id,
            role: "user",
            time: fixedSession.parent.time,
            agent: fixedSession.parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: fixedSession.chat.id,
          composition: { type: "interactive" as const },
          model: fixedModel,
          agent: agent(),
          system: ["Keep this mandatory instruction."],
          messages: [{ role: "user" as const, content: "fixed current learner input" }],
          compactableMessages: [],
          tools: {},
        } satisfies LLM.StreamInput
        const fixedPlan = yield* llm.plan(fixedInput)
        const fixedTurnID = yield* admitTurnModel(
          fixedSession.chat.id,
          fixedSession.parent,
          fixedMessage.id,
          { model: 4, tool: 0 },
          fixedPlan.capabilityBasis,
        )
        const fixedHandle = yield* processors.create({
          assistantMessage: fixedMessage,
          sessionID: fixedSession.chat.id,
          model: fixedModel,
          turnID: fixedTurnID,
        })
        const fixedCuts = yield* readCuts(fixedMessage.id)
        const fixedPrepared = yield* llm.finalize({
          plan: fixedPlan,
          retainedSteeringCut: fixedCuts.retained,
          learningContextCut: fixedCuts.learning.cut,
          learningContextRenderedBlock: fixedCuts.learning.renderedBlock,
        })
        expect(fixedPrepared.capacity?.assessment).toMatchObject({
          classification: "capacity_invalid",
          decision: "fixed_overflow",
          removableEstimatedTokens: 0,
        })
        let fixedOpened = false
        const fixedOutcome = yield* fixedHandle.process({
          ...fixedPrepared,
          open: () => {
            fixedOpened = true
            return Stream.empty
          },
        })
        expect(fixedOutcome).toBe("stop")
        expect(fixedOpened).toBe(false)
        expect(SessionV1.ContextOverflowError.isInstance(fixedHandle.message.error)).toBe(true)
        const fixedCapacity = yield* database.db.transaction((tx) => LearningContext.readCapacity(tx, fixedMessage.id))
        expect(fixedCapacity).toMatchObject({
          type: "available",
          assessment: { classification: "capacity_invalid", decision: "fixed_overflow" },
        })

        const historySession = yield* runningSession("history envelope", { model: 4, tool: 0 })
        const historyMessage = yield* assistant(historySession.chat.id, historySession.parent.id, path.resolve(dir))
        const old = { role: "user" as const, content: `old:${"h".repeat(30_000)}` }
        const current = { role: "user" as const, content: "current learner input" }
        const removableMessageIDs = [MessageID.make("msg_capacity-history-old")]
        const historyInput = {
          user: {
            id: historySession.parent.id,
            sessionID: historySession.chat.id,
            role: "user",
            time: historySession.parent.time,
            agent: historySession.parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: historySession.chat.id,
          composition: { type: "interactive" as const },
          model: baseModel,
          agent: agent(),
          system: ["Keep the current learner input."],
          messages: [old, current],
          compactableMessages: [old],
          compactionSelection: {
            tailStartMessageID: MessageID.make("msg_capacity-history-current"),
            removableMessageIDs,
            removableMessageIDsFingerprint: LearningContext.canonicalFingerprint(
              LearningContext.toJsonValue(removableMessageIDs),
            ),
          },
          tools: {},
        } satisfies LLM.StreamInput
        const measuredPlan = yield* llm.plan(historyInput)
        const historyTurnID = yield* admitTurnModel(
          historySession.chat.id,
          historySession.parent,
          historyMessage.id,
          { model: 4, tool: 0 },
          measuredPlan.capabilityBasis,
        )
        const historyHandle = yield* processors.create({
          assistantMessage: historyMessage,
          sessionID: historySession.chat.id,
          model: baseModel,
          turnID: historyTurnID,
        })
        const historyCuts = yield* readCuts(historyMessage.id)
        const measured = yield* llm.finalize({
          plan: measuredPlan,
          retainedSteeringCut: historyCuts.retained,
          learningContextCut: historyCuts.learning.cut,
          learningContextRenderedBlock: historyCuts.learning.renderedBlock,
        })
        const measuredCapacity = measured.capacity?.assessment
        if (!measuredCapacity || measuredCapacity.removableEstimatedTokens === 0) {
          return yield* Effect.die("Expected a measurable compactable history prefix")
        }
        const usableInputLimit =
          measuredCapacity.fixedEstimatedTokens + Math.floor(measuredCapacity.removableEstimatedTokens / 2)
        const constrainedModel = {
          ...baseModel,
          limit: {
            ...baseModel.limit,
            context: usableInputLimit + (measuredCapacity.outputReserveTokens ?? baseModel.limit.output),
          },
        }
        const constrainedPlan = yield* llm.plan({ ...historyInput, model: constrainedModel })
        expect(constrainedPlan.capabilityBasis).toEqual(measuredPlan.capabilityBasis)
        const historyPrepared = yield* llm.finalize({
          plan: constrainedPlan,
          retainedSteeringCut: historyCuts.retained,
          learningContextCut: historyCuts.learning.cut,
          learningContextRenderedBlock: historyCuts.learning.renderedBlock,
        })
        expect(historyPrepared.capacity?.assessment).toMatchObject({
          classification: "capacity_known",
          decision: "history_overflow",
          usableInputLimitTokens: usableInputLimit,
        })
        let historyOpened = false
        const historyOutcome = yield* historyHandle.process({
          ...historyPrepared,
          open: () => {
            historyOpened = true
            return Stream.empty
          },
        })
        expect(historyOutcome).toBe("compact")
        expect(historyOpened).toBe(false)
        expect(historyHandle.message.error).toBeUndefined()
        const historyCapacity = yield* database.db.transaction((tx) =>
          LearningContext.readCapacity(tx, historyMessage.id),
        )
        expect(historyCapacity).toMatchObject({
          type: "available",
          assessment: { classification: "capacity_known", decision: "history_overflow" },
        })
        expect(yield* server.calls).toBe(0)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live(
  "post-admission capacity failure preserves cuts and never opens or redispatches the provider",
  () =>
    provideTmpdirServer(
      ({ dir, llm: server }) =>
        Effect.gen(function* () {
          const { processors, provider, database } = yield* boot()
          const events = yield* EventV2Bridge.Service
          const llm = yield* LLM.Service
          if (!llm.plan || !llm.finalize) return yield* Effect.die("Gate 18 LLM planning seam is unavailable")

          const seeded = yield* runningSession("capacity fault", { model: 2, tool: 0 })
          const message = yield* assistant(seeded.chat.id, seeded.parent.id, path.resolve(dir))
          const model = yield* provider.getModel(ref.providerID, ref.modelID)
          const input = {
            user: seeded.parent,
            sessionID: seeded.chat.id,
            composition: { type: "interactive" as const },
            model,
            agent: agent(),
            system: ["Keep the admitted context cuts durable across a capacity write fault."],
            messages: [{ role: "user" as const, content: "capacity fault" }],
            compactableMessages: [],
            tools: {},
          } satisfies LLM.StreamInput
          const plan = yield* llm.plan(input)
          const turnID = yield* admitTurnModel(
            seeded.chat.id,
            seeded.parent,
            message.id,
            { model: 2, tool: 0 },
            plan.capabilityBasis,
          )
          const handle = yield* processors.create({
            assistantMessage: message,
            sessionID: seeded.chat.id,
            model,
            turnID,
          })
          const operation = yield* database.db.transaction((tx) =>
            TurnLifecycle.modelOperation(tx, {
              turnID,
              sessionID: seeded.chat.id,
              assistantMessageID: message.id,
            }),
          )
          yield* handle.bindModelOperation(operation)
          const before = yield* database.db.transaction((tx) =>
            Effect.all({
              retained: RetainedSteering.readCut(tx, message.id),
              learning: LearningContext.readCut(tx, message.id),
              capacity: LearningContext.readCapacity(tx, message.id),
            }),
          )
          if (before.retained.type !== "available" || before.learning.type !== "available") {
            return yield* Effect.die("Model admission did not commit both context cuts")
          }
          expect(before.capacity).toEqual({ type: "not_found", assistantMessageID: message.id })
          const prepared = yield* llm.finalize({
            plan,
            retainedSteeringCut: before.retained.cut,
            learningContextCut: before.learning.cut,
            learningContextRenderedBlock: before.learning.renderedBlock,
          })
          expect(prepared.capacity?.assessment.decision).toBe("fit")

          yield* database.db.run(
            sql.raw(`
            CREATE TEMP TRIGGER gate18_capacity_insert_fault
            BEFORE INSERT ON turn_model_capacity
            BEGIN
              SELECT RAISE(ABORT, 'injected Gate 18 capacity failure');
            END
          `),
          )
          let opens = 0
          const outcome = yield* handle
            .process({
              ...prepared,
              open: (abort) => {
                opens += 1
                return prepared.open(abort)
              },
            })
            .pipe(
              Effect.ensuring(
                database.db.run(sql.raw("DROP TRIGGER IF EXISTS gate18_capacity_insert_fault")).pipe(Effect.orDie),
              ),
            )

          expect(outcome).toBe("stop")
          expect(opens).toBe(0)
          expect(yield* server.calls).toBe(0)
          const after = yield* database.db.transaction((tx) =>
            Effect.all({
              retained: RetainedSteering.readCut(tx, message.id),
              learning: LearningContext.readCut(tx, message.id),
              capacity: LearningContext.readCapacity(tx, message.id),
              model: TurnLifecycle.modelOperation(tx, {
                turnID,
                sessionID: seeded.chat.id,
                assistantMessageID: message.id,
              }),
              turn: TurnLifecycle.info(tx, turnID),
            }),
          )
          expect(after.retained).toEqual(before.retained)
          expect(after.learning).toEqual(before.learning)
          expect(after.capacity).toEqual({ type: "not_found", assistantMessageID: message.id })
          expect(after.model.state).toBe("failed")
          expect(after.turn.state).toBe("running")
          const stored = yield* MessageV2.get({ sessionID: seeded.chat.id, messageID: message.id })
          expect(stored.info).toMatchObject({ role: "assistant", finish: "error" })
          expect(stored.info.role === "assistant" && stored.info.error).toBeDefined()

          const recovered = yield* recoverTurns(events, Date.now() + 1_000)
          const recoveredTarget = recovered.filter((turn) => turn.id === turnID)
          expect(recoveredTarget).toHaveLength(1)
          expect(recoveredTarget[0]).toMatchObject({
            id: turnID,
            state: "interrupted",
            terminal: { reason: "startup_recovery" },
          })
          expect(yield* recoverTurns(events, Date.now() + 2_000)).toEqual([])
          expect(opens).toBe(0)
          expect(yield* server.calls).toBe(0)
          expect(yield* database.db.transaction((tx) => LearningContext.readCapacity(tx, message.id))).toEqual({
            type: "not_found",
            assistantMessageID: message.id,
          })
        }),
      { config: (url) => providerCfg(url) },
    ),
  { timeout: 20_000 },
)

itCapacityCompaction.live(
  "capacity admission and compaction consume one exact four-turn removable prefix",
  () =>
    provideTmpdirServer(
      ({ dir, llm: server }) =>
        Effect.gen(function* () {
          const { processors, provider, database } = yield* boot()
          const session = yield* Session.Service
          const llm = yield* LLM.Service
          const compaction = yield* SessionCompaction.Service
          if (!llm.plan || !llm.finalize) return yield* Effect.die("Gate 18 LLM planning seam is unavailable")

          const seeded = yield* materializeTestSession({
            text: "CURRENT-D",
            settle: false,
            limits: { model: 4, tool: 0 },
            time: 4_000,
          })
          const historicalTurn = (input: { label: string; text: string; time: number }) =>
            Effect.gen(function* () {
              const user = yield* session.updateMessage({
                id: MessageID.ascending(),
                role: "user",
                sessionID: seeded.info.id,
                agent: "repa",
                model: { providerID: ref.providerID, modelID: ref.modelID },
                time: { created: input.time },
              })
              yield* session.updatePart({
                id: PartID.ascending(),
                messageID: user.id,
                sessionID: seeded.info.id,
                type: "text",
                text: input.text,
              })
              const reply = yield* session.updateMessage({
                id: MessageID.ascending(),
                role: "assistant",
                sessionID: seeded.info.id,
                mode: "repa",
                agent: "repa",
                path: { cwd: path.resolve(dir), root: path.resolve(dir) },
                cost: 0,
                tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                modelID: ref.modelID,
                providerID: ref.providerID,
                parentID: user.id,
                time: { created: input.time + 1 },
                finish: "end_turn",
              })
              yield* session.updatePart({
                id: PartID.ascending(),
                messageID: reply.id,
                sessionID: seeded.info.id,
                type: "text",
                text: `${input.label}-REPLY`,
              })
              return { user, reply }
            })

          const a = yield* historicalTurn({
            label: "REMOVE-A",
            text: `REMOVE-A:${"a".repeat(24_000)}`,
            time: 1_000,
          })
          const b = yield* historicalTurn({
            label: "REMOVE-B",
            text: `REMOVE-B:${"b".repeat(24_000)}`,
            time: 2_000,
          })
          const c = yield* historicalTurn({
            label: "KEEP-C",
            text: `KEEP-C:${"c".repeat(1_000)}`,
            time: 3_000,
          })
          const baseModel = yield* provider.getModel(ref.providerID, ref.modelID)
          const original = yield* MessageV2.filterCompactedEffect(seeded.info.id)
          expect(original.map((message) => message.info.id)).toEqual([
            a.user.id,
            a.reply.id,
            b.user.id,
            b.reply.id,
            c.user.id,
            c.reply.id,
            seeded.user.id,
          ])
          const compactable = yield* compaction.compactable({ messages: original, model: baseModel })
          const removableMessageIDs = [a.user.id, a.reply.id, b.user.id, b.reply.id]
          expect(compactable.messages.map((message) => message.info.id)).toEqual(removableMessageIDs)
          expect(compactable.selection).toEqual({
            tailStartMessageID: c.user.id,
            removableMessageIDs,
            removableMessageIDsFingerprint: LearningContext.canonicalFingerprint(
              LearningContext.toJsonValue(removableMessageIDs),
            ),
          })
          if (!compactable.selection) return yield* Effect.die("Expected an exact four-turn compaction selection")

          const fullModelMessages = yield* MessageV2.toModelMessagesEffect(original, baseModel)
          const compactableModelMessages = yield* MessageV2.toModelMessagesEffect(compactable.messages, baseModel)
          const sourceAssistant = yield* assistant(seeded.info.id, seeded.user.id, path.resolve(dir))
          const input = {
            user: seeded.user,
            sessionID: seeded.info.id,
            composition: { type: "interactive" as const },
            model: baseModel,
            agent: agent(),
            system: ["Keep the retained C and current D turns exact."],
            messages: fullModelMessages,
            compactableMessages: compactableModelMessages,
            compactionSelection: compactable.selection,
            tools: {},
          } satisfies LLM.StreamInput
          const measuredPlan = yield* llm.plan(input)
          const turnID = yield* admitTurnModel(
            seeded.info.id,
            seeded.user,
            sourceAssistant.id,
            { model: 4, tool: 0 },
            measuredPlan.capabilityBasis,
          )
          const readCuts = (assistantMessageID: MessageID) =>
            database.db
              .transaction((tx) =>
                Effect.all([
                  RetainedSteering.readCut(tx, assistantMessageID),
                  LearningContext.readCut(tx, assistantMessageID),
                ]),
              )
              .pipe(
                Effect.flatMap(([retained, learning]) => {
                  if (retained.type !== "available" || learning.type !== "available") {
                    return Effect.die(`Model operation ${assistantMessageID} has no complete context cuts`)
                  }
                  return Effect.succeed({ retained: retained.cut, learning })
                }),
              )
          const sourceCuts = yield* readCuts(sourceAssistant.id)
          const measured = yield* llm.finalize({
            plan: measuredPlan,
            retainedSteeringCut: sourceCuts.retained,
            learningContextCut: sourceCuts.learning.cut,
            learningContextRenderedBlock: sourceCuts.learning.renderedBlock,
          })
          const measuredCapacity = measured.capacity?.assessment
          if (!measuredCapacity || measuredCapacity.removableEstimatedTokens === 0) {
            return yield* Effect.die("Expected measurable A+B removable history")
          }
          const usableInputLimit =
            measuredCapacity.fixedEstimatedTokens + Math.floor(measuredCapacity.removableEstimatedTokens * 0.4)
          expect(usableInputLimit).toBeGreaterThan(measuredCapacity.fixedEstimatedTokens)
          expect(usableInputLimit).toBeLessThan(
            measuredCapacity.fixedEstimatedTokens + Math.floor(measuredCapacity.removableEstimatedTokens / 2),
          )
          const constrainedModel = {
            ...baseModel,
            limit: {
              ...baseModel.limit,
              context: usableInputLimit + (measuredCapacity.outputReserveTokens ?? baseModel.limit.output),
            },
          }
          const constrainedPlan = yield* llm.plan({ ...input, model: constrainedModel })
          expect(constrainedPlan.capabilityBasis).toEqual(measuredPlan.capabilityBasis)
          const prepared = yield* llm.finalize({
            plan: constrainedPlan,
            retainedSteeringCut: sourceCuts.retained,
            learningContextCut: sourceCuts.learning.cut,
            learningContextRenderedBlock: sourceCuts.learning.renderedBlock,
          })
          expect(prepared.capacity?.assessment).toMatchObject({
            decision: "history_overflow",
            removableHistory: {
              tailStartMessageID: c.user.id,
              messageCount: removableMessageIDs.length,
              messageIDsFingerprint: compactable.selection.removableMessageIDsFingerprint,
            },
          })
          const sourceHandle = yield* processors.create({
            assistantMessage: sourceAssistant,
            sessionID: seeded.info.id,
            model: constrainedModel,
            turnID,
          })
          const sourceOperation = yield* database.db.transaction((tx) =>
            TurnLifecycle.modelOperation(tx, {
              turnID,
              sessionID: seeded.info.id,
              assistantMessageID: sourceAssistant.id,
            }),
          )
          yield* sourceHandle.bindModelOperation(sourceOperation)
          const sourceResult = yield* sourceHandle.process(prepared)
          expect(sourceResult).toBe("compact")
          expect(sourceHandle.compactionMode).toBe("capacity_history")
          expect(sourceHandle.compactionSelection).toEqual(compactable.selection)
          expect(yield* server.calls).toBe(0)

          yield* compaction.create({
            sessionID: seeded.info.id,
            agent: seeded.user.agent,
            model: seeded.user.model,
            auto: true,
            capacityHistory: { sourceAssistantMessageID: sourceAssistant.id, selection: compactable.selection },
          })
          const withMarker = yield* MessageV2.filterCompactedEffect(seeded.info.id)
          const marker = withMarker.findLast(
            (message) => message.info.role === "user" && message.parts.some((part) => part.type === "compaction"),
          )
          if (!marker) return yield* Effect.die("Expected a capacity-history compaction marker")

          yield* server.text("A+B anchored summary", { usage: { input: 10, output: 4 } })
          expect(
            yield* compaction.process({
              parentID: marker.info.id,
              messages: withMarker,
              sessionID: seeded.info.id,
              auto: true,
            }),
          ).toBe("continue")
          expect(yield* server.calls).toBe(1)
          const summaryInput = JSON.stringify((yield* server.inputs)[0])
          expect(summaryInput).toContain("REMOVE-A")
          expect(summaryInput).toContain("REMOVE-B")
          expect(summaryInput).not.toContain("KEEP-C")
          expect(summaryInput).not.toContain("CURRENT-D")

          const compacted = yield* MessageV2.filterCompactedEffect(seeded.info.id)
          expect(
            compacted.filter(
              (message) =>
                message.info.role === "user" &&
                message.parts.some((part) => part.type === "text" && part.text === "CURRENT-D"),
            ),
          ).toHaveLength(1)
          expect(
            compacted.filter(
              (message) => message.info.role === "assistant" && message.info.summary && message.info.finish,
            ),
          ).toHaveLength(1)
          expect(
            compacted.filter(
              (message) => message.info.role === "user" && message.parts.some((part) => part.type === "compaction"),
            ),
          ).toHaveLength(1)
          const continuation = compacted.findLast(
            (message) =>
              message.info.role === "user" &&
              message.parts.some((part) => part.type === "text" && part.metadata?.compaction_continue === true),
          )
          if (!continuation || continuation.info.role !== "user") {
            return yield* Effect.die("Expected one synthetic post-compaction continuation")
          }

          const postCompactable = yield* compaction.compactable({ messages: compacted, model: constrainedModel })
          const nextAssistant = yield* assistant(seeded.info.id, continuation.info.id, path.resolve(dir))
          const nextInput = {
            user: continuation.info,
            sessionID: seeded.info.id,
            composition: { type: "interactive" as const },
            model: constrainedModel,
            agent: agent(),
            system: ["Continue from the anchored summary and retained tail."],
            messages: yield* MessageV2.toModelMessagesEffect(compacted, constrainedModel),
            compactableMessages: yield* MessageV2.toModelMessagesEffect(postCompactable.messages, constrainedModel),
            compactionSelection: postCompactable.selection,
            tools: {},
          } satisfies LLM.StreamInput
          const nextPlan = yield* llm.plan(nextInput)
          const nextTurnID = yield* admitTurnModel(
            seeded.info.id,
            continuation.info,
            nextAssistant.id,
            { model: 4, tool: 0 },
            nextPlan.capabilityBasis,
          )
          expect(nextTurnID).toBe(turnID)
          const nextCuts = yield* readCuts(nextAssistant.id)
          const nextPrepared = yield* llm.finalize({
            plan: nextPlan,
            retainedSteeringCut: nextCuts.retained,
            learningContextCut: nextCuts.learning.cut,
            learningContextRenderedBlock: nextCuts.learning.renderedBlock,
          })
          expect(nextPrepared.capacity?.assessment.decision).toBe("fit")
          yield* server.text("continued after one compaction", { usage: { input: 20, output: 5 } })
          const nextHandle = yield* processors.create({
            assistantMessage: nextAssistant,
            sessionID: seeded.info.id,
            model: constrainedModel,
            turnID: nextTurnID,
          })
          const nextOperation = yield* database.db.transaction((tx) =>
            TurnLifecycle.modelOperation(tx, {
              turnID: nextTurnID,
              sessionID: seeded.info.id,
              assistantMessageID: nextAssistant.id,
            }),
          )
          yield* nextHandle.bindModelOperation(nextOperation)
          expect(yield* nextHandle.process(nextPrepared)).toBe("continue")
          expect(yield* server.calls).toBe(2)
          const finalMessages = yield* session.messages({ sessionID: seeded.info.id })
          expect(
            finalMessages.filter(
              (message) => message.info.role === "user" && message.parts.some((part) => part.type === "compaction"),
            ),
          ).toHaveLength(1)
          expect(
            finalMessages.filter((message) => message.info.role === "assistant" && message.info.summary),
          ).toHaveLength(1)
        }),
      {
        config: (url) => ({
          ...providerCfg(url),
          compaction: { auto: true, tail_turns: 2, preserve_recent_tokens: 8_000 },
        }),
      },
    ),
  { timeout: 30_000 },
)

it.live("session.processor effect tests preserve text start time", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const database = yield* Database.Service
        const gate = defer<void>()
        const { processors, session, provider } = yield* boot()

        yield* llm.push(
          raw({
            head: [
              {
                id: "chatcmpl-test",
                object: "chat.completion.chunk",
                choices: [{ delta: { role: "assistant" } }],
              },
              {
                id: "chatcmpl-test",
                object: "chat.completion.chunk",
                choices: [{ delta: { content: "hello" } }],
              },
            ],
            wait: gate.promise,
            tail: [
              {
                id: "chatcmpl-test",
                object: "chat.completion.chunk",
                choices: [{ delta: {}, finish_reason: "stop" }],
              },
            ],
          }),
        )

        const { chat, parent } = yield* runningSession("hi")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "hi" }],
            tools: {},
          })
          .pipe(Effect.forkChild)

        yield* waitFor(
          MessageV2.parts(msg.id).pipe(
            Effect.map((parts) => parts.find((part): part is SessionV1.TextPart => part.type === "text")),
            Effect.provideService(Database.Service, database),
          ),
          "timed out waiting for text part",
        )
        yield* Effect.sleep("20 millis")
        gate.resolve()

        const exit = yield* Fiber.await(run)
        const text = (yield* MessageV2.parts(msg.id)).find((part): part is SessionV1.TextPart => part.type === "text")

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(text?.text).toBe("hello")
        expect(text?.time?.start).toBeDefined()
        expect(text?.time?.end).toBeDefined()
        if (!text?.time?.start || !text.time.end) return
        expect(text.time.start).toBeLessThan(text.time.end)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

itAbcTool.live("session.processor seals A/B/C before one FIFO tool effect and projects exhaustion", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const database = yield* Database.Service
        const { processors, session, provider } = yield* boot()
        const { chat, parent } = yield* runningSession("run three tools", { model: 4, tool: 1 })
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const turnID = yield* admitTurnModel(chat.id, parent, msg.id, { model: 4, tool: 1 })
        const effects: string[] = []
        const observedAtEffect: Array<{ candidateCount: number; sealed: boolean; modelState: string }> = []
        const local = (name: string) =>
          tool({
            description: name,
            inputSchema: z.object({ value: z.string() }),
            execute: async () => {
              const [candidates, model] = await Effect.runPromise(
                Effect.all([
                  database.db.select().from(TurnToolCandidateTable).all().pipe(Effect.orDie),
                  database.db
                    .select()
                    .from(TurnModelOperationTable)
                    .where(eq(TurnModelOperationTable.assistant_message_id, msg.id))
                    .get()
                    .pipe(Effect.orDie),
                ]),
              )
              effects.push(name)
              observedAtEffect.push({
                candidateCount: candidates.length,
                sealed: model?.candidates_sealed ?? false,
                modelState: model?.state ?? "missing",
              })
              return { title: name, metadata: {}, output: name }
            },
          })
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
          turnID,
        })

        expect(
          yield* handle.process({
            user: parent,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "run three tools" }],
            tools: { tool_a: local("A"), tool_b: local("B"), tool_c: local("C") },
          }),
        ).toBe("continue")

        expect(effects).toEqual(["A"])
        expect(observedAtEffect).toEqual([{ candidateCount: 3, sealed: true, modelState: "completed" }])
        const turn = yield* database.db.transaction((tx) => TurnLifecycle.lookup(tx, turnID)).pipe(Effect.orDie)
        expect(turn).toMatchObject({
          type: "available",
          turn: {
            state: "exhausted",
            counters: { model: 1, tool: 1 },
            terminal: { outcome: "exhausted", reason: "tool_limit" },
          },
        })

        const parts = (yield* MessageV2.parts(msg.id)).filter(
          (part): part is SessionV1.ToolPart => part.type === "tool",
        )
        expect(parts.map((part) => [part.callID, part.state.status])).toEqual([
          ["call-a", "completed"],
          ["call-b", "error"],
          ["call-c", "error"],
        ])
        expect(parts[1]).toMatchObject({
          state: {
            metadata: {
              disposition: "not_started_limit",
              repaTurnExhaustion: {
                schemaVersion: 1,
                counter: "tool",
                observed: 1,
                limit: 1,
                turnID,
                rejectedAttemptID: parts[1]!.id,
                envelopeFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
              },
            },
          },
        })
        expect(parts[2]?.state.status === "error" ? parts[2].state.metadata : undefined).not.toHaveProperty(
          "repaTurnExhaustion",
        )
        const storedCandidates = yield* database.db
          .select()
          .from(TurnToolCandidateTable)
          .where(eq(TurnToolCandidateTable.turn_id, turnID))
          .orderBy(TurnToolCandidateTable.emission_ordinal)
          .all()
          .pipe(Effect.orDie)
        expect(storedCandidates.map((candidate) => candidate.state)).toEqual([
          "admitted",
          "not_started_limit",
          "not_started_turn_exhausted",
        ])

        const replayB = yield* database.db
          .transaction((tx) =>
            TurnLifecycle.admitTool(tx, {
              turnID,
              sessionID: chat.id,
              assistantMessageID: msg.id,
              partID: storedCandidates[1].part_id,
              timeAdmitted: Date.now(),
            }),
          )
          .pipe(Effect.orDie)
        const replayC = yield* database.db
          .transaction((tx) =>
            TurnLifecycle.admitTool(tx, {
              turnID,
              sessionID: chat.id,
              assistantMessageID: msg.id,
              partID: storedCandidates[2].part_id,
              timeAdmitted: Date.now(),
            }),
          )
          .pipe(Effect.orDie)
        expect(replayB).toMatchObject({ type: "not_started", replay: true, candidate: { state: "not_started_limit" } })
        expect(replayC).toMatchObject({
          type: "not_started",
          replay: true,
          candidate: { state: "not_started_turn_exhausted" },
        })
        expect(effects).toEqual(["A"])
      }),
    { config: cfg },
  ),
)

it.live("session.processor effect tests stop after token overflow requests compaction", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const database = yield* Database.Service
        const { processors, session, provider } = yield* boot()

        yield* llm.text("after", { usage: { input: 100_000, output: 0 } })

        const { chat, parent } = yield* runningSession("compact")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const base = yield* provider.getModel(ref.providerID, ref.modelID)
        const mdl = { ...base, limit: { context: 100_000, output: 10_000 } }
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const value = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "compact" }],
          tools: {},
        })

        const parts = yield* MessageV2.parts(msg.id)

        expect(value).toBe("compact")
        expect(parts.some((part) => part.type === "text" && part.text === "after")).toBe(true)
        expect(parts.some((part) => part.type === "step-finish")).toBe(true)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests capture reasoning from http mock", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const database = yield* Database.Service
        const { processors, session, provider } = yield* boot()

        yield* llm.push(reply().reason("think").text("done").stop())

        const { chat, parent } = yield* runningSession("reason")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const value = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "reason" }],
          tools: {},
        })

        const parts = yield* MessageV2.parts(msg.id)
        const reasoning = parts.find((part): part is SessionV1.ReasoningPart => part.type === "reasoning")
        const text = parts.find((part): part is SessionV1.TextPart => part.type === "text")

        expect(value).toBe("continue")
        expect(yield* llm.calls).toBe(1)
        expect(reasoning?.text).toBe("think")
        expect(text?.text).toBe("done")
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests reset reasoning state across retries", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()

        yield* llm.push(reply().reason("one").reset(), reply().reason("two").stop())

        const { chat, parent } = yield* runningSession("reason")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const value = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "reason" }],
          tools: {},
        })

        const parts = yield* MessageV2.parts(msg.id)
        const reasoning = parts.filter((part): part is SessionV1.ReasoningPart => part.type === "reasoning")

        expect(value).toBe("continue")
        expect(yield* llm.calls).toBe(2)
        expect(reasoning.some((part) => part.text === "two")).toBe(true)
        expect(reasoning.some((part) => part.text === "onetwo")).toBe(false)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests do not retry unknown json errors", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()

        yield* llm.error(400, { error: { message: "no_kv_space" } })

        const { chat, parent } = yield* runningSession("json")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const value = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "json" }],
          tools: {},
        })

        expect(value).toBe("stop")
        expect(yield* llm.calls).toBe(1)
        expect(handle.message.error?.name).toBe("APIError")
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests retry recognized structured json errors", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider, database } = yield* boot()

        yield* llm.error(429, { type: "error", error: { type: "too_many_requests" } })
        yield* llm.text("after")

        const { chat, parent } = yield* runningSession("retry json")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const value = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "retry json" }],
          tools: {},
        })

        const parts = yield* MessageV2.parts(msg.id)
        const active = yield* database.db.transaction((tx) => TurnLifecycle.active(tx, chat.id))

        expect(value).toBe("continue")
        expect(yield* llm.calls).toBe(2)
        expect(active?.counters.model).toBe(1)
        expect(
          yield* database.db
            .select()
            .from(TurnModelOperationTable)
            .where(eq(TurnModelOperationTable.session_id, chat.id))
            .all(),
        ).toHaveLength(1)
        expect(parts.some((part) => part.type === "text" && part.text === "after")).toBe(true)
        expect(handle.message.error).toBeUndefined()
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests publish retry status updates", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const events = yield* EventV2Bridge.Service

        yield* llm.error(503, { error: "boom" })
        yield* llm.text("")

        const { chat, parent } = yield* runningSession("retry")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const states: number[] = []
        const off = yield* events.listen((evt) => {
          if (evt.type !== SessionStatus.Event.Status.type) return Effect.void
          const data = evt.data as typeof SessionStatus.Event.Status.data.Type
          if (data.sessionID === chat.id && data.status.type === "retry") states.push(data.status.attempt)
          return Effect.void
        })
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const value = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "retry" }],
          tools: {},
        })

        yield* off

        expect(value).toBe("continue")
        expect(yield* llm.calls).toBe(2)
        expect(states).toStrictEqual([1])
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests compact on structured context overflow", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()

        yield* llm.error(400, { type: "error", error: { code: "context_length_exceeded" } })

        const { chat, parent } = yield* runningSession("compact json")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const value = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "compact json" }],
          tools: {},
        })

        expect(value).toBe("compact")
        expect(yield* llm.calls).toBe(1)
        expect(handle.message.error).toBeUndefined()
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests complete AI SDK tool calls when native flag is off", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()

        yield* llm.tool("lookup", { query: "weather" })

        const { chat, parent } = yield* runningSession("tool")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const value = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "tool" }],
          tools: {
            lookup: tool({
              description: "Look up information",
              inputSchema: z.object({ query: z.string() }),
              execute: async (input) => ({
                title: "Weather lookup",
                output: `result:${input.query}`,
                metadata: { source: "test" },
              }),
            }),
          },
        })

        const parts = yield* MessageV2.parts(msg.id)
        const call = parts.find((part): part is SessionV1.ToolPart => part.type === "tool")

        expect(value).toBe("continue")
        expect(yield* llm.calls).toBe(1)
        expect(call?.callID).toBe("call_1")
        expect(call?.tool).toBe("lookup")
        expect(call?.state.status).toBe("completed")
        if (call?.state.status !== "completed") return
        expect(call.state.input).toEqual({ query: "weather" })
        expect(call.state.output).toBe("result:weather")
        expect(call.state.title).toBe("Weather lookup")
        expect(call.state.metadata).toEqual({ source: "test" })
        expect(call.state.time.start).toBeDefined()
        expect(call.state.time.end).toBeDefined()
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests run tool preparation before the local body", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider, database } = yield* boot()
        const bridge = yield* EffectBridge.make()
        const order: string[] = []
        let partBeforePreparation: SessionV1.Part | undefined
        let preparedRegistration: SessionProcessor.RegisteredToolCall | undefined
        let advancedFrontier: LearningFrontier.Snapshot | undefined
        let frontierAtBody: Turn.ToolInvocation | undefined

        yield* llm.tool("prepared", {})

        const { chat, parent } = yield* runningSession("prepared tool")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })
        const prepared = Object.assign(
          tool({
            description: "Run only after the preparation seam",
            inputSchema: z.object({}),
            execute: async () => {
              if (!preparedRegistration) throw new Error("Tool body has no durable registration")
              frontierAtBody = await bridge.promise(
                database.db.transaction((tx) =>
                  TurnLifecycle.invocation(tx, {
                    turnID: preparedRegistration!.turnID,
                    partID: preparedRegistration!.partID,
                  }),
                ),
              )
              order.push("body")
              return { title: "Prepared", output: "prepared", metadata: {} }
            },
          }),
          {
            [SessionProcessor.ToolCallPreparation]: async (
              _input: unknown,
              registration: SessionProcessor.RegisteredToolCall,
            ) => {
              preparedRegistration = registration
              partBeforePreparation = await bridge.promise(
                session.getPart({
                  partID: registration.partID,
                  messageID: registration.assistantMessageID,
                  sessionID: registration.sessionID,
                }),
              )
              await bridge.promise(
                session.updatePart({
                  id: registration.partID,
                  messageID: registration.assistantMessageID,
                  sessionID: registration.sessionID,
                  type: "tool",
                  tool: "prepared",
                  callID: registration.callID,
                  state: { status: "pending", input: {}, raw: "" },
                }),
              )
              advancedFrontier = await bridge.promise(
                database.db.transaction((tx) => LearningFrontier.advance(tx, { time: Date.now() })),
              )
              order.push("prepare")
            },
          },
        )

        const value = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "prepared tool" }],
          tools: { prepared },
        })
        const call = (yield* MessageV2.parts(msg.id)).find((part): part is SessionV1.ToolPart => part.type === "tool")
        const invocation = preparedRegistration
          ? yield* database.db.transaction((tx) =>
              TurnLifecycle.invocation(tx, {
                turnID: preparedRegistration!.turnID,
                partID: preparedRegistration!.partID,
              }),
            )
          : undefined

        expect(value).toBe("continue")
        expect(partBeforePreparation).toMatchObject({
          id: preparedRegistration?.partID,
          type: "tool",
          state: { status: "pending" },
        })
        expect(order).toEqual(["prepare", "body"])
        expect(preparedRegistration?.partID).toBe(call?.id)
        expect(call?.state.status).toBe("completed")
        expect(frontierAtBody?.consumedSharedFrontier.sequence).toBe(advancedFrontier?.sequence)
        expect(frontierAtBody && DateTime.toEpochMillis(frontierAtBody.consumedSharedFrontier.time)).toBe(
          advancedFrontier?.time,
        )
        expect(invocation?.resultingSharedFrontier).toBeUndefined()
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests do not overwrite a terminal Part prepared before execution", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const bridge = yield* EffectBridge.make()

        yield* llm.tool("settled", {})

        const { chat, parent } = yield* runningSession("settled tool")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })
        const settled = Object.assign(
          tool({
            description: "Return an already settled result",
            inputSchema: z.object({}),
            execute: async () => ({ title: "Late", output: "late", metadata: { late: true } }),
          }),
          {
            [SessionProcessor.ToolCallPreparation]: async (
              _input: unknown,
              registration: SessionProcessor.RegisteredToolCall,
            ) => {
              const now = Date.now()
              await bridge.promise(
                session.updatePart({
                  id: registration.partID,
                  messageID: registration.assistantMessageID,
                  sessionID: registration.sessionID,
                  type: "tool",
                  tool: "settled",
                  callID: registration.callID,
                  state: {
                    status: "error",
                    input: {},
                    error: "frozen settlement",
                    metadata: { exact: true },
                    time: { start: now, end: now },
                  },
                }),
              )
            },
          },
        )

        yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "settled tool" }],
          tools: { settled },
        })
        const call = (yield* MessageV2.parts(msg.id)).find((part): part is SessionV1.ToolPart => part.type === "tool")

        expect(call?.state.status).toBe("error")
        if (call?.state.status !== "error") return
        expect(call.state.error).toBe("frozen settlement")
        expect(call.state.metadata).toEqual({ exact: true })
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor returns a committed learning result when terminal notification interrupts", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const courses = yield* Course.Service
        const database = yield* Database.Service
        const events = yield* EventV2Bridge.Service
        const runtime = yield* LearningCommandRuntime.Service
        const bridge = yield* EffectBridge.make()
        const course = yield* courses.createCourse({ title: "Processor committed result" })
        const view = yield* courses.createView({
          courseID: course.id,
          name: "Main",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: { items: [{ key: "root", title: "Committed result" }] },
        })
        const input = learningInput(course.id, view.revision.id)
        yield* llm.tool(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, input)

        const { chat, parent } = yield* runningSession("commit before observer interruption")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })
        const registrations = new Map<string, SessionProcessor.RegisteredToolCall>()
        const command = Object.assign(
          tool({
            description: "Commit one learning selection",
            inputSchema: learningToolSchema,
            execute: (attempt, options) => {
              const registration = registrations.get(options.toolCallId)
              if (!registration) throw new Error(`Missing learning registration ${options.toolCallId}`)
              return bridge.promise(
                runtime.execute(attempt, {
                  sessionID: registration.sessionID,
                  messageID: registration.assistantMessageID,
                  callID: registration.callID,
                  abort: options.abortSignal ?? new AbortController().signal,
                  extra: { toolCall: registration, permissionRuleset: agent().permission },
                }),
              )
            },
          }),
          {
            [SessionProcessor.ToolCallPreparation]: async (
              attempt: unknown,
              registration: SessionProcessor.RegisteredToolCall,
            ) => {
              registrations.set(registration.callID, registration)
              await bridge.promise(runtime.prepare(attempt, registration))
            },
          },
        )
        let observerRuns = 0
        const unsubscribe = yield* events.listen((event) => {
          if (event.type !== SessionV1.Event.PartUpdated.type) return Effect.void
          const data = event.data as typeof SessionV1.Event.PartUpdated.data.Type
          if (data.part.messageID !== msg.id || data.part.type !== "tool" || data.part.state.status !== "completed") {
            return Effect.void
          }
          return Effect.sync(() => {
            observerRuns++
          }).pipe(Effect.andThen(Effect.interrupt))
        })
        yield* Effect.addFinalizer(() => unsubscribe)

        const outcome = yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "commit before observer interruption" }],
          tools: { [LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY]: command },
        })
        const call = (yield* MessageV2.parts(msg.id)).find((part): part is SessionV1.ToolPart => part.type === "tool")

        expect(outcome).toBe("continue")
        expect(observerRuns).toBe(1)
        expect(call?.state.status).toBe("completed")
        if (!call || call.state.status !== "completed") return
        expect(JSON.parse(call.state.output)).toMatchObject({ outcome: "applied", courseID: course.id })
        expect(msg.error).toBeUndefined()
        expect((yield* courses.getCourse(course.id)).selection.version).toBe(1)
        expect(yield* database.db.select().from(CourseSelectionAcceptanceEffectTable).all()).toHaveLength(1)
        const registration = registrations.get(call.callID)
        const frontier = yield* database.db.transaction((tx) => LearningFrontier.read(tx))
        const invocation = registration
          ? yield* database.db.transaction((tx) =>
              TurnLifecycle.invocation(tx, { turnID: registration.turnID, partID: registration.partID }),
            )
          : undefined
        expect(invocation?.resultingSharedFrontier?.sequence).toBe(frontier.sequence)
        expect(
          invocation?.resultingSharedFrontier && DateTime.toEpochMillis(invocation.resultingSharedFrontier.time),
        ).toBe(frontier.time)
        const partEvents = (yield* database.db
          .select()
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, chat.id))
          .orderBy(EventTable.seq)
          .all()).filter((event) => (event.data as { part?: { id?: string } }).part?.id === call.id)
        expect(
          partEvents.map((event) => (event.data as { part?: { state?: { status?: string } } }).part?.state?.status),
        ).toEqual(["pending", "completed"])
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests settle an admitted learning tool failure as interrupted", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const courses = yield* Course.Service
        const database = yield* Database.Service
        const bridge = yield* EffectBridge.make()
        const course = yield* courses.createCourse({ title: "Processor failure recovery" })
        const view = yield* courses.createView({
          courseID: course.id,
          name: "Main",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: { items: [{ key: "root", title: "Failure recovery" }] },
        })
        const input = learningInput(course.id, view.revision.id)
        yield* llm.tool(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, input)

        const { chat, parent } = yield* runningSession("recover a failed learning tool")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })
        const command = Object.assign(
          tool({
            description: "Fail after durable admission",
            inputSchema: learningToolSchema,
            execute: async (_input): Promise<{ title: string; output: string; metadata: Record<string, unknown> }> => {
              throw new Error("post-admission failure")
            },
          }),
          {
            [SessionProcessor.ToolCallPreparation]: async (
              _input: unknown,
              registration: SessionProcessor.RegisteredToolCall,
            ) => bridge.promise(prepareLearningInvocation(registration, input)),
          },
        )

        yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "recover a failed learning tool" }],
          tools: { [LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY]: command },
        })
        const call = (yield* MessageV2.parts(msg.id)).find((part): part is SessionV1.ToolPart => part.type === "tool")
        expect(call?.state.status).toBe("completed")
        if (!call || call.state.status !== "completed") return
        expect(JSON.parse(call.state.output)).toMatchObject({ outcome: "error", code: "interrupted" })
        expect(
          yield* database.db
            .select()
            .from(LearningCommandInvocationTable)
            .where(eq(LearningCommandInvocationTable.part_id, call.id))
            .get(),
        ).toMatchObject({ status: "error", settlement: { outcome: "error", code: "interrupted" } })
        expect(handle.failureReason).toBeUndefined()
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests settle admitted learning cleanup through the same interrupted seam", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const entered = defer<void>()
        const { processors, session, provider } = yield* boot()
        const courses = yield* Course.Service
        const bridge = yield* EffectBridge.make()
        const course = yield* courses.createCourse({ title: "Processor cleanup recovery" })
        const view = yield* courses.createView({
          courseID: course.id,
          name: "Main",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: { items: [{ key: "root", title: "Cleanup recovery" }] },
        })
        const input = learningInput(course.id, view.revision.id)
        yield* llm.tool(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, input)

        const { chat, parent } = yield* runningSession("recover interrupted learning cleanup")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })
        const command = Object.assign(
          tool({
            description: "Hang after durable admission",
            inputSchema: learningToolSchema,
            execute: async (_input) => {
              entered.resolve()
              await new Promise<void>(() => undefined)
              return { title: "unreachable", output: "unreachable", metadata: {} }
            },
          }),
          {
            [SessionProcessor.ToolCallPreparation]: async (
              _input: unknown,
              registration: SessionProcessor.RegisteredToolCall,
            ) => bridge.promise(prepareLearningInvocation(registration, input)),
          },
        )

        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "recover interrupted learning cleanup" }],
            tools: { [LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY]: command },
          })
          .pipe(Effect.forkChild)
        yield* Effect.promise(() => entered.promise)
        yield* Fiber.interrupt(run)
        const call = (yield* MessageV2.parts(msg.id)).find((part): part is SessionV1.ToolPart => part.type === "tool")
        expect(call?.state.status).toBe("completed")
        if (call?.state.status !== "completed") return
        expect(JSON.parse(call.state.output)).toMatchObject({ outcome: "error", code: "interrupted" })
        expect(call.state.output).not.toContain("Tool execution aborted")
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests exact-match a late learning-command completion without overwriting", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const bridge = yield* EffectBridge.make()
        const prepared = defer<SessionProcessor.RegisteredToolCall>()
        const release = defer<void>()
        const exact = {
          title: "Course view revision acceptance",
          output: '{"outcome":"applied"}',
          metadata: { durablySettled: true, outcome: "applied" },
        }

        yield* llm.tool(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, syntheticLearningInput)

        const { chat, parent } = yield* runningSession("exact learning callback")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })
        const command = Object.assign(
          tool({
            description: "Return the frozen settlement",
            inputSchema: learningToolSchema,
            execute: async () => exact,
          }),
          {
            [SessionProcessor.ToolCallPreparation]: async (
              _input: unknown,
              registration: SessionProcessor.RegisteredToolCall,
            ) => {
              const now = Date.now()
              await bridge.promise(
                session.updatePart({
                  id: registration.partID,
                  messageID: registration.assistantMessageID,
                  sessionID: registration.sessionID,
                  type: "tool",
                  tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
                  callID: registration.callID,
                  state: {
                    status: "completed",
                    input: syntheticLearningInput,
                    ...exact,
                    time: { start: now, end: now },
                  },
                }),
              )
              prepared.resolve(registration)
              await release.promise
            },
          },
        )

        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "exact learning callback" }],
            tools: { [LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY]: command },
          })
          .pipe(Effect.forkChild)
        const registration = yield* Effect.promise(() => prepared.promise)
        const callback = yield* handle
          .completeToolCall(registration.callID, { ...exact, attachments: undefined })
          .pipe(Effect.exit)
        release.resolve()
        yield* Fiber.interrupt(run)
        const call = (yield* MessageV2.parts(msg.id)).find((part): part is SessionV1.ToolPart => part.type === "tool")

        expect(Exit.isSuccess(callback)).toBe(true)
        expect(call?.state.status).toBe("completed")
        if (call?.state.status !== "completed") return
        expect({
          title: call.state.title,
          output: call.state.output,
          metadata: call.state.metadata,
        }).toEqual(exact)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests reject a divergent late learning-command completion", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const bridge = yield* EffectBridge.make()
        const prepared = defer<SessionProcessor.RegisteredToolCall>()
        const release = defer<void>()
        const frozen = {
          title: "Course view revision acceptance",
          output: '{"outcome":"applied"}',
          metadata: { durablySettled: true, outcome: "applied" },
        }

        yield* llm.tool(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, syntheticLearningInput)

        const { chat, parent } = yield* runningSession("divergent learning callback")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })
        const command = Object.assign(
          tool({
            description: "Return a divergent settlement",
            inputSchema: learningToolSchema,
            execute: async () => ({ ...frozen, output: '{"outcome":"error"}' }),
          }),
          {
            [SessionProcessor.ToolCallPreparation]: async (
              _input: unknown,
              registration: SessionProcessor.RegisteredToolCall,
            ) => {
              const now = Date.now()
              await bridge.promise(
                session.updatePart({
                  id: registration.partID,
                  messageID: registration.assistantMessageID,
                  sessionID: registration.sessionID,
                  type: "tool",
                  tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
                  callID: registration.callID,
                  state: {
                    status: "completed",
                    input: syntheticLearningInput,
                    ...frozen,
                    time: { start: now, end: now },
                  },
                }),
              )
              prepared.resolve(registration)
              await release.promise
            },
          },
        )

        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "divergent learning callback" }],
            tools: { [LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY]: command },
          })
          .pipe(Effect.forkChild)
        const registration = yield* Effect.promise(() => prepared.promise)
        const callback = yield* handle
          .completeToolCall(registration.callID, {
            ...frozen,
            output: '{"outcome":"error"}',
            attachments: undefined,
          })
          .pipe(Effect.exit)
        release.resolve()
        yield* Fiber.interrupt(run)
        const call = (yield* MessageV2.parts(msg.id)).find((part): part is SessionV1.ToolPart => part.type === "tool")

        expect(Exit.isFailure(callback)).toBe(true)
        if (Exit.isSuccess(callback)) return
        expect(Cause.pretty(callback.cause)).toContain("LearningCommand.InvocationConflictError")
        expect(call?.state.status).toBe("completed")
        if (call?.state.status !== "completed") return
        expect({
          title: call.state.title,
          output: call.state.output,
          metadata: call.state.metadata,
        }).toEqual(frozen)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests reject a late learning-command tool error", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const bridge = yield* EffectBridge.make()
        const prepared = defer<SessionProcessor.RegisteredToolCall>()
        const release = defer<void>()
        const frozen = {
          title: "Course view revision acceptance",
          output: '{"outcome":"applied"}',
          metadata: { durablySettled: true, outcome: "applied" },
        }

        yield* llm.tool(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, syntheticLearningInput)

        const { chat, parent } = yield* runningSession("late learning error")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })
        const command = Object.assign(
          tool({
            description: "Fail after the settlement is frozen",
            inputSchema: learningToolSchema,
            execute: async (): Promise<typeof frozen> => {
              throw new Error("late provider callback")
            },
          }),
          {
            [SessionProcessor.ToolCallPreparation]: async (
              _input: unknown,
              registration: SessionProcessor.RegisteredToolCall,
            ) => {
              const now = Date.now()
              await bridge.promise(
                session.updatePart({
                  id: registration.partID,
                  messageID: registration.assistantMessageID,
                  sessionID: registration.sessionID,
                  type: "tool",
                  tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
                  callID: registration.callID,
                  state: {
                    status: "completed",
                    input: syntheticLearningInput,
                    ...frozen,
                    time: { start: now, end: now },
                  },
                }),
              )
              prepared.resolve(registration)
              await release.promise
            },
          },
        )

        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "late learning error" }],
            tools: { [LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY]: command },
          })
          .pipe(Effect.forkChild)
        const registration = yield* Effect.promise(() => prepared.promise)
        if (!handle.failToolCall) throw new Error("Processor does not expose its late-error callback")
        const callback = yield* handle
          .failToolCall(registration.callID, new Error("late provider callback"))
          .pipe(Effect.exit)
        release.resolve()
        yield* Fiber.interrupt(run)
        const call = (yield* MessageV2.parts(msg.id)).find((part): part is SessionV1.ToolPart => part.type === "tool")

        expect(Exit.isFailure(callback)).toBe(true)
        if (Exit.isSuccess(callback)) return
        expect(Cause.pretty(callback.cause)).toContain("LearningCommand.InvocationConflictError")
        expect(call?.state.status).toBe("completed")
        if (call?.state.status !== "completed") return
        expect({
          title: call.state.title,
          output: call.state.output,
          metadata: call.state.metadata,
        }).toEqual(frozen)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests execute local tools in provider emission order", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const firstEntered = defer<void>()
        const releaseFirst = defer<void>()
        const order: string[] = []
        let firstRegistration: SessionProcessor.RegisteredToolCall | undefined
        const { processors, session, provider } = yield* boot()

        yield* llm.push(parallelTools("first", "second"))

        const { chat, parent } = yield* runningSession("ordered tools")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "ordered tools" }],
            tools: {
              first: tool({
                description: "Block until the test releases this call",
                inputSchema: z.object({}),
                execute: async (_args, options) => {
                  firstRegistration = handle.registeredToolCall?.(options.toolCallId)
                  order.push("first:start")
                  firstEntered.resolve()
                  await releaseFirst.promise
                  order.push("first:end")
                  return { title: "First", output: "first", metadata: {} }
                },
              }),
              second: tool({
                description: "Record when this call begins",
                inputSchema: z.object({}),
                execute: async () => {
                  order.push("second:start")
                  return { title: "Second", output: "second", metadata: {} }
                },
              }),
            },
          })
          .pipe(Effect.forkChild)

        yield* Effect.promise(() => firstEntered.promise)
        yield* Effect.sleep("20 millis")
        const whileFirstBlocked = [...order]
        const secondRegistration = handle.registeredToolCall?.("call_2")
        const partsWhileBlocked = yield* MessageV2.parts(msg.id)

        releaseFirst.resolve()
        const exit = yield* Fiber.await(run)
        const calls = (yield* MessageV2.parts(msg.id)).filter(
          (part): part is SessionV1.ToolPart => part.type === "tool",
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(whileFirstBlocked).toEqual(["first:start"])
        expect(firstRegistration?.emissionOrdinal).toBe(0)
        expect(secondRegistration?.emissionOrdinal).toBe(1)
        expect(partsWhileBlocked.some((part) => part.id === firstRegistration?.partID)).toBe(true)
        expect(
          partsWhileBlocked.find((part): part is SessionV1.ToolPart => part.type === "tool" && part.callID === "call_2")
            ?.state.status,
        ).toBe("pending")
        expect(order).toEqual(["first:start", "first:end", "second:start"])
        expect(calls.map((call) => call.callID)).toEqual(["call_1", "call_2"])
        expect(calls.every((call) => call.state.status === "completed")).toBe(true)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests do not enter queued local tools after interruption", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const firstEntered = defer<void>()
        let secondEntered = false
        let secondPrepared = false
        const { processors, session, provider } = yield* boot()

        yield* llm.push(parallelTools("first", "second"))

        const { chat, parent } = yield* runningSession("interrupt ordered tools")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })
        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "interrupt ordered tools" }],
            tools: {
              first: tool({
                description: "Wait for the processor abort signal",
                inputSchema: z.object({}),
                execute: async (_args, options) => {
                  firstEntered.resolve()
                  await new Promise<void>((_resolve, reject) => {
                    const fail = () => reject(new DOMException("Aborted", "AbortError"))
                    if (options.abortSignal?.aborted) return fail()
                    options.abortSignal?.addEventListener("abort", fail, { once: true })
                  })
                  return { title: "First", output: "first", metadata: {} }
                },
              }),
              second: Object.assign(
                tool({
                  description: "Must not begin after interruption",
                  inputSchema: z.object({}),
                  execute: async () => {
                    secondEntered = true
                    return { title: "Second", output: "second", metadata: {} }
                  },
                }),
                {
                  [SessionProcessor.ToolCallPreparation]: async () => {
                    secondPrepared = true
                  },
                },
              ),
            },
          })
          .pipe(Effect.forkChild)

        yield* Effect.promise(() => firstEntered.promise)
        yield* waitFor(
          Effect.sync(() => handle.registeredToolCall?.("call_2")),
          "timed out waiting for the second tool registration",
        )
        yield* Fiber.interrupt(run)
        const exit = yield* Fiber.await(run)
        yield* Effect.sleep("20 millis")
        const calls = (yield* MessageV2.parts(msg.id)).filter(
          (part): part is SessionV1.ToolPart => part.type === "tool",
        )

        expect(Exit.isFailure(exit)).toBe(true)
        expect(secondEntered).toBe(false)
        expect(secondPrepared).toBe(false)
        expect(calls).toHaveLength(2)
        expect(calls.every((call) => call.state.status === "error")).toBe(true)
      }),
    { config: (url) => providerCfg(url) },
  ),
)

itPartialTool.live("session.processor effect tests mark pending tools as aborted on cleanup", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const control = yield* PartialToolControl

        const { chat, parent } = yield* runningSession("tool abort")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "tool abort" }],
            tools: {},
          })
          .pipe(Effect.forkChild)

        yield* control.entered
        expect((yield* MessageV2.parts(msg.id)).some((part) => part.type === "tool")).toBe(false)
        yield* Fiber.interrupt(run)

        const exit = yield* Fiber.await(run)
        const parts = yield* MessageV2.parts(msg.id)
        const call = parts.find((part): part is SessionV1.ToolPart => part.type === "tool")

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
        }
        expect(call?.state.status).toBe("error")
        if (call?.state.status === "error") {
          expect(call.state.error).toBe("Tool execution aborted")
          expect(call.state.metadata?.interrupted).toBe(true)
          expect(call.state.time.end).toBeDefined()
        }
      }),
    { config: cfg },
  ),
)

it.live("session.processor effect tests record aborted errors and idle state", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const seen = defer<void>()
        const { processors, session, provider } = yield* boot()
        const events = yield* EventV2Bridge.Service
        const sts = yield* SessionStatus.Service

        yield* llm.hang

        const { chat, parent } = yield* runningSession("abort")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const errs: string[] = []
        const off = yield* events.listen((evt) => {
          if (evt.type !== Session.Event.Error.type) return Effect.void
          const data = evt.data as typeof Session.Event.Error.data.Type
          if (data.sessionID !== chat.id || !data.error) return Effect.void
          errs.push(data.error.name)
          seen.resolve()
          return Effect.void
        })
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "abort" }],
            tools: {},
          })
          .pipe(Effect.forkChild)

        yield* llm.wait(1)
        yield* Fiber.interrupt(run)

        const exit = yield* Fiber.await(run)
        yield* Effect.promise(() => seen.promise)
        const stored = yield* MessageV2.get({ sessionID: chat.id, messageID: msg.id })
        const state = yield* sts.get(chat.id)
        yield* off

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
        }
        expect(handle.message.error?.name).toBe("MessageAbortedError")
        expect(stored.info.role).toBe("assistant")
        if (stored.info.role === "assistant") {
          expect(stored.info.error?.name).toBe("MessageAbortedError")
        }
        expect(state).toMatchObject({ type: "idle" })
        expect(errs).toContain("MessageAbortedError")
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor effect tests mark interruptions aborted without manual abort", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const sts = yield* SessionStatus.Service

        yield* llm.hang

        const { chat, parent } = yield* runningSession("interrupt")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: msg,
          sessionID: chat.id,
          model: mdl,
        })

        const run = yield* handle
          .process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "interrupt" }],
            tools: {},
          })
          .pipe(Effect.forkChild)

        yield* llm.wait(1)
        yield* Fiber.interrupt(run)

        const exit = yield* Fiber.await(run)
        const stored = yield* MessageV2.get({ sessionID: chat.id, messageID: msg.id })
        const state = yield* sts.get(chat.id)

        expect(Exit.isFailure(exit)).toBe(true)
        expect(handle.message.error?.name).toBe("MessageAbortedError")
        expect(stored.info.role).toBe("assistant")
        if (stored.info.role === "assistant") {
          expect(stored.info.error?.name).toBe("MessageAbortedError")
        }
        expect(state).toMatchObject({ type: "idle" })
      }),
    { config: (url) => providerCfg(url) },
  ),
)

itProviderError.live("session.processor effect tests fail provider-executed error results", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const events = yield* EventV2Bridge.Service

        const { chat, parent } = yield* runningSession("provider tool error")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const turnID = yield* admitTurnModel(chat.id, parent, msg.id)
        const seen: string[] = []
        const off = yield* events.listen((event) => {
          seen.push(event.type)
          return Effect.void
        })
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl, turnID })

        yield* handle.process({
          user: {
            id: parent.id,
            sessionID: chat.id,
            role: "user",
            time: parent.time,
            agent: parent.agent,
            model: { providerID: ref.providerID, modelID: ref.modelID },
          } satisfies SessionV1.User,
          sessionID: chat.id,
          composition: { type: "interactive" },
          model: mdl,
          agent: agent(),
          system: [],
          messages: [{ role: "user", content: "provider tool error" }],
          tools: {},
        })
        yield* off

        const parts = yield* MessageV2.parts(msg.id)
        const call = parts.find((part): part is SessionV1.ToolPart => part.type === "tool")
        expect(call?.state.status).toBe("error")
        if (call?.state.status === "error") expect(call.state.error).toBe("provider boom")
        expect(seen).toContain(MessageV2.Event.PartUpdated.type)
        expect(seen).toContain(MessageV2.Event.Updated.type)
        expect(seen.filter((type) => type.startsWith("session.next."))).toEqual([])
      }),
    { config: cfg },
  ),
)

itProviderGoalShadow.live("session.processor rejects provider-executed Goal shadows before false acknowledgement", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const { processors, provider, database } = yield* boot()
        const events = yield* EventV2Bridge.Service
        const { chat, parent } = yield* runningSession("provider-executed Goal shadow")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const permissionRequests: string[] = []
        const off = yield* events.listen((event) => {
          if (event.type === Permission.Event.Asked.type) permissionRequests.push(event.type)
          return Effect.void
        })
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })
        const goalEffectCount = yield* database.db.get<{ count: number }>(
          sql`SELECT count(*) AS count FROM learner_goal_effect`,
        )

        expect(
          yield* handle.process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "let the provider store a Goal" }],
            tools: {},
          }),
        ).toBe("stop")
        yield* off

        const parts = yield* MessageV2.parts(msg.id)
        expect(handle.failureReason).toBe("integrity_failure")
        expect(handle.message.error).toBeDefined()
        expect(JSON.stringify(handle.message.error)).toContain("Provider-executed learning command")
        expect(
          parts.some(
            (part) =>
              part.type === "tool" &&
              part.tool === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY &&
              part.state.status === "completed",
          ),
        ).toBe(false)
        expect(JSON.stringify(parts)).not.toContain(falseGoalAcknowledgement.output)
        expect(permissionRequests).toEqual([])
        expect(
          yield* database.db
            .select()
            .from(LearningCommandInvocationTable)
            .where(eq(LearningCommandInvocationTable.assistant_message_id, msg.id))
            .all(),
        ).toEqual([])
        expect(
          yield* database.db
            .select()
            .from(LearningCommandReceiptTable)
            .where(eq(LearningCommandReceiptTable.assistant_message_id, msg.id))
            .all(),
        ).toEqual([])
        expect(yield* database.db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual(goalEffectCount)
      }),
    { config: cfg },
  ),
)

itProviderDefaultProposalShadow.live(
  "session.processor rejects provider-executed default-Course proposals before false authority",
  () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, provider } = yield* boot()
          const { chat, parent } = yield* runningSession("provider-executed default Course proposal")
          const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })

          expect(
            yield* handle.process({
              user: {
                id: parent.id,
                sessionID: chat.id,
                role: "user",
                time: parent.time,
                agent: parent.agent,
                model: { providerID: ref.providerID, modelID: ref.modelID },
              } satisfies SessionV1.User,
              sessionID: chat.id,
              composition: { type: "interactive" },
              model: mdl,
              agent: agent(),
              system: [],
              messages: [{ role: "user", content: "let the provider propose a default Course" }],
              tools: {},
            }),
          ).toBe("stop")

          expect(handle.failureReason).toBe("integrity_failure")
          expect(JSON.stringify(handle.message.error)).toContain("Provider-executed host-prepared proposal")
          expect(
            (yield* MessageV2.parts(msg.id)).some(
              (part) =>
                part.type === "tool" &&
                part.tool === PROPOSE_DEFAULT_COURSE_PREFERENCE_TOOL_ID &&
                part.state.status === "completed",
            ),
          ).toBe(false)
        }),
      { config: cfg },
    ),
)

itProviderLookup.live("session.processor preserves unrelated provider-executed tool results", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const { processors, provider, database } = yield* boot()
        const { chat, parent } = yield* runningSession("provider-executed lookup")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })

        expect(
          yield* handle.process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "look up the weather" }],
            tools: {},
          }),
        ).toBe("continue")

        const call = (yield* MessageV2.parts(msg.id)).find(
          (part): part is SessionV1.ToolPart => part.type === "tool" && part.tool === "lookup",
        )
        expect(call).toMatchObject({
          metadata: { providerExecuted: true },
          state: {
            status: "completed",
            title: "Lookup",
            metadata: { ok: true },
            output: "sunny",
          },
        })
        expect(handle.failureReason).toBeUndefined()
        expect(
          yield* database.db
            .select()
            .from(LearningCommandInvocationTable)
            .where(eq(LearningCommandInvocationTable.assistant_message_id, msg.id))
            .all(),
        ).toEqual([])
      }),
    { config: cfg },
  ),
)

itFragmentFailure.live("session.processor effect tests retain partial legacy parts without v2 events", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const events = yield* EventV2Bridge.Service

        const { chat, parent } = yield* runningSession("provider failure")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const turnID = yield* admitTurnModel(chat.id, parent, msg.id)
        const seen: string[] = []
        const off = yield* events.listen((event) => {
          seen.push(event.type)
          return Effect.void
        })
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl, turnID })

        expect(
          yield* handle.process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "provider failure" }],
            tools: {},
          }),
        ).toBe("stop")
        expect(handle.failureReason).toBe("provider_failure")
        yield* off

        const parts = yield* MessageV2.parts(msg.id)
        expect(parts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "text", text: "partial" }),
            expect.objectContaining({ type: "reasoning", text: "thinking" }),
          ]),
        )
        expect(seen).toContain(MessageV2.Event.PartUpdated.type)
        expect(seen).toContain(Session.Event.Error.type)
        expect(seen.filter((type) => type.startsWith("session.next."))).toEqual([])
      }),
    { config: cfg },
  ),
)

itIntegrityFailure.live("session.processor classifies an unadmitted provider callback as an integrity failure", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const { processors, provider } = yield* boot()
        const { chat, parent } = yield* runningSession("orphan provider callback")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })

        expect(
          yield* handle.process({
            user: {
              id: parent.id,
              sessionID: chat.id,
              role: "user",
              time: parent.time,
              agent: parent.agent,
              model: { providerID: ref.providerID, modelID: ref.modelID },
            } satisfies SessionV1.User,
            sessionID: chat.id,
            composition: { type: "interactive" },
            model: mdl,
            agent: agent(),
            system: [],
            messages: [{ role: "user", content: "orphan provider callback" }],
            tools: {},
          }),
        ).toBe("stop")
        expect(handle.failureReason).toBe("integrity_failure")
        expect(handle.message.error).toBeDefined()
      }),
    { config: cfg },
  ),
)
