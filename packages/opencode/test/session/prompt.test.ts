import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { eq } from "drizzle-orm"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { expect } from "bun:test"
import { Cause, DateTime, Deferred, Duration, Effect, Exit, Fiber, Layer } from "effect"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { NamedError } from "@opencode-ai/core/util/error"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Command } from "../../src/command"
import { Config } from "@/config/config"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider as ProviderSvc } from "@/provider/provider"
import { Env } from "../../src/env"
import { Git } from "../../src/git"
import { Image } from "../../src/image/image"

import { Question } from "../../src/question"
import { Todo } from "../../src/session/todo"
import { Session } from "@/session/session"
import { SessionMessageTable, SessionTable } from "@opencode-ai/core/session/sql"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { SessionCompaction } from "../../src/session/compaction"
import { SessionSummary } from "../../src/session/summary"
import { Instruction } from "../../src/session/instruction"
import { SessionProcessor } from "../../src/session/processor"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionRevert } from "../../src/session/revert"
import { SessionRunState } from "../../src/session/run-state"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { Skill } from "../../src/skill"
import { SystemPrompt } from "../../src/session/system"
import { Shell } from "@opencode-ai/core/shell"
import { Snapshot } from "../../src/snapshot"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Format } from "../../src/format"
import { TestInstance, tmpdirScoped } from "../fixture/fixture"
import { materializeTestSession } from "../fixture/session"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { LocationServiceMap, locationServiceMapLayer } from "@opencode-ai/core/location-services"
import { InstanceStore } from "@/project/instance-store"
import { TestConsole } from "effect/testing"
import { Occurrence } from "@opencode-ai/core/learning-command"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { TurnInputTable, TurnModelOperationTable, TurnTable } from "@opencode-ai/core/turn/sql"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { Turn } from "@opencode-ai/schema/turn"
import { TurnEvent } from "@opencode-ai/schema/turn-event"

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

function withSh<A, E, R>(fx: () => Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const prev = process.env.SHELL
      process.env.SHELL = "/bin/sh"
      Shell.preferred.reset()
      return prev
    }),
    () => fx(),
    (prev) =>
      Effect.sync(() => {
        if (prev === undefined) delete process.env.SHELL
        else process.env.SHELL = prev
        Shell.preferred.reset()
      }),
  )
}

function toolPart(parts: SessionV1.Part[]) {
  return parts.find((part): part is SessionV1.ToolPart => part.type === "tool")
}

type CompletedToolPart = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }
type ErrorToolPart = SessionV1.ToolPart & { state: SessionV1.ToolStateError }

function completedTool(parts: SessionV1.Part[]) {
  const part = toolPart(parts)
  expect(part?.state.status).toBe("completed")
  return part?.state.status === "completed" ? (part as CompletedToolPart) : undefined
}

function errorTool(parts: SessionV1.Part[]) {
  const part = toolPart(parts)
  expect(part?.state.status).toBe("error")
  return part?.state.status === "error" ? (part as ErrorToolPart) : undefined
}

const contextBuildHooks: Array<() => PromiseLike<void>> = []

function makeMcp(instructions: MCP.ServerInstructions[] = []) {
  return Layer.succeed(
    MCP.Service,
    MCP.Service.of({
      status: () => Effect.succeed({}),
      clients: () => Effect.succeed({}),
      instructions: () => {
        const hook = contextBuildHooks.shift()
        return hook ? Effect.promise(() => hook()).pipe(Effect.as(instructions)) : Effect.succeed(instructions)
      },
      tools: () => Effect.succeed({}),
      prompts: () => Effect.succeed({}),
      resources: () => Effect.succeed({}),
      resourceTemplates: () => Effect.succeed({}),
      add: () => Effect.succeed({ status: { status: "disabled" as const } }),
      connect: () => Effect.void,
      disconnect: () => Effect.void,
      getPrompt: () => Effect.succeed(undefined),
      readResource: () => Effect.succeed(undefined),
      startAuth: () => Effect.die("unexpected MCP auth in prompt-effect tests"),
      authenticate: () => Effect.die("unexpected MCP auth in prompt-effect tests"),
      finishAuth: () => Effect.die("unexpected MCP auth in prompt-effect tests"),
      removeAuth: () => Effect.void,
      supportsOAuth: () => Effect.succeed(false),
      hasStoredTokens: () => Effect.succeed(false),
      getAuthStatus: () => Effect.succeed("not_authenticated" as const),
    }),
  )
}

