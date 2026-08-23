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
import { and, eq, gt, inArray, sql } from "drizzle-orm"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { expect, setSystemTime, test } from "bun:test"
import { Cause, DateTime, Deferred, Duration, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { testRender } from "@opentui/solid"
import { createComponent } from "solid-js"
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
  MessageTable,
  PartTable,
  SessionMessageTable,
  SessionTable,
} from "@opencode-ai/core/session/sql"
import { SessionPresentation } from "@opencode-ai/core/session-presentation"
import {
  SessionAdministrativeHistoryEmbeddedPartTable,
  SessionAdministrativeHistoryMessageTable,
  SessionAdministrativeHistoryPartTable,
  SessionAdministrativeHistoryTable,
  SessionPresentationFrontierTable,
} from "@opencode-ai/core/session-presentation/sql"
import { SessionDeletion } from "@opencode-ai/core/session-deletion"
import { SessionDeletionControlReceiptTable } from "@opencode-ai/core/session-deletion/sql"
import { LearnerHomeIdentity } from "@opencode-ai/core/database/identity"
import { TurnLearningContextCutTable } from "@opencode-ai/core/learning-context/sql"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { SessionCompaction } from "../../src/session/compaction"
import { SessionSummary } from "../../src/session/summary"
import { Instruction } from "../../src/session/instruction"
import { SessionProcessor } from "../../src/session/processor"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionRevert } from "../../src/session/revert"
import { SessionImportHistory } from "../../src/session/import-history"
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
import { TestInstance, tmpdir, tmpdirScoped } from "../fixture/fixture"
import { materializeTestSession } from "../fixture/session"
import { admitModelWithLearningContext } from "../fixture/model-admission"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"
import { httpError, reply, TestLLMServer } from "../lib/llm-server"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { LocationServiceMap, locationServiceMapLayer } from "@opencode-ai/core/location-services"
import { InstanceStore } from "@/project/instance-store"
import { InstanceBootstrap } from "@/project/bootstrap-service"
import { InstanceState } from "@/effect/instance-state"
import { TestConsole } from "effect/testing"
import { LearningCommand, Occurrence } from "@opencode-ai/core/learning-command"
import { LearnerAdmission } from "@opencode-ai/core/learning-command/occurrence-schema"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { LearningInspectionCursor } from "@opencode-ai/core/learning-inspection-cursor-schema"
import { LearningInspectionSchema } from "@opencode-ai/core/learning-inspection-schema"
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { FutureAttention } from "@opencode-ai/core/future-attention"
import { Assignment } from "@opencode-ai/core/assignment"
import { LearnerStateJudgment } from "@opencode-ai/core/learner-state-judgment"
import { AdvisoryPlanSuggestion } from "@opencode-ai/core/advisory-plan-suggestion"
import {
  AdmittedLearnerOccurrenceTable,
  LearnerOccurrenceSourceOrderTable,
} from "@opencode-ai/core/learning-command/occurrence.sql"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import {
  TurnInputTable,
  TurnModelOperationTable,
  TurnTable,
  TurnToolCandidateTable,
  TurnUnavailableSourceTable,
} from "@opencode-ai/core/turn/sql"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { TurnLearningContext } from "@opencode-ai/core/turn/learning-context"
import { Turn } from "@opencode-ai/schema/turn"
import { Project } from "@opencode-ai/schema/project"
import { TurnEvent } from "@opencode-ai/schema/turn-event"
import { entryBody } from "@/cli/cmd/run/entry.body"
import { toolInlineInfo } from "@/cli/cmd/run/tool"
import { PlanExitTool } from "@/tool/plan"
import type { StreamCommit } from "@/cli/cmd/run/types"
import type { ToolPart as SDKToolPart, TurnInfo as SDKTurnInfo } from "@opencode-ai/sdk/v2"
import {
  LearningInspectionExhaustionContent,
  LearningInspectionToolContent,
} from "../../../tui/src/component/learning-inspection"

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

const learningDomainPrefixes = [
  "artifact",
  "course",
  "learning_course_material",
  "learner_default_course",
  "learner_course_route",
  "learner_goal",
  "learner_response_evidence",
  "material",
  "retained_steering",
  "future_attention",
  "assignment",
  "learner_state_judgment",
  "advisory_plan_suggestion",
] as const

function learningDomainDigest(db: Database.Interface["db"]) {
  return Effect.gen(function* () {
    const tables = (yield* db
      .all(
        sql`
          SELECT name FROM sqlite_schema
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `,
      )
      .pipe(Effect.orDie)) as Array<{ name: string }>
    return Object.fromEntries(
      yield* Effect.forEach(
        tables
          .map((table) => table.name)
          .filter(
            (name) =>
              name !== "retained_steering_state" &&
              learningDomainPrefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}_`)),
          ),
        (name) =>
          db.all(sql.raw(`SELECT * FROM "${name.replaceAll('"', '""')}"`)).pipe(
            Effect.orDie,
            Effect.map((rows) => {
              const canonical = rows
                .map((row) => JSON.stringify(row))
                .toSorted()
                .join("\n")
              return [
                name,
                {
                  count: rows.length,
                  fingerprint: new Bun.CryptoHasher("sha256").update(canonical).digest("hex"),
                },
              ] as const
            }),
          ),
        { concurrency: 1 },
      ),
    )
  })
}

function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
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

function makeProcessRestartBoundary(filename: string) {
  return LayerNode.compile(LayerNode.group([promptRoot, testLLMServerNode, InstanceStore.node]), [
    [SessionSummary.node, summary],
    [LSP.node, lsp],
    [MCP.node, makeMcp()],
    [RuntimeFlags.node, runtimeFlags],
    [Database.node, Database.runtimeLayerFromPath(filename).pipe(Layer.orDie)],
    [
      InstanceStore.bootstrapNode,
      Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void })),
    ],
  ])
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

