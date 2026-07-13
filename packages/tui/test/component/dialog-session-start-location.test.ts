import { expect, test } from "bun:test"
import { removeProjectCopyAfterLeavingCurrent } from "../../src/component/dialog-move-session"

test("leaves the active project copy before issuing its removal", async () => {
  const calls: string[] = []

  const result = await removeProjectCopyAfterLeavingCurrent({
    current: true,
    mainDirectory: "C:\\learning\\course",
    async switchToMain(directory) {
      calls.push(`switch:${directory}`)
      await Promise.resolve()
      calls.push("switched")
    },
    async remove() {
      calls.push("remove")
      return "removed"
    },
  })

  expect(result).toBe("removed")
  expect(calls).toEqual(["switch:C:\\learning\\course", "switched", "remove"])
})

test("refuses to remove the active project copy without a main directory", async () => {
  let removed = false

  await expect(
    removeProjectCopyAfterLeavingCurrent({
      current: true,
      async switchToMain() {},
      async remove() {
        removed = true
      },
    }),
  ).rejects.toThrow("without a main directory")

  expect(removed).toBe(false)
})

test("does not remove the active project copy when switching to main fails", async () => {
  let removed = false

  await expect(
    removeProjectCopyAfterLeavingCurrent({
      current: true,
      mainDirectory: "C:\\learning\\course",
      async switchToMain() {
        throw new Error("main directory unavailable")
      },
      async remove() {
        removed = true
      },
    }),
  ).rejects.toThrow("main directory unavailable")

  expect(removed).toBe(false)
})
