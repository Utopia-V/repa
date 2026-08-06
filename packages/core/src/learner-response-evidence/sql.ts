import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import { CourseViewRevisionItemTable } from "../course/sql"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { ReceiptID } from "../learning-command/physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import { MaterialCourseAlignmentTable, MaterialSelectorTable } from "../material-map/sql"
import type { PermissionV1 } from "../v1/permission"
import type { PartID } from "../v1/session"
import type {
  AgentAction,
  Basis,
  Candidate,
  CanonicalCommand,
  Disposition,
  Exposure,
  MaterializedCandidate,
  Operation,
  RecordID,
  Relation,
  RevisionID,
} from "./schema"

export const LearnerResponseEvidenceDispositionTable = sqliteTable(
  "learner_response_evidence_disposition",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    disposition: text().$type<"candidate_v1" | "semantic_terminal_v1">().notNull(),
    command_fingerprint: text().notNull(),
    canonical_command: text({ mode: "json" }).$type<CanonicalCommand>().notNull(),
    semantic_address_fingerprint: text().notNull(),
    semantic_outcome: text().$type<"already_applied" | "semantic_conflict">(),
    existing_record_id: text()
      .$type<RecordID>()
      .references((): AnySQLiteColumn => LearnerResponseEvidenceRecordTable.id, { onDelete: "restrict" }),
    existing_revision_id: text()
      .$type<RevisionID>()
      .references((): AnySQLiteColumn => LearnerResponseEvidenceRevisionTable.id, { onDelete: "restrict" }),
    existing_assessment_fingerprint: text(),
    agent_action_fingerprint: text(),
    agent_action: text({ mode: "json" }).$type<AgentAction>(),
    materialized_candidate: text({ mode: "json" }).$type<MaterializedCandidate>(),
    time_disposed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [LearningCommandInvocationTable.part_id] }).onDelete(
      "cascade",
    ),
    check(
      "learner_response_evidence_disposition_fingerprints",
      sql`length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.semantic_address_fingerprint}) = 64 AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND (${table.existing_assessment_fingerprint} IS NULL OR (length(${table.existing_assessment_fingerprint}) = 64 AND ${table.existing_assessment_fingerprint} NOT GLOB '*[^0-9a-f]*'))
        AND (${table.agent_action_fingerprint} IS NULL OR (length(${table.agent_action_fingerprint}) = 64 AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
    check(
      "learner_response_evidence_disposition_closed",
      sql`(${table.disposition} = 'candidate_v1'
          AND ${table.semantic_outcome} IS NULL AND ${table.existing_record_id} IS NULL
          AND ${table.existing_revision_id} IS NULL AND ${table.existing_assessment_fingerprint} IS NULL
          AND ${table.agent_action_fingerprint} IS NOT NULL
          AND json_valid(${table.agent_action}) AND json_valid(${table.materialized_candidate}))
        OR (${table.disposition} = 'semantic_terminal_v1'
          AND ${table.semantic_outcome} IN ('already_applied', 'semantic_conflict')
          AND ${table.existing_record_id} IS NOT NULL AND ${table.existing_revision_id} IS NOT NULL
          AND ${table.existing_assessment_fingerprint} IS NOT NULL
          AND ${table.agent_action_fingerprint} IS NULL AND ${table.agent_action} IS NULL
          AND ${table.materialized_candidate} IS NULL)`,
    ),
    check(
      "learner_response_evidence_disposition_shape",
      sql`json_valid(${table.canonical_command}) AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1
        AND ${table.time_disposed} >= 0`,
    ),
  ],
)

export const LearnerResponseEvidenceCapabilityIssueTable = sqliteTable(
  "learner_response_evidence_capability_issue",
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
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearnerResponseEvidenceDispositionTable.invocation_part_id],
    }).onDelete("cascade"),
    unique("learner_response_evidence_capability_issue_exact").on(
      table.invocation_part_id,
      table.permission_request_id,
    ),
    check(
      "learner_response_evidence_capability_issue_shape",
      sql`length(${table.agent_action_fingerprint}) = 64 AND length(${table.policy_fingerprint}) = 64
        AND length(${table.shown_scope_fingerprint}) = 64 AND json_valid(${table.policy_basis})
        AND json_valid(${table.shown_scope}) AND ${table.time_issued} >= 0 AND ${table.issue_order} >= 0`,
    ),
  ],
)

export const LearnerResponseEvidenceCapabilitySettlementTable = sqliteTable(
  "learner_response_evidence_capability_settlement",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    outcome: text()
      .$type<
        | "not_evaluated"
        | "policy_allow"
        | "policy_deny"
        | "prompted_allow"
        | "prompted_deny"
        | "prompted_correct"
        | "prompted_cancel"
        | "prompted_abort"
      >()
      .notNull(),
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
      foreignColumns: [LearnerResponseEvidenceDispositionTable.invocation_part_id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invocation_part_id, table.permission_request_id],
      foreignColumns: [
        LearnerResponseEvidenceCapabilityIssueTable.invocation_part_id,
        LearnerResponseEvidenceCapabilityIssueTable.permission_request_id,
      ],
    }).onDelete("cascade"),
    check(
      "learner_response_evidence_capability_settlement_shape",
      sql`length(${table.agent_action_fingerprint}) = 64
        AND (${table.basis_fingerprint} IS NULL OR length(${table.basis_fingerprint}) = 64)
        AND ${table.time_settled} >= 0 AND ${table.settlement_order} >= 0
        AND ((${table.outcome} = 'not_evaluated' AND ${table.permission_request_id} IS NULL AND ${table.basis} IS NULL)
          OR (${table.outcome} IN ('policy_allow', 'policy_deny') AND ${table.permission_request_id} IS NULL AND json_valid(${table.basis}))
          OR (${table.outcome} = 'prompted_abort' AND ${table.permission_request_id} IS NOT NULL AND ${table.basis} IS NULL)
          OR (${table.outcome} IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
            AND ${table.permission_request_id} IS NOT NULL AND json_valid(${table.basis})))`,
    ),
  ],
)

export const LearnerResponseEvidenceRecordTable = sqliteTable(
  "learner_response_evidence_record",
  {
    id: text().$type<RecordID>().primaryKey(),
    subject_occurrence_id: text().$type<OccurrenceID>().notNull(),
    subject_source_order: integer().notNull(),
    subject_session_id: text().notNull(),
    subject_message_id: text().notNull(),
    subject_turn_id: text().notNull(),
    subject_input_id: text().notNull(),
    subject_time_admitted: integer().notNull(),
    map_id: text().notNull(),
    selector_id: text().notNull(),
    course_id: text().notNull(),
    view_id: text().notNull(),
    course_revision_id: text().notNull(),
    course_item_id: text().notNull(),
    admission_alignment_id: text().notNull(),
    alignment_disposition_version: integer().notNull(),
    map_disposition_version: integer().notNull(),
    course_version: integer().notNull(),
    view_version: integer().notNull(),
    course_revision_version: integer().notNull(),
    condition_session_id: text().notNull(),
    condition_turn_id: text().notNull(),
    condition_assistant_message_id: text().notNull(),
    condition_time_settled: integer().notNull(),
    current_revision_id: text()
      .$type<RevisionID>()
      .notNull()
      .references((): AnySQLiteColumn => LearnerResponseEvidenceRevisionTable.id, { onDelete: "restrict" }),
    current_version: integer().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.subject_occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.map_id, table.selector_id],
      foreignColumns: [MaterialSelectorTable.map_id, MaterialSelectorTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.view_id, table.course_revision_id, table.course_item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.admission_alignment_id], foreignColumns: [MaterialCourseAlignmentTable.id] }).onDelete(
      "restrict",
    ),
    unique("learner_response_evidence_semantic_address_unique").on(
      table.subject_occurrence_id,
      table.map_id,
      table.selector_id,
      table.course_id,
      table.view_id,
      table.course_revision_id,
      table.course_item_id,
    ),
    unique("learner_response_evidence_current_revision_unique").on(table.current_revision_id),
    check(
      "learner_response_evidence_record_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'lre_' AND ${table.subject_source_order} > 0
        AND ${table.subject_time_admitted} >= 0 AND ${table.alignment_disposition_version} >= 0
        AND ${table.map_disposition_version} >= 0 AND ${table.course_version} >= 0
        AND ${table.view_version} >= 0 AND ${table.course_revision_version} >= 0
        AND ${table.condition_time_settled} >= 0 AND ${table.condition_time_settled} <= ${table.subject_time_admitted}
        AND ${table.condition_turn_id} <> ${table.subject_turn_id}
        AND ${table.current_version} >= 0 AND ${table.time_created} >= ${table.subject_time_admitted}`,
    ),
    check(
      "learner_response_evidence_record_locators",
      sql`length(${table.subject_session_id}) > 0 AND length(${table.subject_message_id}) > 0
        AND length(${table.subject_turn_id}) > 0 AND length(${table.subject_input_id}) > 0
        AND length(${table.condition_session_id}) > 0 AND length(${table.condition_turn_id}) > 0
        AND length(${table.condition_assistant_message_id}) > 0`,
    ),
    index("learner_response_evidence_course_idx").on(
      table.course_id,
      table.view_id,
      table.course_revision_id,
      table.course_item_id,
      table.subject_source_order,
      table.id,
    ),
    index("learner_response_evidence_selector_idx").on(
      table.map_id,
      table.selector_id,
      table.subject_source_order,
      table.id,
    ),
  ],
)

