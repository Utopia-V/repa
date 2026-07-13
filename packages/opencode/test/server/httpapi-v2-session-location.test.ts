import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { Database } from "@opencode-ai/core/database/database"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-service-map"
import type { LocationServices } from "@opencode-ai/core/location-services"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { WorkspaceV2 } from "@opencode-ai/core/workspace"
import { expect } from "bun:test"
import { Effect, Layer, LayerMap, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { SessionLocationMiddleware, sessionLocationLayer } from "@opencode-ai/server/middleware/session-location"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const ProbeResult = Schema.Struct({
  directory: Schema.String,
  workspaceID: Schema.optional(Schema.String),
})

const ProbeApi = HttpApi.make("v2-session-location-probe").add(
  HttpApiGroup.make("probe").add(
    HttpApiEndpoint.get("get", "/api/session/:sessionID/location", {
      params: { sessionID: SessionV2.ID },
      query: { directory: Schema.optional(Schema.String) },
      success: ProbeResult,
    }).middleware(SessionLocationMiddleware),
  ),
)

const probeHandlers = HttpApiBuilder.group(ProbeApi, "probe", (handlers) =>
  handlers.handle("get", () =>
    Effect.gen(function* () {
      const location = yield* Location.Service
      if (location.workspaceID) return { directory: location.directory, workspaceID: location.workspaceID }
      return { directory: location.directory }
    }),
  ),
)

const databaseLayer = Database.layerFromPath(":memory:")
const locationServiceMapLayer = Layer.effect(
  LocationServiceMap.Service,
  LayerMap.make(
    (ref) =>
      Layer.succeed(
        Location.Service,
        Location.Service.of({
          directory: ref.directory,
          workspaceID: ref.workspaceID,
          project: { id: ProjectV2.ID.global, directory: ref.directory },
        }),
      ) as Layer.Layer<LocationServices>,
  ),
)
const routes = HttpApiBuilder.layer(ProbeApi).pipe(
  Layer.provide(probeHandlers),
  Layer.provide(sessionLocationLayer),
  Layer.provide(locationServiceMapLayer),
  Layer.provide(databaseLayer),
)
const servedRoutes = HttpRouter.serve(routes, {
  disableListenLog: true,
  disableLogger: true,
})
const httpApiLayer = servedRoutes.pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
)
const it = testEffect(Layer.mergeAll(databaseLayer, httpApiLayer))

it.live("restores only persisted Session.directory for a session-scoped route", () =>
  Effect.gen(function* () {
    const root = yield* tmpdirScoped({ git: true })
    const sessionDirectory = path.join(root, "session-directory")
    const requestDirectory = path.join(root, "request-directory")
    yield* Effect.promise(() => Promise.all([mkdir(sessionDirectory), mkdir(requestDirectory)]))

    const projectID = ProjectV2.ID.global
    const sessionID = SessionV2.ID.create()
    const db = (yield* Database.Service).db
    yield* db
      .insert(ProjectTable)
      .values({
        id: projectID,
        worktree: AbsolutePath.make(root),
        sandboxes: [],
        time_created: 1,
        time_updated: 1,
      })
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: projectID,
        workspace_id: WorkspaceV2.ID.make("wrk_persisted"),
        slug: "persisted",
        directory: AbsolutePath.make(sessionDirectory),
        title: "Persisted session",
        version: "test",
        time_created: 1,
        time_updated: 1,
      })
      .run()
      .pipe(Effect.orDie)

    const response = yield* HttpClientRequest.get(
      `/api/session/${sessionID}/location?directory=${encodeURIComponent(requestDirectory)}`,
    ).pipe(
      HttpClientRequest.setHeaders({
        "x-opencode-directory": requestDirectory,
        "x-opencode-workspace": "wrk_request",
      }),
      HttpClient.execute,
    )

    expect(response.status).toBe(200)
    expect(yield* response.json).toEqual({ directory: sessionDirectory })
  }),
)
