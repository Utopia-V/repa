import { and, eq, lt, sql } from "drizzle-orm"
import { Database } from "@opencode-ai/core/database/database"
import { LearningInspectionCursor } from "@opencode-ai/core/learning-inspection-cursor-schema"
import { PartTable } from "@opencode-ai/core/session/sql"
import {
  TurnModelOperationTable,
  TurnTable,
  TurnToolCandidateTable,
  TurnToolInvocationTable,
} from "@opencode-ai/core/turn/sql"
import { Effect, Schema } from "effect"
import type { Tool } from "./tool"
const Continuation = LearningInspectionCursor.Continuation
type Continuation = LearningInspectionCursor.Continuation
export const queryFingerprint = LearningInspectionCursor.queryFingerprint
export const signSearch = LearningInspectionCursor.signSearch

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export function verifyPredecessor(
  tx: Transaction,
  input: Readonly<{ continuation: Continuation; toolID: string; queryFingerprint: string }>,
) {
  return Effect.gen(function* () {
    if (input.continuation.queryFingerprint !== input.queryFingerprint) {
      return { type: "conflict" as const, reason: "query_fingerprint_mismatch" as const }
    }
    const row = yield* tx
      .select({
        part: PartTable,
        candidate: TurnToolCandidateTable,
        invocation: TurnToolInvocationTable,
        operation: TurnModelOperationTable,
      })
      .from(PartTable)
      .innerJoin(TurnToolCandidateTable, eq(TurnToolCandidateTable.part_id, PartTable.id))
      .innerJoin(TurnToolInvocationTable, eq(TurnToolInvocationTable.part_id, PartTable.id))
      .innerJoin(
        TurnModelOperationTable,
        eq(TurnModelOperationTable.assistant_message_id, TurnToolCandidateTable.assistant_message_id),
      )
      .where(sql`${PartTable.id} = ${input.continuation.source.partID}`)
      .get()
      .pipe(Effect.orDie)
    if (!row) return { type: "source_unavailable_or_unresolved" as const }
    if (
      row.candidate.tool !== input.toolID ||
      row.candidate.state !== "admitted" ||
      row.invocation.state !== "completed" ||
      row.operation.session_id !== input.continuation.source.sessionID ||
      row.operation.turn_id !== input.continuation.source.turnID ||
      row.operation.input_id !== input.continuation.source.inputID ||
      row.operation.ordinal !== input.continuation.source.modelOrdinal ||
      row.invocation.ordinal !== input.continuation.source.toolOrdinal ||
      row.part.session_id !== input.continuation.source.sessionID ||
      row.part.message_id !== row.operation.assistant_message_id
    ) {
      return { type: "conflict" as const, reason: "predecessor_identity_mismatch" as const }
    }
    const data = row.part.data as Record<string, unknown>
    const state = record(data.state) ? data.state : undefined
    if (
      data.type !== "tool" ||
      data.tool !== input.toolID ||
      state?.status !== "completed" ||
      typeof state.output !== "string"
    ) {
      return { type: "conflict" as const, reason: "predecessor_not_completed" as const }
    }
    return LearningInspectionCursor.verifyStoredSearch(state.output, input.continuation)
  })
}

