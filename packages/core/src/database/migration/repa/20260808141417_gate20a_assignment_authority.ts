import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV21 } from "../../schema-extras-v21"

export default {
  id: "20260808141417_gate20a_assignment_authority",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
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
          \`agent_action_fingerprint\` text,
          \`agent_action\` text,
          \`materialized_candidate\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_assignment_disposition_existing_effect_id_assignment_effect_id_fk\` FOREIGN KEY (\`existing_effect_id\`) REFERENCES \`assignment_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_assignment_disposition_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT "assignment_disposition_fingerprints" CHECK(length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("semantic_address_fingerprint") = 64
                AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("agent_action_fingerprint" IS NULL OR (length("agent_action_fingerprint") = 64
                  AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "assignment_disposition_closed" CHECK(("disposition" = 'candidate_v1' AND "semantic_outcome" IS NULL
                  AND "existing_effect_id" IS NULL AND "agent_action_fingerprint" IS NOT NULL
                  AND json_valid("agent_action") AND json_valid("materialized_candidate"))
                OR ("disposition" = 'semantic_terminal_v1'
                  AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                  AND "existing_effect_id" IS NOT NULL AND "agent_action_fingerprint" IS NULL
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
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_effect_learner_address_unique\` ON \`assignment_effect\` (\`occurrence_id\`,\`semantic_slot\`) WHERE "assignment_effect"."cause_type" IN ('interpreted_learner_report', 'interpreted_learner_direction');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_effect_source_address_unique\` ON \`assignment_effect\` (\`source_revision_id\`,\`source_locator_digest\`,\`semantic_slot\`) WHERE "assignment_effect"."cause_type" IN ('interpreted_source_observation', 'interpreted_source_change');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_effect_correction_address_unique\` ON \`assignment_effect\` (\`model_operation_id\`,\`semantic_slot\`) WHERE "assignment_effect"."cause_type" = 'agent_correction';`,
      )
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
                    AND json_extract("canonical_cut", '$.rendererVersion') = 4))
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
        `CREATE UNIQUE INDEX \`learning_command_invocation_part_status_unique\` ON \`learning_command_invocation\` (\`part_id\`,\`status\`);`,
      )
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
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_assignment_disposition\` (
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
      yield* tx.run(
        `INSERT INTO \`__new_assignment_disposition\`(\`invocation_part_id\`, \`disposition\`, \`command_fingerprint\`, \`canonical_command\`, \`semantic_address_fingerprint\`, \`semantic_outcome\`, \`existing_effect_id\`, \`agent_action_fingerprint\`, \`agent_action\`, \`materialized_candidate\`, \`time_disposed\`) SELECT \`invocation_part_id\`, \`disposition\`, \`command_fingerprint\`, \`canonical_command\`, \`semantic_address_fingerprint\`, \`semantic_outcome\`, \`existing_effect_id\`, \`agent_action_fingerprint\`, \`agent_action\`, \`materialized_candidate\`, \`time_disposed\` FROM \`assignment_disposition\`;`,
      )
      yield* tx.run(`DROP TABLE \`assignment_disposition\`;`)
      yield* tx.run(`ALTER TABLE \`__new_assignment_disposition\` RENAME TO \`assignment_disposition\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_no_change_learner_address_unique\` ON \`assignment_no_change_seal\` (\`occurrence_id\`,\`semantic_slot\`) WHERE "assignment_no_change_seal"."cause_type" IN ('interpreted_learner_report', 'interpreted_learner_direction');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_no_change_source_address_unique\` ON \`assignment_no_change_seal\` (\`source_revision_id\`,\`source_locator_digest\`,\`semantic_slot\`) WHERE "assignment_no_change_seal"."cause_type" IN ('interpreted_source_observation', 'interpreted_source_change');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`assignment_no_change_correction_address_unique\` ON \`assignment_no_change_seal\` (\`model_operation_id\`,\`semantic_slot\`) WHERE "assignment_no_change_seal"."cause_type" = 'agent_correction';`,
      )
      yield* installSchemaExtrasV21(tx)
    })
  },
} satisfies DatabaseMigration.Migration

