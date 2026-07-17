import { expect, mock, test } from "bun:test"
import type { CliRendererConfig } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { Effect, Layer } from "effect"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { TuiConfig } from "../../../src/config/tui"
import { CurrentWorkingDirectory } from "../../../src/config/tui-cwd"
import { tmpdir } from "../../fixture/fixture"
import { createEventSource, createFetch, directory, json, worktree } from "../../fixture/tui-sdk"

async function waitFor(setup: TestRendererSetup, predicate: () => boolean, timeout = 5_000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error("timed out waiting for TUI state")
    await setup.renderOnce()
    await Bun.sleep(10)
  }
}

async function clickLabel(setup: TestRendererSetup, label: string) {
  await setup.renderOnce()
  const lines = setup.captureCharFrame().split("\n")
  const y = lines.findIndex((line) => line.includes(label))
  const x = y < 0 ? -1 : lines[y]!.indexOf(label)
  expect(x).toBeGreaterThanOrEqual(0)
  expect(y).toBeGreaterThanOrEqual(0)
  if (x < 0 || y < 0) throw new Error(`missing clickable label: ${label}`)
  await setup.mockMouse.click(x + 1, y)
}

async function loadProjectTuiConfig(project: string, machineConfig: string) {
  const previous = Global.Path.config
  ;(Global.Path as { config: string }).config = machineConfig
  try {
    return await Effect.runPromise(
      TuiConfig.Service.use((service) => service.get()).pipe(
        Effect.provide(
          AppNodeBuilder.build(TuiConfig.node).pipe(
            Layer.provide(Layer.succeed(CurrentWorkingDirectory, project)),
          ),
        ),
        Effect.scoped,
      ),
    )
  } finally {
    ;(Global.Path as { config: string }).config = previous
  }
}

const projectOriginTest = process.platform === "win32" ? test : test.skip

