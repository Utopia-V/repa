export const learningCommandStatements = [
  `CREATE TRIGGER IF NOT EXISTS retained_steering_state_validate_update_v12
   BEFORE UPDATE OF singleton, steering_revision, latest_cut_as_of ON retained_steering_state
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_state_transition_invalid_v12')
     WHERE NEW.singleton <> OLD.singleton
        OR NEW.latest_cut_as_of < OLD.latest_cut_as_of
        OR NOT (
          (
            NEW.steering_revision = OLD.steering_revision + 1
            AND NEW.latest_cut_as_of = OLD.latest_cut_as_of
            AND EXISTS (
              SELECT 1
              FROM retained_steering_transition AS effect
              JOIN retained_steering_command AS command
                ON command.semantic_fingerprint = effect.semantic_fingerprint
              JOIN learning_command_receipt AS receipt
                ON receipt.invocation_part_id = command.invocation_part_id
              JOIN learning_command_invocation AS invocation
                ON invocation.part_id = command.invocation_part_id
              WHERE effect.steering_revision = NEW.steering_revision
                AND NOT EXISTS (
                  SELECT 1 FROM retained_steering_commit_seal AS seal
                  WHERE seal.transition_id = effect.id
                )
                AND receipt.occurrence_id = effect.occurrence_id
                AND receipt.time_committed = effect.time_committed
                AND receipt.commit_order = effect.commit_order
                AND receipt.capability_identity = 'update_retained_learning_steering'
                AND receipt.capability_version = 1
                AND receipt.authorization_basis = 'learner_request'
                AND invocation.status = 'admitted'
                AND invocation.command_name = 'update_retained_learning_steering'
                AND invocation.command_version = 1
                AND invocation.capability_identity = receipt.capability_identity
                AND invocation.capability_version = receipt.capability_version
                AND invocation.authorization_basis = receipt.authorization_basis
                AND invocation.occurrence_id = effect.occurrence_id
            )
          )
          OR (
            NEW.steering_revision = OLD.steering_revision
            AND NEW.latest_cut_as_of >= OLD.latest_cut_as_of
            AND EXISTS (
              SELECT 1 FROM turn_model_operation
              WHERE retained_steering_cut_as_of = NEW.latest_cut_as_of
                AND json_extract(retained_steering_cut, '$.throughSteeringRevision') = NEW.steering_revision
            )
          )
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_commit_seal_validate_insert_v12
   BEFORE INSERT ON retained_steering_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_commit_seal_invalid_v12')
     WHERE NOT EXISTS (
       SELECT 1
       FROM retained_steering_transition AS effect
       JOIN retained_steering_state AS state ON state.singleton = 1
       JOIN retained_steering_command AS command ON command.invocation_part_id = NEW.invocation_part_id
       JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE effect.id = NEW.transition_id
         AND effect.commit_seal_id = effect.id
         AND state.steering_revision = effect.steering_revision
         AND command.semantic_fingerprint = effect.semantic_fingerprint
         AND receipt.invocation_part_id = invocation.part_id
         AND receipt.occurrence_id = effect.occurrence_id
         AND receipt.capability_identity = invocation.capability_identity
         AND receipt.capability_version = invocation.capability_version
         AND receipt.authorization_basis = invocation.authorization_basis
         AND receipt.time_committed = effect.time_committed
         AND receipt.commit_order = effect.commit_order
         AND invocation.status = 'admitted'
         AND invocation.command_name = 'update_retained_learning_steering'
         AND invocation.command_version = 1
         AND invocation.capability_identity = 'update_retained_learning_steering'
         AND invocation.capability_version = 1
         AND invocation.authorization_basis = 'learner_request'
         AND invocation.occurrence_id = effect.occurrence_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_learning_command_terminal_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'update_retained_learning_steering'
     AND NEW.status IN ('applied', 'already_applied')
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_learning_command_terminal_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'update_retained_learning_steering'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis <> 'learner_request'
        OR (SELECT count(*) FROM json_each(NEW.settlement)) <> 10
        OR json_extract(NEW.settlement, '$.receiptID') IS NOT NEW.receipt_id
        OR NOT EXISTS (
          SELECT 1
          FROM retained_steering_commit_seal AS seal
          JOIN retained_steering_transition AS effect ON effect.id = seal.transition_id
          JOIN retained_steering_command AS command ON command.invocation_part_id = NEW.part_id
          JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
          WHERE seal.receipt_id = NEW.receipt_id
            AND seal.transition_id = json_extract(NEW.settlement, '$.effectID')
            AND effect.occurrence_id = NEW.occurrence_id
            AND command.semantic_fingerprint = effect.semantic_fingerprint
            AND receipt.occurrence_id = NEW.occurrence_id
            AND receipt.capability_identity = NEW.capability_identity
            AND receipt.capability_version = NEW.capability_version
            AND receipt.authorization_basis = NEW.authorization_basis
            AND receipt.time_committed = effect.time_committed
            AND receipt.commit_order = effect.commit_order
            AND json_extract(NEW.settlement, '$.policyID') = effect.policy_id
            AND json_extract(NEW.settlement, '$.version') = effect.version
            AND json_extract(NEW.settlement, '$.state') = effect.state
            AND json_extract(NEW.settlement, '$.acknowledgementTitle') = effect.acknowledgement_title
            AND json_extract(NEW.settlement, '$.acknowledgementBody') = effect.acknowledgement_body
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
  `CREATE TRIGGER IF NOT EXISTS retained_steering_learning_command_no_effect_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'update_retained_learning_steering'
     AND NEW.status IN ('no_change', 'error')
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_learning_command_no_effect_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'update_retained_learning_steering'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis <> 'learner_request'
        OR (
          NEW.status = 'no_change'
          AND NOT COALESCE((
            (SELECT count(*) FROM json_each(NEW.settlement)) = 9
            AND json_extract(NEW.settlement, '$.steeringKind') = 'retained_steering'
            AND json_type(NEW.settlement, '$.policyID') = 'text'
            AND json_type(NEW.settlement, '$.version') = 'integer'
            AND json_extract(NEW.settlement, '$.version') >= 1
            AND json_extract(NEW.settlement, '$.state') IN ('operative', 'retracted')
            AND json_type(NEW.settlement, '$.acknowledgementTitle') = 'text'
            AND length(json_extract(NEW.settlement, '$.acknowledgementTitle')) > 0
            AND json_type(NEW.settlement, '$.acknowledgementBody') = 'text'
            AND length(json_extract(NEW.settlement, '$.acknowledgementBody')) > 0
          ), 0)
        )
        OR (
          NEW.status = 'error'
          AND NOT COALESCE((
            json_extract(NEW.settlement, '$.code') IN (
              'semantic_conflict', 'context_refresh_required', 'permission_rejected',
              'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
              'temporal_context_unavailable', 'capacity_exceeded', 'outcome_unknown',
              'stale', 'validation_error'
            )
            AND (
              (
                json_extract(NEW.settlement, '$.code') <> 'semantic_conflict'
                AND json_type(NEW.settlement, '$.detail') IS NULL
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
