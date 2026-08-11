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
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import type { ReceiptID } from "../learning-command/physical-schema"
import type { PermissionV1 } from "../v1/permission"
import type { MessageID, PartID } from "../v1/session"
import type {
  AgentAction,
  AuthorAndCause,
  Candidate,
  CanonicalCommand,
  CapabilityOutcome,
  Disposition,
  EffectID,
  ExactBinding,
  IntentResult,
  RetrievalAnchor,
  SuggestionID,
  RevisionID,
  SemanticSnapshot,
} from "./schema"

export const AdvisoryPlanSuggestionTable = sqliteTable(
  "advisory_plan_suggestion",
  {
    id: text().$type<SuggestionID>().primaryKey(),
    time_created: integer().notNull(),
    alternative_target_suggestion_id: text().$type<SuggestionID>(),
    alternative_target_revision_id: text().$type<RevisionID>(),
    alternative_target_version: integer(),
  },
  (table) => [
    check(
      "advisory_plan_suggestion_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'aps_'
        AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*' AND ${table.time_created} >= 0
        AND ((${table.alternative_target_suggestion_id} IS NULL
            AND ${table.alternative_target_revision_id} IS NULL AND ${table.alternative_target_version} IS NULL)
          OR (${table.alternative_target_suggestion_id} IS NOT NULL
            AND ${table.alternative_target_revision_id} IS NOT NULL AND ${table.alternative_target_version} >= 1
            AND ${table.alternative_target_suggestion_id} <> ${table.id}
            AND length(${table.alternative_target_suggestion_id}) = 30
            AND substr(${table.alternative_target_suggestion_id}, 1, 4) = 'aps_'
            AND substr(${table.alternative_target_suggestion_id}, 5) NOT GLOB '*[^0-9A-Za-z]*'
            AND length(${table.alternative_target_revision_id}) = 30
            AND substr(${table.alternative_target_revision_id}, 1, 4) = 'apr_'
            AND substr(${table.alternative_target_revision_id}, 5) NOT GLOB '*[^0-9A-Za-z]*'))`,
    ),
    index("advisory_plan_suggestion_creation_order_idx").on(table.time_created, table.id),
  ],
)

export const AdvisoryPlanSuggestionDispositionTable = sqliteTable(
  "advisory_plan_suggestion_disposition",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    disposition: text().$type<"candidate_v1" | "semantic_terminal_v1">().notNull(),
    command_fingerprint: text().notNull(),
    canonical_command: text({ mode: "json" }).$type<CanonicalCommand>().notNull(),
    semantic_address_fingerprint: text().notNull(),
    semantic_outcome: text().$type<"same_effect" | "same_no_change" | "semantic_conflict">(),
    existing_effect_id: text()
      .$type<EffectID>()
      .references((): AnySQLiteColumn => AdvisoryPlanSuggestionEffectTable.id, {
        onDelete: "restrict",
      }),
    existing_no_change_part_id: text()
      .$type<PartID>()
      .references((): AnySQLiteColumn => AdvisoryPlanSuggestionNoChangeSealTable.invocation_part_id, {
        onDelete: "restrict",
      }),
    agent_action_fingerprint: text(),
    agent_action: text({ mode: "json" }).$type<AgentAction>(),
    materialized_candidate: text({ mode: "json" }).$type<Candidate>(),
    time_disposed: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("cascade"),
    check(
      "advisory_plan_suggestion_disposition_fingerprints",
      sql`length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.semantic_address_fingerprint}) = 64
        AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND (${table.agent_action_fingerprint} IS NULL OR (length(${table.agent_action_fingerprint}) = 64
          AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
    check(
      "advisory_plan_suggestion_disposition_closed",
      sql`(${table.disposition} = 'candidate_v1' AND ${table.semantic_outcome} IS NULL
          AND ${table.existing_effect_id} IS NULL AND ${table.existing_no_change_part_id} IS NULL
          AND ${table.agent_action_fingerprint} IS NOT NULL
          AND json_valid(${table.agent_action}) AND json_valid(${table.materialized_candidate}))
        OR (${table.disposition} = 'semantic_terminal_v1'
          AND ${table.semantic_outcome} IN ('same_effect', 'same_no_change', 'semantic_conflict')
          AND ((${table.semantic_outcome} = 'same_effect'
                AND ${table.existing_effect_id} IS NOT NULL AND ${table.existing_no_change_part_id} IS NULL)
            OR (${table.semantic_outcome} = 'same_no_change'
                AND ${table.existing_effect_id} IS NULL AND ${table.existing_no_change_part_id} IS NOT NULL)
            OR (${table.semantic_outcome} = 'semantic_conflict'
                AND ((${table.existing_effect_id} IS NOT NULL AND ${table.existing_no_change_part_id} IS NULL)
                  OR (${table.existing_effect_id} IS NULL AND ${table.existing_no_change_part_id} IS NOT NULL))))
          AND ${table.agent_action_fingerprint} IS NULL AND ${table.agent_action} IS NULL
          AND ${table.materialized_candidate} IS NULL)`,
    ),
    check(
      "advisory_plan_suggestion_disposition_shape",
      sql`json_valid(${table.canonical_command}) AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1
        AND ${table.time_disposed} >= 0`,
    ),
  ],
)

export const AdvisoryPlanSuggestionCapabilityIssueTable = sqliteTable(
  "advisory_plan_suggestion_capability_issue",
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
      foreignColumns: [AdvisoryPlanSuggestionDispositionTable.invocation_part_id],
    }).onDelete("cascade"),
    unique("advisory_plan_suggestion_capability_issue_exact").on(table.invocation_part_id, table.permission_request_id),
    check(
      "advisory_plan_suggestion_capability_issue_shape",
      sql`length(${table.agent_action_fingerprint}) = 64
        AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.policy_fingerprint}) = 64
        AND ${table.policy_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.shown_scope_fingerprint}) = 64
        AND ${table.shown_scope_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND json_valid(${table.policy_basis})
        AND json_valid(${table.shown_scope}) AND ${table.time_issued} >= 0 AND ${table.issue_order} >= 0`,
    ),
  ],
)

