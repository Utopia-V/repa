import { and, asc, eq, ne, sql } from "drizzle-orm"
import { Effect } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Course } from "../course"
import { LearnerGoal } from "../learner-goal"
import { LearningFrontier } from "../learning-frontier"
import { Occurrence } from "../learning-command/occurrence"
import { AdmittedLearnerOccurrenceTable } from "../learning-command/occurrence.sql"
import {
  admitPhysicalInvocation,
  appliedMutation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  invocationConflict,
  lookupPhysicalInvocation,
  occurrenceAvailable,
  requirePhysicalSettlement,
  requireSettlementMetadata,
  settlePhysicalInvocation,
} from "../learning-command/physical"
import type { InvocationEnvelope, SettlementMetadata } from "../learning-command/physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import type { Transaction } from "../learning-command/transaction"
import { TurnLifecycle, type ValidatedAgentActionRegistration } from "../turn/turn"
import { Wildcard } from "../util/wildcard"
import type { PermissionV1 } from "../v1/permission"
import type { PartID } from "../v1/session"
import {
  LearnerGoalCapabilityIssueV2Table,
  LearnerGoalCapabilitySettlementV2Table,
  LearnerGoalCommitSealTable,
  LearnerGoalConditionTable,
  LearnerGoalCourseScopeTable,
  LearnerGoalDispositionV2Table,
  LearnerGoalEffectOperationTable,
  LearnerGoalEffectTable,
  LearnerGoalRevisionTable,
  LearnerGoalStateTable,
  LearnerGoalSupersessionTable,
  LearnerGoalTable,
} from "./sql"
import { TIME_ZONE_RELEASE_ID, resolveTargetIntentV2, type SourceZoneV2 } from "./time-zone"
import { createEffectID, createGoalID, createRevisionID } from "./schema"
import type {
  AgentActionProvenanceV2,
  AgentInvocationV2,
  AppliedSettlementV2,
  AlreadyAppliedSettlementV2,
  CandidateV2,
  CanonicalCommandV2,
  CanonicalFieldIntentV2,
  CanonicalOperationV2,
  CanonicalPatchV2,
  CapabilityOutcomeV2,
  CommandV2,
  EffectID,
  GoalID,
  GoalPatchV2,
  MaterializedChangeSetV2,
  MaterializedOperationV2,
  NoChangeSettlementV2,
  NonSupersededDisposition,
  OperationResultV2,
  Revision,
  RevisionID,
  RevisionSnapshotV1,
  RevisionSnapshotV2,
  ScopeIntentV2,
  SemanticAddressV2,
  SemanticTerminalV2,
  StoredCourseMembershipV2,
  StoredScope,
  StoredScopeV2,
  TargetIntentV2,
  TargetValueV2,
  UpdateDisposition,
  VersionedRevisionSnapshot,
} from "./schema"

export const UPDATE_LEARNER_GOALS_CAPABILITY = "update_learner_goals"
export const UPDATE_LEARNER_GOALS_VERSION = 2

const identity = {
  name: UPDATE_LEARNER_GOALS_CAPABILITY,
  version: UPDATE_LEARNER_GOALS_VERSION,
} as const

export type GoalV2PolicyInput = Readonly<{
  partID: PartID
  outcome: "policy_allow" | "policy_deny"
  policyBasis: Readonly<Record<string, unknown>>
  time: number
  order: number
}>

export type GoalV2PromptIssueInput = Readonly<{
  partID: PartID
  requestID: PermissionV1.ID
  policyBasis: Readonly<Record<string, unknown>>
  shownScope: Readonly<Record<string, unknown>>
  time: number
  order: number
}>

export type GoalV2PromptSettlementInput = Readonly<{
  partID: PartID
  requestID: PermissionV1.ID
  outcome: "prompted_allow" | "prompted_deny" | "prompted_correct" | "prompted_cancel"
  reply: Readonly<Record<string, unknown>>
  time: number
  order: number
}>

export type GoalInvocationVersion =
  | Readonly<{
      version: 1
      disposition: "legacy_v1"
      status: "admitted" | "applied" | "already_applied" | "no_change" | "error"
      settlement: unknown
    }>
  | Readonly<{
      version: 2
      disposition: "semantic_terminal_v2" | "candidate_v2" | "physical_no_effect"
      status: "admitted" | "applied" | "already_applied" | "no_change" | "error"
      settlement: unknown
      candidate?: CandidateV2
      semanticTerminal?: SemanticTerminalV2
      capabilityOutcome?: CapabilityOutcomeV2
      permissionRequestID?: PermissionV1.ID
    }>

export function canonicalizeCommandV2(input: CommandV2): CanonicalCommandV2 {
  if (!closedCommandV2(input)) throw new LearnerGoal.InvalidCommandError({ reason: "validation_error" })
  const command = {
    operations: input.operations.map((operation): CanonicalOperationV2 => {
      if (operation.type === "create") {
        return {
          type: "create",
          outcome: normalizeText(operation.outcome),
          conditions: canonicalConditions(operation.conditions ?? []),
          scope: canonicalScope(operation.scope ?? { type: "learner_home" }),
          target: canonicalTarget(operation.target ?? { type: "absent" }),
          disposition: operation.disposition ?? "active",
        }
      }
      if (operation.type === "update") {
        return {
          type: "update",
          goalID: operation.goalID,
          headRevisionID: operation.headRevisionID,
          patch: canonicalPatch(operation.patch),
        }
      }
      return {
        type: "replace",
        goalID: operation.goalID,
        headRevisionID: operation.headRevisionID,
        patch: canonicalPatch(operation.patch ?? {}),
        target:
          operation.target.type === "existing"
            ? operation.target
            : {
                type: "new",
                outcome: normalizeText(operation.target.outcome),
                conditions: canonicalConditions(operation.target.conditions ?? []),
                scope: canonicalScope(operation.target.scope ?? { type: "learner_home" }),
                target: canonicalTarget(operation.target.target ?? { type: "absent" }),
                disposition: operation.target.disposition ?? "active",
              },
      }
    }),
  }
  if (
    command.operations.some((operation) => {
      if (operation.type === "create") {
        return operation.outcome.length === 0 || bytes(operation.outcome) > LearnerGoal.MAX_OUTCOME_BYTES
      }
      if (operation.type === "update") {
        return (
          operation.patch.outcome.type === "set" &&
          (operation.patch.outcome.value.length === 0 ||
            bytes(operation.patch.outcome.value) > LearnerGoal.MAX_OUTCOME_BYTES)
        )
      }
      return (
        (operation.patch.outcome.type === "set" &&
          (operation.patch.outcome.value.length === 0 ||
            bytes(operation.patch.outcome.value) > LearnerGoal.MAX_OUTCOME_BYTES)) ||
        (operation.target.type === "new" &&
          (operation.target.outcome.length === 0 || bytes(operation.target.outcome) > LearnerGoal.MAX_OUTCOME_BYTES))
      )
    }) ||
    bytes(JSON.stringify(command)) > LearnerGoal.MAX_AGGREGATE_BYTES
  ) {
    throw new LearnerGoal.InvalidCommandError({ reason: "capacity_exceeded" })
  }
  return command
}

export function commandFingerprintV2(command: CanonicalCommandV2) {
  return fingerprint(command)
}

