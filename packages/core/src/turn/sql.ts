import { LearningOccurrence } from "@opencode-ai/schema/learning-occurrence"
import { Turn } from "@opencode-ai/schema/turn"
import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import { MessageTable, PartTable, SessionTable } from "../session/sql"
import type { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"
import type { Cut } from "../retained-steering/schema"

type Json = Record<string, unknown>

export const TurnTable = sqliteTable(
  "turn",
  {
    id: text().$type<Turn.ID>().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    admission_kind: text().$type<Turn.AdmissionKind>().notNull(),
    initial_input_id: text().$type<Turn.InputID>().notNull(),
    current_input_id: text().$type<Turn.InputID>().notNull(),
    model_limit: integer().notNull(),
    tool_limit: integer().notNull(),
    model_count: integer().notNull().default(0),
    tool_count: integer().notNull().default(0),
    state: text().$type<Turn.State>().notNull().default("running"),
    depth: integer().notNull(),
    normalized_envelope: text({ mode: "json" }).$type<Json>().notNull(),
    envelope_fingerprint: text().notNull(),
    policy_basis: text({ mode: "json" }).$type<Json>().notNull(),
    time_admitted: integer().notNull(),
    causal_time: integer().notNull(),
    time_terminal: integer(),
    terminal_reason: text().$type<Turn.TerminalReason>(),
    exhaustion_counter: text().$type<Turn.CounterKind>(),
    exhaustion_observed: integer(),
    exhaustion_limit: integer(),
    exhaustion_attempt_id: text(),
    exhaustion_envelope: text({ mode: "json" }).$type<Json>(),
    exhaustion_envelope_fingerprint: text(),
  },
  (table) => [
    unique("turn_id_session_depth_unique").on(table.id, table.session_id, table.depth),
    unique("turn_id_session_unique").on(table.id, table.session_id),
    uniqueIndex("turn_one_running_per_session_idx")
      .on(table.session_id)
      .where(sql`${table.state} = 'running'`),
    index("turn_session_admitted_idx").on(table.session_id, table.time_admitted, table.id),
    check("turn_limits_nonnegative", sql`${table.model_limit} >= 0 AND ${table.tool_limit} >= 0`),
    check(
      "turn_counts_bounded",
      sql`${table.model_count} >= 0 AND ${table.tool_count} >= 0 AND ${table.model_count} <= ${table.model_limit} AND ${table.tool_count} <= ${table.tool_limit}`,
    ),
    check("turn_depth_nonnegative", sql`${table.depth} >= 0`),
    check("turn_fingerprints", sql`length(${table.envelope_fingerprint}) = 64`),
    check(
      "turn_times_nonnegative",
      sql`${table.time_admitted} >= 0 AND ${table.causal_time} >= ${table.time_admitted}`,
    ),
    check(
      "turn_lineage_shape",
      sql`(${table.admission_kind} = 'learner' AND ${table.depth} = 0) OR (${table.admission_kind} = 'delegated_task' AND ${table.depth} > 0)`,
    ),
    check("turn_state", sql`${table.state} IN ('running', 'completed', 'failed', 'interrupted', 'exhausted')`),
    check(
      "turn_terminal_shape",
      sql`(${table.state} = 'running' AND ${table.time_terminal} IS NULL AND ${table.terminal_reason} IS NULL AND ${table.exhaustion_counter} IS NULL AND ${table.exhaustion_observed} IS NULL AND ${table.exhaustion_limit} IS NULL AND ${table.exhaustion_attempt_id} IS NULL AND ${table.exhaustion_envelope} IS NULL AND ${table.exhaustion_envelope_fingerprint} IS NULL) OR (${table.state} = 'completed' AND ${table.time_terminal} IS NOT NULL AND ${table.time_terminal} >= ${table.causal_time} AND ${table.terminal_reason} IS NOT NULL AND ${table.terminal_reason} = 'normal' AND ${table.exhaustion_counter} IS NULL AND ${table.exhaustion_observed} IS NULL AND ${table.exhaustion_limit} IS NULL AND ${table.exhaustion_attempt_id} IS NULL AND ${table.exhaustion_envelope} IS NULL AND ${table.exhaustion_envelope_fingerprint} IS NULL) OR (${table.state} = 'failed' AND ${table.time_terminal} IS NOT NULL AND ${table.time_terminal} >= ${table.causal_time} AND ${table.terminal_reason} IS NOT NULL AND ${table.terminal_reason} IN ('provider_failure', 'tool_runtime_failure', 'permission_failure', 'projection_failure', 'owner_failure', 'integrity_failure') AND ${table.exhaustion_counter} IS NULL AND ${table.exhaustion_observed} IS NULL AND ${table.exhaustion_limit} IS NULL AND ${table.exhaustion_attempt_id} IS NULL AND ${table.exhaustion_envelope} IS NULL AND ${table.exhaustion_envelope_fingerprint} IS NULL) OR (${table.state} = 'interrupted' AND ${table.time_terminal} IS NOT NULL AND ${table.time_terminal} >= ${table.causal_time} AND ${table.terminal_reason} IS NOT NULL AND ${table.terminal_reason} IN ('learner_interrupt', 'ancestor_interrupt', 'owner_handoff_failed', 'owner_lost', 'startup_recovery') AND ${table.exhaustion_counter} IS NULL AND ${table.exhaustion_observed} IS NULL AND ${table.exhaustion_limit} IS NULL AND ${table.exhaustion_attempt_id} IS NULL AND ${table.exhaustion_envelope} IS NULL AND ${table.exhaustion_envelope_fingerprint} IS NULL) OR (${table.state} = 'exhausted' AND ${table.time_terminal} IS NOT NULL AND ${table.time_terminal} >= ${table.causal_time} AND ${table.terminal_reason} IS NOT NULL AND ${table.exhaustion_counter} IS NOT NULL AND ${table.exhaustion_observed} IS NOT NULL AND ${table.exhaustion_limit} IS NOT NULL AND ((${table.exhaustion_counter} = 'model' AND ${table.terminal_reason} = 'model_limit' AND ${table.exhaustion_observed} = ${table.model_count} AND ${table.exhaustion_limit} = ${table.model_limit}) OR (${table.exhaustion_counter} = 'tool' AND ${table.terminal_reason} = 'tool_limit' AND ${table.exhaustion_observed} = ${table.tool_count} AND ${table.exhaustion_limit} = ${table.tool_limit})) AND ${table.exhaustion_attempt_id} IS NOT NULL AND ${table.exhaustion_envelope} IS NOT NULL AND ${table.exhaustion_envelope_fingerprint} IS NOT NULL AND length(${table.exhaustion_envelope_fingerprint}) = 64)`,
    ),
  ],
)

export const TurnInputTable = sqliteTable(
  "turn_input",
  {
    id: text().$type<Turn.InputID>().primaryKey(),
    turn_id: text()
      .$type<Turn.ID>()
      .notNull()
      .references(() => TurnTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    message_id: text().$type<MessageID>().notNull(),
    source: text().$type<Turn.InputSource>().notNull(),
    ordinal: integer().notNull(),
    occurrence_id: text()
      .$type<LearningOccurrence.ID>()
      .references(() => AdmittedLearnerOccurrenceTable.id, { onDelete: "restrict" }),
    parent_model_message_id: text().$type<MessageID>(),
    time_admitted: integer().notNull(),
    envelope_fingerprint: text().notNull(),
  },
  (table) => [
    unique("turn_input_turn_id_unique").on(table.turn_id, table.id),
    unique("turn_input_session_id_unique").on(table.session_id, table.id),
    uniqueIndex("turn_input_turn_ordinal_idx").on(table.turn_id, table.ordinal),
    uniqueIndex("turn_input_message_idx").on(table.message_id),
    index("turn_input_occurrence_idx").on(table.occurrence_id),
    foreignKey({
      columns: [table.turn_id, table.session_id],
      foreignColumns: [TurnTable.id, TurnTable.session_id],
    }).onDelete("cascade"),
    check("turn_input_ordinal_nonnegative", sql`${table.ordinal} >= 0`),
    check("turn_input_time_nonnegative", sql`${table.time_admitted} >= 0`),
    check("turn_input_fingerprint", sql`length(${table.envelope_fingerprint}) = 64`),
    check(
      "turn_input_source_shape",
      sql`(${table.source} = 'learner_root' AND ${table.ordinal} = 0 AND ${table.occurrence_id} IS NOT NULL AND ${table.parent_model_message_id} IS NULL) OR (${table.source} = 'learner_steer' AND ${table.ordinal} > 0 AND ${table.occurrence_id} IS NOT NULL AND ${table.parent_model_message_id} IS NULL) OR (${table.source} = 'delegated_task' AND ${table.ordinal} = 0 AND ${table.parent_model_message_id} IS NOT NULL)`,
    ),
  ],
)

export const TurnModelOperationTable = sqliteTable(
  "turn_model_operation",
  {
    assistant_message_id: text().$type<MessageID>().primaryKey(),
    turn_id: text()
      .$type<Turn.ID>()
      .notNull()
      .references(() => TurnTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    input_id: text().$type<Turn.InputID>().notNull(),
    causal_occurrence_id: text()
      .$type<LearningOccurrence.ID>()
      .references(() => AdmittedLearnerOccurrenceTable.id, { onDelete: "restrict" }),
    ordinal: integer().notNull(),
    state: text().$type<Turn.ModelState>().notNull().default("running"),
    request_fingerprint: text().notNull(),
    context_fingerprint: text().notNull(),
    snapshot_frontier_sequence: integer().notNull(),
    snapshot_frontier_time: integer().notNull(),
    observed_shared_frontier_sequence: integer().notNull(),
    observed_shared_frontier_time: integer().notNull(),
    time_admitted: integer().notNull(),
    retained_steering_cut: text({ mode: "json" }).$type<Cut>(),
    retained_steering_cut_fingerprint: text(),
    retained_steering_cut_as_of: integer(),
    time_settled: integer(),
    candidates_sealed: integer({ mode: "boolean" }).notNull().default(false),
    candidate_count: integer(),
    time_candidates_sealed: integer(),
  },
  (table) => [
    unique("turn_model_turn_message_unique").on(table.turn_id, table.assistant_message_id),
    unique("turn_model_turn_message_session_unique").on(table.turn_id, table.assistant_message_id, table.session_id),
    uniqueIndex("turn_model_turn_ordinal_idx").on(table.turn_id, table.ordinal),
    foreignKey({
      columns: [table.turn_id, table.session_id],
      foreignColumns: [TurnTable.id, TurnTable.session_id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.turn_id, table.input_id],
      foreignColumns: [TurnInputTable.turn_id, TurnInputTable.id],
    }).onDelete("restrict"),
    check("turn_model_ordinal_nonnegative", sql`${table.ordinal} >= 0`),
    check(
      "turn_model_fingerprints",
      sql`length(${table.request_fingerprint}) = 64 AND length(${table.context_fingerprint}) = 64`,
    ),
    check(
      "turn_model_times",
      sql`${table.snapshot_frontier_sequence} >= 0 AND ${table.observed_shared_frontier_sequence} >= ${table.snapshot_frontier_sequence} AND ${table.snapshot_frontier_time} >= 0 AND ${table.observed_shared_frontier_time} >= ${table.snapshot_frontier_time} AND ${table.time_admitted} >= ${table.snapshot_frontier_time} AND ${table.time_admitted} >= ${table.observed_shared_frontier_time}`,
    ),
    check(
      "turn_model_retained_steering_cut_shape",
      sql`(${table.retained_steering_cut} IS NULL AND ${table.retained_steering_cut_fingerprint} IS NULL AND ${table.retained_steering_cut_as_of} IS NULL) OR (${table.retained_steering_cut} IS NOT NULL AND json_valid(${table.retained_steering_cut}) AND ${table.retained_steering_cut_fingerprint} IS NOT NULL AND length(${table.retained_steering_cut_fingerprint}) = 64 AND ${table.retained_steering_cut_fingerprint} NOT GLOB '*[^0-9a-f]*' AND ${table.retained_steering_cut_as_of} IS NOT NULL AND ${table.retained_steering_cut_as_of} = ${table.time_admitted} AND ${table.retained_steering_cut_as_of} >= ${table.observed_shared_frontier_time})`,
    ),
    check(
      "turn_model_state_shape",
      sql`(${table.state} = 'running' AND ${table.time_settled} IS NULL) OR (${table.state} IN ('completed', 'failed', 'interrupted') AND ${table.time_settled} IS NOT NULL AND ${table.time_settled} >= ${table.time_admitted})`,
    ),
    check(
      "turn_model_candidate_seal_shape",
      sql`(${table.candidates_sealed} = 0 AND ${table.candidate_count} IS NULL AND ${table.time_candidates_sealed} IS NULL) OR (${table.candidates_sealed} = 1 AND ${table.candidate_count} IS NOT NULL AND ${table.candidate_count} >= 0 AND ${table.time_candidates_sealed} IS NOT NULL AND ${table.time_candidates_sealed} >= ${table.time_admitted})`,
    ),
  ],
)

export const TurnToolCandidateTable = sqliteTable(
  "turn_tool_candidate",
  {
    part_id: text().$type<PartID>().primaryKey(),
    turn_id: text()
      .$type<Turn.ID>()
      .notNull()
      .references(() => TurnTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    call_id: text().notNull(),
    tool: text().notNull(),
    emission_ordinal: integer().notNull(),
    state: text().$type<Turn.CandidateState>().notNull().default("pending_admission"),
    normalized_envelope: text({ mode: "json" }).$type<Json>().notNull(),
    envelope_fingerprint: text().notNull(),
    time_registered: integer().notNull(),
    time_terminal: integer(),
    exhaustion_turn_id: text().$type<Turn.ID>(),
    future_attention_service_source: text()
      .$type<"learner_usable" | "internal_control">()
      .notNull()
      .default("internal_control"),
  },
  (table) => [
    unique("turn_candidate_turn_part_unique").on(table.turn_id, table.part_id),
    unique("turn_candidate_turn_part_model_unique").on(table.turn_id, table.part_id, table.assistant_message_id),
    uniqueIndex("turn_candidate_model_emission_idx").on(table.assistant_message_id, table.emission_ordinal),
    uniqueIndex("turn_candidate_model_call_idx").on(table.assistant_message_id, table.call_id),
    foreignKey({
      columns: [table.turn_id, table.assistant_message_id, table.session_id],
      foreignColumns: [
        TurnModelOperationTable.turn_id,
        TurnModelOperationTable.assistant_message_id,
        TurnModelOperationTable.session_id,
      ],
    }).onDelete("cascade"),
    foreignKey({ columns: [table.exhaustion_turn_id], foreignColumns: [TurnTable.id] }).onDelete("restrict"),
    check("turn_candidate_ordinal_nonnegative", sql`${table.emission_ordinal} >= 0`),
    check("turn_candidate_fingerprint", sql`length(${table.envelope_fingerprint}) = 64`),
    check("turn_candidate_time_nonnegative", sql`${table.time_registered} >= 0`),
    check(
      "turn_candidate_state_shape",
      sql`(${table.state} IN ('pending_admission', 'admitted') AND ${table.time_terminal} IS NULL AND ${table.exhaustion_turn_id} IS NULL) OR (${table.state} IN ('not_started_interrupted', 'not_started_failed') AND ${table.time_terminal} IS NOT NULL AND ${table.time_terminal} >= ${table.time_registered} AND ${table.exhaustion_turn_id} IS NULL) OR (${table.state} IN ('not_started_limit', 'not_started_turn_exhausted') AND ${table.time_terminal} IS NOT NULL AND ${table.time_terminal} >= ${table.time_registered} AND ${table.exhaustion_turn_id} = ${table.turn_id})`,
    ),
  ],
)

export const TurnToolInvocationTable = sqliteTable(
  "turn_tool_invocation",
  {
    part_id: text()
      .$type<PartID>()
      .primaryKey()
      .references(() => TurnToolCandidateTable.part_id, { onDelete: "cascade" }),
    turn_id: text().$type<Turn.ID>().notNull(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    ordinal: integer().notNull(),
    state: text().$type<Turn.InvocationState>().notNull().default("running"),
    observed_shared_frontier_sequence: integer().notNull(),
    observed_shared_frontier_time: integer().notNull(),
    consumed_shared_frontier_sequence: integer().notNull(),
    consumed_shared_frontier_time: integer().notNull(),
    resulting_shared_frontier_sequence: integer(),
    resulting_shared_frontier_time: integer(),
    time_admitted: integer().notNull(),
    time_settled: integer(),
  },
  (table) => [
    unique("turn_invocation_turn_part_unique").on(table.turn_id, table.part_id),
    unique("turn_invocation_turn_part_model_unique").on(table.turn_id, table.part_id, table.assistant_message_id),
    uniqueIndex("turn_invocation_turn_ordinal_idx").on(table.turn_id, table.ordinal),
    foreignKey({
      columns: [table.turn_id, table.part_id, table.assistant_message_id],
      foreignColumns: [
        TurnToolCandidateTable.turn_id,
        TurnToolCandidateTable.part_id,
        TurnToolCandidateTable.assistant_message_id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.turn_id, table.session_id],
      foreignColumns: [TurnTable.id, TurnTable.session_id],
    }).onDelete("cascade"),
    check("turn_invocation_ordinal_nonnegative", sql`${table.ordinal} >= 0`),
    check(
      "turn_invocation_time_nonnegative",
      sql`${table.observed_shared_frontier_sequence} >= 0 AND ${table.consumed_shared_frontier_sequence} >= ${table.observed_shared_frontier_sequence} AND ${table.observed_shared_frontier_time} >= 0 AND ${table.consumed_shared_frontier_time} >= ${table.observed_shared_frontier_time} AND (${table.resulting_shared_frontier_sequence} IS NULL OR (${table.resulting_shared_frontier_sequence} >= ${table.consumed_shared_frontier_sequence} AND ${table.resulting_shared_frontier_time} >= ${table.consumed_shared_frontier_time})) AND ${table.time_admitted} >= ${table.consumed_shared_frontier_time}`,
    ),
    check(
      "turn_invocation_state_shape",
      sql`(${table.state} = 'running' AND ${table.time_settled} IS NULL AND ((${table.resulting_shared_frontier_sequence} IS NULL AND ${table.resulting_shared_frontier_time} IS NULL) OR (${table.resulting_shared_frontier_sequence} IS NOT NULL AND ${table.resulting_shared_frontier_time} IS NOT NULL))) OR (${table.state} IN ('completed', 'failed', 'interrupted') AND ${table.time_settled} IS NOT NULL AND ${table.time_settled} >= ${table.time_admitted} AND ${table.time_settled} >= ${table.consumed_shared_frontier_time} AND ((${table.resulting_shared_frontier_sequence} IS NULL AND ${table.resulting_shared_frontier_time} IS NULL) OR (${table.resulting_shared_frontier_sequence} IS NOT NULL AND ${table.resulting_shared_frontier_time} IS NOT NULL AND ${table.time_settled} >= ${table.resulting_shared_frontier_time})))`,
    ),
  ],
)

export const TurnInputPresentationTable = sqliteTable("turn_input_presentation", {
  input_id: text()
    .$type<Turn.InputID>()
    .primaryKey()
    .references(() => TurnInputTable.id, { onDelete: "cascade" }),
  message_id: text()
    .$type<MessageID>()
    .notNull()
    .unique()
    .references(() => MessageTable.id, { onDelete: "cascade" }),
  session_id: text().$type<SessionSchema.ID>().notNull(),
})

export const TurnHistoricalInputPresentationTable = sqliteTable(
  "turn_historical_input_presentation",
  {
    message_id: text()
      .$type<MessageID>()
      .primaryKey()
      .references(() => MessageTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    source_session_id: text().$type<SessionSchema.ID>().notNull(),
    source_turn_id: text().$type<Turn.ID>().notNull(),
    source_input_id: text().$type<Turn.InputID>().notNull(),
    occurrence_id: text().$type<LearningOccurrence.ID>(),
    time_created: integer().notNull(),
  },
  (table) => [
    index("turn_historical_input_source_idx").on(table.source_turn_id, table.source_input_id),
    check("turn_historical_input_time_nonnegative", sql`${table.time_created} >= 0`),
  ],
)

export const TurnModelPresentationTable = sqliteTable(
  "turn_model_presentation",
  {
    assistant_message_id: text()
      .$type<MessageID>()
      .primaryKey()
      .references(() => TurnModelOperationTable.assistant_message_id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.assistant_message_id], foreignColumns: [MessageTable.id] }).onDelete("cascade"),
  ],
)

export const TurnCandidatePresentationTable = sqliteTable(
  "turn_candidate_presentation",
  {
    part_id: text()
      .$type<PartID>()
      .primaryKey()
      .references(() => TurnToolCandidateTable.part_id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
  },
  (table) => [foreignKey({ columns: [table.part_id], foreignColumns: [PartTable.id] }).onDelete("cascade")],
)

export const TurnTranscriptRedactionTable = sqliteTable(
  "turn_transcript_redaction",
  {
    turn_id: text()
      .$type<Turn.ID>()
      .primaryKey()
      .references(() => TurnTable.id, { onDelete: "cascade" }),
    time_removed: integer().notNull(),
    reason: text().$type<"presentation_removed">().notNull(),
  },
  (table) => [
    check("turn_transcript_redaction_reason", sql`${table.reason} = 'presentation_removed'`),
    check("turn_transcript_redaction_time_nonnegative", sql`${table.time_removed} >= 0`),
  ],
)

export const TurnCandidateRedactionTable = sqliteTable(
  "turn_candidate_redaction",
  {
    part_id: text()
      .$type<PartID>()
      .primaryKey()
      .references(() => TurnToolCandidateTable.part_id, { onDelete: "cascade" }),
    turn_id: text().$type<Turn.ID>().notNull(),
    time_removed: integer().notNull(),
    reason: text().$type<"presentation_removed">().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.turn_id, table.part_id],
      foreignColumns: [TurnToolCandidateTable.turn_id, TurnToolCandidateTable.part_id],
    }).onDelete("cascade"),
    check("turn_candidate_redaction_reason", sql`${table.reason} = 'presentation_removed'`),
    check("turn_candidate_redaction_time_nonnegative", sql`${table.time_removed} >= 0`),
    index("turn_candidate_redaction_turn_idx").on(table.turn_id, table.part_id),
  ],
)

export const TurnHistoricalModelPresentationTable = sqliteTable(
  "turn_historical_model_presentation",
  {
    assistant_message_id: text()
      .$type<MessageID>()
      .primaryKey()
      .references(() => MessageTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    source_session_id: text().$type<SessionSchema.ID>().notNull(),
    source_turn_id: text().$type<Turn.ID>().notNull(),
    source_assistant_message_id: text().$type<MessageID>().notNull(),
    causal_occurrence_id: text().$type<LearningOccurrence.ID>(),
    time_created: integer().notNull(),
  },
  (table) => [
    index("turn_historical_model_source_idx").on(table.source_turn_id, table.source_assistant_message_id),
    check("turn_historical_model_time_nonnegative", sql`${table.time_created} >= 0`),
  ],
)

export const TurnHistoricalToolPresentationTable = sqliteTable(
  "turn_historical_tool_presentation",
  {
    part_id: text()
      .$type<PartID>()
      .primaryKey()
      .references(() => PartTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    assistant_message_id: text().$type<MessageID>().notNull(),
    source_session_id: text().$type<SessionSchema.ID>().notNull(),
    source_turn_id: text().$type<Turn.ID>().notNull(),
    source_assistant_message_id: text().$type<MessageID>().notNull(),
    source_part_id: text().$type<PartID>().notNull(),
    call_id: text().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    index("turn_historical_tool_source_idx").on(table.source_turn_id, table.source_part_id),
    check("turn_historical_tool_time_nonnegative", sql`${table.time_created} >= 0`),
  ],
)

export const TurnChildLineageTable = sqliteTable(
  "turn_child_lineage",
  {
    child_turn_id: text()
      .$type<Turn.ID>()
      .primaryKey()
      .references(() => TurnTable.id, { onDelete: "cascade" }),
    child_session_id: text().$type<SessionSchema.ID>().notNull(),
    child_depth: integer().notNull(),
    parent_turn_id: text().$type<Turn.ID>().notNull(),
    parent_session_id: text().$type<SessionSchema.ID>().notNull(),
    parent_depth: integer().notNull(),
    parent_task_part_id: text().$type<PartID>().notNull(),
    parent_model_message_id: text().$type<MessageID>().notNull(),
    delegated_capability: text({ mode: "json" }).$type<Json>().notNull(),
  },
  (table) => [
    unique("turn_child_lineage_child_session_unique").on(table.child_turn_id, table.child_session_id),
    index("turn_child_lineage_parent_idx").on(table.parent_turn_id, table.parent_task_part_id),
    foreignKey({
      columns: [table.child_turn_id, table.child_session_id, table.child_depth],
      foreignColumns: [TurnTable.id, TurnTable.session_id, TurnTable.depth],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.parent_turn_id, table.parent_session_id, table.parent_depth],
      foreignColumns: [TurnTable.id, TurnTable.session_id, TurnTable.depth],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.parent_turn_id, table.parent_task_part_id, table.parent_model_message_id],
      foreignColumns: [
        TurnToolInvocationTable.turn_id,
        TurnToolInvocationTable.part_id,
        TurnToolInvocationTable.assistant_message_id,
      ],
    }).onDelete("restrict"),
    check(
      "turn_child_lineage_depth",
      sql`${table.parent_depth} >= 0 AND ${table.child_depth} = ${table.parent_depth} + 1`,
    ),
  ],
)

export const TurnChildResultTable = sqliteTable(
  "turn_child_result",
  {
    parent_task_part_id: text()
      .$type<PartID>()
      .primaryKey()
      .references(() => PartTable.id, { onDelete: "cascade" }),
    parent_turn_id: text().$type<Turn.ID>().notNull(),
    parent_session_id: text().$type<SessionSchema.ID>().notNull(),
    child_turn_id: text().$type<Turn.ID>().notNull(),
    child_session_id: text().$type<SessionSchema.ID>().notNull(),
    terminal_outcome: text().$type<Exclude<Turn.State, "running">>().notNull(),
    requested_output_state: text().$type<"complete" | "incomplete">().notNull(),
    requested_output: text({ mode: "json" }).$type<unknown>(),
    reason: text().$type<Turn.TerminalReason>(),
    time_settled: integer().notNull(),
  },
  (table) => [
    unique("turn_child_result_child_unique").on(table.child_turn_id),
    foreignKey({
      columns: [table.parent_turn_id, table.parent_task_part_id],
      foreignColumns: [TurnToolInvocationTable.turn_id, TurnToolInvocationTable.part_id],
    }).onDelete("cascade"),
    check(
      "turn_child_result_terminal_outcome",
      sql`${table.terminal_outcome} IN ('completed', 'failed', 'interrupted', 'exhausted')`,
    ),
    check(
      "turn_child_result_output_shape",
      sql`(${table.requested_output_state} = 'complete' AND ${table.requested_output} IS NOT NULL AND ${table.reason} IS NULL) OR (${table.requested_output_state} = 'incomplete' AND ${table.reason} IS NOT NULL)`,
    ),
    check("turn_child_result_time_nonnegative", sql`${table.time_settled} >= 0`),
  ],
)

export const TurnModelSourceRetentionTable = sqliteTable(
  "turn_model_source_retention",
  {
    owner: text().notNull(),
    owner_reference_id: text().notNull(),
    source_turn_id: text().$type<Turn.ID>().notNull(),
    source_assistant_message_id: text().$type<MessageID>().notNull(),
    source_time_settled: integer().notNull(),
    time_registered: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.owner, table.owner_reference_id] }),
    index("turn_model_source_retention_source_idx").on(
      table.source_turn_id,
      table.source_assistant_message_id,
    ),
    check(
      "turn_model_source_retention_shape",
      sql`length(${table.owner}) > 0 AND length(${table.owner_reference_id}) > 0
        AND length(${table.source_turn_id}) > 0 AND length(${table.source_assistant_message_id}) > 0
        AND ${table.source_time_settled} >= 0 AND ${table.time_registered} >= ${table.source_time_settled}`,
    ),
  ],
)

