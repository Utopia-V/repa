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
import type { Course } from "../course"
import { CourseTable } from "../course/sql"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { AuthorizationBasis, ReceiptID } from "../learning-command/physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import type { PartID } from "../v1/session"
import type { PermissionV1 } from "../v1/permission"
import type {
  AgentActionProvenanceV2,
  CanonicalCommandV2,
  CapabilityOutcomeV2,
  Command,
  EffectID,
  FieldName,
  GoalID,
  MaterializedChangeSetV2,
  NonSupersededDisposition,
  OperationResult,
  RevisionID,
  SemanticAddressV2,
  TargetValueV2,
} from "./schema"

export const LearnerGoalStateTable = sqliteTable(
  "learner_goal_state",
  {
    singleton: integer().primaryKey().default(1),
    revision_sequence: integer().notNull().default(0),
  },
  (table) => [
    check("learner_goal_state_singleton", sql`${table.singleton} = 1`),
    check("learner_goal_state_revision_nonnegative", sql`${table.revision_sequence} >= 0`),
  ],
)

export const LearnerGoalStateGuardTable = sqliteTable(
  "learner_goal_state_guard",
  {
    singleton: integer().primaryKey(),
  },
  (table) => [
    foreignKey({ columns: [table.singleton], foreignColumns: [LearnerGoalStateTable.singleton] }).onDelete("restrict"),
    check("learner_goal_state_guard_singleton", sql`${table.singleton} = 1`),
  ],
)

