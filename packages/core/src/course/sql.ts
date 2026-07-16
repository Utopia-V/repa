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
  uniqueIndex,
} from "drizzle-orm/sqlite-core"
import type {
  AuthorshipBasis,
  CitationID,
  CourseID,
  ItemID,
  MappingGroupID,
  MappingKind,
  RevisionID,
  RevisionWithdrawalReason,
  SelectionAcceptanceEffectID,
  ViewID,
} from "./schema"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"

export const CourseTable = sqliteTable(
  "course",
  {
    id: text().$type<CourseID>().primaryKey(),
    title: text().notNull(),
    state_version: integer().notNull().default(0),
    withdrawal_reason: text().$type<"removed">(),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [
    check("course_title_length", sql`length(trim(${table.title})) BETWEEN 1 AND 200`),
    check("course_state_version_nonnegative", sql`${table.state_version} >= 0`),
    check(
      "course_withdrawal_reason",
      sql`${table.withdrawal_reason} IS NULL OR ${table.withdrawal_reason} = 'removed'`,
    ),
    index("course_discovery_idx").on(table.withdrawal_reason, table.time_created, table.id),
  ],
)

export const CourseViewTable = sqliteTable(
  "course_view",
  {
    id: text().$type<ViewID>().primaryKey(),
    course_id: text().$type<CourseID>().notNull(),
    name: text().notNull(),
    state_version: integer().notNull().default(0),
    withdrawal_reason: text().$type<"removed">(),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    unique("course_view_course_id_id_unique").on(table.course_id, table.id),
    check("course_view_name_length", sql`length(trim(${table.name})) BETWEEN 1 AND 200`),
    check("course_view_state_version_nonnegative", sql`${table.state_version} >= 0`),
    check(
      "course_view_withdrawal_reason",
      sql`${table.withdrawal_reason} IS NULL OR ${table.withdrawal_reason} = 'removed'`,
    ),
    index("course_view_discovery_idx").on(table.course_id, table.withdrawal_reason, table.time_created, table.id),
  ],
)

export const CourseItemTable = sqliteTable(
  "course_item",
  {
    id: text().$type<ItemID>().primaryKey(),
    course_id: text().$type<CourseID>().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    unique("course_item_course_id_id_unique").on(table.course_id, table.id),
    index("course_item_course_idx").on(table.course_id, table.id),
  ],
)

export const CourseViewRevisionTable = sqliteTable(
  "course_view_revision",
  {
    id: text().$type<RevisionID>().primaryKey(),
    course_id: text().$type<CourseID>().notNull(),
    view_id: text().$type<ViewID>().notNull(),
    revision_number: integer().notNull(),
    predecessor_revision_id: text().$type<RevisionID>(),
    authorship_basis: text().$type<AuthorshipBasis>().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.course_id, table.view_id],
      foreignColumns: [CourseViewTable.course_id, CourseViewTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.view_id, table.predecessor_revision_id],
      foreignColumns: [table.course_id, table.view_id, table.id],
    }).onDelete("restrict"),
    unique("course_view_revision_course_id_id_unique").on(table.course_id, table.id),
    unique("course_view_revision_course_view_id_id_unique").on(table.course_id, table.view_id, table.id),
    unique("course_view_revision_number_unique").on(table.course_id, table.view_id, table.revision_number),
    check("course_view_revision_number_positive", sql`${table.revision_number} >= 1`),
    check(
      "course_view_revision_predecessor_shape",
      sql`(${table.revision_number} = 1 AND ${table.predecessor_revision_id} IS NULL) OR (${table.revision_number} > 1 AND ${table.predecessor_revision_id} IS NOT NULL)`,
    ),
    check(
      "course_view_revision_authorship_basis",
      sql`${table.authorship_basis} IN ('learner_authored', 'learner_directed', 'tutor_proposed')`,
    ),
    index("course_view_revision_list_idx").on(table.course_id, table.view_id, table.revision_number, table.id),
  ],
)

