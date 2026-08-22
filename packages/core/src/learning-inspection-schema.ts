export * as LearningInspectionSchema from "./learning-inspection-schema"

import type { OwnerKind } from "./session-deletion/schema"
import { INSPECTION_OWNER_SEMANTICS, type InspectionOwnerArm } from "./learning-inspection-owner-semantics"
import type { SessionSchema } from "./session/schema"
import type { RecordRevision } from "./turn-lineage"
import type { Coverage as ContextSectionCoverage, Omission as ContextOmission } from "./learning-context/schema"
import type { MessageID, PartID } from "./v1/session"
import type { Turn } from "@opencode-ai/schema/turn"

export const METADATA_KEY = "repaInspection"

export type Fact = Readonly<{ label: string; value: string }>
export type InspectionOwnerKind = OwnerKind | "retained_steering" | "learning_context"

export type OwnerArm = InspectionOwnerArm

export type Projection = Readonly<{
  schemaVersion: 1
  status:
    | "available"
    | "not_found"
    | "stale_inspection"
    | "ambiguous_source"
    | "source_unavailable"
    | "read_shape_unsupported"
    | "integrity_validation_unavailable"
    | "cursor_source_unavailable"
    | "cursor_source_unavailable_or_unresolved"
    | "cursor_predecessor_conflict"
    | "cursor_reset_conflict"
    | "interaction_locator_over_budget"
    | "discovery_incomplete"
  source: Readonly<{
    learnerHomeID: string
    partID?: string
    tool?: string
    action?: string
    assistantMessageID?: string
    turnID: Turn.ID
    inputID: Turn.InputID
    observedFrontier?: Readonly<{ sequence: number; time: number }>
    currentFrontier: Readonly<{ sequence: number; time: number }>
  }>
  owner: Readonly<{
    kind: InspectionOwnerKind
    arm: OwnerArm
    relation: string
    capabilityID?: string
    action?: string
    records: readonly RecordRevision[]
    meaning: string
    potentialEffects: readonly string[]
    correctionRoute: string
    facts: readonly Fact[]
  }>
  lineage: Readonly<{
    coverage:
      | "complete_page"
      | "complete_negative"
      | "partial"
      | "non_atomic_search_incomplete"
      | "pending_interaction_gap"
      | "unsealed_gap"
      | "scope_over_budget"
      | "integrity_validation_unavailable"
    scope: Readonly<{
      status: "complete" | "continued_fresh_cut" | "pending" | "unsealed" | "over_budget" | "integrity_unavailable"
      operationCount: number
      terminalSealedCount: number
    }>
    contextCoverage: readonly ContextCoverageItem[]
    items: readonly LineageItem[]
    omitted: boolean
    pendingGap: boolean
    cursor?: string
  }>
  deletionAudit: Readonly<{
    status:
      | "available"
      | "not_found"
      | "unknown"
      | "partial"
      | "cursor_scope_conflict"
      | "integrity_validation_unavailable"
    scope?: Readonly<{
      rootSessionID: string
      bundleID: string
      deletionTime: number
    }>
    items: readonly DeletionAuditItem[]
    omitted: boolean
    cursor?: string
  }>
  sessionDeletion: Readonly<{
    status:
      | "not_applicable"
      | "live"
      | "missing_or_unresolved"
      | "deleted_full"
      | "deleted_minimal_audit"
      | "deleted_minimal_audit_purged"
      | "integrity_validation_unavailable"
    rootSessionID?: string
    deletionTime?: number
    auditAvailable?: boolean
  }>
  administrativeHistory: Readonly<{
    status: "not_applicable" | "not_found" | "available" | "partial" | "integrity_validation_unavailable"
    kind?: "offline_exact_restore" | "local_import_copy"
    sessionID?: string
    historyFrontierTime?: number
    presentationFrontierTime?: number
    importedRevertAbsent?: true
    messageCount?: number
    partCount?: number
    members: readonly Readonly<{ type: "message" | "part"; id: string; ordinal: number }>[]
    laterLocalMessages: readonly Readonly<{ id: string; timeCreated: number }>[]
    omitted: boolean
    cursor?: string
  }>
  nonCausality: "operational_lineage_not_per_record_answer_causality"
}>

