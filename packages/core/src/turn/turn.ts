export * as TurnLifecycle from "./turn"

import { Turn } from "@opencode-ai/schema/turn"
import { and, asc, desc, eq, gt, inArray, lt, max, ne, or, sql } from "drizzle-orm"
import { DateTime, Effect } from "effect"
import { isDeepStrictEqual } from "node:util"
import type { Database } from "../database/database"
import { LearningFrontier } from "../learning-frontier"
import { markSourceUnavailable } from "../learning-command/occurrence"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { LearnerOccurrencePresentationTable } from "../learning-command/occurrence.sql"
import { garbageCollectOccurrences, removeNoEffectInvocationsForSession } from "../learning-command/settlement"
import { LearningCommandReceiptTable } from "../learning-command/sql"
import { RetainedSteering } from "../retained-steering"
import { SessionTable } from "../session/sql"
import type { SessionSchema } from "../session/schema"
import type { MessageID, PartID } from "../v1/session"
import {
  TurnCandidatePresentationTable,
  TurnCandidateRedactionTable,
  TurnChildLineageTable,
  TurnChildResultTable,
  TurnHistoricalInputPresentationTable,
  TurnHistoricalModelPresentationTable,
  TurnHistoricalToolPresentationTable,
  TurnInputPresentationTable,
  TurnInputTable,
  TurnModelOperationTable,
  TurnModelPresentationTable,
  TurnTable,
  TurnTranscriptRedactionTable,
  TurnToolCandidateTable,
  TurnToolInvocationTable,
  TurnUnavailableModelTable,
  TurnUnavailableSourceTable,
  TurnUnavailableToolTable,
} from "./sql"

export {
  validateLearningCommandRegistration,
  type LearningCommandRegistration,
  type ValidatedLearningCommandRegistration,
} from "./learning-command-registration"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
type Json = Record<string, unknown>

export type LearnerAdmission = {
  readonly kind: "learner"
  readonly turnID: Turn.ID
  readonly sessionID: SessionSchema.ID
  readonly inputID: Turn.InputID
  readonly messageID: MessageID
  readonly occurrenceID: OccurrenceID
  readonly limits: Turn.Limits
  readonly envelope: Json
  readonly policyBasis: Json
  readonly timeAdmitted: number
}

export type DelegatedAdmission = {
  readonly kind: "delegated_task"
  readonly turnID: Turn.ID
  readonly sessionID: SessionSchema.ID
  readonly inputID: Turn.InputID
  readonly messageID: MessageID
  readonly limits: Turn.Limits
  readonly envelope: Json
  readonly policyBasis: Json
  readonly delegatedCapability: Json
  readonly parentTurnID: Turn.ID
  readonly parentTaskPartID: PartID
  readonly parentModelMessageID: MessageID
  readonly depthLimit: number
  readonly timeAdmitted: number
}

export type Admission = LearnerAdmission | DelegatedAdmission

export type Admitted = {
  readonly turn: Turn.Info
  readonly input: Turn.Input
  readonly replay: boolean
}

export type SteerInput = {
  readonly sessionID: SessionSchema.ID
  readonly expectedTurnID: Turn.ID
  readonly inputID: Turn.InputID
  readonly messageID: MessageID
  readonly occurrenceID: OccurrenceID
  readonly envelope: Json
  readonly timeAdmitted: number
}

export type ModelAdmission = {
  readonly turnID: Turn.ID
  readonly sessionID: SessionSchema.ID
  readonly assistantMessageID: MessageID
  readonly requestEnvelope: Json
  readonly contextFingerprint: string
  readonly snapshotFrontier: LearningFrontier.Snapshot
  readonly timeAdmitted: number
}

export type ModelAdmissionResult =
  | { readonly type: "admitted"; readonly operation: Turn.ModelOperation; readonly replay: boolean }
  | { readonly type: "exhausted"; readonly turn: Turn.Info; readonly replay: boolean }

export type CandidateInput = {
  readonly partID: PartID
  readonly callID: string
  readonly tool: string
  readonly envelope: Json
}

export type CandidateSetInput = {
  readonly turnID: Turn.ID
  readonly sessionID: SessionSchema.ID
  readonly assistantMessageID: MessageID
  readonly candidates: readonly CandidateInput[]
  readonly timeSealed: number
}

export type ToolAdmission = {
  readonly turnID: Turn.ID
  readonly sessionID: SessionSchema.ID
  readonly assistantMessageID: MessageID
  readonly partID: PartID
  readonly timeAdmitted: number
}

export type ToolAdmissionResult =
  | { readonly type: "admitted"; readonly invocation: Turn.ToolInvocation; readonly replay: boolean }
  | {
      readonly type: "not_started"
      readonly candidate: Turn.ToolCandidate
      readonly turn?: Turn.Info
      readonly replay: boolean
    }

export type TerminalInput = {
  readonly turnID: Turn.ID
  readonly outcome: "completed" | "failed" | "interrupted"
  readonly reason: Turn.TerminalReason
  readonly time: number
}

export type Lookup =
  | { readonly type: "available"; readonly turn: Turn.Info }
  | {
      readonly type: "source_unavailable"
      readonly source: Turn.UnavailableSource
      readonly models: readonly Turn.UnavailableModelMapping[]
      readonly tools: readonly Turn.UnavailableToolMapping[]
    }
  | { readonly type: "missing" }

export function sourceUnavailableError(input: Extract<Lookup, { readonly type: "source_unavailable" }>) {
  return new Turn.SourceUnavailableError({
    turnID: input.source.turnID,
    receipt: { source: input.source, models: [...input.models], tools: [...input.tools] },
  })
}

export type SessionTreeDeletionError = Turn.SessionTreeBusyError | Turn.SessionTreeChangedError | Turn.IntegrityError

export function validateDelegation(
  tx: Transaction,
  input: DelegatedAdmission,
): Effect.Effect<
  {
    readonly sessionID: SessionSchema.ID
    readonly parentDepth: number
    readonly depth: number
    readonly causalOccurrenceID?: OccurrenceID
  },
  Turn.Error
> {
  return Effect.gen(function* () {
    const parent = yield* parentAdmission(tx, input)
    const depth = parent.depth + 1
    if (depth > input.depthLimit) return yield* integrity(input.turnID, "Child Turn depth limit exceeded")
    return {
      sessionID: parent.sessionID,
      depth,
      parentDepth: parent.depth,
      ...(parent.causalOccurrenceID ? { causalOccurrenceID: parent.causalOccurrenceID } : {}),
    }
  })
}

export function admit(tx: Transaction, input: Admission): Effect.Effect<Admitted, Turn.Error> {
  return Effect.gen(function* () {
    yield* deferForeignKeys(tx)
    const fingerprint = envelopeFingerprint(input.envelope)
    const existing = yield* tx.select().from(TurnTable).where(eq(TurnTable.id, input.turnID)).get().pipe(Effect.orDie)
    if (existing) {
      const redacted = yield* tx
        .select({ id: TurnTranscriptRedactionTable.turn_id })
        .from(TurnTranscriptRedactionTable)
        .where(eq(TurnTranscriptRedactionTable.turn_id, input.turnID))
        .get()
        .pipe(Effect.orDie)
      if (redacted) return yield* new Turn.SourceUnavailableError({ turnID: input.turnID })
      const storedInput = yield* tx
        .select()
        .from(TurnInputTable)
        .where(eq(TurnInputTable.id, existing.initial_input_id))
        .get()
        .pipe(Effect.orDie)
      if (
        !storedInput ||
        existing.session_id !== input.sessionID ||
        existing.admission_kind !== input.kind ||
        existing.initial_input_id !== input.inputID ||
        existing.model_limit !== input.limits.model ||
        existing.tool_limit !== input.limits.tool ||
        existing.envelope_fingerprint !== fingerprint ||
        !isDeepStrictEqual(existing.normalized_envelope, input.envelope) ||
        !isDeepStrictEqual(existing.policy_basis, input.policyBasis) ||
        storedInput.message_id !== input.messageID ||
        storedInput.envelope_fingerprint !== fingerprint ||
        (input.kind === "learner" && storedInput.occurrence_id !== input.occurrenceID)
      ) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.turnID })
      }
      if (input.kind === "delegated_task") yield* assertExactLineage(tx, input)
      return { turn: yield* info(tx, input.turnID), input: inputInfo(storedInput), replay: true }
    }
    const stored = yield* lookup(tx, input.turnID)
    if (stored.type === "source_unavailable") return yield* sourceUnavailableError(stored)

    const active = yield* activeRow(tx, input.sessionID)
    if (active) {
      return yield* new Turn.AlreadyRunningError({ sessionID: input.sessionID, activeTurnID: active.id })
    }

    const session = yield* tx
      .select({ id: SessionTable.id, parentID: SessionTable.parent_id })
      .from(SessionTable)
      .where(eq(SessionTable.id, input.sessionID))
      .get()
      .pipe(Effect.orDie)
    if (!session) return yield* integrity(input.turnID, "Session must exist before Turn admission")

    const shared = yield* LearningFrontier.read(tx)
    const sessionTime = yield* tx
      .select({ value: max(TurnTable.causal_time) })
      .from(TurnTable)
      .where(eq(TurnTable.session_id, input.sessionID))
      .get()
      .pipe(Effect.orDie)
    const timeAdmitted = Math.max(input.timeAdmitted, shared.time, sessionTime?.value ?? 0)
    const parent = input.kind === "delegated_task" ? yield* validateDelegation(tx, input) : undefined
    const occurrenceID = input.kind === "learner" ? input.occurrenceID : parent?.causalOccurrenceID
    const depth = parent?.depth ?? 0

    yield* tx
      .insert(TurnInputTable)
      .values({
        id: input.inputID,
        turn_id: input.turnID,
        session_id: input.sessionID,
        message_id: input.messageID,
        source: input.kind === "learner" ? "learner_root" : "delegated_task",
        ordinal: 0,
        occurrence_id: occurrenceID,
        parent_model_message_id: input.kind === "delegated_task" ? input.parentModelMessageID : undefined,
        time_admitted: timeAdmitted,
        envelope_fingerprint: fingerprint,
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(TurnInputPresentationTable)
      .values({ input_id: input.inputID, message_id: input.messageID, session_id: input.sessionID })
      .run()
      .pipe(Effect.orDie)

    if (input.kind === "delegated_task" && parent) {
      yield* tx
        .insert(TurnChildLineageTable)
        .values({
          child_turn_id: input.turnID,
          child_session_id: input.sessionID,
          child_depth: depth,
          parent_turn_id: input.parentTurnID,
          parent_session_id: parent.sessionID,
          parent_depth: parent.parentDepth,
          parent_task_part_id: input.parentTaskPartID,
          parent_model_message_id: input.parentModelMessageID,
          delegated_capability: input.delegatedCapability,
        })
        .run()
        .pipe(Effect.orDie)
    }

    yield* tx
      .insert(TurnTable)
      .values({
        id: input.turnID,
        session_id: input.sessionID,
        admission_kind: input.kind,
        initial_input_id: input.inputID,
        current_input_id: input.inputID,
        model_limit: input.limits.model,
        tool_limit: input.limits.tool,
        state: "running",
        depth,
        normalized_envelope: input.envelope,
        envelope_fingerprint: fingerprint,
        policy_basis: input.policyBasis,
        time_admitted: timeAdmitted,
        causal_time: timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)

    return { turn: yield* info(tx, input.turnID), input: yield* requireInput(tx, input.inputID), replay: false }
  })
}

