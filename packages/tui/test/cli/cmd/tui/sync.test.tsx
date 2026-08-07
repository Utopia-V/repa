/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { tmpdir } from "../../../fixture/fixture"
import { deferred, directory, json, mount, wait, worktree } from "./sync-fixture"
import type { GlobalEvent, TurnInfo, TurnInput } from "@opencode-ai/sdk/v2"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"

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

function futureAttentionFinalizedEvent(sessionID: string, marker: string) {
  const suffix = marker.repeat(26)
  return {
    directory,
    project: "proj_test",
    payload: {
      id: `evt_future_attention_finalized_${marker}`,
      type: "future_attention.finalized",
      properties: {
        sessionID,
        turnID: `trn_future_attention_${marker}`,
        groupID: `fag_${suffix}`,
        assistantMessageID: `msg_future_attention_${marker}`,
        invocationPartID: `prt_original_claim_tool_${marker}`,
        receipt: {
          id: `far_${suffix}`,
          groupID: `fag_${suffix}`,
          outcome: "served",
          completion: {
            observationCut: "live_presentation_finalized",
            sessionID,
            turnID: `trn_future_attention_${marker}`,
            occurrenceID: `lco_${suffix}`,
            assistantMessageID: `msg_future_attention_${marker}`,
            modelOperationID: `msg_future_attention_${marker}`,
            invocationPartID: `prt_original_claim_tool_${marker}`,
            modelOutcome: "completed",
            localToolPartsTerminal: true,
            presentationCommitted: true,
            presentationUnavailable: false,
            timeCompleted: 2,
            completionOrder: 1,
            partManifestFingerprint: "a".repeat(64),
            eligibleOutputFingerprint: "b".repeat(64),
            eligibleOutputBytes: 32,
          },
          members: [
            {
              ordinal: 0,
              concernID: `fac_${suffix}`,
              outcome: "served",
              transitionID: `fat_${suffix}`,
              serviceReceiptID: `fas_${suffix}`,
            },
          ],
          timeFinalized: 3,
          finalizationOrder: 2,
        },
      },
    },
  } satisfies GlobalEvent
}

