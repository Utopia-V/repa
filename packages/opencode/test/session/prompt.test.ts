import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { eq } from "drizzle-orm"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { expect, setSystemTime } from "bun:test"
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
import { httpError, reply, TestLLMServer } from "../lib/llm-server"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { LocationServiceMap, locationServiceMapLayer } from "@opencode-ai/core/location-services"
import { InstanceStore } from "@/project/instance-store"
import { TestConsole } from "effect/testing"
import { LearningCommand, Occurrence } from "@opencode-ai/core/learning-command"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { AdmittedLearnerOccurrenceTable } from "@opencode-ai/core/learning-command/occurrence.sql"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { TurnInputTable, TurnModelOperationTable, TurnTable } from "@opencode-ai/core/turn/sql"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { Turn } from "@opencode-ai/schema/turn"
import { TurnEvent } from "@opencode-ai/schema/turn-event"
import { entryBody } from "@/cli/cmd/run/entry.body"
import { toolInlineInfo } from "@/cli/cmd/run/tool"
import type { StreamCommit } from "@/cli/cmd/run/types"
import type { ToolPart as SDKToolPart } from "@opencode-ai/sdk/v2"

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
const resourceReadHooks: Array<() => PromiseLike<void>> = []
const compactionPruneHooks: Array<() => Effect.Effect<void>> = []
const summaryHooks: Array<() => Effect.Effect<void>> = []

const hookedCompaction = Layer.succeed(
  SessionCompaction.Service,
  SessionCompaction.Service.of({
    isOverflow: () => Effect.succeed(false),
    prune: () => compactionPruneHooks.shift()?.() ?? Effect.void,
    process: () => Effect.succeed("stop"),
    create: () => Effect.void,
  }),
)

const hookedSummary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => summaryHooks.shift()?.() ?? Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

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
      readResource: (_clientName, uri) => {
        const hook = resourceReadHooks.shift()
        if (!hook) return Effect.succeed(undefined)
        return Effect.promise(() => hook()).pipe(
          Effect.as({ contents: [{ uri, mimeType: "text/plain", text: "delayed source preparation" }] }),
        )
      },
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
const compactionBoundary = testEffect(
  LayerNode.compile(promptRoot, [
    [SessionSummary.node, summary],
    [LSP.node, lsp],
    [MCP.node, makeMcp()],
    [RuntimeFlags.node, runtimeFlags],
    [SessionCompaction.node, hookedCompaction],
  ]),
)
const internalSessionWorkBoundary = testEffect(
  LayerNode.compile(LayerNode.group([promptRoot, testLLMServerNode]), [
    [SessionSummary.node, hookedSummary],
    [LSP.node, lsp],
    [MCP.node, makeMcp()],
    [RuntimeFlags.node, runtimeFlags],
  ]),
)
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

const waitForSettledModelOperation = (turnID: Turn.ID) =>
  pollWithTimeout(
    Effect.gen(function* () {
      const database = yield* Database.Service
      const operation = yield* database.db
        .select({ state: TurnModelOperationTable.state })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, turnID))
        .get()
        .pipe(Effect.orDie)
      return operation?.state !== "running" ? true : undefined
    }),
    `Turn ${turnID} model operation did not settle`,
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

