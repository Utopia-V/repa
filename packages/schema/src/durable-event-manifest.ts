export * as DurableEventManifest from "./durable-event-manifest"

import { Event } from "./event"
import { FutureAttentionEvent } from "./future-attention-event"
import { SessionEvent } from "./session-event"
import { SessionV1 } from "./session-v1"
import { TurnEvent } from "./turn-event"

export const SessionDurable = {
  definitions: Event.durable(SessionEvent.DurableDefinitions),
  schema: SessionEvent.Durable,
} as const

export const FutureAttentionDurable = {
  definitions: Event.durable(FutureAttentionEvent.DurableDefinitions),
  schema: FutureAttentionEvent.Durable,
} as const

export const Durable = Event.durable([
  ...SessionV1.Event.Definitions.filter((definition) => definition.durable !== undefined),
  ...SessionEvent.DurableDefinitions,
  ...TurnEvent.DurableDefinitions,
  ...FutureAttentionEvent.DurableDefinitions,
])
