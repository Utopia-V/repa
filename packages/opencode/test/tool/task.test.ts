import { afterEach, describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Turn } from "@opencode-ai/schema/turn"
import { Cause, DateTime, Effect, Exit, Fiber, Schema } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Tool } from "../../src/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { disposeAllInstances } from "../fixture/fixture"
import { materializeTestSession } from "../fixture/session"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const layer = LayerNode.compile(
  LayerNode.group([
    Agent.node,
    BackgroundJob.node,
    EventV2Bridge.node,
    Permission.node,
    Config.node,
    CrossSpawnSpawner.node,
    Session.node,
    SessionProjector.node,
    SessionRunState.node,
    SessionStatus.node,
    Truncate.node,
    ToolRegistry.node,
    Database.node,
    RuntimeFlags.node,
    Ripgrep.node,
  ]),
  [[RuntimeFlags.node, RuntimeFlags.layer({})]],
)

const it = testEffect(layer)

function defer<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const seed = Effect.fn("TaskToolTest.seed")(function* () {
  const sessions = yield* Session.Service
  const seeded = yield* materializeTestSession({ title: "Parent" })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: seeded.user.id,
    sessionID: seeded.info.id,
    mode: "repa",
    agent: "repa",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    variant: "xhigh",
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  return { chat: seeded.info, assistant }
})

function context(input: {
  sessionID: SessionID
  assistantMessageID: MessageID
  promptOps: TaskPromptOps
  abort?: AbortSignal
  interaction?: false
  ask?: Tool.Context["ask"]
  permission?: Tool.Interaction["permission"]
}) {
  const base = {
    sessionID: input.sessionID,
    messageID: input.assistantMessageID,
    agent: "repa",
    abort: input.abort ?? new AbortController().signal,
    extra: { promptOps: input.promptOps },
    messages: [],
    metadata: () => Effect.void,
    ask: input.ask ?? (() => Effect.void),
  }
  if (input.interaction === false) return base
  return {
    ...base,
    interaction: {
      turnID: Turn.ID.create(),
      inputID: Turn.InputID.create(),
      assistantMessageID: input.assistantMessageID,
      candidate: {
        partID: PartID.ascending(),
        callID: "call_task",
        emissionOrdinal: 0,
      },
      permission: {
        ruleset: input.permission?.ruleset ?? [{ permission: "read", pattern: "*", action: "allow" as const }],
        authority: input.permission?.authority ?? [],
      },
    },
  }
}

function applyRead(input: {
  sessionID: SessionID
  pattern: string
  ruleset: Tool.Interaction["permission"]["ruleset"]
  authority: Tool.Interaction["permission"]["authority"]
  applied: string[]
}) {
  return Effect.gen(function* () {
    const permission = yield* Permission.Service
    yield* permission.ask({
      sessionID: input.sessionID,
      permission: "read",
      patterns: [input.pattern],
      always: [],
      metadata: {},
      ruleset: input.ruleset,
      authority: input.authority,
    })
    input.applied.push(input.pattern)
  })
}

function roundTripCapability(capability: SessionPrompt.DelegatedCapability) {
  return Schema.decodeUnknownSync(SessionPrompt.DelegatedCapability)(JSON.parse(JSON.stringify(capability)))
}

function runningTurn(input: SessionPrompt.StartChildInput): Turn.Info {
  return {
    id: input.childTurnID,
    sessionID: input.childSessionID,
    admissionKind: "delegated_task",
    initialInputID: input.childInputID,
    currentInputID: input.childInputID,
    limits: input.limits,
    counters: { model: 0, tool: 0 },
    state: "running",
    depth: 1,
    lineage: {
      parentTurnID: input.parentTurnID,
      parentSessionID: input.parentSessionID,
      parentTaskPartID: input.parentTaskPartID,
      parentModelMessageID: input.parentModelMessageID,
      depth: 1,
      delegatedCapability: input.delegatedCapability,
    },
    timeAdmitted: DateTime.makeUnsafe(1),
    causalTime: DateTime.makeUnsafe(1),
  }
}

function terminalTurn(input: SessionPrompt.StartChildInput, outcome: Turn.ChildResult["terminalOutcome"]): Turn.Info {
  const reason = {
    completed: "normal",
    failed: "provider_failure",
    interrupted: "learner_interrupt",
    exhausted: "model_limit",
  } as const
  return {
    ...runningTurn(input),
    state: outcome,
    terminal: {
      outcome,
      reason: reason[outcome],
      counters: { model: 1, tool: 0 },
      time: DateTime.makeUnsafe(2),
    },
  }
}