const lsp = Layer.succeed(
  LSP.Service,
  LSP.Service.of({
    init: () => Effect.void,
    status: () => Effect.succeed([]),
    hasClients: () => Effect.succeed(false),
    touchFile: () => Effect.void,
    diagnostics: () => Effect.succeed({}),
    hover: () => Effect.succeed(undefined),
    definition: () => Effect.succeed([]),
    references: () => Effect.succeed([]),
    implementation: () => Effect.succeed([]),
    documentSymbol: () => Effect.succeed([]),
    workspaceSymbol: () => Effect.succeed([]),
    prepareCallHierarchy: () => Effect.succeed([]),
    incomingCalls: () => Effect.succeed([]),
    outgoingCalls: () => Effect.succeed([]),
  }),
)

const processorCreateStarted: Array<() => void> = []
const blockingProcessor = Layer.succeed(
  SessionProcessor.Service,
  SessionProcessor.Service.of({
    create: () => Effect.sync(() => processorCreateStarted.shift()?.()).pipe(Effect.andThen(Effect.never)),
  }),
)

const runtimeFlags = RuntimeFlags.layer({ experimentalEventSystem: true })

const testLLMServerNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })

const promptRoot = LayerNode.group([
  SessionPrompt.node,
  Session.node,
  SessionProjector.node,
  MessageV2.node,
  Snapshot.node,
  LLM.node,
  Env.node,
  AgentSvc.node,
  Command.node,
  Permission.node,
  Plugin.node,
  Config.node,
  ProviderSvc.node,
  LSP.node,
  MCP.node,
  FSUtil.node,
  BackgroundJob.node,
  SessionStatus.node,
  SessionRunState.node,
  Database.node,
  EventV2Bridge.node,
  Question.node,
  Todo.node,
  ToolRegistry.node,
  Skill.node,
  Git.node,
  Ripgrep.node,
  Format.node,
  Truncate.node,
  SessionProcessor.node,
  Image.node,
  SessionCompaction.node,
  SessionRevert.node,
  Instruction.node,
  SystemPrompt.node,
  CrossSpawnSpawner.node,
  RuntimeFlags.node,
])

function makePrompt(input?: { mcpInstructions?: MCP.ServerInstructions[]; processor?: "blocking" }) {
  const replacements = [
    [SessionSummary.node, summary],
    [LSP.node, lsp],
    [MCP.node, makeMcp(input?.mcpInstructions)],
    [RuntimeFlags.node, runtimeFlags],
  ] as const
  if (input?.processor === "blocking") {
    return LayerNode.compile(promptRoot, [...replacements, [SessionProcessor.node, blockingProcessor]])
  }
  return LayerNode.compile(promptRoot, replacements)
}

function makeHttp(input?: { mcpInstructions?: MCP.ServerInstructions[]; processor?: "blocking" }) {
  const root = LayerNode.group([promptRoot, testLLMServerNode])
  const replacements = [
    [SessionSummary.node, summary],
    [LSP.node, lsp],
    [MCP.node, makeMcp(input?.mcpInstructions)],
    [RuntimeFlags.node, runtimeFlags],
  ] as const
  if (input?.processor === "blocking") {
    return LayerNode.compile(root, [...replacements, [SessionProcessor.node, blockingProcessor]])
  }
  return LayerNode.compile(root, replacements)
}

