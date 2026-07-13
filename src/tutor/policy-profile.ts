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
 * Current production Tutor semantics. Bump this when model-visible defaults
 * or capability-selection meaning changes. The older DEFAULT-named export
 * remains pinned by ALS-021 and must not silently change historical provider
 * inputs.
 */
export const CURRENT_TUTOR_POLICY_PROFILE_REVISION = "tutor-default-v3"

export function enablesConditionalFutureAttention(revision: string) {
  return revision === CURRENT_TUTOR_POLICY_PROFILE_REVISION
}
