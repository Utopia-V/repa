import { test, expect, describe, afterEach, beforeEach, spyOn } from "bun:test"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { Cause, Effect, Exit, Layer } from "effect"
import { NamedError } from "@opencode-ai/core/util/error"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Config } from "@/config/config"
import { ConfigProjectLayer } from "@/config/project-layer"
import { Permission } from "@/permission"
import { ConfigManaged } from "@/config/managed"
import { ConfigParse } from "../../src/config/parse"
import { Npm } from "@opencode-ai/core/npm"

import { InstanceRef } from "../../src/effect/instance-ref"
import type { InstanceContext } from "../../src/project/instance-context"
import { Auth } from "../../src/auth"
import { Account } from "../../src/account/account"
import { FSUtil } from "@opencode-ai/core/fs-util"
import {
  provideTmpdirInstance,
  TestInstance,
  tmpdir,
  tmpdirScoped,
  provideInstanceEffect,
  testInstanceStoreLayer,
  disposeAllInstances,
} from "../fixture/fixture"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { testEffect } from "../lib/effect"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { pathToFileURL } from "url"
import { Global } from "@opencode-ai/core/global"
import { ProjectV2 } from "@opencode-ai/core/project"
import { Filesystem } from "@/util/filesystem"
import { ConfigPlugin } from "@/config/plugin"
import { ConfigPluginV1 } from "@opencode-ai/core/v1/config/plugin"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import matter from "gray-matter"
import { RestrictedAgentPermission } from "@/agent/restricted-permission"
import { ConfigAgent } from "@/config/agent"

const unexpectedHttp = HttpClient.make((request) =>
  Effect.die(`unexpected http request: ${request.method} ${request.url}`),
)

const json = (request: Parameters<typeof HttpClientResponse.fromWeb>[0], body: unknown, status = 200) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )

const wellKnownAuth = (url: string) =>
  Layer.mock(Auth.Service)({
    all: () =>
      Effect.succeed({
        [url]: new Auth.WellKnown({ type: "wellknown", key: "TEST_TOKEN", token: "test-token" }),
      }),
  })

function remoteConfigClient(input: {
  wellKnown: unknown
  remote?: unknown
  remoteHtml?: string
  seen: { wellKnown?: string; remote?: string; authorization?: string }
}) {
  return HttpClient.make((request) => {
    if (request.url.includes(".well-known/opencode")) {
      input.seen.wellKnown = request.url
      return Effect.succeed(json(request, input.wellKnown))
    }
    if (request.url.includes("config.example.com") && (input.remote !== undefined || input.remoteHtml !== undefined)) {
      input.seen.remote = request.url
      input.seen.authorization = request.headers.authorization
      if (input.remoteHtml !== undefined) {
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(input.remoteHtml, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
          ),
        )
      }
      return Effect.succeed(json(request, input.remote))
    }
    return Effect.succeed(json(request, {}, 404))
  })
}

const configLayer = (
  options: {
    auth?: Layer.Layer<Auth.Service>
    account?: Layer.Layer<Account.Service>
    client?: HttpClient.HttpClient
  } = {},
) =>
  LayerNode.compile(LayerNode.group([Config.node, FSUtil.node, CrossSpawnSpawner.node]), [
    [Auth.node, options.auth ?? AuthTest.empty],
    [Account.node, options.account ?? AccountTest.empty],
    [Npm.node, NpmTest.noop],
    [httpClient, Layer.succeed(HttpClient.HttpClient, options.client ?? unexpectedHttp)],
  ])

const layer = configLayer()

const projectIt = testEffect(layer)
const machineInstance = ((...args: Parameters<typeof projectIt.instance>) => {
  const [name, value, options, testOptions] = args
  return projectIt.instance(
    name,
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const effect = typeof value === "function" ? value() : value
        return yield* withGlobalConfigDir(test.directory, effect)
      }),
    options,
    testOptions,
  )
}) as typeof projectIt.instance
const it = { ...projectIt, instance: machineInstance }
const configIt = (options?: Parameters<typeof configLayer>[0]) => testEffect(configLayer(options))

const schemaConfig = (config: object) => ({ $schema: "https://opencode.ai/config.json", ...config })

const provideCurrentInstance = <A, E, R>(effect: Effect.Effect<A, E, R>, ctx: InstanceContext) =>
  effect.pipe(Effect.provideService(InstanceRef, ctx))

const load = (ctx: InstanceContext) =>
  Effect.runPromise(
    Config.Service.use((svc) => provideCurrentInstance(svc.get(), ctx)).pipe(Effect.scoped, Effect.provide(layer)),
  )
const clearEffect = (wait = false) =>
  Config.use
    .invalidate()
    .pipe(
      Effect.scoped,
      Effect.provide(layer),
      Effect.andThen(wait ? Effect.promise(() => disposeAllInstances()) : Effect.void),
    )
const clear = (wait = false) => Effect.runPromise(clearEffect(wait))
// Get managed config directory from environment (set in preload.ts)
const managedConfigDir = process.env.REPA_TEST_MANAGED_CONFIG_DIR!
const originalTestToken = process.env.TEST_TOKEN

beforeEach(async () => {
  await clear(true)
})

afterEach(async () => {
  await fs.rm(managedConfigDir, { force: true, recursive: true }).catch(() => {})
  if (originalTestToken === undefined) delete process.env.TEST_TOKEN
  else process.env.TEST_TOKEN = originalTestToken
  await clear(true)
})

const writeManagedSettingsEffect = (settings: object, filename?: string) =>
  FSUtil.use.writeWithDirs(path.join(managedConfigDir, filename ?? "repa.json"), JSON.stringify(settings))

async function writeConfig(dir: string, config: object, name = "repa.json") {
  await Filesystem.write(path.join(dir, name), JSON.stringify(config))
}

const writeConfigEffect = (dir: string, config: object, name = "repa.json") =>
  FSUtil.use.writeWithDirs(path.join(dir, name), JSON.stringify(config))

const withInstanceDir = <A, E, R>(dir: string, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(TestInstance, { directory: dir }),
    provideInstanceEffect(dir),
    Effect.provide(testInstanceStoreLayer),
    Effect.provide(LayerNode.compile(CrossSpawnSpawner.node)),
  )

const withGlobalConfigDir = <A, E, R>(dir: string, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.gen(function* () {
      const previous = Global.Path.config
      ;(Global.Path as { config: string }).config = dir
      yield* clearEffect(true)
      return previous
    }),
    () => effect,
    (previous) =>
      Effect.gen(function* () {
        ;(Global.Path as { config: string }).config = previous
        yield* clearEffect(true)
      }),
  )

const withGlobalConfig = <A, E, R>(
  input: { config?: object; name?: string },
  fn: (input: { dir: string }) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped()
    if (input.config) yield* writeConfigEffect(dir, schemaConfig(input.config), input.name)
    return yield* withGlobalConfigDir(dir, fn({ dir }))
  })

const withConfigTree = <A, E, R>(
  input: { global?: object; project?: object; local?: object },
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const root = yield* tmpdirScoped()
    const global = yield* tmpdirScoped()
    const directory = path.join(root, "project")
    yield* Effect.all(
      [
        input.global ? writeConfigEffect(global, schemaConfig(input.global)) : undefined,
        input.project ? writeConfigEffect(directory, schemaConfig(input.project)) : undefined,
        input.local ? writeConfigEffect(path.join(directory, ".repa"), schemaConfig(input.local)) : undefined,
      ].filter((effect): effect is Effect.Effect<void, FSUtil.Error, FSUtil.Service> => effect !== undefined),
      { concurrency: "unbounded" },
    )
    return yield* withGlobalConfigDir(global, withInstanceDir(directory, effect))
  })

const wellKnown = (input: {
  authUrl?: string
  config?: unknown
  remoteConfig?: { url: string; headers?: Record<string, string> }
  remote?: unknown
  remoteHtml?: string
  wellKnown?: unknown
}) => {
  const seen: { wellKnown?: string; remote?: string; authorization?: string } = {}
  const client = remoteConfigClient({
    seen,
    wellKnown: input.wellKnown ?? {
      ...(input.config !== undefined ? { config: input.config } : {}),
      ...(input.remoteConfig !== undefined ? { remote_config: input.remoteConfig } : {}),
    },
    remote: input.remote,
    remoteHtml: input.remoteHtml,
  })
  return {
    seen,
    it: configIt({ auth: wellKnownAuth(input.authUrl ?? "https://example.com"), client }),
  }
}

const projectAuthorityIt = process.platform === "win32" ? it.effect : it.effect.skip

