import { and, asc, eq, ne } from "drizzle-orm"
import { Effect } from "effect"
import { LearnerGoal } from "../learner-goal"
import { LearnerGoalCommandTable, LearnerGoalCommitSealTable } from "../learner-goal/sql"
import {
  admitPhysicalInvocation,
  appliedMutation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  invocationConflict,
  permissionErrorCode,
  requireMetadataFloor,
  requirePhysicalInvocation,
  requirePhysicalSettlement,
  requireSettlementMetadata,
  settlePhysicalInvocation,
} from "../learning-command/physical"
import { requireGoalSettlement } from "./learning-command-settlement"
import {
  type LearnerGoalInvocation,
  type PermissionOutcome,
  type Settlement,
  type SettlementMetadata,
} from "../learning-command/schema"
import { LearningCommandInvocationTable } from "../learning-command/sql"
import type { Transaction } from "../learning-command/transaction"
import type { PartID } from "../v1/session"

export const UPDATE_LEARNER_GOALS_CAPABILITY = "update_learner_goals"
export const UPDATE_LEARNER_GOALS_VERSION = 1

const identity = {
  name: UPDATE_LEARNER_GOALS_CAPABILITY,
  version: UPDATE_LEARNER_GOALS_VERSION,
} as const

export type GoalConfirmationResult =
  | {
      readonly type: "confirmation"
      readonly confirmation: LearnerGoal.ConfirmationSnapshot
      readonly preparedConfirmation: LearnerGoal.PreparedConfirmation
    }
  | { readonly type: "settled"; readonly settlement: Settlement }
  | { readonly type: "replay"; readonly settlement: Settlement }

