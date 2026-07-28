export * as RepresentationCommandRuntime from "./representation-runtime"
export type { ExecuteContext, ExactResult, Registration } from "./runtime"

import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { AppProcess } from "@opencode-ai/core/process"
import { Representation } from "@opencode-ai/core/representation"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { PartTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { RepresentationConversion } from "@/representation/conversion"
import { Session } from "@/session/session"
import { eq } from "drizzle-orm"
import { Cause, Context, Deferred, Effect, Exit, Layer, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import { normalizeRepresentation, type RepresentationConvertInput } from "./input"
import { LearningCommandPermission } from "./permission"
import { LearningCommandPresentation } from "./presentation"
import type { ExecuteContext, ExactResult, Registration } from "./runtime"

type Prepared = Readonly<{
  canonical: RepresentationConvertInput
  invocation: LearningCommand.RepresentationConvertInvocation
  settlement?: LearningCommand.Settlement
}>

type TerminalPartEnvelope = Pick<
  LearningCommand.InvocationEnvelope,
  "partID" | "assistantMessageID" | "sessionID" | "providerCallID" | "timeAdmitted"
>

type Active = Readonly<{
  canonical: RepresentationConvertInput
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type PreparationOutcome = { readonly type: "success" } | { readonly type: "failure"; readonly error: unknown }

export interface Interface {
  readonly prepare: (input: unknown, registration: Registration) => Effect.Effect<void, unknown>
  readonly execute: (input: unknown, context: ExecuteContext) => Effect.Effect<ExactResult, unknown>
  readonly interrupt: (registration: Registration) => Effect.Effect<boolean, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/RepresentationCommandRuntime") {}

const decodePart = Schema.decodeUnknownSync(SessionV1.ToolPart)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const permission = yield* Permission.Service
    const dependencies = yield* Effect.context<
      | Artifact.Service
      | ContentRoot.Service
      | Database.Service
      | Representation.Service
      | AppProcess.Service
      | Auth.Service
      | Config.Service
      | Plugin.Service
      | Provider.Service
      | Session.Service
    >()
    const inflight = new Map<SessionV1.PartID, Active>()

    yield* recoverAdmitted(events)

    const prepare = Effect.fn("RepresentationCommandRuntime.prepare")(function* (
      modelInput: unknown,
      registration: Registration,
    ) {
      const canonical = normalizeRepresentation(modelInput)
      const transaction = events.transaction((tx) =>
        Effect.gen(function* () {
          yield* consumeFrontier(tx, registration.partID)
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
            capabilityIdentity: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
          })
          const timeAdmitted = Math.max(
            row.time_created,
            trusted.modelTimeAdmitted,
            trusted.candidateTimeRegistered,
            trusted.toolTimeAdmitted,
          )
          yield* assertAdmittedPart(tx, canonical, registration, timeAdmitted)
          const invocation = makeInvocation(canonical, registration, registration.causalOccurrenceID!, timeAdmitted)
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
          if (exit.value.result.type === "failure") return yield* Effect.fail(exit.value.result.error)
        }),
      )
    })

    const execute = Effect.fn("RepresentationCommandRuntime.execute")(function* (
      modelInput: unknown,
      context: ExecuteContext,
    ) {
      const registration = requireRegistration(context)
      const canonical = normalizeRepresentation(modelInput)
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
              Effect.flatMap((prepared) =>
                executePrepared(events, permission, prepared, context).pipe(Effect.provide(dependencies)),
              ),
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

    return Service.of({ prepare, execute, interrupt: (registration) => interruptInvocation(events, registration) })
  }),
)

function executePrepared(
  events: EventV2.Interface,
  permission: Permission.Interface,
  prepared: Prepared,
  context: ExecuteContext,
) {
  if (prepared.settlement) return Effect.succeed(exactResult(prepared.settlement, prepared.invocation.envelope))
  return Effect.scoped(
    Effect.gen(function* () {
      const decision = yield* events.transaction((tx) =>
        Effect.gen(function* () {
          yield* consumeFrontier(tx, prepared.invocation.envelope.partID)
          return noEvent(yield* LearningCommand.decideRepresentationCandidate(tx, prepared.invocation))
        }).pipe(Effect.orDie),
      )
      if (decision.result.type === "replay") {
        return exactResult(decision.result.settlement, prepared.invocation.envelope)
      }
      if (decision.result.type === "terminal") {
        return yield* settleFailure(events, prepared, "context_refresh_required")
      }

      const permissionOutcome = yield* LearningCommandPermission.ask(
        permission,
        {
          sessionID: prepared.invocation.envelope.sessionID,
          permission: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
          patterns: [prepared.invocation.command.effectiveArtifactID],
          always: [prepared.invocation.command.effectiveArtifactID],
          metadata: {
            effectiveArtifactID: prepared.invocation.command.effectiveArtifactID,
            sourceRevisionID: prepared.invocation.command.sourceRevisionID,
            producerKind: prepared.invocation.producerKind,
            ...SemanticPresentation.metadata(LearningCommandPresentation.representationProposal(prepared.invocation)),
          },
          tool: {
            messageID: prepared.invocation.envelope.assistantMessageID,
            callID: prepared.invocation.envelope.providerCallID,
          },
          ruleset: requireRuleset(context),
        },
        context.abort,
      )
      if (permissionOutcome.type !== "allow") {
        return yield* settlePermission(events, prepared, permissionOutcome)
      }

      const conversion = yield* RepresentationConversion.prepare({
        effectiveArtifactID: prepared.canonical.effectiveArtifactID,
        sourceRevisionID: prepared.canonical.sourceRevisionID,
        contentRootID: prepared.canonical.contentRootID,
        relativePath: prepared.canonical.relativePath,
        rootSelection: RepresentationConversion.RootSelection.artifactProvenance(),
        producer:
          prepared.invocation.producerKind === "local_pdf"
            ? { kind: "local_pdf" }
            : {
                kind: "configured_model",
                sessionID: prepared.invocation.envelope.sessionID,
                messageID: prepared.invocation.envelope.parentUserMessageID,
              },
        authority: Representation.ConversionAuthority.learningCommand({
          operationIdentity: LearningCommand.representationConversionOperationIdentity(prepared.invocation),
          authorizationBasis: prepared.invocation.envelope.authorizationBasis,
          occurrenceID: prepared.invocation.envelope.occurrenceID,
          invocationPartID: prepared.invocation.envelope.partID,
        }),
        abort: context.abort,
      }).pipe(Effect.catch((error) => settleFailure(events, prepared, failureCode(error))))
      if (isExactResult(conversion)) return conversion

      const committed = yield* Effect.uninterruptible(
        events.transaction((tx) =>
          Effect.gen(function* () {
            yield* consumeFrontier(tx, prepared.invocation.envelope.partID)
            const current = yield* loadPhysicalPrepared(
              tx,
              prepared.canonical,
              registrationFromEnvelope(prepared.invocation.envelope),
            )
            if (!current)
              return yield* Effect.die(`Learning invocation ${prepared.invocation.envelope.partID} disappeared`)
            if (current.settlement) return noEvent(current.settlement)

            if (conversion.type === "already_accepted") {
              const settled = yield* LearningCommand.settleRepresentationSuccess(tx, {
                ...current.invocation,
                representationRevisionID: conversion.representation.id,
                domainResult: "already_accepted",
                settlement: yield* settlementMetadata(
                  tx,
                  current.invocation.envelope.sessionID,
                  current.invocation.envelope.timeAdmitted,
                ),
              })
              if (settled.type === "replay") {
                yield* assertTerminalPart(tx, prepared.canonical, current.invocation.envelope, settled.settlement)
                return noEvent(settled.settlement)
              }
              const part = terminalPart(prepared.canonical, current.invocation.envelope, settled.settlement)
              return withPartEvent(settled.settlement, part, settled.settlement.settlementTime)
            }

            const metadata = yield* settlementMetadata(
              tx,
              current.invocation.envelope.sessionID,
              current.invocation.envelope.timeAdmitted,
            )
            const candidate = yield* LearningCommand.settleRepresentationCandidate(tx, {
              ...current.invocation,
              permission: { type: "allow" },
              settlement: metadata,
            })
            if (candidate.type === "replay") {
              yield* assertTerminalPart(tx, prepared.canonical, current.invocation.envelope, candidate.settlement)
              return noEvent(candidate.settlement)
            }
            if (candidate.type === "settled") {
              const part = terminalPart(prepared.canonical, current.invocation.envelope, candidate.settlement)
              return withPartEvent(candidate.settlement, part, candidate.settlement.settlementTime)
            }

            const representation = yield* conversion.acceptance.commit(tx)
            yield* TurnLifecycle.recordToolResultingFrontier(tx, {
              partID: current.invocation.envelope.partID,
              frontier: yield* LearningFrontier.read(tx),
            })
            const settled = yield* LearningCommand.settleRepresentationSuccess(tx, {
              ...current.invocation,
              representationRevisionID: representation.id,
              domainResult: "new",
              settlement: metadata,
            })
            if (settled.type === "replay") {
              return yield* Effect.die("Representation commit lost its physical learning-command settlement")
            }
            const part = terminalPart(prepared.canonical, current.invocation.envelope, settled.settlement)
            return withPartEvent(settled.settlement, part, settled.settlement.settlementTime)
          }).pipe(Effect.orDie),
        ),
      ).pipe(Effect.exit)
      if (Exit.isSuccess(committed)) return exactResult(committed.value.result, prepared.invocation.envelope)
      const exact = yield* loadCommittedExactResult(
        events,
        registrationFromEnvelope(prepared.invocation.envelope),
        prepared.canonical,
      )
      if (Exit.isSuccess(exact) && exact.value) return exact.value
      if (Exit.isFailure(exact)) return yield* Effect.failCause(exact.cause)
      return yield* settleFailure(events, prepared, failureCode(Cause.squash(committed.cause)))
    }).pipe(Effect.catch((error) => settleFailure(events, prepared, failureCode(error)))),
  )
}

function settlePermission(
  events: EventV2.Interface,
  prepared: Prepared,
  permission: LearningCommand.PermissionOutcome,
) {
  return settleTransaction(events, prepared, (tx, current, metadata) =>
    LearningCommand.settleRepresentationCandidate(tx, {
      ...current.invocation,
      permission,
      settlement: metadata,
    }),
  )
}

function settleFailure(
  events: EventV2.Interface,
  prepared: Prepared,
  code: LearningCommand.RepresentationFailureCode,
) {
  return settleTransaction(events, prepared, (tx, current, metadata) =>
    LearningCommand.settleRepresentationFailure(tx, { ...current.invocation, code, settlement: metadata }),
  )
}

function settleTransaction(
  events: EventV2.Interface,
  prepared: Prepared,
  settle: (
    tx: EventV2.Transaction,
    current: Prepared,
    metadata: LearningCommand.SettlementMetadata,
  ) => Effect.Effect<LearningCommand.SettlementResult, unknown>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        yield* consumeFrontier(tx, prepared.invocation.envelope.partID)
        const current = yield* loadPhysicalPrepared(
          tx,
          prepared.canonical,
          registrationFromEnvelope(prepared.invocation.envelope),
        )
        if (!current) return yield* Effect.die(`Learning invocation ${prepared.invocation.envelope.partID} disappeared`)
        if (current.settlement) return noEvent(current.settlement)
        const result = yield* settle(
          tx,
          current,
          yield* settlementMetadata(
            tx,
            current.invocation.envelope.sessionID,
            current.invocation.envelope.timeAdmitted,
          ),
        )
        if (result.type === "candidate") return yield* Effect.die("Terminal settlement remained a candidate")
        if (result.type === "replay") {
          yield* assertTerminalPart(tx, prepared.canonical, current.invocation.envelope, result.settlement)
          return noEvent(result.settlement)
        }
        const part = terminalPart(prepared.canonical, current.invocation.envelope, result.settlement)
        return withPartEvent(result.settlement, part, result.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((committed) => exactResult(committed.result, prepared.invocation.envelope)))
}

function consumeFrontier(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return Effect.gen(function* () {
    const frontier = yield* LearningFrontier.read(tx)
    return yield* TurnLifecycle.consumeToolFrontier(tx, { partID, frontier })
  })
}

function loadPrepared(events: EventV2.Interface, canonical: RepresentationConvertInput, registration: Registration) {
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
  attemptedCanonical?: RepresentationConvertInput,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const canonical = attemptedCanonical ?? (yield* canonicalFromStoredPart(tx, registration.partID))
        if (!canonical) return undefined
        const prepared = yield* loadPhysicalPrepared(tx, canonical, registration)
        if (!prepared?.settlement) return undefined
        return exactResult(prepared.settlement, prepared.invocation.envelope)
      }).pipe(Effect.exit, Effect.map(noEvent)),
    )
    .pipe(Effect.map((result) => result.result))
}

