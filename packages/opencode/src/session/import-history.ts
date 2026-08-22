export * as SessionImportHistory from "./import-history"

import { LearnerHomeIdentity } from "@opencode-ai/core/database/identity"
import { Database } from "@opencode-ai/core/database/database"
import { EventSequenceTable } from "@opencode-ai/core/event/sql"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import {
  AdmittedLearnerOccurrenceTable,
  HistoricalLearningToolPresentationTable,
  LearnerOccurrencePresentationTable,
  LearnerOccurrenceSourceOrderTable,
} from "@opencode-ai/core/learning-command/occurrence.sql"
import { SessionDeletion } from "@opencode-ai/core/session-deletion"
import { SessionDeletionControlReceiptTable } from "@opencode-ai/core/session-deletion/sql"
import { SessionPresentation } from "@opencode-ai/core/session-presentation"
import {
  SessionAdministrativeHistoryEmbeddedPartTable,
  SessionAdministrativeHistoryMessageTable,
  SessionAdministrativeHistoryPartTable,
  SessionAdministrativeHistoryTable,
  SessionPresentationFrontierTable,
} from "@opencode-ai/core/session-presentation/sql"
import {
  MessageTable,
  PartTable,
  SessionHistoricalMessagePresentationTable,
  SessionHistoricalPartPresentationTable,
  SessionTable,
} from "@opencode-ai/core/session/sql"
import {
  TurnHistoricalModelPresentationTable,
  TurnHistoricalInputPresentationTable,
  TurnHistoricalToolPresentationTable,
  TurnChildLineageTable,
  TurnChildResultTable,
  TurnInputTable,
  TurnModelOperationTable,
  TurnModelSourceRetentionTable,
  TurnToolCandidateTable,
  TurnTable,
  TurnUnavailableModelTable,
  TurnUnavailableSourceTable,
  TurnUnavailableToolTable,
} from "@opencode-ai/core/turn/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import path from "path"
import type { InstanceContext } from "@/project/instance-context"
import { MessageID, PartID, SessionID } from "./schema"
import { Session } from "./session"
import { SessionPrompt } from "./prompt"

const MAX_TIME = Number.MAX_SAFE_INTEGER
const HEX_64 = /^[0-9a-f]{64}$/

export const OfflineHistoryBundle = Schema.Struct({
  type: Schema.Literal("repa_session_offline_history"),
  schemaVersion: Schema.Literal(1),
  sourceDatabaseID: LearnerHomeIdentity.ID,
  info: Session.Info,
  messages: Schema.Array(SessionV1.WithParts),
}).annotate({
  identifier: "SessionImportHistory.OfflineHistoryBundle",
  parseOptions: { onExcessProperty: "error" },
})
export type OfflineHistoryBundle = {
  type: "repa_session_offline_history"
  schemaVersion: 1
  sourceDatabaseID: LearnerHomeIdentity.ID
  info: Session.Info
  messages: SessionV1.WithParts[]
}

export class DecodeError extends Schema.TaggedErrorClass<DecodeError>()("SessionImportHistory.DecodeError", {
  reason: Schema.String,
}) {}

export class UnusableError extends Schema.TaggedErrorClass<UnusableError>()("SessionImportHistory.UnusableError", {
  reason: Schema.String,
}) {}

export class UnsafeError extends Schema.TaggedErrorClass<UnsafeError>()("SessionImportHistory.UnsafeError", {
  reason: Schema.String,
}) {}

export class IdentityConflictError extends Schema.TaggedErrorClass<IdentityConflictError>()(
  "SessionImportHistory.IdentityConflictError",
  { identityKind: Schema.String, identity: Schema.String },
) {}

export class SameDatabaseError extends Schema.TaggedErrorClass<SameDatabaseError>()(
  "SessionImportHistory.SameDatabaseError",
  { sessionID: SessionID },
) {}

export class ConfirmationError extends Schema.TaggedErrorClass<ConfirmationError>()(
  "SessionImportHistory.ConfirmationError",
  { reason: Schema.String },
) {}

export class SourceChangedError extends Schema.TaggedErrorClass<SourceChangedError>()(
  "SessionImportHistory.SourceChangedError",
  { expected: Schema.String, actual: Schema.String },
) {}

export type Decoded = Readonly<{
  bundle: OfflineHistoryBundle
  sourceFileFingerprint: string
  historyFrontierTime: number
  topLevelPartCount: number
  allPartCount: number
}>

const decodeBundle = Schema.decodeUnknownEffect(OfflineHistoryBundle)

export const decode = Effect.fn("SessionImportHistory.decode")(function* (source: string) {
  const parsed = yield* Effect.try({
    try: () => JSON.parse(source),
    catch: () => new DecodeError({ reason: "invalid_json" }),
  })
  const decoded = yield* decodeBundle(parsed).pipe(
    Effect.mapError(() => new DecodeError({ reason: "unsupported_or_malformed_bundle" })),
  )
  const bundle = structuredClone(decoded) as OfflineHistoryBundle
  return yield* validate(bundle, fingerprintBytes(source))
})

