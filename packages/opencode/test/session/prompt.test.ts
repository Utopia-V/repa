import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { eq, sql } from "drizzle-orm"
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
import {
  SessionHistoricalMessagePresentationTable,
  SessionHistoricalPartPresentationTable,
  SessionMessageTable,
  SessionTable,
} from "@opencode-ai/core/session/sql"
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
import { admitModelWithLearningContext } from "../fixture/model-admission"
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
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { FutureAttention } from "@opencode-ai/core/future-attention"
import { Assignment } from "@opencode-ai/core/assignment"
import { LearnerStateJudgment } from "@opencode-ai/core/learner-state-judgment"
import { AdvisoryPlanSuggestion } from "@opencode-ai/core/advisory-plan-suggestion"
import { AdmittedLearnerOccurrenceTable } from "@opencode-ai/core/learning-command/occurrence.sql"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import {
  TurnInputTable,
  TurnModelOperationTable,
  TurnTable,
  TurnUnavailableSourceTable,
} from "@opencode-ai/core/turn/sql"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { Turn } from "@opencode-ai/schema/turn"
import { Project } from "@opencode-ai/schema/project"
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

function providerText(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(providerText)
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(providerText)
  return []
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
const compactionProcessHooks: Array<
  (input: Parameters<SessionCompaction.Interface["process"]>[0]) => Effect.Effect<"continue" | "stop">
> = []
const summaryHooks: Array<() => Effect.Effect<void>> = []

const hookedCompaction = Layer.succeed(
  SessionCompaction.Service,
  SessionCompaction.Service.of({
    isOverflow: () => Effect.succeed(false),
    prune: () => compactionPruneHooks.shift()?.() ?? Effect.void,
    compactable: () => Effect.succeed({ messages: [] }),
    process: (input) => compactionProcessHooks.shift()?.(input) ?? Effect.succeed("stop"),
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
  ContentRoot.node,
  Course.node,
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
const forkCompactionBoundary = testEffect(
  LayerNode.compile(LayerNode.group([promptRoot, testLLMServerNode]), [
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
const isolatedDatabaseBoundary = testEffect(
  LayerNode.compile(LayerNode.group([promptRoot, testLLMServerNode]), [
    [SessionSummary.node, summary],
    [LSP.node, lsp],
    [MCP.node, makeMcp()],
    [RuntimeFlags.node, runtimeFlags],
    [Database.node, Database.layerFromPath(":memory:").pipe(Layer.orDie)],
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
          // This shared provider is a transport fixture, not a capacity-boundary oracle.
          // Keep it comfortably above the complete released-v1 tool surface; focused
          // capacity tests own the smaller-limit behavior.
          limit: { context: 300000, output: 10000 },
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

function exactCurrentProviderCfg(url: string) {
  return {
    ...providerCfg(url),
    agent: {
      prior_agent: { description: "Prior transcript agent" },
      current_agent: { description: "Exact current root agent" },
      root_agent: { description: "Initial Turn agent" },
      steer_agent: { description: "Exact promoted-steer agent" },
    },
  }
}

function providerMessageOrder(input: Record<string, unknown>, texts: string[]) {
  const messages = input.messages
  expect(Array.isArray(messages)).toBe(true)
  if (!Array.isArray(messages)) throw new Error("Expected provider request messages")
  return {
    messages,
    indexes: texts.map((text) => messages.findIndex((message) => JSON.stringify(message).includes(text))),
  }
}

function expectProviderSequence(input: Record<string, unknown>, texts: string[]) {
  const order = providerMessageOrder(input, texts)
  expect(order.indexes.every((index) => index >= 0)).toBe(true)
  expect(order.indexes).toEqual(order.indexes.map((_, index) => order.indexes[0]! + index))
  return order
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

forkCompactionBoundary.instance(
  "keeps a real parent capacity-history marker inert while the fork admits and runs only its new input",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const source = yield* materializeTestSession({
        title: "parent with interrupted capacity compaction",
        text: "CURRENT-D",
        settle: false,
        limits: { model: 1, tool: 0 },
        time: 4_000,
      })
      const historicalTurn = (input: { label: string; text: string; time: number }) =>
        Effect.gen(function* () {
          const user = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID: source.info.id,
            agent: "repa",
            model: ref,
            time: { created: input.time },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            messageID: user.id,
            sessionID: source.info.id,
            type: "text",
            text: input.text,
          })
          const assistant: SessionV1.Assistant = {
            id: MessageID.ascending(),
            role: "assistant",
            parentID: user.id,
            sessionID: source.info.id,
            mode: "repa",
            agent: "repa",
            path: { cwd: path.resolve(dir), root: path.resolve(dir) },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: ref.modelID,
            providerID: ref.providerID,
            time: { created: input.time + 1 },
            finish: "end_turn",
          }
          yield* sessions.updateMessage(assistant)
          yield* sessions.updatePart({
            id: PartID.ascending(),
            messageID: assistant.id,
            sessionID: source.info.id,
            type: "text",
            text: `${input.label}-REPLY`,
          })
          return { user, assistant }
        })
      const a = yield* historicalTurn({ label: "REMOVE-A", text: "REMOVE-A", time: 1_000 })
      const b = yield* historicalTurn({ label: "REMOVE-B", text: "REMOVE-B", time: 2_000 })
      const c = yield* historicalTurn({ label: "KEEP-C", text: "KEEP-C", time: 3_000 })
      const sourceAssistant: SessionV1.Assistant = {
        id: MessageID.ascending(),
        role: "assistant",
        parentID: source.user.id,
        sessionID: source.info.id,
        mode: "repa",
        agent: "repa",
        path: { cwd: path.resolve(dir), root: path.resolve(dir) },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: 4_001 },
      }
      yield* sessions.updateMessage(sourceAssistant)

      const capabilityBasis = LearningContext.unavailableCapabilityBasis()
      const admitted = yield* database.db.transaction((tx) =>
        Effect.gen(function* () {
          const snapshotFrontier = yield* LearningFrontier.read(tx)
          return yield* admitModelWithLearningContext(tx, {
            turnID: source.turn.id,
            sessionID: source.info.id,
            assistantMessageID: sourceAssistant.id,
            requestEnvelope: { purpose: "fork-capacity-history-source" },
            contextFingerprint: TurnLifecycle.envelopeFingerprint({ test: "fork-capacity-history-source" }),
            snapshotFrontier,
            timeAdmitted: 4_001,
            learningContextBasis: capabilityBasis,
          })
        }),
      )
      if (admitted.type !== "admitted") return yield* Effect.die("Expected source model admission")

      const removableMessageIDs = [a.user.id, a.assistant.id, b.user.id, b.assistant.id]
      const removableMessageIDsFingerprint = LearningContext.canonicalFingerprint(
        LearningContext.toJsonValue(removableMessageIDs),
      )
      const capacity = LearningContext.prepareCapacity({
        assistantMessageID: sourceAssistant.id,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint({ test: "fork-capacity-envelope" }),
        retainedSteeringFingerprint: admitted.retainedSteeringCut.fingerprint,
        learningContextFingerprint: admitted.learningContextCut.fingerprint,
        learningContextRenderedFingerprint: admitted.learningContextCut.renderedFingerprint,
        providerToolSurfaceFingerprint: capabilityBasis.effectiveProviderToolSurfaceBinding.combinedFingerprint,
        providerToolSurfaceCanonicalBytes: capabilityBasis.effectiveProviderToolSurfaceBinding.combinedCanonicalBytes,
        fixedEstimatedTokens: 200,
        removableEstimatedTokens: 200,
        removableHistory: {
          tailStartMessageID: c.user.id,
          messageCount: removableMessageIDs.length,
          messageIDsFingerprint: removableMessageIDsFingerprint,
        },
        inputLimitTokens: 300,
      })
      expect(capacity.assessment.decision).toBe("history_overflow")
      yield* database.db.transaction((tx) => LearningContext.commitCapacity(tx, capacity))

      const marker = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: source.info.id,
        agent: "repa",
        model: ref,
        time: { created: 5_000 },
      })
      const markerPart = yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: marker.id,
        sessionID: source.info.id,
        type: "compaction",
        auto: true,
        tail_start_id: c.user.id,
        capacity_history: {
          source_assistant_message_id: sourceAssistant.id,
          removable_message_count: removableMessageIDs.length,
          removable_message_ids_fingerprint: removableMessageIDsFingerprint,
        },
      })
      yield* database.db.transaction((tx) =>
        TurnLifecycle.settle(tx, {
          turnID: source.turn.id,
          outcome: "interrupted",
          reason: "learner_interrupt",
          time: 5_001,
        }),
      )
      expect(
        yield* database.db.transaction((tx) => LearningContext.readCapacity(tx, sourceAssistant.id)),
      ).toMatchObject({ type: "available", assessment: { decision: "history_overflow" } })

      const sourceFrontier = yield* database.db
        .select({ sequence: EventSequenceTable.seq })
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, source.info.id))
        .get()
        .pipe(Effect.orDie)
      if (!sourceFrontier) return yield* Effect.die("Expected exact source Session frontier")

      const routedCompactions: Parameters<SessionCompaction.Interface["process"]>[0][] = []
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          compactionProcessHooks.length = 0
        }),
      )
      compactionProcessHooks.push((input) =>
        Effect.sync(() => {
          routedCompactions.push(input)
          return "stop" as const
        }),
      )
      yield* llm.text("fork-local response")
      const targetSessionID = SessionID.create()
      const targetTurnID = Turn.ID.create()
      const targetMessageID = MessageID.ascending()
      const targetText = "FORK-LOCAL-INPUT-UNIQUE"
      yield* prompt.start({
        sessionID: targetSessionID,
        turnID: targetTurnID,
        inputID: Turn.InputID.create(),
        messageID: targetMessageID,
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "fork-local capacity assessment" },
        fork: { sourceSessionID: source.info.id, sourceEventSequence: sourceFrontier.sequence },
        parts: [{ type: "text", text: targetText }],
      })
      const targetTerminal = yield* prompt.awaitTurn(targetSessionID, targetTurnID)
      expect(targetTerminal.terminal).toMatchObject({
        outcome: "completed",
        reason: "normal",
      })
      expect(routedCompactions).toEqual([])
      expect(yield* llm.calls).toBe(1)
      const providerPayload = JSON.stringify((yield* llm.inputs)[0])
      expect(providerPayload.split(targetText)).toHaveLength(2)

      const stored = yield* sessions.messages({ sessionID: targetSessionID })
      expect(
        stored.flatMap((message) => message.parts).filter((part) => part.type === "text" && part.text === targetText),
      ).toHaveLength(1)
      const clonedMarker = stored
        .flatMap((message) => message.parts)
        .find((part): part is SessionV1.CompactionPart => part.type === "compaction")
      expect(clonedMarker).toBeDefined()
      if (!clonedMarker) return yield* Effect.die("Expected cloned historical compaction marker")
      expect(clonedMarker.capacity_history).toBeUndefined()
      const historicalParts = yield* database.db
        .select({ partID: SessionHistoricalPartPresentationTable.part_id })
        .from(SessionHistoricalPartPresentationTable)
        .where(eq(SessionHistoricalPartPresentationTable.session_id, targetSessionID))
        .all()
        .pipe(Effect.orDie)
      expect(historicalParts.map((row) => row.partID)).toContain(clonedMarker.id)
      expect(historicalParts.map((row) => row.partID)).not.toContain(markerPart.id)
      const projected = yield* MessageV2.filterCompactedEffect(targetSessionID)
      expect(projected.flatMap((message) => message.parts).some((part) => part.id === clonedMarker.id)).toBe(false)
      expect(MessageV2.latest(projected).tasks).toEqual([])

      const operations = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, targetTurnID))
        .all()
        .pipe(Effect.orDie)
      expect(operations).toHaveLength(1)
      expect(
        yield* database.db.transaction((tx) => LearningContext.readCapacity(tx, operations[0]!.assistantMessageID)),
      ).toMatchObject({ type: "available", assessment: { decision: "fit" } })
      const historicalMessages = yield* database.db
        .select({
          messageID: SessionHistoricalMessagePresentationTable.message_id,
          sourceMessageID: SessionHistoricalMessagePresentationTable.source_message_id,
        })
        .from(SessionHistoricalMessagePresentationTable)
        .where(eq(SessionHistoricalMessagePresentationTable.session_id, targetSessionID))
        .all()
        .pipe(Effect.orDie)
      const clonedSourceAssistant = historicalMessages.find(
        (row) => row.sourceMessageID === sourceAssistant.id,
      )?.messageID
      expect(clonedSourceAssistant).toBeDefined()
      if (!clonedSourceAssistant) return yield* Effect.die("Expected cloned source Assistant provenance")
      expect(yield* database.db.transaction((tx) => LearningContext.readCapacity(tx, clonedSourceAssistant))).toEqual({
        type: "not_found",
        assistantMessageID: clonedSourceAssistant,
      })

      yield* sessions.remove(targetSessionID)
      yield* sessions.remove(source.info.id)
    }),
  { timeout: 30_000 },
)

forkCompactionBoundary.instance(
  "keeps equal-time fork history context-only while the exact new root owns execution",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      // Freeze the supported transition at the current causal floor. A fixed
      // future date would leak into the shared test database's monotonic event
      // clock even after Bun's wall clock is restored.
      const instant = Date.now()
      setSystemTime(new Date(instant))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          setSystemTime()
        }),
      )

      const sourceText = "EQUAL-TIME-HISTORICAL-CONTEXT"
      const source = yield* materializeTestSession({
        title: "equal-time fork source",
        agent: "historical-agent",
        model: ref,
        text: sourceText,
        time: instant,
      })
      const sourceAssistant: SessionV1.Assistant = {
        id: MessageID.ascending(),
        role: "assistant",
        parentID: source.user.id,
        sessionID: source.info.id,
        mode: "historical-agent",
        agent: "historical-agent",
        path: { cwd: path.resolve(dir), root: path.resolve(dir) },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: instant, completed: instant },
        finish: "stop",
      }
      yield* sessions.updateMessage(sourceAssistant)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: sourceAssistant.id,
        sessionID: source.info.id,
        type: "text",
        text: "historical answer remains visible only as transcript context",
      })
      const sourceFrontier = yield* database.db
        .select({ sequence: EventSequenceTable.seq })
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, source.info.id))
        .get()
        .pipe(Effect.orDie)
      if (!sourceFrontier) return yield* Effect.die("Expected exact source Session frontier")

      yield* llm.text("fork root response")
      const targetSessionID = SessionID.create()
      const targetTurnID = Turn.ID.create()
      const targetMessageID = MessageID.ascending()
      const targetText = "EQUAL-TIME-NEW-FORK-ROOT"
      yield* prompt.start({
        sessionID: targetSessionID,
        turnID: targetTurnID,
        inputID: Turn.InputID.create(),
        messageID: targetMessageID,
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "equal-time fork target" },
        fork: { sourceSessionID: source.info.id, sourceEventSequence: sourceFrontier.sequence },
        parts: [{ type: "text", text: targetText }],
      })
      const terminal = yield* prompt.awaitTurn(targetSessionID, targetTurnID)
      expect(terminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })
      expect(yield* llm.calls).toBe(1)
      const providerPayload = JSON.stringify((yield* llm.inputs)[0])
      expect(providerPayload.split(targetText)).toHaveLength(2)
      expect(providerPayload).toContain(sourceText)

      const historical = new Set(
        (yield* database.db
          .select({ messageID: SessionHistoricalMessagePresentationTable.message_id })
          .from(SessionHistoricalMessagePresentationTable)
          .where(eq(SessionHistoricalMessagePresentationTable.session_id, targetSessionID))
          .all()
          .pipe(Effect.orDie)).map((row) => row.messageID),
      )
      const stored = yield* sessions.messages({ sessionID: targetSessionID })
      const assistant = stored.find(
        (message): message is SessionV1.WithParts & { info: SessionV1.Assistant } =>
          message.info.role === "assistant" && !historical.has(message.info.id),
      )?.info
      expect(assistant).toMatchObject({
        parentID: targetMessageID,
        agent: "repa",
        providerID: ref.providerID,
        modelID: ref.modelID,
        finish: "stop",
      })
      expect(stored.filter((message) => historical.has(message.info.id))).toHaveLength(2)

      yield* sessions.remove(targetSessionID)
      yield* sessions.remove(source.info.id)
    }),
  { timeout: 30_000 },
)

