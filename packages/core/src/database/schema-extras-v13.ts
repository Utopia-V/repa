import { Effect } from "effect"
import type { Database } from "./database"
import { install as installV12, triggerStatements as triggerStatementsV12, viewStatements } from "./schema-extras-v12"
import { authorityStatements, defaultCourseTransitionStatement } from "../learner-navigation/constraint-schema-v2"
import {
  defaultCourseTerminalStatement,
  noEffectStatement,
} from "../learner-navigation/learning-command-constraint-v13"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const replaced = new Set([
  "learner_default_course_validate_insert",
  "default_course_learning_command_terminal_validate_v12",
  "learner_navigation_learning_command_no_effect_validate_v12",
  "learner_default_course_commit_seal_validate_insert_v12",
])

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

const replacementStatements = [
  defaultCourseTransitionStatement,
  defaultCourseTerminalStatement,
  noEffectStatement,
  ...authorityStatements,
] as const

export { viewStatements }

export const triggerStatements = [
  ...triggerStatementsV12.filter((statement) => {
    const name = triggerName(statement)
    return !name || !replaced.has(name)
  }),
  ...replacementStatements,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The v13 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV12(tx)
    yield* Effect.forEach(replaced, (name) => tx.run(`DROP TRIGGER IF EXISTS "${name}"`).pipe(Effect.orDie), {
      discard: true,
    })
    yield* Effect.forEach(replacementStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