noLLMServer.instance("plan exit asks before appending its strict-successor User presentation", () =>
  Effect.gen(function* () {
    const created = yield* materializeTestSession({ agent: "plan" })
    const session = yield* Session.Service
    const question = yield* Question.Service
    const definition = yield* PlanExitTool
    const tool = yield* definition.init()
    const before = yield* session.messages({ sessionID: created.info.id })
    const fiber = yield* tool
      .execute(
        {},
        {
          sessionID: created.info.id,
          messageID: created.user.id,
          callID: "plan-exit-success",
          agent: "plan",
          abort: AbortSignal.any([]),
          messages: before,
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )
      .pipe(Effect.forkScoped)
    const pending = yield* pollWithTimeout(
      question.list().pipe(Effect.map((items) => items[0])),
      "plan exit did not ask for learner approval",
    )
    yield* question.reply({ requestID: pending.id, answers: [["Yes"]] })
    const result = yield* Fiber.join(fiber)
    const after = yield* session.messages({ sessionID: created.info.id })

    expect(result.title).toBe("Returning to the Repa profile")
    expect(after).toHaveLength(before.length + 1)
    expect(after.at(-1)?.info.role).toBe("user")
    expect(after.at(-1)?.info.time.created).toBeGreaterThan(before.at(-1)!.info.time.created)
    expect(after.at(-1)?.parts[0]).toMatchObject({
      type: "text",
      synthetic: true,
      text: expect.stringContaining("has been approved"),
    })
  }),
)

noLLMServer.instance("plan exit refuses an exhausted presentation frontier before asking", () =>
  Effect.gen(function* () {
    const created = yield* materializeTestSession({ agent: "plan" })
    const database = yield* Database.Service
    const session = yield* Session.Service
    const question = yield* Question.Service
    const events = yield* EventV2Bridge.Service
    let asked = 0
    const off = yield* events.listen((event) =>
      Effect.sync(() => {
        if (event.type === Question.Event.Asked.type) asked++
      }),
    )
    yield* Effect.addFinalizer(() => off)
    const before = yield* session.messages({ sessionID: created.info.id })
    yield* database.db
      .update(SessionPresentationFrontierTable)
      .set({ frontier_time: Number.MAX_SAFE_INTEGER })
      .where(eq(SessionPresentationFrontierTable.session_id, created.info.id))
      .run()
      .pipe(Effect.orDie)

    const definition = yield* PlanExitTool
    const tool = yield* definition.init()
    const exit = yield* awaitWithTimeout(
      tool
        .execute(
          {},
          {
            sessionID: created.info.id,
            messageID: created.user.id,
            callID: "plan-exit-frontier",
            agent: "plan",
            abort: AbortSignal.any([]),
            messages: before,
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )
        .pipe(Effect.exit),
      "plan exit did not reject the exhausted presentation frontier",
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(SessionPresentation.FrontierUnrepresentableError)
    }
    expect(yield* question.list()).toEqual([])
    expect(asked).toBe(0)
    expect(yield* session.messages({ sessionID: created.info.id })).toEqual(before)
  }),
)

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

const runningModelCrashFixture = fileURLToPath(new URL("../fixture/running-model-crash.ts", import.meta.url))

type RunningModelCrashSeed = {
  readonly sessionID: SessionID
  readonly turnID: Turn.ID
  readonly inputID: Turn.InputID
  readonly userMessageID: MessageID
  readonly assistantMessageID: MessageID
  readonly eventSequence: number
  readonly modelOperationState: "running"
  readonly contextFingerprint: string
  readonly rendererVersion: 7
}

async function processOrphan(filename: string, directory: string) {
  const child = Bun.spawn([process.execPath, "run", "--conditions=browser", runningModelCrashFixture, "seed"], {
    cwd: directory,
    env: {
      ...process.env,
      HOME: directory,
      XDG_CONFIG_HOME: path.join(directory, ".config"),
      XDG_DATA_HOME: path.join(directory, ".local/share"),
      XDG_STATE_HOME: path.join(directory, ".local/state"),
      XDG_CACHE_HOME: path.join(directory, ".cache"),
      REPA_TEST_HOME: directory,
      REPA_DB: filename,
      REPA_CONFIG_CONTENT: JSON.stringify({ $schema: "https://opencode.ai/config.json", ...cfg }),
      REPA_DISABLE_PROJECT_CONFIG: "1",
      REPA_DISABLE_MODELS_FETCH: "1",
      REPA_DISABLE_AUTOCOMPACT: "1",
      REPA_AUTH_CONTENT: "{}",
      REPA_PURE: "1",
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  const reader = child.stdout.getReader()
  const decoder = new TextDecoder()
  let buffered = ""
  let locked = true
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const seed = await Promise.race([
      (async () => {
        while (true) {
          const next = await reader.read()
          if (next.done) throw new Error("Crash fixture exited before publishing its durable ready record")
          buffered += decoder.decode(next.value, { stream: true })
          const lines = buffered.split(/\r?\n/)
          buffered = lines.pop() ?? ""
          const line = lines.find((value) => value.startsWith("REPA_RUNNING_MODEL_READY "))
          if (line)
            return { line, seed: JSON.parse(line.slice("REPA_RUNNING_MODEL_READY ".length)) as RunningModelCrashSeed }
        }
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Crash fixture did not become ready within 20 seconds")), 20_000)
      }),
    ])
    if (timeout) clearTimeout(timeout)
    reader.releaseLock()
    locked = false
    child.kill()
    const exitCode = await child.exited
    const stderr = await new Response(child.stderr).text()
    if (exitCode === 0) throw new Error(`Crash fixture exited normally instead of losing its owner\n${stderr}`)
    return { ...seed, exitCode, stderr }
  } catch (error) {
    if (timeout) clearTimeout(timeout)
    if (locked) reader.releaseLock()
    if (child.exitCode === null) child.kill()
    await child.exited
    const stderr = await new Response(child.stderr).text()
    throw new Error(`Could not seed the process-orphaned model operation\n${stderr}`, { cause: error })
  }
}

async function retainDatabaseFamily(filename: string, directory: string, stem: string) {
  return Promise.all(
    ["", "-wal", "-shm"].map(async (suffix) => {
      const source = Bun.file(`${filename}${suffix}`)
      const target = path.join(directory, `${stem}.db${suffix}`)
      if (!(await source.exists())) return { suffix, state: "absent" as const }
      const bytes = new Uint8Array(await source.arrayBuffer())
      await Bun.write(target, bytes)
      return {
        suffix,
        state: "present" as const,
        path: target,
        byteLength: bytes.byteLength,
        sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      }
    }),
  )
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
  "direct shell reserves its complete presentation block before running the command",
  () =>
    Effect.gen(function* () {
      const { directory } = yield* TestInstance
      const { prompt, sessions, chat } = yield* boot({ title: "shell frontier refusal" })
      const database = yield* Database.Service
      const marker = path.join(directory, "shell-frontier-command-ran")
      const before = yield* sessions.messages({ sessionID: chat.id })
      yield* database.db
        .update(SessionPresentationFrontierTable)
        .set({ frontier_time: Number.MAX_SAFE_INTEGER - 1 })
        .where(eq(SessionPresentationFrontierTable.session_id, chat.id))
        .run()
        .pipe(Effect.orDie)

      const refused = yield* prompt
        .shell({
          sessionID: chat.id,
          agent: "repa",
          model: ref,
          command: `bun -e "await Bun.write(process.argv[1], 'ran')" ${JSON.stringify(marker)}`,
        })
        .pipe(Effect.exit)

      expect(Exit.isFailure(refused)).toBe(true)
      if (Exit.isFailure(refused)) {
        expect(Cause.squash(refused.cause)).toBeInstanceOf(SessionPresentation.FrontierUnrepresentableError)
      }
      expect(yield* sessions.messages({ sessionID: chat.id })).toEqual(before)
      expect(yield* Effect.promise(() => Bun.file(marker).exists())).toBe(false)
      expect(
        yield* database.db
          .select({
            frontierTime: SessionPresentationFrontierTable.frontier_time,
            messageCount: SessionPresentationFrontierTable.message_count,
          })
          .from(SessionPresentationFrontierTable)
          .where(eq(SessionPresentationFrontierTable.session_id, chat.id))
          .get()
          .pipe(Effect.orDie),
      ).toEqual({ frontierTime: Number.MAX_SAFE_INTEGER - 1, messageCount: before.length })
    }),
  { config: cfg },
)

noLLMServer.instance(
  "direct shell appends after a future presentation frontier and advances it for later writers",
  () =>
    Effect.gen(function* () {
      const { prompt, sessions, chat } = yield* boot({ title: "future shell frontier" })
      const database = yield* Database.Service
      const before = yield* sessions.messages({ sessionID: chat.id })
      const futureFrontier = Date.now() + 60_000
      yield* database.db
        .update(SessionPresentationFrontierTable)
        .set({ frontier_time: futureFrontier })
        .where(eq(SessionPresentationFrontierTable.session_id, chat.id))
        .run()
        .pipe(Effect.orDie)

      const firstUserMessageID = MessageID.ascending()
      const first = yield* prompt.shell({
        sessionID: chat.id,
        messageID: firstUserMessageID,
        agent: "repa",
        model: ref,
        command: "echo frontier-shell-one",
      })
      const secondUserMessageID = MessageID.ascending()
      const second = yield* prompt.shell({
        sessionID: chat.id,
        messageID: secondUserMessageID,
        agent: "repa",
        model: ref,
        command: "echo frontier-shell-two",
      })
      const stored = yield* sessions.messages({ sessionID: chat.id })
      const appended = stored.slice(before.length)

      expect(appended.map((message) => message.info.id)).toEqual([
        firstUserMessageID,
        first.info.id,
        secondUserMessageID,
        second.info.id,
      ])
      expect(appended.map((message) => message.info.time.created)).toEqual([
        futureFrontier + 1,
        futureFrontier + 2,
        futureFrontier + 3,
        futureFrontier + 4,
      ])
      expect(
        first.parts[0]?.type === "tool" && first.parts[0].state.status === "completed"
          ? first.parts[0].state.output
          : "",
      ).toContain("frontier-shell-one")
      expect(
        second.parts[0]?.type === "tool" && second.parts[0].state.status === "completed"
          ? second.parts[0].state.output
          : "",
      ).toContain("frontier-shell-two")
      expect(
        yield* database.db
          .select({
            frontierTime: SessionPresentationFrontierTable.frontier_time,
            messageCount: SessionPresentationFrontierTable.message_count,
          })
          .from(SessionPresentationFrontierTable)
          .where(eq(SessionPresentationFrontierTable.session_id, chat.id))
          .get()
          .pipe(Effect.orDie),
      ).toEqual({ frontierTime: futureFrontier + 4, messageCount: before.length + 4 })
    }),
  { config: cfg },
)

it.instance(
  "same-home import copy reidentifies a closed history graph and exact-replays its genuine learner Turn",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const database = yield* Database.Service
      const sessions = yield* Session.Service
      const prompt = yield* SessionPrompt.Service
      const revert = yield* SessionRevert.Service
      const { directory } = yield* TestInstance
      const sourceDatabaseID = yield* database.db.transaction(LearnerHomeIdentity.read).pipe(Effect.orDie)
      const sourceSessionID = SessionID.create()
      const sourceUserID = MessageID.ascending()
      const sourceAssistantID = MessageID.ascending()
      const sourceCompactionID = MessageID.ascending()
      const sourceSummaryID = MessageID.ascending()
      const sourceUserTextID = PartID.ascending()
      const sourceStepStartID = PartID.ascending()
      const sourceToolID = PartID.ascending()
      const sourceAttachmentID = PartID.ascending()
      const sourcePatchID = PartID.ascending()
      const sourceStepFinishID = PartID.ascending()
      const sourceCompactionPartID = PartID.ascending()
      const sourceSummaryTextID = PartID.ascending()
      const sourceTime = Date.now() + 60_000
      const decoded = yield* SessionImportHistory.decode(
        JSON.stringify({
          type: "repa_session_offline_history",
          schemaVersion: 1,
          sourceDatabaseID,
          info: {
            id: sourceSessionID,
            slug: "copy-source",
            projectID: "source-project",
            directory: "/source/project",
            title: "Closed copy source",
            version: "1",
            time: { created: sourceTime, updated: sourceTime + 5 },
          },
          messages: [
            {
              info: {
                id: sourceUserID,
                sessionID: sourceSessionID,
                role: "user",
                time: { created: sourceTime },
                agent: "repa",
                model: { providerID: "test", modelID: "test-model" },
              },
              parts: [
                {
                  id: sourceUserTextID,
                  sessionID: sourceSessionID,
                  messageID: sourceUserID,
                  type: "text",
                  text: "future-dated imported learner history",
                },
              ],
            },
            {
              info: {
                id: sourceAssistantID,
                sessionID: sourceSessionID,
                parentID: sourceUserID,
                role: "assistant",
                mode: "repa",
                agent: "repa",
                cost: 0,
                path: { cwd: "/source/project", root: "/source/project" },
                time: { created: sourceTime + 1, completed: sourceTime + 2 },
                finish: "stop",
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                providerID: "test",
                modelID: "test-model",
              },
              parts: [
                {
                  id: sourceStepStartID,
                  sessionID: sourceSessionID,
                  messageID: sourceAssistantID,
                  type: "step-start",
                  snapshot: "source-step-snapshot",
                },
                {
                  id: sourceToolID,
                  sessionID: sourceSessionID,
                  messageID: sourceAssistantID,
                  type: "tool",
                  tool: "read",
                  callID: "call-copy-source",
                  state: {
                    status: "completed",
                    input: { filePath: "/source/project/lesson.txt" },
                    output: "historical tool output",
                    title: "Historical read",
                    metadata: {},
                    time: { start: sourceTime + 1, end: sourceTime + 2 },
                    attachments: [
                      {
                        id: sourceAttachmentID,
                        sessionID: sourceSessionID,
                        messageID: sourceAssistantID,
                        type: "file",
                        mime: "text/plain",
                        filename: "lesson.txt",
                        url: "data:text/plain,historical",
                      },
                    ],
                  },
                },
                {
                  id: sourcePatchID,
                  sessionID: sourceSessionID,
                  messageID: sourceAssistantID,
                  type: "patch",
                  hash: "source-patch-hash",
                  files: ["lesson.txt"],
                },
                {
                  id: sourceStepFinishID,
                  sessionID: sourceSessionID,
                  messageID: sourceAssistantID,
                  type: "step-finish",
                  reason: "stop",
                  snapshot: "source-step-finished-snapshot",
                  cost: 0,
                  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                },
              ],
            },
            {
              info: {
                id: sourceCompactionID,
                sessionID: sourceSessionID,
                role: "user",
                time: { created: sourceTime + 3 },
                agent: "repa",
                model: { providerID: "test", modelID: "test-model" },
              },
              parts: [
                {
                  id: sourceCompactionPartID,
                  sessionID: sourceSessionID,
                  messageID: sourceCompactionID,
                  type: "compaction",
                  auto: true,
                  tail_start_id: sourceUserID,
                  capacity_history: {
                    source_assistant_message_id: sourceAssistantID,
                    removable_message_count: 2,
                    removable_message_ids_fingerprint: "a".repeat(64),
                  },
                },
              ],
            },
            {
              info: {
                id: sourceSummaryID,
                sessionID: sourceSessionID,
                parentID: sourceCompactionID,
                role: "assistant",
                mode: "repa",
                agent: "repa",
                cost: 0,
                path: { cwd: "/source/project", root: "/source/project" },
                time: { created: sourceTime + 4, completed: sourceTime + 5 },
                finish: "stop",
                summary: true,
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                providerID: "test",
                modelID: "test-model",
              },
              parts: [
                {
                  id: sourceSummaryTextID,
                  sessionID: sourceSessionID,
                  messageID: sourceSummaryID,
                  type: "text",
                  text: "historical compaction summary",
                },
              ],
            },
          ],
        }),
      )
      const proposal = yield* SessionImportHistory.prepareCopyProposal({
        decoded,
        prompt: "Continue this history as a fresh learner Turn",
      })
      expect(proposal.partMapping).toHaveLength(8)
      yield* llm.text("Fresh local response after copied history.")
      const copied = yield* SessionImportHistory.copy({
        decoded,
        proposal,
        prompt: "Continue this history as a fresh learner Turn",
        sourceStillMatches: Effect.succeed(true),
      })
      const terminal = copied.turn.terminal
        ? copied.turn
        : yield* prompt.awaitTurn(proposal.targetSessionID, proposal.turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })

      const messageMap = new Map(proposal.messageMapping.map((entry) => [entry.source, entry.target] as const))
      const partMap = new Map(proposal.partMapping.map((entry) => [entry.source, entry.target] as const))
      const targetUserID = messageMap.get(sourceUserID)
      const targetAssistantID = messageMap.get(sourceAssistantID)
      const targetToolID = partMap.get(sourceToolID)
      const targetAttachmentID = partMap.get(sourceAttachmentID)
      const targetCompactionPartID = partMap.get(sourceCompactionPartID)
      if (!targetUserID || !targetAssistantID || !targetToolID || !targetAttachmentID || !targetCompactionPartID) {
        return yield* Effect.die("Expected the copy proposal to map every referenced identity")
      }
      const copiedMessages = yield* sessions.messages({ sessionID: proposal.targetSessionID })
      const importedMessages = copiedMessages.slice(0, 4)
      expect(importedMessages.map((message) => message.info.id)).toEqual(
        proposal.messageMapping.map((entry) => entry.target),
      )
      expect(importedMessages.map((message) => message.info.time.created)).toEqual([
        proposal.historyStartTime,
        proposal.historyStartTime + 1,
        proposal.historyStartTime + 2,
        proposal.historyStartTime + 3,
      ])
      const importedAssistant = importedMessages[1]
      const importedCompaction = importedMessages[2]
      if (importedAssistant?.info.role !== "assistant" || !importedCompaction) {
        return yield* Effect.die("Expected copied Assistant and compaction presentations")
      }
      expect(importedAssistant.info.parentID).toBe(targetUserID)
      const copiedTool = importedAssistant.parts.find((part) => part.id === targetToolID)
      if (copiedTool?.type !== "tool" || copiedTool.state.status !== "completed") {
        return yield* Effect.die("Expected copied terminal Tool presentation")
      }
      expect(copiedTool.state.attachments?.[0]).toMatchObject({
        id: targetAttachmentID,
        sessionID: proposal.targetSessionID,
        messageID: targetAssistantID,
      })
      expect(
        yield* database.db
          .select()
          .from(SessionAdministrativeHistoryEmbeddedPartTable)
          .where(eq(SessionAdministrativeHistoryEmbeddedPartTable.part_id, targetAttachmentID))
          .get()
          .pipe(Effect.orDie),
      ).toMatchObject({
        session_id: proposal.targetSessionID,
        message_id: targetAssistantID,
        parent_part_id: targetToolID,
        part_id: targetAttachmentID,
        embedded_ordinal: 0,
      })
      const reusedNestedIdentity = yield* sessions
        .updatePart({
          id: targetAttachmentID,
          sessionID: proposal.targetSessionID,
          messageID: proposal.learnerMessageID,
          type: "file",
          mime: "text/plain",
          filename: "must-not-reuse.txt",
          url: "data:text/plain,blocked",
        })
        .pipe(Effect.exit)
      expect(Exit.isFailure(reusedNestedIdentity)).toBe(true)
      if (Exit.isFailure(reusedNestedIdentity)) {
        expect(Cause.squash(reusedNestedIdentity.cause)).toBeInstanceOf(
          SessionPresentation.AdministrativeHistoryIntegrityError,
        )
      }
      const copiedCompaction = importedCompaction.parts.find((part) => part.id === targetCompactionPartID)
      if (copiedCompaction?.type !== "compaction") {
        return yield* Effect.die("Expected copied compaction presentation")
      }
      expect(copiedCompaction).toMatchObject({
        tail_start_id: targetUserID,
        capacity_history: { source_assistant_message_id: targetAssistantID },
      })
      expect(copiedMessages[4]?.info).toMatchObject({
        id: proposal.learnerMessageID,
        role: "user",
        time: { created: proposal.learnerPresentationTime },
      })
      expect(copiedMessages[5]?.info.time.created).toBeGreaterThan(proposal.learnerPresentationTime)

      const sealed = yield* database.db
        .select()
        .from(SessionAdministrativeHistoryTable)
        .where(eq(SessionAdministrativeHistoryTable.session_id, proposal.targetSessionID))
        .get()
        .pipe(Effect.orDie)
      expect(sealed).toMatchObject({
        kind: "local_import_copy",
        source_file_fingerprint: decoded.sourceFileFingerprint,
        message_count: 4,
        part_count: 8,
        imported_revert_absent: true,
      })
      expect(
        yield* database.db
          .select({
            id: SessionAdministrativeHistoryMessageTable.message_id,
            sourceTime: SessionAdministrativeHistoryMessageTable.source_time_created,
          })
          .from(SessionAdministrativeHistoryMessageTable)
          .where(eq(SessionAdministrativeHistoryMessageTable.session_id, proposal.targetSessionID))
          .orderBy(SessionAdministrativeHistoryMessageTable.ordinal)
          .all()
          .pipe(Effect.orDie),
      ).toEqual(
        proposal.messageMapping.map((entry, index) => ({
          id: entry.target,
          sourceTime: decoded.bundle.messages[index]!.info.time.created,
        })),
      )
      expect(
        yield* database.db
          .select({ id: SessionAdministrativeHistoryPartTable.part_id })
          .from(SessionAdministrativeHistoryPartTable)
          .where(eq(SessionAdministrativeHistoryPartTable.session_id, proposal.targetSessionID))
          .all()
          .pipe(Effect.orDie),
      ).toHaveLength(7)
      expect(
        yield* database.db
          .select({ id: TurnTable.id })
          .from(TurnTable)
          .where(eq(TurnTable.session_id, proposal.targetSessionID))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([{ id: proposal.turnID }])
      expect(
        yield* database.db
          .select({ id: TurnInputTable.id })
          .from(TurnInputTable)
          .where(eq(TurnInputTable.session_id, proposal.targetSessionID))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([{ id: proposal.inputID }])
      expect(
        yield* database.db
          .select({ messageID: AdmittedLearnerOccurrenceTable.origin_message_id })
          .from(AdmittedLearnerOccurrenceTable)
          .where(eq(AdmittedLearnerOccurrenceTable.origin_session_id, proposal.targetSessionID))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([{ messageID: proposal.learnerMessageID }])
      const mappedMessageIDs = proposal.messageMapping.map((entry) => entry.target)
      expect(
        yield* database.db
          .select({ id: TurnModelOperationTable.assistant_message_id })
          .from(TurnModelOperationTable)
          .where(inArray(TurnModelOperationTable.assistant_message_id, mappedMessageIDs))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([])
      expect(
        yield* database.db
          .select({ id: TurnLearningContextCutTable.assistant_message_id })
          .from(TurnLearningContextCutTable)
          .where(inArray(TurnLearningContextCutTable.assistant_message_id, mappedMessageIDs))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([])
      expect(
        yield* database.db
          .select({ id: MessageTable.id })
          .from(MessageTable)
          .where(inArray(MessageTable.id, [sourceUserID, sourceAssistantID, sourceCompactionID, sourceSummaryID]))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([])
      expect(yield* sessions.get(proposal.targetSessionID)).toMatchObject({
        id: proposal.targetSessionID,
        parentID: undefined,
        revert: undefined,
      })

      const sentinel = path.join(directory, "lesson.txt")
      yield* Effect.promise(() => Bun.write(sentinel, "unchanged copied worktree"))
      for (const message of importedMessages) {
        const refused = yield* revert
          .revert({ sessionID: proposal.targetSessionID, messageID: message.info.id })
          .pipe(Effect.exit)
        expect(Exit.isFailure(refused)).toBe(true)
        if (Exit.isFailure(refused)) {
          expect(Cause.squash(refused.cause)).toBeInstanceOf(
            SessionPresentation.HistoricalPresentationNotRevertibleError,
          )
        }
        for (const part of message.parts) {
          const partRefused = yield* revert
            .revert({ sessionID: proposal.targetSessionID, messageID: message.info.id, partID: part.id })
            .pipe(Effect.exit)
          expect(Exit.isFailure(partRefused)).toBe(true)
          if (Exit.isFailure(partRefused)) {
            expect(Cause.squash(partRefused.cause)).toBeInstanceOf(
              SessionPresentation.HistoricalPresentationNotRevertibleError,
            )
          }
        }
      }
      expect(yield* Effect.promise(() => Bun.file(sentinel).text())).toBe("unchanged copied worktree")
      expect((yield* sessions.get(proposal.targetSessionID)).revert).toBeUndefined()
      expect(yield* sessions.messages({ sessionID: proposal.targetSessionID })).toEqual(copiedMessages)

      const replay = yield* SessionImportHistory.copy({
        decoded,
        proposal,
        prompt: "Continue this history as a fresh learner Turn",
        sourceStillMatches: Effect.succeed(true),
      })
      expect(replay.sessionID).toBe(copied.sessionID)
      expect(replay.turn).toEqual(terminal)
      expect(yield* llm.calls).toBe(1)
      expect(yield* sessions.messages({ sessionID: proposal.targetSessionID })).toEqual(copiedMessages)

      const changedSourceProposal = yield* SessionImportHistory.prepareCopyProposal({
        decoded,
        prompt: "Refuse this copy because its validated file changed",
      })
      const changedSource = yield* SessionImportHistory.copy({
        decoded,
        proposal: changedSourceProposal,
        prompt: "Refuse this copy because its validated file changed",
        sourceStillMatches: Effect.succeed(false),
      }).pipe(Effect.exit)
      expect(Exit.isFailure(changedSource)).toBe(true)
      if (Exit.isFailure(changedSource)) {
        expect(Cause.squash(changedSource.cause)).toBeInstanceOf(SessionImportHistory.SourceChangedError)
      }
      expect(
        yield* database.db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(eq(SessionTable.id, changedSourceProposal.targetSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()

      const racedSourceProposal = yield* SessionImportHistory.prepareCopyProposal({
        decoded,
        prompt: "Refuse this copy because its source changed at the transactional recheck",
      })
      let sourceChecks = 0
      const racedSource = yield* SessionImportHistory.copy({
        decoded,
        proposal: racedSourceProposal,
        prompt: "Refuse this copy because its source changed at the transactional recheck",
        sourceStillMatches: Effect.sync(() => ++sourceChecks === 1),
      }).pipe(Effect.exit)
      expect(sourceChecks).toBe(2)
      expect(Exit.isFailure(racedSource)).toBe(true)
      if (Exit.isFailure(racedSource)) {
        expect(Cause.squash(racedSource.cause)).toBeInstanceOf(SessionImportHistory.SourceChangedError)
      }
      expect(
        yield* Effect.all({
          session: database.db
            .select({ id: SessionTable.id })
            .from(SessionTable)
            .where(eq(SessionTable.id, racedSourceProposal.targetSessionID))
            .get()
            .pipe(Effect.orDie),
          history: database.db
            .select({ id: SessionAdministrativeHistoryTable.session_id })
            .from(SessionAdministrativeHistoryTable)
            .where(eq(SessionAdministrativeHistoryTable.session_id, racedSourceProposal.targetSessionID))
            .get()
            .pipe(Effect.orDie),
          turn: database.db
            .select({ id: TurnTable.id })
            .from(TurnTable)
            .where(eq(TurnTable.id, racedSourceProposal.turnID))
            .get()
            .pipe(Effect.orDie),
        }),
      ).toEqual({ session: undefined, history: undefined, turn: undefined })

      const collisionProposal = yield* SessionImportHistory.prepareCopyProposal({
        decoded,
        prompt: "Refuse this copy because another Session won the target address",
      })
      yield* llm.text("Competing Session response.")
      const competingTurnID = Turn.ID.create()
      const competing = yield* prompt.start({
        sessionID: collisionProposal.targetSessionID,
        turnID: competingTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "Competing target Session" },
        parts: [{ type: "text", text: "Occupy the proposed import-copy target" }],
      })
      if (!competing.terminal) yield* prompt.awaitTurn(collisionProposal.targetSessionID, competingTurnID)
      const competingMessages = yield* sessions.messages({ sessionID: collisionProposal.targetSessionID })
      const collision = yield* SessionImportHistory.copy({
        decoded,
        proposal: collisionProposal,
        prompt: "Refuse this copy because another Session won the target address",
        sourceStillMatches: Effect.succeed(true),
      }).pipe(Effect.exit)
      expect(Exit.isFailure(collision)).toBe(true)
      if (Exit.isFailure(collision)) expect(Cause.squash(collision.cause)).toBeInstanceOf(Turn.AdmissionConflictError)
      expect(yield* sessions.messages({ sessionID: collisionProposal.targetSessionID })).toEqual(competingMessages)
      expect(
        yield* database.db
          .select({ id: SessionAdministrativeHistoryTable.session_id })
          .from(SessionAdministrativeHistoryTable)
          .where(eq(SessionAdministrativeHistoryTable.session_id, collisionProposal.targetSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(yield* llm.calls).toBe(2)

      const retainedMessageProposal = yield* SessionImportHistory.prepareCopyProposal({
        decoded,
        prompt: "Refuse this copy because a mapped Message identity is retained by old lineage",
      })
      const retainedMessageID = retainedMessageProposal.messageMapping[0]?.target
      if (!retainedMessageID) return yield* Effect.die("Expected a mapped Message identity")
      yield* database.db
        .insert(LearnerOccurrenceSourceOrderTable)
        .values({
          occurrence_id: LearningCommand.createOccurrenceID(),
          origin_session_id: SessionID.create(),
          origin_message_id: retainedMessageID,
          time_allocated: Date.now(),
          source_temporal_state: "unavailable",
          source_temporal_unavailable_reason: "timezone_unavailable",
        })
        .run()
        .pipe(Effect.orDie)
      const retainedMessageCollision = yield* SessionImportHistory.copy({
        decoded,
        proposal: retainedMessageProposal,
        prompt: "Refuse this copy because a mapped Message identity is retained by old lineage",
        sourceStillMatches: Effect.succeed(true),
      }).pipe(Effect.exit)
      expect(Exit.isFailure(retainedMessageCollision)).toBe(true)
      if (Exit.isFailure(retainedMessageCollision)) {
        expect(Cause.squash(retainedMessageCollision.cause)).toBeInstanceOf(Turn.AdmissionConflictError)
      }
      expect(
        yield* database.db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(eq(SessionTable.id, retainedMessageProposal.targetSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()

      const retiredCopyProposal = yield* SessionImportHistory.prepareCopyProposal({
        decoded,
        prompt: "Refuse this copy with typed retired-address truth",
      })
      yield* materializeTestSession({
        id: retiredCopyProposal.targetSessionID,
        title: "Retire the proposed import-copy target",
      })
      const retiredDeletion = yield* sessions.proposeRemoval({
        sessionID: retiredCopyProposal.targetSessionID,
        mode: "full",
      })
      expect((yield* sessions.commitRemoval(retiredDeletion)).type).toBe("applied")
      const retiredCopy = yield* SessionImportHistory.copy({
        decoded,
        proposal: retiredCopyProposal,
        prompt: "Refuse this copy with typed retired-address truth",
        sourceStillMatches: Effect.succeed(true),
      }).pipe(Effect.exit)
      expect(Exit.isFailure(retiredCopy)).toBe(true)
      if (Exit.isFailure(retiredCopy)) {
        expect(Cause.squash(retiredCopy.cause)).toBeInstanceOf(SessionDeletion.SessionIDRetiredError)
      }

      const nestedAttachmentProposal = yield* SessionImportHistory.prepareCopyProposal({
        decoded,
        prompt: "Refuse this copy because a mapped nested attachment identity is already live",
      })
      const nestedAttachmentID = nestedAttachmentProposal.partMapping.find(
        (entry) => entry.source === sourceAttachmentID,
      )?.target
      if (!nestedAttachmentID) return yield* Effect.die("Expected a mapped nested attachment identity")
      const identityHolder = (yield* materializeTestSession({ title: "Nested attachment identity holder" })).info
      const holderMessage = yield* user(identityHolder.id, "hold the nested attachment target identity")
      yield* sessions.updatePart({
        id: nestedAttachmentID,
        sessionID: identityHolder.id,
        messageID: holderMessage.id,
        type: "file",
        mime: "text/plain",
        filename: "identity-holder.txt",
        url: "data:text/plain,held",
      })
      const nestedAttachmentCollision = yield* SessionImportHistory.copy({
        decoded,
        proposal: nestedAttachmentProposal,
        prompt: "Refuse this copy because a mapped nested attachment identity is already live",
        sourceStillMatches: Effect.succeed(true),
      }).pipe(Effect.exit)
      expect(Exit.isFailure(nestedAttachmentCollision)).toBe(true)
      if (Exit.isFailure(nestedAttachmentCollision)) {
        expect(Cause.squash(nestedAttachmentCollision.cause)).toBeInstanceOf(Turn.AdmissionConflictError)
      }
      expect(
        yield* database.db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(eq(SessionTable.id, nestedAttachmentProposal.targetSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()

      const retainedInputProposal = yield* SessionImportHistory.prepareCopyProposal({
        decoded,
        prompt: "Refuse this copy because its proposed Input identity is already occupied",
      })
      const inputSourceSessionID = SessionID.create()
      const inputSourceTurnID = Turn.ID.create()
      yield* llm.text("Input identity source response.")
      const inputSource = yield* prompt.start({
        sessionID: inputSourceSessionID,
        turnID: inputSourceTurnID,
        inputID: retainedInputProposal.inputID,
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "Historical Input identity source" },
        parts: [{ type: "text", text: "Create the exact Input identity that a later copy must not reuse" }],
      })
      if (!inputSource.terminal) yield* prompt.awaitTurn(inputSourceSessionID, inputSourceTurnID)
      const retainedInputCollision = yield* SessionImportHistory.copy({
        decoded,
        proposal: retainedInputProposal,
        prompt: "Refuse this copy because its proposed Input identity is already occupied",
        sourceStillMatches: Effect.succeed(true),
      }).pipe(Effect.exit)
      expect(Exit.isFailure(retainedInputCollision)).toBe(true)
      if (Exit.isFailure(retainedInputCollision)) {
        expect(Cause.squash(retainedInputCollision.cause)).toBeInstanceOf(Turn.AdmissionConflictError)
      }
      expect(
        yield* database.db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(eq(SessionTable.id, retainedInputProposal.targetSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()

      const retainedTurnProposal = yield* SessionImportHistory.prepareCopyProposal({
        decoded,
        prompt: "Refuse this copy because its fresh Turn identity is retained as unavailable lineage",
      })
      yield* database.db
        .insert(TurnUnavailableSourceTable)
        .values({
          turn_id: retainedTurnProposal.turnID,
          session_id: SessionID.create(),
          admission_kind: "learner",
          time_admitted: 1,
          time_terminal: 2,
          outcome: "completed",
          depth: 0,
          time_deleted: 3,
        })
        .run()
        .pipe(Effect.orDie)
      const retainedTurnCollision = yield* SessionImportHistory.copy({
        decoded,
        proposal: retainedTurnProposal,
        prompt: "Refuse this copy because its fresh Turn identity is retained as unavailable lineage",
        sourceStillMatches: Effect.succeed(true),
      }).pipe(Effect.exit)
      expect(Exit.isFailure(retainedTurnCollision)).toBe(true)
      if (Exit.isFailure(retainedTurnCollision)) {
        expect(Cause.squash(retainedTurnCollision.cause)).toBeInstanceOf(Turn.SourceUnavailableError)
      }
      expect(
        yield* database.db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(eq(SessionTable.id, retainedTurnProposal.targetSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
    }),
  { config: cfg },
  30_000,
)

isolatedDatabaseBoundary.instance(
  "exact restore refuses an imported identity retained by unavailable learner-occurrence lineage",
  () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const context = yield* InstanceState.context
      const targetDatabaseID = yield* database.db.transaction(LearnerHomeIdentity.read).pipe(Effect.orDie)
      const sessionID = SessionID.create()
      const messageID = MessageID.ascending()
      const partID = PartID.ascending()
      const created = Date.now()
      const decoded = yield* SessionImportHistory.decode(
        JSON.stringify({
          type: "repa_session_offline_history",
          schemaVersion: 1,
          sourceDatabaseID:
            targetDatabaseID === `lhm_${"1".repeat(32)}` ? `lhm_${"2".repeat(32)}` : `lhm_${"1".repeat(32)}`,
          info: {
            id: sessionID,
            slug: "retained-message-collision",
            projectID: "source-project",
            directory: "/source/project",
            title: "Retained message collision",
            version: "1",
            time: { created, updated: created },
          },
          messages: [
            {
              info: {
                id: messageID,
                sessionID,
                role: "user",
                time: { created },
                agent: "repa",
                model: { providerID: "test", modelID: "test-model" },
              },
              parts: [{ id: partID, sessionID, messageID, type: "text", text: "retained identity" }],
            },
          ],
        }),
      )
      yield* database.db
        .insert(LearnerOccurrenceSourceOrderTable)
        .values({
          occurrence_id: LearningCommand.createOccurrenceID(),
          origin_session_id: SessionID.create(),
          origin_message_id: messageID,
          time_allocated: created,
          source_temporal_state: "unavailable",
          source_temporal_unavailable_reason: "timezone_unavailable",
        })
        .run()
        .pipe(Effect.orDie)

      const result = yield* SessionImportHistory.exactRestore({
        decoded,
        context,
        sourceStillMatches: Effect.succeed(true),
      }).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const conflict = Cause.squash(result.cause)
        expect(conflict).toBeInstanceOf(SessionImportHistory.IdentityConflictError)
        if (conflict instanceof SessionImportHistory.IdentityConflictError) {
          expect(conflict.identityKind).toBe("message")
          expect(conflict.identity).toBe(messageID)
        }
      }
      expect(
        yield* Effect.all({
          session: database.db
            .select({ id: SessionTable.id })
            .from(SessionTable)
            .where(eq(SessionTable.id, sessionID))
            .get()
            .pipe(Effect.orDie),
          message: database.db
            .select({ id: MessageTable.id })
            .from(MessageTable)
            .where(eq(MessageTable.id, messageID))
            .get()
            .pipe(Effect.orDie),
          part: database.db
            .select({ id: PartTable.id })
            .from(PartTable)
            .where(eq(PartTable.id, partID))
            .get()
            .pipe(Effect.orDie),
          seal: database.db
            .select({ id: SessionAdministrativeHistoryTable.session_id })
            .from(SessionAdministrativeHistoryTable)
            .where(eq(SessionAdministrativeHistoryTable.session_id, sessionID))
            .get()
            .pipe(Effect.orDie),
        }),
      ).toEqual({ session: undefined, message: undefined, part: undefined, seal: undefined })
    }),
  { config: cfg },
)

test("exact restore survives restart and floors every later transcript writer above future imported history", async () => {
  await using tmp = await tmpdir()
  const filename = path.join(tmp.path, "exact-restore-frontier.db")
  const sessionID = SessionID.create()
  const importedMessageID = MessageID.ascending()
  const importedPartID = PartID.ascending()
  const sourceTime = Date.now() + 60_000
  let source = ""
  let expectedMessages: SessionV1.WithParts[] = []
  let expectedFrontierTime = 0

  await Effect.runPromise(
    Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      yield* instances.provide(
        { directory: tmp.path },
        Effect.gen(function* () {
          const database = yield* Database.Service
          const sessions = yield* Session.Service
          const context = yield* InstanceState.context
          const targetDatabaseID = yield* database.db.transaction(LearnerHomeIdentity.read).pipe(Effect.orDie)
          const sharedBefore = yield* database.db.transaction((tx) => LearningFrontier.read(tx))
          source = JSON.stringify({
            type: "repa_session_offline_history",
            schemaVersion: 1,
            sourceDatabaseID:
              targetDatabaseID === `lhm_${"1".repeat(32)}` ? `lhm_${"2".repeat(32)}` : `lhm_${"1".repeat(32)}`,
            info: {
              id: sessionID,
              slug: "future-exact-restore",
              projectID: "source-project",
              directory: "/source/project",
              title: "Future exact restore",
              version: "1",
              time: { created: sourceTime, updated: sourceTime + 5 },
            },
            messages: [
              {
                info: {
                  id: importedMessageID,
                  sessionID,
                  role: "user",
                  time: { created: sourceTime },
                  agent: "repa",
                  model: { providerID: "test", modelID: "test-model" },
                },
                parts: [
                  {
                    id: importedPartID,
                    sessionID,
                    messageID: importedMessageID,
                    type: "text",
                    text: "future imported exact history",
                  },
                ],
              },
            ],
          })
          const decoded = yield* SessionImportHistory.decode(source)
          const changedSource = yield* SessionImportHistory.exactRestore({
            decoded,
            context,
            sourceStillMatches: Effect.succeed(false),
          }).pipe(Effect.exit)
          expect(Exit.isFailure(changedSource)).toBe(true)
          if (Exit.isFailure(changedSource)) {
            expect(Cause.squash(changedSource.cause)).toBeInstanceOf(SessionImportHistory.SourceChangedError)
          }
          expect(
            yield* database.db
              .select({ id: SessionTable.id })
              .from(SessionTable)
              .where(eq(SessionTable.id, sessionID))
              .get()
              .pipe(Effect.orDie),
          ).toBeUndefined()
          const applied = yield* SessionImportHistory.exactRestore({
            decoded,
            context,
            sourceStillMatches: Effect.succeed(true),
          })
          const replay = yield* SessionImportHistory.exactRestore({
            decoded,
            context,
            sourceStillMatches: Effect.succeed(true),
          })
          expect(applied).toEqual({ type: "applied", sessionID })
          expect(replay).toEqual({ type: "already_present", sessionID })
          yield* database.db
            .update(SessionTable)
            .set({ title: "Drifted after exact restore" })
            .where(eq(SessionTable.id, sessionID))
            .run()
            .pipe(Effect.orDie)
          const drifted = yield* SessionImportHistory.exactRestore({
            decoded,
            context,
            sourceStillMatches: Effect.succeed(true),
          }).pipe(Effect.exit)
          expect(Exit.isFailure(drifted)).toBe(true)
          if (Exit.isFailure(drifted)) {
            expect(Cause.squash(drifted.cause)).toBeInstanceOf(SessionImportHistory.IdentityConflictError)
          }
          yield* database.db
            .update(SessionTable)
            .set({ title: "Future exact restore" })
            .where(eq(SessionTable.id, sessionID))
            .run()
            .pipe(Effect.orDie)
          expect(yield* sessions.get(sessionID)).toMatchObject({
            id: sessionID,
            projectID: context.project.id,
            directory: context.directory,
            parentID: undefined,
            revert: undefined,
          })
          expect(yield* sessions.messages({ sessionID })).toMatchObject([
            { info: { id: importedMessageID, time: { created: sourceTime } } },
          ])
          expect(
            yield* Effect.all({
              turns: database.db
                .select()
                .from(TurnTable)
                .where(eq(TurnTable.session_id, sessionID))
                .all()
                .pipe(Effect.orDie),
              inputs: database.db
                .select()
                .from(TurnInputTable)
                .where(eq(TurnInputTable.session_id, sessionID))
                .all()
                .pipe(Effect.orDie),
              models: database.db
                .select()
                .from(TurnModelOperationTable)
                .where(eq(TurnModelOperationTable.session_id, sessionID))
                .all()
                .pipe(Effect.orDie),
              events: database.db
                .select()
                .from(EventTable)
                .where(eq(EventTable.aggregate_id, sessionID))
                .all()
                .pipe(Effect.orDie),
            }),
          ).toEqual({ turns: [], inputs: [], models: [], events: [] })
          expect(yield* database.db.transaction((tx) => LearningFrontier.read(tx))).toEqual(sharedBefore)
          expect(
            yield* database.db
              .select()
              .from(SessionAdministrativeHistoryTable)
              .where(eq(SessionAdministrativeHistoryTable.session_id, sessionID))
              .get()
              .pipe(Effect.orDie),
          ).toMatchObject({
            kind: "offline_exact_restore",
            message_count: 1,
            part_count: 1,
            history_frontier_time: sourceTime + 5,
          })
        }),
      )
    }).pipe(Effect.provide(makeProcessRestartBoundary(filename)), Effect.scoped),
  )

  await Effect.runPromise(
    Effect.gen(function* () {
      setSystemTime(new Date(1_000))
      yield* Effect.addFinalizer(() => Effect.sync(() => setSystemTime()))
      const llm = yield* TestLLMServer
      yield* useMachineConfig(providerCfg(llm.url))
      const instances = yield* InstanceStore.Service
      yield* instances.provide(
        { directory: tmp.path },
        Effect.gen(function* () {
          const database = yield* Database.Service
          const prompt = yield* SessionPrompt.Service
          const revert = yield* SessionRevert.Service
          const sessions = yield* Session.Service
          yield* database.db.transaction((tx) =>
            SessionPresentation.assertAdministrativeHistoryIntegrity(tx, sessionID),
          )

          const shell = yield* prompt.shell({
            sessionID,
            messageID: MessageID.ascending(),
            agent: "repa",
            model: ref,
            command: "echo exact-restore-utility",
          })
          expect(
            shell.parts[0]?.type === "tool" && shell.parts[0].state.status === "completed"
              ? shell.parts[0].state.output
              : "",
          ).toContain("exact-restore-utility")

          const firstTurnID = Turn.ID.create()
          const firstInputID = Turn.InputID.create()
          const firstMessageID = MessageID.ascending()
          yield* llm.text("First local response after exact restore.")
          const first = yield* prompt.start({
            sessionID,
            turnID: firstTurnID,
            inputID: firstInputID,
            messageID: firstMessageID,
            agent: "repa",
            model: ref,
            limits: { model: 1, tool: 0 },
            parts: [{ type: "text", text: "First local Turn after future history" }],
          })
          const firstTerminal = first.terminal ? first : yield* prompt.awaitTurn(sessionID, firstTurnID)
          expect(firstTerminal.terminal).toMatchObject({ outcome: "completed", reason: "normal" })
          const beforeReplay = yield* sessions.messages({ sessionID })
          expect(
            yield* prompt.start({
              sessionID,
              turnID: firstTurnID,
              inputID: firstInputID,
              messageID: firstMessageID,
              agent: "repa",
              model: ref,
              limits: { model: 1, tool: 0 },
              parts: [{ type: "text", text: "First local Turn after future history" }],
            }),
          ).toEqual(firstTerminal)
          expect(yield* sessions.messages({ sessionID })).toEqual(beforeReplay)

          const secondTurnID = Turn.ID.create()
          const secondInputID = Turn.InputID.create()
          const secondMessageID = MessageID.ascending()
          yield* llm.text("Second local response after exact restore.")
          yield* prompt.start({
            sessionID,
            turnID: secondTurnID,
            inputID: secondInputID,
            messageID: secondMessageID,
            agent: "repa",
            model: ref,
            limits: { model: 1, tool: 0 },
            parts: [{ type: "text", text: "Second local Turn after the replay" }],
          })
          expect((yield* prompt.awaitTurn(sessionID, secondTurnID)).terminal).toMatchObject({
            outcome: "completed",
            reason: "normal",
          })

          const messages = yield* sessions.messages({ sessionID })
          const times = messages.map((message) => message.info.time.created)
          expect(messages[0]?.info.id).toBe(importedMessageID)
          expect(times.every((time, index) => index === 0 || time > times[index - 1]!)).toBe(true)
          expect(times[1]).toBeGreaterThan(sourceTime + 5)
          for (const message of messages) {
            const created = message.info.time.created
            if (message.info.role === "assistant" && message.info.time.completed !== undefined) {
              expect(message.info.time.completed).toBeGreaterThanOrEqual(created)
            }
            for (const part of message.parts) {
              if ((part.type === "text" || part.type === "reasoning") && part.time) {
                expect(part.time.start).toBeGreaterThanOrEqual(created)
                if (part.time.end !== undefined) expect(part.time.end).toBeGreaterThanOrEqual(part.time.start)
              }
              if (part.type === "tool" && part.state.status !== "pending") {
                expect(part.state.time.start).toBeGreaterThanOrEqual(created)
                if (part.state.status !== "running") {
                  expect(part.state.time.end).toBeGreaterThanOrEqual(part.state.time.start)
                  if (part.state.status === "completed" && part.state.time.compacted !== undefined) {
                    expect(part.state.time.compacted).toBeGreaterThanOrEqual(part.state.time.end)
                  }
                }
              }
            }
          }
          expect(messages.findIndex((message) => message.info.id === firstMessageID)).toBeGreaterThan(0)
          expect(messages.findIndex((message) => message.info.id === secondMessageID)).toBeGreaterThan(
            messages.findIndex((message) => message.info.id === firstMessageID),
          )
          const frontier = yield* database.db
            .select()
            .from(SessionPresentationFrontierTable)
            .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
            .get()
            .pipe(Effect.orDie)
          expect(frontier).toMatchObject({ frontier_time: times.at(-1), message_count: messages.length })
          const turns = yield* database.db
            .select({ id: TurnTable.id, time: TurnTable.time_admitted })
            .from(TurnTable)
            .where(eq(TurnTable.session_id, sessionID))
            .orderBy(TurnTable.time_admitted)
            .all()
            .pipe(Effect.orDie)
          expect(turns).toEqual([
            {
              id: firstTurnID,
              time: messages.find((message) => message.info.id === firstMessageID)!.info.time.created,
            },
            {
              id: secondTurnID,
              time: messages.find((message) => message.info.id === secondMessageID)!.info.time.created,
            },
          ])
          const occurrences = yield* database.db
            .select({
              messageID: AdmittedLearnerOccurrenceTable.origin_message_id,
              time: AdmittedLearnerOccurrenceTable.time_admitted,
            })
            .from(AdmittedLearnerOccurrenceTable)
            .where(eq(AdmittedLearnerOccurrenceTable.origin_session_id, sessionID))
            .orderBy(AdmittedLearnerOccurrenceTable.time_admitted)
            .all()
            .pipe(Effect.orDie)
          expect(occurrences.map((occurrence) => occurrence.messageID)).toEqual([firstMessageID, secondMessageID])
          expect(occurrences.every((occurrence) => occurrence.time > sourceTime + 5)).toBe(true)
          const operations = yield* database.db
            .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
            .from(TurnModelOperationTable)
            .where(eq(TurnModelOperationTable.session_id, sessionID))
            .orderBy(TurnModelOperationTable.time_admitted)
            .all()
            .pipe(Effect.orDie)
          expect(operations).toHaveLength(2)
          for (const operation of operations) {
            expect(
              yield* database.db.transaction((tx) => LearningContext.readCut(tx, operation.assistantMessageID)),
            ).toMatchObject({
              type: "available",
              cut: { operation: { assistantMessageID: operation.assistantMessageID } },
            })
          }
          expect(yield* llm.calls).toBe(2)
          const inputs = yield* llm.inputs
          expect(inputs).toHaveLength(2)
          const firstContext = JSON.stringify(inputs[0])
          const importedPosition = firstContext.indexOf("future imported exact history")
          const shellPosition = firstContext.indexOf("exact-restore-utility")
          const learnerPosition = firstContext.indexOf("First local Turn after future history")
          expect(importedPosition).toBeGreaterThanOrEqual(0)
          expect(shellPosition).toBeGreaterThan(importedPosition)
          expect(learnerPosition).toBeGreaterThan(shellPosition)
          expect(yield* database.db.transaction((tx) => LearningFrontier.read(tx))).toEqual({ sequence: 0, time: 0 })

          const reverted = yield* revert.revert({ sessionID, messageID: secondMessageID })
          expect(reverted.revert).toMatchObject({ messageID: secondMessageID })
          const beforeUnrevert = yield* sessions.messages({ sessionID })
          expect((yield* revert.unrevert({ sessionID })).revert).toBeUndefined()
          expect(yield* sessions.messages({ sessionID })).toEqual(beforeUnrevert)
          const revertedAgain = yield* revert.revert({ sessionID, messageID: secondMessageID })
          yield* revert.cleanup(revertedAgain)

          const cleaned = yield* sessions.messages({ sessionID })
          expect(cleaned.some((message) => message.info.id === importedMessageID)).toBe(true)
          expect(cleaned.some((message) => message.info.id === firstMessageID)).toBe(true)
          expect(cleaned.some((message) => message.info.id === secondMessageID)).toBe(false)
          expect((yield* sessions.get(sessionID)).revert).toBeUndefined()
          yield* database.db.transaction((tx) =>
            SessionPresentation.assertAdministrativeHistoryIntegrity(tx, sessionID),
          )
          expect(
            yield* database.db
              .select({
                frontierTime: SessionPresentationFrontierTable.frontier_time,
                messageCount: SessionPresentationFrontierTable.message_count,
              })
              .from(SessionPresentationFrontierTable)
              .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
              .get()
              .pipe(Effect.orDie),
          ).toEqual({ frontierTime: times.at(-1)!, messageCount: cleaned.length })
          expectedMessages = cleaned
          expectedFrontierTime = times.at(-1)!
        }),
      )
    }).pipe(Effect.provide(makeProcessRestartBoundary(filename)), Effect.scoped),
  )

  await Effect.runPromise(
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      const instances = yield* InstanceStore.Service
      yield* instances.provide(
        { directory: tmp.path },
        Effect.gen(function* () {
          const database = yield* Database.Service
          const sessions = yield* Session.Service
          expect(yield* llm.calls).toBe(0)
          yield* database.db.transaction((tx) =>
            SessionPresentation.assertAdministrativeHistoryIntegrity(tx, sessionID),
          )
          expect(yield* sessions.messages({ sessionID })).toEqual(expectedMessages)
          expect(
            yield* database.db
              .select()
              .from(SessionPresentationFrontierTable)
              .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
              .get()
              .pipe(Effect.orDie),
          ).toMatchObject({
            frontier_time: expectedFrontierTime,
            message_count: expectedMessages.length,
          })
        }),
      )
    }).pipe(Effect.provide(makeProcessRestartBoundary(filename)), Effect.scoped),
  )
}, 60_000)

test("recovers a process-orphaned running model before accepting a later Turn without resend", async () => {
  await using tmp = await tmpdir()
  const filename = path.join(tmp.path, "process-restart.db")
  const orphaned = await processOrphan(filename, tmp.path)
  const orphan = orphaned.seed
  const evidenceDirectory = process.env.REPA_GATE21A_DETERMINISTIC_EVIDENCE_DIR
  const beforeDatabase = evidenceDirectory
    ? await retainDatabaseFamily(filename, evidenceDirectory, "process-restart.running")
    : undefined
  let transitionEvidence: Record<string, unknown> | undefined

  await Effect.runPromise(
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      yield* useMachineConfig(providerCfg(llm.url))
      const instances = yield* InstanceStore.Service
      yield* instances.provide(
        { directory: tmp.path },
        Effect.gen(function* () {
          const prompt = yield* SessionPrompt.Service
          const database = yield* Database.Service

          expect(orphan.modelOperationState).toBe("running")
          expect(orphan.rendererVersion).toBe(7)
          const startupProviderCalls = yield* llm.calls
          const startupInputs = yield* llm.inputs
          expect(startupProviderCalls).toBe(0)
          expect(startupInputs).toEqual([])

          const recovered = yield* prompt.getTurn(orphan.sessionID, orphan.turnID)
          expect(recovered).toMatchObject({
            id: orphan.turnID,
            sessionID: orphan.sessionID,
            state: "interrupted",
            terminal: { outcome: "interrupted", reason: "startup_recovery" },
          })
          const recoveredModel = yield* database.db
            .select({ state: TurnModelOperationTable.state, timeSettled: TurnModelOperationTable.time_settled })
            .from(TurnModelOperationTable)
            .where(eq(TurnModelOperationTable.assistant_message_id, orphan.assistantMessageID))
            .get()
            .pipe(Effect.orDie)
          expect(recoveredModel?.state).toBe("interrupted")
          expect(typeof recoveredModel?.timeSettled).toBe("number")
          const recoveredAssistant = (yield* MessageV2.get({
            sessionID: orphan.sessionID,
            messageID: orphan.assistantMessageID,
          })).info
          if (recoveredAssistant.role !== "assistant") {
            return yield* Effect.die("Startup recovery produced a non-assistant model result")
          }
          expect(recoveredAssistant.error?.name).toBe("MessageAbortedError")
          expect(typeof recoveredAssistant.time.completed).toBe("number")

          const startupEvents = yield* database.db
            .select({ seq: EventTable.seq, type: EventTable.type })
            .from(EventTable)
            .where(and(eq(EventTable.aggregate_id, orphan.sessionID), gt(EventTable.seq, orphan.eventSequence)))
            .orderBy(EventTable.seq)
            .all()
            .pipe(Effect.orDie)
          expect(startupEvents.filter((event) => event.type.startsWith("turn.terminal"))).toHaveLength(1)
          expect(startupEvents.some((event) => event.type.startsWith("turn.model.admitted"))).toBe(false)
          expect(startupEvents.some((event) => event.type.startsWith("turn.tool.admitted"))).toBe(false)
          const startupCounts = yield* database.db.get<{ models: number; tools: number }>(sql`
                SELECT
                  (SELECT count(*) FROM turn_model_operation) AS models,
                  (SELECT count(*) FROM turn_tool_invocation) AS tools
              `)
          expect(startupCounts).toEqual({ models: 1, tools: 0 })

          yield* llm.text("Fresh response after startup recovery.")
          const laterTurnID = Turn.ID.create()
          const started = yield* prompt.start({
            sessionID: orphan.sessionID,
            turnID: laterTurnID,
            inputID: Turn.InputID.create(),
            messageID: MessageID.ascending(),
            agent: "repa",
            model: ref,
            limits: { model: 1, tool: 0 },
            parts: [{ type: "text", text: "Continue from current truth after the restart." }],
          })
          expect(started.id).toBe(laterTurnID)
          expect(laterTurnID).not.toBe(orphan.turnID)
          expect(yield* prompt.awaitTurn(orphan.sessionID, laterTurnID)).toMatchObject({
            id: laterTurnID,
            state: "completed",
            terminal: { outcome: "completed", reason: "normal" },
          })
          const finalProviderCalls = yield* llm.calls
          expect(finalProviderCalls).toBe(1)
          expect(yield* prompt.getTurn(orphan.sessionID, orphan.turnID)).toEqual(recovered)
          const finalCounts = yield* database.db.get<{ models: number; tools: number }>(sql`
                SELECT
                  (SELECT count(*) FROM turn_model_operation) AS models,
                  (SELECT count(*) FROM turn_tool_invocation) AS tools
              `)
          expect(finalCounts).toEqual({ models: 2, tools: 0 })
          transitionEvidence = {
            startupProviderCalls,
            startupInputs,
            recovered,
            recoveredModel: {
              state: recoveredModel?.state,
              timeSettled: String(recoveredModel?.timeSettled),
            },
            recoveredAssistant: {
              id: recoveredAssistant.id,
              errorName: recoveredAssistant.error?.name,
              timeCompleted:
                recoveredAssistant.time.completed === undefined ? null : String(recoveredAssistant.time.completed),
            },
            startupEvents,
            startupCounts,
            laterTurnID,
            laterTerminal: yield* prompt.getTurn(orphan.sessionID, laterTurnID),
            finalProviderCalls,
            finalCounts,
          }
        }),
      )
    }).pipe(Effect.provide(makeProcessRestartBoundary(filename)), Effect.scoped),
  )
  if (evidenceDirectory) {
    const afterDatabase = await retainDatabaseFamily(filename, evidenceDirectory, "process-restart.reentered")
    await Bun.write(
      path.join(evidenceDirectory, "process-restart.result.json"),
      JSON.stringify({ orphaned, beforeDatabase, transition: transitionEvidence, afterDatabase }, null, 2) + "\n",
    )
  }
}, 60_000)

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
  60_000,
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
  "keeps the Goal acknowledgement after provider failure and qualifies a later same-snapshot inspection through released v1",
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
      const discovered = yield* database.db.transaction((tx) => LearnerGoal.discover(tx, Date.now()))
      expect(discovered.items).toMatchObject([
        { head: { schemaVersion: 2, outcome: input.operations[0].outcome, disposition: { type: "active" } } },
      ])
      const goalID = discovered.items[0]?.head.goalID
      if (!goalID) return yield* Effect.die("Expected one exact Goal for Gate 22 inspection")
      yield* llm.tool("learner_goal_query", { action: "get", goalID, includeInspection: true })
      yield* llm.tool("learning_interaction_read", { action: "inspect_current_context" })
      yield* llm.tool("learning_interaction_read", { action: "inspect_retained_steering_history" })
      yield* llm.tool("learning_interaction_read", { action: "list_terminal_roots", limit: 1 })
      const staleCursor = LearningInspectionSchema.createPageCursor(
        "live_lineage",
        SessionV1.PartID.make("prt_stale_inspection_cursor"),
        [{ ownerKind: "learner_goal", recordID: goalID, revisionID: "glr_wrong", revisionVersion: 999 }],
        "msg_after",
      )
      yield* llm.tool("learner_goal_query", {
        action: "get",
        goalID,
        includeInspection: { cursor: staleCursor },
      })
      yield* llm.text("The inspection reports owner and operational facts without claiming record-level causality.")
      const inspectionTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID,
        turnID: inspectionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 6, tool: 5 },
        parts: [
          {
            type: "text",
            text: "What does Repa remember about that Goal, and did it enter earlier operational context?",
          },
        ],
      })
      expect(yield* prompt.awaitTurn(sessionID, inspectionTurnID)).toMatchObject({
        state: "completed",
        terminal: { outcome: "completed", counters: { model: 6, tool: 5 } },
      })
      const inspectionPart = (yield* sessions.messages({ sessionID }))
        .flatMap((message) => message.parts)
        .find(
          (candidate): candidate is SessionV1.ToolPart =>
            candidate.type === "tool" &&
            candidate.tool === "learner_goal_query" &&
            candidate.state.status === "completed",
        )
      if (!inspectionPart || inspectionPart.state.status !== "completed") {
        return yield* Effect.die("Expected the released-v1 Goal inspection Tool result")
      }
      const inspectionRead = SemanticPresentation.readInspection(inspectionPart)
      expect(inspectionRead).toMatchObject({
        type: "valid",
        value: {
          status: "available",
          owner: { kind: "learner_goal", arm: "learner_goal", records: [{ recordID: goalID }] },
          nonCausality: "operational_lineage_not_per_record_answer_causality",
        },
      })
      const inspectionInline = toolInlineInfo(inspectionPart as unknown as SDKToolPart)
      expect(inspectionInline).toMatchObject({
        title: "Learning inspection — Available",
        mode: "block",
        body: expect.stringContaining("Operational lineage does not prove"),
      })
      const interactionParts = (yield* sessions.messages({ sessionID }))
        .flatMap((message) => message.parts)
        .filter(
          (candidate): candidate is SessionV1.ToolPart =>
            candidate.type === "tool" &&
            candidate.tool === "learning_interaction_read" &&
            candidate.state.status === "completed",
        )
      const contextPart = interactionParts.find(
        (candidate) =>
          candidate.state.status === "completed" && candidate.state.input.action === "inspect_current_context",
      )
      if (!contextPart || contextPart.state.status !== "completed") {
        return yield* Effect.die("Expected the released-v1 current Context inspection")
      }
      expect(SemanticPresentation.readInspection(contextPart)).toMatchObject({
        type: "valid",
        value: { owner: { kind: "learning_context", arm: "learning_context" }, status: "available" },
      })
      const steeringPart = interactionParts.find(
        (candidate) =>
          candidate.state.status === "completed" &&
          candidate.state.input.action === "inspect_retained_steering_history",
      )
      if (!steeringPart || steeringPart.state.status !== "completed") {
        return yield* Effect.die("Expected the released-v1 retained-steering unsupported projection")
      }
      expect(SemanticPresentation.readInspection(steeringPart)).toMatchObject({
        type: "valid",
        value: {
          owner: { kind: "retained_steering", arm: "retained_steering" },
          status: "read_shape_unsupported",
        },
      })
      const searchPart = interactionParts.find((candidate) => {
        if (candidate.state.status !== "completed") return false
        const value = JSON.parse(candidate.state.output) as { ownerResult?: { search?: unknown } }
        return Boolean(value.ownerResult?.search)
      })
      if (!searchPart || searchPart.state.status !== "completed") {
        return yield* Effect.die("Expected the released-v1 Interaction search Tool result")
      }
      const searchOutput = JSON.parse(searchPart.state.output) as {
        ownerResult?: { search?: { continuation?: unknown } }
      }
      expect(
        Schema.is(LearningInspectionCursor.Continuation)(searchOutput.ownerResult?.search?.continuation),
      ).toBeTrue()
      const searchInline = toolInlineInfo(searchPart as unknown as SDKToolPart)
      const searchInspection = SemanticPresentation.readInspection(searchPart)
      expect(searchInspection).toMatchObject({
        type: "valid",
        value: {
          owner: {
            arm: "learning_interaction",
            facts: expect.arrayContaining([
              { label: "Search status", value: "complete" },
              { label: "Search coverage", value: expect.stringContaining("continuation complete") },
            ]),
          },
        },
      })
      expect(searchInline).toMatchObject({
        mode: "block",
        body: expect.stringContaining("Search coverage"),
      })
      const goalInspectionParts = (yield* sessions.messages({ sessionID }))
        .flatMap((message) => message.parts)
        .filter(
          (candidate): candidate is SessionV1.ToolPart =>
            candidate.type === "tool" &&
            candidate.tool === "learner_goal_query" &&
            candidate.state.status === "completed",
        )
      expect(goalInspectionParts).toHaveLength(2)
      expect(SemanticPresentation.readInspection(goalInspectionParts[1]!)).toMatchObject({
        type: "valid",
        value: { status: "stale_inspection", lineage: { items: [] } },
      })
      expect(yield* database.db.transaction((tx) => LearnerGoal.readCurrent(tx, goalID, Date.now()))).toMatchObject({
        head: { version: 1, outcome: input.operations[0].outcome },
      })
      const correctedOutcome = "Learn operating systems by tracing scheduler invariants"
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, {
        operations: [
          {
            type: "update",
            goalID,
            headRevisionID: LearnerGoal.createRevisionID(),
            patch: { outcome: "This stale correction must not apply" },
          },
        ],
      })
      yield* llm.tool("learner_goal_query", { action: "get", goalID, includeInspection: true })
      yield* llm.text("The stale correction was rejected; current owner truth was re-read before another admission.")
      const staleCorrectionTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID,
        turnID: staleCorrectionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 3, tool: 2 },
        parts: [{ type: "text", text: `Correction: change that Goal to “${correctedOutcome}”.` }],
      })
      expect(yield* prompt.awaitTurn(sessionID, staleCorrectionTurnID)).toMatchObject({
        state: "completed",
        terminal: { outcome: "completed", counters: { model: 3, tool: 2 } },
      })
      const staleCorrectionParts = (yield* sessions.messages({ sessionID }))
        .flatMap((message) => message.parts)
        .filter(
          (candidate): candidate is SessionV1.ToolPart =>
            candidate.type === "tool" &&
            candidate.tool === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY &&
            candidate.state.status === "completed" &&
            candidate.state.input.operations?.some?.((operation: { goalID?: string }) => operation.goalID === goalID),
        )
      expect(staleCorrectionParts).toHaveLength(1)
      expect(SemanticPresentation.readResult(staleCorrectionParts[0]!)).toMatchObject({
        type: "valid",
        value: { outcome: "failed" },
      })
      expect(yield* database.db.transaction((tx) => LearnerGoal.readCurrent(tx, goalID, Date.now()))).toMatchObject({
        head: { version: 1, outcome: input.operations[0].outcome },
      })
      const rereadAfterStale = (yield* sessions.messages({ sessionID }))
        .flatMap((message) => message.parts)
        .filter(
          (candidate): candidate is SessionV1.ToolPart =>
            candidate.type === "tool" &&
            candidate.tool === "learner_goal_query" &&
            candidate.state.status === "completed",
        )
        .at(-1)
      if (!rereadAfterStale || rereadAfterStale.state.status !== "completed") {
        return yield* Effect.die("Expected exact owner re-read after stale correction")
      }
      expect(SemanticPresentation.readInspection(rereadAfterStale)).toMatchObject({
        type: "valid",
        value: { status: "available", owner: { records: [{ recordID: goalID, revisionVersion: 1 }] } },
      })
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, {
        operations: [
          {
            type: "update",
            goalID,
            headRevisionID: discovered.items[0]!.head.id,
            patch: { outcome: correctedOutcome },
          },
        ],
      })
      yield* llm.tool("learner_goal_query", { action: "get", goalID, includeInspection: true })
      yield* llm.text("The corrected owner head is visible through a fresh inspection cut.")
      const correctionTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID,
        turnID: correctionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 3, tool: 2 },
        parts: [{ type: "text", text: `Correction: change that Goal to “${correctedOutcome}”.` }],
      })
      expect(yield* prompt.awaitTurn(sessionID, correctionTurnID)).toMatchObject({
        state: "completed",
        terminal: { outcome: "completed", counters: { model: 3, tool: 2 } },
      })
      const corrected = yield* database.db.transaction((tx) => LearnerGoal.readCurrent(tx, goalID, Date.now()))
      expect(corrected?.head).toMatchObject({ outcome: correctedOutcome, version: 2 })
      if (!corrected) return yield* Effect.die("Expected corrected Goal head")
      const correctionWrites = (yield* sessions.messages({ sessionID }))
        .flatMap((message) => message.parts)
        .filter(
          (candidate): candidate is SessionV1.ToolPart =>
            candidate.type === "tool" &&
            candidate.tool === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY &&
            candidate.state.status === "completed" &&
            candidate.state.input.operations?.some?.((operation: { goalID?: string }) => operation.goalID === goalID),
        )
        .filter((candidate) => {
          const read = SemanticPresentation.readResult(candidate)
          return read.type === "valid" && read.value.outcome === "committed"
        })
      expect(correctionWrites).toHaveLength(1)
      const correctedInspection = (yield* sessions.messages({ sessionID }))
        .flatMap((message) => message.parts)
        .filter(
          (candidate): candidate is SessionV1.ToolPart =>
            candidate.type === "tool" &&
            candidate.tool === "learner_goal_query" &&
            candidate.state.status === "completed",
        )
        .at(-1)
      if (!correctedInspection || correctedInspection.state.status !== "completed") {
        return yield* Effect.die("Expected the corrected Goal inspection")
      }
      expect(SemanticPresentation.readInspection(correctedInspection)).toMatchObject({
        type: "valid",
        value: { status: "available", owner: { records: [{ recordID: goalID, revisionVersion: 2 }] } },
      })
      const renderActualTuiPart = (part: SessionV1.ToolPart) =>
        Effect.promise(async () => {
          const app = await testRender(
            () =>
              createComponent(LearningInspectionToolContent, {
                part: part as unknown as SDKToolPart,
              }),
            { width: 180, height: 34 },
          )
          try {
            await app.renderOnce()
            return app.captureCharFrame()
          } finally {
            app.renderer.destroy()
          }
        })
      const persistedInspectionRows = yield* database.db
        .select()
        .from(PartTable)
        .where(inArray(PartTable.id, [searchPart.id, correctedInspection.id]))
        .all()
        .pipe(Effect.orDie)
      const persistedInspectionParts = new Map(
        persistedInspectionRows.map(
          (row) =>
            [
              row.id,
              {
                id: row.id,
                messageID: row.message_id,
                sessionID: row.session_id,
                ...row.data,
              } as SessionV1.ToolPart,
            ] as const,
        ),
      )
      expect(yield* renderActualTuiPart(persistedInspectionParts.get(searchPart.id)!)).toContain(
        "Search status: complete",
      )
      expect(yield* renderActualTuiPart(persistedInspectionParts.get(correctedInspection.id)!)).toContain(
        `learner_goal:${goalID}@${corrected.head.id}#2`,
      )
      const restartFilename = `${database.filename}.gate22-restart`
      yield* database.db.run(sql`VACUUM INTO ${restartFilename}`)
      const restarted = yield* Effect.promise(() =>
        Effect.runPromise(
          Effect.gen(function* () {
            const reopened = yield* Database.Service
            return yield* reopened.db.transaction((tx) =>
              Effect.gen(function* () {
                const current = yield* LearnerGoal.readCurrent(tx, goalID, Date.now())
                const history = yield* LearnerGoal.readHistory(tx, goalID, Date.now(), { limit: 16 })
                const rows = yield* tx
                  .select()
                  .from(PartTable)
                  .where(inArray(PartTable.id, [goalInspectionParts[0]!.id, correctedInspection.id]))
                  .all()
                  .pipe(Effect.orDie)
                const inspectionVersions = rows.flatMap((row) => {
                  const read = SemanticPresentation.readInspection({
                    id: row.id,
                    messageID: row.message_id,
                    sessionID: row.session_id,
                    ...row.data,
                  } as SessionV1.ToolPart)
                  return read.type === "valid" ? read.value.owner.records.map((record) => record.revisionVersion) : []
                })
                return {
                  current,
                  historyVersions: history.items.map((item) => item.version),
                  inspectionVersions,
                }
              }),
            )
          }).pipe(Effect.provide(Database.layerFromPath(restartFilename)), Effect.scoped),
        ),
      )
      expect(restarted.current?.head).toMatchObject({ outcome: correctedOutcome, version: 2 })
      expect(restarted.historyVersions).toEqual(expect.arrayContaining([1, 2]))
      expect(restarted.inspectionVersions).toEqual(expect.arrayContaining([1, 2]))
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
  { timeout: 30_000 },
)

it.instance(
  "runs a real large-history Interaction search through Tool persistence, exhaustion, and primary-TUI rendering",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const project = yield* database.db
        .select({ id: ProjectTable.id })
        .from(ProjectTable)
        .limit(1)
        .get()
        .pipe(Effect.orDie)
      if (!project) return yield* Effect.die("Expected the test Project")
      let oversizedSessionID: SessionID | undefined
      let oversizedTurnID: Turn.ID | undefined

      yield* Effect.forEach(
        Array.from({ length: 70 }, (_, index) => index),
        (index) =>
          Effect.gen(function* () {
            const sessionID = SessionID.create()
            const turnID = Turn.ID.create()
            const inputID = Turn.InputID.create()
            const messageID = SessionV1.MessageID.ascending()
            const partID = SessionV1.PartID.ascending()
            const assistantMessageID = SessionV1.MessageID.ascending()
            const time = 100 + index * 10
            yield* database.db.run(sql`
              INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
              VALUES (
                ${sessionID}, ${project.id}, ${`gate22-root-${index}`}, '/', ${`Gate 22 root ${index}`},
                'test', ${time}, ${time}
              )
            `)
            yield* database.db.run(sql`
              INSERT INTO message (id, session_id, time_created, time_updated, data)
              VALUES (
                ${messageID}, ${sessionID}, ${time}, ${time},
                ${JSON.stringify({
                  role: "user",
                  time: { created: time },
                  agent: "repa",
                  model: { providerID: "test-provider", modelID: "test-model" },
                })}
              )
            `)
            yield* database.db.run(sql`
              INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
              VALUES (
                ${partID}, ${messageID}, ${sessionID}, ${time}, ${time},
                ${JSON.stringify({ type: "text", text: `root ${index}` })}
              )
            `)
            if (index === 5) {
              oversizedSessionID = sessionID
              oversizedTurnID = turnID
              yield* Effect.forEach(
                Array.from({ length: 32 }, (_, partIndex) => partIndex),
                (partIndex) =>
                  database.db.run(sql`
                    INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
                    VALUES (
                      ${SessionV1.PartID.ascending()}, ${messageID}, ${sessionID}, ${time}, ${time},
                      ${JSON.stringify({ type: "text", text: `oversized ${partIndex}` })}
                    )
                  `),
                { concurrency: 1, discard: true },
              )
            }
            const occurrence = yield* database.db.transaction((tx) =>
              Occurrence.admit(tx, {
                admission: LearnerAdmission.interactive({}),
                sessionID,
                messageID,
                timeAdmitted: time,
              }),
            )
            yield* database.db.transaction((tx) =>
              TurnLifecycle.admit(tx, {
                kind: "learner",
                turnID,
                sessionID,
                inputID,
                messageID,
                occurrenceID: occurrence.id,
                limits: { model: 0, tool: 0 },
                envelope: { index },
                policyBasis: { source: "gate22-large-history-test" },
                timeAdmitted: time,
              }),
            )
            yield* database.db.run(sql`
              INSERT INTO message (id, session_id, time_created, time_updated, data)
              VALUES (
                ${assistantMessageID}, ${sessionID}, ${time + 1}, ${time + 1},
                ${JSON.stringify({
                  role: "assistant",
                  parentID: messageID,
                  time: { created: time + 1 },
                })}
              )
            `)
            yield* database.db.transaction((tx) =>
              admitModelWithLearningContext(tx, {
                turnID,
                sessionID,
                assistantMessageID,
                requestEnvelope: { index },
                contextFingerprint: "b".repeat(64),
                snapshotFrontier: { sequence: 0, time: 0 },
                timeAdmitted: time + 1,
              }),
            )
          }),
        { concurrency: 1, discard: true },
      )
      if (!oversizedSessionID || !oversizedTurnID) return yield* Effect.die("Expected oversized root fixture")

      const sessionID = SessionID.create()
      const searchParts = () =>
        sessions
          .messages({ sessionID })
          .pipe(
            Effect.map((messages) =>
              messages
                .flatMap((message) => message.parts)
                .filter(
                  (part): part is SessionV1.ToolPart =>
                    part.type === "tool" &&
                    part.tool === "learning_interaction_read" &&
                    part.state.status === "completed",
                ),
            ),
          )
      const latestSearch = () =>
        searchParts().pipe(
          Effect.flatMap((parts) =>
            parts.at(-1) ? Effect.succeed(parts.at(-1)!) : Effect.die("Expected Interaction search Part"),
          ),
        )
      const decodeSearch = (part: SessionV1.ToolPart) => {
        if (part.state.status !== "completed") throw new Error("Expected completed search Part")
        const parsed: unknown = JSON.parse(part.state.output)
        const owner =
          typeof parsed === "object" && parsed !== null && "ownerResult" in parsed
            ? (parsed as { ownerResult?: unknown }).ownerResult
            : undefined
        const search =
          typeof owner === "object" && owner !== null && "search" in owner
            ? (owner as { search?: unknown }).search
            : undefined
        if (
          typeof search !== "object" ||
          search === null ||
          !("continuation" in search) ||
          !("payload" in search) ||
          !Schema.is(LearningInspectionCursor.Continuation)(search.continuation) ||
          typeof search.payload !== "object" ||
          search.payload === null
        ) {
          throw new Error(`Expected typed Interaction search output: ${part.state.output.slice(0, 1000)}`)
        }
        return {
          continuation: search.continuation,
          payload: search.payload as Record<string, unknown>,
        }
      }
      const runTurn = (turnID: Turn.ID, limits: { model: number; tool: number }, text: string, first = false) =>
        prompt
          .start({
            sessionID,
            turnID,
            inputID: Turn.InputID.create(),
            messageID: MessageID.ascending(),
            agent: "repa",
            model: ref,
            limits,
            ...(first ? { session: { title: "real Gate 22 large-history trace" } } : {}),
            parts: [{ type: "text", text }],
          })
          .pipe(Effect.andThen(prompt.awaitTurn(sessionID, turnID)))

      yield* llm.tool("learning_interaction_read", { action: "list_terminal_roots", limit: 32 })
      yield* llm.text("The first bounded page has a continuation.")
      yield* runTurn(Turn.ID.create(), { model: 2, tool: 2 }, "Find an older retained interaction.", true)
      const pageOnePart = yield* latestSearch()
      const pageOne = decodeSearch(pageOnePart)
      expect(pageOne.payload.status).toBe("continuation_pending")

      yield* llm.tool("learning_interaction_read", {
        action: "list_terminal_roots",
        limit: 32,
        predecessor: pageOne.continuation,
      })
      yield* llm.text("The second bounded page still has a continuation.")
      yield* runTurn(Turn.ID.create(), { model: 2, tool: 2 }, "Continue through sixty-four roots.")
      const pageMiddlePart = yield* latestSearch()
      const pageMiddle = decodeSearch(pageMiddlePart)
      expect(pageMiddle.payload.status).toBe("continuation_pending")

      yield* llm.tool("learning_interaction_read", {
        action: "list_terminal_roots",
        limit: 1,
        predecessor: pageMiddle.continuation,
      })
      yield* llm.text("The next exact candidate is selected for bounded materialization.")
      yield* runTurn(Turn.ID.create(), { model: 2, tool: 2 }, "Continue that Interaction search.")
      const pageTwoPart = yield* latestSearch()
      const pageTwo = decodeSearch(pageTwoPart)
      const candidate = Array.isArray(pageTwo.payload.items)
        ? pageTwo.payload.items.find(
            (item) =>
              Schema.is(LearningInspectionCursor.Candidate)(item) &&
              item.descriptor.sessionID === oversizedSessionID &&
              item.descriptor.turnID === oversizedTurnID,
          )
        : undefined
      if (!candidate || !Schema.is(LearningInspectionCursor.Candidate)(candidate)) {
        return yield* Effect.die("Expected the 65th oversized Interaction candidate")
      }

      const materializeInput = {
        action: "materialize_interaction_locator" as const,
        candidate,
        predecessor: pageTwo.continuation,
        maxRows: 16,
        maxBytes: 32_768,
      }
      yield* llm.tool("learning_interaction_read", materializeInput)
      yield* llm.text("The candidate exceeded the bounded locator budget.")
      yield* runTurn(Turn.ID.create(), { model: 2, tool: 2 }, "Inspect that exact candidate.")
      const overBudgetPart = yield* latestSearch()
      const overBudget = decodeSearch(overBudgetPart)
      expect(overBudget.payload.status).toBe("interaction_locator_over_budget")
      const persistedOverBudget = yield* database.db
        .select()
        .from(PartTable)
        .where(eq(PartTable.id, overBudgetPart.id))
        .get()
        .pipe(Effect.orDie)
      expect(
        persistedOverBudget
          ? {
              id: persistedOverBudget.id,
              messageID: persistedOverBudget.message_id,
              sessionID: persistedOverBudget.session_id,
              ...persistedOverBudget.data,
            }
          : undefined,
      ).toEqual(overBudgetPart)

      yield* llm.tool("learning_interaction_read", {
        action: "skip_interaction_candidate",
        candidate,
        predecessor: overBudget.continuation,
      })
      yield* llm.text("The oversized candidate was explicitly skipped with a permanent gap.")
      yield* runTurn(Turn.ID.create(), { model: 2, tool: 2 }, "Skip it and continue truthfully.")
      const skippedPart = yield* latestSearch()
      const skipped = decodeSearch(skippedPart)
      expect(skipped.payload.status).toBe("candidate_skipped")
      expect(skipped.continuation.gapCounts.oversizedCandidateSkipped).toBe(1)

      yield* llm.tool("learning_interaction_read", {
        action: "list_terminal_roots",
        limit: 1,
        predecessor: skipped.continuation,
      })
      const exhaustionTurnID = Turn.ID.create()
      const exhausted = yield* runTurn(
        exhaustionTurnID,
        { model: 1, tool: 1 },
        "Continue until the exact Turn budget is exhausted.",
      )
      expect(exhausted).toMatchObject({
        state: "exhausted",
        inspectionExhaustion: {
          type: "predecessor_continuation_exhausted",
          counter: "model",
          gapCounts: { oversizedCandidateSkipped: 1 },
        },
      })
      const exhaustedPart = yield* latestSearch()

      const persistedRows = yield* database.db
        .select()
        .from(PartTable)
        .where(
          inArray(PartTable.id, [
            pageOnePart.id,
            pageMiddlePart.id,
            pageTwoPart.id,
            overBudgetPart.id,
            skippedPart.id,
            exhaustedPart.id,
          ]),
        )
        .all()
        .pipe(Effect.orDie)
      const persistedParts = persistedRows.map(
        (row) =>
          ({ id: row.id, messageID: row.message_id, sessionID: row.session_id, ...row.data }) as SessionV1.ToolPart,
      )
      const renderPart = async (part: SessionV1.ToolPart) => {
        const app = await testRender(
          () => createComponent(LearningInspectionToolContent, { part: part as unknown as SDKToolPart }),
          { width: 180, height: 34 },
        )
        try {
          await app.renderOnce()
          return app.captureCharFrame()
        } finally {
          app.renderer.destroy()
        }
      }
      const frames = yield* Effect.promise(() => Promise.all(persistedParts.map(renderPart)))
      const replayA = yield* Effect.promise(() =>
        renderPart(persistedParts.find((part) => part.id === overBudgetPart.id)!),
      )
      const replayB = yield* Effect.promise(() =>
        renderPart(persistedParts.find((part) => part.id === overBudgetPart.id)!),
      )
      expect(replayA).toBe(replayB)
      const exhaustionApp = yield* Effect.promise(() =>
        testRender(
          () =>
            createComponent(LearningInspectionExhaustionContent, {
              turn: exhausted as unknown as SDKTurnInfo,
            }),
          { width: 180, height: 12 },
        ),
      )
      let exhaustionFrame = ""
      try {
        yield* Effect.promise(() => exhaustionApp.renderOnce())
        exhaustionFrame = exhaustionApp.captureCharFrame()
      } finally {
        exhaustionApp.renderer.destroy()
      }
      const frame = [...frames, exhaustionFrame].join("\n")
      expect(frame).toContain("continuation_pending")
      expect(frame).toContain("interaction_locator_over_budget")
      expect(frame).toContain("candidate_skipped")
      expect(frame).toContain("Turn exhausted — model capacity 1/1")
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
  { timeout: 30_000 },
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
      yield* awaitWithTimeout(llm.wait(1), "first model operation was not sampled", "10 seconds")

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
        "10 seconds",
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

      yield* awaitWithTimeout(llm.wait(2), "the rebuilt A model operation was not sampled", "10 seconds")
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
      yield* awaitWithTimeout(
        llm.wait(3),
        "the model operation causally bound to steer B was not sampled",
        "10 seconds",
      )
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
      expect(laterBlock).toBe(firstCut.renderedBlock)
      expect(laterBlock).not.toContain(responseText)
      expect(laterBlock).not.toContain(criterion)
      const firstEvidence = firstCut.cut.sections.find((section) => section.owner === "learner_response_evidence")
      expect(firstEvidence).toMatchObject({
        countAtCut: 1,
        entries: [
          {
            semantic: {
              state: "value",
              value: { relation: "supports", exposure: "learner_response_before_tutor_disclosure" },
            },
          },
        ],
      })
      const firstSemantic = firstEvidence?.entries[0]?.semantic
      const firstRelation =
        firstSemantic?.state === "value" && isJsonObject(firstSemantic.value) ? firstSemantic.value.relation : undefined
      expect(firstRelation === "supports" ? "application_question_only" : "underdetermined_without_record").toBe(
        "application_question_only",
      )
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
      const correctedOperation = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, correctedLaterTurnID))
        .get()
        .pipe(Effect.orDie)
      if (!correctedOperation) return yield* Effect.die("Missing corrected later provider operation")
      const correctedCut = yield* database.db.transaction((tx) =>
        LearningContext.readCut(tx, correctedOperation.assistantMessageID),
      )
      if (correctedCut.type !== "available") return yield* Effect.die("Missing corrected later production cut")
      expect(correctedBlock).toBe(correctedCut.renderedBlock)
      expect(correctedCut.cut.fingerprint).not.toBe(firstCut.cut.fingerprint)
      const correctedEvidence = correctedCut.cut.sections.find(
        (section) => section.owner === "learner_response_evidence",
      )
      expect(correctedEvidence).toMatchObject({
        countAtCut: 1,
        entries: [{ semantic: { state: "value", value: { relation: "does_not_support" } } }],
      })
      const correctedSemantic = correctedEvidence?.entries[0]?.semantic
      const correctedRelation =
        correctedSemantic?.state === "value" && isJsonObject(correctedSemantic.value)
          ? correctedSemantic.value.relation
          : undefined
      expect(correctedRelation === "does_not_support" ? "correction_only" : "underdetermined_without_record").toBe(
        "correction_only",
      )

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
      const disclosureOperation = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, disclosureLaterTurnID))
        .get()
        .pipe(Effect.orDie)
      if (!disclosureOperation) return yield* Effect.die("Missing disclosure-order provider operation")
      const disclosureCut = yield* database.db.transaction((tx) =>
        LearningContext.readCut(tx, disclosureOperation.assistantMessageID),
      )
      if (disclosureCut.type !== "available") return yield* Effect.die("Missing disclosure-order production cut")
      expect(disclosureBlock).toBe(disclosureCut.renderedBlock)
      const disclosureEvidence = disclosureCut.cut.sections.find(
        (section) => section.owner === "learner_response_evidence",
      )
      expect(disclosureEvidence).toMatchObject({
        countAtCut: 1,
        entries: [
          {
            semantic: {
              state: "value",
              value: { relation: "supports", exposure: "tutor_disclosure_before_learner_response" },
            },
          },
        ],
      })
      const disclosureSemantic = disclosureEvidence?.entries[0]?.semantic
      const disclosureValue =
        disclosureSemantic?.state === "value" && isJsonObject(disclosureSemantic.value)
          ? disclosureSemantic.value
          : undefined
      expect(
        disclosureValue?.relation === "supports" &&
          disclosureValue.exposure === "tutor_disclosure_before_learner_response"
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
      expect(beforeBlock).toContain('["future_attention","empty",0')
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
      expect(serviceBlock).toContain(
        "FutureAttention: conditional default. An exact current learner request may override an overlapping present action; otherwise realize the sole complete concern naturally. Override alone neither serves nor mutates it.",
      )
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
      expect(afterBlock).toContain('["future_attention","empty",0')
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
          request:
            "The library says I must return the textbook Friday; do not teach, guide, review, or plan around it.",
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
        .get(
          sql`
          SELECT
            (SELECT count(*) FROM assignment_revision) AS revisions,
            (SELECT count(*) FROM assignment_effect) AS effects,
            (SELECT count(*) FROM assignment_commit_seal) AS seals
        `,
        )
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
      expect(contextBlock).toContain(
        "Assignment is learning-help pressure, not task administration/default/priority/plan/commitment/progress/result.",
      )
      expect(contextBlock).toContain(summary)
      expect(contextBlock).toContain(created.revision.id)

      const messages = yield* sessions.messages({ sessionID: helpSessionID })
      const readPart = messages
        .flatMap((message) => message.parts)
        .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.tool === Assignment.READ_CAPABILITY)
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
        messages.flatMap((message) => message.parts).some((part) => part.type === "text" && part.text === explanation),
      ).toBe(true)

      expect(
        yield* database.db
          .get(
            sql`
            SELECT
              (SELECT count(*) FROM assignment_revision) AS revisions,
              (SELECT count(*) FROM assignment_effect) AS effects,
              (SELECT count(*) FROM assignment_commit_seal) AS seals
          `,
          )
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
      const initialBody =
        "Can state the binary-search invariant; applying it to choose the safe discarded half remains uncertain."
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
      const hasExactRead = (body: unknown, input: { revisionID: string; version: number; judgmentBody: string }) =>
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
              hasApplicationRequest(hit.body) && hasExactDirectory(hit.body, input) && hasExactRead(hit.body, input),
            input.teaching,
          )
        })
      const writesAfterCreate = yield* database.db
        .get(
          sql`
          SELECT
            (SELECT count(*) FROM learner_state_judgment_revision) AS revisions,
            (SELECT count(*) FROM learner_state_judgment_effect) AS effects,
            (SELECT count(*) FROM learner_state_judgment_commit_seal) AS seals
        `,
        )
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
      expect(firstApplicationBody).toContain(
        "Use update_learner_state_judgment only when a fuzzy, source-bearing account",
      )
      expect(firstApplicationBody).not.toContain(report)
      expect(firstApplicationBody).not.toContain(creationAcknowledgement)
      const absentBody = (yield* llm.hits)[creationHit]?.body
      expect(hasExactDirectory(absentBody, { revisionID: firstRevisionID, version: 1 })).toBe(false)
      expect(hasExactRead(absentBody, { revisionID: firstRevisionID, version: 1, judgmentBody: initialBody })).toBe(
        false,
      )
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
          .get(
            sql`
            SELECT
              (SELECT count(*) FROM learner_state_judgment_revision) AS revisions,
              (SELECT count(*) FROM learner_state_judgment_effect) AS effects,
              (SELECT count(*) FROM learner_state_judgment_commit_seal) AS seals
          `,
          )
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
          hasApplicationRequest(hit.body) && hasExactDirectory(hit.body, { revisionID: firstRevisionID, version: 1 }),
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
      if (!beforeCorrection.currentHead)
        return yield* Effect.die("Current learner-state read omitted its correction head")
      const correction =
        "Correction: I do not reliably understand what the binary-search invariant means yet, so start with the definition."
      const correctedBody =
        "The binary-search invariant definition itself remains uncertain; application should follow later."
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
      expect(hasExactDirectory(applicationContextBody, { revisionID: corrected.revision.id, version: 1 })).toBe(false)
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
      const zeroWriteTeaching =
        "A mutex protects one critical section at a time; picture one key passed between threads."
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
      const hasTeachingRequest = (body: unknown) => providerText(body).some((value) => value.includes(teachingRequest))
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
      const hasExactRead = (body: unknown, input: { revisionID: string; version: number; body: string }) =>
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
              hasTeachingRequest(hit.body) && hasExactDirectory(hit.body, input) && hasExactRead(hit.body, input),
            input.teaching,
          )
        })

      const writesAfterCreate = yield* database.db.get(sql`
        SELECT
          (SELECT count(*) FROM advisory_plan_suggestion_revision) AS revisions,
          (SELECT count(*) FROM advisory_plan_suggestion_effect) AS effects,
          (SELECT count(*) FROM advisory_plan_suggestion_commit_seal) AS seals
      `)
      const absentControl =
        "No retained advisory directory is available in this Session, so I need current guidance before using it."
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
        absentMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === absentControl),
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
      expect(
        hasExactDirectory(firstContextBody, {
          revisionID: firstRevisionID,
          version: 1,
          directorySummary: initialSummary,
        }),
      ).toBe(true)
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
      expect(
        hasExactDirectory(correctedContextBody, {
          revisionID: corrected.revision.id,
          version: 2,
          directorySummary: correctedSummary,
        }),
      ).toBe(true)
      expect(
        hasExactRead(correctedReadBody, {
          revisionID: corrected.revision.id,
          version: 2,
          body: correctedBody,
        }),
      ).toBe(true)
      expect(
        hasExactDirectory(firstContextBody, {
          revisionID: corrected.revision.id,
          version: 2,
          directorySummary: correctedSummary,
        }),
      ).toBe(false)
      expect(
        hasExactRead(firstReadBody, {
          revisionID: corrected.revision.id,
          version: 2,
          body: correctedBody,
        }),
      ).toBe(false)
      expect(
        hasExactDirectory(correctedContextBody, {
          revisionID: firstRevisionID,
          version: 2,
          directorySummary: correctedSummary,
        }),
      ).toBe(false)
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
      expect(
        hasExactDirectory(wrongRevisionContextBody, {
          revisionID: corrected.revision.id,
          version: 2,
          directorySummary: correctedSummary,
        }),
      ).toBe(true)
      expect(
        hasExactDirectory(wrongRevisionContextBody, {
          revisionID: firstRevisionID,
          version: 1,
          directorySummary: initialSummary,
        }),
      ).toBe(false)
      expect(
        hasExactRead(wrongRevisionReadBody, {
          revisionID: corrected.revision.id,
          version: 2,
          body: correctedBody,
        }),
      ).toBe(true)
      expect(
        hasExactRead(wrongRevisionReadBody, {
          revisionID: firstRevisionID,
          version: 1,
          body: initialBody,
        }),
      ).toBe(false)
      const wrongRevisionMessages = yield* sessions.messages({ sessionID: wrongRevisionSessionID })
      expect(
        wrongRevisionMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === currentControlTeaching),
      ).toBe(true)
      expect(
        wrongRevisionMessages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "text" && part.text === staleBodyTeaching),
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
              messages
                .flatMap((message) => message.parts)
                .some((part) => part.type === "text" && part.text === item.response),
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
  "continues from one source-discriminating prior Interaction fact in a fresh Session",
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

      const bootstrapInput = {
        course: { type: "new", title: "Euclidean algorithm" },
        route: {
          type: "new_view",
          key: "main",
          name: "Euclidean algorithm route",
          authorship: "learner_requested",
          revision: { items: [{ key: "first-remainder", title: "Trace the first exact remainder" }] },
        },
        selection: { type: "set", target: { type: "route" } },
        anchor: { type: "set", target: { type: "route_item", itemKey: "first-remainder" } },
      } as const
      const sourceRequest = "Create a useful Euclidean-algorithm route and teach the first worked step."
      const sourceFact =
        "We stopped at the candidate-specific step 84217 = 3 × 27109 + 2890; next, replace (84217, 27109) with (27109, 2890)."
      const sourceSessionID = SessionID.create()
      const sourceTurnID = Turn.ID.create()
      yield* llm.tool(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, bootstrapInput)
      yield* llm.text(sourceFact)
      yield* prompt.start({
        sessionID: sourceSessionID,
        turnID: sourceTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Gate 23 source-discriminating floor",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: sourceRequest }],
      })
      expect((yield* prompt.awaitTurn(sourceSessionID, sourceTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })

      const controlSessionID = SessionID.create()
      const projection = yield* database.db.transaction((tx) =>
        TurnLearningContext.projectLearningContext(tx, { currentSessionID: controlSessionID, limit: 4 }),
      )
      const sourceLocator = projection.entries.find((entry) => entry.locator.turnID === sourceTurnID)?.locator
      if (!sourceLocator || sourceLocator.status !== "available") {
        return yield* Effect.die("Gate 23 product-floor source Turn has no exact current Interaction locator")
      }
      const stableLearningState = yield* Effect.all({
        domain: learningDomainDigest(database.db),
        frontier: database.db.transaction((tx) => LearningFrontier.read(tx)),
      })
      const continueRequest = "Continue from exactly where we left off."
      const controlClarification = "Which exact unfinished worked step should I resume?"
      const sourceLocatorVisible = (body: unknown) => {
        const text = providerText(body).join("\n")
        return (
          text.includes(continueRequest) &&
          text.includes(sourceTurnID) &&
          !text.includes(sourceFact) &&
          !/(?:84217|27109|2890)/.test(text)
        )
      }

      const controlStart = (yield* llm.hits).length
      const pendingBeforeControl = yield* llm.pending
      yield* llm.textMatch((hit) => sourceLocatorVisible(hit.body), controlClarification)
      const controlTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID: controlSessionID,
        turnID: controlTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 1 },
        session: {
          title: "Gate 23 floor withheld control",
          permission: [
            { permission: "*", pattern: "*", action: "allow" },
            { permission: "learning_interaction_read", pattern: "*", action: "deny" },
          ],
        },
        parts: [{ type: "text", text: continueRequest }],
      })
      expect((yield* prompt.awaitTurn(controlSessionID, controlTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 1, tool: 0 },
      })
      expect(yield* llm.pending).toBe(pendingBeforeControl)
      const controlHit = (yield* llm.hits)
        .slice(controlStart)
        .find((hit) => providerText(hit.body).some((value) => value.includes(continueRequest)))
      expect(sourceLocatorVisible(controlHit?.body)).toBe(true)
      const controlMessages = yield* sessions.messages({ sessionID: controlSessionID })
      expect(controlMessages.flatMap((message) => message.parts)).toContainEqual(
        expect.objectContaining({ type: "text", text: controlClarification }),
      )
      expect(controlMessages.flatMap((message) => message.parts).some((part) => part.type === "tool")).toBe(false)

      const positiveSessionID = SessionID.create()
      const positiveTurnID = Turn.ID.create()
      const positiveDirectory = yield* database.db.transaction((tx) =>
        TurnLearningContext.projectLearningContext(tx, { currentSessionID: positiveSessionID, limit: 4 }),
      )
      const sourceEntryIndex = positiveDirectory.entries.findIndex((entry) => entry.locator.turnID === sourceTurnID)
      if (sourceEntryIndex < 0) {
        return yield* Effect.die("Gate 23 product-floor source is absent from the positive recent directory")
      }
      const positiveTeaching =
        "Resume the exact unfinished step: 27109 = 9 × 2890 + 1099, so the next pair is (2890, 1099)."
      const positiveStart = (yield* llm.hits).length
      const pendingBeforePositive = yield* llm.pending
      yield* llm.toolMatch((hit) => sourceLocatorVisible(hit.body), "learning_interaction_read", {
        action: "list_recent",
        limit: 4,
      })
      yield* llm.toolMatch(
        (hit) => {
          const text = providerText(hit.body).join("\n")
          return (
            text.includes(continueRequest) &&
            text.includes(sourceTurnID) &&
            text.includes('"directoryCallID":"call_1"') &&
            !text.includes(sourceFact)
          )
        },
        "learning_interaction_read",
        {
          action: "read_recent_range",
          directoryCallID: "call_1",
          entryIndex: sourceEntryIndex,
        },
      )
      yield* llm.textMatch((hit) => {
        const text = providerText(hit.body).join("\n")
        return text.includes(continueRequest) && /84217/.test(text) && /27109/.test(text) && /2890/.test(text)
      }, positiveTeaching)
      yield* prompt.start({
        sessionID: positiveSessionID,
        turnID: positiveTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 3, tool: 2 },
        session: {
          title: "Gate 23 exact product-floor continuation",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: continueRequest }],
      })
      expect((yield* prompt.awaitTurn(positiveSessionID, positiveTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 3, tool: 2 },
      })

      const positiveMessages = yield* sessions.messages({ sessionID: positiveSessionID })
      const interactionReads = positiveMessages
        .flatMap((message) => message.parts)
        .filter((part): part is SessionV1.ToolPart => part.type === "tool" && part.tool === "learning_interaction_read")
      const directoryRead = interactionReads[0]
      const exactRead = interactionReads[1]
      if (
        !directoryRead ||
        directoryRead.state.status !== "completed" ||
        !exactRead ||
        exactRead.state.status !== "completed"
      ) {
        return yield* Effect.die("Gate 23 product-floor continuation omitted its compact exact Interaction read")
      }
      expect(directoryRead.state.output).toContain('"directoryCallID":"call_1"')
      expect(directoryRead.state.output).not.toContain(sourceFact)
      expect(exactRead.state.input).toMatchObject({
        action: "read_recent_range",
        directoryCallID: "call_1",
        entryIndex: sourceEntryIndex,
      })
      expect(exactRead.state.output).toMatch(/84217.*27109.*2890/s)
      const positiveHits = (yield* llm.hits)
        .slice(positiveStart)
        .filter((hit) => providerText(hit.body).some((value) => value.includes(continueRequest)))
      expect(providerText(positiveHits[0]?.body).join("\n")).not.toMatch(/(?:84217|27109|2890)/)
      expect(providerText(positiveHits[1]?.body).join("\n")).not.toMatch(/(?:84217|27109|2890)/)
      expect(providerText(positiveHits[2]?.body).join("\n")).toMatch(/84217.*27109.*2890/s)
      expect(yield* llm.pending).toBe(pendingBeforePositive)
      expect(positiveMessages.flatMap((message) => message.parts)).toContainEqual(
        expect.objectContaining({ type: "text", text: positiveTeaching }),
      )
      expect(positiveMessages.flatMap((message) => message.parts)).not.toContainEqual(
        expect.objectContaining({ type: "text", text: controlClarification }),
      )

      const operations = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, positiveTurnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      const firstOperation = operations[0]
      if (!firstOperation) return yield* Effect.die("Gate 23 product-floor continuation has no model operation")
      const cut = yield* database.db.transaction((tx) => LearningContext.readCut(tx, firstOperation.assistantMessageID))
      expect(JSON.stringify(cut)).toContain(sourceTurnID)
      expect(
        yield* Effect.all({
          domain: learningDomainDigest(database.db),
          frontier: database.db.transaction((tx) => LearningFrontier.read(tx)),
        }),
      ).toEqual(stableLearningState)

      yield* sessions.remove(sourceSessionID)
      yield* sessions.remove(controlSessionID)
      yield* sessions.remove(positiveSessionID)
    }),
  { config: cfg },
  90_000,
)

