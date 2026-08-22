export * as SessionPresentation from "./session-presentation"

import { and, asc, count, eq, gt, gte, inArray, max, or } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "./database/database"
import {
  SessionAdministrativeHistoryEmbeddedPartTable,
  SessionAdministrativeHistoryMessageTable,
  SessionAdministrativeHistoryPartTable,
  SessionAdministrativeHistoryTable,
  SessionPresentationFrontierTable,
} from "./session-presentation/sql"
import {
  AdministrativeHistoryIntegrityError,
  FrontierUnrepresentableError,
  HistoricalPresentationNotRevertibleError,
} from "./session-presentation/schema"
import { MessageTable, PartTable, SessionTable } from "./session/sql"
import type { SessionSchema } from "./session/schema"
import { TurnInputTable, TurnModelOperationTable, TurnToolCandidateTable } from "./turn/sql"
import type { MessageID, PartID } from "./v1/session"

export {
  AdministrativeHistoryIntegrityError,
  FrontierUnrepresentableError,
  HistoricalPresentationNotRevertibleError,
} from "./session-presentation/schema"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
const MAX_TIME = Number.MAX_SAFE_INTEGER

export type AdministrativeHistoryMessage = Readonly<{
  messageID: MessageID
  ordinal: number
  timeCreated: number
  sourceTimeCreated?: number
  parts: readonly Readonly<{
    partID: PartID
    ordinal: number
    embeddedParts: readonly Readonly<{ partID: PartID; ordinal: number }>[]
  }>[]
}>

export type AdministrativeHistorySeal = Readonly<{
  kind: "offline_exact_restore" | "local_import_copy"
  bundleVersion: 1
  classifierVersion: 1
  orderVersion: 1
  sourceFileFingerprint: string
  membershipFingerprint: string
  orderFingerprint: string
  historyFrontierTime: number
  messages: readonly AdministrativeHistoryMessage[]
}>

export function createAdministrativeHistorySeal(input: {
  kind: AdministrativeHistorySeal["kind"]
  sourceFileFingerprint: string
  messages: readonly Readonly<{
    messageID: MessageID
    ordinal: number
    timeCreated: number
    sourceTimeCreated?: number
    parts: readonly Readonly<{
      partID: PartID
      ordinal: number
      embeddedParts?: readonly Readonly<{ partID: PartID; ordinal: number }>[]
    }>[]
  }>[]
  historyFrontierTime?: number
}): AdministrativeHistorySeal {
  const messages = input.messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => ({ ...part, embeddedParts: [...(part.embeddedParts ?? [])] })),
  }))
  return {
    kind: input.kind,
    bundleVersion: 1,
    classifierVersion: 1,
    orderVersion: 1,
    sourceFileFingerprint: input.sourceFileFingerprint,
    membershipFingerprint: fingerprint(
      messages.flatMap((message) => [
        { type: "message", id: message.messageID },
        ...message.parts.flatMap((part) => [
          { type: "part", id: part.partID, messageID: message.messageID },
          ...part.embeddedParts.map((embedded) => ({
            type: "embedded_part",
            id: embedded.partID,
            parentPartID: part.partID,
            messageID: message.messageID,
          })),
        ]),
      ]),
    ),
    orderFingerprint: fingerprint(
      messages.map((message) => ({
        messageID: message.messageID,
        ordinal: message.ordinal,
        timeCreated: message.timeCreated,
        ...(message.sourceTimeCreated === undefined ? {} : { sourceTimeCreated: message.sourceTimeCreated }),
        parts: message.parts.map((part) => ({
          partID: part.partID,
          ordinal: part.ordinal,
          embeddedParts: part.embeddedParts.map((embedded) => ({
            partID: embedded.partID,
            ordinal: embedded.ordinal,
          })),
        })),
      })),
    ),
    historyFrontierTime:
      input.historyFrontierTime ?? Math.max(...messages.map((message) => message.timeCreated)),
    messages,
  }
}