it.instance(
  "executes an exact same-time resumed root despite lexicographically later prior transcript messages",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(exactCurrentProviderCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const instant = Date.now()
      setSystemTime(new Date(instant))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          setSystemTime()
        }),
      )

      const seeded = yield* materializeTestSession({
        title: "same-time resumed Session",
        agent: "prior_agent",
        model: ref,
        text: "LOW-ID-OLDER-SESSION-CONTEXT",
        time: instant,
      })
      const priorUserID = MessageID.make("msg_z_prior_user")
      const priorAssistantID = MessageID.make("msg_zz_prior_assistant")
      yield* sessions.updateMessage({
        id: priorUserID,
        role: "user",
        sessionID: seeded.info.id,
        agent: "prior_agent",
        model: ref,
        time: { created: instant },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: priorUserID,
        sessionID: seeded.info.id,
        type: "text",
        text: "SAME-TIME-PRIOR-USER-CONTEXT",
      })
      yield* sessions.updateMessage({
        id: priorAssistantID,
        role: "assistant",
        parentID: priorUserID,
        sessionID: seeded.info.id,
        mode: "prior_agent",
        agent: "prior_agent",
        path: { cwd: path.resolve(dir), root: path.resolve(dir) },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: instant, completed: instant },
        finish: "stop",
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: priorAssistantID,
        sessionID: seeded.info.id,
        type: "text",
        text: "SAME-TIME-PRIOR-ASSISTANT-CONTEXT",
      })

      const turnID = Turn.ID.create()
      const inputID = Turn.InputID.create()
      const currentMessageID = MessageID.make("msg_a_exact_current_input")
      const currentText = "SAME-TIME-EXACT-RESUMED-ROOT"
      yield* llm.text("exact resumed-root response")
      yield* prompt.start({
        sessionID: seeded.info.id,
        turnID,
        inputID,
        messageID: currentMessageID,
        agent: "current_agent",
        model: ref,
        limits: { model: 1, tool: 0 },
        parts: [{ type: "text", text: currentText }],
      })
      const terminal = yield* prompt.awaitTurn(seeded.info.id, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })
      expect(yield* llm.calls).toBe(1)
      const providerInput = (yield* llm.inputs)[0]!
      const providerPayload = JSON.stringify(providerInput)
      expect(providerPayload.split(currentText)).toHaveLength(2)
      expect(providerPayload).toContain("SAME-TIME-PRIOR-USER-CONTEXT")
      expect(providerPayload).toContain("SAME-TIME-PRIOR-ASSISTANT-CONTEXT")
      const providerOrder = expectProviderSequence(providerInput, [
        "SAME-TIME-PRIOR-USER-CONTEXT",
        "SAME-TIME-PRIOR-ASSISTANT-CONTEXT",
        currentText,
      ])
      expect(providerOrder.indexes[2]).toBe(providerOrder.messages.length - 1)

      const operation = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, turnID))
        .get()
        .pipe(Effect.orDie)
      expect(operation).toBeDefined()
      if (!operation) return yield* Effect.die("Expected exact resumed-root model operation")
      const assistant = yield* MessageV2.get({
        sessionID: seeded.info.id,
        messageID: operation.assistantMessageID,
      })
      expect(assistant.info).toMatchObject({
        role: "assistant",
        parentID: currentMessageID,
        agent: "current_agent",
        providerID: ref.providerID,
        modelID: ref.modelID,
        finish: "stop",
      })

      yield* sessions.remove(seeded.info.id)
    }),
  { config: cfg, timeout: 30_000 },
)

it.instance(
  "binds a lexicographically lower same-time promoted steer as the exact executable input",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(exactCurrentProviderCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const instant = Date.now()
      setSystemTime(new Date(instant))
      const releaseRoot = yield* Deferred.make<void>()
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(releaseRoot, undefined).pipe(
          Effect.andThen(
            Effect.sync(() => {
              setSystemTime()
            }),
          ),
          Effect.asVoid,
        ),
      )

      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const rootInputID = Turn.InputID.create()
      const steerInputID = Turn.InputID.create()
      const rootMessageID = MessageID.make("msg_z_same_time_root")
      const steerMessageID = MessageID.make("msg_a_same_time_exact_steer")
      const rootText = "SAME-TIME-ROOT-BEFORE-STEER"
      const steerText = "SAME-TIME-LEXICOGRAPHICALLY-LOWER-STEER"
      yield* llm.hold("root response", deferredAsPromise(releaseRoot))
      yield* llm.text("exact steer response")

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: rootInputID,
        messageID: rootMessageID,
        agent: "root_agent",
        model: ref,
        limits: { model: 2, tool: 0 },
        session: { title: "same-time promoted steer" },
        parts: [{ type: "text", text: rootText }],
      })
      yield* awaitWithTimeout(llm.wait(1), "root provider request did not begin before steer", "5 seconds")

      const steer = yield* prompt
        .steer({
          sessionID,
          expectedTurnID: turnID,
          inputID: steerInputID,
          messageID: steerMessageID,
          agent: "steer_agent",
          model: ref,
          parts: [{ type: "text", text: steerText }],
        })
        .pipe(Effect.forkChild)
      // The steer fiber has no public queue-state projection. Yielding here lets
      // its synchronous admission path reach the owner queue while the root
      // provider remains causally blocked; the assertions below fail if it did
      // not queue and promote through the ordinary path.
      yield* Effect.yieldNow
      yield* Deferred.succeed(releaseRoot, undefined)
      expect((yield* Fiber.join(steer)).id).toBe(steerInputID)
      yield* awaitWithTimeout(llm.wait(2), "promoted steer did not own a second provider request", "5 seconds")
      const terminal = yield* prompt.awaitTurn(sessionID, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })
      expect(yield* llm.calls).toBe(2)
      const secondInput = (yield* llm.inputs)[1]!
      const secondPayload = JSON.stringify(secondInput)
      expect(secondPayload.split(steerText)).toHaveLength(2)
      expect(secondPayload).toContain(rootText)
      const providerOrder = expectProviderSequence(secondInput, [rootText, "root response", steerText])
      expect(providerOrder.indexes[2]).toBe(providerOrder.messages.length - 1)

      const operations = yield* database.db
        .select({
          inputID: TurnModelOperationTable.input_id,
          assistantMessageID: TurnModelOperationTable.assistant_message_id,
        })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, turnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      expect(operations.map((operation) => operation.inputID)).toEqual([rootInputID, steerInputID])
      const steerAssistant = yield* MessageV2.get({
        sessionID,
        messageID: operations[1]!.assistantMessageID,
      })
      expect(steerAssistant.info).toMatchObject({
        role: "assistant",
        parentID: steerMessageID,
        agent: "steer_agent",
        providerID: ref.providerID,
        modelID: ref.modelID,
        finish: "stop",
      })

      yield* sessions.remove(sessionID)
    }),
  { config: cfg, timeout: 30_000 },
)

it.instance(
  "reanchors an exact same-time current input after completed compaction cuts the legacy transcript",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(exactCurrentProviderCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const instant = Date.now()
      setSystemTime(new Date(instant))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          setSystemTime()
        }),
      )

      const seeded = yield* materializeTestSession({
        title: "same-time completed compaction boundary",
        agent: "prior_agent",
        model: ref,
        text: "OLDER-PRE-COMPACTION-CONTEXT",
        time: instant - 1,
      })
      const retainedUserID = MessageID.make("msg_z_retained_tail_user")
      const retainedAssistantID = MessageID.make("msg_zx_retained_tail_assistant")
      const markerID = MessageID.make("msg_zz_compaction_marker")
      const summaryID = MessageID.make("msg_zzz_compaction_summary")
      yield* sessions.updateMessage({
        id: retainedUserID,
        role: "user",
        sessionID: seeded.info.id,
        agent: "prior_agent",
        model: ref,
        time: { created: instant },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: retainedUserID,
        sessionID: seeded.info.id,
        type: "text",
        text: "SAME-TIME-RETAINED-TAIL-USER",
      })
      yield* sessions.updateMessage({
        id: retainedAssistantID,
        role: "assistant",
        parentID: retainedUserID,
        sessionID: seeded.info.id,
        mode: "prior_agent",
        agent: "prior_agent",
        path: { cwd: path.resolve(dir), root: path.resolve(dir) },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: instant, completed: instant },
        finish: "stop",
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: retainedAssistantID,
        sessionID: seeded.info.id,
        type: "text",
        text: "SAME-TIME-RETAINED-TAIL-ASSISTANT",
      })
      yield* sessions.updateMessage({
        id: markerID,
        role: "user",
        sessionID: seeded.info.id,
        agent: "prior_agent",
        model: ref,
        time: { created: instant },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: markerID,
        sessionID: seeded.info.id,
        type: "compaction",
        auto: true,
        tail_start_id: retainedUserID,
      })
      yield* sessions.updateMessage({
        id: summaryID,
        role: "assistant",
        parentID: markerID,
        sessionID: seeded.info.id,
        mode: "compaction",
        agent: "compaction",
        path: { cwd: path.resolve(dir), root: path.resolve(dir) },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: instant, completed: instant },
        summary: true,
        finish: "stop",
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: summaryID,
        sessionID: seeded.info.id,
        type: "text",
        text: "SAME-TIME-COMPLETED-SUMMARY",
      })

      const turnID = Turn.ID.create()
      const currentMessageID = MessageID.make("msg_a_exact_post_compaction_input")
      const currentText = "SAME-TIME-EXACT-POST-COMPACTION-INPUT"
      yield* llm.text("post-compaction exact response")
      yield* prompt.start({
        sessionID: seeded.info.id,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: currentMessageID,
        agent: "current_agent",
        model: ref,
        limits: { model: 1, tool: 0 },
        parts: [{ type: "text", text: currentText }],
      })
      const terminal = yield* prompt.awaitTurn(seeded.info.id, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })

      const compacted = yield* MessageV2.filterCompactedEffect(seeded.info.id)
      expect(compacted.some((message) => message.info.id === currentMessageID)).toBe(false)
      const providerInput = (yield* llm.inputs)[0]!
      const providerOrder = expectProviderSequence(providerInput, [
        "SAME-TIME-COMPLETED-SUMMARY",
        "SAME-TIME-RETAINED-TAIL-USER",
        "SAME-TIME-RETAINED-TAIL-ASSISTANT",
        currentText,
      ])
      expect(providerOrder.indexes[3]).toBe(providerOrder.messages.length - 1)

      yield* sessions.remove(seeded.info.id)
    }),
  { config: cfg, timeout: 30_000 },
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

isolatedDatabaseBoundary.instance(
  "carries frozen source time through midnight and host-timezone changes for root and promoted steer requests",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      yield* database.db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make(dir), sandboxes: [] })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
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
      yield* awaitWithTimeout(
        llm.wait(1),
        "root provider request was not dispatched after exact context compilation",
        "5 seconds",
      )

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
      yield* awaitWithTimeout(
        llm.wait(2),
        "promoted-steer provider request was not dispatched after exact context compilation",
        "5 seconds",
      )
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
      const learningCuts = yield* Effect.forEach(operations, (operation) =>
        database.db.transaction((tx) => LearningContext.readCut(tx, operation.assistantMessageID)),
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
      expect(learningCuts).toMatchObject([
        { type: "available", cut: { operation: { inputID: expect.any(String) }, cutAsOf: rootOperationTime } },
        { type: "available", cut: { operation: { inputID: steerInputID }, cutAsOf: steerOperationTime } },
      ])
      if (learningCuts[0]?.type !== "available" || learningCuts[1]?.type !== "available") {
        return yield* Effect.die("Expected both exact Gate 18 cuts")
      }
      expect(learningCuts[0].cut.fingerprint).not.toBe(learningCuts[1].cut.fingerprint)
      const hits = yield* llm.hits
      expect(hits).toHaveLength(2)
      const rootPayload = JSON.stringify(hits[0]?.body)
      const steerPayload = JSON.stringify(hits[1]?.body)
      expect(rootPayload).toContain(JSON.stringify(RetainedSteering.renderCut(cuts[0].cut)).slice(1, -1))
      expect(steerPayload).toContain(JSON.stringify(RetainedSteering.renderCut(cuts[1].cut)).slice(1, -1))
      expect(rootPayload).toContain(JSON.stringify(learningCuts[0].renderedBlock).slice(1, -1))
      expect(steerPayload).toContain(JSON.stringify(learningCuts[1].renderedBlock).slice(1, -1))
      expect(rootPayload.split("[Repa retained learner steering — protected]")).toHaveLength(2)
      expect(steerPayload.split("[Repa retained learner steering — protected]")).toHaveLength(2)
      expect(rootPayload.split("[Repa learning context — protected]")).toHaveLength(2)
      expect(steerPayload.split("[Repa learning context — protected]")).toHaveLength(2)
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
  "rejects an AI SDK unbound tool before any fallback execution",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      yield* llm.tool("not_offered", {})

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "program invalid fallback",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "Call only a tool that was actually offered." }],
      })

      const terminal = yield* prompt.awaitTurn(sessionID, turnID)
      const messages = yield* MessageV2.filterCompactedEffect(sessionID)
      const calls = messages
        .flatMap((message) => message.parts)
        .filter((part): part is SessionV1.ToolPart => part.type === "tool")
      const assistant = messages.find(
        (message): message is SessionV1.WithParts & { info: SessionV1.Assistant } => message.info.role === "assistant",
      )
      expect(terminal.terminal).toMatchObject({
        outcome: "failed",
        reason: "provider_failure",
        counters: { model: 1, tool: 0 },
      })
      expect(calls).toEqual([])
      expect(assistant?.info.error).toMatchObject({
        name: "UnknownError",
        data: { message: "Provider tool name is outside the frozen projection: not_offered" },
      })
      expect(yield* llm.calls).toBe(1)
    }),
  { config: cfg },
  30_000,
)

it.instance(
  "rejects a provider-origin invalid call before creating a tool candidate",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      yield* llm.tool("invalid", { tool: "read", error: "provider-forged fallback" })

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "provider fallback provenance",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "Do not accept an unoffered fallback identity." }],
      })

      const terminal = yield* prompt.awaitTurn(sessionID, turnID)
      const messages = yield* MessageV2.filterCompactedEffect(sessionID)
      expect(terminal.terminal).toMatchObject({
        outcome: "failed",
        reason: "provider_failure",
        counters: { model: 1, tool: 0 },
      })
      expect(messages.flatMap((message) => message.parts).filter((part) => part.type === "tool")).toEqual([])
      expect(JSON.stringify(messages)).toContain("Provider tool name is outside the prepared provider surface: invalid")
      const hits = yield* llm.hits
      expect(hits).toHaveLength(1)
      expect(JSON.stringify(hits[0]?.body.tools)).not.toContain('"name":"invalid"')
    }),
  { config: cfg },
  30_000,
)

it.instance(
  "executes one inert invalid fallback only for malformed arguments to an offered AI SDK tool",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      yield* llm.push(reply().toolInput("read", "{").item())
      yield* llm.text("Recovered after the inert repair.")

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "offered tool argument repair",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "Read one file if the arguments are valid." }],
      })

      const terminal = yield* prompt.awaitTurn(sessionID, turnID)
      const parts = (yield* MessageV2.filterCompactedEffect(sessionID)).flatMap((message) => message.parts)
      const repaired = parts.filter(
        (part): part is SessionV1.ToolPart => part.type === "tool" && part.tool === "invalid",
      )
      expect(repaired).toHaveLength(1)
      expect(terminal.terminal).toMatchObject({
        outcome: "completed",
        reason: "normal",
        counters: { model: 2, tool: 1 },
      })
      expect(repaired[0]?.state).toMatchObject({
        status: "completed",
        input: { tool: "read", error: expect.any(String) },
        title: "Invalid Tool",
      })
      expect(JSON.stringify(parts)).toContain("Recovered after the inert repair.")
      const hits = yield* llm.hits
      expect(hits).toHaveLength(2)
      hits.forEach((hit) => expect(JSON.stringify(hit.body.tools)).not.toContain('"name":"invalid"'))
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
  "FIFO steers bind distinct model operations and retry across a Session-deletion frontier without over-promotion",
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

      // Session deletion can change Gate 19 source availability. It must therefore
      // invalidate this already-started context build through the same shared seal.
      yield* sessions.remove(otherSession.info.id)
      const advancedFrontier = yield* database.db
        .transaction((tx) => LearningFrontier.read(tx))
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
    }),
  { config: cfg },
  30_000,
)

