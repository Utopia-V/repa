import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { PolicyID, TransitionID } from "./schema"

export const RetainedSteeringStateTable = sqliteTable(
  "retained_steering_state",
  {
    singleton: integer().primaryKey().default(1),
    steering_revision: integer().notNull().default(0),
    latest_cut_as_of: integer().notNull().default(0),
  },
  (table) => [
    check("retained_steering_state_singleton", sql`${table.singleton} = 1`),
    check(
      "retained_steering_state_nonnegative",
      sql`${table.steering_revision} >= 0 AND ${table.latest_cut_as_of} >= 0`,
    ),
  ],
)

export const RetainedSteeringPolicyTable = sqliteTable(
  "retained_steering_policy",
  {
    id: text().$type<PolicyID>().primaryKey(),
    time_created: integer().notNull(),
  },
  (table) => [check("retained_steering_policy_time_nonnegative", sql`${table.time_created} >= 0`)],
)

export const RetainedSteeringCommitSealTable = sqliteTable(
  "retained_steering_commit_seal",
  {
    transition_id: text().$type<TransitionID>().primaryKey(),
    receipt_id: text().notNull(),
    invocation_part_id: text().notNull(),
  },
  (table) => [
    unique("retained_steering_commit_seal_receipt_unique").on(table.receipt_id),
    unique("retained_steering_commit_seal_invocation_unique").on(table.invocation_part_id),
  ],
)

export const RetainedSteeringTransitionTable = sqliteTable(
  "retained_steering_transition",
  {
    id: text().$type<TransitionID>().primaryKey(),
    commit_seal_id: text().$type<TransitionID>().notNull(),
    policy_id: text().$type<PolicyID>().notNull(),
    version: integer().notNull(),
    predecessor_id: text().$type<TransitionID>(),
    previous_state: text().$type<"absent" | "operative" | "retracted">().notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    source_order: integer().notNull(),
    state: text().$type<"operative" | "retracted">().notNull(),
    scope: text().$type<"learning_wide">().notNull(),
    source_excerpt: text().notNull(),
    operative_instruction: text(),
    learner_reason: text(),
    effective_from: integer(),
    valid_until: integer(),
    valid_until_source: text(),
    valid_until_normalized: text(),
    boundary_timezone: text(),
    boundary_utc_offset_minutes: integer(),
    semantic_fingerprint: text().notNull(),
    steering_revision: integer().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
    frontier_time: integer().notNull(),
    acknowledgement_title: text().notNull(),
    acknowledgement_body: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.commit_seal_id],
      foreignColumns: [RetainedSteeringCommitSealTable.transition_id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.policy_id], foreignColumns: [RetainedSteeringPolicyTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.predecessor_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    unique("retained_steering_policy_version_unique").on(table.policy_id, table.version),
    unique("retained_steering_predecessor_unique").on(table.predecessor_id),
    unique("retained_steering_occurrence_unique").on(table.occurrence_id),
    unique("retained_steering_source_order_unique").on(table.source_order),
    unique("retained_steering_revision_unique").on(table.steering_revision),
    unique("retained_steering_frontier_unique").on(table.frontier_sequence),
    check("retained_steering_commit_seal_identity", sql`${table.commit_seal_id} = ${table.id}`),
    check(
      "retained_steering_chain_shape",
      sql`(${table.version} = 1 AND ${table.predecessor_id} IS NULL AND ${table.previous_state} = 'absent') OR (${table.version} > 1 AND ${table.predecessor_id} IS NOT NULL AND ${table.previous_state} IN ('operative', 'retracted'))`,
    ),
    check("retained_steering_state", sql`${table.state} IN ('operative', 'retracted')`),
    check("retained_steering_scope", sql`${table.scope} = 'learning_wide'`),
    check(
      "retained_steering_result_shape",
      sql`COALESCE((${table.state} = 'operative' AND ${table.operative_instruction} IS NOT NULL AND length(${table.operative_instruction}) > 0 AND ${table.effective_from} IS NOT NULL AND ${table.valid_until} IS NOT NULL AND ${table.valid_until_source} IS NOT NULL AND length(${table.valid_until_source}) > 0 AND ${table.valid_until_normalized} IS NOT NULL AND length(${table.valid_until_normalized}) > 0 AND ${table.boundary_timezone} IS NOT NULL AND length(${table.boundary_timezone}) > 0 AND ${table.boundary_utc_offset_minutes} IS NOT NULL AND ${table.boundary_utc_offset_minutes} BETWEEN -840 AND 840 AND ${table.valid_until} > ${table.effective_from}) OR (${table.state} = 'retracted' AND ${table.operative_instruction} IS NULL AND ${table.effective_from} IS NULL AND ${table.valid_until} IS NULL AND ${table.valid_until_source} IS NULL AND ${table.valid_until_normalized} IS NULL AND ${table.boundary_timezone} IS NULL AND ${table.boundary_utc_offset_minutes} IS NULL), 0)`,
    ),
    check("retained_steering_source_excerpt", sql`length(${table.source_excerpt}) > 0`),
    check(
      "retained_steering_fingerprint",
      sql`length(${table.semantic_fingerprint}) = 64 AND ${table.semantic_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "retained_steering_time_order",
      sql`${table.version} >= 1 AND ${table.source_order} >= 1 AND ${table.steering_revision} >= 1 AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    check(
      "retained_steering_acknowledgement",
      sql`length(${table.acknowledgement_title}) > 0 AND length(${table.acknowledgement_body}) > 0`,
    ),
    index("retained_steering_history_idx").on(table.policy_id, table.version, table.id),
    index("retained_steering_active_idx").on(table.state, table.valid_until, table.source_order),
  ],
)
