import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { LearnerNavigationConstraintSchema } from "../../../learner-navigation/constraint-schema-v1"

export default {
  id: "20260719155243_learner_navigation",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
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
          \`permission_request_id\` text NOT NULL,
          \`confirmation_snapshot\` text NOT NULL,
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
          CONSTRAINT "learner_default_course_chain_shape" CHECK(("version" = 1 AND "predecessor_id" IS NULL AND "previous_course_id" IS NULL) OR ("version" > 1 AND "predecessor_id" IS NOT NULL)),
          CONSTRAINT "learner_default_course_value_changed" CHECK(NOT ("course_id" IS "previous_course_id")),
          CONSTRAINT "learner_default_course_target_shape" CHECK(("course_id" IS NULL AND "target_course_version" IS NULL AND "target_selection_revision_id" IS NULL AND "target_selection_version" IS NULL AND "target_view_id" IS NULL AND "target_view_version" IS NULL AND "target_revision_version" IS NULL) OR ("course_id" IS NOT NULL AND "target_course_version" IS NOT NULL AND "target_selection_version" IS NOT NULL AND (("target_selection_revision_id" IS NULL AND "target_view_id" IS NULL AND "target_view_version" IS NULL AND "target_revision_version" IS NULL) OR ("target_selection_revision_id" IS NOT NULL AND "target_view_id" IS NOT NULL AND "target_view_version" IS NOT NULL AND "target_revision_version" IS NOT NULL)))),
          CONSTRAINT "learner_default_course_versions" CHECK("version" >= 1 AND ("target_course_version" IS NULL OR "target_course_version" >= 0) AND ("target_selection_version" IS NULL OR "target_selection_version" >= 0) AND ("target_view_version" IS NULL OR "target_view_version" >= 0) AND ("target_revision_version" IS NULL OR "target_revision_version" >= 0)),
          CONSTRAINT "learner_default_course_permission" CHECK(length("permission_request_id") > 0),
          CONSTRAINT "learner_default_course_confirmation" CHECK(json_valid("confirmation_snapshot")),
          CONSTRAINT "learner_default_course_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed")
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `ALTER TABLE \`learning_command_invocation\` ADD \`default_navigation_effect_id\` text REFERENCES learner_default_course_transition(id);`,
      )
      yield* tx.run(
        `ALTER TABLE \`learning_command_invocation\` ADD \`anchor_navigation_effect_id\` text REFERENCES learner_course_route_anchor_transition(id);`,
      )
      yield* tx.run(`ALTER TABLE \`learning_command_invocation\` ADD \`permission_request_id\` text;`)
      yield* tx.run(
        `ALTER TABLE \`learning_command_receipt\` ADD \`default_navigation_effect_id\` text REFERENCES learner_default_course_transition(id);`,
      )
      yield* tx.run(
        `ALTER TABLE \`learning_command_receipt\` ADD \`anchor_navigation_effect_id\` text REFERENCES learner_course_route_anchor_transition(id);`,
      )
      yield* tx.run(`ALTER TABLE \`learning_command_receipt\` ADD \`permission_request_id\` text;`)
      yield* tx.run(`ALTER TABLE \`learning_command_receipt\` ADD \`confirmation_snapshot\` text;`)
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
          \`status\` text NOT NULL,
          \`effect_id\` text,
          \`representation_effect_id\` text,
          \`default_navigation_effect_id\` text,
          \`anchor_navigation_effect_id\` text,
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
          CONSTRAINT \`learning_command_invocation_assistant_call_unique\` UNIQUE(\`assistant_message_id\`,\`provider_call_id\`),
          CONSTRAINT \`learning_command_invocation_assistant_ordinal_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learning_command_invocation_call_nonempty" CHECK(length("provider_call_id") > 0),
          CONSTRAINT "learning_command_invocation_command" CHECK("command_name" IN ('accept_course_view_revision', 'representation.convert', 'set_default_course_preference', 'set_course_route_anchor')),
          CONSTRAINT "learning_command_invocation_command_version" CHECK("command_version" = 1),
          CONSTRAINT "learning_command_invocation_emission_ordinal" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "learning_command_invocation_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_invocation_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_invocation_capability_match" CHECK(("command_name" = 'accept_course_view_revision' AND "capability_identity" = 'accept_course_view_revision' AND "capability_version" = 1) OR ("command_name" = 'representation.convert' AND "capability_identity" = 'representation.convert' AND "capability_version" = 1) OR ("command_name" = 'set_default_course_preference' AND "capability_identity" = 'set_default_course_preference' AND "capability_version" = 1) OR ("command_name" = 'set_course_route_anchor' AND "capability_identity" = 'set_course_route_anchor' AND "capability_version" = 1)),
          CONSTRAINT "learning_command_invocation_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_invocation_navigation_basis" CHECK(("command_name" = 'set_default_course_preference' AND "authorization_basis" = 'learner_acceptance') OR ("command_name" = 'set_course_route_anchor' AND "authorization_basis" = 'learner_request') OR "command_name" NOT IN ('set_default_course_preference', 'set_course_route_anchor')),
          CONSTRAINT "learning_command_invocation_fingerprint" CHECK(length("input_fingerprint") = 64),
          CONSTRAINT "learning_command_invocation_status" CHECK("status" IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')),
          CONSTRAINT "learning_command_invocation_permission_shape" CHECK(("command_name" = 'set_default_course_preference' AND "permission_request_id" IS NOT NULL AND length("permission_request_id") > 0) OR ("command_name" <> 'set_default_course_preference' AND "permission_request_id" IS NULL)),
          CONSTRAINT "learning_command_invocation_settlement_shape" CHECK(("status" = 'admitted' AND "settlement" IS NULL AND "time_settled" IS NULL AND "settlement_order" IS NULL AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL) OR ("status" <> 'admitted' AND "settlement" IS NOT NULL AND "time_settled" IS NOT NULL AND "settlement_order" IS NOT NULL)),
          CONSTRAINT "learning_command_invocation_effect_shape" CHECK(("status" IN ('applied', 'already_applied') AND (("command_name" = 'accept_course_view_revision' AND "effect_id" IS NOT NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL) OR ("command_name" = 'representation.convert' AND "effect_id" IS NULL AND "representation_effect_id" IS NOT NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL) OR ("command_name" = 'set_default_course_preference' AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NOT NULL AND "anchor_navigation_effect_id" IS NULL) OR ("command_name" = 'set_course_route_anchor' AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NOT NULL))) OR ("status" IN ('admitted', 'no_change', 'error') AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL)),
          CONSTRAINT "learning_command_invocation_time_order" CHECK("time_admitted" >= 0 AND ("time_settled" IS NULL OR "time_settled" >= "time_admitted") AND ("settlement_order" IS NULL OR "settlement_order" >= 0))
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_invocation\`(\`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`status\`, \`effect_id\`, \`representation_effect_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\`, \`turn_id\`, \`input_id\`) SELECT \`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`status\`, \`effect_id\`, \`representation_effect_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\`, \`turn_id\`, \`input_id\` FROM \`learning_command_invocation\`;`,
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
          CONSTRAINT "learning_command_receipt_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_receipt_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_receipt_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_receipt_navigation_basis" CHECK(("capability_identity" = 'set_default_course_preference' AND "authorization_basis" = 'learner_acceptance') OR ("capability_identity" = 'set_course_route_anchor' AND "authorization_basis" = 'learner_request') OR "capability_identity" NOT IN ('set_default_course_preference', 'set_course_route_anchor')),
          CONSTRAINT "learning_command_receipt_effect_shape" CHECK(("capability_identity" = 'accept_course_view_revision' AND "capability_version" = 1 AND "effect_id" IS NOT NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("capability_identity" = 'representation.convert' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NOT NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("capability_identity" = 'set_default_course_preference' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NOT NULL AND "anchor_navigation_effect_id" IS NULL AND "permission_request_id" IS NOT NULL AND "confirmation_snapshot" IS NOT NULL AND json_valid("confirmation_snapshot")) OR ("capability_identity" = 'set_course_route_anchor' AND "capability_version" = 1 AND "effect_id" IS NULL AND "representation_effect_id" IS NULL AND "default_navigation_effect_id" IS NULL AND "anchor_navigation_effect_id" IS NOT NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL)),
          CONSTRAINT "learning_command_receipt_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_receipt\`(\`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`effect_id\`, \`representation_effect_id\`, \`time_committed\`, \`commit_order\`) SELECT \`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`effect_id\`, \`representation_effect_id\`, \`time_committed\`, \`commit_order\` FROM \`learning_command_receipt\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_command_receipt\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_command_receipt\` RENAME TO \`learning_command_receipt\`;`)
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
      yield* LearnerNavigationConstraintSchema.install(tx)
    })
  },
} satisfies DatabaseMigration.Migration
