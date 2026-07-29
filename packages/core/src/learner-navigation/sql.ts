import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core"
import type { PermissionV1 } from "../v1/permission"
import type { Course } from "../course"
import type { Turn } from "@opencode-ai/schema/turn"
import { CourseTable, CourseViewRevisionItemTable, CourseViewRevisionTable, CourseViewTable } from "../course/sql"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import type { ReceiptID } from "../learning-command/physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import type { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"
import { TurnCandidatePresentationTable, TurnToolCandidateTable } from "../turn/sql"
import type {
  AnchorEffectID,
  DefaultConfirmationSnapshot,
  DefaultCourseAcknowledgement,
  DefaultCourseCapabilityOutcome,
  DefaultCourseCommand,
  DefaultCourseDispositionKind,
  DefaultCourseEndpoint,
  DefaultCourseEndpointV2,
  DefaultCourseOperation,
  DefaultCourseResolutionScope,
  DefaultCourseSemanticAddress,
  DefaultEffectID,
} from "./schema"

function defaultCourseEndpointV1Shape(column: AnySQLiteColumn) {
  return sql`(
    (
      json_extract(${column}, '$.kind') = 'absent'
      AND json_type(${column}, '$.locator') IS NULL
    )
    OR
    (
      json_extract(${column}, '$.kind') = 'course'
      AND json_type(${column}, '$.locator') = 'object'
      AND json_type(${column}, '$.locator.courseID') = 'text'
      AND json_extract(${column}, '$.locator.title.availability') IN ('recorded_v1', 'not_recorded_v1')
      AND json_extract(${column}, '$.locator.courseVersion.availability') IN ('recorded_v1', 'not_recorded_v1')
      AND json_extract(${column}, '$.locator.workingSelection.availability') IN ('recorded_v1', 'not_recorded_v1')
    )
  )`
}

function defaultCourseEndpointV2Shape(column: AnySQLiteColumn) {
  return sql`(
    (
      json_extract(${column}, '$.kind') = 'absent'
      AND json_type(${column}, '$.locator') IS NULL
    )
    OR
    (
      json_extract(${column}, '$.kind') = 'course'
      AND json_type(${column}, '$.locator') = 'object'
      AND json_type(${column}, '$.locator.courseID') = 'text'
      AND json_extract(${column}, '$.locator.title.availability') = 'recorded_v2'
      AND json_extract(${column}, '$.locator.courseVersion.availability') = 'recorded_v2'
      AND json_extract(${column}, '$.locator.workingSelection.availability') = 'recorded_v2'
    )
  )`
}