function serverConnected(marker: string): GlobalEvent {
  return {
    directory,
    project: "proj_test",
    payload: { id: `evt_server_connected_${marker}`, type: "server.connected", properties: {} },
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

  test("automatic mode leaves once-only semantic confirmations for an explicit learner reply", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const replies: URL[] = []
    const { app, emit, permission, sync } = await mount((url) => {
      if (url.pathname !== "/permission/perm_once/reply") return undefined
      replies.push(new URL(url))
      return json(true)
    }, tmp.path)

    try {
      permission.set("auto")
      emit({
        directory,
        project: "proj_test",
        payload: {
          id: "evt_permission_once",
          type: "permission.asked",
          properties: {
            id: "perm_once",
            sessionID: "ses_child",
            permission: "content_mutation",
            patterns: ["modify:C:\\course\\notes\\lesson.md"],
            tool: { messageID: "msg_once", callID: "call_once" },
            metadata: {
              onceOnly: true,
              operation: "modify",
              anchorPath: "C:\\course",
              relativePath: "notes\\lesson.md",
              lifetime: "this physical tool invocation",
              rights: ["modify"],
              warning: "This allows one direct file change only. It does not allow Shell, network, or sibling paths.",
              permissionPromptRequired: true,
              ...SemanticPresentation.metadata(
                SemanticPresentation.proposal({
                  kind: "content_mutation",
                  binding: {
                    sessionID: "ses_child",
                    messageID: "msg_once",
                    callID: "call_once",
                    partID: "part_once",
                  },
                  operation: "modify",
                  anchorPath: "C:\\course",
                  relativePath: "notes\\lesson.md",
                  lifetime: "this physical tool invocation",
                  rights: ["modify"],
                  warning:
                    "This allows one direct file change only. It does not allow Shell, network, or sibling paths.",
                }),
              ),
            },
            always: [],
          },
        },
      })
      emit({
        directory,
        project: "proj_test",
        payload: {
          id: "evt_permission_prompt_required",
          type: "permission.asked",
          properties: {
            id: "perm_prompt_required",
            sessionID: "ses_child",
            permission: "custom_permission",
            patterns: ["*"],
            metadata: { permissionPromptRequired: true },
            always: ["*"],
          },
        },
      })

      await wait(() => sync.data.permission.ses_child?.length === 2)
      expect(replies).toHaveLength(0)
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

  test("stores one separately typed FutureAttention finalization per receipt", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const sessionID = "ses_future_attention"
    const first = futureAttentionFinalizedEvent(sessionID, "1")
    const second = futureAttentionFinalizedEvent(sessionID, "2")
    const after: string[] = []
    const catchupStarted = deferred<void>()
    const catchup = deferred<Response>()
    const { app, emit, sync } = await mount((url) => {
      if (url.pathname === `/session/${sessionID}/future-attention/finalization`) {
        after.push(url.searchParams.get("after") ?? "")
        if (url.searchParams.get("after") === "4") {
          return json({
            events: [
              {
                id: second.payload.id,
                type: second.payload.type,
                sequence: 9,
                properties: second.payload.properties,
              },
            ],
            hasMore: false,
          })
        }
        catchupStarted.resolve()
        return catchup.promise
      }
      if (url.pathname === `/session/${sessionID}`) {
        return json({
          id: sessionID,
          slug: sessionID,
          projectID: "proj_test",
          directory,
          title: "FutureAttention catch-up",
          version: "test",
          time: { created: 1, updated: 1 },
        })
      }
      if (
        url.pathname === `/session/${sessionID}/message` ||
        url.pathname === `/session/${sessionID}/todo` ||
        url.pathname === `/session/${sessionID}/diff`
      ) {
        return json([])
      }
      return undefined
    }, tmp.path)

    try {
      const syncing = sync.session.sync(sessionID)
      await catchupStarted.promise
      emit(first)
      await wait(() => sync.data.future_attention_finalization[sessionID]?.length === 1)
      catchup.resolve(
        json({
          events: [
            {
              id: first.payload.id,
              type: first.payload.type,
              sequence: 4,
              properties: first.payload.properties,
            },
          ],
          hasMore: true,
        }),
      )
      await syncing
      emit(first)

      expect(after).toEqual(["-1", "4"])
      expect(sync.data.future_attention_finalization[sessionID]).toEqual([
        expect.objectContaining({
          assistantMessageID: "msg_future_attention_1",
          invocationPartID: "prt_original_claim_tool_1",
          receipt: expect.objectContaining({
            id: `far_${"1".repeat(26)}`,
            outcome: "served",
          }),
        }),
        expect.objectContaining({
          assistantMessageID: "msg_future_attention_2",
          invocationPartID: "prt_original_claim_tool_2",
          receipt: expect.objectContaining({
            id: `far_${"2".repeat(26)}`,
            outcome: "served",
          }),
        }),
      ])
    } finally {
      app.renderer.destroy()
    }
  })

  test("catches up every TUI reconnect epoch including one received during an in-flight catch-up", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const sessionID = "ses_future_attention_reconnect"
    const selectedDirectory = `${worktree}/course-b`
    const first = futureAttentionFinalizedEvent(sessionID, "3")
    const second = futureAttentionFinalizedEvent(sessionID, "4")
    const firstReconnectStarted = deferred<void>()
    const firstReconnect = deferred<Response>()
    let reconnecting = false
    let reconnectRequests = 0
    let activeReconnectRequests = 0
    let maxActiveReconnectRequests = 0
    const reconnectDirectories: string[] = []
    const { app, emit, project, sync } = await mount((url) => {
      if (url.pathname === "/path") {
        return json({
          home: "/tmp",
          state: "",
          config: "",
          worktree,
          directory: url.searchParams.get("directory") ?? directory,
        })
      }
      if (url.pathname === "/project/current") return json({ id: "proj_test", worktree })
      if (url.pathname === "/project/proj_test/directories") {
        return json([{ directory: worktree }, { directory: selectedDirectory, strategy: "git_worktree" }])
      }
      if (url.pathname === `/session/${sessionID}/future-attention/finalization`) {
        if (!reconnecting) return json({ events: [], hasMore: false })
        reconnectRequests++
        activeReconnectRequests++
        maxActiveReconnectRequests = Math.max(maxActiveReconnectRequests, activeReconnectRequests)
        reconnectDirectories.push(url.searchParams.get("directory") ?? "")
        if (reconnectRequests === 1) {
          firstReconnectStarted.resolve()
          return firstReconnect.promise.finally(() => activeReconnectRequests--)
        }
        return Promise.resolve(
          json({
            events: [
              { id: first.payload.id, type: first.payload.type, sequence: 4, properties: first.payload.properties },
              { id: second.payload.id, type: second.payload.type, sequence: 9, properties: second.payload.properties },
            ],
            hasMore: false,
          }),
        ).finally(() => activeReconnectRequests--)
      }
      if (url.pathname === `/session/${sessionID}`) {
        return json({
          id: sessionID,
          slug: sessionID,
          projectID: "proj_test",
          directory,
          title: "FutureAttention reconnect catch-up",
          version: "test",
          time: { created: 1, updated: 1 },
        })
      }
      if (
        url.pathname === `/session/${sessionID}/message` ||
        url.pathname === `/session/${sessionID}/todo` ||
        url.pathname === `/session/${sessionID}/diff`
      ) {
        return json([])
      }
      return undefined
    }, tmp.path)

    try {
      await sync.session.sync(sessionID)
      await sync.bootstrap({ fatal: false, directory: selectedDirectory })
      expect(project.instance.directory()).toBe(selectedDirectory)
      reconnecting = true
      emit(serverConnected("1"))
      await firstReconnectStarted.promise
      emit(serverConnected("2"))
      firstReconnect.resolve(
        json({
          events: [
            { id: first.payload.id, type: first.payload.type, sequence: 4, properties: first.payload.properties },
          ],
          hasMore: false,
        }),
      )

      await wait(() => sync.data.future_attention_finalization[sessionID]?.length === 2)
      expect(reconnectRequests).toBe(2)
      expect(maxActiveReconnectRequests).toBe(1)
      expect(reconnectDirectories).toEqual([directory, directory])
      expect(sync.data.future_attention_finalization[sessionID]?.map((item) => item.receipt.id)).toEqual([
        first.payload.properties.receipt.id,
        second.payload.properties.receipt.id,
      ])
    } finally {
      app.renderer.destroy()
    }
  })

  test("retries a failed TUI reconnect catch-up without requiring another connection epoch", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const sessionID = "ses_future_attention_reconnect_retry"
    const finalization = futureAttentionFinalizedEvent(sessionID, "5")
    const firstReconnectFinished = deferred<void>()
    let reconnecting = false
    let reconnectRequests = 0
    let activeReconnectRequests = 0
    let maxActiveReconnectRequests = 0
    let sessionReads = 0
    const reconnectDirectories: string[] = []
    const { app, emit, sync } = await mount((url) => {
      if (url.pathname === `/session/${sessionID}/future-attention/finalization`) {
        if (!reconnecting) return json({ events: [], hasMore: false })
        reconnectRequests++
        activeReconnectRequests++
        maxActiveReconnectRequests = Math.max(maxActiveReconnectRequests, activeReconnectRequests)
        reconnectDirectories.push(url.searchParams.get("directory") ?? "")
        if (reconnectRequests === 1) {
          return Promise.reject(new Error("transient finalization history failure")).finally(() => {
            activeReconnectRequests--
            firstReconnectFinished.resolve()
          })
        }
        return Promise.resolve(
          json({
            events: [
              {
                id: finalization.payload.id,
                type: finalization.payload.type,
                sequence: 4,
                properties: finalization.payload.properties,
              },
            ],
            hasMore: false,
          }),
        ).finally(() => activeReconnectRequests--)
      }
      if (url.pathname === `/session/${sessionID}`) {
        sessionReads++
        return json({
          id: sessionID,
          slug: sessionID,
          projectID: "proj_test",
          directory,
          title: "FutureAttention reconnect retry",
          version: "test",
          time: { created: 1, updated: 1 },
        })
      }
      if (
        url.pathname === `/session/${sessionID}/message` ||
        url.pathname === `/session/${sessionID}/todo` ||
        url.pathname === `/session/${sessionID}/diff`
      ) {
        return json([])
      }
      return undefined
    }, tmp.path)

    try {
      await sync.session.sync(sessionID)
      reconnecting = true
      emit(serverConnected("retry"))
      await firstReconnectFinished.promise
      await sync.session.sync(sessionID)
      expect(sessionReads).toBe(1)

      await wait(() => sync.data.future_attention_finalization[sessionID]?.length === 1, 3_000)
      expect(reconnectRequests).toBe(2)
      expect(maxActiveReconnectRequests).toBe(1)
      expect(reconnectDirectories).toEqual([directory, directory])
      expect(sync.data.future_attention_finalization[sessionID]?.map((item) => item.receipt.id)).toEqual([
        finalization.payload.properties.receipt.id,
      ])
    } finally {
      app.renderer.destroy()
    }
  })
})
