import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Course } from "../course"
import { CourseSelectionAcceptanceCommitSealTable } from "../course/sql"
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
import { requireCourseSettlement } from "./learning-command-settlement"
import {
  type AcceptCourseViewRevisionInvocation,
  type ErrorSettlement,
  type PermissionOutcome,
  type SettlementMetadata,
} from "../learning-command/schema"
import { LearningCommandReceiptTable } from "../learning-command/sql"
import type { Transaction } from "../learning-command/transaction"

export const ACCEPT_COURSE_VIEW_REVISION_CAPABILITY = "accept_course_view_revision"
export const ACCEPT_COURSE_VIEW_REVISION_VERSION = 1

const identity = {
  name: ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
  version: ACCEPT_COURSE_VIEW_REVISION_VERSION,
} as const

export function reserveAcceptance(tx: Transaction, input: AcceptCourseViewRevisionInvocation) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const fingerprint = invocationFingerprint(input)
    const physical = yield* findPhysicalInvocation(tx, input, fingerprint, identity)
    if (physical) {
      if (physical.status === "admitted") return { type: "admitted" as const }
      return {
        type: "replay" as const,
        settlement: requireCourseSettlement(requirePhysicalSettlement(physical)),
      }
    }
    yield* admitPhysicalInvocation(tx, { envelope: input.envelope, fingerprint, command: identity })
    return yield* reservationDecision(tx, input)
  })
}

