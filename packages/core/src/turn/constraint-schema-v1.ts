export * as TurnConstraintSchema from "./constraint-schema-v1"

import { Effect } from "effect"
import type { Database } from "../database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export const statements = [
  `CREATE TRIGGER IF NOT EXISTS session_historical_message_validate_insert
   BEFORE INSERT ON session_historical_message_presentation
   BEGIN
     SELECT RAISE(ABORT, 'session_historical_message_invalid')
     WHERE NEW.session_id = NEW.source_session_id
        OR NOT EXISTS (
          SELECT 1
          FROM message AS target
          JOIN message AS source ON source.id = NEW.source_message_id
          JOIN event_sequence AS frontier ON frontier.aggregate_id = NEW.source_session_id
          WHERE target.id = NEW.message_id
            AND target.session_id = NEW.session_id
            AND source.session_id = NEW.source_session_id
            AND frontier.seq = NEW.source_event_sequence
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS session_historical_part_validate_insert
   BEFORE INSERT ON session_historical_part_presentation
   BEGIN
     SELECT RAISE(ABORT, 'session_historical_part_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM part AS target
       JOIN session_historical_message_presentation AS target_message
         ON target_message.message_id = NEW.message_id
       JOIN part AS source ON source.id = NEW.source_part_id
       WHERE target.id = NEW.part_id
         AND target.message_id = NEW.message_id
         AND target.session_id = NEW.session_id
         AND target_message.session_id = NEW.session_id
         AND target_message.source_session_id = NEW.source_session_id
         AND target_message.source_message_id = NEW.source_message_id
         AND source.message_id = NEW.source_message_id
         AND source.session_id = NEW.source_session_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_input_validate_insert
   BEFORE INSERT ON turn_input
   BEGIN
     SELECT RAISE(ABORT, 'turn_input_presentation_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM message
       WHERE message.id = NEW.message_id
         AND message.session_id = NEW.session_id
         AND json_extract(message.data, '$.role') = 'user'
     );
     SELECT RAISE(ABORT, 'turn_input_occurrence_invalid')
     WHERE NEW.source IN ('learner_root', 'learner_steer')
       AND NOT EXISTS (
         SELECT 1 FROM learning_occurrence_presentation
         WHERE learning_occurrence_presentation.message_id = NEW.message_id
           AND learning_occurrence_presentation.session_id = NEW.session_id
           AND learning_occurrence_presentation.occurrence_id = NEW.occurrence_id
       );
     SELECT RAISE(ABORT, 'turn_input_existing_turn_invalid')
     WHERE EXISTS (SELECT 1 FROM turn WHERE turn.id = NEW.turn_id)
       AND NOT EXISTS (
         SELECT 1 FROM turn
         WHERE turn.id = NEW.turn_id
           AND turn.session_id = NEW.session_id
           AND turn.state = 'running'
           AND (
             (NEW.source = 'learner_steer' AND NEW.ordinal > 0)
             OR (turn.initial_input_id = NEW.id AND NEW.ordinal = 0)
           )
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_child_lineage_validate_insert
   BEFORE INSERT ON turn_child_lineage
   BEGIN
     SELECT RAISE(ABORT, 'turn_child_lineage_parent_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn AS parent_turn
       JOIN turn_tool_invocation AS invocation
         ON invocation.turn_id = parent_turn.id
        AND invocation.part_id = NEW.parent_task_part_id
        AND invocation.assistant_message_id = NEW.parent_model_message_id
       JOIN turn_tool_candidate AS candidate
         ON candidate.part_id = invocation.part_id
        AND candidate.tool = 'task'
        AND candidate.state = 'admitted'
       JOIN session AS child_session
         ON child_session.id = NEW.child_session_id
        AND child_session.parent_id = NEW.parent_session_id
       WHERE parent_turn.id = NEW.parent_turn_id
         AND parent_turn.session_id = NEW.parent_session_id
         AND parent_turn.depth = NEW.parent_depth
         AND parent_turn.state = 'running'
         AND invocation.state = 'running'
         AND NEW.child_depth = NEW.parent_depth + 1
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_validate_insert
   BEFORE INSERT ON turn
   BEGIN
     SELECT RAISE(ABORT, 'turn_initial_input_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM turn_input
       WHERE turn_input.id = NEW.initial_input_id
         AND turn_input.id = NEW.current_input_id
         AND turn_input.turn_id = NEW.id
         AND turn_input.session_id = NEW.session_id
         AND turn_input.ordinal = 0
         AND ((NEW.admission_kind = 'learner' AND turn_input.source = 'learner_root')
           OR (NEW.admission_kind = 'delegated_task' AND turn_input.source = 'delegated_task'))
     );
     SELECT RAISE(ABORT, 'turn_root_lineage_invalid')
     WHERE NEW.admission_kind = 'learner'
       AND (EXISTS (SELECT 1 FROM turn_child_lineage WHERE child_turn_id = NEW.id)
         OR EXISTS (SELECT 1 FROM session WHERE id = NEW.session_id AND parent_id IS NOT NULL));
     SELECT RAISE(ABORT, 'turn_child_lineage_invalid')
     WHERE NEW.admission_kind = 'delegated_task'
       AND NOT EXISTS (
         SELECT 1
         FROM turn_child_lineage AS lineage
         JOIN turn_input AS input ON input.id = NEW.initial_input_id
         JOIN turn_model_operation AS parent_model
           ON parent_model.turn_id = lineage.parent_turn_id
          AND parent_model.assistant_message_id = lineage.parent_model_message_id
         WHERE lineage.child_turn_id = NEW.id
           AND lineage.child_session_id = NEW.session_id
           AND lineage.child_depth = NEW.depth
           AND input.parent_model_message_id = lineage.parent_model_message_id
           AND input.occurrence_id IS parent_model.causal_occurrence_id
       );
     SELECT RAISE(ABORT, 'turn_session_time_regressed')
     WHERE NEW.time_admitted < coalesce((
       SELECT max(causal_time) FROM turn WHERE session_id = NEW.session_id
     ), 0);
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_identity_immutable
   BEFORE UPDATE OF id, session_id, admission_kind, initial_input_id,
     model_limit, tool_limit, depth, envelope_fingerprint, policy_basis, time_admitted
   ON turn
   BEGIN
     SELECT RAISE(ABORT, 'turn_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_causal_time_nondecreasing
   BEFORE UPDATE OF causal_time ON turn
   WHEN NEW.causal_time < OLD.causal_time
   BEGIN
     SELECT RAISE(ABORT, 'turn_causal_time_regressed');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_counts_validate_update
   BEFORE UPDATE OF model_count, tool_count ON turn
   BEGIN
     SELECT RAISE(ABORT, 'turn_counter_membership_mismatch')
     WHERE NEW.model_count <> (SELECT count(*) FROM turn_model_operation WHERE turn_id = OLD.id)
        OR NEW.tool_count <> (SELECT count(*) FROM turn_tool_invocation WHERE turn_id = OLD.id);
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_validate_current_input_update
   BEFORE UPDATE OF current_input_id ON turn
   BEGIN
     SELECT RAISE(ABORT, 'turn_current_input_invalid')
     WHERE OLD.state <> 'running'
       OR NOT EXISTS (
         SELECT 1 FROM turn_input
         WHERE turn_input.id = NEW.current_input_id
           AND turn_input.turn_id = OLD.id
           AND turn_input.session_id = OLD.session_id
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_input_presentation_validate_insert
   BEFORE INSERT ON turn_input_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_input_live_link_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn_input
       JOIN message ON message.id = NEW.message_id
       WHERE turn_input.id = NEW.input_id
         AND turn_input.message_id = NEW.message_id
         AND turn_input.session_id = NEW.session_id
         AND message.session_id = NEW.session_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_validate_insert
   BEFORE INSERT ON turn_model_operation
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_admission_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn
       JOIN turn_input ON turn_input.id = turn.current_input_id
       JOIN message ON message.id = NEW.assistant_message_id
       WHERE turn.id = NEW.turn_id
         AND turn.session_id = NEW.session_id
         AND turn.state = 'running'
         AND turn.current_input_id = NEW.input_id
         AND turn.model_count = NEW.ordinal
         AND turn.model_count < turn.model_limit
         AND turn_input.occurrence_id IS NEW.causal_occurrence_id
         AND message.session_id = NEW.session_id
         AND json_extract(message.data, '$.role') = 'assistant'
         AND NEW.observed_shared_frontier_sequence = max(
           NEW.snapshot_frontier_sequence,
           coalesce((SELECT sequence FROM learning_shared_frontier WHERE singleton = 1), 0)
         )
         AND NEW.observed_shared_frontier_time = max(
           NEW.snapshot_frontier_time,
           coalesce((SELECT time_committed FROM learning_shared_frontier WHERE singleton = 1), 0)
         )
         AND NEW.time_admitted >= turn.causal_time
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_historical_input_validate_insert
   BEFORE INSERT ON turn_historical_input_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_historical_input_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM message AS target
       JOIN turn_input AS source
         ON source.turn_id = NEW.source_turn_id
        AND source.id = NEW.source_input_id
       WHERE target.id = NEW.message_id
         AND target.session_id = NEW.session_id
         AND json_extract(target.data, '$.role') = 'user'
         AND source.session_id = NEW.source_session_id
         AND source.occurrence_id IS NEW.occurrence_id
     ) AND NOT EXISTS (
       SELECT 1
       FROM message AS target
       JOIN turn_historical_input_presentation AS source
         ON source.source_turn_id = NEW.source_turn_id
        AND source.source_input_id = NEW.source_input_id
       WHERE target.id = NEW.message_id
         AND target.session_id = NEW.session_id
         AND json_extract(target.data, '$.role') = 'user'
         AND source.source_session_id = NEW.source_session_id
         AND source.occurrence_id IS NEW.occurrence_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_count_insert
   AFTER INSERT ON turn_model_operation
   BEGIN
     UPDATE turn
     SET model_count = model_count + 1,
         causal_time = max(causal_time, NEW.time_admitted)
     WHERE id = NEW.turn_id AND state = 'running';
     SELECT RAISE(ABORT, 'turn_model_counter_update_failed') WHERE changes() <> 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_presentation_validate_insert
   BEFORE INSERT ON turn_model_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_live_link_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn_model_operation
       JOIN message ON message.id = NEW.assistant_message_id
       WHERE turn_model_operation.assistant_message_id = NEW.assistant_message_id
         AND turn_model_operation.session_id = NEW.session_id
         AND message.session_id = NEW.session_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_validate_insert
   BEFORE INSERT ON turn_tool_candidate
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_registration_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn_model_operation
       JOIN turn ON turn.id = turn_model_operation.turn_id
       JOIN part ON part.id = NEW.part_id
       WHERE turn_model_operation.turn_id = NEW.turn_id
         AND turn_model_operation.assistant_message_id = NEW.assistant_message_id
         AND turn_model_operation.session_id = NEW.session_id
         AND turn_model_operation.candidates_sealed = 0
         AND turn.state = 'running'
         AND part.session_id = NEW.session_id
         AND json_extract(part.data, '$.type') = 'tool'
         AND json_extract(part.data, '$.callID') = NEW.call_id
         AND json_extract(part.data, '$.tool') = NEW.tool
         AND NEW.emission_ordinal = (
           SELECT count(*) FROM turn_tool_candidate
           WHERE turn_tool_candidate.assistant_message_id = NEW.assistant_message_id
         )
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_presentation_validate_insert
   BEFORE INSERT ON turn_candidate_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_live_link_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn_tool_candidate
       JOIN part ON part.id = NEW.part_id
       WHERE turn_tool_candidate.part_id = NEW.part_id
         AND turn_tool_candidate.session_id = NEW.session_id
         AND part.session_id = NEW.session_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_transcript_redaction_validate_insert
   BEFORE INSERT ON turn_transcript_redaction
   BEGIN
     SELECT RAISE(ABORT, 'turn_transcript_redaction_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn
       JOIN turn_input ON turn_input.id = turn.initial_input_id
       WHERE turn.id = NEW.turn_id
         AND turn.state <> 'running'
         AND turn.time_terminal <= NEW.time_removed
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_envelope_redaction_validate_update
   BEFORE UPDATE OF normalized_envelope ON turn
   WHEN OLD.normalized_envelope <> NEW.normalized_envelope
   BEGIN
     SELECT RAISE(ABORT, 'turn_envelope_redaction_invalid')
     WHERE NEW.normalized_envelope <> '{}'
        OR NOT EXISTS (
          SELECT 1 FROM turn_transcript_redaction
          WHERE turn_id = OLD.id
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_redaction_validate_insert
   BEFORE INSERT ON turn_candidate_redaction
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_redaction_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn_tool_candidate AS candidate
       JOIN turn ON turn.id = candidate.turn_id
       LEFT JOIN turn_tool_invocation AS invocation ON invocation.part_id = candidate.part_id
       WHERE candidate.part_id = NEW.part_id
         AND candidate.turn_id = NEW.turn_id
         AND candidate.state <> 'pending_admission'
         AND ((candidate.state = 'admitted' AND invocation.state <> 'running')
           OR (candidate.state <> 'admitted' AND invocation.part_id IS NULL))
         AND turn.state <> 'running'
         AND turn.time_terminal <= NEW.time_removed
         AND coalesce(candidate.time_terminal, invocation.time_settled, candidate.time_registered) <= NEW.time_removed
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_envelope_redaction_validate_update
   BEFORE UPDATE OF normalized_envelope ON turn_tool_candidate
   WHEN OLD.normalized_envelope <> NEW.normalized_envelope
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_envelope_redaction_invalid')
     WHERE NEW.normalized_envelope <> '{}'
        OR NOT EXISTS (
          SELECT 1 FROM turn_candidate_redaction
          WHERE part_id = OLD.part_id AND turn_id = OLD.turn_id
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_seal_validate_update
   BEFORE UPDATE OF candidates_sealed ON turn_model_operation
   WHEN OLD.candidates_sealed = 0 AND NEW.candidates_sealed = 1
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_seal_invalid')
     WHERE NEW.candidate_count <> (
       SELECT count(*) FROM turn_tool_candidate
       WHERE turn_tool_candidate.assistant_message_id = OLD.assistant_message_id
     ) OR (NEW.candidate_count > 0 AND NEW.candidate_count <> (
       SELECT max(emission_ordinal) + 1 FROM turn_tool_candidate
       WHERE turn_tool_candidate.assistant_message_id = OLD.assistant_message_id
     ));
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_settlement_validate_update
   BEFORE UPDATE OF state ON turn_model_operation
   WHEN OLD.state = 'running' AND NEW.state <> 'running'
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_unsealed') WHERE NEW.candidates_sealed <> 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_finality
   BEFORE UPDATE OF state, time_settled, candidates_sealed, candidate_count, time_candidates_sealed
   ON turn_model_operation
   WHEN OLD.state <> 'running'
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_terminal_final');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_seal_finality
   BEFORE UPDATE OF candidates_sealed, candidate_count, time_candidates_sealed
   ON turn_model_operation
   WHEN OLD.candidates_sealed = 1
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_seal_final');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_invocation_validate_insert
   BEFORE INSERT ON turn_tool_invocation
   BEGIN
     SELECT RAISE(ABORT, 'turn_tool_admission_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn_tool_candidate AS candidate
       JOIN turn_model_operation AS model
         ON model.assistant_message_id = candidate.assistant_message_id
        AND model.turn_id = candidate.turn_id
       JOIN turn ON turn.id = candidate.turn_id
       WHERE candidate.part_id = NEW.part_id
         AND candidate.turn_id = NEW.turn_id
         AND candidate.session_id = NEW.session_id
         AND candidate.assistant_message_id = NEW.assistant_message_id
         AND candidate.state = 'pending_admission'
         AND model.candidates_sealed = 1
         AND turn.state = 'running'
         AND turn.tool_count = NEW.ordinal
         AND turn.tool_count < turn.tool_limit
         AND NEW.observed_shared_frontier_sequence = coalesce(
           (SELECT sequence FROM learning_shared_frontier WHERE singleton = 1),
           0
         )
         AND NEW.observed_shared_frontier_time = coalesce(
           (SELECT time_committed FROM learning_shared_frontier WHERE singleton = 1),
           0
         )
         AND NEW.consumed_shared_frontier_sequence = NEW.observed_shared_frontier_sequence
         AND NEW.consumed_shared_frontier_time = NEW.observed_shared_frontier_time
         AND NEW.resulting_shared_frontier_sequence IS NULL
         AND NEW.resulting_shared_frontier_time IS NULL
         AND NEW.time_admitted >= turn.causal_time
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_invocation_admit_insert
   AFTER INSERT ON turn_tool_invocation
   BEGIN
     UPDATE turn_tool_candidate
     SET state = 'admitted'
     WHERE part_id = NEW.part_id AND state = 'pending_admission';
     SELECT RAISE(ABORT, 'turn_candidate_admission_failed') WHERE changes() <> 1;
     UPDATE turn
     SET tool_count = tool_count + 1,
         causal_time = max(causal_time, NEW.time_admitted)
     WHERE id = NEW.turn_id AND state = 'running';
     SELECT RAISE(ABORT, 'turn_tool_counter_update_failed') WHERE changes() <> 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_disposition_validate_update
   BEFORE UPDATE OF state ON turn_tool_candidate
   WHEN OLD.state <> NEW.state
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_terminal_final')
     WHERE OLD.state NOT IN ('pending_admission');
     SELECT RAISE(ABORT, 'turn_candidate_disposition_invalid')
     WHERE (NEW.state = 'admitted' AND NOT EXISTS (
       SELECT 1 FROM turn_tool_invocation WHERE part_id = OLD.part_id
     )) OR (NEW.state <> 'admitted' AND EXISTS (
       SELECT 1 FROM turn_tool_invocation WHERE part_id = OLD.part_id
     ));
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_terminal_finality
   BEFORE UPDATE OF state, time_terminal, exhaustion_turn_id ON turn_tool_candidate
   WHEN OLD.state <> 'pending_admission'
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_terminal_final');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_invocation_finality
   BEFORE UPDATE OF state, time_settled ON turn_tool_invocation
   WHEN OLD.state <> 'running'
   BEGIN
     SELECT RAISE(ABORT, 'turn_invocation_terminal_final');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_invocation_frontier_finality
   BEFORE UPDATE OF consumed_shared_frontier_sequence, consumed_shared_frontier_time,
     resulting_shared_frontier_sequence, resulting_shared_frontier_time
   ON turn_tool_invocation
   WHEN OLD.state <> 'running'
   BEGIN
     SELECT RAISE(ABORT, 'turn_invocation_terminal_final');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_invocation_frontier_nondecreasing
   BEFORE UPDATE OF time_admitted, consumed_shared_frontier_sequence, consumed_shared_frontier_time
   ON turn_tool_invocation
   WHEN NEW.time_admitted < OLD.time_admitted
     OR NEW.consumed_shared_frontier_sequence < OLD.consumed_shared_frontier_sequence
     OR NEW.consumed_shared_frontier_time < OLD.consumed_shared_frontier_time
   BEGIN
     SELECT RAISE(ABORT, 'turn_invocation_frontier_regressed');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_terminal_validate_update
   BEFORE UPDATE OF state ON turn
   WHEN OLD.state = 'running' AND NEW.state <> 'running'
   BEGIN
     SELECT RAISE(ABORT, 'turn_terminal_model_unsettled')
     WHERE EXISTS (
       SELECT 1 FROM turn_model_operation
       WHERE turn_id = OLD.id AND (state = 'running' OR candidates_sealed = 0)
     );
     SELECT RAISE(ABORT, 'turn_terminal_candidate_unsettled')
     WHERE EXISTS (
       SELECT 1 FROM turn_tool_candidate
       WHERE turn_id = OLD.id AND state = 'pending_admission'
     ) OR EXISTS (
       SELECT 1 FROM turn_tool_candidate
       WHERE turn_id = OLD.id AND state = 'admitted'
         AND NOT EXISTS (
           SELECT 1 FROM turn_tool_invocation
           WHERE turn_tool_invocation.part_id = turn_tool_candidate.part_id
             AND turn_tool_invocation.state <> 'running'
         )
     );
     SELECT RAISE(ABORT, 'turn_terminal_invocation_unsettled')
     WHERE EXISTS (
       SELECT 1 FROM turn_tool_invocation
       WHERE turn_id = OLD.id AND state = 'running'
     );
     SELECT RAISE(ABORT, 'turn_terminal_counter_mismatch')
     WHERE NEW.model_count <> (SELECT count(*) FROM turn_model_operation WHERE turn_id = OLD.id)
        OR NEW.tool_count <> (SELECT count(*) FROM turn_tool_invocation WHERE turn_id = OLD.id);
     SELECT RAISE(ABORT, 'turn_completion_input_unhandled')
     WHERE NEW.state = 'completed' AND NOT EXISTS (
       SELECT 1 FROM turn_model_operation
       WHERE turn_id = OLD.id AND input_id = OLD.current_input_id
     );
     SELECT RAISE(ABORT, 'turn_tool_exhaustion_candidate_invalid')
     WHERE NEW.state = 'exhausted' AND NEW.exhaustion_counter = 'tool'
       AND NOT EXISTS (
         SELECT 1 FROM turn_tool_candidate
         WHERE turn_id = OLD.id
           AND part_id = NEW.exhaustion_attempt_id
           AND state = 'not_started_limit'
           AND exhaustion_turn_id = OLD.id
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_terminal_finality
   BEFORE UPDATE OF state, model_count, tool_count, causal_time, time_terminal, terminal_reason, exhaustion_counter,
     exhaustion_observed, exhaustion_limit, exhaustion_attempt_id,
     exhaustion_envelope, exhaustion_envelope_fingerprint
   ON turn
   WHEN OLD.state <> 'running'
   BEGIN
     SELECT RAISE(ABORT, 'turn_terminal_final');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_child_result_validate_insert
   BEFORE INSERT ON turn_child_result
   BEGIN
     SELECT RAISE(ABORT, 'turn_child_result_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn_child_lineage AS lineage
       JOIN turn AS child_turn ON child_turn.id = lineage.child_turn_id
       JOIN turn_tool_candidate AS candidate ON candidate.part_id = NEW.parent_task_part_id
       JOIN turn_tool_invocation AS invocation ON invocation.part_id = candidate.part_id
       WHERE lineage.child_turn_id = NEW.child_turn_id
         AND lineage.child_session_id = NEW.child_session_id
         AND lineage.parent_turn_id = NEW.parent_turn_id
         AND lineage.parent_session_id = NEW.parent_session_id
         AND lineage.parent_task_part_id = NEW.parent_task_part_id
         AND candidate.tool = 'task'
         AND invocation.turn_id = NEW.parent_turn_id
         AND invocation.state = 'running'
         AND child_turn.state = NEW.terminal_outcome
         AND child_turn.time_terminal <= NEW.time_settled
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_historical_model_validate_insert
   BEFORE INSERT ON turn_historical_model_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_historical_model_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM message AS target
       JOIN turn_model_operation AS source
         ON source.turn_id = NEW.source_turn_id
        AND source.assistant_message_id = NEW.source_assistant_message_id
       WHERE target.id = NEW.assistant_message_id
         AND target.session_id = NEW.session_id
         AND source.session_id = NEW.source_session_id
         AND source.causal_occurrence_id IS NEW.causal_occurrence_id
     ) AND NOT EXISTS (
       SELECT 1
       FROM message AS target
       JOIN turn_historical_model_presentation AS source
         ON source.source_turn_id = NEW.source_turn_id
        AND source.source_assistant_message_id = NEW.source_assistant_message_id
       WHERE target.id = NEW.assistant_message_id
         AND target.session_id = NEW.session_id
         AND source.source_session_id = NEW.source_session_id
         AND source.causal_occurrence_id IS NEW.causal_occurrence_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_historical_tool_validate_insert
   BEFORE INSERT ON turn_historical_tool_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_historical_tool_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM part AS target
       JOIN turn_tool_candidate AS source
         ON source.turn_id = NEW.source_turn_id
        AND source.assistant_message_id = NEW.source_assistant_message_id
        AND source.part_id = NEW.source_part_id
        AND source.call_id = NEW.call_id
       WHERE target.id = NEW.part_id
         AND target.session_id = NEW.session_id
         AND source.session_id = NEW.source_session_id
     ) AND NOT EXISTS (
       SELECT 1
       FROM part AS target
       JOIN turn_historical_tool_presentation AS source
         ON source.source_turn_id = NEW.source_turn_id
        AND source.source_assistant_message_id = NEW.source_assistant_message_id
        AND source.source_part_id = NEW.source_part_id
        AND source.call_id = NEW.call_id
       WHERE target.id = NEW.part_id
         AND target.session_id = NEW.session_id
         AND source.source_session_id = NEW.source_session_id
      );
    END`,
  `CREATE TRIGGER IF NOT EXISTS session_historical_message_identity_immutable
   BEFORE UPDATE ON session_historical_message_presentation
   BEGIN
     SELECT RAISE(ABORT, 'session_historical_message_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS session_historical_part_identity_immutable
   BEFORE UPDATE ON session_historical_part_presentation
   BEGIN
     SELECT RAISE(ABORT, 'session_historical_part_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_input_identity_immutable
   BEFORE UPDATE ON turn_input
   BEGIN
     SELECT RAISE(ABORT, 'turn_input_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_input_presentation_identity_immutable
   BEFORE UPDATE ON turn_input_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_input_presentation_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_identity_immutable
   BEFORE UPDATE OF assistant_message_id, turn_id, session_id, input_id, causal_occurrence_id, ordinal,
     request_fingerprint, context_fingerprint, snapshot_frontier_sequence, snapshot_frontier_time,
     observed_shared_frontier_sequence, observed_shared_frontier_time, time_admitted
   ON turn_model_operation
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_model_presentation_identity_immutable
   BEFORE UPDATE ON turn_model_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_model_presentation_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_identity_immutable
   BEFORE UPDATE OF part_id, turn_id, session_id, assistant_message_id, call_id, tool,
     emission_ordinal, envelope_fingerprint, time_registered
   ON turn_tool_candidate
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_presentation_identity_immutable
   BEFORE UPDATE ON turn_candidate_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_presentation_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_invocation_identity_immutable
   BEFORE UPDATE OF part_id, turn_id, session_id, assistant_message_id, ordinal,
     observed_shared_frontier_sequence, observed_shared_frontier_time
   ON turn_tool_invocation
   BEGIN
     SELECT RAISE(ABORT, 'turn_invocation_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_invocation_resulting_frontier_validate_update
   BEFORE UPDATE OF resulting_shared_frontier_sequence, resulting_shared_frontier_time
   ON turn_tool_invocation
   BEGIN
     SELECT RAISE(ABORT, 'turn_invocation_resulting_frontier_invalid')
     WHERE (OLD.resulting_shared_frontier_sequence IS NOT NULL AND (
         NEW.resulting_shared_frontier_sequence IS NULL
         OR NEW.resulting_shared_frontier_time IS NULL
         OR NEW.resulting_shared_frontier_sequence < OLD.resulting_shared_frontier_sequence
         OR NEW.resulting_shared_frontier_time < OLD.resulting_shared_frontier_time
       )) OR (NEW.resulting_shared_frontier_sequence IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM learning_shared_frontier
         WHERE singleton = 1
           AND sequence = NEW.resulting_shared_frontier_sequence
           AND time_committed = NEW.resulting_shared_frontier_time
       ));
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_child_lineage_identity_immutable
   BEFORE UPDATE ON turn_child_lineage
   BEGIN
     SELECT RAISE(ABORT, 'turn_child_lineage_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_child_result_identity_immutable
   BEFORE UPDATE ON turn_child_result
   BEGIN
     SELECT RAISE(ABORT, 'turn_child_result_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_historical_input_identity_immutable
   BEFORE UPDATE ON turn_historical_input_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_historical_input_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_historical_model_identity_immutable
   BEFORE UPDATE ON turn_historical_model_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_historical_model_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_historical_tool_identity_immutable
   BEFORE UPDATE ON turn_historical_tool_presentation
   BEGIN
     SELECT RAISE(ABORT, 'turn_historical_tool_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_transcript_redaction_identity_immutable
   BEFORE UPDATE ON turn_transcript_redaction
   BEGIN
     SELECT RAISE(ABORT, 'turn_transcript_redaction_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_candidate_redaction_identity_immutable
   BEFORE UPDATE ON turn_candidate_redaction
   BEGIN
     SELECT RAISE(ABORT, 'turn_candidate_redaction_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_unavailable_source_identity_immutable
   BEFORE UPDATE ON turn_unavailable_source
   BEGIN
     SELECT RAISE(ABORT, 'turn_unavailable_source_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_unavailable_model_identity_immutable
   BEFORE UPDATE ON turn_unavailable_model
   BEGIN
     SELECT RAISE(ABORT, 'turn_unavailable_model_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS turn_unavailable_tool_identity_immutable
   BEFORE UPDATE ON turn_unavailable_tool
   BEGIN
     SELECT RAISE(ABORT, 'turn_unavailable_tool_identity_immutable');
   END`,
] as const

export function install(tx: Transaction) {
  return Effect.forEach(
    statements.entries(),
    ([index, statement]) =>
      tx
        .run(statement)
        .pipe(Effect.mapError((cause) => new Error(`Could not install Turn constraint ${index}: ${String(cause)}`))),
    { discard: true },
  ).pipe(Effect.orDie)
}
