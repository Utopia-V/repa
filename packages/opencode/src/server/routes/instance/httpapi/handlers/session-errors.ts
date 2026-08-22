import type { NotFoundError as StorageNotFoundError } from "@/storage/storage"
import type { Session } from "@/session/session"
import type { Image } from "@/image/image"
import { Effect } from "effect"
import type { OccurrenceError } from "@opencode-ai/core/learning-command"
import {
  InvalidRequestError,
  SessionAdministrativeHistoryIntegrityError,
  SessionPresentationFrontierUnrepresentableError,
  SessionBusyError,
  SessionHistoricalPresentationNotRevertibleError,
  SessionIDRetiredError,
  SessionTreeBusyError,
  TurnActiveMismatchError,
  TurnAdmissionConflictError,
  TurnAlreadyRunningError,
  TurnIntegrityError,
  TurnNoActiveError,
  TurnNotFoundError,
  TurnNotSteerableError,
  TurnSessionMismatchError,
  TurnSourceUnavailableError,
  TurnTreeChangedError,
  notFound,
} from "../errors"
import type { Turn } from "@opencode-ai/schema/turn"
import type { SessionDeletion } from "@opencode-ai/core/session-deletion"
import type { SessionPresentation } from "@opencode-ai/core/session-presentation"

export function mapStorageNotFound<A, R>(self: Effect.Effect<A, StorageNotFoundError, R>) {
  return self.pipe(Effect.mapError((error) => notFound(error.message)))
}

export function mapSessionRead<A, R>(
  self: Effect.Effect<A, StorageNotFoundError | SessionPresentation.AdministrativeHistoryIntegrityError, R>,
) {
  return self.pipe(
    Effect.mapError((error) =>
      error._tag === "NotFoundError"
        ? notFound(error.message)
        : new SessionAdministrativeHistoryIntegrityError({
            ...error,
            message: `Administrative Session history failed integrity validation: ${error.reason}`,
          }),
    ),
  )
}

export function mapBusy<A, R>(self: Effect.Effect<A, Session.BusyError, R>) {
  return self.pipe(Effect.catchTag("SessionBusyError", (error) => Effect.fail(publicBusy(error))))
}

export function mapRevert<A, R>(
  self: Effect.Effect<
    A,
    | Session.BusyError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.HistoricalPresentationNotRevertibleError,
    R
  >,
) {
  return self.pipe(
    Effect.mapError((error) => {
      if (error._tag === "SessionBusyError") return publicBusy(error)
      if (error._tag === "SessionPresentation.HistoricalPresentationNotRevertibleError") {
        return new SessionHistoricalPresentationNotRevertibleError({
          ...error,
          message: `Imported historical presentation cannot be reverted: ${error.presentationID}`,
        })
      }
      return new SessionAdministrativeHistoryIntegrityError({
        ...error,
        message: `Administrative Session history failed integrity validation: ${error.reason}`,
      })
    }),
  )
}

export function mapTreeBusy<A, R>(self: Effect.Effect<A, Turn.SessionTreeBusyError, R>) {
  return self.pipe(
    Effect.mapError(
      (error) =>
        new SessionTreeBusyError({
          sessionID: error.sessionID,
          activeTurnIDs: [...error.activeTurnIDs],
          message: `Session tree has active Turns: ${error.activeTurnIDs.join(", ")}`,
        }),
    ),
  )
}

type TurnOperationError =
  | Image.Error
  | Session.NotFound
  | Session.BusyError
  | Turn.Error
  | OccurrenceError
  | SessionDeletion.SessionIDRetiredError
  | SessionPresentation.AdministrativeHistoryIntegrityError
  | SessionPresentation.FrontierUnrepresentableError

export function mapTurn<A, E extends TurnOperationError, R>(self: Effect.Effect<A, E, R>) {
  return self.pipe(Effect.mapError(publicTurnError))
}

