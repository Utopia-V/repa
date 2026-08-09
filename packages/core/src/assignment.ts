export * as Assignment from "./assignment"

import { Turn } from "@opencode-ai/schema/turn"
import { and, asc, count, desc, eq, gt, inArray, notExists, or, sql } from "drizzle-orm"
import { Cause, Context, Effect, Layer } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Artifact } from "./artifact"
import {
  localDateAtResolvedZone,
  resolveLocalInstant,
  resolveZone,
  validDate,
  validateSourceExpression,
  type SourceZone as CivilSourceZone,
} from "./civil-time"
import { Course } from "./course"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { LearningFrontier } from "./learning-frontier"
import { canonicalFingerprint, canonicalJson, toJsonValue, utf8Bytes } from "./learning-context/schema"
import { Occurrence } from "./learning-command/occurrence"
import { AdmittedLearnerOccurrenceTable } from "./learning-command/occurrence.sql"
import {
  admitPhysicalInvocation,
  appliedMutation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  invocationConflict,
  lookupPhysicalInvocation,
  requirePhysicalSettlement,
  requireSettlementMetadata,
  settlePhysicalInvocation,
} from "./learning-command/physical"
import type { InvocationEnvelope, SettlementMetadata } from "./learning-command/physical-schema"
import type { SourceTemporalContext } from "./learning-command/occurrence-schema"
import { LearningCommandInvocationTable } from "./learning-command/sql"
import type { Transaction } from "./learning-command/transaction"
import { Representation } from "./representation"
import { MessageTable, PartTable } from "./session/sql"
import { TurnLifecycle, type ValidatedAgentActionRegistration } from "./turn/turn"
import { TurnInputTable, TurnTable } from "./turn/sql"
import type { PermissionV1 } from "./v1/permission"
import type { MessageID, PartID, SessionV1 } from "./v1/session"
import {
  AssignmentCapabilityIssueTable,
  AssignmentCapabilitySettlementTable,
  AssignmentCommitSealTable,
  AssignmentDispositionTable,
  AssignmentEffectTable,
  AssignmentNoChangeSealTable,
  AssignmentRevisionScopeTable,
  AssignmentRevisionTable,
  AssignmentTable,
} from "./assignment/sql"
import {
  AssignmentID,
  EffectID,
  IntegrityError,
  InvalidCommandError,
  MAX_CONTEXT_ENTRIES,
  MAX_EXCERPT_BYTES,
  MAX_INTENTS,
  MAX_LEARNING_CONTEXT_BYTES,
  MAX_RATIONALE_BYTES,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_SCOPE_COURSES,
  MAX_SEMANTIC_VALUE_BYTES,
  MAX_SUMMARY_BYTES,
  RevisionID,
  createAssignmentID,
  createEffectID,
  createRevisionID,
  type AgentAction,
  type AlreadyAppliedSettlement,
  type AppliedSettlement,
  type Assignment as AssignmentSnapshot,
  type AssignmentRevisionRef,
  type Candidate,
  type CanonicalChangeSet,
  type CapabilityOutcome,
  type ChangeProjection,
  type ChangeSetCommand,
  type Comparator,
  type ContextProjection,
  type DueBasis,
  type DueBasisIntent,
  type DueRelation,
  type EffectiveSourceBasis,
  type ExpectedHead,
  type ExpiryRelation,
  type ExcerptIntent,
  type Intent,
  type IntentResultProjection,
  type Invocation,
  type InvocationVersion,
  type MaterializedIntent,
  type MutationAuthorshipBasis,
  type NoChangeSettlement,
  type OwnerCut,
  type OwnerReadReference,
  type ProjectionAtCut,
  type ReadPage,
  type ReadQuery,
  type RelationAction,
  type Revision,
  type Scope,
  type ScopeCurrentRelation,
  type SemanticSnapshot,
  type SemanticSnapshotIntent,
  type SourceAdmissionBasis,
  type SourceAction,
  type SourceBasisRelation,
  type SourceObservationIntent,
  type SourceStatusAtCut,
  type TemporalBoundary,
  type TemporalBoundaryIntent,
} from "./assignment/schema"

export {
  AssignmentID,
  EffectID,
  IntegrityError,
  InvalidCommandError,
  MAX_CONTEXT_ENTRIES,
  MAX_EXCERPT_BYTES,
  MAX_INTENTS,
  MAX_LEARNING_CONTEXT_BYTES,
  MAX_RATIONALE_BYTES,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_SCOPE_COURSES,
  MAX_SEMANTIC_VALUE_BYTES,
  MAX_SUMMARY_BYTES,
  RevisionID,
  createAssignmentID,
  createEffectID,
  createRevisionID,
} from "./assignment/schema"
export type {
  AlreadyAppliedSettlement,
  AppliedSettlement,
  AssignmentRevisionRef,
  Candidate,
  CanonicalChangeSet,
  ChangeProjection,
  ChangeSetCommand,
  ContextProjection,
  DueBasis,
  DueRelation,
  EffectiveSourceBasis,
  ExpiryRelation,
  Invocation,
  InvocationVersion,
  IntentResultProjection,
  MaterializedIntent,
  NoChangeSettlement,
  OwnerCut,
  ProjectionAtCut,
  ReadPage,
  ReadQuery,
  Revision,
  Scope,
  SemanticSnapshot,
  SourceAdmissionBasis,
  SourceStatusAtCut,
} from "./assignment/schema"

export const UPDATE_CAPABILITY = "update_assignment"
export const UPDATE_VERSION = 1
export const READ_CAPABILITY = "assignment_read"
export const READ_VERSION = 1
export const PERMISSION_PATTERN = "assignment"

const identity = { name: UPDATE_CAPABILITY, version: UPDATE_VERSION } as const

const committedEffect = sql`EXISTS (
  SELECT 1
  FROM assignment_commit_seal AS assignment_seal
  JOIN learning_command_receipt AS assignment_receipt
    ON assignment_receipt.id = assignment_seal.receipt_id
  JOIN learning_command_invocation AS assignment_invocation
    ON assignment_invocation.part_id = assignment_seal.invocation_part_id
  WHERE assignment_seal.effect_id = ${AssignmentEffectTable.id}
    AND assignment_receipt.invocation_part_id = assignment_seal.invocation_part_id
    AND assignment_invocation.receipt_id = assignment_receipt.id
    AND assignment_invocation.status = 'applied'
)`

const committedRevision = sql`EXISTS (
  SELECT 1
  FROM assignment_effect AS assignment_effect
  JOIN assignment_commit_seal AS assignment_seal ON assignment_seal.effect_id = assignment_effect.id
  JOIN learning_command_receipt AS assignment_receipt ON assignment_receipt.id = assignment_seal.receipt_id
  JOIN learning_command_invocation AS assignment_invocation
    ON assignment_invocation.part_id = assignment_seal.invocation_part_id
      AND assignment_invocation.receipt_id = assignment_receipt.id
      AND assignment_invocation.status = 'applied'
  WHERE assignment_effect.id = ${AssignmentRevisionTable.effect_id}
)`

function noCommittedSuccessorAt(frontierSequence: number) {
  return sql`NOT EXISTS (
    SELECT 1
    FROM assignment_revision AS assignment_successor
    JOIN assignment_effect AS successor_effect ON successor_effect.id = assignment_successor.effect_id
    JOIN assignment_commit_seal AS successor_seal ON successor_seal.effect_id = successor_effect.id
    JOIN learning_command_receipt AS successor_receipt ON successor_receipt.id = successor_seal.receipt_id
    JOIN learning_command_invocation AS successor_invocation
      ON successor_invocation.part_id = successor_seal.invocation_part_id
        AND successor_invocation.receipt_id = successor_receipt.id
        AND successor_invocation.status = 'applied'
    WHERE assignment_successor.predecessor_revision_id = ${AssignmentRevisionTable.id}
      AND assignment_successor.frontier_sequence <= ${frontierSequence}
  )`
}

export type PolicyInput = Readonly<{
  partID: PartID
  outcome: "policy_allow" | "policy_deny"
  policyBasis: Readonly<{ readonly [key: string]: unknown }>
  time: number
  order: number
}>

export type PromptIssueInput = Readonly<{
  partID: PartID
  requestID: PermissionV1.ID
  policyBasis: Readonly<{ readonly [key: string]: unknown }>
  shownScope: Readonly<{ readonly [key: string]: unknown }>
  time: number
  order: number
}>

export type PromptSettlementInput = Readonly<{
  partID: PartID
  requestID: PermissionV1.ID
  outcome: "prompted_allow" | "prompted_deny" | "prompted_correct" | "prompted_cancel"
  reply: Readonly<{ readonly [key: string]: unknown }>
  time: number
  order: number
}>

export interface ReadInterface {
  readonly read: (query: ReadQuery, options: ReadOptions) => Effect.Effect<ReadPage, unknown>
}

export class ReadService extends Context.Service<ReadService, ReadInterface>()("@repa/Assignment/Read") {}

const readLayer = Layer.effect(
  ReadService,
  Effect.gen(function* () {
    const database = yield* Database.Service
    return {
      read: (query, options) => database.db.transaction((tx) => read(tx, query, options)),
    }
  }),
)

export const readNode = makeGlobalNode({ service: ReadService, layer: readLayer, deps: [Database.node] })