function loadPhysicalPrepared(
  tx: EventV2.Transaction,
  canonical: RepresentationConvertInput,
  registration: Registration,
) {
  return Effect.gen(function* () {
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical) return undefined
    const current = invocationFromPhysical(physical, canonical)
    if (!sameRegistration(current.envelope, registration)) return yield* invocationConflict(registration)
    const reservation = yield* LearningCommand.reserveRepresentationConversion(tx, current)
    if (reservation.type === "admitted" || reservation.type === "candidate") {
      yield* assertAdmittedPart(tx, canonical, registration, current.envelope.timeAdmitted)
      return { canonical, invocation: current } satisfies Prepared
    }
    yield* assertTerminalPart(tx, canonical, current.envelope, reservation.settlement)
    return { canonical, invocation: current, settlement: reservation.settlement } satisfies Prepared
  })
}

function reserveTransaction(
  tx: EventV2.Transaction,
  canonical: RepresentationConvertInput,
  invocation: LearningCommand.RepresentationConvertInvocation,
) {
  return Effect.gen(function* () {
    const reservation = yield* LearningCommand.reserveRepresentationConversion(tx, invocation)
    if (reservation.type === "candidate" || reservation.type === "admitted") {
      return noEvent({ canonical, invocation } satisfies Prepared)
    }
    yield* assertTerminalPart(tx, canonical, invocation.envelope, reservation.settlement)
    return noEvent({ canonical, invocation, settlement: reservation.settlement } satisfies Prepared)
  })
}

