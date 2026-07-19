import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { MaterialMapConstraintSchema } from "../../../material-map/constraint-schema"

export default {
  id: "20260719104356_material_map_alignment",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`__new_representation_revision\` (
          \`id\` text PRIMARY KEY,
          \`effect_id\` text NOT NULL CONSTRAINT \`representation_revision_effect_unique\` UNIQUE,
          \`source_revision_id\` text NOT NULL,
          \`effective_artifact_id\` text NOT NULL,
          \`attribution_type\` text NOT NULL,
          \`attribution_member_id\` text,
          \`accepted_disposition_version\` integer NOT NULL,
          \`accepted_lineage_version\` integer NOT NULL,
          \`source_version\` integer NOT NULL,
          \`source_media_type\` text NOT NULL,
          \`source_digest\` text NOT NULL,
          \`source_byte_length\` integer NOT NULL,
          \`content_root_id\` text NOT NULL,
          \`content_root_binding_id\` text NOT NULL,
          \`content_root_binding_episode_id\` text NOT NULL,
          \`content_root_binding_episode_ordinal\` integer NOT NULL,
          \`content_root_grant_episode_id\` text NOT NULL,
          \`content_root_grant_version\` integer NOT NULL,
          \`normalized_relative_path\` text NOT NULL,
          \`source_object_platform\` text NOT NULL,
          \`source_object_verifier_version\` integer NOT NULL,
          \`source_object_canonical_path\` text NOT NULL,
          \`source_object_canonical_path_key\` text NOT NULL,
          \`source_object_volume_serial\` text NOT NULL,
          \`source_object_id\` text NOT NULL,
          \`source_object_creation_time\` text NOT NULL,
          \`source_object_change_time\` text NOT NULL,
          \`source_object_last_write_time\` text NOT NULL,
          \`source_object_size\` integer NOT NULL,
          \`source_object_kind\` text NOT NULL,
          \`source_observed_time\` integer NOT NULL,
          \`presented_input_digest\` text NOT NULL,
          \`presented_input_byte_length\` integer NOT NULL,
          \`producer_kind\` text NOT NULL,
          \`producer_identity\` text NOT NULL,
          \`producer_version\` text NOT NULL,
          \`provider_id\` text,
          \`model_id\` text,
          \`profile_variant\` text,
          \`task_version\` integer NOT NULL,
          \`profile\` text NOT NULL,
          \`canonicalizer_version\` integer NOT NULL,
          \`provenance_version\` integer NOT NULL,
          \`provenance\` text NOT NULL,
          \`run_identity\` text NOT NULL,
          \`result_boundary\` text NOT NULL,
          \`terminal_status\` text NOT NULL,
          \`diagnostics\` text NOT NULL,
          \`usage\` text NOT NULL,
          \`output_media_type\` text NOT NULL,
          \`storage_key\` text NOT NULL CONSTRAINT \`representation_revision_storage_key_unique\` UNIQUE,
          \`output_digest\` text NOT NULL,
          \`output_byte_length\` integer NOT NULL,
          \`profile_record_count\` integer NOT NULL,
          \`acceptance_basis\` text NOT NULL,
          \`creation_basis\` text NOT NULL,
          \`creation_identity\` text NOT NULL,
          \`authorization_intent\` text NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`delivery_mode\` text NOT NULL,
          \`causal_occurrence_id\` text,
          \`causal_invocation_part_id\` text,
          \`time_accepted\` integer NOT NULL,
          CONSTRAINT \`fk_representation_revision_effect_id_representation_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`representation_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_revision_source_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`source_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_revision_effective_artifact_id_artifact_id_fk\` FOREIGN KEY (\`effective_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_revision_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_revision_content_root_id_content_root_id_fk\` FOREIGN KEY (\`content_root_id\`) REFERENCES \`content_root\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_revision_content_root_id_content_root_binding_id_content_root_binding_content_root_id_id_fk\` FOREIGN KEY (\`content_root_id\`,\`content_root_binding_id\`) REFERENCES \`content_root_binding\`(\`content_root_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_revision_content_root_id_content_root_binding_episode_id_content_root_binding_id_content_root_binding_episode_ordinal_content_root_binding_episode_content_root_id_id_binding_id_ordinal_fk\` FOREIGN KEY (\`content_root_id\`,\`content_root_binding_episode_id\`,\`content_root_binding_id\`,\`content_root_binding_episode_ordinal\`) REFERENCES \`content_root_binding_episode\`(\`content_root_id\`,\`id\`,\`binding_id\`,\`ordinal\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_revision_content_root_id_content_root_grant_episode_id_content_root_binding_id_content_root_binding_episode_id_content_root_grant_version_content_root_grant_episode_content_root_id_id_binding_id_binding_episode_id_ordinal_fk\` FOREIGN KEY (\`content_root_id\`,\`content_root_grant_episode_id\`,\`content_root_binding_id\`,\`content_root_binding_episode_id\`,\`content_root_grant_version\`) REFERENCES \`content_root_grant_episode\`(\`content_root_id\`,\`id\`,\`binding_id\`,\`binding_episode_id\`,\`ordinal\`) ON DELETE RESTRICT,
          CONSTRAINT "representation_revision_attribution_shape" CHECK(("attribution_type" = 'recorded' AND "attribution_member_id" IS NULL) OR ("attribution_type" = 'lineage_correction' AND "attribution_member_id" IS NOT NULL)),
          CONSTRAINT "representation_revision_versions" CHECK("accepted_disposition_version" >= 0 AND "accepted_lineage_version" >= 0 AND "source_version" >= 0 AND "content_root_binding_episode_ordinal" >= 1 AND "content_root_grant_version" >= 1),
          CONSTRAINT "representation_revision_source_shape" CHECK(length("source_media_type") > 0 AND length("source_digest") = 64 AND "source_digest" NOT GLOB '*[^0-9a-f]*' AND "source_byte_length" >= 0 AND length("normalized_relative_path") > 0 AND "source_object_platform" = 'windows_ntfs' AND "source_object_verifier_version" >= 1 AND length("source_object_canonical_path") > 0 AND length("source_object_canonical_path_key") > 0 AND length("source_object_volume_serial") > 0 AND length("source_object_id") = 32 AND length("source_object_creation_time") > 0 AND length("source_object_change_time") > 0 AND length("source_object_last_write_time") > 0 AND "source_object_size" >= 0 AND "source_object_size" = "source_byte_length" AND "source_object_kind" = 'file' AND "source_observed_time" >= 0),
          CONSTRAINT "representation_revision_input_shape" CHECK(length("presented_input_digest") = 64 AND "presented_input_digest" NOT GLOB '*[^0-9a-f]*' AND "presented_input_byte_length" >= 0 AND "presented_input_digest" = "source_digest" AND "presented_input_byte_length" = "source_byte_length"),
          CONSTRAINT "representation_revision_producer_shape" CHECK(length("producer_identity") > 0 AND length("producer_version") > 0 AND "task_version" >= 1 AND "canonicalizer_version" >= 1 AND "provenance_version" >= 1 AND length("run_identity") > 0 AND json_valid("provenance") AND json_type("provenance") = 'object' AND json_valid("diagnostics") AND json_type("diagnostics") = 'array' AND json_valid("usage") AND json_type("usage") = 'object' AND (("producer_kind" = 'local_pdf' AND "provider_id" IS NULL AND "model_id" IS NULL AND "profile_variant" IS NULL AND "profile" = 'repa.pdf-text.v1' AND "result_boundary" = 'framed_stdout_v1' AND "terminal_status" = 'completed' AND "acceptance_basis" = 'mechanical_profile') OR ("producer_kind" = 'configured_model' AND "provider_id" IS NOT NULL AND length("provider_id") > 0 AND "model_id" IS NOT NULL AND length("model_id") > 0 AND "profile" = 'repa.model-rendition.v1' AND "result_boundary" = 'model_schema_v1' AND "terminal_status" = 'stop' AND "acceptance_basis" = 'model_claimed_rendition'))),
          CONSTRAINT "representation_revision_output_shape" CHECK(length("output_media_type") > 0 AND length("storage_key") > 0 AND length("output_digest") = 64 AND "output_digest" NOT GLOB '*[^0-9a-f]*' AND "output_byte_length" > 0 AND "profile_record_count" >= 1),
          CONSTRAINT "representation_revision_creation_shape" CHECK("creation_basis" IN ('deterministic_operation', 'learning_command') AND length("creation_identity") > 0 AND "authorization_intent" = 'persistent_readable_access' AND length("authorization_basis") > 0 AND (("creation_basis" = 'deterministic_operation' AND "delivery_mode" = 'deterministic' AND "causal_occurrence_id" IS NULL AND "causal_invocation_part_id" IS NULL) OR ("creation_basis" = 'learning_command' AND "delivery_mode" = 'model_tool' AND "causal_occurrence_id" IS NOT NULL AND length("causal_occurrence_id") > 0 AND "causal_invocation_part_id" IS NOT NULL AND length("causal_invocation_part_id") > 0)) AND "time_accepted" >= 0)
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_representation_revision\`(\`id\`, \`effect_id\`, \`source_revision_id\`, \`effective_artifact_id\`, \`attribution_type\`, \`attribution_member_id\`, \`accepted_disposition_version\`, \`accepted_lineage_version\`, \`source_version\`, \`source_media_type\`, \`source_digest\`, \`source_byte_length\`, \`content_root_id\`, \`content_root_binding_id\`, \`content_root_binding_episode_id\`, \`content_root_binding_episode_ordinal\`, \`content_root_grant_episode_id\`, \`content_root_grant_version\`, \`normalized_relative_path\`, \`source_object_platform\`, \`source_object_verifier_version\`, \`source_object_canonical_path\`, \`source_object_canonical_path_key\`, \`source_object_volume_serial\`, \`source_object_id\`, \`source_object_creation_time\`, \`source_object_change_time\`, \`source_object_last_write_time\`, \`source_object_size\`, \`source_object_kind\`, \`source_observed_time\`, \`presented_input_digest\`, \`presented_input_byte_length\`, \`producer_kind\`, \`producer_identity\`, \`producer_version\`, \`provider_id\`, \`model_id\`, \`profile_variant\`, \`task_version\`, \`profile\`, \`canonicalizer_version\`, \`provenance_version\`, \`provenance\`, \`run_identity\`, \`result_boundary\`, \`terminal_status\`, \`diagnostics\`, \`usage\`, \`output_media_type\`, \`storage_key\`, \`output_digest\`, \`output_byte_length\`, \`profile_record_count\`, \`acceptance_basis\`, \`creation_basis\`, \`creation_identity\`, \`authorization_intent\`, \`authorization_basis\`, \`delivery_mode\`, \`causal_occurrence_id\`, \`causal_invocation_part_id\`, \`time_accepted\`) SELECT \`id\`, \`effect_id\`, \`source_revision_id\`, \`effective_artifact_id\`, \`attribution_type\`, \`attribution_member_id\`, \`accepted_disposition_version\`, \`accepted_lineage_version\`, \`source_version\`, \`source_media_type\`, \`source_digest\`, \`source_byte_length\`, \`content_root_id\`, \`content_root_binding_id\`, \`content_root_binding_episode_id\`, \`content_root_binding_episode_ordinal\`, \`content_root_grant_episode_id\`, \`content_root_grant_version\`, \`normalized_relative_path\`, \`source_object_platform\`, \`source_object_verifier_version\`, \`source_object_canonical_path\`, \`source_object_canonical_path_key\`, \`source_object_volume_serial\`, \`source_object_id\`, \`source_object_creation_time\`, \`source_object_change_time\`, \`source_object_last_write_time\`, \`source_object_size\`, \`source_object_kind\`, \`source_observed_time\`, \`presented_input_digest\`, \`presented_input_byte_length\`, \`producer_kind\`, \`producer_identity\`, \`producer_version\`, \`provider_id\`, \`model_id\`, \`profile_variant\`, \`task_version\`, \`profile\`, \`canonicalizer_version\`, \`provenance_version\`, \`provenance\`, \`run_identity\`, \`result_boundary\`, \`terminal_status\`, \`diagnostics\`, \`usage\`, \`output_media_type\`, \`storage_key\`, \`output_digest\`, \`output_byte_length\`, \`profile_record_count\`, \`acceptance_basis\`, \`creation_basis\`, \`creation_identity\`, \`authorization_intent\`, \`authorization_basis\`, \`delivery_mode\`, \`causal_occurrence_id\`, \`causal_invocation_part_id\`, \`time_accepted\` FROM \`representation_revision\`;`,
      )
      yield* tx.run(`DROP TABLE \`representation_revision\`;`)
      yield* tx.run(`ALTER TABLE \`__new_representation_revision\` RENAME TO \`representation_revision\`;`)
      yield* tx.run(
        `CREATE INDEX \`representation_revision_source_idx\` ON \`representation_revision\` (\`source_revision_id\`,\`time_accepted\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`representation_revision_artifact_idx\` ON \`representation_revision\` (\`effective_artifact_id\`,\`time_accepted\`,\`id\`);`,
      )
      yield* tx.run(`
        CREATE TABLE \`material_course_alignment_disposition_event\` (
          \`id\` text PRIMARY KEY,
          \`alignment_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`reason\` text,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT \`fk_material_course_alignment_disposition_event_alignment_id_material_course_alignment_id_fk\` FOREIGN KEY (\`alignment_id\`) REFERENCES \`material_course_alignment\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`material_course_alignment_disposition_version_unique\` UNIQUE(\`alignment_id\`,\`version\`),
          CONSTRAINT "material_course_alignment_disposition_version" CHECK("version" >= 0),
          CONSTRAINT "material_course_alignment_disposition_shape" CHECK(("disposition" = 'active' AND "reason" IS NULL) OR ("disposition" = 'withdrawn' AND "reason" IS NOT NULL AND length(trim("reason")) BETWEEN 1 AND 2000)),
          CONSTRAINT "material_course_alignment_disposition_time" CHECK("time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`material_course_alignment_state\` (
          \`alignment_id\` text PRIMARY KEY,
          \`version\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`withdrawal_reason\` text,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_material_course_alignment_state_alignment_id_material_course_alignment_id_fk\` FOREIGN KEY (\`alignment_id\`) REFERENCES \`material_course_alignment\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "material_course_alignment_state_version" CHECK("version" >= 0),
          CONSTRAINT "material_course_alignment_state_shape" CHECK(("disposition" = 'active' AND "withdrawal_reason" IS NULL) OR ("disposition" = 'withdrawn' AND "withdrawal_reason" IS NOT NULL AND length(trim("withdrawal_reason")) BETWEEN 1 AND 2000)),
          CONSTRAINT "material_course_alignment_state_time" CHECK("time_updated" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`material_course_alignment\` (
          \`id\` text PRIMARY KEY,
          \`canonical_input\` text NOT NULL,
          \`map_id\` text NOT NULL,
          \`selector_id\` text NOT NULL,
          \`course_id\` text NOT NULL,
          \`view_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          \`item_id\` text NOT NULL,
          \`selection_basis\` text NOT NULL,
          \`observed_selection_revision_id\` text,
          \`observed_selection_version\` integer,
          \`accepted_course_version\` integer NOT NULL,
          \`accepted_view_version\` integer NOT NULL,
          \`accepted_revision_version\` integer NOT NULL,
          \`reason\` text NOT NULL,
          \`supersedes_alignment_id\` text,
          \`authorship_basis\` text NOT NULL,
          \`authorship_capability_identity\` text NOT NULL,
          \`authorship_capability_version\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_material_course_alignment_map_id_selector_id_material_selector_map_id_id_fk\` FOREIGN KEY (\`map_id\`,\`selector_id\`) REFERENCES \`material_selector\`(\`map_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_course_alignment_course_id_view_id_revision_id_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_course_alignment_course_id_observed_selection_revision_id_course_view_revision_course_id_id_fk\` FOREIGN KEY (\`course_id\`,\`observed_selection_revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_course_alignment_supersedes_alignment_id_material_course_alignment_id_fk\` FOREIGN KEY (\`supersedes_alignment_id\`) REFERENCES \`material_course_alignment\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`material_course_alignment_owner_unique\` UNIQUE(\`id\`,\`map_id\`,\`selector_id\`),
          CONSTRAINT "material_course_alignment_canonical_input" CHECK(json_valid("canonical_input")),
          CONSTRAINT "material_course_alignment_selection_shape" CHECK(("selection_basis" = 'explicit_exact' AND "observed_selection_revision_id" IS NULL AND "observed_selection_version" IS NULL) OR ("selection_basis" = 'observed_working' AND "observed_selection_revision_id" = "revision_id" AND "observed_selection_version" IS NOT NULL AND "observed_selection_version" >= 0)),
          CONSTRAINT "material_course_alignment_reason" CHECK(length(trim("reason")) BETWEEN 1 AND 2000),
          CONSTRAINT "material_course_alignment_endpoint_versions" CHECK("accepted_course_version" >= 0 AND "accepted_view_version" >= 0 AND "accepted_revision_version" >= 0),
          CONSTRAINT "material_course_alignment_authorship" CHECK(length(trim("authorship_basis")) BETWEEN 1 AND 2000 AND length(trim("authorship_capability_identity")) BETWEEN 1 AND 500 AND "authorship_capability_version" >= 0),
          CONSTRAINT "material_course_alignment_no_self_predecessor" CHECK("supersedes_alignment_id" IS NULL OR "supersedes_alignment_id" <> "id"),
          CONSTRAINT "material_course_alignment_time" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`material_map_artifact_target\` (
          \`map_id\` text PRIMARY KEY,
          \`artifact_id\` text NOT NULL,
          \`artifact_revision_id\` text NOT NULL,
          \`attribution_type\` text NOT NULL,
          \`attribution_member_id\` text,
          \`disposition_version\` integer NOT NULL,
          \`lineage_version\` integer NOT NULL,
          \`source_version\` integer NOT NULL,
          \`artifact_binding_id\` text NOT NULL,
          \`active_location\` text NOT NULL,
          \`descriptor_observation_id\` text NOT NULL,
          \`descriptor_correction_id\` text,
          \`fingerprint_algorithm\` text NOT NULL,
          \`fingerprint_digest\` text NOT NULL,
          \`byte_length\` integer NOT NULL,
          \`media_type\` text NOT NULL,
          \`content_root_id\` text NOT NULL,
          \`content_root_binding_id\` text NOT NULL,
          \`content_root_binding_episode_id\` text NOT NULL,
          \`content_root_binding_episode_ordinal\` integer NOT NULL,
          \`content_root_grant_episode_id\` text NOT NULL,
          \`content_root_grant_episode_ordinal\` integer NOT NULL,
          \`content_root_grant_version\` integer NOT NULL,
          \`normalized_relative_path\` text NOT NULL,
          \`source_object_platform\` text NOT NULL,
          \`source_object_verifier_version\` integer NOT NULL,
          \`source_object_canonical_path\` text NOT NULL,
          \`source_object_canonical_path_key\` text NOT NULL,
          \`source_object_volume_serial\` text NOT NULL,
          \`source_object_id\` text NOT NULL,
          \`source_object_creation_time\` text NOT NULL,
          \`source_object_change_time\` text NOT NULL,
          \`source_object_last_write_time\` text NOT NULL,
          \`source_object_size\` integer NOT NULL,
          \`source_observed_time\` integer NOT NULL,
          CONSTRAINT \`fk_material_map_artifact_target_map_id_material_map_id_fk\` FOREIGN KEY (\`map_id\`) REFERENCES \`material_map\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_artifact_id_artifact_id_fk\` FOREIGN KEY (\`artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_artifact_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`artifact_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_artifact_binding_id_artifact_source_binding_id_fk\` FOREIGN KEY (\`artifact_binding_id\`) REFERENCES \`artifact_source_binding\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_descriptor_observation_id_artifact_source_observation_id_fk\` FOREIGN KEY (\`descriptor_observation_id\`) REFERENCES \`artifact_source_observation\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_descriptor_correction_id_artifact_observation_correction_id_fk\` FOREIGN KEY (\`descriptor_correction_id\`) REFERENCES \`artifact_observation_correction\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_content_root_id_content_root_id_fk\` FOREIGN KEY (\`content_root_id\`) REFERENCES \`content_root\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_content_root_id_content_root_binding_id_content_root_binding_content_root_id_id_fk\` FOREIGN KEY (\`content_root_id\`,\`content_root_binding_id\`) REFERENCES \`content_root_binding\`(\`content_root_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_content_root_id_content_root_binding_episode_id_content_root_binding_id_content_root_binding_episode_ordinal_content_root_binding_episode_content_root_id_id_binding_id_ordinal_fk\` FOREIGN KEY (\`content_root_id\`,\`content_root_binding_episode_id\`,\`content_root_binding_id\`,\`content_root_binding_episode_ordinal\`) REFERENCES \`content_root_binding_episode\`(\`content_root_id\`,\`id\`,\`binding_id\`,\`ordinal\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_artifact_target_content_root_id_content_root_grant_episode_id_content_root_binding_id_content_root_binding_episode_id_content_root_grant_episode_ordinal_content_root_grant_episode_content_root_id_id_binding_id_binding_episode_id_ordinal_fk\` FOREIGN KEY (\`content_root_id\`,\`content_root_grant_episode_id\`,\`content_root_binding_id\`,\`content_root_binding_episode_id\`,\`content_root_grant_episode_ordinal\`) REFERENCES \`content_root_grant_episode\`(\`content_root_id\`,\`id\`,\`binding_id\`,\`binding_episode_id\`,\`ordinal\`) ON DELETE RESTRICT,
          CONSTRAINT "material_map_artifact_target_attribution" CHECK(("attribution_type" = 'recorded' AND "attribution_member_id" IS NULL) OR ("attribution_type" = 'lineage_correction' AND "attribution_member_id" IS NOT NULL)),
          CONSTRAINT "material_map_artifact_target_versions" CHECK("disposition_version" >= 0 AND "lineage_version" >= 0 AND "source_version" >= 0 AND "content_root_binding_episode_ordinal" >= 1 AND "content_root_grant_episode_ordinal" >= 1 AND "content_root_grant_version" >= 1),
          CONSTRAINT "material_map_artifact_target_content" CHECK("fingerprint_algorithm" = 'sha256' AND length("fingerprint_digest") = 64 AND "fingerprint_digest" NOT GLOB '*[^0-9a-f]*' AND "byte_length" > 0 AND length("media_type") > 0),
          CONSTRAINT "material_map_artifact_target_source" CHECK(length("active_location") > 0 AND length("normalized_relative_path") > 0 AND "source_object_platform" = 'windows_ntfs' AND "source_object_verifier_version" >= 1 AND length("source_object_canonical_path") > 0 AND length("source_object_canonical_path_key") > 0 AND "source_object_canonical_path" = "active_location" AND length("source_object_volume_serial") > 0 AND length("source_object_id") = 32 AND length("source_object_creation_time") > 0 AND length("source_object_change_time") > 0 AND length("source_object_last_write_time") > 0 AND "source_object_size" = "byte_length" AND "source_observed_time" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`material_map_disposition_event\` (
          \`id\` text PRIMARY KEY,
          \`map_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`reason\` text,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT \`fk_material_map_disposition_event_map_id_material_map_id_fk\` FOREIGN KEY (\`map_id\`) REFERENCES \`material_map\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`material_map_disposition_version_unique\` UNIQUE(\`map_id\`,\`version\`),
          CONSTRAINT "material_map_disposition_version" CHECK("version" >= 0),
          CONSTRAINT "material_map_disposition_shape" CHECK(("disposition" = 'active' AND "reason" IS NULL) OR ("disposition" = 'withdrawn' AND "reason" IS NOT NULL AND length(trim("reason")) BETWEEN 1 AND 2000)),
          CONSTRAINT "material_map_disposition_time" CHECK("time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`material_map_representation_target\` (
          \`map_id\` text PRIMARY KEY,
          \`representation_revision_id\` text NOT NULL,
          CONSTRAINT \`fk_material_map_representation_target_map_id_material_map_id_fk\` FOREIGN KEY (\`map_id\`) REFERENCES \`material_map\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_map_representation_target_representation_revision_id_representation_revision_id_fk\` FOREIGN KEY (\`representation_revision_id\`) REFERENCES \`representation_revision\`(\`id\`) ON DELETE RESTRICT
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`material_map_state\` (
          \`map_id\` text PRIMARY KEY,
          \`version\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`withdrawal_reason\` text,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_material_map_state_map_id_material_map_id_fk\` FOREIGN KEY (\`map_id\`) REFERENCES \`material_map\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "material_map_state_version" CHECK("version" >= 0),
          CONSTRAINT "material_map_state_shape" CHECK(("disposition" = 'active' AND "withdrawal_reason" IS NULL) OR ("disposition" = 'withdrawn' AND "withdrawal_reason" IS NOT NULL AND length(trim("withdrawal_reason")) BETWEEN 1 AND 2000)),
          CONSTRAINT "material_map_state_time" CHECK("time_updated" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`material_map\` (
          \`id\` text PRIMARY KEY,
          \`canonical_input\` text NOT NULL,
          \`target_kind\` text NOT NULL,
          \`supersedes_map_id\` text,
          \`authorship_basis\` text NOT NULL,
          \`authorship_capability_identity\` text NOT NULL,
          \`authorship_capability_version\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_material_map_supersedes_map_id_material_map_id_fk\` FOREIGN KEY (\`supersedes_map_id\`) REFERENCES \`material_map\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`material_map_id_target_unique\` UNIQUE(\`id\`,\`target_kind\`),
          CONSTRAINT "material_map_canonical_input" CHECK(json_valid("canonical_input")),
          CONSTRAINT "material_map_target_kind" CHECK("target_kind" IN ('artifact', 'representation')),
          CONSTRAINT "material_map_no_self_predecessor" CHECK("supersedes_map_id" IS NULL OR "supersedes_map_id" <> "id"),
          CONSTRAINT "material_map_authorship" CHECK(length(trim("authorship_basis")) BETWEEN 1 AND 2000 AND length(trim("authorship_capability_identity")) BETWEEN 1 AND 500 AND "authorship_capability_version" >= 0),
          CONSTRAINT "material_map_time_nonnegative" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`material_outline_node\` (
          \`id\` text PRIMARY KEY,
          \`map_id\` text NOT NULL,
          \`parent_node_id\` text,
          \`title\` text NOT NULL,
          \`preorder_position\` integer NOT NULL,
          \`depth\` integer NOT NULL,
          CONSTRAINT \`fk_material_outline_node_map_id_material_map_id_fk\` FOREIGN KEY (\`map_id\`) REFERENCES \`material_map\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_outline_node_map_id_parent_node_id_material_outline_node_map_id_id_fk\` FOREIGN KEY (\`map_id\`,\`parent_node_id\`) REFERENCES \`material_outline_node\`(\`map_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`material_outline_node_owner_unique\` UNIQUE(\`map_id\`,\`id\`),
          CONSTRAINT \`material_outline_node_position_unique\` UNIQUE(\`map_id\`,\`preorder_position\`),
          CONSTRAINT "material_outline_node_title" CHECK(length(trim("title")) BETWEEN 1 AND 500),
          CONSTRAINT "material_outline_node_position" CHECK("preorder_position" >= 0),
          CONSTRAINT "material_outline_node_depth" CHECK("depth" BETWEEN 0 AND 16),
          CONSTRAINT "material_outline_node_parent_shape" CHECK(("parent_node_id" IS NULL AND "depth" = 0) OR ("parent_node_id" IS NOT NULL AND "depth" > 0))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`material_selector\` (
          \`id\` text PRIMARY KEY,
          \`map_id\` text NOT NULL,
          \`node_id\` text NOT NULL,
          \`selector_position\` integer NOT NULL,
          \`kind\` text NOT NULL,
          \`artifact_start_byte\` integer,
          \`artifact_end_byte\` integer,
          \`pdf_start_page\` integer,
          \`pdf_end_page\` integer,
          \`pdf_start_item\` integer,
          \`pdf_start_scalar\` integer,
          \`pdf_end_item\` integer,
          \`pdf_end_scalar\` integer,
          \`model_start_scalar\` integer,
          \`model_end_scalar\` integer,
          \`witness_algorithm\` text NOT NULL,
          \`witness_digest\` text NOT NULL,
          \`witness_byte_length\` integer NOT NULL,
          CONSTRAINT \`fk_material_selector_map_id_material_map_id_fk\` FOREIGN KEY (\`map_id\`) REFERENCES \`material_map\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_material_selector_map_id_node_id_material_outline_node_map_id_id_fk\` FOREIGN KEY (\`map_id\`,\`node_id\`) REFERENCES \`material_outline_node\`(\`map_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`material_selector_owner_unique\` UNIQUE(\`map_id\`,\`id\`),
          CONSTRAINT \`material_selector_node_position_unique\` UNIQUE(\`map_id\`,\`node_id\`,\`selector_position\`),
          CONSTRAINT "material_selector_position" CHECK("selector_position" >= 0),
          CONSTRAINT "material_selector_coordinate_shape" CHECK(("kind" = 'whole_target.v1' AND "artifact_start_byte" IS NULL AND "artifact_end_byte" IS NULL AND "pdf_start_page" IS NULL AND "pdf_end_page" IS NULL AND "pdf_start_item" IS NULL AND "pdf_start_scalar" IS NULL AND "pdf_end_item" IS NULL AND "pdf_end_scalar" IS NULL AND "model_start_scalar" IS NULL AND "model_end_scalar" IS NULL) OR ("kind" = 'artifact_byte_range.v1' AND "artifact_start_byte" IS NOT NULL AND "artifact_start_byte" >= 0 AND "artifact_end_byte" IS NOT NULL AND "artifact_end_byte" > "artifact_start_byte" AND "pdf_start_page" IS NULL AND "pdf_end_page" IS NULL AND "pdf_start_item" IS NULL AND "pdf_start_scalar" IS NULL AND "pdf_end_item" IS NULL AND "pdf_end_scalar" IS NULL AND "model_start_scalar" IS NULL AND "model_end_scalar" IS NULL) OR ("kind" = 'pdf_page_range.v1' AND "artifact_start_byte" IS NULL AND "artifact_end_byte" IS NULL AND "pdf_start_page" IS NOT NULL AND "pdf_start_page" >= 1 AND "pdf_end_page" IS NOT NULL AND "pdf_end_page" >= "pdf_start_page" AND "pdf_start_item" IS NULL AND "pdf_start_scalar" IS NULL AND "pdf_end_item" IS NULL AND "pdf_end_scalar" IS NULL AND "model_start_scalar" IS NULL AND "model_end_scalar" IS NULL) OR ("kind" = 'pdf_text_range.v1' AND "artifact_start_byte" IS NULL AND "artifact_end_byte" IS NULL AND "pdf_start_page" IS NOT NULL AND "pdf_start_page" >= 1 AND "pdf_end_page" IS NOT NULL AND "pdf_end_page" >= "pdf_start_page" AND "pdf_start_item" IS NOT NULL AND "pdf_start_item" >= 0 AND "pdf_start_scalar" IS NOT NULL AND "pdf_start_scalar" >= 0 AND "pdf_end_item" IS NOT NULL AND "pdf_end_item" >= 0 AND "pdf_end_scalar" IS NOT NULL AND "pdf_end_scalar" >= 0 AND "model_start_scalar" IS NULL AND "model_end_scalar" IS NULL) OR ("kind" = 'model_text_range.v1' AND "artifact_start_byte" IS NULL AND "artifact_end_byte" IS NULL AND "pdf_start_page" IS NULL AND "pdf_end_page" IS NULL AND "pdf_start_item" IS NULL AND "pdf_start_scalar" IS NULL AND "pdf_end_item" IS NULL AND "pdf_end_scalar" IS NULL AND "model_start_scalar" IS NOT NULL AND "model_start_scalar" >= 0 AND "model_end_scalar" IS NOT NULL AND "model_end_scalar" > "model_start_scalar")),
          CONSTRAINT "material_selector_witness" CHECK("witness_algorithm" = 'sha256' AND length("witness_digest") = 64 AND "witness_digest" NOT GLOB '*[^0-9a-f]*' AND "witness_byte_length" > 0)
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`material_course_alignment_disposition_history_idx\` ON \`material_course_alignment_disposition_event\` (\`alignment_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_course_alignment_state_discovery_idx\` ON \`material_course_alignment_state\` (\`disposition\`,\`time_updated\`,\`alignment_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_course_alignment_selector_idx\` ON \`material_course_alignment\` (\`map_id\`,\`selector_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_course_alignment_membership_idx\` ON \`material_course_alignment\` (\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_course_alignment_predecessor_idx\` ON \`material_course_alignment\` (\`supersedes_alignment_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_map_artifact_target_idx\` ON \`material_map_artifact_target\` (\`artifact_id\`,\`artifact_revision_id\`,\`attribution_type\`,\`attribution_member_id\`,\`map_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_map_disposition_history_idx\` ON \`material_map_disposition_event\` (\`map_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_map_representation_target_idx\` ON \`material_map_representation_target\` (\`representation_revision_id\`,\`map_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_map_state_discovery_idx\` ON \`material_map_state\` (\`disposition\`,\`time_updated\`,\`map_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_map_predecessor_idx\` ON \`material_map\` (\`supersedes_map_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_outline_node_page_idx\` ON \`material_outline_node\` (\`map_id\`,\`preorder_position\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`material_selector_page_idx\` ON \`material_selector\` (\`map_id\`,\`node_id\`,\`selector_position\`,\`id\`);`,
      )
      yield* MaterialMapConstraintSchema.install(tx)
    })
  },
} satisfies DatabaseMigration.Migration
