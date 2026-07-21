import { describe, expect, test } from "bun:test"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import {
  createPermissionBodyState,
  permissionAlwaysLines,
  permissionCancel,
  permissionEscape,
  permissionInfo,
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

    expect(permissionEscape(createPermissionBodyState("perm-1"))).toMatchObject({
      stage: "reject",
      selected: "reject",
    })

    expect(permissionEscape({ ...next.state, stage: "always", selected: "confirm" })).toMatchObject({
      stage: "permission",
      selected: "always",
    })
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

  test("shows the exact once-only default Course preference state", () => {
    const target = {
      courseID: "crs_target",
      courseTitle: "Target Course",
      courseVersion: 4,
      selectionRevisionID: "rev_target",
      selectionVersion: 3,
      viewID: "view_target",
      viewName: "Target View",
      viewVersion: 2,
      revisionVersion: 1,
    }
    expect(
      permissionInfo(
        req({
          permission: "set_default_course_preference",
          metadata: {
            onceOnly: true,
            confirmation: {
              permissionRequestID: "perm-set",
              headID: null,
              version: 0,
              fromCourseID: null,
              fromCourseTitle: null,
              target,
            },
          },
        }),
      ),
    ).toEqual({
      icon: "◇",
      title: "Confirm setting the default Course preference",
      lines: [
        "Current preference: version 0; head none",
        "From Course: none",
        'To Course: "Target Course" [crs_target]',
        "Target Course version: 4; selection version: 3",
        'Working View: "Target View" [view_target]; version 2',
        "Working Revision: rev_target; version 1",
      ],
    })

    expect(
      permissionInfo(
        req({
          permission: "set_default_course_preference",
          metadata: {
            onceOnly: true,
            confirmation: {
              permissionRequestID: "perm-change",
              headID: "ndp_previous",
              version: 7,
              fromCourseID: "crs_previous",
              fromCourseTitle: "Previous Course",
              target,
            },
          },
        }),
      ).lines,
    ).toEqual([
      "Current preference: version 7; head ndp_previous",
      'From Course: "Previous Course" [crs_previous]',
      'To Course: "Target Course" [crs_target]',
      "Target Course version: 4; selection version: 3",
      'Working View: "Target View" [view_target]; version 2',
      "Working Revision: rev_target; version 1",
    ])

    expect(
      permissionInfo(
        req({
          permission: "set_default_course_preference",
          metadata: {
            onceOnly: true,
            confirmation: {
              permissionRequestID: "perm-clear",
              headID: "ndp_current",
              version: 2,
              fromCourseID: "crs_current",
              fromCourseTitle: "Current Course",
              target: null,
            },
          },
        }),
      ),
    ).toEqual({
      icon: "◇",
      title: "Confirm clearing the default Course preference",
      lines: [
        "Current preference: version 2; head ndp_current",
        'From Course: "Current Course" [crs_current]',
        "To Course: none (clear the preference)",
      ],
    })

    const withoutWorkingView = permissionInfo(
      req({
        permission: "set_default_course_preference",
        metadata: {
          onceOnly: true,
          confirmation: {
            permissionRequestID: "perm-no-view",
            headID: null,
            version: 0,
            fromCourseID: null,
            fromCourseTitle: null,
            target: {
              courseID: "crs_no_view",
              courseTitle: "N".repeat(120),
              courseVersion: 0,
              selectionRevisionID: null,
              selectionVersion: 0,
              viewID: null,
              viewName: null,
              viewVersion: null,
              revisionVersion: null,
            },
          },
        },
      }),
    )
    expect(withoutWorkingView.lines.slice(-2)).toEqual(["Working View: none", "Working Revision: none"])
    expect(withoutWorkingView.lines[2]).toContain("[crs_no_view]")
    expect(withoutWorkingView.lines[2]).not.toContain("N".repeat(120))
  })

  test("shows the complete once-only learner Goal candidate", () => {
    const confirmation = {
      schemaVersion: 1,
      authorizationBasis: "learner_acceptance",
      semanticFingerprint: "a".repeat(64),
      command: {
        operations: [
          {
            type: "create",
            snapshot: {
              outcome: "Pass the operating-systems exam",
              conditions: ["Explain virtual memory without notes"],
              scope: {
                type: "courses",
                courses: [{ courseID: "crs_os", basis: { type: "new", expectedCourseVersion: 7 } }],
              },
              target: {
                type: "local_date",
                date: "2026-09-01",
                timeZone: "Asia/Shanghai",
                sourceExpression: "before the September exam",
                normalizationBasis: "source_temporal_context",
              },
              fieldBases: {
                outcome: { type: "authored", sourceExcerpt: "pass my operating-systems exam" },
                conditions: { type: "accepted" },
                scope: { type: "accepted" },
                target: { type: "accepted" },
                disposition: { type: "accepted" },
              },
            },
            disposition: "active",
          },
        ],
      },
      goalBases: [],
      courseBases: [
        {
          courseID: "crs_os",
          courseTitle: "Operating Systems",
          operationOrdinal: 0,
          revisionRole: "source",
          admission: { type: "new", courseVersion: 7, courseTimeUpdated: 1_774_000_000_000 },
          availability: { state: "available", title: "Operating Systems" },
        },
      ],
    }
    const info = permissionInfo(
      req({
        permission: "update_learner_goals",
        metadata: { onceOnly: true, confirmation },
      }),
    )

    expect(info.title).toBe("Confirm 1 durable learner Goal change")
    expect(info.lines.join("\n")).toContain("one-time learner acceptance")
    expect(info.lines.join("\n")).toContain('"Pass the operating-systems exam"')
    expect(info.lines.join("\n")).toContain('"Explain virtual memory without notes"')
    expect(info.lines.join("\n")).toContain('"crs_os"')
    expect(info.lines.join("\n")).toContain('"2026-09-01"')
    expect(info.lines.join("\n")).toContain('"authored"')
    expect(info.lines.join("\n")).toContain('"active"')
    expect(info.lines.join("\n")).toContain("durable, correctable Goal state")

    const direct = permissionInfo(
      req({
        permission: "update_learner_goals",
        metadata: {
          authorizationBasis: "learner_request",
          command: confirmation.command,
        },
      }),
    )
    expect(direct.title).toBe("Allow 1 direct learner Goal change")
    expect(direct.lines.join("\n")).toContain('"Pass the operating-systems exam"')
    expect(direct.lines.join("\n")).toContain("learner-authored request")
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
