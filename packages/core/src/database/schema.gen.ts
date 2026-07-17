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
        CREATE TABLE \`artifact_current_source\` (
          \`artifact_id\` text PRIMARY KEY,
          \`source_version\` integer DEFAULT 0 NOT NULL,
          \`active_binding_id\` text,
          \`current_revision_id\` text,
          \`revision_attribution_member_id\` text,
          \`source_state_observation_id\` text,
          \`source_state_member_id\` text,
          \`descriptor_observation_id\` text,
          \`descriptor_correction_id\` text,
          \`effective_media_type\` text,
          \`availability\` text NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_current_source_artifact_id_artifact_id_fk\` FOREIGN KEY (\`artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_artifact_id_active_binding_id_artifact_source_binding_recorded_artifact_id_id_fk\` FOREIGN KEY (\`artifact_id\`,\`active_binding_id\`) REFERENCES \`artifact_source_binding\`(\`recorded_artifact_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_current_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`current_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_revision_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`revision_attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_artifact_id_source_state_observation_id_artifact_source_observation_recorded_artifact_id_id_fk\` FOREIGN KEY (\`artifact_id\`,\`source_state_observation_id\`) REFERENCES \`artifact_source_observation\`(\`recorded_artifact_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_source_state_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`source_state_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_descriptor_observation_id_artifact_source_observation_id_fk\` FOREIGN KEY (\`descriptor_observation_id\`) REFERENCES \`artifact_source_observation\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_descriptor_observation_id_descriptor_correction_id_artifact_observation_correction_observation_id_id_fk\` FOREIGN KEY (\`descriptor_observation_id\`,\`descriptor_correction_id\`) REFERENCES \`artifact_observation_correction\`(\`observation_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "artifact_current_source_version_nonnegative" CHECK("source_version" >= 0),
          CONSTRAINT "artifact_current_source_state_shape" CHECK(("current_revision_id" IS NULL AND "availability" = 'unbound' AND "active_binding_id" IS NULL AND "revision_attribution_member_id" IS NULL AND "source_state_observation_id" IS NULL AND "source_state_member_id" IS NULL AND "descriptor_observation_id" IS NULL AND "descriptor_correction_id" IS NULL AND "effective_media_type" IS NULL) OR ("current_revision_id" IS NOT NULL AND (("source_state_observation_id" IS NOT NULL AND "source_state_member_id" IS NULL) OR ("source_state_observation_id" IS NULL AND "source_state_member_id" IS NOT NULL)) AND "descriptor_observation_id" IS NOT NULL AND "effective_media_type" IS NOT NULL AND length("effective_media_type") > 0 AND (("availability" IN ('available', 'missing')) AND "active_binding_id" IS NOT NULL OR ("availability" = 'unbound' AND "active_binding_id" IS NULL)))),
          CONSTRAINT "artifact_current_source_descriptor_shape" CHECK("descriptor_correction_id" IS NULL OR "descriptor_observation_id" IS NOT NULL),
          CONSTRAINT "artifact_current_source_time_nonnegative" CHECK("time_updated" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_lineage_correction_member\` (
          \`id\` text PRIMARY KEY,
          \`set_id\` text NOT NULL,
          \`recorded_artifact_id\` text NOT NULL,
          \`lineage_version\` integer NOT NULL,
          \`start_after_ordinal\` integer NOT NULL,
          \`end_at_ordinal\` integer NOT NULL,
          \`time_effective\` integer NOT NULL,
          \`expected_winning_member_id\` text,
          \`boundary_binding_id\` text,
          \`boundary_observation_id\` text,
          \`boundary_source_member_id\` text,
          \`boundary_revision_id\` text,
          \`boundary_revision_attribution_member_id\` text,
          \`boundary_descriptor_observation_id\` text,
          \`boundary_descriptor_correction_id\` text,
          \`boundary_media_type\` text,
          \`boundary_availability\` text NOT NULL,
          \`outcome_kind\` text NOT NULL,
          \`outcome_artifact_id\` text,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_binding_id_artifact_source_binding_id_fk\` FOREIGN KEY (\`boundary_binding_id\`) REFERENCES \`artifact_source_binding\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_observation_id_artifact_source_observation_id_fk\` FOREIGN KEY (\`boundary_observation_id\`) REFERENCES \`artifact_source_observation\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_descriptor_observation_id_artifact_source_observation_id_fk\` FOREIGN KEY (\`boundary_descriptor_observation_id\`) REFERENCES \`artifact_source_observation\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_descriptor_correction_id_artifact_observation_correction_id_fk\` FOREIGN KEY (\`boundary_descriptor_correction_id\`) REFERENCES \`artifact_observation_correction\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_set_id_artifact_lineage_correction_set_id_fk\` FOREIGN KEY (\`set_id\`) REFERENCES \`artifact_lineage_correction_set\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_recorded_artifact_id_artifact_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`boundary_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_outcome_artifact_id_artifact_id_fk\` FOREIGN KEY (\`outcome_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_expected_winning_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`expected_winning_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_source_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`boundary_source_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_revision_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`boundary_revision_attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_lineage_correction_member_set_id_unique\` UNIQUE(\`set_id\`,\`id\`),
          CONSTRAINT "artifact_lineage_correction_member_interval" CHECK("start_after_ordinal" >= 0 AND "end_at_ordinal" >= "start_after_ordinal"),
          CONSTRAINT "artifact_lineage_correction_member_version" CHECK("lineage_version" >= 1),
          CONSTRAINT "artifact_lineage_correction_member_time_nonnegative" CHECK("time_effective" >= 0),
          CONSTRAINT "artifact_lineage_correction_member_boundary_shape" CHECK(("boundary_revision_id" IS NULL AND "boundary_availability" = 'unbound' AND "boundary_binding_id" IS NULL AND "boundary_observation_id" IS NULL AND "boundary_source_member_id" IS NULL AND "boundary_revision_attribution_member_id" IS NULL AND "boundary_descriptor_observation_id" IS NULL AND "boundary_descriptor_correction_id" IS NULL AND "boundary_media_type" IS NULL) OR ("boundary_revision_id" IS NOT NULL AND (("boundary_observation_id" IS NOT NULL AND "boundary_source_member_id" IS NULL) OR ("boundary_observation_id" IS NULL AND "boundary_source_member_id" IS NOT NULL)) AND "boundary_descriptor_observation_id" IS NOT NULL AND "boundary_media_type" IS NOT NULL AND length("boundary_media_type") > 0 AND (("boundary_availability" IN ('available', 'missing')) AND "boundary_binding_id" IS NOT NULL OR ("boundary_availability" = 'unbound' AND "boundary_binding_id" IS NULL)))),
          CONSTRAINT "artifact_lineage_correction_member_descriptor_shape" CHECK("boundary_descriptor_correction_id" IS NULL OR "boundary_descriptor_observation_id" IS NOT NULL),
          CONSTRAINT "artifact_lineage_correction_member_outcome_shape" CHECK(("outcome_kind" = 'recorded' AND "outcome_artifact_id" IS NULL) OR ("outcome_kind" = 'artifact' AND "outcome_artifact_id" IS NOT NULL))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_lineage_correction_set\` (
          \`id\` text PRIMARY KEY,
          \`admission_root_artifact_id\` text NOT NULL,
          \`basis\` text NOT NULL,
          \`capability_identity\` text NOT NULL,
          \`capability_version\` integer NOT NULL,
          \`new_artifact_id\` text CONSTRAINT \`artifact_lineage_correction_set_new_artifact_unique\` UNIQUE,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_lineage_correction_set_admission_root_artifact_id_artifact_id_fk\` FOREIGN KEY (\`admission_root_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_set_new_artifact_id_artifact_id_fk\` FOREIGN KEY (\`new_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "artifact_lineage_correction_set_basis" CHECK("basis" IN ('learner_statement', 'trusted_non_model_discontinuity')),
          CONSTRAINT "artifact_lineage_correction_set_capability" CHECK(length("capability_identity") > 0 AND "capability_version" >= 1),
          CONSTRAINT "artifact_lineage_correction_set_time_nonnegative" CHECK("time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_observation_correction\` (
          \`id\` text PRIMARY KEY,
          \`observation_id\` text NOT NULL,
          \`correction_sequence\` integer NOT NULL,
          \`predecessor_correction_id\` text,
          \`media_type\` text NOT NULL,
          \`corrected_time_observed\` integer,
          \`basis\` text NOT NULL,
          \`capability_identity\` text NOT NULL,
          \`capability_version\` integer NOT NULL,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_observation_correction_observation_id_artifact_source_observation_id_fk\` FOREIGN KEY (\`observation_id\`) REFERENCES \`artifact_source_observation\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_observation_correction_observation_id_predecessor_correction_id_artifact_observation_correction_observation_id_id_fk\` FOREIGN KEY (\`observation_id\`,\`predecessor_correction_id\`) REFERENCES \`artifact_observation_correction\`(\`observation_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_observation_correction_observation_id_unique\` UNIQUE(\`observation_id\`,\`id\`),
          CONSTRAINT \`artifact_observation_correction_sequence_unique\` UNIQUE(\`observation_id\`,\`correction_sequence\`),
          CONSTRAINT "artifact_observation_correction_sequence_shape" CHECK(("correction_sequence" = 1 AND "predecessor_correction_id" IS NULL) OR ("correction_sequence" > 1 AND "predecessor_correction_id" IS NOT NULL)),
          CONSTRAINT "artifact_observation_correction_media" CHECK(length("media_type") > 0),
          CONSTRAINT "artifact_observation_correction_basis" CHECK("basis" IN ('learner_correction', 'trusted_observer')),
          CONSTRAINT "artifact_observation_correction_capability" CHECK(length("capability_identity") > 0 AND "capability_version" >= 1),
          CONSTRAINT "artifact_observation_correction_time_nonnegative" CHECK(("corrected_time_observed" IS NULL OR "corrected_time_observed" >= 0) AND "time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_revision\` (
          \`id\` text PRIMARY KEY,
          \`recorded_artifact_id\` text NOT NULL,
          \`fingerprint_algorithm\` text NOT NULL,
          \`fingerprint_digest\` text NOT NULL,
          \`byte_length\` integer NOT NULL,
          \`time_first_observed\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_revision_recorded_artifact_id_artifact_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_revision_recorded_id_unique\` UNIQUE(\`recorded_artifact_id\`,\`id\`),
          CONSTRAINT \`artifact_revision_fingerprint_unique\` UNIQUE(\`recorded_artifact_id\`,\`fingerprint_algorithm\`,\`fingerprint_digest\`,\`byte_length\`),
          CONSTRAINT "artifact_revision_algorithm" CHECK("fingerprint_algorithm" = 'sha256'),
          CONSTRAINT "artifact_revision_digest" CHECK(length("fingerprint_digest") = 64 AND "fingerprint_digest" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "artifact_revision_byte_length" CHECK("byte_length" >= 0),
          CONSTRAINT "artifact_revision_time_nonnegative" CHECK("time_first_observed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_source_binding\` (
          \`id\` text PRIMARY KEY,
          \`recorded_artifact_id\` text NOT NULL,
          \`binding_ordinal\` integer NOT NULL,
          \`canonical_location\` text NOT NULL,
          \`basis_kind\` text NOT NULL,
          \`basis_capability_identity\` text,
          \`basis_capability_version\` integer,
          \`basis_lineage_member_id\` text,
          \`time_started\` integer NOT NULL,
          \`time_ended\` integer,
          \`end_reason\` text,
          CONSTRAINT \`fk_artifact_source_binding_recorded_artifact_id_artifact_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_source_binding_basis_lineage_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`basis_lineage_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_source_binding_recorded_id_unique\` UNIQUE(\`recorded_artifact_id\`,\`id\`),
          CONSTRAINT \`artifact_source_binding_ordinal_unique\` UNIQUE(\`recorded_artifact_id\`,\`binding_ordinal\`),
          CONSTRAINT "artifact_source_binding_ordinal_positive" CHECK("binding_ordinal" >= 1),
          CONSTRAINT "artifact_source_binding_location_nonempty" CHECK(length("canonical_location") > 0),
          CONSTRAINT "artifact_source_binding_basis_shape" CHECK(("basis_kind" IN ('admission', 'explicit_rebind') AND "basis_capability_identity" IS NOT NULL AND length("basis_capability_identity") > 0 AND "basis_capability_version" >= 1 AND "basis_lineage_member_id" IS NULL) OR ("basis_kind" = 'lineage_correction' AND "basis_capability_identity" IS NULL AND "basis_capability_version" IS NULL AND "basis_lineage_member_id" IS NOT NULL)),
          CONSTRAINT "artifact_source_binding_end_shape" CHECK(("time_ended" IS NULL AND "end_reason" IS NULL) OR ("time_ended" IS NOT NULL AND "time_ended" >= "time_started" AND "end_reason" IN ('explicit_rebind', 'lineage_correction'))),
          CONSTRAINT "artifact_source_binding_time_nonnegative" CHECK("time_started" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_source_observation\` (
          \`id\` text PRIMARY KEY,
          \`recorded_artifact_id\` text NOT NULL,
          \`binding_id\` text NOT NULL,
          \`occurrence_ordinal\` integer NOT NULL,
          \`result\` text NOT NULL,
          \`revision_id\` text,
          \`revision_attribution_member_id\` text,
          \`media_type\` text,
          \`observer_capability_identity\` text NOT NULL,
          \`observer_capability_version\` integer NOT NULL,
          \`time_observed\` integer NOT NULL,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_source_observation_recorded_artifact_id_artifact_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_source_observation_recorded_artifact_id_binding_id_artifact_source_binding_recorded_artifact_id_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`,\`binding_id\`) REFERENCES \`artifact_source_binding\`(\`recorded_artifact_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_source_observation_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_source_observation_revision_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`revision_attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_source_observation_recorded_id_unique\` UNIQUE(\`recorded_artifact_id\`,\`id\`),
          CONSTRAINT \`artifact_source_observation_ordinal_unique\` UNIQUE(\`recorded_artifact_id\`,\`occurrence_ordinal\`),
          CONSTRAINT "artifact_source_observation_ordinal_positive" CHECK("occurrence_ordinal" >= 1),
          CONSTRAINT "artifact_source_observation_result_shape" CHECK(("result" = 'present' AND "revision_id" IS NOT NULL AND "media_type" IS NOT NULL AND length("media_type") > 0) OR ("result" = 'missing' AND "revision_id" IS NULL AND "revision_attribution_member_id" IS NULL AND "media_type" IS NULL)),
          CONSTRAINT "artifact_source_observation_observer" CHECK(length("observer_capability_identity") > 0 AND "observer_capability_version" >= 1),
          CONSTRAINT "artifact_source_observation_time_nonnegative" CHECK("time_observed" >= 0 AND "time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact\` (
          \`id\` text PRIMARY KEY,
          \`admission_root_artifact_id\` text NOT NULL,
          \`creation_basis\` text NOT NULL,
          \`creation_capability_identity\` text,
          \`creation_capability_version\` integer,
          \`disposition_version\` integer DEFAULT 0 NOT NULL,
          \`lineage_version\` integer DEFAULT 0 NOT NULL,
          \`withdrawal_reason\` text,
          \`correction_hidden\` integer DEFAULT false NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_admission_root_artifact_id_artifact_id_fk\` FOREIGN KEY (\`admission_root_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "artifact_creation_shape" CHECK(("creation_basis" IN ('learner_instruction', 'initialization_import') AND "admission_root_artifact_id" = "id" AND "creation_capability_identity" IS NOT NULL AND length("creation_capability_identity") > 0 AND "creation_capability_version" >= 1) OR ("creation_basis" = 'lineage_correction' AND "creation_capability_identity" IS NULL AND "creation_capability_version" IS NULL)),
          CONSTRAINT "artifact_versions_nonnegative" CHECK("disposition_version" >= 0 AND "lineage_version" >= 0),
          CONSTRAINT "artifact_withdrawal_reason" CHECK("withdrawal_reason" IS NULL OR "withdrawal_reason" = 'removed'),
          CONSTRAINT "artifact_time_order" CHECK("time_created" >= 0 AND "time_updated" >= "time_created")
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`content_mutation_grant\` (
          \`id\` text PRIMARY KEY,
          \`canonical_anchor_path\` text NOT NULL,
          \`canonical_anchor_path_key\` text NOT NULL,
          \`platform\` text NOT NULL,
          \`volume_serial\` text NOT NULL,
          \`object_id\` text NOT NULL,
          \`creation_time\` text NOT NULL,
          \`initial_change_time\` text NOT NULL,
          \`verifier_version\` integer NOT NULL,
          \`relative_scope\` text NOT NULL,
          \`scope_kind\` text NOT NULL,
          \`allow_create\` integer DEFAULT false NOT NULL,
          \`allow_modify\` integer DEFAULT false NOT NULL,
          \`allow_delete\` integer DEFAULT false NOT NULL,
          \`allow_rename_source\` integer DEFAULT false NOT NULL,
          \`allow_rename_destination\` integer DEFAULT false NOT NULL,
          \`version\` integer DEFAULT 1 NOT NULL,
          \`disposition\` text NOT NULL,
          \`approval_basis\` text NOT NULL,
          \`time_approved\` integer NOT NULL,
          \`revocation_basis\` text,
          \`time_revoked\` integer,
          \`time_updated\` integer NOT NULL,
          \`provenance_content_root_id\` text,
          \`provenance_binding_id\` text,
          CONSTRAINT \`fk_content_mutation_grant_provenance_content_root_id_content_root_id_fk\` FOREIGN KEY (\`provenance_content_root_id\`) REFERENCES \`content_root\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_content_mutation_grant_provenance_content_root_id_provenance_binding_id_content_root_binding_content_root_id_id_fk\` FOREIGN KEY (\`provenance_content_root_id\`,\`provenance_binding_id\`) REFERENCES \`content_root_binding\`(\`content_root_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "content_mutation_grant_anchor_shape" CHECK(length("canonical_anchor_path") > 0 AND length("canonical_anchor_path_key") > 0 AND "platform" = 'windows_ntfs' AND length("volume_serial") > 0 AND length("object_id") = 32 AND length("creation_time") > 0 AND length("initial_change_time") > 0 AND "verifier_version" >= 1),
          CONSTRAINT "content_mutation_grant_scope_shape" CHECK(length("relative_scope") > 0 AND "scope_kind" IN ('exact', 'subtree')),
          CONSTRAINT "content_mutation_grant_rights_nonempty" CHECK("allow_create" OR "allow_modify" OR "allow_delete" OR "allow_rename_source" OR "allow_rename_destination"),
          CONSTRAINT "content_mutation_grant_version_positive" CHECK("version" >= 1),
          CONSTRAINT "content_mutation_grant_disposition_shape" CHECK(("disposition" = 'active' AND "revocation_basis" IS NULL AND "time_revoked" IS NULL) OR ("disposition" = 'revoked' AND "revocation_basis" IS NOT NULL AND length("revocation_basis") > 0 AND "time_revoked" >= "time_approved")),
          CONSTRAINT "content_mutation_grant_provenance_shape" CHECK(("provenance_content_root_id" IS NULL AND "provenance_binding_id" IS NULL) OR ("provenance_content_root_id" IS NOT NULL AND "provenance_binding_id" IS NOT NULL)),
          CONSTRAINT "content_mutation_grant_time_order" CHECK("time_approved" >= 0 AND "time_updated" >= "time_approved")
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`content_root_binding_episode\` (
          \`id\` text PRIMARY KEY,
          \`content_root_id\` text NOT NULL,
          \`binding_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`approval_basis\` text NOT NULL,
          \`time_started\` integer NOT NULL,
          \`time_ended\` integer,
          \`end_reason\` text,
          CONSTRAINT \`fk_content_root_binding_episode_content_root_id_content_root_id_fk\` FOREIGN KEY (\`content_root_id\`) REFERENCES \`content_root\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_content_root_binding_episode_content_root_id_binding_id_content_root_binding_content_root_id_id_fk\` FOREIGN KEY (\`content_root_id\`,\`binding_id\`) REFERENCES \`content_root_binding\`(\`content_root_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`content_root_binding_episode_root_id_unique\` UNIQUE(\`content_root_id\`,\`id\`),
          CONSTRAINT \`content_root_binding_episode_ordinal_unique\` UNIQUE(\`content_root_id\`,\`ordinal\`),
          CONSTRAINT "content_root_binding_episode_ordinal_positive" CHECK("ordinal" >= 1),
          CONSTRAINT "content_root_binding_episode_basis" CHECK(length("approval_basis") > 0),
          CONSTRAINT "content_root_binding_episode_end_shape" CHECK(("time_ended" IS NULL AND "end_reason" IS NULL) OR ("time_ended" IS NOT NULL AND "time_ended" >= "time_started" AND "end_reason" = 'explicit_rebind')),
          CONSTRAINT "content_root_binding_episode_time_nonnegative" CHECK("time_started" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`content_root_binding\` (
          \`id\` text PRIMARY KEY,
          \`content_root_id\` text NOT NULL,
          \`canonical_path\` text NOT NULL,
          \`canonical_path_key\` text NOT NULL,
          \`platform\` text NOT NULL,
          \`volume_serial\` text NOT NULL,
          \`object_id\` text NOT NULL,
          \`creation_time\` text NOT NULL,
          \`initial_change_time\` text NOT NULL,
          \`verifier_version\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_content_root_binding_content_root_id_content_root_id_fk\` FOREIGN KEY (\`content_root_id\`) REFERENCES \`content_root\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`content_root_binding_root_id_unique\` UNIQUE(\`content_root_id\`,\`id\`),
          CONSTRAINT \`content_root_binding_exact_key_unique\` UNIQUE(\`canonical_path_key\`,\`platform\`,\`volume_serial\`,\`object_id\`,\`creation_time\`),
          CONSTRAINT "content_root_binding_shape" CHECK(length("canonical_path") > 0 AND length("canonical_path_key") > 0 AND "platform" = 'windows_ntfs' AND length("volume_serial") > 0 AND length("object_id") = 32 AND length("creation_time") > 0 AND length("initial_change_time") > 0 AND "verifier_version" >= 1),
          CONSTRAINT "content_root_binding_time_nonnegative" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`content_root_current\` (
          \`content_root_id\` text PRIMARY KEY,
          \`binding_id\` text NOT NULL,
          \`binding_episode_id\` text NOT NULL,
          \`grant_episode_id\` text,
          \`disposition\` text NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_content_root_current_content_root_id_content_root_id_fk\` FOREIGN KEY (\`content_root_id\`) REFERENCES \`content_root\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_content_root_current_content_root_id_binding_id_content_root_binding_content_root_id_id_fk\` FOREIGN KEY (\`content_root_id\`,\`binding_id\`) REFERENCES \`content_root_binding\`(\`content_root_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_content_root_current_content_root_id_binding_episode_id_content_root_binding_episode_content_root_id_id_fk\` FOREIGN KEY (\`content_root_id\`,\`binding_episode_id\`) REFERENCES \`content_root_binding_episode\`(\`content_root_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_content_root_current_content_root_id_grant_episode_id_content_root_grant_episode_content_root_id_id_fk\` FOREIGN KEY (\`content_root_id\`,\`grant_episode_id\`) REFERENCES \`content_root_grant_episode\`(\`content_root_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "content_root_current_disposition_shape" CHECK(("disposition" = 'active' AND "grant_episode_id" IS NOT NULL) OR ("disposition" = 'revoked' AND "grant_episode_id" IS NULL)),
          CONSTRAINT "content_root_current_time_nonnegative" CHECK("time_updated" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`content_root_grant_episode\` (
          \`id\` text PRIMARY KEY,
          \`content_root_id\` text NOT NULL,
          \`binding_id\` text NOT NULL,
          \`binding_episode_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`approval_basis\` text NOT NULL,
          \`time_approved\` integer NOT NULL,
          \`close_basis\` text,
          \`time_closed\` integer,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_content_root_grant_episode_content_root_id_content_root_id_fk\` FOREIGN KEY (\`content_root_id\`) REFERENCES \`content_root\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_content_root_grant_episode_content_root_id_binding_id_content_root_binding_content_root_id_id_fk\` FOREIGN KEY (\`content_root_id\`,\`binding_id\`) REFERENCES \`content_root_binding\`(\`content_root_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_content_root_grant_episode_content_root_id_binding_episode_id_content_root_binding_episode_content_root_id_id_fk\` FOREIGN KEY (\`content_root_id\`,\`binding_episode_id\`) REFERENCES \`content_root_binding_episode\`(\`content_root_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`content_root_grant_episode_root_id_unique\` UNIQUE(\`content_root_id\`,\`id\`),
          CONSTRAINT \`content_root_grant_episode_ordinal_unique\` UNIQUE(\`content_root_id\`,\`ordinal\`),
          CONSTRAINT "content_root_grant_episode_ordinal_positive" CHECK("ordinal" >= 1),
          CONSTRAINT "content_root_grant_episode_basis" CHECK(length("approval_basis") > 0),
          CONSTRAINT "content_root_grant_episode_close_shape" CHECK(("time_closed" IS NULL AND "close_basis" IS NULL) OR ("time_closed" IS NOT NULL AND "time_closed" >= "time_approved" AND "close_basis" IS NOT NULL AND length("close_basis") > 0)),
          CONSTRAINT "content_root_grant_episode_time_order" CHECK("time_approved" >= 0 AND "time_updated" >= "time_approved")
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`content_root\` (
          \`id\` text PRIMARY KEY,
          \`time_created\` integer NOT NULL,
          CONSTRAINT "content_root_time_nonnegative" CHECK("time_created" >= 0)
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
      yield* tx.run(
        `CREATE INDEX \`artifact_current_source_availability_idx\` ON \`artifact_current_source\` (\`availability\`,\`artifact_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_lineage_correction_member_history_idx\` ON \`artifact_lineage_correction_member\` (\`recorded_artifact_id\`,\`start_after_ordinal\`,\`end_at_ordinal\`,\`lineage_version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_lineage_correction_member_outcome_idx\` ON \`artifact_lineage_correction_member\` (\`outcome_artifact_id\`,\`lineage_version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_lineage_correction_member_set_idx\` ON \`artifact_lineage_correction_member\` (\`set_id\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_lineage_correction_set_root_idx\` ON \`artifact_lineage_correction_set\` (\`admission_root_artifact_id\`,\`time_committed\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_observation_correction_page_idx\` ON \`artifact_observation_correction\` (\`observation_id\`,\`correction_sequence\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_revision_page_idx\` ON \`artifact_revision\` (\`recorded_artifact_id\`,\`time_first_observed\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`artifact_source_binding_active_artifact_idx\` ON \`artifact_source_binding\` (\`recorded_artifact_id\`) WHERE "artifact_source_binding"."time_ended" IS NULL;`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`artifact_source_binding_active_location_idx\` ON \`artifact_source_binding\` (\`canonical_location\`) WHERE "artifact_source_binding"."time_ended" IS NULL;`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_source_binding_history_idx\` ON \`artifact_source_binding\` (\`recorded_artifact_id\`,\`binding_ordinal\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_source_observation_history_idx\` ON \`artifact_source_observation\` (\`recorded_artifact_id\`,\`occurrence_ordinal\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_source_observation_revision_idx\` ON \`artifact_source_observation\` (\`revision_id\`,\`recorded_artifact_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_admission_root_idx\` ON \`artifact\` (\`admission_root_artifact_id\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_discovery_idx\` ON \`artifact\` (\`withdrawal_reason\`,\`correction_hidden\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`content_mutation_grant_active_idx\` ON \`content_mutation_grant\` (\`disposition\`,\`canonical_anchor_path_key\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`content_mutation_grant_provenance_idx\` ON \`content_mutation_grant\` (\`provenance_content_root_id\`,\`provenance_binding_id\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`content_root_binding_episode_active_idx\` ON \`content_root_binding_episode\` (\`content_root_id\`) WHERE "content_root_binding_episode"."time_ended" IS NULL;`,
      )
      yield* tx.run(
        `CREATE INDEX \`content_root_binding_episode_history_idx\` ON \`content_root_binding_episode\` (\`content_root_id\`,\`ordinal\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`content_root_binding_root_idx\` ON \`content_root_binding\` (\`content_root_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`content_root_current_disposition_idx\` ON \`content_root_current\` (\`disposition\`,\`content_root_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`content_root_grant_episode_active_idx\` ON \`content_root_grant_episode\` (\`content_root_id\`) WHERE "content_root_grant_episode"."time_closed" IS NULL;`,
      )
      yield* tx.run(
        `CREATE INDEX \`content_root_grant_episode_history_idx\` ON \`content_root_grant_episode\` (\`content_root_id\`,\`ordinal\`,\`id\`);`,
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
