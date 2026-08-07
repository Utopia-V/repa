export * as FutureAttention from "./future-attention"

import { Turn } from "@opencode-ai/schema/turn"
import { FutureAttentionEvent } from "@opencode-ai/schema/future-attention-event"
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm"
import { Effect } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Course } from "./course"
import {
  resolveLocalInstant,
  resolveZone,
  validateSourceExpression,
  type SourceZone as CivilSourceZone,
  type ZoneIntent as CivilZoneIntent,
} from "./civil-time"
import { LearningFrontier } from "./learning-frontier"
import { EventV2 } from "./event"
import { canonicalFingerprint, canonicalJson, toJsonValue, utf8Bytes } from "./learning-context/schema"
import { Occurrence } from "./learning-command/occurrence"
import { LearnerOccurrenceTombstoneTable, AdmittedLearnerOccurrenceTable } from "./learning-command/occurrence.sql"
import {
  admitPhysicalInvocation,
  appliedMutation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  lookupPhysicalInvocation,
  occurrenceAvailable,
  requirePhysicalSettlement,
  requireSettlementMetadata,
  settlePhysicalInvocation,
} from "./learning-command/physical"
import type { InvocationEnvelope, SettlementMetadata } from "./learning-command/physical-schema"
import { LearningCommandInvocationTable } from "./learning-command/sql"
import type { Transaction } from "./learning-command/transaction"
import type { SessionSchema } from "./session/schema"
import { MessageTable, PartTable, SessionTable } from "./session/sql"
import { TurnLifecycle, type ValidatedAgentActionRegistration } from "./turn/turn"
import {
  TurnChildResultTable,
  TurnInputTable,
  TurnModelOperationTable,
  TurnModelPresentationTable,
  TurnTable,
  TurnToolCandidateTable,
  TurnToolInvocationTable,
  TurnUnavailableModelTable,
  TurnUnavailableSourceTable,
  TurnUnavailableToolTable,
} from "./turn/sql"
import { Wildcard } from "./util/wildcard"
import type { PermissionV1 } from "./v1/permission"
import type { MessageID, PartID, SessionV1 } from "./v1/session"
import {
  FutureAttentionCapabilityIssueTable,
  FutureAttentionCapabilitySettlementTable,
  FutureAttentionChangeSetTable,
  FutureAttentionClaimFinalizationTable,
  FutureAttentionClaimGroupTable,
  FutureAttentionClaimMemberTable,
  FutureAttentionConcernTable,
  FutureAttentionDispositionTable,
  FutureAttentionServiceReceiptTable,
  FutureAttentionTransitionTable,
} from "./future-attention/sql"
import {
  ChangeSetID,
  ClaimGroupID,
  ConcernID,
  FinalizationReceiptID,
  IntegrityError,
  InvalidCommandError,
  MAX_EXCERPT_BYTES,
  MAX_OPERATIONS,
  MAX_PURPOSE_BYTES,
  MAX_RATIONALE_BYTES,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_SEMANTIC_VALUE_BYTES,
  MAX_TEMPORAL_EXPRESSION_BYTES,
  ServiceReceiptID,
  TransitionID,
  createChangeSetID,
  createClaimGroupID,
  createConcernID,
  createFinalizationReceiptID,
  createServiceReceiptID,
  createTransitionID,
  type AgentAction,
  type AlreadyAppliedSettlement,
  type AppliedSettlement,
  type BoundExcerpt,
  type Candidate,
  type CanonicalChangeSet,
  type CapabilityOutcome,
  type ChangeProjection,
  type ChangeSetCommand,
  type ClaimGroup,
  type ClaimMember,
  type ClaimProjection,
  type CompleteServiceSource,
  type CompletionFacts,
  type ContextProjection,
  type ConcernPayload,
  type ConcernPayloadIntent,
  type ConcernSnapshot,
  type ConcernView,
  type CreationSource,
  type CreationSourceIntent,
  type Disposition,
  type ExcerptIntent,
  type FinalizationMemberResult,
  type FinalizationReceipt,
  type Invocation,
  type InvocationVersion,
  type MaterializedExisting,
  type MaterializedOperation,
  type MutationRelation,
  type MutationRelationIntent,
  type NoChangeSettlement,
  type NotBefore,
  type Operation,
  type OwnerReadReference,
  type ReadPage,
  type ReadQuery,
  type ServiceAlignmentIntent,
  type Source,
  type SourceAvailability,
  type TargetSnapshot,
  type TargetStatus,
  type Transition,
} from "./future-attention/schema"

export {
  ChangeSetID,
  ClaimGroupID,
  ConcernID,
  FinalizationReceiptID,
  IntegrityError,
  InvalidCommandError,
  MAX_EXCERPT_BYTES,
  MAX_OPERATIONS,
  MAX_PURPOSE_BYTES,
  MAX_RATIONALE_BYTES,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_SEMANTIC_VALUE_BYTES,
  MAX_TEMPORAL_EXPRESSION_BYTES,
  ServiceReceiptID,
  TransitionID,
  createChangeSetID,
  createClaimGroupID,
  createConcernID,
  createFinalizationReceiptID,
  createServiceReceiptID,
  createTransitionID,
} from "./future-attention/schema"
export type {
  AgentAction,
  AlreadyAppliedSettlement,
  AppliedSettlement,
  BoundExcerpt,
  Candidate,
  CanonicalChangeSet,
  CapabilityOutcome,
  ChangeProjection,
  ChangeSetCommand,
  ClaimGroup,
  ClaimMember,
  ClaimProjection,
  CompleteServiceSource,
  CompletionFacts,
  ContextProjection,
  ConcernPayload,
  ConcernPayloadIntent,
  ConcernSnapshot,
  ConcernView,
  CreationSource,
  CreationSourceIntent,
  Disposition,
  ExcerptIntent,
  FinalizationMemberResult,
  FinalizationReceipt,
  Invocation,
  InvocationVersion,
  MutationRelation,
  MutationRelationIntent,
  NoChangeSettlement,
  NotBefore,
  Operation,
  OwnerReadReference,
  ReadPage,
  ReadQuery,
  ServiceAlignmentIntent,
  Source,
  SourceAvailability,
  TargetSnapshot,
  TargetStatus,
  Transition,
} from "./future-attention/schema"

export const UPDATE_CAPABILITY = "update_future_attention"
export const UPDATE_VERSION = 1
export const READ_CAPABILITY = "future_attention_read"
export const READ_VERSION = 1
export const PERMISSION_PATTERN = "future_attention"

const identity = { name: UPDATE_CAPABILITY, version: UPDATE_VERSION } as const

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

