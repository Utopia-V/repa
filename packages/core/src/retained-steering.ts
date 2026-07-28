export * as RetainedSteering from "./retained-steering"

import { and, asc, desc, eq, lt, lte, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { Turn } from "@opencode-ai/schema/turn"
import type { Database } from "./database/database"
import { LearningFrontier } from "./learning-frontier"
import { Occurrence } from "./learning-command/occurrence"
import type { OccurrenceID, SourceTemporalContext } from "./learning-command/occurrence-schema"
import {
  AdmittedLearnerOccurrenceTable,
  LearnerOccurrenceTombstoneTable,
} from "./learning-command/occurrence.sql"
import type { ReceiptID, SettlementMetadata } from "./learning-command/schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "./learning-command/sql"
import { MessageTable, PartTable } from "./session/sql"
import type { SessionSchema } from "./session/schema"
import {
  TurnInputTable,
  TurnModelOperationTable,
  TurnTable,
  TurnUnavailableModelTable,
} from "./turn/sql"
import type { MessageID, SessionV1 } from "./v1/session"
import {
  CutIntegrityError,
  InvalidCursorError,
  InvalidCommandError,
  MAX_ACTIVE_ITEMS,
  MAX_INSTRUCTION_BYTES,
  MAX_REASON_BYTES,
  MAX_RENDERED_CUT_BYTES,
  MAX_SOURCE_EXCERPT_BYTES,
  SCHEMA_VERSION,
  SCOPE,
  createPolicyID,
  createTransitionID,
  type Command,
  type Cut,
  type CutItem,
  type AppliedSettlement,
  type AlreadyAppliedSettlement,
  type NoChangeSettlement,
  type PolicyID,
  type PageOptions,
  type PreparedTransition,
  type SourceTemporalSnapshot,
  type Transition,
  type TransitionID,
  type TransitionRead,
} from "./retained-steering/schema"
import { RetainedSteeringCursor } from "./retained-steering/cursor"
import {
  RetainedSteeringCommandTable,
  RetainedSteeringCommitSealTable,
  RetainedSteeringPolicyTable,
  RetainedSteeringStateTable,
  RetainedSteeringTransitionTable,
} from "./retained-steering/sql"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const committedTransition = sql`EXISTS (
  SELECT 1
  FROM retained_steering_commit_seal AS retained_seal
  JOIN learning_command_receipt AS retained_receipt
    ON retained_receipt.id = retained_seal.receipt_id
  JOIN learning_command_invocation AS retained_invocation
    ON retained_invocation.part_id = retained_receipt.invocation_part_id
  JOIN retained_steering_command AS retained_command
    ON retained_command.invocation_part_id = retained_invocation.part_id
  WHERE retained_seal.transition_id = ${RetainedSteeringTransitionTable.id}
    AND retained_seal.invocation_part_id = retained_invocation.part_id
    AND retained_receipt.occurrence_id = ${RetainedSteeringTransitionTable.occurrence_id}
    AND retained_invocation.status = 'applied'
    AND retained_invocation.receipt_id = retained_receipt.id
    AND retained_command.semantic_fingerprint = ${RetainedSteeringTransitionTable.semantic_fingerprint}
    AND retained_invocation.authorization_basis = 'learner_request'
)`

const noCommittedSuccessor = sql`NOT EXISTS (
  SELECT 1
  FROM retained_steering_transition AS successor
  JOIN retained_steering_commit_seal AS successor_seal
    ON successor_seal.transition_id = successor.id
  JOIN learning_command_receipt AS successor_receipt
    ON successor_receipt.id = successor_seal.receipt_id
  JOIN learning_command_invocation AS successor_invocation
    ON successor_invocation.part_id = successor_receipt.invocation_part_id
  JOIN retained_steering_command AS successor_command
    ON successor_command.invocation_part_id = successor_invocation.part_id
  WHERE successor.predecessor_id = ${RetainedSteeringTransitionTable.id}
    AND successor_seal.invocation_part_id = successor_invocation.part_id
    AND successor_invocation.status = 'applied'
    AND successor_invocation.receipt_id = successor_receipt.id
    AND successor_command.semantic_fingerprint = successor.semantic_fingerprint
)`

export * from "./retained-steering/schema"

export type SemanticResolution =
  | Readonly<{ type: "candidate" }>
  | Readonly<{ type: "already_applied"; transition: Transition }>
  | Readonly<{ type: "semantic_conflict"; transition: Transition }>

export type Preparation =
  | Readonly<{ type: "candidate"; value: PreparedTransition }>
  | Readonly<{
      type: "no_change"
      policyID: PolicyID
      version: number
      state: "operative" | "retracted"
      acknowledgementTitle: string
      acknowledgementBody: string
    }>

export type CutRead =
  | Readonly<{ type: "available"; cut: Cut }>
  | Readonly<{
      type: "source_unavailable"
      assistantMessageID: MessageID
      turnID: string
      causalOccurrenceID?: OccurrenceID
    }>
  | Readonly<{ type: "not_found"; assistantMessageID: MessageID }>

export type ResultTransitionPresentation = Readonly<{
  state: "operative" | "retracted"
  status: "operative_active" | "operative_expired" | "retracted"
  version: number
  operativeInstruction?: string
  validUntilNormalized?: string
  boundaryTimeZone?: string
  boundaryUtcOffsetMinutes?: number
}>

export type ResultPresentation = Readonly<{
  action: "create" | "replace" | "retract"
  scope: typeof SCOPE
  effect: ResultTransitionPresentation
  previous?: ResultTransitionPresentation
  current: ResultTransitionPresentation
  relation: "active" | "superseded"
}>

export function commandFingerprint(command: Command) {
  return digest({ schemaVersion: SCHEMA_VERSION, scope: SCOPE, command })
}

export function resolveSemantic(
  tx: Transaction,
  input: { readonly occurrenceID: OccurrenceID; readonly fingerprint: string },
): Effect.Effect<SemanticResolution> {
  return Effect.gen(function* () {
    yield* requireState(tx)
    const row = yield* tx
      .select()
      .from(RetainedSteeringTransitionTable)
      .where(and(eq(RetainedSteeringTransitionTable.occurrence_id, input.occurrenceID), committedTransition))
      .get()
      .pipe(Effect.orDie)
    if (!row) return { type: "candidate" }
    return row.semantic_fingerprint === input.fingerprint
      ? { type: "already_applied", transition: transition(row) }
      : { type: "semantic_conflict", transition: transition(row) }
  })
}

export function prepareTransition(
  tx: Transaction,
  input: {
    readonly occurrenceID: OccurrenceID
    readonly command: Command
    readonly settlement: SettlementMetadata
  },
): Effect.Effect<Preparation, InvalidCommandError> {
  return Effect.gen(function* () {
    yield* requireState(tx)
    const occurrence = yield* requireEligibleOccurrence(tx, input.occurrenceID)
    yield* Occurrence.requireAvailableSource(tx, {
      occurrenceID: occurrence.id,
      sessionID: occurrence.origin_session_id,
      messageID: occurrence.origin_message_id,
    }).pipe(Effect.mapError(() => new InvalidCommandError({ reason: "source_unavailable" })))
    yield* validateText(input.command)
    const sourceText = yield* learnerText(tx, occurrence.origin_session_id, occurrence.origin_message_id)
    if (!sourceText.includes(input.command.sourceExcerpt)) return yield* invalid("validation_error")
    if (input.command.learnerReason && !sourceText.includes(input.command.learnerReason)) {
      return yield* invalid("validation_error")
    }

    const head = input.command.action === "create" ? undefined : yield* policyHead(tx, input.command.policyID)
    if (input.command.action !== "create") {
      if (
        !head ||
        head.id !== input.command.expectedHeadID ||
        head.version !== input.command.expectedVersion ||
        head.policy_id !== input.command.policyID
      ) {
        return yield* invalid("stale")
      }
    }

    const noChange = head ? exactNoChange(head, input.command) : undefined
    if (noChange) return noChange

    const context = sourceTemporalContext(occurrence)
    const boundary =
      input.command.action === "retract"
        ? undefined
        : yield* parseBoundary(context, input.command.validUntil).pipe(
            Effect.flatMap((value) =>
              value.instant > input.settlement.time && value.instant > occurrence.time_admitted
                ? Effect.succeed(value)
                : invalid("validation_error"),
            ),
          )
    const policyID = input.command.action === "create" ? createPolicyID() : input.command.policyID
    const acknowledgementResult = acknowledgement(input.command, policyID, boundary)
    const prepared = {
      command: input.command,
      occurrenceID: occurrence.id,
      sourceOrder: occurrence.source_order,
      semanticFingerprint: commandFingerprint(input.command),
      policyID,
      ...(head ? { predecessorID: head.id } : {}),
      previousState: head?.state ?? "absent",
      version: (head?.version ?? 0) + 1,
      ...(boundary
        ? {
            validUntil: boundary.instant,
            validUntilNormalized: boundary.normalized,
            boundaryUtcOffsetMinutes: boundary.utcOffsetMinutes,
            sourceTimeZone: context.state === "resolved" ? context.timeZone : undefined,
          }
        : {}),
      acknowledgementTitle: acknowledgementResult.title,
      acknowledgementBody: acknowledgementResult.body,
      settlement: input.settlement,
    } satisfies PreparedTransition
    yield* requireCapacity(tx, prepared)
    return { type: "candidate", value: prepared }
  })
}

export function applyTransition(
  tx: Transaction,
  prepared: PreparedTransition,
): Effect.Effect<Transition, InvalidCommandError> {
  return Effect.gen(function* () {
    const current = prepared.predecessorID ? yield* policyHead(tx, prepared.policyID) : undefined
    if (
      (prepared.predecessorID &&
        (!current || current.id !== prepared.predecessorID || current.version + 1 !== prepared.version)) ||
      (!prepared.predecessorID && current)
    ) {
      return yield* invalid("stale")
    }
    if (!prepared.predecessorID) {
      yield* tx
        .insert(RetainedSteeringPolicyTable)
        .values({ id: prepared.policyID, time_created: prepared.settlement.time })
        .run()
        .pipe(Effect.orDie)
    }
    const state = yield* requireState(tx)
    const revision = state.steeringRevision + 1
    const frontier = yield* LearningFrontier.advance(tx, { time: prepared.settlement.time })
    const id = createTransitionID()
    const operative = prepared.command.action !== "retract"
    yield* tx.run("PRAGMA defer_foreign_keys = ON").pipe(Effect.orDie)
    yield* tx
      .insert(RetainedSteeringTransitionTable)
      .values({
        id,
        commit_seal_id: id,
        policy_id: prepared.policyID,
        version: prepared.version,
        predecessor_id: prepared.predecessorID ?? null,
        previous_state: prepared.previousState,
        occurrence_id: prepared.occurrenceID,
        source_order: prepared.sourceOrder,
        state: operative ? "operative" : "retracted",
        scope: SCOPE,
        source_excerpt: prepared.command.sourceExcerpt,
        operative_instruction: operative ? prepared.command.operativeInstruction : null,
        learner_reason: prepared.command.learnerReason ?? null,
        effective_from: operative ? (yield* occurrenceTime(tx, prepared.occurrenceID)) : null,
        valid_until: prepared.validUntil ?? null,
        valid_until_source: operative ? prepared.command.validUntil : null,
        valid_until_normalized: prepared.validUntilNormalized ?? null,
        boundary_timezone: prepared.sourceTimeZone ?? null,
        boundary_utc_offset_minutes: prepared.boundaryUtcOffsetMinutes ?? null,
        semantic_fingerprint: prepared.semanticFingerprint,
        steering_revision: revision,
        time_committed: frontier.time,
        commit_order: prepared.settlement.order,
        frontier_sequence: frontier.sequence,
        frontier_time: frontier.time,
        acknowledgement_title: prepared.acknowledgementTitle,
        acknowledgement_body: prepared.acknowledgementBody,
      })
      .run()
      .pipe(Effect.orDie)
    const row = yield* tx
      .select()
      .from(RetainedSteeringTransitionTable)
      .where(eq(RetainedSteeringTransitionTable.id, id))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* Effect.die("Retained steering transition disappeared after insert")
    return transition(row)
  })
}

export function sealTransition(
  tx: Transaction,
  input: {
    readonly transitionID: TransitionID
    readonly receiptID: ReceiptID
    readonly invocationPartID: SessionV1.PartID
  },
) {
  return Effect.gen(function* () {
    const state = yield* tx
      .select()
      .from(RetainedSteeringStateTable)
      .where(eq(RetainedSteeringStateTable.singleton, 1))
      .get()
      .pipe(Effect.orDie)
    const transition = yield* tx
      .select({ revision: RetainedSteeringTransitionTable.steering_revision })
      .from(RetainedSteeringTransitionTable)
      .where(eq(RetainedSteeringTransitionTable.id, input.transitionID))
      .get()
      .pipe(Effect.orDie)
    if (!state || !transition || transition.revision !== state.steering_revision + 1) {
      return yield* Effect.die("Retained steering transition cannot be sealed out of revision order")
    }
    yield* tx
      .update(RetainedSteeringStateTable)
      .set({ steering_revision: transition.revision })
      .where(eq(RetainedSteeringStateTable.singleton, 1))
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(RetainedSteeringCommitSealTable)
      .values({
        transition_id: input.transitionID,
        receipt_id: input.receiptID,
        invocation_part_id: input.invocationPartID,
      })
      .run()
      .pipe(Effect.orDie)
  })
}

export function latestCutAsOf(tx: Transaction) {
  return requireState(tx).pipe(Effect.map((state) => state.latestCutAsOf))
}

export function prepareCut(
  tx: Transaction,
  input: { readonly turnID: Turn.ID; readonly assistantMessageID: MessageID; readonly trustedTime: number },
): Effect.Effect<Cut, CutIntegrityError> {
  return Effect.gen(function* () {
    const turn = yield* tx.select().from(TurnTable).where(eq(TurnTable.id, input.turnID)).get().pipe(Effect.orDie)
    if (!turn || turn.state !== "running") return yield* cutInvalid(input.assistantMessageID, "turn_not_running")
    const current = yield* tx
      .select()
      .from(TurnInputTable)
      .where(and(eq(TurnInputTable.turn_id, turn.id), eq(TurnInputTable.id, turn.current_input_id)))
      .get()
      .pipe(Effect.orDie)
    if (!current?.occurrence_id) return yield* cutInvalid(input.assistantMessageID, "learner_source_missing")
    const occurrence = yield* requireEligibleOccurrence(tx, current.occurrence_id).pipe(
      Effect.mapError(() => new CutIntegrityError({ assistantMessageID: input.assistantMessageID, reason: "source_ineligible" })),
    )
    const state = yield* requireState(tx)
    const frontier = yield* LearningFrontier.read(tx)
    const cutAsOf = Math.max(input.trustedTime, turn.causal_time, frontier.time, state.latestCutAsOf)
    const rows = yield* activeHeads(tx, cutAsOf)
    if (rows.length > MAX_ACTIVE_ITEMS) return yield* cutInvalid(input.assistantMessageID, "active_item_capacity")
    const items = rows.map(cutItem)
    const sourceTemporal = sourceTemporalSnapshot(occurrence)
    const base = {
      schemaVersion: SCHEMA_VERSION,
      assistantMessageID: input.assistantMessageID,
      cutAsOf,
      throughSteeringRevision: state.steeringRevision,
      throughSharedFrontier: frontier,
      sourceTemporalContext: sourceTemporal,
      items,
    }
    const fingerprint = cutFingerprint(base)
    const renderedBytes = bytes(renderCutValue({ ...base, renderedBytes: 0, fingerprint }))
    const cut = { ...base, renderedBytes, fingerprint } satisfies Cut
    if (renderedBytes > MAX_RENDERED_CUT_BYTES) return yield* cutInvalid(input.assistantMessageID, "render_capacity")
    return cut
  })
}

export function commitCut(tx: Transaction, cut: Cut): Effect.Effect<Cut, CutIntegrityError> {
  return Effect.gen(function* () {
    validateCut(cut)
    const operation = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, cut.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!operation || operation.causal_occurrence_id !== cut.sourceTemporalContext.occurrenceID) {
      return yield* cutInvalid(cut.assistantMessageID, "model_operation_mismatch")
    }
    if (
      operation.retained_steering_cut_fingerprint !== cut.fingerprint ||
      operation.retained_steering_cut_as_of !== cut.cutAsOf ||
      JSON.stringify(operation.retained_steering_cut) !== JSON.stringify(cut)
    ) {
      return yield* cutInvalid(cut.assistantMessageID, "stored_cut_mismatch")
    }
    const state = yield* requireState(tx)
    if (cut.cutAsOf !== state.latestCutAsOf || cut.throughSteeringRevision !== state.steeringRevision) {
      return yield* cutInvalid(cut.assistantMessageID, "cut_watermark_mismatch")
    }
    return cut
  })
}

