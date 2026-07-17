import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core"
import type {
  BindingEpisodeID,
  BindingID,
  ContentRootID,
  GrantEpisodeID,
  MutationGrantID,
  MutationScope,
} from "./schema"

export const ContentRootTable = sqliteTable(
  "content_root",
  {
    id: text().$type<ContentRootID>().primaryKey(),
    time_created: integer().notNull(),
  },
  (table) => [check("content_root_time_nonnegative", sql`${table.time_created} >= 0`)],
)

export const ContentRootBindingTable = sqliteTable(
  "content_root_binding",
  {
    id: text().$type<BindingID>().primaryKey(),
    content_root_id: text().$type<ContentRootID>().notNull(),
    canonical_path: text().notNull(),
    canonical_path_key: text().notNull(),
    platform: text().$type<"windows_ntfs">().notNull(),
    volume_serial: text().notNull(),
    object_id: text().notNull(),
    creation_time: text().notNull(),
    initial_change_time: text().notNull(),
    verifier_version: integer().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.content_root_id], foreignColumns: [ContentRootTable.id] }).onDelete("restrict"),
    unique("content_root_binding_root_id_unique").on(table.content_root_id, table.id),
    unique("content_root_binding_exact_key_unique").on(
      table.canonical_path_key,
      table.platform,
      table.volume_serial,
      table.object_id,
      table.creation_time,
    ),
    check(
      "content_root_binding_shape",
      sql`length(${table.canonical_path}) > 0 AND length(${table.canonical_path_key}) > 0 AND ${table.platform} = 'windows_ntfs' AND length(${table.volume_serial}) > 0 AND length(${table.object_id}) = 32 AND length(${table.creation_time}) > 0 AND length(${table.initial_change_time}) > 0 AND ${table.verifier_version} >= 1`,
    ),
    check("content_root_binding_time_nonnegative", sql`${table.time_created} >= 0`),
    index("content_root_binding_root_idx").on(table.content_root_id, table.time_created, table.id),
  ],
)

export const ContentRootBindingEpisodeTable = sqliteTable(
  "content_root_binding_episode",
  {
    id: text().$type<BindingEpisodeID>().primaryKey(),
    content_root_id: text().$type<ContentRootID>().notNull(),
    binding_id: text().$type<BindingID>().notNull(),
    ordinal: integer().notNull(),
    approval_basis: text().notNull(),
    time_started: integer().notNull(),
    time_ended: integer(),
    end_reason: text().$type<"explicit_rebind">(),
  },
  (table) => [
    foreignKey({ columns: [table.content_root_id], foreignColumns: [ContentRootTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.content_root_id, table.binding_id],
      foreignColumns: [ContentRootBindingTable.content_root_id, ContentRootBindingTable.id],
    }).onDelete("restrict"),
    unique("content_root_binding_episode_root_id_unique").on(table.content_root_id, table.id),
    unique("content_root_binding_episode_ordinal_unique").on(table.content_root_id, table.ordinal),
    check("content_root_binding_episode_ordinal_positive", sql`${table.ordinal} >= 1`),
    check("content_root_binding_episode_basis", sql`length(${table.approval_basis}) > 0`),
    check(
      "content_root_binding_episode_end_shape",
      sql`(${table.time_ended} IS NULL AND ${table.end_reason} IS NULL) OR (${table.time_ended} IS NOT NULL AND ${table.time_ended} >= ${table.time_started} AND ${table.end_reason} = 'explicit_rebind')`,
    ),
    check("content_root_binding_episode_time_nonnegative", sql`${table.time_started} >= 0`),
    uniqueIndex("content_root_binding_episode_active_idx")
      .on(table.content_root_id)
      .where(sql`${table.time_ended} IS NULL`),
    index("content_root_binding_episode_history_idx").on(table.content_root_id, table.ordinal, table.id),
  ],
)

export const ContentRootGrantEpisodeTable = sqliteTable(
  "content_root_grant_episode",
  {
    id: text().$type<GrantEpisodeID>().primaryKey(),
    content_root_id: text().$type<ContentRootID>().notNull(),
    binding_id: text().$type<BindingID>().notNull(),
    binding_episode_id: text().$type<BindingEpisodeID>().notNull(),
    ordinal: integer().notNull(),
    approval_basis: text().notNull(),
    time_approved: integer().notNull(),
    close_basis: text(),
    time_closed: integer(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.content_root_id], foreignColumns: [ContentRootTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.content_root_id, table.binding_id],
      foreignColumns: [ContentRootBindingTable.content_root_id, ContentRootBindingTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.content_root_id, table.binding_episode_id],
      foreignColumns: [ContentRootBindingEpisodeTable.content_root_id, ContentRootBindingEpisodeTable.id],
    }).onDelete("restrict"),
    unique("content_root_grant_episode_root_id_unique").on(table.content_root_id, table.id),
    unique("content_root_grant_episode_ordinal_unique").on(table.content_root_id, table.ordinal),
    check("content_root_grant_episode_ordinal_positive", sql`${table.ordinal} >= 1`),
    check("content_root_grant_episode_basis", sql`length(${table.approval_basis}) > 0`),
    check(
      "content_root_grant_episode_close_shape",
      sql`(${table.time_closed} IS NULL AND ${table.close_basis} IS NULL) OR (${table.time_closed} IS NOT NULL AND ${table.time_closed} >= ${table.time_approved} AND ${table.close_basis} IS NOT NULL AND length(${table.close_basis}) > 0)`,
    ),
    check(
      "content_root_grant_episode_time_order",
      sql`${table.time_approved} >= 0 AND ${table.time_updated} >= ${table.time_approved}`,
    ),
    uniqueIndex("content_root_grant_episode_active_idx")
      .on(table.content_root_id)
      .where(sql`${table.time_closed} IS NULL`),
    index("content_root_grant_episode_history_idx").on(table.content_root_id, table.ordinal, table.id),
  ],
)

