import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV24, triggerNames as triggerNamesV24 } from "../../schema-extras-v24"

export default {
  id: "20260813124045_gate22_restore_lineage_followup",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      yield* Effect.forEach(triggerNamesV24, (name) => tx.run(`DROP TRIGGER IF EXISTS \`${name}\`;`), {
        discard: true,
      })
      yield* tx.run(`
        CREATE TABLE \`learner_home_identity\` (
          \`singleton\` integer PRIMARY KEY,
          \`id\` text NOT NULL UNIQUE,
          CONSTRAINT "learner_home_identity_singleton" CHECK("singleton" = 1),
          CONSTRAINT "learner_home_identity_shape" CHECK(length("id") = 36 AND substr("id", 1, 4) = 'lhm_'
                AND substr("id", 5) NOT GLOB '*[^0-9a-f]*')
        );
      `)
      yield* tx.run(`
        INSERT INTO learner_home_identity(singleton, id)
        VALUES (1, 'lhm_' || lower(hex(randomblob(16))));
      `)
      yield* tx.run(`ALTER TABLE \`session_administrative_history_message\` ADD \`source_time_created\` integer;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_session_deletion_audit_record\` (
          \`bundle_id\` text NOT NULL,
          \`operation_id\` text NOT NULL,
          \`owner_kind\` text NOT NULL,
          \`record_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          \`revision_version\` integer NOT NULL,
          \`context_classification\` text NOT NULL,
          \`exact_read\` integer NOT NULL,
          \`typed_citation\` integer NOT NULL,
          CONSTRAINT \`session_deletion_audit_record_pk\` PRIMARY KEY(\`bundle_id\`, \`operation_id\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`),
          CONSTRAINT \`fk_session_deletion_audit_record_bundle_id_operation_id_session_deletion_audit_operation_bundle_id_operation_id_fk\` FOREIGN KEY (\`bundle_id\`,\`operation_id\`) REFERENCES \`session_deletion_audit_operation\`(\`bundle_id\`,\`operation_id\`) ON DELETE CASCADE,
          CONSTRAINT "session_deletion_audit_record_shape" CHECK(length("record_id") > 0 AND length("revision_id") > 0 AND "revision_version" >= 0
                AND "context_classification" IN ('not_entered', 'locator_only', 'semantic_full')
                AND ("context_classification" <> 'not_entered' OR "exact_read" = 1 OR "typed_citation" = 1))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_session_deletion_audit_record\`(\`bundle_id\`, \`operation_id\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`, \`context_classification\`, \`exact_read\`, \`typed_citation\`) SELECT \`bundle_id\`, \`operation_id\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`, \`context_classification\`, \`exact_read\`, \`typed_citation\` FROM \`session_deletion_audit_record\`;`,
      )
      yield* tx.run(`DROP TABLE \`session_deletion_audit_record\`;`)
      yield* tx.run(`ALTER TABLE \`__new_session_deletion_audit_record\` RENAME TO \`session_deletion_audit_record\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_turn_lineage_record_relation\` (
          \`assistant_message_id\` text NOT NULL,
          \`relation_kind\` text NOT NULL,
          \`owner_kind\` text NOT NULL,
          \`record_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          \`revision_version\` integer NOT NULL,
          \`producer_part_id\` text NOT NULL,
          \`producer_version\` integer NOT NULL,
          CONSTRAINT \`turn_lineage_record_relation_pk\` PRIMARY KEY(\`assistant_message_id\`, \`relation_kind\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`),
          CONSTRAINT \`fk_turn_lineage_record_relation_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_lineage_record_relation_shape" CHECK("relation_kind" IN ('exact_read', 'typed_citation') AND length("record_id") > 0
                AND length("revision_id") > 0 AND "revision_version" >= 0
                AND length("producer_part_id") > 0 AND "producer_version" >= 1)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_turn_lineage_record_relation\`(\`assistant_message_id\`, \`relation_kind\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`, \`producer_part_id\`, \`producer_version\`) SELECT \`assistant_message_id\`, \`relation_kind\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`, \`producer_part_id\`, \`producer_version\` FROM \`turn_lineage_record_relation\`;`,
      )
      yield* tx.run(`DROP TABLE \`turn_lineage_record_relation\`;`)
      yield* tx.run(`ALTER TABLE \`__new_turn_lineage_record_relation\` RENAME TO \`turn_lineage_record_relation\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_session_administrative_history_message\` (
          \`session_id\` text NOT NULL,
          \`message_id\` text PRIMARY KEY,
          \`ordinal\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`source_time_created\` integer,
          CONSTRAINT \`fk_session_administrative_history_message_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_session_administrative_history_message_session_id_session_administrative_history_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session_administrative_history\`(\`session_id\`) ON DELETE CASCADE,
          CONSTRAINT \`session_administrative_history_message_ordinal_unique\` UNIQUE(\`session_id\`,\`ordinal\`),
          CONSTRAINT "session_administrative_history_message_shape" CHECK("ordinal" >= 0 AND "time_created" >= 0 AND "time_created" <= 9007199254740991
                AND ("source_time_created" IS NULL OR ("source_time_created" >= 0
                  AND "source_time_created" <= 9007199254740991)))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_session_administrative_history_message\`(\`session_id\`, \`message_id\`, \`ordinal\`, \`time_created\`) SELECT \`session_id\`, \`message_id\`, \`ordinal\`, \`time_created\` FROM \`session_administrative_history_message\`;`,
      )
      yield* tx.run(`DROP TABLE \`session_administrative_history_message\`;`)
      yield* tx.run(
        `ALTER TABLE \`__new_session_administrative_history_message\` RENAME TO \`session_administrative_history_message\`;`,
      )
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE INDEX \`session_deletion_audit_record_lookup_idx\` ON \`session_deletion_audit_record\` (\`owner_kind\`,\`record_id\`,\`revision_id\`,\`revision_version\`,\`bundle_id\`);`,
      )
      yield* installSchemaExtrasV24(tx)
    })
  },
} satisfies DatabaseMigration.Migration