export const TurnUnavailableSourceTable = sqliteTable(
  "turn_unavailable_source",
  {
    turn_id: text().$type<Turn.ID>().primaryKey(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    admission_kind: text().$type<Turn.AdmissionKind>().notNull(),
    time_admitted: integer().notNull(),
    time_terminal: integer().notNull(),
    outcome: text().$type<Exclude<Turn.State, "running">>().notNull(),
    parent_turn_id: text().$type<Turn.ID>(),
    parent_session_id: text().$type<SessionSchema.ID>(),
    parent_task_part_id: text().$type<PartID>(),
    parent_model_message_id: text().$type<MessageID>(),
    depth: integer().notNull(),
    causal_occurrence_id: text().$type<LearningOccurrence.ID>(),
    time_deleted: integer().notNull(),
  },
  (table) => [
    index("turn_unavailable_session_idx").on(table.session_id),
    index("turn_unavailable_parent_idx").on(table.parent_turn_id, table.parent_task_part_id),
    check("turn_unavailable_outcome", sql`${table.outcome} IN ('completed', 'failed', 'interrupted', 'exhausted')`),
    check(
      "turn_unavailable_time_nonnegative",
      sql`${table.time_admitted} >= 0 AND ${table.depth} >= 0 AND ${table.time_deleted} >= ${table.time_admitted} AND (${table.time_terminal} IS NULL OR (${table.time_terminal} >= ${table.time_admitted} AND ${table.time_deleted} >= ${table.time_terminal}))`,
    ),
    check(
      "turn_unavailable_parent_shape",
      sql`(${table.admission_kind} = 'learner' AND ${table.depth} = 0 AND ${table.parent_turn_id} IS NULL AND ${table.parent_session_id} IS NULL AND ${table.parent_task_part_id} IS NULL AND ${table.parent_model_message_id} IS NULL) OR (${table.admission_kind} = 'delegated_task' AND ${table.depth} > 0 AND ${table.parent_turn_id} IS NOT NULL AND ${table.parent_session_id} IS NOT NULL AND ${table.parent_task_part_id} IS NOT NULL AND ${table.parent_model_message_id} IS NOT NULL)`,
    ),
    check("turn_unavailable_terminal_shape", sql`${table.time_terminal} IS NOT NULL`),
  ],
)

export const TurnUnavailableModelTable = sqliteTable(
  "turn_unavailable_model",
  {
    turn_id: text()
      .$type<Turn.ID>()
      .notNull()
      .references(() => TurnUnavailableSourceTable.turn_id, { onDelete: "cascade" }),
    assistant_message_id: text().$type<MessageID>().notNull(),
    causal_occurrence_id: text().$type<LearningOccurrence.ID>(),
    state: text().$type<Exclude<Turn.ModelState, "running">>(),
    time_settled: integer(),
  },
  (table) => [
    unique("turn_unavailable_model_identity_unique").on(table.turn_id, table.assistant_message_id),
    unique("turn_unavailable_model_message_unique").on(table.assistant_message_id),
  ],
)

export const TurnUnavailableToolTable = sqliteTable(
  "turn_unavailable_tool",
  {
    turn_id: text()
      .$type<Turn.ID>()
      .notNull()
      .references(() => TurnUnavailableSourceTable.turn_id, { onDelete: "cascade" }),
    assistant_message_id: text().$type<MessageID>().notNull(),
    part_id: text().$type<PartID>().notNull(),
    call_id: text().notNull(),
  },
  (table) => [
    unique("turn_unavailable_tool_identity_unique").on(table.turn_id, table.part_id),
    unique("turn_unavailable_tool_part_unique").on(table.part_id),
  ],
)
