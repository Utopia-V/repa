export * as Turn from "./turn"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { LearningOccurrence } from "./learning-occurrence"
import { LearningFrontier } from "./learning-frontier"
import { DateTimeUtcFromMillis, NonNegativeInt, optional, statics } from "./schema"
import { SessionID } from "./session-id"
import { SessionV1 } from "./session-v1"

export const ID = Schema.String.check(Schema.isStartsWith("trn_")).pipe(
  Schema.brand("Turn.ID"),
  statics((schema) => ({ create: () => schema.make("trn_" + ascending()) })),
)
export type ID = typeof ID.Type

export const InputID = Schema.String.check(Schema.isStartsWith("tri_")).pipe(
  Schema.brand("Turn.InputID"),
  statics((schema) => ({ create: () => schema.make("tri_" + ascending()) })),
)
export type InputID = typeof InputID.Type

export const AdmissionKind = Schema.Literals(["learner", "delegated_task"])
export type AdmissionKind = typeof AdmissionKind.Type

export const State = Schema.Literals(["running", "completed", "failed", "interrupted", "exhausted"])
export type State = typeof State.Type

export const InputSource = Schema.Literals(["learner_root", "learner_steer", "delegated_task"])
export type InputSource = typeof InputSource.Type

export const ModelState = Schema.Literals(["running", "completed", "failed", "interrupted"])
export type ModelState = typeof ModelState.Type

export const CandidateState = Schema.Literals([
  "pending_admission",
  "admitted",
  "not_started_limit",
  "not_started_turn_exhausted",
  "not_started_interrupted",
  "not_started_failed",
])
export type CandidateState = typeof CandidateState.Type

export const InvocationState = Schema.Literals(["running", "completed", "failed", "interrupted"])
export type InvocationState = typeof InvocationState.Type

export const TerminalReason = Schema.Literals([
  "normal",
  "provider_failure",
  "tool_runtime_failure",
  "permission_failure",
  "projection_failure",
  "owner_failure",
  "integrity_failure",
  "learner_interrupt",
  "ancestor_interrupt",
  "owner_handoff_failed",
  "owner_lost",
  "startup_recovery",
  "model_limit",
  "tool_limit",
])
export type TerminalReason = typeof TerminalReason.Type

export const CounterKind = Schema.Literals(["model", "tool"])
export type CounterKind = typeof CounterKind.Type

export const Limits = Schema.Struct({
  model: NonNegativeInt,
  tool: NonNegativeInt,
}).annotate({ identifier: "Turn.Limits" })
export type Limits = typeof Limits.Type

export const Counters = Schema.Struct({
  model: NonNegativeInt,
  tool: NonNegativeInt,
}).annotate({ identifier: "Turn.Counters" })
export type Counters = typeof Counters.Type

export const Lineage = Schema.Struct({
  parentTurnID: ID,
  parentSessionID: SessionID,
  parentTaskPartID: SessionV1.PartID,
  parentModelMessageID: SessionV1.MessageID,
  depth: NonNegativeInt,
  delegatedCapability: Schema.Record(Schema.String, Schema.Unknown),
}).annotate({ identifier: "Turn.Lineage" })
export type Lineage = typeof Lineage.Type

export const Input = Schema.Struct({
  id: InputID,
  turnID: ID,
  sessionID: SessionID,
  messageID: SessionV1.MessageID,
  source: InputSource,
  ordinal: NonNegativeInt,
  occurrenceID: LearningOccurrence.ID.pipe(optional),
  parentModelMessageID: SessionV1.MessageID.pipe(optional),
  timeAdmitted: DateTimeUtcFromMillis,
  envelopeFingerprint: Schema.String,
}).annotate({ identifier: "Turn.Input" })
export type Input = typeof Input.Type

export const ModelOperation = Schema.Struct({
  turnID: ID,
  sessionID: SessionID,
  assistantMessageID: SessionV1.MessageID,
  inputID: InputID,
  causalOccurrenceID: LearningOccurrence.ID.pipe(optional),
  ordinal: NonNegativeInt,
  state: ModelState,
  requestFingerprint: Schema.String,
  contextFingerprint: Schema.String,
  snapshotFrontier: LearningFrontier.Snapshot,
  observedSharedFrontier: LearningFrontier.Snapshot,
  timeAdmitted: DateTimeUtcFromMillis,
  timeSettled: DateTimeUtcFromMillis.pipe(optional),
}).annotate({ identifier: "Turn.ModelOperation" })
export type ModelOperation = typeof ModelOperation.Type

