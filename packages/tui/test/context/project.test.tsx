/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { ProjectProvider, useProject } from "../../src/context/project"
import { SDKProvider } from "../../src/context/sdk"
import { createFetch, directory, json } from "../fixture/tui-sdk"
import { TestTuiContexts } from "../fixture/tui-environment"

test("project sync can switch to an explicit local directory", async () => {
  const mainDirectory = "/tmp/learning/course"
  const requests: URL[] = []
  const calls = createFetch((url) => {
    requests.push(new URL(url))
    if (url.pathname === "/path")
      return json({ home: "/tmp/learning", state: "", config: "", worktree: mainDirectory, directory: mainDirectory })
    if (url.pathname === "/project/current") return json({ id: "proj_test", worktree: mainDirectory })
    if (url.pathname === "/project/proj_test/directories") return json([{ directory: mainDirectory }])
  })
  let project!: ReturnType<typeof useProject>
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })

  function Probe() {
    project = useProject()
    onMount(async () => {
      await project.sync(mainDirectory)
      done()
    })
    return <box />
  }

  const app = await testRender(() => (
    <TestTuiContexts>
      <SDKProvider url="http://test" directory={directory} fetch={calls.fetch}>
        <ProjectProvider>
          <Probe />
        </ProjectProvider>
      </SDKProvider>
    </TestTuiContexts>
  ))

  try {
    await ready
    const local = requests.filter((url) =>
      ["/path", "/project/current", "/project/proj_test/directories"].includes(url.pathname),
    )
    expect(local.map((url) => url.pathname)).toEqual([
      "/path",
      "/project/current",
      "/project/proj_test/directories",
    ])
    expect(local.every((url) => url.searchParams.get("directory") === mainDirectory)).toBe(true)
    expect(local.every((url) => !url.searchParams.has("workspace"))).toBe(true)
    expect(project.instance.directory()).toBe(mainDirectory)
    expect(project.data.project.mainDir).toBe(mainDirectory)
  } finally {
    app.renderer.destroy()
  }
})
