import { Cause, Deferred, Effect, Exit, Fiber, Latch, Schema, Scope, SynchronizedRef } from "effect"

export interface Runner<A, E = never> {
  readonly state: State<A, E>
  readonly busy: boolean
  readonly enterRunning: (work: Effect.Effect<A, E>) => Effect.Effect<Effect.Effect<A, E>>
  readonly ensureRunning: (work: Effect.Effect<A, E>) => Effect.Effect<A, E>
  readonly enterShell: (work: Effect.Effect<A, E>, ready?: Latch.Latch) => Effect.Effect<Effect.Effect<A, E | Busy>>
  readonly startShell: (work: Effect.Effect<A, E>, ready?: Latch.Latch) => Effect.Effect<A, E | Busy>
  readonly cancel: Effect.Effect<void>
}

export class Cancelled extends Schema.TaggedErrorClass<Cancelled>()("RunnerCancelled", {}) {}
export class Busy extends Schema.TaggedErrorClass<Busy>()("RunnerBusy", {}) {}

interface RunHandle<A, E> {
  id: number
  done: Deferred.Deferred<A, E | Cancelled>
  fiber: Fiber.Fiber<A, E>
}

interface ShellHandle<A, E> {
  id: number
  cancelled: Deferred.Deferred<void>
  ready?: Latch.Latch
  fiber: Fiber.Fiber<A, E>
}

interface PendingHandle<A, E> {
  id: number
  done: Deferred.Deferred<A, E | Cancelled>
  work: Effect.Effect<A, E>
}

interface StoppingHandle {
  done: Deferred.Deferred<void>
}

type EnterRunning<A, E> =
  | { readonly _tag: "Entered"; readonly await: Effect.Effect<A, E> }
  | { readonly _tag: "Stopping"; readonly done: Deferred.Deferred<void> }

export type State<A, E> =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Running"; readonly run: RunHandle<A, E> }
  | { readonly _tag: "Shell"; readonly shell: ShellHandle<A, E> }
  | { readonly _tag: "ShellThenRun"; readonly shell: ShellHandle<A, E>; readonly run: PendingHandle<A, E> }
  | { readonly _tag: "Stopping"; readonly stop: StoppingHandle }

