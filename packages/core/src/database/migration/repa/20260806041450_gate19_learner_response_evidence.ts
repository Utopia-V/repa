import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV19 } from "../../schema-extras-v19"

export default {
  id: "20260806041450_gate19_learner_response_evidence",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
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
        `CREATE INDEX \`turn_model_source_retention_source_idx\` ON \`turn_model_source_retention\` (\`source_turn_id\`,\`source_assistant_message_id\`);`,
      )
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
                    AND json_extract("canonical_cut", '$.rendererVersion') = 2))
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
      yield* installSchemaExtrasV19(tx)
    })
  },
} satisfies DatabaseMigration.Migration
