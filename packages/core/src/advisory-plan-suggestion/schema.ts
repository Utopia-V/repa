export * as AdvisoryPlanSuggestionSchema from "./schema"

import type { Turn } from "@opencode-ai/schema/turn"
import { Schema } from "effect"
import type { Assignment } from "../assignment"
import type { Course } from "../course"
import { Identifier } from "../id/id"
import type { LearnerGoal } from "../learner-goal"
import type { LearnerResponseEvidence } from "../learner-response-evidence"
import type { LearnerStateJudgment } from "../learner-state-judgment"
import type { OccurrenceID, SourceTemporalContext } from "../learning-command/occurrence-schema"
import type { InvocationEnvelope, ReceiptID } from "../learning-command/physical-schema"
import type { MaterialMap } from "../material-map"
import type { SessionSchema } from "../session/schema"
import type { TurnLearningContext } from "../turn/learning-context"
import type { MessageID, PartID } from "../v1/session"

export const SuggestionID = Schema.String.check(Schema.isPattern(/^aps_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("AdvisoryPlanSuggestion.ID"),
)
export type SuggestionID = typeof SuggestionID.Type

export const RevisionID = Schema.String.check(Schema.isPattern(/^apr_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("AdvisoryPlanSuggestion.RevisionID"),
)
export type RevisionID = typeof RevisionID.Type

export const EffectID = Schema.String.check(Schema.isPattern(/^ape_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("AdvisoryPlanSuggestion.EffectID"),
)
export type EffectID = typeof EffectID.Type

const decodeSuggestionID = Schema.decodeUnknownSync(SuggestionID)
const decodeRevisionID = Schema.decodeUnknownSync(RevisionID)
const decodeEffectID = Schema.decodeUnknownSync(EffectID)

export const createSuggestionID = () => decodeSuggestionID(Identifier.create("aps", "ascending"))
export const createRevisionID = () => decodeRevisionID(Identifier.create("apr", "ascending"))
export const createEffectID = () => decodeEffectID(Identifier.create("ape", "ascending"))
export const suggestionIDFromDigest = (digest: string) => decodeSuggestionID(`aps_${digest.slice(0, 26)}`)
export const revisionIDFromDigest = (digest: string) => decodeRevisionID(`apr_${digest.slice(0, 26)}`)
export const effectIDFromDigest = (digest: string) => decodeEffectID(`ape_${digest.slice(0, 26)}`)

export const MAX_LEARNER_VISIBLE_SCOPE_BYTES = 384
export const MAX_PURPOSE_BYTES = 384
export const MAX_DIRECTORY_SUMMARY_BYTES = 512
export const MAX_BODY_BYTES = 8_192
export const MAX_ASSUMPTIONS_BYTES = 2_048
export const MAX_EXCERPT_BYTES = 1_024
export const MAX_RATIONALE_BYTES = 1_024
export const MAX_RETRIEVAL_ANCHORS = 8
export const MAX_BASIS_REFS = 16
export const MAX_INTENTS = 8
export const MAX_CONTEXT_ENTRIES = 8
export const MAX_DIRECTORY_KEYS = 128
export const MAX_SEMANTIC_VALUE_BYTES = 2_048
export const MAX_READ_ITEMS = 64
export const MAX_READ_BYTES = 32_768
export const MAX_BINDING_ADMISSION_BYTES = 2_048
export const MAX_DURABLE_SNAPSHOT_BYTES = 24_000

export type Disposition = "active" | "retired"
export type Operation = "create" | "alternative" | "revise" | "retire" | "restore"

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

export type LearnerStateJudgmentRevisionRef = Readonly<{
  type: "learner_state_judgment_revision"
  judgmentID: LearnerStateJudgment.JudgmentID
  revisionID: LearnerStateJudgment.RevisionID
  version: number
}>

export type InteractionRef = Readonly<{
  type: "interaction"
  locator: TurnLearningContext.Locator
}>

export type SuggestionRevisionRef = Readonly<{
  suggestionID: SuggestionID
  revisionID: RevisionID
  version: number
}>

export type SuggestionBasisRef = Readonly<{
  type: "advisory_plan_suggestion_revision"
  suggestionID: SuggestionID
  revisionID: RevisionID
  version: number
}>

export type RetrievalBoundRef =
  | CourseAnchorRef
  | MaterialSelectorRef
  | GoalRevisionRef
  | AssignmentRevisionRef
  | LearnerStateJudgmentRevisionRef

export type ExactBasisRef =
  | RetrievalBoundRef
  | LearnerResponseEvidenceRevisionRef
  | InteractionRef
  | SuggestionBasisRef

export type StableOwnerKey =
  | Readonly<{ type: "course"; courseID: Course.CourseID }>
  | Readonly<{ type: "course_view"; courseID: Course.CourseID; viewID: Course.ViewID }>
  | Readonly<{ type: "goal"; goalID: LearnerGoal.GoalID }>
  | Readonly<{ type: "assignment"; assignmentID: Assignment.AssignmentID }>
  | Readonly<{ type: "material_selector"; mapID: MaterialMap.MapID; selectorID: MaterialMap.SelectorID }>
  | Readonly<{ type: "learner_state_judgment"; judgmentID: LearnerStateJudgment.JudgmentID }>

export type RetrievalAnchorIntent = Readonly<{
  stableOwnerKey: StableOwnerKey
  exactBoundRef: RetrievalBoundRef
}>

export type RetrievalScopeIntent =
  | Readonly<{ type: "anchored"; anchors: readonly RetrievalAnchorIntent[] }>
  | Readonly<{
      type: "learner_home_fallback"
      reason: "no_stable_owner_anchor" | "deliberately_cross_cutting"
    }>

export type SemanticSnapshotIntent = Readonly<{
  learnerVisibleScope: string
  retrievalScope: RetrievalScopeIntent
  purpose: string
  directorySummary: string
  body: string
  exactBasisRefs: readonly ExactBasisRef[]
  assumptionsAndUncertainty?: string
}>

export type ExcerptIntent = Readonly<{
  text: string
  startByte: number
  endByte: number
}>

export type CauseIntent =
  | Readonly<{ type: "responsive_tutor_proposal"; excerpt: ExcerptIntent; rationale: string }>
  | Readonly<{ type: "proactive_tutor_proposal"; rationale: string }>
  | Readonly<{ type: "learner_revision"; excerpt: ExcerptIntent }>
  | Readonly<{ type: "tutor_revision"; rationale: string }>

export type ExpectedHead = Readonly<{
  revisionID: RevisionID
  version: number
  ownerCutFingerprint: string
}>

type IntentIdentity = Readonly<{ operationOrdinal: number }>
type CreateIdentity = IntentIdentity & Readonly<{ createOrdinal: number }>

export type CreateIntent = CreateIdentity &
  Readonly<{
    operation: "create"
    snapshot: SemanticSnapshotIntent
  }>

export type AlternativeIntent = CreateIdentity &
  Readonly<{
    operation: "alternative"
    alternativeToRevision: SuggestionRevisionRef
    snapshot: SemanticSnapshotIntent
  }>

export type ReviseIntent = IntentIdentity &
  Readonly<{
    operation: "revise"
    suggestionID: SuggestionID
    expectedHead: ExpectedHead
    snapshot: SemanticSnapshotIntent
    rationale: string
  }>

export type RetireIntent = IntentIdentity &
  Readonly<{
    operation: "retire"
    suggestionID: SuggestionID
    expectedHead: ExpectedHead
    rationale: string
  }>

export type RestoreIntent = IntentIdentity &
  Readonly<{
    operation: "restore"
    suggestionID: SuggestionID
    expectedHead: ExpectedHead
    snapshot?: SemanticSnapshotIntent
    rationale: string
  }>

export type Intent = CreateIntent | AlternativeIntent | ReviseIntent | RetireIntent | RestoreIntent
export type Command = Readonly<{ cause: CauseIntent; intents: readonly Intent[] }>
export type CanonicalCommand = Readonly<{ schemaVersion: 1; cause: CauseIntent; intents: readonly Intent[] }>

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
  responsiveLearnerBasis?: LearnerOccurrenceBasis
}>

export type AuthorAndCause = Readonly<{
  type: CauseIntent["type"]
  rootModelOperationID: MessageID
  mutationOccurrenceID: OccurrenceID
  mutationPartID: PartID
  source: LearnerOccurrenceBasis | ModelOperationBasis
}>

export type ExactBinding<Ref extends ExactBasisRef | RetrievalBoundRef = ExactBasisRef> = Readonly<{
  ref: Ref
  refFingerprint: string
  admission: Readonly<{ readonly [key: string]: unknown }>
  admissionFingerprint: string
  firstBoundRevisionID: RevisionID
  firstBoundAt: number
}>

export type RetrievalAnchor = Readonly<{
  stableOwnerKey: StableOwnerKey
  exactBound: ExactBinding<RetrievalBoundRef>
}>

export type RetrievalScope =
  | Readonly<{ type: "anchored"; anchors: readonly RetrievalAnchor[] }>
  | Readonly<{
      type: "learner_home_fallback"
      reason: "no_stable_owner_anchor" | "deliberately_cross_cutting"
    }>

export type SemanticSnapshot = Readonly<{
  learnerVisibleScope: string
  retrievalScope: RetrievalScope
  purpose: string
  directorySummary: string
  body: string
  exactBasis: readonly ExactBinding[]
  assumptionsAndUncertainty?: string
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
  suggestionID: SuggestionID
  version: number
  predecessorRevisionID?: RevisionID
  operation: Operation
  operationOrdinal: number
  disposition: Disposition
  snapshot: SemanticSnapshot
  alternativeToRevision?: SuggestionRevisionRef
  authorAndCause: AuthorAndCause
  effectID: EffectID
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type Suggestion = Readonly<{
  id: SuggestionID
  timeCreated: number
  alternativeToRevision?: SuggestionRevisionRef
  current: Revision
}>

export type MaterializedIntent = Readonly<{
  outcome: "changed" | "no_change"
  suggestionID: SuggestionID
  revisionID: RevisionID
  effectID: EffectID
  previous?: Suggestion
  version: number
  predecessorRevisionID?: RevisionID
  operation: Operation
  operationOrdinal: number
  createOrdinal?: number
  disposition: Disposition
  snapshot: SemanticSnapshot
  alternativeToRevision?: SuggestionRevisionRef
  authorAndCause: AuthorAndCause
}>

export type Candidate = Readonly<{
  kind: "candidate_v1"
  commandFingerprint: string
  semanticAddressFingerprint: string
  agentActionFingerprint: string
  canonicalCommand: CanonicalCommand
  agentAction: AgentAction
  effectID: EffectID
  materialized: readonly MaterializedIntent[]
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
  advisoryPlanSuggestionKind: "change_set"
  receiptID: ReceiptID
  effectID: EffectID
  intentResults: readonly IntentResult[]
  settlementTime: number
  settlementOrder: number
  frontierSequence: number
}>

export type NoChangeSettlement = Readonly<{
  outcome: "no_change"
  advisoryPlanSuggestionKind: "change_set"
  existingOutcome: "materialized_no_change" | "same_no_change"
  intentResults: readonly IntentResult[]
  settlementTime: number
  settlementOrder: number
}>

export type AlreadyAppliedSettlement = Readonly<{
  outcome: "already_applied"
  advisoryPlanSuggestionKind: "change_set"
  existingOutcome: "applied"
  receiptID: ReceiptID
  effectID: EffectID
  intentResults: readonly IntentResult[]
  settlementTime: number
  settlementOrder: number
  frontierSequence: number
}>

export type IntentResult = Readonly<{
  outcome: "changed" | "no_change"
  suggestionID: SuggestionID
  revisionID: RevisionID
  version: number
  operation: Operation
  operationOrdinal: number
  disposition: Disposition
  alternativeToRevision?: SuggestionRevisionRef
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
  ref: ExactBasisRef | RetrievalBoundRef
  state: DependencyState
  current?: Readonly<{ readonly [key: string]: unknown }>
  dependencyFingerprint: string
}>

export type RetrievalAnchorProjection = Readonly<{
  stableOwnerKey: StableOwnerKey
  exactBoundRef: RetrievalBoundRef
  refFingerprint: string
  relation: DependencyProjection
}>

export type AlternativeTargetProjection = Readonly<{
  target: SuggestionRevisionRef
  headRelation: "same_head" | "head_advanced" | "source_unavailable"
  lifecycle: Disposition | "source_unavailable"
  currentHead?: SuggestionRevisionRef
}>

export type ProjectionAtCut = Readonly<{
  suggestionRevisionRef: SuggestionRevisionRef
  ownerCut: OwnerCut
  asOf: number
  currentRelation: CurrentRelation
  currentHeadRevisionID?: RevisionID
  currentHead?: ExpectedHead
  retrievalAnchorRelations: readonly RetrievalAnchorProjection[]
  basisDependencies: readonly DependencyProjection[]
  alternativeTarget?: AlternativeTargetProjection
  revision: Revision
}>

export type AuthorClass =
  | "responsive_tutor_proposal"
  | "proactive_tutor_proposal"
  | "learner_revision"
  | "tutor_revision"

export type ContextCandidate = Readonly<{
  suggestion: Suggestion
  projection: ProjectionAtCut
  authorClass: AuthorClass
  retrievalArm: RetrievalScope["type"]
  anchorKinds: readonly StableOwnerKey["type"][]
}>

export type ContextProjection = Readonly<{
  ownerCut: OwnerCut
  asOf: number
  eligibleKeyCount: number
  eligibleKeysFingerprint: string
  directoryCursor: string
  countAtCut: number
  order: "identity_creation_then_suggestion_id_non_priority"
  candidates: readonly ContextCandidate[]
}>

export type ReadQuery =
  | Readonly<{
      type: "discover"
      disposition?: Disposition
      stableOwnerKey?: StableOwnerKey
      directoryCursor?: string
    }>
  | Readonly<{ type: "current"; suggestionID: SuggestionID; asOf: number; directoryCursor?: string }>
  | Readonly<{ type: "revision"; suggestionID: SuggestionID; revisionID: RevisionID }>
  | Readonly<{ type: "history"; suggestionID: SuggestionID }>

export type ReadPage = Readonly<{
  schemaVersion: 1
  ownerCut: OwnerCut
  asOf: number
  order: "identity_creation_then_suggestion_id_non_priority" | "revision_version"
  countAtCut: number
  returnedCount: number
  omittedCount: number
  truncated: boolean
  nextCursor?: string
  items: readonly (Suggestion | Revision | ProjectionAtCut)[]
  canonicalBytes: number
}>

export class InvalidCommandError extends Schema.TaggedErrorClass<InvalidCommandError>()(
  "AdvisoryPlanSuggestion.InvalidCommandError",
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

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()("AdvisoryPlanSuggestion.IntegrityError", {
  detail: Schema.String,
}) {}
