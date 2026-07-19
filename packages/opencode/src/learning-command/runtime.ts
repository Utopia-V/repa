import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { PartTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { eq } from "drizzle-orm"
import { Context, Deferred, Effect, Exit, Layer, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import { command, normalize, type AcceptCourseViewRevisionInput } from "./input"
import { LearningCommandPermission } from "./permission"

export type Registration = Readonly<{
  turnID: Turn.ID
  inputID: Turn.InputID
  causalOccurrenceID?: LearningCommand.OccurrenceID
  partID: SessionV1.ToolPart["id"]
  callID: string
  emissionOrdinal: number
  sessionID: SessionV1.ToolPart["sessionID"]
  parentUserMessageID: SessionV1.Assistant["parentID"]
  assistantMessageID: SessionV1.Assistant["id"]
}>

export type ExecuteContext = Readonly<{
  sessionID: SessionV1.ToolPart["sessionID"]
  messageID: SessionV1.Assistant["id"]
  callID?: string
  abort: AbortSignal
  extra?: Record<string, unknown>
}>

export type ExactResult = Readonly<{
  title: string
  metadata: Record<string, unknown>
  output: string
}>

type Prepared = Readonly<{
  canonical: AcceptCourseViewRevisionInput
  invocation: LearningCommand.AcceptCourseViewRevisionInvocation
  settlement?: LearningCommand.Settlement
}>

type TerminalPartEnvelope = Pick<
  LearningCommand.InvocationEnvelope,
  "partID" | "assistantMessageID" | "sessionID" | "providerCallID" | "timeAdmitted"
>

type Active = Readonly<{
  canonical: AcceptCourseViewRevisionInput
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type PreparationOutcome = { readonly type: "success" } | { readonly type: "failure"; readonly error: unknown }

export interface Interface {
  readonly prepare: (input: unknown, registration: Registration) => Effect.Effect<void, unknown>
  readonly execute: (input: unknown, context: ExecuteContext) => Effect.Effect<ExactResult, unknown>
  readonly interrupt: (registration: Registration) => Effect.Effect<boolean, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/LearningCommandRuntime") {}

const decodePart = Schema.decodeUnknownSync(SessionV1.ToolPart)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const permission = yield* Permission.Service
    const inflight = new Map<SessionV1.PartID, Active>()

    yield* recoverAdmitted(events)

    const prepare = Effect.fn("LearningCommandRuntime.prepare")(function* (
      modelInput: unknown,
      registration: Registration,
    ) {
      const canonical = normalize(modelInput)
      const transaction = events.transaction((tx) =>
        Effect.gen(function* () {
          const consumed = yield* LearningFrontier.read(tx)
          yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
          const physical = yield* loadPhysicalPrepared(tx, canonical, registration)
          if (physical) return noEvent<PreparationOutcome>({ type: "success" })
          const row = yield* readPartRow(tx, registration.partID)
          if (!row) {
            return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
          }
          const trusted = yield* TurnLifecycle.validateLearningCommandRegistration(tx, {
            turnID: registration.turnID,
            inputID: registration.inputID,
            causalOccurrenceID: registration.causalOccurrenceID,
            partID: registration.partID,
            callID: registration.callID,
            emissionOrdinal: registration.emissionOrdinal,
            sessionID: registration.sessionID,
            assistantMessageID: registration.assistantMessageID,
            capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
          })
          const timeAdmitted = Math.max(
            row.time_created,
            trusted.modelTimeAdmitted,
            trusted.candidateTimeRegistered,
            trusted.toolTimeAdmitted,
          )
          yield* assertAdmittedPart(tx, canonical, registration, timeAdmitted)
          const invocation = {
            envelope: {
              occurrenceID: registration.causalOccurrenceID!,
              turnID: registration.turnID,
              inputID: registration.inputID,
              sessionID: registration.sessionID,
              parentUserMessageID: registration.parentUserMessageID,
              assistantMessageID: registration.assistantMessageID,
              partID: registration.partID,
              providerCallID: registration.callID,
              emissionOrdinal: registration.emissionOrdinal,
              capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
              capabilityVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
              authorizationBasis: "learner_acceptance" as const,
              timeAdmitted,
            },
            command: command(canonical),
          } satisfies LearningCommand.AcceptCourseViewRevisionInvocation
          const reserved = yield* reserveTransaction(tx, canonical, invocation)
          return { ...reserved, result: { type: "success" } as PreparationOutcome }
        }).pipe(
          Effect.catch((error) => Effect.succeed(noEvent<PreparationOutcome>({ type: "failure", error }))),
          Effect.orDie,
        ),
      )
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const exit = yield* restore(transaction).pipe(Effect.exit)
          if (Exit.isFailure(exit)) {
            const reconciled = yield* loadCommittedExactResult(events, registration, canonical).pipe(Effect.exit)
            if (Exit.isSuccess(reconciled) && Exit.isSuccess(reconciled.value) && reconciled.value.value) return
            if (Exit.isSuccess(reconciled) && Exit.isFailure(reconciled.value)) {
              return yield* Effect.failCause(reconciled.value.cause)
            }
            if (Exit.isFailure(reconciled)) return yield* Effect.failCause(reconciled.cause)
            return yield* Effect.failCause(exit.cause)
          }
          const outcome = exit.value
          if (outcome.result.type === "failure") return yield* Effect.fail(outcome.result.error)
        }),
      )
    })

    const execute = Effect.fn("LearningCommandRuntime.execute")(function* (
      modelInput: unknown,
      context: ExecuteContext,
    ) {
      const registration = requireRegistration(context)
      const canonical = normalize(modelInput)
      const active = inflight.get(registration.partID)
      if (active) {
        if (!isDeepStrictEqual(active.registration, registration) || !isDeepStrictEqual(active.canonical, canonical)) {
          return yield* invocationConflict(registration)
        }
        return yield* Deferred.await(active.deferred)
      }

      const deferred = Deferred.makeUnsafe<ExactResult, unknown>()
      const token = { canonical, registration, deferred } satisfies Active
      inflight.set(registration.partID, token)
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const exit = yield* restore(
            loadPrepared(events, canonical, registration).pipe(
              Effect.flatMap((prepared) => executePrepared(events, permission, prepared, context)),
            ),
          ).pipe(Effect.exit)
          if (Exit.isFailure(exit)) {
            const reconciled = yield* loadCommittedExactResult(events, registration, canonical).pipe(Effect.exit)
            if (Exit.isSuccess(reconciled) && Exit.isSuccess(reconciled.value) && reconciled.value.value) {
              yield* Deferred.succeed(deferred, reconciled.value.value).pipe(Effect.ignore)
              if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
              return reconciled.value.value
            }
            const cause = Exit.isFailure(reconciled)
              ? reconciled.cause
              : Exit.isFailure(reconciled.value)
                ? reconciled.value.cause
                : exit.cause
            yield* Deferred.failCause(deferred, cause).pipe(Effect.ignore)
            if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
            return yield* Effect.failCause(cause)
          }
          yield* Deferred.succeed(deferred, exit.value).pipe(Effect.ignore)
          if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
          return exit.value
        }),
      )
    })

    const interrupt = (registration: Registration) => interruptInvocation(events, registration)

    return Service.of({ prepare, execute, interrupt })
  }),
)

