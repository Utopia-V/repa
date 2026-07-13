import { expect, test } from "bun:test"
import { removeProjectCopyAfterLeavingCurrent } from "../../src/component/dialog-move-session"

test("activates the main directory before removing the active project copy", async () => {
  const calls: string[] = []

  const result = await removeProjectCopyAfterLeavingCurrent({
    current: true,
    mainDirectory: "C:\\learning\\course",
    async activateMain(directory) {
      calls.push(`activate:${directory}`)
      await Promise.resolve()
      calls.push("activated")
    },
    async remove() {
      calls.push("remove")
      return "removed"
    },
  })

  expect(result).toBe("removed")
  expect(calls).toEqual([
    "activate:C:\\learning\\course",
    "activated",
    "remove",
  ])
})

test("refuses to remove the active project copy without a main directory", async () => {
  let removed = false

  await expect(
    removeProjectCopyAfterLeavingCurrent({
      current: true,
      async activateMain() {},
      async remove() {
        removed = true
      },
    }),
  ).rejects.toThrow("without a main directory")

  expect(removed).toBe(false)
})

test("does not remove the active project copy when main-directory activation fails", async () => {
  let removed = false

  await expect(
    removeProjectCopyAfterLeavingCurrent({
      current: true,
      mainDirectory: "C:\\learning\\course",
      async activateMain() {
        throw new Error("main directory unavailable")
      },
      async remove() {
        removed = true
      },
    }),
  ).rejects.toThrow("main directory unavailable")

  expect(removed).toBe(false)
})
