import { Effect } from "effect"
import { sql } from "drizzle-orm"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV10 } from "../../schema-extras-v10"

export default {
  id: "20260720113159_gate15_retained_steering",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      const triggers = yield* tx.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'trigger'`)
      yield* Effect.forEach(triggers, (trigger) => tx.run(sql`DROP TRIGGER ${sql.identifier(trigger.name)}`), {
        discard: true,
      })
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
        CREATE TABLE \`retained_steering_commit_seal\` (
          \`transition_id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL CONSTRAINT \`retained_steering_commit_seal_receipt_unique\` UNIQUE,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`retained_steering_commit_seal_invocation_unique\` UNIQUE
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
      yield* tx.run(
        `ALTER TABLE \`learning_admitted_occurrence\` ADD \`source_order\` integer REFERENCES learning_occurrence_source_order(sequence);`,
      )
      yield* tx.run(`ALTER TABLE \`learning_admitted_occurrence\` ADD \`source_temporal_state\` text;`)
      yield* tx.run(`ALTER TABLE \`learning_admitted_occurrence\` ADD \`source_timezone\` text;`)
      yield* tx.run(`ALTER TABLE \`learning_admitted_occurrence\` ADD \`source_utc_offset_minutes\` integer;`)
      yield* tx.run(`ALTER TABLE \`learning_admitted_occurrence\` ADD \`source_temporal_unavailable_reason\` text;`)
      yield* tx.run(`ALTER TABLE \`learning_command_invocation\` ADD \`retained_steering_semantic_fingerprint\` text;`)
      yield* tx.run(
        `ALTER TABLE \`learning_command_invocation\` ADD \`retained_steering_effect_id\` text REFERENCES retained_steering_transition(id);`,
      )
      yield* tx.run(
        `ALTER TABLE \`learning_command_receipt\` ADD \`retained_steering_effect_id\` text REFERENCES retained_steering_transition(id);`,
      )
      yield* tx.run(`ALTER TABLE \`turn_model_operation\` ADD \`retained_steering_cut\` text;`)
      yield* tx.run(`ALTER TABLE \`turn_model_operation\` ADD \`retained_steering_cut_fingerprint\` text;`)
      yield* tx.run(`ALTER TABLE \`turn_model_operation\` ADD \`retained_steering_cut_as_of\` integer;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learning_admitted_occurrence\` (
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
      yield* tx.run(
        `INSERT INTO \`__new_learning_admitted_occurrence\`(\`id\`, \`origin_session_id\`, \`origin_message_id\`, \`time_admitted\`) SELECT \`id\`, \`origin_session_id\`, \`origin_message_id\`, \`time_admitted\` FROM \`learning_admitted_occurrence\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_admitted_occurrence\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_admitted_occurrence\` RENAME TO \`learning_admitted_occurrence\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
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
          \`retained_steering_semantic_fingerprint\` text,
          \`status\` text NOT NULL,
          \`effect_id\` text,
          \`representation_effect_id\` text,
          \`default_navigation_effect_id\` text,
          \`anchor_navigation_effect_id\` text,
          \`retained_steering_effect_id\` text,
          \`permission_request_id\` text,
          \`settlement\` text,
          \`time_admitted\` integer NOT NULL,
          \`time_settled\` integer,
          \`settlement_order\` integer,
          \`turn_id\` text,
          \`input_id\` text,
          CONSTRAINT \`fk_learning_command_invocation_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_representation_effect_id_representation_effect_id_fk\` FOREIGN KEY (\`representation_effect_id\`) REFERENCES \`representation_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_default_navigation_effect_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`default_navigation_effect_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_anchor_navigation_effect_id_learner_course_route_anchor_transition_id_fk\` FOREIGN KEY (\`anchor_navigation_effect_id\`) REFERENCES \`learner_course_route_anchor_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_retained_steering_effect_id_retained_steering_transition_id_fk\` FOREIGN KEY (\`retained_steering_effect_id\`) REFERENCES \`retained_steering_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_command_invocation_assistant_call_unique\` UNIQUE(\`assistant_message_id\`,\`provider_call_id\`),
          CONSTRAINT \`learning_command_invocation_assistant_ordinal_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learning_command_invocation_call_nonempty" CHECK(length("provider_call_id") > 0),
          CONSTRAINT "learning_command_invocation_command" CHECK("command_name" IN ('accept_course_view_revision', 'representation.convert', 'set_default_course_preference', 'set_course_route_anchor', 'update_retained_learning_steering')),
          CONSTRAINT "learning_command_invocation_command_version" CHECK("command_version" = 1),
          CONSTRAINT "learning_command_invocation_emission_ordinal" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "learning_command_invocation_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_invocation_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_invocation_capability_match" CHECK(("command_name" = 'accept_course_view_revision' AND "capability_identity" = 'accept_course_view_revision' AND "capability_version" = 1) OR ("command_name" = 'representation.convert' AND "capability_identity" = 'representation.convert' AND "capability_version" = 1) OR ("command_name" = 'set_default_course_preference' AND "capability_identity" = 'set_default_course_preference' AND "capability_version" = 1) OR ("command_name" = 'set_course_route_anchor' AND "capability_identity" = 'set_course_route_anchor' AND "capability_version" = 1) OR ("command_name" = 'update_retained_learning_steering' AND "capability_identity" = 'update_retained_learning_steering' AND "capability_version" = 1)),
          CONSTRAINT "learning_command_invocation_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_invocation_navigation_basis" CHECK(("command_name" = 'set_default_course_preference' AND "authorization_basis" = 'learner_acceptance') OR ("command_name" = 'set_course_route_anchor' AND "authorization_basis" = 'learner_request') OR "command_name" NOT IN ('set_default_course_preference', 'set_course_route_anchor')),
          CONSTRAINT "learning_command_invocation_retained_steering_basis" CHECK("command_name" <> 'update_retained_learning_steering' OR ("authorization_basis" = 'learner_request' AND "turn_id" IS NOT NULL AND "input_id" IS NOT NULL)),
          CONSTRAINT "learning_command_invocation_fingerprint" CHECK(length("input_fingerprint") = 64),
          CONSTRAINT "learning_command_invocation_retained_steering_semantic_fingerprint" CHECK(("command_name" = 'update_retained_learning_steering' AND "retained_steering_semantic_fingerprint" IS NOT NULL AND length("retained_steering_semantic_fingerprint") = 64 AND "retained_steering_semantic_fingerprint" NOT GLOB '*[^0-9a-f]*') OR ("command_name" <> 'update_retained_learning_steering' AND "retained_steering_semantic_fingerprint" IS NULL)),
          CONSTRAINT "learning_command_invocation_status" CHECK("status" IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')),
          CONSTRAINT "learning_command_invocation_permission_shape" CHECK(("command_name" = 'set_default_course_preference' AND "permission_request_id" IS NOT NULL AND length("permission_request_id") > 0) OR ("command_name" <> 'set_default_course_preference' AND "permission_request_id" IS NULL)),
          CONSTRAINT "learning_command_invocation_settlement_shape" CHECK(("status" = 'admitted' AND "settlement" IS NULL AND "time_settled" IS NULL AND "settlement_order" IS NULL AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL) OR ("status" <> 'admitted' AND "settlement" IS NOT NULL AND "time_settled" IS NOT NULL AND "settlement_order" IS NOT NULL)),
          CONSTRAINT "learning_command_invocation_effect_shape" CHECK(("status" IN ('applied', 'already_applied') AND (("command_name" = 'accept_course_view_revision' AND "effect_id" IS NOT NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL) OR ("command_name" = 'representation.convert' AND "effect_id" IS NULL AND "representation_effect_id" IS NOT NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL) OR ("command_name" = 'set_default_course_preference' AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NOT NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL) OR ("command_name" = 'set_course_route_anchor' AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NOT NULL AND "retained_steering_effect_id" IS NULL) OR ("command_name" = 'update_retained_learning_steering' AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NOT NULL))) OR ("status" IN ('admitted', 'no_change', 'error') AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL)),
          CONSTRAINT "learning_command_invocation_time_order" CHECK("time_admitted" >= 0 AND ("time_settled" IS NULL OR "time_settled" >= "time_admitted") AND ("settlement_order" IS NULL OR "settlement_order" >= 0))
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_invocation\`(\`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`status\`, \`effect_id\`, \`representation_effect_id\`, \`default_navigation_effect_id\`, \`anchor_navigation_effect_id\`, \`permission_request_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\`, \`turn_id\`, \`input_id\`) SELECT \`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`status\`, \`effect_id\`, \`representation_effect_id\`, \`default_navigation_effect_id\`, \`anchor_navigation_effect_id\`, \`permission_request_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\`, \`turn_id\`, \`input_id\` FROM \`learning_command_invocation\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_command_invocation\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_command_invocation\` RENAME TO \`learning_command_invocation\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
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
          \`default_navigation_effect_id\` text CONSTRAINT \`learning_command_receipt_default_navigation_effect_unique\` UNIQUE,
          \`anchor_navigation_effect_id\` text CONSTRAINT \`learning_command_receipt_anchor_navigation_effect_unique\` UNIQUE,
          \`retained_steering_effect_id\` text CONSTRAINT \`learning_command_receipt_retained_steering_effect_unique\` UNIQUE,
          \`permission_request_id\` text,
          \`confirmation_snapshot\` text,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learning_command_receipt_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_representation_effect_id_representation_effect_id_fk\` FOREIGN KEY (\`representation_effect_id\`) REFERENCES \`representation_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_default_navigation_effect_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`default_navigation_effect_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_anchor_navigation_effect_id_learner_course_route_anchor_transition_id_fk\` FOREIGN KEY (\`anchor_navigation_effect_id\`) REFERENCES \`learner_course_route_anchor_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_retained_steering_effect_id_retained_steering_transition_id_fk\` FOREIGN KEY (\`retained_steering_effect_id\`) REFERENCES \`retained_steering_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_command_receipt_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_receipt_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_receipt_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_receipt_navigation_basis" CHECK(("capability_identity" = 'set_default_course_preference' AND "authorization_basis" = 'learner_acceptance') OR ("capability_identity" = 'set_course_route_anchor' AND "authorization_basis" = 'learner_request') OR "capability_identity" NOT IN ('set_default_course_preference', 'set_course_route_anchor')),
          CONSTRAINT "learning_command_receipt_retained_steering_basis" CHECK("capability_identity" <> 'update_retained_learning_steering' OR "authorization_basis" = 'learner_request'),
          CONSTRAINT "learning_command_receipt_effect_shape" CHECK(("capability_identity" = 'accept_course_view_revision' AND "capability_version" = 1 AND "effect_id" IS NOT NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("capability_identity" = 'representation.convert' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NOT NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("capability_identity" = 'set_default_course_preference' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NOT NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NULL AND "permission_request_id" IS NOT NULL AND "confirmation_snapshot" IS NOT NULL AND json_valid("confirmation_snapshot")) OR ("capability_identity" = 'set_course_route_anchor' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NOT NULL AND "retained_steering_effect_id" IS NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("capability_identity" = 'update_retained_learning_steering' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "retained_steering_effect_id" IS NOT NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL)),
          CONSTRAINT "learning_command_receipt_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_receipt\`(\`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`effect_id\`, \`representation_effect_id\`, \`default_navigation_effect_id\`, \`anchor_navigation_effect_id\`, \`permission_request_id\`, \`confirmation_snapshot\`, \`time_committed\`, \`commit_order\`) SELECT \`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`effect_id\`, \`representation_effect_id\`, \`default_navigation_effect_id\`, \`anchor_navigation_effect_id\`, \`permission_request_id\`, \`confirmation_snapshot\`, \`time_committed\`, \`commit_order\` FROM \`learning_command_receipt\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_command_receipt\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_command_receipt\` RENAME TO \`learning_command_receipt\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_turn_model_operation\` (
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
      yield* tx.run(
        `INSERT INTO \`__new_turn_model_operation\`(\`assistant_message_id\`, \`turn_id\`, \`session_id\`, \`input_id\`, \`causal_occurrence_id\`, \`ordinal\`, \`state\`, \`request_fingerprint\`, \`context_fingerprint\`, \`snapshot_frontier_sequence\`, \`snapshot_frontier_time\`, \`observed_shared_frontier_sequence\`, \`observed_shared_frontier_time\`, \`time_admitted\`, \`time_settled\`, \`candidates_sealed\`, \`candidate_count\`, \`time_candidates_sealed\`) SELECT \`assistant_message_id\`, \`turn_id\`, \`session_id\`, \`input_id\`, \`causal_occurrence_id\`, \`ordinal\`, \`state\`, \`request_fingerprint\`, \`context_fingerprint\`, \`snapshot_frontier_sequence\`, \`snapshot_frontier_time\`, \`observed_shared_frontier_sequence\`, \`observed_shared_frontier_time\`, \`time_admitted\`, \`time_settled\`, \`candidates_sealed\`, \`candidate_count\`, \`time_candidates_sealed\` FROM \`turn_model_operation\`;`,
      )
      yield* tx.run(`DROP TABLE \`turn_model_operation\`;`)
      yield* tx.run(`ALTER TABLE \`__new_turn_model_operation\` RENAME TO \`turn_model_operation\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
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
        `CREATE UNIQUE INDEX \`turn_model_turn_ordinal_idx\` ON \`turn_model_operation\` (\`turn_id\`,\`ordinal\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`retained_steering_history_idx\` ON \`retained_steering_transition\` (\`policy_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`retained_steering_active_idx\` ON \`retained_steering_transition\` (\`state\`,\`valid_until\`,\`source_order\`);`,
      )
      yield* installSchemaExtrasV10(tx)
    })
  },
} satisfies DatabaseMigration.Migration