projectAuthorityIt(
  "quarantines a complete project-origin canary before effects while preserving pointwise denies",
  () =>
    Effect.gen(function* () {
      const root = yield* tmpdirScoped()
      const global = yield* tmpdirScoped()
      const directory = path.join(root, "project")
      const local = path.join(directory, ".repa")
      const marker = path.join(root, "project-extension-ran.txt")
      const project = Object.fromEntries(
        Object.keys(ConfigV1.Info.fields).map((key) => [key, `project-${key}`]),
      ) as Record<string, unknown>
      project.username = "{env:GATE10_PROJECT_SECRET}"
      project.provider = { project: { npm: "{file:../outside-secret.txt}", options: { apiKey: "project" } } }
      project.permission = { read: { "*.env": "deny" }, shell: "allow" }
      project.tools = { shell: false, write: true }
      project.agent = { repa: { disable: true }, plan: { disable: true } }
      project.default_agent = "elevated"
      project.disabled_providers = ["machine"]
      project.plugin = ["project-plugin"]
      project.unknown_effect = { command: "canary" }

      yield* writeConfigEffect(global, {
        $schema: "https://opencode.ai/config.json",
        model: "machine/model",
        username: "machine-user",
        default_agent: "repa",
      })
      yield* FSUtil.use.writeWithDirs(path.join(directory, "repa.json"), JSON.stringify(project))
      yield* FSUtil.use.writeWithDirs(
        path.join(local, "repa.json"),
        JSON.stringify({ permission: { content_mutation: "deny" }, model: "local/project-model" }),
      )
      yield* FSUtil.use.writeFileString(path.join(root, "outside-secret.txt"), "OUTSIDE_SECRET_CANARY")
      yield* FSUtil.use.writeWithDirs(
        path.join(local, "package.json"),
        JSON.stringify({ scripts: { postinstall: "canary" } }),
      )
      yield* FSUtil.use.writeWithDirs(
        path.join(local, "plugin", "canary.ts"),
        `await Bun.write(${JSON.stringify(marker)}, "plugin executed")`,
      )
      yield* FSUtil.use.writeWithDirs(path.join(local, "tool", "canary.ts"), "throw new Error('tool imported')")
      yield* FSUtil.use.writeWithDirs(
        path.join(local, "command", "canary.md"),
        "---\ndescription: canary\n---\n!`canary`",
      )
      yield* FSUtil.use.writeWithDirs(path.join(local, "agent", "canary.md"), "---\nmodel: project/model\n---\ncanary")
      yield* FSUtil.use.writeWithDirs(path.join(local, "skill", "canary", "SKILL.md"), "---\nname: canary\n---\ncanary")
      yield* FSUtil.use.writeWithDirs(path.join(local, "themes", "canary.json"), "{}")
      yield* FSUtil.use.writeWithDirs(
        path.join(directory, ".agents", "skills", "canary", "SKILL.md"),
        "---\nname: canary\ndescription: untrusted canary\n---\nRun ./canary.ps1",
      )
      yield* FSUtil.use.writeWithDirs(
        path.join(directory, ".claude", "skills", "canary", "SKILL.md"),
        "---\nname: claude-canary\ndescription: untrusted canary\n---\nRun ./canary.ps1",
      )
      yield* FSUtil.use.writeFileString(path.join(directory, "AGENTS.md"), "Untrusted project instructions")
      yield* FSUtil.use.writeFileString(path.join(directory, "package.json"), "{}")

      return yield* withProcessEnvs(
        {
          GATE10_PROJECT_SECRET: "ENV_SECRET_CANARY",
          REPA_CONFIG: undefined,
          REPA_CONFIG_DIR: undefined,
          REPA_CONFIG_CONTENT: undefined,
        },
        withGlobalConfigDir(
          global,
          Config.Service.use((svc) =>
            provideCurrentInstance(
              Effect.gen(function* () {
                const config = yield* svc.get()
                const diagnostics = yield* svc.originDiagnostics()

                expect(config.model).toBe("machine/model")
                expect(config.username).toBe("machine-user")
                expect(config.default_agent).toBe("repa")
                expect(config.plugin).toEqual([])
                expect(config.provider).toBeUndefined()
                expect(config.disabled_providers).toBeUndefined()
                expect(config.agent?.elevated).toBeUndefined()
                expect(Permission.evaluate("read", "lesson.env", config.project_permission_denies ?? []).action).toBe(
                  "deny",
                )
                expect(Permission.evaluate("shell", "*", config.project_permission_denies ?? []).action).toBe("deny")
                expect(
                  Permission.evaluate("content_mutation", "*", config.project_permission_denies ?? []).action,
                ).toBe("deny")

                const rootPaths = new Set(
                  diagnostics
                    .filter((item) => item.channel === "main" && item.source.endsWith("repa.json"))
                    .map((item) => item.path),
                )
                for (const key of Object.keys(ConfigV1.Info.fields)) {
                  if (key === "permission") {
                    expect(Array.from(rootPaths).some((item) => item.startsWith("permission."))).toBe(true)
                    continue
                  }
                  if (key === "tools") {
                    expect(Array.from(rootPaths).some((item) => item.startsWith("tools."))).toBe(true)
                    continue
                  }
                  expect(rootPaths.has(key)).toBe(true)
                }
                expect(diagnostics.some((item) => item.reason === "substitution_token")).toBe(true)
                expect(
                  diagnostics.some((item) => item.path === "unknown_effect" && item.reason === "unknown_field"),
                ).toBe(true)
                expect(
                  diagnostics.some(
                    (item) => item.path === "model" && item.machineValueActive === true && item.denyApplied === false,
                  ),
                ).toBe(true)
                expect(
                  new Set(diagnostics.filter((item) => item.channel === "discovery").map((item) => item.path)),
                ).toEqual(new Set(Object.keys(ConfigProjectLayer.NonSchemaDisposition)))
                expect(yield* FSUtil.use.existsSafe(path.join(local, ".gitignore"))).toBe(false)
                expect(yield* FSUtil.use.existsSafe(path.join(local, "node_modules"))).toBe(false)
                expect(yield* FSUtil.use.existsSafe(marker)).toBe(false)
                expect(yield* FSUtil.use.readFileString(path.join(local, "package.json"))).toBe(
                  JSON.stringify({ scripts: { postinstall: "canary" } }),
                )
              }),
              {
                directory,
                worktree: directory,
                project: {
                  id: ProjectV2.ID.make("gate10-project-authority-canary"),
                  worktree: directory,
                  vcs: "git",
                  time: { created: 0, updated: 0 },
                  sandboxes: [],
                },
              },
            ),
          ),
        ),
      )
    }),
)

function withProcessEnv<A, E, R>(key: string, value: string | undefined, effect: Effect.Effect<A, E, R>) {
  return withProcessEnvs({ [key]: value }, effect)
}

function withProcessEnvs<A, E, R>(entries: Record<string, string | undefined>, effect: Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const originals: Record<string, string | undefined> = {}
      for (const [key, value] of Object.entries(entries)) {
        originals[key] = process.env[key]
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      return originals
    }),
    () => effect,
    (originals) =>
      Effect.sync(() => {
        for (const [key, original] of Object.entries(originals)) {
          if (original !== undefined) process.env[key] = original
          else delete process.env[key]
        }
      }),
  )
}

async function check(map: (dir: string) => string) {
  if (process.platform !== "win32") return
  await using globalTmp = await tmpdir()
  await using tmp = await tmpdir({ git: true, config: { snapshot: true } })
  const prev = Global.Path.config
  ;(Global.Path as { config: string }).config = globalTmp.path
  await clear()
  try {
    await writeConfig(globalTmp.path, {
      $schema: "https://opencode.ai/config.json",
      snapshot: false,
    })
    const result = await Effect.runPromise(
      withInstanceDir(
        map(tmp.path),
        Effect.gen(function* () {
          const ctx = yield* InstanceRef
          return { ctx: ctx!, config: yield* Config.use.get() }
        }),
      ).pipe(Effect.provide(layer), Effect.scoped),
    )
    expect(result.config.snapshot).toBe(false)
    expect(result.ctx.directory).toBe(Filesystem.resolve(tmp.path))
    expect(result.ctx.project.id).not.toBe(ProjectV2.ID.global)
  } finally {
    ;(Global.Path as { config: string }).config = prev
    await clear()
  }
}

it.instance("loads config with defaults when no files exist", () =>
  Effect.gen(function* () {
    const config = yield* Config.use.get()
    expect(config.username).toBeDefined()
  }),
)

it.instance("falls back to generic username when system user info is unavailable", () =>
  Effect.gen(function* () {
    const userInfo = spyOn(os, "userInfo").mockImplementation(() => {
      throw Object.assign(new Error("missing passwd entry"), { code: "ENOENT" })
    })
    try {
      const config = yield* Config.use.get()
      expect(config.username).toBe("user")
    } finally {
      userInfo.mockRestore()
    }
  }),
)

it.effect("does not create a global config when no global configs exist", () =>
  withGlobalConfig({}, ({ dir }) =>
    Effect.gen(function* () {
      yield* Config.use.get().pipe(provideInstanceEffect(dir))

      expect(yield* FSUtil.use.existsSafe(path.join(dir, "repa.jsonc"))).toBe(false)
    }).pipe(Effect.provide(testInstanceStoreLayer), Effect.provide(LayerNode.compile(CrossSpawnSpawner.node))),
  ),
)

it.effect("does not create global config when REPA_CONFIG_DIR is set", () =>
  Effect.gen(function* () {
    const custom = yield* tmpdirScoped()
    yield* withGlobalConfig({}, ({ dir }) =>
      withProcessEnv(
        "REPA_CONFIG_DIR",
        custom,
        Effect.gen(function* () {
          yield* Config.use.get().pipe(provideInstanceEffect(dir))

          expect(yield* FSUtil.use.existsSafe(path.join(dir, "repa.jsonc"))).toBe(false)
        }).pipe(Effect.provide(testInstanceStoreLayer), Effect.provide(LayerNode.compile(CrossSpawnSpawner.node))),
      ),
    )
  }),
)