function loadPrepared(events: EventV2.Interface, canonical: AcceptCourseViewRevisionInput, registration: Registration) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const prepared = yield* loadPhysicalPrepared(tx, canonical, registration)
        if (!prepared) return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
        return noEvent(prepared)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function loadCommittedExactResult(
  events: EventV2.Interface,
  registration: Registration,
  attemptedCanonical?: AcceptCourseViewRevisionInput,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const canonical = attemptedCanonical ?? (yield* canonicalFromStoredPart(tx, registration.partID))
        if (!canonical) return undefined
        const prepared = yield* loadPhysicalPrepared(tx, canonical, registration)
        if (!prepared?.settlement) return undefined
        return exactResult(prepared.settlement)
      }).pipe(Effect.exit, Effect.map(noEvent)),
    )
    .pipe(Effect.map((result) => result.result))
}

function canonicalFromStoredPart(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, partID)
    if (!row) return undefined
    return normalize(partFromRow(row).state.input)
  })
}

function loadPhysicalPrepared(
  tx: EventV2.Transaction,
  canonical: AcceptCourseViewRevisionInput,
  registration: Registration,
) {
  return Effect.gen(function* () {
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical) return undefined
    const invocation = invocationFromPhysical(physical, canonical)
    if (!sameRegistration(invocation.envelope, registration)) return yield* invocationConflict(registration)
    const reservation = yield* LearningCommand.reserveAcceptance(tx, invocation)
    if (reservation.type === "admitted") {
      yield* assertAdmittedPart(tx, canonical, registration, invocation.envelope.timeAdmitted)
      return { canonical, invocation } satisfies Prepared
    }
    if (reservation.type === "replay") {
      yield* assertTerminalPart(tx, canonical, invocation.envelope, reservation.settlement)
      return { canonical, invocation, settlement: reservation.settlement } satisfies Prepared
    }
    return yield* Effect.die(`Stored learning invocation ${registration.partID} lost its physical reservation`)
  })
}

