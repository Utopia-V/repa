export const learningCommandStatements = [
  `CREATE TRIGGER IF NOT EXISTS learner_goal_state_validate_update_v12
   BEFORE UPDATE OF singleton, revision_sequence ON learner_goal_state
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_state_transition_invalid_v12')
     WHERE NEW.singleton <> OLD.singleton
        OR NEW.revision_sequence <= OLD.revision_sequence
        OR NOT EXISTS (
          SELECT 1
          FROM learner_goal_effect AS effect
          JOIN learner_goal_command AS command
            ON command.semantic_fingerprint = effect.semantic_fingerprint
           AND json(command.command_snapshot) = json(effect.command)
          JOIN learning_command_receipt AS receipt
            ON receipt.invocation_part_id = command.invocation_part_id
          JOIN learning_command_invocation AS invocation
            ON invocation.part_id = command.invocation_part_id
          WHERE NOT EXISTS (
              SELECT 1 FROM learner_goal_commit_seal AS seal
              WHERE seal.effect_id = effect.id
            )
            AND receipt.occurrence_id = effect.occurrence_id
            AND receipt.authorization_basis = effect.authorization_basis
            AND receipt.time_committed = effect.time_committed
            AND receipt.commit_order = effect.commit_order
            AND receipt.capability_identity = 'update_learner_goals'
            AND receipt.capability_version = 1
            AND invocation.status = 'admitted'
            AND invocation.command_name = 'update_learner_goals'
            AND invocation.command_version = 1
            AND invocation.capability_identity = receipt.capability_identity
            AND invocation.capability_version = receipt.capability_version
            AND invocation.authorization_basis = receipt.authorization_basis
            AND invocation.occurrence_id = effect.occurrence_id
            AND (SELECT count(*) FROM learner_goal_revision WHERE effect_id = effect.id)
                = NEW.revision_sequence - OLD.revision_sequence
            AND (SELECT min(revision_order) FROM learner_goal_revision WHERE effect_id = effect.id)
                = OLD.revision_sequence + 1
            AND (SELECT max(revision_order) FROM learner_goal_revision WHERE effect_id = effect.id)
                = NEW.revision_sequence
        )
        OR (SELECT count(*)
            FROM learner_goal_effect AS effect
            WHERE NOT EXISTS (
              SELECT 1 FROM learner_goal_commit_seal AS seal
              WHERE seal.effect_id = effect.id
            )) <> 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_validate_insert_v12
   BEFORE INSERT ON learner_goal_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_owner_invalid_v12')
     WHERE (SELECT count(*)
            FROM learner_goal_effect AS candidate
            WHERE NOT EXISTS (
              SELECT 1 FROM learner_goal_commit_seal AS existing
              WHERE existing.effect_id = candidate.id
            )) <> 1
        OR NOT EXISTS (
          SELECT 1
          FROM learner_goal_effect AS effect
          JOIN learner_goal_state AS state ON state.singleton = 1
          JOIN learner_goal_command AS command ON command.invocation_part_id = NEW.invocation_part_id
          JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
          JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
          WHERE effect.id = NEW.effect_id
            AND effect.commit_seal_id = effect.id
            AND command.semantic_fingerprint = effect.semantic_fingerprint
            AND json(command.command_snapshot) = json(effect.command)
            AND receipt.invocation_part_id = invocation.part_id
            AND receipt.occurrence_id = effect.occurrence_id
            AND receipt.capability_identity = invocation.capability_identity
            AND receipt.capability_version = invocation.capability_version
            AND receipt.authorization_basis = effect.authorization_basis
            AND receipt.time_committed = effect.time_committed
            AND receipt.commit_order = effect.commit_order
            AND invocation.status = 'admitted'
            AND invocation.command_name = 'update_learner_goals'
            AND invocation.command_version = 1
            AND invocation.capability_identity = 'update_learner_goals'
            AND invocation.capability_version = 1
            AND invocation.authorization_basis = effect.authorization_basis
            AND invocation.occurrence_id = effect.occurrence_id
            AND state.revision_sequence = (SELECT max(revision_order) FROM learner_goal_revision)
            AND ((effect.authorization_basis = 'learner_request'
                  AND command.permission_request_id IS NULL
                  AND command.confirmation_snapshot IS NULL)
              OR (effect.authorization_basis = 'learner_acceptance'
                  AND command.permission_request_id IS NOT NULL
                  AND command.confirmation_snapshot IS NOT NULL
                  AND json_extract(command.confirmation_snapshot, '$.semanticFingerprint')
                      = effect.semantic_fingerprint
                  AND json(json_extract(command.confirmation_snapshot, '$.command')) = json(effect.command)))
        );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_batch_invalid_v12')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       WHERE effect.id = NEW.effect_id
         AND (SELECT count(*) FROM learner_goal_effect_operation WHERE effect_id = effect.id)
             = effect.operation_count
         AND (SELECT count(*) FROM learner_goal_effect_operation
              WHERE effect_id = effect.id AND result_kind = 'changed') = effect.change_count
         AND NOT EXISTS (
           SELECT 1
           FROM learner_goal_effect_operation AS operation
           WHERE operation.effect_id = effect.id
             AND (operation.ordinal < 0
               OR operation.ordinal >= effect.operation_count
               OR json_extract(effect.command, '$.operations[' || operation.ordinal || '].type')
                    <> operation.operation_kind)
         )
         AND NOT EXISTS (
           SELECT 1
           FROM learner_goal_revision AS revision
           WHERE revision.effect_id = effect.id
             AND NOT EXISTS (
               SELECT 1
               FROM learner_goal_effect_operation AS operation
               WHERE operation.effect_id = effect.id
                 AND operation.ordinal = revision.operation_ordinal
                 AND ((revision.revision_role = 'source'
                       AND operation.result_kind = 'changed'
                       AND operation.goal_id = revision.goal_id
                       AND operation.revision_id = revision.id
                       AND operation.version = revision.version
                       AND operation.disposition = revision.disposition)
                   OR (revision.revision_role = 'target'
                       AND operation.operation_kind = 'replace'
                       AND operation.replacement_target_kind = 'new'
                       AND operation.replacement_target_goal_id = revision.goal_id
                       AND operation.replacement_target_revision_id = revision.id
                       AND operation.replacement_target_version = revision.version))
             )
         )
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_learning_command_terminal_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'update_learner_goals'
     AND NEW.status IN ('applied', 'already_applied')
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_learning_command_terminal_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'update_learner_goals'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis NOT IN ('learner_request', 'learner_acceptance')
        OR json_extract(NEW.settlement, '$.goalKind') IS NOT 'learner_goal'
        OR (SELECT count(*) FROM json_each(NEW.settlement))
             <> 11
                + CASE WHEN NEW.authorization_basis = 'learner_acceptance' THEN 1 ELSE 0 END
                + CASE WHEN NEW.status = 'already_applied' THEN 1 ELSE 0 END
        OR (NEW.status = 'already_applied'
            AND json_type(NEW.settlement, '$.currentHeads') IS NOT 'array')
        OR json_extract(NEW.settlement, '$.receiptID') IS NOT NEW.receipt_id
        OR json_extract(NEW.settlement, '$.authorizationBasis') IS NOT NEW.authorization_basis
        OR NOT EXISTS (
          SELECT 1
          FROM learner_goal_commit_seal AS seal
          JOIN learner_goal_effect AS effect ON effect.id = seal.effect_id
          JOIN learner_goal_command AS command ON command.invocation_part_id = NEW.part_id
          JOIN learner_goal_command AS original_command ON original_command.invocation_part_id = seal.invocation_part_id
          JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
          WHERE seal.receipt_id = NEW.receipt_id
            AND seal.effect_id = json_extract(NEW.settlement, '$.effectID')
            AND effect.occurrence_id = NEW.occurrence_id
            AND effect.authorization_basis = NEW.authorization_basis
            AND command.semantic_fingerprint = effect.semantic_fingerprint
            AND json(command.command_snapshot) = json(effect.command)
            AND original_command.semantic_fingerprint = effect.semantic_fingerprint
            AND json(original_command.command_snapshot) = json(effect.command)
            AND receipt.occurrence_id = NEW.occurrence_id
            AND receipt.capability_identity = NEW.capability_identity
            AND receipt.capability_version = NEW.capability_version
            AND receipt.authorization_basis = NEW.authorization_basis
            AND receipt.time_committed = effect.time_committed
            AND receipt.commit_order = effect.commit_order
            AND json_extract(NEW.settlement, '$.frontierSequence') = effect.frontier_sequence
            AND json_extract(NEW.settlement, '$.acknowledgementTitle') = effect.acknowledgement_title
            AND json_extract(NEW.settlement, '$.acknowledgementBody') = effect.acknowledgement_body
            AND json_array_length(NEW.settlement, '$.operations') = effect.operation_count
            AND NOT EXISTS (
              SELECT 1
              FROM json_each(NEW.settlement, '$.operations') AS settled
              LEFT JOIN learner_goal_effect_operation AS operation
                ON operation.effect_id = effect.id AND operation.ordinal = CAST(settled.key AS INTEGER)
              WHERE operation.effect_id IS NULL
                 OR (SELECT count(*) FROM json_each(settled.value))
                      <> CASE
                           WHEN json_type(settled.value, '$.replacementTarget') = 'object' THEN 9
                           ELSE 8
                         END
                 OR json_extract(settled.value, '$.ordinal') IS NOT operation.ordinal
                 OR json_extract(settled.value, '$.operation') IS NOT operation.operation_kind
                 OR json_extract(settled.value, '$.result') IS NOT operation.result_kind
                 OR json_extract(settled.value, '$.goalID') IS NOT operation.goal_id
                 OR json_extract(settled.value, '$.revisionID') IS NOT operation.revision_id
                 OR json_extract(settled.value, '$.version') IS NOT operation.version
                 OR json_extract(settled.value, '$.disposition') IS NOT operation.disposition
                 OR json(json_extract(settled.value, '$.meaning')) <> json(operation.meaning)
                 OR json_extract(settled.value, '$.replacementTarget.type') IS NOT operation.replacement_target_kind
                 OR json_extract(settled.value, '$.replacementTarget.goalID') IS NOT operation.replacement_target_goal_id
                 OR json_extract(settled.value, '$.replacementTarget.revisionID') IS NOT operation.replacement_target_revision_id
                 OR json_extract(settled.value, '$.replacementTarget.version') IS NOT operation.replacement_target_version
            )
            AND ((effect.authorization_basis = 'learner_request'
                  AND original_command.permission_request_id IS NULL
                  AND original_command.confirmation_snapshot IS NULL
                  AND json_extract(NEW.settlement, '$.confirmationRequestID') IS NULL)
              OR (effect.authorization_basis = 'learner_acceptance'
                  AND original_command.permission_request_id IS NOT NULL
                  AND original_command.confirmation_snapshot IS NOT NULL
                  AND json_extract(NEW.settlement, '$.confirmationRequestID')
                      = original_command.permission_request_id
                  AND json_extract(original_command.confirmation_snapshot, '$.semanticFingerprint')
                      = effect.semantic_fingerprint
                  AND json(json_extract(original_command.confirmation_snapshot, '$.command')) = json(effect.command)))
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
  `CREATE TRIGGER IF NOT EXISTS learner_goal_learning_command_no_effect_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'update_learner_goals'
     AND NEW.status IN ('no_change', 'error')
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_learning_command_no_effect_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'update_learner_goals'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis NOT IN ('learner_request', 'learner_acceptance')
        OR (
          NEW.status = 'no_change'
          AND NOT COALESCE((
            (SELECT count(*) FROM json_each(NEW.settlement)) = 7
            AND json_extract(NEW.settlement, '$.goalKind') = 'learner_goal'
            AND json_type(NEW.settlement, '$.operations') = 'array'
            AND json_array_length(NEW.settlement, '$.operations') BETWEEN 1 AND 8
            AND json_type(NEW.settlement, '$.acknowledgementTitle') = 'text'
            AND length(json_extract(NEW.settlement, '$.acknowledgementTitle')) > 0
            AND json_type(NEW.settlement, '$.acknowledgementBody') = 'text'
            AND length(json_extract(NEW.settlement, '$.acknowledgementBody')) > 0
            AND NOT EXISTS (
              SELECT 1
              FROM json_each(NEW.settlement, '$.operations') AS operation
              WHERE json_type(operation.value) IS NOT 'object'
                 OR (SELECT count(*) FROM json_each(operation.value))
                      <> CASE
                           WHEN json_type(operation.value, '$.replacementTarget') = 'object' THEN 9
                           ELSE 8
                         END
                 OR json_extract(operation.value, '$.ordinal') IS NOT CAST(operation.key AS INTEGER)
                 OR NOT COALESCE(json_extract(operation.value, '$.operation')
                      IN ('create', 'update', 'replace'), 0)
                 OR json_extract(operation.value, '$.result') IS NOT 'no_change'
                 OR json_type(operation.value, '$.goalID') IS NOT 'text'
                 OR json_type(operation.value, '$.revisionID') IS NOT 'text'
                 OR json_type(operation.value, '$.version') IS NOT 'integer'
                 OR json_extract(operation.value, '$.version') < 1
                 OR NOT COALESCE(json_extract(operation.value, '$.disposition')
                      IN ('active', 'achieved', 'abandoned', 'superseded'), 0)
                 OR json_type(operation.value, '$.meaning') IS NOT 'object'
            )
          ), 0)
        )
        OR (
          NEW.status = 'error'
          AND NOT COALESCE((
            json_extract(NEW.settlement, '$.code') IN (
              'semantic_conflict', 'context_refresh_required', 'permission_rejected',
              'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
              'temporal_context_unavailable', 'capacity_exceeded', 'outcome_unknown',
              'stale', 'inactive', 'validation_error'
            )
            AND (
              (
                json_type(NEW.settlement, '$.detail') IS NULL
                AND (SELECT count(*) FROM json_each(NEW.settlement)) = 4
              )
              OR (
                json_extract(NEW.settlement, '$.code') = 'semantic_conflict'
                AND json_type(NEW.settlement, '$.detail') = 'object'
                AND (SELECT count(*) FROM json_each(NEW.settlement)) = 5
                AND (SELECT count(*) FROM json_each(NEW.settlement, '$.detail')) = 1
                AND json_type(NEW.settlement, '$.detail.effectID') = 'text'
              )
            )
          ), 0)
        );
   END`,
] as const
