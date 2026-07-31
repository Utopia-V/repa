import { Effect } from "effect"
import type { Database } from "./database"
import { install as installV13, triggerStatements as triggerStatementsV13, viewStatements } from "./schema-extras-v13"
import { authorityStatements } from "../learner-navigation/constraint-schema-v3"
import { learningCommandStatements } from "../learner-navigation/learning-command-constraint-v14"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const replaced = new Set([
  "learner_default_course_validate_insert_v13",
  "learner_default_course_proposal_validate_insert_v13",
  "learner_default_course_disposition_validate_insert_v13",
  "learner_default_course_capability_issue_validate_insert_v13",
  "learner_default_course_capability_settlement_validate_insert_v13",
  "learner_default_course_acknowledgement_validate_insert_v13",
  "learner_default_course_commit_seal_validate_insert_v13",
  "default_course_learning_command_terminal_validate_v13",
  "learner_navigation_learning_command_no_effect_validate_v13",
])

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

const replacementStatements = [...authorityStatements, ...learningCommandStatements] as const

export { viewStatements }

export const triggerStatements = [
  ...triggerStatementsV13.filter((statement) => {
    const name = triggerName(statement)
    return !name || !replaced.has(name)
  }),
  ...replacementStatements,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The v14 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV13(tx)
    yield* Effect.forEach(replaced, (name) => tx.run(`DROP TRIGGER IF EXISTS "${name}"`).pipe(Effect.orDie), {
      discard: true,
    })
    yield* Effect.forEach(replacementStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
