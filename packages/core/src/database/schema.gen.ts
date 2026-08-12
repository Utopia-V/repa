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
          \`source_order\` integer UNIQUE,
          \`source_temporal_state\` text,
          \`source_timezone\` text,
          \`source_utc_offset_minutes\` integer,
          \`source_temporal_unavailable_reason\` text,
          CONSTRAINT \`fk_learning_admitted_occurrence_source_order_learning_occurrence_source_order_sequence_fk\` FOREIGN KEY (\`source_order\`) REFERENCES \`learning_occurrence_source_order\`(\`sequence\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_admitted_occurrence_origin_unique\` UNIQUE(\`origin_session_id\`,\`origin_message_id\`),
          CONSTRAINT "learning_admitted_occurrence_time_nonnegative" CHECK("time_admitted" >= 0),
          CONSTRAINT "learning_admitted_occurrence_source_temporal_shape" CHECK(COALESCE(("source_order" IS NULL AND "source_temporal_state" IS NULL AND "source_timezone" IS NULL AND "source_utc_offset_minutes" IS NULL AND "source_temporal_unavailable_reason" IS NULL) OR ("source_order" IS NOT NULL AND "source_order" > 0 AND (("source_temporal_state" = 'resolved' AND "source_timezone" IS NOT NULL AND length("source_timezone") > 0 AND "source_utc_offset_minutes" IS NOT NULL AND "source_utc_offset_minutes" BETWEEN -840 AND 840 AND "source_temporal_unavailable_reason" IS NULL) OR ("source_temporal_state" = 'unavailable' AND "source_timezone" IS NULL AND "source_utc_offset_minutes" IS NULL AND "source_temporal_unavailable_reason" = 'timezone_unavailable'))), 0))
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
        CREATE TABLE \`learning_occurrence_source_order\` (
          \`sequence\` integer PRIMARY KEY AUTOINCREMENT,
          \`occurrence_id\` text NOT NULL UNIQUE,
          \`origin_session_id\` text NOT NULL,
          \`origin_message_id\` text NOT NULL,
          \`time_allocated\` integer NOT NULL,
          \`source_temporal_state\` text NOT NULL,
          \`source_timezone\` text,
          \`source_utc_offset_minutes\` integer,
          \`source_temporal_unavailable_reason\` text,
          CONSTRAINT \`learning_occurrence_source_order_origin_unique\` UNIQUE(\`origin_session_id\`,\`origin_message_id\`),
          CONSTRAINT "learning_occurrence_source_order_positive" CHECK("sequence" > 0),
          CONSTRAINT "learning_occurrence_source_order_time_nonnegative" CHECK("time_allocated" >= 0),
          CONSTRAINT "learning_occurrence_source_order_temporal_shape" CHECK(COALESCE(("source_temporal_state" = 'resolved' AND "source_timezone" IS NOT NULL AND length("source_timezone") > 0 AND "source_utc_offset_minutes" IS NOT NULL AND "source_utc_offset_minutes" BETWEEN -840 AND 840 AND "source_temporal_unavailable_reason" IS NULL) OR ("source_temporal_state" = 'unavailable' AND "source_timezone" IS NULL AND "source_utc_offset_minutes" IS NULL AND "source_temporal_unavailable_reason" = 'timezone_unavailable'), 0))
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
        CREATE TABLE \`learning_shared_frontier\` (
          \`singleton\` integer PRIMARY KEY DEFAULT 1,
          \`sequence\` integer DEFAULT 0 NOT NULL,
          \`time_committed\` integer DEFAULT 0 NOT NULL,
          CONSTRAINT "learning_shared_frontier_singleton" CHECK("singleton" = 1),
          CONSTRAINT "learning_shared_frontier_nonnegative" CHECK("sequence" >= 0 AND "time_committed" >= 0)
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
        CREATE TABLE \`advisory_plan_suggestion_anchor\` (
          \`revision_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`key_type\` text NOT NULL,
          \`stable_key_fingerprint\` text NOT NULL,
          \`exact_ref_type\` text NOT NULL,
          \`exact_ref_fingerprint\` text NOT NULL,
          \`binding\` text NOT NULL,
          \`first_bound_revision_id\` text NOT NULL,
          CONSTRAINT \`advisory_plan_suggestion_anchor_pk\` PRIMARY KEY(\`revision_id\`, \`ordinal\`),
          CONSTRAINT \`fk_advisory_plan_suggestion_anchor_revision_id_advisory_plan_suggestion_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`advisory_plan_suggestion_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_anchor_first_bound_revision_id_advisory_plan_suggestion_revision_id_fk\` FOREIGN KEY (\`first_bound_revision_id\`) REFERENCES \`advisory_plan_suggestion_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`advisory_plan_suggestion_anchor_unique_key\` UNIQUE(\`revision_id\`,\`stable_key_fingerprint\`),
          CONSTRAINT "advisory_plan_suggestion_anchor_shape" CHECK("ordinal" BETWEEN 0 AND 7
                AND length("stable_key_fingerprint") = 64
                AND "stable_key_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("exact_ref_fingerprint") = 64
                AND "exact_ref_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND json_valid("binding"))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`advisory_plan_suggestion_basis\` (
          \`revision_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`ref_type\` text NOT NULL,
          \`ref_fingerprint\` text NOT NULL,
          \`binding\` text NOT NULL,
          \`first_bound_revision_id\` text NOT NULL,
          CONSTRAINT \`advisory_plan_suggestion_basis_pk\` PRIMARY KEY(\`revision_id\`, \`ordinal\`),
          CONSTRAINT \`fk_advisory_plan_suggestion_basis_revision_id_advisory_plan_suggestion_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`advisory_plan_suggestion_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_basis_first_bound_revision_id_advisory_plan_suggestion_revision_id_fk\` FOREIGN KEY (\`first_bound_revision_id\`) REFERENCES \`advisory_plan_suggestion_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`advisory_plan_suggestion_basis_unique_ref\` UNIQUE(\`revision_id\`,\`ref_fingerprint\`),
          CONSTRAINT "advisory_plan_suggestion_basis_shape" CHECK("ordinal" BETWEEN 0 AND 15 AND length("ref_fingerprint") = 64
                AND "ref_fingerprint" NOT GLOB '*[^0-9a-f]*' AND json_valid("binding"))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`advisory_plan_suggestion_capability_issue\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_advisory_plan_suggestion_capability_issue_invocation_part_id_advisory_plan_suggestion_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`advisory_plan_suggestion_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`advisory_plan_suggestion_capability_issue_exact\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "advisory_plan_suggestion_capability_issue_shape" CHECK(length("agent_action_fingerprint") = 64
                AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("policy_fingerprint") = 64
                AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("shown_scope_fingerprint") = 64
                AND "shown_scope_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND json_valid("policy_basis")
                AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`advisory_plan_suggestion_capability_settlement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`agent_action_fingerprint\` text NOT NULL,
          \`basis\` text,
          \`basis_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_advisory_plan_suggestion_capability_settlement_invocation_part_id_advisory_plan_suggestion_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`advisory_plan_suggestion_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_advisory_plan_suggestion_capability_settlement_invocation_part_id_permission_request_id_advisory_plan_suggestion_capability_issue_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`advisory_plan_suggestion_capability_issue\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE CASCADE,
          CONSTRAINT "advisory_plan_suggestion_capability_settlement_shape" CHECK(length("agent_action_fingerprint") = 64
                AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("basis_fingerprint" IS NULL OR (length("basis_fingerprint") = 64
                  AND "basis_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND "time_settled" >= 0 AND "settlement_order" >= 0
                AND (("outcome" = 'not_evaluated' AND "permission_request_id" IS NULL
                    AND "basis" IS NULL AND "basis_fingerprint" IS NULL)
                  OR ("outcome" IN ('policy_allow', 'policy_deny') AND "permission_request_id" IS NULL
                    AND json_valid("basis") AND "basis_fingerprint" IS NOT NULL)
                  OR ("outcome" = 'prompted_abort' AND "permission_request_id" IS NOT NULL
                    AND "basis" IS NULL AND "basis_fingerprint" IS NULL)
                  OR ("outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
                    AND "permission_request_id" IS NOT NULL AND json_valid("basis")
                    AND "basis_fingerprint" IS NOT NULL)))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`advisory_plan_suggestion_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`receipt_id\` text NOT NULL UNIQUE,
          \`time_sealed\` integer NOT NULL,
          \`seal_order\` integer NOT NULL,
          CONSTRAINT \`fk_advisory_plan_suggestion_commit_seal_effect_id_advisory_plan_suggestion_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`advisory_plan_suggestion_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "advisory_plan_suggestion_commit_seal_shape" CHECK("time_sealed" >= 0 AND "seal_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`advisory_plan_suggestion_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`semantic_address_fingerprint\` text NOT NULL,
          \`semantic_outcome\` text,
          \`existing_effect_id\` text,
          \`existing_no_change_part_id\` text,
          \`agent_action_fingerprint\` text,
          \`agent_action\` text,
          \`materialized_candidate\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_advisory_plan_suggestion_disposition_existing_effect_id_advisory_plan_suggestion_effect_id_fk\` FOREIGN KEY (\`existing_effect_id\`) REFERENCES \`advisory_plan_suggestion_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_disposition_existing_no_change_part_id_advisory_plan_suggestion_no_change_seal_invocation_part_id_fk\` FOREIGN KEY (\`existing_no_change_part_id\`) REFERENCES \`advisory_plan_suggestion_no_change_seal\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_disposition_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "advisory_plan_suggestion_disposition_fingerprints" CHECK(length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("agent_action_fingerprint" IS NULL OR (length("agent_action_fingerprint") = 64
                  AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "advisory_plan_suggestion_disposition_closed" CHECK(("disposition" = 'candidate_v1' AND "semantic_outcome" IS NULL
                  AND "existing_effect_id" IS NULL AND "existing_no_change_part_id" IS NULL
                  AND "agent_action_fingerprint" IS NOT NULL
                  AND json_valid("agent_action") AND json_valid("materialized_candidate"))
                OR ("disposition" = 'semantic_terminal_v1'
                  AND "semantic_outcome" IN ('same_effect', 'same_no_change', 'semantic_conflict')
                  AND (("semantic_outcome" = 'same_effect'
                        AND "existing_effect_id" IS NOT NULL AND "existing_no_change_part_id" IS NULL)
                    OR ("semantic_outcome" = 'same_no_change'
                        AND "existing_effect_id" IS NULL AND "existing_no_change_part_id" IS NOT NULL)
                    OR ("semantic_outcome" = 'semantic_conflict'
                        AND (("existing_effect_id" IS NOT NULL AND "existing_no_change_part_id" IS NULL)
                          OR ("existing_effect_id" IS NULL AND "existing_no_change_part_id" IS NOT NULL))))
                  AND "agent_action_fingerprint" IS NULL AND "agent_action" IS NULL
                  AND "materialized_candidate" IS NULL)),
          CONSTRAINT "advisory_plan_suggestion_disposition_shape" CHECK(json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND "time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`advisory_plan_suggestion_effect\` (
          \`id\` text PRIMARY KEY,
          \`cause_type\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`model_operation_id\` text NOT NULL,
          \`semantic_slot\` text NOT NULL,
          \`semantic_address_fingerprint\` text NOT NULL UNIQUE,
          \`canonical_command\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`physical_receipt_id\` text NOT NULL UNIQUE,
          \`admission_projection\` text NOT NULL,
          \`result\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL UNIQUE,
          \`frontier_time\` integer NOT NULL,
          \`acknowledgement_title\` text NOT NULL,
          \`acknowledgement_body\` text NOT NULL,
          CONSTRAINT \`fk_advisory_plan_suggestion_effect_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_effect_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_effect_physical_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`physical_receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "advisory_plan_suggestion_effect_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'ape_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "advisory_plan_suggestion_effect_address" CHECK("cause_type" IN (
                  'responsive_tutor_proposal', 'proactive_tutor_proposal', 'learner_revision', 'tutor_revision'
                )
                AND "semantic_slot" = 'suggestion_change_set'
                AND length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("command_fingerprint") = 64
                AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "advisory_plan_suggestion_effect_shape" CHECK(json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND json_valid("admission_projection") AND json_valid("result")
                AND "time_committed" >= 0 AND "commit_order" >= 0
                AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed"
                AND length("acknowledgement_title") > 0 AND length("acknowledgement_body") > 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`advisory_plan_suggestion_no_change_seal\` (
          \`semantic_address_fingerprint\` text PRIMARY KEY,
          \`cause_type\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`model_operation_id\` text NOT NULL,
          \`semantic_slot\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`invocation_status\` text NOT NULL,
          \`receipt_id\` text NOT NULL UNIQUE,
          \`materialized_candidate\` text NOT NULL,
          \`result\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_advisory_plan_suggestion_no_change_seal_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_no_change_seal_invocation_part_id_invocation_status_learning_command_invocation_part_id_status_fk\` FOREIGN KEY (\`invocation_part_id\`,\`invocation_status\`) REFERENCES \`learning_command_invocation\`(\`part_id\`,\`status\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_no_change_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "advisory_plan_suggestion_no_change_address" CHECK("cause_type" IN (
                  'responsive_tutor_proposal', 'proactive_tutor_proposal', 'learner_revision', 'tutor_revision'
                )
                AND "semantic_slot" = 'suggestion_change_set'
                AND length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("command_fingerprint") = 64
                AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "advisory_plan_suggestion_no_change_shape" CHECK("invocation_status" = 'no_change'
                AND json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND json_valid("materialized_candidate") AND json_valid("result")
                AND "time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`advisory_plan_suggestion_revision\` (
          \`id\` text PRIMARY KEY,
          \`suggestion_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`predecessor_revision_id\` text,
          \`effect_id\` text NOT NULL,
          \`operation\` text NOT NULL,
          \`operation_ordinal\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`snapshot\` text NOT NULL,
          \`learner_visible_scope\` text NOT NULL,
          \`retrieval_scope_type\` text NOT NULL,
          \`retrieval_fallback_reason\` text,
          \`retrieval_anchor_count\` integer NOT NULL,
          \`purpose\` text NOT NULL,
          \`directory_summary\` text NOT NULL,
          \`body\` text NOT NULL,
          \`assumptions_and_uncertainty\` text,
          \`basis_count\` integer NOT NULL,
          \`alternative_target_suggestion_id\` text,
          \`alternative_target_revision_id\` text,
          \`alternative_target_version\` integer,
          \`author_class\` text NOT NULL,
          \`author_and_cause\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL,
          CONSTRAINT \`fk_advisory_plan_suggestion_revision_suggestion_id_advisory_plan_suggestion_id_fk\` FOREIGN KEY (\`suggestion_id\`) REFERENCES \`advisory_plan_suggestion\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_revision_predecessor_revision_id_advisory_plan_suggestion_revision_id_fk\` FOREIGN KEY (\`predecessor_revision_id\`) REFERENCES \`advisory_plan_suggestion_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_revision_effect_id_advisory_plan_suggestion_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`advisory_plan_suggestion_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_advisory_plan_suggestion_revision_alternative_target_revision_id_advisory_plan_suggestion_revision_id_fk\` FOREIGN KEY (\`alternative_target_revision_id\`) REFERENCES \`advisory_plan_suggestion_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`advisory_plan_suggestion_revision_version\` UNIQUE(\`suggestion_id\`,\`version\`),
          CONSTRAINT \`advisory_plan_suggestion_revision_effect_ordinal\` UNIQUE(\`effect_id\`,\`operation_ordinal\`),
          CONSTRAINT "advisory_plan_suggestion_revision_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'apr_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'
                AND "version" >= 1 AND "frontier_sequence" >= 1),
          CONSTRAINT "advisory_plan_suggestion_revision_lineage" CHECK(("version" = 1 AND "predecessor_revision_id" IS NULL
                  AND "operation" IN ('create', 'alternative'))
                OR ("version" > 1 AND "predecessor_revision_id" IS NOT NULL
                  AND "operation" IN ('revise', 'retire', 'restore'))),
          CONSTRAINT "advisory_plan_suggestion_revision_shape" CHECK(json_valid("snapshot") AND json_valid("author_and_cause")
                AND "operation" IN ('create', 'alternative', 'revise', 'retire', 'restore')
                AND "operation_ordinal" BETWEEN 0 AND 7
                AND "disposition" IN ('active', 'retired')
                AND "retrieval_scope_type" IN ('anchored', 'learner_home_fallback')
                AND (("retrieval_scope_type" = 'anchored' AND "retrieval_fallback_reason" IS NULL
                      AND "retrieval_anchor_count" BETWEEN 1 AND 8)
                  OR ("retrieval_scope_type" = 'learner_home_fallback'
                      AND "retrieval_fallback_reason" IN ('no_stable_owner_anchor', 'deliberately_cross_cutting')
                      AND "retrieval_anchor_count" = 0))
                AND "basis_count" BETWEEN 0 AND 16
                AND length(CAST("learner_visible_scope" AS BLOB)) BETWEEN 1 AND 384
                AND length(CAST("purpose" AS BLOB)) BETWEEN 1 AND 384
                AND length(CAST("directory_summary" AS BLOB)) BETWEEN 1 AND 512
                AND length(CAST("body" AS BLOB)) BETWEEN 1 AND 8192
                AND ("assumptions_and_uncertainty" IS NULL
                  OR length(CAST("assumptions_and_uncertainty" AS BLOB)) BETWEEN 1 AND 2048)
                AND (("alternative_target_suggestion_id" IS NULL
                    AND "alternative_target_revision_id" IS NULL AND "alternative_target_version" IS NULL)
                  OR ("alternative_target_suggestion_id" IS NOT NULL
                    AND "alternative_target_revision_id" IS NOT NULL AND "alternative_target_version" >= 1
                    AND "alternative_target_suggestion_id" <> "suggestion_id"
                    AND length("alternative_target_suggestion_id") = 30
                    AND substr("alternative_target_suggestion_id", 1, 4) = 'aps_'
                    AND substr("alternative_target_suggestion_id", 5) NOT GLOB '*[^0-9A-Za-z]*'
                    AND length("alternative_target_revision_id") = 30
                    AND substr("alternative_target_revision_id", 1, 4) = 'apr_'
                    AND substr("alternative_target_revision_id", 5) NOT GLOB '*[^0-9A-Za-z]*'))
                AND "time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`advisory_plan_suggestion\` (
          \`id\` text PRIMARY KEY,
          \`time_created\` integer NOT NULL,
          \`alternative_target_suggestion_id\` text,
          \`alternative_target_revision_id\` text,
          \`alternative_target_version\` integer,
          CONSTRAINT "advisory_plan_suggestion_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'aps_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*' AND "time_created" >= 0
                AND (("alternative_target_suggestion_id" IS NULL
                    AND "alternative_target_revision_id" IS NULL AND "alternative_target_version" IS NULL)
                  OR ("alternative_target_suggestion_id" IS NOT NULL
                    AND "alternative_target_revision_id" IS NOT NULL AND "alternative_target_version" >= 1
                    AND "alternative_target_suggestion_id" <> "id"
                    AND length("alternative_target_suggestion_id") = 30
                    AND substr("alternative_target_suggestion_id", 1, 4) = 'aps_'
                    AND substr("alternative_target_suggestion_id", 5) NOT GLOB '*[^0-9A-Za-z]*'
                    AND length("alternative_target_revision_id") = 30
                    AND substr("alternative_target_revision_id", 1, 4) = 'apr_'
                    AND substr("alternative_target_revision_id", 5) NOT GLOB '*[^0-9A-Za-z]*')))
        ) WITHOUT ROWID;
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
        CREATE TABLE \`assignment_capability_issue\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_assignment_capability_issue_invocation_part_id_assignment_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`assignment_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`assignment_capability_issue_exact\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "assignment_capability_issue_shape" CHECK(length("agent_action_fingerprint") = 64 AND length("policy_fingerprint") = 64
                AND length("shown_scope_fingerprint") = 64 AND json_valid("policy_basis")
                AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`assignment_capability_settlement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`agent_action_fingerprint\` text NOT NULL,
          \`basis\` text,
          \`basis_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_assignment_capability_settlement_invocation_part_id_assignment_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`assignment_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_assignment_capability_settlement_invocation_part_id_permission_request_id_assignment_capability_issue_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`assignment_capability_issue\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE CASCADE,
          CONSTRAINT "assignment_capability_settlement_shape" CHECK(length("agent_action_fingerprint") = 64
                AND ("basis_fingerprint" IS NULL OR length("basis_fingerprint") = 64)
                AND "time_settled" >= 0 AND "settlement_order" >= 0
                AND (("outcome" = 'not_evaluated' AND "permission_request_id" IS NULL AND "basis" IS NULL)
                  OR ("outcome" IN ('policy_allow', 'policy_deny') AND "permission_request_id" IS NULL
                    AND json_valid("basis"))
                  OR ("outcome" = 'prompted_abort' AND "permission_request_id" IS NOT NULL
                    AND "basis" IS NULL)
                  OR ("outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
                    AND "permission_request_id" IS NOT NULL AND json_valid("basis"))))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`assignment_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL UNIQUE,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          CONSTRAINT \`fk_assignment_commit_seal_effect_id_assignment_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`assignment_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`assignment_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`semantic_address_fingerprint\` text NOT NULL,
          \`semantic_outcome\` text,
          \`existing_effect_id\` text,
          \`existing_no_change_receipt_id\` text,
          \`agent_action_fingerprint\` text,
          \`agent_action\` text,
          \`materialized_candidate\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_assignment_disposition_existing_effect_id_assignment_effect_id_fk\` FOREIGN KEY (\`existing_effect_id\`) REFERENCES \`assignment_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_disposition_existing_no_change_receipt_id_assignment_no_change_seal_receipt_id_fk\` FOREIGN KEY (\`existing_no_change_receipt_id\`) REFERENCES \`assignment_no_change_seal\`(\`receipt_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_disposition_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "assignment_disposition_fingerprints" CHECK(length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("agent_action_fingerprint" IS NULL OR (length("agent_action_fingerprint") = 64
                  AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "assignment_disposition_closed" CHECK(("disposition" = 'candidate_v1' AND "semantic_outcome" IS NULL
                  AND "existing_effect_id" IS NULL AND "existing_no_change_receipt_id" IS NULL
                  AND "agent_action_fingerprint" IS NOT NULL
                  AND json_valid("agent_action") AND json_valid("materialized_candidate"))
                OR ("disposition" = 'semantic_terminal_v1'
                  AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                  AND (("existing_effect_id" IS NOT NULL AND "existing_no_change_receipt_id" IS NULL)
                    OR ("existing_effect_id" IS NULL AND "existing_no_change_receipt_id" IS NOT NULL))
                  AND "agent_action_fingerprint" IS NULL
                  AND "agent_action" IS NULL AND "materialized_candidate" IS NULL)),
          CONSTRAINT "assignment_disposition_shape" CHECK(json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND "time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`assignment_effect\` (
          \`id\` text PRIMARY KEY,
          \`commit_seal_id\` text NOT NULL,
          \`cause_type\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`source_revision_id\` text,
          \`source_locator_digest\` text,
          \`model_operation_id\` text NOT NULL,
          \`semantic_slot\` text NOT NULL,
          \`semantic_address_fingerprint\` text NOT NULL UNIQUE,
          \`canonical_command\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`physical_receipt_id\` text NOT NULL UNIQUE,
          \`admission_projection\` text NOT NULL,
          \`results\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL UNIQUE,
          \`frontier_time\` integer NOT NULL,
          \`acknowledgement_title\` text NOT NULL,
          \`acknowledgement_body\` text NOT NULL,
          CONSTRAINT \`fk_assignment_effect_commit_seal_id_assignment_commit_seal_effect_id_fk\` FOREIGN KEY (\`commit_seal_id\`) REFERENCES \`assignment_commit_seal\`(\`effect_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_effect_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_effect_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_effect_physical_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`physical_receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "assignment_effect_seal" CHECK("commit_seal_id" = "id"),
          CONSTRAINT "assignment_effect_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'ase_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "assignment_effect_address" CHECK(length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND (("cause_type" IN ('interpreted_learner_report', 'interpreted_learner_direction')
                      AND "semantic_slot" = 'assignment_change_set' AND "source_revision_id" IS NULL
                      AND "source_locator_digest" IS NULL)
                  OR ("cause_type" IN ('interpreted_source_observation', 'interpreted_source_change')
                      AND "semantic_slot" = 'assignment_source_change_set' AND length("source_revision_id") > 0
                      AND length("source_locator_digest") = 64)
                  OR ("cause_type" = 'agent_correction'
                      AND "semantic_slot" = 'assignment_correction_change_set' AND "source_revision_id" IS NULL
                      AND "source_locator_digest" IS NULL))),
          CONSTRAINT "assignment_effect_shape" CHECK(json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND json_valid("admission_projection") AND json_valid("results")
                AND json_type("results") = 'array' AND json_array_length("results") BETWEEN 1 AND 16
                AND "time_committed" >= 0 AND "commit_order" >= 0
                AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed"
                AND length("acknowledgement_title") > 0 AND length("acknowledgement_body") > 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`assignment_no_change_seal\` (
          \`semantic_address_fingerprint\` text PRIMARY KEY,
          \`cause_type\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`source_revision_id\` text,
          \`source_locator_digest\` text,
          \`model_operation_id\` text NOT NULL,
          \`semantic_slot\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`invocation_status\` text NOT NULL,
          \`receipt_id\` text NOT NULL UNIQUE,
          \`results\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_assignment_no_change_seal_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_no_change_seal_invocation_part_id_invocation_status_learning_command_invocation_part_id_status_fk\` FOREIGN KEY (\`invocation_part_id\`,\`invocation_status\`) REFERENCES \`learning_command_invocation\`(\`part_id\`,\`status\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_no_change_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "assignment_no_change_address" CHECK(length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND (("cause_type" IN ('interpreted_learner_report', 'interpreted_learner_direction')
                      AND "semantic_slot" = 'assignment_change_set' AND "source_revision_id" IS NULL
                      AND "source_locator_digest" IS NULL)
                  OR ("cause_type" IN ('interpreted_source_observation', 'interpreted_source_change')
                      AND "semantic_slot" = 'assignment_source_change_set' AND length("source_revision_id") > 0
                      AND length("source_locator_digest") = 64)
                  OR ("cause_type" = 'agent_correction'
                      AND "semantic_slot" = 'assignment_correction_change_set' AND "source_revision_id" IS NULL
                      AND "source_locator_digest" IS NULL))),
          CONSTRAINT "assignment_no_change_shape" CHECK("invocation_status" = 'no_change'
                AND json_valid("canonical_command")
                AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND json_valid("results") AND json_type("results") = 'array'
                AND json_array_length("results") BETWEEN 1 AND 16
                AND "time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`assignment_revision_scope\` (
          \`revision_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`course_id\` text NOT NULL,
          CONSTRAINT \`assignment_revision_scope_pk\` PRIMARY KEY(\`revision_id\`, \`ordinal\`),
          CONSTRAINT \`fk_assignment_revision_scope_revision_id_assignment_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`assignment_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_revision_scope_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`assignment_revision_scope_course_unique\` UNIQUE(\`revision_id\`,\`course_id\`),
          CONSTRAINT "assignment_revision_scope_ordinal" CHECK("ordinal" BETWEEN 0 AND 7)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`assignment_revision\` (
          \`id\` text PRIMARY KEY,
          \`assignment_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`predecessor_revision_id\` text CONSTRAINT \`assignment_revision_predecessor_unique\` UNIQUE,
          \`effect_id\` text NOT NULL,
          \`operation_ordinal\` integer NOT NULL,
          \`operation\` text NOT NULL,
          \`snapshot\` text NOT NULL,
          \`obligation_summary\` text NOT NULL,
          \`learning_context\` text NOT NULL,
          \`scope_type\` text NOT NULL,
          \`scope_count\` integer NOT NULL,
          \`due_basis\` text NOT NULL,
          \`expiry_boundary\` text,
          \`disposition\` text NOT NULL,
          \`creation_source_basis\` text NOT NULL,
          \`effective_source_basis\` text NOT NULL,
          \`source_admission_basis\` text NOT NULL,
          \`mutation_authorship_basis\` text NOT NULL,
          \`source_basis_relation\` text NOT NULL,
          \`effective_source_type\` text NOT NULL,
          \`effective_occurrence_id\` text,
          \`effective_artifact_revision_id\` text,
          \`effective_representation_revision_id\` text,
          \`supersession_target_assignment_id\` text,
          \`supersession_target_revision_id\` text,
          \`supersession_target_version\` integer,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL,
          CONSTRAINT \`fk_assignment_revision_assignment_id_assignment_id_fk\` FOREIGN KEY (\`assignment_id\`) REFERENCES \`assignment\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_revision_predecessor_revision_id_assignment_revision_id_fk\` FOREIGN KEY (\`predecessor_revision_id\`) REFERENCES \`assignment_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_revision_effect_id_assignment_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`assignment_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_revision_effective_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`effective_occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_revision_effective_artifact_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`effective_artifact_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_revision_effective_representation_revision_id_representation_revision_id_fk\` FOREIGN KEY (\`effective_representation_revision_id\`) REFERENCES \`representation_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_revision_supersession_target_assignment_id_supersession_target_revision_id_supersession_target_version_assignment_revision_assignment_id_id_version_fk\` FOREIGN KEY (\`supersession_target_assignment_id\`,\`supersession_target_revision_id\`,\`supersession_target_version\`) REFERENCES \`assignment_revision\`(\`assignment_id\`,\`id\`,\`version\`) ON DELETE RESTRICT,
          CONSTRAINT \`assignment_revision_identity_version_unique\` UNIQUE(\`assignment_id\`,\`id\`,\`version\`),
          CONSTRAINT \`assignment_revision_version_unique\` UNIQUE(\`assignment_id\`,\`version\`),
          CONSTRAINT \`assignment_revision_effect_ordinal_unique\` UNIQUE(\`effect_id\`,\`operation_ordinal\`),
          CONSTRAINT "assignment_revision_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'asr_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'
                AND (("version" = 1 AND "predecessor_revision_id" IS NULL)
                  OR ("version" > 1 AND "predecessor_revision_id" IS NOT NULL))),
          CONSTRAINT "assignment_revision_snapshot" CHECK(json_valid("snapshot") AND json_valid("due_basis")
                AND ("expiry_boundary" IS NULL OR json_valid("expiry_boundary"))
                AND length(CAST("obligation_summary" AS BLOB)) BETWEEN 1 AND 640
                AND length(CAST("learning_context" AS BLOB)) BETWEEN 1 AND 384
                AND "scope_type" IN ('learner_home', 'courses')
                AND (("scope_type" = 'learner_home' AND "scope_count" = 0)
                  OR ("scope_type" = 'courses' AND "scope_count" BETWEEN 1 AND 8))),
          CONSTRAINT "assignment_revision_vocabulary" CHECK("operation" IN ('create', 'revise', 'correct', 'complete', 'cancel', 'dismiss', 'reopen', 'replace')
                AND "disposition" IN ('open', 'completed', 'cancelled', 'dismissed', 'superseded')
                AND "source_basis_relation" IN ('carried', 'corrected_with_new_exact_source')
                AND json_valid("creation_source_basis") AND json_valid("effective_source_basis")
                AND json_valid("source_admission_basis") AND json_valid("mutation_authorship_basis")),
          CONSTRAINT "assignment_revision_source_arm" CHECK(("effective_source_type" = 'learner_occurrence' AND "effective_occurrence_id" IS NOT NULL
                  AND "effective_artifact_revision_id" IS NULL AND "effective_representation_revision_id" IS NULL)
                OR ("effective_source_type" = 'artifact_revision' AND "effective_occurrence_id" IS NULL
                  AND "effective_artifact_revision_id" IS NOT NULL AND "effective_representation_revision_id" IS NULL)
                OR ("effective_source_type" = 'representation_revision' AND "effective_occurrence_id" IS NULL
                  AND "effective_artifact_revision_id" IS NULL AND "effective_representation_revision_id" IS NOT NULL)),
          CONSTRAINT "assignment_revision_relation" CHECK(("disposition" = 'superseded' AND "supersession_target_assignment_id" IS NOT NULL
                  AND "supersession_target_revision_id" IS NOT NULL AND "supersession_target_version" >= 1
                  AND "supersession_target_assignment_id" <> "assignment_id")
                OR ("disposition" <> 'superseded' AND "supersession_target_assignment_id" IS NULL
                  AND "supersession_target_revision_id" IS NULL AND "supersession_target_version" IS NULL)),
          CONSTRAINT "assignment_revision_time" CHECK("operation_ordinal" BETWEEN 0 AND 31 AND "time_committed" >= 0
                AND "commit_order" >= 0 AND "frontier_sequence" >= 1)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`assignment\` (
          \`id\` text PRIMARY KEY,
          \`time_created\` integer NOT NULL,
          CONSTRAINT "assignment_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'asn_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*' AND "time_created" >= 0)
        ) WITHOUT ROWID;
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
          CONSTRAINT \`content_root_binding_episode_receipt_unique\` UNIQUE(\`content_root_id\`,\`id\`,\`binding_id\`,\`ordinal\`),
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
          CONSTRAINT \`content_root_grant_episode_receipt_unique\` UNIQUE(\`content_root_id\`,\`id\`,\`binding_id\`,\`binding_episode_id\`,\`ordinal\`),
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
        CREATE TABLE \`course_selection_acceptance_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL CONSTRAINT \`course_selection_acceptance_commit_seal_receipt_unique\` UNIQUE,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`course_selection_acceptance_commit_seal_invocation_unique\` UNIQUE,
          CONSTRAINT \`fk_course_selection_acceptance_commit_seal_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_selection_acceptance_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_course_selection_acceptance_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT
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
        CREATE TABLE \`future_attention_capability_issue\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_future_attention_capability_issue_invocation_part_id_future_attention_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`future_attention_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`future_attention_capability_issue_exact\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "future_attention_capability_issue_shape" CHECK(length("agent_action_fingerprint") = 64 AND length("policy_fingerprint") = 64
                AND length("shown_scope_fingerprint") = 64 AND json_valid("policy_basis")
                AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`future_attention_capability_settlement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`agent_action_fingerprint\` text NOT NULL,
          \`basis\` text,
          \`basis_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_future_attention_capability_settlement_invocation_part_id_future_attention_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`future_attention_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_future_attention_capability_settlement_invocation_part_id_permission_request_id_future_attention_capability_issue_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`future_attention_capability_issue\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE CASCADE,
          CONSTRAINT "future_attention_capability_settlement_shape" CHECK(length("agent_action_fingerprint") = 64
                AND ("basis_fingerprint" IS NULL OR length("basis_fingerprint") = 64)
                AND "time_settled" >= 0 AND "settlement_order" >= 0
                AND (("outcome" = 'not_evaluated' AND "permission_request_id" IS NULL AND "basis" IS NULL)
                  OR ("outcome" IN ('policy_allow', 'policy_deny') AND "permission_request_id" IS NULL
                    AND json_valid("basis"))
                  OR ("outcome" = 'prompted_abort' AND "permission_request_id" IS NOT NULL
                    AND "basis" IS NULL)
                  OR ("outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
                    AND "permission_request_id" IS NOT NULL AND json_valid("basis"))))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`future_attention_change_set\` (
          \`id\` text PRIMARY KEY,
          \`occurrence_id\` text NOT NULL UNIQUE,
          \`slot\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`physical_receipt_id\` text NOT NULL UNIQUE,
          \`admission_projection\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL,
          CONSTRAINT \`fk_future_attention_change_set_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_change_set_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_change_set_physical_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`physical_receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "future_attention_change_set_shape" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'fae_'
                AND "slot" = 'future_attention_change_set' AND json_valid("canonical_command")
                AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND json_valid("admission_projection") AND "time_committed" >= 0
                AND "commit_order" >= 0 AND "frontier_sequence" >= 1)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`future_attention_claim_finalization\` (
          \`id\` text PRIMARY KEY,
          \`group_id\` text NOT NULL UNIQUE,
          \`outcome\` text NOT NULL,
          \`completion\` text NOT NULL,
          \`member_results\` text NOT NULL,
          \`time_finalized\` integer NOT NULL,
          \`finalization_order\` integer NOT NULL,
          \`frontier_sequence\` integer,
          CONSTRAINT \`fk_future_attention_claim_finalization_group_id_future_attention_claim_group_id_fk\` FOREIGN KEY (\`group_id\`) REFERENCES \`future_attention_claim_group\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "future_attention_claim_finalization_shape" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'far_'
                AND "outcome" IN ('served', 'not_served') AND json_valid("completion")
                AND json_valid("member_results") AND json_type("member_results") = 'array'
                AND "time_finalized" >= 0 AND "finalization_order" >= 0
                AND ("outcome" = 'served' AND "frontier_sequence" IS NOT NULL AND "frontier_sequence" >= 1
                  OR "outcome" = 'not_served' AND "frontier_sequence" IS NULL))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`future_attention_claim_group\` (
          \`id\` text PRIMARY KEY,
          \`change_set_id\` text NOT NULL UNIQUE,
          \`physical_receipt_id\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`session_id\` text NOT NULL,
          \`turn_id\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`model_operation_id\` text NOT NULL,
          \`time_admitted\` integer NOT NULL,
          CONSTRAINT \`fk_future_attention_claim_group_change_set_id_future_attention_change_set_id_fk\` FOREIGN KEY (\`change_set_id\`) REFERENCES \`future_attention_change_set\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_claim_group_physical_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`physical_receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_claim_group_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_claim_group_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "future_attention_claim_group_shape" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'fag_'
                AND length("session_id") > 0 AND length("turn_id") > 0
                AND length("assistant_message_id") > 0 AND "model_operation_id" = "assistant_message_id"
                AND "time_admitted" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`future_attention_claim_member\` (
          \`group_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`concern_id\` text NOT NULL,
          \`expected_version\` integer NOT NULL,
          \`expected_transition_id\` text NOT NULL,
          \`rationale\` text NOT NULL,
          \`learner_response_witness\` text,
          CONSTRAINT \`future_attention_claim_member_pk\` PRIMARY KEY(\`group_id\`, \`ordinal\`),
          CONSTRAINT \`fk_future_attention_claim_member_group_id_future_attention_claim_group_id_fk\` FOREIGN KEY (\`group_id\`) REFERENCES \`future_attention_claim_group\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_claim_member_concern_id_future_attention_concern_id_fk\` FOREIGN KEY (\`concern_id\`) REFERENCES \`future_attention_concern\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_claim_member_expected_transition_id_future_attention_transition_id_fk\` FOREIGN KEY (\`expected_transition_id\`) REFERENCES \`future_attention_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`future_attention_claim_member_concern_unique\` UNIQUE(\`group_id\`,\`concern_id\`),
          CONSTRAINT "future_attention_claim_member_shape" CHECK("ordinal" >= 0 AND "expected_version" >= 0
                AND length(CAST("rationale" AS BLOB)) BETWEEN 1 AND 1024
                AND ("learner_response_witness" IS NULL OR json_valid("learner_response_witness")))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`future_attention_concern\` (
          \`id\` text PRIMARY KEY,
          \`predecessor_concern_id\` text UNIQUE,
          \`create_change_set_id\` text NOT NULL,
          \`purpose\` text NOT NULL,
          \`source_relation\` text NOT NULL,
          \`source\` text NOT NULL,
          \`course_id\` text NOT NULL,
          \`view_id\` text NOT NULL,
          \`course_revision_id\` text NOT NULL,
          \`course_item_id\` text NOT NULL,
          \`selection\` text NOT NULL,
          \`membership_receipt\` text NOT NULL,
          \`not_before_instant\` integer NOT NULL,
          \`temporal_source_expression\` text NOT NULL,
          \`effective_utc_offset_minutes\` integer NOT NULL,
          \`resolved_zone\` text NOT NULL,
          \`service_timing\` text NOT NULL,
          \`interaction_order\` text,
          \`semantic_value\` text NOT NULL,
          \`semantic_bytes\` integer NOT NULL,
          \`current_transition_id\` text NOT NULL CONSTRAINT \`future_attention_concern_current_transition_unique\` UNIQUE,
          \`current_version\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_future_attention_concern_predecessor_concern_id_future_attention_concern_id_fk\` FOREIGN KEY (\`predecessor_concern_id\`) REFERENCES \`future_attention_concern\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_concern_create_change_set_id_future_attention_change_set_id_fk\` FOREIGN KEY (\`create_change_set_id\`) REFERENCES \`future_attention_change_set\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_concern_course_id_view_id_course_revision_id_course_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`course_revision_id\`,\`course_item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT,
          CONSTRAINT "future_attention_concern_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'fac_'
                AND ("predecessor_concern_id" IS NULL OR "predecessor_concern_id" <> "id")
                AND length(CAST("purpose" AS BLOB)) BETWEEN 1 AND 768
                AND "source_relation" IN ('interpreted_learner_request', 'tutor_initiated')
                AND json_valid("source") AND json_extract("source", '$.type') = "source_relation"
                AND json_valid("selection") AND json_valid("membership_receipt")
                AND "not_before_instant" >= 0 AND length(CAST("temporal_source_expression" AS BLOB)) BETWEEN 1 AND 256
                AND "effective_utc_offset_minutes" BETWEEN -840 AND 840 AND json_valid("resolved_zone")
                AND json_extract("resolved_zone", '$.type') IN ('iana', 'fixed_offset')
                AND "service_timing" IN ('after_creation', 'at_or_after_not_before')
                AND ("interaction_order" IS NULL OR "interaction_order" = 'learner_response_before_tutor_disclosure')
                AND json_valid("semantic_value") AND "semantic_bytes" = length(CAST("semantic_value" AS BLOB))
                AND "semantic_bytes" BETWEEN 1 AND 2048 AND "current_version" >= 0 AND "time_created" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`future_attention_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`semantic_address_fingerprint\` text NOT NULL,
          \`semantic_outcome\` text,
          \`existing_change_set_id\` text,
          \`agent_action_fingerprint\` text,
          \`agent_action\` text,
          \`materialized_candidate\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_future_attention_disposition_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_future_attention_disposition_existing_change_set_id_future_attention_change_set_id_fk\` FOREIGN KEY (\`existing_change_set_id\`) REFERENCES \`future_attention_change_set\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "future_attention_disposition_fingerprints" CHECK(length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("semantic_address_fingerprint") = 64 AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("agent_action_fingerprint" IS NULL OR (length("agent_action_fingerprint") = 64
                  AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "future_attention_disposition_closed" CHECK(("disposition" = 'candidate_v1' AND "semantic_outcome" IS NULL
                  AND "existing_change_set_id" IS NULL AND "agent_action_fingerprint" IS NOT NULL
                  AND json_valid("agent_action") AND json_valid("materialized_candidate"))
                OR ("disposition" = 'semantic_terminal_v1'
                  AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                  AND "existing_change_set_id" IS NOT NULL AND "agent_action_fingerprint" IS NULL
                  AND "agent_action" IS NULL AND "materialized_candidate" IS NULL)),
          CONSTRAINT "future_attention_disposition_shape" CHECK(json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND "time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`future_attention_service_receipt\` (
          \`id\` text PRIMARY KEY,
          \`transition_id\` text NOT NULL UNIQUE,
          \`source\` text NOT NULL,
          \`rationale\` text NOT NULL,
          \`learner_response_witness\` text,
          \`carried_from_service_receipt_id\` text,
          \`claim_group_id\` text,
          \`time_recorded\` integer NOT NULL,
          CONSTRAINT \`fk_future_attention_service_receipt_transition_id_future_attention_transition_id_fk\` FOREIGN KEY (\`transition_id\`) REFERENCES \`future_attention_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_service_receipt_carried_from_service_receipt_id_future_attention_service_receipt_id_fk\` FOREIGN KEY (\`carried_from_service_receipt_id\`) REFERENCES \`future_attention_service_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "future_attention_service_receipt_shape" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'fas_' AND json_valid("source")
                AND length(CAST("rationale" AS BLOB)) BETWEEN 1 AND 1024
                AND ("learner_response_witness" IS NULL OR json_valid("learner_response_witness"))
                AND "time_recorded" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`future_attention_transition\` (
          \`id\` text PRIMARY KEY,
          \`concern_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`predecessor_transition_id\` text UNIQUE,
          \`kind\` text NOT NULL,
          \`disposition\` text NOT NULL,
          \`mutation\` text,
          \`rationale\` text,
          \`service_receipt_id\` text,
          \`change_set_id\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL,
          CONSTRAINT \`fk_future_attention_transition_concern_id_future_attention_concern_id_fk\` FOREIGN KEY (\`concern_id\`) REFERENCES \`future_attention_concern\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_transition_predecessor_transition_id_future_attention_transition_id_fk\` FOREIGN KEY (\`predecessor_transition_id\`) REFERENCES \`future_attention_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_future_attention_transition_change_set_id_future_attention_change_set_id_fk\` FOREIGN KEY (\`change_set_id\`) REFERENCES \`future_attention_change_set\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`future_attention_transition_concern_version_unique\` UNIQUE(\`concern_id\`,\`version\`),
          CONSTRAINT "future_attention_transition_shape" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'fat_' AND "version" >= 0
                AND "kind" IN ('created', 'superseded', 'served', 'dismissed', 'reopened', 'served_by_correction', 'dismissed_by_correction')
                AND "disposition" IN ('open', 'served', 'dismissed', 'superseded')
                AND ("mutation" IS NULL OR json_valid("mutation"))
                AND ("rationale" IS NULL OR length(CAST("rationale" AS BLOB)) BETWEEN 1 AND 1024)
                AND "time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_capability_issue_v2\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_goal_capability_issue_v2_invocation_part_id_learner_goal_disposition_v2_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_goal_disposition_v2\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`learner_goal_capability_issue_v2_invocation_request_unique\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "learner_goal_capability_issue_v2_fingerprints" CHECK(length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("shown_scope_fingerprint") = 64 AND "shown_scope_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_goal_capability_issue_v2_shape" CHECK(length("permission_request_id") > 0 AND json_valid("policy_basis")
                AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_capability_settlement_v2\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text,
          \`policy_fingerprint\` text,
          \`reply\` text,
          \`reply_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_goal_capability_settlement_v2_invocation_part_id_learner_goal_disposition_v2_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_goal_disposition_v2\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_learner_goal_capability_settlement_v2_invocation_part_id_permission_request_id_learner_goal_capability_issue_v2_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`learner_goal_capability_issue_v2\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_goal_capability_settlement_v2_fingerprints" CHECK(length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("policy_fingerprint" IS NULL OR (length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("reply_fingerprint" IS NULL OR (length("reply_fingerprint") = 64 AND "reply_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_goal_capability_settlement_v2_closed_union" CHECK(("outcome" = 'not_evaluated' AND "permission_request_id" IS NULL
                  AND "policy_basis" IS NULL AND "policy_fingerprint" IS NULL
                  AND "reply" IS NULL AND "reply_fingerprint" IS NULL)
                OR ("outcome" IN ('policy_allow', 'policy_deny') AND "permission_request_id" IS NULL
                  AND json_valid("policy_basis") AND "policy_fingerprint" IS NOT NULL
                  AND "reply" IS NULL AND "reply_fingerprint" IS NULL)
                OR ("outcome" = 'prompted_abort' AND "permission_request_id" IS NOT NULL
                  AND "policy_basis" IS NULL AND "policy_fingerprint" IS NULL
                  AND "reply" IS NULL AND "reply_fingerprint" IS NULL)
                OR ("outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
                  AND "permission_request_id" IS NOT NULL
                  AND "policy_basis" IS NULL AND "policy_fingerprint" IS NULL
                  AND json_valid("reply") AND "reply_fingerprint" IS NOT NULL)),
          CONSTRAINT "learner_goal_capability_settlement_v2_time" CHECK("time_settled" >= 0 AND "settlement_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_command\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`semantic_fingerprint\` text NOT NULL,
          \`command_snapshot\` text NOT NULL,
          \`permission_request_id\` text,
          \`confirmation_snapshot\` text,
          CONSTRAINT \`fk_learner_goal_command_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_goal_command_fingerprint" CHECK(length("semantic_fingerprint") = 64 AND "semantic_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_goal_command_snapshot" CHECK(json_valid("command_snapshot") AND json_type("command_snapshot") = 'object'),
          CONSTRAINT "learner_goal_command_permission" CHECK("permission_request_id" IS NULL OR length("permission_request_id") > 0),
          CONSTRAINT "learner_goal_command_confirmation" CHECK("confirmation_snapshot" IS NULL OR (json_valid("confirmation_snapshot") AND json_type("confirmation_snapshot") = 'object'))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL CONSTRAINT \`learner_goal_commit_seal_receipt_unique\` UNIQUE,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`learner_goal_commit_seal_invocation_unique\` UNIQUE,
          CONSTRAINT \`fk_learner_goal_commit_seal_effect_id_learner_goal_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_goal_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT
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
        CREATE TABLE \`learner_goal_disposition_v2\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`legacy_command_part_id\` text,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text,
          \`semantic_address\` text,
          \`semantic_address_fingerprint\` text,
          \`incoming_intent_fingerprint\` text,
          \`semantic_outcome\` text,
          \`existing_effect_id\` text,
          \`existing_intent_fingerprint\` text,
          \`agent_action_fingerprint\` text,
          \`agent_action_provenance\` text,
          \`materialized_snapshot\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_learner_goal_disposition_v2_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_learner_goal_disposition_v2_legacy_command_part_id_learner_goal_command_invocation_part_id_fk\` FOREIGN KEY (\`legacy_command_part_id\`) REFERENCES \`learner_goal_command\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_goal_disposition_v2_fingerprints" CHECK(length("command_fingerprint") = 64
                AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("semantic_address_fingerprint" IS NULL OR
                  (length("semantic_address_fingerprint") = 64 AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("incoming_intent_fingerprint" IS NULL OR
                  (length("incoming_intent_fingerprint") = 64 AND "incoming_intent_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("existing_intent_fingerprint" IS NULL OR
                  (length("existing_intent_fingerprint") = 64 AND "existing_intent_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("agent_action_fingerprint" IS NULL OR
                  (length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_goal_disposition_v2_closed_union" CHECK((
                "disposition" = 'legacy_v1'
                AND "legacy_command_part_id" = "invocation_part_id"
                AND "canonical_command" IS NULL
                AND "semantic_address" IS NULL
                AND "semantic_address_fingerprint" IS NULL
                AND "incoming_intent_fingerprint" IS NULL
                AND "semantic_outcome" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_intent_fingerprint" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "materialized_snapshot" IS NULL
              ) OR (
                "disposition" = 'semantic_terminal_v2'
                AND "legacy_command_part_id" IS NULL
                AND json_valid("canonical_command")
                AND json_type("canonical_command") = 'object'
                AND json_valid("semantic_address")
                AND json_type("semantic_address") = 'object'
                AND json_type("semantic_address", '$.occurrenceID') = 'text'
                AND json_extract("semantic_address", '$.slot') = 'learner_goal_change_set'
                AND "semantic_address_fingerprint" IS NOT NULL
                AND "incoming_intent_fingerprint" IS NOT NULL
                AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                AND "existing_effect_id" IS NOT NULL
                AND "existing_intent_fingerprint" IS NOT NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "materialized_snapshot" IS NULL
              ) OR (
                "disposition" = 'candidate_v2'
                AND "legacy_command_part_id" IS NULL
                AND json_valid("canonical_command")
                AND json_type("canonical_command") = 'object'
                AND json_valid("semantic_address")
                AND json_type("semantic_address") = 'object'
                AND json_type("semantic_address", '$.occurrenceID') = 'text'
                AND json_extract("semantic_address", '$.slot') = 'learner_goal_change_set'
                AND "semantic_address_fingerprint" IS NOT NULL
                AND "incoming_intent_fingerprint" IS NOT NULL
                AND "semantic_outcome" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_intent_fingerprint" IS NULL
                AND "agent_action_fingerprint" IS NOT NULL
                AND json_valid("agent_action_provenance")
                AND json_extract("agent_action_provenance", '$.schemaVersion') = 1
                AND json_extract("agent_action_provenance", '$.kind') IN ('root', 'delegated')
                AND json_extract("agent_action_provenance", '$.capabilityIdentity') = 'update_learner_goals'
                AND json_extract("agent_action_provenance", '$.capabilityVersion') = 2
                AND json_type("agent_action_provenance", '$.lineage') = 'array'
                AND ((json_extract("agent_action_provenance", '$.kind') = 'root'
                      AND json_array_length("agent_action_provenance", '$.lineage') = 0
                      AND json_type("agent_action_provenance", '$.effectiveDelegatedCapability') IS NULL)
                  OR (json_extract("agent_action_provenance", '$.kind') = 'delegated'
                      AND json_array_length("agent_action_provenance", '$.lineage') > 0
                      AND json_type("agent_action_provenance", '$.effectiveDelegatedCapability') = 'object'))
                AND json_valid("materialized_snapshot")
                AND json_type("materialized_snapshot") = 'object'
                AND json_extract("materialized_snapshot", '$.schemaVersion') = 2
                AND json("canonical_command") = json(json_extract("materialized_snapshot", '$.canonicalCommand'))
                AND json_type("materialized_snapshot", '$.operations') = 'array'
                AND json_array_length("materialized_snapshot", '$.operations') BETWEEN 1 AND 8
                AND json_type("materialized_snapshot", '$.revisionSequenceBefore') = 'integer'
                AND json_extract("materialized_snapshot", '$.revisionSequenceBefore') >= 0
                AND json_type("materialized_snapshot", '$.consumedFrontiers') = 'array'
                AND json_type("materialized_snapshot", '$.timeFloor') = 'integer'
                AND json_extract("materialized_snapshot", '$.timeFloor') >= 0
              )),
          CONSTRAINT "learner_goal_disposition_v2_time" CHECK("time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_effect_operation\` (
          \`effect_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`schema_version\` integer DEFAULT 1 NOT NULL,
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
          CONSTRAINT "learner_goal_effect_operation_result" CHECK("schema_version" IN (1, 2) AND ("operation_kind" = 'update' OR "result_kind" = 'changed') AND "version" >= 1 AND "disposition" IN ('active', 'achieved', 'abandoned', 'superseded') AND json_valid("meaning")),
          CONSTRAINT "learner_goal_effect_operation_replacement" CHECK(("operation_kind" = 'replace' AND "result_kind" = 'changed' AND "disposition" = 'superseded' AND "replacement_target_kind" IN ('existing', 'new') AND "replacement_target_goal_id" IS NOT NULL AND "replacement_target_revision_id" IS NOT NULL AND "replacement_target_version" >= 1) OR ("operation_kind" <> 'replace' AND "replacement_target_kind" IS NULL AND "replacement_target_goal_id" IS NULL AND "replacement_target_revision_id" IS NULL AND "replacement_target_version" IS NULL))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_effect\` (
          \`id\` text PRIMARY KEY,
          \`schema_version\` integer DEFAULT 1 NOT NULL,
          \`commit_seal_id\` text NOT NULL,
          \`occurrence_id\` text NOT NULL CONSTRAINT \`learner_goal_effect_occurrence_unique\` UNIQUE,
          \`source_order\` integer NOT NULL,
          \`semantic_fingerprint\` text NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`command\` text NOT NULL,
          \`agent_action_part_id\` text,
          \`materialized_snapshot\` text,
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
          CONSTRAINT \`fk_learner_goal_effect_agent_action_part_id_learner_goal_disposition_v2_invocation_part_id_fk\` FOREIGN KEY (\`agent_action_part_id\`) REFERENCES \`learner_goal_disposition_v2\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_effect_seal_identity" CHECK("commit_seal_id" = "id"),
          CONSTRAINT "learner_goal_effect_identity_format" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'gle_' AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "learner_goal_effect_fingerprint" CHECK(length("semantic_fingerprint") = 64 AND "semantic_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_goal_effect_versioned_provenance" CHECK(("schema_version" = 1
                  AND "authorization_basis" IN ('learner_request', 'learner_acceptance')
                  AND "agent_action_part_id" IS NULL
                  AND "materialized_snapshot" IS NULL)
                OR ("schema_version" = 2
                  AND "authorization_basis" = 'agent_action'
                  AND "agent_action_part_id" IS NOT NULL
                  AND json_valid("command")
                  AND json_type("command") = 'object'
                  AND json_valid("materialized_snapshot")
                  AND json_type("materialized_snapshot") = 'object')),
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
          \`schema_version\` integer DEFAULT 1 NOT NULL,
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
          \`target_kind\` text,
          \`target_instant\` integer,
          \`target_local_date\` text,
          \`target_timezone\` text,
          \`target_timezone_release_id\` text,
          \`target_utc_offset_minutes\` integer,
          \`target_source_expression\` text,
          \`target_normalized\` text,
          \`target_normalization_basis\` text,
          \`target_value_v2\` text,
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
          CONSTRAINT "learner_goal_revision_versioned_target" CHECK(COALESCE((
                "schema_version" = 1
                AND "target_value_v2" IS NULL
                AND (
                  ("target_kind" = 'absent' AND "target_instant" IS NULL AND "target_local_date" IS NULL AND "target_timezone" IS NULL AND "target_timezone_release_id" IS NULL AND "target_utc_offset_minutes" IS NULL AND "target_source_expression" IS NULL AND "target_normalized" IS NULL AND "target_normalization_basis" IS NULL)
                  OR ("target_kind" = 'instant' AND "target_instant" IS NOT NULL AND "target_instant" >= 0 AND "target_local_date" IS NULL AND "target_timezone" IS NULL AND "target_timezone_release_id" IS NULL AND "target_utc_offset_minutes" BETWEEN -840 AND 840 AND "target_source_expression" IS NOT NULL AND length("target_source_expression") > 0 AND "target_normalized" IS NOT NULL AND length("target_normalized") > 0 AND round(unixepoch("target_normalized", 'subsec') * 1000) = "target_instant" AND "target_normalization_basis" = 'explicit_offset')
                  OR ("target_kind" = 'local_date' AND "target_instant" IS NULL AND "target_local_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("target_local_date") = "target_local_date" AND "target_timezone" IS NOT NULL AND length("target_timezone") > 0 AND "target_timezone_release_id" IS NOT NULL AND length("target_timezone_release_id") > 0 AND "target_utc_offset_minutes" IS NULL AND "target_source_expression" IS NOT NULL AND length("target_source_expression") > 0 AND "target_normalized" IS NULL AND "target_normalization_basis" IN ('explicit_date', 'source_temporal_context'))
                )
              ) OR (
                "schema_version" = 2
                AND "target_kind" IS NULL
                AND "target_instant" IS NULL
                AND "target_local_date" IS NULL
                AND "target_timezone" IS NULL
                AND "target_timezone_release_id" IS NULL
                AND "target_utc_offset_minutes" IS NULL
                AND "target_source_expression" IS NULL
                AND "target_normalized" IS NULL
                AND "target_normalization_basis" IS NULL
                AND json_valid("target_value_v2")
                AND json_type("target_value_v2") = 'object'
              ), 0)),
          CONSTRAINT "learner_goal_revision_disposition" CHECK("disposition" IN ('active', 'achieved', 'abandoned', 'superseded')),
          CONSTRAINT "learner_goal_revision_order" CHECK("version" >= 1 AND "operation_ordinal" BETWEEN 0 AND 7 AND "source_order" >= 1 AND "revision_order" >= 1 AND "time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed")
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
        CREATE TABLE \`learner_goal_state\` (
          \`singleton\` integer PRIMARY KEY DEFAULT 1,
          \`revision_sequence\` integer DEFAULT 0 NOT NULL,
          CONSTRAINT "learner_goal_state_singleton" CHECK("singleton" = 1),
          CONSTRAINT "learner_goal_state_revision_nonnegative" CHECK("revision_sequence" >= 0)
        );
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
        CREATE TABLE \`learner_course_route_anchor_transition\` (
          \`id\` text PRIMARY KEY,
          \`course_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`predecessor_id\` text,
          \`previous_view_id\` text,
          \`previous_revision_id\` text,
          \`previous_item_id\` text,
          \`target_view_id\` text,
          \`target_revision_id\` text,
          \`target_item_id\` text,
          \`occurrence_id\` text NOT NULL,
          \`target_course_version\` integer,
          \`target_selection_version\` integer,
          \`target_view_version\` integer,
          \`target_revision_version\` integer,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL CONSTRAINT \`learner_course_route_anchor_frontier_unique\` UNIQUE,
          \`frontier_time\` integer NOT NULL,
          CONSTRAINT \`fk_learner_course_route_anchor_transition_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_course_route_anchor_transition_course_id_predecessor_id_learner_course_route_anchor_transition_course_id_id_fk\` FOREIGN KEY (\`course_id\`,\`predecessor_id\`) REFERENCES \`learner_course_route_anchor_transition\`(\`course_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_course_route_anchor_transition_course_id_previous_view_id_previous_revision_id_previous_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`previous_view_id\`,\`previous_revision_id\`,\`previous_item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_course_route_anchor_transition_course_id_target_view_id_target_revision_id_target_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`target_view_id\`,\`target_revision_id\`,\`target_item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_course_route_anchor_transition_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_course_route_anchor_owner_unique\` UNIQUE(\`course_id\`,\`id\`),
          CONSTRAINT \`learner_course_route_anchor_version_unique\` UNIQUE(\`course_id\`,\`version\`),
          CONSTRAINT \`learner_course_route_anchor_predecessor_unique\` UNIQUE(\`course_id\`,\`predecessor_id\`),
          CONSTRAINT \`learner_course_route_anchor_occurrence_unique\` UNIQUE(\`occurrence_id\`,\`course_id\`),
          CONSTRAINT "learner_course_route_anchor_chain_shape" CHECK(("version" = 1 AND "predecessor_id" IS NULL AND "previous_view_id" IS NULL AND "previous_revision_id" IS NULL AND "previous_item_id" IS NULL) OR ("version" > 1 AND "predecessor_id" IS NOT NULL)),
          CONSTRAINT "learner_course_route_anchor_previous_shape" CHECK(("previous_view_id" IS NULL AND "previous_revision_id" IS NULL AND "previous_item_id" IS NULL) OR ("previous_view_id" IS NOT NULL AND "previous_revision_id" IS NOT NULL AND "previous_item_id" IS NOT NULL)),
          CONSTRAINT "learner_course_route_anchor_target_shape" CHECK(("target_view_id" IS NULL AND "target_revision_id" IS NULL AND "target_item_id" IS NULL AND "target_course_version" IS NULL AND "target_selection_version" IS NULL AND "target_view_version" IS NULL AND "target_revision_version" IS NULL) OR ("target_view_id" IS NOT NULL AND "target_revision_id" IS NOT NULL AND "target_item_id" IS NOT NULL AND "target_course_version" IS NOT NULL AND "target_selection_version" IS NOT NULL AND "target_view_version" IS NOT NULL AND "target_revision_version" IS NOT NULL)),
          CONSTRAINT "learner_course_route_anchor_value_changed" CHECK(NOT ("target_view_id" IS "previous_view_id" AND "target_revision_id" IS "previous_revision_id" AND "target_item_id" IS "previous_item_id")),
          CONSTRAINT "learner_course_route_anchor_versions" CHECK("version" >= 1 AND ("target_course_version" IS NULL OR "target_course_version" >= 0) AND ("target_selection_version" IS NULL OR "target_selection_version" >= 0) AND ("target_view_version" IS NULL OR "target_view_version" >= 0) AND ("target_revision_version" IS NULL OR "target_revision_version" >= 0)),
          CONSTRAINT "learner_course_route_anchor_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed")
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_transition\` (
          \`id\` text PRIMARY KEY,
          \`version\` integer NOT NULL CONSTRAINT \`learner_default_course_version_unique\` UNIQUE,
          \`predecessor_id\` text CONSTRAINT \`learner_default_course_predecessor_unique\` UNIQUE,
          \`previous_course_id\` text,
          \`course_id\` text,
          \`occurrence_id\` text NOT NULL CONSTRAINT \`learner_default_course_occurrence_unique\` UNIQUE,
          \`authorization_part_id\` text,
          \`agent_action_part_id\` text,
          \`permission_request_id\` text,
          \`confirmation_snapshot\` text,
          \`target_course_version\` integer,
          \`target_selection_revision_id\` text,
          \`target_selection_version\` integer,
          \`target_view_id\` text,
          \`target_view_version\` integer,
          \`target_revision_version\` integer,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL CONSTRAINT \`learner_default_course_frontier_unique\` UNIQUE,
          \`frontier_time\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_transition_predecessor_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`predecessor_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_previous_course_id_course_id_fk\` FOREIGN KEY (\`previous_course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_course_id_target_view_id_course_view_course_id_id_fk\` FOREIGN KEY (\`course_id\`,\`target_view_id\`) REFERENCES \`course_view\`(\`course_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_course_id_target_view_id_target_selection_revision_id_course_view_revision_course_id_view_id_id_fk\` FOREIGN KEY (\`course_id\`,\`target_view_id\`,\`target_selection_revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`view_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_authorization_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`authorization_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_agent_action_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`agent_action_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_chain_shape" CHECK(("version" = 1 AND "predecessor_id" IS NULL AND "previous_course_id" IS NULL) OR ("version" > 1 AND "predecessor_id" IS NOT NULL)),
          CONSTRAINT "learner_default_course_value_changed" CHECK(NOT ("course_id" IS "previous_course_id")),
          CONSTRAINT "learner_default_course_target_shape" CHECK(("course_id" IS NULL AND "target_course_version" IS NULL AND "target_selection_revision_id" IS NULL AND "target_selection_version" IS NULL AND "target_view_id" IS NULL AND "target_view_version" IS NULL AND "target_revision_version" IS NULL) OR ("course_id" IS NOT NULL AND "target_course_version" IS NOT NULL AND "target_selection_version" IS NOT NULL AND (("target_selection_revision_id" IS NULL AND "target_view_id" IS NULL AND "target_view_version" IS NULL AND "target_revision_version" IS NULL) OR ("target_selection_revision_id" IS NOT NULL AND "target_view_id" IS NOT NULL AND "target_view_version" IS NOT NULL AND "target_revision_version" IS NOT NULL)))),
          CONSTRAINT "learner_default_course_versions" CHECK("version" >= 1 AND ("target_course_version" IS NULL OR "target_course_version" >= 0) AND ("target_selection_version" IS NULL OR "target_selection_version" >= 0) AND ("target_view_version" IS NULL OR "target_view_version" >= 0) AND ("target_revision_version" IS NULL OR "target_revision_version" >= 0)),
          CONSTRAINT "learner_default_course_legacy_confirmation_shape" CHECK(("permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("permission_request_id" IS NOT NULL AND length("permission_request_id") > 0 AND json_valid("confirmation_snapshot"))),
          CONSTRAINT "learner_default_course_provenance_shape" CHECK(("authorization_part_id" IS NOT NULL AND "agent_action_part_id" IS NULL) OR ("authorization_part_id" IS NULL AND "agent_action_part_id" IS NOT NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL)),
          CONSTRAINT "learner_default_course_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed")
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_course_route_anchor_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL CONSTRAINT \`learner_course_route_anchor_commit_seal_receipt_unique\` UNIQUE,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`learner_course_route_anchor_commit_seal_invocation_unique\` UNIQUE,
          CONSTRAINT \`fk_learner_course_route_anchor_commit_seal_effect_id_learner_course_route_anchor_transition_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_course_route_anchor_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_course_route_anchor_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_course_route_anchor_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_acknowledgement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`effect_authorization_part_id\` text,
          \`authorization_version\` integer,
          \`effect_agent_action_part_id\` text,
          \`agent_action_version\` integer,
          \`effect_id\` text NOT NULL,
          \`receipt_id\` text NOT NULL,
          \`operation\` text NOT NULL,
          \`from_locator\` text NOT NULL,
          \`to_locator\` text NOT NULL,
          \`relation\` text NOT NULL,
          \`presentation_snapshot\` text NOT NULL,
          \`presentation_fingerprint\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_invocation_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_effect_authorization_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`effect_authorization_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_effect_agent_action_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`effect_agent_action_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_effect_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_acknowledgement_shape" CHECK(
                "operation" IN ('set', 'change', 'clear')
                AND json_valid("from_locator")
                AND json_valid("to_locator")
                AND json_valid("presentation_snapshot")
                AND "relation" IN ('active', 'superseded')
                AND (
                  (
                    "authorization_version" = 1
                    AND "effect_authorization_part_id" IS NOT NULL
                    AND "agent_action_version" IS NULL
                    AND "effect_agent_action_part_id" IS NULL
                    AND (
            (
              json_extract("from_locator", '$.kind') = 'absent'
              AND json_type("from_locator", '$.locator') IS NULL
            )
            OR
            (
              json_extract("from_locator", '$.kind') = 'course'
              AND json_type("from_locator", '$.locator') = 'object'
              AND json_type("from_locator", '$.locator.courseID') = 'text'
              AND json_extract("from_locator", '$.locator.title.availability') IN ('recorded_v1', 'not_recorded_v1')
              AND json_extract("from_locator", '$.locator.courseVersion.availability') IN ('recorded_v1', 'not_recorded_v1')
              AND json_extract("from_locator", '$.locator.workingSelection.availability') IN ('recorded_v1', 'not_recorded_v1')
            )
          )
                    AND (
            (
              json_extract("to_locator", '$.kind') = 'absent'
              AND json_type("to_locator", '$.locator') IS NULL
            )
            OR
            (
              json_extract("to_locator", '$.kind') = 'course'
              AND json_type("to_locator", '$.locator') = 'object'
              AND json_type("to_locator", '$.locator.courseID') = 'text'
              AND json_extract("to_locator", '$.locator.title.availability') IN ('recorded_v1', 'not_recorded_v1')
              AND json_extract("to_locator", '$.locator.courseVersion.availability') IN ('recorded_v1', 'not_recorded_v1')
              AND json_extract("to_locator", '$.locator.workingSelection.availability') IN ('recorded_v1', 'not_recorded_v1')
            )
          )
                    AND json_extract("presentation_snapshot", '$.schemaVersion') = 1
                    AND json_extract("presentation_snapshot", '$.authorizationVersion') = 1
                    AND json_extract("presentation_snapshot", '$.effectAuthorizationPartID') =
                      "effect_authorization_part_id"
                    AND json_type("presentation_snapshot", '$.agentActionVersion') IS NULL
                    AND json_type("presentation_snapshot", '$.effectAgentActionPartID') IS NULL
                  )
                  OR (
                    "authorization_version" = 2
                    AND "effect_authorization_part_id" IS NOT NULL
                    AND "agent_action_version" IS NULL
                    AND "effect_agent_action_part_id" IS NULL
                    AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                    AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                    AND json_extract("presentation_snapshot", '$.schemaVersion') = 1
                    AND json_extract("presentation_snapshot", '$.authorizationVersion') = 2
                    AND json_extract("presentation_snapshot", '$.effectAuthorizationPartID') =
                      "effect_authorization_part_id"
                    AND json_type("presentation_snapshot", '$.agentActionVersion') IS NULL
                    AND json_type("presentation_snapshot", '$.effectAgentActionPartID') IS NULL
                  )
                  OR (
                    "authorization_version" IS NULL
                    AND "effect_authorization_part_id" IS NULL
                    AND "agent_action_version" = 3
                    AND "effect_agent_action_part_id" IS NOT NULL
                    AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                    AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                    AND json_extract("presentation_snapshot", '$.schemaVersion') = 2
                    AND json_extract("presentation_snapshot", '$.agentActionVersion') = 3
                    AND json_extract("presentation_snapshot", '$.effectAgentActionPartID') =
                      "effect_agent_action_part_id"
                    AND json_type("presentation_snapshot", '$.authorizationVersion') IS NULL
                    AND json_type("presentation_snapshot", '$.effectAuthorizationPartID') IS NULL
                  )
                )
              ),
          CONSTRAINT "learner_default_course_acknowledgement_fingerprint" CHECK(length("presentation_fingerprint") = 64 AND "presentation_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_default_course_acknowledgement_time" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_capability_issue\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`authorization_fingerprint\` text,
          \`agent_action_fingerprint\` text,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_capability_issue_invocation_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_default_course_capability_issue_invocation_request_unique\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "learner_default_course_capability_issue_fingerprints" CHECK(((length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*' AND "agent_action_fingerprint" IS NULL) OR ("authorization_fingerprint" IS NULL AND length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("shown_scope_fingerprint") = 64 AND "shown_scope_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_default_course_capability_issue_shape" CHECK(length("permission_request_id") > 0 AND json_valid("policy_basis") AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_capability_settlement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`authorization_fingerprint\` text,
          \`agent_action_fingerprint\` text,
          \`policy_basis\` text,
          \`policy_fingerprint\` text,
          \`reply\` text,
          \`reply_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_capability_settlement_invocation_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_capability_settlement_invocation_part_id_permission_request_id_learner_default_course_capability_issue_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`learner_default_course_capability_issue\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_capability_settlement_fingerprints" CHECK(((length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*' AND "agent_action_fingerprint" IS NULL) OR ("authorization_fingerprint" IS NULL AND length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("policy_fingerprint" IS NULL OR (length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("reply_fingerprint" IS NULL OR (length("reply_fingerprint") = 64 AND "reply_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_default_course_capability_settlement_closed_union" CHECK((
                "outcome" = 'not_evaluated'
                AND "permission_request_id" IS NULL
                AND "policy_basis" IS NULL
                AND "policy_fingerprint" IS NULL
                AND "reply" IS NULL
                AND "reply_fingerprint" IS NULL
              ) OR (
                "outcome" IN ('policy_allow', 'policy_deny')
                AND "permission_request_id" IS NULL
                AND json_valid("policy_basis")
                AND "policy_fingerprint" IS NOT NULL
                AND "reply" IS NULL
                AND "reply_fingerprint" IS NULL
              ) OR (
                "outcome" = 'prompted_abort'
                AND "permission_request_id" IS NOT NULL
                AND "policy_basis" IS NULL
                AND "policy_fingerprint" IS NULL
                AND "reply" IS NULL
                AND "reply_fingerprint" IS NULL
              ) OR (
                "outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
                AND "permission_request_id" IS NOT NULL
                AND "policy_basis" IS NULL
                AND "policy_fingerprint" IS NULL
                AND json_valid("reply")
                AND "reply_fingerprint" IS NOT NULL
              )),
          CONSTRAINT "learner_default_course_capability_settlement_time" CHECK("time_settled" >= 0 AND "settlement_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_command\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL,
          CONSTRAINT \`fk_learner_default_course_command_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_default_course_command_permission" CHECK(length("permission_request_id") > 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL CONSTRAINT \`learner_default_course_commit_seal_receipt_unique\` UNIQUE,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`learner_default_course_commit_seal_invocation_unique\` UNIQUE,
          CONSTRAINT \`fk_learner_default_course_commit_seal_effect_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`authorization_version\` integer,
          \`authorization_kind\` text,
          \`authorization_fingerprint\` text,
          \`agent_action_version\` integer,
          \`agent_action_fingerprint\` text,
          \`agent_action_provenance\` text,
          \`command_fingerprint\` text NOT NULL,
          \`semantic_outcome\` text,
          \`semantic_address\` text,
          \`semantic_address_fingerprint\` text,
          \`incoming_payload_fingerprint\` text,
          \`existing_effect_id\` text,
          \`existing_payload_fingerprint\` text,
          \`legacy_row_class\` text,
          \`confirmation_availability\` text,
          \`command_permission_request_id\` text,
          \`effect_confirmation_request_id\` text,
          \`legacy_effect_id\` text,
          \`legacy_receipt_id\` text,
          \`command_snapshot\` text,
          \`source_excerpt\` text,
          \`resolution_scope\` text,
          \`resolution_fingerprint\` text,
          \`preference_head_id\` text,
          \`preference_version\` integer,
          \`operation\` text,
          \`from_locator\` text,
          \`to_locator\` text,
          \`selected_course_id\` text,
          \`proposal_part_id\` text,
          \`proposal_presentation_part_id\` text,
          \`proposal_presentation_assistant_message_id\` text,
          \`proposal_assistant_message_id\` text,
          \`proposal_emission_ordinal\` integer,
          \`proposal_fingerprint\` text,
          \`proposal_selection\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_disposition_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_disposition_proposal_part_id_learner_default_course_proposal_part_id_fk\` FOREIGN KEY (\`proposal_part_id\`) REFERENCES \`learner_default_course_proposal\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_disposition_fingerprints" CHECK(("authorization_fingerprint" IS NULL OR (length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("agent_action_fingerprint" IS NULL OR (length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*' AND ("semantic_address_fingerprint" IS NULL OR (length("semantic_address_fingerprint") = 64 AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("incoming_payload_fingerprint" IS NULL OR (length("incoming_payload_fingerprint") = 64 AND "incoming_payload_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("existing_payload_fingerprint" IS NULL OR (length("existing_payload_fingerprint") = 64 AND "existing_payload_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("resolution_fingerprint" IS NULL OR (length("resolution_fingerprint") = 64 AND "resolution_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("proposal_fingerprint" IS NULL OR (length("proposal_fingerprint") = 64 AND "proposal_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_default_course_disposition_closed_union" CHECK((
                "disposition" = 'legacy_v1'
                AND "authorization_version" = 1
                AND "authorization_kind" = 'legacy_v1'
                AND "authorization_fingerprint" IS NOT NULL
                AND "agent_action_version" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "semantic_outcome" IS NULL
                AND "semantic_address" IS NULL
                AND "semantic_address_fingerprint" IS NULL
                AND "incoming_payload_fingerprint" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_payload_fingerprint" IS NULL
                AND "legacy_row_class" IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')
                AND "command_permission_request_id" IS NOT NULL
                AND length("command_permission_request_id") > 0
                AND "command_snapshot" IS NULL
                AND "source_excerpt" IS NULL
                AND "resolution_scope" IS NULL
                AND "resolution_fingerprint" IS NULL
                AND "preference_head_id" IS NULL
                AND "preference_version" IS NULL
                AND "operation" IS NULL
                AND "from_locator" IS NULL
                AND "to_locator" IS NULL
                AND "selected_course_id" IS NULL
                AND "proposal_part_id" IS NULL
                AND "proposal_presentation_part_id" IS NULL
                AND "proposal_presentation_assistant_message_id" IS NULL
                AND "proposal_assistant_message_id" IS NULL
                AND "proposal_emission_ordinal" IS NULL
                AND "proposal_fingerprint" IS NULL
                AND "proposal_selection" IS NULL
                AND (
                  (
                    "legacy_row_class" IN ('applied', 'already_applied')
                    AND "confirmation_availability" = 'recorded_v1'
                    AND "effect_confirmation_request_id" IS NOT NULL
                    AND "legacy_effect_id" IS NOT NULL
                    AND "legacy_receipt_id" IS NOT NULL
                  )
                  OR
                  (
                    "legacy_row_class" IN ('admitted', 'no_change', 'error')
                    AND "confirmation_availability" = 'not_recorded_v1'
                    AND "effect_confirmation_request_id" IS NULL
                    AND "legacy_effect_id" IS NULL
                    AND "legacy_receipt_id" IS NULL
                  )
                )
              ) OR (
                "disposition" = 'semantic_terminal_v2'
                AND "authorization_version" IS NULL
                AND "authorization_kind" IS NULL
                AND "authorization_fingerprint" IS NULL
                AND "agent_action_version" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                AND json_valid("command_snapshot")
                AND json_valid("semantic_address")
                AND json_extract("semantic_address", '$.slot') = 'default_course_preference'
                AND "semantic_address_fingerprint" IS NOT NULL
                AND "incoming_payload_fingerprint" IS NOT NULL
                AND "existing_effect_id" IS NOT NULL
                AND "existing_payload_fingerprint" IS NOT NULL
                AND "legacy_row_class" IS NULL
                AND "confirmation_availability" IS NULL
                AND "command_permission_request_id" IS NULL
                AND "effect_confirmation_request_id" IS NULL
                AND "legacy_effect_id" IS NULL
                AND "legacy_receipt_id" IS NULL
                AND "source_excerpt" IS NULL
                AND "resolution_scope" IS NULL
                AND "resolution_fingerprint" IS NULL
                AND "preference_head_id" IS NULL
                AND "preference_version" IS NULL
                AND "operation" IS NULL
                AND "from_locator" IS NULL
                AND "to_locator" IS NULL
                AND "selected_course_id" IS NULL
                AND "proposal_part_id" IS NULL
                AND "proposal_presentation_part_id" IS NULL
                AND "proposal_presentation_assistant_message_id" IS NULL
                AND "proposal_assistant_message_id" IS NULL
                AND "proposal_emission_ordinal" IS NULL
                AND "proposal_fingerprint" IS NULL
                AND "proposal_selection" IS NULL
                AND (
            json_type("command_snapshot") = 'object'
            AND json_extract("command_snapshot", '$.kind') = 'default_course_preference'
            AND json_type("command_snapshot", '$.expectedHeadID') IN ('null', 'text')
            AND json_type("command_snapshot", '$.expectedVersion') = 'integer'
            AND json_extract("command_snapshot", '$.expectedVersion') >= 0
            AND json_type("command_snapshot", '$.target') IN ('null', 'object')
            AND json_remove("command_snapshot", '$.kind', '$.expectedHeadID', '$.expectedVersion', '$.target') = '{}'
            AND (
              json_type("command_snapshot", '$.target') = 'null'
              OR (
                json_type("command_snapshot", '$.target.courseID') = 'text'
                AND json_extract("command_snapshot", '$.target.courseID') GLOB 'crs_[0-9A-Za-z]*'
                AND length(json_extract("command_snapshot", '$.target.courseID')) = 30
                AND json_type("command_snapshot", '$.target.courseVersion') = 'integer'
                AND json_extract("command_snapshot", '$.target.courseVersion') >= 0
                AND json_type("command_snapshot", '$.target.selectionRevisionID') IN ('null', 'text')
                AND json_type("command_snapshot", '$.target.selectionVersion') = 'integer'
                AND json_extract("command_snapshot", '$.target.selectionVersion') >= 0
                AND json_type("command_snapshot", '$.target.viewID') IN ('null', 'text')
                AND json_type("command_snapshot", '$.target.viewVersion') IN ('null', 'integer')
                AND json_type("command_snapshot", '$.target.revisionVersion') IN ('null', 'integer')
                AND json_remove(
                  json_extract("command_snapshot", '$.target'),
                  '$.courseID',
                  '$.courseVersion',
                  '$.selectionRevisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
              )
            )
          )
              ) OR (
                "disposition" = 'semantic_terminal_v3'
                AND "authorization_version" IS NULL
                AND "authorization_kind" IS NULL
                AND "authorization_fingerprint" IS NULL
                AND "agent_action_version" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                AND json_valid("command_snapshot")
                AND (
            json_type("command_snapshot") = 'object'
            AND (
              (
                json_extract("command_snapshot", '$.action') = 'clear'
                AND json_remove("command_snapshot", '$.action') = '{}'
              )
              OR (
                json_extract("command_snapshot", '$.action') = 'set'
                AND json_type("command_snapshot", '$.courseID') = 'text'
                AND json_extract("command_snapshot", '$.courseID') GLOB 'crs_[0-9A-Za-z]*'
                AND length(json_extract("command_snapshot", '$.courseID')) = 30
                AND json_remove("command_snapshot", '$.action', '$.courseID') = '{}'
              )
            )
          )
                AND json_valid("semantic_address")
                AND json_extract("semantic_address", '$.slot') = 'default_course_preference'
                AND "semantic_address_fingerprint" IS NOT NULL
                AND "incoming_payload_fingerprint" IS NOT NULL
                AND "existing_effect_id" IS NOT NULL
                AND "existing_payload_fingerprint" IS NOT NULL
                AND "legacy_row_class" IS NULL
                AND "confirmation_availability" IS NULL
                AND "command_permission_request_id" IS NULL
                AND "effect_confirmation_request_id" IS NULL
                AND "legacy_effect_id" IS NULL
                AND "legacy_receipt_id" IS NULL
                AND "source_excerpt" IS NULL
                AND "resolution_scope" IS NULL
                AND "resolution_fingerprint" IS NULL
                AND "preference_head_id" IS NULL
                AND "preference_version" IS NULL
                AND "operation" IS NULL
                AND "from_locator" IS NULL
                AND "to_locator" IS NULL
                AND "selected_course_id" IS NULL
                AND "proposal_part_id" IS NULL
                AND "proposal_presentation_part_id" IS NULL
                AND "proposal_presentation_assistant_message_id" IS NULL
                AND "proposal_assistant_message_id" IS NULL
                AND "proposal_emission_ordinal" IS NULL
                AND "proposal_fingerprint" IS NULL
                AND "proposal_selection" IS NULL
              ) OR (
                "disposition" = 'candidate_v2'
                AND "authorization_version" = 2
                AND "authorization_kind" IN ('direct_request_v2', 'accepted_proposal_v2')
                AND "authorization_fingerprint" IS NOT NULL
                AND "agent_action_version" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "semantic_outcome" IS NULL
                AND "semantic_address" IS NULL
                AND "semantic_address_fingerprint" IS NULL
                AND "incoming_payload_fingerprint" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_payload_fingerprint" IS NULL
                AND "legacy_row_class" IS NULL
                AND "confirmation_availability" IS NULL
                AND "command_permission_request_id" IS NULL
                AND "effect_confirmation_request_id" IS NULL
                AND "legacy_effect_id" IS NULL
                AND "legacy_receipt_id" IS NULL
                AND json_valid("command_snapshot")
                AND (
            json_type("command_snapshot") = 'object'
            AND json_extract("command_snapshot", '$.kind') = 'default_course_preference'
            AND json_type("command_snapshot", '$.expectedHeadID') IN ('null', 'text')
            AND json_type("command_snapshot", '$.expectedVersion') = 'integer'
            AND json_extract("command_snapshot", '$.expectedVersion') >= 0
            AND json_type("command_snapshot", '$.target') IN ('null', 'object')
            AND json_remove("command_snapshot", '$.kind', '$.expectedHeadID', '$.expectedVersion', '$.target') = '{}'
            AND (
              json_type("command_snapshot", '$.target') = 'null'
              OR (
                json_type("command_snapshot", '$.target.courseID') = 'text'
                AND json_extract("command_snapshot", '$.target.courseID') GLOB 'crs_[0-9A-Za-z]*'
                AND length(json_extract("command_snapshot", '$.target.courseID')) = 30
                AND json_type("command_snapshot", '$.target.courseVersion') = 'integer'
                AND json_extract("command_snapshot", '$.target.courseVersion') >= 0
                AND json_type("command_snapshot", '$.target.selectionRevisionID') IN ('null', 'text')
                AND json_type("command_snapshot", '$.target.selectionVersion') = 'integer'
                AND json_extract("command_snapshot", '$.target.selectionVersion') >= 0
                AND json_type("command_snapshot", '$.target.viewID') IN ('null', 'text')
                AND json_type("command_snapshot", '$.target.viewVersion') IN ('null', 'integer')
                AND json_type("command_snapshot", '$.target.revisionVersion') IN ('null', 'integer')
                AND json_remove(
                  json_extract("command_snapshot", '$.target'),
                  '$.courseID',
                  '$.courseVersion',
                  '$.selectionRevisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
              )
            )
          )
                AND length("source_excerpt") > 0
                AND json_valid("resolution_scope")
                AND "resolution_fingerprint" IS NOT NULL
                AND "preference_version" IS NOT NULL
                AND (("preference_version" = 0 AND "preference_head_id" IS NULL)
                  OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL))
                AND "operation" IN ('set', 'change', 'clear')
                AND json_valid("from_locator")
                AND json_valid("to_locator")
                AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                AND (
                  (
                    "authorization_kind" = 'direct_request_v2'
                    AND json_extract("resolution_scope", '$.coverage') = 'complete'
                    AND "proposal_part_id" IS NULL
                    AND "proposal_presentation_part_id" IS NULL
                    AND "proposal_presentation_assistant_message_id" IS NULL
                    AND "proposal_assistant_message_id" IS NULL
                    AND "proposal_emission_ordinal" IS NULL
                    AND "proposal_fingerprint" IS NULL
                    AND "proposal_selection" IS NULL
                  )
                  OR
                  (
                    "authorization_kind" = 'accepted_proposal_v2'
                    AND "proposal_part_id" IS NOT NULL
                    AND "proposal_presentation_part_id" IS NOT NULL
                    AND "proposal_presentation_assistant_message_id" IS NOT NULL
                    AND "proposal_assistant_message_id" IS NOT NULL
                    AND "proposal_emission_ordinal" IS NOT NULL
                    AND "proposal_emission_ordinal" >= 0
                    AND "proposal_fingerprint" IS NOT NULL
                    AND "proposal_selection" IN ('sole_presented', 'explicit_reference')
                  )
                )
              ) OR (
                "disposition" = 'agent_action_v3'
                AND "authorization_version" IS NULL
                AND "authorization_kind" IS NULL
                AND "authorization_fingerprint" IS NULL
                AND "agent_action_version" = 3
                AND "agent_action_fingerprint" IS NOT NULL
                AND json_valid("agent_action_provenance")
                AND json_extract("agent_action_provenance", '$.schemaVersion') = 1
                AND json_extract("agent_action_provenance", '$.kind') IN ('root', 'delegated')
                AND json_extract("agent_action_provenance", '$.capabilityIdentity') = 'set_default_course_preference'
                AND json_extract("agent_action_provenance", '$.capabilityVersion') = 3
                AND json_type("agent_action_provenance", '$.lineage') = 'array'
                AND (
                  (
                    json_extract("agent_action_provenance", '$.kind') = 'root'
                    AND json_array_length("agent_action_provenance", '$.lineage') = 0
                  )
                  OR (
                    json_extract("agent_action_provenance", '$.kind') = 'delegated'
                    AND json_array_length("agent_action_provenance", '$.lineage') > 0
                  )
                )
                AND "semantic_outcome" IS NULL
                AND "semantic_address" IS NULL
                AND "semantic_address_fingerprint" IS NULL
                AND "incoming_payload_fingerprint" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_payload_fingerprint" IS NULL
                AND "legacy_row_class" IS NULL
                AND "confirmation_availability" IS NULL
                AND "command_permission_request_id" IS NULL
                AND "effect_confirmation_request_id" IS NULL
                AND "legacy_effect_id" IS NULL
                AND "legacy_receipt_id" IS NULL
                AND json_valid("command_snapshot")
                AND "source_excerpt" IS NULL
                AND "resolution_scope" IS NULL
                AND "resolution_fingerprint" IS NULL
                AND "preference_version" IS NOT NULL
                AND (("preference_version" = 0 AND "preference_head_id" IS NULL)
                  OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL))
                AND "operation" IN ('set', 'change', 'clear')
                AND json_valid("from_locator")
                AND json_valid("to_locator")
                AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                AND (
            json_type("command_snapshot") = 'object'
            AND (
              (
                json_extract("command_snapshot", '$.action') = 'clear'
                AND json_remove("command_snapshot", '$.action') = '{}'
              )
              OR (
                json_extract("command_snapshot", '$.action') = 'set'
                AND json_type("command_snapshot", '$.courseID') = 'text'
                AND json_extract("command_snapshot", '$.courseID') GLOB 'crs_[0-9A-Za-z]*'
                AND length(json_extract("command_snapshot", '$.courseID')) = 30
                AND json_remove("command_snapshot", '$.action', '$.courseID') = '{}'
              )
            )
          )
                AND "selected_course_id" IS NULL
                AND (
                  (
                    json_extract("command_snapshot", '$.action') = 'clear'
                    AND json_extract("to_locator", '$.kind') = 'absent'
                  )
                  OR (
                    json_extract("command_snapshot", '$.action') = 'set'
                    AND json_extract("to_locator", '$.kind') = 'course'
                    AND json_extract("command_snapshot", '$.courseID') =
                      json_extract("to_locator", '$.locator.courseID')
                  )
                )
                AND "proposal_part_id" IS NULL
                AND "proposal_presentation_part_id" IS NULL
                AND "proposal_presentation_assistant_message_id" IS NULL
                AND "proposal_assistant_message_id" IS NULL
                AND "proposal_emission_ordinal" IS NULL
                AND "proposal_fingerprint" IS NULL
                AND "proposal_selection" IS NULL
              )),
          CONSTRAINT "learner_default_course_disposition_time" CHECK("time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_proposal\` (
          \`part_id\` text PRIMARY KEY,
          \`turn_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`call_id\` text NOT NULL,
          \`emission_ordinal\` integer NOT NULL,
          \`command_snapshot\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`resolution_scope\` text NOT NULL,
          \`resolution_fingerprint\` text NOT NULL,
          \`preference_head_id\` text,
          \`preference_version\` integer NOT NULL,
          \`operation\` text NOT NULL,
          \`from_locator\` text NOT NULL,
          \`to_locator\` text NOT NULL,
          \`proposal_fingerprint\` text NOT NULL,
          \`terminal_part_fingerprint\` text NOT NULL,
          \`time_presented\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_proposal_turn_id_part_id_assistant_message_id_turn_tool_candidate_turn_id_part_id_assistant_message_id_fk\` FOREIGN KEY (\`turn_id\`,\`part_id\`,\`assistant_message_id\`) REFERENCES \`turn_tool_candidate\`(\`turn_id\`,\`part_id\`,\`assistant_message_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_proposal_part_id_turn_candidate_presentation_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`turn_candidate_presentation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_default_course_proposal_assistant_emission_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learner_default_course_proposal_fingerprints" CHECK(length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("resolution_fingerprint") = 64 AND "resolution_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("proposal_fingerprint") = 64 AND "proposal_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("terminal_part_fingerprint") = 64 AND "terminal_part_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_default_course_proposal_json" CHECK(json_valid("command_snapshot") AND json_valid("resolution_scope") AND json_valid("from_locator") AND json_valid("to_locator") AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0) AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)),
          CONSTRAINT "learner_default_course_proposal_head" CHECK(("preference_version" = 0 AND "preference_head_id" IS NULL) OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL)),
          CONSTRAINT "learner_default_course_proposal_operation" CHECK("operation" IN ('set', 'change', 'clear')),
          CONSTRAINT "learner_default_course_proposal_time_order" CHECK("emission_ordinal" >= 0 AND "time_presented" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_response_evidence_capability_issue\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_response_evidence_capability_issue_invocation_part_id_learner_response_evidence_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_response_evidence_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`learner_response_evidence_capability_issue_exact\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "learner_response_evidence_capability_issue_shape" CHECK(length("agent_action_fingerprint") = 64 AND length("policy_fingerprint") = 64
                AND length("shown_scope_fingerprint") = 64 AND json_valid("policy_basis")
                AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_response_evidence_capability_settlement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`agent_action_fingerprint\` text NOT NULL,
          \`basis\` text,
          \`basis_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_response_evidence_capability_settlement_invocation_part_id_learner_response_evidence_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_response_evidence_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_learner_response_evidence_capability_settlement_invocation_part_id_permission_request_id_learner_response_evidence_capability_issue_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`learner_response_evidence_capability_issue\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_response_evidence_capability_settlement_shape" CHECK(length("agent_action_fingerprint") = 64
                AND ("basis_fingerprint" IS NULL OR length("basis_fingerprint") = 64)
                AND "time_settled" >= 0 AND "settlement_order" >= 0
                AND (("outcome" = 'not_evaluated' AND "permission_request_id" IS NULL AND "basis" IS NULL)
                  OR ("outcome" IN ('policy_allow', 'policy_deny') AND "permission_request_id" IS NULL AND json_valid("basis"))
                  OR ("outcome" = 'prompted_abort' AND "permission_request_id" IS NOT NULL AND "basis" IS NULL)
                  OR ("outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
                    AND "permission_request_id" IS NOT NULL AND json_valid("basis"))))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_response_evidence_commit_seal\` (
          \`revision_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL UNIQUE,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          CONSTRAINT \`fk_learner_response_evidence_commit_seal_revision_id_learner_response_evidence_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_response_evidence_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_response_evidence_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`semantic_address_fingerprint\` text NOT NULL,
          \`semantic_outcome\` text,
          \`existing_record_id\` text,
          \`existing_revision_id\` text,
          \`existing_assessment_fingerprint\` text,
          \`agent_action_fingerprint\` text,
          \`agent_action\` text,
          \`materialized_candidate\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_learner_response_evidence_disposition_existing_record_id_learner_response_evidence_record_id_fk\` FOREIGN KEY (\`existing_record_id\`) REFERENCES \`learner_response_evidence_record\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_disposition_existing_revision_id_learner_response_evidence_revision_id_fk\` FOREIGN KEY (\`existing_revision_id\`) REFERENCES \`learner_response_evidence_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_disposition_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_response_evidence_disposition_fingerprints" CHECK(length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("semantic_address_fingerprint") = 64 AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("existing_assessment_fingerprint" IS NULL OR (length("existing_assessment_fingerprint") = 64 AND "existing_assessment_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("agent_action_fingerprint" IS NULL OR (length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_response_evidence_disposition_closed" CHECK(("disposition" = 'candidate_v1'
                  AND "semantic_outcome" IS NULL AND "existing_record_id" IS NULL
                  AND "existing_revision_id" IS NULL AND "existing_assessment_fingerprint" IS NULL
                  AND "agent_action_fingerprint" IS NOT NULL
                  AND json_valid("agent_action") AND json_valid("materialized_candidate"))
                OR ("disposition" = 'semantic_terminal_v1'
                  AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                  AND "existing_record_id" IS NOT NULL AND "existing_revision_id" IS NOT NULL
                  AND "existing_assessment_fingerprint" IS NOT NULL
                  AND "agent_action_fingerprint" IS NULL AND "agent_action" IS NULL
                  AND "materialized_candidate" IS NULL)),
          CONSTRAINT "learner_response_evidence_disposition_shape" CHECK(json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND "time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_response_evidence_record\` (
          \`id\` text PRIMARY KEY,
          \`subject_occurrence_id\` text NOT NULL,
          \`subject_source_order\` integer NOT NULL,
          \`subject_session_id\` text NOT NULL,
          \`subject_message_id\` text NOT NULL,
          \`subject_turn_id\` text NOT NULL,
          \`subject_input_id\` text NOT NULL,
          \`subject_time_admitted\` integer NOT NULL,
          \`map_id\` text NOT NULL,
          \`selector_id\` text NOT NULL,
          \`course_id\` text NOT NULL,
          \`view_id\` text NOT NULL,
          \`course_revision_id\` text NOT NULL,
          \`course_item_id\` text NOT NULL,
          \`admission_alignment_id\` text NOT NULL,
          \`alignment_disposition_version\` integer NOT NULL,
          \`map_disposition_version\` integer NOT NULL,
          \`course_version\` integer NOT NULL,
          \`view_version\` integer NOT NULL,
          \`course_revision_version\` integer NOT NULL,
          \`condition_session_id\` text NOT NULL,
          \`condition_turn_id\` text NOT NULL,
          \`condition_assistant_message_id\` text NOT NULL,
          \`condition_time_settled\` integer NOT NULL,
          \`current_revision_id\` text NOT NULL CONSTRAINT \`learner_response_evidence_current_revision_unique\` UNIQUE,
          \`current_version\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_learner_response_evidence_record_current_revision_id_learner_response_evidence_revision_id_fk\` FOREIGN KEY (\`current_revision_id\`) REFERENCES \`learner_response_evidence_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_record_subject_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`subject_occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_record_map_id_selector_id_material_selector_map_id_id_fk\` FOREIGN KEY (\`map_id\`,\`selector_id\`) REFERENCES \`material_selector\`(\`map_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_record_course_id_view_id_course_revision_id_course_item_id_course_view_revision_item_course_id_view_id_revision_id_item_id_fk\` FOREIGN KEY (\`course_id\`,\`view_id\`,\`course_revision_id\`,\`course_item_id\`) REFERENCES \`course_view_revision_item\`(\`course_id\`,\`view_id\`,\`revision_id\`,\`item_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_record_admission_alignment_id_material_course_alignment_id_fk\` FOREIGN KEY (\`admission_alignment_id\`) REFERENCES \`material_course_alignment\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_response_evidence_semantic_address_unique\` UNIQUE(\`subject_occurrence_id\`,\`map_id\`,\`selector_id\`,\`course_id\`,\`view_id\`,\`course_revision_id\`,\`course_item_id\`),
          CONSTRAINT "learner_response_evidence_record_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'lre_' AND "subject_source_order" > 0
                AND "subject_time_admitted" >= 0 AND "alignment_disposition_version" >= 0
                AND "map_disposition_version" >= 0 AND "course_version" >= 0
                AND "view_version" >= 0 AND "course_revision_version" >= 0
                AND "condition_time_settled" >= 0 AND "condition_time_settled" <= "subject_time_admitted"
                AND "condition_turn_id" <> "subject_turn_id"
                AND "current_version" >= 0 AND "time_created" >= "subject_time_admitted"),
          CONSTRAINT "learner_response_evidence_record_locators" CHECK(length("subject_session_id") > 0 AND length("subject_message_id") > 0
                AND length("subject_turn_id") > 0 AND length("subject_input_id") > 0
                AND length("condition_session_id") > 0 AND length("condition_turn_id") > 0
                AND length("condition_assistant_message_id") > 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_response_evidence_revision\` (
          \`id\` text PRIMARY KEY,
          \`commit_seal_id\` text NOT NULL,
          \`record_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`predecessor_revision_id\` text CONSTRAINT \`learner_response_evidence_revision_predecessor_unique\` UNIQUE,
          \`operation\` text NOT NULL,
          \`relation\` text NOT NULL,
          \`exposure\` text NOT NULL,
          \`basis\` text NOT NULL,
          \`disposition\` text NOT NULL,
          \`basis_occurrence_id\` text NOT NULL,
          \`basis_source_order\` integer NOT NULL,
          \`basis_session_id\` text NOT NULL,
          \`basis_message_id\` text NOT NULL,
          \`basis_turn_id\` text NOT NULL,
          \`basis_input_id\` text NOT NULL,
          \`basis_time_admitted\` integer NOT NULL,
          \`command_cause_occurrence_id\` text NOT NULL,
          \`command_cause_source_order\` integer NOT NULL,
          \`command_cause_session_id\` text NOT NULL,
          \`command_cause_message_id\` text NOT NULL,
          \`command_cause_turn_id\` text NOT NULL,
          \`command_cause_input_id\` text NOT NULL,
          \`command_cause_time_admitted\` integer NOT NULL,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL UNIQUE,
          \`frontier_time\` integer NOT NULL,
          CONSTRAINT \`fk_learner_response_evidence_revision_commit_seal_id_learner_response_evidence_commit_seal_revision_id_fk\` FOREIGN KEY (\`commit_seal_id\`) REFERENCES \`learner_response_evidence_commit_seal\`(\`revision_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_revision_record_id_learner_response_evidence_record_id_fk\` FOREIGN KEY (\`record_id\`) REFERENCES \`learner_response_evidence_record\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_revision_predecessor_revision_id_learner_response_evidence_revision_id_fk\` FOREIGN KEY (\`predecessor_revision_id\`) REFERENCES \`learner_response_evidence_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_revision_basis_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`basis_occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_revision_command_cause_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`command_cause_occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_response_evidence_revision_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_response_evidence_revision_version_unique\` UNIQUE(\`record_id\`,\`version\`),
          CONSTRAINT "learner_response_evidence_revision_seal" CHECK("commit_seal_id" = "id"),
          CONSTRAINT "learner_response_evidence_revision_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'lrr_' AND "version" >= 0
                AND "basis_source_order" > 0 AND "command_cause_source_order" > 0
                AND "basis_time_admitted" >= 0 AND "command_cause_time_admitted" >= 0
                AND "time_committed" >= 0 AND "commit_order" >= 0
                AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed"),
          CONSTRAINT "learner_response_evidence_revision_vocabulary" CHECK("relation" IN ('supports', 'does_not_support')
                AND "exposure" IN ('learner_response_before_tutor_disclosure', 'tutor_disclosure_before_learner_response')
                AND "basis" IN ('tutor_interpretation', 'learner_report')
                AND "disposition" IN ('active', 'retracted')
                AND "operation" IN ('create', 'revise_from_tutor_interpretation', 'revise_from_learner_report', 'retract')),
          CONSTRAINT "learner_response_evidence_revision_operation_matrix" CHECK(("operation" = 'create' AND "version" = 0 AND "predecessor_revision_id" IS NULL
                  AND "basis" = 'tutor_interpretation' AND "disposition" = 'active')
                OR ("operation" = 'revise_from_tutor_interpretation' AND "version" > 0
                  AND "predecessor_revision_id" IS NOT NULL AND "basis" = 'tutor_interpretation'
                  AND "disposition" = 'active')
                OR ("operation" = 'revise_from_learner_report' AND "version" > 0
                  AND "predecessor_revision_id" IS NOT NULL AND "basis" = 'learner_report'
                  AND "disposition" = 'active')
                OR ("operation" = 'retract' AND "version" > 0
                  AND "predecessor_revision_id" IS NOT NULL AND "disposition" = 'retracted')),
          CONSTRAINT "learner_response_evidence_revision_source_locators" CHECK(length("basis_session_id") > 0 AND length("basis_message_id") > 0
                AND length("basis_turn_id") > 0 AND length("basis_input_id") > 0
                AND length("command_cause_session_id") > 0 AND length("command_cause_message_id") > 0
                AND length("command_cause_turn_id") > 0 AND length("command_cause_input_id") > 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment_anchor\` (
          \`revision_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`ref_type\` text NOT NULL,
          \`ref_fingerprint\` text NOT NULL,
          \`binding\` text NOT NULL,
          \`first_bound_revision_id\` text NOT NULL,
          CONSTRAINT \`learner_state_judgment_anchor_pk\` PRIMARY KEY(\`revision_id\`, \`ordinal\`),
          CONSTRAINT \`fk_learner_state_judgment_anchor_revision_id_learner_state_judgment_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_state_judgment_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_anchor_first_bound_revision_id_learner_state_judgment_revision_id_fk\` FOREIGN KEY (\`first_bound_revision_id\`) REFERENCES \`learner_state_judgment_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_state_judgment_anchor_unique_ref\` UNIQUE(\`revision_id\`,\`ref_fingerprint\`),
          CONSTRAINT "learner_state_judgment_anchor_shape" CHECK("ordinal" BETWEEN 0 AND 7 AND length("ref_fingerprint") = 64
                AND "ref_fingerprint" NOT GLOB '*[^0-9a-f]*' AND json_valid("binding"))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment_basis\` (
          \`revision_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`ref_type\` text NOT NULL,
          \`ref_fingerprint\` text NOT NULL,
          \`binding\` text NOT NULL,
          \`first_bound_revision_id\` text NOT NULL,
          CONSTRAINT \`learner_state_judgment_basis_pk\` PRIMARY KEY(\`revision_id\`, \`ordinal\`),
          CONSTRAINT \`fk_learner_state_judgment_basis_revision_id_learner_state_judgment_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_state_judgment_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_basis_first_bound_revision_id_learner_state_judgment_revision_id_fk\` FOREIGN KEY (\`first_bound_revision_id\`) REFERENCES \`learner_state_judgment_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_state_judgment_basis_unique_ref\` UNIQUE(\`revision_id\`,\`ref_fingerprint\`),
          CONSTRAINT "learner_state_judgment_basis_shape" CHECK("ordinal" BETWEEN 0 AND 15 AND length("ref_fingerprint") = 64
                AND "ref_fingerprint" NOT GLOB '*[^0-9a-f]*' AND json_valid("binding"))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment_capability_issue\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_state_judgment_capability_issue_invocation_part_id_learner_state_judgment_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_state_judgment_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`learner_state_judgment_capability_issue_exact\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "learner_state_judgment_capability_issue_shape" CHECK(length("agent_action_fingerprint") = 64
                AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("policy_fingerprint") = 64
                AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("shown_scope_fingerprint") = 64
                AND "shown_scope_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND json_valid("policy_basis")
                AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment_capability_settlement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`agent_action_fingerprint\` text NOT NULL,
          \`basis\` text,
          \`basis_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_state_judgment_capability_settlement_invocation_part_id_learner_state_judgment_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_state_judgment_disposition\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_learner_state_judgment_capability_settlement_invocation_part_id_permission_request_id_learner_state_judgment_capability_issue_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`learner_state_judgment_capability_issue\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_state_judgment_capability_settlement_shape" CHECK(length("agent_action_fingerprint") = 64
                AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("basis_fingerprint" IS NULL OR (length("basis_fingerprint") = 64
                  AND "basis_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND "time_settled" >= 0 AND "settlement_order" >= 0
                AND (("outcome" = 'not_evaluated' AND "permission_request_id" IS NULL
                    AND "basis" IS NULL AND "basis_fingerprint" IS NULL)
                  OR ("outcome" IN ('policy_allow', 'policy_deny') AND "permission_request_id" IS NULL
                    AND json_valid("basis") AND "basis_fingerprint" IS NOT NULL)
                  OR ("outcome" = 'prompted_abort' AND "permission_request_id" IS NOT NULL
                    AND "basis" IS NULL AND "basis_fingerprint" IS NULL)
                  OR ("outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
                    AND "permission_request_id" IS NOT NULL AND json_valid("basis")
                    AND "basis_fingerprint" IS NOT NULL)))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`revision_id\` text NOT NULL UNIQUE,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`receipt_id\` text NOT NULL UNIQUE,
          \`time_sealed\` integer NOT NULL,
          \`seal_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_state_judgment_commit_seal_effect_id_learner_state_judgment_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_state_judgment_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_commit_seal_revision_id_learner_state_judgment_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_state_judgment_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_state_judgment_commit_seal_shape" CHECK("time_sealed" >= 0 AND "seal_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`semantic_address_fingerprint\` text NOT NULL,
          \`semantic_outcome\` text,
          \`existing_effect_id\` text,
          \`existing_no_change_part_id\` text,
          \`agent_action_fingerprint\` text,
          \`agent_action\` text,
          \`materialized_candidate\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_learner_state_judgment_disposition_existing_effect_id_learner_state_judgment_effect_id_fk\` FOREIGN KEY (\`existing_effect_id\`) REFERENCES \`learner_state_judgment_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_disposition_existing_no_change_part_id_learner_state_judgment_no_change_seal_invocation_part_id_fk\` FOREIGN KEY (\`existing_no_change_part_id\`) REFERENCES \`learner_state_judgment_no_change_seal\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_disposition_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_state_judgment_disposition_fingerprints" CHECK(length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("agent_action_fingerprint" IS NULL OR (length("agent_action_fingerprint") = 64
                  AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_state_judgment_disposition_closed" CHECK(("disposition" = 'candidate_v1' AND "semantic_outcome" IS NULL
                  AND "existing_effect_id" IS NULL AND "existing_no_change_part_id" IS NULL
                  AND "agent_action_fingerprint" IS NOT NULL
                  AND json_valid("agent_action") AND json_valid("materialized_candidate"))
                OR ("disposition" = 'semantic_terminal_v1'
                  AND "semantic_outcome" IN ('same_effect', 'same_no_change', 'semantic_conflict')
                  AND (("semantic_outcome" = 'same_effect'
                        AND "existing_effect_id" IS NOT NULL AND "existing_no_change_part_id" IS NULL)
                    OR ("semantic_outcome" = 'same_no_change'
                        AND "existing_effect_id" IS NULL AND "existing_no_change_part_id" IS NOT NULL)
                    OR ("semantic_outcome" = 'semantic_conflict'
                        AND (("existing_effect_id" IS NOT NULL AND "existing_no_change_part_id" IS NULL)
                          OR ("existing_effect_id" IS NULL AND "existing_no_change_part_id" IS NOT NULL))))
                  AND "agent_action_fingerprint" IS NULL AND "agent_action" IS NULL
                  AND "materialized_candidate" IS NULL)),
          CONSTRAINT "learner_state_judgment_disposition_shape" CHECK(json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND "time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment_effect\` (
          \`id\` text PRIMARY KEY,
          \`cause_type\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`model_operation_id\` text NOT NULL,
          \`semantic_slot\` text NOT NULL,
          \`semantic_address_fingerprint\` text NOT NULL UNIQUE,
          \`canonical_command\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`physical_receipt_id\` text NOT NULL UNIQUE,
          \`admission_projection\` text NOT NULL,
          \`result\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL UNIQUE,
          \`frontier_time\` integer NOT NULL,
          \`acknowledgement_title\` text NOT NULL,
          \`acknowledgement_body\` text NOT NULL,
          CONSTRAINT \`fk_learner_state_judgment_effect_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_effect_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_effect_physical_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`physical_receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_state_judgment_effect_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'lse_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "learner_state_judgment_effect_address" CHECK("semantic_slot" = 'learner_state_judgment_change'
                AND length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("command_fingerprint") = 64
                AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_state_judgment_effect_shape" CHECK(json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND json_valid("admission_projection") AND json_valid("result")
                AND "time_committed" >= 0 AND "commit_order" >= 0
                AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed"
                AND length("acknowledgement_title") > 0 AND length("acknowledgement_body") > 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment_no_change_seal\` (
          \`semantic_address_fingerprint\` text PRIMARY KEY,
          \`cause_type\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`model_operation_id\` text NOT NULL,
          \`semantic_slot\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL UNIQUE,
          \`invocation_status\` text NOT NULL,
          \`receipt_id\` text NOT NULL UNIQUE,
          \`materialized_candidate\` text NOT NULL,
          \`result\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_state_judgment_no_change_seal_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_no_change_seal_invocation_part_id_invocation_status_learning_command_invocation_part_id_status_fk\` FOREIGN KEY (\`invocation_part_id\`,\`invocation_status\`) REFERENCES \`learning_command_invocation\`(\`part_id\`,\`status\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_no_change_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_state_judgment_no_change_address" CHECK("semantic_slot" = 'learner_state_judgment_change'
                AND length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("command_fingerprint") = 64
                AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_state_judgment_no_change_shape" CHECK("invocation_status" = 'no_change'
                AND json_valid("canonical_command") AND json_extract("canonical_command", '$.schemaVersion') = 1
                AND json_valid("materialized_candidate") AND json_valid("result")
                AND "time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment_revision\` (
          \`id\` text PRIMARY KEY,
          \`judgment_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`predecessor_revision_id\` text,
          \`effect_id\` text NOT NULL UNIQUE,
          \`operation\` text NOT NULL,
          \`disposition\` text NOT NULL,
          \`snapshot\` text NOT NULL,
          \`subject_label\` text NOT NULL,
          \`scope_type\` text NOT NULL,
          \`anchor_count\` integer NOT NULL,
          \`judgment_body\` text NOT NULL,
          \`uncertainty_and_limits\` text,
          \`basis_scope\` text NOT NULL,
          \`basis_count\` integer NOT NULL,
          \`author_class\` text NOT NULL,
          \`author_and_cause\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL UNIQUE,
          CONSTRAINT \`fk_learner_state_judgment_revision_judgment_id_learner_state_judgment_id_fk\` FOREIGN KEY (\`judgment_id\`) REFERENCES \`learner_state_judgment\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_revision_predecessor_revision_id_learner_state_judgment_revision_id_fk\` FOREIGN KEY (\`predecessor_revision_id\`) REFERENCES \`learner_state_judgment_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_state_judgment_revision_effect_id_learner_state_judgment_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_state_judgment_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_state_judgment_revision_version\` UNIQUE(\`judgment_id\`,\`version\`),
          CONSTRAINT "learner_state_judgment_revision_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'lsr_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'
                AND "version" >= 1 AND "frontier_sequence" >= 1),
          CONSTRAINT "learner_state_judgment_revision_lineage" CHECK(("version" = 1 AND "predecessor_revision_id" IS NULL AND "operation" = 'create')
                OR ("version" > 1 AND "predecessor_revision_id" IS NOT NULL
                  AND "operation" IN ('revise', 'retire', 'restore'))),
          CONSTRAINT "learner_state_judgment_revision_shape" CHECK(json_valid("snapshot") AND json_valid("author_and_cause")
                AND "operation" IN ('create', 'revise', 'retire', 'restore')
                AND "disposition" IN ('active', 'retired')
                AND "scope_type" IN ('learner_home', 'anchored')
                AND (("scope_type" = 'learner_home' AND "anchor_count" = 0)
                  OR ("scope_type" = 'anchored' AND "anchor_count" BETWEEN 1 AND 8))
                AND "basis_count" BETWEEN 0 AND 16
                AND "basis_scope" = 'whole_judgment'
                AND length(CAST("subject_label" AS BLOB)) BETWEEN 1 AND 384
                AND length(CAST("judgment_body" AS BLOB)) BETWEEN 1 AND 4096
                AND ("uncertainty_and_limits" IS NULL
                  OR length(CAST("uncertainty_and_limits" AS BLOB)) BETWEEN 1 AND 1024)
                AND "time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_state_judgment\` (
          \`id\` text PRIMARY KEY,
          \`time_created\` integer NOT NULL,
          CONSTRAINT "learner_state_judgment_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'lsj_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*' AND "time_created" >= 0)
        ) WITHOUT ROWID;
      `)
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
          \`receipt_id\` text,
          \`settlement\` text,
          \`time_admitted\` integer NOT NULL,
          \`time_settled\` integer,
          \`settlement_order\` integer,
          \`turn_id\` text,
          \`input_id\` text,
          CONSTRAINT \`fk_learning_command_invocation_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_command_invocation_assistant_call_unique\` UNIQUE(\`assistant_message_id\`,\`provider_call_id\`),
          CONSTRAINT \`learning_command_invocation_assistant_ordinal_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learning_command_invocation_call_nonempty" CHECK(length("provider_call_id") > 0),
          CONSTRAINT "learning_command_invocation_command_nonempty" CHECK(length("command_name") > 0),
          CONSTRAINT "learning_command_invocation_command_version" CHECK("command_version" >= 1),
          CONSTRAINT "learning_command_invocation_emission_ordinal" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "learning_command_invocation_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_invocation_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_invocation_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance', 'agent_action')),
          CONSTRAINT "learning_command_invocation_fingerprint" CHECK(length("input_fingerprint") = 64 AND "input_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learning_command_invocation_status" CHECK("status" IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')),
          CONSTRAINT "learning_command_invocation_settlement_shape" CHECK(("status" = 'admitted' AND "receipt_id" IS NULL AND "settlement" IS NULL AND "time_settled" IS NULL AND "settlement_order" IS NULL) OR ("status" <> 'admitted' AND json_valid("settlement") AND json_type("settlement") = 'object' AND json_extract("settlement", '$.outcome') = "status" AND json_extract("settlement", '$.settlementTime') = "time_settled" AND json_extract("settlement", '$.settlementOrder') = "settlement_order")),
          CONSTRAINT "learning_command_invocation_receipt_shape" CHECK(("status" IN ('applied', 'already_applied') AND "receipt_id" IS NOT NULL AND length("receipt_id") > 0 AND json_extract("settlement", '$.receiptID') = "receipt_id") OR ("status" IN ('admitted', 'no_change', 'error') AND "receipt_id" IS NULL AND ("settlement" IS NULL OR json_extract("settlement", '$.receiptID') IS NULL))),
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
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learning_command_receipt_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_command_receipt_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_receipt_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_receipt_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance', 'agent_action')),
          CONSTRAINT "learning_command_receipt_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_learning_context_cut\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`canonical_cut\` text NOT NULL,
          \`canonical_bytes\` integer NOT NULL,
          \`cut_fingerprint\` text NOT NULL,
          \`cut_as_of\` integer NOT NULL,
          \`rendered_block\` text NOT NULL,
          \`rendered_bytes\` integer NOT NULL,
          \`rendered_fingerprint\` text NOT NULL,
          CONSTRAINT \`fk_turn_learning_context_cut_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_learning_context_cut_canonical_shape" CHECK(COALESCE((json_valid("canonical_cut")
                AND json_type("canonical_cut") = 'object'
                AND json_extract("canonical_cut", '$.schemaVersion') = 1
                AND ((json_extract("canonical_cut", '$.policyVersion') = 1
                    AND json_extract("canonical_cut", '$.rendererVersion') = 1)
                  OR (json_extract("canonical_cut", '$.policyVersion') = 2
                    AND json_extract("canonical_cut", '$.rendererVersion') = 2)
                  OR (json_extract("canonical_cut", '$.policyVersion') = 3
                    AND json_extract("canonical_cut", '$.rendererVersion') = 3)
                  OR (json_extract("canonical_cut", '$.policyVersion') = 4
                    AND json_extract("canonical_cut", '$.rendererVersion') = 4)
                  OR (json_extract("canonical_cut", '$.policyVersion') = 5
                    AND json_extract("canonical_cut", '$.rendererVersion') = 5)
                  OR (json_extract("canonical_cut", '$.policyVersion') = 6
                    AND json_extract("canonical_cut", '$.rendererVersion') = 6)
                  OR (json_extract("canonical_cut", '$.policyVersion') = 6
                    AND json_extract("canonical_cut", '$.rendererVersion') = 7))
                AND json_extract("canonical_cut", '$.operation.assistantMessageID') = "assistant_message_id"
                AND json_extract("canonical_cut", '$.cutAsOf') = "cut_as_of"
                AND json_extract("canonical_cut", '$.budget.canonicalBytes') = "canonical_bytes"
                AND json_extract("canonical_cut", '$.budget.renderedBytes') = "rendered_bytes"
                AND json_extract("canonical_cut", '$.fingerprint') = "cut_fingerprint"
                AND json_extract("canonical_cut", '$.renderedFingerprint') = "rendered_fingerprint"), FALSE)),
          CONSTRAINT "turn_learning_context_cut_bytes" CHECK("canonical_bytes" = length(CAST("canonical_cut" AS BLOB))
                AND "canonical_bytes" BETWEEN 1 AND 32768
                AND "rendered_bytes" = length(CAST("rendered_block" AS BLOB))
                AND "rendered_bytes" BETWEEN 1 AND 16384),
          CONSTRAINT "turn_learning_context_cut_fingerprints" CHECK(length("cut_fingerprint") = 64
                AND "cut_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("rendered_fingerprint") = 64
                AND "rendered_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "turn_learning_context_cut_time" CHECK("cut_as_of" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_model_capacity\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`canonical_assessment\` text NOT NULL,
          \`assessment_bytes\` integer NOT NULL,
          \`assessment_fingerprint\` text NOT NULL,
          \`envelope_fingerprint\` text NOT NULL,
          \`classification\` text NOT NULL,
          \`decision\` text NOT NULL,
          CONSTRAINT \`fk_turn_model_capacity_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_model_capacity_shape" CHECK(json_valid("canonical_assessment")
                AND json_type("canonical_assessment") = 'object'
                AND json_extract("canonical_assessment", '$.schemaVersion') = 1
                AND json_extract("canonical_assessment", '$.assistantMessageID') = "assistant_message_id"
                AND json_extract("canonical_assessment", '$.fingerprint') = "assessment_fingerprint"
                AND json_extract("canonical_assessment", '$.envelopeFingerprint') = "envelope_fingerprint"
                AND json_extract("canonical_assessment", '$.classification') = "classification"
                AND json_extract("canonical_assessment", '$.decision') = "decision"),
          CONSTRAINT "turn_model_capacity_bytes" CHECK("assessment_bytes" = length(CAST("canonical_assessment" AS BLOB))
                AND "assessment_bytes" > 0),
          CONSTRAINT "turn_model_capacity_fingerprints" CHECK(length("assessment_fingerprint") = 64
                AND "assessment_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("envelope_fingerprint") = 64
                AND "envelope_fingerprint" NOT GLOB '*[^0-9a-f]*')
        ) WITHOUT ROWID;
      `)
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
        CREATE TABLE \`representation_command_commit_seal\` (
          \`effect_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL CONSTRAINT \`representation_command_commit_seal_receipt_unique\` UNIQUE,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`representation_command_commit_seal_invocation_unique\` UNIQUE,
          CONSTRAINT \`fk_representation_command_commit_seal_effect_id_representation_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`representation_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_command_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_representation_command_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT
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
          CONSTRAINT "representation_revision_source_shape" CHECK(length("source_media_type") > 0 AND length("source_digest") = 64 AND "source_digest" NOT GLOB '*[^0-9a-f]*' AND "source_byte_length" >= 0 AND length("normalized_relative_path") > 0 AND "source_object_platform" = 'windows_ntfs' AND "source_object_verifier_version" >= 1 AND length("source_object_canonical_path") > 0 AND length("source_object_canonical_path_key") > 0 AND length("source_object_volume_serial") > 0 AND length("source_object_id") = 32 AND length("source_object_creation_time") > 0 AND length("source_object_change_time") > 0 AND length("source_object_last_write_time") > 0 AND "source_object_size" >= 0 AND "source_object_size" = "source_byte_length" AND "source_object_kind" = 'file' AND "source_observed_time" >= 0),
          CONSTRAINT "representation_revision_input_shape" CHECK(length("presented_input_digest") = 64 AND "presented_input_digest" NOT GLOB '*[^0-9a-f]*' AND "presented_input_byte_length" >= 0 AND "presented_input_digest" = "source_digest" AND "presented_input_byte_length" = "source_byte_length"),
          CONSTRAINT "representation_revision_producer_shape" CHECK(length("producer_identity") > 0 AND length("producer_version") > 0 AND "task_version" >= 1 AND "canonicalizer_version" >= 1 AND "provenance_version" >= 1 AND length("run_identity") > 0 AND json_valid("provenance") AND json_type("provenance") = 'object' AND json_valid("diagnostics") AND json_type("diagnostics") = 'array' AND json_valid("usage") AND json_type("usage") = 'object' AND (("producer_kind" = 'local_pdf' AND "provider_id" IS NULL AND "model_id" IS NULL AND "profile_variant" IS NULL AND "profile" = 'repa.pdf-text.v1' AND "result_boundary" = 'framed_stdout_v1' AND "terminal_status" = 'completed' AND "acceptance_basis" = 'mechanical_profile') OR ("producer_kind" = 'configured_model' AND "provider_id" IS NOT NULL AND length("provider_id") > 0 AND "model_id" IS NOT NULL AND length("model_id") > 0 AND "profile" = 'repa.model-rendition.v1' AND "result_boundary" = 'model_schema_v1' AND "terminal_status" = 'stop' AND "acceptance_basis" = 'model_claimed_rendition'))),
          CONSTRAINT "representation_revision_output_shape" CHECK(length("output_media_type") > 0 AND length("storage_key") > 0 AND length("output_digest") = 64 AND "output_digest" NOT GLOB '*[^0-9a-f]*' AND "output_byte_length" > 0 AND "profile_record_count" >= 1),
          CONSTRAINT "representation_revision_creation_shape" CHECK("creation_basis" IN ('deterministic_operation', 'learning_command') AND length("creation_identity") > 0 AND "authorization_intent" = 'persistent_readable_access' AND length("authorization_basis") > 0 AND (("creation_basis" = 'deterministic_operation' AND "delivery_mode" = 'deterministic' AND "causal_occurrence_id" IS NULL AND "causal_invocation_part_id" IS NULL) OR ("creation_basis" = 'learning_command' AND "delivery_mode" = 'model_tool' AND "causal_occurrence_id" IS NOT NULL AND length("causal_occurrence_id") > 0 AND "causal_invocation_part_id" IS NOT NULL AND length("causal_invocation_part_id") > 0)) AND "time_accepted" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`retained_steering_command\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`semantic_fingerprint\` text NOT NULL,
          CONSTRAINT \`fk_retained_steering_command_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "retained_steering_command_fingerprint" CHECK(length("semantic_fingerprint") = 64 AND "semantic_fingerprint" NOT GLOB '*[^0-9a-f]*')
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`retained_steering_commit_seal\` (
          \`transition_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL CONSTRAINT \`retained_steering_commit_seal_receipt_unique\` UNIQUE,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`retained_steering_commit_seal_invocation_unique\` UNIQUE,
          CONSTRAINT \`fk_retained_steering_commit_seal_transition_id_retained_steering_transition_id_fk\` FOREIGN KEY (\`transition_id\`) REFERENCES \`retained_steering_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_retained_steering_commit_seal_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_retained_steering_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`retained_steering_policy\` (
          \`id\` text PRIMARY KEY,
          \`time_created\` integer NOT NULL,
          CONSTRAINT "retained_steering_policy_time_nonnegative" CHECK("time_created" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`retained_steering_state\` (
          \`singleton\` integer PRIMARY KEY DEFAULT 1,
          \`steering_revision\` integer DEFAULT 0 NOT NULL,
          \`latest_cut_as_of\` integer DEFAULT 0 NOT NULL,
          CONSTRAINT "retained_steering_state_singleton" CHECK("singleton" = 1),
          CONSTRAINT "retained_steering_state_nonnegative" CHECK("steering_revision" >= 0 AND "latest_cut_as_of" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`retained_steering_transition\` (
          \`id\` text PRIMARY KEY,
          \`commit_seal_id\` text NOT NULL,
          \`policy_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`predecessor_id\` text CONSTRAINT \`retained_steering_predecessor_unique\` UNIQUE,
          \`previous_state\` text NOT NULL,
          \`occurrence_id\` text NOT NULL CONSTRAINT \`retained_steering_occurrence_unique\` UNIQUE,
          \`source_order\` integer NOT NULL CONSTRAINT \`retained_steering_source_order_unique\` UNIQUE,
          \`state\` text NOT NULL,
          \`scope\` text NOT NULL,
          \`source_excerpt\` text NOT NULL,
          \`operative_instruction\` text,
          \`learner_reason\` text,
          \`effective_from\` integer,
          \`valid_until\` integer,
          \`valid_until_source\` text,
          \`valid_until_normalized\` text,
          \`boundary_timezone\` text,
          \`boundary_utc_offset_minutes\` integer,
          \`semantic_fingerprint\` text NOT NULL,
          \`steering_revision\` integer NOT NULL CONSTRAINT \`retained_steering_revision_unique\` UNIQUE,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL CONSTRAINT \`retained_steering_frontier_unique\` UNIQUE,
          \`frontier_time\` integer NOT NULL,
          \`acknowledgement_title\` text NOT NULL,
          \`acknowledgement_body\` text NOT NULL,
          CONSTRAINT \`fk_retained_steering_transition_commit_seal_id_retained_steering_commit_seal_transition_id_fk\` FOREIGN KEY (\`commit_seal_id\`) REFERENCES \`retained_steering_commit_seal\`(\`transition_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_retained_steering_transition_policy_id_retained_steering_policy_id_fk\` FOREIGN KEY (\`policy_id\`) REFERENCES \`retained_steering_policy\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_retained_steering_transition_predecessor_id_retained_steering_transition_id_fk\` FOREIGN KEY (\`predecessor_id\`) REFERENCES \`retained_steering_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_retained_steering_transition_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`retained_steering_policy_version_unique\` UNIQUE(\`policy_id\`,\`version\`),
          CONSTRAINT "retained_steering_commit_seal_identity" CHECK("commit_seal_id" = "id"),
          CONSTRAINT "retained_steering_chain_shape" CHECK(("version" = 1 AND "predecessor_id" IS NULL AND "previous_state" = 'absent') OR ("version" > 1 AND "predecessor_id" IS NOT NULL AND "previous_state" IN ('operative', 'retracted'))),
          CONSTRAINT "retained_steering_state" CHECK("state" IN ('operative', 'retracted')),
          CONSTRAINT "retained_steering_scope" CHECK("scope" = 'learning_wide'),
          CONSTRAINT "retained_steering_result_shape" CHECK(COALESCE(("state" = 'operative' AND "operative_instruction" IS NOT NULL AND length("operative_instruction") > 0 AND "effective_from" IS NOT NULL AND "valid_until" IS NOT NULL AND "valid_until_source" IS NOT NULL AND length("valid_until_source") > 0 AND "valid_until_normalized" IS NOT NULL AND length("valid_until_normalized") > 0 AND "boundary_timezone" IS NOT NULL AND length("boundary_timezone") > 0 AND "boundary_utc_offset_minutes" IS NOT NULL AND "boundary_utc_offset_minutes" BETWEEN -840 AND 840 AND "valid_until" > "effective_from") OR ("state" = 'retracted' AND "operative_instruction" IS NULL AND "effective_from" IS NULL AND "valid_until" IS NULL AND "valid_until_source" IS NULL AND "valid_until_normalized" IS NULL AND "boundary_timezone" IS NULL AND "boundary_utc_offset_minutes" IS NULL), 0)),
          CONSTRAINT "retained_steering_source_excerpt" CHECK(length("source_excerpt") > 0),
          CONSTRAINT "retained_steering_fingerprint" CHECK(length("semantic_fingerprint") = 64 AND "semantic_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "retained_steering_time_order" CHECK("version" >= 1 AND "source_order" >= 1 AND "steering_revision" >= 1 AND "time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed"),
          CONSTRAINT "retained_steering_acknowledgement" CHECK(length("acknowledgement_title") > 0 AND length("acknowledgement_body") > 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`message\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          \`summary_diffs\` text,
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
          \`retained_steering_cut\` text,
          \`retained_steering_cut_fingerprint\` text,
          \`retained_steering_cut_as_of\` integer,
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
          CONSTRAINT "turn_model_retained_steering_cut_shape" CHECK(("retained_steering_cut" IS NULL AND "retained_steering_cut_fingerprint" IS NULL AND "retained_steering_cut_as_of" IS NULL) OR ("retained_steering_cut" IS NOT NULL AND json_valid("retained_steering_cut") AND "retained_steering_cut_fingerprint" IS NOT NULL AND length("retained_steering_cut_fingerprint") = 64 AND "retained_steering_cut_fingerprint" NOT GLOB '*[^0-9a-f]*' AND "retained_steering_cut_as_of" IS NOT NULL AND "retained_steering_cut_as_of" = "time_admitted" AND "retained_steering_cut_as_of" >= "observed_shared_frontier_time")),
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
        CREATE TABLE \`turn_model_source_retention\` (
          \`owner\` text NOT NULL,
          \`owner_reference_id\` text NOT NULL,
          \`source_turn_id\` text NOT NULL,
          \`source_assistant_message_id\` text NOT NULL,
          \`source_time_settled\` integer NOT NULL,
          \`time_registered\` integer NOT NULL,
          CONSTRAINT \`turn_model_source_retention_pk\` PRIMARY KEY(\`owner\`, \`owner_reference_id\`),
          CONSTRAINT "turn_model_source_retention_shape" CHECK(length("owner") > 0 AND length("owner_reference_id") > 0
                AND length("source_turn_id") > 0 AND length("source_assistant_message_id") > 0
                AND "source_time_settled" >= 0 AND "time_registered" >= "source_time_settled")
        ) WITHOUT ROWID;
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
          \`future_attention_service_source\` text DEFAULT 'internal_control' NOT NULL,
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
          \`state\` text,
          \`time_settled\` integer,
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
        `CREATE INDEX \`learning_historical_tool_presentation_source_idx\` ON \`learning_historical_tool_presentation\` (\`source_session_id\`,\`source_part_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learning_occurrence_origin_once_idx\` ON \`learning_occurrence_presentation\` (\`occurrence_id\`) WHERE "learning_occurrence_presentation"."provenance" = 'origin';`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_occurrence_presentation_occurrence_idx\` ON \`learning_occurrence_presentation\` (\`occurrence_id\`,\`message_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`advisory_plan_suggestion_effect_learner_slot\` ON \`advisory_plan_suggestion_effect\` (\`occurrence_id\`,\`semantic_slot\`) WHERE "advisory_plan_suggestion_effect"."cause_type" = 'learner_revision';`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`advisory_plan_suggestion_effect_model_slot\` ON \`advisory_plan_suggestion_effect\` (\`model_operation_id\`,\`semantic_slot\`) WHERE "advisory_plan_suggestion_effect"."cause_type" IN ('responsive_tutor_proposal', 'proactive_tutor_proposal', 'tutor_revision');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`advisory_plan_suggestion_no_change_learner_slot\` ON \`advisory_plan_suggestion_no_change_seal\` (\`occurrence_id\`,\`semantic_slot\`) WHERE "advisory_plan_suggestion_no_change_seal"."cause_type" = 'learner_revision';`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`advisory_plan_suggestion_no_change_model_slot\` ON \`advisory_plan_suggestion_no_change_seal\` (\`model_operation_id\`,\`semantic_slot\`) WHERE "advisory_plan_suggestion_no_change_seal"."cause_type" IN ('responsive_tutor_proposal', 'proactive_tutor_proposal', 'tutor_revision');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`advisory_plan_suggestion_revision_one_successor\` ON \`advisory_plan_suggestion_revision\` (\`predecessor_revision_id\`) WHERE "advisory_plan_suggestion_revision"."predecessor_revision_id" IS NOT NULL;`,
      )
      yield* tx.run(
        `CREATE INDEX \`advisory_plan_suggestion_revision_head_idx\` ON \`advisory_plan_suggestion_revision\` (\`suggestion_id\`,\`version\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`advisory_plan_suggestion_creation_order_idx\` ON \`advisory_plan_suggestion\` (\`time_created\`,\`id\`);`,
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
        `CREATE UNIQUE INDEX \`assignment_effect_learner_address_unique\` ON \`assignment_effect\` (\`occurrence_id\`,\`semantic_slot\`) WHERE "assignment_effect"."cause_type" IN ('interpreted_learner_report', 'interpreted_learner_direction');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_effect_source_address_unique\` ON \`assignment_effect\` (\`source_revision_id\`,\`source_locator_digest\`,\`semantic_slot\`) WHERE "assignment_effect"."cause_type" IN ('interpreted_source_observation', 'interpreted_source_change');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_effect_correction_address_unique\` ON \`assignment_effect\` (\`model_operation_id\`,\`semantic_slot\`) WHERE "assignment_effect"."cause_type" = 'agent_correction';`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_no_change_learner_address_unique\` ON \`assignment_no_change_seal\` (\`occurrence_id\`,\`semantic_slot\`) WHERE "assignment_no_change_seal"."cause_type" IN ('interpreted_learner_report', 'interpreted_learner_direction');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_no_change_source_address_unique\` ON \`assignment_no_change_seal\` (\`source_revision_id\`,\`source_locator_digest\`,\`semantic_slot\`) WHERE "assignment_no_change_seal"."cause_type" IN ('interpreted_source_observation', 'interpreted_source_change');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_no_change_correction_address_unique\` ON \`assignment_no_change_seal\` (\`model_operation_id\`,\`semantic_slot\`) WHERE "assignment_no_change_seal"."cause_type" = 'agent_correction';`,
      )
      yield* tx.run(
        `CREATE INDEX \`assignment_revision_scope_course_idx\` ON \`assignment_revision_scope\` (\`course_id\`,\`revision_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`assignment_revision_history_idx\` ON \`assignment_revision\` (\`assignment_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`assignment_revision_head_idx\` ON \`assignment_revision\` (\`assignment_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`assignment_creation_order_idx\` ON \`assignment\` (\`time_created\`,\`id\`);`)
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
        `CREATE INDEX \`course_state_history_time_idx\` ON \`course_state_history\` (\`course_id\`,\`time_updated\`,\`version\`);`,
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
        `CREATE INDEX \`future_attention_claim_group_pending_idx\` ON \`future_attention_claim_group\` (\`time_admitted\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`future_attention_concern_target_idx\` ON \`future_attention_concern\` (\`course_id\`,\`view_id\`,\`course_revision_id\`,\`course_item_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`future_attention_concern_activation_idx\` ON \`future_attention_concern\` (\`not_before_instant\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`future_attention_transition_history_idx\` ON \`future_attention_transition\` (\`concern_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_goal_course_scope_course_idx\` ON \`learner_goal_course_scope\` (\`course_id\`,\`revision_id\`);`,
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
      yield* tx.run(
        `CREATE INDEX \`learner_course_route_anchor_history_idx\` ON \`learner_course_route_anchor_transition\` (\`course_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_course_route_anchor_frontier_idx\` ON \`learner_course_route_anchor_transition\` (\`frontier_sequence\`,\`course_id\`,\`version\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_default_course_history_idx\` ON \`learner_default_course_transition\` (\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_default_course_frontier_idx\` ON \`learner_default_course_transition\` (\`frontier_sequence\`,\`version\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_default_course_acknowledgement_effect_idx\` ON \`learner_default_course_acknowledgement\` (\`effect_id\`,\`invocation_part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_response_evidence_course_idx\` ON \`learner_response_evidence_record\` (\`course_id\`,\`view_id\`,\`course_revision_id\`,\`course_item_id\`,\`subject_source_order\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_response_evidence_selector_idx\` ON \`learner_response_evidence_record\` (\`map_id\`,\`selector_id\`,\`subject_source_order\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_response_evidence_revision_history_idx\` ON \`learner_response_evidence_revision\` (\`record_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learner_state_judgment_effect_learner_slot\` ON \`learner_state_judgment_effect\` (\`occurrence_id\`,\`semantic_slot\`) WHERE "learner_state_judgment_effect"."cause_type" IN ('interpreted_learner_report', 'learner_correction');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learner_state_judgment_effect_model_slot\` ON \`learner_state_judgment_effect\` (\`model_operation_id\`,\`semantic_slot\`) WHERE "learner_state_judgment_effect"."cause_type" IN ('tutor_model_judgment', 'exact_owner_observation');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learner_state_judgment_no_change_learner_slot\` ON \`learner_state_judgment_no_change_seal\` (\`occurrence_id\`,\`semantic_slot\`) WHERE "learner_state_judgment_no_change_seal"."cause_type" IN ('interpreted_learner_report', 'learner_correction');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learner_state_judgment_no_change_model_slot\` ON \`learner_state_judgment_no_change_seal\` (\`model_operation_id\`,\`semantic_slot\`) WHERE "learner_state_judgment_no_change_seal"."cause_type" IN ('tutor_model_judgment', 'exact_owner_observation');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learner_state_judgment_revision_one_successor\` ON \`learner_state_judgment_revision\` (\`predecessor_revision_id\`) WHERE "learner_state_judgment_revision"."predecessor_revision_id" IS NOT NULL;`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_state_judgment_revision_head_idx\` ON \`learner_state_judgment_revision\` (\`judgment_id\`,\`version\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_state_judgment_creation_order_idx\` ON \`learner_state_judgment\` (\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_course_material_course_idx\` ON \`learning_course_material_adoption\` (\`course_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learning_command_invocation_part_status_unique\` ON \`learning_command_invocation\` (\`part_id\`,\`status\`);`,
      )
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
        `CREATE INDEX \`learning_command_invocation_receipt_idx\` ON \`learning_command_invocation\` (\`receipt_id\`,\`part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_receipt_occurrence_idx\` ON \`learning_command_receipt\` (\`occurrence_id\`,\`id\`);`,
      )
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
      yield* tx.run(
        `CREATE UNIQUE INDEX \`permission_project_action_resource_idx\` ON \`permission\` (\`project_id\`,\`action\`,\`resource\`);`,
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
      yield* tx.run(
        `CREATE INDEX \`retained_steering_history_idx\` ON \`retained_steering_transition\` (\`policy_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`retained_steering_active_idx\` ON \`retained_steering_transition\` (\`state\`,\`valid_until\`,\`source_order\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`message_session_time_created_id_idx\` ON \`message\` (\`session_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`part_message_id_id_idx\` ON \`part\` (\`message_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`part_session_idx\` ON \`part\` (\`session_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`session_historical_message_source_idx\` ON \`session_historical_message_presentation\` (\`source_session_id\`,\`source_message_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_historical_part_source_idx\` ON \`session_historical_part_presentation\` (\`source_session_id\`,\`source_part_id\`);`,
      )
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
        `CREATE INDEX \`turn_model_source_retention_source_idx\` ON \`turn_model_source_retention\` (\`source_turn_id\`,\`source_assistant_message_id\`);`,
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
    })
  },
} satisfies Omit<DatabaseMigration.Migration, "id">