function validate(bundle: OfflineHistoryBundle, sourceFileFingerprint: string) {
  return Effect.gen(function* () {
    if (bundle.info.parentID) return yield* new UnusableError({ reason: "external_session_parent" })
    if (bundle.info.share) return yield* new UnsafeError({ reason: "external_share_state" })
    if (bundle.info.revert) return yield* new UnsafeError({ reason: "session_revert_present" })
    if (bundle.info.time.compacting !== undefined) {
      return yield* new UnsafeError({ reason: "session_compaction_in_progress" })
    }
    if (bundle.messages.length === 0) return yield* new UnusableError({ reason: "zero_messages" })

    const ordered = [...bundle.messages].sort(
      (left, right) => left.info.time.created - right.info.time.created || left.info.id.localeCompare(right.info.id),
    )
    if (ordered.some((message, index) => message !== bundle.messages[index])) {
      return yield* new UnusableError({ reason: "noncanonical_message_order" })
    }

    const messageByID = new Map<SessionV1.MessageID, SessionV1.WithParts>()
    const partIDs = new Set<SessionV1.PartID>()
    let visible = false
    let allPartCount = 0
    const times = sessionTimes(bundle.info)
    if (times.some((time) => !safeTime(time))) return yield* new UnusableError({ reason: "session_time" })

    for (const [messageIndex, message] of bundle.messages.entries()) {
      if (message.info.sessionID !== bundle.info.id || messageByID.has(message.info.id)) {
        return yield* new UnusableError({ reason: "message_identity_or_membership" })
      }
      if (!safeTime(message.info.time.created)) return yield* new UnusableError({ reason: "message_time" })
      messageByID.set(message.info.id, message)
      times.push(message.info.time.created)

      if (message.info.role === "assistant") {
        const parent = messageByID.get(message.info.parentID)
        if (!parent || parent.info.role !== "user" || parent === message) {
          return yield* new UnusableError({ reason: "assistant_parent" })
        }
        if (
          message.info.time.completed === undefined ||
          (!message.info.finish && !message.info.error) ||
          !safeTime(message.info.time.completed) ||
          message.info.time.completed < message.info.time.created
        ) {
          return yield* new UnsafeError({ reason: "nonterminal_assistant" })
        }
        times.push(message.info.time.completed)
      }

      let stepDepth = 0
      for (const part of message.parts) {
        if (part.sessionID !== bundle.info.id || part.messageID !== message.info.id || partIDs.has(part.id)) {
          return yield* new UnusableError({ reason: "part_identity_or_membership" })
        }
        partIDs.add(part.id)
        allPartCount++
        visible ||= learnerVisible(part)
        yield* validatePart(part, message, messageIndex, bundle.messages, messageByID, partIDs, times).pipe(
          Effect.map((nestedCount) => {
            allPartCount += nestedCount
          }),
        )
        if (part.type === "step-start") stepDepth++
        if (part.type === "step-finish") stepDepth--
        if (stepDepth < 0) return yield* new UnsafeError({ reason: "unmatched_step_finish" })
      }
      if (stepDepth !== 0) return yield* new UnsafeError({ reason: "unmatched_step_start" })
    }

    for (const message of bundle.messages) {
      const hasSubtask = message.parts.some((part) => part.type === "subtask")
      if (hasSubtask && message.info.role !== "user") {
        return yield* new UnsafeError({ reason: "unresolved_subtask" })
      }
      if (message.info.role !== "user") continue
      const terminalChild = bundle.messages.some(
        (candidate) =>
          candidate.info.role === "assistant" &&
          candidate.info.parentID === message.info.id &&
          candidate.info.time.completed !== undefined,
      )
      if (hasSubtask && !terminalChild) {
        return yield* new UnsafeError({ reason: "unresolved_subtask" })
      }
      if (
        message.parts.some((part) => part.type === "compaction") &&
        !bundle.messages.some(
          (candidate) =>
            candidate.info.role === "assistant" &&
            candidate.info.parentID === message.info.id &&
            candidate.info.summary === true &&
            candidate.info.time.completed !== undefined,
        )
      ) {
        return yield* new UnsafeError({ reason: "unresolved_compaction" })
      }
    }

    const topLevelPartCount = bundle.messages.reduce((count, message) => count + message.parts.length, 0)
    if (topLevelPartCount === 0 || !visible) return yield* new UnusableError({ reason: "nonrenderable_history" })
    const historyFrontierTime = Math.max(...times)
    if (!safeTime(historyFrontierTime) || historyFrontierTime >= MAX_TIME) {
      return yield* new SessionPresentation.FrontierUnrepresentableError({ sessionID: bundle.info.id })
    }
    return { bundle, sourceFileFingerprint, historyFrontierTime, topLevelPartCount, allPartCount } satisfies Decoded
  })
}

function validatePart(
  part: SessionV1.Part,
  message: SessionV1.WithParts,
  messageIndex: number,
  messages: readonly SessionV1.WithParts[],
  messageByID: ReadonlyMap<SessionV1.MessageID, SessionV1.WithParts>,
  partIDs: Set<SessionV1.PartID>,
  times: number[],
) {
  return Effect.gen(function* () {
    for (const time of partTimes(part)) {
      if (!safeTime(time) || time < message.info.time.created) {
        return yield* new UnusableError({ reason: "part_time" })
      }
      times.push(time)
    }
    if (part.type === "tool" && (part.state.status === "pending" || part.state.status === "running")) {
      return yield* new UnsafeError({ reason: "unfinished_tool" })
    }
    if (part.type === "compaction") {
      if (part.tail_start_id) {
        const target = messageByID.get(part.tail_start_id)
        if (!target || messages.indexOf(target) >= messageIndex) {
          return yield* new UnusableError({ reason: "compaction_tail_reference" })
        }
      }
      if (part.capacity_history) {
        const source = messageByID.get(part.capacity_history.source_assistant_message_id)
        if (!source || source.info.role !== "assistant" || messages.indexOf(source) >= messageIndex) {
          return yield* new UnusableError({ reason: "compaction_capacity_reference" })
        }
      }
    }
    if (part.type !== "tool" || part.state.status !== "completed" || !part.state.attachments) return 0
    for (const attachment of part.state.attachments) {
      if (
        attachment.sessionID !== part.sessionID ||
        attachment.messageID !== part.messageID ||
        partIDs.has(attachment.id)
      ) {
        return yield* new UnusableError({ reason: "nested_attachment_identity_or_membership" })
      }
      partIDs.add(attachment.id)
    }
    return part.state.attachments.length
  })
}

function learnerVisible(part: SessionV1.Part) {
  return !["step-start", "step-finish", "retry", "snapshot", "compaction"].includes(part.type)
}

function sessionTimes(info: Session.Info) {
  return [info.time.created, info.time.updated, info.time.archived]
    .filter((time): time is number => time !== undefined)
}

function partTimes(part: SessionV1.Part) {
  if (part.type === "text" || part.type === "reasoning") {
    return part.time ? [part.time.start, part.time.end].filter((time): time is number => time !== undefined) : []
  }
  if (part.type === "retry") return [part.time.created]
  if (part.type !== "tool" || part.state.status === "pending") return []
  if (part.state.status === "running") return [part.state.time.start]
  return [
    part.state.time.start,
    part.state.time.end,
    ...(part.state.status === "completed" ? [part.state.time.compacted] : []),
  ].filter(
    (time): time is number => time !== undefined,
  )
}

function safeTime(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME
}

export type ExactRestoreResult =
  | Readonly<{ type: "applied"; sessionID: SessionID }>
  | Readonly<{ type: "already_present"; sessionID: SessionID }>

