import { Effect } from "effect"
import type { Database } from "./database"
import {
  install as installV20,
  triggerStatements as triggerStatementsV20,
  viewStatements,
} from "./schema-extras-v20"
import { statements as assignmentStatements } from "../assignment/constraint-schema-v1"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

export { viewStatements }

const inheritedTerminalValidation = "learning_command_invocation_terminal_validate_v12"

const learningCommandTerminalValidation = `CREATE TRIGGER IF NOT EXISTS learning_command_invocation_terminal_validate_v21
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
   BEGIN
     SELECT RAISE(ABORT, 'learning_command_invocation_terminal_invalid')
     WHERE NEW.status = 'admitted'
        OR (NEW.status IN ('applied', 'already_applied') AND NOT EXISTS (
          SELECT 1 FROM learning_command_receipt AS receipt
          WHERE receipt.id = NEW.receipt_id
            AND receipt.capability_identity = NEW.capability_identity
            AND receipt.capability_version = NEW.capability_version
            AND receipt.authorization_basis = NEW.authorization_basis
            AND (
              (NEW.status = 'applied'
                AND receipt.invocation_part_id = NEW.part_id
                AND receipt.occurrence_id = NEW.occurrence_id
                AND receipt.time_committed = NEW.time_settled
                AND receipt.commit_order = NEW.settlement_order)
              OR (NEW.status = 'already_applied' AND (
                (NOT (NEW.command_name = 'update_assignment' AND NEW.command_version = 1)
                  AND receipt.occurrence_id = NEW.occurrence_id)
                OR (NEW.command_name = 'update_assignment'
                  AND NEW.command_version = 1
                  AND json_extract(NEW.settlement, '$.assignmentKind') = 'change_set'
                  AND json_extract(NEW.settlement, '$.existingOutcome') = 'applied'
                  AND EXISTS (
                   SELECT 1
                   FROM assignment_disposition AS disposition
                    JOIN assignment_effect AS effect
                      ON effect.id = json_extract(NEW.settlement, '$.effectID')
                    JOIN assignment_commit_seal AS seal ON seal.effect_id = effect.id
                    WHERE disposition.invocation_part_id = NEW.part_id
                      AND disposition.command_fingerprint = effect.command_fingerprint
                      AND disposition.semantic_address_fingerprint = effect.semantic_address_fingerprint
                      AND json(disposition.canonical_command) = json(effect.canonical_command)
                      AND (
                        (disposition.disposition = 'semantic_terminal_v1'
                          AND disposition.semantic_outcome = 'already_applied'
                          AND disposition.existing_effect_id = effect.id
                          AND disposition.existing_no_change_receipt_id IS NULL)
                        OR (disposition.disposition = 'candidate_v1'
                          AND disposition.semantic_outcome IS NULL
                          AND disposition.existing_effect_id IS NULL
                          AND disposition.existing_no_change_receipt_id IS NULL
                          AND json_extract(disposition.materialized_candidate, '$.effectID') IS NOT NULL
                          AND json_extract(disposition.materialized_candidate, '$.commandFingerprint') =
                            effect.command_fingerprint
                          AND json_extract(disposition.materialized_candidate, '$.semanticAddressFingerprint') =
                            effect.semantic_address_fingerprint
                          AND json(json_extract(disposition.materialized_candidate, '$.canonicalCommand')) =
                            json(effect.canonical_command))
                      )
                      AND seal.receipt_id = receipt.id
                      AND (
                        (effect.cause_type IN ('interpreted_learner_report', 'interpreted_learner_direction')
                          AND effect.occurrence_id = NEW.occurrence_id)
                        OR effect.cause_type IN ('interpreted_source_observation', 'interpreted_source_change')
                        OR (effect.cause_type = 'agent_correction'
                          AND effect.model_operation_id = NEW.assistant_message_id)
                      )
                  ))
                OR (NEW.command_name = 'update_assignment'
                  AND NEW.command_version = 1
                  AND json_extract(NEW.settlement, '$.assignmentKind') = 'change_set'
                  AND json_extract(NEW.settlement, '$.existingOutcome') = 'no_change'
                  AND json_type(NEW.settlement, '$.effectID') IS NULL
                  AND json_array_length(NEW.settlement, '$.changes') = 0
                  AND EXISTS (
                    SELECT 1
                    FROM assignment_disposition AS disposition
                    JOIN assignment_no_change_seal AS no_change
                      ON no_change.receipt_id = receipt.id
                    WHERE disposition.invocation_part_id = NEW.part_id
                      AND disposition.command_fingerprint = no_change.command_fingerprint
                      AND disposition.semantic_address_fingerprint = no_change.semantic_address_fingerprint
                      AND json(disposition.canonical_command) = json(no_change.canonical_command)
                      AND json(json_extract(NEW.settlement, '$.intentResults')) = json(no_change.results)
                      AND (
                        (disposition.disposition = 'semantic_terminal_v1'
                          AND disposition.semantic_outcome = 'already_applied'
                          AND disposition.existing_effect_id IS NULL
                          AND disposition.existing_no_change_receipt_id = no_change.receipt_id)
                        OR (disposition.disposition = 'candidate_v1'
                          AND disposition.semantic_outcome IS NULL
                          AND disposition.existing_effect_id IS NULL
                          AND disposition.existing_no_change_receipt_id IS NULL
                          AND json_extract(disposition.materialized_candidate, '$.commandFingerprint') =
                            no_change.command_fingerprint
                          AND json_extract(disposition.materialized_candidate, '$.semanticAddressFingerprint') =
                            no_change.semantic_address_fingerprint
                          AND json(json_extract(disposition.materialized_candidate, '$.canonicalCommand')) =
                            json(no_change.canonical_command))
                      )
                      AND (
                        (no_change.cause_type IN ('interpreted_learner_report', 'interpreted_learner_direction')
                          AND no_change.occurrence_id = NEW.occurrence_id)
                        OR no_change.cause_type IN ('interpreted_source_observation', 'interpreted_source_change')
                        OR (no_change.cause_type = 'agent_correction'
                          AND no_change.model_operation_id = NEW.assistant_message_id)
                      )
                  ))
              ))
            )
        ))
        OR (NEW.status = 'no_change' AND (
          NEW.receipt_id IS NOT NULL
          OR (NEW.command_name = 'update_assignment' AND NEW.command_version = 1 AND NOT EXISTS (
            SELECT 1
            FROM assignment_no_change_seal AS no_change
            JOIN assignment_disposition AS disposition ON disposition.invocation_part_id = NEW.part_id
            WHERE no_change.invocation_part_id = NEW.part_id
              AND no_change.time_committed = NEW.time_settled
              AND no_change.commit_order = NEW.settlement_order
              AND disposition.disposition = 'candidate_v1'
              AND disposition.command_fingerprint = no_change.command_fingerprint
              AND disposition.semantic_address_fingerprint = no_change.semantic_address_fingerprint
              AND json(disposition.canonical_command) = json(no_change.canonical_command)
              AND json(json_extract(NEW.settlement, '$.intentResults')) = json(no_change.results)
          ))
        ))
        OR (NEW.status = 'error' AND NEW.receipt_id IS NOT NULL);
   END`

const inheritedTriggerStatements = triggerStatementsV20.filter(
  (statement) => triggerName(statement) !== inheritedTerminalValidation,
)

export const triggerStatements = [
  ...inheritedTriggerStatements,
  learningCommandTerminalValidation,
  ...assignmentStatements,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V21 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV20(tx)
    yield* tx.run(`DROP TRIGGER IF EXISTS ${inheritedTerminalValidation}`).pipe(Effect.orDie)
    yield* tx.run(learningCommandTerminalValidation).pipe(Effect.orDie)
    yield* Effect.forEach(assignmentStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
