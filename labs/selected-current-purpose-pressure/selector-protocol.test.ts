import { describe, expect, test } from "bun:test"
import {
  assessSelectorOutput,
  renderSelectorScenario,
  selectorScenarios,
  validateSelectorProtocol,
} from "./selector-protocol"

describe("ALS-022B selector protocol", () => {
  test("has unique, internally legal scenario oracles", () => {
    expect(validateSelectorProtocol()).toBeUndefined()
    expect(selectorScenarios).toHaveLength(11)
  })

  test("does not render hidden expected decisions into model input", () => {
    for (const scenario of selectorScenarios) {
      const rendered = renderSelectorScenario(scenario)
      expect(rendered).toContain(scenario.learnerText)
      expect(rendered).not.toContain(scenario.why)
    }
  })

  test("requires the independent before-answer constraint when adopted", () => {
    const scenario = selectorScenarios.find(
      (item) => item.id === "generic_continue_independent",
    )!
    expect(
      assessSelectorOutput(scenario, {
        decision: "adopt",
        concernId: "concern:independent",
        operativePurpose: "先让学习者独立预测别名修改结果",
        learnerRoleConstraint: "学习者回答前不提供答案或提示",
        basis: "唯一候选与继续请求相容",
      }).passed,
    ).toBeTrue()
    expect(
      assessSelectorOutput(scenario, {
        decision: "adopt",
        concernId: "concern:independent",
        operativePurpose: "继续对象身份",
        learnerRoleConstraint: null,
        basis: "主题相同",
      }).passed,
    ).toBeFalse()
  })

  test("none requires all selection fields to be null", () => {
    const scenario = selectorScenarios.find(
      (item) => item.id === "deadline_direct_answer",
    )!
    expect(
      assessSelectorOutput(scenario, {
        decision: "none",
        concernId: null,
        operativePurpose: null,
        learnerRoleConstraint: null,
        basis: "当前直接请求优先",
      }).passed,
    ).toBeTrue()
    expect(
      assessSelectorOutput(scenario, {
        decision: "none",
        concernId: "concern:independent",
        operativePurpose: null,
        learnerRoleConstraint: null,
        basis: "当前直接请求优先",
      }).passed,
    ).toBeFalse()
  })
})