export const LearnerResponseEvidenceRevisionTable = sqliteTable(
  "learner_response_evidence_revision",
  {
    id: text().$type<RevisionID>().primaryKey(),
    commit_seal_id: text()
      .$type<RevisionID>()
      .notNull()
      .references((): AnySQLiteColumn => LearnerResponseEvidenceCommitSealTable.revision_id, { onDelete: "restrict" }),
    record_id: text().$type<RecordID>().notNull(),
    version: integer().notNull(),
    predecessor_revision_id: text().$type<RevisionID>(),
    operation: text().$type<Operation>().notNull(),
    relation: text().$type<Relation>().notNull(),
    exposure: text().$type<Exposure>().notNull(),
    basis: text().$type<Basis>().notNull(),
    disposition: text().$type<Disposition>().notNull(),
    basis_occurrence_id: text().$type<OccurrenceID>().notNull(),
    basis_source_order: integer().notNull(),
    basis_session_id: text().notNull(),
    basis_message_id: text().notNull(),
    basis_turn_id: text().notNull(),
    basis_input_id: text().notNull(),
    basis_time_admitted: integer().notNull(),
    command_cause_occurrence_id: text().$type<OccurrenceID>().notNull(),
    command_cause_source_order: integer().notNull(),
    command_cause_session_id: text().notNull(),
    command_cause_message_id: text().notNull(),
    command_cause_turn_id: text().notNull(),
    command_cause_input_id: text().notNull(),
    command_cause_time_admitted: integer().notNull(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull().unique(),
    frontier_time: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.record_id], foreignColumns: [LearnerResponseEvidenceRecordTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.predecessor_revision_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.basis_occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.command_cause_occurrence_id],
      foreignColumns: [AdmittedLearnerOccurrenceTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [LearningCommandInvocationTable.part_id] }).onDelete(
      "restrict",
    ),
    unique("learner_response_evidence_revision_version_unique").on(table.record_id, table.version),
    unique("learner_response_evidence_revision_predecessor_unique").on(table.predecessor_revision_id),
    check("learner_response_evidence_revision_seal", sql`${table.commit_seal_id} = ${table.id}`),
    check(
      "learner_response_evidence_revision_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'lrr_' AND ${table.version} >= 0
        AND ${table.basis_source_order} > 0 AND ${table.command_cause_source_order} > 0
        AND ${table.basis_time_admitted} >= 0 AND ${table.command_cause_time_admitted} >= 0
        AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0
        AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    check(
      "learner_response_evidence_revision_vocabulary",
      sql`${table.relation} IN ('supports', 'does_not_support')
        AND ${table.exposure} IN ('learner_response_before_tutor_disclosure', 'tutor_disclosure_before_learner_response')
        AND ${table.basis} IN ('tutor_interpretation', 'learner_report')
        AND ${table.disposition} IN ('active', 'retracted')
        AND ${table.operation} IN ('create', 'revise_from_tutor_interpretation', 'revise_from_learner_report', 'retract')`,
    ),
    check(
      "learner_response_evidence_revision_operation_matrix",
      sql`(${table.operation} = 'create' AND ${table.version} = 0 AND ${table.predecessor_revision_id} IS NULL
          AND ${table.basis} = 'tutor_interpretation' AND ${table.disposition} = 'active')
        OR (${table.operation} = 'revise_from_tutor_interpretation' AND ${table.version} > 0
          AND ${table.predecessor_revision_id} IS NOT NULL AND ${table.basis} = 'tutor_interpretation'
          AND ${table.disposition} = 'active')
        OR (${table.operation} = 'revise_from_learner_report' AND ${table.version} > 0
          AND ${table.predecessor_revision_id} IS NOT NULL AND ${table.basis} = 'learner_report'
          AND ${table.disposition} = 'active')
        OR (${table.operation} = 'retract' AND ${table.version} > 0
          AND ${table.predecessor_revision_id} IS NOT NULL AND ${table.disposition} = 'retracted')`,
    ),
    check(
      "learner_response_evidence_revision_source_locators",
      sql`length(${table.basis_session_id}) > 0 AND length(${table.basis_message_id}) > 0
        AND length(${table.basis_turn_id}) > 0 AND length(${table.basis_input_id}) > 0
        AND length(${table.command_cause_session_id}) > 0 AND length(${table.command_cause_message_id}) > 0
        AND length(${table.command_cause_turn_id}) > 0 AND length(${table.command_cause_input_id}) > 0`,
    ),
    index("learner_response_evidence_revision_history_idx").on(table.record_id, table.version, table.id),
  ],
)

export const LearnerResponseEvidenceCommitSealTable = sqliteTable(
  "learner_response_evidence_commit_seal",
  {
    revision_id: text()
      .$type<RevisionID>()
      .primaryKey()
      .references((): AnySQLiteColumn => LearnerResponseEvidenceRevisionTable.id, { onDelete: "restrict" }),
    receipt_id: text().$type<ReceiptID>().notNull().unique(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
  },
  (table) => [
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [LearningCommandInvocationTable.part_id] }).onDelete(
      "restrict",
    ),
  ],
)

export type StoredCandidate = Candidate
