import { describe, expect, test } from "bun:test"
import { resolveRunMessage } from "@/cli/cmd/run"

describe("run input projection", () => {
  test("preserves an ordinary learner message without materializing shell quotes", () => {
    expect(resolveRunMessage(["Reply exactly G18-CARRIER-DIRECT-ACK. Do not call tools."], undefined, false)).toBe(
      "Reply exactly G18-CARRIER-DIRECT-ACK. Do not call tools.",
    )
    expect(resolveRunMessage(["one", "two words"], undefined, false)).toBe("one two words")
  })

  test("retains argument grouping only for command-template expansion", () => {
    expect(resolveRunMessage(["one", "two words"], undefined, true)).toBe('one "two words"')
    expect(resolveRunMessage(['a "quoted" value'], undefined, true)).toBe('"a \\"quoted\\" value"')
  })

  test("appends piped input without changing the selected argument projection", () => {
    expect(resolveRunMessage(["learner message"], "piped detail", false)).toBe("learner message\npiped detail")
    expect(resolveRunMessage(["command argument"], "piped detail", true)).toBe(
      '"command argument"\npiped detail',
    )
  })
})
