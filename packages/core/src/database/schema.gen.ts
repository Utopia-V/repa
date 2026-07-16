import { Effect } from "effect"
import type { DatabaseMigration } from "./migration"

export default {
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`workspace\` (
          \`id\` text PRIMARY KEY,
          \`type\` text NOT NULL,
          \`name\` text DEFAULT '' NOT NULL,
          \`branch\` text,
          \`directory\` text,
          \`extra\` text,
          \`project_id\` text NOT NULL,
          \`time_used\` integer NOT NULL,
          CONSTRAINT \`fk_workspace_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`data_migration\` (
          \`name\` text PRIMARY KEY,
          \`time_completed\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_admitted_occurrence\` (
          \`id\` text PRIMARY KEY,
          \`origin_session_id\` text NOT NULL,
          \`origin_message_id\` text NOT NULL,
          \`time_admitted\` integer NOT NULL,
          CONSTRAINT \`learning_admitted_occurrence_origin_unique\` UNIQUE(\`origin_session_id\`,\`origin_message_id\`),
          CONSTRAINT "learning_admitted_occurrence_time_nonnegative" CHECK("time_admitted" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_historical_tool_presentation\` (
          \`part_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`source_session_id\` text NOT NULL,
          \`source_assistant_message_id\` text NOT NULL,
          \`source_part_id\` text NOT NULL,
          \`provenance\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_learning_historical_tool_presentation_part_id_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`part\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "learning_historical_tool_presentation_provenance" CHECK("provenance" = 'fork_clone'),
          CONSTRAINT "learning_historical_tool_presentation_time_nonnegative" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_occurrence_presentation\` (
          \`message_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`provenance\` text NOT NULL,
          \`source_message_id\` text,
          \`content_fingerprint\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_learning_occurrence_presentation_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_learning_occurrence_presentation_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_occurrence_presentation_provenance" CHECK("provenance" IN ('origin', 'compaction_replay', 'fork_clone')),
          CONSTRAINT "learning_occurrence_presentation_source_shape" CHECK(("provenance" = 'origin' AND "source_message_id" IS NULL) OR ("provenance" <> 'origin' AND "source_message_id" IS NOT NULL)),
          CONSTRAINT "learning_occurrence_presentation_fingerprint" CHECK(length("content_fingerprint") = 64),
          CONSTRAINT "learning_occurrence_presentation_time_nonnegative" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_occurrence_tombstone\` (
          \`occurrence_id\` text PRIMARY KEY,
          \`reason\` text NOT NULL,
          \`time_deleted\` integer NOT NULL,
          CONSTRAINT \`fk_learning_occurrence_tombstone_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "learning_occurrence_tombstone_reason" CHECK("reason" = 'source_unavailable'),
          CONSTRAINT "learning_occurrence_tombstone_time_nonnegative" CHECK("time_deleted" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`account_state\` (
          \`id\` integer PRIMARY KEY,
          \`active_account_id\` text,
          \`active_org_id\` text,
          CONSTRAINT \`fk_account_state_active_account_id_account_id_fk\` FOREIGN KEY (\`active_account_id\`) REFERENCES \`account\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`account\` (
          \`id\` text PRIMARY KEY,
          \`email\` text NOT NULL,
          \`url\` text NOT NULL,
          \`access_token\` text NOT NULL,
          \`refresh_token\` text NOT NULL,
          \`token_expiry\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`control_account\` (
          \`email\` text NOT NULL,
          \`url\` text NOT NULL,
          \`access_token\` text NOT NULL,
          \`refresh_token\` text NOT NULL,
          \`token_expiry\` integer,
          \`active\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`control_account_pk\` PRIMARY KEY(\`email\`, \`url\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_item\` (
          \`id\` text PRIMARY KEY,
          \`course_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_course_item_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`course_item_course_id_id_unique\` UNIQUE(\`course_id\`,\`id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_selection_acceptance_effect\` (
          \`id\` text PRIMARY KEY,
          \`occurrence_id\` text NOT NULL,
          \`course_id\` text NOT NULL,
          \`accepted_revision_id\` text NOT NULL,
          \`previous_revision_id\` text,
          \`previous_selection_version\` integer NOT NULL,
          \`committed_selection_version\` integer NOT NULL,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT \`fk_course_selection_acceptance_effect_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_selection_acceptance_effect_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_selection_acceptance_effect_course_id_accepted_revision_id_course_view_revision_course_id_id_fk\` FOREIGN KEY (\`course_id\`,\`accepted_revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_selection_acceptance_effect_course_id_previous_revision_id_course_view_revision_course_id_id_fk\` FOREIGN KEY (\`course_id\`,\`previous_revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`course_selection_acceptance_effect_address_unique\` UNIQUE(\`occurrence_id\`,\`course_id\`),
          CONSTRAINT "course_selection_acceptance_effect_versions" CHECK("previous_selection_version" >= 0 AND "committed_selection_version" = "previous_selection_version" + 1),
          CONSTRAINT "course_selection_acceptance_effect_time_nonnegative" CHECK("time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course\` (
          \`id\` text PRIMARY KEY,
          \`title\` text NOT NULL,
          \`state_version\` integer DEFAULT 0 NOT NULL,
          \`withdrawal_reason\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT "course_title_length" CHECK(length(trim("title")) BETWEEN 1 AND 200),
          CONSTRAINT "course_state_version_nonnegative" CHECK("state_version" >= 0),
          CONSTRAINT "course_withdrawal_reason" CHECK("withdrawal_reason" IS NULL OR "withdrawal_reason" = 'removed')
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_view_revision_item\` (
          \`course_id\` text NOT NULL,
          \`view_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          \`item_id\` text NOT NULL,
          \`parent_item_id\` text,
          \`title\` text NOT NULL,
          \`preorder_position\` integer NOT NULL,
          \`depth\` integer NOT NULL,
          CONSTRAINT \`course_view_revision_item_pk\` PRIMARY KEY(\`revision_id\`, \`item_id\`),
          CONSTRAINT \`fk_course_view_revision_item_course_id_view_id_revision_id_course_view_revision_course_id_view_id_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`view_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_view_revision_item_course_id_item_id_course_item_course_id_id_fk\` FOREIGN KEY (\`course_id\`,\`item_id\`) REFERENCES \`course_item\`(\`course_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_view_revision_item_course_id_view_id_revision_id_parent_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`revision_id\`,\`parent_item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`course_view_revision_item_owner_unique\` UNIQUE(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`),
          CONSTRAINT \`course_view_revision_item_position_unique\` UNIQUE(\`revision_id\`,\`preorder_position\`),
          CONSTRAINT "course_view_revision_item_title_length" CHECK(length(trim("title")) BETWEEN 1 AND 500),
          CONSTRAINT "course_view_revision_item_position_nonnegative" CHECK("preorder_position" >= 0),
          CONSTRAINT "course_view_revision_item_depth" CHECK("depth" BETWEEN 0 AND 16)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_view_revision_mapping_group\` (
          \`id\` text PRIMARY KEY,
          \`course_id\` text NOT NULL,
          \`view_id\` text NOT NULL,
          \`source_revision_id\` text NOT NULL,
          \`target_revision_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`source_key\` text NOT NULL,
          \`target_key\` text NOT NULL,
          CONSTRAINT \`fk_course_view_revision_mapping_group_course_id_view_id_source_revision_id_course_view_revision_course_id_view_id_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`source_revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`view_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_view_revision_mapping_group_course_id_view_id_target_revision_id_course_view_revision_course_id_view_id_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`target_revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`view_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`course_view_revision_mapping_group_owner_unique\` UNIQUE(\`course_id\`,\`view_id\`,\`source_revision_id\`,\`target_revision_id\`,\`id\`),
          CONSTRAINT "course_view_revision_mapping_group_kind" CHECK("kind" IN ('preserve', 'split', 'merge'))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_view_revision_mapping_source\` (
          \`course_id\` text NOT NULL,
          \`view_id\` text NOT NULL,
          \`source_revision_id\` text NOT NULL,
          \`target_revision_id\` text NOT NULL,
          \`group_id\` text NOT NULL,
          \`item_id\` text NOT NULL,
          CONSTRAINT \`course_view_revision_mapping_source_pk\` PRIMARY KEY(\`group_id\`, \`item_id\`),
          CONSTRAINT \`fk_course_view_revision_mapping_source_course_id_view_id_source_revision_id_target_revision_id_group_id_course_view_revision_mapping_group_course_id_view_id_source_revision_id_target_revision_id_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`source_revision_id\`,\`target_revision_id\`,\`group_id\`) REFERENCES \`course_view_revision_mapping_group\`(\`course_id\`,\`view_id\`,\`source_revision_id\`,\`target_revision_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_view_revision_mapping_source_course_id_view_id_source_revision_id_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`source_revision_id\`,\`item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_view_revision_mapping_target\` (
          \`course_id\` text NOT NULL,
          \`view_id\` text NOT NULL,
          \`source_revision_id\` text NOT NULL,
          \`target_revision_id\` text NOT NULL,
          \`group_id\` text NOT NULL,
          \`item_id\` text NOT NULL,
          CONSTRAINT \`course_view_revision_mapping_target_pk\` PRIMARY KEY(\`group_id\`, \`item_id\`),
          CONSTRAINT \`fk_course_view_revision_mapping_target_course_id_view_id_source_revision_id_target_revision_id_group_id_course_view_revision_mapping_group_course_id_view_id_source_revision_id_target_revision_id_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`source_revision_id\`,\`target_revision_id\`,\`group_id\`) REFERENCES \`course_view_revision_mapping_group\`(\`course_id\`,\`view_id\`,\`source_revision_id\`,\`target_revision_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_view_revision_mapping_target_course_id_view_id_target_revision_id_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`target_revision_id\`,\`item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_view_revision_reuse_citation\` (
          \`id\` text PRIMARY KEY,
          \`course_id\` text NOT NULL,
          \`source_view_id\` text NOT NULL,
          \`source_revision_id\` text NOT NULL,
          \`target_view_id\` text NOT NULL,
          \`target_revision_id\` text NOT NULL,
          \`item_id\` text NOT NULL,
          CONSTRAINT \`fk_course_view_revision_reuse_citation_course_id_source_view_id_source_revision_id_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`source_view_id\`,\`source_revision_id\`,\`item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_view_revision_reuse_citation_course_id_target_view_id_target_revision_id_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`target_view_id\`,\`target_revision_id\`,\`item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`course_view_revision_reuse_citation_target_unique\` UNIQUE(\`target_revision_id\`,\`item_id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_view_revision_state\` (
          \`course_id\` text NOT NULL,
          \`view_id\` text NOT NULL,
          \`revision_id\` text PRIMARY KEY,
          \`state_version\` integer DEFAULT 0 NOT NULL,
          \`withdrawal_reason\` text,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_course_view_revision_state_course_id_view_id_revision_id_course_view_revision_course_id_view_id_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`view_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`course_view_revision_state_course_id_revision_id_unique\` UNIQUE(\`course_id\`,\`revision_id\`),
          CONSTRAINT "course_view_revision_state_version_nonnegative" CHECK("state_version" >= 0),
          CONSTRAINT "course_view_revision_state_withdrawal_reason" CHECK("withdrawal_reason" IS NULL OR "withdrawal_reason" IN ('rejected_candidate', 'removed'))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_view_revision\` (
          \`id\` text PRIMARY KEY,
          \`course_id\` text NOT NULL,
          \`view_id\` text NOT NULL,
          \`revision_number\` integer NOT NULL,
          \`predecessor_revision_id\` text,
          \`authorship_basis\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_course_view_revision_course_id_view_id_course_view_course_id_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`) REFERENCES \`course_view\`(\`course_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_view_revision_course_id_view_id_predecessor_revision_id_course_view_revision_course_id_view_id_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`predecessor_revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`view_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`course_view_revision_course_id_id_unique\` UNIQUE(\`course_id\`,\`id\`),
          CONSTRAINT \`course_view_revision_course_view_id_id_unique\` UNIQUE(\`course_id\`,\`view_id\`,\`id\`),
          CONSTRAINT \`course_view_revision_number_unique\` UNIQUE(\`course_id\`,\`view_id\`,\`revision_number\`),
          CONSTRAINT "course_view_revision_number_positive" CHECK("revision_number" >= 1),
          CONSTRAINT "course_view_revision_predecessor_shape" CHECK(("revision_number" = 1 AND "predecessor_revision_id" IS NULL) OR ("revision_number" > 1 AND "predecessor_revision_id" IS NOT NULL)),
          CONSTRAINT "course_view_revision_authorship_basis" CHECK("authorship_basis" IN ('learner_authored', 'learner_directed', 'tutor_proposed'))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_view\` (
          \`id\` text PRIMARY KEY,
          \`course_id\` text NOT NULL,
          \`name\` text NOT NULL,
          \`state_version\` integer DEFAULT 0 NOT NULL,
          \`withdrawal_reason\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_course_view_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`course_view_course_id_id_unique\` UNIQUE(\`course_id\`,\`id\`),
          CONSTRAINT "course_view_name_length" CHECK(length(trim("name")) BETWEEN 1 AND 200),
          CONSTRAINT "course_view_state_version_nonnegative" CHECK("state_version" >= 0),
          CONSTRAINT "course_view_withdrawal_reason" CHECK("withdrawal_reason" IS NULL OR "withdrawal_reason" = 'removed')
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`course_working_selection\` (
          \`course_id\` text PRIMARY KEY,
          \`revision_id\` text,
          \`version\` integer DEFAULT 0 NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_course_working_selection_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_working_selection_course_id_revision_id_course_view_revision_course_id_id_fk\` FOREIGN KEY (\`course_id\`,\`revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "course_working_selection_version_nonnegative" CHECK("version" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`credential\` (
          \`id\` text PRIMARY KEY,
          \`integration_id\` text,
          \`label\` text NOT NULL,
          \`value\` text NOT NULL,
          \`connector_id\` text,
          \`method_id\` text,
          \`active\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`event_sequence\` (
          \`aggregate_id\` text PRIMARY KEY,
          \`seq\` integer NOT NULL,
          \`owner_id\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`event\` (
          \`id\` text PRIMARY KEY,
          \`aggregate_id\` text NOT NULL,
          \`seq\` integer NOT NULL,
          \`type\` text NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_event_aggregate_id_event_sequence_aggregate_id_fk\` FOREIGN KEY (\`aggregate_id\`) REFERENCES \`event_sequence\`(\`aggregate_id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_command_invocation\` (
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
          \`status\` text NOT NULL,
          \`effect_id\` text,
          \`settlement\` text,
          \`time_admitted\` integer NOT NULL,
          \`time_settled\` integer,
          \`settlement_order\` integer,
          CONSTRAINT \`fk_learning_command_invocation_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_command_invocation_assistant_call_unique\` UNIQUE(\`assistant_message_id\`,\`provider_call_id\`),
          CONSTRAINT \`learning_command_invocation_assistant_ordinal_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learning_command_invocation_call_nonempty" CHECK(length("provider_call_id") > 0),
          CONSTRAINT "learning_command_invocation_command" CHECK("command_name" = 'accept_course_view_revision'),
          CONSTRAINT "learning_command_invocation_command_version" CHECK("command_version" = 1),
          CONSTRAINT "learning_command_invocation_emission_ordinal" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "learning_command_invocation_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_invocation_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_invocation_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_invocation_fingerprint" CHECK(length("input_fingerprint") = 64),
          CONSTRAINT "learning_command_invocation_status" CHECK("status" IN ('admitted', 'applied', 'already_applied', 'error')),
          CONSTRAINT "learning_command_invocation_settlement_shape" CHECK(("status" = 'admitted' AND "settlement" IS NULL AND "time_settled" IS NULL AND "settlement_order" IS NULL AND "effect_id" IS NULL) OR ("status" <> 'admitted' AND "settlement" IS NOT NULL AND "time_settled" IS NOT NULL AND "settlement_order" IS NOT NULL)),
          CONSTRAINT "learning_command_invocation_effect_shape" CHECK(("status" IN ('applied', 'already_applied') AND "effect_id" IS NOT NULL) OR ("status" IN ('admitted', 'error') AND "effect_id" IS NULL)),
          CONSTRAINT "learning_command_invocation_time_order" CHECK("time_admitted" >= 0 AND ("time_settled" IS NULL OR "time_settled" >= "time_admitted") AND ("settlement_order" IS NULL OR "settlement_order" >= 0))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_command_receipt\` (
          \`id\` text PRIMARY KEY,
          \`occurrence_id\` text NOT NULL,
          \`origin_session_id\` text NOT NULL,
          \`origin_message_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`learning_command_receipt_invocation_unique\` UNIQUE,
          \`capability_identity\` text NOT NULL,
          \`capability_version\` integer NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`effect_id\` text NOT NULL CONSTRAINT \`learning_command_receipt_effect_unique\` UNIQUE,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learning_command_receipt_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_command_receipt_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_receipt_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_receipt_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_receipt_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`permission\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`action\` text NOT NULL,
          \`resource\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_permission_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`project_directory\` (
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`type\` text,
          \`strategy\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`project_directory_pk\` PRIMARY KEY(\`project_id\`, \`directory\`),
          CONSTRAINT \`fk_project_directory_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`project\` (
          \`id\` text PRIMARY KEY,
          \`worktree\` text NOT NULL,
          \`vcs\` text,
          \`name\` text,
          \`icon_url\` text,
          \`icon_url_override\` text,
          \`icon_color\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_initialized\` integer,
          \`sandboxes\` text NOT NULL,
          \`commands\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`message\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_message_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`part\` (
          \`id\` text PRIMARY KEY,
          \`message_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_part_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_context_epoch\` (
          \`session_id\` text PRIMARY KEY,
          \`baseline\` text NOT NULL,
          \`snapshot\` text NOT NULL,
          \`baseline_seq\` integer NOT NULL,
          CONSTRAINT \`fk_session_context_epoch_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_input\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`prompt\` text NOT NULL,
          \`delivery\` text NOT NULL,
          \`admitted_seq\` integer NOT NULL,
          \`promoted_seq\` integer,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_session_input_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_message\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`seq\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_session_message_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`workspace_id\` text,
          \`parent_id\` text,
          \`slug\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`path\` text,
          \`title\` text NOT NULL,
          \`version\` text NOT NULL,
          \`share_url\` text,
          \`summary_additions\` integer,
          \`summary_deletions\` integer,
          \`summary_files\` integer,
          \`summary_diffs\` text,
          \`metadata\` text,
          \`cost\` real DEFAULT 0 NOT NULL,
          \`tokens_input\` integer DEFAULT 0 NOT NULL,
          \`tokens_output\` integer DEFAULT 0 NOT NULL,
          \`tokens_reasoning\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_read\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_write\` integer DEFAULT 0 NOT NULL,
          \`revert\` text,
          \`permission\` text,
          \`agent\` text,
          \`model\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_compacting\` integer,
          \`time_archived\` integer,
          CONSTRAINT \`fk_session_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`todo\` (
          \`session_id\` text NOT NULL,
          \`content\` text NOT NULL,
          \`status\` text NOT NULL,
          \`priority\` text NOT NULL,
          \`position\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`todo_pk\` PRIMARY KEY(\`session_id\`, \`position\`),
          CONSTRAINT \`fk_todo_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_share\` (
          \`session_id\` text PRIMARY KEY,
          \`id\` text NOT NULL,
          \`secret\` text NOT NULL,
          \`url\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_session_share_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`learning_historical_tool_presentation_source_idx\` ON \`learning_historical_tool_presentation\` (\`source_session_id\`,\`source_part_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learning_occurrence_origin_once_idx\` ON \`learning_occurrence_presentation\` (\`occurrence_id\`) WHERE "learning_occurrence_presentation"."provenance" = 'origin';`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_occurrence_presentation_occurrence_idx\` ON \`learning_occurrence_presentation\` (\`occurrence_id\`,\`message_id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`course_item_course_idx\` ON \`course_item\` (\`course_id\`,\`id\`);`)
      yield* tx.run(
        `CREATE INDEX \`course_selection_acceptance_effect_course_idx\` ON \`course_selection_acceptance_effect\` (\`course_id\`,\`committed_selection_version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_discovery_idx\` ON \`course\` (\`withdrawal_reason\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_view_revision_item_page_idx\` ON \`course_view_revision_item\` (\`revision_id\`,\`preorder_position\`,\`item_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_view_revision_mapping_group_page_idx\` ON \`course_view_revision_mapping_group\` (\`target_revision_id\`,\`source_key\`,\`target_key\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`course_view_revision_mapping_source_once_idx\` ON \`course_view_revision_mapping_source\` (\`target_revision_id\`,\`item_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_view_revision_mapping_source_page_idx\` ON \`course_view_revision_mapping_source\` (\`group_id\`,\`item_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`course_view_revision_mapping_target_once_idx\` ON \`course_view_revision_mapping_target\` (\`target_revision_id\`,\`item_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_view_revision_mapping_target_page_idx\` ON \`course_view_revision_mapping_target\` (\`group_id\`,\`item_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_view_revision_reuse_citation_page_idx\` ON \`course_view_revision_reuse_citation\` (\`target_revision_id\`,\`source_revision_id\`,\`item_id\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_view_revision_state_active_idx\` ON \`course_view_revision_state\` (\`course_id\`,\`view_id\`,\`withdrawal_reason\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_view_revision_list_idx\` ON \`course_view_revision\` (\`course_id\`,\`view_id\`,\`revision_number\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`course_view_discovery_idx\` ON \`course_view\` (\`course_id\`,\`withdrawal_reason\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(`CREATE UNIQUE INDEX \`event_aggregate_seq_idx\` ON \`event\` (\`aggregate_id\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`event_aggregate_type_seq_idx\` ON \`event\` (\`aggregate_id\`,\`type\`,\`seq\`);`)
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
        `CREATE UNIQUE INDEX \`permission_project_action_resource_idx\` ON \`permission\` (\`project_id\`,\`action\`,\`resource\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`message_session_time_created_id_idx\` ON \`message\` (\`session_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`part_message_id_id_idx\` ON \`part\` (\`message_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`part_session_idx\` ON \`part\` (\`session_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`session_input_session_pending_delivery_seq_idx\` ON \`session_input\` (\`session_id\`,\`promoted_seq\`,\`delivery\`,\`admitted_seq\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`session_input_session_admitted_seq_idx\` ON \`session_input\` (\`session_id\`,\`admitted_seq\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`session_input_session_promoted_seq_idx\` ON \`session_input\` (\`session_id\`,\`promoted_seq\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`session_message_session_seq_idx\` ON \`session_message\` (\`session_id\`,\`seq\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_message_session_type_seq_idx\` ON \`session_message\` (\`session_id\`,\`type\`,\`seq\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_message_session_time_created_id_idx\` ON \`session_message\` (\`session_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`session_message_time_created_idx\` ON \`session_message\` (\`time_created\`);`)
      yield* tx.run(`CREATE INDEX \`session_project_idx\` ON \`session\` (\`project_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_workspace_idx\` ON \`session\` (\`workspace_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_parent_idx\` ON \`session\` (\`parent_id\`);`)
      yield* tx.run(`CREATE INDEX \`todo_session_idx\` ON \`todo\` (\`session_id\`);`)
    })
  },
} satisfies Omit<DatabaseMigration.Migration, "id">