export function canonicalizeCommand(input: ChangeSetCommand): CanonicalChangeSet {
  if (!closedChangeSet(input)) throw new InvalidCommandError({ reason: "validation_error" })
  const existing = input.operations.filter((operation) => operation.type !== "create")
  if (new Set(existing.map((operation) => operation.concernID)).size !== existing.length) {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
  const creates = input.operations.filter((operation) => operation.type === "create")
  const createFingerprints = creates.map((operation) => fingerprint(operation.concern))
  if (new Set(createFingerprints).size !== createFingerprints.length) {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
  return {
    schemaVersion: 1,
    operations: [...input.operations]
      .map((operation) => toJsonValue(operation) as unknown as Operation)
      .sort((left, right) => operationSortKey(left).localeCompare(operationSortKey(right))),
  }
}

export function commandFingerprint(command: CanonicalChangeSet) {
  return fingerprint(command)
}

export function semanticValueFor(payload: ConcernPayload, availability: SourceAvailability = { state: "available" }) {
  return toJsonValue({
    schemaVersion: 1,
    purpose: payload.purpose,
    authorship: payload.source.type,
    sourceAvailability: availability.state,
    target: {
      endpoint: payload.target.endpoint,
      selection: payload.target.selection,
      receipt: payload.target.receipt,
    },
    notBefore: {
      instant: payload.notBefore.instant,
      utcOffsetMinutes: payload.notBefore.utcOffsetMinutes,
      resolvedZone: payload.notBefore.resolvedZone,
    },
    serviceTiming: payload.serviceTiming,
    ...(payload.interactionOrder ? { interactionOrder: payload.interactionOrder } : {}),
  })
}

export function semanticValueBytes(payload: ConcernPayload, availability?: SourceAvailability) {
  return utf8Bytes(canonicalJson(semanticValueFor(payload, availability)))
}

export function reserve(tx: Transaction, input: Invocation & Readonly<{ settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const command = yield* canonicalCommandEffect(input.command)
    const commandHash = commandFingerprint(command)
    const physicalFingerprint = fingerprint({ identity, envelope: input.envelope, command })
    const existingPhysical = yield* findPhysicalInvocation(tx, input, physicalFingerprint, identity)
    if (existingPhysical) {
      const disposition = yield* readDisposition(tx, existingPhysical.part_id)
      if (existingPhysical.status === "admitted") {
        if (!disposition || disposition.disposition !== "candidate_v1") {
          return yield* integrity("Only a complete FutureAttention candidate may remain admitted")
        }
        return { type: "admitted" as const, candidate: candidateInfo(disposition) }
      }
      return {
        type: "replay" as const,
        settlement: requirePhysicalSettlement(existingPhysical),
        ...(disposition?.disposition === "candidate_v1" ? { candidate: candidateInfo(disposition) } : {}),
      }
    }

    yield* requireEnvelope(input.envelope)
    const registration = registrationFromEnvelope(input.envelope)
    yield* TurnLifecycle.validateLearningCommandRegistration(tx, registration).pipe(
      Effect.mapError((error) => new IntegrityError({ detail: error.reason })),
    )
    yield* requireSettlementMetadata(input.envelope.timeAdmitted, input.settlement)

    const semanticAddressFingerprint = fingerprint({
      occurrenceID: input.envelope.occurrenceID,
      slot: "future_attention_change_set",
    })
    const existingChangeSet = yield* tx
      .select()
      .from(FutureAttentionChangeSetTable)
      .where(eq(FutureAttentionChangeSetTable.occurrence_id, input.envelope.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (existingChangeSet) {
      const outcome = existingChangeSet.command_fingerprint === commandHash ? "already_applied" : "semantic_conflict"
      yield* admitPhysicalInvocation(tx, {
        envelope: input.envelope,
        fingerprint: physicalFingerprint,
        command: identity,
      })
      yield* tx
        .insert(FutureAttentionDispositionTable)
        .values({
          invocation_part_id: input.envelope.partID,
          disposition: "semantic_terminal_v1",
          command_fingerprint: commandHash,
          canonical_command: command,
          semantic_address_fingerprint: semanticAddressFingerprint,
          semantic_outcome: outcome,
          existing_change_set_id: existingChangeSet.id,
          time_disposed: input.envelope.timeAdmitted,
        })
        .run()
        .pipe(Effect.orDie)
      if (outcome === "already_applied") {
        const settlement = yield* alreadyAppliedSettlement(tx, existingChangeSet, input.settlement)
        yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
        return { type: "settled" as const, settlement }
      }
      const settlement = errorSettlement("semantic_conflict", input.settlement, {
        effectID: existingChangeSet.id,
        occurrenceID: existingChangeSet.occurrence_id,
      })
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }

    const trusted = yield* TurnLifecycle.validateAgentActionRegistration(tx, registration).pipe(
      Effect.mapError((error) => new IntegrityError({ detail: error.reason })),
    )
    const commandCause = yield* currentSource(tx, input.envelope.occurrenceID)
    const agentAction = yield* agentActionProvenance(input.envelope, trusted)
    const materialized = yield* materializeOperations(tx, command, commandCause, agentAction)
    yield* admitPhysicalInvocation(tx, {
      envelope: input.envelope,
      fingerprint: physicalFingerprint,
      command: identity,
    })
    if (!hasWriteMembership(trusted) || !issuerCanPerform(command.operations, agentAction)) {
      const settlement = errorSettlement("permission_rejected", input.settlement)
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
      changeSetID: createChangeSetID(),
      commandFingerprint: commandHash,
      semanticAddressFingerprint,
      agentActionFingerprint: fingerprint({ agentAction, command, materialized }),
      canonicalCommand: command,
      agentAction,
      commandCause,
      operations: materialized,
    } satisfies Candidate
    yield* tx
      .insert(FutureAttentionDispositionTable)
      .values({
        invocation_part_id: input.envelope.partID,
        disposition: "candidate_v1",
        command_fingerprint: commandHash,
        canonical_command: command,
        semantic_address_fingerprint: semanticAddressFingerprint,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        agent_action: candidate.agentAction,
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
        return yield* integrity("FutureAttention capability policy settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    if (yield* readCapabilityIssue(tx, input.partID)) {
      return yield* integrity("A prompted FutureAttention capability cannot become a policy settlement")
    }
    yield* tx
      .insert(FutureAttentionCapabilitySettlementTable)
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
      return yield* integrity("A terminal FutureAttention capability outcome cannot issue a prompt")
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
        return yield* integrity("FutureAttention capability prompt issue conflicts")
      }
      return capabilityIssueInfo(existing)
    }
    yield* tx
      .insert(FutureAttentionCapabilityIssueTable)
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
      return yield* integrity("FutureAttention prompt reply has no exact durable issue")
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
        return yield* integrity("FutureAttention prompt settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    yield* tx
      .insert(FutureAttentionCapabilitySettlementTable)
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
      .insert(FutureAttentionCapabilitySettlementTable)
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
    const raced = yield* tx
      .select()
      .from(FutureAttentionChangeSetTable)
      .where(eq(FutureAttentionChangeSetTable.occurrence_id, invocation.occurrence_id))
      .get()
      .pipe(Effect.orDie)
    if (raced) {
      if (raced.command_fingerprint === candidate.commandFingerprint) {
        const settlement = yield* alreadyAppliedSettlement(tx, raced, input.settlement)
        yield* settlePhysicalInvocation(tx, input.partID, settlement)
        return { type: "settled" as const, settlement }
      }
      const settlement = errorSettlement("semantic_conflict", input.settlement, { effectID: raced.id })
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const capability = yield* readCapabilitySettlement(tx, input.partID)
    if (!capability || capability.agent_action_fingerprint !== candidate.agentActionFingerprint) {
      return yield* integrity("Final FutureAttention settlement has no exact capability outcome")
    }
    if (capability.outcome !== "policy_allow" && capability.outcome !== "prompted_allow") {
      const settlement = errorSettlement(capabilityErrorCode(capability.outcome), input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const envelope = invocationEnvelope(invocation)
    if (!(yield* occurrenceAvailable(tx, envelope))) {
      const settlement = errorSettlement("source_unavailable", input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    yield* revalidateCandidate(tx, candidate)
    const noChange = noChangeSettlement(candidate, envelope.occurrenceID, input.settlement)
    if (noChange) {
      yield* settlePhysicalInvocation(tx, input.partID, noChange)
      return { type: "settled" as const, settlement: noChange }
    }
    const settlement = yield* tx.transaction((domainTx) =>
      applyCandidate(domainTx, envelope, candidate, input.settlement),
    )
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  }).pipe(
    Effect.catchIf(
      (error): error is InvalidCommandError => error instanceof InvalidCommandError,
      (error) => settleDomainFailure(tx, input.partID, futureAttentionErrorSettlement(error, input.settlement)),
    ),
  )
}

export function recover(tx: Transaction, input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const candidate = yield* requireCandidate(tx, input.partID)
    const raced = yield* tx
      .select()
      .from(FutureAttentionChangeSetTable)
      .where(eq(FutureAttentionChangeSetTable.occurrence_id, invocation.occurrence_id))
      .get()
      .pipe(Effect.orDie)
    if (raced?.command_fingerprint === candidate.commandFingerprint) {
      const settlement = yield* alreadyAppliedSettlement(tx, raced, input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    yield* recoverCapability(tx, { partID: input.partID, time: input.settlement.time, order: input.settlement.order })
    const settlement = errorSettlement(raced ? "semantic_conflict" : "interrupted", input.settlement)
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
    const settlement = futureAttentionErrorSettlement(input.error, input.settlement)
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
      return yield* integrity("FutureAttention invocation identity conflicts")
    }
    const disposition = yield* readDisposition(tx, invocation.part_id)
    const state = {
      version: 1 as const,
      status: invocation.status,
      settlement: invocation.settlement,
      timeAdmitted: invocation.time_admitted,
    }
    if (!disposition) {
      if (invocation.status === "admitted" || invocation.status !== "error") {
        return yield* integrity("FutureAttention invocation lost its required disposition")
      }
      return { ...state, disposition: "physical_no_effect" as const } satisfies InvocationVersion
    }
    if (disposition.disposition === "candidate_v1") {
      const capability = yield* readCapabilitySettlement(tx, invocation.part_id)
      const issue = yield* readCapabilityIssue(tx, invocation.part_id)
      return {
        ...state,
        disposition: "candidate_v1" as const,
        candidate: candidateInfo(disposition),
        ...(capability ? { capabilityOutcome: capability.outcome } : {}),
        ...(issue ? { permissionRequestID: issue.permission_request_id } : {}),
      } satisfies InvocationVersion
    }
    if (!disposition.semantic_outcome || !disposition.existing_change_set_id) {
      return yield* integrity("FutureAttention semantic-terminal disposition is incomplete")
    }
    return {
      ...state,
      disposition: "semantic_terminal_v1" as const,
      semanticTerminal: {
        outcome: disposition.semantic_outcome,
        existingChangeSetID: disposition.existing_change_set_id,
      },
    } satisfies InvocationVersion
  })
}

export function finalizeClaimGroup(
  events: EventV2.Interface,
  input: Readonly<{ groupID: ClaimGroupID; completion: CompletionFacts; settlement: SettlementMetadata }>,
) {
  return events
    .transaction((tx) => prepareClaimGroupFinalization(tx, input))
    .pipe(Effect.map((committed) => committed.result))
}

function prepareClaimGroupFinalization(
  tx: Transaction,
  input: Readonly<{ groupID: ClaimGroupID; completion: CompletionFacts; settlement: SettlementMetadata }>,
) {
  return Effect.gen(function* () {
    const existing = yield* readFinalization(tx, input.groupID)
    if (existing) return { result: finalizationInfo(existing) }
    const group = yield* requireClaimGroup(tx, input.groupID)
    const members = yield* readClaimMembers(tx, input.groupID)
    if (members.length === 0) return yield* integrity("FutureAttention claim group has no members")
    const bindingReason = completionBindingReason(group, input.completion)
    const structuralReason = bindingReason ?? (yield* trustedCompletionReason(tx, group, input.completion))
    const validations: readonly Readonly<{
      member: (typeof members)[number]
      reason?: NonNullable<FinalizationMemberResult["reason"]>
    }>[] = structuralReason
      ? members.map((member) => ({ member, reason: structuralReason }))
      : yield* Effect.forEach(members, (member) =>
          validateClaimMember(tx, member, input.completion).pipe(
            Effect.map(() => ({ member, reason: undefined })),
            Effect.catch((error) => Effect.succeed({ member, reason: claimFailureReason(error) } as const)),
          ),
        )
    const failed = validations.find((validation) => validation.reason)
    const receiptID = createFinalizationReceiptID()
    if (failed) {
      const results = validations.map(
        (validation) =>
          ({
            ordinal: validation.member.ordinal,
            concernID: validation.member.concern_id,
            outcome: "not_served",
            reason: validation.reason ?? "binding_mismatch",
          }) satisfies FinalizationMemberResult,
      )
      yield* tx
        .insert(FutureAttentionClaimFinalizationTable)
        .values({
          id: receiptID,
          group_id: group.id,
          outcome: "not_served",
          completion: input.completion,
          member_results: results,
          time_finalized: input.settlement.time,
          finalization_order: input.settlement.order,
        })
        .run()
        .pipe(Effect.orDie)
      const receipt = finalizationInfo((yield* readFinalization(tx, group.id))!)
      return { result: receipt, event: finalizationEvent(group, receipt) }
    }

    const consumed = yield* LearningFrontier.read(tx)
    const frontier = yield* LearningFrontier.advance(tx, { time: input.settlement.time, consumed: [consumed] })
    yield* tx.run("PRAGMA defer_foreign_keys = ON")
    const results = yield* Effect.forEach(validations, (validation) =>
      appendServiceTransition(tx, {
        concernID: validation.member.concern_id,
        expectedVersion: validation.member.expected_version,
        expectedTransitionID: validation.member.expected_transition_id,
        changeSetID: group.change_set_id,
        source: assistantCompletionSource(input.completion),
        rationale: validation.member.rationale,
        learnerResponseWitness: validation.member.learner_response_witness ?? undefined,
        claimGroupID: group.id,
        committed: { time: frontier.time, order: input.settlement.order, frontierSequence: frontier.sequence },
      }).pipe(
        Effect.map(
          (transition) =>
            ({
              ordinal: validation.member.ordinal,
              concernID: validation.member.concern_id,
              outcome: "served",
              transitionID: transition.id,
              serviceReceiptID: transition.serviceReceiptID,
            }) satisfies FinalizationMemberResult,
        ),
      ),
    )
    yield* tx
      .insert(FutureAttentionClaimFinalizationTable)
      .values({
        id: receiptID,
        group_id: group.id,
        outcome: "served",
        completion: input.completion,
        member_results: results,
        time_finalized: frontier.time,
        finalization_order: input.settlement.order,
        frontier_sequence: frontier.sequence,
      })
      .run()
      .pipe(Effect.orDie)
    const receipt = finalizationInfo((yield* readFinalization(tx, group.id))!)
    return { result: receipt, event: finalizationEvent(group, receipt) }
  })
}

function finalizationEvent(group: typeof FutureAttentionClaimGroupTable.$inferSelect, receipt: FinalizationReceipt) {
  return {
    definition: FutureAttentionEvent.Finalized,
    data: {
      sessionID: group.session_id as ClaimGroup["sessionID"],
      turnID: group.turn_id as ClaimGroup["turnID"],
      assistantMessageID: group.assistant_message_id,
      invocationPartID: group.invocation_part_id,
      groupID: group.id,
      receipt,
    },
  } as const
}

export function listPendingClaimGroups(tx: Transaction, input?: Readonly<{ assistantMessageID?: MessageID }>) {
  return Effect.gen(function* () {
    const rows = yield* tx
      .select({ group: FutureAttentionClaimGroupTable })
      .from(FutureAttentionClaimGroupTable)
      .leftJoin(
        FutureAttentionClaimFinalizationTable,
        eq(FutureAttentionClaimFinalizationTable.group_id, FutureAttentionClaimGroupTable.id),
      )
      .where(
        and(
          isNull(FutureAttentionClaimFinalizationTable.group_id),
          input?.assistantMessageID === undefined
            ? undefined
            : eq(FutureAttentionClaimGroupTable.assistant_message_id, input.assistantMessageID),
        ),
      )
      .orderBy(asc(FutureAttentionClaimGroupTable.time_admitted), asc(FutureAttentionClaimGroupTable.id))
      .all()
      .pipe(Effect.orDie)
    return yield* Effect.forEach(rows, (row) => claimGroupInfo(tx, row.group))
  })
}

export function finalizeObservedClaimGroup(
  events: EventV2.Interface,
  input: Readonly<{
    groupID: ClaimGroupID
    observationCut: CompletionFacts["observationCut"]
    time: number
  }>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const group = yield* requireClaimGroup(tx, input.groupID)
        const frontier = yield* LearningFrontier.read(tx)
        const order = yield* EventV2.nextSequence(tx, group.session_id)
        const completion = yield* observeClaimGroupCompletion(tx, {
          groupID: input.groupID,
          completionOrder: order,
          observationCut: input.observationCut,
        })
        if (!completion) return { result: undefined }
        return yield* prepareClaimGroupFinalization(tx, {
          groupID: input.groupID,
          completion,
          settlement: {
            time: Math.max(input.time, frontier.time, completion.timeCompleted),
            order,
          },
        })
      }),
    )
    .pipe(Effect.map((committed) => committed.result))
}

export function observeClaimGroupCompletion(
  tx: Transaction,
  input: Readonly<{
    groupID: ClaimGroupID
    completionOrder: number
    observationCut: CompletionFacts["observationCut"]
  }>,
) {
  return Effect.gen(function* () {
    if (!Number.isSafeInteger(input.completionOrder) || input.completionOrder < 0) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    const group = yield* requireClaimGroup(tx, input.groupID)
    const model = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, group.assistant_message_id))
      .get()
      .pipe(Effect.orDie)
    if (!model) {
      const unavailable = yield* unavailableClaimCompletion(tx, group)
      if (!unavailable) return undefined
      return {
        observationCut: input.observationCut,
        sessionID: group.session_id as ClaimGroup["sessionID"],
        turnID: group.turn_id as ClaimGroup["turnID"],
        occurrenceID: group.occurrence_id,
        assistantMessageID: group.assistant_message_id,
        modelOperationID: group.model_operation_id,
        invocationPartID: group.invocation_part_id,
        modelOutcome: unavailable.modelOutcome,
        localToolPartsTerminal: true,
        presentationCommitted: false,
        presentationUnavailable: true,
        timeCompleted: unavailable.timeCompleted,
        completionOrder: input.completionOrder,
        eligibleOutputBytes: 0,
      } satisfies CompletionFacts
    }
    if (model.state === "running" || model.time_settled === null) return undefined
    const candidates = yield* readLocalToolStates(tx, group.assistant_message_id)
    const localToolPartsTerminal = localToolsTerminal(candidates)
    const presentation = yield* tx
      .select({ message: MessageTable, presentation: TurnModelPresentationTable })
      .from(TurnModelPresentationTable)
      .innerJoin(MessageTable, eq(MessageTable.id, TurnModelPresentationTable.assistant_message_id))
      .where(eq(TurnModelPresentationTable.assistant_message_id, group.assistant_message_id))
      .get()
      .pipe(Effect.orDie)
    const assistant =
      presentation?.message.data.role === "assistant"
        ? (presentation.message.data as Omit<SessionV1.Assistant, "id" | "sessionID">)
        : undefined
    const output = assistant?.time.completed
      ? yield* assistantOutput(tx, group.session_id as ClaimGroup["sessionID"], group.assistant_message_id).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
      : undefined
    const timeCompleted = assistant?.time.completed ?? model.time_settled
    return {
      observationCut: input.observationCut,
      sessionID: group.session_id as ClaimGroup["sessionID"],
      turnID: group.turn_id as ClaimGroup["turnID"],
      occurrenceID: group.occurrence_id,
      assistantMessageID: group.assistant_message_id,
      modelOperationID: group.model_operation_id,
      invocationPartID: group.invocation_part_id,
      modelOutcome: model.state,
      localToolPartsTerminal,
      presentationCommitted: !!assistant?.time.completed && !assistant.error,
      presentationUnavailable: !presentation,
      timeCompleted,
      completionOrder: input.completionOrder,
      ...(output
        ? {
            partManifestFingerprint: output.presentationFingerprint,
            ...(output.bytes > 0 ? { eligibleOutputFingerprint: output.eligibleOutputFingerprint } : {}),
            eligibleOutputBytes: output.bytes,
          }
        : { eligibleOutputBytes: 0 }),
      ...(assistant?.structured === undefined
        ? {}
        : { finalStructuredOutputFingerprint: fingerprint(assistant.structured) }),
    } satisfies CompletionFacts
  })
}

export type ReadOptions = Readonly<{ cursor?: string; limit?: number; byteLimit?: number; now: number }>

export function read(tx: Transaction, query: ReadQuery, options: ReadOptions) {
  return Effect.gen(function* () {
    const limit = options.limit ?? MAX_READ_ITEMS
    const byteLimit = options.byteLimit ?? MAX_READ_BYTES
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_READ_ITEMS ||
      byteLimit < 1 ||
      byteLimit > MAX_READ_BYTES
    ) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    const currentFrontier = yield* LearningFrontier.read(tx)
    const cursor = options.cursor
      ? yield* Effect.try({
          try: () => decodeCursor(options.cursor!, query),
          catch: (error) =>
            error instanceof InvalidCommandError ? error : new InvalidCommandError({ reason: "validation_error" }),
        })
      : undefined
    const cut = cursor?.cut ?? currentFrontier
    const ownerCut = {
      frontierSequence: cut.sequence,
      time: cut.time,
      fingerprint: fingerprint({ frontierSequence: cut.sequence, time: cut.time }),
    }
    if (utf8Bytes(canonicalJson(toJsonValue({ query, ownerCut, items: [] }))) > byteLimit) {
      return yield* new InvalidCommandError({ reason: "capacity_exceeded" })
    }
    if (query.type === "claim_group") {
      const group = yield* requireClaimGroup(tx, query.groupID)
      const item = { group: yield* claimGroupInfo(tx, group), receipt: yield* currentFinalization(tx, group.id) }
      return boundedReadPage(query, [item], 1, ownerCut, limit, byteLimit, undefined)
    }
    if (query.type === "concern") {
      const snapshot = yield* readConcernSnapshot(tx, query.concernID, cut.sequence)
      if (!snapshot) return boundedReadPage(query, [], 0, ownerCut, limit, byteLimit, undefined)
      const view = yield* concernView(tx, snapshot, options.now, ownerCut)
      return boundedReadPage(query, [view], 1, ownerCut, limit, byteLimit, undefined)
    }
    const rows = yield* tx
      .select({ id: FutureAttentionConcernTable.id, timeCreated: FutureAttentionConcernTable.time_created })
      .from(FutureAttentionConcernTable)
      .innerJoin(
        FutureAttentionChangeSetTable,
        eq(FutureAttentionChangeSetTable.id, FutureAttentionConcernTable.create_change_set_id),
      )
      .where(
        and(
          lte(FutureAttentionChangeSetTable.frontier_sequence, cut.sequence),
          query.from === undefined
            ? undefined
            : lte(sql`${query.from}`, FutureAttentionConcernTable.not_before_instant),
          query.through === undefined ? undefined : lte(FutureAttentionConcernTable.not_before_instant, query.through),
        ),
      )
      .orderBy(asc(FutureAttentionConcernTable.time_created), asc(FutureAttentionConcernTable.id))
      .all()
      .pipe(Effect.orDie)
    const views = yield* Effect.forEach(rows, (row) =>
      readConcernSnapshot(tx, row.id, cut.sequence).pipe(
        Effect.flatMap((snapshot) =>
          snapshot ? concernView(tx, snapshot, options.now, ownerCut) : Effect.succeed(undefined),
        ),
      ),
    )
    const filtered = views.filter((view) => {
      if (!view) return false
      if (query.dispositions && !query.dispositions.includes(view.concern.current.disposition)) return false
      if (query.targetStatus && !query.targetStatus.includes(view.targetStatus)) return false
      return true
    }) as ConcernView[]
    const after = cursor?.after
    const selected = after
      ? filtered.filter(
          (view) =>
            view.concern.timeCreated > after.timeCreated ||
            (view.concern.timeCreated === after.timeCreated && view.concern.id > after.id),
        )
      : filtered
    return boundedReadPage(query, selected, filtered.length, ownerCut, limit, byteLimit, cut)
  })
}

export function listEligibleForContext(tx: Transaction, input: Readonly<{ now: number; limit?: number }>) {
  return Effect.gen(function* () {
    const limit = input.limit ?? MAX_OPERATIONS
    if (!Number.isInteger(limit) || limit < 0 || limit > MAX_OPERATIONS) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    const frontier = yield* LearningFrontier.read(tx)
    const rows = yield* tx
      .select({ id: FutureAttentionConcernTable.id })
      .from(FutureAttentionConcernTable)
      .innerJoin(
        FutureAttentionTransitionTable,
        eq(FutureAttentionTransitionTable.id, FutureAttentionConcernTable.current_transition_id),
      )
      .where(
        and(
          eq(FutureAttentionTransitionTable.disposition, "open"),
          lte(FutureAttentionConcernTable.not_before_instant, input.now),
        ),
      )
      .orderBy(
        asc(FutureAttentionConcernTable.not_before_instant),
        asc(FutureAttentionConcernTable.time_created),
        asc(FutureAttentionConcernTable.id),
      )
      .all()
      .pipe(Effect.orDie)
    const ownerCut = {
      frontierSequence: frontier.sequence,
      time: frontier.time,
      fingerprint: fingerprint(frontier),
    }
    const views = yield* Effect.forEach(rows, (row) =>
      readConcernSnapshot(tx, row.id, frontier.sequence).pipe(
        Effect.flatMap((snapshot) =>
          snapshot ? concernView(tx, snapshot, input.now, ownerCut) : Effect.succeed(undefined),
        ),
      ),
    )
    const eligible = views.filter((view) => !!view?.eligible) as ConcernView[]
    return {
      countAtCut: eligible.length,
      entries: eligible.slice(0, limit),
      omittedCount: Math.max(0, eligible.length - limit),
      truncated: eligible.length > limit,
      order: "not_before_then_created_then_id_non_priority",
      ownerCut,
    } satisfies ContextProjection
  })
}

function materializeOperations(
  tx: Transaction,
  command: CanonicalChangeSet,
  commandCause: Source,
  agentAction: AgentAction,
) {
  return Effect.forEach(
    command.operations,
    (operation): Effect.Effect<MaterializedOperation, InvalidCommandError | IntegrityError> => {
      if (operation.type === "create") {
        return Effect.gen(function* () {
          yield* validateTargetSelectionAuthority(operation, agentAction)
          const payload = yield* materializePayload(tx, operation.concern, operation.concern.source, commandCause, true)
          return {
            materializedType: "create" as const,
            operation,
            concernID: createConcernID(),
            payload,
          }
        })
      }
      return Effect.gen(function* () {
        const current = yield* readConcernSnapshot(tx, operation.concernID)
        if (!current || current.current.version !== operation.expectedVersion) {
          return yield* new InvalidCommandError({ reason: "stale" })
        }
        const mutation =
          operation.type === "serve"
            ? undefined
            : yield* bindMutationRelation(tx, operation.mutation, commandCause, current)
        if (operation.type === "replace") {
          yield* validateTargetSelectionAuthority(operation, agentAction, current)
          const sourceIntent =
            operation.successorSource.type === "preserve_predecessor_source"
              ? undefined
              : operation.successorSource.source
          const source = sourceIntent
            ? yield* bindCreationSource(tx, sourceIntent, commandCause)
            : current.payload.source
          const payload = yield* materializePayload(
            tx,
            { ...operation.concern, source: sourceIntent ?? creationIntentFromSource(source) },
            sourceIntent ?? creationIntentFromSource(source),
            commandCause,
            false,
            source,
          )
          const service = successorService(operation.successorDisposition)
          const immediateService =
            service && service.source.type !== "current_assistant_when_complete"
              ? yield* resolveCompleteServiceSource(tx, service.source, commandCause, agentAction)
              : undefined
          return {
            materializedType: "existing",
            operation,
            current,
            mutation,
            successorID: createConcernID(),
            successorPayload: payload,
            ...(immediateService ? { immediateService } : {}),
          } satisfies MaterializedExisting
        }
        if (operation.type === "serve") {
          const immediateService =
            operation.service.source.type === "current_assistant_when_complete"
              ? undefined
              : yield* resolveCompleteServiceSource(tx, operation.service.source, commandCause, agentAction)
          return {
            materializedType: "existing",
            operation,
            current,
            ...(immediateService ? { immediateService } : {}),
          } satisfies MaterializedExisting
        }
        return { materializedType: "existing", operation, current, mutation } satisfies MaterializedExisting
      })
    },
  )
}

function materializePayload(
  tx: Transaction,
  intent: ConcernPayloadIntent,
  sourceIntent: CreationSourceIntent,
  commandCause: Source,
  isCreate: boolean,
  preboundSource?: CreationSource,
) {
  return Effect.gen(function* () {
    yield* Effect.try({
      try: () => {
        requireTextBytes(intent.purpose, 1, MAX_PURPOSE_BYTES)
        requireTextBytes(intent.notBefore.sourceExpression, 1, MAX_TEMPORAL_EXPRESSION_BYTES)
      },
      catch: () => new InvalidCommandError({ reason: "capacity_exceeded" }),
    })
    const source = preboundSource ?? (yield* bindCreationSource(tx, sourceIntent, commandCause))
    const proof = yield* Course.prepareMembershipProof(tx, intent.target).pipe(
      Effect.mapError(() => new InvalidCommandError({ reason: "target_not_current" })),
    )
    const sourceZone = yield* temporalSourceZone(tx, commandCause.occurrenceID)
    const temporal = yield* Effect.try({
      try: () => {
        const zone = resolveZone(intent.notBefore.timeZone as CivilZoneIntent, sourceZone, "FutureAttention")
        const resolved = resolveLocalInstant(intent.notBefore.localDateTime, zone, "FutureAttention")
        validateSourceExpression(
          intent.notBefore.sourceExpression,
          intent.notBefore.localDateTime,
          zone,
          resolved,
          "FutureAttention",
        )
        return { zone, resolved }
      },
      catch: () => new InvalidCommandError({ reason: "validation_error" }),
    })
    const zone = temporal.zone
    const resolved = temporal.resolved
    if (isCreate && resolved.instant <= commandCause.timeAdmitted) {
      return yield* new InvalidCommandError({ reason: "too_early" })
    }
    const payload = {
      purpose: intent.purpose,
      source,
      target: { endpoint: proof.endpoint, selection: proof.selection, receipt: proof.receipt },
      notBefore: {
        instant: resolved.instant,
        sourceExpression: intent.notBefore.sourceExpression,
        utcOffsetMinutes: resolved.utcOffsetMinutes,
        resolvedZone: zone,
      },
      serviceTiming: intent.serviceTiming,
      ...(intent.interactionOrder ? { interactionOrder: intent.interactionOrder } : {}),
    } satisfies ConcernPayload
    if (semanticValueBytes(payload, sourceAvailabilityFromSource(source)) > MAX_SEMANTIC_VALUE_BYTES) {
      return yield* new InvalidCommandError({ reason: "capacity_exceeded" })
    }
    return payload
  }).pipe(
    Effect.catch((error) =>
      error instanceof InvalidCommandError
        ? Effect.fail(error)
        : Effect.fail(new InvalidCommandError({ reason: "validation_error" })),
    ),
  )
}

function validateTargetSelectionAuthority(
  operation: Extract<Operation, { type: "create" | "replace" }>,
  action: AgentAction,
  current?: ConcernSnapshot,
) {
  const next = operation.concern.target
  if (next.selection.type !== "explicit_exact") return Effect.void
  if (operation.type === "create") {
    return action.kind === "root" && operation.concern.source.type === "interpreted_learner_request"
      ? Effect.void
      : Effect.fail(new InvalidCommandError({ reason: "illegal_issuer" }))
  }
  if (
    current?.payload.target.selection.type === "explicit_exact" &&
    isDeepStrictEqual(current.payload.target.endpoint, next.endpoint)
  ) {
    return Effect.void
  }
  if (action.kind !== "root") return Effect.fail(new InvalidCommandError({ reason: "illegal_issuer" }))
  if (operation.mutation.type === "interpreted_learner_direction") return Effect.void
  return operation.successorSource.type === "rebind_current_source" &&
    operation.successorSource.source.type === "interpreted_learner_request"
    ? Effect.void
    : Effect.fail(new InvalidCommandError({ reason: "illegal_issuer" }))
}

function bindCreationSource(tx: Transaction, intent: CreationSourceIntent, commandCause: Source) {
  if (intent.type === "tutor_initiated") {
    return Effect.succeed({ type: "tutor_initiated" as const, source: commandCause })
  }
  return bindExcerpt(tx, intent.excerpt, commandCause).pipe(
    Effect.map((excerpt) => ({ type: "interpreted_learner_request" as const, excerpt })),
  )
}

function bindMutationRelation(
  tx: Transaction,
  intent: MutationRelationIntent,
  commandCause: Source,
  current: ConcernSnapshot,
) {
  if (intent.type === "interpreted_learner_direction") {
    return bindExcerpt(tx, intent.excerpt, commandCause).pipe(
      Effect.map((excerpt) => ({ type: "interpreted_learner_direction" as const, excerpt })),
    )
  }
  requireTextBytes(intent.rationale, 1, MAX_RATIONALE_BYTES)
  if (
    intent.ownerRead.concernID !== current.id ||
    intent.ownerRead.expectedVersion !== current.current.version ||
    intent.ownerRead.headTransitionID !== current.current.id ||
    intent.ownerRead.cutFingerprint !== ownerReferenceFingerprint(current)
  ) {
    return Effect.fail(new InvalidCommandError({ reason: "stale" }))
  }
  return Effect.succeed({ ...intent, ownerRead: { ...intent.ownerRead } } satisfies MutationRelation)
}

function bindExcerpt(tx: Transaction, intent: ExcerptIntent, source: Source) {
  return Effect.gen(function* () {
    if (!Number.isInteger(intent.startByte) || !Number.isInteger(intent.endByte) || intent.startByte < 0) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    requireTextBytes(intent.text, 1, MAX_EXCERPT_BYTES)
    if (intent.endByte - intent.startByte !== utf8Bytes(intent.text)) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    const text = yield* learnerText(tx, source.sessionID, source.messageID)
    const bytes = new TextEncoder().encode(text)
    if (intent.endByte > bytes.byteLength) return yield* new InvalidCommandError({ reason: "source_unavailable" })
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(intent.startByte, intent.endByte))
    if (decoded !== intent.text) return yield* new InvalidCommandError({ reason: "source_unavailable" })
    return {
      ...intent,
      sha256: new Bun.CryptoHasher("sha256").update(intent.text).digest("hex"),
      source,
    } satisfies BoundExcerpt
  }).pipe(
    Effect.catch((error) =>
      error instanceof InvalidCommandError
        ? Effect.fail(error)
        : Effect.fail(new InvalidCommandError({ reason: "source_unavailable" })),
    ),
  )
}

function resolveCompleteServiceSource(
  tx: Transaction,
  intent: Exclude<
    Operation extends never ? never : ServiceAlignmentIntent["source"],
    { type: "current_assistant_when_complete" }
  >,
  commandCause: Source,
  agentAction: AgentAction,
) {
  if (intent.type === "learner_occurrence") {
    return Effect.succeed({
      type: "learner_occurrence" as const,
      source: commandCause,
      timeCompleted: commandCause.timeAdmitted,
      sourceOrder: commandCause.sourceOrder,
    })
  }
  if (intent.type === "assistant_completion") {
    return completeAssistantSource(tx, intent.assistantMessageID, commandCause, agentAction)
  }
  if (intent.type === "tool_result") return completeToolSource(tx, intent.partID, commandCause, agentAction)
  return completeChildSource(tx, intent.parentTaskPartID, commandCause, agentAction)
}

function completeAssistantSource(
  tx: Transaction,
  assistantMessageID: MessageID,
  commandCause: Source,
  action: AgentAction,
) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ model: TurnModelOperationTable, presentation: TurnModelPresentationTable, turn: TurnTable })
      .from(TurnModelOperationTable)
      .innerJoin(
        TurnModelPresentationTable,
        eq(TurnModelPresentationTable.assistant_message_id, TurnModelOperationTable.assistant_message_id),
      )
      .innerJoin(TurnTable, eq(TurnTable.id, TurnModelOperationTable.turn_id))
      .where(eq(TurnModelOperationTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (
      !row ||
      row.model.state !== "completed" ||
      row.model.time_settled === null ||
      row.turn.admission_kind !== "learner" ||
      row.turn.depth !== 0 ||
      row.model.session_id !== action.sessionID ||
      row.model.turn_id !== action.turnID ||
      row.model.causal_occurrence_id !== commandCause.occurrenceID
    ) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    const output = yield* assistantOutput(tx, row.model.session_id, assistantMessageID)
    if (output.bytes === 0) return yield* new InvalidCommandError({ reason: "source_unavailable" })
    return {
      type: "assistant_completion" as const,
      sessionID: row.model.session_id,
      turnID: row.model.turn_id,
      assistantMessageID,
      timeCompleted: output.timeCompleted,
      presentationFingerprint: output.presentationFingerprint,
      eligibleOutputFingerprint: output.eligibleOutputFingerprint,
    } satisfies CompleteServiceSource
  })
}