function makeHttpNoLLMServer(input?: { mcpInstructions?: MCP.ServerInstructions[]; processor?: "blocking" }) {
  return makePrompt(input)
}

const it = testEffect(makeHttp())
const noLLMServer = testEffect(makeHttpNoLLMServer())
const raceNoLLMServer = testEffect(makeHttpNoLLMServer({ processor: "blocking" }))
const withMcpInstructions = testEffect(
  makeHttp({
    mcpInstructions: [
      {
        name: "guide-server",
        instructions: "Use lookup before mutate.",
        tools: ["guide-server_lookup"],
      },
    ],
  }),
)
const unix = process.platform !== "win32" ? it.instance : it.instance.skip
const unixNoLLMServer = process.platform !== "win32" ? noLLMServer.instance : noLLMServer.instance.skip
const projectOriginIt = process.platform === "win32" ? it.instance : it.instance.skip
const projectOriginNoLLMServer = process.platform === "win32" ? noLLMServer.instance : noLLMServer.instance.skip

// Config that registers a custom "test" provider with a "test-model" model
// so provider model lookup succeeds inside the loop.
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

const writeText = Effect.fn("test.writeText")(function* (file: string, text: string) {
  const fs = yield* FSUtil.Service
  yield* fs.writeWithDirs(file, text)
})

const writeConfig = Effect.fn("test.writeConfig")(function* (dir: string, config: Partial<ConfigV1.Info>) {
  yield* writeText(
    path.join(dir, "repa.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", ...config }),
  )
})

const useMachineConfig = Effect.fn("test.useMachineConfig")(function* (config: Partial<ConfigV1.Info>) {
  const previous = process.env.REPA_CONFIG_CONTENT
  process.env.REPA_CONFIG_CONTENT = JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    ...config,
  })
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      if (previous === undefined) delete process.env.REPA_CONFIG_CONTENT
      else process.env.REPA_CONFIG_CONTENT = previous
    }),
  )
})

const useServerConfig = Effect.fn("test.useServerConfig")(function* (config: (url: string) => Partial<ConfigV1.Info>) {
  const { directory: dir } = yield* TestInstance
  const llm = yield* TestLLMServer
  yield* useMachineConfig(config(llm.url))
  return { dir, llm }
})

// Wait for a session's runner to enter a busy state. SessionStatus is flipped
// inside Runner.startShell's serialized transition, so cancel can't no-op once
// we observe it.
const waitForBusy = (sessionID: SessionID, duration: Duration.Input = "2 seconds") =>
  pollWithTimeout(
    Effect.gen(function* () {
      const status = yield* SessionStatus.Service
      const s = yield* status.get(sessionID)
      return s.type === "busy" ? (true as const) : undefined
    }),
    `session ${sessionID} never became busy`,
    duration,
  )

const hasBash = Effect.sync(() => Bun.which("bash") !== null)

const deferredAsPromise = <A>(deferred: Deferred.Deferred<A>): PromiseLike<A> => ({
  then: (onfulfilled, onrejected) => {
    Effect.runFork(
      Deferred.await(deferred).pipe(
        Effect.match({
          onFailure: (error) => {
            onrejected?.(error)
          },
          onSuccess: (value) => {
            onfulfilled?.(value)
          },
        }),
      ),
    )
    return deferredAsPromise(deferred) as PromiseLike<never>
  },
})

function defer<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const succeedVoid = (deferred: Deferred.Deferred<void>) => {
  Effect.runSync(Deferred.succeed(deferred, void 0).pipe(Effect.ignore))
}