export type LineageItem = Readonly<{
  assistantMessageID: MessageID
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  inputID: Turn.InputID
  record: RecordRevision
  contextClassification: "not_entered" | "locator_only" | "semantic_full"
  exactRead: boolean
  typedCitation: boolean
  operationState: "running" | "completed" | "failed" | "interrupted"
  turnState: Turn.State
  actionState: "pending" | "intermediate" | "completed" | "failed" | "interrupted" | "exhausted"
  purposeBinding?: Readonly<{
    state: "sole_conditional" | "multiple_unresolved" | "not_bound" | "partial_or_withheld"
    overlapResolution: "exact_request_priority_not_causally_attributed"
    scope: string
    selectionBasis: string
    cutFingerprint: string
    sourceFingerprint?: string
    targetFingerprint?: string
    currentOwner?: Readonly<{
      transitionID: string
      version: number
      ownerCutFingerprint: string
    }>
    controlInterval: Readonly<{
      cutAsOf: number
      notBefore?: number
      serviceTiming?: string
    }>
  }>
  action?: Readonly<{
    type: "assistant_presentation" | "learner_usable_tool"
    assistantMessageID: MessageID
    partID?: PartID
  }>
  command?: Readonly<{
    occurrenceID: string
    physicalReceiptID: string
    invocationPartID: string
    semanticEffectID: string
    claimGroupID: string
  }>
  ownerFinalization?: Readonly<{
    receiptID: string
    outcome: "served" | "not_served"
    timeFinalized: number
    member:
      | Readonly<{
          ordinal: number
          concernID: string
          outcome: "served"
          transitionID: string
          serviceReceiptID: string
        }>
      | Readonly<{
          ordinal: number
          concernID: string
          outcome: "not_served"
          reason:
            | "model_not_completed"
            | "tool_parts_incomplete"
            | "presentation_uncommitted"
            | "presentation_unavailable"
            | "no_eligible_output"
            | "stale_head"
            | "target_not_current"
            | "too_early"
            | "source_unavailable"
            | "binding_mismatch"
        }>
    currentConcern: Readonly<{
      transitionID: string
      version: number
      disposition: "open" | "served" | "dismissed" | "superseded"
    }>
  }>
}>

export type ContextCoverageItem = Readonly<{
  assistantMessageID: MessageID
  sectionOwner: string
  coverage: ContextSectionCoverage
  countAtCut: number | "unknown"
  omission: ContextOmission
  targetRecordCount: number
}>

export type DeletionAuditItem = Readonly<{
  rootSessionID: string
  bundleID: string
  operationID: string
  record: RecordRevision
  contextClassification: "not_entered" | "locator_only" | "semantic_full"
  exactRead: boolean
  typedCitation: boolean
  terminalStatus: "completed" | "failed" | "interrupted"
  deletionTime: number
  bodyDeleted: true
}>

export type PageCursor = Readonly<{
  schemaVersion: 1
  section: "live_lineage" | "deletion_audit" | "administrative_history"
  predecessorPartID: PartID
  targetFingerprint: string
  after: string
  cursorFingerprint: string
}>

export function recordSetFingerprint(records: readonly RecordRevision[]) {
  return fingerprint(records.toSorted((left, right) => recordKey(left).localeCompare(recordKey(right))))
}

export function createPageCursor(
  section: PageCursor["section"],
  predecessorPartID: PartID,
  records: readonly RecordRevision[],
  after: string,
) {
  const value = {
    schemaVersion: 1 as const,
    section,
    predecessorPartID,
    targetFingerprint: recordSetFingerprint(records),
    after,
  }
  return JSON.stringify({ ...value, cursorFingerprint: fingerprint(value) } satisfies PageCursor)
}

export function readPageCursor(value: string): PageCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!record(parsed)) return
    const base = {
      schemaVersion: parsed.schemaVersion,
      section: parsed.section,
      predecessorPartID: parsed.predecessorPartID,
      targetFingerprint: parsed.targetFingerprint,
      after: parsed.after,
    }
    if (
      parsed.schemaVersion !== 1 ||
      !["live_lineage", "deletion_audit", "administrative_history"].includes(String(parsed.section)) ||
      typeof parsed.predecessorPartID !== "string" ||
      !parsed.predecessorPartID.startsWith("prt_") ||
      typeof parsed.targetFingerprint !== "string" ||
      !/^[0-9a-f]{64}$/.test(parsed.targetFingerprint) ||
      typeof parsed.after !== "string" ||
      typeof parsed.cursorFingerprint !== "string" ||
      parsed.cursorFingerprint !== fingerprint(base) ||
      Object.keys(parsed).sort().join("\u0000") !==
        ["after", "cursorFingerprint", "predecessorPartID", "schemaVersion", "section", "targetFingerprint"]
          .sort()
          .join("\u0000")
    ) {
      return
    }
    return parsed as PageCursor
  } catch {
    return
  }
}

