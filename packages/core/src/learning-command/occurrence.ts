export * as Occurrence from "./occurrence"

import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { MessageTable, PartTable } from "../session/sql"
import { SessionSchema } from "../session/schema"
import type { MessageID, PartID, SessionV1 } from "../v1/session"
import {
  HistoricalPresentationConflictError,
  InvalidCausalSourceError,
  LearnerAdmission,
  OccurrenceConflictError,
  createOccurrenceID,
  type Error,
  type OccurrenceID,
  type PresentationProvenance,
  type SourceTemporalContext,
} from "./occurrence-schema"
import {
  AdmittedLearnerOccurrenceTable,
  HistoricalLearningToolPresentationTable,
  LearnerOccurrenceSourceOrderTable,
  LearnerOccurrencePresentationTable,
  LearnerOccurrenceTombstoneTable,
} from "./occurrence.sql"
import type { Transaction } from "./transaction"

export type Info = {
  readonly id: OccurrenceID
  readonly originSessionID: SessionSchema.ID
  readonly originMessageID: MessageID
  readonly timeAdmitted: number
  readonly sourceOrder?: number
  readonly sourceTemporalContext?: SourceTemporalContext
}

export type Presentation = {
  readonly messageID: MessageID
  readonly sessionID: SessionSchema.ID
  readonly occurrenceID: OccurrenceID
  readonly provenance: PresentationProvenance
  readonly sourceMessageID?: MessageID
  readonly contentFingerprint: string
  readonly timeCreated: number
}