const user = Effect.fn("test.user")(function* (sessionID: SessionID, text: string) {
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

const occurrencePresentation = Effect.fn("test.occurrencePresentation")(function* (
  sessionID: SessionID,
  messageID: MessageID,
) {
  const events = yield* EventV2Bridge.Service
  const result = yield* events.transaction((tx) =>
    Occurrence.resolvePresentation(tx, { sessionID, messageID }).pipe(
      Effect.map((presentation) => ({ result: presentation })),
      Effect.catchTag("LearningCommand.InvalidCausalSourceError", (error) =>
        error.reason === "missing_presentation" ? Effect.succeed({ result: undefined }) : Effect.fail(error),
      ),
      Effect.orDie,
    ),
  )
  return result.result
})

const seed = Effect.fn("test.seed")(function* (sessionID: SessionID, opts?: { finish?: string }) {
  const session = yield* Session.Service
  const msg = yield* user(sessionID, "hello")
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: msg.id,
    sessionID,
    mode: "repa",
    agent: "repa",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
    ...(opts?.finish ? { finish: opts.finish } : {}),
  }
  yield* session.updateMessage(assistant)
  yield* session.updatePart({
    id: PartID.ascending(),
    messageID: assistant.id,
    sessionID,
    type: "text",
    text: "hi there",
  })
  return { user: msg, assistant }
})

const addSubtask = (sessionID: SessionID, messageID: MessageID, model = ref) =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    yield* session.updatePart({
      id: PartID.ascending(),
      messageID,
      sessionID,
      type: "subtask",
      prompt: "look into the cache key path",
      description: "inspect bug",
      agent: "general",
      model,
    })
  })

const boot = Effect.fn("test.boot")(function* (input?: { title?: string }) {
  const config = yield* Config.Service
  const prompt = yield* SessionPrompt.Service
  const run = yield* SessionRunState.Service
  const sessions = yield* Session.Service
  yield* config.get()
  const chat = (yield* materializeTestSession(input ?? { title: "Pinned" })).info
  return { prompt, run, sessions, chat }
})

noLLMServer.instance(
  "strict root start atomically admits a finite Turn and exact replay appends nothing",
  () =>
    Effect.gen(function* () {
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const inputID = Turn.InputID.create()
      const messageID = MessageID.ascending()
      const request = {
        sessionID,
        turnID,
        inputID,
        messageID,
        agent: "repa",
        model: ref,
        limits: { model: 0, tool: 0 },
        session: { title: "strict atomic start" },
        parts: [{ type: "text" as const, text: "teach the exact request" }],
      }

      const started = yield* prompt.start(request)
      expect(started.id).toBe(turnID)
      expect(started.initialInputID).toBe(inputID)
      const terminal = yield* prompt.awaitTurn(sessionID, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "exhausted", reason: "model_limit" })
      const beforeReplayEvents = yield* database.db
        .select({ type: EventTable.type, data: EventTable.data })
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, sessionID))
        .orderBy(EventTable.seq)
        .all()
        .pipe(Effect.orDie)
      expect(beforeReplayEvents.map((event) => event.type).filter((type) => type.startsWith("turn."))).toEqual([
        EventV2.versionedType(TurnEvent.Started.type, TurnEvent.Started.durable!.version),
        EventV2.versionedType(TurnEvent.Terminal.type, TurnEvent.Terminal.durable!.version),
      ])
      expect(beforeReplayEvents.find((event) => event.type.startsWith("turn.started"))?.data).toMatchObject({
        turnID,
        sessionID,
      })
      const beforeReplay = yield* sessions.messages({ sessionID })
      expect(beforeReplay).toHaveLength(1)
      expect(beforeReplay[0]?.info.id).toBe(messageID)
      expect((yield* occurrencePresentation(sessionID, messageID))?.provenance).toBe("origin")

      const replay = yield* prompt.start(request)
      expect(replay).toEqual(terminal)
      expect(yield* sessions.messages({ sessionID })).toEqual(beforeReplay)
      expect(
        yield* database.db
          .select({ type: EventTable.type, data: EventTable.data })
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, sessionID))
          .orderBy(EventTable.seq)
          .all()
          .pipe(Effect.orDie),
      ).toEqual(beforeReplayEvents)

      const conflict = yield* prompt
        .start({ ...request, parts: [{ type: "text", text: "changed request" }] })
        .pipe(Effect.exit)
      expect(Exit.isFailure(conflict)).toBe(true)
      if (Exit.isFailure(conflict)) expect(Cause.squash(conflict.cause)).toBeInstanceOf(Turn.AdmissionConflictError)
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
)

