import { Schema } from "effect"
import type { Turn } from "@opencode-ai/schema/turn"
import { Identifier } from "../id/id"
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

export type SettlementMetadata = {
  readonly time: number
  readonly order: number
}

export type PermissionOutcome =
  | { readonly type: "allow" }
  | { readonly type: "deny" }
  | { readonly type: "correct" }
  | { readonly type: "cancel" }
  | { readonly type: "abort" }

export type PhysicalSettlement = {
  readonly outcome: "applied" | "already_applied" | "no_change" | "error"
  readonly settlementTime: number
  readonly settlementOrder: number
  readonly receiptID?: ReceiptID
  readonly [key: string]: unknown
}

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
      Schema.Literal("invalid_authorization_basis"),
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
