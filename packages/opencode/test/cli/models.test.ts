import { expect, test } from "bun:test"
import { sortProviderIDs } from "@/cli/cmd/models"

test("model listing uses neutral provider id ordering", () => {
  expect(sortProviderIDs(["opencode", "beta", "opencode-local", "alpha"])).toEqual([
    "alpha",
    "beta",
    "opencode",
    "opencode-local",
  ])
})