it.instance(
  "strict root start records the exact model lifecycle before terminal settlement",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const request = {
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "strict sampled Turn" },
        parts: [{ type: "text" as const, text: "answer this exact request" }],
      }
      yield* llm.text("exact response")

      yield* prompt.start(request)
      const terminal = yield* prompt.awaitTurn(sessionID, turnID)

      const events = yield* database.db
        .select({ type: EventTable.type, data: EventTable.data })
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, sessionID))
        .orderBy(EventTable.seq)
        .all()
        .pipe(Effect.orDie)
      expect(events.map((event) => event.type).filter((type) => type.startsWith("turn."))).toEqual([
        EventV2.versionedType(TurnEvent.Started.type, TurnEvent.Started.durable!.version),
        EventV2.versionedType(TurnEvent.ModelAdmitted.type, TurnEvent.ModelAdmitted.durable!.version),
        EventV2.versionedType(TurnEvent.CandidateSetSealed.type, TurnEvent.CandidateSetSealed.durable!.version),
        EventV2.versionedType(TurnEvent.ModelSettled.type, TurnEvent.ModelSettled.durable!.version),
        EventV2.versionedType(TurnEvent.Terminal.type, TurnEvent.Terminal.durable!.version),
      ])
      expect(terminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })
      expect(yield* llm.calls).toBe(1)
      const admitted = events.find((event) => event.type.startsWith("turn.model.admitted"))?.data
      const settled = events.find((event) => event.type.startsWith("turn.model.settled"))?.data
      expect(admitted).toMatchObject({ sessionID, turnID })
      expect(settled).toMatchObject({
        sessionID,
        turnID,
        assistantMessageID: (admitted as { operation?: { assistantMessageID?: string } }).operation?.assistantMessageID,
        state: "completed",
      })

      expect(yield* prompt.start(request)).toEqual(terminal)
      expect(yield* llm.calls).toBe(1)
      expect(
        yield* database.db
          .select({ type: EventTable.type, data: EventTable.data })
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, sessionID))
          .orderBy(EventTable.seq)
          .all()
          .pipe(Effect.orDie),
      ).toEqual(events)
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
)

