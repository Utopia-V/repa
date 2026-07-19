import type { NotFoundError as StorageNotFoundError } from "@/storage/storage"
import type { Session } from "@/session/session"
import type { Image } from "@/image/image"
import { Effect } from "effect"
import type { OccurrenceError } from "@opencode-ai/core/learning-command"
import {
  InvalidRequestError,
  SessionBusyError,
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

export function mapStorageNotFound<A, R>(self: Effect.Effect<A, StorageNotFoundError, R>) {
  return self.pipe(Effect.mapError((error) => notFound(error.message)))
}

export function mapBusy<A, R>(self: Effect.Effect<A, Session.BusyError, R>) {
  return self.pipe(Effect.catchTag("SessionBusyError", (error) => Effect.fail(publicBusy(error))))
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

type TurnOperationError = Image.Error | Session.NotFound | Session.BusyError | Turn.Error | OccurrenceError

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

export function mapPrompt<A, R>(self: Effect.Effect<A, Image.Error | Session.NotFound | Session.BusyError, R>) {
  return self.pipe(
    Effect.mapError((error) =>
      error._tag === "SessionBusyError"
        ? publicBusy(error)
        : error._tag === "NotFoundError"
          ? notFound(error.message)
          : new InvalidRequestError({ message: error.message, kind: error._tag }),
    ),
  )
}

function publicBusy(error: Session.BusyError) {
  return new SessionBusyError({
    sessionID: error.sessionID,
    message: `Session is busy: ${error.sessionID}`,
  })
}