export function readCut(tx: Transaction, assistantMessageID: MessageID): Effect.Effect<CutRead, CutIntegrityError> {
  return Effect.gen(function* () {
    const cut = yield* readAvailableCut(tx, assistantMessageID)
    if (cut) return { type: "available", cut }
    const unavailable = yield* tx
      .select()
      .from(TurnUnavailableModelTable)
      .where(eq(TurnUnavailableModelTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!unavailable) return { type: "not_found", assistantMessageID }
    return {
      type: "source_unavailable",
      assistantMessageID,
      turnID: unavailable.turn_id,
      ...(unavailable.causal_occurrence_id ? { causalOccurrenceID: unavailable.causal_occurrence_id } : {}),
    }
  })
}

export function renderCut(cut: Cut) {
  validateCut(cut)
  const rendered = renderCutValue(cut)
  if (bytes(rendered) !== cut.renderedBytes) {
    throw new CutIntegrityError({ assistantMessageID: cut.assistantMessageID, reason: "rendered_size_mismatch" })
  }
  return rendered
}

export function readHead(tx: Transaction, policyID: PolicyID) {
  return Effect.gen(function* () {
    yield* requireState(tx)
    const row = yield* policyHead(tx, policyID)
    return row ? transition(row) : undefined
  })
}

export function readActive(tx: Transaction, asOf: number) {
  return Effect.gen(function* () {
    yield* requireState(tx)
    return (yield* activeHeads(tx, asOf)).map(transition)
  })
}

export function readPolicy(tx: Transaction, input: { readonly policyID: PolicyID; readonly asOf: number }) {
  return Effect.gen(function* () {
    const state = yield* requireState(tx)
    const row = yield* policyHead(tx, input.policyID)
    return {
      policyID: input.policyID,
      asOf: input.asOf,
      steeringRevision: state.steeringRevision,
      ...(row ? { head: yield* transitionRead(tx, row, input.asOf) } : {}),
    }
  })
}

export function readActiveSnapshot(tx: Transaction, asOf: number) {
  return Effect.gen(function* () {
    const state = yield* requireState(tx)
    const rows = yield* activeHeads(tx, asOf)
    return {
      asOf,
      steeringRevision: state.steeringRevision,
      items: yield* Effect.forEach(rows, (row) => transitionRead(tx, row, asOf)),
    }
  })
}

export function readEffect(tx: Transaction, transitionID: TransitionID, asOf: number) {
  return Effect.gen(function* () {
    yield* requireState(tx)
    const row = yield* tx
      .select()
      .from(RetainedSteeringTransitionTable)
      .where(and(eq(RetainedSteeringTransitionTable.id, transitionID), committedTransition))
      .get()
      .pipe(Effect.orDie)
    return row ? yield* transitionRead(tx, row, asOf) : undefined
  })
}

export function readResultPresentation(
  tx: Transaction,
  settlement: AppliedSettlement | AlreadyAppliedSettlement | NoChangeSettlement,
): Effect.Effect<ResultPresentation> {
  return Effect.gen(function* () {
    const effect =
      settlement.outcome === "no_change"
        ? (yield* readPolicy(tx, { policyID: settlement.policyID, asOf: settlement.settlementTime })).head
        : yield* readEffect(tx, settlement.effectID, settlement.settlementTime)
    if (!effect) {
      return yield* Effect.die(`Retained steering result lost policy ${settlement.policyID}`)
    }
    if (
      effect.transition.policyID !== settlement.policyID ||
      effect.transition.version !== settlement.version ||
      effect.transition.state !== settlement.state ||
      (settlement.outcome !== "no_change" && effect.receiptID !== settlement.receiptID)
    ) {
      return yield* Effect.die(`Retained steering result diverged from committed effect ${effect.effectID}`)
    }
    const current = (yield* readPolicy(tx, {
      policyID: effect.transition.policyID,
      asOf: settlement.settlementTime,
    })).head
    if (!current) {
      return yield* Effect.die(`Retained steering policy ${effect.transition.policyID} lost its current head`)
    }
    const previous = effect.transition.predecessorID
      ? yield* readEffect(tx, effect.transition.predecessorID, settlement.settlementTime)
      : undefined
    if (effect.transition.predecessorID && !previous) {
      return yield* Effect.die(`Retained steering effect ${effect.effectID} lost its predecessor`)
    }
    return {
      action:
        settlement.outcome === "no_change"
          ? effect.transition.state === "retracted"
            ? "retract"
            : "replace"
          : effect.transition.state === "retracted"
            ? "retract"
            : effect.transition.predecessorID
              ? "replace"
              : "create",
      scope: effect.transition.scope,
      effect: resultTransitionPresentation(effect),
      ...(previous ? { previous: resultTransitionPresentation(previous) } : {}),
      current: resultTransitionPresentation(current),
      relation: current.effectID === effect.effectID ? "active" : "superseded",
    }
  })
}

export function readHistory(tx: Transaction, policyID: PolicyID, asOf: number, input?: PageOptions) {
  return Effect.gen(function* () {
    const cursor = yield* RetainedSteeringCursor.options(input, policyID)
    const state = yield* requireState(tx)
    const throughSteeringRevision = cursor.throughSteeringRevision ?? state.steeringRevision
    if (throughSteeringRevision > state.steeringRevision) {
      return yield* new InvalidCursorError({ detail: "Cursor names a future retained steering revision" })
    }
    const rows = yield* tx
      .select()
      .from(RetainedSteeringTransitionTable)
      .where(
        and(
          eq(RetainedSteeringTransitionTable.policy_id, policyID),
          lte(RetainedSteeringTransitionTable.steering_revision, throughSteeringRevision),
          committedTransition,
          ...(cursor.beforeVersion === undefined
            ? []
            : [lt(RetainedSteeringTransitionTable.version, cursor.beforeVersion)]),
        ),
      )
      .orderBy(desc(RetainedSteeringTransitionTable.version), desc(RetainedSteeringTransitionTable.id))
      .limit(cursor.limit + 1)
      .all()
      .pipe(Effect.orDie)
    const page = rows.slice(0, cursor.limit)
    const last = page.at(-1)
    return {
      policyID,
      throughSteeringRevision,
      items: yield* Effect.forEach(page, (row) => transitionRead(tx, row, asOf)),
      ...(rows.length > cursor.limit && last
        ? { cursor: RetainedSteeringCursor.next(policyID, throughSteeringRevision, last.version) }
        : {}),
    }
  })
}

function requireEligibleOccurrence(tx: Transaction, occurrenceID: OccurrenceID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (!row?.source_order || !row.source_temporal_state) return yield* invalid("validation_error")
    return row as typeof row & { source_order: number; source_temporal_state: "resolved" | "unavailable" }
  })
}

