import { Effect } from "effect"
import type { Database } from "./database"
import {
  install as installV21,
  learningCommandTerminalValidationV21,
  triggerStatements as triggerStatementsV21,
  viewStatements,
} from "./schema-extras-v21"
import { statements as learnerStateJudgmentStatements } from "../learner-state-judgment/constraint-schema-v1"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

function replaceOnce(value: string, before: string, after: string) {
  if (!value.includes(before)) throw new Error("The V22 terminal-trigger predecessor shape changed")
  return value.replace(before, after)
}

export { viewStatements }

const inheritedTerminalValidation = "learning_command_invocation_terminal_validate_v21"

const genericAlreadyApplied = `(NOT (NEW.command_name = 'update_assignment' AND NEW.command_version = 1)
                  AND receipt.occurrence_id = NEW.occurrence_id)`
const genericAlreadyAppliedV22 = `(NOT ((NEW.command_name = 'update_assignment' AND NEW.command_version = 1)
                  OR (NEW.command_name = 'update_learner_state_judgment' AND NEW.command_version = 1))
                  AND receipt.occurrence_id = NEW.occurrence_id)`

const assignmentAlreadyAppliedStart = `                OR (NEW.command_name = 'update_assignment'
                  AND NEW.command_version = 1
                  AND json_extract(NEW.settlement, '$.assignmentKind') = 'change_set'
                  AND json_extract(NEW.settlement, '$.existingOutcome') = 'applied'`

const learnerStateAlreadyApplied = `                OR (NEW.command_name = 'update_learner_state_judgment'
                  AND NEW.command_version = 1
                  AND json_extract(NEW.settlement, '$.learnerStateJudgmentKind') = 'revision'
                  AND json_extract(NEW.settlement, '$.outcome') = 'already_applied'
                  AND json_extract(NEW.settlement, '$.existingOutcome') = 'applied'
                  AND EXISTS (
                    SELECT 1
                    FROM learner_state_judgment_disposition AS disposition
                    JOIN learner_state_judgment_effect AS effect
                      ON effect.id = json_extract(NEW.settlement, '$.effectID')
                    JOIN learner_state_judgment_revision AS revision ON revision.effect_id = effect.id
                    JOIN learner_state_judgment_commit_seal AS seal ON seal.effect_id = effect.id
                    WHERE disposition.invocation_part_id = NEW.part_id
                      AND disposition.command_fingerprint = effect.command_fingerprint
                      AND disposition.semantic_address_fingerprint = effect.semantic_address_fingerprint
                      AND json(disposition.canonical_command) = json(effect.canonical_command)
                      AND (
                        (disposition.disposition = 'semantic_terminal_v1'
                          AND disposition.semantic_outcome = 'same_effect'
                          AND disposition.existing_effect_id = effect.id
                          AND disposition.existing_no_change_part_id IS NULL)
                        OR (disposition.disposition = 'candidate_v1'
                          AND disposition.semantic_outcome IS NULL
                          AND disposition.existing_effect_id IS NULL
                          AND disposition.existing_no_change_part_id IS NULL
                          AND json_extract(disposition.materialized_candidate, '$.commandFingerprint') =
                            effect.command_fingerprint
                          AND json_extract(disposition.materialized_candidate, '$.semanticAddressFingerprint') =
                            effect.semantic_address_fingerprint
                          AND json(json_extract(disposition.materialized_candidate, '$.canonicalCommand')) =
                            json(effect.canonical_command))
                      )
                      AND seal.receipt_id = receipt.id
                      AND json_type(NEW.settlement) = 'object'
                      AND (SELECT count(*) FROM json_each(NEW.settlement)) = 13
                      AND json_extract(NEW.settlement, '$.receiptID') = effect.physical_receipt_id
                      AND json_extract(NEW.settlement, '$.judgmentID') = revision.judgment_id
                      AND json_extract(NEW.settlement, '$.revisionID') = revision.id
                      AND json_extract(NEW.settlement, '$.version') = revision.version
                      AND json_extract(NEW.settlement, '$.operation') = revision.operation
                      AND json_extract(NEW.settlement, '$.disposition') = revision.disposition
                      AND json_extract(NEW.settlement, '$.settlementTime') = NEW.time_settled
                      AND json_extract(NEW.settlement, '$.settlementOrder') = NEW.settlement_order
                      AND json_extract(NEW.settlement, '$.frontierSequence') = revision.frontier_sequence
                      AND ((effect.cause_type IN ('interpreted_learner_report', 'learner_correction')
                          AND effect.occurrence_id = NEW.occurrence_id)
                        OR (effect.cause_type IN ('tutor_model_judgment', 'exact_owner_observation')
                          AND effect.model_operation_id = NEW.assistant_message_id))
                  ))
${assignmentAlreadyAppliedStart}`

