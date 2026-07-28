import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core"
import type { Course } from "../course"
import { CourseTable } from "../course/sql"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { AuthorizationBasis, ReceiptID } from "../learning-command/physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import type { PartID } from "../v1/session"
import type { PermissionV1 } from "../v1/permission"
import type {
  Command,
  EffectID,
  FieldName,
  GoalID,
  NonSupersededDisposition,
  OperationResult,
  RevisionID,
} from "./schema"

export const LearnerGoalStateTable = sqliteTable(
  "learner_goal_state",
  {
    singleton: integer().primaryKey().default(1),
    revision_sequence: integer().notNull().default(0),
  },
  (table) => [
    check("learner_goal_state_singleton", sql`${table.singleton} = 1`),
    check("learner_goal_state_revision_nonnegative", sql`${table.revision_sequence} >= 0`),
  ],
)

export const LearnerGoalStateGuardTable = sqliteTable(
  "learner_goal_state_guard",
  {
    singleton: integer().primaryKey(),
  },
  (table) => [
    foreignKey({ columns: [table.singleton], foreignColumns: [LearnerGoalStateTable.singleton] }).onDelete("restrict"),
    check("learner_goal_state_guard_singleton", sql`${table.singleton} = 1`),
  ],
)

export const LearnerGoalTimeZoneReleaseTable = sqliteTable(
  "learner_goal_time_zone_release",
  {
    id: text().primaryKey(),
    tzdb_version: text().notNull(),
    engine: text().notNull(),
    data_sha256: text().notNull(),
  },
  (table) => [
    check("learner_goal_time_zone_release_id", sql`length(${table.id}) > 0`),
    check("learner_goal_time_zone_release_version", sql`length(${table.tzdb_version}) > 0`),
    check("learner_goal_time_zone_release_engine", sql`length(${table.engine}) > 0`),
    check(
      "learner_goal_time_zone_release_hash",
      sql`length(${table.data_sha256}) = 64 AND ${table.data_sha256} NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
)

export const LearnerGoalTimeZoneTable = sqliteTable(
  "learner_goal_time_zone",
  {
    release_id: text().notNull(),
    name: text().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.release_id], foreignColumns: [LearnerGoalTimeZoneReleaseTable.id] }).onDelete(
      "restrict",
    ),
    primaryKey({ columns: [table.release_id, table.name] }),
    check("learner_goal_time_zone_name", sql`length(${table.name}) > 0`),
  ],
)

export const LearnerGoalTable = sqliteTable(
  "learner_goal",
  {
    id: text().$type<GoalID>().primaryKey(),
    time_created: integer().notNull(),
  },
  (table) => [
    check(
      "learner_goal_identity_format",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'gol_' AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check("learner_goal_time_nonnegative", sql`${table.time_created} >= 0`),
  ],
)

export const LearnerGoalCommandTable = sqliteTable(
  "learner_goal_command",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    semantic_fingerprint: text().notNull(),
    command_snapshot: text({ mode: "json" }).$type<Command>().notNull(),
    permission_request_id: text().$type<PermissionV1.ID>(),
    confirmation_snapshot: text({ mode: "json" }).$type<import("./schema").ConfirmationSnapshot>(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("cascade"),
    check(
      "learner_goal_command_fingerprint",
      sql`length(${table.semantic_fingerprint}) = 64 AND ${table.semantic_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "learner_goal_command_snapshot",
      sql`json_valid(${table.command_snapshot}) AND json_type(${table.command_snapshot}) = 'object'`,
    ),
    check(
      "learner_goal_command_permission",
      sql`${table.permission_request_id} IS NULL OR length(${table.permission_request_id}) > 0`,
    ),
    check(
      "learner_goal_command_confirmation",
      sql`${table.confirmation_snapshot} IS NULL OR (json_valid(${table.confirmation_snapshot}) AND json_type(${table.confirmation_snapshot}) = 'object')`,
    ),
  ],
)

export const LearnerGoalEffectTable = sqliteTable(
  "learner_goal_effect",
  {
    id: text().$type<EffectID>().primaryKey(),
    commit_seal_id: text()
      .$type<EffectID>()
      .notNull()
      .references((): AnySQLiteColumn => LearnerGoalCommitSealTable.effect_id, { onDelete: "restrict" }),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    source_order: integer().notNull(),
    semantic_fingerprint: text().notNull(),
    authorization_basis: text().$type<AuthorizationBasis>().notNull(),
    command: text({ mode: "json" }).$type<Command>().notNull(),
    operation_count: integer().notNull(),
    change_count: integer().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
    frontier_time: integer().notNull(),
    acknowledgement_title: text().notNull(),
    acknowledgement_body: text().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    unique("learner_goal_effect_occurrence_unique").on(table.occurrence_id),
    unique("learner_goal_effect_frontier_unique").on(table.frontier_sequence),
    check("learner_goal_effect_seal_identity", sql`${table.commit_seal_id} = ${table.id}`),
    check(
      "learner_goal_effect_identity_format",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'gle_' AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "learner_goal_effect_fingerprint",
      sql`length(${table.semantic_fingerprint}) = 64 AND ${table.semantic_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "learner_goal_effect_authorization",
      sql`${table.authorization_basis} IN ('learner_request', 'learner_acceptance')`,
    ),
    check("learner_goal_effect_command_json", sql`json_valid(${table.command})`),
    check(
      "learner_goal_effect_counts",
      sql`${table.operation_count} BETWEEN 1 AND 8 AND ${table.change_count} BETWEEN 1 AND ${table.operation_count}`,
    ),
    check(
      "learner_goal_effect_time_order",
      sql`${table.source_order} >= 1 AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    check(
      "learner_goal_effect_acknowledgement",
      sql`length(${table.acknowledgement_title}) > 0 AND length(${table.acknowledgement_body}) > 0`,
    ),
  ],
)

export const LearnerGoalCommitSealTable = sqliteTable(
  "learner_goal_commit_seal",
  {
    effect_id: text().$type<EffectID>().primaryKey(),
    receipt_id: text().$type<ReceiptID>().notNull(),
    invocation_part_id: text().$type<PartID>().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearnerGoalEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    unique("learner_goal_commit_seal_receipt_unique").on(table.receipt_id),
    unique("learner_goal_commit_seal_invocation_unique").on(table.invocation_part_id),
  ],
)

export const LearnerGoalRevisionTable = sqliteTable(
  "learner_goal_revision",
  {
    id: text().$type<RevisionID>().primaryKey(),
    goal_id: text().$type<GoalID>().notNull(),
    version: integer().notNull(),
    predecessor_id: text().$type<RevisionID>(),
    effect_id: text().$type<EffectID>().notNull(),
    operation_ordinal: integer().notNull(),
    revision_role: text().$type<"source" | "target">().notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    source_order: integer().notNull(),
    outcome: text().notNull(),
    scope_kind: text().$type<"learner_home" | "courses">().notNull(),
    target_kind: text().$type<"absent" | "instant" | "local_date">().notNull(),
    target_instant: integer(),
    target_local_date: text(),
    target_timezone: text(),
    target_timezone_release_id: text(),
    target_utc_offset_minutes: integer(),
    target_source_expression: text(),
    target_normalized: text(),
    target_normalization_basis: text().$type<"explicit_offset" | "source_temporal_context" | "explicit_date">(),
    disposition: text().$type<NonSupersededDisposition | "superseded">().notNull(),
    revision_order: integer().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
    frontier_time: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.predecessor_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearnerGoalEffectTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.target_timezone_release_id, table.target_timezone],
      foreignColumns: [LearnerGoalTimeZoneTable.release_id, LearnerGoalTimeZoneTable.name],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    unique("learner_goal_revision_goal_version_unique").on(table.goal_id, table.version),
    unique("learner_goal_revision_predecessor_unique").on(table.predecessor_id),
    unique("learner_goal_revision_effect_role_unique").on(
      table.effect_id,
      table.operation_ordinal,
      table.revision_role,
    ),
    unique("learner_goal_revision_order_unique").on(table.revision_order),
    check(
      "learner_goal_revision_identity_format",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'glr_' AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "learner_goal_revision_chain_shape",
      sql`(${table.version} = 1 AND ${table.predecessor_id} IS NULL) OR (${table.version} > 1 AND ${table.predecessor_id} IS NOT NULL)`,
    ),
    check("learner_goal_revision_role", sql`${table.revision_role} IN ('source', 'target')`),
    check("learner_goal_revision_outcome", sql`length(trim(${table.outcome})) > 0`),
    check("learner_goal_revision_scope", sql`${table.scope_kind} IN ('learner_home', 'courses')`),
    check(
      "learner_goal_revision_target",
      sql`COALESCE((${table.target_kind} = 'absent' AND ${table.target_instant} IS NULL AND ${table.target_local_date} IS NULL AND ${table.target_timezone} IS NULL AND ${table.target_timezone_release_id} IS NULL AND ${table.target_utc_offset_minutes} IS NULL AND ${table.target_source_expression} IS NULL AND ${table.target_normalized} IS NULL AND ${table.target_normalization_basis} IS NULL) OR (${table.target_kind} = 'instant' AND ${table.target_instant} IS NOT NULL AND ${table.target_instant} >= 0 AND ${table.target_local_date} IS NULL AND ${table.target_timezone} IS NULL AND ${table.target_timezone_release_id} IS NULL AND ${table.target_utc_offset_minutes} BETWEEN -840 AND 840 AND ${table.target_source_expression} IS NOT NULL AND length(${table.target_source_expression}) > 0 AND ${table.target_normalized} IS NOT NULL AND length(${table.target_normalized}) > 0 AND round(unixepoch(${table.target_normalized}, 'subsec') * 1000) = ${table.target_instant} AND ${table.target_normalization_basis} = 'explicit_offset') OR (${table.target_kind} = 'local_date' AND ${table.target_instant} IS NULL AND ${table.target_local_date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${table.target_local_date}) = ${table.target_local_date} AND ${table.target_timezone} IS NOT NULL AND length(${table.target_timezone}) > 0 AND ${table.target_timezone_release_id} IS NOT NULL AND length(${table.target_timezone_release_id}) > 0 AND ${table.target_utc_offset_minutes} IS NULL AND ${table.target_source_expression} IS NOT NULL AND length(${table.target_source_expression}) > 0 AND ${table.target_normalized} IS NULL AND ${table.target_normalization_basis} IN ('explicit_date', 'source_temporal_context')), 0)`,
    ),
    check(
      "learner_goal_revision_disposition",
      sql`${table.disposition} IN ('active', 'achieved', 'abandoned', 'superseded')`,
    ),
    check(
      "learner_goal_revision_order",
      sql`${table.version} >= 1 AND ${table.operation_ordinal} BETWEEN 0 AND 7 AND ${table.source_order} >= 1 AND ${table.revision_order} >= 1 AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    index("learner_goal_revision_history_idx").on(table.goal_id, table.version, table.id),
    index("learner_goal_revision_effect_idx").on(table.effect_id, table.operation_ordinal, table.revision_role),
    index("learner_goal_revision_discovery_idx").on(table.disposition, table.revision_order, table.goal_id),
  ],
)

export const LearnerGoalConditionTable = sqliteTable(
  "learner_goal_condition",
  {
    revision_id: text().$type<RevisionID>().notNull(),
    ordinal: integer().notNull(),
    content: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.ordinal] }),
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    check("learner_goal_condition_ordinal", sql`${table.ordinal} BETWEEN 0 AND 15`),
    check("learner_goal_condition_content", sql`length(trim(${table.content})) > 0`),
  ],
)

export const LearnerGoalCourseScopeTable = sqliteTable(
  "learner_goal_course_scope",
  {
    revision_id: text().$type<RevisionID>().notNull(),
    course_id: text().$type<Course.CourseID>().notNull(),
    course_title: text().notNull(),
    admission_kind: text().$type<"new" | "carried">().notNull(),
    admitted_course_version: integer(),
    admitted_course_time_updated: integer(),
    carried_from_revision_id: text().$type<RevisionID>(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.course_id] }),
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.carried_from_revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete(
      "restrict",
    ),
    check("learner_goal_course_scope_title", sql`length(trim(${table.course_title})) > 0`),
    check(
      "learner_goal_course_scope_admission",
      sql`(${table.admission_kind} = 'new' AND ${table.admitted_course_version} IS NOT NULL AND ${table.admitted_course_version} >= 0 AND ${table.admitted_course_time_updated} IS NOT NULL AND ${table.admitted_course_time_updated} >= 0 AND ${table.carried_from_revision_id} IS NULL) OR (${table.admission_kind} = 'carried' AND ${table.admitted_course_version} IS NULL AND ${table.admitted_course_time_updated} IS NULL AND ${table.carried_from_revision_id} IS NOT NULL)`,
    ),
    index("learner_goal_course_scope_course_idx").on(table.course_id, table.revision_id),
  ],
)

export const LearnerGoalFieldBasisTable = sqliteTable(
  "learner_goal_field_basis",
  {
    revision_id: text().$type<RevisionID>().notNull(),
    field: text().$type<FieldName>().notNull(),
    basis_kind: text().$type<"authored" | "accepted" | "carried">().notNull(),
    source_excerpt: text(),
    predecessor_revision_id: text().$type<RevisionID>(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.field] }),
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.predecessor_revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete(
      "restrict",
    ),
    check(
      "learner_goal_field_basis_field",
      sql`${table.field} IN ('outcome', 'conditions', 'scope', 'target', 'disposition')`,
    ),
    check(
      "learner_goal_field_basis_shape",
      sql`(${table.basis_kind} = 'authored' AND ${table.source_excerpt} IS NOT NULL AND length(${table.source_excerpt}) > 0 AND ${table.predecessor_revision_id} IS NULL) OR (${table.basis_kind} = 'accepted' AND ${table.source_excerpt} IS NULL AND ${table.predecessor_revision_id} IS NULL) OR (${table.basis_kind} = 'carried' AND ${table.source_excerpt} IS NULL AND ${table.predecessor_revision_id} IS NOT NULL)`,
    ),
  ],
)

export const LearnerGoalSupersessionTable = sqliteTable(
  "learner_goal_supersession",
  {
    revision_id: text().$type<RevisionID>().primaryKey(),
    source_goal_id: text().$type<GoalID>().notNull(),
    target_goal_id: text().$type<GoalID>().notNull(),
    target_revision_id: text().$type<RevisionID>().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.source_goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.target_goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.target_revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete(
      "restrict",
    ),
    check("learner_goal_supersession_distinct", sql`${table.source_goal_id} <> ${table.target_goal_id}`),
    index("learner_goal_supersession_target_idx").on(table.target_goal_id, table.revision_id),
  ],
)

export const LearnerGoalEffectOperationTable = sqliteTable(
  "learner_goal_effect_operation",
  {
    effect_id: text().$type<EffectID>().notNull(),
    ordinal: integer().notNull(),
    operation_kind: text().$type<"create" | "update" | "replace">().notNull(),
    result_kind: text().$type<"changed" | "no_change">().notNull(),
    goal_id: text().$type<GoalID>().notNull(),
    revision_id: text().$type<RevisionID>().notNull(),
    version: integer().notNull(),
    disposition: text().$type<NonSupersededDisposition | "superseded">().notNull(),
    meaning: text({ mode: "json" }).$type<OperationResult["meaning"]>().notNull(),
    replacement_target_kind: text().$type<"existing" | "new">(),
    replacement_target_goal_id: text().$type<GoalID>(),
    replacement_target_revision_id: text().$type<RevisionID>(),
    replacement_target_version: integer(),
  },
  (table) => [
    primaryKey({ columns: [table.effect_id, table.ordinal] }),
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearnerGoalEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.replacement_target_goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.replacement_target_revision_id],
      foreignColumns: [LearnerGoalRevisionTable.id],
    }).onDelete("restrict"),
    check("learner_goal_effect_operation_ordinal", sql`${table.ordinal} BETWEEN 0 AND 7`),
    check(
      "learner_goal_effect_operation_kind",
      sql`${table.operation_kind} IN ('create', 'update', 'replace') AND ${table.result_kind} IN ('changed', 'no_change')`,
    ),
    check(
      "learner_goal_effect_operation_result",
      sql`(${table.operation_kind} = 'update' OR ${table.result_kind} = 'changed') AND ${table.version} >= 1 AND ${table.disposition} IN ('active', 'achieved', 'abandoned', 'superseded') AND json_valid(${table.meaning})`,
    ),
    check(
      "learner_goal_effect_operation_replacement",
      sql`(${table.operation_kind} = 'replace' AND ${table.result_kind} = 'changed' AND ${table.disposition} = 'superseded' AND ${table.replacement_target_kind} IN ('existing', 'new') AND ${table.replacement_target_goal_id} IS NOT NULL AND ${table.replacement_target_revision_id} IS NOT NULL AND ${table.replacement_target_version} >= 1) OR (${table.operation_kind} <> 'replace' AND ${table.replacement_target_kind} IS NULL AND ${table.replacement_target_goal_id} IS NULL AND ${table.replacement_target_revision_id} IS NULL AND ${table.replacement_target_version} IS NULL)`,
    ),
  ],
)
