import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { RepresentationSchema } from "../representation/schema"
import {
  RepresentationCommandCommitSealTable,
  RepresentationEffectTable,
  RepresentationRevisionTable,
} from "../representation/sql"
import {
  admitPhysicalInvocation,
  appliedMutation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  invalidEnvelope,
  occurrenceAvailable,
  permissionErrorCode,
  requireMetadataFloor,
  requirePhysicalInvocation,
  requirePhysicalSettlement,
  requireSettlementMetadata,
  settlePhysicalInvocation,
} from "../learning-command/physical"
import {
  requireRepresentationSettlement,
} from "./learning-command-settlement"
import type { RepresentationFailureCode } from "./learning-command-failure-code-v12"
import {
  InvocationConflictError,
  InvocationNotFoundError,
  type PermissionOutcome,
  type ReceiptID,
  type RepresentationAlreadyAppliedSettlement,
  type RepresentationAppliedSettlement,
  type RepresentationConvertInvocation,
  type Settlement,
  type SettlementMetadata,
} from "../learning-command/schema"
import { LearningCommandReceiptTable } from "../learning-command/sql"
import type { Transaction } from "../learning-command/transaction"

export const REPRESENTATION_CONVERT_CAPABILITY = "representation.convert"
export const REPRESENTATION_CONVERT_VERSION = 1

const identity = {
  name: REPRESENTATION_CONVERT_CAPABILITY,
  version: REPRESENTATION_CONVERT_VERSION,
} as const

export type RepresentationCandidateDecision =
  | { readonly type: "candidate" }
  | { readonly type: "terminal"; readonly reason: "context_refresh_required" }
  | { readonly type: "replay"; readonly settlement: Settlement }

export function representationConversionOperationIdentity(input: RepresentationConvertInvocation) {
  return `learning-command:${REPRESENTATION_CONVERT_CAPABILITY}:v${REPRESENTATION_CONVERT_VERSION}:${new Bun.CryptoHasher(
    "sha256",
  )
    .update(
      JSON.stringify({
        occurrenceID: input.envelope.occurrenceID,
        effectiveArtifactID: input.command.effectiveArtifactID,
        producerKind: input.producerKind,
      }),
    )
    .digest("hex")}`
}

export function reserveRepresentationConversion(tx: Transaction, input: RepresentationConvertInvocation) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const fingerprint = invocationFingerprint(input)
    const physical = yield* findPhysicalInvocation(tx, input, fingerprint, identity)
    if (physical) {
      if (physical.status === "admitted") return { type: "admitted" as const }
      return {
        type: "replay" as const,
        settlement: requireRepresentationSettlement(requirePhysicalSettlement(physical)),
      }
    }
    yield* admitPhysicalInvocation(tx, { envelope: input.envelope, fingerprint, command: identity })
    return { type: "candidate" as const }
  })
}

export function decideRepresentationCandidate(
  tx: Transaction,
  input: RepresentationConvertInvocation,
) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireRepresentationSettlement(requirePhysicalSettlement(invocation)),
      }
    }
    if (yield* appliedMutation(tx, input.envelope.assistantMessageID)) {
      return { type: "terminal" as const, reason: "context_refresh_required" as const }
    }
    return { type: "candidate" as const }
  })
}

