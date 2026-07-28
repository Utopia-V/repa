import type { ErrorSettlement } from "../learning-command/schema"
import {
  hasShape,
  isID,
  isNonEmptyString,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
} from "../learning-command/settlement-validation"
import type { AlreadyAppliedSettlement, AppliedSettlement, NoChangeSettlement } from "./schema"

export type RetainedSettlement =
  | AppliedSettlement
  | AlreadyAppliedSettlement
  | NoChangeSettlement
  | ErrorSettlement

const errorCodes = new Set([
  "semantic_conflict",
  "context_refresh_required",
  "permission_rejected",
  "permission_corrected",
  "cancelled",
  "interrupted",
  "source_unavailable",
  "temporal_context_unavailable",
  "capacity_exceeded",
  "outcome_unknown",
  "stale",
  "validation_error",
])

export function requireRetainedSettlement(value: unknown): RetainedSettlement {
  if (!isRetainedSettlement(value)) throw new Error("Stored retained steering settlement is invalid")
  return value
}

export function isRetainedSettlement(value: unknown): value is RetainedSettlement {
  if (!isRecord(value) || !validMetadata(value)) return false
  if (value.outcome === "error") return isError(value)
  if (value.outcome === "no_change") {
    return (
      hasShape(value, [
        "outcome",
        "steeringKind",
        "policyID",
        "version",
        "state",
        "acknowledgementTitle",
        "acknowledgementBody",
        "settlementTime",
        "settlementOrder",
      ]) &&
      value.steeringKind === "retained_steering" &&
      validTransitionProjection(value)
    )
  }
  return (
    (value.outcome === "applied" || value.outcome === "already_applied") &&
    hasShape(value, [
      "outcome",
      "receiptID",
      "effectID",
      "policyID",
      "version",
      "state",
      "acknowledgementTitle",
      "acknowledgementBody",
      "settlementTime",
      "settlementOrder",
    ]) &&
    isID(value.receiptID, "lcr") &&
    isID(value.effectID, "rst") &&
    validTransitionProjection(value)
  )
}

function validTransitionProjection(value: Record<string, unknown>) {
  return (
    isID(value.policyID, "rsp") &&
    isPositiveInteger(value.version) &&
    (value.state === "operative" || value.state === "retracted") &&
    isNonEmptyString(value.acknowledgementTitle) &&
    isNonEmptyString(value.acknowledgementBody)
  )
}

function isError(value: Record<string, unknown>) {
  if (typeof value.code !== "string" || !errorCodes.has(value.code)) return false
  if (value.code !== "semantic_conflict") {
    return hasShape(value, ["outcome", "code", "settlementTime", "settlementOrder"])
  }
  return (
    hasShape(value, ["outcome", "code", "detail", "settlementTime", "settlementOrder"]) &&
    isRecord(value.detail) &&
    hasShape(value.detail, ["effectID"]) &&
    isID(value.detail.effectID, "rst")
  )
}

function validMetadata(value: Record<string, unknown>) {
  return isNonNegativeInteger(value.settlementTime) && isNonNegativeInteger(value.settlementOrder)
}