isolatedDatabaseBoundary.instance(
  "isolates a corrected learner-state successor in fresh-Session teaching and a withheld control",
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

      const journeySessionID = SessionID.create()
      const teachingRequest = "Teach the binary-search invariant with one concrete comparison."
      const initialTeaching =
        "Before each comparison, if the target exists, its index remains inside the current interval; compare the midpoint and discard only indices the comparison makes impossible."
      yield* llm.textMatch(
        (hit) => providerText(hit.body).some((value) => value.includes(teachingRequest)),
        initialTeaching,
      )
      const teachingTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID: journeySessionID,
        turnID: teachingTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "Gate 23 durable learner journey" },
        parts: [{ type: "text", text: teachingRequest }],
      })
      expect((yield* prompt.awaitTurn(journeySessionID, teachingTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 1, tool: 0 },
      })

      const report =
        "I can repeat the invariant, but I still cannot tell which half becomes impossible after the comparison."
      const subject = "Binary-search invariant application"
      const initialBody =
        "Can repeat the invariant; choosing the impossible half from one comparison remains uncertain."
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
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY, createInput)
      yield* llm.text("I retained that fallible report for later teaching without treating it as mastery.")
      const reportTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID: journeySessionID,
        turnID: reportTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        parts: [{ type: "text", text: report }],
      })
      expect((yield* prompt.awaitTurn(journeySessionID, reportTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      const created = (yield* database.db.transaction((tx) =>
        LearnerStateJudgment.read(tx, { type: "discover", disposition: "active" }, { limit: 8 }),
      )).items.find(
        (item): item is LearnerStateJudgment.Judgment =>
          "current" in item && item.current.snapshot.subject.label === subject,
      )
      if (!created) return yield* Effect.die("Gate 23 learner report did not produce a judgment head")
      const judgmentID = created.id
      const firstRevisionID = created.current.id
      const applicationRequest = "Use my current learner-state memory and teach the binary-search step I am missing."
      const hasExactDirectory = (body: unknown, revisionID: string, version: number) => {
        const text = providerText(body).join("\n")
        return (
          text.includes(applicationRequest) &&
          text.includes("[Repa learning context — protected]") &&
          text.includes('"learner_state_judgment"') &&
          text.includes(judgmentID) &&
          text.includes(revisionID) &&
          text.includes(subject) &&
          Number.isInteger(version)
        )
      }
      const hasExactRead = (body: unknown, revisionID: string, version: number, judgmentBody: string) => {
        const text = providerText(body).join("\n")
        return (
          text.includes(applicationRequest) &&
          text.includes('"returnedCount":1') &&
          text.includes(`"id":"${revisionID}"`) &&
          text.includes(`"judgmentID":"${judgmentID}"`) &&
          text.includes(`"version":${version}`) &&
          text.includes(`"judgmentBody":${JSON.stringify(judgmentBody)}`)
        )
      }

      const initialApplicationTeaching =
        "If target < a[mid], every index at or right of mid is impossible; if target > a[mid], every index at or left of mid is impossible."
      const initialConsumerStart = (yield* llm.hits).length
      yield* llm.toolMatch(
        (hit) => {
          const text = providerText(hit.body).join("\n")
          return text.includes(applicationRequest) && text.includes(judgmentID)
        },
        LearnerStateJudgment.READ_CAPABILITY,
        { action: "revision", judgmentID, revisionID: firstRevisionID },
      )
      yield* llm.textMatch((hit) => hasExactRead(hit.body, firstRevisionID, 1, initialBody), initialApplicationTeaching)
      const initialConsumerSessionID = SessionID.create()
      const initialConsumerTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID: initialConsumerSessionID,
        turnID: initialConsumerTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Gate 23 initial learner-state consumer",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: applicationRequest }],
      })
      expect((yield* prompt.awaitTurn(initialConsumerSessionID, initialConsumerTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      const initialConsumerHits = (yield* llm.hits)
        .slice(initialConsumerStart)
        .filter((hit) => providerText(hit.body).some((value) => value.includes(applicationRequest)))
      expect(hasExactDirectory(initialConsumerHits[0]?.body, firstRevisionID, 1)).toBe(true)
      expect(hasExactRead(initialConsumerHits[1]?.body, firstRevisionID, 1, initialBody)).toBe(true)
      const initialOperations = yield* database.db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, initialConsumerTurnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      const initialOperation = initialOperations[0]
      if (!initialOperation) return yield* Effect.die("Gate 23 initial learner-state consumer has no model operation")
      const immutableInitialCut = JSON.stringify(
        yield* database.db.transaction((tx) => LearningContext.readCut(tx, initialOperation.assistantMessageID)),
      )

      const current = yield* database.db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, judgmentID, Date.now()),
      )
      if (!current?.currentHead) return yield* Effect.die("Gate 23 learner-state correction lost the current head")
      const correctionSessionID = SessionID.create()
      const currentReadRequest = "Read the exact current learner-state judgment before I correct it."
      const currentReadRelease = Promise.withResolvers<void>()
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          currentReadRelease.resolve()
          setSystemTime()
        }),
      )
      const currentReadHitStart = (yield* llm.hits).length
      yield* llm.tool(LearnerStateJudgment.READ_CAPABILITY, { action: "current", judgmentID, includeInspection: true })
      yield* llm.hold("What would you like to correct in that current judgment?", currentReadRelease.promise)
      const currentReadTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID: correctionSessionID,
        turnID: currentReadTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Gate 23 learner-state correction source",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: currentReadRequest }],
      })
      yield* awaitWithTimeout(
        llm.wait(currentReadHitStart + 2),
        "Gate 23 current-read final model operation was not sampled",
        "10 seconds",
      )
      const currentReadLive = yield* database.db
        .select({ causalTime: TurnTable.causal_time })
        .from(TurnTable)
        .where(eq(TurnTable.id, currentReadTurnID))
        .get()
        .pipe(Effect.orDie)
      const presentationFrontier = yield* database.db
        .select({ time: SessionPresentationFrontierTable.frontier_time })
        .from(SessionPresentationFrontierTable)
        .where(eq(SessionPresentationFrontierTable.session_id, correctionSessionID))
        .get()
        .pipe(Effect.orDie)
      const sharedFrontier = yield* database.db.transaction((tx) => LearningFrontier.read(tx))
      const equalTime = Math.max(
        Date.now(),
        currentReadLive?.causalTime ?? 0,
        presentationFrontier?.time ?? 0,
        sharedFrontier.time,
      ) + 1_000
      setSystemTime(new Date(equalTime))
      currentReadRelease.resolve()
      expect((yield* prompt.awaitTurn(correctionSessionID, currentReadTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      const currentReadTerminal = yield* database.db
        .select({ time: TurnTable.time_terminal })
        .from(TurnTable)
        .where(eq(TurnTable.id, currentReadTurnID))
        .get()
        .pipe(Effect.orDie)
      expect(currentReadTerminal?.time).toBe(equalTime)
      const currentReadPart = (yield* sessions.messages({ sessionID: correctionSessionID }))
        .flatMap((message) => message.parts)
        .find(
          (part): part is SessionV1.ToolPart =>
            part.type === "tool" && part.tool === LearnerStateJudgment.READ_CAPABILITY,
        )
      if (!currentReadPart || currentReadPart.state.status !== "completed") {
        return yield* Effect.die("Gate 23 compact correction source omitted its exact current read")
      }
      expect(currentReadPart.state.output).toContain(current.currentHead.revisionID)
      expect(currentReadPart.state.output).toContain(
        `"correctionHandle":{"currentReadCallID":"${currentReadPart.callID}"}`,
      )
      const correction =
        "Correction: the invariant definition itself is still unclear, so define it before asking me to discard a half."
      const correctedBody =
        "The invariant definition itself remains uncertain; application and half-discard choices should follow later."
      const correctionInput = {
        operation: "revise_from_current_read" as const,
        currentReadCallID: currentReadPart.callID,
        sourceExcerpt: correction,
        judgmentBody: correctedBody,
        uncertaintyAndLimits: "Natural learner correction; fallible and revisable.",
        rationale: "Use the learner's correction to change the next teaching focus.",
      }
      const correctionTurnID = Turn.ID.create()
      yield* llm.tool(LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY, correctionInput)
      yield* llm.text("I corrected the remembered judgment without treating either revision as mastery.")
      yield* prompt.start({
        sessionID: correctionSessionID,
        turnID: correctionTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        parts: [{ type: "text", text: correction }],
      })
      expect((yield* prompt.awaitTurn(correctionSessionID, correctionTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })
      const correctionAdmission = yield* database.db
        .select({ time: TurnTable.time_admitted })
        .from(TurnTable)
        .where(eq(TurnTable.id, correctionTurnID))
        .get()
        .pipe(Effect.orDie)
      expect(correctionAdmission?.time).toBe(equalTime)
      const compactCorrectionTool = (yield* sessions.messages({ sessionID: correctionSessionID }))
        .flatMap((message) => message.parts)
        .find(
          (part): part is SessionV1.ToolPart =>
            part.type === "tool" && part.tool === LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY,
        )
      if (!compactCorrectionTool || compactCorrectionTool.state.status !== "completed") {
        return yield* Effect.die(
          `Gate 23 compact learner-state correction did not complete its typed tool: ${JSON.stringify(compactCorrectionTool?.state)}`,
        )
      }
      expect(compactCorrectionTool.state.metadata).toMatchObject({ outcome: "applied" })
      expect(compactCorrectionTool.state.output).toContain(judgmentID)
      expect(compactCorrectionTool.state.input).toMatchObject({
        operation: "revise",
        judgmentID,
        expectedHead: current.currentHead,
        cause: {
          type: "learner_correction",
          excerpt: {
            text: correction,
            startByte: 0,
            endByte: new TextEncoder().encode(correction).byteLength,
          },
        },
        snapshot: {
          subject: current.revision.snapshot.subject,
          judgmentBody: correctedBody,
          exactBasisRefs: current.revision.snapshot.exactBasis.map((basis) => basis.ref),
        },
      })
      const compactCandidate = yield* database.db
        .select({ envelope: TurnToolCandidateTable.normalized_envelope })
        .from(TurnToolCandidateTable)
        .where(eq(TurnToolCandidateTable.part_id, compactCorrectionTool.id))
        .get()
        .pipe(Effect.orDie)
      expect(compactCandidate?.envelope).toEqual({ input: correctionInput })
      const corrected = yield* database.db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, judgmentID, Date.now()),
      )
      if (!corrected) return yield* Effect.die("Gate 23 correction did not produce a successor")
      expect(corrected.currentRelation).toBe("current")
      expect(corrected.revision).toMatchObject({
        version: 2,
        predecessorRevisionID: firstRevisionID,
        snapshot: { judgmentBody: correctedBody },
      })
      expect(
        yield* database.db.transaction((tx) => LearnerStateJudgment.readExactRevision(tx, judgmentID, firstRevisionID)),
      ).toEqual(created.current)
      const stableCorrectedState = yield* Effect.all({
        domain: learningDomainDigest(database.db),
        frontier: database.db.transaction((tx) => LearningFrontier.read(tx)),
      })

      const withheldTeaching = "What changed in your understanding of the invariant definition?"
      const withheldSessionID = SessionID.create()
      const withheldTurnID = Turn.ID.create()
      const withheldStart = (yield* llm.hits).length
      yield* llm.textMatch((hit) => {
        const text = providerText(hit.body).join("\n")
        return text.includes(applicationRequest) && !text.includes(correction) && !text.includes(correctedBody)
      }, withheldTeaching)
      yield* prompt.start({
        sessionID: withheldSessionID,
        turnID: withheldTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 1 },
        session: {
          title: "Gate 23 successor-withheld control",
          permission: [
            { permission: "*", pattern: "*", action: "allow" },
            { permission: LearnerStateJudgment.READ_CAPABILITY, pattern: "*", action: "deny" },
            { permission: "learning_interaction_read", pattern: "*", action: "deny" },
          ],
        },
        parts: [{ type: "text", text: applicationRequest }],
      })
      expect((yield* prompt.awaitTurn(withheldSessionID, withheldTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 1, tool: 0 },
      })
      const withheldHit = (yield* llm.hits)
        .slice(withheldStart)
        .find((hit) => providerText(hit.body).some((value) => value.includes(applicationRequest)))
      expect(providerText(withheldHit?.body).join("\n")).not.toContain(correction)
      expect(providerText(withheldHit?.body).join("\n")).not.toContain(correctedBody)

      const correctedTeaching =
        "Start with the definition: before each loop iteration, the current interval contains every still-possible target index; only after that statement is clear should a comparison eliminate one half."
      const positiveSessionID = SessionID.create()
      const positiveTurnID = Turn.ID.create()
      const positiveStart = (yield* llm.hits).length
      yield* llm.toolMatch(
        (hit) => {
          const text = providerText(hit.body).join("\n")
          return (
            hasExactDirectory(hit.body, corrected.revision.id, 2) &&
            !text.includes(correction) &&
            !text.includes(correctedBody)
          )
        },
        LearnerStateJudgment.READ_CAPABILITY,
        { action: "revision", judgmentID, revisionID: corrected.revision.id },
      )
      yield* llm.textMatch((hit) => hasExactRead(hit.body, corrected.revision.id, 2, correctedBody), correctedTeaching)
      yield* prompt.start({
        sessionID: positiveSessionID,
        turnID: positiveTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 1 },
        session: {
          title: "Gate 23 isolated successor consumer",
          permission: [
            { permission: "*", pattern: "*", action: "allow" },
            { permission: "learning_interaction_read", pattern: "*", action: "deny" },
          ],
        },
        parts: [{ type: "text", text: applicationRequest }],
      })
      expect((yield* prompt.awaitTurn(positiveSessionID, positiveTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 2, tool: 1 },
      })

      const positiveHits = (yield* llm.hits)
        .slice(positiveStart)
        .filter((hit) => providerText(hit.body).some((value) => value.includes(applicationRequest)))
      expect(providerText(positiveHits[0]?.body).join("\n")).not.toContain(correction)
      expect(providerText(positiveHits[0]?.body).join("\n")).not.toContain(correctedBody)
      expect(providerText(positiveHits[1]?.body).join("\n")).toContain(correctedBody)
      const positiveMessages = yield* sessions.messages({ sessionID: positiveSessionID })
      const positiveTools = positiveMessages
        .flatMap((message) => message.parts)
        .filter((part): part is SessionV1.ToolPart => part.type === "tool")
      expect(positiveTools.map((part) => part.tool)).toEqual([LearnerStateJudgment.READ_CAPABILITY])
      expect(positiveTools[0]?.state.status).toBe("completed")
      expect(positiveTools[0]?.state.status === "completed" ? positiveTools[0].state.output : "").toContain(
        correctedBody,
      )
      expect(positiveMessages.flatMap((message) => message.parts)).toContainEqual(
        expect.objectContaining({ type: "text", text: correctedTeaching }),
      )
      expect(positiveMessages.flatMap((message) => message.parts)).not.toContainEqual(
        expect.objectContaining({ type: "text", text: withheldTeaching }),
      )
      expect(
        yield* Effect.all({
          domain: learningDomainDigest(database.db),
          frontier: database.db.transaction((tx) => LearningFrontier.read(tx)),
        }),
      ).toEqual(stableCorrectedState)
      expect(
        JSON.stringify(
          yield* database.db.transaction((tx) => LearningContext.readCut(tx, initialOperation.assistantMessageID)),
        ),
      ).toBe(immutableInitialCut)

      yield* sessions.remove(journeySessionID)
      yield* sessions.remove(initialConsumerSessionID)
      yield* sessions.remove(correctionSessionID)
      yield* sessions.remove(withheldSessionID)
      yield* sessions.remove(positiveSessionID)
    }),
  { config: cfg },
  120_000,
)