const noChangeBlock = `        OR (NEW.status = 'no_change' AND (
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
        ))`

const noChangeBlockV22 = `        OR (NEW.status = 'no_change' AND (
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
          OR (NEW.command_name = 'update_learner_state_judgment' AND NEW.command_version = 1 AND NOT EXISTS (
            SELECT 1
            FROM learner_state_judgment_no_change_seal AS no_change
            JOIN learner_state_judgment_disposition AS disposition ON disposition.invocation_part_id = NEW.part_id
            WHERE disposition.command_fingerprint = no_change.command_fingerprint
              AND disposition.semantic_address_fingerprint = no_change.semantic_address_fingerprint
              AND json(disposition.canonical_command) = json(no_change.canonical_command)
              AND json_extract(NEW.settlement, '$.learnerStateJudgmentKind') = 'revision'
              AND json_extract(NEW.settlement, '$.outcome') = 'no_change'
              AND ((json_extract(NEW.settlement, '$.existingOutcome') = 'materialized_no_change'
                  AND no_change.invocation_part_id = NEW.part_id
                  AND no_change.time_committed = NEW.time_settled
                  AND no_change.commit_order = NEW.settlement_order
                  AND disposition.disposition = 'candidate_v1'
                  AND json(NEW.settlement) = json(no_change.result))
                OR (json_extract(NEW.settlement, '$.existingOutcome') = 'same_no_change'
                  AND ((disposition.disposition = 'semantic_terminal_v1'
                      AND disposition.semantic_outcome = 'same_no_change'
                      AND disposition.existing_no_change_part_id = no_change.invocation_part_id
                      AND disposition.existing_effect_id IS NULL)
                    OR (disposition.disposition = 'candidate_v1'
                      AND disposition.semantic_outcome IS NULL
                      AND disposition.existing_no_change_part_id IS NULL
                      AND disposition.existing_effect_id IS NULL))))
              AND json_type(NEW.settlement) = 'object'
              AND (SELECT count(*) FROM json_each(NEW.settlement)) = 8
              AND json_extract(NEW.settlement, '$.judgmentID') = json_extract(no_change.result, '$.judgmentID')
              AND json_extract(NEW.settlement, '$.revisionID') = json_extract(no_change.result, '$.revisionID')
              AND json_extract(NEW.settlement, '$.version') = json_extract(no_change.result, '$.version')
              AND json_extract(NEW.settlement, '$.settlementTime') = NEW.time_settled
              AND json_extract(NEW.settlement, '$.settlementOrder') = NEW.settlement_order
              AND ((no_change.cause_type IN ('interpreted_learner_report', 'learner_correction')
                  AND no_change.occurrence_id = NEW.occurrence_id)
                OR (no_change.cause_type IN ('tutor_model_judgment', 'exact_owner_observation')
                  AND no_change.model_operation_id = NEW.assistant_message_id))
          ))
        ))`

