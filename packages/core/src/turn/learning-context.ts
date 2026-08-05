export * as TurnLearningContext from "./learning-context"

import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Database } from "../database/database"
import {
  MAX_LAZY_BYTES,
  MAX_LAZY_ITEMS,
  canonicalFingerprint,
  canonicalJson,
  toJsonValue,
  utf8Bytes,
} from "../learning-context/schema"
import {
  MessageTable,
  PartTable,
  SessionHistoricalMessagePresentationTable,
  SessionHistoricalPartPresentationTable,
  SessionTable,
} from "../session/sql"
import type { SessionSchema } from "../session/schema"
import { SessionV1, type MessageID, type PartID } from "../v1/session"
import type { Turn } from "@opencode-ai/schema/turn"
import { LearnerOccurrencePresentationTable } from "../learning-command/occurrence.sql"
import {
  TurnInputPresentationTable,
  TurnInputTable,
  TurnModelOperationTable,
  TurnModelPresentationTable,
  TurnTable,
  TurnTranscriptRedactionTable,
  TurnUnavailableSourceTable,
} from "./sql"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

type Range = Readonly<{
  first?: string
  last?: string
  count: number
  fingerprint: string
}>

export class RangeReadError extends Error {
  readonly code: "invalid_budget" | "mandatory_over_budget"

  constructor(code: RangeReadError["code"], message: string) {
    super(message)
    this.name = "TurnLearningContext.RangeReadError"
    this.code = code
  }
}

export type Locator = Readonly<{
  status: "available" | "source_unavailable"
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  inputID?: Turn.InputID
  causalOccurrenceID?: string
  timeAdmitted: number
  timeTerminal: number
  terminalState: Exclude<Turn.State, "running">
  terminalReason?: Turn.TerminalReason
  sessionParentID?: SessionSchema.ID
  presentationProvenance:
    | "source_unavailable"
    | Readonly<{
        count: number
        kinds: readonly ("origin" | "compaction_replay" | "fork_clone")[]
        fingerprint: string
        historicalMessageOrPart: boolean
      }>
  messageRange?: Range
  partRange?: Range
  timeDeleted?: number
}>

export type ProjectionEntry = Readonly<{
  locator: Locator
  navigationHint?: Readonly<{ sessionTitle: string; trust: "untrusted_navigation_hint" }>
}>

function range(ids: readonly string[], bodies: readonly unknown[]): Range {
  return {
    first: ids[0],
    last: ids.at(-1),
    count: ids.length,
    fingerprint: canonicalFingerprint(toJsonValue(bodies)),
  }
}

function locatorOrder(left: Locator, right: Locator) {
  return right.timeTerminal === left.timeTerminal
    ? right.turnID.localeCompare(left.turnID)
    : right.timeTerminal - left.timeTerminal
}

