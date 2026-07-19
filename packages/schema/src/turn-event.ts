export * as TurnEvent from "./turn-event"

import { Schema } from "effect"
import { Event } from "./event"
import { DateTimeUtcFromMillis, NonNegativeInt } from "./schema"
import { SessionID } from "./session-id"
import { SessionV1 } from "./session-v1"
import { Turn } from "./turn"

const options = {
  durable: {
    aggregate: "sessionID",
    version: 1,
  },
} as const

const Base = {
  sessionID: SessionID,
  turnID: Turn.ID,
  timestamp: DateTimeUtcFromMillis,
}

export const Started = Event.define({
  type: "turn.started",
  ...options,
  schema: { ...Base, turn: Turn.Info, input: Turn.Input },
})

export const InputPromoted = Event.define({
  type: "turn.input.promoted",
  ...options,
  schema: { ...Base, input: Turn.Input },
})

export const ModelAdmitted = Event.define({
  type: "turn.model.admitted",
  ...options,
  schema: { ...Base, operation: Turn.ModelOperation },
})

export const ModelSettled = Event.define({
  type: "turn.model.settled",
  ...options,
  schema: {
    ...Base,
    assistantMessageID: SessionV1.MessageID,
    state: Turn.ModelState,
  },
})

export const CandidateSetSealed = Event.define({
  type: "turn.tool.candidates.sealed",
  ...options,
  schema: {
    ...Base,
    assistantMessageID: SessionV1.MessageID,
    count: NonNegativeInt,
  },
})

export const CandidateDisposition = Event.define({
  type: "turn.tool.candidate.disposition",
  ...options,
  schema: { ...Base, candidate: Turn.ToolCandidate },
})

export const ToolAdmitted = Event.define({
  type: "turn.tool.admitted",
  ...options,
  schema: { ...Base, invocation: Turn.ToolInvocation },
})

export const ToolSettled = Event.define({
  type: "turn.tool.settled",
  ...options,
  schema: {
    ...Base,
    partID: SessionV1.PartID,
    state: Turn.InvocationState,
  },
})

export const Terminal = Event.define({
  type: "turn.terminal",
  ...options,
  schema: { ...Base, terminal: Turn.Terminal },
})

export const DurableDefinitions = Event.inventory(
  Started,
  InputPromoted,
  ModelAdmitted,
  ModelSettled,
  CandidateSetSealed,
  CandidateDisposition,
  ToolAdmitted,
  ToolSettled,
  Terminal,
)

export const Definitions = DurableDefinitions
export const Durable = Schema.Union(DurableDefinitions, { mode: "oneOf" })
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "TurnDurableEvent" })
export type DurableEvent = typeof Durable.Type
