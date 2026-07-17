export * as TuiConfig from "./tui"

import path from "path"
import { mergeDeep, unique } from "remeda"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Cause, Context, Effect, Exit, Fiber, Layer } from "effect"
import { ConfigParse } from "@/config/parse"
import * as ConfigPaths from "@/config/paths"
import { migrateTuiConfig } from "./tui-migrate"
import { resolveHostAttentionSoundPaths } from "./tui-host-attention"
import { Flag } from "@opencode-ai/core/flag/flag"
import { isRecord } from "@opencode-ai/tui/util/record"
import { Global } from "@opencode-ai/core/global"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { CurrentWorkingDirectory } from "./tui-cwd"
import { ConfigPlugin } from "@/config/plugin"
import { ConfigProjectLayer } from "./project-layer"
import { TuiKeybind } from "@opencode-ai/tui/config/keybind"
import { InstallationLocal, InstallationVersion } from "@opencode-ai/core/installation/version"
import { makeRuntime } from "@opencode-ai/core/effect/runtime"
import { ConfigVariable } from "@/config/variable"
import { Npm } from "@opencode-ai/core/npm"
import { FormatError, FormatUnknownError } from "@/cli/error"
import { ContentRootNTFS } from "@opencode-ai/core/content-root/ntfs"
import { TuiConfig } from "@opencode-ai/tui/config"

const PROJECT_TUI_MAX_BYTES = 1024 * 1024

export const Info = TuiConfig.Info
export type Info = TuiConfig.Info

type Acc = {
  result: Info
  plugin_origins: ConfigPlugin.Origin[]
}

export type Resolved = TuiConfig.Resolved

export type HostMetadata = {
  diagnostics?: ConfigProjectLayer.Diagnostic[]
  plugin_origins?: ConfigPlugin.Origin[]
}

export interface Interface {
  readonly get: () => Effect.Effect<Resolved>
  readonly pluginOrigins: () => Effect.Effect<ConfigPlugin.Origin[]>
  readonly originDiagnostics: () => Effect.Effect<ConfigProjectLayer.Diagnostic[]>
  readonly waitForDependencies: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TuiConfig") {}

function normalize(raw: Record<string, unknown>) {
  const data = { ...raw }
  if (!("tui" in data)) return data
  if (!isRecord(data.tui)) {
    delete data.tui
    return data
  }

  const tui = data.tui
  delete data.tui
  return {
    ...tui,
    ...data,
  }
}

function dropUnknownKeybinds(input: Record<string, unknown>) {
  if (!isRecord(input.keybinds)) return input

  const invalid = TuiKeybind.unknownKeys(input.keybinds)
  if (!invalid.length) return input

  return {
    ...input,
    keybinds: Object.fromEntries(Object.entries(input.keybinds).filter(([key]) => !invalid.includes(key))),
  }
}

const loadState = Effect.fn("TuiConfig.loadState")(function* (ctx: { directory: string }) {
  const afs = yield* FSUtil.Service
  let appliedOrder = 0

  const resolvePlugins = (config: Info, configFilepath: string): Effect.Effect<Info> =>
    Effect.gen(function* () {
      const plugins = config.plugin
      if (!plugins) return config
      return {
        ...config,
        plugin: yield* Effect.forEach(plugins, (plugin) =>
          Effect.promise(() => ConfigPlugin.resolvePluginSpec(plugin as ConfigPlugin.Origin["spec"], configFilepath)),
        ),
      }
    })

  const load = (text: string, configFilepath: string): Effect.Effect<Info> =>
    Effect.gen(function* () {
      const expanded = yield* Effect.promise(() =>
        ConfigVariable.substitute({ text, type: "path", path: configFilepath, missing: "empty" }),
      )
      const data = ConfigParse.jsonc(expanded, configFilepath)
      if (!isRecord(data)) return {} as Info
      // Flatten a nested "tui" key so users who wrote `{ "tui": { ... } }` inside tui.json
      // (mirroring the main repa.json shape) still get their settings applied.
      const normalized = dropUnknownKeybinds(normalize(data))
      const parsed = ConfigParse.schema(Info, normalized, configFilepath)
      const validated = parsed.attention?.sounds
        ? {
            ...parsed,
            attention: {
              ...parsed.attention,
              sounds: resolveHostAttentionSoundPaths(path.dirname(configFilepath), parsed.attention.sounds),
            },
          }
        : parsed
      return yield* resolvePlugins(validated, configFilepath)
    }).pipe(
      // catchCause (not tapErrorCause + orElseSucceed) because JSONC parsing and validation
      // can sync-throw — those become defects, which orElseSucceed wouldn't catch.
      Effect.catchCause((cause) =>
        Effect.logWarning("skipping invalid tui config", {
          path: configFilepath,
          reason: FormatError(Cause.squash(cause)) ?? FormatUnknownError(Cause.squash(cause)),
        }).pipe(Effect.as({} as Info)),
      ),
    )

  const loadFile = (filepath: string): Effect.Effect<Info> =>
    Effect.gen(function* () {
      // Silent-swallow non-NotFound read errors (perms, EISDIR, IO) → log + skip.
      // Matches how parse/schema/plugin failures in load() are handled — every
      // broken-config path degrades gracefully rather than crashing TUI startup.
      const text = yield* afs.readFileStringSafe(filepath).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("failed to read tui config", {
            path: filepath,
            reason: FormatError(Cause.squash(cause)) ?? FormatUnknownError(Cause.squash(cause)),
          }).pipe(Effect.as(undefined)),
        ),
      )
      if (!text) return {} as Info
      yield* Effect.logInfo("loading tui config", { path: filepath })
      return yield* load(text, filepath)
    })