const terminalErrorBlock = `        OR (NEW.status = 'error' AND NEW.receipt_id IS NOT NULL);`
const terminalErrorBlockV22 = `        OR (NEW.status = 'error' AND (
          NEW.receipt_id IS NOT NULL
          OR (NEW.command_name = 'update_learner_state_judgment'
            AND NEW.command_version = 1
            AND json_extract(NEW.settlement, '$.outcome') = 'error'
            AND json_extract(NEW.settlement, '$.code') = 'semantic_conflict'
            AND json_extract(NEW.settlement, '$.settlementTime') = NEW.time_settled
            AND json_extract(NEW.settlement, '$.settlementOrder') = NEW.settlement_order
            AND json_type(NEW.settlement, '$.detail') = 'object'
            AND (SELECT count(*) FROM json_each(NEW.settlement, '$.detail')) = 1
            AND NOT EXISTS (
              SELECT 1
              FROM learner_state_judgment_disposition AS disposition
              WHERE disposition.invocation_part_id = NEW.part_id
                AND ((EXISTS (
                    SELECT 1 FROM learner_state_judgment_effect AS effect
                    WHERE effect.semantic_address_fingerprint = disposition.semantic_address_fingerprint
                      AND (effect.command_fingerprint <> disposition.command_fingerprint
                        OR json(effect.canonical_command) <> json(disposition.canonical_command))
                      AND json_extract(NEW.settlement, '$.detail.existingOutcome') = 'applied'
                      AND ((disposition.disposition = 'semantic_terminal_v1'
                          AND disposition.semantic_outcome = 'semantic_conflict'
                          AND disposition.existing_effect_id = effect.id
                          AND disposition.existing_no_change_part_id IS NULL)
                        OR (disposition.disposition = 'candidate_v1'
                          AND disposition.semantic_outcome IS NULL
                          AND disposition.existing_effect_id IS NULL
                          AND disposition.existing_no_change_part_id IS NULL
                          AND json_extract(disposition.materialized_candidate, '$.commandFingerprint') =
                            disposition.command_fingerprint
                          AND json_extract(disposition.materialized_candidate, '$.semanticAddressFingerprint') =
                            disposition.semantic_address_fingerprint
                          AND json(json_extract(disposition.materialized_candidate, '$.canonicalCommand')) =
                            json(disposition.canonical_command)))
                  )) OR EXISTS (
                    SELECT 1 FROM learner_state_judgment_no_change_seal AS no_change
                    WHERE no_change.semantic_address_fingerprint = disposition.semantic_address_fingerprint
                      AND (no_change.command_fingerprint <> disposition.command_fingerprint
                        OR json(no_change.canonical_command) <> json(disposition.canonical_command))
                      AND json_extract(NEW.settlement, '$.detail.existingOutcome') = 'no_change'
                      AND ((disposition.disposition = 'semantic_terminal_v1'
                          AND disposition.semantic_outcome = 'semantic_conflict'
                          AND disposition.existing_effect_id IS NULL
                          AND disposition.existing_no_change_part_id = no_change.invocation_part_id)
                        OR (disposition.disposition = 'candidate_v1'
                          AND disposition.semantic_outcome IS NULL
                          AND disposition.existing_effect_id IS NULL
                          AND disposition.existing_no_change_part_id IS NULL
                          AND json_extract(disposition.materialized_candidate, '$.commandFingerprint') =
                            disposition.command_fingerprint
                          AND json_extract(disposition.materialized_candidate, '$.semanticAddressFingerprint') =
                            disposition.semantic_address_fingerprint
                          AND json(json_extract(disposition.materialized_candidate, '$.canonicalCommand')) =
                            json(disposition.canonical_command)))
                  )))
            )
          ));`

export const learningCommandTerminalValidationV22 = replaceOnce(
  replaceOnce(
    replaceOnce(
      replaceOnce(
        learningCommandTerminalValidationV21.replace(
          "learning_command_invocation_terminal_validate_v21",
          "learning_command_invocation_terminal_validate_v22",
        ),
        genericAlreadyApplied,
        genericAlreadyAppliedV22,
      ),
      assignmentAlreadyAppliedStart,
      learnerStateAlreadyApplied,
    ),
    noChangeBlock,
    noChangeBlockV22,
  ),
  terminalErrorBlock,
  terminalErrorBlockV22,
)

const inheritedTriggerStatements = triggerStatementsV21.filter(
  (statement) => triggerName(statement) !== inheritedTerminalValidation,
)

export const triggerStatements = [
  ...inheritedTriggerStatements,
  learningCommandTerminalValidationV22,
  ...learnerStateJudgmentStatements,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V22 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV21(tx)
    yield* tx.run(`DROP TRIGGER IF EXISTS ${inheritedTerminalValidation}`).pipe(Effect.orDie)
    yield* tx.run(learningCommandTerminalValidationV22).pipe(Effect.orDie)
    yield* Effect.forEach(learnerStateJudgmentStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
