import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2Bridge } from "@/event-v2-bridge"
import { expect } from "bun:test"
import { tool } from "ai"
import { Cause, Effect, Exit, Fiber, Layer, Stream } from "effect"
import path from "path"
import z from "zod"
import type { Agent } from "../../src/agent/agent"
import { Provider } from "@/provider/provider"

import { Session } from "@/session/session"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionProcessor } from "../../src/session/processor"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SessionSummary } from "../../src/session/summary"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideTmpdirInstance, provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { raw, reply, TestLLMServer } from "../lib/llm-server"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { LLMEvent } from "@opencode-ai/llm"
import { EffectBridge } from "@/effect/bridge"
import { LearningCommand, type OccurrenceID } from "@opencode-ai/core/learning-command"
import { Occurrence } from "@opencode-ai/core/learning-command"
import { LearningCommandInvocationTable } from "@opencode-ai/core/learning-command/sql"
import { Course } from "@opencode-ai/core/course"
import { CourseSelectionAcceptanceEffectTable } from "@opencode-ai/core/course/sql"
import { EventTable } from "@opencode-ai/core/event/sql"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { eq } from "drizzle-orm"

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

const user = Effect.fn("TestSession.user")(function* (sessionID: SessionID, text: string) {
  const session = yield* Session.Service
  const msg = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "repa",
    model: ref,
    time: { created: Date.now() },
  })
  yield* session.updatePart({
    id: PartID.ascending(),
    messageID: msg.id,
    sessionID,
    type: "text",
    text,
  })
  return msg
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

const admitLearner = Effect.fn("TestSession.admitLearner")(function* (sessionID: SessionID, messageID: MessageID) {
  const events = yield* EventV2Bridge.Service
  const admitted = yield* events.transaction((tx) =>
    Occurrence.admit(tx, {
      admission: LearningCommand.LearnerAdmission.interactive(),
      sessionID,
      messageID,
      timeAdmitted: Date.now(),
    }).pipe(
      Effect.orDie,
      Effect.map((result) => ({ result })),
    ),
  )
  return admitted.result
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
  occurrenceID: OccurrenceID,
  input: ReturnType<typeof learningInput>,
) {
  const events = yield* EventV2Bridge.Service
  const timeAdmitted = Date.now()
  yield* events.transaction((tx) =>
    Effect.gen(function* () {
      yield* SessionProjector.projectPart(
        tx,
        {
          id: registration.partID,
          messageID: registration.assistantMessageID,
          sessionID: registration.sessionID,
          type: "tool",
          tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
          callID: registration.callID,
          state: { status: "pending", input, raw: JSON.stringify(input) },
        },
        timeAdmitted,
      )
      return yield* LearningCommand.reserveAcceptance(tx, {
        envelope: {
          occurrenceID,
          sessionID: registration.sessionID,
          parentUserMessageID: registration.parentUserMessageID,
          assistantMessageID: registration.assistantMessageID,
          partID: registration.partID,
          providerCallID: registration.callID,
          emissionOrdinal: registration.emissionOrdinal,
          capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
          capabilityVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
          authorizationBasis: "learner_acceptance",
          timeAdmitted,
        },
        command: { ...input, expectedSelectionRevisionID: undefined },
      })
    }).pipe(
      Effect.orDie,
      Effect.map((result) => ({ result })),
    ),
  )
})

const root = LayerNode.group([
  SessionProcessor.node,
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
const env = LayerNode.compile(
  LayerNode.group([root, LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })]),
  replacements,
)

const it = testEffect(env)

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

