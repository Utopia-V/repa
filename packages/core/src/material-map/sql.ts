import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import type {
  ArtifactID,
  BindingID as ArtifactBindingID,
  LineageCorrectionMemberID,
  ObservationCorrectionID,
  ObservationID,
  RevisionID as ArtifactRevisionID,
} from "../artifact/schema"
import {
  ArtifactLineageCorrectionMemberTable,
  ArtifactObservationCorrectionTable,
  ArtifactRevisionTable,
  ArtifactSourceBindingTable,
  ArtifactSourceObservationTable,
  ArtifactTable,
} from "../artifact/sql"
import type {
  BindingEpisodeID,
  BindingID as ContentRootBindingID,
  ContentRootID,
  GrantEpisodeID,
} from "../content-root/schema"
import {
  ContentRootBindingEpisodeTable,
  ContentRootBindingTable,
  ContentRootGrantEpisodeTable,
  ContentRootTable,
} from "../content-root/sql"
import type { CourseID, ItemID, RevisionID as CourseRevisionID, ViewID } from "../course/schema"
import { CourseViewRevisionItemTable, CourseViewRevisionTable } from "../course/sql"
import type { RevisionID as RepresentationRevisionID } from "../representation/schema"
import { RepresentationRevisionTable } from "../representation/sql"
import type {
  AlignmentDispositionEventID,
  AlignmentID,
  Disposition,
  DispositionEventID,
  MapID,
  OutlineNodeID,
  SelectionBasis,
  SelectorID,
  SelectorKind,
  TargetKind,
} from "./schema"

export const MaterialMapTable = sqliteTable(
  "material_map",
  {
    id: text().$type<MapID>().primaryKey(),
    canonical_input: text().notNull(),
    target_kind: text().$type<TargetKind>().notNull(),
    supersedes_map_id: text().$type<MapID>(),
    authorship_basis: text().notNull(),
    authorship_capability_identity: text().notNull(),
    authorship_capability_version: integer().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.supersedes_map_id], foreignColumns: [table.id] }).onDelete("restrict"),
    unique("material_map_id_target_unique").on(table.id, table.target_kind),
    check("material_map_canonical_input", sql`json_valid(${table.canonical_input})`),
    check("material_map_target_kind", sql`${table.target_kind} IN ('artifact', 'representation')`),
    check(
      "material_map_no_self_predecessor",
      sql`${table.supersedes_map_id} IS NULL OR ${table.supersedes_map_id} <> ${table.id}`,
    ),
    check(
      "material_map_authorship",
      sql`length(trim(${table.authorship_basis})) BETWEEN 1 AND 2000 AND length(trim(${table.authorship_capability_identity})) BETWEEN 1 AND 500 AND ${table.authorship_capability_version} >= 0`,
    ),
    check("material_map_time_nonnegative", sql`${table.time_created} >= 0`),
    index("material_map_predecessor_idx").on(table.supersedes_map_id, table.time_created, table.id),
  ],
)