export const AdvisoryPlanSuggestionCapabilitySettlementTable = sqliteTable(
  "advisory_plan_suggestion_capability_settlement",
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
      foreignColumns: [AdvisoryPlanSuggestionDispositionTable.invocation_part_id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invocation_part_id, table.permission_request_id],
      foreignColumns: [
        AdvisoryPlanSuggestionCapabilityIssueTable.invocation_part_id,
        AdvisoryPlanSuggestionCapabilityIssueTable.permission_request_id,
      ],
    }).onDelete("cascade"),
    check(
      "advisory_plan_suggestion_capability_settlement_shape",
      sql`length(${table.agent_action_fingerprint}) = 64
        AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND (${table.basis_fingerprint} IS NULL OR (length(${table.basis_fingerprint}) = 64
          AND ${table.basis_fingerprint} NOT GLOB '*[^0-9a-f]*'))
        AND ${table.time_settled} >= 0 AND ${table.settlement_order} >= 0
        AND ((${table.outcome} = 'not_evaluated' AND ${table.permission_request_id} IS NULL
            AND ${table.basis} IS NULL AND ${table.basis_fingerprint} IS NULL)
          OR (${table.outcome} IN ('policy_allow', 'policy_deny') AND ${table.permission_request_id} IS NULL
            AND json_valid(${table.basis}) AND ${table.basis_fingerprint} IS NOT NULL)
          OR (${table.outcome} = 'prompted_abort' AND ${table.permission_request_id} IS NOT NULL
            AND ${table.basis} IS NULL AND ${table.basis_fingerprint} IS NULL)
          OR (${table.outcome} IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
            AND ${table.permission_request_id} IS NOT NULL AND json_valid(${table.basis})
            AND ${table.basis_fingerprint} IS NOT NULL))`,
    ),
  ],
)

