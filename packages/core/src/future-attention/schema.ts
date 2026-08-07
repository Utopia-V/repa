export * as FutureAttentionSchema from "./schema"

import { Schema } from "effect"
import type { Turn } from "@opencode-ai/schema/turn"
import type { Course } from "../course"
import { Identifier } from "../id/id"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import type { ReceiptID, InvocationEnvelope } from "../learning-command/physical-schema"
import type { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"

export const ConcernID = Schema.String.check(Schema.isPattern(/^fac_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("FutureAttention.ConcernID"),
)
export type ConcernID = typeof ConcernID.Type

export const TransitionID = Schema.String.check(Schema.isPattern(/^fat_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("FutureAttention.TransitionID"),
)
export type TransitionID = typeof TransitionID.Type

export const ChangeSetID = Schema.String.check(Schema.isPattern(/^fae_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("FutureAttention.ChangeSetID"),
)
export type ChangeSetID = typeof ChangeSetID.Type

export const ClaimGroupID = Schema.String.check(Schema.isPattern(/^fag_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("FutureAttention.ClaimGroupID"),
)
export type ClaimGroupID = typeof ClaimGroupID.Type

export const FinalizationReceiptID = Schema.String.check(Schema.isPattern(/^far_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("FutureAttention.FinalizationReceiptID"),
)
export type FinalizationReceiptID = typeof FinalizationReceiptID.Type

export const ServiceReceiptID = Schema.String.check(Schema.isPattern(/^fas_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("FutureAttention.ServiceReceiptID"),
)
export type ServiceReceiptID = typeof ServiceReceiptID.Type

const decodeConcernID = Schema.decodeUnknownSync(ConcernID)
const decodeTransitionID = Schema.decodeUnknownSync(TransitionID)
const decodeChangeSetID = Schema.decodeUnknownSync(ChangeSetID)
const decodeClaimGroupID = Schema.decodeUnknownSync(ClaimGroupID)
const decodeFinalizationReceiptID = Schema.decodeUnknownSync(FinalizationReceiptID)
const decodeServiceReceiptID = Schema.decodeUnknownSync(ServiceReceiptID)

export const createConcernID = () => decodeConcernID(Identifier.create("fac", "ascending"))
export const createTransitionID = () => decodeTransitionID(Identifier.create("fat", "ascending"))
export const createChangeSetID = () => decodeChangeSetID(Identifier.create("fae", "ascending"))
export const createClaimGroupID = () => decodeClaimGroupID(Identifier.create("fag", "ascending"))
export const createFinalizationReceiptID = () => decodeFinalizationReceiptID(Identifier.create("far", "ascending"))
export const createServiceReceiptID = () => decodeServiceReceiptID(Identifier.create("fas", "ascending"))

export const MAX_OPERATIONS = 8
export const MAX_PURPOSE_BYTES = 768
export const MAX_EXCERPT_BYTES = 1_024
export const MAX_TEMPORAL_EXPRESSION_BYTES = 256
export const MAX_RATIONALE_BYTES = 1_024
export const MAX_SEMANTIC_VALUE_BYTES = 2_048
export const MAX_READ_ITEMS = 64
export const MAX_READ_BYTES = 32_768

export type Disposition = "open" | "served" | "dismissed" | "superseded"
export type ServiceTiming = "after_creation" | "at_or_after_not_before"
export type InteractionOrder = "learner_response_before_tutor_disclosure"

export type ResolvedZone =
  | Readonly<{ type: "iana"; name: string; releaseID: string }>
  | Readonly<{ type: "fixed_offset"; offsetMinutes: number }>

export type TimeZoneIntent =
  | Readonly<{ type: "source" }>
  | Readonly<{ type: "iana"; name: string }>
  | Readonly<{ type: "fixed_offset"; offsetMinutes: number }>

export type NotBeforeIntent = Readonly<{
  sourceExpression: string
  localDateTime: string
  timeZone: TimeZoneIntent
}>

export type NotBefore = Readonly<{
  instant: number
  sourceExpression: string
  utcOffsetMinutes: number
  resolvedZone: ResolvedZone
}>

export type Source = Readonly<{
  occurrenceID: OccurrenceID
  sourceOrder: number
  sessionID: SessionSchema.ID
  messageID: MessageID
  turnID: Turn.ID
  inputID: Turn.InputID
  timeAdmitted: number
}>

export type ExcerptIntent = Readonly<{
  text: string
  startByte: number
  endByte: number
}>

export type BoundExcerpt = ExcerptIntent &
  Readonly<{
    sha256: string
    source: Source
  }>

export type CreationSourceIntent =
  | Readonly<{ type: "interpreted_learner_request"; excerpt: ExcerptIntent }>
  | Readonly<{ type: "tutor_initiated" }>

export type CreationSource =
  | Readonly<{ type: "interpreted_learner_request"; excerpt: BoundExcerpt }>
  | Readonly<{ type: "tutor_initiated"; source: Source }>

export type OwnerReadReference = Readonly<{
  concernID: ConcernID
  expectedVersion: number
  headTransitionID: TransitionID
  cutFingerprint: string
}>

export type MutationRelationIntent =
  | Readonly<{ type: "interpreted_learner_direction"; excerpt: ExcerptIntent }>
  | Readonly<{ type: "agent_correction"; rationale: string; ownerRead: OwnerReadReference }>

export type MutationRelation =
  | Readonly<{ type: "interpreted_learner_direction"; excerpt: BoundExcerpt }>
  | Readonly<{ type: "agent_correction"; rationale: string; ownerRead: OwnerReadReference }>

export type Target = Readonly<{
  endpoint: Course.MembershipEndpoint
  selection: Course.MembershipSelection
}>

export type TargetSnapshot = Target & Readonly<{ receipt: Course.MembershipReceipt }>

export type ConcernPayloadIntent = Readonly<{
  purpose: string
  source: CreationSourceIntent
  target: Target
  notBefore: NotBeforeIntent
  serviceTiming: ServiceTiming
  interactionOrder?: InteractionOrder
}>

export type ConcernPayload = Readonly<{
  purpose: string
  source: CreationSource
  target: TargetSnapshot
  notBefore: NotBefore
  serviceTiming: ServiceTiming
  interactionOrder?: InteractionOrder
}>

export type LearnerResponseWitnessIntent = Readonly<{ occurrenceID: OccurrenceID }>

export type ServiceSourceIntent =
  | Readonly<{ type: "learner_occurrence" }>
  | Readonly<{ type: "assistant_completion"; assistantMessageID: MessageID }>
  | Readonly<{ type: "tool_result"; partID: PartID }>
  | Readonly<{ type: "child_result"; parentTaskPartID: PartID }>
  | Readonly<{ type: "current_assistant_when_complete" }>

export type CompleteServiceSource =
  | Readonly<{ type: "learner_occurrence"; source: Source; timeCompleted: number; sourceOrder: number }>
  | Readonly<{
      type: "assistant_completion"
      sessionID: SessionSchema.ID
      turnID: Turn.ID
      assistantMessageID: MessageID
      timeCompleted: number
      presentationFingerprint: string
      eligibleOutputFingerprint: string
    }>
  | Readonly<{
      type: "tool_result"
      sessionID: SessionSchema.ID
      turnID: Turn.ID
      assistantMessageID: MessageID
      partID: PartID
      tool: string
      sourceUse: "learner_usable"
      timeCompleted: number
      resultFingerprint: string
    }>
  | Readonly<{
      type: "child_result"
      parentSessionID: SessionSchema.ID
      parentTurnID: Turn.ID
      parentTaskPartID: PartID
      childTurnID: Turn.ID
      timeCompleted: number
      resultFingerprint: string
    }>

export type ServiceAlignmentIntent = Readonly<{
  source: ServiceSourceIntent
  rationale: string
  learnerResponseWitness?: LearnerResponseWitnessIntent
}>

export type SuccessorSourceIntent =
  | Readonly<{ type: "preserve_predecessor_source" }>
  | Readonly<{ type: "rebind_current_source"; source: CreationSourceIntent }>

export type SuccessorDispositionIntent =
  | Readonly<{ type: "open" }>
  | Readonly<{ type: "dismissed_by_mutation"; rationale: string }>
  | Readonly<{ type: "carry_served"; rationale: string }>
  | Readonly<{ type: "carry_dismissed"; rationale: string }>
  | Readonly<{ type: "serve_complete_source"; service: ServiceAlignmentIntent }>
  | Readonly<{ type: "serve_current_assistant_when_complete"; service: Omit<ServiceAlignmentIntent, "source"> }>

export type CreateOperation = Readonly<{
  type: "create"
  concern: ConcernPayloadIntent
}>

export type ReplaceOperation = Readonly<{
  type: "replace"
  concernID: ConcernID
  expectedVersion: number
  mutation: MutationRelationIntent
  successorSource: SuccessorSourceIntent
  concern: Omit<ConcernPayloadIntent, "source">
  successorDisposition: SuccessorDispositionIntent
}>

export type ServeOperation = Readonly<{
  type: "serve"
  concernID: ConcernID
  expectedVersion: number
  service: ServiceAlignmentIntent
}>

export type DismissOperation = Readonly<{
  type: "dismiss"
  concernID: ConcernID
  expectedVersion: number
  mutation: MutationRelationIntent
}>

export type ReopenOperation = Readonly<{
  type: "reopen"
  concernID: ConcernID
  expectedVersion: number
  mutation: MutationRelationIntent
}>

export type Operation = CreateOperation | ReplaceOperation | ServeOperation | DismissOperation | ReopenOperation
export type ChangeSetCommand = Readonly<{ operations: readonly Operation[] }>
export type CanonicalChangeSet = Readonly<{ schemaVersion: 1; operations: readonly Operation[] }>

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

export type MaterializedCreate = Readonly<{
  materializedType: "create"
  operation: CreateOperation
  concernID: ConcernID
  payload: ConcernPayload
}>

export type MaterializedExisting = Readonly<{
  materializedType: "existing"
  operation: Exclude<Operation, CreateOperation>
  current: ConcernSnapshot
  mutation?: MutationRelation
  successorID?: ConcernID
  successorPayload?: ConcernPayload
  immediateService?: CompleteServiceSource
}>

export type MaterializedOperation = MaterializedCreate | MaterializedExisting

export type Candidate = Readonly<{
  kind: "candidate_v1"
  changeSetID: ChangeSetID
  commandFingerprint: string
  semanticAddressFingerprint: string
  agentActionFingerprint: string
  canonicalCommand: CanonicalChangeSet
  agentAction: AgentAction
  commandCause: Source
  operations: readonly MaterializedOperation[]
}>

export type SemanticTerminal = Readonly<{
  kind: "semantic_terminal_v1"
  outcome: "already_applied" | "semantic_conflict"
  commandFingerprint: string
  semanticAddressFingerprint: string
  existingChangeSetID: ChangeSetID
}>

export type TransitionKind =
  | "created"
  | "superseded"
  | "served"
  | "dismissed"
  | "reopened"
  | "served_by_correction"
  | "dismissed_by_correction"

export type Transition = Readonly<{
  id: TransitionID
  concernID: ConcernID
  version: number
  predecessorID?: TransitionID
  kind: TransitionKind
  disposition: Disposition
  mutation?: MutationRelation
  rationale?: string
  serviceReceiptID?: ServiceReceiptID
  changeSetID: ChangeSetID
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type ConcernSnapshot = Readonly<{
  id: ConcernID
  predecessorConcernID?: ConcernID
  successorConcernID?: ConcernID
  payload: ConcernPayload
  current: Transition
  timeCreated: number
  createChangeSetID: ChangeSetID
}>

export type ClaimMember = Readonly<{
  ordinal: number
  concernID: ConcernID
  expectedVersion: number
  expectedTransitionID: TransitionID
  rationale: string
  learnerResponseWitness?: LearnerResponseWitnessIntent
}>

export type ClaimGroup = Readonly<{
  id: ClaimGroupID
  changeSetID: ChangeSetID
  physicalReceiptID: ReceiptID
  invocationPartID: PartID
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  occurrenceID: OccurrenceID
  assistantMessageID: MessageID
  modelOperationID: MessageID
  members: readonly ClaimMember[]
  timeAdmitted: number
}>

export type CompletionFacts = Readonly<{
  observationCut: "live_presentation_finalized" | "startup_reconciled"
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  occurrenceID: OccurrenceID
  assistantMessageID: MessageID
  modelOperationID: MessageID
  invocationPartID: PartID
  modelOutcome: "completed" | "failed" | "interrupted"
  localToolPartsTerminal: boolean
  presentationCommitted: boolean
  presentationUnavailable: boolean
  timeCompleted: number
  completionOrder: number
  partManifestFingerprint?: string
  eligibleOutputFingerprint?: string
  eligibleOutputBytes: number
  finalStructuredOutputFingerprint?: string
}>

export type FinalizationMemberResult = Readonly<{
  ordinal: number
  concernID: ConcernID
  outcome: "served" | "not_served"
  transitionID?: TransitionID
  serviceReceiptID?: ServiceReceiptID
  reason?:
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

export type FinalizationReceipt = Readonly<{
  id: FinalizationReceiptID
  groupID: ClaimGroupID
  outcome: "served" | "not_served"
  completion: CompletionFacts
  members: readonly FinalizationMemberResult[]
  timeFinalized: number
  finalizationOrder: number
  frontierSequence?: number
}>

export type ChangeProjection =
  | Readonly<{
      operation: Exclude<Operation["type"], "replace">
      outcome: "changed" | "no_effect"
      concernID: ConcernID
      version: number
      disposition: Disposition
      transitionID: TransitionID
    }>
  | Readonly<{
      operation: "replace"
      outcome: "changed"
      concernID: ConcernID
      version: number
      disposition: "superseded"
      transitionID: TransitionID
      successorConcernID: ConcernID
      successorVersion: number
      successorDisposition: Exclude<Disposition, "superseded">
      successorTransitionID: TransitionID
    }>

export type ClaimProjection = Readonly<{
  groupID: ClaimGroupID
  claimState: "pending" | "served" | "not_served"
  finalizationReceiptID?: FinalizationReceiptID
}>

export type AppliedSettlement = Readonly<{
  outcome: "applied"
  futureAttentionKind: "change_set"
  schemaVersion: 1
  receiptID: ReceiptID
  effectID: ChangeSetID
  occurrenceID: OccurrenceID
  changes: readonly ChangeProjection[]
  claim?: ClaimProjection & Readonly<{ claimStateAtAdmission: "pending" }>
  settlementTime: number
  settlementOrder: number
}>

export type AlreadyAppliedSettlement = Omit<AppliedSettlement, "outcome" | "claim"> &
  Readonly<{
    outcome: "already_applied"
    claim?: ClaimProjection & Readonly<{ claimStateAtAdmission: "pending" }>
  }>

export type NoChangeSettlement = Readonly<{
  outcome: "no_change"
  futureAttentionKind: "change_set"
  schemaVersion: 1
  occurrenceID: OccurrenceID
  changes: readonly ChangeProjection[]
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
  semanticTerminal?: Readonly<{ outcome: "already_applied" | "semantic_conflict"; existingChangeSetID: ChangeSetID }>
  capabilityOutcome?: CapabilityOutcome
  permissionRequestID?: string
  timeAdmitted: number
}>

export type SourceAvailability =
  | Readonly<{ state: "available" }>
  | Readonly<{ state: "source_unavailable"; reason: "source_deleted" | "presentation_unavailable" }>

export type TargetStatus = "target_current" | "target_stale" | "target_missing"

export type ConcernView = Readonly<{
  concern: ConcernSnapshot
  sourceAvailability: SourceAvailability
  targetStatus: TargetStatus
  eligible: boolean
  claim?: ClaimProjection
  serviceReceipt?: Readonly<{
    id: ServiceReceiptID
    source: CompleteServiceSource
    sourceAvailability: SourceAvailability
    rationale: string
    learnerResponseWitness?: LearnerResponseWitnessIntent
    carriedFromServiceReceiptID?: ServiceReceiptID
    claimGroupID?: ClaimGroupID
  }>
  ownerCut: Readonly<{ frontierSequence: number; time: number; fingerprint: string }>
}>

export type ContextProjection = Readonly<{
  countAtCut: number
  entries: readonly ConcernView[]
  omittedCount: number
  truncated: boolean
  order: "not_before_then_created_then_id_non_priority"
  ownerCut: Readonly<{ frontierSequence: number; time: number; fingerprint: string }>
}>

export type ReadQuery =
  | Readonly<{ type: "concern"; concernID: ConcernID }>
  | Readonly<{ type: "claim_group"; groupID: ClaimGroupID }>
  | Readonly<{
      type: "list"
      dispositions?: readonly Disposition[]
      targetStatus?: readonly TargetStatus[]
      from?: number
      through?: number
    }>

export type ReadPage = Readonly<{
  query: ReadQuery
  items: readonly (ConcernView | Readonly<{ group: ClaimGroup; receipt?: FinalizationReceipt }>)[]
  countAtCut: number
  returnedCount: number
  nextCursor: string | null
  truncated: boolean
  omittedCount: number
  order: "storage_non_priority"
  canonicalBytes: number
  ownerCut: Readonly<{ frontierSequence: number; time: number; fingerprint: string }>
}>

export class InvalidCommandError extends Schema.TaggedErrorClass<InvalidCommandError>()(
  "FutureAttention.InvalidCommandError",
  {
    reason: Schema.Literals([
      "validation_error",
      "capacity_exceeded",
      "source_unavailable",
      "stale",
      "target_not_current",
      "too_early",
      "illegal_issuer",
    ]),
  },
) {}

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()("FutureAttention.IntegrityError", {
  detail: Schema.String,
}) {}
