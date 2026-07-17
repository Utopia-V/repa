import { expect } from "bun:test"
import path from "path"
import { pathToFileURL } from "url"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { Config } from "@/config/config"
import { ConfigPlugin } from "@/config/plugin"
import { CurrentWorkingDirectory } from "@/config/tui-cwd"
import { TuiConfig } from "../../src/config/tui"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const projectIt = testEffect(LayerNode.compile(LayerNode.group([Config.node, FSUtil.node])))
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
const winIt = process.platform === "win32" ? projectIt.instance : projectIt.instance.skip

const globalConfigFiles = () =>
  ["repa.json", "repa.jsonc", "tui.json", "tui.jsonc"].map((file) => path.join(Global.Path.config, file))

const cleanState = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  delete process.env.REPA_CONFIG
  delete process.env.REPA_TUI_CONFIG
  yield* Effect.forEach(globalConfigFiles(), (file) => fs.remove(file, { force: true }).pipe(Effect.ignore), {
    discard: true,
  })
})

const withCleanState = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    cleanState,
    () => self,
    () => cleanState,
  )

const withEnv = <A, E, R>(name: string, value: string | undefined, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env[name]
        else process.env[name] = previous
      }),
  )

const withPlatform = <A, E, R>(platform: typeof process.platform, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const original = Object.getOwnPropertyDescriptor(process, "platform")
      Object.defineProperty(process, "platform", {
        ...original,
        value: platform,
      })
      return original
    }),
    () => self,
    (original) =>
      Effect.sync(() => {
        if (original) Object.defineProperty(process, "platform", original)
      }),
  )

const getTuiConfig = (directory: string) =>
  TuiConfig.Service.use((svc) => svc.get()).pipe(
    Effect.provide(
      AppNodeBuilder.build(TuiConfig.node).pipe(Layer.provide(Layer.succeed(CurrentWorkingDirectory, directory))),
    ),
  )

const getTuiPluginOrigins = (directory: string) =>
  TuiConfig.Service.use((svc) => svc.pluginOrigins()).pipe(
    Effect.provide(
      AppNodeBuilder.build(TuiConfig.node).pipe(Layer.provide(Layer.succeed(CurrentWorkingDirectory, directory))),
    ),
  )

const withGlobalConfigDir = <A, E, R>(directory: string, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = Global.Path.config
      ;(Global.Path as { config: string }).config = directory
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        ;(Global.Path as { config: string }).config = previous
      }),
  )

const getTuiDiagnostics = (directory: string) =>
  TuiConfig.Service.use((svc) => svc.originDiagnostics()).pipe(
    Effect.provide(
      AppNodeBuilder.build(TuiConfig.node).pipe(Layer.provide(Layer.succeed(CurrentWorkingDirectory, directory))),
    ),
  )