function sourceTemporalContext(row: typeof AdmittedLearnerOccurrenceTable.$inferSelect): SourceTemporalContext {
  if (row.source_temporal_state === "resolved" && row.source_timezone && row.source_utc_offset_minutes !== null) {
    return {
      state: "resolved",
      instant: row.time_admitted,
      timeZone: row.source_timezone,
      utcOffsetMinutes: row.source_utc_offset_minutes,
    }
  }
  if (row.source_temporal_state === "unavailable" && row.source_temporal_unavailable_reason) {
    return {
      state: "unavailable",
      instant: row.time_admitted,
      reason: row.source_temporal_unavailable_reason,
    }
  }
  throw new Error(`Learner occurrence ${row.id} has a malformed source temporal context`)
}

function sourceTemporalSnapshot(
  row: typeof AdmittedLearnerOccurrenceTable.$inferSelect & { source_order: number },
): SourceTemporalSnapshot {
  const context = sourceTemporalContext(row)
  return context.state === "resolved"
    ? { ...context, occurrenceID: row.id, sourceOrder: row.source_order }
    : { ...context, occurrenceID: row.id, sourceOrder: row.source_order }
}

function validateText(command: Command) {
  if (
    command.sourceExcerpt.trim().length === 0 ||
    bytes(command.sourceExcerpt) > MAX_SOURCE_EXCERPT_BYTES ||
    (command.learnerReason !== undefined &&
      (command.learnerReason.trim().length === 0 || bytes(command.learnerReason) > MAX_REASON_BYTES))
  ) {
    return invalid("validation_error")
  }
  if (
    command.action !== "retract" &&
    (command.operativeInstruction.trim().length === 0 || bytes(command.operativeInstruction) > MAX_INSTRUCTION_BYTES)
  ) {
    return invalid("validation_error")
  }
  if (command.action !== "create" && (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1)) {
    return invalid("validation_error")
  }
  return Effect.void
}