isolatedDatabaseBoundary.instance(
  "changes the next peer teaching move from same-Session feedback without a learning-domain write",
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
      const initialRequest = "Explain a mutex with the one-key picture."
      const initialTeaching =
        "Picture one brass key shared by the threads: only the thread holding that key may enter the critical section."
      const feedback =
        "That key picture did not help. Compare the mutex to a one-lane bridge and show what a waiting thread does."
      const adaptedTeaching =
        "Use a one-lane bridge: one thread drives through the critical section while the others wait at the gate; unlock lets exactly one waiter compete to enter next."

      yield* llm.textMatch(
        (hit) => providerText(hit.body).some((value) => value.includes(initialRequest)),
        initialTeaching,
      )
      const initialTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID,
        turnID: initialTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 1 },
        session: { title: "Gate 23 zero-write feedback" },
        parts: [{ type: "text", text: initialRequest }],
      })
      expect((yield* prompt.awaitTurn(sessionID, initialTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 1, tool: 0 },
      })

      const before = yield* Effect.all({
        domain: learningDomainDigest(database.db),
        frontier: database.db.transaction((tx) => LearningFrontier.read(tx)),
      })
      const pending = yield* llm.pending
      yield* llm.textMatch((hit) => {
        const text = providerText(hit.body).join("\n")
        return text.includes(initialRequest) && text.includes(initialTeaching) && text.includes(feedback)
      }, adaptedTeaching)
      const feedbackTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID,
        turnID: feedbackTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 1 },
        parts: [{ type: "text", text: feedback }],
      })
      expect((yield* prompt.awaitTurn(sessionID, feedbackTurnID)).terminal).toMatchObject({
        outcome: "completed",
        counters: { model: 1, tool: 0 },
      })
      expect(yield* llm.pending).toBe(pending)
      expect(
        yield* Effect.all({
          domain: learningDomainDigest(database.db),
          frontier: database.db.transaction((tx) => LearningFrontier.read(tx)),
        }),
      ).toEqual(before)

      const feedbackHit = (yield* llm.hits).findLast((hit) =>
        providerText(hit.body).some((value) => value.includes(feedback)),
      )
      const providerHistory = providerText(feedbackHit?.body).join("\n")
      expect(providerHistory).toContain(initialRequest)
      expect(providerHistory).toContain(initialTeaching)
      expect(providerHistory).toContain(feedback)
      const messages = yield* sessions.messages({ sessionID })
      expect(messages.flatMap((message) => message.parts)).toContainEqual(
        expect.objectContaining({ type: "text", text: initialTeaching }),
      )
      expect(messages.flatMap((message) => message.parts)).toContainEqual(
        expect.objectContaining({ type: "text", text: adaptedTeaching }),
      )
      expect(messages.flatMap((message) => message.parts).some((part) => part.type === "tool")).toBe(false)
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
  60_000,
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
  "retired Session roots refuse first-Turn, fork-target, and child materialization before owner installation",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const retired = (yield* materializeTestSession({ title: "retired materialization target" })).info
      const source = (yield* materializeTestSession({ title: "live fork source" })).info
      const sourceSequence = yield* database.db
        .select({ sequence: EventSequenceTable.seq })
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, source.id))
        .get()
        .pipe(Effect.orDie)
      if (!sourceSequence) return yield* Effect.die("Expected a live fork-source event sequence")
      const deletion = yield* sessions.proposeRemoval({ sessionID: retired.id, mode: "full" })
      if ("type" in deletion) return yield* Effect.die("Expected a fresh deletion proposal")
      const appliedDeletion = yield* sessions.commitRemoval(deletion)
      expect(appliedDeletion.type).toBe("applied")
      expect(yield* sessions.proposeRemoval({ sessionID: retired.id, mode: "full" })).toMatchObject({
        type: "already_deleted",
        settlementBytes: appliedDeletion.settlementBytes,
        auditAvailable: false,
      })
      expect(yield* sessions.proposeRemoval({ sessionID: retired.id, mode: "minimal_audit" })).toMatchObject({
        type: "deletion_mode_conflict",
        settlementBytes: appliedDeletion.settlementBytes,
        auditAvailable: false,
      })

      const retiredAttempts = [
        prompt.start({
          sessionID: retired.id,
          turnID: Turn.ID.create(),
          inputID: Turn.InputID.create(),
          messageID: MessageID.ascending(),
          agent: "repa",
          model: ref,
          limits: { model: 1, tool: 0 },
          session: { title: "must not recreate deleted root" },
          parts: [{ type: "text" as const, text: "first-Turn root attempt" }],
        }),
        prompt.start({
          sessionID: retired.id,
          turnID: Turn.ID.create(),
          inputID: Turn.InputID.create(),
          messageID: MessageID.ascending(),
          agent: "repa",
          model: ref,
          limits: { model: 1, tool: 0 },
          session: { title: "must not recreate deleted fork target" },
          fork: { sourceSessionID: source.id, sourceEventSequence: sourceSequence.sequence },
          parts: [{ type: "text" as const, text: "fork target attempt" }],
        }),
        prompt.startChild({
          childSessionID: retired.id,
          childTurnID: Turn.ID.create(),
          childInputID: Turn.InputID.create(),
          messageID: MessageID.ascending(),
          parentSessionID: source.id,
          parentTurnID: Turn.ID.create(),
          parentTaskPartID: PartID.ascending(),
          parentModelMessageID: MessageID.ascending(),
          delegatedCapability: { version: 2, parent: [], inherited: [], profile: [], explicit: [] },
          depthLimit: 1,
          limits: { model: 1, tool: 0 },
          model: ref,
          agent: "repa",
          parts: [{ type: "text" as const, text: "delegated child target attempt" }],
          session: { title: "must not recreate deleted child target" },
        }),
      ]
      const exits = yield* Effect.forEach(retiredAttempts, (attempt) => attempt.pipe(Effect.exit), { concurrency: 1 })
      exits.forEach((exit) => {
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(Cause.squash(exit.cause)).toMatchObject({
            _tag: "SessionIDRetiredError",
            sessionID: retired.id,
            deletionRequestID: deletion.requestID,
            mode: "full",
            settlement: appliedDeletion.settlement,
            settlementBytes: appliedDeletion.settlementBytes,
            auditAvailable: false,
          })
        }
      })
      expect(yield* llm.calls).toBe(0)
      expect(
        yield* Effect.all({
          sessions: database.db
            .select()
            .from(SessionTable)
            .where(eq(SessionTable.id, retired.id))
            .all()
            .pipe(Effect.orDie),
          messages: database.db
            .select()
            .from(MessageTable)
            .where(eq(MessageTable.session_id, retired.id))
            .all()
            .pipe(Effect.orDie),
          parts: database.db
            .select()
            .from(PartTable)
            .where(eq(PartTable.session_id, retired.id))
            .all()
            .pipe(Effect.orDie),
          turns: database.db
            .select()
            .from(TurnTable)
            .where(eq(TurnTable.session_id, retired.id))
            .all()
            .pipe(Effect.orDie),
          events: database.db
            .select()
            .from(EventTable)
            .where(eq(EventTable.aggregate_id, retired.id))
            .all()
            .pipe(Effect.orDie),
          sequence: database.db
            .select()
            .from(EventSequenceTable)
            .where(eq(EventSequenceTable.aggregate_id, retired.id))
            .all()
            .pipe(Effect.orDie),
        }),
      ).toEqual({ sessions: [], messages: [], parts: [], turns: [], events: [], sequence: [] })

      const freshSessionID = SessionID.create()
      const freshTurnID = Turn.ID.create()
      yield* llm.text("fresh target remains usable")
      yield* prompt.start({
        sessionID: freshSessionID,
        turnID: freshTurnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        session: { title: "fresh target" },
        parts: [{ type: "text", text: "materialize an unrelated fresh target" }],
      })
      expect((yield* prompt.awaitTurn(freshSessionID, freshTurnID)).terminal).toMatchObject({ outcome: "completed" })
      yield* sessions.remove(freshSessionID)
      yield* sessions.remove(source.id)
    }),
  { config: cfg },
  30_000,
)

