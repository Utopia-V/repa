export * as LearningFrontier from "./learning-frontier"

import type { LearningFrontier as LearningFrontierSchema } from "@opencode-ai/schema/learning-frontier"
import { eq, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "./database/database"
import { SharedLearningFrontierTable } from "./learning-frontier.sql"

export type Snapshot = (typeof LearningFrontierSchema.Snapshot)["Encoded"]
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const initial: Snapshot = Object.freeze({ sequence: 0, time: 0 })

export function read(tx: Transaction): Effect.Effect<Snapshot> {
  return tx
    .select()
    .from(SharedLearningFrontierTable)
    .where(sql`${SharedLearningFrontierTable.singleton} = 1`)
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row ? { sequence: row.sequence, time: row.time_committed } : initial)),
    )
}

export function merge(...snapshots: readonly Snapshot[]): Snapshot {
  return snapshots.reduce(
    (result, item) => ({ sequence: Math.max(result.sequence, item.sequence), time: Math.max(result.time, item.time) }),
    initial,
  )
}

export function floor(time: number, ...snapshots: readonly Snapshot[]) {
  return Math.max(time, ...snapshots.map((item) => item.time))
}

export function advance(
  tx: Transaction,
  input: { readonly time: number; readonly consumed?: readonly Snapshot[] },
): Effect.Effect<Snapshot> {
  const time = floor(input.time, ...(input.consumed ?? []))
  return Effect.gen(function* () {
    const updated = yield* tx
      .update(SharedLearningFrontierTable)
      .set({
        sequence: sql`${SharedLearningFrontierTable.sequence} + 1`,
        time_committed: sql`max(${SharedLearningFrontierTable.time_committed}, ${time})`,
      })
      .where(eq(SharedLearningFrontierTable.singleton, 1))
      .returning({ sequence: SharedLearningFrontierTable.sequence, time: SharedLearningFrontierTable.time_committed })
      .get()
      .pipe(Effect.orDie)
    if (updated) return updated
    return yield* tx
      .insert(SharedLearningFrontierTable)
      .values({ singleton: 1, sequence: 1, time_committed: time })
      .returning({ sequence: SharedLearningFrontierTable.sequence, time: SharedLearningFrontierTable.time_committed })
      .get()
      .pipe(Effect.orDie)
  })
}
