import { learningCommandStatements as learningCommandStatementsV12 } from "./learning-command-constraint-v12"

const routeTerminal = learningCommandStatementsV12.find((statement) =>
  statement.includes("CREATE TRIGGER IF NOT EXISTS course_route_anchor_learning_command_terminal_validate_v12"),
)
if (!routeTerminal) throw new Error("The frozen V12 route terminal trigger is missing")

export const defaultCourseTerminalStatement = `CREATE TRIGGER IF NOT EXISTS default_course_learning_command_terminal_validate_v13
 BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
 ON learning_command_invocation
 WHEN OLD.status = 'admitted'
   AND NEW.command_name = 'set_default_course_preference'
   AND NEW.status IN ('applied', 'already_applied')
 BEGIN
   SELECT RAISE(ABORT, 'default_course_learning_command_terminal_invalid')
   WHERE NEW.command_version <> 2
      OR NEW.capability_identity <> 'set_default_course_preference'
      OR NEW.capability_version <> 2
      OR json_extract(NEW.settlement, '$.navigationKind') IS NOT 'default_course_preference'
      OR (SELECT count(*) FROM json_each(NEW.settlement))
           <> CASE NEW.status WHEN 'applied' THEN 8 ELSE 9 END
      OR json_type(NEW.settlement, '$.current') IS NOT 'object'
      OR json_extract(NEW.settlement, '$.current.kind') IS NOT 'default_course_preference'
      OR NOT COALESCE(json_type(NEW.settlement, '$.current.headID') IN ('text', 'null'), 0)
      OR json_type(NEW.settlement, '$.current.version') IS NOT 'integer'
      OR json_extract(NEW.settlement, '$.current.version') < 0
      OR NOT COALESCE(json_type(NEW.settlement, '$.current.courseID') IN ('text', 'null'), 0)
      OR json_type(NEW.settlement, '$.current.usability') IS NOT 'object'
      OR (NEW.status = 'already_applied'
          AND NOT COALESCE(json_extract(NEW.settlement, '$.relation') IN ('active', 'superseded'), 0))
      OR json_extract(NEW.settlement, '$.receiptID') IS NOT NEW.receipt_id
      OR NOT EXISTS (
        SELECT 1
        FROM learner_default_course_disposition AS disposition
        JOIN learner_default_course_acknowledgement AS acknowledgement
          ON acknowledgement.invocation_part_id = disposition.invocation_part_id
        JOIN learner_default_course_commit_seal AS seal
          ON seal.effect_id = acknowledgement.effect_id
        JOIN learner_default_course_transition AS effect
          ON effect.id = seal.effect_id
        JOIN learner_default_course_disposition AS effect_authorization
          ON effect_authorization.invocation_part_id = effect.authorization_part_id
        JOIN learning_command_invocation AS effect_invocation
          ON effect_invocation.part_id = effect.authorization_part_id
        JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
        LEFT JOIN learner_default_course_capability_settlement AS capability
          ON capability.invocation_part_id = disposition.invocation_part_id
        WHERE disposition.invocation_part_id = NEW.part_id
          AND acknowledgement.receipt_id = NEW.receipt_id
          AND acknowledgement.effect_id = json_extract(NEW.settlement, '$.effectID')
          AND acknowledgement.authorization_version = effect_authorization.authorization_version
          AND acknowledgement.relation = COALESCE(
            json_extract(NEW.settlement, '$.relation'),
            'active'
          )
          AND json_extract(NEW.settlement, '$.effect.id') = effect.id
          AND json_extract(NEW.settlement, '$.effect.occurrenceID') = effect.occurrence_id
          AND json_extract(NEW.settlement, '$.effect.previousCourseID') IS effect.previous_course_id
          AND json_extract(NEW.settlement, '$.effect.courseID') IS effect.course_id
          AND json_extract(NEW.settlement, '$.effect.previousVersion') = effect.version - 1
          AND json_extract(NEW.settlement, '$.effect.version') = effect.version
          AND json_extract(NEW.settlement, '$.effect.timeCommitted') = effect.time_committed
          AND json_extract(NEW.settlement, '$.effect.commitOrder') = effect.commit_order
          AND json_extract(NEW.settlement, '$.effect.frontierSequence') = effect.frontier_sequence
          AND effect_authorization.disposition IN ('legacy_v1', 'candidate_v2')
          AND effect_invocation.command_name = 'set_default_course_preference'
          AND effect_invocation.command_version = effect_authorization.authorization_version
          AND effect_invocation.capability_identity = 'set_default_course_preference'
          AND effect_invocation.capability_version = effect_authorization.authorization_version
          AND receipt.occurrence_id = effect.occurrence_id
          AND receipt.invocation_part_id = seal.invocation_part_id
          AND receipt.capability_identity = effect_invocation.capability_identity
          AND receipt.capability_version = effect_invocation.capability_version
          AND receipt.authorization_basis = effect_invocation.authorization_basis
          AND receipt.time_committed = effect.time_committed
          AND receipt.commit_order = effect.commit_order
          AND (
            (
              NEW.status = 'applied'
              AND disposition.disposition = 'candidate_v2'
              AND disposition.authorization_version = 2
              AND disposition.authorization_kind IN ('direct_request_v2', 'accepted_proposal_v2')
              AND NEW.authorization_basis = CASE disposition.authorization_kind
                WHEN 'direct_request_v2' THEN 'learner_request'
                ELSE 'learner_acceptance'
              END
              AND capability.authorization_fingerprint = disposition.authorization_fingerprint
              AND capability.outcome IN ('policy_allow', 'prompted_allow')
              AND effect.authorization_part_id = NEW.part_id
              AND seal.invocation_part_id = NEW.part_id
              AND receipt.invocation_part_id = NEW.part_id
              AND NEW.time_settled = effect.time_committed
              AND NEW.settlement_order = effect.commit_order
            )
            OR
            (
              NEW.status = 'already_applied'
              AND effect.authorization_part_id = acknowledgement.effect_authorization_part_id
              AND NEW.time_settled >= effect.time_committed
              AND (
                (
                  disposition.disposition = 'candidate_v2'
                  AND disposition.authorization_version = 2
                  AND disposition.authorization_kind IN ('direct_request_v2', 'accepted_proposal_v2')
                  AND NEW.authorization_basis = CASE disposition.authorization_kind
                    WHEN 'direct_request_v2' THEN 'learner_request'
                    ELSE 'learner_acceptance'
                  END
                  AND capability.authorization_fingerprint = disposition.authorization_fingerprint
                  AND capability.outcome IN (
                    'not_evaluated', 'policy_allow', 'policy_deny', 'prompted_allow',
                    'prompted_deny', 'prompted_correct', 'prompted_cancel', 'prompted_abort'
                  )
                )
                OR
                (
                  disposition.disposition = 'semantic_terminal_v2'
                  AND disposition.semantic_outcome = 'already_applied'
                  AND disposition.existing_effect_id = effect.id
                  AND disposition.incoming_payload_fingerprint
                      = disposition.existing_payload_fingerprint
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

// The route-anchor predicate and result-shape branch below are copied literally
// from V12. Only the sibling default-Course identity/capability branch changes.
export const noEffectStatement = `CREATE TRIGGER IF NOT EXISTS learner_navigation_learning_command_no_effect_validate_v13
 BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
 ON learning_command_invocation
 WHEN OLD.status = 'admitted'
   AND NEW.command_name IN ('set_default_course_preference', 'set_course_route_anchor')
   AND NEW.status IN ('no_change', 'error')
 BEGIN
   SELECT RAISE(ABORT, 'learner_navigation_learning_command_no_effect_invalid')
   WHERE NOT (
        (NEW.command_name = 'set_default_course_preference'
          AND (
            (
              NEW.command_version = 1
              AND NEW.capability_identity = 'set_default_course_preference'
              AND NEW.capability_version = 1
              AND NEW.authorization_basis = 'learner_acceptance'
              AND EXISTS (
                SELECT 1
                FROM learner_default_course_disposition AS authorization
                WHERE authorization.invocation_part_id = NEW.part_id
                  AND authorization.disposition = 'legacy_v1'
                  AND authorization.authorization_kind = 'legacy_v1'
                  AND authorization.authorization_version = 1
              )
            )
            OR
            (
              NEW.command_version = 2
              AND NEW.capability_identity = 'set_default_course_preference'
              AND NEW.capability_version = 2
              AND (
                EXISTS (
                  SELECT 1
                  FROM learner_default_course_disposition AS authorization
                  JOIN learner_default_course_capability_settlement AS capability
                    ON capability.invocation_part_id = authorization.invocation_part_id
                  WHERE authorization.invocation_part_id = NEW.part_id
                    AND authorization.authorization_version = 2
                    AND authorization.disposition = 'candidate_v2'
                    AND NEW.authorization_basis = CASE authorization.authorization_kind
                      WHEN 'direct_request_v2' THEN 'learner_request'
                      ELSE 'learner_acceptance'
                    END
                    AND capability.authorization_fingerprint = authorization.authorization_fingerprint
                    AND (
                      (
                        NEW.status = 'no_change'
                        AND capability.outcome IN ('policy_allow', 'prompted_allow')
                      )
                      OR
                      (
                        NEW.status = 'error'
                        AND (
                          json_extract(NEW.settlement, '$.code') = 'semantic_conflict'
                          OR
                          (
                            capability.outcome IN ('policy_allow', 'prompted_allow')
                            AND json_extract(NEW.settlement, '$.code') IN (
                              'context_refresh_required', 'source_unavailable', 'outcome_unknown',
                              'stale', 'inactive', 'validation_error', 'interrupted'
                            )
                          )
                          OR
                          (
                            capability.outcome IN ('policy_deny', 'prompted_deny')
                            AND json_extract(NEW.settlement, '$.code') = 'permission_rejected'
                          )
                          OR
                          (
                            capability.outcome = 'prompted_correct'
                            AND json_extract(NEW.settlement, '$.code') = 'permission_corrected'
                          )
                          OR
                          (
                            capability.outcome = 'prompted_cancel'
                            AND json_extract(NEW.settlement, '$.code') = 'cancelled'
                          )
                          OR
                          (
                            capability.outcome IN ('not_evaluated', 'prompted_abort')
                            AND json_extract(NEW.settlement, '$.code') = 'interrupted'
                          )
                        )
                      )
                    )
                )
                OR
                (
                  NEW.status = 'error'
                  AND json_extract(NEW.settlement, '$.code') = 'semantic_conflict'
                  AND EXISTS (
                    SELECT 1
                    FROM learner_default_course_disposition AS disposition
                    WHERE disposition.invocation_part_id = NEW.part_id
                      AND disposition.disposition = 'semantic_terminal_v2'
                      AND disposition.semantic_outcome = 'semantic_conflict'
                      AND disposition.incoming_payload_fingerprint
                          <> disposition.existing_payload_fingerprint
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM learner_default_course_capability_issue
                    WHERE invocation_part_id = NEW.part_id
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM learner_default_course_capability_settlement
                    WHERE invocation_part_id = NEW.part_id
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM learner_default_course_acknowledgement
                    WHERE invocation_part_id = NEW.part_id
                  )
                )
              )
            )
          ))
        OR
        (NEW.command_name = 'set_course_route_anchor'
          AND NEW.command_version = 1
          AND NEW.capability_identity = 'set_course_route_anchor'
          AND NEW.capability_version = 1
          AND NEW.authorization_basis = 'learner_request')
      )
      OR (
        NEW.status = 'no_change'
        AND NOT COALESCE((
          (SELECT count(*) FROM json_each(NEW.settlement)) = 5
          AND json_type(NEW.settlement, '$.current') = 'object'
          AND (
            (
              NEW.command_name = 'set_default_course_preference'
              AND json_extract(NEW.settlement, '$.navigationKind')
                  = 'default_course_preference'
              AND json_extract(NEW.settlement, '$.current.kind')
                  = 'default_course_preference'
              AND json_type(NEW.settlement, '$.current.headID') IN ('text', 'null')
              AND json_type(NEW.settlement, '$.current.version') = 'integer'
              AND json_extract(NEW.settlement, '$.current.version') >= 0
              AND json_type(NEW.settlement, '$.current.courseID') IN ('text', 'null')
              AND json_type(NEW.settlement, '$.current.usability') = 'object'
            )
            OR (
              NEW.command_name = 'set_course_route_anchor'
              AND json_extract(NEW.settlement, '$.navigationKind') = 'course_route_anchor'
              AND json_extract(NEW.settlement, '$.current.kind') = 'course_route_anchor'
              AND json_type(NEW.settlement, '$.current.courseID') = 'text'
              AND json_type(NEW.settlement, '$.current.headID') IN ('text', 'null')
              AND json_type(NEW.settlement, '$.current.version') = 'integer'
              AND json_extract(NEW.settlement, '$.current.version') >= 0
              AND json_type(NEW.settlement, '$.current.target') IN ('object', 'null')
              AND json_type(NEW.settlement, '$.current.usability') = 'object'
            )
          )
        ), 0)
      )
      OR (
        NEW.status = 'error'
        AND (
          (SELECT count(*) FROM json_each(NEW.settlement)) <> 4
          OR json_type(NEW.settlement, '$.detail') IS NOT NULL
          OR NOT COALESCE(json_extract(NEW.settlement, '$.code') IN (
            'semantic_conflict', 'context_refresh_required', 'permission_rejected',
            'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
            'outcome_unknown', 'stale', 'inactive', 'validation_error'
          ), 0)
        )
      );
 END`

export const learningCommandStatements = [defaultCourseTerminalStatement, routeTerminal, noEffectStatement] as const
