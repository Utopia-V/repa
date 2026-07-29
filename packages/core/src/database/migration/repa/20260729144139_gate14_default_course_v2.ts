import { Effect, Option, Schema } from "effect"
import { sql } from "drizzle-orm"
import { isDeepStrictEqual } from "node:util"
import {
  isNavigationSettlement,
  type NavigationSettlement,
} from "../../../learner-navigation/learning-command-settlement-v12"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV13 } from "../../schema-extras-v13"
import { gate14LocatorContractMigration } from "./support/gate14-locator-contract"

export default {
  id: "20260729144139_gate14_default_course_v2",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      const legacy = yield* readLegacyDefaultCourseRows(tx)
      const preserved = yield* readPreservedV12Bytes(tx)
      const previousCounts = yield* tx
        .get<{ effects: number; seals: number }>(
          sql`
          SELECT
            (SELECT count(*) FROM learner_default_course_transition) AS effects,
            (SELECT count(*) FROM learner_default_course_commit_seal) AS seals
        `,
        )
        .pipe(Effect.orDie)
      const triggers = yield* tx
        .all<{ name: string }>(sql`SELECT name FROM sqlite_schema WHERE type = 'trigger' ORDER BY name`)
        .pipe(Effect.orDie)
      yield* Effect.forEach(
        triggers,
        (trigger) => tx.run(sql.raw(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`)).pipe(Effect.orDie),
        { discard: true },
      )
      yield* tx.run(`DROP VIEW IF EXISTS learning_command_invocation_constraint_v12`)
      yield* tx.run(`DROP VIEW IF EXISTS learning_command_receipt_constraint_v12`)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_acknowledgement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`effect_authorization_part_id\` text NOT NULL,
          \`authorization_version\` integer NOT NULL,
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
          CONSTRAINT \`fk_learner_default_course_acknowledgement_effect_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_acknowledgement_shape" CHECK("authorization_version" IN (1, 2) AND "operation" IN ('set', 'change', 'clear') AND json_valid("from_locator") AND json_valid("to_locator") AND "relation" IN ('active', 'superseded') AND json_valid("presentation_snapshot")),
          CONSTRAINT "learner_default_course_acknowledgement_fingerprint" CHECK(length("presentation_fingerprint") = 64 AND "presentation_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_default_course_acknowledgement_time" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`authorization_version\` integer,
          \`authorization_kind\` text,
          \`authorization_fingerprint\` text,
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
          CONSTRAINT "learner_default_course_disposition_fingerprints" CHECK(("authorization_fingerprint" IS NULL OR (length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*' AND ("semantic_address_fingerprint" IS NULL OR (length("semantic_address_fingerprint") = 64 AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("incoming_payload_fingerprint" IS NULL OR (length("incoming_payload_fingerprint") = 64 AND "incoming_payload_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("existing_payload_fingerprint" IS NULL OR (length("existing_payload_fingerprint") = 64 AND "existing_payload_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("resolution_fingerprint" IS NULL OR (length("resolution_fingerprint") = 64 AND "resolution_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("proposal_fingerprint" IS NULL OR (length("proposal_fingerprint") = 64 AND "proposal_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_default_course_disposition_closed_union" CHECK((
                "disposition" = 'legacy_v1'
                AND "authorization_version" = 1
                AND "authorization_kind" = 'legacy_v1'
                AND "authorization_fingerprint" IS NOT NULL
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
              ) OR (
                "disposition" = 'candidate_v2'
                AND "authorization_version" = 2
                AND "authorization_kind" IN ('direct_request_v2', 'accepted_proposal_v2')
                AND "authorization_fingerprint" IS NOT NULL
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
                AND length("source_excerpt") > 0
                AND json_valid("resolution_scope")
                AND "resolution_fingerprint" IS NOT NULL
                AND "preference_version" IS NOT NULL
                AND (("preference_version" = 0 AND "preference_head_id" IS NULL)
                  OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL))
                AND "operation" IN ('set', 'change', 'clear')
                AND json_valid("from_locator")
                AND json_valid("to_locator")
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
              )),
          CONSTRAINT "learner_default_course_disposition_time" CHECK("time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_capability_issue\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`authorization_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_capability_issue_invocation_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_default_course_capability_issue_invocation_request_unique\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "learner_default_course_capability_issue_fingerprints" CHECK(length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("shown_scope_fingerprint") = 64 AND "shown_scope_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_default_course_capability_issue_shape" CHECK(length("permission_request_id") > 0 AND json_valid("policy_basis") AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_default_course_capability_settlement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`authorization_fingerprint\` text NOT NULL,
          \`policy_basis\` text,
          \`policy_fingerprint\` text,
          \`reply\` text,
          \`reply_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_capability_settlement_invocation_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_capability_settlement_invocation_part_id_permission_request_id_learner_default_course_capability_issue_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`learner_default_course_capability_issue\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_capability_settlement_fingerprints" CHECK(length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*' AND ("policy_fingerprint" IS NULL OR (length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("reply_fingerprint" IS NULL OR (length("reply_fingerprint") = 64 AND "reply_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
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
          CONSTRAINT "learner_default_course_proposal_json" CHECK(json_valid("command_snapshot") AND json_valid("resolution_scope") AND json_valid("from_locator") AND json_valid("to_locator")),
          CONSTRAINT "learner_default_course_proposal_head" CHECK(("preference_version" = 0 AND "preference_head_id" IS NULL) OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL)),
          CONSTRAINT "learner_default_course_proposal_operation" CHECK("operation" IN ('set', 'change', 'clear')),
          CONSTRAINT "learner_default_course_proposal_time_order" CHECK("emission_ordinal" >= 0 AND "time_presented" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* Effect.forEach(legacy, (row) => insertLegacyDisposition(tx, row), { discard: true })
      yield* tx.run(`
        CREATE TABLE \`__new_learner_default_course_transition\` (
          \`id\` text PRIMARY KEY,
          \`version\` integer NOT NULL CONSTRAINT \`learner_default_course_version_unique\` UNIQUE,
          \`predecessor_id\` text CONSTRAINT \`learner_default_course_predecessor_unique\` UNIQUE,
          \`previous_course_id\` text,
          \`course_id\` text,
          \`occurrence_id\` text NOT NULL CONSTRAINT \`learner_default_course_occurrence_unique\` UNIQUE,
          \`authorization_part_id\` text NOT NULL,
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
          CONSTRAINT "learner_default_course_chain_shape" CHECK(("version" = 1 AND "predecessor_id" IS NULL AND "previous_course_id" IS NULL) OR ("version" > 1 AND "predecessor_id" IS NOT NULL)),
          CONSTRAINT "learner_default_course_value_changed" CHECK(NOT ("course_id" IS "previous_course_id")),
          CONSTRAINT "learner_default_course_target_shape" CHECK(("course_id" IS NULL AND "target_course_version" IS NULL AND "target_selection_revision_id" IS NULL AND "target_selection_version" IS NULL AND "target_view_id" IS NULL AND "target_view_version" IS NULL AND "target_revision_version" IS NULL) OR ("course_id" IS NOT NULL AND "target_course_version" IS NOT NULL AND "target_selection_version" IS NOT NULL AND (("target_selection_revision_id" IS NULL AND "target_view_id" IS NULL AND "target_view_version" IS NULL AND "target_revision_version" IS NULL) OR ("target_selection_revision_id" IS NOT NULL AND "target_view_id" IS NOT NULL AND "target_view_version" IS NOT NULL AND "target_revision_version" IS NOT NULL)))),
          CONSTRAINT "learner_default_course_versions" CHECK("version" >= 1 AND ("target_course_version" IS NULL OR "target_course_version" >= 0) AND ("target_selection_version" IS NULL OR "target_selection_version" >= 0) AND ("target_view_version" IS NULL OR "target_view_version" >= 0) AND ("target_revision_version" IS NULL OR "target_revision_version" >= 0)),
          CONSTRAINT "learner_default_course_legacy_confirmation_shape" CHECK(("permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("permission_request_id" IS NOT NULL AND length("permission_request_id") > 0 AND json_valid("confirmation_snapshot"))),
          CONSTRAINT "learner_default_course_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed")
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_default_course_transition\`(
          \`id\`, \`version\`, \`predecessor_id\`, \`previous_course_id\`, \`course_id\`, \`occurrence_id\`,
          \`authorization_part_id\`, \`permission_request_id\`, \`confirmation_snapshot\`,
          \`target_course_version\`, \`target_selection_revision_id\`, \`target_selection_version\`,
          \`target_view_id\`, \`target_view_version\`, \`target_revision_version\`,
          \`time_committed\`, \`commit_order\`, \`frontier_sequence\`, \`frontier_time\`
        )
        SELECT
          effect.\`id\`, effect.\`version\`, effect.\`predecessor_id\`, effect.\`previous_course_id\`,
          effect.\`course_id\`, effect.\`occurrence_id\`, seal.\`invocation_part_id\`,
          effect.\`permission_request_id\`, effect.\`confirmation_snapshot\`,
          effect.\`target_course_version\`, effect.\`target_selection_revision_id\`,
          effect.\`target_selection_version\`, effect.\`target_view_id\`,
          effect.\`target_view_version\`, effect.\`target_revision_version\`,
          effect.\`time_committed\`, effect.\`commit_order\`, effect.\`frontier_sequence\`,
          effect.\`frontier_time\`
        FROM \`learner_default_course_transition\` AS effect
        JOIN \`learner_default_course_commit_seal\` AS seal ON seal.\`effect_id\` = effect.\`id\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_default_course_transition\`;`)
      yield* tx.run(
        `ALTER TABLE \`__new_learner_default_course_transition\` RENAME TO \`learner_default_course_transition\`;`,
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
      yield* Effect.forEach(
        legacy.filter((row) => row.status === "applied" || row.status === "already_applied"),
        (row) => insertLegacyAcknowledgement(tx, row),
        { discard: true },
      )
      yield* gate14LocatorContractMigration.up(tx)
      const observed = yield* readPreservedV12Bytes(tx)
      if (JSON.stringify(observed) !== JSON.stringify(preserved)) {
        return yield* Effect.fail(new Error("V13 migration changed frozen V12 Part, settlement, or confirmation bytes"))
      }
      const counts = yield* tx
        .get<{
          commands: number
          dispositions: number
          effects: number
          seals: number
          acknowledged: number
        }>(
          sql`
          SELECT
            (SELECT count(*) FROM learner_default_course_command) AS commands,
            (SELECT count(*) FROM learner_default_course_disposition) AS dispositions,
            (SELECT count(*) FROM learner_default_course_transition) AS effects,
            (SELECT count(*) FROM learner_default_course_commit_seal) AS seals,
            (
              SELECT count(*) FROM learner_default_course_acknowledgement
              WHERE authorization_version = 1
            ) AS acknowledged
        `,
        )
        .pipe(Effect.orDie)
      const terminal = legacy.filter((row) => row.status === "applied" || row.status === "already_applied").length
      if (
        !previousCounts ||
        !counts ||
        previousCounts.effects !== previousCounts.seals ||
        previousCounts.effects !== counts.effects ||
        counts.commands !== legacy.length ||
        counts.dispositions !== legacy.length ||
        counts.acknowledged !== terminal ||
        counts.effects !== legacy.filter((row) => row.status === "applied").length ||
        counts.seals !== counts.effects
      ) {
        return yield* Effect.fail(new Error("V13 migration did not preserve the complete V12 Default-Course ledger"))
      }
      yield* installSchemaExtrasV13(tx)
    })
  },
} satisfies DatabaseMigration.Migration

type LegacyDefaultCourseRow = Readonly<{
  partID: string
  status: "admitted" | "applied" | "already_applied" | "no_change" | "error"
  inputFingerprint: string
  timeAdmitted: number
  commandVersion: number
  capabilityIdentity: string
  capabilityVersion: number
  authorizationBasis: string
  commandPermissionRequestID: string
  settlement: string | null
  effectID: string | null
  effectAuthorizationPartID: string | null
  effectConfirmationRequestID: string | null
  receiptID: string | null
  effectOccurrenceID: string | null
  effectPredecessorID: string | null
  effectVersion: number | null
  previousCourseID: string | null
  courseID: string | null
  confirmationSnapshot: string | null
  confirmationHeadID: string | null
  confirmationVersion: number | null
  confirmationFromCourseID: string | null
  fromCourseTitle: string | null
  targetCourseID: string | null
  targetCourseTitle: string | null
  targetCourseVersion: number | null
  targetSelectionRevisionID: string | null
  targetSelectionVersion: number | null
  targetViewID: string | null
  targetViewName: string | null
  targetViewVersion: number | null
  targetRevisionVersion: number | null
  effectTargetCourseVersion: number | null
  effectTargetSelectionRevisionID: string | null
  effectTargetSelectionVersion: number | null
  effectTargetViewID: string | null
  effectTargetViewVersion: number | null
  effectTargetRevisionVersion: number | null
  timeCommitted: number | null
  commitOrder: number | null
  frontierSequence: number | null
  relation: "active" | "superseded" | null
}>

type PreservedV12Bytes = Readonly<{
  partID: string
  part: string | null
  settlement: string | null
  effectID: string | null
  confirmation: string | null
}>

function readLegacyDefaultCourseRows(tx: Parameters<DatabaseMigration.Migration["up"]>[0]) {
  return tx
    .all<LegacyDefaultCourseRow>(
      sql`
      SELECT
        invocation.part_id AS partID,
        invocation.status AS status,
        invocation.input_fingerprint AS inputFingerprint,
        invocation.time_admitted AS timeAdmitted,
        invocation.command_version AS commandVersion,
        invocation.capability_identity AS capabilityIdentity,
        invocation.capability_version AS capabilityVersion,
        invocation.authorization_basis AS authorizationBasis,
        command.permission_request_id AS commandPermissionRequestID,
        CAST(invocation.settlement AS text) AS settlement,
        effect.id AS effectID,
        seal.invocation_part_id AS effectAuthorizationPartID,
        effect.permission_request_id AS effectConfirmationRequestID,
        seal.receipt_id AS receiptID,
        effect.occurrence_id AS effectOccurrenceID,
        effect.predecessor_id AS effectPredecessorID,
        effect.version AS effectVersion,
        effect.previous_course_id AS previousCourseID,
        effect.course_id AS courseID,
        CAST(effect.confirmation_snapshot AS text) AS confirmationSnapshot,
        json_extract(effect.confirmation_snapshot, '$.headID') AS confirmationHeadID,
        json_extract(effect.confirmation_snapshot, '$.version') AS confirmationVersion,
        json_extract(effect.confirmation_snapshot, '$.fromCourseID') AS confirmationFromCourseID,
        json_extract(effect.confirmation_snapshot, '$.fromCourseTitle') AS fromCourseTitle,
        json_extract(effect.confirmation_snapshot, '$.target.courseID') AS targetCourseID,
        json_extract(effect.confirmation_snapshot, '$.target.courseTitle') AS targetCourseTitle,
        json_extract(effect.confirmation_snapshot, '$.target.courseVersion') AS targetCourseVersion,
        json_extract(effect.confirmation_snapshot, '$.target.selectionRevisionID') AS targetSelectionRevisionID,
        json_extract(effect.confirmation_snapshot, '$.target.selectionVersion') AS targetSelectionVersion,
        json_extract(effect.confirmation_snapshot, '$.target.viewID') AS targetViewID,
        json_extract(effect.confirmation_snapshot, '$.target.viewName') AS targetViewName,
        json_extract(effect.confirmation_snapshot, '$.target.viewVersion') AS targetViewVersion,
        json_extract(effect.confirmation_snapshot, '$.target.revisionVersion') AS targetRevisionVersion,
        effect.target_course_version AS effectTargetCourseVersion,
        effect.target_selection_revision_id AS effectTargetSelectionRevisionID,
        effect.target_selection_version AS effectTargetSelectionVersion,
        effect.target_view_id AS effectTargetViewID,
        effect.target_view_version AS effectTargetViewVersion,
        effect.target_revision_version AS effectTargetRevisionVersion,
        effect.time_committed AS timeCommitted,
        effect.commit_order AS commitOrder,
        effect.frontier_sequence AS frontierSequence,
        json_extract(invocation.settlement, '$.relation') AS relation
      FROM learning_command_invocation AS invocation
      JOIN learner_default_course_command AS command
        ON command.invocation_part_id = invocation.part_id
      LEFT JOIN learner_default_course_commit_seal AS seal
        ON seal.receipt_id = invocation.receipt_id
      LEFT JOIN learner_default_course_transition AS effect
        ON effect.id = seal.effect_id
      WHERE invocation.command_name = 'set_default_course_preference'
      ORDER BY invocation.part_id
    `,
    )
    .pipe(Effect.orDie)
}

function readPreservedV12Bytes(tx: Parameters<DatabaseMigration.Migration["up"]>[0]) {
  return tx
    .all<PreservedV12Bytes>(
      sql`
      SELECT
        invocation.part_id AS partID,
        CAST(part.data AS text) AS part,
        CAST(invocation.settlement AS text) AS settlement,
        effect.id AS effectID,
        CAST(effect.confirmation_snapshot AS text) AS confirmation
      FROM learning_command_invocation AS invocation
      JOIN learner_default_course_command AS command
        ON command.invocation_part_id = invocation.part_id
      LEFT JOIN part ON part.id = invocation.part_id
      LEFT JOIN learner_default_course_commit_seal AS seal
        ON seal.receipt_id = invocation.receipt_id
      LEFT JOIN learner_default_course_transition AS effect
        ON effect.id = seal.effect_id
      WHERE invocation.command_name = 'set_default_course_preference'
      ORDER BY invocation.part_id
    `,
    )
    .pipe(Effect.orDie)
}

function insertLegacyDisposition(tx: Parameters<DatabaseMigration.Migration["up"]>[0], row: LegacyDefaultCourseRow) {
  return Effect.gen(function* () {
    const terminal = row.status === "applied" || row.status === "already_applied"
    const decodedSettlement =
      row.settlement === null
        ? undefined
        : Option.getOrUndefined(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(row.settlement))
    const settlement = isNavigationSettlement(decodedSettlement) ? decodedSettlement : undefined
    const validIdentity =
      row.commandVersion === 1 &&
      row.capabilityIdentity === "set_default_course_preference" &&
      row.capabilityVersion === 1 &&
      row.authorizationBasis === "learner_acceptance"
    const validSettlement =
      row.status === "admitted"
        ? row.settlement === null
        : settlement !== undefined &&
          settlement.outcome === row.status &&
          (settlement.outcome === "error" || settlement.navigationKind === "default_course_preference")
    const validTerminal =
      terminal &&
      row.effectID !== null &&
      row.effectAuthorizationPartID !== null &&
      row.effectConfirmationRequestID !== null &&
      row.receiptID !== null &&
      row.effectOccurrenceID !== null &&
      row.effectVersion !== null &&
      row.confirmationSnapshot !== null &&
      row.confirmationVersion !== null &&
      row.timeCommitted !== null &&
      row.commitOrder !== null &&
      row.frontierSequence !== null
    const validNonterminal =
      !terminal &&
      row.effectID === null &&
      row.effectAuthorizationPartID === null &&
      row.effectConfirmationRequestID === null &&
      row.receiptID === null &&
      row.confirmationSnapshot === null
    const validTerminalSettlement = !terminal || validLegacyTerminalProjection(row, settlement)
    if (!validIdentity || !validSettlement || !validTerminalSettlement || (!validTerminal && !validNonterminal)) {
      return yield* Effect.fail(new Error(`V12 Default-Course row ${row.partID} has no truthful V1 classification`))
    }
    const confirmationAvailability = terminal ? "recorded_v1" : "not_recorded_v1"
    const authorizationFingerprint = fingerprint({
      schemaVersion: 1,
      invocationPartID: row.partID,
      rowClass: row.status,
      commandPermissionRequestID: row.commandPermissionRequestID,
      confirmationAvailability,
      ...(terminal
        ? {
            effectConfirmationRequestID: row.effectConfirmationRequestID,
            effectID: row.effectID,
            receiptID: row.receiptID,
          }
        : {}),
    })
    yield* tx.run(sql`
      INSERT INTO learner_default_course_disposition (
        invocation_part_id,
        disposition,
        authorization_version,
        authorization_kind,
        authorization_fingerprint,
        command_fingerprint,
        legacy_row_class,
        confirmation_availability,
        command_permission_request_id,
        effect_confirmation_request_id,
        legacy_effect_id,
        legacy_receipt_id,
        time_disposed
      ) VALUES (
        ${row.partID},
        'legacy_v1',
        1,
        'legacy_v1',
        ${authorizationFingerprint},
        ${row.inputFingerprint},
        ${row.status},
        ${confirmationAvailability},
        ${row.commandPermissionRequestID},
        ${terminal ? row.effectConfirmationRequestID : null},
        ${terminal ? row.effectID : null},
        ${terminal ? row.receiptID : null},
        ${row.timeAdmitted}
      )
    `)
  })
}

function validLegacyTerminalProjection(row: LegacyDefaultCourseRow, settlement: NavigationSettlement | undefined) {
  if (
    !settlement ||
    (settlement.outcome !== "applied" && settlement.outcome !== "already_applied") ||
    settlement.navigationKind !== "default_course_preference" ||
    settlement.outcome !== row.status ||
    row.effectID === null ||
    row.effectOccurrenceID === null ||
    row.effectVersion === null ||
    row.effectConfirmationRequestID === null ||
    row.receiptID === null ||
    row.confirmationSnapshot === null ||
    row.confirmationVersion === null ||
    row.timeCommitted === null ||
    row.commitOrder === null ||
    row.frontierSequence === null
  ) {
    return false
  }
  const decodedConfirmation = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(row.confirmationSnapshot),
  )
  if (!isDeepStrictEqual(decodedConfirmation, settlement.confirmation)) return false
  const effect = settlement.effect
  const confirmation = settlement.confirmation
  const targetMatches =
    row.courseID === null
      ? confirmation.target === null &&
        row.targetCourseID === null &&
        row.targetCourseTitle === null &&
        row.targetCourseVersion === null &&
        row.targetSelectionRevisionID === null &&
        row.targetSelectionVersion === null &&
        row.targetViewID === null &&
        row.targetViewName === null &&
        row.targetViewVersion === null &&
        row.targetRevisionVersion === null &&
        row.effectTargetCourseVersion === null &&
        row.effectTargetSelectionRevisionID === null &&
        row.effectTargetSelectionVersion === null &&
        row.effectTargetViewID === null &&
        row.effectTargetViewVersion === null &&
        row.effectTargetRevisionVersion === null
      : confirmation.target !== null &&
        confirmation.target.courseID === row.courseID &&
        confirmation.target.courseID === row.targetCourseID &&
        confirmation.target.courseTitle === row.targetCourseTitle &&
        confirmation.target.courseVersion === row.targetCourseVersion &&
        confirmation.target.courseVersion === row.effectTargetCourseVersion &&
        confirmation.target.selectionRevisionID === row.targetSelectionRevisionID &&
        confirmation.target.selectionRevisionID === row.effectTargetSelectionRevisionID &&
        confirmation.target.selectionVersion === row.targetSelectionVersion &&
        confirmation.target.selectionVersion === row.effectTargetSelectionVersion &&
        confirmation.target.viewID === row.targetViewID &&
        confirmation.target.viewID === row.effectTargetViewID &&
        confirmation.target.viewName === row.targetViewName &&
        confirmation.target.viewVersion === row.targetViewVersion &&
        confirmation.target.viewVersion === row.effectTargetViewVersion &&
        confirmation.target.revisionVersion === row.targetRevisionVersion &&
        confirmation.target.revisionVersion === row.effectTargetRevisionVersion
  return (
    effect.id === row.effectID &&
    effect.occurrenceID === row.effectOccurrenceID &&
    effect.previousCourseID === row.previousCourseID &&
    effect.courseID === row.courseID &&
    effect.previousVersion === row.effectVersion - 1 &&
    effect.version === row.effectVersion &&
    effect.timeCommitted === row.timeCommitted &&
    effect.commitOrder === row.commitOrder &&
    effect.frontierSequence === row.frontierSequence &&
    settlement.effectID === row.effectID &&
    settlement.receiptID === row.receiptID &&
    confirmation.permissionRequestID === row.effectConfirmationRequestID &&
    confirmation.headID === row.effectPredecessorID &&
    confirmation.headID === row.confirmationHeadID &&
    confirmation.version === row.effectVersion - 1 &&
    confirmation.version === row.confirmationVersion &&
    confirmation.fromCourseID === row.previousCourseID &&
    confirmation.fromCourseID === row.confirmationFromCourseID &&
    confirmation.fromCourseTitle === row.fromCourseTitle &&
    (row.previousCourseID !== null || row.fromCourseTitle === null) &&
    targetMatches
  )
}

function insertLegacyAcknowledgement(
  tx: Parameters<DatabaseMigration.Migration["up"]>[0],
  row: LegacyDefaultCourseRow,
) {
  return Effect.gen(function* () {
    if (
      !row.effectID ||
      !row.effectAuthorizationPartID ||
      !row.effectConfirmationRequestID ||
      !row.receiptID ||
      row.timeCommitted === null ||
      row.commitOrder === null
    ) {
      return yield* Effect.fail(new Error(`V12 Default-Course terminal row ${row.partID} lost its effect seal`))
    }
    const from =
      row.previousCourseID === null
        ? ({ kind: "absent" } as const)
        : ({
            kind: "course",
            locator: {
              courseID: row.previousCourseID,
              title:
                row.fromCourseTitle === null
                  ? { availability: "not_recorded_v1" }
                  : { availability: "recorded_v1", value: row.fromCourseTitle },
              courseVersion: { availability: "not_recorded_v1" },
              workingSelection: { availability: "not_recorded_v1" },
            },
          } as const)
    const to =
      row.courseID === null
        ? ({ kind: "absent" } as const)
        : row.targetCourseID === row.courseID &&
            row.targetCourseTitle !== null &&
            row.targetCourseVersion !== null &&
            row.targetSelectionVersion !== null
          ? ({
              kind: "course",
              locator: {
                courseID: row.targetCourseID,
                title: { availability: "recorded_v1", value: row.targetCourseTitle },
                courseVersion: { availability: "recorded_v1", value: row.targetCourseVersion },
                workingSelection: {
                  availability: "recorded_v1",
                  value: {
                    revisionID: row.targetSelectionRevisionID,
                    selectionVersion: row.targetSelectionVersion,
                    viewID: row.targetViewID,
                    viewName: row.targetViewName,
                    viewVersion: row.targetViewVersion,
                    revisionVersion: row.targetRevisionVersion,
                  },
                },
              },
            } as const)
          : undefined
    const relation = row.status === "applied" ? "active" : row.relation
    if (!from || !to || (relation !== "active" && relation !== "superseded")) {
      return yield* Effect.fail(
        new Error(`V12 Default-Course terminal row ${row.partID} has no exact acknowledgement locator`),
      )
    }
    const operation = from.kind === "absent" ? "set" : to.kind === "absent" ? "clear" : "change"
    const presentation = {
      schemaVersion: 1,
      invocationPartID: row.partID,
      effectAuthorizationPartID: row.effectAuthorizationPartID,
      authorizationVersion: 1,
      effectID: row.effectID,
      receiptID: row.receiptID,
      operation,
      from,
      to,
      relation,
      timeCommitted: row.timeCommitted,
      commitOrder: row.commitOrder,
    } as const
    yield* tx.run(sql`
      INSERT INTO learner_default_course_acknowledgement (
        invocation_part_id,
        effect_authorization_part_id,
        authorization_version,
        effect_id,
        receipt_id,
        operation,
        from_locator,
        to_locator,
        relation,
        presentation_snapshot,
        presentation_fingerprint,
        time_committed,
        commit_order
      ) VALUES (
        ${row.partID},
        ${row.effectAuthorizationPartID},
        1,
        ${row.effectID},
        ${row.receiptID},
        ${operation},
        ${JSON.stringify(from)},
        ${JSON.stringify(to)},
        ${relation},
        ${JSON.stringify(presentation)},
        ${fingerprint(presentation)},
        ${row.timeCommitted},
        ${row.commitOrder}
      )
    `)
  })
}

function fingerprint(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}
