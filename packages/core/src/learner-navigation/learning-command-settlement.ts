import type {
  DefaultCourseAlreadyAppliedSettlement,
  DefaultCourseAppliedSettlement,
  ErrorSettlement,
  NavigationNoChangeSettlement,
  RouteAnchorAlreadyAppliedSettlement,
  RouteAnchorAppliedSettlement,
} from "../learning-command/schema"
import {
  hasShape,
  isID,
  isNonNegativeInteger,
  isNullableID,
  isPositiveInteger,
  isPrefixedString,
  isRecord,
} from "../learning-command/settlement-validation"
import type {
  AnchorEffect,
  AnchorProjection,
  DefaultConfirmationSnapshot,
  DefaultEffect,
  DefaultProjection,
  SourceReceipt,
} from "./schema"

export type NavigationSettlement =
  | DefaultCourseAppliedSettlement
  | DefaultCourseAlreadyAppliedSettlement
  | RouteAnchorAppliedSettlement
  | RouteAnchorAlreadyAppliedSettlement
  | NavigationNoChangeSettlement
  | ErrorSettlement

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

export function requireNavigationSettlement(value: unknown): NavigationSettlement {
  if (!isNavigationSettlement(value)) throw new Error("Stored Navigation learning settlement is invalid")
  return value
}

export function isNavigationSettlement(value: unknown): value is NavigationSettlement {
  if (!isRecord(value) || !validMetadata(value)) return false
  if (value.outcome === "error") {
    return (
      hasShape(value, ["outcome", "code", "settlementTime", "settlementOrder"]) &&
      typeof value.code === "string" &&
      errorCodes.has(value.code)
    )
  }
  if (value.outcome === "no_change") {
    return (
      hasShape(value, ["outcome", "navigationKind", "current", "settlementTime", "settlementOrder"]) &&
      ((value.navigationKind === "default_course_preference" && isDefaultProjection(value.current)) ||
        (value.navigationKind === "course_route_anchor" && isAnchorProjection(value.current)))
    )
  }
  if (value.outcome !== "applied" && value.outcome !== "already_applied") return false
  const replay = value.outcome === "already_applied"
  if (value.navigationKind === "default_course_preference") {
    return (
      hasShape(
        value,
        replay
          ? [
              "outcome",
              "navigationKind",
              "receiptID",
              "effectID",
              "effect",
              "current",
              "confirmation",
              "settlementTime",
              "settlementOrder",
              "relation",
            ]
          : [
              "outcome",
              "navigationKind",
              "receiptID",
              "effectID",
              "effect",
              "current",
              "confirmation",
              "settlementTime",
              "settlementOrder",
            ],
      ) &&
      (!replay || value.relation === "active" || value.relation === "superseded") &&
      isID(value.receiptID, "lcr") &&
      isID(value.effectID, "ndp") &&
      isDefaultEffect(value.effect) &&
      value.effectID === value.effect.id &&
      isDefaultProjection(value.current) &&
      isDefaultConfirmation(value.confirmation)
    )
  }
  if (value.navigationKind !== "course_route_anchor") return false
  return (
    hasShape(
      value,
      replay
        ? [
            "outcome",
            "navigationKind",
            "receiptID",
            "effectID",
            "effect",
            "current",
            "settlementTime",
            "settlementOrder",
            "relation",
          ]
        : [
            "outcome",
            "navigationKind",
            "receiptID",
            "effectID",
            "effect",
            "current",
            "settlementTime",
            "settlementOrder",
          ],
    ) &&
    (!replay || value.relation === "active" || value.relation === "superseded") &&
    isID(value.receiptID, "lcr") &&
    isID(value.effectID, "nar") &&
    isAnchorEffect(value.effect) &&
    value.effectID === value.effect.id &&
    isAnchorProjection(value.current)
  )
}

function isDefaultEffect(value: unknown): value is DefaultEffect {
  return (
    isRecord(value) &&
    hasShape(value, [
      "id",
      "occurrenceID",
      "previousCourseID",
      "courseID",
      "previousVersion",
      "version",
      "timeCommitted",
      "commitOrder",
      "frontierSequence",
    ]) &&
    isID(value.id, "ndp") &&
    isID(value.occurrenceID, "lco") &&
    isNullableID(value.previousCourseID, "crs") &&
    isNullableID(value.courseID, "crs") &&
    isNonNegativeInteger(value.previousVersion) &&
    isPositiveInteger(value.version) &&
    Number(value.previousVersion) + 1 === value.version &&
    isNonNegativeInteger(value.timeCommitted) &&
    isNonNegativeInteger(value.commitOrder) &&
    isPositiveInteger(value.frontierSequence)
  )
}

