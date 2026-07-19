import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { PartTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { eq } from "drizzle-orm"
import { Cause, Context, Deferred, Effect, Exit, Layer, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import {
  anchorCommand,
  command,
  defaultCommand,
  normalize,
  normalizeAnchor,
  normalizeDefault,
  type AcceptCourseViewRevisionInput,
  type SetCourseRouteAnchorInput,
  type SetDefaultCoursePreferenceInput,
} from "./input"
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
  interaction?: Readonly<{
    permission: Readonly<{
      ruleset: PermissionV1.Ruleset
      authority: readonly Permission.AuthorityLayer[]
    }>
  }>
}>

export type ExactResult = Readonly<{
  title: string
  metadata: Record<string, unknown>
  output: string
}>

export type PrimaryCapability =
  | typeof LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY
  | typeof LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
  | typeof LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY

type Canonical =
  | Readonly<{
      toolID: typeof LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY
      input: AcceptCourseViewRevisionInput
    }>
  | Readonly<{
      toolID: typeof LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
      input: SetDefaultCoursePreferenceInput
    }>
  | Readonly<{
      toolID: typeof LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY
      input: SetCourseRouteAnchorInput
    }>

type Invocation = LearningCommand.AcceptCourseViewRevisionInvocation | LearningCommand.NavigationInvocation

type Prepared = Readonly<{
  canonical: Canonical
  invocation: Invocation
  settlement?: LearningCommand.Settlement
}>

type TerminalPartEnvelope = Pick<
  LearningCommand.InvocationEnvelope,
  "partID" | "assistantMessageID" | "sessionID" | "providerCallID" | "timeAdmitted"
>

type Active = Readonly<{
  canonical: Canonical
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type PreparationOutcome = { readonly type: "success" } | { readonly type: "failure"; readonly error: unknown }

export interface Interface {
  readonly prepare: (input: unknown, registration: Registration) => Effect.Effect<void, unknown>
  readonly execute: (input: unknown, context: ExecuteContext) => Effect.Effect<ExactResult, unknown>
  readonly prepareCommand: (
    toolID: PrimaryCapability,
    input: unknown,
    registration: Registration,
  ) => Effect.Effect<void, unknown>
  readonly executeCommand: (
    toolID: PrimaryCapability,
    input: unknown,
    context: ExecuteContext,
  ) => Effect.Effect<ExactResult, unknown>
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

    const prepareCommand = Effect.fn("LearningCommandRuntime.prepare")(function* (
      toolID: PrimaryCapability,
      modelInput: unknown,
      registration: Registration,
    ) {
      const canonical = canonicalInput(toolID, modelInput)
      const transaction = events.transaction((tx) =>
        Effect.gen(function* () {
          const physical = yield* loadPhysicalPrepared(tx, canonical, registration)
          if (physical) return noEvent<PreparationOutcome>({ type: "success" })
          const consumed = yield* LearningFrontier.read(tx)
          yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
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
            capabilityIdentity: canonical.toolID,
          })
          const timeAdmitted = Math.max(
            row.time_created,
            trusted.modelTimeAdmitted,
            trusted.candidateTimeRegistered,
            trusted.toolTimeAdmitted,
          )
          yield* assertAdmittedPart(tx, canonical, registration, timeAdmitted)
          const invocation = invocationFor(canonical, registration, timeAdmitted)
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

    const prepare = (input: unknown, registration: Registration) =>
      prepareCommand(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, input, registration)

    const executeCommand = Effect.fn("LearningCommandRuntime.execute")(function* (
      toolID: PrimaryCapability,
      modelInput: unknown,
      context: ExecuteContext,
    ) {
      const registration = requireRegistration(context)
      const canonical = canonicalInput(toolID, modelInput)
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
            if (Exit.isFailure(reconciled)) {
              yield* Deferred.failCause(deferred, reconciled.cause).pipe(Effect.ignore)
              if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
              return yield* Effect.failCause(reconciled.cause)
            }
            if (Exit.isFailure(reconciled.value)) {
              yield* Deferred.failCause(deferred, reconciled.value.cause).pipe(Effect.ignore)
              if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
              return yield* Effect.failCause(reconciled.value.cause)
            }
            if (isKnownExecutionFailure(Cause.squash(exit.cause))) {
              yield* Deferred.failCause(deferred, exit.cause).pipe(Effect.ignore)
              if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
              return yield* Effect.failCause(exit.cause)
            }
            const unknown = outcomeUnknown(canonical.toolID)
            yield* Deferred.succeed(deferred, unknown).pipe(Effect.ignore)
            if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
            return unknown
          }
          yield* Deferred.succeed(deferred, exit.value).pipe(Effect.ignore)
          if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
          return exit.value
        }),
      )
    })

    const execute = (input: unknown, context: ExecuteContext) =>
      executeCommand(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, input, context)

    const interrupt = (registration: Registration) => interruptInvocation(events, registration)

    return Service.of({ prepare, execute, prepareCommand, executeCommand, interrupt })
  }),
)