export const exactRestore = Effect.fn("SessionImportHistory.exactRestore")(function* (input: {
  decoded: Decoded
  context: InstanceContext
  sourceStillMatches: Effect.Effect<boolean>
}) {
  const { db } = yield* Database.Service
  const targetDatabaseID = yield* db.transaction(LearnerHomeIdentity.read).pipe(Effect.orDie)
  const expected = normalizedSession(input.decoded.bundle.info, input.context)
  const seal = exactSeal(input.decoded)

  if (targetDatabaseID === input.decoded.bundle.sourceDatabaseID) {
    yield* db
      .transaction((tx) => SessionDeletion.assertSessionIDAvailable(tx, expected.id))
      .pipe(Effect.catchTag("SqlError", Effect.die))
    return yield* new SameDatabaseError({ sessionID: expected.id })
  }

  return yield* db
    .transaction((tx) =>
      Effect.gen(function* () {
        const existing = yield* tx
          .select()
          .from(SessionTable)
          .where(eq(SessionTable.id, expected.id))
          .get()
          .pipe(Effect.orDie)
        if (existing) {
          if (yield* exactTargetMatches(tx, expected, input.decoded.bundle.messages, seal)) {
            return { type: "already_present", sessionID: expected.id } as const
          }
          return yield* new IdentityConflictError({ identityKind: "session", identity: expected.id })
        }

        yield* SessionDeletion.assertSessionIDAvailable(tx, expected.id)
        yield* assertTargetIdentitiesAvailable(tx, {
          sessionID: input.decoded.bundle.info.id,
          messageIDs: input.decoded.bundle.messages.map((message) => message.info.id),
          partIDs: allPartIDs(input.decoded.bundle.messages),
          turnIDs: [],
          inputIDs: [],
        })
        if (!(yield* input.sourceStillMatches)) {
          return yield* new SourceChangedError({ expected: input.decoded.sourceFileFingerprint, actual: "changed" })
        }

        yield* tx.insert(SessionTable).values(Session.toRow(expected)).run().pipe(Effect.orDie)
        yield* SessionPresentation.beginAdministrativeHistory(tx, expected.id, seal)
        for (const message of input.decoded.bundle.messages) {
          const { id, sessionID: _, ...data } = message.info
          yield* tx
            .insert(MessageTable)
            .values({
              id,
              session_id: expected.id,
              time_created: message.info.time.created,
              time_updated: message.info.time.created,
              data,
            })
            .run()
            .pipe(Effect.orDie)
          for (const part of message.parts) {
            const { id: partID, sessionID: __, messageID, ...partData } = part
            yield* tx
              .insert(PartTable)
              .values({
                id: partID,
                session_id: expected.id,
                message_id: messageID,
                time_created: message.info.time.created,
                time_updated: message.info.time.created,
                data: partData,
              })
              .run()
              .pipe(Effect.orDie)
          }
        }
        yield* SessionPresentation.sealAdministrativeHistory(tx, expected.id, seal)
        return { type: "applied", sessionID: expected.id } as const
      }),
    )
    .pipe(Effect.catchTag("SqlError", Effect.die))
})

function normalizedSession(info: Session.Info, context: InstanceContext): Session.Info {
  return {
    ...structuredClone(info),
    projectID: context.project.id,
    workspaceID: undefined,
    parentID: undefined,
    directory: context.directory,
    path: path.relative(path.resolve(context.worktree), context.directory).replaceAll("\\", "/"),
    share: undefined,
    revert: undefined,
    time: { ...info.time, compacting: undefined },
  }
}