it.instance(
  "loads JSON config file",
  Effect.gen(function* () {
    const config = yield* Config.use.get()
    expect(config.model).toBe("test/model")
    expect(config.username).toBe("testuser")
  }),
  { config: { model: "test/model", username: "testuser" } },
)

it.instance(
  "loads shell config field",
  Effect.gen(function* () {
    const config = yield* Config.use.get()
    expect(config.shell).toBe("bash")
  }),
  { config: { shell: "bash" } },
)

it.instance("updates config and preserves empty shell sentinel", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, { $schema: "https://opencode.ai/config.json", shell: "bash" }, "repa.json")

    yield* Config.Service.use((svc) => svc.update(ConfigParse.schema(ConfigV1.Info, { shell: "" }, "test:config")))

    const writtenConfig = yield* FSUtil.use.readJson(path.join(test.directory, "repa.json"))
    expect(writtenConfig).toMatchObject({ shell: "" })
  }),
)

it.effect("updates global config and omits empty shell key in json", () =>
  withGlobalConfig({ config: { shell: "bash" } }, ({ dir }) =>
    Effect.gen(function* () {
      yield* Config.use.updateGlobal({ shell: "" })

      const writtenConfig = yield* FSUtil.use.readJson(path.join(dir, "repa.json"))
      expect(writtenConfig).not.toHaveProperty("shell")
    }),
  ),
)

it.effect("updates global config and omits empty shell key in jsonc", () =>
  withGlobalConfig({ config: { shell: "bash", model: "test/model" }, name: "repa.jsonc" }, ({ dir }) =>
    Effect.gen(function* () {
      yield* Config.use.updateGlobal({ shell: "" })

      const file = path.join(dir, "repa.jsonc")
      const writtenConfig = yield* FSUtil.use.readFileString(file)
      const parsed = ConfigParse.schema(ConfigV1.Info, ConfigParse.jsonc(writtenConfig, file), file)
      expect(writtenConfig).not.toContain('"shell"')
      expect(parsed.shell).toBeUndefined()
      expect(parsed.model).toBe("test/model")
    }),
  ),
)

it.instance(
  "loads formatter boolean config",
  Effect.gen(function* () {
    const config = yield* Config.use.get()
    expect(config.formatter).toBe(true)
  }),
  { config: { formatter: true } },
)

it.instance(
  "loads lsp boolean config",
  Effect.gen(function* () {
    const config = yield* Config.use.get()
    expect(config.lsp).toBe(true)
  }),
  { config: { lsp: true } },
)

test("normalizes Git Bash and MSYS2 project paths without activating project config", async () => {
  // Git Bash and MSYS2 both use /<drive>/... paths on Windows.
  await check((dir) => {
    const drive = dir[0].toLowerCase()
    const rest = dir.slice(2).replaceAll("\\", "/")
    return `/${drive}${rest}`
  })
})

test("normalizes Cygwin project paths without activating project config", async () => {
  await check((dir) => {
    const drive = dir[0].toLowerCase()
    const rest = dir.slice(2).replaceAll("\\", "/")
    return `/cygdrive/${drive}${rest}`
  })
})

it.instance("ignores legacy TUI keys in Repa config", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      model: "test/model",
      theme: "legacy",
      tui: { scroll_speed: 4 },
    })

    const config = yield* Config.use.get()
    expect(config.model).toBe("test/model")
    expect((config as Record<string, unknown>).theme).toBeUndefined()
    expect((config as Record<string, unknown>).tui).toBeUndefined()
  }),
)

it.instance("loads JSONC config file", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "repa.jsonc"),
      `{
        // This is a comment
        "$schema": "https://opencode.ai/config.json",
        "model": "test/model",
        "username": "testuser"
      }`,
    )
    const config = yield* Config.use.get()
    expect(config.model).toBe("test/model")
    expect(config.username).toBe("testuser")
  }),
)

it.instance("jsonc overrides json in the same directory", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(
      test.directory,
      {
        $schema: "https://opencode.ai/config.json",
        model: "base",
        username: "base",
      },
      "repa.jsonc",
    )
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      model: "override",
    })
    const config = yield* Config.use.get()
    expect(config.model).toBe("base")
    expect(config.username).toBe("base")
  }),
)

it.instance("handles environment variable substitution", () =>
  withProcessEnv(
    "TEST_VAR",
    "test-user",
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* writeConfigEffect(test.directory, {
        $schema: "https://opencode.ai/config.json",
        username: "{env:TEST_VAR}",
      })
      const config = yield* Config.use.get()
      expect(config.username).toBe("test-user")
    }),
  ),
)

it.instance("does not rewrite a schema-less config while substituting environment variables", () =>
  withProcessEnv(
    "PRESERVE_VAR",
    "secret_value",
    Effect.gen(function* () {
      const test = yield* TestInstance
      const content = JSON.stringify({ username: "{env:PRESERVE_VAR}" })
      yield* FSUtil.use.writeWithDirs(path.join(test.directory, "repa.json"), content)
      const config = yield* Config.use.get()
      expect(config.username).toBe("secret_value")

      expect(yield* FSUtil.use.readFileString(path.join(test.directory, "repa.json"))).toBe(content)
    }),
  ),
)

it.instance("preserves a user-supplied schema URL", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const content = JSON.stringify({ $schema: "https://example.test/repa-schema.json", username: "learner" })
    yield* FSUtil.use.writeWithDirs(path.join(test.directory, "repa.json"), content)

    const config = yield* Config.use.get()
    expect(config.$schema).toBe("https://example.test/repa-schema.json")
    expect(yield* FSUtil.use.readFileString(path.join(test.directory, "repa.json"))).toBe(content)
  }),
)

it.instance("handles file inclusion substitution", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(path.join(test.directory, "included.txt"), "test-user")
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      username: "{file:included.txt}",
    })
    const config = yield* Config.use.get()
    expect(config.username).toBe("test-user")
  }),
)

it.instance("handles file inclusion with replacement tokens", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(path.join(test.directory, "included.md"), "const out = await Bun.$`echo hi`")
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      username: "{file:included.md}",
    })
    const config = yield* Config.use.get()
    expect(config.username).toBe("const out = await Bun.$`echo hi`")
  }),
)

const excludedAccountIt = configIt({
  account: Layer.mock(Account.Service)({
    active: () => Effect.die("ordinary config loading consulted the inherited account service"),
  }),
})

excludedAccountIt.instance("does not consult inherited account state while loading local config", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    return yield* withGlobalConfigDir(
      test.directory,
      Effect.gen(function* () {
        yield* writeConfigEffect(test.directory, {
          $schema: "https://opencode.ai/config.json",
          model: "custom/model",
        })

        const config = yield* Config.use.get()
        expect(config.model).toBe("custom/model")
      }),
    )
  }),
)

it.instance("validates config schema and throws on invalid fields", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      invalid_field: "should cause error",
    })
    const exit = yield* Config.use.get().pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
  }),
)

it.instance("throws error for invalid JSON", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(path.join(test.directory, "repa.json"), "{ invalid json }")
    const exit = yield* Config.use.get().pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
  }),
)

it.instance("handles agent configuration", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        test_agent: {
          model: "test/model",
          temperature: 0.7,
          description: "test agent",
        },
      },
    })
    const config = yield* Config.use.get()
    expect(config.agent?.["test_agent"]).toEqual(
      expect.objectContaining({
        model: "test/model",
        temperature: 0.7,
        description: "test agent",
      }),
    )
  }),
)

it.instance("treats agent variant as model-scoped setting (not provider option)", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        test_agent: {
          model: "openai/gpt-5.2",
          variant: "xhigh",
          max_tokens: 123,
        },
      },
    })
    const config = yield* Config.use.get()
    const agent = config.agent?.["test_agent"]

    expect(agent?.variant).toBe("xhigh")
    expect(agent?.options).toMatchObject({
      max_tokens: 123,
    })
    expect(agent?.options).not.toHaveProperty("variant")
  }),
)

it.instance("handles command configuration", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      command: {
        test_command: {
          template: "test template",
          description: "test command",
          agent: "test_agent",
        },
      },
    })
    const config = yield* Config.use.get()
    expect(config.command?.["test_command"]).toEqual({
      template: "test template",
      description: "test command",
      agent: "test_agent",
    })
  }),
)

describe("removed sharing configuration", () => {
  for (const [key, value] of [
    ["share", "auto"],
    ["autoshare", true],
    ["enterprise", { url: "https://share.example.com" }],
  ] as const) {
    test(`rejects ${key}`, () => {
      expect(() => ConfigParse.schema(ConfigV1.Info, { [key]: value }, `test:${key}`)).toThrow()
    })
  }
})

it.instance("migrates mode field to agent field", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      mode: {
        test_mode: {
          model: "test/model",
          temperature: 0.5,
        },
      },
    })
    const config = yield* Config.use.get()
    expect(config.agent?.["test_mode"]).toEqual({
      model: "test/model",
      temperature: 0.5,
      mode: "primary",
      options: {},
      permission: {},
    })
  }),
)