function isAnchorEffect(value: unknown): value is AnchorEffect {
  return (
    isRecord(value) &&
    hasShape(value, [
      "id",
      "occurrenceID",
      "courseID",
      "previousTarget",
      "target",
      "previousVersion",
      "version",
      "timeCommitted",
      "commitOrder",
      "frontierSequence",
    ]) &&
    isID(value.id, "nar") &&
    isID(value.occurrenceID, "lco") &&
    isID(value.courseID, "crs") &&
    (value.previousTarget === null || isMembershipEndpoint(value.previousTarget)) &&
    (value.target === null || isMembershipEndpoint(value.target)) &&
    isNonNegativeInteger(value.previousVersion) &&
    isPositiveInteger(value.version) &&
    Number(value.previousVersion) + 1 === value.version &&
    isNonNegativeInteger(value.timeCommitted) &&
    isNonNegativeInteger(value.commitOrder) &&
    isPositiveInteger(value.frontierSequence)
  )
}

function isDefaultProjection(value: unknown): value is DefaultProjection {
  if (!isRecord(value)) return false
  if (
    !hasShape(
      value,
      ["kind", "headID", "version", "courseID", "usability"],
      ["source", "timeCommitted", "commitOrder", "frontierSequence"],
    ) ||
    value.kind !== "default_course_preference" ||
    !isNullableID(value.headID, "ndp") ||
    !isNonNegativeInteger(value.version) ||
    !isNullableID(value.courseID, "crs") ||
    !isDefaultUsability(value.usability) ||
    (Object.hasOwn(value, "source") && !isSourceReceipt(value.source)) ||
    !optionalNonNegative(value, "timeCommitted") ||
    !optionalNonNegative(value, "commitOrder") ||
    !optionalPositive(value, "frontierSequence")
  ) {
    return false
  }
  const sourceState = projectionSourceState(value)
  if (sourceState === "partial") return false
  if (value.headID === null) {
    return (
      value.version === 0 &&
      value.courseID === null &&
      value.usability.usable === false &&
      value.usability.cause === "absent" &&
      sourceState === "none"
    )
  }
  if (value.version < 1 || sourceState !== "all") return false
  if (value.courseID === null) return value.usability.usable === false && value.usability.cause === "absent"
  return value.usability.usable || value.usability.cause !== "absent"
}

function isAnchorProjection(value: unknown): value is AnchorProjection {
  if (!isRecord(value)) return false
  if (
    !hasShape(
      value,
      ["kind", "courseID", "headID", "version", "target", "usability"],
      ["source", "timeCommitted", "commitOrder", "frontierSequence"],
    ) ||
    value.kind !== "course_route_anchor" ||
    !isID(value.courseID, "crs") ||
    !isNullableID(value.headID, "nar") ||
    !isNonNegativeInteger(value.version) ||
    (value.target !== null && !isMembershipEndpoint(value.target)) ||
    !isAnchorUsability(value.usability) ||
    (Object.hasOwn(value, "source") && !isSourceReceipt(value.source)) ||
    !optionalNonNegative(value, "timeCommitted") ||
    !optionalNonNegative(value, "commitOrder") ||
    !optionalPositive(value, "frontierSequence")
  ) {
    return false
  }
  const sourceState = projectionSourceState(value)
  if (sourceState === "partial") return false
  if (value.headID === null) {
    return (
      value.version === 0 &&
      value.target === null &&
      value.usability.usable === false &&
      value.usability.cause === "absent" &&
      sourceState === "none"
    )
  }
  if (value.version < 1 || sourceState !== "all") return false
  if (value.target === null) return value.usability.usable === false && value.usability.cause === "absent"
  return value.usability.usable || value.usability.cause !== "absent"
}

function isDefaultUsability(value: unknown): value is DefaultProjection["usability"] {
  if (!isRecord(value)) return false
  if (value.usable === true) {
    return hasShape(value, ["usable", "title"]) && typeof value.title === "string"
  }
  return (
    value.usable === false &&
    hasShape(value, ["usable", "cause"], ["title"]) &&
    ["absent", "course_not_found", "course_withdrawn"].includes(String(value.cause)) &&
    (!Object.hasOwn(value, "title") || typeof value.title === "string")
  )
}

