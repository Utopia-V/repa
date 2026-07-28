import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { RetainedSteering } from "../retained-steering"
import {
  RetainedSteeringCommandTable,
  RetainedSteeringCommitSealTable,
} from "../retained-steering/sql"
import {
  admitPhysicalInvocation,
  appliedMutation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  invalidEnvelope,
  permissionErrorCode,
  requireMetadataFloor,
  requirePhysicalInvocation,
  requirePhysicalSettlement,
  requireSettlementMetadata,
  settlePhysicalInvocation,
} from "../learning-command/physical"
import { requireRetainedSettlement } from "./learning-command-settlement"
import {
  type PermissionOutcome,
  type RetainedSteeringInvocation,
  type SettlementMetadata,
} from "../learning-command/schema"
import { LearningCommandReceiptTable } from "../learning-command/sql"
import type { Transaction } from "../learning-command/transaction"

export const UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY = "update_retained_learning_steering"
export const UPDATE_RETAINED_LEARNING_STEERING_VERSION = 1

const identity = {
  name: UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
  version: UPDATE_RETAINED_LEARNING_STEERING_VERSION,
} as const

export function reserveRetainedSteering(tx: Transaction, input: RetainedSteeringInvocation) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const fingerprint = invocationFingerprint(input)
    const physical = yield* findPhysicalInvocation(tx, input, fingerprint, identity)
    if (physical) {
      if (physical.status === "admitted") return { type: "admitted" as const }
      return {
        type: "replay" as const,
        settlement: requireRetainedSettlement(requirePhysicalSettlement(physical)),
      }
    }
    yield* admitPhysicalInvocation(tx, { envelope: input.envelope, fingerprint, command: identity })
    yield* tx
      .insert(RetainedSteeringCommandTable)
      .values({
        invocation_part_id: input.envelope.partID,
        semantic_fingerprint: RetainedSteering.commandFingerprint(input.command),
      })
      .run()
      .pipe(Effect.orDie)
    const decision = yield* semanticDecision(tx, input)
    return decision.type === "candidate"
      ? ({ type: "candidate" } as const)
      : ({ type: "terminal", reason: decision.type } as const)
  })
}

