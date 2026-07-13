/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { onMount } from "solid-js"
import { ArgsProvider } from "../../src/context/args"
import { ExitProvider } from "../../src/context/exit"
import { KVProvider } from "../../src/context/kv"
import { LocalProvider, useLocal } from "../../src/context/local"
import { PermissionProvider } from "../../src/context/permission"
import { ProjectProvider, useProject } from "../../src/context/project"
import { RouteProvider } from "../../src/context/route"
import { SDKProvider } from "../../src/context/sdk"
import { SyncProvider, useSync } from "../../src/context/sync"
import { ThemeProvider } from "../../src/context/theme"
import { TuiConfigProvider } from "../../src/config"
import { ToastProvider } from "../../src/ui/toast"
import { tmpdir } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createEventSource, createFetch, deferred, directory, json, worktree } from "../fixture/tui-sdk"
import { toggleMcpInDirectory } from "../../src/component/dialog-mcp"

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

test("routes retained MCP toggles through the active directory", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const selectedDirectory = `${worktree}/course-b`
  const mcpCalls: URL[] = []
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/path")
      return json({
        home: "/tmp",
        state: "",
        config: "",
        worktree,
        directory: url.searchParams.get("directory") ?? directory,
      })
    if (url.pathname === "/project/current") return json({ id: "proj_test", worktree })
    if (url.pathname === "/project/proj_test/directories")
      return json([{ directory: worktree }, { directory: selectedDirectory, strategy: "git_worktree" }])
    if (["/mcp/lesson-notes/connect", "/mcp/lesson-notes/disconnect"].includes(url.pathname)) {
      mcpCalls.push(new URL(url))
      return json(true)
    }
    if (url.pathname === "/mcp") return json({ "lesson-notes": { status: "disabled" } })
  })
  let local!: ReturnType<typeof useLocal>
  let project!: ReturnType<typeof useProject>
  let sync!: ReturnType<typeof useSync>
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })

  function Probe() {
    local = useLocal()
    project = useProject()
    sync = useSync()
    onMount(done)
    return <box />
  }

  const app = await testRender(() => (
    <TestTuiContexts paths={{ state: tmp.path }}>
      <ArgsProvider>
        <KVProvider>
          <ToastProvider>
            <RouteProvider>
              <TuiConfigProvider config={createTuiResolvedConfig()}>
                <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
                  <PermissionProvider>
                    <ProjectProvider>
                      <ExitProvider exit={() => {}}>
                        <SyncProvider>
                          <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
                            <LocalProvider>
                              <Probe />
                            </LocalProvider>
                          </ThemeProvider>
                        </SyncProvider>
                      </ExitProvider>
                    </ProjectProvider>
                  </PermissionProvider>
                </SDKProvider>
              </TuiConfigProvider>
            </RouteProvider>
          </ToastProvider>
        </KVProvider>
      </ArgsProvider>
    </TestTuiContexts>
  ))

  try {
    await ready
    await wait(() => sync.status === "complete")
    await project.sync(selectedDirectory)
    await sync.bootstrap({ fatal: false, directory: selectedDirectory })
    await local.mcp.toggle("lesson-notes", selectedDirectory)
    sync.set("mcp", "lesson-notes", { status: "connected" })
    await local.mcp.toggle("lesson-notes", selectedDirectory)

    expect(mcpCalls.map((url) => url.pathname)).toEqual([
      "/mcp/lesson-notes/connect",
      "/mcp/lesson-notes/disconnect",
    ])
    expect(mcpCalls.every((url) => url.searchParams.get("directory") === selectedDirectory)).toBe(true)
    expect(mcpCalls.every((url) => !url.searchParams.has("workspace"))).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})

test("drops an MCP status response when its directory is no longer active", async () => {
  const directoryA = "/tmp/learning/course-a"
  const directoryB = "/tmp/learning/course-b"
  const response = deferred<{ data?: Record<string, { status: string }> }>()
  const started = deferred<void>()
  let activeDirectory = directoryA
  let cache: Record<string, { status: string }> = { current: { status: "connected" } }

  const toggle = toggleMcpInDirectory({
    name: "lesson-notes",
    directory: directoryA,
    toggle: async (name, target) => {
      expect(name).toBe("lesson-notes")
      expect(target).toBe(directoryA)
    },
    status: (target) => {
      expect(target).toBe(directoryA)
      started.resolve(undefined)
      return response.promise
    },
    currentDirectory: () => activeDirectory,
    commit: (data) => {
      cache = data
    },
  })

  await started.promise
  activeDirectory = directoryB
  cache = { current: { status: "disabled" } }
  response.resolve({ data: { stale: { status: "connected" } } })

  expect(await toggle).toBe(false)
  expect(cache).toEqual({ current: { status: "disabled" } })
})