export function promoteSteer(tx: Transaction, input: SteerInput): Effect.Effect<Turn.Input, Turn.Error> {
  return Effect.gen(function* () {
    const fingerprint = envelopeFingerprint(input.envelope)
    const existing = yield* tx
      .select()
      .from(TurnInputTable)
      .where(eq(TurnInputTable.id, input.inputID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      const presentation = yield* tx
        .select({ id: TurnInputPresentationTable.input_id })
        .from(TurnInputPresentationTable)
        .where(eq(TurnInputPresentationTable.input_id, input.inputID))
        .get()
        .pipe(Effect.orDie)
      if (!presentation) return yield* new Turn.SourceUnavailableError({ turnID: input.expectedTurnID })
      if (
        existing.turn_id !== input.expectedTurnID ||
        existing.session_id !== input.sessionID ||
        existing.message_id !== input.messageID ||
        existing.source !== "learner_steer" ||
        existing.occurrence_id !== input.occurrenceID ||
        existing.envelope_fingerprint !== fingerprint
      ) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.expectedTurnID })
      }
      return inputInfo(existing)
    }

    const active = yield* activeRow(tx, input.sessionID)
    if (!active) {
      const expected = yield* tx
        .select()
        .from(TurnTable)
        .where(eq(TurnTable.id, input.expectedTurnID))
        .get()
        .pipe(Effect.orDie)
      if (expected) {
        return yield* new Turn.NotSteerableError({
          sessionID: input.sessionID,
          turnID: input.expectedTurnID,
          state: expected.state,
        })
      }
      return yield* new Turn.NoActiveTurnError({ sessionID: input.sessionID })
    }
    if (active.id !== input.expectedTurnID) {
      return yield* new Turn.ActiveTurnMismatchError({
        sessionID: input.sessionID,
        expectedTurnID: input.expectedTurnID,
        activeTurnID: active.id,
      })
    }

    const shared = yield* LearningFrontier.read(tx)
    const ordinal =
      ((yield* tx
        .select({ value: max(TurnInputTable.ordinal) })
        .from(TurnInputTable)
        .where(eq(TurnInputTable.turn_id, input.expectedTurnID))
        .get()
        .pipe(Effect.orDie))?.value ?? 0) + 1
    const timeAdmitted = Math.max(input.timeAdmitted, active.causal_time, shared.time)
    yield* tx
      .insert(TurnInputTable)
      .values({
        id: input.inputID,
        turn_id: input.expectedTurnID,
        session_id: input.sessionID,
        message_id: input.messageID,
        source: "learner_steer",
        ordinal,
        occurrence_id: input.occurrenceID,
        time_admitted: timeAdmitted,
        envelope_fingerprint: fingerprint,
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(TurnInputPresentationTable)
      .values({ input_id: input.inputID, message_id: input.messageID, session_id: input.sessionID })
      .run()
      .pipe(Effect.orDie)
    const changed = yield* tx
      .update(TurnTable)
      .set({ current_input_id: input.inputID, causal_time: timeAdmitted })
      .where(and(eq(TurnTable.id, input.expectedTurnID), eq(TurnTable.state, "running")))
      .returning({ id: TurnTable.id })
      .get()
      .pipe(Effect.orDie)
    if (!changed) {
      return yield* new Turn.NotSteerableError({
        sessionID: input.sessionID,
        turnID: input.expectedTurnID,
        state: (yield* info(tx, input.expectedTurnID)).state,
      })
    }
    return yield* requireInput(tx, input.inputID)
  })
}

export function admitModel(tx: Transaction, input: ModelAdmission): Effect.Effect<ModelAdmissionResult, Turn.Error> {
  return Effect.gen(function* () {
    const baseEnvelope = {
      request: input.requestEnvelope,
      contextFingerprint: input.contextFingerprint,
      snapshotFrontier: input.snapshotFrontier,
    } satisfies Json
    const existing = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, input.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      const stored = yield* RetainedSteering.readCut(tx, input.assistantMessageID).pipe(
        Effect.mapError(
          (error) =>
            new Turn.IntegrityError({
              turnID: input.turnID,
              reason: `Stored retained steering cut is invalid: ${"reason" in error ? error.reason : "database_error"}`,
            }),
        ),
      )
      if (stored.type !== "available") {
        return yield* integrity(input.turnID, "Model operation has no available retained steering cut")
      }
      const storedCut = stored.cut
      const contextFingerprint = envelopeFingerprint({
        baseContextFingerprint: input.contextFingerprint,
        retainedSteeringCutFingerprint: storedCut.fingerprint,
      })
      const fingerprint = envelopeFingerprint({
        ...baseEnvelope,
        retainedSteeringCutFingerprint: storedCut.fingerprint,
      })
      const presentation = yield* tx
        .select({ id: TurnModelPresentationTable.assistant_message_id })
        .from(TurnModelPresentationTable)
        .where(eq(TurnModelPresentationTable.assistant_message_id, input.assistantMessageID))
        .get()
        .pipe(Effect.orDie)
      if (!presentation) return yield* new Turn.SourceUnavailableError({ turnID: input.turnID })
      if (
        existing.turn_id !== input.turnID ||
        existing.session_id !== input.sessionID ||
        existing.request_fingerprint !== fingerprint ||
        existing.context_fingerprint !== contextFingerprint ||
        existing.snapshot_frontier_sequence !== input.snapshotFrontier.sequence ||
        existing.snapshot_frontier_time !== input.snapshotFrontier.time
      ) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.turnID })
      }
      return { type: "admitted", operation: modelInfo(existing), replay: true }
    }

    const storedTurn = yield* tx.select().from(TurnTable).where(eq(TurnTable.id, input.turnID)).get().pipe(Effect.orDie)
    if (
      storedTurn?.state === "exhausted" &&
      storedTurn.exhaustion_counter === "model" &&
      storedTurn.exhaustion_attempt_id === input.assistantMessageID
    ) {
      const fingerprint = envelopeFingerprint(baseEnvelope)
      if (
        storedTurn.session_id !== input.sessionID ||
        storedTurn.exhaustion_envelope_fingerprint !== fingerprint ||
        !isDeepStrictEqual(storedTurn.exhaustion_envelope, baseEnvelope)
      ) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.turnID })
      }
      return { type: "exhausted", turn: yield* info(tx, input.turnID), replay: true }
    }

    const turn = yield* requireRunning(tx, input.turnID, input.sessionID)
    const current = yield* requireInput(tx, turn.current_input_id)
    const latest = yield* LearningFrontier.read(tx)
    const observed = LearningFrontier.merge(input.snapshotFrontier, latest)
    if (turn.model_count >= turn.model_limit) {
      const terminal = yield* exhaustModel(
        tx,
        turn,
        input,
        baseEnvelope,
        envelopeFingerprint(baseEnvelope),
        observed,
      )
      return { type: "exhausted", turn: terminal, replay: false }
    }
    const cut = yield* RetainedSteering.prepareCut(tx, {
      turnID: input.turnID,
      assistantMessageID: input.assistantMessageID,
      trustedTime: input.timeAdmitted,
    }).pipe(
      Effect.mapError(
        (error) =>
          new Turn.IntegrityError({
            turnID: input.turnID,
            reason: `Retained steering cut preparation failed: ${error.reason}`,
          }),
      ),
    )
    if (
      cut.assistantMessageID !== input.assistantMessageID ||
      cut.sourceTemporalContext.occurrenceID !== current.occurrenceID ||
      cut.throughSharedFrontier.sequence !== observed.sequence ||
      cut.throughSharedFrontier.time !== observed.time ||
      cut.cutAsOf < input.timeAdmitted ||
      cut.cutAsOf < turn.causal_time ||
      cut.cutAsOf < observed.time
    ) {
      return yield* integrity(input.turnID, "Retained steering cut does not match model admission")
    }
    const normalizedEnvelope = {
      ...baseEnvelope,
      retainedSteeringCutFingerprint: cut.fingerprint,
    } satisfies Json
    const fingerprint = envelopeFingerprint(normalizedEnvelope)
    const contextFingerprint = envelopeFingerprint({
      baseContextFingerprint: input.contextFingerprint,
      retainedSteeringCutFingerprint: cut.fingerprint,
    })
    yield* tx
      .insert(TurnModelOperationTable)
      .values({
        assistant_message_id: input.assistantMessageID,
        turn_id: input.turnID,
        session_id: input.sessionID,
        input_id: current.id,
        causal_occurrence_id: current.occurrenceID,
        ordinal: turn.model_count,
        state: "running",
        request_fingerprint: fingerprint,
        context_fingerprint: contextFingerprint,
        snapshot_frontier_sequence: input.snapshotFrontier.sequence,
        snapshot_frontier_time: input.snapshotFrontier.time,
        observed_shared_frontier_sequence: observed.sequence,
        observed_shared_frontier_time: observed.time,
        time_admitted: cut.cutAsOf,
        retained_steering_cut: cut,
        retained_steering_cut_fingerprint: cut.fingerprint,
        retained_steering_cut_as_of: cut.cutAsOf,
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(TurnModelPresentationTable)
      .values({ assistant_message_id: input.assistantMessageID, session_id: input.sessionID })
      .run()
      .pipe(Effect.orDie)
    yield* RetainedSteering.commitCut(tx, cut).pipe(
      Effect.mapError(
        (error) =>
          new Turn.IntegrityError({
            turnID: input.turnID,
            reason: `Retained steering cut commit failed: ${error.reason}`,
          }),
      ),
    )
    const operation = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, input.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!operation) return yield* integrity(input.turnID, "Model membership disappeared after admission")
    return { type: "admitted", operation: modelInfo(operation), replay: false }
  })
}

export function sealCandidateSet(
  tx: Transaction,
  input: CandidateSetInput,
): Effect.Effect<readonly Turn.ToolCandidate[], Turn.Error> {
  return Effect.gen(function* () {
    const model = yield* requireModel(tx, input.turnID, input.sessionID, input.assistantMessageID)
    const stored = yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.assistant_message_id, input.assistantMessageID))
      .orderBy(asc(TurnToolCandidateTable.emission_ordinal))
      .all()
      .pipe(Effect.orDie)
    if (model.candidates_sealed) {
      const redacted =
        stored.length === 0
          ? undefined
          : yield* tx
              .select({ id: TurnCandidateRedactionTable.part_id })
              .from(TurnCandidateRedactionTable)
              .where(
                inArray(
                  TurnCandidateRedactionTable.part_id,
                  stored.map((candidate) => candidate.part_id),
                ),
              )
              .get()
              .pipe(Effect.orDie)
      if (redacted) return yield* new Turn.SourceUnavailableError({ turnID: input.turnID })
      if (!exactCandidateSet(stored, input.candidates)) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.turnID })
      }
      return stored.map(candidateInfo)
    }
    if (stored.length > 0) return yield* integrity(input.turnID, "Unsealed candidate set was partially persisted")
    const turn = yield* requireRunning(tx, input.turnID, input.sessionID)
    const timeSealed = Math.max(input.timeSealed, turn.causal_time, model.time_admitted)
    yield* Effect.forEach(
      input.candidates.entries(),
      ([emissionOrdinal, candidate]) => {
        const fingerprint = envelopeFingerprint(candidate.envelope)
        return Effect.gen(function* () {
          yield* tx
            .insert(TurnToolCandidateTable)
            .values({
              part_id: candidate.partID,
              turn_id: input.turnID,
              session_id: input.sessionID,
              assistant_message_id: input.assistantMessageID,
              call_id: candidate.callID,
              tool: candidate.tool,
              emission_ordinal: emissionOrdinal,
              state: "pending_admission",
              normalized_envelope: candidate.envelope,
              envelope_fingerprint: fingerprint,
              time_registered: timeSealed,
            })
            .run()
            .pipe(Effect.orDie)
          yield* tx
            .insert(TurnCandidatePresentationTable)
            .values({ part_id: candidate.partID, session_id: input.sessionID })
            .run()
            .pipe(Effect.orDie)
        })
      },
      { discard: true },
    )
    yield* tx
      .update(TurnModelOperationTable)
      .set({ candidates_sealed: true, candidate_count: input.candidates.length, time_candidates_sealed: timeSealed })
      .where(eq(TurnModelOperationTable.assistant_message_id, input.assistantMessageID))
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .update(TurnTable)
      .set({ causal_time: timeSealed })
      .where(eq(TurnTable.id, input.turnID))
      .run()
      .pipe(Effect.orDie)
    return (yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.assistant_message_id, input.assistantMessageID))
      .orderBy(asc(TurnToolCandidateTable.emission_ordinal))
      .all()
      .pipe(Effect.orDie)).map(candidateInfo)
  })
}

export function settleModel(
  tx: Transaction,
  input: {
    readonly turnID: Turn.ID
    readonly assistantMessageID: MessageID
    readonly state: Exclude<Turn.ModelState, "running">
    readonly time: number
  },
): Effect.Effect<Turn.ModelOperation, Turn.Error> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, input.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!row || row.turn_id !== input.turnID) return yield* integrity(input.turnID, "Model operation is missing")
    if (row.state !== "running") {
      if (row.state !== input.state) return yield* integrity(input.turnID, "Model terminal state conflicts")
      return modelInfo(row)
    }
    const turn = yield* requireRunning(tx, input.turnID, row.session_id)
    const time = Math.max(input.time, turn.causal_time, row.time_admitted, row.time_candidates_sealed ?? 0)
    yield* tx
      .update(TurnModelOperationTable)
      .set({ state: input.state, time_settled: time })
      .where(
        and(
          eq(TurnModelOperationTable.assistant_message_id, input.assistantMessageID),
          eq(TurnModelOperationTable.state, "running"),
        ),
      )
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .update(TurnTable)
      .set({ causal_time: time })
      .where(eq(TurnTable.id, input.turnID))
      .run()
      .pipe(Effect.orDie)
    return modelInfo({ ...row, state: input.state, time_settled: time })
  })
}

