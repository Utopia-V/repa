import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { afterEach, describe, expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Course } from "@opencode-ai/core/course"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Cause, Config, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http"
import { layerWebSocketConstructorGlobal } from "effect/unstable/socket/Socket"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"

import { InstanceBootstrap as InstanceBootstrapService } from "../../src/project/bootstrap-service"
import { InstanceStore } from "../../src/project/instance-store"
import { Project } from "../../src/project/project"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import * as HttpSessionError from "../../src/server/routes/instance/httpapi/handlers/session-errors"
import { ExperimentalPaths } from "../../src/server/routes/instance/httpapi/groups/experimental"
import { SessionPaths } from "../../src/server/routes/instance/httpapi/groups/session"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionRunState } from "@/session/run-state"
import { MessageID, PartID, SessionID, type SessionID as SessionIDType } from "../../src/session/schema"
import { Database } from "@opencode-ai/core/database/database"
import { PartTable, SessionInputTable, SessionMessageTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import * as DateTime from "effect/DateTime"
import { eq } from "drizzle-orm"
import { resetDatabase } from "../fixture/db"
import {
  disposeAllInstances,
  provideInstanceEffect,
  provideTmpdirInstance,
  TestInstance,
  tmpdirScoped,
} from "../fixture/fixture"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"
import { testEffect } from "../lib/effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { Permission } from "@/permission"
import { LearnerAdmission, LearningCommand, Occurrence } from "@opencode-ai/core/learning-command"
import { LearnerOccurrenceTombstoneTable } from "@opencode-ai/core/learning-command/occurrence.sql"
import { LearningCommandInvocationTable } from "@opencode-ai/core/learning-command/sql"

const noopBootstrapLayer = Layer.succeed(
  InstanceBootstrapService.Service,
  InstanceBootstrapService.Service.of({ run: Effect.void }),
)
const appLayer = AppNodeBuilder.build(
  LayerNode.group([
    InstanceStore.node,
    Project.node,
    Session.node,
    SessionPrompt.node,
    SessionRunState.node,
    Course.node,
    LearningCommandRuntime.node,
    Permission.node,
    Database.node,
    Ripgrep.node,
    EventV2Bridge.node,
  ]),
  [[InstanceStore.bootstrapNode, noopBootstrapLayer]],
)
const servedRoutes: Layer.Layer<never, Config.ConfigError, HttpServer.HttpServer> = HttpRouter.serve(
  HttpApiApp.routes,
  {
    disableListenLog: true,
    disableLogger: true,
  },
)
const httpApiLayer = servedRoutes.pipe(
  Layer.provide(layerWebSocketConstructorGlobal),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
)
const it = testEffect(Layer.mergeAll(appLayer, httpApiLayer))

function pathFor(path: string, params: Record<string, string>) {
  return Object.entries(params).reduce((result, [key, value]) => result.replace(`:${key}`, value), path)
}

function createSession(input?: Session.CreateInput) {
  return Session.use.create(input)
}

function createTextMessage(sessionID: SessionIDType, text: string) {
  return Effect.gen(function* () {
    const svc = yield* Session.Service
    const info = yield* svc.updateMessage({
      id: MessageID.ascending(),
      role: "user",
      sessionID,
      agent: "repa",
      model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
      time: { created: Date.now() },
    })
    const part = yield* svc.updatePart({
      id: PartID.ascending(),
      sessionID,
      messageID: info.id,
      type: "text",
      text,
    })
    return { info, part }
  })
}

const insertLegacyAssistantMessage = (sessionID: SessionIDType, seq = 1, time = seq) =>
  Effect.gen(function* () {
    const message = SessionMessage.Assistant.make({
      id: SessionMessage.ID.create(),
      type: "assistant",
      agent: "repa",
      model: {
        id: ModelV2.ID.make("model"),
        providerID: ProviderV2.ID.make("provider"),
        variant: ModelV2.VariantID.make("default"),
      },
      time: { created: DateTime.makeUnsafe(time) },
      content: [],
    })
    const { db } = yield* Database.Service
    yield* db
      .insert(SessionMessageTable)
      .values([
        {
          id: message.id,
          session_id: sessionID,
          type: message.type,
          seq,
          time_created: time,
          data: {
            time: { created: time },
            agent: message.agent,
            model: message.model,
            content: message.content,
          } as NonNullable<(typeof SessionMessageTable.$inferInsert)["data"]>,
        },
      ])
      .run()
      .pipe(Effect.orDie)
    return message
  })

const insertCorruptV2Message = (sessionID: SessionIDType, time = 1) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db
      .insert(SessionMessageTable)
      .values([
        {
          id: SessionMessage.ID.create(),
          session_id: sessionID,
          type: "assistant",
          seq: time,
          time_created: time,
          data: {} as NonNullable<(typeof SessionMessageTable.$inferInsert)["data"]>,
        },
      ])
      .run()
      .pipe(Effect.orDie)
  })

const setLegacySummaryDiff = (sessionID: SessionIDType) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db
      .update(SessionTable)
      .set({
        summary_additions: 1,
        summary_deletions: 0,
        summary_files: 1,
        summary_diffs: [{ additions: 1, deletions: 0 }],
      })
      .where(eq(SessionTable.id, sessionID))
      .run()
      .pipe(Effect.orDie)
  })

const clearSessionPath = (sessionID: SessionIDType) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db.update(SessionTable).set({ path: null }).where(eq(SessionTable.id, sessionID)).run().pipe(Effect.orDie)
  })

function request(path: string, init?: RequestInit) {
  const url = new URL(path, "http://localhost")
  return HttpClientRequest.fromWeb(new Request(url, init)).pipe(
    HttpClientRequest.setUrl(url.pathname),
    HttpClient.execute,
  )
}

function json<T>(response: HttpClientResponse.HttpClientResponse) {
  if (response.status !== 200) return response.text.pipe(Effect.flatMap((text) => Effect.die(new Error(text))))
  return response.json.pipe(Effect.map((value) => value as T))
}