export function canonicalizeCommand(input: ChangeSetCommand): CanonicalChangeSet {
  if (!closedChangeSet(input)) throw new InvalidCommandError({ reason: "validation_error" })
  const targets = input.intents.flatMap((intent) => ("assignmentID" in intent ? [intent.assignmentID] : []))
  if (new Set(targets).size !== targets.length) throw new InvalidCommandError({ reason: "validation_error" })
  const creates = input.intents.flatMap((intent) => {
    if (intent.type === "create") return [intent.createOrdinal]
    if (intent.type === "replace" && intent.successor.type === "create") return [intent.successor.createOrdinal]
    return []
  })
  if (new Set(creates).size !== creates.length) throw new InvalidCommandError({ reason: "validation_error" })
  if (input.cause.type === "agent_correction" && input.intents.some((intent) => intent.type === "create")) {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
  return {
    schemaVersion: 1,
    cause: toJsonValue(input.cause) as unknown as CanonicalChangeSet["cause"],
    intents: input.intents
      .map((intent) => toJsonValue(intent) as unknown as Intent)
      .sort((left, right) => intentSortKey(left).localeCompare(intentSortKey(right))),
  }
}

export function commandFingerprint(command: CanonicalChangeSet) {
  return fingerprint(command)
}

type SemanticAddressOwner =
  | Readonly<{ type: "effect"; value: typeof AssignmentEffectTable.$inferSelect }>
  | Readonly<{ type: "no_change"; value: typeof AssignmentNoChangeSealTable.$inferSelect }>

function resolveSemanticAddress(tx: Transaction, semanticAddressFingerprint: string) {
  return Effect.gen(function* () {
    const effect = yield* tx
      .select()
      .from(AssignmentEffectTable)
      .where(and(eq(AssignmentEffectTable.semantic_address_fingerprint, semanticAddressFingerprint), committedEffect))
      .get()
      .pipe(Effect.orDie)
    const noChange = yield* tx
      .select()
      .from(AssignmentNoChangeSealTable)
      .where(eq(AssignmentNoChangeSealTable.semantic_address_fingerprint, semanticAddressFingerprint))
      .get()
      .pipe(Effect.orDie)
    if (effect && noChange) return yield* integrity("Assignment semantic address has two owners")
    if (effect) return { type: "effect" as const, value: effect }
    if (noChange) return { type: "no_change" as const, value: noChange }
    return undefined
  })
}

function semanticOwnerMatches(owner: SemanticAddressOwner, commandHash: string, command: CanonicalChangeSet) {
  return owner.value.command_fingerprint === commandHash && isDeepStrictEqual(owner.value.canonical_command, command)
}

function semanticOwnerSettlement(
  tx: Transaction,
  owner: SemanticAddressOwner,
  commandHash: string,
  command: CanonicalChangeSet,
  metadata: SettlementMetadata,
) {
  if (semanticOwnerMatches(owner, commandHash, command)) {
    return owner.type === "effect"
      ? alreadyAppliedSettlement(tx, owner.value.id, metadata)
      : Effect.succeed(alreadyAppliedNoChangeSettlement(owner.value, metadata))
  }
  return Effect.succeed(
    errorSettlement("semantic_conflict", metadata, {
      existingOutcome: owner.type === "effect" ? ("applied" as const) : ("no_change" as const),
      ...(owner.type === "effect" ? { effectID: owner.value.id } : { receiptID: owner.value.receipt_id }),
    }),
  )
}

export function reserve(tx: Transaction, input: Invocation & Readonly<{ settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const command = yield* canonicalCommandEffect(input.command)
    const commandHash = commandFingerprint(command)
    const physicalFingerprint = fingerprint({ identity, envelope: input.envelope, command })

    // Physical replay is deliberately first. A terminal replay performs no
    // current Assignment, source, Course, or clock read.
    const existingPhysical = yield* findPhysicalInvocation(tx, input, physicalFingerprint, identity)
    if (existingPhysical) {
      if (existingPhysical.status !== "admitted") {
        return { type: "replay" as const, settlement: requirePhysicalSettlement(existingPhysical) }
      }
      const disposition = yield* readDisposition(tx, existingPhysical.part_id)
      if (!disposition || disposition.disposition !== "candidate_v1") {
        return yield* integrity("Only a complete Assignment candidate may remain admitted")
      }
      return { type: "admitted" as const, candidate: candidateInfo(disposition) }
    }

    yield* requireEnvelope(input.envelope)
    const registration = registrationFromEnvelope(input.envelope)
    yield* TurnLifecycle.validateLearningCommandRegistration(tx, registration).pipe(
      Effect.mapError((error) => new IntegrityError({ detail: error.reason })),
    )
    yield* requireSettlementMetadata(input.envelope.timeAdmitted, input.settlement)
    const trusted = yield* TurnLifecycle.validateAgentActionRegistration(tx, registration).pipe(
      Effect.mapError((error) => new IntegrityError({ detail: error.reason })),
    )
    const action = yield* rootAgentAction(input.envelope, trusted)

    const semanticAddress = semanticAddressFor(command, input.envelope)
    const semanticAddressFingerprint = fingerprint(semanticAddress)
    const existingOwner = yield* resolveSemanticAddress(tx, semanticAddressFingerprint)
    if (existingOwner) {
      const outcome = semanticOwnerMatches(existingOwner, commandHash, command) ? "already_applied" : "semantic_conflict"
      yield* admitPhysicalInvocation(tx, { envelope: input.envelope, fingerprint: physicalFingerprint, command: identity })
      yield* tx
        .insert(AssignmentDispositionTable)
        .values({
          invocation_part_id: input.envelope.partID,
          disposition: "semantic_terminal_v1",
          command_fingerprint: commandHash,
          canonical_command: command,
          semantic_address_fingerprint: semanticAddressFingerprint,
          semantic_outcome: outcome,
          existing_effect_id: existingOwner.type === "effect" ? existingOwner.value.id : null,
          existing_no_change_receipt_id: existingOwner.type === "no_change" ? existingOwner.value.receipt_id : null,
          time_disposed: input.envelope.timeAdmitted,
        })
        .run()
        .pipe(Effect.orDie)
      const settlement = yield* semanticOwnerSettlement(tx, existingOwner, commandHash, command, input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }

    const materialized = yield* materializeCandidate(tx, command, input.envelope, action).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
      Effect.catchCause((cause) => {
        if (Cause.hasInterrupts(cause)) return Effect.failCause(cause)
        const error = Cause.squash(cause)
        if (error instanceof InvalidCommandError) return Effect.succeed({ type: "failure" as const, error })
        return Effect.failCause(cause)
      }),
    )
    yield* admitPhysicalInvocation(tx, { envelope: input.envelope, fingerprint: physicalFingerprint, command: identity })
    if (materialized.type === "failure") {
      const settlement = assignmentErrorSettlement(materialized.error, input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    if (yield* appliedMutation(tx, input.envelope.assistantMessageID)) {
      const settlement = errorSettlement("context_refresh_required", input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const candidate = {
      kind: "candidate_v1",
      effectID: createEffectID(),
      commandFingerprint: commandHash,
      semanticAddressFingerprint,
      agentActionFingerprint: fingerprint({ action, command, materialized: materialized.value.materialized }),
      canonicalCommand: command,
      agentAction: action,
      causeBasis: materialized.value.causeBasis,
      materialized: materialized.value.materialized,
    } satisfies Candidate
    yield* tx
      .insert(AssignmentDispositionTable)
      .values({
        invocation_part_id: input.envelope.partID,
        disposition: "candidate_v1",
        command_fingerprint: commandHash,
        canonical_command: command,
        semantic_address_fingerprint: semanticAddressFingerprint,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        agent_action: action,
        materialized_candidate: candidate,
        time_disposed: input.envelope.timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)
    return { type: "admitted" as const, candidate }
  })
}

export function settlePolicy(tx: Transaction, input: PolicyInput) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    const basisFingerprint = fingerprint(input.policyBasis)
    const existing = yield* readCapabilitySettlement(tx, input.partID)
    if (existing) {
      if (
        existing.outcome !== input.outcome ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint ||
        existing.basis_fingerprint !== basisFingerprint
      ) {
        return yield* integrity("Assignment capability policy settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    if (yield* readCapabilityIssue(tx, input.partID)) {
      return yield* integrity("A prompted Assignment capability cannot become a policy settlement")
    }
    yield* tx
      .insert(AssignmentCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome: input.outcome,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        basis: input.policyBasis,
        basis_fingerprint: basisFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return capabilitySettlementInfo((yield* readCapabilitySettlement(tx, input.partID))!)
  })
}

export function issueCapabilityPrompt(tx: Transaction, input: PromptIssueInput) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    if (yield* readCapabilitySettlement(tx, input.partID)) {
      return yield* integrity("A terminal Assignment capability outcome cannot issue a prompt")
    }
    const policyFingerprint = fingerprint(input.policyBasis)
    const shownScopeFingerprint = fingerprint(input.shownScope)
    const existing = yield* readCapabilityIssue(tx, input.partID)
    if (existing) {
      if (
        existing.permission_request_id !== input.requestID ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint ||
        existing.policy_fingerprint !== policyFingerprint ||
        existing.shown_scope_fingerprint !== shownScopeFingerprint
      ) {
        return yield* integrity("Assignment capability prompt issue conflicts")
      }
      return capabilityIssueInfo(existing)
    }
    yield* tx
      .insert(AssignmentCapabilityIssueTable)
      .values({
        invocation_part_id: input.partID,
        permission_request_id: input.requestID,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        policy_basis: input.policyBasis,
        policy_fingerprint: policyFingerprint,
        shown_scope: input.shownScope,
        shown_scope_fingerprint: shownScopeFingerprint,
        time_issued: input.time,
        issue_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return capabilityIssueInfo((yield* readCapabilityIssue(tx, input.partID))!)
  })
}

export function settlePrompt(tx: Transaction, input: PromptSettlementInput) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    const issue = yield* readCapabilityIssue(tx, input.partID)
    if (
      !issue ||
      issue.permission_request_id !== input.requestID ||
      issue.agent_action_fingerprint !== candidate.agentActionFingerprint
    ) {
      return yield* integrity("Assignment prompt reply has no exact durable issue")
    }
    const replyFingerprint = fingerprint(input.reply)
    const existing = yield* readCapabilitySettlement(tx, input.partID)
    if (existing) {
      if (
        existing.outcome !== input.outcome ||
        existing.permission_request_id !== input.requestID ||
        existing.basis_fingerprint !== replyFingerprint ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint
      ) {
        return yield* integrity("Assignment prompt settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    yield* tx
      .insert(AssignmentCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome: input.outcome,
        permission_request_id: input.requestID,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        basis: input.reply,
        basis_fingerprint: replyFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return capabilitySettlementInfo((yield* readCapabilitySettlement(tx, input.partID))!)
  })
}

export function recoverCapability(tx: Transaction, input: Readonly<{ partID: PartID; time: number; order: number }>) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    const existing = yield* readCapabilitySettlement(tx, input.partID)
    if (existing) return capabilitySettlementInfo(existing)
    const issue = yield* readCapabilityIssue(tx, input.partID)
    yield* tx
      .insert(AssignmentCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome: issue ? "prompted_abort" : "not_evaluated",
        permission_request_id: issue?.permission_request_id ?? null,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return capabilitySettlementInfo((yield* readCapabilitySettlement(tx, input.partID))!)
  })
}

export function settle(tx: Transaction, input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const candidate = yield* requireCandidate(tx, input.partID)
    const raced = yield* resolveSemanticAddress(tx, candidate.semanticAddressFingerprint)
    if (raced) {
      const settlement = yield* semanticOwnerSettlement(
        tx,
        raced,
        candidate.commandFingerprint,
        candidate.canonicalCommand,
        input.settlement,
      )
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const capability = yield* readCapabilitySettlement(tx, input.partID)
    if (!capability || capability.agent_action_fingerprint !== candidate.agentActionFingerprint) {
      return yield* integrity("Final Assignment settlement has no exact capability outcome")
    }
    if (capability.outcome !== "policy_allow" && capability.outcome !== "prompted_allow") {
      const settlement = errorSettlement(capabilityErrorCode(capability.outcome), input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    yield* revalidateCandidate(tx, candidate)
    if (candidate.materialized.every((item) => item.outcome === "no_change")) {
      const finalOwner = yield* resolveSemanticAddress(tx, candidate.semanticAddressFingerprint)
      if (finalOwner) {
        const settlement = yield* semanticOwnerSettlement(
          tx,
          finalOwner,
          candidate.commandFingerprint,
          candidate.canonicalCommand,
          input.settlement,
        )
        yield* settlePhysicalInvocation(tx, input.partID, settlement)
        return { type: "settled" as const, settlement }
      }
      const settlement = yield* sealNoChange(tx, invocationEnvelope(invocation), candidate, input.settlement)
      return { type: "settled" as const, settlement }
    }
    const settlement = yield* applyCandidate(tx, invocationEnvelope(invocation), candidate, input.settlement)
    return { type: "settled" as const, settlement }
  }).pipe(
    Effect.catch((error) =>
      error instanceof IntegrityError
        ? Effect.fail(error)
        : settleDomainFailure(tx, input.partID, assignmentErrorSettlement(error, input.settlement)),
    ),
  )
}

function sealNoChange(
  tx: Transaction,
  envelope: InvocationEnvelope,
  candidate: Candidate,
  metadata: SettlementMetadata,
) {
  return Effect.gen(function* () {
    yield* tx.run("PRAGMA defer_foreign_keys = ON").pipe(Effect.orDie)
    const receiptID = yield* insertPhysicalReceipt(tx, envelope, metadata)
    const address = semanticAddressFor(candidate.canonicalCommand, envelope)
    const intentResults = intentResultProjections(candidate)
    if (intentResults.some((result) => result.outcome !== "no_change")) {
      return yield* integrity("Assignment no-change seal contains a changed intent")
    }
    const noChangeResults = intentResults as readonly Extract<IntentResultProjection, { outcome: "no_change" }>[]
    yield* tx
      .insert(AssignmentNoChangeSealTable)
      .values({
        semantic_address_fingerprint: candidate.semanticAddressFingerprint,
        cause_type: candidate.canonicalCommand.cause.type,
        occurrence_id: envelope.occurrenceID,
        source_revision_id: address.type === "source_observation" ? address.sourceRevisionID : null,
        source_locator_digest: address.type === "source_observation" ? address.locatorDigest : null,
        model_operation_id: envelope.assistantMessageID,
        semantic_slot: address.slot,
        command_fingerprint: candidate.commandFingerprint,
        canonical_command: candidate.canonicalCommand,
        invocation_part_id: envelope.partID,
        invocation_status: "no_change",
        receipt_id: receiptID,
        results: noChangeResults,
        time_committed: metadata.time,
        commit_order: metadata.order,
      })
      .run()
      .pipe(Effect.orDie)
    const settlement = {
      outcome: "no_change",
      assignmentKind: "change_set",
      intentResults: noChangeResults,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies NoChangeSettlement
    yield* settlePhysicalInvocation(tx, envelope.partID, settlement)
    return settlement
  })
}

export function recover(tx: Transaction, input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const candidate = yield* requireCandidate(tx, input.partID)
    const raced = yield* resolveSemanticAddress(tx, candidate.semanticAddressFingerprint)
    if (raced) {
      const settlement = yield* semanticOwnerSettlement(
        tx,
        raced,
        candidate.commandFingerprint,
        candidate.canonicalCommand,
        input.settlement,
      )
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    yield* recoverCapability(tx, { partID: input.partID, time: input.settlement.time, order: input.settlement.order })
    const settlement = errorSettlement("interrupted", input.settlement)
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function settleFailure(
  tx: Transaction,
  input: Readonly<{ partID: PartID; error: unknown; settlement: SettlementMetadata }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const settlement = assignmentErrorSettlement(input.error, input.settlement)
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function readInvocationVersion(
  tx: Transaction,
  input: Readonly<{ partID: PartID; assistantMessageID: MessageID; providerCallID: string }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* lookupPhysicalInvocation(tx, input)
    if (!invocation) return undefined
    if (invocation.command_name !== UPDATE_CAPABILITY || invocation.command_version !== UPDATE_VERSION) {
      return yield* integrity("Assignment invocation identity conflicts")
    }
    const disposition = yield* readDisposition(tx, input.partID)
    const state = {
      version: 1 as const,
      status: invocation.status,
      settlement: invocation.settlement,
      timeAdmitted: invocation.time_admitted,
    }
    if (!disposition) {
      if (invocation.status === "admitted" || invocation.status !== "error") {
        return yield* integrity("Assignment invocation lost its required disposition")
      }
      return { ...state, disposition: "physical_no_effect" as const } satisfies InvocationVersion
    }
    if (disposition.disposition === "candidate_v1") {
      const owner = yield* resolveSemanticAddress(tx, disposition.semantic_address_fingerprint)
      if (owner) {
        const outcome = semanticOwnerMatches(owner, disposition.command_fingerprint, disposition.canonical_command)
          ? "already_applied"
          : "semantic_conflict"
        const isTerminalRace =
          (outcome === "already_applied" && invocation.status === "already_applied") ||
          (outcome === "semantic_conflict" &&
            invocation.status === "error" &&
            invocation.settlement?.code === "semantic_conflict")
        if (isTerminalRace) {
          return {
            ...state,
            disposition: "semantic_terminal_v1" as const,
            semanticTerminal: {
              kind: "semantic_terminal_v1",
              outcome,
              commandFingerprint: disposition.command_fingerprint,
              semanticAddressFingerprint: disposition.semantic_address_fingerprint,
              existingOwner:
                owner.type === "effect"
                  ? { type: "effect" as const, effectID: owner.value.id }
                  : { type: "no_change" as const, receiptID: owner.value.receipt_id },
            },
          } satisfies InvocationVersion
        }
      }
      const capability = yield* readCapabilitySettlement(tx, input.partID)
      const issue = yield* readCapabilityIssue(tx, input.partID)
      return {
        ...state,
        disposition: "candidate_v1" as const,
        candidate: candidateInfo(disposition),
        ...(capability ? { capabilityOutcome: capability.outcome } : {}),
        ...(issue ? { permissionRequestID: issue.permission_request_id } : {}),
      } satisfies InvocationVersion
    }
    if (
      !disposition.semantic_outcome ||
      (disposition.existing_effect_id === null) === (disposition.existing_no_change_receipt_id === null)
    ) {
      return yield* integrity("Assignment semantic-terminal disposition is incomplete")
    }
    return {
      ...state,
      disposition: "semantic_terminal_v1" as const,
      semanticTerminal: {
        kind: "semantic_terminal_v1",
        outcome: disposition.semantic_outcome,
        commandFingerprint: disposition.command_fingerprint,
        semanticAddressFingerprint: disposition.semantic_address_fingerprint,
        existingOwner: disposition.existing_effect_id
          ? { type: "effect", effectID: disposition.existing_effect_id }
          : { type: "no_change", receiptID: disposition.existing_no_change_receipt_id! },
      },
    } satisfies InvocationVersion
  })
}

export type ReadOptions = Readonly<{
  asOf: number
  cursor?: string
  limit?: number
  byteLimit?: number
}>

export function read(tx: Transaction, query: ReadQuery, options: ReadOptions) {
  return Effect.gen(function* () {
    requireNonNegativeInteger(options.asOf)
    const limit = options.limit ?? MAX_READ_ITEMS
    const byteLimit = options.byteLimit ?? MAX_READ_BYTES
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_READ_ITEMS) return yield* invalid("validation_error")
    if (!Number.isInteger(byteLimit) || byteLimit < 1 || byteLimit > MAX_READ_BYTES) {
      return yield* invalid("validation_error")
    }
    const cursor = options.cursor
      ? yield* Effect.try({
          try: () => decodeCursor(options.cursor!),
          catch: () => invalidError("validation_error"),
        })
      : undefined
    if (cursor) {
      if (query.type !== "discover" && query.type !== "history") return yield* invalid("validation_error")
      if (cursor.queryFingerprint !== fingerprint(query)) return yield* invalid("stale")
    }
    const ownerCut = cursor?.ownerCut ?? (yield* currentOwnerCut(tx))
    if (cursor) {
      const rebuiltOwnerCut = yield* ownerCutAt(tx, ownerCut.frontierSequence)
      if (rebuiltOwnerCut.fingerprint !== ownerCut.fingerprint) return yield* invalid("stale")
      const dependenciesCurrent = yield* Effect.forEach(cursor.dependencies, (dependency) =>
        Effect.gen(function* () {
          const assignment = yield* assignmentAtCut(tx, dependency.assignmentID, ownerCut.frontierSequence)
          if (!assignment || assignment.current.id !== dependency.revisionID) return false
          const projection = yield* projectionAtCut(tx, assignment, assignment.current, ownerCut, cursor.asOf)
          return projectionDependency(projection).fingerprint === dependency.fingerprint
        }),
      )
      if (dependenciesCurrent.some((current) => !current)) return yield* invalid("stale")
    }
    const asOf = cursor?.asOf ?? options.asOf

    if (query.type === "current") {
      const assignment = yield* assignmentAtCut(tx, query.assignmentID, ownerCut.frontierSequence)
      return page(ownerCut, asOf, "identity_creation_then_assignment_id_non_priority", assignment ? [assignment] : [], byteLimit)
    }
    if (query.type === "revision") {
      const revision = yield* exactRevision(tx, query.assignmentID, query.revisionID)
      return page(ownerCut, asOf, "revision_version", revision ? [revision] : [], byteLimit)
    }
    if (query.type === "projection") {
      const assignment = yield* assignmentAtCut(tx, query.assignmentID, ownerCut.frontierSequence)
      const revision = query.revisionID
        ? yield* exactRevision(tx, query.assignmentID, query.revisionID)
        : assignment?.current
      const projection = revision
        ? yield* projectionAtCut(tx, assignment, revision, ownerCut, query.asOf)
        : undefined
      return page(ownerCut, query.asOf, "identity_creation_then_assignment_id_non_priority", projection ? [projection] : [], byteLimit)
    }
    if (query.type === "history") {
      const afterVersion = cursor?.after?.type === "history" ? cursor.after.version : 0
      const rows = yield* tx
        .select()
        .from(AssignmentRevisionTable)
        .where(
          and(
            eq(AssignmentRevisionTable.assignment_id, query.assignmentID),
            sql`${AssignmentRevisionTable.frontier_sequence} <= ${ownerCut.frontierSequence}`,
            gt(AssignmentRevisionTable.version, afterVersion),
            committedRevision,
          ),
        )
        .orderBy(asc(AssignmentRevisionTable.version), asc(AssignmentRevisionTable.id))
        .limit(limit + 1)
        .all()
        .pipe(Effect.orDie)
      const candidates = rows.slice(0, limit)
      const items = yield* Effect.forEach(candidates, (row) => revisionFromRow(tx, row))
      const countAtCut = yield* countHistoryAtCut(tx, query.assignmentID, ownerCut.frontierSequence)
      return fitPaginatedPage({
        ownerCut,
        asOf,
        order: "revision_version",
        countAtCut,
        items,
        byteLimit,
        cursorFor: (retainedCount) => {
          const retained = candidates.slice(0, retainedCount)
          if (!retained.at(-1) || afterVersion + retainedCount >= countAtCut) return undefined
          return encodeCursor({
            schemaVersion: 1,
            queryFingerprint: fingerprint(query),
            ownerCut,
            dependencies: cursor?.dependencies ?? [],
            asOf,
            after: { type: "history", version: retained.at(-1)!.version },
          })
        },
      })
    }

    const after = cursor?.after?.type === "discover" ? cursor.after : undefined
    const discovered = yield* discoverHeadsAtCut(tx, query, ownerCut.frontierSequence, after, limit * 2)
    const assignments = yield* Effect.forEach(discovered.rows, (row) => assignmentFromHeadRow(tx, row))
    const projected = yield* Effect.forEach(assignments, (assignment) =>
      projectionAtCut(tx, assignment, assignment.current, ownerCut, asOf),
    )
    const items = projected.slice(0, limit)
    return fitPaginatedPage({
      ownerCut,
      asOf,
      order: "identity_creation_then_assignment_id_non_priority",
      countAtCut: discovered.countAtCut,
      items,
      byteLimit,
      cursorFor: (retainedCount) => {
        const last = discovered.rows[retainedCount - 1]
        if (!last || discovered.rows.length <= retainedCount) return undefined
        const dependencies = projected.slice(retainedCount, retainedCount + limit).map(projectionDependency).filter(
          (dependency, index, values) =>
            values.findIndex(
              (candidate) =>
                candidate.assignmentID === dependency.assignmentID && candidate.revisionID === dependency.revisionID,
            ) === index,
        )
        return encodeCursor({
          schemaVersion: 1,
          queryFingerprint: fingerprint(query),
          ownerCut,
          dependencies,
          asOf,
          after: {
            type: "discover",
            timeCreated: last.assignment_time_created,
            assignmentID: last.assignment_id,
          },
        })
      },
    })
  })
}

export function readCurrent(tx: Transaction, assignmentID: AssignmentID, asOf: number) {
  return Effect.gen(function* () {
    const ownerCut = yield* currentOwnerCut(tx)
    const assignment = yield* assignmentAtCut(tx, assignmentID, ownerCut.frontierSequence)
    return assignment ? yield* projectionAtCut(tx, assignment, assignment.current, ownerCut, asOf) : undefined
  })
}

export function readExactRevision(tx: Transaction, assignmentID: AssignmentID, revisionID: RevisionID) {
  return exactRevision(tx, assignmentID, revisionID)
}

export function listOpenForContext(
  tx: Transaction,
  input: Readonly<{ asOf: number; limit?: number }>,
): Effect.Effect<ContextProjection, InvalidCommandError | IntegrityError> {
  return Effect.gen(function* () {
    requireNonNegativeInteger(input.asOf)
    const limit = input.limit ?? MAX_CONTEXT_ENTRIES
    if (!Number.isInteger(limit) || limit < 0 || limit > MAX_CONTEXT_ENTRIES) return yield* invalid("validation_error")
    const ownerCut = yield* currentOwnerCut(tx)
    const discovered = yield* discoverHeadsAtCut(
      tx,
      { type: "discover", disposition: "open" },
      ownerCut.frontierSequence,
      undefined,
      limit,
    )
    const assignments = yield* Effect.forEach(discovered.rows, (row) => assignmentFromHeadRow(tx, row))
    const candidates = yield* Effect.forEach(assignments, (assignment) =>
      projectionAtCut(tx, assignment, assignment.current, ownerCut, input.asOf).pipe(
        Effect.map((projection) => ({ assignment, projection })),
      ),
    )
    return {
      ownerCut,
      asOf: input.asOf,
      countAtCut: discovered.countAtCut,
      order: "identity_creation_then_assignment_id_non_priority",
      candidates,
    }
  })
}

export function revisionReference(revision: Revision): AssignmentRevisionRef {
  return { assignmentID: revision.assignmentID, revisionID: revision.id, version: revision.version }
}

export function ownerReadReference(assignment: AssignmentSnapshot): OwnerReadReference {
  return {
    ...revisionReference(assignment.current),
    ownerCutFingerprint: headReferenceFingerprint(assignment),
  }
}

export function semanticValueFor(projection: ProjectionAtCut) {
  const value = toJsonValue({
    schemaVersion: 1,
    assignmentRevisionRef: projection.assignmentRevisionRef,
    obligationSummary: projection.revision.snapshot.obligationSummary,
    learningContext: projection.revision.snapshot.learningContext,
    scope: projection.revision.snapshot.scope,
    dueBasis: contextDueBasis(projection.revision.snapshot.dueBasis),
    expiryBoundary: projection.revision.snapshot.expiryBoundary
      ? contextTemporalBoundary(projection.revision.snapshot.expiryBoundary)
      : null,
    dueRelationAtCut: projection.dueRelationAtCut,
    expiryRelationAtCut: projection.expiryRelationAtCut,
    disposition: projection.revision.disposition,
    currentHeadRelation: projection.currentHeadRelation,
    supersessionTarget: projection.revision.supersessionTarget ?? null,
  })
  if (utf8Bytes(canonicalJson(value)) > MAX_SEMANTIC_VALUE_BYTES) {
    throw new IntegrityError({ detail: "Assignment automatic semantic value exceeds its admitted maximum" })
  }
  return value
}

export function semanticValueBytes(projection: ProjectionAtCut) {
  return utf8Bytes(canonicalJson(semanticValueFor(projection)))
}

function contextDueBasis(value: DueBasis) {
  if (value.type === "unresolved" || value.type === "explicitly_no_deadline") return value
  return contextTemporalBoundary(value)
}

function contextTemporalBoundary(value: TemporalBoundary) {
  if (value.type === "local_date") return value
  return {
    type: value.type,
    normalizedInstant: value.normalizedInstant,
    utcOffsetMinutes: value.utcOffsetMinutes,
    comparator: value.comparator,
    resolvedZone: value.resolvedZone,
    exactExpressionAvailableByLazyRead: true as const,
  }
}

type RootSource = Readonly<{
  occurrenceID: InvocationEnvelope["occurrenceID"]
  sourceOrder: number
  sessionID: InvocationEnvelope["sessionID"]
  messageID: MessageID
  turnID: InvocationEnvelope["turnID"]
  inputID: InvocationEnvelope["inputID"]
  timeAdmitted: number
  sourceTemporalContext: SourceTemporalContext
}>

function materializeCandidate(
  tx: Transaction,
  command: CanonicalChangeSet,
  envelope: InvocationEnvelope,
  action: AgentAction,
) {
  return Effect.gen(function* () {
    const rootSource = yield* currentRootSource(tx, envelope.occurrenceID, command.cause.type !== "agent_correction")
    const causeBasis = yield* materializeCauseBasis(tx, command, rootSource)
    const currentCut = yield* currentOwnerCut(tx)
    const materialized: readonly MaterializedIntent[] = yield* Effect.forEach(command.intents, (intent, ordinal) =>
      materializeIntent(tx, intent, ordinal, command, causeBasis, currentCut, action),
    )
    const changes = materialized.filter((item) => item.outcome === "changed")
    yield* validateFinalGraph(tx, changes, currentCut.frontierSequence)
    return { causeBasis, materialized }
  })
}

function materializeCauseBasis(tx: Transaction, command: CanonicalChangeSet, rootSource: RootSource) {
  const cause = command.cause
  if (cause.type === "interpreted_learner_report" || cause.type === "interpreted_learner_direction") {
    return bindLearnerExcerpt(tx, cause.excerpt, rootSource)
  }
  if (cause.type === "agent_correction") {
    requireTextBytes(cause.rationale, 1, MAX_RATIONALE_BYTES)
    if (cause.ownerReads.length < 1 || cause.ownerReads.length > MAX_INTENTS) return Effect.fail(invalidError("validation_error"))
    return Effect.gen(function* () {
      yield* Effect.forEach(cause.ownerReads, (ownerRead) => requireOwnerRead(tx, ownerRead), { discard: true })
      return { type: "assignment_owner_read" as const, ownerReads: cause.ownerReads }
    })
  }
  return materializeSourceObservation(tx, cause.source)
}

function materializeSourceObservation(tx: Transaction, source: SourceObservationIntent) {
  return Effect.gen(function* () {
    requireTextBytes(source.selector.locator, 1, MAX_EXCERPT_BYTES)
    const locatorDigest = sourceLocatorDigest(source)
    if (source.type === "artifact_revision") {
      const proof = yield* Artifact.prepareRevisionReferenceInTransaction(
        tx,
        source.artifactID,
        source.revisionID,
        source.attribution,
      ).pipe(Effect.mapError(() => invalidError("source_unavailable")))
      const excerptSha256 = source.selector.excerpt
        ? validateWholeArtifactExcerpt(source.selector.excerpt, proof.receipt.revision.fingerprint)
        : undefined
      return {
        type: "artifact_revision" as const,
        artifactID: source.artifactID,
        revisionID: source.revisionID,
        attribution: source.attribution,
        selector: {
          locator: source.selector.locator,
          ...(source.selector.excerpt ? { excerpt: source.selector.excerpt } : {}),
          locatorDigest,
          ...(excerptSha256 ? { excerptSha256 } : {}),
        },
        admission: toJsonValue(proof.receipt) as Readonly<{ readonly [key: string]: unknown }>,
      } satisfies EffectiveSourceBasis
    }
    if (source.selector.excerpt) return yield* invalid("source_unavailable")
    const proof = yield* Representation.prepareCurrentUseProof(tx, source.representationRevisionID).pipe(
      Effect.mapError(() => invalidError("source_unavailable")),
    )
    return {
      type: "representation_revision" as const,
      representationRevisionID: source.representationRevisionID,
      selector: { locator: source.selector.locator, locatorDigest },
      admission: toJsonValue(proof.receipt) as Readonly<{ readonly [key: string]: unknown }>,
    } satisfies EffectiveSourceBasis
  })
}

function materializeIntent(
  tx: Transaction,
  intent: Intent,
  ordinal: number,
  command: CanonicalChangeSet,
  causeBasis: Candidate["causeBasis"],
  currentCut: OwnerCut,
  action: AgentAction,
): Effect.Effect<MaterializedIntent, unknown> {
  return Effect.gen(function* () {
    requireIntentCause(intent, command.cause.type)
    const sourceAdmissionBasis = admissionBasis(causeBasis)
    const authorship = mutationAuthorship(command, action)
    if (intent.type === "create") {
      if (causeBasis.type === "assignment_owner_read") return yield* invalid("validation_error")
      const snapshot = yield* materializeSnapshot(tx, intent.snapshot, sourceZoneFor(causeBasis))
      const assignmentID = createAssignmentID()
      return {
        outcome: "changed" as const,
        ordinal,
        intent,
        assignmentID,
        revisionID: createRevisionID(),
        snapshot,
        finalDisposition: "open" as const,
        creationSourceBasis: causeBasis,
        effectiveSourceBasis: causeBasis,
        sourceAdmissionBasis,
        sourceBasisRelation: "corrected_with_new_exact_source" as const,
      } satisfies MaterializedIntent
    }

    const current = yield* currentAssignment(tx, intent.assignmentID)
    if (!current) return yield* invalid("not_found")
    requireExpectedHead(current, intent.expectedHead)
    if (command.cause.type === "agent_correction") {
      const exact = command.cause.ownerReads.some(
        (ownerRead) =>
          ownerRead.assignmentID === current.id &&
          ownerRead.revisionID === current.current.id &&
          ownerRead.version === current.current.version &&
          ownerRead.ownerCutFingerprint === headReferenceFingerprint(current),
      )
      if (!exact) return yield* invalid("stale")
    }

    if (intent.type === "replace") {
      if (current.current.disposition !== "open") return yield* invalid("illegal_transition")
      const source = yield* successorSource(current, causeBasis, intent.sourceAction, command.cause.type)
      const successorCreationBasis =
        causeBasis.type === "assignment_owner_read" ? current.current.effectiveSourceBasisAtCommit : causeBasis
      const successor = yield* materializeReplacementSuccessor(
        tx,
        intent,
        successorCreationBasis,
        sourceAdmissionBasis,
        currentCut,
      )
      const relationTarget = successor.target
      return {
        outcome: "changed" as const,
        ordinal,
        intent,
        assignmentID: current.id,
        revisionID: createRevisionID(),
        current,
        successorAssignmentID: successor.assignmentID,
        ...(successor.revisionID ? { successorRevisionID: successor.revisionID } : {}),
        ...(successor.current ? { successorCurrent: successor.current } : {}),
        ...(successor.snapshot ? { successorSnapshot: successor.snapshot } : {}),
        snapshot: current.current.snapshot,
        finalDisposition: "superseded" as const,
        relationTarget,
        creationSourceBasis: current.current.creationSourceBasis,
        effectiveSourceBasis: source.effective,
        sourceAdmissionBasis,
        sourceBasisRelation: source.relation,
      } satisfies MaterializedIntent
    }

    requireTextBytes(intent.rationale, 1, MAX_RATIONALE_BYTES)
    const source = yield* successorSource(current, causeBasis, intent.sourceAction, command.cause.type)
    const snapshot = intent.snapshot
      ? yield* materializeSnapshot(tx, intent.snapshot, sourceZoneFor(source.effective), current.current.snapshot.scope)
      : current.current.snapshot
    const finalDisposition = finalDispositionFor(intent, current.current.disposition)
    const relationTarget = yield* relationTargetFor(tx, intent.relationAction, current, finalDisposition)
    validateTransition(intent, current.current.disposition, finalDisposition, command.cause.type)
    if (
      intent.type === "revise" &&
      isDeepStrictEqual(snapshot, current.current.snapshot) &&
      isDeepStrictEqual(relationTarget, current.current.supersessionTarget) &&
      isDeepStrictEqual(source.effective, current.current.effectiveSourceBasisAtCommit)
    ) {
      return {
        outcome: "no_change" as const,
        ordinal,
        intent,
        assignmentID: current.id,
        revisionID: current.current.id,
        current,
        snapshot,
        finalDisposition,
        ...(relationTarget ? { relationTarget } : {}),
        creationSourceBasis: current.current.creationSourceBasis,
        effectiveSourceBasis: source.effective,
        sourceAdmissionBasis,
        sourceBasisRelation: source.relation,
      } satisfies MaterializedIntent
    }
    return {
      outcome: "changed" as const,
      ordinal,
      intent,
      assignmentID: current.id,
      revisionID: createRevisionID(),
      current,
      snapshot,
      finalDisposition,
      ...(relationTarget ? { relationTarget } : {}),
      creationSourceBasis: current.current.creationSourceBasis,
      effectiveSourceBasis: source.effective,
      sourceAdmissionBasis,
      sourceBasisRelation: source.relation,
    } satisfies MaterializedIntent
  })
}

function materializeReplacementSuccessor(
  tx: Transaction,
  intent: Extract<Intent, { type: "replace" }>,
  creationBasis: EffectiveSourceBasis,
  sourceAdmissionBasis: SourceAdmissionBasis,
  currentCut: OwnerCut,
) {
  return Effect.gen(function* () {
    if (intent.successor.type === "bind") {
      if (intent.successor.target.assignmentID === intent.assignmentID) return yield* invalid("graph_conflict")
      const target = yield* assignmentAtCut(tx, intent.successor.target.assignmentID, currentCut.frontierSequence)
      if (!target || !sameRevisionRef(revisionReference(target.current), intent.successor.target)) {
        return yield* invalid("stale")
      }
      return { assignmentID: target.id, current: target, target: intent.successor.target }
    }
    const snapshot = yield* materializeSnapshot(tx, intent.successor.snapshot, sourceZoneFor(creationBasis))
    const assignmentID = createAssignmentID()
    const revisionID = createRevisionID()
    return {
      assignmentID,
      revisionID,
      snapshot,
      target: { assignmentID, revisionID, version: 1 } satisfies AssignmentRevisionRef,
      sourceAdmissionBasis,
      causeBasis: creationBasis,
    }
  })
}

function successorSource(
  current: AssignmentSnapshot,
  causeBasis: Candidate["causeBasis"],
  action: SourceAction,
  cause: CanonicalChangeSet["cause"]["type"],
) {
  if (action.type === "preserve_predecessor_source") {
    return Effect.succeed({ effective: current.current.effectiveSourceBasisAtCommit, relation: "carried" as const })
  }
  if (cause === "interpreted_learner_direction" || causeBasis.type === "assignment_owner_read") {
    return Effect.fail(invalidError("illegal_transition"))
  }
  return Effect.succeed({ effective: causeBasis, relation: "corrected_with_new_exact_source" as const })
}

function admissionBasis(causeBasis: Candidate["causeBasis"]): SourceAdmissionBasis {
  if (causeBasis.type === "assignment_owner_read") return causeBasis
  return { type: causeBasis.type, basis: causeBasis } as SourceAdmissionBasis
}

function mutationAuthorship(command: CanonicalChangeSet, action: AgentAction): MutationAuthorshipBasis {
  return {
    type: command.cause.type,
    assistantMessageID: action.assistantMessageID,
    occurrenceID: action.occurrenceID,
    invocationPartID: action.invocationPartID,
    ...(command.cause.type === "agent_correction" ? { rationale: command.cause.rationale } : {}),
  }
}

function materializeSnapshot(
  tx: Transaction,
  input: SemanticSnapshotIntent,
  sourceZone: CivilSourceZone,
  predecessorScope?: Scope,
) {
  return Effect.gen(function* () {
    requireTextBytes(input.obligationSummary, 1, MAX_SUMMARY_BYTES)
    requireTextBytes(input.learningContext, 1, MAX_LEARNING_CONTEXT_BYTES)
    const scope = yield* materializeScope(tx, input.scope, predecessorScope)
    const dueBasis = yield* materializeDueBasis(input.dueBasis, sourceZone)
    const expiryBoundary = input.expiryBoundary ? yield* materializeBoundary(input.expiryBoundary, sourceZone) : undefined
    return {
      obligationSummary: input.obligationSummary,
      learningContext: input.learningContext,
      scope,
      dueBasis,
      ...(expiryBoundary ? { expiryBoundary } : {}),
    } satisfies SemanticSnapshot
  })
}

function materializeScope(tx: Transaction, scope: Scope, predecessorScope?: Scope) {
  if (scope.type === "learner_home") return Effect.succeed(scope)
  return Effect.gen(function* () {
    if (
      scope.courseIDs.length < 1 ||
      scope.courseIDs.length > MAX_SCOPE_COURSES ||
      new Set(scope.courseIDs).size !== scope.courseIDs.length
    ) {
      return yield* invalid("validation_error")
    }
    const ordered = [...scope.courseIDs].sort()
    const carried = new Set(predecessorScope?.type === "courses" ? predecessorScope.courseIDs : [])
    yield* Effect.forEach(
      ordered.filter((courseID) => !carried.has(courseID)),
      (courseID) =>
        Course.inspectPreferenceTarget(tx, courseID).pipe(
          Effect.flatMap((status) => (status.status === "available" ? Effect.void : invalid("source_unavailable"))),
        ),
      { discard: true },
    )
    return { type: "courses" as const, courseIDs: ordered }
  })
}

function materializeDueBasis(input: DueBasisIntent, sourceZone: CivilSourceZone) {
  if (input.type === "unresolved" || input.type === "explicitly_no_deadline") return Effect.succeed(input)
  return materializeBoundary(input, sourceZone)
}

function materializeBoundary(input: TemporalBoundaryIntent, sourceZone: CivilSourceZone) {
  return Effect.try({
    try: () => {
      const resolvedZone = resolveZone(input.timeZone, sourceZone, "Assignment")
      if (input.type === "local_date") {
        if (!validDate(input.civilDate) || !comparator(input.comparator)) throw invalidError("validation_error")
        return { type: "local_date" as const, civilDate: input.civilDate, comparator: input.comparator, resolvedZone }
      }
      requireTextBytes(input.sourceExpression, 1, MAX_EXCERPT_BYTES)
      if (!comparator(input.comparator)) throw invalidError("validation_error")
      const resolved = resolveLocalInstant(
        input.localDateTime,
        resolvedZone,
        "Assignment",
        input.disambiguatingOffsetMinutes,
      )
      validateSourceExpression(input.sourceExpression, input.localDateTime, resolvedZone, resolved, "Assignment")
      return {
        type: "instant" as const,
        sourceExpression: input.sourceExpression,
        localDateTime: input.localDateTime,
        normalizedInstant: resolved.instant,
        utcOffsetMinutes: resolved.utcOffsetMinutes,
        comparator: input.comparator,
        resolvedZone,
      }
    },
    catch: (error) =>
      error instanceof InvalidCommandError
        ? error
        : invalidError(input.timeZone.type === "source" && sourceZone.state === "unavailable" ? "source_unavailable" : "validation_error"),
  })
}

function sourceZoneFor(basis: EffectiveSourceBasis): CivilSourceZone {
  if (basis.type !== "learner_occurrence" || basis.sourceTemporalContext.state !== "resolved") {
    return { state: "unavailable", reason: "timezone_unavailable" }
  }
  return {
    state: "resolved",
    timeZone: basis.sourceTemporalContext.timeZone,
    utcOffsetMinutes: basis.sourceTemporalContext.utcOffsetMinutes,
  }
}

function requireIntentCause(intent: Intent, cause: CanonicalChangeSet["cause"]["type"]) {
  if (intent.type === "create") {
    if (cause !== "interpreted_learner_report" && cause !== "interpreted_source_observation") {
      throw invalidError("illegal_transition")
    }
    return
  }
  if (intent.type === "complete" || intent.type === "cancel" || intent.type === "reopen") {
    if (cause !== "interpreted_learner_report" && cause !== "interpreted_source_change") {
      throw invalidError("illegal_transition")
    }
    return
  }
  if (intent.type === "dismiss") {
    if (cause !== "interpreted_learner_direction" && cause !== "agent_correction") {
      throw invalidError("illegal_transition")
    }
    if (
      cause === "interpreted_learner_direction" &&
      (intent.snapshot !== undefined ||
        intent.sourceAction.type !== "preserve_predecessor_source" ||
        intent.relationAction.type !== "preserve")
    ) {
      throw invalidError("illegal_transition")
    }
    return
  }
  if (cause === "interpreted_learner_direction") {
    if (
      intent.type !== "correct" ||
      intent.snapshot !== undefined ||
      intent.finalDisposition !== "open" ||
      intent.sourceAction.type !== "preserve_predecessor_source" ||
      intent.relationAction.type !== "preserve"
    ) {
      throw invalidError("illegal_transition")
    }
    return
  }
  if (cause === "interpreted_source_observation") throw invalidError("illegal_transition")
}

function finalDispositionFor(
  intent: Exclude<Intent, { type: "create" | "replace" }>,
  current: Revision["disposition"],
) {
  if (intent.type === "revise") return current
  if (intent.type === "correct") {
    if (!intent.finalDisposition) throw invalidError("validation_error")
    return intent.finalDisposition
  }
  if (intent.finalDisposition !== undefined) throw invalidError("validation_error")
  if (intent.type === "complete") return "completed" as const
  if (intent.type === "cancel") return "cancelled" as const
  if (intent.type === "dismiss") return "dismissed" as const
  return "open" as const
}

function validateTransition(
  intent: Exclude<Intent, { type: "create" | "replace" }>,
  previous: Revision["disposition"],
  next: Revision["disposition"],
  cause: CanonicalChangeSet["cause"]["type"],
) {
  if (intent.type === "revise") {
    if (next !== previous || intent.relationAction.type !== "preserve") throw invalidError("illegal_transition")
    return
  }
  if (intent.type === "correct") {
    if (cause === "interpreted_learner_direction" && (previous !== "dismissed" || next !== "open")) {
      throw invalidError("illegal_transition")
    }
    return
  }
  if (previous !== "open" && intent.type !== "reopen") throw invalidError("illegal_transition")
  if (
    intent.type === "reopen" &&
    previous !== "completed" &&
    previous !== "cancelled" &&
    previous !== "dismissed"
  ) {
    throw invalidError("illegal_transition")
  }
  if (intent.relationAction.type !== "preserve") throw invalidError("illegal_transition")
}

function relationTargetFor(
  tx: Transaction,
  action: RelationAction,
  current: AssignmentSnapshot,
  finalDisposition: Revision["disposition"],
) {
  return Effect.gen(function* () {
    if (action.type === "preserve") {
      if (current.current.disposition === "superseded") {
        if (finalDisposition !== "superseded" || !current.current.supersessionTarget) {
          return yield* invalid("graph_conflict")
        }
        return current.current.supersessionTarget
      }
      if (finalDisposition === "superseded") return yield* invalid("graph_conflict")
      return undefined
    }
    if (action.type === "clear") {
      if (finalDisposition !== action.finalDisposition) {
        return yield* invalid("graph_conflict")
      }
      return undefined
    }
    if (finalDisposition !== "superseded" || action.target.assignmentID === current.id) {
      return yield* invalid("graph_conflict")
    }
    const target = yield* exactRevision(tx, action.target.assignmentID, action.target.revisionID)
    if (!target || target.version !== action.target.version) return yield* invalid("not_found")
    return action.target
  })
}

function revalidateCandidate(tx: Transaction, candidate: Candidate) {
  return Effect.gen(function* () {
    yield* revalidateCauseBasis(tx, candidate)
    yield* Effect.forEach(
      candidate.materialized,
      (item) =>
        Effect.gen(function* () {
          if (item.current) {
            const current = yield* currentAssignment(tx, item.assignmentID)
            if (!current || !sameRevisionRef(revisionReference(current.current), revisionReference(item.current.current))) {
              return yield* invalid("stale")
            }
            if (item.successorCurrent) {
              const successor = yield* currentAssignment(tx, item.successorCurrent.id)
              if (
                !successor ||
                !sameRevisionRef(revisionReference(successor.current), revisionReference(item.successorCurrent.current))
              ) {
                return yield* invalid("stale")
              }
            }
          }
          if (item.outcome === "no_change") return
          yield* materializeScope(tx, item.snapshot.scope, item.current?.current.snapshot.scope)
          if (item.successorSnapshot) yield* materializeScope(tx, item.successorSnapshot.scope)
        }),
      { discard: true },
    )
    const currentCut = yield* currentOwnerCut(tx)
    yield* validateFinalGraph(
      tx,
      candidate.materialized.filter((item) => item.outcome === "changed"),
      currentCut.frontierSequence,
    )
  })
}

function revalidateCauseBasis(tx: Transaction, candidate: Candidate) {
  const basis = candidate.causeBasis
  if (basis.type === "assignment_owner_read") {
    return Effect.forEach(basis.ownerReads, (ownerRead) => requireOwnerRead(tx, ownerRead), { discard: true })
  }
  if (basis.type === "learner_occurrence") {
    return Effect.gen(function* () {
      const current = yield* currentRootSource(tx, basis.occurrenceID, true)
      const rebound = yield* bindLearnerExcerpt(
        tx,
        {
          text: basis.excerpt.text,
          startByte: basis.excerpt.startByte,
          endByte: basis.excerpt.endByte,
        },
        current,
      )
      if (!isDeepStrictEqual(rebound, basis)) return yield* invalid("source_unavailable")
    })
  }
  if (basis.type === "artifact_revision") {
    return Artifact.prepareRevisionReferenceInTransaction(
      tx,
      basis.artifactID,
      basis.revisionID,
      basis.attribution,
    ).pipe(
      Effect.flatMap((proof) =>
        isDeepStrictEqual(toJsonValue(proof.receipt), basis.admission) ? Effect.void : invalid("source_unavailable"),
      ),
      Effect.mapError(() => invalidError("source_unavailable")),
    )
  }
  return Representation.prepareCurrentUseProof(tx, basis.representationRevisionID).pipe(
    Effect.flatMap((proof) =>
      isDeepStrictEqual(toJsonValue(proof.receipt), basis.admission) ? Effect.void : invalid("source_unavailable"),
    ),
    Effect.mapError(() => invalidError("source_unavailable")),
  )
}

function applyCandidate(
  tx: Transaction,
  envelope: InvocationEnvelope,
  candidate: Candidate,
  metadata: SettlementMetadata,
) {
  return Effect.gen(function* () {
    yield* tx.run("PRAGMA defer_foreign_keys = ON").pipe(Effect.orDie)
    const consumed = yield* LearningFrontier.read(tx)
    const frontier = yield* LearningFrontier.advance(tx, { time: metadata.time, consumed: [consumed] })
    const receiptID = yield* insertPhysicalReceipt(tx, envelope, metadata)
    const changed = candidate.materialized.filter((item) => item.outcome === "changed")
    const projections = changeProjections(candidate)
    const intentResults = intentResultProjections(candidate)
    const results = candidate.materialized.map((item) =>
      item.outcome === "no_change"
        ? {
            outcome: item.outcome,
            ordinal: item.ordinal,
            operation: item.intent.type,
            assignmentID: item.assignmentID,
            currentRevisionID: item.revisionID,
            currentRevisionVersion: item.current!.current.version,
          }
        : {
            outcome: item.outcome,
            ordinal: item.ordinal,
            operation: item.intent.type,
            assignmentID: item.assignmentID,
            revisionID: item.revisionID,
            ...(item.successorAssignmentID ? { successorAssignmentID: item.successorAssignmentID } : {}),
            ...(item.successorRevisionID ? { successorRevisionID: item.successorRevisionID } : {}),
          },
    )
    const address = semanticAddressFor(candidate.canonicalCommand, envelope)
    const acknowledgement = renderAcknowledgement(projections, intentResults)
    yield* tx
      .insert(AssignmentEffectTable)
      .values({
        id: candidate.effectID,
        commit_seal_id: candidate.effectID,
        cause_type: candidate.canonicalCommand.cause.type,
        occurrence_id: envelope.occurrenceID,
        source_revision_id: address.type === "source_observation" ? address.sourceRevisionID : null,
        source_locator_digest: address.type === "source_observation" ? address.locatorDigest : null,
        model_operation_id: envelope.assistantMessageID,
        semantic_slot: address.slot,
        semantic_address_fingerprint: candidate.semanticAddressFingerprint,
        canonical_command: candidate.canonicalCommand,
        command_fingerprint: candidate.commandFingerprint,
        invocation_part_id: envelope.partID,
        physical_receipt_id: receiptID,
        admission_projection: toJsonValue({ agentAction: candidate.agentAction, causeBasis: candidate.causeBasis }) as Record<
          string,
          unknown
        >,
        results,
        time_committed: metadata.time,
        commit_order: metadata.order,
        frontier_sequence: frontier.sequence,
        frontier_time: frontier.time,
        acknowledgement_title: acknowledgement.title,
        acknowledgement_body: acknowledgement.body,
      })
      .run()
      .pipe(Effect.orDie)

    const newAssignments = changed.flatMap((item) => [
      ...(!item.current ? [{ id: item.assignmentID, time: metadata.time }] : []),
      ...(item.successorRevisionID && item.successorAssignmentID
        ? [{ id: item.successorAssignmentID, time: metadata.time }]
        : []),
    ])
    yield* Effect.forEach(
      newAssignments,
      (assignment) =>
        tx
          .insert(AssignmentTable)
          .values({ id: assignment.id, time_created: assignment.time })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    const authorship = mutationAuthorship(candidate.canonicalCommand, candidate.agentAction)
    yield* Effect.forEach(
      changed,
      (item) =>
        Effect.gen(function* () {
          yield* insertRevision(tx, {
            item,
            revisionID: item.revisionID,
            assignmentID: item.assignmentID,
            version: item.current ? item.current.current.version + 1 : 1,
            predecessorRevisionID: item.current?.current.id,
            operationOrdinal: item.ordinal * 2,
            snapshot: item.snapshot,
            disposition: item.finalDisposition,
            creationSourceBasis: item.creationSourceBasis,
            effectiveSourceBasis: item.effectiveSourceBasis,
            sourceAdmissionBasis: item.sourceAdmissionBasis,
            sourceBasisRelation: item.sourceBasisRelation,
            supersessionTarget: item.relationTarget,
            authorship,
            effectID: candidate.effectID,
            metadata,
            frontierSequence: frontier.sequence,
          })
          if (!item.successorRevisionID || !item.successorAssignmentID || !item.successorSnapshot) return
          const successorSource =
            candidate.causeBasis.type === "assignment_owner_read"
              ? item.current!.current.effectiveSourceBasisAtCommit
              : candidate.causeBasis
          yield* insertRevision(tx, {
            item,
            revisionID: item.successorRevisionID,
            assignmentID: item.successorAssignmentID,
            version: 1,
            operationOrdinal: item.ordinal * 2 + 1,
            snapshot: item.successorSnapshot,
            disposition: "open",
            creationSourceBasis: successorSource,
            effectiveSourceBasis: successorSource,
            sourceAdmissionBasis: item.sourceAdmissionBasis,
            sourceBasisRelation: "corrected_with_new_exact_source",
            authorship,
            effectID: candidate.effectID,
            metadata,
            frontierSequence: frontier.sequence,
          })
        }),
      { discard: true },
    )
    const settlement = {
      outcome: "applied",
      assignmentKind: "change_set",
      receiptID,
      effectID: candidate.effectID,
      changes: projections,
      intentResults,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies AppliedSettlement
    yield* settlePhysicalInvocation(tx, envelope.partID, settlement)
    yield* tx
      .insert(AssignmentCommitSealTable)
      .values({ effect_id: candidate.effectID, receipt_id: receiptID, invocation_part_id: envelope.partID })
      .run()
      .pipe(Effect.orDie)
    return settlement
  })
}

function insertRevision(
  tx: Transaction,
  input: Readonly<{
    item: MaterializedIntent
    revisionID: RevisionID
    assignmentID: AssignmentID
    version: number
    predecessorRevisionID?: RevisionID
    operationOrdinal: number
    snapshot: SemanticSnapshot
    disposition: Revision["disposition"]
    creationSourceBasis: EffectiveSourceBasis
    effectiveSourceBasis: EffectiveSourceBasis
    sourceAdmissionBasis: SourceAdmissionBasis
    sourceBasisRelation: SourceBasisRelation
    supersessionTarget?: AssignmentRevisionRef
    authorship: MutationAuthorshipBasis
    effectID: EffectID
    metadata: SettlementMetadata
    frontierSequence: number
  }>,
) {
  return Effect.gen(function* () {
    const sourceColumns = effectiveSourceColumns(input.effectiveSourceBasis)
    yield* tx
      .insert(AssignmentRevisionTable)
      .values({
        id: input.revisionID,
        assignment_id: input.assignmentID,
        version: input.version,
        predecessor_revision_id: input.predecessorRevisionID ?? null,
        effect_id: input.effectID,
        operation_ordinal: input.operationOrdinal,
        operation: input.item.intent.type,
        snapshot: input.snapshot,
        obligation_summary: input.snapshot.obligationSummary,
        learning_context: input.snapshot.learningContext,
        scope_type: input.snapshot.scope.type,
        scope_count: input.snapshot.scope.type === "courses" ? input.snapshot.scope.courseIDs.length : 0,
        due_basis: input.snapshot.dueBasis,
        expiry_boundary: input.snapshot.expiryBoundary ?? null,
        disposition: input.disposition,
        creation_source_basis: input.creationSourceBasis,
        effective_source_basis: input.effectiveSourceBasis,
        source_admission_basis: input.sourceAdmissionBasis,
        mutation_authorship_basis: input.authorship,
        source_basis_relation: input.sourceBasisRelation,
        ...sourceColumns,
        supersession_target_assignment_id: input.supersessionTarget?.assignmentID ?? null,
        supersession_target_revision_id: input.supersessionTarget?.revisionID ?? null,
        supersession_target_version: input.supersessionTarget?.version ?? null,
        time_committed: input.metadata.time,
        commit_order: input.metadata.order,
        frontier_sequence: input.frontierSequence,
      })
      .run()
      .pipe(Effect.orDie)
    if (input.snapshot.scope.type === "courses") {
      yield* Effect.forEach(
        input.snapshot.scope.courseIDs,
        (courseID, ordinal) =>
          tx
            .insert(AssignmentRevisionScopeTable)
            .values({ revision_id: input.revisionID, ordinal, course_id: courseID })
            .run()
            .pipe(Effect.orDie),
        { discard: true },
      )
    }
  })
}

type RevisionRow = typeof AssignmentRevisionTable.$inferSelect
type HeadRow = RevisionRow & Readonly<{ assignment_time_created: number }>

function currentOwnerCut(tx: Transaction) {
  return Effect.gen(function* () {
    const latest = yield* tx
      .select({
        sequence: sql<number>`coalesce(max(${AssignmentRevisionTable.frontier_sequence}), 0)`,
        time: sql<number>`coalesce(max(${AssignmentRevisionTable.time_committed}), 0)`,
      })
      .from(AssignmentRevisionTable)
      .where(committedRevision)
      .get()
      .pipe(Effect.orDie)
    const frontierSequence = Number(latest?.sequence ?? 0)
    const frontierTime = Number(latest?.time ?? 0)
    const headCount = yield* countHeadsAtCut(tx, frontierSequence)
    const value = { frontierSequence, frontierTime, headCount }
    return { ...value, fingerprint: fingerprint(value) } satisfies OwnerCut
  })
}

function ownerCutAt(tx: Transaction, throughFrontierSequence: number) {
  return Effect.gen(function* () {
    const latest = yield* tx
      .select({
        sequence: sql<number>`coalesce(max(${AssignmentRevisionTable.frontier_sequence}), 0)`,
        time: sql<number>`coalesce(max(${AssignmentRevisionTable.time_committed}), 0)`,
      })
      .from(AssignmentRevisionTable)
      .where(
        and(
          committedRevision,
          sql`${AssignmentRevisionTable.frontier_sequence} <= ${throughFrontierSequence}`,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    const frontierSequence = Number(latest?.sequence ?? 0)
    const frontierTime = Number(latest?.time ?? 0)
    const headCount = yield* countHeadsAtCut(tx, frontierSequence)
    const value = { frontierSequence, frontierTime, headCount }
    return { ...value, fingerprint: fingerprint(value) } satisfies OwnerCut
  })
}

function countHeadsAtCut(tx: Transaction, frontierSequence: number) {
  return tx
    .get<{ value: number }>(sql`
      SELECT count(*) AS value
      FROM assignment_revision AS revision
      WHERE revision.frontier_sequence <= ${frontierSequence}
        AND EXISTS (
          SELECT 1
          FROM assignment_effect AS effect
          JOIN assignment_commit_seal AS seal ON seal.effect_id = effect.id
          JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
          JOIN learning_command_invocation AS invocation
            ON invocation.part_id = seal.invocation_part_id
              AND invocation.receipt_id = receipt.id
              AND invocation.status = 'applied'
          WHERE effect.id = revision.effect_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM assignment_revision AS successor
          JOIN assignment_effect AS successor_effect ON successor_effect.id = successor.effect_id
          JOIN assignment_commit_seal AS successor_seal ON successor_seal.effect_id = successor_effect.id
          JOIN learning_command_receipt AS successor_receipt ON successor_receipt.id = successor_seal.receipt_id
          JOIN learning_command_invocation AS successor_invocation
            ON successor_invocation.part_id = successor_seal.invocation_part_id
              AND successor_invocation.receipt_id = successor_receipt.id
              AND successor_invocation.status = 'applied'
          WHERE successor.predecessor_revision_id = revision.id
            AND successor.frontier_sequence <= ${frontierSequence}
        )
    `)
    .pipe(Effect.orDie, Effect.map((row) => Number(row?.value ?? 0)))
}

function currentAssignment(tx: Transaction, assignmentID: AssignmentID) {
  return Effect.gen(function* () {
    const cut = yield* currentOwnerCut(tx)
    return yield* assignmentAtCut(tx, assignmentID, cut.frontierSequence)
  })
}

function assignmentAtCut(tx: Transaction, assignmentID: AssignmentID, frontierSequence: number) {
  return Effect.gen(function* () {
    const identityRow = yield* tx
      .select()
      .from(AssignmentTable)
      .where(eq(AssignmentTable.id, assignmentID))
      .get()
      .pipe(Effect.orDie)
    if (!identityRow) return undefined
    const head = yield* tx
      .select()
      .from(AssignmentRevisionTable)
      .where(
        and(
          eq(AssignmentRevisionTable.assignment_id, assignmentID),
          sql`${AssignmentRevisionTable.frontier_sequence} <= ${frontierSequence}`,
          committedRevision,
          noCommittedSuccessorAt(frontierSequence),
        ),
      )
      .orderBy(desc(AssignmentRevisionTable.version), desc(AssignmentRevisionTable.id))
      .limit(1)
      .get()
      .pipe(Effect.orDie)
    if (!head) return undefined
    return { id: identityRow.id, timeCreated: identityRow.time_created, current: yield* revisionFromRow(tx, head) } satisfies AssignmentSnapshot
  })
}

function exactRevision(tx: Transaction, assignmentID: AssignmentID, revisionID: RevisionID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(AssignmentRevisionTable)
      .where(
        and(
          eq(AssignmentRevisionTable.assignment_id, assignmentID),
          eq(AssignmentRevisionTable.id, revisionID),
          committedRevision,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    return row ? yield* revisionFromRow(tx, row) : undefined
  })
}

function assignmentFromHeadRow(tx: Transaction, row: HeadRow) {
  return revisionFromRow(tx, row).pipe(
    Effect.map(
      (revision) =>
        ({ id: row.assignment_id, timeCreated: row.assignment_time_created, current: revision }) satisfies AssignmentSnapshot,
    ),
  )
}

function revisionFromRow(tx: Transaction, row: RevisionRow) {
  return Effect.gen(function* () {
    const scopeRows = yield* tx
      .select()
      .from(AssignmentRevisionScopeTable)
      .where(eq(AssignmentRevisionScopeTable.revision_id, row.id))
      .orderBy(asc(AssignmentRevisionScopeTable.ordinal))
      .all()
      .pipe(Effect.orDie)
    if (scopeRows.length !== row.scope_count) return yield* integrity("Assignment revision scope count is corrupt")
    const scope: Scope =
      row.scope_type === "learner_home"
        ? { type: "learner_home" }
        : { type: "courses", courseIDs: scopeRows.map((scopeRow) => scopeRow.course_id) }
    const stored = row.snapshot as SemanticSnapshot
    if (
      stored.obligationSummary !== row.obligation_summary ||
      stored.learningContext !== row.learning_context ||
      !isDeepStrictEqual(stored.scope, scope) ||
      !isDeepStrictEqual(stored.dueBasis, row.due_basis) ||
      !isDeepStrictEqual(stored.expiryBoundary, row.expiry_boundary ?? undefined)
    ) {
      return yield* integrity("Assignment revision complete snapshot is inconsistent")
    }
    return {
      id: row.id,
      assignmentID: row.assignment_id,
      version: row.version,
      ...(row.predecessor_revision_id ? { predecessorRevisionID: row.predecessor_revision_id } : {}),
      operation: row.operation as Intent["type"],
      snapshot: stored,
      disposition: row.disposition,
      creationSourceBasis: row.creation_source_basis,
      effectiveSourceBasisAtCommit: row.effective_source_basis,
      sourceAdmissionBasisAtCommit: row.source_admission_basis,
      mutationAuthorshipBasis: row.mutation_authorship_basis,
      sourceBasisRelationToPredecessor: row.source_basis_relation,
      ...(row.supersession_target_assignment_id && row.supersession_target_revision_id && row.supersession_target_version
        ? {
            supersessionTarget: {
              assignmentID: row.supersession_target_assignment_id,
              revisionID: row.supersession_target_revision_id,
              version: row.supersession_target_version,
            },
          }
        : {}),
      effectID: row.effect_id,
      timeCommitted: row.time_committed,
      commitOrder: row.commit_order,
      frontierSequence: row.frontier_sequence,
    } satisfies Revision
  })
}

function projectionAtCut(
  tx: Transaction,
  head: AssignmentSnapshot | undefined,
  revision: Revision,
  ownerCut: OwnerCut,
  asOf: number,
) {
  return Effect.gen(function* () {
    const scopeCurrentRelationsAtCut: ScopeCurrentRelation[] =
      revision.snapshot.scope.type === "learner_home"
        ? []
        : yield* Effect.forEach(revision.snapshot.scope.courseIDs, (courseID) =>
            Course.inspectPreferenceTargetAtCut(tx, courseID, asOf).pipe(
              Effect.map((status) =>
                status.status === "available"
                  ? ({ courseID, status: "available", version: status.stateVersion } satisfies ScopeCurrentRelation)
                  : ({
                      courseID,
                      status: status.cause,
                      ...(status.stateVersion === undefined ? {} : { version: status.stateVersion }),
                    } satisfies ScopeCurrentRelation),
              ),
            ),
          )
    const sourceStatus = yield* sourceStatusAtCut(tx, revision.effectiveSourceBasisAtCommit, asOf)
    if (sourceChangedAfterAsOf(sourceStatus.ownerRecordedState)) return yield* invalid("stale")
    return {
      assignmentRevisionRef: revisionReference(revision),
      assignmentOwnerCut: ownerCut,
      asOf,
      currentHeadRelation: !head ? "missing" : head.current.id === revision.id ? "current" : "superseded_by_revision",
      ...(head ? { currentHeadRevisionRef: revisionReference(head.current) } : {}),
      dueRelationAtCut: dueRelation(revision.snapshot.dueBasis, asOf),
      expiryRelationAtCut: expiryRelation(revision.snapshot.expiryBoundary, asOf),
      scopeCurrentRelationsAtCut,
      sourceStatusAtCut: sourceStatus,
      revision,
    } satisfies ProjectionAtCut
  })
}

function sourceChangedAfterAsOf(ownerRecordedState: Readonly<{ readonly [key: string]: unknown }>) {
  return ownerRecordedState.state === "changed_after_as_of"
}

function sourceStatusAtCut(tx: Transaction, basis: EffectiveSourceBasis, asOf: number) {
  if (basis.type === "learner_occurrence") {
    return Occurrence.inspectSourceStatusAtCut(tx, { occurrenceID: basis.occurrenceID, asOf }).pipe(
      Effect.map((status) => ({
        sourceOwner: "learner_occurrence" as const,
        exactSourceLocator: { occurrenceID: basis.occurrenceID },
        ownerRecordedState: toJsonValue(status) as Readonly<{ readonly [key: string]: unknown }>,
        exactOwnerDependency: {
          owner: "learner_occurrence" as const,
          occurrenceID: basis.occurrenceID,
          state: status.state,
          sourceOrder: status.admitted?.sourceOrder ?? null,
          timeAdmitted: status.admitted?.timeAdmitted ?? null,
          tombstoneTime: status.tombstone?.timeDeleted ?? null,
        },
        asOf,
      })),
    )
  }
  if (basis.type === "artifact_revision") {
    return Artifact.inspectRevisionStatusAtCut(tx, {
      artifactID: basis.artifactID,
      revisionID: basis.revisionID,
      attribution: basis.attribution,
      asOf,
    }).pipe(
      Effect.map((status) => ({
        sourceOwner: "artifact" as const,
        exactSourceLocator: {
          artifactID: basis.artifactID,
          revisionID: basis.revisionID,
          attribution: basis.attribution,
        },
        ownerRecordedState: toJsonValue(status) as Readonly<{ readonly [key: string]: unknown }>,
        exactOwnerDependency: {
          owner: "artifact" as const,
          artifactID: basis.artifactID,
          revisionID: basis.revisionID,
          attribution: basis.attribution,
          activeSource: status.activeSource,
          exactRevision: status.exactRevision,
        },
        asOf,
      })),
      Effect.catch(() => integrity("Artifact source projection failed")),
    )
  }
  return Representation.inspectLearningContextMetadataAtCut(tx, basis.representationRevisionID, asOf).pipe(
    Effect.map((status) => {
      if (!("representation" in status)) {
        const ownerRecordedState = {
          state: "changed_after_as_of" as const,
          latestTime: status.dependencyAtCut.latestTime,
        }
        return {
          sourceOwner: "representation" as const,
          exactSourceLocator: { representationRevisionID: basis.representationRevisionID },
          ownerRecordedState,
          exactOwnerDependency: {
            owner: "representation" as const,
            representationRevisionID: basis.representationRevisionID,
            dependencyAtCut: status.dependencyAtCut,
          },
          asOf,
        }
      }
      return {
        sourceOwner: "representation" as const,
        exactSourceLocator: { representationRevisionID: basis.representationRevisionID },
        ownerRecordedState: toJsonValue(status) as Readonly<{ readonly [key: string]: unknown }>,
        exactOwnerDependency: {
          owner: "representation" as const,
          representationRevisionID: basis.representationRevisionID,
          timeAccepted: status.representation.timeAccepted,
          availability: status.representation.availability,
          currentUse: status.currentUse,
          currentArtifact: status.currentArtifact
            ? {
                effectiveArtifactID: status.currentArtifact.effectiveArtifactID,
                dispositionVersion: status.currentArtifact.dispositionVersion,
                lineageVersion: status.currentArtifact.lineageVersion,
                currentRevisionID: status.currentArtifact.currentRevisionID,
                attribution: status.currentArtifact.attribution,
              }
            : null,
          continuedUseGrant: status.activeContinuedUseGrant
            ? {
                id: status.activeContinuedUseGrant.id,
                version: status.activeContinuedUseGrant.version,
                disposition: status.activeContinuedUseGrant.disposition,
                currentSourceRevisionID: status.activeContinuedUseGrant.currentSourceRevisionID,
                currentLineageVersion: status.activeContinuedUseGrant.currentLineageVersion,
              }
            : null,
          artifactDependency: status.artifactDependency,
          latestGrant: status.latestGrant,
        },
        asOf,
      }
    }),
    Effect.catch((error) => {
      if (error instanceof Representation.NotFoundError) {
        const ownerRecordedState = { state: "unavailable" as const, cause: "representation_not_found" as const }
        return Effect.succeed({
          sourceOwner: "representation" as const,
          exactSourceLocator: { representationRevisionID: basis.representationRevisionID },
          ownerRecordedState,
          exactOwnerDependency: {
            owner: "representation" as const,
            representationRevisionID: basis.representationRevisionID,
            state: "unavailable" as const,
            cause: "representation_not_found" as const,
          },
          asOf,
        })
      }
      return integrity("Representation source projection failed")
    }),
  )
}

function dueRelation(basis: DueBasis, asOf: number): DueRelation {
  if (basis.type === "unresolved" || basis.type === "explicitly_no_deadline") return { type: basis.type }
  if (basis.type === "local_date") {
    const current = localDateAtResolvedZone(asOf, basis.resolvedZone, "Assignment")
    const relation = current < basis.civilDate ? "before" : current > basis.civilDate ? "after" : "on"
    return {
      type: "local_date",
      relation,
      overdue: relation === "after" || (relation === "on" && basis.comparator === "exclusive"),
    }
  }
  const relation = asOf < basis.normalizedInstant ? "before" : asOf > basis.normalizedInstant ? "after" : "at"
  return {
    type: "instant",
    relation,
    overdue: relation === "after" || (relation === "at" && basis.comparator === "exclusive"),
  }
}

function expiryRelation(basis: TemporalBoundary | undefined, asOf: number): ExpiryRelation {
  if (!basis) return { type: "none" }
  if (basis.type === "local_date") {
    const current = localDateAtResolvedZone(asOf, basis.resolvedZone, "Assignment")
    const relation = current < basis.civilDate ? "before" : current > basis.civilDate ? "after" : "on"
    return {
      type: "local_date",
      relation,
      expired: relation === "after" || (relation === "on" && basis.comparator === "exclusive"),
    }
  }
  const relation = asOf < basis.normalizedInstant ? "before" : asOf > basis.normalizedInstant ? "after" : "at"
  return {
    type: "instant",
    relation,
    expired: relation === "after" || (relation === "at" && basis.comparator === "exclusive"),
  }
}

function discoverHeadsAtCut(
  tx: Transaction,
  query: Extract<ReadQuery, { type: "discover" }>,
  frontierSequence: number,
  after: Readonly<{ type: "discover"; timeCreated: number; assignmentID: AssignmentID }> | undefined,
  limit: number,
) {
  return Effect.gen(function* () {
    const base = [
      sql`revision.frontier_sequence <= ${frontierSequence}`,
      sql`EXISTS (
        SELECT 1
        FROM assignment_effect AS effect
        JOIN assignment_commit_seal AS seal ON seal.effect_id = effect.id
        JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
        JOIN learning_command_invocation AS invocation
          ON invocation.part_id = seal.invocation_part_id
            AND invocation.receipt_id = receipt.id
            AND invocation.status = 'applied'
        WHERE effect.id = revision.effect_id
      )`,
      sql`NOT EXISTS (
        SELECT 1
        FROM assignment_revision AS successor
        JOIN assignment_effect AS successor_effect ON successor_effect.id = successor.effect_id
        JOIN assignment_commit_seal AS successor_seal ON successor_seal.effect_id = successor_effect.id
        JOIN learning_command_receipt AS successor_receipt ON successor_receipt.id = successor_seal.receipt_id
        JOIN learning_command_invocation AS successor_invocation
          ON successor_invocation.part_id = successor_seal.invocation_part_id
            AND successor_invocation.receipt_id = successor_receipt.id
            AND successor_invocation.status = 'applied'
        WHERE successor.predecessor_revision_id = revision.id
          AND successor.frontier_sequence <= ${frontierSequence}
      )`,
      ...(query.disposition ? [sql`revision.disposition = ${query.disposition}`] : []),
      ...(query.courseID
        ? [
            sql`EXISTS (
              SELECT 1 FROM assignment_revision_scope AS scope
              WHERE scope.revision_id = revision.id AND scope.course_id = ${query.courseID}
            )`,
          ]
        : []),
    ]
    const conditions = [
      ...base,
      ...(after
        ? [
            sql`(identity.time_created > ${after.timeCreated}
              OR (identity.time_created = ${after.timeCreated} AND identity.id > ${after.assignmentID}))`,
          ]
        : []),
    ]
    const countRow = yield* tx
      .get<{ value: number }>(sql`
        SELECT count(*) AS value
        FROM assignment_revision AS revision
        JOIN assignment AS identity ON identity.id = revision.assignment_id
        WHERE ${sql.join(base, sql` AND `)}
      `)
      .pipe(Effect.orDie)
    const ids = yield* tx
      .all<{ id: RevisionID; assignment_time_created: number }>(sql`
        SELECT revision.id AS id, identity.time_created AS assignment_time_created
        FROM assignment_revision AS revision
        JOIN assignment AS identity ON identity.id = revision.assignment_id
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY identity.time_created ASC, identity.id ASC
        LIMIT ${limit}
      `)
      .pipe(Effect.orDie)
    const rows = yield* Effect.forEach(ids, (item) =>
      tx
        .select()
        .from(AssignmentRevisionTable)
        .where(eq(AssignmentRevisionTable.id, item.id))
        .get()
        .pipe(
          Effect.orDie,
          Effect.flatMap((row) =>
            row
              ? Effect.succeed({ ...row, assignment_time_created: item.assignment_time_created } satisfies HeadRow)
              : integrity("Assignment head disappeared inside one transaction"),
          ),
        ),
    )
    return { countAtCut: Number(countRow?.value ?? 0), rows }
  })
}

function countHistoryAtCut(tx: Transaction, assignmentID: AssignmentID, frontierSequence: number) {
  return tx
    .select({ value: count() })
    .from(AssignmentRevisionTable)
    .where(
      and(
        eq(AssignmentRevisionTable.assignment_id, assignmentID),
        sql`${AssignmentRevisionTable.frontier_sequence} <= ${frontierSequence}`,
        committedRevision,
      ),
    )
    .get()
    .pipe(Effect.orDie, Effect.map((row) => Number(row?.value ?? 0)))
}

function page(
  ownerCut: OwnerCut,
  asOf: number,
  order: ReadPage["order"],
  items: ReadPage["items"],
  byteLimit: number,
) {
  return boundedPage(
    {
      schemaVersion: 1,
      ownerCut,
      asOf,
      order,
      countAtCut: items.length,
      returnedCount: items.length,
      omittedCount: 0,
      truncated: false,
      items,
    },
    byteLimit,
  )
}

function fitPaginatedPage(input: {
  readonly ownerCut: OwnerCut
  readonly asOf: number
  readonly order: ReadPage["order"]
  readonly countAtCut: number
  readonly items: ReadPage["items"]
  readonly byteLimit: number
  readonly cursorFor: (retainedCount: number) => string | undefined
}) {
  if (input.items.length === 0) {
    return boundedPage(
      {
        schemaVersion: 1,
        ownerCut: input.ownerCut,
        asOf: input.asOf,
        order: input.order,
        countAtCut: input.countAtCut,
        returnedCount: 0,
        omittedCount: input.countAtCut,
        truncated: false,
        items: [],
      },
      input.byteLimit,
    )
  }
  for (let retainedCount = input.items.length; retainedCount > 0; retainedCount--) {
    const nextCursor = input.cursorFor(retainedCount)
    try {
      return boundedPage(
        {
          schemaVersion: 1,
          ownerCut: input.ownerCut,
          asOf: input.asOf,
          order: input.order,
          countAtCut: input.countAtCut,
          returnedCount: retainedCount,
          omittedCount: Math.max(0, input.countAtCut - retainedCount),
          truncated: Boolean(nextCursor),
          ...(nextCursor ? { nextCursor } : {}),
          items: input.items.slice(0, retainedCount),
        },
        input.byteLimit,
      )
    } catch (error) {
      if (!(error instanceof InvalidCommandError) || error.reason !== "capacity_exceeded") throw error
    }
  }
  throw invalidError("capacity_exceeded")
}

function boundedPage(input: Omit<ReadPage, "canonicalBytes">, byteLimit: number): ReadPage {
  const canonicalBytes = utf8Bytes(canonicalJson(toJsonValue(input)))
  if (canonicalBytes > byteLimit) throw invalidError("capacity_exceeded")
  return { ...input, canonicalBytes }
}

type Cursor = Readonly<{
  schemaVersion: 1
  queryFingerprint: string
  ownerCut: OwnerCut
  dependencies: readonly Readonly<{
    assignmentID: AssignmentID
    revisionID: RevisionID
    fingerprint: string
  }>[]
  dependencySetFingerprint: string
  asOf: number
  after:
    | Readonly<{ type: "history"; version: number }>
    | Readonly<{ type: "discover"; timeCreated: number; assignmentID: AssignmentID }>
  fingerprint: string
}>

function encodeCursor(cursor: Omit<Cursor, "dependencySetFingerprint" | "fingerprint">) {
  const body = { ...cursor, dependencySetFingerprint: fingerprint(cursor.dependencies) }
  return Buffer.from(canonicalJson(toJsonValue({ ...body, fingerprint: fingerprint(body) }))).toString("base64url")
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor
    if (
      parsed.schemaVersion !== 1 ||
      !/^[0-9a-f]{64}$/.test(parsed.queryFingerprint) ||
      !/^[0-9a-f]{64}$/.test(parsed.ownerCut?.fingerprint) ||
      !Number.isInteger(parsed.ownerCut?.frontierSequence) ||
      !Number.isInteger(parsed.ownerCut?.frontierTime) ||
      !Number.isInteger(parsed.ownerCut?.headCount) ||
      !Array.isArray(parsed.dependencies) ||
      parsed.dependencies.length > MAX_READ_ITEMS ||
      parsed.dependencies.some(
        (dependency) =>
          !/^asn_[0-9A-Za-z]{26}$/.test(dependency.assignmentID) ||
          !/^asr_[0-9A-Za-z]{26}$/.test(dependency.revisionID) ||
          !/^[0-9a-f]{64}$/.test(dependency.fingerprint),
      ) ||
      !/^[0-9a-f]{64}$/.test(parsed.dependencySetFingerprint) ||
      parsed.dependencySetFingerprint !== fingerprint(parsed.dependencies) ||
      !Number.isInteger(parsed.asOf) ||
      (parsed.after.type !== "history" && parsed.after.type !== "discover") ||
      !/^[0-9a-f]{64}$/.test(parsed.fingerprint) ||
      parsed.fingerprint !==
        fingerprint(Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== "fingerprint")))
    ) {
      throw new Error("invalid")
    }
    return parsed
  } catch {
    throw invalidError("validation_error")
  }
}

function projectionDependency(projection: ProjectionAtCut) {
  return {
    assignmentID: projection.assignmentRevisionRef.assignmentID,
    revisionID: projection.assignmentRevisionRef.revisionID,
    fingerprint: fingerprint({
      sourceStatusAtCut: projection.sourceStatusAtCut,
      scopeCurrentRelationsAtCut: projection.scopeCurrentRelationsAtCut,
    }),
  }
}

function validateFinalGraph(tx: Transaction, materialized: readonly MaterializedIntent[], frontierSequence: number) {
  return Effect.gen(function* () {
    const heads = yield* tx
      .all<{
        assignment_id: AssignmentID
        target_assignment_id: AssignmentID | null
        target_revision_id: RevisionID | null
        target_version: number | null
      }>(sql`
        SELECT revision.assignment_id,
          revision.supersession_target_assignment_id AS target_assignment_id,
          revision.supersession_target_revision_id AS target_revision_id,
          revision.supersession_target_version AS target_version
        FROM assignment_revision AS revision
        WHERE revision.frontier_sequence <= ${frontierSequence}
          AND EXISTS (
            SELECT 1
            FROM assignment_effect AS effect
            JOIN assignment_commit_seal AS seal ON seal.effect_id = effect.id
            JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
            JOIN learning_command_invocation AS invocation
              ON invocation.part_id = seal.invocation_part_id
                AND invocation.receipt_id = receipt.id
                AND invocation.status = 'applied'
            WHERE effect.id = revision.effect_id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM assignment_revision AS successor
            JOIN assignment_effect AS successor_effect ON successor_effect.id = successor.effect_id
            JOIN assignment_commit_seal AS successor_seal ON successor_seal.effect_id = successor_effect.id
            JOIN learning_command_receipt AS successor_receipt ON successor_receipt.id = successor_seal.receipt_id
            JOIN learning_command_invocation AS successor_invocation
              ON successor_invocation.part_id = successor_seal.invocation_part_id
                AND successor_invocation.receipt_id = successor_receipt.id
                AND successor_invocation.status = 'applied'
            WHERE successor.predecessor_revision_id = revision.id
              AND successor.frontier_sequence <= ${frontierSequence}
          )
      `)
      .pipe(Effect.orDie)
    const edges = new Map<AssignmentID, AssignmentID | undefined>(
      heads.map((head) => [head.assignment_id, head.target_assignment_id ?? undefined]),
    )
    materialized.forEach((item) => {
      edges.set(item.assignmentID, item.relationTarget?.assignmentID)
      if (item.successorRevisionID && item.successorAssignmentID) edges.set(item.successorAssignmentID, undefined)
    })
    const incoming = new Map<AssignmentID, number>()
    edges.forEach((target, source) => {
      if (!target) return
      if (target === source || !edges.has(target)) throw invalidError("graph_conflict")
      incoming.set(target, (incoming.get(target) ?? 0) + 1)
      if (incoming.get(target)! > 1) throw invalidError("graph_conflict")
    })
    edges.forEach((_target, origin) => {
      const seen = new Set<AssignmentID>()
      let current: AssignmentID | undefined = origin
      while (current) {
        if (seen.has(current)) throw invalidError("graph_conflict")
        seen.add(current)
        current = edges.get(current)
      }
    })
  })
}

function currentRootSource(tx: Transaction, occurrenceID: InvocationEnvelope["occurrenceID"], requireAvailable: boolean) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ occurrence: AdmittedLearnerOccurrenceTable, input: TurnInputTable, turn: TurnTable })
      .from(AdmittedLearnerOccurrenceTable)
      .innerJoin(
        TurnInputTable,
        and(
          eq(TurnInputTable.occurrence_id, AdmittedLearnerOccurrenceTable.id),
          eq(TurnInputTable.session_id, AdmittedLearnerOccurrenceTable.origin_session_id),
          eq(TurnInputTable.message_id, AdmittedLearnerOccurrenceTable.origin_message_id),
        ),
      )
      .innerJoin(TurnTable, eq(TurnTable.id, TurnInputTable.turn_id))
      .where(eq(AdmittedLearnerOccurrenceTable.id, occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (
      !row ||
      row.occurrence.source_order === null ||
      row.turn.admission_kind !== "learner" ||
      row.turn.depth !== 0 ||
      (row.input.source !== "learner_root" && row.input.source !== "learner_steer")
    ) {
      return yield* invalid("source_unavailable")
    }
    if (requireAvailable) {
      yield* Occurrence.requireAvailableSource(tx, {
        sessionID: row.occurrence.origin_session_id,
        messageID: row.occurrence.origin_message_id,
        occurrenceID: row.occurrence.id,
      }).pipe(Effect.mapError(() => invalidError("source_unavailable")))
    }
    const sourceTemporalContext: SourceTemporalContext =
      row.occurrence.source_temporal_state === "resolved" &&
      row.occurrence.source_timezone &&
      row.occurrence.source_utc_offset_minutes !== null
          ? {
            state: "resolved",
            instant: row.occurrence.time_admitted,
            timeZone: row.occurrence.source_timezone,
            utcOffsetMinutes: row.occurrence.source_utc_offset_minutes,
          }
        : { state: "unavailable", instant: row.occurrence.time_admitted, reason: "timezone_unavailable" }
    return {
      occurrenceID: row.occurrence.id,
      sourceOrder: row.occurrence.source_order,
      sessionID: row.occurrence.origin_session_id,
      messageID: row.occurrence.origin_message_id,
      turnID: row.turn.id,
      inputID: row.input.id,
      timeAdmitted: row.occurrence.time_admitted,
      sourceTemporalContext,
    } satisfies RootSource
  })
}

function bindLearnerExcerpt(tx: Transaction, excerpt: ExcerptIntent, source: RootSource) {
  return Effect.gen(function* () {
    requireExcerptShape(excerpt)
    const text = yield* learnerText(tx, source.sessionID, source.messageID)
    const bytes = new TextEncoder().encode(text)
    if (excerpt.endByte > bytes.byteLength) return yield* invalid("source_unavailable")
    const observed = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(excerpt.startByte, excerpt.endByte))
    if (observed !== excerpt.text) return yield* invalid("source_unavailable")
    return {
      type: "learner_occurrence" as const,
      occurrenceID: source.occurrenceID,
      sourceOrder: source.sourceOrder,
      sessionID: source.sessionID,
      messageID: source.messageID,
      turnID: source.turnID,
      inputID: source.inputID,
      timeAdmitted: source.timeAdmitted,
      sourceTemporalContext: source.sourceTemporalContext,
      excerpt: { ...excerpt, sha256: sha256(excerpt.text) },
    } satisfies EffectiveSourceBasis
  }).pipe(
    Effect.catch((error) =>
      error instanceof InvalidCommandError ? Effect.fail(error) : Effect.fail(invalidError("source_unavailable")),
    ),
  )
}

function learnerText(tx: Transaction, sessionID: RootSource["sessionID"], messageID: MessageID) {
  return Effect.gen(function* () {
    const message = yield* tx
      .select({ data: MessageTable.data })
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, sessionID), eq(MessageTable.id, messageID)))
      .get()
      .pipe(Effect.orDie)
    if (!message || message.data.role !== "user") return yield* invalid("source_unavailable")
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
        const value = part.data as Omit<SessionV1.TextPart, "id" | "sessionID" | "messageID">
        return value.synthetic === true ? [] : [value.text]
      })
      .join("\n")
  })
}

