import type { AlreadyAppliedSettlement, AppliedSettlement, ErrorSettlement } from "../learning-command/schema"
import {
  hasShape,
  isID,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from "../learning-command/settlement-validation"

export type CourseSettlement = AppliedSettlement | AlreadyAppliedSettlement | ErrorSettlement

const errorCodes = new Set([
  "semantic_conflict",
  "context_refresh_required",
  "permission_rejected",
  "permission_corrected",
  "cancelled",
  "interrupted",
  "source_unavailable",
  "outcome_unknown",
  "stale",
  "inactive",
  "validation_error",
])

export function requireCourseSettlement(value: unknown): CourseSettlement {
  if (!isCourseSettlement(value)) throw new Error("Stored Course learning settlement is invalid")
  return value
}

export function isCourseSettlement(value: unknown): value is CourseSettlement {
  if (!isRecord(value) || !validMetadata(value)) return false
  if (value.outcome === "error") return isError(value)
  if (value.outcome !== "applied" && value.outcome !== "already_applied") return false
  const replay = value.outcome === "already_applied"
  return (
    hasShape(value, [
      "outcome",
      "receiptID",
      "effectID",
      "courseID",
      "revisionID",
      "previousSelection",
      "committedSelection",
      ...(replay ? ["currentSelection", "relation"] : []),
      "settlementTime",
      "settlementOrder",
    ]) &&
    isID(value.receiptID, "lcr") &&
    isID(value.effectID, "cse") &&
    isID(value.courseID, "crs") &&
    isID(value.revisionID, "cvr") &&
    isSelection(value.previousSelection) &&
    isSelection(value.committedSelection) &&
    (!replay ||
      (isSelection(value.currentSelection) &&
        (value.relation === "active" || value.relation === "superseded")))
  )
}

function isSelection(value: unknown) {
  if (!isRecord(value)) return false
  const revision = Object.hasOwn(value, "revisionID")
  return (
    hasShape(value, ["version", ...(revision ? ["revisionID"] : [])]) &&
    isNonNegativeInteger(value.version) &&
    (!revision || isID(value.revisionID, "cvr"))
  )
}

function isError(value: Record<string, unknown>) {
  if (typeof value.code !== "string" || !errorCodes.has(value.code)) return false
  if (value.code === "semantic_conflict") {
    return (
      hasShape(value, ["outcome", "code", "detail", "settlementTime", "settlementOrder"]) &&
      isRecord(value.detail) &&
      hasShape(value.detail, ["effectID", "acceptedRevisionID"]) &&
      isID(value.detail.effectID, "cse") &&
      isID(value.detail.acceptedRevisionID, "cvr")
    )
  }
  if (value.code === "stale" || value.code === "inactive") {
    return (
      hasShape(value, ["outcome", "code", "detail", "settlementTime", "settlementOrder"]) &&
      isRecord(value.detail) &&
      hasShape(value.detail, ["entity", "id"]) &&
      ["course", "view", "revision", "selection"].includes(String(value.detail.entity)) &&
      isNonEmptyString(value.detail.id)
    )
  }
  return hasShape(value, ["outcome", "code", "settlementTime", "settlementOrder"])
}

function validMetadata(value: Record<string, unknown>) {
  return isNonNegativeInteger(value.settlementTime) && isNonNegativeInteger(value.settlementOrder)
}