winIt("keeps every automatically discovered project TUI value inert without migration", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const projectTui = {
        $schema: "project-schema",
        theme: "project-theme",
        keybinds: { messages_undo: "<leader>u" },
        plugin: ["project-plugin"],
        plugin_enabled: { project: true },
        leader_timeout: 10_000,
        attention: { enabled: true, notifications: true, sound: true },
        prompt: { submit: "enter" },
        scroll_speed: 9,
        scroll_acceleration: { enabled: true },
        diff_style: "stacked",
        mouse: true,
      }
      yield* fs.writeJson(path.join(Global.Path.config, "tui.json"), {
        theme: "machine-theme",
        leader_timeout: 2_000,
        mouse: false,
      })
      yield* fs.writeJson(path.join(test.directory, "tui.json"), projectTui)
      yield* fs.writeJson(path.join(test.directory, "repa.json"), {
        theme: "legacy-project-theme",
        keybinds: { messages_undo: "<leader>x" },
        tui: projectTui,
      })
      yield* fs.writeWithDirs(path.join(test.directory, ".repa", "tui.json"), JSON.stringify(projectTui))

      const config = yield* getTuiConfig(test.directory)
      const diagnostics = yield* getTuiDiagnostics(test.directory)

      expect(config.theme).toBe("machine-theme")
      expect(config.leader_timeout).toBe(2_000)
      expect(config.mouse).toBe(false)
      expect(config.plugin).toBeUndefined()
      expect(config.keybinds.get("messages.undo")?.[0]?.key).not.toBe("<leader>u")
      expect(diagnostics.filter((item) => item.channel === "tui").some((item) => item.path === "mouse")).toBe(true)
      expect(diagnostics.filter((item) => item.channel === "tui").some((item) => item.path === "leader_timeout")).toBe(
        true,
      )
      expect(diagnostics.filter((item) => item.channel === "tui").every((item) => !item.denyApplied)).toBe(true)
      expect(yield* fs.existsSafe(path.join(test.directory, "tui.json.tui-migration.bak"))).toBe(false)
      expect(yield* fs.existsSafe(path.join(test.directory, "repa.json.tui-migration.bak"))).toBe(false)
      expect(JSON.parse(yield* fs.readFileString(path.join(test.directory, "repa.json")))).toHaveProperty(
        "theme",
        "legacy-project-theme",
      )
    }),
  ),
)

projectIt.instance("keeps server and tui project-plugin quarantine aligned", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const local = path.join(test.directory, ".repa")
      yield* fs.makeDirectory(local, { recursive: true })

      yield* fs.writeJson(path.join(Global.Path.config, "repa.json"), {
        plugin: [["shared-plugin@1.0.0", { source: "global" }], "global-only@1.0.0"],
      })
      yield* fs.writeJson(path.join(Global.Path.config, "tui.json"), {
        plugin: [["shared-plugin@1.0.0", { source: "global" }], "global-only@1.0.0"],
      })
      yield* fs.writeJson(path.join(local, "repa.json"), {
        plugin: [["shared-plugin@2.0.0", { source: "local" }], "local-only@1.0.0"],
      })
      yield* fs.writeJson(path.join(local, "tui.json"), {
        plugin: [["shared-plugin@2.0.0", { source: "local" }], "local-only@1.0.0"],
      })

      const server = yield* Config.use.get()
      const tui = yield* getTuiConfig(test.directory)
      const tuiOrigins = yield* getTuiPluginOrigins(test.directory)
      const serverPlugins = (server.plugin ?? []).map((item) => ConfigPlugin.pluginSpecifier(item))
      const tuiPlugins = (tui.plugin ?? []).map((item) => ConfigPlugin.pluginSpecifier(item))

      expect(serverPlugins).toEqual(tuiPlugins)
      expect(serverPlugins).not.toContain("shared-plugin@2.0.0")
      expect(serverPlugins).toContain("shared-plugin@1.0.0")

      const serverOrigins = server.plugin_origins ?? []
      expect(serverOrigins.map((item) => ConfigPlugin.pluginSpecifier(item.spec))).toEqual(serverPlugins)
      expect(tuiOrigins.map((item) => ConfigPlugin.pluginSpecifier(item.spec))).toEqual(tuiPlugins)
      expect(serverOrigins.map((item) => item.scope)).toEqual(tuiOrigins.map((item) => item.scope))
    }),
  ),
)

projectIt.instance("keeps project TUI files below the machine-owned config boundary", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(Global.Path.config, "tui.json"), { theme: "global" })
      yield* fs.writeJson(path.join(test.directory, "tui.json"), { theme: "project" })
      yield* fs.writeWithDirs(
        path.join(test.directory, ".repa", "tui.json"),
        JSON.stringify({ theme: "local", diff_style: "stacked" }, null, 2),
      )

      const config = yield* getTuiConfig(test.directory)
      expect(config.theme).toBe("global")
      expect(config.diff_style).toBeUndefined()
    }),
  ),
)