export function beginAdministrativeHistory(
  tx: Transaction,
  sessionID: SessionSchema.ID,
  input: AdministrativeHistorySeal,
): Effect.Effect<void, AdministrativeHistoryIntegrityError | FrontierUnrepresentableError> {
  return Effect.gen(function* () {
    yield* validateSealShape(sessionID, input)
    const session = yield* tx
      .select({ id: SessionTable.id, revert: SessionTable.revert })
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionID))
      .get()
      .pipe(Effect.orDie)
    if (!session || session.revert) {
      return yield* new AdministrativeHistoryIntegrityError({
        sessionID,
        reason: session ? "imported_revert_present" : "session_not_found",
      })
    }
    const existing = yield* tx
      .select()
      .from(SessionAdministrativeHistoryTable)
      .where(eq(SessionAdministrativeHistoryTable.session_id, sessionID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      if (!headerMatches(existing, input)) {
        return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "history_header_conflict" })
      }
      return
    }
    yield* tx
      .insert(SessionAdministrativeHistoryTable)
      .values(headerValues(sessionID, input))
      .run()
      .pipe(Effect.orDie)
  })
}

export function initializeFrontier(
  tx: Transaction,
  input: Readonly<{ sessionID: SessionSchema.ID; frontierTime?: number; messageCount?: number }>,
) {
  return tx
    .insert(SessionPresentationFrontierTable)
    .values({
      session_id: input.sessionID,
      frontier_time: input.frontierTime ?? 0,
      message_count: input.messageCount ?? 0,
      frontier_version: 1,
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
}

export function readFrontier(tx: Transaction, sessionID: SessionSchema.ID) {
  return tx
    .select()
    .from(SessionPresentationFrontierTable)
    .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
    .get()
    .pipe(Effect.orDie)
}

export function reserveMessageBlock(
  tx: Transaction,
  input: Readonly<{ sessionID: SessionSchema.ID; count: number; floor?: number }>,
): Effect.Effect<readonly number[], FrontierUnrepresentableError | AdministrativeHistoryIntegrityError> {
  return Effect.gen(function* () {
    if (!Number.isSafeInteger(input.count) || input.count < 1) {
      throw new Error("Session presentation reservation count must be a positive safe integer")
    }
    yield* assertAdministrativeHistoryIntegrity(tx, input.sessionID)
    const existing = yield* readFrontier(tx, input.sessionID)
    if (!existing) {
      const observed = yield* tx
        .select({ frontierTime: max(MessageTable.time_created), messageCount: count(MessageTable.id) })
        .from(MessageTable)
        .where(eq(MessageTable.session_id, input.sessionID))
        .get()
        .pipe(Effect.orDie)
      yield* initializeFrontier(tx, {
        sessionID: input.sessionID,
        frontierTime: Number(observed?.frontierTime ?? 0),
        messageCount: Number(observed?.messageCount ?? 0),
      })
    }
    const frontier = yield* readFrontier(tx, input.sessionID)
    if (!frontier) throw new Error(`Session ${input.sessionID} has no presentation frontier`)
    const start = Math.max(frontier.frontier_time, input.floor ?? 0) + 1
    const offset = input.count - 1
    if (!Number.isSafeInteger(start) || start > MAX_TIME - offset) {
      return yield* new FrontierUnrepresentableError({ sessionID: input.sessionID })
    }
    return Array.from({ length: input.count }, (_, index) => start + index)
  })
}

export function sealAdministrativeHistory(
  tx: Transaction,
  sessionID: SessionSchema.ID,
  input: AdministrativeHistorySeal,
): Effect.Effect<void, AdministrativeHistoryIntegrityError | FrontierUnrepresentableError> {
  return Effect.gen(function* () {
    yield* validateSealShape(sessionID, input)
    const session = yield* tx
      .select({ id: SessionTable.id, revert: SessionTable.revert })
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionID))
      .get()
      .pipe(Effect.orDie)
    if (!session || session.revert) {
      return yield* new AdministrativeHistoryIntegrityError({
        sessionID,
        reason: session ? "imported_revert_present" : "session_not_found",
      })
    }
    const ordered = [...input.messages].sort(
      (left, right) => left.timeCreated - right.timeCreated || left.messageID.localeCompare(right.messageID),
    )
    if (ordered.some((message, index) => message.ordinal !== index || message !== input.messages[index])) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "noncanonical_message_order" })
    }
    if (Math.max(...ordered.map((message) => message.timeCreated)) > input.historyFrontierTime) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "history_frontier_mismatch" })
    }
    const messageRows = yield* tx
      .select({ id: MessageTable.id, timeCreated: MessageTable.time_created })
      .from(MessageTable)
      .where(eq(MessageTable.session_id, sessionID))
      .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
      .all()
      .pipe(Effect.orDie)
    const partRows = yield* tx
      .select({ id: PartTable.id, messageID: PartTable.message_id, data: PartTable.data })
      .from(PartTable)
      .where(eq(PartTable.session_id, sessionID))
      .all()
      .pipe(Effect.orDie)
    const expectedParts = ordered.flatMap((message) =>
      message.parts.map((part) => ({ id: part.partID, messageID: message.messageID })),
    )
    if (
      messageRows.length !== ordered.length ||
      partRows.length !== expectedParts.length ||
      messageRows.some(
        (row, index) => row.id !== ordered[index]?.messageID || row.timeCreated !== ordered[index]?.timeCreated,
      ) ||
      expectedParts.some(
        (expected) => !partRows.some((row) => row.id === expected.id && row.messageID === expected.messageID),
      ) ||
      ordered.some((message) =>
        message.parts.some((part) => {
          const stored = partRows.find((row) => row.id === part.partID)
          const attachments = stored ? embeddedAttachments(stored.data) : undefined
          return (
            !attachments ||
            attachments.length !== part.embeddedParts.length ||
            attachments.some(
              (attachment, index) =>
                attachment.id !== part.embeddedParts[index]?.partID ||
                attachment.sessionID !== sessionID ||
                attachment.messageID !== message.messageID,
            )
          )
        }),
      )
    ) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "history_membership_mismatch" })
    }

    yield* beginAdministrativeHistory(tx, sessionID, input)
    const existingMembers = yield* tx
      .select({ id: SessionAdministrativeHistoryMessageTable.message_id })
      .from(SessionAdministrativeHistoryMessageTable)
      .where(eq(SessionAdministrativeHistoryMessageTable.session_id, sessionID))
      .all()
      .pipe(Effect.orDie)
    if (existingMembers.length > 0) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "history_already_sealed" })
    }
    yield* tx
      .insert(SessionAdministrativeHistoryMessageTable)
      .values(
        ordered.map((message) => ({
          session_id: sessionID,
          message_id: message.messageID,
          ordinal: message.ordinal,
          time_created: message.timeCreated,
          source_time_created: message.sourceTimeCreated ?? null,
        })),
      )
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(SessionAdministrativeHistoryPartTable)
      .values(
        ordered.flatMap((message) =>
          message.parts.map((part) => ({
            session_id: sessionID,
            message_id: message.messageID,
            part_id: part.partID,
            message_ordinal: message.ordinal,
            part_ordinal: part.ordinal,
          })),
        ),
      )
      .run()
      .pipe(Effect.orDie)
    const embeddedRows = ordered.flatMap((message) =>
      message.parts.flatMap((part) =>
        part.embeddedParts.map((embedded) => ({
          session_id: sessionID,
          message_id: message.messageID,
          parent_part_id: part.partID,
          part_id: embedded.partID,
          message_ordinal: message.ordinal,
          part_ordinal: part.ordinal,
          embedded_ordinal: embedded.ordinal,
        })),
      ),
    )
    if (embeddedRows.length > 0) {
      yield* tx
        .insert(SessionAdministrativeHistoryEmbeddedPartTable)
        .values(embeddedRows)
        .run()
        .pipe(Effect.orDie)
    }
    yield* tx
      .insert(SessionPresentationFrontierTable)
      .values({
        session_id: sessionID,
        frontier_time: input.historyFrontierTime,
        message_count: ordered.length,
        frontier_version: 1,
      })
      .onConflictDoUpdate({
        target: SessionPresentationFrontierTable.session_id,
        set: { frontier_time: input.historyFrontierTime, message_count: ordered.length },
      })
      .run()
      .pipe(Effect.orDie)
    yield* assertAdministrativeHistoryIntegrity(tx, sessionID)
  })
}