/** Interaction-owned, transaction-scoped recent root-Turn locator projection. */
export function projectLearningContext(
  tx: Transaction,
  input: { readonly currentSessionID: SessionSchema.ID; readonly limit: number },
) {
  return Effect.gen(function* () {
    const liveWhere = and(
      ne(TurnTable.session_id, input.currentSessionID),
      eq(TurnTable.depth, 0),
      sql`${TurnTable.state} <> 'running'`,
    )
    const unavailableWhere = and(
      ne(TurnUnavailableSourceTable.session_id, input.currentSessionID),
      eq(TurnUnavailableSourceTable.depth, 0),
    )
    const [liveCount, unavailableCount, liveRows, unavailableRows] = yield* Effect.all([
      tx
        .select({ value: sql<number>`count(*)` })
        .from(TurnTable)
        .where(liveWhere)
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ value: sql<number>`count(*)` })
        .from(TurnUnavailableSourceTable)
        .where(unavailableWhere)
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ turn: TurnTable, session: SessionTable, redactionTime: TurnTranscriptRedactionTable.time_removed })
        .from(TurnTable)
        .innerJoin(SessionTable, eq(SessionTable.id, TurnTable.session_id))
        .leftJoin(TurnTranscriptRedactionTable, eq(TurnTranscriptRedactionTable.turn_id, TurnTable.id))
        .where(liveWhere)
        .orderBy(desc(TurnTable.time_terminal), desc(TurnTable.id))
        .limit(input.limit)
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(TurnUnavailableSourceTable)
        .where(unavailableWhere)
        .orderBy(desc(TurnUnavailableSourceTable.time_terminal), desc(TurnUnavailableSourceTable.turn_id))
        .limit(input.limit)
        .all()
        .pipe(Effect.orDie),
    ])
    const live = yield* Effect.forEach(liveRows, (row) =>
      Effect.gen(function* () {
        if (row.redactionTime !== null) {
          const source = yield* tx
            .select({ occurrenceID: TurnInputTable.occurrence_id })
            .from(TurnInputTable)
            .where(eq(TurnInputTable.id, row.turn.initial_input_id))
            .get()
            .pipe(Effect.orDie)
          return {
            locator: {
              status: "source_unavailable" as const,
              sessionID: row.turn.session_id,
              turnID: row.turn.id,
              inputID: row.turn.initial_input_id,
              causalOccurrenceID: source?.occurrenceID ?? undefined,
              timeAdmitted: row.turn.time_admitted,
              timeTerminal: row.turn.time_terminal!,
              terminalState: row.turn.state as Exclude<Turn.State, "running">,
              terminalReason: row.turn.terminal_reason ?? undefined,
              sessionParentID: row.session.parent_id ?? undefined,
              presentationProvenance: "source_unavailable" as const,
              timeDeleted: row.redactionTime,
            },
            navigationHint: { sessionTitle: row.session.title, trust: "untrusted_navigation_hint" as const },
          } satisfies ProjectionEntry
        }
        const [inputs, models] = yield* Effect.all([
          tx
            .select({
              id: TurnInputTable.id,
              messageID: TurnInputPresentationTable.message_id,
              occurrenceID: TurnInputTable.occurrence_id,
            })
            .from(TurnInputTable)
            .innerJoin(TurnInputPresentationTable, eq(TurnInputPresentationTable.input_id, TurnInputTable.id))
            .where(eq(TurnInputTable.turn_id, row.turn.id))
            .orderBy(asc(TurnInputTable.ordinal), asc(TurnInputTable.id))
            .all()
            .pipe(Effect.orDie),
          tx
            .select({ messageID: TurnModelPresentationTable.assistant_message_id, data: MessageTable.data })
            .from(TurnModelOperationTable)
            .innerJoin(
              TurnModelPresentationTable,
              eq(TurnModelPresentationTable.assistant_message_id, TurnModelOperationTable.assistant_message_id),
            )
            .innerJoin(MessageTable, eq(MessageTable.id, TurnModelPresentationTable.assistant_message_id))
            .where(eq(TurnModelOperationTable.turn_id, row.turn.id))
            .orderBy(asc(TurnModelOperationTable.ordinal), asc(TurnModelOperationTable.assistant_message_id))
            .all()
            .pipe(Effect.orDie),
        ])
        const projected = yield* projectPartsAndProvenance(tx, row.turn.session_id, presentedMessageIDs(inputs, models))
        const messageIDs = projected.messageIDs
        const partIDs = projected.partIDs
        return {
          locator: {
            status: "available" as const,
            sessionID: row.turn.session_id,
            turnID: row.turn.id,
            inputID: inputs[0]?.id,
            causalOccurrenceID: inputs[0]?.occurrenceID ?? undefined,
            timeAdmitted: row.turn.time_admitted,
            timeTerminal: row.turn.time_terminal!,
            terminalState: row.turn.state as Exclude<Turn.State, "running">,
            terminalReason: row.turn.terminal_reason ?? undefined,
            sessionParentID: row.session.parent_id ?? undefined,
            presentationProvenance: projected.presentationProvenance,
            messageRange: projected.messageRange,
            partRange: projected.partRange,
          },
          navigationHint: { sessionTitle: row.session.title, trust: "untrusted_navigation_hint" as const },
        } satisfies ProjectionEntry
      }),
    )
    const unavailable = unavailableRows.map(
      (row) =>
        ({
          locator: {
            status: "source_unavailable",
            sessionID: row.session_id,
            turnID: row.turn_id,
            causalOccurrenceID: row.causal_occurrence_id ?? undefined,
            timeAdmitted: row.time_admitted,
            timeTerminal: row.time_terminal,
            terminalState: row.outcome,
            presentationProvenance: "source_unavailable",
            timeDeleted: row.time_deleted,
          },
        }) satisfies ProjectionEntry,
    )
    return {
      countAtCut: (liveCount?.value ?? 0) + (unavailableCount?.value ?? 0),
      entries: [...live, ...unavailable]
        .toSorted((left, right) => locatorOrder(left.locator, right.locator))
        .slice(0, input.limit),
    }
  })
}

