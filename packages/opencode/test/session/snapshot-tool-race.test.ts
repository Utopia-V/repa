/**
 * Reproducer for snapshot race condition with instant tool execution.
 *
 * When the mock LLM returns a tool call response instantly, the AI SDK
 * processes the tool call and executes the tool (e.g. apply_patch) before
 * the processor's start-step handler can capture a pre-tool snapshot.
 * Both the "before" and "after" snapshots end up with the same git tree
 * hash, so computeDiff returns empty and the session summary shows 0 files.
 *
 * This is a real bug: the snapshot system assumes it can capture state
 * before tools run by hooking into start-step, but the AI SDK executes
 * tools internally during multi-step processing before emitting events.
 */
import { expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import fs from "fs/promises"
import path from "path"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionSummary } from "../../src/session/summary"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MessageID, SessionID } from "@/session/schema"
import { Turn } from "@opencode-ai/schema/turn"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Occurrence } from "@opencode-ai/core/learning-command"
import { Global } from "@opencode-ai/core/global"
import { Hash } from "@opencode-ai/core/util/hash"
import { InstanceState } from "@/effect/instance-state"
import { Snapshot } from "@/snapshot"

const mcp = Layer.succeed(
  MCP.Service,
  MCP.Service.of({
    status: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
    instructions: () => Effect.succeed([]),
    tools: () => Effect.succeed({}),
    prompts: () => Effect.succeed({}),
    resources: () => Effect.succeed({}),
    resourceTemplates: () => Effect.succeed({}),
    add: () => Effect.succeed({ status: { status: "disabled" as const } }),
    connect: () => Effect.void,
    disconnect: () => Effect.void,
    getPrompt: () => Effect.succeed(undefined),
    readResource: () => Effect.succeed(undefined),
    startAuth: () => Effect.die("unexpected MCP auth"),
    authenticate: () => Effect.die("unexpected MCP auth"),
    finishAuth: () => Effect.die("unexpected MCP auth"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
  }),
)

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

const root = LayerNode.group([
  SessionPrompt.node,
  Session.node,
  SessionProjector.node,
  SessionSummary.node,
  Database.node,
  EventV2Bridge.node,
  CrossSpawnSpawner.node,
  LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
])
const it = testEffect(
  LayerNode.compile(root, [
    [MCP.node, mcp],
    [LSP.node, lsp],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
  ]),
)

const providerCfg = (url: string) => ({
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
        baseURL: url,
      },
    },
  },
})