const ownerKinds = new Set<InspectionOwnerKind>([
  "course",
  "learning_navigation",
  "learner_goal",
  "learning_material",
  "learning_interaction",
  "learner_response_evidence",
  "future_attention",
  "assignment",
  "learner_state_judgment",
  "advisory_plan_suggestion",
  "retained_steering",
  "learning_context",
])
const recordOwnerKinds = new Set<OwnerKind>([
  "course",
  "learning_navigation",
  "learner_goal",
  "learning_material",
  "learning_interaction",
  "learner_response_evidence",
  "future_attention",
  "assignment",
  "learner_state_judgment",
  "advisory_plan_suggestion",
])
const ownerArms = new Set<OwnerArm>(Object.keys(INSPECTION_OWNER_SEMANTICS) as OwnerArm[])

export const INSPECTION_OWNER_KIND = {
  course_view: "course",
  learning_navigation: "learning_navigation",
  artifact: "learning_material",
  representation: "learning_material",
  material_map: "learning_material",
  material_selector: "learning_material",
  material_alignment: "learning_material",
  learner_goal: "learner_goal",
  retained_steering: "retained_steering",
  learner_response_evidence: "learner_response_evidence",
  future_attention: "future_attention",
  assignment: "assignment",
  learner_state_judgment: "learner_state_judgment",
  advisory_plan_suggestion: "advisory_plan_suggestion",
  learning_context: "learning_context",
  learning_interaction: "learning_interaction",
} as const satisfies Record<OwnerArm, InspectionOwnerKind>

const ownerArmRecordKinds = {
  ...INSPECTION_OWNER_KIND,
  retained_steering: undefined,
  learning_context: undefined,
} as const satisfies Record<OwnerArm, OwnerKind | undefined>