function isAnchorUsability(value: unknown): value is AnchorProjection["usability"] {
  if (!isRecord(value)) return false
  if (value.usable === true) return hasShape(value, ["usable"])
  return (
    value.usable === false &&
    hasShape(value, ["usable", "cause"]) &&
    [
      "absent",
      "course_not_found",
      "course_withdrawn",
      "view_not_found",
      "view_withdrawn",
      "revision_not_found",
      "revision_withdrawn",
      "membership_missing",
      "working_selection_mismatch",
    ].includes(String(value.cause))
  )
}

function isDefaultConfirmation(value: unknown): value is DefaultConfirmationSnapshot {
  return (
    isRecord(value) &&
    hasShape(value, ["permissionRequestID", "headID", "version", "fromCourseID", "fromCourseTitle", "target"]) &&
    isPrefixedString(value.permissionRequestID, "per") &&
    isNullableID(value.headID, "ndp") &&
    isNonNegativeInteger(value.version) &&
    isNullableID(value.fromCourseID, "crs") &&
    (value.fromCourseTitle === null || typeof value.fromCourseTitle === "string") &&
    (value.target === null || isPreferenceTarget(value.target))
  )
}

function isPreferenceTarget(value: unknown) {
  return (
    isRecord(value) &&
    hasShape(value, [
      "courseID",
      "courseTitle",
      "courseVersion",
      "selectionRevisionID",
      "selectionVersion",
      "viewID",
      "viewName",
      "viewVersion",
      "revisionVersion",
    ]) &&
    isID(value.courseID, "crs") &&
    typeof value.courseTitle === "string" &&
    isNonNegativeInteger(value.courseVersion) &&
    isNullableID(value.selectionRevisionID, "cvr") &&
    isNonNegativeInteger(value.selectionVersion) &&
    isNullableID(value.viewID, "cvw") &&
    (value.viewName === null || typeof value.viewName === "string") &&
    (value.viewVersion === null || isNonNegativeInteger(value.viewVersion)) &&
    (value.revisionVersion === null || isNonNegativeInteger(value.revisionVersion))
  )
}

function isMembershipEndpoint(value: unknown) {
  return (
    isRecord(value) &&
    hasShape(value, ["courseID", "viewID", "revisionID", "itemID"]) &&
    isID(value.courseID, "crs") &&
    isID(value.viewID, "cvw") &&
    isID(value.revisionID, "cvr") &&
    isID(value.itemID, "cit")
  )
}

function isSourceReceipt(value: unknown): value is SourceReceipt {
  if (!isRecord(value)) return false
  if (
    !hasShape(
      value,
      [
        "receiptID",
        "occurrenceID",
        "originSessionID",
        "originMessageID",
        "assistantMessageID",
        "invocationPartID",
        "availability",
      ],
      ["timeDeleted"],
    ) ||
    !isID(value.receiptID, "lcr") ||
    !isID(value.occurrenceID, "lco") ||
    !isPrefixedString(value.originSessionID, "ses") ||
    !isPrefixedString(value.originMessageID, "msg") ||
    !isPrefixedString(value.assistantMessageID, "msg") ||
    !isPrefixedString(value.invocationPartID, "prt") ||
    (value.availability !== "available" && value.availability !== "source_unavailable") ||
    (Object.hasOwn(value, "timeDeleted") && !isNonNegativeInteger(value.timeDeleted))
  ) {
    return false
  }
  return value.availability === "available"
    ? !Object.hasOwn(value, "timeDeleted")
    : Object.hasOwn(value, "timeDeleted")
}

function validMetadata(value: Record<string, unknown>) {
  return isNonNegativeInteger(value.settlementTime) && isNonNegativeInteger(value.settlementOrder)
}

function optionalNonNegative(value: Record<string, unknown>, key: string) {
  return !Object.hasOwn(value, key) || isNonNegativeInteger(value[key])
}

function optionalPositive(value: Record<string, unknown>, key: string) {
  return !Object.hasOwn(value, key) || isPositiveInteger(value[key])
}

function projectionSourceState(value: Record<string, unknown>) {
  const count = ["source", "timeCommitted", "commitOrder", "frontierSequence"].filter((key) =>
    Object.hasOwn(value, key),
  ).length
  if (count === 0) return "none" as const
  if (count === 4) return "all" as const
  return "partial" as const
}
