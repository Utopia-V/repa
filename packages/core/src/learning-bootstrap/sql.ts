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
import type { Artifact } from "../artifact"
import { ArtifactLineageCorrectionMemberTable, ArtifactRevisionTable, ArtifactTable } from "../artifact/sql"
import type { Course } from "../course"
import { CourseTable, CourseViewRevisionTable, CourseViewTable } from "../course/sql"
import type { LearnerNavigation } from "../learner-navigation"
import { CourseRouteAnchorTransitionTable } from "../learner-navigation/sql"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { ReceiptID } from "../learning-command/physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import type { MaterialMap } from "../material-map"
import { MaterialCourseAlignmentTable, MaterialMapTable } from "../material-map/sql"
import type { Representation } from "../representation"
import { RepresentationRevisionTable } from "../representation/sql"
import type { PermissionV1 } from "../v1/permission"
import type { PartID } from "../v1/session"
import type {
  Acknowledgement,
  AdoptionID,
  AgentAction,
  CanonicalCommand,
  ChildResult,
  EffectID,
  MaterializedCandidate,
} from "./schema"

export const LearningBootstrapDispositionTable = sqliteTable(
  "learning_bootstrap_disposition",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    disposition: text().$type<"candidate_v1" | "semantic_terminal_v1">().notNull(),
    command_fingerprint: text().notNull(),
    canonical_command: text({ mode: "json" }).$type<CanonicalCommand>().notNull(),
    semantic_address_fingerprint: text().notNull(),
    semantic_outcome: text().$type<"already_applied" | "semantic_conflict">(),
    existing_effect_id: text()
      .$type<EffectID>()
      .references((): AnySQLiteColumn => LearningBootstrapEffectTable.id, { onDelete: "restrict" }),
    existing_intent_fingerprint: text(),
    agent_action_fingerprint: text(),
    agent_action: text({ mode: "json" }).$type<AgentAction>(),
    materialized_candidate: text({ mode: "json" }).$type<MaterializedCandidate>(),
    time_disposed: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("cascade"),
    check(
      "learning_bootstrap_disposition_fingerprints",
      sql`length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.semantic_address_fingerprint}) = 64 AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*'
        AND (${table.existing_intent_fingerprint} IS NULL OR (length(${table.existing_intent_fingerprint}) = 64 AND ${table.existing_intent_fingerprint} NOT GLOB '*[^0-9a-f]*'))
        AND (${table.agent_action_fingerprint} IS NULL OR (length(${table.agent_action_fingerprint}) = 64 AND ${table.agent_action_fingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
    check(
      "learning_bootstrap_disposition_closed",
      sql`(${table.disposition} = 'candidate_v1'
          AND ${table.semantic_outcome} IS NULL AND ${table.existing_effect_id} IS NULL
          AND ${table.existing_intent_fingerprint} IS NULL
          AND ${table.agent_action_fingerprint} IS NOT NULL
          AND json_valid(${table.agent_action}) AND json_valid(${table.materialized_candidate}))
        OR (${table.disposition} = 'semantic_terminal_v1'
          AND ${table.semantic_outcome} IN ('already_applied', 'semantic_conflict')
          AND ${table.existing_effect_id} IS NOT NULL AND ${table.existing_intent_fingerprint} IS NOT NULL
          AND ${table.agent_action_fingerprint} IS NULL AND ${table.agent_action} IS NULL
          AND ${table.materialized_candidate} IS NULL)`,
    ),
    check(
      "learning_bootstrap_disposition_shape",
      sql`json_valid(${table.canonical_command}) AND json_extract(${table.canonical_command}, '$.schemaVersion') = 1 AND ${table.time_disposed} >= 0`,
    ),
  ],
)

export const LearningBootstrapCapabilityIssueTable = sqliteTable(
  "learning_bootstrap_capability_issue",
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
      foreignColumns: [LearningBootstrapDispositionTable.invocation_part_id],
    }).onDelete("cascade"),
    unique("learning_bootstrap_capability_issue_exact").on(table.invocation_part_id, table.permission_request_id),
    check(
      "learning_bootstrap_capability_issue_shape",
      sql`length(${table.agent_action_fingerprint}) = 64 AND length(${table.policy_fingerprint}) = 64
        AND length(${table.shown_scope_fingerprint}) = 64 AND json_valid(${table.policy_basis})
        AND json_valid(${table.shown_scope}) AND ${table.time_issued} >= 0 AND ${table.issue_order} >= 0`,
    ),
  ],
)

export const LearningBootstrapCapabilitySettlementTable = sqliteTable(
  "learning_bootstrap_capability_settlement",
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
      foreignColumns: [LearningBootstrapDispositionTable.invocation_part_id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invocation_part_id, table.permission_request_id],
      foreignColumns: [
        LearningBootstrapCapabilityIssueTable.invocation_part_id,
        LearningBootstrapCapabilityIssueTable.permission_request_id,
      ],
    }).onDelete("cascade"),
    check(
      "learning_bootstrap_capability_settlement_shape",
      sql`length(${table.agent_action_fingerprint}) = 64
        AND (${table.basis_fingerprint} IS NULL OR length(${table.basis_fingerprint}) = 64)
        AND ${table.time_settled} >= 0 AND ${table.settlement_order} >= 0
        AND ((${table.outcome} = 'not_evaluated' AND ${table.permission_request_id} IS NULL AND ${table.basis} IS NULL)
          OR (${table.outcome} IN ('policy_allow', 'policy_deny') AND ${table.permission_request_id} IS NULL AND json_valid(${table.basis}))
          OR (${table.outcome} = 'prompted_abort' AND ${table.permission_request_id} IS NOT NULL AND ${table.basis} IS NULL)
          OR (${table.outcome} IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel') AND ${table.permission_request_id} IS NOT NULL AND json_valid(${table.basis})))`,
    ),
  ],
)

export const LearningBootstrapEffectTable = sqliteTable(
  "learning_bootstrap_effect",
  {
    id: text().$type<EffectID>().primaryKey(),
    commit_seal_id: text()
      .$type<EffectID>()
      .notNull()
      .references((): AnySQLiteColumn => LearningBootstrapCommitSealTable.effect_id, { onDelete: "restrict" }),
    occurrence_id: text().$type<OccurrenceID>().notNull().unique(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
    semantic_fingerprint: text().notNull(),
    command: text({ mode: "json" }).$type<CanonicalCommand>().notNull(),
    materialized_candidate: text({ mode: "json" }).$type<MaterializedCandidate>().notNull(),
    course_id: text().$type<Course.CourseID>().notNull(),
    child_results: text({ mode: "json" }).$type<readonly ChildResult[]>().notNull(),
    acknowledgement: text({ mode: "json" }).$type<Acknowledgement>().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull().unique(),
    frontier_time: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    check("learning_bootstrap_effect_seal", sql`${table.commit_seal_id} = ${table.id}`),
    check(
      "learning_bootstrap_effect_shape",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'lbe_'
        AND length(${table.semantic_fingerprint}) = 64 AND json_valid(${table.command})
        AND json_valid(${table.materialized_candidate}) AND json_valid(${table.child_results})
        AND json_array_length(${table.child_results}) BETWEEN 1 AND 128 AND json_valid(${table.acknowledgement})
        AND ${table.time_committed} >= 0 AND ${table.commit_order} >= 0
        AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
  ],
)

export const LearningBootstrapCommitSealTable = sqliteTable(
  "learning_bootstrap_commit_seal",
  {
    effect_id: text()
      .$type<EffectID>()
      .primaryKey()
      .references((): AnySQLiteColumn => LearningBootstrapEffectTable.id, { onDelete: "restrict" }),
    receipt_id: text().$type<ReceiptID>().notNull().unique(),
    invocation_part_id: text().$type<PartID>().notNull().unique(),
  },
  (table) => [
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
  ],
)

export const LearningCourseMaterialAdoptionTable = sqliteTable(
  "learning_course_material_adoption",
  {
    id: text().$type<AdoptionID>().primaryKey(),
    course_id: text().$type<Course.CourseID>().notNull(),
    target_kind: text().$type<"artifact" | "representation">().notNull(),
    artifact_id: text().$type<Artifact.ArtifactID>(),
    artifact_revision_id: text().$type<Artifact.RevisionID>(),
    attribution_type: text().$type<"recorded" | "lineage_correction">(),
    attribution_member_id: text().$type<Artifact.LineageCorrectionMemberID>(),
    representation_revision_id: text().$type<Representation.RevisionID>(),
    creation_effect_id: text().$type<EffectID>().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.artifact_id], foreignColumns: [ArtifactTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.artifact_revision_id], foreignColumns: [ArtifactRevisionTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.attribution_member_id],
      foreignColumns: [ArtifactLineageCorrectionMemberTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.representation_revision_id],
      foreignColumns: [RepresentationRevisionTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.creation_effect_id], foreignColumns: [LearningBootstrapEffectTable.id] }).onDelete(
      "restrict",
    ),
    unique("learning_course_material_artifact_unique").on(
      table.course_id,
      table.artifact_id,
      table.artifact_revision_id,
      table.attribution_type,
      table.attribution_member_id,
    ),
    unique("learning_course_material_representation_unique").on(table.course_id, table.representation_revision_id),
    check(
      "learning_course_material_adoption_closed",
      sql`(${table.target_kind} = 'artifact' AND ${table.artifact_id} IS NOT NULL
          AND ${table.artifact_revision_id} IS NOT NULL AND ${table.attribution_type} IN ('recorded', 'lineage_correction')
          AND ((${table.attribution_type} = 'recorded' AND ${table.attribution_member_id} IS NULL)
            OR (${table.attribution_type} = 'lineage_correction' AND ${table.attribution_member_id} IS NOT NULL))
          AND ${table.representation_revision_id} IS NULL)
        OR (${table.target_kind} = 'representation' AND ${table.artifact_id} IS NULL
          AND ${table.artifact_revision_id} IS NULL AND ${table.attribution_type} IS NULL
          AND ${table.attribution_member_id} IS NULL AND ${table.representation_revision_id} IS NOT NULL)`,
    ),
    check(
      "learning_course_material_adoption_identity",
      sql`length(${table.id}) = 30 AND substr(${table.id}, 1, 4) = 'lba_' AND ${table.time_created} >= 0`,
    ),
    index("learning_course_material_course_idx").on(table.course_id, table.time_created, table.id),
  ],
)