const boot = Effect.fn("test.boot")(function* () {
  const processors = yield* SessionProcessor.Service
  const session = yield* Session.Service
  const provider = yield* Provider.Service
  return { processors, session, provider }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it.live("session.processor effect tests capture llm input cleanly", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const database = yield* Database.Service
        const { processors, session, provider } = yield* boot()

        yield* llm.text("hello")

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "hi")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "hi")
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

it.live("session.processor effect tests stop after token overflow requests compaction", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const database = yield* Database.Service
        const { processors, session, provider } = yield* boot()

        yield* llm.text("after", { usage: { input: 100, output: 0 } })

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "compact")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const base = yield* provider.getModel(ref.providerID, ref.modelID)
        const mdl = { ...base, limit: { context: 20, output: 10 } }
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "reason")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "reason")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "json")
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
        const { processors, session, provider } = yield* boot()

        yield* llm.error(429, { type: "error", error: { type: "too_many_requests" } })
        yield* llm.text("after")

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "retry json")
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

        expect(value).toBe("continue")
        expect(yield* llm.calls).toBe(2)
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "retry")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "compact json")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "tool")
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
        const { processors, session, provider } = yield* boot()
        const bridge = yield* EffectBridge.make()
        const order: string[] = []
        let partBeforePreparation: SessionV1.Part | undefined
        let preparedRegistration: SessionProcessor.RegisteredToolCall | undefined

        yield* llm.tool("prepared", {})

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "prepared tool")
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

        expect(value).toBe("continue")
        expect(partBeforePreparation).toBeUndefined()
        expect(order).toEqual(["prepare", "body"])
        expect(preparedRegistration?.partID).toBe(call?.id)
        expect(call?.state.status).toBe("completed")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "settled tool")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "commit before observer interruption")
        yield* admitLearner(chat.id, parent.id)
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
        const partEvents = (yield* database.db
          .select()
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, chat.id))
          .all()).filter((event) => (event.data as { part?: { id?: string } }).part?.id === call.id)
        expect(partEvents).toHaveLength(1)
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "recover a failed learning tool")
        const occurrence = yield* admitLearner(chat.id, parent.id)
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
            ) => bridge.promise(prepareLearningInvocation(registration, occurrence.id, input)),
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "recover interrupted learning cleanup")
        const occurrence = yield* admitLearner(chat.id, parent.id)
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
            ) => bridge.promise(prepareLearningInvocation(registration, occurrence.id, input)),
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

        yield* llm.tool(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, {})

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "exact learning callback")
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
            inputSchema: z.object({}),
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
                    input: {},
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

        yield* llm.tool(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, {})

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "divergent learning callback")
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
            inputSchema: z.object({}),
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
                    input: {},
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

        yield* llm.tool(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, {})

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "late learning error")
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
            inputSchema: z.object({}),
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
                    input: {},
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "ordered tools")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "interrupt ordered tools")
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

it.live("session.processor effect tests mark pending tools as aborted on cleanup", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const database = yield* Database.Service
        const { processors, session, provider } = yield* boot()

        yield* llm.toolHang("bash", { cmd: "pwd" })

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "tool abort")
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

        yield* llm.wait(1)
        yield* waitFor(
          MessageV2.parts(msg.id).pipe(
            Effect.map((parts) => parts.find((part): part is SessionV1.ToolPart => part.type === "tool")),
            Effect.provideService(Database.Service, database),
          ),
          "timed out waiting for tool part",
        )
        yield* Fiber.interrupt(run)

        const exit = yield* Fiber.await(run)
        const parts = yield* MessageV2.parts(msg.id)
        const call = parts.find((part): part is SessionV1.ToolPart => part.type === "tool")

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
        }
        expect(yield* llm.calls).toBe(1)
        expect(call?.state.status).toBe("error")
        if (call?.state.status === "error") {
          expect(call.state.error).toBe("Tool execution aborted")
          expect(call.state.metadata?.interrupted).toBe(true)
          expect(call.state.time.end).toBeDefined()
        }
      }),
    { config: (url) => providerCfg(url) },
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "abort")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "interrupt")
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

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "provider tool error")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const seen: string[] = []
        const off = yield* events.listen((event) => {
          seen.push(event.type)
          return Effect.void
        })
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })

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

itFragmentFailure.live("session.processor effect tests retain partial legacy parts without v2 events", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        const events = yield* EventV2Bridge.Service

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "provider failure")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const seen: string[] = []
        const off = yield* events.listen((event) => {
          seen.push(event.type)
          return Effect.void
        })
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
            messages: [{ role: "user", content: "provider failure" }],
            tools: {},
          }),
        ).toBe("stop")
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
