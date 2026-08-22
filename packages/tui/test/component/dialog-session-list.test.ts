import { describe, expect, test } from "bun:test"
import {
  createSessionDeletionProposalView,
  createDialogSessionListQuery,
  loadDialogSessionList,
  selectDialogSessionList,
  sessionDeletionModeOptions,
} from "../../src/component/dialog-session-list"

describe("dialog session list", () => {
  test("requires an explicit learner choice between the two deletion behaviors", () => {
    expect(sessionDeletionModeOptions).toEqual([
      {
        title: "Delete bodies; keep minimal inspection lineage",
        value: "minimal_audit",
        description: "Retains a body-free, non-causal audit until you purge it",
      },
      {
        title: "Delete bodies and inspection lineage",
        value: "full",
        description: "Only the immutable deletion-control receipt remains",
      },
    ])
    expect(sessionDeletionModeOptions.every((option) => !("default" in option))).toBe(true)
  })

  test("renders the selected mode and exact root-descendant closure before confirmation", () => {
    expect(
      createSessionDeletionProposalView({
        rootSessionID: "ses_root",
        subtreeCount: 3,
        subtreeFingerprint: "f".repeat(64),
        mode: "minimal_audit",
        targets: [
          { sessionID: "ses_root", parentSessionID: null },
          { sessionID: "ses_child_a", parentSessionID: "ses_root" },
          { sessionID: "ses_child_b", parentSessionID: "ses_root" },
        ],
      }),
    ).toEqual({
      title: "Confirm deletion of 3 Sessions",
      mode: "delete bodies; keep minimal inspection lineage",
      targets: [
        {
          title: "ses_root",
          value: "ses_root",
          description: "root",
          details: ["no parent"],
        },
        {
          title: "ses_child_a",
          value: "ses_child_a",
          description: "descendant",
          details: ["parent ses_root"],
        },
        {
          title: "ses_child_b",
          value: "ses_child_b",
          description: "descendant",
          details: ["parent ses_root"],
        },
      ],
      footer: [
        "Mode: delete bodies; keep minimal inspection lineage",
        "Root: ses_root",
        `Scope fingerprint: ${"f".repeat(64)}`,
        "Local export files are outside this deletion and are not removed.",
      ],
    })
  })

  test("routes the default browse list through the active directory", () => {
    expect(
      createDialogSessionListQuery({ directory: "/tmp/learning/course-b", filter: { path: "packages/tui" } }),
    ).toEqual({
      directory: "/tmp/learning/course-b",
      roots: true,
      limit: 100,
      path: "packages/tui",
    })
  })

  test("routes search results through the active directory", () => {
    expect(
      createDialogSessionListQuery({
        directory: "/tmp/learning/course-b",
        search: " deploy ",
        filter: { scope: "project" },
      }),
    ).toEqual({
      directory: "/tmp/learning/course-b",
      roots: true,
      limit: 30,
      search: "deploy",
      scope: "project",
    })
  })

  test("does not reuse a previous directory result while the active directory is loading", () => {
    expect(
      selectDialogSessionList({
        directory: "/tmp/learning/course-b",
        browse: { directory: "/tmp/learning/course-a", data: ["session-a"] },
        fallback: { directory: "/tmp/learning/course-a", data: ["cached-a"] },
      }),
    ).toEqual([])

    expect(
      selectDialogSessionList({
        directory: "/tmp/learning/course-b",
        browse: { directory: "/tmp/learning/course-b" },
        fallback: { directory: "/tmp/learning/course-b", data: ["cached-b"] },
      }),
    ).toEqual(["cached-b"])
  })

  test("keeps the cache usable while the root request is pending", async () => {
    let resolve!: (result: { data: string[] }) => void
    const pending = loadDialogSessionList<string>({
      directory: "/tmp/learning/course",
      filter: {},
      list: () => new Promise((done) => (resolve = done)),
    })

    expect(await Promise.race([pending, Promise.resolve("pending")])).toBe("pending")
    resolve({ data: ["root"] })
    expect(await pending).toEqual(["root"])
  })

  test("falls back when the root request returns an error response", async () => {
    expect(
      await loadDialogSessionList({ directory: "/tmp/learning/course", filter: {}, list: async () => ({}) }),
    ).toBeUndefined()
  })

  test("falls back when the root request rejects", async () => {
    expect(
      await loadDialogSessionList({
        directory: "/tmp/learning/course",
        filter: {},
        list: () => Promise.reject(new Error("offline")),
      }),
    ).toBeUndefined()
  })
})