export function recoverAdmitted(events: EventV2.Interface) {
  return Effect.gen(function* () {
    const admitted = yield* events.transaction((tx) =>
      LearningCommand.listAdmitted(tx).pipe(
        Effect.map((rows) =>
          noEvent(rows.filter((row) => row.command_name === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY)),
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
          yield* assertRecoveredTerminalPart(tx, canonical, envelope, settlement.settlement)
          return noEvent(true)
        }
        const interrupted = requireInterruptedSettlement(settlement.settlement)
        return withPartEvent(
          true,
          terminalPart(canonical, envelope, interrupted),
          interrupted.settlementTime,
        )
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

export const interruptInvocation = Effect.fn("RepresentationCommandRuntime.interrupt")(function* (
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
    if (physical.command_name !== LearningCommand.REPRESENTATION_CONVERT_CAPABILITY) return noEvent(false)
    const canonical = yield* canonicalFromStoredPart(tx, registration.partID)
    if (!canonical) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    const prepared = yield* loadPhysicalPrepared(tx, canonical, registration)
    if (!prepared) return yield* Effect.die(`Learning invocation ${registration.partID} disappeared`)
    if (prepared.settlement) return noEvent(true)
    const settlement = yield* LearningCommand.recoverInterrupted(tx, {
      partID: registration.partID,
      settlement: yield* settlementMetadata(tx, registration.sessionID, prepared.invocation.envelope.timeAdmitted),
    })
    if (settlement.type === "replay") {
      yield* assertRecoveredTerminalPart(
        tx,
        canonical,
        prepared.invocation.envelope,
        settlement.settlement,
      )
      return noEvent(true)
    }
    const interrupted = requireInterruptedSettlement(settlement.settlement)
    const terminal = terminalPart(canonical, prepared.invocation.envelope, interrupted)
    return withPartEvent(true, terminal, interrupted.settlementTime)
  })
}

function makeInvocation(
  canonical: RepresentationConvertInput,
  registration: Registration,
  occurrenceID: LearningCommand.OccurrenceID,
  timeAdmitted: number,
): LearningCommand.RepresentationConvertInvocation {
  return {
    envelope: {
      occurrenceID,
      turnID: registration.turnID,
      inputID: registration.inputID,
      sessionID: registration.sessionID,
      parentUserMessageID: registration.parentUserMessageID,
      assistantMessageID: registration.assistantMessageID,
      partID: registration.partID,
      providerCallID: registration.callID,
      emissionOrdinal: registration.emissionOrdinal,
      capabilityIdentity: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
      capabilityVersion: LearningCommand.REPRESENTATION_CONVERT_VERSION,
      authorizationBasis: "learner_request",
      timeAdmitted,
    },
    command: {
      effectiveArtifactID: canonical.effectiveArtifactID,
      sourceRevisionID: canonical.sourceRevisionID,
    },
    producerKind: producerKind(canonical.relativePath),
  }
}

function invocationFromPhysical(
  physical: LearningCommand.PhysicalInvocation,
  canonical: RepresentationConvertInput,
): LearningCommand.RepresentationConvertInvocation {
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
    command: {
      effectiveArtifactID: canonical.effectiveArtifactID,
      sourceRevisionID: canonical.sourceRevisionID,
    },
    producerKind: producerKind(canonical.relativePath),
  }
}

function producerKind(relativePath: string): "local_pdf" | "configured_model" {
  return path.win32.extname(relativePath).toLowerCase() === ".pdf" ? "local_pdf" : "configured_model"
}

function pendingPart(input: RepresentationConvertInput, registration: Registration): SessionV1.ToolPart {
  return {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
    callID: registration.callID,
    state: { status: "pending", input, raw: JSON.stringify(input) },
  }
}

function terminalPart(
  input: RepresentationConvertInput,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.Settlement,
): SessionV1.ToolPart {
  const result = exactResult(settlement, envelope)
  const part = {
    id: envelope.partID,
    messageID: envelope.assistantMessageID,
    sessionID: envelope.sessionID,
    type: "tool",
    tool: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
    callID: envelope.providerCallID,
    state: {
      status: "completed",
      input,
      output: result.output,
      title: result.title,
      metadata: result.metadata,
      time: { start: envelope.timeAdmitted, end: settlement.settlementTime },
    },
  } satisfies SessionV1.ToolPart
  if (SemanticPresentation.readResult(part, true).type !== "valid") {
    throw new Error(`Constructed terminal learning Part ${envelope.partID} has an invalid semantic result`)
  }
  return part
}

export function exactResult(
  settlement: LearningCommand.Settlement,
  envelope: TerminalPartEnvelope,
): ExactResult {
  const presentation = LearningCommandPresentation.settlementResult(
    settlement,
    LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
    envelope,
  )
  const projected = SemanticPresentation.projectResultBasis(presentation.basis)
  if (!projected) throw new Error("Representation settlement has no valid semantic projection")
  return {
    title: projected.title,
    metadata: {
      command: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
      commandVersion: LearningCommand.REPRESENTATION_CONVERT_VERSION,
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: projected.durablySettled,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    },
    output: JSON.stringify(settlement),
  }
}

function failureCode(error: unknown): LearningCommand.RepresentationFailureCode {
  if (error instanceof RepresentationConversion.Failure) {
    if (error.code === "source_unavailable") return "source_unavailable"
    if (error.code === "ambiguous_content_root") return "ambiguous_content_root"
    if (error.code === "unsupported_media") return "unsupported_source"
    if (error.code === "source_too_large") return "source_too_large"
    if (error.code === "cancelled") return "cancelled"
    if (error.code === "producer_unavailable") return "producer_unavailable"
    if (error.code === "producer_failed") return "producer_failed"
    if (error.code === "producer_timeout") return "producer_timeout"
    if (error.code === "invalid_producer_output") return "invalid_producer_output"
    if (error.code === "source_ineligible") return "inactive"
    if (error.code === "stale_source" || error.code === "content_root_stale" || error.code === "input_mismatch") {
      return "stale"
    }
    return "validation_error"
  }
  if (error instanceof Artifact.NotFoundError || error instanceof ContentRoot.NotFoundError) return "source_unavailable"
  if (error instanceof Artifact.InactiveError) return "inactive"
  if (error instanceof ContentRoot.PathError) {
    if (error.reason === "budget_exceeded") return "source_too_large"
    return "unsupported_source"
  }
  if (error instanceof ContentRoot.UnsupportedFilesystemError) {
    return "unsupported_source"
  }
  if (
    error instanceof Artifact.ConflictError ||
    error instanceof Artifact.InvalidTransitionError ||
    error instanceof ContentRoot.ConflictError ||
    error instanceof ContentRoot.InvalidTransitionError
  ) {
    return "stale"
  }
  if (error instanceof Representation.ConflictError) return "semantic_conflict"
  if (error instanceof Representation.InvalidTransitionError) return "validation_error"
  return "publication_failed"
}

function canonicalFromStoredPart(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, partID)
    if (!row) return undefined
    return normalizeRepresentation(partFromRow(row).state.input)
  })
}