export const MaterialMapArtifactTargetTable = sqliteTable(
  "material_map_artifact_target",
  {
    map_id: text().$type<MapID>().primaryKey(),
    artifact_id: text().$type<ArtifactID>().notNull(),
    artifact_revision_id: text().$type<ArtifactRevisionID>().notNull(),
    attribution_type: text().$type<"recorded" | "lineage_correction">().notNull(),
    attribution_member_id: text().$type<LineageCorrectionMemberID>(),
    disposition_version: integer().notNull(),
    lineage_version: integer().notNull(),
    source_version: integer().notNull(),
    artifact_binding_id: text().$type<ArtifactBindingID>().notNull(),
    active_location: text().notNull(),
    descriptor_observation_id: text().$type<ObservationID>().notNull(),
    descriptor_correction_id: text().$type<ObservationCorrectionID>(),
    fingerprint_algorithm: text().$type<"sha256">().notNull(),
    fingerprint_digest: text().notNull(),
    byte_length: integer().notNull(),
    media_type: text().notNull(),
    authority_kind: text()
      .$type<"content_root" | "active_workspace" | "one_operation">()
      .notNull()
      .default("content_root"),
    content_root_id: text().$type<ContentRootID>(),
    content_root_binding_id: text().$type<ContentRootBindingID>(),
    content_root_binding_episode_id: text().$type<BindingEpisodeID>(),
    content_root_binding_episode_ordinal: integer(),
    content_root_grant_episode_id: text().$type<GrantEpisodeID>(),
    content_root_grant_episode_ordinal: integer(),
    content_root_grant_version: integer(),
    workspace_identity: text(),
    operation_identity: text(),
    operation_approval_basis: text(),
    normalized_relative_path: text().notNull(),
    root_object_descriptor_state: text().$type<"exact_v1" | "historical_v16_partial">().notNull().default("exact_v1"),
    root_object_platform: text().$type<"windows_ntfs">(),
    root_object_verifier_version: integer(),
    root_object_canonical_path: text(),
    root_object_canonical_path_key: text(),
    root_object_volume_serial: text(),
    root_object_id: text(),
    root_object_creation_time: text(),
    root_object_change_time: text(),
    root_object_last_write_time: text(),
    root_object_size: integer(),
    source_object_platform: text().$type<"windows_ntfs">().notNull(),
    source_object_verifier_version: integer().notNull(),
    source_object_canonical_path: text().notNull(),
    source_object_canonical_path_key: text().notNull(),
    source_object_volume_serial: text().notNull(),
    source_object_id: text().notNull(),
    source_object_creation_time: text().notNull(),
    source_object_change_time: text().notNull(),
    source_object_last_write_time: text().notNull(),
    source_object_size: integer().notNull(),
    source_observed_time: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.map_id], foreignColumns: [MaterialMapTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.artifact_revision_id], foreignColumns: [ArtifactRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.artifact_binding_id], foreignColumns: [ArtifactSourceBindingTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.descriptor_observation_id],
      foreignColumns: [ArtifactSourceObservationTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.descriptor_correction_id],
      foreignColumns: [ArtifactObservationCorrectionTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.attribution_member_id],
      foreignColumns: [ArtifactLineageCorrectionMemberTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.content_root_id], foreignColumns: [ContentRootTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.content_root_id, table.content_root_binding_id],
      foreignColumns: [ContentRootBindingTable.content_root_id, ContentRootBindingTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.content_root_id,
        table.content_root_binding_episode_id,
        table.content_root_binding_id,
        table.content_root_binding_episode_ordinal,
      ],
      foreignColumns: [
        ContentRootBindingEpisodeTable.content_root_id,
        ContentRootBindingEpisodeTable.id,
        ContentRootBindingEpisodeTable.binding_id,
        ContentRootBindingEpisodeTable.ordinal,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.content_root_id,
        table.content_root_grant_episode_id,
        table.content_root_binding_id,
        table.content_root_binding_episode_id,
        table.content_root_grant_episode_ordinal,
      ],
      foreignColumns: [
        ContentRootGrantEpisodeTable.content_root_id,
        ContentRootGrantEpisodeTable.id,
        ContentRootGrantEpisodeTable.binding_id,
        ContentRootGrantEpisodeTable.binding_episode_id,
        ContentRootGrantEpisodeTable.ordinal,
      ],
    }).onDelete("restrict"),
    check(
      "material_map_artifact_target_attribution",
      sql`(${table.attribution_type} = 'recorded' AND ${table.attribution_member_id} IS NULL) OR (${table.attribution_type} = 'lineage_correction' AND ${table.attribution_member_id} IS NOT NULL)`,
    ),
    check(
      "material_map_artifact_target_versions",
      sql`${table.disposition_version} >= 0 AND ${table.lineage_version} >= 0 AND ${table.source_version} >= 0`,
    ),
    check(
      "material_map_artifact_target_authority",
      sql`(${table.authority_kind} = 'content_root'
          AND ${table.content_root_id} IS NOT NULL
          AND ${table.content_root_binding_id} IS NOT NULL
          AND ${table.content_root_binding_episode_id} IS NOT NULL
          AND ${table.content_root_binding_episode_ordinal} >= 1
          AND ${table.content_root_grant_episode_id} IS NOT NULL
          AND ${table.content_root_grant_episode_ordinal} >= 1
          AND ${table.content_root_grant_version} >= 1
          AND ${table.workspace_identity} IS NULL
          AND ${table.operation_identity} IS NULL
          AND ${table.operation_approval_basis} IS NULL)
        OR (${table.authority_kind} = 'active_workspace'
          AND ${table.content_root_id} IS NULL
          AND ${table.content_root_binding_id} IS NULL
          AND ${table.content_root_binding_episode_id} IS NULL
          AND ${table.content_root_binding_episode_ordinal} IS NULL
          AND ${table.content_root_grant_episode_id} IS NULL
          AND ${table.content_root_grant_episode_ordinal} IS NULL
          AND ${table.content_root_grant_version} IS NULL
          AND length(${table.workspace_identity}) > 0
          AND ${table.operation_identity} IS NULL
          AND ${table.operation_approval_basis} IS NULL)
        OR (${table.authority_kind} = 'one_operation'
          AND ${table.content_root_id} IS NULL
          AND ${table.content_root_binding_id} IS NULL
          AND ${table.content_root_binding_episode_id} IS NULL
          AND ${table.content_root_binding_episode_ordinal} IS NULL
          AND ${table.content_root_grant_episode_id} IS NULL
          AND ${table.content_root_grant_episode_ordinal} IS NULL
          AND ${table.content_root_grant_version} IS NULL
          AND ${table.workspace_identity} IS NULL
          AND length(${table.operation_identity}) > 0
          AND length(${table.operation_approval_basis}) > 0)`,
    ),
    check(
      "material_map_artifact_target_content",
      sql`${table.fingerprint_algorithm} = 'sha256' AND length(${table.fingerprint_digest}) = 64 AND ${table.fingerprint_digest} NOT GLOB '*[^0-9a-f]*' AND ${table.byte_length} > 0 AND length(${table.media_type}) > 0`,
    ),
    // Gate 10 issues the Unicode-aware key; SQLite lower() is ASCII-only and cannot reproduce that invariant.
    check(
      "material_map_artifact_target_source",
      sql`length(${table.active_location}) > 0 AND length(${table.normalized_relative_path}) > 0
        AND ${table.root_object_platform} = 'windows_ntfs' AND ${table.root_object_verifier_version} >= 1
        AND length(${table.root_object_canonical_path}) > 0 AND length(${table.root_object_canonical_path_key}) > 0
        AND length(${table.root_object_volume_serial}) > 0 AND length(${table.root_object_id}) = 32
        AND length(${table.root_object_creation_time}) > 0 AND length(${table.root_object_change_time}) > 0
        AND ((${table.root_object_descriptor_state} = 'exact_v1'
            AND length(${table.root_object_last_write_time}) > 0 AND ${table.root_object_size} >= 0)
          OR (${table.root_object_descriptor_state} = 'historical_v16_partial'
            AND ${table.authority_kind} = 'content_root'
            AND ${table.root_object_last_write_time} IS NULL AND ${table.root_object_size} IS NULL))
        AND ${table.source_object_platform} = 'windows_ntfs' AND ${table.source_object_verifier_version} >= 1
        AND length(${table.source_object_canonical_path}) > 0 AND length(${table.source_object_canonical_path_key}) > 0
        AND ${table.source_object_canonical_path} = ${table.active_location}
        AND length(${table.source_object_volume_serial}) > 0 AND length(${table.source_object_id}) = 32
        AND length(${table.source_object_creation_time}) > 0 AND length(${table.source_object_change_time}) > 0
        AND length(${table.source_object_last_write_time}) > 0 AND ${table.source_object_size} = ${table.byte_length}
        AND ${table.source_observed_time} >= 0`,
    ),
    index("material_map_artifact_target_idx").on(
      table.artifact_id,
      table.artifact_revision_id,
      table.attribution_type,
      table.attribution_member_id,
      table.map_id,
    ),
  ],
)