function exactSeal(decoded: Decoded) {
  return SessionPresentation.createAdministrativeHistorySeal({
    kind: "offline_exact_restore",
    sourceFileFingerprint: decoded.sourceFileFingerprint,
    historyFrontierTime: decoded.historyFrontierTime,
    messages: decoded.bundle.messages.map((message, ordinal) => ({
      messageID: message.info.id,
      ordinal,
      timeCreated: message.info.time.created,
      parts: message.parts.map((part, partOrdinal) => ({
        partID: part.id,
        ordinal: partOrdinal,
        embeddedParts:
          part.type === "tool" && part.state.status === "completed"
            ? (part.state.attachments ?? []).map((attachment, embeddedOrdinal) => ({
                partID: attachment.id,
                ordinal: embeddedOrdinal,
              }))
            : [],
      })),
    })),
  })
}

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function assertTargetIdentitiesAvailable(
  tx: Transaction,
  input: {
    sessionID: SessionID
    messageIDs: readonly MessageID[]
    partIDs: readonly PartID[]
    turnIDs: readonly Turn.ID[]
    inputIDs: readonly Turn.InputID[]
  },
) {
  return Effect.gen(function* () {
    const { sessionID, messageIDs, partIDs, turnIDs, inputIDs } = input
    const sessionChecks = yield* Effect.all([
      tx.select({ id: SessionTable.id }).from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie),
      tx
        .select({ id: SessionTable.parent_id })
        .from(SessionTable)
        .where(eq(SessionTable.parent_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: EventSequenceTable.aggregate_id })
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: SessionDeletionControlReceiptTable.root_session_id })
        .from(SessionDeletionControlReceiptTable)
        .where(eq(SessionDeletionControlReceiptTable.root_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnUnavailableSourceTable.turn_id })
        .from(TurnUnavailableSourceTable)
        .where(
          or(
            eq(TurnUnavailableSourceTable.session_id, sessionID),
            eq(TurnUnavailableSourceTable.parent_session_id, sessionID),
          ),
        )
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: SessionHistoricalMessagePresentationTable.message_id })
        .from(SessionHistoricalMessagePresentationTable)
        .where(eq(SessionHistoricalMessagePresentationTable.source_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearningCommandInvocationTable.part_id })
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearningCommandReceiptTable.id })
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.origin_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearnerOccurrenceSourceOrderTable.occurrence_id })
        .from(LearnerOccurrenceSourceOrderTable)
        .where(eq(LearnerOccurrenceSourceOrderTable.origin_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: AdmittedLearnerOccurrenceTable.id })
        .from(AdmittedLearnerOccurrenceTable)
        .where(eq(AdmittedLearnerOccurrenceTable.origin_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: HistoricalLearningToolPresentationTable.part_id })
        .from(HistoricalLearningToolPresentationTable)
        .where(eq(HistoricalLearningToolPresentationTable.source_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnHistoricalInputPresentationTable.message_id })
        .from(TurnHistoricalInputPresentationTable)
        .where(eq(TurnHistoricalInputPresentationTable.source_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnHistoricalModelPresentationTable.assistant_message_id })
        .from(TurnHistoricalModelPresentationTable)
        .where(eq(TurnHistoricalModelPresentationTable.source_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnHistoricalToolPresentationTable.part_id })
        .from(TurnHistoricalToolPresentationTable)
        .where(eq(TurnHistoricalToolPresentationTable.source_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnChildResultTable.child_session_id })
        .from(TurnChildResultTable)
        .where(eq(TurnChildResultTable.child_session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      tx
        .get<{ id: string }>(sql`
          SELECT json_extract(attachment.value, '$.sessionID') AS id
          FROM part AS stored_part,
               json_each(
                 CASE WHEN json_valid(stored_part.data)
                   THEN COALESCE(json_extract(stored_part.data, '$.state.attachments'), '[]')
                   ELSE '[]'
                 END
               ) AS attachment
          WHERE json_extract(attachment.value, '$.sessionID') = ${sessionID}
          LIMIT 1
        `)
        .pipe(Effect.orDie),
    ])
    if (sessionChecks.some(Boolean)) {
      return yield* new IdentityConflictError({ identityKind: "session", identity: sessionID })
    }

    const messageCollision = yield* Effect.all([
      tx.select({ id: MessageTable.id }).from(MessageTable).where(inArray(MessageTable.id, messageIDs)).get().pipe(Effect.orDie),
      tx
        .select({ id: TurnUnavailableModelTable.assistant_message_id })
        .from(TurnUnavailableModelTable)
        .where(inArray(TurnUnavailableModelTable.assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearningCommandInvocationTable.parent_user_message_id })
        .from(LearningCommandInvocationTable)
        .where(inArray(LearningCommandInvocationTable.parent_user_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearningCommandInvocationTable.assistant_message_id })
        .from(LearningCommandInvocationTable)
        .where(inArray(LearningCommandInvocationTable.assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearningCommandReceiptTable.origin_message_id })
        .from(LearningCommandReceiptTable)
        .where(inArray(LearningCommandReceiptTable.origin_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearningCommandReceiptTable.assistant_message_id })
        .from(LearningCommandReceiptTable)
        .where(inArray(LearningCommandReceiptTable.assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: SessionHistoricalMessagePresentationTable.source_message_id })
        .from(SessionHistoricalMessagePresentationTable)
        .where(inArray(SessionHistoricalMessagePresentationTable.source_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnHistoricalModelPresentationTable.source_assistant_message_id })
        .from(TurnHistoricalModelPresentationTable)
        .where(inArray(TurnHistoricalModelPresentationTable.source_assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearnerOccurrenceSourceOrderTable.origin_message_id })
        .from(LearnerOccurrenceSourceOrderTable)
        .where(inArray(LearnerOccurrenceSourceOrderTable.origin_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: AdmittedLearnerOccurrenceTable.origin_message_id })
        .from(AdmittedLearnerOccurrenceTable)
        .where(inArray(AdmittedLearnerOccurrenceTable.origin_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearnerOccurrencePresentationTable.source_message_id })
        .from(LearnerOccurrencePresentationTable)
        .where(inArray(LearnerOccurrencePresentationTable.source_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: HistoricalLearningToolPresentationTable.source_assistant_message_id })
        .from(HistoricalLearningToolPresentationTable)
        .where(inArray(HistoricalLearningToolPresentationTable.source_assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnInputTable.message_id })
        .from(TurnInputTable)
        .where(inArray(TurnInputTable.message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnInputTable.parent_model_message_id })
        .from(TurnInputTable)
        .where(inArray(TurnInputTable.parent_model_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(inArray(TurnModelOperationTable.assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnToolCandidateTable.assistant_message_id })
        .from(TurnToolCandidateTable)
        .where(inArray(TurnToolCandidateTable.assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnUnavailableSourceTable.parent_model_message_id })
        .from(TurnUnavailableSourceTable)
        .where(inArray(TurnUnavailableSourceTable.parent_model_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnUnavailableToolTable.assistant_message_id })
        .from(TurnUnavailableToolTable)
        .where(inArray(TurnUnavailableToolTable.assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnHistoricalToolPresentationTable.source_assistant_message_id })
        .from(TurnHistoricalToolPresentationTable)
        .where(inArray(TurnHistoricalToolPresentationTable.source_assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnChildLineageTable.parent_model_message_id })
        .from(TurnChildLineageTable)
        .where(inArray(TurnChildLineageTable.parent_model_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnModelSourceRetentionTable.source_assistant_message_id })
        .from(TurnModelSourceRetentionTable)
        .where(inArray(TurnModelSourceRetentionTable.source_assistant_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: SessionHistoricalPartPresentationTable.source_message_id })
        .from(SessionHistoricalPartPresentationTable)
        .where(inArray(SessionHistoricalPartPresentationTable.source_message_id, messageIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .get<{ id: string }>(sql`
          SELECT json_extract(stored_message.data, '$.parentID') AS id
          FROM message AS stored_message
          WHERE json_extract(stored_message.data, '$.parentID') IN (${sql.join(
            messageIDs.map((id) => sql`${id}`),
            sql`, `,
          )})
          UNION ALL
          SELECT json_extract(stored_session.revert, '$.messageID') AS id
          FROM session AS stored_session
          WHERE json_extract(stored_session.revert, '$.messageID') IN (${sql.join(
            messageIDs.map((id) => sql`${id}`),
            sql`, `,
          )})
          UNION ALL
          SELECT json_extract(stored_part.data, '$.tail_start_id') AS id
          FROM part AS stored_part
          WHERE json_extract(stored_part.data, '$.tail_start_id') IN (${sql.join(
            messageIDs.map((id) => sql`${id}`),
            sql`, `,
          )})
          UNION ALL
          SELECT json_extract(stored_part.data, '$.capacity_history.source_assistant_message_id') AS id
          FROM part AS stored_part
          WHERE json_extract(stored_part.data, '$.capacity_history.source_assistant_message_id') IN (${sql.join(
            messageIDs.map((id) => sql`${id}`),
            sql`, `,
          )})
          UNION ALL
          SELECT json_extract(attachment.value, '$.messageID') AS id
          FROM part AS stored_part,
               json_each(
                 CASE WHEN json_valid(stored_part.data)
                   THEN COALESCE(json_extract(stored_part.data, '$.state.attachments'), '[]')
                   ELSE '[]'
                 END
               ) AS attachment
          WHERE json_extract(attachment.value, '$.messageID') IN (${sql.join(
            messageIDs.map((id) => sql`${id}`),
            sql`, `,
          )})
          LIMIT 1
        `)
        .pipe(Effect.orDie),
    ])
    const occupiedMessage = messageCollision.find((row) => typeof row?.id === "string")
    if (occupiedMessage?.id) {
      return yield* new IdentityConflictError({ identityKind: "message", identity: occupiedMessage.id })
    }

    const partCollision = yield* Effect.all([
      tx.select({ id: PartTable.id }).from(PartTable).where(inArray(PartTable.id, partIDs)).get().pipe(Effect.orDie),
      tx
        .select({ id: TurnUnavailableToolTable.part_id })
        .from(TurnUnavailableToolTable)
        .where(inArray(TurnUnavailableToolTable.part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearningCommandInvocationTable.part_id })
        .from(LearningCommandInvocationTable)
        .where(inArray(LearningCommandInvocationTable.part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearningCommandReceiptTable.invocation_part_id })
        .from(LearningCommandReceiptTable)
        .where(inArray(LearningCommandReceiptTable.invocation_part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: SessionHistoricalPartPresentationTable.source_part_id })
        .from(SessionHistoricalPartPresentationTable)
        .where(inArray(SessionHistoricalPartPresentationTable.source_part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnHistoricalToolPresentationTable.source_part_id })
        .from(TurnHistoricalToolPresentationTable)
        .where(inArray(TurnHistoricalToolPresentationTable.source_part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: HistoricalLearningToolPresentationTable.source_part_id })
        .from(HistoricalLearningToolPresentationTable)
        .where(inArray(HistoricalLearningToolPresentationTable.source_part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnToolCandidateTable.part_id })
        .from(TurnToolCandidateTable)
        .where(inArray(TurnToolCandidateTable.part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnUnavailableSourceTable.parent_task_part_id })
        .from(TurnUnavailableSourceTable)
        .where(inArray(TurnUnavailableSourceTable.parent_task_part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnChildLineageTable.parent_task_part_id })
        .from(TurnChildLineageTable)
        .where(inArray(TurnChildLineageTable.parent_task_part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: TurnChildResultTable.parent_task_part_id })
        .from(TurnChildResultTable)
        .where(inArray(TurnChildResultTable.parent_task_part_id, partIDs))
        .get()
        .pipe(Effect.orDie),
      tx
        .get<{ id: string }>(sql`
          SELECT json_extract(stored_session.revert, '$.partID') AS id
          FROM session AS stored_session
          WHERE json_extract(stored_session.revert, '$.partID') IN (${sql.join(
            partIDs.map((id) => sql`${id}`),
            sql`, `,
          )})
          UNION ALL
          SELECT json_extract(attachment.value, '$.id') AS id
          FROM part AS stored_part,
               json_each(
                 CASE WHEN json_valid(stored_part.data)
                   THEN COALESCE(json_extract(stored_part.data, '$.state.attachments'), '[]')
                   ELSE '[]'
                 END
               ) AS attachment
          WHERE json_extract(attachment.value, '$.id') IN (${sql.join(
            partIDs.map((id) => sql`${id}`),
            sql`, `,
          )})
          LIMIT 1
        `)
        .pipe(Effect.orDie),
    ])
    const occupiedPart = partCollision.find((row) => typeof row?.id === "string")
    if (occupiedPart?.id) return yield* new IdentityConflictError({ identityKind: "part", identity: occupiedPart.id })

    if (turnIDs.length > 0) {
      const turnCollision = yield* tx
        .get<{ id: string }>(sql`
          SELECT id FROM turn WHERE id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT turn_id FROM turn_unavailable_source
            WHERE turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT parent_turn_id FROM turn_unavailable_source
            WHERE parent_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT source_turn_id FROM turn_historical_input_presentation
            WHERE source_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT source_turn_id FROM turn_historical_model_presentation
            WHERE source_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT source_turn_id FROM turn_historical_tool_presentation
            WHERE source_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT child_turn_id FROM turn_child_lineage
            WHERE child_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT parent_turn_id FROM turn_child_lineage
            WHERE parent_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT child_turn_id FROM turn_child_result
            WHERE child_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT parent_turn_id FROM turn_child_result
            WHERE parent_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT source_turn_id FROM turn_model_source_retention
            WHERE source_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT turn_id FROM learning_command_invocation
            WHERE turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT subject_turn_id FROM learner_response_evidence_record
            WHERE subject_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT condition_turn_id FROM learner_response_evidence_record
            WHERE condition_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT basis_turn_id FROM learner_response_evidence_revision
            WHERE basis_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT command_cause_turn_id FROM learner_response_evidence_revision
            WHERE command_cause_turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT turn_id FROM future_attention_claim_group
            WHERE turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT turn_id FROM learner_default_course_proposal
            WHERE turn_id IN (${sql.join(turnIDs.map((id) => sql`${id}`), sql`, `)})
          LIMIT 1
        `)
        .pipe(Effect.orDie)
      if (turnCollision?.id) {
        return yield* new IdentityConflictError({ identityKind: "turn", identity: turnCollision.id })
      }
    }

    if (inputIDs.length > 0) {
      const inputCollision = yield* tx
        .get<{ id: string }>(sql`
          SELECT id FROM turn_input WHERE id IN (${sql.join(inputIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT source_input_id FROM turn_historical_input_presentation
            WHERE source_input_id IN (${sql.join(inputIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT input_id FROM learning_command_invocation
            WHERE input_id IN (${sql.join(inputIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT subject_input_id FROM learner_response_evidence_record
            WHERE subject_input_id IN (${sql.join(inputIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT basis_input_id FROM learner_response_evidence_revision
            WHERE basis_input_id IN (${sql.join(inputIDs.map((id) => sql`${id}`), sql`, `)})
          UNION ALL SELECT command_cause_input_id FROM learner_response_evidence_revision
            WHERE command_cause_input_id IN (${sql.join(inputIDs.map((id) => sql`${id}`), sql`, `)})
          LIMIT 1
        `)
        .pipe(Effect.orDie)
      if (inputCollision?.id) {
        return yield* new IdentityConflictError({ identityKind: "input", identity: inputCollision.id })
      }
    }

    const retainedIdentities = [
      { id: sessionID, kind: "session" },
      ...messageIDs.map((id) => ({ id, kind: "message" })),
      ...partIDs.map((id) => ({ id, kind: "part" })),
      ...turnIDs.map((id) => ({ id, kind: "turn" })),
      ...inputIDs.map((id) => ({ id, kind: "input" })),
    ]
    const retainedCollision = yield* tx
      .get<{ id: string; kind: string }>(sql`
        WITH target(id, kind) AS (
          VALUES ${sql.join(
            retainedIdentities.map((identity) => sql`(${identity.id}, ${identity.kind})`),
            sql`, `,
          )}
        ), retained_document(document) AS (
          SELECT binding FROM learner_state_judgment_basis
          UNION ALL SELECT binding FROM learner_state_judgment_anchor
          UNION ALL SELECT binding FROM advisory_plan_suggestion_basis
          UNION ALL SELECT binding FROM advisory_plan_suggestion_anchor
          UNION ALL SELECT canonical_cut FROM turn_learning_context_cut
        )
        SELECT target.id, target.kind
        FROM target, retained_document, json_tree(retained_document.document) AS node
        WHERE node.type = 'text' AND CAST(node.value AS TEXT) = target.id
        LIMIT 1
      `)
      .pipe(Effect.orDie)
    if (retainedCollision) {
      return yield* new IdentityConflictError({
        identityKind: retainedCollision.kind,
        identity: retainedCollision.id,
      })
    }
  })
}

function exactTargetMatches(
  tx: Transaction,
  expectedSession: Session.Info,
  messages: readonly SessionV1.WithParts[],
  seal: SessionPresentation.AdministrativeHistorySeal,
) {
  return Effect.gen(function* () {
    const session = yield* tx
      .select()
      .from(SessionTable)
      .where(eq(SessionTable.id, expectedSession.id))
      .get()
      .pipe(Effect.orDie)
    if (!session) return false
    const expectedRow = Object.fromEntries(
      Object.entries(Session.toRow(expectedSession)).map(([key, value]) => [key, value ?? null]),
    ) as typeof session
    if (!isDeepStrictEqual(Session.fromRow(session), Session.fromRow(expectedRow))) return false
    const rows = yield* tx
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.session_id, expectedSession.id))
      .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
      .all()
      .pipe(Effect.orDie)
    if (rows.length !== messages.length) return false
    for (const [index, row] of rows.entries()) {
      const expected = messages[index]
      if (!expected) return false
      const info = { ...row.data, id: row.id, sessionID: row.session_id } as SessionV1.Info
      if (!isDeepStrictEqual(info, expected.info)) return false
      const parts = yield* tx.select().from(PartTable).where(eq(PartTable.message_id, row.id)).all().pipe(Effect.orDie)
      if (parts.length !== expected.parts.length) return false
      for (const part of expected.parts) {
        const stored = parts.find((candidate) => candidate.id === part.id)
        if (!stored || stored.time_created !== expected.info.time.created) return false
        const decoded = {
          ...stored.data,
          id: stored.id,
          sessionID: stored.session_id,
          messageID: stored.message_id,
        } as SessionV1.Part
        if (!isDeepStrictEqual(decoded, part)) return false
      }
    }
    const [history, frontier, members, partMembers, embeddedPartMembers, turns, inputs, operations] = yield* Effect.all([
      tx
        .select()
        .from(SessionAdministrativeHistoryTable)
        .where(eq(SessionAdministrativeHistoryTable.session_id, expectedSession.id))
        .get()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(SessionPresentationFrontierTable)
        .where(eq(SessionPresentationFrontierTable.session_id, expectedSession.id))
        .get()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(SessionAdministrativeHistoryMessageTable)
        .where(eq(SessionAdministrativeHistoryMessageTable.session_id, expectedSession.id))
        .orderBy(asc(SessionAdministrativeHistoryMessageTable.ordinal))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(SessionAdministrativeHistoryPartTable)
        .where(eq(SessionAdministrativeHistoryPartTable.session_id, expectedSession.id))
        .orderBy(
          asc(SessionAdministrativeHistoryPartTable.message_ordinal),
          asc(SessionAdministrativeHistoryPartTable.part_ordinal),
        )
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(SessionAdministrativeHistoryEmbeddedPartTable)
        .where(eq(SessionAdministrativeHistoryEmbeddedPartTable.session_id, expectedSession.id))
        .orderBy(
          asc(SessionAdministrativeHistoryEmbeddedPartTable.message_ordinal),
          asc(SessionAdministrativeHistoryEmbeddedPartTable.part_ordinal),
          asc(SessionAdministrativeHistoryEmbeddedPartTable.embedded_ordinal),
        )
        .all()
        .pipe(Effect.orDie),
      tx.select({ id: TurnTable.id }).from(TurnTable).where(eq(TurnTable.session_id, expectedSession.id)).all().pipe(Effect.orDie),
      tx.select({ id: TurnInputTable.id }).from(TurnInputTable).where(eq(TurnInputTable.session_id, expectedSession.id)).all().pipe(Effect.orDie),
      tx
        .select({ id: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.session_id, expectedSession.id))
        .all()
        .pipe(Effect.orDie),
    ])
    const expectedHeader = {
      kind: seal.kind,
      bundle_version: seal.bundleVersion,
      classifier_version: seal.classifierVersion,
      order_version: seal.orderVersion,
      source_file_fingerprint: seal.sourceFileFingerprint,
      message_count: seal.messages.length,
      part_count: seal.messages.reduce(
        (count, message) =>
          count + message.parts.reduce((partCount, part) => partCount + 1 + part.embeddedParts.length, 0),
        0,
      ),
      membership_fingerprint: seal.membershipFingerprint,
      order_fingerprint: seal.orderFingerprint,
      history_frontier_time: seal.historyFrontierTime,
      imported_revert_absent: true,
    }
    if (
      !history ||
      !Object.entries(expectedHeader).every(([key, value]) => history[key as keyof typeof history] === value) ||
      !frontier ||
      frontier.frontier_time !== seal.historyFrontierTime ||
      frontier.message_count !== messages.length ||
      turns.length > 0 ||
      inputs.length > 0 ||
      operations.length > 0
    ) {
      return false
    }
    if (
      members.length !== seal.messages.length ||
      partMembers.length !== seal.messages.reduce((count, message) => count + message.parts.length, 0) ||
      embeddedPartMembers.length !==
        seal.messages.reduce(
          (count, message) =>
            count + message.parts.reduce((partCount, part) => partCount + part.embeddedParts.length, 0),
          0,
        ) ||
      members.some((member, index) => {
        const expected = seal.messages[index]
        return (
          !expected ||
          member.message_id !== expected.messageID ||
          member.ordinal !== expected.ordinal ||
          member.time_created !== expected.timeCreated ||
          member.source_time_created !== null
        )
      })
    ) {
      return false
    }
    const expectedEmbeddedPartMembers = seal.messages.flatMap((message) =>
      message.parts.flatMap((part) =>
        part.embeddedParts.map((embedded) => ({
          sessionID: expectedSession.id,
          messageID: message.messageID,
          parentPartID: part.partID,
          partID: embedded.partID,
          messageOrdinal: message.ordinal,
          partOrdinal: part.ordinal,
          embeddedOrdinal: embedded.ordinal,
        })),
      ),
    )
    if (
      embeddedPartMembers.some((member, index) => {
        const expected = expectedEmbeddedPartMembers[index]
        return (
          !expected ||
          member.session_id !== expected.sessionID ||
          member.message_id !== expected.messageID ||
          member.parent_part_id !== expected.parentPartID ||
          member.part_id !== expected.partID ||
          member.message_ordinal !== expected.messageOrdinal ||
          member.part_ordinal !== expected.partOrdinal ||
          member.embedded_ordinal !== expected.embeddedOrdinal
        )
      })
    ) {
      return false
    }
    yield* SessionPresentation.assertAdministrativeHistoryIntegrity(tx, expectedSession.id)
    return true
  })
}

