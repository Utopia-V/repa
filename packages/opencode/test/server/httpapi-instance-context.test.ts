import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import path from "node:path"
import { InstanceRef, WorkspaceRef } from "../../src/effect/instance-ref"
import { Session } from "../../src/session/session"
import {
  InstanceContextMiddleware,
  instanceContextLayer,
} from "../../src/server/routes/instance/httpapi/middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQueryFields,
  workspaceRoutingLayer,
} from "../../src/server/routes/instance/httpapi/middleware/workspace-routing"
import { disposeAllInstances, testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { resetDatabase } from "../fixture/db"
import { testEffect } from "../lib/effect"

const testStateLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.promise(() => resetDatabase())
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        await disposeAllInstances()
        await resetDatabase()
      }),
    )
  }),
)

const it = testEffect(
  Layer.mergeAll(
    testStateLayer,
    NodeHttpServer.layerTest,
    NodeServices.layer,
    testInstanceStoreLayer,
  ),
)

const ProbeQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  workspace: Schema.optional(Schema.String),
})

const ProbeResult = Schema.Struct({
  directory: Schema.optional(Schema.String),
  worktree: Schema.optional(Schema.String),
  projectID: Schema.optional(Schema.String),
  workspaceID: Schema.optional(Schema.String),
})

const ProbeApi = HttpApi.make("instance-context-probe").add(
  HttpApiGroup.make("probe")
    .add(
      HttpApiEndpoint.get("get", "/probe", {
        query: ProbeQuery,
        success: ProbeResult,
      }),
    )
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware),
)

const probeHandlers = HttpApiBuilder.group(ProbeApi, "probe", (handlers) =>
  handlers.handle("get", () =>
    Effect.gen(function* () {
      const instance = yield* InstanceRef
      const workspaceID = yield* WorkspaceRef
      return {
        directory: instance?.directory,
        worktree: instance?.worktree,
        projectID: instance?.project.id,
        workspaceID,
      }
    }),
  ),
)

const probeRoutes = HttpApiBuilder.layer(ProbeApi).pipe(
  Layer.provide(probeHandlers),
  Layer.provide(Layer.mergeAll(instanceContextLayer, workspaceRoutingLayer)),
  Layer.provide(Layer.mock(Session.Service, {})),
)

const serveProbe = () => probeRoutes.pipe(HttpRouter.serve, Layer.build)

describe("HttpApi instance context middleware", () => {
  it.live("loads the query-selected directory and provides no workspace identity", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const headerDir = path.join(dir, "ignored-header")
      yield* serveProbe()

      const response = yield* HttpClientRequest.get(`/probe?directory=${encodeURIComponent(dir)}`).pipe(
        HttpClientRequest.setHeaders({
          "x-opencode-directory": headerDir,
          "x-opencode-workspace": "wrk_retired",
        }),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      expect(yield* response.json).toMatchObject({
        directory: dir,
        worktree: dir,
        workspaceID: null,
      })
    }),
  )

  it.live("loads the header-selected directory when the query omits one", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      yield* serveProbe()

      const response = yield* HttpClientRequest.get("/probe").pipe(
        HttpClientRequest.setHeader("x-opencode-directory", dir),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      expect(yield* response.json).toMatchObject({
        directory: dir,
        worktree: dir,
        workspaceID: null,
      })
    }),
  )
})