export const LearnerGoalTimeZoneReleaseTable = sqliteTable(
  "learner_goal_time_zone_release",
  {
    id: text().primaryKey(),
    tzdb_version: text().notNull(),
    engine: text().notNull(),
    data_sha256: text().notNull(),
  },
  (table) => [
    check("learner_goal_time_zone_release_id", sql`length(${table.id}) > 0`),
    check("learner_goal_time_zone_release_version", sql`length(${table.tzdb_version}) > 0`),
    check("learner_goal_time_zone_release_engine", sql`length(${table.engine}) > 0`),
    check(
      "learner_goal_time_zone_release_hash",
      sql`length(${table.data_sha256}) = 64 AND ${table.data_sha256} NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
)

export const LearnerGoalTimeZoneTable = sqliteTable(
  "learner_goal_time_zone",
  {
    release_id: text().notNull(),
    name: text().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.release_id], foreignColumns: [LearnerGoalTimeZoneReleaseTable.id] }).onDelete(
      "restrict",
    ),
    primaryKey({ columns: [table.release_id, table.name] }),
    check("learner_goal_time_zone_name", sql`length(${table.name}) > 0`),
  ],
)

export const LearnerGoalTable = sqliteTable(
  "learner_goal",
  {
    id: text().$type<GoalID>().primaryKey(),
    time_created: integer().notNull(),
  },
  (table) => [
    check(
      "learner_goal_identity_format",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'gol_' AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check("learner_goal_time_nonnegative", sql`${table.time_created} >= 0`),
  ],
)

export const LearnerGoalCommandTable = sqliteTable(
  "learner_goal_command",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    semantic_fingerprint: text().notNull(),
    command_snapshot: text({ mode: "json" }).$type<Command>().notNull(),
    permission_request_id: text().$type<PermissionV1.ID>(),
    confirmation_snapshot: text({ mode: "json" }).$type<import("./schema").ConfirmationSnapshot>(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("cascade"),
    check(
      "learner_goal_command_fingerprint",
      sql`length(${table.semantic_fingerprint}) = 64 AND ${table.semantic_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "learner_goal_command_snapshot",
      sql`json_valid(${table.command_snapshot}) AND json_type(${table.command_snapshot}) = 'object'`,
    ),
    check(
      "learner_goal_command_permission",
      sql`${table.permission_request_id} IS NULL OR length(${table.permission_request_id}) > 0`,
    ),
    check(
      "learner_goal_command_confirmation",
      sql`${table.confirmation_snapshot} IS NULL OR (json_valid(${table.confirmation_snapshot}) AND json_type(${table.confirmation_snapshot}) = 'object')`,
    ),
  ],
)

export const LearnerGoalDispositionV2Table = sqliteTable(
  "learner_goal_disposition_v2",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    disposition: text().$type<"legacy_v1" | "semantic_terminal_v2" | "candidate_v2">().notNull(),
    legacy_command_part_id: text().$type<PartID>(),
    command_fingerprint: text().notNull(),
    canonical_command: text({ mode: "json" }).$type<CanonicalCommandV2>(),
    semantic_address: text({ mode: "json" }).$type<SemanticAddressV2>(),
    semantic_address_fingerprint: text(),
    incoming_intent_fingerprint: text(),
    semantic_outcome: text().$type<"already_applied" | "semantic_conflict">(),
    existing_effect_id: text().$type<EffectID>(),
    existing_intent_fingerprint: text(),
    agent_action_fingerprint: text(),
    agent_action_provenance: text({ mode: "json" }).$type<AgentActionProvenanceV2>(),
    materialized_snapshot: text({ mode: "json" }).$type<MaterializedChangeSetV2>(),
    time_disposed: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.legacy_command_part_id],
      foreignColumns: [LearnerGoalCommandTable.invocation_part_id],
    }).onDelete("cascade"),
    check(
      "learner_goal_disposition_v2_fingerprints",
      sql`length(${table.command_fingerprint}) = 64
        AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND (${table.semantic_address_fingerprint} IS NULL OR
          (length(${table.semantic_address_fingerprint}) = 64 AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'))
        AND (${table.incoming_intent_fingerprint} IS NULL OR
          (length(${table.incoming_intent_fingerprint}) = 64 AND ${table.incoming_intent_fingerprint} NOT GLOB '*[^0-9a-f]*'))
        AND (${table.existing_intent_fingerprint} IS NULL OR
          (length(${table.existing_intent_fingerprint}) = 64 AND ${table.existing_intent_fingerprint} NOT GLOB '*[^0-9a-f]*'))
        AND (${table.agent_action_fingerprint} IS NULL OR
          (length(${table.agent_action_fingerprint}) = 64 AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
    check(
      "learner_goal_disposition_v2_closed_union",
      sql`(
        ${table.disposition} = 'legacy_v1'
        AND ${table.legacy_command_part_id} = ${table.invocation_part_id}
        AND ${table.canonical_command} IS NULL
        AND ${table.semantic_address} IS NULL
        AND ${table.semantic_address_fingerprint} IS NULL
        AND ${table.incoming_intent_fingerprint} IS NULL
        AND ${table.semantic_outcome} IS NULL
        AND ${table.existing_effect_id} IS NULL
        AND ${table.existing_intent_fingerprint} IS NULL
        AND ${table.agent_action_fingerprint} IS NULL
        AND ${table.agent_action_provenance} IS NULL
        AND ${table.materialized_snapshot} IS NULL
      ) OR (
        ${table.disposition} = 'semantic_terminal_v2'
        AND ${table.legacy_command_part_id} IS NULL
        AND json_valid(${table.canonical_command})
        AND json_type(${table.canonical_command}) = 'object'
        AND json_valid(${table.semantic_address})
        AND json_type(${table.semantic_address}) = 'object'
        AND json_type(${table.semantic_address}, '$.occurrenceID') = 'text'
        AND json_extract(${table.semantic_address}, '$.slot') = 'learner_goal_change_set'
        AND ${table.semantic_address_fingerprint} IS NOT NULL
        AND ${table.incoming_intent_fingerprint} IS NOT NULL
        AND ${table.semantic_outcome} IN ('already_applied', 'semantic_conflict')
        AND ${table.existing_effect_id} IS NOT NULL
        AND ${table.existing_intent_fingerprint} IS NOT NULL
        AND ${table.agent_action_fingerprint} IS NULL
        AND ${table.agent_action_provenance} IS NULL
        AND ${table.materialized_snapshot} IS NULL
      ) OR (
        ${table.disposition} = 'candidate_v2'
        AND ${table.legacy_command_part_id} IS NULL
        AND json_valid(${table.canonical_command})
        AND json_type(${table.canonical_command}) = 'object'
        AND json_valid(${table.semantic_address})
        AND json_type(${table.semantic_address}) = 'object'
        AND json_type(${table.semantic_address}, '$.occurrenceID') = 'text'
        AND json_extract(${table.semantic_address}, '$.slot') = 'learner_goal_change_set'
        AND ${table.semantic_address_fingerprint} IS NOT NULL
        AND ${table.incoming_intent_fingerprint} IS NOT NULL
        AND ${table.semantic_outcome} IS NULL
        AND ${table.existing_effect_id} IS NULL
        AND ${table.existing_intent_fingerprint} IS NULL
        AND ${table.agent_action_fingerprint} IS NOT NULL
        AND json_valid(${table.agent_action_provenance})
        AND json_extract(${table.agent_action_provenance}, '$.schemaVersion') = 1
        AND json_extract(${table.agent_action_provenance}, '$.kind') IN ('root', 'delegated')
        AND json_extract(${table.agent_action_provenance}, '$.capabilityIdentity') = 'update_learner_goals'
        AND json_extract(${table.agent_action_provenance}, '$.capabilityVersion') = 2
        AND json_type(${table.agent_action_provenance}, '$.lineage') = 'array'
        AND ((json_extract(${table.agent_action_provenance}, '$.kind') = 'root'
              AND json_array_length(${table.agent_action_provenance}, '$.lineage') = 0
              AND json_type(${table.agent_action_provenance}, '$.effectiveDelegatedCapability') IS NULL)
          OR (json_extract(${table.agent_action_provenance}, '$.kind') = 'delegated'
              AND json_array_length(${table.agent_action_provenance}, '$.lineage') > 0
              AND json_type(${table.agent_action_provenance}, '$.effectiveDelegatedCapability') = 'object'))
        AND json_valid(${table.materialized_snapshot})
        AND json_type(${table.materialized_snapshot}) = 'object'
        AND json_extract(${table.materialized_snapshot}, '$.schemaVersion') = 2
        AND json(${table.canonical_command}) = json(json_extract(${table.materialized_snapshot}, '$.canonicalCommand'))
        AND json_type(${table.materialized_snapshot}, '$.operations') = 'array'
        AND json_array_length(${table.materialized_snapshot}, '$.operations') BETWEEN 1 AND 8
        AND json_type(${table.materialized_snapshot}, '$.revisionSequenceBefore') = 'integer'
        AND json_extract(${table.materialized_snapshot}, '$.revisionSequenceBefore') >= 0
        AND json_type(${table.materialized_snapshot}, '$.consumedFrontiers') = 'array'
        AND json_type(${table.materialized_snapshot}, '$.timeFloor') = 'integer'
        AND json_extract(${table.materialized_snapshot}, '$.timeFloor') >= 0
      )`,
    ),
    check("learner_goal_disposition_v2_time", sql`${table.time_disposed} >= 0`),
  ],
)

export const LearnerGoalCapabilityIssueV2Table = sqliteTable(
  "learner_goal_capability_issue_v2",
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
      foreignColumns: [LearnerGoalDispositionV2Table.invocation_part_id],
    }).onDelete("cascade"),
    unique("learner_goal_capability_issue_v2_invocation_request_unique").on(
      table.invocation_part_id,
      table.permission_request_id,
    ),
    check(
      "learner_goal_capability_issue_v2_fingerprints",
      sql`length(${table.agent_action_fingerprint}) = 64 AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.policy_fingerprint}) = 64 AND ${table.policy_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.shown_scope_fingerprint}) = 64 AND ${table.shown_scope_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "learner_goal_capability_issue_v2_shape",
      sql`length(${table.permission_request_id}) > 0 AND json_valid(${table.policy_basis})
        AND json_valid(${table.shown_scope}) AND ${table.time_issued} >= 0 AND ${table.issue_order} >= 0`,
    ),
  ],
)

