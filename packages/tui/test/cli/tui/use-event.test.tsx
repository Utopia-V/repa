/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Event, GlobalEvent } from "@opencode-ai/sdk/v2"
import { onMount } from "solid-js"
import { SDKProvider } from "../../../src/context/sdk"
import { useEvent } from "../../../src/context/event"
import { createEventSource, createFetch, directory } from "../../fixture/tui-sdk"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { Flag } from "@opencode-ai/core/flag/flag"
import type { FetchHandler } from "../../fixture/tui-sdk"

const projectID = "proj_test"

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

function event(payload: Event, input: { directory: string; project?: string; workspace?: string }): GlobalEvent {
  return {
    directory: input.directory,
    project: input.project,
    workspace: input.workspace,
    payload,
  }
}

function vcs(branch: string): Event {
  return {
    id: `evt_vcs_${branch}`,
    type: "vcs.branch.updated",
    properties: {
      branch,
    },
  }
}

function update(version: string): Event {
  return {
    id: `evt_update_${version}`,
    type: "installation.update-available",
    properties: {
      version,
    },
  }
}

async function mount(override?: FetchHandler) {
  const events = createEventSource()
  const calls = createFetch(override)
  const seen: Event[] = []
  const metadata: Array<{ directory: string; project: string | undefined; hasWorkspace: boolean }> = []
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })

  const app = await testRender(() => (
    <TestTuiContexts>
      <SDKProvider url="http://test" directory={directory} events={events.source} fetch={calls.fetch}>
        <Probe onReady={done} seen={seen} metadata={metadata} />
      </SDKProvider>
    </TestTuiContexts>
  ))

  await ready
  return { app, emit: events.emit, seen, metadata }
}

function Probe(props: {
  seen: Event[]
  metadata: Array<{ directory: string; project: string | undefined; hasWorkspace: boolean }>
  onReady: () => void
}) {
  const event = useEvent()

  onMount(() => {
    event.subscribe((evt, metadata) => {
      props.seen.push(evt)
      props.metadata.push({
        directory: metadata.directory,
        project: "project" in metadata && typeof metadata.project === "string" ? metadata.project : undefined,
        hasWorkspace: Object.hasOwn(metadata, "workspace"),
      })
    })
    props.onReady()
  })

  return <box />
}

describe("useEvent", () => {
  test("exposes directory and project metadata without remote Workspace identity", async () => {
    const { app, emit, seen, metadata } = await mount()

    try {
      emit(event(vcs("main"), { directory: "/tmp/other", project: projectID, workspace: "ws_a" }))

      await wait(() => seen.length === 1)

      expect(seen).toEqual([vcs("main")])
      expect(metadata).toEqual([{ directory: "/tmp/other", project: projectID, hasWorkspace: false }])
    } finally {
      app.renderer.destroy()
    }
  })

  test("delivers same-project events from a sibling directory for navigation consumers", async () => {
    const { app, emit, seen } = await mount()

    try {
      emit(event(vcs("ws"), { directory: "/tmp/other", project: projectID, workspace: "ws_b" }))

      await wait(() => seen.length === 1)

      expect(seen).toEqual([vcs("ws")])
    } finally {
      app.renderer.destroy()
    }
  })

  test("delivers truly global events", async () => {
    const { app, emit, seen } = await mount()

    try {
      emit(event(update("1.2.3"), { directory: "global" }))

      await wait(() => seen.length === 1)

      expect(seen).toEqual([update("1.2.3")])
    } finally {
      app.renderer.destroy()
    }
  })

  test("subscribes without starting remote Workspace sync", async () => {
    const original = Flag.REPA_EXPERIMENTAL_WORKSPACES
    const requests: string[] = []
    Flag.REPA_EXPERIMENTAL_WORKSPACES = true
    const { app } = await mount((url) => {
      requests.push(url.pathname)
      return undefined
    })

    try {
      await Bun.sleep(30)
      expect(requests.filter((pathname) => pathname === "/sync/start")).toEqual([])
    } finally {
      Flag.REPA_EXPERIMENTAL_WORKSPACES = original
      app.renderer.destroy()
    }
  })
})