export const CourseViewRevisionStateTable = sqliteTable(
  "course_view_revision_state",
  {
    course_id: text().$type<CourseID>().notNull(),
    view_id: text().$type<ViewID>().notNull(),
    revision_id: text().$type<RevisionID>().primaryKey(),
    state_version: integer().notNull().default(0),
    withdrawal_reason: text().$type<RevisionWithdrawalReason>(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.course_id, table.view_id, table.revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.view_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    unique("course_view_revision_state_course_id_revision_id_unique").on(table.course_id, table.revision_id),
    check("course_view_revision_state_version_nonnegative", sql`${table.state_version} >= 0`),
    check(
      "course_view_revision_state_withdrawal_reason",
      sql`${table.withdrawal_reason} IS NULL OR ${table.withdrawal_reason} IN ('rejected_candidate', 'removed')`,
    ),
    index("course_view_revision_state_active_idx").on(table.course_id, table.view_id, table.withdrawal_reason),
  ],
)

export const CourseWorkingSelectionTable = sqliteTable(
  "course_working_selection",
  {
    course_id: text().$type<CourseID>().primaryKey(),
    revision_id: text().$type<RevisionID>(),
    version: integer().notNull().default(0),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    check("course_working_selection_version_nonnegative", sql`${table.version} >= 0`),
  ],
)

export const CourseViewRevisionItemTable = sqliteTable(
  "course_view_revision_item",
  {
    course_id: text().$type<CourseID>().notNull(),
    view_id: text().$type<ViewID>().notNull(),
    revision_id: text().$type<RevisionID>().notNull(),
    item_id: text().$type<ItemID>().notNull(),
    parent_item_id: text().$type<ItemID>(),
    title: text().notNull(),
    preorder_position: integer().notNull(),
    depth: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.item_id] }),
    foreignKey({
      columns: [table.course_id, table.view_id, table.revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.view_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.item_id],
      foreignColumns: [CourseItemTable.course_id, CourseItemTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.view_id, table.revision_id, table.parent_item_id],
      foreignColumns: [table.course_id, table.view_id, table.revision_id, table.item_id],
    }).onDelete("restrict"),
    unique("course_view_revision_item_owner_unique").on(
      table.course_id,
      table.view_id,
      table.revision_id,
      table.item_id,
    ),
    unique("course_view_revision_item_position_unique").on(table.revision_id, table.preorder_position),
    check("course_view_revision_item_title_length", sql`length(trim(${table.title})) BETWEEN 1 AND 500`),
    check("course_view_revision_item_position_nonnegative", sql`${table.preorder_position} >= 0`),
    check("course_view_revision_item_depth", sql`${table.depth} BETWEEN 0 AND 16`),
    index("course_view_revision_item_page_idx").on(table.revision_id, table.preorder_position, table.item_id),
  ],
)

export const CourseViewRevisionMappingGroupTable = sqliteTable(
  "course_view_revision_mapping_group",
  {
    id: text().$type<MappingGroupID>().primaryKey(),
    course_id: text().$type<CourseID>().notNull(),
    view_id: text().$type<ViewID>().notNull(),
    source_revision_id: text().$type<RevisionID>().notNull(),
    target_revision_id: text().$type<RevisionID>().notNull(),
    kind: text().$type<MappingKind>().notNull(),
    source_key: text().notNull(),
    target_key: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.course_id, table.view_id, table.source_revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.view_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.view_id, table.target_revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.view_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    unique("course_view_revision_mapping_group_owner_unique").on(
      table.course_id,
      table.view_id,
      table.source_revision_id,
      table.target_revision_id,
      table.id,
    ),
    check("course_view_revision_mapping_group_kind", sql`${table.kind} IN ('preserve', 'split', 'merge')`),
    index("course_view_revision_mapping_group_page_idx").on(
      table.target_revision_id,
      table.source_key,
      table.target_key,
      table.id,
    ),
  ],
)

