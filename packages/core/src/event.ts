export * as EventV2 from "./event"

import { Cause, Context, Effect, Fiber, Layer, Option, PubSub, Queue, Schema, Scope, Stream } from "effect"
import { Event } from "@opencode-ai/schema/event"
import type { Data, Definition, Payload } from "@opencode-ai/schema/event"
import { and, asc, eq, gt, inArray } from "drizzle-orm"
import { Database } from "./database/database"
import { EventSequenceTable, EventTable } from "./event/sql"
import { Location } from "./location"
import { makeGlobalNode } from "./effect/app-node"
import { isDeepStrictEqual } from "node:util"
import { Durable } from "@opencode-ai/schema/durable-event-manifest"

export const ID = Event.ID
export type ID = import("@opencode-ai/schema/event").ID
export type { Data, Definition, Payload } from "@opencode-ai/schema/event"

export type Subscriber<D extends Definition = Definition> = (event: Payload<D>) => Effect.Effect<void>
export type Unsubscribe = Effect.Effect<void>

export const latestSequence = Effect.fn("EventV2.latestSequence")(function* (
  db: Database.Interface["db"],
  aggregateID: string,
) {
  const row = yield* db
    .select({ seq: EventSequenceTable.seq })
    .from(EventSequenceTable)
    .where(eq(EventSequenceTable.aggregate_id, aggregateID))
    .get()
    .pipe(Effect.orDie)
  return row?.seq ?? -1
})

export type SerializedEvent = {
  readonly id: ID
  readonly type: string
  readonly seq: number
  readonly aggregateID: string
  readonly data: Record<string, unknown>
}

export class InvalidDurableEventError extends Schema.TaggedErrorClass<InvalidDurableEventError>()(
  "EventV2.InvalidDurableEvent",
  {
    type: Schema.String,
    message: Schema.String,
  },
) {}

const decodeSerializedEvent = (event: SerializedEvent): Payload => {
  const definition = Durable.get(event.type)
  if (!definition?.durable) {
    throw new InvalidDurableEventError({ type: event.type, message: `Unknown durable event type ${event.type}` })
  }
  return {
    id: event.id,
    type: definition.type,
    durable: { aggregateID: event.aggregateID, seq: event.seq, version: definition.durable.version },
    data: Schema.decodeUnknownSync(definition.data)(event.data),
  }
}

export const readAggregate = Effect.fn("EventV2.readAggregate")(function* <A>(
  db: Database.Interface["db"],
  input: {
    readonly aggregateID: string
    readonly after?: number
    readonly limit: number
    readonly manifest: {
      readonly definitions: ReadonlyMap<string, Definition>
      readonly schema: Schema.Decoder<A, never>
    }
  },
) {
  const after = input.after ?? -1
  const rows = yield* db
    .select()
    .from(EventTable)
    .where(
      and(
        eq(EventTable.aggregate_id, input.aggregateID),
        gt(EventTable.seq, after),
        inArray(EventTable.type, Array.from(input.manifest.definitions.keys())),
      ),
    )
    .orderBy(asc(EventTable.seq))
    .limit(input.limit + 1)
    .all()
    .pipe(Effect.orDie)
  const page = rows.slice(0, input.limit)
  const decode = Schema.decodeUnknownSync(input.manifest.schema)
  const events = page.map((event) =>
    decode({
      id: event.id,
      type: input.manifest.definitions.get(event.type)?.type ?? event.type,
      durable: {
        aggregateID: event.aggregate_id,
        seq: event.seq,
        version: input.manifest.definitions.get(event.type)?.durable?.version,
      },
      data: event.data,
    }),
  )
  return {
    events,
    hasMore: rows.length > input.limit,
  }
})

export class SubscriberOverflowError extends Schema.TaggedErrorClass<SubscriberOverflowError>()(
  "EventV2.SubscriberOverflow",
  { capacity: Schema.Int },
) {}

