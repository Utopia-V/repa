import { and, asc, eq, ne, or } from "drizzle-orm"
import { Effect } from "effect"
import { Course } from "../course"
import { CourseSelectionAcceptanceEffectTable } from "../course/sql"
import { SessionSchema } from "../session/schema"
import { MessageTable, PartTable } from "../session/sql"
import type { MessageID, PartID, SessionV1 } from "../v1/session"
import { Occurrence } from "./occurrence"
import type { OccurrenceID } from "./occurrence-schema"
import {
  AdmittedLearnerOccurrenceTable,
  HistoricalLearningToolPresentationTable,
  LearnerOccurrencePresentationTable,
} from "./occurrence.sql"
import {
  InvalidInvocationEnvelopeError,
  AppliedAssistantImmutableError,
  InvocationConflictError,
  InvocationNotFoundError,
  SettledPartImmutableError,
  createReceiptID,
  type AcceptCourseViewRevisionInvocation,
  type ErrorCode,
  type ErrorSettlement,
  type PermissionOutcome,
  type Settlement,
  type SettlementMetadata,
} from "./schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "./sql"
import type { Transaction } from "./transaction"

export const ACCEPT_COURSE_VIEW_REVISION_CAPABILITY = "accept_course_view_revision"
export const ACCEPT_COURSE_VIEW_REVISION_VERSION = 1

type StoredAssistant = Omit<SessionV1.Assistant, "id" | "sessionID">
type StoredToolPart = Omit<SessionV1.ToolPart, "id" | "sessionID" | "messageID">

export type Reservation =
  | { readonly type: "candidate" }
  | { readonly type: "terminal"; readonly reason: "already_applied" | "semantic_conflict" | "context_refresh_required" }
  | { readonly type: "admitted" }
  | { readonly type: "replay"; readonly settlement: Settlement }

export type SettlementResult =
  | { readonly type: "candidate" }
  | { readonly type: "settled"; readonly settlement: Settlement }
  | { readonly type: "replay"; readonly settlement: Settlement }

export type PhysicalInvocation = typeof LearningCommandInvocationTable.$inferSelect
export type AdmittedInvocation = PhysicalInvocation

export type PhysicalInvocationIdentity = Readonly<{
  partID: PartID
  assistantMessageID: MessageID
  providerCallID: string
}>

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