function settlementMetadata(tx: EventV2.Transaction, sessionID: string, floor: number) {
  return Effect.all({
    time: Effect.sync(() => Math.max(Date.now(), floor)),
    order: EventV2.nextSequence(tx, sessionID),
  })
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
  canonical: RepresentationConvertInput,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.Settlement,
) {
  return readPart(tx, envelope.partID).pipe(
    Effect.flatMap((part) =>
      isDeepStrictEqual(part, terminalPart(canonical, envelope, settlement)) &&
      SemanticPresentation.readResult(part, true).type === "valid"
        ? Effect.void
        : Effect.die(`Terminal learning Part ${envelope.partID} diverged from its exact settlement`),
    ),
  )
}

function assertRecoveredTerminalPart(
  tx: EventV2.Transaction,
  canonical: RepresentationConvertInput,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.PhysicalSettlement,
) {
  return readPart(tx, envelope.partID).pipe(
    Effect.flatMap((part) =>
      recoveredPartMatches(canonical, envelope, settlement, part) &&
      SemanticPresentation.readResult(part, true).type === "valid"
        ? Effect.void
        : Effect.die(`Recovered terminal learning Part ${envelope.partID} diverged from its physical settlement`),
    ),
  )
}

function recoveredPartMatches(
  canonical: RepresentationConvertInput,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.PhysicalSettlement,
  part: SessionV1.ToolPart,
) {
  if (part.state.status !== "completed") return false
  const metadata = part.state.metadata
  return (
    part.id === envelope.partID &&
    part.sessionID === envelope.sessionID &&
    part.messageID === envelope.assistantMessageID &&
    part.tool === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY &&
    part.callID === envelope.providerCallID &&
    isDeepStrictEqual(part.state.input, canonical) &&
    part.state.time.start === envelope.timeAdmitted &&
    part.state.time.end === settlement.settlementTime &&
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    metadata.outcome === settlement.outcome &&
    (settlement.outcome !== "error" || metadata.code === settlement.code)
  )
}