function publicTurnError(error: TurnOperationError) {
  switch (error._tag) {
    case "SessionBusyError":
      return publicBusy(error)
    case "NotFoundError":
      return notFound(error.message)
    case "TurnAdmissionConflictError":
      return new TurnAdmissionConflictError(error)
    case "TurnAlreadyRunningError":
      return new TurnAlreadyRunningError(error)
    case "TurnNotFoundError":
      return new TurnNotFoundError(error)
    case "TurnSessionMismatchError":
      return new TurnSessionMismatchError(error)
    case "TurnNoActiveError":
      return new TurnNoActiveError(error)
    case "TurnActiveMismatchError":
      return new TurnActiveMismatchError(error)
    case "TurnNotSteerableError":
      return new TurnNotSteerableError(error)
    case "TurnSourceUnavailableError":
      return new TurnSourceUnavailableError(error)
    case "SessionTreeBusyError":
      return new SessionTreeBusyError({
        sessionID: error.sessionID,
        activeTurnIDs: [...error.activeTurnIDs],
        message: `Session tree has active Turns: ${error.activeTurnIDs.join(", ")}`,
      })
    case "SessionTreeChangedError":
      return new TurnTreeChangedError(error)
    case "SessionIDRetiredError":
      return new SessionIDRetiredError({
        ...error,
        message: `Session ID is retired in this database: ${error.sessionID}`,
      })
    case "SessionPresentation.AdministrativeHistoryIntegrityError":
      return new SessionAdministrativeHistoryIntegrityError({
        ...error,
        message: `Administrative Session history failed integrity validation: ${error.reason}`,
      })
    case "SessionPresentation.FrontierUnrepresentableError":
      return new SessionPresentationFrontierUnrepresentableError({
        ...error,
        message: `Session presentation frontier cannot reserve another ordered Message block: ${error.sessionID}`,
      })
    case "TurnIntegrityError":
      return new TurnIntegrityError(error)
    case "LearningCommand.OccurrenceConflictError":
      return new InvalidRequestError({
        message: `Learner occurrence conflicts with Message ${error.messageID}`,
        kind: error._tag,
        field: "messageID",
      })
    case "LearningCommand.InvalidCausalSourceError":
      return new InvalidRequestError({
        message: `Invalid learner causal source: ${error.reason}`,
        kind: error.reason,
      })
    case "LearningCommand.HistoricalPresentationConflictError":
      return new InvalidRequestError({
        message: `Historical presentation conflicts at Part ${error.partID}`,
        kind: error._tag,
        field: "partID",
      })
    case "ImageResizerUnavailableError":
    case "ImageInvalidDataUrlError":
    case "ImageDecodeError":
    case "ImageSizeError":
      return new InvalidRequestError({ message: error.message, kind: error._tag })
  }
}

export function mapPrompt<A, R>(
  self: Effect.Effect<
    A,
    | Image.Error
    | Session.NotFound
    | Session.BusyError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.HistoricalPresentationNotRevertibleError
    | SessionPresentation.FrontierUnrepresentableError,
    R
  >,
) {
  return self.pipe(
    Effect.mapError((error) =>
      error._tag === "SessionBusyError"
        ? publicBusy(error)
        : error._tag === "NotFoundError"
          ? notFound(error.message)
          : error._tag === "SessionPresentation.AdministrativeHistoryIntegrityError"
            ? new SessionAdministrativeHistoryIntegrityError({
                ...error,
                message: `Administrative Session history failed integrity validation: ${error.reason}`,
              })
            : error._tag === "SessionPresentation.HistoricalPresentationNotRevertibleError"
              ? new SessionHistoricalPresentationNotRevertibleError({
                  ...error,
                  message: `Imported historical presentation cannot be reverted: ${error.presentationID}`,
                })
              : error._tag === "SessionPresentation.FrontierUnrepresentableError"
                ? new SessionPresentationFrontierUnrepresentableError({
                    ...error,
                    message: `Session presentation frontier cannot reserve another ordered Message block: ${error.sessionID}`,
                  })
                : new InvalidRequestError({ message: error.message, kind: error._tag }),
    ),
  )
}

export function mapPresentationMutation<A, R>(
  self: Effect.Effect<
    A,
    | Session.BusyError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.FrontierUnrepresentableError,
    R
  >,
) {
  return self.pipe(
    Effect.mapError((error) => {
      if (error._tag === "SessionBusyError") return publicBusy(error)
      if (error._tag === "SessionPresentation.FrontierUnrepresentableError") {
        return new SessionPresentationFrontierUnrepresentableError({
          ...error,
          message: `Session presentation frontier cannot reserve another ordered Message block: ${error.sessionID}`,
        })
      }
      return new SessionAdministrativeHistoryIntegrityError({
        ...error,
        message: `Administrative Session history failed integrity validation: ${error.reason}`,
      })
    }),
  )
}

export function mapHistoricalMutation<A, R>(
  self: Effect.Effect<A, Session.BusyError | SessionPresentation.AdministrativeHistoryIntegrityError, R>,
) {
  return self.pipe(
    Effect.mapError((error) =>
      error._tag === "SessionBusyError"
        ? publicBusy(error)
        : new SessionAdministrativeHistoryIntegrityError({
            ...error,
            message: `Administrative Session history failed integrity validation: ${error.reason}`,
          }),
    ),
  )
}

function publicBusy(error: Session.BusyError) {
  return new SessionBusyError({
    sessionID: error.sessionID,
    message: `Session is busy: ${error.sessionID}`,
  })
}
