export * as FutureAttentionEvent from "./future-attention-event"

import { Schema } from "effect"
import { Event } from "./event"
import { LearningOccurrence } from "./learning-occurrence"
import { NonNegativeInt, optional } from "./schema"
import { SessionID } from "./session-id"
import { SessionV1 } from "./session-v1"
import { Turn } from "./turn"

const ConcernID = Schema.String.check(Schema.isPattern(/^fac_[0-9A-Za-z]{26}$/))
const TransitionID = Schema.String.check(Schema.isPattern(/^fat_[0-9A-Za-z]{26}$/))
const ClaimGroupID = Schema.String.check(Schema.isPattern(/^fag_[0-9A-Za-z]{26}$/))
const FinalizationReceiptID = Schema.String.check(Schema.isPattern(/^far_[0-9A-Za-z]{26}$/))
const ServiceReceiptID = Schema.String.check(Schema.isPattern(/^fas_[0-9A-Za-z]{26}$/))
const Fingerprint = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))

export const CompletionFacts = Schema.Struct({
  observationCut: Schema.Literals(["live_presentation_finalized", "startup_reconciled"]),
  sessionID: SessionID,
  turnID: Turn.ID,
  occurrenceID: LearningOccurrence.ID,
  assistantMessageID: SessionV1.MessageID,
  modelOperationID: SessionV1.MessageID,
  invocationPartID: SessionV1.PartID,
  modelOutcome: Schema.Literals(["completed", "failed", "interrupted"]),
  localToolPartsTerminal: Schema.Boolean,
  presentationCommitted: Schema.Boolean,
  presentationUnavailable: Schema.Boolean,
  timeCompleted: NonNegativeInt,
  completionOrder: NonNegativeInt,
  partManifestFingerprint: optional(Fingerprint),
  eligibleOutputFingerprint: optional(Fingerprint),
  eligibleOutputBytes: NonNegativeInt,
  finalStructuredOutputFingerprint: optional(Fingerprint),
}).annotate({ identifier: "FutureAttentionCompletionFacts" })
export interface CompletionFacts extends Schema.Schema.Type<typeof CompletionFacts> {}

export const FinalizationMember = Schema.Struct({
  ordinal: NonNegativeInt,
  concernID: ConcernID,
  outcome: Schema.Literals(["served", "not_served"]),
  transitionID: optional(TransitionID),
  serviceReceiptID: optional(ServiceReceiptID),
  reason: optional(
    Schema.Literals([
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
    ]),
  ),
}).annotate({ identifier: "FutureAttentionFinalizationMember" })
export interface FinalizationMember extends Schema.Schema.Type<typeof FinalizationMember> {}

export const FinalizationReceipt = Schema.Struct({
  id: FinalizationReceiptID,
  groupID: ClaimGroupID,
  outcome: Schema.Literals(["served", "not_served"]),
  completion: CompletionFacts,
  members: Schema.Array(FinalizationMember),
  timeFinalized: NonNegativeInt,
  finalizationOrder: NonNegativeInt,
  frontierSequence: optional(NonNegativeInt),
}).annotate({ identifier: "FutureAttentionFinalizationReceipt" })
export interface FinalizationReceipt extends Schema.Schema.Type<typeof FinalizationReceipt> {}

export const Finalized = Event.define({
  type: "future_attention.finalized",
  durable: { aggregate: "sessionID", version: 1 },
  schema: {
    sessionID: SessionID,
    turnID: Turn.ID,
    assistantMessageID: SessionV1.MessageID,
    invocationPartID: SessionV1.PartID,
    groupID: ClaimGroupID,
    receipt: FinalizationReceipt,
  },
})

export const Definitions = Event.inventory(Finalized)
export const DurableDefinitions = Definitions
export const Durable = Schema.Union(DurableDefinitions, { mode: "oneOf" })
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "FutureAttentionDurableEvent" })
export type DurableEvent = typeof Durable.Type
