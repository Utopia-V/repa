import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { ArtifactID, LineageCorrectionMemberID, RevisionID as ArtifactRevisionID } from "../artifact/schema"
import { ArtifactLineageCorrectionMemberTable, ArtifactRevisionTable, ArtifactTable } from "../artifact/sql"
import type { BindingEpisodeID, BindingID, ContentRootID, GrantEpisodeID } from "../content-root/schema"
import {
  ContentRootBindingEpisodeTable,
  ContentRootBindingTable,
  ContentRootGrantEpisodeTable,
  ContentRootTable,
} from "../content-root/sql"
import type {
  AcceptanceBasis,
  AttributionType,
  Availability,
  AvailabilityBasis,
  AvailabilityEventID,
  ContinuedUseGrantID,
  CreationBasis,
  EffectID,
  GrantDisposition,
  DeliveryMode,
  Diagnostic,
  ProducerKind,
  ProducerProvenance,
  ProducerUsage,
  Profile,
  ResultBoundary,
  TerminalStatus,
  RevisionID,
} from "./schema"

export const RepresentationEffectTable = sqliteTable(
  "representation_effect",
  {
    id: text().$type<EffectID>().primaryKey(),
    operation_identity: text().notNull(),
    semantic_fingerprint: text().notNull(),
    time_committed: integer().notNull(),
  },
  (table) => [
    unique("representation_effect_operation_unique").on(table.operation_identity),
    check("representation_effect_operation_nonempty", sql`length(${table.operation_identity}) > 0`),
    check(
      "representation_effect_fingerprint",
      sql`length(${table.semantic_fingerprint}) = 64 AND ${table.semantic_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check("representation_effect_time_nonnegative", sql`${table.time_committed} >= 0`),
  ],
)

export const RepresentationRevisionTable = sqliteTable(
  "representation_revision",
  {
    id: text().$type<RevisionID>().primaryKey(),
    effect_id: text().$type<EffectID>().notNull(),
    source_revision_id: text().$type<ArtifactRevisionID>().notNull(),
    effective_artifact_id: text().$type<ArtifactID>().notNull(),
    attribution_type: text().$type<AttributionType>().notNull(),
    attribution_member_id: text().$type<LineageCorrectionMemberID>(),
    accepted_disposition_version: integer().notNull(),
    accepted_lineage_version: integer().notNull(),
    source_version: integer().notNull(),
    source_media_type: text().notNull(),
    source_digest: text().notNull(),
    source_byte_length: integer().notNull(),
    content_root_id: text().$type<ContentRootID>().notNull(),
    content_root_binding_id: text().$type<BindingID>().notNull(),
    content_root_binding_episode_id: text().$type<BindingEpisodeID>().notNull(),
    content_root_binding_episode_ordinal: integer().notNull(),
    content_root_grant_episode_id: text().$type<GrantEpisodeID>().notNull(),
    content_root_grant_version: integer().notNull(),
    normalized_relative_path: text().notNull(),
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
    source_object_kind: text().$type<"file">().notNull(),
    source_observed_time: integer().notNull(),
    presented_input_digest: text().notNull(),
    presented_input_byte_length: integer().notNull(),
    producer_kind: text().$type<ProducerKind>().notNull(),
    producer_identity: text().notNull(),
    producer_version: text().notNull(),
    provider_id: text(),
    model_id: text(),
    profile_variant: text(),
    task_version: integer().notNull(),
    profile: text().$type<Profile>().notNull(),
    canonicalizer_version: integer().notNull(),
    provenance_version: integer().notNull(),
    provenance: text({ mode: "json" }).$type<ProducerProvenance>().notNull(),
    run_identity: text().notNull(),
    result_boundary: text().$type<ResultBoundary>().notNull(),
    terminal_status: text().$type<TerminalStatus>().notNull(),
    diagnostics: text({ mode: "json" }).$type<readonly Diagnostic[]>().notNull(),
    usage: text({ mode: "json" }).$type<ProducerUsage>().notNull(),
    output_media_type: text().notNull(),
    storage_key: text().notNull(),
    output_digest: text().notNull(),
    output_byte_length: integer().notNull(),
    profile_record_count: integer().notNull(),
    acceptance_basis: text().$type<AcceptanceBasis>().notNull(),
    creation_basis: text().$type<CreationBasis>().notNull(),
    creation_identity: text().notNull(),
    authorization_intent: text().$type<"persistent_readable_access">().notNull(),
    authorization_basis: text().notNull(),
    delivery_mode: text().$type<DeliveryMode>().notNull(),
    causal_occurrence_id: text(),
    causal_invocation_part_id: text(),
    time_accepted: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.effect_id], foreignColumns: [RepresentationEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.source_revision_id], foreignColumns: [ArtifactRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.effective_artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
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
        table.content_root_grant_version,
      ],
      foreignColumns: [
        ContentRootGrantEpisodeTable.content_root_id,
        ContentRootGrantEpisodeTable.id,
        ContentRootGrantEpisodeTable.binding_id,
        ContentRootGrantEpisodeTable.binding_episode_id,
        ContentRootGrantEpisodeTable.ordinal,
      ],
    }).onDelete("restrict"),
    unique("representation_revision_effect_unique").on(table.effect_id),
    unique("representation_revision_storage_key_unique").on(table.storage_key),
    check(
      "representation_revision_attribution_shape",
      sql`(${table.attribution_type} = 'recorded' AND ${table.attribution_member_id} IS NULL) OR (${table.attribution_type} = 'lineage_correction' AND ${table.attribution_member_id} IS NOT NULL)`,
    ),
    check(
      "representation_revision_versions",
      sql`${table.accepted_disposition_version} >= 0 AND ${table.accepted_lineage_version} >= 0 AND ${table.source_version} >= 0 AND ${table.content_root_binding_episode_ordinal} >= 1 AND ${table.content_root_grant_version} >= 1`,
    ),
    // Gate 10 issues the Unicode-aware key; SQLite lower() is ASCII-only and cannot reproduce that invariant.
    check(
      "representation_revision_source_shape",
      sql`length(${table.source_media_type}) > 0 AND length(${table.source_digest}) = 64 AND ${table.source_digest} NOT GLOB '*[^0-9a-f]*' AND ${table.source_byte_length} >= 0 AND length(${table.normalized_relative_path}) > 0 AND ${table.source_object_platform} = 'windows_ntfs' AND ${table.source_object_verifier_version} >= 1 AND length(${table.source_object_canonical_path}) > 0 AND length(${table.source_object_canonical_path_key}) > 0 AND length(${table.source_object_volume_serial}) > 0 AND length(${table.source_object_id}) = 32 AND length(${table.source_object_creation_time}) > 0 AND length(${table.source_object_change_time}) > 0 AND length(${table.source_object_last_write_time}) > 0 AND ${table.source_object_size} >= 0 AND ${table.source_object_size} = ${table.source_byte_length} AND ${table.source_object_kind} = 'file' AND ${table.source_observed_time} >= 0`,
    ),
    check(
      "representation_revision_input_shape",
      sql`length(${table.presented_input_digest}) = 64 AND ${table.presented_input_digest} NOT GLOB '*[^0-9a-f]*' AND ${table.presented_input_byte_length} >= 0 AND ${table.presented_input_digest} = ${table.source_digest} AND ${table.presented_input_byte_length} = ${table.source_byte_length}`,
    ),
    check(
      "representation_revision_producer_shape",
      sql`length(${table.producer_identity}) > 0 AND length(${table.producer_version}) > 0 AND ${table.task_version} >= 1 AND ${table.canonicalizer_version} >= 1 AND ${table.provenance_version} >= 1 AND length(${table.run_identity}) > 0 AND json_valid(${table.provenance}) AND json_type(${table.provenance}) = 'object' AND json_valid(${table.diagnostics}) AND json_type(${table.diagnostics}) = 'array' AND json_valid(${table.usage}) AND json_type(${table.usage}) = 'object' AND ((${table.producer_kind} = 'local_pdf' AND ${table.provider_id} IS NULL AND ${table.model_id} IS NULL AND ${table.profile_variant} IS NULL AND ${table.profile} = 'repa.pdf-text.v1' AND ${table.result_boundary} = 'framed_stdout_v1' AND ${table.terminal_status} = 'completed' AND ${table.acceptance_basis} = 'mechanical_profile') OR (${table.producer_kind} = 'configured_model' AND ${table.provider_id} IS NOT NULL AND length(${table.provider_id}) > 0 AND ${table.model_id} IS NOT NULL AND length(${table.model_id}) > 0 AND ${table.profile} = 'repa.model-rendition.v1' AND ${table.result_boundary} = 'model_schema_v1' AND ${table.terminal_status} = 'stop' AND ${table.acceptance_basis} = 'model_claimed_rendition'))`,
    ),
    check(
      "representation_revision_output_shape",
      sql`length(${table.output_media_type}) > 0 AND length(${table.storage_key}) > 0 AND length(${table.output_digest}) = 64 AND ${table.output_digest} NOT GLOB '*[^0-9a-f]*' AND ${table.output_byte_length} > 0 AND ${table.profile_record_count} >= 1`,
    ),
    check(
      "representation_revision_creation_shape",
      sql`${table.creation_basis} IN ('deterministic_operation', 'learning_command') AND length(${table.creation_identity}) > 0 AND ${table.authorization_intent} = 'persistent_readable_access' AND length(${table.authorization_basis}) > 0 AND ((${table.creation_basis} = 'deterministic_operation' AND ${table.delivery_mode} = 'deterministic' AND ${table.causal_occurrence_id} IS NULL AND ${table.causal_invocation_part_id} IS NULL) OR (${table.creation_basis} = 'learning_command' AND ${table.delivery_mode} = 'model_tool' AND ${table.causal_occurrence_id} IS NOT NULL AND length(${table.causal_occurrence_id}) > 0 AND ${table.causal_invocation_part_id} IS NOT NULL AND length(${table.causal_invocation_part_id}) > 0)) AND ${table.time_accepted} >= 0`,
    ),
    index("representation_revision_source_idx").on(table.source_revision_id, table.time_accepted, table.id),
    index("representation_revision_artifact_idx").on(table.effective_artifact_id, table.time_accepted, table.id),
  ],
)

export const RepresentationAvailabilityEventTable = sqliteTable(
  "representation_availability_event",
  {
    id: text().$type<AvailabilityEventID>().primaryKey(),
    representation_revision_id: text().$type<RevisionID>().notNull(),
    version: integer().notNull(),
    disposition: text().$type<Availability>().notNull(),
    observed_storage_key: text(),
    observed_digest: text(),
    observed_byte_length: integer(),
    basis: text().$type<AvailabilityBasis>().notNull(),
    operation_identity: text(),
    time_observed: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.representation_revision_id],
      foreignColumns: [RepresentationRevisionTable.id],
    }).onDelete("restrict"),
    unique("representation_availability_version_unique").on(table.representation_revision_id, table.version),
    unique("representation_availability_operation_unique").on(table.operation_identity),
    check("representation_availability_version_positive", sql`${table.version} >= 1`),
    check(
      "representation_availability_basis",
      sql`${table.basis} IN ('acceptance', 'verified_read', 'missing_observation', 'integrity_observation', 'exact_restoration', 'explicit_deletion', 'deletion_recovery')`,
    ),
    check(
      "representation_availability_observation_shape",
      sql`(${table.observed_storage_key} IS NOT NULL AND length(${table.observed_storage_key}) > 0) AND ((${table.disposition} = 'available' AND ${table.observed_digest} IS NOT NULL AND length(${table.observed_digest}) = 64 AND ${table.observed_digest} NOT GLOB '*[^0-9a-f]*' AND ${table.observed_byte_length} IS NOT NULL AND ${table.observed_byte_length} >= 0) OR (${table.disposition} = 'integrity_mismatch' AND ((${table.observed_digest} IS NULL AND ${table.observed_byte_length} IS NULL) OR (${table.observed_digest} IS NOT NULL AND length(${table.observed_digest}) = 64 AND ${table.observed_digest} NOT GLOB '*[^0-9a-f]*' AND ${table.observed_byte_length} IS NOT NULL AND ${table.observed_byte_length} >= 0))) OR (${table.disposition} IN ('externally_missing', 'explicitly_deleted') AND ${table.observed_digest} IS NULL AND ${table.observed_byte_length} IS NULL))`,
    ),
    check("representation_availability_time_nonnegative", sql`${table.time_observed} >= 0`),
    index("representation_availability_history_idx").on(table.representation_revision_id, table.version, table.id),
  ],
)

export const RepresentationAvailabilityCurrentTable = sqliteTable(
  "representation_availability_current",
  {
    representation_revision_id: text().$type<RevisionID>().primaryKey(),
    version: integer().notNull(),
    disposition: text().$type<Availability>().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.representation_revision_id],
      foreignColumns: [RepresentationRevisionTable.id],
    }).onDelete("restrict"),
    check("representation_availability_current_version_positive", sql`${table.version} >= 1`),
    check(
      "representation_availability_current_disposition",
      sql`${table.disposition} IN ('available', 'externally_missing', 'integrity_mismatch', 'explicitly_deleted')`,
    ),
    check("representation_availability_current_time_nonnegative", sql`${table.time_updated} >= 0`),
    index("representation_availability_current_disposition_idx").on(
      table.disposition,
      table.representation_revision_id,
    ),
  ],
)

export const RepresentationContinuedUseGrantTable = sqliteTable(
  "representation_continued_use_grant",
  {
    id: text().$type<ContinuedUseGrantID>().primaryKey(),
    effective_artifact_id: text().$type<ArtifactID>().notNull(),
    representation_revision_id: text().$type<RevisionID>().notNull(),
    old_source_revision_id: text().$type<ArtifactRevisionID>().notNull(),
    current_source_revision_id: text().$type<ArtifactRevisionID>().notNull(),
    current_attribution_type: text().$type<AttributionType>().notNull(),
    current_attribution_member_id: text().$type<LineageCorrectionMemberID>(),
    current_lineage_version: integer().notNull(),
    version: integer().notNull(),
    disposition: text().$type<GrantDisposition>().notNull(),
    authorization_basis: text().notNull(),
    authorization_operation_identity: text().notNull(),
    authorization_fingerprint: text().notNull(),
    causal_occurrence_id: text(),
    causal_invocation_part_id: text(),
    revocation_basis: text(),
    revocation_operation_identity: text(),
    time_authorized: integer().notNull(),
    time_revoked: integer(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.effective_artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.representation_revision_id],
      foreignColumns: [RepresentationRevisionTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.old_source_revision_id], foreignColumns: [ArtifactRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.current_source_revision_id], foreignColumns: [ArtifactRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.current_attribution_member_id],
      foreignColumns: [ArtifactLineageCorrectionMemberTable.id],
    }).onDelete("restrict"),
    check(
      "representation_continued_use_attribution_shape",
      sql`(${table.current_attribution_type} = 'recorded' AND ${table.current_attribution_member_id} IS NULL) OR (${table.current_attribution_type} = 'lineage_correction' AND ${table.current_attribution_member_id} IS NOT NULL)`,
    ),
    check(
      "representation_continued_use_versions",
      sql`${table.current_lineage_version} >= 0 AND ${table.version} >= 1`,
    ),
    unique("representation_continued_use_authorization_operation_unique").on(table.authorization_operation_identity),
    unique("representation_continued_use_revocation_operation_unique").on(table.revocation_operation_identity),
    check(
      "representation_continued_use_basis",
      sql`length(${table.authorization_basis}) > 0 AND length(${table.authorization_operation_identity}) > 0 AND length(${table.authorization_fingerprint}) = 64 AND ${table.authorization_fingerprint} NOT GLOB '*[^0-9a-f]*' AND ((${table.causal_occurrence_id} IS NULL AND ${table.causal_invocation_part_id} IS NULL) OR (${table.causal_occurrence_id} IS NOT NULL AND length(${table.causal_occurrence_id}) > 0 AND ${table.causal_invocation_part_id} IS NOT NULL AND length(${table.causal_invocation_part_id}) > 0))`,
    ),
    check(
      "representation_continued_use_disposition_shape",
      sql`(${table.disposition} = 'active' AND ${table.revocation_basis} IS NULL AND ${table.revocation_operation_identity} IS NULL AND ${table.time_revoked} IS NULL) OR (${table.disposition} = 'revoked' AND ${table.revocation_basis} IS NOT NULL AND length(${table.revocation_basis}) > 0 AND ${table.revocation_operation_identity} IS NOT NULL AND length(${table.revocation_operation_identity}) > 0 AND ${table.time_revoked} >= ${table.time_authorized})`,
    ),
    check(
      "representation_continued_use_time_order",
      sql`${table.time_authorized} >= 0 AND ${table.time_updated} >= ${table.time_authorized}`,
    ),
    uniqueIndex("representation_continued_use_active_idx")
      .on(
        table.effective_artifact_id,
        table.representation_revision_id,
        table.old_source_revision_id,
        table.current_source_revision_id,
      )
      .where(sql`${table.disposition} = 'active'`),
    index("representation_continued_use_history_idx").on(
      table.effective_artifact_id,
      table.representation_revision_id,
      table.time_authorized,
      table.id,
    ),
  ],
)
