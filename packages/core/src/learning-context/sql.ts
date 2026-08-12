import { sql } from "drizzle-orm"
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { TurnModelOperationTable } from "../turn/sql"
import type { MessageID } from "../v1/session"
import { MAX_CANONICAL_BYTES, MAX_RENDERED_BYTES } from "./schema"

export const TurnLearningContextCutTable = sqliteTable(
  "turn_learning_context_cut",
  {
    assistant_message_id: text()
      .$type<MessageID>()
      .primaryKey()
      .references(() => TurnModelOperationTable.assistant_message_id, { onDelete: "cascade" }),
    canonical_cut: text().notNull(),
    canonical_bytes: integer().notNull(),
    cut_fingerprint: text().notNull(),
    cut_as_of: integer().notNull(),
    rendered_block: text().notNull(),
    rendered_bytes: integer().notNull(),
    rendered_fingerprint: text().notNull(),
  },
  (table) => [
    check(
      "turn_learning_context_cut_canonical_shape",
      sql`COALESCE((json_valid(${table.canonical_cut})
        AND json_type(${table.canonical_cut}) = 'object'
        AND json_extract(${table.canonical_cut}, '$.schemaVersion') = 1
        AND ((json_extract(${table.canonical_cut}, '$.policyVersion') = 1
            AND json_extract(${table.canonical_cut}, '$.rendererVersion') = 1)
          OR (json_extract(${table.canonical_cut}, '$.policyVersion') = 2
            AND json_extract(${table.canonical_cut}, '$.rendererVersion') = 2)
          OR (json_extract(${table.canonical_cut}, '$.policyVersion') = 3
            AND json_extract(${table.canonical_cut}, '$.rendererVersion') = 3)
          OR (json_extract(${table.canonical_cut}, '$.policyVersion') = 4
            AND json_extract(${table.canonical_cut}, '$.rendererVersion') = 4)
          OR (json_extract(${table.canonical_cut}, '$.policyVersion') = 5
            AND json_extract(${table.canonical_cut}, '$.rendererVersion') = 5)
          OR (json_extract(${table.canonical_cut}, '$.policyVersion') = 6
            AND json_extract(${table.canonical_cut}, '$.rendererVersion') = 6)
          OR (json_extract(${table.canonical_cut}, '$.policyVersion') = 6
            AND json_extract(${table.canonical_cut}, '$.rendererVersion') = 7))
        AND json_extract(${table.canonical_cut}, '$.operation.assistantMessageID') = ${table.assistant_message_id}
        AND json_extract(${table.canonical_cut}, '$.cutAsOf') = ${table.cut_as_of}
        AND json_extract(${table.canonical_cut}, '$.budget.canonicalBytes') = ${table.canonical_bytes}
        AND json_extract(${table.canonical_cut}, '$.budget.renderedBytes') = ${table.rendered_bytes}
        AND json_extract(${table.canonical_cut}, '$.fingerprint') = ${table.cut_fingerprint}
        AND json_extract(${table.canonical_cut}, '$.renderedFingerprint') = ${table.rendered_fingerprint}), FALSE)`,
    ),
    check(
      "turn_learning_context_cut_bytes",
      sql`${table.canonical_bytes} = length(CAST(${table.canonical_cut} AS BLOB))
        AND ${table.canonical_bytes} BETWEEN 1 AND ${sql.raw(String(MAX_CANONICAL_BYTES))}
        AND ${table.rendered_bytes} = length(CAST(${table.rendered_block} AS BLOB))
        AND ${table.rendered_bytes} BETWEEN 1 AND ${sql.raw(String(MAX_RENDERED_BYTES))}`,
    ),
    check(
      "turn_learning_context_cut_fingerprints",
      sql`length(${table.cut_fingerprint}) = 64
        AND ${table.cut_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.rendered_fingerprint}) = 64
        AND ${table.rendered_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check("turn_learning_context_cut_time", sql`${table.cut_as_of} >= 0`),
  ],
)

export const TurnModelCapacityTable = sqliteTable(
  "turn_model_capacity",
  {
    assistant_message_id: text()
      .$type<MessageID>()
      .primaryKey()
      .references(() => TurnModelOperationTable.assistant_message_id, { onDelete: "cascade" }),
    canonical_assessment: text().notNull(),
    assessment_bytes: integer().notNull(),
    assessment_fingerprint: text().notNull(),
    envelope_fingerprint: text().notNull(),
    classification: text({ enum: ["capacity_known", "capacity_unknown", "capacity_invalid"] }).notNull(),
    decision: text({ enum: ["fit", "uncertain", "history_overflow", "fixed_overflow", "invalid_limits"] }).notNull(),
  },
  (table) => [
    check(
      "turn_model_capacity_shape",
      sql`json_valid(${table.canonical_assessment})
        AND json_type(${table.canonical_assessment}) = 'object'
        AND json_extract(${table.canonical_assessment}, '$.schemaVersion') = 1
        AND json_extract(${table.canonical_assessment}, '$.assistantMessageID') = ${table.assistant_message_id}
        AND json_extract(${table.canonical_assessment}, '$.fingerprint') = ${table.assessment_fingerprint}
        AND json_extract(${table.canonical_assessment}, '$.envelopeFingerprint') = ${table.envelope_fingerprint}
        AND json_extract(${table.canonical_assessment}, '$.classification') = ${table.classification}
        AND json_extract(${table.canonical_assessment}, '$.decision') = ${table.decision}`,
    ),
    check(
      "turn_model_capacity_bytes",
      sql`${table.assessment_bytes} = length(CAST(${table.canonical_assessment} AS BLOB))
        AND ${table.assessment_bytes} > 0`,
    ),
    check(
      "turn_model_capacity_fingerprints",
      sql`length(${table.assessment_fingerprint}) = 64
        AND ${table.assessment_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.envelope_fingerprint}) = 64
        AND ${table.envelope_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
)