const Hex64 = Schema.String.check(Schema.isPattern(HEX_64))
const CopyProposalSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  sourceFileFingerprint: Hex64,
  sourceDatabaseID: LearnerHomeIdentity.ID,
  targetDatabaseID: LearnerHomeIdentity.ID,
  sourceSessionID: SessionID,
  targetSessionID: SessionID,
  turnID: Turn.ID,
  inputID: Turn.InputID,
  learnerMessageID: MessageID,
  historyStartTime: Schema.Number,
  historyFrontierTime: Schema.Number,
  learnerPresentationTime: Schema.Number,
  mappingVersion: Schema.Literal(1),
  messageMapping: Schema.Array(Schema.Struct({ source: MessageID, target: MessageID })),
  partMapping: Schema.Array(Schema.Struct({ source: PartID, target: PartID })),
  mappingFingerprint: Hex64,
  promptFingerprint: Hex64,
  requestFingerprint: Hex64,
}).annotate({
  identifier: "SessionImportHistory.CopyProposal",
  parseOptions: { onExcessProperty: "error" },
})
export type CopyProposal = typeof CopyProposalSchema.Type
const decodeCopyProposalValue = Schema.decodeUnknownEffect(CopyProposalSchema)

export const prepareCopyProposal = Effect.fn("SessionImportHistory.prepareCopyProposal")(function* (input: {
  decoded: Decoded
  prompt: string
}) {
  const { db } = yield* Database.Service
  const targetDatabaseID = yield* db.transaction(LearnerHomeIdentity.read).pipe(Effect.orDie)
  const messageMapping = input.decoded.bundle.messages.map((message) => ({
    source: MessageID.make(message.info.id),
    target: MessageID.ascending(),
  }))
  const partMapping = allPartIDs(input.decoded.bundle.messages).map((partID) => ({
    source: PartID.make(partID),
    target: PartID.ascending(),
  }))
  const historyStartTime = Math.max(1, Date.now())
  const messageCount = input.decoded.bundle.messages.length
  if (!Number.isSafeInteger(historyStartTime) || historyStartTime > MAX_TIME - messageCount) {
    return yield* new SessionPresentation.FrontierUnrepresentableError({ sessionID: input.decoded.bundle.info.id })
  }
  const historyFrontierTime = historyStartTime + (messageCount - 1)
  const learnerPresentationTime = historyStartTime + messageCount
  const basis = {
    schemaVersion: 1,
    sourceFileFingerprint: input.decoded.sourceFileFingerprint,
    sourceDatabaseID: input.decoded.bundle.sourceDatabaseID,
    targetDatabaseID,
    sourceSessionID: SessionID.make(input.decoded.bundle.info.id),
    targetSessionID: SessionID.descending(),
    turnID: Turn.ID.create(),
    inputID: Turn.InputID.create(),
    learnerMessageID: MessageID.ascending(),
    historyStartTime,
    historyFrontierTime,
    learnerPresentationTime,
    mappingVersion: 1,
    messageMapping,
    partMapping,
    mappingFingerprint: fingerprint({ messageMapping, partMapping }),
    promptFingerprint: fingerprintBytes(input.prompt),
  } as const
  return { ...basis, requestFingerprint: fingerprint(basis) } satisfies CopyProposal
})