function loadPrepared(events: EventV2.Interface, canonical: Canonical, registration: Registration) {
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
  attemptedCanonical?: Canonical,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const canonical = attemptedCanonical ?? (yield* canonicalFromStoredPart(tx, registration.partID))
        if (!canonical) return undefined
        const prepared = yield* loadPhysicalPrepared(tx, canonical, registration)
        if (!prepared?.settlement) return undefined
        return exactResult(prepared.settlement, canonical.toolID)
      }).pipe(Effect.exit, Effect.map(noEvent)),
    )
    .pipe(Effect.map((result) => result.result))
}

function canonicalFromStoredPart(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, partID)
    if (!row) return undefined
    const part = partFromRow(row)
    if (!isPrimaryCapability(part.tool)) return undefined
    return canonicalInput(part.tool, part.state.input)
  })
}

function loadPhysicalPrepared(tx: EventV2.Transaction, canonical: Canonical, registration: Registration) {
  return Effect.gen(function* () {
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical) return undefined
    const invocation = invocationFromPhysical(physical, canonical)
    if (!sameRegistration(invocation.envelope, registration, canonical)) return yield* invocationConflict(registration)
    const reservation = yield* reservePrimary(tx, invocation)
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

function invocationFromPhysical(physical: LearningCommand.PhysicalInvocation, canonical: Canonical): Invocation {
  if (!physical.turn_id || !physical.input_id) {
    throw new Error(`Learning invocation ${physical.part_id} predates durable Turn authorization`)
  }
  if (physical.command_name !== canonical.toolID) {
    throw new Error(`Learning invocation ${physical.part_id} changed command identity`)
  }
  const envelope = {
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
  }
  if (canonical.toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    return { envelope, command: command(canonical.input) }
  }
  if (canonical.toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    if (!physical.permission_request_id) {
      throw new Error(`Default Course invocation ${physical.part_id} has no stable permission request`)
    }
    return {
      envelope,
      command: defaultCommand(canonical.input),
      permissionRequestID: physical.permission_request_id,
    }
  }
  return { envelope, command: anchorCommand(canonical.input) }
}

function reserveTransaction(tx: EventV2.Transaction, canonical: Canonical, invocation: Invocation) {
  return Effect.gen(function* () {
    const reservation = yield* reservePrimary(tx, invocation)
    if (reservation.type === "candidate" || reservation.type === "admitted") {
      return noEvent({ canonical, invocation } satisfies Prepared)
    }
    if (reservation.type === "replay") {
      yield* assertTerminalPart(tx, canonical, invocation.envelope, reservation.settlement)
      return noEvent({ canonical, invocation, settlement: reservation.settlement } satisfies Prepared)
    }

    const metadata = yield* settlementMetadata(tx, invocation.envelope.sessionID, invocation.envelope.timeAdmitted)
    const settlement = isNavigationInvocation(invocation)
      ? yield* LearningCommand.settleNavigationReservation(tx, { ...invocation, settlement: metadata })
      : yield* LearningCommand.settleReservation(tx, { ...invocation, settlement: metadata })
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
  if (prepared.settlement) return Effect.succeed(exactResult(prepared.settlement, prepared.canonical.toolID))
  if (isNavigationInvocation(prepared.invocation)) {
    return executeNavigationPrepared(events, permission, prepared.canonical, prepared.invocation, context)
  }
  if (prepared.canonical.toolID !== LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    return Effect.die("Course acceptance invocation has a different canonical command")
  }
  const canonical = prepared.canonical
  const invocation = prepared.invocation
  return Effect.gen(function* () {
    const authority = requirePermissionContext(context)
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: invocation.envelope.sessionID,
        permission: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        patterns: [invocation.command.courseID],
        always: [invocation.command.courseID],
        metadata: {
          courseID: invocation.command.courseID,
          revisionID: invocation.command.revisionID,
        },
        tool: {
          messageID: invocation.envelope.assistantMessageID,
          callID: invocation.envelope.providerCallID,
        },
        ruleset: authority.ruleset,
        authority: authority.authority,
      },
      context.abort,
    )
    const committed = yield* events.transaction((tx) =>
      Effect.gen(function* () {
        const current = yield* loadPhysicalPrepared(tx, canonical, registrationFromEnvelope(invocation.envelope))
        if (!current) return yield* Effect.die(`Learning invocation ${invocation.envelope.partID} disappeared`)
        if (current.settlement) return noEvent(current.settlement)
        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, {
          partID: invocation.envelope.partID,
          frontier: consumed,
        })
        if (isNavigationInvocation(current.invocation)) {
          return yield* Effect.die("Course acceptance invocation changed command kind")
        }
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
          yield* assertTerminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
          return noEvent(settlement.settlement)
        }
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: current.invocation.envelope.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const part = terminalPart(canonical, current.invocation.envelope, settlement.settlement)
        return withPartEvent(settlement.settlement, part, settlement.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    return exactResult(committed.result, canonical.toolID)
  })
}

function executeNavigationPrepared(
  events: EventV2.Interface,
  permission: Permission.Interface,
  canonical: Canonical,
  invocation: LearningCommand.NavigationInvocation,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    if (!navigationMatchesCanonical(invocation, canonical)) {
      return yield* Effect.die("Navigation invocation has a different canonical command")
    }
    const authority = requirePermissionContext(context)
    const pattern = navigationPermissionPattern(invocation)
    const rule = Permission.evaluateAuthority(
      invocation.envelope.capabilityIdentity,
      pattern,
      authority.ruleset,
      authority.authority,
    )
    if (rule.action === "deny") {
      return yield* commitNavigation(events, canonical, invocation, { type: "deny" }, undefined)
    }
    const prepared = yield* prepareNavigation(events, invocation)
    const permissionOutcome = yield* navigationPermissionOutcome(
      permission,
      invocation,
      prepared,
      rule.action,
      authority,
      context.abort,
    )
    return yield* commitNavigation(
      events,
      canonical,
      invocation,
      permissionOutcome,
      prepared.type === "success" ? prepared.value : undefined,
    )
  })
}

type NavigationPreparation =
  | { readonly type: "success"; readonly kind: "default"; readonly value: LearnerNavigation.PreparedDefault }
  | { readonly type: "success"; readonly kind: "anchor"; readonly value: LearnerNavigation.PreparedAnchor }
  | { readonly type: "failure"; readonly error: unknown }

function prepareNavigation(events: EventV2.Interface, invocation: LearningCommand.NavigationInvocation) {
  if (isDefaultNavigationInvocation(invocation)) {
    return events
      .transaction((tx) =>
        LearnerNavigation.prepareDefaultInTransaction(tx, invocation.command, invocation.permissionRequestID).pipe(
          Effect.map((value): NavigationPreparation => ({ type: "success", kind: "default", value })),
          Effect.catch((error) => Effect.succeed({ type: "failure", error } as NavigationPreparation)),
          Effect.map(noEvent),
        ),
      )
      .pipe(Effect.map((result) => result.result))
  }
  return events
    .transaction((tx) =>
      LearnerNavigation.prepareAnchorInTransaction(tx, invocation.command).pipe(
        Effect.map((value): NavigationPreparation => ({ type: "success", kind: "anchor", value })),
        Effect.catch((error) => Effect.succeed({ type: "failure", error } as NavigationPreparation)),
        Effect.map(noEvent),
      ),
    )
    .pipe(Effect.map((result) => result.result))
}

function navigationPermissionOutcome(
  permission: Permission.Interface,
  invocation: LearningCommand.NavigationInvocation,
  prepared: NavigationPreparation,
  action: PermissionV1.Action,
  authority: ReturnType<typeof requirePermissionContext>,
  abort: AbortSignal,
) {
  if (prepared.type === "failure") return Effect.succeed({ type: "allow" } as const)
  if (action === "allow" && prepared.value.decision === "no_change") {
    return Effect.succeed({ type: "allow" } as const)
  }
  if (action === "allow" && invocation.command.kind === "course_route_anchor") {
    return Effect.succeed({ type: "allow" } as const)
  }
  if (
    isDefaultNavigationInvocation(invocation) &&
    prepared.kind === "default" &&
    prepared.value.decision === "candidate"
  ) {
    return LearningCommandPermission.ask(
      permission,
      {
        id: invocation.permissionRequestID,
        requirePrompt: true,
        sessionID: invocation.envelope.sessionID,
        permission: invocation.envelope.capabilityIdentity,
        patterns: [navigationPermissionPattern(invocation)],
        always: [],
        metadata: {
          onceOnly: true,
          navigationKind: invocation.command.kind,
          confirmation: prepared.value.confirmation,
        },
        tool: {
          messageID: invocation.envelope.assistantMessageID,
          callID: invocation.envelope.providerCallID,
        },
        ruleset: authority.ruleset,
        authority: authority.authority,
      },
      abort,
    )
  }
  return LearningCommandPermission.ask(
    permission,
    {
      sessionID: invocation.envelope.sessionID,
      permission: invocation.envelope.capabilityIdentity,
      patterns: [navigationPermissionPattern(invocation)],
      always: [navigationPermissionPattern(invocation)],
      metadata: { navigationKind: invocation.command.kind, noChange: prepared.value.decision === "no_change" },
      tool: {
        messageID: invocation.envelope.assistantMessageID,
        callID: invocation.envelope.providerCallID,
      },
      ruleset: authority.ruleset,
      authority: authority.authority,
    },
    abort,
  )
}

function commitNavigation(
  events: EventV2.Interface,
  canonical: Canonical,
  invocation: LearningCommand.NavigationInvocation,
  permission: LearningCommand.PermissionOutcome,
  prepared: LearnerNavigation.PreparedDefault | LearnerNavigation.PreparedAnchor | undefined,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const current = yield* loadPhysicalPrepared(tx, canonical, registrationFromEnvelope(invocation.envelope))
        if (!current) return yield* Effect.die(`Learning invocation ${invocation.envelope.partID} disappeared`)
        if (current.settlement) return noEvent(current.settlement)
        if (!isNavigationInvocation(current.invocation)) {
          return yield* Effect.die("Navigation invocation changed command kind")
        }
        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, {
          partID: current.invocation.envelope.partID,
          frontier: consumed,
        })
        const settlement = yield* LearningCommand.settleNavigation(tx, {
          ...current.invocation,
          permission,
          settlement: yield* settlementMetadata(
            tx,
            current.invocation.envelope.sessionID,
            current.invocation.envelope.timeAdmitted,
          ),
          ...(prepared ? { prepared } : {}),
        })
        if (settlement.type === "replay") {
          yield* assertTerminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
          return noEvent(settlement.settlement)
        }
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: current.invocation.envelope.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        return withPartEvent(
          settlement.settlement,
          terminalPart(canonical, current.invocation.envelope, settlement.settlement),
          settlement.settlement.settlementTime,
        )
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => exactResult(result.result, canonical.toolID)))
}