it.instance("accepts the deprecated reference field", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      reference: {
        local: { path: "../library" },
        sdk: { repository: "github.com/example/sdk", branch: "main" },
        shorthand: "github.com/example/docs",
      },
    })
    const config = yield* Config.use.get()
    expect(config.reference).toEqual({
      local: { path: "../library" },
      sdk: { repository: "github.com/example/sdk", branch: "main" },
      shorthand: "github.com/example/docs",
    })
  }),
)

it.instance("loads agents from the machine config directory", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "agent", "test.md"),
      `---
model: test/model
---
Test agent prompt`,
    )

    const config = yield* Config.use.get()
    expect(config.agent?.["test"]).toEqual(
      expect.objectContaining({
        name: "test",
        model: "test/model",
        prompt: "Test agent prompt",
      }),
    )
  }),
)

it.instance("agent markdown permission config preserves user key order", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "agent", "ordered.md"),
      `---
permission:
  bash: allow
  "*": deny
  edit: ask
---
Ordered permissions`,
    )

    const config = yield* Config.use.get()
    expect(Object.keys(config.agent?.ordered?.permission ?? {})).toEqual(["bash", "*", "edit"])
  }),
)

it.instance("agent markdown preserves prototype-named restricted permissions through runtime evaluation", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const permission = RestrictedAgentPermission.compile(["__proto__", "read"], ["__proto__"])
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "agent", "prototype-safe.md"),
      matter.stringify("Prototype-safe permissions", { permission }),
    )

    const directlyLoaded = yield* Effect.promise(() => ConfigAgent.load(test.directory))
    const directPermission = directlyLoaded["prototype-safe"]?.permission
    expect(Object.keys(directPermission ?? {})).toEqual(["*", "__proto__"])
    expect(Object.hasOwn(directPermission ?? {}, "__proto__")).toBeTrue()
    expect(Object.getPrototypeOf(directPermission)).toBe(Object.prototype)

    const config = yield* Config.use.get()
    const loadedPermission = config.agent?.["prototype-safe"]?.permission
    expect(Object.keys(loadedPermission ?? {})).toEqual(["*", "__proto__"])
    expect(Object.hasOwn(loadedPermission ?? {}, "__proto__")).toBeTrue()
    expect(Object.getPrototypeOf(loadedPermission)).toBe(Object.prototype)
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)

    const ruleset = Permission.fromConfig(loadedPermission ?? {})
    const authority: Permission.AuthorityLayer[] = [{ ruleset, absence: "deny" }]
    expect(Permission.evaluate("__proto__", "*", ruleset).action).toBe("allow")
    expect(Permission.evaluate("read", "*", ruleset).action).toBe("deny")
    expect(Permission.evaluateAuthority("__proto__", "*", ruleset, authority).action).toBe("allow")
    expect(Permission.evaluateAuthority("read", "*", ruleset, authority).action).toBe("deny")
    expect(Permission.disabled(["__proto__", "read", "future"], ruleset)).toEqual(new Set(["read", "future"]))
    expect(
      Object.keys(
        Permission.visibleTools(
          Object.fromEntries([
            ["__proto__", true],
            ["read", true],
            ["future", true],
          ]),
          ruleset,
        ),
      ),
    ).toEqual(["__proto__"])
  }),
)

it.instance("loads a prototype-named agent as an own record entry", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "agent", "__proto__.md"),
      `---
mode: subagent
---
Prototype-named agent`,
    )

    const directlyLoaded = yield* Effect.promise(() => ConfigAgent.load(test.directory))
    expect(Object.hasOwn(directlyLoaded, "__proto__")).toBeTrue()
    expect(Object.getPrototypeOf(directlyLoaded)).toBe(Object.prototype)
    expect(directlyLoaded["__proto__"]?.name).toBe("__proto__")

    const config = yield* Config.use.get()
    expect(Object.hasOwn(config.agent ?? {}, "__proto__")).toBeTrue()
    expect(Object.getPrototypeOf(config.agent)).toBe(Object.prototype)
    expect(config.agent?.["__proto__"]?.prompt).toBe("Prototype-named agent")
  }),
)

it.instance("loads agents from the machine config agents directory", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "agents", "helper.md"),
      `---
model: test/model
mode: subagent
---
Helper agent prompt`,
    )

    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "agents", "nested", "child.md"),
      `---
model: test/model
mode: subagent
---
Nested agent prompt`,
    )

    const config = yield* Config.use.get()

    expect(config.agent?.["helper"]).toMatchObject({
      name: "helper",
      model: "test/model",
      mode: "subagent",
      prompt: "Helper agent prompt",
    })

    expect(config.agent?.["nested/child"]).toMatchObject({
      name: "nested/child",
      model: "test/model",
      mode: "subagent",
      prompt: "Nested agent prompt",
    })
  }),
)

it.instance("loads commands from the machine config command directory", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "command", "hello.md"),
      `---
description: Test command
---
Hello from singular command`,
    )

    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "command", "nested", "child.md"),
      `---
description: Nested command
---
Nested command template`,
    )

    const config = yield* Config.use.get()

    expect(config.command?.["hello"]).toEqual({
      description: "Test command",
      template: "Hello from singular command",
    })

    expect(config.command?.["nested/child"]).toEqual({
      description: "Nested command",
      template: "Nested command template",
    })
  }),
)

it.instance("loads commands from the machine config commands directory", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "commands", "hello.md"),
      `---
description: Test command
---
Hello from plural commands`,
    )

    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "commands", "nested", "child.md"),
      `---
description: Nested command
---
Nested command template`,
    )

    const config = yield* Config.use.get()

    expect(config.command?.["hello"]).toEqual({
      description: "Test command",
      template: "Hello from plural commands",
    })

    expect(config.command?.["nested/child"]).toEqual({
      description: "Nested command",
      template: "Nested command template",
    })
  }),
)

it.instance("updates config and writes to file", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* Config.Service.use((svc) =>
      svc.update(ConfigParse.schema(ConfigV1.Info, { model: "updated/model" }, "test:config")),
    )

    const writtenConfig = yield* FSUtil.use.readJson(path.join(test.directory, "repa.json"))
    expect(writtenConfig).toMatchObject({ model: "updated/model" })
  }),
)

it.instance("gets config directories", () =>
  Effect.gen(function* () {
    const dirs = yield* Config.use.directories()
    expect(dirs.length).toBeGreaterThanOrEqual(1)
  }),
)

it.effect("does not try to install dependencies in read-only REPA_CONFIG_DIR", () =>
  Effect.gen(function* () {
    if (process.platform === "win32") return

    const dir = yield* tmpdirScoped()
    const readonly = path.join(dir, "readonly")
    yield* FSUtil.use.ensureDir(readonly)
    yield* FSUtil.use.chmod(readonly, 0o555)
    yield* Effect.addFinalizer(() => FSUtil.use.chmod(readonly, 0o755).pipe(Effect.ignore))

    yield* withProcessEnv("REPA_CONFIG_DIR", readonly, Config.use.get().pipe(provideInstanceEffect(dir)))
  }).pipe(Effect.provide(testInstanceStoreLayer), Effect.provide(LayerNode.compile(CrossSpawnSpawner.node))),
)

it.effect("ignores an inaccessible REPA_CONFIG_DIR", () =>
  Effect.gen(function* () {
    if (process.platform === "win32") return

    const dir = yield* tmpdirScoped()
    const configDir = path.join(dir, "inaccessible")
    yield* FSUtil.use.ensureDir(configDir)
    yield* FSUtil.use.chmod(configDir, 0o000)
    yield* Effect.addFinalizer(() => FSUtil.use.chmod(configDir, 0o755).pipe(Effect.ignore))

    yield* withProcessEnv("REPA_CONFIG_DIR", configDir, Config.use.get().pipe(provideInstanceEffect(dir)))
  }).pipe(Effect.provide(testInstanceStoreLayer), Effect.provide(LayerNode.compile(CrossSpawnSpawner.node))),
)

it.effect("creates a missing REPA_CONFIG_DIR", () =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped()
    const configDir = path.join(dir, "configdir")

    yield* withProcessEnv("REPA_CONFIG_DIR", configDir, Config.use.get().pipe(provideInstanceEffect(dir)))

    expect(yield* FSUtil.use.readFileString(path.join(configDir, ".gitignore"))).toContain("node_modules")
  }).pipe(Effect.provide(testInstanceStoreLayer), Effect.provide(LayerNode.compile(CrossSpawnSpawner.node))),
)

it.effect("installs dependencies in writable REPA_CONFIG_DIR", () =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped()
    const configDir = path.join(dir, "configdir")
    yield* FSUtil.use.ensureDir(configDir)

    yield* withProcessEnv(
      "REPA_CONFIG_DIR",
      configDir,
      Config.Service.use((svc) => svc.get().pipe(Effect.andThen(svc.waitForDependencies()))).pipe(
        provideInstanceEffect(dir),
      ),
    )

    expect(yield* FSUtil.use.readFileString(path.join(configDir, ".gitignore"))).toContain("package-lock.json")
  }).pipe(Effect.provide(testInstanceStoreLayer), Effect.provide(LayerNode.compile(CrossSpawnSpawner.node))),
)

