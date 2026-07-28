import { Effect } from "effect"
import { sql } from "drizzle-orm"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV11 } from "../../schema-extras-v11"

export default {
  id: "20260720200330_gate16_learner_goals",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      const triggers = yield* tx.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'trigger'`)
      yield* Effect.forEach(triggers, (trigger) => tx.run(sql`DROP TRIGGER ${sql.identifier(trigger.name)}`), {
        discard: true,
      })
      yield* tx.run(`
        CREATE TABLE \`course_state_history\` (
          \`course_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`title\` text NOT NULL,
          \`withdrawal_reason\` text,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`course_state_history_pk\` PRIMARY KEY(\`course_id\`, \`version\`),
          CONSTRAINT \`fk_course_state_history_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "course_state_history_version_nonnegative" CHECK("version" >= 0),
          CONSTRAINT "course_state_history_title_length" CHECK(length(trim("title")) BETWEEN 1 AND 200),
          CONSTRAINT "course_state_history_withdrawal_reason" CHECK("withdrawal_reason" IS NULL OR "withdrawal_reason" = 'removed'),
          CONSTRAINT "course_state_history_time_nonnegative" CHECK("time_updated" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        INSERT INTO course_state_history (course_id, version, title, withdrawal_reason, time_updated)
        SELECT id, state_version, title, withdrawal_reason, time_updated FROM course;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL CONSTRAINT \`learner_goal_commit_seal_receipt_unique\` UNIQUE,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`learner_goal_commit_seal_invocation_unique\` UNIQUE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_condition\` (
          \`revision_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`content\` text NOT NULL,
          CONSTRAINT \`learner_goal_condition_pk\` PRIMARY KEY(\`revision_id\`, \`ordinal\`),
          CONSTRAINT \`fk_learner_goal_condition_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_condition_ordinal" CHECK("ordinal" BETWEEN 0 AND 15),
          CONSTRAINT "learner_goal_condition_content" CHECK(length(trim("content")) > 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_course_scope\` (
          \`revision_id\` text NOT NULL,
          \`course_id\` text NOT NULL,
          \`course_title\` text NOT NULL,
          \`admission_kind\` text NOT NULL,
          \`admitted_course_version\` integer,
          \`admitted_course_time_updated\` integer,
          \`carried_from_revision_id\` text,
          CONSTRAINT \`learner_goal_course_scope_pk\` PRIMARY KEY(\`revision_id\`, \`course_id\`),
          CONSTRAINT \`fk_learner_goal_course_scope_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_course_scope_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_course_scope_carried_from_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`carried_from_revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_course_scope_title" CHECK(length(trim("course_title")) > 0),
          CONSTRAINT "learner_goal_course_scope_admission" CHECK(("admission_kind" = 'new' AND "admitted_course_version" IS NOT NULL AND "admitted_course_version" >= 0 AND "admitted_course_time_updated" IS NOT NULL AND "admitted_course_time_updated" >= 0 AND "carried_from_revision_id" IS NULL) OR ("admission_kind" = 'carried' AND "admitted_course_version" IS NULL AND "admitted_course_time_updated" IS NULL AND "carried_from_revision_id" IS NOT NULL))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_effect_operation\` (
          \`effect_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`operation_kind\` text NOT NULL,
          \`result_kind\` text NOT NULL,
          \`goal_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`meaning\` text NOT NULL,
          \`replacement_target_kind\` text,
          \`replacement_target_goal_id\` text,
          \`replacement_target_revision_id\` text,
          \`replacement_target_version\` integer,
          CONSTRAINT \`learner_goal_effect_operation_pk\` PRIMARY KEY(\`effect_id\`, \`ordinal\`),
          CONSTRAINT \`fk_learner_goal_effect_operation_effect_id_learner_goal_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_goal_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_operation_goal_id_learner_goal_id_fk\` FOREIGN KEY (\`goal_id\`) REFERENCES \`learner_goal\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_operation_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_operation_replacement_target_goal_id_learner_goal_id_fk\` FOREIGN KEY (\`replacement_target_goal_id\`) REFERENCES \`learner_goal\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_operation_replacement_target_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`replacement_target_revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_effect_operation_ordinal" CHECK("ordinal" BETWEEN 0 AND 7),
          CONSTRAINT "learner_goal_effect_operation_kind" CHECK("operation_kind" IN ('create', 'update', 'replace') AND "result_kind" IN ('changed', 'no_change')),
          CONSTRAINT "learner_goal_effect_operation_result" CHECK(("operation_kind" = 'update' OR "result_kind" = 'changed') AND "version" >= 1 AND "disposition" IN ('active', 'achieved', 'abandoned', 'superseded') AND json_valid("meaning")),
          CONSTRAINT "learner_goal_effect_operation_replacement" CHECK(("operation_kind" = 'replace' AND "result_kind" = 'changed' AND "disposition" = 'superseded' AND "replacement_target_kind" IN ('existing', 'new') AND "replacement_target_goal_id" IS NOT NULL AND "replacement_target_revision_id" IS NOT NULL AND "replacement_target_version" >= 1) OR ("operation_kind" <> 'replace' AND "replacement_target_kind" IS NULL AND "replacement_target_goal_id" IS NULL AND "replacement_target_revision_id" IS NULL AND "replacement_target_version" IS NULL))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_effect\` (
          \`id\` text PRIMARY KEY,
          \`commit_seal_id\` text NOT NULL,
          \`occurrence_id\` text NOT NULL CONSTRAINT \`learner_goal_effect_occurrence_unique\` UNIQUE,
          \`source_order\` integer NOT NULL,
          \`semantic_fingerprint\` text NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`command\` text NOT NULL,
          \`operation_count\` integer NOT NULL,
          \`change_count\` integer NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL CONSTRAINT \`learner_goal_effect_frontier_unique\` UNIQUE,
          \`frontier_time\` integer NOT NULL,
          \`acknowledgement_title\` text NOT NULL,
          \`acknowledgement_body\` text NOT NULL,
          CONSTRAINT \`fk_learner_goal_effect_commit_seal_id_learner_goal_commit_seal_effect_id_fk\` FOREIGN KEY (\`commit_seal_id\`) REFERENCES \`learner_goal_commit_seal\`(\`effect_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_effect_seal_identity" CHECK("commit_seal_id" = "id"),
          CONSTRAINT "learner_goal_effect_identity_format" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'gle_' AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "learner_goal_effect_fingerprint" CHECK(length("semantic_fingerprint") = 64 AND "semantic_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_goal_effect_authorization" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learner_goal_effect_command_json" CHECK(json_valid("command")),
          CONSTRAINT "learner_goal_effect_counts" CHECK("operation_count" BETWEEN 1 AND 8 AND "change_count" BETWEEN 1 AND "operation_count"),
          CONSTRAINT "learner_goal_effect_time_order" CHECK("source_order" >= 1 AND "time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed"),
          CONSTRAINT "learner_goal_effect_acknowledgement" CHECK(length("acknowledgement_title") > 0 AND length("acknowledgement_body") > 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_field_basis\` (
          \`revision_id\` text NOT NULL,
          \`field\` text NOT NULL,
          \`basis_kind\` text NOT NULL,
          \`source_excerpt\` text,
          \`predecessor_revision_id\` text,
          CONSTRAINT \`learner_goal_field_basis_pk\` PRIMARY KEY(\`revision_id\`, \`field\`),
          CONSTRAINT \`fk_learner_goal_field_basis_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_field_basis_predecessor_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`predecessor_revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_field_basis_field" CHECK("field" IN ('outcome', 'conditions', 'scope', 'target', 'disposition')),
          CONSTRAINT "learner_goal_field_basis_shape" CHECK(("basis_kind" = 'authored' AND "source_excerpt" IS NOT NULL AND length("source_excerpt") > 0 AND "predecessor_revision_id" IS NULL) OR ("basis_kind" = 'accepted' AND "source_excerpt" IS NULL AND "predecessor_revision_id" IS NULL) OR ("basis_kind" = 'carried' AND "source_excerpt" IS NULL AND "predecessor_revision_id" IS NOT NULL))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_revision\` (
          \`id\` text PRIMARY KEY,
          \`goal_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`predecessor_id\` text CONSTRAINT \`learner_goal_revision_predecessor_unique\` UNIQUE,
          \`effect_id\` text NOT NULL,
          \`operation_ordinal\` integer NOT NULL,
          \`revision_role\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`source_order\` integer NOT NULL,
          \`outcome\` text NOT NULL,
          \`scope_kind\` text NOT NULL,
          \`target_kind\` text NOT NULL,
          \`target_instant\` integer,
          \`target_local_date\` text,
          \`target_timezone\` text,
          \`target_timezone_release_id\` text,
          \`target_utc_offset_minutes\` integer,
          \`target_source_expression\` text,
          \`target_normalized\` text,
          \`target_normalization_basis\` text,
          \`disposition\` text NOT NULL,
          \`revision_order\` integer NOT NULL CONSTRAINT \`learner_goal_revision_order_unique\` UNIQUE,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL,
          \`frontier_time\` integer NOT NULL,
          CONSTRAINT \`fk_learner_goal_revision_goal_id_learner_goal_id_fk\` FOREIGN KEY (\`goal_id\`) REFERENCES \`learner_goal\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_revision_predecessor_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`predecessor_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_revision_effect_id_learner_goal_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_goal_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_revision_target_timezone_release_id_target_timezone_learner_goal_time_zone_release_id_name_fk\` FOREIGN KEY (\`target_timezone_release_id\`,\`target_timezone\`) REFERENCES \`learner_goal_time_zone\`(\`release_id\`,\`name\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_revision_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_goal_revision_goal_version_unique\` UNIQUE(\`goal_id\`,\`version\`),
          CONSTRAINT \`learner_goal_revision_effect_role_unique\` UNIQUE(\`effect_id\`,\`operation_ordinal\`,\`revision_role\`),
          CONSTRAINT "learner_goal_revision_identity_format" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'glr_' AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "learner_goal_revision_chain_shape" CHECK(("version" = 1 AND "predecessor_id" IS NULL) OR ("version" > 1 AND "predecessor_id" IS NOT NULL)),
          CONSTRAINT "learner_goal_revision_role" CHECK("revision_role" IN ('source', 'target')),
          CONSTRAINT "learner_goal_revision_outcome" CHECK(length(trim("outcome")) > 0),
          CONSTRAINT "learner_goal_revision_scope" CHECK("scope_kind" IN ('learner_home', 'courses')),
          CONSTRAINT "learner_goal_revision_target" CHECK(COALESCE(("target_kind" = 'absent' AND "target_instant" IS NULL AND "target_local_date" IS NULL AND "target_timezone" IS NULL AND "target_timezone_release_id" IS NULL AND "target_utc_offset_minutes" IS NULL AND "target_source_expression" IS NULL AND "target_normalized" IS NULL AND "target_normalization_basis" IS NULL) OR ("target_kind" = 'instant' AND "target_instant" IS NOT NULL AND "target_instant" >= 0 AND "target_local_date" IS NULL AND "target_timezone" IS NULL AND "target_timezone_release_id" IS NULL AND "target_utc_offset_minutes" BETWEEN -840 AND 840 AND "target_source_expression" IS NOT NULL AND length("target_source_expression") > 0 AND "target_normalized" IS NOT NULL AND length("target_normalized") > 0 AND round(unixepoch("target_normalized", 'subsec') * 1000) = "target_instant" AND "target_normalization_basis" = 'explicit_offset') OR ("target_kind" = 'local_date' AND "target_instant" IS NULL AND "target_local_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("target_local_date") = "target_local_date" AND "target_timezone" IS NOT NULL AND length("target_timezone") > 0 AND "target_timezone_release_id" IS NOT NULL AND length("target_timezone_release_id") > 0 AND "target_utc_offset_minutes" IS NULL AND "target_source_expression" IS NOT NULL AND length("target_source_expression") > 0 AND "target_normalized" IS NULL AND "target_normalization_basis" IN ('explicit_date', 'source_temporal_context')), 0)),
          CONSTRAINT "learner_goal_revision_disposition" CHECK("disposition" IN ('active', 'achieved', 'abandoned', 'superseded')),
          CONSTRAINT "learner_goal_revision_order" CHECK("version" >= 1 AND "operation_ordinal" BETWEEN 0 AND 7 AND "source_order" >= 1 AND "revision_order" >= 1 AND "time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed")
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_state\` (
          \`singleton\` integer PRIMARY KEY DEFAULT 1,
          \`revision_sequence\` integer DEFAULT 0 NOT NULL,
          CONSTRAINT "learner_goal_state_singleton" CHECK("singleton" = 1),
          CONSTRAINT "learner_goal_state_revision_nonnegative" CHECK("revision_sequence" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_state_guard\` (
          \`singleton\` integer PRIMARY KEY,
          CONSTRAINT \`fk_learner_goal_state_guard_singleton_learner_goal_state_singleton_fk\` FOREIGN KEY (\`singleton\`) REFERENCES \`learner_goal_state\`(\`singleton\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_state_guard_singleton" CHECK("singleton" = 1)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_time_zone_release\` (
          \`id\` text PRIMARY KEY,
          \`tzdb_version\` text NOT NULL,
          \`engine\` text NOT NULL,
          \`data_sha256\` text NOT NULL,
          CONSTRAINT "learner_goal_time_zone_release_id" CHECK(length("id") > 0),
          CONSTRAINT "learner_goal_time_zone_release_version" CHECK(length("tzdb_version") > 0),
          CONSTRAINT "learner_goal_time_zone_release_engine" CHECK(length("engine") > 0),
          CONSTRAINT "learner_goal_time_zone_release_hash" CHECK(length("data_sha256") = 64 AND "data_sha256" NOT GLOB '*[^0-9a-f]*')
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_time_zone\` (
          \`release_id\` text NOT NULL,
          \`name\` text NOT NULL,
          CONSTRAINT \`learner_goal_time_zone_pk\` PRIMARY KEY(\`release_id\`, \`name\`),
          CONSTRAINT \`fk_learner_goal_time_zone_release_id_learner_goal_time_zone_release_id_fk\` FOREIGN KEY (\`release_id\`) REFERENCES \`learner_goal_time_zone_release\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_time_zone_name" CHECK(length("name") > 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_supersession\` (
          \`revision_id\` text PRIMARY KEY,
          \`source_goal_id\` text NOT NULL,
          \`target_goal_id\` text NOT NULL,
          \`target_revision_id\` text NOT NULL,
          CONSTRAINT \`fk_learner_goal_supersession_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_supersession_source_goal_id_learner_goal_id_fk\` FOREIGN KEY (\`source_goal_id\`) REFERENCES \`learner_goal\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_supersession_target_goal_id_learner_goal_id_fk\` FOREIGN KEY (\`target_goal_id\`) REFERENCES \`learner_goal\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_supersession_target_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`target_revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_supersession_distinct" CHECK("source_goal_id" <> "target_goal_id")
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal\` (
          \`id\` text PRIMARY KEY,
          \`time_created\` integer NOT NULL,
          CONSTRAINT "learner_goal_identity_format" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'gol_' AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "learner_goal_time_nonnegative" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`ALTER TABLE \`learning_command_invocation\` ADD \`goal_semantic_fingerprint\` text;`)
      yield* tx.run(`ALTER TABLE \`learning_command_invocation\` ADD \`goal_command_snapshot\` text;`)
      yield* tx.run(
        `ALTER TABLE \`learning_command_invocation\` ADD \`goal_effect_id\` text REFERENCES learner_goal_effect(id);`,
      )
      yield* tx.run(`ALTER TABLE \`learning_command_invocation\` ADD \`goal_confirmation_snapshot\` text;`)
      yield* tx.run(
        `ALTER TABLE \`learning_command_receipt\` ADD \`goal_effect_id\` text REFERENCES learner_goal_effect(id);`,
      )
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learning_command_invocation\` (
          \`part_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`parent_user_message_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`provider_call_id\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`command_name\` text NOT NULL,
          \`command_version\` integer NOT NULL,
          \`emission_ordinal\` integer NOT NULL,
          \`capability_identity\` text NOT NULL,
          \`capability_version\` integer NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`input_fingerprint\` text NOT NULL,
          \`retained_steering_semantic_fingerprint\` text,
          \`goal_semantic_fingerprint\` text,
          \`goal_command_snapshot\` text,
          \`status\` text NOT NULL,
          \`effect_id\` text,
          \`representation_effect_id\` text,
          \`default_navigation_effect_id\` text,
          \`anchor_navigation_effect_id\` text,
          \`retained_steering_effect_id\` text,
          \`goal_effect_id\` text,
          \`permission_request_id\` text,
          \`goal_confirmation_snapshot\` text,
          \`settlement\` text,
          \`time_admitted\` integer NOT NULL,
          \`time_settled\` integer,
          \`settlement_order\` integer,
          \`turn_id\` text,
          \`input_id\` text,
          CONSTRAINT \`fk_learning_command_invocation_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_representation_effect_id_representation_effect_id_fk\` FOREIGN KEY (\`representation_effect_id\`) REFERENCES \`representation_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_default_navigation_effect_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`default_navigation_effect_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_anchor_navigation_effect_id_learner_course_route_anchor_transition_id_fk\` FOREIGN KEY (\`anchor_navigation_effect_id\`) REFERENCES \`learner_course_route_anchor_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_retained_steering_effect_id_retained_steering_transition_id_fk\` FOREIGN KEY (\`retained_steering_effect_id\`) REFERENCES \`retained_steering_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_goal_effect_id_learner_goal_effect_id_fk\` FOREIGN KEY (\`goal_effect_id\`) REFERENCES \`learner_goal_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_command_invocation_assistant_call_unique\` UNIQUE(\`assistant_message_id\`,\`provider_call_id\`),
          CONSTRAINT \`learning_command_invocation_assistant_ordinal_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learning_command_invocation_call_nonempty" CHECK(length("provider_call_id") > 0),
          CONSTRAINT "learning_command_invocation_command" CHECK("command_name" IN ('accept_course_view_revision', 'representation.convert', 'set_default_course_preference', 'set_course_route_anchor', 'update_retained_learning_steering', 'update_learner_goals')),
          CONSTRAINT "learning_command_invocation_command_version" CHECK("command_version" = 1),
          CONSTRAINT "learning_command_invocation_emission_ordinal" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "learning_command_invocation_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_invocation_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_invocation_capability_match" CHECK(("command_name" = 'accept_course_view_revision' AND "capability_identity" = 'accept_course_view_revision' AND "capability_version" = 1) OR ("command_name" = 'representation.convert' AND "capability_identity" = 'representation.convert' AND "capability_version" = 1) OR ("command_name" = 'set_default_course_preference' AND "capability_identity" = 'set_default_course_preference' AND "capability_version" = 1) OR ("command_name" = 'set_course_route_anchor' AND "capability_identity" = 'set_course_route_anchor' AND "capability_version" = 1) OR ("command_name" = 'update_retained_learning_steering' AND "capability_identity" = 'update_retained_learning_steering' AND "capability_version" = 1) OR ("command_name" = 'update_learner_goals' AND "capability_identity" = 'update_learner_goals' AND "capability_version" = 1)),
          CONSTRAINT "learning_command_invocation_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_invocation_navigation_basis" CHECK(("command_name" = 'set_default_course_preference' AND "authorization_basis" = 'learner_acceptance') OR ("command_name" = 'set_course_route_anchor' AND "authorization_basis" = 'learner_request') OR "command_name" NOT IN ('set_default_course_preference', 'set_course_route_anchor')),
          CONSTRAINT "learning_command_invocation_retained_steering_basis" CHECK("command_name" <> 'update_retained_learning_steering' OR ("authorization_basis" = 'learner_request' AND "turn_id" IS NOT NULL AND "input_id" IS NOT NULL)),
          CONSTRAINT "learning_command_invocation_fingerprint" CHECK(length("input_fingerprint") = 64),
          CONSTRAINT "learning_command_invocation_retained_steering_semantic_fingerprint" CHECK(("command_name" = 'update_retained_learning_steering' AND "retained_steering_semantic_fingerprint" IS NOT NULL AND length("retained_steering_semantic_fingerprint") = 64 AND "retained_steering_semantic_fingerprint" NOT GLOB '*[^0-9a-f]*') OR ("command_name" <> 'update_retained_learning_steering' AND "retained_steering_semantic_fingerprint" IS NULL)),
          CONSTRAINT "learning_command_invocation_goal_semantic_fingerprint" CHECK(("command_name" = 'update_learner_goals' AND "goal_semantic_fingerprint" IS NOT NULL AND length("goal_semantic_fingerprint") = 64 AND "goal_semantic_fingerprint" NOT GLOB '*[^0-9a-f]*' AND json_valid("goal_command_snapshot") AND json_type("goal_command_snapshot") = 'object') OR ("command_name" <> 'update_learner_goals' AND "goal_semantic_fingerprint" IS NULL AND "goal_command_snapshot" IS NULL)),
          CONSTRAINT "learning_command_invocation_status" CHECK("status" IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')),
          CONSTRAINT "learning_command_invocation_permission_shape" CHECK(("command_name" = 'set_default_course_preference' AND "permission_request_id" IS NOT NULL AND length("permission_request_id") > 0) OR ("command_name" = 'update_learner_goals' AND (("authorization_basis" = 'learner_acceptance' AND "permission_request_id" IS NOT NULL AND length("permission_request_id") > 0) OR ("authorization_basis" = 'learner_request' AND "permission_request_id" IS NULL))) OR ("command_name" NOT IN ('set_default_course_preference', 'update_learner_goals') AND "permission_request_id" IS NULL)),
          CONSTRAINT "learning_command_invocation_goal_confirmation_shape" CHECK(("command_name" = 'update_learner_goals' AND "authorization_basis" = 'learner_acceptance' AND (("status" = 'applied' AND json_valid("goal_confirmation_snapshot")) OR ("status" <> 'applied' AND "goal_confirmation_snapshot" IS NULL))) OR ("command_name" <> 'update_learner_goals' AND "goal_confirmation_snapshot" IS NULL) OR ("command_name" = 'update_learner_goals' AND "authorization_basis" = 'learner_request' AND "goal_confirmation_snapshot" IS NULL)),
          CONSTRAINT "learning_command_invocation_settlement_shape" CHECK(("status" = 'admitted' AND "settlement" IS NULL AND "time_settled" IS NULL AND "settlement_order" IS NULL AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL) OR ("status" <> 'admitted' AND "settlement" IS NOT NULL AND "time_settled" IS NOT NULL AND "settlement_order" IS NOT NULL)),
          CONSTRAINT "learning_command_invocation_effect_shape" CHECK(("status" IN ('applied', 'already_applied') AND (("command_name" = 'accept_course_view_revision' AND "effect_id" IS NOT NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL) OR ("command_name" = 'representation.convert' AND "effect_id" IS NULL AND "representation_effect_id" IS NOT NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL) OR ("command_name" = 'set_default_course_preference' AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NOT NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL) OR ("command_name" = 'set_course_route_anchor' AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NOT NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL) OR ("command_name" = 'update_retained_learning_steering' AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NOT NULL AND "goal_effect_id" IS NULL) OR ("command_name" = 'update_learner_goals' AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NOT NULL))) OR ("status" IN ('admitted', 'no_change', 'error') AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL)),
          CONSTRAINT "learning_command_invocation_time_order" CHECK("time_admitted" >= 0 AND ("time_settled" IS NULL OR "time_settled" >= "time_admitted") AND ("settlement_order" IS NULL OR "settlement_order" >= 0))
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_invocation\`(\`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`retained_steering_semantic_fingerprint\`, \`status\`, \`effect_id\`, \`representation_effect_id\`, \`default_navigation_effect_id\`, \`anchor_navigation_effect_id\`, \`retained_steering_effect_id\`, \`permission_request_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\`, \`turn_id\`, \`input_id\`) SELECT \`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`retained_steering_semantic_fingerprint\`, \`status\`, \`effect_id\`, \`representation_effect_id\`, \`default_navigation_effect_id\`, \`anchor_navigation_effect_id\`, \`retained_steering_effect_id\`, \`permission_request_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\`, \`turn_id\`, \`input_id\` FROM \`learning_command_invocation\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_command_invocation\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_command_invocation\` RENAME TO \`learning_command_invocation\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learning_command_receipt\` (
          \`id\` text PRIMARY KEY,
          \`occurrence_id\` text NOT NULL,
          \`origin_session_id\` text NOT NULL,
          \`origin_message_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`learning_command_receipt_invocation_unique\` UNIQUE,
          \`capability_identity\` text NOT NULL,
          \`capability_version\` integer NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`effect_id\` text CONSTRAINT \`learning_command_receipt_effect_unique\` UNIQUE,
          \`representation_effect_id\` text CONSTRAINT \`learning_command_receipt_representation_effect_unique\` UNIQUE,
          \`default_navigation_effect_id\` text CONSTRAINT \`learning_command_receipt_default_navigation_effect_unique\` UNIQUE,
          \`anchor_navigation_effect_id\` text CONSTRAINT \`learning_command_receipt_anchor_navigation_effect_unique\` UNIQUE,
          \`retained_steering_effect_id\` text CONSTRAINT \`learning_command_receipt_retained_steering_effect_unique\` UNIQUE,
          \`goal_effect_id\` text CONSTRAINT \`learning_command_receipt_goal_effect_unique\` UNIQUE,
          \`permission_request_id\` text,
          \`confirmation_snapshot\` text,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learning_command_receipt_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_representation_effect_id_representation_effect_id_fk\` FOREIGN KEY (\`representation_effect_id\`) REFERENCES \`representation_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_default_navigation_effect_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`default_navigation_effect_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_anchor_navigation_effect_id_learner_course_route_anchor_transition_id_fk\` FOREIGN KEY (\`anchor_navigation_effect_id\`) REFERENCES \`learner_course_route_anchor_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_retained_steering_effect_id_retained_steering_transition_id_fk\` FOREIGN KEY (\`retained_steering_effect_id\`) REFERENCES \`retained_steering_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_goal_effect_id_learner_goal_effect_id_fk\` FOREIGN KEY (\`goal_effect_id\`) REFERENCES \`learner_goal_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_command_receipt_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_receipt_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_receipt_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_receipt_navigation_basis" CHECK(("capability_identity" = 'set_default_course_preference' AND "authorization_basis" = 'learner_acceptance') OR ("capability_identity" = 'set_course_route_anchor' AND "authorization_basis" = 'learner_request') OR "capability_identity" NOT IN ('set_default_course_preference', 'set_course_route_anchor')),
          CONSTRAINT "learning_command_receipt_retained_steering_basis" CHECK("capability_identity" <> 'update_retained_learning_steering' OR "authorization_basis" = 'learner_request'),
          CONSTRAINT "learning_command_receipt_effect_shape" CHECK(("capability_identity" = 'accept_course_view_revision' AND "capability_version" = 1 AND "effect_id" IS NOT NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("capability_identity" = 'representation.convert' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NOT NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("capability_identity" = 'set_default_course_preference' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NOT NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL AND "permission_request_id" IS NOT NULL AND "confirmation_snapshot" IS NOT NULL AND json_valid("confirmation_snapshot")) OR ("capability_identity" = 'set_course_route_anchor' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NOT NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("capability_identity" = 'update_retained_learning_steering' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NOT NULL AND "goal_effect_id" IS NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("capability_identity" = 'update_learner_goals' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "goal_effect_id" IS NOT NULL AND (("authorization_basis" = 'learner_request' AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("authorization_basis" = 'learner_acceptance' AND "permission_request_id" IS NOT NULL AND "confirmation_snapshot" IS NOT NULL AND json_valid("confirmation_snapshot"))))),
          CONSTRAINT "learning_command_receipt_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_receipt\`(\`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`effect_id\`, \`representation_effect_id\`, \`default_navigation_effect_id\`, \`anchor_navigation_effect_id\`, \`retained_steering_effect_id\`, \`permission_request_id\`, \`confirmation_snapshot\`, \`time_committed\`, \`commit_order\`) SELECT \`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`effect_id\`, \`representation_effect_id\`, \`default_navigation_effect_id\`, \`anchor_navigation_effect_id\`, \`retained_steering_effect_id\`, \`permission_request_id\`, \`confirmation_snapshot\`, \`time_committed\`, \`commit_order\` FROM \`learning_command_receipt\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_command_receipt\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_command_receipt\` RENAME TO \`learning_command_receipt\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learning_command_invocation_one_mutation_idx\` ON \`learning_command_invocation\` (\`assistant_message_id\`) WHERE "learning_command_invocation"."status" = 'applied';`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_invocation_session_owner_idx\` ON \`learning_command_invocation\` (\`session_id\`,\`assistant_message_id\`,\`part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_invocation_occurrence_idx\` ON \`learning_command_invocation\` (\`occurrence_id\`,\`part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_invocation_admitted_idx\` ON \`learning_command_invocation\` (\`status\`,\`session_id\`,\`time_admitted\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_receipt_occurrence_idx\` ON \`learning_command_receipt\` (\`occurrence_id\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_goal_course_scope_course_idx\` ON \`learner_goal_course_scope\` (\`course_id\`,\`revision_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_state_history_time_idx\` ON \`course_state_history\` (\`course_id\`,\`time_updated\`,\`version\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_goal_revision_history_idx\` ON \`learner_goal_revision\` (\`goal_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_goal_revision_effect_idx\` ON \`learner_goal_revision\` (\`effect_id\`,\`operation_ordinal\`,\`revision_role\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_goal_revision_discovery_idx\` ON \`learner_goal_revision\` (\`disposition\`,\`revision_order\`,\`goal_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_goal_supersession_target_idx\` ON \`learner_goal_supersession\` (\`target_goal_id\`,\`revision_id\`);`,
      )
      yield* installSchemaExtrasV11(tx)
    })
  },
} satisfies DatabaseMigration.Migration
