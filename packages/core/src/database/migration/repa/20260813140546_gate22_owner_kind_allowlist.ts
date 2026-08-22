import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260813140546_gate22_owner_kind_allowlist",
  up(tx) {
    return Effect.gen(function* () {
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
      yield* tx.run(
        `CREATE INDEX \`session_deletion_audit_record_lookup_idx\` ON \`session_deletion_audit_record\` (\`owner_kind\`,\`record_id\`,\`revision_id\`,\`revision_version\`,\`bundle_id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
