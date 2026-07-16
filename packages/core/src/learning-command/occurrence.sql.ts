import { check, foreignKey, index, integer, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import type { MessageID, PartID } from "../v1/session"
import { MessageTable, PartTable } from "../session/sql"
import { SessionSchema } from "../session/schema"
import type { OccurrenceID, PresentationProvenance } from "./occurrence-schema"

export const AdmittedLearnerOccurrenceTable = sqliteTable(
  "learning_admitted_occurrence",
  {
    id: text().$type<OccurrenceID>().primaryKey(),
    origin_session_id: text().$type<SessionSchema.ID>().notNull(),
    origin_message_id: text().$type<MessageID>().notNull(),
    time_admitted: integer().notNull(),
  },
  (table) => [
    unique("learning_admitted_occurrence_origin_unique").on(table.origin_session_id, table.origin_message_id),
    check("learning_admitted_occurrence_time_nonnegative", sql`${table.time_admitted} >= 0`),
  ],
)

export const LearnerOccurrencePresentationTable = sqliteTable(
  "learning_occurrence_presentation",
  {
    message_id: text().$type<MessageID>().primaryKey(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    provenance: text().$type<PresentationProvenance>().notNull(),
    source_message_id: text().$type<MessageID>(),
    content_fingerprint: text().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.message_id], foreignColumns: [MessageTable.id] }).onDelete("cascade"),
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    check(
      "learning_occurrence_presentation_provenance",
      sql`${table.provenance} IN ('origin', 'compaction_replay', 'fork_clone')`,
    ),
    check(
      "learning_occurrence_presentation_source_shape",
      sql`(${table.provenance} = 'origin' AND ${table.source_message_id} IS NULL) OR (${table.provenance} <> 'origin' AND ${table.source_message_id} IS NOT NULL)`,
    ),
    check("learning_occurrence_presentation_fingerprint", sql`length(${table.content_fingerprint}) = 64`),
    check("learning_occurrence_presentation_time_nonnegative", sql`${table.time_created} >= 0`),
    uniqueIndex("learning_occurrence_origin_once_idx")
      .on(table.occurrence_id)
      .where(sql`${table.provenance} = 'origin'`),
    index("learning_occurrence_presentation_occurrence_idx").on(table.occurrence_id, table.message_id),
  ],
)

export const LearnerOccurrenceTombstoneTable = sqliteTable(
  "learning_occurrence_tombstone",
  {
    occurrence_id: text().$type<OccurrenceID>().primaryKey(),
    reason: text().$type<"source_unavailable">().notNull(),
    time_deleted: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "cascade",
    ),
    check("learning_occurrence_tombstone_reason", sql`${table.reason} = 'source_unavailable'`),
    check("learning_occurrence_tombstone_time_nonnegative", sql`${table.time_deleted} >= 0`),
  ],
)

export const HistoricalLearningToolPresentationTable = sqliteTable(
  "learning_historical_tool_presentation",
  {
    part_id: text().$type<PartID>().primaryKey(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    source_session_id: text().$type<SessionSchema.ID>().notNull(),
    source_assistant_message_id: text().$type<MessageID>().notNull(),
    source_part_id: text().$type<PartID>().notNull(),
    provenance: text().$type<"fork_clone">().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.part_id], foreignColumns: [PartTable.id] }).onDelete("cascade"),
    check("learning_historical_tool_presentation_provenance", sql`${table.provenance} = 'fork_clone'`),
    check("learning_historical_tool_presentation_time_nonnegative", sql`${table.time_created} >= 0`),
    index("learning_historical_tool_presentation_source_idx").on(table.source_session_id, table.source_part_id),
  ],
)
