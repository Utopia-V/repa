import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Runner } from "@/effect/runner"
import { BackgroundJob } from "@/background/job"
import { Effect, Latch, Layer, Scope, Context } from "effect"
import { BusyError, SessionID } from "./schema"
import { SessionStatus } from "./status"
import { SessionLifecycle } from "./lifecycle"
import { InstanceState } from "@/effect/instance-state"
import { InstanceRef } from "@/effect/instance-ref"

export interface Interface {
  readonly assertNotBusy: (sessionID: SessionID) => Effect.Effect<void, BusyError>
  readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  readonly shared: SessionLifecycle.Interface["shared"]
  readonly admit: SessionLifecycle.Interface["admit"]
  readonly mutateThenAdmit: SessionLifecycle.Interface["mutateThenAdmit"]
  readonly idle: SessionLifecycle.Interface["idle"]
  readonly close: <A, E, R>(
    sessionID: SessionID,
    effect: (markCommitted: Effect.Effect<void>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | BusyError, R>
  readonly phase: SessionLifecycle.Interface["phase"]
  readonly ensureRunning: (
    sessionID: SessionID,
    onInterrupt: Effect.Effect<SessionV1.WithParts>,
    work: Effect.Effect<SessionV1.WithParts>,
  ) => Effect.Effect<SessionV1.WithParts, BusyError>
  readonly startShell: (
    sessionID: SessionID,
    onInterrupt: Effect.Effect<SessionV1.WithParts>,
    work: Effect.Effect<SessionV1.WithParts>,
    ready?: Latch.Latch,
  ) => Effect.Effect<SessionV1.WithParts, BusyError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionRunState") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    const status = yield* SessionStatus.Service
    const scope = yield* Scope.Scope
    const lifecycle = yield* SessionLifecycle.make()
    const runners = new Map<
      SessionID,
      {
        runner: Runner.Runner<SessionV1.WithParts>
        context: NonNullable<typeof InstanceRef.Service>
      }
    >()
    yield* Effect.addFinalizer(
      Effect.fnUntraced(function* () {
        yield* Effect.forEach(runners.values(), (entry) => entry.runner.cancel, {
          concurrency: "unbounded",
          discard: true,
        })
        runners.clear()
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

    const assertNotBusy = Effect.fn("SessionRunState.assertNotBusy")(function* (sessionID: SessionID) {
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

    const ensureRunning = Effect.fn("SessionRunState.ensureRunning")(function* (
      sessionID: SessionID,
      onInterrupt: Effect.Effect<SessionV1.WithParts>,
      work: Effect.Effect<SessionV1.WithParts>,
    ) {
      return yield* lifecycle.handoff(
        sessionID,
        Effect.gen(function* () {
          const current = yield* runner(sessionID, onInterrupt)
          return { await: yield* current.enterRunning(work), onClosing: current.cancel }
        }),
      )
    })

    const startShell = Effect.fn("SessionRunState.startShell")(function* (
      sessionID: SessionID,
      onInterrupt: Effect.Effect<SessionV1.WithParts>,
      work: Effect.Effect<SessionV1.WithParts>,
      ready?: Latch.Latch,
    ) {
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

    return Service.of({
      assertNotBusy,
      cancel,
      shared: lifecycle.shared,
      admit: lifecycle.admit,
      mutateThenAdmit: lifecycle.mutateThenAdmit,
      idle: lifecycle.idle,
      close,
      phase: lifecycle.phase,
      ensureRunning,
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

export const node = LayerNode.make({ service: Service, layer: layer, deps: [BackgroundJob.node, SessionStatus.node] })

export * as SessionRunState from "./run-state"
