import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { ProjectV2 } from "@opencode-ai/core/project"
import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import path from "node:path"
import { Session } from "../../src/session/session"
import { SessionID } from "../../src/session/schema"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQueryFields,
  WorkspaceRouteContext,
  workspaceRoutingLayer,
} from "../../src/server/routes/instance/httpapi/middleware/workspace-routing"
import { NotFoundError } from "../../src/storage/storage"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(NodeHttpServer.layerTest, NodeServices.layer))

// The probe keeps the retired selector in its own query contract so the
// middleware can prove that legacy input no longer controls local placement.
const ProbeQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  workspace: Schema.optional(Schema.String),
})

const ProbeResult = Schema.Struct({
  directory: Schema.String,
})

const ProbeApi = HttpApi.make("workspace-routing-probe").add(
  HttpApiGroup.make("probe")
    .add(
      HttpApiEndpoint.get("get", "/probe", {
        query: ProbeQuery,
        success: ProbeResult,
      }),
      HttpApiEndpoint.get("session", "/session/:sessionID/message", {
        params: { sessionID: SessionID },
        query: ProbeQuery,
        success: ProbeResult,
      }),
    )
    .middleware(WorkspaceRoutingMiddleware),
)

const routeContextResponse = Effect.gen(function* () {
  const route = yield* WorkspaceRouteContext
  return { directory: route.directory }
})

const probeHandlers = HttpApiBuilder.group(ProbeApi, "probe", (handlers) =>
  handlers.handle("get", () => routeContextResponse).handle("session", () => routeContextResponse),
)

const sessionLayer = (session?: Session.Info) =>
  Layer.mock(Session.Service, {
    get: (id) =>
      session?.id === id
        ? Effect.succeed(session)
        : Effect.fail(new NotFoundError({ message: `Session not found: ${id}` })),
  })

const serveProbe = (session?: Session.Info) =>
  HttpApiBuilder.layer(ProbeApi).pipe(
    Layer.provide(probeHandlers),
    Layer.provide(workspaceRoutingLayer),
    Layer.provide(sessionLayer(session)),
    HttpRouter.serve,
    Layer.build,
  )

function persistedSession(directory: string): Session.Info {
  return {
    id: SessionID.make("ses_persisted"),
    slug: "persisted",
    projectID: ProjectV2.ID.global,
    directory,
    title: "Persisted session",
    version: "test",
    time: { created: 0, updated: 0 },
  }
}

describe("HttpApi workspace routing middleware", () => {
  it.live("selects query directory before header and cwd", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const queryDir = path.join(dir, "query-target")
      const headerDir = path.join(dir, "header-target")
      yield* serveProbe()

      const query = yield* HttpClientRequest.get(`/probe?directory=${encodeURIComponent(queryDir)}`).pipe(
        HttpClientRequest.setHeader("x-opencode-directory", headerDir),
        HttpClient.execute,
      )
      const header = yield* HttpClientRequest.get("/probe").pipe(
        HttpClientRequest.setHeader("x-opencode-directory", headerDir),
        HttpClient.execute,
      )
      const fallback = yield* HttpClient.get("/probe")

      expect(yield* query.json).toEqual({ directory: queryDir })
      expect(yield* header.json).toEqual({ directory: headerDir })
      expect(yield* fallback.json).toEqual({ directory: process.cwd() })
    }),
  )

  it.live("selects persisted Session.directory before request directory hints", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const session = persistedSession(path.join(dir, "session-target"))
      const queryDir = path.join(dir, "query-target")
      const headerDir = path.join(dir, "header-target")
      yield* serveProbe(session)

      const response = yield* HttpClientRequest.get(
        `/session/${session.id}/message?directory=${encodeURIComponent(queryDir)}`,
      ).pipe(HttpClientRequest.setHeader("x-opencode-directory", headerDir), HttpClient.execute)

      expect(response.status).toBe(200)
      expect(yield* response.json).toEqual({ directory: session.directory })
    }),
  )

  it.live("does not let retired workspace selectors change the local directory", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const queryDir = path.join(dir, "query-target")
      const headerDir = path.join(dir, "header-target")
      yield* serveProbe()

      const response = yield* HttpClientRequest.get(
        `/probe?directory=${encodeURIComponent(queryDir)}&workspace=wrk_remote`,
      ).pipe(
        HttpClientRequest.setHeaders({
          "x-opencode-directory": headerDir,
          "x-opencode-workspace": "wrk_header",
        }),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      expect(yield* response.json).toEqual({ directory: queryDir })
    }),
  )
})

test("directory routing layer builds with only the Session service", async () => {
  await Effect.runPromise(
    Effect.scoped(Layer.build(workspaceRoutingLayer.pipe(Layer.provide(sessionLayer())))).pipe(Effect.asVoid),
  )
})
