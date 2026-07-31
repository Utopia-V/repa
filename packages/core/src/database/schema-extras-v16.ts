import { Effect } from "effect"
import type { Database } from "./database"
import { install as installV14, triggerStatements as triggerStatementsV14, viewStatements } from "./schema-extras-v14"
import { statements as learnerGoalStatements } from "../learner-goal/constraint-schema-v2"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

function replacedGoalTrigger(name: string) {
  return (
    name.startsWith("learner_goal_") &&
    !name.includes("_immutable") &&
    !name.includes("_delete_forbidden") &&
    name !== "learner_goal_state_guard_insert" &&
    !name.startsWith("learner_goal_time_zone")
  )
}

const replaced = new Set(
  triggerStatementsV14.flatMap((statement) => {
    const name = triggerName(statement)
    return name && replacedGoalTrigger(name) ? [name] : []
  }),
)

export { viewStatements }

export const triggerStatements = [
  ...triggerStatementsV14.filter((statement) => {
    const name = triggerName(statement)
    return !name || !replaced.has(name)
  }),
  ...learnerGoalStatements,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V16 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV14(tx)
    yield* tx
      .run("INSERT OR IGNORE INTO learner_goal_state (singleton, revision_sequence) VALUES (1, 0)")
      .pipe(Effect.orDie)
    yield* Effect.forEach(replaced, (name) => tx.run(`DROP TRIGGER IF EXISTS "${name}"`).pipe(Effect.orDie), {
      discard: true,
    })
    yield* Effect.forEach(learnerGoalStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