function invocationFromPhysical(
  physical: LearningCommand.PhysicalInvocation,
  canonical: AcceptCourseViewRevisionInput,
): LearningCommand.AcceptCourseViewRevisionInvocation {
  if (!physical.turn_id || !physical.input_id) {
    throw new Error(`Learning invocation ${physical.part_id} predates durable Turn authorization`)
  }
  return {
    envelope: {
      occurrenceID: physical.occurrence_id,
      turnID: physical.turn_id,
      inputID: physical.input_id,
      sessionID: physical.session_id,
      parentUserMessageID: physical.parent_user_message_id,
      assistantMessageID: physical.assistant_message_id,
      partID: physical.part_id,
      providerCallID: physical.provider_call_id,
      emissionOrdinal: physical.emission_ordinal,
      capabilityIdentity: physical.capability_identity,
      capabilityVersion: physical.capability_version,
      authorizationBasis: physical.authorization_basis,
      timeAdmitted: physical.time_admitted,
    },
    command: command(canonical),
  }
}

function reserveTransaction(
  tx: EventV2.Transaction,
  canonical: AcceptCourseViewRevisionInput,
  invocation: LearningCommand.AcceptCourseViewRevisionInvocation,
) {
  return Effect.gen(function* () {
    const reservation = yield* LearningCommand.reserveAcceptance(tx, invocation)
    if (reservation.type === "candidate" || reservation.type === "admitted") {
      return noEvent({ canonical, invocation } satisfies Prepared)
    }
    if (reservation.type === "replay") {
      yield* assertTerminalPart(tx, canonical, invocation.envelope, reservation.settlement)
      return noEvent({ canonical, invocation, settlement: reservation.settlement } satisfies Prepared)
    }

    const settlement = yield* LearningCommand.settleReservation(tx, {
      ...invocation,
      settlement: yield* settlementMetadata(tx, invocation.envelope.sessionID, invocation.envelope.timeAdmitted),
    })
    if (settlement.type === "candidate") return yield* Effect.die("Terminal reservation became a new candidate")
    const part = terminalPart(canonical, invocation.envelope, settlement.settlement)
    return withPartEvent(
      { canonical, invocation, settlement: settlement.settlement } satisfies Prepared,
      part,
      settlement.settlement.settlementTime,
    )
  })
}