export function isProjection(value: unknown): value is Projection {
  if (!record(value) || value.schemaVersion !== 1) return false
  if (!record(value.source) || !record(value.owner) || !record(value.lineage)) return false
  if (!record(value.deletionAudit) || !record(value.sessionDeletion) || !record(value.administrativeHistory))
    return false
  if (
    !onlyKeys(value, [
      "schemaVersion",
      "status",
      "source",
      "owner",
      "lineage",
      "deletionAudit",
      "sessionDeletion",
      "administrativeHistory",
      "nonCausality",
    ]) ||
    !onlyKeys(value.source, [
      "learnerHomeID",
      "partID",
      "tool",
      "action",
      "assistantMessageID",
      "turnID",
      "inputID",
      "observedFrontier",
      "currentFrontier",
    ]) ||
    !onlyKeys(value.owner, [
      "kind",
      "arm",
      "relation",
      "capabilityID",
      "action",
      "records",
      "meaning",
      "potentialEffects",
      "correctionRoute",
      "facts",
    ]) ||
    !onlyKeys(value.lineage, ["coverage", "scope", "contextCoverage", "items", "omitted", "pendingGap", "cursor"]) ||
    !onlyKeys(value.deletionAudit, ["status", "scope", "items", "omitted", "cursor"]) ||
    !onlyKeys(value.sessionDeletion, ["status", "rootSessionID", "deletionTime", "auditAvailable"]) ||
    !onlyKeys(value.administrativeHistory, [
      "status",
      "kind",
      "sessionID",
      "historyFrontierTime",
      "presentationFrontierTime",
      "importedRevertAbsent",
      "messageCount",
      "partCount",
      "members",
      "laterLocalMessages",
      "omitted",
      "cursor",
    ])
  ) {
    return false
  }
  if (
    !ownerKinds.has(value.owner.kind as InspectionOwnerKind) ||
    !ownerArms.has(value.owner.arm as OwnerArm) ||
    typeof value.owner.relation !== "string" ||
    typeof value.owner.meaning !== "string" ||
    typeof value.owner.correctionRoute !== "string" ||
    typeof value.source.learnerHomeID !== "string" ||
    typeof value.source.turnID !== "string" ||
    typeof value.source.inputID !== "string" ||
    (value.source.partID !== undefined && typeof value.source.partID !== "string") ||
    (value.source.tool !== undefined && typeof value.source.tool !== "string") ||
    (value.source.action !== undefined && typeof value.source.action !== "string") ||
    (value.source.assistantMessageID !== undefined && typeof value.source.assistantMessageID !== "string") ||
    (value.owner.capabilityID !== undefined && typeof value.owner.capabilityID !== "string") ||
    (value.owner.action !== undefined && typeof value.owner.action !== "string") ||
    !frontier(value.source.currentFrontier) ||
    (value.source.observedFrontier !== undefined && !frontier(value.source.observedFrontier))
  ) {
    return false
  }
  const arm = value.owner.arm as OwnerArm
  if (value.owner.kind !== INSPECTION_OWNER_KIND[arm]) return false
  const semantics = INSPECTION_OWNER_SEMANTICS[arm]
  if (
    value.owner.meaning !== semantics.meaning ||
    value.owner.correctionRoute !== semantics.correctionRoute ||
    !Array.isArray(value.owner.potentialEffects) ||
    value.owner.potentialEffects.length !== semantics.potentialEffects.length ||
    value.owner.potentialEffects.some((item, index) => item !== semantics.potentialEffects[index])
  ) {
    return false
  }
  if (!Array.isArray(value.owner.records) || !value.owner.records.every(recordRevision)) return false
  const ownerRecords = value.owner.records as readonly RecordRevision[]
  const recordKind = ownerArmRecordKinds[arm]
  if (
    recordKind === undefined
      ? value.owner.records.length !== 0
      : value.owner.records.some((item) => item.ownerKind !== recordKind)
  ) {
    return false
  }
  if (!Array.isArray(value.owner.facts) || !value.owner.facts.every(fact)) return false
  if (!record(value.lineage.scope) || !Array.isArray(value.lineage.contextCoverage)) return false
  if (!onlyKeys(value.lineage.scope, ["status", "operationCount", "terminalSealedCount"])) return false
  if (!value.lineage.contextCoverage.every(contextCoverageItem)) return false
  if (!Array.isArray(value.lineage.items) || !value.lineage.items.every(lineageItem)) return false
  if (!Array.isArray(value.deletionAudit.items) || !value.deletionAudit.items.every(deletionAuditItem)) return false
  if (
    value.lineage.items.some(
      (item) =>
        !ownerRecords.some((record) => sameRecordRevision(record, item.record)) ||
        ((item.purposeBinding !== undefined || item.command !== undefined || item.ownerFinalization !== undefined) &&
          item.record.ownerKind !== "future_attention"),
    ) ||
    value.deletionAudit.items.some((item) => !ownerRecords.some((record) => sameRecordRevision(record, item.record)))
  ) {
    return false
  }
  const deletionScope = value.deletionAudit.scope
  if (
    record(deletionScope) &&
    value.deletionAudit.items.some(
      (item) =>
        item.rootSessionID !== deletionScope.rootSessionID ||
        item.bundleID !== deletionScope.bundleID ||
        item.deletionTime !== deletionScope.deletionTime,
    )
  ) {
    return false
  }
  if (!sessionDeletion(value.sessionDeletion)) return false
  if (!administrativeHistory(value.administrativeHistory)) return false
  if (!deletionAuditShape(value.deletionAudit)) return false
  if (
    !projectionCursor(value.lineage.cursor, "live_lineage", value.source.partID, ownerRecords) ||
    !projectionCursor(value.deletionAudit.cursor, "deletion_audit", value.source.partID, ownerRecords) ||
    !projectionCursor(
      value.administrativeHistory.cursor,
      "administrative_history",
      value.source.partID,
      ownerRecords,
    ) ||
    !deletionCursorScope(value.deletionAudit.cursor, deletionScope)
  ) {
    return false
  }
  if (
    arm !== "learning_interaction" &&
    (!["not_applicable", "integrity_validation_unavailable"].includes(String(value.sessionDeletion.status)) ||
      !["not_applicable", "integrity_validation_unavailable"].includes(String(value.administrativeHistory.status)))
  ) {
    return false
  }
  if (arm === "learning_interaction") {
    const sessions = ownerRecords.map((record) => record.recordID)
    if (
      (value.sessionDeletion.rootSessionID !== undefined &&
        !sessions.includes(String(value.sessionDeletion.rootSessionID))) ||
      (value.administrativeHistory.sessionID !== undefined &&
        !sessions.includes(String(value.administrativeHistory.sessionID)))
    ) {
      return false
    }
  }
  return (
    [
      "available",
      "not_found",
      "stale_inspection",
      "ambiguous_source",
      "source_unavailable",
      "read_shape_unsupported",
      "integrity_validation_unavailable",
      "cursor_source_unavailable",
      "cursor_source_unavailable_or_unresolved",
      "cursor_predecessor_conflict",
      "cursor_reset_conflict",
      "interaction_locator_over_budget",
      "discovery_incomplete",
    ].includes(String(value.status)) &&
    [
      "complete_page",
      "complete_negative",
      "partial",
      "non_atomic_search_incomplete",
      "pending_interaction_gap",
      "unsealed_gap",
      "scope_over_budget",
      "integrity_validation_unavailable",
    ].includes(String(value.lineage.coverage)) &&
    ["complete", "continued_fresh_cut", "pending", "unsealed", "over_budget", "integrity_unavailable"].includes(
      String(value.lineage.scope.status),
    ) &&
    nonnegative(value.lineage.scope.operationCount) &&
    nonnegative(value.lineage.scope.terminalSealedCount) &&
    typeof value.lineage.omitted === "boolean" &&
    typeof value.lineage.pendingGap === "boolean" &&
    (value.lineage.cursor === undefined || typeof value.lineage.cursor === "string") &&
    [
      "available",
      "not_found",
      "unknown",
      "partial",
      "cursor_scope_conflict",
      "integrity_validation_unavailable",
    ].includes(String(value.deletionAudit.status)) &&
    (value.deletionAudit.scope === undefined ||
      (record(value.deletionAudit.scope) &&
        onlyKeys(value.deletionAudit.scope, ["rootSessionID", "bundleID", "deletionTime"]) &&
        string(value.deletionAudit.scope.rootSessionID) &&
        string(value.deletionAudit.scope.bundleID) &&
        nonnegative(value.deletionAudit.scope.deletionTime))) &&
    (!["not_found", "cursor_scope_conflict"].includes(String(value.deletionAudit.status)) ||
      value.deletionAudit.scope !== undefined) &&
    typeof value.deletionAudit.omitted === "boolean" &&
    (value.deletionAudit.cursor === undefined || typeof value.deletionAudit.cursor === "string") &&
    [
      "not_applicable",
      "live",
      "missing_or_unresolved",
      "deleted_full",
      "deleted_minimal_audit",
      "deleted_minimal_audit_purged",
      "integrity_validation_unavailable",
    ].includes(String(value.sessionDeletion.status)) &&
    ["not_applicable", "not_found", "available", "partial", "integrity_validation_unavailable"].includes(
      String(value.administrativeHistory.status),
    ) &&
    typeof value.administrativeHistory.omitted === "boolean" &&
    (value.administrativeHistory.cursor === undefined || typeof value.administrativeHistory.cursor === "string") &&
    value.nonCausality === "operational_lineage_not_per_record_answer_causality"
  )
}

