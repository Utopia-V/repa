import { Effect } from "effect"
import type { Database } from "./database"
import {
  install as installV22,
  learningCommandTerminalValidationV22,
  noChangeBlockV22,
  terminalErrorBlockV22,
  triggerStatements as triggerStatementsV22,
  viewStatements,
} from "./schema-extras-v22"
import { statements as advisoryPlanSuggestionStatements } from "../advisory-plan-suggestion/constraint-schema-v1"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

function replaceOnce(value: string, before: string, after: string) {
  if (!value.includes(before)) throw new Error("The V23 terminal-trigger predecessor shape changed")
  return value.replace(before, after)
}

export { viewStatements }

const inheritedTerminalValidation = "learning_command_invocation_terminal_validate_v22"

const genericAlreadyAppliedV22 = `(NOT ((NEW.command_name = 'update_assignment' AND NEW.command_version = 1)
                  OR (NEW.command_name = 'update_learner_state_judgment' AND NEW.command_version = 1))
                  AND receipt.occurrence_id = NEW.occurrence_id)`
const genericAlreadyAppliedV23 = `(NOT ((NEW.command_name = 'update_assignment' AND NEW.command_version = 1)
                  OR (NEW.command_name = 'update_learner_state_judgment' AND NEW.command_version = 1)
                  OR (NEW.command_name = 'update_advisory_plan_suggestion' AND NEW.command_version = 1))
                  AND receipt.occurrence_id = NEW.occurrence_id)`

const learnerStateAlreadyAppliedStart = `                OR (NEW.command_name = 'update_learner_state_judgment'
                  AND NEW.command_version = 1
                  AND json_extract(NEW.settlement, '$.learnerStateJudgmentKind') = 'revision'`

const advisoryAlreadyApplied = `                OR (NEW.command_name = 'update_advisory_plan_suggestion'
                  AND NEW.command_version = 1
                  AND json_extract(NEW.settlement, '$.advisoryPlanSuggestionKind') = 'change_set'
                  AND json_extract(NEW.settlement, '$.outcome') = 'already_applied'
                  AND json_extract(NEW.settlement, '$.existingOutcome') = 'applied'
                  AND json_type(NEW.settlement) = 'object'
                  AND (SELECT count(*) FROM json_each(NEW.settlement)) = 9
                  AND EXISTS (
                    SELECT 1
                    FROM advisory_plan_suggestion_disposition AS disposition
                    JOIN advisory_plan_suggestion_effect AS effect
                      ON effect.id = json_extract(NEW.settlement, '$.effectID')
                    JOIN advisory_plan_suggestion_commit_seal AS seal ON seal.effect_id = effect.id
                    WHERE disposition.invocation_part_id = NEW.part_id
                      AND disposition.command_fingerprint = effect.command_fingerprint
                      AND disposition.semantic_address_fingerprint = effect.semantic_address_fingerprint
                      AND json(disposition.canonical_command) = json(effect.canonical_command)
                      AND ((disposition.disposition = 'semantic_terminal_v1'
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
                            json(effect.canonical_command)))
                      AND seal.receipt_id = receipt.id
                      AND json_extract(NEW.settlement, '$.receiptID') = effect.physical_receipt_id
                      AND json(json_extract(NEW.settlement, '$.intentResults')) =
                        json(json_extract(effect.result, '$.intentResults'))
                      AND json_extract(NEW.settlement, '$.settlementTime') = NEW.time_settled
                      AND json_extract(NEW.settlement, '$.settlementOrder') = NEW.settlement_order
                      AND json_extract(NEW.settlement, '$.frontierSequence') = effect.frontier_sequence
                      AND ((effect.cause_type = 'learner_revision' AND effect.occurrence_id = NEW.occurrence_id)
                        OR (effect.cause_type IN ('responsive_tutor_proposal', 'proactive_tutor_proposal', 'tutor_revision')
                          AND effect.model_operation_id = NEW.assistant_message_id))
                  ))
${learnerStateAlreadyAppliedStart}`

