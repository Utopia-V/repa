export * as AssignmentSchema from "./schema"

import type { Turn } from "@opencode-ai/schema/turn"
import { Schema } from "effect"
import type { Artifact } from "../artifact"
import type { Course } from "../course"
import type { ResolvedZone, ZoneIntent } from "../civil-time"
import { Identifier } from "../id/id"
import type { OccurrenceID, SourceTemporalContext } from "../learning-command/occurrence-schema"
import type { InvocationEnvelope, ReceiptID } from "../learning-command/physical-schema"
import type { Representation } from "../representation"
import type { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"

export const AssignmentID = Schema.String.check(Schema.isPattern(/^asn_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Assignment.ID"),
)
export type AssignmentID = typeof AssignmentID.Type

export const RevisionID = Schema.String.check(Schema.isPattern(/^asr_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Assignment.RevisionID"),
)
export type RevisionID = typeof RevisionID.Type

export const EffectID = Schema.String.check(Schema.isPattern(/^ase_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Assignment.EffectID"),
)
export type EffectID = typeof EffectID.Type

const decodeAssignmentID = Schema.decodeUnknownSync(AssignmentID)
const decodeRevisionID = Schema.decodeUnknownSync(RevisionID)
const decodeEffectID = Schema.decodeUnknownSync(EffectID)

export const createAssignmentID = () => decodeAssignmentID(Identifier.create("asn", "ascending"))
export const createRevisionID = () => decodeRevisionID(Identifier.create("asr", "ascending"))
export const createEffectID = () => decodeEffectID(Identifier.create("ase", "ascending"))

export const MAX_INTENTS = 16
export const MAX_SUMMARY_BYTES = 640
export const MAX_LEARNING_CONTEXT_BYTES = 384
export const MAX_EXCERPT_BYTES = 1_024
export const MAX_RATIONALE_BYTES = 1_024
export const MAX_SCOPE_COURSES = 8
export const MAX_CONTEXT_ENTRIES = 8
export const MAX_SEMANTIC_VALUE_BYTES = 2_048
export const MAX_READ_ITEMS = 64
export const MAX_READ_BYTES = 32_768

export type Disposition = "open" | "completed" | "cancelled" | "dismissed" | "superseded"
export type Comparator = "inclusive" | "exclusive"

export type Scope =
  | Readonly<{ type: "learner_home" }>
  | Readonly<{ type: "courses"; courseIDs: readonly Course.CourseID[] }>

export type TemporalBoundaryIntent =
  | Readonly<{
      type: "local_date"
      civilDate: string
      comparator: Comparator
      timeZone: ZoneIntent
    }>
  | Readonly<{
      type: "instant"
      sourceExpression: string
      localDateTime: string
      comparator: Comparator
      timeZone: ZoneIntent
      disambiguatingOffsetMinutes?: number
    }>

export type TemporalBoundary =
  | Readonly<{
      type: "local_date"
      civilDate: string
      comparator: Comparator
      resolvedZone: ResolvedZone
    }>
  | Readonly<{
      type: "instant"
      sourceExpression: string
      localDateTime: string
      normalizedInstant: number
      utcOffsetMinutes: number
      comparator: Comparator
      resolvedZone: ResolvedZone
    }>

export type DueBasisIntent =
  | Readonly<{ type: "unresolved" }>
  | Readonly<{ type: "explicitly_no_deadline" }>
  | TemporalBoundaryIntent

export type DueBasis =
  | Readonly<{ type: "unresolved" }>
  | Readonly<{ type: "explicitly_no_deadline" }>
  | TemporalBoundary

export type SemanticSnapshotIntent = Readonly<{
  obligationSummary: string
  learningContext: string
  scope: Scope
  dueBasis: DueBasisIntent
  expiryBoundary?: TemporalBoundaryIntent
}>

export type SemanticSnapshot = Readonly<{
  obligationSummary: string
  learningContext: string
  scope: Scope
  dueBasis: DueBasis
  expiryBoundary?: TemporalBoundary
}>

export type ExcerptIntent = Readonly<{
  text: string
  startByte: number
  endByte: number
}>

export type SourceSelector = Readonly<{
  locator: string
  excerpt?: ExcerptIntent
}>

export type SourceObservationIntent =
  | Readonly<{
      type: "artifact_revision"
      artifactID: Artifact.ArtifactID
      revisionID: Artifact.RevisionID
      attribution: Artifact.AttributionBasis
      selector: SourceSelector
    }>
  | Readonly<{
      type: "representation_revision"
      representationRevisionID: Representation.RevisionID
      selector: SourceSelector
    }>

export type LearnerCauseIntent =
  | Readonly<{ type: "interpreted_learner_report"; excerpt: ExcerptIntent }>
  | Readonly<{ type: "interpreted_learner_direction"; excerpt: ExcerptIntent }>

export type SourceCauseIntent =
  | Readonly<{ type: "interpreted_source_observation"; source: SourceObservationIntent }>
  | Readonly<{ type: "interpreted_source_change"; source: SourceObservationIntent }>

export type OwnerReadReference = Readonly<{
  assignmentID: AssignmentID
  revisionID: RevisionID
  version: number
  ownerCutFingerprint: string
}>

export type AgentCorrectionCauseIntent = Readonly<{
  type: "agent_correction"
  rationale: string
  ownerReads: readonly OwnerReadReference[]
}>

export type CauseIntent = LearnerCauseIntent | SourceCauseIntent | AgentCorrectionCauseIntent

export type ExpectedHead = Readonly<{
  revisionID: RevisionID
  version: number
  ownerCutFingerprint: string
}>

export type SourceAction =
  | Readonly<{ type: "preserve_predecessor_source" }>
  | Readonly<{ type: "rebind_current_source_to_cause" }>

export type AssignmentRevisionRef = Readonly<{
  assignmentID: AssignmentID
  revisionID: RevisionID
  version: number
}>

export type RelationAction =
  | Readonly<{ type: "preserve" }>
  | Readonly<{ type: "set_or_retarget"; target: AssignmentRevisionRef }>
  | Readonly<{
      type: "clear"
      finalDisposition: Exclude<Disposition, "superseded">
    }>

export type CreateIntent = Readonly<{
  type: "create"
  createOrdinal: number
  snapshot: SemanticSnapshotIntent
}>

export type UpdateKind = "revise" | "correct" | "complete" | "cancel" | "dismiss" | "reopen"

export type UpdateIntent = Readonly<{
  type: UpdateKind
  assignmentID: AssignmentID
  expectedHead: ExpectedHead
  snapshot?: SemanticSnapshotIntent
  finalDisposition?: Disposition
  sourceAction: SourceAction
  relationAction: RelationAction
  rationale: string
}>

export type ReplacementSuccessorIntent =
  | Readonly<{ type: "create"; createOrdinal: number; snapshot: SemanticSnapshotIntent }>
  | Readonly<{ type: "bind"; target: AssignmentRevisionRef }>

export type ReplaceIntent = Readonly<{
  type: "replace"
  assignmentID: AssignmentID
  expectedHead: ExpectedHead
  sourceAction: SourceAction
  rationale: string
  successor: ReplacementSuccessorIntent
}>

export type Intent = CreateIntent | UpdateIntent | ReplaceIntent

export type ChangeSetCommand = Readonly<{
  cause: CauseIntent
  intents: readonly Intent[]
}>

export type CanonicalChangeSet = Readonly<{
  schemaVersion: 1
  cause: CauseIntent
  intents: readonly Intent[]
}>

export type LearnerSourceBasis = Readonly<{
  type: "learner_occurrence"
  occurrenceID: OccurrenceID
  sourceOrder: number
  sessionID: SessionSchema.ID
  messageID: MessageID
  turnID: Turn.ID
  inputID: Turn.InputID
  timeAdmitted: number
  sourceTemporalContext: SourceTemporalContext
  excerpt: ExcerptIntent & Readonly<{ sha256: string }>
}>

export type ArtifactSourceBasis = Readonly<{
  type: "artifact_revision"
  artifactID: Artifact.ArtifactID
  revisionID: Artifact.RevisionID
  attribution: Artifact.AttributionBasis
  selector: SourceSelector & Readonly<{ locatorDigest: string; excerptSha256?: string }>
  admission: Readonly<{ readonly [key: string]: unknown }>
}>

export type RepresentationSourceBasis = Readonly<{
  type: "representation_revision"
  representationRevisionID: Representation.RevisionID
  selector: SourceSelector & Readonly<{ locatorDigest: string; excerptSha256?: string }>
  admission: Readonly<{ readonly [key: string]: unknown }>
}>

export type EffectiveSourceBasis = LearnerSourceBasis | ArtifactSourceBasis | RepresentationSourceBasis

export type SourceAdmissionBasis =
  | Readonly<{ type: "learner_occurrence"; basis: LearnerSourceBasis }>
  | Readonly<{ type: "artifact_revision"; basis: ArtifactSourceBasis }>
  | Readonly<{ type: "representation_revision"; basis: RepresentationSourceBasis }>
  | Readonly<{ type: "assignment_owner_read"; ownerReads: readonly OwnerReadReference[] }>

export type MutationAuthorshipBasis = Readonly<{
  type: CauseIntent["type"]
  assistantMessageID: MessageID
  occurrenceID: OccurrenceID
  invocationPartID: PartID
  rationale?: string
}>

export type SourceBasisRelation = "carried" | "corrected_with_new_exact_source"

export type AgentAction = Readonly<{
  schemaVersion: 1
  kind: "root" | "delegated"
  occurrenceID: OccurrenceID
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  inputID: Turn.InputID
  assistantMessageID: MessageID
  invocationPartID: PartID
  providerCallID: string
  emissionOrdinal: number
  capabilityIdentity: string
  capabilityVersion: number
  lineage: readonly Readonly<{ readonly [key: string]: unknown }>[]
  effectiveDelegatedCapability?: Readonly<{ readonly [key: string]: unknown }>
}>

export type Revision = Readonly<{
  id: RevisionID
  assignmentID: AssignmentID
  version: number
  predecessorRevisionID?: RevisionID
  operation: Intent["type"]
  snapshot: SemanticSnapshot
  disposition: Disposition
  creationSourceBasis: EffectiveSourceBasis
  effectiveSourceBasisAtCommit: EffectiveSourceBasis
  sourceAdmissionBasisAtCommit: SourceAdmissionBasis
  mutationAuthorshipBasis: MutationAuthorshipBasis
  sourceBasisRelationToPredecessor: SourceBasisRelation
  supersessionTarget?: AssignmentRevisionRef
  effectID: EffectID
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type Assignment = Readonly<{
  id: AssignmentID
  timeCreated: number
  current: Revision
}>

export type MaterializedIntent = Readonly<{
  outcome: "changed" | "no_change"
  ordinal: number
  intent: Intent
  assignmentID: AssignmentID
  revisionID: RevisionID
  current?: Assignment
  successorAssignmentID?: AssignmentID
  successorRevisionID?: RevisionID
  successorCurrent?: Assignment
  successorSnapshot?: SemanticSnapshot
  snapshot: SemanticSnapshot
  finalDisposition: Disposition
  relationTarget?: AssignmentRevisionRef
  creationSourceBasis: EffectiveSourceBasis
  effectiveSourceBasis: EffectiveSourceBasis
  sourceAdmissionBasis: SourceAdmissionBasis
  sourceBasisRelation: SourceBasisRelation
}>

export type Candidate = Readonly<{
  kind: "candidate_v1"
  effectID: EffectID
  commandFingerprint: string
  semanticAddressFingerprint: string
  agentActionFingerprint: string
  canonicalCommand: CanonicalChangeSet
  agentAction: AgentAction
  causeBasis: EffectiveSourceBasis | Readonly<{ type: "assignment_owner_read"; ownerReads: readonly OwnerReadReference[] }>
  materialized: readonly MaterializedIntent[]
}>

export type SemanticTerminal = Readonly<{
  kind: "semantic_terminal_v1"
  outcome: "already_applied" | "semantic_conflict"
  commandFingerprint: string
  semanticAddressFingerprint: string
  existingOwner:
    | Readonly<{ type: "effect"; effectID: EffectID }>
    | Readonly<{ type: "no_change"; receiptID: ReceiptID }>
}>

export type ChangeProjection = Readonly<{
  ordinal: number
  operation: Intent["type"]
  assignmentID: AssignmentID
  previousRevision?: AssignmentRevisionRef
  committedRevision: AssignmentRevisionRef
  successorAssignmentID?: AssignmentID
}>

export type IntentResultProjection =
  | Readonly<{
      outcome: "changed"
      ordinal: number
      operation: Intent["type"]
      assignmentID: AssignmentID
      previousRevision?: AssignmentRevisionRef
      committedRevision: AssignmentRevisionRef
      successorAssignmentID?: AssignmentID
      successorRevision?: AssignmentRevisionRef
    }>
  | Readonly<{
      outcome: "no_change"
      ordinal: number
      operation: "revise"
      assignmentID: AssignmentID
      currentRevision: AssignmentRevisionRef
    }>

export type AppliedSettlement = Readonly<{
  outcome: "applied"
  assignmentKind: "change_set"
  receiptID: ReceiptID
  effectID: EffectID
  changes: readonly ChangeProjection[]
  intentResults: readonly IntentResultProjection[]
  settlementTime: number
  settlementOrder: number
}>

export type AlreadyAppliedSettlement =
  | (Omit<AppliedSettlement, "outcome"> &
      Readonly<{
        outcome: "already_applied"
        existingOutcome: "applied"
      }>)
  | Readonly<{
      outcome: "already_applied"
      assignmentKind: "change_set"
      existingOutcome: "no_change"
      receiptID: ReceiptID
      changes: readonly []
      intentResults: readonly Extract<IntentResultProjection, { outcome: "no_change" }>[]
      settlementTime: number
      settlementOrder: number
    }>

export type NoChangeSettlement = Readonly<{
  outcome: "no_change"
  assignmentKind: "change_set"
  intentResults: readonly Extract<IntentResultProjection, { outcome: "no_change" }>[]
  settlementTime: number
  settlementOrder: number
}>

export type Invocation = Readonly<{ envelope: InvocationEnvelope; command: ChangeSetCommand }>

export type CapabilityOutcome =
  | "not_evaluated"
  | "policy_allow"
  | "policy_deny"
  | "prompted_allow"
  | "prompted_deny"
  | "prompted_correct"
  | "prompted_cancel"
  | "prompted_abort"

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

export type OwnerCut = Readonly<{
  frontierSequence: number
  frontierTime: number
  headCount: number
  fingerprint: string
}>

export type CurrentHeadRelation = "current" | "superseded_by_revision" | "missing"

export type DueRelation =
  | Readonly<{ type: "unresolved" | "explicitly_no_deadline" }>
  | Readonly<{ type: "local_date"; relation: "before" | "on" | "after"; overdue: boolean }>
  | Readonly<{ type: "instant"; relation: "before" | "at" | "after"; overdue: boolean }>

export type ExpiryRelation =
  | Readonly<{ type: "none" }>
  | Readonly<{ type: "local_date"; relation: "before" | "on" | "after"; expired: boolean }>
  | Readonly<{ type: "instant"; relation: "before" | "at" | "after"; expired: boolean }>

export type ScopeCurrentRelation = Readonly<{
  courseID: Course.CourseID
  status: "available" | "course_not_found" | "course_withdrawn"
  version?: number
}>

export type SourceStatusAtCut =
  | Readonly<{
      sourceOwner: "learner_occurrence"
      exactSourceLocator: Readonly<{ occurrenceID: OccurrenceID }>
      ownerRecordedState: Readonly<{ readonly [key: string]: unknown }>
      exactOwnerDependency: Readonly<{ readonly [key: string]: unknown }>
      asOf: number
    }>
  | Readonly<{
      sourceOwner: "artifact"
      exactSourceLocator: Readonly<{
        artifactID: Artifact.ArtifactID
        revisionID: Artifact.RevisionID
        attribution: Artifact.AttributionBasis
      }>
      ownerRecordedState: Readonly<{ readonly [key: string]: unknown }>
      exactOwnerDependency: Readonly<{ readonly [key: string]: unknown }>
      asOf: number
    }>
  | Readonly<{
      sourceOwner: "representation"
      exactSourceLocator: Readonly<{ representationRevisionID: Representation.RevisionID }>
      ownerRecordedState: Readonly<{ readonly [key: string]: unknown }>
      exactOwnerDependency: Readonly<{ readonly [key: string]: unknown }>
      asOf: number
    }>

export type ProjectionAtCut = Readonly<{
  assignmentRevisionRef: AssignmentRevisionRef
  assignmentOwnerCut: OwnerCut
  asOf: number
  currentHeadRelation: CurrentHeadRelation
  currentHeadRevisionRef?: AssignmentRevisionRef
  dueRelationAtCut: DueRelation
  expiryRelationAtCut: ExpiryRelation
  scopeCurrentRelationsAtCut: readonly ScopeCurrentRelation[]
  sourceStatusAtCut: SourceStatusAtCut
  revision: Revision
}>

export type ContextCandidate = Readonly<{
  assignment: Assignment
  projection: ProjectionAtCut
}>

export type ContextProjection = Readonly<{
  ownerCut: OwnerCut
  asOf: number
  countAtCut: number
  order: "identity_creation_then_assignment_id_non_priority"
  candidates: readonly ContextCandidate[]
}>

export type ReadQuery =
  | Readonly<{ type: "discover"; disposition?: Disposition; courseID?: Course.CourseID }>
  | Readonly<{ type: "current"; assignmentID: AssignmentID }>
  | Readonly<{ type: "revision"; assignmentID: AssignmentID; revisionID: RevisionID }>
  | Readonly<{ type: "history"; assignmentID: AssignmentID }>
  | Readonly<{ type: "projection"; assignmentID: AssignmentID; revisionID?: RevisionID; asOf: number }>

export type ReadPage = Readonly<{
  schemaVersion: 1
  ownerCut: OwnerCut
  asOf: number
  order: "identity_creation_then_assignment_id_non_priority" | "revision_version"
  countAtCut: number
  returnedCount: number
  omittedCount: number
  truncated: boolean
  nextCursor?: string
  items: readonly (Assignment | Revision | ProjectionAtCut)[]
  canonicalBytes: number
}>

export class InvalidCommandError extends Schema.TaggedErrorClass<InvalidCommandError>()("Assignment.InvalidCommandError", {
  reason: Schema.Literals([
    "validation_error",
    "capacity_exceeded",
    "source_unavailable",
    "stale",
    "illegal_transition",
    "graph_conflict",
    "not_found",
  ]),
  detail: Schema.optional(Schema.String),
}) {}

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()("Assignment.IntegrityError", {
  detail: Schema.String,
}) {}