function learnerText(tx: Transaction, sessionID: SessionSchema.ID, messageID: MessageID) {
  return Effect.gen(function* () {
    const message = yield* tx
      .select({ id: MessageTable.id })
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, sessionID), eq(MessageTable.id, messageID)))
      .get()
      .pipe(Effect.orDie)
    if (!message) return yield* invalid("source_unavailable")
    const parts = yield* tx
      .select({ data: PartTable.data })
      .from(PartTable)
      .where(and(eq(PartTable.session_id, sessionID), eq(PartTable.message_id, messageID)))
      .orderBy(asc(PartTable.time_created), asc(PartTable.id))
      .all()
      .pipe(Effect.orDie)
    return parts
      .flatMap((part) => {
        if (part.data.type !== "text") return []
        const text = part.data as Omit<SessionV1.TextPart, "id" | "sessionID" | "messageID">
        return text.synthetic === true ? [] : [text.text]
      })
      .join("\n")
  })
}

function policyHead(tx: Transaction, policyID: PolicyID) {
  return tx
    .select()
    .from(RetainedSteeringTransitionTable)
    .where(
      and(
        eq(RetainedSteeringTransitionTable.policy_id, policyID),
        committedTransition,
        noCommittedSuccessor,
      ),
    )
    .limit(2)
    .all()
    .pipe(
      Effect.orDie,
      Effect.flatMap((rows) =>
        rows.length <= 1 ? Effect.succeed(rows[0]) : Effect.die(`Retained steering policy ${policyID} has branches`),
      ),
    )
}

