import type { ErrorSettlement } from "../learning-command/schema"
import {
  hasShape,
  isID,
  isNonEmptyString,
  isNonNegativeInteger,
  isPositiveInteger,
  isPrefixedString,
  isRecord,
} from "../learning-command/settlement-validation"
import {
  MAX_OPERATIONS,
  type AlreadyAppliedSettlement,
  type AppliedSettlement,
  type NoChangeSettlement,
} from "./schema"
import { isOperationResult } from "./operation-result"

export type GoalSettlement = AppliedSettlement | AlreadyAppliedSettlement | NoChangeSettlement | ErrorSettlement

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
  "inactive",
  "validation_error",
])

export function requireGoalSettlement(value: unknown): GoalSettlement {
  if (!isGoalSettlement(value)) throw new Error("Stored learner Goal settlement is invalid")
  return value
}

export function isGoalSettlement(value: unknown): value is GoalSettlement {
  if (!isRecord(value) || !validMetadata(value)) return false
  if (value.outcome === "error") return isError(value)
  if (value.outcome === "no_change") {
    return (
      hasShape(value, [
        "outcome",
        "goalKind",
        "operations",
        "acknowledgementTitle",
        "acknowledgementBody",
        "settlementTime",
        "settlementOrder",
      ]) &&
      value.goalKind === "learner_goal" &&
      isOperationList(value.operations, true) &&
      isNonEmptyString(value.acknowledgementTitle) &&
      isNonEmptyString(value.acknowledgementBody)
    )
  }
  if (value.outcome !== "applied" && value.outcome !== "already_applied") return false
  const replay = value.outcome === "already_applied"
  const accepted = value.authorizationBasis === "learner_acceptance"
  if (
    !hasShape(value, [
      "outcome",
      "goalKind",
      "receiptID",
      "effectID",
      "authorizationBasis",
      ...(accepted ? ["confirmationRequestID"] : []),
      "operations",
      ...(replay ? ["currentHeads"] : []),
      "acknowledgementTitle",
      "acknowledgementBody",
      "frontierSequence",
      "settlementTime",
      "settlementOrder",
    ]) ||
    value.goalKind !== "learner_goal" ||
    !isID(value.receiptID, "lcr") ||
    !isID(value.effectID, "gle") ||
    !["learner_request", "learner_acceptance"].includes(String(value.authorizationBasis)) ||
    (accepted && !isPrefixedString(value.confirmationRequestID, "per")) ||
    !isOperationList(value.operations, false) ||
    !isNonEmptyString(value.acknowledgementTitle) ||
    !isNonEmptyString(value.acknowledgementBody) ||
    !isPositiveInteger(value.frontierSequence)
  ) {
    return false
  }
  if (!hasChangedOperation(value.operations)) return false
  return !replay || isCurrentHeads(value.currentHeads)
}

function isOperationList(value: unknown, allNoChange: boolean) {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= MAX_OPERATIONS &&
    value.every(
      (operation, ordinal) =>
        isOperationResult(operation) &&
        operation.ordinal === ordinal &&
        (!allNoChange || operation.result === "no_change"),
    )
  )
}

function hasChangedOperation(value: unknown) {
  return Array.isArray(value) && value.some((operation) => isRecord(operation) && operation.result === "changed")
}

function isCurrentHeads(value: unknown) {
  if (
    !Array.isArray(value) ||
    !value.every(
      (head) =>
        isRecord(head) &&
        hasShape(head, ["goalID", "revisionID", "version"]) &&
        isID(head.goalID, "gol") &&
        isID(head.revisionID, "glr") &&
        isPositiveInteger(head.version),
    )
  ) {
    return false
  }
  return new Set(value.map((head) => head.goalID)).size === value.length
}

function isError(value: Record<string, unknown>) {
  if (typeof value.code !== "string" || !errorCodes.has(value.code)) return false
  if (value.code !== "semantic_conflict" || !Object.hasOwn(value, "detail")) {
    return hasShape(value, ["outcome", "code", "settlementTime", "settlementOrder"])
  }
  return (
    hasShape(value, ["outcome", "code", "detail", "settlementTime", "settlementOrder"]) &&
    isRecord(value.detail) &&
    hasShape(value.detail, ["effectID"]) &&
    isID(value.detail.effectID, "gle")
  )
}

function validMetadata(value: Record<string, unknown>) {
  return isNonNegativeInteger(value.settlementTime) && isNonNegativeInteger(value.settlementOrder)
}
