import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { test, expect } from "bun:test"
import os from "os"
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Permission } from "../../src/permission"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { TestInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { MessageID, SessionID } from "../../src/session/schema"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { toolPermissionInfo } from "@/cli/cmd/run/tool"

const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const env = AppNodeBuilder.build(
  LayerNode.group([Permission.node, EventV2Bridge.node, CrossSpawnSpawner.node, InstanceStore.node]),
  [[InstanceStore.bootstrapNode, noopBootstrap]],
)
const it = testEffect(env)

const rejectAll = (message?: string) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    for (const req of yield* permission.list()) {
      yield* permission.reply({
        requestID: req.id,
        reply: "reject",
        message,
      })
    }
  })

const waitForPending = (count: number) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* Effect.gen(function* () {
      while (true) {
        const list = yield* permission.list()
        if (list.length === count) return list
        yield* Effect.sleep("10 millis")
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: "1 second",
        orElse: () => Effect.fail(new Error(`timed out waiting for ${count} pending permission request(s)`)),
      }),
    )
  })

function exactLifecycle(
  input: {
    selected?: Permission.DurableLifecycle["selected"]
    replied?: Permission.DurableLifecycle["replied"]
  } = {},
): Permission.DurableLifecycle {
  return {
    resolution: "request_exact",
    selected: input.selected ?? (() => Effect.void),
    replied: input.replied ?? (() => Effect.void),
  }
}

const fail = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* self.pipe(Effect.exit)
    if (Exit.isFailure(exit)) return Cause.squash(exit.cause)
    throw new Error("expected permission effect to fail")
  })

const ask = (input: Parameters<Permission.Interface["ask"]>[0]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.ask(input)
  })

test("delegated authority is a deny-first intersection", () => {
  const child = [{ permission: "edit", pattern: "*", action: "allow" as const }]
  const authority: Permission.AuthorityLayer[] = [
    {
      ruleset: [{ permission: "edit", pattern: "*", action: "deny" }],
      absence: "deny",
    },
  ]

  expect(Permission.evaluateAuthority("edit", "lesson.md", child, authority).action).toBe("deny")
  expect(Permission.disabled(["edit", "write", "apply_patch"], child, authority)).toEqual(
    new Set(["edit", "write", "apply_patch"]),
  )
})

test("an explicit delegation layer denies absent capabilities", () => {
  const child = [{ permission: "*", pattern: "*", action: "allow" as const }]
  const authority: Permission.AuthorityLayer[] = [
    {
      ruleset: [{ permission: "read", pattern: "*", action: "allow" }],
      absence: "deny",
    },
  ]

  expect(Permission.evaluateAuthority("read", "lesson.md", child, authority).action).toBe("allow")
  expect(Permission.evaluateAuthority("bash", "git status", child, authority).action).toBe("deny")
})

test("capability identifiers remain case-sensitive through delegated authority and tool visibility", () => {
  const ruleset = Permission.fromConfig({ "*": "deny", read: "allow" })
  const authority: Permission.AuthorityLayer[] = [{ ruleset, absence: "deny" }]

  expect(Permission.evaluate("read", "lesson.md", ruleset).action).toBe("allow")
  expect(Permission.evaluate("READ", "lesson.md", ruleset).action).toBe("deny")
  expect(
    Permission.evaluateAuthority("READ", "lesson.md", [{ permission: "*", pattern: "*", action: "allow" }], authority)
      .action,
  ).toBe("deny")
  expect(Permission.disabled(["read", "READ"], ruleset)).toEqual(new Set(["READ"]))
  expect(Object.keys(Permission.visibleTools({ read: true, READ: true }, ruleset))).toEqual(["read"])
})

test("resource patterns retain platform path case semantics", () => {
  const action = Permission.evaluate("read", "LESSONS/ONE.MD", [
    { permission: "read", pattern: "lessons/*", action: "allow" },
  ]).action

  expect(action).toBe(process.platform === "win32" ? "allow" : "ask")
})

const reply = (input: Parameters<Permission.Interface["reply"]>[0]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.reply(input)
  })

const list = () =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.list()
  })

// fromConfig tests

test("fromConfig - string value becomes wildcard rule", () => {
  const result = Permission.fromConfig({ bash: "allow" })
  expect(result).toEqual([{ permission: "bash", pattern: "*", action: "allow" }])
})

test("fromConfig - object value converts to rules array", () => {
  const result = Permission.fromConfig({ bash: { "*": "allow", rm: "deny" } })
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm", action: "deny" },
  ])
})

test("fromConfig - mixed string and object values", () => {
  const result = Permission.fromConfig({
    bash: { "*": "allow", rm: "deny" },
    edit: "allow",
    webfetch: "ask",
  })
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm", action: "deny" },
    { permission: "edit", pattern: "*", action: "allow" },
    { permission: "webfetch", pattern: "*", action: "ask" },
  ])
})

test("fromConfig - empty object", () => {
  const result = Permission.fromConfig({})
  expect(result).toEqual([])
})

