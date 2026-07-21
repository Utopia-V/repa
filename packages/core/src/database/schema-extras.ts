export * as DatabaseSchemaExtras from "./schema-extras"

import { Effect } from "effect"
import { sql } from "drizzle-orm"
import type { Database } from "./database"
import { installLearningFrontierConstraints } from "../learning-frontier.sql"
import { TurnConstraintSchema } from "../turn/constraint-schema"
import { MaterialMapConstraintSchema } from "../material-map/constraint-schema"
import { LearnerNavigationConstraintSchema } from "../learner-navigation/constraint-schema"
import { RetainedSteeringConstraintSchema } from "../retained-steering/constraint-schema"
import { LearnerGoalConstraintSchema } from "../learner-goal/constraint-schema"
import { CourseConstraintSchema } from "../course/constraint-schema"

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
    const goalSchema = yield* tx.get<{ name: string }>(sql`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'learner_goal_effect'
    `)
    if (goalSchema) yield* LearnerGoalConstraintSchema.install(tx)
  })
}
