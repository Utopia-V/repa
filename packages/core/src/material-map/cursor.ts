export * as MaterialMapCursor from "./cursor"

import { Effect, Option, Schema } from "effect"
import { base64Decode, base64Encode } from "../util/encode"
import { InvalidCursorError, type PageOptions } from "./schema"

export const Endpoint = Schema.Literals([
  "maps",
  "outline",
  "outline_nodes",
  "selectors",
  "map_successors",
  "map_alignments",
  "selector_alignments",
  "membership_alignments",
  "alignment_successors",
  "map_dispositions",
  "alignment_dispositions",
])
export type Endpoint = typeof Endpoint.Type

const Payload = Schema.Struct({
  version: Schema.Literal(1),
  endpoint: Endpoint,
  parent: Schema.String,
  filter: Schema.String,
  key: Schema.Array(Schema.Union([Schema.String, Schema.Number])),
})
type Payload = typeof Payload.Type

export type Scope = {
  readonly endpoint: Endpoint
  readonly parent: string
  readonly filter: string
}

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decodePayload = Schema.decodeUnknownOption(Payload)

export function options(input: PageOptions | undefined, scope: Scope) {
  return Effect.gen(function* () {
    const limit = input?.limit ?? 50
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return yield* new InvalidCursorError({ detail: "Page limit must be an integer between 1 and 100" })
    }
    if (input?.cursor === undefined) return { limit, key: undefined }
    const decoded = Option.liftThrowable(base64Decode)(input.cursor)
    const json = Option.flatMap(decoded, decodeJson)
    const payload = Option.flatMap(json, decodePayload)
    if (Option.isNone(payload)) return yield* new InvalidCursorError({ detail: "Cursor is malformed" })
    if (
      payload.value.endpoint !== scope.endpoint ||
      payload.value.parent !== scope.parent ||
      payload.value.filter !== scope.filter
    ) {
      return yield* new InvalidCursorError({ detail: "Cursor belongs to a different Material Map read scope" })
    }
    return { limit, key: [...payload.value.key] }
  })
}

export function next(scope: Scope, key: readonly (string | number)[]) {
  return base64Encode(
    JSON.stringify({
      version: 1,
      endpoint: scope.endpoint,
      parent: scope.parent,
      filter: scope.filter,
      key,
    } satisfies Payload),
  )
}