export function readExactRange(
  tx: Transaction,
  input: {
    readonly locator: Locator
    readonly offset?: number
    readonly maxItems: number
    readonly maxBytes: number
  },
) {
  return Effect.gen(function* () {
    if (
      !Number.isSafeInteger(input.offset ?? 0) ||
      (input.offset ?? 0) < 0 ||
      !Number.isSafeInteger(input.maxItems) ||
      input.maxItems < 1 ||
      input.maxItems > MAX_LAZY_ITEMS ||
      !Number.isSafeInteger(input.maxBytes) ||
      input.maxBytes < 1 ||
      input.maxBytes > MAX_LAZY_BYTES
    ) {
      throw new RangeReadError("invalid_budget", "Interaction ranges must stay within the Gate 18 byte and item limits")
    }
    if (input.locator.status === "source_unavailable") {
      const unavailable = yield* exactUnavailable(tx, input.locator)
      if (!unavailable || !sameLocator(unavailable.locator, input.locator)) {
        return { type: "stale" as const, reason: "unavailable_locator_changed" as const, items: [] as const }
      }
      return boundedRangeResult(
        {
          type: "source_unavailable" as const,
          reason: unavailable.reason,
          locator: input.locator,
          items: [] as const,
        },
        input.maxBytes,
      )
    }
    const current = yield* tx
      .select({ turn: TurnTable, redaction: TurnTranscriptRedactionTable.turn_id, parentID: SessionTable.parent_id })
      .from(TurnTable)
      .innerJoin(SessionTable, eq(SessionTable.id, TurnTable.session_id))
      .leftJoin(TurnTranscriptRedactionTable, eq(TurnTranscriptRedactionTable.turn_id, TurnTable.id))
      .where(and(eq(TurnTable.id, input.locator.turnID), eq(TurnTable.session_id, input.locator.sessionID)))
      .get()
      .pipe(Effect.orDie)
    if (!current) {
      const unavailable = yield* exactUnavailable(tx, input.locator)
      if (!unavailable) {
        return { type: "stale" as const, reason: "turn_source_missing" as const, items: [] as const }
      }
      return boundedRangeResult(
        {
          type: "source_unavailable" as const,
          reason: unavailable.reason,
          locator: input.locator,
          items: [] as const,
        },
        input.maxBytes,
      )
    }
    if (current.redaction) {
      return boundedRangeResult(
        {
          type: "source_unavailable" as const,
          reason: "redacted" as const,
          locator: input.locator,
          items: [] as const,
        },
        input.maxBytes,
      )
    }
    if (current.turn.depth !== 0 || current.turn.state === "running") {
      return { type: "stale" as const, reason: "turn_identity_changed" as const, items: [] as const }
    }
    const projection = yield* projectOne(tx, input.locator.sessionID, input.locator.turnID)
    const exactLocator = {
      status: "available" as const,
      sessionID: current.turn.session_id,
      turnID: current.turn.id,
      inputID: projection.inputID,
      causalOccurrenceID: projection.causalOccurrenceID,
      timeAdmitted: current.turn.time_admitted,
      timeTerminal: current.turn.time_terminal!,
      terminalState: current.turn.state,
      terminalReason: current.turn.terminal_reason ?? undefined,
      sessionParentID: current.parentID ?? undefined,
      presentationProvenance: projection.presentationProvenance,
      messageRange: projection.messageRange,
      partRange: projection.partRange,
    } satisfies Locator
    if (!sameLocator(exactLocator, input.locator)) {
      return { type: "stale" as const, reason: "presentation_range_changed" as const, items: [] as const }
    }
    const raw = [
      ...(yield* Effect.forEach(projection.messageIDs, (id) =>
        tx
          .select()
          .from(MessageTable)
          .where(and(eq(MessageTable.id, id), eq(MessageTable.session_id, input.locator.sessionID)))
          .get()
          .pipe(
            Effect.orDie,
            Effect.flatMap((row) =>
              row
                ? Schema.decodeUnknownEffect(SessionV1.Info)({
                    id,
                    sessionID: input.locator.sessionID,
                    ...row.data,
                  }).pipe(Effect.map((data) => ({ type: "message" as const, id, data })))
                : Effect.succeed(undefined),
            ),
          ),
      )),
      ...(yield* Effect.forEach(projection.partIDs, (id) =>
        tx
          .select({ messageID: PartTable.message_id, data: PartTable.data })
          .from(PartTable)
          .where(and(eq(PartTable.id, id), eq(PartTable.session_id, input.locator.sessionID)))
          .get()
          .pipe(
            Effect.orDie,
            Effect.flatMap((row) =>
              row
                ? Schema.decodeUnknownEffect(SessionV1.Part)({
                    id,
                    sessionID: input.locator.sessionID,
                    messageID: row.messageID,
                    ...row.data,
                  }).pipe(Effect.map((data) => ({ type: "part" as const, id, data })))
                : Effect.succeed(undefined),
            ),
          ),
      )),
    ].filter((item): item is NonNullable<typeof item> => item !== undefined)
    if (raw.length !== projection.messageIDs.length + projection.partIDs.length) {
      return { type: "stale" as const, reason: "presentation_item_missing" as const, items: [] as const }
    }
    const offset = input.offset ?? 0
    const selected = raw.slice(offset, offset + input.maxItems)
    const items: {
      type: "message" | "part" | "locator_only"
      id: string
      data?: unknown
      canonicalBytes?: number
      fingerprint?: string
    }[] = []
    for (const item of selected) {
      const canonical = canonicalJson(toJsonValue(item))
      const itemBytes = utf8Bytes(canonical)
      const locatorOnly = {
        type: "locator_only" as const,
        id: item.id,
        canonicalBytes: itemBytes,
        fingerprint: canonicalFingerprint(toJsonValue(item)),
      }
      const value = itemBytes <= input.maxBytes ? item : locatorOnly
      let candidate = rangeResult(input.locator, offset, raw.length, [...items, value])
      let accepted = value
      if (candidate.canonicalBytes > input.maxBytes && value !== locatorOnly) {
        candidate = rangeResult(input.locator, offset, raw.length, [...items, locatorOnly])
        accepted = locatorOnly
      }
      if (candidate.canonicalBytes > input.maxBytes) {
        if (items.length === 0) {
          throw new RangeReadError(
            "mandatory_over_budget",
            "The next exact Interaction item locator exceeds the caller budget",
          )
        }
        break
      }
      items.push(accepted)
    }
    const result = rangeResult(input.locator, offset, raw.length, items)
    if (result.canonicalBytes > input.maxBytes) {
      throw new RangeReadError("mandatory_over_budget", "The exact Interaction range locator exceeds the caller budget")
    }
    return result
  })
}

