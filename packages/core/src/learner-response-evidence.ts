export * as LearnerResponseEvidence from "./learner-response-evidence"

import { Turn } from "@opencode-ai/schema/turn"
import { and, asc, count, eq, gt, inArray, or, sql } from "drizzle-orm"
import { Effect } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Course } from "./course"
import {
  CourseTable,
  CourseViewRevisionItemTable,
  CourseViewRevisionStateTable,
  CourseViewTable,
} from "./course/sql"
import { LearningFrontier } from "./learning-frontier"
import { canonicalFingerprint, canonicalJson, toJsonValue, utf8Bytes } from "./learning-context/schema"
import { Occurrence } from "./learning-command/occurrence"
import { LearnerOccurrenceTombstoneTable, AdmittedLearnerOccurrenceTable } from "./learning-command/occurrence.sql"
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
} from "./learning-command/physical"
import type { InvocationEnvelope, SettlementMetadata } from "./learning-command/physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "./learning-command/sql"
import type { Transaction } from "./learning-command/transaction"
import { MaterialMap } from "./material-map"
import {
  MaterialCourseAlignmentStateTable,
  MaterialCourseAlignmentTable,
  MaterialMapStateTable,
  MaterialMapTable,
  MaterialSelectorTable,
} from "./material-map/sql"
import { SessionTable } from "./session/sql"
import { TurnLifecycle, type ValidatedAgentActionRegistration } from "./turn/turn"
import {
  TurnInputTable,
  TurnModelOperationTable,
  TurnModelPresentationTable,
  TurnModelSourceRetentionTable,
  TurnTable,
  TurnUnavailableModelTable,
  TurnUnavailableSourceTable,
} from "./turn/sql"
import { Wildcard } from "./util/wildcard"
import type { PermissionV1 } from "./v1/permission"
import type { PartID } from "./v1/session"
import {
  LearnerResponseEvidenceCapabilityIssueTable,
  LearnerResponseEvidenceCapabilitySettlementTable,
  LearnerResponseEvidenceCommitSealTable,
  LearnerResponseEvidenceDispositionTable,
  LearnerResponseEvidenceRecordTable,
  LearnerResponseEvidenceRevisionTable,
} from "./learner-response-evidence/sql"
import {
  IntegrityError,
  InvalidCommandError,
  MAX_CONTEXT_ITEMS,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_SELECTOR_BYTES,
  createRecordID,
  createRevisionID,
  type AgentAction,
  type AlreadyAppliedSettlement,
  type AppliedSettlement,
  type Basis,
  type Candidate,
  type CanonicalCommand,
  type CapabilityOutcome,
  type Command,
  type ConditionSource,
  type Disposition,
  type Exposure,
  type InvocationVersion,
  type MaterializedCandidate,
  type ReadPage,
  type ReadQuery,
  type Record as EvidenceRecord,
  type RecordID,
  type RecordSnapshot,
  type RecordView,
  type Relation,
  type Revision,
  type RevisionID,
  type SemanticTerminal,
  type Source,
  type SourceAvailability,
  type Target,
  type TargetSnapshot,
} from "./learner-response-evidence/schema"

export {
  IntegrityError,
  InvalidCommandError,
  MAX_CONTEXT_ITEMS,
  MAX_READ_BYTES,
  MAX_READ_ITEMS,
  MAX_SELECTOR_BYTES,
  RecordID,
  RevisionID,
  createRecordID,
  createRevisionID,
} from "./learner-response-evidence/schema"
export type {
  AlreadyAppliedSettlement,
  AppliedSettlement,
  Basis,
  Candidate,
  CanonicalCommand,
  CapabilityOutcome,
  Command,
  ConditionSource,
  Disposition,
  Exposure,
  InvocationVersion,
  ReadPage,
  ReadQuery,
  Record,
  RecordView,
  Relation,
  Revision,
  SemanticTerminal,
  Source,
  SourceAvailability,
  Target,
} from "./learner-response-evidence/schema"

export const UPDATE_CAPABILITY = "update_learner_response_evidence"
export const UPDATE_VERSION = 1
export const READ_CAPABILITY = "learner_response_evidence_read"
export const READ_VERSION = 1
export const PERMISSION_PATTERN = "learner_response_evidence"

const identity = { name: UPDATE_CAPABILITY, version: UPDATE_VERSION } as const

export type Invocation = Readonly<{ envelope: InvocationEnvelope; command: Command }>

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

export function canonicalizeCommand(input: Command): CanonicalCommand {
  if (!closedCommand(input)) throw new InvalidCommandError({ reason: "validation_error" })
  if (input.operation === "create") {
    return {
      schemaVersion: 1,
      operation: input.operation,
      relation: input.relation,
      exposure: input.exposure,
      conditionAssistantMessageID: input.conditionAssistantMessageID,
      target: { ...input.target },
      alignmentID: input.alignmentID,
    }
  }
  if (input.operation === "retract") {
    return {
      schemaVersion: 1,
      operation: input.operation,
      recordID: input.recordID,
      expectedVersion: input.expectedVersion,
    }
  }
  return {
    schemaVersion: 1,
    operation: input.operation,
    recordID: input.recordID,
    expectedVersion: input.expectedVersion,
    relation: input.relation,
    exposure: input.exposure,
  }
}

export function commandFingerprint(command: CanonicalCommand) {
  return fingerprint(command)
}