export const LearnerGoalCapabilitySettlementV2Table = sqliteTable(
  "learner_goal_capability_settlement_v2",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    outcome: text().$type<CapabilityOutcomeV2>().notNull(),
    permission_request_id: text().$type<PermissionV1.ID>(),
    agent_action_fingerprint: text().notNull(),
    policy_basis: text({ mode: "json" }).$type<Record<string, unknown>>(),
    policy_fingerprint: text(),
    reply: text({ mode: "json" }).$type<Record<string, unknown>>(),
    reply_fingerprint: text(),
    time_settled: integer().notNull(),
    settlement_order: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearnerGoalDispositionV2Table.invocation_part_id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invocation_part_id, table.permission_request_id],
      foreignColumns: [
        LearnerGoalCapabilityIssueV2Table.invocation_part_id,
        LearnerGoalCapabilityIssueV2Table.permission_request_id,
      ],
    }).onDelete("cascade"),
    check(
      "learner_goal_capability_settlement_v2_fingerprints",
      sql`length(${table.agent_action_fingerprint}) = 64 AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND (${table.policy_fingerprint} IS NULL OR (length(${table.policy_fingerprint}) = 64 AND ${table.policy_fingerprint} NOT GLOB '*[^0-9a-f]*'))
        AND (${table.reply_fingerprint} IS NULL OR (length(${table.reply_fingerprint}) = 64 AND ${table.reply_fingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
    check(
      "learner_goal_capability_settlement_v2_closed_union",
      sql`(${table.outcome} = 'not_evaluated' AND ${table.permission_request_id} IS NULL
          AND ${table.policy_basis} IS NULL AND ${table.policy_fingerprint} IS NULL
          AND ${table.reply} IS NULL AND ${table.reply_fingerprint} IS NULL)
        OR (${table.outcome} IN ('policy_allow', 'policy_deny') AND ${table.permission_request_id} IS NULL
          AND json_valid(${table.policy_basis}) AND ${table.policy_fingerprint} IS NOT NULL
          AND ${table.reply} IS NULL AND ${table.reply_fingerprint} IS NULL)
        OR (${table.outcome} = 'prompted_abort' AND ${table.permission_request_id} IS NOT NULL
          AND ${table.policy_basis} IS NULL AND ${table.policy_fingerprint} IS NULL
          AND ${table.reply} IS NULL AND ${table.reply_fingerprint} IS NULL)
        OR (${table.outcome} IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
          AND ${table.permission_request_id} IS NOT NULL
          AND ${table.policy_basis} IS NULL AND ${table.policy_fingerprint} IS NULL
          AND json_valid(${table.reply}) AND ${table.reply_fingerprint} IS NOT NULL)`,
    ),
    check(
      "learner_goal_capability_settlement_v2_time",
      sql`${table.time_settled} >= 0 AND ${table.settlement_order} >= 0`,
    ),
  ],
)

export const LearnerGoalEffectTable = sqliteTable(
  "learner_goal_effect",
  {
    id: text().$type<EffectID>().primaryKey(),
    schema_version: integer().$type<1 | 2>().notNull().default(1),
    commit_seal_id: text()
      .$type<EffectID>()
      .notNull()
      .references((): AnySQLiteColumn => LearnerGoalCommitSealTable.effect_id, { onDelete: "restrict" }),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    source_order: integer().notNull(),
    semantic_fingerprint: text().notNull(),
    authorization_basis: text().$type<AuthorizationBasis>().notNull(),
    command: text({ mode: "json" }).$type<Command | CanonicalCommandV2>().notNull(),
    agent_action_part_id: text().$type<PartID>(),
    materialized_snapshot: text({ mode: "json" }).$type<MaterializedChangeSetV2>(),
    operation_count: integer().notNull(),
    change_count: integer().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
    frontier_time: integer().notNull(),
    acknowledgement_title: text().notNull(),
    acknowledgement_body: text().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.agent_action_part_id],
      foreignColumns: [LearnerGoalDispositionV2Table.invocation_part_id],
    }).onDelete("restrict"),
    unique("learner_goal_effect_occurrence_unique").on(table.occurrence_id),
    unique("learner_goal_effect_frontier_unique").on(table.frontier_sequence),
    check("learner_goal_effect_seal_identity", sql`${table.commit_seal_id} = ${table.id}`),
    check(
      "learner_goal_effect_identity_format",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'gle_' AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "learner_goal_effect_fingerprint",
      sql`length(${table.semantic_fingerprint}) = 64 AND ${table.semantic_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "learner_goal_effect_versioned_provenance",
      sql`(${table.schema_version} = 1
          AND ${table.authorization_basis} IN ('learner_request', 'learner_acceptance')
          AND ${table.agent_action_part_id} IS NULL
          AND ${table.materialized_snapshot} IS NULL)
        OR (${table.schema_version} = 2
          AND ${table.authorization_basis} = 'agent_action'
          AND ${table.agent_action_part_id} IS NOT NULL
          AND json_valid(${table.command})
          AND json_type(${table.command}) = 'object'
          AND json_valid(${table.materialized_snapshot})
          AND json_type(${table.materialized_snapshot}) = 'object')`,
    ),
    check("learner_goal_effect_command_json", sql`json_valid(${table.command})`),
    check(
      "learner_goal_effect_counts",
      sql`${table.operation_count} BETWEEN 1 AND 8 AND ${table.change_count} BETWEEN 1 AND ${table.operation_count}`,
    ),
    check(
      "learner_goal_effect_time_order",
      sql`${table.source_order} >= 1 AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    check(
      "learner_goal_effect_acknowledgement",
      sql`length(${table.acknowledgement_title}) > 0 AND length(${table.acknowledgement_body}) > 0`,
    ),
  ],
)

export const LearnerGoalCommitSealTable = sqliteTable(
  "learner_goal_commit_seal",
  {
    effect_id: text().$type<EffectID>().primaryKey(),
    receipt_id: text().$type<ReceiptID>().notNull(),
    invocation_part_id: text().$type<PartID>().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearnerGoalEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    unique("learner_goal_commit_seal_receipt_unique").on(table.receipt_id),
    unique("learner_goal_commit_seal_invocation_unique").on(table.invocation_part_id),
  ],
)

export const LearnerGoalRevisionTable = sqliteTable(
  "learner_goal_revision",
  {
    id: text().$type<RevisionID>().primaryKey(),
    schema_version: integer().$type<1 | 2>().notNull().default(1),
    goal_id: text().$type<GoalID>().notNull(),
    version: integer().notNull(),
    predecessor_id: text().$type<RevisionID>(),
    effect_id: text().$type<EffectID>().notNull(),
    operation_ordinal: integer().notNull(),
    revision_role: text().$type<"source" | "target">().notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    source_order: integer().notNull(),
    outcome: text().notNull(),
    scope_kind: text().$type<"learner_home" | "courses">().notNull(),
    target_kind: text().$type<"absent" | "instant" | "local_date">(),
    target_instant: integer(),
    target_local_date: text(),
    target_timezone: text(),
    target_timezone_release_id: text(),
    target_utc_offset_minutes: integer(),
    target_source_expression: text(),
    target_normalized: text(),
    target_normalization_basis: text().$type<"explicit_offset" | "source_temporal_context" | "explicit_date">(),
    target_value_v2: text({ mode: "json" }).$type<TargetValueV2>(),
    disposition: text().$type<NonSupersededDisposition | "superseded">().notNull(),
    revision_order: integer().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
    frontier_time: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.predecessor_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearnerGoalEffectTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.target_timezone_release_id, table.target_timezone],
      foreignColumns: [LearnerGoalTimeZoneTable.release_id, LearnerGoalTimeZoneTable.name],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    unique("learner_goal_revision_goal_version_unique").on(table.goal_id, table.version),
    unique("learner_goal_revision_predecessor_unique").on(table.predecessor_id),
    unique("learner_goal_revision_effect_role_unique").on(
      table.effect_id,
      table.operation_ordinal,
      table.revision_role,
    ),
    unique("learner_goal_revision_order_unique").on(table.revision_order),
    check(
      "learner_goal_revision_identity_format",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'glr_' AND substr(${table.id}, 5) NOT GLOB '*[^0-9A-Za-z]*'`,
    ),
    check(
      "learner_goal_revision_chain_shape",
      sql`(${table.version} = 1 AND ${table.predecessor_id} IS NULL) OR (${table.version} > 1 AND ${table.predecessor_id} IS NOT NULL)`,
    ),
    check("learner_goal_revision_role", sql`${table.revision_role} IN ('source', 'target')`),
    check("learner_goal_revision_outcome", sql`length(trim(${table.outcome})) > 0`),
    check("learner_goal_revision_scope", sql`${table.scope_kind} IN ('learner_home', 'courses')`),
    check(
      "learner_goal_revision_versioned_target",
      sql`COALESCE((
        ${table.schema_version} = 1
        AND ${table.target_value_v2} IS NULL
        AND (
          (${table.target_kind} = 'absent' AND ${table.target_instant} IS NULL AND ${table.target_local_date} IS NULL AND ${table.target_timezone} IS NULL AND ${table.target_timezone_release_id} IS NULL AND ${table.target_utc_offset_minutes} IS NULL AND ${table.target_source_expression} IS NULL AND ${table.target_normalized} IS NULL AND ${table.target_normalization_basis} IS NULL)
          OR (${table.target_kind} = 'instant' AND ${table.target_instant} IS NOT NULL AND ${table.target_instant} >= 0 AND ${table.target_local_date} IS NULL AND ${table.target_timezone} IS NULL AND ${table.target_timezone_release_id} IS NULL AND ${table.target_utc_offset_minutes} BETWEEN -840 AND 840 AND ${table.target_source_expression} IS NOT NULL AND length(${table.target_source_expression}) > 0 AND ${table.target_normalized} IS NOT NULL AND length(${table.target_normalized}) > 0 AND round(unixepoch(${table.target_normalized}, 'subsec') * 1000) = ${table.target_instant} AND ${table.target_normalization_basis} = 'explicit_offset')
          OR (${table.target_kind} = 'local_date' AND ${table.target_instant} IS NULL AND ${table.target_local_date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${table.target_local_date}) = ${table.target_local_date} AND ${table.target_timezone} IS NOT NULL AND length(${table.target_timezone}) > 0 AND ${table.target_timezone_release_id} IS NOT NULL AND length(${table.target_timezone_release_id}) > 0 AND ${table.target_utc_offset_minutes} IS NULL AND ${table.target_source_expression} IS NOT NULL AND length(${table.target_source_expression}) > 0 AND ${table.target_normalized} IS NULL AND ${table.target_normalization_basis} IN ('explicit_date', 'source_temporal_context'))
        )
      ) OR (
        ${table.schema_version} = 2
        AND ${table.target_kind} IS NULL
        AND ${table.target_instant} IS NULL
        AND ${table.target_local_date} IS NULL
        AND ${table.target_timezone} IS NULL
        AND ${table.target_timezone_release_id} IS NULL
        AND ${table.target_utc_offset_minutes} IS NULL
        AND ${table.target_source_expression} IS NULL
        AND ${table.target_normalized} IS NULL
        AND ${table.target_normalization_basis} IS NULL
        AND json_valid(${table.target_value_v2})
        AND json_type(${table.target_value_v2}) = 'object'
      ), 0)`,
    ),
    check(
      "learner_goal_revision_disposition",
      sql`${table.disposition} IN ('active', 'achieved', 'abandoned', 'superseded')`,
    ),
    check(
      "learner_goal_revision_order",
      sql`${table.version} >= 1 AND ${table.operation_ordinal} BETWEEN 0 AND 7 AND ${table.source_order} >= 1 AND ${table.revision_order} >= 1 AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    index("learner_goal_revision_history_idx").on(table.goal_id, table.version, table.id),
    index("learner_goal_revision_effect_idx").on(table.effect_id, table.operation_ordinal, table.revision_role),
    index("learner_goal_revision_discovery_idx").on(table.disposition, table.revision_order, table.goal_id),
  ],
)

export const LearnerGoalConditionTable = sqliteTable(
  "learner_goal_condition",
  {
    revision_id: text().$type<RevisionID>().notNull(),
    ordinal: integer().notNull(),
    content: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.ordinal] }),
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    check("learner_goal_condition_ordinal", sql`${table.ordinal} BETWEEN 0 AND 15`),
    check("learner_goal_condition_content", sql`length(trim(${table.content})) > 0`),
  ],
)

export const LearnerGoalCourseScopeTable = sqliteTable(
  "learner_goal_course_scope",
  {
    revision_id: text().$type<RevisionID>().notNull(),
    course_id: text().$type<Course.CourseID>().notNull(),
    course_title: text().notNull(),
    admission_kind: text().$type<"new" | "carried">().notNull(),
    admitted_course_version: integer(),
    admitted_course_time_updated: integer(),
    carried_from_revision_id: text().$type<RevisionID>(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.course_id] }),
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.carried_from_revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete(
      "restrict",
    ),
    check("learner_goal_course_scope_title", sql`length(trim(${table.course_title})) > 0`),
    check(
      "learner_goal_course_scope_admission",
      sql`(${table.admission_kind} = 'new' AND ${table.admitted_course_version} IS NOT NULL AND ${table.admitted_course_version} >= 0 AND ${table.admitted_course_time_updated} IS NOT NULL AND ${table.admitted_course_time_updated} >= 0 AND ${table.carried_from_revision_id} IS NULL) OR (${table.admission_kind} = 'carried' AND ${table.admitted_course_version} IS NULL AND ${table.admitted_course_time_updated} IS NULL AND ${table.carried_from_revision_id} IS NOT NULL)`,
    ),
    index("learner_goal_course_scope_course_idx").on(table.course_id, table.revision_id),
  ],
)

export const LearnerGoalFieldBasisTable = sqliteTable(
  "learner_goal_field_basis",
  {
    revision_id: text().$type<RevisionID>().notNull(),
    field: text().$type<FieldName>().notNull(),
    basis_kind: text().$type<"authored" | "accepted" | "carried">().notNull(),
    source_excerpt: text(),
    predecessor_revision_id: text().$type<RevisionID>(),
  },
  (table) => [
    primaryKey({ columns: [table.revision_id, table.field] }),
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.predecessor_revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete(
      "restrict",
    ),
    check(
      "learner_goal_field_basis_field",
      sql`${table.field} IN ('outcome', 'conditions', 'scope', 'target', 'disposition')`,
    ),
    check(
      "learner_goal_field_basis_shape",
      sql`(${table.basis_kind} = 'authored' AND ${table.source_excerpt} IS NOT NULL AND length(${table.source_excerpt}) > 0 AND ${table.predecessor_revision_id} IS NULL) OR (${table.basis_kind} = 'accepted' AND ${table.source_excerpt} IS NULL AND ${table.predecessor_revision_id} IS NULL) OR (${table.basis_kind} = 'carried' AND ${table.source_excerpt} IS NULL AND ${table.predecessor_revision_id} IS NOT NULL)`,
    ),
  ],
)

export const LearnerGoalSupersessionTable = sqliteTable(
  "learner_goal_supersession",
  {
    revision_id: text().$type<RevisionID>().primaryKey(),
    source_goal_id: text().$type<GoalID>().notNull(),
    target_goal_id: text().$type<GoalID>().notNull(),
    target_revision_id: text().$type<RevisionID>().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.source_goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.target_goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.target_revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete(
      "restrict",
    ),
    check("learner_goal_supersession_distinct", sql`${table.source_goal_id} <> ${table.target_goal_id}`),
    index("learner_goal_supersession_target_idx").on(table.target_goal_id, table.revision_id),
  ],
)

export const LearnerGoalEffectOperationTable = sqliteTable(
  "learner_goal_effect_operation",
  {
    effect_id: text().$type<EffectID>().notNull(),
    ordinal: integer().notNull(),
    schema_version: integer().$type<1 | 2>().notNull().default(1),
    operation_kind: text().$type<"create" | "update" | "replace">().notNull(),
    result_kind: text().$type<"changed" | "no_change">().notNull(),
    goal_id: text().$type<GoalID>().notNull(),
    revision_id: text().$type<RevisionID>().notNull(),
    version: integer().notNull(),
    disposition: text().$type<NonSupersededDisposition | "superseded">().notNull(),
    meaning: text({ mode: "json" }).$type<OperationResult["meaning"] | Record<string, unknown>>().notNull(),
    replacement_target_kind: text().$type<"existing" | "new">(),
    replacement_target_goal_id: text().$type<GoalID>(),
    replacement_target_revision_id: text().$type<RevisionID>(),
    replacement_target_version: integer(),
  },
  (table) => [
    primaryKey({ columns: [table.effect_id, table.ordinal] }),
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearnerGoalEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.revision_id], foreignColumns: [LearnerGoalRevisionTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.replacement_target_goal_id], foreignColumns: [LearnerGoalTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.replacement_target_revision_id],
      foreignColumns: [LearnerGoalRevisionTable.id],
    }).onDelete("restrict"),
    check("learner_goal_effect_operation_ordinal", sql`${table.ordinal} BETWEEN 0 AND 7`),
    check(
      "learner_goal_effect_operation_kind",
      sql`${table.operation_kind} IN ('create', 'update', 'replace') AND ${table.result_kind} IN ('changed', 'no_change')`,
    ),
    check(
      "learner_goal_effect_operation_result",
      sql`${table.schema_version} IN (1, 2) AND (${table.operation_kind} = 'update' OR ${table.result_kind} = 'changed') AND ${table.version} >= 1 AND ${table.disposition} IN ('active', 'achieved', 'abandoned', 'superseded') AND json_valid(${table.meaning})`,
    ),
    check(
      "learner_goal_effect_operation_replacement",
      sql`(${table.operation_kind} = 'replace' AND ${table.result_kind} = 'changed' AND ${table.disposition} = 'superseded' AND ${table.replacement_target_kind} IN ('existing', 'new') AND ${table.replacement_target_goal_id} IS NOT NULL AND ${table.replacement_target_revision_id} IS NOT NULL AND ${table.replacement_target_version} >= 1) OR (${table.operation_kind} <> 'replace' AND ${table.replacement_target_kind} IS NULL AND ${table.replacement_target_goal_id} IS NULL AND ${table.replacement_target_revision_id} IS NULL AND ${table.replacement_target_version} IS NULL)`,
    ),
  ],
)
