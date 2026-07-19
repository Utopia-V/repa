import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Turn } from "@opencode-ai/schema/turn"
import type { SelectionAcceptanceEffectID } from "../course"
import { CourseSelectionAcceptanceEffectTable } from "../course/sql"
import { RepresentationSchema } from "../representation/schema"
import { RepresentationEffectTable } from "../representation/sql"
import type { AnchorEffectID, DefaultConfirmationSnapshot, DefaultEffectID } from "../learner-navigation/schema"
import { CourseRouteAnchorTransitionTable, DefaultCoursePreferenceTransitionTable } from "../learner-navigation/sql"
import type { MessageID, PartID } from "../v1/session"
import type { PermissionV1 } from "../v1/permission"
import { SessionSchema } from "../session/schema"
import type { OccurrenceID } from "./occurrence-schema"
import { AdmittedLearnerOccurrenceTable } from "./occurrence.sql"
import type { AuthorizationBasis, ReceiptID, Settlement } from "./schema"

export const LearningCommandInvocationTable = sqliteTable(
  "learning_command_invocation",
  {
    part_id: text().$type<PartID>().primaryKey(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    parent_user_message_id: text().$type<MessageID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    provider_call_id: text().notNull(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    command_name: text()
      .$type<
        | "accept_course_view_revision"
        | "representation.convert"
        | "set_default_course_preference"
        | "set_course_route_anchor"
      >()
      .notNull(),
    command_version: integer().notNull(),
    emission_ordinal: integer().notNull(),
    capability_identity: text().notNull(),
    capability_version: integer().notNull(),
    authorization_basis: text().$type<AuthorizationBasis>().notNull(),
    input_fingerprint: text().notNull(),
    status: text().$type<"admitted" | "applied" | "already_applied" | "no_change" | "error">().notNull(),
    effect_id: text().$type<SelectionAcceptanceEffectID>(),
    representation_effect_id: text().$type<RepresentationSchema.EffectID>(),
    default_navigation_effect_id: text().$type<DefaultEffectID>(),
    anchor_navigation_effect_id: text().$type<AnchorEffectID>(),
    permission_request_id: text().$type<PermissionV1.ID>(),
    settlement: text({ mode: "json" }).$type<Settlement>(),
    time_admitted: integer().notNull(),
    time_settled: integer(),
    settlement_order: integer(),
    // Gate 8 rows migrate without fabricated Turns. New writes always fill both;
    // no FK is intentional because applied domain receipts outlive transcript deletion.
    turn_id: text().$type<Turn.ID>(),
    input_id: text().$type<Turn.InputID>(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.effect_id], foreignColumns: [CourseSelectionAcceptanceEffectTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.representation_effect_id], foreignColumns: [RepresentationEffectTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.default_navigation_effect_id],
      foreignColumns: [DefaultCoursePreferenceTransitionTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.anchor_navigation_effect_id],
      foreignColumns: [CourseRouteAnchorTransitionTable.id],
    }).onDelete("restrict"),
    unique("learning_command_invocation_assistant_call_unique").on(table.assistant_message_id, table.provider_call_id),
    unique("learning_command_invocation_assistant_ordinal_unique").on(
      table.assistant_message_id,
      table.emission_ordinal,
    ),
    check("learning_command_invocation_call_nonempty", sql`length(${table.provider_call_id}) > 0`),
    check(
      "learning_command_invocation_command",
      sql`${table.command_name} IN ('accept_course_view_revision', 'representation.convert', 'set_default_course_preference', 'set_course_route_anchor')`,
    ),
    check("learning_command_invocation_command_version", sql`${table.command_version} = 1`),
    check("learning_command_invocation_emission_ordinal", sql`${table.emission_ordinal} >= 0`),
    check("learning_command_invocation_capability", sql`length(${table.capability_identity}) > 0`),
    check("learning_command_invocation_capability_version", sql`${table.capability_version} >= 1`),
    check(
      "learning_command_invocation_capability_match",
      sql`(${table.command_name} = 'accept_course_view_revision' AND ${table.capability_identity} = 'accept_course_view_revision' AND ${table.capability_version} = 1) OR (${table.command_name} = 'representation.convert' AND ${table.capability_identity} = 'representation.convert' AND ${table.capability_version} = 1) OR (${table.command_name} = 'set_default_course_preference' AND ${table.capability_identity} = 'set_default_course_preference' AND ${table.capability_version} = 1) OR (${table.command_name} = 'set_course_route_anchor' AND ${table.capability_identity} = 'set_course_route_anchor' AND ${table.capability_version} = 1)`,
    ),
    check(
      "learning_command_invocation_authorization_basis",
      sql`${table.authorization_basis} IN ('learner_request', 'learner_acceptance')`,
    ),
    check(
      "learning_command_invocation_navigation_basis",
      sql`(${table.command_name} = 'set_default_course_preference' AND ${table.authorization_basis} = 'learner_acceptance') OR (${table.command_name} = 'set_course_route_anchor' AND ${table.authorization_basis} = 'learner_request') OR ${table.command_name} NOT IN ('set_default_course_preference', 'set_course_route_anchor')`,
    ),
    check("learning_command_invocation_fingerprint", sql`length(${table.input_fingerprint}) = 64`),
    check(
      "learning_command_invocation_status",
      sql`${table.status} IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')`,
    ),
    check(
      "learning_command_invocation_permission_shape",
      sql`(${table.command_name} = 'set_default_course_preference' AND ${table.permission_request_id} IS NOT NULL AND length(${table.permission_request_id}) > 0) OR (${table.command_name} <> 'set_default_course_preference' AND ${table.permission_request_id} IS NULL)`,
    ),
    check(
      "learning_command_invocation_settlement_shape",
      sql`(${table.status} = 'admitted' AND ${table.settlement} IS NULL AND ${table.time_settled} IS NULL AND ${table.settlement_order} IS NULL AND ${table.effect_id} IS NULL AND ${table.representation_effect_id} IS NULL AND ${table.default_navigation_effect_id} IS NULL AND ${table.anchor_navigation_effect_id} IS NULL) OR (${table.status} <> 'admitted' AND ${table.settlement} IS NOT NULL AND ${table.time_settled} IS NOT NULL AND ${table.settlement_order} IS NOT NULL)`,
    ),
    check(
      "learning_command_invocation_effect_shape",
      sql`(${table.status} IN ('applied', 'already_applied') AND ((${table.command_name} = 'accept_course_view_revision' AND ${table.effect_id} IS NOT NULL AND ${table.representation_effect_id} IS NULL AND ${table.default_navigation_effect_id} IS NULL AND ${table.anchor_navigation_effect_id} IS NULL) OR (${table.command_name} = 'representation.convert' AND ${table.effect_id} IS NULL AND ${table.representation_effect_id} IS NOT NULL AND ${table.default_navigation_effect_id} IS NULL AND ${table.anchor_navigation_effect_id} IS NULL) OR (${table.command_name} = 'set_default_course_preference' AND ${table.effect_id} IS NULL AND ${table.representation_effect_id} IS NULL AND ${table.default_navigation_effect_id} IS NOT NULL AND ${table.anchor_navigation_effect_id} IS NULL) OR (${table.command_name} = 'set_course_route_anchor' AND ${table.effect_id} IS NULL AND ${table.representation_effect_id} IS NULL AND ${table.default_navigation_effect_id} IS NULL AND ${table.anchor_navigation_effect_id} IS NOT NULL))) OR (${table.status} IN ('admitted', 'no_change', 'error') AND ${table.effect_id} IS NULL AND ${table.representation_effect_id} IS NULL AND ${table.default_navigation_effect_id} IS NULL AND ${table.anchor_navigation_effect_id} IS NULL)`,
    ),
    check(
      "learning_command_invocation_time_order",
      sql`${table.time_admitted} >= 0 AND (${table.time_settled} IS NULL OR ${table.time_settled} >= ${table.time_admitted}) AND (${table.settlement_order} IS NULL OR ${table.settlement_order} >= 0)`,
    ),
    uniqueIndex("learning_command_invocation_one_mutation_idx")
      .on(table.assistant_message_id)
      .where(sql`${table.status} = 'applied'`),
    index("learning_command_invocation_session_owner_idx").on(
      table.session_id,
      table.assistant_message_id,
      table.part_id,
    ),
    index("learning_command_invocation_occurrence_idx").on(table.occurrence_id, table.part_id),
    index("learning_command_invocation_admitted_idx").on(table.status, table.session_id, table.time_admitted),
  ],
)