export function admitTool(tx: Transaction, input: ToolAdmission): Effect.Effect<ToolAdmissionResult, Turn.Error> {
  return Effect.gen(function* () {
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
      candidate.assistant_message_id !== input.assistantMessageID
    ) {
      return yield* integrity(input.turnID, "Tool candidate is missing or belongs to another operation")
    }
    const presentation = yield* tx
      .select({ id: TurnCandidatePresentationTable.part_id })
      .from(TurnCandidatePresentationTable)
      .where(eq(TurnCandidatePresentationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!presentation) return yield* new Turn.SourceUnavailableError({ turnID: input.turnID })
    const existing = yield* tx
      .select()
      .from(TurnToolInvocationTable)
      .where(eq(TurnToolInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (existing) return { type: "admitted", invocation: invocationInfo(existing), replay: true }
    if (candidate.state !== "pending_admission") {
      return {
        type: "not_started",
        candidate: candidateInfo(candidate),
        turn: candidate.exhaustion_turn_id ? yield* info(tx, candidate.exhaustion_turn_id) : undefined,
        replay: true,
      }
    }

    yield* assertEarlierCandidatesSettled(tx, candidate)
    const turn = yield* requireRunning(tx, input.turnID, input.sessionID)
    if (turn.tool_count >= turn.tool_limit) {
      const terminal = yield* exhaustTool(tx, turn, candidate, input.timeAdmitted)
      const rejected = yield* tx
        .select()
        .from(TurnToolCandidateTable)
        .where(eq(TurnToolCandidateTable.part_id, input.partID))
        .get()
        .pipe(Effect.orDie)
      if (!rejected) return yield* integrity(input.turnID, "Exhausted candidate disappeared")
      return { type: "not_started", candidate: candidateInfo(rejected), turn: terminal, replay: false }
    }

    const latest = yield* LearningFrontier.read(tx)
    const timeAdmitted = Math.max(input.timeAdmitted, turn.causal_time, latest.time)
    yield* tx
      .insert(TurnToolInvocationTable)
      .values({
        part_id: input.partID,
        turn_id: input.turnID,
        session_id: input.sessionID,
        assistant_message_id: input.assistantMessageID,
        ordinal: turn.tool_count,
        state: "running",
        observed_shared_frontier_sequence: latest.sequence,
        observed_shared_frontier_time: latest.time,
        consumed_shared_frontier_sequence: latest.sequence,
        consumed_shared_frontier_time: latest.time,
        time_admitted: timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)
    const invocation = yield* tx
      .select()
      .from(TurnToolInvocationTable)
      .where(eq(TurnToolInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!invocation) return yield* integrity(input.turnID, "Tool invocation disappeared after admission")
    return { type: "admitted", invocation: invocationInfo(invocation), replay: false }
  })
}

export function consumeToolFrontier(
  tx: Transaction,
  input: { readonly partID: PartID; readonly frontier: LearningFrontier.Snapshot },
) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnToolInvocationTable)
      .where(eq(TurnToolInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!row || row.state !== "running") return row ? invocationInfo(row) : undefined
    const consumed = LearningFrontier.merge(
      { sequence: row.consumed_shared_frontier_sequence, time: row.consumed_shared_frontier_time },
      input.frontier,
    )
    const timeAdmitted = Math.max(row.time_admitted, consumed.time)
    yield* tx
      .update(TurnToolInvocationTable)
      .set({
        consumed_shared_frontier_sequence: consumed.sequence,
        consumed_shared_frontier_time: consumed.time,
        time_admitted: timeAdmitted,
      })
      .where(eq(TurnToolInvocationTable.part_id, input.partID))
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .update(TurnTable)
      .set({ causal_time: sql`max(${TurnTable.causal_time}, ${consumed.time})` })
      .where(eq(TurnTable.id, row.turn_id))
      .run()
      .pipe(Effect.orDie)
    return invocationInfo({
      ...row,
      consumed_shared_frontier_sequence: consumed.sequence,
      consumed_shared_frontier_time: consumed.time,
      time_admitted: timeAdmitted,
    })
  })
}

export function recordToolResultingFrontier(
  tx: Transaction,
  input: { readonly partID: PartID; readonly frontier: LearningFrontier.Snapshot },
) {
  return Effect.gen(function* () {
    yield* consumeToolFrontier(tx, input)
    const row = yield* tx
      .select()
      .from(TurnToolInvocationTable)
      .where(eq(TurnToolInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!row || row.state !== "running") return row ? invocationInfo(row) : undefined
    yield* tx
      .update(TurnToolInvocationTable)
      .set({
        resulting_shared_frontier_sequence: input.frontier.sequence,
        resulting_shared_frontier_time: input.frontier.time,
      })
      .where(eq(TurnToolInvocationTable.part_id, input.partID))
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .update(TurnTable)
      .set({ causal_time: sql`max(${TurnTable.causal_time}, ${input.frontier.time})` })
      .where(eq(TurnTable.id, row.turn_id))
      .run()
      .pipe(Effect.orDie)
    return invocationInfo({
      ...row,
      resulting_shared_frontier_sequence: input.frontier.sequence,
      resulting_shared_frontier_time: input.frontier.time,
    })
  })
}

export function settleTool(
  tx: Transaction,
  input: {
    readonly turnID: Turn.ID
    readonly partID: PartID
    readonly state: Exclude<Turn.InvocationState, "running">
    readonly time: number
  },
): Effect.Effect<Turn.ToolInvocation, Turn.Error> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnToolInvocationTable)
      .where(eq(TurnToolInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!row || row.turn_id !== input.turnID) return yield* integrity(input.turnID, "Tool invocation is missing")
    if (row.state !== "running") {
      if (row.state !== input.state) return yield* integrity(row.turn_id, "Tool terminal state conflicts")
      return invocationInfo(row)
    }
    const time = Math.max(
      input.time,
      row.time_admitted,
      row.consumed_shared_frontier_time,
      row.resulting_shared_frontier_time ?? 0,
    )
    yield* tx
      .update(TurnToolInvocationTable)
      .set({ state: input.state, time_settled: time })
      .where(and(eq(TurnToolInvocationTable.part_id, input.partID), eq(TurnToolInvocationTable.state, "running")))
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .update(TurnTable)
      .set({ causal_time: sql`max(${TurnTable.causal_time}, ${time})` })
      .where(eq(TurnTable.id, row.turn_id))
      .run()
      .pipe(Effect.orDie)
    return invocationInfo({ ...row, state: input.state, time_settled: time })
  })
}

export function settle(tx: Transaction, input: TerminalInput): Effect.Effect<Turn.Info, Turn.Error> {
  return Effect.gen(function* () {
    const row = yield* tx.select().from(TurnTable).where(eq(TurnTable.id, input.turnID)).get().pipe(Effect.orDie)
    if (!row) return yield* new Turn.NotFoundError({ turnID: input.turnID })
    if (row.state !== "running") return yield* info(tx, input.turnID)
    const time = Math.max(input.time, row.causal_time)
    if (input.outcome !== "completed") yield* closeUnsettled(tx, row, input.outcome, time)
    yield* tx
      .update(TurnTable)
      .set({ state: input.outcome, terminal_reason: input.reason, time_terminal: time, causal_time: time })
      .where(and(eq(TurnTable.id, input.turnID), eq(TurnTable.state, "running")))
      .run()
      .pipe(Effect.orDie)
    return yield* info(tx, input.turnID)
  })
}

export function recoverRunning(tx: Transaction, time: number): Effect.Effect<readonly Turn.Info[], Turn.Error> {
  return Effect.gen(function* () {
    const frontier = yield* LearningFrontier.read(tx)
    const recoveryTime = Math.max(time, frontier.time)
    const rows = yield* tx
      .select({ id: TurnTable.id })
      .from(TurnTable)
      .where(eq(TurnTable.state, "running"))
      .orderBy(asc(TurnTable.time_admitted), asc(TurnTable.id))
      .all()
      .pipe(Effect.orDie)
    return yield* Effect.forEach(rows, (row) =>
      settle(tx, { turnID: row.id, outcome: "interrupted", reason: "startup_recovery", time: recoveryTime }),
    )
  })
}

export function active(tx: Transaction, sessionID: SessionSchema.ID): Effect.Effect<Turn.Info | undefined, Turn.Error> {
  return Effect.gen(function* () {
    const row = yield* activeRow(tx, sessionID)
    return row ? yield* info(tx, row.id) : undefined
  })
}

export function activeIDs(tx: Transaction, sessionIDs: readonly SessionSchema.ID[]) {
  if (sessionIDs.length === 0) return Effect.succeed([] as readonly Turn.ID[])
  return tx
    .select({ id: TurnTable.id })
    .from(TurnTable)
    .where(and(inArray(TurnTable.session_id, [...new Set(sessionIDs)]), eq(TurnTable.state, "running")))
    .orderBy(asc(TurnTable.time_admitted), asc(TurnTable.id))
    .all()
    .pipe(
      Effect.orDie,
      Effect.map((rows) => rows.map((row) => row.id)),
    )
}

export function info(tx: Transaction, turnID: Turn.ID): Effect.Effect<Turn.Info, Turn.Error> {
  return Effect.gen(function* () {
    const stored = yield* lookup(tx, turnID)
    if (stored.type === "available") return stored.turn
    if (stored.type === "source_unavailable") return yield* sourceUnavailableError(stored)
    return yield* new Turn.NotFoundError({ turnID })
  })
}

export function list(tx: Transaction, sessionID: SessionSchema.ID): Effect.Effect<readonly Turn.Info[], Turn.Error> {
  return Effect.gen(function* () {
    const rows = yield* tx
      .select()
      .from(TurnTable)
      .where(eq(TurnTable.session_id, sessionID))
      .orderBy(asc(TurnTable.time_admitted), asc(TurnTable.id))
      .all()
      .pipe(Effect.orDie)
    const lineages =
      rows.length === 0
        ? []
        : yield* tx
            .select()
            .from(TurnChildLineageTable)
            .where(
              inArray(
                TurnChildLineageTable.child_turn_id,
                rows.map((row) => row.id),
              ),
            )
            .all()
            .pipe(Effect.orDie)
    const byTurn = new Map(lineages.map((lineage) => [lineage.child_turn_id, lineage]))
    return rows.map((row) => turnInfo(row, byTurn.get(row.id)))
  })
}

export function modelOperation(
  tx: Transaction,
  input: {
    readonly turnID: Turn.ID
    readonly sessionID: SessionSchema.ID
    readonly assistantMessageID: MessageID
  },
): Effect.Effect<Turn.ModelOperation, Turn.Error> {
  return requireModel(tx, input.turnID, input.sessionID, input.assistantMessageID).pipe(Effect.map(modelInfo))
}

export function candidate(
  tx: Transaction,
  input: { readonly turnID: Turn.ID; readonly partID: PartID },
): Effect.Effect<Turn.ToolCandidate, Turn.Error> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!row || row.turn_id !== input.turnID) {
      return yield* integrity(input.turnID, "Tool candidate is missing or belongs to another Turn")
    }
    return candidateInfo(row)
  })
}

export function candidates(
  tx: Transaction,
  input: { readonly turnID: Turn.ID; readonly assistantMessageID: MessageID },
): Effect.Effect<readonly Turn.ToolCandidate[], Turn.Error> {
  return Effect.gen(function* () {
    const model = yield* tx
      .select({ turnID: TurnModelOperationTable.turn_id })
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, input.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!model || model.turnID !== input.turnID) {
      return yield* integrity(input.turnID, "Model operation is missing or belongs to another Turn")
    }
    return (yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.assistant_message_id, input.assistantMessageID))
      .orderBy(asc(TurnToolCandidateTable.emission_ordinal))
      .all()
      .pipe(Effect.orDie)).map(candidateInfo)
  })
}

export function invocation(
  tx: Transaction,
  input: { readonly turnID: Turn.ID; readonly partID: PartID },
): Effect.Effect<Turn.ToolInvocation | undefined, Turn.Error> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnToolInvocationTable)
      .where(eq(TurnToolInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return undefined
    if (row.turn_id !== input.turnID) {
      return yield* integrity(input.turnID, "Tool invocation belongs to another Turn")
    }
    return invocationInfo(row)
  })
}