function sessionDeletion(value: Record<string, unknown>) {
  if (value.status === "live") {
    return string(value.rootSessionID) && value.deletionTime === undefined && value.auditAvailable === undefined
  }
  if (["deleted_full", "deleted_minimal_audit", "deleted_minimal_audit_purged"].includes(String(value.status))) {
    if (!string(value.rootSessionID) || !nonnegative(value.deletionTime) || typeof value.auditAvailable !== "boolean") {
      return false
    }
    if (value.status === "deleted_minimal_audit") return value.auditAvailable === true
    return value.auditAvailable === false
  }
  return (
    ["not_applicable", "missing_or_unresolved", "integrity_validation_unavailable"].includes(String(value.status)) &&
    value.rootSessionID === undefined &&
    value.deletionTime === undefined &&
    value.auditAvailable === undefined
  )
}

function deletionAuditShape(value: Record<string, unknown>) {
  if (!Array.isArray(value.items) || typeof value.omitted !== "boolean") return false
  if (value.status === "not_found" || value.status === "cursor_scope_conflict") {
    return record(value.scope) && value.items.length === 0 && value.omitted === false && value.cursor === undefined
  }
  if (value.status === "available") {
    return value.items.length > 0 && value.omitted === false && value.cursor === undefined
  }
  if (value.status === "partial") {
    return value.items.length > 0 && value.omitted === true && string(value.cursor)
  }
  return (
    (value.status === "unknown" || value.status === "integrity_validation_unavailable") &&
    value.items.length === 0 &&
    value.cursor === undefined
  )
}

function projectionCursor(
  value: unknown,
  section: PageCursor["section"],
  predecessorPartID: unknown,
  records: readonly RecordRevision[],
) {
  if (value === undefined) return true
  if (typeof value !== "string" || typeof predecessorPartID !== "string") return false
  const cursor = readPageCursor(value)
  return (
    cursor?.section === section &&
    cursor.predecessorPartID === predecessorPartID &&
    cursor.targetFingerprint === recordSetFingerprint(records)
  )
}

