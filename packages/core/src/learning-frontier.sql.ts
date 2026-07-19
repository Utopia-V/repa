import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { check, integer, sqliteTable } from "drizzle-orm/sqlite-core"
import type { Database } from "./database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export const SharedLearningFrontierTable = sqliteTable(
  "learning_shared_frontier",
  {
    singleton: integer().primaryKey().default(1),
    sequence: integer().notNull().default(0),
    time_committed: integer().notNull().default(0),
  },
  (table) => [
    check("learning_shared_frontier_singleton", sql`${table.singleton} = 1`),
    check("learning_shared_frontier_nonnegative", sql`${table.sequence} >= 0 AND ${table.time_committed} >= 0`),
  ],
)

const constraintStatements = [
  `CREATE TRIGGER IF NOT EXISTS learning_shared_frontier_validate_insert
   BEFORE INSERT ON learning_shared_frontier
   BEGIN
     SELECT RAISE(ABORT, 'learning_shared_frontier_initial_transition_invalid')
     WHERE EXISTS (SELECT 1 FROM learning_shared_frontier)
        OR NEW.singleton <> 1
        OR NEW.sequence NOT IN (0, 1)
        OR NEW.time_committed < 0
        OR (NEW.sequence = 0 AND NEW.time_committed <> 0);
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_shared_frontier_validate_update
   BEFORE UPDATE OF singleton, sequence, time_committed ON learning_shared_frontier
   BEGIN
     SELECT RAISE(ABORT, 'learning_shared_frontier_transition_invalid')
     WHERE NEW.singleton <> OLD.singleton
        OR NEW.sequence <> OLD.sequence + 1
        OR NEW.time_committed < OLD.time_committed;
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_shared_frontier_delete_forbidden
   BEFORE DELETE ON learning_shared_frontier
   BEGIN
     SELECT RAISE(ABORT, 'learning_shared_frontier_delete_forbidden');
   END`,
] as const

export function installLearningFrontierConstraints(tx: Transaction) {
  return Effect.forEach(constraintStatements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
