import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { TurnModelOperationTable, TurnToolCandidateTable } from "../turn/sql"
import type { MessageID, PartID } from "../v1/session"
import type { SessionSchema } from "../session/schema"
import type {
  AppliedPurgeSettlement,
  AppliedSettlement,
  AuditBundleID,
  AuditOperationID,
  ContextClassification,
  Mode,
  OwnerKind,
  PurgeRequestID,
  RequestID,
} from "./schema"

export const SessionDeletionControlReceiptTable = sqliteTable(
  "session_deletion_control_receipt",
  {
    request_id: text().$type<RequestID>().primaryKey(),
    request_fingerprint: text().notNull(),
    settlement_schema_version: integer().notNull(),
    root_session_id: text().$type<SessionSchema.ID>().notNull().unique(),
    subtree_count: integer().notNull(),
    subtree_fingerprint: text().notNull(),
    mode: text().$type<Mode>().notNull(),
    permission_decision_fingerprint: text().notNull(),
    proposal_schema_version: integer().notNull(),
    outcome: text().$type<"applied">().notNull(),
    deletion_time: integer().notNull(),
    session_bodies_deleted: integer({ mode: "boolean" }).notNull(),
    settlement: text().$type<string>().notNull(),
    settlement_fingerprint: text().notNull(),
  },
  (table) => [
    check(
      "session_deletion_control_receipt_identity",
      sql`length(${table.request_id}) = 30 AND substr(${table.request_id}, 1, 4) = 'sdr_'
        AND substr(${table.request_id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "session_deletion_control_receipt_fingerprints",
      sql`length(${table.request_fingerprint}) = 64 AND ${table.request_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.subtree_fingerprint}) = 64 AND ${table.subtree_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.permission_decision_fingerprint}) = 64
        AND ${table.permission_decision_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.settlement_fingerprint}) = 64
        AND ${table.settlement_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "session_deletion_control_receipt_shape",
      sql`${table.settlement_schema_version} = 1 AND ${table.proposal_schema_version} = 1
        AND ${table.subtree_count} >= 1 AND ${table.mode} IN ('full', 'minimal_audit')
        AND ${table.outcome} = 'applied' AND ${table.deletion_time} >= 0
        AND ${table.session_bodies_deleted} = 1 AND json_valid(${table.settlement})
        AND json_extract(${table.settlement}, '$.schemaVersion') = 1
        AND json_extract(${table.settlement}, '$.requestID') = ${table.request_id}
        AND json_extract(${table.settlement}, '$.requestFingerprint') = ${table.request_fingerprint}
        AND json_extract(${table.settlement}, '$.rootSessionID') = ${table.root_session_id}
        AND json_extract(${table.settlement}, '$.subtreeCount') = ${table.subtree_count}
        AND json_extract(${table.settlement}, '$.subtreeFingerprint') = ${table.subtree_fingerprint}
        AND json_extract(${table.settlement}, '$.mode') = ${table.mode}
        AND json_extract(${table.settlement}, '$.permissionDecisionFingerprint') = ${table.permission_decision_fingerprint}
        AND json_extract(${table.settlement}, '$.proposalSchemaVersion') = 1
        AND json_extract(${table.settlement}, '$.outcome') = 'applied'
        AND json_extract(${table.settlement}, '$.deletionTime') = ${table.deletion_time}
        AND json_extract(${table.settlement}, '$.sessionBodiesDeleted') = 1`,
    ),
  ],
)