export function settleReservation(
  tx: Transaction,
  input: AcceptCourseViewRevisionInvocation & { readonly settlement: SettlementMetadata },
) {
  return Effect.gen(function* () {
    yield* requireAuthorizationBasis(input)
    const invocation = yield* requireInvocation(tx, input)
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: requireCourseSettlement(requirePhysicalSettlement(invocation)),
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

export function settleAcceptance(
  tx: Transaction,
  input: AcceptCourseViewRevisionInvocation & {
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
        settlement: requireCourseSettlement(requirePhysicalSettlement(invocation)),
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
    const applied = yield* Course.applySelectionAcceptance(tx, {
      occurrenceID: input.envelope.occurrenceID,
      command: input.command,
      trustedTime: input.settlement.time,
    }).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (applied.type === "failure") {
      const settlement = courseErrorSettlement(applied.error, input.settlement)
      yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
      return { type: "settled" as const, settlement }
    }
    const receiptID = yield* insertPhysicalReceipt(tx, input.envelope, input.settlement)
    yield* tx
      .insert(CourseSelectionAcceptanceCommitSealTable)
      .values({
        effect_id: applied.value.id,
        receipt_id: receiptID,
        invocation_part_id: input.envelope.partID,
      })
      .run()
      .pipe(Effect.orDie)
    const settlement = {
      outcome: "applied",
      receiptID,
      effectID: applied.value.id,
      courseID: applied.value.courseID,
      revisionID: applied.value.revisionID,
      previousSelection: applied.value.previousSelection,
      committedSelection: applied.value.committedSelection,
      settlementTime: input.settlement.time,
      settlementOrder: input.settlement.order,
    } as const
    yield* settlePhysicalInvocation(tx, invocation.part_id, settlement)
    return { type: "settled" as const, settlement }
  })
}

function reservationDecision(tx: Transaction, input: AcceptCourseViewRevisionInvocation) {
  return semanticDecision(tx, input).pipe(
    Effect.map(
      (decision) =>
        decision.type === "candidate"
          ? ({ type: "candidate" } as const)
          : ({ type: "terminal", reason: decision.type } as const),
    ),
  )
}

type SemanticDecision =
  | { readonly type: "candidate" }
  | {
      readonly type: "already_applied"
      readonly resolution: Extract<Course.SelectionAcceptanceResolution, { readonly type: "already_applied" }>
    }
  | {
      readonly type: "semantic_conflict"
      readonly resolution: Extract<Course.SelectionAcceptanceResolution, { readonly type: "semantic_conflict" }>
    }
  | { readonly type: "context_refresh_required"; readonly timeSettled: number }

function semanticDecision(tx: Transaction, input: AcceptCourseViewRevisionInvocation): Effect.Effect<SemanticDecision> {
  return Effect.gen(function* () {
    const resolution = yield* Course.resolveSelectionAcceptance(tx, {
      occurrenceID: input.envelope.occurrenceID,
      courseID: input.command.courseID,
      revisionID: input.command.revisionID,
    }).pipe(Effect.orDie)
    if (resolution.type === "already_applied") return { type: "already_applied" as const, resolution }
    if (resolution.type === "semantic_conflict") return { type: "semantic_conflict" as const, resolution }
    const occupied = yield* appliedMutation(tx, input.envelope.assistantMessageID)
    if (occupied) {
      return { type: "context_refresh_required" as const, timeSettled: occupied.timeSettled ?? 0 }
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
    return requireMetadataFloor(metadata, decision.resolution.effect.timeCommitted).pipe(
      Effect.map(() =>
        errorSettlement("semantic_conflict", metadata, {
          effectID: decision.resolution.effect.id,
          acceptedRevisionID: decision.resolution.effect.revisionID,
        }),
      ),
    )
  }
  if (decision.type === "context_refresh_required") {
    return requireMetadataFloor(metadata, decision.timeSettled).pipe(
      Effect.map(() => errorSettlement("context_refresh_required", metadata)),
    )
  }
  return Effect.gen(function* () {
    yield* requireMetadataFloor(
      metadata,
      Math.max(decision.resolution.effect.timeCommitted, decision.resolution.currentSelectionTime),
    )
    const receipt = yield* tx
      .select({ id: LearningCommandReceiptTable.id })
      .from(CourseSelectionAcceptanceCommitSealTable)
      .innerJoin(
        LearningCommandReceiptTable,
        eq(LearningCommandReceiptTable.id, CourseSelectionAcceptanceCommitSealTable.receipt_id),
      )
      .where(eq(CourseSelectionAcceptanceCommitSealTable.effect_id, decision.resolution.effect.id))
      .get()
      .pipe(Effect.orDie)
    if (!receipt) return yield* Effect.die("Applied Course effect has no immutable receipt")
    return {
      outcome: "already_applied",
      receiptID: receipt.id,
      effectID: decision.resolution.effect.id,
      courseID: decision.resolution.effect.courseID,
      revisionID: decision.resolution.effect.revisionID,
      previousSelection: decision.resolution.effect.previousSelection,
      committedSelection: decision.resolution.effect.committedSelection,
      currentSelection: decision.resolution.currentSelection,
      relation: decision.resolution.relation,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } as const
  })
}

function requireInvocation(tx: Transaction, input: AcceptCourseViewRevisionInvocation) {
  return requirePhysicalInvocation(tx, input, invocationFingerprint(input), identity)
}

function requireAuthorizationBasis(input: AcceptCourseViewRevisionInvocation) {
  return input.envelope.authorizationBasis === "learner_request" ||
    input.envelope.authorizationBasis === "learner_acceptance"
    ? Effect.void
    : invalidEnvelope("invalid_authorization_basis")
}

function invocationFingerprint(input: AcceptCourseViewRevisionInvocation) {
  return new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        command: ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        commandVersion: ACCEPT_COURSE_VIEW_REVISION_VERSION,
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
          courseID: input.command.courseID,
          revisionID: input.command.revisionID,
          expectedCourseVersion: input.command.expectedCourseVersion,
          expectedSelectionRevisionID: input.command.expectedSelectionRevisionID ?? null,
          expectedSelectionVersion: input.command.expectedSelectionVersion,
          expectedViewVersion: input.command.expectedViewVersion,
          expectedRevisionVersion: input.command.expectedRevisionVersion,
        },
      }),
    )
    .digest("hex")
}

function courseErrorSettlement(error: Course.Error, metadata: SettlementMetadata): ErrorSettlement {
  if (error._tag === "Course.ConflictError") {
    return errorSettlement("stale", metadata, { entity: error.entity, id: error.id })
  }
  if (error._tag === "Course.InactiveError") {
    return errorSettlement("inactive", metadata, { entity: error.entity, id: error.id })
  }
  return errorSettlement("validation_error", metadata)
}