function validateSealShape(
  sessionID: SessionSchema.ID,
  input: AdministrativeHistorySeal,
): Effect.Effect<void, AdministrativeHistoryIntegrityError | FrontierUnrepresentableError> {
  return Effect.gen(function* () {
    if (
      input.bundleVersion !== 1 ||
      input.classifierVersion !== 1 ||
      input.orderVersion !== 1 ||
      !/^[0-9a-f]{64}$/.test(input.sourceFileFingerprint)
    ) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "unsupported_history_seal" })
    }
    if (input.messages.length === 0 || input.messages.every((message) => message.parts.length === 0)) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "import_history_unusable" })
    }
    if (input.historyFrontierTime >= MAX_TIME) return yield* new FrontierUnrepresentableError({ sessionID })
    const messageIDs = new Set<MessageID>()
    const partIDs = new Set<PartID>()
    for (const [messageOrdinal, message] of input.messages.entries()) {
      if (
        message.ordinal !== messageOrdinal ||
        !Number.isSafeInteger(message.timeCreated) ||
        message.timeCreated < 0 ||
        (message.sourceTimeCreated !== undefined &&
          (!Number.isSafeInteger(message.sourceTimeCreated) || message.sourceTimeCreated < 0)) ||
        messageIDs.has(message.messageID)
      ) {
        return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "noncanonical_message_order" })
      }
      messageIDs.add(message.messageID)
      for (const [partOrdinal, part] of message.parts.entries()) {
        if (part.ordinal !== partOrdinal || partIDs.has(part.partID)) {
          return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "noncanonical_part_order" })
        }
        partIDs.add(part.partID)
        for (const [embeddedOrdinal, embedded] of part.embeddedParts.entries()) {
          if (embedded.ordinal !== embeddedOrdinal || partIDs.has(embedded.partID)) {
            return yield* new AdministrativeHistoryIntegrityError({
              sessionID,
              reason: "noncanonical_embedded_part_order",
            })
          }
          partIDs.add(embedded.partID)
        }
      }
    }
    const expected = createAdministrativeHistorySeal({
      kind: input.kind,
      sourceFileFingerprint: input.sourceFileFingerprint,
      messages: input.messages,
      historyFrontierTime: input.historyFrontierTime,
    })
    if (
      input.historyFrontierTime !== expected.historyFrontierTime ||
      input.membershipFingerprint !== expected.membershipFingerprint ||
      input.orderFingerprint !== expected.orderFingerprint
    ) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "history_seal_fingerprint_mismatch" })
    }
  })
}

