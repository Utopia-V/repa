import { expect, mock, test } from "bun:test"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createTestRenderer } from "@opentui/core/testing"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

test("app registry and startup omit remote Workspace management and hydration", async () => {
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
    requests.push(url.pathname)
    if (url.pathname === "/vcs" && !reached) {
      reached = true
      hydrationReached()
    }
    return undefined
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
        workspaceCommands: string[]
        workspaceSlashes: string[]
        sessionListRegistered: boolean
        workspaceRequests: string[]
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
      workspaceCommands: commands
        .map((command) => command.name)
        .filter((name) => name === "workspace.copy_path" || name === "workspace.list"),
      workspaceSlashes: slashes.filter((slash) => slash === "workspaces"),
      sessionListRegistered: commands.some((command) => command.name === "session.list"),
      workspaceRequests: requests.filter((request) => request.startsWith("/experimental/workspace")),
    }

    api?.keymap.dispatchCommand("app.exit")
    await task
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    await task?.catch(() => undefined)
    mock.restore()
  }

  expect(observed).toEqual({
    workspaceCommands: [],
    workspaceSlashes: [],
    sessionListRegistered: true,
    workspaceRequests: [],
  })
})