function exactNoChange(row: typeof RetainedSteeringTransitionTable.$inferSelect, command: Command): Preparation | undefined {
  if (command.action === "retract" && row.state === "retracted") {
    return {
      type: "no_change",
      policyID: row.policy_id,
      version: row.version,
      state: row.state,
      acknowledgementTitle: "Learning steering already removed",
      acknowledgementBody: `No retained learning-wide instruction is active for policy ${row.policy_id}.`,
    }
  }
  if (
    command.action === "replace" &&
    row.state === "operative" &&
    row.operative_instruction === command.operativeInstruction &&
    row.learner_reason === (command.learnerReason ?? null) &&
    row.valid_until_source === command.validUntil
  ) {
    return {
      type: "no_change",
      policyID: row.policy_id,
      version: row.version,
      state: row.state,
      acknowledgementTitle: "Learning steering already retained",
      acknowledgementBody: row.acknowledgement_body,
    }
  }
  return undefined
}

function parseBoundary(context: SourceTemporalContext, input: string) {
  return Effect.gen(function* () {
    if (context.state === "unavailable") return yield* invalid("temporal_context_unavailable")
    const value = input.trim()
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    )
    if (!match) return yield* invalid("validation_error")
    const instant = Date.parse(value)
    if (!Number.isSafeInteger(instant) || instant < 0) return yield* invalid("validation_error")
    const utcOffsetMinutes = parseOffset(match[8]!)
    const actualOffset = offsetAt(context.timeZone, instant)
    const local = localParts(context.timeZone, instant)
    const expected = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6]),
      millisecond: Number((match[7] ?? "0").padEnd(3, "0")),
    }
    if (actualOffset !== utcOffsetMinutes || !local || JSON.stringify(local) !== JSON.stringify(expected)) {
      return yield* invalid("validation_error")
    }
    return {
      instant,
      utcOffsetMinutes,
      timeZone: context.timeZone,
      normalized: normalizedBoundary(expected, utcOffsetMinutes),
    }
  })
}

function parseOffset(value: string) {
  if (value === "Z") return 0
  const sign = value[0] === "-" ? -1 : 1
  return sign * (Number(value.slice(1, 3)) * 60 + Number(value.slice(4, 6)))
}

function offsetAt(timeZone: string, instant: number) {
  try {
    const value = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date(instant))
      .find((part) => part.type === "timeZoneName")?.value
    const match = /^(?:GMT|UTC)([+-])(\d{2}):(\d{2})$/.exec(value ?? "")
    if (!match) return value === "GMT" || value === "UTC" ? 0 : undefined
    const result = Number(match[2]) * 60 + Number(match[3])
    return match[1] === "-" ? -result : result
  } catch {
    return undefined
  }
}

function localParts(timeZone: string, instant: number) {
  try {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
        hourCycle: "h23",
      })
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    )
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
      second: Number(values.second),
      millisecond: Number(values.fractionalSecond),
    }
  } catch {
    return undefined
  }
}

function acknowledgement(
  command: Command,
  policyID: PolicyID,
  boundary:
    | {
        readonly instant: number
        readonly timeZone: string
        readonly normalized: string
      }
    | undefined,
) {
  if (command.action === "retract") {
    return {
      title: "Removed retained learning steering",
      body: `Stopped applying the learning-wide retained instruction for policy ${policyID}. A later explicit learner direction can reinstate or replace it.`,
    }
  }
  return {
    title: "Retained learning steering",
    body: `Learning-wide until ${boundary!.normalized} [${boundary!.timeZone}]: ${command.operativeInstruction} You can replace or retract this retained instruction with a later explicit learner direction.`,
  }
}