function executePrepared(
  events: EventV2.Interface,
  permission: Permission.Interface,
  prepared: Prepared,
  context: ExecuteContext,
) {
  if (prepared.settlement) return Effect.succeed(exactResult(prepared.settlement))
  return Effect.gen(function* () {
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: prepared.invocation.envelope.sessionID,
        permission: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        patterns: [prepared.invocation.command.courseID],
        always: [prepared.invocation.command.courseID],
        metadata: {
          courseID: prepared.invocation.command.courseID,
          revisionID: prepared.invocation.command.revisionID,
        },
        tool: {
          messageID: prepared.invocation.envelope.assistantMessageID,
          callID: prepared.invocation.envelope.providerCallID,
        },
        ruleset: requireRuleset(context),
      },
      context.abort,
    )
    const committed = yield* events.transaction((tx) =>
      Effect.gen(function* () {
        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, {
          partID: prepared.invocation.envelope.partID,
          frontier: consumed,
        })
        const current = yield* loadPhysicalPrepared(
          tx,
          prepared.canonical,
          registrationFromEnvelope(prepared.invocation.envelope),
        )
        if (!current) return yield* Effect.die(`Learning invocation ${prepared.invocation.envelope.partID} disappeared`)
        if (current.settlement) return noEvent(current.settlement)
        const settlement = yield* LearningCommand.settleAcceptance(tx, {
          ...current.invocation,
          permission: permissionOutcome,
          settlement: yield* settlementMetadata(
            tx,
            current.invocation.envelope.sessionID,
            current.invocation.envelope.timeAdmitted,
          ),
        })
        if (settlement.type === "replay") {
          yield* assertTerminalPart(tx, prepared.canonical, current.invocation.envelope, settlement.settlement)
          return noEvent(settlement.settlement)
        }
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: current.invocation.envelope.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const part = terminalPart(prepared.canonical, current.invocation.envelope, settlement.settlement)
        return withPartEvent(settlement.settlement, part, settlement.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    return exactResult(committed.result)
  })
}

export function recoverAdmitted(events: EventV2.Interface) {
  return Effect.gen(function* () {
    const admitted = yield* events.transaction((tx) =>
      LearningCommand.listAdmitted(tx).pipe(
        Effect.map((rows) =>
          noEvent(rows.filter((row) => row.command_name === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY)),
        ),
        Effect.orDie,
      ),
    )
    yield* Effect.forEach(
      admitted.result,
      (row) =>
        row.turn_id && row.input_id
          ? interruptInvocation(events, {
              turnID: row.turn_id,
              inputID: row.input_id,
              causalOccurrenceID: row.occurrence_id,
              partID: row.part_id,
              callID: row.provider_call_id,
              emissionOrdinal: row.emission_ordinal,
              sessionID: row.session_id,
              parentUserMessageID: row.parent_user_message_id,
              assistantMessageID: row.assistant_message_id,
            }).pipe(Effect.orDie)
          : recoverLegacyAdmitted(events, row),
      { discard: true },
    )
  })
}

function recoverLegacyAdmitted(events: EventV2.Interface, row: LearningCommand.PhysicalInvocation) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const canonical = yield* canonicalFromStoredPart(tx, row.part_id)
        if (!canonical) {
          return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: row.part_id })
        }
        const settlement = yield* LearningCommand.recoverInterrupted(tx, {
          partID: row.part_id,
          settlement: yield* settlementMetadata(tx, row.session_id, row.time_admitted),
        })
        const envelope = terminalEnvelopeFromPhysical(row)
        if (settlement.type === "replay") {
          yield* assertTerminalPart(tx, canonical, envelope, settlement.settlement)
          return noEvent(true)
        }
        return withPartEvent(
          true,
          terminalPart(canonical, envelope, settlement.settlement),
          settlement.settlement.settlementTime,
        )
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

export const interruptInvocation = Effect.fn("LearningCommandRuntime.interrupt")(function* (
  events: EventV2.Interface,
  registration: Registration,
) {
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const exit = yield* restore(
        events.transaction((tx) => interruptTransaction(tx, registration).pipe(Effect.orDie)),
      ).pipe(Effect.exit)
      if (Exit.isSuccess(exit)) return exit.value.result

      const reconciled = yield* loadCommittedExactResult(events, registration).pipe(Effect.exit)
      if (Exit.isSuccess(reconciled) && Exit.isSuccess(reconciled.value) && reconciled.value.value) return true
      if (Exit.isSuccess(reconciled) && Exit.isFailure(reconciled.value)) {
        return yield* Effect.failCause(reconciled.value.cause)
      }
      if (Exit.isFailure(reconciled)) return yield* Effect.failCause(reconciled.cause)
      return yield* Effect.failCause(exit.cause)
    }),
  )
})