export function encodeCopyProposal(proposal: CopyProposal) {
  return Buffer.from(stableStringify(proposal)).toString("base64url")
}

export const decodeCopyProposal = Effect.fn("SessionImportHistory.decodeCopyProposal")(function* (token: string) {
  const parsed = yield* Effect.try({
    try: () => JSON.parse(Buffer.from(token, "base64url").toString("utf8")),
    catch: () => new ConfirmationError({ reason: "invalid_copy_confirmation" }),
  })
  const proposal = yield* decodeCopyProposalValue(parsed).pipe(
    Effect.mapError(() => new ConfirmationError({ reason: "unsupported_copy_confirmation" })),
  )
  if (
    proposal.schemaVersion !== 1 ||
    proposal.mappingVersion !== 1 ||
    !safeTime(proposal.historyStartTime) ||
    !safeTime(proposal.historyFrontierTime) ||
    !safeTime(proposal.learnerPresentationTime) ||
    !HEX_64.test(proposal.sourceFileFingerprint) ||
    !HEX_64.test(proposal.mappingFingerprint) ||
    !HEX_64.test(proposal.promptFingerprint) ||
    !HEX_64.test(proposal.requestFingerprint)
  ) {
    return yield* new ConfirmationError({ reason: "unsupported_copy_confirmation" })
  }
  const { requestFingerprint, ...basis } = proposal
  if (
    requestFingerprint !== fingerprint(basis) ||
    proposal.mappingFingerprint !==
      fingerprint({ messageMapping: proposal.messageMapping, partMapping: proposal.partMapping })
  ) {
    return yield* new ConfirmationError({ reason: "copy_confirmation_fingerprint" })
  }
  return proposal
})

