import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260717141402_readable_representation_lineage",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`representation_availability_current\` (
          \`representation_revision_id\` text PRIMARY KEY,
          \`version\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_representation_availability_current_representation_revision_id_representation_revision_id_fk\` FOREIGN KEY (\`representation_revision_id\`) REFERENCES \`representation_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "representation_availability_current_version_positive" CHECK("version" >= 1),
          CONSTRAINT "representation_availability_current_disposition" CHECK("disposition" IN ('available', 'externally_missing', 'integrity_mismatch', 'explicitly_deleted')),
          CONSTRAINT "representation_availability_current_time_nonnegative" CHECK("time_updated" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`representation_availability_event\` (
          \`id\` text PRIMARY KEY,
          \`representation_revision_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`observed_storage_key\` text,
          \`observed_digest\` text,
          \`observed_byte_length\` integer,
          \`basis\` text NOT NULL,
          \`operation_identity\` text CONSTRAINT \`representation_availability_operation_unique\` UNIQUE,
          \`time_observed\` integer NOT NULL,
          CONSTRAINT \`fk_representation_availability_event_representation_revision_id_representation_revision_id_fk\` FOREIGN KEY (\`representation_revision_id\`) REFERENCES \`representation_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`representation_availability_version_unique\` UNIQUE(\`representation_revision_id\`,\`version\`),
          CONSTRAINT "representation_availability_version_positive" CHECK("version" >= 1),
          CONSTRAINT "representation_availability_basis" CHECK("basis" IN ('acceptance', 'verified_read', 'missing_observation', 'integrity_observation', 'exact_restoration', 'explicit_deletion', 'deletion_recovery')),
          CONSTRAINT "representation_availability_observation_shape" CHECK(("observed_storage_key" IS NOT NULL AND length("observed_storage_key") > 0) AND (("disposition" = 'available' AND "observed_digest" IS NOT NULL AND length("observed_digest") = 64 AND "observed_digest" NOT GLOB '*[^0-9a-f]*' AND "observed_byte_length" IS NOT NULL AND "observed_byte_length" >= 0) OR ("disposition" = 'integrity_mismatch' AND (("observed_digest" IS NULL AND "observed_byte_length" IS NULL) OR ("observed_digest" IS NOT NULL AND length("observed_digest") = 64 AND "observed_digest" NOT GLOB '*[^0-9a-f]*' AND "observed_byte_length" IS NOT NULL AND "observed_byte_length" >= 0))) OR ("disposition" IN ('externally_missing', 'explicitly_deleted') AND "observed_digest" IS NULL AND "observed_byte_length" IS NULL))),
          CONSTRAINT "representation_availability_time_nonnegative" CHECK("time_observed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`representation_continued_use_grant\` (
          \`id\` text PRIMARY KEY,
          \`effective_artifact_id\` text NOT NULL,
          \`representation_revision_id\` text NOT NULL,
          \`old_source_revision_id\` text NOT NULL,
          \`current_source_revision_id\` text NOT NULL,
          \`current_attribution_type\` text NOT NULL,
          \`current_attribution_member_id\` text,
          \`current_lineage_version\` integer NOT NULL,
          \`version\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`authorization_operation_identity\` text NOT NULL CONSTRAINT \`representation_continued_use_authorization_operation_unique\` UNIQUE,
          \`authorization_fingerprint\` text NOT NULL,
          \`causal_occurrence_id\` text,
          \`causal_invocation_part_id\` text,
          \`revocation_basis\` text,
          \`revocation_operation_identity\` text CONSTRAINT \`representation_continued_use_revocation_operation_unique\` UNIQUE,
          \`time_authorized\` integer NOT NULL,
          \`time_revoked\` integer,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_representation_continued_use_grant_effective_artifact_id_artifact_id_fk\` FOREIGN KEY (\`effective_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_continued_use_grant_representation_revision_id_representation_revision_id_fk\` FOREIGN KEY (\`representation_revision_id\`) REFERENCES \`representation_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_continued_use_grant_old_source_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`old_source_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_continued_use_grant_current_source_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`current_source_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_continued_use_grant_current_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`current_attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "representation_continued_use_attribution_shape" CHECK(("current_attribution_type" = 'recorded' AND "current_attribution_member_id" IS NULL) OR ("current_attribution_type" = 'lineage_correction' AND "current_attribution_member_id" IS NOT NULL)),
          CONSTRAINT "representation_continued_use_versions" CHECK("current_lineage_version" >= 0 AND "version" >= 1),
          CONSTRAINT "representation_continued_use_basis" CHECK(length("authorization_basis") > 0 AND length("authorization_operation_identity") > 0 AND length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*' AND (("causal_occurrence_id" IS NULL AND "causal_invocation_part_id" IS NULL) OR ("causal_occurrence_id" IS NOT NULL AND length("causal_occurrence_id") > 0 AND "causal_invocation_part_id" IS NOT NULL AND length("causal_invocation_part_id") > 0))),
          CONSTRAINT "representation_continued_use_disposition_shape" CHECK(("disposition" = 'active' AND "revocation_basis" IS NULL AND "revocation_operation_identity" IS NULL AND "time_revoked" IS NULL) OR ("disposition" = 'revoked' AND "revocation_basis" IS NOT NULL AND length("revocation_basis") > 0 AND "revocation_operation_identity" IS NOT NULL AND length("revocation_operation_identity") > 0 AND "time_revoked" >= "time_authorized")),
          CONSTRAINT "representation_continued_use_time_order" CHECK("time_authorized" >= 0 AND "time_updated" >= "time_authorized")
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`representation_effect\` (
          \`id\` text PRIMARY KEY,
          \`operation_identity\` text NOT NULL CONSTRAINT \`representation_effect_operation_unique\` UNIQUE,
          \`semantic_fingerprint\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT "representation_effect_operation_nonempty" CHECK(length("operation_identity") > 0),
          CONSTRAINT "representation_effect_fingerprint" CHECK(length("semantic_fingerprint") = 64 AND "semantic_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "representation_effect_time_nonnegative" CHECK("time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`representation_revision\` (
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
          CONSTRAINT "representation_revision_source_shape" CHECK(length("source_media_type") > 0 AND length("source_digest") = 64 AND "source_digest" NOT GLOB '*[^0-9a-f]*' AND "source_byte_length" >= 0 AND length("normalized_relative_path") > 0 AND "source_object_platform" = 'windows_ntfs' AND "source_object_verifier_version" >= 1 AND length("source_object_canonical_path") > 0 AND length("source_object_canonical_path_key") > 0 AND lower("source_object_canonical_path") = "source_object_canonical_path_key" AND length("source_object_volume_serial") > 0 AND length("source_object_id") = 32 AND length("source_object_creation_time") > 0 AND length("source_object_change_time") > 0 AND length("source_object_last_write_time") > 0 AND "source_object_size" >= 0 AND "source_object_size" = "source_byte_length" AND "source_object_kind" = 'file' AND "source_observed_time" >= 0),
          CONSTRAINT "representation_revision_input_shape" CHECK(length("presented_input_digest") = 64 AND "presented_input_digest" NOT GLOB '*[^0-9a-f]*' AND "presented_input_byte_length" >= 0 AND "presented_input_digest" = "source_digest" AND "presented_input_byte_length" = "source_byte_length"),
          CONSTRAINT "representation_revision_producer_shape" CHECK(length("producer_identity") > 0 AND length("producer_version") > 0 AND "task_version" >= 1 AND "canonicalizer_version" >= 1 AND "provenance_version" >= 1 AND length("run_identity") > 0 AND json_valid("provenance") AND json_type("provenance") = 'object' AND json_valid("diagnostics") AND json_type("diagnostics") = 'array' AND json_valid("usage") AND json_type("usage") = 'object' AND (("producer_kind" = 'local_pdf' AND "provider_id" IS NULL AND "model_id" IS NULL AND "profile_variant" IS NULL AND "profile" = 'repa.pdf-text.v1' AND "result_boundary" = 'framed_stdout_v1' AND "terminal_status" = 'completed' AND "acceptance_basis" = 'mechanical_profile') OR ("producer_kind" = 'configured_model' AND "provider_id" IS NOT NULL AND length("provider_id") > 0 AND "model_id" IS NOT NULL AND length("model_id") > 0 AND "profile" = 'repa.model-rendition.v1' AND "result_boundary" = 'model_schema_v1' AND "terminal_status" = 'stop' AND "acceptance_basis" = 'model_claimed_rendition'))),
          CONSTRAINT "representation_revision_output_shape" CHECK(length("output_media_type") > 0 AND length("storage_key") > 0 AND length("output_digest") = 64 AND "output_digest" NOT GLOB '*[^0-9a-f]*' AND "output_byte_length" > 0 AND "profile_record_count" >= 1),
          CONSTRAINT "representation_revision_creation_shape" CHECK("creation_basis" IN ('deterministic_operation', 'learning_command') AND length("creation_identity") > 0 AND "authorization_intent" = 'persistent_readable_access' AND length("authorization_basis") > 0 AND (("creation_basis" = 'deterministic_operation' AND "delivery_mode" = 'deterministic' AND "causal_occurrence_id" IS NULL AND "causal_invocation_part_id" IS NULL) OR ("creation_basis" = 'learning_command' AND "delivery_mode" = 'model_tool' AND "causal_occurrence_id" IS NOT NULL AND length("causal_occurrence_id") > 0 AND "causal_invocation_part_id" IS NOT NULL AND length("causal_invocation_part_id") > 0)) AND "time_accepted" >= 0)
        );
      `)
      yield* tx.run(
        `ALTER TABLE \`learning_command_invocation\` ADD \`representation_effect_id\` text REFERENCES representation_effect(id);`,
      )
      yield* tx.run(
        `ALTER TABLE \`learning_command_receipt\` ADD \`representation_effect_id\` text REFERENCES representation_effect(id);`,
      )
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
          \`status\` text NOT NULL,
          \`effect_id\` text,
          \`representation_effect_id\` text,
          \`settlement\` text,
          \`time_admitted\` integer NOT NULL,
          \`time_settled\` integer,
          \`settlement_order\` integer,
          CONSTRAINT \`fk_learning_command_invocation_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_representation_effect_id_representation_effect_id_fk\` FOREIGN KEY (\`representation_effect_id\`) REFERENCES \`representation_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_command_invocation_assistant_call_unique\` UNIQUE(\`assistant_message_id\`,\`provider_call_id\`),
          CONSTRAINT \`learning_command_invocation_assistant_ordinal_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learning_command_invocation_call_nonempty" CHECK(length("provider_call_id") > 0),
          CONSTRAINT "learning_command_invocation_command" CHECK("command_name" IN ('accept_course_view_revision', 'representation.convert')),
          CONSTRAINT "learning_command_invocation_command_version" CHECK("command_version" = 1),
          CONSTRAINT "learning_command_invocation_emission_ordinal" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "learning_command_invocation_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_invocation_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_invocation_capability_match" CHECK(("command_name" = 'accept_course_view_revision' AND "capability_identity" = 'accept_course_view_revision' AND "capability_version" = 1) OR ("command_name" = 'representation.convert' AND "capability_identity" = 'representation.convert' AND "capability_version" = 1)),
          CONSTRAINT "learning_command_invocation_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_invocation_fingerprint" CHECK(length("input_fingerprint") = 64),
          CONSTRAINT "learning_command_invocation_status" CHECK("status" IN ('admitted', 'applied', 'already_applied', 'error')),
          CONSTRAINT "learning_command_invocation_settlement_shape" CHECK(("status" = 'admitted' AND "settlement" IS NULL AND "time_settled" IS NULL AND "settlement_order" IS NULL AND "effect_id" IS NULL AND "representation_effect_id" IS NULL) OR ("status" <> 'admitted' AND "settlement" IS NOT NULL AND "time_settled" IS NOT NULL AND "settlement_order" IS NOT NULL)),
          CONSTRAINT "learning_command_invocation_effect_shape" CHECK(("status" IN ('applied', 'already_applied') AND (("command_name" = 'accept_course_view_revision' AND "effect_id" IS NOT NULL AND "representation_effect_id" IS NULL) OR ("command_name" = 'representation.convert' AND "effect_id" IS NULL AND "representation_effect_id" IS NOT NULL))) OR ("status" IN ('admitted', 'error') AND "effect_id" IS NULL AND "representation_effect_id" IS NULL)),
          CONSTRAINT "learning_command_invocation_time_order" CHECK("time_admitted" >= 0 AND ("time_settled" IS NULL OR "time_settled" >= "time_admitted") AND ("settlement_order" IS NULL OR "settlement_order" >= 0))
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_invocation\`(\`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`status\`, \`effect_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\`) SELECT \`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`status\`, \`effect_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\` FROM \`learning_command_invocation\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_command_invocation\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_command_invocation\` RENAME TO \`learning_command_invocation\`;`)
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
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learning_command_receipt_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_representation_effect_id_representation_effect_id_fk\` FOREIGN KEY (\`representation_effect_id\`) REFERENCES \`representation_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_command_receipt_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_receipt_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_receipt_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_receipt_effect_shape" CHECK(("capability_identity" = 'accept_course_view_revision' AND "capability_version" = 1 AND "effect_id" IS NOT NULL AND "representation_effect_id" IS NULL) OR ("capability_identity" = 'representation.convert' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NOT NULL)),
          CONSTRAINT "learning_command_receipt_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_receipt\`(\`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`effect_id\`, \`time_committed\`, \`commit_order\`) SELECT \`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`effect_id\`, \`time_committed\`, \`commit_order\` FROM \`learning_command_receipt\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_command_receipt\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_command_receipt\` RENAME TO \`learning_command_receipt\`;`)
      yield* tx.run(`
        CREATE TABLE \`__new_content_root_binding_episode\` (
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
          CONSTRAINT \`content_root_binding_episode_receipt_unique\` UNIQUE(\`content_root_id\`,\`id\`,\`binding_id\`,\`ordinal\`),
          CONSTRAINT \`content_root_binding_episode_ordinal_unique\` UNIQUE(\`content_root_id\`,\`ordinal\`),
          CONSTRAINT "content_root_binding_episode_ordinal_positive" CHECK("ordinal" >= 1),
          CONSTRAINT "content_root_binding_episode_basis" CHECK(length("approval_basis") > 0),
          CONSTRAINT "content_root_binding_episode_end_shape" CHECK(("time_ended" IS NULL AND "end_reason" IS NULL) OR ("time_ended" IS NOT NULL AND "time_ended" >= "time_started" AND "end_reason" = 'explicit_rebind')),
          CONSTRAINT "content_root_binding_episode_time_nonnegative" CHECK("time_started" >= 0)
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_content_root_binding_episode\`(\`id\`, \`content_root_id\`, \`binding_id\`, \`ordinal\`, \`approval_basis\`, \`time_started\`, \`time_ended\`, \`end_reason\`) SELECT \`id\`, \`content_root_id\`, \`binding_id\`, \`ordinal\`, \`approval_basis\`, \`time_started\`, \`time_ended\`, \`end_reason\` FROM \`content_root_binding_episode\`;`,
      )
      yield* tx.run(`DROP TABLE \`content_root_binding_episode\`;`)
      yield* tx.run(`ALTER TABLE \`__new_content_root_binding_episode\` RENAME TO \`content_root_binding_episode\`;`)
      yield* tx.run(`
        CREATE TABLE \`__new_content_root_grant_episode\` (
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
          CONSTRAINT \`content_root_grant_episode_receipt_unique\` UNIQUE(\`content_root_id\`,\`id\`,\`binding_id\`,\`binding_episode_id\`,\`ordinal\`),
          CONSTRAINT \`content_root_grant_episode_ordinal_unique\` UNIQUE(\`content_root_id\`,\`ordinal\`),
          CONSTRAINT "content_root_grant_episode_ordinal_positive" CHECK("ordinal" >= 1),
          CONSTRAINT "content_root_grant_episode_basis" CHECK(length("approval_basis") > 0),
          CONSTRAINT "content_root_grant_episode_close_shape" CHECK(("time_closed" IS NULL AND "close_basis" IS NULL) OR ("time_closed" IS NOT NULL AND "time_closed" >= "time_approved" AND "close_basis" IS NOT NULL AND length("close_basis") > 0)),
          CONSTRAINT "content_root_grant_episode_time_order" CHECK("time_approved" >= 0 AND "time_updated" >= "time_approved")
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_content_root_grant_episode\`(\`id\`, \`content_root_id\`, \`binding_id\`, \`binding_episode_id\`, \`ordinal\`, \`approval_basis\`, \`time_approved\`, \`close_basis\`, \`time_closed\`, \`time_updated\`) SELECT \`id\`, \`content_root_id\`, \`binding_id\`, \`binding_episode_id\`, \`ordinal\`, \`approval_basis\`, \`time_approved\`, \`close_basis\`, \`time_closed\`, \`time_updated\` FROM \`content_root_grant_episode\`;`,
      )
      yield* tx.run(`DROP TABLE \`content_root_grant_episode\`;`)
      yield* tx.run(`ALTER TABLE \`__new_content_root_grant_episode\` RENAME TO \`content_root_grant_episode\`;`)
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
        `CREATE UNIQUE INDEX \`content_root_binding_episode_active_idx\` ON \`content_root_binding_episode\` (\`content_root_id\`) WHERE "content_root_binding_episode"."time_ended" IS NULL;`,
      )
      yield* tx.run(
        `CREATE INDEX \`content_root_binding_episode_history_idx\` ON \`content_root_binding_episode\` (\`content_root_id\`,\`ordinal\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`content_root_grant_episode_active_idx\` ON \`content_root_grant_episode\` (\`content_root_id\`) WHERE "content_root_grant_episode"."time_closed" IS NULL;`,
      )
      yield* tx.run(
        `CREATE INDEX \`content_root_grant_episode_history_idx\` ON \`content_root_grant_episode\` (\`content_root_id\`,\`ordinal\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`representation_availability_current_disposition_idx\` ON \`representation_availability_current\` (\`disposition\`,\`representation_revision_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`representation_availability_history_idx\` ON \`representation_availability_event\` (\`representation_revision_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`representation_continued_use_active_idx\` ON \`representation_continued_use_grant\` (\`effective_artifact_id\`,\`representation_revision_id\`,\`old_source_revision_id\`,\`current_source_revision_id\`) WHERE "representation_continued_use_grant"."disposition" = 'active';`,
      )
      yield* tx.run(
        `CREATE INDEX \`representation_continued_use_history_idx\` ON \`representation_continued_use_grant\` (\`effective_artifact_id\`,\`representation_revision_id\`,\`time_authorized\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`representation_revision_source_idx\` ON \`representation_revision\` (\`source_revision_id\`,\`time_accepted\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`representation_revision_artifact_idx\` ON \`representation_revision\` (\`effective_artifact_id\`,\`time_accepted\`,\`id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
