import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"
import { SessionID } from "./schema"
import { Effect, Layer, Context } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionStatusEvent } from "@opencode-ai/schema/session-status-event"

export const Info = SessionStatusEvent.Info
export type Info = SessionStatusEvent.Info

export const Event = SessionStatusEvent

export interface Interface {
  readonly get: (sessionID: SessionID) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Map<SessionID, Info>>
  readonly set: (sessionID: SessionID, status: Info) => Effect.Effect<void>
  readonly setIdleIf: (sessionID: SessionID, current: () => boolean) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionStatus") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service

    const state = yield* InstanceState.make(
      Effect.fn("SessionStatus.state")(() => Effect.succeed(new Map<SessionID, Info>())),
    )
    const revisions = new Map<SessionID, number>()
    let sequence = 0

    const get = Effect.fn("SessionStatus.get")(function* (sessionID: SessionID) {
      const data = yield* InstanceState.get(state)
      return data.get(sessionID) ?? { type: "idle" as const }
    })

    const list = Effect.fn("SessionStatus.list")(function* () {
      return new Map(yield* InstanceState.get(state))
    })

    const set = Effect.fn("SessionStatus.set")(function* (sessionID: SessionID, status: Info) {
      const data = yield* InstanceState.get(state)
      const revision = ++sequence
      revisions.set(sessionID, revision)
      yield* events.publish(Event.Status, { sessionID, status })
      if (status.type === "idle") {
        if (revisions.get(sessionID) !== revision) return
        yield* events.publish(Event.Idle, { sessionID })
        yield* Effect.sync(() => {
          if (revisions.get(sessionID) === revision) data.delete(sessionID)
        })
        return
      }
      yield* Effect.sync(() => {
        if (revisions.get(sessionID) === revision) data.set(sessionID, status)
      })
    })

    const setIdleIf = Effect.fn("SessionStatus.setIdleIf")(function* (sessionID: SessionID, current: () => boolean) {
      const data = yield* InstanceState.get(state)
      const revision = yield* Effect.sync(() => {
        if (!current()) return
        const next = ++sequence
        revisions.set(sessionID, next)
        return next
      })
      if (revision === undefined) return false

      yield* events.publish(Event.Status, { sessionID, status: { type: "idle" } })
      if (!(yield* Effect.sync(() => revisions.get(sessionID) === revision && current()))) return false
      yield* events.publish(Event.Idle, { sessionID })
      return yield* Effect.sync(() => {
        if (revisions.get(sessionID) !== revision || !current()) return false
        data.delete(sessionID)
        return true
      })
    })

    return Service.of({ get, list, set, setIdleIf })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [EventV2Bridge.node] })

export * as SessionStatus from "./status"