projectOriginIt(
  "joins stored deleted learner evidence through SessionPrompt into provider requests and recomputes after correction",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const roots = yield* ContentRoot.Service
      const criterion = "A semaphore bounds simultaneous entrants to its protected region."
      const sourcePath = path.join(dir, "gate19-semaphore.txt")
      yield* Effect.promise(() => Bun.write(sourcePath, `${criterion}\n`))
      const rootProposal = yield* roots.propose(dir)
      const contentRoot = yield* roots.approve({
        proposal: rootProposal,
        approval: ContentRoot.LearnerApproval.contentRoot(rootProposal, "Gate 19 prompt trace"),
      })
      const bootstrapInput = {
        course: { type: "new", title: "Semaphore concurrency" },
        route: {
          type: "new_view",
          key: "route",
          name: "Concurrency evidence",
          authorship: "learner_requested",
          revision: { items: [{ key: "criterion", title: "Explain the semaphore concurrency bound" }] },
        },
        selection: { type: "set", target: { type: "route" } },
        materials: [
          {
            type: "local",
            key: "source",
            path: sourcePath,
            authority: { type: "content_root", contentRootID: contentRoot.id },
          },
        ],
        maps: [
          {
            key: "map",
            materialKey: "source",
            authorship: "learner_requested",
            outline: [
              {
                key: "criterion",
                title: "Exact semaphore proposition",
                selectors: [
                  {
                    key: "exact",
                    coordinate: {
                      kind: "artifact_byte_range.v1",
                      startByte: 0,
                      endByte: new TextEncoder().encode(criterion).byteLength,
                    },
                  },
                ],
              },
            ],
          },
        ],
        alignments: [
          {
            key: "exact_alignment",
            mapKey: "map",
            selectorKey: "exact",
            authorship: "learner_requested",
            course: { type: "route_item", itemKey: "criterion" },
            reason: "Neutral provenance for the exact selector and Course membership",
          },
        ],
        anchor: { type: "set", target: { type: "route_item", itemKey: "criterion" } },
      } as const
      const sourceSessionID = SessionID.create()
      const conditionTurnID = Turn.ID.create()
      yield* llm.tool(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, bootstrapInput)
      yield* llm.text("State the exact proposition before I reveal whether your formulation matches it.")
      yield* prompt.start({
        sessionID: sourceSessionID,
        turnID: conditionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 2 },
        session: {
          title: "Gate 19 source Session",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "Create the exact source route, then elicit my response." }],
      })
      const conditionTerminal = (yield* prompt.awaitTurn(sourceSessionID, conditionTurnID)).terminal
      expect(conditionTerminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      const conditionOperations = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, conditionTurnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      expect(conditionOperations).toHaveLength(2)
      const conditionAssistantMessageID = conditionOperations[1]?.assistantMessageID
      if (!conditionAssistantMessageID) return yield* Effect.die("Missing exact Gate 19 condition operation")

      type TargetRow = {
        alignmentID: MaterialMap.AlignmentID
        mapID: MaterialMap.MapID
        selectorID: MaterialMap.SelectorID
        courseID: Course.CourseID
        viewID: Course.ViewID
        revisionID: Course.RevisionID
        itemID: Course.ItemID
      }
      const target = yield* database.db.get<TargetRow>(sql`
        SELECT alignment.id AS alignmentID, alignment.map_id AS mapID,
               alignment.selector_id AS selectorID, alignment.course_id AS courseID,
               alignment.view_id AS viewID, alignment.revision_id AS revisionID,
               alignment.item_id AS itemID
        FROM material_course_alignment AS alignment
        JOIN material_selector AS selector
          ON selector.map_id = alignment.map_id AND selector.id = alignment.selector_id
        WHERE selector.kind = 'artifact_byte_range.v1'
      `)
      if (!target) return yield* Effect.die("Missing exact Gate 19 target")

      const responseTurnID = Turn.ID.create()
      const responseText = "A semaphore limits how many tasks enter the protected region simultaneously."
      const createInput = {
        operation: "create",
        relation: "supports",
        exposure: "learner_response_before_tutor_disclosure",
        conditionAssistantMessageID,
        target: {
          mapID: target.mapID,
          selectorID: target.selectorID,
          courseID: target.courseID,
          viewID: target.viewID,
          revisionID: target.revisionID,
          itemID: target.itemID,
        },
        alignmentID: target.alignmentID,
      } as const
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY, createInput)
      yield* llm.error(400, { error: { message: "post-commit Gate 19 provider failure" } })
      yield* prompt.start({
        sessionID: sourceSessionID,
        turnID: responseTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 2 },
        parts: [{ type: "text", text: responseText }],
      })
      expect((yield* prompt.awaitTurn(sourceSessionID, responseTurnID)).terminal).toMatchObject({
        outcome: "failed",
        reason: "provider_failure",
        counters: { model: 2, tool: 1 },
      })
      const committedEvidencePart = (yield* sessions.messages({ sessionID: sourceSessionID }))
        .flatMap((message) => message.parts)
        .find(
          (part): part is SessionV1.ToolPart =>
            part.type === "tool" && part.tool === LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
        )
      expect(committedEvidencePart?.state).toMatchObject({
        status: "completed",
        metadata: { outcome: "applied", semanticPresentationRequired: true },
      })
      const stored = yield* database.db.get<{ recordID: LearnerResponseEvidence.RecordID; version: number }>(sql`
        SELECT id AS recordID, current_version AS version FROM learner_response_evidence_record
      `)
      if (!stored) return yield* Effect.die("Gate 19 prompt trace did not persist one record")
      expect(stored.version).toBe(0)
      expect(
        yield* database.db.transaction((tx) =>
          LearningContext.listLearnerResponseEvidenceRequirements(tx, { cutAsOf: Date.now() }),
        ),
      ).toEqual([])

      const beforeDeletion = yield* database.db.transaction((tx) => LearningFrontier.read(tx))
      yield* sessions.remove(sourceSessionID)
      const afterDeletion = yield* database.db.transaction((tx) => LearningFrontier.read(tx))
      expect(afterDeletion.sequence).toBe(beforeDeletion.sequence + 1)
      expect(
        yield* database.db.transaction((tx) =>
          LearningContext.listLearnerResponseEvidenceRequirements(tx, { cutAsOf: Date.now() }),
        ),
      ).toEqual([{ mapID: target.mapID, selectorID: target.selectorID }])
      expect(
        yield* database.db.get<{ messages: number; parts: number }>(sql`
          SELECT (SELECT count(*) FROM message WHERE session_id = ${sourceSessionID}) AS messages,
                 (SELECT count(*) FROM part WHERE session_id = ${sourceSessionID}) AS parts
        `),
      ).toEqual({ messages: 0, parts: 0 })

      const laterSessionID = SessionID.create()
      const laterTurnID = Turn.ID.create()
      const laterRequest =
        "Continue from my current course position. Do not repeat the explanation. Choose one useful next move."
      const hitsBeforeLater = (yield* llm.hits).length
      yield* llm.text("application-only move")
      const laterStart = {
        sessionID: laterSessionID,
        turnID: laterTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "Gate 19 later action", permission: [{ permission: "*", pattern: "*", action: "allow" }] },
        parts: [{ type: "text", text: laterRequest }],
      } as const
      yield* prompt.start(laterStart)
      const laterTerminal = yield* prompt.awaitTurn(laterSessionID, laterTurnID)
      expect(laterTerminal.terminal).toMatchObject({ outcome: "completed" })
      const laterHit = (yield* llm.hits)[hitsBeforeLater]
      if (!laterHit) return yield* Effect.die("Missing Gate 19 provider request")
      const laterBlock = providerText(laterHit.body).find((value) =>
        value.includes("[Repa learning context — protected]"),
      )
      if (!laterBlock) return yield* Effect.die("Provider request omitted the production learning-context block")
      expect(laterBlock).toContain('"owner":"learner_response_evidence"')
      expect(laterBlock).toContain('"relation":"supports"')
      expect(laterBlock).toContain('"exposure":"learner_response_before_tutor_disclosure"')
      expect(laterBlock).not.toContain(responseText)
      expect(laterBlock).not.toContain(criterion)
      const firstOracle = laterBlock.includes('"relation":"supports"')
        ? "application_question_only"
        : "underdetermined_without_record"
      expect(firstOracle).toBe("application_question_only")
      const laterOperation = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, laterTurnID))
        .get()
        .pipe(Effect.orDie)
      if (!laterOperation) return yield* Effect.die("Missing admitted Gate 19 provider operation")
      const firstCut = yield* database.db.transaction((tx) =>
        LearningContext.readCut(tx, laterOperation.assistantMessageID),
      )
      if (firstCut.type !== "available") return yield* Effect.die("Missing stored Gate 19 production cut")
      expect(firstCut.cut.sections.find((section) => section.owner === "learner_response_evidence")).toMatchObject({
        countAtCut: 1,
        entries: [{ semantic: { state: "value", value: { relation: "supports" } } }],
      })
      const immutableFirstCut = JSON.stringify(firstCut.cut)

      const correctionSessionID = SessionID.create()
      const correctionTurnID = Turn.ID.create()
      const correctionInput = {
        operation: "revise_from_learner_report",
        recordID: stored.recordID,
        expectedVersion: 0,
        relation: "does_not_support",
        exposure: "learner_response_before_tutor_disclosure",
      } as const
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY, correctionInput)
      yield* llm.text("The correction remains a learner report, not observed mastery.")
      yield* prompt.start({
        sessionID: correctionSessionID,
        turnID: correctionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 2 },
        session: {
          title: "Gate 19 learner correction",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "Correction: my earlier response omitted the release rule." }],
      })
      expect((yield* prompt.awaitTurn(correctionSessionID, correctionTurnID)).terminal).toMatchObject({
        outcome: "completed",
      })
      expect(
        yield* database.db.get(sql`
          SELECT revision.relation, revision.basis, record.current_version AS version
          FROM learner_response_evidence_record AS record
          JOIN learner_response_evidence_revision AS revision ON revision.id = record.current_revision_id
          WHERE record.id = ${stored.recordID}
        `),
      ).toEqual({ relation: "does_not_support", basis: "learner_report", version: 1 })
      const hitsBeforeReplay = (yield* llm.hits).length
      expect(yield* prompt.start(laterStart)).toEqual(laterTerminal)
      expect((yield* llm.hits).length).toBe(hitsBeforeReplay)
      expect(
        JSON.stringify(
          yield* database.db.transaction((tx) => LearningContext.readCut(tx, laterOperation.assistantMessageID)),
        ),
      ).toContain(immutableFirstCut)

      const readableCorrectionSessionID = SessionID.create()
      const readableCorrectionTurnID = Turn.ID.create()
      yield* llm.text("no automatic assessment pressure while the correction source is readable")
      yield* prompt.start({
        sessionID: readableCorrectionSessionID,
        turnID: readableCorrectionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "Gate 19 readable correction control" },
        parts: [{ type: "text", text: laterRequest }],
      })
      yield* prompt.awaitTurn(readableCorrectionSessionID, readableCorrectionTurnID)
      const readableCorrectionOperation = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, readableCorrectionTurnID))
        .get()
        .pipe(Effect.orDie)
      if (!readableCorrectionOperation) return yield* Effect.die("Missing readable-correction control operation")
      const readableCorrectionCut = yield* database.db.transaction((tx) =>
        LearningContext.readCut(tx, readableCorrectionOperation.assistantMessageID),
      )
      if (readableCorrectionCut.type !== "available") return yield* Effect.die("Missing readable-correction cut")
      expect(
        readableCorrectionCut.cut.sections.find((section) => section.owner === "learner_response_evidence"),
      ).toMatchObject({ countAtCut: 0, entries: [] })

      yield* sessions.remove(correctionSessionID)
      const correctedLaterSessionID = SessionID.create()
      const correctedLaterTurnID = Turn.ID.create()
      const hitsBeforeCorrected = (yield* llm.hits).length
      yield* llm.text("correction-only move")
      yield* prompt.start({
        sessionID: correctedLaterSessionID,
        turnID: correctedLaterTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "Gate 19 corrected later action" },
        parts: [{ type: "text", text: laterRequest }],
      })
      yield* prompt.awaitTurn(correctedLaterSessionID, correctedLaterTurnID)
      const correctedHit = (yield* llm.hits)[hitsBeforeCorrected]
      const correctedBlock = correctedHit
        ? providerText(correctedHit.body).find((value) => value.includes("[Repa learning context — protected]"))
        : undefined
      if (!correctedBlock) return yield* Effect.die("Corrected provider request omitted production context")
      expect(correctedBlock).toContain('"relation":"does_not_support"')
      expect(
        correctedBlock.includes('"relation":"does_not_support"') ? "correction_only" : "underdetermined_without_record",
      ).toBe("correction_only")

      const disclosureCorrectionSessionID = SessionID.create()
      const disclosureCorrectionTurnID = Turn.ID.create()
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY, {
        operation: "revise_from_learner_report",
        recordID: stored.recordID,
        expectedVersion: 1,
        relation: "supports",
        exposure: "tutor_disclosure_before_learner_response",
      })
      yield* llm.text("The disclosure-order correction remains a learner report, not observed mastery.")
      yield* prompt.start({
        sessionID: disclosureCorrectionSessionID,
        turnID: disclosureCorrectionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 2 },
        session: {
          title: "Gate 19 disclosure-order correction",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "Correction: the Tutor disclosed the proposition before that response." }],
      })
      expect(
        (yield* prompt.awaitTurn(disclosureCorrectionSessionID, disclosureCorrectionTurnID)).terminal,
      ).toMatchObject({ outcome: "completed" })
      expect(
        yield* database.db.get(sql`
          SELECT revision.relation, revision.exposure, revision.basis, record.current_version AS version
          FROM learner_response_evidence_record AS record
          JOIN learner_response_evidence_revision AS revision ON revision.id = record.current_revision_id
          WHERE record.id = ${stored.recordID}
        `),
      ).toEqual({
        relation: "supports",
        exposure: "tutor_disclosure_before_learner_response",
        basis: "learner_report",
        version: 2,
      })
      yield* sessions.remove(disclosureCorrectionSessionID)

      const disclosureLaterSessionID = SessionID.create()
      const disclosureLaterTurnID = Turn.ID.create()
      const hitsBeforeDisclosure = (yield* llm.hits).length
      yield* llm.text("new-answer hidden-check move")
      yield* prompt.start({
        sessionID: disclosureLaterSessionID,
        turnID: disclosureLaterTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "Gate 19 disclosure-order later action" },
        parts: [{ type: "text", text: laterRequest }],
      })
      expect((yield* prompt.awaitTurn(disclosureLaterSessionID, disclosureLaterTurnID)).terminal).toMatchObject({
        outcome: "completed",
      })
      const disclosureHit = (yield* llm.hits)[hitsBeforeDisclosure]
      const disclosureBlock = disclosureHit
        ? providerText(disclosureHit.body).find((value) => value.includes("[Repa learning context — protected]"))
        : undefined
      if (!disclosureBlock) return yield* Effect.die("Disclosure-order request omitted production context")
      expect(disclosureBlock).toContain('"relation":"supports"')
      expect(disclosureBlock).toContain('"exposure":"tutor_disclosure_before_learner_response"')
      expect(
        disclosureBlock.includes('"relation":"supports"') &&
          disclosureBlock.includes('"exposure":"tutor_disclosure_before_learner_response"')
          ? "new_answer_hidden_check_only"
          : "underdetermined_without_record",
      ).toBe("new_answer_hidden_check_only")

      yield* sessions.remove(laterSessionID)
      yield* sessions.remove(readableCorrectionSessionID)
      yield* sessions.remove(correctedLaterSessionID)
      yield* sessions.remove(disclosureLaterSessionID)
    }),
  { config: cfg },
  60_000,
)

