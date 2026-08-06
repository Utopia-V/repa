import { Effect } from "effect"
import type { Database } from "./database"
import { install as installV18, triggerStatements as triggerStatementsV18, viewStatements } from "./schema-extras-v18"
import { statements as learnerResponseEvidenceStatements } from "../learner-response-evidence/constraint-schema-v1"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

export { viewStatements }

export const triggerStatements = [...triggerStatementsV18, ...learnerResponseEvidenceStatements]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V19 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV18(tx)
    yield* Effect.forEach(learnerResponseEvidenceStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
