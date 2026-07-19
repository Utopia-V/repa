export * as DatabaseSchemaExtras from "./schema-extras"

import { Effect } from "effect"
import type { Database } from "./database"
import { installLearningFrontierConstraints } from "../learning-frontier.sql"
import { TurnConstraintSchema } from "../turn/constraint-schema"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installLearningFrontierConstraints(tx)
    yield* TurnConstraintSchema.install(tx)
  })
}
