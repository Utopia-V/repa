import { Effect } from "effect"
import type { Database } from "./database"
import {
  install as installV19,
  triggerStatements as triggerStatementsV19,
  viewStatements,
} from "./schema-extras-v19"
import { statements as futureAttentionStatements } from "../future-attention/constraint-schema-v1"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

export { viewStatements }

const unavailableModelStatements = [
  `CREATE TRIGGER IF NOT EXISTS turn_unavailable_model_terminal_insert
    BEFORE INSERT ON turn_unavailable_model
    WHEN NOT ((NEW.state IS NULL AND NEW.time_settled IS NULL)
      OR (NEW.state IN ('completed', 'failed', 'interrupted') AND NEW.time_settled >= 0))
    BEGIN
      SELECT RAISE(ABORT, 'turn_unavailable_model terminal fields are invalid');
    END`,
  `CREATE TRIGGER IF NOT EXISTS turn_unavailable_model_terminal_update
    BEFORE UPDATE OF state, time_settled ON turn_unavailable_model
    WHEN NOT ((NEW.state IS NULL AND NEW.time_settled IS NULL)
      OR (NEW.state IN ('completed', 'failed', 'interrupted') AND NEW.time_settled >= 0))
    BEGIN
      SELECT RAISE(ABORT, 'turn_unavailable_model terminal fields are invalid');
    END`,
]

const toolServiceSourceStatements = [
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_future_attention_service_source_insert
    BEFORE INSERT ON turn_tool_candidate
    WHEN NEW.future_attention_service_source NOT IN ('learner_usable', 'internal_control')
    BEGIN
      SELECT RAISE(ABORT, 'turn_tool_candidate FutureAttention service-source classification is invalid');
    END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_future_attention_service_source_update
    BEFORE UPDATE OF future_attention_service_source ON turn_tool_candidate
    WHEN NEW.future_attention_service_source NOT IN ('learner_usable', 'internal_control')
    BEGIN
      SELECT RAISE(ABORT, 'turn_tool_candidate FutureAttention service-source classification is invalid');
    END`,
]

export const triggerStatements = [
  ...triggerStatementsV19,
  ...futureAttentionStatements,
  ...unavailableModelStatements,
  ...toolServiceSourceStatements,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V20 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV19(tx)
    yield* Effect.forEach(futureAttentionStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
    yield* Effect.forEach(unavailableModelStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
    yield* Effect.forEach(toolServiceSourceStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