function headerValues(sessionID: SessionSchema.ID, input: AdministrativeHistorySeal) {
  return {
    session_id: sessionID,
    kind: input.kind,
    bundle_version: input.bundleVersion,
    classifier_version: input.classifierVersion,
    order_version: input.orderVersion,
    source_file_fingerprint: input.sourceFileFingerprint,
    message_count: input.messages.length,
    part_count: input.messages.reduce(
      (count, message) =>
        count + message.parts.reduce((partCount, part) => partCount + 1 + part.embeddedParts.length, 0),
      0,
    ),
    membership_fingerprint: input.membershipFingerprint,
    order_fingerprint: input.orderFingerprint,
    history_frontier_time: input.historyFrontierTime,
    imported_revert_absent: true,
  } as const
}

function headerMatches(
  row: typeof SessionAdministrativeHistoryTable.$inferSelect,
  input: AdministrativeHistorySeal,
) {
  const expected = headerValues(row.session_id, input)
  return Object.entries(expected).every(([key, value]) => row[key as keyof typeof row] === value)
}

function fingerprint(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(stableStringify(value)).digest("hex")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`
}

function embeddedAttachments(value: unknown) {
  if (!value || typeof value !== "object" || !("type" in value) || value.type !== "tool") return []
  if (!("state" in value) || !value.state || typeof value.state !== "object") return undefined
  if (!("status" in value.state) || value.state.status !== "completed") return []
  if (!("attachments" in value.state) || value.state.attachments === undefined) return []
  if (!Array.isArray(value.state.attachments)) return undefined
  const attachments = value.state.attachments.map((attachment) => {
    if (
      !attachment ||
      typeof attachment !== "object" ||
      !("id" in attachment) ||
      typeof attachment.id !== "string" ||
      !("sessionID" in attachment) ||
      typeof attachment.sessionID !== "string" ||
      !("messageID" in attachment) ||
      typeof attachment.messageID !== "string"
    ) {
      return undefined
    }
    return {
      id: attachment.id as PartID,
      sessionID: attachment.sessionID as SessionSchema.ID,
      messageID: attachment.messageID as MessageID,
    }
  })
  return attachments.some((attachment) => attachment === undefined)
    ? undefined
    : attachments.filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== undefined)
}

export function assertAdministrativeHistoryIntegrity(
  tx: Transaction,
  sessionID: SessionSchema.ID,
): Effect.Effect<void, AdministrativeHistoryIntegrityError> {
  return Effect.gen(function* () {
    const history = yield* tx
      .select()
      .from(SessionAdministrativeHistoryTable)
      .where(eq(SessionAdministrativeHistoryTable.session_id, sessionID))
      .get()
      .pipe(Effect.orDie)
    if (!history) return
    const session = yield* tx
      .select({ revert: SessionTable.revert })
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionID))
      .get()
      .pipe(Effect.orDie)
    if (!session) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "session_not_found" })
    }
    const [messageMembers, partMembers, embeddedMembers, frontier, currentMessages, currentParts, currentEmbeddedParts] =
      yield* Effect.all([
        tx
          .select()
          .from(SessionAdministrativeHistoryMessageTable)
          .where(eq(SessionAdministrativeHistoryMessageTable.session_id, sessionID))
          .orderBy(asc(SessionAdministrativeHistoryMessageTable.ordinal))
          .all()
          .pipe(Effect.orDie),
      tx
        .select()
        .from(SessionAdministrativeHistoryPartTable)
        .where(eq(SessionAdministrativeHistoryPartTable.session_id, sessionID))
        .orderBy(
          asc(SessionAdministrativeHistoryPartTable.message_ordinal),
          asc(SessionAdministrativeHistoryPartTable.part_ordinal),
        )
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(SessionAdministrativeHistoryEmbeddedPartTable)
        .where(eq(SessionAdministrativeHistoryEmbeddedPartTable.session_id, sessionID))
        .orderBy(
          asc(SessionAdministrativeHistoryEmbeddedPartTable.message_ordinal),
          asc(SessionAdministrativeHistoryEmbeddedPartTable.part_ordinal),
          asc(SessionAdministrativeHistoryEmbeddedPartTable.embedded_ordinal),
        )
        .all()
        .pipe(Effect.orDie),
      readFrontier(tx, sessionID),
      tx
        .select({ id: TurnInputTable.message_id })
        .from(TurnInputTable)
        .innerJoin(
          SessionAdministrativeHistoryMessageTable,
          eq(SessionAdministrativeHistoryMessageTable.message_id, TurnInputTable.message_id),
        )
        .where(eq(TurnInputTable.session_id, sessionID))
        .all()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnToolCandidateTable.part_id })
        .from(TurnToolCandidateTable)
        .innerJoin(
          SessionAdministrativeHistoryPartTable,
          eq(SessionAdministrativeHistoryPartTable.part_id, TurnToolCandidateTable.part_id),
        )
        .where(eq(TurnToolCandidateTable.session_id, sessionID))
        .all()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnToolCandidateTable.part_id })
        .from(TurnToolCandidateTable)
        .innerJoin(
          SessionAdministrativeHistoryEmbeddedPartTable,
          eq(SessionAdministrativeHistoryEmbeddedPartTable.part_id, TurnToolCandidateTable.part_id),
        )
        .where(eq(TurnToolCandidateTable.session_id, sessionID))
        .all()
        .pipe(Effect.orDie),
    ])
    if (
      messageMembers.length !== history.message_count ||
      partMembers.length + embeddedMembers.length !== history.part_count ||
      !frontier ||
      frontier.frontier_time < history.history_frontier_time ||
      currentMessages.length > 0 ||
      currentParts.length > 0 ||
      currentEmbeddedParts.length > 0
    ) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "history_seal_mismatch" })
    }
    const storedMessages = yield* tx
      .select({ id: MessageTable.id, sessionID: MessageTable.session_id, timeCreated: MessageTable.time_created })
      .from(MessageTable)
      .where(inArray(MessageTable.id, messageMembers.map((member) => member.message_id)))
      .all()
      .pipe(Effect.orDie)
    const storedParts = yield* tx
      .select({ id: PartTable.id, sessionID: PartTable.session_id, messageID: PartTable.message_id, data: PartTable.data })
      .from(PartTable)
      .where(inArray(PartTable.message_id, messageMembers.map((member) => member.message_id)))
      .all()
      .pipe(Effect.orDie)
    const embeddedTopLevelAliases =
      embeddedMembers.length === 0
        ? []
        : yield* tx
            .select({ id: PartTable.id })
            .from(PartTable)
            .where(inArray(PartTable.id, embeddedMembers.map((member) => member.part_id)))
            .all()
            .pipe(Effect.orDie)
    if (embeddedTopLevelAliases.length > 0) {
      return yield* new AdministrativeHistoryIntegrityError({
        sessionID,
        reason: "embedded_part_reused_as_top_level_part",
      })
    }
    const sealedMessages = messageMembers.map((member, ordinal) => {
      const stored = storedMessages.find((message) => message.id === member.message_id)
      const parts = partMembers.filter((part) => part.message_ordinal === ordinal)
      if (
        member.ordinal !== ordinal ||
        !stored ||
        stored.sessionID !== sessionID ||
        stored.timeCreated !== member.time_created ||
        parts.some((part, partOrdinal) => {
          const storedPart = storedParts.find((candidate) => candidate.id === part.part_id)
          const sealedEmbedded = embeddedMembers.filter(
            (embedded) =>
              embedded.message_ordinal === ordinal &&
              embedded.part_ordinal === partOrdinal &&
              embedded.parent_part_id === part.part_id,
          )
          const attachments = storedPart ? embeddedAttachments(storedPart.data) : undefined
          return (
            part.session_id !== sessionID ||
            part.message_id !== member.message_id ||
            part.part_ordinal !== partOrdinal ||
            !storedPart ||
            storedPart.sessionID !== sessionID ||
            storedPart.messageID !== member.message_id ||
            !attachments ||
            attachments.length !== sealedEmbedded.length ||
            sealedEmbedded.some(
              (embedded, embeddedOrdinal) =>
                embedded.session_id !== sessionID ||
                embedded.message_id !== member.message_id ||
                embedded.embedded_ordinal !== embeddedOrdinal ||
                attachments[embeddedOrdinal]?.id !== embedded.part_id ||
                attachments[embeddedOrdinal]?.sessionID !== sessionID ||
                attachments[embeddedOrdinal]?.messageID !== member.message_id,
            )
          )
        })
      ) {
        return undefined
      }
      return {
        messageID: member.message_id,
        ordinal,
        timeCreated: member.time_created,
        sourceTimeCreated: member.source_time_created ?? undefined,
        parts: parts.map((part) => ({
          partID: part.part_id,
          ordinal: part.part_ordinal,
          embeddedParts: embeddedMembers
            .filter(
              (embedded) =>
                embedded.message_ordinal === ordinal &&
                embedded.part_ordinal === part.part_ordinal &&
                embedded.parent_part_id === part.part_id,
            )
            .map((embedded) => ({ partID: embedded.part_id, ordinal: embedded.embedded_ordinal })),
        })),
      }
    })
    if (sealedMessages.some((message) => message === undefined)) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "history_membership_mismatch" })
    }
    if (storedParts.length !== partMembers.length) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "history_part_coverage_mismatch" })
    }
    if (
      embeddedMembers.some((embedded) =>
        !partMembers.some(
          (part) =>
            part.session_id === embedded.session_id &&
            part.message_id === embedded.message_id &&
            part.part_id === embedded.parent_part_id &&
            part.message_ordinal === embedded.message_ordinal &&
            part.part_ordinal === embedded.part_ordinal,
        ),
      )
    ) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "embedded_part_membership_mismatch" })
    }
    const expected = createAdministrativeHistorySeal({
      kind: history.kind,
      sourceFileFingerprint: history.source_file_fingerprint,
      historyFrontierTime: history.history_frontier_time,
      messages: sealedMessages.filter((message): message is NonNullable<typeof message> => message !== undefined),
    })
    if (
      history.bundle_version !== expected.bundleVersion ||
      history.classifier_version !== expected.classifierVersion ||
      history.order_version !== expected.orderVersion ||
      history.membership_fingerprint !== expected.membershipFingerprint ||
      history.order_fingerprint !== expected.orderFingerprint ||
      history.imported_revert_absent !== true
    ) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "history_fingerprint_mismatch" })
    }
    if (session.revert) {
      const overlap = yield* Effect.all([
        tx
          .select({ id: SessionAdministrativeHistoryMessageTable.message_id })
          .from(SessionAdministrativeHistoryMessageTable)
          .where(
            and(
              eq(SessionAdministrativeHistoryMessageTable.session_id, sessionID),
              eq(
                SessionAdministrativeHistoryMessageTable.message_id,
                session.revert.messageID as unknown as MessageID,
              ),
            ),
          )
          .get()
          .pipe(Effect.orDie),
        session.revert.partID
          ? tx
              .select({ id: SessionAdministrativeHistoryPartTable.part_id })
              .from(SessionAdministrativeHistoryPartTable)
              .where(
                and(
                  eq(SessionAdministrativeHistoryPartTable.session_id, sessionID),
                  eq(
                    SessionAdministrativeHistoryPartTable.part_id,
                    session.revert.partID as unknown as PartID,
                  ),
                ),
              )
              .get()
              .pipe(Effect.orDie)
          : Effect.succeed(undefined),
      ])
      if (overlap.some(Boolean)) {
        return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "local_revert_overlaps_history" })
      }
    }
    const model = yield* tx
      .select({ id: TurnModelOperationTable.assistant_message_id })
      .from(TurnModelOperationTable)
      .innerJoin(
        SessionAdministrativeHistoryMessageTable,
        eq(SessionAdministrativeHistoryMessageTable.message_id, TurnModelOperationTable.assistant_message_id),
      )
      .where(eq(TurnModelOperationTable.session_id, sessionID))
      .get()
      .pipe(Effect.orDie)
    if (model) {
      return yield* new AdministrativeHistoryIntegrityError({ sessionID, reason: "historical_message_is_executable" })
    }
  })
}

export function assertPresentationRevertible(
  tx: Transaction,
  input: Readonly<{ sessionID: SessionSchema.ID; presentationID: MessageID | PartID }>,
) {
  return Effect.gen(function* () {
    const historical = yield* Effect.all([
      tx
        .select({ id: SessionAdministrativeHistoryMessageTable.message_id })
        .from(SessionAdministrativeHistoryMessageTable)
        .where(
          and(
            eq(SessionAdministrativeHistoryMessageTable.session_id, input.sessionID),
            eq(SessionAdministrativeHistoryMessageTable.message_id, input.presentationID as MessageID),
          ),
        )
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: SessionAdministrativeHistoryPartTable.part_id })
        .from(SessionAdministrativeHistoryPartTable)
        .where(
          and(
            eq(SessionAdministrativeHistoryPartTable.session_id, input.sessionID),
            eq(SessionAdministrativeHistoryPartTable.part_id, input.presentationID as PartID),
          ),
        )
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: SessionAdministrativeHistoryEmbeddedPartTable.part_id })
        .from(SessionAdministrativeHistoryEmbeddedPartTable)
        .where(
          and(
            eq(SessionAdministrativeHistoryEmbeddedPartTable.session_id, input.sessionID),
            eq(SessionAdministrativeHistoryEmbeddedPartTable.part_id, input.presentationID as PartID),
          ),
        )
        .get()
        .pipe(Effect.orDie),
    ])
    if (historical.some(Boolean)) {
      return yield* new HistoricalPresentationNotRevertibleError({
        sessionID: input.sessionID,
        presentationID: input.presentationID,
      })
    }
  })
}

export function historicalMessageIDs(tx: Transaction, sessionID: SessionSchema.ID) {
  return tx
    .select({ id: SessionAdministrativeHistoryMessageTable.message_id })
    .from(SessionAdministrativeHistoryMessageTable)
    .where(eq(SessionAdministrativeHistoryMessageTable.session_id, sessionID))
    .orderBy(asc(SessionAdministrativeHistoryMessageTable.ordinal))
    .all()
    .pipe(
      Effect.map((rows) => rows.map((row) => row.id)),
      Effect.orDie,
    )
}

export function canonicalLocalSuffix(
  tx: Transaction,
  input: { sessionID: SessionSchema.ID; targetMessageID: MessageID },
) {
  return Effect.gen(function* () {
    yield* assertPresentationRevertible(tx, {
      sessionID: input.sessionID,
      presentationID: input.targetMessageID,
    })
    const target = yield* tx
      .select({ timeCreated: MessageTable.time_created })
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, input.sessionID), eq(MessageTable.id, input.targetMessageID)))
      .get()
      .pipe(Effect.orDie)
    if (!target) return []
    const messages = yield* tx
      .select({ id: MessageTable.id })
      .from(MessageTable)
      .where(
        and(
          eq(MessageTable.session_id, input.sessionID),
          or(
            gt(MessageTable.time_created, target.timeCreated),
            and(eq(MessageTable.time_created, target.timeCreated), gte(MessageTable.id, input.targetMessageID)),
          ),
        ),
      )
      .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
      .all()
      .pipe(Effect.orDie)
    const historical = new Set(yield* historicalMessageIDs(tx, input.sessionID))
    if (messages.some((message) => historical.has(message.id))) {
      return yield* new AdministrativeHistoryIntegrityError({
        sessionID: input.sessionID,
        reason: "local_revert_crosses_imported_history",
      })
    }
    return messages.map((message) => message.id)
  })
}
