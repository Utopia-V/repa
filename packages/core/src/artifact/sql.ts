import { sql } from "drizzle-orm"
import {
  type AnySQLiteColumn,
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"
import type {
  ArtifactID,
  Availability,
  BindingBasis,
  BindingEndReason,
  BindingID,
  CreationBasis,
  FingerprintAlgorithm,
  LineageCorrectionBasis,
  LineageCorrectionMemberID,
  LineageCorrectionSetID,
  ObservationCorrectionBasis,
  ObservationCorrectionID,
  ObservationID,
  ObservationResult,
  RevisionID,
} from "./schema"

export const ArtifactTable = sqliteTable(
  "artifact",
  {
    id: text().$type<ArtifactID>().primaryKey(),
    admission_root_artifact_id: text().$type<ArtifactID>().notNull(),
    creation_basis: text().$type<CreationBasis>().notNull(),
    creation_capability_identity: text(),
    creation_capability_version: integer(),
    disposition_version: integer().notNull().default(0),
    lineage_version: integer().notNull().default(0),
    withdrawal_reason: text().$type<"removed">(),
    correction_hidden: integer({ mode: "boolean" }).notNull().default(false),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.admission_root_artifact_id], foreignColumns: [table.id] }).onDelete("restrict"),
    check(
      "artifact_creation_shape",
      sql`(${table.creation_basis} IN ('learner_instruction', 'initialization_import') AND ${table.admission_root_artifact_id} = ${table.id} AND ${table.creation_capability_identity} IS NOT NULL AND length(${table.creation_capability_identity}) > 0 AND ${table.creation_capability_version} >= 1) OR (${table.creation_basis} = 'lineage_correction' AND ${table.creation_capability_identity} IS NULL AND ${table.creation_capability_version} IS NULL)`,
    ),
    check("artifact_versions_nonnegative", sql`${table.disposition_version} >= 0 AND ${table.lineage_version} >= 0`),
    check(
      "artifact_withdrawal_reason",
      sql`${table.withdrawal_reason} IS NULL OR ${table.withdrawal_reason} = 'removed'`,
    ),
    check("artifact_time_order", sql`${table.time_created} >= 0 AND ${table.time_updated} >= ${table.time_created}`),
    index("artifact_admission_root_idx").on(table.admission_root_artifact_id, table.id),
    index("artifact_discovery_idx").on(table.withdrawal_reason, table.correction_hidden, table.time_created, table.id),
  ],
)

