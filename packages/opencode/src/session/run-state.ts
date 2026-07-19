import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { TurnChildLineageTable, TurnModelOperationTable, TurnTable } from "@opencode-ai/core/turn/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { Runner } from "@/effect/runner"
import { BackgroundJob } from "@/background/job"
import { Cause, Deferred, Effect, Exit, Fiber, Latch, Layer, Scope, Context, Semaphore } from "effect"
import { BusyError, SessionID } from "./schema"
import { SessionStatus } from "./status"
import { SessionLifecycle } from "./lifecycle"
import { InstanceState } from "@/effect/instance-state"
import { InstanceRef } from "@/effect/instance-ref"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionTurnEvents } from "./turn-events"
import { and, asc, eq } from "drizzle-orm"

export type TurnWorkResult =
  | { readonly outcome: "completed"; readonly reason: "normal" }
  | {
      readonly outcome: "failed"
      readonly reason:
        | "provider_failure"
        | "tool_runtime_failure"
        | "permission_failure"
        | "projection_failure"
        | "owner_failure"
        | "integrity_failure"
    }

export type StartTurnInput<E, E2, E3, R = never> = {
  readonly sessionID: SessionID
  readonly turnID: Turn.ID
  readonly envelopeFingerprint: string
  readonly guardSessionIDs?: readonly SessionID[]
  readonly admit: Effect.Effect<TurnLifecycle.Admitted, E, R>
  readonly install?: Effect.Effect<void, E2, R>
  readonly work: Effect.Effect<TurnWorkResult, E3, R>
}

export type SteerTurnInput<E, R = never> = {
  readonly sessionID: SessionID
  readonly expectedTurnID: Turn.ID
  readonly inputID: Turn.InputID
  readonly envelopeFingerprint: string
  readonly replay: Effect.Effect<Turn.Input | undefined, E, R>
  readonly promote: Effect.Effect<Turn.Input, E, R>
}