export const CourseViewRevisionMappingSourceTable = sqliteTable(
  "course_view_revision_mapping_source",
  {
    course_id: text().$type<CourseID>().notNull(),
    view_id: text().$type<ViewID>().notNull(),
    source_revision_id: text().$type<RevisionID>().notNull(),
    target_revision_id: text().$type<RevisionID>().notNull(),
    group_id: text().$type<MappingGroupID>().notNull(),
    item_id: text().$type<ItemID>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.group_id, table.item_id] }),
    foreignKey({
      columns: [table.course_id, table.view_id, table.source_revision_id, table.target_revision_id, table.group_id],
      foreignColumns: [
        CourseViewRevisionMappingGroupTable.course_id,
        CourseViewRevisionMappingGroupTable.view_id,
        CourseViewRevisionMappingGroupTable.source_revision_id,
        CourseViewRevisionMappingGroupTable.target_revision_id,
        CourseViewRevisionMappingGroupTable.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.view_id, table.source_revision_id, table.item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    uniqueIndex("course_view_revision_mapping_source_once_idx").on(table.target_revision_id, table.item_id),
    index("course_view_revision_mapping_source_page_idx").on(table.group_id, table.item_id),
  ],
)

export const CourseViewRevisionMappingTargetTable = sqliteTable(
  "course_view_revision_mapping_target",
  {
    course_id: text().$type<CourseID>().notNull(),
    view_id: text().$type<ViewID>().notNull(),
    source_revision_id: text().$type<RevisionID>().notNull(),
    target_revision_id: text().$type<RevisionID>().notNull(),
    group_id: text().$type<MappingGroupID>().notNull(),
    item_id: text().$type<ItemID>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.group_id, table.item_id] }),
    foreignKey({
      columns: [table.course_id, table.view_id, table.source_revision_id, table.target_revision_id, table.group_id],
      foreignColumns: [
        CourseViewRevisionMappingGroupTable.course_id,
        CourseViewRevisionMappingGroupTable.view_id,
        CourseViewRevisionMappingGroupTable.source_revision_id,
        CourseViewRevisionMappingGroupTable.target_revision_id,
        CourseViewRevisionMappingGroupTable.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.view_id, table.target_revision_id, table.item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    uniqueIndex("course_view_revision_mapping_target_once_idx").on(table.target_revision_id, table.item_id),
    index("course_view_revision_mapping_target_page_idx").on(table.group_id, table.item_id),
  ],
)

export const CourseViewRevisionReuseCitationTable = sqliteTable(
  "course_view_revision_reuse_citation",
  {
    id: text().$type<CitationID>().primaryKey(),
    course_id: text().$type<CourseID>().notNull(),
    source_view_id: text().$type<ViewID>().notNull(),
    source_revision_id: text().$type<RevisionID>().notNull(),
    target_view_id: text().$type<ViewID>().notNull(),
    target_revision_id: text().$type<RevisionID>().notNull(),
    item_id: text().$type<ItemID>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.course_id, table.source_view_id, table.source_revision_id, table.item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.target_view_id, table.target_revision_id, table.item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    unique("course_view_revision_reuse_citation_target_unique").on(table.target_revision_id, table.item_id),
    index("course_view_revision_reuse_citation_page_idx").on(
      table.target_revision_id,
      table.source_revision_id,
      table.item_id,
      table.id,
    ),
  ],
)

export const CourseSelectionAcceptanceEffectTable = sqliteTable(
  "course_selection_acceptance_effect",
  {
    id: text().$type<SelectionAcceptanceEffectID>().primaryKey(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    course_id: text().$type<CourseID>().notNull(),
    accepted_revision_id: text().$type<RevisionID>().notNull(),
    previous_revision_id: text().$type<RevisionID>(),
    previous_selection_version: integer().notNull(),
    committed_selection_version: integer().notNull(),
    time_committed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.accepted_revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.previous_revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    unique("course_selection_acceptance_effect_address_unique").on(table.occurrence_id, table.course_id),
    check(
      "course_selection_acceptance_effect_versions",
      sql`${table.previous_selection_version} >= 0 AND ${table.committed_selection_version} = ${table.previous_selection_version} + 1`,
    ),
    check("course_selection_acceptance_effect_time_nonnegative", sql`${table.time_committed} >= 0`),
    index("course_selection_acceptance_effect_course_idx").on(
      table.course_id,
      table.committed_selection_version,
      table.id,
    ),
  ],
)