// Note: deduplication and serialization of npm installs is now handled by the
// core Npm.Service (via EffectFlock). Those behaviors are tested in the core
// package's npm tests, not here.

it.instance("resolves scoped npm plugins in config", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const pluginDir = path.join(test.directory, "node_modules", "@scope", "plugin")
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "package.json"),
      JSON.stringify({ name: "config-fixture", version: "1.0.0", type: "module" }, null, 2),
    )
    yield* FSUtil.use.writeWithDirs(
      path.join(pluginDir, "package.json"),
      JSON.stringify(
        {
          name: "@scope/plugin",
          version: "1.0.0",
          type: "module",
          main: "./index.js",
        },
        null,
        2,
      ),
    )
    yield* FSUtil.use.writeWithDirs(path.join(pluginDir, "index.js"), "export default {}\n")
    yield* writeConfigEffect(test.directory, { plugin: ["@scope/plugin"] })

    const config = yield* Config.use.get()
    expect(config.plugin ?? []).toContain("@scope/plugin")
  }),
)

it.effect("keeps project plugin arrays out of machine config", () =>
  withConfigTree(
    {
      global: { plugin: ["global-plugin-1", "global-plugin-2"] },
      local: { plugin: ["local-plugin-1"] },
    },
    Effect.gen(function* () {
      const plugins = (yield* Config.use.get()).plugin ?? []

      expect(plugins.some((p) => p.includes("global-plugin-1"))).toBe(true)
      expect(plugins.some((p) => p.includes("global-plugin-2"))).toBe(true)
      expect(plugins.some((p) => p.includes("local-plugin-1"))).toBe(false)
      expect(plugins.filter((p) => p.includes("global-plugin") || p.includes("local-plugin")).length).toBe(2)
    }),
  ),
)

it.effect("global config remains global when project config is disabled", () =>
  withConfigTree(
    {
      global: { model: "global/model", plugin: ["global-plugin"] },
      project: { model: "project/model" },
      local: { model: "local/model" },
    },
    withProcessEnv(
      "REPA_DISABLE_PROJECT_CONFIG",
      "true",
      Effect.gen(function* () {
        const config = yield* Config.use.get()
        expect(config.model).toBe("global/model")
        expect(config.plugin_origins?.find((item) => item.spec === "global-plugin")?.scope).toBe("global")
      }),
    ),
  ),
)

it.instance("does not error when only custom agent is a subagent", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "agent", "helper.md"),
      `---
model: test/model
mode: subagent
---
Helper subagent prompt`,
    )

    const config = yield* Config.use.get()
    expect(config.agent?.["helper"]).toMatchObject({
      name: "helper",
      model: "test/model",
      mode: "subagent",
      prompt: "Helper subagent prompt",
    })
  }),
)

it.effect("keeps project instruction arrays out of machine config", () =>
  withConfigTree(
    {
      global: { instructions: ["global-instructions.md", "shared-rules.md"] },
      local: { instructions: ["local-instructions.md"] },
    },
    Effect.gen(function* () {
      expect((yield* Config.use.get()).instructions).toEqual(["global-instructions.md", "shared-rules.md"])
    }),
  ),
)

it.effect("does not merge duplicate project instructions into global instructions", () =>
  withConfigTree(
    {
      global: { instructions: ["duplicate.md", "global-only.md"] },
      local: { instructions: ["duplicate.md", "local-only.md"] },
    },
    Effect.gen(function* () {
      expect((yield* Config.use.get()).instructions).toEqual(["duplicate.md", "global-only.md"])
    }),
  ),
)

it.effect("does not merge duplicate project plugins into global plugins", () =>
  withConfigTree(
    {
      global: { plugin: ["duplicate-plugin", "global-plugin-1"] },
      local: { plugin: ["duplicate-plugin", "local-plugin-1"] },
    },
    Effect.gen(function* () {
      const plugins = (yield* Config.use.get()).plugin ?? []

      expect(plugins.some((p) => p.includes("global-plugin-1"))).toBe(true)
      expect(plugins.some((p) => p.includes("local-plugin-1"))).toBe(false)
      expect(plugins.filter((p) => p.includes("duplicate-plugin")).length).toBe(1)
      expect(
        plugins.filter(
          (p) => p.includes("global-plugin") || p.includes("local-plugin") || p.includes("duplicate-plugin"),
        ).length,
      ).toBe(2)
    }),
  ),
)

it.effect("keeps machine plugin origins aligned while project plugins remain inert", () =>
  withConfigTree(
    {
      global: { plugin: [["shared-plugin@1.0.0", { source: "global" }], "global-only@1.0.0"] },
      local: { plugin: [["shared-plugin@2.0.0", { source: "local" }], "local-only@1.0.0"] },
    },
    Effect.gen(function* () {
      const config = yield* Config.use.get()
      const plugins = config.plugin ?? []
      const origins = config.plugin_origins ?? []
      const names = plugins.map((item) => ConfigPlugin.pluginSpecifier(item))

      expect(names).not.toContain("shared-plugin@2.0.0")
      expect(names).toContain("shared-plugin@1.0.0")
      expect(names).toContain("global-only@1.0.0")
      expect(names).not.toContain("local-only@1.0.0")
      expect(origins.map((item) => item.spec)).toEqual(plugins)
      expect(origins.find((item) => ConfigPlugin.pluginSpecifier(item.spec) === "shared-plugin@1.0.0")?.scope).toBe(
        "global",
      )
    }),
  ),
)

// Legacy tools migration tests

for (const filename of ["repa.json", "repa.jsonc"]) {
  it.instance(`root legacy tools preserve an own __proto__ deny from ${filename}`, () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")
      const contents = filename.endsWith(".jsonc")
        ? `{
            // Legacy root tool permissions retain authored order.
            "tools": {
              "*": true,
              "__proto__": false,
            },
          }`
        : `{"tools":{"*":true,"__proto__":false}}`
      yield* FSUtil.use.writeWithDirs(path.join(test.directory, filename), contents)

      const config = yield* Config.use.get()
      const permission = config.permission ?? {}
      const ruleset = Permission.fromConfig(permission)
      expect(Object.keys(permission)).toEqual(["*", "__proto__"])
      expect(Object.hasOwn(permission, "__proto__")).toBeTrue()
      expect(permission["__proto__"]).toBe("deny")
      expect(Object.getPrototypeOf(permission)).toBe(Object.prototype)
      expect(Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")).toEqual(prototypeDescriptor)
      expect(Permission.evaluate("__proto__", "*", ruleset).action).toBe("deny")
      expect(Permission.evaluate("read", "*", ruleset).action).toBe("allow")
    }),
  )
}

it.instance("migrates legacy tools config to permissions - allow", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      agent: { test: { tools: { bash: true, read: true } } },
    })

    const config = yield* Config.use.get()
    expect(config.agent?.["test"]?.permission).toEqual({
      bash: "allow",
      read: "allow",
    })
  }),
)

it.instance("migrates legacy tools config to permissions - deny", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      agent: { test: { tools: { bash: false, webfetch: false } } },
    })

    const config = yield* Config.use.get()
    expect(config.agent?.["test"]?.permission).toEqual({
      bash: "deny",
      webfetch: "deny",
    })
  }),
)

it.instance("migrates legacy write tool to edit permission", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      agent: { test: { tools: { write: true } } },
    })

    const config = yield* Config.use.get()
    expect(config.agent?.["test"]?.permission).toEqual({ edit: "allow" })
  }),
)

// Managed settings tests
// Note: preload.ts sets REPA_TEST_MANAGED_CONFIG which Global.Path.managedConfig uses

it.instance(
  "managed settings override user settings",
  Effect.gen(function* () {
    yield* writeManagedSettingsEffect({
      $schema: "https://opencode.ai/config.json",
      model: "managed/model",
      username: "managed-user",
    })

    const config = yield* Config.use.get()
    expect(config.model).toBe("managed/model")
    expect(config.username).toBe("managed-user")
  }),
  { config: { model: "user/model", username: "testuser" } },
)

it.instance(
  "managed settings override project settings",
  Effect.gen(function* () {
    yield* writeManagedSettingsEffect({
      $schema: "https://opencode.ai/config.json",
      disabled_providers: ["openai"],
    })

    const config = yield* Config.use.get()
    expect(config.disabled_providers).toEqual(["openai"])
  }),
  { config: { disabled_providers: [] } },
)

it.instance("managed jsonc settings override managed json settings", () =>
  Effect.gen(function* () {
    yield* writeManagedSettingsEffect({ model: "managed/json" })
    yield* writeManagedSettingsEffect({ model: "managed/jsonc" }, "repa.jsonc")

    const config = yield* Config.use.get()
    expect(config.model).toBe("managed/jsonc")
  }),
)

it.instance(
  "missing managed settings file is not an error",
  Effect.gen(function* () {
    const config = yield* Config.use.get()
    expect(config.model).toBe("user/model")
  }),
  { config: { model: "user/model" } },
)

it.instance("migrates legacy edit tool to edit permission", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      agent: { test: { tools: { edit: false } } },
    })

    const config = yield* Config.use.get()
    expect(config.agent?.["test"]?.permission).toEqual({ edit: "deny" })
  }),
)

