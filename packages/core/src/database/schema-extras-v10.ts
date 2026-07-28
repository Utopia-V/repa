import { Effect } from "effect"
import { sql } from "drizzle-orm"
import type { Database } from "./database"
import { installLearningFrontierConstraints } from "../learning-frontier-constraint-v1"
import { TurnConstraintSchema } from "../turn/constraint-schema-v1"
import { MaterialMapConstraintSchema } from "../material-map/constraint-schema-v1"
import { LearnerNavigationConstraintSchema } from "../learner-navigation/constraint-schema-v1"
import { RetainedSteeringConstraintSchema } from "../retained-steering/constraint-schema-v1"
import { CourseConstraintSchema } from "../course/constraint-schema-v1"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installLearningFrontierConstraints(tx)
    yield* TurnConstraintSchema.install(tx)
    yield* MaterialMapConstraintSchema.install(tx)
    yield* LearnerNavigationConstraintSchema.install(tx)
    yield* RetainedSteeringConstraintSchema.install(tx)
    const courseHistorySchema = yield* tx.get<{ name: string }>(sql`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'course_state_history'
    `)
    if (courseHistorySchema) yield* CourseConstraintSchema.install(tx)
  })
}