export const copy = Effect.fn("SessionImportHistory.copy")(function* (input: {
  decoded: Decoded
  proposal: CopyProposal
  prompt: string
  sourceStillMatches: Effect.Effect<boolean>
}) {
  const { db } = yield* Database.Service
  const prompt = yield* SessionPrompt.Service
  const targetDatabaseID = yield* db.transaction(LearnerHomeIdentity.read).pipe(Effect.orDie)
  const bindingError = verifyCopyBinding(input.decoded, input.proposal, input.prompt, targetDatabaseID)
  if (bindingError) return yield* bindingError
  const verifySource = input.sourceStillMatches.pipe(
    Effect.flatMap((matches) =>
      matches
        ? Effect.void
        : Effect.fail(
            new SourceChangedError({ expected: input.decoded.sourceFileFingerprint, actual: "changed" }),
          ),
    ),
  )
  yield* verifySource

  const replay = yield* db
    .transaction((tx) =>
      tx
        .select({ envelope: TurnTable.normalized_envelope })
        .from(TurnTable)
        .where(eq(TurnTable.id, input.proposal.turnID))
        .get()
        .pipe(Effect.orDie),
    )
    .pipe(Effect.catchTag("SqlError", Effect.die))
  const replayImport = replay?.envelope.importCopy as CopyEnvelope | undefined
  const { historyStartTime, historyFrontierTime, learnerPresentationTime } = input.proposal
  if (
    replayImport &&
    (replayImport.historyFrontierTime !== historyFrontierTime ||
      replayImport.learnerPresentationTime !== learnerPresentationTime)
  ) {
    return yield* new IdentityConflictError({ identityKind: "turn", identity: input.proposal.turnID })
  }

  const messages = remapMessages(input.decoded.bundle.messages, input.proposal, historyStartTime)
  const envelope = {
    schemaVersion: 1,
    sourceFileFingerprint: input.proposal.sourceFileFingerprint,
    sourceDatabaseID: input.proposal.sourceDatabaseID,
    sourceSessionID: input.proposal.sourceSessionID,
    targetDatabaseID: input.proposal.targetDatabaseID,
    targetSessionID: input.proposal.targetSessionID,
    copyRequestFingerprint: input.proposal.requestFingerprint,
    mappingVersion: 1,
    mappingFingerprint: input.proposal.mappingFingerprint,
    messageCount: messages.length,
    partCount: allPartIDs(messages).length,
    historyStartTime,
    historyFrontierTime,
    learnerPresentationTime,
  } satisfies CopyEnvelope

  const result = yield* prompt.startImportCopy({
    sessionID: input.proposal.targetSessionID,
    turnID: input.proposal.turnID,
    inputID: input.proposal.inputID,
    messageID: input.proposal.learnerMessageID,
    parts: [{ type: "text", text: input.prompt }],
    session: { title: `${input.decoded.bundle.info.title} (imported copy)` },
    importCopy: {
      plan: {
        sourceFileFingerprint: input.decoded.sourceFileFingerprint,
        historyFrontierTime,
        sourceMessageTimes: input.decoded.bundle.messages.map((message) => message.info.time.created),
        messages,
      },
      envelope,
      verifySource: input.sourceStillMatches,
      verifyTargetIdentities: (tx, learnerPresentation) =>
        Effect.gen(function* () {
          yield* SessionDeletion.assertSessionIDAvailable(tx, input.proposal.targetSessionID)
          yield* assertTargetIdentitiesAvailable(tx, {
            sessionID: input.proposal.targetSessionID,
            messageIDs: [
              ...messages.map((message) => message.info.id),
              learnerPresentation.info.id,
            ],
            partIDs: [
              ...allPartIDs(messages),
              ...learnerPresentation.parts.map((part) => part.id),
            ],
            turnIDs: [input.proposal.turnID],
            inputIDs: [input.proposal.inputID],
          })
        }).pipe(
          Effect.catchTag("SessionImportHistory.IdentityConflictError", () =>
            Effect.fail(new Turn.AdmissionConflictError({ turnID: input.proposal.turnID })),
          ),
        ),
    },
  }).pipe(
    Effect.catchTag("TurnIntegrityError", (error) =>
      Effect.fail(
        error.reason === "import_copy_source_changed"
          ? new SourceChangedError({ expected: input.decoded.sourceFileFingerprint, actual: "changed" })
          : error,
      ),
    ),
  )
  return { sessionID: input.proposal.targetSessionID, turn: result } as const
})