it.instance(
  "FIFO steers bind distinct model operations and survive a frontier-rebuild boundary without over-promotion",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const rootInputID = Turn.InputID.create()
      const steerAInputID = Turn.InputID.create()
      const steerBInputID = Turn.InputID.create()
      const firstRelease = defer<void>()
      const secondRelease = defer<void>()
      const contextEntered = defer<void>()
      const contextRelease = defer<void>()
      const otherSession = yield* materializeTestSession({ title: "independent frontier source" })
      const contextHook = () => {
        contextEntered.resolve()
        return contextRelease.promise
      }
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          const index = contextBuildHooks.indexOf(contextHook)
          if (index >= 0) contextBuildHooks.splice(index, 1)
          firstRelease.resolve()
          secondRelease.resolve()
          contextRelease.resolve()
        }),
      )
      yield* llm.hold("first response", firstRelease.promise)
      yield* llm.hold("response caused by steer A", secondRelease.promise)
      yield* llm.text("response caused by steer B")

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: rootInputID,
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 3, tool: 0 },
        session: { title: "strict FIFO steered Turn" },
        parts: [{ type: "text", text: "begin with this request" }],
      })
      yield* awaitWithTimeout(llm.wait(1), "first model operation was not sampled")

      contextBuildHooks.push(contextHook)
      const steerA = yield* prompt
        .steer({
          sessionID,
          expectedTurnID: turnID,
          inputID: steerAInputID,
          messageID: MessageID.ascending(),
          agent: "repa",
          model: ref,
          parts: [{ type: "text", text: "apply correction A next" }],
        })
        .pipe(Effect.forkChild)
      yield* Effect.sleep("25 millis")
      const steerB = yield* prompt
        .steer({
          sessionID,
          expectedTurnID: turnID,
          inputID: steerBInputID,
          messageID: MessageID.ascending(),
          agent: "repa",
          model: ref,
          parts: [{ type: "text", text: "apply correction B only after A is sampled" }],
        })
        .pipe(Effect.forkChild)
      yield* Effect.sleep("25 millis")
      firstRelease.resolve()

      yield* awaitWithTimeout(
        Effect.promise(() => contextEntered.promise),
        "the post-A context build did not reach its deterministic frontier race",
      )
      expect((yield* Fiber.join(steerA)).id).toBe(steerAInputID)
      expect(steerB.pollUnsafe()).toBeUndefined()
      expect(yield* llm.calls).toBe(1)

      const beforeRebuildInputs = yield* database.db
        .select({
          id: TurnInputTable.id,
          occurrenceID: TurnInputTable.occurrence_id,
          ordinal: TurnInputTable.ordinal,
        })
        .from(TurnInputTable)
        .where(eq(TurnInputTable.turn_id, turnID))
        .orderBy(TurnInputTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      const beforeRebuildModels = yield* database.db
        .select({ inputID: TurnModelOperationTable.input_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, turnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      const beforeRebuildTurn = yield* database.db
        .select({ currentInputID: TurnTable.current_input_id })
        .from(TurnTable)
        .where(eq(TurnTable.id, turnID))
        .get()
        .pipe(Effect.orDie)
      expect(beforeRebuildInputs.map((input) => input.id)).toEqual([rootInputID, steerAInputID])
      expect(beforeRebuildModels.map((model) => model.inputID)).toEqual([rootInputID])
      expect(beforeRebuildTurn?.currentInputID).toBe(steerAInputID)

      // The shared frontier is database-wide. Materializing a separate Session above
      // makes this transition causally external to the Turn under test.
      const advancedFrontier = yield* database.db
        .transaction((tx) => LearningFrontier.advance(tx, { time: Date.now() }))
        .pipe(Effect.catchTag("SqlError", Effect.die))
      contextRelease.resolve()

      yield* awaitWithTimeout(llm.wait(2), "the rebuilt A model operation was not sampled")
      expect(steerB.pollUnsafe()).toBeUndefined()
      expect(yield* llm.calls).toBe(2)
      const afterRebuildModels = yield* database.db
        .select({
          inputID: TurnModelOperationTable.input_id,
          causalOccurrenceID: TurnModelOperationTable.causal_occurrence_id,
          snapshotSequence: TurnModelOperationTable.snapshot_frontier_sequence,
          snapshotTime: TurnModelOperationTable.snapshot_frontier_time,
        })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, turnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      expect(afterRebuildModels.map((model) => model.inputID)).toEqual([rootInputID, steerAInputID])
      expect(afterRebuildModels[1]).toMatchObject({
        inputID: steerAInputID,
        causalOccurrenceID: beforeRebuildInputs[1]?.occurrenceID,
        snapshotSequence: advancedFrontier.sequence,
        snapshotTime: advancedFrontier.time,
      })

      secondRelease.resolve()
      expect((yield* Fiber.join(steerB)).id).toBe(steerBInputID)
      yield* awaitWithTimeout(llm.wait(3), "the model operation causally bound to steer B was not sampled")
      const terminal = yield* prompt.awaitTurn(sessionID, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })
      expect(yield* llm.calls).toBe(3)

      const inputs = yield* database.db
        .select({
          id: TurnInputTable.id,
          occurrenceID: TurnInputTable.occurrence_id,
          ordinal: TurnInputTable.ordinal,
        })
        .from(TurnInputTable)
        .where(eq(TurnInputTable.turn_id, turnID))
        .orderBy(TurnInputTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      const models = yield* database.db
        .select({
          inputID: TurnModelOperationTable.input_id,
          causalOccurrenceID: TurnModelOperationTable.causal_occurrence_id,
          ordinal: TurnModelOperationTable.ordinal,
        })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, turnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      expect(inputs.map((input) => input.id)).toEqual([rootInputID, steerAInputID, steerBInputID])
      expect(new Set(inputs.map((input) => input.occurrenceID)).size).toBe(3)
      expect(models.map((model) => model.inputID)).toEqual([rootInputID, steerAInputID, steerBInputID])
      expect(models.map((model) => model.causalOccurrenceID)).toEqual(inputs.map((input) => input.occurrenceID))

      const events = yield* database.db
        .select({ type: EventTable.type, data: EventTable.data })
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, sessionID))
        .orderBy(EventTable.seq)
        .all()
        .pipe(Effect.orDie)
      expect(
        events
          .filter((event) => event.type.startsWith("turn.input.promoted"))
          .map((event) => (event.data as { input?: { id?: string } }).input?.id),
      ).toEqual([steerAInputID, steerBInputID])
      yield* sessions.remove(sessionID)
      yield* sessions.remove(otherSession.info.id)
    }),
  { config: cfg },
  30_000,
)

