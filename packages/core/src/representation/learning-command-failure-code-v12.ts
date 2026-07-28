export const representationFailureCodesV12 = [
  "semantic_conflict",
  "context_refresh_required",
  "permission_rejected",
  "permission_corrected",
  "cancelled",
  "interrupted",
  "source_unavailable",
  "ambiguous_content_root",
  "unsupported_source",
  "source_too_large",
  "producer_unavailable",
  "producer_failed",
  "producer_timeout",
  "invalid_producer_output",
  "publication_failed",
  "outcome_unknown",
  "stale",
  "inactive",
  "validation_error",
] as const

export type RepresentationFailureCode = (typeof representationFailureCodesV12)[number]

export const representationFailureCodeSQLV12 = representationFailureCodesV12
  .map((code) => `'${code.replaceAll("'", "''")}'`)
  .join(",\n          ")
