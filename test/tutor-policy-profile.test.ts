import { describe, expect, test } from "bun:test"
import {
  CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
  CURRENT_TUTOR_POLICY_PROFILE_REVISION,
  DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
  enablesConditionalFutureAttention,
} from "../src/tutor/policy-profile"

describe("Tutor policy profile identities", () => {
  test("v2 and v3 stay immutable while current remains on the accepted v3 policy", () => {
    expect(DEFAULT_TUTOR_POLICY_PROFILE_REVISION).toBe("tutor-default-v2")
    expect(CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION).toBe("tutor-default-v3")
    expect(CURRENT_TUTOR_POLICY_PROFILE_REVISION).toBe(
      CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
    )

    expect(enablesConditionalFutureAttention(DEFAULT_TUTOR_POLICY_PROFILE_REVISION)).toBeFalse()
    expect(enablesConditionalFutureAttention(
      CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
    )).toBeTrue()
    expect(enablesConditionalFutureAttention("tutor-default-v4")).toBeFalse()
  })
})
