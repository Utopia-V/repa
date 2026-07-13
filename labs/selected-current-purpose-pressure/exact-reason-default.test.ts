import { describe, expect, test } from "bun:test"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import {
  EXACT_REASON_DEFAULT_CONTRIBUTION,
  EXACT_REASON_DEFAULT_MARKER,
  injectExactReasonDefault,
} from "./exact-reason-default"

describe("ALS-022E exact-reason conditional default", () => {
  test("does not restate the independent-prediction rule in the intervention", () => {
    expect(EXACT_REASON_DEFAULT_CONTRIBUTION).not.toMatch(
      /独立预测|决定性提示|先得到答案|alias mutation|unaided prediction|decisive hint/u,
    )
  })

  test("adds only one status contribution without mutating the source prompt", () => {
    const original: LanguageModelV3CallOptions = {
      prompt: [{ role: "system", content: "production with exact Agenda reason" }],
    }
    const injected = injectExactReasonDefault(original)
    expect(original.prompt[0]).toEqual({
      role: "system",
      content: "production with exact Agenda reason",
    })
    expect(injected.prompt[0]?.role).toBe("system")
    expect(
      injected.prompt[0]?.role === "system" ? injected.prompt[0].content : "",
    ).toContain(EXACT_REASON_DEFAULT_MARKER)
    expect(() => injectExactReasonDefault(injected)).toThrow("injected more than once")
  })
})

