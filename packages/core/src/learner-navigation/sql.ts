import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import type { PermissionV1 } from "../v1/permission"
import type { Course } from "../course"
import { CourseTable, CourseViewRevisionItemTable, CourseViewRevisionTable, CourseViewTable } from "../course/sql"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { AnchorEffectID, DefaultConfirmationSnapshot, DefaultEffectID } from "./schema"

export const DefaultCoursePreferenceTransitionTable = sqliteTable(
  "learner_default_course_transition",
  {
    id: text().$type<DefaultEffectID>().primaryKey(),
    version: integer().notNull(),
    predecessor_id: text().$type<DefaultEffectID>(),
    previous_course_id: text().$type<Course.CourseID>(),
    course_id: text().$type<Course.CourseID>(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    permission_request_id: text().$type<PermissionV1.ID>().notNull(),
    confirmation_snapshot: text({ mode: "json" }).$type<DefaultConfirmationSnapshot>().notNull(),
    target_course_version: integer(),
    target_selection_revision_id: text().$type<Course.RevisionID>(),
    target_selection_version: integer(),
    target_view_id: text().$type<Course.ViewID>(),
    target_view_version: integer(),
    target_revision_version: integer(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
    frontier_time: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.predecessor_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.previous_course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.target_view_id],
      foreignColumns: [CourseViewTable.course_id, CourseViewTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.target_view_id, table.target_selection_revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.view_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    unique("learner_default_course_version_unique").on(table.version),
    unique("learner_default_course_predecessor_unique").on(table.predecessor_id),
    unique("learner_default_course_occurrence_unique").on(table.occurrence_id),
    unique("learner_default_course_frontier_unique").on(table.frontier_sequence),
    check(
      "learner_default_course_chain_shape",
      sql`(${table.version} = 1 AND ${table.predecessor_id} IS NULL AND ${table.previous_course_id} IS NULL) OR (${table.version} > 1 AND ${table.predecessor_id} IS NOT NULL)`,
    ),
    check("learner_default_course_value_changed", sql`NOT (${table.course_id} IS ${table.previous_course_id})`),
    check(
      "learner_default_course_target_shape",
      sql`(${table.course_id} IS NULL AND ${table.target_course_version} IS NULL AND ${table.target_selection_revision_id} IS NULL AND ${table.target_selection_version} IS NULL AND ${table.target_view_id} IS NULL AND ${table.target_view_version} IS NULL AND ${table.target_revision_version} IS NULL) OR (${table.course_id} IS NOT NULL AND ${table.target_course_version} IS NOT NULL AND ${table.target_selection_version} IS NOT NULL AND ((${table.target_selection_revision_id} IS NULL AND ${table.target_view_id} IS NULL AND ${table.target_view_version} IS NULL AND ${table.target_revision_version} IS NULL) OR (${table.target_selection_revision_id} IS NOT NULL AND ${table.target_view_id} IS NOT NULL AND ${table.target_view_version} IS NOT NULL AND ${table.target_revision_version} IS NOT NULL)))`,
    ),
    check(
      "learner_default_course_versions",
      sql`${table.version} >= 1 AND (${table.target_course_version} IS NULL OR ${table.target_course_version} >= 0) AND (${table.target_selection_version} IS NULL OR ${table.target_selection_version} >= 0) AND (${table.target_view_version} IS NULL OR ${table.target_view_version} >= 0) AND (${table.target_revision_version} IS NULL OR ${table.target_revision_version} >= 0)`,
    ),
    check("learner_default_course_permission", sql`length(${table.permission_request_id}) > 0`),
    check("learner_default_course_confirmation", sql`json_valid(${table.confirmation_snapshot})`),
    check(
      "learner_default_course_time_order",
      sql`${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    index("learner_default_course_history_idx").on(table.version, table.id),
    index("learner_default_course_frontier_idx").on(table.frontier_sequence, table.version),
  ],
)

export const CourseRouteAnchorTransitionTable = sqliteTable(
  "learner_course_route_anchor_transition",
  {
    id: text().$type<AnchorEffectID>().primaryKey(),
    course_id: text().$type<Course.CourseID>().notNull(),
    version: integer().notNull(),
    predecessor_id: text().$type<AnchorEffectID>(),
    previous_view_id: text().$type<Course.ViewID>(),
    previous_revision_id: text().$type<Course.RevisionID>(),
    previous_item_id: text().$type<Course.ItemID>(),
    target_view_id: text().$type<Course.ViewID>(),
    target_revision_id: text().$type<Course.RevisionID>(),
    target_item_id: text().$type<Course.ItemID>(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    target_course_version: integer(),
    target_selection_version: integer(),
    target_view_version: integer(),
    target_revision_version: integer(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
    frontier_time: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.predecessor_id],
      foreignColumns: [table.course_id, table.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.previous_view_id, table.previous_revision_id, table.previous_item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.target_view_id, table.target_revision_id, table.target_item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    unique("learner_course_route_anchor_owner_unique").on(table.course_id, table.id),
    unique("learner_course_route_anchor_version_unique").on(table.course_id, table.version),
    unique("learner_course_route_anchor_predecessor_unique").on(table.course_id, table.predecessor_id),
    unique("learner_course_route_anchor_occurrence_unique").on(table.occurrence_id, table.course_id),
    unique("learner_course_route_anchor_frontier_unique").on(table.frontier_sequence),
    check(
      "learner_course_route_anchor_chain_shape",
      sql`(${table.version} = 1 AND ${table.predecessor_id} IS NULL AND ${table.previous_view_id} IS NULL AND ${table.previous_revision_id} IS NULL AND ${table.previous_item_id} IS NULL) OR (${table.version} > 1 AND ${table.predecessor_id} IS NOT NULL)`,
    ),
    check(
      "learner_course_route_anchor_previous_shape",
      sql`(${table.previous_view_id} IS NULL AND ${table.previous_revision_id} IS NULL AND ${table.previous_item_id} IS NULL) OR (${table.previous_view_id} IS NOT NULL AND ${table.previous_revision_id} IS NOT NULL AND ${table.previous_item_id} IS NOT NULL)`,
    ),
    check(
      "learner_course_route_anchor_target_shape",
      sql`(${table.target_view_id} IS NULL AND ${table.target_revision_id} IS NULL AND ${table.target_item_id} IS NULL AND ${table.target_course_version} IS NULL AND ${table.target_selection_version} IS NULL AND ${table.target_view_version} IS NULL AND ${table.target_revision_version} IS NULL) OR (${table.target_view_id} IS NOT NULL AND ${table.target_revision_id} IS NOT NULL AND ${table.target_item_id} IS NOT NULL AND ${table.target_course_version} IS NOT NULL AND ${table.target_selection_version} IS NOT NULL AND ${table.target_view_version} IS NOT NULL AND ${table.target_revision_version} IS NOT NULL)`,
    ),
    check(
      "learner_course_route_anchor_value_changed",
      sql`NOT (${table.target_view_id} IS ${table.previous_view_id} AND ${table.target_revision_id} IS ${table.previous_revision_id} AND ${table.target_item_id} IS ${table.previous_item_id})`,
    ),
    check(
      "learner_course_route_anchor_versions",
      sql`${table.version} >= 1 AND (${table.target_course_version} IS NULL OR ${table.target_course_version} >= 0) AND (${table.target_selection_version} IS NULL OR ${table.target_selection_version} >= 0) AND (${table.target_view_version} IS NULL OR ${table.target_view_version} >= 0) AND (${table.target_revision_version} IS NULL OR ${table.target_revision_version} >= 0)`,
    ),
    check(
      "learner_course_route_anchor_time_order",
      sql`${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    index("learner_course_route_anchor_history_idx").on(table.course_id, table.version, table.id),
    index("learner_course_route_anchor_frontier_idx").on(table.frontier_sequence, table.course_id, table.version),
  ],
)