export const LearningBootstrapCourseResultTable = sqliteTable(
  "learning_bootstrap_course_result",
  {
    effect_id: text().$type<EffectID>().primaryKey(),
    course_id: text().$type<Course.CourseID>().notNull(),
    outcome: text().$type<"created" | "corrected" | "no_change">().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearningBootstrapEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
  ],
)

export const LearningBootstrapRouteResultTable = sqliteTable(
  "learning_bootstrap_route_result",
  {
    effect_id: text().$type<EffectID>().primaryKey(),
    view_id: text().$type<Course.ViewID>().notNull(),
    revision_id: text().$type<Course.RevisionID>().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearningBootstrapEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.view_id], foreignColumns: [CourseViewTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.revision_id], foreignColumns: [CourseViewRevisionTable.id] }).onDelete("restrict"),
  ],
)

export const LearningBootstrapSelectionResultTable = sqliteTable(
  "learning_bootstrap_selection_result",
  {
    effect_id: text().$type<EffectID>().primaryKey(),
    outcome: text().$type<"changed" | "no_change">().notNull(),
    selected_revision_id: text().$type<Course.RevisionID>(),
    selection_version: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearningBootstrapEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.selected_revision_id], foreignColumns: [CourseViewRevisionTable.id] }).onDelete(
      "restrict",
    ),
    check("learning_bootstrap_selection_result_version", sql`${table.selection_version} >= 0`),
  ],
)

