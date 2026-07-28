import { ArtifactSchema } from "../artifact/schema"
import type { CourseID, RevisionID, Selection, SelectionAcceptanceEffectID, SelectionAcceptanceInput } from "../course"
import { RepresentationSchema } from "../representation/schema"
import type { PermissionV1 } from "../v1/permission"
import type {
  AnchorEffect,
  AnchorEffectID,
  AnchorProjection,
  DefaultConfirmationSnapshot,
  DefaultCourseCommand,
  DefaultEffect,
  DefaultEffectID,
  DefaultProjection,
  RouteAnchorCommand,
} from "../learner-navigation/schema"
import type { OccurrenceID } from "./occurrence-schema"
import type { RetainedSteering } from "../retained-steering"
import type { LearnerGoal } from "../learner-goal"
import type { InvocationEnvelope, ReceiptID } from "./physical-schema"

export {
  AppliedAssistantImmutableError,
  AuthorizationBasis,
  InvalidInvocationEnvelopeError,
  InvocationConflictError,
  InvocationNotFoundError,
  InvocationTranscriptUnavailableError,
  ReceiptID,
  SettledPartImmutableError,
  createReceiptID,
} from "./physical-schema"
export type {
  Error,
  InvocationEnvelope,
  PermissionOutcome,
  PhysicalSettlement,
  SettlementMetadata,
} from "./physical-schema"

export type AcceptCourseViewRevisionInvocation = {
  readonly envelope: InvocationEnvelope
  readonly command: SelectionAcceptanceInput
}

export type RepresentationConvertCommand = {
  readonly effectiveArtifactID: ArtifactSchema.ArtifactID
  readonly sourceRevisionID: ArtifactSchema.RevisionID
}

export type RepresentationConvertInvocation = {
  readonly envelope: InvocationEnvelope
  readonly command: RepresentationConvertCommand
  /** Selected by trusted Repa code, never by the initiating model payload. */
  readonly producerKind: RepresentationSchema.ProducerKind
}

export type SetDefaultCoursePreferenceInvocation = {
  readonly envelope: InvocationEnvelope
  readonly command: DefaultCourseCommand
  readonly permissionRequestID: PermissionV1.ID
}

export type SetCourseRouteAnchorInvocation = {
  readonly envelope: InvocationEnvelope
  readonly command: RouteAnchorCommand
}

export type NavigationInvocation = SetDefaultCoursePreferenceInvocation | SetCourseRouteAnchorInvocation

export type RetainedSteeringInvocation = RetainedSteering.Invocation

export type LearnerGoalInvocation = LearnerGoal.Invocation

export type AppliedSettlement = {
  readonly outcome: "applied"
  readonly receiptID: ReceiptID
  readonly effectID: SelectionAcceptanceEffectID
  readonly courseID: CourseID
  readonly revisionID: RevisionID
  readonly previousSelection: Selection
  readonly committedSelection: Selection
  readonly settlementTime: number
  readonly settlementOrder: number
}

export type AlreadyAppliedSettlement = {
  readonly outcome: "already_applied"
  readonly receiptID: ReceiptID
  readonly effectID: SelectionAcceptanceEffectID
  readonly courseID: CourseID
  readonly revisionID: RevisionID
  readonly previousSelection: Selection
  readonly committedSelection: Selection
  readonly currentSelection: Selection
  readonly relation: "active" | "superseded"
  readonly settlementTime: number
  readonly settlementOrder: number
}

export type RepresentationAppliedSettlement = {
  readonly outcome: "applied"
  readonly receiptID: ReceiptID
  readonly effectID: RepresentationSchema.EffectID
  readonly representationRevisionID: RepresentationSchema.RevisionID
  readonly effectiveArtifactID: ArtifactSchema.ArtifactID
  readonly sourceRevisionID: ArtifactSchema.RevisionID
  readonly producerKind: RepresentationSchema.ProducerKind
  readonly settlementTime: number
  readonly settlementOrder: number
}

export type RepresentationAlreadyAppliedSettlement = {
  readonly outcome: "already_applied"
  readonly receiptID: ReceiptID
  readonly effectID: RepresentationSchema.EffectID
  readonly representationRevisionID: RepresentationSchema.RevisionID
  readonly effectiveArtifactID: ArtifactSchema.ArtifactID
  readonly sourceRevisionID: ArtifactSchema.RevisionID
  readonly producerKind: RepresentationSchema.ProducerKind
  readonly settlementTime: number
  readonly settlementOrder: number
}

