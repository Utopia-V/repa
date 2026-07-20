export * as RetainedSteeringCursor from "./cursor"

import { Effect, Option, Schema } from "effect"
import { base64Decode, base64Encode } from "../util/encode"
import { InvalidCursorError, PolicyID, type PageOptions } from "./schema"

const Payload = Schema.Struct({
  version: Schema.Literal(1),
  endpoint: Schema.Literal("policy_history"),
  policyID: PolicyID,
  throughSteeringRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  beforeVersion: Schema.Int.check(Schema.isGreaterThan(0)),
})
type Payload = typeof Payload.Type

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decodePayload = Schema.decodeUnknownOption(Payload)

export function options(input: PageOptions | undefined, policyID: PolicyID) {
  return Effect.gen(function* () {
    const limit = input?.limit ?? 50
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return yield* new InvalidCursorError({ detail: "Page limit must be an integer between 1 and 100" })
    }
    if (input?.cursor === undefined) {
      return { limit, throughSteeringRevision: undefined, beforeVersion: undefined }
    }
    const decoded = Option.liftThrowable(base64Decode)(input.cursor)
    const payload = Option.flatMap(Option.flatMap(decoded, decodeJson), decodePayload)
    if (Option.isNone(payload)) return yield* new InvalidCursorError({ detail: "Cursor is malformed" })
    if (payload.value.policyID !== policyID) {
      return yield* new InvalidCursorError({ detail: "Cursor belongs to a different retained policy" })
    }
    return {
      limit,
      throughSteeringRevision: payload.value.throughSteeringRevision,
      beforeVersion: payload.value.beforeVersion,
    }
  })
}

export function next(policyID: PolicyID, throughSteeringRevision: number, beforeVersion: number) {
  return base64Encode(
    JSON.stringify({
      version: 1,
      endpoint: "policy_history",
      policyID,
      throughSteeringRevision,
      beforeVersion,
    } satisfies Payload),
  )
}
