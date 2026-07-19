import { Turn } from "@opencode-ai/schema/turn"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import type { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"
import { TurnModelOperationTable, TurnTable, TurnToolCandidateTable, TurnToolInvocationTable } from "./sql"

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

function invalid(turnID: Turn.ID, reason: string) {
  return Effect.fail(new Turn.IntegrityError({ turnID, reason }))
}