function deletionCursorScope(value: unknown, scope: unknown) {
  if (value === undefined) return true
  if (scope === undefined) return true
  if (typeof value !== "string" || !record(scope)) return false
  const cursor = readPageCursor(value)
  if (!cursor || cursor.section !== "deletion_audit") return false
  try {
    const after: unknown = JSON.parse(cursor.after)
    return (
      record(after) &&
      after.rootSessionID === scope.rootSessionID &&
      after.bundleID === scope.bundleID &&
      after.time === scope.deletionTime &&
      string(after.operationID)
    )
  } catch {
    return false
  }
}

function administrativeHistory(value: Record<string, unknown>) {
  if (!Array.isArray(value.members) || !Array.isArray(value.laterLocalMessages)) return false
  const members = value.members
  const laterLocalMessages = value.laterLocalMessages
  const validFields =
    (value.kind === undefined || ["offline_exact_restore", "local_import_copy"].includes(String(value.kind))) &&
    (value.sessionID === undefined || string(value.sessionID)) &&
    (value.historyFrontierTime === undefined || nonnegative(value.historyFrontierTime)) &&
    (value.presentationFrontierTime === undefined || nonnegative(value.presentationFrontierTime)) &&
    (value.importedRevertAbsent === undefined || value.importedRevertAbsent === true) &&
    (value.messageCount === undefined || nonnegative(value.messageCount)) &&
    (value.partCount === undefined || nonnegative(value.partCount)) &&
    members.every(
      (item) =>
        record(item) &&
        onlyKeys(item, ["type", "id", "ordinal"]) &&
        ["message", "part"].includes(String(item.type)) &&
        string(item.id) &&
        nonnegative(item.ordinal),
    ) &&
    laterLocalMessages.every(
      (item) =>
        record(item) && onlyKeys(item, ["id", "timeCreated"]) && string(item.id) && nonnegative(item.timeCreated),
    )
  if (!validFields) return false
  const noDetails =
    value.kind === undefined &&
    value.sessionID === undefined &&
    value.historyFrontierTime === undefined &&
    value.presentationFrontierTime === undefined &&
    value.importedRevertAbsent === undefined &&
    value.messageCount === undefined &&
    value.partCount === undefined &&
    members.length === 0 &&
    laterLocalMessages.length === 0
  if (value.status === "not_applicable" || value.status === "not_found") {
    return noDetails && value.omitted === false && value.cursor === undefined
  }
  if (value.status === "integrity_validation_unavailable") {
    const boundedIdentity =
      ["offline_exact_restore", "local_import_copy"].includes(String(value.kind)) &&
      string(value.sessionID) &&
      nonnegative(value.messageCount) &&
      nonnegative(value.partCount)
    return (
      (noDetails || boundedIdentity) &&
      value.historyFrontierTime === undefined &&
      value.presentationFrontierTime === undefined &&
      value.importedRevertAbsent === undefined &&
      members.length === 0 &&
      laterLocalMessages.length === 0 &&
      value.omitted === false &&
      value.cursor === undefined
    )
  }
  if (value.status === "partial" && value.kind === undefined) {
    return noDetails && value.omitted === true && value.cursor === undefined
  }
  const total = Number(value.messageCount) + Number(value.partCount)
  const detailed =
    ["offline_exact_restore", "local_import_copy"].includes(String(value.kind)) &&
    string(value.sessionID) &&
    nonnegative(value.historyFrontierTime) &&
    nonnegative(value.presentationFrontierTime) &&
    value.importedRevertAbsent === true &&
    nonnegative(value.messageCount) &&
    nonnegative(value.partCount) &&
    members.length <= total
  if (!detailed) return false
  if (value.status === "available") return value.omitted === false && value.cursor === undefined
  return value.status === "partial" && value.omitted === true && string(value.cursor)
}

function sameRecordRevision(left: RecordRevision, right: RecordRevision) {
  return (
    left.ownerKind === right.ownerKind &&
    left.recordID === right.recordID &&
    left.revisionID === right.revisionID &&
    left.revisionVersion === right.revisionVersion
  )
}

function recordRevision(value: unknown): value is RecordRevision {
  return (
    record(value) &&
    onlyKeys(value, ["ownerKind", "recordID", "revisionID", "revisionVersion"]) &&
    recordOwnerKinds.has(value.ownerKind as OwnerKind) &&
    string(value.recordID) &&
    string(value.revisionID) &&
    nonnegative(value.revisionVersion)
  )
}