export function admit(
  tx: Transaction,
  input: {
    readonly admission: LearnerAdmission
    readonly sessionID: SessionSchema.ID
    readonly messageID: MessageID
    readonly timeAdmitted: number
  },
): Effect.Effect<Info, Error> {
  return Effect.gen(function* () {
    if (!(input.admission instanceof LearnerAdmission)) {
      return yield* invalid("not_learner_input")
    }
    const observed = yield* observeLearnerPresentation(tx, input.sessionID, input.messageID)
    if (input.timeAdmitted < observed.timeCreated) return yield* invalid("invalid_time")

    const existing = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(
        and(
          eq(AdmittedLearnerOccurrenceTable.origin_session_id, input.sessionID),
          eq(AdmittedLearnerOccurrenceTable.origin_message_id, input.messageID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      const presentation = yield* tx
        .select()
        .from(LearnerOccurrencePresentationTable)
        .where(eq(LearnerOccurrencePresentationTable.message_id, input.messageID))
        .get()
        .pipe(Effect.orDie)
      if (
        !presentation ||
        presentation.occurrence_id !== existing.id ||
        presentation.session_id !== input.sessionID ||
        presentation.provenance !== "origin" ||
        presentation.content_fingerprint !== observed.fingerprint
      ) {
        return yield* new OccurrenceConflictError({ messageID: input.messageID })
      }
      return occurrenceInfo(existing)
    }

    const occurrenceID = createOccurrenceID()
    const sourceTemporalContext = input.admission.temporalContext(input.timeAdmitted)
    if (!sourceTemporalContext) return yield* invalid("invalid_time")
    const allocation = yield* tx
      .insert(LearnerOccurrenceSourceOrderTable)
      .values({
        occurrence_id: occurrenceID,
        origin_session_id: input.sessionID,
        origin_message_id: input.messageID,
        time_allocated: input.timeAdmitted,
        source_temporal_state: sourceTemporalContext.state,
        source_timezone: sourceTemporalContext.state === "resolved" ? sourceTemporalContext.timeZone : null,
        source_utc_offset_minutes:
          sourceTemporalContext.state === "resolved" ? sourceTemporalContext.utcOffsetMinutes : null,
        source_temporal_unavailable_reason:
          sourceTemporalContext.state === "unavailable" ? sourceTemporalContext.reason : null,
      })
      .returning({ sequence: LearnerOccurrenceSourceOrderTable.sequence })
      .get()
      .pipe(Effect.orDie)
    if (!allocation) return yield* Effect.die("Learner occurrence source order was not allocated")
    yield* tx
      .insert(AdmittedLearnerOccurrenceTable)
      .values({
        id: occurrenceID,
        origin_session_id: input.sessionID,
        origin_message_id: input.messageID,
        time_admitted: input.timeAdmitted,
        source_order: allocation.sequence,
        source_temporal_state: sourceTemporalContext.state,
        source_timezone: sourceTemporalContext.state === "resolved" ? sourceTemporalContext.timeZone : null,
        source_utc_offset_minutes:
          sourceTemporalContext.state === "resolved" ? sourceTemporalContext.utcOffsetMinutes : null,
        source_temporal_unavailable_reason:
          sourceTemporalContext.state === "unavailable" ? sourceTemporalContext.reason : null,
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(LearnerOccurrencePresentationTable)
      .values({
        message_id: input.messageID,
        session_id: input.sessionID,
        occurrence_id: occurrenceID,
        provenance: "origin",
        content_fingerprint: observed.fingerprint,
        time_created: observed.timeCreated,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      id: occurrenceID,
      originSessionID: input.sessionID,
      originMessageID: input.messageID,
      timeAdmitted: input.timeAdmitted,
      sourceOrder: allocation.sequence,
      sourceTemporalContext,
    }
  })
}

export function copyPresentation(
  tx: Transaction,
  input: {
    readonly sourceMessageID: MessageID
    readonly sessionID: SessionSchema.ID
    readonly messageID: MessageID
    readonly provenance: Exclude<PresentationProvenance, "origin">
  },
): Effect.Effect<Presentation, Error> {
  return Effect.gen(function* () {
    const source = yield* tx
      .select()
      .from(LearnerOccurrencePresentationTable)
      .where(eq(LearnerOccurrencePresentationTable.message_id, input.sourceMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!source) return yield* invalid("missing_presentation")

    const observed = yield* observeLearnerPresentation(tx, input.sessionID, input.messageID)
    const existing = yield* tx
      .select()
      .from(LearnerOccurrencePresentationTable)
      .where(eq(LearnerOccurrencePresentationTable.message_id, input.messageID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      if (
        existing.session_id !== input.sessionID ||
        existing.occurrence_id !== source.occurrence_id ||
        existing.provenance !== input.provenance ||
        existing.source_message_id !== input.sourceMessageID ||
        existing.content_fingerprint !== observed.fingerprint
      ) {
        return yield* new OccurrenceConflictError({ messageID: input.messageID })
      }
      return presentationInfo(existing)
    }

    yield* tx
      .insert(LearnerOccurrencePresentationTable)
      .values({
        message_id: input.messageID,
        session_id: input.sessionID,
        occurrence_id: source.occurrence_id,
        provenance: input.provenance,
        source_message_id: input.sourceMessageID,
        content_fingerprint: observed.fingerprint,
        time_created: observed.timeCreated,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      messageID: input.messageID,
      sessionID: input.sessionID,
      occurrenceID: source.occurrence_id,
      provenance: input.provenance,
      sourceMessageID: input.sourceMessageID,
      contentFingerprint: observed.fingerprint,
      timeCreated: observed.timeCreated,
    }
  })
}

export function resolvePresentation(
  tx: Transaction,
  input: { readonly sessionID: SessionSchema.ID; readonly messageID: MessageID; readonly occurrenceID?: OccurrenceID },
): Effect.Effect<Presentation, InvalidCausalSourceError> {
  return Effect.gen(function* () {
    const presentation = yield* tx
      .select()
      .from(LearnerOccurrencePresentationTable)
      .where(eq(LearnerOccurrencePresentationTable.message_id, input.messageID))
      .get()
      .pipe(Effect.orDie)
    if (!presentation) return yield* invalid("missing_presentation")
    if (presentation.session_id !== input.sessionID) return yield* invalid("wrong_session")
    if (input.occurrenceID && presentation.occurrence_id !== input.occurrenceID) {
      return yield* invalid("wrong_occurrence")
    }
    return presentationInfo(presentation)
  })
}

export function requireAvailableSource(
  tx: Transaction,
  input: { readonly sessionID: SessionSchema.ID; readonly messageID: MessageID; readonly occurrenceID: OccurrenceID },
): Effect.Effect<Presentation, InvalidCausalSourceError> {
  return Effect.gen(function* () {
    const presentation = yield* resolvePresentation(tx, input)
    const tombstone = yield* tx
      .select({ occurrenceID: LearnerOccurrenceTombstoneTable.occurrence_id })
      .from(LearnerOccurrenceTombstoneTable)
      .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, input.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (tombstone) return yield* invalid("source_unavailable")
    const observed = yield* observeLearnerPresentation(tx, input.sessionID, input.messageID)
    if (observed.fingerprint !== presentation.contentFingerprint) return yield* invalid("changed_presentation")
    return presentation
  })
}

/**
 * Read-only owner-native status for a durable learner occurrence. The admitted
 * occurrence and its tombstone are deliberately returned separately: deletion
 * changes current availability without rewriting the admitted source basis.
 */
export function inspectSourceStatusAtCut(
  tx: Transaction,
  input: { readonly occurrenceID: OccurrenceID; readonly asOf: number },
) {
  return Effect.gen(function* () {
    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, input.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    const tombstone = yield* tx
      .select()
      .from(LearnerOccurrenceTombstoneTable)
      .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, input.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    const admitted = occurrence && occurrence.time_admitted <= input.asOf ? occurrence : undefined
    const deleted = tombstone && tombstone.time_deleted <= input.asOf ? tombstone : undefined
    return {
      owner: "learner_occurrence" as const,
      occurrenceID: input.occurrenceID,
      asOf: input.asOf,
      state: !admitted
        ? ("missing" as const)
        : deleted
          ? ("source_unavailable" as const)
          : ("available" as const),
      admitted: admitted
        ? {
            originSessionID: admitted.origin_session_id,
            originMessageID: admitted.origin_message_id,
            sourceOrder: admitted.source_order,
            timeAdmitted: admitted.time_admitted,
            sourceTemporalState: admitted.source_temporal_state,
            sourceTimeZone: admitted.source_timezone ?? undefined,
            sourceUTCOffsetMinutes: admitted.source_utc_offset_minutes ?? undefined,
            sourceTemporalUnavailableReason: admitted.source_temporal_unavailable_reason ?? undefined,
          }
        : undefined,
      tombstone: deleted
        ? {
            reason: deleted.reason,
            timeDeleted: deleted.time_deleted,
          }
        : undefined,
    }
  })
}

export function markSourceUnavailable(
  tx: Transaction,
  input: { readonly occurrenceID: OccurrenceID; readonly timeDeleted: number },
) {
  return Effect.gen(function* () {
    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, input.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (!occurrence) return yield* invalid("missing_presentation")
    if (input.timeDeleted < occurrence.time_admitted) return yield* invalid("invalid_time")
    const existing = yield* tx
      .select()
      .from(LearnerOccurrenceTombstoneTable)
      .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, input.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (existing) return existing
    yield* tx
      .insert(LearnerOccurrenceTombstoneTable)
      .values({ occurrence_id: input.occurrenceID, reason: "source_unavailable", time_deleted: input.timeDeleted })
      .run()
      .pipe(Effect.orDie)
    return { occurrence_id: input.occurrenceID, reason: "source_unavailable" as const, time_deleted: input.timeDeleted }
  })
}

export function removePresentation(
  tx: Transaction,
  input: { readonly messageID: MessageID; readonly timeDeleted: number },
) {
  return Effect.gen(function* () {
    const presentation = yield* tx
      .select()
      .from(LearnerOccurrencePresentationTable)
      .where(eq(LearnerOccurrencePresentationTable.message_id, input.messageID))
      .get()
      .pipe(Effect.orDie)
    if (!presentation) return undefined
    if (presentation.provenance === "origin") {
      yield* markSourceUnavailable(tx, { occurrenceID: presentation.occurrence_id, timeDeleted: input.timeDeleted })
    }
    yield* tx
      .delete(LearnerOccurrencePresentationTable)
      .where(eq(LearnerOccurrencePresentationTable.message_id, input.messageID))
      .run()
      .pipe(Effect.orDie)
    return presentation.occurrence_id
  })
}

export function assertPresentationUnchanged(
  tx: Transaction,
  input: { readonly sessionID: SessionSchema.ID; readonly messageID: MessageID },
) {
  return Effect.gen(function* () {
    const presentation = yield* resolvePresentation(tx, input)
    const observed = yield* observeLearnerPresentation(tx, input.sessionID, input.messageID)
    if (observed.fingerprint !== presentation.contentFingerprint) return yield* invalid("changed_presentation")
    return presentation
  })
}

export function recordHistoricalToolPresentation(
  tx: Transaction,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly assistantMessageID: MessageID
    readonly partID: PartID
    readonly sourceSessionID: SessionSchema.ID
    readonly sourceAssistantMessageID: MessageID
    readonly sourcePartID: PartID
    readonly timeCreated: number
  },
) {
  return Effect.gen(function* () {
    const part = yield* tx
      .select({ sessionID: PartTable.session_id, messageID: PartTable.message_id })
      .from(PartTable)
      .where(eq(PartTable.id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!part || part.sessionID !== input.sessionID || part.messageID !== input.assistantMessageID) {
      return yield* new HistoricalPresentationConflictError({ partID: input.partID })
    }
    const existing = yield* tx
      .select()
      .from(HistoricalLearningToolPresentationTable)
      .where(eq(HistoricalLearningToolPresentationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      if (
        existing.session_id !== input.sessionID ||
        existing.assistant_message_id !== input.assistantMessageID ||
        existing.source_session_id !== input.sourceSessionID ||
        existing.source_assistant_message_id !== input.sourceAssistantMessageID ||
        existing.source_part_id !== input.sourcePartID
      ) {
        return yield* new HistoricalPresentationConflictError({ partID: input.partID })
      }
      return existing
    }
    yield* tx
      .insert(HistoricalLearningToolPresentationTable)
      .values({
        part_id: input.partID,
        session_id: input.sessionID,
        assistant_message_id: input.assistantMessageID,
        source_session_id: input.sourceSessionID,
        source_assistant_message_id: input.sourceAssistantMessageID,
        source_part_id: input.sourcePartID,
        provenance: "fork_clone",
        time_created: input.timeCreated,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      part_id: input.partID,
      session_id: input.sessionID,
      assistant_message_id: input.assistantMessageID,
      source_session_id: input.sourceSessionID,
      source_assistant_message_id: input.sourceAssistantMessageID,
      source_part_id: input.sourcePartID,
      provenance: "fork_clone" as const,
      time_created: input.timeCreated,
    }
  })
}

function observeLearnerPresentation(tx: Transaction, sessionID: SessionSchema.ID, messageID: MessageID) {
  return Effect.gen(function* () {
    const message = yield* tx
      .select()
      .from(MessageTable)
      .where(and(eq(MessageTable.id, messageID), eq(MessageTable.session_id, sessionID)))
      .get()
      .pipe(Effect.orDie)
    if (!message || message.data.role !== "user") return yield* invalid("not_learner_input")
    const parts = yield* tx
      .select({ id: PartTable.id, data: PartTable.data })
      .from(PartTable)
      .where(and(eq(PartTable.session_id, sessionID), eq(PartTable.message_id, messageID)))
      .orderBy(asc(PartTable.time_created), asc(PartTable.id))
      .all()
      .pipe(Effect.orDie)
    if (
      !parts.some((part) => {
        if (part.data.type !== "text") return false
        return (part.data as Omit<SessionV1.TextPart, "id" | "sessionID" | "messageID">).synthetic !== true
      })
    ) {
      return yield* invalid("synthetic_only")
    }
    const fingerprint = new Bun.CryptoHasher("sha256")
      .update(JSON.stringify({ message: message.data, parts }))
      .digest("hex")
    return { fingerprint, timeCreated: message.time_created }
  })
}

function occurrenceInfo(row: typeof AdmittedLearnerOccurrenceTable.$inferSelect): Info {
  return {
    id: row.id,
    originSessionID: row.origin_session_id,
    originMessageID: row.origin_message_id,
    timeAdmitted: row.time_admitted,
    ...(row.source_order === null ? {} : { sourceOrder: row.source_order }),
    ...(row.source_temporal_state === null
      ? {}
      : {
          sourceTemporalContext:
            row.source_temporal_state === "resolved"
              ? {
                  state: "resolved" as const,
                  instant: row.time_admitted,
                  timeZone: row.source_timezone!,
                  utcOffsetMinutes: row.source_utc_offset_minutes!,
                }
              : {
                  state: "unavailable" as const,
                  instant: row.time_admitted,
                  reason: row.source_temporal_unavailable_reason!,
                },
        }),
  }
}

function presentationInfo(row: typeof LearnerOccurrencePresentationTable.$inferSelect): Presentation {
  return {
    messageID: row.message_id,
    sessionID: row.session_id,
    occurrenceID: row.occurrence_id,
    provenance: row.provenance,
    sourceMessageID: row.source_message_id ?? undefined,
    contentFingerprint: row.content_fingerprint,
    timeCreated: row.time_created,
  }
}

function invalid(reason: InvalidCausalSourceError["reason"]) {
  return Effect.fail(new InvalidCausalSourceError({ reason }))
}
