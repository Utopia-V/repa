import {
  MAX_CONDITIONS,
  MAX_COURSES,
  MAX_OPERATIONS,
  type OperationResult,
  type Target,
} from "./schema"
import {
  hasShape,
  isID,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
} from "../learning-command/settlement-validation"

export function isOperationResult(value: unknown): value is OperationResult {
  if (!isRecord(value)) return false
  const replacement = Object.hasOwn(value, "replacementTarget")
  if (
    !hasShape(
      value,
      [
        "ordinal",
        "operation",
        "result",
        "goalID",
        "revisionID",
        "version",
        "disposition",
        "meaning",
        ...(replacement ? ["replacementTarget"] : []),
      ],
    ) ||
    !isNonNegativeInteger(value.ordinal) ||
    Number(value.ordinal) >= MAX_OPERATIONS ||
    !["create", "update", "replace"].includes(String(value.operation)) ||
    !["changed", "no_change"].includes(String(value.result)) ||
    !isID(value.goalID, "gol") ||
    !isID(value.revisionID, "glr") ||
    !isPositiveInteger(value.version) ||
    !["active", "achieved", "abandoned", "superseded"].includes(String(value.disposition)) ||
    !isOperationMeaning(value.meaning)
  ) {
    return false
  }
  if (value.operation === "create") {
    return value.result === "changed" && value.disposition !== "superseded" && !replacement
  }
  if (value.operation === "update") return !replacement
  if (value.result !== "changed" || value.disposition !== "superseded" || !replacement) return false
  return (
    isRecord(value.replacementTarget) &&
    hasShape(value.replacementTarget, ["type", "goalID", "revisionID", "version"]) &&
    ["existing", "new"].includes(String(value.replacementTarget.type)) &&
    isID(value.replacementTarget.goalID, "gol") &&
    isID(value.replacementTarget.revisionID, "glr") &&
    isPositiveInteger(value.replacementTarget.version)
  )
}

export function isOperationMeaning(value: unknown): value is OperationResult["meaning"] {
  if (
    !isRecord(value) ||
    !hasShape(value, ["outcome", "conditions", "scope", "target"]) ||
    typeof value.outcome !== "string" ||
    value.outcome.trim().length === 0 ||
    !Array.isArray(value.conditions) ||
    value.conditions.length > MAX_CONDITIONS ||
    value.conditions.some((condition) => typeof condition !== "string") ||
    new Set(value.conditions).size !== value.conditions.length ||
    !isRecord(value.scope) ||
    !isRecord(value.target)
  ) {
    return false
  }
  const scope =
    value.scope.type === "learner_home"
      ? hasShape(value.scope, ["type"])
      : value.scope.type === "courses" &&
        hasShape(value.scope, ["type", "courseIDs"]) &&
        Array.isArray(value.scope.courseIDs) &&
        value.scope.courseIDs.length >= 1 &&
        value.scope.courseIDs.length <= MAX_COURSES &&
        value.scope.courseIDs.every((courseID) => isID(courseID, "crs")) &&
        new Set(value.scope.courseIDs).size === value.scope.courseIDs.length
  return scope && isTarget(value.target)
}

function isTarget(value: Record<string, unknown>): value is Target {
  if (value.type === "absent") return hasShape(value, ["type"])
  if (value.type === "local_date") {
    return (
      hasShape(value, ["type", "date", "timeZone", "sourceExpression", "normalizationBasis"]) &&
      validDate(value.date) &&
      typeof value.timeZone === "string" &&
      value.timeZone.length > 0 &&
      typeof value.sourceExpression === "string" &&
      value.sourceExpression.trim().length > 0 &&
      ["explicit_date", "source_temporal_context"].includes(String(value.normalizationBasis))
    )
  }
  if (value.type !== "instant") return false
  return (
    hasShape(value, ["type", "instant", "sourceExpression", "normalized", "utcOffsetMinutes", "normalizationBasis"]) &&
    isNonNegativeInteger(value.instant) &&
    typeof value.sourceExpression === "string" &&
    value.sourceExpression.trim().length > 0 &&
    typeof value.normalized === "string" &&
    value.normalized.trim().length > 0 &&
    Date.parse(value.normalized) === value.instant &&
    Number.isInteger(value.utcOffsetMinutes) &&
    Number(value.utcOffsetMinutes) >= -840 &&
    Number(value.utcOffsetMinutes) <= 840 &&
    value.normalizationBasis === "explicit_offset"
  )
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}