export function reserveLearnerGoalsV2(
  tx: Transaction,
  input: AgentInvocationV2 & Readonly<{ settlement: SettlementMetadata }>,
) {
  return Effect.gen(function* () {
    const command = yield* canonicalCommandEffect(input.command)
    const commandFingerprint = commandFingerprintV2(command)
    const physicalFingerprint = fingerprint({ identity, envelope: input.envelope, command })
    const existing = yield* findPhysicalInvocation(tx, input, physicalFingerprint, identity)
    if (existing) {
      const disposition = yield* goalDisposition(tx, existing.part_id)
      if (existing.status === "admitted") {
        if (!disposition || disposition.disposition !== "candidate_v2") {
          return yield* integrity("Only a complete Goal V2 candidate may remain admitted")
        }
        return { type: "admitted" as const, candidate: candidateInfo(disposition) }
      }
      return {
        type: "replay" as const,
        settlement: requirePhysicalSettlement(existing),
        ...(disposition?.disposition === "candidate_v2" ? { candidate: candidateInfo(disposition) } : {}),
        ...(disposition?.disposition === "semantic_terminal_v2"
          ? { semanticTerminal: semanticTerminalInfo(disposition) }
          : {}),
      }
    }

    yield* requireV2Envelope(input.envelope)
    const registration = registrationFromEnvelope(input.envelope)
    yield* TurnLifecycle.validateLearningCommandRegistration(tx, registration).pipe(
      Effect.mapError((error) => new LearnerGoal.IntegrityError({ detail: error.reason })),
    )
    yield* requireSettlementMetadata(input.envelope.timeAdmitted, input.settlement)
    const address = semanticAddress(input.envelope.occurrenceID)
    const addressFingerprint = fingerprint(address)
    const semantic = yield* resolveSemanticV2(tx, input.envelope.occurrenceID, commandFingerprint)
    if (semantic.type !== "new") {
      const semanticTerminal = {
        kind: "semantic_terminal_v2",
        outcome: semantic.type,
        canonicalCommand: command,
        commandFingerprint,
        semanticAddress: address,
        semanticAddressFingerprint: addressFingerprint,
        incomingIntentFingerprint: commandFingerprint,
        existingEffectID: semantic.effect.id,
        existingIntentFingerprint: semantic.effect.semantic_fingerprint,
      } satisfies SemanticTerminalV2
      yield* admitPhysicalInvocation(tx, {
        envelope: input.envelope,
        fingerprint: physicalFingerprint,
        command: identity,
      })
      yield* tx
        .insert(LearnerGoalDispositionV2Table)
        .values({
          invocation_part_id: input.envelope.partID,
          disposition: "semantic_terminal_v2",
          command_fingerprint: commandFingerprint,
          canonical_command: command,
          semantic_address: address,
          semantic_address_fingerprint: addressFingerprint,
          incoming_intent_fingerprint: commandFingerprint,
          semantic_outcome: semantic.type,
          existing_effect_id: semantic.effect.id,
          existing_intent_fingerprint: semantic.effect.semantic_fingerprint,
          time_disposed: input.envelope.timeAdmitted,
        })
        .run()
        .pipe(Effect.orDie)
      if (semantic.type === "already_applied") {
        const settlement = yield* settleAlreadyAppliedV2(
          tx,
          input.envelope.partID,
          semantic.effect.id,
          input.settlement,
        )
        return { type: "settled" as const, settlement, semanticTerminal }
      }
      const settlement = errorSettlement("semantic_conflict", input.settlement, { effectID: semantic.effect.id })
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement, semanticTerminal }
    }

    const trusted = yield* TurnLifecycle.validateAgentActionRegistration(tx, registration).pipe(
      Effect.mapError((error) => new LearnerGoal.IntegrityError({ detail: error.reason })),
    )
    yield* admitPhysicalInvocation(tx, {
      envelope: input.envelope,
      fingerprint: physicalFingerprint,
      command: identity,
    })
    if (!hasGoalWriteMembership(trusted)) {
      const settlement = errorSettlement("permission_rejected", input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const occupied = yield* appliedMutation(tx, input.envelope.assistantMessageID)
    if (occupied) {
      const settlement = errorSettlement("context_refresh_required", input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const materialized = yield* materializeChangeSetV2(tx, input.envelope, command).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (materialized.type === "failure") {
      const settlement = goalErrorSettlement(materialized.error, input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const agentAction = yield* agentActionProvenance(input.envelope, trusted)
    const agentActionFingerprint = fingerprint({ agentAction, commandFingerprint, materialized: materialized.value })
    const candidate = {
      kind: "candidate_v2",
      commandFingerprint,
      canonicalCommand: command,
      agentActionFingerprint,
      agentAction,
      materialized: materialized.value,
    } satisfies CandidateV2
    yield* tx
      .insert(LearnerGoalDispositionV2Table)
      .values({
        invocation_part_id: input.envelope.partID,
        disposition: "candidate_v2",
        command_fingerprint: commandFingerprint,
        canonical_command: command,
        semantic_address: address,
        semantic_address_fingerprint: addressFingerprint,
        incoming_intent_fingerprint: commandFingerprint,
        agent_action_fingerprint: agentActionFingerprint,
        agent_action_provenance: agentAction,
        materialized_snapshot: materialized.value,
        time_disposed: input.envelope.timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)
    return { type: "admitted" as const, candidate }
  })
}

export function settleLearnerGoalPolicyV2(tx: Transaction, input: GoalV2PolicyInput) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    const policyFingerprint = fingerprint(input.policyBasis)
    const existing = yield* capabilitySettlement(tx, input.partID)
    if (existing) {
      if (
        existing.outcome !== input.outcome ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint ||
        existing.policy_fingerprint !== policyFingerprint
      ) {
        return yield* integrity("Goal V2 capability policy settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    if (yield* capabilityIssue(tx, input.partID)) {
      return yield* integrity("A prompted Goal capability cannot become a policy settlement")
    }
    yield* tx
      .insert(LearnerGoalCapabilitySettlementV2Table)
      .values({
        invocation_part_id: input.partID,
        outcome: input.outcome,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        policy_basis: input.policyBasis,
        policy_fingerprint: policyFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      outcome: input.outcome,
      agentActionFingerprint: candidate.agentActionFingerprint,
      policyBasis: input.policyBasis,
      policyFingerprint,
      timeSettled: input.time,
      settlementOrder: input.order,
    }
  })
}

export function issueLearnerGoalCapabilityPromptV2(tx: Transaction, input: GoalV2PromptIssueInput) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    if (yield* capabilitySettlement(tx, input.partID)) {
      return yield* integrity("A terminal Goal capability outcome cannot issue a prompt")
    }
    const policyFingerprint = fingerprint(input.policyBasis)
    const shownScopeFingerprint = fingerprint(input.shownScope)
    const existing = yield* capabilityIssue(tx, input.partID)
    if (existing) {
      if (
        existing.permission_request_id !== input.requestID ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint ||
        existing.policy_fingerprint !== policyFingerprint ||
        existing.shown_scope_fingerprint !== shownScopeFingerprint
      ) {
        return yield* integrity("Goal V2 capability prompt issue conflicts")
      }
      return capabilityIssueInfo(existing)
    }
    yield* tx
      .insert(LearnerGoalCapabilityIssueV2Table)
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
    return {
      requestID: input.requestID,
      agentActionFingerprint: candidate.agentActionFingerprint,
      policyBasis: input.policyBasis,
      policyFingerprint,
      shownScope: input.shownScope,
      shownScopeFingerprint,
      timeIssued: input.time,
      issueOrder: input.order,
    }
  })
}

export function settleLearnerGoalPromptV2(tx: Transaction, input: GoalV2PromptSettlementInput) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    const issue = yield* capabilityIssue(tx, input.partID)
    if (
      !issue ||
      issue.permission_request_id !== input.requestID ||
      issue.agent_action_fingerprint !== candidate.agentActionFingerprint
    ) {
      return yield* integrity("Goal V2 prompt reply has no exact durable issue")
    }
    const replyFingerprint = fingerprint(input.reply)
    const existing = yield* capabilitySettlement(tx, input.partID)
    if (existing) {
      if (
        existing.outcome !== input.outcome ||
        existing.permission_request_id !== input.requestID ||
        existing.reply_fingerprint !== replyFingerprint ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint
      ) {
        return yield* integrity("Goal V2 prompt settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    yield* tx
      .insert(LearnerGoalCapabilitySettlementV2Table)
      .values({
        invocation_part_id: input.partID,
        outcome: input.outcome,
        permission_request_id: input.requestID,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        reply: input.reply,
        reply_fingerprint: replyFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      outcome: input.outcome,
      requestID: input.requestID,
      agentActionFingerprint: candidate.agentActionFingerprint,
      reply: input.reply,
      replyFingerprint,
      timeSettled: input.time,
      settlementOrder: input.order,
    }
  })
}

export function recoverLearnerGoalCapabilityV2(
  tx: Transaction,
  input: Readonly<{ partID: PartID; time: number; order: number }>,
) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    const existing = yield* capabilitySettlement(tx, input.partID)
    if (existing) return capabilitySettlementInfo(existing)
    const issue = yield* capabilityIssue(tx, input.partID)
    const outcome = issue ? ("prompted_abort" as const) : ("not_evaluated" as const)
    yield* tx
      .insert(LearnerGoalCapabilitySettlementV2Table)
      .values({
        invocation_part_id: input.partID,
        outcome,
        permission_request_id: issue?.permission_request_id ?? null,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      outcome,
      ...(issue ? { requestID: issue.permission_request_id } : {}),
      agentActionFingerprint: candidate.agentActionFingerprint,
      timeSettled: input.time,
      settlementOrder: input.order,
    }
  })
}

export function settleLearnerGoalsV2(
  tx: Transaction,
  input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* requireV2Invocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const candidate = yield* requireCandidate(tx, input.partID)
    const semantic = yield* settleSemanticRaceV2(tx, invocation, candidate, input.settlement)
    if (semantic) return semantic
    const capability = yield* capabilitySettlement(tx, input.partID)
    if (!capability || capability.agent_action_fingerprint !== candidate.agentActionFingerprint) {
      return yield* integrity("Goal V2 final settlement has no exact capability outcome")
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
    const validation = yield* revalidateMaterializedV2(tx, candidate.materialized, invocation.occurrence_id).pipe(
      Effect.map(() => ({ type: "success" as const })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (validation.type === "failure") {
      const settlement = goalErrorSettlement(validation.error, input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const results = operationResultsV2(candidate.materialized.operations)
    const acknowledgement = renderAcknowledgementV2(results)
    if (candidate.materialized.operations.every((operation) => operation.result === "no_change")) {
      const settlement = {
        outcome: "no_change",
        goalKind: "learner_goal",
        schemaVersion: 2,
        operations: results,
        acknowledgementTitle: acknowledgement.title,
        acknowledgementBody: acknowledgement.body,
        settlementTime: input.settlement.time,
        settlementOrder: input.settlement.order,
      } satisfies NoChangeSettlementV2
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const settlement = yield* applyMaterializedV2(tx, {
      invocation,
      envelope,
      candidate,
      results,
      acknowledgement,
      settlement: input.settlement,
    })
    return { type: "settled" as const, settlement }
  })
}

export function recoverLearnerGoalsV2(
  tx: Transaction,
  input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* requireV2Invocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const candidate = yield* requireCandidate(tx, input.partID)
    const capability = yield* recoverLearnerGoalCapabilityV2(tx, {
      partID: input.partID,
      time: input.settlement.time,
      order: input.settlement.order,
    })
    const semantic = yield* settleSemanticRaceV2(tx, invocation, candidate, input.settlement)
    if (semantic) return semantic
    const settlement = errorSettlement(
      capability.outcome === "policy_allow" || capability.outcome === "prompted_allow"
        ? "interrupted"
        : capabilityErrorCode(capability.outcome),
      input.settlement,
    )
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function readLearnerGoalInvocationVersion(
  tx: Transaction,
  input: Readonly<{
    partID: PartID
    assistantMessageID: InvocationEnvelope["assistantMessageID"]
    providerCallID: string
  }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* lookupPhysicalInvocation(tx, input)
    if (!invocation) return undefined
    if (invocation.command_name !== UPDATE_LEARNER_GOALS_CAPABILITY) return yield* invocationConflict(input)
    const disposition = yield* goalDisposition(tx, invocation.part_id)
    const state = {
      status: invocation.status,
      settlement: invocation.settlement,
      timeAdmitted: invocation.time_admitted,
    }
    if (invocation.command_version === 1) {
      if (!disposition || disposition.disposition !== "legacy_v1") {
        return yield* integrity("Historical Goal V1 invocation lost its legacy disposition")
      }
      return { ...state, version: 1 as const, disposition: "legacy_v1" as const }
    }
    if (invocation.command_version !== 2) {
      return yield* integrity("Goal invocation has an unsupported command version")
    }
    if (!disposition) {
      if (invocation.status === "admitted" || invocation.status !== "error") {
        return yield* integrity("Goal V2 invocation lost its required disposition")
      }
      return { ...state, version: 2 as const, disposition: "physical_no_effect" as const }
    }
    if (disposition.disposition === "candidate_v2") {
      const capability = yield* capabilitySettlement(tx, invocation.part_id)
      const issue = yield* capabilityIssue(tx, invocation.part_id)
      return {
        ...state,
        version: 2 as const,
        disposition: "candidate_v2" as const,
        candidate: candidateInfo(disposition),
        ...(capability ? { capabilityOutcome: capability.outcome } : {}),
        ...(issue ? { permissionRequestID: issue.permission_request_id } : {}),
      }
    }
    if (disposition.disposition !== "semantic_terminal_v2") {
      return yield* integrity("Goal V2 invocation has an incompatible disposition")
    }
    return {
      ...state,
      version: 2 as const,
      disposition: "semantic_terminal_v2" as const,
      semanticTerminal: semanticTerminalInfo(disposition),
    }
  })
}

function canonicalCommandEffect(input: CommandV2) {
  return Effect.try({
    try: () => canonicalizeCommandV2(input),
    catch: (error) =>
      error instanceof LearnerGoal.InvalidCommandError
        ? error
        : new LearnerGoal.InvalidCommandError({ reason: "validation_error" }),
  })
}

function requireV2Envelope(envelope: InvocationEnvelope) {
  return envelope.capabilityIdentity === UPDATE_LEARNER_GOALS_CAPABILITY &&
    envelope.capabilityVersion === UPDATE_LEARNER_GOALS_VERSION &&
    envelope.authorizationBasis === "agent_action"
    ? Effect.void
    : integrity("Goal V2 envelope has an incompatible capability or provenance basis")
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

function semanticAddress(occurrenceID: InvocationEnvelope["occurrenceID"]): SemanticAddressV2 {
  return { occurrenceID, slot: "learner_goal_change_set" }
}

function goalDisposition(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerGoalDispositionV2Table)
    .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function candidateInfo(row: typeof LearnerGoalDispositionV2Table.$inferSelect): CandidateV2 {
  if (
    row.disposition !== "candidate_v2" ||
    !row.canonical_command ||
    !row.agent_action_fingerprint ||
    !row.agent_action_provenance ||
    !row.materialized_snapshot
  ) {
    throw new Error("Goal V2 candidate row is structurally incomplete")
  }
  return {
    kind: "candidate_v2",
    commandFingerprint: row.command_fingerprint,
    canonicalCommand: row.canonical_command,
    agentActionFingerprint: row.agent_action_fingerprint,
    agentAction: row.agent_action_provenance,
    materialized: row.materialized_snapshot,
  }
}

function semanticTerminalInfo(row: typeof LearnerGoalDispositionV2Table.$inferSelect): SemanticTerminalV2 {
  if (
    row.disposition !== "semantic_terminal_v2" ||
    !row.canonical_command ||
    !row.semantic_address ||
    !row.semantic_address_fingerprint ||
    !row.incoming_intent_fingerprint ||
    !row.semantic_outcome ||
    !row.existing_effect_id ||
    !row.existing_intent_fingerprint
  ) {
    throw new Error("Goal V2 semantic-terminal row is structurally incomplete")
  }
  return {
    kind: "semantic_terminal_v2",
    outcome: row.semantic_outcome,
    canonicalCommand: row.canonical_command,
    commandFingerprint: row.command_fingerprint,
    semanticAddress: row.semantic_address,
    semanticAddressFingerprint: row.semantic_address_fingerprint,
    incomingIntentFingerprint: row.incoming_intent_fingerprint,
    existingEffectID: row.existing_effect_id,
    existingIntentFingerprint: row.existing_intent_fingerprint,
  }
}

function requireCandidate(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* requireV2Invocation(tx, partID)
    if (invocation.status !== "admitted") return yield* integrity("Goal V2 capability requires an admitted candidate")
    const row = yield* goalDisposition(tx, partID)
    if (!row || row.disposition !== "candidate_v2") {
      return yield* integrity("Goal V2 invocation has no candidate disposition")
    }
    return candidateInfo(row)
  })
}

function requireV2Invocation(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !invocation ||
      invocation.command_name !== UPDATE_LEARNER_GOALS_CAPABILITY ||
      invocation.command_version !== UPDATE_LEARNER_GOALS_VERSION
    ) {
      return yield* integrity("Goal V2 invocation is unavailable")
    }
    return invocation
  })
}

function capabilityIssue(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerGoalCapabilityIssueV2Table)
    .where(eq(LearnerGoalCapabilityIssueV2Table.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilitySettlement(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerGoalCapabilitySettlementV2Table)
    .where(eq(LearnerGoalCapabilitySettlementV2Table.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilityIssueInfo(row: typeof LearnerGoalCapabilityIssueV2Table.$inferSelect) {
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

function capabilitySettlementInfo(row: typeof LearnerGoalCapabilitySettlementV2Table.$inferSelect) {
  return {
    outcome: row.outcome,
    ...(row.permission_request_id ? { requestID: row.permission_request_id } : {}),
    agentActionFingerprint: row.agent_action_fingerprint,
    ...(row.policy_basis ? { policyBasis: row.policy_basis } : {}),
    ...(row.policy_fingerprint ? { policyFingerprint: row.policy_fingerprint } : {}),
    ...(row.reply ? { reply: row.reply } : {}),
    ...(row.reply_fingerprint ? { replyFingerprint: row.reply_fingerprint } : {}),
    timeSettled: row.time_settled,
    settlementOrder: row.settlement_order,
  }
}

function resolveSemanticV2(
  tx: Transaction,
  occurrenceID: InvocationEnvelope["occurrenceID"],
  intentFingerprint: string,
) {
  return Effect.gen(function* () {
    const effect = yield* committedEffectByOccurrence(tx, occurrenceID)
    if (!effect) return { type: "new" as const }
    return effect.schema_version === 2 && effect.semantic_fingerprint === intentFingerprint
      ? { type: "already_applied" as const, effect }
      : { type: "semantic_conflict" as const, effect }
  })
}

function committedEffectByOccurrence(tx: Transaction, occurrenceID: InvocationEnvelope["occurrenceID"]) {
  return tx
    .select({
      id: LearnerGoalEffectTable.id,
      schema_version: LearnerGoalEffectTable.schema_version,
      semantic_fingerprint: LearnerGoalEffectTable.semantic_fingerprint,
      operation_count: LearnerGoalEffectTable.operation_count,
      acknowledgement_title: LearnerGoalEffectTable.acknowledgement_title,
      acknowledgement_body: LearnerGoalEffectTable.acknowledgement_body,
      frontier_sequence: LearnerGoalEffectTable.frontier_sequence,
      time_committed: LearnerGoalEffectTable.time_committed,
      commit_order: LearnerGoalEffectTable.commit_order,
      receipt_id: LearningCommandReceiptTable.id,
    })
    .from(LearnerGoalEffectTable)
    .innerJoin(LearnerGoalCommitSealTable, eq(LearnerGoalCommitSealTable.effect_id, LearnerGoalEffectTable.id))
    .innerJoin(LearningCommandReceiptTable, eq(LearningCommandReceiptTable.id, LearnerGoalCommitSealTable.receipt_id))
    .innerJoin(
      LearningCommandInvocationTable,
      and(
        eq(LearningCommandInvocationTable.part_id, LearnerGoalCommitSealTable.invocation_part_id),
        eq(LearningCommandInvocationTable.receipt_id, LearningCommandReceiptTable.id),
        eq(LearningCommandInvocationTable.status, "applied"),
      ),
    )
    .where(eq(LearnerGoalEffectTable.occurrence_id, occurrenceID))
    .get()
    .pipe(Effect.orDie)
}

function settleSemanticRaceV2(
  tx: Transaction,
  invocation: typeof LearningCommandInvocationTable.$inferSelect,
  candidate: CandidateV2,
  settlement: SettlementMetadata,
) {
  return Effect.gen(function* () {
    const semantic = yield* resolveSemanticV2(tx, invocation.occurrence_id, candidate.commandFingerprint)
    if (semantic.type === "new") return undefined
    if (semantic.type === "already_applied") {
      const result = yield* settleAlreadyAppliedV2(tx, invocation.part_id, semantic.effect.id, settlement)
      return { type: "settled" as const, settlement: result }
    }
    const result = errorSettlement("semantic_conflict", settlement, { effectID: semantic.effect.id })
    yield* settlePhysicalInvocation(tx, invocation.part_id, result)
    return { type: "settled" as const, settlement: result }
  })
}

function settleAlreadyAppliedV2(tx: Transaction, partID: PartID, effectID: EffectID, metadata: SettlementMetadata) {
  return Effect.gen(function* () {
    const applied = yield* readAppliedEffectV2(tx, effectID)
    const currentHeads = yield* Effect.forEach(
      [...new Set(applied.operations.map((operation) => operation.goalID))],
      (goalID) =>
        LearnerGoal.readCurrent(tx, goalID, metadata.time).pipe(
          Effect.flatMap((goal) =>
            goal
              ? Effect.succeed({ goalID, revisionID: goal.head.id, version: goal.head.version })
              : integrity(`Applied Goal ${goalID} has no current head`),
          ),
        ),
    )
    const settlement = {
      ...applied,
      outcome: "already_applied",
      currentHeads,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies AlreadyAppliedSettlementV2
    yield* settlePhysicalInvocation(tx, partID, settlement)
    return settlement
  })
}

function readAppliedEffectV2(
  tx: Transaction,
  effectID: EffectID,
): Effect.Effect<AppliedSettlementV2, LearnerGoal.IntegrityError> {
  return Effect.gen(function* () {
    const effect = yield* tx
      .select({
        effect: LearnerGoalEffectTable,
        receiptID: LearningCommandReceiptTable.id,
      })
      .from(LearnerGoalEffectTable)
      .innerJoin(LearnerGoalCommitSealTable, eq(LearnerGoalCommitSealTable.effect_id, LearnerGoalEffectTable.id))
      .innerJoin(LearningCommandReceiptTable, eq(LearningCommandReceiptTable.id, LearnerGoalCommitSealTable.receipt_id))
      .innerJoin(
        LearningCommandInvocationTable,
        and(
          eq(LearningCommandInvocationTable.part_id, LearnerGoalCommitSealTable.invocation_part_id),
          eq(LearningCommandInvocationTable.receipt_id, LearningCommandReceiptTable.id),
          eq(LearningCommandInvocationTable.status, "applied"),
        ),
      )
      .where(eq(LearnerGoalEffectTable.id, effectID))
      .get()
      .pipe(Effect.orDie)
    if (!effect || effect.effect.schema_version !== 2 || effect.effect.authorization_basis !== "agent_action") {
      return yield* integrity(`Goal V2 effect ${effectID} has no immutable applied projection`)
    }
    const rows = yield* tx
      .select()
      .from(LearnerGoalEffectOperationTable)
      .where(eq(LearnerGoalEffectOperationTable.effect_id, effectID))
      .orderBy(asc(LearnerGoalEffectOperationTable.ordinal))
      .all()
      .pipe(Effect.orDie)
    if (rows.length !== effect.effect.operation_count || rows.some((row) => row.schema_version !== 2)) {
      return yield* integrity(`Goal V2 effect ${effectID} has an incomplete operation projection`)
    }
    return {
      outcome: "applied",
      goalKind: "learner_goal",
      schemaVersion: 2,
      receiptID: effect.receiptID,
      effectID,
      provenance: "agent_action",
      operations: rows.map(operationResultRowV2),
      acknowledgementTitle: effect.effect.acknowledgement_title,
      acknowledgementBody: effect.effect.acknowledgement_body,
      frontierSequence: effect.effect.frontier_sequence,
      settlementTime: effect.effect.time_committed,
      settlementOrder: effect.effect.commit_order,
    }
  })
}

function operationResultRowV2(row: typeof LearnerGoalEffectOperationTable.$inferSelect): OperationResultV2 {
  return {
    schemaVersion: 2,
    ordinal: row.ordinal,
    operation: row.operation_kind,
    result: row.result_kind,
    goalID: row.goal_id,
    revisionID: row.revision_id,
    version: row.version,
    disposition: row.disposition,
    meaning: row.meaning as OperationResultV2["meaning"],
    ...(row.replacement_target_kind &&
    row.replacement_target_goal_id &&
    row.replacement_target_revision_id &&
    row.replacement_target_version
      ? {
          replacementTarget: {
            type: row.replacement_target_kind,
            goalID: row.replacement_target_goal_id,
            revisionID: row.replacement_target_revision_id,
            version: row.replacement_target_version,
          },
        }
      : {}),
  }
}

function capabilityErrorCode(outcome: CapabilityOutcomeV2) {
  if (outcome === "policy_deny" || outcome === "prompted_deny") return "permission_rejected" as const
  if (outcome === "prompted_correct") return "permission_corrected" as const
  if (outcome === "prompted_cancel") return "cancelled" as const
  return "interrupted" as const
}

function invocationEnvelope(invocation: typeof LearningCommandInvocationTable.$inferSelect): InvocationEnvelope {
  if (!invocation.turn_id || !invocation.input_id) throw new Error("Goal V2 invocation lost its Turn identity")
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

function agentActionProvenance(
  envelope: InvocationEnvelope,
  trusted: ValidatedAgentActionRegistration,
): Effect.Effect<AgentActionProvenanceV2, LearnerGoal.IntegrityError> {
  return Effect.gen(function* () {
    if (
      trusted.occurrenceID !== envelope.occurrenceID ||
      trusted.depth !== trusted.lineage.length ||
      (trusted.admissionKind === "learner" && (trusted.depth !== 0 || trusted.lineage.length !== 0)) ||
      (trusted.admissionKind === "delegated_task" && (trusted.depth <= 0 || trusted.lineage.length === 0))
    ) {
      return yield* integrity("Goal V2 Agent action has no exact root-or-delegated Turn lineage")
    }
    const common = {
      schemaVersion: 1 as const,
      occurrenceID: envelope.occurrenceID,
      causalRootOccurrenceID: trusted.occurrenceID,
      sessionID: envelope.sessionID,
      turnID: envelope.turnID,
      inputID: envelope.inputID,
      assistantMessageID: envelope.assistantMessageID,
      invocationPartID: envelope.partID,
      providerCallID: envelope.providerCallID,
      emissionOrdinal: envelope.emissionOrdinal,
      capabilityIdentity: UPDATE_LEARNER_GOALS_CAPABILITY as "update_learner_goals",
      capabilityVersion: UPDATE_LEARNER_GOALS_VERSION as 2,
    }
    if (trusted.admissionKind === "learner") return { ...common, kind: "root" as const, lineage: [] }
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
      return yield* integrity("Goal V2 delegated Agent action has no exact effective capability")
    }
    return {
      ...common,
      kind: "delegated" as const,
      lineage,
      effectiveDelegatedCapability: {
        identity: UPDATE_LEARNER_GOALS_CAPABILITY,
        version: UPDATE_LEARNER_GOALS_VERSION,
        projectionVersion: 2,
        fingerprint: effective.delegatedCapabilityFingerprint,
      },
    }
  })
}

function hasGoalWriteMembership(trusted: ValidatedAgentActionRegistration) {
  if (trusted.admissionKind === "learner") return true
  const effective = trusted.lineage.at(-1)?.delegatedCapability
  if (!isDelegatedCapabilityProjection(effective)) return false
  return effective.explicit.some(
    (value) =>
      isRecord(value) &&
      value.action === "allow" &&
      typeof value.permission === "string" &&
      typeof value.pattern === "string" &&
      Wildcard.matchIdentifier(UPDATE_LEARNER_GOALS_CAPABILITY, value.permission) &&
      Wildcard.match(LearnerGoal.PERMISSION_PATTERN, value.pattern),
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

function goalErrorSettlement(error: unknown, metadata: SettlementMetadata) {
  if (!(error instanceof LearnerGoal.InvalidCommandError)) return errorSettlement("validation_error", metadata)
  if (error.reason === "source_unavailable") return errorSettlement("source_unavailable", metadata)
  if (error.reason === "temporal_context_unavailable") return errorSettlement("temporal_context_unavailable", metadata)
  if (error.reason === "capacity_exceeded") return errorSettlement("capacity_exceeded", metadata)
  if (error.reason === "stale" || error.reason === "relation_conflict") return errorSettlement("stale", metadata)
  if (error.reason === "inactive") return errorSettlement("inactive", metadata)
  return errorSettlement("validation_error", metadata)
}

function integrity(detail: string) {
  return Effect.fail(new LearnerGoal.IntegrityError({ detail }))
}

function materializeChangeSetV2(
  tx: Transaction,
  envelope: InvocationEnvelope,
  command: CanonicalCommandV2,
): Effect.Effect<MaterializedChangeSetV2, LearnerGoal.InvalidCommandError | LearnerGoal.IntegrityError> {
  return Effect.gen(function* () {
    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, envelope.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (!occurrence?.source_order || !occurrence.source_temporal_state) return yield* invalid("validation_error")
    const sourceTemporalContext: SourceZoneV2 =
      occurrence.source_temporal_state === "resolved" &&
      occurrence.source_timezone &&
      occurrence.source_utc_offset_minutes !== null
        ? {
            state: "resolved",
            timeZone: occurrence.source_timezone,
            utcOffsetMinutes: occurrence.source_utc_offset_minutes,
          }
        : { state: "unavailable", reason: "timezone_unavailable" }
    yield* tx
      .insert(LearnerGoalStateTable)
      .values({ singleton: 1, revision_sequence: 0 })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    const state = yield* tx
      .select()
      .from(LearnerGoalStateTable)
      .where(eq(LearnerGoalStateTable.singleton, 1))
      .get()
      .pipe(Effect.orDie)
    if (!state) return yield* integrity("Goal state singleton is unavailable")
    const current = yield* allCurrentGoals(tx, envelope.timeAdmitted)
    const heads = new Map(current.map((goal) => [goal.goalID, goal]))
    const consumed = new Set<GoalID>()
    const sharedFrontier = yield* LearningFrontier.read(tx)
    const consumedFrontiers: { sequence: number; time: number }[] = [sharedFrontier]
    const operations: MaterializedOperationV2[] = []
    const proofTimes: number[] = []

    for (const [ordinal, operation] of command.operations.entries()) {
      if (operation.type === "create") {
        const after = yield* initialSnapshotV2(tx, operation, sourceTemporalContext)
        proofTimes.push(...boundCourseTimes(after.scope))
        operations.push({ ordinal, operation: "create", result: "changed", after })
        continue
      }
      const goal = heads.get(operation.goalID)
      if (!goal || goal.head.id !== operation.headRevisionID || consumed.has(operation.goalID)) {
        return yield* invalid("stale")
      }
      consumed.add(operation.goalID)
      const before = snapshotFromRevision(goal.head)
      consumedFrontiers.push({ sequence: goal.head.frontierSequence, time: goal.head.timeCommitted })
      if (operation.type === "update") {
        const after = yield* successorSnapshotV2(tx, before, operation.patch, sourceTemporalContext)
        proofTimes.push(...boundCourseTimes(after.scope))
        const result = before.schemaVersion === 2 && equalSnapshotMeaning(before, after) ? "no_change" : "changed"
        operations.push({
          ordinal,
          operation: "update",
          result,
          before,
          after: result === "no_change" ? before : after,
        })
        continue
      }
      const target = operation.target.type === "existing" ? heads.get(operation.target.goalID) : undefined
      if (
        operation.target.type === "existing" &&
        (!target || target.goalID === goal.goalID || target.head.id !== operation.target.headRevisionID)
      ) {
        return yield* invalid("stale")
      }
      if (target) consumedFrontiers.push({ sequence: target.head.frontierSequence, time: target.head.timeCommitted })
      const replacementAfter =
        operation.target.type === "new"
          ? yield* initialSnapshotV2(tx, operation.target, sourceTemporalContext)
          : snapshotFromRevision(target!.head)
      if (replacementAfter.schemaVersion === 2) proofTimes.push(...boundCourseTimes(replacementAfter.scope))
      const patched = yield* successorSnapshotV2(tx, before, operation.patch, sourceTemporalContext)
      const after: RevisionSnapshotV2 = {
        ...patched,
        disposition: {
          type: "superseded",
          targetGoalID: replacementAfter.goalID,
          targetRevisionID: replacementAfter.revisionID,
        },
      }
      proofTimes.push(...boundCourseTimes(after.scope))
      operations.push({
        ordinal,
        operation: "replace",
        result: "changed",
        before,
        after,
        replacementTarget: {
          type: operation.target.type,
          ...(target ? { before: snapshotFromRevision(target.head) } : {}),
          after: replacementAfter,
        },
      })
    }
    yield* validateProjectedRelationsV2(current, operations)
    return {
      schemaVersion: 2,
      canonicalCommand: command,
      operations,
      sourceTemporalContext,
      revisionSequenceBefore: state.revision_sequence,
      consumedFrontiers,
      timeFloor: Math.max(
        occurrence.time_admitted,
        ...consumedFrontiers.map((frontier) => frontier.time),
        ...proofTimes,
      ),
    }
  })
}

function initialSnapshotV2(
  tx: Transaction,
  input: Readonly<{
    outcome: string
    conditions: readonly string[]
    scope: ScopeIntentV2
    target: TargetIntentV2
    disposition: NonSupersededDisposition
  }>,
  source: SourceZoneV2,
) {
  return Effect.gen(function* () {
    const scope = yield* resolveScopeV2(tx, input.scope)
    return {
      schemaVersion: 2,
      revisionID: createRevisionID(),
      goalID: createGoalID(),
      version: 1,
      outcome: input.outcome,
      conditions: input.conditions,
      scope,
      target: yield* resolveTargetV2(input.target, source),
      disposition: { type: input.disposition },
    } satisfies RevisionSnapshotV2
  })
}

function successorSnapshotV2(
  tx: Transaction,
  before: VersionedRevisionSnapshot,
  patch: CanonicalPatchV2,
  source: SourceZoneV2,
) {
  return Effect.gen(function* () {
    const scope =
      patch.scope.type === "carry"
        ? carryScopeV2(before.scope, before.revisionID)
        : yield* resolveScopeV2(tx, patch.scope.value, before)
    const target =
      patch.target.type === "carry"
        ? yield* carryTargetV2(tx, before)
        : yield* resolveTargetV2(patch.target.value, source)
    return {
      schemaVersion: 2,
      revisionID: createRevisionID(),
      goalID: before.goalID,
      version: before.version + 1,
      outcome: patch.outcome.type === "carry" ? before.outcome : patch.outcome.value,
      conditions: patch.conditions.type === "carry" ? before.conditions : patch.conditions.value,
      scope,
      target,
      disposition: patch.disposition.type === "carry" ? before.disposition : { type: patch.disposition.value },
    } satisfies RevisionSnapshotV2
  })
}

function snapshotFromRevision(revision: Revision): VersionedRevisionSnapshot {
  const disposition: UpdateDisposition =
    revision.disposition.type === "superseded"
      ? {
          type: "superseded",
          targetGoalID: revision.disposition.targetGoalID,
          targetRevisionID: revision.disposition.targetRevisionID,
        }
      : { type: revision.disposition.type }
  const common = {
    revisionID: revision.id,
    goalID: revision.goalID,
    version: revision.version,
    outcome: revision.outcome,
    conditions: revision.conditions,
    disposition,
  }
  return revision.schemaVersion === 1
    ? { ...common, schemaVersion: 1, scope: revision.scope, target: revision.target }
    : { ...common, schemaVersion: 2, scope: revision.scope, target: revision.target }
}

function carryScopeV2(scope: StoredScope | StoredScopeV2, predecessorRevisionID: RevisionID): StoredScopeV2 {
  if (scope.type === "learner_home") return scope
  return {
    type: "courses",
    courses: scope.courses.map((course) => ({
      courseID: course.courseID,
      courseTitle: course.courseTitle,
      admission: { type: "carried", predecessorRevisionID },
      availability: course.availability,
    })),
  }
}

function resolveScopeV2(tx: Transaction, scope: ScopeIntentV2, predecessor?: VersionedRevisionSnapshot) {
  return Effect.gen(function* () {
    if (scope.type === "learner_home") return { type: "learner_home" } as const
    const previous = new Map(
      predecessor?.scope.type === "courses"
        ? predecessor.scope.courses.map(
            (course) =>
              [
                course.courseID,
                {
                  courseTitle: course.courseTitle,
                  availability: course.availability,
                },
              ] as const,
          )
        : [],
    )
    const courses = yield* Effect.forEach(scope.courseIDs, (courseID) =>
      Effect.gen(function* () {
        const carried = previous.get(courseID)
        if (carried && predecessor) {
          return {
            courseID,
            courseTitle: carried.courseTitle,
            admission: { type: "carried", predecessorRevisionID: predecessor.revisionID },
            availability: carried.availability,
          } satisfies StoredCourseMembershipV2
        }
        const owner = yield* Course.inspectPreferenceTarget(tx, courseID)
        if (owner.status !== "available") return yield* invalid("inactive")
        return {
          courseID,
          courseTitle: owner.title,
          admission: { type: "bound", courseVersion: owner.stateVersion, courseTimeUpdated: owner.timeUpdated },
          availability: { state: "available", title: owner.title },
        } satisfies StoredCourseMembershipV2
      }),
    )
    return { type: "courses", courses } as const
  })
}

function resolveTargetV2(intent: TargetIntentV2, source: SourceZoneV2) {
  return Effect.try({
    try: () => resolveTargetIntentV2(intent, source),
    catch: () =>
      intent.type !== "absent" && intent.timeZone.type === "source" && source.state === "unavailable"
        ? new LearnerGoal.InvalidCommandError({ reason: "temporal_context_unavailable" })
        : new LearnerGoal.InvalidCommandError({ reason: "validation_error" }),
  })
}

function carryTargetV2(tx: Transaction, before: VersionedRevisionSnapshot) {
  if (before.schemaVersion === 2) return Effect.succeed(before.target)
  const target = before.target
  if (target.type === "absent") return Effect.succeed({ type: "absent" } as const)
  if (target.type === "instant") {
    return Effect.succeed({
      type: "instant" as const,
      instant: target.instant,
      utcOffsetMinutes: target.utcOffsetMinutes,
      resolvedZone: { type: "fixed_offset" as const, offsetMinutes: target.utcOffsetMinutes },
    })
  }
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ releaseID: LearnerGoalRevisionTable.target_timezone_release_id })
      .from(LearnerGoalRevisionTable)
      .where(eq(LearnerGoalRevisionTable.id, before.revisionID))
      .get()
      .pipe(Effect.orDie)
    if (!row?.releaseID) return yield* integrity(`Goal V1 revision ${before.revisionID} lost its time-zone release`)
    return {
      type: "local_date" as const,
      date: target.date,
      resolvedZone: { type: "iana" as const, name: target.timeZone, releaseID: row.releaseID },
    }
  })
}

function allCurrentGoals(tx: Transaction, asOf: number) {
  return Effect.gen(function* () {
    const rows = yield* tx.select({ id: LearnerGoalTable.id }).from(LearnerGoalTable).all().pipe(Effect.orDie)
    return yield* Effect.forEach(rows, (row) =>
      LearnerGoal.readCurrent(tx, row.id, asOf).pipe(
        Effect.flatMap((goal) => (goal ? Effect.succeed(goal) : integrity(`Goal ${row.id} lost its current head`))),
      ),
    )
  })
}

function equalSnapshotMeaning(left: RevisionSnapshotV2, right: RevisionSnapshotV2) {
  return isDeepStrictEqual(
    {
      outcome: left.outcome,
      conditions: left.conditions,
      scope: scopeCourseIDs(left.scope),
      target: left.target,
      disposition: left.disposition,
    },
    {
      outcome: right.outcome,
      conditions: right.conditions,
      scope: scopeCourseIDs(right.scope),
      target: right.target,
      disposition: right.disposition,
    },
  )
}

function scopeCourseIDs(scope: StoredScope | StoredScopeV2) {
  return scope.type === "learner_home"
    ? ({ type: "learner_home" } as const)
    : ({ type: "courses", courseIDs: scope.courses.map((course) => course.courseID) } as const)
}

function boundCourseTimes(scope: StoredScopeV2) {
  return scope.type === "learner_home"
    ? []
    : scope.courses.flatMap((course) => (course.admission.type === "bound" ? [course.admission.courseTimeUpdated] : []))
}

function validateProjectedRelationsV2(
  current: readonly LearnerGoal.GoalRead[],
  operations: readonly MaterializedOperationV2[],
) {
  const projected = new Map(current.map((goal) => [goal.goalID, snapshotFromRevision(goal.head)]))
  operations.forEach((operation) => {
    if (operation.result === "changed") projected.set(operation.after.goalID, operation.after)
    if (operation.replacementTarget?.type === "new") {
      projected.set(operation.replacementTarget.after.goalID, operation.replacementTarget.after)
    }
  })
  const outgoing = new Map<GoalID, GoalID>()
  const incoming = new Map<GoalID, GoalID>()
  for (const [goalID, revision] of projected) {
    if (revision.disposition.type !== "superseded") continue
    const targetGoalID = revision.disposition.targetGoalID
    if (targetGoalID === goalID || !projected.has(targetGoalID)) return invalid("relation_conflict")
    const source = incoming.get(targetGoalID)
    if (source && source !== goalID) return invalid("relation_conflict")
    outgoing.set(goalID, targetGoalID)
    incoming.set(targetGoalID, goalID)
  }
  for (const start of outgoing.keys()) {
    const seen = new Set<GoalID>()
    let currentGoalID: GoalID | undefined = start
    while (currentGoalID) {
      if (seen.has(currentGoalID)) return invalid("relation_conflict")
      seen.add(currentGoalID)
      currentGoalID = outgoing.get(currentGoalID)
    }
  }
  return Effect.void
}

function revalidateMaterializedV2(
  tx: Transaction,
  materialized: MaterializedChangeSetV2,
  occurrenceID: InvocationEnvelope["occurrenceID"],
) {
  return Effect.gen(function* () {
    const state = yield* tx
      .select()
      .from(LearnerGoalStateTable)
      .where(eq(LearnerGoalStateTable.singleton, 1))
      .get()
      .pipe(Effect.orDie)
    if (!state || state.revision_sequence !== materialized.revisionSequenceBefore) return yield* invalid("stale")
    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (!occurrence?.source_temporal_state) return yield* invalid("stale")
    const source: SourceZoneV2 =
      occurrence.source_temporal_state === "resolved" &&
      occurrence.source_timezone &&
      occurrence.source_utc_offset_minutes !== null
        ? {
            state: "resolved",
            timeZone: occurrence.source_timezone,
            utcOffsetMinutes: occurrence.source_utc_offset_minutes,
          }
        : { state: "unavailable", reason: "timezone_unavailable" }
    if (!isDeepStrictEqual(source, materialized.sourceTemporalContext)) return yield* invalid("stale")
    const current = yield* allCurrentGoals(tx, materialized.timeFloor)
    const heads = new Map(current.map((goal) => [goal.goalID, goal]))
    for (const operation of materialized.operations) {
      if (operation.before) {
        const head = heads.get(operation.before.goalID)?.head
        if (!head || head.id !== operation.before.revisionID || head.version !== operation.before.version) {
          return yield* invalid("stale")
        }
      }
      if (operation.replacementTarget?.before) {
        const head = heads.get(operation.replacementTarget.before.goalID)?.head
        if (
          !head ||
          head.id !== operation.replacementTarget.before.revisionID ||
          head.version !== operation.replacementTarget.before.version
        ) {
          return yield* invalid("stale")
        }
      }
      if (operation.result === "changed" && operation.after.schemaVersion === 2) {
        yield* revalidateScopeV2(tx, operation.after.scope)
      }
      if (operation.replacementTarget?.type === "new" && operation.replacementTarget.after.schemaVersion === 2) {
        yield* revalidateScopeV2(tx, operation.replacementTarget.after.scope)
      }
      const intent = materialized.canonicalCommand.operations[operation.ordinal]
      if (!intent || intent.type !== operation.operation)
        return yield* integrity("Goal V2 materialization lost operation order")
      if (intent.type === "create") {
        if (!isDeepStrictEqual(yield* resolveTargetV2(intent.target, source), operation.after.target)) {
          return yield* invalid("stale")
        }
      } else if (intent.patch.target.type === "set") {
        if (!isDeepStrictEqual(yield* resolveTargetV2(intent.patch.target.value, source), operation.after.target)) {
          return yield* invalid("stale")
        }
      }
      if (intent.type === "replace" && intent.target.type === "new") {
        if (
          !operation.replacementTarget ||
          !isDeepStrictEqual(
            yield* resolveTargetV2(intent.target.target, source),
            operation.replacementTarget.after.target,
          )
        ) {
          return yield* invalid("stale")
        }
      }
    }
    yield* validateProjectedRelationsV2(current, materialized.operations)
  })
}

function revalidateScopeV2(tx: Transaction, scope: StoredScopeV2) {
  if (scope.type === "learner_home") return Effect.void
  return Effect.forEach(
    scope.courses,
    (course) =>
      Effect.gen(function* () {
        if (course.admission.type === "bound") {
          const owner = yield* Course.inspectPreferenceTarget(tx, course.courseID)
          if (
            owner.status !== "available" ||
            owner.title !== course.courseTitle ||
            owner.stateVersion !== course.admission.courseVersion ||
            owner.timeUpdated !== course.admission.courseTimeUpdated
          ) {
            return yield* invalid("stale")
          }
          return
        }
        const predecessor = yield* tx
          .select()
          .from(LearnerGoalCourseScopeTable)
          .where(
            and(
              eq(LearnerGoalCourseScopeTable.revision_id, course.admission.predecessorRevisionID),
              eq(LearnerGoalCourseScopeTable.course_id, course.courseID),
            ),
          )
          .get()
          .pipe(Effect.orDie)
        if (!predecessor || predecessor.course_title !== course.courseTitle) return yield* invalid("stale")
      }),
    { discard: true },
  )
}

function operationResultsV2(operations: readonly MaterializedOperationV2[]): readonly OperationResultV2[] {
  return operations.map((operation) => {
    if (operation.after.schemaVersion !== 2) throw new Error("Current Goal V2 result retained a V1 after snapshot")
    return {
      schemaVersion: 2,
      ordinal: operation.ordinal,
      operation: operation.operation,
      result: operation.result,
      goalID: operation.after.goalID,
      revisionID: operation.after.revisionID,
      version: operation.after.version,
      disposition: operation.after.disposition.type,
      meaning: {
        outcome: operation.after.outcome,
        conditions: operation.after.conditions,
        scope: scopeCourseIDs(operation.after.scope),
        target: operation.after.target,
      },
      ...(operation.replacementTarget
        ? {
            replacementTarget: {
              type: operation.replacementTarget.type,
              goalID: operation.replacementTarget.after.goalID,
              revisionID: operation.replacementTarget.after.revisionID,
              version: operation.replacementTarget.after.version,
            },
          }
        : {}),
    }
  })
}

function renderAcknowledgementV2(results: readonly OperationResultV2[]) {
  const summaries = results.map((result) => {
    const scope =
      result.meaning.scope.type === "learner_home"
        ? "LearnerHome-wide"
        : `Courses ${result.meaning.scope.courseIDs.join(", ")}`
    const target =
      result.meaning.target.type === "absent"
        ? "no target"
        : result.meaning.target.type === "instant"
          ? `target instant ${new Date(result.meaning.target.instant).toISOString()}`
          : `target date ${result.meaning.target.date}`
    const replacement = result.replacementTarget
      ? `; replaced by ${result.replacementTarget.goalID} at v${result.replacementTarget.version}`
      : ""
    return `#${result.ordinal + 1} ${result.result}: “${displayText(result.meaning.outcome)}”; ${scope}; ${target}; ${result.disposition} (Goal ${result.goalID}, v${result.version})${replacement}`
  })
  const changed = results.filter((result) => result.result === "changed").length
  return changed === 0
    ? {
        title: "Learning Goals unchanged",
        body: `${summaries.join(". ")}. No Goal revision was written. You can correct any stored Goal later.`,
      }
    : {
        title: changed === 1 ? "Updated learning Goal" : "Updated learning Goals",
        body: `${summaries.join(". ")}. You can correct any stored Goal later.`,
      }
}

function applyMaterializedV2(
  tx: Transaction,
  input: Readonly<{
    invocation: typeof LearningCommandInvocationTable.$inferSelect
    envelope: InvocationEnvelope
    candidate: CandidateV2
    results: readonly OperationResultV2[]
    acknowledgement: Readonly<{ title: string; body: string }>
    settlement: SettlementMetadata
  }>,
): Effect.Effect<AppliedSettlementV2, LearnerGoal.InvalidCommandError | LearnerGoal.IntegrityError> {
  return Effect.gen(function* () {
    if (input.settlement.time < input.candidate.materialized.timeFloor) return yield* invalid("stale")
    yield* tx.run("PRAGMA defer_foreign_keys = ON").pipe(Effect.orDie)
    const frontier = yield* LearningFrontier.advance(tx, {
      time: input.settlement.time,
      consumed: input.candidate.materialized.consumedFrontiers,
    })
    if (frontier.time !== input.settlement.time) return yield* invalid("stale")
    const occurrence = yield* tx
      .select({ sourceOrder: AdmittedLearnerOccurrenceTable.source_order })
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, input.invocation.occurrence_id))
      .get()
      .pipe(Effect.orDie)
    if (!occurrence?.sourceOrder) return yield* invalid("stale")
    const sourceOrder = occurrence.sourceOrder
    const effectID = createEffectID()
    const changed = input.candidate.materialized.operations.filter((operation) => operation.result === "changed")
    yield* tx
      .insert(LearnerGoalEffectTable)
      .values({
        id: effectID,
        schema_version: 2,
        commit_seal_id: effectID,
        occurrence_id: input.invocation.occurrence_id,
        source_order: sourceOrder,
        semantic_fingerprint: input.candidate.commandFingerprint,
        authorization_basis: "agent_action",
        command: input.candidate.canonicalCommand,
        agent_action_part_id: input.invocation.part_id,
        materialized_snapshot: input.candidate.materialized,
        operation_count: input.candidate.materialized.operations.length,
        change_count: changed.length,
        time_committed: frontier.time,
        commit_order: input.settlement.order,
        frontier_sequence: frontier.sequence,
        frontier_time: frontier.time,
        acknowledgement_title: input.acknowledgement.title,
        acknowledgement_body: input.acknowledgement.body,
      })
      .run()
      .pipe(Effect.orDie)
    const revisions = changed.flatMap((operation) => [
      { operation, snapshot: operation.after, role: "source" as const, predecessor: operation.before },
      ...(operation.replacementTarget?.type === "new"
        ? [
            {
              operation,
              snapshot: operation.replacementTarget.after,
              role: "target" as const,
              predecessor: undefined,
            },
          ]
        : []),
    ])
    const newGoals = revisions.filter((revision) => !revision.predecessor)
    yield* Effect.forEach(
      newGoals,
      (revision) =>
        tx
          .insert(LearnerGoalTable)
          .values({ id: revision.snapshot.goalID, time_created: frontier.time })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    yield* Effect.forEach(
      revisions,
      (revision, revisionIndex) =>
        insertRevisionV2(tx, {
          effectID,
          occurrenceID: input.invocation.occurrence_id,
          sourceOrder,
          operationOrdinal: revision.operation.ordinal,
          role: revision.role,
          snapshot: revision.snapshot,
          predecessor: revision.predecessor,
          revisionOrder: input.candidate.materialized.revisionSequenceBefore + revisionIndex + 1,
          frontier,
          commitOrder: input.settlement.order,
        }),
      { discard: true },
    )
    yield* Effect.forEach(
      input.results,
      (result) =>
        tx
          .insert(LearnerGoalEffectOperationTable)
          .values({
            effect_id: effectID,
            ordinal: result.ordinal,
            schema_version: 2,
            operation_kind: result.operation,
            result_kind: result.result,
            goal_id: result.goalID,
            revision_id: result.revisionID,
            version: result.version,
            disposition: result.disposition,
            meaning: result.meaning,
            replacement_target_kind: result.replacementTarget?.type ?? null,
            replacement_target_goal_id: result.replacementTarget?.goalID ?? null,
            replacement_target_revision_id: result.replacementTarget?.revisionID ?? null,
            replacement_target_version: result.replacementTarget?.version ?? null,
          })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    const receiptID = yield* insertPhysicalReceipt(tx, input.envelope, input.settlement)
    yield* tx
      .insert(LearnerGoalCommitSealTable)
      .values({ effect_id: effectID, receipt_id: receiptID, invocation_part_id: input.invocation.part_id })
      .run()
      .pipe(Effect.orDie)
    const updated = yield* tx
      .update(LearnerGoalStateTable)
      .set({ revision_sequence: input.candidate.materialized.revisionSequenceBefore + revisions.length })
      .where(
        and(
          eq(LearnerGoalStateTable.singleton, 1),
          eq(LearnerGoalStateTable.revision_sequence, input.candidate.materialized.revisionSequenceBefore),
        ),
      )
      .returning({ singleton: LearnerGoalStateTable.singleton })
      .get()
      .pipe(Effect.orDie)
    if (!updated) return yield* invalid("stale")
    const settlement = {
      outcome: "applied",
      goalKind: "learner_goal",
      schemaVersion: 2,
      receiptID,
      effectID,
      provenance: "agent_action",
      operations: input.results,
      acknowledgementTitle: input.acknowledgement.title,
      acknowledgementBody: input.acknowledgement.body,
      frontierSequence: frontier.sequence,
      settlementTime: input.settlement.time,
      settlementOrder: input.settlement.order,
    } satisfies AppliedSettlementV2
    yield* settlePhysicalInvocation(tx, input.invocation.part_id, settlement)
    return settlement
  })
}

function insertRevisionV2(
  tx: Transaction,
  input: Readonly<{
    effectID: EffectID
    occurrenceID: InvocationEnvelope["occurrenceID"]
    sourceOrder: number
    operationOrdinal: number
    role: "source" | "target"
    snapshot: VersionedRevisionSnapshot
    predecessor?: VersionedRevisionSnapshot
    revisionOrder: number
    frontier: Readonly<{ sequence: number; time: number }>
    commitOrder: number
  }>,
) {
  return Effect.gen(function* () {
    if (input.snapshot.schemaVersion !== 2) return yield* integrity("Goal V2 apply received a V1 revision")
    yield* tx
      .insert(LearnerGoalRevisionTable)
      .values({
        id: input.snapshot.revisionID,
        schema_version: 2,
        goal_id: input.snapshot.goalID,
        version: input.snapshot.version,
        predecessor_id: input.predecessor?.revisionID ?? null,
        effect_id: input.effectID,
        operation_ordinal: input.operationOrdinal,
        revision_role: input.role,
        occurrence_id: input.occurrenceID,
        source_order: input.sourceOrder,
        outcome: input.snapshot.outcome,
        scope_kind: input.snapshot.scope.type,
        target_kind: null,
        target_instant: null,
        target_local_date: null,
        target_timezone: null,
        target_timezone_release_id: null,
        target_utc_offset_minutes: null,
        target_source_expression: null,
        target_normalized: null,
        target_normalization_basis: null,
        target_value_v2: input.snapshot.target,
        disposition: input.snapshot.disposition.type,
        revision_order: input.revisionOrder,
        time_committed: input.frontier.time,
        commit_order: input.commitOrder,
        frontier_sequence: input.frontier.sequence,
        frontier_time: input.frontier.time,
      })
      .run()
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      input.snapshot.conditions,
      (condition, ordinal) =>
        tx
          .insert(LearnerGoalConditionTable)
          .values({ revision_id: input.snapshot.revisionID, ordinal, content: condition })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    if (input.snapshot.scope.type === "courses") {
      yield* Effect.forEach(
        input.snapshot.scope.courses,
        (course) =>
          tx
            .insert(LearnerGoalCourseScopeTable)
            .values({
              revision_id: input.snapshot.revisionID,
              course_id: course.courseID,
              course_title: course.courseTitle,
              admission_kind: course.admission.type === "bound" ? "new" : "carried",
              admitted_course_version: course.admission.type === "bound" ? course.admission.courseVersion : null,
              admitted_course_time_updated:
                course.admission.type === "bound" ? course.admission.courseTimeUpdated : null,
              carried_from_revision_id:
                course.admission.type === "carried" ? course.admission.predecessorRevisionID : null,
            })
            .run()
            .pipe(Effect.orDie),
        { discard: true },
      )
    }
    if (input.snapshot.disposition.type === "superseded") {
      yield* tx
        .insert(LearnerGoalSupersessionTable)
        .values({
          revision_id: input.snapshot.revisionID,
          source_goal_id: input.snapshot.goalID,
          target_goal_id: input.snapshot.disposition.targetGoalID,
          target_revision_id: input.snapshot.disposition.targetRevisionID,
        })
        .run()
        .pipe(Effect.orDie)
    }
  })
}

function displayText(value: string) {
  return value.replaceAll("\n", " ⏎ ")
}

function invalid(reason: LearnerGoal.InvalidCommandError["reason"]) {
  return Effect.fail(new LearnerGoal.InvalidCommandError({ reason }))
}

function canonicalPatch(patch: GoalPatchV2): CanonicalPatchV2 {
  const field = <A>(present: boolean, value: A): CanonicalFieldIntentV2<A> =>
    present ? { type: "set", value } : { type: "carry" }
  return {
    outcome: field("outcome" in patch, normalizeText(patch.outcome ?? "")),
    conditions: field("conditions" in patch, canonicalConditions(patch.conditions ?? [])),
    scope: field("scope" in patch, canonicalScope(patch.scope ?? { type: "learner_home" })),
    target: field("target" in patch, canonicalTarget(patch.target ?? { type: "absent" })),
    disposition: field("disposition" in patch, patch.disposition ?? "active"),
  }
}

function canonicalConditions(conditions: readonly string[]) {
  const normalized = conditions.map(normalizeText)
  if (
    normalized.length > LearnerGoal.MAX_CONDITIONS ||
    normalized.some((condition) => condition.length === 0 || bytes(condition) > LearnerGoal.MAX_CONDITION_BYTES) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new LearnerGoal.InvalidCommandError({ reason: "validation_error" })
  }
  return normalized
}

function canonicalScope(scope: ScopeIntentV2): ScopeIntentV2 {
  if (scope.type === "learner_home") return scope
  const courseIDs = [...scope.courseIDs].toSorted()
  if (
    courseIDs.length === 0 ||
    courseIDs.length > LearnerGoal.MAX_COURSES ||
    new Set(courseIDs).size !== courseIDs.length
  ) {
    throw new LearnerGoal.InvalidCommandError({ reason: "validation_error" })
  }
  return { type: "courses", courseIDs }
}

function canonicalTarget(target: TargetIntentV2): TargetIntentV2 {
  if (target.type === "absent") return target
  if (target.timeZone.type === "fixed_offset") {
    if (
      !Number.isInteger(target.timeZone.offsetMinutes) ||
      target.timeZone.offsetMinutes < -840 ||
      target.timeZone.offsetMinutes > 840
    ) {
      throw new LearnerGoal.InvalidCommandError({ reason: "validation_error" })
    }
  }
  if (target.timeZone.type === "iana" && normalizeText(target.timeZone.name).length === 0) {
    throw new LearnerGoal.InvalidCommandError({ reason: "validation_error" })
  }
  return target.timeZone.type === "iana"
    ? { ...target, timeZone: { type: "iana", name: normalizeText(target.timeZone.name) } }
    : target
}

function closedCommandV2(value: unknown): value is CommandV2 {
  if (!isRecord(value) || !onlyKeys(value, ["operations"]) || !Array.isArray(value.operations)) return false
  if (value.operations.length < 1 || value.operations.length > LearnerGoal.MAX_OPERATIONS) return false
  return value.operations.every((operation) => {
    if (!isRecord(operation) || typeof operation.type !== "string") return false
    if (operation.type === "create") {
      return (
        onlyKeys(operation, ["type", "outcome", "conditions", "scope", "target", "disposition"]) &&
        typeof operation.outcome === "string" &&
        optionalConditions(operation.conditions) &&
        optionalScope(operation.scope) &&
        optionalTarget(operation.target) &&
        optionalDisposition(operation.disposition)
      )
    }
    if (operation.type === "update") {
      return (
        onlyKeys(operation, ["type", "goalID", "headRevisionID", "patch"]) &&
        isGoalID(operation.goalID) &&
        isRevisionID(operation.headRevisionID) &&
        isRecord(operation.patch) &&
        Object.keys(operation.patch).length > 0 &&
        closedPatch(operation.patch)
      )
    }
    if (operation.type !== "replace") return false
    return (
      onlyKeys(operation, ["type", "goalID", "headRevisionID", "patch", "target"]) &&
      isGoalID(operation.goalID) &&
      isRevisionID(operation.headRevisionID) &&
      (operation.patch === undefined || (isRecord(operation.patch) && closedPatch(operation.patch))) &&
      isRecord(operation.target) &&
      ((operation.target.type === "existing" &&
        onlyKeys(operation.target, ["type", "goalID", "headRevisionID"]) &&
        isGoalID(operation.target.goalID) &&
        isRevisionID(operation.target.headRevisionID)) ||
        (operation.target.type === "new" &&
          onlyKeys(operation.target, ["type", "outcome", "conditions", "scope", "target", "disposition"]) &&
          typeof operation.target.outcome === "string" &&
          optionalConditions(operation.target.conditions) &&
          optionalScope(operation.target.scope) &&
          optionalTarget(operation.target.target) &&
          optionalDisposition(operation.target.disposition)))
    )
  })
}

function closedPatch(value: Record<string, unknown>) {
  if (!onlyKeys(value, ["outcome", "conditions", "scope", "target", "disposition"])) return false
  return (
    (value.outcome === undefined || typeof value.outcome === "string") &&
    optionalConditions(value.conditions) &&
    optionalScope(value.scope) &&
    optionalTarget(value.target) &&
    optionalDisposition(value.disposition)
  )
}

function optionalConditions(value: unknown) {
  return value === undefined || (Array.isArray(value) && value.every((condition) => typeof condition === "string"))
}

function optionalScope(value: unknown) {
  if (value === undefined) return true
  if (!isRecord(value)) return false
  if (value.type === "learner_home") return onlyKeys(value, ["type"])
  return (
    value.type === "courses" &&
    onlyKeys(value, ["type", "courseIDs"]) &&
    Array.isArray(value.courseIDs) &&
    value.courseIDs.every(isCourseID)
  )
}

function optionalTarget(value: unknown) {
  if (value === undefined) return true
  if (!isRecord(value)) return false
  if (value.type === "absent") return onlyKeys(value, ["type"])
  if (value.type !== "instant" && value.type !== "local_date") return false
  const field = value.type === "instant" ? "localDateTime" : "date"
  return (
    onlyKeys(value, ["type", field, "timeZone"]) &&
    typeof value[field] === "string" &&
    isRecord(value.timeZone) &&
    ((value.timeZone.type === "source" && onlyKeys(value.timeZone, ["type"])) ||
      (value.timeZone.type === "iana" &&
        onlyKeys(value.timeZone, ["type", "name"]) &&
        typeof value.timeZone.name === "string") ||
      (value.timeZone.type === "fixed_offset" &&
        onlyKeys(value.timeZone, ["type", "offsetMinutes"]) &&
        typeof value.timeZone.offsetMinutes === "number"))
  )
}

function optionalDisposition(value: unknown) {
  return value === undefined || value === "active" || value === "achieved" || value === "abandoned"
}

function normalizeText(value: string) {
  return value.normalize("NFC").trim().replaceAll(/\s+/g, " ")
}

function bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isGoalID(value: unknown): value is GoalID {
  return typeof value === "string" && /^gol_[0-9A-Za-z]{26}$/.test(value)
}

function isRevisionID(value: unknown): value is RevisionID {
  return typeof value === "string" && /^glr_[0-9A-Za-z]{26}$/.test(value)
}

function isCourseID(value: unknown): value is Course.CourseID {
  return typeof value === "string" && /^crs_[0-9A-Za-z]{26}$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function fingerprint(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