  const diagnoseProjectFile = Effect.fnUntraced(function* (filepath: string, embedded = false) {
    const read = yield* Effect.tryPromise({
      try: () => ContentRootNTFS.readAbsoluteFile(filepath, PROJECT_TUI_MAX_BYTES),
      catch: (cause) => cause,
    }).pipe(Effect.exit)
    if (Exit.isFailure(read)) return ConfigProjectLayer.sourceRejected("tui", filepath).diagnostics
    const decoded = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(read.value),
      catch: () => undefined,
    })
    if (!decoded) return ConfigProjectLayer.sourceRejected("tui", filepath).diagnostics
    const text = decoded
    const parsed = yield* Effect.sync(() => ConfigParse.jsonc(text, filepath)).pipe(
      Effect.catchCause(() => Effect.succeed(undefined)),
    )
    const value = (() => {
      if (!embedded || !isRecord(parsed)) return parsed
      const nested = isRecord(parsed.tui) ? parsed.tui : {}
      return {
        ...nested,
        ...("theme" in parsed ? { theme: parsed.theme } : {}),
        ...("keybinds" in parsed ? { keybinds: parsed.keybinds } : {}),
      }
    })()
    const diagnostics = ConfigProjectLayer.compileTui(value, filepath).diagnostics
    if (ConfigProjectLayer.containsSubstitution(text)) {
      diagnostics.unshift(...ConfigProjectLayer.substitutionRejected(filepath, "tui").diagnostics)
    }
    return diagnostics
  })

  const mergeFile = (acc: Acc, file: string) =>
    Effect.gen(function* () {
      const data = yield* loadFile(file)
      if (Object.keys(data).length) {
        appliedOrder += 1
        yield* Effect.logInfo("applying tui config", { path: file, order: appliedOrder })
      }
      acc.result = mergeDeep(acc.result, data)
      if (!data.plugin?.length) return

      const plugins = ConfigPlugin.deduplicatePluginOrigins([
        ...acc.plugin_origins,
        ...data.plugin.map((spec) => ({ spec: spec as ConfigPlugin.Origin["spec"], scope: "global" as const, source: file })),
      ])
      acc.result = {
        ...acc.result,
        plugin: plugins.map((item) => item.spec),
      }
      acc.plugin_origins = plugins
    })

  // Every config dir we may read from: global config dir, any `.repa`
  // folder under the machine home, and REPA_CONFIG_DIR.
  const directories = yield* ConfigPaths.directories(ctx.directory)
  yield* Effect.promise(() => migrateTuiConfig({ directories }))

  const diagnostics: ConfigProjectLayer.Diagnostic[] = []
  if (!Flag.REPA_DISABLE_PROJECT_CONFIG) {
    for (const file of yield* ConfigPaths.files("tui", ctx.directory)) {
      diagnostics.push(...(yield* diagnoseProjectFile(file)))
    }
    for (const file of yield* ConfigPaths.files("repa", ctx.directory)) {
      diagnostics.push(...(yield* diagnoseProjectFile(file, true)))
    }
    for (const dir of yield* ConfigPaths.projectDirectories(ctx.directory)) {
      diagnostics.push(ConfigProjectLayer.quarantinedDirectory(dir))
      for (const file of ConfigPaths.fileInDirectory(dir, "tui")) {
        if (!(yield* afs.existsSafe(file))) continue
        diagnostics.push(...(yield* diagnoseProjectFile(file)))
      }
      for (const file of ConfigPaths.fileInDirectory(dir, "repa")) {
        if (!(yield* afs.existsSafe(file))) continue
        diagnostics.push(...(yield* diagnoseProjectFile(file, true)))
      }
    }
  }

  const acc: Acc = {
    result: {},
    plugin_origins: [],
  }

  // 1. Global tui config (lowest precedence).
  for (const file of ConfigPaths.fileInDirectory(Global.Path.config, "tui")) {
    yield* mergeFile(acc, file)
  }

  // 2. Explicit REPA_TUI_CONFIG override, if set.
  if (Flag.REPA_TUI_CONFIG) {
    const configFile = Flag.REPA_TUI_CONFIG
    yield* mergeFile(acc, configFile)
    yield* Effect.logDebug("loaded custom tui config", { path: configFile })
  }

  // 3. Machine-global `.repa` directories and explicit REPA_CONFIG_DIR.
  const dirs = unique(directories).filter((dir) => dir.endsWith(".repa") || dir === Flag.REPA_CONFIG_DIR)

  for (const dir of dirs) {
    if (!dir.endsWith(".repa") && dir !== Flag.REPA_CONFIG_DIR) continue
    for (const file of ConfigPaths.fileInDirectory(dir, "tui")) {
      yield* mergeFile(acc, file)
    }
  }

  const result = TuiConfig.resolve(
    {
      ...acc.result,
    },
    {
      terminalSuspend: process.platform !== "win32",
    },
  )

  return {
    config: result,
    diagnostics: ConfigProjectLayer.withEffectiveState(diagnostics, {}, result as Record<string, unknown>),
    pluginOrigins: acc.plugin_origins,
    dirs: result.plugin?.length ? dirs : [],
  }
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const directory = yield* CurrentWorkingDirectory
    const npm = yield* Npm.Service
    const data = yield* loadState({ directory })
    const deps = yield* Effect.forEach(
      data.dirs,
      (dir) =>
        npm
          .install(dir, {
            add: [
              {
                name: "@opencode-ai/plugin",
                version: InstallationLocal ? undefined : InstallationVersion,
              },
            ],
          })
          .pipe(Effect.forkScoped),
      {
        concurrency: "unbounded",
      },
    )

    const get = Effect.fn("TuiConfig.get")(() => Effect.succeed(data.config))
    const pluginOrigins = Effect.fn("TuiConfig.pluginOrigins")(() => Effect.succeed(data.pluginOrigins))
    const originDiagnostics = Effect.fn("TuiConfig.originDiagnostics")(() => Effect.succeed(data.diagnostics))

    const waitForDependencies = Effect.fn("TuiConfig.waitForDependencies")(() =>
      Effect.forEach(deps, Fiber.join, { concurrency: "unbounded" }).pipe(Effect.ignore(), Effect.asVoid),
    )
    return Service.of({ get, pluginOrigins, originDiagnostics, waitForDependencies })
  }).pipe(Effect.withSpan("TuiConfig.layer")),
)

export const node = LayerNode.make({ service: Service, layer, deps: [Npm.node, FSUtil.node] })

const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export async function waitForDependencies() {
  await runPromise((svc) => svc.waitForDependencies())
}

export async function get() {
  return runPromise((svc) => svc.get())
}

export async function pluginOrigins() {
  return runPromise((svc) => svc.pluginOrigins())
}

export async function originDiagnostics() {
  return runPromise((svc) => svc.originDiagnostics())
}