export const MaterialMapRepresentationTargetTable = sqliteTable(
  "material_map_representation_target",
  {
    map_id: text().$type<MapID>().primaryKey(),
    representation_revision_id: text().$type<RepresentationRevisionID>().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.map_id], foreignColumns: [MaterialMapTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.representation_revision_id],
      foreignColumns: [RepresentationRevisionTable.id],
    }).onDelete("restrict"),
    index("material_map_representation_target_idx").on(table.representation_revision_id, table.map_id),
  ],
)

export const MaterialMapStateTable = sqliteTable(
  "material_map_state",
  {
    map_id: text().$type<MapID>().primaryKey(),
    version: integer().notNull(),
    disposition: text().$type<Disposition>().notNull(),
    withdrawal_reason: text(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.map_id], foreignColumns: [MaterialMapTable.id] }).onDelete("restrict"),
    check("material_map_state_version", sql`${table.version} >= 0`),
    check(
      "material_map_state_shape",
      sql`(${table.disposition} = 'active' AND ${table.withdrawal_reason} IS NULL) OR (${table.disposition} = 'withdrawn' AND ${table.withdrawal_reason} IS NOT NULL AND length(trim(${table.withdrawal_reason})) BETWEEN 1 AND 2000)`,
    ),
    check("material_map_state_time", sql`${table.time_updated} >= 0`),
    index("material_map_state_discovery_idx").on(table.disposition, table.time_updated, table.map_id),
  ],
)

