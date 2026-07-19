import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { installLearningFrontierConstraints } from "../../../learning-frontier.sql"
import { TurnConstraintSchema } from "../../../turn/constraint-schema"
import { TurnMigration } from "../../../turn/migration"

export default {
  id: "20260718134404_gate12_durable_turn",
  up(tx) {
    return Effect.gen(function* () {
      yield* TurnMigration.removeUnreferencedEmptyLegacySessions(tx)
      yield* tx.run(`
        CREATE TABLE \`learning_shared_frontier\` (
          \`singleton\` integer PRIMARY KEY DEFAULT 1,
          \`sequence\` integer DEFAULT 0 NOT NULL,
          \`time_committed\` integer DEFAULT 0 NOT NULL,
          CONSTRAINT "learning_shared_frontier_singleton" CHECK("singleton" = 1),
          CONSTRAINT "learning_shared_frontier_nonnegative" CHECK("sequence" >= 0 AND "time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_historical_message_presentation\` (
          \`message_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`source_session_id\` text NOT NULL,
          \`source_message_id\` text NOT NULL,
          \`source_event_sequence\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_session_historical_message_presentation_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "session_historical_message_time" CHECK("source_event_sequence" >= 0 AND "time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_historical_part_presentation\` (
          \`part_id\` text PRIMARY KEY,
          \`message_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`source_session_id\` text NOT NULL,
          \`source_message_id\` text NOT NULL,
          \`source_part_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_session_historical_part_presentation_part_id_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`part\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_session_historical_part_presentation_message_id_session_historical_message_presentation_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`session_historical_message_presentation\`(\`message_id\`) ON DELETE CASCADE,
          CONSTRAINT "session_historical_part_time" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_candidate_presentation\` (
          \`part_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          CONSTRAINT \`fk_turn_candidate_presentation_part_id_turn_tool_candidate_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`turn_tool_candidate\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_candidate_presentation_part_id_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`part\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_candidate_redaction\` (
          \`part_id\` text PRIMARY KEY,
          \`turn_id\` text NOT NULL,
          \`time_removed\` integer NOT NULL,
          \`reason\` text NOT NULL,
          CONSTRAINT \`fk_turn_candidate_redaction_part_id_turn_tool_candidate_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`turn_tool_candidate\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_candidate_redaction_turn_id_part_id_turn_tool_candidate_turn_id_part_id_fk\` FOREIGN KEY (\`turn_id\`,\`part_id\`) REFERENCES \`turn_tool_candidate\`(\`turn_id\`,\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_candidate_redaction_reason" CHECK("reason" = 'presentation_removed'),
          CONSTRAINT "turn_candidate_redaction_time_nonnegative" CHECK("time_removed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_child_lineage\` (
          \`child_turn_id\` text PRIMARY KEY,
          \`child_session_id\` text NOT NULL,
          \`child_depth\` integer NOT NULL,
          \`parent_turn_id\` text NOT NULL,
          \`parent_session_id\` text NOT NULL,
          \`parent_depth\` integer NOT NULL,
          \`parent_task_part_id\` text NOT NULL,
          \`parent_model_message_id\` text NOT NULL,
          \`delegated_capability\` text NOT NULL,
          CONSTRAINT \`fk_turn_child_lineage_child_turn_id_turn_id_fk\` FOREIGN KEY (\`child_turn_id\`) REFERENCES \`turn\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_child_lineage_child_turn_id_child_session_id_child_depth_turn_id_session_id_depth_fk\` FOREIGN KEY (\`child_turn_id\`,\`child_session_id\`,\`child_depth\`) REFERENCES \`turn\`(\`id\`,\`session_id\`,\`depth\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_child_lineage_parent_turn_id_parent_session_id_parent_depth_turn_id_session_id_depth_fk\` FOREIGN KEY (\`parent_turn_id\`,\`parent_session_id\`,\`parent_depth\`) REFERENCES \`turn\`(\`id\`,\`session_id\`,\`depth\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_turn_child_lineage_parent_turn_id_parent_task_part_id_parent_model_message_id_turn_tool_invocation_turn_id_part_id_assistant_message_id_fk\` FOREIGN KEY (\`parent_turn_id\`,\`parent_task_part_id\`,\`parent_model_message_id\`) REFERENCES \`turn_tool_invocation\`(\`turn_id\`,\`part_id\`,\`assistant_message_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`turn_child_lineage_child_session_unique\` UNIQUE(\`child_turn_id\`,\`child_session_id\`),
          CONSTRAINT "turn_child_lineage_depth" CHECK("parent_depth" >= 0 AND "child_depth" = "parent_depth" + 1)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_child_result\` (
          \`parent_task_part_id\` text PRIMARY KEY,
          \`parent_turn_id\` text NOT NULL,
          \`parent_session_id\` text NOT NULL,
          \`child_turn_id\` text NOT NULL CONSTRAINT \`turn_child_result_child_unique\` UNIQUE,
          \`child_session_id\` text NOT NULL,
          \`terminal_outcome\` text NOT NULL,
          \`requested_output_state\` text NOT NULL,
          \`requested_output\` text,
          \`reason\` text,
          \`time_settled\` integer NOT NULL,
          CONSTRAINT \`fk_turn_child_result_parent_task_part_id_part_id_fk\` FOREIGN KEY (\`parent_task_part_id\`) REFERENCES \`part\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_child_result_parent_turn_id_parent_task_part_id_turn_tool_invocation_turn_id_part_id_fk\` FOREIGN KEY (\`parent_turn_id\`,\`parent_task_part_id\`) REFERENCES \`turn_tool_invocation\`(\`turn_id\`,\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_child_result_terminal_outcome" CHECK("terminal_outcome" IN ('completed', 'failed', 'interrupted', 'exhausted')),
          CONSTRAINT "turn_child_result_output_shape" CHECK(("requested_output_state" = 'complete' AND "requested_output" IS NOT NULL AND "reason" IS NULL) OR ("requested_output_state" = 'incomplete' AND "reason" IS NOT NULL)),
          CONSTRAINT "turn_child_result_time_nonnegative" CHECK("time_settled" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_historical_input_presentation\` (
          \`message_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`source_session_id\` text NOT NULL,
          \`source_turn_id\` text NOT NULL,
          \`source_input_id\` text NOT NULL,
          \`occurrence_id\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_turn_historical_input_presentation_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_historical_input_time_nonnegative" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_historical_model_presentation\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`source_session_id\` text NOT NULL,
          \`source_turn_id\` text NOT NULL,
          \`source_assistant_message_id\` text NOT NULL,
          \`causal_occurrence_id\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_turn_historical_model_presentation_assistant_message_id_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_historical_model_time_nonnegative" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_historical_tool_presentation\` (
          \`part_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`source_session_id\` text NOT NULL,
          \`source_turn_id\` text NOT NULL,
          \`source_assistant_message_id\` text NOT NULL,
          \`source_part_id\` text NOT NULL,
          \`call_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_turn_historical_tool_presentation_part_id_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`part\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_historical_tool_time_nonnegative" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_input_presentation\` (
          \`input_id\` text PRIMARY KEY,
          \`message_id\` text NOT NULL UNIQUE,
          \`session_id\` text NOT NULL,
          CONSTRAINT \`fk_turn_input_presentation_input_id_turn_input_id_fk\` FOREIGN KEY (\`input_id\`) REFERENCES \`turn_input\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_input_presentation_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_input\` (
          \`id\` text PRIMARY KEY,
          \`turn_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`message_id\` text NOT NULL,
          \`source\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`occurrence_id\` text,
          \`parent_model_message_id\` text,
          \`time_admitted\` integer NOT NULL,
          \`envelope_fingerprint\` text NOT NULL,
          CONSTRAINT \`fk_turn_input_turn_id_turn_id_fk\` FOREIGN KEY (\`turn_id\`) REFERENCES \`turn\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_input_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_turn_input_turn_id_session_id_turn_id_session_id_fk\` FOREIGN KEY (\`turn_id\`,\`session_id\`) REFERENCES \`turn\`(\`id\`,\`session_id\`) ON DELETE CASCADE,
          CONSTRAINT \`turn_input_turn_id_unique\` UNIQUE(\`turn_id\`,\`id\`),
          CONSTRAINT \`turn_input_session_id_unique\` UNIQUE(\`session_id\`,\`id\`),
          CONSTRAINT "turn_input_ordinal_nonnegative" CHECK("ordinal" >= 0),
          CONSTRAINT "turn_input_time_nonnegative" CHECK("time_admitted" >= 0),
          CONSTRAINT "turn_input_fingerprint" CHECK(length("envelope_fingerprint") = 64),
          CONSTRAINT "turn_input_source_shape" CHECK(("source" = 'learner_root' AND "ordinal" = 0 AND "occurrence_id" IS NOT NULL AND "parent_model_message_id" IS NULL) OR ("source" = 'learner_steer' AND "ordinal" > 0 AND "occurrence_id" IS NOT NULL AND "parent_model_message_id" IS NULL) OR ("source" = 'delegated_task' AND "ordinal" = 0 AND "parent_model_message_id" IS NOT NULL))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_model_operation\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`turn_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`input_id\` text NOT NULL,
          \`causal_occurrence_id\` text,
          \`ordinal\` integer NOT NULL,
          \`state\` text DEFAULT 'running' NOT NULL,
          \`request_fingerprint\` text NOT NULL,
          \`context_fingerprint\` text NOT NULL,
          \`snapshot_frontier_sequence\` integer NOT NULL,
          \`snapshot_frontier_time\` integer NOT NULL,
          \`observed_shared_frontier_sequence\` integer NOT NULL,
          \`observed_shared_frontier_time\` integer NOT NULL,
          \`time_admitted\` integer NOT NULL,
          \`time_settled\` integer,
          \`candidates_sealed\` integer DEFAULT false NOT NULL,
          \`candidate_count\` integer,
          \`time_candidates_sealed\` integer,
          CONSTRAINT \`fk_turn_model_operation_turn_id_turn_id_fk\` FOREIGN KEY (\`turn_id\`) REFERENCES \`turn\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_model_operation_causal_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`causal_occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_turn_model_operation_turn_id_session_id_turn_id_session_id_fk\` FOREIGN KEY (\`turn_id\`,\`session_id\`) REFERENCES \`turn\`(\`id\`,\`session_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_model_operation_turn_id_input_id_turn_input_turn_id_id_fk\` FOREIGN KEY (\`turn_id\`,\`input_id\`) REFERENCES \`turn_input\`(\`turn_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`turn_model_turn_message_unique\` UNIQUE(\`turn_id\`,\`assistant_message_id\`),
          CONSTRAINT \`turn_model_turn_message_session_unique\` UNIQUE(\`turn_id\`,\`assistant_message_id\`,\`session_id\`),
          CONSTRAINT "turn_model_ordinal_nonnegative" CHECK("ordinal" >= 0),
          CONSTRAINT "turn_model_fingerprints" CHECK(length("request_fingerprint") = 64 AND length("context_fingerprint") = 64),
          CONSTRAINT "turn_model_times" CHECK("snapshot_frontier_sequence" >= 0 AND "observed_shared_frontier_sequence" >= "snapshot_frontier_sequence" AND "snapshot_frontier_time" >= 0 AND "observed_shared_frontier_time" >= "snapshot_frontier_time" AND "time_admitted" >= "snapshot_frontier_time" AND "time_admitted" >= "observed_shared_frontier_time"),
          CONSTRAINT "turn_model_state_shape" CHECK(("state" = 'running' AND "time_settled" IS NULL) OR ("state" IN ('completed', 'failed', 'interrupted') AND "time_settled" IS NOT NULL AND "time_settled" >= "time_admitted")),
          CONSTRAINT "turn_model_candidate_seal_shape" CHECK(("candidates_sealed" = 0 AND "candidate_count" IS NULL AND "time_candidates_sealed" IS NULL) OR ("candidates_sealed" = 1 AND "candidate_count" IS NOT NULL AND "candidate_count" >= 0 AND "time_candidates_sealed" IS NOT NULL AND "time_candidates_sealed" >= "time_admitted"))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_model_presentation\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          CONSTRAINT \`fk_turn_model_presentation_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_model_presentation_assistant_message_id_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`admission_kind\` text NOT NULL,
          \`initial_input_id\` text NOT NULL,
          \`current_input_id\` text NOT NULL,
          \`model_limit\` integer NOT NULL,
          \`tool_limit\` integer NOT NULL,
          \`model_count\` integer DEFAULT 0 NOT NULL,
          \`tool_count\` integer DEFAULT 0 NOT NULL,
          \`state\` text DEFAULT 'running' NOT NULL,
          \`depth\` integer NOT NULL,
          \`normalized_envelope\` text NOT NULL,
          \`envelope_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`time_admitted\` integer NOT NULL,
          \`causal_time\` integer NOT NULL,
          \`time_terminal\` integer,
          \`terminal_reason\` text,
          \`exhaustion_counter\` text,
          \`exhaustion_observed\` integer,
          \`exhaustion_limit\` integer,
          \`exhaustion_attempt_id\` text,
          \`exhaustion_envelope\` text,
          \`exhaustion_envelope_fingerprint\` text,
          CONSTRAINT \`fk_turn_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`turn_id_session_depth_unique\` UNIQUE(\`id\`,\`session_id\`,\`depth\`),
          CONSTRAINT \`turn_id_session_unique\` UNIQUE(\`id\`,\`session_id\`),
          CONSTRAINT "turn_limits_nonnegative" CHECK("model_limit" >= 0 AND "tool_limit" >= 0),
          CONSTRAINT "turn_counts_bounded" CHECK("model_count" >= 0 AND "tool_count" >= 0 AND "model_count" <= "model_limit" AND "tool_count" <= "tool_limit"),
          CONSTRAINT "turn_depth_nonnegative" CHECK("depth" >= 0),
          CONSTRAINT "turn_fingerprints" CHECK(length("envelope_fingerprint") = 64),
          CONSTRAINT "turn_times_nonnegative" CHECK("time_admitted" >= 0 AND "causal_time" >= "time_admitted"),
          CONSTRAINT "turn_lineage_shape" CHECK(("admission_kind" = 'learner' AND "depth" = 0) OR ("admission_kind" = 'delegated_task' AND "depth" > 0)),
          CONSTRAINT "turn_state" CHECK("state" IN ('running', 'completed', 'failed', 'interrupted', 'exhausted')),
          CONSTRAINT "turn_terminal_shape" CHECK(("state" = 'running' AND "time_terminal" IS NULL AND "terminal_reason" IS NULL AND "exhaustion_counter" IS NULL AND "exhaustion_observed" IS NULL AND "exhaustion_limit" IS NULL AND "exhaustion_attempt_id" IS NULL AND "exhaustion_envelope" IS NULL AND "exhaustion_envelope_fingerprint" IS NULL) OR ("state" = 'completed' AND "time_terminal" IS NOT NULL AND "time_terminal" >= "causal_time" AND "terminal_reason" IS NOT NULL AND "terminal_reason" = 'normal' AND "exhaustion_counter" IS NULL AND "exhaustion_observed" IS NULL AND "exhaustion_limit" IS NULL AND "exhaustion_attempt_id" IS NULL AND "exhaustion_envelope" IS NULL AND "exhaustion_envelope_fingerprint" IS NULL) OR ("state" = 'failed' AND "time_terminal" IS NOT NULL AND "time_terminal" >= "causal_time" AND "terminal_reason" IS NOT NULL AND "terminal_reason" IN ('provider_failure', 'tool_runtime_failure', 'permission_failure', 'projection_failure', 'owner_failure', 'integrity_failure') AND "exhaustion_counter" IS NULL AND "exhaustion_observed" IS NULL AND "exhaustion_limit" IS NULL AND "exhaustion_attempt_id" IS NULL AND "exhaustion_envelope" IS NULL AND "exhaustion_envelope_fingerprint" IS NULL) OR ("state" = 'interrupted' AND "time_terminal" IS NOT NULL AND "time_terminal" >= "causal_time" AND "terminal_reason" IS NOT NULL AND "terminal_reason" IN ('learner_interrupt', 'ancestor_interrupt', 'owner_handoff_failed', 'owner_lost', 'startup_recovery') AND "exhaustion_counter" IS NULL AND "exhaustion_observed" IS NULL AND "exhaustion_limit" IS NULL AND "exhaustion_attempt_id" IS NULL AND "exhaustion_envelope" IS NULL AND "exhaustion_envelope_fingerprint" IS NULL) OR ("state" = 'exhausted' AND "time_terminal" IS NOT NULL AND "time_terminal" >= "causal_time" AND "terminal_reason" IS NOT NULL AND "exhaustion_counter" IS NOT NULL AND "exhaustion_observed" IS NOT NULL AND "exhaustion_limit" IS NOT NULL AND (("exhaustion_counter" = 'model' AND "terminal_reason" = 'model_limit' AND "exhaustion_observed" = "model_count" AND "exhaustion_limit" = "model_limit") OR ("exhaustion_counter" = 'tool' AND "terminal_reason" = 'tool_limit' AND "exhaustion_observed" = "tool_count" AND "exhaustion_limit" = "tool_limit")) AND "exhaustion_attempt_id" IS NOT NULL AND "exhaustion_envelope" IS NOT NULL AND "exhaustion_envelope_fingerprint" IS NOT NULL AND length("exhaustion_envelope_fingerprint") = 64))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_tool_candidate\` (
          \`part_id\` text PRIMARY KEY,
          \`turn_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`call_id\` text NOT NULL,
          \`tool\` text NOT NULL,
          \`emission_ordinal\` integer NOT NULL,
          \`state\` text DEFAULT 'pending_admission' NOT NULL,
          \`normalized_envelope\` text NOT NULL,
          \`envelope_fingerprint\` text NOT NULL,
          \`time_registered\` integer NOT NULL,
          \`time_terminal\` integer,
          \`exhaustion_turn_id\` text,
          CONSTRAINT \`fk_turn_tool_candidate_turn_id_turn_id_fk\` FOREIGN KEY (\`turn_id\`) REFERENCES \`turn\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_tool_candidate_turn_id_assistant_message_id_session_id_turn_model_operation_turn_id_assistant_message_id_session_id_fk\` FOREIGN KEY (\`turn_id\`,\`assistant_message_id\`,\`session_id\`) REFERENCES \`turn_model_operation\`(\`turn_id\`,\`assistant_message_id\`,\`session_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_tool_candidate_exhaustion_turn_id_turn_id_fk\` FOREIGN KEY (\`exhaustion_turn_id\`) REFERENCES \`turn\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`turn_candidate_turn_part_unique\` UNIQUE(\`turn_id\`,\`part_id\`),
          CONSTRAINT \`turn_candidate_turn_part_model_unique\` UNIQUE(\`turn_id\`,\`part_id\`,\`assistant_message_id\`),
          CONSTRAINT "turn_candidate_ordinal_nonnegative" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "turn_candidate_fingerprint" CHECK(length("envelope_fingerprint") = 64),
          CONSTRAINT "turn_candidate_time_nonnegative" CHECK("time_registered" >= 0),
          CONSTRAINT "turn_candidate_state_shape" CHECK(("state" IN ('pending_admission', 'admitted') AND "time_terminal" IS NULL AND "exhaustion_turn_id" IS NULL) OR ("state" IN ('not_started_interrupted', 'not_started_failed') AND "time_terminal" IS NOT NULL AND "time_terminal" >= "time_registered" AND "exhaustion_turn_id" IS NULL) OR ("state" IN ('not_started_limit', 'not_started_turn_exhausted') AND "time_terminal" IS NOT NULL AND "time_terminal" >= "time_registered" AND "exhaustion_turn_id" = "turn_id"))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_tool_invocation\` (
          \`part_id\` text PRIMARY KEY,
          \`turn_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`state\` text DEFAULT 'running' NOT NULL,
          \`observed_shared_frontier_sequence\` integer NOT NULL,
          \`observed_shared_frontier_time\` integer NOT NULL,
          \`consumed_shared_frontier_sequence\` integer NOT NULL,
          \`consumed_shared_frontier_time\` integer NOT NULL,
          \`resulting_shared_frontier_sequence\` integer,
          \`resulting_shared_frontier_time\` integer,
          \`time_admitted\` integer NOT NULL,
          \`time_settled\` integer,
          CONSTRAINT \`fk_turn_tool_invocation_part_id_turn_tool_candidate_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`turn_tool_candidate\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_tool_invocation_turn_id_part_id_assistant_message_id_turn_tool_candidate_turn_id_part_id_assistant_message_id_fk\` FOREIGN KEY (\`turn_id\`,\`part_id\`,\`assistant_message_id\`) REFERENCES \`turn_tool_candidate\`(\`turn_id\`,\`part_id\`,\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_tool_invocation_turn_id_session_id_turn_id_session_id_fk\` FOREIGN KEY (\`turn_id\`,\`session_id\`) REFERENCES \`turn\`(\`id\`,\`session_id\`) ON DELETE CASCADE,
          CONSTRAINT \`turn_invocation_turn_part_unique\` UNIQUE(\`turn_id\`,\`part_id\`),
          CONSTRAINT \`turn_invocation_turn_part_model_unique\` UNIQUE(\`turn_id\`,\`part_id\`,\`assistant_message_id\`),
          CONSTRAINT "turn_invocation_ordinal_nonnegative" CHECK("ordinal" >= 0),
          CONSTRAINT "turn_invocation_time_nonnegative" CHECK("observed_shared_frontier_sequence" >= 0 AND "consumed_shared_frontier_sequence" >= "observed_shared_frontier_sequence" AND "observed_shared_frontier_time" >= 0 AND "consumed_shared_frontier_time" >= "observed_shared_frontier_time" AND ("resulting_shared_frontier_sequence" IS NULL OR ("resulting_shared_frontier_sequence" >= "consumed_shared_frontier_sequence" AND "resulting_shared_frontier_time" >= "consumed_shared_frontier_time")) AND "time_admitted" >= "consumed_shared_frontier_time"),
          CONSTRAINT "turn_invocation_state_shape" CHECK(("state" = 'running' AND "time_settled" IS NULL AND (("resulting_shared_frontier_sequence" IS NULL AND "resulting_shared_frontier_time" IS NULL) OR ("resulting_shared_frontier_sequence" IS NOT NULL AND "resulting_shared_frontier_time" IS NOT NULL))) OR ("state" IN ('completed', 'failed', 'interrupted') AND "time_settled" IS NOT NULL AND "time_settled" >= "time_admitted" AND "time_settled" >= "consumed_shared_frontier_time" AND (("resulting_shared_frontier_sequence" IS NULL AND "resulting_shared_frontier_time" IS NULL) OR ("resulting_shared_frontier_sequence" IS NOT NULL AND "resulting_shared_frontier_time" IS NOT NULL AND "time_settled" >= "resulting_shared_frontier_time"))))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_transcript_redaction\` (
          \`turn_id\` text PRIMARY KEY,
          \`time_removed\` integer NOT NULL,
          \`reason\` text NOT NULL,
          CONSTRAINT \`fk_turn_transcript_redaction_turn_id_turn_id_fk\` FOREIGN KEY (\`turn_id\`) REFERENCES \`turn\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_transcript_redaction_reason" CHECK("reason" = 'presentation_removed'),
          CONSTRAINT "turn_transcript_redaction_time_nonnegative" CHECK("time_removed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_unavailable_model\` (
          \`turn_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL CONSTRAINT \`turn_unavailable_model_message_unique\` UNIQUE,
          \`causal_occurrence_id\` text,
          CONSTRAINT \`fk_turn_unavailable_model_turn_id_turn_unavailable_source_turn_id_fk\` FOREIGN KEY (\`turn_id\`) REFERENCES \`turn_unavailable_source\`(\`turn_id\`) ON DELETE CASCADE,
          CONSTRAINT \`turn_unavailable_model_identity_unique\` UNIQUE(\`turn_id\`,\`assistant_message_id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_unavailable_source\` (
          \`turn_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`admission_kind\` text NOT NULL,
          \`time_admitted\` integer NOT NULL,
          \`time_terminal\` integer NOT NULL,
          \`outcome\` text NOT NULL,
          \`parent_turn_id\` text,
          \`parent_session_id\` text,
          \`parent_task_part_id\` text,
          \`parent_model_message_id\` text,
          \`depth\` integer NOT NULL,
          \`causal_occurrence_id\` text,
          \`time_deleted\` integer NOT NULL,
          CONSTRAINT "turn_unavailable_outcome" CHECK("outcome" IN ('completed', 'failed', 'interrupted', 'exhausted')),
          CONSTRAINT "turn_unavailable_time_nonnegative" CHECK("time_admitted" >= 0 AND "depth" >= 0 AND "time_deleted" >= "time_admitted" AND ("time_terminal" IS NULL OR ("time_terminal" >= "time_admitted" AND "time_deleted" >= "time_terminal"))),
          CONSTRAINT "turn_unavailable_parent_shape" CHECK(("admission_kind" = 'learner' AND "depth" = 0 AND "parent_turn_id" IS NULL AND "parent_session_id" IS NULL AND "parent_task_part_id" IS NULL AND "parent_model_message_id" IS NULL) OR ("admission_kind" = 'delegated_task' AND "depth" > 0 AND "parent_turn_id" IS NOT NULL AND "parent_session_id" IS NOT NULL AND "parent_task_part_id" IS NOT NULL AND "parent_model_message_id" IS NOT NULL)),
          CONSTRAINT "turn_unavailable_terminal_shape" CHECK("time_terminal" IS NOT NULL)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_unavailable_tool\` (
          \`turn_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`part_id\` text NOT NULL CONSTRAINT \`turn_unavailable_tool_part_unique\` UNIQUE,
          \`call_id\` text NOT NULL,
          CONSTRAINT \`fk_turn_unavailable_tool_turn_id_turn_unavailable_source_turn_id_fk\` FOREIGN KEY (\`turn_id\`) REFERENCES \`turn_unavailable_source\`(\`turn_id\`) ON DELETE CASCADE,
          CONSTRAINT \`turn_unavailable_tool_identity_unique\` UNIQUE(\`turn_id\`,\`part_id\`)
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`session_historical_message_source_idx\` ON \`session_historical_message_presentation\` (\`source_session_id\`,\`source_message_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_historical_part_source_idx\` ON \`session_historical_part_presentation\` (\`source_session_id\`,\`source_part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`turn_candidate_redaction_turn_idx\` ON \`turn_candidate_redaction\` (\`turn_id\`,\`part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`turn_child_lineage_parent_idx\` ON \`turn_child_lineage\` (\`parent_turn_id\`,\`parent_task_part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`turn_historical_input_source_idx\` ON \`turn_historical_input_presentation\` (\`source_turn_id\`,\`source_input_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`turn_historical_model_source_idx\` ON \`turn_historical_model_presentation\` (\`source_turn_id\`,\`source_assistant_message_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`turn_historical_tool_source_idx\` ON \`turn_historical_tool_presentation\` (\`source_turn_id\`,\`source_part_id\`);`,
      )
      yield* tx.run(`CREATE UNIQUE INDEX \`turn_input_turn_ordinal_idx\` ON \`turn_input\` (\`turn_id\`,\`ordinal\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`turn_input_message_idx\` ON \`turn_input\` (\`message_id\`);`)
      yield* tx.run(`CREATE INDEX \`turn_input_occurrence_idx\` ON \`turn_input\` (\`occurrence_id\`);`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`turn_model_turn_ordinal_idx\` ON \`turn_model_operation\` (\`turn_id\`,\`ordinal\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`turn_one_running_per_session_idx\` ON \`turn\` (\`session_id\`) WHERE "turn"."state" = 'running';`,
      )
      yield* tx.run(`CREATE INDEX \`turn_session_admitted_idx\` ON \`turn\` (\`session_id\`,\`time_admitted\`,\`id\`);`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`turn_candidate_model_emission_idx\` ON \`turn_tool_candidate\` (\`assistant_message_id\`,\`emission_ordinal\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`turn_candidate_model_call_idx\` ON \`turn_tool_candidate\` (\`assistant_message_id\`,\`call_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`turn_invocation_turn_ordinal_idx\` ON \`turn_tool_invocation\` (\`turn_id\`,\`ordinal\`);`,
      )
      yield* tx.run(`CREATE INDEX \`turn_unavailable_session_idx\` ON \`turn_unavailable_source\` (\`session_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`turn_unavailable_parent_idx\` ON \`turn_unavailable_source\` (\`parent_turn_id\`,\`parent_task_part_id\`);`,
      )
      // Existing Gate 8 receipts predate durable Turns and remain explicitly
      // unlinked; every post-Gate-12 admission writes both opaque identities.
      const learningColumns = yield* tx.all<{ name: string }>(`PRAGMA table_info('learning_command_invocation')`)
      if (!learningColumns.some((column) => column.name === "turn_id")) {
        yield* tx.run(`ALTER TABLE \`learning_command_invocation\` ADD \`turn_id\` text;`)
      }
      if (!learningColumns.some((column) => column.name === "input_id")) {
        yield* tx.run(`ALTER TABLE \`learning_command_invocation\` ADD \`input_id\` text;`)
      }
      yield* installLearningFrontierConstraints(tx)
      yield* TurnConstraintSchema.install(tx)
    })
  },
} satisfies DatabaseMigration.Migration
