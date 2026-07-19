export * as TurnMigration from "./migration"

import { Effect } from "effect"
import { sql } from "drizzle-orm"
import type { Database } from "../database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export function removeUnreferencedEmptyLegacySessions(tx: Transaction) {
  return Effect.gen(function* () {
    const anomalies = yield* tx.all<{ id: string }>(`
      SELECT session.id
      FROM session
      WHERE NOT EXISTS (SELECT 1 FROM message WHERE message.session_id = session.id)
        AND (
          EXISTS (SELECT 1 FROM part WHERE part.session_id = session.id)
          OR EXISTS (SELECT 1 FROM session AS child WHERE child.parent_id = session.id)
          OR EXISTS (SELECT 1 FROM todo WHERE todo.session_id = session.id)
          OR EXISTS (SELECT 1 FROM session_input WHERE session_input.session_id = session.id)
          OR EXISTS (SELECT 1 FROM session_message WHERE session_message.session_id = session.id)
          OR EXISTS (SELECT 1 FROM session_context_epoch WHERE session_context_epoch.session_id = session.id)
          OR EXISTS (SELECT 1 FROM session_share WHERE session_share.session_id = session.id)
          OR EXISTS (
            SELECT 1 FROM learning_admitted_occurrence
            WHERE learning_admitted_occurrence.origin_session_id = session.id
          )
          OR EXISTS (
            SELECT 1 FROM learning_occurrence_presentation
            WHERE learning_occurrence_presentation.session_id = session.id
          )
          OR EXISTS (
            SELECT 1 FROM learning_historical_tool_presentation
            WHERE learning_historical_tool_presentation.session_id = session.id
               OR learning_historical_tool_presentation.source_session_id = session.id
          )
          OR EXISTS (
            SELECT 1 FROM learning_command_invocation
            WHERE learning_command_invocation.session_id = session.id
          )
          OR EXISTS (
            SELECT 1 FROM learning_command_receipt
            WHERE learning_command_receipt.origin_session_id = session.id
          )
        )
      ORDER BY session.id
      LIMIT 2
    `)
    if (anomalies.length > 0) {
      const suffix = anomalies.length > 1 ? " and at least one other Session" : ""
      return yield* Effect.fail(
        new Error(
          `Gate 12 cannot migrate referenced empty legacy Session ${anomalies[0]!.id}${suffix}; no Turn was fabricated.`,
        ),
      )
    }

    const removable = yield* tx.all<{ id: string }>(`
      SELECT session.id
      FROM session
      WHERE NOT EXISTS (SELECT 1 FROM message WHERE message.session_id = session.id)
      ORDER BY session.id
    `)
    yield* Effect.forEach(
      removable,
      (session) =>
        Effect.gen(function* () {
          yield* tx.run(sql`DELETE FROM event WHERE aggregate_id = ${session.id}`)
          yield* tx.run(sql`DELETE FROM event_sequence WHERE aggregate_id = ${session.id}`)
          yield* tx.run(sql`DELETE FROM session WHERE id = ${session.id}`)
        }),
      { discard: true },
    )
  })
}
