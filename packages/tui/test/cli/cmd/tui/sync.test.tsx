/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { tmpdir } from "../../../fixture/fixture"
import { deferred, directory, json, mount, wait, worktree } from "./sync-fixture"
import type { GlobalEvent, TurnInfo, TurnInput } from "@opencode-ai/sdk/v2"

function branchEvent(branch: string, eventDirectory: string): GlobalEvent {
  return {
    directory: eventDirectory,
    project: "proj_test",
    payload: {
      id: `evt_vcs_${branch}`,
      type: "vcs.branch.updated",
      properties: { branch },
    },
  }
}

function turnInfo(sessionID: string, turnID: string): TurnInfo {
  return {
    id: turnID,
    sessionID,
    admissionKind: "learner",
    initialInputID: `${turnID}_input`,
    currentInputID: `${turnID}_input`,
    limits: { model: 8, tool: 32 },
    counters: { model: 0, tool: 0 },
    state: "running",
    depth: 0,
    timeAdmitted: 1,
    causalTime: 1,
  }
}

function turnInput(sessionID: string, turnID: string): TurnInput {
  return {
    id: `${turnID}_input`,
    turnID,
    sessionID,
    messageID: `${turnID}_message`,
    source: "learner_root",
    ordinal: 0,
    occurrenceID: `${turnID}_occurrence`,
    timeAdmitted: 1,
    envelopeFingerprint: `${turnID}_fingerprint`,
  }
}