function lineageItem(value: unknown): value is LineageItem {
  return (
    record(value) &&
    onlyKeys(value, [
      "assistantMessageID",
      "sessionID",
      "turnID",
      "inputID",
      "record",
      "contextClassification",
      "exactRead",
      "typedCitation",
      "operationState",
      "turnState",
      "actionState",
      "purposeBinding",
      "action",
      "command",
      "ownerFinalization",
    ]) &&
    string(value.assistantMessageID) &&
    string(value.sessionID) &&
    string(value.turnID) &&
    string(value.inputID) &&
    recordRevision(value.record) &&
    ["not_entered", "locator_only", "semantic_full"].includes(String(value.contextClassification)) &&
    typeof value.exactRead === "boolean" &&
    typeof value.typedCitation === "boolean" &&
    ["running", "completed", "failed", "interrupted"].includes(String(value.operationState)) &&
    ["running", "completed", "failed", "interrupted", "exhausted"].includes(String(value.turnState)) &&
    ["pending", "intermediate", "completed", "failed", "interrupted", "exhausted"].includes(
      String(value.actionState),
    ) &&
    (value.purposeBinding === undefined ||
      (record(value.purposeBinding) &&
        onlyKeys(value.purposeBinding, [
          "state",
          "overlapResolution",
          "scope",
          "selectionBasis",
          "cutFingerprint",
          "sourceFingerprint",
          "targetFingerprint",
          "currentOwner",
          "controlInterval",
        ]) &&
        ["sole_conditional", "multiple_unresolved", "not_bound", "partial_or_withheld"].includes(
          String(value.purposeBinding.state),
        ) &&
        value.purposeBinding.overlapResolution === "exact_request_priority_not_causally_attributed" &&
        string(value.purposeBinding.scope) &&
        string(value.purposeBinding.selectionBasis) &&
        digest(value.purposeBinding.cutFingerprint) &&
        (value.purposeBinding.sourceFingerprint === undefined || digest(value.purposeBinding.sourceFingerprint)) &&
        (value.purposeBinding.targetFingerprint === undefined || digest(value.purposeBinding.targetFingerprint)) &&
        (value.purposeBinding.currentOwner === undefined ||
          (record(value.purposeBinding.currentOwner) &&
            onlyKeys(value.purposeBinding.currentOwner, ["transitionID", "version", "ownerCutFingerprint"]) &&
            string(value.purposeBinding.currentOwner.transitionID) &&
            nonnegative(value.purposeBinding.currentOwner.version) &&
            digest(value.purposeBinding.currentOwner.ownerCutFingerprint))) &&
        (value.purposeBinding.state !== "sole_conditional" ||
          (value.purposeBinding.currentOwner !== undefined &&
            value.purposeBinding.sourceFingerprint !== undefined &&
            value.purposeBinding.targetFingerprint !== undefined)) &&
        record(value.purposeBinding.controlInterval) &&
        onlyKeys(value.purposeBinding.controlInterval, ["cutAsOf", "notBefore", "serviceTiming"]) &&
        nonnegative(value.purposeBinding.controlInterval.cutAsOf) &&
        (value.purposeBinding.controlInterval.notBefore === undefined ||
          nonnegative(value.purposeBinding.controlInterval.notBefore)) &&
        (value.purposeBinding.controlInterval.serviceTiming === undefined ||
          string(value.purposeBinding.controlInterval.serviceTiming)))) &&
    (value.action === undefined ||
      (record(value.action) &&
        onlyKeys(value.action, ["type", "assistantMessageID", "partID"]) &&
        ["assistant_presentation", "learner_usable_tool"].includes(String(value.action.type)) &&
        string(value.action.assistantMessageID) &&
        value.action.assistantMessageID === value.assistantMessageID &&
        (value.action.type === "assistant_presentation"
          ? value.action.partID === undefined
          : string(value.action.partID)))) &&
    (value.command === undefined ||
      (record(value.command) &&
        onlyKeys(value.command, [
          "occurrenceID",
          "physicalReceiptID",
          "invocationPartID",
          "semanticEffectID",
          "claimGroupID",
        ]) &&
        [
          value.command.occurrenceID,
          value.command.physicalReceiptID,
          value.command.invocationPartID,
          value.command.semanticEffectID,
          value.command.claimGroupID,
        ].every(string))) &&
    (value.ownerFinalization === undefined ||
      (record(value.ownerFinalization) &&
        onlyKeys(value.ownerFinalization, ["receiptID", "outcome", "timeFinalized", "member", "currentConcern"]) &&
        string(value.ownerFinalization.receiptID) &&
        ["served", "not_served"].includes(String(value.ownerFinalization.outcome)) &&
        nonnegative(value.ownerFinalization.timeFinalized) &&
        finalizationMember(value.ownerFinalization.member) &&
        record(value.ownerFinalization.member) &&
        value.ownerFinalization.member.concernID === value.record.recordID &&
        value.ownerFinalization.member.outcome === value.ownerFinalization.outcome &&
        record(value.ownerFinalization.currentConcern) &&
        onlyKeys(value.ownerFinalization.currentConcern, ["transitionID", "version", "disposition"]) &&
        string(value.ownerFinalization.currentConcern.transitionID) &&
        nonnegative(value.ownerFinalization.currentConcern.version) &&
        ["open", "served", "dismissed", "superseded"].includes(
          String(value.ownerFinalization.currentConcern.disposition),
        )))
  )
}