export const LearningBootstrapMaterialResultTable = sqliteTable(
  "learning_bootstrap_material_result",
  {
    effect_id: text().$type<EffectID>().notNull(),
    ordinal: integer().notNull(),
    local_key: text().notNull(),
    adoption_id: text().$type<AdoptionID>().notNull(),
    outcome: text().$type<"changed" | "no_change">().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.effect_id, table.ordinal] }),
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearningBootstrapEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.adoption_id], foreignColumns: [LearningCourseMaterialAdoptionTable.id] }).onDelete(
      "restrict",
    ),
    unique("learning_bootstrap_material_key_unique").on(table.effect_id, table.local_key),
  ],
)

export const LearningBootstrapMapResultTable = sqliteTable(
  "learning_bootstrap_map_result",
  {
    effect_id: text().$type<EffectID>().notNull(),
    local_key: text().notNull(),
    map_id: text().$type<MaterialMap.MapID>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.effect_id, table.local_key] }),
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearningBootstrapEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.map_id], foreignColumns: [MaterialMapTable.id] }).onDelete("restrict"),
    unique("learning_bootstrap_map_identity_unique").on(table.map_id),
  ],
)

export const LearningBootstrapAlignmentResultTable = sqliteTable(
  "learning_bootstrap_alignment_result",
  {
    effect_id: text().$type<EffectID>().notNull(),
    local_key: text().notNull(),
    alignment_id: text().$type<MaterialMap.AlignmentID>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.effect_id, table.local_key] }),
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearningBootstrapEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.alignment_id], foreignColumns: [MaterialCourseAlignmentTable.id] }).onDelete(
      "restrict",
    ),
    unique("learning_bootstrap_alignment_identity_unique").on(table.alignment_id),
  ],
)

export const LearningBootstrapAnchorResultTable = sqliteTable(
  "learning_bootstrap_anchor_result",
  {
    effect_id: text().$type<EffectID>().primaryKey(),
    outcome: text().$type<"changed" | "no_change">().notNull(),
    anchor_effect_id: text().$type<LearnerNavigation.AnchorEffectID>(),
  },
  (table) => [
    foreignKey({ columns: [table.effect_id], foreignColumns: [LearningBootstrapEffectTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.anchor_effect_id], foreignColumns: [CourseRouteAnchorTransitionTable.id] }).onDelete(
      "restrict",
    ),
    check(
      "learning_bootstrap_anchor_result_closed",
      sql`(${table.outcome} = 'changed' AND ${table.anchor_effect_id} IS NOT NULL)
        OR (${table.outcome} = 'no_change' AND ${table.anchor_effect_id} IS NULL)`,
    ),
  ],
)