it.instance(
  "serves FutureAttention only from the exact completed tool-calling Assistant in the released-v1 loop",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const courses = yield* Course.Service
      const base = Math.floor(Date.now() / 1_000) * 1_000
      setSystemTime(new Date(base))
      yield* Effect.addFinalizer(() => Effect.sync(() => setSystemTime()))

      const course = yield* courses.createCourse({ title: "Future-attention prompt trace" })
      const view = yield* courses.createView({
        courseID: course.id,
        name: "Main",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "semaphore", title: "Semaphore concurrency bound" }] },
      })
      const item = (yield* courses.listRevisionItems(course.id, view.view.id, view.revision.id)).items[0]
      if (!item) return yield* Effect.die("FutureAttention prompt trace has no exact Course item")
      const dueAt = base + 60_000
      const purpose = "Explain how a semaphore bounds simultaneous entrants"
      const creationRequest = "Remember the exact semaphore concurrency-bound explanation for the next lesson."
      const createInput = {
        operations: [
          {
            type: "create" as const,
            concern: {
              purpose,
              source: {
                type: "interpreted_learner_request" as const,
                excerpt: {
                  text: creationRequest,
                  startByte: 0,
                  endByte: new TextEncoder().encode(creationRequest).byteLength,
                },
              },
              target: {
                endpoint: {
                  courseID: course.id,
                  viewID: view.view.id,
                  revisionID: view.revision.id,
                  itemID: item.itemID,
                },
                selection: { type: "explicit_exact" as const },
              },
              notBefore: {
                sourceExpression: "in the next lesson",
                localDateTime: new Date(dueAt).toISOString().slice(0, 19),
                timeZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
              },
              serviceTiming: "at_or_after_not_before" as const,
            },
          },
        ],
      }
      const creationSessionID = SessionID.create()
      const creationTurnID = Turn.ID.create()
      yield* llm.tool(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, createInput)
      yield* llm.text("I retained the later explanation without exposing internal lifecycle state.")
      yield* prompt.start({
        sessionID: creationSessionID,
        turnID: creationTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "FutureAttention creation",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: creationRequest }],
      })
      expect((yield* prompt.awaitTurn(creationSessionID, creationTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      const created = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "list" }, { now: base, limit: 64 }),
      )
      const createdView = created.items.find((value) => "concern" in value && value.concern.payload.purpose === purpose)
      if (!createdView || !("concern" in createdView)) {
        return yield* Effect.die("Released-v1 creation did not commit the exact FutureAttention concern")
      }
      expect(createdView).toMatchObject({ eligible: false, concern: { current: { disposition: "open", version: 0 } } })

      setSystemTime(new Date(dueAt - 1))
      const beforeSessionID = SessionID.create()
      const beforeTurnID = Turn.ID.create()
      const beforeHits = (yield* llm.hits).length
      yield* llm.text("Continue without anticipating a not-yet-due follow-up.")
      yield* prompt.start({
        sessionID: beforeSessionID,
        turnID: beforeTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "FutureAttention before due", permission: [] },
        parts: [{ type: "text", text: "Continue." }],
      })
      expect((yield* prompt.awaitTurn(beforeSessionID, beforeTurnID)).terminal).toMatchObject({ outcome: "completed" })
      const beforeBlock = providerText((yield* llm.hits)[beforeHits]?.body).find((value) =>
        value.includes("[Repa learning context — protected]"),
      )
      if (!beforeBlock) return yield* Effect.die("Before-due provider request omitted Learning Context")
      expect(beforeBlock).toContain("futureAttention: none eligible at this immutable cut")
      expect(beforeBlock).not.toContain(purpose)

      setSystemTime(new Date(dueAt + 1))
      const serviceSessionID = SessionID.create()
      const serviceTurnID = Turn.ID.create()
      const explanation =
        "A semaphore bounds simultaneous entrants because each entrant must acquire one of a fixed number of permits before entering."
      const serviceInput = {
        operations: [
          {
            type: "serve" as const,
            concernID: createdView.concern.id,
            expectedVersion: 0,
            service: {
              source: { type: "current_assistant_when_complete" as const },
              rationale:
                "The exact full committed tool-calling Assistant presentation supplies the retained explanation.",
            },
          },
        ],
      }
      const serviceHits = (yield* llm.hits).length
      yield* llm.push(reply().text(explanation).tool(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, serviceInput))
      yield* llm.text("Post-tool continuation A2 remains a distinct Assistant and does not substitute for A1.")
      yield* prompt.start({
        sessionID: serviceSessionID,
        turnID: serviceTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "FutureAttention exact A1 service",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "Continue with the explanation now." }],
      })
      expect((yield* prompt.awaitTurn(serviceSessionID, serviceTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      const serviceBlock = providerText((yield* llm.hits)[serviceHits]?.body).find((value) =>
        value.includes("[Repa learning context — protected]"),
      )
      if (!serviceBlock) return yield* Effect.die("Due provider request omitted Learning Context")
      expect(serviceBlock).toContain("futureAttention: conditional_default")
      expect(serviceBlock).toContain(purpose)

      const operations = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, serviceTurnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      expect(operations).toHaveLength(2)
      const a1 = operations[0]?.assistantMessageID
      const a2 = operations[1]?.assistantMessageID
      if (!a1 || !a2) return yield* Effect.die("FutureAttention trace omitted A1 or A2")
      expect(a1).not.toBe(a2)
      const serviceMessages = yield* sessions.messages({ sessionID: serviceSessionID })
      const claimPart = serviceMessages
        .flatMap((message) => message.parts)
        .find(
          (part): part is SessionV1.ToolPart =>
            part.type === "tool" && part.tool === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
        )
      if (!claimPart || claimPart.state.status !== "completed") {
        return yield* Effect.die("FutureAttention trace omitted the completed claim Tool Part")
      }
      expect(claimPart.messageID).toBe(a1)
      const admission = JSON.parse(claimPart.state.output)
      expect(admission).toMatchObject({
        settlement: { outcome: "applied", claim: { claimStateAtAdmission: "pending", claimState: "pending" } },
      })
      const groupID = admission.settlement.claim.groupID as FutureAttention.ClaimGroupID
      const group = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "claim_group", groupID }, { now: dueAt + 2, limit: 64 }),
      )
      expect(group.items[0]).toMatchObject({
        group: { assistantMessageID: a1, modelOperationID: a1, invocationPartID: claimPart.id },
        receipt: {
          outcome: "served",
          completion: {
            assistantMessageID: a1,
            modelOperationID: a1,
            invocationPartID: claimPart.id,
            presentationCommitted: true,
            eligibleOutputBytes: expect.any(Number),
          },
          members: [{ concernID: createdView.concern.id, outcome: "served" }],
        },
      })
      expect(JSON.parse(claimPart.state.output)).toEqual(admission)
      const served = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "concern", concernID: createdView.concern.id }, { now: dueAt + 2 }),
      )
      expect(served.items[0]).toMatchObject({ concern: { current: { disposition: "served", version: 1 } } })

      const afterSessionID = SessionID.create()
      const afterTurnID = Turn.ID.create()
      const afterHits = (yield* llm.hits).length
      yield* llm.text("Continue after the retained follow-up has been served.")
      yield* prompt.start({
        sessionID: afterSessionID,
        turnID: afterTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "FutureAttention after service", permission: [] },
        parts: [{ type: "text", text: "Continue." }],
      })
      expect((yield* prompt.awaitTurn(afterSessionID, afterTurnID)).terminal).toMatchObject({ outcome: "completed" })
      const afterBlock = providerText((yield* llm.hits)[afterHits]?.body).find((value) =>
        value.includes("[Repa learning context — protected]"),
      )
      if (!afterBlock) return yield* Effect.die("After-service provider request omitted Learning Context")
      expect(afterBlock).toContain("futureAttention: none eligible at this immutable cut")
      expect(afterBlock).not.toContain(purpose)

      yield* sessions.remove(serviceSessionID)
      const afterSourceDeletion = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "concern", concernID: createdView.concern.id }, { now: dueAt + 3 }),
      )
      expect(afterSourceDeletion.items[0]).toMatchObject({
        concern: { current: { disposition: "served", version: 1 } },
        serviceReceipt: {
          source: { type: "assistant_completion", assistantMessageID: a1 },
          sourceAvailability: { state: "source_unavailable", reason: "source_deleted" },
        },
      })
      expect(
        yield* database.db
          .select({ turnID: TurnUnavailableSourceTable.turn_id, sessionID: TurnUnavailableSourceTable.session_id })
          .from(TurnUnavailableSourceTable)
          .where(eq(TurnUnavailableSourceTable.turn_id, serviceTurnID))
          .get()
          .pipe(Effect.orDie),
      ).toEqual({ turnID: serviceTurnID, sessionID: serviceSessionID })
      expect(
        yield* database.db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(eq(SessionTable.id, serviceSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(JSON.stringify(afterSourceDeletion)).not.toContain(explanation)
    }),
  { config: cfg },
  60_000,
)

it.instance(
  "keeps non-Assignment obligations out of durable Assignment state in the released-v1 Agent loop",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const base = Math.floor(Date.now() / 1_000) * 1_000
      setSystemTime(new Date(base))
      yield* Effect.addFinalizer(() => Effect.sync(() => setSystemTime()))

      const cases = [
        {
          label: "self promise",
          request: "I promise myself I'll review chapter 3 by Friday.",
          response: "That is your self-commitment, not an externally existing Assignment record.",
        },
        {
          label: "dated goal",
          request: "I want to understand linear algebra by December.",
          response: "That is a dated learning Goal, not an Assignment obligation.",
        },
        {
          label: "Tutor proposed practice",
          request: "Give me one short induction exercise to try now.",
          response: "Try proving that the sum of the first n odd numbers is n squared.",
        },
        {
          label: "administrative deadline",
          request: "Course registration closes Friday; just tell me what that means.",
          response: "That is an administrative deadline, not a learning-relevant Assignment.",
        },
        {
          label: "no learning consumer",
          request: "The library says I must return the textbook Friday; do not teach, guide, review, or plan around it.",
          response: "That return obligation has no teaching, guided-work, review, or Planning consumer here.",
        },
      ] as const

      for (const [index, item] of cases.entries()) {
        const before = yield* database.db.get(sql`
          SELECT
            (SELECT count(*) FROM learning_command_invocation
              WHERE command_name = ${Assignment.UPDATE_CAPABILITY}) AS invocations,
            (SELECT count(*) FROM assignment) AS assignments,
            (SELECT count(*) FROM assignment_revision) AS revisions,
            (SELECT count(*) FROM assignment_effect) AS effects,
            (SELECT count(*) FROM assignment_commit_seal) AS seals
        `)
        const hitIndex = (yield* llm.hits).length
        yield* llm.text(item.response)
        const sessionID = SessionID.create()
        const turnID = Turn.ID.create()
        yield* prompt.start({
          sessionID,
          turnID,
          inputID: Turn.InputID.create(),
          messageID: MessageID.ascending(),
          agent: "repa",
          model: ref,
          limits: { model: 1, tool: 1 },
          session: { title: `Assignment exclusion ${index + 1}: ${item.label}` },
          parts: [{ type: "text", text: item.request }],
        })
        expect((yield* prompt.awaitTurn(sessionID, turnID)).terminal).toMatchObject({
          outcome: "completed",
          counters: { model: 1, tool: 0 },
        })

        const providerSurface = providerText((yield* llm.hits)[hitIndex]?.body).join("\n")
        expect(providerSurface).toContain(item.request)
        expect(providerSurface).toContain(
          "Use update_assignment only for an existing, source-relative, substantial learning obligation",
        )
        expect(providerSurface).toContain(
          "A learner self-promise, dated Goal, Tutor-proposed exercise or practice move, administrative deadline, or obligation with no real learning consumer is not an Assignment",
        )
        expect(providerSurface).toContain(
          "interpreted_learner_report and interpreted_source_observation are the only creation causes",
        )

        const messages = yield* sessions.messages({ sessionID })
        expect(
          messages
            .flatMap((message) => message.parts)
            .some((part) => part.type === "tool" && part.tool === Assignment.UPDATE_CAPABILITY),
        ).toBe(false)
        expect(
          messages
            .flatMap((message) => message.parts)
            .some((part) => part.type === "text" && part.text === item.response),
        ).toBe(true)
        expect(
          yield* database.db.get(sql`
            SELECT
              (SELECT count(*) FROM learning_command_invocation
                WHERE command_name = ${Assignment.UPDATE_CAPABILITY}) AS invocations,
              (SELECT count(*) FROM assignment) AS assignments,
              (SELECT count(*) FROM assignment_revision) AS revisions,
              (SELECT count(*) FROM assignment_effect) AS effects,
              (SELECT count(*) FROM assignment_commit_seal) AS seals
          `),
        ).toEqual(before)
        yield* sessions.remove(sessionID)
      }
    }),
  { config: cfg },
  60_000,
)

it.instance(
  "uses one exact Assignment lazy read for explicit teaching without turning obligation pressure into task activity",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const base = Math.floor(Date.now() / 1_000) * 1_000
      setSystemTime(new Date(base))
      yield* Effect.addFinalizer(() => Effect.sync(() => setSystemTime()))

      const report =
        "My algorithms course problem set 4 requires me to explain why binary search maintains its loop invariant."
      const summary = "Explain the binary-search loop invariant for problem set 4"
      const createInput = {
        cause: {
          type: "interpreted_learner_report" as const,
          excerpt: {
            text: report,
            startByte: 0,
            endByte: new TextEncoder().encode(report).byteLength,
          },
        },
        intents: [
          {
            type: "create" as const,
            createOrdinal: 0,
            snapshot: {
              obligationSummary: summary,
              learningContext: "Teach the invariant before guided binary-search work",
              scope: { type: "learner_home" as const },
              dueBasis: { type: "unresolved" as const },
            },
          },
        ],
      }
      const creationSessionID = SessionID.create()
      const creationTurnID = Turn.ID.create()
      yield* llm.tool(LearningCommand.UPDATE_ASSIGNMENT_CAPABILITY, createInput)
      yield* llm.text("I retained the learning-related obligation without treating it as completed work.")
      yield* prompt.start({
        sessionID: creationSessionID,
        turnID: creationTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Assignment teaching trace creation",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: report }],
      })
      const creationTerminal = (yield* prompt.awaitTurn(creationSessionID, creationTurnID)).terminal
      expect(creationTerminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })

      const discovered = yield* database.db.transaction((tx) =>
        Assignment.read(tx, { type: "discover", disposition: "open" }, { asOf: base + 1, limit: 8 }),
      )
      const created = discovered.items.find(
        (item) => "revision" in item && item.revision.snapshot.obligationSummary === summary,
      )
      if (!created || !("revision" in created)) {
        return yield* Effect.die("Released-v1 creation did not commit the exact Assignment revision")
      }
      expect(created).toMatchObject({
        assignmentRevisionRef: {
          assignmentID: created.revision.assignmentID,
          revisionID: created.revision.id,
          version: 1,
        },
        currentHeadRelation: "current",
        revision: { disposition: "open" },
      })
      const assignmentID = created.revision.assignmentID
      const revisionID = created.revision.id
      const writesBeforeTeaching = yield* database.db
        .get(sql`
          SELECT
            (SELECT count(*) FROM assignment_revision) AS revisions,
            (SELECT count(*) FROM assignment_effect) AS effects,
            (SELECT count(*) FROM assignment_commit_seal) AS seals
        `)
        .pipe(Effect.orDie)

      const helpSessionID = SessionID.create()
      const helpTurnID = Turn.ID.create()
      const helpRequest =
        "Use the exact Assignment detail, then teach me the binary-search invariant now. Do not manage or complete my task."
      const explanation =
        "Binary search keeps the target, if present, inside the current interval. Each comparison removes only the half that cannot contain it, so the invariant remains true while the interval shrinks."
      const helpHits = (yield* llm.hits).length
      yield* llm.tool(Assignment.READ_CAPABILITY, { action: "revision", assignmentID, revisionID })
      yield* llm.text(explanation)
      yield* prompt.start({
        sessionID: helpSessionID,
        turnID: helpTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Assignment explicit teaching consumer",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: helpRequest }],
      })
      expect((yield* prompt.awaitTurn(helpSessionID, helpTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })

      const contextBlock = providerText((yield* llm.hits)[helpHits]?.body).find((value) =>
        value.includes("[Repa learning context — protected]"),
      )
      if (!contextBlock) return yield* Effect.die("Explicit teaching request omitted Assignment Learning Context")
      expect(contextBlock).toContain("assignment: sole_candidate_pressure")
      expect(contextBlock).toContain(summary)
      expect(contextBlock).toContain(created.revision.id)
      expect(contextBlock).toContain("not the current/default task, a priority, a plan, a commitment, activity")

      const messages = yield* sessions.messages({ sessionID: helpSessionID })
      const readPart = messages
        .flatMap((message) => message.parts)
        .find(
          (part): part is SessionV1.ToolPart =>
            part.type === "tool" && part.tool === Assignment.READ_CAPABILITY,
        )
      if (!readPart || readPart.state.status !== "completed") {
        return yield* Effect.die("Explicit teaching request omitted the completed exact Assignment read")
      }
      expect(JSON.parse(readPart.state.output)).toMatchObject({
        page: {
          returnedCount: 1,
          items: [
            {
              id: revisionID,
              assignmentID,
              version: 1,
              snapshot: { obligationSummary: summary },
              disposition: "open",
            },
          ],
        },
      })
      const postReadProviderBody = providerText((yield* llm.hits)[helpHits + 1]?.body).join("\n")
      expect(postReadProviderBody).toContain(revisionID)
      expect(postReadProviderBody).toContain(summary)
      expect(
        messages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === explanation),
      ).toBe(true)

      expect(
        yield* database.db
          .get(sql`
            SELECT
              (SELECT count(*) FROM assignment_revision) AS revisions,
              (SELECT count(*) FROM assignment_effect) AS effects,
              (SELECT count(*) FROM assignment_commit_seal) AS seals
          `)
          .pipe(Effect.orDie),
      ).toEqual(writesBeforeTeaching)
      const afterTeaching = yield* database.db.transaction((tx) =>
        Assignment.read(tx, { type: "revision", assignmentID, revisionID }, { asOf: base + 2 }),
      )
      expect(afterTeaching.items[0]).toMatchObject({ id: revisionID, disposition: "open" })

      yield* sessions.remove(creationSessionID)
      yield* sessions.remove(helpSessionID)
    }),
  { config: cfg },
  60_000,
)

