import { sql } from "drizzle-orm"
import { check, foreignKey, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { MessageTable, PartTable, SessionTable } from "../session/sql"
import type { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"

export const SessionPresentationFrontierTable = sqliteTable(
  "session_presentation_frontier",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .primaryKey()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    frontier_time: integer().notNull(),
    message_count: integer().notNull(),
    frontier_version: integer().notNull(),
  },
  (table) => [
    check(
      "session_presentation_frontier_shape",
      sql`${table.frontier_time} >= 0 AND ${table.frontier_time} <= 9007199254740991
        AND ${table.message_count} >= 0 AND ${table.frontier_version} = 1`,
    ),
  ],
)

export const SessionAdministrativeHistoryTable = sqliteTable(
  "session_administrative_history",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .primaryKey()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    kind: text().$type<"offline_exact_restore" | "local_import_copy">().notNull(),
    bundle_version: integer().notNull(),
    classifier_version: integer().notNull(),
    order_version: integer().notNull(),
    source_file_fingerprint: text().notNull(),
    message_count: integer().notNull(),
    part_count: integer().notNull(),
    membership_fingerprint: text().notNull(),
    order_fingerprint: text().notNull(),
    history_frontier_time: integer().notNull(),
    imported_revert_absent: integer({ mode: "boolean" }).notNull(),
  },
  (table) => [
    check(
      "session_administrative_history_fingerprints",
      sql`length(${table.source_file_fingerprint}) = 64
        AND ${table.source_file_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.membership_fingerprint}) = 64
        AND ${table.membership_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.order_fingerprint}) = 64
        AND ${table.order_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "session_administrative_history_shape",
      sql`${table.kind} IN ('offline_exact_restore', 'local_import_copy')
        AND ${table.bundle_version} = 1 AND ${table.classifier_version} = 1 AND ${table.order_version} = 1
        AND ${table.message_count} >= 1 AND ${table.part_count} >= 1
        AND ${table.history_frontier_time} >= 0 AND ${table.history_frontier_time} <= 9007199254740991
        AND ${table.imported_revert_absent} = 1`,
    ),
  ],
)

export const SessionAdministrativeHistoryMessageTable = sqliteTable(
  "session_administrative_history_message",
  {
    session_id: text().$type<SessionSchema.ID>().notNull(),
    message_id: text()
      .$type<MessageID>()
      .primaryKey()
      .references(() => MessageTable.id, { onDelete: "cascade" }),
    ordinal: integer().notNull(),
    time_created: integer().notNull(),
    source_time_created: integer(),
  },
  (table) => [
    foreignKey({
      columns: [table.session_id],
      foreignColumns: [SessionAdministrativeHistoryTable.session_id],
    }).onDelete("cascade"),
    unique("session_administrative_history_message_ordinal_unique").on(table.session_id, table.ordinal),
    check(
      "session_administrative_history_message_shape",
      sql`${table.ordinal} >= 0 AND ${table.time_created} >= 0 AND ${table.time_created} <= 9007199254740991
        AND (${table.source_time_created} IS NULL OR (${table.source_time_created} >= 0
          AND ${table.source_time_created} <= 9007199254740991))`,
    ),
  ],
)

export const SessionAdministrativeHistoryPartTable = sqliteTable(
  "session_administrative_history_part",
  {
    session_id: text().$type<SessionSchema.ID>().notNull(),
    message_id: text().$type<MessageID>().notNull(),
    part_id: text()
      .$type<PartID>()
      .primaryKey()
      .references(() => PartTable.id, { onDelete: "cascade" }),
    message_ordinal: integer().notNull(),
    part_ordinal: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.message_id],
      foreignColumns: [SessionAdministrativeHistoryMessageTable.message_id],
    }).onDelete("cascade"),
    unique("session_administrative_history_part_ordinal_unique").on(
      table.session_id,
      table.message_ordinal,
      table.part_ordinal,
    ),
    check(
      "session_administrative_history_part_shape",
      sql`${table.message_ordinal} >= 0 AND ${table.part_ordinal} >= 0`,
    ),
  ],
)

export const SessionAdministrativeHistoryEmbeddedPartTable = sqliteTable(
  "session_administrative_history_embedded_part",
  {
    session_id: text().$type<SessionSchema.ID>().notNull(),
    message_id: text().$type<MessageID>().notNull(),
    parent_part_id: text()
      .$type<PartID>()
      .notNull()
      .references(() => SessionAdministrativeHistoryPartTable.part_id, { onDelete: "cascade" }),
    part_id: text().$type<PartID>().primaryKey(),
    message_ordinal: integer().notNull(),
    part_ordinal: integer().notNull(),
    embedded_ordinal: integer().notNull(),
  },
  (table) => [
    unique("session_administrative_history_embedded_part_ordinal_unique").on(
      table.session_id,
      table.message_ordinal,
      table.part_ordinal,
      table.embedded_ordinal,
    ),
    check(
      "session_administrative_history_embedded_part_shape",
      sql`${table.message_ordinal} >= 0 AND ${table.part_ordinal} >= 0 AND ${table.embedded_ordinal} >= 0`,
    ),
  ],
)
