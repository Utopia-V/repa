import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260814012438_gate22_lineage_legacy_capture",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`turn_lineage_pre_migration_operation\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`capture_schema_version\` integer NOT NULL,
          CONSTRAINT \`fk_turn_lineage_pre_migration_operation_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_lineage_pre_migration_operation_shape" CHECK("capture_schema_version" = 1)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        INSERT INTO \`turn_lineage_pre_migration_operation\`(\`assistant_message_id\`, \`capture_schema_version\`)
        SELECT operation.\`assistant_message_id\`, 1
        FROM \`turn_model_operation\` AS operation
        LEFT JOIN \`turn_lineage_operation_coverage\` AS coverage
          ON coverage.\`assistant_message_id\` = operation.\`assistant_message_id\`
        WHERE coverage.\`assistant_message_id\` IS NULL;
      `)
    })
  },
} satisfies DatabaseMigration.Migration