it.instance("resolves attention config defaults and overrides", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance

      expect((yield* getTuiConfig(test.directory)).attention).toEqual({
        enabled: false,
        notifications: true,
        sound: true,
        volume: 0.4,
        sound_pack: "repa.default",
        sounds: {},
      })

      yield* fs.writeJson(path.join(test.directory, "tui.json"), {
        attention: {
          enabled: false,
          notifications: false,
          sound: false,
          volume: 0.7,
          sound_pack: "acme.soft",
          sounds: {
            default: path.join(test.directory, "default.mp3"),
            question: pathToFileURL(path.join(test.directory, "question.mp3")).href,
            error: "./error.mp3",
            subagent_done: "./subagent-done.mp3",
          },
        },
      })

      expect((yield* getTuiConfig(test.directory)).attention).toEqual({
        enabled: false,
        notifications: false,
        sound: false,
        volume: 0.7,
        sound_pack: "acme.soft",
        sounds: {
          default: path.join(test.directory, "default.mp3"),
          question: path.join(test.directory, "question.mp3"),
          error: path.join(test.directory, "error.mp3"),
          subagent_done: path.join(test.directory, "subagent-done.mp3"),
        },
      })
    }),
  ),
)

it.instance("migrates tui-specific keys from repa.json when tui.json does not exist", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const source = path.join(test.directory, "repa.json")
      yield* fs.writeJson(source, {
        theme: "migrated-theme",
        tui: { scroll_speed: 5 },
        keybinds: { app_exit: "ctrl+q" },
      })

      const config = yield* getTuiConfig(test.directory)
      expect(config.theme).toBe("migrated-theme")
      expect(config.scroll_speed).toBe(5)
      expect(config.keybinds.get("app.exit")?.[0]?.key).toBe("ctrl+q")
      expect(JSON.parse(yield* fs.readFileString(path.join(test.directory, "tui.json")))).toMatchObject({
        theme: "migrated-theme",
        scroll_speed: 5,
      })
      const server = JSON.parse(yield* fs.readFileString(source))
      expect(server.theme).toBeUndefined()
      expect(server.keybinds).toBeUndefined()
      expect(server.tui).toBeUndefined()
      expect(yield* fs.existsSafe(path.join(test.directory, "repa.json.tui-migration.bak"))).toBe(true)
      expect(yield* fs.existsSafe(path.join(test.directory, "tui.json"))).toBe(true)
    }),
  ),
)

projectIt.instance("does not migrate project legacy tui keys when global tui config exists", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(Global.Path.config, "tui.json"), { theme: "global" })
      yield* fs.writeJson(path.join(test.directory, "repa.json"), {
        theme: "project-migrated",
        tui: { scroll_speed: 2 },
      })

      const config = yield* getTuiConfig(test.directory)
      expect(config.theme).toBe("global")
      expect(config.scroll_speed).toBeUndefined()
      expect(yield* fs.existsSafe(path.join(test.directory, "tui.json"))).toBe(false)

      const server = JSON.parse(yield* fs.readFileString(path.join(test.directory, "repa.json")))
      expect(server.theme).toBe("project-migrated")
      expect(server.tui).toEqual({ scroll_speed: 2 })
    }),
  ),
)

it.instance("drops unknown legacy tui keys during migration", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(test.directory, "repa.json"), {
        theme: "migrated-theme",
        tui: { scroll_speed: 2, foo: 1 },
      })

      const config = yield* getTuiConfig(test.directory)
      expect(config.theme).toBe("migrated-theme")
      expect(config.scroll_speed).toBe(2)

      const migrated = JSON.parse(yield* fs.readFileString(path.join(test.directory, "tui.json")))
      expect(migrated.scroll_speed).toBe(2)
      expect(migrated.foo).toBeUndefined()
    }),
  ),
)