function childResult(
  input: SessionPrompt.AwaitChildInput,
  outcome: Turn.ChildResult["terminalOutcome"] = "completed",
): Turn.ChildResult {
  const reason = {
    failed: "provider_failure",
    interrupted: "learner_interrupt",
    exhausted: "model_limit",
  } as const
  return {
    ...input,
    terminalOutcome: outcome,
    requestedOutput:
      outcome === "completed"
        ? { state: "complete", value: "bounded answer" }
        : { state: "incomplete", partial: "bounded partial", reason: reason[outcome] },
    timeSettled: DateTime.makeUnsafe(2),
  }
}

function promptOps(input?: {
  onStart?: (value: SessionPrompt.StartChildInput) => void
  onAwait?: (value: SessionPrompt.AwaitChildInput) => void
  outcome?: Turn.ChildResult["terminalOutcome"]
}): TaskPromptOps {
  return {
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    startChild: (value) =>
      Effect.sync(() => {
        input?.onStart?.(value)
        return runningTurn(value)
      }),
    awaitChild: (value) =>
      Effect.sync(() => {
        input?.onAwait?.(value)
        return childResult(value, input?.outcome)
      }),
    interruptTurn: (_sessionID, _turnID) => Effect.die("unexpected interrupt"),
  }
}

const parameters = {
  description: "inspect cache",
  prompt: "Inspect the cache key path and return the cause only.",
  subagent_type: "general",
  capabilities: [
    { permission: "read", patterns: ["src/**", "test/**"] },
    { permission: "bash", patterns: ["bun test test/cache.test.ts"] },
  ],
} as const