export const ContentRootCurrentTable = sqliteTable(
  "content_root_current",
  {
    content_root_id: text().$type<ContentRootID>().primaryKey(),
    binding_id: text().$type<BindingID>().notNull(),
    binding_episode_id: text().$type<BindingEpisodeID>().notNull(),
    grant_episode_id: text().$type<GrantEpisodeID>(),
    disposition: text().$type<"active" | "revoked">().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.content_root_id], foreignColumns: [ContentRootTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.content_root_id, table.binding_id],
      foreignColumns: [ContentRootBindingTable.content_root_id, ContentRootBindingTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.content_root_id, table.binding_episode_id],
      foreignColumns: [ContentRootBindingEpisodeTable.content_root_id, ContentRootBindingEpisodeTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.content_root_id, table.grant_episode_id],
      foreignColumns: [ContentRootGrantEpisodeTable.content_root_id, ContentRootGrantEpisodeTable.id],
    }).onDelete("restrict"),
    check(
      "content_root_current_disposition_shape",
      sql`(${table.disposition} = 'active' AND ${table.grant_episode_id} IS NOT NULL) OR (${table.disposition} = 'revoked' AND ${table.grant_episode_id} IS NULL)`,
    ),
    check("content_root_current_time_nonnegative", sql`${table.time_updated} >= 0`),
    index("content_root_current_disposition_idx").on(table.disposition, table.content_root_id),
  ],
)

export const ContentMutationGrantTable = sqliteTable(
  "content_mutation_grant",
  {
    id: text().$type<MutationGrantID>().primaryKey(),
    canonical_anchor_path: text().notNull(),
    canonical_anchor_path_key: text().notNull(),
    platform: text().$type<"windows_ntfs">().notNull(),
    volume_serial: text().notNull(),
    object_id: text().notNull(),
    creation_time: text().notNull(),
    initial_change_time: text().notNull(),
    verifier_version: integer().notNull(),
    relative_scope: text().notNull(),
    scope_kind: text().$type<MutationScope>().notNull(),
    allow_create: integer({ mode: "boolean" }).notNull().default(false),
    allow_modify: integer({ mode: "boolean" }).notNull().default(false),
    allow_delete: integer({ mode: "boolean" }).notNull().default(false),
    allow_rename_source: integer({ mode: "boolean" }).notNull().default(false),
    allow_rename_destination: integer({ mode: "boolean" }).notNull().default(false),
    version: integer().notNull().default(1),
    disposition: text().$type<"active" | "revoked">().notNull(),
    approval_basis: text().notNull(),
    time_approved: integer().notNull(),
    revocation_basis: text(),
    time_revoked: integer(),
    time_updated: integer().notNull(),
    provenance_content_root_id: text().$type<ContentRootID>(),
    provenance_binding_id: text().$type<BindingID>(),
  },
  (table) => [
    foreignKey({ columns: [table.provenance_content_root_id], foreignColumns: [ContentRootTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.provenance_content_root_id, table.provenance_binding_id],
      foreignColumns: [ContentRootBindingTable.content_root_id, ContentRootBindingTable.id],
    }).onDelete("restrict"),
    check(
      "content_mutation_grant_anchor_shape",
      sql`length(${table.canonical_anchor_path}) > 0 AND length(${table.canonical_anchor_path_key}) > 0 AND ${table.platform} = 'windows_ntfs' AND length(${table.volume_serial}) > 0 AND length(${table.object_id}) = 32 AND length(${table.creation_time}) > 0 AND length(${table.initial_change_time}) > 0 AND ${table.verifier_version} >= 1`,
    ),
    check(
      "content_mutation_grant_scope_shape",
      sql`length(${table.relative_scope}) > 0 AND ${table.scope_kind} IN ('exact', 'subtree')`,
    ),
    check(
      "content_mutation_grant_rights_nonempty",
      sql`${table.allow_create} OR ${table.allow_modify} OR ${table.allow_delete} OR ${table.allow_rename_source} OR ${table.allow_rename_destination}`,
    ),
    check("content_mutation_grant_version_positive", sql`${table.version} >= 1`),
    check(
      "content_mutation_grant_disposition_shape",
      sql`(${table.disposition} = 'active' AND ${table.revocation_basis} IS NULL AND ${table.time_revoked} IS NULL) OR (${table.disposition} = 'revoked' AND ${table.revocation_basis} IS NOT NULL AND length(${table.revocation_basis}) > 0 AND ${table.time_revoked} >= ${table.time_approved})`,
    ),
    check(
      "content_mutation_grant_provenance_shape",
      sql`(${table.provenance_content_root_id} IS NULL AND ${table.provenance_binding_id} IS NULL) OR (${table.provenance_content_root_id} IS NOT NULL AND ${table.provenance_binding_id} IS NOT NULL)`,
    ),
    check(
      "content_mutation_grant_time_order",
      sql`${table.time_approved} >= 0 AND ${table.time_updated} >= ${table.time_approved}`,
    ),
    index("content_mutation_grant_active_idx").on(table.disposition, table.canonical_anchor_path_key, table.id),
    index("content_mutation_grant_provenance_idx").on(
      table.provenance_content_root_id,
      table.provenance_binding_id,
      table.id,
    ),
  ],
)