it.instance("skips migration when repa.jsonc is syntactically invalid", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeFileString(
        path.join(test.directory, "repa.jsonc"),
        `{
  "theme": "broken-theme",
  "tui": { "scroll_speed": 2 }
  "username": "still-broken"
}`,
      )

      const config = yield* getTuiConfig(test.directory)
      expect(config.theme).toBeUndefined()
      expect(config.scroll_speed).toBeUndefined()
      expect(yield* fs.existsSafe(path.join(test.directory, "tui.json"))).toBe(false)
      expect(yield* fs.existsSafe(path.join(test.directory, "repa.jsonc.tui-migration.bak"))).toBe(false)
      const source = yield* fs.readFileString(path.join(test.directory, "repa.jsonc"))
      expect(source).toContain('"theme": "broken-theme"')
      expect(source).toContain('"tui": { "scroll_speed": 2 }')
    }),
  ),
)

it.instance("skips migration when tui.json already exists", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(test.directory, "repa.json"), { theme: "legacy" })
      yield* fs.writeJson(path.join(test.directory, "tui.json"), { diff_style: "stacked" })

      const config = yield* getTuiConfig(test.directory)
      expect(config.diff_style).toBe("stacked")
      expect(config.theme).toBeUndefined()

      const server = JSON.parse(yield* fs.readFileString(path.join(test.directory, "repa.json")))
      expect(server.theme).toBe("legacy")
      expect(yield* fs.existsSafe(path.join(test.directory, "repa.json.tui-migration.bak"))).toBe(false)
    }),
  ),
)

it.instance("continues loading tui config when legacy source cannot be stripped", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const source = path.join(test.directory, "repa.json")
      yield* fs.writeJson(source, { theme: "readonly-theme" })

      yield* Effect.acquireUseRelease(
        fs.chmod(source, 0o444),
        () =>
          Effect.gen(function* () {
            const config = yield* getTuiConfig(test.directory)
            expect(config.theme).toBe("readonly-theme")
            expect(yield* fs.existsSafe(path.join(test.directory, "tui.json"))).toBe(true)

            const server = JSON.parse(yield* fs.readFileString(source))
            expect(server.theme).toBe("readonly-theme")
          }),
        () => fs.chmod(source, 0o644).pipe(Effect.ignore),
      )
    }),
  ),
)

it.instance("migration backup preserves JSONC comments", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeFileString(
        path.join(test.directory, "repa.jsonc"),
        `{
  // top-level comment
  "theme": "jsonc-theme",
  "tui": {
    // nested comment
    "scroll_speed": 1.5
  }
}`,
      )

      yield* getTuiConfig(test.directory)
      const backup = yield* fs.readFileString(path.join(test.directory, "repa.jsonc.tui-migration.bak"))
      expect(backup).toContain("// top-level comment")
      expect(backup).toContain("// nested comment")
      expect(backup).toContain('"theme": "jsonc-theme"')
      expect(backup).toContain('"scroll_speed": 1.5')
    }),
  ),
)

it.instance("migrates machine legacy tui keys without migrating nested project levels", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const nested = path.join(test.directory, "apps", "client")
      yield* fs.makeDirectory(nested, { recursive: true })
      yield* fs.writeJson(path.join(test.directory, "repa.json"), { theme: "root-theme" })
      yield* fs.writeJson(path.join(nested, "repa.json"), { theme: "nested-theme" })

      const config = yield* getTuiConfig(nested)
      expect(config.theme).toBe("root-theme")
      expect(yield* fs.existsSafe(path.join(test.directory, "tui.json"))).toBe(true)
      expect(yield* fs.existsSafe(path.join(nested, "tui.json"))).toBe(false)
    }),
  ),
)

it.instance("flattens nested tui key inside tui.json", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(test.directory, "tui.json"), {
        theme: "outer",
        tui: { scroll_speed: 3, diff_style: "stacked" },
      })

      const config = yield* getTuiConfig(test.directory)
      expect(config.scroll_speed).toBe(3)
      expect(config.diff_style).toBe("stacked")
      expect(config.theme).toBe("outer")
    }),
  ),
)