function interruptTransaction(tx: EventV2.Transaction, registration: Registration) {
  return Effect.gen(function* () {
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical) return noEvent(false)
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    const part = partFromRow(row)
    const canonical = normalize(part.state.input)
    const prepared = yield* loadPhysicalPrepared(tx, canonical, registration)
    if (!prepared) return yield* Effect.die(`Learning invocation ${registration.partID} disappeared`)
    if (prepared.settlement) return noEvent(true)
    const settlement = yield* LearningCommand.recoverInterrupted(tx, {
      partID: registration.partID,
      settlement: yield* settlementMetadata(tx, registration.sessionID, prepared.invocation.envelope.timeAdmitted),
    })
    if (settlement.type === "replay") {
      yield* assertTerminalPart(tx, canonical, prepared.invocation.envelope, settlement.settlement)
      return noEvent(true)
    }
    const terminal = terminalPart(canonical, prepared.invocation.envelope, settlement.settlement)
    return withPartEvent(true, terminal, settlement.settlement.settlementTime)
  })
}

function settlementMetadata(tx: EventV2.Transaction, sessionID: string, floor: number) {
  return Effect.all({
    time: Effect.sync(() => Math.max(Date.now(), floor)),
    order: EventV2.nextSequence(tx, sessionID),
  })
}

function pendingPart(input: AcceptCourseViewRevisionInput, registration: Registration): SessionV1.ToolPart {
  return {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
    callID: registration.callID,
    state: { status: "pending", input, raw: JSON.stringify(input) },
  }
}

function terminalPart(
  input: AcceptCourseViewRevisionInput,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.Settlement,
): SessionV1.ToolPart {
  const result = exactResult(settlement)
  return {
    id: envelope.partID,
    messageID: envelope.assistantMessageID,
    sessionID: envelope.sessionID,
    type: "tool",
    tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
    callID: envelope.providerCallID,
    state: {
      status: "completed",
      input,
      output: result.output,
      title: result.title,
      metadata: result.metadata,
      time: { start: envelope.timeAdmitted, end: settlement.settlementTime },
    },
  }
}

export function exactResult(settlement: LearningCommand.Settlement): ExactResult {
  return {
    title: "Course view revision acceptance",
    metadata: {
      command: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
      commandVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: true,
      truncated: false,
    },
    output: JSON.stringify(settlement),
  }
}

function partEvent(part: SessionV1.ToolPart, time: number) {
  return {
    definition: SessionV1.Event.PartUpdated,
    data: { sessionID: part.sessionID, part, time },
  } as const
}

function noEvent<A>(result: A): EventV2.PreparedTransaction<A, typeof SessionV1.Event.PartUpdated> {
  return { result }
}

function withPartEvent<A>(
  result: A,
  part: SessionV1.ToolPart,
  time: number,
): EventV2.PreparedTransaction<A, typeof SessionV1.Event.PartUpdated> {
  return { result, event: partEvent(part, time) }
}

function readPartRow(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return tx.select().from(PartTable).where(eq(PartTable.id, partID)).get().pipe(Effect.orDie)
}

function readPart(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return readPartRow(tx, partID).pipe(
    Effect.flatMap((row) =>
      row
        ? Effect.sync(() => partFromRow(row))
        : Effect.fail(new LearningCommand.InvocationTranscriptUnavailableError({ partID })),
    ),
  )
}

function partFromRow(row: typeof PartTable.$inferSelect): SessionV1.ToolPart {
  return decodePart({
    ...row.data,
    id: row.id,
    messageID: row.message_id,
    sessionID: row.session_id,
  }) as unknown as SessionV1.ToolPart
}

