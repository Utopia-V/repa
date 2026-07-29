import { describe, expect, test } from "bun:test"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { nonInteractivePermissionDecision } from "@/cli/cmd/run"
import {
  createPermissionBodyState,
  permissionAlwaysLines,
  permissionCancel,
  permissionEscape,
  permissionInfo,
  permissionConstraint,
  permissionOptions,
  permissionReject,
  permissionRun,
} from "@/cli/cmd/run/permission.shared"

function req(input: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: "perm-1",
    sessionID: "session-1",
    permission: "read",
    patterns: [],
    metadata: {},
    always: [],
    ...input,
  }
}

describe("run permission shared", () => {
  test("replies immediately for allow once", () => {
    const out = permissionRun(createPermissionBodyState("perm-1"), "perm-1", "once")

    expect(out.reply).toEqual({
      requestID: "perm-1",
      reply: "once",
    })
  })

  test("requires confirmation for allow always", () => {
    const next = permissionRun(createPermissionBodyState("perm-1"), "perm-1", "always")
    expect(next.state.stage).toBe("always")
    expect(next.state.selected).toBe("confirm")
    expect(next.reply).toBeUndefined()

    expect(permissionRun(next.state, "perm-1", "confirm").reply).toEqual({
      requestID: "perm-1",
      reply: "always",
    })

    expect(permissionRun(next.state, "perm-1", "cancel").state).toMatchObject({
      stage: "permission",
      selected: "always",
    })
  })

  test("removes persistent approval from one-shot mutation controls", () => {
    expect(permissionOptions("permission", true)).toEqual(["once", "reject"])
    const state = createPermissionBodyState("perm-1")
    expect(permissionRun(state, "perm-1", "always", true)).toEqual({ state })
    expect(permissionRun(state, "perm-1", "once", true).reply).toEqual({
      requestID: "perm-1",
      reply: "once",
    })

    const genericPrompt = req({ metadata: { permissionPromptRequired: true } })
    expect(permissionConstraint(genericPrompt)).toEqual({ onceOnly: true, rejectOnly: false, exactReply: false })
    expect(permissionOptions("permission", permissionConstraint(genericPrompt).onceOnly)).toEqual(["once", "reject"])
  })

  test("builds trimmed reject replies and stage transitions", () => {
    const next = permissionRun(createPermissionBodyState("perm-1"), "perm-1", "reject")
    expect(next.state.stage).toBe("reject")

    const out = permissionReject({ ...next.state, message: "  use rg  " }, "perm-1")
    expect(out).toEqual({
      requestID: "perm-1",
      reply: "reject",
      message: "use rg",
    })

    expect(permissionCancel(next.state)).toMatchObject({
      stage: "permission",
      selected: "reject",
    })

    expect(permissionEscape(createPermissionBodyState("perm-1"), "perm-1").state).toMatchObject({
      stage: "reject",
      selected: "reject",
    })

    expect(permissionEscape({ ...next.state, stage: "always", selected: "confirm" }, "perm-1").state).toMatchObject({
      stage: "permission",
      selected: "always",
    })
  })

  test("exposes targeted cancel only for exact-reply requests", () => {
    const exact = req({ metadata: { [PermissionV1.EXACT_REPLY_METADATA_KEY]: true } })
    const constraint = permissionConstraint(exact)

    expect(constraint).toEqual({ onceOnly: false, rejectOnly: false, exactReply: true })
    expect(permissionOptions("permission", false, false, true)).toEqual(["once", "always", "reject", "cancel"])
    expect(permissionRun(createPermissionBodyState(exact.id), exact.id, "cancel", false, false, true).reply).toEqual({
      requestID: exact.id,
      reply: "cancel",
    })
    expect(permissionEscape(createPermissionBodyState(exact.id), exact.id, true).reply).toEqual({
      requestID: exact.id,
      reply: "cancel",
    })
  })

  test("interrupts headless exact requests without fabricating a reply", () => {
    const exact = req({ metadata: { [PermissionV1.EXACT_REPLY_METADATA_KEY]: true } })

    expect(nonInteractivePermissionDecision(req(), false)).toBe("reject")
    expect(nonInteractivePermissionDecision(exact, false)).toBe("interrupt")
    expect(nonInteractivePermissionDecision(exact, true)).toBe("once")
  })

  test("maps supported permission types into display info", () => {
    expect(
      permissionInfo(
        req({
          permission: "bash",
          metadata: {
            input: {
              command: "git status --short",
            },
          },
        }),
      ),
    ).toMatchObject({
      title: "Shell command",
      lines: ["$ git status --short"],
    })

    expect(
      permissionInfo(
        req({
          permission: "task",
          metadata: {
            description: "investigate stream",
            subagent_type: "general",
          },
        }),
      ),
    ).toMatchObject({
      title: "General Task",
      lines: ["◉ investigate stream"],
    })

    expect(
      permissionInfo(
        req({
          permission: "external_directory",
          patterns: ["/tmp/work/**/*.ts", "/tmp/work/**/*.tsx"],
        }),
      ),
    ).toMatchObject({
      title: "Access external directory /tmp/work",
      lines: ["- /tmp/work/**/*.ts", "- /tmp/work/**/*.tsx"],
    })

    expect(permissionInfo(req({ permission: "doom_loop" }))).toMatchObject({
      title: "Continue after repeated failures",
    })

    expect(permissionInfo(req({ permission: "custom_tool" }))).toMatchObject({
      title: "Call tool custom_tool",
      lines: ["Tool: custom_tool"],
    })
  })

  test("renders the same typed proposal and fails closed when a consequential projection is missing", () => {
    const proposal = SemanticPresentation.proposal({
      kind: "default_course_confirmation",
      binding: {
        sessionID: "session-1",
        messageID: "msg-perm-1",
        callID: "call-perm-1",
        requestID: "perm-1",
      },
      headID: "nav-head-1",
      version: 1,
      fromCourseID: "course-previous",
      fromCourseTitle: "Previous Course",
      target: {
        courseID: "course-target",
        courseTitle: "Target Course",
        courseVersion: 1,
        selectionRevisionID: "revision-target",
        selectionVersion: 1,
        viewID: "view-target",
        viewName: "Target View",
        viewVersion: 2,
        revisionVersion: 3,
      },
    })
    const target = {
      courseID: "course-target",
      courseTitle: "Target Course",
      courseVersion: 1,
      selectionRevisionID: "revision-target",
      selectionVersion: 1,
      viewID: "view-target",
      viewName: "Target View",
      viewVersion: 2,
      revisionVersion: 3,
    }
    const confirmation = {
      permissionRequestID: "perm-1",
      headID: "nav-head-1",
      version: 1,
      fromCourseID: "course-previous",
      fromCourseTitle: "Previous Course",
      target,
    }
    const projected = req({
      permission: "set_default_course_preference",
      patterns: ["course-target"],
      tool: { messageID: "msg-perm-1", callID: "call-perm-1" },
      metadata: {
        onceOnly: true,
        navigationKind: "default_course_preference",
        confirmation,
        permissionPromptRequired: true,
        ...SemanticPresentation.metadata(proposal),
      },
    })

    expect(permissionInfo(projected)).toEqual({
      icon: "◇",
      title: "Confirm the default Course preference",
      lines: [
        "This one-time confirmation is bound to the exact current preference and target state.",
        'Current preference: "Previous Course"; version 1',
        'Target Course: "Target Course"',
        "Target versions: Course 1; selection 1",
        'Working View: "Target View"; version 2',
        "Working Revision: present; version 3",
      ],
    })
    expect(permissionConstraint(projected)).toEqual({ onceOnly: true, rejectOnly: false, exactReply: false })

    const missing = req({ permission: "set_default_course_preference", metadata: { onceOnly: true } })
    expect(permissionInfo(missing)).toMatchObject({ title: "Permission scope unavailable" })
    expect(permissionConstraint(missing)).toEqual({ onceOnly: true, rejectOnly: true, exactReply: false })
    expect(permissionOptions("permission", true, true)).toEqual(["reject"])
    const state = createPermissionBodyState(missing.id)
    expect(permissionRun(state, missing.id, "once", true, true)).toEqual({ state })
  })

  test("formats always-allow copy for wildcard and explicit patterns", () => {
    expect(permissionAlwaysLines(req({ permission: "bash", always: ["*"] }))).toEqual([
      "This will allow bash until Repa is restarted.",
    ])

    expect(permissionAlwaysLines(req({ always: ["src/**/*.ts", "src/**/*.tsx"] }))).toEqual([
      "This will allow the following patterns until Repa is restarted.",
      "- src/**/*.ts",
      "- src/**/*.tsx",
    ])
  })
})
