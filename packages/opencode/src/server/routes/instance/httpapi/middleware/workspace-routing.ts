import { Session } from "@/session/session"
import { getWorkspaceRouteSessionID } from "@/server/shared/workspace-routing"
import { NotFoundError } from "@/storage/storage"
import { Context, Effect, Layer, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

// Query fields this middleware reads from the URL. Spread into every endpoint
// query schema that applies WorkspaceRoutingMiddleware. The inherited symbol
// name remains while its product meaning is reduced to local directory routing.
export const WorkspaceRoutingQueryFields = {
  directory: Schema.optional(Schema.String),
}

export const WorkspaceRoutingQuery = Schema.Struct(WorkspaceRoutingQueryFields)

export class WorkspaceRouteContext extends Context.Service<
  WorkspaceRouteContext,
  {
    readonly directory: string
  }
>()("@opencode/ExperimentalHttpApiWorkspaceRouteContext") {}

export class WorkspaceRoutingMiddleware extends HttpApiMiddleware.Service<
  WorkspaceRoutingMiddleware,
  {
    provides: WorkspaceRouteContext
    requires: Session.Service
  }
>()("@opencode/ExperimentalHttpApiWorkspaceRouting") {}

function requestURL(request: HttpServerRequest.HttpServerRequest): URL {
  return new URL(request.url, "http://localhost")
}

function defaultDirectory(request: HttpServerRequest.HttpServerRequest, url: URL): string {
  return url.searchParams.get("directory") || request.headers["x-opencode-directory"] || process.cwd()
}

function loadSession(session: Session.Interface, url: URL) {
  const sessionID = getWorkspaceRouteSessionID(url)
  if (!sessionID) return Effect.succeed(undefined)
  return session.get(sessionID).pipe(
    Effect.catchIf(
      (error): error is NotFoundError => NotFoundError.isInstance(error),
      () => Effect.succeed(undefined),
    ),
    Effect.catchDefect(() => Effect.succeed(undefined)),
  )
}

function routeHttpApiDirectory<E>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, WorkspaceRouteContext>,
  session: Session.Interface,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E, HttpServerRequest.HttpServerRequest> {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const url = requestURL(request)
    const persisted = yield* loadSession(session, url)
    const directory = persisted?.directory || defaultDirectory(request, url)
    return yield* effect.pipe(
      Effect.provideService(WorkspaceRouteContext, WorkspaceRouteContext.of({ directory })),
    )
  })
}

export const workspaceRoutingLayer = Layer.effect(
  WorkspaceRoutingMiddleware,
  Effect.gen(function* () {
    const session = yield* Session.Service
    return WorkspaceRoutingMiddleware.of((effect) => routeHttpApiDirectory(effect, session))
  }),
)
