import { expect, test } from "bun:test"
import PROMPT_INITIALIZE from "@/command/template/initialize.txt"

test("the active init template identifies Repa and its config", () => {
  expect(PROMPT_INITIALIZE).toContain("future Repa sessions")
  expect(PROMPT_INITIALIZE).toContain("`repa.json`")
  expect(PROMPT_INITIALIZE).not.toMatch(/OpenCode|opencode\.json/)
})
