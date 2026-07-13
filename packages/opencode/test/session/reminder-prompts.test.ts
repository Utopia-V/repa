import { describe, expect, test } from "bun:test"
import PLAN from "@/session/prompt/plan.txt"
import PLAN_MODE from "@/session/prompt/plan-mode.txt"
import REPA_SWITCH from "@/session/prompt/repa-switch.txt"
import PLAN_EXIT from "@/tool/plan-exit.txt"

describe("learning-first planning reminders", () => {
  test("planning is one read-only policy profile, not a coding workflow", () => {
    for (const prompt of [PLAN, PLAN_MODE]) {
      expect(prompt).toContain("planning policy profile")
      expect(prompt).toContain("current request")
      expect(prompt).not.toMatch(/codebase|software engineering|implementation plan|build agent/i)
      expect(prompt).not.toMatch(/Launch up to 3|always call|MUST.*agent/i)
    }
  })

  test("delegation and questions remain conditional", () => {
    expect(PLAN_MODE).toContain("Delegate only when")
    expect(PLAN_MODE).toContain("Ask the learner only when")
    expect(PLAN_MODE).toContain("expensive-to-reverse")
  })

  test("exiting planning returns to the Repa profile", () => {
    expect(REPA_SWITCH).toContain("Repa profile")
    expect(REPA_SWITCH).not.toMatch(/build agent/i)
    expect(PLAN_EXIT).toContain("Repa profile")
    expect(PLAN_EXIT).not.toMatch(/build agent/i)
  })
})