export const define = Event.define
export const versionedType = Event.versionedType

export interface PublishOptions {
  readonly id?: ID
  readonly metadata?: Record<string, unknown>
  readonly location?: Location.Ref
  /** Local operational projection committed atomically with a new durable event. Not replayed or serialized. */
  readonly commit?: (seq: number) => Effect.Effect<void>
}

type DatabaseShape = Database.Interface["db"]
export type Transaction = Parameters<Parameters<DatabaseShape["transaction"]>[0]>[0]

export function nextSequence(tx: Transaction, aggregateID: string) {
  return tx
    .select({ seq: EventSequenceTable.seq })
    .from(EventSequenceTable)
    .where(eq(EventSequenceTable.aggregate_id, aggregateID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row?.seq ?? -1) + 1),
    )
}

export interface PreparedEvent<D extends Definition> {
  readonly definition: D
  readonly data: Data<D>
  readonly options?: PublishOptions
}

export type PreparedTransaction<A, D extends Definition = Definition> =
  | { readonly result: A; readonly event: PreparedEvent<D>; readonly events?: never }
  | { readonly result: A; readonly events: readonly PreparedEvent<D>[]; readonly event?: never }
  | { readonly result: A; readonly event?: never; readonly events?: never }

export type TransactionResult<A, D extends Definition = Definition> =
  | { readonly result: A; readonly event: Payload<D>; readonly events?: never }
  | { readonly result: A; readonly events: readonly Payload<D>[]; readonly event?: never }
  | { readonly result: A; readonly event?: never; readonly events?: never }

export interface RemoveOptions {
  readonly onCommitted?: Effect.Effect<void>
  readonly continueVisibilityOnInterrupt?: boolean
}

export interface Remove {
  (aggregateID: string): Effect.Effect<void>
  <A>(aggregateID: string, cleanup: (tx: Transaction) => Effect.Effect<A>): Effect.Effect<A>
  <A, D extends Definition>(
    aggregateID: string,
    cleanup: (tx: Transaction) => Effect.Effect<A>,
    notification: PreparedEvent<D>,
    options?: RemoveOptions,
  ): Effect.Effect<A>
}

export interface RemoveMany {
  <A, E, R, D extends Definition = Definition>(
    aggregateIDs: readonly string[],
    cleanup: (tx: Transaction) => Effect.Effect<A, E, R>,
    notifications?: readonly PreparedEvent<D>[],
    options?: RemoveOptions,
  ): Effect.Effect<A, E, R>
}