isolatedDatabaseBoundary.instance(
  "uses correctable learner-state memory across Sessions while useful teaching can remain zero-write",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      yield* database.db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make(dir), sandboxes: [] })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      const base = Math.floor(Date.now() / 1_000) * 1_000
      setSystemTime(new Date(base))
      yield* Effect.addFinalizer(() => Effect.sync(() => setSystemTime()))

      const report =
        "I can state the binary-search invariant, but I still get lost when deciding which half is safe to discard."
      const initialBody = "Can state the binary-search invariant; applying it to choose the safe discarded half remains uncertain."
      const subject = "Binary-search invariant application"
      const creationAcknowledgement =
        "I retained that fallible learning-state judgment so later teaching can focus on applying the invariant."
      const createInput = {
        operation: "create" as const,
        cause: {
          type: "interpreted_learner_report" as const,
          excerpt: { text: report, startByte: 0, endByte: new TextEncoder().encode(report).byteLength },
        },
        snapshot: {
          subject: { label: subject, scope: { type: "learner_home" as const } },
          judgmentBody: initialBody,
          exactBasisRefs: [],
          uncertaintyAndLimits: "Learner report is fallible and remains open to correction.",
          basisScope: "whole_judgment" as const,
        },
      }
      const creationSessionID = SessionID.create()
      const creationTurnID = Turn.ID.create()
      const creationHit = (yield* llm.hits).length
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY, createInput)
      yield* llm.text(creationAcknowledgement)
      yield* prompt.start({
        sessionID: creationSessionID,
        turnID: creationTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Learner-state report",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: report }],
      })
      const creationResult = yield* prompt.awaitTurn(creationSessionID, creationTurnID)
      if (!creationResult.terminal) return yield* Effect.die("Learner-state creation Turn did not terminalize")
      if (creationResult.terminal.outcome !== "completed") {
        return yield* Effect.die(
          JSON.stringify({
            terminal: creationResult.terminal,
            messages: yield* sessions.messages({ sessionID: creationSessionID }),
          }),
        )
      }
      expect(creationResult.terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })

      const discovered = yield* database.db.transaction((tx) =>
        LearnerStateJudgment.read(tx, { type: "discover", disposition: "active" }, { limit: 8 }),
      )
      const created = discovered.items.find(
        (item): item is LearnerStateJudgment.Judgment =>
          "current" in item && item.current.snapshot.subject.label === subject,
      )
      if (!created) return yield* Effect.die("Released-v1 learner-state write did not commit an exact current head")
      expect(created.current).toMatchObject({
        version: 1,
        disposition: "active",
        snapshot: { judgmentBody: initialBody, basisScope: "whole_judgment", exactBasis: [] },
      })
      const judgmentID = created.id
      const firstRevisionID = created.current.id
      const hasApplicationRequest = (body: unknown) =>
        providerText(body).some((value) => value.includes(applicationRequest))
      const hasExactDirectory = (body: unknown, input: { revisionID: string; version: number }) =>
        providerText(body).some(
          (value) =>
            value.includes("[Repa learning context — protected]") &&
            value.includes('"owner":"learner_state_judgment"') &&
            value.includes(`"judgmentID":"${judgmentID}"`) &&
            value.includes(`"revisionID":"${input.revisionID}"`) &&
            value.includes(`"version":${input.version}`),
        )
      const hasExactRead = (
        body: unknown,
        input: { revisionID: string; version: number; judgmentBody: string },
      ) =>
        providerText(body).some(
          (value) =>
            value.includes('"page":{') &&
            value.includes('"returnedCount":1') &&
            value.includes(`"id":"${input.revisionID}"`) &&
            value.includes(`"judgmentID":"${judgmentID}"`) &&
            value.includes(`"version":${input.version}`) &&
            value.includes(`"judgmentBody":${JSON.stringify(input.judgmentBody)}`),
        )
      const queueTeachingMove = (input: {
        revisionID: string
        version: number
        judgmentBody: string
        teaching: string
      }) =>
        Effect.gen(function* () {
          yield* llm.toolMatch(
            (hit) => hasApplicationRequest(hit.body) && hasExactDirectory(hit.body, input),
            LearnerStateJudgment.READ_CAPABILITY,
            { action: "revision", judgmentID, revisionID: input.revisionID },
          )
          yield* llm.textMatch(
            (hit) =>
              hasApplicationRequest(hit.body) &&
              hasExactDirectory(hit.body, input) &&
              hasExactRead(hit.body, input),
            input.teaching,
          )
        })
      const writesAfterCreate = yield* database.db
        .get(sql`
          SELECT
            (SELECT count(*) FROM learner_state_judgment_revision) AS revisions,
            (SELECT count(*) FROM learner_state_judgment_effect) AS effects,
            (SELECT count(*) FROM learner_state_judgment_commit_seal) AS seals
        `)
        .pipe(Effect.orDie)

      const applicationSessionID = SessionID.create()
      const applicationTurnID = Turn.ID.create()
      const applicationRequest =
        "Use my current learner-state memory and teach the binary-search step I am actually missing."
      const applicationTeaching =
        "At each comparison, combine the invariant with the comparison result: if target is smaller than a[mid], every index at or right of mid is impossible, so only that half is safe to discard."
      const applicationHit = (yield* llm.hits).length
      const pendingBeforeApplication = yield* llm.pending
      yield* queueTeachingMove({
        revisionID: firstRevisionID,
        version: 1,
        judgmentBody: initialBody,
        teaching: applicationTeaching,
      })
      yield* prompt.start({
        sessionID: applicationSessionID,
        turnID: applicationTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Learner-state application teaching",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: applicationRequest }],
      })
      expect((yield* prompt.awaitTurn(applicationSessionID, applicationTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      expect(yield* llm.pending).toBe(pendingBeforeApplication)

      const applicationContextBody = (yield* llm.hits)[applicationHit]?.body
      const applicationReadBody = (yield* llm.hits)[applicationHit + 1]?.body
      const firstApplicationBody = providerText(applicationContextBody).join("\n")
      expect(firstApplicationBody).toContain("learner_state_judgment")
      expect(firstApplicationBody).toContain(subject)
      expect(firstApplicationBody).toContain(firstRevisionID)
      expect(firstApplicationBody).toContain("Use update_learner_state_judgment only when a fuzzy, source-bearing account")
      expect(firstApplicationBody).not.toContain(report)
      expect(firstApplicationBody).not.toContain(creationAcknowledgement)
      const absentBody = (yield* llm.hits)[creationHit]?.body
      expect(hasExactDirectory(absentBody, { revisionID: firstRevisionID, version: 1 })).toBe(false)
      expect(
        hasExactRead(absentBody, { revisionID: firstRevisionID, version: 1, judgmentBody: initialBody }),
      ).toBe(false)
      expect(hasExactDirectory(applicationContextBody, { revisionID: firstRevisionID, version: 1 })).toBe(true)
      expect(
        hasExactRead(applicationReadBody, {
          revisionID: firstRevisionID,
          version: 1,
          judgmentBody: initialBody,
        }),
      ).toBe(true)
      const applicationMessages = yield* sessions.messages({ sessionID: applicationSessionID })
      const exactRead = applicationMessages
        .flatMap((message) => message.parts)
        .find(
          (part): part is SessionV1.ToolPart =>
            part.type === "tool" && part.tool === LearnerStateJudgment.READ_CAPABILITY,
        )
      if (!exactRead || exactRead.state.status !== "completed") {
        return yield* Effect.die("Cross-Session learner-state consumer omitted its exact lazy read")
      }
      expect(JSON.parse(exactRead.state.output)).toMatchObject({
        page: {
          returnedCount: 1,
          items: [
            {
              id: firstRevisionID,
              judgmentID,
              version: 1,
              snapshot: { judgmentBody: initialBody },
            },
          ],
        },
      })
      expect(providerText(applicationReadBody).join("\n")).toContain(initialBody)
      expect(
        applicationMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === applicationTeaching),
      ).toBe(true)
      expect(
        yield* database.db
          .get(sql`
            SELECT
              (SELECT count(*) FROM learner_state_judgment_revision) AS revisions,
              (SELECT count(*) FROM learner_state_judgment_effect) AS effects,
              (SELECT count(*) FROM learner_state_judgment_commit_seal) AS seals
          `)
          .pipe(Effect.orDie),
      ).toEqual(writesAfterCreate)

      const initialStateRef = {
        type: "learner_state_judgment_revision" as const,
        judgmentID,
        revisionID: firstRevisionID,
        version: 1,
      }
      const initialAdviceSummary = "Binary search: guided invariant application before revisiting the definition."
      const initialAdviceBody =
        "For the next binary-search lesson, start with one guided application of the invariant to a concrete comparison, then ask the learner to choose the safely discarded half. Revisit the definition only if that application still breaks down."
      const initialAdviceInput = {
        cause: {
          type: "proactive_tutor_proposal" as const,
          rationale: "Use the exact current learner-state revision to keep later teaching focused and revisable.",
        },
        intents: [
          {
            operation: "create" as const,
            operationOrdinal: 0,
            createOrdinal: 0,
            snapshot: {
              learnerVisibleScope: "Binary-search teaching across later Sessions",
              retrievalScope: {
                type: "anchored" as const,
                anchors: [
                  {
                    stableOwnerKey: { type: "learner_state_judgment" as const, judgmentID },
                    exactBoundRef: initialStateRef,
                  },
                ],
              },
              purpose: "Adapt the next teaching move to the learner's currently recorded binary-search gap.",
              directorySummary: initialAdviceSummary,
              body: initialAdviceBody,
              exactBasisRefs: [initialStateRef],
              assumptionsAndUncertainty:
                "This is fallible Tutor advice based on one exact learner-state revision, not a mastery or schedule claim.",
            },
          },
        ],
      }
      const initialAdviceSessionID = SessionID.create()
      const initialAdviceTurnID = Turn.ID.create()
      yield* llm.toolMatch(
        (hit) =>
          hasApplicationRequest(hit.body) &&
          hasExactDirectory(hit.body, { revisionID: firstRevisionID, version: 1 }),
        LearnerStateJudgment.READ_CAPABILITY,
        { action: "revision", judgmentID, revisionID: firstRevisionID },
      )
      yield* llm.toolMatch(
        (hit) =>
          hasApplicationRequest(hit.body) &&
          hasExactRead(hit.body, { revisionID: firstRevisionID, version: 1, judgmentBody: initialBody }),
        AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
        initialAdviceInput,
      )
      yield* llm.text("I kept one fallible, state-linked teaching suggestion and left it open to correction.")
      yield* prompt.start({
        sessionID: initialAdviceSessionID,
        turnID: initialAdviceTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 3, tool: 2 },
        session: {
          title: "Learner-state-linked advisory creation",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: applicationRequest }],
      })
      expect((yield* prompt.awaitTurn(initialAdviceSessionID, initialAdviceTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 3, tool: 2 },
      })
      const initialAdvice = (yield* database.db.transaction((tx) =>
        AdvisoryPlanSuggestion.read(tx, { type: "discover", disposition: "active" }, { limit: 8 }),
      )).items.find(
        (item): item is AdvisoryPlanSuggestion.Suggestion =>
          "current" in item && item.current.snapshot.directorySummary === initialAdviceSummary,
      )
      if (!initialAdvice) return yield* Effect.die("Learner-state-linked advice did not commit an exact head")
      const adviceSuggestionID = initialAdvice.id
      const initialAdviceRevisionID = initialAdvice.current.id
      expect(initialAdvice.current.snapshot).toMatchObject({
        body: initialAdviceBody,
        retrievalScope: {
          type: "anchored",
          anchors: [{ stableOwnerKey: { type: "learner_state_judgment", judgmentID } }],
        },
        exactBasis: [{ ref: initialStateRef }],
      })

      const beforeCorrection = yield* database.db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, judgmentID, Date.now()),
      )
      if (!beforeCorrection) return yield* Effect.die("Learner-state correction lost the exact current head")
      if (!beforeCorrection.currentHead) return yield* Effect.die("Current learner-state read omitted its correction head")
      const correction =
        "Correction: I do not reliably understand what the binary-search invariant means yet, so start with the definition."
      const correctedBody = "The binary-search invariant definition itself remains uncertain; application should follow later."
      const correctionInput = {
        operation: "revise" as const,
        judgmentID,
        expectedHead: beforeCorrection.currentHead,
        cause: {
          type: "learner_correction" as const,
          excerpt: { text: correction, startByte: 0, endByte: new TextEncoder().encode(correction).byteLength },
        },
        snapshot: {
          subject: { label: subject, scope: { type: "learner_home" as const } },
          judgmentBody: correctedBody,
          exactBasisRefs: [],
          uncertaintyAndLimits: "Natural learner correction; fallible and revisable.",
          basisScope: "whole_judgment" as const,
        },
        rationale: "Use the learner's correction to change the next teaching focus.",
      }
      const correctionSessionID = SessionID.create()
      const correctionTurnID = Turn.ID.create()
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY, correctionInput)
      yield* llm.text("I corrected the remembered learning state without treating either revision as a mastery score.")
      yield* prompt.start({
        sessionID: correctionSessionID,
        turnID: correctionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Learner-state natural correction",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: correction }],
      })
      expect((yield* prompt.awaitTurn(correctionSessionID, correctionTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      const correctionPart = (yield* sessions.messages({ sessionID: correctionSessionID }))
        .flatMap((message) => message.parts)
        .find(
          (part): part is SessionV1.ToolPart =>
            part.type === "tool" && part.tool === LearnerStateJudgment.UPDATE_CAPABILITY,
        )
      if (!correctionPart || correctionPart.state.status !== "completed") {
        return yield* Effect.die("Learner-state correction omitted its terminal Tool Part")
      }
      expect(JSON.parse(correctionPart.state.output)).toMatchObject({ settlement: { outcome: "applied" } })
      const corrected = yield* database.db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, judgmentID, Date.now()),
      )
      if (!corrected) return yield* Effect.die("Learner-state correction did not produce a current successor")
      expect(corrected.revision).toMatchObject({
        version: 2,
        predecessorRevisionID: firstRevisionID,
        snapshot: { judgmentBody: correctedBody },
        authorAndCause: { type: "learner_correction" },
      })

      const hasAdviceDirectory = (
        body: unknown,
        input: { revisionID: string; version: number; directorySummary: string },
      ) =>
        providerText(body).some(
          (value) =>
            value.includes('"owner":"advisory_plan_suggestion"') &&
            value.includes(`"suggestionID":"${adviceSuggestionID}"`) &&
            value.includes(`"revisionID":"${input.revisionID}"`) &&
            value.includes(`"version":${input.version}`) &&
            value.includes(`"directorySummary":${JSON.stringify(input.directorySummary)}`),
        )
      const hasAdviceRead = (body: unknown, input: { revisionID: string; version: number; adviceBody: string }) =>
        providerText(body).some(
          (value) =>
            value.includes('"page":{') &&
            value.includes('"returnedCount":1') &&
            value.includes(`"suggestionID":"${adviceSuggestionID}"`) &&
            value.includes(`"id":"${input.revisionID}"`) &&
            value.includes(`"version":${input.version}`) &&
            value.includes(`"body":${JSON.stringify(input.adviceBody)}`),
        )
      const adviceBeforeStateCorrection = yield* database.db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, adviceSuggestionID, Date.now()),
      )
      if (!adviceBeforeStateCorrection?.currentHead) {
        return yield* Effect.die("Learner-state-linked advice lost its exact current head")
      }
      const correctedStateRef = {
        type: "learner_state_judgment_revision" as const,
        judgmentID,
        revisionID: corrected.revision.id,
        version: 2,
      }
      const correctedAdviceSummary = "Binary search: define the invariant before guided application."
      const correctedAdviceBody =
        "For the next binary-search lesson, begin by defining the invariant and checking it against the initial interval. Only then guide one comparison and ask which half remains possible. Keep later transfer work provisional."
      const adviceCorrectionInput = {
        cause: {
          type: "tutor_revision" as const,
          rationale: "The exact corrected learner-state revision changes the useful teaching order.",
        },
        intents: [
          {
            operation: "revise" as const,
            operationOrdinal: 0,
            suggestionID: adviceSuggestionID,
            expectedHead: adviceBeforeStateCorrection.currentHead,
            snapshot: {
              learnerVisibleScope: "Binary-search teaching across later Sessions",
              retrievalScope: {
                type: "anchored" as const,
                anchors: [
                  {
                    stableOwnerKey: { type: "learner_state_judgment" as const, judgmentID },
                    exactBoundRef: correctedStateRef,
                  },
                ],
              },
              purpose: "Adapt the next teaching move to the learner's currently recorded binary-search gap.",
              directorySummary: correctedAdviceSummary,
              body: correctedAdviceBody,
              exactBasisRefs: [correctedStateRef],
              assumptionsAndUncertainty:
                "This remains fallible Tutor advice; the learner-state correction changes its basis without certifying mastery.",
            },
            rationale: "Revise the same suggestion rather than deterministically recomputing a schedule.",
          },
        ],
      }
      const adviceCorrectionSessionID = SessionID.create()
      const adviceCorrectionTurnID = Turn.ID.create()
      const adviceCorrectionHit = (yield* llm.hits).length
      yield* llm.toolMatch(
        (hit) =>
          hasApplicationRequest(hit.body) &&
          hasExactDirectory(hit.body, { revisionID: corrected.revision.id, version: 2 }) &&
          hasAdviceDirectory(hit.body, {
            revisionID: initialAdviceRevisionID,
            version: 1,
            directorySummary: initialAdviceSummary,
          }),
        LearnerStateJudgment.READ_CAPABILITY,
        { action: "revision", judgmentID, revisionID: corrected.revision.id },
      )
      yield* llm.toolMatch(
        (hit) =>
          hasApplicationRequest(hit.body) &&
          hasExactRead(hit.body, {
            revisionID: corrected.revision.id,
            version: 2,
            judgmentBody: correctedBody,
          }) &&
          hasAdviceDirectory(hit.body, {
            revisionID: initialAdviceRevisionID,
            version: 1,
            directorySummary: initialAdviceSummary,
          }),
        AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
        adviceCorrectionInput,
      )
      yield* llm.text("I revised the same fallible teaching suggestion from the corrected learner-state source.")
      yield* prompt.start({
        sessionID: adviceCorrectionSessionID,
        turnID: adviceCorrectionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 3, tool: 2 },
        session: {
          title: "Learner-state-driven advisory correction",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: applicationRequest }],
      })
      expect((yield* prompt.awaitTurn(adviceCorrectionSessionID, adviceCorrectionTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 3, tool: 2 },
      })
      const adviceCorrectionBodies = [
        (yield* llm.hits)[adviceCorrectionHit]?.body,
        (yield* llm.hits)[adviceCorrectionHit + 1]?.body,
      ]
      expect(
        hasExactRead(adviceCorrectionBodies[1], {
          revisionID: corrected.revision.id,
          version: 2,
          judgmentBody: correctedBody,
        }),
      ).toBe(true)
      const correctedAdvice = yield* database.db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, adviceSuggestionID, Date.now()),
      )
      if (!correctedAdvice) return yield* Effect.die("Learner-state-driven advice did not produce a successor")
      expect(correctedAdvice.revision).toMatchObject({
        version: 2,
        predecessorRevisionID: initialAdviceRevisionID,
        snapshot: {
          directorySummary: correctedAdviceSummary,
          body: correctedAdviceBody,
          retrievalScope: {
            type: "anchored",
            anchors: [{ exactBound: { ref: correctedStateRef } }],
          },
          exactBasis: [{ ref: correctedStateRef }],
        },
        authorAndCause: { type: "tutor_revision" },
      })
      expect(
        yield* database.db.transaction((tx) =>
          AdvisoryPlanSuggestion.readExactRevision(tx, adviceSuggestionID, initialAdviceRevisionID),
        ),
      ).toEqual(initialAdvice.current)

      const definitionSessionID = SessionID.create()
      const definitionTurnID = Turn.ID.create()
      const definitionTeaching =
        "The invariant says: before every loop iteration, if the target exists, its index is still inside the current search interval. Start by checking that this is true before the first comparison."
      const definitionHit = (yield* llm.hits).length
      const pendingBeforeDefinition = yield* llm.pending
      yield* llm.toolMatch(
        (hit) =>
          hasApplicationRequest(hit.body) &&
          hasExactDirectory(hit.body, { revisionID: corrected.revision.id, version: 2 }) &&
          hasAdviceDirectory(hit.body, {
            revisionID: correctedAdvice.revision.id,
            version: 2,
            directorySummary: correctedAdviceSummary,
          }),
        AdvisoryPlanSuggestion.READ_CAPABILITY,
        { action: "revision", suggestionID: adviceSuggestionID, revisionID: correctedAdvice.revision.id },
      )
      yield* llm.textMatch(
        (hit) =>
          hasApplicationRequest(hit.body) &&
          hasAdviceRead(hit.body, {
            revisionID: correctedAdvice.revision.id,
            version: 2,
            adviceBody: correctedAdviceBody,
          }),
        definitionTeaching,
      )
      yield* prompt.start({
        sessionID: definitionSessionID,
        turnID: definitionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Learner-state corrected teaching",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: applicationRequest }],
      })
      expect((yield* prompt.awaitTurn(definitionSessionID, definitionTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      expect(yield* llm.pending).toBe(pendingBeforeDefinition)
      const correctedContextBody = (yield* llm.hits)[definitionHit]?.body
      const correctedReadBody = (yield* llm.hits)[definitionHit + 1]?.body
      const correctedContext = providerText(correctedContextBody).join("\n")
      expect(correctedContext).toContain(corrected.revision.id)
      expect(correctedContext).not.toContain(firstRevisionID)
      expect(correctedContext).toContain(correctedAdvice.revision.id)
      expect(correctedContext).not.toContain(initialAdviceRevisionID)
      expect(providerText(correctedReadBody).join("\n")).toContain(correctedAdviceBody)
      expect(
        hasExactDirectory(applicationContextBody, { revisionID: corrected.revision.id, version: 1 }),
      ).toBe(false)
      expect(
        hasExactRead(applicationReadBody, {
          revisionID: corrected.revision.id,
          version: 1,
          judgmentBody: initialBody,
        }),
      ).toBe(false)
      expect(hasExactDirectory(correctedContextBody, { revisionID: corrected.revision.id, version: 2 })).toBe(true)
      expect(
        hasAdviceRead(correctedReadBody, {
          revisionID: correctedAdvice.revision.id,
          version: 2,
          adviceBody: correctedAdviceBody,
        }),
      ).toBe(true)
      expect(hasExactDirectory(correctedContextBody, { revisionID: firstRevisionID, version: 2 })).toBe(false)
      expect(
        hasExactRead(correctedReadBody, {
          revisionID: firstRevisionID,
          version: 2,
          judgmentBody: correctedBody,
        }),
      ).toBe(false)
      const definitionMessages = yield* sessions.messages({ sessionID: definitionSessionID })
      const correctedRead = definitionMessages
        .flatMap((message) => message.parts)
        .find(
          (part): part is SessionV1.ToolPart =>
            part.type === "tool" && part.tool === AdvisoryPlanSuggestion.READ_CAPABILITY,
        )
      if (!correctedRead || correctedRead.state.status !== "completed") {
        return yield* Effect.die("Corrected teaching omitted its exact advisory lazy read")
      }
      expect(JSON.parse(correctedRead.state.output)).toMatchObject({
        page: {
          returnedCount: 1,
          items: [
            {
              id: correctedAdvice.revision.id,
              suggestionID: adviceSuggestionID,
              version: 2,
              snapshot: { body: correctedAdviceBody },
            },
          ],
        },
      })
      expect(
        definitionMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === definitionTeaching),
      ).toBe(true)
      expect(
        applicationMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === definitionTeaching),
      ).toBe(false)
      expect(
        definitionMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === applicationTeaching),
      ).toBe(false)

      const writesBeforeZeroWrite = yield* database.db.get(sql`
        SELECT
          (SELECT count(*) FROM learner_state_judgment_revision) AS revisions,
          (SELECT count(*) FROM learner_state_judgment_effect) AS effects,
          (SELECT count(*) FROM learner_state_judgment_commit_seal) AS seals
      `)
      const zeroWriteSessionID = SessionID.create()
      const zeroWriteTurnID = Turn.ID.create()
      const zeroWriteTeaching = "A mutex protects one critical section at a time; picture one key passed between threads."
      const zeroWriteRequest = "Explain a mutex with one concrete picture."
      const pendingBeforeZeroWrite = yield* llm.pending
      yield* llm.textMatch(
        (hit) => providerText(hit.body).some((value) => value.includes(zeroWriteRequest)),
        zeroWriteTeaching,
      )
      yield* prompt.start({
        sessionID: zeroWriteSessionID,
        turnID: zeroWriteTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 1 },
        session: { title: "Useful zero-write teaching" },
        parts: [{ type: "text", text: zeroWriteRequest }],
      })
      expect((yield* prompt.awaitTurn(zeroWriteSessionID, zeroWriteTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 1, tool: 0 },
      })
      expect(yield* llm.pending).toBe(pendingBeforeZeroWrite)
      const zeroWriteMessages = yield* sessions.messages({ sessionID: zeroWriteSessionID })
      expect(
        zeroWriteMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === zeroWriteTeaching),
      ).toBe(true)
      expect(
        zeroWriteMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "tool" && part.tool === LearnerStateJudgment.UPDATE_CAPABILITY),
      ).toBe(false)
      expect(
        yield* database.db.get(sql`
          SELECT
            (SELECT count(*) FROM learner_state_judgment_revision) AS revisions,
            (SELECT count(*) FROM learner_state_judgment_effect) AS effects,
            (SELECT count(*) FROM learner_state_judgment_commit_seal) AS seals
        `),
      ).toEqual(writesBeforeZeroWrite)

      yield* sessions.remove(creationSessionID)
      yield* sessions.remove(applicationSessionID)
      yield* sessions.remove(initialAdviceSessionID)
      yield* sessions.remove(correctionSessionID)
      yield* sessions.remove(adviceCorrectionSessionID)
      yield* sessions.remove(definitionSessionID)
      yield* sessions.remove(zeroWriteSessionID)

      const retainedRevision = yield* database.db.transaction((tx) =>
        LearnerStateJudgment.readExactRevision(tx, judgmentID, corrected.revision.id),
      )
      expect(retainedRevision).toEqual(corrected.revision)
      const retainedCurrent = yield* database.db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, judgmentID, Date.now()),
      )
      expect(retainedCurrent?.revision.id).toBe(corrected.revision.id)
    }),
  { config: cfg },
  90_000,
)