export const make = <A, E = never>(
  scope: Scope.Scope,
  opts?: {
    onIdle?: Effect.Effect<void>
    onBusy?: Effect.Effect<void>
    onInterrupt?: Effect.Effect<A, E>
  },
): Runner<A, E> => {
  const ref = SynchronizedRef.makeUnsafe<State<A, E>>({ _tag: "Idle" })
  const idle = opts?.onIdle ?? Effect.void
  const onBusy = opts?.onBusy ?? Effect.void
  const onInterrupt = opts?.onInterrupt
  let ids = 0

  const state = () => SynchronizedRef.getUnsafe(ref)
  const next = () => {
    ids += 1
    return ids
  }

  const complete = (done: Deferred.Deferred<A, E | Cancelled>, exit: Exit.Exit<A, E>) =>
    Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
      ? Deferred.fail(done, new Cancelled()).pipe(Effect.asVoid)
      : Deferred.done(done, exit).pipe(Effect.asVoid)

  const awaitDone = (done: Deferred.Deferred<A, E | Cancelled>): Effect.Effect<A, E> =>
    Deferred.await(done).pipe(Effect.catchTag("RunnerCancelled", (e) => onInterrupt ?? Effect.die(e)))

  const finishRun = (id: number, done: Deferred.Deferred<A, E | Cancelled>, exit: Exit.Exit<A, E>) =>
    SynchronizedRef.modify(
      ref,
      (st) =>
        [
          Effect.gen(function* () {
            if (st._tag === "Running" && st.run.id === id) yield* idle
            yield* complete(done, exit)
          }),
          st._tag === "Running" && st.run.id === id ? ({ _tag: "Idle" } as const) : st,
        ] as const,
    ).pipe(Effect.flatten)

  const startRun = (work: Effect.Effect<A, E>, done: Deferred.Deferred<A, E | Cancelled>) =>
    Effect.gen(function* () {
      const id = next()
      const fiber = yield* work.pipe(
        Effect.onExit((exit) => finishRun(id, done, exit)),
        Effect.forkIn(scope),
      )
      return { id, done, fiber } satisfies RunHandle<A, E>
    })

  const finishShell = (id: number) =>
    SynchronizedRef.modifyEffect(
      ref,
      Effect.fnUntraced(function* (st) {
        if (st._tag === "Shell" && st.shell.id === id) {
          return [idle, { _tag: "Idle" }] as const
        }
        if (st._tag === "ShellThenRun" && st.shell.id === id) {
          const run = yield* startRun(st.run.work, st.run.done)
          return [Effect.void, { _tag: "Running", run }] as const
        }
        return [Effect.void, st] as const
      }),
    ).pipe(Effect.flatten)

  const stopShell = (shell: ShellHandle<A, E>) =>
    Effect.gen(function* () {
      if (shell.ready) yield* shell.ready.await.pipe(Effect.exit, Effect.asVoid)
      yield* Deferred.succeed(shell.cancelled, undefined).pipe(Effect.asVoid)
      yield* Fiber.interrupt(shell.fiber)
    })

  const finishStopping = (stop: StoppingHandle) =>
    SynchronizedRef.modifyEffect(
      ref,
      Effect.fnUntraced(function* (st) {
        if (st._tag === "Stopping" && st.stop === stop) {
          yield* idle
          yield* Deferred.succeed(stop.done, undefined)
          return [Effect.void, { _tag: "Idle" }] as const
        }
        yield* Deferred.succeed(stop.done, undefined)
        return [Effect.void, st] as const
      }),
    ).pipe(Effect.flatten)

  const registerRunning = (
    st: State<A, E>,
    work: Effect.Effect<A, E>,
  ): Effect.Effect<readonly [EnterRunning<A, E>, State<A, E>]> =>
    Effect.gen(function* () {
      switch (st._tag) {
        case "Running":
        case "ShellThenRun":
          return [{ _tag: "Entered", await: awaitDone(st.run.done) }, st] as const
        case "Shell": {
          const run = {
            id: next(),
            done: yield* Deferred.make<A, E | Cancelled>(),
            work,
          } satisfies PendingHandle<A, E>
          return [
            { _tag: "Entered", await: awaitDone(run.done) },
            { _tag: "ShellThenRun", shell: st.shell, run },
          ] as const
        }
        case "Stopping":
          return [{ _tag: "Stopping", done: st.stop.done }, st] as const
        case "Idle": {
          const done = yield* Deferred.make<A, E | Cancelled>()
          const run = yield* startRun(work, done)
          return [
            { _tag: "Entered", await: awaitDone(done) },
            { _tag: "Running", run },
          ] as const
        }
      }
    })

  const enterRunning: Runner<A, E>["enterRunning"] = (work) =>
    SynchronizedRef.modifyEffect(ref, (st) => registerRunning(st, work)).pipe(
      Effect.flatMap((entered) =>
        entered._tag === "Stopping"
          ? Deferred.await(entered.done).pipe(Effect.andThen(enterRunning(work)))
          : Effect.succeed(entered.await),
      ),
    )

  const ensureRunning: Runner<A, E>["ensureRunning"] = (work) => enterRunning(work).pipe(Effect.flatten)

  const enterShell: Runner<A, E>["enterShell"] = (work, ready) =>
    SynchronizedRef.modifyEffect(
      ref,
      Effect.fnUntraced(function* (st) {
        if (st._tag !== "Idle") {
          const reject: Effect.Effect<A, E | Busy> = Effect.fail(new Busy())
          return [reject, st] as const
        }
        yield* onBusy
        const id = next()
        const cancelled = yield* Deferred.make<void>()
        const fiber = yield* work.pipe(Effect.ensuring(finishShell(id)), Effect.forkChild)
        const shell = { id, cancelled, ready, fiber } satisfies ShellHandle<A, E>
        return [
          Effect.gen(function* () {
            const exit = yield* Fiber.await(fiber)
            if (Exit.isSuccess(exit)) return exit.value
            if (
              Cause.hasInterruptsOnly(exit.cause) ||
              ((yield* Deferred.isDone(cancelled)) && Cause.hasInterrupts(exit.cause) && !Cause.hasDies(exit.cause))
            ) {
              if (onInterrupt) return yield* onInterrupt
              return yield* Effect.die(new Cancelled())
            }
            return yield* Effect.failCause(exit.cause)
          }),
          { _tag: "Shell", shell },
        ] as const
      }),
    )

  const startShell: Runner<A, E>["startShell"] = (work, ready) => enterShell(work, ready).pipe(Effect.flatten)

  const cancel = SynchronizedRef.modify(ref, (st) => {
    switch (st._tag) {
      case "Idle":
        return [Effect.void, st] as const
      case "Stopping":
        return [Deferred.await(st.stop.done), st] as const
      case "Running": {
        const stop = { done: Deferred.makeUnsafe<void>() } satisfies StoppingHandle
        return [
          Effect.gen(function* () {
            yield* Fiber.interrupt(st.run.fiber)
            yield* Deferred.fail(st.run.done, new Cancelled()).pipe(Effect.asVoid)
          }).pipe(Effect.ensuring(finishStopping(stop)), Effect.uninterruptible),
          { _tag: "Stopping", stop } as const,
        ] as const
      }
      case "Shell": {
        const stop = { done: Deferred.makeUnsafe<void>() } satisfies StoppingHandle
        return [
          stopShell(st.shell).pipe(Effect.ensuring(finishStopping(stop)), Effect.uninterruptible),
          { _tag: "Stopping", stop } as const,
        ] as const
      }
      case "ShellThenRun": {
        const stop = { done: Deferred.makeUnsafe<void>() } satisfies StoppingHandle
        return [
          Effect.gen(function* () {
            yield* stopShell(st.shell)
            yield* Deferred.fail(st.run.done, new Cancelled()).pipe(Effect.asVoid)
          }).pipe(Effect.ensuring(finishStopping(stop)), Effect.uninterruptible),
          { _tag: "Stopping", stop } as const,
        ] as const
      }
    }
  }).pipe(Effect.flatten)

  return {
    get state() {
      return state()
    },
    get busy() {
      return state()._tag !== "Idle"
    },
    enterRunning,
    ensureRunning,
    enterShell,
    startShell,
    cancel,
  }
}

export * as Runner from "./runner"
