import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260716045209_learning_command_settlement",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`learning_admitted_occurrence\` (
          \`id\` text PRIMARY KEY,
          \`origin_session_id\` text NOT NULL,
          \`origin_message_id\` text NOT NULL,
          \`time_admitted\` integer NOT NULL,
          CONSTRAINT \`learning_admitted_occurrence_origin_unique\` UNIQUE(\`origin_session_id\`,\`origin_message_id\`),
          CONSTRAINT "learning_admitted_occurrence_time_nonnegative" CHECK("time_admitted" >= 0)
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
          \`effect_id\` text,
          \`settlement\` text,
          \`time_admitted\` integer NOT NULL,
          \`time_settled\` integer,
          \`settlement_order\` integer,
          CONSTRAINT \`fk_learning_command_invocation_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_invocation_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_command_invocation_assistant_call_unique\` UNIQUE(\`assistant_message_id\`,\`provider_call_id\`),
          CONSTRAINT \`learning_command_invocation_assistant_ordinal_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learning_command_invocation_call_nonempty" CHECK(length("provider_call_id") > 0),
          CONSTRAINT "learning_command_invocation_command" CHECK("command_name" = 'accept_course_view_revision'),
          CONSTRAINT "learning_command_invocation_command_version" CHECK("command_version" = 1),
          CONSTRAINT "learning_command_invocation_emission_ordinal" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "learning_command_invocation_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_invocation_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_invocation_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_invocation_fingerprint" CHECK(length("input_fingerprint") = 64),
          CONSTRAINT "learning_command_invocation_status" CHECK("status" IN ('admitted', 'applied', 'already_applied', 'error')),
          CONSTRAINT "learning_command_invocation_settlement_shape" CHECK(("status" = 'admitted' AND "settlement" IS NULL AND "time_settled" IS NULL AND "settlement_order" IS NULL AND "effect_id" IS NULL) OR ("status" <> 'admitted' AND "settlement" IS NOT NULL AND "time_settled" IS NOT NULL AND "settlement_order" IS NOT NULL)),
          CONSTRAINT "learning_command_invocation_effect_shape" CHECK(("status" IN ('applied', 'already_applied') AND "effect_id" IS NOT NULL) OR ("status" IN ('admitted', 'error') AND "effect_id" IS NULL)),
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
          \`effect_id\` text NOT NULL CONSTRAINT \`learning_command_receipt_effect_unique\` UNIQUE,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learning_command_receipt_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_effect_id_course_selection_acceptance_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`course_selection_acceptance_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_command_receipt_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_receipt_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_receipt_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT "learning_command_receipt_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
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
        `CREATE INDEX \`course_selection_acceptance_effect_course_idx\` ON \`course_selection_acceptance_effect\` (\`course_id\`,\`committed_selection_version\`,\`id\`);`,
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
        `CREATE INDEX \`learning_command_receipt_occurrence_idx\` ON \`learning_command_receipt\` (\`occurrence_id\`,\`id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
