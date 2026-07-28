import { and, asc, eq, ne, or } from "drizzle-orm"
import { Effect } from "effect"
import { SessionSchema } from "../session/schema"
import { MessageTable, PartTable } from "../session/sql"
import {
  TurnHistoricalInputPresentationTable,
  TurnHistoricalModelPresentationTable,
  TurnUnavailableModelTable,
  TurnUnavailableSourceTable,
} from "../turn/sql"
import type { MessageID, PartID, SessionV1 } from "../v1/session"
import { Occurrence } from "./occurrence"
import type { OccurrenceID } from "./occurrence-schema"
import {
  AdmittedLearnerOccurrenceTable,
  HistoricalLearningToolPresentationTable,
  LearnerOccurrencePresentationTable,
} from "./occurrence.sql"
import {
  AppliedAssistantImmutableError,
  InvalidInvocationEnvelopeError,
  InvocationConflictError,
  InvocationNotFoundError,
  SettledPartImmutableError,
  createReceiptID,
  type InvocationEnvelope,
  type PermissionOutcome,
  type PhysicalSettlement,
  type SettlementMetadata,
} from "./physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "./sql"
import type { Transaction } from "./transaction"

type StoredAssistant = Omit<SessionV1.Assistant, "id" | "sessionID">
type StoredToolPart = Omit<SessionV1.ToolPart, "id" | "sessionID" | "messageID">

export type PhysicalInvocation = typeof LearningCommandInvocationTable.$inferSelect
export type AdmittedInvocation = PhysicalInvocation

export type PhysicalInvocationIdentity = Readonly<{
  partID: PartID
  assistantMessageID: MessageID
  providerCallID: string
}>

export type CommandIdentity = Readonly<{
  name: string
  version: number
}>

export type Reservation =
  | { readonly type: "candidate" }
  | { readonly type: "terminal"; readonly reason: "already_applied" | "semantic_conflict" | "context_refresh_required" }
  | { readonly type: "admitted" }
  | { readonly type: "replay"; readonly settlement: PhysicalSettlement }

export type SettlementResult =
  | { readonly type: "candidate" }
  | { readonly type: "settled"; readonly settlement: PhysicalSettlement }
  | { readonly type: "replay"; readonly settlement: PhysicalSettlement }

export function lookupPhysicalInvocation(tx: Transaction, input: PhysicalInvocationIdentity) {
  return Effect.gen(function* () {
    const rows = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(
        or(
          eq(LearningCommandInvocationTable.part_id, input.partID),
          and(
            eq(LearningCommandInvocationTable.assistant_message_id, input.assistantMessageID),
            eq(LearningCommandInvocationTable.provider_call_id, input.providerCallID),
          ),
        ),
      )
      .all()
      .pipe(Effect.orDie)
    if (rows.length === 0) return undefined
    if (
      rows.length !== 1 ||
      rows[0]!.part_id !== input.partID ||
      rows[0]!.assistant_message_id !== input.assistantMessageID ||
      rows[0]!.provider_call_id !== input.providerCallID
    ) {
      return yield* invocationConflict(input)
    }
    return rows[0]!
  })
}