noLLMServer.instance(
  "session deletion refuses a concurrent materialization admission without waiting or reusing the stale proposal",
  () =>
    Effect.gen(function* () {
      const { run, sessions, chat } = yield* boot({ title: "serialized materialization deletion race" })
      const database = yield* Database.Service
      const proposal = yield* sessions.proposeRemoval({ sessionID: chat.id, mode: "full" })
      if ("type" in proposal) return yield* Effect.die("Expected a fresh deletion proposal")
      const readerEntered = yield* Deferred.make<void>()
      const releaseReader = yield* Deferred.make<void>()
      const reader = yield* run
        .shared(chat.id, Deferred.succeed(readerEntered, undefined).pipe(Effect.andThen(Deferred.await(releaseReader))))
        .pipe(Effect.forkChild)
      yield* Deferred.await(readerEntered)

      const refused = yield* sessions.commitRemoval(proposal).pipe(Effect.exit)
      expect(Exit.isFailure(refused)).toBe(true)
      if (Exit.isFailure(refused))
        expect(Cause.squash(refused.cause)).toEqual(new Session.BusyError({ sessionID: chat.id }))
      expect(yield* run.phase(chat.id)).toBe("open")
      expect(yield* sessions.get(chat.id)).toMatchObject({ id: chat.id })
      expect(
        yield* database.db
          .select()
          .from(SessionDeletionControlReceiptTable)
          .where(eq(SessionDeletionControlReceiptTable.root_session_id, chat.id))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([])

      yield* Deferred.succeed(releaseReader, undefined)
      yield* Fiber.join(reader)
      const stale = yield* sessions.commitRemoval(proposal).pipe(Effect.exit)
      expect(Exit.isFailure(stale)).toBe(true)
      if (Exit.isFailure(stale)) {
        expect(Cause.squash(stale.cause)).toEqual(
          new SessionDeletion.InvocationConflictError({ requestID: proposal.requestID }),
        )
      }
      const fresh = yield* sessions.proposeRemoval({ sessionID: chat.id, mode: "full" })
      if ("type" in fresh) return yield* Effect.die("Expected a fresh deletion proposal after busy refusal")
      expect((yield* sessions.commitRemoval(fresh)).type).toBe("applied")
      expect(
        yield* Effect.all({
          session: database.db.select().from(SessionTable).where(eq(SessionTable.id, chat.id)).all().pipe(Effect.orDie),
          receipt: database.db
            .select({ requestID: SessionDeletionControlReceiptTable.request_id })
            .from(SessionDeletionControlReceiptTable)
            .where(eq(SessionDeletionControlReceiptTable.root_session_id, chat.id))
            .all()
            .pipe(Effect.orDie),
        }),
      ).toEqual({ session: [], receipt: [{ requestID: fresh.requestID }] })
    }),
  { config: cfg },
)

it.instance(
  "session deletion refuses active work without interruption and consumes the stale proposal",
  () =>
    Effect.gen(function* () {
      const { llm } = yield* useServerConfig(providerCfg)
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const database = yield* Database.Service
      const sessionID = (yield* materializeTestSession({ title: "deletion busy refusal" })).info.id
      const proposal = yield* sessions.proposeRemoval({ sessionID, mode: "full" })
      if ("type" in proposal) return yield* Effect.die("Expected a fresh deletion proposal")
      const turnID = Turn.ID.create()
      yield* llm.hang

      yield* prompt.start({
        sessionID,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 1, tool: 0 },
        parts: [{ type: "text", text: "keep this Turn active during deletion admission" }],
      })
      yield* awaitWithTimeout(llm.wait(1), "model operation was not sampled before deletion admission")
      const eventsBeforeDeletion = yield* database.db
        .select()
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, sessionID))
        .orderBy(EventTable.seq)
        .all()
        .pipe(Effect.orDie)

      const preflight = yield* sessions.proposeRemoval({ sessionID, mode: "minimal_audit" }).pipe(Effect.exit)
      expect(Exit.isFailure(preflight)).toBe(true)
      if (Exit.isFailure(preflight)) {
        expect(Cause.squash(preflight.cause)).toEqual(
          new Turn.SessionTreeBusyError({ sessionID, activeTurnIDs: [turnID] }),
        )
      }

      const raced = yield* sessions.commitRemoval(proposal).pipe(Effect.exit)
      expect(Exit.isFailure(raced)).toBe(true)
      if (Exit.isFailure(raced)) {
        expect(Cause.squash(raced.cause)).toEqual(new Turn.SessionTreeBusyError({ sessionID, activeTurnIDs: [turnID] }))
      }
      expect(yield* sessions.get(sessionID)).toMatchObject({ id: sessionID })
      expect(
        yield* database.db
          .select({ state: TurnTable.state })
          .from(TurnTable)
          .where(eq(TurnTable.id, turnID))
          .get()
          .pipe(Effect.orDie),
      ).toEqual({ state: "running" })
      expect(yield* llm.calls).toBe(1)
      expect(
        yield* database.db
          .select()
          .from(SessionDeletionControlReceiptTable)
          .where(eq(SessionDeletionControlReceiptTable.root_session_id, sessionID))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([])
      expect(
        yield* database.db
          .select()
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, sessionID))
          .orderBy(EventTable.seq)
          .all()
          .pipe(Effect.orDie),
      ).toEqual(eventsBeforeDeletion)

      const interrupted = yield* prompt.interruptTurn(sessionID, turnID)
      expect(interrupted.terminal).toMatchObject({ outcome: "interrupted", reason: "learner_interrupt" })
      const stale = yield* sessions.commitRemoval(proposal).pipe(Effect.exit)
      expect(Exit.isFailure(stale)).toBe(true)
      if (Exit.isFailure(stale)) {
        expect(Cause.squash(stale.cause)).toEqual(
          new SessionDeletion.InvocationConflictError({ requestID: proposal.requestID }),
        )
      }
      expect(yield* sessions.get(sessionID)).toMatchObject({ id: sessionID })
      expect(
        yield* database.db
          .select()
          .from(SessionDeletionControlReceiptTable)
          .where(eq(SessionDeletionControlReceiptTable.root_session_id, sessionID))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([])

      const fresh = yield* sessions.proposeRemoval({ sessionID, mode: "full" })
      expect(yield* sessions.commitRemoval(fresh)).toMatchObject({
        type: "applied",
        settlement: { rootSessionID: sessionID, mode: "full" },
      })
      expect(
        yield* database.db
          .select()
          .from(SessionDeletionControlReceiptTable)
          .where(eq(SessionDeletionControlReceiptTable.root_session_id, sessionID))
          .all()
          .pipe(Effect.orDie),
      ).toHaveLength(1)
    }),
  { config: cfg },
  30_000,
)