isolatedDatabaseBoundary.instance(
  "uses exact fallback-scoped advisory suggestions across Sessions while useful teaching can remain zero-write",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      yield* database.db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make(dir), sandboxes: [] })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)

      const proposal =
        "When we continue with continuations, start from one concrete worked example before asking me to generalize."
      const initialSummary = "Continuation study: worked example before generalization."
      const initialBody =
        "For the next continuation lesson, begin with one fully worked concrete continuation example, then ask the learner to explain the invariant in their own words before attempting a nearby transfer problem. Keep later steps as a revisable outline, not a schedule."
      const createInput = {
        cause: {
          type: "responsive_tutor_proposal" as const,
          excerpt: {
            text: proposal,
            startByte: 0,
            endByte: new TextEncoder().encode(proposal).byteLength,
          },
          rationale: "Preserve useful cross-Session advice without turning it into a rigid schedule.",
        },
        intents: [
          {
            operation: "create" as const,
            operationOrdinal: 0,
            createOrdinal: 0,
            snapshot: {
              learnerVisibleScope: "Learning continuations across later Sessions",
              retrievalScope: {
                type: "learner_home_fallback" as const,
                reason: "no_stable_owner_anchor" as const,
              },
              purpose: "Guide later continuation teaching when no durable topic owner exists yet.",
              directorySummary: initialSummary,
              body: initialBody,
              exactBasisRefs: [],
              assumptionsAndUncertainty:
                "This is fallible Tutor advice inferred from the learner's request and should change naturally when corrected.",
            },
          },
        ],
      }
      const creationSessionID = SessionID.create()
      const creationTurnID = Turn.ID.create()
      yield* llm.tool(AdvisoryPlanSuggestion.UPDATE_CAPABILITY, createInput)
      yield* llm.text("I kept that as revisable learning advice, not as a schedule or commitment.")
      yield* prompt.start({
        sessionID: creationSessionID,
        turnID: creationTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Continuation advisory proposal",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: proposal }],
      })
      const creationResult = yield* prompt.awaitTurn(creationSessionID, creationTurnID)
      if (!creationResult.terminal || creationResult.terminal.outcome !== "completed") {
        return yield* Effect.die(
          JSON.stringify({
            terminal: creationResult.terminal,
            messages: yield* sessions.messages({ sessionID: creationSessionID }),
          }),
        )
      }
      expect(creationResult.terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })

      const discovered = yield* database.db.transaction((tx) =>
        AdvisoryPlanSuggestion.read(tx, { type: "discover", disposition: "active" }, { limit: 8 }),
      )
      const created = discovered.items.find(
        (item): item is AdvisoryPlanSuggestion.Suggestion =>
          "current" in item && item.current.snapshot.directorySummary === initialSummary,
      )
      if (!created) return yield* Effect.die("Released-v1 advisory proposal did not commit an exact current head")
      expect(created.current).toMatchObject({
        version: 1,
        disposition: "active",
        snapshot: {
          retrievalScope: { type: "learner_home_fallback", reason: "no_stable_owner_anchor" },
          directorySummary: initialSummary,
          body: initialBody,
          exactBasis: [],
        },
      })
      const suggestionID = created.id
      const firstRevisionID = created.current.id
      expect(
        yield* database.db.get(sql`
          SELECT
            (SELECT count(*) FROM course) AS courses,
            (SELECT count(*) FROM learner_goal) AS goals,
            (SELECT count(*) FROM assignment) AS assignments,
            (SELECT count(*) FROM material_map) AS materials,
            (SELECT count(*) FROM learner_response_evidence_record) AS evidence,
            (SELECT count(*) FROM learner_state_judgment) AS learnerState
        `),
      ).toEqual({ courses: 0, goals: 0, assignments: 0, materials: 0, evidence: 0, learnerState: 0 })

      const teachingRequest = "Continue our study of continuations using the current advice you retained for me."
      const hasTeachingRequest = (body: unknown) =>
        providerText(body).some((value) => value.includes(teachingRequest))
      const hasExactDirectory = (
        body: unknown,
        input: { revisionID: string; version: number; directorySummary: string },
      ) =>
        providerText(body).some(
          (value) =>
            value.includes("[Repa learning context — protected]") &&
            value.includes('"owner":"advisory_plan_suggestion"') &&
            value.includes('"directoryCursor":') &&
            value.includes(`"suggestionID":"${suggestionID}"`) &&
            value.includes(`"revisionID":"${input.revisionID}"`) &&
            value.includes(`"version":${input.version}`) &&
            value.includes('"retrievalArm":"learner_home_fallback"') &&
            value.includes(`"directorySummary":${JSON.stringify(input.directorySummary)}`),
        )
      const hasExactRead = (
        body: unknown,
        input: { revisionID: string; version: number; body: string },
      ) =>
        providerText(body).some(
          (value) =>
            value.includes('"page":{') &&
            value.includes('"returnedCount":1') &&
            value.includes(`"suggestionID":"${suggestionID}"`) &&
            value.includes(`"id":"${input.revisionID}"`) &&
            value.includes(`"version":${input.version}`) &&
            value.includes(`"body":${JSON.stringify(input.body)}`),
        )
      const queueTeaching = (input: {
        revisionID: string
        version: number
        directorySummary: string
        body: string
        teaching: string
      }) =>
        Effect.gen(function* () {
          yield* llm.toolMatch(
            (hit) => hasTeachingRequest(hit.body) && hasExactDirectory(hit.body, input),
            AdvisoryPlanSuggestion.READ_CAPABILITY,
            { action: "revision", suggestionID, revisionID: input.revisionID },
          )
          yield* llm.textMatch(
            (hit) =>
              hasTeachingRequest(hit.body) &&
              hasExactDirectory(hit.body, input) &&
              hasExactRead(hit.body, input),
            input.teaching,
          )
        })

      const writesAfterCreate = yield* database.db.get(sql`
        SELECT
          (SELECT count(*) FROM advisory_plan_suggestion_revision) AS revisions,
          (SELECT count(*) FROM advisory_plan_suggestion_effect) AS effects,
          (SELECT count(*) FROM advisory_plan_suggestion_commit_seal) AS seals
      `)
      const absentControl = "No retained advisory directory is available in this Session, so I need current guidance before using it."
      const absentSessionID = SessionID.create()
      const absentTurnID = Turn.ID.create()
      const absentHit = (yield* llm.hits).length
      const pendingBeforeAbsentControl = yield* llm.pending
      yield* llm.textMatch(
        (hit) =>
          hasTeachingRequest(hit.body) &&
          !providerText(hit.body).some((value) => value.includes(`"suggestionID":"${suggestionID}"`)),
        absentControl,
      )
      yield* prompt.start({
        sessionID: absentSessionID,
        turnID: absentTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 1 },
        session: {
          title: "Continuation teaching without advisory visibility",
          permission: [
            { permission: "*", pattern: "*", action: "allow" },
            { permission: AdvisoryPlanSuggestion.READ_CAPABILITY, pattern: "*", action: "deny" },
          ],
        },
        parts: [{ type: "text", text: teachingRequest }],
      })
      expect((yield* prompt.awaitTurn(absentSessionID, absentTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 1, tool: 0 },
      })
      expect(yield* llm.pending).toBe(pendingBeforeAbsentControl)
      const absentContextBody = (yield* llm.hits)[absentHit]?.body
      expect(hasTeachingRequest(absentContextBody)).toBe(true)
      expect(providerText(absentContextBody).join("\n")).not.toContain(`"suggestionID":"${suggestionID}"`)
      const absentMessages = yield* sessions.messages({ sessionID: absentSessionID })
      expect(
        absentMessages.flatMap((message) => message.parts).some((part) => part.type === "text" && part.text === absentControl),
      ).toBe(true)
      expect(
        absentMessages
          .flatMap((message) => message.parts)
          .some(
            (part) =>
              part.type === "tool" &&
              (part.tool === AdvisoryPlanSuggestion.READ_CAPABILITY ||
                part.tool === AdvisoryPlanSuggestion.UPDATE_CAPABILITY),
          ),
      ).toBe(false)
      expect(
        yield* database.db.get(sql`
          SELECT
            (SELECT count(*) FROM advisory_plan_suggestion_revision) AS revisions,
            (SELECT count(*) FROM advisory_plan_suggestion_effect) AS effects,
            (SELECT count(*) FROM advisory_plan_suggestion_commit_seal) AS seals
        `),
      ).toEqual(writesAfterCreate)
      const exampleTeaching =
        "Take the continuation that receives k and immediately calls k(3): the surrounding computation is paused, while k names exactly what happens next. Trace that one concrete control transfer before generalizing the invariant."
      const firstTeachingSessionID = SessionID.create()
      const firstTeachingTurnID = Turn.ID.create()
      const firstTeachingHit = (yield* llm.hits).length
      const pendingBeforeFirstTeaching = yield* llm.pending
      yield* queueTeaching({
        revisionID: firstRevisionID,
        version: 1,
        directorySummary: initialSummary,
        body: initialBody,
        teaching: exampleTeaching,
      })
      yield* prompt.start({
        sessionID: firstTeachingSessionID,
        turnID: firstTeachingTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Continuation teaching from advisory memory",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: teachingRequest }],
      })
      expect((yield* prompt.awaitTurn(firstTeachingSessionID, firstTeachingTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      expect(yield* llm.pending).toBe(pendingBeforeFirstTeaching)

      const firstContextBody = (yield* llm.hits)[firstTeachingHit]?.body
      const firstReadBody = (yield* llm.hits)[firstTeachingHit + 1]?.body
      expect(hasExactDirectory(firstContextBody, {
        revisionID: firstRevisionID,
        version: 1,
        directorySummary: initialSummary,
      })).toBe(true)
      expect(providerText(firstContextBody).join("\n")).not.toContain(initialBody)
      expect(hasExactRead(firstReadBody, { revisionID: firstRevisionID, version: 1, body: initialBody })).toBe(true)
      const firstTeachingMessages = yield* sessions.messages({ sessionID: firstTeachingSessionID })
      const firstRead = firstTeachingMessages
        .flatMap((message) => message.parts)
        .find(
          (part): part is SessionV1.ToolPart =>
            part.type === "tool" && part.tool === AdvisoryPlanSuggestion.READ_CAPABILITY,
        )
      if (!firstRead || firstRead.state.status !== "completed") {
        return yield* Effect.die("Cross-Session advisory consumer omitted its exact lazy read")
      }
      expect(JSON.parse(firstRead.state.output)).toMatchObject({
        page: {
          returnedCount: 1,
          items: [
            {
              id: firstRevisionID,
              suggestionID,
              version: 1,
              snapshot: { directorySummary: initialSummary, body: initialBody },
            },
          ],
        },
      })
      expect(
        firstTeachingMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === exampleTeaching),
      ).toBe(true)
      expect(
        yield* database.db.get(sql`
          SELECT
            (SELECT count(*) FROM advisory_plan_suggestion_revision) AS revisions,
            (SELECT count(*) FROM advisory_plan_suggestion_effect) AS effects,
            (SELECT count(*) FROM advisory_plan_suggestion_commit_seal) AS seals
        `),
      ).toEqual(writesAfterCreate)

      const current = yield* database.db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, suggestionID, Date.now()),
      )
      if (!current?.currentHead) return yield* Effect.die("Advisory correction lost the exact current head")
      const correction =
        "Change that advice: start by defining continuations in plain language before showing the worked example."
      const correctedSummary = "Continuation study: plain-language definition before the worked example."
      const correctedBody =
        "For the next continuation lesson, first give a plain-language definition of a continuation as the rest of a computation made explicit. Then show one worked example, check the learner's interpretation, and only afterward offer a nearby transfer problem. Keep the distant outline revisable."
      const correctionInput = {
        cause: {
          type: "learner_revision" as const,
          excerpt: {
            text: correction,
            startByte: 0,
            endByte: new TextEncoder().encode(correction).byteLength,
          },
        },
        intents: [
          {
            operation: "revise" as const,
            operationOrdinal: 0,
            suggestionID,
            expectedHead: current.currentHead,
            snapshot: {
              learnerVisibleScope: "Learning continuations across later Sessions",
              retrievalScope: {
                type: "learner_home_fallback" as const,
                reason: "no_stable_owner_anchor" as const,
              },
              purpose: "Guide later continuation teaching when no durable topic owner exists yet.",
              directorySummary: correctedSummary,
              body: correctedBody,
              exactBasisRefs: [],
              assumptionsAndUncertainty:
                "This learner correction changes the suggested teaching order without becoming a schedule or mastery claim.",
            },
            rationale: "Honor the learner's natural correction in the next teaching move.",
          },
        ],
      }
      const correctionSessionID = SessionID.create()
      const correctionTurnID = Turn.ID.create()
      yield* llm.tool(AdvisoryPlanSuggestion.UPDATE_CAPABILITY, correctionInput)
      yield* llm.text("I revised the advice to begin with the definition; it remains fallible and correctable.")
      yield* prompt.start({
        sessionID: correctionSessionID,
        turnID: correctionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Natural advisory correction",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: correction }],
      })
      expect((yield* prompt.awaitTurn(correctionSessionID, correctionTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      const corrected = yield* database.db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, suggestionID, Date.now()),
      )
      if (!corrected) return yield* Effect.die("Advisory correction did not produce a current successor")
      expect(corrected.revision).toMatchObject({
        version: 2,
        predecessorRevisionID: firstRevisionID,
        snapshot: { directorySummary: correctedSummary, body: correctedBody },
        authorAndCause: { type: "learner_revision" },
      })

      const definitionTeaching =
        "A continuation is the rest of a computation packaged as something you can call. In the concrete k(3) example, k is not the past work—it is exactly what should happen after the value 3 is produced."
      const correctedTeachingSessionID = SessionID.create()
      const correctedTeachingTurnID = Turn.ID.create()
      const correctedTeachingHit = (yield* llm.hits).length
      const pendingBeforeCorrectedTeaching = yield* llm.pending
      yield* queueTeaching({
        revisionID: corrected.revision.id,
        version: 2,
        directorySummary: correctedSummary,
        body: correctedBody,
        teaching: definitionTeaching,
      })
      yield* prompt.start({
        sessionID: correctedTeachingSessionID,
        turnID: correctedTeachingTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Corrected continuation teaching",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: teachingRequest }],
      })
      const correctedTeachingResult = yield* prompt.awaitTurn(correctedTeachingSessionID, correctedTeachingTurnID)
      if (!correctedTeachingResult.terminal || correctedTeachingResult.terminal.outcome !== "completed") {
        return yield* Effect.die(
          JSON.stringify({
            terminal: correctedTeachingResult.terminal,
            messages: yield* sessions.messages({ sessionID: correctedTeachingSessionID }),
          }),
        )
      }
      expect(correctedTeachingResult.terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      expect(yield* llm.pending).toBe(pendingBeforeCorrectedTeaching)
      const correctedContextBody = (yield* llm.hits)[correctedTeachingHit]?.body
      const correctedReadBody = (yield* llm.hits)[correctedTeachingHit + 1]?.body
      expect(hasExactDirectory(correctedContextBody, {
        revisionID: corrected.revision.id,
        version: 2,
        directorySummary: correctedSummary,
      })).toBe(true)
      expect(hasExactRead(correctedReadBody, {
        revisionID: corrected.revision.id,
        version: 2,
        body: correctedBody,
      })).toBe(true)
      expect(hasExactDirectory(firstContextBody, {
        revisionID: corrected.revision.id,
        version: 2,
        directorySummary: correctedSummary,
      })).toBe(false)
      expect(hasExactRead(firstReadBody, {
        revisionID: corrected.revision.id,
        version: 2,
        body: correctedBody,
      })).toBe(false)
      expect(hasExactDirectory(correctedContextBody, {
        revisionID: firstRevisionID,
        version: 2,
        directorySummary: correctedSummary,
      })).toBe(false)
      const correctedTeachingMessages = yield* sessions.messages({ sessionID: correctedTeachingSessionID })
      expect(
        correctedTeachingMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === definitionTeaching),
      ).toBe(true)
      expect(
        correctedTeachingMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === exampleTeaching),
      ).toBe(false)
      expect(
        firstTeachingMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === definitionTeaching),
      ).toBe(false)

      const currentControlTeaching =
        "The retained revision is the corrected definition-first advice, so this control follows that exact body rather than the superseded example-first revision."
      const staleBodyTeaching = "This response must never be selected from the superseded advisory body."
      const wrongRevisionSessionID = SessionID.create()
      const wrongRevisionTurnID = Turn.ID.create()
      const wrongRevisionHit = (yield* llm.hits).length
      const pendingBeforeWrongRevisionControl = yield* llm.pending
      yield* llm.toolMatch(
        (hit) =>
          hasTeachingRequest(hit.body) &&
          hasExactDirectory(hit.body, {
            revisionID: firstRevisionID,
            version: 1,
            directorySummary: initialSummary,
          }),
        AdvisoryPlanSuggestion.READ_CAPABILITY,
        { action: "revision", suggestionID, revisionID: firstRevisionID },
      )
      yield* llm.toolMatch(
        (hit) =>
          hasTeachingRequest(hit.body) &&
          hasExactDirectory(hit.body, {
            revisionID: corrected.revision.id,
            version: 2,
            directorySummary: correctedSummary,
          }),
        AdvisoryPlanSuggestion.READ_CAPABILITY,
        { action: "revision", suggestionID, revisionID: corrected.revision.id },
      )
      yield* llm.textMatch(
        (hit) =>
          hasTeachingRequest(hit.body) &&
          hasExactRead(hit.body, { revisionID: firstRevisionID, version: 1, body: initialBody }),
        staleBodyTeaching,
      )
      yield* llm.textMatch(
        (hit) =>
          hasTeachingRequest(hit.body) &&
          hasExactRead(hit.body, { revisionID: corrected.revision.id, version: 2, body: correctedBody }),
        currentControlTeaching,
      )
      yield* prompt.start({
        sessionID: wrongRevisionSessionID,
        turnID: wrongRevisionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Continuation advisory wrong-revision control",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: teachingRequest }],
      })
      expect((yield* prompt.awaitTurn(wrongRevisionSessionID, wrongRevisionTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      expect(yield* llm.pending).toBe(pendingBeforeWrongRevisionControl + 2)
      const wrongRevisionContextBody = (yield* llm.hits)[wrongRevisionHit]?.body
      const wrongRevisionReadBody = (yield* llm.hits)[wrongRevisionHit + 1]?.body
      expect(hasExactDirectory(wrongRevisionContextBody, {
        revisionID: corrected.revision.id,
        version: 2,
        directorySummary: correctedSummary,
      })).toBe(true)
      expect(hasExactDirectory(wrongRevisionContextBody, {
        revisionID: firstRevisionID,
        version: 1,
        directorySummary: initialSummary,
      })).toBe(false)
      expect(hasExactRead(wrongRevisionReadBody, {
        revisionID: corrected.revision.id,
        version: 2,
        body: correctedBody,
      })).toBe(true)
      expect(hasExactRead(wrongRevisionReadBody, {
        revisionID: firstRevisionID,
        version: 1,
        body: initialBody,
      })).toBe(false)
      const wrongRevisionMessages = yield* sessions.messages({ sessionID: wrongRevisionSessionID })
      expect(
        wrongRevisionMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === currentControlTeaching),
      ).toBe(true)
      expect(
        wrongRevisionMessages
          .flatMap((message) => message.parts)
          .some(
            (part) => part.type === "text" && part.text === staleBodyTeaching,
          ),
      ).toBe(false)
      yield* llm.reset

      const writesBeforeZeroWrite = yield* database.db.get(sql`
        SELECT
          (SELECT count(*) FROM advisory_plan_suggestion_revision) AS revisions,
          (SELECT count(*) FROM advisory_plan_suggestion_effect) AS effects,
          (SELECT count(*) FROM advisory_plan_suggestion_commit_seal) AS seals
      `)
      const zeroWriteSessionIDs = yield* Effect.forEach(
        [
          {
            title: "Useful advisory zero-write explanation",
            request: "Explain tail recursion with one concrete call trace; no durable planning update is needed.",
            response:
              "For sum(3, 0), each tail call passes the whole remaining state forward: sum(2, 3), then sum(1, 5), then sum(0, 6). Nothing remains to do while the calls return.",
          },
          {
            title: "Useful advisory zero-write demonstration",
            request: "Demonstrate one breadth-first-search queue update without turning it into a study plan.",
            response:
              "Start with queue [A]. Remove A, then append its unseen neighbors B and C, giving [B, C]. The queue now shows exactly why breadth-first search visits every node one edge farther only after the current layer.",
          },
          {
            title: "Useful advisory zero-write guided work",
            request: "Guide me through the first step of deriving the product rule; do not store planning advice.",
            response:
              "Write (f(x+h)g(x+h)-f(x)g(x))/h, then add and subtract f(x+h)g(x). Which two difference quotients appear after you split the numerator?",
          },
        ],
        (item) =>
          Effect.gen(function* () {
            const sessionID = SessionID.create()
            const turnID = Turn.ID.create()
            const hit = (yield* llm.hits).length
            const pending = yield* llm.pending
            yield* llm.textMatch(
              (request) => providerText(request.body).some((value) => value.includes(item.request)),
              item.response,
            )
            yield* prompt.start({
              sessionID,
              turnID,
              inputID: Turn.InputID.create(),
              messageID: MessageID.ascending(),
              agent: "repa",
              model: ref,
              limits: { model: 1, tool: 1 },
              session: { title: item.title },
              parts: [{ type: "text", text: item.request }],
            })
            expect((yield* prompt.awaitTurn(sessionID, turnID)).terminal).toMatchObject({
              outcome: "completed",
              counters: { model: 1, tool: 0 },
            })
            expect(yield* llm.pending).toBe(pending)
            expect(providerText((yield* llm.hits)[hit]?.body).join("\n")).toContain(
              "Useful planning, explanation, demonstration, and guided work may remain zero-write.",
            )
            const messages = yield* sessions.messages({ sessionID })
            expect(
              messages.flatMap((message) => message.parts).some((part) => part.type === "text" && part.text === item.response),
            ).toBe(true)
            expect(
              messages
                .flatMap((message) => message.parts)
                .some((part) => part.type === "tool" && part.tool === AdvisoryPlanSuggestion.UPDATE_CAPABILITY),
            ).toBe(false)
            return sessionID
          }),
      )
      expect(
        yield* database.db.get(sql`
          SELECT
            (SELECT count(*) FROM advisory_plan_suggestion_revision) AS revisions,
            (SELECT count(*) FROM advisory_plan_suggestion_effect) AS effects,
            (SELECT count(*) FROM advisory_plan_suggestion_commit_seal) AS seals
        `),
      ).toEqual(writesBeforeZeroWrite)

      yield* sessions.remove(creationSessionID)
      yield* sessions.remove(absentSessionID)
      yield* sessions.remove(firstTeachingSessionID)
      yield* sessions.remove(correctionSessionID)
      yield* sessions.remove(correctedTeachingSessionID)
      yield* sessions.remove(wrongRevisionSessionID)
      yield* Effect.forEach(zeroWriteSessionIDs, (sessionID) => sessions.remove(sessionID), { discard: true })
      expect(
        yield* database.db.transaction((tx) =>
          AdvisoryPlanSuggestion.readExactRevision(tx, suggestionID, corrected.revision.id),
        ),
      ).toEqual(corrected.revision)
    }),
  { config: cfg },
  120_000,
)

