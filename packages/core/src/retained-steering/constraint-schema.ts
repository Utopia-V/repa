export * as RetainedSteeringConstraintSchema from "./constraint-schema"

import { Effect } from "effect"
import type { Database } from "../database/database"
import {
  MAX_INSTRUCTION_BYTES,
  MAX_REASON_BYTES,
  MAX_SOURCE_EXCERPT_BYTES,
} from "./schema"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const retainedSettlementBody = `BEGIN
     SELECT RAISE(ABORT, 'retained_steering_invocation_settlement_invalid')
     WHERE NOT COALESCE(
       json_valid(NEW.settlement)
       AND json_type(NEW.settlement, '$.settlementTime') = 'integer'
       AND json_extract(NEW.settlement, '$.settlementTime') = NEW.time_settled
       AND json_type(NEW.settlement, '$.settlementOrder') = 'integer'
       AND json_extract(NEW.settlement, '$.settlementOrder') = NEW.settlement_order
       AND (
         (
           NEW.status IN ('applied', 'already_applied')
           AND json_extract(NEW.settlement, '$.outcome') = NEW.status
           AND (SELECT count(*) FROM json_each(NEW.settlement)) = 10
           AND json_type(NEW.settlement, '$.receiptID') = 'text'
           AND json_type(NEW.settlement, '$.effectID') = 'text'
           AND json_type(NEW.settlement, '$.policyID') = 'text'
           AND json_type(NEW.settlement, '$.version') = 'integer'
           AND json_extract(NEW.settlement, '$.version') >= 1
           AND json_extract(NEW.settlement, '$.state') IN ('operative', 'retracted')
           AND json_type(NEW.settlement, '$.acknowledgementTitle') = 'text'
           AND length(json_extract(NEW.settlement, '$.acknowledgementTitle')) > 0
           AND json_type(NEW.settlement, '$.acknowledgementBody') = 'text'
           AND length(json_extract(NEW.settlement, '$.acknowledgementBody')) > 0
         )
         OR (
           NEW.status = 'no_change'
           AND json_extract(NEW.settlement, '$.outcome') = 'no_change'
           AND json_extract(NEW.settlement, '$.steeringKind') = 'retained_steering'
           AND (SELECT count(*) FROM json_each(NEW.settlement)) = 9
           AND json_type(NEW.settlement, '$.policyID') = 'text'
           AND json_type(NEW.settlement, '$.version') = 'integer'
           AND json_extract(NEW.settlement, '$.version') >= 1
           AND json_extract(NEW.settlement, '$.state') IN ('operative', 'retracted')
           AND json_type(NEW.settlement, '$.acknowledgementTitle') = 'text'
           AND length(json_extract(NEW.settlement, '$.acknowledgementTitle')) > 0
           AND json_type(NEW.settlement, '$.acknowledgementBody') = 'text'
           AND length(json_extract(NEW.settlement, '$.acknowledgementBody')) > 0
         )
         OR (
           NEW.status = 'error'
           AND json_extract(NEW.settlement, '$.outcome') = 'error'
           AND json_extract(NEW.settlement, '$.code') IN (
             'semantic_conflict', 'context_refresh_required', 'permission_rejected', 'permission_corrected',
             'cancelled', 'interrupted', 'source_unavailable', 'temporal_context_unavailable',
             'capacity_exceeded', 'outcome_unknown', 'stale', 'validation_error'
           )
           AND (
              (json_extract(NEW.settlement, '$.code') <> 'semantic_conflict'
                AND json_type(NEW.settlement, '$.detail') IS NULL
                AND (SELECT count(*) FROM json_each(NEW.settlement)) = 4)
             OR (
               json_extract(NEW.settlement, '$.code') = 'semantic_conflict'
               AND json_type(NEW.settlement, '$.detail') = 'object'
               AND (SELECT count(*) FROM json_each(NEW.settlement)) = 5
               AND (SELECT count(*) FROM json_each(NEW.settlement, '$.detail')) = 1
               AND json_type(NEW.settlement, '$.detail.effectID') = 'text'
             )
           )
         )
       ),
       0
     );
     SELECT RAISE(ABORT, 'retained_steering_invocation_effect_invalid')
     WHERE NEW.status IN ('applied', 'already_applied')
       AND NOT EXISTS (
         SELECT 1
         FROM retained_steering_transition AS transition
         JOIN learning_command_receipt AS receipt
           ON receipt.retained_steering_effect_id = transition.id
         JOIN learning_command_invocation AS committed
           ON committed.part_id = receipt.invocation_part_id
         WHERE transition.id = NEW.retained_steering_effect_id
           AND transition.id = json_extract(NEW.settlement, '$.effectID')
           AND transition.occurrence_id = NEW.occurrence_id
            AND transition.semantic_fingerprint = NEW.retained_steering_semantic_fingerprint
            AND transition.policy_id = json_extract(NEW.settlement, '$.policyID')
            AND transition.version = json_extract(NEW.settlement, '$.version')
            AND transition.state = json_extract(NEW.settlement, '$.state')
            AND transition.acknowledgement_title = json_extract(NEW.settlement, '$.acknowledgementTitle')
            AND transition.acknowledgement_body = json_extract(NEW.settlement, '$.acknowledgementBody')
           AND receipt.id = json_extract(NEW.settlement, '$.receiptID')
           AND receipt.occurrence_id = transition.occurrence_id
           AND (
             committed.status = 'applied'
             OR (NEW.status = 'applied' AND committed.part_id = NEW.part_id)
           )
           AND (
             committed.retained_steering_effect_id = transition.id
             OR (NEW.status = 'applied' AND committed.part_id = NEW.part_id
               AND NEW.retained_steering_effect_id = transition.id)
           )
           AND committed.authorization_basis = 'learner_request'
           AND (NEW.status = 'already_applied' OR receipt.invocation_part_id = NEW.part_id)
           AND (
             NEW.status = 'already_applied'
             OR (
               transition.time_committed = NEW.time_settled
               AND transition.commit_order = NEW.settlement_order
               AND receipt.time_committed = NEW.time_settled
               AND receipt.commit_order = NEW.settlement_order
             )
           )
       );
     SELECT RAISE(ABORT, 'retained_steering_invocation_no_change_invalid')
     WHERE NEW.status = 'no_change'
       AND NOT EXISTS (
         SELECT 1
         FROM retained_steering_transition AS transition
         JOIN learning_command_receipt AS receipt
           ON receipt.retained_steering_effect_id = transition.id
         JOIN learning_command_invocation AS committed
           ON committed.part_id = receipt.invocation_part_id
         WHERE transition.policy_id = json_extract(NEW.settlement, '$.policyID')
           AND transition.version = json_extract(NEW.settlement, '$.version')
           AND transition.state = json_extract(NEW.settlement, '$.state')
           AND json_extract(NEW.settlement, '$.acknowledgementTitle') = CASE transition.state
             WHEN 'operative' THEN 'Learning steering already retained'
             ELSE 'Learning steering already removed'
           END
           AND json_extract(NEW.settlement, '$.acknowledgementBody') = CASE transition.state
             WHEN 'operative' THEN transition.acknowledgement_body
             ELSE 'No retained learning-wide instruction is active for policy ' || transition.policy_id || '.'
           END
           AND committed.status = 'applied'
           AND committed.retained_steering_effect_id = transition.id
           AND NOT EXISTS (
              SELECT 1
              FROM retained_steering_transition AS successor
              JOIN learning_command_receipt AS successor_receipt
                ON successor_receipt.retained_steering_effect_id = successor.id
              JOIN learning_command_invocation AS successor_invocation
                ON successor_invocation.part_id = successor_receipt.invocation_part_id
              WHERE successor.predecessor_id = transition.id
                AND successor_invocation.status = 'applied'
                AND successor_invocation.retained_steering_effect_id = successor.id
            )
        );
     SELECT RAISE(ABORT, 'retained_steering_invocation_conflict_invalid')
      WHERE NEW.status = 'error'
        AND json_extract(NEW.settlement, '$.code') = 'semantic_conflict'
       AND NOT EXISTS (
         SELECT 1
         FROM retained_steering_transition AS transition
         JOIN learning_command_receipt AS receipt
           ON receipt.retained_steering_effect_id = transition.id
         JOIN learning_command_invocation AS committed
           ON committed.part_id = receipt.invocation_part_id
         WHERE transition.id = json_extract(NEW.settlement, '$.detail.effectID')
           AND transition.occurrence_id = NEW.occurrence_id
           AND transition.semantic_fingerprint <> NEW.retained_steering_semantic_fingerprint
           AND committed.status = 'applied'
           AND committed.retained_steering_effect_id = transition.id
       );
   END`

