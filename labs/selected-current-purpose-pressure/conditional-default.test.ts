import { describe, expect, test } from "bun:test"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import {
  CONDITIONAL_DEFAULT_MARKER,
  injectConditionalDefault,
} from "./conditional-default"
import {
  conditionalDefaultScenarios,
  inspectConditionalDefaultOutcome,
  validateConditionalDefaultProtocol,
} from "./conditional-default-protocol"

describe("ALS-022D conditional Agenda default", () => {
  test("freezes five Agenda-present contrasts", () => {
    expect(validateConditionalDefaultProtocol()).toBeUndefined()
    expect(conditionalDefaultScenarios).toHaveLength(5)
  })

  test("injects one conditional default without mutating the original prompt", () => {
    const original: LanguageModelV3CallOptions = {
      prompt: [{ role: "system", content: "production" }],
    }
    const injected = injectConditionalDefault(original)
    expect(original.prompt[0]).toEqual({ role: "system", content: "production" })
    expect(injected.prompt[0]?.role).toBe("system")
    expect(
      injected.prompt[0]?.role === "system" ? injected.prompt[0].content : "",
    ).toContain(CONDITIONAL_DEFAULT_MARKER)
    expect(() => injectConditionalDefault(injected)).toThrow("injected more than once")
  })

  test("keeps prediction, override, completion, and redirect signals distinct", () => {
    expect(
      inspectConditionalDefaultOutcome({
        caseKey: "generic_continue",
        text: "请先预测这段代码的输出是什么？",
        initialStateRevision: 2,
        finalStateRevision: 2,
        initialOpenConcerns: 1,
        finalOpenConcerns: 1,
        toolNames: ["read_current_course_material"],
      }).mechanicallyPassed,
    ).toBeTrue()
    expect(
      inspectConditionalDefaultOutcome({
        caseKey: "completed_occurrence",
        text: "你的判断正确。",
        initialStateRevision: 2,
        finalStateRevision: 3,
        initialOpenConcerns: 1,
        finalOpenConcerns: 0,
        toolNames: ["address_future_attention"],
      }).mechanicallyPassed,
    ).toBeTrue()
    expect(
      inspectConditionalDefaultOutcome({
        caseKey: "learner_redirect",
        text: "你用哪个作业平台？我可以按提交入口梳理步骤。",
        initialStateRevision: 2,
        finalStateRevision: 2,
        initialOpenConcerns: 1,
        finalOpenConcerns: 1,
        toolNames: [],
      }).mechanicallyPassed,
    ).toBeTrue()
  })
})
