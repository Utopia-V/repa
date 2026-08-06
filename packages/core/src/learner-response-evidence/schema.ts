export * as LearnerResponseEvidenceSchema from "./schema"

import { Schema } from "effect"
import { Course } from "../course"
import { Identifier } from "../id/id"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { MaterialMap } from "../material-map"
import type { SessionSchema } from "../session/schema"
import type { Turn } from "@opencode-ai/schema/turn"
import type { MessageID, PartID } from "../v1/session"

export const RecordID = Schema.String.check(Schema.isPattern(/^lre_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerResponseEvidence.RecordID"),
)
export type RecordID = typeof RecordID.Type

export const RevisionID = Schema.String.check(Schema.isPattern(/^lrr_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerResponseEvidence.RevisionID"),
)
export type RevisionID = typeof RevisionID.Type

const decodeRecordID = Schema.decodeUnknownSync(RecordID)
const decodeRevisionID = Schema.decodeUnknownSync(RevisionID)

export const createRecordID = () => decodeRecordID(Identifier.create("lre", "ascending"))
export const createRevisionID = () => decodeRevisionID(Identifier.create("lrr", "ascending"))

export const MAX_SELECTOR_BYTES = 2_048
export const MAX_READ_ITEMS = 64
export const MAX_READ_BYTES = 32_768
export const MAX_CONTEXT_ITEMS = 8

export type Relation = "supports" | "does_not_support"
export type Basis = "tutor_interpretation" | "learner_report"
export type Exposure =
  | "learner_response_before_tutor_disclosure"
  | "tutor_disclosure_before_learner_response"
export type Disposition = "active" | "retracted"
export type Operation = "create" | "revise_from_tutor_interpretation" | "revise_from_learner_report" | "retract"

export type Target = Readonly<{
  mapID: MaterialMap.MapID
  selectorID: MaterialMap.SelectorID
  courseID: Course.CourseID
  viewID: Course.ViewID
  revisionID: Course.RevisionID
  itemID: Course.ItemID
}>

export type CreateCommand = Readonly<{
  operation: "create"
  relation: Relation
  exposure: Exposure
  conditionAssistantMessageID: MessageID
  target: Target
  alignmentID: MaterialMap.AlignmentID
}>

export type TutorRevisionCommand = Readonly<{
  operation: "revise_from_tutor_interpretation"
  recordID: RecordID
  expectedVersion: number
  relation: Relation
  exposure: Exposure
}>

export type LearnerReportRevisionCommand = Readonly<{
  operation: "revise_from_learner_report"
  recordID: RecordID
  expectedVersion: number
  relation: Relation
  exposure: Exposure
}>

export type RetractCommand = Readonly<{
  operation: "retract"
  recordID: RecordID
  expectedVersion: number
}>

export type Command = CreateCommand | TutorRevisionCommand | LearnerReportRevisionCommand | RetractCommand
export type CanonicalCommand = Command & Readonly<{ schemaVersion: 1 }>

export type Source = Readonly<{
  occurrenceID: OccurrenceID
  sourceOrder: number
  sessionID: SessionSchema.ID
  messageID: MessageID
  turnID: Turn.ID
  inputID: Turn.InputID
  timeAdmitted: number
}>

export type ConditionSource = Readonly<{
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  assistantMessageID: MessageID
  timeSettled: number
}>

export type TargetSnapshot = Target &
  Readonly<{
    alignmentID: MaterialMap.AlignmentID
    alignmentDispositionVersion: number
    mapDispositionVersion: number
    courseVersion: number
    viewVersion: number
    revisionVersion: number
  }>

export type AgentAction = Readonly<{
  schemaVersion: 1
  kind: "root" | "delegated"
  occurrenceID: string
  causalRootOccurrenceID: string
  sessionID: string
  turnID: string
  inputID: string
  assistantMessageID: string
  invocationPartID: string
  providerCallID: string
  emissionOrdinal: number
  capabilityIdentity: string
  capabilityVersion: number
  issuingModelOperationID: string
  lineage: readonly Readonly<{ readonly [key: string]: unknown }>[]
  effectiveDelegatedCapability?: Readonly<{ readonly [key: string]: unknown }>
}>

export type RecordSnapshot = Readonly<{
  recordID: RecordID
  target: TargetSnapshot
  subject: Source
  condition: ConditionSource
  currentRevisionID: RevisionID
  currentVersion: number
  relation: Relation
  exposure: Exposure
  basis: Basis
  disposition: Disposition
  basisSource: Source
}>

export type MaterializedCandidate = Readonly<{
  schemaVersion: 1
  effectRecordID: RecordID
  effectVersion: number
  canonicalCommand: CanonicalCommand
  commandCause: Source
  agentAction: AgentAction
  subject: Source
  condition: ConditionSource
  target?: TargetSnapshot
  current?: RecordSnapshot
  programBasis: Basis
  programDisposition: Disposition
}>

export type Candidate = Readonly<{
  kind: "candidate_v1"
  commandFingerprint: string
  semanticAddressFingerprint: string
  agentActionFingerprint: string
  canonicalCommand: CanonicalCommand
  agentAction: AgentAction
  materialized: MaterializedCandidate
}>

export type SemanticTerminal = Readonly<{
  kind: "semantic_terminal_v1"
  outcome: "already_applied" | "semantic_conflict"
  canonicalCommand: CanonicalCommand
  commandFingerprint: string
  semanticAddressFingerprint: string
  existingRecordID: RecordID
  existingRevisionID: RevisionID
  existingAssessmentFingerprint: string
}>

export type CapabilityOutcome =
  | "not_evaluated"
  | "policy_allow"
  | "policy_deny"
  | "prompted_allow"
  | "prompted_deny"
  | "prompted_correct"
  | "prompted_cancel"
  | "prompted_abort"

export type Revision = Readonly<{
  id: RevisionID
  recordID: RecordID
  version: number
  predecessorID?: RevisionID
  operation: Operation
  relation: Relation
  exposure: Exposure
  basis: Basis
  disposition: Disposition
  basisSource: Source
  commandCause: Source
  invocationPartID: PartID
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type Record = Readonly<{
  id: RecordID
  subject: Source
  condition: ConditionSource
  target: TargetSnapshot
  current: Revision
  timeCreated: number
}>

export type AppliedSettlement = Readonly<{
  outcome: "applied"
  evidenceKind: "learner_response_evidence"
  schemaVersion: 1
  receiptID: string
  effectID: RevisionID
  recordID: RecordID
  revisionID: RevisionID
  version: number
  subject: Source
  target: TargetSnapshot
  operation: Operation
  relation: Relation
  exposure: Exposure
  basis: Basis
  disposition: Disposition
  frontierSequence: number
  settlementTime: number
  settlementOrder: number
}>

export type AlreadyAppliedSettlement = Omit<AppliedSettlement, "outcome"> & Readonly<{ outcome: "already_applied" }>

export type InvocationVersion = Readonly<{
  version: 1
  disposition: "candidate_v1" | "semantic_terminal_v1" | "physical_no_effect"
  status: "admitted" | "applied" | "already_applied" | "no_change" | "error"
  settlement: unknown
  candidate?: Candidate
  semanticTerminal?: SemanticTerminal
  capabilityOutcome?: CapabilityOutcome
  permissionRequestID?: string
  timeAdmitted: number
}>

export type SourceAvailability =
  | Readonly<{ state: "available" }>
  | Readonly<{ state: "source_unavailable"; reason: "source_deleted" | "presentation_unavailable" }>

export type RecordView = Readonly<{
  record: Record
  availability: Readonly<{
    subject: SourceAvailability
    condition: SourceAvailability
    basis: SourceAvailability
  }>
  targetRelation: Readonly<{
    alignment: "current" | "withdrawn" | "superseded" | "unavailable"
    map: "current" | "withdrawn" | "superseded" | "unavailable"
    course: "current" | "unavailable"
    selector: "current" | "unavailable"
  }>
}>

export type ReadQuery =
  | Readonly<{ type: "record"; recordID: RecordID }>
  | Readonly<{ type: "history"; recordID: RecordID }>
  | Readonly<{ type: "course"; target: Omit<Target, "mapID" | "selectorID"> }>
  | Readonly<{ type: "selector"; mapID: MaterialMap.MapID; selectorID: MaterialMap.SelectorID }>

export type ReadPage = Readonly<{
  query: ReadQuery
  items: readonly (RecordView | Revision)[]
  countAtRead: number
  cursor: string | null
  truncated: boolean
  canonicalBytes: number
}>

export class InvalidCommandError extends Schema.TaggedErrorClass<InvalidCommandError>()(
  "LearnerResponseEvidence.InvalidCommandError",
  { reason: Schema.Literals(["validation_error", "capacity_exceeded", "source_unavailable", "stale"]) },
) {}

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()(
  "LearnerResponseEvidence.IntegrityError",
  { detail: Schema.String },
) {}
