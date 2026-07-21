export * as LearnerGoalCursor from "./cursor"

import { Effect, Option, Schema } from "effect"
import { base64Decode, base64Encode } from "../util/encode"
import { GoalID, InvalidCursorError, type PageOptions } from "./schema"

const Payload = Schema.Union([
  Schema.Struct({
    version: Schema.Literal(1),
    endpoint: Schema.Literal("history"),
    goalID: GoalID,
    throughRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    beforeVersion: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    endpoint: Schema.Literal("discovery"),
    scope: Schema.String,
    throughRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    beforeRevisionOrder: Schema.Int.check(Schema.isGreaterThan(0)),
    beforeGoalID: GoalID,
  }),
])
type Payload = typeof Payload.Type

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decodePayload = Schema.decodeUnknownOption(Payload)

function limit(input: PageOptions | undefined) {
  const value = input?.limit ?? 50
  return Number.isInteger(value) && value >= 1 && value <= 100
    ? Effect.succeed(value)
    : Effect.fail(new InvalidCursorError({ detail: "Page limit must be an integer between 1 and 100" }))
}

function payload(cursor: string) {
  const decoded = Option.liftThrowable(base64Decode)(cursor)
  const value = Option.flatMap(Option.flatMap(decoded, decodeJson), decodePayload)
  return Option.isSome(value)
    ? Effect.succeed(value.value)
    : Effect.fail(new InvalidCursorError({ detail: "Cursor is malformed" }))
}

export function historyOptions(input: PageOptions | undefined, goalID: GoalID) {
  return Effect.gen(function* () {
    const pageLimit = yield* limit(input)
    if (!input?.cursor) return { limit: pageLimit, throughRevision: undefined, beforeVersion: undefined }
    const value = yield* payload(input.cursor)
    if (value.endpoint !== "history" || value.goalID !== goalID) {
      return yield* new InvalidCursorError({ detail: "Cursor belongs to a different Goal history" })
    }
    return {
      limit: pageLimit,
      throughRevision: value.throughRevision,
      beforeVersion: value.beforeVersion,
    }
  })
}

export function discoveryOptions(input: PageOptions | undefined, scope: string) {
  return Effect.gen(function* () {
    const pageLimit = yield* limit(input)
    if (!input?.cursor) {
      return {
        limit: pageLimit,
        throughRevision: undefined,
        beforeRevisionOrder: undefined,
        beforeGoalID: undefined,
      }
    }
    const value = yield* payload(input.cursor)
    if (value.endpoint !== "discovery" || value.scope !== scope) {
      return yield* new InvalidCursorError({ detail: "Cursor belongs to a different Goal discovery scope" })
    }
    return {
      limit: pageLimit,
      throughRevision: value.throughRevision,
      beforeRevisionOrder: value.beforeRevisionOrder,
      beforeGoalID: value.beforeGoalID,
    }
  })
}

export function nextHistory(goalID: GoalID, throughRevision: number, beforeVersion: number) {
  return base64Encode(
    JSON.stringify({
      version: 1,
      endpoint: "history",
      goalID,
      throughRevision,
      beforeVersion,
    } satisfies Extract<Payload, { endpoint: "history" }>),
  )
}

export function nextDiscovery(
  scope: string,
  throughRevision: number,
  beforeRevisionOrder: number,
  beforeGoalID: GoalID,
) {
  return base64Encode(
    JSON.stringify({
      version: 1,
      endpoint: "discovery",
      scope,
      throughRevision,
      beforeRevisionOrder,
      beforeGoalID,
    } satisfies Extract<Payload, { endpoint: "discovery" }>),
  )
}