const statements = [
  `CREATE TRIGGER IF NOT EXISTS learning_occurrence_source_order_minted
   BEFORE INSERT ON learning_occurrence_source_order
   WHEN NEW.sequence <> -1
   BEGIN
     SELECT RAISE(ABORT, 'learning_occurrence_source_order_minted');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_occurrence_gate15_context_required
   BEFORE INSERT ON learning_admitted_occurrence
   WHEN NEW.source_order IS NULL
     OR NEW.source_temporal_state IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM learning_occurrence_source_order AS allocation
       WHERE allocation.sequence = NEW.source_order
         AND allocation.occurrence_id = NEW.id
         AND allocation.origin_session_id = NEW.origin_session_id
         AND allocation.origin_message_id = NEW.origin_message_id
         AND allocation.time_allocated = NEW.time_admitted
         AND allocation.source_temporal_state = NEW.source_temporal_state
         AND allocation.source_timezone IS NEW.source_timezone
         AND allocation.source_utc_offset_minutes IS NEW.source_utc_offset_minutes
         AND allocation.source_temporal_unavailable_reason IS NEW.source_temporal_unavailable_reason
     )
     OR NOT EXISTS (
       SELECT 1 FROM message AS source
       WHERE source.id = NEW.origin_message_id
         AND source.session_id = NEW.origin_session_id
         AND source.time_created = NEW.time_admitted
         AND json_extract(source.data, '$.role') = 'user'
     )
     OR NOT EXISTS (
       SELECT 1 FROM part AS source_part
       WHERE source_part.message_id = NEW.origin_message_id
         AND source_part.session_id = NEW.origin_session_id
         AND json_extract(source_part.data, '$.type') = 'text'
         AND coalesce(json_extract(source_part.data, '$.synthetic'), 0) <> 1
     )
   BEGIN
     SELECT RAISE(ABORT, 'learning_occurrence_gate15_context_required');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_occurrence_gate15_context_immutable
   BEFORE UPDATE ON learning_admitted_occurrence
   BEGIN
     SELECT RAISE(ABORT, 'learning_occurrence_gate15_context_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_occurrence_source_order_immutable
   BEFORE UPDATE ON learning_occurrence_source_order
   BEGIN
     SELECT RAISE(ABORT, 'learning_occurrence_source_order_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_occurrence_source_order_delete_forbidden
   BEFORE DELETE ON learning_occurrence_source_order
   BEGIN
     SELECT RAISE(ABORT, 'learning_occurrence_source_order_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_state_validate_insert
   BEFORE INSERT ON retained_steering_state
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_state_initial_invalid')
     WHERE EXISTS (SELECT 1 FROM retained_steering_state)
        OR NEW.singleton <> 1
        OR NEW.steering_revision <> 0
        OR NEW.latest_cut_as_of <> 0;
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_state_validate_update
   BEFORE UPDATE OF singleton, steering_revision, latest_cut_as_of ON retained_steering_state
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_state_transition_invalid')
     WHERE NEW.singleton <> OLD.singleton
        OR NEW.latest_cut_as_of < OLD.latest_cut_as_of
        OR NOT (
          (
            NEW.steering_revision = OLD.steering_revision + 1
            AND NEW.latest_cut_as_of = OLD.latest_cut_as_of
            AND EXISTS (
              SELECT 1
              FROM retained_steering_transition AS transition
              JOIN learning_command_receipt AS receipt
                ON receipt.retained_steering_effect_id = transition.id
              JOIN learning_command_invocation AS invocation
                ON invocation.part_id = receipt.invocation_part_id
              WHERE transition.steering_revision = NEW.steering_revision
                AND receipt.id = json_extract(invocation.settlement, '$.receiptID')
                AND receipt.occurrence_id = transition.occurrence_id
                AND receipt.time_committed = transition.time_committed
                AND receipt.commit_order = transition.commit_order
                AND invocation.status = 'applied'
                AND invocation.retained_steering_effect_id = transition.id
                AND invocation.retained_steering_semantic_fingerprint = transition.semantic_fingerprint
                AND invocation.authorization_basis = 'learner_request'
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
  `CREATE TRIGGER IF NOT EXISTS retained_steering_state_delete_forbidden
   BEFORE DELETE ON retained_steering_state
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_state_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_policy_immutable
   BEFORE UPDATE ON retained_steering_policy
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_policy_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_policy_delete_forbidden
   BEFORE DELETE ON retained_steering_policy
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_policy_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_transition_validate_insert
   BEFORE INSERT ON retained_steering_transition
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_revision_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM retained_steering_state
       WHERE singleton = 1 AND steering_revision = NEW.steering_revision - 1
     )
       OR NEW.steering_revision <> COALESCE(
         (SELECT MAX(steering_revision) + 1 FROM retained_steering_transition), 1
       );
     SELECT RAISE(ABORT, 'retained_steering_frontier_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_shared_frontier
       WHERE sequence = NEW.frontier_sequence AND time_committed = NEW.frontier_time
     );
      SELECT RAISE(ABORT, 'retained_steering_source_invalid')
      WHERE NOT EXISTS (
        SELECT 1 FROM learning_admitted_occurrence AS source
        JOIN learning_occurrence_source_order AS allocation ON allocation.sequence = source.source_order
        WHERE source.id = NEW.occurrence_id
          AND source.source_order = NEW.source_order
          AND allocation.occurrence_id = source.id
          AND allocation.origin_session_id = source.origin_session_id
          AND allocation.origin_message_id = source.origin_message_id
          AND allocation.time_allocated = source.time_admitted
          AND allocation.source_temporal_state = source.source_temporal_state
          AND allocation.source_timezone IS source.source_timezone
          AND allocation.source_utc_offset_minutes IS source.source_utc_offset_minutes
          AND allocation.source_temporal_unavailable_reason IS source.source_temporal_unavailable_reason
          AND source.source_temporal_state IN ('resolved', 'unavailable')
          AND source.time_admitted <= NEW.time_committed
          AND (NEW.state = 'retracted' OR (
            source.source_temporal_state = 'resolved'
            AND source.time_admitted = NEW.effective_from
            AND source.source_timezone = NEW.boundary_timezone
          ))
      );
      SELECT RAISE(ABORT, 'retained_steering_authorization_invalid')
      WHERE NOT EXISTS (
        SELECT 1 FROM learning_command_invocation AS invocation
        WHERE invocation.occurrence_id = NEW.occurrence_id
          AND invocation.command_name = 'update_retained_learning_steering'
          AND invocation.command_version = 1
          AND invocation.capability_identity = 'update_retained_learning_steering'
          AND invocation.capability_version = 1
          AND invocation.authorization_basis = 'learner_request'
          AND invocation.retained_steering_semantic_fingerprint = NEW.semantic_fingerprint
          AND invocation.status = 'admitted'
      );
      SELECT RAISE(ABORT, 'retained_steering_policy_owner_invalid')
      WHERE NOT EXISTS (
        SELECT 1 FROM retained_steering_policy AS policy
        WHERE policy.id = NEW.policy_id
          AND policy.time_created <= NEW.time_committed
          AND (NEW.version <> 1 OR policy.time_created = NEW.time_committed)
      );
     SELECT RAISE(ABORT, 'retained_steering_predecessor_invalid')
     WHERE (NEW.version = 1 AND EXISTS (
              SELECT 1 FROM retained_steering_transition WHERE policy_id = NEW.policy_id
            ))
        OR (NEW.version > 1 AND NOT EXISTS (
              SELECT 1 FROM retained_steering_transition AS predecessor
              WHERE predecessor.id = NEW.predecessor_id
                AND predecessor.policy_id = NEW.policy_id
                AND predecessor.version = NEW.version - 1
                AND predecessor.state = NEW.previous_state
                AND predecessor.source_order < NEW.source_order
                AND predecessor.time_committed <= NEW.time_committed
                AND NOT EXISTS (
                  SELECT 1 FROM retained_steering_transition AS successor
                  WHERE successor.predecessor_id = predecessor.id
                )
            ));
     SELECT RAISE(ABORT, 'retained_steering_no_change_invalid')
     WHERE NEW.predecessor_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM retained_steering_transition AS predecessor
         WHERE predecessor.id = NEW.predecessor_id
           AND (
             (predecessor.state = 'retracted' AND NEW.state = 'retracted')
             OR (
               predecessor.state = 'operative'
               AND NEW.state = 'operative'
               AND predecessor.operative_instruction IS NEW.operative_instruction
               AND predecessor.learner_reason IS NEW.learner_reason
               AND predecessor.valid_until IS NEW.valid_until
             )
           )
       );
     SELECT RAISE(ABORT, 'retained_steering_expired_before_commit')
     WHERE NEW.state = 'operative' AND NEW.valid_until <= NEW.time_committed;
     SELECT RAISE(ABORT, 'retained_steering_text_capacity')
     WHERE length(CAST(NEW.source_excerpt AS BLOB)) > ${MAX_SOURCE_EXCERPT_BYTES}
        OR length(CAST(NEW.operative_instruction AS BLOB)) > ${MAX_INSTRUCTION_BYTES}
        OR length(CAST(NEW.learner_reason AS BLOB)) > ${MAX_REASON_BYTES};
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_transition_immutable
   BEFORE UPDATE ON retained_steering_transition
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_transition_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_transition_delete_forbidden
   BEFORE DELETE ON retained_steering_transition
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_transition_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_commit_seal_validate_insert
   BEFORE INSERT ON retained_steering_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_commit_seal_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM retained_steering_transition AS transition
       JOIN retained_steering_state AS state ON state.singleton = 1
       JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE transition.id = NEW.transition_id
         AND transition.commit_seal_id = NEW.transition_id
         AND state.steering_revision = transition.steering_revision
         AND receipt.retained_steering_effect_id = transition.id
         AND receipt.invocation_part_id = NEW.invocation_part_id
         AND receipt.occurrence_id = transition.occurrence_id
         AND receipt.time_committed = transition.time_committed
         AND receipt.commit_order = transition.commit_order
         AND invocation.status = 'applied'
         AND invocation.retained_steering_effect_id = transition.id
         AND invocation.retained_steering_semantic_fingerprint = transition.semantic_fingerprint
         AND invocation.authorization_basis = 'learner_request'
         AND json_extract(invocation.settlement, '$.receiptID') = receipt.id
         AND json_extract(invocation.settlement, '$.effectID') = transition.id
         AND json_extract(invocation.settlement, '$.policyID') = transition.policy_id
         AND json_extract(invocation.settlement, '$.version') = transition.version
         AND json_extract(invocation.settlement, '$.state') = transition.state
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_commit_seal_immutable
   BEFORE UPDATE ON retained_steering_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_commit_seal_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_commit_seal_delete_forbidden
   BEFORE DELETE ON retained_steering_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_commit_seal_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_receipt_validate_insert
   BEFORE INSERT ON learning_command_receipt
   WHEN NEW.retained_steering_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_receipt_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM retained_steering_transition AS transition
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = transition.occurrence_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE transition.id = NEW.retained_steering_effect_id
         AND transition.occurrence_id = NEW.occurrence_id
         AND transition.time_committed = NEW.time_committed
         AND transition.commit_order = NEW.commit_order
         AND occurrence.origin_session_id = NEW.origin_session_id
         AND occurrence.origin_message_id = NEW.origin_message_id
         AND invocation.status = 'admitted'
         AND invocation.command_name = 'update_retained_learning_steering'
         AND invocation.command_version = 1
         AND invocation.occurrence_id = NEW.occurrence_id
         AND invocation.assistant_message_id = NEW.assistant_message_id
         AND invocation.capability_identity = NEW.capability_identity
         AND invocation.capability_version = NEW.capability_version
          AND invocation.authorization_basis = NEW.authorization_basis
          AND invocation.retained_steering_semantic_fingerprint = transition.semantic_fingerprint
      );
    END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_receipt_immutable
   BEFORE UPDATE ON learning_command_receipt
   WHEN OLD.retained_steering_effect_id IS NOT NULL OR NEW.retained_steering_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_receipt_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_receipt_delete_forbidden
   BEFORE DELETE ON learning_command_receipt
   WHEN OLD.retained_steering_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_receipt_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_invocation_identity_immutable
   BEFORE UPDATE OF part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
                    occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
                    capability_version, authorization_basis, input_fingerprint,
                    retained_steering_semantic_fingerprint, permission_request_id,
                    time_admitted, turn_id, input_id
   ON learning_command_invocation
   WHEN OLD.command_name = 'update_retained_learning_steering'
     OR NEW.command_name = 'update_retained_learning_steering'
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_invocation_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_invocation_terminal_immutable
   BEFORE UPDATE ON learning_command_invocation
   WHEN OLD.command_name = 'update_retained_learning_steering' AND OLD.status <> 'admitted'
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_invocation_terminal_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_invocation_admitted_insert_only
   BEFORE INSERT ON learning_command_invocation
   WHEN NEW.command_name = 'update_retained_learning_steering' AND NEW.status <> 'admitted'
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_invocation_admitted_insert_only');
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_invocation_validate_settlement
   BEFORE UPDATE OF status, settlement, time_settled, settlement_order, retained_steering_effect_id
   ON learning_command_invocation
   WHEN NEW.command_name = 'update_retained_learning_steering' AND NEW.status <> 'admitted'
   ${retainedSettlementBody}`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_retained_steering_cut_required
   BEFORE INSERT ON turn_model_operation
   WHEN NEW.retained_steering_cut IS NULL
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_retained_steering_cut_required');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_retained_steering_cut_validate
   BEFORE INSERT ON turn_model_operation
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_retained_steering_cut_header_invalid')
     WHERE NOT COALESCE(
       json_type(NEW.retained_steering_cut) = 'object'
       AND (SELECT count(*) FROM json_each(NEW.retained_steering_cut)) = 9
       AND json_type(NEW.retained_steering_cut, '$.schemaVersion') = 'integer'
       AND json_extract(NEW.retained_steering_cut, '$.schemaVersion') = 1
       AND json_type(NEW.retained_steering_cut, '$.assistantMessageID') = 'text'
       AND json_extract(NEW.retained_steering_cut, '$.assistantMessageID') = NEW.assistant_message_id
       AND json_type(NEW.retained_steering_cut, '$.fingerprint') = 'text'
       AND json_extract(NEW.retained_steering_cut, '$.fingerprint') = NEW.retained_steering_cut_fingerprint
       AND length(json_extract(NEW.retained_steering_cut, '$.fingerprint')) = 64
       AND json_extract(NEW.retained_steering_cut, '$.fingerprint') NOT GLOB '*[^0-9a-f]*'
       AND json_type(NEW.retained_steering_cut, '$.cutAsOf') = 'integer'
       AND json_extract(NEW.retained_steering_cut, '$.cutAsOf') = NEW.retained_steering_cut_as_of
       AND json_type(NEW.retained_steering_cut, '$.throughSteeringRevision') = 'integer'
       AND json_type(NEW.retained_steering_cut, '$.throughSharedFrontier') = 'object'
       AND (SELECT count(*) FROM json_each(NEW.retained_steering_cut, '$.throughSharedFrontier')) = 2
       AND json_type(NEW.retained_steering_cut, '$.sourceTemporalContext') = 'object'
       AND json_extract(NEW.retained_steering_cut, '$.sourceTemporalContext.occurrenceID') = NEW.causal_occurrence_id
       AND json_type(NEW.retained_steering_cut, '$.items') = 'array'
       AND json_array_length(NEW.retained_steering_cut, '$.items') <= 16
       AND json_type(NEW.retained_steering_cut, '$.renderedBytes') = 'integer'
       AND json_extract(NEW.retained_steering_cut, '$.renderedBytes') BETWEEN 0 AND 16384,
       0
     );
     SELECT RAISE(ABORT, 'turn_model_retained_steering_cut_source_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_admitted_occurrence AS source
        WHERE source.id = NEW.causal_occurrence_id
         AND source.source_order = json_extract(NEW.retained_steering_cut, '$.sourceTemporalContext.sourceOrder')
         AND source.time_admitted = json_extract(NEW.retained_steering_cut, '$.sourceTemporalContext.instant')
         AND source.source_temporal_state = json_extract(NEW.retained_steering_cut, '$.sourceTemporalContext.state')
         AND source.source_timezone IS json_extract(NEW.retained_steering_cut, '$.sourceTemporalContext.timeZone')
          AND source.source_utc_offset_minutes IS json_extract(NEW.retained_steering_cut, '$.sourceTemporalContext.utcOffsetMinutes')
          AND source.source_temporal_unavailable_reason IS json_extract(NEW.retained_steering_cut, '$.sourceTemporalContext.reason')
          AND (
            (source.source_temporal_state = 'resolved'
              AND (SELECT count(*) FROM json_each(NEW.retained_steering_cut, '$.sourceTemporalContext')) = 6)
            OR (source.source_temporal_state = 'unavailable'
              AND (SELECT count(*) FROM json_each(NEW.retained_steering_cut, '$.sourceTemporalContext')) = 5)
          )
      );
     SELECT RAISE(ABORT, 'turn_model_retained_steering_cut_snapshot_invalid')
     WHERE NOT COALESCE(
        EXISTS (
          SELECT 1 FROM retained_steering_state
          WHERE steering_revision = json_extract(NEW.retained_steering_cut, '$.throughSteeringRevision')
            AND latest_cut_as_of <= NEW.retained_steering_cut_as_of
        )
        AND NOT EXISTS (
          SELECT 1 FROM retained_steering_transition AS unsealed
          WHERE unsealed.steering_revision <= json_extract(NEW.retained_steering_cut, '$.throughSteeringRevision')
            AND NOT EXISTS (
              SELECT 1 FROM retained_steering_commit_seal AS seal
              WHERE seal.transition_id = unsealed.id
            )
        )
        AND json_type(NEW.retained_steering_cut, '$.throughSharedFrontier.sequence') = 'integer'
       AND json_extract(NEW.retained_steering_cut, '$.throughSharedFrontier.sequence') = NEW.observed_shared_frontier_sequence
       AND json_type(NEW.retained_steering_cut, '$.throughSharedFrontier.time') = 'integer'
       AND json_extract(NEW.retained_steering_cut, '$.throughSharedFrontier.time') = NEW.observed_shared_frontier_time
       AND (
         EXISTS (
           SELECT 1 FROM learning_shared_frontier
           WHERE singleton = 1
             AND sequence = NEW.observed_shared_frontier_sequence
             AND time_committed = NEW.observed_shared_frontier_time
         )
         OR (
           NEW.observed_shared_frontier_sequence = 0
           AND NEW.observed_shared_frontier_time = 0
           AND NOT EXISTS (SELECT 1 FROM learning_shared_frontier)
         )
       ),
       0
     );
     SELECT RAISE(ABORT, 'turn_model_retained_steering_cut_item_invalid')
     WHERE json_array_length(NEW.retained_steering_cut, '$.items') <> (
       SELECT COUNT(*) FROM retained_steering_transition AS active
       WHERE active.state = 'operative'
         AND active.steering_revision <= json_extract(NEW.retained_steering_cut, '$.throughSteeringRevision')
         AND active.effective_from <= NEW.retained_steering_cut_as_of
          AND active.valid_until > NEW.retained_steering_cut_as_of
          AND EXISTS (
            SELECT 1
            FROM retained_steering_commit_seal AS seal
            JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
            JOIN learning_command_invocation AS invocation ON invocation.part_id = receipt.invocation_part_id
            WHERE seal.transition_id = active.id
              AND seal.invocation_part_id = invocation.part_id
              AND receipt.retained_steering_effect_id = active.id
              AND invocation.status = 'applied'
              AND invocation.retained_steering_effect_id = active.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM retained_steering_transition AS successor
            JOIN retained_steering_commit_seal AS successor_seal
              ON successor_seal.transition_id = successor.id
            JOIN learning_command_receipt AS successor_receipt
              ON successor_receipt.id = successor_seal.receipt_id
            JOIN learning_command_invocation AS successor_invocation
              ON successor_invocation.part_id = successor_receipt.invocation_part_id
            WHERE successor.predecessor_id = active.id
              AND successor.steering_revision <= json_extract(NEW.retained_steering_cut, '$.throughSteeringRevision')
              AND successor_seal.invocation_part_id = successor_invocation.part_id
              AND successor_receipt.retained_steering_effect_id = successor.id
              AND successor_invocation.status = 'applied'
              AND successor_invocation.retained_steering_effect_id = successor.id
          )
       )
       OR (SELECT COUNT(DISTINCT json_extract(item.value, '$.transitionID'))
           FROM json_each(NEW.retained_steering_cut, '$.items') AS item)
           <> json_array_length(NEW.retained_steering_cut, '$.items')
       OR (SELECT COUNT(DISTINCT json_extract(item.value, '$.policyID'))
           FROM json_each(NEW.retained_steering_cut, '$.items') AS item)
          <> json_array_length(NEW.retained_steering_cut, '$.items')
       OR EXISTS (
         SELECT 1
         FROM json_each(NEW.retained_steering_cut, '$.items') AS item
         JOIN json_each(NEW.retained_steering_cut, '$.items') AS previous
           ON CAST(previous.key AS INTEGER) = CAST(item.key AS INTEGER) - 1
         WHERE json_extract(previous.value, '$.sourceOrder') >= json_extract(item.value, '$.sourceOrder')
       )
       OR EXISTS (
       SELECT 1 FROM json_each(NEW.retained_steering_cut, '$.items') AS item
        WHERE json_type(item.value) <> 'object'
          OR CAST(item.key AS INTEGER) <> json_extract(item.value, '$.ordinal')
          OR (SELECT count(*) FROM json_each(item.value)) <> CASE
            WHEN json_type(item.value, '$.learnerReason') = 'text' THEN 11 ELSE 10 END
           OR NOT EXISTS (
              SELECT 1 FROM retained_steering_transition AS transition
              JOIN retained_steering_commit_seal AS seal ON seal.transition_id = transition.id
              JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
              JOIN learning_command_invocation AS invocation ON invocation.part_id = receipt.invocation_part_id
              WHERE transition.id = json_extract(item.value, '$.transitionID')
                AND seal.invocation_part_id = invocation.part_id
                AND receipt.retained_steering_effect_id = transition.id
                AND transition.policy_id = json_extract(item.value, '$.policyID')
              AND transition.version = json_extract(item.value, '$.version')
              AND transition.source_order = json_extract(item.value, '$.sourceOrder')
              AND transition.source_excerpt = json_extract(item.value, '$.sourceExcerpt')
              AND transition.operative_instruction = json_extract(item.value, '$.operativeInstruction')
              AND transition.learner_reason IS json_extract(item.value, '$.learnerReason')
              AND transition.effective_from = json_extract(item.value, '$.effectiveFrom')
              AND transition.valid_until = json_extract(item.value, '$.validUntil')
               AND transition.steering_revision = json_extract(item.value, '$.steeringRevision')
               AND transition.steering_revision <= json_extract(NEW.retained_steering_cut, '$.throughSteeringRevision')
               AND transition.state = 'operative'
               AND transition.effective_from <= NEW.retained_steering_cut_as_of
               AND transition.valid_until > NEW.retained_steering_cut_as_of
               AND invocation.status = 'applied'
               AND invocation.retained_steering_effect_id = transition.id
                AND NOT EXISTS (
                  SELECT 1 FROM retained_steering_transition AS successor
                  JOIN retained_steering_commit_seal AS successor_seal
                    ON successor_seal.transition_id = successor.id
                  JOIN learning_command_receipt AS successor_receipt
                    ON successor_receipt.id = successor_seal.receipt_id
                  JOIN learning_command_invocation AS successor_invocation
                    ON successor_invocation.part_id = successor_receipt.invocation_part_id
                  WHERE successor.predecessor_id = transition.id
                    AND successor.steering_revision <= json_extract(NEW.retained_steering_cut, '$.throughSteeringRevision')
                    AND successor_seal.invocation_part_id = successor_invocation.part_id
                    AND successor_receipt.retained_steering_effect_id = successor.id
                    AND successor_invocation.status = 'applied'
                    AND successor_invocation.retained_steering_effect_id = successor.id
                )
           )
      );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_retained_steering_cut_advance
   AFTER INSERT ON turn_model_operation
   BEGIN
     UPDATE retained_steering_state
     SET latest_cut_as_of = MAX(latest_cut_as_of, NEW.retained_steering_cut_as_of)
     WHERE singleton = 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_retained_steering_cut_immutable
   BEFORE UPDATE OF retained_steering_cut, retained_steering_cut_fingerprint, retained_steering_cut_as_of
   ON turn_model_operation
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_retained_steering_cut_immutable');
   END`,
] as const

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