type CopyEnvelope = Readonly<{
  schemaVersion: 1
  sourceFileFingerprint: string
  sourceDatabaseID: string
  sourceSessionID: SessionID
  targetDatabaseID: string
  targetSessionID: SessionID
  copyRequestFingerprint: string
  mappingVersion: 1
  mappingFingerprint: string
  messageCount: number
  partCount: number
  historyStartTime: number
  historyFrontierTime: number
  learnerPresentationTime: number
}>

function verifyCopyBinding(
  decoded: Decoded,
  proposal: CopyProposal,
  prompt: string,
  targetDatabaseID: LearnerHomeIdentity.ID,
) {
  const messageCount = decoded.bundle.messages.length
  const { requestFingerprint, ...requestBasis } = proposal
  const hasRepresentableFrontier =
    safeTime(proposal.historyStartTime) &&
    messageCount > 0 &&
    proposal.historyStartTime <= MAX_TIME - messageCount
  if (
    requestFingerprint !== fingerprint(requestBasis) ||
    proposal.mappingFingerprint !==
      fingerprint({ messageMapping: proposal.messageMapping, partMapping: proposal.partMapping }) ||
    proposal.sourceFileFingerprint !== decoded.sourceFileFingerprint ||
    proposal.sourceDatabaseID !== decoded.bundle.sourceDatabaseID ||
    proposal.sourceSessionID !== decoded.bundle.info.id ||
    proposal.targetSessionID === proposal.sourceSessionID ||
    proposal.targetDatabaseID !== targetDatabaseID ||
    proposal.promptFingerprint !== fingerprintBytes(prompt) ||
    !hasRepresentableFrontier ||
    proposal.historyFrontierTime !== proposal.historyStartTime + (messageCount - 1) ||
    proposal.learnerPresentationTime !== proposal.historyStartTime + messageCount ||
    proposal.messageMapping.length !== decoded.bundle.messages.length ||
    proposal.partMapping.length !== allPartIDs(decoded.bundle.messages).length
  ) {
    return new ConfirmationError({ reason: "copy_confirmation_binding" })
  }
  const sourceMessages = decoded.bundle.messages.map((message) => message.info.id)
  const sourceParts = allPartIDs(decoded.bundle.messages)
  if (
    proposal.messageMapping.some((entry, index) => entry.source !== sourceMessages[index]) ||
    proposal.partMapping.some((entry, index) => entry.source !== sourceParts[index]) ||
    new Set(proposal.messageMapping.map((entry) => entry.target)).size !== proposal.messageMapping.length ||
    new Set(proposal.partMapping.map((entry) => entry.target)).size !== proposal.partMapping.length ||
    proposal.messageMapping.some((entry) => entry.target === proposal.learnerMessageID) ||
    proposal.messageMapping.some((entry) => sourceMessages.includes(entry.target)) ||
    proposal.partMapping.some((entry) => sourceParts.includes(entry.target))
  ) {
    return new ConfirmationError({ reason: "copy_confirmation_mapping" })
  }
}

function remapMessages(messages: readonly SessionV1.WithParts[], proposal: CopyProposal, startTime: number) {
  const messageMap = new Map(proposal.messageMapping.map((entry) => [entry.source, entry.target] as const))
  const partMap = new Map(proposal.partMapping.map((entry) => [entry.source, entry.target] as const))
  return messages.map((message, index) => {
    const messageID = mapped(messageMap, message.info.id, "message")
    const time = startTime + index
    const info: SessionV1.Info =
      message.info.role === "user"
        ? {
            ...structuredClone(message.info),
            id: messageID,
            sessionID: proposal.targetSessionID,
            time: { created: time },
          }
        : {
            ...structuredClone(message.info),
            id: messageID,
            sessionID: proposal.targetSessionID,
            parentID: mapped(messageMap, message.info.parentID, "assistant parent"),
            time: { created: time, completed: time },
          }
    const parts = message.parts.map((part) =>
      remapPart(part, {
        sessionID: proposal.targetSessionID,
        messageID,
        messageMap,
        partMap,
        time,
      }),
    )
    return { info, parts }
  })
}

function remapPart(
  part: SessionV1.Part,
  input: {
    sessionID: SessionID
    messageID: MessageID
    messageMap: ReadonlyMap<MessageID, MessageID>
    partMap: ReadonlyMap<PartID, PartID>
    time: number
  },
): SessionV1.Part {
  const base = {
    ...structuredClone(part),
    id: mapped(input.partMap, part.id, "part"),
    sessionID: input.sessionID,
    messageID: input.messageID,
  }
  if (base.type === "text" && base.time) base.time = { start: input.time, end: input.time }
  if (base.type === "reasoning") base.time = { start: input.time, end: input.time }
  if (base.type === "retry") base.time = { created: input.time }
  if (base.type === "compaction") {
    if (base.tail_start_id) base.tail_start_id = mapped(input.messageMap, base.tail_start_id, "compaction tail")
    if (base.capacity_history) {
      base.capacity_history.source_assistant_message_id = mapped(
        input.messageMap,
        base.capacity_history.source_assistant_message_id,
        "compaction capacity source",
      )
    }
  }
  if (base.type === "tool" && base.state.status === "completed") {
    base.state.time = {
      start: input.time,
      end: input.time,
      ...(base.state.time.compacted === undefined ? {} : { compacted: input.time }),
    }
    base.state.attachments = base.state.attachments?.map((attachment) => ({
      ...attachment,
      id: mapped(input.partMap, attachment.id, "nested attachment"),
      sessionID: input.sessionID,
      messageID: input.messageID,
    }))
  }
  if (base.type === "tool" && base.state.status === "error") {
    base.state.time = { start: input.time, end: input.time }
  }
  return base
}

function mapped<K extends string, V>(mapping: ReadonlyMap<K, V>, key: K, kind: string) {
  const value = mapping.get(key)
  if (value === undefined) throw new ConfirmationError({ reason: `missing_${kind.replaceAll(" ", "_")}_mapping` })
  return value
}

function allPartIDs(messages: readonly SessionV1.WithParts[]) {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => [
      part.id,
      ...(part.type === "tool" && part.state.status === "completed"
        ? (part.state.attachments ?? []).map((attachment) => attachment.id)
        : []),
    ]),
  )
}

function fingerprint(value: unknown) {
  return fingerprintBytes(stableStringify(value))
}

export function fingerprintBytes(value: string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
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
