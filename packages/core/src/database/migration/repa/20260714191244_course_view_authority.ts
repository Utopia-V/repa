import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260714191244_course_view_authority",
  up(tx) {
    return Effect.gen(function* () {
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
      yield* tx.run(`CREATE INDEX \`course_item_course_idx\` ON \`course_item\` (\`course_id\`,\`id\`);`)
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
    })
  },
} satisfies DatabaseMigration.Migration
