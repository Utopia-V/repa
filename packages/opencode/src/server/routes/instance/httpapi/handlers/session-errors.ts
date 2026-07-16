import type { NotFoundError as StorageNotFoundError } from "@/storage/storage"
import type { Session } from "@/session/session"
import type { Image } from "@/image/image"
import { Effect } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { SessionBusyError, notFound } from "../errors"

export function mapStorageNotFound<A, R>(self: Effect.Effect<A, StorageNotFoundError, R>) {
  return self.pipe(Effect.mapError((error) => notFound(error.message)))
}

export function mapBusy<A, R>(self: Effect.Effect<A, Session.BusyError, R>) {
  return self.pipe(Effect.catchTag("SessionBusyError", (error) => Effect.fail(publicBusy(error))))
}

export function mapPrompt<A, R>(self: Effect.Effect<A, Image.Error | Session.NotFound | Session.BusyError, R>) {
  return self.pipe(
    Effect.mapError((error) =>
      error._tag === "SessionBusyError"
        ? publicBusy(error)
        : error._tag === "NotFoundError"
          ? notFound(error.message)
          : new HttpApiError.BadRequest({}),
    ),
  )
}

function publicBusy(error: Session.BusyError) {
  return new SessionBusyError({
    sessionID: error.sessionID,
    message: `Session is busy: ${error.sessionID}`,
  })
}
