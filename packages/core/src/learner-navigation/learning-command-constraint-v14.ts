import {
  defaultCourseTerminalStatement as defaultCourseTerminalStatementV13,
  noEffectStatement as noEffectStatementV13,
} from "./learning-command-constraint-v13"

function narrow(statement: string, name: string, marker: string, condition: string) {
  return statement
    .replace(/CREATE TRIGGER IF NOT EXISTS [^\s]+/i, `CREATE TRIGGER IF NOT EXISTS ${name}`)
    .replace(marker, `${marker}\n   AND ${condition}`)
}

const historicalDefaultCourseTerminalStatement = narrow(
  defaultCourseTerminalStatementV13,
  "default_course_learning_command_terminal_validate_v14_history",
  "AND NEW.status IN ('applied', 'already_applied')",
  "NEW.command_version = 2",
)

const historicalNoEffectStatement = narrow(
  noEffectStatementV13,
  "learner_navigation_learning_command_no_effect_validate_v14_history",
  "AND NEW.status IN ('no_change', 'error')",
  "(NEW.command_name <> 'set_default_course_preference' OR NEW.command_version IN (1, 2))",
)

export const defaultCourseTerminalStatement = `CREATE TRIGGER IF NOT EXISTS default_course_learning_command_terminal_validate_v14_agent
 BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
 ON learning_command_invocation
 WHEN OLD.status = 'admitted'
   AND NEW.command_name = 'set_default_course_preference'
   AND NEW.command_version = 3
   AND NEW.status IN ('applied', 'already_applied')
 BEGIN
   SELECT RAISE(ABORT, 'default_course_agent_terminal_invalid')
   WHERE NEW.capability_identity <> 'set_default_course_preference'
      OR NEW.capability_version <> 3
      OR NEW.authorization_basis <> 'agent_action'
      OR json_extract(NEW.settlement, '$.navigationKind') IS NOT 'default_course_preference'
      OR json_extract(NEW.settlement, '$.receiptID') IS NOT NEW.receipt_id
      OR NOT EXISTS (
        SELECT 1
        FROM learner_default_course_disposition AS disposition
        JOIN learner_default_course_acknowledgement AS acknowledgement
          ON acknowledgement.invocation_part_id = disposition.invocation_part_id
        JOIN learner_default_course_transition AS effect
          ON effect.id = acknowledgement.effect_id
        JOIN learner_default_course_commit_seal AS seal ON seal.effect_id = effect.id
        JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
        LEFT JOIN learner_default_course_capability_settlement AS capability
          ON capability.invocation_part_id = disposition.invocation_part_id
        WHERE disposition.invocation_part_id = NEW.part_id
          AND acknowledgement.receipt_id = NEW.receipt_id
          AND acknowledgement.effect_id = json_extract(NEW.settlement, '$.effectID')
          AND acknowledgement.relation = COALESCE(json_extract(NEW.settlement, '$.relation'), 'active')
          AND json_extract(NEW.settlement, '$.effect.id') = effect.id
          AND json_extract(NEW.settlement, '$.effect.occurrenceID') = effect.occurrence_id
          AND json_extract(NEW.settlement, '$.effect.previousCourseID') IS effect.previous_course_id
          AND json_extract(NEW.settlement, '$.effect.courseID') IS effect.course_id
          AND json_extract(NEW.settlement, '$.effect.previousVersion') = effect.version - 1
          AND json_extract(NEW.settlement, '$.effect.version') = effect.version
          AND json_extract(NEW.settlement, '$.effect.timeCommitted') = effect.time_committed
          AND json_extract(NEW.settlement, '$.effect.commitOrder') = effect.commit_order
          AND json_extract(NEW.settlement, '$.effect.frontierSequence') = effect.frontier_sequence
          AND receipt.id = acknowledgement.receipt_id
          AND receipt.occurrence_id = effect.occurrence_id
          AND receipt.time_committed = effect.time_committed
          AND receipt.commit_order = effect.commit_order
          AND (
            (
              NEW.status = 'applied'
              AND disposition.disposition = 'agent_action_v3'
              AND capability.authorization_fingerprint IS NULL
              AND capability.agent_action_fingerprint = disposition.agent_action_fingerprint
              AND capability.outcome IN ('policy_allow', 'prompted_allow')
              AND effect.agent_action_part_id = NEW.part_id
              AND effect.authorization_part_id IS NULL
              AND json_extract(acknowledgement.presentation_snapshot, '$.schemaVersion') = 2
              AND acknowledgement.effect_agent_action_part_id = NEW.part_id
              AND seal.invocation_part_id = NEW.part_id
              AND receipt.invocation_part_id = NEW.part_id
              AND NEW.time_settled = effect.time_committed
              AND NEW.settlement_order = effect.commit_order
            )
            OR
            (
              NEW.status = 'already_applied'
              AND NEW.time_settled >= effect.time_committed
              AND (
                (
                  disposition.disposition = 'agent_action_v3'
                  AND capability.authorization_fingerprint IS NULL
                  AND capability.agent_action_fingerprint = disposition.agent_action_fingerprint
                  AND capability.outcome IN (
                    'not_evaluated', 'policy_allow', 'policy_deny', 'prompted_allow',
                    'prompted_deny', 'prompted_correct', 'prompted_cancel', 'prompted_abort'
                  )
                )
                OR (
                  disposition.disposition = 'semantic_terminal_v3'
                  AND disposition.semantic_outcome = 'already_applied'
                  AND disposition.existing_effect_id = effect.id
                  AND disposition.incoming_payload_fingerprint =
                        disposition.existing_payload_fingerprint
                  AND capability.invocation_part_id IS NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM learner_default_course_capability_issue AS issue
                    WHERE issue.invocation_part_id = NEW.part_id
                  )
                )
              )
            )
          )
      );
 END`

