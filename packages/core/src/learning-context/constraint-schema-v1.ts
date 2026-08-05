export * as LearningContextConstraintSchema from "./constraint-schema-v1"

import { Effect } from "effect"
import type { Database } from "../database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export const statements = [
  `CREATE TRIGGER IF NOT EXISTS turn_learning_context_cut_immutable_v18
   BEFORE UPDATE ON turn_learning_context_cut
   BEGIN
     SELECT RAISE(ABORT, 'turn_learning_context_cut_immutable_v18');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_capacity_immutable_v18
   BEFORE UPDATE ON turn_model_capacity
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_capacity_immutable_v18');
   END`,
] as const

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
