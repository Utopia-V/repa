// Opencode publish boundary for core events. Attach routed instance location
// so direct EventV2 consumers can isolate directory/workspace streams.
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { GlobalBus } from "@/bus/global"
import { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { Project } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionPresentation } from "@opencode-ai/core/session-presentation"
import { MessageTable } from "@opencode-ai/core/session/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Context, Effect, Layer } from "effect"
import { inArray } from "drizzle-orm"

export type Interface = EventV2.Interface & {
  readonly transactionPresentation: <A, D extends EventV2.Definition = EventV2.Definition, E = never, R = never>(
    prepare: (tx: EventV2.Transaction) => Effect.Effect<EventV2.PreparedTransaction<A, D>, E, R>,
  ) => Effect.Effect<
    EventV2.TransactionResult<A, D>,
    | E
    | SessionPresentation.FrontierUnrepresentableError
    | SessionPresentation.AdministrativeHistoryIntegrityError,
    R
  >
}

export class Service extends Context.Service<Service, Interface>()("@opencode/EventV2Bridge") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2.Service

    const publish: EventV2.Interface["publish"] = (definition, data, options) =>
      Effect.gen(function* () {
        if (options?.location) return yield* events.publish(definition, data, options)
        const ctx = yield* InstanceRef
        if (!ctx) return yield* events.publish(definition, data, options)
        const workspaceID = yield* WorkspaceRef
        return yield* events.publish(definition, data, {
          ...options,
          location: new Location.Info({
            directory: AbsolutePath.make(ctx.directory),
            ...(workspaceID ? { workspaceID } : {}),
            project: { id: Project.ID.make(ctx.project.id), directory: AbsolutePath.make(ctx.worktree) },
          }),
        })
      })

    const transactionPresentation: Interface["transactionPresentation"] = (prepare) =>
      Effect.gen(function* () {
        const ctx = yield* InstanceRef
        const workspaceID = yield* WorkspaceRef
        const location = ctx
          ? new Location.Info({
              directory: AbsolutePath.make(ctx.directory),
              ...(workspaceID ? { workspaceID } : {}),
              project: { id: Project.ID.make(ctx.project.id), directory: AbsolutePath.make(ctx.worktree) },
            })
          : undefined
        return yield* events.transaction((tx) =>
          Effect.gen(function* () {
            const prepared = yield* prepare(tx)
            const candidate = prepared as {
              readonly event?: EventV2.PreparedEvent<EventV2.Definition>
              readonly events?: readonly EventV2.PreparedEvent<EventV2.Definition>[]
            }
            const pending = candidate.events ?? (candidate.event ? [candidate.event] : [])
            const createdSessions = new Set(
              pending
                .filter((event) => event.definition.type === SessionV1.Event.Created.type)
                .map((event) => (event.data as { sessionID: string }).sessionID),
            )
            const messages = pending
              .filter((event) => event.definition.type === SessionV1.Event.MessageUpdated.type)
              .map((event) => ({
                event,
                info: (event.data as { info: SessionV1.Info }).info,
              }))
            const existing =
              messages.length === 0
                ? []
                : yield* tx
                    .select({ id: MessageTable.id })
                    .from(MessageTable)
                    .where(inArray(MessageTable.id, messages.map((message) => message.info.id)))
                    .all()
                    .pipe(Effect.orDie)
            const existingIDs = new Set(existing.map((message) => message.id))
            const newMessages = messages.filter((message) => !existingIDs.has(message.info.id))
            for (const sessionID of new Set(newMessages.map((message) => message.info.sessionID))) {
              const block = newMessages.filter((message) => message.info.sessionID === sessionID)
              const floor = Math.max(...block.map((message) => message.info.time.created)) - 1
              let times: readonly number[]
              if (createdSessions.has(sessionID)) {
                if (
                  block.every(
                    (message, index) =>
                      Number.isSafeInteger(message.info.time.created) &&
                      message.info.time.created > 0 &&
                      (index === 0 || message.info.time.created > block[index - 1]!.info.time.created),
                  )
                ) {
                  times = block.map((message) => message.info.time.created)
                } else {
                  const start = Math.max(0, floor) + 1
                  const offset = block.length - 1
                  if (!Number.isSafeInteger(start) || start > Number.MAX_SAFE_INTEGER - offset) {
                    return yield* new SessionPresentation.FrontierUnrepresentableError({ sessionID })
                  }
                  times = Array.from({ length: block.length }, (_, index) => start + index)
                }
              } else {
                times = yield* SessionPresentation.reserveMessageBlock(tx, {
                  sessionID,
                  count: block.length,
                  floor,
                })
              }
              block.forEach((message, index) => {
                message.info.time.created = times[index]!
              })
            }

            messages.forEach(({ info }) => {
              if (info.role === "assistant" && info.time.completed !== undefined) {
                info.time.completed = Math.max(info.time.created, info.time.completed)
              }
            })
            const parts = pending
              .filter((event) => event.definition.type === SessionV1.Event.PartUpdated.type)
              .map((event) => ({
                data: event.data as { sessionID: string; part: SessionV1.Part; time: number },
              }))
            const pendingMessageTimes = new Map(messages.map(({ info }) => [info.id, info.time.created] as const))
            const missingParentIDs = [
              ...new Set(parts.map(({ data }) => data.part.messageID).filter((id) => !pendingMessageTimes.has(id))),
            ]
            const storedParentTimes =
              missingParentIDs.length === 0
                ? []
                : yield* tx
                    .select({ id: MessageTable.id, timeCreated: MessageTable.time_created })
                    .from(MessageTable)
                    .where(inArray(MessageTable.id, missingParentIDs))
                    .all()
                    .pipe(Effect.orDie)
            const parentTimes = new Map([
              ...pendingMessageTimes,
              ...storedParentTimes.map((row) => [row.id, row.timeCreated] as const),
            ])
            parts.forEach(({ data }) => {
              const parentTime = parentTimes.get(data.part.messageID)
              if (parentTime === undefined) return
              data.time = Math.max(parentTime, data.time)
              normalizePartTimes(data.part, parentTime)
            })

            return (() => {
              const route = <D extends EventV2.Definition>(event: EventV2.PreparedEvent<D>) =>
                event.options?.location || !location
                  ? event
                  : { ...event, options: { ...event.options, location } satisfies EventV2.PublishOptions }
              if (prepared.events) return { result: prepared.result, events: prepared.events.map(route) }
              if (prepared.event) return { result: prepared.result, event: route(prepared.event) }
              return prepared
            })()
          }),
        )
      })

    const transaction: EventV2.Interface["transaction"] = (prepare) =>
      transactionPresentation(prepare).pipe(Effect.orDie)

    function remove(aggregateID: string): Effect.Effect<void>
    function remove<A>(aggregateID: string, cleanup: (tx: EventV2.Transaction) => Effect.Effect<A>): Effect.Effect<A>
    function remove<A, D extends EventV2.Definition>(
      aggregateID: string,
      cleanup: (tx: EventV2.Transaction) => Effect.Effect<A>,
      notification: EventV2.PreparedEvent<D>,
      options?: EventV2.RemoveOptions,
    ): Effect.Effect<A>
    function remove<A, D extends EventV2.Definition>(
      aggregateID: string,
      cleanup?: (tx: EventV2.Transaction) => Effect.Effect<A>,
      notification?: EventV2.PreparedEvent<D>,
      options?: EventV2.RemoveOptions,
    ) {
      if (!notification) return cleanup ? events.remove(aggregateID, cleanup) : events.remove(aggregateID)
      if (notification.options?.location) return events.remove(aggregateID, cleanup!, notification, options)
      return Effect.gen(function* () {
        const ctx = yield* InstanceRef
        if (!ctx) return yield* events.remove(aggregateID, cleanup!, notification, options)
        const workspaceID = yield* WorkspaceRef
        return yield* events.remove(
          aggregateID,
          cleanup!,
          {
            ...notification,
            options: {
              ...notification.options,
              location: new Location.Info({
                directory: AbsolutePath.make(ctx.directory),
                ...(workspaceID ? { workspaceID } : {}),
                project: { id: Project.ID.make(ctx.project.id), directory: AbsolutePath.make(ctx.worktree) },
              }),
            },
          },
          options,
        )
      })
    }

    const removeMany: EventV2.Interface["removeMany"] = (aggregateIDs, cleanup, notifications, options) =>
      Effect.gen(function* () {
        if (!notifications || notifications.every((notification) => notification.options?.location)) {
          return yield* events.removeMany(aggregateIDs, cleanup, notifications, options)
        }
        const ctx = yield* InstanceRef
        if (!ctx) return yield* events.removeMany(aggregateIDs, cleanup, notifications, options)
        const workspaceID = yield* WorkspaceRef
        const location = new Location.Info({
          directory: AbsolutePath.make(ctx.directory),
          ...(workspaceID ? { workspaceID } : {}),
          project: { id: Project.ID.make(ctx.project.id), directory: AbsolutePath.make(ctx.worktree) },
        })
        return yield* events.removeMany(
          aggregateIDs,
          cleanup,
          notifications.map((notification) =>
            notification.options?.location
              ? notification
              : { ...notification, options: { ...notification.options, location } },
          ),
          options,
        )
      })

    const unsubscribe = yield* events.listen((event) =>
      Effect.gen(function* () {
        const ctx = yield* InstanceRef
        const workspaceID = (yield* WorkspaceRef) ?? event.location?.workspaceID
        GlobalBus.emit("event", {
          directory: event.location?.directory ?? ctx?.directory,
          project: ctx?.project.id,
          workspace: workspaceID,
          payload: { id: event.id, type: event.type, properties: event.data },
        })
        if (event.durable === undefined) return
        GlobalBus.emit("event", {
          directory: event.location?.directory ?? ctx?.directory,
          project: ctx?.project.id,
          workspace: workspaceID,
          payload: {
            type: "sync",
            syncEvent: {
              id: event.id,
              type: EventV2.versionedType(event.type, event.durable.version),
              seq: event.durable.seq,
              aggregateID: event.durable.aggregateID,
              data: event.data,
            },
          },
        })
      }),
    )
    yield* Effect.addFinalizer(() => unsubscribe)

    return Service.of({ ...events, publish, transaction, transactionPresentation, remove, removeMany })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [EventV2.node] })

function normalizePartTimes(part: SessionV1.Part, parentTime: number) {
  if (part.type === "text" || part.type === "reasoning") {
    if (!part.time) return
    part.time.start = Math.max(parentTime, part.time.start)
    if (part.time.end !== undefined) part.time.end = Math.max(part.time.start, part.time.end)
    return
  }
  if (part.type === "retry") {
    part.time.created = Math.max(parentTime, part.time.created)
    return
  }
  if (part.type !== "tool" || part.state.status === "pending") return
  part.state.time.start = Math.max(parentTime, part.state.time.start)
  if (part.state.status === "running") return
  part.state.time.end = Math.max(part.state.time.start, part.state.time.end)
  if (part.state.status === "completed" && part.state.time.compacted !== undefined) {
    part.state.time.compacted = Math.max(part.state.time.end, part.state.time.compacted)
  }
}

export * as EventV2Bridge from "./event-v2-bridge"