function isoWithTimeZoneOffset(instant: number, timeZone: string) {
  const value = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(instant))
    .find((part) => part.type === "timeZoneName")?.value
  const match = /^(?:GMT|UTC)([+-])(\d{2}):(\d{2})$/.exec(value ?? "")
  const offsetMinutes =
    value === "GMT" || value === "UTC"
      ? 0
      : match
        ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
        : undefined
  if (offsetMinutes === undefined) throw new Error(`Could not resolve the test timezone offset for ${timeZone}`)
  const sign = offsetMinutes < 0 ? "-" : "+"
  const absolute = Math.abs(offsetMinutes)
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`
  return `${new Date(instant + offsetMinutes * 60_000).toISOString().slice(0, -1)}${offset}`
}

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

compactionBoundary.instance(
  "keeps post-loop pruning inside the exact Turn handoff before a later start",
  () =>
    Effect.gen(function* () {
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const pruneEntered = yield* Deferred.make<void>()
      const releasePrune = yield* Deferred.make<void>()
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(releasePrune, undefined).pipe(
          Effect.andThen(
            Effect.sync(() => {
              compactionPruneHooks.length = 0
            }),
          ),
          Effect.asVoid,
        ),
      )
      compactionPruneHooks.push(() =>
        Deferred.succeed(pruneEntered, undefined).pipe(Effect.andThen(Deferred.await(releasePrune))),
      )

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 0, tool: 0 },
        session: { title: "post-loop pruning boundary" },
        parts: [{ type: "text", text: "finish this Turn before accepting another" }],
      })
      yield* awaitWithTimeout(Deferred.await(pruneEntered), "Turn did not reach post-loop pruning")
      const awaiting = yield* prompt.awaitTurn(sessionID, turnID).pipe(Effect.forkChild)
      expect(
        yield* Effect.race(
          Fiber.join(awaiting).pipe(Effect.as(true)),
          Effect.sleep("50 millis").pipe(Effect.as(false)),
        ),
      ).toBe(false)

      yield* Deferred.succeed(releasePrune, undefined)
      expect((yield* Fiber.join(awaiting)).terminal).toMatchObject({ outcome: "exhausted", reason: "model_limit" })

      const laterTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID,
        turnID: laterTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 0, tool: 0 },
        parts: [{ type: "text", text: "start only after the prior handoff is released" }],
      })
      expect((yield* prompt.awaitTurn(sessionID, laterTurnID)).terminal).toMatchObject({
        outcome: "exhausted",
        reason: "model_limit",
      })
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
)

compactionBoundary.instance(
  "logs a post-loop pruning failure without changing the Turn result",
  () =>
    Effect.gen(function* () {
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const marker = "focused post-loop prune failure"
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          compactionPruneHooks.length = 0
        }),
      )
      compactionPruneHooks.push(() => Effect.die(new Error(marker)))

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 0, tool: 0 },
        session: { title: "non-fatal post-loop pruning failure" },
        parts: [{ type: "text", text: "finish truthfully even when pruning fails" }],
      })
      expect((yield* prompt.awaitTurn(sessionID, turnID)).terminal).toMatchObject({
        outcome: "exhausted",
        reason: "model_limit",
      })

      const logs = yield* TestConsole.logLines
      expect(logs).toContain("session pruning skipped")
      const annotation = logs.find(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && "sessionID" in item && "error" in item,
      )
      expect(annotation?.sessionID).toBe(sessionID)
      expect(annotation?.error).toBeInstanceOf(Error)
      expect((annotation?.error as Error | undefined)?.message).toBe(marker)
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
)

internalSessionWorkBoundary.instance(
  "keeps first-step summary inside the exact Turn handoff before a later start",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const summaryEntered = yield* Deferred.make<void>()
      const releaseSummary = yield* Deferred.make<void>()
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(releaseSummary, undefined).pipe(
          Effect.andThen(
            Effect.sync(() => {
              summaryHooks.length = 0
            }),
          ),
          Effect.asVoid,
        ),
      )
      summaryHooks.push(() =>
        Deferred.succeed(summaryEntered, undefined).pipe(Effect.andThen(Deferred.await(releaseSummary))),
      )
      yield* llm.text("summary-bound response")

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "summary handoff boundary" },
        parts: [{ type: "text", text: "finish only after the summary releases" }],
      })
      yield* awaitWithTimeout(Deferred.await(summaryEntered), "Turn did not start first-step summary")
      expect(
        yield* Effect.race(llm.wait(1).pipe(Effect.as(true)), Effect.sleep("1 second").pipe(Effect.as(false))),
      ).toBe(false)
      const awaiting = yield* prompt.awaitTurn(sessionID, turnID).pipe(Effect.forkChild)
      expect(
        yield* Effect.race(
          Fiber.join(awaiting).pipe(Effect.as(true)),
          Effect.sleep("50 millis").pipe(Effect.as(false)),
        ),
      ).toBe(false)

      yield* Deferred.succeed(releaseSummary, undefined)
      yield* waitForSettledModelOperation(turnID)
      expect((yield* Fiber.join(awaiting)).terminal).toMatchObject({ outcome: "completed", reason: "normal" })

      const laterTurnID = Turn.ID.create()
      yield* llm.text("later response")
      yield* prompt.start({
        sessionID,
        turnID: laterTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        parts: [{ type: "text", text: "start after the summary handoff" }],
      })
      expect((yield* prompt.awaitTurn(sessionID, laterTurnID)).terminal).toMatchObject({
        outcome: "completed",
        reason: "normal",
      })
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
)

internalSessionWorkBoundary.instance(
  "keeps title generation inside the exact Turn handoff before a later start",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const releaseTitle = yield* Deferred.make<void>()
      yield* Effect.addFinalizer(() => Deferred.succeed(releaseTitle, undefined).pipe(Effect.asVoid))
      yield* llm.holdTitle("Generated title", deferredAsPromise(releaseTitle))
      yield* llm.text("title-bound response")

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "New session - 2026-07-31T00:00:00.000Z" },
        parts: [{ type: "text", text: "finish only after title generation releases" }],
      })
      yield* llm.wait(2)
      yield* waitForSettledModelOperation(turnID)
      const awaiting = yield* prompt.awaitTurn(sessionID, turnID).pipe(Effect.forkChild)
      expect(
        yield* Effect.race(
          Fiber.join(awaiting).pipe(Effect.as(true)),
          Effect.sleep("50 millis").pipe(Effect.as(false)),
        ),
      ).toBe(false)

      yield* Deferred.succeed(releaseTitle, undefined)
      expect((yield* Fiber.join(awaiting)).terminal).toMatchObject({ outcome: "completed", reason: "normal" })
      expect((yield* sessions.get(sessionID)).title).toBe("Generated title")

      const laterTurnID = Turn.ID.create()
      yield* llm.text("later response")
      yield* prompt.start({
        sessionID,
        turnID: laterTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        parts: [{ type: "text", text: "start after the title handoff" }],
      })
      expect((yield* prompt.awaitTurn(sessionID, laterTurnID)).terminal).toMatchObject({
        outcome: "completed",
        reason: "normal",
      })
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
  "persists the one captured source temporal context after asynchronous source preparation advances the clock",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const messageID = MessageID.ascending()
      const sourceTime = Date.parse("2026-07-20T15:59:59.900Z")
      const persistedTime = sourceTime + 5_000
      const expectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const sourcePreparation = () => {
        setSystemTime(new Date(persistedTime))
        return Promise.resolve()
      }
      resourceReadHooks.push(sourcePreparation)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          setSystemTime()
          const index = resourceReadHooks.indexOf(sourcePreparation)
          if (index >= 0) resourceReadHooks.splice(index, 1)
        }),
      )
      setSystemTime(new Date(sourceTime))
      yield* llm.text("ordinary continuation after delayed source preparation")

      const started = yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID,
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "single source temporal capture" },
        parts: [
          { type: "text", text: "Continue this ordinary learning request." },
          {
            type: "file",
            mime: "text/plain",
            filename: "delayed.txt",
            url: "mcp://test/delayed",
            source: {
              type: "resource",
              clientName: "test",
              uri: "test://delayed",
              text: { value: "delayed", start: 0, end: 7 },
            },
          },
        ],
      })
      const terminal = started.terminal ? started : yield* prompt.awaitTurn(sessionID, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })
      const presentation = yield* occurrencePresentation(sessionID, messageID)
      if (!presentation) return yield* Effect.die("Expected admitted learner occurrence")
      const occurrence = yield* database.db
        .select()
        .from(AdmittedLearnerOccurrenceTable)
        .where(eq(AdmittedLearnerOccurrenceTable.id, presentation.occurrenceID))
        .get()
        .pipe(Effect.orDie)
      expect(occurrence).toMatchObject({
        time_admitted: sourceTime,
        source_temporal_state: "resolved",
        source_timezone: expectedTimeZone,
      })
      expect((yield* sessions.messages({ sessionID }))[0]?.info.time.created).toBe(sourceTime)
      expect(Date.now()).toBe(persistedTime)
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
)

it.instance(
  "carries frozen source time through midnight and host-timezone changes for root and promoted steer requests",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const rootInputID = Turn.InputID.create()
      const steerInputID = Turn.InputID.create()
      const rootMessageID = MessageID.ascending()
      const steerMessageID = MessageID.ascending()
      const steerPartID = PartID.ascending()
      const steerFilePartID = PartID.ascending()
      const day = 24 * 60 * 60 * 1_000
      const shanghaiOffset = 8 * 60 * 60 * 1_000
      // Keep the midnight scenario ahead of process-wide causal time floors instead of pinning it to a past date.
      const shanghaiMidnight = Math.ceil((Date.now() + shanghaiOffset) / day) * day - shanghaiOffset
      const sourceTime = shanghaiMidnight - 60 * 1_000
      const rootOperationTime = shanghaiMidnight + 60 * 1_000
      const steerSourceTime = rootOperationTime + 1_000
      const steerOperationTime = rootOperationTime + 2_000
      const rootResponse = defer<void>()
      const contextEntered = defer<void>()
      const contextRelease = defer<void>()
      const steerSourceEntered = defer<void>()
      const steerSourceRelease = defer<void>()
      const originalTimeZone = process.env.TZ
      const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions
      const contextHook = () => {
        contextEntered.resolve()
        return contextRelease.promise
      }
      const steerSourceHook = () => {
        steerSourceEntered.resolve()
        return steerSourceRelease.promise
      }
      const unavailableResolvedOptions = function (this: Intl.DateTimeFormat) {
        return { ...originalResolvedOptions.call(this), timeZone: "" }
      }
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          setSystemTime()
          Intl.DateTimeFormat.prototype.resolvedOptions = originalResolvedOptions
          if (originalTimeZone === undefined) delete process.env.TZ
          else process.env.TZ = originalTimeZone
          const index = contextBuildHooks.indexOf(contextHook)
          if (index >= 0) contextBuildHooks.splice(index, 1)
          const sourceIndex = resourceReadHooks.indexOf(steerSourceHook)
          if (sourceIndex >= 0) resourceReadHooks.splice(sourceIndex, 1)
          contextRelease.resolve()
          steerSourceRelease.resolve()
          rootResponse.resolve()
        }),
      )
      process.env.TZ = "Asia/Shanghai"
      setSystemTime(new Date(sourceTime))
      contextBuildHooks.push(contextHook)
      yield* llm.hold("root response", rootResponse.promise)
      yield* llm.text("response to the promoted steer")

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: rootInputID,
        messageID: rootMessageID,
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 0 },
        session: { title: "frozen source temporal carrier" },
        parts: [{ type: "text", text: "Today, explain this example without a quiz." }],
      })
      yield* awaitWithTimeout(
        Effect.promise(() => contextEntered.promise),
        "root request did not reach the pre-model context boundary",
      )
      process.env.TZ = "America/New_York"
      setSystemTime(new Date(rootOperationTime))
      contextRelease.resolve()
      yield* awaitWithTimeout(llm.wait(1), "root provider request was not dispatched")

      process.env.TZ = "Asia/Shanghai"
      setSystemTime(new Date(steerSourceTime))
      resourceReadHooks.push(steerSourceHook)
      Intl.DateTimeFormat.prototype.resolvedOptions = unavailableResolvedOptions
      const steer = yield* prompt
        .steer({
          sessionID,
          expectedTurnID: turnID,
          inputID: steerInputID,
          messageID: steerMessageID,
          agent: "repa",
          model: ref,
          parts: [
            { id: steerPartID, type: "text", text: "For this continuation, use a worked example." },
            {
              id: steerFilePartID,
              type: "file",
              mime: "text/plain",
              filename: "steer-source.txt",
              url: "mcp://test/steer-source",
              source: {
                type: "resource",
                clientName: "test",
                uri: "test://steer-source",
                text: { value: "steer source", start: 0, end: 12 },
              },
            },
          ],
        })
        .pipe(Effect.forkChild)
      yield* awaitWithTimeout(
        Effect.promise(() => steerSourceEntered.promise),
        "promoted steer did not capture its unavailable source-time arm",
      )
      Intl.DateTimeFormat.prototype.resolvedOptions = originalResolvedOptions
      process.env.TZ = "America/New_York"
      setSystemTime(new Date(steerOperationTime))
      steerSourceRelease.resolve()
      rootResponse.resolve()
      expect((yield* Fiber.join(steer)).id).toBe(steerInputID)
      yield* awaitWithTimeout(llm.wait(2), "promoted-steer provider request was not dispatched")
      const terminal = yield* prompt.awaitTurn(sessionID, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })

      const operations = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, turnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      expect(operations).toHaveLength(2)
      const cuts = yield* Effect.forEach(operations, (operation) =>
        database.db.transaction((tx) => RetainedSteering.readCut(tx, operation.assistantMessageID)),
      )
      expect(cuts[0]).toMatchObject({
        type: "available",
        cut: {
          cutAsOf: rootOperationTime,
          sourceTemporalContext: {
            state: "resolved",
            instant: sourceTime,
            timeZone: "Asia/Shanghai",
            utcOffsetMinutes: 480,
          },
        },
      })
      expect(cuts[1]).toMatchObject({
        type: "available",
        cut: {
          cutAsOf: steerOperationTime,
          sourceTemporalContext: {
            state: "unavailable",
            instant: steerSourceTime,
            reason: "timezone_unavailable",
          },
        },
      })
      if (cuts[0]?.type !== "available" || cuts[1]?.type !== "available") {
        return yield* Effect.die("Expected both stored source-relative cuts")
      }
      const hits = yield* llm.hits
      expect(hits).toHaveLength(2)
      const rootPayload = JSON.stringify(hits[0]?.body)
      const steerPayload = JSON.stringify(hits[1]?.body)
      expect(rootPayload).toContain(JSON.stringify(RetainedSteering.renderCut(cuts[0].cut)).slice(1, -1))
      expect(steerPayload).toContain(JSON.stringify(RetainedSteering.renderCut(cuts[1].cut)).slice(1, -1))
      expect(rootPayload.split("[Repa retained learner steering — protected]")).toHaveLength(2)
      expect(steerPayload.split("[Repa retained learner steering — protected]")).toHaveLength(2)
      expect(rootPayload).not.toContain("Today's date:")
      expect(rootPayload).not.toContain("America/New_York")
      expect(steerPayload).not.toContain("America/New_York")
      expect(steerPayload).toContain("Source-relative time is unavailable")
      expect(steerPayload).not.toContain(new Date(steerOperationTime).toISOString())
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
  30_000,
)

it.instance(
  "keeps the retained acknowledgement on the terminal after the following provider operation fails",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const cutFloor = yield* database.db.transaction((tx) => RetainedSteering.latestCutAsOf(tx))
      const validUntil = isoWithTimeZoneOffset(
        Math.max(Date.now(), cutFloor) + 60 * 60 * 1_000,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
      const sourceExcerpt = `across all my learning until ${validUntil}, do not quiz me`
      const input = {
        action: "create",
        sourceExcerpt,
        operativeInstruction: "Do not quiz me; continue with a useful explanation or demonstration.",
        validUntil,
      }
      yield* llm.tool(LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY, input)
      yield* llm.pushMatch(
        (hit) => JSON.stringify(hit.body).includes("Learning-wide until"),
        httpError(400, { error: { message: "post-commit provider failure" } }),
      )

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 2 },
        session: {
          title: "retained acknowledgement after provider failure",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: sourceExcerpt }],
      })
      const terminal = yield* prompt.awaitTurn(sessionID, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "failed", reason: "provider_failure" })
      const hits = yield* llm.hits
      expect(hits).toHaveLength(2)
      const operations = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, turnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      expect(operations).toHaveLength(2)
      const storedCut = yield* database.db.transaction((tx) =>
        RetainedSteering.readCut(tx, operations[1]!.assistantMessageID),
      )
      expect(storedCut.type).toBe("available")
      if (storedCut.type !== "available") return yield* Effect.die("Expected the post-commit stored cut")
      const secondPayload = JSON.stringify(hits[1]?.body)
      expect(secondPayload).toContain(JSON.stringify(RetainedSteering.renderCut(storedCut.cut)).slice(1, -1))
      expect(secondPayload.split("[Repa retained learner steering — protected]")).toHaveLength(2)
      expect(secondPayload).toContain(storedCut.cut.fingerprint)
      expect(secondPayload).toContain("Learning-wide until")
      expect(secondPayload).toContain(input.operativeInstruction)

      const part = (yield* sessions.messages({ sessionID }))
        .flatMap((message) => message.parts)
        .find(
          (candidate): candidate is SessionV1.ToolPart =>
            candidate.type === "tool" &&
            candidate.tool === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        )
      expect(part?.state.status).toBe("completed")
      if (!part || part.state.status !== "completed") return yield* Effect.die("Expected committed retained ToolPart")
      const projected = part as unknown as SDKToolPart
      const inline = toolInlineInfo(projected)
      expect(inline).toMatchObject({
        title: "Retained learning steering — Committed",
        mode: "block",
        body: expect.stringContaining(input.operativeInstruction),
      })
      if (!inline.body) return yield* Effect.die("Expected retained semantic result body")
      const final = entryBody({
        kind: "tool",
        text: "",
        phase: "final",
        source: "tool",
        tool: part.tool,
        toolState: "completed",
        part: projected,
      } satisfies StreamCommit)
      expect(final).toEqual({ type: "text", content: inline.body })
      expect(JSON.stringify(final)).not.toContain(" completed")
      expect(JSON.stringify(final)).not.toContain('"outcome":"applied"')
      expect(yield* database.db.transaction((tx) => RetainedSteering.readActive(tx, Date.now()))).toHaveLength(1)
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
)

it.instance(
  "keeps the learner Goal acknowledgement after the following provider operation fails",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const source = "Create a durable Goal: Learn operating systems; active; LearnerHome; no conditions; no target."
      const input = {
        operations: [
          {
            type: "create" as const,
            outcome: "Learn operating systems",
          },
        ],
      }
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input)
      yield* llm.error(400, { error: { message: "post-commit provider failure" } })

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 2 },
        session: {
          title: "learner Goal acknowledgement after provider failure",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: source }],
      })
      const terminal = yield* prompt.awaitTurn(sessionID, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "failed", reason: "provider_failure" })
      const messages = yield* sessions.messages({ sessionID })
      const part = messages
        .flatMap((message) => message.parts)
        .find(
          (candidate): candidate is SessionV1.ToolPart =>
            candidate.type === "tool" && candidate.tool === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        )
      expect(part?.state.status).toBe("completed")
      if (!part || part.state.status !== "completed") return yield* Effect.die("Expected committed Goal ToolPart")
      const projected = part as unknown as SDKToolPart
      const inline = toolInlineInfo(projected)
      expect(inline).toMatchObject({
        title: "Updated learning Goal — Committed",
        mode: "block",
        body: expect.stringContaining(input.operations[0].outcome),
      })
      if (!inline.body) return yield* Effect.die("Expected Goal semantic result body")
      const final = entryBody({
        kind: "tool",
        text: "",
        phase: "final",
        source: "tool",
        tool: part.tool,
        toolState: "completed",
        part: projected,
      } satisfies StreamCommit)
      expect(final).toEqual({ type: "text", content: inline.body })
      expect(JSON.stringify(final)).not.toContain(" completed")
      expect(JSON.stringify(final)).not.toContain('"receiptID"')
      expect((yield* database.db.transaction((tx) => LearnerGoal.discover(tx, Date.now()))).items).toMatchObject([
        { head: { schemaVersion: 2, outcome: input.operations[0].outcome, disposition: { type: "active" } } },
      ])
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