export function lookupLearnerGoalCommandReservation(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerGoalCommandTable)
    .where(eq(LearnerGoalCommandTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

export function reserveLearnerGoals(tx: Transaction, input: LearnerGoalInvocation) {
  return Effect.gen(function* () {
    const fingerprint = invocationFingerprint(input)
    const physical = yield* findPhysicalInvocation(tx, input, fingerprint, identity)
    if (physical) {
      const command = yield* lookupLearnerGoalCommandReservation(tx, physical.part_id)
      if (
        !command ||
        JSON.stringify(command.command_snapshot) !== JSON.stringify(LearnerGoal.canonicalizeCommand(input.command))
      ) {
        return yield* invocationConflict(input.envelope)
      }
      if (isAccepted(input) && command.permission_request_id !== input.permissionRequestID) {
        return yield* invocationConflict(input.envelope)
      }
      if (physical.status === "admitted") return { type: "admitted" as const }
      return {
        type: "replay" as const,
        settlement: requireGoalSettlement(requirePhysicalSettlement(physical)),
      }
    }
    yield* admitPhysicalInvocation(tx, { envelope: input.envelope, fingerprint, command: identity })
    yield* tx
      .insert(LearnerGoalCommandTable)
      .values({
        invocation_part_id: input.envelope.partID,
        semantic_fingerprint: LearnerGoal.commandFingerprint(input.command, input.envelope.authorizationBasis),
        command_snapshot: LearnerGoal.canonicalizeCommand(input.command),
        permission_request_id: isAccepted(input) ? input.permissionRequestID : null,
      })
      .run()
      .pipe(Effect.orDie)
    const decision = yield* semanticDecision(tx, input)
    return decision.type === "candidate"
      ? ({ type: "candidate" } as const)
      : ({ type: "terminal", reason: decision.type } as const)
  })
}

/**
 * Reopens one already persisted V1 invocation for exact replay or interrupted
 * recovery. Unlike the historical producer above, this boundary can never
 * admit a physical invocation or create a learner_goal_command row.
 */
export function reopenHistoricalLearnerGoalInvocation(tx: Transaction, input: LearnerGoalInvocation) {
  return Effect.gen(function* () {
    const fingerprint = invocationFingerprint(input)
    const physical = yield* findPhysicalInvocation(tx, input, fingerprint, identity)
    if (!physical) return yield* Effect.die(`Historical learner Goal invocation ${input.envelope.partID} is absent`)
    const command = yield* lookupLearnerGoalCommandReservation(tx, physical.part_id)
    if (
      !command ||
      JSON.stringify(command.command_snapshot) !== JSON.stringify(LearnerGoal.canonicalizeCommand(input.command))
    ) {
      return yield* invocationConflict(input.envelope)
    }
    if (isAccepted(input) && command.permission_request_id !== input.permissionRequestID) {
      return yield* invocationConflict(input.envelope)
    }
    if (physical.status === "admitted") return { type: "admitted" as const }
    return {
      type: "replay" as const,
      settlement: requireGoalSettlement(requirePhysicalSettlement(physical)),
    }
  })
}

export function settleLearnerGoalReservation(
  tx: Transaction,
  input: LearnerGoalInvocation & { readonly settlement: SettlementMetadata },
) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireGoalSettlement(requirePhysicalSettlement(invocation)),
      }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const decision = yield* semanticDecision(tx, input)
    if (decision.type === "candidate") return { type: "candidate" as const }
    const settlement = yield* settlementForDecision(tx, decision, input.settlement)
    yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function prepareLearnerGoalConfirmation(
  tx: Transaction,
  input: LearnerGoalInvocation & { readonly settlement: SettlementMetadata },
): Effect.Effect<GoalConfirmationResult, Error> {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireGoalSettlement(requirePhysicalSettlement(invocation)),
      }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const decision = yield* semanticDecision(tx, input)
    if (decision.type !== "candidate") {
      const settlement = yield* settlementForDecision(tx, decision, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    if (!isAccepted(input)) {
      const settlement = errorSettlement("validation_error", input.settlement)
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
    const prepared = yield* LearnerGoal.prepareChangeSet(tx, input).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (prepared.type === "failure") {
      const settlement = goalErrorSettlement(prepared.error, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    if (prepared.value.type === "no_change") {
      const settlement = noChangeSettlement(prepared.value, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const confirmation = yield* LearnerGoal.prepareConfirmation(tx, input).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (confirmation.type === "failure") {
      const settlement = goalErrorSettlement(confirmation.error, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const command = yield* lookupLearnerGoalCommandReservation(tx, invocation.part_id)
    if (!command || command.confirmation_snapshot) return yield* invocationConflict(input.envelope)
    const snapshot = LearnerGoal.preparedConfirmationSnapshot(confirmation.value)
    if (!snapshot) return yield* Effect.die("Fresh Learner Goal confirmation proof is unreadable")
    return {
      type: "confirmation" as const,
      confirmation: snapshot,
      preparedConfirmation: confirmation.value,
    }
  })
}

export function settleLearnerGoals(
  tx: Transaction,
  input: LearnerGoalInvocation & {
    readonly permission: PermissionOutcome
    readonly settlement: SettlementMetadata
    readonly displayedConfirmation?: LearnerGoal.ConfirmationSnapshot
    readonly preparedConfirmation?: LearnerGoal.PreparedConfirmation
  },
) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireGoalSettlement(requirePhysicalSettlement(invocation)),
      }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
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
    const accepted = isAccepted(input)
    if (!accepted && (input.displayedConfirmation || input.preparedConfirmation)) {
      const settlement = errorSettlement("validation_error", input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const acceptedConfirmation =
      accepted && input.displayedConfirmation && input.preparedConfirmation
        ? LearnerGoal.acceptedPreparedConfirmation(input.preparedConfirmation, input, input.displayedConfirmation)
        : undefined
    if (accepted) {
      if (!acceptedConfirmation) {
        return yield* Effect.fail(
          new LearnerGoal.IntegrityError({ detail: "learner_goal_prepared_confirmation_invalid" }),
        )
      }
      const confirmation = yield* LearnerGoal.prepareConfirmation(tx, input).pipe(
        Effect.map((value) => ({ type: "success" as const, value })),
        Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
      )
      if (confirmation.type === "failure") {
        const settlement = goalErrorSettlement(confirmation.error, input.settlement)
        yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
        return { type: "settled" as const, settlement }
      }
      const currentConfirmation = LearnerGoal.preparedConfirmationSnapshot(confirmation.value)
      if (!currentConfirmation) return yield* Effect.die("Fresh Learner Goal confirmation proof is unreadable")
      if (!sameConfirmation(acceptedConfirmation, currentConfirmation)) {
        const settlement = errorSettlement("stale", input.settlement)
        yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
        return { type: "settled" as const, settlement }
      }
    }
    const prepared = yield* LearnerGoal.prepareChangeSet(tx, input).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (prepared.type === "failure") {
      const settlement = goalErrorSettlement(prepared.error, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    if (prepared.value.type === "no_change") {
      const settlement = noChangeSettlement(prepared.value, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const effect = yield* LearnerGoal.applyChangeSet(tx, prepared.value.value).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (effect.type === "failure") {
      const settlement = goalErrorSettlement(effect.error, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    if (
      (input.envelope.authorizationBasis === "learner_acceptance" && !acceptedConfirmation) ||
      (input.envelope.authorizationBasis === "learner_request" && acceptedConfirmation)
    ) {
      return yield* Effect.die("Applied learner Goal command has the wrong confirmation arm")
    }
    const receiptID = yield* insertPhysicalReceipt(tx, input.envelope, input.settlement)
    if (acceptedConfirmation && isAccepted(input)) {
      yield* tx
        .update(LearnerGoalCommandTable)
        .set({ confirmation_snapshot: acceptedConfirmation })
        .where(
          and(
            eq(LearnerGoalCommandTable.invocation_part_id, invocation.part_id),
            eq(LearnerGoalCommandTable.permission_request_id, input.permissionRequestID),
          ),
        )
        .run()
        .pipe(Effect.orDie)
    }
    yield* LearnerGoal.sealEffect(tx, {
      effect: effect.value,
      receiptID,
      invocationPartID: invocation.part_id,
      expectedRevisionSequence: prepared.value.value.revisionSequenceBefore,
    })
    const settlement = {
      outcome: "applied",
      goalKind: "learner_goal",
      receiptID,
      effectID: effect.value.id,
      authorizationBasis: effect.value.authorizationBasis,
      ...(accepted ? { confirmationRequestID: input.permissionRequestID } : {}),
      operations: effect.value.operations,
      acknowledgementTitle: effect.value.acknowledgementTitle,
      acknowledgementBody: effect.value.acknowledgementBody,
      frontierSequence: effect.value.frontierSequence,
      settlementTime: input.settlement.time,
      settlementOrder: input.settlement.order,
    } as const
    yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

type SemanticDecision =
  | { readonly type: "candidate" }
  | { readonly type: "already_applied"; readonly effect: LearnerGoal.EffectRead }
  | { readonly type: "semantic_conflict"; readonly effect: LearnerGoal.EffectRead }
  | { readonly type: "semantic_conflict"; readonly acceptedCandidate: true }
  | { readonly type: "context_refresh_required"; readonly acceptedCandidate: true }

function semanticDecision(tx: Transaction, input: LearnerGoalInvocation): Effect.Effect<SemanticDecision> {
  return Effect.gen(function* () {
    const resolution = yield* LearnerGoal.resolveSemantic(tx, {
      occurrenceID: input.envelope.occurrenceID,
      command: input.command,
      authorizationBasis: input.envelope.authorizationBasis,
    }).pipe(Effect.orDie)
    if (resolution.type !== "candidate") return resolution
    const acceptedCandidate = yield* tx
      .select({ semanticFingerprint: LearnerGoalCommandTable.semantic_fingerprint })
      .from(LearningCommandInvocationTable)
      .innerJoin(
        LearnerGoalCommandTable,
        eq(LearnerGoalCommandTable.invocation_part_id, LearningCommandInvocationTable.part_id),
      )
      .where(
        and(
          eq(LearningCommandInvocationTable.command_name, UPDATE_LEARNER_GOALS_CAPABILITY),
          eq(LearningCommandInvocationTable.occurrence_id, input.envelope.occurrenceID),
          eq(LearningCommandInvocationTable.authorization_basis, "learner_acceptance"),
          ne(LearningCommandInvocationTable.part_id, input.envelope.partID),
        ),
      )
      .orderBy(asc(LearningCommandInvocationTable.time_admitted), asc(LearningCommandInvocationTable.part_id))
      .get()
      .pipe(Effect.orDie)
    if (!acceptedCandidate) return resolution
    return acceptedCandidate.semanticFingerprint ===
      LearnerGoal.commandFingerprint(input.command, input.envelope.authorizationBasis)
      ? ({ type: "context_refresh_required", acceptedCandidate: true } as const)
      : ({ type: "semantic_conflict", acceptedCandidate: true } as const)
  })
}

function settlementForDecision(
  tx: Transaction,
  decision: Exclude<SemanticDecision, { readonly type: "candidate" }>,
  metadata: SettlementMetadata,
) {
  if ("acceptedCandidate" in decision) return Effect.succeed(errorSettlement(decision.type, metadata))
  if (decision.type === "semantic_conflict") {
    return requireMetadataFloor(metadata, decision.effect.timeCommitted).pipe(
      Effect.map(() => errorSettlement("semantic_conflict", metadata, { effectID: decision.effect.effectID })),
    )
  }
  if (decision.effect.schemaVersion !== 1) {
    return Effect.die(`Historical Goal replay ${decision.effect.effectID} resolved to a current V2 effect`)
  }
  const effect = decision.effect
  return Effect.gen(function* () {
    yield* requireMetadataFloor(metadata, effect.timeCommitted)
    const currentHeads = yield* Effect.forEach(
      [...new Set(effect.operations.map((operation) => operation.goalID))],
      (goalID) =>
        LearnerGoal.readCurrent(tx, goalID, metadata.time).pipe(
          Effect.orDie,
          Effect.flatMap((goal) =>
            goal
              ? Effect.succeed({ goalID, revisionID: goal.head.id, version: goal.head.version })
              : Effect.die(`Applied Goal ${goalID} has no current head`),
          ),
        ),
    )
    const command = effect.confirmation
      ? yield* tx
          .select({ permissionRequestID: LearnerGoalCommandTable.permission_request_id })
          .from(LearnerGoalCommitSealTable)
          .innerJoin(
            LearnerGoalCommandTable,
            eq(LearnerGoalCommandTable.invocation_part_id, LearnerGoalCommitSealTable.invocation_part_id),
          )
          .where(eq(LearnerGoalCommitSealTable.effect_id, effect.effectID))
          .get()
          .pipe(Effect.orDie)
      : undefined
    if (effect.confirmation && !command?.permissionRequestID) {
      return yield* Effect.die(`Accepted Goal effect ${effect.effectID} lost its permission request`)
    }
    return {
      outcome: "already_applied",
      goalKind: "learner_goal",
      receiptID: effect.receiptID,
      effectID: effect.effectID,
      authorizationBasis: effect.authorizationBasis,
      ...(command?.permissionRequestID ? { confirmationRequestID: command.permissionRequestID } : {}),
      operations: effect.operations,
      currentHeads,
      acknowledgementTitle: effect.acknowledgementTitle,
      acknowledgementBody: effect.acknowledgementBody,
      frontierSequence: effect.frontierSequence,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } as LearnerGoal.AlreadyAppliedSettlement
  })
}

function requireInvocation(tx: Transaction, input: LearnerGoalInvocation) {
  return Effect.gen(function* () {
    const row = yield* requirePhysicalInvocation(tx, input, invocationFingerprint(input), identity)
    const command = yield* lookupLearnerGoalCommandReservation(tx, row.part_id)
    if (
      !command ||
      JSON.stringify(command.command_snapshot) !== JSON.stringify(LearnerGoal.canonicalizeCommand(input.command))
    ) {
      return yield* invocationConflict(input.envelope)
    }
    if (isAccepted(input) && command.permission_request_id !== input.permissionRequestID) {
      return yield* invocationConflict(input.envelope)
    }
    return row
  })
}

function isAccepted(input: LearnerGoalInvocation): input is LearnerGoal.AcceptedInvocation {
  return input.envelope.authorizationBasis === "learner_acceptance"
}

function sameConfirmation(displayed: LearnerGoal.ConfirmationSnapshot, current: LearnerGoal.ConfirmationSnapshot) {
  const semanticBasis = (confirmation: LearnerGoal.ConfirmationSnapshot) => ({
    ...confirmation,
    courseBases: confirmation.courseBases.map((course) =>
      course.admission.type === "carried"
        ? {
            operationOrdinal: course.operationOrdinal,
            revisionRole: course.revisionRole,
            courseID: course.courseID,
            courseTitle: course.courseTitle,
            admission: course.admission,
          }
        : course,
    ),
  })
  return JSON.stringify(semanticBasis(displayed)) === JSON.stringify(semanticBasis(current))
}

function invocationFingerprint(input: LearnerGoalInvocation) {
  return new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        command: UPDATE_LEARNER_GOALS_CAPABILITY,
        commandVersion: UPDATE_LEARNER_GOALS_VERSION,
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
        semanticFingerprint: LearnerGoal.commandFingerprint(input.command, input.envelope.authorizationBasis),
        ...(isAccepted(input) ? { trusted: { permissionRequestID: input.permissionRequestID } } : {}),
      }),
    )
    .digest("hex")
}

function noChangeSettlement(
  prepared: Extract<LearnerGoal.Preparation, { readonly type: "no_change" }>,
  metadata: SettlementMetadata,
): LearnerGoal.NoChangeSettlement {
  return {
    outcome: "no_change",
    goalKind: "learner_goal",
    operations: prepared.operations,
    acknowledgementTitle: prepared.acknowledgementTitle,
    acknowledgementBody: prepared.acknowledgementBody,
    settlementTime: metadata.time,
    settlementOrder: metadata.order,
  }
}

function goalErrorSettlement(error: unknown, metadata: SettlementMetadata) {
  if (!(error instanceof LearnerGoal.InvalidCommandError)) return errorSettlement("validation_error", metadata)
  if (error.reason === "source_unavailable") return errorSettlement("source_unavailable", metadata)
  if (error.reason === "temporal_context_unavailable") {
    return errorSettlement("temporal_context_unavailable", metadata)
  }
  if (error.reason === "capacity_exceeded") return errorSettlement("capacity_exceeded", metadata)
  if (error.reason === "stale" || error.reason === "relation_conflict") return errorSettlement("stale", metadata)
  if (error.reason === "inactive") return errorSettlement("inactive", metadata)
  return errorSettlement("validation_error", metadata)
}