function completeToolSource(tx: Transaction, partID: PartID, commandCause: Source, action: AgentAction) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ invocation: TurnToolInvocationTable, candidate: TurnToolCandidateTable, part: PartTable })
      .from(TurnToolInvocationTable)
      .innerJoin(TurnToolCandidateTable, eq(TurnToolCandidateTable.part_id, TurnToolInvocationTable.part_id))
      .innerJoin(PartTable, eq(PartTable.id, TurnToolInvocationTable.part_id))
      .where(eq(TurnToolInvocationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    const tool =
      row?.part.data.type === "tool"
        ? (row.part.data as Omit<SessionV1.ToolPart, "id" | "sessionID" | "messageID">)
        : undefined
    if (
      !row ||
      row.invocation.state !== "completed" ||
      row.invocation.time_settled === null ||
      row.invocation.turn_id !== action.turnID ||
      row.invocation.session_id !== action.sessionID ||
      row.candidate.assistant_message_id !== row.invocation.assistant_message_id ||
      row.candidate.tool !== tool?.tool ||
      row.candidate.future_attention_service_source !== "learner_usable" ||
      !tool ||
      tool.state.status !== "completed" ||
      tool.state.output.trim().length === 0
    ) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    return {
      type: "tool_result" as const,
      sessionID: row.invocation.session_id,
      turnID: row.invocation.turn_id,
      assistantMessageID: row.invocation.assistant_message_id,
      partID,
      tool: row.candidate.tool,
      sourceUse: "learner_usable",
      timeCompleted: row.invocation.time_settled,
      resultFingerprint: fingerprint(tool.state.output),
    } satisfies CompleteServiceSource
  })
}

function completeChildSource(tx: Transaction, parentTaskPartID: PartID, commandCause: Source, action: AgentAction) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnChildResultTable)
      .where(eq(TurnChildResultTable.parent_task_part_id, parentTaskPartID))
      .get()
      .pipe(Effect.orDie)
    if (
      !row ||
      row.parent_turn_id !== action.turnID ||
      row.parent_session_id !== action.sessionID ||
      row.terminal_outcome !== "completed" ||
      row.requested_output_state !== "complete" ||
      row.requested_output === null
    ) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    return {
      type: "child_result" as const,
      parentSessionID: row.parent_session_id,
      parentTurnID: row.parent_turn_id,
      parentTaskPartID,
      childTurnID: row.child_turn_id,
      timeCompleted: row.time_settled,
      resultFingerprint: fingerprint(row.requested_output),
    } satisfies CompleteServiceSource
  })
}

function successorService(input: Extract<Operation, { type: "replace" }>["successorDisposition"]) {
  if (input.type === "serve_complete_source") return input.service
  if (input.type === "serve_current_assistant_when_complete") {
    return { ...input.service, source: { type: "current_assistant_when_complete" as const } }
  }
  return undefined
}

function revalidateCandidate(tx: Transaction, candidate: Candidate) {
  return Effect.gen(function* () {
    const cause = yield* currentSource(tx, candidate.commandCause.occurrenceID)
    if (!isDeepStrictEqual(cause, candidate.commandCause)) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    yield* Effect.forEach(candidate.operations, (materialized) =>
      Effect.gen(function* () {
        if (materialized.materializedType === "create") {
          yield* revalidatePayload(tx, materialized.payload)
          return
        }
        const current = yield* readConcernSnapshot(tx, materialized.current.id)
        if (!current || !isDeepStrictEqual(current, materialized.current)) {
          return yield* new InvalidCommandError({ reason: "stale" })
        }
        if (materialized.successorPayload) yield* revalidatePayload(tx, materialized.successorPayload)
        if (materialized.immediateService) {
          const service =
            materialized.operation.type === "serve"
              ? materialized.operation.service
              : materialized.operation.type === "replace"
                ? successorService(materialized.operation.successorDisposition)
                : undefined
          if (!service || service.source.type === "current_assistant_when_complete") {
            return yield* integrity("FutureAttention immediate source lost its service operation")
          }
          const resolved = yield* resolveCompleteServiceSource(
            tx,
            service.source,
            candidate.commandCause,
            candidate.agentAction,
          )
          if (!isDeepStrictEqual(resolved, materialized.immediateService)) {
            return yield* new InvalidCommandError({ reason: "source_unavailable" })
          }
        }
      }),
    )
  })
}

