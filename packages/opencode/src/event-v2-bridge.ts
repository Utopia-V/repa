// Opencode publish boundary for core events. Attach routed instance location
// so direct EventV2 consumers can isolate directory/workspace streams.
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { GlobalBus } from "@/bus/global"
import { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { Project } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Context, Effect, Layer } from "effect"

export class Service extends Context.Service<Service, EventV2.Interface>()("@opencode/EventV2Bridge") {}

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

    const transaction: EventV2.Interface["transaction"] = (prepare) =>
      Effect.gen(function* () {
        const ctx = yield* InstanceRef
        if (!ctx) return yield* events.transaction(prepare)
        const workspaceID = yield* WorkspaceRef
        const location = new Location.Info({
          directory: AbsolutePath.make(ctx.directory),
          ...(workspaceID ? { workspaceID } : {}),
          project: { id: Project.ID.make(ctx.project.id), directory: AbsolutePath.make(ctx.worktree) },
        })
        return yield* events.transaction((tx) =>
          prepare(tx).pipe(
            Effect.map((prepared) => {
              const route = <D extends EventV2.Definition>(event: EventV2.PreparedEvent<D>) =>
                event.options?.location
                  ? event
                  : { ...event, options: { ...event.options, location } satisfies EventV2.PublishOptions }
              if (prepared.events) return { result: prepared.result, events: prepared.events.map(route) }
              if (prepared.event) return { result: prepared.result, event: route(prepared.event) }
              return prepared
            }),
          ),
        )
      })

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

    return Service.of({ ...events, publish, transaction, remove, removeMany })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [EventV2.node] })

export * as EventV2Bridge from "./event-v2-bridge"
