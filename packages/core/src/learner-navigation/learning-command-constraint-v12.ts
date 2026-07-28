export const learningCommandStatements = [
  `CREATE TRIGGER IF NOT EXISTS default_course_learning_command_terminal_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'set_default_course_preference'
     AND NEW.status IN ('applied', 'already_applied')
   BEGIN
     SELECT RAISE(ABORT, 'default_course_learning_command_terminal_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'set_default_course_preference'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis <> 'learner_acceptance'
        OR json_extract(NEW.settlement, '$.navigationKind') IS NOT 'default_course_preference'
        OR (SELECT count(*) FROM json_each(NEW.settlement))
             <> CASE NEW.status WHEN 'applied' THEN 9 ELSE 10 END
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
          FROM learner_default_course_commit_seal AS seal
          JOIN learner_default_course_transition AS effect ON effect.id = seal.effect_id
          JOIN learner_default_course_command AS effect_command
            ON effect_command.invocation_part_id = seal.invocation_part_id
          JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
          WHERE seal.receipt_id = NEW.receipt_id
            AND seal.effect_id = json_extract(NEW.settlement, '$.effectID')
            AND effect.occurrence_id = NEW.occurrence_id
            AND effect.permission_request_id = effect_command.permission_request_id
            AND EXISTS (
              SELECT 1 FROM learner_default_course_command AS command
              WHERE command.invocation_part_id = NEW.part_id
            )
            AND json(effect.confirmation_snapshot) = json(json_extract(NEW.settlement, '$.confirmation'))
            AND json_extract(NEW.settlement, '$.effect.id') = effect.id
            AND json_extract(NEW.settlement, '$.effect.occurrenceID') = effect.occurrence_id
            AND json_extract(NEW.settlement, '$.effect.previousCourseID') IS effect.previous_course_id
            AND json_extract(NEW.settlement, '$.effect.courseID') IS effect.course_id
            AND json_extract(NEW.settlement, '$.effect.previousVersion') = effect.version - 1
            AND json_extract(NEW.settlement, '$.effect.version') = effect.version
            AND json_extract(NEW.settlement, '$.effect.timeCommitted') = effect.time_committed
            AND json_extract(NEW.settlement, '$.effect.commitOrder') = effect.commit_order
            AND json_extract(NEW.settlement, '$.effect.frontierSequence') = effect.frontier_sequence
            AND receipt.occurrence_id = NEW.occurrence_id
            AND receipt.capability_identity = NEW.capability_identity
            AND receipt.capability_version = NEW.capability_version
            AND receipt.authorization_basis = NEW.authorization_basis
            AND receipt.time_committed = effect.time_committed
            AND receipt.commit_order = effect.commit_order
            AND ((NEW.status = 'applied'
                  AND seal.invocation_part_id = NEW.part_id
                  AND receipt.invocation_part_id = NEW.part_id
                  AND NEW.time_settled = effect.time_committed
                  AND NEW.settlement_order = effect.commit_order)
              OR (NEW.status = 'already_applied'
                  AND seal.invocation_part_id = receipt.invocation_part_id
                  AND NEW.time_settled >= effect.time_committed))
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS course_route_anchor_learning_command_terminal_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'set_course_route_anchor'
     AND NEW.status IN ('applied', 'already_applied')
   BEGIN
     SELECT RAISE(ABORT, 'course_route_anchor_learning_command_terminal_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'set_course_route_anchor'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis <> 'learner_request'
        OR json_extract(NEW.settlement, '$.navigationKind') IS NOT 'course_route_anchor'
        OR (SELECT count(*) FROM json_each(NEW.settlement))
             <> CASE NEW.status WHEN 'applied' THEN 8 ELSE 9 END
        OR json_type(NEW.settlement, '$.current') IS NOT 'object'
        OR json_extract(NEW.settlement, '$.current.kind') IS NOT 'course_route_anchor'
        OR json_type(NEW.settlement, '$.current.courseID') IS NOT 'text'
        OR NOT COALESCE(json_type(NEW.settlement, '$.current.headID') IN ('text', 'null'), 0)
        OR json_type(NEW.settlement, '$.current.version') IS NOT 'integer'
        OR json_extract(NEW.settlement, '$.current.version') < 0
        OR NOT COALESCE(json_type(NEW.settlement, '$.current.target') IN ('object', 'null'), 0)
        OR json_type(NEW.settlement, '$.current.usability') IS NOT 'object'
        OR (NEW.status = 'already_applied'
            AND NOT COALESCE(json_extract(NEW.settlement, '$.relation') IN ('active', 'superseded'), 0))
        OR json_extract(NEW.settlement, '$.receiptID') IS NOT NEW.receipt_id
        OR NOT EXISTS (
          SELECT 1
          FROM learner_course_route_anchor_commit_seal AS seal
          JOIN learner_course_route_anchor_transition AS effect ON effect.id = seal.effect_id
          JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
          WHERE seal.receipt_id = NEW.receipt_id
            AND seal.effect_id = json_extract(NEW.settlement, '$.effectID')
            AND effect.occurrence_id = NEW.occurrence_id
            AND json_extract(NEW.settlement, '$.effect.id') = effect.id
            AND json_extract(NEW.settlement, '$.effect.occurrenceID') = effect.occurrence_id
            AND json_extract(NEW.settlement, '$.effect.courseID') = effect.course_id
            AND json_extract(NEW.settlement, '$.effect.previousVersion') = effect.version - 1
            AND json_extract(NEW.settlement, '$.effect.version') = effect.version
            AND json_extract(NEW.settlement, '$.effect.timeCommitted') = effect.time_committed
            AND json_extract(NEW.settlement, '$.effect.commitOrder') = effect.commit_order
            AND json_extract(NEW.settlement, '$.effect.frontierSequence') = effect.frontier_sequence
            AND receipt.occurrence_id = NEW.occurrence_id
            AND receipt.capability_identity = NEW.capability_identity
            AND receipt.capability_version = NEW.capability_version
            AND receipt.authorization_basis = NEW.authorization_basis
            AND receipt.time_committed = effect.time_committed
            AND receipt.commit_order = effect.commit_order
            AND ((NEW.status = 'applied'
                  AND seal.invocation_part_id = NEW.part_id
                  AND receipt.invocation_part_id = NEW.part_id
                  AND NEW.time_settled = effect.time_committed
                  AND NEW.settlement_order = effect.commit_order)
              OR (NEW.status = 'already_applied'
                  AND seal.invocation_part_id = receipt.invocation_part_id
                  AND NEW.time_settled >= effect.time_committed))
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_navigation_learning_command_no_effect_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name IN ('set_default_course_preference', 'set_course_route_anchor')
     AND NEW.status IN ('no_change', 'error')
   BEGIN
     SELECT RAISE(ABORT, 'learner_navigation_learning_command_no_effect_invalid')
     WHERE NOT (
          (NEW.command_name = 'set_default_course_preference'
            AND NEW.command_version = 1
            AND NEW.capability_identity = 'set_default_course_preference'
            AND NEW.capability_version = 1
            AND NEW.authorization_basis = 'learner_acceptance')
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
   END`,
] as const