function requireOwnerRead(tx: Transaction, ownerRead: OwnerReadReference) {
  return Effect.gen(function* () {
    const current = yield* currentAssignment(tx, ownerRead.assignmentID)
    if (
      !current ||
      current.current.id !== ownerRead.revisionID ||
      current.current.version !== ownerRead.version ||
      headReferenceFingerprint(current) !== ownerRead.ownerCutFingerprint
    ) {
      return yield* invalid("stale")
    }
    return current
  })
}

function requireExpectedHead(current: AssignmentSnapshot, expected: ExpectedHead) {
  if (
    current.current.id !== expected.revisionID ||
    current.current.version !== expected.version ||
    headReferenceFingerprint(current) !== expected.ownerCutFingerprint
  ) {
    throw invalidError("stale")
  }
}

function headReferenceFingerprint(assignment: AssignmentSnapshot) {
  return fingerprint({
    assignmentID: assignment.id,
    revisionID: assignment.current.id,
    version: assignment.current.version,
    disposition: assignment.current.disposition,
    supersessionTarget: assignment.current.supersessionTarget ?? null,
  })
}

function semanticAddressFor(command: CanonicalChangeSet, envelope: InvocationEnvelope) {
  const cause = command.cause
  if (cause.type === "interpreted_learner_report" || cause.type === "interpreted_learner_direction") {
    return {
      type: "learner_report" as const,
      occurrenceID: envelope.occurrenceID,
      slot: "assignment_change_set" as const,
    }
  }
  if (cause.type === "agent_correction") {
    return {
      type: "agent_correction" as const,
      modelOperationID: envelope.assistantMessageID,
      slot: "assignment_correction_change_set" as const,
    }
  }
  const sourceRevisionID =
    cause.source.type === "artifact_revision" ? cause.source.revisionID : cause.source.representationRevisionID
  return {
    type: "source_observation" as const,
    sourceRevisionID,
    locatorDigest: sourceLocatorDigest(cause.source),
    slot: "assignment_source_change_set" as const,
  }
}

