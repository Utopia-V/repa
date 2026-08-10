export * as LearnerStateJudgment from "./learner-state-judgment"

import { Turn } from "@opencode-ai/schema/turn"
import { and, asc, count, eq, gt, lt, notExists, or, sql } from "drizzle-orm"
import { Cause, Context, Effect, Layer } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Assignment } from "./assignment"
import { Course } from "./course"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { LearnerGoal } from "./learner-goal"
import { LearnerResponseEvidence } from "./learner-response-evidence"
import { TurnLearningContextCutTable } from "./learning-context/sql"
import { LearningFrontier } from "./learning-frontier"
import { canonicalFingerprint, canonicalJson, sha256, toJsonValue, utf8Bytes } from "./learning-context/schema"
import { Occurrence } from "./learning-command/occurrence"
import { AdmittedLearnerOccurrenceTable } from "./learning-command/occurrence.sql"
import type { SourceTemporalContext } from "./learning-command/occurrence-schema"
import {
  admitPhysicalInvocation,
  appliedMutation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  requirePhysicalSettlement,
  requireSettlementMetadata,
  settlePhysicalInvocation,
} from "./learning-command/physical"
import type { InvocationEnvelope, SettlementMetadata } from "./learning-command/physical-schema"
import { LearningCommandInvocationTable } from "./learning-command/sql"
import type { Transaction } from "./learning-command/transaction"
import { MaterialMap } from "./material-map"
import { MessageTable, PartTable } from "./session/sql"
import { TurnLearningContext } from "./turn/learning-context"
import { TurnLifecycle, type ValidatedAgentActionRegistration } from "./turn/turn"
import { TurnInputTable, TurnTable } from "./turn/sql"
import type { PermissionV1 } from "./v1/permission"
import type { MessageID, PartID, SessionV1 } from "./v1/session"
import {
  LearnerStateJudgmentAnchorTable,
  LearnerStateJudgmentBasisTable,
  LearnerStateJudgmentCapabilityIssueTable,
  LearnerStateJudgmentCapabilitySettlementTable,
  LearnerStateJudgmentCommitSealTable,
  LearnerStateJudgmentDispositionTable,
  LearnerStateJudgmentEffectTable,
  LearnerStateJudgmentNoChangeSealTable,
  LearnerStateJudgmentRevisionTable,
  LearnerStateJudgmentTable,
} from "./learner-state-judgment/sql"
import {
  EffectID,
  IntegrityError,
  InvalidCommandError,
  JudgmentID,
  MAX_ANCHORS,
  MAX_BASIS_REFS,
  MAX_BINDING_ADMISSION_BYTES,
  MAX_CONTEXT_ENTRIES,
  MAX_DURABLE_SNAPSHOT_BYTES,
  MAX_DIRECTORY_ANCHORS,
  MAX_EXCERPT_BYTES,
  MAX_JUDGMENT_BODY_BYTES,
  MAX_RATIONALE_BYTES,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_SEMANTIC_VALUE_BYTES,
  MAX_SUBJECT_LABEL_BYTES,
  MAX_UNCERTAINTY_BYTES,
  RevisionID,
  createEffectID,
  createJudgmentID,
  createRevisionID,
  type AgentAction,
  type AlreadyAppliedSettlement,
  type AppliedSettlement,
  type AuthorAndCause,
  type Candidate,
  type CanonicalCommand,
  type CapabilityOutcome,
  type Command,
  type ContextProjection,
  type DependencyProjection,
  type ExactBasisRef,
  type ExactBinding,
  type ExpectedHead,
  type ExcerptIntent,
  type Invocation,
  type InvocationVersion,
  type Judgment,
  type MaterializedCandidate,
  type NoChangeSettlement,
  type OwnerCut,
  type ProjectionAtCut,
  type ReadPage,
  type ReadQuery,
  type Revision,
  type SemanticSnapshot,
  type SemanticSnapshotIntent,
  type SubjectAnchorRef,
} from "./learner-state-judgment/schema"

export {
  EffectID,
  IntegrityError,
  InvalidCommandError,
  JudgmentID,
  MAX_ANCHORS,
  MAX_BASIS_REFS,
  MAX_BINDING_ADMISSION_BYTES,
  MAX_CONTEXT_ENTRIES,
  MAX_DURABLE_SNAPSHOT_BYTES,
  MAX_DIRECTORY_ANCHORS,
  MAX_EXCERPT_BYTES,
  MAX_JUDGMENT_BODY_BYTES,
  MAX_RATIONALE_BYTES,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_SEMANTIC_VALUE_BYTES,
  MAX_SUBJECT_LABEL_BYTES,
  MAX_UNCERTAINTY_BYTES,
  RevisionID,
  createEffectID,
  createJudgmentID,
  createRevisionID,
} from "./learner-state-judgment/schema"
export type {
  AlreadyAppliedSettlement,
  AppliedSettlement,
  Candidate,
  CanonicalCommand,
  Command,
  ContextProjection,
  ExactBasisRef,
  Invocation,
  InvocationVersion,
  Judgment,
  NoChangeSettlement,
  OwnerCut,
  ProjectionAtCut,
  ReadPage,
  ReadQuery,
  Revision,
  SemanticSnapshot,
  SemanticSnapshotIntent,
  SubjectAnchorRef,
} from "./learner-state-judgment/schema"

export const UPDATE_CAPABILITY = "update_learner_state_judgment"
export const UPDATE_VERSION = 1
export const READ_CAPABILITY = "learner_state_judgment_read"
export const READ_VERSION = 1
export const PERMISSION_PATTERN = "learner_state_judgment"

const identity = { name: UPDATE_CAPABILITY, version: UPDATE_VERSION } as const

const committedEffect = sql`EXISTS (
  SELECT 1
  FROM learner_state_judgment_commit_seal AS judgment_seal
  JOIN learning_command_receipt AS judgment_receipt ON judgment_receipt.id = judgment_seal.receipt_id
  JOIN learning_command_invocation AS judgment_invocation
    ON judgment_invocation.part_id = judgment_seal.invocation_part_id
  WHERE judgment_seal.effect_id = ${LearnerStateJudgmentEffectTable.id}
    AND judgment_receipt.invocation_part_id = judgment_seal.invocation_part_id
    AND judgment_invocation.receipt_id = judgment_receipt.id
    AND judgment_invocation.status = 'applied'
)`

const committedRevision = sql`EXISTS (
  SELECT 1
  FROM learner_state_judgment_commit_seal AS judgment_seal
  JOIN learning_command_receipt AS judgment_receipt ON judgment_receipt.id = judgment_seal.receipt_id
  JOIN learning_command_invocation AS judgment_invocation
    ON judgment_invocation.part_id = judgment_seal.invocation_part_id
      AND judgment_invocation.receipt_id = judgment_receipt.id
      AND judgment_invocation.status = 'applied'
  WHERE judgment_seal.revision_id = ${LearnerStateJudgmentRevisionTable.id}
)`

