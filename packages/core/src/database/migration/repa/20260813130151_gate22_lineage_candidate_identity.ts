import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV24, triggerNames as triggerNamesV24 } from "../../schema-extras-v24"

export default {
  id: "20260813130151_gate22_lineage_candidate_identity",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      yield* Effect.forEach(triggerNamesV24, (name) => tx.run(`DROP TRIGGER IF EXISTS \`${name}\`;`), {
        discard: true,
      })
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_turn_tool_candidate\` (
          \`part_id\` text PRIMARY KEY,
          \`turn_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`call_id\` text NOT NULL,
          \`tool\` text NOT NULL,
          \`emission_ordinal\` integer NOT NULL,
          \`state\` text DEFAULT 'pending_admission' NOT NULL,
          \`normalized_envelope\` text NOT NULL,
          \`envelope_fingerprint\` text NOT NULL,
          \`time_registered\` integer NOT NULL,
          \`time_terminal\` integer,
          \`exhaustion_turn_id\` text,
          \`future_attention_service_source\` text DEFAULT 'internal_control' NOT NULL,
          CONSTRAINT \`fk_turn_tool_candidate_turn_id_turn_id_fk\` FOREIGN KEY (\`turn_id\`) REFERENCES \`turn\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_tool_candidate_turn_id_assistant_message_id_session_id_turn_model_operation_turn_id_assistant_message_id_session_id_fk\` FOREIGN KEY (\`turn_id\`,\`assistant_message_id\`,\`session_id\`) REFERENCES \`turn_model_operation\`(\`turn_id\`,\`assistant_message_id\`,\`session_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_tool_candidate_exhaustion_turn_id_turn_id_fk\` FOREIGN KEY (\`exhaustion_turn_id\`) REFERENCES \`turn\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`turn_candidate_turn_part_unique\` UNIQUE(\`turn_id\`,\`part_id\`),
          CONSTRAINT \`turn_candidate_part_model_unique\` UNIQUE(\`part_id\`,\`assistant_message_id\`),
          CONSTRAINT \`turn_candidate_turn_part_model_unique\` UNIQUE(\`turn_id\`,\`part_id\`,\`assistant_message_id\`),
          CONSTRAINT "turn_candidate_ordinal_nonnegative" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "turn_candidate_fingerprint" CHECK(length("envelope_fingerprint") = 64),
          CONSTRAINT "turn_candidate_time_nonnegative" CHECK("time_registered" >= 0),
          CONSTRAINT "turn_candidate_state_shape" CHECK(("state" IN ('pending_admission', 'admitted') AND "time_terminal" IS NULL AND "exhaustion_turn_id" IS NULL) OR ("state" IN ('not_started_interrupted', 'not_started_failed') AND "time_terminal" IS NOT NULL AND "time_terminal" >= "time_registered" AND "exhaustion_turn_id" IS NULL) OR ("state" IN ('not_started_limit', 'not_started_turn_exhausted') AND "time_terminal" IS NOT NULL AND "time_terminal" >= "time_registered" AND "exhaustion_turn_id" = "turn_id"))
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_turn_tool_candidate\`(\`part_id\`, \`turn_id\`, \`session_id\`, \`assistant_message_id\`, \`call_id\`, \`tool\`, \`emission_ordinal\`, \`state\`, \`normalized_envelope\`, \`envelope_fingerprint\`, \`time_registered\`, \`time_terminal\`, \`exhaustion_turn_id\`, \`future_attention_service_source\`) SELECT \`part_id\`, \`turn_id\`, \`session_id\`, \`assistant_message_id\`, \`call_id\`, \`tool\`, \`emission_ordinal\`, \`state\`, \`normalized_envelope\`, \`envelope_fingerprint\`, \`time_registered\`, \`time_terminal\`, \`exhaustion_turn_id\`, \`future_attention_service_source\` FROM \`turn_tool_candidate\`;`,
      )
      yield* tx.run(`DROP TABLE \`turn_tool_candidate\`;`)
      yield* tx.run(`ALTER TABLE \`__new_turn_tool_candidate\` RENAME TO \`turn_tool_candidate\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`turn_candidate_model_emission_idx\` ON \`turn_tool_candidate\` (\`assistant_message_id\`,\`emission_ordinal\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`turn_candidate_model_call_idx\` ON \`turn_tool_candidate\` (\`assistant_message_id\`,\`call_id\`);`,
      )
      yield* installSchemaExtrasV24(tx)
    })
  },
} satisfies DatabaseMigration.Migration
