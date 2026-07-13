/**
 * Frozen ALS-021 Tutor policy identity. The legacy DEFAULT-named export stays
 * stable for that protocol and older tests; production entry points use the
 * CURRENT-named revision below.
 *
 * Generic runtime and Interaction boundaries still accept an explicitly
 * selected revision and do not import either named production constant.
 */
export const DEFAULT_TUTOR_POLICY_PROFILE_REVISION = "tutor-default-v2"

/**
 * First production revision that exposes the conditional current-purpose
 * contract. Keep this identity stable after CURRENT advances.
 */
export const CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION = "tutor-default-v3"

/**
 * Withdrawn historical candidate that exposes the Proposal 0006 Assignment
 * experiment. It cannot become CURRENT by passing the old out-of-scope scenario
 * qualification; keep it explicit only while its reusable mechanics and
 * deletion boundary are audited.
 */
export const ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION = "tutor-default-v4"

/**
 * Current production Tutor semantics. Bump this when model-visible defaults
 * or capability-selection meaning changes. The older DEFAULT-named export
 * remains pinned by ALS-021 and must not silently change historical provider
 * inputs.
 */
export const CURRENT_TUTOR_POLICY_PROFILE_REVISION =
  CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION

export function enablesConditionalFutureAttention(revision: string) {
  return revision === CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION ||
    revision === ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION
}

export function enablesAssignments(revision: string) {
  return revision === ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION
}
