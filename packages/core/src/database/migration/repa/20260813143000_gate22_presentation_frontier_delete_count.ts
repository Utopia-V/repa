import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV24 } from "../../schema-extras-v24"

export default {
  id: "20260813143000_gate22_presentation_frontier_delete_count",
  up(tx) {
    return Effect.gen(function* () {
      yield* installSchemaExtrasV24(tx)
    })
  },
} satisfies DatabaseMigration.Migration