test("fromConfig - expands tilde to home directory", () => {
  const result = Permission.fromConfig({ external_directory: { "~/projects/*": "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: `${os.homedir()}/projects/*`, action: "allow" }])
})

test("fromConfig - expands $HOME to home directory", () => {
  const result = Permission.fromConfig({ external_directory: { "$HOME/projects/*": "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: `${os.homedir()}/projects/*`, action: "allow" }])
})

test("fromConfig - expands $HOME without trailing slash", () => {
  const result = Permission.fromConfig({ external_directory: { $HOME: "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: os.homedir(), action: "allow" }])
})

test("fromConfig - does not expand tilde in middle of path", () => {
  const result = Permission.fromConfig({ external_directory: { "/some/~/path": "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: "/some/~/path", action: "allow" }])
})

// Permission precedence follows config insertion order. `evaluate()` uses the
// last matching rule, so later config entries intentionally override earlier
// entries even when a wildcard appears after a specific permission.

test("fromConfig - preserves top-level config key order", () => {
  const wildcardFirst = Permission.fromConfig({ "*": "deny", bash: "allow" })
  const specificFirst = Permission.fromConfig({ bash: "allow", "*": "deny" })

  expect(wildcardFirst.map((r) => r.permission)).toEqual(["*", "bash"])
  expect(specificFirst.map((r) => r.permission)).toEqual(["bash", "*"])

  expect(Permission.evaluate("bash", "ls", wildcardFirst).action).toBe("allow")
  expect(Permission.evaluate("bash", "ls", specificFirst).action).toBe("deny")
})

test("fromConfig - wildcard acts as fallback when it appears before specifics", () => {
  const ruleset = Permission.fromConfig({ "*": "ask", bash: "allow" })
  expect(Permission.evaluate("edit", "foo.ts", ruleset).action).toBe("ask")
  expect(Permission.evaluate("bash", "ls", ruleset).action).toBe("allow")
})

test("fromConfig - top-level ordering is not sorted by wildcard specificity", () => {
  const ruleset = Permission.fromConfig({
    bash: "allow",
    "*": "ask",
    edit: "deny",
    "mcp_*": "allow",
  })
  expect(ruleset.map((r) => r.permission)).toEqual(["bash", "*", "edit", "mcp_*"])
})

test("fromConfig - sub-pattern insertion order inside a tool key is preserved", () => {
  const ruleset = Permission.fromConfig({ bash: { "*": "deny", "git *": "allow" } })
  expect(ruleset.map((r) => r.pattern)).toEqual(["*", "git *"])
  expect(Permission.evaluate("bash", "rm foo", ruleset).action).toBe("deny")
  expect(Permission.evaluate("bash", "git status", ruleset).action).toBe("allow")
})

test("fromConfig - rejects array-index capability and resource keys defensively", () => {
  expect(() => Permission.fromConfig({ "0": "allow" })).toThrow("permission capability")
  expect(() => Permission.fromConfig({ task: { "4294967294": "allow" } })).toThrow(
    'resource pattern for permission "task"',
  )

  const ruleset = Permission.fromConfig({ "00": "allow", task: { "01": "allow" } })
  expect(Permission.evaluate("00", "*", ruleset).action).toBe("allow")
  expect(Permission.evaluate("task", "01", ruleset).action).toBe("allow")
})

test("explicit rules retain numeric capability and Agent-pattern semantics", () => {
  const ruleset: PermissionV1.Ruleset = [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "0", pattern: "*", action: "allow" },
    { permission: "task", pattern: "0", action: "allow" },
  ]

  expect(Permission.evaluate("0", "*", ruleset).action).toBe("allow")
  expect(Permission.evaluate("task", "0", ruleset).action).toBe("allow")
  expect(Object.keys(Permission.visibleTools({ read: true, "0": true }, ruleset))).toEqual(["0"])
})

test("direct objects and explicit rules retain prototype-named permissions", () => {
  const prototypeDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")
  const config = JSON.parse(`{"*":"allow","__proto__":"deny"}`)
  const ruleset = Permission.fromConfig(config)
  const explicit: PermissionV1.Ruleset = [
    { permission: "*", pattern: "*", action: "allow" },
    { permission: "__proto__", pattern: "*", action: "deny" },
  ]

  expect(Object.hasOwn(config, "__proto__")).toBeTrue()
  expect(Permission.evaluate("__proto__", "*", ruleset).action).toBe("deny")
  expect(Permission.evaluate("__proto__", "*", explicit).action).toBe("deny")
  expect(Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")).toEqual(prototypeDescriptor)
})

test("fromConfig - documented fallback-first example", () => {
  const ruleset = Permission.fromConfig({ "*": "ask", bash: "allow", edit: "deny" })
  expect(Permission.evaluate("bash", "ls", ruleset).action).toBe("allow")
  expect(Permission.evaluate("edit", "foo.ts", ruleset).action).toBe("deny")
  expect(Permission.evaluate("read", "foo.ts", ruleset).action).toBe("ask")
})

test("fromConfig - expands exact tilde to home directory", () => {
  const result = Permission.fromConfig({ external_directory: { "~": "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: os.homedir(), action: "allow" }])
})

test("evaluate - matches expanded tilde pattern", () => {
  const ruleset = Permission.fromConfig({ external_directory: { "~/projects/*": "allow" } })
  const result = Permission.evaluate("external_directory", `${os.homedir()}/projects/file.txt`, ruleset)
  expect(result.action).toBe("allow")
})

test("evaluate - matches expanded $HOME pattern", () => {
  const ruleset = Permission.fromConfig({ external_directory: { "$HOME/projects/*": "allow" } })
  const result = Permission.evaluate("external_directory", `${os.homedir()}/projects/file.txt`, ruleset)
  expect(result.action).toBe("allow")
})

// merge tests

test("merge - simple concatenation", () => {
  const result = Permission.merge(
    [{ permission: "bash", pattern: "*", action: "allow" }],
    [{ permission: "bash", pattern: "*", action: "deny" }],
  )
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "*", action: "deny" },
  ])
})

test("merge - adds new permission", () => {
  const result = Permission.merge(
    [{ permission: "bash", pattern: "*", action: "allow" }],
    [{ permission: "edit", pattern: "*", action: "deny" }],
  )
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "edit", pattern: "*", action: "deny" },
  ])
})

test("merge - concatenates rules for same permission", () => {
  const result = Permission.merge(
    [{ permission: "bash", pattern: "foo", action: "ask" }],
    [{ permission: "bash", pattern: "*", action: "deny" }],
  )
  expect(result).toEqual([
    { permission: "bash", pattern: "foo", action: "ask" },
    { permission: "bash", pattern: "*", action: "deny" },
  ])
})

test("merge - multiple rulesets", () => {
  const result = Permission.merge(
    [{ permission: "bash", pattern: "*", action: "allow" }],
    [{ permission: "bash", pattern: "rm", action: "ask" }],
    [{ permission: "edit", pattern: "*", action: "allow" }],
  )
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm", action: "ask" },
    { permission: "edit", pattern: "*", action: "allow" },
  ])
})

test("merge - empty ruleset does nothing", () => {
  const result = Permission.merge([{ permission: "bash", pattern: "*", action: "allow" }], [])
  expect(result).toEqual([{ permission: "bash", pattern: "*", action: "allow" }])
})

test("merge - preserves rule order", () => {
  const result = Permission.merge(
    [
      { permission: "edit", pattern: "src/*", action: "allow" },
      { permission: "edit", pattern: "src/secret/*", action: "deny" },
    ],
    [{ permission: "edit", pattern: "src/secret/ok.ts", action: "allow" }],
  )
  expect(result).toEqual([
    { permission: "edit", pattern: "src/*", action: "allow" },
    { permission: "edit", pattern: "src/secret/*", action: "deny" },
    { permission: "edit", pattern: "src/secret/ok.ts", action: "allow" },
  ])
})

test("merge - config permission overrides default ask", () => {
  const defaults: PermissionV1.Ruleset = [{ permission: "*", pattern: "*", action: "ask" }]
  const config: PermissionV1.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
  const merged = Permission.merge(defaults, config)

  expect(Permission.evaluate("bash", "ls", merged).action).toBe("allow")
  expect(Permission.evaluate("edit", "foo.ts", merged).action).toBe("ask")
})

test("merge - config ask overrides default allow", () => {
  const defaults: PermissionV1.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
  const config: PermissionV1.Ruleset = [{ permission: "bash", pattern: "*", action: "ask" }]
  const merged = Permission.merge(defaults, config)

  expect(Permission.evaluate("bash", "ls", merged).action).toBe("ask")
})

// evaluate tests

test("evaluate - exact pattern match", () => {
  const result = Permission.evaluate("bash", "rm", [{ permission: "bash", pattern: "rm", action: "deny" }])
  expect(result.action).toBe("deny")
})

test("evaluate - wildcard pattern match", () => {
  const result = Permission.evaluate("bash", "rm", [{ permission: "bash", pattern: "*", action: "allow" }])
  expect(result.action).toBe("allow")
})

test("evaluate - last matching rule wins", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - last matching rule wins (wildcard after specific)", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "bash", pattern: "rm", action: "deny" },
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("allow")
})

test("evaluate - glob pattern match", () => {
  const result = Permission.evaluate("edit", "src/foo.ts", [{ permission: "edit", pattern: "src/*", action: "allow" }])
  expect(result.action).toBe("allow")
})

test("evaluate - last matching glob wins", () => {
  const result = Permission.evaluate("edit", "src/components/Button.tsx", [
    { permission: "edit", pattern: "src/*", action: "deny" },
    { permission: "edit", pattern: "src/components/*", action: "allow" },
  ])
  expect(result.action).toBe("allow")
})

test("evaluate - order matters for specificity", () => {
  const result = Permission.evaluate("edit", "src/components/Button.tsx", [
    { permission: "edit", pattern: "src/components/*", action: "allow" },
    { permission: "edit", pattern: "src/*", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - unknown permission returns ask", () => {
  const result = Permission.evaluate("unknown_tool", "anything", [
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("ask")
})

test("evaluate - empty ruleset returns ask", () => {
  const result = Permission.evaluate("bash", "rm", [])
  expect(result.action).toBe("ask")
})

test("evaluate - no matching pattern returns ask", () => {
  const result = Permission.evaluate("edit", "etc/passwd", [{ permission: "edit", pattern: "src/*", action: "allow" }])
  expect(result.action).toBe("ask")
})

test("evaluate - empty rules array returns ask", () => {
  const result = Permission.evaluate("bash", "rm", [])
  expect(result.action).toBe("ask")
})

test("evaluate - multiple matching patterns, last wins", () => {
  const result = Permission.evaluate("edit", "src/secret.ts", [
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "edit", pattern: "src/*", action: "allow" },
    { permission: "edit", pattern: "src/secret.ts", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - non-matching patterns are skipped", () => {
  const result = Permission.evaluate("edit", "src/foo.ts", [
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "edit", pattern: "test/*", action: "deny" },
    { permission: "edit", pattern: "src/*", action: "allow" },
  ])
  expect(result.action).toBe("allow")
})

test("evaluate - exact match at end wins over earlier wildcard", () => {
  const result = Permission.evaluate("bash", "/bin/rm", [
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "/bin/rm", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - wildcard at end overrides earlier exact match", () => {
  const result = Permission.evaluate("bash", "/bin/rm", [
    { permission: "bash", pattern: "/bin/rm", action: "deny" },
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("allow")
})

// wildcard permission tests

test("evaluate - wildcard permission matches any permission", () => {
  const result = Permission.evaluate("bash", "rm", [{ permission: "*", pattern: "*", action: "deny" }])
  expect(result.action).toBe("deny")
})

test("evaluate - wildcard permission with specific pattern", () => {
  const result = Permission.evaluate("bash", "rm", [{ permission: "*", pattern: "rm", action: "deny" }])
  expect(result.action).toBe("deny")
})

test("evaluate - glob permission pattern", () => {
  const result = Permission.evaluate("mcp_server_tool", "anything", [
    { permission: "mcp_*", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("allow")
})

test("evaluate - specific permission and wildcard permission combined", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("allow")
})

test("evaluate - wildcard permission does not match when specific exists", () => {
  const result = Permission.evaluate("edit", "src/foo.ts", [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "edit", pattern: "src/*", action: "allow" },
  ])
  expect(result.action).toBe("allow")
})

test("evaluate - multiple matching permission patterns combine rules", () => {
  const result = Permission.evaluate("mcp_dangerous", "anything", [
    { permission: "*", pattern: "*", action: "ask" },
    { permission: "mcp_*", pattern: "*", action: "allow" },
    { permission: "mcp_dangerous", pattern: "*", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - wildcard permission fallback for unknown tool", () => {
  const result = Permission.evaluate("unknown_tool", "anything", [
    { permission: "*", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("ask")
})

test("evaluate - later wildcard permission can override earlier specific permission", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "*", pattern: "*", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - merges multiple rulesets", () => {
  const config: PermissionV1.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
  const approved: PermissionV1.Ruleset = [{ permission: "bash", pattern: "rm", action: "deny" }]
  const result = Permission.evaluate("bash", "rm", config, approved)
  expect(result.action).toBe("deny")
})

// disabled tests

test("disabled - returns empty set when all tools allowed", () => {
  const result = Permission.disabled(["bash", "edit", "read"], [{ permission: "*", pattern: "*", action: "allow" }])
  expect(result.size).toBe(0)
})

test("disabled - disables tool when denied", () => {
  const result = Permission.disabled(
    ["bash", "edit", "read"],
    [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "bash", pattern: "*", action: "deny" },
    ],
  )
  expect(result.has("bash")).toBe(true)
  expect(result.has("edit")).toBe(false)
  expect(result.has("read")).toBe(false)
})

test("disabled - disables edit/write/apply_patch when edit denied", () => {
  const result = Permission.disabled(
    ["edit", "write", "apply_patch", "bash"],
    [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "edit", pattern: "*", action: "deny" },
    ],
  )
  expect(result.has("edit")).toBe(true)
  expect(result.has("write")).toBe(true)
  expect(result.has("apply_patch")).toBe(true)
  expect(result.has("bash")).toBe(false)
})

test("disabled - does not disable when partially denied", () => {
  const result = Permission.disabled(
    ["bash"],
    [
      { permission: "bash", pattern: "*", action: "allow" },
      { permission: "bash", pattern: "rm *", action: "deny" },
    ],
  )
  expect(result.has("bash")).toBe(false)
})

test("disabled - does not disable when action is ask", () => {
  const result = Permission.disabled(["bash", "edit"], [{ permission: "*", pattern: "*", action: "ask" }])
  expect(result.size).toBe(0)
})

test("disabled - does not disable when specific allow after wildcard deny", () => {
  const result = Permission.disabled(
    ["bash"],
    [
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "echo *", action: "allow" },
    ],
  )
  expect(result.has("bash")).toBe(false)
})

test("disabled - does not disable when wildcard allow after deny", () => {
  const result = Permission.disabled(
    ["bash"],
    [
      { permission: "bash", pattern: "rm *", action: "deny" },
      { permission: "bash", pattern: "*", action: "allow" },
    ],
  )
  expect(result.has("bash")).toBe(false)
})

test("disabled - disables multiple tools", () => {
  const result = Permission.disabled(
    ["bash", "edit", "webfetch"],
    [
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "edit", pattern: "*", action: "deny" },
      { permission: "webfetch", pattern: "*", action: "deny" },
    ],
  )
  expect(result.has("bash")).toBe(true)
  expect(result.has("edit")).toBe(true)
  expect(result.has("webfetch")).toBe(true)
})

test("disabled - wildcard permission denies all tools", () => {
  const result = Permission.disabled(["bash", "edit", "read"], [{ permission: "*", pattern: "*", action: "deny" }])
  expect(result.has("bash")).toBe(true)
  expect(result.has("edit")).toBe(true)
  expect(result.has("read")).toBe(true)
})

test("disabled - specific allow overrides wildcard deny", () => {
  const result = Permission.disabled(
    ["bash", "edit", "read"],
    [
      { permission: "*", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "*", action: "allow" },
    ],
  )
  expect(result.has("bash")).toBe(false)
  expect(result.has("edit")).toBe(true)
  expect(result.has("read")).toBe(true)
})

// ask tests

it.instance(
  "ask - resolves immediately when action is allow",
  () =>
    Effect.gen(function* () {
      const result = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "bash", pattern: "*", action: "allow" }],
      })
      expect(result).toBeUndefined()
    }),
  { git: true },
)

it.instance(
  "ask - throws DeniedError when action is deny",
  () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_test"),
          permission: "bash",
          patterns: ["rm -rf /"],
          metadata: {},
          always: [],
          ruleset: [{ permission: "bash", pattern: "*", action: "deny" }],
        }),
      )
      expect(err).toBeInstanceOf(PermissionV1.DeniedError)
    }),
  { git: true },
)

it.instance(
  "ask - reports only case-sensitive capability rules as relevant to a denial",
  () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_case_sensitive_denial"),
          permission: "READ",
          patterns: ["lesson.md"],
          metadata: {},
          always: [],
          ruleset: [
            { permission: "*", pattern: "*", action: "deny" },
            { permission: "read", pattern: "*", action: "allow" },
          ],
        }),
      )

      expect(err).toBeInstanceOf(PermissionV1.DeniedError)
      if (err instanceof PermissionV1.DeniedError) {
        expect(err.ruleset).toEqual([{ permission: "*", pattern: "*", action: "deny" }])
      }
    }),
  { git: true },
)

it.instance(
  "ask - stays pending when action is ask",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "bash", pattern: "*", action: "ask" }],
      }).pipe(Effect.forkScoped)

      expect(yield* waitForPending(1)).toHaveLength(1)
      yield* rejectAll()
      yield* Fiber.await(fiber)
    }),
  { git: true },
)

