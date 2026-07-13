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

test("session UI omits active sharing affordances while retaining rename", async () => {
  const state = path.join(process.env.XDG_STATE_HOME!, "repa")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const setup = await createTestRenderer({ width: 160, height: 30, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const legacyShareUrl = "https://legacy.invalid/s"
  const session = {
    id: "dummy",
    title: "Legacy shared session",
    slug: "dummy",
    projectID: "project",
    directory,
    version: "0.0.0-test",
    time: { created: 0, updated: 0 },
    share: { url: legacyShareUrl },
  }
  const calls = createFetch((url) => {
    if (url.pathname === "/session") return json([session])
    if (url.pathname === "/session/dummy") return json(session)
    if (["/session/dummy/message", "/session/dummy/todo", "/session/dummy/diff"].includes(url.pathname))
      return json([])
    if (url.pathname === "/provider")
      return json({
        all: [{ id: "test", name: "Test", source: "custom", env: [], options: {}, models: {} }],
        default: {},
        connected: ["test"],
      })
  })
  const events = createEventSource()
  const originalWrite = process.stdout.write.bind(process.stdout)
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let sidebarMounted!: () => void
  const sidebarReady = new Promise<void>((resolve) => {
    sidebarMounted = resolve
  })
  let sidebarSeen = false
  let sidebarTitle:
    | {
        sessionID: string
        title: string
        hasShareUrl: boolean
      }
    | undefined
  let disposeSlots = () => {}
  let task: Promise<unknown> | undefined
  let observed:
    | {
        sharingCommands: string[]
        sharingSlashes: string[]
        renameRegistered: boolean
        legacyShareUrlVisible: boolean
        sidebarTitle:
          | {
              sessionID: string
              title: string
              hasShareUrl: boolean
            }
          | undefined
      }
    | undefined

  process.stdout.write = (() => true) as typeof process.stdout.write

  try {
    const { run } = await import("../src/app")
    task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: { continue: true },
        pluginHost: {
          async start(input) {
            api = input.api
            const slots = input.runtime.setupSlots(input.api)
            const unregister = slots.register({
              id: "gate-5d-sharing-probe",
              slots: {
                sidebar_title(_context, props) {
                  sidebarTitle = {
                    sessionID: props.session_id,
                    title: props.title,
                    hasShareUrl: Object.hasOwn(props, "share_url"),
                  }
                  if (!sidebarSeen) {
                    sidebarSeen = true
                    sidebarMounted()
                  }
                  return null
                },
              },
            })
            disposeSlots = () => {
              unregister()
              slots.dispose()
            }
            started()
          },
          async dispose() {
            disposeSlots()
          },
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await setup.renderOnce()
    await setup.renderOnce()
    await sidebarReady
    await setup.renderOnce()

    const commands = api?.keymap.getCommands() ?? []
    const slashes = commands
      .flatMap((command) => [
        command.slashName,
        ...(Array.isArray(command.slashAliases) ? command.slashAliases : []),
      ])
      .filter((slash): slash is string => typeof slash === "string")
    const frame = setup.captureCharFrame()
    observed = {
      sharingCommands: commands
        .map((command) => command.name)
        .filter((name) => name === "session.share" || name === "session.unshare"),
      sharingSlashes: slashes.filter((slash) => slash === "share" || slash === "unshare"),
      renameRegistered: commands.some((command) => command.name === "session.rename"),
      legacyShareUrlVisible: frame.includes(legacyShareUrl),
      sidebarTitle,
    }

    api?.keymap.dispatchCommand("app.exit")
    await task
  } finally {
    process.stdout.write = originalWrite
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    await task?.catch(() => undefined)
    mock.restore()
  }

  expect(observed).toEqual({
    sharingCommands: [],
    sharingSlashes: [],
    renameRegistered: true,
    legacyShareUrlVisible: false,
    sidebarTitle: {
      sessionID: "dummy",
      title: "Legacy shared session",
      hasShareUrl: false,
    },
  })
})
