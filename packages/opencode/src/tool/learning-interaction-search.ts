import { and, eq, sql } from "drizzle-orm"
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