function rangeResult(
  locator: Locator,
  offset: number,
  total: number,
  items: readonly {
    readonly type: "message" | "part" | "locator_only"
    readonly id: string
    readonly data?: unknown
    readonly canonicalBytes?: number
    readonly fingerprint?: string
  }[],
) {
  return measuredResult({
    type: "available" as const,
    locator,
    offset,
    returned: items.length,
    total,
    ...(offset + items.length < total ? { nextOffset: offset + items.length } : {}),
    items,
  })
}

function boundedRangeResult<const T extends Readonly<Record<string, unknown>>>(value: T, maxBytes: number) {
  const result = measuredResult(value)
  if (result.canonicalBytes > maxBytes) {
    throw new RangeReadError("mandatory_over_budget", "The exact Interaction range status exceeds the caller budget")
  }
  return result
}

function measuredResult<const T extends Readonly<Record<string, unknown>>>(value: T) {
  let canonicalBytes = 0
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = { ...value, canonicalBytes }
    const measured = utf8Bytes(canonicalJson(toJsonValue(result)))
    if (measured === canonicalBytes) return result
    canonicalBytes = measured
  }
  throw new RangeReadError("mandatory_over_budget", "The Interaction range byte count did not converge")
}

function projectOne(tx: Transaction, sessionID: SessionSchema.ID, turnID: Turn.ID) {
  return Effect.gen(function* () {
    const [inputs, models] = yield* Effect.all([
      tx
        .select({
          inputID: TurnInputTable.id,
          occurrenceID: TurnInputTable.occurrence_id,
          messageID: TurnInputPresentationTable.message_id,
        })
        .from(TurnInputTable)
        .innerJoin(TurnInputPresentationTable, eq(TurnInputPresentationTable.input_id, TurnInputTable.id))
        .where(and(eq(TurnInputTable.turn_id, turnID), eq(TurnInputTable.session_id, sessionID)))
        .orderBy(asc(TurnInputTable.ordinal), asc(TurnInputTable.id))
        .all()
        .pipe(Effect.orDie),
      tx
        .select({ messageID: TurnModelPresentationTable.assistant_message_id, data: MessageTable.data })
        .from(TurnModelOperationTable)
        .innerJoin(
          TurnModelPresentationTable,
          eq(TurnModelPresentationTable.assistant_message_id, TurnModelOperationTable.assistant_message_id),
        )
        .innerJoin(MessageTable, eq(MessageTable.id, TurnModelPresentationTable.assistant_message_id))
        .where(and(eq(TurnModelOperationTable.turn_id, turnID), eq(TurnModelOperationTable.session_id, sessionID)))
        .orderBy(asc(TurnModelOperationTable.ordinal), asc(TurnModelOperationTable.assistant_message_id))
        .all()
        .pipe(Effect.orDie),
    ])
    const projection = yield* projectPartsAndProvenance(tx, sessionID, presentedMessageIDs(inputs, models))
    const messageIDs = projection.messageIDs
    const partIDs = projection.partIDs
    return {
      inputID: inputs[0]?.inputID,
      causalOccurrenceID: inputs[0]?.occurrenceID ?? undefined,
      messageIDs,
      partIDs,
      messageRange: projection.messageRange,
      partRange: projection.partRange,
      historical: projection.historical,
      presentationProvenance: projection.presentationProvenance,
    }
  })
}

