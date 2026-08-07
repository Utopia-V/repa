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
import { CourseViewRevisionItemTable } from "../course/sql"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { ReceiptID } from "../learning-command/physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import type { PermissionV1 } from "../v1/permission"
import type { MessageID, PartID } from "../v1/session"
import type {
  AgentAction,
  Candidate,
  CanonicalChangeSet,
  ChangeSetID,
  ClaimGroupID,
  ClaimMember,
  CompleteServiceSource,
  ConcernID,
  ConcernPayload,
  Disposition,
  FinalizationMemberResult,
  FinalizationReceiptID,
  CompletionFacts,
  MutationRelation,
  ServiceReceiptID,
  TransitionID,
  TransitionKind,
} from "./schema"

export const FutureAttentionDispositionTable = sqliteTable(
  "future_attention_disposition",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    disposition: text().$type<"candidate_v1" | "semantic_terminal_v1">().notNull(),
    command_fingerprint: text().notNull(),
    canonical_command: text({ mode: "json" }).$type<CanonicalChangeSet>().notNull(),
    semantic_address_fingerprint: text().notNull(),
    semantic_outcome: text().$type<"already_applied" | "semantic_conflict">(),
    existing_change_set_id: text().$type<ChangeSetID>(),
    agent_action_fingerprint: text(),
    agent_action: text({ mode: "json" }).$type<AgentAction>(),
    materialized_candidate: text({ mode: "json" }).$type<Candidate>(),
    time_disposed: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [LearningCommandInvocationTable.part_id] }).onDelete(
      "cascade",
    ),
    foreignKey({
      columns: [table.existing_change_set_id],
      foreignColumns: [FutureAttentionChangeSetTable.id],
    }).onDelete("restrict"),
    check(
      "future_attention_disposition_fingerprints",
      sql`length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.semantic_address_fingerprint}) = 64 AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND (${table.agent_action_fingerprint} IS NULL OR (length(${table.agent_action_fingerprint}) = 64
          AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
    check(
      "future_attention_disposition_closed",
      sql`(${table.disposition} = 'candidate_v1' AND ${table.semantic_outcome} IS NULL
          AND ${table.existing_change_set_id} IS NULL AND ${table.agent_action_fingerprint} IS NOT NULL
          AND json_valid(${table.agent_action}) AND json_valid(${table.materialized_candidate}))
        OR (${table.disposition} = 'semantic_terminal_v1'
          AND ${table.semantic_outcome} IN ('already_applied', 'semantic_conflict')
          AND ${table.existing_change_set_id} IS NOT NULL AND ${table.agent_action_fingerprint} IS NULL
          AND ${table.agent_action} IS NULL AND ${table.materialized_candidate} IS NULL)`,
    ),
    check(
      "future_attention_disposition_shape",
      sql`json_valid(${table.canonical_command}) AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1
        AND ${table.time_disposed} >= 0`,
    ),
  ],
)

export const FutureAttentionCapabilityIssueTable = sqliteTable(
  "future_attention_capability_issue",
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
      foreignColumns: [FutureAttentionDispositionTable.invocation_part_id],
    }).onDelete("cascade"),
    unique("future_attention_capability_issue_exact").on(table.invocation_part_id, table.permission_request_id),
    check(
      "future_attention_capability_issue_shape",
      sql`length(${table.agent_action_fingerprint}) = 64 AND length(${table.policy_fingerprint}) = 64
        AND length(${table.shown_scope_fingerprint}) = 64 AND json_valid(${table.policy_basis})
        AND json_valid(${table.shown_scope}) AND ${table.time_issued} >= 0 AND ${table.issue_order} >= 0`,
    ),
  ],
)

export const FutureAttentionCapabilitySettlementTable = sqliteTable(
  "future_attention_capability_settlement",
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
      foreignColumns: [FutureAttentionDispositionTable.invocation_part_id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invocation_part_id, table.permission_request_id],
      foreignColumns: [
        FutureAttentionCapabilityIssueTable.invocation_part_id,
        FutureAttentionCapabilityIssueTable.permission_request_id,
      ],
    }).onDelete("cascade"),
    check(
      "future_attention_capability_settlement_shape",
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

export const FutureAttentionChangeSetTable = sqliteTable(
  "future_attention_change_set",
  {
    id: text().$type<ChangeSetID>().primaryKey(),
    occurrence_id: text().$type<OccurrenceID>().notNull().unique(),
    slot: text().$type<"future_attention_change_set">().notNull(),
    canonical_command: text({ mode: "json" }).$type<CanonicalChangeSet>().notNull(),
    command_fingerprint: text().notNull(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
    physical_receipt_id: text().$type<ReceiptID>().notNull().unique(),
    admission_projection: text({ mode: "json" }).$type<unknown>().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [LearningCommandInvocationTable.part_id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.physical_receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete(
      "restrict",
    ),
    check(
      "future_attention_change_set_shape",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'fae_'
        AND ${table.slot} = 'future_attention_change_set' AND json_valid(${table.canonical_command})
        AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1
        AND length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND json_valid(${table.admission_projection}) AND ${table.time_committed} >= 0
        AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1`,
    ),
  ],
)

