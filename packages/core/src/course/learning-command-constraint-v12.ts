export const learningCommandStatements = [
  `CREATE TRIGGER IF NOT EXISTS course_learning_command_terminal_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'accept_course_view_revision'
     AND NEW.status IN ('applied', 'already_applied')
   BEGIN
     SELECT RAISE(ABORT, 'course_learning_command_terminal_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'accept_course_view_revision'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis NOT IN ('learner_request', 'learner_acceptance')
        OR (SELECT count(*) FROM json_each(NEW.settlement))
             <> CASE NEW.status WHEN 'applied' THEN 9 ELSE 11 END
        OR json_extract(NEW.settlement, '$.receiptID') IS NOT NEW.receipt_id
        OR (NEW.status = 'already_applied'
            AND (json_type(NEW.settlement, '$.currentSelection') IS NOT 'object'
              OR NOT COALESCE(json_extract(NEW.settlement, '$.relation') IN ('active', 'superseded'), 0)))
        OR NOT EXISTS (
          SELECT 1
          FROM course_selection_acceptance_commit_seal AS seal
          JOIN course_selection_acceptance_effect AS effect ON effect.id = seal.effect_id
          JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
          WHERE seal.receipt_id = NEW.receipt_id
            AND seal.effect_id = json_extract(NEW.settlement, '$.effectID')
            AND effect.occurrence_id = NEW.occurrence_id
            AND receipt.occurrence_id = NEW.occurrence_id
            AND receipt.capability_identity = NEW.capability_identity
            AND receipt.capability_version = NEW.capability_version
            AND receipt.authorization_basis = NEW.authorization_basis
            AND receipt.time_committed = effect.time_committed
            AND json_extract(NEW.settlement, '$.courseID') = effect.course_id
            AND json_extract(NEW.settlement, '$.revisionID') = effect.accepted_revision_id
            AND json_extract(NEW.settlement, '$.previousSelection.revisionID') IS effect.previous_revision_id
            AND json_extract(NEW.settlement, '$.previousSelection.version') = effect.previous_selection_version
            AND json_extract(NEW.settlement, '$.committedSelection.revisionID') = effect.accepted_revision_id
            AND json_extract(NEW.settlement, '$.committedSelection.version') = effect.committed_selection_version
            AND ((NEW.status = 'applied'
                  AND seal.invocation_part_id = NEW.part_id
                  AND receipt.invocation_part_id = NEW.part_id
                  AND NEW.time_settled = effect.time_committed
                  AND NEW.settlement_order = receipt.commit_order)
              OR (NEW.status = 'already_applied'
                  AND seal.invocation_part_id = receipt.invocation_part_id
                  AND NEW.time_settled >= effect.time_committed))
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS course_learning_command_no_effect_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'accept_course_view_revision'
     AND NEW.status IN ('no_change', 'error')
   BEGIN
     SELECT RAISE(ABORT, 'course_learning_command_no_effect_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'accept_course_view_revision'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis NOT IN ('learner_request', 'learner_acceptance')
        OR NEW.status = 'no_change'
        OR NOT COALESCE(json_extract(NEW.settlement, '$.code') IN (
          'semantic_conflict', 'context_refresh_required', 'permission_rejected',
          'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
          'outcome_unknown', 'stale', 'inactive', 'validation_error'
        ), 0)
        OR (SELECT count(*) FROM json_each(NEW.settlement))
             <> CASE WHEN json_type(NEW.settlement, '$.detail') = 'object' THEN 5 ELSE 4 END
        OR NOT (
          json_type(NEW.settlement, '$.detail') IS NULL
          OR (
            json_type(NEW.settlement, '$.detail') = 'object'
            AND NOT EXISTS (
              SELECT 1
              FROM json_each(NEW.settlement, '$.detail') AS detail
              WHERE detail.key NOT IN ('entity', 'id', 'effectID', 'acceptedRevisionID')
                 OR detail.type <> 'text'
                 OR (detail.key = 'entity'
                     AND detail.value NOT IN ('course', 'view', 'revision', 'selection'))
            )
          )
        );
   END`,
] as const