function sourceLocatorDigest(source: SourceObservationIntent) {
  return fingerprint({
    type: source.type,
    ...(source.type === "artifact_revision"
      ? { artifactID: source.artifactID, revisionID: source.revisionID, attribution: source.attribution }
      : { representationRevisionID: source.representationRevisionID }),
    locator: source.selector.locator,
  })
}

function rootAgentAction(envelope: InvocationEnvelope, trusted: ValidatedAgentActionRegistration) {
  if (
    trusted.occurrenceID !== envelope.occurrenceID ||
    trusted.admissionKind !== "learner" ||
    trusted.depth !== 0 ||
    trusted.lineage.length !== 0
  ) {
    return integrity("Assignment mutation is restricted to the ordinary interactive root Agent")
  }
  return Effect.succeed({
    schemaVersion: 1 as const,
    kind: "root" as const,
    occurrenceID: envelope.occurrenceID,
    sessionID: envelope.sessionID,
    turnID: envelope.turnID,
    inputID: envelope.inputID,
    assistantMessageID: envelope.assistantMessageID,
    invocationPartID: envelope.partID,
    providerCallID: envelope.providerCallID,
    emissionOrdinal: envelope.emissionOrdinal,
    capabilityIdentity: UPDATE_CAPABILITY,
    capabilityVersion: UPDATE_VERSION,
    lineage: [],
  } satisfies AgentAction)
}