export const SessionDeletionPurgeReceiptTable = sqliteTable(
  "session_deletion_purge_receipt",
  {
    request_id: text().$type<PurgeRequestID>().primaryKey(),
    request_fingerprint: text().notNull(),
    settlement_schema_version: integer().notNull(),
    deletion_request_id: text()
      .$type<RequestID>()
      .notNull()
      .references(() => SessionDeletionControlReceiptTable.request_id, { onDelete: "restrict" }),
    outcome: text().$type<"applied">().notNull(),
    purge_time: integer().notNull(),
    settlement: text().$type<string>().notNull(),
    settlement_fingerprint: text().notNull(),
  },
  (table) => [
    unique("session_deletion_purge_receipt_deletion_unique").on(table.deletion_request_id),
    check(
      "session_deletion_purge_receipt_identity",
      sql`length(${table.request_id}) = 30 AND substr(${table.request_id}, 1, 4) = 'spr_'
        AND substr(${table.request_id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "session_deletion_purge_receipt_fingerprints",
      sql`length(${table.request_fingerprint}) = 64 AND ${table.request_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.settlement_fingerprint}) = 64
        AND ${table.settlement_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "session_deletion_purge_receipt_shape",
      sql`${table.settlement_schema_version} = 1 AND ${table.outcome} = 'applied' AND ${table.purge_time} >= 0
        AND json_valid(${table.settlement})
        AND json_extract(${table.settlement}, '$.schemaVersion') = 1
        AND json_extract(${table.settlement}, '$.requestID') = ${table.request_id}
        AND json_extract(${table.settlement}, '$.requestFingerprint') = ${table.request_fingerprint}
        AND json_extract(${table.settlement}, '$.deletionRequestID') = ${table.deletion_request_id}
        AND json_extract(${table.settlement}, '$.outcome') = 'applied'
        AND json_extract(${table.settlement}, '$.purgeTime') = ${table.purge_time}`,
    ),
  ],
)

export const SessionDeletionAuditBundleTable = sqliteTable(
  "session_deletion_audit_bundle",
  {
    id: text().$type<AuditBundleID>().primaryKey(),
    deletion_request_id: text()
      .$type<RequestID>()
      .notNull()
      .unique()
      .references(() => SessionDeletionControlReceiptTable.request_id, { onDelete: "restrict" }),
    projection_schema_version: integer().notNull(),
    operation_count: integer().notNull(),
    operation_fingerprint: text().notNull(),
    relation_count: integer().notNull(),
    relation_fingerprint: text().notNull(),
    deletion_time: integer().notNull(),
    session_bodies_deleted: integer({ mode: "boolean" }).notNull(),
  },
  (table) => [
    check(
      "session_deletion_audit_bundle_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'sda_'
        AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "session_deletion_audit_bundle_shape",
      sql`${table.projection_schema_version} = 1 AND ${table.operation_count} >= 0
        AND ${table.relation_count} >= 0 AND ${table.deletion_time} >= 0
        AND ${table.session_bodies_deleted} = 1
        AND length(${table.operation_fingerprint}) = 64
        AND ${table.operation_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.relation_fingerprint}) = 64
        AND ${table.relation_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
)

export const SessionDeletionAuditOperationTable = sqliteTable(
  "session_deletion_audit_operation",
  {
    bundle_id: text()
      .$type<AuditBundleID>()
      .notNull()
      .references(() => SessionDeletionAuditBundleTable.id, { onDelete: "cascade" }),
    operation_id: text().$type<AuditOperationID>().notNull(),
    ordinal: integer().notNull(),
    terminal_status: text().$type<"completed" | "failed" | "interrupted">().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.bundle_id, table.operation_id] }),
    unique("session_deletion_audit_operation_ordinal_unique").on(table.bundle_id, table.ordinal),
    check(
      "session_deletion_audit_operation_identity",
      sql`length(${table.operation_id}) = 30 AND substr(${table.operation_id}, 1, 4) = 'sdo_'
        AND substr(${table.operation_id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "session_deletion_audit_operation_shape",
      sql`${table.ordinal} >= 0 AND ${table.terminal_status} IN ('completed', 'failed', 'interrupted')`,
    ),
  ],
)

export const SessionDeletionAuditRecordTable = sqliteTable(
  "session_deletion_audit_record",
  {
    bundle_id: text().$type<AuditBundleID>().notNull(),
    operation_id: text().$type<AuditOperationID>().notNull(),
    owner_kind: text().$type<OwnerKind>().notNull(),
    record_id: text().notNull(),
    revision_id: text().notNull(),
    revision_version: integer().notNull(),
    context_classification: text().$type<ContextClassification>().notNull(),
    exact_read: integer({ mode: "boolean" }).notNull(),
    typed_citation: integer({ mode: "boolean" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.bundle_id,
        table.operation_id,
        table.owner_kind,
        table.record_id,
        table.revision_id,
        table.revision_version,
      ],
    }),
    foreignKey({
      columns: [table.bundle_id, table.operation_id],
      foreignColumns: [SessionDeletionAuditOperationTable.bundle_id, SessionDeletionAuditOperationTable.operation_id],
    }).onDelete("cascade"),
    index("session_deletion_audit_record_lookup_idx").on(
      table.owner_kind,
      table.record_id,
      table.revision_id,
      table.revision_version,
      table.bundle_id,
    ),
    check(
      "session_deletion_audit_record_shape",
      sql`${table.owner_kind} IN (
          'course', 'learning_navigation', 'learner_goal', 'learning_material', 'learning_interaction',
          'learner_response_evidence', 'future_attention', 'assignment', 'learner_state_judgment',
          'advisory_plan_suggestion'
        )
        AND length(${table.record_id}) > 0 AND length(${table.revision_id}) > 0 AND ${table.revision_version} >= 0
        AND ${table.context_classification} IN ('not_entered', 'locator_only', 'semantic_full')
        AND ${table.exact_read} IN (0, 1) AND ${table.typed_citation} IN (0, 1)
        AND (${table.context_classification} <> 'not_entered' OR ${table.exact_read} = 1 OR ${table.typed_citation} = 1)`,
    ),
  ],
)

export const TurnLineageRecordRelationTable = sqliteTable(
  "turn_lineage_record_relation",
  {
    assistant_message_id: text()
      .$type<MessageID>()
      .notNull()
      .references(() => TurnModelOperationTable.assistant_message_id, { onDelete: "cascade" }),
    relation_kind: text().$type<"exact_read" | "typed_citation">().notNull(),
    owner_kind: text().$type<OwnerKind>().notNull(),
    record_id: text().notNull(),
    revision_id: text().notNull(),
    revision_version: integer().notNull(),
    producer_part_id: text().$type<PartID>().notNull(),
    producer_version: integer().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.assistant_message_id,
        table.relation_kind,
        table.owner_kind,
        table.record_id,
        table.revision_id,
        table.revision_version,
        table.producer_part_id,
      ],
    }),
    foreignKey({
      columns: [table.producer_part_id, table.assistant_message_id],
      foreignColumns: [TurnToolCandidateTable.part_id, TurnToolCandidateTable.assistant_message_id],
    }).onDelete("cascade"),
    index("turn_lineage_record_relation_record_idx").on(
      table.owner_kind,
      table.record_id,
      table.revision_id,
      table.revision_version,
      table.assistant_message_id,
    ),
    check(
      "turn_lineage_record_relation_shape",
      sql`${table.relation_kind} IN ('exact_read', 'typed_citation')
        AND ${table.owner_kind} IN (
          'course', 'learning_navigation', 'learner_goal', 'learning_material', 'learning_interaction',
          'learner_response_evidence', 'future_attention', 'assignment', 'learner_state_judgment',
          'advisory_plan_suggestion'
        )
        AND length(${table.record_id}) > 0
        AND length(${table.revision_id}) > 0 AND ${table.revision_version} >= 0
        AND length(${table.producer_part_id}) > 0 AND ${table.producer_version} >= 1`,
    ),
  ],
)