export const AdvisoryPlanSuggestionEffectTable = sqliteTable(
  "advisory_plan_suggestion_effect",
  {
    id: text().$type<EffectID>().primaryKey(),
    cause_type: text().$type<CanonicalCommand["cause"]["type"]>().notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    model_operation_id: text().$type<MessageID>().notNull(),
    semantic_slot: text().notNull(),
    semantic_address_fingerprint: text().notNull().unique(),
    canonical_command: text({ mode: "json" }).$type<CanonicalCommand>().notNull(),
    command_fingerprint: text().notNull(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
    physical_receipt_id: text().$type<ReceiptID>().notNull().unique(),
    admission_projection: text({ mode: "json" }).$type<Candidate>().notNull(),
    result: text({ mode: "json" }).$type<Readonly<{ intentResults: readonly IntentResult[] }>>().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull().unique(),
    frontier_time: integer().notNull(),
    acknowledgement_title: text().notNull(),
    acknowledgement_body: text().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.physical_receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete(
      "restrict",
    ),
    uniqueIndex("advisory_plan_suggestion_effect_learner_slot")
      .on(table.occurrence_id, table.semantic_slot)
      .where(sql`${table.cause_type} = 'learner_revision'`),
    uniqueIndex("advisory_plan_suggestion_effect_model_slot")
      .on(table.model_operation_id, table.semantic_slot)
      .where(sql`${table.cause_type} IN ('responsive_tutor_proposal', 'proactive_tutor_proposal', 'tutor_revision')`),
    check(
      "advisory_plan_suggestion_effect_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'ape_'
        AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "advisory_plan_suggestion_effect_address",
      sql`${table.cause_type} IN (
          'responsive_tutor_proposal', 'proactive_tutor_proposal', 'learner_revision', 'tutor_revision'
        )
        AND ${table.semantic_slot} = 'suggestion_change_set'
        AND length(${table.semantic_address_fingerprint}) = 64
        AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.command_fingerprint}) = 64
        AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "advisory_plan_suggestion_effect_shape",
      sql`json_valid(${table.canonical_command}) AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1
        AND json_valid(${table.admission_projection}) AND json_valid(${table.result})
        AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0
        AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}
        AND length(${table.acknowledgement_title}) > 0 AND length(${table.acknowledgement_body}) > 0`,
    ),
  ],
)

export const AdvisoryPlanSuggestionNoChangeSealTable = sqliteTable(
  "advisory_plan_suggestion_no_change_seal",
  {
    semantic_address_fingerprint: text().primaryKey(),
    cause_type: text().$type<CanonicalCommand["cause"]["type"]>().notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    model_operation_id: text().$type<MessageID>().notNull(),
    semantic_slot: text().notNull(),
    command_fingerprint: text().notNull(),
    canonical_command: text({ mode: "json" }).$type<CanonicalCommand>().notNull(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
    invocation_status: text().$type<"no_change">().notNull(),
    receipt_id: text().$type<ReceiptID>().notNull().unique(),
    materialized_candidate: text({ mode: "json" }).$type<Candidate>().notNull(),
    result: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.invocation_part_id, table.invocation_status],
      foreignColumns: [LearningCommandInvocationTable.part_id, LearningCommandInvocationTable.status],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete("restrict"),
    uniqueIndex("advisory_plan_suggestion_no_change_learner_slot")
      .on(table.occurrence_id, table.semantic_slot)
      .where(sql`${table.cause_type} = 'learner_revision'`),
    uniqueIndex("advisory_plan_suggestion_no_change_model_slot")
      .on(table.model_operation_id, table.semantic_slot)
      .where(sql`${table.cause_type} IN ('responsive_tutor_proposal', 'proactive_tutor_proposal', 'tutor_revision')`),
    check(
      "advisory_plan_suggestion_no_change_address",
      sql`${table.cause_type} IN (
          'responsive_tutor_proposal', 'proactive_tutor_proposal', 'learner_revision', 'tutor_revision'
        )
        AND ${table.semantic_slot} = 'suggestion_change_set'
        AND length(${table.semantic_address_fingerprint}) = 64
        AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.command_fingerprint}) = 64
        AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "advisory_plan_suggestion_no_change_shape",
      sql`${table.invocation_status} = 'no_change'
        AND json_valid(${table.canonical_command}) AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1
        AND json_valid(${table.materialized_candidate}) AND json_valid(${table.result})
        AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0`,
    ),
  ],
)