export function settleRetainedSteeringReservation(
  tx: Transaction,
  input: RetainedSteeringInvocation & { readonly settlement: SettlementMetadata },
) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireRetainedSettlement(requirePhysicalSettlement(invocation)),
      }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    yield* RetainedSteering.latestCutAsOf(tx).pipe(
      Effect.flatMap((latestCutAsOf) => requireMetadataFloor(input.settlement, latestCutAsOf)),
    )
    const decision = yield* semanticDecision(tx, input)
    if (decision.type === "candidate") return { type: "candidate" as const }
    const settlement = yield* settlementForDecision(tx, decision, input.settlement)
    yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function settleRetainedSteering(
  tx: Transaction,
  input: RetainedSteeringInvocation & {
    readonly permission: PermissionOutcome
    readonly settlement: SettlementMetadata
  },
) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireRetainedSettlement(requirePhysicalSettlement(invocation)),
      }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    yield* RetainedSteering.latestCutAsOf(tx).pipe(
      Effect.flatMap((latestCutAsOf) => requireMetadataFloor(input.settlement, latestCutAsOf)),
    )
    const decision = yield* semanticDecision(tx, input)
    if (decision.type !== "candidate") {
      const settlement = yield* settlementForDecision(tx, decision, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const permissionError = permissionErrorCode(input.permission)
    if (permissionError) {
      const settlement = errorSettlement(permissionError, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const occupied = yield* appliedMutation(tx, input.envelope.assistantMessageID)
    if (occupied) {
      yield* requireMetadataFloor(input.settlement, occupied.timeSettled ?? 0)
      const settlement = errorSettlement("context_refresh_required", input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const prepared = yield* RetainedSteering.prepareTransition(tx, {
      occurrenceID: input.envelope.occurrenceID,
      command: input.command,
      settlement: input.settlement,
    }).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (prepared.type === "failure") {
      const settlement = retainedSteeringErrorSettlement(prepared.error, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    if (prepared.value.type === "no_change") {
      const settlement = {
        outcome: "no_change",
        steeringKind: "retained_steering",
        policyID: prepared.value.policyID,
        version: prepared.value.version,
        state: prepared.value.state,
        acknowledgementTitle: prepared.value.acknowledgementTitle,
        acknowledgementBody: prepared.value.acknowledgementBody,
        settlementTime: input.settlement.time,
        settlementOrder: input.settlement.order,
      } as const
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const effect = yield* RetainedSteering.applyTransition(tx, prepared.value.value).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (effect.type === "failure") {
      const settlement = retainedSteeringErrorSettlement(effect.error, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const receiptID = yield* insertPhysicalReceipt(tx, input.envelope, input.settlement)
    yield* RetainedSteering.sealTransition(tx, {
      transitionID: effect.value.id,
      receiptID,
      invocationPartID: invocation.part_id,
    })
    const settlement = {
      outcome: "applied",
      receiptID,
      effectID: effect.value.id,
      policyID: effect.value.policyID,
      version: effect.value.version,
      state: effect.value.state,
      acknowledgementTitle: effect.value.acknowledgementTitle,
      acknowledgementBody: effect.value.acknowledgementBody,
      settlementTime: input.settlement.time,
      settlementOrder: input.settlement.order,
    } as const
    yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

type SemanticDecision =
  | { readonly type: "candidate" }
  | { readonly type: "already_applied"; readonly transition: RetainedSteering.Transition }
  | { readonly type: "semantic_conflict"; readonly transition: RetainedSteering.Transition }

function semanticDecision(tx: Transaction, input: RetainedSteeringInvocation): Effect.Effect<SemanticDecision> {
  return Effect.gen(function* () {
    const resolution = yield* RetainedSteering.resolveSemantic(tx, {
      occurrenceID: input.envelope.occurrenceID,
      fingerprint: RetainedSteering.commandFingerprint(input.command),
    })
    if (resolution.type === "already_applied") {
      return { type: "already_applied" as const, transition: resolution.transition }
    }
    if (resolution.type === "semantic_conflict") {
      return { type: "semantic_conflict" as const, transition: resolution.transition }
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
    return requireMetadataFloor(metadata, decision.transition.timeCommitted).pipe(
      Effect.map(() => errorSettlement("semantic_conflict", metadata, { effectID: decision.transition.id })),
    )
  }
  return Effect.gen(function* () {
    yield* requireMetadataFloor(metadata, decision.transition.timeCommitted)
    const receipt = yield* tx
      .select({ id: LearningCommandReceiptTable.id })
      .from(RetainedSteeringCommitSealTable)
      .innerJoin(
        LearningCommandReceiptTable,
        eq(LearningCommandReceiptTable.id, RetainedSteeringCommitSealTable.receipt_id),
      )
      .where(eq(RetainedSteeringCommitSealTable.transition_id, decision.transition.id))
      .get()
      .pipe(Effect.orDie)
    if (!receipt) return yield* Effect.die("Applied retained steering transition has no immutable receipt")
    return {
      outcome: "already_applied",
      receiptID: receipt.id,
      effectID: decision.transition.id,
      policyID: decision.transition.policyID,
      version: decision.transition.version,
      state: decision.transition.state,
      acknowledgementTitle: decision.transition.acknowledgementTitle,
      acknowledgementBody: decision.transition.acknowledgementBody,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } as const
  })
}

function requireInvocation(tx: Transaction, input: RetainedSteeringInvocation) {
  return requirePhysicalInvocation(tx, input, invocationFingerprint(input), identity)
}

function requireAuthorizationBasis(input: RetainedSteeringInvocation) {
  return input.envelope.authorizationBasis === "learner_request"
    ? Effect.void
    : invalidEnvelope("invalid_authorization_basis")
}

function invocationFingerprint(input: RetainedSteeringInvocation) {
  return new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        command: UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        commandVersion: UPDATE_RETAINED_LEARNING_STEERING_VERSION,
        occurrenceID: input.envelope.occurrenceID,
        turnID: input.envelope.turnID,
        inputID: input.envelope.inputID,
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
        input: input.command,
      }),
    )
    .digest("hex")
}

function retainedSteeringErrorSettlement(error: unknown, metadata: SettlementMetadata) {
  if (error instanceof RetainedSteering.InvalidCommandError) return errorSettlement(error.reason, metadata)
  return errorSettlement("validation_error", metadata)
}