export const TurnLineageContextRelationTable = sqliteTable(
  "turn_lineage_context_relation",
  {
    assistant_message_id: text()
      .$type<MessageID>()
      .notNull()
      .references(() => TurnModelOperationTable.assistant_message_id, { onDelete: "cascade" }),
    owner_kind: text().$type<OwnerKind>().notNull(),
    record_id: text().notNull(),
    revision_id: text().notNull(),
    revision_version: integer().notNull(),
    context_classification: text().$type<Exclude<ContextClassification, "not_entered">>().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.assistant_message_id,
        table.owner_kind,
        table.record_id,
        table.revision_id,
        table.revision_version,
      ],
    }),
    index("turn_lineage_context_relation_record_idx").on(
      table.owner_kind,
      table.record_id,
      table.revision_id,
      table.revision_version,
      table.assistant_message_id,
    ),
    check(
      "turn_lineage_context_relation_shape",
      sql`${table.owner_kind} IN (
          'course', 'learning_navigation', 'learner_goal', 'learning_material', 'learning_interaction',
          'learner_response_evidence', 'future_attention', 'assignment', 'learner_state_judgment',
          'advisory_plan_suggestion'
        )
        AND length(${table.record_id}) > 0
        AND length(${table.revision_id}) > 0 AND ${table.revision_version} >= 0
        AND ${table.context_classification} IN ('locator_only', 'semantic_full')`,
    ),
  ],
)