export const ArtifactRevisionTable = sqliteTable(
  "artifact_revision",
  {
    id: text().$type<RevisionID>().primaryKey(),
    recorded_artifact_id: text().$type<ArtifactID>().notNull(),
    fingerprint_algorithm: text().$type<FingerprintAlgorithm>().notNull(),
    fingerprint_digest: text().notNull(),
    byte_length: integer().notNull(),
    time_first_observed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.recorded_artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    unique("artifact_revision_recorded_id_unique").on(table.recorded_artifact_id, table.id),
    unique("artifact_revision_fingerprint_unique").on(
      table.recorded_artifact_id,
      table.fingerprint_algorithm,
      table.fingerprint_digest,
      table.byte_length,
    ),
    check("artifact_revision_algorithm", sql`${table.fingerprint_algorithm} = 'sha256'`),
    check(
      "artifact_revision_digest",
      sql`length(${table.fingerprint_digest}) = 64 AND ${table.fingerprint_digest} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check("artifact_revision_byte_length", sql`${table.byte_length} >= 0`),
    check("artifact_revision_time_nonnegative", sql`${table.time_first_observed} >= 0`),
    index("artifact_revision_page_idx").on(table.recorded_artifact_id, table.time_first_observed, table.id),
  ],
)

export const ArtifactLineageCorrectionSetTable = sqliteTable(
  "artifact_lineage_correction_set",
  {
    id: text().$type<LineageCorrectionSetID>().primaryKey(),
    admission_root_artifact_id: text().$type<ArtifactID>().notNull(),
    basis: text().$type<LineageCorrectionBasis>().notNull(),
    capability_identity: text().notNull(),
    capability_version: integer().notNull(),
    new_artifact_id: text().$type<ArtifactID>(),
    time_committed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.admission_root_artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.new_artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    unique("artifact_lineage_correction_set_new_artifact_unique").on(table.new_artifact_id),
    check(
      "artifact_lineage_correction_set_basis",
      sql`${table.basis} IN ('learner_statement', 'trusted_non_model_discontinuity')`,
    ),
    check(
      "artifact_lineage_correction_set_capability",
      sql`length(${table.capability_identity}) > 0 AND ${table.capability_version} >= 1`,
    ),
    check("artifact_lineage_correction_set_time_nonnegative", sql`${table.time_committed} >= 0`),
    index("artifact_lineage_correction_set_root_idx").on(
      table.admission_root_artifact_id,
      table.time_committed,
      table.id,
    ),
  ],
)

export const ArtifactLineageCorrectionMemberTable = sqliteTable(
  "artifact_lineage_correction_member",
  {
    id: text().$type<LineageCorrectionMemberID>().primaryKey(),
    set_id: text().$type<LineageCorrectionSetID>().notNull(),
    recorded_artifact_id: text().$type<ArtifactID>().notNull(),
    lineage_version: integer().notNull(),
    start_after_ordinal: integer().notNull(),
    end_at_ordinal: integer().notNull(),
    time_effective: integer().notNull(),
    expected_winning_member_id: text().$type<LineageCorrectionMemberID>(),
    boundary_binding_id: text()
      .$type<BindingID>()
      .references((): AnySQLiteColumn => ArtifactSourceBindingTable.id, { onDelete: "restrict" }),
    boundary_observation_id: text()
      .$type<ObservationID>()
      .references((): AnySQLiteColumn => ArtifactSourceObservationTable.id, { onDelete: "restrict" }),
    boundary_source_member_id: text().$type<LineageCorrectionMemberID>(),
    boundary_revision_id: text().$type<RevisionID>(),
    boundary_revision_attribution_member_id: text().$type<LineageCorrectionMemberID>(),
    boundary_descriptor_observation_id: text()
      .$type<ObservationID>()
      .references((): AnySQLiteColumn => ArtifactSourceObservationTable.id, { onDelete: "restrict" }),
    boundary_descriptor_correction_id: text()
      .$type<ObservationCorrectionID>()
      .references((): AnySQLiteColumn => ArtifactObservationCorrectionTable.id, { onDelete: "restrict" }),
    boundary_media_type: text(),
    boundary_availability: text().$type<Availability>().notNull(),
    outcome_kind: text().$type<"recorded" | "artifact">().notNull(),
    outcome_artifact_id: text().$type<ArtifactID>(),
  },
  (table) => [
    foreignKey({ columns: [table.set_id], foreignColumns: [ArtifactLineageCorrectionSetTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.recorded_artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.boundary_revision_id], foreignColumns: [ArtifactRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.outcome_artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.expected_winning_member_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.boundary_source_member_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.boundary_revision_attribution_member_id], foreignColumns: [table.id] }).onDelete(
      "restrict",
    ),
    unique("artifact_lineage_correction_member_set_id_unique").on(table.set_id, table.id),
    check(
      "artifact_lineage_correction_member_interval",
      sql`${table.start_after_ordinal} >= 0 AND ${table.end_at_ordinal} >= ${table.start_after_ordinal}`,
    ),
    check("artifact_lineage_correction_member_version", sql`${table.lineage_version} >= 1`),
    check("artifact_lineage_correction_member_time_nonnegative", sql`${table.time_effective} >= 0`),
    check(
      "artifact_lineage_correction_member_boundary_shape",
      sql`(${table.boundary_revision_id} IS NULL AND ${table.boundary_availability} = 'unbound' AND ${table.boundary_binding_id} IS NULL AND ${table.boundary_observation_id} IS NULL AND ${table.boundary_source_member_id} IS NULL AND ${table.boundary_revision_attribution_member_id} IS NULL AND ${table.boundary_descriptor_observation_id} IS NULL AND ${table.boundary_descriptor_correction_id} IS NULL AND ${table.boundary_media_type} IS NULL) OR (${table.boundary_revision_id} IS NOT NULL AND ((${table.boundary_observation_id} IS NOT NULL AND ${table.boundary_source_member_id} IS NULL) OR (${table.boundary_observation_id} IS NULL AND ${table.boundary_source_member_id} IS NOT NULL)) AND ${table.boundary_descriptor_observation_id} IS NOT NULL AND ${table.boundary_media_type} IS NOT NULL AND length(${table.boundary_media_type}) > 0 AND ((${table.boundary_availability} IN ('available', 'missing')) AND ${table.boundary_binding_id} IS NOT NULL OR (${table.boundary_availability} = 'unbound' AND ${table.boundary_binding_id} IS NULL)))`,
    ),
    check(
      "artifact_lineage_correction_member_descriptor_shape",
      sql`${table.boundary_descriptor_correction_id} IS NULL OR ${table.boundary_descriptor_observation_id} IS NOT NULL`,
    ),
    check(
      "artifact_lineage_correction_member_outcome_shape",
      sql`(${table.outcome_kind} = 'recorded' AND ${table.outcome_artifact_id} IS NULL) OR (${table.outcome_kind} = 'artifact' AND ${table.outcome_artifact_id} IS NOT NULL)`,
    ),
    index("artifact_lineage_correction_member_history_idx").on(
      table.recorded_artifact_id,
      table.start_after_ordinal,
      table.end_at_ordinal,
      table.lineage_version,
      table.id,
    ),
    index("artifact_lineage_correction_member_outcome_idx").on(
      table.outcome_artifact_id,
      table.lineage_version,
      table.id,
    ),
    index("artifact_lineage_correction_member_set_idx").on(table.set_id, table.id),
  ],
)

export const ArtifactSourceBindingTable = sqliteTable(
  "artifact_source_binding",
  {
    id: text().$type<BindingID>().primaryKey(),
    recorded_artifact_id: text().$type<ArtifactID>().notNull(),
    binding_ordinal: integer().notNull(),
    canonical_location: text().notNull(),
    basis_kind: text().$type<BindingBasis>().notNull(),
    basis_capability_identity: text(),
    basis_capability_version: integer(),
    basis_lineage_member_id: text().$type<LineageCorrectionMemberID>(),
    time_started: integer().notNull(),
    time_ended: integer(),
    end_reason: text().$type<BindingEndReason>(),
  },
  (table) => [
    foreignKey({ columns: [table.recorded_artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.basis_lineage_member_id],
      foreignColumns: [ArtifactLineageCorrectionMemberTable.id],
    }).onDelete("restrict"),
    unique("artifact_source_binding_recorded_id_unique").on(table.recorded_artifact_id, table.id),
    unique("artifact_source_binding_ordinal_unique").on(table.recorded_artifact_id, table.binding_ordinal),
    uniqueIndex("artifact_source_binding_active_artifact_idx")
      .on(table.recorded_artifact_id)
      .where(sql`${table.time_ended} IS NULL`),
    uniqueIndex("artifact_source_binding_active_location_idx")
      .on(table.canonical_location)
      .where(sql`${table.time_ended} IS NULL`),
    check("artifact_source_binding_ordinal_positive", sql`${table.binding_ordinal} >= 1`),
    check("artifact_source_binding_location_nonempty", sql`length(${table.canonical_location}) > 0`),
    check(
      "artifact_source_binding_basis_shape",
      sql`(${table.basis_kind} IN ('admission', 'explicit_rebind') AND ${table.basis_capability_identity} IS NOT NULL AND length(${table.basis_capability_identity}) > 0 AND ${table.basis_capability_version} >= 1 AND ${table.basis_lineage_member_id} IS NULL) OR (${table.basis_kind} = 'lineage_correction' AND ${table.basis_capability_identity} IS NULL AND ${table.basis_capability_version} IS NULL AND ${table.basis_lineage_member_id} IS NOT NULL)`,
    ),
    check(
      "artifact_source_binding_end_shape",
      sql`(${table.time_ended} IS NULL AND ${table.end_reason} IS NULL) OR (${table.time_ended} IS NOT NULL AND ${table.time_ended} >= ${table.time_started} AND ${table.end_reason} IN ('explicit_rebind', 'lineage_correction'))`,
    ),
    check("artifact_source_binding_time_nonnegative", sql`${table.time_started} >= 0`),
    index("artifact_source_binding_history_idx").on(table.recorded_artifact_id, table.binding_ordinal, table.id),
  ],
)

export const ArtifactSourceObservationTable = sqliteTable(
  "artifact_source_observation",
  {
    id: text().$type<ObservationID>().primaryKey(),
    recorded_artifact_id: text().$type<ArtifactID>().notNull(),
    binding_id: text().$type<BindingID>().notNull(),
    occurrence_ordinal: integer().notNull(),
    result: text().$type<ObservationResult>().notNull(),
    revision_id: text().$type<RevisionID>(),
    revision_attribution_member_id: text().$type<LineageCorrectionMemberID>(),
    media_type: text(),
    observer_capability_identity: text().notNull(),
    observer_capability_version: integer().notNull(),
    time_observed: integer().notNull(),
    time_committed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.recorded_artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.recorded_artifact_id, table.binding_id],
      foreignColumns: [ArtifactSourceBindingTable.recorded_artifact_id, ArtifactSourceBindingTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.revision_id], foreignColumns: [ArtifactRevisionTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.revision_attribution_member_id],
      foreignColumns: [ArtifactLineageCorrectionMemberTable.id],
    }).onDelete("restrict"),
    unique("artifact_source_observation_recorded_id_unique").on(table.recorded_artifact_id, table.id),
    unique("artifact_source_observation_ordinal_unique").on(table.recorded_artifact_id, table.occurrence_ordinal),
    check("artifact_source_observation_ordinal_positive", sql`${table.occurrence_ordinal} >= 1`),
    check(
      "artifact_source_observation_result_shape",
      sql`(${table.result} = 'present' AND ${table.revision_id} IS NOT NULL AND ${table.media_type} IS NOT NULL AND length(${table.media_type}) > 0) OR (${table.result} = 'missing' AND ${table.revision_id} IS NULL AND ${table.revision_attribution_member_id} IS NULL AND ${table.media_type} IS NULL)`,
    ),
    check(
      "artifact_source_observation_observer",
      sql`length(${table.observer_capability_identity}) > 0 AND ${table.observer_capability_version} >= 1`,
    ),
    check(
      "artifact_source_observation_time_nonnegative",
      sql`${table.time_observed} >= 0 AND ${table.time_committed} >= 0`,
    ),
    index("artifact_source_observation_history_idx").on(table.recorded_artifact_id, table.occurrence_ordinal, table.id),
    index("artifact_source_observation_revision_idx").on(table.revision_id, table.recorded_artifact_id),
  ],
)

export const ArtifactObservationCorrectionTable = sqliteTable(
  "artifact_observation_correction",
  {
    id: text().$type<ObservationCorrectionID>().primaryKey(),
    observation_id: text().$type<ObservationID>().notNull(),
    correction_sequence: integer().notNull(),
    predecessor_correction_id: text().$type<ObservationCorrectionID>(),
    media_type: text().notNull(),
    corrected_time_observed: integer(),
    basis: text().$type<ObservationCorrectionBasis>().notNull(),
    capability_identity: text().notNull(),
    capability_version: integer().notNull(),
    time_committed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.observation_id], foreignColumns: [ArtifactSourceObservationTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.observation_id, table.predecessor_correction_id],
      foreignColumns: [table.observation_id, table.id],
    }).onDelete("restrict"),
    unique("artifact_observation_correction_observation_id_unique").on(table.observation_id, table.id),
    unique("artifact_observation_correction_sequence_unique").on(table.observation_id, table.correction_sequence),
    check(
      "artifact_observation_correction_sequence_shape",
      sql`(${table.correction_sequence} = 1 AND ${table.predecessor_correction_id} IS NULL) OR (${table.correction_sequence} > 1 AND ${table.predecessor_correction_id} IS NOT NULL)`,
    ),
    check("artifact_observation_correction_media", sql`length(${table.media_type}) > 0`),
    check("artifact_observation_correction_basis", sql`${table.basis} IN ('learner_correction', 'trusted_observer')`),
    check(
      "artifact_observation_correction_capability",
      sql`length(${table.capability_identity}) > 0 AND ${table.capability_version} >= 1`,
    ),
    check(
      "artifact_observation_correction_time_nonnegative",
      sql`(${table.corrected_time_observed} IS NULL OR ${table.corrected_time_observed} >= 0) AND ${table.time_committed} >= 0`,
    ),
    index("artifact_observation_correction_page_idx").on(table.observation_id, table.correction_sequence, table.id),
  ],
)

export const ArtifactCurrentSourceTable = sqliteTable(
  "artifact_current_source",
  {
    artifact_id: text().$type<ArtifactID>().primaryKey(),
    source_version: integer().notNull().default(0),
    active_binding_id: text().$type<BindingID>(),
    current_revision_id: text().$type<RevisionID>(),
    revision_attribution_member_id: text().$type<LineageCorrectionMemberID>(),
    source_state_observation_id: text().$type<ObservationID>(),
    source_state_member_id: text().$type<LineageCorrectionMemberID>(),
    descriptor_observation_id: text().$type<ObservationID>(),
    descriptor_correction_id: text().$type<ObservationCorrectionID>(),
    effective_media_type: text(),
    availability: text().$type<Availability>().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifact_id, table.active_binding_id],
      foreignColumns: [ArtifactSourceBindingTable.recorded_artifact_id, ArtifactSourceBindingTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.current_revision_id], foreignColumns: [ArtifactRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.revision_attribution_member_id],
      foreignColumns: [ArtifactLineageCorrectionMemberTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifact_id, table.source_state_observation_id],
      foreignColumns: [ArtifactSourceObservationTable.recorded_artifact_id, ArtifactSourceObservationTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.source_state_member_id],
      foreignColumns: [ArtifactLineageCorrectionMemberTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.descriptor_observation_id],
      foreignColumns: [ArtifactSourceObservationTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.descriptor_observation_id, table.descriptor_correction_id],
      foreignColumns: [ArtifactObservationCorrectionTable.observation_id, ArtifactObservationCorrectionTable.id],
    }).onDelete("restrict"),
    check("artifact_current_source_version_nonnegative", sql`${table.source_version} >= 0`),
    check(
      "artifact_current_source_state_shape",
      sql`(${table.current_revision_id} IS NULL AND ${table.availability} = 'unbound' AND ${table.active_binding_id} IS NULL AND ${table.revision_attribution_member_id} IS NULL AND ${table.source_state_observation_id} IS NULL AND ${table.source_state_member_id} IS NULL AND ${table.descriptor_observation_id} IS NULL AND ${table.descriptor_correction_id} IS NULL AND ${table.effective_media_type} IS NULL) OR (${table.current_revision_id} IS NOT NULL AND ((${table.source_state_observation_id} IS NOT NULL AND ${table.source_state_member_id} IS NULL) OR (${table.source_state_observation_id} IS NULL AND ${table.source_state_member_id} IS NOT NULL)) AND ${table.descriptor_observation_id} IS NOT NULL AND ${table.effective_media_type} IS NOT NULL AND length(${table.effective_media_type}) > 0 AND ((${table.availability} IN ('available', 'missing')) AND ${table.active_binding_id} IS NOT NULL OR (${table.availability} = 'unbound' AND ${table.active_binding_id} IS NULL)))`,
    ),
    check(
      "artifact_current_source_descriptor_shape",
      sql`${table.descriptor_correction_id} IS NULL OR ${table.descriptor_observation_id} IS NOT NULL`,
    ),
    check("artifact_current_source_time_nonnegative", sql`${table.time_updated} >= 0`),
    index("artifact_current_source_availability_idx").on(table.availability, table.artifact_id),
  ],
)