function assertTerminalPart(
  tx: EventV2.Transaction,
  canonical: AcceptCourseViewRevisionInput,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.Settlement,
) {
  return readPart(tx, envelope.partID).pipe(
    Effect.flatMap((part) =>
      isDeepStrictEqual(part, terminalPart(canonical, envelope, settlement))
        ? Effect.void
        : Effect.die(`Terminal learning Part ${envelope.partID} diverged from its exact settlement`),
    ),
  )
}

function terminalEnvelopeFromPhysical(physical: LearningCommand.PhysicalInvocation): TerminalPartEnvelope {
  return {
    partID: physical.part_id,
    assistantMessageID: physical.assistant_message_id,
    sessionID: physical.session_id,
    providerCallID: physical.provider_call_id,
    timeAdmitted: physical.time_admitted,
  }
}

function assertAdmittedPart(
  tx: EventV2.Transaction,
  canonical: AcceptCourseViewRevisionInput,
  registration: Registration,
  timeAdmitted: number,
) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    if (row.time_created <= timeAdmitted && isDeepStrictEqual(partFromRow(row), pendingPart(canonical, registration))) {
      return
    }
    return yield* invocationConflict(registration)
  })
}

function requireRegistration(context: ExecuteContext): Registration {
  const value = context.extra?.toolCall
  if (!isRegistration(value)) throw new Error("Learning command is missing its frozen host tool-call registration")
  if (
    context.sessionID !== value.sessionID ||
    context.messageID !== value.assistantMessageID ||
    context.callID !== value.callID
  ) {
    throw new Error("Learning command execution context diverged from its frozen host registration")
  }
  return value
}

function requireRuleset(context: ExecuteContext): PermissionV1.Ruleset {
  const ruleset = context.extra?.permissionRuleset
  if (!Array.isArray(ruleset)) throw new Error("Learning command is missing its trusted permission ruleset")
  return ruleset as PermissionV1.Ruleset
}

function isRegistration(value: unknown): value is Registration {
  if (typeof value !== "object" || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.partID === "string" &&
    typeof item.turnID === "string" &&
    typeof item.inputID === "string" &&
    typeof item.causalOccurrenceID === "string" &&
    typeof item.callID === "string" &&
    typeof item.emissionOrdinal === "number" &&
    typeof item.sessionID === "string" &&
    typeof item.parentUserMessageID === "string" &&
    typeof item.assistantMessageID === "string"
  )
}

function sameRegistration(envelope: LearningCommand.InvocationEnvelope, registration: Registration) {
  return (
    envelope.turnID === registration.turnID &&
    envelope.inputID === registration.inputID &&
    envelope.occurrenceID === registration.causalOccurrenceID &&
    envelope.partID === registration.partID &&
    envelope.providerCallID === registration.callID &&
    envelope.emissionOrdinal === registration.emissionOrdinal &&
    envelope.sessionID === registration.sessionID &&
    envelope.parentUserMessageID === registration.parentUserMessageID &&
    envelope.assistantMessageID === registration.assistantMessageID &&
    envelope.capabilityIdentity === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY &&
    envelope.capabilityVersion === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION &&
    envelope.authorizationBasis === "learner_acceptance"
  )
}

function registrationFromEnvelope(envelope: LearningCommand.InvocationEnvelope): Registration {
  return {
    turnID: envelope.turnID,
    inputID: envelope.inputID,
    causalOccurrenceID: envelope.occurrenceID,
    partID: envelope.partID,
    callID: envelope.providerCallID,
    emissionOrdinal: envelope.emissionOrdinal,
    sessionID: envelope.sessionID,
    parentUserMessageID: envelope.parentUserMessageID,
    assistantMessageID: envelope.assistantMessageID,
  }
}

function invocationConflict(registration: Registration) {
  return Effect.fail(
    new LearningCommand.InvocationConflictError({
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    }),
  )
}

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [EventV2Bridge.node, Permission.node, Database.node, SessionProjector.node],
})

export * as LearningCommandRuntime from "./runtime"