export function verifyPriorCompletedToolCall(
  tx: Transaction,
  input: Readonly<{ context: Tool.Context; toolID: string; callID: string; action: string }>,
) {
  const interaction = input.context.interaction
  if (!interaction) return Effect.die(new Error("Interaction search requires an admitted Turn"))
  return Effect.gen(function* () {
    const current = yield* tx
      .select({ candidate: TurnToolCandidateTable, operation: TurnModelOperationTable })
      .from(TurnToolCandidateTable)
      .innerJoin(
        TurnModelOperationTable,
        eq(TurnModelOperationTable.assistant_message_id, TurnToolCandidateTable.assistant_message_id),
      )
      .where(eq(TurnToolCandidateTable.part_id, interaction.candidate.partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !current ||
      interaction.assistantMessageID !== input.context.messageID ||
      interaction.candidate.callID !== input.context.callID ||
      current.candidate.tool !== input.toolID ||
      current.candidate.state !== "admitted" ||
      current.candidate.call_id !== interaction.candidate.callID ||
      current.candidate.emission_ordinal !== interaction.candidate.emissionOrdinal ||
      current.candidate.session_id !== input.context.sessionID ||
      current.candidate.turn_id !== interaction.turnID ||
      current.candidate.assistant_message_id !== input.context.messageID ||
      current.operation.session_id !== input.context.sessionID ||
      current.operation.turn_id !== interaction.turnID ||
      current.operation.input_id !== interaction.inputID ||
      current.operation.assistant_message_id !== input.context.messageID ||
      (interaction.causalOccurrenceID !== undefined &&
        current.operation.causal_occurrence_id !== interaction.causalOccurrenceID)
    ) {
      return { type: "conflict" as const, reason: "current_operation_identity_mismatch" as const }
    }
    const rows = yield* tx
      .select({
        part: PartTable,
        candidate: TurnToolCandidateTable,
        invocation: TurnToolInvocationTable,
        operation: TurnModelOperationTable,
      })
      .from(TurnToolCandidateTable)
      .innerJoin(TurnToolInvocationTable, eq(TurnToolInvocationTable.part_id, TurnToolCandidateTable.part_id))
      .innerJoin(PartTable, eq(PartTable.id, TurnToolCandidateTable.part_id))
      .innerJoin(
        TurnModelOperationTable,
        eq(TurnModelOperationTable.assistant_message_id, TurnToolCandidateTable.assistant_message_id),
      )
      .where(
        and(
          eq(TurnToolCandidateTable.session_id, input.context.sessionID),
          eq(TurnToolCandidateTable.turn_id, interaction.turnID),
          eq(TurnToolCandidateTable.call_id, input.callID),
          eq(TurnToolCandidateTable.tool, input.toolID),
          eq(TurnToolCandidateTable.state, "admitted"),
          eq(TurnToolInvocationTable.state, "completed"),
          eq(TurnModelOperationTable.input_id, interaction.inputID),
          lt(TurnModelOperationTable.ordinal, current.operation.ordinal),
        ),
      )
      .all()
      .pipe(Effect.orDie)
    if (rows.length === 0) return { type: "source_unavailable_or_unresolved" as const }
    if (rows.length !== 1) return { type: "conflict" as const, reason: "predecessor_call_ambiguous" as const }
    const row = rows[0]!
    if (
      row.candidate.assistant_message_id !== row.operation.assistant_message_id ||
      row.invocation.session_id !== row.operation.session_id ||
      row.invocation.turn_id !== row.operation.turn_id ||
      row.invocation.assistant_message_id !== row.operation.assistant_message_id ||
      row.part.session_id !== row.operation.session_id ||
      row.part.message_id !== row.operation.assistant_message_id
    ) {
      return { type: "conflict" as const, reason: "predecessor_identity_mismatch" as const }
    }
    const data = row.part.data as Record<string, unknown>
    const state = record(data.state) ? data.state : undefined
    const toolInput = record(state?.input) ? state.input : undefined
    if (data.callID !== input.callID) {
      return { type: "conflict" as const, reason: "predecessor_identity_mismatch" as const }
    }
    if (
      data.type !== "tool" ||
      data.tool !== input.toolID ||
      state?.status !== "completed" ||
      typeof state.output !== "string"
    ) {
      return { type: "conflict" as const, reason: "predecessor_not_completed" as const }
    }
    if (toolInput?.action !== input.action) {
      return { type: "conflict" as const, reason: "predecessor_action_mismatch" as const }
    }
    const output = parse(state.output)
    if (!record(output)) return { type: "conflict" as const, reason: "predecessor_output_shape" as const }
    return { type: "verified" as const, partID: row.part.id, output }
  })
}

export function remainingCapacity(tx: Transaction, context: Tool.Context) {
  const interaction = context.interaction
  if (!interaction) return Effect.die(new Error("Interaction search requires an admitted Turn"))
  return tx
    .select({
      modelCount: TurnTable.model_count,
      modelLimit: TurnTable.model_limit,
      toolCount: TurnTable.tool_count,
      toolLimit: TurnTable.tool_limit,
    })
    .from(TurnTable)
    .where(and(eq(TurnTable.id, interaction.turnID), eq(TurnTable.session_id, context.sessionID)))
    .get()
    .pipe(
      Effect.flatMap((turn) =>
        turn
          ? Effect.succeed({
              model: Math.max(0, turn.modelLimit - turn.modelCount),
              tool: Math.max(0, turn.toolLimit - turn.toolCount),
              observed: { model: turn.modelCount, tool: turn.toolCount },
              limit: { model: turn.modelLimit, tool: turn.toolLimit },
            })
          : Effect.die(new Error(`Turn ${interaction.turnID} is unavailable during Interaction search`)),
      ),
      Effect.orDie,
    )
}

export function hasSameTurnResetConflict(
  tx: Transaction,
  input: Readonly<{ context: Tool.Context; toolID: string; queryFingerprint: string }>,
) {
  const interaction = input.context.interaction
  if (!interaction) return Effect.die(new Error("Interaction search requires an admitted Turn"))
  return Effect.gen(function* () {
    const rows = yield* tx
      .select({ part: PartTable })
      .from(TurnToolCandidateTable)
      .innerJoin(TurnToolInvocationTable, eq(TurnToolInvocationTable.part_id, TurnToolCandidateTable.part_id))
      .innerJoin(PartTable, eq(PartTable.id, TurnToolCandidateTable.part_id))
      .innerJoin(
        TurnModelOperationTable,
        eq(TurnModelOperationTable.assistant_message_id, TurnToolCandidateTable.assistant_message_id),
      )
      .where(
        and(
          eq(TurnToolCandidateTable.turn_id, interaction.turnID),
          eq(TurnModelOperationTable.input_id, interaction.inputID),
          eq(TurnToolCandidateTable.tool, input.toolID),
          eq(TurnToolInvocationTable.state, "completed"),
        ),
      )
      .all()
      .pipe(Effect.orDie)
    return rows.some((row) => {
      const data = row.part.data as Record<string, unknown>
      const state = record(data.state) ? data.state : undefined
      const output = typeof state?.output === "string" ? parse(state.output) : undefined
      const owner = record(output) && record(output.ownerResult) ? output.ownerResult : output
      const search = record(owner) && record(owner.search) ? owner.search : undefined
      const continuation = search && Schema.is(Continuation)(search.continuation) ? search.continuation : undefined
      return (
        continuation?.queryFingerprint === input.queryFingerprint &&
        (!continuation.completeSoFar ||
          continuation.gapCounts.oversizedCandidateSkipped > 0 ||
          continuation.gapCounts.rangeItemsSkipped > 0)
      )
    })
  })
}

export function source(
  context: Tool.Context,
  capacity: Readonly<{ observed: Readonly<{ model: number; tool: number }> }>,
) {
  const interaction = context.interaction
  if (!interaction) throw new Error("Interaction search requires an admitted Turn")
  if (capacity.observed.model < 1 || capacity.observed.tool < 1) {
    throw new Error("Interaction search source has no admitted model/tool ordinal")
  }
  return {
    sessionID: context.sessionID,
    turnID: interaction.turnID,
    inputID: interaction.inputID,
    partID: interaction.candidate.partID,
    modelOrdinal: capacity.observed.model - 1,
    toolOrdinal: capacity.observed.tool - 1,
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
