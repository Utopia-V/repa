import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260822113040_gate22_learning_inspection",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`turn_lineage_context_relation\` (
          \`assistant_message_id\` text NOT NULL,
          \`owner_kind\` text NOT NULL,
          \`record_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          \`revision_version\` integer NOT NULL,
          \`context_classification\` text NOT NULL,
          CONSTRAINT \`turn_lineage_context_relation_pk\` PRIMARY KEY(\`assistant_message_id\`, \`owner_kind\`, \`record_id\`, \`revision_id\`, \`revision_version\`),
          CONSTRAINT \`fk_turn_lineage_context_relation_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_lineage_context_relation_shape" CHECK("owner_kind" IN (
                  'course', 'learning_navigation', 'learner_goal', 'learning_material', 'learning_interaction',
                  'learner_response_evidence', 'future_attention', 'assignment', 'learner_state_judgment',
                  'advisory_plan_suggestion'
                )
                AND length("record_id") > 0
                AND length("revision_id") > 0 AND "revision_version" >= 0
                AND "context_classification" IN ('locator_only', 'semantic_full'))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `CREATE INDEX \`turn_lineage_context_relation_record_idx\` ON \`turn_lineage_context_relation\` (\`owner_kind\`,\`record_id\`,\`revision_id\`,\`revision_version\`,\`assistant_message_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`turn_lineage_record_relation_record_idx\` ON \`turn_lineage_record_relation\` (\`owner_kind\`,\`record_id\`,\`revision_id\`,\`revision_version\`,\`assistant_message_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`turn_terminal_root_discovery_idx\` ON \`turn\` (\`time_terminal\`,\`id\`) WHERE "turn"."depth" = 0 AND "turn"."state" <> 'running';`,
      )
      yield* tx.run(
        `CREATE INDEX \`turn_unavailable_root_discovery_idx\` ON \`turn_unavailable_source\` (\`time_terminal\`,\`turn_id\`) WHERE "turn_unavailable_source"."depth" = 0;`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