export function lookup(tx: Transaction, turnID: Turn.ID): Effect.Effect<Lookup, Turn.Error> {
  return Effect.gen(function* () {
    const row = yield* tx.select().from(TurnTable).where(eq(TurnTable.id, turnID)).get().pipe(Effect.orDie)
    if (row) {
      const lineage = yield* tx
        .select()
        .from(TurnChildLineageTable)
        .where(eq(TurnChildLineageTable.child_turn_id, turnID))
        .get()
        .pipe(Effect.orDie)
      return { type: "available" as const, turn: turnInfo(row, lineage) }
    }
    const source = yield* tx
      .select()
      .from(TurnUnavailableSourceTable)
      .where(eq(TurnUnavailableSourceTable.turn_id, turnID))
      .get()
      .pipe(Effect.orDie)
    if (!source) return { type: "missing" as const }
    const models = yield* tx
      .select()
      .from(TurnUnavailableModelTable)
      .where(eq(TurnUnavailableModelTable.turn_id, turnID))
      .orderBy(asc(TurnUnavailableModelTable.assistant_message_id))
      .all()
      .pipe(Effect.orDie)
    const tools = yield* tx
      .select()
      .from(TurnUnavailableToolTable)
      .where(eq(TurnUnavailableToolTable.turn_id, turnID))
      .orderBy(asc(TurnUnavailableToolTable.part_id))
      .all()
      .pipe(Effect.orDie)
    return {
      type: "source_unavailable" as const,
      source: unavailableSourceInfo(source),
      models: models.map(unavailableModelInfo),
      tools: tools.map(unavailableToolInfo),
    }
  })
}

export function recordChildResult(
  tx: Transaction,
  input: {
    readonly parentTurnID: Turn.ID
    readonly parentSessionID: SessionSchema.ID
    readonly parentTaskPartID: PartID
    readonly childTurnID: Turn.ID
    readonly childSessionID: SessionSchema.ID
    readonly requestedOutput:
      | { readonly state: "complete"; readonly value: unknown }
      | { readonly state: "incomplete"; readonly partial?: unknown; readonly reason: Turn.TerminalReason }
    readonly timeSettled: number
  },
): Effect.Effect<Turn.ChildResult, Turn.Error> {
  return Effect.gen(function* () {
    const child = yield* info(tx, input.childTurnID)
    const existing = yield* tx
      .select()
      .from(TurnChildResultTable)
      .where(eq(TurnChildResultTable.parent_task_part_id, input.parentTaskPartID))
      .get()
      .pipe(Effect.orDie)
    const output =
      input.requestedOutput.state === "complete" ? input.requestedOutput.value : input.requestedOutput.partial
    const reason = input.requestedOutput.state === "incomplete" ? input.requestedOutput.reason : undefined
    if (existing) {
      if (
        existing.parent_turn_id !== input.parentTurnID ||
        existing.parent_session_id !== input.parentSessionID ||
        existing.child_turn_id !== input.childTurnID ||
        existing.child_session_id !== input.childSessionID ||
        existing.terminal_outcome !== child.state ||
        existing.requested_output_state !== input.requestedOutput.state ||
        !isDeepStrictEqual(existing.requested_output, output) ||
        existing.reason !== reason
      ) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.parentTurnID })
      }
      return childResultInfo(existing)
    }
    if (child.state === "running" || !child.terminal) {
      return yield* integrity(input.childTurnID, "Child result requires a terminal child Turn")
    }
    if (
      child.sessionID !== input.childSessionID ||
      !child.lineage ||
      child.lineage.parentTurnID !== input.parentTurnID ||
      child.lineage.parentSessionID !== input.parentSessionID ||
      child.lineage.parentTaskPartID !== input.parentTaskPartID
    ) {
      return yield* integrity(input.childTurnID, "Child result does not match the admitted child lineage")
    }
    if ((child.state === "completed") !== (input.requestedOutput.state === "complete")) {
      return yield* integrity(input.childTurnID, "Child result completeness conflicts with the terminal outcome")
    }
    const parent = yield* info(tx, input.parentTurnID)
    if (parent.sessionID !== input.parentSessionID || parent.state !== "running") {
      return yield* integrity(input.parentTurnID, "Child result requires its exact running parent Turn")
    }
    const timeSettled = Math.max(input.timeSettled, DateTime.toEpochMillis(child.terminal.time))
    yield* tx
      .insert(TurnChildResultTable)
      .values({
        parent_task_part_id: input.parentTaskPartID,
        parent_turn_id: input.parentTurnID,
        parent_session_id: input.parentSessionID,
        child_turn_id: input.childTurnID,
        child_session_id: input.childSessionID,
        terminal_outcome: child.state,
        requested_output_state: input.requestedOutput.state,
        requested_output: output,
        reason,
        time_settled: timeSettled,
      })
      .run()
      .pipe(Effect.orDie)
    const row = yield* tx
      .select()
      .from(TurnChildResultTable)
      .where(eq(TurnChildResultTable.parent_task_part_id, input.parentTaskPartID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* integrity(input.parentTurnID, "Child result disappeared after settlement")
    return childResultInfo(row)
  })
}

export function childResult(tx: Transaction, parentTaskPartID: PartID): Effect.Effect<Turn.ChildResult | undefined> {
  return tx
    .select()
    .from(TurnChildResultTable)
    .where(eq(TurnChildResultTable.parent_task_part_id, parentTaskPartID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row ? childResultInfo(row) : undefined)),
    )
}

export function recordHistoricalInputPresentation(
  tx: Transaction,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly messageID: MessageID
    readonly sourceSessionID: SessionSchema.ID
    readonly sourceTurnID: Turn.ID
    readonly sourceInputID: Turn.InputID
    readonly occurrenceID?: OccurrenceID
    readonly timeCreated: number
  },
) {
  return Effect.gen(function* () {
    const existing = yield* tx
      .select()
      .from(TurnHistoricalInputPresentationTable)
      .where(eq(TurnHistoricalInputPresentationTable.message_id, input.messageID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      if (
        existing.session_id !== input.sessionID ||
        existing.source_session_id !== input.sourceSessionID ||
        existing.source_turn_id !== input.sourceTurnID ||
        existing.source_input_id !== input.sourceInputID ||
        existing.occurrence_id !== input.occurrenceID
      ) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.sourceTurnID })
      }
      return existing
    }
    yield* tx
      .insert(TurnHistoricalInputPresentationTable)
      .values({
        message_id: input.messageID,
        session_id: input.sessionID,
        source_session_id: input.sourceSessionID,
        source_turn_id: input.sourceTurnID,
        source_input_id: input.sourceInputID,
        occurrence_id: input.occurrenceID,
        time_created: input.timeCreated,
      })
      .run()
      .pipe(Effect.orDie)
    return yield* tx
      .select()
      .from(TurnHistoricalInputPresentationTable)
      .where(eq(TurnHistoricalInputPresentationTable.message_id, input.messageID))
      .get()
      .pipe(Effect.orDie)
  })
}

export function recordHistoricalModelPresentation(
  tx: Transaction,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly assistantMessageID: MessageID
    readonly sourceSessionID: SessionSchema.ID
    readonly sourceTurnID: Turn.ID
    readonly sourceAssistantMessageID: MessageID
    readonly causalOccurrenceID?: OccurrenceID
    readonly timeCreated: number
  },
) {
  return Effect.gen(function* () {
    const existing = yield* tx
      .select()
      .from(TurnHistoricalModelPresentationTable)
      .where(eq(TurnHistoricalModelPresentationTable.assistant_message_id, input.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      if (
        existing.session_id !== input.sessionID ||
        existing.source_session_id !== input.sourceSessionID ||
        existing.source_turn_id !== input.sourceTurnID ||
        existing.source_assistant_message_id !== input.sourceAssistantMessageID ||
        existing.causal_occurrence_id !== input.causalOccurrenceID
      ) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.sourceTurnID })
      }
      return existing
    }
    yield* tx
      .insert(TurnHistoricalModelPresentationTable)
      .values({
        assistant_message_id: input.assistantMessageID,
        session_id: input.sessionID,
        source_session_id: input.sourceSessionID,
        source_turn_id: input.sourceTurnID,
        source_assistant_message_id: input.sourceAssistantMessageID,
        causal_occurrence_id: input.causalOccurrenceID,
        time_created: input.timeCreated,
      })
      .run()
      .pipe(Effect.orDie)
    return yield* tx
      .select()
      .from(TurnHistoricalModelPresentationTable)
      .where(eq(TurnHistoricalModelPresentationTable.assistant_message_id, input.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
  })
}

export function recordHistoricalToolPresentation(
  tx: Transaction,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly assistantMessageID: MessageID
    readonly partID: PartID
    readonly sourceSessionID: SessionSchema.ID
    readonly sourceTurnID: Turn.ID
    readonly sourceAssistantMessageID: MessageID
    readonly sourcePartID: PartID
    readonly callID: string
    readonly timeCreated: number
  },
) {
  return Effect.gen(function* () {
    const existing = yield* tx
      .select()
      .from(TurnHistoricalToolPresentationTable)
      .where(eq(TurnHistoricalToolPresentationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      if (
        existing.session_id !== input.sessionID ||
        existing.assistant_message_id !== input.assistantMessageID ||
        existing.source_session_id !== input.sourceSessionID ||
        existing.source_turn_id !== input.sourceTurnID ||
        existing.source_assistant_message_id !== input.sourceAssistantMessageID ||
        existing.source_part_id !== input.sourcePartID ||
        existing.call_id !== input.callID
      ) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.sourceTurnID })
      }
      return existing
    }
    yield* tx
      .insert(TurnHistoricalToolPresentationTable)
      .values({
        part_id: input.partID,
        session_id: input.sessionID,
        assistant_message_id: input.assistantMessageID,
        source_session_id: input.sourceSessionID,
        source_turn_id: input.sourceTurnID,
        source_assistant_message_id: input.sourceAssistantMessageID,
        source_part_id: input.sourcePartID,
        call_id: input.callID,
        time_created: input.timeCreated,
      })
      .run()
      .pipe(Effect.orDie)
    return yield* tx
      .select()
      .from(TurnHistoricalToolPresentationTable)
      .where(eq(TurnHistoricalToolPresentationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
  })
}