function registrationFromEnvelope(envelope: InvocationEnvelope) {
  return {
    turnID: envelope.turnID,
    inputID: envelope.inputID,
    causalOccurrenceID: envelope.occurrenceID,
    partID: envelope.partID,
    callID: envelope.providerCallID,
    emissionOrdinal: envelope.emissionOrdinal,
    sessionID: envelope.sessionID,
    assistantMessageID: envelope.assistantMessageID,
    capabilityIdentity: envelope.capabilityIdentity,
  }
}

function requireEnvelope(envelope: InvocationEnvelope) {
  return envelope.capabilityIdentity === UPDATE_CAPABILITY &&
    envelope.capabilityVersion === UPDATE_VERSION &&
    envelope.authorizationBasis === "agent_action"
    ? Effect.void
    : integrity("Assignment envelope has an incompatible capability or provenance basis")
}

function invocationEnvelope(invocation: typeof LearningCommandInvocationTable.$inferSelect): InvocationEnvelope {
  if (!invocation.turn_id || !invocation.input_id) throw new Error("Assignment invocation lost Turn identity")
  return {
    occurrenceID: invocation.occurrence_id,
    turnID: invocation.turn_id,
    inputID: invocation.input_id,
    sessionID: invocation.session_id,
    parentUserMessageID: invocation.parent_user_message_id,
    assistantMessageID: invocation.assistant_message_id,
    partID: invocation.part_id,
    providerCallID: invocation.provider_call_id,
    emissionOrdinal: invocation.emission_ordinal,
    capabilityIdentity: invocation.capability_identity,
    capabilityVersion: invocation.capability_version,
    authorizationBasis: invocation.authorization_basis,
    timeAdmitted: invocation.time_admitted,
  }
}