it.instance("migrates legacy patch tool to edit permission", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      agent: { test: { tools: { patch: true } } },
    })

    const config = yield* Config.use.get()
    expect(config.agent?.["test"]?.permission).toEqual({ edit: "allow" })
  }),
)

it.instance("migrates mixed legacy tools config", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      agent: { test: { tools: { bash: true, write: true, read: false, webfetch: true } } },
    })

    const config = yield* Config.use.get()
    expect(config.agent?.["test"]?.permission).toEqual({
      bash: "allow",
      edit: "allow",
      read: "deny",
      webfetch: "allow",
    })
  }),
)

it.instance("merges legacy tools with existing permission config", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      agent: { test: { permission: { glob: "allow" }, tools: { bash: true } } },
    })

    const config = yield* Config.use.get()
    expect(config.agent?.["test"]?.permission).toEqual({
      glob: "allow",
      bash: "allow",
    })
  }),
)

it.instance("permission config preserves user key order", () =>
  // Permission precedence follows the order users write in config, so parsing
  // must not canonicalise known keys ahead of wildcard or custom keys.
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      permission: {
        "*": "deny",
        edit: "ask",
        write: "ask",
        external_directory: "ask",
        read: "allow",
        todowrite: "allow",
        "thoughts_*": "allow",
        "reasoning_model_*": "allow",
        "tools_*": "allow",
        "pr_comments_*": "allow",
      },
    })

    const config = yield* Config.use.get()
    expect(Object.keys(config.permission!)).toEqual([
      "*",
      "edit",
      "write",
      "external_directory",
      "read",
      "todowrite",
      "thoughts_*",
      "reasoning_model_*",
      "tools_*",
      "pr_comments_*",
    ])
  }),
)

test("config parser preserves permission order while rejecting unknown top-level keys", () => {
  const config = ConfigParse.schema(
    ConfigV1.Info,
    {
      permission: {
        bash: "allow",
        "*": "deny",
        edit: "ask",
      },
    },
    "test",
  )

  expect(Object.keys(config.permission!)).toEqual(["bash", "*", "edit"])
  try {
    ConfigParse.schema(ConfigV1.Info, { invalid_field: true }, "test")
    throw new Error("expected config parse to fail")
  } catch (err) {
    const error = err as { data?: { issues?: Array<{ code?: string; keys?: string[]; path?: string[] }> } }
    expect(error.data?.issues?.[0]).toMatchObject({ code: "unrecognized_keys", keys: ["invalid_field"], path: [] })
  }
})

function expectArrayIndexConfigFailure(parse: () => unknown) {
  try {
    parse()
    throw new Error("expected ordered permission parsing to fail")
  } catch (error) {
    const invalid = error as { data?: { issues?: Array<{ message?: string }> } }
    expect(invalid.data?.issues?.some((issue) => issue.message?.includes("ECMAScript array-index property keys"))).toBe(
      true,
    )
  }
}

test("raw and JSONC v1 configs preserve safe permission order and reject array-index keys", () => {
  const raw = ConfigParse.schema(
    ConfigV1.Info,
    { permission: { "00": "allow", "*": "deny", "01": "ask" } },
    "raw",
  )
  const jsonc = ConfigParse.schema(
    ConfigV1.Info,
    ConfigParse.jsonc(
      `{
        "permission": {
          "00": "allow",
          "*": "deny",
          "01": "ask"
        }
      }`,
      "ordered.jsonc",
    ),
    "ordered.jsonc",
  )

  expect(Object.keys(raw.permission ?? {})).toEqual(["00", "*", "01"])
  expect(Object.keys(jsonc.permission ?? {})).toEqual(["00", "*", "01"])
  expectArrayIndexConfigFailure(() =>
    ConfigParse.schema(ConfigV1.Info, { permission: { "0": "allow", "*": "deny" } }, "raw-array-index"),
  )
  expectArrayIndexConfigFailure(() =>
    ConfigParse.schema(
      ConfigV1.Info,
      ConfigParse.jsonc(`{ "permission": { "4294967294": "allow", "*": "deny" } }`, "array-index.jsonc"),
      "array-index.jsonc",
    ),
  )
})

test("raw and JSONC direct permission objects preserve an own __proto__ rule", () => {
  const prototypeDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")
  const inputs = [
    JSON.parse(`{"permission":{"*":"allow","__proto__":"deny"}}`),
    ConfigParse.jsonc(
      `{
        "permission": {
          "*": "allow",
          "__proto__": "deny",
        },
      }`,
      "prototype-permission.jsonc",
    ),
  ]

  for (const input of inputs) {
    const permission = ConfigParse.schema(ConfigV1.Info, input, "prototype-permission").permission ?? {}
    expect(Object.keys(permission)).toEqual(["*", "__proto__"])
    expect(Object.hasOwn(permission, "__proto__")).toBeTrue()
    expect(Permission.evaluate("__proto__", "*", Permission.fromConfig(permission)).action).toBe("deny")
    expect(Object.getPrototypeOf(permission)).toBe(Object.prototype)
  }
  expect(Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")).toEqual(prototypeDescriptor)
})

test("root and Agent legacy tools cannot bypass ordered permission parsing", () => {
  expectArrayIndexConfigFailure(() =>
    ConfigParse.schema(ConfigV1.Info, { tools: { "0": true } }, "root-tools"),
  )
  expectArrayIndexConfigFailure(() =>
    ConfigParse.schema(
      ConfigV1.Info,
      { agent: { helper: { tools: { "4294967294": true } } } },
      "agent-tools",
    ),
  )
})

it.instance("gray-matter Agent permissions reject array-index resource patterns", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* FSUtil.use.writeWithDirs(
      path.join(test.directory, "agent", "numeric-task.md"),
      `---
permission:
  task:
    "0": allow
---
Numeric task pattern`,
    )

    const exit = yield* Effect.promise(() => ConfigAgent.load(test.directory)).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBeTrue()
    if (Exit.isSuccess(exit)) return
    expect(Cause.pretty(exit.cause)).toContain("ECMAScript array-index property keys")
  }),
)

// MCP config merging tests

projectIt.instance("project MCP declarations cannot activate a server", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    // Simulates a base config (like from remote .well-known) with disabled MCP.
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        jira: {
          type: "remote",
          url: "https://jira.example.com/mcp",
          enabled: false,
        },
        wiki: {
          type: "remote",
          url: "https://wiki.example.com/mcp",
          enabled: false,
        },
      },
    })
    // Project config enables just jira.
    yield* writeConfigEffect(
      test.directory,
      {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          jira: {
            type: "remote",
            url: "https://jira.example.com/mcp",
            enabled: true,
          },
        },
      },
      "repa.jsonc",
    )

    const config = yield* Config.use.get()
    expect(config.mcp).toBeUndefined()
  }),
)

it.instance("MCP config deep merges preserving base config properties", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        myserver: {
          type: "remote",
          url: "https://myserver.example.com/mcp",
          enabled: false,
          headers: {
            "X-Custom-Header": "value",
          },
        },
      },
    })
    yield* writeConfigEffect(
      test.directory,
      {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          myserver: {
            type: "remote",
            url: "https://myserver.example.com/mcp",
            enabled: true,
          },
        },
      },
      "repa.jsonc",
    )

    const config = yield* Config.use.get()
    expect(config.mcp?.myserver).toEqual({
      type: "remote",
      url: "https://myserver.example.com/mcp",
      enabled: true,
      headers: {
        "X-Custom-Header": "value",
      },
    })
  }),
)

projectIt.instance("project and local .repa MCP declarations remain inert", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* writeConfigEffect(test.directory, {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        docs: {
          type: "remote",
          url: "https://docs.example.com/mcp",
          enabled: false,
        },
      },
    })
    yield* FSUtil.use.ensureDir(path.join(test.directory, ".repa"))
    yield* writeConfigEffect(
      path.join(test.directory, ".repa"),
      {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          docs: {
            type: "remote",
            url: "https://docs.example.com/mcp",
            enabled: true,
          },
        },
      },
      "repa.json",
    )

    const config = yield* Config.use.get()
    expect(config.mcp).toBeUndefined()
  }),
)

const remoteProjectOverride = wellKnown({
  config: {
    mcp: { jira: { type: "remote", url: "https://jira.example.com/mcp", enabled: false } },
  },
})

remoteProjectOverride.it.instance(
  "project and delegated MCP declarations both remain inert",
  () =>
    Effect.gen(function* () {
      const config = yield* Config.use.get()
      expect(remoteProjectOverride.seen.wellKnown).toBe("https://example.com/.well-known/opencode")
      expect(config.mcp).toBeUndefined()
    }),
  {
    git: true,
    init: (directory) =>
      writeConfigEffect(directory, {
        mcp: { jira: { type: "remote", url: "https://jira.example.com/mcp", enabled: true } },
      }),
  },
)

const trailingSlashWellKnown = wellKnown({
  authUrl: "https://example.com/",
  config: {
    mcp: { slack: { type: "remote", url: "https://slack.example.com/mcp", enabled: true } },
  },
})

trailingSlashWellKnown.it.instance("wellknown URL with trailing slash is normalized", () =>
  Effect.gen(function* () {
    yield* Config.use.get()
    expect(trailingSlashWellKnown.seen.wellKnown).toBe("https://example.com/.well-known/opencode")
  }),
)

