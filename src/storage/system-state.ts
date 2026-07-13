import type { Database } from "bun:sqlite"

export function readSystemState(database: Database) {
  const row = database
    .query("SELECT state_revision, last_transition_at FROM system_state WHERE singleton = 1")
    .get() as { state_revision: number; last_transition_at: number }
  return { revision: row.state_revision, lastTransitionAt: row.last_transition_at }
}

export function advanceSystemState(
  database: Database,
  input: {
    expectedRevision: number
    expectedTransitionAt: number
    nextRevision: number
    transitionAt: number
  },
) {
  if (input.nextRevision !== input.expectedRevision + 1) {
    throw new Error("System commit watermark must advance by exactly one")
  }
  if (input.transitionAt < input.expectedTransitionAt) {
    throw new Error("System transition cannot move backwards in time")
  }
  const updated = database
    .query(`
      UPDATE system_state
      SET state_revision = ?1, last_transition_at = ?2
      WHERE singleton = 1 AND state_revision = ?3 AND last_transition_at = ?4
    `)
    .run(
      input.nextRevision,
      input.transitionAt,
      input.expectedRevision,
      input.expectedTransitionAt,
    )
  if (updated.changes !== 1) {
    throw new Error(
      `State changed during transaction: expected revision ${input.expectedRevision} at ${input.expectedTransitionAt}`,
    )
  }
}