export const FutureAttentionConcernTable = sqliteTable(
  "future_attention_concern",
  {
    id: text().$type<ConcernID>().primaryKey(),
    predecessor_concern_id: text().$type<ConcernID>().unique(),
    create_change_set_id: text().$type<ChangeSetID>().notNull(),
    purpose: text().notNull(),
    source_relation: text().$type<"interpreted_learner_request" | "tutor_initiated">().notNull(),
    source: text({ mode: "json" }).$type<ConcernPayload["source"]>().notNull(),
    course_id: text().notNull(),
    view_id: text().notNull(),
    course_revision_id: text().notNull(),
    course_item_id: text().notNull(),
    selection: text({ mode: "json" }).$type<ConcernPayload["target"]["selection"]>().notNull(),
    membership_receipt: text({ mode: "json" }).$type<ConcernPayload["target"]["receipt"]>().notNull(),
    not_before_instant: integer().notNull(),
    temporal_source_expression: text().notNull(),
    effective_utc_offset_minutes: integer().notNull(),
    resolved_zone: text({ mode: "json" }).$type<ConcernPayload["notBefore"]["resolvedZone"]>().notNull(),
    service_timing: text().$type<ConcernPayload["serviceTiming"]>().notNull(),
    interaction_order: text().$type<ConcernPayload["interactionOrder"]>(),
    semantic_value: text({ mode: "json" }).$type<unknown>().notNull(),
    semantic_bytes: integer().notNull(),
    current_transition_id: text().$type<TransitionID>().notNull(),
    current_version: integer().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.predecessor_concern_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.create_change_set_id], foreignColumns: [FutureAttentionChangeSetTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.course_id, table.view_id, table.course_revision_id, table.course_item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    unique("future_attention_concern_current_transition_unique").on(table.current_transition_id),
    check(
      "future_attention_concern_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'fac_'
        AND (${table.predecessor_concern_id} IS NULL OR ${table.predecessor_concern_id} <> ${table.id})
        AND length(CAST(${table.purpose} AS BLOB)) BETWEEN 1 AND 768
        AND ${table.source_relation} IN ('interpreted_learner_request', 'tutor_initiated')
        AND json_valid(${table.source}) AND json_extract(${table.source}, '$.type') = ${table.source_relation}
        AND json_valid(${table.selection}) AND json_valid(${table.membership_receipt})
        AND ${table.not_before_instant} >= 0 AND length(CAST(${table.temporal_source_expression} AS BLOB)) BETWEEN 1 AND 256
        AND ${table.effective_utc_offset_minutes} BETWEEN -840 AND 840 AND json_valid(${table.resolved_zone})
        AND json_extract(${table.resolved_zone}, '$.type') IN ('iana', 'fixed_offset')
        AND ${table.service_timing} IN ('after_creation', 'at_or_after_not_before')
        AND (${table.interaction_order} IS NULL OR ${table.interaction_order} = 'learner_response_before_tutor_disclosure')
        AND json_valid(${table.semantic_value}) AND ${table.semantic_bytes} = length(CAST(${table.semantic_value} AS BLOB))
        AND ${table.semantic_bytes} BETWEEN 1 AND 2048 AND ${table.current_version} >= 0 AND ${table.time_created} >= 0`,
    ),
    index("future_attention_concern_target_idx").on(
      table.course_id,
      table.view_id,
      table.course_revision_id,
      table.course_item_id,
      table.time_created,
      table.id,
    ),
    index("future_attention_concern_activation_idx").on(table.not_before_instant, table.time_created, table.id),
  ],
)

export const FutureAttentionTransitionTable = sqliteTable(
  "future_attention_transition",
  {
    id: text().$type<TransitionID>().primaryKey(),
    concern_id: text().$type<ConcernID>().notNull(),
    version: integer().notNull(),
    predecessor_transition_id: text().$type<TransitionID>().unique(),
    kind: text().$type<TransitionKind>().notNull(),
    disposition: text().$type<Disposition>().notNull(),
    mutation: text({ mode: "json" }).$type<MutationRelation>(),
    rationale: text(),
    service_receipt_id: text().$type<ServiceReceiptID>(),
    change_set_id: text().$type<ChangeSetID>().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.concern_id], foreignColumns: [FutureAttentionConcernTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.predecessor_transition_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.change_set_id], foreignColumns: [FutureAttentionChangeSetTable.id] }).onDelete("restrict"),
    unique("future_attention_transition_concern_version_unique").on(table.concern_id, table.version),
    check(
      "future_attention_transition_shape",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'fat_' AND ${table.version} >= 0
        AND ${table.kind} IN ('created', 'superseded', 'served', 'dismissed', 'reopened', 'served_by_correction', 'dismissed_by_correction')
        AND ${table.disposition} IN ('open', 'served', 'dismissed', 'superseded')
        AND (${table.mutation} IS NULL OR json_valid(${table.mutation}))
        AND (${table.rationale} IS NULL OR length(CAST(${table.rationale} AS BLOB)) BETWEEN 1 AND 1024)
        AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1`,
    ),
    index("future_attention_transition_history_idx").on(table.concern_id, table.version, table.id),
  ],
)