export const LearnerDefaultCourseProposalTable = sqliteTable(
  "learner_default_course_proposal",
  {
    part_id: text().$type<PartID>().primaryKey(),
    turn_id: text().$type<Turn.ID>().notNull(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    call_id: text().notNull(),
    emission_ordinal: integer().notNull(),
    command_snapshot: text({ mode: "json" }).$type<DefaultCourseCommand>().notNull(),
    command_fingerprint: text().notNull(),
    resolution_scope: text({ mode: "json" }).$type<DefaultCourseResolutionScope>().notNull(),
    resolution_fingerprint: text().notNull(),
    preference_head_id: text().$type<DefaultEffectID>(),
    preference_version: integer().notNull(),
    operation: text().$type<DefaultCourseOperation>().notNull(),
    from_locator: text({ mode: "json" }).$type<DefaultCourseEndpointV2>().notNull(),
    to_locator: text({ mode: "json" }).$type<DefaultCourseEndpointV2>().notNull(),
    proposal_fingerprint: text().notNull(),
    terminal_part_fingerprint: text().notNull(),
    time_presented: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.turn_id, table.part_id, table.assistant_message_id],
      foreignColumns: [
        TurnToolCandidateTable.turn_id,
        TurnToolCandidateTable.part_id,
        TurnToolCandidateTable.assistant_message_id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.part_id],
      foreignColumns: [TurnCandidatePresentationTable.part_id],
    }).onDelete("restrict"),
    unique("learner_default_course_proposal_assistant_emission_unique").on(
      table.assistant_message_id,
      table.emission_ordinal,
    ),
    check(
      "learner_default_course_proposal_fingerprints",
      sql`length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*' AND length(${table.resolution_fingerprint}) = 64 AND ${table.resolution_fingerprint} NOT GLOB '*[^0-9a-f]*' AND length(${table.proposal_fingerprint}) = 64 AND ${table.proposal_fingerprint} NOT GLOB '*[^0-9a-f]*' AND length(${table.terminal_part_fingerprint}) = 64 AND ${table.terminal_part_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "learner_default_course_proposal_json",
      sql`json_valid(${table.command_snapshot}) AND json_valid(${table.resolution_scope}) AND json_valid(${table.from_locator}) AND json_valid(${table.to_locator}) AND ${defaultCourseEndpointV2Shape(table.from_locator)} AND ${defaultCourseEndpointV2Shape(table.to_locator)}`,
    ),
    check(
      "learner_default_course_proposal_head",
      sql`(${table.preference_version} = 0 AND ${table.preference_head_id} IS NULL) OR (${table.preference_version} > 0 AND ${table.preference_head_id} IS NOT NULL)`,
    ),
    check("learner_default_course_proposal_operation", sql`${table.operation} IN ('set', 'change', 'clear')`),
    check(
      "learner_default_course_proposal_time_order",
      sql`${table.emission_ordinal} >= 0 AND ${table.time_presented} >= 0`,
    ),
  ],
)

export const LearnerDefaultCourseDispositionTable = sqliteTable(
  "learner_default_course_disposition",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    disposition: text().$type<DefaultCourseDispositionKind>().notNull(),
    authorization_version: integer().$type<1 | 2>(),
    authorization_kind: text().$type<"legacy_v1" | "direct_request_v2" | "accepted_proposal_v2">(),
    authorization_fingerprint: text(),
    command_fingerprint: text().notNull(),
    semantic_outcome: text().$type<"already_applied" | "semantic_conflict">(),
    semantic_address: text({ mode: "json" }).$type<DefaultCourseSemanticAddress>(),
    semantic_address_fingerprint: text(),
    incoming_payload_fingerprint: text(),
    existing_effect_id: text().$type<DefaultEffectID>(),
    existing_payload_fingerprint: text(),
    legacy_row_class: text().$type<"admitted" | "applied" | "already_applied" | "no_change" | "error">(),
    confirmation_availability: text().$type<"recorded_v1" | "not_recorded_v1">(),
    command_permission_request_id: text().$type<PermissionV1.ID>(),
    effect_confirmation_request_id: text().$type<PermissionV1.ID>(),
    legacy_effect_id: text().$type<DefaultEffectID>(),
    legacy_receipt_id: text().$type<ReceiptID>(),
    command_snapshot: text({ mode: "json" }).$type<DefaultCourseCommand>(),
    source_excerpt: text(),
    resolution_scope: text({ mode: "json" }).$type<DefaultCourseResolutionScope>(),
    resolution_fingerprint: text(),
    preference_head_id: text().$type<DefaultEffectID>(),
    preference_version: integer(),
    operation: text().$type<DefaultCourseOperation>(),
    from_locator: text({ mode: "json" }).$type<DefaultCourseEndpointV2>(),
    to_locator: text({ mode: "json" }).$type<DefaultCourseEndpointV2>(),
    selected_course_id: text().$type<Course.CourseID>(),
    proposal_part_id: text().$type<PartID>(),
    proposal_presentation_part_id: text().$type<PartID>(),
    proposal_presentation_assistant_message_id: text().$type<MessageID>(),
    proposal_assistant_message_id: text().$type<MessageID>(),
    proposal_emission_ordinal: integer(),
    proposal_fingerprint: text(),
    proposal_selection: text().$type<"sole_presented" | "explicit_reference">(),
    time_disposed: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.proposal_part_id],
      foreignColumns: [LearnerDefaultCourseProposalTable.part_id],
    }).onDelete("restrict"),
    check(
      "learner_default_course_disposition_fingerprints",
      sql`(${table.authorization_fingerprint} IS NULL OR (length(${table.authorization_fingerprint}) = 64 AND ${table.authorization_fingerprint} NOT GLOB '*[^0-9a-f]*')) AND length(${table.command_fingerprint}) = 64 AND ${table.command_fingerprint} NOT GLOB '*[^0-9a-f]*' AND (${table.semantic_address_fingerprint} IS NULL OR (length(${table.semantic_address_fingerprint}) = 64 AND ${table.semantic_address_fingerprint} NOT GLOB '*[^0-9a-f]*')) AND (${table.incoming_payload_fingerprint} IS NULL OR (length(${table.incoming_payload_fingerprint}) = 64 AND ${table.incoming_payload_fingerprint} NOT GLOB '*[^0-9a-f]*')) AND (${table.existing_payload_fingerprint} IS NULL OR (length(${table.existing_payload_fingerprint}) = 64 AND ${table.existing_payload_fingerprint} NOT GLOB '*[^0-9a-f]*')) AND (${table.resolution_fingerprint} IS NULL OR (length(${table.resolution_fingerprint}) = 64 AND ${table.resolution_fingerprint} NOT GLOB '*[^0-9a-f]*')) AND (${table.proposal_fingerprint} IS NULL OR (length(${table.proposal_fingerprint}) = 64 AND ${table.proposal_fingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
    check(
      "learner_default_course_disposition_closed_union",
      sql`(
        ${table.disposition} = 'legacy_v1'
        AND ${table.authorization_version} = 1
        AND ${table.authorization_kind} = 'legacy_v1'
        AND ${table.authorization_fingerprint} IS NOT NULL
        AND ${table.semantic_outcome} IS NULL
        AND ${table.semantic_address} IS NULL
        AND ${table.semantic_address_fingerprint} IS NULL
        AND ${table.incoming_payload_fingerprint} IS NULL
        AND ${table.existing_effect_id} IS NULL
        AND ${table.existing_payload_fingerprint} IS NULL
        AND ${table.legacy_row_class} IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')
        AND ${table.command_permission_request_id} IS NOT NULL
        AND length(${table.command_permission_request_id}) > 0
        AND ${table.command_snapshot} IS NULL
        AND ${table.source_excerpt} IS NULL
        AND ${table.resolution_scope} IS NULL
        AND ${table.resolution_fingerprint} IS NULL
        AND ${table.preference_head_id} IS NULL
        AND ${table.preference_version} IS NULL
        AND ${table.operation} IS NULL
        AND ${table.from_locator} IS NULL
        AND ${table.to_locator} IS NULL
        AND ${table.selected_course_id} IS NULL
        AND ${table.proposal_part_id} IS NULL
        AND ${table.proposal_presentation_part_id} IS NULL
        AND ${table.proposal_presentation_assistant_message_id} IS NULL
        AND ${table.proposal_assistant_message_id} IS NULL
        AND ${table.proposal_emission_ordinal} IS NULL
        AND ${table.proposal_fingerprint} IS NULL
        AND ${table.proposal_selection} IS NULL
        AND (
          (
            ${table.legacy_row_class} IN ('applied', 'already_applied')
            AND ${table.confirmation_availability} = 'recorded_v1'
            AND ${table.effect_confirmation_request_id} IS NOT NULL
            AND ${table.legacy_effect_id} IS NOT NULL
            AND ${table.legacy_receipt_id} IS NOT NULL
          )
          OR
          (
            ${table.legacy_row_class} IN ('admitted', 'no_change', 'error')
            AND ${table.confirmation_availability} = 'not_recorded_v1'
            AND ${table.effect_confirmation_request_id} IS NULL
            AND ${table.legacy_effect_id} IS NULL
            AND ${table.legacy_receipt_id} IS NULL
          )
        )
      ) OR (
        ${table.disposition} = 'semantic_terminal_v2'
        AND ${table.authorization_version} IS NULL
        AND ${table.authorization_kind} IS NULL
        AND ${table.authorization_fingerprint} IS NULL
        AND ${table.semantic_outcome} IN ('already_applied', 'semantic_conflict')
        AND json_valid(${table.command_snapshot})
        AND json_valid(${table.semantic_address})
        AND json_extract(${table.semantic_address}, '$.slot') = 'default_course_preference'
        AND ${table.semantic_address_fingerprint} IS NOT NULL
        AND ${table.incoming_payload_fingerprint} IS NOT NULL
        AND ${table.existing_effect_id} IS NOT NULL
        AND ${table.existing_payload_fingerprint} IS NOT NULL
        AND ${table.legacy_row_class} IS NULL
        AND ${table.confirmation_availability} IS NULL
        AND ${table.command_permission_request_id} IS NULL
        AND ${table.effect_confirmation_request_id} IS NULL
        AND ${table.legacy_effect_id} IS NULL
        AND ${table.legacy_receipt_id} IS NULL
        AND ${table.source_excerpt} IS NULL
        AND ${table.resolution_scope} IS NULL
        AND ${table.resolution_fingerprint} IS NULL
        AND ${table.preference_head_id} IS NULL
        AND ${table.preference_version} IS NULL
        AND ${table.operation} IS NULL
        AND ${table.from_locator} IS NULL
        AND ${table.to_locator} IS NULL
        AND ${table.selected_course_id} IS NULL
        AND ${table.proposal_part_id} IS NULL
        AND ${table.proposal_presentation_part_id} IS NULL
        AND ${table.proposal_presentation_assistant_message_id} IS NULL
        AND ${table.proposal_assistant_message_id} IS NULL
        AND ${table.proposal_emission_ordinal} IS NULL
        AND ${table.proposal_fingerprint} IS NULL
        AND ${table.proposal_selection} IS NULL
      ) OR (
        ${table.disposition} = 'candidate_v2'
        AND ${table.authorization_version} = 2
        AND ${table.authorization_kind} IN ('direct_request_v2', 'accepted_proposal_v2')
        AND ${table.authorization_fingerprint} IS NOT NULL
        AND ${table.semantic_outcome} IS NULL
        AND ${table.semantic_address} IS NULL
        AND ${table.semantic_address_fingerprint} IS NULL
        AND ${table.incoming_payload_fingerprint} IS NULL
        AND ${table.existing_effect_id} IS NULL
        AND ${table.existing_payload_fingerprint} IS NULL
        AND ${table.legacy_row_class} IS NULL
        AND ${table.confirmation_availability} IS NULL
        AND ${table.command_permission_request_id} IS NULL
        AND ${table.effect_confirmation_request_id} IS NULL
        AND ${table.legacy_effect_id} IS NULL
        AND ${table.legacy_receipt_id} IS NULL
        AND json_valid(${table.command_snapshot})
        AND length(${table.source_excerpt}) > 0
        AND json_valid(${table.resolution_scope})
        AND ${table.resolution_fingerprint} IS NOT NULL
        AND ${table.preference_version} IS NOT NULL
        AND ((${table.preference_version} = 0 AND ${table.preference_head_id} IS NULL)
          OR (${table.preference_version} > 0 AND ${table.preference_head_id} IS NOT NULL))
        AND ${table.operation} IN ('set', 'change', 'clear')
        AND json_valid(${table.from_locator})
        AND json_valid(${table.to_locator})
        AND ${defaultCourseEndpointV2Shape(table.from_locator)}
        AND ${defaultCourseEndpointV2Shape(table.to_locator)}
        AND (
          (
            ${table.authorization_kind} = 'direct_request_v2'
            AND json_extract(${table.resolution_scope}, '$.coverage') = 'complete'
            AND ${table.proposal_part_id} IS NULL
            AND ${table.proposal_presentation_part_id} IS NULL
            AND ${table.proposal_presentation_assistant_message_id} IS NULL
            AND ${table.proposal_assistant_message_id} IS NULL
            AND ${table.proposal_emission_ordinal} IS NULL
            AND ${table.proposal_fingerprint} IS NULL
            AND ${table.proposal_selection} IS NULL
          )
          OR
          (
            ${table.authorization_kind} = 'accepted_proposal_v2'
            AND ${table.proposal_part_id} IS NOT NULL
            AND ${table.proposal_presentation_part_id} IS NOT NULL
            AND ${table.proposal_presentation_assistant_message_id} IS NOT NULL
            AND ${table.proposal_assistant_message_id} IS NOT NULL
            AND ${table.proposal_emission_ordinal} IS NOT NULL
            AND ${table.proposal_emission_ordinal} >= 0
            AND ${table.proposal_fingerprint} IS NOT NULL
            AND ${table.proposal_selection} IN ('sole_presented', 'explicit_reference')
          )
        )
      )`,
    ),
    check("learner_default_course_disposition_time", sql`${table.time_disposed} >= 0`),
  ],
)

export const LearnerDefaultCourseCapabilityIssueTable = sqliteTable(
  "learner_default_course_capability_issue",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    permission_request_id: text().$type<PermissionV1.ID>().notNull().unique(),
    authorization_fingerprint: text().notNull(),
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
      foreignColumns: [LearnerDefaultCourseDispositionTable.invocation_part_id],
    }).onDelete("restrict"),
    unique("learner_default_course_capability_issue_invocation_request_unique").on(
      table.invocation_part_id,
      table.permission_request_id,
    ),
    check(
      "learner_default_course_capability_issue_fingerprints",
      sql`length(${table.authorization_fingerprint}) = 64 AND ${table.authorization_fingerprint} NOT GLOB '*[^0-9a-f]*' AND length(${table.policy_fingerprint}) = 64 AND ${table.policy_fingerprint} NOT GLOB '*[^0-9a-f]*' AND length(${table.shown_scope_fingerprint}) = 64 AND ${table.shown_scope_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "learner_default_course_capability_issue_shape",
      sql`length(${table.permission_request_id}) > 0 AND json_valid(${table.policy_basis}) AND json_valid(${table.shown_scope}) AND ${table.time_issued} >= 0 AND ${table.issue_order} >= 0`,
    ),
  ],
)

export const LearnerDefaultCourseCapabilitySettlementTable = sqliteTable(
  "learner_default_course_capability_settlement",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    outcome: text().$type<DefaultCourseCapabilityOutcome>().notNull(),
    permission_request_id: text().$type<PermissionV1.ID>(),
    authorization_fingerprint: text().notNull(),
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
      foreignColumns: [LearnerDefaultCourseDispositionTable.invocation_part_id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.invocation_part_id, table.permission_request_id],
      foreignColumns: [
        LearnerDefaultCourseCapabilityIssueTable.invocation_part_id,
        LearnerDefaultCourseCapabilityIssueTable.permission_request_id,
      ],
    }).onDelete("restrict"),
    check(
      "learner_default_course_capability_settlement_fingerprints",
      sql`length(${table.authorization_fingerprint}) = 64 AND ${table.authorization_fingerprint} NOT GLOB '*[^0-9a-f]*' AND (${table.policy_fingerprint} IS NULL OR (length(${table.policy_fingerprint}) = 64 AND ${table.policy_fingerprint} NOT GLOB '*[^0-9a-f]*')) AND (${table.reply_fingerprint} IS NULL OR (length(${table.reply_fingerprint}) = 64 AND ${table.reply_fingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
    check(
      "learner_default_course_capability_settlement_closed_union",
      sql`(
        ${table.outcome} = 'not_evaluated'
        AND ${table.permission_request_id} IS NULL
        AND ${table.policy_basis} IS NULL
        AND ${table.policy_fingerprint} IS NULL
        AND ${table.reply} IS NULL
        AND ${table.reply_fingerprint} IS NULL
      ) OR (
        ${table.outcome} IN ('policy_allow', 'policy_deny')
        AND ${table.permission_request_id} IS NULL
        AND json_valid(${table.policy_basis})
        AND ${table.policy_fingerprint} IS NOT NULL
        AND ${table.reply} IS NULL
        AND ${table.reply_fingerprint} IS NULL
      ) OR (
        ${table.outcome} = 'prompted_abort'
        AND ${table.permission_request_id} IS NOT NULL
        AND ${table.policy_basis} IS NULL
        AND ${table.policy_fingerprint} IS NULL
        AND ${table.reply} IS NULL
        AND ${table.reply_fingerprint} IS NULL
      ) OR (
        ${table.outcome} IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
        AND ${table.permission_request_id} IS NOT NULL
        AND ${table.policy_basis} IS NULL
        AND ${table.policy_fingerprint} IS NULL
        AND json_valid(${table.reply})
        AND ${table.reply_fingerprint} IS NOT NULL
      )`,
    ),
    check(
      "learner_default_course_capability_settlement_time",
      sql`${table.time_settled} >= 0 AND ${table.settlement_order} >= 0`,
    ),
  ],
)

export const LearnerDefaultCourseCommandTable = sqliteTable(
  "learner_default_course_command",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    permission_request_id: text().$type<PermissionV1.ID>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("cascade"),
    check("learner_default_course_command_permission", sql`length(${table.permission_request_id}) > 0`),
  ],
)

export const DefaultCoursePreferenceTransitionTable = sqliteTable(
  "learner_default_course_transition",
  {
    id: text().$type<DefaultEffectID>().primaryKey(),
    version: integer().notNull(),
    predecessor_id: text().$type<DefaultEffectID>(),
    previous_course_id: text().$type<Course.CourseID>(),
    course_id: text().$type<Course.CourseID>(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    authorization_part_id: text().$type<PartID>().notNull(),
    permission_request_id: text().$type<PermissionV1.ID>(),
    confirmation_snapshot: text({ mode: "json" }).$type<DefaultConfirmationSnapshot>(),
    target_course_version: integer(),
    target_selection_revision_id: text().$type<Course.RevisionID>(),
    target_selection_version: integer(),
    target_view_id: text().$type<Course.ViewID>(),
    target_view_version: integer(),
    target_revision_version: integer(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
    frontier_time: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.predecessor_id], foreignColumns: [table.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.previous_course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.target_view_id],
      foreignColumns: [CourseViewTable.course_id, CourseViewTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.target_view_id, table.target_selection_revision_id],
      foreignColumns: [CourseViewRevisionTable.course_id, CourseViewRevisionTable.view_id, CourseViewRevisionTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.authorization_part_id],
      foreignColumns: [LearnerDefaultCourseDispositionTable.invocation_part_id],
    }).onDelete("restrict"),
    unique("learner_default_course_version_unique").on(table.version),
    unique("learner_default_course_predecessor_unique").on(table.predecessor_id),
    unique("learner_default_course_occurrence_unique").on(table.occurrence_id),
    unique("learner_default_course_frontier_unique").on(table.frontier_sequence),
    check(
      "learner_default_course_chain_shape",
      sql`(${table.version} = 1 AND ${table.predecessor_id} IS NULL AND ${table.previous_course_id} IS NULL) OR (${table.version} > 1 AND ${table.predecessor_id} IS NOT NULL)`,
    ),
    check("learner_default_course_value_changed", sql`NOT (${table.course_id} IS ${table.previous_course_id})`),
    check(
      "learner_default_course_target_shape",
      sql`(${table.course_id} IS NULL AND ${table.target_course_version} IS NULL AND ${table.target_selection_revision_id} IS NULL AND ${table.target_selection_version} IS NULL AND ${table.target_view_id} IS NULL AND ${table.target_view_version} IS NULL AND ${table.target_revision_version} IS NULL) OR (${table.course_id} IS NOT NULL AND ${table.target_course_version} IS NOT NULL AND ${table.target_selection_version} IS NOT NULL AND ((${table.target_selection_revision_id} IS NULL AND ${table.target_view_id} IS NULL AND ${table.target_view_version} IS NULL AND ${table.target_revision_version} IS NULL) OR (${table.target_selection_revision_id} IS NOT NULL AND ${table.target_view_id} IS NOT NULL AND ${table.target_view_version} IS NOT NULL AND ${table.target_revision_version} IS NOT NULL)))`,
    ),
    check(
      "learner_default_course_versions",
      sql`${table.version} >= 1 AND (${table.target_course_version} IS NULL OR ${table.target_course_version} >= 0) AND (${table.target_selection_version} IS NULL OR ${table.target_selection_version} >= 0) AND (${table.target_view_version} IS NULL OR ${table.target_view_version} >= 0) AND (${table.target_revision_version} IS NULL OR ${table.target_revision_version} >= 0)`,
    ),
    check(
      "learner_default_course_legacy_confirmation_shape",
      sql`(${table.permission_request_id} IS NULL AND ${table.confirmation_snapshot} IS NULL) OR (${table.permission_request_id} IS NOT NULL AND length(${table.permission_request_id}) > 0 AND json_valid(${table.confirmation_snapshot}))`,
    ),
    check(
      "learner_default_course_time_order",
      sql`${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    index("learner_default_course_history_idx").on(table.version, table.id),
    index("learner_default_course_frontier_idx").on(table.frontier_sequence, table.version),
  ],
)

export const LearnerDefaultCourseCommitSealTable = sqliteTable(
  "learner_default_course_commit_seal",
  {
    effect_id: text().$type<DefaultEffectID>().primaryKey(),
    receipt_id: text().$type<ReceiptID>().notNull(),
    invocation_part_id: text().$type<PartID>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.effect_id],
      foreignColumns: [DefaultCoursePreferenceTransitionTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    unique("learner_default_course_commit_seal_receipt_unique").on(table.receipt_id),
    unique("learner_default_course_commit_seal_invocation_unique").on(table.invocation_part_id),
  ],
)

export const LearnerDefaultCourseAcknowledgementTable = sqliteTable(
  "learner_default_course_acknowledgement",
  {
    invocation_part_id: text().$type<PartID>().primaryKey(),
    effect_authorization_part_id: text().$type<PartID>().notNull(),
    authorization_version: integer().$type<1 | 2>().notNull(),
    effect_id: text().$type<DefaultEffectID>().notNull(),
    receipt_id: text().$type<ReceiptID>().notNull(),
    operation: text().$type<DefaultCourseOperation>().notNull(),
    from_locator: text({ mode: "json" }).$type<DefaultCourseEndpoint>().notNull(),
    to_locator: text({ mode: "json" }).$type<DefaultCourseEndpoint>().notNull(),
    relation: text().$type<"active" | "superseded">().notNull(),
    presentation_snapshot: text({ mode: "json" }).$type<DefaultCourseAcknowledgement>().notNull(),
    presentation_fingerprint: text().notNull(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearnerDefaultCourseDispositionTable.invocation_part_id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.effect_authorization_part_id],
      foreignColumns: [LearnerDefaultCourseDispositionTable.invocation_part_id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.effect_id],
      foreignColumns: [DefaultCoursePreferenceTransitionTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.receipt_id],
      foreignColumns: [LearningCommandReceiptTable.id],
    }).onDelete("restrict"),
    check(
      "learner_default_course_acknowledgement_shape",
      sql`${table.authorization_version} IN (1, 2) AND ${table.operation} IN ('set', 'change', 'clear') AND json_valid(${table.from_locator}) AND json_valid(${table.to_locator}) AND ((${table.authorization_version} = 1 AND ${defaultCourseEndpointV1Shape(table.from_locator)} AND ${defaultCourseEndpointV1Shape(table.to_locator)}) OR (${table.authorization_version} = 2 AND ${defaultCourseEndpointV2Shape(table.from_locator)} AND ${defaultCourseEndpointV2Shape(table.to_locator)})) AND ${table.relation} IN ('active', 'superseded') AND json_valid(${table.presentation_snapshot})`,
    ),
    check(
      "learner_default_course_acknowledgement_fingerprint",
      sql`length(${table.presentation_fingerprint}) = 64 AND ${table.presentation_fingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "learner_default_course_acknowledgement_time",
      sql`${table.time_committed} >= 0 AND ${table.commit_order} >= 0`,
    ),
    index("learner_default_course_acknowledgement_effect_idx").on(table.effect_id, table.invocation_part_id),
  ],
)

export const CourseRouteAnchorTransitionTable = sqliteTable(
  "learner_course_route_anchor_transition",
  {
    id: text().$type<AnchorEffectID>().primaryKey(),
    course_id: text().$type<Course.CourseID>().notNull(),
    version: integer().notNull(),
    predecessor_id: text().$type<AnchorEffectID>(),
    previous_view_id: text().$type<Course.ViewID>(),
    previous_revision_id: text().$type<Course.RevisionID>(),
    previous_item_id: text().$type<Course.ItemID>(),
    target_view_id: text().$type<Course.ViewID>(),
    target_revision_id: text().$type<Course.RevisionID>(),
    target_item_id: text().$type<Course.ItemID>(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    target_course_version: integer(),
    target_selection_version: integer(),
    target_view_version: integer(),
    target_revision_version: integer(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
    frontier_sequence: integer().notNull(),
    frontier_time: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.course_id], foreignColumns: [CourseTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.predecessor_id],
      foreignColumns: [table.course_id, table.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.previous_view_id, table.previous_revision_id, table.previous_item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.course_id, table.target_view_id, table.target_revision_id, table.target_item_id],
      foreignColumns: [
        CourseViewRevisionItemTable.course_id,
        CourseViewRevisionItemTable.view_id,
        CourseViewRevisionItemTable.revision_id,
        CourseViewRevisionItemTable.item_id,
      ],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    unique("learner_course_route_anchor_owner_unique").on(table.course_id, table.id),
    unique("learner_course_route_anchor_version_unique").on(table.course_id, table.version),
    unique("learner_course_route_anchor_predecessor_unique").on(table.course_id, table.predecessor_id),
    unique("learner_course_route_anchor_occurrence_unique").on(table.occurrence_id, table.course_id),
    unique("learner_course_route_anchor_frontier_unique").on(table.frontier_sequence),
    check(
      "learner_course_route_anchor_chain_shape",
      sql`(${table.version} = 1 AND ${table.predecessor_id} IS NULL AND ${table.previous_view_id} IS NULL AND ${table.previous_revision_id} IS NULL AND ${table.previous_item_id} IS NULL) OR (${table.version} > 1 AND ${table.predecessor_id} IS NOT NULL)`,
    ),
    check(
      "learner_course_route_anchor_previous_shape",
      sql`(${table.previous_view_id} IS NULL AND ${table.previous_revision_id} IS NULL AND ${table.previous_item_id} IS NULL) OR (${table.previous_view_id} IS NOT NULL AND ${table.previous_revision_id} IS NOT NULL AND ${table.previous_item_id} IS NOT NULL)`,
    ),
    check(
      "learner_course_route_anchor_target_shape",
      sql`(${table.target_view_id} IS NULL AND ${table.target_revision_id} IS NULL AND ${table.target_item_id} IS NULL AND ${table.target_course_version} IS NULL AND ${table.target_selection_version} IS NULL AND ${table.target_view_version} IS NULL AND ${table.target_revision_version} IS NULL) OR (${table.target_view_id} IS NOT NULL AND ${table.target_revision_id} IS NOT NULL AND ${table.target_item_id} IS NOT NULL AND ${table.target_course_version} IS NOT NULL AND ${table.target_selection_version} IS NOT NULL AND ${table.target_view_version} IS NOT NULL AND ${table.target_revision_version} IS NOT NULL)`,
    ),
    check(
      "learner_course_route_anchor_value_changed",
      sql`NOT (${table.target_view_id} IS ${table.previous_view_id} AND ${table.target_revision_id} IS ${table.previous_revision_id} AND ${table.target_item_id} IS ${table.previous_item_id})`,
    ),
    check(
      "learner_course_route_anchor_versions",
      sql`${table.version} >= 1 AND (${table.target_course_version} IS NULL OR ${table.target_course_version} >= 0) AND (${table.target_selection_version} IS NULL OR ${table.target_selection_version} >= 0) AND (${table.target_view_version} IS NULL OR ${table.target_view_version} >= 0) AND (${table.target_revision_version} IS NULL OR ${table.target_revision_version} >= 0)`,
    ),
    check(
      "learner_course_route_anchor_time_order",
      sql`${table.time_committed} >= 0 AND ${table.commit_order} >= 0 AND ${table.frontier_sequence} >= 1 AND ${table.frontier_time} = ${table.time_committed}`,
    ),
    index("learner_course_route_anchor_history_idx").on(table.course_id, table.version, table.id),
    index("learner_course_route_anchor_frontier_idx").on(table.frontier_sequence, table.course_id, table.version),
  ],
)

export const LearnerCourseRouteAnchorCommitSealTable = sqliteTable(
  "learner_course_route_anchor_commit_seal",
  {
    effect_id: text().$type<AnchorEffectID>().primaryKey(),
    receipt_id: text().$type<ReceiptID>().notNull(),
    invocation_part_id: text().$type<PartID>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.effect_id],
      foreignColumns: [CourseRouteAnchorTransitionTable.id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.receipt_id], foreignColumns: [LearningCommandReceiptTable.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    unique("learner_course_route_anchor_commit_seal_receipt_unique").on(table.receipt_id),
    unique("learner_course_route_anchor_commit_seal_invocation_unique").on(table.invocation_part_id),
  ],
)