export const MaterialMapDispositionEventTable = sqliteTable(
  "material_map_disposition_event",
  {
    id: text().$type<DispositionEventID>().primaryKey(),
    map_id: text().$type<MapID>().notNull(),
    version: integer().notNull(),
    disposition: text().$type<Disposition>().notNull(),
    reason: text(),
    time_committed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.map_id], foreignColumns: [MaterialMapTable.id] }).onDelete("restrict"),
    unique("material_map_disposition_version_unique").on(table.map_id, table.version),
    check("material_map_disposition_version", sql`${table.version} >= 0`),
    check(
      "material_map_disposition_shape",
      sql`(${table.disposition} = 'active' AND ${table.reason} IS NULL) OR (${table.disposition} = 'withdrawn' AND ${table.reason} IS NOT NULL AND length(trim(${table.reason})) BETWEEN 1 AND 2000)`,
    ),
    check("material_map_disposition_time", sql`${table.time_committed} >= 0`),
    index("material_map_disposition_history_idx").on(table.map_id, table.version, table.id),
  ],
)

export const MaterialOutlineNodeTable = sqliteTable(
  "material_outline_node",
  {
    id: text().$type<OutlineNodeID>().primaryKey(),
    map_id: text().$type<MapID>().notNull(),
    parent_node_id: text().$type<OutlineNodeID>(),
    title: text().notNull(),
    preorder_position: integer().notNull(),
    depth: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.map_id], foreignColumns: [MaterialMapTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.map_id, table.parent_node_id],
      foreignColumns: [table.map_id, table.id],
    }).onDelete("restrict"),
    unique("material_outline_node_owner_unique").on(table.map_id, table.id),
    unique("material_outline_node_position_unique").on(table.map_id, table.preorder_position),
    check("material_outline_node_title", sql`length(trim(${table.title})) BETWEEN 1 AND 500`),
    check("material_outline_node_position", sql`${table.preorder_position} >= 0`),
    check("material_outline_node_depth", sql`${table.depth} BETWEEN 0 AND 16`),
    check(
      "material_outline_node_parent_shape",
      sql`(${table.parent_node_id} IS NULL AND ${table.depth} = 0) OR (${table.parent_node_id} IS NOT NULL AND ${table.depth} > 0)`,
    ),
    index("material_outline_node_page_idx").on(table.map_id, table.preorder_position, table.id),
  ],
)