it.instance("top-level keys in tui.json take precedence over nested tui key", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(test.directory, "tui.json"), {
        diff_style: "auto",
        tui: { diff_style: "stacked", scroll_speed: 2 },
      })

      const config = yield* getTuiConfig(test.directory)
      expect(config.diff_style).toBe("auto")
      expect(config.scroll_speed).toBe(2)
    }),
  ),
)

it.instance("explicit REPA_TUI_CONFIG takes precedence over machine global config", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const custom = path.join(test.directory, "custom-tui.json")
      yield* fs.writeJson(path.join(test.directory, "tui.json"), { theme: "project", diff_style: "auto" })
      yield* fs.writeJson(custom, { theme: "custom", diff_style: "stacked" })

      yield* withEnv(
        "REPA_TUI_CONFIG",
        custom,
        Effect.gen(function* () {
          const config = yield* getTuiConfig(test.directory)
          expect(config.theme).toBe("custom")
          expect(config.diff_style).toBe("stacked")
        }),
      )
    }),
  ),
)

projectIt.instance("does not merge project keybind overrides into machine keybinds", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(Global.Path.config, "tui.json"), { keybinds: { app_exit: "ctrl+q" } })
      yield* fs.writeJson(path.join(test.directory, "tui.json"), { keybinds: { theme_list: "ctrl+k" } })

      const config = yield* getTuiConfig(test.directory)
      expect(config.keybinds.get("app.exit")?.[0]?.key).toBe("ctrl+q")
      expect(config.keybinds.get("theme.switch")?.[0]?.key).not.toBe("ctrl+k")
    }),
  ),
)

it.instance("ignores unknown keybind names without dropping valid overrides from the same file", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(Global.Path.config, "tui.json"), {
        keybinds: {
          session_delete: "ctrl+d",
          not_a_real_keybind: "ctrl+q",
        },
      })

      const config = yield* getTuiConfig(test.directory)
      expect(config.keybinds.get("session.delete")?.[0]?.key).toBe("ctrl+d")
      expect(config.keybinds.get("not_a_real_keybind")).toEqual([])
    }),
  ),
)

it.instance("resolves keybind lookup from canonical keybinds", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(test.directory, "tui.json"), {
        keybinds: {
          leader: { key: { name: "g", ctrl: true } },
          command_list: "alt+p",
          diff_open: "ctrl+j",
          which_key_toggle: "alt+k",
          editor_open: "ctrl+e",
          "prompt.autocomplete.next": "ctrl+j",
          "dialog.prompt.submit": "ctrl+s",
          "dialog.mcp.toggle": "ctrl+t",
          model_favorite_toggle: "ctrl+f",
          "dialog.plugins.install": "shift+i",
        },
        leader_timeout: 1234,
      })

      const config = yield* getTuiConfig(test.directory)
      expect(config.keybinds.get("leader")?.[0]?.key).toEqual({ name: "g", ctrl: true })
      expect(config.leader_timeout).toBe(1234)
      expect(config.keybinds.get("command.palette.show")?.[0]?.key).toBe("alt+p")
      expect(config.keybinds.get("diff.open")?.[0]?.key).toBe("ctrl+j")
      expect(config.keybinds.get("session.new")?.[0]?.key).toBe("<leader>n")
      expect(config.keybinds.get("which-key.toggle")?.[0]?.key).toBe("alt+k")
      expect(config.keybinds.get("which-key.layout.toggle")?.[0]?.key).toBe("ctrl+alt+shift+k")
      expect(config.keybinds.get("which-key.pending.toggle")?.[0]?.key).toBe("ctrl+alt+shift+p")
      expect(config.keybinds.get("which-key.group.next")?.[0]?.key).toBe("ctrl+alt+right,ctrl+alt+]")
      expect((config.keybinds.get("which-key.toggle")?.[0] as { desc?: unknown } | undefined)?.desc).toBe(
        "Toggle which-key panel",
      )
      expect(config.keybinds.get("prompt.editor")?.[0]?.key).toBe("ctrl+e")
      expect(config.keybinds.get("prompt.autocomplete.next")?.[0]?.key).toBe("ctrl+j")
      expect(config.keybinds.get("dialog.prompt.submit")?.[0]?.key).toBe("ctrl+s")
      expect(config.keybinds.get("dialog.mcp.toggle")?.[0]?.key).toBe("ctrl+t")
      expect(config.keybinds.get("model.dialog.favorite")?.[0]?.key).toBe("ctrl+f")
      expect(config.keybinds.get("dialog.plugins.install")?.[0]?.key).toBe("shift+i")
      expect(
        config.keybinds.gather("plugins.dialog", ["dialog.plugins.install"]).map((binding) => binding.cmd),
      ).toEqual(["dialog.plugins.install"])
    }),
  ),
)