it.live("message diff survives a later summary and unavailable snapshots without rewriting the User Message", () =>
  provideTmpdirServer(
    Effect.fnUntraced(function* ({ dir, llm }) {
      const prompt = yield* SessionPrompt.Service
      const summary = yield* SessionSummary.Service
      const sessions = yield* Session.Service
      const events = yield* EventV2Bridge.Service
      const sessionID = SessionID.create()
      const emitted: (readonly Snapshot.FileDiff[])[] = []
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== Session.Event.Diff.type) return Effect.void
        const data = Schema.decodeUnknownSync(Session.Event.Diff.data)(event.data)
        if (data.sessionID !== sessionID) return Effect.void
        return Effect.sync(() => emitted.push(data.diff))
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      const firstMessageID = MessageID.ascending()
      const firstTurnID = Turn.ID.create()
      const firstCommand = `echo 'first snapshot result' > ${path.join(dir, "first.txt")}`
      yield* llm.toolMatch((hit) => JSON.stringify(hit.body).includes("create the first file"), "bash", {
        command: firstCommand,
      })
      yield* llm.textMatch((hit) => JSON.stringify(hit.body).includes("bash"), "done")

      yield* prompt.start({
        sessionID,
        turnID: firstTurnID,
        inputID: Turn.InputID.create(),
        messageID: firstMessageID,
        agent: "repa",
        session: {
          title: "snapshot race test",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        },
        parts: [{ type: "text", text: "create the first file" }],
      })
      expect((yield* prompt.awaitTurn(sessionID, firstTurnID)).terminal?.outcome).toBe("completed")

      expect(
        yield* Effect.promise(() =>
          fs
            .access(path.join(dir, "first.txt"))
            .then(() => true)
            .catch(() => false),
        ),
      ).toBe(true)

      const afterFirst = yield* MessageV2.filterCompactedEffect(sessionID)
      const firstUser = afterFirst.find(
        (msg): msg is SessionV1.WithParts & { info: SessionV1.User } => msg.info.id === firstMessageID,
      )
      const firstTool = afterFirst
        .flatMap((message) => message.parts)
        .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.tool === "bash")
      expect(firstTool?.state.status).toBe("completed")
      if (!firstUser) throw new Error("Expected first User Message")
      expect(firstUser.info.summary).toBeUndefined()
      const firstDiff = yield* summary.diff({ sessionID, messageID: firstMessageID })
      expect(firstDiff.length).toBeGreaterThan(0)
      expect(emitted.at(-1)).toEqual(firstDiff)
      const firstEventCount = emitted.length

      const secondMessageID = MessageID.ascending()
      const secondCommand = `echo 'second snapshot result' > ${path.join(dir, "second.txt")}`
      yield* llm.toolMatch((hit) => JSON.stringify(hit.body).includes("create the second file"), "bash", {
        command: secondCommand,
      })
      yield* llm.textMatch((hit) => JSON.stringify(hit.body).includes("second.txt"), "done again")
      const secondTurnID = Turn.ID.create()
      yield* prompt.start({
        sessionID,
        turnID: secondTurnID,
        inputID: Turn.InputID.create(),
        messageID: secondMessageID,
        agent: "repa",
        parts: [{ type: "text", text: "create the second file" }],
      })
      expect((yield* prompt.awaitTurn(sessionID, secondTurnID)).terminal?.outcome).toBe("completed")
      expect(
        yield* Effect.promise(() =>
          fs
            .access(path.join(dir, "second.txt"))
            .then(() => true)
            .catch(() => false),
        ),
      ).toBe(true)

      const secondDiff = yield* summary.diff({ sessionID, messageID: secondMessageID })
      expect(secondDiff.length).toBeGreaterThan(0)
      expect(secondDiff).not.toEqual(firstDiff)
      expect((yield* sessions.get(sessionID)).summary?.diffs).toEqual(secondDiff)
      expect(emitted.length).toBeGreaterThan(firstEventCount)
      expect(emitted.at(-1)).toEqual(secondDiff)

      const all = yield* MessageV2.filterCompactedEffect(sessionID)
      const firstMessages = all.filter(
        (message) =>
          message.info.id === firstMessageID ||
          (message.info.role === "assistant" && message.info.parentID === firstMessageID),
      )
      const snapshots = firstMessages.flatMap((message) =>
        message.parts.flatMap((part) =>
          (part.type === "step-start" || part.type === "step-finish") && part.snapshot ? [part.snapshot] : [],
        ),
      )
      expect(snapshots.length).toBeGreaterThan(1)
      const instance = yield* InstanceState.context
      const snapshotRoot = path.join(
        Global.Path.data,
        "snapshot",
        instance.project.id,
        Hash.fast(instance.worktree),
        "objects",
      )
      yield* Effect.promise(() =>
        Promise.all(
          [...new Set(snapshots)].map((snapshot) =>
            fs.rm(path.join(snapshotRoot, snapshot.slice(0, 2), snapshot.slice(2)), { force: true }),
          ),
        ),
      )
      expect(yield* summary.computeDiff({ messages: firstMessages })).toEqual([])
      expect(yield* summary.diff({ sessionID, messageID: firstMessageID })).toEqual(firstDiff)

      const afterUnavailable = yield* MessageV2.filterCompactedEffect(sessionID)
      const reloadedFirst = afterUnavailable.find(
        (message): message is SessionV1.WithParts & { info: SessionV1.User } => message.info.id === firstMessageID,
      )
      if (!reloadedFirst) throw new Error("Expected reloaded first User Message")
      expect(reloadedFirst.info.summary).toBeUndefined()
      const presentation = yield* events.transaction((tx) =>
        Occurrence.resolvePresentation(tx, {
          sessionID,
          messageID: reloadedFirst.info.id,
        }).pipe(
          Effect.flatMap((resolved) =>
            Occurrence.requireAvailableSource(tx, {
              sessionID,
              messageID: reloadedFirst.info.id,
              occurrenceID: resolved.occurrenceID,
            }),
          ),
          Effect.map((result) => ({ result })),
          Effect.orDie,
        ),
      )
      expect(presentation.result.messageID).toBe(reloadedFirst.info.id)
    }),
    { git: true, config: providerCfg },
  ),
)