function requireInvocation(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (!invocation || invocation.command_name !== UPDATE_CAPABILITY || invocation.command_version !== UPDATE_VERSION) {
      return yield* integrity("Assignment invocation is unavailable")
    }
    return invocation
  })
}

function readDisposition(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(AssignmentDispositionTable)
    .where(eq(AssignmentDispositionTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function requireCandidate(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, partID)
    if (invocation.status !== "admitted") return yield* integrity("Assignment capability requires an admitted candidate")
    const row = yield* readDisposition(tx, partID)
    if (!row || row.disposition !== "candidate_v1") return yield* integrity("Assignment invocation has no candidate")
    return candidateInfo(row)
  })
}

function candidateInfo(row: typeof AssignmentDispositionTable.$inferSelect) {
  if (row.disposition !== "candidate_v1" || !row.materialized_candidate) {
    throw new Error("Assignment candidate row is incomplete")
  }
  return row.materialized_candidate
}

function readCapabilityIssue(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(AssignmentCapabilityIssueTable)
    .where(eq(AssignmentCapabilityIssueTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function readCapabilitySettlement(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(AssignmentCapabilitySettlementTable)
    .where(eq(AssignmentCapabilitySettlementTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilityIssueInfo(row: typeof AssignmentCapabilityIssueTable.$inferSelect) {
  return {
    requestID: row.permission_request_id,
    policyBasis: row.policy_basis,
    shownScope: row.shown_scope,
    timeIssued: row.time_issued,
    issueOrder: row.issue_order,
  }
}

function capabilitySettlementInfo(row: typeof AssignmentCapabilitySettlementTable.$inferSelect) {
  return {
    outcome: row.outcome,
    ...(row.permission_request_id ? { requestID: row.permission_request_id } : {}),
    ...(row.basis ? { basis: row.basis } : {}),
    timeSettled: row.time_settled,
    settlementOrder: row.settlement_order,
  }
}

function capabilityErrorCode(outcome: CapabilityOutcome) {
  if (outcome === "policy_deny" || outcome === "prompted_deny") return "permission_rejected" as const
  if (outcome === "prompted_correct") return "permission_corrected" as const
  if (outcome === "prompted_cancel") return "cancelled" as const
  return "interrupted" as const
}

function alreadyAppliedSettlement(tx: Transaction, effectID: EffectID, metadata: SettlementMetadata) {
  return Effect.gen(function* () {
    const effect = yield* tx
      .select()
      .from(AssignmentEffectTable)
      .where(and(eq(AssignmentEffectTable.id, effectID), committedEffect))
      .get()
      .pipe(Effect.orDie)
    if (!effect) return yield* integrity("Applied Assignment effect is unavailable")
    const rows = yield* tx
      .select()
      .from(AssignmentRevisionTable)
      .where(and(eq(AssignmentRevisionTable.effect_id, effectID), committedRevision))
      .orderBy(asc(AssignmentRevisionTable.operation_ordinal))
      .all()
      .pipe(Effect.orDie)
    const changes = rows.map((row) => ({
      ordinal: Math.floor(row.operation_ordinal / 2),
      operation: row.operation as Intent["type"],
      assignmentID: row.assignment_id,
      ...(row.predecessor_revision_id
        ? {
            previousRevision: {
              assignmentID: row.assignment_id,
              revisionID: row.predecessor_revision_id,
              version: row.version - 1,
            },
          }
        : {}),
      committedRevision: { assignmentID: row.assignment_id, revisionID: row.id, version: row.version },
      ...(row.supersession_target_assignment_id
        ? { successorAssignmentID: row.supersession_target_assignment_id }
        : {}),
    })) satisfies readonly ChangeProjection[]
    const rowsByOrdinal = new Map(rows.map((row) => [row.operation_ordinal, row]))
    const intentResults = (effect.results as readonly Record<string, unknown>[]).map((result) => {
      const ordinal = Number(result.ordinal)
      const operation = result.operation as Intent["type"]
      const assignmentID = result.assignmentID as AssignmentID
      if (result.outcome === "no_change") {
        return {
          outcome: "no_change",
          ordinal,
          operation: "revise",
          assignmentID,
          currentRevision: {
            assignmentID,
            revisionID: result.currentRevisionID as RevisionID,
            version: Number(result.currentRevisionVersion),
          },
        } satisfies IntentResultProjection
      }
      const primary = rowsByOrdinal.get(ordinal * 2)
      if (!primary) throw new Error("Sealed Assignment effect lost its primary intent result")
      const successor = rowsByOrdinal.get(ordinal * 2 + 1)
      return {
        outcome: "changed",
        ordinal,
        operation,
        assignmentID,
        ...(primary.predecessor_revision_id
          ? {
              previousRevision: {
                assignmentID,
                revisionID: primary.predecessor_revision_id,
                version: primary.version - 1,
              },
            }
          : {}),
        committedRevision: { assignmentID, revisionID: primary.id, version: primary.version },
        ...(result.successorAssignmentID ? { successorAssignmentID: result.successorAssignmentID as AssignmentID } : {}),
        ...(successor
          ? {
              successorRevision: {
                assignmentID: successor.assignment_id,
                revisionID: successor.id,
                version: successor.version,
              },
            }
          : {}),
      } satisfies IntentResultProjection
    })
    return {
      outcome: "already_applied",
      assignmentKind: "change_set",
      existingOutcome: "applied",
      receiptID: effect.physical_receipt_id,
      effectID: effect.id,
      changes,
      intentResults,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies AlreadyAppliedSettlement
  })
}

function alreadyAppliedNoChangeSettlement(
  seal: typeof AssignmentNoChangeSealTable.$inferSelect,
  metadata: SettlementMetadata,
) {
  return {
    outcome: "already_applied",
    assignmentKind: "change_set",
    existingOutcome: "no_change",
    receiptID: seal.receipt_id,
    changes: [] as const,
    intentResults: seal.results,
    settlementTime: metadata.time,
    settlementOrder: metadata.order,
  } satisfies AlreadyAppliedSettlement
}

function settleDomainFailure(tx: Transaction, partID: PartID, settlement: ReturnType<typeof assignmentErrorSettlement>) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    yield* settlePhysicalInvocation(tx, partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

function assignmentErrorSettlement(error: unknown, metadata: SettlementMetadata) {
  if (error instanceof InvalidCommandError) {
    const code =
      error.reason === "source_unavailable"
        ? "source_unavailable"
        : error.reason === "stale"
          ? "stale"
          : error.reason === "capacity_exceeded"
            ? "capacity_exceeded"
            : "validation_error"
    return errorSettlement(code, metadata)
  }
  return errorSettlement("validation_error", metadata)
}

function effectiveSourceColumns(source: EffectiveSourceBasis) {
  if (source.type === "learner_occurrence") {
    return {
      effective_source_type: source.type,
      effective_occurrence_id: source.occurrenceID,
      effective_artifact_revision_id: null,
      effective_representation_revision_id: null,
    }
  }
  if (source.type === "artifact_revision") {
    return {
      effective_source_type: source.type,
      effective_occurrence_id: null,
      effective_artifact_revision_id: source.revisionID,
      effective_representation_revision_id: null,
    }
  }
  return {
    effective_source_type: source.type,
    effective_occurrence_id: null,
    effective_artifact_revision_id: null,
    effective_representation_revision_id: source.representationRevisionID,
  }
}

function changeProjections(candidate: Candidate) {
  return candidate.materialized.filter((item) => item.outcome === "changed").flatMap((item) => {
    const source = {
      ordinal: item.ordinal,
      operation: item.intent.type,
      assignmentID: item.assignmentID,
      ...(item.current ? { previousRevision: revisionReference(item.current.current) } : {}),
      committedRevision: {
        assignmentID: item.assignmentID,
        revisionID: item.revisionID,
        version: item.current ? item.current.current.version + 1 : 1,
      },
      ...(item.successorAssignmentID ? { successorAssignmentID: item.successorAssignmentID } : {}),
    } satisfies ChangeProjection
    if (!item.successorRevisionID || !item.successorAssignmentID) return [source]
    return [
      source,
      {
        ordinal: item.ordinal,
        operation: item.intent.type,
        assignmentID: item.successorAssignmentID,
        committedRevision: {
          assignmentID: item.successorAssignmentID,
          revisionID: item.successorRevisionID,
          version: 1,
        },
      } satisfies ChangeProjection,
    ]
  })
}

function intentResultProjections(candidate: Candidate): readonly IntentResultProjection[] {
  return candidate.materialized.map((item) => {
    if (item.outcome === "no_change") {
      return {
        outcome: item.outcome,
        ordinal: item.ordinal,
        operation: "revise",
        assignmentID: item.assignmentID,
        currentRevision: revisionReference(item.current!.current),
      }
    }
    return {
      outcome: item.outcome,
      ordinal: item.ordinal,
      operation: item.intent.type,
      assignmentID: item.assignmentID,
      ...(item.current ? { previousRevision: revisionReference(item.current.current) } : {}),
      committedRevision: {
        assignmentID: item.assignmentID,
        revisionID: item.revisionID,
        version: item.current ? item.current.current.version + 1 : 1,
      },
      ...(item.successorAssignmentID ? { successorAssignmentID: item.successorAssignmentID } : {}),
      ...(item.successorAssignmentID && item.successorRevisionID
        ? {
            successorRevision: {
              assignmentID: item.successorAssignmentID,
              revisionID: item.successorRevisionID,
              version: 1,
            },
          }
        : {}),
    }
  })
}

export function renderAcknowledgement(
  changes: readonly ChangeProjection[],
  intentResults: readonly IntentResultProjection[] = changes.map((change) => ({
    outcome: "changed" as const,
    ordinal: change.ordinal,
    operation: change.operation,
    assignmentID: change.assignmentID,
    ...(change.previousRevision ? { previousRevision: change.previousRevision } : {}),
    committedRevision: change.committedRevision,
    ...(change.successorAssignmentID ? { successorAssignmentID: change.successorAssignmentID } : {}),
  })),
) {
  const lines = intentResults.map((result) =>
    result.outcome === "no_change"
      ? `${result.operation}: ${result.assignmentID} unchanged at ${result.currentRevision.revisionID} v${result.currentRevision.version}`
      : `${result.operation}: ${result.assignmentID} -> ${result.committedRevision.revisionID} v${result.committedRevision.version}`,
  )
  const unchanged = intentResults.filter((result) => result.outcome === "no_change").length
  return {
    title:
      unchanged === 0
        ? changes.length === 1
          ? "Assignment updated"
          : `${changes.length} Assignment revisions updated`
        : `${changes.length} Assignment revisions updated; ${unchanged} unchanged`,
    body: `${lines.join("\n")}\nThese are correctable obligation records, not activity, progress, mastery, commitment, or a study plan.`,
  }
}

function closedChangeSet(value: unknown): value is ChangeSetCommand {
  if (!isRecord(value) || !exactKeys(value, ["cause", "intents"]) || !Array.isArray(value.intents)) return false
  if (value.intents.length < 1 || value.intents.length > MAX_INTENTS || !closedCause(value.cause)) return false
  return value.intents.every(closedIntent)
}

function closedCause(value: unknown): value is ChangeSetCommand["cause"] {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "interpreted_learner_report" || value.type === "interpreted_learner_direction") {
    return exactKeys(value, ["type", "excerpt"]) && excerptShape(value.excerpt)
  }
  if (value.type === "interpreted_source_observation" || value.type === "interpreted_source_change") {
    return exactKeys(value, ["type", "source"]) && sourceObservationShape(value.source)
  }
  if (value.type !== "agent_correction" || !exactKeys(value, ["type", "rationale", "ownerReads"])) return false
  return (
    textBytes(value.rationale, 1, MAX_RATIONALE_BYTES) &&
    Array.isArray(value.ownerReads) &&
    value.ownerReads.length >= 1 &&
    value.ownerReads.length <= MAX_INTENTS &&
    value.ownerReads.every(ownerReadShape)
  )
}

function sourceObservationShape(value: unknown): value is SourceObservationIntent {
  if (!isRecord(value) || typeof value.type !== "string" || !sourceSelectorShape(value.selector)) return false
  if (value.type === "artifact_revision") {
    return (
      exactKeys(value, ["type", "artifactID", "revisionID", "attribution", "selector"]) &&
      opaqueID(value.artifactID, "art") &&
      opaqueID(value.revisionID, "arv") &&
      isRecord(value.attribution) &&
      (value.attribution.type === "recorded" ||
        (value.attribution.type === "lineage_correction" && opaqueID(value.attribution.memberID, "alm")))
    )
  }
  return (
    value.type === "representation_revision" &&
    exactKeys(value, ["type", "representationRevisionID", "selector"]) &&
    opaqueID(value.representationRevisionID, "rep")
  )
}

function sourceSelectorShape(value: unknown) {
  return (
    isRecord(value) &&
    exactKeys(value, value.excerpt === undefined ? ["locator"] : ["locator", "excerpt"]) &&
    textBytes(value.locator, 1, MAX_EXCERPT_BYTES) &&
    (value.excerpt === undefined || excerptShape(value.excerpt))
  )
}

function ownerReadShape(value: unknown): value is OwnerReadReference {
  return (
    isRecord(value) &&
    exactKeys(value, ["assignmentID", "revisionID", "version", "ownerCutFingerprint"]) &&
    opaqueID(value.assignmentID, "asn") &&
    opaqueID(value.revisionID, "asr") &&
    positiveInteger(value.version) &&
    lowercaseHash(value.ownerCutFingerprint)
  )
}

function closedIntent(value: unknown): value is Intent {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "create") {
    return exactKeys(value, ["type", "createOrdinal", "snapshot"]) && ordinal(value.createOrdinal) && snapshotShape(value.snapshot)
  }
  if (value.type === "replace") {
    return (
      exactKeys(value, ["type", "assignmentID", "expectedHead", "sourceAction", "rationale", "successor"]) &&
      opaqueID(value.assignmentID, "asn") &&
      expectedHeadShape(value.expectedHead) &&
      sourceActionShape(value.sourceAction) &&
      textBytes(value.rationale, 1, MAX_RATIONALE_BYTES) &&
      replacementSuccessorShape(value.successor)
    )
  }
  if (!new Set(["revise", "correct", "complete", "cancel", "dismiss", "reopen"]).has(value.type)) return false
  const optional = [
    ...(value.snapshot === undefined ? [] : ["snapshot"]),
    ...(value.finalDisposition === undefined ? [] : ["finalDisposition"]),
  ]
  return (
    exactKeys(value, ["type", "assignmentID", "expectedHead", "sourceAction", "relationAction", "rationale", ...optional]) &&
    opaqueID(value.assignmentID, "asn") &&
    expectedHeadShape(value.expectedHead) &&
    sourceActionShape(value.sourceAction) &&
    relationActionShape(value.relationAction) &&
    textBytes(value.rationale, 1, MAX_RATIONALE_BYTES) &&
    (value.snapshot === undefined || snapshotShape(value.snapshot)) &&
    (value.finalDisposition === undefined || disposition(value.finalDisposition))
  )
}

function replacementSuccessorShape(value: unknown) {
  if (!isRecord(value)) return false
  if (value.type === "create") {
    return exactKeys(value, ["type", "createOrdinal", "snapshot"]) && ordinal(value.createOrdinal) && snapshotShape(value.snapshot)
  }
  return value.type === "bind" && exactKeys(value, ["type", "target"]) && revisionRefShape(value.target)
}

function expectedHeadShape(value: unknown) {
  return (
    isRecord(value) &&
    exactKeys(value, ["revisionID", "version", "ownerCutFingerprint"]) &&
    opaqueID(value.revisionID, "asr") &&
    positiveInteger(value.version) &&
    lowercaseHash(value.ownerCutFingerprint)
  )
}

function sourceActionShape(value: unknown): value is SourceAction {
  return (
    isRecord(value) &&
    exactKeys(value, ["type"]) &&
    (value.type === "preserve_predecessor_source" || value.type === "rebind_current_source_to_cause")
  )
}

function relationActionShape(value: unknown): value is RelationAction {
  if (!isRecord(value)) return false
  if (value.type === "preserve") return exactKeys(value, ["type"])
  if (value.type === "set_or_retarget") return exactKeys(value, ["type", "target"]) && revisionRefShape(value.target)
  return (
    value.type === "clear" &&
    exactKeys(value, ["type", "finalDisposition"]) &&
    new Set(["open", "completed", "cancelled", "dismissed"]).has(String(value.finalDisposition))
  )
}

function revisionRefShape(value: unknown): value is AssignmentRevisionRef {
  return (
    isRecord(value) &&
    exactKeys(value, ["assignmentID", "revisionID", "version"]) &&
    opaqueID(value.assignmentID, "asn") &&
    opaqueID(value.revisionID, "asr") &&
    positiveInteger(value.version)
  )
}

function snapshotShape(value: unknown): value is SemanticSnapshotIntent {
  if (!isRecord(value)) return false
  const keys = ["obligationSummary", "learningContext", "scope", "dueBasis", ...(value.expiryBoundary ? ["expiryBoundary"] : [])]
  return (
    exactKeys(value, keys) &&
    textBytes(value.obligationSummary, 1, MAX_SUMMARY_BYTES) &&
    textBytes(value.learningContext, 1, MAX_LEARNING_CONTEXT_BYTES) &&
    scopeShape(value.scope) &&
    dueBasisShape(value.dueBasis) &&
    (value.expiryBoundary === undefined || boundaryShape(value.expiryBoundary))
  )
}

function scopeShape(value: unknown): value is Scope {
  if (!isRecord(value)) return false
  if (value.type === "learner_home") return exactKeys(value, ["type"])
  return (
    value.type === "courses" &&
    exactKeys(value, ["type", "courseIDs"]) &&
    Array.isArray(value.courseIDs) &&
    value.courseIDs.length >= 1 &&
    value.courseIDs.length <= MAX_SCOPE_COURSES &&
    new Set(value.courseIDs).size === value.courseIDs.length &&
    value.courseIDs.every((courseID) => opaqueID(courseID, "crs"))
  )
}

function dueBasisShape(value: unknown): value is DueBasisIntent {
  return (
    isRecord(value) &&
    ((value.type === "unresolved" || value.type === "explicitly_no_deadline")
      ? exactKeys(value, ["type"])
      : boundaryShape(value))
  )
}

function boundaryShape(value: unknown): value is TemporalBoundaryIntent {
  if (!isRecord(value) || !comparator(value.comparator) || !zoneIntentShape(value.timeZone)) return false
  if (value.type === "local_date") {
    return exactKeys(value, ["type", "civilDate", "comparator", "timeZone"]) && typeof value.civilDate === "string"
  }
  const keys = [
    "type",
    "sourceExpression",
    "localDateTime",
    "comparator",
    "timeZone",
    ...(value.disambiguatingOffsetMinutes === undefined ? [] : ["disambiguatingOffsetMinutes"]),
  ]
  return (
    value.type === "instant" &&
    exactKeys(value, keys) &&
    textBytes(value.sourceExpression, 1, MAX_EXCERPT_BYTES) &&
    typeof value.localDateTime === "string" &&
    (value.disambiguatingOffsetMinutes === undefined ||
      (Number.isInteger(value.disambiguatingOffsetMinutes) &&
        Number(value.disambiguatingOffsetMinutes) >= -840 &&
        Number(value.disambiguatingOffsetMinutes) <= 840))
  )
}

function zoneIntentShape(value: unknown) {
  if (!isRecord(value)) return false
  if (value.type === "source") return exactKeys(value, ["type"])
  if (value.type === "iana") return exactKeys(value, ["type", "name"]) && typeof value.name === "string"
  return (
    value.type === "fixed_offset" &&
    exactKeys(value, ["type", "offsetMinutes"]) &&
    Number.isInteger(value.offsetMinutes) &&
    Number(value.offsetMinutes) >= -840 &&
    Number(value.offsetMinutes) <= 840
  )
}

function requireExcerptShape(value: ExcerptIntent) {
  if (!excerptShape(value)) throw invalidError("validation_error")
}

function excerptShape(value: unknown): value is ExcerptIntent {
  return (
    isRecord(value) &&
    exactKeys(value, ["text", "startByte", "endByte"]) &&
    textBytes(value.text, 1, MAX_EXCERPT_BYTES) &&
    Number.isInteger(value.startByte) &&
    Number(value.startByte) >= 0 &&
    Number.isInteger(value.endByte) &&
    Number(value.endByte) >= Number(value.startByte) &&
    Number(value.endByte) - Number(value.startByte) === utf8Bytes(String(value.text))
  )
}

function validateWholeArtifactExcerpt(excerpt: ExcerptIntent, source: Artifact.Fingerprint) {
  requireExcerptShape(excerpt)
  const digest = sha256(excerpt.text)
  if (excerpt.startByte !== 0 || excerpt.endByte !== source.byteLength || digest !== source.digest) {
    throw invalidError("source_unavailable")
  }
  return digest
}

function intentSortKey(intent: Intent) {
  if (intent.type === "create") return `0:${String(intent.createOrdinal).padStart(3, "0")}`
  return `1:${intent.assignmentID}:${intent.type}`
}

function canonicalCommandEffect(command: ChangeSetCommand) {
  return Effect.try({
    try: () => canonicalizeCommand(command),
    catch: (error) => (error instanceof InvalidCommandError ? error : invalidError("validation_error")),
  })
}

function sameRevisionRef(left: AssignmentRevisionRef, right: AssignmentRevisionRef) {
  return (
    left.assignmentID === right.assignmentID && left.revisionID === right.revisionID && left.version === right.version
  )
}

function comparator(value: unknown): value is Comparator {
  return value === "inclusive" || value === "exclusive"
}

function disposition(value: unknown): value is Revision["disposition"] {
  return new Set(["open", "completed", "cancelled", "dismissed", "superseded"]).has(String(value))
}

function ordinal(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < MAX_INTENTS
}

function positiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 1
}

function requireNonNegativeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw invalidError("validation_error")
}

function requireTextBytes(value: unknown, minimum: number, maximum: number) {
  if (!textBytes(value, minimum, maximum)) throw invalidError("validation_error")
}

function textBytes(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "string") return false
  const bytes = utf8Bytes(value)
  return bytes >= minimum && bytes <= maximum
}

function opaqueID(value: unknown, prefix: string) {
  return typeof value === "string" && new RegExp(`^${prefix}_[0-9A-Za-z]{26}$`).test(value)
}

function lowercaseHash(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]) {
  const expected = [...keys].sort()
  const actual = Object.keys(value).sort()
  return expected.length === actual.length && expected.every((key, index) => key === actual[index])
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sha256(value: string | Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function fingerprint(value: unknown) {
  return canonicalFingerprint(toJsonValue(value))
}

function invalidError(reason: InvalidCommandError["reason"], detail?: string) {
  return new InvalidCommandError({ reason, ...(detail ? { detail } : {}) })
}

function invalid(reason: InvalidCommandError["reason"], detail?: string) {
  return Effect.fail(invalidError(reason, detail))
}

function integrity(detail: string) {
  return Effect.fail(new IntegrityError({ detail }))
}