export function copyHistoricalInputPresentation(
  tx: Transaction,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly messageID: MessageID
    readonly sourceSessionID: SessionSchema.ID
    readonly sourceMessageID: MessageID
    readonly timeCreated: number
  },
) {
  return Effect.gen(function* () {
    const live = yield* tx
      .select()
      .from(TurnInputPresentationTable)
      .where(eq(TurnInputPresentationTable.message_id, input.sourceMessageID))
      .get()
      .pipe(Effect.orDie)
    if (live) {
      if (live.session_id !== input.sourceSessionID) {
        return yield* integrity(Turn.ID.create(), "Historical input source belongs to another Session")
      }
      const source = yield* tx
        .select()
        .from(TurnInputTable)
        .where(eq(TurnInputTable.id, live.input_id))
        .get()
        .pipe(Effect.orDie)
      if (!source) return yield* integrity(Turn.ID.create(), "Historical input source membership is missing")
      return yield* recordHistoricalInputPresentation(tx, {
        sessionID: input.sessionID,
        messageID: input.messageID,
        sourceSessionID: source.session_id,
        sourceTurnID: source.turn_id,
        sourceInputID: source.id,
        occurrenceID: source.occurrence_id ?? undefined,
        timeCreated: input.timeCreated,
      })
    }
    const historical = yield* tx
      .select()
      .from(TurnHistoricalInputPresentationTable)
      .where(eq(TurnHistoricalInputPresentationTable.message_id, input.sourceMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!historical) return undefined
    if (historical.session_id !== input.sourceSessionID) {
      return yield* integrity(historical.source_turn_id, "Historical input presentation belongs to another Session")
    }
    return yield* recordHistoricalInputPresentation(tx, {
      sessionID: input.sessionID,
      messageID: input.messageID,
      sourceSessionID: historical.source_session_id,
      sourceTurnID: historical.source_turn_id,
      sourceInputID: historical.source_input_id,
      occurrenceID: historical.occurrence_id ?? undefined,
      timeCreated: input.timeCreated,
    })
  })
}

export function copyHistoricalModelPresentation(
  tx: Transaction,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly assistantMessageID: MessageID
    readonly sourceSessionID: SessionSchema.ID
    readonly sourceAssistantMessageID: MessageID
    readonly timeCreated: number
  },
) {
  return Effect.gen(function* () {
    const live = yield* tx
      .select()
      .from(TurnModelPresentationTable)
      .where(eq(TurnModelPresentationTable.assistant_message_id, input.sourceAssistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (live) {
      if (live.session_id !== input.sourceSessionID) {
        return yield* integrity(Turn.ID.create(), "Historical model source belongs to another Session")
      }
      const source = yield* tx
        .select()
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.assistant_message_id, input.sourceAssistantMessageID))
        .get()
        .pipe(Effect.orDie)
      if (!source) return yield* integrity(Turn.ID.create(), "Historical model source membership is missing")
      return yield* recordHistoricalModelPresentation(tx, {
        sessionID: input.sessionID,
        assistantMessageID: input.assistantMessageID,
        sourceSessionID: source.session_id,
        sourceTurnID: source.turn_id,
        sourceAssistantMessageID: source.assistant_message_id,
        causalOccurrenceID: source.causal_occurrence_id ?? undefined,
        timeCreated: input.timeCreated,
      })
    }
    const historical = yield* tx
      .select()
      .from(TurnHistoricalModelPresentationTable)
      .where(eq(TurnHistoricalModelPresentationTable.assistant_message_id, input.sourceAssistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!historical) return undefined
    if (historical.session_id !== input.sourceSessionID) {
      return yield* integrity(historical.source_turn_id, "Historical model presentation belongs to another Session")
    }
    return yield* recordHistoricalModelPresentation(tx, {
      sessionID: input.sessionID,
      assistantMessageID: input.assistantMessageID,
      sourceSessionID: historical.source_session_id,
      sourceTurnID: historical.source_turn_id,
      sourceAssistantMessageID: historical.source_assistant_message_id,
      causalOccurrenceID: historical.causal_occurrence_id ?? undefined,
      timeCreated: input.timeCreated,
    })
  })
}

export function copyHistoricalToolPresentation(
  tx: Transaction,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly assistantMessageID: MessageID
    readonly partID: PartID
    readonly sourceSessionID: SessionSchema.ID
    readonly sourcePartID: PartID
    readonly timeCreated: number
  },
) {
  return Effect.gen(function* () {
    const live = yield* tx
      .select()
      .from(TurnCandidatePresentationTable)
      .where(eq(TurnCandidatePresentationTable.part_id, input.sourcePartID))
      .get()
      .pipe(Effect.orDie)
    if (live) {
      if (live.session_id !== input.sourceSessionID) {
        return yield* integrity(Turn.ID.create(), "Historical Tool source belongs to another Session")
      }
      const source = yield* tx
        .select()
        .from(TurnToolCandidateTable)
        .where(eq(TurnToolCandidateTable.part_id, input.sourcePartID))
        .get()
        .pipe(Effect.orDie)
      if (!source) return yield* integrity(Turn.ID.create(), "Historical Tool source membership is missing")
      return yield* recordHistoricalToolPresentation(tx, {
        sessionID: input.sessionID,
        assistantMessageID: input.assistantMessageID,
        partID: input.partID,
        sourceSessionID: source.session_id,
        sourceTurnID: source.turn_id,
        sourceAssistantMessageID: source.assistant_message_id,
        sourcePartID: source.part_id,
        callID: source.call_id,
        timeCreated: input.timeCreated,
      })
    }
    const historical = yield* tx
      .select()
      .from(TurnHistoricalToolPresentationTable)
      .where(eq(TurnHistoricalToolPresentationTable.part_id, input.sourcePartID))
      .get()
      .pipe(Effect.orDie)
    if (!historical) return undefined
    if (historical.session_id !== input.sourceSessionID) {
      return yield* integrity(historical.source_turn_id, "Historical Tool presentation belongs to another Session")
    }
    return yield* recordHistoricalToolPresentation(tx, {
      sessionID: input.sessionID,
      assistantMessageID: input.assistantMessageID,
      partID: input.partID,
      sourceSessionID: historical.source_session_id,
      sourceTurnID: historical.source_turn_id,
      sourceAssistantMessageID: historical.source_assistant_message_id,
      sourcePartID: historical.source_part_id,
      callID: historical.call_id,
      timeCreated: input.timeCreated,
    })
  })
}

export function prepareTranscriptRemoval(
  tx: Transaction,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly messageIDs: readonly MessageID[]
    readonly partIDs: readonly PartID[]
    readonly timeRemoved: number
  },
): Effect.Effect<{ readonly turnIDs: readonly Turn.ID[]; readonly candidatePartIDs: readonly PartID[] }, Turn.Error> {
  return Effect.gen(function* () {
    const messageIDs = [...new Set(input.messageIDs)]
    const partIDs = [...new Set(input.partIDs)]
    if (messageIDs.length === 0 && partIDs.length === 0) return { turnIDs: [], candidatePartIDs: [] }
    const historicalInputs =
      messageIDs.length === 0
        ? []
        : yield* tx
            .select()
            .from(TurnHistoricalInputPresentationTable)
            .where(inArray(TurnHistoricalInputPresentationTable.message_id, messageIDs))
            .all()
            .pipe(Effect.orDie)
    const historicalModels =
      messageIDs.length === 0
        ? []
        : yield* tx
            .select()
            .from(TurnHistoricalModelPresentationTable)
            .where(inArray(TurnHistoricalModelPresentationTable.assistant_message_id, messageIDs))
            .all()
            .pipe(Effect.orDie)
    const historicalToolCondition =
      messageIDs.length > 0 && partIDs.length > 0
        ? or(
            inArray(TurnHistoricalToolPresentationTable.assistant_message_id, messageIDs),
            inArray(TurnHistoricalToolPresentationTable.part_id, partIDs),
          )
        : messageIDs.length > 0
          ? inArray(TurnHistoricalToolPresentationTable.assistant_message_id, messageIDs)
          : inArray(TurnHistoricalToolPresentationTable.part_id, partIDs)
    const historicalTools = yield* tx
      .select()
      .from(TurnHistoricalToolPresentationTable)
      .where(historicalToolCondition)
      .all()
      .pipe(Effect.orDie)
    const removeHistorical = Effect.gen(function* () {
      if (historicalInputs.length > 0) {
        yield* tx
          .delete(TurnHistoricalInputPresentationTable)
          .where(
            inArray(
              TurnHistoricalInputPresentationTable.message_id,
              historicalInputs.map((row) => row.message_id),
            ),
          )
          .run()
          .pipe(Effect.orDie)
      }
      if (historicalModels.length > 0) {
        yield* tx
          .delete(TurnHistoricalModelPresentationTable)
          .where(
            inArray(
              TurnHistoricalModelPresentationTable.assistant_message_id,
              historicalModels.map((row) => row.assistant_message_id),
            ),
          )
          .run()
          .pipe(Effect.orDie)
      }
      if (historicalTools.length > 0) {
        yield* tx
          .delete(TurnHistoricalToolPresentationTable)
          .where(
            inArray(
              TurnHistoricalToolPresentationTable.part_id,
              historicalTools.map((row) => row.part_id),
            ),
          )
          .run()
          .pipe(Effect.orDie)
      }
      yield* garbageCollectUnavailableSources(tx, [
        ...historicalInputs.map((row) => row.source_turn_id),
        ...historicalModels.map((row) => row.source_turn_id),
        ...historicalTools.map((row) => row.source_turn_id),
      ])
    })
    const inputs =
      messageIDs.length === 0
        ? []
        : yield* tx
            .select()
            .from(TurnInputTable)
            .where(and(eq(TurnInputTable.session_id, input.sessionID), inArray(TurnInputTable.message_id, messageIDs)))
            .all()
            .pipe(Effect.orDie)
    const models =
      messageIDs.length === 0
        ? []
        : yield* tx
            .select()
            .from(TurnModelOperationTable)
            .where(
              and(
                eq(TurnModelOperationTable.session_id, input.sessionID),
                inArray(TurnModelOperationTable.assistant_message_id, messageIDs),
              ),
            )
            .all()
            .pipe(Effect.orDie)
    const candidateCondition =
      messageIDs.length > 0 && partIDs.length > 0
        ? or(
            inArray(TurnToolCandidateTable.assistant_message_id, messageIDs),
            inArray(TurnToolCandidateTable.part_id, partIDs),
          )
        : messageIDs.length > 0
          ? inArray(TurnToolCandidateTable.assistant_message_id, messageIDs)
          : inArray(TurnToolCandidateTable.part_id, partIDs)
    const candidates = yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(and(eq(TurnToolCandidateTable.session_id, input.sessionID), candidateCondition))
      .all()
      .pipe(Effect.orDie)
    const turnIDs = [
      ...new Set([
        ...inputs.map((item) => item.turn_id),
        ...models.map((model) => model.turn_id),
        ...candidates.map((candidate) => candidate.turn_id),
      ]),
    ]
    if (turnIDs.length === 0) {
      yield* removeHistorical
      return { turnIDs, candidatePartIDs: [] }
    }
    const turns = yield* tx.select().from(TurnTable).where(inArray(TurnTable.id, turnIDs)).all().pipe(Effect.orDie)
    const running = turns.filter((turn) => turn.state === "running")
    if (running.length > 0) {
      return yield* new Turn.SessionTreeBusyError({
        sessionID: input.sessionID,
        activeTurnIDs: running.map((turn) => turn.id),
      })
    }
    if (turns.length !== turnIDs.length || turns.some((turn) => turn.time_terminal === null)) {
      return yield* integrity(turnIDs[0]!, "Transcript cleanup cannot recover a terminal Turn")
    }
    const candidatePartIDs = candidates.map((candidate) => candidate.part_id)
    const invocations =
      candidatePartIDs.length === 0
        ? []
        : yield* tx
            .select()
            .from(TurnToolInvocationTable)
            .where(inArray(TurnToolInvocationTable.part_id, candidatePartIDs))
            .all()
            .pipe(Effect.orDie)
    const invocationByPart = new Map(invocations.map((invocation) => [invocation.part_id, invocation]))
    const invalidCandidate = candidates.find((candidate) => {
      const invocation = invocationByPart.get(candidate.part_id)
      if (candidate.state === "pending_admission") return true
      if (candidate.state === "admitted") return !invocation || invocation.state === "running"
      return invocation !== undefined
    })
    if (invalidCandidate) {
      return yield* integrity(invalidCandidate.turn_id, "Transcript cleanup would split an unsettled Tool aggregate")
    }
    if (candidatePartIDs.length > 0) {
      const childReference = yield* Effect.all([
        tx
          .select({ id: TurnChildLineageTable.child_turn_id })
          .from(TurnChildLineageTable)
          .where(inArray(TurnChildLineageTable.parent_task_part_id, candidatePartIDs))
          .get()
          .pipe(Effect.orDie),
        tx
          .select({ id: TurnChildResultTable.child_turn_id })
          .from(TurnChildResultTable)
          .where(inArray(TurnChildResultTable.parent_task_part_id, candidatePartIDs))
          .get()
          .pipe(Effect.orDie),
      ])
      if (childReference.some(Boolean)) {
        return yield* integrity(candidates[0]!.turn_id, "Transcript cleanup would sever child task lineage")
      }
    }
    const timeRemoved = Math.max(
      input.timeRemoved,
      ...turns.map((turn) => turn.time_terminal!),
      ...candidates.map((candidate) => candidate.time_terminal ?? candidate.time_registered),
      ...invocations.map((invocation) => invocation.time_settled ?? invocation.time_admitted),
    )
    const initialInputIDs = new Set(turns.map((turn) => turn.initial_input_id))
    const redactedTurnIDs = [
      ...new Set(inputs.filter((item) => initialInputIDs.has(item.id)).map((item) => item.turn_id)),
    ]
    yield* Effect.forEach(
      redactedTurnIDs,
      (turnID) =>
        Effect.gen(function* () {
          yield* tx
            .insert(TurnTranscriptRedactionTable)
            .values({ turn_id: turnID, time_removed: timeRemoved, reason: "presentation_removed" })
            .onConflictDoNothing()
            .run()
            .pipe(Effect.orDie)
          yield* tx
            .update(TurnTable)
            .set({ normalized_envelope: {} })
            .where(and(eq(TurnTable.id, turnID), sql`${TurnTable.normalized_envelope} <> '{}'`))
            .run()
            .pipe(Effect.orDie)
        }),
      { discard: true },
    )
    yield* Effect.forEach(
      candidates,
      (candidate) =>
        Effect.gen(function* () {
          yield* tx
            .insert(TurnCandidateRedactionTable)
            .values({
              part_id: candidate.part_id,
              turn_id: candidate.turn_id,
              time_removed: timeRemoved,
              reason: "presentation_removed",
            })
            .onConflictDoNothing()
            .run()
            .pipe(Effect.orDie)
          yield* tx
            .update(TurnToolCandidateTable)
            .set({ normalized_envelope: {} })
            .where(
              and(
                eq(TurnToolCandidateTable.part_id, candidate.part_id),
                sql`${TurnToolCandidateTable.normalized_envelope} <> '{}'`,
              ),
            )
            .run()
            .pipe(Effect.orDie)
        }),
      { discard: true },
    )
    yield* removeHistorical
    return { turnIDs, candidatePartIDs }
  })
}