function revalidatePayload(tx: Transaction, payload: ConcernPayload) {
  return Effect.gen(function* () {
    const proof = yield* Course.prepareMembershipProof(tx, {
      endpoint: payload.target.endpoint,
      selection: payload.target.selection,
    }).pipe(Effect.mapError(() => new InvalidCommandError({ reason: "target_not_current" })))
    if (!isDeepStrictEqual(proof.receipt, payload.target.receipt)) {
      return yield* new InvalidCommandError({ reason: "stale" })
    }
    if (payload.source.type === "interpreted_learner_request") {
      const rebound = yield* bindExcerpt(tx, payload.source.excerpt, payload.source.excerpt.source)
      if (!isDeepStrictEqual(rebound, payload.source.excerpt)) {
        return yield* new InvalidCommandError({ reason: "source_unavailable" })
      }
    }
  })
}

function noChangeSettlement(
  candidate: Candidate,
  occurrenceID: InvocationEnvelope["occurrenceID"],
  metadata: SettlementMetadata,
) {
  const changes = candidate.operations.flatMap((materialized) => {
    if (
      materialized.materializedType !== "existing" ||
      materialized.operation.type !== "dismiss" ||
      materialized.current.current.disposition !== "dismissed"
    ) {
      return []
    }
    return [changeProjection("dismiss", "no_effect", materialized.current)]
  })
  if (changes.length !== candidate.operations.length) return undefined
  return {
    outcome: "no_change",
    futureAttentionKind: "change_set",
    schemaVersion: 1,
    occurrenceID,
    changes,
    settlementTime: metadata.time,
    settlementOrder: metadata.order,
  } satisfies NoChangeSettlement
}

function applyCandidate(
  tx: Transaction,
  envelope: InvocationEnvelope,
  candidate: Candidate,
  metadata: SettlementMetadata,
) {
  return Effect.gen(function* () {
    const consumed = yield* LearningFrontier.read(tx)
    const frontier = yield* LearningFrontier.advance(tx, { time: metadata.time, consumed: [consumed] })
    const committed = { time: frontier.time, order: metadata.order, frontierSequence: frontier.sequence }
    yield* tx.run("PRAGMA defer_foreign_keys = ON")
    const receiptID = yield* insertPhysicalReceipt(tx, envelope, { time: frontier.time, order: metadata.order })
    yield* tx
      .insert(FutureAttentionChangeSetTable)
      .values({
        id: candidate.changeSetID,
        occurrence_id: envelope.occurrenceID,
        slot: "future_attention_change_set",
        canonical_command: candidate.canonicalCommand,
        command_fingerprint: candidate.commandFingerprint,
        invocation_part_id: envelope.partID,
        physical_receipt_id: receiptID,
        admission_projection: { state: "preparing" },
        time_committed: frontier.time,
        commit_order: metadata.order,
        frontier_sequence: frontier.sequence,
      })
      .run()
      .pipe(Effect.orDie)

    const claimGroupID = candidate.operations.some(hasPendingClaim) ? createClaimGroupID() : undefined
    const claimMembers: ClaimMember[] = []
    const changes: ChangeProjection[] = []
    for (const materialized of candidate.operations) {
      if (materialized.materializedType === "create") {
        const snapshot = yield* insertConcern(tx, {
          concernID: materialized.concernID,
          payload: materialized.payload,
          changeSetID: candidate.changeSetID,
          committed,
        })
        changes.push(changeProjection("create", "changed", snapshot))
        continue
      }
      const operation = materialized.operation
      if (operation.type === "replace") {
        const superseded = yield* appendTransition(tx, {
          current: materialized.current,
          kind: "superseded",
          disposition: "superseded",
          mutation: materialized.mutation,
          changeSetID: candidate.changeSetID,
          committed,
        })
        const successor = yield* insertConcern(tx, {
          concernID: materialized.successorID!,
          predecessorConcernID: materialized.current.id,
          payload: materialized.successorPayload!,
          changeSetID: candidate.changeSetID,
          committed,
        })
        const settled = yield* settleSuccessor(tx, {
          predecessor: materialized.current,
          successor,
          materialized,
          operation,
          candidate,
          claimGroupID,
          claimOrdinal: claimMembers.length,
          changeSetID: candidate.changeSetID,
          committed,
        })
        if (settled.claim) claimMembers.push(settled.claim)
        changes.push({
          operation: "replace",
          outcome: "changed",
          concernID: superseded.concernID,
          version: superseded.version,
          disposition: "superseded",
          transitionID: superseded.id,
          successorConcernID: settled.snapshot.id,
          successorVersion: settled.snapshot.current.version,
          successorDisposition: settled.snapshot.current.disposition as Exclude<Disposition, "superseded">,
          successorTransitionID: settled.snapshot.current.id,
        } satisfies ChangeProjection)
        continue
      }
      if (operation.type === "serve") {
        if (operation.service.source.type === "current_assistant_when_complete") {
          if (!claimGroupID) return yield* integrity("FutureAttention pending service has no claim group")
          yield* validateClaimAdmission(tx, materialized.current, operation.service, candidate.agentAction)
          claimMembers.push({
            ordinal: claimMembers.length,
            concernID: materialized.current.id,
            expectedVersion: materialized.current.current.version,
            expectedTransitionID: materialized.current.current.id,
            rationale: operation.service.rationale,
            ...(operation.service.learnerResponseWitness
              ? { learnerResponseWitness: operation.service.learnerResponseWitness }
              : {}),
          })
          changes.push(changeProjection("serve", "changed", materialized.current))
          continue
        }
        yield* validateImmediateService(
          tx,
          materialized.current,
          materialized.immediateService!,
          operation.service,
          materialized.current.current.timeCommitted,
        )
        const transition = yield* appendServiceTransition(tx, {
          concernID: materialized.current.id,
          expectedVersion: materialized.current.current.version,
          expectedTransitionID: materialized.current.current.id,
          changeSetID: candidate.changeSetID,
          source: materialized.immediateService!,
          rationale: operation.service.rationale,
          learnerResponseWitness: operation.service.learnerResponseWitness,
          committed,
        })
        changes.push(changeProjection("serve", "changed", { ...materialized.current, current: transition }))
        continue
      }
      if (operation.type === "dismiss") {
        if (materialized.current.current.disposition === "dismissed") {
          changes.push(changeProjection("dismiss", "no_effect", materialized.current))
          continue
        }
        if (
          materialized.current.current.disposition !== "open" &&
          materialized.current.current.disposition !== "served"
        ) {
          return yield* new InvalidCommandError({ reason: "stale" })
        }
        const transition = yield* appendTransition(tx, {
          current: materialized.current,
          kind: "dismissed",
          disposition: "dismissed",
          mutation: materialized.mutation,
          changeSetID: candidate.changeSetID,
          committed,
        })
        changes.push(changeProjection("dismiss", "changed", { ...materialized.current, current: transition }))
        continue
      }
      if (
        materialized.current.current.disposition !== "served" &&
        materialized.current.current.disposition !== "dismissed"
      ) {
        return yield* new InvalidCommandError({ reason: "stale" })
      }
      const transition = yield* appendTransition(tx, {
        current: materialized.current,
        kind: "reopened",
        disposition: "open",
        mutation: materialized.mutation,
        changeSetID: candidate.changeSetID,
        committed,
      })
      changes.push(changeProjection("reopen", "changed", { ...materialized.current, current: transition }))
    }

    const claim = claimGroupID
      ? yield* insertClaimGroup(tx, {
          groupID: claimGroupID,
          candidate,
          envelope,
          receiptID,
          members: claimMembers,
          timeAdmitted: frontier.time,
        })
      : undefined
    if (claimGroupID && claimMembers.length === 0) {
      return yield* integrity("FutureAttention admitted an empty pending claim group")
    }
    const admissionProjection = {
      changes,
      ...(claim
        ? {
            claim: {
              groupID: claim.id,
              claimState: "pending",
              claimStateAtAdmission: "pending",
            },
          }
        : {}),
    }
    yield* tx
      .update(FutureAttentionChangeSetTable)
      .set({ admission_projection: admissionProjection })
      .where(eq(FutureAttentionChangeSetTable.id, candidate.changeSetID))
      .run()
      .pipe(Effect.orDie)
    const base = {
      futureAttentionKind: "change_set" as const,
      schemaVersion: 1 as const,
      receiptID,
      effectID: candidate.changeSetID,
      occurrenceID: envelope.occurrenceID,
      changes,
      settlementTime: frontier.time,
      settlementOrder: metadata.order,
    }
    if (changes.every((change) => change.outcome === "no_effect") && !claim) {
      return yield* integrity("FutureAttention applied an all-no-effect candidate")
    }
    return {
      ...base,
      outcome: "applied" as const,
      ...(claim
        ? {
            claim: {
              groupID: claim.id,
              claimState: "pending" as const,
              claimStateAtAdmission: "pending" as const,
            },
          }
        : {}),
    } satisfies AppliedSettlement
  })
}

function settleSuccessor(
  tx: Transaction,
  input: Readonly<{
    predecessor: ConcernSnapshot
    successor: ConcernSnapshot
    materialized: MaterializedExisting
    operation: Extract<Operation, { type: "replace" }>
    candidate: Candidate
    claimGroupID?: ClaimGroupID
    claimOrdinal: number
    changeSetID: ChangeSetID
    committed: Readonly<{ time: number; order: number; frontierSequence: number }>
  }>,
) {
  return Effect.gen(function* () {
    const disposition = input.operation.successorDisposition
    if (disposition.type === "open") return { snapshot: input.successor }
    if (disposition.type === "dismissed_by_mutation") {
      requireTextBytes(disposition.rationale, 1, MAX_RATIONALE_BYTES)
      const transition = yield* appendTransition(tx, {
        current: input.successor,
        kind: "dismissed",
        disposition: "dismissed",
        mutation: input.materialized.mutation,
        rationale: disposition.rationale,
        changeSetID: input.changeSetID,
        committed: input.committed,
      })
      return { snapshot: { ...input.successor, current: transition } }
    }
    if (disposition.type === "carry_dismissed") {
      if (input.predecessor.current.disposition !== "dismissed") {
        return yield* new InvalidCommandError({ reason: "stale" })
      }
      requireTextBytes(disposition.rationale, 1, MAX_RATIONALE_BYTES)
      const transition = yield* appendTransition(tx, {
        current: input.successor,
        kind: "dismissed_by_correction",
        disposition: "dismissed",
        mutation: input.materialized.mutation,
        rationale: disposition.rationale,
        changeSetID: input.changeSetID,
        committed: input.committed,
      })
      return { snapshot: { ...input.successor, current: transition } }
    }
    if (disposition.type === "carry_served") {
      if (input.predecessor.current.disposition !== "served" || !input.predecessor.current.serviceReceiptID) {
        return yield* new InvalidCommandError({ reason: "stale" })
      }
      requireTextBytes(disposition.rationale, 1, MAX_RATIONALE_BYTES)
      const prior = yield* requireServiceReceipt(tx, input.predecessor.current.serviceReceiptID)
      const sourceAvailability = yield* currentCompleteSourceAvailability(tx, prior.source)
      if (
        sourceAvailability.state === "source_unavailable" &&
        sourceAvailability.reason === "presentation_unavailable"
      ) {
        return yield* new InvalidCommandError({ reason: "source_unavailable" })
      }
      yield* requireTargetCurrent(tx, input.successor)
      const transition = yield* appendServiceTransition(tx, {
        concernID: input.successor.id,
        expectedVersion: input.successor.current.version,
        expectedTransitionID: input.successor.current.id,
        kind: "served_by_correction",
        changeSetID: input.changeSetID,
        source: prior.source,
        rationale: disposition.rationale,
        learnerResponseWitness: prior.learner_response_witness ?? undefined,
        carriedFromServiceReceiptID: prior.id,
        committed: input.committed,
      })
      return { snapshot: { ...input.successor, current: transition } }
    }
    if (disposition.type === "serve_complete_source") {
      yield* validateImmediateService(
        tx,
        input.successor,
        input.materialized.immediateService!,
        disposition.service,
        input.predecessor.current.timeCommitted,
      )
      const transition = yield* appendServiceTransition(tx, {
        concernID: input.successor.id,
        expectedVersion: input.successor.current.version,
        expectedTransitionID: input.successor.current.id,
        changeSetID: input.changeSetID,
        source: input.materialized.immediateService!,
        rationale: disposition.service.rationale,
        learnerResponseWitness: disposition.service.learnerResponseWitness,
        committed: input.committed,
      })
      return { snapshot: { ...input.successor, current: transition } }
    }
    if (!input.claimGroupID) return yield* integrity("Successor pending claim has no group")
    yield* validateClaimAdmission(tx, input.successor, disposition.service, input.candidate.agentAction)
    return {
      snapshot: input.successor,
      claim: {
        ordinal: input.claimOrdinal,
        concernID: input.successor.id,
        expectedVersion: input.successor.current.version,
        expectedTransitionID: input.successor.current.id,
        rationale: disposition.service.rationale,
        ...(disposition.service.learnerResponseWitness
          ? { learnerResponseWitness: disposition.service.learnerResponseWitness }
          : {}),
      } satisfies ClaimMember,
    }
  })
}