export const MaterialSelectorTable = sqliteTable(
  "material_selector",
  {
    id: text().$type<SelectorID>().primaryKey(),
    map_id: text().$type<MapID>().notNull(),
    node_id: text().$type<OutlineNodeID>().notNull(),
    selector_position: integer().notNull(),
    kind: text().$type<SelectorKind>().notNull(),
    artifact_start_byte: integer(),
    artifact_end_byte: integer(),
    pdf_start_page: integer(),
    pdf_end_page: integer(),
    pdf_start_item: integer(),
    pdf_start_scalar: integer(),
    pdf_end_item: integer(),
    pdf_end_scalar: integer(),
    model_start_scalar: integer(),
    model_end_scalar: integer(),
    witness_algorithm: text().$type<"sha256">().notNull(),
    witness_digest: text().notNull(),
    witness_byte_length: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.map_id], foreignColumns: [MaterialMapTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.map_id, table.node_id],
      foreignColumns: [MaterialOutlineNodeTable.map_id, MaterialOutlineNodeTable.id],
    }).onDelete("restrict"),
    unique("material_selector_owner_unique").on(table.map_id, table.id),
    unique("material_selector_node_position_unique").on(table.map_id, table.node_id, table.selector_position),
    check("material_selector_position", sql`${table.selector_position} >= 0`),
    check(
      "material_selector_coordinate_shape",
      sql`(${table.kind} = 'whole_target.v1' AND ${table.artifact_start_byte} IS NULL AND ${table.artifact_end_byte} IS NULL AND ${table.pdf_start_page} IS NULL AND ${table.pdf_end_page} IS NULL AND ${table.pdf_start_item} IS NULL AND ${table.pdf_start_scalar} IS NULL AND ${table.pdf_end_item} IS NULL AND ${table.pdf_end_scalar} IS NULL AND ${table.model_start_scalar} IS NULL AND ${table.model_end_scalar} IS NULL) OR (${table.kind} = 'artifact_byte_range.v1' AND ${table.artifact_start_byte} IS NOT NULL AND ${table.artifact_start_byte} >= 0 AND ${table.artifact_end_byte} IS NOT NULL AND ${table.artifact_end_byte} > ${table.artifact_start_byte} AND ${table.pdf_start_page} IS NULL AND ${table.pdf_end_page} IS NULL AND ${table.pdf_start_item} IS NULL AND ${table.pdf_start_scalar} IS NULL AND ${table.pdf_end_item} IS NULL AND ${table.pdf_end_scalar} IS NULL AND ${table.model_start_scalar} IS NULL AND ${table.model_end_scalar} IS NULL) OR (${table.kind} = 'pdf_page_range.v1' AND ${table.artifact_start_byte} IS NULL AND ${table.artifact_end_byte} IS NULL AND ${table.pdf_start_page} IS NOT NULL AND ${table.pdf_start_page} >= 1 AND ${table.pdf_end_page} IS NOT NULL AND ${table.pdf_end_page} >= ${table.pdf_start_page} AND ${table.pdf_start_item} IS NULL AND ${table.pdf_start_scalar} IS NULL AND ${table.pdf_end_item} IS NULL AND ${table.pdf_end_scalar} IS NULL AND ${table.model_start_scalar} IS NULL AND ${table.model_end_scalar} IS NULL) OR (${table.kind} = 'pdf_text_range.v1' AND ${table.artifact_start_byte} IS NULL AND ${table.artifact_end_byte} IS NULL AND ${table.pdf_start_page} IS NOT NULL AND ${table.pdf_start_page} >= 1 AND ${table.pdf_end_page} IS NOT NULL AND ${table.pdf_end_page} >= ${table.pdf_start_page} AND ${table.pdf_start_item} IS NOT NULL AND ${table.pdf_start_item} >= 0 AND ${table.pdf_start_scalar} IS NOT NULL AND ${table.pdf_start_scalar} >= 0 AND ${table.pdf_end_item} IS NOT NULL AND ${table.pdf_end_item} >= 0 AND ${table.pdf_end_scalar} IS NOT NULL AND ${table.pdf_end_scalar} >= 0 AND ${table.model_start_scalar} IS NULL AND ${table.model_end_scalar} IS NULL) OR (${table.kind} = 'model_text_range.v1' AND ${table.artifact_start_byte} IS NULL AND ${table.artifact_end_byte} IS NULL AND ${table.pdf_start_page} IS NULL AND ${table.pdf_end_page} IS NULL AND ${table.pdf_start_item} IS NULL AND ${table.pdf_start_scalar} IS NULL AND ${table.pdf_end_item} IS NULL AND ${table.pdf_end_scalar} IS NULL AND ${table.model_start_scalar} IS NOT NULL AND ${table.model_start_scalar} >= 0 AND ${table.model_end_scalar} IS NOT NULL AND ${table.model_end_scalar} > ${table.model_start_scalar})`,
    ),
    check(
      "material_selector_witness",
      sql`${table.witness_algorithm} = 'sha256' AND length(${table.witness_digest}) = 64 AND ${table.witness_digest} NOT GLOB '*[^0-9a-f]*' AND ${table.witness_byte_length} > 0`,
    ),
    index("material_selector_page_idx").on(table.map_id, table.node_id, table.selector_position, table.id),
  ],
)