function projectPartsAndProvenance(
  tx: Transaction,
  sessionID: SessionSchema.ID,
  inputMessageIDs: readonly MessageID[],
) {
  return Effect.gen(function* () {
    if (inputMessageIDs.length === 0)
      return {
        messageIDs: [] as MessageID[],
        partIDs: [] as PartID[],
        messageRange: range([], []),
        partRange: range([], []),
        historical: false,
        presentationProvenance: {
          count: 0,
          kinds: [] as const,
          fingerprint: canonicalFingerprint(toJsonValue([])),
          historicalMessageOrPart: false,
        },
      }
    const [messages, parts, historicalMessages, presentations, historicalParts] = yield* Effect.all([
      tx
        .select({ id: MessageTable.id, timeCreated: MessageTable.time_created, data: MessageTable.data })
        .from(MessageTable)
        .where(and(eq(MessageTable.session_id, sessionID), inArray(MessageTable.id, inputMessageIDs)))
        .all()
        .pipe(Effect.orDie),
      tx
        .select({ id: PartTable.id, messageID: PartTable.message_id, data: PartTable.data })
        .from(PartTable)
        .where(and(eq(PartTable.session_id, sessionID), inArray(PartTable.message_id, inputMessageIDs)))
        .all()
        .pipe(Effect.orDie),
      tx
        .select({ value: sql<number>`count(*)` })
        .from(SessionHistoricalMessagePresentationTable)
        .where(
          and(
            eq(SessionHistoricalMessagePresentationTable.session_id, sessionID),
            inArray(SessionHistoricalMessagePresentationTable.message_id, inputMessageIDs),
          ),
        )
        .get()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(LearnerOccurrencePresentationTable)
        .where(
          and(
            eq(LearnerOccurrencePresentationTable.session_id, sessionID),
            inArray(LearnerOccurrencePresentationTable.message_id, inputMessageIDs),
          ),
        )
        .all()
        .pipe(Effect.orDie),
      tx
        .select({ value: sql<number>`count(*)` })
        .from(SessionHistoricalPartPresentationTable)
        .where(
          and(
            eq(SessionHistoricalPartPresentationTable.session_id, sessionID),
            inArray(SessionHistoricalPartPresentationTable.message_id, inputMessageIDs),
          ),
        )
        .get()
        .pipe(Effect.orDie),
    ])
    if (messages.length !== new Set(inputMessageIDs).size) {
      throw new Error("Interaction presentation references a missing Message")
    }
    const orderedMessages = messages.toSorted((left, right) =>
      left.timeCreated === right.timeCreated
        ? left.id < right.id
          ? -1
          : left.id > right.id
            ? 1
            : 0
        : left.timeCreated - right.timeCreated,
    )
    const messageIDs = orderedMessages.map((item) => item.id)
    const messageOrder = new Map(messageIDs.map((id, index) => [id, index]))
    const orderedParts = parts.toSorted((left, right) => {
      const byMessage = messageOrder.get(left.messageID)! - messageOrder.get(right.messageID)!
      return byMessage === 0 ? (left.id < right.id ? -1 : left.id > right.id ? 1 : 0) : byMessage
    })
    const partIDs = orderedParts.map((item) => item.id)
    const orderedPresentations = presentations.toSorted(
      (left, right) => messageOrder.get(left.message_id)! - messageOrder.get(right.message_id)!,
    )
    if (
      orderedPresentations.length === 0 ||
      orderedPresentations.some(
        (item) =>
          messageOrder.get(item.message_id) === undefined ||
          !/^[0-9a-f]{64}$/.test(item.content_fingerprint) ||
          (item.provenance === "origin" ? item.source_message_id !== null : item.source_message_id === null),
      )
    ) {
      throw new Error("Interaction Turn has no exact learner occurrence presentation provenance")
    }
    const presentationValues = orderedPresentations.map((item) => ({
      messageID: item.message_id,
      occurrenceID: item.occurrence_id,
      provenance: item.provenance,
      ...(item.source_message_id ? { sourceMessageID: item.source_message_id } : {}),
      contentFingerprint: item.content_fingerprint,
    }))
    const historical = (historicalMessages?.value ?? 0) > 0 || (historicalParts?.value ?? 0) > 0
    return {
      messageIDs,
      partIDs,
      messageRange: range(
        messageIDs,
        orderedMessages.map((item) => ({ id: item.id, data: item.data })),
      ),
      partRange: range(
        partIDs,
        orderedParts.map((item) => ({ id: item.id, messageID: item.messageID, data: item.data })),
      ),
      historical,
      presentationProvenance: {
        count: presentationValues.length,
        kinds: (["origin", "compaction_replay", "fork_clone"] as const).filter((kind) =>
          presentationValues.some((item) => item.provenance === kind),
        ),
        fingerprint: canonicalFingerprint(toJsonValue(presentationValues)),
        historicalMessageOrPart: historical,
      },
    }
  })
}

