import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Course } from "../course"
import { LearnerNavigation } from "../learner-navigation"
import {
  CourseRouteAnchorTransitionTable,
  DefaultCoursePreferenceTransitionTable,
  LearnerCourseRouteAnchorCommitSealTable,
  LearnerDefaultCourseCommandTable,
  LearnerDefaultCourseCommitSealTable,
} from "../learner-navigation/sql"
import {
  admitPhysicalInvocation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  invalidEnvelope,
  invocationConflict,
  occurrenceAvailable,
  permissionErrorCode,
  requireMetadataFloor,
  requirePhysicalInvocation,
  requirePhysicalSettlement,
  requireSettlementMetadata,
  settlePhysicalInvocation,
} from "../learning-command/physical"
import { requireNavigationSettlement } from "./learning-command-settlement"
import {
  type NavigationInvocation,
  type PermissionOutcome,
  type SetCourseRouteAnchorInvocation,
  type SetDefaultCoursePreferenceInvocation,
  type SettlementMetadata,
} from "../learning-command/schema"
import { LearningCommandReceiptTable } from "../learning-command/sql"
import type { Transaction } from "../learning-command/transaction"
import type { PartID } from "../v1/session"

export const SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY = "set_default_course_preference"
export const SET_DEFAULT_COURSE_PREFERENCE_VERSION = 1
export const SET_COURSE_ROUTE_ANCHOR_CAPABILITY = "set_course_route_anchor"
export const SET_COURSE_ROUTE_ANCHOR_VERSION = 1

export function lookupDefaultCoursePermissionRequestID(tx: Transaction, partID: PartID) {
  return tx
    .select({ permissionRequestID: LearnerDefaultCourseCommandTable.permission_request_id })
    .from(LearnerDefaultCourseCommandTable)
    .where(eq(LearnerDefaultCourseCommandTable.invocation_part_id, partID))
    .get()
    .pipe(
      Effect.map((row) => row?.permissionRequestID),
      Effect.orDie,
    )
}

export function reserveNavigation(tx: Transaction, input: NavigationInvocation) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const command = identity(input)
    const fingerprint = invocationFingerprint(input)
    const physical = yield* findPhysicalInvocation(tx, input, fingerprint, command)
    if (physical) {
      if (isDefaultNavigation(input)) {
        const permissionRequestID = yield* lookupDefaultCoursePermissionRequestID(tx, physical.part_id)
        if (permissionRequestID !== input.permissionRequestID) return yield* invocationConflict(input.envelope)
      }
      if (physical.status === "admitted") return { type: "admitted" as const }
      return {
        type: "replay" as const,
        settlement: requireNavigationSettlement(requirePhysicalSettlement(physical)),
      }
    }
    yield* admitPhysicalInvocation(tx, { envelope: input.envelope, fingerprint, command })
    if (isDefaultNavigation(input)) {
      yield* tx
        .insert(LearnerDefaultCourseCommandTable)
        .values({
          invocation_part_id: input.envelope.partID,
          permission_request_id: input.permissionRequestID,
        })
        .run()
        .pipe(Effect.orDie)
    }
    const decision = yield* semanticDecision(tx, input)
    return decision.type === "candidate"
      ? ({ type: "candidate" } as const)
      : ({ type: "terminal", reason: decision.type } as const)
  })
}

export function settleNavigationReservation(
  tx: Transaction,
  input: NavigationInvocation & { readonly settlement: SettlementMetadata },
) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireNavigationSettlement(requirePhysicalSettlement(invocation)),
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

export function settleNavigation(
  tx: Transaction,
  input: NavigationInvocation & {
    readonly permission: PermissionOutcome
    readonly settlement: SettlementMetadata
    readonly prepared?: LearnerNavigation.PreparedDefault | LearnerNavigation.PreparedAnchor
  },
) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireNavigationSettlement(requirePhysicalSettlement(invocation)),
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
    if (!(yield* occurrenceAvailable(tx, input.envelope))) {
      const settlement = errorSettlement("source_unavailable", input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    if (isDefaultNavigation(input)) {
      return yield* settleDefault(tx, invocation.part_id, input)
    }
    return yield* settleAnchor(tx, invocation.part_id, input)
  })
}