export const LearningCommandReceiptTable = sqliteTable(
  "learning_command_receipt",
  {
    id: text().$type<ReceiptID>().primaryKey(),
    occurrence_id: text().$type<OccurrenceID>().notNull(),
    origin_session_id: text().$type<SessionSchema.ID>().notNull(),
    origin_message_id: text().$type<MessageID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    invocation_part_id: text().$type<PartID>().notNull(),
    capability_identity: text().notNull(),
    capability_version: integer().notNull(),
    authorization_basis: text().$type<AuthorizationBasis>().notNull(),
    effect_id: text().$type<SelectionAcceptanceEffectID>(),
    representation_effect_id: text().$type<RepresentationSchema.EffectID>(),
    default_navigation_effect_id: text().$type<DefaultEffectID>(),
    anchor_navigation_effect_id: text().$type<AnchorEffectID>(),
    permission_request_id: text().$type<PermissionV1.ID>(),
    confirmation_snapshot: text({ mode: "json" }).$type<DefaultConfirmationSnapshot>(),
    time_committed: integer().notNull(),
    commit_order: integer().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.occurrence_id], foreignColumns: [AdmittedLearnerOccurrenceTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.invocation_part_id],
      foreignColumns: [LearningCommandInvocationTable.part_id],
    }).onDelete("restrict"),
    foreignKey({ columns: [table.effect_id], foreignColumns: [CourseSelectionAcceptanceEffectTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ columns: [table.representation_effect_id], foreignColumns: [RepresentationEffectTable.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      columns: [table.default_navigation_effect_id],
      foreignColumns: [DefaultCoursePreferenceTransitionTable.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.anchor_navigation_effect_id],
      foreignColumns: [CourseRouteAnchorTransitionTable.id],
    }).onDelete("restrict"),
    unique("learning_command_receipt_effect_unique").on(table.effect_id),
    unique("learning_command_receipt_representation_effect_unique").on(table.representation_effect_id),
    unique("learning_command_receipt_default_navigation_effect_unique").on(table.default_navigation_effect_id),
    unique("learning_command_receipt_anchor_navigation_effect_unique").on(table.anchor_navigation_effect_id),
    unique("learning_command_receipt_invocation_unique").on(table.invocation_part_id),
    check("learning_command_receipt_capability", sql`length(${table.capability_identity}) > 0`),
    check("learning_command_receipt_capability_version", sql`${table.capability_version} >= 1`),
    check(
      "learning_command_receipt_authorization_basis",
      sql`${table.authorization_basis} IN ('learner_request', 'learner_acceptance')`,
    ),
    check(
      "learning_command_receipt_navigation_basis",
      sql`(${table.capability_identity} = 'set_default_course_preference' AND ${table.authorization_basis} = 'learner_acceptance') OR (${table.capability_identity} = 'set_course_route_anchor' AND ${table.authorization_basis} = 'learner_request') OR ${table.capability_identity} NOT IN ('set_default_course_preference', 'set_course_route_anchor')`,
    ),
    check(
      "learning_command_receipt_effect_shape",
      sql`(${table.capability_identity} = 'accept_course_view_revision' AND ${table.capability_version} = 1 AND ${table.effect_id} IS NOT NULL AND ${table.representation_effect_id} IS NULL AND ${table.default_navigation_effect_id} IS NULL AND ${table.anchor_navigation_effect_id} IS NULL AND ${table.permission_request_id} IS NULL AND ${table.confirmation_snapshot} IS NULL) OR (${table.capability_identity} = 'representation.convert' AND ${table.capability_version} = 1 AND ${table.effect_id} IS NULL AND ${table.representation_effect_id} IS NOT NULL AND ${table.default_navigation_effect_id} IS NULL AND ${table.anchor_navigation_effect_id} IS NULL AND ${table.permission_request_id} IS NULL AND ${table.confirmation_snapshot} IS NULL) OR (${table.capability_identity} = 'set_default_course_preference' AND ${table.capability_version} = 1 AND ${table.effect_id} IS NULL AND ${table.representation_effect_id} IS NULL AND ${table.default_navigation_effect_id} IS NOT NULL AND ${table.anchor_navigation_effect_id} IS NULL AND ${table.permission_request_id} IS NOT NULL AND ${table.confirmation_snapshot} IS NOT NULL AND json_valid(${table.confirmation_snapshot})) OR (${table.capability_identity} = 'set_course_route_anchor' AND ${table.capability_version} = 1 AND ${table.effect_id} IS NULL AND ${table.representation_effect_id} IS NULL AND ${table.default_navigation_effect_id} IS NULL AND ${table.anchor_navigation_effect_id} IS NOT NULL AND ${table.permission_request_id} IS NULL AND ${table.confirmation_snapshot} IS NULL)`,
    ),
    check("learning_command_receipt_time_order", sql`${table.time_committed} >= 0 AND ${table.commit_order} >= 0`),
    index("learning_command_receipt_occurrence_idx").on(table.occurrence_id, table.id),
  ],
)