it.instance(
  "ask - adds request to pending list",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: { cmd: "ls" },
        always: ["ls"],
        tool: {
          messageID: MessageID.make("msg_test"),
          callID: "call_test",
        },
        ruleset: [],
      }).pipe(Effect.forkScoped)

      const items = yield* waitForPending(1)
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: { cmd: "ls" },
        always: ["ls"],
        tool: {
          messageID: MessageID.make("msg_test"),
          callID: "call_test",
        },
      })

      yield* rejectAll()
      yield* Fiber.await(fiber)
    }),
  { git: true },
)

it.instance(
  "ask - publishes asked event",
  () =>
    Effect.gen(function* () {
      const events = yield* EventV2Bridge.Service
      const seen = yield* Deferred.make<PermissionV1.Request>()
      const unsub = yield* events.listen((event) => {
        if (event.type === Permission.Event.Asked.type)
          Deferred.doneUnsafe(seen, Effect.succeed(event.data as PermissionV1.Request))
        return Effect.void
      })
      yield* Effect.addFinalizer(() => unsub)

      const fiber = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: { cmd: "ls" },
        always: ["ls"],
        tool: {
          messageID: MessageID.make("msg_test"),
          callID: "call_test",
        },
        ruleset: [],
      }).pipe(Effect.forkScoped)

      expect(yield* waitForPending(1)).toHaveLength(1)
      expect(
        yield* Deferred.await(seen).pipe(
          Effect.timeoutOrElse({
            duration: "1 second",
            orElse: () => Effect.fail(new Error("timed out waiting for permission asked event")),
          }),
        ),
      ).toMatchObject({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
      })

      yield* rejectAll()
      yield* Fiber.await(fiber)
    }),
  { git: true },
)