const noChangeBlockV23 = replaceOnce(
  noChangeBlockV22,
  `          ))
        ))`,
  `          ))
          OR (NEW.command_name = 'update_advisory_plan_suggestion'
            AND NEW.command_version = 1
            AND NOT EXISTS (
              SELECT 1
              FROM advisory_plan_suggestion_no_change_seal AS no_change
              JOIN advisory_plan_suggestion_disposition AS disposition
                ON disposition.invocation_part_id = NEW.part_id
              WHERE disposition.command_fingerprint = no_change.command_fingerprint
                AND disposition.semantic_address_fingerprint = no_change.semantic_address_fingerprint
                AND json(disposition.canonical_command) = json(no_change.canonical_command)
                AND json_extract(NEW.settlement, '$.advisoryPlanSuggestionKind') = 'change_set'
                AND json_extract(NEW.settlement, '$.outcome') = 'no_change'
                AND json_type(NEW.settlement) = 'object'
                AND (SELECT count(*) FROM json_each(NEW.settlement)) = 6
                AND json_extract(NEW.settlement, '$.settlementTime') = NEW.time_settled
                AND json_extract(NEW.settlement, '$.settlementOrder') = NEW.settlement_order
                AND json(json_extract(NEW.settlement, '$.intentResults')) =
                  json(json_extract(no_change.result, '$.intentResults'))
                AND ((json_extract(NEW.settlement, '$.existingOutcome') = 'materialized_no_change'
                    AND no_change.invocation_part_id = NEW.part_id
                    AND no_change.time_committed = NEW.time_settled
                    AND no_change.commit_order = NEW.settlement_order
                    AND disposition.disposition = 'candidate_v1')
                  OR (json_extract(NEW.settlement, '$.existingOutcome') = 'same_no_change'
                    AND ((disposition.disposition = 'semantic_terminal_v1'
                        AND disposition.semantic_outcome = 'same_no_change'
                        AND disposition.existing_effect_id IS NULL
                        AND disposition.existing_no_change_part_id = no_change.invocation_part_id)
                      OR (disposition.disposition = 'candidate_v1'
                        AND disposition.semantic_outcome IS NULL
                        AND disposition.existing_effect_id IS NULL
                        AND disposition.existing_no_change_part_id IS NULL
                        AND json_extract(disposition.materialized_candidate, '$.commandFingerprint') =
                          no_change.command_fingerprint
                        AND json_extract(disposition.materialized_candidate, '$.semanticAddressFingerprint') =
                          no_change.semantic_address_fingerprint
                        AND json(json_extract(disposition.materialized_candidate, '$.canonicalCommand')) =
                          json(no_change.canonical_command)))))
                AND ((no_change.cause_type = 'learner_revision' AND no_change.occurrence_id = NEW.occurrence_id)
                  OR (no_change.cause_type IN (
                      'responsive_tutor_proposal', 'proactive_tutor_proposal', 'tutor_revision'
                    ) AND no_change.model_operation_id = NEW.assistant_message_id))
            ))
        ))`,
)

const terminalErrorBlockV23 = replaceOnce(
  terminalErrorBlockV22,
  `          ));`,
  `          )
          OR (NEW.command_name = 'update_advisory_plan_suggestion'
            AND NEW.command_version = 1
            AND json_extract(NEW.settlement, '$.outcome') = 'error'
            AND json_extract(NEW.settlement, '$.code') = 'semantic_conflict'
            AND json_extract(NEW.settlement, '$.settlementTime') = NEW.time_settled
            AND json_extract(NEW.settlement, '$.settlementOrder') = NEW.settlement_order
            AND json_type(NEW.settlement, '$.detail') = 'object'
            AND (SELECT count(*) FROM json_each(NEW.settlement, '$.detail')) = 1
            AND NOT EXISTS (
              SELECT 1 FROM advisory_plan_suggestion_disposition AS disposition
              WHERE disposition.invocation_part_id = NEW.part_id
                AND ((EXISTS (
                    SELECT 1 FROM advisory_plan_suggestion_effect AS effect
                    JOIN advisory_plan_suggestion_commit_seal AS seal ON seal.effect_id = effect.id
                    WHERE effect.semantic_address_fingerprint = disposition.semantic_address_fingerprint
                      AND (effect.command_fingerprint <> disposition.command_fingerprint
                        OR json(effect.canonical_command) <> json(disposition.canonical_command))
                      AND json_extract(NEW.settlement, '$.detail.existingOutcome') = 'applied'
                      AND ((disposition.disposition = 'semantic_terminal_v1'
                          AND disposition.semantic_outcome = 'semantic_conflict'
                          AND disposition.existing_effect_id = effect.id
                          AND disposition.existing_no_change_part_id IS NULL)
                        OR disposition.disposition = 'candidate_v1'))
                  OR EXISTS (
                    SELECT 1 FROM advisory_plan_suggestion_no_change_seal AS no_change
                    WHERE no_change.semantic_address_fingerprint = disposition.semantic_address_fingerprint
                      AND (no_change.command_fingerprint <> disposition.command_fingerprint
                        OR json(no_change.canonical_command) <> json(disposition.canonical_command))
                      AND json_extract(NEW.settlement, '$.detail.existingOutcome') = 'no_change'
                      AND ((disposition.disposition = 'semantic_terminal_v1'
                          AND disposition.semantic_outcome = 'semantic_conflict'
                          AND disposition.existing_effect_id IS NULL
                          AND disposition.existing_no_change_part_id = no_change.invocation_part_id)
                        OR disposition.disposition = 'candidate_v1')))
            ))
        ));`,
)

export const learningCommandTerminalValidationV23 = replaceOnce(
  replaceOnce(
    replaceOnce(
      replaceOnce(
        learningCommandTerminalValidationV22.replace(
          "learning_command_invocation_terminal_validate_v22",
          "learning_command_invocation_terminal_validate_v23",
        ),
        genericAlreadyAppliedV22,
        genericAlreadyAppliedV23,
      ),
      learnerStateAlreadyAppliedStart,
      advisoryAlreadyApplied,
    ),
    noChangeBlockV22,
    noChangeBlockV23,
  ),
  terminalErrorBlockV22,
  terminalErrorBlockV23,
)

const inheritedTriggerStatements = triggerStatementsV22.filter(
  (statement) => triggerName(statement) !== inheritedTerminalValidation,
)

export const triggerStatements = [
  ...inheritedTriggerStatements,
  learningCommandTerminalValidationV23,
  ...advisoryPlanSuggestionStatements,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V23 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV22(tx)
    yield* tx.run(`DROP TRIGGER IF EXISTS ${inheritedTerminalValidation}`).pipe(Effect.orDie)
    yield* tx.run(learningCommandTerminalValidationV23).pipe(Effect.orDie)
    yield* Effect.forEach(advisoryPlanSuggestionStatements, (statement) => tx.run(statement).pipe(Effect.orDie), {
      discard: true,
    })
  })
}
