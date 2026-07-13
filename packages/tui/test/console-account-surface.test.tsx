import { expect, mock, test } from "bun:test"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createTestRenderer } from "@opentui/core/testing"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "./fixture/tui-sdk"

test("startup and command registry omit Console account organization affordances", async () => {
  const state = path.join(process.env.XDG_STATE_HOME!, "repa")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const requests: string[] = []
  let hydrationReached!: () => void
  const hydrationReady = new Promise<void>((resolve) => {
    hydrationReached = resolve
  })
  let reached = false
  const calls = createFetch((url) => {
    // Record before returning a response so fixture fallbacks cannot hide a residual Console request.
    requests.push(url.pathname)
    if (url.pathname === "/experimental/console")
      return json({ consoleManagedProviders: ["test"], activeOrgName: "Test Org", switchableOrgCount: 2 })
    if (url.pathname === "/provider/auth") return json({})
    if (url.pathname === "/vcs" && !reached) {
      reached = true
      hydrationReached()
    }
  })
  const events = createEventSource()
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let task: Promise<unknown> | undefined
  let observed:
    | {
        organizationCommands: string[]
        organizationSlashes: string[]
        providerConnectRegistered: boolean
        localConsoleRegistered: boolean
        consoleRequests: string[]
        providerAuthRequests: string[]
      }
    | undefined

  try {
    const { run } = await import("../src/app")
    task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await hydrationReady
    await setup.renderOnce()
    await setup.renderOnce()

    const commands = api?.keymap.getCommands() ?? []
    const slashes = commands
      .flatMap((command) => [
        command.slashName,
        ...(Array.isArray(command.slashAliases) ? command.slashAliases : []),
      ])
      .filter((slash): slash is string => typeof slash === "string")
    observed = {
      organizationCommands: commands
        .map((command) => command.name)
        .filter((name) => name === "console.org.switch"),
      organizationSlashes: slashes.filter((slash) => ["org", "orgs", "switch-org"].includes(slash)),
      providerConnectRegistered: commands.some((command) => command.name === "provider.connect"),
      localConsoleRegistered: commands.some((command) => command.name === "app.console"),
      consoleRequests: requests.filter((request) => request === "/experimental/console"),
      providerAuthRequests: requests.filter((request) => request === "/provider/auth"),
    }

    api?.keymap.dispatchCommand("app.exit")
    await task
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    await task?.catch(() => undefined)
    mock.restore()
  }

  expect(observed).toEqual({
    organizationCommands: [],
    organizationSlashes: [],
    providerConnectRegistered: true,
    localConsoleRegistered: true,
    consoleRequests: [],
    providerAuthRequests: ["/provider/auth"],
  })
})
