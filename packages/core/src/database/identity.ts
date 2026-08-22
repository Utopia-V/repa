export * as LearnerHomeIdentity from "./identity"

import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Database } from "./database"
import { LearnerHomeIdentityTable } from "./identity.sql"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export const ID = Schema.String.check(Schema.isPattern(/^lhm_[0-9a-f]{32}$/)).pipe(
  Schema.brand("LearnerHomeIdentity"),
)
export type ID = typeof ID.Type

export function read(tx: Transaction) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ id: LearnerHomeIdentityTable.id })
      .from(LearnerHomeIdentityTable)
      .where(eq(LearnerHomeIdentityTable.singleton, 1))
      .get()
      .pipe(Effect.orDie)
    if (!row) throw new Error("LearnerHome database identity is unavailable")
    return ID.make(row.id)
  })
}