export const FutureAttentionServiceReceiptTable = sqliteTable(
  "future_attention_service_receipt",
  {
    id: text().$type<ServiceReceiptID>().primaryKey(),
    transition_id: text().$type<TransitionID>().notNull().unique(),
    source: text({ mode: "json" }).$type<CompleteServiceSource>().notNull(),
    rationale: text().notNull(),
    learner_response_witness: text({ mode: "json" }).$type<ClaimMember["learnerResponseWitness"]>(),
    carried_from_service_receipt_id: text().$type<ServiceReceiptID>(),
    claim_group_id: text().$type<ClaimGroupID>(),
    time_recorded: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.transition_id], foreignColumns: [FutureAttentionTransitionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.carried_from_service_receipt_id],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    check(
      "future_attention_service_receipt_shape",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'fas_' AND json_valid(${table.source})
        AND length(CAST(${table.rationale} AS BLOB)) BETWEEN 1 AND 1024
        AND (${table.learner_response_witness} IS NULL OR json_valid(${table.learner_response_witness}))
        AND ${table.time_recorded} >= 0`,
    ),
  ],
)

export const FutureAttentionClaimGroupTable = sqliteTable(
  "future_attention_claim_group",
  {
    id: text().$type<ClaimGroupID>().primaryKey(),
    change_set_id: text().$type<ChangeSetID>().notNull().unique(),
    physical_receipt_id: text().$type<ReceiptID>().notNull(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
    session_id: text().notNull(),
    turn_id: text().notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    model_operation_id: text().$type<MessageID>().notNull(),
    time_admitted: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.change_set_id], foreignColumns: [FutureAttentionChangeSetTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.physical_receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.invocation_part_id], foreignColumns: [LearningCommandInvocationTable.part_id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    check(
      "future_attention_claim_group_shape",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'fag_'
        AND length(${table.session_id}) > 0 AND length(${table.turn_id}) > 0
        AND length(${table.assistant_message_id}) > 0 AND ${table.model_operation_id} = ${table.assistant_message_id}
        AND ${table.time_admitted} >= 0`,
    ),
    index("future_attention_claim_group_pending_idx").on(table.time_admitted, table.id),
  ],
)

export const FutureAttentionClaimMemberTable = sqliteTable(
  "future_attention_claim_member",
  {
    group_id: text().$type<ClaimGroupID>().notNull(),
    ordinal: integer().notNull(),
    concern_id: text().$type<ConcernID>().notNull(),
    expected_version: integer().notNull(),
    expected_transition_id: text().$type<TransitionID>().notNull(),
    rationale: text().notNull(),
    learner_response_witness: text({ mode: "json" }).$type<ClaimMember["learnerResponseWitness"]>(),
  },
  (table) => [
    primaryKey({ columns: [table.group_id, table.ordinal] }),
    unique("future_attention_claim_member_concern_unique").on(table.group_id, table.concern_id),
    foreignKey({ columns: [table.group_id], foreignColumns: [FutureAttentionClaimGroupTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.concern_id], foreignColumns: [FutureAttentionConcernTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.expected_transition_id],
      foreignColumns: [FutureAttentionTransitionTable.id],
    }).onDelete("restrict"),
    check(
      "future_attention_claim_member_shape",
      sql`${table.ordinal} >= 0 AND ${table.expected_version} >= 0
        AND length(CAST(${table.rationale} AS BLOB)) BETWEEN 1 AND 1024
        AND (${table.learner_response_witness} IS NULL OR json_valid(${table.learner_response_witness}))`,
    ),
  ],
)

export const FutureAttentionClaimFinalizationTable = sqliteTable(
  "future_attention_claim_finalization",
  {
    id: text().$type<FinalizationReceiptID>().primaryKey(),
    group_id: text().$type<ClaimGroupID>().notNull().unique(),
    outcome: text().$type<"served" | "not_served">().notNull(),
    completion: text({ mode: "json" }).$type<CompletionFacts>().notNull(),
    member_results: text({ mode: "json" }).$type<readonly FinalizationMemberResult[]>().notNull(),
    time_finalized: integer().notNull(),
    finalization_order: integer().notNull(),
    frontier_sequence: integer(),
  },
  (table) => [
    foreignKey({ columns: [table.group_id], foreignColumns: [FutureAttentionClaimGroupTable.id] }).onDelete("restrict"),
    check(
      "future_attention_claim_finalization_shape",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'far_'
        AND ${table.outcome} IN ('served', 'not_served') AND json_valid(${table.completion})
        AND json_valid(${table.member_results}) AND json_type(${table.member_results}) = 'array'
        AND ${table.time_finalized} >= 0 AND ${table.finalization_order} >= 0
        AND (${table.outcome} = 'served' AND ${table.frontier_sequence} IS NOT NULL AND ${table.frontier_sequence} >= 1
          OR ${table.outcome} = 'not_served' AND ${table.frontier_sequence} IS NULL)`,
    ),
  ],
)