function insertConcern(
  tx: Transaction,
  input: Readonly<{
    concernID: ConcernID
    predecessorConcernID?: ConcernID
    payload: ConcernPayload
    changeSetID: ChangeSetID
    committed: Readonly<{ time: number; order: number; frontierSequence: number }>
  }>,
) {
  return Effect.gen(function* () {
    const transitionID = createTransitionID()
    const semanticValue = semanticValueFor(input.payload, sourceAvailabilityFromSource(input.payload.source))
    const semanticBytes = utf8Bytes(canonicalJson(semanticValue))
    if (semanticBytes > MAX_SEMANTIC_VALUE_BYTES) {
      return yield* new InvalidCommandError({ reason: "capacity_exceeded" })
    }
    yield* tx
      .insert(FutureAttentionConcernTable)
      .values({
        id: input.concernID,
        predecessor_concern_id: input.predecessorConcernID,
        create_change_set_id: input.changeSetID,
        purpose: input.payload.purpose,
        source_relation: input.payload.source.type,
        source: input.payload.source,
        course_id: input.payload.target.endpoint.courseID,
        view_id: input.payload.target.endpoint.viewID,
        course_revision_id: input.payload.target.endpoint.revisionID,
        course_item_id: input.payload.target.endpoint.itemID,
        selection: input.payload.target.selection,
        membership_receipt: input.payload.target.receipt,
        not_before_instant: input.payload.notBefore.instant,
        temporal_source_expression: input.payload.notBefore.sourceExpression,
        effective_utc_offset_minutes: input.payload.notBefore.utcOffsetMinutes,
        resolved_zone: input.payload.notBefore.resolvedZone,
        service_timing: input.payload.serviceTiming,
        interaction_order: input.payload.interactionOrder,
        semantic_value: semanticValue,
        semantic_bytes: semanticBytes,
        current_transition_id: transitionID,
        current_version: 0,
        time_created: input.committed.time,
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(FutureAttentionTransitionTable)
      .values({
        id: transitionID,
        concern_id: input.concernID,
        version: 0,
        kind: "created",
        disposition: "open",
        change_set_id: input.changeSetID,
        time_committed: input.committed.time,
        commit_order: input.committed.order,
        frontier_sequence: input.committed.frontierSequence,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      id: input.concernID,
      ...(input.predecessorConcernID ? { predecessorConcernID: input.predecessorConcernID } : {}),
      payload: input.payload,
      current: {
        id: transitionID,
        concernID: input.concernID,
        version: 0,
        kind: "created",
        disposition: "open",
        changeSetID: input.changeSetID,
        timeCommitted: input.committed.time,
        commitOrder: input.committed.order,
        frontierSequence: input.committed.frontierSequence,
      },
      timeCreated: input.committed.time,
      createChangeSetID: input.changeSetID,
    } satisfies ConcernSnapshot
  })
}

function appendTransition(
  tx: Transaction,
  input: Readonly<{
    current: ConcernSnapshot
    kind: Transition["kind"]
    disposition: Disposition
    mutation?: MutationRelation
    rationale?: string
    changeSetID: ChangeSetID
    committed: Readonly<{ time: number; order: number; frontierSequence: number }>
  }>,
) {
  return Effect.gen(function* () {
    const transition = {
      id: createTransitionID(),
      concernID: input.current.id,
      version: input.current.current.version + 1,
      predecessorID: input.current.current.id,
      kind: input.kind,
      disposition: input.disposition,
      ...(input.mutation ? { mutation: input.mutation } : {}),
      ...(input.rationale ? { rationale: input.rationale } : {}),
      changeSetID: input.changeSetID,
      timeCommitted: input.committed.time,
      commitOrder: input.committed.order,
      frontierSequence: input.committed.frontierSequence,
    } satisfies Transition
    yield* tx
      .insert(FutureAttentionTransitionTable)
      .values({
        id: transition.id,
        concern_id: transition.concernID,
        version: transition.version,
        predecessor_transition_id: transition.predecessorID,
        kind: transition.kind,
        disposition: transition.disposition,
        mutation: transition.mutation,
        rationale: transition.rationale,
        change_set_id: transition.changeSetID,
        time_committed: transition.timeCommitted,
        commit_order: transition.commitOrder,
        frontier_sequence: transition.frontierSequence,
      })
      .run()
      .pipe(Effect.orDie)
    yield* updateConcernHead(tx, input.current, transition)
    return transition
  })
}

function appendServiceTransition(
  tx: Transaction,
  input: Readonly<{
    concernID: ConcernID
    expectedVersion: number
    expectedTransitionID: TransitionID
    kind?: "served" | "served_by_correction"
    changeSetID: ChangeSetID
    source: CompleteServiceSource
    rationale: string
    learnerResponseWitness?: ClaimMember["learnerResponseWitness"]
    carriedFromServiceReceiptID?: ServiceReceiptID
    claimGroupID?: ClaimGroupID
    committed: Readonly<{ time: number; order: number; frontierSequence: number }>
  }>,
) {
  return Effect.gen(function* () {
    requireTextBytes(input.rationale, 1, MAX_RATIONALE_BYTES)
    const current = yield* readConcernSnapshot(tx, input.concernID)
    if (
      !current ||
      current.current.version !== input.expectedVersion ||
      current.current.id !== input.expectedTransitionID ||
      current.current.disposition !== "open"
    ) {
      return yield* new InvalidCommandError({ reason: "stale" })
    }
    const serviceReceiptID = createServiceReceiptID()
    const transition = {
      id: createTransitionID(),
      concernID: input.concernID,
      version: current.current.version + 1,
      predecessorID: current.current.id,
      kind: input.kind ?? "served",
      disposition: "served",
      rationale: input.rationale,
      serviceReceiptID,
      changeSetID: input.changeSetID,
      timeCommitted: input.committed.time,
      commitOrder: input.committed.order,
      frontierSequence: input.committed.frontierSequence,
    } satisfies Transition
    yield* tx
      .insert(FutureAttentionServiceReceiptTable)
      .values({
        id: serviceReceiptID,
        transition_id: transition.id,
        source: input.source,
        rationale: input.rationale,
        learner_response_witness: input.learnerResponseWitness,
        carried_from_service_receipt_id: input.carriedFromServiceReceiptID,
        claim_group_id: input.claimGroupID,
        time_recorded: input.committed.time,
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(FutureAttentionTransitionTable)
      .values({
        id: transition.id,
        concern_id: transition.concernID,
        version: transition.version,
        predecessor_transition_id: transition.predecessorID,
        kind: transition.kind,
        disposition: transition.disposition,
        rationale: transition.rationale,
        service_receipt_id: serviceReceiptID,
        change_set_id: transition.changeSetID,
        time_committed: transition.timeCommitted,
        commit_order: transition.commitOrder,
        frontier_sequence: transition.frontierSequence,
      })
      .run()
      .pipe(Effect.orDie)
    yield* updateConcernHead(tx, current, transition)
    return transition
  })
}

function updateConcernHead(tx: Transaction, current: ConcernSnapshot, transition: Transition) {
  return Effect.gen(function* () {
    const updated = yield* tx
      .update(FutureAttentionConcernTable)
      .set({ current_transition_id: transition.id, current_version: transition.version })
      .where(
        and(
          eq(FutureAttentionConcernTable.id, current.id),
          eq(FutureAttentionConcernTable.current_transition_id, current.current.id),
          eq(FutureAttentionConcernTable.current_version, current.current.version),
        ),
      )
      .returning({ id: FutureAttentionConcernTable.id })
      .get()
      .pipe(Effect.orDie)
    if (!updated) return yield* new InvalidCommandError({ reason: "stale" })
  })
}

function insertClaimGroup(
  tx: Transaction,
  input: Readonly<{
    groupID: ClaimGroupID
    candidate: Candidate
    envelope: InvocationEnvelope
    receiptID: AppliedSettlement["receiptID"]
    members: readonly ClaimMember[]
    timeAdmitted: number
  }>,
) {
  return Effect.gen(function* () {
    yield* tx
      .insert(FutureAttentionClaimGroupTable)
      .values({
        id: input.groupID,
        change_set_id: input.candidate.changeSetID,
        physical_receipt_id: input.receiptID,
        invocation_part_id: input.envelope.partID,
        session_id: input.envelope.sessionID,
        turn_id: input.envelope.turnID,
        occurrence_id: input.envelope.occurrenceID,
        assistant_message_id: input.envelope.assistantMessageID,
        model_operation_id: input.envelope.assistantMessageID,
        time_admitted: input.timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      input.members,
      (member) =>
        tx
          .insert(FutureAttentionClaimMemberTable)
          .values({
            group_id: input.groupID,
            ordinal: member.ordinal,
            concern_id: member.concernID,
            expected_version: member.expectedVersion,
            expected_transition_id: member.expectedTransitionID,
            rationale: member.rationale,
            learner_response_witness: member.learnerResponseWitness,
          })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    return yield* claimGroupInfo(
      tx,
      (yield* tx
        .select()
        .from(FutureAttentionClaimGroupTable)
        .where(eq(FutureAttentionClaimGroupTable.id, input.groupID))
        .get()
        .pipe(Effect.orDie))!,
    )
  })
}

function validateClaimAdmission(
  tx: Transaction,
  concern: ConcernSnapshot,
  service: Omit<ServiceAlignmentIntent, "source">,
  action: AgentAction,
) {
  return Effect.gen(function* () {
    requireTextBytes(service.rationale, 1, MAX_RATIONALE_BYTES)
    if (concern.current.disposition !== "open") return yield* new InvalidCommandError({ reason: "stale" })
    yield* requireTargetCurrent(tx, concern)
    const cut = yield* rootModelCut(tx, {
      sessionID: action.sessionID,
      turnID: action.turnID,
      assistantMessageID: action.assistantMessageID,
      occurrenceID: action.occurrenceID,
    })
    yield* validateLearnerWitness(tx, concern, service.learnerResponseWitness, undefined, cut)
  })
}

function validateImmediateService(
  tx: Transaction,
  concern: ConcernSnapshot,
  source: CompleteServiceSource,
  service: ServiceAlignmentIntent,
  completesAfter: number,
) {
  return Effect.gen(function* () {
    requireTextBytes(service.rationale, 1, MAX_RATIONALE_BYTES)
    if (concern.current.disposition !== "open") return yield* new InvalidCommandError({ reason: "stale" })
    yield* requireTargetCurrent(tx, concern)
    if (source.timeCompleted <= completesAfter) return yield* new InvalidCommandError({ reason: "too_early" })
    if (
      concern.payload.serviceTiming === "at_or_after_not_before" &&
      source.timeCompleted < concern.payload.notBefore.instant
    ) {
      return yield* new InvalidCommandError({ reason: "too_early" })
    }
    yield* validateLearnerWitness(tx, concern, service.learnerResponseWitness, source)
  })
}

function validateLearnerWitness(
  tx: Transaction,
  concern: ConcernSnapshot,
  witness: ServiceAlignmentIntent["learnerResponseWitness"],
  source: CompleteServiceSource | undefined,
  pendingCut?: RootModelCut,
) {
  if (!concern.payload.interactionOrder) {
    if (witness) return Effect.fail(new InvalidCommandError({ reason: "validation_error" }))
    return Effect.void
  }
  if (!witness) return Effect.fail(new InvalidCommandError({ reason: "validation_error" }))
  return Effect.gen(function* () {
    if (source?.type === "learner_occurrence" && witness.occurrenceID !== source.source.occurrenceID) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    const learner = yield* currentSource(tx, witness.occurrenceID)
    const sourceOrder = source?.type === "learner_occurrence" ? source.sourceOrder : undefined
    const cut = pendingCut ?? (source && source.type !== "learner_occurrence" ? yield* completeSourceRootCut(tx, source) : undefined)
    if (
      learner.timeAdmitted <= concern.current.timeCommitted ||
      (source && learner.timeAdmitted > source.timeCompleted) ||
      (sourceOrder !== undefined && learner.sourceOrder > sourceOrder) ||
      (cut &&
        (learner.sessionID !== cut.sessionID ||
          learner.turnID !== cut.turnID ||
          learner.occurrenceID !== cut.occurrenceID ||
          learner.timeAdmitted > cut.timeAdmitted))
    ) {
      return yield* new InvalidCommandError({ reason: "too_early" })
    }
  })
}

type RootModelCut = Readonly<{
  sessionID: ClaimGroup["sessionID"]
  turnID: ClaimGroup["turnID"]
  assistantMessageID: MessageID
  occurrenceID: ClaimGroup["occurrenceID"]
  timeAdmitted: number
}>

function completeSourceRootCut(tx: Transaction, source: Exclude<CompleteServiceSource, { type: "learner_occurrence" }>) {
  if (source.type === "assistant_completion" || source.type === "tool_result") {
    return rootModelCut(tx, {
      sessionID: source.sessionID,
      turnID: source.turnID,
      assistantMessageID: source.assistantMessageID,
    })
  }
  return Effect.gen(function* () {
    const candidate = yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.part_id, source.parentTaskPartID))
      .get()
      .pipe(Effect.orDie)
    if (
      !candidate ||
      candidate.session_id !== source.parentSessionID ||
      candidate.turn_id !== source.parentTurnID ||
      candidate.tool !== "task"
    ) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    return yield* rootModelCut(tx, {
      sessionID: source.parentSessionID,
      turnID: source.parentTurnID,
      assistantMessageID: candidate.assistant_message_id,
    })
  })
}

function rootModelCut(
  tx: Transaction,
  input: Readonly<{
    sessionID: ClaimGroup["sessionID"]
    turnID: ClaimGroup["turnID"]
    assistantMessageID: MessageID
    occurrenceID?: ClaimGroup["occurrenceID"]
  }>,
) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ model: TurnModelOperationTable, turn: TurnTable })
      .from(TurnModelOperationTable)
      .innerJoin(TurnTable, eq(TurnTable.id, TurnModelOperationTable.turn_id))
      .where(eq(TurnModelOperationTable.assistant_message_id, input.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (
      !row ||
      row.turn.admission_kind !== "learner" ||
      row.turn.depth !== 0 ||
      row.model.session_id !== input.sessionID ||
      row.model.turn_id !== input.turnID ||
      !row.model.causal_occurrence_id ||
      (input.occurrenceID && row.model.causal_occurrence_id !== input.occurrenceID)
    ) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    return {
      sessionID: row.model.session_id,
      turnID: row.model.turn_id,
      assistantMessageID: row.model.assistant_message_id,
      occurrenceID: row.model.causal_occurrence_id,
      timeAdmitted: row.model.time_admitted,
    } satisfies RootModelCut
  })
}

function requireTargetCurrent(tx: Transaction, concern: ConcernSnapshot) {
  return Course.inspectMembershipStatus(tx, concern.payload.target.endpoint, concern.payload.target.selection).pipe(
    Effect.flatMap((status) =>
      status.status === "eligible"
        ? Effect.void
        : Effect.fail(new InvalidCommandError({ reason: "target_not_current" })),
    ),
  )
}

function hasPendingClaim(materialized: MaterializedOperation) {
  if (materialized.materializedType === "create") return false
  if (materialized.operation.type === "serve") {
    return materialized.operation.service.source.type === "current_assistant_when_complete"
  }
  return (
    materialized.operation.type === "replace" &&
    materialized.operation.successorDisposition.type === "serve_current_assistant_when_complete"
  )
}

function changeProjection(
  operation: Exclude<Operation["type"], "replace">,
  outcome: ChangeProjection["outcome"],
  snapshot: ConcernSnapshot,
): ChangeProjection {
  return {
    operation,
    outcome,
    concernID: snapshot.id,
    version: snapshot.current.version,
    disposition: snapshot.current.disposition,
    transitionID: snapshot.current.id,
  }
}

function readConcernSnapshot(tx: Transaction, concernID: ConcernID, frontierSequence?: number) {
  return Effect.gen(function* () {
    const concern = yield* tx
      .select()
      .from(FutureAttentionConcernTable)
      .where(eq(FutureAttentionConcernTable.id, concernID))
      .get()
      .pipe(Effect.orDie)
    if (!concern) return undefined
    const transition = yield* tx
      .select()
      .from(FutureAttentionTransitionTable)
      .where(
        and(
          eq(FutureAttentionTransitionTable.concern_id, concernID),
          frontierSequence === undefined
            ? eq(FutureAttentionTransitionTable.id, concern.current_transition_id)
            : lte(FutureAttentionTransitionTable.frontier_sequence, frontierSequence),
        ),
      )
      .orderBy(sql`${FutureAttentionTransitionTable.version} DESC`)
      .get()
      .pipe(Effect.orDie)
    if (!transition) return undefined
    const successor = yield* tx
      .select({ id: FutureAttentionConcernTable.id, changeSetID: FutureAttentionConcernTable.create_change_set_id })
      .from(FutureAttentionConcernTable)
      .innerJoin(
        FutureAttentionChangeSetTable,
        eq(FutureAttentionChangeSetTable.id, FutureAttentionConcernTable.create_change_set_id),
      )
      .where(
        and(
          eq(FutureAttentionConcernTable.predecessor_concern_id, concernID),
          frontierSequence === undefined
            ? undefined
            : lte(FutureAttentionChangeSetTable.frontier_sequence, frontierSequence),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    const payload = concernPayload(concern)
    return {
      id: concern.id,
      ...(concern.predecessor_concern_id ? { predecessorConcernID: concern.predecessor_concern_id } : {}),
      ...(successor ? { successorConcernID: successor.id } : {}),
      payload,
      current: transitionInfo(transition),
      timeCreated: concern.time_created,
      createChangeSetID: concern.create_change_set_id,
    } satisfies ConcernSnapshot
  })
}

function concernPayload(row: typeof FutureAttentionConcernTable.$inferSelect): ConcernPayload {
  return {
    purpose: row.purpose,
    source: row.source,
    target: {
      endpoint: {
        courseID: row.course_id as Course.CourseID,
        viewID: row.view_id as Course.ViewID,
        revisionID: row.course_revision_id as Course.RevisionID,
        itemID: row.course_item_id as Course.ItemID,
      },
      selection: row.selection,
      receipt: row.membership_receipt,
    },
    notBefore: {
      instant: row.not_before_instant,
      sourceExpression: row.temporal_source_expression,
      utcOffsetMinutes: row.effective_utc_offset_minutes,
      resolvedZone: row.resolved_zone,
    },
    serviceTiming: row.service_timing,
    ...(row.interaction_order ? { interactionOrder: row.interaction_order } : {}),
  }
}

function transitionInfo(row: typeof FutureAttentionTransitionTable.$inferSelect): Transition {
  return {
    id: row.id,
    concernID: row.concern_id,
    version: row.version,
    ...(row.predecessor_transition_id ? { predecessorID: row.predecessor_transition_id } : {}),
    kind: row.kind,
    disposition: row.disposition,
    ...(row.mutation ? { mutation: row.mutation } : {}),
    ...(row.rationale ? { rationale: row.rationale } : {}),
    ...(row.service_receipt_id ? { serviceReceiptID: row.service_receipt_id } : {}),
    changeSetID: row.change_set_id,
    timeCommitted: row.time_committed,
    commitOrder: row.commit_order,
    frontierSequence: row.frontier_sequence,
  }
}

function requireServiceReceipt(tx: Transaction, id: ServiceReceiptID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(FutureAttentionServiceReceiptTable)
      .where(eq(FutureAttentionServiceReceiptTable.id, id))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* integrity(`FutureAttention service receipt ${id} is missing`)
    return row
  })
}

function requireClaimGroup(tx: Transaction, id: ClaimGroupID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(FutureAttentionClaimGroupTable)
      .where(eq(FutureAttentionClaimGroupTable.id, id))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* new InvalidCommandError({ reason: "source_unavailable" })
    return row
  })
}

