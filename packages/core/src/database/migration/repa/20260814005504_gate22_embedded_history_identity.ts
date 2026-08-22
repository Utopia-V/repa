import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV25, triggerNames as triggerNamesV25 } from "../../schema-extras-v25"

export default {
  id: "20260814005504_gate22_embedded_history_identity",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      yield* Effect.forEach(triggerNamesV25, (name) => tx.run(`DROP TRIGGER IF EXISTS \`${name}\`;`), {
        discard: true,
      })
      yield* tx.run(`
        CREATE TABLE \`session_administrative_history_embedded_part\` (
          \`session_id\` text NOT NULL,
          \`message_id\` text NOT NULL,
          \`parent_part_id\` text NOT NULL,
          \`part_id\` text PRIMARY KEY,
          \`message_ordinal\` integer NOT NULL,
          \`part_ordinal\` integer NOT NULL,
          \`embedded_ordinal\` integer NOT NULL,
          CONSTRAINT \`fk_session_administrative_history_embedded_part_parent_part_id_session_administrative_history_part_part_id_fk\` FOREIGN KEY (\`parent_part_id\`) REFERENCES \`session_administrative_history_part\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`session_administrative_history_embedded_part_ordinal_unique\` UNIQUE(\`session_id\`,\`message_ordinal\`,\`part_ordinal\`,\`embedded_ordinal\`),
          CONSTRAINT "session_administrative_history_embedded_part_shape" CHECK("message_ordinal" >= 0 AND "part_ordinal" >= 0 AND "embedded_ordinal" >= 0)
        ) WITHOUT ROWID;
      `)
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
          CONSTRAINT \`fk_turn_lineage_record_relation_producer_part_id_assistant_message_id_turn_tool_candidate_part_id_assistant_message_id_fk\` FOREIGN KEY (\`producer_part_id\`,\`assistant_message_id\`) REFERENCES \`turn_tool_candidate\`(\`part_id\`,\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_lineage_record_relation_shape" CHECK("relation_kind" IN ('exact_read', 'typed_citation')
                AND "owner_kind" IN (
                  'course', 'learning_navigation', 'learner_goal', 'learning_material', 'learning_interaction',
                  'learner_response_evidence', 'future_attention', 'assignment', 'learner_state_judgment',
                  'advisory_plan_suggestion'
                )
                AND length("record_id") > 0
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
          CONSTRAINT "session_deletion_audit_record_shape" CHECK("owner_kind" IN (
                  'course', 'learning_navigation', 'learner_goal', 'learning_material', 'learning_interaction',
                  'learner_response_evidence', 'future_attention', 'assignment', 'learner_state_judgment',
                  'advisory_plan_suggestion'
                )
                AND length("record_id") > 0 AND length("revision_id") > 0 AND "revision_version" >= 0
                AND "context_classification" IN ('not_entered', 'locator_only', 'semantic_full')
                AND "exact_read" IN (0, 1) AND "typed_citation" IN (0, 1)
                AND ("context_classification" <> 'not_entered' OR "exact_read" = 1 OR "typed_citation" = 1))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_session_deletion_audit_record\`(\`bundle_id\`, \`operation_id\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`, \`context_classification\`, \`exact_read\`, \`typed_citation\`) SELECT \`bundle_id\`, \`operation_id\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`, \`context_classification\`, \`exact_read\`, \`typed_citation\` FROM \`session_deletion_audit_record\`;`,
      )
      yield* tx.run(`DROP TABLE \`session_deletion_audit_record\`;`)
      yield* tx.run(`ALTER TABLE \`__new_session_deletion_audit_record\` RENAME TO \`session_deletion_audit_record\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE INDEX \`session_deletion_audit_record_lookup_idx\` ON \`session_deletion_audit_record\` (\`owner_kind\`,\`record_id\`,\`revision_id\`,\`revision_version\`,\`bundle_id\`);`,
      )
      yield* installSchemaExtrasV25(tx)
    })
  },
} satisfies DatabaseMigration.Migration
