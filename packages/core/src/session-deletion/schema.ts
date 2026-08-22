import { Schema } from "effect"
import { Identifier } from "../id/id"
import { NonNegativeInt, PositiveInt } from "../schema"
import { SessionSchema } from "../session/schema"

export const RequestID = Schema.String.check(Schema.isPattern(/^sdr_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("SessionDeletion.RequestID"),
)
export type RequestID = typeof RequestID.Type

export const PurgeRequestID = Schema.String.check(Schema.isPattern(/^spr_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("SessionDeletion.PurgeRequestID"),
)
export type PurgeRequestID = typeof PurgeRequestID.Type

export const AuditBundleID = Schema.String.check(Schema.isPattern(/^sda_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("SessionDeletion.AuditBundleID"),
)
export type AuditBundleID = typeof AuditBundleID.Type

export const AuditOperationID = Schema.String.check(Schema.isPattern(/^sdo_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("SessionDeletion.AuditOperationID"),
)
export type AuditOperationID = typeof AuditOperationID.Type

const decodeRequestID = Schema.decodeUnknownSync(RequestID)
const decodePurgeRequestID = Schema.decodeUnknownSync(PurgeRequestID)
const decodeAuditBundleID = Schema.decodeUnknownSync(AuditBundleID)
const decodeAuditOperationID = Schema.decodeUnknownSync(AuditOperationID)

export const createRequestID = () => decodeRequestID(Identifier.create("sdr", "ascending"))
export const createPurgeRequestID = () => decodePurgeRequestID(Identifier.create("spr", "ascending"))
export const createAuditBundleID = () => decodeAuditBundleID(Identifier.create("sda", "ascending"))
export const createAuditOperationID = () => decodeAuditOperationID(Identifier.create("sdo", "ascending"))

export const Mode = Schema.Literals(["full", "minimal_audit"])
export type Mode = typeof Mode.Type

export const ContextClassification = Schema.Literals(["not_entered", "locator_only", "semantic_full"])
export type ContextClassification = typeof ContextClassification.Type

export const OwnerKind = Schema.Literals([
  "course",
  "learning_navigation",
  "learner_goal",
  "learning_material",
  "learning_interaction",
  "learner_response_evidence",
  "future_attention",
  "assignment",
  "learner_state_judgment",
  "advisory_plan_suggestion",
])
export type OwnerKind = typeof OwnerKind.Type

const Fingerprint = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))

export const AppliedSettlement = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  requestID: RequestID,
  requestFingerprint: Fingerprint,
  rootSessionID: SessionSchema.ID,
  subtreeCount: PositiveInt,
  subtreeFingerprint: Fingerprint,
  mode: Mode,
  permissionDecisionFingerprint: Fingerprint,
  proposalSchemaVersion: Schema.Literal(1),
  outcome: Schema.Literal("applied"),
  deletionTime: NonNegativeInt,
  sessionBodiesDeleted: Schema.Literal(true),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export type AppliedSettlement = typeof AppliedSettlement.Type

export const AppliedPurgeSettlement = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  requestID: PurgeRequestID,
  requestFingerprint: Fingerprint,
  deletionRequestID: RequestID,
  outcome: Schema.Literal("applied"),
  purgeTime: NonNegativeInt,
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export type AppliedPurgeSettlement = typeof AppliedPurgeSettlement.Type

export const decodeAppliedSettlement = Schema.decodeUnknownSync(AppliedSettlement)
export const decodeAppliedPurgeSettlement = Schema.decodeUnknownSync(AppliedPurgeSettlement)

export class InvocationConflictError extends Schema.TaggedErrorClass<InvocationConflictError>()(
  "SessionDeletion.InvocationConflictError",
  {
    requestID: Schema.String,
  },
) {}

export class SessionTreeChangedError extends Schema.TaggedErrorClass<SessionTreeChangedError>()(
  "SessionDeletion.SessionTreeChangedError",
  {
    rootSessionID: Schema.String,
  },
) {}

export class AuditProjectionError extends Schema.TaggedErrorClass<AuditProjectionError>()(
  "SessionDeletion.AuditProjectionError",
  {
    rootSessionID: Schema.String,
    reason: Schema.String,
  },
) {}

export class AuditNotAvailableError extends Schema.TaggedErrorClass<AuditNotAvailableError>()(
  "SessionDeletion.AuditNotAvailableError",
  {
    rootSessionID: Schema.String,
  },
) {}

export class SessionIDRetiredError extends Schema.TaggedErrorClass<SessionIDRetiredError>()(
  "SessionIDRetiredError",
  {
    sessionID: Schema.String,
    deletionRequestID: RequestID,
    mode: Mode,
    deletionTime: NonNegativeInt,
    settlement: AppliedSettlement,
    settlementBytes: Schema.String,
    auditAvailable: Schema.Boolean,
  },
) {}
