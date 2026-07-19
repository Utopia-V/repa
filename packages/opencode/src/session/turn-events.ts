import { EventV2 } from "@opencode-ai/core/event"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { Turn } from "@opencode-ai/schema/turn"
import { TurnEvent } from "@opencode-ai/schema/turn-event"
import { Effect } from "effect"

export function started(read: () => TurnLifecycle.Admitted): EventV2.PreparedEvent<typeof TurnEvent.Started> {
  return {
    definition: TurnEvent.Started,
    // Prepared events commit in order. The immediately preceding genuine User
    // presentation installs admission through its commit hook, so these getters
    // expose the exact floored durable result without duplicating admission logic.
    data: {
      get sessionID() {
        return read().turn.sessionID
      },
      get turnID() {
        return read().turn.id
      },
      get timestamp() {
        return read().turn.timeAdmitted
      },
      get turn() {
        return read().turn
      },
      get input() {
        return read().input
      },
    },
  }
}

export function inputPromoted(read: () => Turn.Input): EventV2.PreparedEvent<typeof TurnEvent.InputPromoted> {
  return {
    definition: TurnEvent.InputPromoted,
    data: {
      get sessionID() {
        return read().sessionID
      },
      get turnID() {
        return read().turnID
      },
      get timestamp() {
        return read().timeAdmitted
      },
      get input() {
        return read()
      },
    },
  }
}

export function modelAdmitted(read: () => Turn.ModelOperation): EventV2.PreparedEvent<typeof TurnEvent.ModelAdmitted> {
  return {
    definition: TurnEvent.ModelAdmitted,
    data: {
      get sessionID() {
        return read().sessionID
      },
      get turnID() {
        return read().turnID
      },
      get timestamp() {
        return read().timeAdmitted
      },
      get operation() {
        return read()
      },
    },
  }
}

export function terminal(turn: Turn.Info): EventV2.PreparedEvent<typeof TurnEvent.Terminal> {
  if (!turn.terminal) throw new Error(`Terminal Turn event requires a terminal Turn: ${turn.id}`)
  return {
    definition: TurnEvent.Terminal,
    data: {
      sessionID: turn.sessionID,
      turnID: turn.id,
      timestamp: turn.terminal.time,
      terminal: turn.terminal,
    },
  }
}

export const settle = Effect.fn("SessionTurnEvents.settle")(function* (
  events: EventV2.Interface,
  input: {
    readonly turnID: Turn.ID
    readonly outcome: "completed" | "failed" | "interrupted"
    readonly reason: Turn.TerminalReason
    readonly time: number
  },
) {
  const committed = yield* events.transaction((tx) =>
    Effect.gen(function* () {
      const before = yield* TurnLifecycle.info(tx, input.turnID)
      const turn = yield* TurnLifecycle.settle(tx, input)
      if (before.state !== "running") return { result: turn }
      return { result: turn, event: terminal(turn) }
    }),
  )
  return committed.result
})

export * as SessionTurnEvents from "./turn-events"