export function recoverAdmitted(events: EventV2.Interface) {
  return Effect.gen(function* () {
    const admitted = yield* events.transaction((tx) =>
      LearningCommand.listAdmitted(tx).pipe(
        Effect.map((rows) => noEvent(rows.filter((row) => isPrimaryCapability(row.command_name)))),
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
    if (!isPrimaryCapability(part.tool)) {
      return yield* Effect.die(`Primary learning invocation ${registration.partID} has a different tool ID`)
    }
    const canonical = canonicalInput(part.tool, part.state.input)
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
  return Effect.gen(function* () {
    const frontier = yield* LearningFrontier.read(tx)
    return {
      time: Math.max(Date.now(), floor, frontier.time),
      order: yield* EventV2.nextSequence(tx, sessionID),
    }
  })
}

function pendingPart(canonical: Canonical, registration: Registration): SessionV1.ToolPart {
  return {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: canonical.toolID,
    callID: registration.callID,
    state: { status: "pending", input: canonical.input, raw: JSON.stringify(canonical.input) },
  }
}

function terminalPart(
  canonical: Canonical,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.Settlement,
): SessionV1.ToolPart {
  const result = exactResult(settlement, canonical.toolID)
  return {
    id: envelope.partID,
    messageID: envelope.assistantMessageID,
    sessionID: envelope.sessionID,
    type: "tool",
    tool: canonical.toolID,
    callID: envelope.providerCallID,
    state: {
      status: "completed",
      input: canonical.input,
      output: result.output,
      title: result.title,
      metadata: result.metadata,
      time: { start: envelope.timeAdmitted, end: settlement.settlementTime },
    },
  }
}

export function exactResult(
  settlement: LearningCommand.Settlement,
  toolID: PrimaryCapability = LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
): ExactResult {
  return {
    title:
      toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY
        ? "Course view revision acceptance"
        : toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
          ? "Default Course preference"
          : "Course route anchor",
    metadata: {
      command: toolID,
      commandVersion: capabilityVersion(toolID),
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: true,
      truncated: false,
    },
    output: JSON.stringify(settlement),
  }
}

function outcomeUnknown(toolID: PrimaryCapability): ExactResult {
  return {
    title: "Learning command outcome unknown",
    metadata: {
      command: toolID,
      commandVersion: capabilityVersion(toolID),
      outcome: "error",
      code: "outcome_unknown" satisfies LearningCommand.ErrorCode,
      durablySettled: false,
      truncated: false,
    },
    output: JSON.stringify({ outcome: "error", code: "outcome_unknown" }),
  }
}

function isKnownExecutionFailure(error: unknown) {
  return (
    error instanceof LearningCommand.InvocationConflictError ||
    error instanceof LearningCommand.InvocationNotFoundError ||
    error instanceof LearningCommand.InvocationTranscriptUnavailableError ||
    error instanceof LearningCommand.InvalidInvocationEnvelopeError
  )
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
  canonical: Canonical,
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
  canonical: Canonical,
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

function requirePermissionContext(context: ExecuteContext) {
  if (context.interaction) return context.interaction.permission
  const ruleset = context.extra?.permissionRuleset
  if (!Array.isArray(ruleset)) throw new Error("Learning command is missing its trusted permission ruleset")
  return { ruleset: ruleset as PermissionV1.Ruleset, authority: [] as const }
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

function canonicalInput(toolID: PrimaryCapability, input: unknown): Canonical {
  if (toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    return { toolID, input: normalize(input) }
  }
  if (toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    return { toolID, input: normalizeDefault(input) }
  }
  return { toolID, input: normalizeAnchor(input) }
}

function invocationFor(canonical: Canonical, registration: Registration, timeAdmitted: number): Invocation {
  const envelope = {
    occurrenceID: registration.causalOccurrenceID!,
    turnID: registration.turnID,
    inputID: registration.inputID,
    sessionID: registration.sessionID,
    parentUserMessageID: registration.parentUserMessageID,
    assistantMessageID: registration.assistantMessageID,
    partID: registration.partID,
    providerCallID: registration.callID,
    emissionOrdinal: registration.emissionOrdinal,
    capabilityIdentity: canonical.toolID,
    capabilityVersion: capabilityVersion(canonical.toolID),
    authorizationBasis: authorizationBasis(canonical.toolID),
    timeAdmitted,
  }
  if (canonical.toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    return { envelope, command: command(canonical.input) }
  }
  if (canonical.toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    return {
      envelope,
      command: defaultCommand(canonical.input),
      permissionRequestID: stableDefaultPermissionRequestID(registration),
    }
  }
  return { envelope, command: anchorCommand(canonical.input) }
}

function stableDefaultPermissionRequestID(registration: Registration) {
  const digest = new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        command: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        partID: registration.partID,
        callID: registration.callID,
      }),
    )
    .digest("hex")
  return PermissionV1.ID.ascending(`per_${digest.slice(0, 26)}`)
}

function reservePrimary(tx: EventV2.Transaction, invocation: Invocation) {
  return isNavigationInvocation(invocation)
    ? LearningCommand.reserveNavigation(tx, invocation)
    : LearningCommand.reserveAcceptance(tx, invocation)
}

function isNavigationInvocation(invocation: Invocation): invocation is LearningCommand.NavigationInvocation {
  return "kind" in invocation.command
}

function isDefaultNavigationInvocation(
  invocation: LearningCommand.NavigationInvocation,
): invocation is LearningCommand.SetDefaultCoursePreferenceInvocation {
  return invocation.command.kind === "default_course_preference"
}

function navigationMatchesCanonical(invocation: LearningCommand.NavigationInvocation, canonical: Canonical) {
  return invocation.command.kind === "default_course_preference"
    ? canonical.toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
    : canonical.toolID === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY
}

function navigationPermissionPattern(invocation: LearningCommand.NavigationInvocation) {
  if (invocation.command.kind === "default_course_preference") {
    return invocation.command.target?.courseID ?? "clear"
  }
  return invocation.command.courseID
}

function isPrimaryCapability(value: string): value is PrimaryCapability {
  return (
    value === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY ||
    value === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY ||
    value === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY
  )
}

function capabilityVersion(toolID: PrimaryCapability) {
  if (toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    return LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION
  }
  if (toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    return LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_VERSION
  }
  return LearningCommand.SET_COURSE_ROUTE_ANCHOR_VERSION
}

function authorizationBasis(toolID: PrimaryCapability): LearningCommand.AuthorizationBasis {
  return toolID === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY ? "learner_request" : "learner_acceptance"
}

function sameRegistration(
  envelope: LearningCommand.InvocationEnvelope,
  registration: Registration,
  canonical: Canonical,
) {
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
    envelope.capabilityIdentity === canonical.toolID &&
    envelope.capabilityVersion === capabilityVersion(canonical.toolID) &&
    envelope.authorizationBasis === authorizationBasis(canonical.toolID)
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
