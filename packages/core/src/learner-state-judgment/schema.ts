export * as LearnerStateJudgmentSchema from "./schema"

import type { Turn } from "@opencode-ai/schema/turn"
import { Schema } from "effect"
import type { Assignment } from "../assignment"
import type { Course } from "../course"
import { Identifier } from "../id/id"
import type { LearnerGoal } from "../learner-goal"
import type { LearnerResponseEvidence } from "../learner-response-evidence"
import type { OccurrenceID, SourceTemporalContext } from "../learning-command/occurrence-schema"
import type { InvocationEnvelope, ReceiptID } from "../learning-command/physical-schema"
import type { MaterialMap } from "../material-map"
import type { SessionSchema } from "../session/schema"
import type { TurnLearningContext } from "../turn/learning-context"
import type { MessageID, PartID } from "../v1/session"

export const JudgmentID = Schema.String.check(Schema.isPattern(/^lsj_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerStateJudgment.ID"),
)
export type JudgmentID = typeof JudgmentID.Type

export const RevisionID = Schema.String.check(Schema.isPattern(/^lsr_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerStateJudgment.RevisionID"),
)
export type RevisionID = typeof RevisionID.Type

export const EffectID = Schema.String.check(Schema.isPattern(/^lse_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerStateJudgment.EffectID"),
)
export type EffectID = typeof EffectID.Type

const decodeJudgmentID = Schema.decodeUnknownSync(JudgmentID)
const decodeRevisionID = Schema.decodeUnknownSync(RevisionID)
const decodeEffectID = Schema.decodeUnknownSync(EffectID)

export const createJudgmentID = () => decodeJudgmentID(Identifier.create("lsj", "ascending"))
export const createRevisionID = () => decodeRevisionID(Identifier.create("lsr", "ascending"))
export const createEffectID = () => decodeEffectID(Identifier.create("lse", "ascending"))

export const MAX_SUBJECT_LABEL_BYTES = 384
export const MAX_JUDGMENT_BODY_BYTES = 4_096
export const MAX_UNCERTAINTY_BYTES = 1_024
export const MAX_EXCERPT_BYTES = 1_024
export const MAX_RATIONALE_BYTES = 1_024
export const MAX_ANCHORS = 8
export const MAX_BASIS_REFS = 16
export const MAX_CONTEXT_ENTRIES = 8
export const MAX_DIRECTORY_ANCHORS = 96
export const MAX_SEMANTIC_VALUE_BYTES = 2_048
export const MAX_READ_ITEMS = 64
export const MAX_READ_BYTES = 32_768
export const MAX_BINDING_ADMISSION_BYTES = 2_048
export const MAX_DURABLE_SNAPSHOT_BYTES = 65_536

export type Disposition = "active" | "retired"
export type Operation = "create" | "revise" | "retire" | "restore"

export type CourseAnchorRef = Readonly<{
  type: "course_membership"
  endpoint: Course.MembershipEndpoint
}>

export type MaterialSelectorRef = Readonly<{
  type: "material_selector"
  mapID: MaterialMap.MapID
  selectorID: MaterialMap.SelectorID
}>

export type GoalRevisionRef = Readonly<{
  type: "goal_revision"
  goalID: LearnerGoal.GoalID
  revisionID: LearnerGoal.RevisionID
  version: number
}>

export type AssignmentRevisionRef = Readonly<{
  type: "assignment_revision"
  assignmentID: Assignment.AssignmentID
  revisionID: Assignment.RevisionID
  version: number
}>

export type LearnerResponseEvidenceRevisionRef = Readonly<{
  type: "learner_response_evidence_revision"
  recordID: LearnerResponseEvidence.RecordID
  revisionID: LearnerResponseEvidence.RevisionID
  version: number
}>

export type InteractionRef = Readonly<{
  type: "interaction"
  locator: TurnLearningContext.Locator
}>

export type SubjectAnchorRef = CourseAnchorRef | MaterialSelectorRef | GoalRevisionRef | AssignmentRevisionRef

export type ExactBasisRef = SubjectAnchorRef | LearnerResponseEvidenceRevisionRef | InteractionRef

export type SubjectIntent = Readonly<{
  label: string
  scope: Readonly<{ type: "learner_home" }> | Readonly<{ type: "anchored"; anchors: readonly SubjectAnchorRef[] }>
}>

export type SemanticSnapshotIntent = Readonly<{
  subject: SubjectIntent
  judgmentBody: string
  exactBasisRefs: readonly ExactBasisRef[]
  uncertaintyAndLimits?: string
  basisScope?: "whole_judgment"
}>

export type ExcerptIntent = Readonly<{
  text: string
  startByte: number
  endByte: number
}>

export type CauseIntent =
  | Readonly<{ type: "interpreted_learner_report"; excerpt: ExcerptIntent }>
  | Readonly<{ type: "tutor_model_judgment"; rationale: string }>
  | Readonly<{ type: "exact_owner_observation"; rationale: string }>
  | Readonly<{ type: "learner_correction"; excerpt: ExcerptIntent }>

export type ExpectedHead = Readonly<{
  revisionID: RevisionID
  version: number
  ownerCutFingerprint: string
}>

export type CreateCommand = Readonly<{
  operation: "create"
  cause: Exclude<CauseIntent, { type: "learner_correction" }>
  snapshot: SemanticSnapshotIntent
}>

export type ReviseCommand = Readonly<{
  operation: "revise"
  judgmentID: JudgmentID
  expectedHead: ExpectedHead
  cause: CauseIntent
  snapshot: SemanticSnapshotIntent
  rationale: string
}>

export type RetireCommand = Readonly<{
  operation: "retire"
  judgmentID: JudgmentID
  expectedHead: ExpectedHead
  cause: CauseIntent
  rationale: string
}>

export type RestoreCommand = Readonly<{
  operation: "restore"
  judgmentID: JudgmentID
  expectedHead: ExpectedHead
  cause: CauseIntent
  snapshot?: SemanticSnapshotIntent
  rationale: string
}>

export type Command = CreateCommand | ReviseCommand | RetireCommand | RestoreCommand
export type CanonicalCommand = Command & Readonly<{ schemaVersion: 1 }>

export type LearnerOccurrenceBasis = Readonly<{
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

export type ModelOperationBasis = Readonly<{
  type: "model_operation"
  assistantMessageID: MessageID
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  inputID: Turn.InputID
  occurrenceID: OccurrenceID
  learningContextFingerprint: string
  learningContextCutAsOf: number
  rationale: string
}>

export type AuthorAndCause = Readonly<{
  type: CauseIntent["type"]
  rootModelOperationID: MessageID
  mutationOccurrenceID: OccurrenceID
  mutationPartID: PartID
  source: LearnerOccurrenceBasis | ModelOperationBasis
}>

export type ExactBinding<Ref extends ExactBasisRef = ExactBasisRef> = Readonly<{
  ref: Ref
  refFingerprint: string
  admission: Readonly<{ readonly [key: string]: unknown }>
  admissionFingerprint: string
  firstBoundRevisionID: RevisionID
  firstBoundAt: number
}>

export type Subject = Readonly<{
  label: string
  scope:
    | Readonly<{ type: "learner_home" }>
    | Readonly<{ type: "anchored"; anchors: readonly ExactBinding<SubjectAnchorRef>[] }>
}>

export type SemanticSnapshot = Readonly<{
  subject: Subject
  judgmentBody: string
  basisScope: "whole_judgment"
  exactBasis: readonly ExactBinding[]
  uncertaintyAndLimits?: string
}>

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
  judgmentID: JudgmentID
  version: number
  predecessorRevisionID?: RevisionID
  operation: Operation
  disposition: Disposition
  snapshot: SemanticSnapshot
  authorAndCause: AuthorAndCause
  effectID: EffectID
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type Judgment = Readonly<{
  id: JudgmentID
  timeCreated: number
  current: Revision
}>

export type MaterializedCandidate = Readonly<{
  outcome: "changed" | "no_change"
  judgmentID: JudgmentID
  revisionID: RevisionID
  effectID: EffectID
  previous?: Judgment
  version: number
  predecessorRevisionID?: RevisionID
  operation: Operation
  disposition: Disposition
  snapshot: SemanticSnapshot
  authorAndCause: AuthorAndCause
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
  outcome: "same_effect" | "same_no_change" | "semantic_conflict"
  commandFingerprint: string
  semanticAddressFingerprint: string
  existingOwner:
    | Readonly<{ type: "effect"; effectID: EffectID }>
    | Readonly<{ type: "no_change"; invocationPartID: PartID }>
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

export type AppliedSettlement = Readonly<{
  outcome: "applied"
  learnerStateJudgmentKind: "revision"
  receiptID: ReceiptID
  effectID: EffectID
  judgmentID: JudgmentID
  revisionID: RevisionID
  version: number
  operation: Operation
  disposition: Disposition
  settlementTime: number
  settlementOrder: number
  frontierSequence: number
}>

export type NoChangeSettlement = Readonly<{
  outcome: "no_change"
  learnerStateJudgmentKind: "revision"
  existingOutcome: "materialized_no_change" | "same_no_change"
  judgmentID?: JudgmentID
  revisionID?: RevisionID
  version?: number
  settlementTime: number
  settlementOrder: number
}>

export type AlreadyAppliedSettlement = Readonly<{
  outcome: "already_applied"
  learnerStateJudgmentKind: "revision"
  existingOutcome: "applied"
  receiptID: ReceiptID
  effectID: EffectID
  judgmentID: JudgmentID
  revisionID: RevisionID
  version: number
  operation: Operation
  disposition: Disposition
  settlementTime: number
  settlementOrder: number
  frontierSequence: number
}>

export type Invocation = Readonly<{ envelope: InvocationEnvelope; command: Command }>

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

export type CurrentRelation = "current" | "superseded_by_revision" | "missing"
export type DependencyState = "current" | "changed" | "source_unavailable"

export type DependencyProjection = Readonly<{
  ref: ExactBasisRef
  state: DependencyState
  current?: Readonly<{ readonly [key: string]: unknown }>
  dependencyFingerprint: string
}>

export type ProjectionAtCut = Readonly<{
  judgmentRevisionRef: Readonly<{
    judgmentID: JudgmentID
    revisionID: RevisionID
    version: number
  }>
  ownerCut: OwnerCut
  asOf: number
  currentRelation: CurrentRelation
  currentHeadRevisionID?: RevisionID
  currentHead?: ExpectedHead
  anchorDependencies: readonly DependencyProjection[]
  basisDependencies: readonly DependencyProjection[]
  revision: Revision
}>

export type ContextCandidate = Readonly<{
  judgment: Judgment
  authorClass: "learner_report" | "tutor_model_judgment" | "owner_observation" | "learner_correction"
  anchorKinds: readonly SubjectAnchorRef["type"][]
  hasUncertaintyOrLimits: boolean
}>

export type ContextProjection = Readonly<{
  ownerCut: OwnerCut
  asOf: number
  eligibleAnchorCount: number
  eligibleAnchorsFingerprint: string
  directoryCursor: string
  countAtCut: number
  order: "identity_creation_then_judgment_id_non_priority"
  candidates: readonly ContextCandidate[]
}>

export type ReadQuery =
  | Readonly<{
      type: "discover"
      disposition?: Disposition
      anchor?: SubjectAnchorRef
      directoryCursor?: string
    }>
  | Readonly<{ type: "current"; judgmentID: JudgmentID; asOf: number; directoryCursor?: string }>
  | Readonly<{ type: "revision"; judgmentID: JudgmentID; revisionID: RevisionID }>
  | Readonly<{ type: "history"; judgmentID: JudgmentID }>

export type ReadPage = Readonly<{
  schemaVersion: 1
  ownerCut: OwnerCut
  asOf: number
  order: "identity_creation_then_judgment_id_non_priority" | "revision_version"
  countAtCut: number
  returnedCount: number
  omittedCount: number
  truncated: boolean
  nextCursor?: string
  items: readonly (Judgment | Revision | ProjectionAtCut)[]
  canonicalBytes: number
}>

export class InvalidCommandError extends Schema.TaggedErrorClass<InvalidCommandError>()(
  "LearnerStateJudgment.InvalidCommandError",
  {
    reason: Schema.Literals([
      "validation_error",
      "capacity_exceeded",
      "source_unavailable",
      "stale",
      "illegal_transition",
      "not_found",
    ]),
    detail: Schema.optional(Schema.String),
  },
) {}

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()("LearnerStateJudgment.IntegrityError", {
  detail: Schema.String,
}) {}