export const ToolCandidate = Schema.Struct({
  turnID: ID,
  sessionID: SessionID,
  assistantMessageID: SessionV1.MessageID,
  partID: SessionV1.PartID,
  callID: Schema.String,
  tool: Schema.String,
  futureAttentionServiceSource: Schema.Literals(["learner_usable", "internal_control"]),
  emissionOrdinal: NonNegativeInt,
  state: CandidateState,
  envelopeFingerprint: Schema.String,
  timeRegistered: DateTimeUtcFromMillis,
  timeTerminal: DateTimeUtcFromMillis.pipe(optional),
}).annotate({ identifier: "Turn.ToolCandidate" })
export type ToolCandidate = typeof ToolCandidate.Type

export const ToolInvocation = Schema.Struct({
  turnID: ID,
  sessionID: SessionID,
  assistantMessageID: SessionV1.MessageID,
  partID: SessionV1.PartID,
  ordinal: NonNegativeInt,
  state: InvocationState,
  observedSharedFrontier: LearningFrontier.Snapshot,
  consumedSharedFrontier: LearningFrontier.Snapshot,
  resultingSharedFrontier: LearningFrontier.Snapshot.pipe(optional),
  timeAdmitted: DateTimeUtcFromMillis,
  timeSettled: DateTimeUtcFromMillis.pipe(optional),
}).annotate({ identifier: "Turn.ToolInvocation" })
export type ToolInvocation = typeof ToolInvocation.Type

export const ChildResult = Schema.Struct({
  parentTurnID: ID,
  parentSessionID: SessionID,
  parentTaskPartID: SessionV1.PartID,
  childTurnID: ID,
  childSessionID: SessionID,
  terminalOutcome: Schema.Literals(["completed", "failed", "interrupted", "exhausted"]),
  requestedOutput: Schema.Union([
    Schema.Struct({ state: Schema.Literal("complete"), value: Schema.Unknown }),
    Schema.Struct({
      state: Schema.Literal("incomplete"),
      partial: Schema.Unknown.pipe(optional),
      reason: TerminalReason,
    }),
  ]).pipe(Schema.toTaggedUnion("state")),
  timeSettled: DateTimeUtcFromMillis,
}).annotate({ identifier: "Turn.ChildResult" })
export type ChildResult = typeof ChildResult.Type

export const Exhaustion = Schema.Struct({
  counter: CounterKind,
  observed: NonNegativeInt,
  limit: NonNegativeInt,
  rejectedAttemptID: Schema.String,
  envelope: Schema.Record(Schema.String, Schema.Unknown),
  envelopeFingerprint: Schema.String,
  time: DateTimeUtcFromMillis,
}).annotate({ identifier: "Turn.Exhaustion" })
export type Exhaustion = typeof Exhaustion.Type

export const InspectionExhaustion = Schema.Union([
  Schema.Struct({
    schemaVersion: Schema.Literal(1),
    type: Schema.Literal("generic"),
    counter: CounterKind,
    reason: Schema.String,
  }),
  Schema.Struct({
    schemaVersion: Schema.Literal(1),
    type: Schema.Literals(["predecessor_continuation_exhausted", "rejected_tool_continuation_exhausted"]),
    counter: CounterKind,
    predecessorPartID: SessionV1.PartID,
    queryFingerprint: Schema.String,
    outputFingerprint: Schema.String,
    completeSoFar: Schema.Boolean,
    gapCounts: Schema.Struct({
      oversizedCandidateSkipped: NonNegativeInt,
      rangeItemsSkipped: NonNegativeInt,
    }),
    gapFingerprint: Schema.String,
    continuationPending: Schema.Boolean,
    rangeNextOffset: NonNegativeInt.pipe(optional),
  }),
]).annotate({ identifier: "Turn.InspectionExhaustion" })
export type InspectionExhaustion = typeof InspectionExhaustion.Type

export const Terminal = Schema.Struct({
  outcome: Schema.Literals(["completed", "failed", "interrupted", "exhausted"]),
  reason: TerminalReason,
  counters: Counters,
  time: DateTimeUtcFromMillis,
  exhaustion: Exhaustion.pipe(optional),
}).annotate({ identifier: "Turn.Terminal" })
export type Terminal = typeof Terminal.Type

export const Info = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  admissionKind: AdmissionKind,
  initialInputID: InputID,
  currentInputID: InputID,
  limits: Limits,
  counters: Counters,
  state: State,
  depth: NonNegativeInt,
  lineage: Lineage.pipe(optional),
  timeAdmitted: DateTimeUtcFromMillis,
  causalTime: DateTimeUtcFromMillis,
  terminal: Terminal.pipe(optional),
  inspectionExhaustion: InspectionExhaustion.pipe(optional),
}).annotate({ identifier: "Turn.Info" })
export type Info = typeof Info.Type