it.instance(
  "exact lifecycle durably selects before publication and preserves the targeted raw reply",
  () =>
    Effect.gen(function* () {
      const events = yield* EventV2Bridge.Service
      const order: string[] = []
      const selections: Permission.Selection[] = []
      const replies: Array<{ request: PermissionV1.Request; reply: PermissionV1.ReplyInput }> = []
      const asked = yield* Deferred.make<PermissionV1.Request>()
      const replied = yield* Deferred.make<void>()
      const unsubscribe = yield* events.listen((event) => {
        if (event.type === Permission.Event.Asked.type) {
          order.push("asked")
          return Deferred.succeed(asked, event.data as PermissionV1.Request).pipe(Effect.asVoid)
        }
        if (event.type === Permission.Event.Replied.type) {
          order.push("published-reply")
          return Deferred.succeed(replied, undefined).pipe(Effect.asVoid)
        }
        return Effect.void
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_exact_lifecycle"),
        sessionID: SessionID.make("session_exact_lifecycle"),
        permission: "set_default_course_preference",
        patterns: ["course_target"],
        metadata: { source: "runtime", permissionExactReply: false },
        always: [],
        requirePrompt: true,
        ruleset: [{ permission: "*", pattern: "*", action: "allow" }],
        lifecycle: exactLifecycle({
          selected: (selection) =>
            Effect.sync(() => {
              order.push("selected")
              selections.push(selection)
            }),
          replied: (input) =>
            Effect.sync(() => {
              order.push("durable-reply")
              replies.push(input)
            }),
        }),
      }).pipe(Effect.forkScoped)

      const request = yield* Deferred.await(asked)
      expect(order).toEqual(["selected", "asked"])
      expect(selections).toHaveLength(1)
      expect(selections[0]).toMatchObject({
        action: "ask",
        request: {
          id: PermissionV1.ID.make("per_exact_lifecycle"),
          metadata: {
            source: "runtime",
            [PermissionV1.EXACT_REPLY_METADATA_KEY]: true,
            [PermissionV1.PROMPT_REQUIRED_METADATA_KEY]: true,
          },
        },
      })
      expect(request.metadata[PermissionV1.EXACT_REPLY_METADATA_KEY]).toBe(true)

      yield* reply({
        requestID: request.id,
        reply: "reject",
        message: "Use the current course instead",
      })
      yield* Deferred.await(replied)
      const exit = yield* Fiber.await(fiber)

      expect(order).toEqual(["selected", "asked", "durable-reply", "published-reply"])
      expect(replies).toEqual([
        {
          request,
          reply: {
            requestID: request.id,
            reply: "reject",
            message: "Use the current course instead",
          },
        },
      ])
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.CorrectedError)
    }),
  { git: true },
)

