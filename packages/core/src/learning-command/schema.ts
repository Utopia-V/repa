import { Schema } from "effect"
import type { Turn } from "@opencode-ai/schema/turn"
import { ArtifactSchema } from "../artifact/schema"
import type { CourseID, RevisionID, Selection, SelectionAcceptanceEffectID, SelectionAcceptanceInput } from "../course"
import { Identifier } from "../id/id"
import { RepresentationSchema } from "../representation/schema"
import { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"
import type { OccurrenceID } from "./occurrence-schema"

export const ReceiptID = Schema.String.check(Schema.isPattern(/^lcr_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearningCommand.ReceiptID"),
)
export type ReceiptID = typeof ReceiptID.Type

const decodeReceiptID = Schema.decodeUnknownSync(ReceiptID)

export const createReceiptID = () => decodeReceiptID(Identifier.create("lcr", "ascending"))

export const AuthorizationBasis = Schema.Union([
  Schema.Literal("learner_request"),
  Schema.Literal("learner_acceptance"),
])
export type AuthorizationBasis = typeof AuthorizationBasis.Type

export type InvocationEnvelope = {
  readonly occurrenceID: OccurrenceID
  readonly turnID: Turn.ID
  readonly inputID: Turn.InputID
  readonly sessionID: SessionSchema.ID
  readonly parentUserMessageID: MessageID
  readonly assistantMessageID: MessageID
  readonly partID: PartID
  readonly providerCallID: string
  readonly emissionOrdinal: number
  readonly capabilityIdentity: string
  readonly capabilityVersion: number
  readonly authorizationBasis: AuthorizationBasis
  readonly timeAdmitted: number
}

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

export type SettlementMetadata = {
  readonly time: number
  readonly order: number
}

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

export type ErrorCode =
  | "semantic_conflict"
  | "context_refresh_required"
  | "permission_rejected"
  | "permission_corrected"
  | "cancelled"
  | "interrupted"
  | "source_unavailable"
  | "ambiguous_content_root"
  | "unsupported_source"
  | "source_too_large"
  | "producer_unavailable"
  | "producer_failed"
  | "producer_timeout"
  | "invalid_producer_output"
  | "publication_failed"
  | "stale"
  | "inactive"
  | "validation_error"

export type ErrorSettlement = {
  readonly outcome: "error"
  readonly code: ErrorCode
  readonly settlementTime: number
  readonly settlementOrder: number
  readonly detail?: {
    readonly entity?: "course" | "view" | "revision" | "selection"
    readonly id?: string
    readonly effectID?: SelectionAcceptanceEffectID
    readonly acceptedRevisionID?: RevisionID
  }
}

export type Settlement =
  | AppliedSettlement
  | AlreadyAppliedSettlement
  | RepresentationAppliedSettlement
  | RepresentationAlreadyAppliedSettlement
  | ErrorSettlement

export type PermissionOutcome =
  | { readonly type: "allow" }
  | { readonly type: "deny" }
  | { readonly type: "correct" }
  | { readonly type: "cancel" }
  | { readonly type: "abort" }

export class InvocationConflictError extends Schema.TaggedErrorClass<InvocationConflictError>()(
  "LearningCommand.InvocationConflictError",
  {
    partID: Schema.String,
    assistantMessageID: Schema.String,
    providerCallID: Schema.String,
  },
) {}

export class InvocationNotFoundError extends Schema.TaggedErrorClass<InvocationNotFoundError>()(
  "LearningCommand.InvocationNotFoundError",
  {
    partID: Schema.String,
  },
) {}

export class InvocationTranscriptUnavailableError extends Schema.TaggedErrorClass<InvocationTranscriptUnavailableError>()(
  "LearningCommand.InvocationTranscriptUnavailableError",
  {
    partID: Schema.String,
  },
) {}

export class InvalidInvocationEnvelopeError extends Schema.TaggedErrorClass<InvalidInvocationEnvelopeError>()(
  "LearningCommand.InvalidInvocationEnvelopeError",
  {
    reason: Schema.Union([
      Schema.Literal("missing_call_id"),
      Schema.Literal("invalid_ordinal"),
      Schema.Literal("invalid_capability"),
      Schema.Literal("invalid_time"),
      Schema.Literal("wrong_assistant"),
      Schema.Literal("wrong_parent"),
      Schema.Literal("unreserved_part"),
      Schema.Literal("historical_part"),
    ]),
  },
) {}

export class SettledPartImmutableError extends Schema.TaggedErrorClass<SettledPartImmutableError>()(
  "LearningCommand.SettledPartImmutableError",
  {
    partID: Schema.String,
  },
) {}

export class AppliedAssistantImmutableError extends Schema.TaggedErrorClass<AppliedAssistantImmutableError>()(
  "LearningCommand.AppliedAssistantImmutableError",
  {
    assistantMessageID: Schema.String,
    partID: Schema.String,
  },
) {}

export type Error =
  | InvocationConflictError
  | InvocationNotFoundError
  | InvocationTranscriptUnavailableError
  | InvalidInvocationEnvelopeError
  | SettledPartImmutableError
  | AppliedAssistantImmutableError