it.instance("keybinds accept OpenTUI binding specs", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(test.directory, "tui.json"), {
        keybinds: {
          command_list: [{ key: "alt+p", preventDefault: false }],
          editor_open: { key: { name: "e", ctrl: true }, group: "Explicit" },
          "prompt.autocomplete.next": false,
          plugin_manager: "ctrl+shift+p",
        },
      })

      const config = yield* getTuiConfig(test.directory)
      expect(config.keybinds.get("command.palette.show")).toEqual([
        { key: "alt+p", cmd: "command.palette.show", preventDefault: false, desc: "List available commands" },
      ])
      expect(config.keybinds.get("prompt.editor")?.[0]).toMatchObject({
        key: { name: "e", ctrl: true },
        cmd: "prompt.editor",
        group: "Explicit",
      })
      expect(config.keybinds.get("prompt.autocomplete.next")).toEqual([])
      expect(config.keybinds.get("plugins.list")?.[0]?.key).toBe("ctrl+shift+p")
    }),
  ),
)

winIt("defaults Ctrl+Z to input undo on Windows", () =>
  withCleanState(
    Effect.gen(function* () {
      const test = yield* TestInstance
      const config = yield* getTuiConfig(test.directory)
      expect(config.keybinds.get("terminal.suspend")).toEqual([])
      expect(config.keybinds.get("input.undo")?.[0]?.key).toBe("ctrl+z,ctrl+-,super+z")
    }),
  ),
)

winIt("keeps project input undo overrides inert on Windows", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(test.directory, "tui.json"), { keybinds: { input_undo: "ctrl+y" } })

      const config = yield* getTuiConfig(test.directory)
      expect(config.keybinds.get("terminal.suspend")).toEqual([])
      expect(config.keybinds.get("input.undo")?.[0]?.key).toBe("ctrl+z,ctrl+-,super+z")
    }),
  ),
)

winIt("ignores terminal suspend bindings on Windows", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(test.directory, "tui.json"), { keybinds: { terminal_suspend: "alt+z" } })

      const config = yield* getTuiConfig(test.directory)
      expect(config.keybinds.get("terminal.suspend")).toEqual([])
      expect(config.keybinds.get("input.undo")?.[0]?.key).toBe("ctrl+z,ctrl+-,super+z")
    }),
  ),
)

it.instance("applies Windows keybind defaults", () =>
  withCleanState(
    withPlatform(
      "win32",
      Effect.gen(function* () {
        const test = yield* TestInstance
        const config = yield* getTuiConfig(test.directory)
        expect(config.keybinds.get("terminal.suspend")).toEqual([])
        expect(config.keybinds.get("input.undo")?.[0]?.key).toBe("ctrl+z,ctrl+-,super+z")
      }),
    ),
  ),
)

it.instance("ignores explicit keybind terminal suspend binding on Windows", () =>
  withCleanState(
    withPlatform(
      "win32",
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const test = yield* TestInstance
        yield* fs.writeJson(path.join(test.directory, "tui.json"), {
          keybinds: {
            terminal_suspend: "alt+z",
          },
        })

        const config = yield* getTuiConfig(test.directory)
        expect(config.keybinds.get("terminal.suspend")).toEqual([])
      }),
    ),
  ),
)

