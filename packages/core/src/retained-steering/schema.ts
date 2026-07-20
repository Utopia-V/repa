import { Schema } from "effect"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import type { ReceiptID, SettlementMetadata } from "../learning-command/schema"
import type { MessageID } from "../v1/session"
import type { SessionSchema } from "../session/schema"
import { Identifier } from "../id/id"

export const PolicyID = Schema.String.check(Schema.isPattern(/^rsp_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("RetainedSteering.PolicyID"),
)
export type PolicyID = typeof PolicyID.Type

export const TransitionID = Schema.String.check(Schema.isPattern(/^rst_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("RetainedSteering.TransitionID"),
)
export type TransitionID = typeof TransitionID.Type

const decodePolicyID = Schema.decodeUnknownSync(PolicyID)
const decodeTransitionID = Schema.decodeUnknownSync(TransitionID)

export const createPolicyID = () => decodePolicyID(Identifier.create("rsp", "ascending"))
export const createTransitionID = () => decodeTransitionID(Identifier.create("rst", "ascending"))

export const SCOPE = "learning_wide" as const
export const SCHEMA_VERSION = 1 as const
export const MAX_ACTIVE_ITEMS = 16
export const MAX_SOURCE_EXCERPT_BYTES = 1_024
export const MAX_INSTRUCTION_BYTES = 2_048
export const MAX_REASON_BYTES = 1_024
export const MAX_RENDERED_CUT_BYTES = 16_384

type OperativeProposal = Readonly<{
  sourceExcerpt: string
  operativeInstruction: string
  learnerReason?: string
  validUntil: string
}>

export type CreateCommand = OperativeProposal & Readonly<{ action: "create" }>

export type ReplaceCommand = OperativeProposal &
  Readonly<{
    action: "replace"
    policyID: PolicyID
    expectedHeadID: TransitionID
    expectedVersion: number
  }>

export type RetractCommand = Readonly<{
  action: "retract"
  policyID: PolicyID
  expectedHeadID: TransitionID
  expectedVersion: number
  sourceExcerpt: string
  learnerReason?: string
}>

export type Command = CreateCommand | ReplaceCommand | RetractCommand

export type Invocation = Readonly<{
  envelope: import("../learning-command/schema").InvocationEnvelope
  command: Command
}>

export type Transition = Readonly<{
  id: TransitionID
  policyID: PolicyID
  version: number
  predecessorID?: TransitionID
  occurrenceID: OccurrenceID
  sourceOrder: number
  state: "operative" | "retracted"
  scope: typeof SCOPE
  sourceExcerpt: string
  operativeInstruction?: string
  learnerReason?: string
  effectiveFrom?: number
  validUntil?: number
  validUntilSource?: string
  validUntilNormalized?: string
  boundaryTimeZone?: string
  boundaryUtcOffsetMinutes?: number
  steeringRevision: number
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
  acknowledgementTitle: string
  acknowledgementBody: string
}>

export type SourceRead = Readonly<{
  occurrenceID: OccurrenceID
  sourceOrder: number
  originSessionID: SessionSchema.ID
  originMessageID: MessageID
  temporalContext:
    | Readonly<{ state: "resolved"; instant: number; timeZone: string; utcOffsetMinutes: number }>
    | Readonly<{ state: "unavailable"; instant: number; reason: "timezone_unavailable" }>
  availability:
    | Readonly<{ state: "available" }>
    | Readonly<{ state: "source_unavailable"; timeDeleted: number }>
}>

export type TransitionRead = Readonly<{
  effectID: TransitionID
  receiptID: ReceiptID
  status: "operative_active" | "operative_expired" | "retracted"
  transition: Transition
  source: SourceRead
}>

export type PolicyRead = Readonly<{
  policyID: PolicyID
  asOf: number
  steeringRevision: number
  head?: TransitionRead
}>

export type ActiveRead = Readonly<{
  asOf: number
  steeringRevision: number
  items: readonly TransitionRead[]
}>

export type PageOptions = Readonly<{ limit?: number; cursor?: string }>
export type HistoryPage = Readonly<{
  policyID: PolicyID
  throughSteeringRevision: number
  items: readonly TransitionRead[]
  cursor?: string
}>

export type AppliedSettlement = Readonly<{
  outcome: "applied"
  receiptID: ReceiptID
  effectID: TransitionID
  policyID: PolicyID
  version: number
  state: "operative" | "retracted"
  acknowledgementTitle: string
  acknowledgementBody: string
  settlementTime: number
  settlementOrder: number
}>

export type AlreadyAppliedSettlement = Omit<AppliedSettlement, "outcome"> & Readonly<{ outcome: "already_applied" }>

export type NoChangeSettlement = Readonly<{
  outcome: "no_change"
  steeringKind: "retained_steering"
  policyID: PolicyID
  version: number
  state: "operative" | "retracted"
  acknowledgementTitle: string
  acknowledgementBody: string
  settlementTime: number
  settlementOrder: number
}>

export type SourceTemporalSnapshot =
  | Readonly<{
      state: "resolved"
      occurrenceID: OccurrenceID
      instant: number
      timeZone: string
      utcOffsetMinutes: number
      sourceOrder: number
    }>
  | Readonly<{
      state: "unavailable"
      occurrenceID: OccurrenceID
      instant: number
      reason: "timezone_unavailable"
      sourceOrder: number
    }>

export type CutItem = Readonly<{
  ordinal: number
  policyID: PolicyID
  transitionID: TransitionID
  version: number
  sourceOrder: number
  sourceExcerpt: string
  operativeInstruction: string
  learnerReason?: string
  effectiveFrom: number
  validUntil: number
  steeringRevision: number
}>

export type Cut = Readonly<{
  schemaVersion: typeof SCHEMA_VERSION
  assistantMessageID: MessageID
  cutAsOf: number
  throughSteeringRevision: number
  throughSharedFrontier: Readonly<{ sequence: number; time: number }>
  sourceTemporalContext: SourceTemporalSnapshot
  items: readonly CutItem[]
  renderedBytes: number
  fingerprint: string
}>

export type PreparedTransition = Readonly<{
  command: Command
  occurrenceID: OccurrenceID
  sourceOrder: number
  semanticFingerprint: string
  policyID: PolicyID
  predecessorID?: TransitionID
  previousState: "absent" | "operative" | "retracted"
  version: number
  validUntil?: number
  validUntilNormalized?: string
  boundaryUtcOffsetMinutes?: number
  sourceTimeZone?: string
  acknowledgementTitle: string
  acknowledgementBody: string
  settlement: SettlementMetadata
}>

export class InvalidCommandError extends Schema.TaggedErrorClass<InvalidCommandError>()(
  "RetainedSteering.InvalidCommandError",
  {
    reason: Schema.Union([
      Schema.Literal("validation_error"),
      Schema.Literal("source_unavailable"),
      Schema.Literal("temporal_context_unavailable"),
      Schema.Literal("stale"),
      Schema.Literal("capacity_exceeded"),
    ]),
  },
) {}

export class CutIntegrityError extends Schema.TaggedErrorClass<CutIntegrityError>()(
  "RetainedSteering.CutIntegrityError",
  { assistantMessageID: Schema.String, reason: Schema.String },
) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "RetainedSteering.InvalidCursorError",
  { detail: Schema.String },
) {}