export function deleteSessionTree(
  tx: Transaction,
  input: {
    readonly rootSessionID: SessionSchema.ID
    readonly sessionIDs: readonly SessionSchema.ID[]
    readonly timeDeleted: number
  },
): Effect.Effect<
  { readonly sessionIDs: readonly SessionSchema.ID[]; readonly turnIDs: readonly Turn.ID[] },
  SessionTreeDeletionError
> {
  return Effect.gen(function* () {
    yield* deferForeignKeys(tx)
    const sessionIDs = [...new Set(input.sessionIDs)]
    const selected = new Set<SessionSchema.ID>(sessionIDs)
    const actual = yield* sessionTree(tx, input.rootSessionID)
    if (actual.length !== sessionIDs.length || actual.some((sessionID) => !selected.has(sessionID))) {
      return yield* new Turn.SessionTreeChangedError({ sessionID: input.rootSessionID })
    }
    const turns =
      sessionIDs.length === 0
        ? []
        : yield* tx
            .select()
            .from(TurnTable)
            .where(inArray(TurnTable.session_id, sessionIDs))
            .orderBy(asc(TurnTable.time_admitted), asc(TurnTable.id))
            .all()
            .pipe(Effect.orDie)
    const running = turns.filter((turn) => turn.state === "running")
    if (running.length > 0) {
      return yield* new Turn.SessionTreeBusyError({
        sessionID: input.rootSessionID,
        activeTurnIDs: running.map((turn) => turn.id),
      })
    }
    if (turns.some((turn) => turn.time_terminal === null)) {
      return yield* integrity(
        turns.find((turn) => turn.time_terminal === null)!.id,
        "Terminal Turn has no terminal time",
      )
    }

    const turnIDs = turns.map((turn) => turn.id)
    const references = yield* deletionReferences(tx, turnIDs, selected)
    const timeDeleted = Math.max(input.timeDeleted, ...turns.map((turn) => turn.time_terminal ?? turn.causal_time))
    yield* retainUnavailableSources(tx, turns, references, timeDeleted)
    yield* Effect.forEach(
      references.presentations.filter((presentation) => presentation.provenance === "origin"),
      (presentation) =>
        markSourceUnavailable(tx, { occurrenceID: presentation.occurrence_id, timeDeleted }).pipe(Effect.orDie),
      { discard: true },
    )
    yield* Effect.forEach(sessionIDs, (sessionID) => removeNoEffectInvocationsForSession(tx, sessionID), {
      discard: true,
    })

    yield* tx.delete(SessionTable).where(inArray(SessionTable.id, sessionIDs)).run().pipe(Effect.orDie)
    yield* garbageCollectUnavailableSources(tx, references.removedReferenceTurnIDs)
    yield* garbageCollectOccurrences(
      tx,
      references.presentations.map((presentation) => presentation.occurrence_id),
    )
    return { sessionIDs, turnIDs }
  })
}

export function garbageCollectUnavailableSources(tx: Transaction, turnIDs: readonly Turn.ID[]): Effect.Effect<void> {
  return Effect.gen(function* () {
    const parents = yield* Effect.forEach(
      [...new Set(turnIDs)],
      (turnID) =>
        Effect.gen(function* () {
          const source = yield* tx
            .select()
            .from(TurnUnavailableSourceTable)
            .where(eq(TurnUnavailableSourceTable.turn_id, turnID))
            .get()
            .pipe(Effect.orDie)
          if (!source) return undefined
          const models = yield* tx
            .select()
            .from(TurnUnavailableModelTable)
            .where(eq(TurnUnavailableModelTable.turn_id, turnID))
            .all()
            .pipe(Effect.orDie)
          const tools = yield* tx
            .select()
            .from(TurnUnavailableToolTable)
            .where(eq(TurnUnavailableToolTable.turn_id, turnID))
            .all()
            .pipe(Effect.orDie)
          const modelIDs = models.map((model) => model.assistant_message_id)
          const partIDs = tools.map((tool) => tool.part_id)
          const learningReference =
            modelIDs.length === 0 && partIDs.length === 0
              ? undefined
              : yield* tx
                  .select({ id: LearningCommandReceiptTable.id })
                  .from(LearningCommandReceiptTable)
                  .where(
                    modelIDs.length > 0 && partIDs.length > 0
                      ? or(
                          inArray(LearningCommandReceiptTable.assistant_message_id, modelIDs),
                          inArray(LearningCommandReceiptTable.invocation_part_id, partIDs),
                        )
                      : modelIDs.length > 0
                        ? inArray(LearningCommandReceiptTable.assistant_message_id, modelIDs)
                        : inArray(LearningCommandReceiptTable.invocation_part_id, partIDs),
                  )
                  .get()
                  .pipe(Effect.orDie)
          const references = yield* Effect.all([
            tx
              .select({ id: TurnHistoricalInputPresentationTable.message_id })
              .from(TurnHistoricalInputPresentationTable)
              .where(eq(TurnHistoricalInputPresentationTable.source_turn_id, turnID))
              .get()
              .pipe(Effect.orDie),
            tx
              .select({ id: TurnHistoricalModelPresentationTable.assistant_message_id })
              .from(TurnHistoricalModelPresentationTable)
              .where(eq(TurnHistoricalModelPresentationTable.source_turn_id, turnID))
              .get()
              .pipe(Effect.orDie),
            tx
              .select({ id: TurnHistoricalToolPresentationTable.part_id })
              .from(TurnHistoricalToolPresentationTable)
              .where(eq(TurnHistoricalToolPresentationTable.source_turn_id, turnID))
              .get()
              .pipe(Effect.orDie),
            tx
              .select({ id: TurnChildResultTable.parent_task_part_id })
              .from(TurnChildResultTable)
              .where(eq(TurnChildResultTable.child_turn_id, turnID))
              .get()
              .pipe(Effect.orDie),
            tx
              .select({ id: TurnUnavailableSourceTable.turn_id })
              .from(TurnUnavailableSourceTable)
              .where(eq(TurnUnavailableSourceTable.parent_turn_id, turnID))
              .get()
              .pipe(Effect.orDie),
            tx
              .select({ id: TurnChildLineageTable.child_turn_id })
              .from(TurnChildLineageTable)
              .where(eq(TurnChildLineageTable.parent_turn_id, turnID))
              .get()
              .pipe(Effect.orDie),
          ])
          if (learningReference || references.some(Boolean)) return undefined
          const occurrenceIDs = [
            source.causal_occurrence_id,
            ...models.map((model) => model.causal_occurrence_id),
          ].filter((occurrenceID): occurrenceID is OccurrenceID => occurrenceID !== null)
          yield* tx
            .delete(TurnUnavailableSourceTable)
            .where(eq(TurnUnavailableSourceTable.turn_id, turnID))
            .run()
            .pipe(Effect.orDie)
          yield* garbageCollectOccurrences(tx, occurrenceIDs)
          return source.parent_turn_id
        }),
      { concurrency: 1 },
    )
    const next = parents.filter((turnID): turnID is Turn.ID => turnID !== null && turnID !== undefined)
    if (next.length > 0) yield* garbageCollectUnavailableSources(tx, next)
  })
}

type DeletionReferences = Effect.Success<ReturnType<typeof deletionReferences>>

function deletionReferences(tx: Transaction, turnIDs: readonly Turn.ID[], selected: ReadonlySet<SessionSchema.ID>) {
  return Effect.gen(function* () {
    const presentations = yield* tx
      .select()
      .from(LearnerOccurrencePresentationTable)
      .where(inArray(LearnerOccurrencePresentationTable.session_id, [...selected]))
      .all()
      .pipe(Effect.orDie)
    if (turnIDs.length === 0) {
      return {
        presentations,
        survivingHistoricalInputs: [],
        survivingHistoricalModels: [],
        survivingHistoricalTools: [],
        survivingChildResults: [],
        survivingChildReceipts: [],
        learningReceipts: [],
        models: [],
        candidates: [],
        inputs: [],
        lineages: [],
        removedReferenceTurnIDs: [] as Turn.ID[],
      }
    }
    const [
      historicalInputs,
      historicalModels,
      historicalTools,
      childResults,
      childReceipts,
      models,
      candidates,
      inputs,
      lineages,
    ] = yield* Effect.all([
      tx
        .select()
        .from(TurnHistoricalInputPresentationTable)
        .where(inArray(TurnHistoricalInputPresentationTable.source_turn_id, turnIDs))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(TurnHistoricalModelPresentationTable)
        .where(inArray(TurnHistoricalModelPresentationTable.source_turn_id, turnIDs))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(TurnHistoricalToolPresentationTable)
        .where(inArray(TurnHistoricalToolPresentationTable.source_turn_id, turnIDs))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(TurnChildResultTable)
        .where(inArray(TurnChildResultTable.child_turn_id, turnIDs))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(TurnUnavailableSourceTable)
        .where(inArray(TurnUnavailableSourceTable.parent_turn_id, turnIDs))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(TurnModelOperationTable)
        .where(inArray(TurnModelOperationTable.turn_id, turnIDs))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(TurnToolCandidateTable)
        .where(inArray(TurnToolCandidateTable.turn_id, turnIDs))
        .all()
        .pipe(Effect.orDie),
      tx.select().from(TurnInputTable).where(inArray(TurnInputTable.turn_id, turnIDs)).all().pipe(Effect.orDie),
      tx
        .select()
        .from(TurnChildLineageTable)
        .where(inArray(TurnChildLineageTable.child_turn_id, turnIDs))
        .all()
        .pipe(Effect.orDie),
    ])
    const assistantIDs = models.map((model) => model.assistant_message_id)
    const partIDs = candidates.map((candidate) => candidate.part_id)
    const learningReceipts =
      assistantIDs.length === 0 && partIDs.length === 0
        ? []
        : yield* tx
            .select()
            .from(LearningCommandReceiptTable)
            .where(
              assistantIDs.length > 0 && partIDs.length > 0
                ? or(
                    inArray(LearningCommandReceiptTable.assistant_message_id, assistantIDs),
                    inArray(LearningCommandReceiptTable.invocation_part_id, partIDs),
                  )
                : assistantIDs.length > 0
                  ? inArray(LearningCommandReceiptTable.assistant_message_id, assistantIDs)
                  : inArray(LearningCommandReceiptTable.invocation_part_id, partIDs),
            )
            .all()
            .pipe(Effect.orDie)
    const targetHistoricalInputs = yield* tx
      .select({ turnID: TurnHistoricalInputPresentationTable.source_turn_id })
      .from(TurnHistoricalInputPresentationTable)
      .where(inArray(TurnHistoricalInputPresentationTable.session_id, [...selected]))
      .all()
      .pipe(Effect.orDie)
    const targetHistoricalModels = yield* tx
      .select({ turnID: TurnHistoricalModelPresentationTable.source_turn_id })
      .from(TurnHistoricalModelPresentationTable)
      .where(inArray(TurnHistoricalModelPresentationTable.session_id, [...selected]))
      .all()
      .pipe(Effect.orDie)
    const targetHistoricalTools = yield* tx
      .select({ turnID: TurnHistoricalToolPresentationTable.source_turn_id })
      .from(TurnHistoricalToolPresentationTable)
      .where(inArray(TurnHistoricalToolPresentationTable.session_id, [...selected]))
      .all()
      .pipe(Effect.orDie)
    const parentChildResults = yield* tx
      .select({ turnID: TurnChildResultTable.child_turn_id })
      .from(TurnChildResultTable)
      .where(inArray(TurnChildResultTable.parent_session_id, [...selected]))
      .all()
      .pipe(Effect.orDie)
    return {
      presentations,
      survivingHistoricalInputs: historicalInputs.filter((row) => !selected.has(row.session_id)),
      survivingHistoricalModels: historicalModels.filter((row) => !selected.has(row.session_id)),
      survivingHistoricalTools: historicalTools.filter((row) => !selected.has(row.session_id)),
      survivingChildResults: childResults.filter((row) => !selected.has(row.parent_session_id)),
      survivingChildReceipts: childReceipts,
      learningReceipts,
      models,
      candidates,
      inputs,
      lineages,
      removedReferenceTurnIDs: [
        ...targetHistoricalInputs.map((row) => row.turnID),
        ...targetHistoricalModels.map((row) => row.turnID),
        ...targetHistoricalTools.map((row) => row.turnID),
        ...parentChildResults.map((row) => row.turnID),
      ],
    }
  })
}