function normalizedBoundary(
  value: {
    readonly year: number
    readonly month: number
    readonly day: number
    readonly hour: number
    readonly minute: number
    readonly second: number
    readonly millisecond: number
  },
  utcOffsetMinutes: number,
) {
  const pad = (input: number, width = 2) => input.toString().padStart(width, "0")
  const sign = utcOffsetMinutes < 0 ? "-" : "+"
  const offset = Math.abs(utcOffsetMinutes)
  return `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}.${pad(value.millisecond, 3)}${sign}${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`
}

function requireCapacity(tx: Transaction, prepared: PreparedTransition) {
  return Effect.gen(function* () {
    if (prepared.command.action === "retract") return
    const current = (yield* activeHeads(tx, prepared.settlement.time))
      .filter((row) => row.policy_id !== prepared.policyID)
      .map(cutItem)
    const items = [
      ...current,
      {
        ordinal: current.length,
        policyID: prepared.policyID,
        transitionID: "rst_00000000000000000000000000" as TransitionID,
        version: prepared.version,
        sourceOrder: prepared.sourceOrder,
        sourceExcerpt: prepared.command.sourceExcerpt,
        operativeInstruction: prepared.command.operativeInstruction,
        ...(prepared.command.learnerReason ? { learnerReason: prepared.command.learnerReason } : {}),
        effectiveFrom: yield* occurrenceTime(tx, prepared.occurrenceID),
        validUntil: prepared.validUntil!,
        steeringRevision: Number.MAX_SAFE_INTEGER,
      },
    ].sort((left, right) => left.sourceOrder - right.sourceOrder)
    if (items.length > MAX_ACTIVE_ITEMS || bytes(JSON.stringify(items)) + 2_048 > MAX_RENDERED_CUT_BYTES) {
      return yield* invalid("capacity_exceeded")
    }
  })
}

function activeHeads(tx: Transaction, asOf: number) {
  return tx
    .select()
    .from(RetainedSteeringTransitionTable)
    .where(
      and(
        eq(RetainedSteeringTransitionTable.state, "operative"),
        lte(RetainedSteeringTransitionTable.effective_from, asOf),
        sql`${RetainedSteeringTransitionTable.valid_until} > ${asOf}`,
        committedTransition,
        noCommittedSuccessor,
      ),
    )
    .orderBy(asc(RetainedSteeringTransitionTable.source_order), asc(RetainedSteeringTransitionTable.id))
    .all()
    .pipe(Effect.orDie)
}

function occurrenceTime(tx: Transaction, occurrenceID: OccurrenceID) {
  return tx
    .select({ time: AdmittedLearnerOccurrenceTable.time_admitted })
    .from(AdmittedLearnerOccurrenceTable)
    .where(eq(AdmittedLearnerOccurrenceTable.id, occurrenceID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.flatMap((row) => (row ? Effect.succeed(row.time) : Effect.die("Retained steering source disappeared"))),
    )
}

function requireState(tx: Transaction) {
  return Effect.gen(function* () {
    const existing = yield* tx
      .select()
      .from(RetainedSteeringStateTable)
      .where(eq(RetainedSteeringStateTable.singleton, 1))
      .get()
      .pipe(Effect.orDie)
    const row =
      existing ??
      (yield* tx
        .insert(RetainedSteeringStateTable)
        .values({ singleton: 1, steering_revision: 0, latest_cut_as_of: 0 })
        .returning()
        .get()
        .pipe(Effect.orDie))
    if (!row) return yield* Effect.die("Retained steering state was not initialized")
    const revision = yield* tx
      .select({ value: sql<number>`coalesce(max(${RetainedSteeringTransitionTable.steering_revision}), 0)` })
      .from(RetainedSteeringTransitionTable)
      .get()
      .pipe(Effect.orDie)
    const dangling = yield* tx
      .select({ id: RetainedSteeringTransitionTable.id })
      .from(RetainedSteeringTransitionTable)
      .where(sql`NOT (${committedTransition})`)
      .get()
      .pipe(Effect.orDie)
    if ((revision?.value ?? 0) !== row.steering_revision) {
      return yield* Effect.die("Retained steering revision disagrees with transition history")
    }
    if (dangling) return yield* Effect.die(`Retained steering transition ${dangling.id} has no committed effect`)
    return { steeringRevision: row.steering_revision, latestCutAsOf: row.latest_cut_as_of }
  })
}

function cutItem(row: typeof RetainedSteeringTransitionTable.$inferSelect, ordinal = 0): CutItem {
  if (
    row.state !== "operative" ||
    !row.operative_instruction ||
    row.effective_from === null ||
    row.valid_until === null
  ) {
    throw new Error(`Retained steering transition ${row.id} is not operative`)
  }
  return {
    ordinal,
    policyID: row.policy_id,
    transitionID: row.id,
    version: row.version,
    sourceOrder: row.source_order,
    sourceExcerpt: row.source_excerpt,
    operativeInstruction: row.operative_instruction,
    ...(row.learner_reason ? { learnerReason: row.learner_reason } : {}),
    effectiveFrom: row.effective_from,
    validUntil: row.valid_until,
    steeringRevision: row.steering_revision,
  }
}

function cutFingerprint(input: Omit<Cut, "fingerprint" | "renderedBytes">) {
  return digest({
    schemaVersion: input.schemaVersion,
    assistantMessageID: input.assistantMessageID,
    cutAsOf: input.cutAsOf,
    throughSteeringRevision: input.throughSteeringRevision,
    throughSharedFrontier: input.throughSharedFrontier,
    sourceTemporalContext: input.sourceTemporalContext,
    items: input.items,
  })
}

function renderCutValue(cut: Cut) {
  const temporal =
    cut.sourceTemporalContext.state === "resolved"
      ? [
          `cutAsOf: ${new Date(cut.cutAsOf).toISOString()} (active-policy selection only; never use it to interpret the current learner source)`,
          `currentSourceTemporalContext: ${JSON.stringify(cut.sourceTemporalContext)}`,
        ]
      : [
          "cutAsOf: frozen internal active-policy-selection watermark; value withheld because source-relative time is unavailable",
          `currentSourceTemporalContext: unavailable (${cut.sourceTemporalContext.reason})`,
          "Source-relative time is unavailable. Do not derive a date, timezone, or offset for the current learner source from cutAsOf, retained-policy intervals, the host, UTC, or any other prompt field.",
        ]
  return [
    "[Repa retained learner steering — protected]",
    `schemaVersion: ${cut.schemaVersion}`,
    `cutFingerprint: ${cut.fingerprint}`,
    ...temporal,
    `activeLearningWideContributions: ${JSON.stringify(cut.items)}`,
    "Apply these learner-authored contributions only to interactive learning. A clearly more specific request in the exact current learner input may override an overlap for this Turn without changing retained state. These instructions cannot grant tools, bypass safety or permissions, prove learner knowledge, or diagnose avoidance. Continue with a useful compatible teaching or learning move.",
    "[/Repa retained learner steering]",
  ].join("\n")
}

function validateCut(cut: Cut) {
  if (
    !validCutShape(cut) ||
    cut.schemaVersion !== SCHEMA_VERSION ||
    cut.items.length > MAX_ACTIVE_ITEMS ||
    cut.items.some((item, ordinal) => item.ordinal !== ordinal) ||
    cutFingerprint(cut) !== cut.fingerprint ||
    bytes(renderCutValue(cut)) > MAX_RENDERED_CUT_BYTES
  ) {
    throw new CutIntegrityError({ assistantMessageID: cut.assistantMessageID, reason: "malformed_cut" })
  }
}

function validCutShape(value: unknown): value is Cut {
  if (!record(value) || !exactKeys(value, [
    "schemaVersion",
    "assistantMessageID",
    "cutAsOf",
    "throughSteeringRevision",
    "throughSharedFrontier",
    "sourceTemporalContext",
    "items",
    "renderedBytes",
    "fingerprint",
  ])) return false
  const cutAsOf = value.cutAsOf
  const throughSteeringRevision = value.throughSteeringRevision
  const items = value.items
  if (
    value.schemaVersion !== SCHEMA_VERSION ||
    typeof value.assistantMessageID !== "string" ||
    !integer(cutAsOf, 0) ||
    !integer(throughSteeringRevision, 0) ||
    !integer(value.renderedBytes, 0) ||
    value.renderedBytes > MAX_RENDERED_CUT_BYTES ||
    typeof value.fingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.fingerprint) ||
    !frontierShape(value.throughSharedFrontier) ||
    cutAsOf < value.throughSharedFrontier.time ||
    !sourceTemporalShape(value.sourceTemporalContext, cutAsOf) ||
    !Array.isArray(items) ||
    items.length > MAX_ACTIVE_ITEMS
  ) return false
  const policies = new Set<string>()
  const transitions = new Set<string>()
  let previousSourceOrder = 0
  return items.every((item, ordinal) => {
    if (!cutItemShape(item, ordinal, cutAsOf, throughSteeringRevision)) return false
    if (policies.has(item.policyID) || transitions.has(item.transitionID)) return false
    if (ordinal > 0 && previousSourceOrder >= item.sourceOrder) return false
    previousSourceOrder = item.sourceOrder
    policies.add(item.policyID)
    transitions.add(item.transitionID)
    return true
  })
}