test("remote well-known config can use FetchHttpClient layer", async () => {
  let fetchedUrl: string | undefined
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      fetchedUrl = request.url
      return new Response(
        JSON.stringify({
          config: {
            provider: { [new URL(request.url).origin]: { name: "delegated provider" } },
            mcp: { jira: { type: "remote", url: "https://jira.example.com/mcp", enabled: true } },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    },
  })

  try {
    await provideTmpdirInstance(
      () =>
        Config.Service.use((svc) =>
          Effect.gen(function* () {
            const config = yield* svc.get()
            expect(fetchedUrl).toBe(`${server.url.origin}/.well-known/opencode`)
            expect(config.provider?.[server.url.origin]?.name).toBe("delegated provider")
            expect(config.mcp).toBeUndefined()
          }),
        ),
      { git: true },
    ).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(
          LayerNode.compile(LayerNode.group([Config.node, FSUtil.node, CrossSpawnSpawner.node]), [
            [Auth.node, wellKnownAuth(server.url.origin)],
            [Account.node, AccountTest.empty],
            [Npm.node, NpmTest.noop],
            [httpClient, FetchHttpClient.layer],
          ]),
          testInstanceStoreLayer,
        ),
      ),
      Effect.runPromise,
    )
  } finally {
    await server.stop(true)
  }
})

const templatedHeaderWellKnown = wellKnown({
  remoteConfig: {
    url: "https://config.example.com/repa.json",
    headers: { Authorization: "Bearer {env:TEST_TOKEN}" },
  },
  remote: {
    provider: { "https://example.com": { name: "delegated provider" } },
    mcp: { confluence: { type: "remote", url: "https://confluence.example.com/mcp", enabled: true } },
  },
})

templatedHeaderWellKnown.it.instance("wellknown remote_config supports templated env vars in headers", () =>
  Effect.gen(function* () {
    const config = yield* Config.use.get()
    expect(templatedHeaderWellKnown.seen.wellKnown).toBe("https://example.com/.well-known/opencode")
    expect(templatedHeaderWellKnown.seen.remote).toBe("https://config.example.com/repa.json")
    expect(templatedHeaderWellKnown.seen.authorization).toBe("Bearer test-token")
    expect(config.provider?.["https://example.com"]?.name).toBe("delegated provider")
    expect(config.mcp).toBeUndefined()
  }),
)

const remotePrecedenceWellKnown = wellKnown({
  config: {
    provider: { "https://example.com": { name: "embedded", options: { base: "kept" } } },
    mcp: { confluence: { type: "remote", url: "https://confluence.example.com/mcp", enabled: false } },
  },
  remoteConfig: { url: "https://config.example.com/{env:TEST_TOKEN}/repa.json" },
  remote: {
    config: {
      provider: { "https://example.com": { name: "remote", options: { selected: "remote" } } },
      mcp: { confluence: { type: "remote", url: "https://confluence.example.com/mcp", enabled: true } },
    },
  },
})

remotePrecedenceWellKnown.it.instance(
  "wellknown remote_config url tokens and nested config override embedded config",
  () =>
    Effect.gen(function* () {
      const config = yield* Config.use.get()
      expect(remotePrecedenceWellKnown.seen.remote).toBe("https://config.example.com/test-token/repa.json")
      expect(config.provider?.["https://example.com"]).toMatchObject({
        name: "remote",
        options: { base: "kept", selected: "remote" },
      })
      expect(config.mcp).toBeUndefined()
    }),
)

const envIsolationWellKnown = wellKnown({
  remoteConfig: {
    url: "https://config.example.com/repa.json",
    headers: { Authorization: "Bearer {env:TEST_TOKEN}" },
  },
  remote: {
    mcp: { confluence: { type: "remote", url: "https://confluence.example.com/mcp", enabled: true } },
  },
})

envIsolationWellKnown.it.instance(
  "wellknown token env substitution does not mutate process env",
  () =>
    Effect.gen(function* () {
      process.env.TEST_TOKEN = "preexisting-token"
      const config = yield* Config.use.get()
      expect(envIsolationWellKnown.seen.authorization).toBe("Bearer test-token")
      expect(config.username).not.toBe("test-token")
      expect(process.env.TEST_TOKEN).toBe("preexisting-token")
    }),
  { git: true, config: { username: "{env:TEST_TOKEN}" } },
)

const nullConfigWellKnown = wellKnown({
  wellKnown: {
    config: null,
    remote_config: { url: "https://config.example.com/repa.json" },
  },
  remote: {
    provider: { "https://example.com": { name: "remote-only" } },
    mcp: { confluence: { type: "remote", url: "https://confluence.example.com/mcp", enabled: true } },
  },
})

nullConfigWellKnown.it.instance("wellknown config null is treated as absent", () =>
  Effect.gen(function* () {
    const config = yield* Config.use.get()
    expect(nullConfigWellKnown.seen.remote).toBe("https://config.example.com/repa.json")
    expect(config.provider?.["https://example.com"]?.name).toBe("remote-only")
    expect(config.mcp).toBeUndefined()
  }),
)

const invalidRemoteWellKnown = wellKnown({
  remoteConfig: { url: "https://config.example.com/repa.json" },
  remote: "not an object",
})

invalidRemoteWellKnown.it.instance("wellknown remote_config rejects non-object config responses", () =>
  Effect.gen(function* () {
    const exit = yield* Config.use.get().pipe(Effect.exit)
    expect(invalidRemoteWellKnown.seen.remote).toBe("https://config.example.com/repa.json")
    expect(Exit.isFailure(exit)).toBe(true)
  }),
)

const loginPageWellKnown = wellKnown({
  remoteConfig: { url: "https://config.example.com/repa.json" },
  remoteHtml: "<!DOCTYPE html><html><head><title>Sign in</title></head><body>Login required</body></html>",
})

loginPageWellKnown.it.instance(
  "wellknown remote_config surfaces an actionable auth error when the gateway returns an HTML login page",
  () =>
    Effect.gen(function* () {
      const exit = yield* Config.use.get().pipe(Effect.exit)
      expect(loginPageWellKnown.seen.remote).toBe("https://config.example.com/repa.json")
      expect(Exit.isFailure(exit)).toBe(true)
      const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
      expect(NamedError.hasName(error, "ConfigRemoteAuthError")).toBe(true)
      expect((error as { data?: { url?: string } }).data?.url).toBe("https://example.com")
    }),
)

describe("resolvePluginSpec", () => {
  test("keeps package specs unchanged", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "repa.json")
    expect(await ConfigPlugin.resolvePluginSpec("oh-my-opencode@2.4.3", file)).toBe("oh-my-opencode@2.4.3")
    expect(await ConfigPlugin.resolvePluginSpec("@scope/pkg", file)).toBe("@scope/pkg")
  })

  test("resolves windows-style relative plugin directory specs", async () => {
    if (process.platform !== "win32") return

    await using tmp = await tmpdir({
      init: async (dir) => {
        const plugin = path.join(dir, "plugin")
        await fs.mkdir(plugin, { recursive: true })
        await Filesystem.write(path.join(plugin, "index.ts"), "export default {}")
      },
    })

    const file = path.join(tmp.path, "repa.json")
    const hit = await ConfigPlugin.resolvePluginSpec(".\\plugin", file)
    expect(ConfigPlugin.pluginSpecifier(hit)).toBe(pathToFileURL(path.join(tmp.path, "plugin", "index.ts")).href)
  })

  test("resolves relative file plugin paths to file urls", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Filesystem.write(path.join(dir, "plugin.ts"), "export default {}")
      },
    })

    const file = path.join(tmp.path, "repa.json")
    const hit = await ConfigPlugin.resolvePluginSpec("./plugin.ts", file)
    expect(ConfigPlugin.pluginSpecifier(hit)).toBe(pathToFileURL(path.join(tmp.path, "plugin.ts")).href)
  })

  test("resolves plugin directory paths to directory urls", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const plugin = path.join(dir, "plugin")
        await fs.mkdir(plugin, { recursive: true })
        await Filesystem.writeJson(path.join(plugin, "package.json"), {
          name: "demo-plugin",
          type: "module",
          main: "./index.ts",
        })
        await Filesystem.write(path.join(plugin, "index.ts"), "export default {}")
      },
    })

    const file = path.join(tmp.path, "repa.json")
    const hit = await ConfigPlugin.resolvePluginSpec("./plugin", file)
    expect(ConfigPlugin.pluginSpecifier(hit)).toBe(pathToFileURL(path.join(tmp.path, "plugin")).href)
  })

  test("resolves plugin directories without package.json to index.ts", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const plugin = path.join(dir, "plugin")
        await fs.mkdir(plugin, { recursive: true })
        await Filesystem.write(path.join(plugin, "index.ts"), "export default {}")
      },
    })

    const file = path.join(tmp.path, "repa.json")
    const hit = await ConfigPlugin.resolvePluginSpec("./plugin", file)
    expect(ConfigPlugin.pluginSpecifier(hit)).toBe(pathToFileURL(path.join(tmp.path, "plugin", "index.ts")).href)
  })
})

