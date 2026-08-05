import { Effect } from "effect"
import type { Database } from "./database"
import { install as installV17, triggerStatements as triggerStatementsV17, viewStatements } from "./schema-extras-v17"
import { statements as learningContextStatements } from "../learning-context/constraint-schema"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

export { viewStatements }

export const triggerStatements = [...triggerStatementsV17, ...learningContextStatements]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V18 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV17(tx)
    yield* Effect.forEach(learningContextStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