export const AdvisoryPlanSuggestionRevisionTable = sqliteTable(
  "advisory_plan_suggestion_revision",
  {
    id: text().$type<RevisionID>().primaryKey(),
    suggestion_id: text().$type<SuggestionID>().notNull(),
    version: integer().notNull(),
    predecessor_revision_id: text().$type<RevisionID>(),
    effect_id: text().$type<EffectID>().notNull(),
    operation: text().$type<"create" | "alternative" | "revise" | "retire" | "restore">().notNull(),
    operation_ordinal: integer().notNull(),
    disposition: text().$type<Disposition>().notNull(),
    snapshot: text({ mode: "json" }).$type<SemanticSnapshot>().notNull(),
    learner_visible_scope: text().notNull(),
    retrieval_scope_type: text().$type<"anchored" | "learner_home_fallback">().notNull(),
    retrieval_fallback_reason: text().$type<"no_stable_owner_anchor" | "deliberately_cross_cutting">(),
    retrieval_anchor_count: integer().notNull(),
    purpose: text().notNull(),
    directory_summary: text().notNull(),
    body: text().notNull(),
    assumptions_and_uncertainty: text(),
    basis_count: integer().notNull(),
    alternative_target_suggestion_id: text().$type<SuggestionID>(),
    alternative_target_revision_id: text().$type<RevisionID>(),
    alternative_target_version: integer(),
    author_class: text().$type<CanonicalCommand["cause"]["type"]>().notNull(),
    author_and_cause: text({ mode: "json" }).$type<AuthorAndCause>().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.suggestion_id], foreignColumns: [AdvisoryPlanSuggestionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.predecessor_revision_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.effect_id], foreignColumns: [AdvisoryPlanSuggestionEffectTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.alternative_target_revision_id],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    unique("advisory_plan_suggestion_revision_version").on(table.suggestion_id, table.version),
    unique("advisory_plan_suggestion_revision_effect_ordinal").on(table.effect_id, table.operation_ordinal),
    uniqueIndex("advisory_plan_suggestion_revision_one_successor")
      .on(table.predecessor_revision_id)
      .where(sql`${table.predecessor_revision_id} IS NOT NULL`),
    index("advisory_plan_suggestion_revision_head_idx").on(table.suggestion_id, table.version),
    check(
      "advisory_plan_suggestion_revision_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'apr_'
        AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'
        AND ${table.version} >= 1 AND ${table.frontier_sequence} >= 1`,
    ),
    check(
      "advisory_plan_suggestion_revision_lineage",
      sql`(${table.version} = 1 AND ${table.predecessor_revision_id} IS NULL
          AND ${table.operation} IN ('create', 'alternative'))
        OR (${table.version} > 1 AND ${table.predecessor_revision_id} IS NOT NULL
          AND ${table.operation} IN ('revise', 'retire', 'restore'))`,
    ),
    check(
      "advisory_plan_suggestion_revision_shape",
      sql`json_valid(${table.snapshot}) AND json_valid(${table.author_and_cause})
        AND ${table.operation} IN ('create', 'alternative', 'revise', 'retire', 'restore')
        AND ${table.operation_ordinal} BETWEEN 0 AND 7
        AND ${table.disposition} IN ('active', 'retired')
        AND ${table.retrieval_scope_type} IN ('anchored', 'learner_home_fallback')
        AND ((${table.retrieval_scope_type} = 'anchored' AND ${table.retrieval_fallback_reason} IS NULL
              AND ${table.retrieval_anchor_count} BETWEEN 1 AND 8)
          OR (${table.retrieval_scope_type} = 'learner_home_fallback'
              AND ${table.retrieval_fallback_reason} IN ('no_stable_owner_anchor', 'deliberately_cross_cutting')
              AND ${table.retrieval_anchor_count} = 0))
        AND ${table.basis_count} BETWEEN 0 AND 16
        AND length(CAST(${table.learner_visible_scope} AS BLOB)) BETWEEN 1 AND 384
        AND length(CAST(${table.purpose} AS BLOB)) BETWEEN 1 AND 384
        AND length(CAST(${table.directory_summary} AS BLOB)) BETWEEN 1 AND 512
        AND length(CAST(${table.body} AS BLOB)) BETWEEN 1 AND 8192
        AND (${table.assumptions_and_uncertainty} IS NULL
          OR length(CAST(${table.assumptions_and_uncertainty} AS BLOB)) BETWEEN 1 AND 2048)
        AND ((${table.alternative_target_suggestion_id} IS NULL
            AND ${table.alternative_target_revision_id} IS NULL AND ${table.alternative_target_version} IS NULL)
          OR (${table.alternative_target_suggestion_id} IS NOT NULL
            AND ${table.alternative_target_revision_id} IS NOT NULL AND ${table.alternative_target_version} >= 1
            AND ${table.alternative_target_suggestion_id} <> ${table.suggestion_id}
            AND length(${table.alternative_target_suggestion_id}) = 30
            AND substr(${table.alternative_target_suggestion_id}, 1, 4) = 'aps_'
            AND substr(${table.alternative_target_suggestion_id}, 5) NOT GLOB '*[^0-9A-Za-z]*'
            AND length(${table.alternative_target_revision_id}) = 30
            AND substr(${table.alternative_target_revision_id}, 1, 4) = 'apr_'
            AND substr(${table.alternative_target_revision_id}, 5) NOT GLOB '*[^0-9A-Za-z]*'))
        AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0`,
    ),
  ],
)

export const AdvisoryPlanSuggestionAnchorTable = sqliteTable(
  "advisory_plan_suggestion_anchor",
  {
    revision_id: text().$type<RevisionID>().notNull(),
    ordinal: integer().notNull(),
    key_type: text().notNull(),
    stable_key_fingerprint: text().notNull(),
    exact_ref_type: text().notNull(),
    exact_ref_fingerprint: text().notNull(),
    binding: text({ mode: "json" }).$type<RetrievalAnchor>().notNull(),
    first_bound_revision_id: text().$type<RevisionID>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.ordinal] }),
    foreignKey({ columns: [table.revision_id], foreignColumns: [AdvisoryPlanSuggestionRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.first_bound_revision_id],
      foreignColumns: [AdvisoryPlanSuggestionRevisionTable.id],
    }).onDelete("restrict"),
    unique("advisory_plan_suggestion_anchor_unique_key").on(table.revision_id, table.stable_key_fingerprint),
    check(
      "advisory_plan_suggestion_anchor_shape",
      sql`${table.ordinal} BETWEEN 0 AND 7
        AND length(${table.stable_key_fingerprint}) = 64
        AND ${table.stable_key_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.exact_ref_fingerprint}) = 64
        AND ${table.exact_ref_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND json_valid(${table.binding})`,
    ),
  ],
)

export const AdvisoryPlanSuggestionBasisTable = sqliteTable(
  "advisory_plan_suggestion_basis",
  {
    revision_id: text().$type<RevisionID>().notNull(),
    ordinal: integer().notNull(),
    ref_type: text().notNull(),
    ref_fingerprint: text().notNull(),
    binding: text({ mode: "json" }).$type<ExactBinding>().notNull(),
    first_bound_revision_id: text().$type<RevisionID>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.ordinal] }),
    foreignKey({ columns: [table.revision_id], foreignColumns: [AdvisoryPlanSuggestionRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.first_bound_revision_id],
      foreignColumns: [AdvisoryPlanSuggestionRevisionTable.id],
    }).onDelete("restrict"),
    unique("advisory_plan_suggestion_basis_unique_ref").on(table.revision_id, table.ref_fingerprint),
    check(
      "advisory_plan_suggestion_basis_shape",
      sql`${table.ordinal} BETWEEN 0 AND 15 AND length(${table.ref_fingerprint}) = 64
        AND ${table.ref_fingerprint} NOT GLOB '*[^0-9a-f]*' AND json_valid(${table.binding})`,
    ),
  ],
)

export const AdvisoryPlanSuggestionCommitSealTable = sqliteTable(
  "advisory_plan_suggestion_commit_seal",
  {
    effect_id: text().$type<EffectID>().primaryKey(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
    receipt_id: text().$type<ReceiptID>().notNull().unique(),
    time_sealed: integer().notNull(),
    seal_order: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.effect_id], foreignColumns: [AdvisoryPlanSuggestionEffectTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete("restrict"),
    check("advisory_plan_suggestion_commit_seal_shape", sql`${table.time_sealed} >= 0 AND ${table.seal_order} >= 0`),
  ],
)