function noCommittedSuccessorAt(frontierSequence: number) {
  return sql`NOT EXISTS (
    SELECT 1
    FROM learner_state_judgment_revision AS successor
    WHERE successor.predecessor_revision_id = ${LearnerStateJudgmentRevisionTable.id}
      AND successor.frontier_sequence <= ${frontierSequence}
      AND EXISTS (
        SELECT 1
        FROM learner_state_judgment_commit_seal AS successor_seal
        JOIN learning_command_invocation AS successor_invocation
          ON successor_invocation.part_id = successor_seal.invocation_part_id
            AND successor_invocation.status = 'applied'
            AND successor_invocation.receipt_id = successor_seal.receipt_id
        WHERE successor_seal.revision_id = successor.id
      )
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

export type ReadOptions = Readonly<{
  cursor?: string
  limit?: number
  byteLimit?: number
}>

export interface ReadInterface {
  readonly read: (query: ReadQuery, options?: ReadOptions) => Effect.Effect<ReadPage, unknown>
}

export class ReadService extends Context.Service<ReadService, ReadInterface>()("@repa/LearnerStateJudgment/Read") {}

const readLayer = Layer.effect(
  ReadService,
  Effect.gen(function* () {
    const database = yield* Database.Service
    return { read: (query, options) => database.db.transaction((tx) => read(tx, query, options)) }
  }),
)

export const readNode = makeGlobalNode({ service: ReadService, layer: readLayer, deps: [Database.node] })

export function canonicalizeCommand(input: Command): CanonicalCommand {
  if (!closedCommand(input)) throw new InvalidCommandError({ reason: "validation_error" })
  const normalized = toJsonValue(input) as unknown as Command
  if (normalized.operation === "retire") {
    return { schemaVersion: 1, ...normalized }
  }
  if (normalized.operation === "restore" && normalized.snapshot === undefined) {
    return { schemaVersion: 1, ...normalized }
  }
  if (normalized.snapshot === undefined) throw new InvalidCommandError({ reason: "validation_error" })
  return {
    schemaVersion: 1,
    ...normalized,
    snapshot: canonicalSnapshotIntent(normalized.snapshot),
  }
}

export function commandFingerprint(command: CanonicalCommand) {
  return fingerprint(command)
}

type SemanticAddressOwner =
  | Readonly<{ type: "effect"; value: typeof LearnerStateJudgmentEffectTable.$inferSelect }>
  | Readonly<{ type: "no_change"; value: typeof LearnerStateJudgmentNoChangeSealTable.$inferSelect }>

function resolveSemanticAddress(tx: Transaction, semanticAddressFingerprint: string) {
  return Effect.gen(function* () {
    const effect = yield* tx
      .select()
      .from(LearnerStateJudgmentEffectTable)
      .where(
        and(
          eq(LearnerStateJudgmentEffectTable.semantic_address_fingerprint, semanticAddressFingerprint),
          committedEffect,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    const noChange = yield* tx
      .select()
      .from(LearnerStateJudgmentNoChangeSealTable)
      .where(eq(LearnerStateJudgmentNoChangeSealTable.semantic_address_fingerprint, semanticAddressFingerprint))
      .get()
      .pipe(Effect.orDie)
    if (effect && noChange) return yield* integrity("Learner-state semantic address has two owners")
    if (effect) return { type: "effect" as const, value: effect }
    if (noChange) return { type: "no_change" as const, value: noChange }
    return undefined
  })
}

function semanticOwnerMatches(owner: SemanticAddressOwner, commandHash: string, command: CanonicalCommand) {
  return owner.value.command_fingerprint === commandHash && isDeepStrictEqual(owner.value.canonical_command, command)
}

export function reserve(tx: Transaction, input: Invocation & Readonly<{ settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const command = canonicalizeCommand(input.command)
    const commandHash = commandFingerprint(command)
    const physicalFingerprint = fingerprint({ identity, envelope: input.envelope, command })
    const existingPhysical = yield* findPhysicalInvocation(tx, input, physicalFingerprint, identity)
    if (existingPhysical) {
      if (existingPhysical.status !== "admitted") {
        return { type: "replay" as const, settlement: requirePhysicalSettlement(existingPhysical) }
      }
      const disposition = yield* readDisposition(tx, existingPhysical.part_id)
      if (!disposition || disposition.disposition !== "candidate_v1") {
        return yield* integrity("Only a complete learner-state candidate may remain admitted")
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
    const semanticAddressFingerprint = semanticAddress(command, input.envelope)
    const existingOwner = yield* resolveSemanticAddress(tx, semanticAddressFingerprint)
    if (existingOwner) {
      yield* admitPhysicalInvocation(tx, {
        envelope: input.envelope,
        fingerprint: physicalFingerprint,
        command: identity,
      })
      const same = semanticOwnerMatches(existingOwner, commandHash, command)
      yield* tx
        .insert(LearnerStateJudgmentDispositionTable)
        .values({
          invocation_part_id: input.envelope.partID,
          disposition: "semantic_terminal_v1",
          command_fingerprint: commandHash,
          canonical_command: command,
          semantic_address_fingerprint: semanticAddressFingerprint,
          semantic_outcome: same
            ? existingOwner.type === "effect"
              ? "same_effect"
              : "same_no_change"
            : "semantic_conflict",
          existing_effect_id: existingOwner.type === "effect" ? existingOwner.value.id : null,
          existing_no_change_part_id:
            existingOwner.type === "no_change" ? existingOwner.value.invocation_part_id : null,
          time_disposed: input.envelope.timeAdmitted,
        })
        .run()
        .pipe(Effect.orDie)
      const settlement = same
        ? yield* semanticOwnerSettlement(tx, existingOwner, input.settlement)
        : errorSettlement("semantic_conflict", input.settlement, {
            existingOutcome: existingOwner.type === "effect" ? "applied" : "no_change",
          })
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }

    const materialized = yield* materializeCandidate(tx, command, input.envelope, action).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
      Effect.catchCause((cause) => {
        if (Cause.hasInterrupts(cause)) return Effect.failCause(cause)
        const error = Cause.squash(cause)
        return error instanceof InvalidCommandError
          ? Effect.succeed({ type: "failure" as const, error })
          : Effect.failCause(cause)
      }),
    )
    yield* admitPhysicalInvocation(tx, {
      envelope: input.envelope,
      fingerprint: physicalFingerprint,
      command: identity,
    })
    if (materialized.type === "failure") {
      const settlement = judgmentErrorSettlement(materialized.error, input.settlement)
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
      commandFingerprint: commandHash,
      semanticAddressFingerprint,
      agentActionFingerprint: fingerprint({ action, command, materialized: materialized.value }),
      canonicalCommand: command,
      agentAction: action,
      materialized: materialized.value,
    } satisfies Candidate
    yield* tx
      .insert(LearnerStateJudgmentDispositionTable)
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
        return yield* integrity("Learner-state capability policy settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    if (yield* readCapabilityIssue(tx, input.partID)) {
      return yield* integrity("A prompted learner-state capability cannot become a policy settlement")
    }
    yield* tx
      .insert(LearnerStateJudgmentCapabilitySettlementTable)
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
      return yield* integrity("A terminal learner-state capability outcome cannot issue a prompt")
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
        return yield* integrity("Learner-state capability prompt issue conflicts")
      }
      return capabilityIssueInfo(existing)
    }
    yield* tx
      .insert(LearnerStateJudgmentCapabilityIssueTable)
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
    if (!issue || issue.permission_request_id !== input.requestID) {
      return yield* integrity("Learner-state capability reply has no matching prompt")
    }
    const replyFingerprint = fingerprint(input.reply)
    const existing = yield* readCapabilitySettlement(tx, input.partID)
    if (existing) {
      if (
        existing.outcome !== input.outcome ||
        existing.permission_request_id !== input.requestID ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint ||
        existing.basis_fingerprint !== replyFingerprint
      ) {
        return yield* integrity("Learner-state capability reply conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    yield* tx
      .insert(LearnerStateJudgmentCapabilitySettlementTable)
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
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted")
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    const candidate = yield* requireCandidate(tx, input.partID)
    const settled = yield* readCapabilitySettlement(tx, input.partID)
    if (settled) return { type: "candidate" as const, candidate, capability: capabilitySettlementInfo(settled) }
    const issue = yield* readCapabilityIssue(tx, input.partID)
    if (issue) {
      yield* tx
        .insert(LearnerStateJudgmentCapabilitySettlementTable)
        .values({
          invocation_part_id: input.partID,
          outcome: "prompted_abort",
          permission_request_id: issue.permission_request_id,
          agent_action_fingerprint: candidate.agentActionFingerprint,
          time_settled: input.time,
          settlement_order: input.order,
        })
        .run()
        .pipe(Effect.orDie)
      return {
        type: "candidate" as const,
        candidate,
        capability: capabilitySettlementInfo((yield* readCapabilitySettlement(tx, input.partID))!),
      }
    }
    yield* tx
      .insert(LearnerStateJudgmentCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome: "not_evaluated",
        agent_action_fingerprint: candidate.agentActionFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      type: "candidate" as const,
      candidate,
      capability: capabilitySettlementInfo((yield* readCapabilitySettlement(tx, input.partID))!),
    }
  })
}

export function settle(tx: Transaction, input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const candidate = yield* requireCandidate(tx, input.partID)
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const owner = yield* resolveSemanticAddress(tx, candidate.semanticAddressFingerprint)
    if (owner) {
      const settlement = semanticOwnerMatches(owner, candidate.commandFingerprint, candidate.canonicalCommand)
        ? yield* semanticOwnerSettlement(tx, owner, input.settlement)
        : errorSettlement("semantic_conflict", input.settlement, {
            existingOutcome: owner.type === "effect" ? "applied" : "no_change",
          })
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const capability = yield* readCapabilitySettlement(tx, input.partID)
    if (!capability) return yield* integrity("Learner-state settlement has no exact capability outcome")
    if (capability.outcome !== "policy_allow" && capability.outcome !== "prompted_allow") {
      const settlement = errorSettlement(capabilityErrorCode(capability.outcome), input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const revalidated = yield* revalidateCandidate(tx, candidate).pipe(Effect.exit)
    if (revalidated._tag === "Failure") {
      const settlement = judgmentErrorSettlement(Cause.squash(revalidated.cause), input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const settlement =
      candidate.materialized.outcome === "no_change"
        ? yield* sealNoChange(tx, invocationEnvelope(invocation), candidate, input.settlement)
        : yield* applyCandidate(tx, invocationEnvelope(invocation), candidate, input.settlement)
    return { type: "settled" as const, settlement }
  })
}

export function recover(tx: Transaction, input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const candidate = yield* requireCandidate(tx, input.partID)
    const owner = yield* resolveSemanticAddress(tx, candidate.semanticAddressFingerprint)
    if (owner) {
      const settlement = semanticOwnerMatches(owner, candidate.commandFingerprint, candidate.canonicalCommand)
        ? yield* semanticOwnerSettlement(tx, owner, input.settlement)
        : errorSettlement("semantic_conflict", input.settlement, {
            existingOutcome: owner.type === "effect" ? "applied" : "no_change",
          })
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    yield* recoverCapability(tx, {
      partID: input.partID,
      time: input.settlement.time,
      order: input.settlement.order,
    })
    const settlement = errorSettlement("interrupted", input.settlement)
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function settleFailure(
  tx: Transaction,
  input: Readonly<{ partID: PartID; settlement: SettlementMetadata; error: unknown }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const settlement = judgmentErrorSettlement(input.error, input.settlement)
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function readInvocationVersion(
  tx: Transaction,
  input: Readonly<{ partID: PartID; assistantMessageID: MessageID; providerCallID: string }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!invocation) return undefined
    if (
      invocation.command_name !== UPDATE_CAPABILITY ||
      invocation.command_version !== UPDATE_VERSION ||
      invocation.assistant_message_id !== input.assistantMessageID ||
      invocation.provider_call_id !== input.providerCallID
    ) {
      return yield* integrity("Learner-state invocation identity conflicts")
    }
    const state = {
      version: 1 as const,
      status: invocation.status,
      settlement: invocation.settlement,
      timeAdmitted: invocation.time_admitted,
    }
    const disposition = yield* readDisposition(tx, input.partID)
    if (!disposition) {
      if (invocation.status === "admitted" || invocation.status !== "error") {
        return yield* integrity("Learner-state invocation lost its disposition")
      }
      return { ...state, disposition: "physical_no_effect" as const } satisfies InvocationVersion
    }
    if (disposition.disposition === "candidate_v1") {
      const owner = yield* resolveSemanticAddress(tx, disposition.semantic_address_fingerprint)
      if (owner && owner.value.invocation_part_id !== input.partID) {
        const outcome = semanticOwnerMatches(owner, disposition.command_fingerprint, disposition.canonical_command)
          ? owner.type === "effect"
            ? "same_effect"
            : "same_no_change"
          : "semantic_conflict"
        const isTerminalRace =
          (outcome === "same_effect" && invocation.status === "already_applied") ||
          (outcome === "same_no_change" && invocation.status === "no_change") ||
          (outcome === "semantic_conflict" &&
            invocation.status === "error" &&
            invocation.settlement?.code === "semantic_conflict")
        if (isTerminalRace) {
          return {
            ...state,
            disposition: "semantic_terminal_v1" as const,
            semanticTerminal: {
              kind: "semantic_terminal_v1" as const,
              outcome,
              commandFingerprint: disposition.command_fingerprint,
              semanticAddressFingerprint: disposition.semantic_address_fingerprint,
              existingOwner:
                owner.type === "effect"
                  ? { type: "effect" as const, effectID: owner.value.id }
                  : { type: "no_change" as const, invocationPartID: owner.value.invocation_part_id },
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
    return {
      ...state,
      disposition: "semantic_terminal_v1" as const,
      semanticTerminal: semanticTerminalInfo(disposition),
    } satisfies InvocationVersion
  })
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
  command: CanonicalCommand,
  envelope: InvocationEnvelope,
  action: AgentAction,
) {
  return Effect.gen(function* () {
    const previous = "judgmentID" in command ? yield* currentJudgment(tx, command.judgmentID) : undefined
    if ("judgmentID" in command) {
      if (!previous) return yield* invalid("not_found")
      requireExpectedHead(previous, command.expectedHead)
    }
    const operation = command.operation
    if (operation === "retire" && previous?.current.disposition !== "active")
      return yield* invalid("illegal_transition")
    if (operation === "restore" && previous?.current.disposition !== "retired")
      return yield* invalid("illegal_transition")
    const judgmentID = previous?.id ?? createJudgmentID()
    const revisionID = createRevisionID()
    const effectID = createEffectID()
    const version = previous ? previous.current.version + 1 : 1
    const source = yield* materializeAuthorSource(tx, command, envelope)
    const authorAndCause = {
      type: command.cause.type,
      rootModelOperationID: envelope.assistantMessageID,
      mutationOccurrenceID: envelope.occurrenceID,
      mutationPartID: envelope.partID,
      source,
    } satisfies AuthorAndCause
    const snapshotIntent =
      operation === "retire"
        ? snapshotIntentFrom(previous!.current.snapshot)
        : operation === "restore" && command.snapshot === undefined
          ? snapshotIntentFrom(previous!.current.snapshot)
          : command.snapshot
    if (!snapshotIntent) return yield* invalid("validation_error")
    if (
      (command.cause.type === "exact_owner_observation" &&
        !snapshotIntent.exactBasisRefs.some((ref) => ref.type !== "interaction")) ||
      (command.cause.type === "tutor_model_judgment" &&
        !snapshotIntent.exactBasisRefs.some(
          (ref) =>
            ref.type === "interaction" ||
            ref.type === "learner_response_evidence_revision" ||
            ref.type === "material_selector",
        ))
    ) {
      return yield* invalid("validation_error")
    }
    const snapshot = yield* materializeSnapshot(
      tx,
      snapshotIntent,
      revisionID,
      envelope.timeAdmitted,
      previous?.current,
    )
    const disposition =
      operation === "retire"
        ? "retired"
        : operation === "restore"
          ? "active"
          : (previous?.current.disposition ?? "active")
    const outcome =
      previous &&
      operation === "revise" &&
      previous.current.disposition === disposition &&
      isDeepStrictEqual(snapshot, previous.current.snapshot)
        ? "no_change"
        : "changed"
    return {
      outcome,
      judgmentID,
      revisionID,
      effectID,
      ...(previous ? { previous } : {}),
      version,
      ...(previous ? { predecessorRevisionID: previous.current.id } : {}),
      operation,
      disposition,
      snapshot,
      authorAndCause,
    } satisfies MaterializedCandidate
  })
}

function materializeAuthorSource(tx: Transaction, command: CanonicalCommand, envelope: InvocationEnvelope) {
  const cause = command.cause
  if (cause.type === "interpreted_learner_report" || cause.type === "learner_correction") {
    return Effect.gen(function* () {
      const root = yield* currentRootSource(tx, envelope.occurrenceID, true)
      return yield* bindLearnerExcerpt(tx, cause.excerpt, root)
    })
  }
  return Effect.gen(function* () {
    requireTextBytes(cause.rationale, 1, MAX_RATIONALE_BYTES)
    const cut = yield* tx
      .select({ fingerprint: TurnLearningContextCutTable.cut_fingerprint, asOf: TurnLearningContextCutTable.cut_as_of })
      .from(TurnLearningContextCutTable)
      .where(eq(TurnLearningContextCutTable.assistant_message_id, envelope.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!cut) {
      return yield* invalid("source_unavailable")
    }
    return {
      type: "model_operation" as const,
      assistantMessageID: envelope.assistantMessageID,
      sessionID: envelope.sessionID,
      turnID: envelope.turnID,
      inputID: envelope.inputID,
      occurrenceID: envelope.occurrenceID,
      learningContextFingerprint: cut.fingerprint,
      learningContextCutAsOf: cut.asOf,
      rationale: cause.rationale,
    }
  })
}

function materializeSnapshot(
  tx: Transaction,
  input: SemanticSnapshotIntent,
  revisionID: RevisionID,
  time: number,
  previous?: Revision,
) {
  return Effect.gen(function* () {
    requireTextBytes(input.subject.label, 1, MAX_SUBJECT_LABEL_BYTES)
    requireTextBytes(input.judgmentBody, 1, MAX_JUDGMENT_BODY_BYTES)
    if (input.uncertaintyAndLimits !== undefined) {
      requireTextBytes(input.uncertaintyAndLimits, 1, MAX_UNCERTAINTY_BYTES)
    }
    if (input.basisScope !== undefined && input.basisScope !== "whole_judgment") {
      return yield* invalid("validation_error")
    }
    const anchorRefs = input.subject.scope.type === "learner_home" ? [] : input.subject.scope.anchors
    if (
      (input.subject.scope.type === "anchored" && anchorRefs.length === 0) ||
      anchorRefs.length > MAX_ANCHORS ||
      input.exactBasisRefs.length > MAX_BASIS_REFS
    ) {
      return yield* invalid("capacity_exceeded")
    }
    const anchors = yield* materializeBindings(
      tx,
      anchorRefs,
      revisionID,
      time,
      previous?.snapshot.subject.scope.type === "anchored" ? previous.snapshot.subject.scope.anchors : [],
    )
    const exactBasis = yield* materializeBindings(
      tx,
      input.exactBasisRefs,
      revisionID,
      time,
      previous?.snapshot.exactBasis ?? [],
    )
    const snapshot = {
      subject: {
        label: input.subject.label,
        scope:
          input.subject.scope.type === "learner_home"
            ? { type: "learner_home" as const }
            : { type: "anchored" as const, anchors: anchors as readonly ExactBinding<SubjectAnchorRef>[] },
      },
      judgmentBody: input.judgmentBody,
      basisScope: "whole_judgment" as const,
      exactBasis,
      ...(input.uncertaintyAndLimits !== undefined ? { uncertaintyAndLimits: input.uncertaintyAndLimits } : {}),
    } satisfies SemanticSnapshot
    if (utf8Bytes(canonicalJson(toJsonValue(snapshot))) > MAX_DURABLE_SNAPSHOT_BYTES) {
      return yield* invalid("capacity_exceeded")
    }
    return snapshot
  })
}

function materializeBindings<Ref extends ExactBasisRef>(
  tx: Transaction,
  refs: readonly Ref[],
  revisionID: RevisionID,
  time: number,
  previous: readonly ExactBinding[],
) {
  return Effect.gen(function* () {
    const ordered = refs
      .map((ref) => ({ ref, refFingerprint: fingerprint(ref) }))
      .toSorted((left, right) => left.refFingerprint.localeCompare(right.refFingerprint))
    if (new Set(ordered.map((item) => item.refFingerprint)).size !== ordered.length) {
      return yield* invalid("validation_error")
    }
    const carried = new Map(previous.map((binding) => [binding.refFingerprint, binding]))
    return yield* Effect.forEach(ordered, ({ ref, refFingerprint }) => {
      const existing = carried.get(refFingerprint)
      if (existing && isDeepStrictEqual(existing.ref, ref)) return Effect.succeed(existing as ExactBinding<Ref>)
      return Effect.map(
        admissionForRef(tx, ref),
        (admission) =>
          ({
            ref,
            refFingerprint,
            admission,
            admissionFingerprint: fingerprint(admission),
            firstBoundRevisionID: revisionID,
            firstBoundAt: time,
          }) satisfies ExactBinding<Ref>,
      )
    })
  })
}

function admissionForRef(tx: Transaction, ref: ExactBasisRef) {
  if (ref.type === "course_membership") {
    return Course.prepareMembershipProof(tx, { endpoint: ref.endpoint, selection: { type: "explicit_exact" } }).pipe(
      Effect.map((proof) => admissionReceipt(ref, proof.receipt)),
      Effect.mapError(() => invalidError("source_unavailable")),
    )
  }
  if (ref.type === "material_selector") {
    return MaterialMap.inspectExactSelector(tx, ref.mapID, ref.selectorID).pipe(
      Effect.map((value) => admissionReceipt(ref, value)),
      Effect.mapError(() => invalidError("source_unavailable")),
    )
  }
  if (ref.type === "goal_revision") {
    return LearnerGoal.readLearningContextRevision(tx, {
      goalID: ref.goalID,
      revisionID: ref.revisionID,
      asOf: Number.MAX_SAFE_INTEGER,
      maxBytes: MAX_READ_BYTES,
      maxItems: MAX_READ_ITEMS,
    }).pipe(
      Effect.flatMap((value) => {
        if (value.type !== "available" || !("revision" in value)) return invalid("source_unavailable")
        const revision = value.revision as Readonly<{ version: number }>
        return revision.version !== ref.version
          ? invalid("source_unavailable")
          : Effect.succeed(admissionReceipt(ref, revision))
      }),
      Effect.mapError(() => invalidError("source_unavailable")),
    )
  }
  if (ref.type === "assignment_revision") {
    return Assignment.readExactRevision(tx, ref.assignmentID, ref.revisionID).pipe(
      Effect.flatMap((revision) =>
        revision && revision.version === ref.version
          ? Effect.succeed(admissionReceipt(ref, revision))
          : invalid("source_unavailable"),
      ),
      Effect.mapError(() => invalidError("source_unavailable")),
    )
  }
  if (ref.type === "learner_response_evidence_revision") {
    return LearnerResponseEvidence.readExactRevision(tx, ref.recordID, ref.revisionID).pipe(
      Effect.flatMap((revision) =>
        revision && revision.version === ref.version
          ? Effect.succeed(admissionReceipt(ref, revision))
          : invalid("source_unavailable"),
      ),
      Effect.mapError(() => invalidError("source_unavailable")),
    )
  }
  return TurnLearningContext.readExactRange(tx, {
    locator: ref.locator,
    maxItems: 1,
    maxBytes: MAX_READ_BYTES,
  }).pipe(
    Effect.flatMap((value) =>
      value.type === "available" ? Effect.succeed(admissionReceipt(ref, value)) : invalid("source_unavailable"),
    ),
    Effect.mapError(() => invalidError("source_unavailable")),
  )
}

function revalidateCandidate(tx: Transaction, candidate: Candidate) {
  return Effect.gen(function* () {
    const item = candidate.materialized
    if (item.previous) {
      const current = yield* currentJudgment(tx, item.judgmentID)
      if (
        !current ||
        current.current.id !== item.previous.current.id ||
        current.current.version !== item.previous.current.version
      ) {
        return yield* invalid("stale")
      }
    }
    if (
      candidate.canonicalCommand.cause.type === "interpreted_learner_report" ||
      candidate.canonicalCommand.cause.type === "learner_correction"
    ) {
      const root = yield* currentRootSource(tx, candidate.agentAction.occurrenceID, true)
      const rebound = yield* bindLearnerExcerpt(tx, candidate.canonicalCommand.cause.excerpt, root)
      if (!isDeepStrictEqual(rebound, item.authorAndCause.source)) return yield* invalid("source_unavailable")
    }
    const bindings = [
      ...(item.snapshot.subject.scope.type === "anchored" ? item.snapshot.subject.scope.anchors : []),
      ...item.snapshot.exactBasis,
    ].filter((binding) => binding.firstBoundRevisionID === item.revisionID)
    yield* Effect.forEach(
      bindings,
      (binding) =>
        admissionForRef(tx, binding.ref).pipe(
          Effect.flatMap((admission) =>
            fingerprint(admission) === binding.admissionFingerprint ? Effect.void : invalid("source_unavailable"),
          ),
        ),
      { discard: true },
    )
  })
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
    const item = candidate.materialized
    const acknowledgement = renderAcknowledgement(item)
    const result = {
      judgmentID: item.judgmentID,
      revisionID: item.revisionID,
      version: item.version,
      operation: item.operation,
      disposition: item.disposition,
    }
    yield* tx
      .insert(LearnerStateJudgmentEffectTable)
      .values({
        id: item.effectID,
        cause_type: candidate.canonicalCommand.cause.type,
        occurrence_id: envelope.occurrenceID,
        model_operation_id: envelope.assistantMessageID,
        semantic_slot: "learner_state_judgment_change",
        semantic_address_fingerprint: candidate.semanticAddressFingerprint,
        canonical_command: candidate.canonicalCommand,
        command_fingerprint: candidate.commandFingerprint,
        invocation_part_id: envelope.partID,
        physical_receipt_id: receiptID,
        admission_projection: candidate,
        result,
        time_committed: metadata.time,
        commit_order: metadata.order,
        frontier_sequence: frontier.sequence,
        frontier_time: frontier.time,
        acknowledgement_title: acknowledgement.title,
        acknowledgement_body: acknowledgement.body,
      })
      .run()
      .pipe(Effect.orDie)
    if (!item.previous) {
      yield* tx
        .insert(LearnerStateJudgmentTable)
        .values({ id: item.judgmentID, time_created: metadata.time })
        .run()
        .pipe(Effect.orDie)
    }
    yield* tx
      .insert(LearnerStateJudgmentRevisionTable)
      .values({
        id: item.revisionID,
        judgment_id: item.judgmentID,
        version: item.version,
        predecessor_revision_id: item.predecessorRevisionID ?? null,
        effect_id: item.effectID,
        operation: item.operation,
        disposition: item.disposition,
        snapshot: item.snapshot,
        subject_label: item.snapshot.subject.label,
        scope_type: item.snapshot.subject.scope.type,
        anchor_count: item.snapshot.subject.scope.type === "anchored" ? item.snapshot.subject.scope.anchors.length : 0,
        judgment_body: item.snapshot.judgmentBody,
        uncertainty_and_limits: item.snapshot.uncertaintyAndLimits ?? null,
        basis_scope: "whole_judgment",
        basis_count: item.snapshot.exactBasis.length,
        author_class: item.authorAndCause.type,
        author_and_cause: item.authorAndCause,
        time_committed: metadata.time,
        commit_order: metadata.order,
        frontier_sequence: frontier.sequence,
      })
      .run()
      .pipe(Effect.orDie)
    const anchors = item.snapshot.subject.scope.type === "anchored" ? item.snapshot.subject.scope.anchors : []
    if (anchors.length > 0) {
      yield* tx
        .insert(LearnerStateJudgmentAnchorTable)
        .values(
          anchors.map((binding, ordinal) => ({
            revision_id: item.revisionID,
            ordinal,
            ref_type: binding.ref.type,
            ref_fingerprint: binding.refFingerprint,
            binding,
            first_bound_revision_id: binding.firstBoundRevisionID,
          })),
        )
        .run()
        .pipe(Effect.orDie)
    }
    if (item.snapshot.exactBasis.length > 0) {
      yield* tx
        .insert(LearnerStateJudgmentBasisTable)
        .values(
          item.snapshot.exactBasis.map((binding, ordinal) => ({
            revision_id: item.revisionID,
            ordinal,
            ref_type: binding.ref.type,
            ref_fingerprint: binding.refFingerprint,
            binding,
            first_bound_revision_id: binding.firstBoundRevisionID,
          })),
        )
        .run()
        .pipe(Effect.orDie)
    }
    const settlement = {
      outcome: "applied",
      learnerStateJudgmentKind: "revision",
      receiptID,
      effectID: item.effectID,
      judgmentID: item.judgmentID,
      revisionID: item.revisionID,
      version: item.version,
      operation: item.operation,
      disposition: item.disposition,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
      frontierSequence: frontier.sequence,
    } satisfies AppliedSettlement
    yield* settlePhysicalInvocation(tx, envelope.partID, settlement)
    yield* tx
      .insert(LearnerStateJudgmentCommitSealTable)
      .values({
        effect_id: item.effectID,
        revision_id: item.revisionID,
        invocation_part_id: envelope.partID,
        receipt_id: receiptID,
        time_sealed: metadata.time,
        seal_order: metadata.order,
      })
      .run()
      .pipe(Effect.orDie)
    return settlement
  })
}

function sealNoChange(
  tx: Transaction,
  envelope: InvocationEnvelope,
  candidate: Candidate,
  metadata: SettlementMetadata,
) {
  return Effect.gen(function* () {
    const item = candidate.materialized
    yield* tx.run("PRAGMA defer_foreign_keys = ON").pipe(Effect.orDie)
    const receiptID = yield* insertPhysicalReceipt(tx, envelope, metadata)
    const settlement = {
      outcome: "no_change",
      learnerStateJudgmentKind: "revision",
      existingOutcome: "materialized_no_change",
      judgmentID: item.judgmentID,
      revisionID: item.previous?.current.id,
      version: item.previous?.current.version,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies NoChangeSettlement
    yield* tx
      .insert(LearnerStateJudgmentNoChangeSealTable)
      .values({
        semantic_address_fingerprint: candidate.semanticAddressFingerprint,
        cause_type: candidate.canonicalCommand.cause.type,
        occurrence_id: envelope.occurrenceID,
        model_operation_id: envelope.assistantMessageID,
        semantic_slot: "learner_state_judgment_change",
        command_fingerprint: candidate.commandFingerprint,
        canonical_command: candidate.canonicalCommand,
        invocation_part_id: envelope.partID,
        invocation_status: "no_change",
        receipt_id: receiptID,
        materialized_candidate: candidate,
        result: settlement,
        time_committed: metadata.time,
        commit_order: metadata.order,
      })
      .run()
      .pipe(Effect.orDie)
    yield* settlePhysicalInvocation(tx, envelope.partID, settlement)
    return settlement
  })
}

function semanticOwnerSettlement(tx: Transaction, owner: SemanticAddressOwner, metadata: SettlementMetadata) {
  return Effect.gen(function* () {
    if (owner.type === "no_change") {
      const item = owner.value.materialized_candidate.materialized
      return {
        outcome: "no_change",
        learnerStateJudgmentKind: "revision",
        existingOutcome: "same_no_change",
        judgmentID: item.judgmentID,
        revisionID: item.previous?.current.id,
        version: item.previous?.current.version,
        settlementTime: metadata.time,
        settlementOrder: metadata.order,
      } satisfies NoChangeSettlement
    }
    const revision = yield* tx
      .select()
      .from(LearnerStateJudgmentRevisionTable)
      .where(and(eq(LearnerStateJudgmentRevisionTable.effect_id, owner.value.id), committedRevision))
      .get()
      .pipe(Effect.orDie)
    if (!revision) return yield* integrity("Committed learner-state effect has no revision")
    return {
      outcome: "already_applied",
      learnerStateJudgmentKind: "revision",
      existingOutcome: "applied",
      receiptID: owner.value.physical_receipt_id,
      effectID: owner.value.id,
      judgmentID: revision.judgment_id,
      revisionID: revision.id,
      version: revision.version,
      operation: revision.operation,
      disposition: revision.disposition,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
      frontierSequence: revision.frontier_sequence,
    } satisfies AlreadyAppliedSettlement
  })
}

export function read(tx: Transaction, query: ReadQuery, options?: ReadOptions) {
  return Effect.gen(function* () {
    const limit = options?.limit ?? MAX_READ_ITEMS
    const byteLimit = options?.byteLimit ?? MAX_READ_BYTES
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_READ_ITEMS ||
      !Number.isSafeInteger(byteLimit) ||
      byteLimit < 1 ||
      byteLimit > MAX_READ_BYTES
    ) {
      return yield* invalid("validation_error")
    }
    const directory =
      (query.type === "discover" || query.type === "current") && query.directoryCursor
        ? decodeDirectoryCursor(query.directoryCursor)
        : undefined
    const queryFingerprint = fingerprint(query)
    const cursor = options?.cursor ? decodeCursor(options.cursor, queryFingerprint) : undefined
    if ((query.type === "current" || query.type === "revision") && cursor) return yield* invalid("validation_error")
    if (cursor && directory && !isDeepStrictEqual(cursor.ownerCut, directory.ownerCut)) {
      return yield* invalid("stale")
    }
    const ownerCut = cursor?.ownerCut ?? directory?.ownerCut ?? (yield* currentOwnerCut(tx))
    if (cursor || directory) {
      const frontier = yield* LearningFrontier.read(tx)
      if (frontier.sequence !== ownerCut.frontierSequence || frontier.time !== ownerCut.frontierTime) {
        return yield* invalid("stale")
      }
    }
    const asOf =
      cursor?.asOf ??
      directory?.asOf ??
      (query.type === "current" ? Math.max(query.asOf, ownerCut.frontierTime) : ownerCut.frontierTime)
    if (!Number.isSafeInteger(asOf) || asOf < 0) return yield* invalid("validation_error")

    if (query.type === "revision") {
      const revision = yield* exactRevision(tx, query.judgmentID, query.revisionID)
      return yield* boundedPage(
        ownerCut,
        asOf,
        "revision_version",
        revision ? [revision] : [],
        revision ? 1 : 0,
        byteLimit,
      )
    }
    if (query.type === "current") {
      const judgment = yield* judgmentAtCut(tx, query.judgmentID, ownerCut.frontierSequence)
      const projection = judgment ? yield* projectionAtCut(tx, judgment, judgment.current, ownerCut, asOf) : undefined
      return yield* boundedPage(
        ownerCut,
        asOf,
        "identity_creation_then_judgment_id_non_priority",
        projection ? [projection] : [],
        projection ? 1 : 0,
        byteLimit,
      )
    }
    if (query.type === "history") {
      const afterVersion = cursor?.after?.type === "history" ? cursor.after.version : undefined
      const rows = yield* tx
        .select()
        .from(LearnerStateJudgmentRevisionTable)
        .where(
          and(
            eq(LearnerStateJudgmentRevisionTable.judgment_id, query.judgmentID),
            sql`${LearnerStateJudgmentRevisionTable.frontier_sequence} <= ${ownerCut.frontierSequence}`,
            committedRevision,
            afterVersion === undefined ? undefined : gt(LearnerStateJudgmentRevisionTable.version, afterVersion),
          ),
        )
        .orderBy(asc(LearnerStateJudgmentRevisionTable.version), asc(LearnerStateJudgmentRevisionTable.id))
        .limit(limit + 1)
        .all()
        .pipe(Effect.orDie)
      const total = yield* tx
        .select({ value: count() })
        .from(LearnerStateJudgmentRevisionTable)
        .where(
          and(
            eq(LearnerStateJudgmentRevisionTable.judgment_id, query.judgmentID),
            sql`${LearnerStateJudgmentRevisionTable.frontier_sequence} <= ${ownerCut.frontierSequence}`,
            committedRevision,
          ),
        )
        .get()
        .pipe(Effect.orDie)
      return yield* pagedResult({
        ownerCut,
        asOf,
        order: "revision_version",
        items: rows.map(revisionInfo),
        countAtCut: total?.value ?? 0,
        limit,
        byteLimit,
        queryFingerprint,
        consumedCount: cursor?.consumedCount ?? 0,
        next: (revision) => ({ type: "history" as const, version: revision.version }),
      })
    }

    const after = cursor?.after?.type === "discover" ? cursor.after : undefined
    const heads = yield* allHeadsAtCut(tx, ownerCut.frontierSequence)
    const eligible = directory ? new Set(directory.eligibleAnchorFingerprints) : undefined
    const filtered = heads
      .filter(
        (judgment) =>
          !eligible ||
          judgment.current.snapshot.subject.scope.type === "learner_home" ||
          judgment.current.snapshot.subject.scope.anchors.some((binding) => eligible.has(binding.refFingerprint)),
      )
      .filter((judgment) => !query.disposition || judgment.current.disposition === query.disposition)
      .filter((judgment) => !query.anchor || hasAnchor(judgment.current.snapshot, query.anchor))
      .filter(
        (judgment) =>
          !after ||
          judgment.timeCreated > after.timeCreated ||
          (judgment.timeCreated === after.timeCreated && judgment.id > after.judgmentID),
      )
    const countAtCut = heads
      .filter(
        (judgment) =>
          !eligible ||
          judgment.current.snapshot.subject.scope.type === "learner_home" ||
          judgment.current.snapshot.subject.scope.anchors.some((binding) => eligible.has(binding.refFingerprint)),
      )
      .filter((judgment) => !query.disposition || judgment.current.disposition === query.disposition)
      .filter((judgment) => !query.anchor || hasAnchor(judgment.current.snapshot, query.anchor)).length
    return yield* pagedResult({
      ownerCut,
      asOf,
      order: "identity_creation_then_judgment_id_non_priority",
      items: filtered.slice(0, limit + 1),
      countAtCut,
      limit,
      byteLimit,
      queryFingerprint,
      consumedCount: cursor?.consumedCount ?? 0,
      next: (judgment) => ({ type: "discover" as const, timeCreated: judgment.timeCreated, judgmentID: judgment.id }),
    })
  })
}

export function readCurrent(tx: Transaction, judgmentID: JudgmentID, asOf: number) {
  return Effect.gen(function* () {
    const ownerCut = yield* currentOwnerCut(tx)
    if (!Number.isSafeInteger(asOf) || asOf < 0) return yield* invalid("validation_error")
    const judgment = yield* judgmentAtCut(tx, judgmentID, ownerCut.frontierSequence)
    return judgment
      ? yield* projectionAtCut(tx, judgment, judgment.current, ownerCut, Math.max(asOf, ownerCut.frontierTime))
      : undefined
  })
}

export function readExactRevision(tx: Transaction, judgmentID: JudgmentID, revisionID: RevisionID) {
  return exactRevision(tx, judgmentID, revisionID)
}

export function listEligibleForContext(
  tx: Transaction,
  input: Readonly<{
    asOf: number
    eligibleAnchors: readonly SubjectAnchorRef[]
    limit?: number
  }>,
) {
  return Effect.gen(function* () {
    const limit = input.limit ?? MAX_CONTEXT_ENTRIES
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_CONTEXT_ENTRIES) {
      return yield* invalid("validation_error")
    }
    const ownerCut = yield* currentOwnerCut(tx)
    const eligibleAnchors = canonicalAnchors(input.eligibleAnchors)
    if (eligibleAnchors.length > MAX_DIRECTORY_ANCHORS) {
      return yield* invalid("capacity_exceeded")
    }
    const eligibleAnchorFingerprints = eligibleAnchors.map((ref) => fingerprint(ref))
    const eligibleAnchorsFingerprint = fingerprint(eligibleAnchorFingerprints)
    const eligible = new Set(eligibleAnchorFingerprints)
    const heads = (yield* allHeadsAtCut(tx, ownerCut.frontierSequence)).filter(
      (judgment) =>
        judgment.current.disposition === "active" &&
        (judgment.current.snapshot.subject.scope.type === "learner_home" ||
          judgment.current.snapshot.subject.scope.anchors.some((binding) => eligible.has(binding.refFingerprint))),
    )
    return {
      ownerCut,
      asOf: input.asOf,
      eligibleAnchorCount: eligibleAnchors.length,
      eligibleAnchorsFingerprint,
      directoryCursor: encodeDirectoryCursor({ ownerCut, asOf: input.asOf, eligibleAnchorFingerprints }),
      countAtCut: heads.length,
      order: "identity_creation_then_judgment_id_non_priority" as const,
      candidates: heads.slice(0, limit).map((judgment) => ({
        judgment,
        authorClass: authorClass(judgment.current.authorAndCause.type),
        anchorKinds:
          judgment.current.snapshot.subject.scope.type === "learner_home"
            ? []
            : [
                ...new Set(judgment.current.snapshot.subject.scope.anchors.map((binding) => binding.ref.type)),
              ].toSorted(),
        hasUncertaintyOrLimits: judgment.current.snapshot.uncertaintyAndLimits !== undefined,
      })),
    } satisfies ContextProjection
  })
}

export function semanticValueFor(candidate: ContextProjection["candidates"][number]) {
  const value = {
    subjectLabel: candidate.judgment.current.snapshot.subject.label,
    judgmentID: candidate.judgment.id,
    revisionID: candidate.judgment.current.id,
    version: candidate.judgment.current.version,
    disposition: candidate.judgment.current.disposition,
    currentness: "current" as const,
    authorClass: candidate.authorClass,
    anchorKinds: candidate.anchorKinds,
    scope: candidate.judgment.current.snapshot.subject.scope.type,
    hasUncertaintyOrLimits: candidate.hasUncertaintyOrLimits,
    basisScope: "whole_judgment" as const,
    basisCount: candidate.judgment.current.snapshot.exactBasis.length,
    detail: "judgment_body_basis_and_history_require_exact_lazy_read" as const,
    nonImplications: [
      "fallible_judgment_not_mastery_certification",
      "basis_set_supports_whole_revision_not_individual_clauses",
      "absence_or_age_implies_no_state_change",
      "directory_order_is_not_priority_or_tutor_move",
    ] as const,
  }
  if (utf8Bytes(canonicalJson(toJsonValue(value))) > MAX_SEMANTIC_VALUE_BYTES) {
    throw new InvalidCommandError({ reason: "capacity_exceeded" })
  }
  return value
}

export function headReferenceFingerprint(judgment: Judgment) {
  return fingerprint({
    judgmentID: judgment.id,
    revisionID: judgment.current.id,
    version: judgment.current.version,
    disposition: judgment.current.disposition,
    subject: judgment.current.snapshot.subject,
  })
}

function currentOwnerCut(tx: Transaction) {
  return Effect.gen(function* () {
    const frontier = yield* LearningFrontier.read(tx)
    const heads = yield* allHeadsAtCut(tx, frontier.sequence)
    const basis = {
      frontierSequence: frontier.sequence,
      frontierTime: frontier.time,
      headCount: heads.length,
    }
    return { ...basis, fingerprint: fingerprint(basis) } satisfies OwnerCut
  })
}

function allHeadsAtCut(tx: Transaction, frontierSequence: number) {
  return Effect.gen(function* () {
    const rows = yield* tx
      .select({ identity: LearnerStateJudgmentTable, revision: LearnerStateJudgmentRevisionTable })
      .from(LearnerStateJudgmentTable)
      .innerJoin(
        LearnerStateJudgmentRevisionTable,
        eq(LearnerStateJudgmentRevisionTable.judgment_id, LearnerStateJudgmentTable.id),
      )
      .where(
        and(
          sql`${LearnerStateJudgmentRevisionTable.frontier_sequence} <= ${frontierSequence}`,
          committedRevision,
          noCommittedSuccessorAt(frontierSequence),
        ),
      )
      .orderBy(asc(LearnerStateJudgmentTable.time_created), asc(LearnerStateJudgmentTable.id))
      .all()
      .pipe(Effect.orDie)
    return rows.map((row) => judgmentInfo(row.identity, row.revision))
  })
}

function judgmentAtCut(tx: Transaction, judgmentID: JudgmentID, frontierSequence: number) {
  return Effect.map(allHeadsAtCut(tx, frontierSequence), (heads) =>
    heads.find((judgment) => judgment.id === judgmentID),
  )
}

function currentJudgment(tx: Transaction, judgmentID: JudgmentID) {
  return Effect.gen(function* () {
    const frontier = yield* LearningFrontier.read(tx)
    return yield* judgmentAtCut(tx, judgmentID, frontier.sequence)
  })
}

function exactRevision(tx: Transaction, judgmentID: JudgmentID, revisionID: RevisionID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(LearnerStateJudgmentRevisionTable)
      .where(
        and(
          eq(LearnerStateJudgmentRevisionTable.judgment_id, judgmentID),
          eq(LearnerStateJudgmentRevisionTable.id, revisionID),
          committedRevision,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    return row ? revisionInfo(row) : undefined
  })
}

function projectionAtCut(tx: Transaction, judgment: Judgment, revision: Revision, ownerCut: OwnerCut, asOf: number) {
  return Effect.gen(function* () {
    const head = yield* judgmentAtCut(tx, judgment.id, ownerCut.frontierSequence)
    const anchorBindings =
      revision.snapshot.subject.scope.type === "anchored" ? revision.snapshot.subject.scope.anchors : []
    return {
      judgmentRevisionRef: { judgmentID: judgment.id, revisionID: revision.id, version: revision.version },
      ownerCut,
      asOf,
      currentRelation: head ? (head.current.id === revision.id ? "current" : "superseded_by_revision") : "missing",
      ...(head ? { currentHeadRevisionID: head.current.id } : {}),
      ...(head
        ? {
            currentHead: {
              revisionID: head.current.id,
              version: head.current.version,
              ownerCutFingerprint: headReferenceFingerprint(head),
            },
          }
        : {}),
      anchorDependencies: yield* Effect.forEach(anchorBindings, (binding) => dependencyProjection(tx, binding, asOf)),
      basisDependencies: yield* Effect.forEach(revision.snapshot.exactBasis, (binding) =>
        dependencyProjection(tx, binding, asOf),
      ),
      revision,
    } satisfies ProjectionAtCut
  })
}

function dependencyProjection(tx: Transaction, binding: ExactBinding, asOf: number) {
  return Effect.gen(function* () {
    const state = yield* currentDependency(tx, binding, asOf).pipe(
      Effect.catch((error) =>
        error instanceof InvalidCommandError && error.reason === "source_unavailable"
          ? Effect.succeed({ state: "source_unavailable" as const })
          : Effect.fail(error),
      ),
    )
    const value = { ref: binding.ref, ...state }
    return { ...value, dependencyFingerprint: fingerprint(value) } satisfies DependencyProjection
  })
}

function currentDependency(tx: Transaction, binding: ExactBinding, asOf: number) {
  return Effect.gen(function* () {
    const ref = binding.ref
    const admission = yield* admissionForRef(tx, ref)
    const admissionChanged = fingerprint(admission) !== binding.admissionFingerprint
    if (ref.type === "course_membership") {
      return { state: admissionChanged ? ("changed" as const) : ("current" as const), current: admission }
    }
    if (ref.type === "material_selector") {
      return { state: admissionChanged ? ("changed" as const) : ("current" as const), current: admission }
    }
    if (ref.type === "goal_revision") {
      const current = yield* LearnerGoal.readCurrent(tx, ref.goalID, asOf)
      return current
        ? {
            state:
              !admissionChanged && current.head.id === ref.revisionID && current.head.version === ref.version
                ? ("current" as const)
                : ("changed" as const),
            current: toRecord({ revisionID: current.head.id, version: current.head.version }),
          }
        : { state: "source_unavailable" as const }
    }
    if (ref.type === "assignment_revision") {
      const current = yield* Assignment.readCurrent(tx, ref.assignmentID, asOf)
      return current
        ? {
            state:
              !admissionChanged && current.revision.id === ref.revisionID && current.revision.version === ref.version
                ? ("current" as const)
                : ("changed" as const),
            current: toRecord({ revisionID: current.revision.id, version: current.revision.version }),
          }
        : { state: "source_unavailable" as const }
    }
    if (ref.type === "learner_response_evidence_revision") {
      const exact = yield* LearnerResponseEvidence.inspectExactRevisionDependency(tx, ref.recordID, ref.revisionID)
      if (!exact) return { state: "source_unavailable" as const }
      const current = toRecord({
        currentHead: exact.currentHead,
        currentRelation: exact.currentRelation,
        availability: exact.availability,
        targetRelation: exact.targetRelation,
      })
      if (
        Object.values(exact.availability).some((availability) => availability.state === "source_unavailable") ||
        Object.values(exact.targetRelation).some((relation) => relation === "unavailable")
      ) {
        return { state: "source_unavailable" as const, current }
      }
      return {
        state:
          !admissionChanged &&
          exact.currentRelation === "current" &&
          Object.values(exact.targetRelation).every((relation) => relation === "current")
            ? ("current" as const)
            : ("changed" as const),
        current,
      }
    }
    return { state: admissionChanged ? ("changed" as const) : ("current" as const), current: admission }
  })
}

function revisionInfo(row: typeof LearnerStateJudgmentRevisionTable.$inferSelect): Revision {
  return {
    id: row.id,
    judgmentID: row.judgment_id,
    version: row.version,
    ...(row.predecessor_revision_id ? { predecessorRevisionID: row.predecessor_revision_id } : {}),
    operation: row.operation,
    disposition: row.disposition,
    snapshot: row.snapshot,
    authorAndCause: row.author_and_cause,
    effectID: row.effect_id,
    timeCommitted: row.time_committed,
    commitOrder: row.commit_order,
    frontierSequence: row.frontier_sequence,
  }
}

function judgmentInfo(
  identityRow: typeof LearnerStateJudgmentTable.$inferSelect,
  revisionRow: typeof LearnerStateJudgmentRevisionTable.$inferSelect,
) {
  return {
    id: identityRow.id,
    timeCreated: identityRow.time_created,
    current: revisionInfo(revisionRow),
  } satisfies Judgment
}

function hasAnchor(snapshot: SemanticSnapshot, anchor: SubjectAnchorRef) {
  const target = fingerprint(anchor)
  return (
    snapshot.subject.scope.type === "anchored" &&
    snapshot.subject.scope.anchors.some((item) => item.refFingerprint === target)
  )
}

type Cursor = Readonly<{
  schemaVersion: 1
  queryFingerprint: string
  ownerCut: OwnerCut
  asOf: number
  consumedCount: number
  after?:
    | Readonly<{ type: "history"; version: number }>
    | Readonly<{ type: "discover"; timeCreated: number; judgmentID: JudgmentID }>
  fingerprint: string
}>

type DirectoryCursor = Readonly<{
  schemaVersion: 1
  ownerCut: OwnerCut
  asOf: number
  eligibleAnchorFingerprints: readonly string[]
  eligibleAnchorsFingerprint: string
  fingerprint: string
}>

function encodeDirectoryCursor(
  input: Omit<DirectoryCursor, "schemaVersion" | "eligibleAnchorsFingerprint" | "fingerprint">,
) {
  const basis = {
    schemaVersion: 1 as const,
    ...input,
    eligibleAnchorsFingerprint: fingerprint(input.eligibleAnchorFingerprints),
  }
  const fields = [
    String(basis.schemaVersion),
    basis.ownerCut.frontierSequence.toString(36),
    basis.ownerCut.frontierTime.toString(36),
    basis.ownerCut.headCount.toString(36),
    compactDigest(basis.ownerCut.fingerprint),
    basis.asOf.toString(36),
    compactDigest(basis.eligibleAnchorsFingerprint),
    basis.eligibleAnchorFingerprints.length.toString(36),
    ...basis.eligibleAnchorFingerprints.map(compactDigest),
  ]
  return [...fields, compactDigest(fingerprint(fields))].join(".")
}

function decodeDirectoryCursor(value: string): DirectoryCursor {
  try {
    const fields = value.split(".")
    const schemaVersion = parseBase36(fields[0])
    const frontierSequence = parseBase36(fields[1])
    const frontierTime = parseBase36(fields[2])
    const headCount = parseBase36(fields[3])
    const ownerFingerprint = expandDigest(fields[4])
    const asOf = parseBase36(fields[5])
    const eligibleAnchorsFingerprint = expandDigest(fields[6])
    const eligibleAnchorCount = parseBase36(fields[7])
    if (
      schemaVersion !== 1 ||
      eligibleAnchorCount > MAX_DIRECTORY_ANCHORS ||
      fields.length !== eligibleAnchorCount + 9
    ) {
      throw new Error("invalid")
    }
    const eligibleAnchorFingerprints = fields.slice(8, 8 + eligibleAnchorCount).map(expandDigest)
    if (
      new Set(eligibleAnchorFingerprints).size !== eligibleAnchorFingerprints.length ||
      eligibleAnchorFingerprints.some((item, index) => index > 0 && eligibleAnchorFingerprints[index - 1]! > item) ||
      eligibleAnchorsFingerprint !== fingerprint(eligibleAnchorFingerprints) ||
      expandDigest(fields.at(-1)) !== fingerprint(fields.slice(0, -1))
    ) {
      throw new Error("invalid")
    }
    const ownerCut = {
      frontierSequence,
      frontierTime,
      headCount,
      fingerprint: ownerFingerprint,
    }
    if (!ownerCutShape(ownerCut)) throw new Error("invalid")
    return {
      schemaVersion: 1,
      ownerCut,
      asOf,
      eligibleAnchorFingerprints,
      eligibleAnchorsFingerprint,
      fingerprint: expandDigest(fields.at(-1)),
    }
  } catch {
    throw invalidError("validation_error")
  }
}

export function inspectDirectoryCursor(value: string) {
  try {
    const cursor = decodeDirectoryCursor(value)
    return {
      ownerCut: cursor.ownerCut,
      asOf: cursor.asOf,
      eligibleAnchorCount: cursor.eligibleAnchorFingerprints.length,
      eligibleAnchorsFingerprint: cursor.eligibleAnchorsFingerprint,
    }
  } catch {
    return undefined
  }
}

function compactDigest(value: string) {
  if (!lowercaseHash(value)) throw new Error("invalid")
  return Buffer.from(value, "hex").toString("base64url")
}

function expandDigest(value: string | undefined) {
  if (!value || !/^[0-9A-Za-z_-]{43}$/.test(value)) throw new Error("invalid")
  const digest = Buffer.from(value, "base64url").toString("hex")
  if (!lowercaseHash(digest) || compactDigest(digest) !== value) throw new Error("invalid")
  return digest
}

function parseBase36(value: string | undefined) {
  if (!value || !/^(?:0|[1-9a-z][0-9a-z]*)$/.test(value)) throw new Error("invalid")
  const parsed = Number.parseInt(value, 36)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed.toString(36) !== value) throw new Error("invalid")
  return parsed
}

function canonicalAnchors(input: readonly SubjectAnchorRef[]) {
  return [...new Map(input.map((ref) => [fingerprint(ref), ref])).values()].toSorted((left, right) =>
    fingerprint(left).localeCompare(fingerprint(right)),
  )
}

function ownerCutShape(value: OwnerCut) {
  return (
    Number.isSafeInteger(value.frontierSequence) &&
    value.frontierSequence >= 0 &&
    Number.isSafeInteger(value.frontierTime) &&
    value.frontierTime >= 0 &&
    Number.isSafeInteger(value.headCount) &&
    value.headCount >= 0 &&
    lowercaseHash(value.fingerprint)
  )
}

function encodeCursor(input: Omit<Cursor, "fingerprint">) {
  const cursor = { ...input, fingerprint: fingerprint(input) } satisfies Cursor
  return Buffer.from(canonicalJson(toJsonValue(cursor))).toString("base64url")
}

function decodeCursor(value: string, queryFingerprint: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor
    const { fingerprint: stored, ...basis } = parsed
    if (
      parsed.schemaVersion !== 1 ||
      parsed.queryFingerprint !== queryFingerprint ||
      !/^[0-9a-f]{64}$/.test(stored) ||
      stored !== fingerprint(basis) ||
      !Number.isSafeInteger(parsed.asOf) ||
      parsed.asOf < 0 ||
      !Number.isSafeInteger(parsed.ownerCut?.frontierSequence) ||
      !Number.isSafeInteger(parsed.ownerCut?.frontierTime) ||
      !Number.isSafeInteger(parsed.ownerCut?.headCount) ||
      parsed.ownerCut.fingerprint !==
        fingerprint({
          frontierSequence: parsed.ownerCut.frontierSequence,
          frontierTime: parsed.ownerCut.frontierTime,
          headCount: parsed.ownerCut.headCount,
        })
    ) {
      throw new Error("invalid")
    }
    return parsed
  } catch {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
}

function pagedResult<Item extends Judgment | Revision>(input: {
  ownerCut: OwnerCut
  asOf: number
  order: ReadPage["order"]
  items: readonly Item[]
  countAtCut: number
  limit: number
  byteLimit: number
  queryFingerprint: string
  consumedCount: number
  next: (item: Item) => Cursor["after"]
}) {
  return Effect.gen(function* () {
    const candidates = input.items.slice(0, input.limit)
    for (let retained = candidates.length; retained >= 1; retained -= 1) {
      const items = candidates.slice(0, retained)
      const hasMore = input.items.length > retained
      const nextCursor = hasMore
        ? encodeCursor({
            schemaVersion: 1,
            queryFingerprint: input.queryFingerprint,
            ownerCut: input.ownerCut,
            asOf: input.asOf,
            consumedCount: input.consumedCount + items.length,
            after: input.next(items.at(-1)!),
          })
        : undefined
      const page = readPage(
        input.ownerCut,
        input.asOf,
        input.order,
        items,
        input.countAtCut,
        nextCursor,
        input.consumedCount,
      )
      if (page.canonicalBytes <= input.byteLimit) return page
    }
    if (candidates.length > 0) return yield* invalid("capacity_exceeded")
    return readPage(input.ownerCut, input.asOf, input.order, [], input.countAtCut, undefined, input.consumedCount)
  })
}

function boundedPage(
  ownerCut: OwnerCut,
  asOf: number,
  order: ReadPage["order"],
  items: ReadPage["items"],
  countAtCut: number,
  byteLimit: number,
) {
  return Effect.gen(function* () {
    const page = readPage(ownerCut, asOf, order, items, countAtCut)
    return page.canonicalBytes <= byteLimit ? page : yield* invalid("capacity_exceeded")
  })
}

function readPage(
  ownerCut: OwnerCut,
  asOf: number,
  order: ReadPage["order"],
  items: ReadPage["items"],
  countAtCut: number,
  nextCursor?: string,
  consumedCount = 0,
) {
  const basis = {
    schemaVersion: 1 as const,
    ownerCut,
    asOf,
    order,
    countAtCut,
    returnedCount: items.length,
    omittedCount: Math.max(0, countAtCut - consumedCount - items.length),
    truncated: nextCursor !== undefined,
    ...(nextCursor ? { nextCursor } : {}),
    items,
  }
  return { ...basis, canonicalBytes: utf8Bytes(canonicalJson(toJsonValue(basis))) } satisfies ReadPage
}

function currentRootSource(
  tx: Transaction,
  occurrenceID: InvocationEnvelope["occurrenceID"],
  requireAvailable: boolean,
) {
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
    }
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

function requireExpectedHead(current: Judgment, expected: ExpectedHead) {
  if (
    current.current.id !== expected.revisionID ||
    current.current.version !== expected.version ||
    headReferenceFingerprint(current) !== expected.ownerCutFingerprint
  ) {
    throw invalidError("stale")
  }
}

function rootAgentAction(envelope: InvocationEnvelope, trusted: ValidatedAgentActionRegistration) {
  if (
    trusted.occurrenceID !== envelope.occurrenceID ||
    trusted.admissionKind !== "learner" ||
    trusted.depth !== 0 ||
    trusted.lineage.length !== 0
  ) {
    return integrity("Learner-state mutation is restricted to the ordinary interactive root Agent")
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
    : integrity("Learner-state envelope has an incompatible capability or provenance basis")
}

function invocationEnvelope(invocation: typeof LearningCommandInvocationTable.$inferSelect): InvocationEnvelope {
  if (!invocation.turn_id || !invocation.input_id) throw new Error("Learner-state invocation lost Turn identity")
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
      return yield* integrity("Learner-state invocation is unavailable")
    }
    return invocation
  })
}

function readDisposition(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerStateJudgmentDispositionTable)
    .where(eq(LearnerStateJudgmentDispositionTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function requireCandidate(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, partID)
    if (invocation.status !== "admitted")
      return yield* integrity("Learner-state capability requires an admitted candidate")
    const row = yield* readDisposition(tx, partID)
    if (!row || row.disposition !== "candidate_v1") return yield* integrity("Learner-state invocation has no candidate")
    return candidateInfo(row)
  })
}

function candidateInfo(row: typeof LearnerStateJudgmentDispositionTable.$inferSelect) {
  if (row.disposition !== "candidate_v1" || !row.materialized_candidate) {
    throw new Error("Learner-state candidate row is incomplete")
  }
  return row.materialized_candidate
}

function semanticTerminalInfo(row: typeof LearnerStateJudgmentDispositionTable.$inferSelect) {
  if (row.disposition !== "semantic_terminal_v1" || !row.semantic_outcome) {
    throw new Error("Learner-state terminal disposition is incomplete")
  }
  return {
    kind: "semantic_terminal_v1" as const,
    outcome: row.semantic_outcome,
    commandFingerprint: row.command_fingerprint,
    semanticAddressFingerprint: row.semantic_address_fingerprint,
    existingOwner: row.existing_effect_id
      ? { type: "effect" as const, effectID: row.existing_effect_id }
      : { type: "no_change" as const, invocationPartID: row.existing_no_change_part_id! },
  }
}

function readCapabilityIssue(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerStateJudgmentCapabilityIssueTable)
    .where(eq(LearnerStateJudgmentCapabilityIssueTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function readCapabilitySettlement(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerStateJudgmentCapabilitySettlementTable)
    .where(eq(LearnerStateJudgmentCapabilitySettlementTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilityIssueInfo(row: typeof LearnerStateJudgmentCapabilityIssueTable.$inferSelect) {
  return {
    requestID: row.permission_request_id,
    policyBasis: row.policy_basis,
    shownScope: row.shown_scope,
    timeIssued: row.time_issued,
    issueOrder: row.issue_order,
  }
}

function capabilitySettlementInfo(row: typeof LearnerStateJudgmentCapabilitySettlementTable.$inferSelect) {
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

function judgmentErrorSettlement(error: unknown, metadata: SettlementMetadata) {
  if (error instanceof InvalidCommandError) {
    const code =
      error.reason === "source_unavailable"
        ? "source_unavailable"
        : error.reason === "stale"
          ? "stale"
          : error.reason === "capacity_exceeded"
            ? "capacity_exceeded"
            : error.reason === "illegal_transition"
              ? "illegal_transition"
              : error.reason === "not_found"
                ? "not_found"
                : "validation_error"
    return errorSettlement(code, metadata)
  }
  return errorSettlement("validation_error", metadata)
}

export function renderAcknowledgement(item: MaterializedCandidate) {
  return {
    title: item.operation === "create" ? "Learner-state judgment recorded" : "Learner-state judgment updated",
    body:
      `${item.judgmentID} -> ${item.revisionID} v${item.version} (${item.disposition}).\n` +
      "This is a correctable, source-bearing Tutor/learner judgment, not a mastery score, activity record, or per-clause proof.",
  }
}

function snapshotIntentFrom(snapshot: SemanticSnapshot): SemanticSnapshotIntent {
  return {
    subject: {
      label: snapshot.subject.label,
      scope:
        snapshot.subject.scope.type === "learner_home"
          ? { type: "learner_home" }
          : { type: "anchored", anchors: snapshot.subject.scope.anchors.map((binding) => binding.ref) },
    },
    judgmentBody: snapshot.judgmentBody,
    exactBasisRefs: snapshot.exactBasis.map((binding) => binding.ref),
    ...(snapshot.uncertaintyAndLimits ? { uncertaintyAndLimits: snapshot.uncertaintyAndLimits } : {}),
    basisScope: "whole_judgment",
  }
}

function canonicalSnapshotIntent(snapshot: SemanticSnapshotIntent): SemanticSnapshotIntent {
  const anchors =
    snapshot.subject.scope.type === "learner_home"
      ? undefined
      : snapshot.subject.scope.anchors.toSorted((left, right) => fingerprint(left).localeCompare(fingerprint(right)))
  const basis = snapshot.exactBasisRefs.toSorted((left, right) => fingerprint(left).localeCompare(fingerprint(right)))
  return {
    subject: {
      label: snapshot.subject.label,
      scope: anchors ? { type: "anchored", anchors } : { type: "learner_home" },
    },
    judgmentBody: snapshot.judgmentBody,
    exactBasisRefs: basis,
    ...(snapshot.uncertaintyAndLimits !== undefined ? { uncertaintyAndLimits: snapshot.uncertaintyAndLimits } : {}),
    basisScope: "whole_judgment",
  }
}

function authorClass(type: AuthorAndCause["type"]): ContextProjection["candidates"][number]["authorClass"] {
  if (type === "interpreted_learner_report") return "learner_report"
  if (type === "tutor_model_judgment") return "tutor_model_judgment"
  if (type === "exact_owner_observation") return "owner_observation"
  return "learner_correction"
}

function closedCommand(value: unknown): value is Command {
  if (!isRecord(value) || typeof value.operation !== "string" || !closedCause(value.cause)) return false
  if (value.operation === "create") {
    return (
      exactKeys(value, ["operation", "cause", "snapshot"]) &&
      value.cause.type !== "learner_correction" &&
      snapshotShape(value.snapshot)
    )
  }
  if (!opaqueID(value.judgmentID, "lsj") || !expectedHeadShape(value.expectedHead)) return false
  if (value.operation === "revise") {
    return (
      exactKeys(value, ["operation", "judgmentID", "expectedHead", "cause", "snapshot", "rationale"]) &&
      snapshotShape(value.snapshot) &&
      textBytes(value.rationale, 1, MAX_RATIONALE_BYTES)
    )
  }
  if (value.operation === "retire") {
    return (
      exactKeys(value, ["operation", "judgmentID", "expectedHead", "cause", "rationale"]) &&
      textBytes(value.rationale, 1, MAX_RATIONALE_BYTES)
    )
  }
  if (value.operation === "restore") {
    return (
      exactKeys(
        value,
        value.snapshot === undefined
          ? ["operation", "judgmentID", "expectedHead", "cause", "rationale"]
          : ["operation", "judgmentID", "expectedHead", "cause", "snapshot", "rationale"],
      ) &&
      (value.snapshot === undefined || snapshotShape(value.snapshot)) &&
      textBytes(value.rationale, 1, MAX_RATIONALE_BYTES)
    )
  }
  return false
}

function closedCause(value: unknown): value is Command["cause"] {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "interpreted_learner_report" || value.type === "learner_correction") {
    return exactKeys(value, ["type", "excerpt"]) && excerptShape(value.excerpt)
  }
  return (
    (value.type === "tutor_model_judgment" || value.type === "exact_owner_observation") &&
    exactKeys(value, ["type", "rationale"]) &&
    textBytes(value.rationale, 1, MAX_RATIONALE_BYTES)
  )
}

function snapshotShape(value: unknown): value is SemanticSnapshotIntent {
  if (!isRecord(value) || !isRecord(value.subject) || !Array.isArray(value.exactBasisRefs)) return false
  if (
    !exactKeys(
      value,
      value.uncertaintyAndLimits === undefined
        ? value.basisScope === undefined
          ? ["subject", "judgmentBody", "exactBasisRefs"]
          : ["subject", "judgmentBody", "exactBasisRefs", "basisScope"]
        : value.basisScope === undefined
          ? ["subject", "judgmentBody", "exactBasisRefs", "uncertaintyAndLimits"]
          : ["subject", "judgmentBody", "exactBasisRefs", "uncertaintyAndLimits", "basisScope"],
    ) ||
    !textBytes(value.judgmentBody, 1, MAX_JUDGMENT_BODY_BYTES) ||
    (value.uncertaintyAndLimits !== undefined && !textBytes(value.uncertaintyAndLimits, 1, MAX_UNCERTAINTY_BYTES)) ||
    (value.basisScope !== undefined && value.basisScope !== "whole_judgment") ||
    value.exactBasisRefs.length > MAX_BASIS_REFS ||
    !value.exactBasisRefs.every(exactBasisRefShape)
  ) {
    return false
  }
  if (!exactKeys(value.subject, ["label", "scope"]) || !textBytes(value.subject.label, 1, MAX_SUBJECT_LABEL_BYTES))
    return false
  const scope = value.subject.scope
  if (!isRecord(scope) || typeof scope.type !== "string") return false
  if (scope.type === "learner_home") return exactKeys(scope, []) || exactKeys(scope, ["type"])
  return (
    scope.type === "anchored" &&
    exactKeys(scope, ["type", "anchors"]) &&
    Array.isArray(scope.anchors) &&
    scope.anchors.length >= 1 &&
    scope.anchors.length <= MAX_ANCHORS &&
    scope.anchors.every(subjectAnchorShape)
  )
}

function subjectAnchorShape(value: unknown): value is SubjectAnchorRef {
  return (
    exactBasisRefShape(value) && value.type !== "learner_response_evidence_revision" && value.type !== "interaction"
  )
}

function exactBasisRefShape(value: unknown): value is ExactBasisRef {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "course_membership")
    return exactKeys(value, ["type", "endpoint"]) && membershipEndpointShape(value.endpoint)
  if (value.type === "material_selector") {
    return (
      exactKeys(value, ["type", "mapID", "selectorID"]) &&
      opaqueID(value.mapID, "mmp") &&
      opaqueID(value.selectorID, "msl")
    )
  }
  if (value.type === "goal_revision") {
    return (
      exactKeys(value, ["type", "goalID", "revisionID", "version"]) &&
      opaqueID(value.goalID, "gol") &&
      opaqueID(value.revisionID, "glr") &&
      positiveInteger(value.version)
    )
  }
  if (value.type === "assignment_revision") {
    return (
      exactKeys(value, ["type", "assignmentID", "revisionID", "version"]) &&
      opaqueID(value.assignmentID, "asn") &&
      opaqueID(value.revisionID, "asr") &&
      positiveInteger(value.version)
    )
  }
  if (value.type === "learner_response_evidence_revision") {
    return (
      exactKeys(value, ["type", "recordID", "revisionID", "version"]) &&
      opaqueID(value.recordID, "lre") &&
      opaqueID(value.revisionID, "lrr") &&
      nonnegativeInteger(value.version)
    )
  }
  return value.type === "interaction" && exactKeys(value, ["type", "locator"]) && interactionLocatorShape(value.locator)
}

function admissionReceipt(ref: ExactBasisRef, observed: unknown) {
  const canonical = canonicalJson(toJsonValue(observed))
  const receipt = toRecord({
    type: ref.type,
    refFingerprint: fingerprint(ref),
    observedCanonicalBytes: utf8Bytes(canonical),
    observedFingerprint: sha256(canonical),
  })
  if (utf8Bytes(canonicalJson(toJsonValue(receipt))) > MAX_BINDING_ADMISSION_BYTES) {
    throw invalidError("capacity_exceeded")
  }
  return receipt
}

function interactionLocatorShape(value: unknown): value is TurnLearningContext.Locator {
  if (!isRecord(value)) return false
  const status = value.status
  return (
    (status === "available" || status === "source_unavailable") &&
    typeof value.sessionID === "string" &&
    value.sessionID.length > 0 &&
    typeof value.turnID === "string" &&
    value.turnID.length > 0 &&
    nonnegativeInteger(value.timeAdmitted) &&
    nonnegativeInteger(value.timeTerminal) &&
    ["completed", "failed", "interrupted", "exhausted"].includes(String(value.terminalState)) &&
    (status === "available"
      ? isRecord(value.presentationProvenance) && value.timeDeleted === undefined
      : value.presentationProvenance === "source_unavailable" && nonnegativeInteger(value.timeDeleted))
  )
}

function membershipEndpointShape(value: unknown): value is Course.MembershipEndpoint {
  return (
    isRecord(value) &&
    exactKeys(value, ["courseID", "viewID", "revisionID", "itemID"]) &&
    opaqueID(value.courseID, "crs") &&
    opaqueID(value.viewID, "cvw") &&
    opaqueID(value.revisionID, "cvr") &&
    opaqueID(value.itemID, "cit")
  )
}

function expectedHeadShape(value: unknown): value is ExpectedHead {
  return (
    isRecord(value) &&
    exactKeys(value, ["revisionID", "version", "ownerCutFingerprint"]) &&
    opaqueID(value.revisionID, "lsr") &&
    positiveInteger(value.version) &&
    lowercaseHash(value.ownerCutFingerprint)
  )
}

function excerptShape(value: unknown): value is ExcerptIntent {
  return (
    isRecord(value) &&
    exactKeys(value, ["text", "startByte", "endByte"]) &&
    typeof value.text === "string" &&
    textBytes(value.text, 1, MAX_EXCERPT_BYTES) &&
    nonnegativeInteger(value.startByte) &&
    nonnegativeInteger(value.endByte) &&
    value.endByte > value.startByte &&
    value.endByte - value.startByte === utf8Bytes(value.text)
  )
}

function semanticAddress(command: CanonicalCommand, envelope: InvocationEnvelope) {
  return fingerprint(
    command.cause.type === "interpreted_learner_report" || command.cause.type === "learner_correction"
      ? {
          type: "learner_occurrence",
          occurrenceID: envelope.occurrenceID,
          slot: "learner_state_judgment_change",
        }
      : {
          type: "root_model_operation",
          modelOperationID: envelope.assistantMessageID,
          slot: "learner_state_judgment_change",
        },
  )
}

function requireExcerptShape(value: ExcerptIntent) {
  if (!excerptShape(value)) throw invalidError("validation_error")
}

function requireTextBytes(value: string, minimum: number, maximum: number) {
  if (!textBytes(value, minimum, maximum)) throw invalidError("capacity_exceeded")
}

function textBytes(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "string") return false
  const bytes = utf8Bytes(value)
  return bytes >= minimum && bytes <= maximum
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]) {
  const expected = [...keys].sort()
  const actual = Object.keys(value).sort()
  return expected.length === actual.length && expected.every((key, index) => key === actual[index])
}

function opaqueID(value: unknown, prefix: string) {
  return (
    typeof value === "string" &&
    value.startsWith(`${prefix}_`) &&
    value.length === 30 &&
    /^[0-9A-Za-z]+$/.test(value.slice(4))
  )
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function lowercaseHash(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function fingerprint(value: unknown) {
  return canonicalFingerprint(toJsonValue(value))
}

function toRecord(value: unknown) {
  const encoded = toJsonValue(value)
  if (encoded === null || Array.isArray(encoded) || typeof encoded !== "object") {
    throw invalidError("validation_error")
  }
  return encoded as Readonly<{ readonly [key: string]: unknown }>
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalid(reason: InvalidCommandError["reason"], detail?: string) {
  return Effect.fail(new InvalidCommandError({ reason, ...(detail ? { detail } : {}) }))
}

function invalidError(reason: InvalidCommandError["reason"], detail?: string) {
  return new InvalidCommandError({ reason, ...(detail ? { detail } : {}) })
}

function integrity(detail: string) {
  return Effect.fail(new IntegrityError({ detail }))
}
