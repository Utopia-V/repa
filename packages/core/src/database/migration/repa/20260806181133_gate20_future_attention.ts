import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV20 } from "../../schema-extras-v20"

export default {
  id: "20260806181133_gate20_future_attention",
  up(tx) {
    return Effect.gen(function* () {
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
      yield* tx.run(
        `ALTER TABLE \`turn_tool_candidate\` ADD \`future_attention_service_source\` text DEFAULT 'internal_control' NOT NULL;`,
      )
      yield* tx.run(`ALTER TABLE \`turn_unavailable_model\` ADD \`state\` text;`)
      yield* tx.run(`ALTER TABLE \`turn_unavailable_model\` ADD \`time_settled\` integer;`)
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
                    AND json_extract("canonical_cut", '$.rendererVersion') = 3))
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
      yield* installSchemaExtrasV20(tx)
    })
  },
} satisfies DatabaseMigration.Migration