it.instance(
  "task executes one synchronous child Turn and returns its bounded durable result",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const parentSessionID = SessionID.create()
      const parentTurnID = Turn.ID.create()
      yield* llm.tool("task", {
        description: "inspect one boundary",
        prompt: "return the bounded child answer",
        subagent_type: "general",
        capabilities: [],
      })
      yield* llm.text("bounded child answer")
      yield* llm.text("parent used child answer")

      yield* prompt.start({
        sessionID: parentSessionID,
        turnID: parentTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 3, tool: 2 },
        session: {
          title: "strict parent task Turn",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "delegate this bounded investigation" }],
      })
      const parent = yield* prompt.awaitTurn(parentSessionID, parentTurnID)
      expect(parent.terminal).toMatchObject({ outcome: "completed", reason: "normal" })
      expect(yield* llm.calls).toBe(3)

      const parentMessages = yield* sessions.messages({ sessionID: parentSessionID })
      const task = parentMessages
        .flatMap((message) => message.parts)
        .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.tool === "task")
      expect(task?.state.status).toBe("completed")
      if (!task || task.state.status !== "completed") return
      const output = JSON.parse(task.state.output) as {
        child_session_id: SessionID
        child_turn_id: Turn.ID
        terminal_outcome: string
        requested_output: { state: string; value?: string }
      }
      expect(output).toMatchObject({
        terminal_outcome: "completed",
        requested_output: { state: "complete", value: "bounded child answer" },
      })

      const replay = yield* prompt.awaitChild({
        parentSessionID,
        parentTurnID,
        parentTaskPartID: task.id,
        childSessionID: output.child_session_id,
        childTurnID: output.child_turn_id,
      })
      expect(replay).toMatchObject({
        parentSessionID,
        parentTurnID,
        parentTaskPartID: task.id,
        childSessionID: output.child_session_id,
        childTurnID: output.child_turn_id,
        terminalOutcome: "completed",
        requestedOutput: { state: "complete", value: "bounded child answer" },
      })
      expect(
        yield* database.db
          .transaction((tx) => TurnLifecycle.childResult(tx, task.id))
          .pipe(Effect.catchTag("SqlError", Effect.die)),
      ).toEqual(replay)

      const childEvents = yield* database.db
        .select({ type: EventTable.type })
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, output.child_session_id))
        .orderBy(EventTable.seq)
        .all()
        .pipe(Effect.orDie)
      expect(childEvents.map((event) => event.type).filter((type) => type.startsWith("turn."))).toEqual([
        EventV2.versionedType(TurnEvent.Started.type, TurnEvent.Started.durable!.version),
        EventV2.versionedType(TurnEvent.ModelAdmitted.type, TurnEvent.ModelAdmitted.durable!.version),
        EventV2.versionedType(TurnEvent.CandidateSetSealed.type, TurnEvent.CandidateSetSealed.durable!.version),
        EventV2.versionedType(TurnEvent.ModelSettled.type, TurnEvent.ModelSettled.durable!.version),
        EventV2.versionedType(TurnEvent.Terminal.type, TurnEvent.Terminal.durable!.version),
      ])
      yield* sessions.remove(parentSessionID)
    }),
  { config: cfg },
  30_000,
)