export type DefaultCourseAppliedSettlement = {
  readonly outcome: "applied"
  readonly navigationKind: "default_course_preference"
  readonly receiptID: ReceiptID
  readonly effectID: DefaultEffectID
  readonly effect: DefaultEffect
  readonly current: DefaultProjection
  readonly confirmation: DefaultConfirmationSnapshot
  readonly settlementTime: number
  readonly settlementOrder: number
}

export type DefaultCourseAlreadyAppliedSettlement = {
  readonly outcome: "already_applied"
  readonly navigationKind: "default_course_preference"
  readonly receiptID: ReceiptID
  readonly effectID: DefaultEffectID
  readonly effect: DefaultEffect
  readonly current: DefaultProjection
  readonly relation: "active" | "superseded"
  readonly confirmation: DefaultConfirmationSnapshot
  readonly settlementTime: number
  readonly settlementOrder: number
}

export type RouteAnchorAppliedSettlement = {
  readonly outcome: "applied"
  readonly navigationKind: "course_route_anchor"
  readonly receiptID: ReceiptID
  readonly effectID: AnchorEffectID
  readonly effect: AnchorEffect
  readonly current: AnchorProjection
  readonly settlementTime: number
  readonly settlementOrder: number
}

export type RouteAnchorAlreadyAppliedSettlement = {
  readonly outcome: "already_applied"
  readonly navigationKind: "course_route_anchor"
  readonly receiptID: ReceiptID
  readonly effectID: AnchorEffectID
  readonly effect: AnchorEffect
  readonly current: AnchorProjection
  readonly relation: "active" | "superseded"
  readonly settlementTime: number
  readonly settlementOrder: number
}

export type NavigationNoChangeSettlement = {
  readonly outcome: "no_change"
  readonly navigationKind: "default_course_preference" | "course_route_anchor"
  readonly current: DefaultProjection | AnchorProjection
  readonly settlementTime: number
  readonly settlementOrder: number
}

export type ErrorCode =
  | "semantic_conflict"
  | "context_refresh_required"
  | "permission_rejected"
  | "permission_corrected"
  | "cancelled"
  | "interrupted"
  | "source_unavailable"
  | "temporal_context_unavailable"
  | "capacity_exceeded"
  | "ambiguous_content_root"
  | "unsupported_source"
  | "source_too_large"
  | "producer_unavailable"
  | "producer_failed"
  | "producer_timeout"
  | "invalid_producer_output"
  | "publication_failed"
  | "outcome_unknown"
  | "stale"
  | "inactive"
  | "validation_error"

export type ErrorSettlement = {
  readonly outcome: "error"
  readonly code: ErrorCode
  readonly settlementTime: number
  readonly settlementOrder: number
  readonly detail?: {
    readonly entity?: "course" | "view" | "revision" | "selection" | "goal"
    readonly id?: string
    readonly effectID?: SelectionAcceptanceEffectID | RetainedSteering.TransitionID | LearnerGoal.EffectID
    readonly acceptedRevisionID?: RevisionID
  }
}

export type Settlement =
  | AppliedSettlement
  | AlreadyAppliedSettlement
  | RepresentationAppliedSettlement
  | RepresentationAlreadyAppliedSettlement
  | DefaultCourseAppliedSettlement
  | DefaultCourseAlreadyAppliedSettlement
  | RouteAnchorAppliedSettlement
  | RouteAnchorAlreadyAppliedSettlement
  | NavigationNoChangeSettlement
  | RetainedSteering.AppliedSettlement
  | RetainedSteering.AlreadyAppliedSettlement
  | RetainedSteering.NoChangeSettlement
  | LearnerGoal.AppliedSettlement
  | LearnerGoal.AlreadyAppliedSettlement
  | LearnerGoal.NoChangeSettlement
  | ErrorSettlement

export type Reservation =
  | { readonly type: "candidate" }
  | { readonly type: "terminal"; readonly reason: "already_applied" | "semantic_conflict" | "context_refresh_required" }
  | { readonly type: "admitted" }
  | { readonly type: "replay"; readonly settlement: Settlement }

export type SettlementResult =
  | { readonly type: "candidate" }
  | { readonly type: "settled"; readonly settlement: Settlement }
  | { readonly type: "replay"; readonly settlement: Settlement }