function settleDefault(
  tx: Transaction,
  partID: PartID,
  input: SetDefaultCoursePreferenceInvocation & {
    readonly settlement: SettlementMetadata
    readonly prepared?: LearnerNavigation.PreparedDefault | LearnerNavigation.PreparedAnchor
  },
) {
  return Effect.gen(function* () {
    const fresh = yield* LearnerNavigation.prepareDefaultInTransaction(
      tx,
      input.command,
      input.permissionRequestID,
    ).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (fresh.type === "failure") {
      const settlement = navigationErrorSettlement(fresh.error, input.settlement)
      yield* settlePhysicalInvocation(tx, partID, settlement)
      return { type: "settled" as const, settlement }
    }
    if (fresh.value.decision === "no_change") {
      const settlement = {
        outcome: "no_change",
        navigationKind: "default_course_preference",
        current: fresh.value.current,
        settlementTime: input.settlement.time,
        settlementOrder: input.settlement.order,
      } as const
      yield* settlePhysicalInvocation(tx, partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const prepared =
      input.prepared?.decision === "candidate" && "confirmation" in input.prepared ? input.prepared : undefined
    if (!prepared || JSON.stringify(prepared.confirmation) !== JSON.stringify(fresh.value.confirmation)) {
      const settlement = errorSettlement("stale", input.settlement)
      yield* settlePhysicalInvocation(tx, partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const applied = yield* LearnerNavigation.applyDefault(tx, {
      occurrenceID: input.envelope.occurrenceID,
      authorizationPartID: partID,
      command: input.command,
      permissionRequestID: input.permissionRequestID,
      confirmation: prepared.confirmation,
      proof: prepared.proof,
      trustedTime: input.settlement.time,
      commitOrder: input.settlement.order,
    }).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (applied.type === "failure") {
      const settlement = navigationErrorSettlement(applied.error, input.settlement)
      yield* settlePhysicalInvocation(tx, partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const receiptID = yield* insertPhysicalReceipt(tx, input.envelope, input.settlement)
    yield* tx
      .insert(LearnerDefaultCourseCommitSealTable)
      .values({ effect_id: applied.value.id, receipt_id: receiptID, invocation_part_id: partID })
      .run()
      .pipe(Effect.orDie)
    const current = yield* LearnerNavigation.readCurrentDefault(tx)
    const settlement = {
      outcome: "applied",
      navigationKind: "default_course_preference",
      receiptID,
      effectID: applied.value.id,
      effect: applied.value,
      current,
      confirmation: prepared.confirmation,
      settlementTime: input.settlement.time,
      settlementOrder: input.settlement.order,
    } as const
    yield* settlePhysicalInvocation(tx, partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

function settleAnchor(
  tx: Transaction,
  partID: PartID,
  input: SetCourseRouteAnchorInvocation & {
    readonly settlement: SettlementMetadata
    readonly prepared?: LearnerNavigation.PreparedDefault | LearnerNavigation.PreparedAnchor
  },
) {
  return Effect.gen(function* () {
    const fresh = yield* LearnerNavigation.prepareAnchorInTransaction(tx, input.command).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (fresh.type === "failure") {
      const settlement = navigationErrorSettlement(fresh.error, input.settlement)
      yield* settlePhysicalInvocation(tx, partID, settlement)
      return { type: "settled" as const, settlement }
    }
    if (fresh.value.decision === "no_change") {
      const settlement = {
        outcome: "no_change",
        navigationKind: "course_route_anchor",
        current: fresh.value.current,
        settlementTime: input.settlement.time,
        settlementOrder: input.settlement.order,
      } as const
      yield* settlePhysicalInvocation(tx, partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const prepared =
      input.prepared?.decision === "candidate" && !("confirmation" in input.prepared) ? input.prepared : undefined
    const applied = yield* LearnerNavigation.applyAnchor(tx, {
      occurrenceID: input.envelope.occurrenceID,
      command: input.command,
      proof: prepared?.proof,
      trustedTime: input.settlement.time,
      commitOrder: input.settlement.order,
    }).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (applied.type === "failure") {
      const settlement = navigationErrorSettlement(applied.error, input.settlement)
      yield* settlePhysicalInvocation(tx, partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const receiptID = yield* insertPhysicalReceipt(tx, input.envelope, input.settlement)
    yield* tx
      .insert(LearnerCourseRouteAnchorCommitSealTable)
      .values({ effect_id: applied.value.id, receipt_id: receiptID, invocation_part_id: partID })
      .run()
      .pipe(Effect.orDie)
    const current = yield* LearnerNavigation.readCurrentAnchor(tx, input.command.courseID)
    const settlement = {
      outcome: "applied",
      navigationKind: "course_route_anchor",
      receiptID,
      effectID: applied.value.id,
      effect: applied.value,
      current,
      settlementTime: input.settlement.time,
      settlementOrder: input.settlement.order,
    } as const
    yield* settlePhysicalInvocation(tx, partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

type SemanticDecision =
  | { readonly type: "candidate" }
  | {
      readonly type: "already_applied"
      readonly navigationKind: "default_course_preference"
      readonly resolution: Extract<LearnerNavigation.DefaultResolution, { readonly type: "already_applied" }>
    }
  | {
      readonly type: "already_applied"
      readonly navigationKind: "course_route_anchor"
      readonly resolution: Extract<LearnerNavigation.AnchorResolution, { readonly type: "already_applied" }>
    }
  | {
      readonly type: "semantic_conflict"
      readonly resolution:
        | Extract<LearnerNavigation.DefaultResolution, { readonly type: "semantic_conflict" }>
        | Extract<LearnerNavigation.AnchorResolution, { readonly type: "semantic_conflict" }>
    }

function semanticDecision(tx: Transaction, input: NavigationInvocation): Effect.Effect<SemanticDecision> {
  return Effect.gen(function* () {
    if (isDefaultNavigation(input)) {
      const resolution = yield* LearnerNavigation.resolveDefaultEffect(tx, {
        occurrenceID: input.envelope.occurrenceID,
        targetCourseID: input.command.target?.courseID ?? null,
      }).pipe(Effect.orDie)
      if (resolution.type === "already_applied") {
        return { type: "already_applied" as const, navigationKind: input.command.kind, resolution }
      }
      if (resolution.type === "semantic_conflict") return { type: "semantic_conflict" as const, resolution }
      return { type: "candidate" as const }
    }
    const resolution = yield* LearnerNavigation.resolveAnchorEffect(tx, {
      occurrenceID: input.envelope.occurrenceID,
      courseID: input.command.courseID,
      target: navigationTarget(input.command),
    }).pipe(Effect.orDie)
    if (resolution.type === "already_applied") {
      return { type: "already_applied" as const, navigationKind: input.command.kind, resolution }
    }
    if (resolution.type === "semantic_conflict") return { type: "semantic_conflict" as const, resolution }
    return { type: "candidate" as const }
  })
}

function settlementForDecision(
  tx: Transaction,
  decision: Exclude<SemanticDecision, { readonly type: "candidate" }>,
  metadata: SettlementMetadata,
) {
  if (decision.type === "semantic_conflict") {
    return requireMetadataFloor(metadata, decision.resolution.effect.timeCommitted).pipe(
      Effect.map(() => errorSettlement("semantic_conflict", metadata)),
    )
  }
  return Effect.gen(function* () {
    yield* requireMetadataFloor(
      metadata,
      Math.max(decision.resolution.effect.timeCommitted, decision.resolution.current.timeCommitted ?? 0),
    )
    if (decision.navigationKind === "default_course_preference") {
      const effect = decision.resolution.effect
      const receipt = yield* tx
        .select({
          id: LearningCommandReceiptTable.id,
          permissionRequestID: DefaultCoursePreferenceTransitionTable.permission_request_id,
          confirmation: DefaultCoursePreferenceTransitionTable.confirmation_snapshot,
        })
        .from(LearnerDefaultCourseCommitSealTable)
        .innerJoin(
          LearningCommandReceiptTable,
          eq(LearningCommandReceiptTable.id, LearnerDefaultCourseCommitSealTable.receipt_id),
        )
        .innerJoin(
          DefaultCoursePreferenceTransitionTable,
          eq(DefaultCoursePreferenceTransitionTable.id, LearnerDefaultCourseCommitSealTable.effect_id),
        )
        .where(eq(LearnerDefaultCourseCommitSealTable.effect_id, effect.id))
        .get()
        .pipe(Effect.orDie)
      if (!receipt) return yield* Effect.die("Applied navigation effect has no immutable receipt")
      if (!isDefaultConfirmationSnapshot(receipt.confirmation) || !receipt.permissionRequestID) {
        return yield* Effect.die("Default Course effect receipt has no exact confirmation snapshot")
      }
      return {
        outcome: "already_applied",
        navigationKind: decision.navigationKind,
        receiptID: receipt.id,
        effectID: effect.id,
        effect,
        current: decision.resolution.current,
        relation: decision.resolution.relation,
        confirmation: receipt.confirmation,
        settlementTime: metadata.time,
        settlementOrder: metadata.order,
      } as const
    }
    const effect = decision.resolution.effect
    const receipt = yield* tx
      .select({ id: LearningCommandReceiptTable.id })
      .from(LearnerCourseRouteAnchorCommitSealTable)
      .innerJoin(
        LearningCommandReceiptTable,
        eq(LearningCommandReceiptTable.id, LearnerCourseRouteAnchorCommitSealTable.receipt_id),
      )
      .where(eq(LearnerCourseRouteAnchorCommitSealTable.effect_id, effect.id))
      .get()
      .pipe(Effect.orDie)
    if (!receipt) return yield* Effect.die("Applied navigation effect has no immutable receipt")
    return {
      outcome: "already_applied",
      navigationKind: decision.navigationKind,
      receiptID: receipt.id,
      effectID: effect.id,
      effect,
      current: decision.resolution.current,
      relation: decision.resolution.relation,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } as const
  })
}

function requireInvocation(tx: Transaction, input: NavigationInvocation) {
  return Effect.gen(function* () {
    const row = yield* requirePhysicalInvocation(tx, input, invocationFingerprint(input), identity(input))
    if (isDefaultNavigation(input)) {
      const permissionRequestID = yield* lookupDefaultCoursePermissionRequestID(tx, row.part_id)
      if (permissionRequestID !== input.permissionRequestID) return yield* invocationConflict(input.envelope)
    }
    return row
  })
}

function requireAuthorizationBasis(input: NavigationInvocation) {
  const valid = isDefaultNavigation(input)
    ? input.envelope.authorizationBasis === "learner_acceptance"
    : input.envelope.authorizationBasis === "learner_request"
  return valid ? Effect.void : invalidEnvelope("invalid_authorization_basis")
}

function identity(input: NavigationInvocation) {
  return isDefaultNavigation(input)
    ? ({ name: SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, version: SET_DEFAULT_COURSE_PREFERENCE_VERSION } as const)
    : ({ name: SET_COURSE_ROUTE_ANCHOR_CAPABILITY, version: SET_COURSE_ROUTE_ANCHOR_VERSION } as const)
}

function isDefaultNavigation(input: NavigationInvocation): input is SetDefaultCoursePreferenceInvocation {
  return input.command.kind === "default_course_preference"
}

function isDefaultConfirmationSnapshot(
  snapshot: LearnerNavigation.DefaultConfirmationSnapshot | null,
): snapshot is LearnerNavigation.DefaultConfirmationSnapshot {
  return !!snapshot && "permissionRequestID" in snapshot
}

function navigationTarget(command: SetCourseRouteAnchorInvocation["command"]) {
  if (!command.target) return null
  return {
    courseID: command.courseID,
    viewID: command.target.viewID,
    revisionID: command.target.revisionID,
    itemID: command.target.itemID,
  }
}

function invocationFingerprint(input: NavigationInvocation) {
  return new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        command: identity(input).name,
        commandVersion: identity(input).version,
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
        ...(isDefaultNavigation(input) ? { trusted: { permissionRequestID: input.permissionRequestID } } : {}),
      }),
    )
    .digest("hex")
}

function navigationErrorSettlement(error: unknown, metadata: SettlementMetadata) {
  if (error instanceof LearnerNavigation.StaleStateError || error instanceof Course.ConflictError) {
    return errorSettlement("stale", metadata)
  }
  if (error instanceof Course.InactiveError) return errorSettlement("inactive", metadata)
  if (error instanceof Course.NotFoundError || error instanceof Course.InvalidTransitionError) {
    return errorSettlement("validation_error", metadata)
  }
  return errorSettlement("validation_error", metadata)
}
