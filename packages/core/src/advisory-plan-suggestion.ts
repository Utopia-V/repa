export * as AdvisoryPlanSuggestion from "./advisory-plan-suggestion"

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
import { LearnerStateJudgment } from "./learner-state-judgment"
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
  AdvisoryPlanSuggestionAnchorTable,
  AdvisoryPlanSuggestionBasisTable,
  AdvisoryPlanSuggestionCapabilityIssueTable,
  AdvisoryPlanSuggestionCapabilitySettlementTable,
  AdvisoryPlanSuggestionCommitSealTable,
  AdvisoryPlanSuggestionDispositionTable,
  AdvisoryPlanSuggestionEffectTable,
  AdvisoryPlanSuggestionNoChangeSealTable,
  AdvisoryPlanSuggestionRevisionTable,
  AdvisoryPlanSuggestionTable,
} from "./advisory-plan-suggestion/sql"
import {
  EffectID,
  IntegrityError,
  InvalidCommandError,
  SuggestionID,
  MAX_ASSUMPTIONS_BYTES,
  MAX_BASIS_REFS,
  MAX_BINDING_ADMISSION_BYTES,
  MAX_DIRECTORY_KEYS,
  MAX_DIRECTORY_SUMMARY_BYTES,
  MAX_CONTEXT_ENTRIES,
  MAX_DURABLE_SNAPSHOT_BYTES,
  MAX_EXCERPT_BYTES,
  MAX_BODY_BYTES,
  MAX_INTENTS,
  MAX_LEARNER_VISIBLE_SCOPE_BYTES,
  MAX_PURPOSE_BYTES,
  MAX_RATIONALE_BYTES,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_RETRIEVAL_ANCHORS,
  MAX_SEMANTIC_VALUE_BYTES,
  RevisionID,
  createEffectID,
  createSuggestionID,
  createRevisionID,
  effectIDFromDigest,
  revisionIDFromDigest,
  suggestionIDFromDigest,
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
  type Intent,
  type IntentResult,
  type Suggestion,
  type MaterializedIntent,
  type NoChangeSettlement,
  type OwnerCut,
  type ProjectionAtCut,
  type ReadPage,
  type ReadQuery,
  type RetrievalAnchor,
  type RetrievalAnchorIntent,
  type RetrievalBoundRef,
  type StableOwnerKey,
  type SuggestionRevisionRef,
  type Revision,
  type SemanticSnapshot,
  type SemanticSnapshotIntent,
} from "./advisory-plan-suggestion/schema"

export {
  EffectID,
  IntegrityError,
  InvalidCommandError,
  SuggestionID,
  MAX_ASSUMPTIONS_BYTES,
  MAX_BASIS_REFS,
  MAX_BINDING_ADMISSION_BYTES,
  MAX_DIRECTORY_KEYS,
  MAX_DIRECTORY_SUMMARY_BYTES,
  MAX_CONTEXT_ENTRIES,
  MAX_DURABLE_SNAPSHOT_BYTES,
  MAX_EXCERPT_BYTES,
  MAX_BODY_BYTES,
  MAX_INTENTS,
  MAX_LEARNER_VISIBLE_SCOPE_BYTES,
  MAX_PURPOSE_BYTES,
  MAX_RATIONALE_BYTES,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_RETRIEVAL_ANCHORS,
  MAX_SEMANTIC_VALUE_BYTES,
  RevisionID,
  createEffectID,
  createSuggestionID,
  createRevisionID,
  effectIDFromDigest,
  revisionIDFromDigest,
  suggestionIDFromDigest,
} from "./advisory-plan-suggestion/schema"
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
  Suggestion,
  NoChangeSettlement,
  OwnerCut,
  ProjectionAtCut,
  ReadPage,
  ReadQuery,
  RetrievalAnchor,
  RetrievalAnchorIntent,
  RetrievalBoundRef,
  StableOwnerKey,
  SuggestionRevisionRef,
  Revision,
  SemanticSnapshot,
  SemanticSnapshotIntent,
} from "./advisory-plan-suggestion/schema"

export const UPDATE_CAPABILITY = "update_advisory_plan_suggestion"
export const UPDATE_VERSION = 1
export const READ_CAPABILITY = "advisory_plan_suggestion_read"
export const READ_VERSION = 1
export const PERMISSION_PATTERN = "advisory_plan_suggestion"

const identity = { name: UPDATE_CAPABILITY, version: UPDATE_VERSION } as const

const committedEffect = sql`EXISTS (
  SELECT 1
  FROM advisory_plan_suggestion_commit_seal AS judgment_seal
  JOIN learning_command_receipt AS judgment_receipt ON judgment_receipt.id = judgment_seal.receipt_id
  JOIN learning_command_invocation AS judgment_invocation
    ON judgment_invocation.part_id = judgment_seal.invocation_part_id
  WHERE judgment_seal.effect_id = ${AdvisoryPlanSuggestionEffectTable.id}
    AND judgment_receipt.invocation_part_id = judgment_seal.invocation_part_id
    AND judgment_invocation.receipt_id = judgment_receipt.id
    AND judgment_invocation.status = 'applied'
)`

const committedRevision = sql`EXISTS (
  SELECT 1
  FROM advisory_plan_suggestion_commit_seal AS judgment_seal
  JOIN learning_command_receipt AS judgment_receipt ON judgment_receipt.id = judgment_seal.receipt_id
  JOIN learning_command_invocation AS judgment_invocation
    ON judgment_invocation.part_id = judgment_seal.invocation_part_id
      AND judgment_invocation.receipt_id = judgment_receipt.id
      AND judgment_invocation.status = 'applied'
  WHERE judgment_seal.effect_id = ${AdvisoryPlanSuggestionRevisionTable.effect_id}
)`