function readClaimMembers(tx: Transaction, groupID: ClaimGroupID) {
  return tx
    .select()
    .from(FutureAttentionClaimMemberTable)
    .where(eq(FutureAttentionClaimMemberTable.group_id, groupID))
    .orderBy(asc(FutureAttentionClaimMemberTable.ordinal))
    .all()
    .pipe(Effect.orDie)
}

function claimGroupInfo(tx: Transaction, row: typeof FutureAttentionClaimGroupTable.$inferSelect) {
  return Effect.gen(function* () {
    const members = yield* readClaimMembers(tx, row.id)
    return {
      id: row.id,
      changeSetID: row.change_set_id,
      physicalReceiptID: row.physical_receipt_id,
      invocationPartID: row.invocation_part_id,
      sessionID: row.session_id as ClaimGroup["sessionID"],
      turnID: row.turn_id as ClaimGroup["turnID"],
      occurrenceID: row.occurrence_id,
      assistantMessageID: row.assistant_message_id,
      modelOperationID: row.model_operation_id,
      members: members.map((member) => ({
        ordinal: member.ordinal,
        concernID: member.concern_id,
        expectedVersion: member.expected_version,
        expectedTransitionID: member.expected_transition_id,
        rationale: member.rationale,
        ...(member.learner_response_witness ? { learnerResponseWitness: member.learner_response_witness } : {}),
      })),
      timeAdmitted: row.time_admitted,
    } satisfies ClaimGroup
  })
}

function readFinalization(tx: Transaction, groupID: ClaimGroupID) {
  return tx
    .select()
    .from(FutureAttentionClaimFinalizationTable)
    .where(eq(FutureAttentionClaimFinalizationTable.group_id, groupID))
    .get()
    .pipe(Effect.orDie)
}

function currentFinalization(tx: Transaction, groupID: ClaimGroupID) {
  return readFinalization(tx, groupID).pipe(Effect.map((row) => (row ? finalizationInfo(row) : undefined)))
}

function finalizationInfo(row: typeof FutureAttentionClaimFinalizationTable.$inferSelect): FinalizationReceipt {
  return {
    id: row.id,
    groupID: row.group_id,
    outcome: row.outcome,
    completion: row.completion,
    members: row.member_results,
    timeFinalized: row.time_finalized,
    finalizationOrder: row.finalization_order,
    ...(row.frontier_sequence === null ? {} : { frontierSequence: row.frontier_sequence }),
  }
}

function completionBindingReason(
  group: typeof FutureAttentionClaimGroupTable.$inferSelect,
  completion: CompletionFacts,
): FinalizationMemberResult["reason"] | undefined {
  if (
    completion.sessionID !== group.session_id ||
    completion.turnID !== group.turn_id ||
    completion.occurrenceID !== group.occurrence_id ||
    completion.assistantMessageID !== group.assistant_message_id ||
    completion.modelOperationID !== group.model_operation_id ||
    completion.invocationPartID !== group.invocation_part_id
  ) {
    return "binding_mismatch"
  }
}

function completionStructuralReason(completion: CompletionFacts): FinalizationMemberResult["reason"] | undefined {
  if (completion.modelOutcome !== "completed") return "model_not_completed"
  if (!completion.localToolPartsTerminal) return "tool_parts_incomplete"
  if (completion.presentationUnavailable) return "presentation_unavailable"
  if (!completion.presentationCommitted) return "presentation_uncommitted"
  if (
    completion.eligibleOutputBytes <= 0 ||
    !completion.eligibleOutputFingerprint ||
    !completion.partManifestFingerprint
  ) {
    return "no_eligible_output"
  }
}

function trustedCompletionReason(
  tx: Transaction,
  group: typeof FutureAttentionClaimGroupTable.$inferSelect,
  completion: CompletionFacts,
) {
  return Effect.gen(function* () {
    const model = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, group.assistant_message_id))
      .get()
      .pipe(Effect.orDie)
    if (!model) {
      const unavailable = yield* unavailableClaimCompletion(tx, group)
      if (
        !unavailable ||
        unavailable.modelOutcome !== completion.modelOutcome ||
        unavailable.timeCompleted !== completion.timeCompleted ||
        !completion.localToolPartsTerminal ||
        completion.presentationCommitted ||
        !completion.presentationUnavailable ||
        completion.eligibleOutputBytes !== 0 ||
        completion.partManifestFingerprint !== undefined ||
        completion.eligibleOutputFingerprint !== undefined ||
        completion.finalStructuredOutputFingerprint !== undefined
      ) {
        return "binding_mismatch" as const
      }
      return completionStructuralReason(completion)
    }
    if (model.state === "running" || model.state !== completion.modelOutcome) return "model_not_completed" as const
    const localToolPartsTerminal = localToolsTerminal(yield* readLocalToolStates(tx, group.assistant_message_id))
    if (completion.localToolPartsTerminal !== localToolPartsTerminal || !localToolPartsTerminal) {
      return "tool_parts_incomplete" as const
    }
    const presentation = yield* tx
      .select({ message: MessageTable, presentation: TurnModelPresentationTable })
      .from(TurnModelPresentationTable)
      .innerJoin(MessageTable, eq(MessageTable.id, TurnModelPresentationTable.assistant_message_id))
      .where(eq(TurnModelPresentationTable.assistant_message_id, group.assistant_message_id))
      .get()
      .pipe(Effect.orDie)
    if (!presentation) {
      return completion.presentationUnavailable && !completion.presentationCommitted
        ? "presentation_unavailable"
        : "binding_mismatch"
    }
    if (completion.presentationUnavailable) return "binding_mismatch" as const
    if (!completion.presentationCommitted) return "presentation_uncommitted" as const
    if (presentation.message.data.role !== "assistant") return "binding_mismatch" as const
    const assistant = presentation.message.data as Omit<SessionV1.Assistant, "id" | "sessionID">
    if (
      assistant.error ||
      !assistant.time.completed ||
      assistant.time.completed !== completion.timeCompleted ||
      model.time_settled === null ||
      completion.timeCompleted < model.time_settled
    ) {
      return "presentation_uncommitted" as const
    }
    const output = yield* assistantOutput(
      tx,
      group.session_id as ClaimGroup["sessionID"],
      group.assistant_message_id,
    ).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (!output) return "presentation_unavailable" as const
    const structuredFingerprint = assistant.structured === undefined ? undefined : fingerprint(assistant.structured)
    if (
      completion.partManifestFingerprint !== output.presentationFingerprint ||
      completion.eligibleOutputBytes !== output.bytes ||
      completion.eligibleOutputFingerprint !== (output.bytes === 0 ? undefined : output.eligibleOutputFingerprint) ||
      completion.finalStructuredOutputFingerprint !== structuredFingerprint
    ) {
      return "binding_mismatch" as const
    }
    return completionStructuralReason(completion)
  })
}

function unavailableClaimCompletion(
  tx: Transaction,
  group: typeof FutureAttentionClaimGroupTable.$inferSelect,
) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ model: TurnUnavailableModelTable, source: TurnUnavailableSourceTable })
      .from(TurnUnavailableModelTable)
      .innerJoin(TurnUnavailableSourceTable, eq(TurnUnavailableSourceTable.turn_id, TurnUnavailableModelTable.turn_id))
      .where(eq(TurnUnavailableModelTable.assistant_message_id, group.assistant_message_id))
      .get()
      .pipe(Effect.orDie)
    const tool = yield* tx
      .select()
      .from(TurnUnavailableToolTable)
      .where(eq(TurnUnavailableToolTable.part_id, group.invocation_part_id))
      .get()
      .pipe(Effect.orDie)
    if (
      !row ||
      !tool ||
      row.source.session_id !== group.session_id ||
      row.source.turn_id !== group.turn_id ||
      row.source.admission_kind !== "learner" ||
      row.source.depth !== 0 ||
      row.model.turn_id !== group.turn_id ||
      row.model.causal_occurrence_id !== group.occurrence_id ||
      row.model.state === null ||
      row.model.time_settled === null ||
      tool.turn_id !== group.turn_id ||
      tool.assistant_message_id !== group.assistant_message_id
    ) {
      return undefined
    }
    return { modelOutcome: row.model.state, timeCompleted: row.model.time_settled }
  })
}

function readLocalToolStates(tx: Transaction, assistantMessageID: MessageID) {
  return tx
    .select({ candidate: TurnToolCandidateTable, invocation: TurnToolInvocationTable })
    .from(TurnToolCandidateTable)
    .leftJoin(TurnToolInvocationTable, eq(TurnToolInvocationTable.part_id, TurnToolCandidateTable.part_id))
    .where(eq(TurnToolCandidateTable.assistant_message_id, assistantMessageID))
    .all()
    .pipe(Effect.orDie)
}

function localToolsTerminal(
  candidates: readonly Readonly<{
    candidate: typeof TurnToolCandidateTable.$inferSelect
    invocation: typeof TurnToolInvocationTable.$inferSelect | null
  }>[],
) {
  return candidates.every(
    (row) =>
      row.candidate.state === "not_started_interrupted" ||
      row.candidate.state === "not_started_failed" ||
      row.candidate.state === "not_started_limit" ||
      row.candidate.state === "not_started_turn_exhausted" ||
      (row.candidate.state === "admitted" &&
        !!row.invocation &&
        ["completed", "failed", "interrupted"].includes(row.invocation.state)),
  )
}

function validateClaimMember(
  tx: Transaction,
  member: typeof FutureAttentionClaimMemberTable.$inferSelect,
  completion: CompletionFacts,
) {
  return Effect.gen(function* () {
    const concern = yield* readConcernSnapshot(tx, member.concern_id)
    if (
      !concern ||
      concern.current.version !== member.expected_version ||
      concern.current.id !== member.expected_transition_id ||
      concern.current.disposition !== "open"
    ) {
      return yield* new InvalidCommandError({ reason: "stale" })
    }
    yield* requireTargetCurrent(tx, concern)
    if (completion.timeCompleted <= concern.current.timeCommitted) {
      return yield* new InvalidCommandError({ reason: "too_early" })
    }
    if (
      concern.payload.serviceTiming === "at_or_after_not_before" &&
      completion.timeCompleted < concern.payload.notBefore.instant
    ) {
      return yield* new InvalidCommandError({ reason: "too_early" })
    }
    yield* validateLearnerWitness(
      tx,
      concern,
      member.learner_response_witness ?? undefined,
      assistantCompletionSource(completion),
    )
  })
}

function claimFailureReason(error: unknown): NonNullable<FinalizationMemberResult["reason"]> {
  if (error instanceof InvalidCommandError) {
    if (error.reason === "stale") return "stale_head"
    if (error.reason === "target_not_current") return "target_not_current"
    if (error.reason === "too_early") return "too_early"
    if (error.reason === "source_unavailable") return "source_unavailable"
  }
  return "binding_mismatch"
}

function assistantCompletionSource(completion: CompletionFacts): CompleteServiceSource {
  return {
    type: "assistant_completion",
    sessionID: completion.sessionID,
    turnID: completion.turnID,
    assistantMessageID: completion.assistantMessageID,
    timeCompleted: completion.timeCompleted,
    presentationFingerprint: completion.partManifestFingerprint!,
    eligibleOutputFingerprint: completion.eligibleOutputFingerprint!,
  }
}

function concernView(
  tx: Transaction,
  concern: ConcernSnapshot,
  now: number,
  ownerCut: Readonly<{ frontierSequence: number; time: number; fingerprint: string }>,
) {
  return Effect.gen(function* () {
    const sourceAvailability = yield* currentSourceAvailability(tx, concern.payload.source)
    const status = yield* Course.inspectMembershipStatus(
      tx,
      concern.payload.target.endpoint,
      concern.payload.target.selection,
    )
    const targetStatus = courseTargetStatus(status)
    const claim = yield* currentClaimProjectionForConcern(tx, concern.id)
    const serviceReceipt = concern.current.serviceReceiptID
      ? yield* requireServiceReceipt(tx, concern.current.serviceReceiptID)
      : undefined
    const serviceSourceAvailability = serviceReceipt
      ? yield* currentCompleteSourceAvailability(tx, serviceReceipt.source)
      : undefined
    return {
      concern,
      sourceAvailability,
      targetStatus,
      eligible:
        concern.current.disposition === "open" &&
        targetStatus === "target_current" &&
        concern.payload.notBefore.instant <= now,
      ...(claim ? { claim } : {}),
      ...(serviceReceipt
        ? {
            serviceReceipt: {
              id: serviceReceipt.id,
              source: serviceReceipt.source,
              sourceAvailability: serviceSourceAvailability!,
              rationale: serviceReceipt.rationale,
              ...(serviceReceipt.learner_response_witness
                ? { learnerResponseWitness: serviceReceipt.learner_response_witness }
                : {}),
              ...(serviceReceipt.carried_from_service_receipt_id
                ? { carriedFromServiceReceiptID: serviceReceipt.carried_from_service_receipt_id }
                : {}),
              ...(serviceReceipt.claim_group_id ? { claimGroupID: serviceReceipt.claim_group_id } : {}),
            },
          }
        : {}),
      ownerCut: {
        ...ownerCut,
        fingerprint: ownerReferenceFingerprint(concern),
      },
    } satisfies ConcernView
  })
}

function currentClaimProjectionForConcern(tx: Transaction, concernID: ConcernID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ group: FutureAttentionClaimGroupTable, finalization: FutureAttentionClaimFinalizationTable })
      .from(FutureAttentionClaimMemberTable)
      .innerJoin(
        FutureAttentionClaimGroupTable,
        eq(FutureAttentionClaimGroupTable.id, FutureAttentionClaimMemberTable.group_id),
      )
      .leftJoin(
        FutureAttentionClaimFinalizationTable,
        eq(FutureAttentionClaimFinalizationTable.group_id, FutureAttentionClaimGroupTable.id),
      )
      .where(eq(FutureAttentionClaimMemberTable.concern_id, concernID))
      .orderBy(sql`${FutureAttentionClaimGroupTable.time_admitted} DESC`)
      .get()
      .pipe(Effect.orDie)
    if (!row) return undefined
    return {
      groupID: row.group.id,
      claimState: row.finalization?.outcome ?? "pending",
      ...(row.finalization ? { finalizationReceiptID: row.finalization.id } : {}),
    } satisfies ClaimProjection
  })
}

function currentSourceAvailability(tx: Transaction, source: CreationSource) {
  const occurrenceID =
    source.type === "interpreted_learner_request" ? source.excerpt.source.occurrenceID : source.source.occurrenceID
  return tx
    .select({ id: LearnerOccurrenceTombstoneTable.occurrence_id })
    .from(LearnerOccurrenceTombstoneTable)
    .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, occurrenceID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) =>
        row ? ({ state: "source_unavailable", reason: "source_deleted" } as const) : ({ state: "available" } as const),
      ),
    )
}