function responseJson(response: HttpClientResponse.HttpClientResponse) {
  return response.json
}

function requestJson<T>(path: string, init?: RequestInit) {
  return request(path, init).pipe(Effect.flatMap(json<T>))
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("session HttpApi", () => {
  it.effect("maps busy sessions to public session busy errors", () =>
    Effect.gen(function* () {
      const sessionID = SessionID.descending()
      const exit = yield* HttpSessionError.mapBusy(Effect.fail(new Session.BusyError({ sessionID }))).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toMatchObject({
          _tag: "SessionBusyError",
          sessionID,
          message: `Session is busy: ${sessionID}`,
        })
      }
    }),
  )

  it.instance(
    "returns declared 409 errors when Session mutation endpoints enter during closing",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const runState = yield* SessionRunState.Service
        const sessions = yield* Session.Service
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const cases = [
          {
            name: "update",
            path: (sessionID: SessionIDType) => pathFor(SessionPaths.update, { sessionID }),
            method: "PATCH",
            body: { title: "must not publish" },
          },
          {
            name: "init",
            path: (sessionID: SessionIDType) => pathFor(SessionPaths.init, { sessionID }),
            method: "POST",
            body: { providerID: "test", modelID: "test", messageID: MessageID.ascending() },
          },
          {
            name: "summarize",
            path: (sessionID: SessionIDType) => pathFor(SessionPaths.summarize, { sessionID }),
            method: "POST",
            body: { providerID: "test", modelID: "test", auto: false },
          },
          {
            name: "prompt",
            path: (sessionID: SessionIDType) => pathFor(SessionPaths.prompt, { sessionID }),
            method: "POST",
            body: { agent: "repa", noReply: true, parts: [{ type: "text", text: "must not admit" }] },
          },
          {
            name: "command",
            path: (sessionID: SessionIDType) => pathFor(SessionPaths.command, { sessionID }),
            method: "POST",
            body: { command: "missing-during-close", arguments: "" },
          },
        ] as const

        for (const input of cases) {
          const session = yield* createSession({ title: `closing ${input.name}` })
          const entered = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined).pipe(Effect.asVoid))
          const reader = yield* runState
            .shared(session.id, Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))))
            .pipe(Effect.forkChild)
          yield* Deferred.await(entered).pipe(Effect.timeout("2 seconds"))
          const deletion = yield* sessions.remove(session.id).pipe(Effect.forkChild)
          yield* Effect.gen(function* () {
            while ((yield* runState.phase(session.id)) !== "closing") yield* Effect.sleep("1 millis")
          }).pipe(Effect.timeout("2 seconds"))

          const response = yield* request(input.path(session.id), {
            method: input.method,
            headers,
            body: JSON.stringify(input.body),
          })
          const body = yield* responseJson(response)
          expect({ name: input.name, status: response.status, body }).toEqual({
            name: input.name,
            status: 409,
            body: {
              _tag: "SessionBusyError",
              sessionID: session.id,
              message: `Session is busy: ${session.id}`,
            },
          })

          yield* Deferred.succeed(release, undefined)
          yield* Fiber.join(reader)
          yield* Fiber.join(deletion)
        }
      }),
    { git: true, config: { formatter: false, lsp: false } },
    { timeout: 30000 },
  )

  it.instance(
    "maps summarize loop Busy to 409 when deletion starts after compaction admission",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const prompt = yield* SessionPrompt.Service
        const runState = yield* SessionRunState.Service
        const sessions = yield* Session.Service
        const session = yield* createSession({ title: "summarize close race" })
        const loopStarted = yield* Deferred.make<void>()
        const releaseLoop = yield* Deferred.make<void>()
        const originalLoop = prompt.loop
        const mutablePrompt = prompt as { loop: typeof prompt.loop }
        mutablePrompt.loop = (input) =>
          Deferred.succeed(loopStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releaseLoop)),
            Effect.andThen(originalLoop(input)),
          )
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(releaseLoop, undefined).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                mutablePrompt.loop = originalLoop
              }),
            ),
            Effect.asVoid,
          ),
        )

        const responseFiber = yield* request(pathFor(SessionPaths.summarize, { sessionID: session.id }), {
          method: "POST",
          headers: { "x-opencode-directory": test.directory, "content-type": "application/json" },
          body: JSON.stringify({ providerID: "test", modelID: "test", auto: false }),
        }).pipe(Effect.forkChild)
        yield* Deferred.await(loopStarted).pipe(Effect.timeout("2 seconds"))
        const deletion = yield* sessions.remove(session.id).pipe(Effect.forkChild)
        yield* Effect.gen(function* () {
          while ((yield* runState.phase(session.id)) !== "closing") yield* Effect.sleep("1 millis")
        }).pipe(Effect.timeout("2 seconds"))
        yield* Deferred.succeed(releaseLoop, undefined)

        const response = yield* Fiber.join(responseFiber)
        expect(response.status).toBe(409)
        expect(yield* responseJson(response)).toEqual({
          _tag: "SessionBusyError",
          sessionID: session.id,
          message: `Session is busy: ${session.id}`,
        })
        yield* Fiber.join(deletion)
        mutablePrompt.loop = originalLoop
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "returns 409 instead of defecting when prompt cleanup meets closing with a stored revert",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const runState = yield* SessionRunState.Service
        const sessions = yield* Session.Service
        const session = yield* createSession({ title: "revert closing prompt" })
        yield* sessions.setRevert({
          sessionID: session.id,
          revert: { messageID: MessageID.ascending() },
          summary: { additions: 0, deletions: 0, files: 0 },
        })
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined).pipe(Effect.asVoid))
        const reader = yield* runState
          .shared(session.id, Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))))
          .pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        const deletion = yield* sessions.remove(session.id).pipe(Effect.forkChild)
        yield* Effect.gen(function* () {
          while ((yield* runState.phase(session.id)) !== "closing") yield* Effect.sleep("1 millis")
        }).pipe(Effect.timeout("2 seconds"))

        const response = yield* request(pathFor(SessionPaths.prompt, { sessionID: session.id }), {
          method: "POST",
          headers: { "x-opencode-directory": test.directory, "content-type": "application/json" },
          body: JSON.stringify({ agent: "repa", noReply: true, parts: [{ type: "text", text: "blocked" }] }),
        })
        expect(response.status).toBe(409)
        expect(yield* responseJson(response)).toMatchObject({ _tag: "SessionBusyError", sessionID: session.id })

        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(reader)
        yield* Fiber.join(deletion)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "returns a typed lifecycle error when deletion wins after the HTTP prompt existence check",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const session = yield* createSession({ title: "delete after prompt check" })
        const serviceEntered = yield* Deferred.make<void>()
        const releaseService = yield* Deferred.make<void>()
        const originalPrompt = prompt.prompt
        const mutablePrompt = prompt as { prompt: typeof prompt.prompt }
        mutablePrompt.prompt = (input) =>
          Deferred.succeed(serviceEntered, undefined).pipe(
            Effect.andThen(Deferred.await(releaseService)),
            Effect.andThen(originalPrompt(input)),
          )
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(releaseService, undefined).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                mutablePrompt.prompt = originalPrompt
              }),
            ),
            Effect.asVoid,
          ),
        )

        const responseFiber = yield* request(pathFor(SessionPaths.prompt, { sessionID: session.id }), {
          method: "POST",
          headers: { "x-opencode-directory": test.directory, "content-type": "application/json" },
          body: JSON.stringify({ agent: "repa", noReply: true, parts: [{ type: "text", text: "too late" }] }),
        }).pipe(Effect.forkChild)
        yield* Deferred.await(serviceEntered).pipe(Effect.timeout("2 seconds"))
        yield* sessions.remove(session.id)
        yield* Deferred.succeed(releaseService, undefined)

        const response = yield* Fiber.join(responseFiber)
        expect(response.status).toBe(409)
        expect(yield* responseJson(response)).toMatchObject({ _tag: "SessionBusyError", sessionID: session.id })
        mutablePrompt.prompt = originalPrompt
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "returns declared not found errors for read routes",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory }
        const missingSession = SessionID.descending()
        const missingSessionBody = {
          name: "NotFoundError",
          data: { message: `Session not found: ${missingSession}` },
        }

        const get = yield* request(pathFor(SessionPaths.get, { sessionID: missingSession }), { headers })
        expect(get.status).toBe(404)
        expect(yield* responseJson(get)).toEqual(missingSessionBody)

        const children = yield* request(pathFor(SessionPaths.children, { sessionID: missingSession }), { headers })
        expect(children.status).toBe(404)
        expect(yield* responseJson(children)).toEqual(missingSessionBody)

        const todo = yield* request(pathFor(SessionPaths.todo, { sessionID: missingSession }), { headers })
        expect(todo.status).toBe(404)
        expect(yield* responseJson(todo)).toEqual(missingSessionBody)

        const messages = yield* request(pathFor(SessionPaths.messages, { sessionID: missingSession }), { headers })
        expect(messages.status).toBe(404)
        expect(yield* responseJson(messages)).toEqual(missingSessionBody)

        const remove = yield* request(pathFor(SessionPaths.remove, { sessionID: missingSession }), {
          headers,
          method: "DELETE",
        })
        expect(remove.status).toBe(404)
        expect(yield* responseJson(remove)).toEqual(missingSessionBody)

        const prompt = yield* request(pathFor(SessionPaths.prompt, { sessionID: missingSession }), {
          headers: { ...headers, "content-type": "application/json" },
          method: "POST",
          body: JSON.stringify({ agent: "repa", noReply: true, parts: [{ type: "text", text: "hello" }] }),
        })
        expect(prompt.status).toBe(404)
        expect(yield* responseJson(prompt)).toEqual(missingSessionBody)

        const abort = yield* request(pathFor(SessionPaths.abort, { sessionID: missingSession }), {
          headers,
          method: "POST",
        })
        expect(abort.status).toBe(200)
        expect(yield* responseJson(abort)).toBe(true)

        const session = yield* createSession({ title: "missing message" })
        const missingMessage = MessageID.ascending()
        const message = yield* request(
          pathFor(SessionPaths.message, { sessionID: session.id, messageID: missingMessage }),
          { headers },
        )
        expect(message.status).toBe(404)
        expect(yield* responseJson(message)).toEqual({
          name: "NotFoundError",
          data: { message: `Message not found: ${missingMessage}` },
        })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "serves read routes",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory }
        const parent = yield* createSession({ title: "parent" })
        const child = yield* createSession({ title: "child", parentID: parent.id })
        const message = yield* createTextMessage(parent.id, "hello")
        yield* createTextMessage(parent.id, "world")

        const listed = yield* requestJson<Session.Info[]>(`${SessionPaths.list}?roots=true`, { headers })
        expect(listed.map((item) => item.id)).toContain(parent.id)
        expect(Object.hasOwn(listed[0]!, "parentID")).toBe(false)

        expect(yield* requestJson<Record<string, unknown>>(SessionPaths.status, { headers })).toEqual({})

        expect(
          yield* requestJson<Session.Info>(pathFor(SessionPaths.get, { sessionID: parent.id }), { headers }),
        ).toMatchObject({ id: parent.id, title: "parent" })

        expect(
          (yield* requestJson<Session.Info[]>(pathFor(SessionPaths.children, { sessionID: parent.id }), {
            headers,
          })).map((item) => item.id),
        ).toEqual([child.id])

        expect(
          yield* requestJson<unknown[]>(pathFor(SessionPaths.todo, { sessionID: parent.id }), { headers }),
        ).toEqual([])

        expect(
          yield* requestJson<unknown[]>(pathFor(SessionPaths.diff, { sessionID: parent.id }), { headers }),
        ).toEqual([])

        const messages = yield* request(`${pathFor(SessionPaths.messages, { sessionID: parent.id })}?limit=1`, {
          headers,
        })
        const messagePage = yield* json<SessionV1.WithParts[]>(messages)
        const nextCursor = messages.headers["x-next-cursor"]
        expect(nextCursor).toBeTruthy()
        expect(messagePage[0]?.parts[0]).toMatchObject({ type: "text" })

        expect(
          (yield* request(`${pathFor(SessionPaths.messages, { sessionID: parent.id })}?before=${nextCursor}`, {
            headers,
          })).status,
        ).toBe(400)
        expect(
          (yield* request(`${pathFor(SessionPaths.messages, { sessionID: parent.id })}?limit=1&before=invalid`, {
            headers,
          })).status,
        ).toBe(400)

        expect(
          yield* requestJson<SessionV1.WithParts>(
            pathFor(SessionPaths.message, { sessionID: parent.id, messageID: message.info.id }),
            { headers },
          ),
        ).toMatchObject({ info: { id: message.info.id } })

        yield* insertLegacyAssistantMessage(parent.id)

        expect(
          (yield* requestJson<{ data: SessionMessage.Message[] }>(`/api/session/${parent.id}/message`, {
            headers,
          })).data,
        ).toMatchObject([{ type: "assistant" }])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.live("uses the persisted session directory for prompt requests", () =>
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      yield* llm.text("ok", { usage: { input: 1, output: 1 } })

      const config = testProviderConfig(llm.url)
      const sessionDirectory = yield* tmpdirScoped({ git: true, config })
      const requestDirectory = yield* tmpdirScoped({ git: true, config })
      const session = yield* createSession({ title: "directory regression" }).pipe(
        provideInstanceEffect(sessionDirectory),
      )

      const response = yield* request(
        `${pathFor(SessionPaths.prompt, { sessionID: session.id })}?directory=${encodeURIComponent(requestDirectory)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agent: "repa",
            model: { providerID: "test", modelID: "test-model" },
            parts: [{ type: "text", text: "which directory?" }],
          }),
        },
      )

      expect(response.status).toBe(200)
      yield* responseJson(response)

      const messages = yield* Session.use
        .messages({ sessionID: session.id })
        .pipe(provideInstanceEffect(sessionDirectory), Effect.orDie)
      const assistant = messages.find((message) => message.info.role === "assistant")
      expect(assistant?.info.role === "assistant" ? assistant.info.path : undefined).toEqual({
        cwd: sessionDirectory,
        root: sessionDirectory,
      })
    }).pipe(Effect.provide(TestLLMServer.layer), Effect.provide(AppNodeBuilder.build(CrossSpawnSpawner.node))),
  )

  it.instance(
    "returns v2 public cursor request errors",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory }
        const session = yield* createSession({ title: "v2 cursor" })
        const firstMessage = yield* insertLegacyAssistantMessage(session.id, 1, 2)
        const secondMessage = yield* insertLegacyAssistantMessage(session.id, 2, 1)

        const sessionPage = yield* request(
          `/api/session?${new URLSearchParams({
            limit: "1",
            order: "asc",
            directory: test.directory,
            search: "v2",
          })}`,
          { headers },
        )
        const sessionCursor = (yield* json<{ data: Session.Info[]; cursor: { next?: string } }>(sessionPage)).cursor
          .next
        expect(sessionCursor).toBeTruthy()
        expect(JSON.parse(Buffer.from(sessionCursor!, "base64url").toString("utf8"))).toMatchObject({
          order: "asc",
          directory: test.directory,
          search: "v2",
          anchor: { id: session.id, direction: "next" },
        })

        const sessionNextPage = yield* request(`/api/session?cursor=${sessionCursor}`, { headers })
        expect(sessionNextPage.status).toBe(200)

        const invalidSessionCursor = yield* request(`/api/session?cursor=invalid`, { headers })
        expect(invalidSessionCursor.status).toBe(400)
        expect(yield* responseJson(invalidSessionCursor)).toMatchObject({
          _tag: "InvalidCursorError",
          message: "Invalid cursor",
        })

        const messagePage = yield* request(`/api/session/${session.id}/message?limit=1`, { headers })
        const messageBody = yield* json<{ data: SessionMessage.Message[]; cursor: { next?: string } }>(messagePage)
        const messageCursor = messageBody.cursor.next
        expect(messageCursor).toBeTruthy()
        expect(messageBody.data.map((message) => message.id)).toEqual([secondMessage.id])
        expect(JSON.parse(Buffer.from(messageCursor!, "base64url").toString("utf8"))).toEqual({
          id: secondMessage.id,
          order: "desc",
          direction: "next",
        })

        const nextMessagePage = yield* request(`/api/session/${session.id}/message?cursor=${messageCursor}`, {
          headers,
        })
        expect(
          (yield* json<{ data: SessionMessage.Message[] }>(nextMessagePage)).data.map((message) => message.id),
        ).toEqual([firstMessage.id])

        const legacyMessageCursor = Buffer.from(
          JSON.stringify({ id: secondMessage.id, time: 1, order: "desc", direction: "next" }),
        ).toString("base64url")
        const legacyMessagePage = yield* request(`/api/session/${session.id}/message?cursor=${legacyMessageCursor}`, {
          headers,
        })
        expect(
          (yield* json<{ data: SessionMessage.Message[] }>(legacyMessagePage)).data.map((message) => message.id),
        ).toEqual([firstMessage.id])

        const messageCursorWithOrder = yield* request(
          `/api/session/${session.id}/message?cursor=${messageCursor}&order=asc`,
          { headers },
        )
        expect(messageCursorWithOrder.status).toBe(400)
        expect(yield* responseJson(messageCursorWithOrder)).toMatchObject({
          _tag: "InvalidCursorError",
          message: "Cursor cannot be combined with order",
        })

        const invalidMessageCursor = yield* request(`/api/session/${session.id}/message?cursor=invalid`, { headers })
        expect(invalidMessageCursor.status).toBe(400)
        expect(yield* responseJson(invalidMessageCursor)).toMatchObject({
          _tag: "InvalidCursorError",
          message: "Invalid cursor",
        })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "returns v2 public not found errors for missing sessions",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory }
        const missing = SessionID.descending()
        const expected = {
          _tag: "SessionNotFoundError",
          sessionID: missing,
          message: `Session not found: ${missing}`,
        }

        const messages = yield* request(`/api/session/${missing}/message`, { headers })
        expect(messages.status).toBe(404)
        expect(yield* responseJson(messages)).toEqual(expected)

        const context = yield* request(`/api/session/${missing}/context`, { headers })
        expect(context.status).toBe(404)
        expect(yield* responseJson(context)).toEqual(expected)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "does not register preview-v2 execution routes or admit their prompts",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory }
        const session = yield* createSession({ title: "v2 execution hibernated" })
        const messageID = SessionMessage.ID.make("msg_http_hibernated")
        const responses = yield* Effect.forEach(
          [
            { path: "/api/session/active", method: "GET" },
            {
              path: `/api/session/${session.id}/prompt`,
              method: "POST",
              body: JSON.stringify({ id: messageID, prompt: { text: "hello" } }),
            },
            { path: `/api/session/${session.id}/compact`, method: "POST" },
            { path: `/api/session/${session.id}/wait`, method: "POST" },
            { path: `/api/session/${session.id}/interrupt`, method: "POST" },
          ] as const,
          (input) =>
            request(input.path, {
              method: input.method,
              headers: "body" in input ? { ...headers, "content-type": "application/json" } : headers,
              body: "body" in input ? input.body : undefined,
            }),
        )

        expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404])
        const admitted = yield* Database.Service.use(({ db }) =>
          db.select().from(SessionInputTable).where(eq(SessionInputTable.id, messageID)).get().pipe(Effect.orDie),
        )
        expect(admitted).toBeUndefined()
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "returns safe v2 unknown errors for corrupt projected messages",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* createSession({ title: "v2 corrupt message" })
        yield* insertCorruptV2Message(session.id)

        const messages = yield* request(`/api/session/${session.id}/message`, {
          headers: { "x-opencode-directory": test.directory },
        })
        const messagesBody = yield* responseJson(messages)
        expect(messages.status).toBe(500)
        expect(messagesBody).toMatchObject({
          _tag: "UnknownError",
          message: "Unexpected server error. Check server logs for details.",
        })
        expect((messagesBody as { ref?: unknown }).ref).toMatch(/^err_[0-9a-f-]{8}$/)
        expect(JSON.stringify(messagesBody)).not.toContain("assistant")

        const context = yield* request(`/api/session/${session.id}/context`, {
          headers: { "x-opencode-directory": test.directory },
        })
        const contextBody = yield* responseJson(context)
        expect(context.status).toBe(500)
        expect(contextBody).toMatchObject({
          _tag: "UnknownError",
          message: "Unexpected server error. Check server logs for details.",
        })
        expect((contextBody as { ref?: unknown }).ref).toMatch(/^err_[0-9a-f-]{8}$/)
        expect(JSON.stringify(contextBody)).not.toContain("assistant")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "serves sessions with migrated summary diffs missing file details",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* createSession({ title: "legacy diff" })
        yield* setLegacySummaryDiff(session.id)

        const response = yield* request(pathFor(SessionPaths.get, { sessionID: session.id }), {
          headers: { "x-opencode-directory": test.directory },
        })

        expect(response.status).toBe(200)
        expect((yield* json<Session.Info>(response)).summary?.diffs).toEqual([{ additions: 1, deletions: 0 }])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "serves lifecycle mutation routes",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }

        const createdEmpty = yield* requestJson<Session.Info>(SessionPaths.create, {
          method: "POST",
          headers,
        })
        expect(createdEmpty.id).toBeTruthy()

        const created = yield* requestJson<Session.Info>(SessionPaths.create, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "created" }),
        })
        expect(created.title).toBe("created")

        const updated = yield* requestJson<Session.Info>(pathFor(SessionPaths.update, { sessionID: created.id }), {
          method: "PATCH",
          headers,
          body: JSON.stringify({ title: "updated", time: { archived: 1 } }),
        })
        expect(updated).toMatchObject({ id: created.id, title: "updated", time: { archived: 1 } })

        const forked = yield* requestJson<Session.Info>(pathFor(SessionPaths.fork, { sessionID: created.id }), {
          method: "POST",
          headers,
        })
        expect(forked.id).not.toBe(created.id)

        const forkedWithoutContentType = yield* requestJson<Session.Info>(
          pathFor(SessionPaths.fork, { sessionID: created.id }),
          {
            method: "POST",
            headers: { "x-opencode-directory": test.directory },
          },
        )
        expect(forkedWithoutContentType.id).not.toBe(created.id)

        const invalidFork = yield* request(pathFor(SessionPaths.fork, { sessionID: created.id }), {
          method: "POST",
          headers,
          body: "{",
        })
        expect(invalidFork.status).toBe(400)

        const forkedWhitespace = yield* requestJson<Session.Info>(
          pathFor(SessionPaths.fork, { sessionID: created.id }),
          {
            method: "POST",
            headers,
            body: "  \n",
          },
        )
        expect(forkedWhitespace.id).not.toBe(created.id)

        expect(
          yield* requestJson<boolean>(pathFor(SessionPaths.abort, { sessionID: created.id }), {
            method: "POST",
            headers,
          }),
        ).toBe(true)

        expect(
          yield* requestJson<boolean>(pathFor(SessionPaths.remove, { sessionID: created.id }), {
            method: "DELETE",
            headers,
          }),
        ).toBe(true)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "validates archived timestamp values",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const session = yield* createSession({ title: "archived" })
        const body = JSON.stringify({ time: { archived: -1 } })

        const response = yield* request(pathFor(SessionPaths.update, { sessionID: session.id }), {
          method: "PATCH",
          headers,
          body,
        })
        expect(response.status).toBe(200)
        expect((yield* json<Session.Info>(response)).time.archived).toBe(-1)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "uses project-scoped path and directory precedence",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const currentDir = path.join(test.directory, "packages", "opencode", "src")
        yield* Effect.promise(() => mkdir(currentDir, { recursive: true }))

        const store = yield* InstanceStore.Service
        const { pathSession, pathlessSession } = yield* store.provide(
          { directory: currentDir },
          Effect.gen(function* () {
            return {
              pathSession: yield* createSession(),
              pathlessSession: yield* createSession(),
            }
          }).pipe(Effect.provideService(TestInstance, { directory: currentDir })),
        )
        yield* clearSessionPath(pathlessSession.id)

        const query = new URLSearchParams({
          scope: "project",
          path: "packages/opencode/src",
          directory: currentDir,
        })
        const headers = { "x-opencode-directory": test.directory }
        const sessions = (yield* json<Session.Info[]>(
          yield* request(`${SessionPaths.list}?${query}`, { headers }),
        )).map((item) => item.id)

        expect(sessions).toContain(pathSession.id)
        expect(sessions).not.toContain(pathlessSession.id)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "lists sessions created through an equivalent directory hint",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const hint = test.directory + path.sep
        const headers = { "x-opencode-directory": hint, "content-type": "application/json" }
        const created = yield* requestJson<Session.Info>(SessionPaths.create, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "hinted" }),
        })

        const query = new URLSearchParams({ directory: hint, roots: "true" })
        const listed = yield* requestJson<Session.Info[]>(`${SessionPaths.list}?${query}`, { headers })
        expect(listed.map((item) => item.id)).toContain(created.id)

        const globalQuery = new URLSearchParams({ directory: hint })
        const global = yield* requestJson<Session.Info[]>(`${ExperimentalPaths.session}?${globalQuery}`, { headers })
        expect(global.map((item) => item.id)).toContain(created.id)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "lists Windows sessions for equivalent directory spellings",
    () =>
      Effect.gen(function* () {
        if (process.platform !== "win32") return
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const created = yield* requestJson<Session.Info>(SessionPaths.create, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "windows spelling" }),
        })

        const forwardSlashes = test.directory.replaceAll("\\", "/")
        const lowercaseDrive = test.directory.replace(/^[A-Z]:/, (drive) => drive.toLowerCase())
        const trailingSeparator = `${test.directory}\\`
        for (const spelling of [forwardSlashes, lowercaseDrive, trailingSeparator]) {
          const query = new URLSearchParams({ directory: spelling, roots: "true" })
          const listed = yield* requestJson<Session.Info[]>(`${SessionPaths.list}?${query}`, { headers })
          expect({ spelling, ids: listed.map((item) => item.id) }).toEqual({ spelling, ids: [created.id] })
        }
      }),
    { git: true, config: { formatter: false, lsp: false } },
    { timeout: 15000 },
  )

  it.instance(
    "lists Windows sessions created through the global worktree sentinel",
    () =>
      Effect.gen(function* () {
        if (process.platform !== "win32") return
        const globalWorktreeSentinel = "/"
        const headers = { "x-opencode-directory": globalWorktreeSentinel, "content-type": "application/json" }
        const driveRootSession = yield* requestJson<Session.Info>(SessionPaths.create, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "created at drive root" }),
        })
        expect(driveRootSession.directory).toMatch(/^[A-Za-z]:\\$/)

        const query = new URLSearchParams({ directory: globalWorktreeSentinel, roots: "true" })
        const listed = yield* requestJson<Session.Info[]>(`${SessionPaths.list}?${query}`, { headers })
        expect(listed.map((item) => item.id)).toContain(driveRootSession.id)
      }),
    { git: true, config: { formatter: false, lsp: false } },
    { timeout: 15000 },
  )

  it.instance(
    "serves paginated message link headers",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory }
        const session = yield* createSession({ title: "messages" })
        yield* createTextMessage(session.id, "first")
        yield* createTextMessage(session.id, "second")
        const route = `${pathFor(SessionPaths.messages, { sessionID: session.id })}?limit=1`

        const response = yield* request(route, { headers })

        expect(response.headers["x-next-cursor"]).toBeTruthy()
        expect(response.headers["link"]).toContain("limit=1")
        expect(response.headers["access-control-expose-headers"]?.toLowerCase()).toContain("x-next-cursor")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "serves message mutation routes",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const session = yield* createSession({ title: "messages" })
        const first = yield* createTextMessage(session.id, "first")
        const second = yield* createTextMessage(session.id, "second")

        const updated = yield* requestJson<SessionV1.Part>(
          pathFor(SessionPaths.updatePart, {
            sessionID: session.id,
            messageID: first.info.id,
            partID: first.part.id,
          }),
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ ...first.part, text: "updated" }),
          },
        )
        expect(updated).toMatchObject({ id: first.part.id, type: "text", text: "updated" })

        expect(
          yield* requestJson<boolean>(
            pathFor(SessionPaths.deletePart, {
              sessionID: session.id,
              messageID: first.info.id,
              partID: first.part.id,
            }),
            { method: "DELETE", headers },
          ),
        ).toBe(true)

        expect(
          yield* requestJson<boolean>(
            pathFor(SessionPaths.deleteMessage, { sessionID: session.id, messageID: second.info.id }),
            { method: "DELETE", headers },
          ),
        ).toBe(true)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "rejects part updates whose path and body ids disagree",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const session = yield* createSession({ title: "part mismatch" })
        const message = yield* createTextMessage(session.id, "first")
        const response = yield* request(
          pathFor(SessionPaths.updatePart, {
            sessionID: session.id,
            messageID: message.info.id,
            partID: message.part.id,
          }),
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ ...message.part, id: PartID.ascending() }),
          },
        )

        expect(response.status).toBe(400)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "does not let HTTP update or Part deletion bypass admitted-presentation immutability",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const events = yield* EventV2Bridge.Service
        const database = yield* Database.Service
        const svc = yield* Session.Service
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const session = yield* createSession({ title: "immutable presentation" })
        const message = yield* createTextMessage(session.id, "admitted learner input")
        const admitted = yield* events.transaction((tx) =>
          Occurrence.admit(tx, {
            admission: LearnerAdmission.interactive(),
            sessionID: session.id,
            messageID: message.info.id,
            timeAdmitted: Date.now(),
          }).pipe(
            Effect.map((result) => ({ result })),
            Effect.orDie,
          ),
        )
        yield* svc.fork({ sessionID: session.id })
        const assistant = yield* svc.updateMessage({
          id: MessageID.ascending(),
          role: "assistant",
          parentID: message.info.id,
          sessionID: session.id,
          mode: "repa",
          agent: "repa",
          path: { cwd: session.directory, root: session.directory },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: ModelV2.ID.make("test"),
          providerID: ProviderV2.ID.make("test"),
          time: { created: Date.now() },
        })
        const learningPart = yield* svc.updatePart({
          id: PartID.ascending(),
          messageID: assistant.id,
          sessionID: session.id,
          type: "tool",
          tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
          callID: "http-admitted-learning-call",
          state: { status: "pending", input: { frozen: true }, raw: '{"frozen":true}' },
        })
        const learningPartRow = yield* database.db
          .select({ timeCreated: PartTable.time_created })
          .from(PartTable)
          .where(eq(PartTable.id, learningPart.id))
          .get()
          .pipe(Effect.orDie)
        if (!learningPartRow) return yield* Effect.die("expected admitted learning Part")
        yield* database.db
          .insert(LearningCommandInvocationTable)
          .values({
            part_id: learningPart.id,
            session_id: session.id,
            parent_user_message_id: message.info.id,
            assistant_message_id: assistant.id,
            provider_call_id: learningPart.callID,
            occurrence_id: admitted.result.id,
            command_name: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
            command_version: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
            emission_ordinal: 0,
            capability_identity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
            capability_version: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
            authorization_basis: "learner_acceptance",
            input_fingerprint: "0".repeat(64),
            status: "admitted",
            time_admitted: learningPartRow.timeCreated,
          })
          .run()
          .pipe(Effect.orDie)

        const update = yield* request(
          pathFor(SessionPaths.updatePart, {
            sessionID: session.id,
            messageID: message.info.id,
            partID: message.part.id,
          }),
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ ...message.part, text: "changed through HTTP" }),
          },
        )
        expect(update.status).toBeGreaterThanOrEqual(400)
        const deletion = yield* request(
          pathFor(SessionPaths.deletePart, {
            sessionID: session.id,
            messageID: message.info.id,
            partID: message.part.id,
          }),
          { method: "DELETE", headers },
        )
        expect(deletion.status).toBeGreaterThanOrEqual(400)
        const learningUpdate = yield* request(
          pathFor(SessionPaths.updatePart, {
            sessionID: session.id,
            messageID: assistant.id,
            partID: learningPart.id,
          }),
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              ...learningPart,
              state: { ...learningPart.state, input: { frozen: false } },
            }),
          },
        )
        expect(learningUpdate.status).toBeGreaterThanOrEqual(400)
        expect(
          yield* svc.getPart({
            sessionID: session.id,
            messageID: assistant.id,
            partID: learningPart.id,
          }),
        ).toEqual(learningPart)
        expect(
          yield* svc.getPart({
            sessionID: session.id,
            messageID: message.info.id,
            partID: message.part.id,
          }),
        ).toMatchObject({ type: "text", text: "admitted learner input" })
        expect(
          yield* requestJson<boolean>(
            pathFor(SessionPaths.deleteMessage, { sessionID: session.id, messageID: message.info.id }),
            { method: "DELETE", headers },
          ),
        ).toBe(true)
        expect(
          yield* database.db
            .select()
            .from(LearnerOccurrenceTombstoneTable)
            .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, admitted.result.id))
            .get()
            .pipe(Effect.orDie),
        ).toMatchObject({ reason: "source_unavailable" })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "rejects HTTP learning-Part mutation during a live permission wait",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const courses = yield* Course.Service
        const database = yield* Database.Service
        const events = yield* EventV2Bridge.Service
        const permission = yield* Permission.Service
        const runtime = yield* LearningCommandRuntime.Service
        const sessions = yield* Session.Service
        const session = yield* createSession({ title: "permission-wait mutation" })
        const user = yield* createTextMessage(session.id, "accept this Course View Revision")
        const admitted = yield* events.transaction((tx) =>
          Occurrence.admit(tx, {
            admission: LearnerAdmission.interactive(),
            sessionID: session.id,
            messageID: user.info.id,
            timeAdmitted: Date.now(),
          }).pipe(
            Effect.map((result) => ({ result })),
            Effect.orDie,
          ),
        )
        const assistant = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          role: "assistant",
          parentID: user.info.id,
          sessionID: session.id,
          mode: "repa",
          agent: "repa",
          path: { cwd: session.directory, root: session.directory },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: ModelV2.ID.make("test"),
          providerID: ProviderV2.ID.make("test"),
          time: { created: Date.now() },
        })
        const course = yield* courses.createCourse({ title: "Permission wait" })
        const view = yield* courses.createView({
          courseID: course.id,
          name: "Main",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: { items: [{ key: "root", title: "Transactions" }] },
        })
        const canonical = {
          courseID: course.id,
          revisionID: view.revision.id,
          expectedCourseVersion: 0,
          expectedSelectionRevisionID: null,
          expectedSelectionVersion: 0,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
        }
        const registration = Object.freeze({
          partID: PartID.ascending(),
          callID: "http-permission-wait-learning-call",
          emissionOrdinal: 0,
          sessionID: session.id,
          parentUserMessageID: user.info.id,
          assistantMessageID: assistant.id,
        }) satisfies LearningCommandRuntime.Registration
        yield* runtime.prepare(canonical, registration)
        yield* Effect.addFinalizer(() => runtime.interrupt(registration).pipe(Effect.ignore))

        const execution = yield* runtime
          .execute(canonical, {
            sessionID: session.id,
            messageID: assistant.id,
            callID: registration.callID,
            abort: new AbortController().signal,
            extra: {
              toolCall: registration,
              permissionRuleset: [
                {
                  permission: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
                  pattern: "*",
                  action: "ask",
                },
              ],
            },
          } satisfies LearningCommandRuntime.ExecuteContext)
          .pipe(Effect.forkChild)
        const requestInfo = yield* Effect.gen(function* () {
          while (true) {
            const current = (yield* permission.list()).find((item) => item.sessionID === session.id)
            if (current) return current
            yield* Effect.sleep("5 millis")
          }
        }).pipe(Effect.timeout("2 seconds"))
        const pending = yield* sessions.getPart({
          sessionID: session.id,
          messageID: assistant.id,
          partID: registration.partID,
        })
        if (!pending || pending.type !== "tool" || pending.state.status !== "pending") {
          return yield* Effect.die("Expected live permission-wait learning Part")
        }
        expect(admitted.result.id).toBeTruthy()
        const beforeMutation = yield* database.db
          .select({ seq: EventSequenceTable.seq })
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, session.id))
          .get()
          .pipe(Effect.orDie)
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const update = yield* request(
          pathFor(SessionPaths.updatePart, {
            sessionID: session.id,
            messageID: assistant.id,
            partID: registration.partID,
          }),
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              ...pending,
              state: { ...pending.state, input: { ...canonical, expectedCourseVersion: 1 } },
            }),
          },
        )
        expect(update.status).toBeGreaterThanOrEqual(400)
        expect(
          yield* sessions.getPart({
            sessionID: session.id,
            messageID: assistant.id,
            partID: registration.partID,
          }),
        ).toEqual(pending)
        expect(
          yield* database.db
            .select({ seq: EventSequenceTable.seq })
            .from(EventSequenceTable)
            .where(eq(EventSequenceTable.aggregate_id, session.id))
            .get()
            .pipe(Effect.orDie),
        ).toEqual(beforeMutation)

        yield* permission.reply({ requestID: requestInfo.id, reply: "once" })
        const settled = yield* Fiber.join(execution)
        expect(JSON.parse(settled.output)).toMatchObject({ outcome: "applied", courseID: course.id })
        expect(yield* permission.list()).toEqual([])
        expect((yield* courses.getCourse(course.id)).selection).toEqual({
          revisionID: view.revision.id,
          version: 1,
        })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "does not publish a late prompt_async failure after Session deletion",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const database = yield* Database.Service
        const events = yield* EventV2Bridge.Service
        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const session = yield* createSession({ title: "late prompt_async failure" })
        const promptStarted = yield* Deferred.make<void>()
        const releasePrompt = yield* Deferred.make<void>()
        const errorPublished = yield* Deferred.make<void>()
        const originalPrompt = prompt.prompt
        const mutablePrompt = prompt as { prompt: typeof prompt.prompt }
        mutablePrompt.prompt = (input) =>
          Deferred.succeed(promptStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releasePrompt)),
            Effect.andThen(Effect.fail(new Session.BusyError({ sessionID: input.sessionID }))),
          )
        const unsubscribe = yield* events.listen((event) => {
          if (event.type !== Session.Event.Error.type) return Effect.void
          const data = event.data as typeof Session.Event.Error.data.Type
          if (data.sessionID !== session.id) return Effect.void
          return Deferred.succeed(errorPublished, undefined).pipe(Effect.asVoid)
        })
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(releasePrompt, undefined).pipe(
            Effect.andThen(unsubscribe),
            Effect.andThen(
              Effect.sync(() => {
                mutablePrompt.prompt = originalPrompt
              }),
            ),
            Effect.asVoid,
          ),
        )

        const response = yield* request(pathFor(SessionPaths.promptAsync, { sessionID: session.id }), {
          method: "POST",
          headers: { "x-opencode-directory": test.directory, "content-type": "application/json" },
          body: JSON.stringify({
            agent: "repa",
            noReply: true,
            parts: [{ type: "text", text: "fail after deletion" }],
          }),
        })
        expect(response.status).toBe(204)
        yield* Deferred.await(promptStarted).pipe(Effect.timeout("2 seconds"))
        yield* sessions.remove(session.id)
        yield* Deferred.succeed(releasePrompt, undefined)
        const published = yield* Effect.race(
          Deferred.await(errorPublished).pipe(Effect.as(true)),
          Effect.sleep("200 millis").pipe(Effect.as(false)),
        )
        mutablePrompt.prompt = originalPrompt
        expect(published).toBe(false)
        expect(
          yield* database.db
            .select()
            .from(SessionTable)
            .where(eq(SessionTable.id, session.id))
            .get()
            .pipe(Effect.orDie),
        ).toBeUndefined()
        expect(
          yield* database.db
            .select()
            .from(EventTable)
            .where(eq(EventTable.aggregate_id, session.id))
            .get()
            .pipe(Effect.orDie),
        ).toBeUndefined()
        expect(
          yield* database.db
            .select()
            .from(EventSequenceTable)
            .where(eq(EventSequenceTable.aggregate_id, session.id))
            .get()
            .pipe(Effect.orDie),
        ).toBeUndefined()
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "serves remaining non-LLM session mutation routes",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const session = yield* createSession({ title: "remaining" })

        expect(
          yield* requestJson<Session.Info>(pathFor(SessionPaths.revert, { sessionID: session.id }), {
            method: "POST",
            headers,
            body: JSON.stringify({ messageID: MessageID.ascending() }),
          }),
        ).toMatchObject({ id: session.id })

        expect(
          yield* requestJson<Session.Info>(pathFor(SessionPaths.unrevert, { sessionID: session.id }), {
            method: "POST",
            headers,
          }),
        ).toMatchObject({ id: session.id })

        const permissionID = String(PermissionV1.ID.ascending())
        const permission = yield* request(
          pathFor(SessionPaths.permissions, {
            sessionID: session.id,
            permissionID,
          }),
          {
            method: "POST",
            headers,
            body: JSON.stringify({ response: "once" }),
          },
        )
        expect(permission.status).toBe(404)
        expect(yield* responseJson(permission)).toEqual({
          _tag: "PermissionNotFoundError",
          requestID: permissionID,
          message: `Permission request not found: ${permissionID}`,
        })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