function retainUnavailableSources(
  tx: Transaction,
  turns: readonly (typeof TurnTable.$inferSelect)[],
  references: DeletionReferences,
  timeDeleted: number,
) {
  return Effect.gen(function* () {
    const modelByMessage = new Map(references.models.map((model) => [model.assistant_message_id, model]))
    const candidateByPart = new Map(references.candidates.map((candidate) => [candidate.part_id, candidate]))
    const inputByID = new Map(references.inputs.map((input) => [input.id, input]))
    const lineageByTurn = new Map(references.lineages.map((lineage) => [lineage.child_turn_id, lineage]))
    const referenced = new Set<Turn.ID>([
      ...references.survivingHistoricalInputs.map((row) => row.source_turn_id),
      ...references.survivingHistoricalModels.map((row) => row.source_turn_id),
      ...references.survivingHistoricalTools.map((row) => row.source_turn_id),
      ...references.survivingChildResults.map((row) => row.child_turn_id),
      ...references.survivingChildReceipts
        .map((row) => row.parent_turn_id)
        .filter((turnID): turnID is Turn.ID => turnID !== null),
    ])
    for (const receipt of references.learningReceipts) {
      const model = modelByMessage.get(receipt.assistant_message_id)
      const candidate = candidateByPart.get(receipt.invocation_part_id)
      if (!model || !candidate || model.turn_id !== candidate.turn_id) {
        return yield* integrity(
          model?.turn_id ?? candidate?.turn_id ?? Turn.ID.create(),
          "Learning receipt has no exact Turn operation",
        )
      }
      referenced.add(model.turn_id)
    }
    const selected = turns.filter((turn) => referenced.has(turn.id))
    for (const turn of selected) {
      const lineage = lineageByTurn.get(turn.id)
      const initialInput = inputByID.get(turn.initial_input_id)
      if (!initialInput || (turn.admission_kind === "delegated_task" && !lineage)) {
        return yield* integrity(turn.id, "Unavailable receipt cannot recover exact Turn lineage")
      }
      yield* tx
        .insert(TurnUnavailableSourceTable)
        .values({
          turn_id: turn.id,
          session_id: turn.session_id,
          admission_kind: turn.admission_kind,
          time_admitted: turn.time_admitted,
          time_terminal: turn.time_terminal!,
          outcome: turn.state as Exclude<Turn.State, "running">,
          parent_turn_id: lineage?.parent_turn_id,
          parent_session_id: lineage?.parent_session_id,
          parent_task_part_id: lineage?.parent_task_part_id,
          parent_model_message_id: lineage?.parent_model_message_id,
          depth: turn.depth,
          causal_occurrence_id: initialInput.occurrence_id,
          time_deleted: timeDeleted,
        })
        .run()
        .pipe(Effect.orDie)
    }

    const citedModels = new Map<MessageID, typeof TurnModelOperationTable.$inferSelect>()
    const citedTools = new Map<PartID, typeof TurnToolCandidateTable.$inferSelect>()
    for (const row of references.survivingHistoricalModels) {
      const model = modelByMessage.get(row.source_assistant_message_id)
      if (!model || model.turn_id !== row.source_turn_id) {
        return yield* integrity(row.source_turn_id, "Historical Assistant presentation has no exact source operation")
      }
      citedModels.set(model.assistant_message_id, model)
    }
    for (const row of references.survivingHistoricalTools) {
      const model = modelByMessage.get(row.source_assistant_message_id)
      const candidate = candidateByPart.get(row.source_part_id)
      if (!model || !candidate || model.turn_id !== row.source_turn_id || candidate.turn_id !== row.source_turn_id) {
        return yield* integrity(row.source_turn_id, "Historical Tool presentation has no exact source operation")
      }
      citedModels.set(model.assistant_message_id, model)
      citedTools.set(candidate.part_id, candidate)
    }
    for (const receipt of references.learningReceipts) {
      const model = modelByMessage.get(receipt.assistant_message_id)!
      const candidate = candidateByPart.get(receipt.invocation_part_id)!
      citedModels.set(model.assistant_message_id, model)
      citedTools.set(candidate.part_id, candidate)
    }
    yield* Effect.forEach(
      citedModels.values(),
      (model) =>
        tx
          .insert(TurnUnavailableModelTable)
          .values({
            turn_id: model.turn_id,
            assistant_message_id: model.assistant_message_id,
            causal_occurrence_id: model.causal_occurrence_id,
          })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    yield* Effect.forEach(
      citedTools.values(),
      (candidate) =>
        tx
          .insert(TurnUnavailableToolTable)
          .values({
            turn_id: candidate.turn_id,
            assistant_message_id: candidate.assistant_message_id,
            part_id: candidate.part_id,
            call_id: candidate.call_id,
          })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
  })
}

function sessionTree(tx: Transaction, rootSessionID: SessionSchema.ID) {
  return Effect.gen(function* () {
    const sessions = yield* tx
      .select({ id: SessionTable.id, parentID: SessionTable.parent_id })
      .from(SessionTable)
      .all()
      .pipe(Effect.orDie)
    if (!sessions.some((session) => session.id === rootSessionID)) {
      return yield* new Turn.SessionTreeChangedError({ sessionID: rootSessionID })
    }
    const selected = new Set<SessionSchema.ID>([rootSessionID])
    let changed = true
    while (changed) {
      const size = selected.size
      sessions.forEach((session) => {
        if (session.parentID && selected.has(session.parentID)) selected.add(session.id)
      })
      changed = selected.size !== size
    }
    return [...selected]
  })
}

function exhaustModel(
  tx: Transaction,
  turn: typeof TurnTable.$inferSelect,
  input: ModelAdmission,
  envelope: Json,
  fingerprint: string,
  observed: LearningFrontier.Snapshot,
) {
  return Effect.gen(function* () {
    yield* assertReconstructableBoundary(tx, turn.id)
    const time = Math.max(input.timeAdmitted, turn.causal_time, observed.time)
    yield* tx
      .update(TurnTable)
      .set({
        state: "exhausted",
        terminal_reason: "model_limit",
        time_terminal: time,
        causal_time: time,
        exhaustion_counter: "model",
        exhaustion_observed: turn.model_count,
        exhaustion_limit: turn.model_limit,
        exhaustion_attempt_id: input.assistantMessageID,
        exhaustion_envelope: envelope,
        exhaustion_envelope_fingerprint: fingerprint,
      })
      .where(and(eq(TurnTable.id, turn.id), eq(TurnTable.state, "running")))
      .run()
      .pipe(Effect.orDie)
    return yield* info(tx, turn.id)
  })
}

function exhaustTool(
  tx: Transaction,
  turn: typeof TurnTable.$inferSelect,
  candidate: typeof TurnToolCandidateTable.$inferSelect,
  attemptedTime: number,
) {
  return Effect.gen(function* () {
    yield* assertReconstructableBoundary(tx, turn.id, candidate.part_id)
    const time = Math.max(attemptedTime, turn.causal_time, candidate.time_registered)
    yield* tx
      .update(TurnToolCandidateTable)
      .set({ state: "not_started_limit", time_terminal: time, exhaustion_turn_id: turn.id })
      .where(
        and(
          eq(TurnToolCandidateTable.part_id, candidate.part_id),
          eq(TurnToolCandidateTable.state, "pending_admission"),
        ),
      )
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .update(TurnToolCandidateTable)
      .set({ state: "not_started_turn_exhausted", time_terminal: time, exhaustion_turn_id: turn.id })
      .where(
        and(
          eq(TurnToolCandidateTable.assistant_message_id, candidate.assistant_message_id),
          gt(TurnToolCandidateTable.emission_ordinal, candidate.emission_ordinal),
          eq(TurnToolCandidateTable.state, "pending_admission"),
        ),
      )
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .update(TurnTable)
      .set({
        state: "exhausted",
        terminal_reason: "tool_limit",
        time_terminal: time,
        causal_time: time,
        exhaustion_counter: "tool",
        exhaustion_observed: turn.tool_count,
        exhaustion_limit: turn.tool_limit,
        exhaustion_attempt_id: candidate.part_id,
        exhaustion_envelope: candidate.normalized_envelope,
        exhaustion_envelope_fingerprint: candidate.envelope_fingerprint,
      })
      .where(and(eq(TurnTable.id, turn.id), eq(TurnTable.state, "running")))
      .run()
      .pipe(Effect.orDie)
    return yield* info(tx, turn.id)
  })
}

function closeUnsettled(
  tx: Transaction,
  turn: typeof TurnTable.$inferSelect,
  outcome: "failed" | "interrupted",
  time: number,
) {
  const itemState = outcome === "failed" ? "failed" : "interrupted"
  const candidateState = outcome === "failed" ? "not_started_failed" : "not_started_interrupted"
  return Effect.gen(function* () {
    const models = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(and(eq(TurnModelOperationTable.turn_id, turn.id), eq(TurnModelOperationTable.state, "running")))
      .all()
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      models,
      (model) =>
        Effect.gen(function* () {
          if (!model.candidates_sealed) {
            const count = yield* tx
              .select({ value: sql<number>`count(*)` })
              .from(TurnToolCandidateTable)
              .where(eq(TurnToolCandidateTable.assistant_message_id, model.assistant_message_id))
              .get()
              .pipe(Effect.orDie)
            yield* tx
              .update(TurnModelOperationTable)
              .set({ candidates_sealed: true, candidate_count: count?.value ?? 0, time_candidates_sealed: time })
              .where(eq(TurnModelOperationTable.assistant_message_id, model.assistant_message_id))
              .run()
              .pipe(Effect.orDie)
          }
        }),
      { discard: true },
    )
    yield* tx
      .update(TurnToolCandidateTable)
      .set({ state: candidateState, time_terminal: time })
      .where(and(eq(TurnToolCandidateTable.turn_id, turn.id), eq(TurnToolCandidateTable.state, "pending_admission")))
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .update(TurnToolInvocationTable)
      .set({ state: itemState, time_settled: time })
      .where(and(eq(TurnToolInvocationTable.turn_id, turn.id), eq(TurnToolInvocationTable.state, "running")))
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .update(TurnModelOperationTable)
      .set({ state: itemState, time_settled: time })
      .where(and(eq(TurnModelOperationTable.turn_id, turn.id), eq(TurnModelOperationTable.state, "running")))
      .run()
      .pipe(Effect.orDie)
  })
}

function assertReconstructableBoundary(tx: Transaction, turnID: Turn.ID, rejectedPartID?: PartID) {
  return Effect.gen(function* () {
    const runningModel = yield* tx
      .select({ id: TurnModelOperationTable.assistant_message_id })
      .from(TurnModelOperationTable)
      .where(and(eq(TurnModelOperationTable.turn_id, turnID), eq(TurnModelOperationTable.state, "running")))
      .get()
      .pipe(Effect.orDie)
    const runningTool = yield* tx
      .select({ id: TurnToolInvocationTable.part_id })
      .from(TurnToolInvocationTable)
      .where(and(eq(TurnToolInvocationTable.turn_id, turnID), eq(TurnToolInvocationTable.state, "running")))
      .get()
      .pipe(Effect.orDie)
    const pendingEarlier = rejectedPartID
      ? yield* tx
          .select({ id: TurnToolCandidateTable.part_id })
          .from(TurnToolCandidateTable)
          .where(
            and(
              eq(TurnToolCandidateTable.turn_id, turnID),
              eq(TurnToolCandidateTable.state, "pending_admission"),
              sql`${TurnToolCandidateTable.part_id} <> ${rejectedPartID}`,
              lt(
                TurnToolCandidateTable.emission_ordinal,
                sql`(SELECT emission_ordinal FROM turn_tool_candidate WHERE part_id = ${rejectedPartID})`,
              ),
            ),
          )
          .get()
          .pipe(Effect.orDie)
      : undefined
    if (runningModel || runningTool || pendingEarlier) {
      return yield* integrity(turnID, "Exhaustion attempted before earlier work settled")
    }
  })
}

function assertEarlierCandidatesSettled(tx: Transaction, candidate: typeof TurnToolCandidateTable.$inferSelect) {
  return Effect.gen(function* () {
    const invalid = yield* tx
      .select({ partID: TurnToolCandidateTable.part_id, state: TurnToolCandidateTable.state })
      .from(TurnToolCandidateTable)
      .where(
        and(
          eq(TurnToolCandidateTable.assistant_message_id, candidate.assistant_message_id),
          lt(TurnToolCandidateTable.emission_ordinal, candidate.emission_ordinal),
          sql`(${TurnToolCandidateTable.state} = 'pending_admission' OR (${TurnToolCandidateTable.state} = 'admitted' AND EXISTS (SELECT 1 FROM turn_tool_invocation WHERE turn_tool_invocation.part_id = ${TurnToolCandidateTable.part_id} AND turn_tool_invocation.state = 'running')))`,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (invalid) return yield* integrity(candidate.turn_id, "FIFO predecessor is not settled")
  })
}

function requireRunning(tx: Transaction, turnID: Turn.ID, sessionID: SessionSchema.ID) {
  return Effect.gen(function* () {
    const row = yield* tx.select().from(TurnTable).where(eq(TurnTable.id, turnID)).get().pipe(Effect.orDie)
    if (!row) return yield* new Turn.NotFoundError({ turnID })
    if (row.session_id !== sessionID) return yield* new Turn.SessionMismatchError({ sessionID, turnID })
    if (row.state !== "running") {
      return yield* new Turn.NotSteerableError({ sessionID, turnID, state: row.state })
    }
    return row
  })
}

function requireInput(tx: Transaction, inputID: Turn.InputID): Effect.Effect<Turn.Input, Turn.Error> {
  return Effect.gen(function* () {
    const row = yield* tx.select().from(TurnInputTable).where(eq(TurnInputTable.id, inputID)).get().pipe(Effect.orDie)
    if (!row) return yield* integrity(Turn.ID.create(), "Turn input is missing")
    return inputInfo(row)
  })
}

function requireModel(tx: Transaction, turnID: Turn.ID, sessionID: SessionSchema.ID, assistantMessageID: MessageID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!row || row.turn_id !== turnID || row.session_id !== sessionID) {
      return yield* integrity(turnID, "Model operation is missing or belongs to another Turn")
    }
    return row
  })
}

