import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV18 } from "../../schema-extras-v18"

export default {
  id: "20260803182615_gate18_learning_context",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`turn_learning_context_cut\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`canonical_cut\` text NOT NULL,
          \`canonical_bytes\` integer NOT NULL,
          \`cut_fingerprint\` text NOT NULL,
          \`cut_as_of\` integer NOT NULL,
          \`rendered_block\` text NOT NULL,
          \`rendered_bytes\` integer NOT NULL,
          \`rendered_fingerprint\` text NOT NULL,
          CONSTRAINT \`fk_turn_learning_context_cut_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_learning_context_cut_canonical_shape" CHECK(json_valid("canonical_cut")
                AND json_type("canonical_cut") = 'object'
                AND json_extract("canonical_cut", '$.schemaVersion') = 1
                AND json_extract("canonical_cut", '$.policyVersion') = 1
                AND json_extract("canonical_cut", '$.rendererVersion') = 1
                AND json_extract("canonical_cut", '$.operation.assistantMessageID') = "assistant_message_id"
                AND json_extract("canonical_cut", '$.cutAsOf') = "cut_as_of"
                AND json_extract("canonical_cut", '$.budget.canonicalBytes') = "canonical_bytes"
                AND json_extract("canonical_cut", '$.budget.renderedBytes') = "rendered_bytes"
                AND json_extract("canonical_cut", '$.fingerprint') = "cut_fingerprint"
                AND json_extract("canonical_cut", '$.renderedFingerprint') = "rendered_fingerprint"),
          CONSTRAINT "turn_learning_context_cut_bytes" CHECK("canonical_bytes" = length(CAST("canonical_cut" AS BLOB))
                AND "canonical_bytes" BETWEEN 1 AND 32768
                AND "rendered_bytes" = length(CAST("rendered_block" AS BLOB))
                AND "rendered_bytes" BETWEEN 1 AND 16384),
          CONSTRAINT "turn_learning_context_cut_fingerprints" CHECK(length("cut_fingerprint") = 64
                AND "cut_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("rendered_fingerprint") = 64
                AND "rendered_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "turn_learning_context_cut_time" CHECK("cut_as_of" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_model_capacity\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`canonical_assessment\` text NOT NULL,
          \`assessment_bytes\` integer NOT NULL,
          \`assessment_fingerprint\` text NOT NULL,
          \`envelope_fingerprint\` text NOT NULL,
          \`classification\` text NOT NULL,
          \`decision\` text NOT NULL,
          CONSTRAINT \`fk_turn_model_capacity_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_model_capacity_shape" CHECK(json_valid("canonical_assessment")
                AND json_type("canonical_assessment") = 'object'
                AND json_extract("canonical_assessment", '$.schemaVersion') = 1
                AND json_extract("canonical_assessment", '$.assistantMessageID') = "assistant_message_id"
                AND json_extract("canonical_assessment", '$.fingerprint') = "assessment_fingerprint"
                AND json_extract("canonical_assessment", '$.envelopeFingerprint') = "envelope_fingerprint"
                AND json_extract("canonical_assessment", '$.classification') = "classification"
                AND json_extract("canonical_assessment", '$.decision') = "decision"),
          CONSTRAINT "turn_model_capacity_bytes" CHECK("assessment_bytes" = length(CAST("canonical_assessment" AS BLOB))
                AND "assessment_bytes" > 0),
          CONSTRAINT "turn_model_capacity_fingerprints" CHECK(length("assessment_fingerprint") = 64
                AND "assessment_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("envelope_fingerprint") = 64
                AND "envelope_fingerprint" NOT GLOB '*[^0-9a-f]*')
        ) WITHOUT ROWID;
      `)
      yield* installSchemaExtrasV18(tx)
    })
  },
} satisfies DatabaseMigration.Migration
