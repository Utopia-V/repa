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
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core"
import { ArtifactRevisionTable } from "../artifact/sql"
import { CourseTable } from "../course/sql"
import type { Course } from "../course"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import type { ReceiptID } from "../learning-command/physical-schema"
import { RepresentationRevisionTable } from "../representation/sql"
import type { PermissionV1 } from "../v1/permission"
import type { MessageID, PartID } from "../v1/session"
import type {
  AgentAction,
  AssignmentID,
  Candidate,
  CanonicalChangeSet,
  CapabilityOutcome,
  Disposition,
  EffectID,
  EffectiveSourceBasis,
  IntentResultProjection,
  MutationAuthorshipBasis,
  RevisionID,
  SemanticSnapshot,
  SourceAdmissionBasis,
  SourceBasisRelation,
} from "./schema"

export const AssignmentTable = sqliteTable(
  "assignment",
  {
    id: text().$type<AssignmentID>().primaryKey(),
    time_created: integer().notNull(),
  },
  (table) => [
    check(
      "assignment_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'asn_'
        AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*' AND ${table.time_created} >= 0`,
    ),
    index("assignment_creation_order_idx").on(table.time_created, table.id),
  ],
)

export const AssignmentDispositionTable = sqliteTable(
  "assignment_disposition",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    disposition: text().$type<"candidate_v1" | "semantic_terminal_v1">().notNull(),
    command_fingerprint: text().notNull(),
    canonical_command: text({ mode: "json" }).$type<CanonicalChangeSet>().notNull(),
    semantic_address_fingerprint: text().notNull(),
    semantic_outcome: text().$type<"already_applied" | "semantic_conflict">(),
    existing_effect_id: text().$type<EffectID>().references((): AnySQLiteColumn => AssignmentEffectTable.id, {
      onDelete: "restrict",
    }),
    existing_no_change_receipt_id: text()
      .$type<ReceiptID>()
      .references((): AnySQLiteColumn => AssignmentNoChangeSealTable.receipt_id, { onDelete: "restrict" }),
    agent_action_fingerprint: text(),
    agent_action: text({ mode: "json" }).$type<AgentAction>(),
    materialized_candidate: text({ mode: "json" }).$type<Candidate>(),
    time_disposed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [LearningCommandInvocationTable.part_id] }).onDelete(
      "cascade",
    ),
    check(
      "assignment_disposition_fingerprints",
      sql`length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.semantic_address_fingerprint}) = 64
        AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND (${table.agent_action_fingerprint} IS NULL OR (length(${table.agent_action_fingerprint}) = 64
          AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
    check(
      "assignment_disposition_closed",
      sql`(${table.disposition} = 'candidate_v1' AND ${table.semantic_outcome} IS NULL
          AND ${table.existing_effect_id} IS NULL AND ${table.existing_no_change_receipt_id} IS NULL
          AND ${table.agent_action_fingerprint} IS NOT NULL
          AND json_valid(${table.agent_action}) AND json_valid(${table.materialized_candidate}))
        OR (${table.disposition} = 'semantic_terminal_v1'
          AND ${table.semantic_outcome} IN ('already_applied', 'semantic_conflict')
          AND ((${table.existing_effect_id} IS NOT NULL AND ${table.existing_no_change_receipt_id} IS NULL)
            OR (${table.existing_effect_id} IS NULL AND ${table.existing_no_change_receipt_id} IS NOT NULL))
          AND ${table.agent_action_fingerprint} IS NULL
          AND ${table.agent_action} IS NULL AND ${table.materialized_candidate} IS NULL)`,
    ),
    check(
      "assignment_disposition_shape",
      sql`json_valid(${table.canonical_command}) AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1
        AND ${table.time_disposed} >= 0`,
    ),
  ],
)

export const AssignmentCapabilityIssueTable = sqliteTable(
  "assignment_capability_issue",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    permission_request_id: text().$type<PermissionV1.ID>().notNull().unique(),
    agent_action_fingerprint: text().notNull(),
    policy_basis: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
    policy_fingerprint: text().notNull(),
    shown_scope: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
    shown_scope_fingerprint: text().notNull(),
    time_issued: integer().notNull(),
    issue_order: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [AssignmentDispositionTable.invocation_part_id] }).onDelete(
      "cascade",
    ),
    unique("assignment_capability_issue_exact").on(table.invocation_part_id, table.permission_request_id),
    check(
      "assignment_capability_issue_shape",
      sql`length(${table.agent_action_fingerprint}) = 64 AND length(${table.policy_fingerprint}) = 64
        AND length(${table.shown_scope_fingerprint}) = 64 AND json_valid(${table.policy_basis})
        AND json_valid(${table.shown_scope}) AND ${table.time_issued} >= 0 AND ${table.issue_order} >= 0`,
    ),
  ],
)

export const AssignmentCapabilitySettlementTable = sqliteTable(
  "assignment_capability_settlement",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    outcome: text().$type<CapabilityOutcome>().notNull(),
    permission_request_id: text().$type<PermissionV1.ID>(),
    agent_action_fingerprint: text().notNull(),
    basis: text({ mode: "json" }).$type<Record<string, unknown>>(),
    basis_fingerprint: text(),
    time_settled: integer().notNull(),
    settlement_order: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [AssignmentDispositionTable.invocation_part_id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invocation_part_id, table.permission_request_id],
      foreignColumns: [AssignmentCapabilityIssueTable.invocation_part_id, AssignmentCapabilityIssueTable.permission_request_id],
    }).onDelete("cascade"),
    check(
      "assignment_capability_settlement_shape",
      sql`length(${table.agent_action_fingerprint}) = 64
        AND (${table.basis_fingerprint} IS NULL OR length(${table.basis_fingerprint}) = 64)
        AND ${table.time_settled} >= 0 AND ${table.settlement_order} >= 0
        AND ((${table.outcome} = 'not_evaluated' AND ${table.permission_request_id} IS NULL AND ${table.basis} IS NULL)
          OR (${table.outcome} IN ('policy_allow', 'policy_deny') AND ${table.permission_request_id} IS NULL
            AND json_valid(${table.basis}))
          OR (${table.outcome} = 'prompted_abort' AND ${table.permission_request_id} IS NOT NULL
            AND ${table.basis} IS NULL)
          OR (${table.outcome} IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
            AND ${table.permission_request_id} IS NOT NULL AND json_valid(${table.basis})))`,
    ),
  ],
)

export const AssignmentEffectTable = sqliteTable(
  "assignment_effect",
  {
    id: text().$type<EffectID>().primaryKey(),
    commit_seal_id: text().$type<EffectID>().notNull().references((): AnySQLiteColumn => AssignmentCommitSealTable.effect_id, {
      onDelete: "restrict",
    }),
    cause_type: text()
      .$type<
        | "interpreted_learner_report"
        | "interpreted_learner_direction"
        | "interpreted_source_observation"
        | "interpreted_source_change"
        | "agent_correction"
      >()
      .notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    source_revision_id: text(),
    source_locator_digest: text(),
    model_operation_id: text().$type<MessageID>().notNull(),
    semantic_slot: text().notNull(),
    semantic_address_fingerprint: text().notNull().unique(),
    canonical_command: text({ mode: "json" }).$type<CanonicalChangeSet>().notNull(),
    command_fingerprint: text().notNull(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
    physical_receipt_id: text().$type<ReceiptID>().notNull().unique(),
    admission_projection: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
    results: text({ mode: "json" }).$type<readonly Record<string, unknown>[]>().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull().unique(),
    frontier_time: integer().notNull(),
    acknowledgement_title: text().notNull(),
    acknowledgement_body: text().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [LearningCommandInvocationTable.part_id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.physical_receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete(
      "restrict",
    ),
    uniqueIndex("assignment_effect_learner_address_unique")
      .on(table.occurrence_id, table.semantic_slot)
      .where(sql`${table.cause_type} IN ('interpreted_learner_report', 'interpreted_learner_direction')`),
    uniqueIndex("assignment_effect_source_address_unique")
      .on(table.source_revision_id, table.source_locator_digest, table.semantic_slot)
      .where(sql`${table.cause_type} IN ('interpreted_source_observation', 'interpreted_source_change')`),
    uniqueIndex("assignment_effect_correction_address_unique")
      .on(table.model_operation_id, table.semantic_slot)
      .where(sql`${table.cause_type} = 'agent_correction'`),
    check("assignment_effect_seal", sql`${table.commit_seal_id} = ${table.id}`),
    check(
      "assignment_effect_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'ase_'
        AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "assignment_effect_address",
      sql`length(${table.semantic_address_fingerprint}) = 64
        AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND ((${table.cause_type} IN ('interpreted_learner_report', 'interpreted_learner_direction')
              AND ${table.semantic_slot} = 'assignment_change_set' AND ${table.source_revision_id} IS NULL
              AND ${table.source_locator_digest} IS NULL)
          OR (${table.cause_type} IN ('interpreted_source_observation', 'interpreted_source_change')
              AND ${table.semantic_slot} = 'assignment_source_change_set' AND length(${table.source_revision_id}) > 0
              AND length(${table.source_locator_digest}) = 64)
          OR (${table.cause_type} = 'agent_correction'
              AND ${table.semantic_slot} = 'assignment_correction_change_set' AND ${table.source_revision_id} IS NULL
              AND ${table.source_locator_digest} IS NULL))`,
    ),
    check(
      "assignment_effect_shape",
      sql`json_valid(${table.canonical_command}) AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1
        AND json_valid(${table.admission_projection}) AND json_valid(${table.results})
        AND json_type(${table.results}) = 'array' AND json_array_length(${table.results}) BETWEEN 1 AND 16
        AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0
        AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}
        AND length(${table.acknowledgement_title}) > 0 AND length(${table.acknowledgement_body}) > 0`,
    ),
  ],
)

export const AssignmentNoChangeSealTable = sqliteTable(
  "assignment_no_change_seal",
  {
    semantic_address_fingerprint: text().primaryKey(),
    cause_type: text()
      .$type<
        | "interpreted_learner_report"
        | "interpreted_learner_direction"
        | "interpreted_source_observation"
        | "interpreted_source_change"
        | "agent_correction"
      >()
      .notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    source_revision_id: text(),
    source_locator_digest: text(),
    model_operation_id: text().$type<MessageID>().notNull(),
    semantic_slot: text().notNull(),
    command_fingerprint: text().notNull(),
    canonical_command: text({ mode: "json" }).$type<CanonicalChangeSet>().notNull(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
    invocation_status: text().$type<"no_change">().notNull(),
    receipt_id: text().$type<ReceiptID>().notNull().unique(),
    results: text({ mode: "json" })
      .$type<readonly Extract<IntentResultProjection, { outcome: "no_change" }>[]>()
      .notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.invocation_part_id, table.invocation_status],
      foreignColumns: [LearningCommandInvocationTable.part_id, LearningCommandInvocationTable.status],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete("restrict"),
    uniqueIndex("assignment_no_change_learner_address_unique")
      .on(table.occurrence_id, table.semantic_slot)
      .where(sql`${table.cause_type} IN ('interpreted_learner_report', 'interpreted_learner_direction')`),
    uniqueIndex("assignment_no_change_source_address_unique")
      .on(table.source_revision_id, table.source_locator_digest, table.semantic_slot)
      .where(sql`${table.cause_type} IN ('interpreted_source_observation', 'interpreted_source_change')`),
    uniqueIndex("assignment_no_change_correction_address_unique")
      .on(table.model_operation_id, table.semantic_slot)
      .where(sql`${table.cause_type} = 'agent_correction'`),
    check(
      "assignment_no_change_address",
      sql`length(${table.semantic_address_fingerprint}) = 64
        AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND ((${table.cause_type} IN ('interpreted_learner_report', 'interpreted_learner_direction')
              AND ${table.semantic_slot} = 'assignment_change_set' AND ${table.source_revision_id} IS NULL
              AND ${table.source_locator_digest} IS NULL)
          OR (${table.cause_type} IN ('interpreted_source_observation', 'interpreted_source_change')
              AND ${table.semantic_slot} = 'assignment_source_change_set' AND length(${table.source_revision_id}) > 0
              AND length(${table.source_locator_digest}) = 64)
          OR (${table.cause_type} = 'agent_correction'
              AND ${table.semantic_slot} = 'assignment_correction_change_set' AND ${table.source_revision_id} IS NULL
              AND ${table.source_locator_digest} IS NULL))`,
    ),
    check(
      "assignment_no_change_shape",
      sql`${table.invocation_status} = 'no_change'
        AND json_valid(${table.canonical_command})
        AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1
        AND json_valid(${table.results}) AND json_type(${table.results}) = 'array'
        AND json_array_length(${table.results}) BETWEEN 1 AND 16
        AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0`,
    ),
  ],
)

export const AssignmentRevisionTable = sqliteTable(
  "assignment_revision",
  {
    id: text().$type<RevisionID>().primaryKey(),
    assignment_id: text().$type<AssignmentID>().notNull(),
    version: integer().notNull(),
    predecessor_revision_id: text().$type<RevisionID>(),
    effect_id: text().$type<EffectID>().notNull(),
    operation_ordinal: integer().notNull(),
    operation: text().notNull(),
    snapshot: text({ mode: "json" }).$type<SemanticSnapshot>().notNull(),
    obligation_summary: text().notNull(),
    learning_context: text().notNull(),
    scope_type: text().$type<"learner_home" | "courses">().notNull(),
    scope_count: integer().notNull(),
    due_basis: text({ mode: "json" }).notNull(),
    expiry_boundary: text({ mode: "json" }),
    disposition: text().$type<Disposition>().notNull(),
    creation_source_basis: text({ mode: "json" }).$type<EffectiveSourceBasis>().notNull(),
    effective_source_basis: text({ mode: "json" }).$type<EffectiveSourceBasis>().notNull(),
    source_admission_basis: text({ mode: "json" }).$type<SourceAdmissionBasis>().notNull(),
    mutation_authorship_basis: text({ mode: "json" }).$type<MutationAuthorshipBasis>().notNull(),
    source_basis_relation: text().$type<SourceBasisRelation>().notNull(),
    effective_source_type: text().$type<"learner_occurrence" | "artifact_revision" | "representation_revision">().notNull(),
    effective_occurrence_id: text().$type<OccurrenceID>(),
    effective_artifact_revision_id: text(),
    effective_representation_revision_id: text(),
    supersession_target_assignment_id: text().$type<AssignmentID>(),
    supersession_target_revision_id: text().$type<RevisionID>(),
    supersession_target_version: integer(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.assignment_id], foreignColumns: [AssignmentTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.predecessor_revision_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.effect_id], foreignColumns: [AssignmentEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.effective_occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.effective_artifact_revision_id], foreignColumns: [ArtifactRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.effective_representation_revision_id],
      foreignColumns: [RepresentationRevisionTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.supersession_target_assignment_id, table.supersession_target_revision_id, table.supersession_target_version],
      foreignColumns: [table.assignment_id, table.id, table.version],
    }).onDelete("restrict"),
    unique("assignment_revision_identity_version_unique").on(table.assignment_id, table.id, table.version),
    unique("assignment_revision_version_unique").on(table.assignment_id, table.version),
    unique("assignment_revision_predecessor_unique").on(table.predecessor_revision_id),
    unique("assignment_revision_effect_ordinal_unique").on(table.effect_id, table.operation_ordinal),
    index("assignment_revision_history_idx").on(table.assignment_id, table.version, table.id),
    index("assignment_revision_head_idx").on(table.assignment_id, table.version, table.id),
    check(
      "assignment_revision_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'asr_'
        AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'
        AND ((${table.version} = 1 AND ${table.predecessor_revision_id} IS NULL)
          OR (${table.version} > 1 AND ${table.predecessor_revision_id} IS NOT NULL))`,
    ),
    check(
      "assignment_revision_snapshot",
      sql`json_valid(${table.snapshot}) AND json_valid(${table.due_basis})
        AND (${table.expiry_boundary} IS NULL OR json_valid(${table.expiry_boundary}))
        AND length(CAST(${table.obligation_summary} AS BLOB)) BETWEEN 1 AND 640
        AND length(CAST(${table.learning_context} AS BLOB)) BETWEEN 1 AND 384
        AND ${table.scope_type} IN ('learner_home', 'courses')
        AND ((${table.scope_type} = 'learner_home' AND ${table.scope_count} = 0)
          OR (${table.scope_type} = 'courses' AND ${table.scope_count} BETWEEN 1 AND 8))`,
    ),
    check(
      "assignment_revision_vocabulary",
      sql`${table.operation} IN ('create', 'revise', 'correct', 'complete', 'cancel', 'dismiss', 'reopen', 'replace')
        AND ${table.disposition} IN ('open', 'completed', 'cancelled', 'dismissed', 'superseded')
        AND ${table.source_basis_relation} IN ('carried', 'corrected_with_new_exact_source')
        AND json_valid(${table.creation_source_basis}) AND json_valid(${table.effective_source_basis})
        AND json_valid(${table.source_admission_basis}) AND json_valid(${table.mutation_authorship_basis})`,
    ),
    check(
      "assignment_revision_source_arm",
      sql`(${table.effective_source_type} = 'learner_occurrence' AND ${table.effective_occurrence_id} IS NOT NULL
          AND ${table.effective_artifact_revision_id} IS NULL AND ${table.effective_representation_revision_id} IS NULL)
        OR (${table.effective_source_type} = 'artifact_revision' AND ${table.effective_occurrence_id} IS NULL
          AND ${table.effective_artifact_revision_id} IS NOT NULL AND ${table.effective_representation_revision_id} IS NULL)
        OR (${table.effective_source_type} = 'representation_revision' AND ${table.effective_occurrence_id} IS NULL
          AND ${table.effective_artifact_revision_id} IS NULL AND ${table.effective_representation_revision_id} IS NOT NULL)`,
    ),
    check(
      "assignment_revision_relation",
      sql`(${table.disposition} = 'superseded' AND ${table.supersession_target_assignment_id} IS NOT NULL
          AND ${table.supersession_target_revision_id} IS NOT NULL AND ${table.supersession_target_version} >= 1
          AND ${table.supersession_target_assignment_id} <> ${table.assignment_id})
        OR (${table.disposition} <> 'superseded' AND ${table.supersession_target_assignment_id} IS NULL
          AND ${table.supersession_target_revision_id} IS NULL AND ${table.supersession_target_version} IS NULL)`,
    ),
    check(
      "assignment_revision_time",
      sql`${table.operation_ordinal} BETWEEN 0 AND 31 AND ${table.time_committed} >= 0
        AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1`,
    ),
  ],
)

export const AssignmentRevisionScopeTable = sqliteTable(
  "assignment_revision_scope",
  {
    revision_id: text().$type<RevisionID>().notNull(),
    ordinal: integer().notNull(),
    course_id: text().$type<Course.CourseID>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.ordinal] }),
    foreignKey({ columns: [table.revision_id], foreignColumns: [AssignmentRevisionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    unique("assignment_revision_scope_course_unique").on(table.revision_id, table.course_id),
    check("assignment_revision_scope_ordinal", sql`${table.ordinal} BETWEEN 0 AND 7`),
    index("assignment_revision_scope_course_idx").on(table.course_id, table.revision_id),
  ],
)

export const AssignmentCommitSealTable = sqliteTable(
  "assignment_commit_seal",
  {
    effect_id: text().$type<EffectID>().primaryKey(),
    receipt_id: text().$type<ReceiptID>().notNull().unique(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
  },
  (table) => [
    foreignKey({ columns: [table.effect_id], foreignColumns: [AssignmentEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [LearningCommandInvocationTable.part_id] }).onDelete(
      "restrict",
    ),
  ],
)