it.instance(
  "exact lifecycle creates no permission request identity for deterministic allow or deny",
  () =>
    Effect.gen(function* () {
      const selections: Permission.Selection[] = []
      const lifecycle = exactLifecycle({
        selected: (selection) =>
          Effect.sync(() => {
            selections.push(selection)
          }),
      })

      yield* ask({
        sessionID: SessionID.make("session_exact_allow"),
        permission: "read",
        patterns: ["lesson.md"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "read", pattern: "*", action: "allow" }],
        lifecycle,
      })
      yield* ask({
        sessionID: SessionID.make("session_exact_deny"),
        permission: "bash",
        patterns: ["rm lesson.md"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "bash", pattern: "*", action: "deny" }],
        lifecycle,
      }).pipe(Effect.exit)

      expect(selections.map((selection) => selection.action)).toEqual(["allow", "deny"])
      expect(selections.every((selection) => !("request" in selection))).toBe(true)
      expect(yield* list()).toEqual([])
    }),
  { git: true },
)

// reply tests

it.instance(
  "reply - once resolves the pending ask",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_test1"),
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({ requestID: PermissionV1.ID.make("per_test1"), reply: "once" })
      yield* Fiber.join(fiber)
    }),
  { git: true },
)

it.instance(
  "reply - reject throws RejectedError",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_test2"),
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({ requestID: PermissionV1.ID.make("per_test2"), reply: "reject" })

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.RejectedError)
    }),
  { git: true },
)

it.instance(
  "reply - reject with message throws CorrectedError",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_test2b"),
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({
        requestID: PermissionV1.ID.make("per_test2b"),
        reply: "reject",
        message: "Use a safer command",
      })

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = Cause.squash(exit.cause)
        expect(err).toBeInstanceOf(PermissionV1.CorrectedError)
        expect(String(err)).toContain("Use a safer command")
      }
    }),
  { git: true },
)

it.instance(
  "reply - cancel throws CancelledError without becoming a rejection",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_cancelled"),
        sessionID: SessionID.make("session_cancelled"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
        lifecycle: exactLifecycle(),
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({ requestID: PermissionV1.ID.make("per_cancelled"), reply: "cancel" })

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.CancelledError)
    }),
  { git: true },
)

it.instance(
  "reply - always persists approval and resolves",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_test3"),
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: ["ls"],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({ requestID: PermissionV1.ID.make("per_test3"), reply: "always" })
      yield* Fiber.join(fiber)

      const result = yield* ask({
        sessionID: SessionID.make("session_test2"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      })
      expect(result).toBeUndefined()
    }),
  { git: true },
)

it.instance(
  "ask - requirePrompt publishes a service-owned prompt marker despite a preconfigured allow",
  () =>
    Effect.gen(function* () {
      const events = yield* EventV2Bridge.Service
      const published = yield* Deferred.make<PermissionV1.Request>()
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== Permission.Event.Asked.type) return Effect.void
        return Deferred.succeed(published, event.data as PermissionV1.Request)
      })
      yield* Effect.addFinalizer(() => unsubscribe)
      const fiber = yield* ask({
        sessionID: SessionID.make("session_content_mutation"),
        permission: "content_mutation",
        patterns: ["modify:C:/materials/note.md"],
        metadata: { source: "tool", permissionPromptRequired: false },
        always: [],
        requirePrompt: true,
        ruleset: [{ permission: "*", pattern: "*", action: "allow" }],
      }).pipe(Effect.forkScoped)

      const pending = yield* waitForPending(1)
      expect(pending[0]).toMatchObject({
        permission: "content_mutation",
        patterns: ["modify:C:/materials/note.md"],
        metadata: { source: "tool", permissionPromptRequired: true },
      })
      expect((yield* Deferred.await(published)).metadata).toMatchObject({
        source: "tool",
        permissionPromptRequired: true,
      })
      yield* reply({ requestID: pending[0]!.id, reply: "once" })
      yield* Fiber.join(fiber)
    }),
  { git: true },
)

it.instance(
  "ask - strips a tool-spoofed prompt marker when the service does not require one",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        sessionID: SessionID.make("session_spoofed_prompt_marker"),
        permission: "custom_permission",
        patterns: ["*"],
        metadata: { permissionPromptRequired: true },
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      const pending = yield* waitForPending(1)
      expect(pending[0]?.metadata).not.toHaveProperty("permissionPromptRequired")
      yield* reply({ requestID: pending[0]!.id, reply: "once" })
      yield* Fiber.join(fiber)
    }),
  { git: true },
)

