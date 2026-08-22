import { sql } from "drizzle-orm"
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const LearnerHomeIdentityTable = sqliteTable(
  "learner_home_identity",
  {
    singleton: integer().primaryKey(),
    id: text().notNull().unique(),
  },
  (table) => [
    check("learner_home_identity_singleton", sql`${table.singleton} = 1`),
    check(
      "learner_home_identity_shape",
      sql`length(${table.id}) = 36 AND substr(${table.id}, 1, 4) = 'lhm_'
        AND substr(${table.id}, 5) NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
)
