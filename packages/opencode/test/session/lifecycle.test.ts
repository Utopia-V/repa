import { describe, expect } from "bun:test"
import { Deferred, Effect, Exit, Fiber, Scope } from "effect"
import { Runner } from "@/effect/runner"
import { SessionLifecycle } from "@/session/lifecycle"
import { SessionID } from "@/session/schema"
import { it } from "../lib/effect"

describe("SessionLifecycle", () => {
  it.live(
    "close seals admission before draining shared work and remains closed after success",
    Effect.gen(function* () {
      const lifecycle = yield* SessionLifecycle.make()
      const sessionID = SessionID.descending()
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const deleteStarted = yield* Deferred.make<void>()

      const reader = yield* lifecycle
        .shared(sessionID, Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))))
        .pipe(Effect.forkChild)
      yield* Deferred.await(entered)

      const close = yield* lifecycle
        .close(sessionID, Effect.void, (markCommitted) =>
          Deferred.succeed(deleteStarted, undefined).pipe(Effect.andThen(markCommitted), Effect.as("deleted")),
        )
        .pipe(Effect.forkChild)
      while ((yield* lifecycle.phase(sessionID)) !== "closing") yield* Effect.yieldNow

      const lateShared = yield* lifecycle.shared(sessionID, Effect.void).pipe(Effect.exit)
      const lateHandoff = yield* lifecycle
        .handoff(sessionID, Effect.succeed({ await: Effect.void, onClosing: Effect.void }))
        .pipe(Effect.exit)
      const idleMutation = yield* lifecycle.idle(sessionID, Effect.succeed("mutated")).pipe(Effect.exit)
      expect(Exit.isFailure(lateShared)).toBe(true)
      expect(Exit.isFailure(lateHandoff)).toBe(true)
      expect(Exit.isFailure(idleMutation)).toBe(true)
      expect(yield* Deferred.isDone(deleteStarted)).toBe(false)

      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(reader)
      expect(yield* Fiber.join(close)).toBe("deleted")
      expect(yield* lifecycle.phase(sessionID)).toBe("closed")
      expect(Exit.isFailure(yield* lifecycle.shared(sessionID, Effect.void).pipe(Effect.exit))).toBe(true)
    }),
  )

  it.live(
    "linearizes close after an admitted but blocked runner registration",
    Effect.gen(function* () {
      const lifecycle = yield* SessionLifecycle.make()
      const sessionID = SessionID.descending()
      const registrationEntered = yield* Deferred.make<void>()
      const allowRegistration = yield* Deferred.make<void>()
      const releaseRun = yield* Deferred.make<void>()
      const cancelCalled = yield* Deferred.make<void>()

      const run = yield* lifecycle
        .handoff(
          sessionID,
          Deferred.succeed(registrationEntered, undefined).pipe(
            Effect.andThen(Deferred.await(allowRegistration)),
            Effect.as({ await: Deferred.await(releaseRun).pipe(Effect.as("run")), onClosing: Effect.void }),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(registrationEntered)

      const close = yield* lifecycle
        .close(
          sessionID,
          Deferred.succeed(cancelCalled, undefined).pipe(
            Effect.andThen(Deferred.succeed(releaseRun, undefined)),
            Effect.asVoid,
          ),
          (markCommitted) => markCommitted.pipe(Effect.as("deleted")),
        )
        .pipe(Effect.forkChild)
      yield* Effect.yieldNow
      expect(yield* lifecycle.phase(sessionID)).toBe("closing")
      expect(yield* Deferred.isDone(cancelCalled)).toBe(true)

      yield* Deferred.succeed(allowRegistration, undefined)
      yield* Deferred.await(cancelCalled)
      expect(yield* Fiber.join(run)).toBe("run")
      expect(yield* Fiber.join(close)).toBe("deleted")
      expect(yield* lifecycle.phase(sessionID)).toBe("closed")
    }),
  )

  it.live(
    "failed close reopens the Session",
    Effect.gen(function* () {
      const lifecycle = yield* SessionLifecycle.make()
      const sessionID = SessionID.descending()

      const close = yield* lifecycle.close(sessionID, Effect.void, () => Effect.fail("delete failed")).pipe(Effect.exit)
      expect(Exit.isFailure(close)).toBe(true)
      expect(yield* lifecycle.phase(sessionID)).toBe("open")
      expect(yield* lifecycle.shared(sessionID, Effect.succeed("available"))).toBe("available")
    }),
  )

  it.live(
    "hands an exclusive mutation directly into shared admission",
    Effect.gen(function* () {
      const lifecycle = yield* SessionLifecycle.make()
      const sessionID = SessionID.descending()
      const mutationEntered = yield* Deferred.make<void>()
      const releaseMutation = yield* Deferred.make<void>()
      const sharedEntered = yield* Deferred.make<void>()
      const enterHandoff = yield* Deferred.make<void>()
      const childShared = yield* Deferred.make<string>()
      const handoffCompleted = yield* Deferred.make<string>()
      const runnerDone = yield* Deferred.make<void>()
      const runnerCancelled = yield* Deferred.make<void>()
      const releaseShared = yield* Deferred.make<void>()
      const firstCancelCompleted = yield* Deferred.make<void>()
      const deleteStarted = yield* Deferred.make<void>()

      const admitted = yield* lifecycle
        .mutateThenAdmit(
          sessionID,
          Deferred.succeed(mutationEntered, undefined).pipe(
            Effect.andThen(Deferred.await(releaseMutation)),
            Effect.as(
              Effect.gen(function* () {
                yield* Deferred.succeed(sharedEntered, undefined)
                yield* Deferred.await(enterHandoff)
                const child = yield* lifecycle.shared(sessionID, Effect.succeed("child")).pipe(Effect.forkChild)
                yield* Deferred.succeed(childShared, yield* Fiber.join(child))
                const result = yield* lifecycle.handoff(
                  sessionID,
                  Effect.succeed({
                    await: Deferred.await(runnerDone).pipe(Effect.as("runner")),
                    onClosing: Deferred.succeed(runnerCancelled, undefined).pipe(
                      Effect.andThen(Deferred.succeed(runnerDone, undefined)),
                      Effect.asVoid,
                    ),
                  }),
                )
                yield* Deferred.succeed(handoffCompleted, result)
                yield* Deferred.await(releaseShared)
                return "admitted"
              }),
            ),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(mutationEntered)
      expect(Exit.isFailure(yield* lifecycle.shared(sessionID, Effect.void).pipe(Effect.exit))).toBe(true)

      yield* Deferred.succeed(releaseMutation, undefined)
      yield* Deferred.await(sharedEntered)
      const close = yield* lifecycle
        .close(sessionID, Deferred.succeed(firstCancelCompleted, undefined).pipe(Effect.asVoid), (markCommitted) =>
          Deferred.succeed(deleteStarted, undefined).pipe(Effect.andThen(markCommitted), Effect.as("deleted")),
        )
        .pipe(Effect.forkChild)
      while ((yield* lifecycle.phase(sessionID)) !== "closing") yield* Effect.yieldNow
      yield* Deferred.await(firstCancelCompleted)
      expect(yield* Deferred.isDone(deleteStarted)).toBe(false)
      yield* Deferred.succeed(enterHandoff, undefined)
      expect(yield* Deferred.await(childShared)).toBe("child")
      yield* Deferred.await(runnerCancelled)
      expect(yield* Deferred.await(handoffCompleted)).toBe("runner")

      yield* Deferred.succeed(releaseShared, undefined)
      expect(yield* Fiber.join(admitted)).toBe("admitted")
      expect(yield* Fiber.join(close)).toBe("deleted")
      expect(yield* lifecycle.phase(sessionID)).toBe("closed")
    }),
  )

  it.live(
    "stays closed when interruption arrives after the close operation commits",
    Effect.gen(function* () {
      const lifecycle = yield* SessionLifecycle.make()
      const sessionID = SessionID.descending()
      const committed = yield* Deferred.make<void>()
      const releaseVisibility = yield* Deferred.make<void>()

      const close = yield* lifecycle
        .close(sessionID, Effect.void, (markCommitted) =>
          markCommitted.pipe(
            Effect.andThen(Deferred.succeed(committed, undefined)),
            Effect.andThen(Deferred.await(releaseVisibility)),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(committed)
      yield* Fiber.interrupt(close)

      expect(yield* lifecycle.phase(sessionID)).toBe("closed")
      expect(Exit.isFailure(yield* lifecycle.shared(sessionID, Effect.void).pipe(Effect.exit))).toBe(true)
    }),
  )

  it.live(
    "lets late runner interrupt cleanup reenter Session shared state",
    Effect.gen(function* () {
      const lifecycle = yield* SessionLifecycle.make()
      const sessionID = SessionID.descending()
      const admissionEntered = yield* Deferred.make<void>()
      const releaseRegistration = yield* Deferred.make<void>()
      const firstCancelCompleted = yield* Deferred.make<void>()
      const workStarted = yield* Deferred.make<void>()
      const cleanupEntered = yield* Deferred.make<void>()
      const cleanupSharedRan = yield* Deferred.make<void>()
      const cleanupObserved = yield* Deferred.make<boolean>()
      const forceCleanup = yield* Deferred.make<void>()
      const runner = Runner.make<string>(yield* Scope.Scope, { onInterrupt: Effect.succeed("interrupted") })
      const work = Deferred.succeed(workStarted, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() =>
          Effect.gen(function* () {
            yield* Deferred.succeed(cleanupEntered, undefined)
            // Immediate start makes completion under the current lock state
            // deterministic; detachment gives a regressed test an escape hatch.
            yield* lifecycle
              .shared(sessionID, Deferred.succeed(cleanupSharedRan, undefined).pipe(Effect.asVoid))
              .pipe(Effect.forkDetach({ startImmediately: true }))
            const completed = yield* Deferred.isDone(cleanupSharedRan)
            yield* Deferred.succeed(cleanupObserved, completed)
            if (!completed) yield* Deferred.await(forceCleanup)
          }),
        ),
      )

      const admitted = yield* lifecycle
        .admit(
          sessionID,
          Deferred.succeed(admissionEntered, undefined).pipe(
            Effect.andThen(Deferred.await(releaseRegistration)),
            Effect.andThen(
              lifecycle.handoff(
                sessionID,
                Effect.gen(function* () {
                  const awaitResult = yield* runner.enterRunning(work)
                  // Ensure Runner cancellation must execute the installed cleanup.
                  yield* Deferred.await(workStarted)
                  return { await: awaitResult, onClosing: runner.cancel }
                }),
              ),
            ),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(admissionEntered)
      const close = yield* lifecycle
        .close(sessionID, Deferred.succeed(firstCancelCompleted, undefined).pipe(Effect.asVoid), (markCommitted) =>
          markCommitted.pipe(Effect.as("deleted")),
        )
        .pipe(Effect.forkChild)
      while ((yield* lifecycle.phase(sessionID)) !== "closing") yield* Effect.yieldNow
      yield* Deferred.await(firstCancelCompleted)

      yield* Deferred.succeed(releaseRegistration, undefined)
      yield* Deferred.await(workStarted)
      yield* Deferred.await(cleanupEntered)
      const cleanupCompleted = yield* Deferred.await(cleanupObserved)
      if (!cleanupCompleted) yield* Deferred.succeed(forceCleanup, undefined)
      expect(yield* Fiber.join(admitted)).toBe("interrupted")
      expect(yield* Fiber.join(close)).toBe("deleted")
      expect(cleanupCompleted).toBe(true)
      expect(yield* lifecycle.phase(sessionID)).toBe("closed")
    }),
  )
})