it.instance("keeps explicit configured keybind input undo on Windows", () =>
  withCleanState(
    withPlatform(
      "win32",
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const test = yield* TestInstance
        yield* fs.writeJson(path.join(test.directory, "tui.json"), {
          keybinds: {
            input_undo: "ctrl+y",
          },
        })

        const config = yield* getTuiConfig(test.directory)
        expect(config.keybinds.get("input.undo")?.[0]?.key).toBe("ctrl+y")
      }),
    ),
  ),
)

it.instance("REPA_TUI_CONFIG provides settings when no project config exists", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const custom = path.join(test.directory, "custom-tui.json")
      yield* fs.writeJson(custom, { theme: "from-env", diff_style: "stacked" })

      yield* withEnv(
        "REPA_TUI_CONFIG",
        custom,
        Effect.gen(function* () {
          const config = yield* getTuiConfig(test.directory)
          expect(config.theme).toBe("from-env")
          expect(config.diff_style).toBe("stacked")
        }),
      )
    }),
  ),
)

it.instance("does not derive tui path from REPA_CONFIG", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const customDir = path.join(test.directory, "custom")
      yield* fs.makeDirectory(customDir, { recursive: true })
      yield* fs.writeJson(path.join(customDir, "repa.json"), { model: "test/model" })
      yield* fs.writeJson(path.join(customDir, "tui.json"), { theme: "should-not-load" })

      yield* withEnv(
        "REPA_CONFIG",
        path.join(customDir, "repa.json"),
        Effect.gen(function* () {
          const config = yield* getTuiConfig(test.directory)
          expect(config.theme).toBeUndefined()
        }),
      )
    }),
  ),
)

it.instance("applies env and file substitutions in tui.json", () =>
  withCleanState(
    withEnv(
      "TUI_THEME_TEST",
      "env-theme",
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const test = yield* TestInstance
        yield* fs.writeFileString(path.join(test.directory, "keybind.txt"), "ctrl+q")
        yield* fs.writeJson(path.join(test.directory, "tui.json"), {
          theme: "{env:TUI_THEME_TEST}",
          keybinds: { app_exit: "{file:keybind.txt}" },
        })

        const config = yield* getTuiConfig(test.directory)
        expect(config.theme).toBe("env-theme")
        expect(config.keybinds.get("app.exit")?.[0]?.key).toBe("ctrl+q")
      }),
    ),
  ),
)

it.instance("applies file substitutions when first identical token is in a commented line", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeFileString(path.join(test.directory, "theme.txt"), "resolved-theme")
      yield* fs.writeFileString(
        path.join(test.directory, "tui.jsonc"),
        `{
  // "theme": "{file:theme.txt}",
  "theme": "{file:theme.txt}"
}`,
      )

      const config = yield* getTuiConfig(test.directory)
      expect(config.theme).toBe("resolved-theme")
    }),
  ),
)

projectIt.instance("keeps project .repa/tui.json inert", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeWithDirs(
        path.join(test.directory, ".repa", "tui.json"),
        JSON.stringify({ diff_style: "stacked" }, null, 2),
      )

      const config = yield* getTuiConfig(test.directory)
      expect(config.diff_style).toBeUndefined()
    }),
  ),
)

it.instance("supports tuple plugin specs with options in tui.json", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(test.directory, "tui.json"), {
        plugin: [["acme-plugin@1.2.3", { enabled: true, label: "demo" }]],
      })

      const config = yield* getTuiConfig(test.directory)
      const origins = yield* getTuiPluginOrigins(test.directory)
      expect(config.plugin).toEqual([["acme-plugin@1.2.3", { enabled: true, label: "demo" }]])
      expect(origins).toEqual([
        {
          spec: ["acme-plugin@1.2.3", { enabled: true, label: "demo" }],
          scope: "global",
          source: path.join(test.directory, "tui.json"),
        },
      ])
    }),
  ),
)