function requireInterruptedSettlement(
  settlement: LearningCommand.PhysicalSettlement,
): LearningCommand.ErrorSettlement {
  if (settlement.outcome !== "error" || settlement.code !== "interrupted") {
    throw new Error("New physical recovery did not produce the required interrupted settlement")
  }
  return {
    outcome: "error",
    code: "interrupted",
    settlementTime: settlement.settlementTime,
    settlementOrder: settlement.settlementOrder,
  }
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
  canonical: RepresentationConvertInput,
  registration: Registration,
  timeAdmitted: number,
) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
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
    envelope.capabilityIdentity === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY &&
    envelope.capabilityVersion === LearningCommand.REPRESENTATION_CONVERT_VERSION &&
    envelope.authorizationBasis === "learner_request"
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

function isExactResult(value: unknown): value is ExactResult {
  if (typeof value !== "object" || value === null) return false
  const result = value as Record<string, unknown>
  return typeof result.title === "string" && typeof result.output === "string" && typeof result.metadata === "object"
}

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [
    EventV2Bridge.node,
    Permission.node,
    Database.node,
    Artifact.node,
    ContentRoot.node,
    Representation.node,
    AppProcess.node,
    Auth.node,
    Config.node,
    Plugin.node,
    Provider.node,
    Session.node,
    SessionProjector.node,
  ],
})