function currentCompleteSourceAvailability(tx: Transaction, source: CompleteServiceSource) {
  return Effect.gen(function* () {
    if (source.type === "learner_occurrence") {
      const tombstone = yield* tx
        .select({ id: LearnerOccurrenceTombstoneTable.occurrence_id })
        .from(LearnerOccurrenceTombstoneTable)
        .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, source.source.occurrenceID))
        .get()
        .pipe(Effect.orDie)
      if (tombstone) return { state: "source_unavailable", reason: "source_deleted" } as const
      const current = yield* currentSource(tx, source.source.occurrenceID).pipe(
        Effect.catch(() => Effect.succeed(undefined)),
      )
      return current &&
        isDeepStrictEqual(current, source.source) &&
        source.timeCompleted === current.timeAdmitted &&
        source.sourceOrder === current.sourceOrder
        ? ({ state: "available" } as const)
        : ({ state: "source_unavailable", reason: "presentation_unavailable" } as const)
    }

    const sessionID = source.type === "child_result" ? source.parentSessionID : source.sessionID
    const turnID = source.type === "child_result" ? source.parentTurnID : source.turnID
    const deleted = yield* completeSourceDeleted(tx, sessionID, turnID)
    if (deleted) return { state: "source_unavailable", reason: "source_deleted" } as const

    if (source.type === "assistant_completion") {
      const row = yield* tx
        .select({ model: TurnModelOperationTable, presentation: TurnModelPresentationTable, turn: TurnTable })
        .from(TurnModelOperationTable)
        .innerJoin(
          TurnModelPresentationTable,
          eq(TurnModelPresentationTable.assistant_message_id, TurnModelOperationTable.assistant_message_id),
        )
        .innerJoin(TurnTable, eq(TurnTable.id, TurnModelOperationTable.turn_id))
        .where(eq(TurnModelOperationTable.assistant_message_id, source.assistantMessageID))
        .get()
        .pipe(Effect.orDie)
      const output = row
        ? yield* assistantOutput(tx, source.sessionID, source.assistantMessageID).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )
        : undefined
      const current =
        row?.model.state === "completed" &&
        row.model.time_settled !== null &&
        row.model.session_id === source.sessionID &&
        row.model.turn_id === source.turnID &&
        output &&
        output.bytes > 0
          ? ({
              type: "assistant_completion",
              sessionID: row.model.session_id,
              turnID: row.model.turn_id,
              assistantMessageID: row.model.assistant_message_id,
              timeCompleted: output.timeCompleted,
              presentationFingerprint: output.presentationFingerprint,
              eligibleOutputFingerprint: output.eligibleOutputFingerprint,
            } satisfies CompleteServiceSource)
          : undefined
      return current && isDeepStrictEqual(current, source)
        ? ({ state: "available" } as const)
        : ({ state: "source_unavailable", reason: "presentation_unavailable" } as const)
    }

    if (source.type === "tool_result") {
      const row = yield* tx
        .select({ invocation: TurnToolInvocationTable, candidate: TurnToolCandidateTable, part: PartTable })
        .from(TurnToolInvocationTable)
        .innerJoin(TurnToolCandidateTable, eq(TurnToolCandidateTable.part_id, TurnToolInvocationTable.part_id))
        .innerJoin(PartTable, eq(PartTable.id, TurnToolInvocationTable.part_id))
        .where(eq(TurnToolInvocationTable.part_id, source.partID))
        .get()
        .pipe(Effect.orDie)
      const tool =
        row?.part.data.type === "tool"
          ? (row.part.data as Omit<SessionV1.ToolPart, "id" | "sessionID" | "messageID">)
          : undefined
      const current =
        row?.invocation.state === "completed" &&
        row.invocation.time_settled !== null &&
        row.invocation.session_id === source.sessionID &&
        row.invocation.turn_id === source.turnID &&
        row.invocation.assistant_message_id === source.assistantMessageID &&
        row.candidate.assistant_message_id === source.assistantMessageID &&
        row.candidate.tool === source.tool &&
        row.candidate.tool === tool?.tool &&
        row.candidate.future_attention_service_source === "learner_usable" &&
        source.sourceUse === "learner_usable" &&
        tool?.state.status === "completed" &&
        tool.state.output.trim().length > 0
          ? ({
              type: "tool_result",
              sessionID: row.invocation.session_id,
              turnID: row.invocation.turn_id,
              assistantMessageID: row.invocation.assistant_message_id,
              partID: row.invocation.part_id,
              tool: row.candidate.tool,
              sourceUse: "learner_usable",
              timeCompleted: row.invocation.time_settled,
              resultFingerprint: fingerprint(tool.state.output),
            } satisfies CompleteServiceSource)
          : undefined
      return current && isDeepStrictEqual(current, source)
        ? ({ state: "available" } as const)
        : ({ state: "source_unavailable", reason: "presentation_unavailable" } as const)
    }

    const row = yield* tx
      .select()
      .from(TurnChildResultTable)
      .where(eq(TurnChildResultTable.parent_task_part_id, source.parentTaskPartID))
      .get()
      .pipe(Effect.orDie)
    const current =
      row?.parent_session_id === source.parentSessionID &&
      row.parent_turn_id === source.parentTurnID &&
      row.child_turn_id === source.childTurnID &&
      row.terminal_outcome === "completed" &&
      row.requested_output_state === "complete" &&
      row.requested_output !== null
        ? ({
            type: "child_result",
            parentSessionID: row.parent_session_id,
            parentTurnID: row.parent_turn_id,
            parentTaskPartID: row.parent_task_part_id,
            childTurnID: row.child_turn_id,
            timeCompleted: row.time_settled,
            resultFingerprint: fingerprint(row.requested_output),
          } satisfies CompleteServiceSource)
        : undefined
    return current && isDeepStrictEqual(current, source)
      ? ({ state: "available" } as const)
      : ({ state: "source_unavailable", reason: "presentation_unavailable" } as const)
  })
}

function completeSourceDeleted(tx: Transaction, sessionID: SessionSchema.ID, turnID: Turn.ID) {
  return Effect.all([
    tx
      .select({ id: TurnUnavailableSourceTable.turn_id, sessionID: TurnUnavailableSourceTable.session_id })
      .from(TurnUnavailableSourceTable)
      .where(eq(TurnUnavailableSourceTable.turn_id, turnID))
      .get()
      .pipe(Effect.orDie),
    tx
      .select({ id: SessionTable.id })
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionID))
      .get()
      .pipe(Effect.orDie),
  ]).pipe(Effect.map(([tombstone, session]) => tombstone?.sessionID === sessionID || !session))
}

function sourceAvailabilityFromSource(source: CreationSource): SourceAvailability {
  return source.type === "interpreted_learner_request" || source.type === "tutor_initiated"
    ? { state: "available" }
    : { state: "source_unavailable", reason: "source_deleted" }
}

function courseTargetStatus(status: Course.MembershipStatus): TargetStatus {
  if (status.status === "eligible") return "target_current"
  if (status.cause === "working_selection_mismatch") return "target_stale"
  return "target_missing"
}

function ownerReferenceFingerprint(concern: ConcernSnapshot) {
  return fingerprint({
    concernID: concern.id,
    expectedVersion: concern.current.version,
    headTransitionID: concern.current.id,
  })
}

function alreadyAppliedSettlement(
  tx: Transaction,
  row: typeof FutureAttentionChangeSetTable.$inferSelect,
  metadata: SettlementMetadata,
) {
  return Effect.gen(function* () {
    const projection = row.admission_projection
    if (!isRecord(projection) || !Array.isArray(projection.changes)) {
      return yield* integrity("FutureAttention change set lost its admission projection")
    }
    const claim = yield* currentClaimProjectionForChangeSet(tx, row.id)
    return {
      outcome: "already_applied",
      futureAttentionKind: "change_set",
      schemaVersion: 1,
      receiptID: row.physical_receipt_id,
      effectID: row.id,
      occurrenceID: row.occurrence_id,
      changes: projection.changes as readonly ChangeProjection[],
      ...(claim ? { claim: { ...claim, claimStateAtAdmission: "pending" } } : {}),
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies AlreadyAppliedSettlement
  })
}

function currentClaimProjectionForChangeSet(tx: Transaction, changeSetID: ChangeSetID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ group: FutureAttentionClaimGroupTable, finalization: FutureAttentionClaimFinalizationTable })
      .from(FutureAttentionClaimGroupTable)
      .leftJoin(
        FutureAttentionClaimFinalizationTable,
        eq(FutureAttentionClaimFinalizationTable.group_id, FutureAttentionClaimGroupTable.id),
      )
      .where(eq(FutureAttentionClaimGroupTable.change_set_id, changeSetID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return undefined
    return {
      groupID: row.group.id,
      claimState: row.finalization?.outcome ?? "pending",
      ...(row.finalization ? { finalizationReceiptID: row.finalization.id } : {}),
    } satisfies ClaimProjection
  })
}

function boundedReadPage(
  query: ReadQuery,
  input: ReadPage["items"],
  countAtCut: number,
  ownerCut: ReadPage["ownerCut"],
  limit: number,
  byteLimit: number,
  cut: LearningFrontier.Snapshot | undefined,
): ReadPage {
  const items: ReadPage["items"][number][] = []
  let bytes = utf8Bytes(canonicalJson(toJsonValue({ query, ownerCut, items: [] })))
  for (const item of input) {
    if (items.length >= limit) break
    const next = utf8Bytes(canonicalJson(toJsonValue(item)))
    if (bytes + next > byteLimit) break
    items.push(item)
    bytes += next
  }
  const truncated = items.length < input.length
  const last = items.at(-1)
  const after = last && "concern" in last ? { timeCreated: last.concern.timeCreated, id: last.concern.id } : undefined
  return {
    query,
    items,
    countAtCut,
    returnedCount: items.length,
    nextCursor:
      truncated && cut && after ? encodeCursor({ version: 1, queryFingerprint: fingerprint(query), cut, after }) : null,
    truncated,
    omittedCount: Math.max(0, countAtCut - items.length),
    order: "storage_non_priority",
    canonicalBytes: bytes,
    ownerCut,
  }
}

function encodeCursor(value: unknown) {
  return Buffer.from(canonicalJson(toJsonValue(value))).toString("base64url")
}

function decodeCursor(value: string, query: ReadQuery) {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown
    if (
      !isRecord(decoded) ||
      decoded.version !== 1 ||
      decoded.queryFingerprint !== fingerprint(query) ||
      !isRecord(decoded.cut) ||
      !nonnegativeInteger(decoded.cut.sequence) ||
      !nonnegativeInteger(decoded.cut.time) ||
      !isRecord(decoded.after) ||
      !nonnegativeInteger(decoded.after.timeCreated) ||
      !opaqueID(decoded.after.id, "fac")
    ) {
      throw new Error("invalid cursor")
    }
    return decoded as unknown as Readonly<{
      cut: LearningFrontier.Snapshot
      after: Readonly<{ timeCreated: number; id: ConcernID }>
    }>
  } catch {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
}

function currentSource(tx: Transaction, occurrenceID: InvocationEnvelope["occurrenceID"]) {
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
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    yield* Occurrence.requireAvailableSource(tx, {
      sessionID: row.occurrence.origin_session_id,
      messageID: row.occurrence.origin_message_id,
      occurrenceID: row.occurrence.id,
    }).pipe(Effect.mapError(() => new InvalidCommandError({ reason: "source_unavailable" })))
    return {
      occurrenceID: row.occurrence.id,
      sourceOrder: row.occurrence.source_order,
      sessionID: row.occurrence.origin_session_id,
      messageID: row.occurrence.origin_message_id,
      turnID: row.turn.id,
      inputID: row.input.id,
      timeAdmitted: row.occurrence.time_admitted,
    } satisfies Source
  })
}

function temporalSourceZone(tx: Transaction, occurrenceID: InvocationEnvelope["occurrenceID"]) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({
        state: AdmittedLearnerOccurrenceTable.source_temporal_state,
        timeZone: AdmittedLearnerOccurrenceTable.source_timezone,
        offset: AdmittedLearnerOccurrenceTable.source_utc_offset_minutes,
      })
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (row?.state === "resolved" && row.timeZone && row.offset !== null) {
      return { state: "resolved", timeZone: row.timeZone, utcOffsetMinutes: row.offset } satisfies CivilSourceZone
    }
    return { state: "unavailable", reason: "timezone_unavailable" } satisfies CivilSourceZone
  })
}

function learnerText(tx: Transaction, sessionID: Source["sessionID"], messageID: MessageID) {
  return Effect.gen(function* () {
    const message = yield* tx
      .select({ id: MessageTable.id, data: MessageTable.data })
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, sessionID), eq(MessageTable.id, messageID)))
      .get()
      .pipe(Effect.orDie)
    if (!message || message.data.role !== "user")
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
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
        const text = part.data as Omit<SessionV1.TextPart, "id" | "sessionID" | "messageID">
        return text.synthetic === true ? [] : [text.text]
      })
      .join("\n")
  })
}

function assistantOutput(tx: Transaction, sessionID: Source["sessionID"], messageID: MessageID) {
  return Effect.gen(function* () {
    const message = yield* tx
      .select({ data: MessageTable.data })
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, sessionID), eq(MessageTable.id, messageID)))
      .get()
      .pipe(Effect.orDie)
    const assistant =
      message?.data.role === "assistant" ? (message.data as Omit<SessionV1.Assistant, "id" | "sessionID">) : undefined
    if (!assistant || !assistant.time.completed || assistant.error) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    const parts = yield* tx
      .select({ id: PartTable.id, data: PartTable.data, timeCreated: PartTable.time_created })
      .from(PartTable)
      .where(and(eq(PartTable.session_id, sessionID), eq(PartTable.message_id, messageID)))
      .orderBy(asc(PartTable.time_created), asc(PartTable.id))
      .all()
      .pipe(Effect.orDie)
    const text = parts.flatMap((part) => {
      if (part.data.type !== "text") return []
      const value = part.data as Omit<SessionV1.TextPart, "id" | "sessionID" | "messageID">
      return value.synthetic === true || value.text.length === 0 ? [] : [value.text]
    })
    const output = { text, ...(assistant.structured === undefined ? {} : { structured: assistant.structured }) }
    const hasEligibleOutput = text.length > 0 || assistant.structured !== undefined
    return {
      bytes: hasEligibleOutput ? utf8Bytes(canonicalJson(toJsonValue(output))) : 0,
      timeCompleted: assistant.time.completed,
      presentationFingerprint: fingerprint({ message: assistant, parts }),
      eligibleOutputFingerprint: fingerprint(output),
    }
  })
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
    : integrity("FutureAttention envelope has an incompatible capability or provenance basis")
}