export interface Interface {
  readonly publish: <D extends Definition>(
    definition: D,
    data: Data<D>,
    options?: PublishOptions,
  ) => Effect.Effect<Payload<D>>
  readonly subscribe: <D extends Definition>(definition: D) => Stream.Stream<Payload<D>>
  readonly all: () => Stream.Stream<Payload>
  readonly durable: (input: { readonly aggregateID: string; readonly after?: number }) => Stream.Stream<Payload>
  /** @deprecated Use `all()` and consume the returned stream. */
  readonly listen: (listener: Subscriber) => Effect.Effect<Unsubscribe>
  readonly project: <D extends Definition>(definition: D, projector: Subscriber<D>) => Effect.Effect<void>
  readonly transaction: <A, D extends Definition = Definition, E = never, R = never>(
    prepare: (tx: Transaction) => Effect.Effect<PreparedTransaction<A, D>, E, R>,
  ) => Effect.Effect<TransactionResult<A, D>, E, R>
  readonly replay: (
    event: SerializedEvent,
    options?: { readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean },
  ) => Effect.Effect<void>
  readonly replayAll: (
    events: SerializedEvent[],
    options?: { readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean },
  ) => Effect.Effect<string | undefined>
  readonly remove: Remove
  readonly removeMany: RemoveMany
  readonly claim: (aggregateID: string, ownerID: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Event") {}

export const allBounded = (events: Interface, capacity: number) =>
  Effect.gen(function* () {
    const queue = yield* Queue.dropping<Payload, SubscriberOverflowError>(capacity)
    const unsubscribe = yield* events.listen((event) =>
      Queue.offer(queue, event).pipe(
        Effect.flatMap((accepted) =>
          accepted ? Effect.void : Queue.fail(queue, new SubscriberOverflowError({ capacity })).pipe(Effect.asVoid),
        ),
      ),
    )
    yield* Effect.addFinalizer(() => unsubscribe.pipe(Effect.andThen(Queue.shutdown(queue)), Effect.asVoid))
    return Stream.fromQueue(queue)
  })

export interface LayerOptions {
  readonly beforeAggregateRead?: (aggregateID: string) => Effect.Effect<void>
}

export const layerWith = (options?: LayerOptions) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const pubsub = {
        all: yield* PubSub.unbounded<Payload>(),
        durable: new Map<string, Set<PubSub.PubSub<void>>>(),
        typed: new Map<string, PubSub.PubSub<Payload>>(),
      }
      const projectors = new Map<string, Subscriber[]>()
      // TODO: Bind durable projectors to exact type+version before supporting incompatible historical payloads.
      const listeners = new Array<Subscriber>()
      const { db } = yield* Database.Service
      const scope = yield* Scope.Scope

      const getOrCreate = (definition: Definition) =>
        Effect.gen(function* () {
          const existing = pubsub.typed.get(definition.type)
          if (existing) return existing
          const created = yield* PubSub.unbounded<Payload>()
          pubsub.typed.set(definition.type, created)
          return created
        })

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* PubSub.shutdown(pubsub.all)
          yield* Effect.forEach(
            pubsub.durable.values(),
            (pubsubs) => Effect.forEach(pubsubs, PubSub.shutdown, { discard: true }),
            { discard: true },
          )
          yield* Effect.forEach(pubsub.typed.values(), PubSub.shutdown, { discard: true })
        }),
      )

      const immediate = <A>(transaction: (tx: Transaction) => Effect.Effect<A>) =>
        Effect.uninterruptible(db.transaction(transaction, { behavior: "immediate" }).pipe(Effect.orDie))

      const immediateFallible = <A, E, R>(transaction: (tx: Transaction) => Effect.Effect<A, E, R>) =>
        Effect.uninterruptible(
          db
            .transaction(transaction, { behavior: "immediate" })
            .pipe(Effect.catchTag("SqlError", (error) => Effect.die(error))),
        )

      const wakeAggregate = (aggregateID: string) =>
        Effect.forEach(pubsub.durable.get(aggregateID) ?? [], (wake) => PubSub.publish(wake, undefined), {
          discard: true,
        })

      function commitDurableEventInTransaction(
        tx: Transaction,
        definition: Definition,
        event: Payload,
        input?: {
          readonly seq: number
          readonly aggregateID: string
          readonly ownerID?: string
          readonly strictOwner?: boolean
        },
        commit?: (seq: number) => Effect.Effect<void>,
      ) {
        return Effect.gen(function* () {
          const durable = definition.durable
          if (!durable)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: "Prepared transactions require a durable event",
              }),
            )
          const aggregateID = (event.data as Record<string, unknown>)[durable.aggregate]
          if (typeof aggregateID !== "string")
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: `Expected string aggregate field ${durable.aggregate}`,
              }),
            )
          if (input && input.aggregateID !== aggregateID)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: `Aggregate mismatch: expected ${input.aggregateID}, got ${aggregateID}`,
              }),
            )

          const row = yield* tx
            .select({ seq: EventSequenceTable.seq, ownerID: EventSequenceTable.owner_id })
            .from(EventSequenceTable)
            .where(eq(EventSequenceTable.aggregate_id, aggregateID))
            .get()
            .pipe(Effect.orDie)
          const latest = row?.seq ?? -1
          const encoded = Schema.encodeUnknownSync(definition.data)(event.data) as Record<string, unknown>
          if (input?.strictOwner && row?.ownerID && row.ownerID !== input.ownerID)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: `Replay owner mismatch for aggregate ${aggregateID}: expected ${row.ownerID}, got ${input.ownerID ?? "none"}`,
              }),
            )
          if (input && input.seq <= latest) {
            const stored = yield* tx
              .select()
              .from(EventTable)
              .where(and(eq(EventTable.aggregate_id, aggregateID), eq(EventTable.seq, input.seq)))
              .get()
              .pipe(Effect.orDie)
            if (
              stored?.id === event.id &&
              stored.type === versionedType(definition.type, durable.version) &&
              isDeepStrictEqual(stored.data, encoded)
            ) {
              if (input.ownerID && row?.ownerID == null) {
                yield* tx
                  .update(EventSequenceTable)
                  .set({ owner_id: input.ownerID })
                  .where(eq(EventSequenceTable.aggregate_id, aggregateID))
                  .run()
                  .pipe(Effect.orDie)
              }
              return
            }
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: `Replay diverged at aggregate ${aggregateID} sequence ${input.seq}`,
              }),
            )
          }
          if (input && row?.ownerID && row.ownerID !== input.ownerID) return

          const seq = input?.seq ?? latest + 1
          if (input && seq !== latest + 1)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: `Sequence mismatch for aggregate ${aggregateID}: expected ${latest + 1}, got ${seq}`,
              }),
            )
          const stored = yield* tx
            .select({ aggregateID: EventTable.aggregate_id, seq: EventTable.seq })
            .from(EventTable)
            .where(eq(EventTable.id, event.id))
            .get()
            .pipe(Effect.orDie)
          if (stored)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: `Event ${event.id} already exists at aggregate ${stored.aggregateID} sequence ${stored.seq}`,
              }),
            )

          const committed = {
            ...event,
            durable: { aggregateID, seq, version: durable.version },
          } as Payload
          for (const projector of projectors.get(event.type) ?? []) {
            yield* projector(committed)
          }
          if (commit) yield* commit(seq)
          yield* tx
            .insert(EventSequenceTable)
            .values([{ aggregate_id: aggregateID, seq, owner_id: input?.ownerID }])
            .onConflictDoUpdate({
              target: EventSequenceTable.aggregate_id,
              set: {
                seq,
                ...(input?.ownerID && row?.ownerID == null ? { owner_id: input.ownerID } : {}),
              },
            })
            .run()
            .pipe(Effect.orDie)
          yield* tx
            .insert(EventTable)
            .values([
              {
                id: event.id,
                aggregate_id: aggregateID,
                seq,
                type: versionedType(definition.type, durable.version),
                data: encoded,
              },
            ])
            .run()
            .pipe(Effect.orDie)
          return { aggregateID, seq }
        })
      }

      function commitDurableEvent(
        definition: Definition,
        event: Payload,
        input?: {
          readonly seq: number
          readonly aggregateID: string
          readonly ownerID?: string
          readonly strictOwner?: boolean
        },
        commit?: (seq: number) => Effect.Effect<void>,
      ) {
        return Effect.gen(function* () {
          const committed = yield* immediate((tx) =>
            commitDurableEventInTransaction(tx, definition, event, input, commit),
          )
          if (committed) yield* wakeAggregate(committed.aggregateID)
          return committed
        })
      }

      const observe = (event: Payload, observer: (event: Payload) => Effect.Effect<void>) =>
        Effect.suspend(() => observer(event)).pipe(
          Effect.catchCauseIf(
            (cause) => !Cause.hasInterrupts(cause),
            (cause) => Effect.logError("Event listener failed", { eventID: event.id, eventType: event.type, cause }),
          ),
        )

      function notify(event: Payload, isolateListeners: boolean) {
        return Effect.gen(function* () {
          yield* Effect.forEach(
            listeners,
            (listener) => (isolateListeners ? observe(event, listener) : listener(event)),
            { discard: true },
          )
          const typed = pubsub.typed.get(event.type)
          if (typed) yield* PubSub.publish(typed, event)
          yield* PubSub.publish(pubsub.all, event)
        })
      }

      function transaction<A, D extends Definition = Definition, E = never, R = never>(
        prepare: (tx: Transaction) => Effect.Effect<PreparedTransaction<A, D>, E, R>,
      ): Effect.Effect<TransactionResult<A, D>, E, R> {
        return Effect.gen(function* () {
          const serviceLocation = Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
          const fallbackLocation = serviceLocation
            ? { directory: serviceLocation.directory, workspaceID: serviceLocation.workspaceID }
            : undefined
          const committed = yield* immediateFallible((tx) =>
            Effect.gen(function* () {
              const prepared = yield* prepare(tx)
              const candidate = prepared as {
                readonly event?: PreparedEvent<D>
                readonly events?: readonly PreparedEvent<D>[]
              }
              if (candidate.event && candidate.events)
                return yield* Effect.die(
                  new InvalidDurableEventError({
                    type: candidate.event.definition.type,
                    message: "Prepared transactions cannot contain both event and events",
                  }),
                )
              const pending = candidate.events ?? (candidate.event ? [candidate.event] : [])
              const committed = yield* Effect.forEach(pending, (item) =>
                Effect.gen(function* () {
                  const options = item.options
                  const location = options?.location ?? fallbackLocation
                  const payload = {
                    id: options?.id ?? ID.create(),
                    ...(options?.metadata ? { metadata: options.metadata } : {}),
                    type: item.definition.type,
                    ...(location ? { location } : {}),
                    data: item.data,
                  } as Payload<D>
                  const stored = yield* commitDurableEventInTransaction(
                    tx,
                    item.definition,
                    payload,
                    undefined,
                    options?.commit,
                  )
                  if (!stored) return yield* Effect.die("Prepared durable event was not committed")
                  return {
                    ...payload,
                    durable: {
                      aggregateID: stored.aggregateID,
                      seq: stored.seq,
                      version: item.definition.durable!.version,
                    },
                  } as Payload<D>
                }),
              )
              if (candidate.events) return { result: prepared.result, events: committed }
              if (committed[0]) return { result: prepared.result, event: committed[0] }
              return { result: prepared.result }
            }),
          )
          const committedEvents = committed.events ?? (committed.event ? [committed.event] : [])
          for (const aggregateID of new Set(committedEvents.map((event) => event.durable!.aggregateID))) {
            yield* wakeAggregate(aggregateID)
          }
          for (const event of committedEvents) {
            yield* notify(event as Payload, true)
          }
          return committed
        })
      }

      function publish<D extends Definition>(definition: D, data: Data<D>, options?: PublishOptions) {
        return Effect.gen(function* () {
          if (definition.durable) {
            const committed = yield* transaction(() =>
              Effect.succeed({
                result: undefined,
                event: { definition, data, options },
              }),
            )
            if (!committed.event) return yield* Effect.die("Durable publish did not commit an event")
            return committed.event
          }
          if (options?.commit)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: definition.type,
                message: "Local commit hooks require a durable event",
              }),
            )
          const serviceLocation = Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
          const location =
            options?.location ??
            (serviceLocation
              ? { directory: serviceLocation.directory, workspaceID: serviceLocation.workspaceID }
              : undefined)
          const event = {
            id: options?.id ?? ID.create(),
            ...(options?.metadata ? { metadata: options.metadata } : {}),
            type: definition.type,
            ...(location ? { location } : {}),
            data,
          } as Payload<D>
          yield* notify(event as Payload, false)
          return event
        })
      }

      function replay(
        event: SerializedEvent,
        options?: { readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean },
      ) {
        return Effect.gen(function* () {
          const definition = Durable.get(event.type)
          if (!definition?.durable) {
            yield* Effect.die(
              new InvalidDurableEventError({ type: event.type, message: `Unknown durable event type ${event.type}` }),
            )
          } else {
            const payload = {
              id: event.id,
              type: definition.type,
              data: Schema.decodeUnknownSync(definition.data)(event.data),
            } as Payload
            const committed = yield* commitDurableEvent(definition, payload, {
              seq: event.seq,
              aggregateID: event.aggregateID,
              ownerID: options?.ownerID,
              strictOwner: options?.strictOwner,
            })
            if (committed && options?.publish) {
              yield* notify(
                {
                  ...payload,
                  durable: {
                    aggregateID: committed.aggregateID,
                    seq: committed.seq,
                    version: definition.durable.version,
                  },
                },
                true,
              )
            }
          }
        })
      }

      function replayAll(
        events: SerializedEvent[],
        options?: { readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean },
      ) {
        return Effect.gen(function* () {
          const source = events[0]?.aggregateID
          if (!source) return undefined
          if (events.some((event) => event.aggregateID !== source)) {
            yield* Effect.die(
              new InvalidDurableEventError({
                type: events[0]?.type ?? "unknown",
                message: "Replay events must belong to the same aggregate",
              }),
            )
          }
          const start = events[0]?.seq ?? 0
          for (const [index, event] of events.entries()) {
            const seq = start + index
            if (event.seq !== seq) {
              yield* Effect.die(
                new InvalidDurableEventError({
                  type: event.type,
                  message: `Replay sequence mismatch at index ${index}: expected ${seq}, got ${event.seq}`,
                }),
              )
            }
          }
          for (const event of events) {
            yield* replay(event, options)
          }
          return source
        })
      }

      function remove(aggregateID: string): Effect.Effect<void>
      function remove<A>(aggregateID: string, cleanup: (tx: Transaction) => Effect.Effect<A>): Effect.Effect<A>
      function remove<A, D extends Definition>(
        aggregateID: string,
        cleanup: (tx: Transaction) => Effect.Effect<A>,
        notification: PreparedEvent<D>,
        options?: RemoveOptions,
      ): Effect.Effect<A>
      function remove<A, D extends Definition>(
        aggregateID: string,
        cleanup?: (tx: Transaction) => Effect.Effect<A>,
        notification?: PreparedEvent<D>,
        options?: RemoveOptions,
      ) {
        return Effect.gen(function* () {
          if (notification?.options?.commit)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: notification.definition.type,
                message: "Removal notifications cannot have a commit hook",
              }),
            )
          const durable = notification?.definition.durable
          if (durable) {
            const notifiedAggregate = (notification.data as Record<string, unknown>)[durable.aggregate]
            if (notifiedAggregate !== aggregateID)
              return yield* Effect.die(
                new InvalidDurableEventError({
                  type: notification.definition.type,
                  message: `Removal notification aggregate mismatch: expected ${aggregateID}, got ${String(notifiedAggregate)}`,
                }),
              )
          }
          const serviceLocation = Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
          const fallbackLocation = serviceLocation
            ? { directory: serviceLocation.directory, workspaceID: serviceLocation.workspaceID }
            : undefined
          const visibility = notification
            ? ({
                id: notification.options?.id ?? ID.create(),
                ...(notification.options?.metadata ? { metadata: notification.options.metadata } : {}),
                type: notification.definition.type,
                ...((notification.options?.location ?? fallbackLocation)
                  ? { location: notification.options?.location ?? fallbackLocation }
                  : {}),
                data: notification.data,
              } as Payload<D>)
            : undefined
          const visibilityEffect = Effect.gen(function* () {
            yield* wakeAggregate(aggregateID)
            if (visibility) yield* notify(visibility, true)
          })
          const committed = yield* Effect.uninterruptible(
            Effect.gen(function* () {
              const result = yield* immediate((tx) =>
                Effect.gen(function* () {
                  const result = cleanup ? yield* cleanup(tx) : undefined
                  yield* tx.delete(EventTable).where(eq(EventTable.aggregate_id, aggregateID)).run().pipe(Effect.orDie)
                  yield* tx
                    .delete(EventSequenceTable)
                    .where(eq(EventSequenceTable.aggregate_id, aggregateID))
                    .run()
                    .pipe(Effect.orDie)
                  return result
                }),
              )
              if (options?.onCommitted) yield* options.onCommitted
              if (!options?.continueVisibilityOnInterrupt) return { result }
              const visibility = yield* visibilityEffect.pipe(Effect.forkIn(scope, { startImmediately: true }))
              return { result, visibility }
            }),
          )
          if (committed.visibility) yield* Fiber.join(committed.visibility)
          if (!committed.visibility) yield* visibilityEffect
          return committed.result
        })
      }

      function removeMany<A, E, R, D extends Definition = Definition>(
        aggregateIDs: readonly string[],
        cleanup: (tx: Transaction) => Effect.Effect<A, E, R>,
        notifications: readonly PreparedEvent<D>[] = [],
        options?: RemoveOptions,
      ): Effect.Effect<A, E, R> {
        return Effect.gen(function* () {
          const selected = [...new Set(aggregateIDs)]
          if (selected.length === 0)
            return yield* Effect.die(
              new InvalidDurableEventError({ type: "remove", message: "Aggregate removal requires at least one ID" }),
            )
          const selectedSet = new Set(selected)
          const serviceLocation = Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
          const fallbackLocation = serviceLocation
            ? { directory: serviceLocation.directory, workspaceID: serviceLocation.workspaceID }
            : undefined
          const visibility = yield* Effect.forEach(notifications, (notification) =>
            Effect.gen(function* () {
              if (notification.options?.commit)
                return yield* Effect.die(
                  new InvalidDurableEventError({
                    type: notification.definition.type,
                    message: "Removal notifications cannot have a commit hook",
                  }),
                )
              const durable = notification.definition.durable
              if (durable) {
                const aggregateID = (notification.data as Record<string, unknown>)[durable.aggregate]
                if (typeof aggregateID !== "string" || !selectedSet.has(aggregateID))
                  return yield* Effect.die(
                    new InvalidDurableEventError({
                      type: notification.definition.type,
                      message: `Removal notification aggregate is outside the selected closure: ${String(aggregateID)}`,
                    }),
                  )
              }
              return {
                id: notification.options?.id ?? ID.create(),
                ...(notification.options?.metadata ? { metadata: notification.options.metadata } : {}),
                type: notification.definition.type,
                ...((notification.options?.location ?? fallbackLocation)
                  ? { location: notification.options?.location ?? fallbackLocation }
                  : {}),
                data: notification.data,
              } as Payload
            }),
          )
          const visibilityEffect = Effect.gen(function* () {
            yield* Effect.forEach(selected, wakeAggregate, { discard: true })
            yield* Effect.forEach(visibility, (event) => notify(event, true), { discard: true })
          })
          const committed = yield* Effect.uninterruptible(
            Effect.gen(function* () {
              const result = yield* immediateFallible((tx) =>
                Effect.gen(function* () {
                  const result = yield* cleanup(tx)
                  yield* tx
                    .delete(EventTable)
                    .where(inArray(EventTable.aggregate_id, selected))
                    .run()
                    .pipe(Effect.orDie)
                  yield* tx
                    .delete(EventSequenceTable)
                    .where(inArray(EventSequenceTable.aggregate_id, selected))
                    .run()
                    .pipe(Effect.orDie)
                  return result
                }),
              )
              if (options?.onCommitted) yield* options.onCommitted
              if (!options?.continueVisibilityOnInterrupt) return { result }
              const visibility = yield* visibilityEffect.pipe(Effect.forkIn(scope, { startImmediately: true }))
              return { result, visibility }
            }),
          )
          if (committed.visibility) yield* Fiber.join(committed.visibility)
          if (!committed.visibility) yield* visibilityEffect
          return committed.result
        })
      }

      function claim(aggregateID: string, ownerID: string) {
        return db
          .update(EventSequenceTable)
          .set({ owner_id: ownerID })
          .where(eq(EventSequenceTable.aggregate_id, aggregateID))
          .run()
          .pipe(Effect.orDie)
      }

      const subscribe = <D extends Definition>(definition: D): Stream.Stream<Payload<D>> =>
        Stream.unwrap(getOrCreate(definition).pipe(Effect.map((pubsub) => Stream.fromPubSub(pubsub)))).pipe(
          Stream.map((event) => event as Payload<D>),
        )

      const streamAll = (): Stream.Stream<Payload> => Stream.fromPubSub(pubsub.all)

      const readAfter = (aggregateID: string, after: number) =>
        (options?.beforeAggregateRead?.(aggregateID) ?? Effect.void).pipe(
          Effect.andThen(
            db
              .select()
              .from(EventTable)
              .where(and(eq(EventTable.aggregate_id, aggregateID), gt(EventTable.seq, after)))
              .orderBy(asc(EventTable.seq))
              .all(),
          ),
          Effect.orDie,
          Effect.map((rows) =>
            rows.map((event) =>
              decodeSerializedEvent({
                id: event.id,
                aggregateID: event.aggregate_id,
                seq: event.seq,
                type: event.type,
                data: event.data,
              }),
            ),
          ),
        )

      const subscribeDurable = (aggregateID: string) =>
        Effect.gen(function* () {
          const wake = yield* PubSub.sliding<void>(1)
          const subscription = yield* PubSub.subscribe(wake)
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const wakes = pubsub.durable.get(aggregateID) ?? new Set()
              wakes.add(wake)
              pubsub.durable.set(aggregateID, wakes)
            }),
            () =>
              Effect.sync(() => {
                const wakes = pubsub.durable.get(aggregateID)
                wakes?.delete(wake)
                if (wakes?.size === 0) pubsub.durable.delete(aggregateID)
              }).pipe(Effect.andThen(PubSub.shutdown(wake))),
          )
          return subscription
        })

      const durable = (input: { readonly aggregateID: string; readonly after?: number }): Stream.Stream<Payload> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const wakes = yield* subscribeDurable(input.aggregateID)
            let sequence = input.after ?? -1
            const read = Effect.suspend(() => readAfter(input.aggregateID, sequence)).pipe(
              Effect.tap((events) =>
                Effect.sync(() => {
                  sequence = events.at(-1)?.durable?.seq ?? sequence
                }),
              ),
            )
            const historical = yield* read
            const live = Stream.fromSubscription(wakes).pipe(
              Stream.mapEffect(() => read),
              Stream.flattenIterable,
            )
            return Stream.concat(Stream.fromIterable(historical), live)
          }),
        )

      const listen = (listener: Subscriber): Effect.Effect<Unsubscribe> =>
        Effect.sync(() => {
          listeners.push(listener)
          return Effect.sync(() => {
            const index = listeners.indexOf(listener)
            if (index >= 0) listeners.splice(index, 1)
          })
        })

      const project = <D extends Definition>(definition: D, projector: Subscriber<D>): Effect.Effect<void> =>
        Effect.sync(() => {
          const list = projectors.get(definition.type) ?? []
          list.push((event) => projector(event as Payload<D>))
          projectors.set(definition.type, list)
        })

      return Service.of({
        publish,
        subscribe,
        all: streamAll,
        durable,
        listen,
        project,
        transaction,
        replay,
        replayAll,
        remove,
        removeMany,
        claim,
      })
    }),
  )

const layer = layerWith()
export const node = makeGlobalNode({ service: Service, layer: layer, deps: [Database.node] })