projectOriginTest(
  "project TUI input controls cannot extend leader dispatch or disable permission clicks",
  async () => {
    await using project = await tmpdir()
    await using machine = await tmpdir()
    await Bun.write(
      path.join(project.path, "tui.json"),
      JSON.stringify({
        leader_timeout: 10_000,
        mouse: false,
      }),
    )
    const config = await loadProjectTuiConfig(project.path, machine.path)
    expect(config.leader_timeout).toBe(2_000)
    expect(config.mouse).toBe(true)

    await mkdir(Global.Path.state, { recursive: true })
    await Bun.write(path.join(Global.Path.state, "kv.json"), "{}")
    const setup = await createTestRenderer({
      width: 140,
      height: 36,
      useThread: false,
      useMouse: true,
      kittyKeyboard: true,
    })
    const core = await import("@opentui/core")
    let rendererConfig: CliRendererConfig | undefined
    mock.module("@opentui/core", () => ({
      ...core,
      createCliRenderer: async (input: CliRendererConfig) => {
        rendererConfig = input
        return setup.renderer
      },
    }))

    const session = {
      id: "dummy",
      title: "Gate 10 consumer canary",
      slug: "dummy",
      projectID: "proj_test",
      directory,
      version: "0.0.0-test",
      time: { created: 0, updated: 0 },
    }
    const user = {
      id: "msg_user",
      sessionID: session.id,
      role: "user" as const,
      time: { created: 1 },
      agent: "repa",
      model: { providerID: "test", modelID: "test-model" },
    }
    const events = createEventSource()
    const reverts: URL[] = []
    const replies: URL[] = []
    const calls = createFetch((url) => {
      if (url.pathname === "/api/location") {
        return json({ directory, project: { id: "proj_test", directory: worktree } })
      }
      if (url.pathname === "/experimental/capabilities") return json({ backgroundSubagents: false })
      if (url.pathname === "/project/proj_test/directories") return json([{ directory: worktree }])
      if (
        ["/api/agent", "/api/model", "/api/provider", "/api/integration", "/api/command", "/api/skill"].includes(
          url.pathname,
        )
      ) {
        return json({ location: { directory, project: { id: "proj_test", directory: worktree } }, data: [] })
      }
      if (url.pathname === "/api/reference") {
        return json({ location: { directory, project: { id: "proj_test", directory: worktree } }, data: [] })
      }
      if (url.pathname === "/session") return json([session])
      if (url.pathname === "/session/dummy") return json(session)
      if (url.pathname === "/session/dummy/message") {
        return json([
          {
            info: user,
            parts: [
              {
                id: "prt_user",
                sessionID: session.id,
                messageID: user.id,
                type: "text",
                text: "learner question",
              },
            ],
          },
        ])
      }
      if (["/session/dummy/todo", "/session/dummy/diff"].includes(url.pathname)) return json([])
      if (url.pathname === "/session/dummy/revert") {
        reverts.push(new URL(url))
        return json(session)
      }
      if (/^\/permission\/[^/]+\/reply$/.test(url.pathname)) {
        replies.push(new URL(url))
        return json(true)
      }
    })
    let api: TuiPluginApi | undefined
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const originalWrite = process.stdout.write.bind(process.stdout)
    let task: Promise<unknown> | undefined
    process.stdout.write = (() => true) as typeof process.stdout.write

    try {
      const { run } = await import("@opencode-ai/tui")
      task = Effect.runPromise(
        run({
          url: "http://test",
          directory,
          config,
          fetch: calls.fetch,
          events: events.source,
          args: { continue: true },
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
      await waitFor(
        setup,
        () =>
          api?.keymap.getCommands().some((command) => command.name === "session.undo") === true &&
          setup.captureCharFrame().includes("learner question"),
      )

      api?.keymap.dispatchCommand("session.undo")
      await waitFor(setup, () => reverts.length === 1)
      reverts.length = 0

      setup.mockInput.pressKey("x", { ctrl: true })
      await waitFor(setup, () => (api?.keymap.getPendingSequence().length ?? 0) === 1)
      setup.mockInput.pressKey("u")
      await waitFor(setup, () => reverts.length === 1)

      setup.mockInput.pressKey("x", { ctrl: true })
      await waitFor(setup, () => (api?.keymap.getPendingSequence().length ?? 0) === 1)
      await Bun.sleep(3_000)
      setup.mockInput.pressKey("u")
      await Bun.sleep(100)
      expect(reverts).toHaveLength(1)
      expect(rendererConfig?.useMouse).toBe(true)

      const permission = (id: string): GlobalEvent => ({
        directory,
        project: "proj_test",
        payload: {
          id: `evt_${id}`,
          type: "permission.asked",
          properties: {
            id,
            sessionID: session.id,
            permission: "bash",
            patterns: ["echo canary"],
            metadata: {},
            always: ["echo canary"],
          },
        },
      })

      events.emit(permission("perm_once"))
      await waitFor(
        setup,
        () =>
          setup.captureCharFrame().includes("Allow once") && setup.captureCharFrame().includes("Allow always"),
      )
      await clickLabel(setup, "Allow once")
      await waitFor(setup, () => replies.some((url) => url.pathname === "/permission/perm_once/reply"))

      events.emit({
        directory,
        project: "proj_test",
        payload: {
          id: "evt_perm_once_replied",
          type: "permission.replied",
          properties: { sessionID: session.id, requestID: "perm_once", reply: "once" },
        },
      })
      await waitFor(setup, () => !setup.captureCharFrame().includes("Allow once"))
      events.emit(permission("perm_always"))
      await waitFor(setup, () => setup.captureCharFrame().includes("Allow always"))
      await clickLabel(setup, "Allow always")
      await waitFor(setup, () => setup.captureCharFrame().includes("This will allow"))
    } finally {
      process.stdout.write = originalWrite
      if (!setup.renderer.isDestroyed) setup.renderer.destroy()
      await task?.catch(() => undefined)
      mock.restore()
    }
  },
  30_000,
)