isolatedDatabaseBoundary.instance(
  "finalizes an admitted FutureAttention A1 claim when its live Turn is interrupted",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const courses = yield* Course.Service
      const events = yield* EventV2Bridge.Service
      yield* database.db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make(dir), sandboxes: [] })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      const base = Math.floor(Date.now() / 1_000) * 1_000
      setSystemTime(new Date(base))
      yield* Effect.addFinalizer(() => Effect.sync(() => setSystemTime()))

      const course = yield* courses.createCourse({ title: "Future-attention interruption" })
      const view = yield* courses.createView({
        courseID: course.id,
        name: "Main",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "barrier", title: "Barrier release condition" }] },
      })
      const item = (yield* courses.listRevisionItems(course.id, view.view.id, view.revision.id)).items[0]
      if (!item) return yield* Effect.die("FutureAttention interruption trace has no exact Course item")
      const dueAt = base + 60_000
      const purpose = "Explain how a barrier releases a waiting cohort"
      const creationRequest = "Remember the exact barrier-release explanation for the next lesson."
      const createInput = {
        operations: [
          {
            type: "create" as const,
            concern: {
              purpose,
              source: {
                type: "interpreted_learner_request" as const,
                excerpt: {
                  text: creationRequest,
                  startByte: 0,
                  endByte: new TextEncoder().encode(creationRequest).byteLength,
                },
              },
              target: {
                endpoint: {
                  courseID: course.id,
                  viewID: view.view.id,
                  revisionID: view.revision.id,
                  itemID: item.itemID,
                },
                selection: { type: "explicit_exact" as const },
              },
              notBefore: {
                sourceExpression: "in the next lesson",
                localDateTime: new Date(dueAt).toISOString().slice(0, 19),
                timeZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
              },
              serviceTiming: "at_or_after_not_before" as const,
            },
          },
        ],
      }
      const creationSessionID = SessionID.create()
      const creationTurnID = Turn.ID.create()
      yield* llm.tool(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, createInput)
      yield* llm.text("The barrier explanation is retained for its due interaction.")
      yield* prompt.start({
        sessionID: creationSessionID,
        turnID: creationTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "FutureAttention interrupted-claim creation",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: creationRequest }],
      })
      expect((yield* prompt.awaitTurn(creationSessionID, creationTurnID)).terminal).toMatchObject({
        outcome: "completed",
      })
      const created = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "list" }, { now: base, limit: 64 }),
      )
      const createdView = created.items.find((value) => "concern" in value && value.concern.payload.purpose === purpose)
      if (!createdView || !("concern" in createdView)) {
        return yield* Effect.die("FutureAttention interruption trace did not create its exact concern")
      }

      setSystemTime(new Date(dueAt + 1))
      const serviceSessionID = SessionID.create()
      const serviceTurnID = Turn.ID.create()
      const explanation =
        "A barrier releases the waiting cohort only after the configured number of participants has arrived."
      const serviceInput = {
        operations: [
          {
            type: "serve" as const,
            concernID: createdView.concern.id,
            expectedVersion: 0,
            service: {
              source: { type: "current_assistant_when_complete" as const },
              rationale: "Only the exact fully committed A1 presentation may serve the retained explanation.",
            },
          },
        ],
      }
      const toolSettled = yield* Deferred.make<SessionV1.PartID>()
      const release = yield* Deferred.make<void>()
      yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined).pipe(Effect.asVoid))
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== TurnEvent.ToolSettled.type) return Effect.void
        const data = event.data as typeof TurnEvent.ToolSettled.data.Type
        if (data.turnID !== serviceTurnID || data.state !== "completed") return Effect.void
        return Deferred.succeed(toolSettled, data.partID).pipe(Effect.andThen(Deferred.await(release)))
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      yield* llm.push(reply().text(explanation).tool(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, serviceInput))
      yield* prompt.start({
        sessionID: serviceSessionID,
        turnID: serviceTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "FutureAttention interrupted A1",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "Continue with the barrier explanation now." }],
      })
      const partID = yield* awaitWithTimeout(
        Deferred.await(toolSettled),
        "A1 completion claim did not reach committed ToolSettled",
        "5 seconds",
      )
      const beforeMessages = yield* sessions.messages({ sessionID: serviceSessionID })
      const claimPart = beforeMessages
        .flatMap((message) => message.parts)
        .find(
          (
            part,
          ): part is SessionV1.ToolPart & {
            state: Extract<SessionV1.ToolPart["state"], { status: "completed" }>
          } =>
            part.id === partID &&
            part.type === "tool" &&
            part.tool === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY &&
            part.state.status === "completed",
        )
      if (!claimPart) return yield* Effect.die("Interrupted A1 omitted its committed claim Tool Part")
      expect(
        beforeMessages
          .flatMap((message) => message.parts)
          .find((part): part is SessionV1.TextPart => part.type === "text" && part.messageID === claimPart.messageID),
      ).toMatchObject({ text: explanation })
      const admission = JSON.parse(claimPart.state.output)
      expect(admission).toMatchObject({
        settlement: { outcome: "applied", claim: { claimStateAtAdmission: "pending", claimState: "pending" } },
      })
      const groupID = admission.settlement.claim.groupID as FutureAttention.ClaimGroupID
      const before = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "claim_group", groupID }, { now: dueAt + 2, limit: 64 }),
      )
      expect(before.items[0]).toMatchObject({
        group: {
          turnID: serviceTurnID,
          assistantMessageID: claimPart.messageID,
          invocationPartID: claimPart.id,
        },
      })
      expect(before.items[0] && "receipt" in before.items[0] ? before.items[0].receipt : undefined).toBeUndefined()
      expect(
        yield* database.db.transaction((tx) =>
          FutureAttention.listPendingClaimGroups(tx, { assistantMessageID: claimPart.messageID }),
        ),
      ).toMatchObject([{ id: groupID }])

      const interrupted = yield* prompt.interruptTurn(serviceSessionID, serviceTurnID)
      expect(interrupted.terminal).toMatchObject({ outcome: "interrupted", reason: "learner_interrupt" })
      const after = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "claim_group", groupID }, { now: dueAt + 3, limit: 64 }),
      )
      expect(after.items[0]).toMatchObject({
        group: {
          turnID: serviceTurnID,
          assistantMessageID: claimPart.messageID,
          invocationPartID: claimPart.id,
        },
        receipt: {
          outcome: "not_served",
          completion: {
            observationCut: "live_presentation_finalized",
            modelOutcome: "completed",
            presentationCommitted: false,
            invocationPartID: claimPart.id,
          },
          members: [
            {
              concernID: createdView.concern.id,
              outcome: "not_served",
              reason: "presentation_uncommitted",
            },
          ],
        },
      })
      const receipt = after.items[0] && "receipt" in after.items[0] ? after.items[0].receipt : undefined
      if (!receipt) return yield* Effect.die("Interrupted A1 omitted its live finalization receipt")
      expect(receipt.completion.eligibleOutputBytes).toBe(0)
      expect(
        yield* database.db.get<{ count: number }>(sql`
          SELECT count(*) AS count FROM future_attention_claim_finalization
          WHERE group_id = ${groupID}
        `),
      ).toEqual({ count: 1 })
      expect(
        yield* database.db.transaction((tx) =>
          FutureAttention.listPendingClaimGroups(tx, { assistantMessageID: claimPart.messageID }),
        ),
      ).toEqual([])
      const terminalClaimPart = (yield* sessions.messages({ sessionID: serviceSessionID }))
        .flatMap((message) => message.parts)
        .find((part): part is SessionV1.ToolPart => part.id === claimPart.id && part.type === "tool")
      if (!terminalClaimPart || terminalClaimPart.state.status !== "completed") {
        return yield* Effect.die("Interrupted A1 rewrote or removed its completed claim Tool Part")
      }
      expect(JSON.parse(terminalClaimPart.state.output)).toEqual(admission)
      const concern = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "concern", concernID: createdView.concern.id }, { now: dueAt + 3 }),
      )
      expect(concern.items[0]).toMatchObject({
        concern: { current: { disposition: "open", version: 0 } },
        claim: { groupID, claimState: "not_served", finalizationReceiptID: receipt.id },
      })
    }),
  { config: cfg },
  60_000,
)