export interface Interface {
  readonly assertNotBusy: (sessionID: SessionID) => Effect.Effect<void, BusyError>
  readonly shared: SessionLifecycle.Interface["shared"]
  readonly admit: SessionLifecycle.Interface["admit"]
  readonly mutateThenAdmit: SessionLifecycle.Interface["mutateThenAdmit"]
  readonly mutateThenAdmitGuarded: SessionLifecycle.Interface["mutateThenAdmitGuarded"]
  readonly idle: SessionLifecycle.Interface["idle"]
  readonly idleMany: <A, E, R>(
    sessionIDs: readonly SessionID[],
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | BusyError, R>
  readonly closeMany: <A, E, R>(
    sessionIDs: readonly SessionID[],
    effect: (markCommitted: Effect.Effect<void>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | BusyError, R>
  readonly discard: (sessionIDs: readonly SessionID[]) => Effect.Effect<void>
  readonly close: <A, E, R>(
    sessionID: SessionID,
    effect: (markCommitted: Effect.Effect<void>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | BusyError, R>
  readonly phase: SessionLifecycle.Interface["phase"]
  readonly startTurn: <E, E2, E3, R>(
    input: StartTurnInput<E, E2, E3, R>,
  ) => Effect.Effect<Turn.Info, E | BusyError | Turn.Error, R>
  readonly steerTurn: <E, R>(input: SteerTurnInput<E, R>) => Effect.Effect<Turn.Input, E | Turn.Error, R>
  readonly promoteSteer: (sessionID: SessionID, turnID: Turn.ID) => Effect.Effect<boolean, Turn.Error>
  readonly activeTurn: (sessionID: SessionID) => Effect.Effect<Turn.Info | undefined, Turn.Error>
  readonly listTurns: (sessionID: SessionID) => Effect.Effect<readonly Turn.Info[], Turn.Error>
  readonly getTurn: (sessionID: SessionID, turnID: Turn.ID) => Effect.Effect<Turn.Info, Turn.Error>
  readonly awaitTurn: (sessionID: SessionID, turnID: Turn.ID) => Effect.Effect<Turn.Info, Turn.Error>
  readonly interruptTurn: (sessionID: SessionID, turnID: Turn.ID) => Effect.Effect<Turn.Info, Turn.Error>
  readonly startShell: (
    sessionID: SessionID,
    onInterrupt: Effect.Effect<SessionV1.WithParts>,
    work: Effect.Effect<SessionV1.WithParts>,
    ready?: Latch.Latch,
  ) => Effect.Effect<SessionV1.WithParts, BusyError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionRunState") {}

type TurnOwnerPhase = "admitting" | "running" | "terminalizing"

interface PendingSteer {
  readonly inputID: Turn.InputID
  readonly envelopeFingerprint: string
  readonly promote: Effect.Effect<Turn.Input, unknown>
  readonly result: Deferred.Deferred<Turn.Input, unknown>
  waiters: number
}

interface TurnOwner {
  readonly sessionID: SessionID
  readonly turnID: Turn.ID
  readonly envelopeFingerprint: string
  readonly control: Semaphore.Semaphore
  readonly ready: Deferred.Deferred<Turn.Info, unknown>
  readonly finished: Deferred.Deferred<Turn.Info, Turn.Error>
  readonly pendingSteers: PendingSteer[]
  phase: TurnOwnerPhase
  durableRunning: boolean
  terminal?: Turn.Info
  interruptReason?: "learner_interrupt" | "ancestor_interrupt" | "owner_handoff_failed" | "owner_lost"
  handoff?: Fiber.Fiber<void>
  runner?: Runner.Runner<Turn.Info, Turn.Error>
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const background = yield* BackgroundJob.Service
    const status = yield* SessionStatus.Service
    const events = yield* EventV2Bridge.Service
    const scope = yield* Scope.Scope
    const lifecycle = yield* SessionLifecycle.make()
    const turnOwners = new Map<SessionID, TurnOwner>()
    const runners = new Map<
      SessionID,
      {
        runner: Runner.Runner<SessionV1.WithParts>
        context: NonNullable<typeof InstanceRef.Service>
      }
    >()
    yield* Effect.addFinalizer(
      Effect.fnUntraced(function* () {
        yield* Effect.forEach(
          turnOwners.values(),
          (owner) => owner.runner?.cancel ?? (owner.handoff ? Fiber.interrupt(owner.handoff) : Effect.void),
          { concurrency: "unbounded", discard: true },
        )
        turnOwners.clear()
        yield* Effect.forEach(runners.values(), (entry) => entry.runner.cancel, {
          concurrency: "unbounded",
          discard: true,
        })
        runners.clear()
      }),
    )

    const lookupTurn = Effect.fn("SessionRunState.lookupTurn")(function* (turnID: Turn.ID) {
      return yield* db
        .transaction((tx) => TurnLifecycle.lookup(tx, turnID))
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const readTurn = Effect.fn("SessionRunState.readTurn")(function* (turnID: Turn.ID) {
      return yield* db.transaction((tx) => TurnLifecycle.info(tx, turnID)).pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const readActive = Effect.fn("SessionRunState.readActive")(function* (sessionID: SessionID) {
      return yield* db
        .transaction((tx) => TurnLifecycle.active(tx, sessionID))
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const settleTurn = Effect.fn("SessionRunState.settleTurn")(function* (input: {
      turnID: Turn.ID
      outcome: "completed" | "failed" | "interrupted"
      reason: Turn.TerminalReason
    }) {
      return yield* SessionTurnEvents.settle(events, { ...input, time: Date.now() })
    })

    const removeOwner = (owner: TurnOwner) =>
      Effect.sync(() => {
        if (turnOwners.get(owner.sessionID) === owner) turnOwners.delete(owner.sessionID)
      })

    const rejectPending = Effect.fnUntraced(function* (owner: TurnOwner, turn: Turn.Info) {
      const pending = owner.pendingSteers.splice(0)
      yield* Effect.forEach(
        pending,
        (steer) =>
          Deferred.fail(
            steer.result,
            new Turn.NotSteerableError({ sessionID: owner.sessionID, turnID: owner.turnID, state: turn.state }),
          ),
        { discard: true },
      )
    })

    const settleOwnerUnlocked = Effect.fnUntraced(function* (
      owner: TurnOwner,
      outcome: "completed" | "failed" | "interrupted",
      reason: Turn.TerminalReason,
    ) {
      if (owner.terminal) return owner.terminal
      owner.phase = "terminalizing"
      const turn = yield* settleTurn({ turnID: owner.turnID, outcome, reason })
      owner.terminal = turn
      yield* rejectPending(owner, turn)
      if (!owner.runner) yield* removeOwner(owner)
      yield* Deferred.succeed(owner.ready, turn).pipe(Effect.asVoid)
      yield* Deferred.succeed(owner.finished, turn).pipe(Effect.asVoid)
      return turn
    })

    const settleOwner = (
      owner: TurnOwner,
      outcome: "completed" | "failed" | "interrupted",
      reason: Turn.TerminalReason,
    ) => owner.control.withPermits(1)(settleOwnerUnlocked(owner, outcome, reason))

    const promotePendingUnlocked = Effect.fnUntraced(function* (owner: TurnOwner) {
      const turn = yield* db
        .select({ currentInputID: TurnTable.current_input_id })
        .from(TurnTable)
        .where(and(eq(TurnTable.id, owner.turnID), eq(TurnTable.state, "running")))
        .get()
        .pipe(Effect.orDie)
      if (!turn) return false
      const sampled = yield* db
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(
          and(
            eq(TurnModelOperationTable.turn_id, owner.turnID),
            eq(TurnModelOperationTable.input_id, turn.currentInputID),
          ),
        )
        .get()
        .pipe(Effect.orDie)
      if (!sampled) return false
      while (owner.pendingSteers.length > 0) {
        const steer = owner.pendingSteers.shift()
        if (!steer) return false
        const promoted = yield* steer.promote.pipe(Effect.exit)
        yield* Deferred.done(steer.result, promoted).pipe(Effect.asVoid)
        if (Exit.isSuccess(promoted)) return true
      }
      return false
    })

    const finishOwner = Effect.fnUntraced(function* (owner: TurnOwner, result: TurnWorkResult) {
      return yield* owner.control.withPermits(1)(
        Effect.gen(function* () {
          if (owner.terminal) return owner.terminal
          if (owner.phase === "terminalizing") {
            return yield* settleOwnerUnlocked(owner, "interrupted", owner.interruptReason ?? "owner_lost")
          }
          if (result.outcome === "completed" && (yield* promotePendingUnlocked(owner))) return
          return yield* settleOwnerUnlocked(owner, result.outcome, result.reason)
        }),
      )
    })

    const executeOwner = <E, R>(owner: TurnOwner, work: Effect.Effect<TurnWorkResult, E, R>) =>
      Effect.gen(function* () {
        while (true) {
          const exit = yield* work.pipe(Effect.exit)
          if (Exit.isFailure(exit)) {
            if (Cause.hasInterrupts(exit.cause)) {
              return yield* settleOwner(owner, "interrupted", owner.interruptReason ?? "owner_lost").pipe(
                Effect.uninterruptible,
              )
            }
            yield* Effect.logError(`Turn owner work failed: ${Cause.pretty(exit.cause)}`, {
              sessionID: owner.sessionID,
              turnID: owner.turnID,
            })
            return yield* settleOwner(owner, "failed", "owner_failure").pipe(Effect.uninterruptible)
          }
          const terminal = yield* finishOwner(owner, exit.value)
          if (terminal) return terminal
        }
      })

    const recoverTerminalizing = Effect.fnUntraced(function* (owner: TurnOwner) {
      if (owner.terminal) return owner.terminal
      const stored = yield* readTurn(owner.turnID)
      if (stored.state !== "running") {
        owner.terminal = stored
        yield* rejectPending(owner, stored)
        yield* Deferred.succeed(owner.finished, stored).pipe(Effect.asVoid)
        return stored
      }
      return yield* settleOwner(
        owner,
        "interrupted",
        owner.interruptReason ?? (owner.phase === "admitting" ? "owner_handoff_failed" : "owner_lost"),
      ).pipe(Effect.retry({ times: 2 }))
    })

    const cleanupHandoff = Effect.fnUntraced(function* (owner: TurnOwner, exit: Exit.Exit<Turn.Info, unknown>) {
      if (Exit.isSuccess(exit)) {
        if (owner.terminal) yield* removeOwner(owner)
        return
      }

      const inspect =
        owner.durableRunning || Cause.hasInterrupts(exit.cause) || Cause.hasDies(exit.cause)
          ? yield* lookupTurn(owner.turnID)
          : undefined
      if (inspect?.type === "available") {
        if (inspect.turn.state === "running") owner.durableRunning = true
        if (inspect.turn.state !== "running") owner.terminal = inspect.turn
      }
      if (owner.durableRunning && !owner.terminal) {
        owner.interruptReason ??= owner.phase === "admitting" ? "owner_handoff_failed" : "owner_lost"
        owner.phase = "terminalizing"
        const terminal = yield* recoverTerminalizing(owner)
        yield* Deferred.succeed(owner.ready, terminal).pipe(Effect.asVoid)
        yield* removeOwner(owner)
        return
      }
      if (owner.terminal) {
        yield* Deferred.succeed(owner.ready, owner.terminal).pipe(Effect.asVoid)
        yield* removeOwner(owner)
        return
      }
      yield* Deferred.failCause(owner.ready, exit.cause).pipe(Effect.asVoid)
      yield* removeOwner(owner)
    })

    const handoffOwner = <E, E2, E3, R>(owner: TurnOwner, input: StartTurnInput<E, E2, E3, R>) =>
      lifecycle
        .mutateThenAdmitGuarded(
          owner.sessionID,
          input.guardSessionIDs ?? [],
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const admitted = yield* restore(input.admit)
              owner.durableRunning = admitted.turn.state === "running"
              if (admitted.turn.state !== "running") {
                owner.terminal = admitted.turn
                yield* Deferred.succeed(owner.ready, admitted.turn).pipe(Effect.asVoid)
                return Effect.succeed(admitted.turn)
              }
              if (admitted.replay) {
                owner.phase = "terminalizing"
                const terminal = yield* settleOwner(owner, "interrupted", "owner_lost")
                return Effect.succeed(terminal)
              }

              if (input.install) yield* input.install
              const workContext = yield* Effect.context<R>()
              const gate = yield* Latch.make()
              const current = Runner.make<Turn.Info, Turn.Error>(scope, {
                onIdle: status.set(owner.sessionID, { type: "idle" }),
                onInterrupt: recoverTerminalizing(owner),
              })
              const awaitResult = yield* current.enterRunning(
                gate.await.pipe(Effect.andThen(executeOwner(owner, input.work.pipe(Effect.provide(workContext))))),
              )
              const promoted = yield* owner.control.withPermits(1)(
                Effect.sync(() => {
                  if (owner.phase !== "admitting") return false
                  owner.runner = current
                  owner.phase = "running"
                  return true
                }),
              )
              if (!promoted) {
                yield* current.cancel
                return yield* Effect.interrupt
              }
              return Effect.gen(function* () {
                yield* Deferred.succeed(owner.ready, admitted.turn).pipe(Effect.asVoid)
                yield* gate.open
                return yield* awaitResult
              })
            }),
          ),
        )
        .pipe(Effect.onExit((exit) => cleanupHandoff(owner, exit)))

    const makeTurnOwner = (input: {
      sessionID: SessionID
      turnID: Turn.ID
      envelopeFingerprint: string
    }): TurnOwner => ({
      ...input,
      phase: "admitting",
      durableRunning: false,
      control: Semaphore.makeUnsafe(1),
      ready: Deferred.makeUnsafe<Turn.Info, unknown>(),
      finished: Deferred.makeUnsafe<Turn.Info, Turn.Error>(),
      pendingSteers: [],
    })

    const awaitOwnerReady = <E>(owner: TurnOwner) =>
      Deferred.await(owner.ready).pipe(Effect.mapError((error) => error as E | BusyError | Turn.Error))

    const awaitOwnerResponse = <E>(owner: TurnOwner) =>
      Effect.gen(function* () {
        const result = yield* awaitOwnerReady<E>(owner).pipe(Effect.exit)
        if (Exit.isFailure(result)) {
          if (owner.handoff) yield* Fiber.join(owner.handoff)
          return yield* Effect.failCause(result.cause)
        }
        const turn = result.value
        if (turn.state !== "running" && owner.handoff) yield* Fiber.join(owner.handoff)
        return turn
      })

    const cancelAdmission = (owner: TurnOwner) =>
      Effect.gen(function* () {
        const handoff = yield* owner.control.withPermits(1)(
          Effect.sync(() => {
            if (owner.phase !== "admitting" || !owner.handoff) return
            owner.interruptReason ??= "owner_handoff_failed"
            owner.phase = "terminalizing"
            return owner.handoff
          }),
        )
        // Fiber.interrupt joins the target, whose cleanup and promotion both need owner.control.
        if (handoff) yield* Fiber.interrupt(handoff)
      })

    const startTurn = <E, E2, E3, R>(
      input: StartTurnInput<E, E2, E3, R>,
    ): Effect.Effect<Turn.Info, E | BusyError | Turn.Error, R> =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const current = turnOwners.get(input.sessionID)
          if (current) {
            if (current.turnID === input.turnID) {
              if (current.envelopeFingerprint !== input.envelopeFingerprint) {
                return yield* new Turn.AdmissionConflictError({ turnID: input.turnID })
              }
              if (current.phase === "admitting") return yield* restore(awaitOwnerResponse<E>(current))
              if (current.phase === "terminalizing") {
                const terminal = yield* recoverTerminalizing(current)
                if (current.handoff) yield* Fiber.join(current.handoff)
                return terminal
              }
              return yield* readTurn(input.turnID)
            }

            const stored = yield* lookupTurn(input.turnID)
            if (stored.type === "source_unavailable") {
              return yield* TurnLifecycle.sourceUnavailableError(stored)
            }
            if (stored.type === "available" && stored.turn.state !== "running") {
              return (yield* input.admit).turn
            }
            return yield* new Turn.AlreadyRunningError({
              sessionID: input.sessionID,
              activeTurnID: current.turnID,
            })
          }

          const owner = makeTurnOwner(input)
          turnOwners.set(input.sessionID, owner)
          const handoff = yield* handoffOwner(owner, input).pipe(
            Effect.catchCause((cause) =>
              Effect.logError(`Turn owner handoff failed: ${Cause.pretty(cause)}`, {
                sessionID: owner.sessionID,
                turnID: owner.turnID,
              }),
            ),
            Effect.asVoid,
            Effect.forkIn(scope),
          )
          owner.handoff = handoff
          return yield* restore(awaitOwnerResponse<E>(owner)).pipe(Effect.onInterrupt(() => cancelAdmission(owner)))
        }),
      )

    const runner = Effect.fn("SessionRunState.runner")(function* (
      sessionID: SessionID,
      onInterrupt: Effect.Effect<SessionV1.WithParts>,
    ) {
      const existing = runners.get(sessionID)
      if (existing) return existing.runner
      const context = yield* InstanceState.context
      const located = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(Effect.provideService(InstanceRef, context))
      const next = Runner.make<SessionV1.WithParts>(scope, {
        onIdle: located(status.set(sessionID, { type: "idle" })),
        onBusy: located(status.set(sessionID, { type: "busy" })),
        onInterrupt,
      })
      runners.set(sessionID, { runner: next, context })
      return next
    })

    const recoverOwnerless = Effect.fn("SessionRunState.recoverOwnerless")(function* (turn: Turn.Info) {
      if (turn.state !== "running") return turn
      return yield* settleTurn({ turnID: turn.id, outcome: "interrupted", reason: "owner_lost" })
    })

    const activeTurn: Interface["activeTurn"] = Effect.fn("SessionRunState.activeTurn")(function* (
      sessionID: SessionID,
    ) {
      const active = yield* readActive(sessionID)
      if (!active) return
      const owner = turnOwners.get(sessionID)
      if (!owner) return yield* recoverOwnerless(active)
      if (owner.turnID !== active.id) {
        return yield* new Turn.IntegrityError({
          turnID: active.id,
          reason: `Live owner ${owner.turnID} does not match durable active Turn`,
        })
      }
      if (owner.phase === "terminalizing") return yield* recoverTerminalizing(owner)
      return active
    })

    const listTurns: Interface["listTurns"] = Effect.fn("SessionRunState.listTurns")(function* (sessionID: SessionID) {
      if (yield* readActive(sessionID)) yield* activeTurn(sessionID)
      return yield* db
        .transaction((tx) => TurnLifecycle.list(tx, sessionID))
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const getTurn: Interface["getTurn"] = Effect.fn("SessionRunState.getTurn")(function* (
      sessionID: SessionID,
      turnID: Turn.ID,
    ) {
      const turn = yield* readTurn(turnID)
      if (turn.sessionID !== sessionID) return yield* new Turn.SessionMismatchError({ sessionID, turnID })
      if (turn.state !== "running") return turn
      const owner = turnOwners.get(sessionID)
      if (!owner) return yield* recoverOwnerless(turn)
      if (owner.turnID !== turnID) {
        return yield* new Turn.IntegrityError({
          turnID,
          reason: `Live owner ${owner.turnID} does not match durable running Turn`,
        })
      }
      if (owner.phase === "terminalizing") return yield* recoverTerminalizing(owner)
      return turn
    })

    const releasePending = (owner: TurnOwner, pending: PendingSteer) =>
      owner.control.withPermits(1)(
        Effect.sync(() => {
          pending.waiters = Math.max(0, pending.waiters - 1)
          if (pending.waiters > 0) return
          const index = owner.pendingSteers.indexOf(pending)
          if (index !== -1) owner.pendingSteers.splice(index, 1)
        }),
      )

    const awaitTurn: Interface["awaitTurn"] = Effect.fn("SessionRunState.awaitTurn")(function* (
      sessionID: SessionID,
      turnID: Turn.ID,
    ) {
      const turn = yield* getTurn(sessionID, turnID)
      if (turn.state !== "running") return turn
      const owner = turnOwners.get(sessionID)
      if (!owner || owner.turnID !== turnID) {
        return yield* new Turn.IntegrityError({ turnID, reason: "Running Turn has no exact awaitable owner" })
      }
      const terminal = yield* Deferred.await(owner.finished)
      if (owner.handoff) yield* Fiber.join(owner.handoff)
      return terminal
    })

    const steerTurn = <E, R>(input: SteerTurnInput<E, R>): Effect.Effect<Turn.Input, E | Turn.Error, R> =>
      Effect.gen(function* () {
        const replay = yield* input.replay
        if (replay) return replay

        const context = yield* Effect.context<R>()

        const owner = turnOwners.get(input.sessionID)
        if (!owner) {
          const active = yield* readActive(input.sessionID)
          if (active) {
            if (active.id !== input.expectedTurnID) {
              return yield* new Turn.ActiveTurnMismatchError({
                sessionID: input.sessionID,
                expectedTurnID: input.expectedTurnID,
                activeTurnID: active.id,
              })
            }
            const terminal = yield* recoverOwnerless(active)
            return yield* new Turn.NotSteerableError({
              sessionID: input.sessionID,
              turnID: input.expectedTurnID,
              state: terminal.state,
            })
          }
          const expected = yield* lookupTurn(input.expectedTurnID)
          if (expected.type === "available") {
            if (expected.turn.sessionID !== input.sessionID) {
              return yield* new Turn.SessionMismatchError({
                sessionID: input.sessionID,
                turnID: input.expectedTurnID,
              })
            }
            return yield* new Turn.NotSteerableError({
              sessionID: input.sessionID,
              turnID: input.expectedTurnID,
              state: expected.turn.state,
            })
          }
          return yield* new Turn.NoActiveTurnError({ sessionID: input.sessionID })
        }
        if (owner.turnID !== input.expectedTurnID) {
          return yield* new Turn.ActiveTurnMismatchError({
            sessionID: input.sessionID,
            expectedTurnID: input.expectedTurnID,
            activeTurnID: owner.turnID,
          })
        }
        if (owner.phase === "admitting") {
          return yield* new Turn.NoActiveTurnError({ sessionID: input.sessionID })
        }
        if (owner.phase === "terminalizing") {
          const terminal = yield* recoverTerminalizing(owner)
          return yield* new Turn.NotSteerableError({
            sessionID: input.sessionID,
            turnID: input.expectedTurnID,
            state: terminal.state,
          })
        }

        const pending: PendingSteer = {
          inputID: input.inputID,
          envelopeFingerprint: input.envelopeFingerprint,
          promote: input.promote.pipe(Effect.provide(context)) as Effect.Effect<Turn.Input, unknown>,
          result: Deferred.makeUnsafe<Turn.Input, unknown>(),
          waiters: 1,
        }
        const queued = yield* owner.control.withPermits(1)(
          Effect.sync(() => {
            if (owner.phase !== "running") return { type: "closed" as const }
            const existing = owner.pendingSteers.find((item) => item.inputID === input.inputID)
            if (existing) {
              if (existing.envelopeFingerprint !== input.envelopeFingerprint) {
                return { type: "conflict" as const }
              }
              existing.waiters += 1
              return { type: "existing" as const, pending: existing }
            }
            owner.pendingSteers.push(pending)
            return { type: "added" as const, pending }
          }),
        )
        if (queued.type === "conflict") {
          return yield* new Turn.AdmissionConflictError({ turnID: input.expectedTurnID })
        }
        if (queued.type === "closed") {
          const terminal = yield* recoverTerminalizing(owner)
          return yield* new Turn.NotSteerableError({
            sessionID: input.sessionID,
            turnID: input.expectedTurnID,
            state: terminal.state,
          })
        }
        return yield* Deferred.await(queued.pending.result).pipe(
          Effect.mapError((error) => error as E | Turn.Error),
          Effect.onInterrupt(() => releasePending(owner, queued.pending)),
        )
      })

    const promoteSteer: Interface["promoteSteer"] = Effect.fn("SessionRunState.promoteSteer")(function* (
      sessionID: SessionID,
      turnID: Turn.ID,
    ) {
      const owner = turnOwners.get(sessionID)
      if (!owner) {
        const active = yield* activeTurn(sessionID)
        if (!active || active.state !== "running") return false
        return yield* new Turn.IntegrityError({ turnID, reason: "Durable Turn has no live owner after recovery" })
      }
      if (owner.turnID !== turnID) {
        return yield* new Turn.ActiveTurnMismatchError({
          sessionID,
          expectedTurnID: turnID,
          activeTurnID: owner.turnID,
        })
      }
      if (owner.phase !== "running") return false
      return yield* owner.control.withPermits(1)(promotePendingUnlocked(owner))
    })

    const runningChildren = Effect.fn("SessionRunState.runningChildren")(function* (turnID: Turn.ID) {
      return yield* db
        .select({
          sessionID: TurnChildLineageTable.child_session_id,
          turnID: TurnChildLineageTable.child_turn_id,
        })
        .from(TurnChildLineageTable)
        .innerJoin(TurnTable, eq(TurnTable.id, TurnChildLineageTable.child_turn_id))
        .where(and(eq(TurnChildLineageTable.parent_turn_id, turnID), eq(TurnTable.state, "running")))
        .orderBy(asc(TurnChildLineageTable.child_turn_id))
        .all()
        .pipe(Effect.orDie)
    })

    const interruptOwned = Effect.fn("SessionRunState.interruptOwned")(function* (
      sessionID: SessionID,
      turnID: Turn.ID,
      reason: "learner_interrupt" | "ancestor_interrupt",
    ): Effect.fn.Return<Turn.Info, Turn.Error> {
      const owner = turnOwners.get(sessionID)
      const lookup = yield* lookupTurn(turnID)
      if (lookup.type === "source_unavailable") return yield* TurnLifecycle.sourceUnavailableError(lookup)
      if (lookup.type === "missing") {
        if (owner?.turnID === turnID && owner.phase === "admitting" && owner.handoff) {
          owner.interruptReason ??= reason
          yield* Fiber.interrupt(owner.handoff)
        }
        return yield* new Turn.NotFoundError({ turnID })
      }
      if (lookup.turn.sessionID !== sessionID) return yield* new Turn.SessionMismatchError({ sessionID, turnID })
      if (lookup.turn.state !== "running") {
        if (owner?.turnID === turnID && owner.handoff) yield* Fiber.join(owner.handoff)
        return lookup.turn
      }
      if (!owner) {
        yield* Effect.forEach(
          yield* runningChildren(turnID),
          (child) => interruptOwned(child.sessionID, child.turnID, "ancestor_interrupt"),
          { discard: true },
        )
        return yield* recoverOwnerless(lookup.turn)
      }
      if (owner.turnID !== turnID) {
        return yield* new Turn.IntegrityError({
          turnID,
          reason: `Live owner ${owner.turnID} does not match interrupt target`,
        })
      }

      const target = yield* owner.control.withPermits(1)(
        Effect.sync(() => {
          owner.interruptReason ??= reason
          owner.phase = "terminalizing"
          return { runner: owner.runner, handoff: owner.handoff }
        }),
      )
      yield* Effect.forEach(
        yield* runningChildren(turnID),
        (child) => interruptOwned(child.sessionID, child.turnID, "ancestor_interrupt"),
        { discard: true },
      )
      if (target.runner) yield* target.runner.cancel
      if (!target.runner && target.handoff) yield* Fiber.interrupt(target.handoff)
      const terminal = yield* recoverTerminalizing(owner)
      if (owner.handoff) yield* Fiber.join(owner.handoff)
      return terminal
    })

    const interruptTurn: Interface["interruptTurn"] = (sessionID, turnID) =>
      interruptOwned(sessionID, turnID, "learner_interrupt")

    const assertNotBusy = Effect.fn("SessionRunState.assertNotBusy")(function* (sessionID: SessionID) {
      if (turnOwners.has(sessionID)) yield* busyError(sessionID)
      const existing = runners.get(sessionID)
      if (existing?.runner.busy) yield* busyError(sessionID)
    })

    const cancel = Effect.fn("SessionRunState.cancel")(function* (sessionID: SessionID) {
      const existing = runners.get(sessionID)
      const current = yield* InstanceState.context.pipe(
        Effect.map((context) => context as NonNullable<typeof InstanceRef.Service> | undefined),
        Effect.catchCause(() => Effect.succeed(undefined)),
      )
      const context = existing?.context ?? current
      if (context) {
        yield* cancelBackgroundJobs(background, sessionID).pipe(Effect.provideService(InstanceRef, context))
      }
      if (!existing) {
        if (context) yield* status.set(sessionID, { type: "idle" }).pipe(Effect.provideService(InstanceRef, context))
        return
      }
      yield* existing.runner.cancel
    })

    const startShell = Effect.fn("SessionRunState.startShell")(function* (
      sessionID: SessionID,
      onInterrupt: Effect.Effect<SessionV1.WithParts>,
      work: Effect.Effect<SessionV1.WithParts>,
      ready?: Latch.Latch,
    ) {
      if (turnOwners.has(sessionID)) return yield* busyError(sessionID)
      return yield* lifecycle
        .handoff(
          sessionID,
          Effect.gen(function* () {
            const current = yield* runner(sessionID, onInterrupt)
            return { await: yield* current.enterShell(work, ready), onClosing: current.cancel }
          }),
        )
        .pipe(Effect.catchTag("RunnerBusy", () => Effect.fail(busyError(sessionID))))
    })

    const close: Interface["close"] = (sessionID, effect) =>
      lifecycle.close(sessionID, cancel(sessionID), (markCommitted) =>
        effect(
          markCommitted.pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                runners.delete(sessionID)
              }),
            ),
          ),
        ),
      )

    const idleMany: Interface["idleMany"] = <A, E, R>(
      sessionIDs: readonly SessionID[],
      effect: Effect.Effect<A, E, R>,
    ) => {
      const selected = [...new Set(sessionIDs)].sort()
      const acquire = (index: number): Effect.Effect<A, E | BusyError, R> => {
        const sessionID = selected[index]
        if (!sessionID) return effect
        return lifecycle.idle(sessionID, acquire(index + 1))
      }
      return acquire(0)
    }

    const discard: Interface["discard"] = (sessionIDs) =>
      Effect.sync(() => {
        sessionIDs.forEach((sessionID) => {
          runners.delete(sessionID)
          turnOwners.delete(sessionID)
        })
      })

    const closeMany: Interface["closeMany"] = <A, E, R>(
      sessionIDs: readonly SessionID[],
      effect: (markCommitted: Effect.Effect<void>) => Effect.Effect<A, E, R>,
    ) => {
      const selected = [...new Set(sessionIDs)].sort()
      const acquire = (
        index: number,
        committed: readonly Effect.Effect<void>[],
      ): Effect.Effect<A, E | BusyError, R> => {
        const sessionID = selected[index]
        if (!sessionID) return effect(Effect.forEach(committed, (mark) => mark, { discard: true }))
        return lifecycle.close(sessionID, Effect.void, (markCommitted) =>
          acquire(index + 1, [...committed, markCommitted]),
        )
      }
      return acquire(0, [])
    }

    return Service.of({
      assertNotBusy,
      shared: lifecycle.shared,
      admit: lifecycle.admit,
      mutateThenAdmit: lifecycle.mutateThenAdmit,
      mutateThenAdmitGuarded: lifecycle.mutateThenAdmitGuarded,
      idle: lifecycle.idle,
      idleMany,
      closeMany,
      discard,
      close,
      phase: lifecycle.phase,
      startTurn,
      steerTurn,
      promoteSteer,
      activeTurn,
      listTurns,
      getTurn,
      awaitTurn,
      interruptTurn,
      startShell,
    })
  }),
)

const cancelBackgroundJobs = Effect.fn("SessionRunState.cancelBackgroundJobs")(function* (
  background: BackgroundJob.Interface,
  sessionID: SessionID,
) {
  const jobs = yield* background.list()
  const pending = new Set<string>([sessionID])
  const cancelled = new Set<string>()
  const matches = (job: BackgroundJob.Info) => {
    if (job.status !== "running") return false
    if (cancelled.has(job.id)) return false
    if (pending.has(job.id)) return true
    if (typeof job.metadata?.sessionId === "string" && pending.has(job.metadata.sessionId)) return true
    return typeof job.metadata?.parentSessionId === "string" && pending.has(job.metadata.parentSessionId)
  }
  let batch = jobs.filter(matches)
  while (batch.length > 0) {
    yield* Effect.forEach(
      batch,
      (job) =>
        background.cancel(job.id).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              cancelled.add(job.id)
              pending.add(job.id)
              if (typeof job.metadata?.sessionId === "string") pending.add(job.metadata.sessionId)
            }),
          ),
        ),
      { concurrency: "unbounded", discard: true },
    )
    batch = jobs.filter(matches)
  }
})

function busyError(sessionID: SessionID) {
  return new BusyError({ sessionID })
}

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [BackgroundJob.node, SessionStatus.node, Database.node, EventV2Bridge.node],
})

export * as SessionRunState from "./run-state"