export const noEffectStatement = `CREATE TRIGGER IF NOT EXISTS learner_navigation_learning_command_no_effect_validate_v14_agent
 BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
 ON learning_command_invocation
 WHEN OLD.status = 'admitted'
   AND NEW.command_name = 'set_default_course_preference'
   AND NEW.command_version = 3
   AND NEW.status IN ('no_change', 'error')
 BEGIN
   SELECT RAISE(ABORT, 'default_course_agent_no_effect_invalid')
   WHERE NEW.receipt_id IS NOT NULL
      OR NEW.capability_identity <> 'set_default_course_preference'
      OR NEW.capability_version <> 3
      OR NEW.authorization_basis <> 'agent_action'
      OR (
        NEW.status = 'no_change'
        AND (
          json_extract(NEW.settlement, '$.navigationKind') IS NOT 'default_course_preference'
          OR NOT EXISTS (
            SELECT 1
            FROM learner_default_course_disposition AS action
            JOIN learner_default_course_capability_settlement AS capability
              ON capability.invocation_part_id = action.invocation_part_id
            WHERE action.invocation_part_id = NEW.part_id
              AND action.disposition = 'agent_action_v3'
              AND capability.authorization_fingerprint IS NULL
              AND capability.agent_action_fingerprint = action.agent_action_fingerprint
              AND capability.outcome IN ('policy_allow', 'prompted_allow')
              AND (
                (
                  json_extract(action.from_locator, '$.kind') = 'absent'
                  AND json_extract(action.to_locator, '$.kind') = 'absent'
                )
                OR (
                  json_extract(action.from_locator, '$.kind') = 'course'
                  AND json_extract(action.to_locator, '$.kind') = 'course'
                  AND json_extract(action.from_locator, '$.locator.courseID') =
                        json_extract(action.to_locator, '$.locator.courseID')
                )
              )
          )
        )
      )
      OR (
        NEW.status = 'error'
        AND (
          json_type(NEW.settlement, '$.code') <> 'text'
          OR NOT (
            (
              json_extract(NEW.settlement, '$.code') = 'semantic_conflict'
              AND EXISTS (
                SELECT 1
                FROM learner_default_course_disposition AS terminal
                WHERE terminal.invocation_part_id = NEW.part_id
                  AND terminal.disposition = 'semantic_terminal_v3'
                  AND terminal.semantic_outcome = 'semantic_conflict'
                  AND terminal.incoming_payload_fingerprint <>
                        terminal.existing_payload_fingerprint
                  AND NOT EXISTS (
                    SELECT 1 FROM learner_default_course_capability_settlement AS capability
                    WHERE capability.invocation_part_id = NEW.part_id
                  )
              )
            )
            OR EXISTS (
              SELECT 1
              FROM learner_default_course_disposition AS action
              JOIN learner_default_course_capability_settlement AS capability
                ON capability.invocation_part_id = action.invocation_part_id
              WHERE action.invocation_part_id = NEW.part_id
                AND action.disposition = 'agent_action_v3'
                AND capability.authorization_fingerprint IS NULL
                AND capability.agent_action_fingerprint = action.agent_action_fingerprint
                AND (
                  json_extract(NEW.settlement, '$.code') = 'semantic_conflict'
                  OR (capability.outcome IN ('policy_deny', 'prompted_deny')
                    AND json_extract(NEW.settlement, '$.code') = 'permission_rejected')
                  OR (capability.outcome = 'prompted_correct'
                    AND json_extract(NEW.settlement, '$.code') = 'permission_corrected')
                  OR (capability.outcome = 'prompted_cancel'
                    AND json_extract(NEW.settlement, '$.code') = 'cancelled')
                  OR (capability.outcome IN ('not_evaluated', 'prompted_abort')
                    AND json_extract(NEW.settlement, '$.code') = 'interrupted')
                  OR (capability.outcome IN ('policy_allow', 'prompted_allow')
                    AND json_extract(NEW.settlement, '$.code') IN (
                      'interrupted', 'source_unavailable', 'stale'
                    ))
                )
            )
          )
        )
      )
      OR EXISTS (
        SELECT 1 FROM learner_default_course_acknowledgement AS acknowledgement
        WHERE acknowledgement.invocation_part_id = NEW.part_id
      )
      OR EXISTS (
        SELECT 1 FROM learner_default_course_commit_seal AS seal
        WHERE seal.invocation_part_id = NEW.part_id
      )
      OR EXISTS (
        SELECT 1 FROM learner_default_course_transition AS effect
        WHERE effect.agent_action_part_id = NEW.part_id
      );
 END`

export const learningCommandStatements = [
  historicalDefaultCourseTerminalStatement,
  defaultCourseTerminalStatement,
  historicalNoEffectStatement,
  noEffectStatement,
] as const