noLLMServer.instance(
  "audit purge consumes an uncommitted proposal once and replays only the durable settlement",
  () =>
    Effect.gen(function* () {
      const { sessions } = yield* boot({ title: "process-local audit purge proposal" })
      const database = yield* Database.Service
      const sessionID = (yield* materializeTestSession({ title: "minimal deletion audit to purge" })).info.id
      const deletion = yield* sessions.proposeRemoval({ sessionID, mode: "minimal_audit" })
      if ("type" in deletion) return yield* Effect.die("Expected a fresh deletion proposal")
      expect(yield* sessions.commitRemoval(deletion)).toMatchObject({
        type: "applied",
        auditAvailable: true,
        settlement: { rootSessionID: sessionID, mode: "minimal_audit" },
      })

      const stale = yield* sessions.proposeAuditPurge(sessionID)
      const tampered = yield* sessions.purgeAudit({ ...stale, requestFingerprint: "0".repeat(64) }).pipe(Effect.exit)
      expect(Exit.isFailure(tampered)).toBe(true)
      if (Exit.isFailure(tampered)) {
        expect(Cause.squash(tampered.cause)).toEqual(
          new SessionDeletion.InvocationConflictError({ requestID: stale.requestID }),
        )
      }
      const retained = yield* database.db.transaction((tx) => SessionDeletion.readProjection(tx, sessionID))
      expect(retained).toMatchObject({ state: "deleted_minimal_audit", auditAvailable: true })

      const consumed = yield* sessions.purgeAudit(stale).pipe(Effect.exit)
      expect(Exit.isFailure(consumed)).toBe(true)
      if (Exit.isFailure(consumed)) {
        expect(Cause.squash(consumed.cause)).toEqual(
          new SessionDeletion.InvocationConflictError({ requestID: stale.requestID }),
        )
      }

      const fresh = yield* sessions.proposeAuditPurge(sessionID)
      const applied = yield* sessions.purgeAudit(fresh)
      expect(applied).toMatchObject({
        type: "applied",
        settlement: { deletionRequestID: deletion.requestID, requestID: fresh.requestID },
      })
      expect(yield* sessions.purgeAudit(fresh)).toMatchObject({
        type: "replayed",
        settlementBytes: applied.settlementBytes,
      })
      expect(yield* sessions.commitRemoval(deletion)).toMatchObject({
        type: "replayed",
        auditAvailable: false,
        settlement: { rootSessionID: sessionID, mode: "minimal_audit" },
      })
      expect(yield* database.db.transaction((tx) => SessionDeletion.readProjection(tx, sessionID))).toMatchObject({
        state: "deleted_minimal_audit_purged",
        auditAvailable: false,
      })
      const unavailable = yield* sessions.proposeAuditPurge(sessionID).pipe(Effect.exit)
      expect(Exit.isFailure(unavailable)).toBe(true)
      if (Exit.isFailure(unavailable)) {
        expect(Cause.squash(unavailable.cause)).toMatchObject({
          _tag: "SessionDeletion.AuditNotAvailableError",
          rootSessionID: sessionID,
        })
      }
    }),
  { config: cfg },
)

