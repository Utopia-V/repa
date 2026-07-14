/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Event, GlobalEvent } from "@opencode-ai/sdk/v2"
import { onMount } from "solid-js"
import { ArgsProvider } from "../../src/context/args"
import { DataProvider, useData } from "../../src/context/data"
import { ExitProvider } from "../../src/context/exit"
import { KVProvider } from "../../src/context/kv"
import { PermissionProvider } from "../../src/context/permission"
import { ProjectProvider } from "../../src/context/project"
import { SDKProvider } from "../../src/context/sdk"
import { SyncProvider, useSync } from "../../src/context/sync"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createEventSource, createFetch, directory, json, worktree } from "../fixture/tui-sdk"
import { tmpdir } from "../fixture/fixture"

const selectedDirectory = `${worktree}/course-b`

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

async function mount(state: string) {
  const events = createEventSource()
  const referenceRequests: URL[] = []
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
    if (url.pathname !== "/api/reference") return

    referenceRequests.push(new URL(url))
    const requestDirectory =
      url.searchParams.get("location[directory]") ?? url.searchParams.get("directory") ?? directory
    return json({
      location: { directory: requestDirectory, project: { id: "proj_test", directory: worktree } },
      data:
        requestDirectory === selectedDirectory
          ? [{ name: "course", path: "/course", source: { type: "local", path: "/course" } }]
          : [],
    })
  }, events)
  let data!: ReturnType<typeof useData>
  let sync!: ReturnType<typeof useSync>
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })

  function Probe() {
    data = useData()
    sync = useSync()
    onMount(done)
    return <box />
  }

  const app = await testRender(() => (
    <TestTuiContexts paths={{ state }}>
      <ArgsProvider>
        <KVProvider>
          <SDKProvider url="http://test" directory={directory} events={events.source} fetch={calls.fetch}>
            <PermissionProvider>
              <ProjectProvider>
                <ExitProvider exit={() => {}}>
                  <SyncProvider>
                    <DataProvider>
                      <Probe />
                    </DataProvider>
                  </SyncProvider>
                </ExitProvider>
              </ProjectProvider>
            </PermissionProvider>
          </SDKProvider>
        </KVProvider>
      </ArgsProvider>
    </TestTuiContexts>
  ))

  await ready
  await wait(() => sync.status === "complete")
  return { app, data, emit: events.emit, sync, referenceRequests }
}

test("uses the selected project directory as the default autocomplete cache location", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const ctx = await mount(tmp.path)

  try {
    await ctx.sync.bootstrap({ fatal: false, directory: selectedDirectory })
    expect(ctx.data.location.default()).toEqual({ directory: selectedDirectory })
  } finally {
    ctx.app.renderer.destroy()
  }
})

test("refreshes a reference update into the event directory without contaminating the startup cache", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const ctx = await mount(tmp.path)

  try {
    await wait(() => ctx.referenceRequests.length === 1)
    const payload: Event = { id: "evt_reference_course", type: "reference.updated", properties: {} }
    const event: GlobalEvent = { directory: selectedDirectory, project: "proj_test", payload }
    ctx.emit(event)
    await wait(() => ctx.referenceRequests.length === 2)

    const request = ctx.referenceRequests[1]
    expect(request?.searchParams.get("location[directory]")).toBe(selectedDirectory)
    expect(ctx.data.location.reference.list({ directory: selectedDirectory })?.map((item) => item.name)).toEqual([
      "course",
    ])
    expect(ctx.data.location.reference.list({ directory })).toEqual([])
  } finally {
    ctx.app.renderer.destroy()
  }
})
