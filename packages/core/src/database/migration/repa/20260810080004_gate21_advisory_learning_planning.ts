import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV23 } from "../../schema-extras-v23"

export default {
  id: "20260810080004_gate21_advisory_learning_planning",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
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
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_turn_learning_context_cut\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`canonical_cut\` text NOT NULL,
          \`canonical_bytes\` integer NOT NULL,
          \`cut_fingerprint\` text NOT NULL,
          \`cut_as_of\` integer NOT NULL,
          \`rendered_block\` text NOT NULL,
          \`rendered_bytes\` integer NOT NULL,
          \`rendered_fingerprint\` text NOT NULL,
          CONSTRAINT \`fk_turn_learning_context_cut_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_learning_context_cut_canonical_shape" CHECK(json_valid("canonical_cut")
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
                    AND json_extract("canonical_cut", '$.rendererVersion') = 6))
                AND json_extract("canonical_cut", '$.operation.assistantMessageID') = "assistant_message_id"
                AND json_extract("canonical_cut", '$.cutAsOf') = "cut_as_of"
                AND json_extract("canonical_cut", '$.budget.canonicalBytes') = "canonical_bytes"
                AND json_extract("canonical_cut", '$.budget.renderedBytes') = "rendered_bytes"
                AND json_extract("canonical_cut", '$.fingerprint') = "cut_fingerprint"
                AND json_extract("canonical_cut", '$.renderedFingerprint') = "rendered_fingerprint"),
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
      yield* tx.run(
        `INSERT INTO \`__new_turn_learning_context_cut\`(\`assistant_message_id\`, \`canonical_cut\`, \`canonical_bytes\`, \`cut_fingerprint\`, \`cut_as_of\`, \`rendered_block\`, \`rendered_bytes\`, \`rendered_fingerprint\`) SELECT \`assistant_message_id\`, \`canonical_cut\`, \`canonical_bytes\`, \`cut_fingerprint\`, \`cut_as_of\`, \`rendered_block\`, \`rendered_bytes\`, \`rendered_fingerprint\` FROM \`turn_learning_context_cut\`;`,
      )
      yield* tx.run(`DROP TABLE \`turn_learning_context_cut\`;`)
      yield* tx.run(`ALTER TABLE \`__new_turn_learning_context_cut\` RENAME TO \`turn_learning_context_cut\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
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
      yield* installSchemaExtrasV23(tx)
    })
  },
} satisfies DatabaseMigration.Migration