it.instance("deduplicates tuple plugin specs by name with higher precedence winning", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(Global.Path.config, "tui.json"), {
        plugin: [["acme-plugin@1.0.0", { source: "global" }]],
      })
      const explicit = path.join(test.directory, "explicit-tui.json")
      yield* fs.writeJson(explicit, {
        plugin: [
          ["acme-plugin@2.0.0", { source: "explicit" }],
          ["second-plugin@3.0.0", { source: "explicit" }],
        ],
      })

      yield* withEnv(
        "REPA_TUI_CONFIG",
        explicit,
        Effect.gen(function* () {
          const config = yield* getTuiConfig(test.directory)
          const origins = yield* getTuiPluginOrigins(test.directory)
          expect(config.plugin).toEqual([
            ["acme-plugin@2.0.0", { source: "explicit" }],
            ["second-plugin@3.0.0", { source: "explicit" }],
          ])
          expect(origins).toEqual([
            {
              spec: ["acme-plugin@2.0.0", { source: "explicit" }],
              scope: "global",
              source: explicit,
            },
            {
              spec: ["second-plugin@3.0.0", { source: "explicit" }],
              scope: "global",
              source: explicit,
            },
          ])
        }),
      )
    }),
  ),
)

projectIt.instance("tracks global plugin metadata while project plugins remain inert", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(Global.Path.config, "tui.json"), { plugin: ["global-plugin@1.0.0"] })
      yield* fs.writeJson(path.join(test.directory, "tui.json"), { plugin: ["local-plugin@2.0.0"] })

      const config = yield* getTuiConfig(test.directory)
      const origins = yield* getTuiPluginOrigins(test.directory)
      expect(config.plugin).toEqual(["global-plugin@1.0.0"])
      expect(origins).toEqual([
        {
          spec: "global-plugin@1.0.0",
          scope: "global",
          source: path.join(Global.Path.config, "tui.json"),
        },
      ])
    }),
  ),
)

projectIt.instance("keeps project plugin_enabled flags inert", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeJson(path.join(Global.Path.config, "tui.json"), {
        plugin_enabled: {
          "internal:sidebar-context": false,
          "demo.plugin": true,
        },
      })
      yield* fs.writeJson(path.join(test.directory, "tui.json"), {
        plugin_enabled: {
          "demo.plugin": false,
          "local.plugin": true,
        },
      })

      const config = yield* getTuiConfig(test.directory)
      expect(config.plugin_enabled).toEqual({
        "internal:sidebar-context": false,
        "demo.plugin": true,
      })
    }),
  ),
)

it.instance("silently skips malformed tui.json - load failures degrade to {}", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.writeFileString(path.join(test.directory, "tui.json"), '{ "theme": "broken",')
      yield* fs.writeJson(path.join(test.directory, "tui.jsonc"), { theme: "fallback" })

      const config = yield* getTuiConfig(test.directory)
      expect(config.theme).toBe("fallback")
    }),
  ),
)

it.instance("silently skips non-ENOENT read failures (e.g. tui.json is a directory) - fallback layer still loads", () =>
  withCleanState(
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      yield* fs.makeDirectory(path.join(test.directory, "tui.json"), { recursive: true })
      yield* fs.writeJson(path.join(test.directory, "tui.jsonc"), { theme: "fallback" })

      const config = yield* getTuiConfig(test.directory)
      expect(config.theme).toBe("fallback")
    }),
  ),
)

it.instance("missing tui.json - silently treated as empty (ENOENT path)", () =>
  withCleanState(
    Effect.gen(function* () {
      const test = yield* TestInstance
      const config = yield* getTuiConfig(test.directory)
      expect(config).toBeDefined()
      expect(config.theme).toBeUndefined()
    }),
  ),
)
