export * as TurnLearningContext from "./learning-context"

import { and, asc, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm"
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
import { SessionSchema } from "../session/schema"
import { SessionV1, type MessageID, type PartID } from "../v1/session"
import { Turn } from "@opencode-ai/schema/turn"
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
const RANGE_INTEGRITY_CHUNK_ITEMS = 8

type Range = Readonly<{
  first?: string
  last?: string
  count: number
  fingerprint: string
  chunks: readonly Readonly<{ offset: number; count: number; fingerprint: string }>[]
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

export function isLocator(value: unknown): value is Locator {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const locator = value as Record<string, unknown>
  const optional = [
    ...(locator.inputID === undefined ? [] : ["inputID"]),
    ...(locator.causalOccurrenceID === undefined ? [] : ["causalOccurrenceID"]),
    ...(locator.terminalReason === undefined ? [] : ["terminalReason"]),
    ...(locator.sessionParentID === undefined ? [] : ["sessionParentID"]),
    ...(locator.messageRange === undefined ? [] : ["messageRange"]),
    ...(locator.partRange === undefined ? [] : ["partRange"]),
    ...(locator.timeDeleted === undefined ? [] : ["timeDeleted"]),
  ]
  if (
    !exactObjectKeys(locator, [
      "status",
      "sessionID",
      "turnID",
      "timeAdmitted",
      "timeTerminal",
      "terminalState",
      "presentationProvenance",
      ...optional,
    ]) ||
    !Schema.is(SessionSchema.ID)(locator.sessionID) ||
    !Schema.is(Turn.ID)(locator.turnID) ||
    (locator.inputID !== undefined && !Schema.is(Turn.InputID)(locator.inputID)) ||
    (locator.causalOccurrenceID !== undefined &&
      (typeof locator.causalOccurrenceID !== "string" || !locator.causalOccurrenceID.startsWith("lco_"))) ||
    !nonnegativeInteger(locator.timeAdmitted) ||
    !nonnegativeInteger(locator.timeTerminal) ||
    !Schema.is(Turn.State)(locator.terminalState) ||
    locator.terminalState === "running" ||
    (locator.terminalReason !== undefined && !Schema.is(Turn.TerminalReason)(locator.terminalReason)) ||
    (locator.sessionParentID !== undefined && !Schema.is(SessionSchema.ID)(locator.sessionParentID)) ||
    (locator.messageRange !== undefined && !rangeShape(locator.messageRange)) ||
    (locator.partRange !== undefined && !rangeShape(locator.partRange))
  ) {
    return false
  }
  if (locator.status === "available") {
    return locator.timeDeleted === undefined && presentationProvenanceShape(locator.presentationProvenance)
  }
  return (
    locator.status === "source_unavailable" &&
    locator.presentationProvenance === "source_unavailable" &&
    nonnegativeInteger(locator.timeDeleted)
  )
}

function rangeShape(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const range = value as Record<string, unknown>
  return (
    exactObjectKeys(range, [
      ...(range.first === undefined ? [] : ["first"]),
      ...(range.last === undefined ? [] : ["last"]),
      "count",
      "fingerprint",
      "chunks",
    ]) &&
    (range.first === undefined || typeof range.first === "string") &&
    (range.last === undefined || typeof range.last === "string") &&
    nonnegativeInteger(range.count) &&
    typeof range.fingerprint === "string" &&
    /^[0-9a-f]{64}$/.test(range.fingerprint) &&
    Array.isArray(range.chunks) &&
    range.chunks.every(
      (chunk, index) =>
        typeof chunk === "object" &&
        chunk !== null &&
        !Array.isArray(chunk) &&
        exactObjectKeys(chunk as Record<string, unknown>, ["offset", "count", "fingerprint"]) &&
        nonnegativeInteger((chunk as Record<string, unknown>).offset) &&
        (chunk as Record<string, unknown>).offset === index * RANGE_INTEGRITY_CHUNK_ITEMS &&
        nonnegativeInteger((chunk as Record<string, unknown>).count) &&
        Number((chunk as Record<string, unknown>).count) >= 1 &&
        Number((chunk as Record<string, unknown>).count) <= RANGE_INTEGRITY_CHUNK_ITEMS &&
        typeof (chunk as Record<string, unknown>).fingerprint === "string" &&
        /^[0-9a-f]{64}$/.test(String((chunk as Record<string, unknown>).fingerprint)),
    ) &&
    range.chunks.reduce((total, chunk) => total + Number((chunk as Record<string, unknown>).count), 0) ===
      range.count &&
    (range.count === 0
      ? range.first === undefined && range.last === undefined && range.chunks.length === 0
      : typeof range.first === "string" && typeof range.last === "string" && range.chunks.length > 0)
  )
}

function presentationProvenanceShape(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const provenance = value as Record<string, unknown>
  return (
    exactObjectKeys(provenance, ["count", "kinds", "fingerprint", "historicalMessageOrPart"]) &&
    nonnegativeInteger(provenance.count) &&
    Array.isArray(provenance.kinds) &&
    provenance.kinds.every((kind) => ["origin", "compaction_replay", "fork_clone"].includes(String(kind))) &&
    new Set(provenance.kinds).size === provenance.kinds.length &&
    typeof provenance.fingerprint === "string" &&
    /^[0-9a-f]{64}$/.test(provenance.fingerprint) &&
    typeof provenance.historicalMessageOrPart === "boolean"
  )
}

function exactObjectKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const expected = [...keys].sort()
  const actual = Object.keys(value).sort()
  return expected.length === actual.length && expected.every((key, index) => key === actual[index])
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function range(ids: readonly string[], bodies: readonly unknown[]): Range {
  if (ids.length !== bodies.length) throw new Error("Interaction range identity/body cardinality diverged")
  return {
    first: ids[0],
    last: ids.at(-1),
    count: ids.length,
    fingerprint: canonicalFingerprint(toJsonValue(bodies)),
    chunks: Array.from({ length: Math.ceil(bodies.length / RANGE_INTEGRITY_CHUNK_ITEMS) }, (_, index) => {
      const offset = index * RANGE_INTEGRITY_CHUNK_ITEMS
      const values = bodies.slice(offset, offset + RANGE_INTEGRITY_CHUNK_ITEMS)
      return { offset, count: values.length, fingerprint: canonicalFingerprint(toJsonValue(values)) }
    }),
  }
}

function rangeChunksMatch(expected: Range, offset: number, bodies: readonly unknown[]) {
  if (bodies.length === 0) return true
  const end = offset + bodies.length
  const chunks = expected.chunks.filter((chunk) => chunk.offset >= offset && chunk.offset < end)
  return (
    chunks.length > 0 &&
    chunks[0]!.offset === offset &&
    chunks.reduce((total, chunk) => total + chunk.count, 0) === bodies.length &&
    chunks.every(
      (chunk) =>
        chunk.fingerprint ===
        canonicalFingerprint(toJsonValue(bodies.slice(chunk.offset - offset, chunk.offset - offset + chunk.count))),
    )
  )
}

function locatorOrder(left: Locator, right: Locator) {
  return right.timeTerminal === left.timeTerminal
    ? right.turnID.localeCompare(left.turnID)
    : right.timeTerminal - left.timeTerminal
}

export type ThinKey = Readonly<{ timeTerminal: number; turnID: Turn.ID }>

export type ThinDescriptor = Readonly<{
  status: "available" | "source_unavailable"
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  timeAdmitted: number
  timeTerminal: number
  terminalState: Exclude<Turn.State, "running">
  terminalReason?: Turn.TerminalReason
  sessionParentID?: SessionSchema.ID
  navigationHint?: Readonly<{ sessionTitle: string; trust: "untrusted_navigation_hint" }>
  timeDeleted?: number
}>

export function listTerminalRoots(tx: Transaction, input: Readonly<{ limit: number; after?: ThinKey }>) {
  return Effect.gen(function* () {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_LAZY_ITEMS) {
      throw new RangeReadError("invalid_budget", "Terminal-root discovery must return between 1 and 64 rows")
    }
    const queries = terminalRootQuerySet(tx, input)
    const [live, unavailable] = yield* Effect.all([
      queries.live.all().pipe(Effect.orDie),
      queries.unavailable.all().pipe(Effect.orDie),
    ])
    const items = [
      ...live.map(
        (row) =>
          ({
            status: "available",
            sessionID: row.turn.session_id,
            turnID: row.turn.id,
            timeAdmitted: row.turn.time_admitted,
            timeTerminal: row.turn.time_terminal!,
            terminalState: row.turn.state as Exclude<Turn.State, "running">,
            terminalReason: row.turn.terminal_reason ?? undefined,
            sessionParentID: row.session.parent_id ?? undefined,
            navigationHint: { sessionTitle: row.session.title, trust: "untrusted_navigation_hint" },
          }) satisfies ThinDescriptor,
      ),
      ...unavailable.map(
        (row) =>
          ({
            status: "source_unavailable",
            sessionID: row.session_id,
            turnID: row.turn_id,
            timeAdmitted: row.time_admitted,
            timeTerminal: row.time_terminal,
            terminalState: row.outcome,
            timeDeleted: row.time_deleted,
          }) satisfies ThinDescriptor,
      ),
    ]
      .toSorted((left, right) =>
        right.timeTerminal === left.timeTerminal
          ? right.turnID.localeCompare(left.turnID)
          : right.timeTerminal - left.timeTerminal,
      )
      .slice(0, input.limit + 1)
    const page = items.slice(0, input.limit)
    const last = page.at(-1)
    return {
      items: page,
      omitted: items.length > input.limit || live.length > input.limit || unavailable.length > input.limit,
      ...(last && (items.length > input.limit || live.length > input.limit || unavailable.length > input.limit)
        ? { next: { timeTerminal: last.timeTerminal, turnID: last.turnID } satisfies ThinKey }
        : {}),
    }
  })
}

export function terminalRootQuerySet(tx: Transaction, input: Readonly<{ limit: number; after?: ThinKey }>) {
  const liveAfter = input.after
    ? or(
        lt(TurnTable.time_terminal, input.after.timeTerminal),
        and(eq(TurnTable.time_terminal, input.after.timeTerminal), sql`${TurnTable.id} < ${input.after.turnID}`),
      )
    : undefined
  const unavailableAfter = input.after
    ? or(
        lt(TurnUnavailableSourceTable.time_terminal, input.after.timeTerminal),
        and(
          eq(TurnUnavailableSourceTable.time_terminal, input.after.timeTerminal),
          sql`${TurnUnavailableSourceTable.turn_id} < ${input.after.turnID}`,
        ),
      )
    : undefined
  return {
    live: tx
      .select({ turn: TurnTable, session: SessionTable })
      .from(TurnTable)
      .innerJoin(SessionTable, eq(SessionTable.id, TurnTable.session_id))
      .where(and(eq(TurnTable.depth, 0), sql`${TurnTable.state} <> 'running'`, liveAfter))
      .orderBy(desc(TurnTable.time_terminal), desc(TurnTable.id))
      .limit(input.limit + 1),
    unavailable: tx
      .select()
      .from(TurnUnavailableSourceTable)
      .where(and(eq(TurnUnavailableSourceTable.depth, 0), unavailableAfter))
      .orderBy(desc(TurnUnavailableSourceTable.time_terminal), desc(TurnUnavailableSourceTable.turn_id))
      .limit(input.limit + 1),
  }
}

export function materializeInteractionLocator(
  tx: Transaction,
  input: Readonly<{ descriptor: ThinDescriptor; maxRows: number; maxBytes: number }>,
) {
  return Effect.gen(function* () {
    if (
      !Number.isSafeInteger(input.maxRows) ||
      input.maxRows < 1 ||
      input.maxRows > 512 ||
      !Number.isSafeInteger(input.maxBytes) ||
      input.maxBytes < 1 ||
      input.maxBytes > MAX_LAZY_BYTES
    ) {
      throw new RangeReadError("invalid_budget", "Interaction locator materialization exceeds its row or byte bound")
    }
    if (input.descriptor.status === "source_unavailable") {
      const unavailable = yield* exactUnavailable(tx, {
        ...input.descriptor,
        presentationProvenance: "source_unavailable",
      })
      if (!unavailable) return { type: "stale" as const, reason: "turn_source_missing" as const }
      return { type: "available" as const, locator: unavailable.locator, visitedRows: 1, decodedBytes: 0 }
    }
    const current = yield* tx
      .select({ turn: TurnTable, parentID: SessionTable.parent_id, title: SessionTable.title })
      .from(TurnTable)
      .innerJoin(SessionTable, eq(SessionTable.id, TurnTable.session_id))
      .where(and(eq(TurnTable.id, input.descriptor.turnID), eq(TurnTable.session_id, input.descriptor.sessionID)))
      .get()
      .pipe(Effect.orDie)
    if (
      !current ||
      current.turn.depth !== 0 ||
      current.turn.state === "running" ||
      current.turn.time_admitted !== input.descriptor.timeAdmitted ||
      current.turn.time_terminal !== input.descriptor.timeTerminal ||
      current.turn.state !== input.descriptor.terminalState ||
      (current.parentID ?? undefined) !== input.descriptor.sessionParentID ||
      current.title !== input.descriptor.navigationHint?.sessionTitle
    ) {
      return { type: "stale" as const, reason: "thin_descriptor_changed" as const }
    }
    let visitedRows = 1
    const inputs = yield* tx
      .select({
        id: TurnInputTable.id,
        occurrenceID: TurnInputTable.occurrence_id,
        messageID: TurnInputPresentationTable.message_id,
      })
      .from(TurnInputTable)
      .innerJoin(TurnInputPresentationTable, eq(TurnInputPresentationTable.input_id, TurnInputTable.id))
      .where(eq(TurnInputTable.turn_id, input.descriptor.turnID))
      .orderBy(asc(TurnInputTable.ordinal), asc(TurnInputTable.id))
      .limit(input.maxRows - visitedRows + 1)
      .all()
      .pipe(Effect.orDie)
    visitedRows += inputs.length
    if (visitedRows > input.maxRows) return locatorOverBudget(input.descriptor, "row_limit", visitedRows, 0)
    const models = yield* tx
      .select({ messageID: TurnModelPresentationTable.assistant_message_id, data: MessageTable.data })
      .from(TurnModelOperationTable)
      .innerJoin(
        TurnModelPresentationTable,
        eq(TurnModelPresentationTable.assistant_message_id, TurnModelOperationTable.assistant_message_id),
      )
      .innerJoin(MessageTable, eq(MessageTable.id, TurnModelPresentationTable.assistant_message_id))
      .where(eq(TurnModelOperationTable.turn_id, input.descriptor.turnID))
      .orderBy(asc(TurnModelOperationTable.ordinal), asc(TurnModelOperationTable.assistant_message_id))
      .limit(input.maxRows - visitedRows + 1)
      .all()
      .pipe(Effect.orDie)
    visitedRows += models.length
    if (visitedRows > input.maxRows) return locatorOverBudget(input.descriptor, "row_limit", visitedRows, 0)
    const messageIDs = presentedMessageIDs(inputs, models)
    const messages =
      messageIDs.length === 0
        ? []
        : yield* tx
            .select({ id: MessageTable.id, timeCreated: MessageTable.time_created, data: MessageTable.data })
            .from(MessageTable)
            .where(and(eq(MessageTable.session_id, input.descriptor.sessionID), inArray(MessageTable.id, messageIDs)))
            .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
            .limit(input.maxRows - visitedRows + 1)
            .all()
            .pipe(Effect.orDie)
    visitedRows += messages.length
    if (visitedRows > input.maxRows) return locatorOverBudget(input.descriptor, "row_limit", visitedRows, 0)
    if (messages.length !== new Set(messageIDs).size) {
      throw new Error("Interaction presentation references a missing Message")
    }
    const parts =
      messageIDs.length === 0
        ? []
        : yield* tx
            .select({ id: PartTable.id, messageID: PartTable.message_id, data: PartTable.data })
            .from(PartTable)
            .innerJoin(MessageTable, eq(MessageTable.id, PartTable.message_id))
            .where(and(eq(PartTable.session_id, input.descriptor.sessionID), inArray(PartTable.message_id, messageIDs)))
            .orderBy(asc(MessageTable.time_created), asc(MessageTable.id), asc(PartTable.id))
            .limit(input.maxRows - visitedRows + 1)
            .all()
            .pipe(Effect.orDie)
    visitedRows += parts.length
    if (visitedRows > input.maxRows) return locatorOverBudget(input.descriptor, "row_limit", visitedRows, 0)
    let decodedBytes = utf8Bytes(canonicalJson(toJsonValue({ messages, parts })))
    if (decodedBytes > input.maxBytes) {
      return locatorOverBudget(input.descriptor, "decoded_byte_limit", visitedRows, decodedBytes)
    }
    const presentations =
      messageIDs.length === 0
        ? []
        : yield* tx
            .select()
            .from(LearnerOccurrencePresentationTable)
            .where(
              and(
                eq(LearnerOccurrencePresentationTable.session_id, input.descriptor.sessionID),
                inArray(LearnerOccurrencePresentationTable.message_id, messageIDs),
              ),
            )
            .limit(input.maxRows - visitedRows + 1)
            .all()
            .pipe(Effect.orDie)
    visitedRows += presentations.length
    if (visitedRows > input.maxRows) return locatorOverBudget(input.descriptor, "row_limit", visitedRows, decodedBytes)
    const historicalMessage =
      messageIDs.length === 0
        ? undefined
        : yield* tx
            .select({ id: SessionHistoricalMessagePresentationTable.message_id })
            .from(SessionHistoricalMessagePresentationTable)
            .where(
              and(
                eq(SessionHistoricalMessagePresentationTable.session_id, input.descriptor.sessionID),
                inArray(SessionHistoricalMessagePresentationTable.message_id, messageIDs),
              ),
            )
            .limit(1)
            .get()
            .pipe(Effect.orDie)
    visitedRows += historicalMessage ? 1 : 0
    if (visitedRows > input.maxRows) return locatorOverBudget(input.descriptor, "row_limit", visitedRows, decodedBytes)
    const historicalPart =
      messageIDs.length === 0
        ? undefined
        : yield* tx
            .select({ id: SessionHistoricalPartPresentationTable.part_id })
            .from(SessionHistoricalPartPresentationTable)
            .where(
              and(
                eq(SessionHistoricalPartPresentationTable.session_id, input.descriptor.sessionID),
                inArray(SessionHistoricalPartPresentationTable.message_id, messageIDs),
              ),
            )
            .limit(1)
            .get()
            .pipe(Effect.orDie)
    visitedRows += historicalPart ? 1 : 0
    if (visitedRows > input.maxRows) return locatorOverBudget(input.descriptor, "row_limit", visitedRows, decodedBytes)
    const projection = assemblePartsAndProvenance(
      messages,
      parts,
      presentations,
      Boolean(historicalMessage || historicalPart),
    )
    decodedBytes += utf8Bytes(canonicalJson(toJsonValue(projection.presentationValues)))
    if (decodedBytes > input.maxBytes) {
      return locatorOverBudget(input.descriptor, "decoded_byte_limit", visitedRows, decodedBytes)
    }
    return {
      type: "available" as const,
      locator: {
        status: "available" as const,
        sessionID: input.descriptor.sessionID,
        turnID: input.descriptor.turnID,
        inputID: inputs[0]?.id,
        causalOccurrenceID: inputs[0]?.occurrenceID ?? undefined,
        timeAdmitted: input.descriptor.timeAdmitted,
        timeTerminal: input.descriptor.timeTerminal,
        terminalState: input.descriptor.terminalState,
        terminalReason: input.descriptor.terminalReason,
        sessionParentID: input.descriptor.sessionParentID,
        presentationProvenance: projection.presentationProvenance,
        messageRange: projection.messageRange,
        partRange: projection.partRange,
      } satisfies Locator,
      visitedRows,
      decodedBytes,
    }
  })
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

export function exactRangePageQuerySet(
  _tx: Transaction,
  input: Readonly<{
    sessionID: SessionSchema.ID
    turnID: Turn.ID
    messageCount: number
    partCount: number
    offset: number
    maxItems: number
  }>,
) {
  const messageOffset = Math.min(input.offset, input.messageCount)
  const messageTake = Math.min(input.maxItems, Math.max(0, input.messageCount - messageOffset))
  const partOffset = Math.max(0, input.offset - input.messageCount)
  const partTake = Math.min(input.maxItems - messageTake, Math.max(0, input.partCount - partOffset))
  const messageWindow = integrityWindow(messageOffset, messageTake, input.messageCount)
  const partWindow = integrityWindow(partOffset, partTake, input.partCount)
  const exactMessages = exactTurnMessageIDs(input.turnID)
  return {
    messageOffset,
    messageTake,
    messageWindowOffset: messageWindow.offset,
    messageWindowTake: messageWindow.count,
    partOffset,
    partTake,
    partWindowOffset: partWindow.offset,
    partWindowTake: partWindow.count,
    messages: sql`
      WITH exact_message(message_id) AS (${exactMessages})
      SELECT message.id
      FROM exact_message
      CROSS JOIN message ON message.id = exact_message.message_id
      WHERE message.session_id = ${input.sessionID}
      ORDER BY message.time_created, message.id
      LIMIT ${Math.max(1, messageWindow.count)} OFFSET ${messageWindow.offset}
    `,
    parts: sql`
      WITH exact_message(message_id) AS (${exactMessages})
      SELECT part.id, part.message_id AS "messageID"
      FROM exact_message
      CROSS JOIN message ON message.id = exact_message.message_id
      CROSS JOIN part ON part.message_id = message.id
      WHERE part.session_id = ${input.sessionID}
      ORDER BY message.time_created, message.id, part.id
      LIMIT ${Math.max(1, partWindow.count)} OFFSET ${partWindow.offset}
    `,
  }
}

function exactTurnMessageIDs(turnID: Turn.ID) {
  return sql`
    SELECT input_presentation.message_id
    FROM turn_input
    INNER JOIN turn_input_presentation AS input_presentation
      ON input_presentation.input_id = turn_input.id
    WHERE turn_input.turn_id = ${turnID}
    UNION
    SELECT model_presentation.assistant_message_id
    FROM turn_model_operation
    INNER JOIN turn_model_presentation AS model_presentation
      ON model_presentation.assistant_message_id = turn_model_operation.assistant_message_id
    WHERE turn_model_operation.turn_id = ${turnID}
    UNION
    SELECT json_extract(assistant_message.data, '$.parentID')
    FROM turn_model_operation
    INNER JOIN turn_model_presentation AS model_presentation
      ON model_presentation.assistant_message_id = turn_model_operation.assistant_message_id
    INNER JOIN message AS assistant_message
      ON assistant_message.id = model_presentation.assistant_message_id
    WHERE turn_model_operation.turn_id = ${turnID}
      AND json_extract(assistant_message.data, '$.parentID') IS NOT NULL
  `
}

function integrityWindow(offset: number, count: number, total: number) {
  if (count === 0) return { offset, count: 0 }
  const start = Math.floor(offset / RANGE_INTEGRITY_CHUNK_ITEMS) * RANGE_INTEGRITY_CHUNK_ITEMS
  const end = Math.min(total, Math.ceil((offset + count) / RANGE_INTEGRITY_CHUNK_ITEMS) * RANGE_INTEGRITY_CHUNK_ITEMS)
  return { offset: start, count: end - start }
}

export function exactRangeDatabaseRowsUpperBound(
  input: Readonly<{
    messageCount: number
    partCount: number
    messageRows: number
    partRows: number
  }>,
) {
  // SQLite does not expose stable statement row-visit counters through Bun.
  // These factors conservatively cover both exact-membership UNION scans,
  // primary/index joins, sort inputs, returned keys, and bounded body reloads.
  // They depend only on the sealed Turn locator, never total Session rows.
  return (
    2 +
    (input.messageRows === 0 ? 0 : input.messageCount * 12 + input.messageRows * 2) +
    (input.partRows === 0 ? 0 : input.messageCount * 12 + input.partCount * 4 + input.partRows * 2)
  )
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
    if (
      !input.locator.messageRange ||
      !input.locator.partRange ||
      input.locator.messageRange.count + input.locator.partRange.count > 512
    ) {
      return {
        type: "interaction_locator_over_budget" as const,
        reason: "row_limit" as const,
        locator: input.locator,
        items: [] as const,
        visitedRows: 0,
        decodedBytes: 0,
      }
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
    const offset = input.offset ?? 0
    const firstInput = yield* tx
      .select({ id: TurnInputTable.id, occurrenceID: TurnInputTable.occurrence_id })
      .from(TurnInputTable)
      .where(
        and(eq(TurnInputTable.turn_id, input.locator.turnID), eq(TurnInputTable.session_id, input.locator.sessionID)),
      )
      .orderBy(asc(TurnInputTable.ordinal), asc(TurnInputTable.id))
      .limit(1)
      .get()
      .pipe(Effect.orDie)
    if (
      current.turn.time_admitted !== input.locator.timeAdmitted ||
      current.turn.time_terminal !== input.locator.timeTerminal ||
      current.turn.state !== input.locator.terminalState ||
      (current.turn.terminal_reason ?? undefined) !== input.locator.terminalReason ||
      (current.parentID ?? undefined) !== input.locator.sessionParentID ||
      firstInput?.id !== input.locator.inputID ||
      (firstInput?.occurrenceID ?? undefined) !== input.locator.causalOccurrenceID ||
      !input.locator.messageRange ||
      !input.locator.partRange
    ) {
      return { type: "stale" as const, reason: "turn_identity_changed" as const, items: [] as const }
    }
    const messageCount = input.locator.messageRange.count
    const partCount = input.locator.partRange.count
    const queries = exactRangePageQuerySet(tx, {
      sessionID: input.locator.sessionID,
      turnID: input.locator.turnID,
      messageCount,
      partCount,
      offset,
      maxItems: input.maxItems,
    })
    const {
      messageOffset,
      messageTake,
      messageWindowOffset,
      messageWindowTake,
      partOffset,
      partTake,
      partWindowOffset,
      partWindowTake,
    } = queries
    const messageKeys =
      messageWindowTake === 0 ? [] : yield* tx.all<{ id: MessageID }>(queries.messages).pipe(Effect.orDie)
    const messageValues =
      messageKeys.length === 0
        ? []
        : yield* tx
            .select({ id: MessageTable.id, data: MessageTable.data })
            .from(MessageTable)
            .where(
              and(
                eq(MessageTable.session_id, input.locator.sessionID),
                inArray(
                  MessageTable.id,
                  messageKeys.map((row) => row.id),
                ),
              ),
            )
            .all()
            .pipe(Effect.orDie)
    const messageByID = new Map(messageValues.map((row) => [row.id, row] as const))
    const messageRows = messageKeys.flatMap((row) => {
      const value = messageByID.get(row.id)
      return value ? [value] : []
    })
    if (
      messageRows.length !== messageWindowTake ||
      (messageWindowOffset === 0 && messageWindowTake > 0 && messageRows[0]!.id !== input.locator.messageRange.first) ||
      (messageWindowOffset + messageWindowTake === messageCount &&
        messageWindowTake > 0 &&
        messageRows.at(-1)!.id !== input.locator.messageRange.last)
    ) {
      return { type: "stale" as const, reason: "presentation_range_changed" as const, items: [] as const }
    }
    const partKeys =
      partWindowTake === 0 ? [] : yield* tx.all<{ id: PartID; messageID: MessageID }>(queries.parts).pipe(Effect.orDie)
    const partValues =
      partKeys.length === 0
        ? []
        : yield* tx
            .select({ id: PartTable.id, messageID: PartTable.message_id, data: PartTable.data })
            .from(PartTable)
            .where(
              and(
                eq(PartTable.session_id, input.locator.sessionID),
                inArray(
                  PartTable.id,
                  partKeys.map((row) => row.id),
                ),
              ),
            )
            .all()
            .pipe(Effect.orDie)
    const partByID = new Map(partValues.map((row) => [row.id, row] as const))
    const partRows = partKeys.flatMap((row) => {
      const value = partByID.get(row.id)
      return value?.messageID === row.messageID ? [value] : []
    })
    if (
      partRows.length !== partWindowTake ||
      (partWindowOffset === 0 && partWindowTake > 0 && partRows[0]!.id !== input.locator.partRange.first) ||
      (partWindowOffset + partWindowTake === partCount &&
        partWindowTake > 0 &&
        partRows.at(-1)!.id !== input.locator.partRange.last)
    ) {
      return { type: "stale" as const, reason: "presentation_range_changed" as const, items: [] as const }
    }
    if (
      !rangeChunksMatch(
        input.locator.messageRange,
        messageWindowOffset,
        messageRows.map((row) => ({ id: row.id, data: row.data })),
      ) ||
      !rangeChunksMatch(
        input.locator.partRange,
        partWindowOffset,
        partRows.map((row) => ({ id: row.id, messageID: row.messageID, data: row.data })),
      )
    ) {
      return { type: "stale" as const, reason: "presentation_range_changed" as const, items: [] as const }
    }
    const selectedMessageRows = messageRows.slice(
      messageOffset - messageWindowOffset,
      messageOffset - messageWindowOffset + messageTake,
    )
    const selectedPartRows = partRows.slice(partOffset - partWindowOffset, partOffset - partWindowOffset + partTake)
    const selected = [
      ...(yield* Effect.forEach(selectedMessageRows, (row) =>
        Schema.decodeUnknownEffect(SessionV1.Info)({
          id: row.id,
          sessionID: input.locator.sessionID,
          ...row.data,
        }).pipe(Effect.map((data) => ({ type: "message" as const, id: row.id, data }))),
      )),
      ...(yield* Effect.forEach(selectedPartRows, (row) =>
        Schema.decodeUnknownEffect(SessionV1.Part)({
          id: row.id,
          sessionID: input.locator.sessionID,
          messageID: row.messageID,
          ...row.data,
        }).pipe(Effect.map((data) => ({ type: "part" as const, id: row.id, data }))),
      )),
    ]
    const work = {
      databaseRowsUpperBound: exactRangeDatabaseRowsUpperBound({
        messageCount,
        partCount,
        messageRows: messageRows.length,
        partRows: partRows.length,
      }),
      boundBasis: "exact_turn_membership_v1" as const,
      decodedBytes: utf8Bytes(canonicalJson(toJsonValue({ messages: messageRows, parts: partRows }))),
    }
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
      let candidate = rangeResult(input.locator, offset, messageCount + partCount, [...items, value], work)
      let accepted = value
      if (candidate.canonicalBytes > input.maxBytes && value !== locatorOnly) {
        candidate = rangeResult(input.locator, offset, messageCount + partCount, [...items, locatorOnly], work)
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
    const result = rangeResult(input.locator, offset, messageCount + partCount, items, work)
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
  work: Readonly<{
    databaseRowsUpperBound: number
    boundBasis: "exact_turn_membership_v1"
    decodedBytes: number
  }>,
) {
  return measuredResult({
    type: "available" as const,
    locator,
    offset,
    returned: items.length,
    total,
    ...(offset + items.length < total ? { nextOffset: offset + items.length } : {}),
    items,
    work,
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
      visitedRows: inputs.length + models.length + projection.visitedRows,
      decodedBytes: projection.decodedBytes,
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
        visitedRows: 0,
        decodedBytes: 0,
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
    const projection = assemblePartsAndProvenance(
      messages,
      parts,
      presentations,
      (historicalMessages?.value ?? 0) > 0 || (historicalParts?.value ?? 0) > 0,
    )
    if (projection.messageIDs.length !== new Set(inputMessageIDs).size) {
      throw new Error("Interaction presentation references a missing Message")
    }
    return {
      ...projection,
      visitedRows:
        messages.length +
        parts.length +
        presentations.length +
        (historicalMessages ? 1 : 0) +
        (historicalParts ? 1 : 0),
      decodedBytes: utf8Bytes(
        canonicalJson(toJsonValue({ messages, parts, presentationValues: projection.presentationValues })),
      ),
    }
  })
}

function assemblePartsAndProvenance(
  messages: readonly Readonly<{ id: MessageID; timeCreated: number; data: unknown }>[],
  parts: readonly Readonly<{ id: PartID; messageID: MessageID; data: unknown }>[],
  presentations: readonly (typeof LearnerOccurrencePresentationTable.$inferSelect)[],
  historical: boolean,
) {
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
    presentationValues,
  }
}

function locatorOverBudget(
  descriptor: ThinDescriptor,
  reason: "row_limit" | "decoded_byte_limit",
  visitedRows: number,
  decodedBytes: number,
) {
  return { type: "interaction_locator_over_budget" as const, reason, descriptor, visitedRows, decodedBytes }
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
