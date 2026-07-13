import { describe, expect, test } from "bun:test"
import {
  ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
  CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
  CURRENT_TUTOR_POLICY_PROFILE_REVISION,
  DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
  enablesAssignments,
  enablesConditionalFutureAttention,
} from "../src/tutor/policy-profile"

describe("Tutor policy profile identities", () => {
  test("v2 and v3 stay immutable while v4 adds Assignment without losing conditional purpose", () => {
    expect(DEFAULT_TUTOR_POLICY_PROFILE_REVISION).toBe("tutor-default-v2")
    expect(CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION).toBe("tutor-default-v3")
    expect(ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION).toBe("tutor-default-v4")
    expect(CURRENT_TUTOR_POLICY_PROFILE_REVISION).toBe(
      CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
    )

    expect(enablesConditionalFutureAttention(DEFAULT_TUTOR_POLICY_PROFILE_REVISION)).toBeFalse()
    expect(enablesConditionalFutureAttention(
      CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
    )).toBeTrue()
    expect(enablesConditionalFutureAttention(ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION)).toBeTrue()

    expect(enablesAssignments(DEFAULT_TUTOR_POLICY_PROFILE_REVISION)).toBeFalse()
    expect(enablesAssignments(CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION)).toBeFalse()
    expect(enablesAssignments(ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION)).toBeTrue()
  })
})