export function reserveAcceptance(tx: Transaction, input: AcceptCourseViewRevisionInvocation) {
  return Effect.gen(function* () {
    const fingerprint = invocationFingerprint(input)
    const physical = yield* findPhysical(tx, input, fingerprint)
    if (physical) {
      if (physical.status === "admitted") return { type: "admitted" as const }
      return { type: "replay" as const, settlement: requireSettlement(physical) }
    }

    yield* validateNewEnvelope(tx, input)
    yield* tx
      .insert(LearningCommandInvocationTable)
      .values({
        part_id: input.envelope.partID,
        session_id: input.envelope.sessionID,
        parent_user_message_id: input.envelope.parentUserMessageID,
        assistant_message_id: input.envelope.assistantMessageID,
        provider_call_id: input.envelope.providerCallID,
        occurrence_id: input.envelope.occurrenceID,
        command_name: ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        command_version: ACCEPT_COURSE_VIEW_REVISION_VERSION,
        emission_ordinal: input.envelope.emissionOrdinal,
        capability_identity: input.envelope.capabilityIdentity,
        capability_version: input.envelope.capabilityVersion,
        authorization_basis: input.envelope.authorizationBasis,
        input_fingerprint: fingerprint,
        status: "admitted",
        time_admitted: input.envelope.timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)
    return yield* reservationDecision(tx, input)
  })
}

export function settleReservation(
  tx: Transaction,
  input: AcceptCourseViewRevisionInvocation & { readonly settlement: SettlementMetadata },
) {
  return Effect.gen(function* () {
    const invocation = yield* requirePhysical(tx, input)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requireSettlement(invocation) }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const decision = yield* semanticDecision(tx, input)
    if (decision.type === "candidate") return { type: "candidate" as const }
    const settlement = yield* settlementForDecision(tx, decision, input.settlement)
    yield* settleInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function settleAcceptance(
  tx: Transaction,
  input: AcceptCourseViewRevisionInvocation & {
    readonly permission: PermissionOutcome
    readonly settlement: SettlementMetadata
  },
) {
  return Effect.gen(function* () {
    const invocation = yield* requirePhysical(tx, input)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requireSettlement(invocation) }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)

    const decision = yield* semanticDecision(tx, input)
    if (decision.type !== "candidate") {
      const settlement = yield* settlementForDecision(tx, decision, input.settlement)
      yield* settleInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }

    const permissionError = permissionErrorCode(input.permission)
    if (permissionError) {
      const settlement = errorSettlement(permissionError, input.settlement)
      yield* settleInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }

    const available = yield* Occurrence.requireAvailableSource(tx, {
      occurrenceID: input.envelope.occurrenceID,
      sessionID: input.envelope.sessionID,
      messageID: input.envelope.parentUserMessageID,
    }).pipe(
      Effect.map(() => true),
      Effect.catch(() => Effect.succeed(false)),
    )
    if (!available) {
      const settlement = errorSettlement("source_unavailable", input.settlement)
      yield* settleInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }

    const applied = yield* Course.applySelectionAcceptance(tx, {
      occurrenceID: input.envelope.occurrenceID,
      command: input.command,
      trustedTime: input.settlement.time,
    }).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (applied.type === "failure") {
      const settlement = courseErrorSettlement(applied.error, input.settlement)
      yield* settleInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }

    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, input.envelope.occurrenceID))
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
        assistant_message_id: input.envelope.assistantMessageID,
        invocation_part_id: input.envelope.partID,
        capability_identity: input.envelope.capabilityIdentity,
        capability_version: input.envelope.capabilityVersion,
        authorization_basis: input.envelope.authorizationBasis,
        effect_id: applied.value.id,
        time_committed: input.settlement.time,
        commit_order: input.settlement.order,
      })
      .run()
      .pipe(Effect.orDie)
    const settlement = {
      outcome: "applied",
      receiptID,
      effectID: applied.value.id,
      courseID: applied.value.courseID,
      revisionID: applied.value.revisionID,
      previousSelection: applied.value.previousSelection,
      committedSelection: applied.value.committedSelection,
      settlementTime: input.settlement.time,
      settlementOrder: input.settlement.order,
    } as const
    yield* settleInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function recoverInterrupted(
  tx: Transaction,
  input: { readonly partID: PartID; readonly settlement: SettlementMetadata },
) {
  return Effect.gen(function* () {
    const invocation = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!invocation) return yield* new InvocationNotFoundError({ partID: input.partID })
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requireSettlement(invocation) }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const settlement = errorSettlement("interrupted", input.settlement)
    yield* settleInvocation(tx, invocation.part_id, settlement)
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
  return lookupPhysicalInvocationByPart(tx, partID).pipe(
    Effect.map((row) => (row && row.status !== "admitted" ? row.settlement : undefined)),
  )
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
            .select({ id: CourseSelectionAcceptanceEffectTable.id })
            .from(CourseSelectionAcceptanceEffectTable)
            .where(eq(CourseSelectionAcceptanceEffectTable.occurrence_id, occurrenceID))
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

function reservationDecision(tx: Transaction, input: AcceptCourseViewRevisionInvocation) {
  return semanticDecision(tx, input).pipe(
    Effect.map(
      (decision): Reservation =>
        decision.type === "candidate" ? { type: "candidate" } : { type: "terminal", reason: decision.type },
    ),
  )
}

type SemanticDecision =
  | { readonly type: "candidate" }
  | {
      readonly type: "already_applied"
      readonly resolution: Extract<Course.SelectionAcceptanceResolution, { readonly type: "already_applied" }>
    }
  | {
      readonly type: "semantic_conflict"
      readonly resolution: Extract<Course.SelectionAcceptanceResolution, { readonly type: "semantic_conflict" }>
    }
  | { readonly type: "context_refresh_required"; readonly timeSettled: number }

function semanticDecision(tx: Transaction, input: AcceptCourseViewRevisionInvocation): Effect.Effect<SemanticDecision> {
  return Effect.gen(function* () {
    const resolution = yield* Course.resolveSelectionAcceptance(tx, {
      occurrenceID: input.envelope.occurrenceID,
      courseID: input.command.courseID,
      revisionID: input.command.revisionID,
    }).pipe(Effect.orDie)
    if (resolution.type === "already_applied") return { type: "already_applied" as const, resolution }
    if (resolution.type === "semantic_conflict") {
      return { type: "semantic_conflict" as const, resolution }
    }
    const occupied = yield* tx
      .select({
        partID: LearningCommandInvocationTable.part_id,
        timeSettled: LearningCommandInvocationTable.time_settled,
      })
      .from(LearningCommandInvocationTable)
      .where(
        and(
          eq(LearningCommandInvocationTable.assistant_message_id, input.envelope.assistantMessageID),
          eq(LearningCommandInvocationTable.status, "applied"),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (occupied) {
      return { type: "context_refresh_required" as const, timeSettled: occupied.timeSettled ?? 0 }
    }
    return { type: "candidate" as const }
  })
}

function settlementForDecision(
  tx: Transaction,
  decision: Exclude<SemanticDecision, { readonly type: "candidate" }>,
  metadata: SettlementMetadata,
) {
  if (decision.type === "semantic_conflict") {
    return requireMetadataFloor(metadata, decision.resolution.effect.timeCommitted).pipe(
      Effect.map(() =>
        errorSettlement("semantic_conflict", metadata, {
          effectID: decision.resolution.effect.id,
          acceptedRevisionID: decision.resolution.effect.revisionID,
        }),
      ),
    )
  }
  if (decision.type === "context_refresh_required") {
    return requireMetadataFloor(metadata, decision.timeSettled).pipe(
      Effect.map(() => errorSettlement("context_refresh_required", metadata)),
    )
  }
  return Effect.gen(function* () {
    yield* requireMetadataFloor(
      metadata,
      Math.max(decision.resolution.effect.timeCommitted, decision.resolution.currentSelectionTime),
    )
    const receipt = yield* tx
      .select({ id: LearningCommandReceiptTable.id })
      .from(LearningCommandReceiptTable)
      .where(eq(LearningCommandReceiptTable.effect_id, decision.resolution.effect.id))
      .get()
      .pipe(Effect.orDie)
    if (!receipt) return yield* Effect.die("Applied Course effect has no immutable receipt")
    return {
      outcome: "already_applied",
      receiptID: receipt.id,
      effectID: decision.resolution.effect.id,
      courseID: decision.resolution.effect.courseID,
      revisionID: decision.resolution.effect.revisionID,
      previousSelection: decision.resolution.effect.previousSelection,
      committedSelection: decision.resolution.effect.committedSelection,
      currentSelection: decision.resolution.currentSelection,
      relation: decision.resolution.relation,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } as const
  })
}

function findPhysical(tx: Transaction, input: AcceptCourseViewRevisionInvocation, fingerprint: string) {
  return Effect.gen(function* () {
    const row = yield* lookupPhysicalInvocation(tx, input.envelope)
    if (!row) return undefined
    if (row.input_fingerprint !== fingerprint) return yield* invocationConflict(input.envelope)
    return row
  })
}

function requirePhysical(tx: Transaction, input: AcceptCourseViewRevisionInvocation) {
  return Effect.gen(function* () {
    const row = yield* findPhysical(tx, input, invocationFingerprint(input))
    if (!row) return yield* new InvocationNotFoundError({ partID: input.envelope.partID })
    return row
  })
}

function validateNewEnvelope(tx: Transaction, input: AcceptCourseViewRevisionInvocation) {
  return Effect.gen(function* () {
    if (input.envelope.providerCallID.trim().length === 0) return yield* invalidEnvelope("missing_call_id")
    if (!Number.isSafeInteger(input.envelope.emissionOrdinal) || input.envelope.emissionOrdinal < 0) {
      return yield* invalidEnvelope("invalid_ordinal")
    }
    if (
      input.envelope.capabilityIdentity !== ACCEPT_COURSE_VIEW_REVISION_CAPABILITY ||
      input.envelope.capabilityVersion !== ACCEPT_COURSE_VIEW_REVISION_VERSION
    ) {
      return yield* invalidEnvelope("invalid_capability")
    }
    const presentation = yield* Occurrence.resolvePresentation(tx, {
      sessionID: input.envelope.sessionID,
      messageID: input.envelope.parentUserMessageID,
      occurrenceID: input.envelope.occurrenceID,
    }).pipe(Effect.mapError(() => new InvalidInvocationEnvelopeError({ reason: "wrong_parent" })))
    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, input.envelope.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    const assistant = yield* tx
      .select()
      .from(MessageTable)
      .where(
        and(
          eq(MessageTable.id, input.envelope.assistantMessageID),
          eq(MessageTable.session_id, input.envelope.sessionID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    const assistantData = assistant?.data as StoredAssistant | undefined
    if (
      !assistant ||
      !assistantData ||
      assistantData.role !== "assistant" ||
      assistantData.parentID !== input.envelope.parentUserMessageID
    ) {
      return yield* invalidEnvelope("wrong_assistant")
    }
    const part = yield* tx
      .select()
      .from(PartTable)
      .where(eq(PartTable.id, input.envelope.partID))
      .get()
      .pipe(Effect.orDie)
    const partData = part?.data as StoredToolPart | undefined
    if (
      !part ||
      !partData ||
      part.session_id !== input.envelope.sessionID ||
      part.message_id !== input.envelope.assistantMessageID ||
      partData.type !== "tool" ||
      partData.tool !== ACCEPT_COURSE_VIEW_REVISION_CAPABILITY ||
      partData.callID !== input.envelope.providerCallID ||
      !["pending", "running"].includes(partData.state.status)
    ) {
      return yield* invalidEnvelope("unreserved_part")
    }
    const historical = yield* tx
      .select({ partID: HistoricalLearningToolPresentationTable.part_id })
      .from(HistoricalLearningToolPresentationTable)
      .where(eq(HistoricalLearningToolPresentationTable.part_id, input.envelope.partID))
      .get()
      .pipe(Effect.orDie)
    if (historical) return yield* invalidEnvelope("historical_part")
    if (
      !occurrence ||
      input.envelope.timeAdmitted < 0 ||
      input.envelope.timeAdmitted < occurrence.time_admitted ||
      input.envelope.timeAdmitted < presentation.timeCreated ||
      input.envelope.timeAdmitted < assistant.time_created ||
      input.envelope.timeAdmitted < part.time_created
    ) {
      return yield* invalidEnvelope("invalid_time")
    }
  })
}

function invocationFingerprint(input: AcceptCourseViewRevisionInvocation) {
  return new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        command: ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        commandVersion: ACCEPT_COURSE_VIEW_REVISION_VERSION,
        occurrenceID: input.envelope.occurrenceID,
        sessionID: input.envelope.sessionID,
        parentUserMessageID: input.envelope.parentUserMessageID,
        assistantMessageID: input.envelope.assistantMessageID,
        partID: input.envelope.partID,
        providerCallID: input.envelope.providerCallID,
        emissionOrdinal: input.envelope.emissionOrdinal,
        capabilityIdentity: input.envelope.capabilityIdentity,
        capabilityVersion: input.envelope.capabilityVersion,
        authorizationBasis: input.envelope.authorizationBasis,
        timeAdmitted: input.envelope.timeAdmitted,
        input: {
          courseID: input.command.courseID,
          revisionID: input.command.revisionID,
          expectedCourseVersion: input.command.expectedCourseVersion,
          expectedSelectionRevisionID: input.command.expectedSelectionRevisionID ?? null,
          expectedSelectionVersion: input.command.expectedSelectionVersion,
          expectedViewVersion: input.command.expectedViewVersion,
          expectedRevisionVersion: input.command.expectedRevisionVersion,
        },
      }),
    )
    .digest("hex")
}

function settleInvocation(tx: Transaction, partID: PartID, settlement: Settlement) {
  return Effect.gen(function* () {
    const status = settlement.outcome === "error" ? "error" : settlement.outcome
    const updated = yield* tx
      .update(LearningCommandInvocationTable)
      .set({
        status,
        effect_id: settlement.outcome === "error" ? null : settlement.effectID,
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

function errorSettlement(
  code: ErrorCode,
  metadata: SettlementMetadata,
  detail?: ErrorSettlement["detail"],
): ErrorSettlement {
  return {
    outcome: "error",
    code,
    settlementTime: metadata.time,
    settlementOrder: metadata.order,
    detail,
  }
}

function courseErrorSettlement(error: Course.Error, metadata: SettlementMetadata): ErrorSettlement {
  if (error._tag === "Course.ConflictError") {
    return errorSettlement("stale", metadata, { entity: error.entity, id: error.id })
  }
  if (error._tag === "Course.InactiveError") {
    return errorSettlement("inactive", metadata, { entity: error.entity, id: error.id })
  }
  return errorSettlement("validation_error", metadata)
}

function permissionErrorCode(permission: PermissionOutcome): ErrorCode | undefined {
  if (permission.type === "allow") return undefined
  if (permission.type === "deny") return "permission_rejected"
  if (permission.type === "correct") return "permission_corrected"
  if (permission.type === "cancel") return "cancelled"
  return "interrupted"
}

function requireSettlement(row: typeof LearningCommandInvocationTable.$inferSelect): Settlement {
  if (!row.settlement) throw new Error(`Terminal learning invocation ${row.part_id} has no exact settlement`)
  return row.settlement
}

function requireSettlementMetadata(
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

function requireMetadataFloor(
  metadata: SettlementMetadata,
  floor: number,
): Effect.Effect<void, InvalidInvocationEnvelopeError> {
  if (metadata.time < floor) return invalidEnvelope("invalid_time")
  return Effect.void
}

function invocationConflict(input: PhysicalInvocationIdentity) {
  return Effect.fail(
    new InvocationConflictError({
      partID: input.partID,
      assistantMessageID: input.assistantMessageID,
      providerCallID: input.providerCallID,
    }),
  )
}

function invalidEnvelope(reason: InvalidInvocationEnvelopeError["reason"]) {
  return Effect.fail(new InvalidInvocationEnvelopeError({ reason }))
}
