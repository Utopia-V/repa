import { representationFailureCodeSQLV12 } from "./learning-command-failure-code-v12"

export const learningCommandStatements = [
  `CREATE TRIGGER IF NOT EXISTS representation_learning_command_terminal_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'representation.convert'
     AND NEW.status IN ('applied', 'already_applied')
   BEGIN
     SELECT RAISE(ABORT, 'representation_learning_command_terminal_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'representation.convert'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis <> 'learner_request'
        OR (SELECT count(*) FROM json_each(NEW.settlement)) <> 9
        OR json_extract(NEW.settlement, '$.receiptID') IS NOT NEW.receipt_id
        OR NOT EXISTS (
          SELECT 1
          FROM representation_command_commit_seal AS seal
          JOIN representation_effect AS effect ON effect.id = seal.effect_id
          JOIN representation_revision AS revision ON revision.effect_id = effect.id
          JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
          WHERE seal.receipt_id = NEW.receipt_id
            AND seal.effect_id = json_extract(NEW.settlement, '$.effectID')
            AND revision.id = json_extract(NEW.settlement, '$.representationRevisionID')
            AND revision.effective_artifact_id = json_extract(NEW.settlement, '$.effectiveArtifactID')
            AND revision.source_revision_id = json_extract(NEW.settlement, '$.sourceRevisionID')
            AND revision.producer_kind = json_extract(NEW.settlement, '$.producerKind')
            AND revision.creation_basis = 'learning_command'
            AND revision.delivery_mode = 'model_tool'
            AND revision.authorization_basis = NEW.authorization_basis
            AND revision.causal_occurrence_id = NEW.occurrence_id
            AND effect.operation_identity = revision.creation_identity
            AND effect.time_committed = revision.time_accepted
            AND receipt.occurrence_id = NEW.occurrence_id
            AND receipt.capability_identity = NEW.capability_identity
            AND receipt.capability_version = NEW.capability_version
            AND receipt.authorization_basis = NEW.authorization_basis
            AND receipt.time_committed >= revision.time_accepted
            AND ((NEW.status = 'applied'
                  AND seal.invocation_part_id = NEW.part_id
                  AND receipt.invocation_part_id = NEW.part_id
                  AND revision.causal_invocation_part_id = NEW.part_id
                  AND NEW.time_settled = receipt.time_committed
                  AND NEW.settlement_order = receipt.commit_order)
              OR (NEW.status = 'already_applied'
                  AND seal.invocation_part_id = receipt.invocation_part_id
                  AND revision.causal_invocation_part_id = seal.invocation_part_id
                  AND NEW.time_settled >= revision.time_accepted))
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS representation_learning_command_no_effect_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND NEW.command_name = 'representation.convert'
     AND NEW.status IN ('no_change', 'error')
   BEGIN
     SELECT RAISE(ABORT, 'representation_learning_command_no_effect_invalid')
     WHERE NEW.command_version <> 1
        OR NEW.capability_identity <> 'representation.convert'
        OR NEW.capability_version <> 1
        OR NEW.authorization_basis <> 'learner_request'
        OR NEW.status = 'no_change'
        OR (SELECT count(*) FROM json_each(NEW.settlement)) <> 4
        OR json_type(NEW.settlement, '$.detail') IS NOT NULL
        OR NOT COALESCE(json_extract(NEW.settlement, '$.code') IN (
          ${representationFailureCodeSQLV12}
        ), 0);
   END`,
] as const
