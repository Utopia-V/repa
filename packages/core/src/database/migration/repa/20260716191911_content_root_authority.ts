import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260716191911_content_root_authority",
  up(tx) {
    return Effect.gen(function* () {
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
    })
  },
} satisfies DatabaseMigration.Migration
