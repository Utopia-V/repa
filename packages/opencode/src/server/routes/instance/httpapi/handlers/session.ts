import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { EventSequenceTable } from "@opencode-ai/core/event/sql"
import { Database } from "@opencode-ai/core/database/database"
import { FutureAttentionDurable } from "@opencode-ai/schema/durable-event-manifest"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { SessionPrompt } from "@/session/prompt"
import { SessionRevert } from "@/session/revert"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Todo } from "@/session/todo"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Effect, Option } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  DiffQuery,
  FutureAttentionFinalizationsQuery,
  ListQuery,
  MessagesQuery,
  PermissionResponsePayload,
  RevertPayload,
  ShellPayload,
  StartPayload,
  SteerPayload,
  UpdatePayload,
} from "../groups/session"
import { PermissionNotFoundError } from "../errors"
import { mapBusy, mapPrompt, mapStorageNotFound, mapTreeBusy, mapTurn } from "./session-errors"
import { Turn } from "@opencode-ai/schema/turn"
import { eq } from "drizzle-orm"

export const sessionHandlers = HttpApiBuilder.group(InstanceHttpApi, "session", (handlers) =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    const promptSvc = yield* SessionPrompt.Service
    const revertSvc = yield* SessionRevert.Service
    const runState = yield* SessionRunState.Service
    const permissionSvc = yield* Permission.Service
    const statusSvc = yield* SessionStatus.Service
    const todoSvc = yield* Todo.Service
    const summary = yield* SessionSummary.Service
    const events = yield* EventV2Bridge.Service
    const db = (yield* Database.Service).db

    const list = Effect.fn("SessionHttpApi.list")(function* (ctx: { query: typeof ListQuery.Type }) {
      const directory = ctx.query.directory ? yield* InstanceState.directory : undefined
      return yield* session.list({
        directory: ctx.query.scope === "project" ? undefined : directory,
        scope: ctx.query.scope,
        path: ctx.query.path,
        roots: ctx.query.roots,
        start: ctx.query.start,
        search: ctx.query.search,
        limit: ctx.query.limit,
      })
    })

    const status = Effect.fn("SessionHttpApi.status")(function* () {
      return Object.fromEntries(yield* statusSvc.list())
    })

    const requireSession = Effect.fn("SessionHttpApi.requireSession")(function* (sessionID: SessionID) {
      return yield* mapStorageNotFound(session.get(sessionID))
    })

    const get = Effect.fn("SessionHttpApi.get")(function* (ctx: { params: { sessionID: SessionID } }) {
      return yield* requireSession(ctx.params.sessionID)
    })

    const children = Effect.fn("SessionHttpApi.children")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* session.children(ctx.params.sessionID)
    })

    const todo = Effect.fn("SessionHttpApi.todo")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* todoSvc.get(ctx.params.sessionID)
    })

    const diff = Effect.fn("SessionHttpApi.diff")(function* (ctx: {
      params: { sessionID: SessionID }
      query: typeof DiffQuery.Type
    }) {
      return yield* summary.diff({ sessionID: ctx.params.sessionID, messageID: ctx.query.messageID })
    })

    const messages = Effect.fn("SessionHttpApi.messages")(function* (ctx: {
      params: { sessionID: SessionID }
      query: typeof MessagesQuery.Type
    }) {
      if (ctx.query.before && ctx.query.limit === undefined) return yield* new HttpApiError.BadRequest({})
      if (ctx.query.before) {
        const before = ctx.query.before
        yield* Effect.try({
          try: () => MessageV2.cursor.decode(before),
          catch: () => new HttpApiError.BadRequest({}),
        })
      }
      yield* requireSession(ctx.params.sessionID)
      if (ctx.query.limit === undefined || ctx.query.limit === 0) {
        return yield* mapStorageNotFound(session.messages({ sessionID: ctx.params.sessionID }))
      }

      const page = yield* mapStorageNotFound(
        MessageV2.page({
          sessionID: ctx.params.sessionID,
          limit: ctx.query.limit,
          before: ctx.query.before,
        }),
      )
      if (!page.cursor) return page.items

      const request = yield* HttpServerRequest.HttpServerRequest
      // toURL() honors the Host + x-forwarded-proto headers, so the Link
      // header echoes the real origin instead of a hard-coded localhost.
      const url = Option.getOrElse(HttpServerRequest.toURL(request), () => new URL(request.url, "http://localhost"))
      url.searchParams.set("limit", ctx.query.limit.toString())
      url.searchParams.set("before", page.cursor)
      return HttpServerResponse.jsonUnsafe(page.items, {
        headers: {
          "Access-Control-Expose-Headers": "Link, X-Next-Cursor",
          Link: `<${url.toString()}>; rel="next"`,
          "X-Next-Cursor": page.cursor,
        },
      })
    })

    const message = Effect.fn("SessionHttpApi.message")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID }
    }) {
      return yield* mapStorageNotFound(
        MessageV2.get({ sessionID: ctx.params.sessionID, messageID: ctx.params.messageID }),
      )
    })

    const futureAttentionFinalizations = Effect.fn("SessionHttpApi.futureAttentionFinalizations")(function* (ctx: {
      params: { sessionID: SessionID }
      query: typeof FutureAttentionFinalizationsQuery.Type
    }) {
      const result = yield* EventV2.readAggregate(db, {
        aggregateID: ctx.params.sessionID,
        after: ctx.query.after,
        limit: ctx.query.limit ?? 100,
        manifest: FutureAttentionDurable,
      })
      return {
        events: result.events.map((event) => ({
          id: event.id,
          type: event.type,
          sequence: event.durable!.seq,
          properties: event.data,
        })),
        hasMore: result.hasMore,
      }
    })

    const remove = Effect.fn("SessionHttpApi.remove")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* session.remove(ctx.params.sessionID).pipe(
        Effect.catchTag("SessionBusyError", (error) => mapBusy(Effect.fail(error))),
        Effect.catchTag("SessionTreeBusyError", (error) => mapTreeBusy(Effect.fail(error))),
        Effect.catchTag("NotFoundError", (error) => mapStorageNotFound(Effect.fail(error))),
      )
      return true
    })

    const update = Effect.fn("SessionHttpApi.update")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof UpdatePayload.Type
    }) {
      return yield* runState
        .shared(
          ctx.params.sessionID,
          Effect.gen(function* () {
            const current = yield* requireSession(ctx.params.sessionID)
            if (ctx.payload.title !== undefined) {
              yield* session.setTitle({ sessionID: ctx.params.sessionID, title: ctx.payload.title })
            }
            if (ctx.payload.metadata !== undefined) {
              yield* session.setMetadata({ sessionID: ctx.params.sessionID, metadata: ctx.payload.metadata })
            }
            if (ctx.payload.permission !== undefined) {
              yield* session.setPermission({
                sessionID: ctx.params.sessionID,
                permission: Permission.merge(current.permission ?? [], ctx.payload.permission),
              })
            }
            if (ctx.payload.time?.archived !== undefined) {
              yield* session.setArchived({ sessionID: ctx.params.sessionID, time: ctx.payload.time.archived })
            }
            return yield* requireSession(ctx.params.sessionID)
          }),
        )
        .pipe(Effect.catchTag("SessionBusyError", (error) => mapBusy(Effect.fail(error))))
    })

    const forkBasis = Effect.fn("SessionHttpApi.forkBasis")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      const frontier = yield* events.transaction((tx) =>
        tx
          .select({ sourceEventSequence: EventSequenceTable.seq })
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, ctx.params.sessionID))
          .get()
          .pipe(
            Effect.orDie,
            Effect.map((row) => ({ result: row?.sourceEventSequence })),
          ),
      )
      if (frontier.result === undefined) return yield* new HttpApiError.BadRequest({})
      return { sourceSessionID: ctx.params.sessionID, sourceEventSequence: frontier.result }
    })

    const start = Effect.fn("SessionHttpApi.start")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof StartPayload.Type
    }) {
      return yield* mapTurn(promptSvc.start({ ...ctx.payload, sessionID: ctx.params.sessionID }))
    })

    const activeTurn = Effect.fn("SessionHttpApi.activeTurn")(function* (ctx: { params: { sessionID: SessionID } }) {
      return (yield* mapTurn(promptSvc.activeTurn(ctx.params.sessionID))) ?? null
    })

    const listTurns = Effect.fn("SessionHttpApi.listTurns")(function* (ctx: { params: { sessionID: SessionID } }) {
      return yield* mapTurn(promptSvc.listTurns(ctx.params.sessionID))
    })

    const getTurn = Effect.fn("SessionHttpApi.getTurn")(function* (ctx: {
      params: { sessionID: SessionID; turnID: Turn.ID }
    }) {
      return yield* mapTurn(promptSvc.getTurn(ctx.params.sessionID, ctx.params.turnID))
    })

    const awaitTurn = Effect.fn("SessionHttpApi.awaitTurn")(function* (ctx: {
      params: { sessionID: SessionID; turnID: Turn.ID }
    }) {
      return yield* mapTurn(promptSvc.awaitTurn(ctx.params.sessionID, ctx.params.turnID))
    })

    const steer = Effect.fn("SessionHttpApi.steer")(function* (ctx: {
      params: { sessionID: SessionID; turnID: Turn.ID }
      payload: typeof SteerPayload.Type
    }) {
      return yield* mapTurn(
        promptSvc.steer({
          ...ctx.payload,
          sessionID: ctx.params.sessionID,
          expectedTurnID: ctx.params.turnID,
        }),
      )
    })

    const interruptTurn = Effect.fn("SessionHttpApi.interruptTurn")(function* (ctx: {
      params: { sessionID: SessionID; turnID: Turn.ID }
    }) {
      return yield* mapTurn(promptSvc.interruptTurn(ctx.params.sessionID, ctx.params.turnID))
    })

    const shell = Effect.fn("SessionHttpApi.shell")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof ShellPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* mapPrompt(promptSvc.shell({ ...ctx.payload, sessionID: ctx.params.sessionID }))
    })

    const revert = Effect.fn("SessionHttpApi.revert")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof RevertPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* mapBusy(revertSvc.revert({ sessionID: ctx.params.sessionID, ...ctx.payload }))
    })

    const unrevert = Effect.fn("SessionHttpApi.unrevert")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* mapBusy(revertSvc.unrevert({ sessionID: ctx.params.sessionID }))
    })

    const permissionRespond = Effect.fn("SessionHttpApi.permissionRespond")(function* (ctx: {
      params: { sessionID: SessionID; permissionID: PermissionV1.ID }
      payload: typeof PermissionResponsePayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* permissionSvc.reply({ requestID: ctx.params.permissionID, reply: ctx.payload.response }).pipe(
        Effect.catchTag("Permission.NotFoundError", (error) =>
          Effect.fail(
            new PermissionNotFoundError({
              requestID: String(error.requestID),
              message: `Permission request not found: ${error.requestID}`,
            }),
          ),
        ),
      )
      return true
    })

    const deleteMessage = Effect.fn("SessionHttpApi.deleteMessage")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID }
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* mapBusy(session.removeMessage(ctx.params))
      return true
    })

    const deletePart = Effect.fn("SessionHttpApi.deletePart")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID; partID: PartID }
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* mapBusy(session.removePart(ctx.params))
      return true
    })

    const updatePart = Effect.fn("SessionHttpApi.updatePart")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID; partID: PartID }
      payload: typeof SessionV1.Part.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      const payload = ctx.payload as SessionV1.Part
      if (
        payload.id !== ctx.params.partID ||
        payload.messageID !== ctx.params.messageID ||
        payload.sessionID !== ctx.params.sessionID
      ) {
        return yield* new HttpApiError.BadRequest({})
      }
      return yield* mapBusy(runState.idle(ctx.params.sessionID, session.updatePart(payload)))
    })

    return handlers
      .handle("list", list)
      .handle("status", status)
      .handle("get", get)
      .handle("children", children)
      .handle("todo", todo)
      .handle("diff", diff)
      .handle("messages", messages)
      .handle("futureAttentionFinalizations", futureAttentionFinalizations)
      .handle("message", message)
      .handle("remove", remove)
      .handle("update", update)
      .handle("forkBasis", forkBasis)
      .handle("start", start)
      .handle("listTurns", listTurns)
      .handle("activeTurn", activeTurn)
      .handle("getTurn", getTurn)
      .handle("awaitTurn", awaitTurn)
      .handle("steer", steer)
      .handle("interruptTurn", interruptTurn)
      .handle("shell", shell)
      .handle("revert", revert)
      .handle("unrevert", unrevert)
      .handle("permissionRespond", permissionRespond)
      .handle("deleteMessage", deleteMessage)
      .handle("deletePart", deletePart)
      .handle("updatePart", updatePart)
  }),
)
