import { describe, expect, test } from "bun:test"
import {
  createDialogSessionListQuery,
  loadDialogSessionList,
  selectDialogSessionList,
} from "../../src/component/dialog-session-list"

describe("dialog session list", () => {
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