function finalizationMember(value: unknown) {
  if (!record(value) || !nonnegative(value.ordinal) || !string(value.concernID)) return false
  if (value.outcome === "served") {
    return (
      onlyKeys(value, ["ordinal", "concernID", "outcome", "transitionID", "serviceReceiptID"]) &&
      string(value.transitionID) &&
      string(value.serviceReceiptID)
    )
  }
  return (
    value.outcome === "not_served" &&
    onlyKeys(value, ["ordinal", "concernID", "outcome", "reason"]) &&
    [
      "model_not_completed",
      "tool_parts_incomplete",
      "presentation_uncommitted",
      "presentation_unavailable",
      "no_eligible_output",
      "stale_head",
      "target_not_current",
      "too_early",
      "source_unavailable",
      "binding_mismatch",
    ].includes(String(value.reason))
  )
}

function contextCoverageItem(value: unknown): value is ContextCoverageItem {
  return (
    record(value) &&
    onlyKeys(value, [
      "assistantMessageID",
      "sectionOwner",
      "coverage",
      "countAtCut",
      "omission",
      "targetRecordCount",
    ]) &&
    string(value.assistantMessageID) &&
    string(value.sectionOwner) &&
    ["complete", "truncated", "locator_only", "empty", "unavailable", "not_authorized", "not_applicable"].includes(
      String(value.coverage),
    ) &&
    (value.countAtCut === "unknown" || nonnegative(value.countAtCut)) &&
    contextOmission(value.omission) &&
    nonnegative(value.targetRecordCount)
  )
}

function contextOmission(value: unknown): value is ContextOmission {
  if (!record(value) || !["none", "exact", "unknown"].includes(String(value.type))) return false
  if (value.type === "none") return Object.keys(value).length === 1
  if (value.type === "unknown") return onlyKeys(value, ["type", "reason"]) && string(value.reason)
  return (
    onlyKeys(value, ["type", "omitted", "reasons"]) &&
    nonnegative(value.omitted) &&
    Array.isArray(value.reasons) &&
    value.reasons.every(
      (item) =>
        record(item) &&
        onlyKeys(item, ["reason", "omitted"]) &&
        ["candidate_limit", "gate18_byte_budget"].includes(String(item.reason)) &&
        nonnegative(item.omitted),
    )
  )
}

function deletionAuditItem(value: unknown): value is DeletionAuditItem {
  return (
    record(value) &&
    onlyKeys(value, [
      "rootSessionID",
      "bundleID",
      "operationID",
      "record",
      "contextClassification",
      "exactRead",
      "typedCitation",
      "terminalStatus",
      "deletionTime",
      "bodyDeleted",
    ]) &&
    string(value.rootSessionID) &&
    string(value.bundleID) &&
    string(value.operationID) &&
    recordRevision(value.record) &&
    ["not_entered", "locator_only", "semantic_full"].includes(String(value.contextClassification)) &&
    typeof value.exactRead === "boolean" &&
    typeof value.typedCitation === "boolean" &&
    ["completed", "failed", "interrupted"].includes(String(value.terminalStatus)) &&
    nonnegative(value.deletionTime) &&
    value.bodyDeleted === true
  )
}

function recordKey(value: RecordRevision) {
  return `${value.ownerKind}\u0000${value.recordID}\u0000${value.revisionID}\u0000${value.revisionVersion}`
}

function fingerprint(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(stableStringify(value)).digest("hex")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`
}

function fact(value: unknown): value is Fact {
  return record(value) && onlyKeys(value, ["label", "value"]) && string(value.label) && string(value.value)
}

function frontier(value: unknown) {
  return (
    record(value) && onlyKeys(value, ["sequence", "time"]) && nonnegative(value.sequence) && nonnegative(value.time)
  )
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function string(value: unknown): value is string {
  return typeof value === "string"
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