describe("tool.task synchronous child Turn", () => {
  it.instance("rejects execution without program-bound Interaction identity", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      let started = false
      const exit = yield* def
        .execute(
          parameters,
          context({
            sessionID: seeded.chat.id,
            assistantMessageID: seeded.assistant.id,
            promptOps: promptOps({ onStart: () => (started = true) }),
            interaction: false,
          }),
        )
        .pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      expect(started).toBe(false)
    }),
  )

  it.instance("asks for the task role and every explicit capability before admission", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const asked: Array<{ permission: string; patterns: readonly string[] }> = []

      yield* def.execute(
        parameters,
        context({
          sessionID: seeded.chat.id,
          assistantMessageID: seeded.assistant.id,
          promptOps: promptOps(),
          ask: (input) =>
            Effect.sync(() => {
              asked.push({ permission: input.permission, patterns: input.patterns })
            }),
        }),
      )

      expect(asked).toEqual([
        { permission: "task", patterns: ["general"] },
        { permission: "read", patterns: ["src/**", "test/**"] },
        { permission: "bash", patterns: ["bun test test/cache.test.ts"] },
      ])
    }),
  )

  it.instance("freezes separate parent, inherited, child-profile, and explicit authority layers", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const agents = yield* Agent.Service
      const profile = yield* agents.get("general")
      if (!profile) throw new Error("missing general agent")
      const tool = yield* TaskTool
      const def = yield* tool.init()
      let started: SessionPrompt.StartChildInput | undefined

      yield* def.execute(
        parameters,
        context({
          sessionID: seeded.chat.id,
          assistantMessageID: seeded.assistant.id,
          promptOps: promptOps({ onStart: (value) => (started = value) }),
        }),
      )

      const projection = [
        { permission: "bash", pattern: "bun test test/cache.test.ts", action: "allow" as const },
        { permission: "read", pattern: "src/**", action: "allow" as const },
        { permission: "read", pattern: "test/**", action: "allow" as const },
      ]
      expect(started?.delegatedCapability).toEqual({
        version: 2,
        parent: [{ permission: "read", pattern: "*", action: "allow" }],
        inherited: [],
        profile: profile.permission,
        explicit: projection,
      })
      expect(started?.delegatedCapability.parent).not.toBe(started?.delegatedCapability.profile)
      expect(started?.delegatedCapability.explicit).not.toBe(started?.delegatedCapability.profile)
    }),
  )

  it.instance("retains a narrower parent deny when broad read authority is delegated to a child", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const parent = [
        { permission: "read", pattern: "**", action: "allow" as const },
        { permission: "read", pattern: "secret/**", action: "deny" as const },
      ]
      let started: SessionPrompt.StartChildInput | undefined

      yield* def.execute(
        { ...parameters, capabilities: [{ permission: "read", patterns: ["**"] }] },
        context({
          sessionID: seeded.chat.id,
          assistantMessageID: seeded.assistant.id,
          promptOps: promptOps({ onStart: (value) => (started = value) }),
          permission: { ruleset: parent, authority: [] },
        }),
      )
      if (!started) throw new Error("child was not admitted")

      expect(started.delegatedCapability.parent).toEqual(parent)
      parent[1]!.pattern = "changed/**"
      expect(started.delegatedCapability.parent[1]?.pattern).toBe("secret/**")
      const authority = yield* SessionPrompt.turnAuthority(
        runningTurn({ ...started, delegatedCapability: roundTripCapability(started.delegatedCapability) }),
      )
      const applied: string[] = []
      const child = [
        { permission: "read", pattern: "**", action: "allow" as const },
        { permission: "read", pattern: "revoked/**", action: "deny" as const },
      ]
      const allowed = yield* applyRead({
        sessionID: started.childSessionID,
        pattern: "public/key",
        ruleset: child,
        authority,
        applied,
      }).pipe(Effect.exit)
      const denied = yield* applyRead({
        sessionID: started.childSessionID,
        pattern: "secret/key",
        ruleset: child,
        authority,
        applied,
      }).pipe(Effect.exit)
      const revoked = yield* applyRead({
        sessionID: started.childSessionID,
        pattern: "revoked/key",
        ruleset: child,
        authority,
        applied,
      }).pipe(Effect.exit)

      expect(Exit.isSuccess(allowed)).toBe(true)
      expect(Exit.isFailure(denied)).toBe(true)
      expect(Exit.isFailure(revoked)).toBe(true)
      if (Exit.isFailure(denied)) expect(Cause.squash(denied.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      if (Exit.isFailure(revoked)) expect(Cause.squash(revoked.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(applied).toEqual(["public/key"])
    }),
  )

  it.instance("retains an ancestor deny when a child delegates the same broad read authority to a grandchild", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const agents = yield* Agent.Service
      const profile = yield* agents.get("general")
      if (!profile) throw new Error("missing general agent")
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const broad = { ...parameters, capabilities: [{ permission: "read", patterns: ["**"] }] } as const
      const root = [
        { permission: "read", pattern: "**", action: "allow" as const },
        { permission: "read", pattern: "secret/**", action: "deny" as const },
      ]
      let child: SessionPrompt.StartChildInput | undefined
      let grandchild: SessionPrompt.StartChildInput | undefined

      yield* def.execute(
        broad,
        context({
          sessionID: seeded.chat.id,
          assistantMessageID: seeded.assistant.id,
          promptOps: promptOps({ onStart: (value) => (child = value) }),
          permission: { ruleset: root, authority: [] },
        }),
      )
      if (!child) throw new Error("child was not admitted")
      const childAuthority = yield* SessionPrompt.turnAuthority(
        runningTurn({ ...child, delegatedCapability: roundTripCapability(child.delegatedCapability) }),
      )

      yield* def.execute(
        broad,
        context({
          sessionID: seeded.chat.id,
          assistantMessageID: seeded.assistant.id,
          promptOps: promptOps({ onStart: (value) => (grandchild = value) }),
          permission: { ruleset: profile.permission, authority: childAuthority },
        }),
      )
      if (!grandchild) throw new Error("grandchild was not admitted")

      expect(grandchild.delegatedCapability.inherited).toEqual(childAuthority.map((layer) => layer.ruleset))
      const authority = yield* SessionPrompt.turnAuthority(
        runningTurn({ ...grandchild, delegatedCapability: roundTripCapability(grandchild.delegatedCapability) }),
      )
      const applied: string[] = []
      const grandchildRules = [{ permission: "read", pattern: "**", action: "allow" as const }]
      const allowed = yield* applyRead({
        sessionID: grandchild.childSessionID,
        pattern: "public/key",
        ruleset: grandchildRules,
        authority,
        applied,
      }).pipe(Effect.exit)
      const denied = yield* applyRead({
        sessionID: grandchild.childSessionID,
        pattern: "secret/key",
        ruleset: grandchildRules,
        authority,
        applied,
      }).pipe(Effect.exit)

      expect(Exit.isSuccess(allowed)).toBe(true)
      expect(Exit.isFailure(denied)).toBe(true)
      if (Exit.isFailure(denied)) expect(Cause.squash(denied.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(applied).toEqual(["public/key"])
    }),
  )

  it.instance("uses stable child identities through synchronous admission, wait, and bounded result", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const stages: string[] = []
      let started: SessionPrompt.StartChildInput | undefined
      let awaited: SessionPrompt.AwaitChildInput | undefined
      const ctx = context({
        sessionID: seeded.chat.id,
        assistantMessageID: seeded.assistant.id,
        promptOps: promptOps({
          onStart: (value) => {
            stages.push("start")
            started = value
          },
          onAwait: (value) => {
            stages.push("await")
            awaited = value
          },
        }),
      })
      if (!("interaction" in ctx)) throw new Error("missing test Interaction")

      const result = yield* def.execute(parameters, ctx)

      expect(stages).toEqual(["start", "await"])
      expect(started?.parentSessionID).toBe(seeded.chat.id)
      expect(started?.parentTurnID).toBe(ctx.interaction.turnID)
      expect(started?.parentTaskPartID).toBe(ctx.interaction.candidate.partID)
      expect(started?.parentModelMessageID).toBe(ctx.interaction.assistantMessageID)
      expect(awaited).toMatchObject({
        parentSessionID: started?.parentSessionID,
        parentTurnID: started?.parentTurnID,
        parentTaskPartID: started?.parentTaskPartID,
        childSessionID: started?.childSessionID,
        childTurnID: started?.childTurnID,
      })
      expect(result.metadata).toMatchObject({
        childSessionId: started?.childSessionID,
        childTurnId: started?.childTurnID,
        terminalOutcome: "completed",
        requestedOutputState: "complete",
      })
      expect(JSON.parse(result.output)).toEqual({
        child_session_id: started?.childSessionID,
        child_turn_id: started?.childTurnID,
        terminal_outcome: "completed",
        requested_output: { state: "complete", value: "bounded answer" },
      })
      expect(result.output).not.toContain("tool receipt")
      expect(result.output).not.toContain("hidden transcript")
    }),
  )

  it.instance("returns failed, interrupted, and exhausted children as completed Tool results", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      for (const outcome of ["failed", "interrupted", "exhausted"] as const) {
        const result = yield* def.execute(
          parameters,
          context({
            sessionID: seeded.chat.id,
            assistantMessageID: seeded.assistant.id,
            promptOps: promptOps({ outcome }),
          }),
        )
        expect(result.metadata).toMatchObject({
          terminalOutcome: outcome,
          requestedOutputState: "incomplete",
        })
        expect(JSON.parse(result.output)).toMatchObject({
          terminal_outcome: outcome,
          requested_output: { state: "incomplete", partial: "bounded partial" },
        })
      }
    }),
  )

  it.instance("uses only an explicit exact child_session_id for follow-up and creates a new child Turn", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const childSessionID = SessionID.create()
      const starts: SessionPrompt.StartChildInput[] = []
      const followUp = { ...parameters, child_session_id: childSessionID }

      yield* def.execute(
        followUp,
        context({
          sessionID: seeded.chat.id,
          assistantMessageID: seeded.assistant.id,
          promptOps: promptOps({ onStart: (value) => starts.push(value) }),
        }),
      )
      yield* def.execute(
        followUp,
        context({
          sessionID: seeded.chat.id,
          assistantMessageID: seeded.assistant.id,
          promptOps: promptOps({ onStart: (value) => starts.push(value) }),
        }),
      )

      expect(starts.map((item) => item.childSessionID)).toEqual([childSessionID, childSessionID])
      expect(starts[0]?.childTurnID).not.toBe(starts[1]?.childTurnID)
      expect(starts[0]?.childInputID).not.toBe(starts[1]?.childInputID)
      expect(starts[0]?.messageID).not.toBe(starts[1]?.messageID)
    }),
  )

  it.instance("interrupts the exact admitted child Turn when the parent tool call is aborted", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const started = defer<SessionPrompt.StartChildInput>()
      const waiting = defer<SessionPrompt.AwaitChildInput>()
      const settled = defer<Turn.ChildResult>()
      const interrupted = defer<{ sessionID: SessionID; turnID: Turn.ID }>()
      const abort = new AbortController()
      const ops: TaskPromptOps = {
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        startChild: (input) =>
          Effect.sync(() => {
            started.resolve(input)
            return runningTurn(input)
          }),
        awaitChild: (input) =>
          Effect.promise(() => {
            waiting.resolve(input)
            return settled.promise
          }),
        interruptTurn: (sessionID, turnID) =>
          Effect.promise(async () => {
            interrupted.resolve({ sessionID, turnID })
            const [start, wait] = await Promise.all([started.promise, waiting.promise])
            settled.resolve(childResult(wait, "interrupted"))
            return terminalTurn(start, "interrupted")
          }),
      }

      const fiber = yield* def
        .execute(
          parameters,
          context({
            sessionID: seeded.chat.id,
            assistantMessageID: seeded.assistant.id,
            promptOps: ops,
            abort: abort.signal,
          }),
        )
        .pipe(Effect.forkChild)

      const child = yield* Effect.promise(() => started.promise)
      yield* Effect.promise(() => waiting.promise)
      abort.abort()
      expect(yield* Effect.promise(() => interrupted.promise)).toEqual({
        sessionID: child.childSessionID,
        turnID: child.childTurnID,
      })
      const exit = yield* Fiber.await(fiber)
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) expect(exit.value.metadata.terminalOutcome).toBe("interrupted")
    }),
  )
})