it.instance(
  "reply - one-shot requests cannot persist even if an external client replies always",
  () =>
    Effect.gen(function* () {
      const first = yield* ask({
        id: PermissionV1.ID.make("per_once_only"),
        sessionID: SessionID.make("session_once_only"),
        permission: "content_mutation",
        patterns: ["modify:C:/materials/note.md"],
        metadata: { onceOnly: true },
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({ requestID: PermissionV1.ID.make("per_once_only"), reply: "always" })
      yield* Fiber.join(first)

      const second = yield* ask({
        id: PermissionV1.ID.make("per_once_only_again"),
        sessionID: SessionID.make("session_once_only_again"),
        permission: "content_mutation",
        patterns: ["modify:C:/materials/note.md"],
        metadata: { onceOnly: true },
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)
      expect(yield* waitForPending(1)).toHaveLength(1)
      yield* rejectAll()
      yield* Fiber.await(second)
    }),
  { git: true },
)

it.instance(
  "Gate16 accepted Goal confirmations expose the exact candidate and never persist approval",
  () =>
    Effect.gen(function* () {
      const confirmation = {
        schemaVersion: 1,
        authorizationBasis: "learner_acceptance",
        semanticFingerprint: "a".repeat(64),
        command: {
          operations: [
            {
              type: "create",
              snapshot: {
                outcome: "Explain virtual memory under exam conditions",
                conditions: ["Work one page-replacement example without notes"],
                scope: { type: "learner_home" },
                target: { type: "absent" },
                fieldBases: {
                  outcome: { type: "accepted" },
                  conditions: { type: "accepted" },
                  scope: { type: "accepted" },
                  target: { type: "accepted" },
                  disposition: { type: "accepted" },
                },
              },
              disposition: "active",
            },
          ],
        },
        goalBases: [],
        courseBases: [],
      } satisfies LearnerGoal.ConfirmationSnapshot
      const presentationMetadata = (
        id: PermissionV1.ID,
        sessionID: SessionID,
        messageID: MessageID,
        callID: string,
      ) => {
        const operation = confirmation.command.operations[0]!
        if (operation.type !== "create") throw new Error("Expected the test Goal create operation")
        const presentation = SemanticPresentation.proposal({
          kind: "learner_goals",
          binding: {
            sessionID,
            messageID,
            callID,
            requestID: id,
          },
          authorizationBasis: "learner_acceptance",
          semanticFingerprint: confirmation.semanticFingerprint,
          operations: [
            {
              type: "create",
              resultIntent: "create_new_goal",
              meaning: {
                ...operation.snapshot,
                disposition: operation.disposition,
              },
            },
          ],
          confirmation: {
            schemaVersion: 1,
            permissionRequestID: id,
            goalBases: confirmation.goalBases,
            courseBases: confirmation.courseBases,
          },
        })
        return {
          onceOnly: true,
          authorizationBasis: "learner_acceptance",
          confirmation,
          ...SemanticPresentation.metadata(presentation),
        }
      }
      const permission = yield* Permission.Service
      const events = yield* EventV2Bridge.Service
      const responses = new Map<PermissionV1.ID, PermissionV1.Reply>([
        [PermissionV1.ID.make("per_gate16_goal_confirmation_one"), "always"],
        [PermissionV1.ID.make("per_gate16_goal_confirmation_two"), "once"],
      ])
      const seen: PermissionV1.Request[] = []
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== Permission.Event.Asked.type) return Effect.void
        const request = event.data as PermissionV1.Request
        if (request.permission !== LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) return Effect.void
        const surface = toolPermissionInfo(
          {
            id: request.id,
            sessionID: request.sessionID,
            permission: request.permission,
            patterns: [...request.patterns],
            metadata: { ...request.metadata },
            always: [...request.always],
            ...(request.tool ? { tool: { ...request.tool } } : {}),
          },
          { ...request.metadata },
        )
        const response = responses.get(request.id)

        expect(response).toBeDefined()
        expect(request).toMatchObject({
          permission: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          patterns: [LearnerGoal.PERMISSION_PATTERN],
          always: [],
          metadata: {
            onceOnly: true,
            authorizationBasis: "learner_acceptance",
            confirmation,
            permissionPromptRequired: true,
          },
        })
        expect(SemanticPresentation.readProposal(request).type).toBe("valid")
        expect(surface?.title).toBe("Confirm durable learner Goal changes")
        expect(surface?.lines.join("\n")).toContain(confirmation.command.operations[0]!.snapshot.outcome)
        expect(surface?.lines.join("\n")).toContain(confirmation.command.operations[0]!.snapshot.conditions[0]!)
        expect(surface?.lines.join("\n")).toContain("one-time learner acceptance")
        seen.push(request)
        return permission.reply({ requestID: request.id, reply: response! }).pipe(Effect.orDie)
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      const confirm = (id: PermissionV1.ID, sessionID: SessionID) =>
        Effect.gen(function* () {
          const messageID = MessageID.ascending()
          const callID = `call_${id}`
          yield* permission.ask({
            id,
            sessionID,
            permission: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            patterns: [LearnerGoal.PERMISSION_PATTERN],
            metadata: presentationMetadata(id, sessionID, messageID, callID),
            always: [],
            tool: { messageID, callID },
            requirePrompt: true,
            ruleset: [{ permission: "*", pattern: "*", action: "allow" }],
          })
          expect(yield* permission.list()).toEqual([])
        })

      yield* confirm(
        PermissionV1.ID.make("per_gate16_goal_confirmation_one"),
        SessionID.make("ses_gate16_goal_confirmation_one"),
      )
      yield* confirm(
        PermissionV1.ID.make("per_gate16_goal_confirmation_two"),
        SessionID.make("ses_gate16_goal_confirmation_two"),
      )

      expect(seen.map((request) => request.id)).toEqual([
        PermissionV1.ID.make("per_gate16_goal_confirmation_one"),
        PermissionV1.ID.make("per_gate16_goal_confirmation_two"),
      ])
    }),
  { git: true },
)

it.instance(
  "exact rejection is isolated from generic reject fanout in both directions",
  () =>
    Effect.gen(function* () {
      const exactA = yield* ask({
        id: PermissionV1.ID.make("per_exact_reject_a"),
        sessionID: SessionID.make("session_mixed_reject"),
        permission: "bash",
        patterns: ["one"],
        metadata: {},
        always: [],
        requirePrompt: true,
        ruleset: [{ permission: "*", pattern: "*", action: "allow" }],
        lifecycle: exactLifecycle(),
      }).pipe(Effect.forkScoped)
      const genericA = yield* ask({
        id: PermissionV1.ID.make("per_generic_reject_a"),
        sessionID: SessionID.make("session_mixed_reject"),
        permission: "bash",
        patterns: ["two"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)
      const exactB = yield* ask({
        id: PermissionV1.ID.make("per_exact_reject_b"),
        sessionID: SessionID.make("session_mixed_reject"),
        permission: "bash",
        patterns: ["three"],
        metadata: {},
        always: [],
        requirePrompt: true,
        ruleset: [{ permission: "*", pattern: "*", action: "allow" }],
        lifecycle: exactLifecycle(),
      }).pipe(Effect.forkScoped)
      const genericB = yield* ask({
        id: PermissionV1.ID.make("per_generic_reject_b"),
        sessionID: SessionID.make("session_mixed_reject"),
        permission: "bash",
        patterns: ["four"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(4)
      yield* reply({ requestID: PermissionV1.ID.make("per_exact_reject_a"), reply: "reject" })
      expect((yield* list()).map((item) => item.id).toSorted()).toEqual(
        [
          PermissionV1.ID.make("per_generic_reject_a"),
          PermissionV1.ID.make("per_exact_reject_b"),
          PermissionV1.ID.make("per_generic_reject_b"),
        ].toSorted(),
      )

      yield* reply({ requestID: PermissionV1.ID.make("per_generic_reject_a"), reply: "reject" })
      expect((yield* list()).map((item) => item.id)).toEqual([PermissionV1.ID.make("per_exact_reject_b")])

      yield* reply({ requestID: PermissionV1.ID.make("per_exact_reject_b"), reply: "cancel" })
      const exits = yield* Effect.all([
        Fiber.await(exactA),
        Fiber.await(genericA),
        Fiber.await(exactB),
        Fiber.await(genericB),
      ])
      expect(exits.every(Exit.isFailure)).toBe(true)
    }),
  { git: true },
)

it.instance(
  "exact requests are isolated from generic always fanout in both directions",
  () =>
    Effect.gen(function* () {
      const exactA = yield* ask({
        id: PermissionV1.ID.make("per_exact_always_a"),
        sessionID: SessionID.make("session_mixed_always"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: ["ls"],
        requirePrompt: true,
        ruleset: [{ permission: "*", pattern: "*", action: "allow" }],
        lifecycle: exactLifecycle(),
      }).pipe(Effect.forkScoped)
      const genericA = yield* ask({
        id: PermissionV1.ID.make("per_generic_always_a"),
        sessionID: SessionID.make("session_mixed_always"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: ["ls"],
        ruleset: [],
      }).pipe(Effect.forkScoped)
      const exactB = yield* ask({
        id: PermissionV1.ID.make("per_exact_always_b"),
        sessionID: SessionID.make("session_mixed_always"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        requirePrompt: true,
        ruleset: [{ permission: "*", pattern: "*", action: "allow" }],
        lifecycle: exactLifecycle(),
      }).pipe(Effect.forkScoped)
      const genericB = yield* ask({
        id: PermissionV1.ID.make("per_generic_always_b"),
        sessionID: SessionID.make("session_mixed_always"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(4)
      yield* reply({ requestID: PermissionV1.ID.make("per_exact_always_a"), reply: "always" })
      expect((yield* list()).map((item) => item.id).toSorted()).toEqual(
        [
          PermissionV1.ID.make("per_generic_always_a"),
          PermissionV1.ID.make("per_exact_always_b"),
          PermissionV1.ID.make("per_generic_always_b"),
        ].toSorted(),
      )

      yield* reply({ requestID: PermissionV1.ID.make("per_generic_always_a"), reply: "always" })
      expect((yield* list()).map((item) => item.id)).toEqual([PermissionV1.ID.make("per_exact_always_b")])

      yield* reply({ requestID: PermissionV1.ID.make("per_exact_always_b"), reply: "cancel" })
      expect(Exit.isSuccess(yield* Fiber.await(exactA))).toBe(true)
      expect(Exit.isSuccess(yield* Fiber.await(genericA))).toBe(true)
      expect(Exit.isFailure(yield* Fiber.await(exactB))).toBe(true)
      expect(Exit.isSuccess(yield* Fiber.await(genericB))).toBe(true)
    }),
  { git: true },
)

it.instance(
  "reply - reject cancels all pending for same session",
  () =>
    Effect.gen(function* () {
      const a = yield* ask({
        id: PermissionV1.ID.make("per_test4a"),
        sessionID: SessionID.make("session_same"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      const b = yield* ask({
        id: PermissionV1.ID.make("per_test4b"),
        sessionID: SessionID.make("session_same"),
        permission: "edit",
        patterns: ["foo.ts"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(2)
      yield* reply({ requestID: PermissionV1.ID.make("per_test4a"), reply: "reject" })

      const [ea, eb] = yield* Effect.all([Fiber.await(a), Fiber.await(b)])
      expect(Exit.isFailure(ea)).toBe(true)
      expect(Exit.isFailure(eb)).toBe(true)
      if (Exit.isFailure(ea)) expect(Cause.squash(ea.cause)).toBeInstanceOf(PermissionV1.RejectedError)
      if (Exit.isFailure(eb)) expect(Cause.squash(eb.cause)).toBeInstanceOf(PermissionV1.RejectedError)
    }),
  { git: true },
)

it.instance(
  "reply - always resolves matching pending requests in same session",
  () =>
    Effect.gen(function* () {
      const a = yield* ask({
        id: PermissionV1.ID.make("per_test5a"),
        sessionID: SessionID.make("session_same"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: ["ls"],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      const b = yield* ask({
        id: PermissionV1.ID.make("per_test5b"),
        sessionID: SessionID.make("session_same"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(2)
      yield* reply({ requestID: PermissionV1.ID.make("per_test5a"), reply: "always" })

      yield* Fiber.join(a)
      yield* Fiber.join(b)
      expect(yield* list()).toHaveLength(0)
    }),
  { git: true },
)

it.instance(
  "reply - always keeps other session pending",
  () =>
    Effect.gen(function* () {
      const a = yield* ask({
        id: PermissionV1.ID.make("per_test6a"),
        sessionID: SessionID.make("session_a"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: ["ls"],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      const b = yield* ask({
        id: PermissionV1.ID.make("per_test6b"),
        sessionID: SessionID.make("session_b"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(2)
      yield* reply({ requestID: PermissionV1.ID.make("per_test6a"), reply: "always" })

      yield* Fiber.join(a)
      expect((yield* list()).map((item) => item.id)).toEqual([PermissionV1.ID.make("per_test6b")])

      yield* rejectAll()
      yield* Fiber.await(b)
    }),
  { git: true },
)

it.instance(
  "reply - publishes replied event",
  () =>
    Effect.gen(function* () {
      const events = yield* EventV2Bridge.Service
      const seen = yield* Deferred.make<{
        sessionID: SessionID
        requestID: PermissionV1.ID
        reply: PermissionV1.Reply
      }>()

      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_test7"),
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)

      const unsub = yield* events.listen((event) => {
        if (event.type === Permission.Event.Replied.type)
          Deferred.doneUnsafe(
            seen,
            Effect.succeed(
              event.data as { sessionID: SessionID; requestID: PermissionV1.ID; reply: PermissionV1.Reply },
            ),
          )
        return Effect.void
      })
      yield* Effect.addFinalizer(() => unsub)

      yield* reply({ requestID: PermissionV1.ID.make("per_test7"), reply: "once" })
      yield* Fiber.join(fiber)
      expect(
        yield* Deferred.await(seen).pipe(
          Effect.timeoutOrElse({
            duration: "1 second",
            orElse: () => Effect.fail(new Error("timed out waiting for permission replied event")),
          }),
        ),
      ).toEqual({
        sessionID: SessionID.make("session_test"),
        requestID: PermissionV1.ID.make("per_test7"),
        reply: "once",
      })
    }),
  { git: true },
)

it.instance(
  "a committed reply releases every waiter even when live event publication fails",
  () =>
    Effect.gen(function* () {
      const events = yield* EventV2Bridge.Service
      const publicationStarted = yield* Deferred.make<void>()
      const releasePublication = yield* Deferred.make<void>()
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== Permission.Event.Replied.type) return Effect.void
        return Effect.gen(function* () {
          yield* Deferred.succeed(publicationStarted, undefined)
          yield* Deferred.await(releasePublication)
          return yield* Effect.die(new Error("simulated permission reply delivery failure"))
        })
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      const first = yield* ask({
        id: PermissionV1.ID.make("per_publish_failure_a"),
        sessionID: SessionID.make("session_publish_failure"),
        permission: "bash",
        patterns: ["one"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)
      const second = yield* ask({
        id: PermissionV1.ID.make("per_publish_failure_b"),
        sessionID: SessionID.make("session_publish_failure"),
        permission: "bash",
        patterns: ["two"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(2)
      const replying = yield* reply({
        requestID: PermissionV1.ID.make("per_publish_failure_a"),
        reply: "reject",
      }).pipe(Effect.forkScoped)
      yield* Deferred.await(publicationStarted).pipe(Effect.timeout("1 second"))
      const exits = yield* Effect.all([Fiber.await(first), Fiber.await(second)]).pipe(Effect.timeout("1 second"))

      expect(exits.every(Exit.isFailure)).toBe(true)
      expect(
        exits.every((exit) => Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof PermissionV1.RejectedError),
      ).toBe(true)
      expect(yield* list()).toEqual([])
      yield* Deferred.succeed(releasePublication, undefined)
      expect(Exit.isSuccess(yield* Fiber.await(replying).pipe(Effect.timeout("1 second")))).toBe(true)
    }),
  { git: true },
)

it.live("permission requests stay isolated by directory", () =>
  Effect.gen(function* () {
    const one = yield* tmpdirScoped({ git: true })
    const two = yield* tmpdirScoped({ git: true })
    const store = yield* InstanceStore.Service

    const a = yield* store
      .provide(
        { directory: one },
        ask({
          id: PermissionV1.ID.make("per_dir_a"),
          sessionID: SessionID.make("session_dir_a"),
          permission: "bash",
          patterns: ["ls"],
          metadata: {},
          always: [],
          ruleset: [],
        }),
      )
      .pipe(Effect.forkScoped)

    const b = yield* store
      .provide(
        { directory: two },
        ask({
          id: PermissionV1.ID.make("per_dir_b"),
          sessionID: SessionID.make("session_dir_b"),
          permission: "bash",
          patterns: ["pwd"],
          metadata: {},
          always: [],
          ruleset: [],
        }),
      )
      .pipe(Effect.forkScoped)

    const onePending = yield* store.provide({ directory: one }, waitForPending(1))
    const twoPending = yield* store.provide({ directory: two }, waitForPending(1))

    expect(onePending).toHaveLength(1)
    expect(twoPending).toHaveLength(1)
    expect(onePending[0].id).toBe(PermissionV1.ID.make("per_dir_a"))
    expect(twoPending[0].id).toBe(PermissionV1.ID.make("per_dir_b"))

    yield* store.provide({ directory: one }, reply({ requestID: onePending[0].id, reply: "reject" }))
    yield* store.provide({ directory: two }, reply({ requestID: twoPending[0].id, reply: "reject" }))

    yield* Fiber.await(a)
    yield* Fiber.await(b)
  }),
)

it.instance(
  "pending permission rejects on instance dispose",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const store = yield* InstanceStore.Service
      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_dispose"),
        sessionID: SessionID.make("session_dispose"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      expect(yield* waitForPending(1)).toHaveLength(1)
      const ctx = yield* store.load({ directory: test.directory })
      yield* store.dispose(ctx)

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.RejectedError)
    }),
  { git: true },
)

it.instance(
  "pending permission rejects on instance reload",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const store = yield* InstanceStore.Service
      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_reload"),
        sessionID: SessionID.make("session_reload"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      expect(yield* waitForPending(1)).toHaveLength(1)
      yield* store.reload({ directory: test.directory })

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.RejectedError)
    }),
  { git: true },
)

it.instance(
  "reply - fails for unknown requestID",
  () =>
    Effect.gen(function* () {
      const exit = yield* reply({ requestID: PermissionV1.ID.make("per_unknown"), reply: "once" }).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toMatchObject({ _tag: "Permission.NotFoundError", requestID: "per_unknown" })
      }
      expect(yield* list()).toHaveLength(0)
    }),
  { git: true },
)

it.instance(
  "ask - checks all patterns and stops on first deny",
  () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_test"),
          permission: "bash",
          patterns: ["echo hello", "rm -rf /"],
          metadata: {},
          always: [],
          ruleset: [
            { permission: "bash", pattern: "*", action: "allow" },
            { permission: "bash", pattern: "rm *", action: "deny" },
          ],
        }),
      )
      expect(err).toBeInstanceOf(PermissionV1.DeniedError)
    }),
  { git: true },
)

it.instance(
  "ask - allows all patterns when all match allow rules",
  () =>
    Effect.gen(function* () {
      const result = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["echo hello", "ls -la", "pwd"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "bash", pattern: "*", action: "allow" }],
      })
      expect(result).toBeUndefined()
    }),
  { git: true },
)

it.instance(
  "ask - should deny even when an earlier pattern is ask",
  () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_test"),
          permission: "bash",
          patterns: ["echo hello", "rm -rf /"],
          metadata: {},
          always: [],
          ruleset: [
            { permission: "bash", pattern: "echo *", action: "ask" },
            { permission: "bash", pattern: "rm *", action: "deny" },
          ],
        }),
      )

      expect(err).toBeInstanceOf(PermissionV1.DeniedError)
      expect(yield* list()).toHaveLength(0)
    }),
  { git: true },
)

it.instance(
  "ask - abort should clear pending request",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const store = yield* InstanceStore.Service

      const fiber = yield* ask({
        id: PermissionV1.ID.make("per_reload"),
        sessionID: SessionID.make("session_reload"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "bash", pattern: "*", action: "ask" }],
      }).pipe(Effect.forkScoped)

      const pending = yield* waitForPending(1)
      expect(pending).toHaveLength(1)
      yield* store.reload({ directory: test.directory })

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.RejectedError)
    }),
  { git: true },
)