export const UnavailableSource = Schema.Struct({
  turnID: ID,
  sessionID: SessionID,
  admissionKind: AdmissionKind,
  timeAdmitted: DateTimeUtcFromMillis,
  timeTerminal: DateTimeUtcFromMillis,
  outcome: Schema.Literals(["completed", "failed", "interrupted", "exhausted"]),
  parentTurnID: ID.pipe(optional),
  parentSessionID: SessionID.pipe(optional),
  parentTaskPartID: SessionV1.PartID.pipe(optional),
  parentModelMessageID: SessionV1.MessageID.pipe(optional),
  depth: NonNegativeInt,
  causalOccurrenceID: LearningOccurrence.ID.pipe(optional),
  timeDeleted: DateTimeUtcFromMillis,
}).annotate({ identifier: "Turn.UnavailableSource" })
export type UnavailableSource = typeof UnavailableSource.Type

export const UnavailableModelMapping = Schema.Struct({
  turnID: ID,
  assistantMessageID: SessionV1.MessageID,
  causalOccurrenceID: LearningOccurrence.ID.pipe(optional),
  state: Schema.Literals(["completed", "failed", "interrupted"]).pipe(optional),
  timeSettled: DateTimeUtcFromMillis.pipe(optional),
}).annotate({ identifier: "Turn.UnavailableModelMapping" })
export type UnavailableModelMapping = typeof UnavailableModelMapping.Type

export const UnavailableToolMapping = Schema.Struct({
  turnID: ID,
  assistantMessageID: SessionV1.MessageID,
  partID: SessionV1.PartID,
  callID: Schema.String,
}).annotate({ identifier: "Turn.UnavailableToolMapping" })
export type UnavailableToolMapping = typeof UnavailableToolMapping.Type

export const UnavailableReceipt = Schema.Struct({
  source: UnavailableSource,
  models: Schema.Array(UnavailableModelMapping),
  tools: Schema.Array(UnavailableToolMapping),
}).annotate({ identifier: "Turn.UnavailableReceipt" })
export type UnavailableReceipt = typeof UnavailableReceipt.Type

export class AdmissionConflictError extends Schema.TaggedErrorClass<AdmissionConflictError>()(
  "TurnAdmissionConflictError",
  { turnID: ID },
) {}

export class AlreadyRunningError extends Schema.TaggedErrorClass<AlreadyRunningError>()("TurnAlreadyRunningError", {
  sessionID: SessionID,
  activeTurnID: ID,
}) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("TurnNotFoundError", { turnID: ID }) {}

export class SessionMismatchError extends Schema.TaggedErrorClass<SessionMismatchError>()("TurnSessionMismatchError", {
  sessionID: SessionID,
  turnID: ID,
}) {}

export class NoActiveTurnError extends Schema.TaggedErrorClass<NoActiveTurnError>()("TurnNoActiveError", {
  sessionID: SessionID,
}) {}

export class ActiveTurnMismatchError extends Schema.TaggedErrorClass<ActiveTurnMismatchError>()(
  "TurnActiveMismatchError",
  { sessionID: SessionID, expectedTurnID: ID, activeTurnID: ID },
) {}

export class NotSteerableError extends Schema.TaggedErrorClass<NotSteerableError>()("TurnNotSteerableError", {
  sessionID: SessionID,
  turnID: ID,
  state: State,
}) {}

export class SourceUnavailableError extends Schema.TaggedErrorClass<SourceUnavailableError>()(
  "TurnSourceUnavailableError",
  { turnID: ID, receipt: UnavailableReceipt.pipe(optional) },
) {}

export class SessionTreeBusyError extends Schema.TaggedErrorClass<SessionTreeBusyError>()("SessionTreeBusyError", {
  sessionID: SessionID,
  activeTurnIDs: Schema.Array(ID),
}) {}

export class SessionTreeChangedError extends Schema.TaggedErrorClass<SessionTreeChangedError>()(
  "SessionTreeChangedError",
  { sessionID: SessionID },
) {}

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()("TurnIntegrityError", {
  turnID: ID,
  reason: Schema.String,
}) {}

export type Error =
  | AdmissionConflictError
  | AlreadyRunningError
  | NotFoundError
  | SessionMismatchError
  | NoActiveTurnError
  | ActiveTurnMismatchError
  | NotSteerableError
  | SourceUnavailableError
  | SessionTreeBusyError
  | SessionTreeChangedError
  | IntegrityError
