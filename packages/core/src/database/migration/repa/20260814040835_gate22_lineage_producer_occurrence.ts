import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260814040835_gate22_lineage_producer_occurrence",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
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
          CONSTRAINT \`turn_lineage_record_relation_pk\` PRIMARY KEY(\`assistant_message_id\`, \`relation_kind\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`, \`producer_part_id\`),
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
    })
  },
} satisfies DatabaseMigration.Migration