export function lookupPhysicalInvocationByPart(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearningCommandInvocationTable)
    .where(eq(LearningCommandInvocationTable.part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

export function findPhysicalInvocation(
  tx: Transaction,
  input: {
    readonly envelope: InvocationEnvelope
  },
  fingerprint: string,
  command: CommandIdentity,
) {
  return Effect.gen(function* () {
    const row = yield* lookupPhysicalInvocation(tx, input.envelope)
    if (!row) return undefined
    if (
      row.command_name !== command.name ||
      row.command_version !== command.version ||
      row.input_fingerprint !== fingerprint
    ) {
      return yield* invocationConflict(input.envelope)
    }
    return row
  })
}

export function requirePhysicalInvocation(
  tx: Transaction,
  input: {
    readonly envelope: InvocationEnvelope
  },
  fingerprint: string,
  command: CommandIdentity,
) {
  return Effect.gen(function* () {
    const row = yield* findPhysicalInvocation(tx, input, fingerprint, command)
    if (!row) return yield* new InvocationNotFoundError({ partID: input.envelope.partID })
    return row
  })
}

export function admitPhysicalInvocation(
  tx: Transaction,
  input: {
    readonly envelope: InvocationEnvelope
    readonly fingerprint: string
    readonly command: CommandIdentity
  },
) {
  return Effect.gen(function* () {
    yield* validateNewEnvelope(tx, input.envelope, input.command)
    yield* tx
      .insert(LearningCommandInvocationTable)
      .values({
        part_id: input.envelope.partID,
        turn_id: input.envelope.turnID,
        input_id: input.envelope.inputID,
        session_id: input.envelope.sessionID,
        parent_user_message_id: input.envelope.parentUserMessageID,
        assistant_message_id: input.envelope.assistantMessageID,
        provider_call_id: input.envelope.providerCallID,
        occurrence_id: input.envelope.occurrenceID,
        command_name: input.command.name,
        command_version: input.command.version,
        emission_ordinal: input.envelope.emissionOrdinal,
        capability_identity: input.envelope.capabilityIdentity,
        capability_version: input.envelope.capabilityVersion,
        authorization_basis: input.envelope.authorizationBasis,
        input_fingerprint: input.fingerprint,
        status: "admitted",
        time_admitted: input.envelope.timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)
  })
}

export function insertPhysicalReceipt(
  tx: Transaction,
  envelope: InvocationEnvelope,
  metadata: SettlementMetadata,
) {
  return Effect.gen(function* () {
    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, envelope.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (!occurrence) return yield* Effect.die("Applied learning command has no admitted occurrence")
    const receiptID = createReceiptID()
    yield* tx
      .insert(LearningCommandReceiptTable)
      .values({
        id: receiptID,
        occurrence_id: occurrence.id,
        origin_session_id: occurrence.origin_session_id,
        origin_message_id: occurrence.origin_message_id,
        assistant_message_id: envelope.assistantMessageID,
        invocation_part_id: envelope.partID,
        capability_identity: envelope.capabilityIdentity,
        capability_version: envelope.capabilityVersion,
        authorization_basis: envelope.authorizationBasis,
        time_committed: metadata.time,
        commit_order: metadata.order,
      })
      .run()
      .pipe(Effect.orDie)
    return receiptID
  })
}

export function settlePhysicalInvocation(
  tx: Transaction,
  partID: PartID,
  settlement: PhysicalSettlement,
) {
  return Effect.gen(function* () {
    const status = settlement.outcome === "error" ? "error" : settlement.outcome
    const updated = yield* tx
      .update(LearningCommandInvocationTable)
      .set({
        status,
        receipt_id: settlement.receiptID ?? null,
        settlement,
        time_settled: settlement.settlementTime,
        settlement_order: settlement.settlementOrder,
      })
      .where(
        and(eq(LearningCommandInvocationTable.part_id, partID), eq(LearningCommandInvocationTable.status, "admitted")),
      )
      .returning({ partID: LearningCommandInvocationTable.part_id })
      .get()
      .pipe(Effect.orDie)
    if (!updated) return yield* Effect.die("Learning invocation was not admitted during settlement")
  })
}

export function recoverInterrupted(
  tx: Transaction,
  input: { readonly partID: PartID; readonly settlement: SettlementMetadata },
) {
  return Effect.gen(function* () {
    const invocation = yield* lookupPhysicalInvocationByPart(tx, input.partID)
    if (!invocation) return yield* new InvocationNotFoundError({ partID: input.partID })
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const settlement = errorSettlement("interrupted", input.settlement)
    yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function listAdmitted(tx: Transaction, sessionID?: SessionSchema.ID) {
  return tx
    .select()
    .from(LearningCommandInvocationTable)
    .where(
      sessionID
        ? and(
            eq(LearningCommandInvocationTable.status, "admitted"),
            eq(LearningCommandInvocationTable.session_id, sessionID),
          )
        : eq(LearningCommandInvocationTable.status, "admitted"),
    )
    .orderBy(
      asc(LearningCommandInvocationTable.time_admitted),
      asc(LearningCommandInvocationTable.assistant_message_id),
      asc(LearningCommandInvocationTable.emission_ordinal),
      asc(LearningCommandInvocationTable.part_id),
    )
    .all()
    .pipe(Effect.orDie)
}

export function assertPartDeletable(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* tx
      .select({ partID: LearningCommandInvocationTable.part_id })
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (invocation) return yield* new SettledPartImmutableError({ partID })
  })
}

export function assertAssistantDeletable(tx: Transaction, assistantMessageID: MessageID) {
  return Effect.gen(function* () {
    const applied = yield* tx
      .select({ partID: LearningCommandInvocationTable.part_id })
      .from(LearningCommandInvocationTable)
      .where(
        and(
          eq(LearningCommandInvocationTable.assistant_message_id, assistantMessageID),
          eq(LearningCommandInvocationTable.status, "applied"),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (applied) {
      return yield* new AppliedAssistantImmutableError({ assistantMessageID, partID: applied.partID })
    }
  })
}

export function exactSettlement(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const row = yield* lookupPhysicalInvocationByPart(tx, partID)
    if (!row || row.status === "admitted") return undefined
    return requirePhysicalSettlement(row)
  })
}

export function removeNoEffectInvocationsForAssistant(tx: Transaction, assistantMessageID: MessageID) {
  return Effect.gen(function* () {
    yield* assertAssistantDeletable(tx, assistantMessageID)
    const rows = yield* tx
      .select({ occurrenceID: LearningCommandInvocationTable.occurrence_id })
      .from(LearningCommandInvocationTable)
      .where(
        and(
          eq(LearningCommandInvocationTable.assistant_message_id, assistantMessageID),
          ne(LearningCommandInvocationTable.status, "applied"),
        ),
      )
      .all()
      .pipe(Effect.orDie)
    yield* tx
      .delete(LearningCommandInvocationTable)
      .where(
        and(
          eq(LearningCommandInvocationTable.assistant_message_id, assistantMessageID),
          ne(LearningCommandInvocationTable.status, "applied"),
        ),
      )
      .run()
      .pipe(Effect.orDie)
    yield* garbageCollectOccurrences(
      tx,
      rows.map((row) => row.occurrenceID),
    )
  })
}

export function removeNoEffectInvocationsForSession(tx: Transaction, sessionID: SessionSchema.ID) {
  return Effect.gen(function* () {
    const rows = yield* tx
      .select({ occurrenceID: LearningCommandInvocationTable.occurrence_id })
      .from(LearningCommandInvocationTable)
      .where(
        and(
          eq(LearningCommandInvocationTable.session_id, sessionID),
          ne(LearningCommandInvocationTable.status, "applied"),
        ),
      )
      .all()
      .pipe(Effect.orDie)
    yield* tx
      .delete(LearningCommandInvocationTable)
      .where(
        and(
          eq(LearningCommandInvocationTable.session_id, sessionID),
          ne(LearningCommandInvocationTable.status, "applied"),
        ),
      )
      .run()
      .pipe(Effect.orDie)
    yield* garbageCollectOccurrences(
      tx,
      rows.map((row) => row.occurrenceID),
    )
  })
}

export function removeOccurrencePresentation(
  tx: Transaction,
  input: { readonly messageID: MessageID; readonly timeDeleted: number },
) {
  return Effect.gen(function* () {
    const occurrenceID = yield* Occurrence.removePresentation(tx, input)
    if (occurrenceID) yield* garbageCollectOccurrences(tx, [occurrenceID])
  })
}

export function garbageCollectOccurrences(tx: Transaction, occurrenceIDs: readonly OccurrenceID[]) {
  return Effect.forEach(
    [...new Set(occurrenceIDs)],
    (occurrenceID) =>
      Effect.gen(function* () {
        const references = yield* Effect.all([
          tx
            .select({ id: LearnerOccurrencePresentationTable.message_id })
            .from(LearnerOccurrencePresentationTable)
            .where(eq(LearnerOccurrencePresentationTable.occurrence_id, occurrenceID))
            .get()
            .pipe(Effect.orDie),
          tx
            .select({ id: LearningCommandInvocationTable.part_id })
            .from(LearningCommandInvocationTable)
            .where(eq(LearningCommandInvocationTable.occurrence_id, occurrenceID))
            .get()
            .pipe(Effect.orDie),
          tx
            .select({ id: LearningCommandReceiptTable.id })
            .from(LearningCommandReceiptTable)
            .where(eq(LearningCommandReceiptTable.occurrence_id, occurrenceID))
            .get()
            .pipe(Effect.orDie),
          tx
            .select({ id: TurnHistoricalInputPresentationTable.message_id })
            .from(TurnHistoricalInputPresentationTable)
            .where(eq(TurnHistoricalInputPresentationTable.occurrence_id, occurrenceID))
            .get()
            .pipe(Effect.orDie),
          tx
            .select({ id: TurnHistoricalModelPresentationTable.assistant_message_id })
            .from(TurnHistoricalModelPresentationTable)
            .where(eq(TurnHistoricalModelPresentationTable.causal_occurrence_id, occurrenceID))
            .get()
            .pipe(Effect.orDie),
          tx
            .select({ id: TurnUnavailableSourceTable.turn_id })
            .from(TurnUnavailableSourceTable)
            .where(eq(TurnUnavailableSourceTable.causal_occurrence_id, occurrenceID))
            .get()
            .pipe(Effect.orDie),
          tx
            .select({ id: TurnUnavailableModelTable.assistant_message_id })
            .from(TurnUnavailableModelTable)
            .where(eq(TurnUnavailableModelTable.causal_occurrence_id, occurrenceID))
            .get()
            .pipe(Effect.orDie),
        ])
        if (references.some(Boolean)) return
        yield* tx
          .delete(AdmittedLearnerOccurrenceTable)
          .where(eq(AdmittedLearnerOccurrenceTable.id, occurrenceID))
          .run()
          .pipe(Effect.orDie)
      }),
    { discard: true },
  )
}

export function appliedMutation(tx: Transaction, assistantMessageID: MessageID) {
  return tx
    .select({
      partID: LearningCommandInvocationTable.part_id,
      timeSettled: LearningCommandInvocationTable.time_settled,
    })
    .from(LearningCommandInvocationTable)
    .where(
      and(
        eq(LearningCommandInvocationTable.assistant_message_id, assistantMessageID),
        eq(LearningCommandInvocationTable.status, "applied"),
      ),
    )
    .get()
    .pipe(Effect.orDie)
}

export function occurrenceAvailable(tx: Transaction, envelope: InvocationEnvelope) {
  return Effect.gen(function* () {
    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, envelope.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (!occurrence) return false
    return yield* Occurrence.requireAvailableSource(tx, {
      occurrenceID: occurrence.id,
      sessionID: occurrence.origin_session_id,
      messageID: occurrence.origin_message_id,
    }).pipe(
      Effect.map(() => true),
      Effect.catch(() => Effect.succeed(false)),
    )
  })
}

export function permissionErrorCode(
  permission: PermissionOutcome,
): "permission_rejected" | "permission_corrected" | "cancelled" | "interrupted" | undefined {
  if (permission.type === "allow") return undefined
  if (permission.type === "deny") return "permission_rejected"
  if (permission.type === "correct") return "permission_corrected"
  if (permission.type === "cancel") return "cancelled"
  return "interrupted"
}

export function errorSettlement<const Code extends string, const Detail extends Readonly<Record<string, unknown>>>(
  code: Code,
  metadata: SettlementMetadata,
  detail?: Detail,
) {
  return {
    outcome: "error" as const,
    code,
    settlementTime: metadata.time,
    settlementOrder: metadata.order,
    detail,
  }
}

export function requirePhysicalSettlement(row: PhysicalInvocation) {
  if (!row.settlement) throw new Error(`Terminal learning invocation ${row.part_id} has no exact settlement`)
  return row.settlement
}

export function requireSettlementMetadata(
  timeAdmitted: number,
  metadata: SettlementMetadata,
): Effect.Effect<void, InvalidInvocationEnvelopeError> {
  if (
    !Number.isSafeInteger(metadata.time) ||
    metadata.time < timeAdmitted ||
    !Number.isSafeInteger(metadata.order) ||
    metadata.order < 0
  ) {
    return invalidEnvelope("invalid_time")
  }
  return Effect.void
}

export function requireMetadataFloor(
  metadata: SettlementMetadata,
  floor: number,
): Effect.Effect<void, InvalidInvocationEnvelopeError> {
  if (metadata.time < floor) return invalidEnvelope("invalid_time")
  return Effect.void
}

export function invocationConflict(input: PhysicalInvocationIdentity) {
  return Effect.fail(
    new InvocationConflictError({
      partID: input.partID,
      assistantMessageID: input.assistantMessageID,
      providerCallID: input.providerCallID,
    }),
  )
}

export function invalidEnvelope(reason: InvalidInvocationEnvelopeError["reason"]) {
  return Effect.fail(new InvalidInvocationEnvelopeError({ reason }))
}

function validateNewEnvelope(tx: Transaction, envelope: InvocationEnvelope, command: CommandIdentity) {
  return Effect.gen(function* () {
    if (envelope.providerCallID.trim().length === 0) return yield* invalidEnvelope("missing_call_id")
    if (!Number.isSafeInteger(envelope.emissionOrdinal) || envelope.emissionOrdinal < 0) {
      return yield* invalidEnvelope("invalid_ordinal")
    }
    if (envelope.capabilityIdentity !== command.name || envelope.capabilityVersion !== command.version) {
      return yield* invalidEnvelope("invalid_capability")
    }
    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, envelope.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    const assistant = yield* tx
      .select()
      .from(MessageTable)
      .where(and(eq(MessageTable.id, envelope.assistantMessageID), eq(MessageTable.session_id, envelope.sessionID)))
      .get()
      .pipe(Effect.orDie)
    const assistantData = assistant?.data as StoredAssistant | undefined
    if (
      !assistant ||
      !assistantData ||
      assistantData.role !== "assistant" ||
      assistantData.parentID !== envelope.parentUserMessageID
    ) {
      return yield* invalidEnvelope("wrong_assistant")
    }
    const part = yield* tx.select().from(PartTable).where(eq(PartTable.id, envelope.partID)).get().pipe(Effect.orDie)
    const partData = part?.data as StoredToolPart | undefined
    if (
      !part ||
      !partData ||
      part.session_id !== envelope.sessionID ||
      part.message_id !== envelope.assistantMessageID ||
      partData.type !== "tool" ||
      partData.tool !== command.name ||
      partData.callID !== envelope.providerCallID ||
      !["pending", "running"].includes(partData.state.status)
    ) {
      return yield* invalidEnvelope("unreserved_part")
    }
    const historical = yield* tx
      .select({ partID: HistoricalLearningToolPresentationTable.part_id })
      .from(HistoricalLearningToolPresentationTable)
      .where(eq(HistoricalLearningToolPresentationTable.part_id, envelope.partID))
      .get()
      .pipe(Effect.orDie)
    if (historical) return yield* invalidEnvelope("historical_part")
    if (
      !occurrence ||
      envelope.timeAdmitted < 0 ||
      envelope.timeAdmitted < occurrence.time_admitted ||
      envelope.timeAdmitted < assistant.time_created ||
      envelope.timeAdmitted < part.time_created
    ) {
      return yield* invalidEnvelope("invalid_time")
    }
  })
}