function presentedMessageIDs(
  inputs: readonly Readonly<{ messageID: MessageID }>[],
  models: readonly Readonly<{ messageID: MessageID; data: unknown }>[],
) {
  return [
    ...inputs.map((item) => item.messageID),
    ...models.flatMap((item) => [modelParentMessageID(item.data), item.messageID]),
  ]
}

function modelParentMessageID(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("parentID" in value)) {
    throw new Error("Interaction model presentation has no exact parent Message")
  }
  const parentID = value.parentID
  if (typeof parentID !== "string" || parentID.length === 0) {
    throw new Error("Interaction model presentation has an invalid parent Message")
  }
  return SessionV1.MessageID.make(parentID)
}

function exactUnavailable(tx: Transaction, locator: Locator) {
  return Effect.gen(function* () {
    const [deleted, redacted, session] = yield* Effect.all([
      tx
        .select()
        .from(TurnUnavailableSourceTable)
        .where(
          and(
            eq(TurnUnavailableSourceTable.turn_id, locator.turnID),
            eq(TurnUnavailableSourceTable.session_id, locator.sessionID),
          ),
        )
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ turn: TurnTable, redactionTime: TurnTranscriptRedactionTable.time_removed })
        .from(TurnTable)
        .innerJoin(TurnTranscriptRedactionTable, eq(TurnTranscriptRedactionTable.turn_id, TurnTable.id))
        .where(and(eq(TurnTable.id, locator.turnID), eq(TurnTable.session_id, locator.sessionID)))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ parentID: SessionTable.parent_id })
        .from(SessionTable)
        .where(eq(SessionTable.id, locator.sessionID))
        .get()
        .pipe(Effect.orDie),
    ])
    if (deleted?.depth === 0) {
      return {
        reason: "source_deleted" as const,
        locator: {
          status: "source_unavailable" as const,
          sessionID: deleted.session_id,
          turnID: deleted.turn_id,
          causalOccurrenceID: deleted.causal_occurrence_id ?? undefined,
          timeAdmitted: deleted.time_admitted,
          timeTerminal: deleted.time_terminal,
          terminalState: deleted.outcome,
          sessionParentID: session?.parentID ?? undefined,
          presentationProvenance: "source_unavailable" as const,
          timeDeleted: deleted.time_deleted,
        } satisfies Locator,
      }
    }
    if (redacted?.turn.depth === 0 && redacted.turn.state !== "running") {
      const source = yield* tx
        .select({ occurrenceID: TurnInputTable.occurrence_id })
        .from(TurnInputTable)
        .where(eq(TurnInputTable.id, redacted.turn.initial_input_id))
        .get()
        .pipe(Effect.orDie)
      return {
        reason: "redacted" as const,
        locator: {
          status: "source_unavailable" as const,
          sessionID: redacted.turn.session_id,
          turnID: redacted.turn.id,
          inputID: redacted.turn.initial_input_id,
          causalOccurrenceID: source?.occurrenceID ?? undefined,
          timeAdmitted: redacted.turn.time_admitted,
          timeTerminal: redacted.turn.time_terminal!,
          terminalState: redacted.turn.state,
          terminalReason: redacted.turn.terminal_reason ?? undefined,
          sessionParentID: session?.parentID ?? undefined,
          presentationProvenance: "source_unavailable" as const,
          timeDeleted: redacted.redactionTime,
        } satisfies Locator,
      }
    }
    return undefined
  })
}

function sameLocator(left: Locator, right: Locator) {
  return canonicalJson(toJsonValue(left)) === canonicalJson(toJsonValue(right))
}