export function reserve(tx: Transaction, input: Invocation & Readonly<{ settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const command = yield* canonicalCommandEffect(input.command)
    const commandHash = commandFingerprint(command)
    const physicalFingerprint = fingerprint({ identity, envelope: input.envelope, command })
    const existing = yield* findPhysicalInvocation(tx, input, physicalFingerprint, identity)
    if (existing) {
      const disposition = yield* readDisposition(tx, existing.part_id)
      if (existing.status === "admitted") {
        if (!disposition || disposition.disposition !== "candidate_v1") {
          return yield* integrity("Only a complete learner-response-evidence candidate may remain admitted")
        }
        return { type: "admitted" as const, candidate: candidateInfo(disposition) }
      }
      return {
        type: "replay" as const,
        settlement: requirePhysicalSettlement(existing),
        ...(disposition?.disposition === "candidate_v1" ? { candidate: candidateInfo(disposition) } : {}),
        ...(disposition?.disposition === "semantic_terminal_v1"
          ? { semanticTerminal: semanticTerminalInfo(disposition) }
          : {}),
      }
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
    const commandCause = yield* currentSource(tx, input.envelope.occurrenceID)
    const materialized = yield* materializeCandidate(tx, input.envelope, command, commandCause, trusted).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (materialized.type === "failure") {
      if (materialized.error instanceof InvalidCommandError && materialized.error.reason === "capacity_exceeded") {
        return yield* materialized.error
      }
      yield* admitPhysicalInvocation(tx, {
        envelope: input.envelope,
        fingerprint: physicalFingerprint,
        command: identity,
      })
      const settlement = evidenceErrorSettlement(materialized.error, input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }

    const addressFingerprint = materialized.value.semanticAddressFingerprint
    const semantic = yield* resolveSemantic(tx, materialized.value.materialized)
    if (semantic.type !== "new") {
      const terminal = {
        kind: "semantic_terminal_v1",
        outcome: semantic.type,
        canonicalCommand: command,
        commandFingerprint: commandHash,
        semanticAddressFingerprint: addressFingerprint,
        existingRecordID: semantic.record.id,
        existingRevisionID: semantic.record.current.id,
        existingAssessmentFingerprint: assessmentFingerprint(semantic.record),
      } satisfies SemanticTerminal
      yield* admitPhysicalInvocation(tx, {
        envelope: input.envelope,
        fingerprint: physicalFingerprint,
        command: identity,
      })
      yield* tx
        .insert(LearnerResponseEvidenceDispositionTable)
        .values({
          invocation_part_id: input.envelope.partID,
          disposition: "semantic_terminal_v1",
          command_fingerprint: commandHash,
          canonical_command: command,
          semantic_address_fingerprint: addressFingerprint,
          semantic_outcome: semantic.type,
          existing_record_id: semantic.record.id,
          existing_revision_id: semantic.record.current.id,
          existing_assessment_fingerprint: terminal.existingAssessmentFingerprint,
          time_disposed: input.envelope.timeAdmitted,
        })
        .run()
        .pipe(Effect.orDie)
      if (semantic.type === "already_applied") {
        const settlement = yield* settleAlreadyApplied(tx, input.envelope.partID, semantic.record.current.id, input.settlement)
        return { type: "settled" as const, settlement, semanticTerminal: terminal }
      }
      const settlement = errorSettlement("semantic_conflict", input.settlement, {
        recordID: semantic.record.id,
        revisionID: semantic.record.current.id,
      })
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement, semanticTerminal: terminal }
    }

    yield* admitPhysicalInvocation(tx, {
      envelope: input.envelope,
      fingerprint: physicalFingerprint,
      command: identity,
    })
    if (!hasWriteMembership(trusted)) {
      const settlement = errorSettlement("permission_rejected", input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    if (yield* appliedMutation(tx, input.envelope.assistantMessageID)) {
      const settlement = errorSettlement("context_refresh_required", input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const agentActionFingerprint = fingerprint({
      agentAction: materialized.value.materialized.agentAction,
      commandFingerprint: commandHash,
      materialized: materialized.value.materialized,
    })
    const candidate = {
      kind: "candidate_v1",
      commandFingerprint: commandHash,
      semanticAddressFingerprint: addressFingerprint,
      agentActionFingerprint,
      canonicalCommand: command,
      agentAction: materialized.value.materialized.agentAction,
      materialized: materialized.value.materialized,
    } satisfies Candidate
    yield* tx
      .insert(LearnerResponseEvidenceDispositionTable)
      .values({
        invocation_part_id: input.envelope.partID,
        disposition: "candidate_v1",
        command_fingerprint: commandHash,
        canonical_command: command,
        semantic_address_fingerprint: addressFingerprint,
        agent_action_fingerprint: agentActionFingerprint,
        agent_action: candidate.agentAction,
        materialized_candidate: candidate.materialized,
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
        return yield* integrity("Learner-response-evidence capability policy settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    if (yield* readCapabilityIssue(tx, input.partID)) {
      return yield* integrity("A prompted learner-response-evidence capability cannot become a policy settlement")
    }
    yield* tx
      .insert(LearnerResponseEvidenceCapabilitySettlementTable)
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
      return yield* integrity("A terminal learner-response-evidence capability outcome cannot issue a prompt")
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
        return yield* integrity("Learner-response-evidence capability prompt issue conflicts")
      }
      return capabilityIssueInfo(existing)
    }
    yield* tx
      .insert(LearnerResponseEvidenceCapabilityIssueTable)
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
      return yield* integrity("Learner-response-evidence prompt reply has no exact durable issue")
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
        return yield* integrity("Learner-response-evidence prompt settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    yield* tx
      .insert(LearnerResponseEvidenceCapabilitySettlementTable)
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
    const outcome = issue ? ("prompted_abort" as const) : ("not_evaluated" as const)
    yield* tx
      .insert(LearnerResponseEvidenceCapabilitySettlementTable)
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
    return capabilitySettlementInfo((yield* readCapabilitySettlement(tx, input.partID))!)
  })
}

export function settle(
  tx: Transaction,
  input: Readonly<{
    partID: PartID
    settlement: SettlementMetadata
    targetProof?: MaterialMap.EvidenceTargetProof
    currentUse?: MaterialMap.CurrentUseReceipt
  }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const candidate = yield* requireCandidate(tx, input.partID)
    const semantic = yield* settleSemanticRace(tx, invocation, candidate, input.settlement)
    if (semantic) return semantic
    const capability = yield* readCapabilitySettlement(tx, input.partID)
    if (!capability || capability.agent_action_fingerprint !== candidate.agentActionFingerprint) {
      return yield* integrity("Final learner-response-evidence settlement has no exact capability outcome")
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

    const materialized = candidate.materialized
    const currentCause = yield* currentSource(tx, envelope.occurrenceID)
    if (!isDeepStrictEqual(currentCause, materialized.commandCause)) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    const command = candidate.canonicalCommand
    let current = materialized.current
    if (command.operation !== "create") {
      current = yield* requireRecordSnapshot(tx, command.recordID)
      if (current.currentVersion !== command.expectedVersion || !isDeepStrictEqual(current, materialized.current)) {
        const settlement = errorSettlement("stale", input.settlement, {
          recordID: current.recordID,
          revisionID: current.currentRevisionID,
          version: current.currentVersion,
        })
        yield* settlePhysicalInvocation(tx, input.partID, settlement)
        return { type: "settled" as const, settlement }
      }
    }

    if (command.operation === "create" || command.operation === "revise_from_tutor_interpretation") {
      const subject = yield* currentSource(tx, materialized.subject.occurrenceID)
      const condition = yield* currentCondition(tx, materialized.condition.assistantMessageID, subject)
      if (!isDeepStrictEqual(subject, materialized.subject) || !isDeepStrictEqual(condition, materialized.condition)) {
        return yield* new InvalidCommandError({ reason: "source_unavailable" })
      }
    }
    if (command.operation === "revise_from_learner_report" && !isDeepStrictEqual(currentCause, materialized.commandCause)) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }

    if (command.operation === "create") {
      if (!input.targetProof || !input.currentUse || !materialized.target) {
        return yield* new InvalidCommandError({ reason: "validation_error" })
      }
      const target = yield* MaterialMap.requireEvidenceTargetProof(tx, input.targetProof)
      if (!isDeepStrictEqual(targetSnapshot(target.receipt), materialized.target)) {
        return yield* new InvalidCommandError({ reason: "stale" })
      }
      const resolved = yield* MaterialMap.requireCurrentUseReceipt(
        tx,
        input.currentUse,
        { mapID: materialized.target.mapID, selectorID: materialized.target.selectorID, consume: true },
      )
      if (resolved.selector.witness.byteLength <= 0 || resolved.selector.witness.byteLength > MAX_SELECTOR_BYTES) {
        return yield* new InvalidCommandError({ reason: "capacity_exceeded" })
      }
    }

    const consumed = yield* LearningFrontier.read(tx)
    const frontier = yield* LearningFrontier.advance(tx, { time: input.settlement.time, consumed: [consumed] })
    const committed = { time: frontier.time, order: input.settlement.order }
    const recordID = materialized.effectRecordID
    const predecessorID = current?.currentRevisionID
    const version = materialized.effectVersion
    const revisionID = createRevisionID()
    const relation = command.operation === "retract" ? current!.relation : command.relation
    const exposure = command.operation === "retract" ? current!.exposure : command.exposure
    const basis =
      command.operation === "create" || command.operation === "revise_from_tutor_interpretation"
        ? ("tutor_interpretation" as const)
        : command.operation === "revise_from_learner_report"
          ? ("learner_report" as const)
          : current!.basis
    const disposition = command.operation === "retract" ? ("retracted" as const) : ("active" as const)
    const basisSource =
      command.operation === "create" || command.operation === "revise_from_tutor_interpretation"
        ? materialized.subject
        : command.operation === "revise_from_learner_report"
          ? materialized.commandCause
          : current!.basisSource
    yield* tx.run("PRAGMA defer_foreign_keys = ON")
    const receiptID = yield* insertPhysicalReceipt(tx, envelope, committed)
    if (command.operation === "create") {
      const target = materialized.target!
      yield* tx
        .insert(TurnModelSourceRetentionTable)
        .values({
          owner: "learner_response_evidence",
          owner_reference_id: recordID,
          source_turn_id: materialized.condition.turnID,
          source_assistant_message_id: materialized.condition.assistantMessageID,
          source_time_settled: materialized.condition.timeSettled,
          time_registered: committed.time,
        })
        .run()
        .pipe(Effect.orDie)
      yield* tx.insert(LearnerResponseEvidenceRecordTable).values({
        id: recordID,
        subject_occurrence_id: materialized.subject.occurrenceID,
        subject_source_order: materialized.subject.sourceOrder,
        subject_session_id: materialized.subject.sessionID,
        subject_message_id: materialized.subject.messageID,
        subject_turn_id: materialized.subject.turnID,
        subject_input_id: materialized.subject.inputID,
        subject_time_admitted: materialized.subject.timeAdmitted,
        map_id: target.mapID,
        selector_id: target.selectorID,
        course_id: target.courseID,
        view_id: target.viewID,
        course_revision_id: target.revisionID,
        course_item_id: target.itemID,
        admission_alignment_id: target.alignmentID,
        alignment_disposition_version: target.alignmentDispositionVersion,
        map_disposition_version: target.mapDispositionVersion,
        course_version: target.courseVersion,
        view_version: target.viewVersion,
        course_revision_version: target.revisionVersion,
        condition_session_id: materialized.condition.sessionID,
        condition_turn_id: materialized.condition.turnID,
        condition_assistant_message_id: materialized.condition.assistantMessageID,
        condition_time_settled: materialized.condition.timeSettled,
        current_revision_id: revisionID,
        current_version: version,
        time_created: committed.time,
      }).run().pipe(Effect.orDie)
    }
    yield* tx.insert(LearnerResponseEvidenceRevisionTable).values({
      id: revisionID,
      commit_seal_id: revisionID,
      record_id: recordID,
      version,
      predecessor_revision_id: predecessorID,
      operation: command.operation,
      relation,
      exposure,
      basis,
      disposition,
      basis_occurrence_id: basisSource.occurrenceID,
      basis_source_order: basisSource.sourceOrder,
      basis_session_id: basisSource.sessionID,
      basis_message_id: basisSource.messageID,
      basis_turn_id: basisSource.turnID,
      basis_input_id: basisSource.inputID,
      basis_time_admitted: basisSource.timeAdmitted,
      command_cause_occurrence_id: materialized.commandCause.occurrenceID,
      command_cause_source_order: materialized.commandCause.sourceOrder,
      command_cause_session_id: materialized.commandCause.sessionID,
      command_cause_message_id: materialized.commandCause.messageID,
      command_cause_turn_id: materialized.commandCause.turnID,
      command_cause_input_id: materialized.commandCause.inputID,
      command_cause_time_admitted: materialized.commandCause.timeAdmitted,
      invocation_part_id: input.partID,
      time_committed: committed.time,
      commit_order: committed.order,
      frontier_sequence: frontier.sequence,
      frontier_time: frontier.time,
    }).run().pipe(Effect.orDie)
    if (command.operation !== "create") {
      const updated = yield* tx
        .update(LearnerResponseEvidenceRecordTable)
        .set({ current_revision_id: revisionID, current_version: version })
        .where(
          and(
            eq(LearnerResponseEvidenceRecordTable.id, recordID),
            eq(LearnerResponseEvidenceRecordTable.current_revision_id, predecessorID!),
            eq(LearnerResponseEvidenceRecordTable.current_version, version - 1),
          ),
        )
        .returning({ id: LearnerResponseEvidenceRecordTable.id })
        .get()
        .pipe(Effect.orDie)
      if (!updated) return yield* Effect.die("Learner-response-evidence current head changed inside one transaction")
    }
    yield* tx.insert(LearnerResponseEvidenceCommitSealTable).values({
      revision_id: revisionID,
      receipt_id: receiptID,
      invocation_part_id: input.partID,
    }).run().pipe(Effect.orDie)
    const settlement = {
      outcome: "applied",
      evidenceKind: "learner_response_evidence",
      schemaVersion: 1,
      receiptID,
      effectID: revisionID,
      recordID,
      revisionID,
      version,
      subject: materialized.subject,
      target: materialized.target ?? current!.target,
      operation: command.operation,
      relation,
      exposure,
      basis,
      disposition,
      frontierSequence: frontier.sequence,
      settlementTime: committed.time,
      settlementOrder: committed.order,
    } satisfies AppliedSettlement
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  }).pipe(
    Effect.catch((error) =>
      error instanceof IntegrityError
        ? Effect.fail(error)
        : settleDomainFailure(tx, input.partID, evidenceErrorSettlement(error, input.settlement)),
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
    const semantic = yield* settleSemanticRace(tx, invocation, candidate, input.settlement)
    if (semantic) return semantic
    const capability = yield* recoverCapability(tx, {
      partID: input.partID,
      time: input.settlement.time,
      order: input.settlement.order,
    })
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

export function settleFailure(
  tx: Transaction,
  input: Readonly<{ partID: PartID; error: unknown; settlement: SettlementMetadata }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const candidate = yield* requireCandidate(tx, input.partID)
    const semantic = yield* settleSemanticRace(tx, invocation, candidate, input.settlement)
    if (semantic) return semantic
    const settlement = evidenceErrorSettlement(input.error, input.settlement)
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function readInvocationVersion(
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
    if (invocation.command_name !== UPDATE_CAPABILITY || invocation.command_version !== UPDATE_VERSION) {
      return yield* invocationConflict(input)
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
        return yield* integrity("Learner-response-evidence invocation lost its required disposition")
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
    return {
      ...state,
      disposition: "semantic_terminal_v1" as const,
      semanticTerminal: semanticTerminalInfo(disposition),
    } satisfies InvocationVersion
  })
}

export type ReadOptions = Readonly<{ cursor?: string; limit?: number }>

export function read(tx: Transaction, query: ReadQuery, options?: ReadOptions) {
  return Effect.gen(function* () {
    const limit = options?.limit ?? MAX_READ_ITEMS
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_READ_ITEMS) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    const queryFingerprint = fingerprint(query)
    const after = options?.cursor ? decodeReadCursor(options.cursor, queryFingerprint) : undefined
    if (query.type === "record") {
      if (after) return yield* new InvalidCommandError({ reason: "validation_error" })
      const record = yield* readRecord(tx, query.recordID)
      const items = record ? [yield* recordView(tx, record)] : []
      return finalizeReadPage(query, items, items.length, null, false)
    }
    if (query.type === "history") {
      const rows = yield* tx
        .select({ revision: LearnerResponseEvidenceRevisionTable })
        .from(LearnerResponseEvidenceRevisionTable)
        .innerJoin(
          LearnerResponseEvidenceCommitSealTable,
          eq(LearnerResponseEvidenceCommitSealTable.revision_id, LearnerResponseEvidenceRevisionTable.id),
        )
        .innerJoin(
          LearningCommandInvocationTable,
          and(
            eq(LearningCommandInvocationTable.part_id, LearnerResponseEvidenceCommitSealTable.invocation_part_id),
            eq(LearningCommandInvocationTable.status, "applied"),
            eq(LearningCommandInvocationTable.receipt_id, LearnerResponseEvidenceCommitSealTable.receipt_id),
          ),
        )
        .where(
          and(
            eq(LearnerResponseEvidenceRevisionTable.record_id, query.recordID),
            after
              ? or(
                  gt(LearnerResponseEvidenceRevisionTable.version, after.number),
                  and(
                    eq(LearnerResponseEvidenceRevisionTable.version, after.number),
                    gt(LearnerResponseEvidenceRevisionTable.id, after.id as RevisionID),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(LearnerResponseEvidenceRevisionTable.version), asc(LearnerResponseEvidenceRevisionTable.id))
        .limit(limit + 1)
        .all()
        .pipe(Effect.orDie)
      const total = yield* tx
        .select({ value: count() })
        .from(LearnerResponseEvidenceRevisionTable)
        .where(eq(LearnerResponseEvidenceRevisionTable.record_id, query.recordID))
        .get()
        .pipe(Effect.orDie)
      return boundedReadPage(
        query,
        rows.map((row) => ({ item: revisionInfo(row.revision), key: [row.revision.version, row.revision.id] as const })),
        total?.value ?? 0,
        queryFingerprint,
        limit,
      )
    }
    const where =
      query.type === "course"
        ? and(
            eq(LearnerResponseEvidenceRecordTable.course_id, query.target.courseID),
            eq(LearnerResponseEvidenceRecordTable.view_id, query.target.viewID),
            eq(LearnerResponseEvidenceRecordTable.course_revision_id, query.target.revisionID),
            eq(LearnerResponseEvidenceRecordTable.course_item_id, query.target.itemID),
            after
              ? or(
                  gt(LearnerResponseEvidenceRecordTable.subject_source_order, after.number),
                  and(
                    eq(LearnerResponseEvidenceRecordTable.subject_source_order, after.number),
                    gt(LearnerResponseEvidenceRecordTable.id, after.id as RecordID),
                  ),
                )
              : undefined,
          )
        : and(
            eq(LearnerResponseEvidenceRecordTable.map_id, query.mapID),
            eq(LearnerResponseEvidenceRecordTable.selector_id, query.selectorID),
            after
              ? or(
                  gt(LearnerResponseEvidenceRecordTable.subject_source_order, after.number),
                  and(
                    eq(LearnerResponseEvidenceRecordTable.subject_source_order, after.number),
                    gt(LearnerResponseEvidenceRecordTable.id, after.id as RecordID),
                  ),
                )
              : undefined,
          )
    const countWhere =
      query.type === "course"
        ? and(
            eq(LearnerResponseEvidenceRecordTable.course_id, query.target.courseID),
            eq(LearnerResponseEvidenceRecordTable.view_id, query.target.viewID),
            eq(LearnerResponseEvidenceRecordTable.course_revision_id, query.target.revisionID),
            eq(LearnerResponseEvidenceRecordTable.course_item_id, query.target.itemID),
          )
        : and(
            eq(LearnerResponseEvidenceRecordTable.map_id, query.mapID),
            eq(LearnerResponseEvidenceRecordTable.selector_id, query.selectorID),
          )
    const rows = yield* tx
      .select({ record: LearnerResponseEvidenceRecordTable, revision: LearnerResponseEvidenceRevisionTable })
      .from(LearnerResponseEvidenceRecordTable)
      .innerJoin(
        LearnerResponseEvidenceRevisionTable,
        eq(LearnerResponseEvidenceRevisionTable.id, LearnerResponseEvidenceRecordTable.current_revision_id),
      )
      .innerJoin(
        LearnerResponseEvidenceCommitSealTable,
        eq(LearnerResponseEvidenceCommitSealTable.revision_id, LearnerResponseEvidenceRevisionTable.id),
      )
      .innerJoin(
        LearningCommandInvocationTable,
        and(
          eq(LearningCommandInvocationTable.part_id, LearnerResponseEvidenceCommitSealTable.invocation_part_id),
          eq(LearningCommandInvocationTable.status, "applied"),
          eq(LearningCommandInvocationTable.receipt_id, LearnerResponseEvidenceCommitSealTable.receipt_id),
        ),
      )
      .where(where)
      .orderBy(asc(LearnerResponseEvidenceRecordTable.subject_source_order), asc(LearnerResponseEvidenceRecordTable.id))
      .limit(limit + 1)
      .all()
      .pipe(Effect.orDie)
    const total = yield* tx
      .select({ value: count() })
      .from(LearnerResponseEvidenceRecordTable)
      .where(countWhere)
      .get()
      .pipe(Effect.orDie)
    const views = yield* Effect.forEach(rows, (row) => recordView(tx, recordInfo(row.record, row.revision)))
    return boundedReadPage(
      query,
      views.map((item) => ({ item, key: [item.record.subject.sourceOrder, item.record.id] as const })),
      total?.value ?? 0,
      queryFingerprint,
      limit,
    )
  })
}

export type ContextRequirement = Readonly<{
  mapID: Target["mapID"]
  selectorID: Target["selectorID"]
}>

export type ContextMaterialResolution =
  | Readonly<{
      mapID: Target["mapID"]
      selectorID: Target["selectorID"]
      state: "available"
      receipt: MaterialMap.CurrentUseReceipt
      byteLength: number
    }>
  | Readonly<{
      mapID: Target["mapID"]
      selectorID: Target["selectorID"]
      state: "unavailable"
    }>

export type ContextProjection = Readonly<{
  countAtCut: number
  entries: readonly Readonly<{
    locator: Readonly<{ readonly [key: string]: unknown }>
    semantic: Readonly<{ readonly [key: string]: unknown }>
  }>[]
}>

export class ContextProofRequiredError extends Error {
  readonly requirements: readonly ContextRequirement[]

  constructor(requirements: readonly ContextRequirement[]) {
    super("Learner-response-evidence context needs current-use material proofs")
    this.name = "LearnerResponseEvidence.ContextProofRequiredError"
    this.requirements = requirements
  }
}

export function listContextRequirements(
  tx: Transaction,
  input: Readonly<{ endpoints: readonly Course.MembershipEndpoint[] }>,
) {
  return Effect.gen(function* () {
    const rows = yield* contextRows(tx, input.endpoints)
    const eligible = yield* Effect.filter(rows, (row) =>
      Effect.gen(function* () {
        if (row.revision.disposition !== "active") return false
        const record = recordInfo(row.record, row.revision)
        if (!(yield* assessmentSourcesDeleted(tx, record))) return false
        const state = yield* targetRelation(tx, record.target)
        return (
          state.alignment === "current" &&
          state.map === "current" &&
          state.course === "current" &&
          state.selector === "current"
        )
      }),
    )
    return [
      ...new Map(
        eligible.map((row) => [
          `${row.record.map_id}\u0000${row.record.selector_id}`,
          {
            mapID: row.record.map_id as ContextRequirement["mapID"],
            selectorID: row.record.selector_id as ContextRequirement["selectorID"],
          } satisfies ContextRequirement,
        ]),
      ).values(),
    ].toSorted((left, right) =>
      `${left.mapID}/${left.selectorID}`.localeCompare(`${right.mapID}/${right.selectorID}`, "und"),
    )
  })
}

export function projectLearningContext(
  tx: Transaction,
  input: Readonly<{
    endpoints: readonly Course.MembershipEndpoint[]
    materials: readonly ContextMaterialResolution[]
    lazyReadAvailable: boolean
  }>,
) {
  return Effect.gen(function* () {
    const rows = yield* contextRows(tx, input.endpoints)
    const materials = new Map(input.materials.map((item) => [`${item.mapID}\u0000${item.selectorID}`, item]))
    const missing = new Map<string, ContextRequirement>()
    const candidates = yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        if (row.revision.disposition !== "active") return undefined
        const record = recordInfo(row.record, row.revision)
        if (!(yield* assessmentSourcesDeleted(tx, record))) return undefined
        const targetState = yield* targetRelation(tx, record.target)
        if (
          targetState.alignment !== "current" ||
          targetState.map !== "current" ||
          targetState.course !== "current" ||
          targetState.selector !== "current"
        ) {
          return undefined
        }
        const key = `${record.target.mapID}\u0000${record.target.selectorID}`
        const material = materials.get(key)
        if (!material) {
          missing.set(key, { mapID: record.target.mapID, selectorID: record.target.selectorID })
          return undefined
        }
        if (material.state === "unavailable" || material.byteLength <= 0 || material.byteLength > MAX_SELECTOR_BYTES) {
          return undefined
        }
        const proof = yield* MaterialMap.prepareEvidenceTargetProof(tx, {
          alignmentID: record.target.alignmentID,
          mapID: record.target.mapID,
          selectorID: record.target.selectorID,
          course: {
            courseID: record.target.courseID,
            viewID: record.target.viewID,
            revisionID: record.target.revisionID,
            itemID: record.target.itemID,
          },
        }).pipe(
          Effect.map((value) => ({ type: "available" as const, value })),
          Effect.catch(() => Effect.succeed({ type: "unavailable" as const })),
        )
        if (proof.type === "unavailable") return undefined
        const current = yield* MaterialMap.requireCurrentUseReceipt(tx, material.receipt, {
          mapID: record.target.mapID,
          selectorID: record.target.selectorID,
        }).pipe(
          Effect.map(() => true),
          Effect.catch(() => Effect.succeed(false)),
        )
        if (!current) return undefined
        return {
          locator: {
            recordID: record.id,
            revisionID: record.current.id,
            version: record.current.version,
            subjectOccurrenceID: record.subject.occurrenceID,
            subjectSourceOrder: record.subject.sourceOrder,
            target: {
              mapID: record.target.mapID,
              selectorID: record.target.selectorID,
              courseID: record.target.courseID,
              viewID: record.target.viewID,
              revisionID: record.target.revisionID,
              itemID: record.target.itemID,
              alignmentID: record.target.alignmentID,
            },
            lazyReadAvailable: input.lazyReadAvailable,
          },
          semantic: {
            assessmentScope: "entire_exact_selector",
            relation: record.current.relation,
            basis: record.current.basis,
            exposure: record.current.exposure,
            disposition: "active",
            sourceAvailability: {
              subject: "source_deleted",
              condition: "source_deleted",
              basis: "source_deleted",
            },
            targetRelation: targetState,
            selectorByteLength: material.byteLength,
            interpretation:
              "Fallible source-linked assessment of this one deleted response against the entire exact selector under the recorded disclosure condition.",
            nonImplications: [
              "mastery",
              "understanding",
              "retention",
              "correctness_beyond_this_selector_bound_occurrence",
              "required_next_action",
            ],
          },
        }
      }),
    )
    if (missing.size > 0) return yield* Effect.fail(new ContextProofRequiredError([...missing.values()]))
    const entries = candidates.filter((item): item is NonNullable<typeof item> => item !== undefined)
    return { countAtCut: entries.length, entries: entries.slice(0, MAX_CONTEXT_ITEMS) } satisfies ContextProjection
  })
}

function contextRows(tx: Transaction, endpoints: readonly Course.MembershipEndpoint[]) {
  if (endpoints.length === 0) return Effect.succeed([])
  return tx
    .select({ record: LearnerResponseEvidenceRecordTable, revision: LearnerResponseEvidenceRevisionTable })
    .from(LearnerResponseEvidenceRecordTable)
    .innerJoin(
      LearnerResponseEvidenceRevisionTable,
      eq(LearnerResponseEvidenceRevisionTable.id, LearnerResponseEvidenceRecordTable.current_revision_id),
    )
    .innerJoin(
      LearnerResponseEvidenceCommitSealTable,
      eq(LearnerResponseEvidenceCommitSealTable.revision_id, LearnerResponseEvidenceRevisionTable.id),
    )
    .innerJoin(
      LearningCommandInvocationTable,
      and(
        eq(LearningCommandInvocationTable.part_id, LearnerResponseEvidenceCommitSealTable.invocation_part_id),
        eq(LearningCommandInvocationTable.status, "applied"),
        eq(LearningCommandInvocationTable.receipt_id, LearnerResponseEvidenceCommitSealTable.receipt_id),
      ),
    )
    .where(
      or(
        ...endpoints.map((endpoint) =>
          and(
            eq(LearnerResponseEvidenceRecordTable.course_id, endpoint.courseID),
            eq(LearnerResponseEvidenceRecordTable.view_id, endpoint.viewID),
            eq(LearnerResponseEvidenceRecordTable.course_revision_id, endpoint.revisionID),
            eq(LearnerResponseEvidenceRecordTable.course_item_id, endpoint.itemID),
          ),
        ),
      ),
    )
    .orderBy(asc(LearnerResponseEvidenceRecordTable.subject_source_order), asc(LearnerResponseEvidenceRecordTable.id))
    .all()
    .pipe(Effect.orDie)
}

function assessmentSourcesDeleted(tx: Transaction, record: EvidenceRecord) {
  return Effect.gen(function* () {
    const subject = yield* sourceAvailability(tx, record.subject)
    if (subject.state !== "source_unavailable" || subject.reason !== "source_deleted") return false
    const condition = yield* conditionAvailability(tx, record.condition)
    if (condition.state !== "source_unavailable" || condition.reason !== "source_deleted") return false
    if (record.current.basis === "learner_report") {
      const basis = yield* sourceAvailability(tx, record.current.basisSource)
      if (basis.state !== "source_unavailable" || basis.reason !== "source_deleted") return false
    }
    return true
  })
}

function sourceAvailability(tx: Transaction, source: Source): Effect.Effect<SourceAvailability, never> {
  return Effect.gen(function* () {
    const tombstone = yield* tx
      .select({ id: LearnerOccurrenceTombstoneTable.occurrence_id })
      .from(LearnerOccurrenceTombstoneTable)
      .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, source.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (tombstone) return { state: "source_unavailable", reason: "source_deleted" } as const
    const available = yield* Occurrence.requireAvailableSource(tx, {
      sessionID: source.sessionID,
      messageID: source.messageID,
      occurrenceID: source.occurrenceID,
    }).pipe(
      Effect.map(() => true),
      Effect.catch(() => Effect.succeed(false)),
    )
    return available
      ? ({ state: "available" } as const)
      : ({ state: "source_unavailable", reason: "presentation_unavailable" } as const)
  }).pipe(Effect.orDie)
}

function conditionAvailability(tx: Transaction, condition: ConditionSource): Effect.Effect<SourceAvailability, never> {
  return Effect.gen(function* () {
    const live = yield* tx
      .select({ time: TurnModelOperationTable.time_settled })
      .from(TurnModelOperationTable)
      .innerJoin(
        TurnModelPresentationTable,
        eq(TurnModelPresentationTable.assistant_message_id, TurnModelOperationTable.assistant_message_id),
      )
      .where(
        and(
          eq(TurnModelOperationTable.assistant_message_id, condition.assistantMessageID),
          eq(TurnModelOperationTable.turn_id, condition.turnID),
          eq(TurnModelOperationTable.session_id, condition.sessionID),
          eq(TurnModelOperationTable.state, "completed"),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (live?.time === condition.timeSettled) return { state: "available" } as const
    const deleted = yield* tx
      .select({ turnID: TurnUnavailableSourceTable.turn_id })
      .from(TurnUnavailableSourceTable)
      .innerJoin(TurnUnavailableModelTable, eq(TurnUnavailableModelTable.turn_id, TurnUnavailableSourceTable.turn_id))
      .where(
        and(
          eq(TurnUnavailableSourceTable.turn_id, condition.turnID),
          eq(TurnUnavailableSourceTable.session_id, condition.sessionID),
          eq(TurnUnavailableModelTable.assistant_message_id, condition.assistantMessageID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    return deleted
      ? ({ state: "source_unavailable", reason: "source_deleted" } as const)
      : ({ state: "source_unavailable", reason: "presentation_unavailable" } as const)
  }).pipe(Effect.orDie)
}

function recordView(tx: Transaction, record: EvidenceRecord): Effect.Effect<RecordView, never> {
  return Effect.gen(function* () {
    return {
      record,
      availability: {
        subject: yield* sourceAvailability(tx, record.subject),
        condition: yield* conditionAvailability(tx, record.condition),
        basis: yield* sourceAvailability(tx, record.current.basisSource),
      },
      targetRelation: yield* targetRelation(tx, record.target),
    }
  })
}

function targetRelation(tx: Transaction, target: TargetSnapshot): Effect.Effect<RecordView["targetRelation"], never> {
  return Effect.gen(function* () {
    const alignment = yield* tx
      .select({ state: MaterialCourseAlignmentStateTable, successor: MaterialCourseAlignmentTable.id })
      .from(MaterialCourseAlignmentStateTable)
      .leftJoin(
        MaterialCourseAlignmentTable,
        eq(MaterialCourseAlignmentTable.supersedes_alignment_id, MaterialCourseAlignmentStateTable.alignment_id),
      )
      .where(eq(MaterialCourseAlignmentStateTable.alignment_id, target.alignmentID))
      .get()
      .pipe(Effect.orDie)
    const map = yield* tx
      .select({ state: MaterialMapStateTable, successor: MaterialMapTable.id })
      .from(MaterialMapStateTable)
      .leftJoin(MaterialMapTable, eq(MaterialMapTable.supersedes_map_id, MaterialMapStateTable.map_id))
      .where(eq(MaterialMapStateTable.map_id, target.mapID))
      .get()
      .pipe(Effect.orDie)
    const selector = yield* tx
      .select({ id: MaterialSelectorTable.id })
      .from(MaterialSelectorTable)
      .where(and(eq(MaterialSelectorTable.map_id, target.mapID), eq(MaterialSelectorTable.id, target.selectorID)))
      .get()
      .pipe(Effect.orDie)
    const course = yield* tx
      .select({ course: CourseTable, view: CourseViewTable, revision: CourseViewRevisionStateTable })
      .from(CourseViewRevisionItemTable)
      .innerJoin(CourseTable, eq(CourseTable.id, CourseViewRevisionItemTable.course_id))
      .innerJoin(
        CourseViewTable,
        and(
          eq(CourseViewTable.course_id, CourseViewRevisionItemTable.course_id),
          eq(CourseViewTable.id, CourseViewRevisionItemTable.view_id),
        ),
      )
      .innerJoin(
        CourseViewRevisionStateTable,
        and(
          eq(CourseViewRevisionStateTable.course_id, CourseViewRevisionItemTable.course_id),
          eq(CourseViewRevisionStateTable.view_id, CourseViewRevisionItemTable.view_id),
          eq(CourseViewRevisionStateTable.revision_id, CourseViewRevisionItemTable.revision_id),
        ),
      )
      .where(
        and(
          eq(CourseViewRevisionItemTable.course_id, target.courseID),
          eq(CourseViewRevisionItemTable.view_id, target.viewID),
          eq(CourseViewRevisionItemTable.revision_id, target.revisionID),
          eq(CourseViewRevisionItemTable.item_id, target.itemID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    return {
      alignment: !alignment
        ? "unavailable"
        : alignment.successor
          ? "superseded"
          : alignment.state.disposition === "withdrawn"
            ? "withdrawn"
            : "current",
      map: !map ? "unavailable" : map.successor ? "superseded" : map.state.disposition === "withdrawn" ? "withdrawn" : "current",
      course:
        course &&
        course.course.withdrawal_reason === null &&
        course.view.withdrawal_reason === null &&
        course.revision.withdrawal_reason === null
          ? "current"
          : "unavailable",
      selector: selector ? "current" : "unavailable",
    } satisfies RecordView["targetRelation"]
  }).pipe(Effect.orDie)
}

function boundedReadPage<T extends RecordView | Revision>(
  query: ReadQuery,
  rows: readonly Readonly<{ item: T; key: readonly [number, string] }>[],
  countAtRead: number,
  queryFingerprint: string,
  limit: number,
): ReadPage {
  const selected: T[] = []
  let page = finalizeReadPage(query, selected, countAtRead, null, rows.length > 0)
  for (let index = 0; index < Math.min(limit, rows.length); index++) {
    const row = rows[index]!
    const more = index + 1 < rows.length
    const cursor = more ? encodeReadCursor(queryFingerprint, row.key) : null
    const candidate = finalizeReadPage(query, [...selected, row.item], countAtRead, cursor, more)
    if (candidate.canonicalBytes > MAX_READ_BYTES) break
    selected.push(row.item)
    page = candidate
  }
  if (selected.length === 0 && rows.length > 0) throw new InvalidCommandError({ reason: "capacity_exceeded" })
  if (selected.length < Math.min(limit, rows.length)) {
    const last = rows[selected.length - 1]
    if (!last) throw new InvalidCommandError({ reason: "capacity_exceeded" })
    page = finalizeReadPage(query, selected, countAtRead, encodeReadCursor(queryFingerprint, last.key), true)
  }
  return page
}

function finalizeReadPage(
  query: ReadQuery,
  items: readonly (RecordView | Revision)[],
  countAtRead: number,
  cursor: string | null,
  truncated: boolean,
): ReadPage {
  let canonicalBytes = 0
  let page: ReadPage | undefined
  for (let attempt = 0; attempt < 8; attempt++) {
    page = { query, items, countAtRead, cursor, truncated, canonicalBytes }
    const next = utf8Bytes(canonicalJson(toJsonValue(page)))
    if (next === canonicalBytes) return page
    canonicalBytes = next
  }
  throw new Error("Learner-response-evidence read byte accounting did not converge")
}

function encodeReadCursor(queryFingerprint: string, key: readonly [number, string]) {
  return Buffer.from(canonicalJson(toJsonValue({ version: 1, queryFingerprint, key }))).toString("base64url")
}

function decodeReadCursor(cursor: string, queryFingerprint: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    if (
      !isRecord(value) ||
      !onlyKeys(value, ["version", "queryFingerprint", "key"]) ||
      value.version !== 1 ||
      value.queryFingerprint !== queryFingerprint ||
      !Array.isArray(value.key) ||
      value.key.length !== 2 ||
      !nonnegativeInteger(value.key[0]) ||
      !nonempty(value.key[1])
    ) {
      throw new Error("invalid")
    }
    return { number: value.key[0], id: value.key[1] }
  } catch {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
}

function closedCommand(value: unknown): value is Command {
  if (!isRecord(value) || typeof value.operation !== "string") return false
  if (value.operation === "create") {
    return (
      onlyKeys(value, ["operation", "relation", "exposure", "conditionAssistantMessageID", "target", "alignmentID"]) &&
      relation(value.relation) &&
      exposure(value.exposure) &&
      nonempty(value.conditionAssistantMessageID) &&
      target(value.target) &&
      opaqueID(value.alignmentID, "mca")
    )
  }
  if (value.operation === "retract") {
    return (
      onlyKeys(value, ["operation", "recordID", "expectedVersion"]) &&
      opaqueID(value.recordID, "lre") &&
      nonnegativeInteger(value.expectedVersion)
    )
  }
  return (
    (value.operation === "revise_from_tutor_interpretation" || value.operation === "revise_from_learner_report") &&
    onlyKeys(value, ["operation", "recordID", "expectedVersion", "relation", "exposure"]) &&
    opaqueID(value.recordID, "lre") &&
    nonnegativeInteger(value.expectedVersion) &&
    relation(value.relation) &&
    exposure(value.exposure)
  )
}

function target(value: unknown): value is Target {
  return (
    isRecord(value) &&
    onlyKeys(value, ["mapID", "selectorID", "courseID", "viewID", "revisionID", "itemID"]) &&
    opaqueID(value.mapID, "mmp") &&
    opaqueID(value.selectorID, "msl") &&
    opaqueID(value.courseID, "crs") &&
    opaqueID(value.viewID, "cvw") &&
    opaqueID(value.revisionID, "cvr") &&
    opaqueID(value.itemID, "cit")
  )
}

function relation(value: unknown): value is Relation {
  return value === "supports" || value === "does_not_support"
}

function exposure(value: unknown): value is Exposure {
  return value === "learner_response_before_tutor_disclosure" || value === "tutor_disclosure_before_learner_response"
}

function canonicalCommandEffect(input: Command) {
  return Effect.try({
    try: () => canonicalizeCommand(input),
    catch: (error) =>
      error instanceof InvalidCommandError ? error : new InvalidCommandError({ reason: "validation_error" }),
  })
}

function fingerprint(value: unknown) {
  return canonicalFingerprint(toJsonValue(value))
}

function targetSnapshot(receipt: MaterialMap.EvidenceTargetReceipt): TargetSnapshot {
  return {
    mapID: receipt.mapID,
    selectorID: receipt.selectorID,
    courseID: receipt.course.courseID,
    viewID: receipt.course.viewID,
    revisionID: receipt.course.revisionID,
    itemID: receipt.course.itemID,
    alignmentID: receipt.alignmentID,
    alignmentDispositionVersion: receipt.alignmentDispositionVersion,
    mapDispositionVersion: receipt.mapDispositionVersion,
    courseVersion: receipt.courseVersion,
    viewVersion: receipt.viewVersion,
    revisionVersion: receipt.revisionVersion,
  }
}

function semanticAddress(subject: Source, target: Target) {
  return {
    subjectOccurrenceID: subject.occurrenceID,
    mapID: target.mapID,
    selectorID: target.selectorID,
    courseID: target.courseID,
    viewID: target.viewID,
    revisionID: target.revisionID,
    itemID: target.itemID,
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

function currentCondition(
  tx: Transaction,
  assistantMessageID: InvocationEnvelope["assistantMessageID"],
  subject: Source,
) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({
        operation: TurnModelOperationTable,
        presentation: TurnModelPresentationTable,
        turn: TurnTable,
        causalSourceOrder: AdmittedLearnerOccurrenceTable.source_order,
      })
      .from(TurnModelOperationTable)
      .innerJoin(
        TurnModelPresentationTable,
        eq(TurnModelPresentationTable.assistant_message_id, TurnModelOperationTable.assistant_message_id),
      )
      .innerJoin(TurnTable, eq(TurnTable.id, TurnModelOperationTable.turn_id))
      .innerJoin(
        AdmittedLearnerOccurrenceTable,
        eq(AdmittedLearnerOccurrenceTable.id, TurnModelOperationTable.causal_occurrence_id),
      )
      .where(eq(TurnModelOperationTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (
      !row ||
      row.operation.state !== "completed" ||
      row.operation.time_settled === null ||
      row.operation.time_settled > subject.timeAdmitted ||
      row.causalSourceOrder === null ||
      row.causalSourceOrder >= subject.sourceOrder ||
      row.operation.turn_id === subject.turnID ||
      row.operation.session_id !== subject.sessionID ||
      row.presentation.session_id !== subject.sessionID ||
      row.turn.admission_kind !== "learner" ||
      row.turn.depth !== 0
    ) {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    return {
      sessionID: row.operation.session_id,
      turnID: row.operation.turn_id,
      assistantMessageID: row.operation.assistant_message_id,
      timeSettled: row.operation.time_settled,
    } satisfies ConditionSource
  })
}

function materializeCandidate(
  tx: Transaction,
  envelope: InvocationEnvelope,
  command: CanonicalCommand,
  commandCause: Source,
  trusted: ValidatedAgentActionRegistration,
) {
  return Effect.gen(function* () {
    const agentAction = yield* agentActionProvenance(envelope, trusted)
    if (command.operation === "revise_from_learner_report" && agentAction.kind !== "root") {
      return yield* new InvalidCommandError({ reason: "source_unavailable" })
    }
    if (command.operation === "create") {
      const condition = yield* currentCondition(tx, command.conditionAssistantMessageID, commandCause)
      const proof = yield* MaterialMap.prepareEvidenceTargetProof(tx, {
        alignmentID: command.alignmentID,
        mapID: command.target.mapID,
        selectorID: command.target.selectorID,
        course: {
          courseID: command.target.courseID,
          viewID: command.target.viewID,
          revisionID: command.target.revisionID,
          itemID: command.target.itemID,
        },
      })
      if (proof.receipt.selectorByteLength <= 0 || proof.receipt.selectorByteLength > MAX_SELECTOR_BYTES) {
        return yield* new InvalidCommandError({ reason: "capacity_exceeded" })
      }
      const snapshot = targetSnapshot(proof.receipt)
      const materialized = {
        schemaVersion: 1,
        effectRecordID: createRecordID(),
        effectVersion: 0,
        canonicalCommand: command,
        commandCause,
        agentAction,
        subject: commandCause,
        condition,
        target: snapshot,
        programBasis: "tutor_interpretation",
        programDisposition: "active",
      } satisfies MaterializedCandidate
      return { semanticAddressFingerprint: fingerprint(semanticAddress(commandCause, snapshot)), materialized }
    }
    const current = yield* requireRecordSnapshot(tx, command.recordID)
    if (current.currentVersion !== command.expectedVersion) {
      return yield* new InvalidCommandError({ reason: "stale" })
    }
    if (command.operation === "revise_from_tutor_interpretation") {
      const subject = yield* currentSource(tx, current.subject.occurrenceID)
      const condition = yield* currentCondition(tx, current.condition.assistantMessageID, subject)
      if (!isDeepStrictEqual(subject, current.subject) || !isDeepStrictEqual(condition, current.condition)) {
        return yield* new InvalidCommandError({ reason: "source_unavailable" })
      }
    }
    if (
      command.operation === "revise_from_learner_report" &&
      commandCause.occurrenceID === current.subject.occurrenceID
    ) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    const materialized = {
      schemaVersion: 1,
      effectRecordID: current.recordID,
      effectVersion: current.currentVersion + 1,
      canonicalCommand: command,
      commandCause,
      agentAction,
      subject: current.subject,
      condition: current.condition,
      current,
      programBasis:
        command.operation === "revise_from_tutor_interpretation"
          ? "tutor_interpretation"
          : command.operation === "revise_from_learner_report"
            ? "learner_report"
            : current.basis,
      programDisposition: command.operation === "retract" ? "retracted" : "active",
    } satisfies MaterializedCandidate
    return {
      semanticAddressFingerprint: fingerprint(semanticAddress(current.subject, current.target)),
      materialized,
    }
  })
}

function resolveSemantic(tx: Transaction, materialized: MaterializedCandidate) {
  return Effect.gen(function* () {
    if (materialized.canonicalCommand.operation !== "create" || !materialized.target) {
      return { type: "new" as const }
    }
    const record = yield* recordByAddress(tx, materialized.subject, materialized.target)
    if (!record) return { type: "new" as const }
    const command = materialized.canonicalCommand
    const identical =
      record.current.relation === command.relation &&
      record.current.exposure === command.exposure &&
      record.current.basis === "tutor_interpretation" &&
      record.current.disposition === "active" &&
      isDeepStrictEqual(record.condition, materialized.condition)
    return { type: identical ? ("already_applied" as const) : ("semantic_conflict" as const), record }
  })
}

function recordByAddress(tx: Transaction, subject: Source, target: Target) {
  return tx
    .select({ id: LearnerResponseEvidenceRecordTable.id })
    .from(LearnerResponseEvidenceRecordTable)
    .where(
      and(
        eq(LearnerResponseEvidenceRecordTable.subject_occurrence_id, subject.occurrenceID),
        eq(LearnerResponseEvidenceRecordTable.map_id, target.mapID),
        eq(LearnerResponseEvidenceRecordTable.selector_id, target.selectorID),
        eq(LearnerResponseEvidenceRecordTable.course_id, target.courseID),
        eq(LearnerResponseEvidenceRecordTable.view_id, target.viewID),
        eq(LearnerResponseEvidenceRecordTable.course_revision_id, target.revisionID),
        eq(LearnerResponseEvidenceRecordTable.course_item_id, target.itemID),
      ),
    )
    .get()
    .pipe(
      Effect.orDie,
      Effect.flatMap((row) => (row ? readRecord(tx, row.id) : Effect.succeed(undefined))),
    )
}

function readRecord(tx: Transaction, recordID: RecordID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ record: LearnerResponseEvidenceRecordTable, revision: LearnerResponseEvidenceRevisionTable })
      .from(LearnerResponseEvidenceRecordTable)
      .innerJoin(
        LearnerResponseEvidenceRevisionTable,
        eq(LearnerResponseEvidenceRevisionTable.id, LearnerResponseEvidenceRecordTable.current_revision_id),
      )
      .innerJoin(
        LearnerResponseEvidenceCommitSealTable,
        eq(LearnerResponseEvidenceCommitSealTable.revision_id, LearnerResponseEvidenceRevisionTable.id),
      )
      .innerJoin(
        LearningCommandInvocationTable,
        and(
          eq(LearningCommandInvocationTable.part_id, LearnerResponseEvidenceCommitSealTable.invocation_part_id),
          eq(LearningCommandInvocationTable.status, "applied"),
          eq(LearningCommandInvocationTable.receipt_id, LearnerResponseEvidenceCommitSealTable.receipt_id),
        ),
      )
      .where(eq(LearnerResponseEvidenceRecordTable.id, recordID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return undefined
    return recordInfo(row.record, row.revision)
  })
}

function recordInfo(
  record: typeof LearnerResponseEvidenceRecordTable.$inferSelect,
  revision: typeof LearnerResponseEvidenceRevisionTable.$inferSelect,
): EvidenceRecord {
  return {
    id: record.id,
    subject: sourceFromRecord(record),
    condition: {
      sessionID: record.condition_session_id as ConditionSource["sessionID"],
      turnID: record.condition_turn_id as Turn.ID,
      assistantMessageID: record.condition_assistant_message_id as ConditionSource["assistantMessageID"],
      timeSettled: record.condition_time_settled,
    },
    target: targetFromRecord(record),
    current: revisionInfo(revision),
    timeCreated: record.time_created,
  }
}

function targetFromRecord(record: typeof LearnerResponseEvidenceRecordTable.$inferSelect): TargetSnapshot {
  return {
    mapID: record.map_id as TargetSnapshot["mapID"],
    selectorID: record.selector_id as TargetSnapshot["selectorID"],
    courseID: record.course_id as TargetSnapshot["courseID"],
    viewID: record.view_id as TargetSnapshot["viewID"],
    revisionID: record.course_revision_id as TargetSnapshot["revisionID"],
    itemID: record.course_item_id as TargetSnapshot["itemID"],
    alignmentID: record.admission_alignment_id as TargetSnapshot["alignmentID"],
    alignmentDispositionVersion: record.alignment_disposition_version,
    mapDispositionVersion: record.map_disposition_version,
    courseVersion: record.course_version,
    viewVersion: record.view_version,
    revisionVersion: record.course_revision_version,
  }
}

function sourceFromRecord(record: typeof LearnerResponseEvidenceRecordTable.$inferSelect): Source {
  return {
    occurrenceID: record.subject_occurrence_id,
    sourceOrder: record.subject_source_order,
    sessionID: record.subject_session_id as Source["sessionID"],
    messageID: record.subject_message_id as Source["messageID"],
    turnID: record.subject_turn_id as Turn.ID,
    inputID: record.subject_input_id as Turn.InputID,
    timeAdmitted: record.subject_time_admitted,
  }
}

function sourceFromRevision(
  row: typeof LearnerResponseEvidenceRevisionTable.$inferSelect,
  prefix: "basis" | "command_cause",
): Source {
  return prefix === "basis"
    ? {
        occurrenceID: row.basis_occurrence_id,
        sourceOrder: row.basis_source_order,
        sessionID: row.basis_session_id as Source["sessionID"],
        messageID: row.basis_message_id as Source["messageID"],
        turnID: row.basis_turn_id as Turn.ID,
        inputID: row.basis_input_id as Turn.InputID,
        timeAdmitted: row.basis_time_admitted,
      }
    : {
        occurrenceID: row.command_cause_occurrence_id,
        sourceOrder: row.command_cause_source_order,
        sessionID: row.command_cause_session_id as Source["sessionID"],
        messageID: row.command_cause_message_id as Source["messageID"],
        turnID: row.command_cause_turn_id as Turn.ID,
        inputID: row.command_cause_input_id as Turn.InputID,
        timeAdmitted: row.command_cause_time_admitted,
      }
}

function revisionInfo(row: typeof LearnerResponseEvidenceRevisionTable.$inferSelect): Revision {
  return {
    id: row.id,
    recordID: row.record_id,
    version: row.version,
    ...(row.predecessor_revision_id ? { predecessorID: row.predecessor_revision_id } : {}),
    operation: row.operation,
    relation: row.relation,
    exposure: row.exposure,
    basis: row.basis,
    disposition: row.disposition,
    basisSource: sourceFromRevision(row, "basis"),
    commandCause: sourceFromRevision(row, "command_cause"),
    invocationPartID: row.invocation_part_id,
    timeCommitted: row.time_committed,
    commitOrder: row.commit_order,
    frontierSequence: row.frontier_sequence,
  }
}

function recordSnapshot(record: EvidenceRecord): RecordSnapshot {
  return {
    recordID: record.id,
    target: record.target,
    subject: record.subject,
    condition: record.condition,
    currentRevisionID: record.current.id,
    currentVersion: record.current.version,
    relation: record.current.relation,
    exposure: record.current.exposure,
    basis: record.current.basis,
    disposition: record.current.disposition,
    basisSource: record.current.basisSource,
  }
}

function requireRecordSnapshot(tx: Transaction, recordID: RecordID) {
  return Effect.gen(function* () {
    const record = yield* readRecord(tx, recordID)
    if (!record) return yield* new InvalidCommandError({ reason: "source_unavailable" })
    return recordSnapshot(record)
  })
}

function assessmentFingerprint(record: EvidenceRecord) {
  return fingerprint({
    recordID: record.id,
    revisionID: record.current.id,
    version: record.current.version,
    relation: record.current.relation,
    exposure: record.current.exposure,
    basis: record.current.basis,
    disposition: record.current.disposition,
    basisSource: record.current.basisSource,
    condition: record.condition,
  })
}

function settleSemanticRace(
  tx: Transaction,
  invocation: typeof LearningCommandInvocationTable.$inferSelect,
  candidate: Candidate,
  settlement: SettlementMetadata,
) {
  return Effect.gen(function* () {
    if (candidate.canonicalCommand.operation !== "create") return undefined
    const semantic = yield* resolveSemantic(tx, candidate.materialized)
    if (semantic.type === "new") return undefined
    if (semantic.type === "already_applied") {
      const result = yield* settleAlreadyApplied(tx, invocation.part_id, semantic.record.current.id, settlement)
      return { type: "settled" as const, settlement: result }
    }
    const result = errorSettlement("semantic_conflict", settlement, {
      recordID: semantic.record.id,
      revisionID: semantic.record.current.id,
      version: semantic.record.current.version,
    })
    yield* settlePhysicalInvocation(tx, invocation.part_id, result)
    return { type: "settled" as const, settlement: result }
  })
}

function settleAlreadyApplied(tx: Transaction, partID: PartID, revisionID: RevisionID, metadata: SettlementMetadata) {
  return Effect.gen(function* () {
    const applied = yield* readAppliedRevision(tx, revisionID)
    const settlement = {
      ...applied,
      outcome: "already_applied",
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies AlreadyAppliedSettlement
    yield* settlePhysicalInvocation(tx, partID, settlement)
    return settlement
  })
}

function readAppliedRevision(tx: Transaction, revisionID: RevisionID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({
        revision: LearnerResponseEvidenceRevisionTable,
        record: LearnerResponseEvidenceRecordTable,
        receiptID: LearningCommandReceiptTable.id,
      })
      .from(LearnerResponseEvidenceRevisionTable)
      .innerJoin(
        LearnerResponseEvidenceRecordTable,
        eq(LearnerResponseEvidenceRecordTable.id, LearnerResponseEvidenceRevisionTable.record_id),
      )
      .innerJoin(
        LearnerResponseEvidenceCommitSealTable,
        eq(LearnerResponseEvidenceCommitSealTable.revision_id, LearnerResponseEvidenceRevisionTable.id),
      )
      .innerJoin(
        LearningCommandReceiptTable,
        eq(LearningCommandReceiptTable.id, LearnerResponseEvidenceCommitSealTable.receipt_id),
      )
      .innerJoin(
        LearningCommandInvocationTable,
        and(
          eq(LearningCommandInvocationTable.part_id, LearnerResponseEvidenceCommitSealTable.invocation_part_id),
          eq(LearningCommandInvocationTable.status, "applied"),
          eq(LearningCommandInvocationTable.receipt_id, LearningCommandReceiptTable.id),
        ),
      )
      .where(eq(LearnerResponseEvidenceRevisionTable.id, revisionID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* integrity(`Learner-response-evidence revision ${revisionID} is not durably applied`)
    return {
      outcome: "applied",
      evidenceKind: "learner_response_evidence",
      schemaVersion: 1,
      receiptID: row.receiptID,
      effectID: row.revision.id,
      recordID: row.revision.record_id,
      revisionID: row.revision.id,
      version: row.revision.version,
      subject: sourceFromRecord(row.record),
      target: targetFromRecord(row.record),
      operation: row.revision.operation,
      relation: row.revision.relation,
      exposure: row.revision.exposure,
      basis: row.revision.basis,
      disposition: row.revision.disposition,
      frontierSequence: row.revision.frontier_sequence,
      settlementTime: row.revision.time_committed,
      settlementOrder: row.revision.commit_order,
    } satisfies AppliedSettlement
  })
}

function readDisposition(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerResponseEvidenceDispositionTable)
    .where(eq(LearnerResponseEvidenceDispositionTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function candidateInfo(row: typeof LearnerResponseEvidenceDispositionTable.$inferSelect): Candidate {
  if (
    row.disposition !== "candidate_v1" ||
    !row.agent_action_fingerprint ||
    !row.agent_action ||
    !row.materialized_candidate
  ) {
    throw new Error("Learner-response-evidence candidate row is structurally incomplete")
  }
  return {
    kind: "candidate_v1",
    commandFingerprint: row.command_fingerprint,
    semanticAddressFingerprint: row.semantic_address_fingerprint,
    agentActionFingerprint: row.agent_action_fingerprint,
    canonicalCommand: row.canonical_command,
    agentAction: row.agent_action,
    materialized: row.materialized_candidate,
  }
}

function semanticTerminalInfo(row: typeof LearnerResponseEvidenceDispositionTable.$inferSelect): SemanticTerminal {
  if (
    row.disposition !== "semantic_terminal_v1" ||
    !row.semantic_outcome ||
    !row.existing_record_id ||
    !row.existing_revision_id ||
    !row.existing_assessment_fingerprint
  ) {
    throw new Error("Learner-response-evidence semantic-terminal row is structurally incomplete")
  }
  return {
    kind: "semantic_terminal_v1",
    outcome: row.semantic_outcome,
    canonicalCommand: row.canonical_command,
    commandFingerprint: row.command_fingerprint,
    semanticAddressFingerprint: row.semantic_address_fingerprint,
    existingRecordID: row.existing_record_id,
    existingRevisionID: row.existing_revision_id,
    existingAssessmentFingerprint: row.existing_assessment_fingerprint,
  }
}

function requireCandidate(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, partID)
    if (invocation.status !== "admitted") {
      return yield* integrity("Learner-response-evidence capability requires an admitted candidate")
    }
    const row = yield* readDisposition(tx, partID)
    if (!row || row.disposition !== "candidate_v1") {
      return yield* integrity("Learner-response-evidence invocation has no candidate disposition")
    }
    return candidateInfo(row)
  })
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
      return yield* integrity("Learner-response-evidence invocation is unavailable")
    }
    return invocation
  })
}

function readCapabilityIssue(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerResponseEvidenceCapabilityIssueTable)
    .where(eq(LearnerResponseEvidenceCapabilityIssueTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function readCapabilitySettlement(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerResponseEvidenceCapabilitySettlementTable)
    .where(eq(LearnerResponseEvidenceCapabilitySettlementTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilityIssueInfo(row: typeof LearnerResponseEvidenceCapabilityIssueTable.$inferSelect) {
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

function capabilitySettlementInfo(row: typeof LearnerResponseEvidenceCapabilitySettlementTable.$inferSelect) {
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

function requireEnvelope(envelope: InvocationEnvelope) {
  return envelope.capabilityIdentity === UPDATE_CAPABILITY &&
    envelope.capabilityVersion === UPDATE_VERSION &&
    envelope.authorizationBasis === "agent_action"
    ? Effect.void
    : integrity("Learner-response-evidence envelope has an incompatible capability or provenance basis")
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

function invocationEnvelope(invocation: typeof LearningCommandInvocationTable.$inferSelect): InvocationEnvelope {
  if (!invocation.turn_id || !invocation.input_id) throw new Error("Learner-response-evidence invocation lost Turn identity")
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
): Effect.Effect<AgentAction, IntegrityError> {
  return Effect.gen(function* () {
    if (
      trusted.occurrenceID !== envelope.occurrenceID ||
      trusted.depth !== trusted.lineage.length ||
      (trusted.admissionKind === "learner" && (trusted.depth !== 0 || trusted.lineage.length !== 0)) ||
      (trusted.admissionKind === "delegated_task" && (trusted.depth <= 0 || trusted.lineage.length === 0))
    ) {
      return yield* integrity("Learner-response-evidence Agent action has no exact root-or-delegated lineage")
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
      capabilityIdentity: UPDATE_CAPABILITY,
      capabilityVersion: UPDATE_VERSION,
      issuingModelOperationID: envelope.assistantMessageID,
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
      return yield* integrity("Delegated learner-response-evidence action has no exact effective capability")
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
    }
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

function settleDomainFailure(tx: Transaction, partID: PartID, settlement: ReturnType<typeof errorSettlement>) {
  return Effect.gen(function* () {
    yield* settlePhysicalInvocation(tx, partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

function evidenceErrorSettlement(error: unknown, metadata: SettlementMetadata) {
  if (error instanceof InvalidCommandError) {
    if (error.reason === "capacity_exceeded") return errorSettlement("capacity_exceeded", metadata)
    if (error.reason === "source_unavailable") return errorSettlement("source_unavailable", metadata)
    if (error.reason === "stale") return errorSettlement("stale", metadata)
    return errorSettlement("validation_error", metadata)
  }
  const tag = isRecord(error) && typeof error._tag === "string" ? error._tag : ""
  if (tag.includes("Conflict") || tag.includes("Stale")) return errorSettlement("stale", metadata)
  if (tag.includes("Inactive") || tag.includes("Unavailable") || tag.includes("NotFound")) {
    return errorSettlement("source_unavailable", metadata)
  }
  if (tag.includes("Preparation") && isRecord(error) && error.code === "over_budget") {
    return errorSettlement("capacity_exceeded", metadata)
  }
  return errorSettlement("validation_error", metadata)
}

function capabilityErrorCode(outcome: CapabilityOutcome) {
  if (outcome === "policy_deny" || outcome === "prompted_deny") return "permission_rejected" as const
  if (outcome === "prompted_correct") return "permission_corrected" as const
  if (outcome === "prompted_cancel") return "cancelled" as const
  return "interrupted" as const
}

function onlyKeys(value: { readonly [key: string]: unknown }, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key)) && Object.keys(value).length === keys.length
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
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

function integrity(detail: string) {
  return Effect.fail(new IntegrityError({ detail }))
}