export function settleRepresentationCandidate(
  tx: Transaction,
  input: RepresentationConvertInvocation & {
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
        settlement: requireRepresentationSettlement(requirePhysicalSettlement(invocation)),
      }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    if (yield* appliedMutation(tx, input.envelope.assistantMessageID)) {
      const settlement = errorSettlement("context_refresh_required", input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const permissionError = permissionErrorCode(input.permission)
    if (permissionError) {
      const settlement = errorSettlement(permissionError, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    if (!(yield* occurrenceAvailable(tx, input.envelope))) {
      const settlement = errorSettlement("source_unavailable", input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    return { type: "candidate" as const }
  })
}

export function settleRepresentationFailure(
  tx: Transaction,
  input: RepresentationConvertInvocation & {
    readonly code: RepresentationFailureCode
    readonly settlement: SettlementMetadata
  },
) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireRepresentationSettlement(requirePhysicalSettlement(invocation)),
      }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const settlement = errorSettlement(input.code, input.settlement)
    yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function settleRepresentationSuccess(
  tx: Transaction,
  input: RepresentationConvertInvocation & {
    readonly representationRevisionID: RepresentationSchema.RevisionID
    readonly domainResult: "new" | "already_accepted"
    readonly settlement: SettlementMetadata
  },
) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireRepresentationSettlement(requirePhysicalSettlement(invocation)),
      }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const representation = yield* requireRepresentationResult(tx, input)
    const receipt = yield* tx
      .select({
        id: LearningCommandReceiptTable.id,
        occurrence_id: LearningCommandReceiptTable.occurrence_id,
        capability_identity: LearningCommandReceiptTable.capability_identity,
        capability_version: LearningCommandReceiptTable.capability_version,
        authorization_basis: LearningCommandReceiptTable.authorization_basis,
        invocation_part_id: LearningCommandReceiptTable.invocation_part_id,
        time_committed: LearningCommandReceiptTable.time_committed,
        commit_order: LearningCommandReceiptTable.commit_order,
      })
      .from(RepresentationCommandCommitSealTable)
      .innerJoin(
        LearningCommandReceiptTable,
        eq(LearningCommandReceiptTable.id, RepresentationCommandCommitSealTable.receipt_id),
      )
      .where(eq(RepresentationCommandCommitSealTable.effect_id, representation.effectID))
      .get()
      .pipe(Effect.orDie)
    if (input.domainResult === "already_accepted") {
      if (!receipt) return yield* Effect.die("Accepted Representation learning effect has no immutable receipt")
      yield* requireRepresentationReceipt(receipt, input, representation)
      yield* requireMetadataFloor(input.settlement, representation.timeAccepted)
      const settlement = representationSettlement("already_applied", receipt.id, representation, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    if (receipt) return yield* Effect.die("New Representation learning effect already has an immutable receipt")
    yield* requireMetadataFloor(input.settlement, representation.timeAccepted)
    if (yield* appliedMutation(tx, input.envelope.assistantMessageID)) {
      return yield* Effect.die("Representation committed after its model-operation mutation slot was occupied")
    }
    if (!(yield* occurrenceAvailable(tx, input.envelope))) {
      return yield* Effect.die("Representation committed after its causal learner occurrence became unavailable")
    }
    const receiptID = yield* insertPhysicalReceipt(tx, input.envelope, input.settlement)
    yield* tx
      .insert(RepresentationCommandCommitSealTable)
      .values({
        effect_id: representation.effectID,
        receipt_id: receiptID,
        invocation_part_id: input.envelope.partID,
      })
      .run()
      .pipe(Effect.orDie)
    const settlement = representationSettlement("applied", receiptID, representation, input.settlement)
    yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

function requireRepresentationResult(
  tx: Transaction,
  input: RepresentationConvertInvocation & {
    readonly representationRevisionID: RepresentationSchema.RevisionID
    readonly domainResult: "new" | "already_accepted"
  },
) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({
        representationRevisionID: RepresentationRevisionTable.id,
        effectID: RepresentationRevisionTable.effect_id,
        effectiveArtifactID: RepresentationRevisionTable.effective_artifact_id,
        sourceRevisionID: RepresentationRevisionTable.source_revision_id,
        producerKind: RepresentationRevisionTable.producer_kind,
        creationBasis: RepresentationRevisionTable.creation_basis,
        creationIdentity: RepresentationRevisionTable.creation_identity,
        authorizationBasis: RepresentationRevisionTable.authorization_basis,
        deliveryMode: RepresentationRevisionTable.delivery_mode,
        causalOccurrenceID: RepresentationRevisionTable.causal_occurrence_id,
        causalInvocationPartID: RepresentationRevisionTable.causal_invocation_part_id,
        timeAccepted: RepresentationRevisionTable.time_accepted,
        effectOperationIdentity: RepresentationEffectTable.operation_identity,
      })
      .from(RepresentationRevisionTable)
      .innerJoin(RepresentationEffectTable, eq(RepresentationEffectTable.id, RepresentationRevisionTable.effect_id))
      .where(eq(RepresentationRevisionTable.id, input.representationRevisionID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* Effect.die("Representation settlement names no accepted Revision")
    if (
      row.effectiveArtifactID !== input.command.effectiveArtifactID ||
      row.sourceRevisionID !== input.command.sourceRevisionID ||
      row.producerKind !== input.producerKind ||
      row.creationBasis !== "learning_command" ||
      row.deliveryMode !== "model_tool" ||
      row.creationIdentity !== representationConversionOperationIdentity(input) ||
      row.effectOperationIdentity !== row.creationIdentity ||
      row.authorizationBasis !== input.envelope.authorizationBasis ||
      row.causalOccurrenceID !== input.envelope.occurrenceID ||
      (input.domainResult === "new" && row.causalInvocationPartID !== input.envelope.partID) ||
      (input.domainResult === "already_accepted" && row.causalInvocationPartID === null)
    ) {
      return yield* Effect.die("Accepted Representation does not match its learning-command authority")
    }
    return row
  })
}

function requireRepresentationReceipt(
  receipt: Pick<
    typeof LearningCommandReceiptTable.$inferSelect,
    | "occurrence_id"
    | "capability_identity"
    | "capability_version"
    | "authorization_basis"
    | "invocation_part_id"
    | "time_committed"
    | "commit_order"
  >,
  input: RepresentationConvertInvocation,
  representation: Effect.Success<ReturnType<typeof requireRepresentationResult>>,
) {
  if (
    receipt.occurrence_id !== input.envelope.occurrenceID ||
    receipt.capability_identity !== REPRESENTATION_CONVERT_CAPABILITY ||
    receipt.capability_version !== REPRESENTATION_CONVERT_VERSION ||
    receipt.authorization_basis !== input.envelope.authorizationBasis ||
    receipt.invocation_part_id !== representation.causalInvocationPartID ||
    receipt.time_committed < representation.timeAccepted ||
    receipt.commit_order < 0
  ) {
    return Effect.die("Representation effect receipt does not match its semantic address")
  }
  return Effect.void
}

function representationSettlement(
  outcome: "applied" | "already_applied",
  receiptID: ReceiptID,
  representation: Effect.Success<ReturnType<typeof requireRepresentationResult>>,
  metadata: SettlementMetadata,
): RepresentationAppliedSettlement | RepresentationAlreadyAppliedSettlement {
  const settlement = {
    receiptID,
    effectID: representation.effectID,
    representationRevisionID: representation.representationRevisionID,
    effectiveArtifactID: representation.effectiveArtifactID,
    sourceRevisionID: representation.sourceRevisionID,
    producerKind: representation.producerKind,
    settlementTime: metadata.time,
    settlementOrder: metadata.order,
  }
  if (outcome === "applied") return { outcome, ...settlement }
  return { outcome, ...settlement }
}

function requireInvocation(tx: Transaction, input: RepresentationConvertInvocation) {
  return requirePhysicalInvocation(tx, input, invocationFingerprint(input), identity)
}

function requireAuthorizationBasis(input: RepresentationConvertInvocation) {
  return input.envelope.authorizationBasis === "learner_request"
    ? Effect.void
    : invalidEnvelope("invalid_authorization_basis")
}

function invocationFingerprint(input: RepresentationConvertInvocation) {
  return new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        command: REPRESENTATION_CONVERT_CAPABILITY,
        commandVersion: REPRESENTATION_CONVERT_VERSION,
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
        input: {
          effectiveArtifactID: input.command.effectiveArtifactID,
          sourceRevisionID: input.command.sourceRevisionID,
        },
        trusted: { producerKind: input.producerKind },
      }),
    )
    .digest("hex")
}