function cutItemShape(value: unknown, ordinal: number, cutAsOf: number, throughSteeringRevision: number): value is CutItem {
  if (!record(value)) return false
  const learnerReason = Object.prototype.hasOwnProperty.call(value, "learnerReason")
  if (!exactKeys(value, [
    "ordinal",
    "policyID",
    "transitionID",
    "version",
    "sourceOrder",
    "sourceExcerpt",
    "operativeInstruction",
    ...(learnerReason ? ["learnerReason"] : []),
    "effectiveFrom",
    "validUntil",
    "steeringRevision",
  ])) return false
  return (
    value.ordinal === ordinal &&
    typeof value.policyID === "string" && /^rsp_[0-9A-Za-z]{26}$/.test(value.policyID) &&
    typeof value.transitionID === "string" && /^rst_[0-9A-Za-z]{26}$/.test(value.transitionID) &&
    integer(value.version, 1) &&
    integer(value.sourceOrder, 1) &&
    nonemptyBounded(value.sourceExcerpt, MAX_SOURCE_EXCERPT_BYTES) &&
    nonemptyBounded(value.operativeInstruction, MAX_INSTRUCTION_BYTES) &&
    (!learnerReason || nonemptyBounded(value.learnerReason, MAX_REASON_BYTES)) &&
    integer(value.effectiveFrom, 0) &&
    integer(value.validUntil, 0) &&
    value.effectiveFrom <= cutAsOf &&
    value.validUntil > cutAsOf &&
    integer(value.steeringRevision, 1) &&
    value.steeringRevision <= throughSteeringRevision
  )
}

function sourceTemporalShape(value: unknown, cutAsOf: number): value is SourceTemporalSnapshot {
  if (!record(value)) return false
  const common =
    typeof value.occurrenceID === "string" &&
    integer(value.instant, 0) &&
    value.instant <= cutAsOf &&
    integer(value.sourceOrder, 1)
  if (!common) return false
  if (value.state === "resolved") {
    return (
      exactKeys(value, ["state", "occurrenceID", "instant", "timeZone", "utcOffsetMinutes", "sourceOrder"]) &&
      typeof value.timeZone === "string" &&
      value.timeZone.length > 0 &&
      integer(value.utcOffsetMinutes, -840) &&
      value.utcOffsetMinutes <= 840
    )
  }
  return (
    value.state === "unavailable" &&
    exactKeys(value, ["state", "occurrenceID", "instant", "reason", "sourceOrder"]) &&
    value.reason === "timezone_unavailable"
  )
}

function frontierShape(value: unknown): value is { readonly sequence: number; readonly time: number } {
  return record(value) && exactKeys(value, ["sequence", "time"]) && integer(value.sequence, 0) && integer(value.time, 0)
}

function nonemptyBounded(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && bytes(value) <= limit
}

function integer(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index])
}