isolatedDatabaseBoundary.instance(
  "keeps a no-output A1 claim terminal when same-input A2 explains and retries",
  () =>
    Effect.gen(function* () {
      const { dir, llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const courses = yield* Course.Service
      yield* database.db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make(dir), sandboxes: [] })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      const base = Math.floor(Date.now() / 1_000) * 1_000
      setSystemTime(new Date(base))
      yield* Effect.addFinalizer(() => Effect.sync(() => setSystemTime()))

      const course = yield* courses.createCourse({ title: "Future-attention no-output continuation" })
      const view = yield* courses.createView({
        courseID: course.id,
        name: "Main",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "mutex", title: "Mutex ownership" }] },
      })
      const item = (yield* courses.listRevisionItems(course.id, view.view.id, view.revision.id)).items[0]
      if (!item) return yield* Effect.die("FutureAttention negative prompt trace has no exact Course item")
      const dueAt = base + 60_000
      const purpose = "Explain why a mutex has one owner at a time"
      const creationRequest = "Remember the exact mutex-ownership explanation for the next lesson."
      const createInput = {
        operations: [
          {
            type: "create" as const,
            concern: {
              purpose,
              source: {
                type: "interpreted_learner_request" as const,
                excerpt: {
                  text: creationRequest,
                  startByte: 0,
                  endByte: new TextEncoder().encode(creationRequest).byteLength,
                },
              },
              target: {
                endpoint: {
                  courseID: course.id,
                  viewID: view.view.id,
                  revisionID: view.revision.id,
                  itemID: item.itemID,
                },
                selection: { type: "explicit_exact" as const },
              },
              notBefore: {
                sourceExpression: "in the next lesson",
                localDateTime: new Date(dueAt).toISOString().slice(0, 19),
                timeZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
              },
              serviceTiming: "at_or_after_not_before" as const,
            },
          },
        ],
      }
      const creationSessionID = SessionID.create()
      const creationTurnID = Turn.ID.create()
      yield* llm.tool(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, createInput)
      yield* llm.text("The later mutex explanation remains available.")
      yield* prompt.start({
        sessionID: creationSessionID,
        turnID: creationTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "FutureAttention negative creation",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: creationRequest }],
      })
      expect((yield* prompt.awaitTurn(creationSessionID, creationTurnID)).terminal).toMatchObject({
        outcome: "completed",
      })
      const created = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "list" }, { now: base, limit: 64 }),
      )
      const createdView = created.items.find((value) => "concern" in value && value.concern.payload.purpose === purpose)
      if (!createdView || !("concern" in createdView)) {
        return yield* Effect.die("Released-v1 negative trace did not create its exact FutureAttention concern")
      }

      setSystemTime(new Date(dueAt + 1))
      const serviceInput = {
        operations: [
          {
            type: "serve" as const,
            concernID: createdView.concern.id,
            expectedVersion: 0,
            service: {
              source: { type: "current_assistant_when_complete" as const },
              rationale: "Only the exact full tool-calling Assistant presentation may supply the mutex explanation.",
            },
          },
        ],
      }
      const changedInput = {
        operations: [
          {
            ...serviceInput.operations[0],
            service: {
              ...serviceInput.operations[0]!.service,
              rationale: "A changed same-occurrence rationale cannot rebind the terminal A1 claim group.",
            },
          },
        ],
      }
      const serviceSessionID = SessionID.create()
      const serviceTurnID = Turn.ID.create()
      const explanation =
        "A mutex permits one owner at a time because acquiring it excludes every other contender until that owner releases it."
      const serviceHits = (yield* llm.hits).length
      yield* llm.tool(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, serviceInput)
      yield* llm.push(reply().text(explanation).tool(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, serviceInput))
      yield* llm.tool(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, changedInput)
      yield* llm.text("The same-input continuation cannot alter the terminal claim bookkeeping.")
      yield* prompt.start({
        sessionID: serviceSessionID,
        turnID: serviceTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 4, tool: 3 },
        session: {
          title: "FutureAttention no-output A1",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "Continue with the mutex explanation now." }],
      })
      expect((yield* prompt.awaitTurn(serviceSessionID, serviceTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 4, tool: 3 },
      })

      const operations = yield* database.db
        .select({
          assistantMessageID: TurnModelOperationTable.assistant_message_id,
          inputID: TurnModelOperationTable.input_id,
          occurrenceID: TurnModelOperationTable.causal_occurrence_id,
        })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, serviceTurnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      expect(operations).toHaveLength(4)
      expect(new Set(operations.map((operation) => operation.inputID)).size).toBe(1)
      expect(new Set(operations.map((operation) => operation.occurrenceID)).size).toBe(1)
      const a1 = operations[0]?.assistantMessageID
      const a2 = operations[1]?.assistantMessageID
      const a3 = operations[2]?.assistantMessageID
      if (!a1 || !a2 || !a3) return yield* Effect.die("Negative FutureAttention trace omitted A1, A2, or A3")

      const toolParts = (yield* sessions.messages({ sessionID: serviceSessionID }))
        .flatMap((message) => message.parts)
        .filter(
          (
            part,
          ): part is SessionV1.ToolPart & {
            state: Extract<SessionV1.ToolPart["state"], { status: "completed" }>
          } =>
            part.type === "tool" &&
            part.tool === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY &&
            part.state.status === "completed",
        )
      const a1Part = toolParts.find((part) => part.messageID === a1)
      const a2Part = toolParts.find((part) => part.messageID === a2)
      const a3Part = toolParts.find((part) => part.messageID === a3)
      if (!a1Part || !a2Part || !a3Part) {
        return yield* Effect.die("Negative FutureAttention trace omitted a terminal claim Tool Part")
      }
      const admission = JSON.parse(a1Part.state.output)
      expect(admission).toMatchObject({
        settlement: { outcome: "applied", claim: { claimStateAtAdmission: "pending", claimState: "pending" } },
      })
      const groupID = admission.settlement.claim.groupID as FutureAttention.ClaimGroupID
      expect(JSON.parse(a2Part.state.output)).toMatchObject({
        settlement: {
          outcome: "already_applied",
          claim: { groupID, claimStateAtAdmission: "pending", claimState: "not_served" },
        },
      })
      expect(JSON.parse(a3Part.state.output)).toMatchObject({
        settlement: { outcome: "error", code: "semantic_conflict" },
      })
      expect(JSON.parse(a1Part.state.output)).toEqual(admission)
      const a2Block = providerText((yield* llm.hits)[serviceHits + 1]?.body).find((value) =>
        value.includes("[Repa learning context — protected]"),
      )
      if (!a2Block) return yield* Effect.die("Negative FutureAttention A2 request omitted Learning Context")
      expect(a2Block).toContain(purpose)

      const group = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "claim_group", groupID }, { now: dueAt + 2, limit: 64 }),
      )
      expect(group.items[0]).toMatchObject({
        group: { assistantMessageID: a1, modelOperationID: a1, invocationPartID: a1Part.id },
        receipt: {
          outcome: "not_served",
          completion: {
            assistantMessageID: a1,
            modelOperationID: a1,
            invocationPartID: a1Part.id,
            presentationCommitted: true,
            eligibleOutputBytes: 0,
          },
          members: [{ concernID: createdView.concern.id, outcome: "not_served", reason: "no_eligible_output" }],
        },
      })
      const receipt = group.items[0] && "receipt" in group.items[0] ? group.items[0].receipt : undefined
      if (!receipt) return yield* Effect.die("Negative FutureAttention trace omitted its finalization receipt")
      expect(
        yield* database.db.get<{ count: number }>(sql`
          SELECT count(*) AS count FROM future_attention_claim_group
          WHERE turn_id = ${serviceTurnID}
        `),
      ).toEqual({ count: 1 })
      expect(
        yield* database.db.get<{ count: number }>(sql`
          SELECT count(*) AS count FROM future_attention_claim_finalization
          WHERE group_id = ${groupID}
        `),
      ).toEqual({ count: 1 })
      const concern = yield* database.db.transaction((tx) =>
        FutureAttention.read(tx, { type: "concern", concernID: createdView.concern.id }, { now: dueAt + 2 }),
      )
      expect(concern.items[0]).toMatchObject({
        concern: { current: { disposition: "open", version: 0 } },
        claim: { groupID, claimState: "not_served", finalizationReceiptID: receipt.id },
      })
    }),
  { config: cfg },
  60_000,
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