function parentAdmission(tx: Transaction, input: DelegatedAdmission) {
  return Effect.gen(function* () {
    const parent = yield* tx
      .select()
      .from(TurnTable)
      .where(eq(TurnTable.id, input.parentTurnID))
      .get()
      .pipe(Effect.orDie)
    if (!parent || parent.state !== "running") {
      return yield* new Turn.NotFoundError({ turnID: input.parentTurnID })
    }
    const model = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, input.parentModelMessageID))
      .get()
      .pipe(Effect.orDie)
    const invocation = yield* tx
      .select({ partID: TurnToolInvocationTable.part_id, state: TurnToolInvocationTable.state })
      .from(TurnToolInvocationTable)
      .where(eq(TurnToolInvocationTable.part_id, input.parentTaskPartID))
      .get()
      .pipe(Effect.orDie)
    const candidate = yield* tx
      .select({ tool: TurnToolCandidateTable.tool })
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.part_id, input.parentTaskPartID))
      .get()
      .pipe(Effect.orDie)
    if (
      !model ||
      model.turn_id !== parent.id ||
      !invocation ||
      invocation.state !== "running" ||
      !candidate ||
      candidate.tool !== "task"
    ) {
      return yield* integrity(input.turnID, "Delegated admission does not name an admitted parent task invocation")
    }
    return { sessionID: parent.session_id, depth: parent.depth, causalOccurrenceID: model.causal_occurrence_id }
  })
}

function assertExactLineage(tx: Transaction, input: DelegatedAdmission) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnChildLineageTable)
      .where(eq(TurnChildLineageTable.child_turn_id, input.turnID))
      .get()
      .pipe(Effect.orDie)
    if (
      !row ||
      row.child_session_id !== input.sessionID ||
      row.parent_turn_id !== input.parentTurnID ||
      row.parent_task_part_id !== input.parentTaskPartID ||
      row.parent_model_message_id !== input.parentModelMessageID ||
      !isDeepStrictEqual(row.delegated_capability, input.delegatedCapability)
    ) {
      return yield* new Turn.AdmissionConflictError({ turnID: input.turnID })
    }
  })
}

function activeRow(tx: Transaction, sessionID: SessionSchema.ID) {
  return tx
    .select()
    .from(TurnTable)
    .where(and(eq(TurnTable.session_id, sessionID), eq(TurnTable.state, "running")))
    .get()
    .pipe(Effect.orDie)
}

function turnInfo(
  row: typeof TurnTable.$inferSelect,
  lineage: typeof TurnChildLineageTable.$inferSelect | undefined,
): Turn.Info {
  const terminal =
    row.state === "running" || row.time_terminal === null || row.terminal_reason === null
      ? undefined
      : {
          outcome: row.state,
          reason: row.terminal_reason,
          counters: { model: row.model_count, tool: row.tool_count },
          time: DateTime.makeUnsafe(row.time_terminal),
          ...(row.state === "exhausted" &&
          row.exhaustion_counter &&
          row.exhaustion_observed !== null &&
          row.exhaustion_limit !== null &&
          row.exhaustion_attempt_id &&
          row.exhaustion_envelope &&
          row.exhaustion_envelope_fingerprint
            ? {
                exhaustion: {
                  counter: row.exhaustion_counter,
                  observed: row.exhaustion_observed,
                  limit: row.exhaustion_limit,
                  rejectedAttemptID: row.exhaustion_attempt_id,
                  envelope: row.exhaustion_envelope,
                  envelopeFingerprint: row.exhaustion_envelope_fingerprint,
                  time: DateTime.makeUnsafe(row.time_terminal),
                },
              }
            : {}),
        }
  return {
    id: row.id,
    sessionID: row.session_id,
    admissionKind: row.admission_kind,
    initialInputID: row.initial_input_id,
    currentInputID: row.current_input_id,
    limits: { model: row.model_limit, tool: row.tool_limit },
    counters: { model: row.model_count, tool: row.tool_count },
    state: row.state,
    depth: row.depth,
    ...(lineage
      ? {
          lineage: {
            parentTurnID: lineage.parent_turn_id,
            parentSessionID: lineage.parent_session_id,
            parentTaskPartID: lineage.parent_task_part_id,
            parentModelMessageID: lineage.parent_model_message_id,
            depth: lineage.child_depth,
            delegatedCapability: lineage.delegated_capability,
          },
        }
      : {}),
    timeAdmitted: DateTime.makeUnsafe(row.time_admitted),
    causalTime: DateTime.makeUnsafe(row.causal_time),
    ...(terminal ? { terminal } : {}),
  }
}

function inputInfo(row: typeof TurnInputTable.$inferSelect): Turn.Input {
  return {
    id: row.id,
    turnID: row.turn_id,
    sessionID: row.session_id,
    messageID: row.message_id,
    source: row.source,
    ordinal: row.ordinal,
    ...(row.occurrence_id ? { occurrenceID: row.occurrence_id } : {}),
    ...(row.parent_model_message_id ? { parentModelMessageID: row.parent_model_message_id } : {}),
    timeAdmitted: DateTime.makeUnsafe(row.time_admitted),
    envelopeFingerprint: row.envelope_fingerprint,
  }
}

function modelInfo(row: typeof TurnModelOperationTable.$inferSelect): Turn.ModelOperation {
  return {
    turnID: row.turn_id,
    sessionID: row.session_id,
    assistantMessageID: row.assistant_message_id,
    inputID: row.input_id,
    ...(row.causal_occurrence_id ? { causalOccurrenceID: row.causal_occurrence_id } : {}),
    ordinal: row.ordinal,
    state: row.state,
    requestFingerprint: row.request_fingerprint,
    contextFingerprint: row.context_fingerprint,
    snapshotFrontier: {
      sequence: row.snapshot_frontier_sequence,
      time: DateTime.makeUnsafe(row.snapshot_frontier_time),
    },
    observedSharedFrontier: {
      sequence: row.observed_shared_frontier_sequence,
      time: DateTime.makeUnsafe(row.observed_shared_frontier_time),
    },
    timeAdmitted: DateTime.makeUnsafe(row.time_admitted),
    ...(row.time_settled ? { timeSettled: DateTime.makeUnsafe(row.time_settled) } : {}),
  }
}

function candidateInfo(row: typeof TurnToolCandidateTable.$inferSelect): Turn.ToolCandidate {
  return {
    turnID: row.turn_id,
    sessionID: row.session_id,
    assistantMessageID: row.assistant_message_id,
    partID: row.part_id,
    callID: row.call_id,
    tool: row.tool,
    emissionOrdinal: row.emission_ordinal,
    state: row.state,
    envelopeFingerprint: row.envelope_fingerprint,
    timeRegistered: DateTime.makeUnsafe(row.time_registered),
    ...(row.time_terminal ? { timeTerminal: DateTime.makeUnsafe(row.time_terminal) } : {}),
  }
}

function invocationInfo(row: typeof TurnToolInvocationTable.$inferSelect): Turn.ToolInvocation {
  return {
    turnID: row.turn_id,
    sessionID: row.session_id,
    assistantMessageID: row.assistant_message_id,
    partID: row.part_id,
    ordinal: row.ordinal,
    state: row.state,
    observedSharedFrontier: {
      sequence: row.observed_shared_frontier_sequence,
      time: DateTime.makeUnsafe(row.observed_shared_frontier_time),
    },
    consumedSharedFrontier: {
      sequence: row.consumed_shared_frontier_sequence,
      time: DateTime.makeUnsafe(row.consumed_shared_frontier_time),
    },
    ...(row.resulting_shared_frontier_sequence !== null && row.resulting_shared_frontier_time !== null
      ? {
          resultingSharedFrontier: {
            sequence: row.resulting_shared_frontier_sequence,
            time: DateTime.makeUnsafe(row.resulting_shared_frontier_time),
          },
        }
      : {}),
    timeAdmitted: DateTime.makeUnsafe(row.time_admitted),
    ...(row.time_settled ? { timeSettled: DateTime.makeUnsafe(row.time_settled) } : {}),
  }
}

function childResultInfo(row: typeof TurnChildResultTable.$inferSelect): Turn.ChildResult {
  return {
    parentTurnID: row.parent_turn_id,
    parentSessionID: row.parent_session_id,
    parentTaskPartID: row.parent_task_part_id,
    childTurnID: row.child_turn_id,
    childSessionID: row.child_session_id,
    terminalOutcome: row.terminal_outcome,
    requestedOutput:
      row.requested_output_state === "complete"
        ? { state: "complete", value: row.requested_output }
        : {
            state: "incomplete",
            ...(row.requested_output === null ? {} : { partial: row.requested_output }),
            reason: row.reason!,
          },
    timeSettled: DateTime.makeUnsafe(row.time_settled),
  }
}

function unavailableSourceInfo(row: typeof TurnUnavailableSourceTable.$inferSelect): Turn.UnavailableSource {
  return {
    turnID: row.turn_id,
    sessionID: row.session_id,
    admissionKind: row.admission_kind,
    timeAdmitted: DateTime.makeUnsafe(row.time_admitted),
    timeTerminal: DateTime.makeUnsafe(row.time_terminal),
    outcome: row.outcome,
    ...(row.parent_turn_id ? { parentTurnID: row.parent_turn_id } : {}),
    ...(row.parent_session_id ? { parentSessionID: row.parent_session_id } : {}),
    ...(row.parent_task_part_id ? { parentTaskPartID: row.parent_task_part_id } : {}),
    ...(row.parent_model_message_id ? { parentModelMessageID: row.parent_model_message_id } : {}),
    depth: row.depth,
    ...(row.causal_occurrence_id ? { causalOccurrenceID: row.causal_occurrence_id } : {}),
    timeDeleted: DateTime.makeUnsafe(row.time_deleted),
  }
}

function unavailableModelInfo(row: typeof TurnUnavailableModelTable.$inferSelect): Turn.UnavailableModelMapping {
  return {
    turnID: row.turn_id,
    assistantMessageID: row.assistant_message_id,
    ...(row.causal_occurrence_id ? { causalOccurrenceID: row.causal_occurrence_id } : {}),
  }
}

function unavailableToolInfo(row: typeof TurnUnavailableToolTable.$inferSelect): Turn.UnavailableToolMapping {
  return {
    turnID: row.turn_id,
    assistantMessageID: row.assistant_message_id,
    partID: row.part_id,
    callID: row.call_id,
  }
}

function exactCandidateSet(
  rows: readonly (typeof TurnToolCandidateTable.$inferSelect)[],
  inputs: readonly CandidateInput[],
) {
  return (
    rows.length === inputs.length &&
    rows.every((row, index) => {
      const input = inputs[index]
      return (
        !!input &&
        row.emission_ordinal === index &&
        row.part_id === input.partID &&
        row.call_id === input.callID &&
        row.tool === input.tool &&
        row.envelope_fingerprint === envelopeFingerprint(input.envelope) &&
        isDeepStrictEqual(row.normalized_envelope, input.envelope)
      )
    })
  )
}

export function envelopeFingerprint(value: Json) {
  return new Bun.CryptoHasher("sha256").update(stableStringify(value)).digest("hex")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (typeof value !== "object") throw new TypeError("Turn envelopes must contain only JSON values")
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`
}

function deferForeignKeys(tx: Transaction) {
  return tx.run("PRAGMA defer_foreign_keys = ON").pipe(Effect.orDie)
}

function integrity(turnID: Turn.ID, reason: string) {
  return new Turn.IntegrityError({ turnID, reason })
}
