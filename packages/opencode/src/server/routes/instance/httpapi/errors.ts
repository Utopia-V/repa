import { Schema } from "effect"
import { SessionID } from "@opencode-ai/schema/session-id"
import { Turn } from "@opencode-ai/schema/turn"

export class InvalidRequestError extends Schema.TaggedErrorClass<InvalidRequestError>()(
  "InvalidRequestError",
  {
    message: Schema.String,
    kind: Schema.optional(Schema.String),
    field: Schema.optional(Schema.String),
  },
  { httpApiStatus: 400 },
) {}

export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class ForbiddenError extends Schema.TaggedErrorClass<ForbiddenError>()(
  "ForbiddenError",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()(
  "ConflictError",
  {
    message: Schema.String,
    resource: Schema.optional(Schema.String),
  },
  { httpApiStatus: 409 },
) {}

export class UpstreamError extends Schema.TaggedErrorClass<UpstreamError>()(
  "UpstreamError",
  {
    message: Schema.String,
    service: Schema.optional(Schema.String),
    status: Schema.optional(Schema.Number),
  },
  { httpApiStatus: 502 },
) {}

export class ServiceUnavailableError extends Schema.TaggedErrorClass<ServiceUnavailableError>()(
  "ServiceUnavailableError",
  {
    message: Schema.String,
    service: Schema.optional(Schema.String),
  },
  { httpApiStatus: 503 },
) {}

export class TimeoutError extends Schema.TaggedErrorClass<TimeoutError>()(
  "TimeoutError",
  {
    message: Schema.String,
    operation: Schema.optional(Schema.String),
  },
  { httpApiStatus: 504 },
) {}

export class UnknownError extends Schema.TaggedErrorClass<UnknownError>()(
  "UnknownError",
  {
    message: Schema.String,
    ref: Schema.optional(Schema.String),
  },
  { httpApiStatus: 500 },
) {}

export class ProviderNotFoundError extends Schema.TaggedErrorClass<ProviderNotFoundError>()(
  "ProviderNotFoundError",
  {
    providerID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class ModelNotFoundError extends Schema.TaggedErrorClass<ModelNotFoundError>()(
  "ModelNotFoundError",
  {
    providerID: Schema.String,
    modelID: Schema.String,
    suggestions: Schema.Array(Schema.String),
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class SessionNotFoundError extends Schema.TaggedErrorClass<SessionNotFoundError>()(
  "SessionNotFoundError",
  {
    sessionID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class MessageNotFoundError extends Schema.TaggedErrorClass<MessageNotFoundError>()(
  "MessageNotFoundError",
  {
    sessionID: Schema.String,
    messageID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "InvalidCursorError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class SessionBusyError extends Schema.TaggedErrorClass<SessionBusyError>()(
  "SessionBusyError",
  {
    sessionID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class SessionTreeBusyError extends Schema.TaggedErrorClass<SessionTreeBusyError>()(
  "SessionTreeBusyError",
  {
    sessionID: Schema.String,
    activeTurnIDs: Schema.Array(Schema.String),
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class SessionIDRetiredError extends Schema.TaggedErrorClass<SessionIDRetiredError>()(
  "SessionIDRetiredError",
  {
    sessionID: Schema.String,
    deletionRequestID: Schema.String,
    mode: Schema.Literals(["full", "minimal_audit"]),
    deletionTime: Schema.Number,
    settlement: Schema.Struct({
      schemaVersion: Schema.Literal(1),
      requestID: Schema.String,
      requestFingerprint: Schema.String,
      rootSessionID: Schema.String,
      subtreeCount: Schema.Number,
      subtreeFingerprint: Schema.String,
      mode: Schema.Literals(["full", "minimal_audit"]),
      permissionDecisionFingerprint: Schema.String,
      proposalSchemaVersion: Schema.Literal(1),
      outcome: Schema.Literal("applied"),
      deletionTime: Schema.Number,
      sessionBodiesDeleted: Schema.Literal(true),
    }),
    settlementBytes: Schema.String,
    auditAvailable: Schema.Boolean,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class SessionDeletionInvocationConflictError extends Schema.TaggedErrorClass<SessionDeletionInvocationConflictError>()(
  "SessionDeletion.InvocationConflictError",
  { requestID: Schema.String, message: Schema.String },
  { httpApiStatus: 409 },
) {}

export class SessionDeletionAuditProjectionError extends Schema.TaggedErrorClass<SessionDeletionAuditProjectionError>()(
  "SessionDeletion.AuditProjectionError",
  { rootSessionID: Schema.String, reason: Schema.String, message: Schema.String },
  { httpApiStatus: 409 },
) {}

export class SessionDeletionAuditNotAvailableError extends Schema.TaggedErrorClass<SessionDeletionAuditNotAvailableError>()(
  "SessionDeletion.AuditNotAvailableError",
  { rootSessionID: Schema.String, message: Schema.String },
  { httpApiStatus: 409 },
) {}

export class SessionAdministrativeHistoryIntegrityError extends Schema.TaggedErrorClass<SessionAdministrativeHistoryIntegrityError>()(
  "SessionPresentation.AdministrativeHistoryIntegrityError",
  {
    sessionID: Schema.String,
    reason: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class SessionPresentationFrontierUnrepresentableError extends Schema.TaggedErrorClass<SessionPresentationFrontierUnrepresentableError>()(
  "SessionPresentation.FrontierUnrepresentableError",
  {
    sessionID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class SessionHistoricalPresentationNotRevertibleError extends Schema.TaggedErrorClass<SessionHistoricalPresentationNotRevertibleError>()(
  "SessionPresentation.HistoricalPresentationNotRevertibleError",
  {
    sessionID: Schema.String,
    presentationID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class TurnAdmissionConflictError extends Schema.TaggedErrorClass<TurnAdmissionConflictError>()(
  "TurnAdmissionConflictError",
  { turnID: Turn.ID },
  { httpApiStatus: 409 },
) {}

export class TurnAlreadyRunningError extends Schema.TaggedErrorClass<TurnAlreadyRunningError>()(
  "TurnAlreadyRunningError",
  { sessionID: SessionID, activeTurnID: Turn.ID },
  { httpApiStatus: 409 },
) {}

export class TurnNotFoundError extends Schema.TaggedErrorClass<TurnNotFoundError>()(
  "TurnNotFoundError",
  { turnID: Turn.ID },
  { httpApiStatus: 404 },
) {}

export class TurnSessionMismatchError extends Schema.TaggedErrorClass<TurnSessionMismatchError>()(
  "TurnSessionMismatchError",
  { sessionID: SessionID, turnID: Turn.ID },
  { httpApiStatus: 409 },
) {}

export class TurnNoActiveError extends Schema.TaggedErrorClass<TurnNoActiveError>()(
  "TurnNoActiveError",
  { sessionID: SessionID },
  { httpApiStatus: 409 },
) {}

export class TurnActiveMismatchError extends Schema.TaggedErrorClass<TurnActiveMismatchError>()(
  "TurnActiveMismatchError",
  { sessionID: SessionID, expectedTurnID: Turn.ID, activeTurnID: Turn.ID },
  { httpApiStatus: 409 },
) {}

export class TurnNotSteerableError extends Schema.TaggedErrorClass<TurnNotSteerableError>()(
  "TurnNotSteerableError",
  { sessionID: SessionID, turnID: Turn.ID, state: Turn.State },
  { httpApiStatus: 409 },
) {}

export class TurnSourceUnavailableError extends Schema.TaggedErrorClass<TurnSourceUnavailableError>()(
  "TurnSourceUnavailableError",
  { turnID: Turn.ID, receipt: Turn.UnavailableReceipt.pipe(Schema.optional) },
  { httpApiStatus: 410 },
) {}

export class TurnTreeChangedError extends Schema.TaggedErrorClass<TurnTreeChangedError>()(
  "SessionTreeChangedError",
  { sessionID: SessionID },
  { httpApiStatus: 409 },
) {}

export class TurnIntegrityError extends Schema.TaggedErrorClass<TurnIntegrityError>()(
  "TurnIntegrityError",
  { turnID: Turn.ID, reason: Schema.String },
  { httpApiStatus: 500 },
) {}

export class QuestionNotFoundError extends Schema.TaggedErrorClass<QuestionNotFoundError>()(
  "QuestionNotFoundError",
  {
    requestID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class PermissionNotFoundError extends Schema.TaggedErrorClass<PermissionNotFoundError>()(
  "PermissionNotFoundError",
  {
    requestID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class McpServerNotFoundError extends Schema.TaggedErrorClass<McpServerNotFoundError>()(
  "McpServerNotFoundError",
  {
    name: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class PtyNotFoundError extends Schema.TaggedErrorClass<PtyNotFoundError>()(
  "PtyNotFoundError",
  {
    ptyID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class PtyForbiddenError extends Schema.TaggedErrorClass<PtyForbiddenError>()(
  "PtyForbiddenError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 403 },
) {}

export class ProjectNotFoundError extends Schema.TaggedErrorClass<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    projectID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class ApiNotFoundError extends Schema.ErrorClass<ApiNotFoundError>("NotFoundError")(
  {
    name: Schema.Literal("NotFoundError"),
    data: Schema.Struct({
      message: Schema.String,
    }),
  },
  { httpApiStatus: 404 },
) {}

export function notFound(message: string) {
  return new ApiNotFoundError({
    name: "NotFoundError",
    data: { message },
  })
}