export const MaterialCourseAlignmentTable = sqliteTable(
  "material_course_alignment",
  {
    id: text().$type<AlignmentID>().primaryKey(),
    canonical_input: text().notNull(),
    map_id: text().$type<MapID>().notNull(),
    selector_id: text().$type<SelectorID>().notNull(),
    course_id: text().$type<CourseID>().notNull(),
    view_id: text().$type<ViewID>().notNull(),
    revision_id: text().$type<CourseRevisionID>().notNull(),
    item_id: text().$type<ItemID>().notNull(),
    selection_basis: text().$type<SelectionBasis>().notNull(),
    observed_selection_revision_id: text().$type<CourseRevisionID>(),
    observed_selection_version: integer(),
    accepted_course_version: integer().notNull(),
    accepted_view_version: integer().notNull(),
    accepted_revision_version: integer().notNull(),
    reason: text().notNull(),
    supersedes_alignment_id: text().$type<AlignmentID>(),
    authorship_basis: text().notNull(),
    authorship_capability_identity: text().notNull(),
    authorship_capability_version: integer().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.map_id, table.selector_id],
      foreignColumns: [MaterialSelectorTable.map_id, MaterialSelectorTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.view_id, table.revision_id, table.item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.observed_selection_revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.supersedes_alignment_id], foreignColumns: [table.id] }).onDelete("restrict"),
    unique("material_course_alignment_owner_unique").on(table.id, table.map_id, table.selector_id),
    check("material_course_alignment_canonical_input", sql`json_valid(${table.canonical_input})`),
    check(
      "material_course_alignment_selection_shape",
      sql`(${table.selection_basis} = 'explicit_exact' AND ${table.observed_selection_revision_id} IS NULL AND ${table.observed_selection_version} IS NULL) OR (${table.selection_basis} = 'observed_working' AND ${table.observed_selection_revision_id} = ${table.revision_id} AND ${table.observed_selection_version} IS NOT NULL AND ${table.observed_selection_version} >= 0)`,
    ),
    check("material_course_alignment_reason", sql`length(trim(${table.reason})) BETWEEN 1 AND 2000`),
    check(
      "material_course_alignment_endpoint_versions",
      sql`${table.accepted_course_version} >= 0 AND ${table.accepted_view_version} >= 0 AND ${table.accepted_revision_version} >= 0`,
    ),
    check(
      "material_course_alignment_authorship",
      sql`length(trim(${table.authorship_basis})) BETWEEN 1 AND 2000 AND length(trim(${table.authorship_capability_identity})) BETWEEN 1 AND 500 AND ${table.authorship_capability_version} >= 0`,
    ),
    check(
      "material_course_alignment_no_self_predecessor",
      sql`${table.supersedes_alignment_id} IS NULL OR ${table.supersedes_alignment_id} <> ${table.id}`,
    ),
    check("material_course_alignment_time", sql`${table.time_created} >= 0`),
    index("material_course_alignment_selector_idx").on(table.map_id, table.selector_id, table.time_created, table.id),
    index("material_course_alignment_membership_idx").on(
      table.course_id,
      table.view_id,
      table.revision_id,
      table.item_id,
      table.time_created,
      table.id,
    ),
    index("material_course_alignment_predecessor_idx").on(table.supersedes_alignment_id, table.time_created, table.id),
  ],
)

export const MaterialCourseAlignmentStateTable = sqliteTable(
  "material_course_alignment_state",
  {
    alignment_id: text().$type<AlignmentID>().primaryKey(),
    version: integer().notNull(),
    disposition: text().$type<Disposition>().notNull(),
    withdrawal_reason: text(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.alignment_id], foreignColumns: [MaterialCourseAlignmentTable.id] }).onDelete(
      "restrict",
    ),
    check("material_course_alignment_state_version", sql`${table.version} >= 0`),
    check(
      "material_course_alignment_state_shape",
      sql`(${table.disposition} = 'active' AND ${table.withdrawal_reason} IS NULL) OR (${table.disposition} = 'withdrawn' AND ${table.withdrawal_reason} IS NOT NULL AND length(trim(${table.withdrawal_reason})) BETWEEN 1 AND 2000)`,
    ),
    check("material_course_alignment_state_time", sql`${table.time_updated} >= 0`),
    index("material_course_alignment_state_discovery_idx").on(
      table.disposition,
      table.time_updated,
      table.alignment_id,
    ),
  ],
)

export const MaterialCourseAlignmentDispositionEventTable = sqliteTable(
  "material_course_alignment_disposition_event",
  {
    id: text().$type<AlignmentDispositionEventID>().primaryKey(),
    alignment_id: text().$type<AlignmentID>().notNull(),
    version: integer().notNull(),
    disposition: text().$type<Disposition>().notNull(),
    reason: text(),
    time_committed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.alignment_id], foreignColumns: [MaterialCourseAlignmentTable.id] }).onDelete(
      "restrict",
    ),
    unique("material_course_alignment_disposition_version_unique").on(table.alignment_id, table.version),
    check("material_course_alignment_disposition_version", sql`${table.version} >= 0`),
    check(
      "material_course_alignment_disposition_shape",
      sql`(${table.disposition} = 'active' AND ${table.reason} IS NULL) OR (${table.disposition} = 'withdrawn' AND ${table.reason} IS NOT NULL AND length(trim(${table.reason})) BETWEEN 1 AND 2000)`,
    ),
    check("material_course_alignment_disposition_time", sql`${table.time_committed} >= 0`),
    index("material_course_alignment_disposition_history_idx").on(table.alignment_id, table.version, table.id),
  ],
)
