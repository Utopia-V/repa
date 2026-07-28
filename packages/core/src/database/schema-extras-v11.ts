import { Effect } from "effect"
import type { Database } from "./database"
import { install as installV10 } from "./schema-extras-v10"
import { LearnerGoalConstraintSchema } from "../learner-goal/constraint-schema-v1"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV10(tx)
    yield* LearnerGoalConstraintSchema.install(tx)
  })
}