function noCommittedSuccessorAt(frontierSequence: number) {
  return sql`NOT EXISTS (
    SELECT 1
    FROM advisory_plan_suggestion_revision AS successor
    WHERE successor.predecessor_revision_id = ${AdvisoryPlanSuggestionRevisionTable.id}
      AND successor.frontier_sequence <= ${frontierSequence}
      AND EXISTS (
        SELECT 1
        FROM advisory_plan_suggestion_commit_seal AS successor_seal
        JOIN learning_command_invocation AS successor_invocation
          ON successor_invocation.part_id = successor_seal.invocation_part_id
            AND successor_invocation.status = 'applied'
            AND successor_invocation.receipt_id = successor_seal.receipt_id
        WHERE successor_seal.effect_id = successor.effect_id
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

export class ReadService extends Context.Service<ReadService, ReadInterface>()("@repa/AdvisoryPlanSuggestion/Read") {}

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
  const targeted = normalized.intents.flatMap((intent) => ("suggestionID" in intent ? [intent.suggestionID] : []))
  if (new Set(targeted).size !== targeted.length) throw new InvalidCommandError({ reason: "validation_error" })
  if (
    normalized.intents.some(
      (intent) => intent.operation === "alternative" && targeted.includes(intent.alternativeToRevision.suggestionID),
    )
  ) {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
  return {
    schemaVersion: 1,
    cause: normalized.cause,
    intents: normalized.intents.map((intent) => {
      if (intent.operation === "retire" || (intent.operation === "restore" && intent.snapshot === undefined)) {
        return intent
      }
      if (intent.snapshot === undefined) throw new InvalidCommandError({ reason: "validation_error" })
      return { ...intent, snapshot: canonicalSnapshotIntent(intent.snapshot) }
    }),
  }
}

export function commandFingerprint(command: CanonicalCommand) {
  return fingerprint(command)
}

export function isStableOwnerKey(value: unknown): value is StableOwnerKey {
  return stableOwnerKeyShape(value)
}

export function isRetrievalBoundRef(value: unknown): value is RetrievalBoundRef {
  return retrievalBoundRefShape(value)
}

export function isRetrievalAnchorIntent(value: unknown): value is RetrievalAnchorIntent {
  return retrievalAnchorIntentShape(value)
}

export function isExactBasisRef(value: unknown): value is ExactBasisRef {
  return exactBasisRefShape(value)
}

type SemanticAddressOwner =
  | Readonly<{ type: "effect"; value: typeof AdvisoryPlanSuggestionEffectTable.$inferSelect }>
  | Readonly<{ type: "no_change"; value: typeof AdvisoryPlanSuggestionNoChangeSealTable.$inferSelect }>

function resolveSemanticAddress(tx: Transaction, semanticAddressFingerprint: string) {
  return Effect.gen(function* () {
    const effect = yield* tx
      .select()
      .from(AdvisoryPlanSuggestionEffectTable)
      .where(
        and(
          eq(AdvisoryPlanSuggestionEffectTable.semantic_address_fingerprint, semanticAddressFingerprint),
          committedEffect,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    const noChange = yield* tx
      .select()
      .from(AdvisoryPlanSuggestionNoChangeSealTable)
      .where(eq(AdvisoryPlanSuggestionNoChangeSealTable.semantic_address_fingerprint, semanticAddressFingerprint))
      .get()
      .pipe(Effect.orDie)
    if (effect && noChange) return yield* integrity("Advisory-suggestion semantic address has two owners")
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
        return yield* integrity("Only a complete advisory-suggestion candidate may remain admitted")
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
        .insert(AdvisoryPlanSuggestionDispositionTable)
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

    const materialized = yield* materializeCandidate(
      tx,
      command,
      input.envelope,
      action,
      semanticAddressFingerprint,
    ).pipe(
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
      effectID: effectIDFromDigest(sha256(`effect:${semanticAddressFingerprint}`)),
      materialized: materialized.value,
    } satisfies Candidate
    yield* tx
      .insert(AdvisoryPlanSuggestionDispositionTable)
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
        return yield* integrity("Advisory-suggestion capability policy settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    if (yield* readCapabilityIssue(tx, input.partID)) {
      return yield* integrity("A prompted advisory-suggestion capability cannot become a policy settlement")
    }
    yield* tx
      .insert(AdvisoryPlanSuggestionCapabilitySettlementTable)
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
      return yield* integrity("A terminal advisory-suggestion capability outcome cannot issue a prompt")
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
        return yield* integrity("Advisory-suggestion capability prompt issue conflicts")
      }
      return capabilityIssueInfo(existing)
    }
    yield* tx
      .insert(AdvisoryPlanSuggestionCapabilityIssueTable)
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
      return yield* integrity("Advisory-suggestion capability reply has no matching prompt")
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
        return yield* integrity("Advisory-suggestion capability reply conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    yield* tx
      .insert(AdvisoryPlanSuggestionCapabilitySettlementTable)
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
        .insert(AdvisoryPlanSuggestionCapabilitySettlementTable)
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
      .insert(AdvisoryPlanSuggestionCapabilitySettlementTable)
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
    if (!capability) return yield* integrity("Advisory-suggestion settlement has no exact capability outcome")
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
      candidate.materialized.every((item) => item.outcome === "no_change")
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
      return yield* integrity("Advisory-suggestion invocation identity conflicts")
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
        return yield* integrity("Advisory-suggestion invocation lost its disposition")
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
  semanticAddressFingerprint: string,
) {
  return Effect.gen(function* () {
    const effectID = effectIDFromDigest(sha256(`effect:${semanticAddressFingerprint}`))
    const source = yield* materializeAuthorSource(tx, command, envelope)
    const authorAndCause = {
      type: command.cause.type,
      rootModelOperationID: envelope.assistantMessageID,
      mutationOccurrenceID: envelope.occurrenceID,
      mutationPartID: envelope.partID,
      source,
    } satisfies AuthorAndCause
    return yield* Effect.forEach(command.intents, (intent) =>
      materializeIntent(tx, intent, envelope, semanticAddressFingerprint, effectID, authorAndCause, command.cause.type),
    )
  })
}

function materializeIntent(
  tx: Transaction,
  intent: Intent,
  envelope: InvocationEnvelope,
  semanticAddressFingerprint: string,
  effectID: EffectID,
  authorAndCause: AuthorAndCause,
  causeType: CanonicalCommand["cause"]["type"],
) {
  return Effect.gen(function* () {
    const previous = "suggestionID" in intent ? yield* currentSuggestion(tx, intent.suggestionID) : undefined
    if ("suggestionID" in intent) {
      if (!previous) return yield* invalid("not_found")
      requireExpectedHead(previous, intent.expectedHead)
    }
    if (intent.operation === "retire" && previous?.current.disposition !== "active") {
      return yield* invalid("illegal_transition")
    }
    if (intent.operation === "restore" && previous?.current.disposition !== "retired") {
      return yield* invalid("illegal_transition")
    }
    const alternativeToRevision =
      intent.operation === "alternative"
        ? yield* requireCurrentAlternativeTarget(tx, intent.alternativeToRevision)
        : previous?.alternativeToRevision
    let suggestionID = previous?.id
    if (!suggestionID) {
      if (!("createOrdinal" in intent)) return yield* invalid("illegal_transition")
      suggestionID = suggestionIDFromDigest(sha256(`suggestion:${semanticAddressFingerprint}:${intent.createOrdinal}`))
    }
    const revisionID = revisionIDFromDigest(
      sha256(`revision:${semanticAddressFingerprint}:${intent.operationOrdinal}`),
    )
    const version = previous ? previous.current.version + 1 : 1
    const snapshotIntent =
      intent.operation === "retire"
        ? snapshotIntentFrom(previous!.current.snapshot)
        : intent.operation === "restore" && intent.snapshot === undefined
          ? snapshotIntentFrom(previous!.current.snapshot)
          : intent.snapshot
    if (!snapshotIntent) return yield* invalid("validation_error")
    if (causeType === "tutor_revision" && snapshotIntent.exactBasisRefs.length === 0) {
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
      intent.operation === "retire"
        ? "retired"
        : intent.operation === "restore"
          ? "active"
          : (previous?.current.disposition ?? "active")
    const outcome =
      previous && intent.operation === "revise" && isDeepStrictEqual(snapshot, previous.current.snapshot)
        ? "no_change"
        : "changed"
    const materialized = {
      outcome,
      suggestionID,
      revisionID,
      effectID,
      ...(previous ? { previous, predecessorRevisionID: previous.current.id } : {}),
      version,
      operation: intent.operation,
      operationOrdinal: intent.operationOrdinal,
      ...("createOrdinal" in intent ? { createOrdinal: intent.createOrdinal } : {}),
      disposition,
      snapshot,
      ...(alternativeToRevision ? { alternativeToRevision } : {}),
      authorAndCause,
    } satisfies MaterializedIntent
    requireContextSemanticCapacity(materialized)
    return materialized
  })
}

function materializeAuthorSource(tx: Transaction, command: CanonicalCommand, envelope: InvocationEnvelope) {
  const cause = command.cause
  if (cause.type === "learner_revision") {
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
    const responsiveLearnerBasis =
      cause.type === "responsive_tutor_proposal"
        ? yield* Effect.gen(function* () {
            const root = yield* currentRootSource(tx, envelope.occurrenceID, true)
            return yield* bindLearnerExcerpt(tx, cause.excerpt, root)
          })
        : undefined
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
      ...(responsiveLearnerBasis ? { responsiveLearnerBasis } : {}),
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
    requireTextBytes(input.learnerVisibleScope, 1, MAX_LEARNER_VISIBLE_SCOPE_BYTES)
    requireTextBytes(input.purpose, 1, MAX_PURPOSE_BYTES)
    requireTextBytes(input.directorySummary, 1, MAX_DIRECTORY_SUMMARY_BYTES)
    requireTextBytes(input.body, 1, MAX_BODY_BYTES)
    if (input.assumptionsAndUncertainty !== undefined) {
      requireTextBytes(input.assumptionsAndUncertainty, 1, MAX_ASSUMPTIONS_BYTES)
    }
    const anchorRefs = input.retrievalScope.type === "anchored" ? input.retrievalScope.anchors : []
    if (
      (input.retrievalScope.type === "anchored" && anchorRefs.length === 0) ||
      anchorRefs.length > MAX_RETRIEVAL_ANCHORS ||
      input.exactBasisRefs.length > MAX_BASIS_REFS
    ) {
      return yield* invalid("capacity_exceeded")
    }
    const anchors = yield* materializeRetrievalAnchors(
      tx,
      anchorRefs,
      revisionID,
      time,
      previous?.snapshot.retrievalScope.type === "anchored" ? previous.snapshot.retrievalScope.anchors : [],
    )
    const exactBasis = yield* materializeBindings(
      tx,
      input.exactBasisRefs,
      revisionID,
      time,
      previous?.snapshot.exactBasis ?? [],
    )
    const snapshot = {
      learnerVisibleScope: input.learnerVisibleScope,
      retrievalScope:
        input.retrievalScope.type === "learner_home_fallback"
          ? { type: "learner_home_fallback" as const, reason: input.retrievalScope.reason }
          : { type: "anchored" as const, anchors },
      purpose: input.purpose,
      directorySummary: input.directorySummary,
      body: input.body,
      exactBasis,
      ...(input.assumptionsAndUncertainty !== undefined
        ? { assumptionsAndUncertainty: input.assumptionsAndUncertainty }
        : {}),
    } satisfies SemanticSnapshot
    if (utf8Bytes(canonicalJson(toJsonValue(snapshot))) > MAX_DURABLE_SNAPSHOT_BYTES) {
      return yield* invalid("capacity_exceeded")
    }
    return snapshot
  })
}

function materializeRetrievalAnchors(
  tx: Transaction,
  anchors: readonly RetrievalAnchorIntent[],
  revisionID: RevisionID,
  time: number,
  previous: readonly RetrievalAnchor[],
) {
  return Effect.gen(function* () {
    const ordered = anchors
      .map((anchor) => ({ anchor, fingerprint: fingerprint(anchor.stableOwnerKey) }))
      .toSorted((left, right) => left.fingerprint.localeCompare(right.fingerprint))
    if (new Set(ordered.map((item) => item.fingerprint)).size !== ordered.length) {
      return yield* invalid("validation_error")
    }
    const carried = new Map(previous.map((anchor) => [fingerprint(anchor.stableOwnerKey), anchor]))
    return yield* Effect.forEach(ordered, ({ anchor, fingerprint: keyFingerprint }) => {
      requireStableKeyMatchesBoundRef(anchor.stableOwnerKey, anchor.exactBoundRef)
      const existing = carried.get(keyFingerprint)
      if (
        existing &&
        isDeepStrictEqual(existing.stableOwnerKey, anchor.stableOwnerKey) &&
        isDeepStrictEqual(existing.exactBound.ref, anchor.exactBoundRef)
      ) {
        return Effect.succeed(existing)
      }
      return Effect.map(admissionForRef(tx, anchor.exactBoundRef), (admission) => ({
        stableOwnerKey: anchor.stableOwnerKey,
        exactBound: {
          ref: anchor.exactBoundRef,
          refFingerprint: fingerprint(anchor.exactBoundRef),
          admission,
          admissionFingerprint: fingerprint(admission),
          firstBoundRevisionID: revisionID,
          firstBoundAt: time,
        },
      }))
    })
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

function admissionForRef(tx: Transaction, ref: ExactBasisRef | RetrievalBoundRef) {
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
  if (ref.type === "learner_state_judgment_revision") {
    return LearnerStateJudgment.readExactRevision(tx, ref.judgmentID, ref.revisionID).pipe(
      Effect.flatMap((revision) =>
        revision && revision.version === ref.version
          ? Effect.succeed(admissionReceipt(ref, revision))
          : invalid("source_unavailable"),
      ),
      Effect.mapError(() => invalidError("source_unavailable")),
    )
  }
  if (ref.type === "advisory_plan_suggestion_revision") {
    return readExactRevision(tx, ref.suggestionID, ref.revisionID).pipe(
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

function requireCurrentAlternativeTarget(tx: Transaction, target: SuggestionRevisionRef) {
  return Effect.gen(function* () {
    const current = yield* currentSuggestion(tx, target.suggestionID)
    if (
      !current ||
      current.current.id !== target.revisionID ||
      current.current.version !== target.version
    ) {
      return yield* invalid("stale")
    }
    return target
  })
}

function requireStableKeyMatchesBoundRef(key: StableOwnerKey, ref: RetrievalBoundRef) {
  const matches =
    (key.type === "course" && ref.type === "course_membership" && key.courseID === ref.endpoint.courseID) ||
    (key.type === "course_view" &&
      ref.type === "course_membership" &&
      key.courseID === ref.endpoint.courseID &&
      key.viewID === ref.endpoint.viewID) ||
    (key.type === "goal" && ref.type === "goal_revision" && key.goalID === ref.goalID) ||
    (key.type === "assignment" &&
      ref.type === "assignment_revision" &&
      key.assignmentID === ref.assignmentID) ||
    (key.type === "material_selector" &&
      ref.type === "material_selector" &&
      key.mapID === ref.mapID &&
      key.selectorID === ref.selectorID) ||
    (key.type === "learner_state_judgment" &&
      ref.type === "learner_state_judgment_revision" &&
      key.judgmentID === ref.judgmentID)
  if (!matches) throw invalidError("validation_error")
}

function revalidateCandidate(tx: Transaction, candidate: Candidate) {
  return Effect.gen(function* () {
    yield* Effect.forEach(
      candidate.materialized,
      (item) =>
        Effect.gen(function* () {
          const current = yield* currentSuggestion(tx, item.suggestionID)
          if (
            item.previous
              ? !current ||
                current.current.id !== item.previous.current.id ||
                current.current.version !== item.previous.current.version
              : current !== undefined
          ) {
            return yield* invalid("stale")
          }
          const intent = candidate.canonicalCommand.intents[item.operationOrdinal]
          if (!intent || intent.operation !== item.operation || item.effectID !== candidate.effectID) {
            return yield* integrity("Advisory-suggestion candidate intent identity conflicts")
          }
          if (intent.operation === "alternative" && item.alternativeToRevision) {
            yield* requireCurrentAlternativeTarget(tx, item.alternativeToRevision)
          }
        }),
      { discard: true },
    )
    const source = candidate.materialized[0]?.authorAndCause.source
    if (!source || candidate.materialized.some((item) => !isDeepStrictEqual(item.authorAndCause.source, source))) {
      return yield* integrity("Advisory-suggestion change set has inconsistent authorship")
    }
    if (candidate.canonicalCommand.cause.type === "learner_revision") {
      const root = yield* currentRootSource(tx, candidate.agentAction.occurrenceID, true)
      const rebound = yield* bindLearnerExcerpt(tx, candidate.canonicalCommand.cause.excerpt, root)
      if (!isDeepStrictEqual(rebound, source)) return yield* invalid("source_unavailable")
    }
    if (candidate.canonicalCommand.cause.type === "responsive_tutor_proposal") {
      const root = yield* currentRootSource(tx, candidate.agentAction.occurrenceID, true)
      const rebound = yield* bindLearnerExcerpt(tx, candidate.canonicalCommand.cause.excerpt, root)
      if (
        source.type !== "model_operation" ||
        !isDeepStrictEqual(rebound, source.responsiveLearnerBasis)
      ) {
        return yield* invalid("source_unavailable")
      }
    }
    const bindings = candidate.materialized.flatMap((item) =>
      [
        ...(item.snapshot.retrievalScope.type === "anchored"
          ? item.snapshot.retrievalScope.anchors.map((anchor) => anchor.exactBound)
          : []),
        ...item.snapshot.exactBasis,
      ].filter((binding) => binding.firstBoundRevisionID === item.revisionID),
    )
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
    const changed = candidate.materialized.filter((item) => item.outcome === "changed")
    const intentResults = candidate.materialized.map(intentResult)
    const acknowledgement = renderAcknowledgement(candidate.materialized)
    yield* tx
      .insert(AdvisoryPlanSuggestionEffectTable)
      .values({
        id: candidate.effectID,
        cause_type: candidate.canonicalCommand.cause.type,
        occurrence_id: envelope.occurrenceID,
        model_operation_id: envelope.assistantMessageID,
        semantic_slot: "suggestion_change_set",
        semantic_address_fingerprint: candidate.semanticAddressFingerprint,
        canonical_command: candidate.canonicalCommand,
        command_fingerprint: candidate.commandFingerprint,
        invocation_part_id: envelope.partID,
        physical_receipt_id: receiptID,
        admission_projection: candidate,
        result: { intentResults },
        time_committed: metadata.time,
        commit_order: metadata.order,
        frontier_sequence: frontier.sequence,
        frontier_time: frontier.time,
        acknowledgement_title: acknowledgement.title,
        acknowledgement_body: acknowledgement.body,
      })
      .run()
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      changed.filter((item) => !item.previous),
      (item) =>
        tx
          .insert(AdvisoryPlanSuggestionTable)
          .values({
            id: item.suggestionID,
            time_created: metadata.time,
            alternative_target_suggestion_id: item.alternativeToRevision?.suggestionID ?? null,
            alternative_target_revision_id: item.alternativeToRevision?.revisionID ?? null,
            alternative_target_version: item.alternativeToRevision?.version ?? null,
          })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    yield* Effect.forEach(
      changed,
      (item) => insertMaterializedRevision(tx, item, metadata, frontier.sequence),
      { discard: true },
    )
    const settlement = {
      outcome: "applied",
      advisoryPlanSuggestionKind: "change_set",
      receiptID,
      effectID: candidate.effectID,
      intentResults,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
      frontierSequence: frontier.sequence,
    } satisfies AppliedSettlement
    yield* settlePhysicalInvocation(tx, envelope.partID, settlement)
    yield* tx
      .insert(AdvisoryPlanSuggestionCommitSealTable)
      .values({
        effect_id: candidate.effectID,
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

function insertMaterializedRevision(
  tx: Transaction,
  item: MaterializedIntent,
  metadata: SettlementMetadata,
  frontierSequence: number,
) {
  return Effect.gen(function* () {
    yield* tx
      .insert(AdvisoryPlanSuggestionRevisionTable)
      .values({
        id: item.revisionID,
        suggestion_id: item.suggestionID,
        version: item.version,
        predecessor_revision_id: item.predecessorRevisionID ?? null,
        effect_id: item.effectID,
        operation: item.operation,
        operation_ordinal: item.operationOrdinal,
        disposition: item.disposition,
        snapshot: item.snapshot,
        learner_visible_scope: item.snapshot.learnerVisibleScope,
        retrieval_scope_type: item.snapshot.retrievalScope.type,
        retrieval_fallback_reason:
          item.snapshot.retrievalScope.type === "learner_home_fallback" ? item.snapshot.retrievalScope.reason : null,
        retrieval_anchor_count:
          item.snapshot.retrievalScope.type === "anchored" ? item.snapshot.retrievalScope.anchors.length : 0,
        purpose: item.snapshot.purpose,
        directory_summary: item.snapshot.directorySummary,
        body: item.snapshot.body,
        assumptions_and_uncertainty: item.snapshot.assumptionsAndUncertainty ?? null,
        basis_count: item.snapshot.exactBasis.length,
        alternative_target_suggestion_id: item.alternativeToRevision?.suggestionID ?? null,
        alternative_target_revision_id: item.alternativeToRevision?.revisionID ?? null,
        alternative_target_version: item.alternativeToRevision?.version ?? null,
        author_class: item.authorAndCause.type,
        author_and_cause: item.authorAndCause,
        time_committed: metadata.time,
        commit_order: metadata.order,
        frontier_sequence: frontierSequence,
      })
      .run()
      .pipe(Effect.orDie)
    const anchors = item.snapshot.retrievalScope.type === "anchored" ? item.snapshot.retrievalScope.anchors : []
    if (anchors.length > 0) {
      yield* tx
        .insert(AdvisoryPlanSuggestionAnchorTable)
        .values(
          anchors.map((binding, ordinal) => ({
            revision_id: item.revisionID,
            ordinal,
            key_type: binding.stableOwnerKey.type,
            stable_key_fingerprint: fingerprint(binding.stableOwnerKey),
            exact_ref_type: binding.exactBound.ref.type,
            exact_ref_fingerprint: binding.exactBound.refFingerprint,
            binding,
            first_bound_revision_id: binding.exactBound.firstBoundRevisionID,
          })),
        )
        .run()
        .pipe(Effect.orDie)
    }
    if (item.snapshot.exactBasis.length > 0) {
      yield* tx
        .insert(AdvisoryPlanSuggestionBasisTable)
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
  })
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
    const intentResults = candidate.materialized.map(intentResult)
    const settlement = {
      outcome: "no_change",
      advisoryPlanSuggestionKind: "change_set",
      existingOutcome: "materialized_no_change",
      intentResults,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies NoChangeSettlement
    yield* tx
      .insert(AdvisoryPlanSuggestionNoChangeSealTable)
      .values({
        semantic_address_fingerprint: candidate.semanticAddressFingerprint,
        cause_type: candidate.canonicalCommand.cause.type,
        occurrence_id: envelope.occurrenceID,
        model_operation_id: envelope.assistantMessageID,
        semantic_slot: "suggestion_change_set",
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
  if (owner.type === "no_change") {
    const stored = owner.value.result as NoChangeSettlement
    return Effect.succeed({
      outcome: "no_change",
      advisoryPlanSuggestionKind: "change_set",
      existingOutcome: "same_no_change",
      intentResults: stored.intentResults,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies NoChangeSettlement)
  }
  const stored = owner.value.result as Readonly<{ intentResults: readonly IntentResult[] }>
  return Effect.succeed({
    outcome: "already_applied",
    advisoryPlanSuggestionKind: "change_set",
    existingOutcome: "applied",
    receiptID: owner.value.physical_receipt_id,
    effectID: owner.value.id,
    intentResults: stored.intentResults,
    settlementTime: metadata.time,
    settlementOrder: metadata.order,
    frontierSequence: owner.value.frontier_sequence,
  } satisfies AlreadyAppliedSettlement)
}

function intentResult(item: MaterializedIntent): IntentResult {
  return {
    outcome: item.outcome,
    suggestionID: item.suggestionID,
    revisionID: item.outcome === "no_change" ? item.previous!.current.id : item.revisionID,
    version: item.outcome === "no_change" ? item.previous!.current.version : item.version,
    operation: item.operation,
    operationOrdinal: item.operationOrdinal,
    disposition: item.outcome === "no_change" ? item.previous!.current.disposition : item.disposition,
    ...(item.alternativeToRevision ? { alternativeToRevision: item.alternativeToRevision } : {}),
  }
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
    const cursor = options?.cursor ? decodeCursor(options.cursor, query, queryFingerprint) : undefined
    if ((query.type === "current" || query.type === "revision") && cursor) return yield* invalid("validation_error")
    if (cursor && directory && !isDeepStrictEqual(cursor.ownerCut, directory.ownerCut)) {
      return yield* invalid("stale")
    }
    if (query.type === "current" && directory && query.asOf !== directory.asOf) {
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
      const revision = yield* exactRevision(tx, query.suggestionID, query.revisionID)
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
      const judgment = yield* judgmentAtCut(tx, query.suggestionID, ownerCut.frontierSequence)
      const projection = judgment ? yield* projectionAtCut(tx, judgment, judgment.current, ownerCut, asOf) : undefined
      return yield* boundedPage(
        ownerCut,
        asOf,
        "identity_creation_then_suggestion_id_non_priority",
        projection ? [projection] : [],
        projection ? 1 : 0,
        byteLimit,
      )
    }
    if (query.type === "history") {
      const afterVersion = cursor?.after?.type === "history" ? cursor.after.version : undefined
      const rows = yield* tx
        .select()
        .from(AdvisoryPlanSuggestionRevisionTable)
        .where(
          and(
            eq(AdvisoryPlanSuggestionRevisionTable.suggestion_id, query.suggestionID),
            sql`${AdvisoryPlanSuggestionRevisionTable.frontier_sequence} <= ${ownerCut.frontierSequence}`,
            committedRevision,
            afterVersion === undefined ? undefined : gt(AdvisoryPlanSuggestionRevisionTable.version, afterVersion),
          ),
        )
        .orderBy(asc(AdvisoryPlanSuggestionRevisionTable.version), asc(AdvisoryPlanSuggestionRevisionTable.id))
        .limit(limit + 1)
        .all()
        .pipe(Effect.orDie)
      const total = yield* tx
        .select({ value: count() })
        .from(AdvisoryPlanSuggestionRevisionTable)
        .where(
          and(
            eq(AdvisoryPlanSuggestionRevisionTable.suggestion_id, query.suggestionID),
            sql`${AdvisoryPlanSuggestionRevisionTable.frontier_sequence} <= ${ownerCut.frontierSequence}`,
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
    const eligible = directory ? new Set(directory.eligibleKeyFingerprints) : undefined
    const directoryEligible = (suggestion: Suggestion) =>
      !eligible ||
      suggestion.current.snapshot.retrievalScope.type === "learner_home_fallback" ||
      suggestion.current.snapshot.retrievalScope.anchors.some((anchor) =>
        eligible.has(fingerprint(anchor.stableOwnerKey)),
      )
    const filtered = heads
      .filter(directoryEligible)
      .filter((suggestion) => !directory || suggestion.current.disposition === "active")
      .filter((suggestion) => !query.disposition || suggestion.current.disposition === query.disposition)
      .filter((suggestion) => !query.stableOwnerKey || hasStableOwnerKey(suggestion.current.snapshot, query.stableOwnerKey))
      .filter(
        (suggestion) =>
          !after ||
          suggestion.timeCreated > after.timeCreated ||
          (suggestion.timeCreated === after.timeCreated && suggestion.id > after.suggestionID),
      )
    const countAtCut = heads
      .filter(directoryEligible)
      .filter((suggestion) => !directory || suggestion.current.disposition === "active")
      .filter((suggestion) => !query.disposition || suggestion.current.disposition === query.disposition)
      .filter((suggestion) => !query.stableOwnerKey || hasStableOwnerKey(suggestion.current.snapshot, query.stableOwnerKey)).length
    return yield* pagedResult({
      ownerCut,
      asOf,
      order: "identity_creation_then_suggestion_id_non_priority",
      items: filtered.slice(0, limit + 1),
      countAtCut,
      limit,
      byteLimit,
      queryFingerprint,
      consumedCount: cursor?.consumedCount ?? 0,
      next: (judgment) => ({ type: "discover" as const, timeCreated: judgment.timeCreated, suggestionID: judgment.id }),
    })
  })
}

export function readCurrent(tx: Transaction, suggestionID: SuggestionID, asOf: number) {
  return Effect.gen(function* () {
    const ownerCut = yield* currentOwnerCut(tx)
    if (!Number.isSafeInteger(asOf) || asOf < 0) return yield* invalid("validation_error")
    const judgment = yield* judgmentAtCut(tx, suggestionID, ownerCut.frontierSequence)
    return judgment
      ? yield* projectionAtCut(tx, judgment, judgment.current, ownerCut, Math.max(asOf, ownerCut.frontierTime))
      : undefined
  })
}

export function readExactRevision(tx: Transaction, suggestionID: SuggestionID, revisionID: RevisionID) {
  return exactRevision(tx, suggestionID, revisionID)
}

export function listEligibleForContext(
  tx: Transaction,
  input: Readonly<{
    asOf: number
    eligibleKeys: readonly StableOwnerKey[]
    limit?: number
  }>,
) {
  return Effect.gen(function* () {
    const limit = input.limit ?? MAX_CONTEXT_ENTRIES
    if (
      !Number.isSafeInteger(input.asOf) ||
      input.asOf < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      limit > MAX_CONTEXT_ENTRIES
    ) {
      return yield* invalid("validation_error")
    }
    const ownerCut = yield* currentOwnerCut(tx)
    const eligibleKeys = canonicalStableKeys(input.eligibleKeys)
    if (eligibleKeys.length > MAX_DIRECTORY_KEYS) {
      return yield* invalid("capacity_exceeded")
    }
    const eligibleKeyFingerprints = eligibleKeys.map((key) => fingerprint(key))
    const eligibleKeysFingerprint = fingerprint(eligibleKeyFingerprints)
    const eligible = new Set(eligibleKeyFingerprints)
    const heads = (yield* allHeadsAtCut(tx, ownerCut.frontierSequence)).filter(
      (suggestion) =>
        suggestion.current.disposition === "active" &&
        (suggestion.current.snapshot.retrievalScope.type === "learner_home_fallback" ||
          suggestion.current.snapshot.retrievalScope.anchors.some((anchor) =>
            eligible.has(fingerprint(anchor.stableOwnerKey)),
          )),
    )
    const candidates = yield* Effect.forEach(heads.slice(0, limit), (suggestion) =>
      Effect.map(projectionAtCut(tx, suggestion, suggestion.current, ownerCut, input.asOf), (projection) => ({
        suggestion,
        projection,
        authorClass: authorClass(suggestion.current.authorAndCause.type),
        retrievalArm: suggestion.current.snapshot.retrievalScope.type,
        anchorKinds:
          suggestion.current.snapshot.retrievalScope.type === "learner_home_fallback"
            ? []
            : [...new Set(suggestion.current.snapshot.retrievalScope.anchors.map((anchor) => anchor.stableOwnerKey.type))].toSorted(),
      })),
    )
    return {
      ownerCut,
      asOf: input.asOf,
      eligibleKeyCount: eligibleKeys.length,
      eligibleKeysFingerprint,
      directoryCursor: encodeDirectoryCursor({ ownerCut, asOf: input.asOf, eligibleKeyFingerprints }),
      countAtCut: heads.length,
      order: "identity_creation_then_suggestion_id_non_priority" as const,
      candidates,
    } satisfies ContextProjection
  })
}

export function semanticValueFor(candidate: ContextProjection["candidates"][number]) {
  const revision = candidate.suggestion.current
  const value = contextSemanticValue({
    suggestionID: candidate.suggestion.id,
    revisionID: revision.id,
    version: revision.version,
    disposition: revision.disposition,
    purpose: revision.snapshot.purpose,
    learnerVisibleScope: revision.snapshot.learnerVisibleScope,
    directorySummary: revision.snapshot.directorySummary,
    authorClass: candidate.authorClass,
    retrievalArm: candidate.retrievalArm,
    anchorKinds: candidate.anchorKinds,
    currentRelation: candidate.projection.currentRelation,
    retrievalRelations: candidate.projection.retrievalAnchorRelations.map((item) => item.relation),
    basisRelations: candidate.projection.basisDependencies,
    alternativeTarget: candidate.projection.alternativeTarget ?? null,
  })
  if (utf8Bytes(canonicalJson(toJsonValue(value))) > MAX_SEMANTIC_VALUE_BYTES) {
    throw new InvalidCommandError({ reason: "capacity_exceeded" })
  }
  return value
}

type ContextSemanticInput = Readonly<{
  suggestionID: SuggestionID
  revisionID: RevisionID
  version: number
  disposition: MaterializedIntent["disposition"]
  purpose: string
  learnerVisibleScope: string
  directorySummary: string
  authorClass: ContextProjection["candidates"][number]["authorClass"]
  retrievalArm: ContextProjection["candidates"][number]["retrievalArm"]
  anchorKinds: ContextProjection["candidates"][number]["anchorKinds"]
  currentRelation: ProjectionAtCut["currentRelation"]
  retrievalRelations: readonly Pick<DependencyProjection, "state" | "current">[]
  basisRelations: readonly Pick<DependencyProjection, "state" | "current">[]
  alternativeTarget: ProjectionAtCut["alternativeTarget"] | null
}>

function contextSemanticValue(input: ContextSemanticInput) {
  return {
    suggestionID: input.suggestionID,
    revisionID: input.revisionID,
    version: input.version,
    disposition: input.disposition,
    purpose: input.purpose,
    learnerVisibleScope: input.learnerVisibleScope,
    directorySummary: input.directorySummary,
    authorClass: input.authorClass,
    retrievalArm: input.retrievalArm,
    anchorKinds: input.anchorKinds,
    currentRelation: input.currentRelation,
    retrievalRelations: input.retrievalRelations.map((item, ordinal) => ({
      ordinal,
      state: item.state,
      ...temporalDependencySummary(item),
    })),
    basisRelations: input.basisRelations.map((item, ordinal) => ({
      ordinal,
      state: item.state,
      ...temporalDependencySummary(item),
    })),
    alternativeTarget: input.alternativeTarget,
    detail: "body_basis_and_history_require_exact_lazy_read" as const,
    nonImplications: [
      "advice_not_schedule_or_commitment",
      "not_activity_adherence_progress_or_mastery",
      "clock_silence_and_absence_imply_no_following",
      "directory_order_is_not_priority_or_selected_plan",
    ] as const,
  }
}

function requireContextSemanticCapacity(item: MaterializedIntent) {
  const maximumRelation = (ref: ExactBasisRef | RetrievalBoundRef) => ({
    state: "source_unavailable" as const,
    ...(ref.type === "goal_revision"
      ? {
          current: {
            revisionID: ref.revisionID,
            version: Number.MAX_SAFE_INTEGER,
            targetRelationAtCut: "source_unavailable",
          },
        }
      : ref.type === "assignment_revision"
        ? {
            current: {
              revisionID: ref.revisionID,
              version: Number.MAX_SAFE_INTEGER,
              dueRelationAtCut: { type: "local_date", relation: "before", overdue: false },
              expiryRelationAtCut: { type: "local_date", relation: "before", expired: false },
            },
          }
        : ref.type === "learner_state_judgment_revision" ||
            ref.type === "advisory_plan_suggestion_revision"
          ? {
              current: {
                revisionID: ref.revisionID,
                version: Number.MAX_SAFE_INTEGER,
              },
            }
          : {}),
  })
  const retrieval =
    item.snapshot.retrievalScope.type === "anchored"
      ? item.snapshot.retrievalScope.anchors.map((anchor) => maximumRelation(anchor.exactBound.ref))
      : []
  const basis = item.snapshot.exactBasis.map((binding) => maximumRelation(binding.ref))
  const value = contextSemanticValue({
    suggestionID: item.suggestionID,
    revisionID: item.revisionID,
    version: Number.MAX_SAFE_INTEGER,
    disposition: item.disposition,
    purpose: item.snapshot.purpose,
    learnerVisibleScope: item.snapshot.learnerVisibleScope,
    directorySummary: item.snapshot.directorySummary,
    authorClass: authorClass(item.authorAndCause.type),
    retrievalArm: item.snapshot.retrievalScope.type,
    anchorKinds:
      item.snapshot.retrievalScope.type === "anchored"
        ? [...new Set(item.snapshot.retrievalScope.anchors.map((anchor) => anchor.stableOwnerKey.type))].toSorted()
        : [],
    currentRelation: "current",
    retrievalRelations: retrieval,
    basisRelations: basis,
    alternativeTarget: item.alternativeToRevision
      ? {
          target: item.alternativeToRevision,
          headRelation: "source_unavailable",
          lifecycle: "source_unavailable",
          currentHead: {
            suggestionID: item.alternativeToRevision.suggestionID,
            revisionID: item.alternativeToRevision.revisionID,
            version: Number.MAX_SAFE_INTEGER,
          },
        }
      : null,
  })
  if (utf8Bytes(canonicalJson(toJsonValue(value))) > MAX_SEMANTIC_VALUE_BYTES) {
    throw invalidError("capacity_exceeded")
  }
}

function temporalDependencySummary(projection: Pick<DependencyProjection, "current">) {
  const current = projection.current
  if (!current) return {}
  return {
    ...(typeof current.revisionID === "string" && Number.isSafeInteger(current.version)
      ? { currentRevision: { revisionID: current.revisionID, version: current.version as number } }
      : {}),
    ...(typeof current.targetRelationAtCut === "string"
      ? { targetRelationAtCut: current.targetRelationAtCut }
      : {}),
    ...(isRecord(current.dueRelationAtCut) ? { dueRelationAtCut: current.dueRelationAtCut } : {}),
    ...(isRecord(current.expiryRelationAtCut) ? { expiryRelationAtCut: current.expiryRelationAtCut } : {}),
  }
}

export function headReferenceFingerprint(suggestion: Suggestion) {
  return fingerprint({
    suggestionID: suggestion.id,
    revisionID: suggestion.current.id,
    version: suggestion.current.version,
    disposition: suggestion.current.disposition,
    retrievalScope: suggestion.current.snapshot.retrievalScope,
    alternativeToRevision: suggestion.alternativeToRevision ?? null,
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
      .select({ identity: AdvisoryPlanSuggestionTable, revision: AdvisoryPlanSuggestionRevisionTable })
      .from(AdvisoryPlanSuggestionTable)
      .innerJoin(
        AdvisoryPlanSuggestionRevisionTable,
        eq(AdvisoryPlanSuggestionRevisionTable.suggestion_id, AdvisoryPlanSuggestionTable.id),
      )
      .where(
        and(
          sql`${AdvisoryPlanSuggestionRevisionTable.frontier_sequence} <= ${frontierSequence}`,
          committedRevision,
          noCommittedSuccessorAt(frontierSequence),
        ),
      )
      .orderBy(asc(AdvisoryPlanSuggestionTable.time_created), asc(AdvisoryPlanSuggestionTable.id))
      .all()
      .pipe(Effect.orDie)
    return rows.map((row) => judgmentInfo(row.identity, row.revision))
  })
}

function judgmentAtCut(tx: Transaction, suggestionID: SuggestionID, frontierSequence: number) {
  return Effect.map(allHeadsAtCut(tx, frontierSequence), (heads) =>
    heads.find((judgment) => judgment.id === suggestionID),
  )
}

function currentSuggestion(tx: Transaction, suggestionID: SuggestionID) {
  return Effect.gen(function* () {
    const frontier = yield* LearningFrontier.read(tx)
    return yield* judgmentAtCut(tx, suggestionID, frontier.sequence)
  })
}

function exactRevision(tx: Transaction, suggestionID: SuggestionID, revisionID: RevisionID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(AdvisoryPlanSuggestionRevisionTable)
      .where(
        and(
          eq(AdvisoryPlanSuggestionRevisionTable.suggestion_id, suggestionID),
          eq(AdvisoryPlanSuggestionRevisionTable.id, revisionID),
          committedRevision,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    return row ? revisionInfo(row) : undefined
  })
}

function projectionAtCut(tx: Transaction, suggestion: Suggestion, revision: Revision, ownerCut: OwnerCut, asOf: number) {
  return Effect.gen(function* () {
    const head = yield* judgmentAtCut(tx, suggestion.id, ownerCut.frontierSequence)
    const anchorBindings =
      revision.snapshot.retrievalScope.type === "anchored" ? revision.snapshot.retrievalScope.anchors : []
    const alternativeTarget = revision.alternativeToRevision
      ? yield* alternativeTargetProjection(tx, revision.alternativeToRevision, ownerCut)
      : undefined
    return {
      suggestionRevisionRef: { suggestionID: suggestion.id, revisionID: revision.id, version: revision.version },
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
      retrievalAnchorRelations: yield* Effect.forEach(anchorBindings, (anchor) =>
        Effect.map(dependencyProjection(tx, anchor.exactBound, ownerCut, asOf), (relation) => ({
          stableOwnerKey: anchor.stableOwnerKey,
          exactBoundRef: anchor.exactBound.ref,
          refFingerprint: anchor.exactBound.refFingerprint,
          relation,
        })),
      ),
      basisDependencies: yield* Effect.forEach(revision.snapshot.exactBasis, (binding) =>
        dependencyProjection(tx, binding, ownerCut, asOf),
      ),
      ...(alternativeTarget ? { alternativeTarget } : {}),
      revision,
    } satisfies ProjectionAtCut
  })
}

function alternativeTargetProjection(tx: Transaction, target: SuggestionRevisionRef, ownerCut: OwnerCut) {
  return Effect.gen(function* () {
    const exact = yield* exactRevision(tx, target.suggestionID, target.revisionID)
    const current = yield* judgmentAtCut(tx, target.suggestionID, ownerCut.frontierSequence)
    if (!exact || exact.version !== target.version || !current) {
      return {
        target,
        headRelation: "source_unavailable" as const,
        lifecycle: "source_unavailable" as const,
      }
    }
    return {
      target,
      headRelation: current.current.id === target.revisionID ? ("same_head" as const) : ("head_advanced" as const),
      lifecycle: current.current.disposition,
      currentHead: {
        suggestionID: current.id,
        revisionID: current.current.id,
        version: current.current.version,
      },
    }
  })
}

function dependencyProjection(tx: Transaction, binding: ExactBinding, ownerCut: OwnerCut, asOf: number) {
  return Effect.gen(function* () {
    const state = yield* currentDependency(tx, binding, ownerCut, asOf).pipe(
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

function currentDependency(tx: Transaction, binding: ExactBinding, ownerCut: OwnerCut, asOf: number) {
  return Effect.gen(function* () {
    const ref = binding.ref
    const admission = yield* admissionForRef(tx, ref)
    const admissionChanged = fingerprint(admission) !== binding.admissionFingerprint
    if (ref.type === "course_membership") {
      const membership = yield* Course.inspectMembershipStatus(tx, ref.endpoint, {
        type: "observed_working",
        revisionID: ref.endpoint.revisionID,
        version: 0,
      })
      return {
        state:
          admissionChanged || membership.status === "stale" ? ("changed" as const) : ("current" as const),
        current: toRecord({ admission, workingSelection: membership }),
      }
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
            current: toRecord({
              revisionID: current.head.id,
              version: current.head.version,
              targetRelationAtCut: current.head.targetRelation,
            }),
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
            current: toRecord({
              revisionID: current.revision.id,
              version: current.revision.version,
              dueRelationAtCut: current.dueRelationAtCut,
              expiryRelationAtCut: current.expiryRelationAtCut,
            }),
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
    if (ref.type === "learner_state_judgment_revision") {
      const current = yield* LearnerStateJudgment.readCurrent(tx, ref.judgmentID, asOf)
      return current
        ? {
            state:
              !admissionChanged &&
              current.revision.id === ref.revisionID &&
              current.revision.version === ref.version
                ? ("current" as const)
                : ("changed" as const),
            current: toRecord({ revisionID: current.revision.id, version: current.revision.version }),
          }
        : { state: "source_unavailable" as const }
    }
    if (ref.type === "advisory_plan_suggestion_revision") {
      const current = yield* judgmentAtCut(tx, ref.suggestionID, ownerCut.frontierSequence)
      return current
        ? {
            state:
              !admissionChanged &&
              current.current.id === ref.revisionID &&
              current.current.version === ref.version
                ? ("current" as const)
                : ("changed" as const),
            current: toRecord({ revisionID: current.current.id, version: current.current.version }),
          }
        : { state: "source_unavailable" as const }
    }
    return { state: admissionChanged ? ("changed" as const) : ("current" as const), current: admission }
  })
}

function revisionInfo(row: typeof AdvisoryPlanSuggestionRevisionTable.$inferSelect): Revision {
  return {
    id: row.id,
    suggestionID: row.suggestion_id,
    version: row.version,
    ...(row.predecessor_revision_id ? { predecessorRevisionID: row.predecessor_revision_id } : {}),
    operation: row.operation,
    operationOrdinal: row.operation_ordinal,
    disposition: row.disposition,
    snapshot: row.snapshot,
    ...(row.alternative_target_suggestion_id && row.alternative_target_revision_id && row.alternative_target_version
      ? {
          alternativeToRevision: {
            suggestionID: row.alternative_target_suggestion_id,
            revisionID: row.alternative_target_revision_id,
            version: row.alternative_target_version,
          },
        }
      : {}),
    authorAndCause: row.author_and_cause,
    effectID: row.effect_id,
    timeCommitted: row.time_committed,
    commitOrder: row.commit_order,
    frontierSequence: row.frontier_sequence,
  }
}

function judgmentInfo(
  identityRow: typeof AdvisoryPlanSuggestionTable.$inferSelect,
  revisionRow: typeof AdvisoryPlanSuggestionRevisionTable.$inferSelect,
) {
  return {
    id: identityRow.id,
    timeCreated: identityRow.time_created,
    ...(identityRow.alternative_target_suggestion_id &&
    identityRow.alternative_target_revision_id &&
    identityRow.alternative_target_version
      ? {
          alternativeToRevision: {
            suggestionID: identityRow.alternative_target_suggestion_id,
            revisionID: identityRow.alternative_target_revision_id,
            version: identityRow.alternative_target_version,
          },
        }
      : {}),
    current: revisionInfo(revisionRow),
  } satisfies Suggestion
}

function hasStableOwnerKey(snapshot: SemanticSnapshot, key: StableOwnerKey) {
  const target = fingerprint(key)
  return (
    snapshot.retrievalScope.type === "anchored" &&
    snapshot.retrievalScope.anchors.some((item) => fingerprint(item.stableOwnerKey) === target)
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
    | Readonly<{ type: "discover"; timeCreated: number; suggestionID: SuggestionID }>
  fingerprint: string
}>

type DirectoryCursor = Readonly<{
  schemaVersion: 1
  ownerCut: OwnerCut
  asOf: number
  eligibleKeyFingerprints: readonly string[]
  eligibleKeysFingerprint: string
  fingerprint: string
}>

function encodeDirectoryCursor(
  input: Omit<DirectoryCursor, "schemaVersion" | "eligibleKeysFingerprint" | "fingerprint">,
) {
  const basis = {
    schemaVersion: 1 as const,
    ...input,
    eligibleKeysFingerprint: fingerprint(input.eligibleKeyFingerprints),
  }
  const fields = [
    String(basis.schemaVersion),
    basis.ownerCut.frontierSequence.toString(36),
    basis.ownerCut.frontierTime.toString(36),
    basis.ownerCut.headCount.toString(36),
    compactDigest(basis.ownerCut.fingerprint),
    basis.asOf.toString(36),
    compactDigest(basis.eligibleKeysFingerprint),
    basis.eligibleKeyFingerprints.length.toString(36),
    ...basis.eligibleKeyFingerprints.map(compactDigest),
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
    const eligibleKeysFingerprint = expandDigest(fields[6])
    const eligibleKeyCount = parseBase36(fields[7])
    if (
      schemaVersion !== 1 ||
      eligibleKeyCount > MAX_DIRECTORY_KEYS ||
      fields.length !== eligibleKeyCount + 9
    ) {
      throw new Error("invalid")
    }
    const eligibleKeyFingerprints = fields.slice(8, 8 + eligibleKeyCount).map(expandDigest)
    if (
      new Set(eligibleKeyFingerprints).size !== eligibleKeyFingerprints.length ||
      eligibleKeyFingerprints.some((item, index) => index > 0 && eligibleKeyFingerprints[index - 1]! > item) ||
      eligibleKeysFingerprint !== fingerprint(eligibleKeyFingerprints) ||
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
    if (
      !ownerCutShape(ownerCut) ||
      ownerCut.fingerprint !== fingerprint({ frontierSequence, frontierTime, headCount }) ||
      !Number.isSafeInteger(asOf) ||
      asOf < 0
    ) {
      throw new Error("invalid")
    }
    return {
      schemaVersion: 1,
      ownerCut,
      asOf,
      eligibleKeyFingerprints,
      eligibleKeysFingerprint,
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
      eligibleKeyCount: cursor.eligibleKeyFingerprints.length,
      eligibleKeysFingerprint: cursor.eligibleKeysFingerprint,
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

function canonicalStableKeys(input: readonly StableOwnerKey[]) {
  return [...new Map(input.map((key) => [fingerprint(key), key])).values()].toSorted((left, right) =>
    fingerprint(left).localeCompare(fingerprint(right)),
  )
}

function ownerCutShape(value: unknown): value is OwnerCut {
  return (
    isRecord(value) &&
    exactKeys(value, ["frontierSequence", "frontierTime", "headCount", "fingerprint"]) &&
    typeof value.frontierSequence === "number" &&
    Number.isSafeInteger(value.frontierSequence) &&
    value.frontierSequence >= 0 &&
    typeof value.frontierTime === "number" &&
    Number.isSafeInteger(value.frontierTime) &&
    value.frontierTime >= 0 &&
    typeof value.headCount === "number" &&
    Number.isSafeInteger(value.headCount) &&
    value.headCount >= 0 &&
    lowercaseHash(value.fingerprint)
  )
}

function encodeCursor(input: Omit<Cursor, "fingerprint">) {
  const cursor = { ...input, fingerprint: fingerprint(input) } satisfies Cursor
  return Buffer.from(canonicalJson(toJsonValue(cursor))).toString("base64url")
}

function decodeCursor(value: string, query: ReadQuery, queryFingerprint: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor
    const { fingerprint: stored, ...basis } = parsed
    if (
      !isRecord(parsed) ||
      !exactKeys(parsed, [
        "schemaVersion",
        "queryFingerprint",
        "ownerCut",
        "asOf",
        "consumedCount",
        "after",
        "fingerprint",
      ]) ||
      parsed.schemaVersion !== 1 ||
      parsed.queryFingerprint !== queryFingerprint ||
      !/^[0-9a-f]{64}$/.test(stored) ||
      stored !== fingerprint(basis) ||
      Buffer.from(canonicalJson(toJsonValue(parsed))).toString("base64url") !== value ||
      !Number.isSafeInteger(parsed.asOf) ||
      parsed.asOf < 0 ||
      !Number.isSafeInteger(parsed.consumedCount) ||
      parsed.consumedCount < 1 ||
      !ownerCutShape(parsed.ownerCut) ||
      parsed.ownerCut.fingerprint !== fingerprint({
        frontierSequence: parsed.ownerCut.frontierSequence,
        frontierTime: parsed.ownerCut.frontierTime,
        headCount: parsed.ownerCut.headCount,
      }) ||
      !isRecord(parsed.after) ||
      (query.type === "history"
        ? !(
            exactKeys(parsed.after, ["type", "version"]) &&
            parsed.after.type === "history" &&
            positiveInteger(parsed.after.version)
          )
        : query.type === "discover"
          ? !(
              exactKeys(parsed.after, ["type", "timeCreated", "suggestionID"]) &&
              parsed.after.type === "discover" &&
              nonnegativeInteger(parsed.after.timeCreated) &&
              opaqueID(parsed.after.suggestionID, "aps")
            )
          : true)
    ) {
      throw new Error("invalid")
    }
    return parsed
  } catch {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
}

function pagedResult<Item extends Suggestion | Revision>(input: {
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

function requireExpectedHead(current: Suggestion, expected: ExpectedHead) {
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
    return integrity("Advisory-suggestion mutation is restricted to the ordinary interactive root Agent")
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
    : integrity("Advisory-suggestion envelope has an incompatible capability or provenance basis")
}

function invocationEnvelope(invocation: typeof LearningCommandInvocationTable.$inferSelect): InvocationEnvelope {
  if (!invocation.turn_id || !invocation.input_id) throw new Error("Advisory-suggestion invocation lost Turn identity")
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
      return yield* integrity("Advisory-suggestion invocation is unavailable")
    }
    return invocation
  })
}

function readDisposition(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(AdvisoryPlanSuggestionDispositionTable)
    .where(eq(AdvisoryPlanSuggestionDispositionTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function requireCandidate(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, partID)
    if (invocation.status !== "admitted")
      return yield* integrity("Advisory-suggestion capability requires an admitted candidate")
    const row = yield* readDisposition(tx, partID)
    if (!row || row.disposition !== "candidate_v1")
      return yield* integrity("Advisory-suggestion invocation has no candidate")
    return candidateInfo(row)
  })
}

function candidateInfo(row: typeof AdvisoryPlanSuggestionDispositionTable.$inferSelect) {
  if (row.disposition !== "candidate_v1" || !row.materialized_candidate) {
    throw new Error("Advisory-suggestion candidate row is incomplete")
  }
  return row.materialized_candidate
}

function semanticTerminalInfo(row: typeof AdvisoryPlanSuggestionDispositionTable.$inferSelect) {
  if (row.disposition !== "semantic_terminal_v1" || !row.semantic_outcome) {
    throw new Error("Advisory-suggestion terminal disposition is incomplete")
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
    .from(AdvisoryPlanSuggestionCapabilityIssueTable)
    .where(eq(AdvisoryPlanSuggestionCapabilityIssueTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function readCapabilitySettlement(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(AdvisoryPlanSuggestionCapabilitySettlementTable)
    .where(eq(AdvisoryPlanSuggestionCapabilitySettlementTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilityIssueInfo(row: typeof AdvisoryPlanSuggestionCapabilityIssueTable.$inferSelect) {
  return {
    requestID: row.permission_request_id,
    policyBasis: row.policy_basis,
    shownScope: row.shown_scope,
    timeIssued: row.time_issued,
    issueOrder: row.issue_order,
  }
}

function capabilitySettlementInfo(row: typeof AdvisoryPlanSuggestionCapabilitySettlementTable.$inferSelect) {
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

export function renderAcknowledgement(items: readonly MaterializedIntent[]) {
  const changed = items.filter((item) => item.outcome === "changed")
  return {
    title: changed.length === 1 ? "Advisory learning suggestion updated" : "Advisory learning suggestions updated",
    body:
      `${changed.length} changed; ${items.length - changed.length} unchanged.\n` +
      "This is correctable, source-bearing Tutor advice, not a schedule, learner commitment, activity/adherence record, or proof of mastery.",
  }
}

function snapshotIntentFrom(snapshot: SemanticSnapshot): SemanticSnapshotIntent {
  return {
    learnerVisibleScope: snapshot.learnerVisibleScope,
    retrievalScope:
      snapshot.retrievalScope.type === "learner_home_fallback"
        ? { type: "learner_home_fallback", reason: snapshot.retrievalScope.reason }
        : {
            type: "anchored",
            anchors: snapshot.retrievalScope.anchors.map((anchor) => ({
              stableOwnerKey: anchor.stableOwnerKey,
              exactBoundRef: anchor.exactBound.ref,
            })),
          },
    purpose: snapshot.purpose,
    directorySummary: snapshot.directorySummary,
    body: snapshot.body,
    exactBasisRefs: snapshot.exactBasis.map((binding) => binding.ref),
    ...(snapshot.assumptionsAndUncertainty
      ? { assumptionsAndUncertainty: snapshot.assumptionsAndUncertainty }
      : {}),
  }
}

function canonicalSnapshotIntent(snapshot: SemanticSnapshotIntent): SemanticSnapshotIntent {
  const basis = snapshot.exactBasisRefs.toSorted((left, right) => fingerprint(left).localeCompare(fingerprint(right)))
  return {
    learnerVisibleScope: snapshot.learnerVisibleScope,
    retrievalScope:
      snapshot.retrievalScope.type === "anchored"
        ? {
            type: "anchored",
            anchors: snapshot.retrievalScope.anchors.toSorted((left, right) =>
              fingerprint(left.stableOwnerKey).localeCompare(fingerprint(right.stableOwnerKey)),
            ),
          }
        : { type: "learner_home_fallback", reason: snapshot.retrievalScope.reason },
    purpose: snapshot.purpose,
    directorySummary: snapshot.directorySummary,
    body: snapshot.body,
    exactBasisRefs: basis,
    ...(snapshot.assumptionsAndUncertainty !== undefined
      ? { assumptionsAndUncertainty: snapshot.assumptionsAndUncertainty }
      : {}),
  }
}

function authorClass(type: AuthorAndCause["type"]): ContextProjection["candidates"][number]["authorClass"] {
  return type
}

function closedCommand(value: unknown): value is Command {
  if (!isRecord(value) || !exactKeys(value, ["cause", "intents"]) || !closedCause(value.cause)) return false
  const cause = value.cause
  if (
    !Array.isArray(value.intents) ||
    value.intents.length < 1 ||
    value.intents.length > MAX_INTENTS
  ) {
    return false
  }
  if (!value.intents.every((intent, index) => intentShape(intent, cause.type, index))) return false
  const createOrdinals = value.intents.flatMap((intent) =>
    isRecord(intent) && (intent.operation === "create" || intent.operation === "alternative")
      ? [intent.createOrdinal]
      : [],
  )
  return createOrdinals.every((ordinal, index) => ordinal === index)
}

function intentShape(value: unknown, causeType: Command["cause"]["type"], operationOrdinal: number): value is Intent {
  if (!isRecord(value) || value.operationOrdinal !== operationOrdinal || typeof value.operation !== "string") {
    return false
  }
  const creates = causeType === "responsive_tutor_proposal" || causeType === "proactive_tutor_proposal"
  const revises = causeType === "learner_revision" || causeType === "tutor_revision"
  if (value.operation === "create") {
    return (
      creates &&
      exactKeys(value, ["operation", "operationOrdinal", "createOrdinal", "snapshot"]) &&
      nonnegativeInteger(value.createOrdinal) &&
      snapshotShape(value.snapshot)
    )
  }
  if (value.operation === "alternative") {
    return (
      creates &&
      exactKeys(value, ["operation", "operationOrdinal", "createOrdinal", "alternativeToRevision", "snapshot"]) &&
      nonnegativeInteger(value.createOrdinal) &&
      suggestionRevisionRefShape(value.alternativeToRevision) &&
      snapshotShape(value.snapshot)
    )
  }
  if (
    !revises ||
    !opaqueID(value.suggestionID, "aps") ||
    !expectedHeadShape(value.expectedHead) ||
    !textBytes(value.rationale, 1, MAX_RATIONALE_BYTES)
  ) {
    return false
  }
  if (value.operation === "revise") {
    return (
      exactKeys(value, ["operation", "operationOrdinal", "suggestionID", "expectedHead", "snapshot", "rationale"]) &&
      snapshotShape(value.snapshot)
    )
  }
  if (value.operation === "retire") {
    return exactKeys(value, ["operation", "operationOrdinal", "suggestionID", "expectedHead", "rationale"])
  }
  return (
    value.operation === "restore" &&
    exactKeys(
      value,
      value.snapshot === undefined
        ? ["operation", "operationOrdinal", "suggestionID", "expectedHead", "rationale"]
        : ["operation", "operationOrdinal", "suggestionID", "expectedHead", "snapshot", "rationale"],
    ) &&
    (value.snapshot === undefined || snapshotShape(value.snapshot))
  )
}

function closedCause(value: unknown): value is Command["cause"] {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "responsive_tutor_proposal") {
    return (
      exactKeys(value, ["type", "excerpt", "rationale"]) &&
      excerptShape(value.excerpt) &&
      textBytes(value.rationale, 1, MAX_RATIONALE_BYTES)
    )
  }
  if (value.type === "learner_revision") return exactKeys(value, ["type", "excerpt"]) && excerptShape(value.excerpt)
  return (
    (value.type === "proactive_tutor_proposal" || value.type === "tutor_revision") &&
    exactKeys(value, ["type", "rationale"]) &&
    textBytes(value.rationale, 1, MAX_RATIONALE_BYTES)
  )
}

function snapshotShape(value: unknown): value is SemanticSnapshotIntent {
  if (!isRecord(value) || !isRecord(value.retrievalScope) || !Array.isArray(value.exactBasisRefs)) return false
  if (
    !exactKeys(
      value,
      value.assumptionsAndUncertainty === undefined
        ? ["learnerVisibleScope", "retrievalScope", "purpose", "directorySummary", "body", "exactBasisRefs"]
        : [
            "learnerVisibleScope",
            "retrievalScope",
            "purpose",
            "directorySummary",
            "body",
            "exactBasisRefs",
            "assumptionsAndUncertainty",
          ],
    ) ||
    !textBytes(value.learnerVisibleScope, 1, MAX_LEARNER_VISIBLE_SCOPE_BYTES) ||
    !textBytes(value.purpose, 1, MAX_PURPOSE_BYTES) ||
    !textBytes(value.directorySummary, 1, MAX_DIRECTORY_SUMMARY_BYTES) ||
    !textBytes(value.body, 1, MAX_BODY_BYTES) ||
    (value.assumptionsAndUncertainty !== undefined &&
      !textBytes(value.assumptionsAndUncertainty, 1, MAX_ASSUMPTIONS_BYTES)) ||
    value.exactBasisRefs.length > MAX_BASIS_REFS ||
    !value.exactBasisRefs.every(exactBasisRefShape)
  ) {
    return false
  }
  const scope = value.retrievalScope
  if (scope.type === "learner_home_fallback") {
    return (
      exactKeys(scope, ["type", "reason"]) &&
      (scope.reason === "no_stable_owner_anchor" || scope.reason === "deliberately_cross_cutting")
    )
  }
  return (
    scope.type === "anchored" &&
    exactKeys(scope, ["type", "anchors"]) &&
    Array.isArray(scope.anchors) &&
    scope.anchors.length >= 1 &&
    scope.anchors.length <= MAX_RETRIEVAL_ANCHORS &&
    scope.anchors.every(retrievalAnchorIntentShape)
  )
}

function retrievalAnchorIntentShape(value: unknown): value is RetrievalAnchorIntent {
  return (
    isRecord(value) &&
    exactKeys(value, ["stableOwnerKey", "exactBoundRef"]) &&
    stableOwnerKeyShape(value.stableOwnerKey) &&
    retrievalBoundRefShape(value.exactBoundRef) &&
    stableOwnerKeyMatchesBoundRef(value.stableOwnerKey, value.exactBoundRef)
  )
}

function stableOwnerKeyShape(value: unknown): value is StableOwnerKey {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "course") return exactKeys(value, ["type", "courseID"]) && opaqueID(value.courseID, "crs")
  if (value.type === "course_view") {
    return (
      exactKeys(value, ["type", "courseID", "viewID"]) &&
      opaqueID(value.courseID, "crs") &&
      opaqueID(value.viewID, "cvw")
    )
  }
  if (value.type === "goal") return exactKeys(value, ["type", "goalID"]) && opaqueID(value.goalID, "gol")
  if (value.type === "assignment") {
    return exactKeys(value, ["type", "assignmentID"]) && opaqueID(value.assignmentID, "asn")
  }
  if (value.type === "material_selector") {
    return (
      exactKeys(value, ["type", "mapID", "selectorID"]) &&
      opaqueID(value.mapID, "mmp") &&
      opaqueID(value.selectorID, "msl")
    )
  }
  return (
    value.type === "learner_state_judgment" &&
    exactKeys(value, ["type", "judgmentID"]) &&
    opaqueID(value.judgmentID, "lsj")
  )
}

function retrievalBoundRefShape(value: unknown): value is RetrievalBoundRef {
  return (
    exactBasisRefShape(value) &&
    value.type !== "learner_response_evidence_revision" &&
    value.type !== "interaction" &&
    value.type !== "advisory_plan_suggestion_revision"
  )
}

function stableOwnerKeyMatchesBoundRef(key: StableOwnerKey, ref: RetrievalBoundRef) {
  return (
    (key.type === "course" && ref.type === "course_membership" && key.courseID === ref.endpoint.courseID) ||
    (key.type === "course_view" &&
      ref.type === "course_membership" &&
      key.courseID === ref.endpoint.courseID &&
      key.viewID === ref.endpoint.viewID) ||
    (key.type === "goal" && ref.type === "goal_revision" && key.goalID === ref.goalID) ||
    (key.type === "assignment" && ref.type === "assignment_revision" && key.assignmentID === ref.assignmentID) ||
    (key.type === "material_selector" &&
      ref.type === "material_selector" &&
      key.mapID === ref.mapID &&
      key.selectorID === ref.selectorID) ||
    (key.type === "learner_state_judgment" &&
      ref.type === "learner_state_judgment_revision" &&
      key.judgmentID === ref.judgmentID)
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
  if (value.type === "learner_state_judgment_revision") {
    return (
      exactKeys(value, ["type", "judgmentID", "revisionID", "version"]) &&
      opaqueID(value.judgmentID, "lsj") &&
      opaqueID(value.revisionID, "lsr") &&
      positiveInteger(value.version)
    )
  }
  if (value.type === "advisory_plan_suggestion_revision") {
    return (
      exactKeys(value, ["type", "suggestionID", "revisionID", "version"]) &&
      opaqueID(value.suggestionID, "aps") &&
      opaqueID(value.revisionID, "apr") &&
      positiveInteger(value.version)
    )
  }
  return value.type === "interaction" && exactKeys(value, ["type", "locator"]) && interactionLocatorShape(value.locator)
}

function admissionReceipt(ref: ExactBasisRef | RetrievalBoundRef, observed: unknown) {
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
  return TurnLearningContext.isLocator(value)
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
    opaqueID(value.revisionID, "apr") &&
    positiveInteger(value.version) &&
    lowercaseHash(value.ownerCutFingerprint)
  )
}

function suggestionRevisionRefShape(value: unknown): value is SuggestionRevisionRef {
  return (
    isRecord(value) &&
    exactKeys(value, ["suggestionID", "revisionID", "version"]) &&
    opaqueID(value.suggestionID, "aps") &&
    opaqueID(value.revisionID, "apr") &&
    positiveInteger(value.version)
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
    command.cause.type === "learner_revision"
      ? {
          type: "learner_occurrence",
          occurrenceID: envelope.occurrenceID,
          slot: "suggestion_change_set",
        }
      : {
          type: "root_model_operation",
          modelOperationID: envelope.assistantMessageID,
          slot: "suggestion_change_set",
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
