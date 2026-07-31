import { Turn } from "@opencode-ai/schema/turn"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import type { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"
import {
  TurnChildLineageTable,
  TurnModelOperationTable,
  TurnTable,
  TurnToolCandidateTable,
  TurnToolInvocationTable,
} from "./sql"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export type LearningCommandRegistration = Readonly<{
  turnID: Turn.ID
  inputID: Turn.InputID
  causalOccurrenceID?: OccurrenceID
  partID: PartID
  callID: string
  emissionOrdinal: number
  sessionID: SessionSchema.ID
  assistantMessageID: MessageID
  capabilityIdentity: string
}>

export type ValidatedLearningCommandRegistration = Readonly<{
  modelTimeAdmitted: number
  candidateTimeRegistered: number
  toolTimeAdmitted: number
}>

export type ValidatedAgentActionRegistration = ValidatedLearningCommandRegistration &
  Readonly<{
    occurrenceID: OccurrenceID
    admissionKind: Turn.AdmissionKind
    depth: number
    lineage: readonly Readonly<{
      childTurnID: Turn.ID
      childSessionID: SessionSchema.ID
      childDepth: number
      parentTurnID: Turn.ID
      parentSessionID: SessionSchema.ID
      parentDepth: number
      parentTaskPartID: PartID
      parentModelMessageID: MessageID
      delegatedCapability: Readonly<Record<string, unknown>>
    }>[]
  }>

/**
 * Proves that a learner-causal command came from one exact admitted Turn tool
 * invocation. Presentation ancestry and model-supplied payloads are not causal
 * authority.
 */
export function validateLearningCommandRegistration(
  tx: Transaction,
  input: LearningCommandRegistration,
): Effect.Effect<ValidatedLearningCommandRegistration, Turn.IntegrityError> {
  return Effect.gen(function* () {
    if (!input.causalOccurrenceID) {
      return yield* invalid(input.turnID, "Learning command has no runtime-bound learner occurrence")
    }
    const turn = yield* tx.select().from(TurnTable).where(eq(TurnTable.id, input.turnID)).get().pipe(Effect.orDie)
    if (!turn || turn.session_id !== input.sessionID || turn.state !== "running") {
      return yield* invalid(input.turnID, "Learning command Turn is missing, terminal, or belongs to another Session")
    }
    const model = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, input.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (
      !model ||
      model.turn_id !== input.turnID ||
      model.session_id !== input.sessionID ||
      model.input_id !== input.inputID ||
      model.causal_occurrence_id !== input.causalOccurrenceID ||
      !model.candidates_sealed
    ) {
      return yield* invalid(input.turnID, "Learning command does not match its exact sealed model operation")
    }
    const candidate = yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !candidate ||
      candidate.turn_id !== input.turnID ||
      candidate.session_id !== input.sessionID ||
      candidate.assistant_message_id !== input.assistantMessageID ||
      candidate.call_id !== input.callID ||
      candidate.emission_ordinal !== input.emissionOrdinal ||
      candidate.tool !== input.capabilityIdentity ||
      candidate.state !== "admitted"
    ) {
      return yield* invalid(input.turnID, "Learning command does not match an admitted tool candidate")
    }
    const invocation = yield* tx
      .select()
      .from(TurnToolInvocationTable)
      .where(eq(TurnToolInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !invocation ||
      invocation.turn_id !== input.turnID ||
      invocation.session_id !== input.sessionID ||
      invocation.assistant_message_id !== input.assistantMessageID ||
      invocation.state !== "running"
    ) {
      return yield* invalid(input.turnID, "Learning command has no exact running tool invocation")
    }
    return {
      modelTimeAdmitted: model.time_admitted,
      candidateTimeRegistered: candidate.time_registered,
      toolTimeAdmitted: invocation.time_admitted,
    }
  })
}

export function validateAgentActionRegistration(
  tx: Transaction,
  input: LearningCommandRegistration,
): Effect.Effect<ValidatedAgentActionRegistration, Turn.IntegrityError> {
  return Effect.gen(function* () {
    const validated = yield* validateLearningCommandRegistration(tx, input)
    if (!input.causalOccurrenceID) {
      return yield* invalid(input.turnID, "Agent action has no runtime-bound learner occurrence")
    }
    const turn = yield* tx.select().from(TurnTable).where(eq(TurnTable.id, input.turnID)).get().pipe(Effect.orDie)
    if (!turn) return yield* invalid(input.turnID, "Agent-action Turn disappeared during validation")
    return {
      ...validated,
      occurrenceID: input.causalOccurrenceID,
      admissionKind: turn.admission_kind,
      depth: turn.depth,
      lineage: yield* exactLineage(tx, turn, []),
    }
  })
}

function exactLineage(
  tx: Transaction,
  turn: typeof TurnTable.$inferSelect,
  visited: readonly Turn.ID[],
): Effect.Effect<ValidatedAgentActionRegistration["lineage"], Turn.IntegrityError> {
  return Effect.gen(function* () {
    if (visited.includes(turn.id)) return yield* invalid(turn.id, "Delegated Turn lineage contains a cycle")
    const edge = yield* tx
      .select()
      .from(TurnChildLineageTable)
      .where(eq(TurnChildLineageTable.child_turn_id, turn.id))
      .get()
      .pipe(Effect.orDie)
    if (turn.admission_kind === "learner") {
      if (turn.depth !== 0 || edge) return yield* invalid(turn.id, "Root Turn has delegated lineage")
      return []
    }
    if (
      turn.depth <= 0 ||
      !edge ||
      edge.child_session_id !== turn.session_id ||
      edge.child_depth !== turn.depth ||
      !isJsonObject(edge.delegated_capability)
    ) {
      return yield* invalid(turn.id, "Delegated Turn has no exact capability lineage")
    }
    const parent = yield* tx
      .select()
      .from(TurnTable)
      .where(eq(TurnTable.id, edge.parent_turn_id))
      .get()
      .pipe(Effect.orDie)
    if (
      !parent ||
      parent.session_id !== edge.parent_session_id ||
      parent.depth !== edge.parent_depth ||
      turn.depth !== parent.depth + 1
    ) {
      return yield* invalid(turn.id, "Delegated Turn lineage does not match its parent")
    }
    const ancestors = yield* exactLineage(tx, parent, [...visited, turn.id])
    return [
      ...ancestors,
      {
        childTurnID: edge.child_turn_id,
        childSessionID: edge.child_session_id,
        childDepth: edge.child_depth,
        parentTurnID: edge.parent_turn_id,
        parentSessionID: edge.parent_session_id,
        parentDepth: edge.parent_depth,
        parentTaskPartID: edge.parent_task_part_id,
        parentModelMessageID: edge.parent_model_message_id,
        delegatedCapability: edge.delegated_capability,
      },
    ]
  })
}

function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function invalid(turnID: Turn.ID, reason: string) {
  return Effect.fail(new Turn.IntegrityError({ turnID, reason }))
}
