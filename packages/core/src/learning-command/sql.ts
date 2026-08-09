import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Turn } from "@opencode-ai/schema/turn"
import { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"
import type { OccurrenceID } from "./occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "./occurrence.sql"
import type { AuthorizationBasis, PhysicalSettlement, ReceiptID } from "./physical-schema"

export const LearningCommandInvocationTable = sqliteTable(
  "learning_command_invocation",
  {
    part_id: text().$type<PartID>().primaryKey(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    parent_user_message_id: text().$type<MessageID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    provider_call_id: text().notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    command_name: text().notNull(),
    command_version: integer().notNull(),
    emission_ordinal: integer().notNull(),
    capability_identity: text().notNull(),
    capability_version: integer().notNull(),
    authorization_basis: text().$type<AuthorizationBasis>().notNull(),
    input_fingerprint: text().notNull(),
    status: text().$type<"admitted" | "applied" | "already_applied" | "no_change" | "error">().notNull(),
    receipt_id: text().$type<ReceiptID>(),
    settlement: text({ mode: "json" }).$type<PhysicalSettlement>(),
    time_admitted: integer().notNull(),
    time_settled: integer(),
    settlement_order: integer(),
    // Gate 8 rows migrate without fabricated Turns. New writes always fill both;
    // no FK is intentional because applied receipts outlive transcript deletion.
    turn_id: text().$type<Turn.ID>(),
    input_id: text().$type<Turn.InputID>(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    unique("learning_command_invocation_assistant_call_unique").on(table.assistant_message_id, table.provider_call_id),
    uniqueIndex("learning_command_invocation_part_status_unique").on(table.part_id, table.status),
    unique("learning_command_invocation_assistant_ordinal_unique").on(
      table.assistant_message_id,
      table.emission_ordinal,
    ),
    check("learning_command_invocation_call_nonempty", sql`length(${table.provider_call_id}) > 0`),
    check("learning_command_invocation_command_nonempty", sql`length(${table.command_name}) > 0`),
    check("learning_command_invocation_command_version", sql`${table.command_version} >= 1`),
    check("learning_command_invocation_emission_ordinal", sql`${table.emission_ordinal} >= 0`),
    check("learning_command_invocation_capability", sql`length(${table.capability_identity}) > 0`),
    check("learning_command_invocation_capability_version", sql`${table.capability_version} >= 1`),
    check(
      "learning_command_invocation_authorization_basis",
      sql`${table.authorization_basis} IN ('learner_request', 'learner_acceptance', 'agent_action')`,
    ),
    check(
      "learning_command_invocation_fingerprint",
      sql`length(${table.input_fingerprint}) = 64 AND ${table.input_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "learning_command_invocation_status",
      sql`${table.status} IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')`,
    ),
    check(
      "learning_command_invocation_settlement_shape",
      sql`(${table.status} = 'admitted' AND ${table.receipt_id} IS NULL AND ${table.settlement} IS NULL AND ${table.time_settled} IS NULL AND ${table.settlement_order} IS NULL) OR (${table.status} <> 'admitted' AND json_valid(${table.settlement}) AND json_type(${table.settlement}) = 'object' AND json_extract(${table.settlement}, '$.outcome') = ${table.status} AND json_extract(${table.settlement}, '$.settlementTime') = ${table.time_settled} AND json_extract(${table.settlement}, '$.settlementOrder') = ${table.settlement_order})`,
    ),
    check(
      "learning_command_invocation_receipt_shape",
      sql`(${table.status} IN ('applied', 'already_applied') AND ${table.receipt_id} IS NOT NULL AND length(${table.receipt_id}) > 0 AND json_extract(${table.settlement}, '$.receiptID') = ${table.receipt_id}) OR (${table.status} IN ('admitted', 'no_change', 'error') AND ${table.receipt_id} IS NULL AND (${table.settlement} IS NULL OR json_extract(${table.settlement}, '$.receiptID') IS NULL))`,
    ),
    check(
      "learning_command_invocation_time_order",
      sql`${table.time_admitted} >= 0 AND (${table.time_settled} IS NULL OR ${table.time_settled} >= ${table.time_admitted}) AND (${table.settlement_order} IS NULL OR ${table.settlement_order} >= 0)`,
    ),
    uniqueIndex("learning_command_invocation_one_mutation_idx")
      .on(table.assistant_message_id)
      .where(sql`${table.status} = 'applied'`),
    index("learning_command_invocation_session_owner_idx").on(
      table.session_id,
      table.assistant_message_id,
      table.part_id,
    ),
    index("learning_command_invocation_occurrence_idx").on(table.occurrence_id, table.part_id),
    index("learning_command_invocation_admitted_idx").on(table.status, table.session_id, table.time_admitted),
    index("learning_command_invocation_receipt_idx").on(table.receipt_id, table.part_id),
  ],
)

export const LearningCommandReceiptTable = sqliteTable(
  "learning_command_receipt",
  {
    id: text().$type<ReceiptID>().primaryKey(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    origin_session_id: text().$type<SessionSchema.ID>().notNull(),
    origin_message_id: text().$type<MessageID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    invocation_part_id: text().$type<PartID>().notNull(),
    capability_identity: text().notNull(),
    capability_version: integer().notNull(),
    authorization_basis: text().$type<AuthorizationBasis>().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    unique("learning_command_receipt_invocation_unique").on(table.invocation_part_id),
    check("learning_command_receipt_capability", sql`length(${table.capability_identity}) > 0`),
    check("learning_command_receipt_capability_version", sql`${table.capability_version} >= 1`),
    check(
      "learning_command_receipt_authorization_basis",
      sql`${table.authorization_basis} IN ('learner_request', 'learner_acceptance', 'agent_action')`,
    ),
    check("learning_command_receipt_time_order", sql`${table.time_committed} >= 0 AND ${table.commit_order} >= 0`),
    index("learning_command_receipt_occurrence_idx").on(table.occurrence_id, table.id),
  ],
)