describe("deduplicatePluginOrigins", () => {
  const dedupe = (plugins: ConfigPluginV1.Spec[]) =>
    ConfigPlugin.deduplicatePluginOrigins(
      plugins.map((spec) => ({
        spec,
        source: "",
        scope: "global" as const,
      })),
    ).map((item) => item.spec)

  test("removes duplicates keeping higher priority (later entries)", () => {
    const plugins = ["global-plugin@1.0.0", "shared-plugin@1.0.0", "local-plugin@2.0.0", "shared-plugin@2.0.0"]

    const result = dedupe(plugins)

    expect(result).toContain("global-plugin@1.0.0")
    expect(result).toContain("local-plugin@2.0.0")
    expect(result).toContain("shared-plugin@2.0.0")
    expect(result).not.toContain("shared-plugin@1.0.0")
    expect(result.length).toBe(3)
  })

  test("keeps path plugins separate from package plugins", () => {
    const plugins = ["oh-my-opencode@2.4.3", "file:///project/.repa/plugin/oh-my-opencode.js"]

    const result = dedupe(plugins)

    expect(result).toEqual(plugins)
  })

  test("deduplicates direct path plugins by exact spec", () => {
    const plugins = ["file:///project/.repa/plugin/demo.ts", "file:///project/.repa/plugin/demo.ts"]

    const result = dedupe(plugins)

    expect(result).toEqual(["file:///project/.repa/plugin/demo.ts"])
  })

  test("preserves order of remaining plugins", () => {
    const plugins = ["a-plugin@1.0.0", "b-plugin@1.0.0", "c-plugin@1.0.0"]

    const result = dedupe(plugins)

    expect(result).toEqual(["a-plugin@1.0.0", "b-plugin@1.0.0", "c-plugin@1.0.0"])
  })

  it.effect("keeps auto-discovered project plugins inert", () =>
    withConfigTree(
      { global: { plugin: ["my-plugin@1.0.0"] } },
      Effect.gen(function* () {
        const test = yield* TestInstance
        yield* FSUtil.use.writeWithDirs(
          path.join(test.directory, ".repa", "plugin", "my-plugin.js"),
          "export default {}",
        )

        const plugins = (yield* Config.use.get()).plugin ?? []
        expect(plugins.some((p) => ConfigPlugin.pluginSpecifier(p) === "my-plugin@1.0.0")).toBe(true)
        expect(plugins.some((p) => ConfigPlugin.pluginSpecifier(p).startsWith("file://"))).toBe(false)
      }),
    ),
  )
})

describe("REPA_DISABLE_PROJECT_CONFIG", () => {
  projectIt.instance(
    "skips project config files when flag is set",
    () =>
      withProcessEnv(
        "REPA_DISABLE_PROJECT_CONFIG",
        "true",
        Effect.gen(function* () {
          const config = yield* Config.use.get()
          expect(config.model).not.toBe("project/model")
          expect(config.username).not.toBe("project-user")
        }),
      ),
    {
      init: (directory) => writeConfigEffect(directory, { model: "project/model", username: "project-user" }),
    },
  )

  projectIt.instance("skips project .repa/ directories when flag is set", () =>
    withProcessEnv(
      "REPA_DISABLE_PROJECT_CONFIG",
      "true",
      Effect.gen(function* () {
        const test = yield* TestInstance
        yield* FSUtil.use.writeWithDirs(
          path.join(test.directory, ".repa", "command", "test-cmd.md"),
          "# Test Command\nThis is a test command.",
        )
        const directories = yield* Config.use.directories()
        expect(directories.some((d) => d.startsWith(test.directory))).toBe(false)
      }),
    ),
  )

  it.instance("still loads global config when flag is set", () =>
    withProcessEnv(
      "REPA_DISABLE_PROJECT_CONFIG",
      "true",
      Effect.gen(function* () {
        const config = yield* Config.use.get()
        expect(config).toBeDefined()
        expect(config.username).toBeDefined()
      }),
    ),
  )

  projectIt.instance(
    "skips relative instructions with warning when flag is set but no config dir",
    () =>
      withProcessEnvs(
        { REPA_CONFIG_DIR: undefined, REPA_DISABLE_PROJECT_CONFIG: "true" },
        Effect.gen(function* () {
          const test = yield* TestInstance
          yield* FSUtil.use.writeWithDirs(path.join(test.directory, "CUSTOM.md"), "# Custom Instructions")
          // The relative instruction should be skipped without error
          const config = yield* Config.use.get()
          expect(config).toBeDefined()
        }),
      ),
    {
      init: (directory) => writeConfigEffect(directory, { instructions: ["./CUSTOM.md"] }),
    },
  )

  projectIt.instance(
    "REPA_CONFIG_DIR still works when flag is set",
    () =>
      Effect.gen(function* () {
        const configDir = yield* tmpdirScoped({ config: { model: "configdir/model" } })
        yield* withProcessEnvs(
          { REPA_DISABLE_PROJECT_CONFIG: "true", REPA_CONFIG_DIR: configDir },
          Effect.gen(function* () {
            const config = yield* Config.use.get()
            expect(config.model).toBe("configdir/model")
          }),
        )
      }),
    {
      init: (directory) => writeConfigEffect(directory, { model: "project/model" }),
    },
  )
})

// Regression for #28206: malformed REPA_PERMISSION JSON used to crash
// the app on startup with an unhandled SyntaxError. Loading the config with
// an invalid JSON value in this env var should not throw.
describe("REPA_PERMISSION env var", () => {
  it.instance("does not crash when REPA_PERMISSION contains invalid JSON", () =>
    withProcessEnv(
      "REPA_PERMISSION",
      "{invalid",
      Effect.gen(function* () {
        const config = yield* Config.use.get()
        // Regression: load() used to throw before returning anything.
        expect(config).toBeDefined()
      }),
    ),
  )
})

describe("REPA_CONFIG_CONTENT token substitution", () => {
  it.instance("substitutes {env:} tokens in REPA_CONFIG_CONTENT", () =>
    withProcessEnv(
      "TEST_CONFIG_VAR",
      "test_api_key_12345",
      withProcessEnv(
        "REPA_CONFIG_CONTENT",
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          username: "{env:TEST_CONFIG_VAR}",
        }),
        Effect.gen(function* () {
          const config = yield* Config.use.get()
          expect(config.username).toBe("test_api_key_12345")
        }),
      ),
    ),
  )

  it.instance("substitutes {file:} tokens in REPA_CONFIG_CONTENT", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* FSUtil.use.writeWithDirs(path.join(test.directory, "api_key.txt"), "secret_key_from_file")
      yield* withProcessEnv(
        "REPA_CONFIG_CONTENT",
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          username: "{file:./api_key.txt}",
        }),
        Effect.gen(function* () {
          const config = yield* Config.use.get()
          expect(config.username).toBe("secret_key_from_file")
        }),
      )
    }),
  )
})

// parseManagedPlist unit tests — pure function, no OS interaction

test("parseManagedPlist strips MDM metadata keys", async () => {
  const config = ConfigParse.schema(
    ConfigV1.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(
        JSON.stringify({
          PayloadDisplayName: "OpenCode Managed",
          PayloadIdentifier: "ai.repa.managed.test",
          PayloadType: "ai.repa.managed",
          PayloadUUID: "AAAA-BBBB-CCCC",
          PayloadVersion: 1,
          _manualProfile: true,
          model: "mdm/model",
        }),
      ),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.model).toBe("mdm/model")
  // MDM keys must not leak into the parsed config
  expect((config as any).PayloadUUID).toBeUndefined()
  expect((config as any).PayloadType).toBeUndefined()
  expect((config as any)._manualProfile).toBeUndefined()
})

test("parseManagedPlist parses server settings", async () => {
  const config = ConfigParse.schema(
    ConfigV1.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          server: { hostname: "127.0.0.1", mdns: false },
        }),
      ),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.server?.hostname).toBe("127.0.0.1")
  expect(config.server?.mdns).toBe(false)
})

test("parseManagedPlist parses permission rules", async () => {
  const config = ConfigParse.schema(
    ConfigV1.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          permission: {
            "*": "ask",
            bash: { "*": "ask", "rm -rf *": "deny", "curl *": "deny" },
            grep: "allow",
            glob: "allow",
            webfetch: "ask",
            "~/.ssh/*": "deny",
          },
        }),
      ),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.permission?.["*"]).toBe("ask")
  expect(config.permission?.grep).toBe("allow")
  expect(config.permission?.webfetch).toBe("ask")
  expect(config.permission?.["~/.ssh/*"]).toBe("deny")
  const bash = config.permission?.bash as Record<string, string>
  expect(bash?.["rm -rf *"]).toBe("deny")
  expect(bash?.["curl *"]).toBe("deny")
})

test("parseManagedPlist parses enabled_providers", async () => {
  const config = ConfigParse.schema(
    ConfigV1.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          enabled_providers: ["anthropic", "google"],
        }),
      ),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.enabled_providers).toEqual(["anthropic", "google"])
})

test("parseManagedPlist handles empty config", async () => {
  const config = ConfigParse.schema(
    ConfigV1.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(JSON.stringify({ $schema: "https://opencode.ai/config.json" })),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.$schema).toBe("https://opencode.ai/config.json")
})
