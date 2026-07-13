/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { ProjectProvider, useProject } from "../../src/context/project"
import { SDKProvider } from "../../src/context/sdk"
import { createFetch, deferred, directory, json, type FetchHandler } from "../fixture/tui-sdk"
import { TestTuiContexts } from "../fixture/tui-environment"

async function mountProject(override: FetchHandler) {
  const calls = createFetch(override)
  let project!: ReturnType<typeof useProject>
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })

  function Probe() {
    project = useProject()
    onMount(done)
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

  await ready
  return { app, project }
}

test("project sync selects an explicit local directory for subsequent sync", async () => {
  const mainDirectory = "/tmp/learning/course"
  const requests: URL[] = []
  const { app, project } = await mountProject((url) => {
    requests.push(new URL(url))
    if (url.pathname === "/path")
      return json({ home: "/tmp/learning", state: "", config: "", worktree: mainDirectory, directory: mainDirectory })
    if (url.pathname === "/project/current") return json({ id: "proj_test", worktree: mainDirectory })
    if (url.pathname === "/project/proj_test/directories") return json([{ directory: mainDirectory }])
  })

  try {
    await project.sync(mainDirectory)
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

    requests.length = 0
    await project.sync()
    const repeated = requests.filter((url) =>
      ["/path", "/project/current", "/project/proj_test/directories"].includes(url.pathname),
    )
    expect(repeated.every((url) => url.searchParams.get("directory") === mainDirectory)).toBe(true)
    expect(repeated.every((url) => !url.searchParams.has("workspace"))).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})

test("project sync rejects a resolved HTTP error without replacing the last complete snapshot", async () => {
  const stableDirectory = "/tmp/learning/course-a"
  const failingDirectory = "/tmp/learning/missing-course"
  const { app, project } = await mountProject((url) => {
    const requestedDirectory = url.searchParams.get("directory") ?? directory
    if (url.pathname === "/path" && requestedDirectory === failingDirectory)
      return json({ message: "path lookup failed" }, { status: 500 })
    if (url.pathname === "/path")
      return json({
        home: "/tmp/learning",
        state: "/tmp/learning/.state",
        config: "/tmp/learning/.config",
        worktree: stableDirectory,
        directory: stableDirectory,
      })
    if (url.pathname === "/project/current")
      return json(
        requestedDirectory === failingDirectory
          ? { id: "proj_missing", worktree: failingDirectory }
          : { id: "proj_course", worktree: stableDirectory },
      )
    if (url.pathname.endsWith("/directories")) return json([{ directory: requestedDirectory }])
  })

  try {
    await project.sync(stableDirectory)
    const rejected = await project.sync(failingDirectory).then(
      () => false,
      () => true,
    )
    const instancePath = project.instance.path()

    expect({
      rejected,
      path: {
        home: instancePath.home,
        state: instancePath.state,
        config: instancePath.config,
        worktree: instancePath.worktree,
        directory: instancePath.directory,
      },
      project: {
        id: project.data.project.id,
        worktree: project.data.project.worktree,
        mainDir: project.data.project.mainDir,
      },
    }).toEqual({
      rejected: true,
      path: {
        home: "/tmp/learning",
        state: "/tmp/learning/.state",
        config: "/tmp/learning/.config",
        worktree: stableDirectory,
        directory: stableDirectory,
      },
      project: {
        id: "proj_course",
        worktree: stableDirectory,
        mainDir: stableDirectory,
      },
    })
  } finally {
    app.renderer.destroy()
  }
})

test("a later project sync wins when an earlier directory finishes last", async () => {
  const firstDirectory = "/tmp/learning/course-a"
  const latestDirectory = "/tmp/learning/course-b"
  const firstPath = deferred<Response>()
  const firstProject = deferred<Response>()
  const firstPathStarted = deferred<void>()
  const firstProjectStarted = deferred<void>()
  const { app, project } = await mountProject((url) => {
    const requestedDirectory = url.searchParams.get("directory") ?? directory
    if (url.pathname === "/path" && requestedDirectory === firstDirectory) {
      firstPathStarted.resolve(undefined)
      return firstPath.promise
    }
    if (url.pathname === "/project/current" && requestedDirectory === firstDirectory) {
      firstProjectStarted.resolve(undefined)
      return firstProject.promise
    }
    if (url.pathname === "/path")
      return json({
        home: "/tmp/learning",
        state: "",
        config: "",
        worktree: latestDirectory,
        directory: latestDirectory,
      })
    if (url.pathname === "/project/current") return json({ id: "proj_latest", worktree: latestDirectory })
    if (url.pathname.endsWith("/directories")) return json([{ directory: requestedDirectory }])
  })

  try {
    const firstSync = project.sync(firstDirectory)
    await Promise.all([firstPathStarted.promise, firstProjectStarted.promise])
    await project.sync(latestDirectory)

    firstPath.resolve(
      json({ home: "/tmp/learning", state: "", config: "", worktree: firstDirectory, directory: firstDirectory }),
    )
    firstProject.resolve(json({ id: "proj_first", worktree: firstDirectory }))
    await firstSync

    expect({
      directory: project.instance.directory(),
      id: project.data.project.id,
      worktree: project.data.project.worktree,
      mainDir: project.data.project.mainDir,
    }).toEqual({
      directory: latestDirectory,
      id: "proj_latest",
      worktree: latestDirectory,
      mainDir: latestDirectory,
    })
  } finally {
    app.renderer.destroy()
  }
})