function invocationEnvelope(invocation: typeof LearningCommandInvocationTable.$inferSelect): InvocationEnvelope {
  if (!invocation.turn_id || !invocation.input_id) throw new Error("FutureAttention invocation lost Turn identity")
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

function agentActionProvenance(envelope: InvocationEnvelope, trusted: ValidatedAgentActionRegistration) {
  return Effect.gen(function* () {
    if (
      trusted.occurrenceID !== envelope.occurrenceID ||
      trusted.depth !== trusted.lineage.length ||
      (trusted.admissionKind === "learner" && trusted.depth !== 0) ||
      (trusted.admissionKind === "delegated_task" && trusted.depth <= 0)
    ) {
      return yield* integrity("FutureAttention Agent action has no exact root-or-delegated lineage")
    }
    const common = {
      schemaVersion: 1 as const,
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
    }
    if (trusted.admissionKind === "learner") {
      return { ...common, kind: "root" as const, lineage: [] } satisfies AgentAction
    }
    const lineage = trusted.lineage.map((edge) => ({
      ...edge,
      delegatedCapabilityFingerprint: fingerprint(edge.delegatedCapability),
    }))
    const effective = lineage.at(-1)
    if (
      !effective ||
      effective.childTurnID !== envelope.turnID ||
      !isDelegatedCapabilityProjection(effective.delegatedCapability)
    ) {
      return yield* integrity("Delegated FutureAttention action has no exact effective capability")
    }
    return {
      ...common,
      kind: "delegated" as const,
      lineage,
      effectiveDelegatedCapability: {
        identity: UPDATE_CAPABILITY,
        version: UPDATE_VERSION,
        projectionVersion: 2,
        fingerprint: effective.delegatedCapabilityFingerprint,
      },
    } satisfies AgentAction
  })
}

function issuerCanPerform(operations: readonly Operation[], action: AgentAction) {
  if (action.kind === "root") return true
  return operations.every((operation) => {
    if (operation.type === "create") return operation.concern.source.type === "tutor_initiated"
    if (operation.type === "serve") return false
    if (operation.mutation.type !== "agent_correction") return false
    if (operation.type !== "replace") return true
    if (operation.successorSource.type === "rebind_current_source") {
      if (operation.successorSource.source.type !== "tutor_initiated") return false
    }
    return (
      operation.successorDisposition.type !== "serve_complete_source" &&
      operation.successorDisposition.type !== "serve_current_assistant_when_complete"
    )
  })
}

function hasWriteMembership(trusted: ValidatedAgentActionRegistration) {
  if (trusted.admissionKind === "learner") return true
  const effective = trusted.lineage.at(-1)?.delegatedCapability
  if (!isDelegatedCapabilityProjection(effective)) return false
  return effective.explicit.some(
    (value) =>
      isRecord(value) &&
      value.action === "allow" &&
      typeof value.permission === "string" &&
      typeof value.pattern === "string" &&
      Wildcard.matchIdentifier(UPDATE_CAPABILITY, value.permission) &&
      Wildcard.match(PERMISSION_PATTERN, value.pattern),
  )
}

function isDelegatedCapabilityProjection(value: unknown): value is Readonly<{
  version: 2
  explicit: readonly unknown[]
  parent: readonly unknown[]
  inherited: readonly unknown[]
  profile: readonly unknown[]
}> {
  return (
    isRecord(value) &&
    value.version === 2 &&
    Array.isArray(value.parent) &&
    Array.isArray(value.inherited) &&
    Array.isArray(value.profile) &&
    Array.isArray(value.explicit)
  )
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
      return yield* integrity("FutureAttention invocation is unavailable")
    }
    return invocation
  })
}

function readDisposition(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(FutureAttentionDispositionTable)
    .where(eq(FutureAttentionDispositionTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function requireCandidate(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, partID)
    if (invocation.status !== "admitted")
      return yield* integrity("FutureAttention capability requires an admitted candidate")
    const row = yield* readDisposition(tx, partID)
    if (!row || row.disposition !== "candidate_v1") {
      return yield* integrity("FutureAttention invocation has no candidate disposition")
    }
    return candidateInfo(row)
  })
}

function candidateInfo(row: typeof FutureAttentionDispositionTable.$inferSelect) {
  if (row.disposition !== "candidate_v1" || !row.materialized_candidate) {
    throw new Error("FutureAttention candidate row is incomplete")
  }
  return row.materialized_candidate
}

function readCapabilityIssue(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(FutureAttentionCapabilityIssueTable)
    .where(eq(FutureAttentionCapabilityIssueTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function readCapabilitySettlement(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(FutureAttentionCapabilitySettlementTable)
    .where(eq(FutureAttentionCapabilitySettlementTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilityIssueInfo(row: typeof FutureAttentionCapabilityIssueTable.$inferSelect) {
  return {
    requestID: row.permission_request_id,
    agentActionFingerprint: row.agent_action_fingerprint,
    policyBasis: row.policy_basis,
    policyFingerprint: row.policy_fingerprint,
    shownScope: row.shown_scope,
    shownScopeFingerprint: row.shown_scope_fingerprint,
    timeIssued: row.time_issued,
    issueOrder: row.issue_order,
  }
}

function capabilitySettlementInfo(row: typeof FutureAttentionCapabilitySettlementTable.$inferSelect) {
  return {
    outcome: row.outcome,
    ...(row.permission_request_id ? { requestID: row.permission_request_id } : {}),
    agentActionFingerprint: row.agent_action_fingerprint,
    ...(row.basis ? { basis: row.basis } : {}),
    ...(row.basis_fingerprint ? { basisFingerprint: row.basis_fingerprint } : {}),
    timeSettled: row.time_settled,
    settlementOrder: row.settlement_order,
  }
}

function closedChangeSet(value: unknown): value is ChangeSetCommand {
  return (
    isRecord(value) &&
    onlyKeys(value, ["operations"]) &&
    Array.isArray(value.operations) &&
    value.operations.length >= 1 &&
    value.operations.length <= MAX_OPERATIONS &&
    value.operations.every(closedOperation)
  )
}

function closedOperation(value: unknown): value is Operation {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "create") {
    return onlyKeys(value, ["type", "concern"]) && concernPayloadIntent(value.concern)
  }
  if (!opaqueID(value.concernID, "fac") || !nonnegativeInteger(value.expectedVersion)) return false
  if (value.type === "serve") {
    return onlyKeys(value, ["type", "concernID", "expectedVersion", "service"]) && serviceAlignment(value.service)
  }
  if (value.type === "dismiss" || value.type === "reopen") {
    return onlyKeys(value, ["type", "concernID", "expectedVersion", "mutation"]) && mutationRelation(value.mutation)
  }
  return (
    value.type === "replace" &&
    onlyKeys(value, [
      "type",
      "concernID",
      "expectedVersion",
      "mutation",
      "successorSource",
      "concern",
      "successorDisposition",
    ]) &&
    mutationRelation(value.mutation) &&
    successorSource(value.successorSource) &&
    replacementPayload(value.concern) &&
    successorDisposition(value.successorDisposition)
  )
}

function concernPayloadIntent(value: unknown): value is ConcernPayloadIntent {
  return (
    isRecord(value) &&
    onlyAllowedKeys(value, ["purpose", "source", "target", "notBefore", "serviceTiming"], ["interactionOrder"]) &&
    boundedString(value.purpose, 1, MAX_PURPOSE_BYTES) &&
    creationSource(value.source) &&
    target(value.target) &&
    notBeforeIntent(value.notBefore) &&
    (value.serviceTiming === "after_creation" || value.serviceTiming === "at_or_after_not_before") &&
    (value.interactionOrder === undefined || value.interactionOrder === "learner_response_before_tutor_disclosure")
  )
}

function replacementPayload(value: unknown): value is Omit<ConcernPayloadIntent, "source"> {
  return (
    isRecord(value) &&
    onlyAllowedKeys(value, ["purpose", "target", "notBefore", "serviceTiming"], ["interactionOrder"]) &&
    boundedString(value.purpose, 1, MAX_PURPOSE_BYTES) &&
    target(value.target) &&
    notBeforeIntent(value.notBefore) &&
    (value.serviceTiming === "after_creation" || value.serviceTiming === "at_or_after_not_before") &&
    (value.interactionOrder === undefined || value.interactionOrder === "learner_response_before_tutor_disclosure")
  )
}

function creationSource(value: unknown): value is CreationSourceIntent {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "tutor_initiated") return onlyKeys(value, ["type"])
  return value.type === "interpreted_learner_request" && onlyKeys(value, ["type", "excerpt"]) && excerpt(value.excerpt)
}

function mutationRelation(value: unknown): value is MutationRelationIntent {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "interpreted_learner_direction") {
    return onlyKeys(value, ["type", "excerpt"]) && excerpt(value.excerpt)
  }
  return (
    value.type === "agent_correction" &&
    onlyKeys(value, ["type", "rationale", "ownerRead"]) &&
    boundedString(value.rationale, 1, MAX_RATIONALE_BYTES) &&
    ownerRead(value.ownerRead)
  )
}

function ownerRead(value: unknown): value is OwnerReadReference {
  return (
    isRecord(value) &&
    onlyKeys(value, ["concernID", "expectedVersion", "headTransitionID", "cutFingerprint"]) &&
    opaqueID(value.concernID, "fac") &&
    nonnegativeInteger(value.expectedVersion) &&
    opaqueID(value.headTransitionID, "fat") &&
    lowercaseFingerprint(value.cutFingerprint)
  )
}

function excerpt(value: unknown): value is ExcerptIntent {
  return (
    isRecord(value) &&
    onlyKeys(value, ["text", "startByte", "endByte"]) &&
    boundedString(value.text, 1, MAX_EXCERPT_BYTES) &&
    nonnegativeInteger(value.startByte) &&
    nonnegativeInteger(value.endByte) &&
    value.endByte >= value.startByte &&
    value.endByte - value.startByte === utf8Bytes(value.text)
  )
}

function target(value: unknown): value is ConcernPayloadIntent["target"] {
  if (!isRecord(value) || !onlyKeys(value, ["endpoint", "selection"])) return false
  if (!isRecord(value.endpoint) || !onlyKeys(value.endpoint, ["courseID", "viewID", "revisionID", "itemID"])) {
    return false
  }
  if (
    !opaqueID(value.endpoint.courseID, "crs") ||
    !opaqueID(value.endpoint.viewID, "cvw") ||
    !opaqueID(value.endpoint.revisionID, "cvr") ||
    !opaqueID(value.endpoint.itemID, "cit") ||
    !isRecord(value.selection)
  ) {
    return false
  }
  if (value.selection.type === "explicit_exact") return onlyKeys(value.selection, ["type"])
  return (
    value.selection.type === "observed_working" &&
    onlyKeys(value.selection, ["type", "revisionID", "version"]) &&
    opaqueID(value.selection.revisionID, "cvr") &&
    nonnegativeInteger(value.selection.version) &&
    value.selection.revisionID === value.endpoint.revisionID
  )
}

function notBeforeIntent(value: unknown): value is ConcernPayloadIntent["notBefore"] {
  if (
    !isRecord(value) ||
    !onlyKeys(value, ["sourceExpression", "localDateTime", "timeZone"]) ||
    !boundedString(value.sourceExpression, 1, MAX_TEMPORAL_EXPRESSION_BYTES) ||
    typeof value.localDateTime !== "string" ||
    !isRecord(value.timeZone)
  ) {
    return false
  }
  if (value.timeZone.type === "source") return onlyKeys(value.timeZone, ["type"])
  if (value.timeZone.type === "iana") {
    return (
      onlyKeys(value.timeZone, ["type", "name"]) &&
      typeof value.timeZone.name === "string" &&
      value.timeZone.name.length > 0
    )
  }
  return (
    value.timeZone.type === "fixed_offset" &&
    onlyKeys(value.timeZone, ["type", "offsetMinutes"]) &&
    Number.isInteger(value.timeZone.offsetMinutes) &&
    Number(value.timeZone.offsetMinutes) >= -840 &&
    Number(value.timeZone.offsetMinutes) <= 840
  )
}

function serviceAlignment(value: unknown): value is ServiceAlignmentIntent {
  return (
    isRecord(value) &&
    onlyAllowedKeys(value, ["source", "rationale"], ["learnerResponseWitness"]) &&
    serviceSource(value.source) &&
    boundedString(value.rationale, 1, MAX_RATIONALE_BYTES) &&
    (value.learnerResponseWitness === undefined || learnerWitness(value.learnerResponseWitness))
  )
}

function serviceSource(value: unknown): value is ServiceAlignmentIntent["source"] {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "learner_occurrence" || value.type === "current_assistant_when_complete") {
    return onlyKeys(value, ["type"])
  }
  if (value.type === "assistant_completion") {
    return onlyKeys(value, ["type", "assistantMessageID"]) && nonempty(value.assistantMessageID)
  }
  if (value.type === "tool_result") return onlyKeys(value, ["type", "partID"]) && nonempty(value.partID)
  return (
    value.type === "child_result" && onlyKeys(value, ["type", "parentTaskPartID"]) && nonempty(value.parentTaskPartID)
  )
}

function learnerWitness(value: unknown) {
  return (
    isRecord(value) &&
    onlyKeys(value, ["occurrenceID"]) &&
    typeof value.occurrenceID === "string" &&
    value.occurrenceID.length > 0
  )
}

function successorSource(value: unknown) {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "preserve_predecessor_source") return onlyKeys(value, ["type"])
  return value.type === "rebind_current_source" && onlyKeys(value, ["type", "source"]) && creationSource(value.source)
}

function successorDisposition(value: unknown) {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "open") return onlyKeys(value, ["type"])
  if (value.type === "dismissed_by_mutation" || value.type === "carry_served" || value.type === "carry_dismissed") {
    return onlyKeys(value, ["type", "rationale"]) && boundedString(value.rationale, 1, MAX_RATIONALE_BYTES)
  }
  if (value.type === "serve_complete_source") {
    return (
      onlyKeys(value, ["type", "service"]) &&
      serviceAlignment(value.service) &&
      value.service.source.type !== "current_assistant_when_complete"
    )
  }
  return (
    value.type === "serve_current_assistant_when_complete" &&
    onlyKeys(value, ["type", "service"]) &&
    isRecord(value.service) &&
    onlyAllowedKeys(value.service, ["rationale"], ["learnerResponseWitness"]) &&
    boundedString(value.service.rationale, 1, MAX_RATIONALE_BYTES) &&
    (value.service.learnerResponseWitness === undefined || learnerWitness(value.service.learnerResponseWitness))
  )
}

function canonicalCommandEffect(input: ChangeSetCommand) {
  return Effect.try({
    try: () => canonicalizeCommand(input),
    catch: (error) =>
      error instanceof InvalidCommandError ? error : new InvalidCommandError({ reason: "validation_error" }),
  })
}

function operationSortKey(operation: Operation) {
  return operation.type === "create"
    ? `1:${fingerprint(operation.concern)}`
    : `0:${operation.concernID}:${operation.type}`
}

function creationIntentFromSource(source: CreationSource): CreationSourceIntent {
  if (source.type === "tutor_initiated") return { type: "tutor_initiated" }
  return {
    type: "interpreted_learner_request",
    excerpt: {
      text: source.excerpt.text,
      startByte: source.excerpt.startByte,
      endByte: source.excerpt.endByte,
    },
  }
}

function fingerprint(value: unknown) {
  return canonicalFingerprint(toJsonValue(value))
}

function futureAttentionErrorSettlement(error: unknown, metadata: SettlementMetadata) {
  if (error instanceof InvalidCommandError) {
    if (error.reason === "capacity_exceeded") return errorSettlement("capacity_exceeded", metadata)
    if (error.reason === "source_unavailable") return errorSettlement("source_unavailable", metadata)
    if (error.reason === "stale") return errorSettlement("stale", metadata)
    if (error.reason === "target_not_current") return errorSettlement("inactive", metadata)
    if (error.reason === "too_early") return errorSettlement("validation_error", metadata, { reason: "too_early" })
    if (error.reason === "illegal_issuer") return errorSettlement("permission_rejected", metadata)
    return errorSettlement("validation_error", metadata)
  }
  const tag = isRecord(error) && typeof error._tag === "string" ? error._tag : ""
  if (tag.includes("Conflict") || tag.includes("Stale")) return errorSettlement("stale", metadata)
  if (tag.includes("Unavailable") || tag.includes("NotFound")) return errorSettlement("source_unavailable", metadata)
  return errorSettlement("validation_error", metadata)
}

function settleDomainFailure(tx: Transaction, partID: PartID, settlement: ReturnType<typeof errorSettlement>) {
  return Effect.gen(function* () {
    yield* settlePhysicalInvocation(tx, partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

function capabilityErrorCode(outcome: CapabilityOutcome) {
  if (outcome === "policy_deny" || outcome === "prompted_deny") return "permission_rejected" as const
  if (outcome === "prompted_correct") return "permission_corrected" as const
  if (outcome === "prompted_cancel") return "cancelled" as const
  return "interrupted" as const
}

function requireTextBytes(value: string, minimum: number, maximum: number) {
  const bytes = utf8Bytes(value)
  if (bytes < minimum || bytes > maximum) throw new InvalidCommandError({ reason: "capacity_exceeded" })
}

function boundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && utf8Bytes(value) >= minimum && utf8Bytes(value) <= maximum
}

function onlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key))
}

function onlyAllowedKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[],
) {
  const keys = Object.keys(value)
  return (
    required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key))
  )
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function opaqueID(value: unknown, prefix: string): value is string {
  return typeof value === "string" && new RegExp(`^${prefix}_[0-9A-Za-z]{26}$`).test(value)
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function lowercaseFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function integrity(detail: string) {
  return Effect.fail(new IntegrityError({ detail }))
}