describe("tui sync", () => {
  test("refresh scopes sessions by default and lists project sessions when disabled", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, kv, sync, session } = await mount(undefined, tmp.path)

    try {
      expect(kv.get("session_directory_filter_enabled", true)).toBe(true)
      expect(session.at(-1)?.searchParams.get("roots")).toBeNull()
      expect(session.at(-1)?.searchParams.get("scope")).toBeNull()
      expect(session.at(-1)?.searchParams.get("path")).toBe("packages/tui")

      kv.set("session_directory_filter_enabled", false)
      await sync.session.refresh()

      expect(session.at(-1)?.searchParams.get("scope")).toBe("project")
      expect(session.at(-1)?.searchParams.get("path")).toBeNull()
      expect(session.at(-1)?.searchParams.get("roots")).toBeNull()
    } finally {
      app.renderer.destroy()
    }
  })

  test("vcs branch updates only apply for the active directory", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, project, sync } = await mount(undefined, tmp.path)

    try {
      expect(sync.data.vcs?.branch).toBe("main")

      emit(branchEvent("other", "/tmp/other"))
      await Bun.sleep(30)

      expect(sync.data.vcs?.branch).toBe("main")

      emit(branchEvent("feature", directory))
      await wait(() => sync.data.vcs?.branch === "feature")

      expect(sync.data.vcs?.branch).toBe("feature")
    } finally {
      app.renderer.destroy()
    }
  })

  test("lsp updates ignore another directory and refresh the active directory", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const requests: URL[] = []
    const { app, emit } = await mount((url) => {
      if (url.pathname === "/lsp") requests.push(new URL(url))
      return undefined
    }, tmp.path)

    try {
      requests.length = 0
      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: { id: "evt_lsp_other", type: "lsp.updated", properties: {} },
      })
      await Bun.sleep(30)
      expect(requests).toEqual([])

      emit({ directory, project: "proj_test", payload: { id: "evt_lsp_active", type: "lsp.updated", properties: {} } })
      await wait(() => requests.length === 1)
      expect(requests[0]?.searchParams.get("directory")).toBe(directory)
      expect(requests[0]?.searchParams.has("workspace")).toBe(false)
    } finally {
      app.renderer.destroy()
    }
  })

  test("an in-flight LSP refresh cannot overwrite a newly selected directory", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const latestDirectory = `${worktree}/course-b`
    const staleLsp = deferred<Response>()
    const staleLspStarted = deferred<void>()
    let delayStaleLsp = false
    const { app, emit, project, sync } = await mount((url) => {
      const requestedDirectory = url.searchParams.get("directory") ?? directory
      if (url.pathname === "/path")
        return json({ home: "/tmp", state: "", config: "", worktree, directory: requestedDirectory })
      if (url.pathname === "/project/current") return json({ id: "proj_test", worktree })
      if (url.pathname === "/project/proj_test/directories")
        return json([{ directory: worktree }, { directory: latestDirectory, strategy: "git_worktree" }])
      if (url.pathname === "/lsp" && requestedDirectory === directory && delayStaleLsp) {
        staleLspStarted.resolve(undefined)
        return staleLsp.promise
      }
      if (url.pathname === "/lsp")
        return json([
          {
            id: requestedDirectory === latestDirectory ? "latest" : "initial",
            name: "typescript",
            root: requestedDirectory,
            status: "connected",
          },
        ])
      return undefined
    }, tmp.path)

    try {
      delayStaleLsp = true
      emit({
        directory,
        project: "proj_test",
        payload: { id: "evt_lsp_stale", type: "lsp.updated", properties: {} },
      })
      await staleLspStarted.promise

      await sync.bootstrap({ fatal: false, directory: latestDirectory })
      await wait(() => sync.data.lsp[0]?.id === "latest")

      staleLsp.resolve(json([{ id: "stale", name: "typescript", root: directory, status: "connected" }]))
      await Bun.sleep(30)
      expect(sync.data.lsp[0]?.id).toBe("latest")
    } finally {
      app.renderer.destroy()
    }
  })

  test("a selected directory remains active through bootstrap hydration", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const selected = `${worktree}/course-b`
    const requests: URL[] = []
    const { app, project, sync } = await mount((url) => {
      requests.push(new URL(url))
      if (url.pathname === "/path")
        return json({
          home: "/tmp",
          state: "",
          config: "",
          worktree,
          directory: url.searchParams.get("directory") ?? directory,
        })
      if (url.pathname === "/project/proj_test/directories")
        return json([{ directory: worktree }, { directory: selected, strategy: "git_worktree" }])
      return undefined
    }, tmp.path)

    try {
      requests.length = 0
      await sync.bootstrap({ fatal: false, directory: selected })
      const hydrated = requests.filter((url) =>
        [
          "/config/providers",
          "/provider",
          "/agent",
          "/config",
          "/command",
          "/lsp",
          "/mcp",
          "/formatter",
          "/session/status",
          "/provider/auth",
          "/vcs",
        ].includes(url.pathname),
      )
      expect(project.instance.directory()).toBe(selected)
      expect(hydrated.length).toBeGreaterThan(0)
      expect(hydrated.every((url) => url.searchParams.get("directory") === selected)).toBe(true)
      expect(hydrated.every((url) => !url.searchParams.has("workspace"))).toBe(true)
    } finally {
      app.renderer.destroy()
    }
  })

  test("publishing a new directory clears the previous background cache until hydration completes", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const targetDirectory = `${worktree}/course-b`
    const targetVcs = deferred<Response>()
    const targetVcsStarted = deferred<void>()
    const { app, project, sync } = await mount((url) => {
      const requestedDirectory = url.searchParams.get("directory") ?? directory
      if (url.pathname === "/path")
        return json({ home: "/tmp", state: "", config: "", worktree, directory: requestedDirectory })
      if (url.pathname === "/project/current") return json({ id: "proj_test", worktree })
      if (url.pathname === "/project/proj_test/directories")
        return json([{ directory: worktree }, { directory: targetDirectory, strategy: "git_worktree" }])
      if (url.pathname === "/vcs" && requestedDirectory === targetDirectory) {
        targetVcsStarted.resolve(undefined)
        return targetVcs.promise
      }
      if (url.pathname === "/mcp" && requestedDirectory === targetDirectory) {
        return json({ course: { status: "connected" } })
      }
      return undefined
    }, tmp.path)

    try {
      expect(sync.status).toBe("complete")
      expect(sync.data.vcs?.branch).toBe("main")

      expect(await sync.bootstrap({ fatal: false, directory: targetDirectory })).toBe(true)
      await targetVcsStarted.promise
      expect(project.instance.directory()).toBe(targetDirectory)
      expect(sync.data.cache_directory).toBe(targetDirectory)
      expect(sync.status).toBe("partial")
      expect(sync.data.vcs).toBeUndefined()
      expect(sync.data.mcp).toEqual({})
      expect(sync.data.session).toEqual([])

      targetVcs.resolve(json({ branch: "course-b" }))
      await wait(() => sync.status === "complete")
      expect(sync.data.vcs?.branch).toBe("course-b")
      expect(sync.data.mcp.course?.status).toBe("connected")
    } finally {
      app.renderer.destroy()
    }
  })

  test("caller cancellation after publication does not strand the active directory in partial hydration", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const targetDirectory = `${worktree}/course-b`
    const targetVcs = deferred<Response>()
    const targetVcsStarted = deferred<void>()
    const { app, project, sync } = await mount((url) => {
      const requestedDirectory = url.searchParams.get("directory") ?? directory
      if (url.pathname === "/path")
        return json({ home: "/tmp", state: "", config: "", worktree, directory: requestedDirectory })
      if (url.pathname === "/project/current") return json({ id: "proj_test", worktree })
      if (url.pathname === "/project/proj_test/directories")
        return json([{ directory: worktree }, { directory: targetDirectory, strategy: "git_worktree" }])
      if (url.pathname === "/vcs" && requestedDirectory === targetDirectory) {
        targetVcsStarted.resolve(undefined)
        return targetVcs.promise
      }
      return undefined
    }, tmp.path)

    try {
      const controller = new AbortController()
      expect(await sync.bootstrap({ fatal: false, directory: targetDirectory, signal: controller.signal })).toBe(true)
      await targetVcsStarted.promise
      expect(project.instance.directory()).toBe(targetDirectory)
      expect(sync.status).toBe("partial")

      controller.abort()
      targetVcs.resolve(json({ branch: "course-b" }))

      await wait(() => sync.status === "complete")
      expect(sync.data.vcs?.branch).toBe("course-b")
    } finally {
      app.renderer.destroy()
    }
  })

  test("a failed background endpoint does not discard the other directory caches", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const targetDirectory = `${worktree}/course-b`
    const { app, project, sync } = await mount((url) => {
      const requestedDirectory = url.searchParams.get("directory") ?? directory
      if (url.pathname === "/path")
        return json({ home: "/tmp", state: "", config: "", worktree, directory: requestedDirectory })
      if (url.pathname === "/project/current") return json({ id: "proj_test", worktree })
      if (url.pathname === "/project/proj_test/directories")
        return json([{ directory: worktree }, { directory: targetDirectory, strategy: "git_worktree" }])
      if (url.pathname === "/mcp" && requestedDirectory === targetDirectory)
        return json({ course: { status: "connected" } })
      if (url.pathname === "/vcs" && requestedDirectory === targetDirectory)
        return json({ name: "HydrationFailed", message: "vcs unavailable" }, { status: 500 })
      return undefined
    }, tmp.path)

    try {
      expect(await sync.bootstrap({ fatal: false, directory: targetDirectory })).toBe(true)
      await wait(() => sync.data.mcp.course?.status === "connected")

      expect(project.instance.directory()).toBe(targetDirectory)
      expect(sync.data.cache_directory).toBe(targetDirectory)
      expect(sync.data.mcp.course?.status).toBe("connected")
      expect(sync.data.vcs).toBeUndefined()
      expect(sync.status).toBe("partial")
    } finally {
      app.renderer.destroy()
    }
  })

  test("a stale bootstrap cannot overwrite cache hydrated for a later directory", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const staleDirectory = `${worktree}/course-a`
    const latestDirectory = `${worktree}/course-b`
    const staleVcs = deferred<Response>()
    const staleVcsStarted = deferred<void>()
    let delayStaleVcs = false
    const { app, project, sync } = await mount((url) => {
      const requestedDirectory = url.searchParams.get("directory") ?? directory
      if (url.pathname === "/path")
        return json({ home: "/tmp", state: "", config: "", worktree, directory: requestedDirectory })
      if (url.pathname === "/project/current") return json({ id: "proj_test", worktree })
      if (url.pathname === "/project/proj_test/directories")
        return json([
          { directory: worktree },
          { directory: staleDirectory, strategy: "git_worktree" },
          { directory: latestDirectory, strategy: "git_worktree" },
        ])
      if (url.pathname === "/vcs" && requestedDirectory === staleDirectory && delayStaleVcs) {
        staleVcsStarted.resolve(undefined)
        return staleVcs.promise
      }
      if (url.pathname === "/vcs")
        return json({
          branch:
            requestedDirectory === latestDirectory
              ? "latest-directory"
              : requestedDirectory === staleDirectory
                ? "stale-directory"
                : "main",
        })
      return undefined
    }, tmp.path)

    try {
      delayStaleVcs = true
      await sync.bootstrap({ fatal: false, directory: staleDirectory })
      await staleVcsStarted.promise

      await sync.bootstrap({ fatal: false, directory: latestDirectory })
      await wait(() => sync.data.vcs?.branch === "latest-directory")

      staleVcs.resolve(json({ branch: "stale-directory" }))
      await Bun.sleep(0)

      expect(project.instance.directory()).toBe(latestDirectory)
      expect(sync.data.vcs?.branch).toBe("latest-directory")
    } finally {
      app.renderer.destroy()
    }
  })

  test("a failed bootstrap cannot publish a late Project snapshot without its Sync cache", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const targetDirectory = `${worktree}/course-b`
    const delayedPath = deferred<Response>()
    const targetPrepared = deferred<void>()
    let failTarget = false
    const { app, project, sync } = await mount((url) => {
      const requestedDirectory = url.searchParams.get("directory") ?? directory
      if (url.pathname === "/path" && requestedDirectory === targetDirectory && failTarget) {
        return delayedPath.promise
      }
      if (url.pathname === "/path")
        return json({ home: "/tmp", state: "", config: "", worktree, directory: requestedDirectory })
      if (url.pathname === "/project/current") return json({ id: "proj_test", worktree })
      if (url.pathname === "/project/proj_test/directories") {
        if (requestedDirectory === targetDirectory) targetPrepared.resolve(undefined)
        return json([{ directory: worktree }, { directory: targetDirectory, strategy: "git_worktree" }])
      }
      if (url.pathname === "/config/providers" && requestedDirectory === targetDirectory && failTarget) {
        return json({ name: "HydrationFailed", message: "target config unavailable" }, { status: 500 })
      }
      return undefined
    }, tmp.path)

    try {
      expect(project.instance.directory()).toBe(directory)
      expect(sync.data.vcs?.branch).toBe("main")
      failTarget = true
      const failed = sync.bootstrap({ fatal: false, directory: targetDirectory })
      await expect(failed).rejects.toBeDefined()

      delayedPath.resolve(json({ home: "/tmp", state: "", config: "", worktree, directory: targetDirectory }))
      await targetPrepared.promise
      await Bun.sleep(30)

      expect(project.instance.directory()).toBe(directory)
      expect(sync.data.vcs?.branch).toBe("main")
    } finally {
      app.renderer.destroy()
    }
  })

  test("automatic permission replies keep the request directory and drop remote Workspace routing", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const replies: URL[] = []
    const { app, emit, permission } = await mount((url) => {
      if (url.pathname !== "/permission/perm_test/reply") return undefined
      replies.push(new URL(url))
      return json(true)
    }, tmp.path)

    try {
      permission.set("auto")
      emit({
        directory: "/tmp/learning/child-session",
        project: "proj_test",
        workspace: "remote_workspace",
        payload: {
          id: "evt_permission",
          type: "permission.asked",
          properties: {
            id: "perm_test",
            sessionID: "ses_child",
            permission: "read",
            patterns: ["*"],
            metadata: {},
            always: [],
          },
        },
      })
      await wait(() => replies.length === 1)
      expect(replies[0]?.searchParams.get("directory")).toBe("/tmp/learning/child-session")
      expect(replies[0]?.searchParams.has("workspace")).toBe(false)
    } finally {
      app.renderer.destroy()
    }
  })

  test("session events accept sibling directories in the active project and reject another project", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)
    const info = (id: string, projectID: string) => ({
      id,
      slug: id,
      projectID,
      directory: "/tmp/learning/sibling",
      title: id,
      version: "test",
      time: { created: 1, updated: 1 },
    })

    try {
      emit({
        directory: "/tmp/learning/sibling",
        project: "other_project",
        payload: {
          id: "evt_other_project",
          type: "session.updated",
          properties: { sessionID: "ses_other", info: info("ses_other", "other_project") },
        },
      })
      await Bun.sleep(30)
      expect(sync.session.get("ses_other")).toBeUndefined()

      emit({
        directory: "/tmp/learning/sibling",
        project: "proj_test",
        payload: {
          id: "evt_same_project",
          type: "session.updated",
          properties: { sessionID: "ses_sibling", info: info("ses_sibling", "proj_test") },
        },
      })
      await wait(() => sync.session.get("ses_sibling") !== undefined)
      expect(sync.session.get("ses_sibling")?.directory).toBe("/tmp/learning/sibling")
    } finally {
      app.renderer.destroy()
    }
  })

  test("captured steer and interrupt identities do not retarget a replacement Turn", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)
    const sessionID = "ses_visible_turn"
    const turnA = "trn_visible_a"
    const turnB = "trn_visible_b"

    try {
      emit({
        directory,
        project: "proj_test",
        payload: {
          id: "evt_turn_a_started",
          type: "turn.started",
          properties: {
            sessionID,
            turnID: turnA,
            timestamp: 1,
            turn: turnInfo(sessionID, turnA),
            input: turnInput(sessionID, turnA),
          },
        },
      })
      await wait(() => sync.data.active_turn[sessionID] === turnA)

      const steerTarget = sync.data.active_turn[sessionID]
      const interruptTarget = sync.data.active_turn[sessionID]

      emit({
        directory,
        project: "proj_test",
        payload: {
          id: "evt_turn_a_terminal",
          type: "turn.terminal",
          properties: {
            sessionID,
            turnID: turnA,
            timestamp: 2,
            terminal: {
              outcome: "completed",
              reason: "normal",
              counters: { model: 1, tool: 0 },
              time: 2,
            },
          },
        },
      })
      emit({
        directory,
        project: "proj_test",
        payload: {
          id: "evt_turn_b_started",
          type: "turn.started",
          properties: {
            sessionID,
            turnID: turnB,
            timestamp: 3,
            turn: turnInfo(sessionID, turnB),
            input: turnInput(sessionID, turnB),
          },
        },
      })
      await wait(() => sync.data.active_turn[sessionID] === turnB)

      expect({ steerTarget, interruptTarget, current: sync.data.active_turn[sessionID] }).toEqual({
        steerTarget: turnA,
        interruptTarget: turnA,
        current: turnB,
      })

      emit({
        directory,
        project: "proj_test",
        payload: {
          id: "evt_stale_turn_a_terminal",
          type: "turn.terminal",
          properties: {
            sessionID,
            turnID: turnA,
            timestamp: 4,
            terminal: {
              outcome: "interrupted",
              reason: "learner_interrupt",
              counters: { model: 1, tool: 0 },
              time: 4,
            },
          },
        },
      })
      await Bun.sleep(20)
      expect(sync.data.active_turn[sessionID]).toBe(turnB)
    } finally {
      app.renderer.destroy()
    }
  })
})
