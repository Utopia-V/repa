import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { Flag } from "@opencode-ai/core/flag/flag"
import { describe, expect, test } from "bun:test"
import { Config, ConfigProvider, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket"
import { InstancePaths } from "../../src/server/routes/instance/httpapi/groups/instance"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { isAllowedCorsOrigin, isAllowedRequestOrigin, type CorsOptions } from "@opencode-ai/server/cors"
import { resetDatabase } from "../fixture/db"
import { testEffect } from "../lib/effect"

const testStateLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const original = {
      REPA_SERVER_PASSWORD: Flag.REPA_SERVER_PASSWORD,
    }
    Flag.REPA_SERVER_PASSWORD = "secret"
    yield* Effect.promise(() => resetDatabase())
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        Flag.REPA_SERVER_PASSWORD = original.REPA_SERVER_PASSWORD
        await resetDatabase()
      }),
    )
  }),
)

const servedRoutes = (cors?: CorsOptions): Layer.Layer<never, Config.ConfigError, HttpServer.HttpServer> =>
  HttpRouter.serve(HttpApiApp.createRoutes(cors), { disableListenLog: true, disableLogger: true })

const serverLayer = (cors?: CorsOptions) =>
  Layer.mergeAll(
    testStateLayer,
    servedRoutes(cors).pipe(
      Layer.provide(Socket.layerWebSocketConstructorGlobal),
      Layer.provideMerge(NodeHttpServer.layerTest),
      Layer.provideMerge(NodeServices.layer),
    ),
  )

const it = testEffect(serverLayer())
const explicit = testEffect(serverLayer({ cors: ["https://custom.example", "oc://renderer"] }))
const password = testEffect(
  serverLayer({ cors: ["https://custom.example"] }).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ REPA_SERVER_PASSWORD: "secret" }))),
  ),
)

const inheritedClientOrigins = [
  "https://app.opencode.ai",
  "oc://renderer",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]

describe("HttpApi CORS", () => {
  test("requires inherited hosted and dormant-client origins to be configured explicitly", () => {
    for (const origin of inheritedClientOrigins) {
      expect(isAllowedCorsOrigin(origin)).toBe(false)
      expect(isAllowedCorsOrigin(origin, { cors: [origin] })).toBe(true)
    }
  })

  test("retains no-Origin, loopback, same-host, and configured-origin rules", () => {
    expect(isAllowedCorsOrigin(undefined)).toBe(true)
    expect(isAllowedCorsOrigin("http://localhost:3000")).toBe(true)
    expect(isAllowedCorsOrigin("http://127.0.0.1:3000")).toBe(true)
    expect(isAllowedRequestOrigin("https://repa.example:8443", "repa.example:8443")).toBe(true)
    expect(isAllowedRequestOrigin("https://other.example", "repa.example")).toBe(false)
    expect(isAllowedCorsOrigin("https://custom.example", { cors: ["https://custom.example"] })).toBe(true)
  })

  it.live("allows browser preflight requests without credentials", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.options(InstancePaths.path).pipe(
        HttpClientRequest.setHeaders({
          origin: "http://localhost:3000",
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization",
        }),
        HttpClient.execute,
      )

      expect(response.status).toBe(204)
      expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000")
      expect(response.headers["access-control-allow-headers"]).toBe("authorization")
    }),
  )

  it.live("does not add CORS headers for an inherited hosted origin", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.options(InstancePaths.path).pipe(
        HttpClientRequest.setHeaders({
          origin: "https://app.opencode.ai",
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization",
        }),
        HttpClient.execute,
      )

      expect(response.status).toBe(204)
      expect(response.headers["access-control-allow-origin"]).toBeUndefined()
    }),
  )

  password.live("adds CORS headers to unauthorized responses for an explicit origin", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.get("/global/config").pipe(
        HttpClientRequest.setHeader("origin", "https://custom.example"),
        HttpClient.execute,
      )

      expect(response.status).toBe(401)
      expect(response.headers["access-control-allow-origin"]).toBe("https://custom.example")
    }),
  )

  explicit.live("uses custom CORS origins passed to the server", () =>
    Effect.gen(function* () {
      for (const origin of ["https://custom.example", "oc://renderer"]) {
        const response = yield* HttpClientRequest.options(InstancePaths.path).pipe(
          HttpClientRequest.setHeaders({
            origin,
            "access-control-request-method": "GET",
            "access-control-request-headers": "authorization",
          }),
          HttpClient.execute,
        )

        expect(response.status).toBe(204)
        expect(response.headers["access-control-allow-origin"]).toBe(origin)
        expect(response.headers["access-control-allow-headers"]).toBe("authorization")
      }

      const rejected = yield* HttpClientRequest.options(InstancePaths.path).pipe(
        HttpClientRequest.setHeaders({
          origin: "https://evil.example",
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization",
        }),
        HttpClient.execute,
      )

      expect(rejected.status).toBe(204)
      expect(rejected.headers["access-control-allow-origin"]).not.toBe("https://evil.example")
    }),
  )
})