function readAvailableCut(tx: Transaction, assistantMessageID: MessageID): Effect.Effect<Cut | undefined, CutIntegrityError> {
  return Effect.gen(function* () {
    const operation = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!operation?.retained_steering_cut) return undefined
    const cut = operation.retained_steering_cut
    try {
      validateCut(cut)
      if (
        cut.assistantMessageID !== assistantMessageID ||
        cut.sourceTemporalContext.occurrenceID !== operation.causal_occurrence_id ||
        cut.fingerprint !== operation.retained_steering_cut_fingerprint ||
        cut.cutAsOf !== operation.retained_steering_cut_as_of ||
        cut.cutAsOf !== operation.time_admitted ||
        bytes(renderCutValue(cut)) !== cut.renderedBytes
      ) {
        throw new Error("operation binding")
      }
    } catch {
      return yield* cutInvalid(assistantMessageID, "stored_cut_malformed")
    }
    return cut
  })
}

function transitionRead(
  tx: Transaction,
  row: typeof RetainedSteeringTransitionTable.$inferSelect,
  asOf: number,
): Effect.Effect<TransitionRead> {
  return Effect.gen(function* () {
    const [source, tombstone, receipt] = yield* Effect.all([
      tx
        .select()
        .from(AdmittedLearnerOccurrenceTable)
        .where(eq(AdmittedLearnerOccurrenceTable.id, row.occurrence_id))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ timeDeleted: LearnerOccurrenceTombstoneTable.time_deleted })
        .from(LearnerOccurrenceTombstoneTable)
        .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, row.occurrence_id))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({
          id: LearningCommandReceiptTable.id,
          occurrenceID: LearningCommandReceiptTable.occurrence_id,
          effectID: RetainedSteeringCommitSealTable.transition_id,
        })
        .from(RetainedSteeringCommitSealTable)
        .innerJoin(
          LearningCommandReceiptTable,
          eq(LearningCommandReceiptTable.id, RetainedSteeringCommitSealTable.receipt_id),
        )
        .innerJoin(
          LearningCommandInvocationTable,
          eq(LearningCommandInvocationTable.part_id, RetainedSteeringCommitSealTable.invocation_part_id),
        )
        .innerJoin(
          RetainedSteeringCommandTable,
          eq(RetainedSteeringCommandTable.invocation_part_id, RetainedSteeringCommitSealTable.invocation_part_id),
        )
        .where(
          and(
            eq(RetainedSteeringCommitSealTable.transition_id, row.id),
            eq(LearningCommandInvocationTable.status, "applied"),
            eq(LearningCommandInvocationTable.receipt_id, LearningCommandReceiptTable.id),
            eq(RetainedSteeringCommandTable.semantic_fingerprint, row.semantic_fingerprint),
          ),
        )
        .get()
        .pipe(Effect.orDie),
    ])
    if (!source || !source.source_order) {
      return yield* Effect.die(`Retained steering transition ${row.id} lost its learner source`)
    }
    if (!receipt || receipt.effectID !== row.id || receipt.occurrenceID !== row.occurrence_id) {
      return yield* Effect.die(`Retained steering transition ${row.id} lost its immutable receipt`)
    }
    const status =
      row.state === "retracted"
        ? "retracted"
        : row.valid_until !== null && row.valid_until <= asOf
          ? "operative_expired"
          : "operative_active"
    return {
      effectID: row.id,
      receiptID: receipt.id,
      status,
      transition: transition(row),
      source: {
        occurrenceID: source.id,
        sourceOrder: source.source_order,
        originSessionID: source.origin_session_id,
        originMessageID: source.origin_message_id,
        temporalContext: sourceTemporalContext(source),
        availability: tombstone
          ? { state: "source_unavailable", timeDeleted: tombstone.timeDeleted }
          : { state: "available" },
      },
    }
  })
}

function transition(row: typeof RetainedSteeringTransitionTable.$inferSelect): Transition {
  return {
    id: row.id,
    policyID: row.policy_id,
    version: row.version,
    ...(row.predecessor_id ? { predecessorID: row.predecessor_id } : {}),
    occurrenceID: row.occurrence_id,
    sourceOrder: row.source_order,
    state: row.state,
    scope: row.scope,
    sourceExcerpt: row.source_excerpt,
    ...(row.operative_instruction ? { operativeInstruction: row.operative_instruction } : {}),
    ...(row.learner_reason ? { learnerReason: row.learner_reason } : {}),
    ...(row.effective_from === null ? {} : { effectiveFrom: row.effective_from }),
    ...(row.valid_until === null ? {} : { validUntil: row.valid_until }),
    ...(row.valid_until_source ? { validUntilSource: row.valid_until_source } : {}),
    ...(row.valid_until_normalized ? { validUntilNormalized: row.valid_until_normalized } : {}),
    ...(row.boundary_timezone ? { boundaryTimeZone: row.boundary_timezone } : {}),
    ...(row.boundary_utc_offset_minutes === null
      ? {}
      : { boundaryUtcOffsetMinutes: row.boundary_utc_offset_minutes }),
    steeringRevision: row.steering_revision,
    timeCommitted: row.time_committed,
    commitOrder: row.commit_order,
    frontierSequence: row.frontier_sequence,
    acknowledgementTitle: row.acknowledgement_title,
    acknowledgementBody: row.acknowledgement_body,
  }
}

function resultTransitionPresentation(read: TransitionRead): ResultTransitionPresentation {
  return {
    state: read.transition.state,
    status: read.status,
    version: read.transition.version,
    ...(read.transition.operativeInstruction
      ? { operativeInstruction: read.transition.operativeInstruction }
      : {}),
    ...(read.transition.validUntilNormalized
      ? { validUntilNormalized: read.transition.validUntilNormalized }
      : {}),
    ...(read.transition.boundaryTimeZone ? { boundaryTimeZone: read.transition.boundaryTimeZone } : {}),
    ...(read.transition.boundaryUtcOffsetMinutes === undefined
      ? {}
      : { boundaryUtcOffsetMinutes: read.transition.boundaryUtcOffsetMinutes }),
  }
}

function bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function digest(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}

function invalid(reason: InvalidCommandError["reason"]) {
  return Effect.fail(new InvalidCommandError({ reason }))
}

function cutInvalid(assistantMessageID: MessageID, reason: string) {
  return Effect.fail(new CutIntegrityError({ assistantMessageID, reason }))
}