export const TurnLineageContextCoverageTable = sqliteTable(
  "turn_lineage_context_coverage",
  {
    assistant_message_id: text()
      .$type<MessageID>()
      .primaryKey()
      .references(() => TurnModelOperationTable.assistant_message_id, { onDelete: "cascade" }),
    projection_schema_version: integer().notNull(),
    relation_count: integer().notNull(),
    relation_fingerprint: text().notNull(),
  },
  (table) => [
    check(
      "turn_lineage_context_coverage_shape",
      sql`${table.projection_schema_version} = 1 AND ${table.relation_count} >= 0
        AND length(${table.relation_fingerprint}) = 64
        AND ${table.relation_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
)

export const TurnLineageCandidateCoverageTable = sqliteTable(
  "turn_lineage_candidate_coverage",
  {
    part_id: text()
      .$type<PartID>()
      .primaryKey()
      .references(() => TurnToolCandidateTable.part_id, { onDelete: "cascade" }),
    assistant_message_id: text().$type<MessageID>().notNull(),
    producer_kind: text().$type<"lazy_read" | "typed_citation" | "not_eligible">().notNull(),
    outcome: text().$type<"positive_projected" | "no_positive_relation" | "not_started" | "not_eligible">().notNull(),
    catalog_version: integer().notNull(),
    result_schema_version: integer().notNull(),
    relation_count: integer().notNull(),
    relation_fingerprint: text().notNull(),
    time_covered: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.part_id, table.assistant_message_id],
      foreignColumns: [TurnToolCandidateTable.part_id, TurnToolCandidateTable.assistant_message_id],
    }).onDelete("cascade"),
    check(
      "turn_lineage_candidate_coverage_shape",
      sql`${table.producer_kind} IN ('lazy_read', 'typed_citation', 'not_eligible')
        AND ${table.outcome} IN ('positive_projected', 'no_positive_relation', 'not_started', 'not_eligible')
        AND ${table.catalog_version} >= 1 AND ${table.result_schema_version} >= 1
        AND ${table.relation_count} >= 0 AND length(${table.relation_fingerprint}) = 64
        AND ${table.relation_fingerprint} NOT GLOB '*[^0-9a-f]*' AND ${table.time_covered} >= 0
        AND ((${table.outcome} = 'positive_projected' AND ${table.relation_count} > 0)
          OR (${table.outcome} <> 'positive_projected' AND ${table.relation_count} = 0))`,
    ),
  ],
)

export const TurnLineageOperationCoverageTable = sqliteTable(
  "turn_lineage_operation_coverage",
  {
    assistant_message_id: text()
      .$type<MessageID>()
      .primaryKey()
      .references(() => TurnModelOperationTable.assistant_message_id, { onDelete: "cascade" }),
    coverage_schema_version: integer().notNull(),
    catalog_version: integer().notNull(),
    candidate_count: integer().notNull(),
    covered_candidate_count: integer().notNull(),
    relation_count: integer().notNull(),
    relation_fingerprint: text().notNull(),
    time_sealed: integer().notNull(),
  },
  (table) => [
    check(
      "turn_lineage_operation_coverage_shape",
      sql`${table.coverage_schema_version} = 1 AND ${table.catalog_version} >= 1
        AND ${table.candidate_count} >= 0 AND ${table.covered_candidate_count} = ${table.candidate_count}
        AND ${table.relation_count} >= 0 AND length(${table.relation_fingerprint}) = 64
        AND ${table.relation_fingerprint} NOT GLOB '*[^0-9a-f]*' AND ${table.time_sealed} >= 0`,
    ),
  ],
)

export const TurnLineagePreMigrationOperationTable = sqliteTable(
  "turn_lineage_pre_migration_operation",
  {
    assistant_message_id: text()
      .$type<MessageID>()
      .primaryKey()
      .references(() => TurnModelOperationTable.assistant_message_id, { onDelete: "cascade" }),
    capture_schema_version: integer().notNull(),
  },
  (table) => [check("turn_lineage_pre_migration_operation_shape", sql`${table.capture_schema_version} = 1`)],
)

export type ControlReceiptRow = typeof SessionDeletionControlReceiptTable.$inferSelect & {
  readonly settlement: string
}
export type PurgeReceiptRow = typeof SessionDeletionPurgeReceiptTable.$inferSelect & {
  readonly settlement: string
}
export type ControlSettlement = AppliedSettlement
export type PurgeSettlement = AppliedPurgeSettlement
