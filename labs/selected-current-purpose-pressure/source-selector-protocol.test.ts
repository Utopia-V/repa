import { describe, expect, test } from "bun:test"
import {
  admitGoverningSource,
  assessSourceSelectorOutput,
  renderSourceSelectorScenario,
  sourceSelectorScenarios,
  validateSourceSelectorProtocol,
} from "./source-selector-protocol"

describe("ALS-022C governing-source protocol", () => {
  test("filters illegal options and has valid exact-source oracles", () => {
    expect(validateSourceSelectorProtocol()).toBeUndefined()
    expect(sourceSelectorScenarios).toHaveLength(9)
    for (const scenario of sourceSelectorScenarios) {
      expect(
        scenario.candidates.every(
          (candidate) =>
            candidate.eligibility === "eligible" &&
            candidate.targetState === "current_view",
        ),
      ).toBeTrue()
    }
  })

  test("binds exact source meaning rather than model-authored replacement text", () => {
    const scenario = sourceSelectorScenarios.find(
      (item) => item.id === "generic_continue_independent",
    )!
    const result = admitGoverningSource(scenario, {
      governingSource: "agenda_candidate",
      concernId: "concern:independent",
      basis: "the generic request needs this purpose",
    })
    expect(result).toEqual({
      accepted: true,
      selection: {
        kind: "agenda_candidate",
        concernId: "concern:independent",
        exactReason:
          "回来时检查学习者能否在不先得到答案或决定性提示的情况下，独立预测别名修改的结果。",
      },
    })
  })

  test("does not allow current request to borrow Agenda provenance", () => {
    const scenario = sourceSelectorScenarios.find(
      (item) => item.id === "deadline_direct_answer",
    )!
    expect(
      admitGoverningSource(scenario, {
        governingSource: "current_request",
        concernId: "concern:independent",
        basis: "direct answer",
      }),
    ).toEqual({
      accepted: false,
      reason: "current_request cannot borrow concern provenance",
    })
  })

  test("scores source, identity, field consistency, and local admission", () => {
    const scenario = sourceSelectorScenarios.find(
      (item) => item.id === "multiple_ambiguous",
    )!
    expect(
      assessSourceSelectorOutput(scenario, {
        governingSource: "unresolved",
        concernId: null,
        basis: "three materially different purposes remain",
      }).passed,
    ).toBeTrue()
    expect(
      assessSourceSelectorOutput(scenario, {
        governingSource: "agenda_candidate",
        concernId: "concern:repair",
        basis: "pick one",
      }).passed,
    ).toBeFalse()
  })

  test("does not render hidden expected sources", () => {
    for (const scenario of sourceSelectorScenarios) {
      const rendered = renderSourceSelectorScenario(scenario)
      expect(rendered).toContain(scenario.learnerText)
      expect(rendered).not.toContain(
        `"governingSource":"${scenario.expected.governingSource}"`,
      )
    }
  })
})