it.instance(
  "interrupting a parent Turn settles its live child before returning",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const parentSessionID = SessionID.create()
      const parentTurnID = Turn.ID.create()
      yield* llm.tool("task", {
        description: "wait in child",
        prompt: "keep the child operation live",
        subagent_type: "general",
        capabilities: [],
      })
      yield* llm.hang

      yield* prompt.start({
        sessionID: parentSessionID,
        turnID: parentTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "strict parent cancellation tree",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "delegate and wait" }],
      })
      yield* awaitWithTimeout(llm.wait(2), "child model operation was not sampled")
      const child = yield* pollWithTimeout(
        Effect.gen(function* () {
          const messages = yield* sessions.messages({ sessionID: parentSessionID })
          const task = messages
            .flatMap((message) => message.parts)
            .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.tool === "task")
          if (task?.state.status !== "running") return
          const childSessionID = task.state.metadata?.childSessionId
          const childTurnID = task.state.metadata?.childTurnId
          if (typeof childSessionID !== "string" || typeof childTurnID !== "string") return
          return { sessionID: SessionID.make(childSessionID), turnID: Turn.ID.make(childTurnID) }
        }),
        "parent task did not expose its exact live child identity",
      )

      const parent = yield* prompt.interruptTurn(parentSessionID, parentTurnID)
      const terminalChild = yield* prompt.getTurn(child.sessionID, child.turnID)
      expect(terminalChild.terminal).toMatchObject({ outcome: "interrupted", reason: "ancestor_interrupt" })
      expect(parent.terminal).toMatchObject({ outcome: "interrupted", reason: "learner_interrupt" })
      expect(
        DateTime.toEpochMillis(parent.terminal!.time) >= DateTime.toEpochMillis(terminalChild.terminal!.time),
      ).toBe(true)
      yield* sessions.remove(parentSessionID)
    }),
  { config: cfg },
  30_000,
)

raceNoLLMServer.instance(
  "strict start never becomes steer and exact Turn interrupt terminalizes its owner",
  () =>
    Effect.gen(function* () {
      const { prompt, sessions, chat } = yield* boot()
      const turnID = Turn.ID.create()
      const started = yield* prompt.start({
        sessionID: chat.id,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 4, tool: 4 },
        parts: [{ type: "text", text: "keep this Turn active" }],
      })
      expect(started.state).toBe("running")

      const otherTurnID = Turn.ID.create()
      const rejected = yield* prompt
        .start({
          sessionID: chat.id,
          turnID: otherTurnID,
          inputID: Turn.InputID.create(),
          messageID: MessageID.ascending(),
          agent: "repa",
          model: ref,
          limits: { model: 1, tool: 1 },
          parts: [{ type: "text", text: "must not auto-steer" }],
        })
        .pipe(Effect.exit)
      expect(Exit.isFailure(rejected)).toBe(true)
      if (Exit.isFailure(rejected)) expect(Cause.squash(rejected.cause)).toBeInstanceOf(Turn.AlreadyRunningError)

      const interrupted = yield* prompt.interruptTurn(chat.id, turnID)
      expect(interrupted.terminal).toMatchObject({ outcome: "interrupted", reason: "learner_interrupt" })
      expect((yield* prompt.interruptTurn(chat.id, turnID)).terminal).toEqual(interrupted.terminal)
      yield* sessions.remove(chat.id)
    }),
  { config: cfg },
)
