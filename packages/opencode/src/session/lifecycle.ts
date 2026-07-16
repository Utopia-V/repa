import { Context, Effect, Exit, Semaphore, TxReentrantLock } from "effect"
import { BusyError, SessionID } from "./schema"

export type Phase = "open" | "mutating" | "closing" | "closed"

interface Entry {
  phase: Phase
  gate: TxReentrantLock.TxReentrantLock
  control: Semaphore.Semaphore
  readers: Map<number, number>
  // The token follows an admitted Effect into runner fibers; Fiber IDs remain
  // local lock-depth bookkeeping and are not logical operation identity.
  admissions: Set<object>
  mutation?: {
    owner: number
    depth: number
  }
}

export interface Handoff<A, E, R> {
  readonly await: Effect.Effect<A, E, R>
  readonly onClosing: Effect.Effect<void>
}

const CurrentAdmission = Context.Reference<object | undefined>("@opencode/SessionLifecycleAdmission", {
  defaultValue: () => undefined,
})

export interface Interface {
  readonly shared: <A, E, R>(sessionID: SessionID, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | BusyError, R>
  readonly admit: <A, E, R>(sessionID: SessionID, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | BusyError, R>
  readonly handoff: <A, E, R>(
    sessionID: SessionID,
    enter: Effect.Effect<Handoff<A, E, R>>,
  ) => Effect.Effect<A, E | BusyError, R>
  readonly mutateThenAdmit: <A, E, R, E2, R2>(
    sessionID: SessionID,
    enter: Effect.Effect<Effect.Effect<A, E, R>, E2, R2>,
  ) => Effect.Effect<A, E | E2 | BusyError, R | R2>
  readonly idle: <A, E, R>(sessionID: SessionID, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | BusyError, R>
  readonly close: <A, E, R, E2, R2>(
    sessionID: SessionID,
    beforeClose: Effect.Effect<void, E2, R2>,
    effect: (markCommitted: Effect.Effect<void>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | E2 | BusyError, R | R2>
  readonly phase: (sessionID: SessionID) => Effect.Effect<Phase>
}

export const make = Effect.fn("SessionLifecycle.make")(function* () {
  const entries = new Map<SessionID, Entry>()

  const get = Effect.fn("SessionLifecycle.get")(function* (sessionID: SessionID) {
    const existing = entries.get(sessionID)
    if (existing) return existing
    const next: Entry = {
      phase: "open" as const,
      gate: yield* TxReentrantLock.make(),
      control: Semaphore.makeUnsafe(1),
      readers: new Map(),
      admissions: new Set(),
    }
    const raced = entries.get(sessionID)
    if (raced) return raced
    entries.set(sessionID, next)
    return next
  })

  const unavailable = (sessionID: SessionID) => Effect.fail(new BusyError({ sessionID }))

  const read = <A, E, R>(
    sessionID: SessionID,
    effect: Effect.Effect<A, E, R>,
    admission: boolean,
  ): Effect.Effect<A, E | BusyError, R> =>
    Effect.acquireUseRelease(
      Effect.gen(function* () {
        const entry = yield* get(sessionID)
        const owner = yield* Effect.fiberId
        const currentAdmission = yield* CurrentAdmission
        const token = admission ? {} : undefined
        yield* entry.control.withPermits(1)(
          Effect.gen(function* () {
            const nestedReader = entry.readers.has(owner)
            const nestedMutation = entry.phase === "mutating" && entry.mutation?.owner === owner
            const admitted = currentAdmission !== undefined && entry.admissions.has(currentAdmission)
            if (entry.phase !== "open" && !nestedReader && !nestedMutation && !admitted) {
              return yield* unavailable(sessionID)
            }
            yield* TxReentrantLock.acquireRead(entry.gate)
            entry.readers.set(owner, (entry.readers.get(owner) ?? 0) + 1)
            if (token) entry.admissions.add(token)
          }),
        )
        return { entry, owner, token }
      }),
      ({ token }) => (token ? effect.pipe(Effect.provideService(CurrentAdmission, token)) : effect),
      ({ entry, owner, token }) =>
        entry.control.withPermits(1)(
          Effect.gen(function* () {
            yield* TxReentrantLock.releaseRead(entry.gate)
            const remaining = (entry.readers.get(owner) ?? 1) - 1
            if (remaining === 0) entry.readers.delete(owner)
            if (remaining > 0) entry.readers.set(owner, remaining)
            if (token) entry.admissions.delete(token)
          }),
        ),
    )

  const shared: Interface["shared"] = (sessionID, effect) => read(sessionID, effect, false)
  const admit: Interface["admit"] = (sessionID, effect) => read(sessionID, effect, true)

  const handoff: Interface["handoff"] = (sessionID, enter) =>
    Effect.acquireUseRelease(
      Effect.gen(function* () {
        const entry = yield* get(sessionID)
        const owner = yield* Effect.fiberId
        const currentAdmission = yield* CurrentAdmission
        yield* entry.control.withPermits(1)(
          Effect.gen(function* () {
            const admitted = currentAdmission !== undefined && entry.admissions.has(currentAdmission)
            if (entry.phase !== "open" && !admitted) return yield* unavailable(sessionID)
            yield* TxReentrantLock.acquireRead(entry.gate)
            entry.readers.set(owner, (entry.readers.get(owner) ?? 0) + 1)
          }),
        )
        return { entry, owner }
      }),
      (resource) =>
        Effect.gen(function* () {
          // Runner registration and cancellation may wait for cleanup that
          // re-enters this Session through shared(), so neither may hold control.
          const registered = yield* enter
          const closing = yield* resource.entry.control.withPermits(1)(
            Effect.sync(() => resource.entry.phase === "closing"),
          )
          if (closing) yield* registered.onClosing
          return yield* registered.await
        }),
      (resource) =>
        resource.entry.control.withPermits(1)(
          Effect.gen(function* () {
            yield* TxReentrantLock.releaseRead(resource.entry.gate)
            const remaining = (resource.entry.readers.get(resource.owner) ?? 1) - 1
            if (remaining === 0) resource.entry.readers.delete(resource.owner)
            if (remaining > 0) resource.entry.readers.set(resource.owner, remaining)
          }),
        ),
    )

  const mutateThenAdmit: Interface["mutateThenAdmit"] = (sessionID, enter) =>
    Effect.acquireUseRelease(
      Effect.gen(function* () {
        const entry = yield* get(sessionID)
        const owner = yield* Effect.fiberId
        const token = {}
        yield* entry.control.withPermits(1)(
          Effect.gen(function* () {
            if (entry.phase !== "open") return yield* unavailable(sessionID)
            if (yield* TxReentrantLock.readLocked(entry.gate)) return yield* unavailable(sessionID)
            if (yield* TxReentrantLock.writeLocked(entry.gate)) return yield* unavailable(sessionID)
            entry.phase = "mutating"
            entry.mutation = { owner, depth: 1 }
            yield* TxReentrantLock.acquireWrite(entry.gate)
          }),
        )
        return { entry, owner, token, mode: "write" as "write" | "read" }
      }),
      (resource) =>
        Effect.gen(function* () {
          const awaitResult = yield* enter
          yield* resource.entry.control.withPermits(1)(
            Effect.uninterruptible(
              Effect.gen(function* () {
                yield* TxReentrantLock.acquireRead(resource.entry.gate)
                resource.entry.readers.set(resource.owner, (resource.entry.readers.get(resource.owner) ?? 0) + 1)
                resource.entry.admissions.add(resource.token)
                yield* TxReentrantLock.releaseWrite(resource.entry.gate)
                resource.entry.mutation = undefined
                resource.entry.phase = "open"
                resource.mode = "read"
              }),
            ),
          )
          return yield* awaitResult.pipe(Effect.provideService(CurrentAdmission, resource.token))
        }),
      (resource) =>
        resource.entry.control.withPermits(1)(
          Effect.gen(function* () {
            if (resource.mode === "read") {
              yield* TxReentrantLock.releaseRead(resource.entry.gate)
              const remaining = (resource.entry.readers.get(resource.owner) ?? 1) - 1
              if (remaining === 0) resource.entry.readers.delete(resource.owner)
              if (remaining > 0) resource.entry.readers.set(resource.owner, remaining)
              resource.entry.admissions.delete(resource.token)
              return
            }
            yield* TxReentrantLock.releaseWrite(resource.entry.gate)
            if (resource.entry.mutation?.owner !== resource.owner) return
            resource.entry.mutation = undefined
            resource.entry.phase = "open"
          }),
        ),
    )

  const idle: Interface["idle"] = (sessionID, effect) =>
    Effect.acquireUseRelease(
      Effect.gen(function* () {
        const entry = yield* get(sessionID)
        const owner = yield* Effect.fiberId
        yield* entry.control.withPermits(1)(
          Effect.gen(function* () {
            if (entry.phase === "mutating") {
              if (entry.mutation?.owner !== owner) return yield* unavailable(sessionID)
              entry.mutation.depth += 1
              yield* TxReentrantLock.acquireWrite(entry.gate)
              return
            }
            if (entry.phase !== "open") return yield* unavailable(sessionID)
            if (yield* TxReentrantLock.readLocked(entry.gate)) return yield* unavailable(sessionID)
            if (yield* TxReentrantLock.writeLocked(entry.gate)) return yield* unavailable(sessionID)
            entry.phase = "mutating"
            entry.mutation = { owner, depth: 1 }
            yield* TxReentrantLock.acquireWrite(entry.gate)
          }),
        )
        return { entry, owner }
      }),
      () => effect,
      ({ entry, owner }) =>
        entry.control.withPermits(1)(
          Effect.gen(function* () {
            yield* TxReentrantLock.releaseWrite(entry.gate)
            if (entry.mutation?.owner !== owner) return
            entry.mutation.depth -= 1
            if (entry.mutation.depth > 0) return
            entry.mutation = undefined
            entry.phase = "open"
          }),
        ),
    )

  const close: Interface["close"] = (sessionID, beforeClose, effect) =>
    Effect.acquireUseRelease(
      Effect.gen(function* () {
        const entry = yield* get(sessionID)
        yield* entry.control.withPermits(1)(
          Effect.gen(function* () {
            if (entry.phase !== "open") return yield* unavailable(sessionID)
            entry.phase = "closing"
          }),
        )
        return { entry, committed: false }
      }),
      (resource) =>
        beforeClose.pipe(
          Effect.andThen(
            TxReentrantLock.withWriteLock(
              resource.entry.gate,
              beforeClose.pipe(
                Effect.andThen(
                  effect(
                    resource.entry.control.withPermits(1)(
                      Effect.sync(() => {
                        resource.committed = true
                        resource.entry.phase = "closed"
                      }),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      (resource, exit) =>
        resource.entry.control.withPermits(1)(
          Effect.sync(() => {
            resource.entry.phase = resource.committed || Exit.isSuccess(exit) ? "closed" : "open"
          }),
        ),
    )

  const phase = Effect.fn("SessionLifecycle.phase")(function* (sessionID: SessionID) {
    return (yield* get(sessionID)).phase
  })

  return { shared, admit, handoff, mutateThenAdmit, idle, close, phase } satisfies Interface
})

export * as SessionLifecycle from "./lifecycle"
