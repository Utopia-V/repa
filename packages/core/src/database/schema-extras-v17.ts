import { Effect } from "effect"
import type { Database } from "./database"
import { install as installV16, triggerStatements as triggerStatementsV16, viewStatements } from "./schema-extras-v16"
import { statements as learningBootstrapStatements } from "../learning-bootstrap/constraint-schema"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

const replaced = new Set(["learner_course_route_anchor_commit_seal_validate_insert_v12"])

export { viewStatements }

export const triggerStatements = [
  ...triggerStatementsV16.filter((statement) => {
    const name = triggerName(statement)
    return !name || !replaced.has(name)
  }),
  ...learningBootstrapStatements,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V17 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV16(tx)
    yield* Effect.forEach(replaced, (name) => tx.run(`DROP TRIGGER IF EXISTS "${name}"`).pipe(Effect.orDie), {
      discard: true,
    })
    yield* Effect.forEach(learningBootstrapStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
