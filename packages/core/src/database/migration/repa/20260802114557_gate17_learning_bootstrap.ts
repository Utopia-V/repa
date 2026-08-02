import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV17 } from "../../schema-extras-v17"

export default {
  id: "20260802114557_gate17_learning_bootstrap",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_alignment_result\` (
          \`effect_id\` text NOT NULL,
          \`local_key\` text NOT NULL,
          \`alignment_id\` text NOT NULL CONSTRAINT \`learning_bootstrap_alignment_identity_unique\` UNIQUE,
          CONSTRAINT \`learning_bootstrap_alignment_result_pk\` PRIMARY KEY(\`effect_id\`, \`local_key\`),
          CONSTRAINT \`fk_learning_bootstrap_alignment_result_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_alignment_result_alignment_id_material_course_alignment_id_fk\` FOREIGN KEY (\`alignment_id\`) REFERENCES \`material_course_alignment\`(\`id\`) ON DELETE RESTRICT
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_anchor_result\` (
          \`effect_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`anchor_effect_id\` text,
          CONSTRAINT \`fk_learning_bootstrap_anchor_result_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_anchor_result_anchor_effect_id_learner_course_route_anchor_transition_id_fk\` FOREIGN KEY (\`anchor_effect_id\`) REFERENCES \`learner_course_route_anchor_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_bootstrap_anchor_result_closed" CHECK(("outcome" = 'changed' AND "anchor_effect_id" IS NOT NULL)
                OR ("outcome" = 'no_change' AND "anchor_effect_id" IS NULL))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_capability_issue\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_learning_bootstrap_capability_issue_invocation_part_id_learning_bootstrap_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_bootstrap_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`learning_bootstrap_capability_issue_exact\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "learning_bootstrap_capability_issue_shape" CHECK(length("agent_action_fingerprint") = 64 AND length("policy_fingerprint") = 64
                AND length("shown_scope_fingerprint") = 64 AND json_valid("policy_basis")
                AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_capability_settlement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`agent_action_fingerprint\` text NOT NULL,
          \`basis\` text,
          \`basis_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_learning_bootstrap_capability_settlement_invocation_part_id_learning_bootstrap_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_bootstrap_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_learning_bootstrap_capability_settlement_invocation_part_id_permission_request_id_learning_bootstrap_capability_issue_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`learning_bootstrap_capability_issue\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE CASCADE,
          CONSTRAINT "learning_bootstrap_capability_settlement_shape" CHECK(length("agent_action_fingerprint") = 64
                AND ("basis_fingerprint" IS NULL OR length("basis_fingerprint") = 64)
                AND "time_settled" >= 0 AND "settlement_order" >= 0
                AND (("outcome" = 'not_evaluated' AND "permission_request_id" IS NULL AND "basis" IS NULL)
                  OR ("outcome" IN ('policy_allow', 'policy_deny') AND "permission_request_id" IS NULL AND json_valid("basis"))
                  OR ("outcome" = 'prompted_abort' AND "permission_request_id" IS NOT NULL AND "basis" IS NULL)
                  OR ("outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel') AND "permission_request_id" IS NOT NULL AND json_valid("basis"))))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL UNIQUE,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          CONSTRAINT \`fk_learning_bootstrap_commit_seal_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_course_result\` (
          \`effect_id\` text PRIMARY KEY,
          \`course_id\` text NOT NULL,
          \`outcome\` text NOT NULL,
          CONSTRAINT \`fk_learning_bootstrap_course_result_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_course_result_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`semantic_address_fingerprint\` text NOT NULL,
          \`semantic_outcome\` text,
          \`existing_effect_id\` text,
          \`existing_intent_fingerprint\` text,
          \`agent_action_fingerprint\` text,
          \`agent_action\` text,
          \`materialized_candidate\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_learning_bootstrap_disposition_existing_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`existing_effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_disposition_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "learning_bootstrap_disposition_fingerprints" CHECK(length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("semantic_address_fingerprint") = 64 AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("existing_intent_fingerprint" IS NULL OR (length("existing_intent_fingerprint") = 64 AND "existing_intent_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("agent_action_fingerprint" IS NULL OR (length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learning_bootstrap_disposition_closed" CHECK(("disposition" = 'candidate_v1'
                  AND "semantic_outcome" IS NULL AND "existing_effect_id" IS NULL
                  AND "existing_intent_fingerprint" IS NULL
                  AND "agent_action_fingerprint" IS NOT NULL
                  AND json_valid("agent_action") AND json_valid("materialized_candidate"))
                OR ("disposition" = 'semantic_terminal_v1'
                  AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                  AND "existing_effect_id" IS NOT NULL AND "existing_intent_fingerprint" IS NOT NULL
                  AND "agent_action_fingerprint" IS NULL AND "agent_action" IS NULL
                  AND "materialized_candidate" IS NULL)),
          CONSTRAINT "learning_bootstrap_disposition_shape" CHECK(json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1 AND "time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_effect\` (
          \`id\` text PRIMARY KEY,
          \`commit_seal_id\` text NOT NULL,
          \`occurrence_id\` text NOT NULL UNIQUE,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`semantic_fingerprint\` text NOT NULL,
          \`command\` text NOT NULL,
          \`materialized_candidate\` text NOT NULL,
          \`course_id\` text NOT NULL,
          \`child_results\` text NOT NULL,
          \`acknowledgement\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL UNIQUE,
          \`frontier_time\` integer NOT NULL,
          CONSTRAINT \`fk_learning_bootstrap_effect_commit_seal_id_learning_bootstrap_commit_seal_effect_id_fk\` FOREIGN KEY (\`commit_seal_id\`) REFERENCES \`learning_bootstrap_commit_seal\`(\`effect_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_effect_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_effect_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_effect_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_bootstrap_effect_seal" CHECK("commit_seal_id" = "id"),
          CONSTRAINT "learning_bootstrap_effect_shape" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'lbe_'
                AND length("semantic_fingerprint") = 64 AND json_valid("command")
                AND json_valid("materialized_candidate") AND json_valid("child_results")
                AND json_array_length("child_results") BETWEEN 1 AND 128 AND json_valid("acknowledgement")
                AND "time_committed" >= 0 AND "commit_order" >= 0
                AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed")
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_map_result\` (
          \`effect_id\` text NOT NULL,
          \`local_key\` text NOT NULL,
          \`map_id\` text NOT NULL CONSTRAINT \`learning_bootstrap_map_identity_unique\` UNIQUE,
          CONSTRAINT \`learning_bootstrap_map_result_pk\` PRIMARY KEY(\`effect_id\`, \`local_key\`),
          CONSTRAINT \`fk_learning_bootstrap_map_result_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_map_result_map_id_material_map_id_fk\` FOREIGN KEY (\`map_id\`) REFERENCES \`material_map\`(\`id\`) ON DELETE RESTRICT
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_material_result\` (
          \`effect_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`local_key\` text NOT NULL,
          \`adoption_id\` text NOT NULL,
          \`outcome\` text NOT NULL,
          CONSTRAINT \`learning_bootstrap_material_result_pk\` PRIMARY KEY(\`effect_id\`, \`ordinal\`),
          CONSTRAINT \`fk_learning_bootstrap_material_result_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_material_result_adoption_id_learning_course_material_adoption_id_fk\` FOREIGN KEY (\`adoption_id\`) REFERENCES \`learning_course_material_adoption\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_bootstrap_material_key_unique\` UNIQUE(\`effect_id\`,\`local_key\`)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_route_result\` (
          \`effect_id\` text PRIMARY KEY,
          \`view_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          CONSTRAINT \`fk_learning_bootstrap_route_result_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_route_result_view_id_course_view_id_fk\` FOREIGN KEY (\`view_id\`) REFERENCES \`course_view\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_route_result_revision_id_course_view_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`course_view_revision\`(\`id\`) ON DELETE RESTRICT
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_bootstrap_selection_result\` (
          \`effect_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`selected_revision_id\` text,
          \`selection_version\` integer NOT NULL,
          CONSTRAINT \`fk_learning_bootstrap_selection_result_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_bootstrap_selection_result_selected_revision_id_course_view_revision_id_fk\` FOREIGN KEY (\`selected_revision_id\`) REFERENCES \`course_view_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_bootstrap_selection_result_version" CHECK("selection_version" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learning_course_material_adoption\` (
          \`id\` text PRIMARY KEY,
          \`course_id\` text NOT NULL,
          \`target_kind\` text NOT NULL,
          \`artifact_id\` text,
          \`artifact_revision_id\` text,
          \`attribution_type\` text,
          \`attribution_member_id\` text,
          \`representation_revision_id\` text,
          \`creation_effect_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_learning_course_material_adoption_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_course_material_adoption_artifact_id_artifact_id_fk\` FOREIGN KEY (\`artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_course_material_adoption_artifact_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`artifact_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_course_material_adoption_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_course_material_adoption_representation_revision_id_representation_revision_id_fk\` FOREIGN KEY (\`representation_revision_id\`) REFERENCES \`representation_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_course_material_adoption_creation_effect_id_learning_bootstrap_effect_id_fk\` FOREIGN KEY (\`creation_effect_id\`) REFERENCES \`learning_bootstrap_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_course_material_artifact_unique\` UNIQUE(\`course_id\`,\`artifact_id\`,\`artifact_revision_id\`,\`attribution_type\`,\`attribution_member_id\`),
          CONSTRAINT \`learning_course_material_representation_unique\` UNIQUE(\`course_id\`,\`representation_revision_id\`),
          CONSTRAINT "learning_course_material_adoption_closed" CHECK(("target_kind" = 'artifact' AND "artifact_id" IS NOT NULL
                  AND "artifact_revision_id" IS NOT NULL AND "attribution_type" IN ('recorded', 'lineage_correction')
                  AND (("attribution_type" = 'recorded' AND "attribution_member_id" IS NULL)
                    OR ("attribution_type" = 'lineage_correction' AND "attribution_member_id" IS NOT NULL))
                  AND "representation_revision_id" IS NULL)
                OR ("target_kind" = 'representation' AND "artifact_id" IS NULL
                  AND "artifact_revision_id" IS NULL AND "attribution_type" IS NULL
                  AND "attribution_member_id" IS NULL AND "representation_revision_id" IS NOT NULL)),
          CONSTRAINT "learning_course_material_adoption_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'lba_' AND "time_created" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `ALTER TABLE \`material_map_artifact_target\` ADD \`authority_kind\` text DEFAULT 'content_root' NOT NULL;`,
      )
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`workspace_identity\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`operation_identity\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`operation_approval_basis\` text;`)
      yield* tx.run(
        `ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_descriptor_state\` text DEFAULT 'historical_v16_partial' NOT NULL;`,
      )
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_platform\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_verifier_version\` integer;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_canonical_path\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_canonical_path_key\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_volume_serial\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_id\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_creation_time\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_change_time\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_last_write_time\` text;`)
      yield* tx.run(`ALTER TABLE \`material_map_artifact_target\` ADD \`root_object_size\` integer;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_material_map_artifact_target\` (
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
          \`authority_kind\` text DEFAULT 'content_root' NOT NULL,
          \`content_root_id\` text,
          \`content_root_binding_id\` text,
          \`content_root_binding_episode_id\` text,
          \`content_root_binding_episode_ordinal\` integer,
          \`content_root_grant_episode_id\` text,
          \`content_root_grant_episode_ordinal\` integer,
          \`content_root_grant_version\` integer,
          \`workspace_identity\` text,
          \`operation_identity\` text,
          \`operation_approval_basis\` text,
          \`normalized_relative_path\` text NOT NULL,
          \`root_object_descriptor_state\` text DEFAULT 'exact_v1' NOT NULL,
          \`root_object_platform\` text,
          \`root_object_verifier_version\` integer,
          \`root_object_canonical_path\` text,
          \`root_object_canonical_path_key\` text,
          \`root_object_volume_serial\` text,
          \`root_object_id\` text,
          \`root_object_creation_time\` text,
          \`root_object_change_time\` text,
          \`root_object_last_write_time\` text,
          \`root_object_size\` integer,
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
          CONSTRAINT "material_map_artifact_target_versions" CHECK("disposition_version" >= 0 AND "lineage_version" >= 0 AND "source_version" >= 0),
          CONSTRAINT "material_map_artifact_target_authority" CHECK(("authority_kind" = 'content_root'
                  AND "content_root_id" IS NOT NULL
                  AND "content_root_binding_id" IS NOT NULL
                  AND "content_root_binding_episode_id" IS NOT NULL
                  AND "content_root_binding_episode_ordinal" >= 1
                  AND "content_root_grant_episode_id" IS NOT NULL
                  AND "content_root_grant_episode_ordinal" >= 1
                  AND "content_root_grant_version" >= 1
                  AND "workspace_identity" IS NULL
                  AND "operation_identity" IS NULL
                  AND "operation_approval_basis" IS NULL)
                OR ("authority_kind" = 'active_workspace'
                  AND "content_root_id" IS NULL
                  AND "content_root_binding_id" IS NULL
                  AND "content_root_binding_episode_id" IS NULL
                  AND "content_root_binding_episode_ordinal" IS NULL
                  AND "content_root_grant_episode_id" IS NULL
                  AND "content_root_grant_episode_ordinal" IS NULL
                  AND "content_root_grant_version" IS NULL
                  AND length("workspace_identity") > 0
                  AND "operation_identity" IS NULL
                  AND "operation_approval_basis" IS NULL)
                OR ("authority_kind" = 'one_operation'
                  AND "content_root_id" IS NULL
                  AND "content_root_binding_id" IS NULL
                  AND "content_root_binding_episode_id" IS NULL
                  AND "content_root_binding_episode_ordinal" IS NULL
                  AND "content_root_grant_episode_id" IS NULL
                  AND "content_root_grant_episode_ordinal" IS NULL
                  AND "content_root_grant_version" IS NULL
                  AND "workspace_identity" IS NULL
                  AND length("operation_identity") > 0
                  AND length("operation_approval_basis") > 0)),
          CONSTRAINT "material_map_artifact_target_content" CHECK("fingerprint_algorithm" = 'sha256' AND length("fingerprint_digest") = 64 AND "fingerprint_digest" NOT GLOB '*[^0-9a-f]*' AND "byte_length" > 0 AND length("media_type") > 0),
          CONSTRAINT "material_map_artifact_target_source" CHECK(length("active_location") > 0 AND length("normalized_relative_path") > 0
                AND "root_object_platform" = 'windows_ntfs' AND "root_object_verifier_version" >= 1
                AND length("root_object_canonical_path") > 0 AND length("root_object_canonical_path_key") > 0
                AND length("root_object_volume_serial") > 0 AND length("root_object_id") = 32
                AND length("root_object_creation_time") > 0 AND length("root_object_change_time") > 0
                AND (("root_object_descriptor_state" = 'exact_v1'
                    AND length("root_object_last_write_time") > 0 AND "root_object_size" >= 0)
                  OR ("root_object_descriptor_state" = 'historical_v16_partial'
                    AND "authority_kind" = 'content_root'
                    AND "root_object_last_write_time" IS NULL AND "root_object_size" IS NULL))
                AND "source_object_platform" = 'windows_ntfs' AND "source_object_verifier_version" >= 1
                AND length("source_object_canonical_path") > 0 AND length("source_object_canonical_path_key") > 0
                AND "source_object_canonical_path" = "active_location"
                AND length("source_object_volume_serial") > 0 AND length("source_object_id") = 32
                AND length("source_object_creation_time") > 0 AND length("source_object_change_time") > 0
                AND length("source_object_last_write_time") > 0 AND "source_object_size" = "byte_length"
                AND "source_observed_time" >= 0)
        );
      `)
      // Gate 16 Map rows contain the exact ContentRoot binding identity but predate the
      // duplicated root-object projection. Rebuild only the fields persisted by that frozen
      // binding row and preserve last-write time and size as explicit historical unknowns.
      yield* tx.run(`
        INSERT INTO \`__new_material_map_artifact_target\`(
          \`map_id\`, \`artifact_id\`, \`artifact_revision_id\`, \`attribution_type\`,
          \`attribution_member_id\`, \`disposition_version\`, \`lineage_version\`,
          \`source_version\`, \`artifact_binding_id\`, \`active_location\`,
          \`descriptor_observation_id\`, \`descriptor_correction_id\`,
          \`fingerprint_algorithm\`, \`fingerprint_digest\`, \`byte_length\`, \`media_type\`,
          \`content_root_id\`, \`content_root_binding_id\`, \`content_root_binding_episode_id\`,
          \`content_root_binding_episode_ordinal\`, \`content_root_grant_episode_id\`,
          \`content_root_grant_episode_ordinal\`, \`content_root_grant_version\`,
          \`normalized_relative_path\`, \`root_object_descriptor_state\`, \`root_object_platform\`,
          \`root_object_verifier_version\`, \`root_object_canonical_path\`,
          \`root_object_canonical_path_key\`, \`root_object_volume_serial\`, \`root_object_id\`,
          \`root_object_creation_time\`, \`root_object_change_time\`,
          \`root_object_last_write_time\`, \`root_object_size\`, \`source_object_platform\`,
          \`source_object_verifier_version\`, \`source_object_canonical_path\`,
          \`source_object_canonical_path_key\`, \`source_object_volume_serial\`,
          \`source_object_id\`, \`source_object_creation_time\`, \`source_object_change_time\`,
          \`source_object_last_write_time\`, \`source_object_size\`, \`source_observed_time\`
        )
        SELECT
          target.\`map_id\`, target.\`artifact_id\`, target.\`artifact_revision_id\`,
          target.\`attribution_type\`, target.\`attribution_member_id\`,
          target.\`disposition_version\`, target.\`lineage_version\`, target.\`source_version\`,
          target.\`artifact_binding_id\`, target.\`active_location\`,
          target.\`descriptor_observation_id\`, target.\`descriptor_correction_id\`,
          target.\`fingerprint_algorithm\`, target.\`fingerprint_digest\`,
          target.\`byte_length\`, target.\`media_type\`, target.\`content_root_id\`,
          target.\`content_root_binding_id\`, target.\`content_root_binding_episode_id\`,
          target.\`content_root_binding_episode_ordinal\`, target.\`content_root_grant_episode_id\`,
          target.\`content_root_grant_episode_ordinal\`, target.\`content_root_grant_version\`,
          target.\`normalized_relative_path\`, 'historical_v16_partial', binding.\`platform\`, binding.\`verifier_version\`,
          binding.\`canonical_path\`, binding.\`canonical_path_key\`, binding.\`volume_serial\`,
          binding.\`object_id\`, binding.\`creation_time\`, binding.\`initial_change_time\`,
          NULL, NULL, target.\`source_object_platform\`,
          target.\`source_object_verifier_version\`, target.\`source_object_canonical_path\`,
          target.\`source_object_canonical_path_key\`, target.\`source_object_volume_serial\`,
          target.\`source_object_id\`, target.\`source_object_creation_time\`,
          target.\`source_object_change_time\`, target.\`source_object_last_write_time\`,
          target.\`source_object_size\`, target.\`source_observed_time\`
        FROM \`material_map_artifact_target\` AS target
        JOIN \`content_root_binding\` AS binding
          ON binding.\`content_root_id\` = target.\`content_root_id\`
         AND binding.\`id\` = target.\`content_root_binding_id\`;
      `)
      // This trigger is owned by material_map, so dropping the target table would
      // leave an invalid schema reference during SQLite's rename validation. The
      // versioned V17 extras reinstall the exact trigger after the graph rebuild.
      yield* tx.run(`DROP TRIGGER IF EXISTS \`material_map_validate_insert\`;`)
      yield* tx.run(`DROP TABLE \`material_map_artifact_target\`;`)
      yield* tx.run(`ALTER TABLE \`__new_material_map_artifact_target\` RENAME TO \`material_map_artifact_target\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE INDEX \`material_map_artifact_target_idx\` ON \`material_map_artifact_target\` (\`artifact_id\`,\`artifact_revision_id\`,\`attribution_type\`,\`attribution_member_id\`,\`map_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_course_material_course_idx\` ON \`learning_course_material_adoption\` (\`course_id\`,\`time_created\`,\`id\`);`,
      )
      yield* installSchemaExtrasV17(tx)
    })
  },
} satisfies DatabaseMigration.Migration