it.instance(
  "binds one promoted steer to the exact later model operation when its provider request fails",
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

      const release = Promise.withResolvers<void>()
      yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
      const rootResponse = "The root move completes before the exact steer is promoted."
      yield* llm.hold(rootResponse, release.promise)
      yield* llm.error(400, { error: { message: "Gate 23 promoted-steer provider failure" } })

      const sessionID = SessionID.create()
      const turnID = Turn.ID.create()
      const rootInputID = Turn.InputID.create()
      const rootRequest = "Begin one finite Turn and wait for my current-work correction."
      yield* prompt.start({
        sessionID,
        turnID,
        inputID: rootInputID,
        messageID: MessageID.ascending(),
        agent: "repa",
        model: ref,
        limits: { model: 2, tool: 0 },
        session: { title: "Gate 23 promoted-steer provider failure" },
        parts: [{ type: "text", text: rootRequest }],
      })
      yield* awaitWithTimeout(llm.wait(1), "Gate 23 root model operation was not sampled", "10 seconds")

      const steerInputID = Turn.InputID.create()
      const steerText = "Use this exact promoted correction in the next model operation."
      const steer = yield* prompt
        .steer({
          sessionID,
          expectedTurnID: turnID,
          inputID: steerInputID,
          messageID: MessageID.ascending(),
          agent: "repa",
          model: ref,
          parts: [{ type: "text", text: steerText }],
        })
        .pipe(Effect.forkChild)
      yield* Effect.sleep("25 millis")
      expect(steer.pollUnsafe()).toBeUndefined()
      release.resolve()
      expect((yield* Fiber.join(steer)).id).toBe(steerInputID)

      const result = yield* prompt.awaitTurn(sessionID, turnID)
      expect(result.terminal).toMatchObject({
        outcome: "failed",
        reason: "provider_failure",
        counters: { model: 2, tool: 0 },
      })
      const inputs = yield* database.db
        .select({
          id: TurnInputTable.id,
          occurrenceID: TurnInputTable.occurrence_id,
          source: TurnInputTable.source,
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
          state: TurnModelOperationTable.state,
          ordinal: TurnModelOperationTable.ordinal,
        })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, turnID))
        .orderBy(TurnModelOperationTable.ordinal)
        .all()
        .pipe(Effect.orDie)
      expect(inputs.map((input) => ({ id: input.id, source: input.source, ordinal: input.ordinal }))).toEqual([
        { id: rootInputID, source: "learner_root", ordinal: 0 },
        { id: steerInputID, source: "learner_steer", ordinal: 1 },
      ])
      expect(models.map((model) => ({ inputID: model.inputID, state: model.state, ordinal: model.ordinal }))).toEqual([
        { inputID: rootInputID, state: "completed", ordinal: 0 },
        { inputID: steerInputID, state: "failed", ordinal: 1 },
      ])
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
      ).toEqual([steerInputID])
      const providerRequests = (yield* llm.hits).filter((hit) => {
        const text = providerText(hit.body).join("\n")
        return text.includes(rootRequest) || text.includes(steerText)
      })
      expect(providerRequests).toHaveLength(2)
      expect(providerText(providerRequests[0]?.body).join("\n")).not.toContain(steerText)
      expect(providerText(providerRequests[1]?.body).join("\n")).toContain(steerText)
      expect(providerText(providerRequests[1]?.body).join("\n")).toContain(rootResponse)
      expect(yield* llm.pending).toBe(0)
      yield* sessions.remove(sessionID)
    }),
  { config: cfg },
  60_000,
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
  30_000,
)
