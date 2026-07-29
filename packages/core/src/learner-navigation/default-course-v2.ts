import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type { Turn } from "@opencode-ai/schema/turn"
import { Course } from "../course"
import {
  CourseTable,
  CourseViewRevisionStateTable,
  CourseViewRevisionTable,
  CourseViewTable,
  CourseWorkingSelectionTable,
} from "../course/sql"
import { LearnerNavigation } from "../learner-navigation"
import { LearningFrontier } from "../learning-frontier"
import { Occurrence } from "../learning-command/occurrence"
import {
  AdmittedLearnerOccurrenceTable,
  HistoricalLearningToolPresentationTable,
} from "../learning-command/occurrence.sql"
import {
  admitPhysicalInvocation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  invocationConflict,
  lookupPhysicalInvocation,
  occurrenceAvailable,
  settlePhysicalInvocation,
} from "../learning-command/physical"
import type { InvocationEnvelope, SettlementMetadata } from "../learning-command/physical-schema"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "../learning-command/sql"
import type { Transaction } from "../learning-command/transaction"
import type { SessionSchema } from "../session/schema"
import { MessageTable, PartTable } from "../session/sql"
import {
  TurnCandidatePresentationTable,
  TurnHistoricalToolPresentationTable,
  TurnModelOperationTable,
  TurnToolCandidateTable,
  TurnToolInvocationTable,
} from "../turn/sql"
import type { PermissionV1 } from "../v1/permission"
import { SessionV1, type MessageID, type PartID } from "../v1/session"
import {
  createDefaultEffectID,
  IntegrityError,
  type DefaultCourseAcknowledgement,
  type DefaultCourseCapabilityOutcome,
  type DefaultCourseCommand,
  type DefaultCourseEndpointV2,
  type DefaultCourseOperation,
  type DefaultCourseProposal,
  type DefaultCourseResolutionScope,
  type DefaultCourseSemanticAddress,
  type DefaultCourseSemanticTerminalDisposition,
  type DefaultCourseStableLocatorV2,
  type DefaultEffect,
} from "./schema"
import {
  DefaultCoursePreferenceTransitionTable,
  LearnerDefaultCourseAcknowledgementTable,
  LearnerDefaultCourseCapabilityIssueTable,
  LearnerDefaultCourseCapabilitySettlementTable,
  LearnerDefaultCourseCommitSealTable,
  LearnerDefaultCourseDispositionTable,
  LearnerDefaultCourseProposalTable,
} from "./sql"

export const PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY = "propose_default_course_preference"
export const PROPOSE_DEFAULT_COURSE_PREFERENCE_VERSION = 1
export const SET_DEFAULT_COURSE_PREFERENCE_V2_CAPABILITY = "set_default_course_preference"
export const SET_DEFAULT_COURSE_PREFERENCE_V2_VERSION = 2
const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

export type DefaultCourseProposalPreparationInput = Readonly<{
  partID: PartID
  turnID: Turn.ID
  sessionID: SessionSchema.ID
  assistantMessageID: MessageID
  callID: string
  emissionOrdinal: number
  command: DefaultCourseCommand
  resolutionScope: DefaultCourseResolutionScope
  timePresented: number
}>

export type DefaultCourseProposalRecordInput = Readonly<{
  proposal: DefaultCourseProposal
  completedPart: SessionV1.ToolPart
}>

export type ResolvedDefaultCourseProposal = DefaultCourseProposal &
  Readonly<{
    presentationPartID: PartID
    presentationAssistantMessageID: MessageID
    acceptanceOccurrenceID: OccurrenceID
    selection: "sole_presented" | "explicit_reference"
  }>

export type DefaultCourseV2Authorization = Readonly<{
  kind: "direct_request_v2" | "accepted_proposal_v2"
  fingerprint: string
  command: DefaultCourseCommand
  commandFingerprint: string
  source: Readonly<{
    occurrenceID: OccurrenceID
    excerpt: string
  }> &
    (
      | Readonly<{ kind: "direct_request_v2" }>
      | Readonly<{
          kind: "accepted_proposal_v2"
          proposalPartID: PartID
          proposalPresentationPartID: PartID
          proposalPresentationAssistantMessageID: MessageID
          proposalAssistantMessageID: MessageID
          proposalEmissionOrdinal: number
          proposalFingerprint: string
          selection: "sole_presented" | "explicit_reference"
        }>
    )
  resolutionScope: DefaultCourseResolutionScope
  resolutionFingerprint: string
  preferenceHeadID: DefaultEffect["id"] | null
  preferenceVersion: number
  operation: DefaultCourseOperation
  from: DefaultCourseEndpointV2
  to: DefaultCourseEndpointV2
}>

export type DefaultCourseV2ResultDisposition =
  | Readonly<{ kind: "candidate_v2"; authorization: DefaultCourseV2Authorization }>
  | DefaultCourseSemanticTerminalDisposition

export type DirectDefaultCourseAuthorizationInput = Readonly<{
  kind: "direct_request_v2"
  envelope: InvocationEnvelope
  settlement?: SettlementMetadata
  command: DefaultCourseCommand
  sourceExcerpt: string
  resolutionScope: DefaultCourseResolutionScope
}>

export type AcceptedDefaultCourseAuthorizationInput = Readonly<{
  kind: "accepted_proposal_v2"
  envelope: InvocationEnvelope
  settlement?: SettlementMetadata
  proposal: ResolvedDefaultCourseProposal
  sourceExcerpt: string
}>

export type DefaultCourseAuthorizationInput =
  | DirectDefaultCourseAuthorizationInput
  | AcceptedDefaultCourseAuthorizationInput

export type DefaultCoursePolicyInput = Readonly<{
  partID: PartID
  outcome: "policy_allow" | "policy_deny"
  policyBasis: Readonly<Record<string, unknown>>
  time: number
  order: number
}>

export type DefaultCoursePromptIssueInput = Readonly<{
  partID: PartID
  requestID: PermissionV1.ID
  policyBasis: Readonly<Record<string, unknown>>
  shownScope: Readonly<Record<string, unknown>>
  time: number
  order: number
}>

export type DefaultCoursePromptSettlementInput = Readonly<{
  partID: PartID
  requestID: PermissionV1.ID
  outcome: "prompted_allow" | "prompted_deny" | "prompted_correct" | "prompted_cancel"
  reply: Readonly<Record<string, unknown>>
  time: number
  order: number
}>

export type DefaultCourseInvocationVersion = Readonly<{
  version: 1 | 2
  status: "admitted" | "applied" | "already_applied" | "no_change" | "error"
  settlement: unknown
  disposition: "legacy_v1" | "semantic_terminal_v2" | "candidate_v2"
  authorizationFingerprint?: string
  authorization?: DefaultCourseV2Authorization
  semanticTerminal?: DefaultCourseSemanticTerminalDisposition
  acknowledgement?: DefaultCourseAcknowledgement
}>

export function prepareDefaultCourseProposal(tx: Transaction, input: DefaultCourseProposalPreparationInput) {
  return Effect.gen(function* () {
    const commandFingerprint = fingerprint(input.command)
    const resolutionFingerprint = fingerprint(input.resolutionScope)
    const existing = yield* tx
      .select()
      .from(LearnerDefaultCourseProposalTable)
      .where(eq(LearnerDefaultCourseProposalTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      const stored = proposalInfo(existing)
      if (
        stored.turnID !== input.turnID ||
        stored.sessionID !== input.sessionID ||
        stored.assistantMessageID !== input.assistantMessageID ||
        stored.callID !== input.callID ||
        stored.emissionOrdinal !== input.emissionOrdinal ||
        stored.commandFingerprint !== commandFingerprint ||
        stored.resolutionFingerprint !== resolutionFingerprint
      ) {
        return yield* integrity("Default-Course proposal identity conflicts with its immutable seal")
      }
      return stored
    }

    yield* validateResolutionScope(tx, input.command, input.resolutionScope, false)
    const candidate = yield* tx
      .select({
        turnID: TurnToolCandidateTable.turn_id,
        sessionID: TurnToolCandidateTable.session_id,
        assistantMessageID: TurnToolCandidateTable.assistant_message_id,
        callID: TurnToolCandidateTable.call_id,
        tool: TurnToolCandidateTable.tool,
        emissionOrdinal: TurnToolCandidateTable.emission_ordinal,
        state: TurnToolCandidateTable.state,
        timeRegistered: TurnToolCandidateTable.time_registered,
        part: PartTable.data,
        partTimeUpdated: PartTable.time_updated,
        presentationPartID: TurnCandidatePresentationTable.part_id,
        invocationPartID: TurnToolInvocationTable.part_id,
        invocationState: TurnToolInvocationTable.state,
        physicalInvocationPartID: LearningCommandInvocationTable.part_id,
      })
      .from(TurnToolCandidateTable)
      .innerJoin(PartTable, eq(PartTable.id, TurnToolCandidateTable.part_id))
      .innerJoin(
        TurnCandidatePresentationTable,
        eq(TurnCandidatePresentationTable.part_id, TurnToolCandidateTable.part_id),
      )
      .leftJoin(TurnToolInvocationTable, eq(TurnToolInvocationTable.part_id, TurnToolCandidateTable.part_id))
      .leftJoin(
        LearningCommandInvocationTable,
        eq(LearningCommandInvocationTable.part_id, TurnToolCandidateTable.part_id),
      )
      .where(eq(TurnToolCandidateTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !candidate ||
      candidate.turnID !== input.turnID ||
      candidate.sessionID !== input.sessionID ||
      candidate.assistantMessageID !== input.assistantMessageID ||
      candidate.callID !== input.callID ||
      candidate.tool !== PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY ||
      candidate.emissionOrdinal !== input.emissionOrdinal ||
      candidate.state !== "admitted" ||
      candidate.presentationPartID !== input.partID ||
      candidate.invocationPartID !== input.partID ||
      candidate.invocationState !== "running" ||
      candidate.physicalInvocationPartID !== null ||
      !isProposalPartIdentity(candidate.part, input.callID) ||
      input.timePresented < candidate.timeRegistered
    ) {
      return yield* integrity("Default-Course proposal was not host-prepared from one admitted running Turn invocation")
    }

    const snapshot = yield* prepareSnapshot(tx, input.command)
    return proposalPreparation(input, snapshot, commandFingerprint, resolutionFingerprint)
  })
}

export function recordDefaultCourseProposal(tx: Transaction, input: DefaultCourseProposalRecordInput) {
  return Effect.gen(function* () {
    const completedPart = storedPart(input.completedPart)
    const terminalPartFingerprint = fingerprint(completedPart)
    const existing = yield* tx
      .select()
      .from(LearnerDefaultCourseProposalTable)
      .where(eq(LearnerDefaultCourseProposalTable.part_id, input.proposal.partID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      const part = yield* tx
        .select({ data: PartTable.data })
        .from(PartTable)
        .where(eq(PartTable.id, input.proposal.partID))
        .get()
        .pipe(Effect.orDie)
      const stored = proposalInfo(existing)
      if (
        fingerprint(stored) !== fingerprint(input.proposal) ||
        existing.terminal_part_fingerprint !== terminalPartFingerprint ||
        !part ||
        fingerprint(part.data) !== terminalPartFingerprint ||
        !isTruthfulCompletedProposalPart(input.completedPart, input.proposal)
      ) {
        return yield* integrity("Default-Course proposal replay conflicts with its immutable proposal or Tool result")
      }
      return stored
    }

    yield* validateResolutionScope(tx, input.proposal.command, input.proposal.resolutionScope, false)
    const candidate = yield* tx
      .select({
        turnID: TurnToolCandidateTable.turn_id,
        sessionID: TurnToolCandidateTable.session_id,
        assistantMessageID: TurnToolCandidateTable.assistant_message_id,
        callID: TurnToolCandidateTable.call_id,
        tool: TurnToolCandidateTable.tool,
        emissionOrdinal: TurnToolCandidateTable.emission_ordinal,
        state: TurnToolCandidateTable.state,
        timeRegistered: TurnToolCandidateTable.time_registered,
        part: PartTable.data,
        partTimeUpdated: PartTable.time_updated,
        presentationPartID: TurnCandidatePresentationTable.part_id,
        invocationPartID: TurnToolInvocationTable.part_id,
        invocationState: TurnToolInvocationTable.state,
        physicalInvocationPartID: LearningCommandInvocationTable.part_id,
      })
      .from(TurnToolCandidateTable)
      .innerJoin(PartTable, eq(PartTable.id, TurnToolCandidateTable.part_id))
      .innerJoin(
        TurnCandidatePresentationTable,
        eq(TurnCandidatePresentationTable.part_id, TurnToolCandidateTable.part_id),
      )
      .leftJoin(TurnToolInvocationTable, eq(TurnToolInvocationTable.part_id, TurnToolCandidateTable.part_id))
      .leftJoin(
        LearningCommandInvocationTable,
        eq(LearningCommandInvocationTable.part_id, TurnToolCandidateTable.part_id),
      )
      .where(eq(TurnToolCandidateTable.part_id, input.proposal.partID))
      .get()
      .pipe(Effect.orDie)
    const snapshot = yield* prepareSnapshot(tx, input.proposal.command)
    const prepared = proposalPreparation(
      {
        partID: input.proposal.partID,
        turnID: input.proposal.turnID,
        sessionID: input.proposal.sessionID,
        assistantMessageID: input.proposal.assistantMessageID,
        callID: input.proposal.callID,
        emissionOrdinal: input.proposal.emissionOrdinal,
        command: input.proposal.command,
        resolutionScope: input.proposal.resolutionScope,
        timePresented: input.proposal.timePresented,
      },
      snapshot,
      fingerprint(input.proposal.command),
      fingerprint(input.proposal.resolutionScope),
    )
    if (
      !candidate ||
      candidate.turnID !== input.proposal.turnID ||
      candidate.sessionID !== input.proposal.sessionID ||
      candidate.assistantMessageID !== input.proposal.assistantMessageID ||
      candidate.callID !== input.proposal.callID ||
      candidate.tool !== PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY ||
      candidate.emissionOrdinal !== input.proposal.emissionOrdinal ||
      candidate.state !== "admitted" ||
      candidate.presentationPartID !== input.proposal.partID ||
      candidate.invocationPartID !== input.proposal.partID ||
      candidate.invocationState !== "running" ||
      candidate.physicalInvocationPartID !== null ||
      !isProposalPartIdentity(candidate.part, input.proposal.callID) ||
      fingerprint(prepared) !== fingerprint(input.proposal) ||
      input.completedPart.id !== input.proposal.partID ||
      input.completedPart.sessionID !== input.proposal.sessionID ||
      input.completedPart.messageID !== input.proposal.assistantMessageID ||
      !sameProposalPartInput(candidate.part, input.completedPart) ||
      !isTruthfulCompletedProposalPart(input.completedPart, input.proposal) ||
      input.proposal.timePresented < candidate.timeRegistered
    ) {
      return yield* integrity("Default-Course proposal completion diverges from its prepared Turn invocation")
    }
    yield* tx
      .update(PartTable)
      .set({
        data: completedPart,
        time_updated: Math.max(candidate.partTimeUpdated, input.proposal.timePresented),
      })
      .where(eq(PartTable.id, input.proposal.partID))
      .run()
      .pipe(Effect.orDie)

    yield* tx
      .insert(LearnerDefaultCourseProposalTable)
      .values({
        part_id: input.proposal.partID,
        turn_id: input.proposal.turnID,
        session_id: input.proposal.sessionID,
        assistant_message_id: input.proposal.assistantMessageID,
        call_id: input.proposal.callID,
        emission_ordinal: input.proposal.emissionOrdinal,
        command_snapshot: input.proposal.command,
        command_fingerprint: input.proposal.commandFingerprint,
        resolution_scope: input.proposal.resolutionScope,
        resolution_fingerprint: input.proposal.resolutionFingerprint,
        preference_head_id: input.proposal.preferenceHeadID,
        preference_version: input.proposal.preferenceVersion,
        operation: input.proposal.operation,
        from_locator: input.proposal.from,
        to_locator: input.proposal.to,
        proposal_fingerprint: input.proposal.fingerprint,
        terminal_part_fingerprint: terminalPartFingerprint,
        time_presented: input.proposal.timePresented,
      })
      .run()
      .pipe(Effect.orDie)
    return input.proposal
  })
}

export function readRecordedDefaultCourseProposal(
  tx: Transaction,
  input: Readonly<{
    partID: PartID
    turnID: Turn.ID
    sessionID: SessionSchema.ID
    assistantMessageID: MessageID
    callID: string
    emissionOrdinal: number
    modelInput: unknown
  }>,
) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(LearnerDefaultCourseProposalTable)
      .where(eq(LearnerDefaultCourseProposalTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return undefined
    const part = yield* tx.select().from(PartTable).where(eq(PartTable.id, input.partID)).get().pipe(Effect.orDie)
    const proposal = proposalInfo(row)
    if (
      proposal.turnID !== input.turnID ||
      proposal.sessionID !== input.sessionID ||
      proposal.assistantMessageID !== input.assistantMessageID ||
      proposal.callID !== input.callID ||
      proposal.emissionOrdinal !== input.emissionOrdinal ||
      !part ||
      part.session_id !== input.sessionID ||
      part.message_id !== input.assistantMessageID
    ) {
      return yield* integrity("Recorded Default-Course proposal conflicts with its Turn identity")
    }
    if (part.data.type !== "tool") {
      return yield* integrity("Recorded Default-Course proposal Part changed its Tool identity")
    }
    const completedPart = Option.getOrUndefined(
      Schema.decodeUnknownOption(SessionV1.ToolPart)({
        id: part.id,
        sessionID: part.session_id,
        messageID: part.message_id,
        ...part.data,
      }),
    )
    if (
      !completedPart ||
      row.terminal_part_fingerprint !== fingerprint(part.data) ||
      fingerprint(completedPart.state.input) !== fingerprint(input.modelInput) ||
      !isTruthfulCompletedProposalPart(completedPart, proposal)
    ) {
      return yield* integrity("Recorded Default-Course proposal has no exact completed Tool seal")
    }
    return proposal
  })
}

export function resolveDefaultCourseProposalPresentation(
  tx: Transaction,
  input: Readonly<{
    partID: PartID
    acceptanceOccurrenceID: OccurrenceID
    selection: "sole_presented" | "explicit_reference"
  }>,
) {
  return Effect.gen(function* () {
    const sourcePartID = yield* resolveProposalSourcePart(tx, input.partID)
    const proposal = yield* tx
      .select()
      .from(LearnerDefaultCourseProposalTable)
      .where(eq(LearnerDefaultCourseProposalTable.part_id, sourcePartID))
      .get()
      .pipe(Effect.orDie)
    if (!proposal) return yield* integrity("Historical Tool presentation does not resolve to a sealed proposal")
    const occurrence = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, input.acceptanceOccurrenceID))
      .get()
      .pipe(Effect.orDie)
    const presentation = yield* tx
      .select({ assistantMessageID: PartTable.message_id })
      .from(PartTable)
      .where(eq(PartTable.id, input.partID))
      .get()
      .pipe(Effect.orDie)
    const model = yield* tx
      .select({ occurrenceID: TurnModelOperationTable.causal_occurrence_id })
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, proposal.assistant_message_id))
      .get()
      .pipe(Effect.orDie)
    const presentationTime =
      sourcePartID === input.partID
        ? proposal.time_presented
        : yield* historicalPresentationTime(tx, input.partID, sourcePartID)
    if (
      !occurrence ||
      !presentation ||
      !model ||
      model.occurrenceID === input.acceptanceOccurrenceID ||
      occurrence.time_admitted <= proposal.time_presented ||
      occurrence.time_admitted <= presentationTime
    ) {
      return yield* integrity("Default-Course proposal acceptance is not strictly later than its presentation")
    }
    if (input.selection === "sole_presented") {
      const proposals = yield* tx
        .select({ partID: LearnerDefaultCourseProposalTable.part_id })
        .from(LearnerDefaultCourseProposalTable)
        .where(eq(LearnerDefaultCourseProposalTable.assistant_message_id, proposal.assistant_message_id))
        .all()
        .pipe(Effect.orDie)
      if (proposals.length !== 1) {
        return yield* integrity("A generic acceptance cannot select among multiple proposals in one Assistant Message")
      }
    }
    return {
      ...proposalInfo(proposal),
      presentationPartID: input.partID,
      presentationAssistantMessageID: presentation.assistantMessageID,
      acceptanceOccurrenceID: input.acceptanceOccurrenceID,
      selection: input.selection,
    } satisfies ResolvedDefaultCourseProposal
  })
}

export function reserveDefaultCourseV2(tx: Transaction, input: DefaultCourseAuthorizationInput) {
  return Effect.gen(function* () {
    const command = input.kind === "direct_request_v2" ? input.command : input.proposal.command
    const physicalFingerprint = invocationFingerprint(input, command)
    const existing = yield* findPhysicalInvocation(tx, input, physicalFingerprint, {
      name: SET_DEFAULT_COURSE_PREFERENCE_V2_CAPABILITY,
      version: SET_DEFAULT_COURSE_PREFERENCE_V2_VERSION,
    })
    if (existing) {
      const disposition = yield* requireDefaultCourseDisposition(tx, existing.part_id)
      const authorization =
        disposition.disposition === "candidate_v2"
          ? yield* authorizationInfo(disposition, existing.occurrence_id)
          : undefined
      const semanticTerminal =
        disposition.disposition === "semantic_terminal_v2" ? yield* semanticTerminalInfo(disposition) : undefined
      if (existing.status === "admitted") {
        if (!authorization || disposition.disposition !== "candidate_v2") {
          return yield* integrity("Only a complete Default-Course candidate may remain admitted")
        }
        return {
          type: "admitted" as const,
          authorizationFingerprint: authorization.fingerprint,
          authorization,
        }
      }
      return {
        type: "replay" as const,
        settlement: existing.settlement,
        disposition: disposition.disposition,
        ...(authorization ? { authorization } : {}),
        ...(semanticTerminal ? { semanticTerminal } : {}),
        acknowledgement: yield* readDefaultCourseAcknowledgement(tx, { partID: existing.part_id }),
      }
    }

    yield* requireV2Envelope(input)
    const commandFingerprint = fingerprint(command)
    const address = semanticAddress(input.envelope.occurrenceID)
    const addressFingerprint = fingerprint(address)
    const incomingPayloadFingerprint = defaultPayloadFingerprint(command.target?.courseID ?? null)
    const semantic = yield* LearnerNavigation.resolveDefaultEffect(tx, {
      occurrenceID: input.envelope.occurrenceID,
      targetCourseID: command.target?.courseID ?? null,
    }).pipe(Effect.orDie)
    if (semantic.type !== "new") {
      if (!input.settlement) {
        return yield* integrity("Default-Course semantic-terminal admission has no settlement metadata")
      }
      const semanticTerminal = {
        kind: "semantic_terminal_v2",
        outcome: semantic.type,
        command,
        commandFingerprint,
        semanticAddress: address,
        semanticAddressFingerprint: addressFingerprint,
        incomingPayloadFingerprint,
        existingEffectID: semantic.effect.id,
        existingPayloadFingerprint: defaultPayloadFingerprint(semantic.effect.courseID),
      } satisfies DefaultCourseSemanticTerminalDisposition
      yield* admitPhysicalInvocation(tx, {
        envelope: input.envelope,
        fingerprint: physicalFingerprint,
        command: {
          name: SET_DEFAULT_COURSE_PREFERENCE_V2_CAPABILITY,
          version: SET_DEFAULT_COURSE_PREFERENCE_V2_VERSION,
        },
      })
      yield* tx
        .insert(LearnerDefaultCourseDispositionTable)
        .values({
          invocation_part_id: input.envelope.partID,
          disposition: "semantic_terminal_v2",
          command_fingerprint: commandFingerprint,
          semantic_outcome: semantic.type,
          command_snapshot: command,
          semantic_address: address,
          semantic_address_fingerprint: addressFingerprint,
          incoming_payload_fingerprint: incomingPayloadFingerprint,
          existing_effect_id: semantic.effect.id,
          existing_payload_fingerprint: defaultPayloadFingerprint(semantic.effect.courseID),
          time_disposed: input.envelope.timeAdmitted,
        })
        .run()
        .pipe(Effect.orDie)
      if (semantic.type === "already_applied") {
        const settled = yield* settleAlreadyApplied(tx, input.envelope.partID, semantic, input.settlement)
        return { ...settled, semanticTerminal }
      }
      const settlement = errorSettlement("semantic_conflict", input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement, semanticTerminal }
    }

    const sourceExcerpt = input.sourceExcerpt
    if (!sourceExcerpt.trim()) return yield* integrity("Default-Course semantic authorization has no source excerpt")
    yield* requireSourceExcerpt(tx, input.envelope, sourceExcerpt)
    if (input.kind === "direct_request_v2") {
      yield* validateResolutionScope(tx, command, input.resolutionScope, true)
    }
    const proposal =
      input.kind === "accepted_proposal_v2"
        ? yield* requireStoredProposal(tx, input.proposal, input.envelope)
        : undefined
    const resolutionScope = input.kind === "direct_request_v2" ? input.resolutionScope : proposal!.resolutionScope
    const snapshot = yield* prepareSnapshot(tx, command)
    if (proposal) {
      yield* validateResolutionScope(tx, command, proposal.resolutionScope, false)
      yield* requireProposalSnapshot(proposal, snapshot)
    }
    const resolutionFingerprint = fingerprint(resolutionScope)
    const authorizationFingerprint = fingerprint({
      kind: input.kind,
      occurrenceID: input.envelope.occurrenceID,
      sourceExcerpt,
      commandFingerprint,
      resolutionFingerprint,
      preferenceHeadID: snapshot.preferenceHeadID,
      preferenceVersion: snapshot.preferenceVersion,
      operation: snapshot.operation,
      from: snapshot.from,
      to: snapshot.to,
      ...(proposal
        ? {
            proposalPartID: proposal.partID,
            proposalPresentationPartID: proposal.presentationPartID,
            proposalPresentationAssistantMessageID: proposal.presentationAssistantMessageID,
            proposalAssistantMessageID: proposal.assistantMessageID,
            proposalEmissionOrdinal: proposal.emissionOrdinal,
            proposalFingerprint: proposal.fingerprint,
            proposalSelection: proposal.selection,
          }
        : {}),
    })
    const authorization = {
      kind: input.kind,
      fingerprint: authorizationFingerprint,
      command,
      commandFingerprint,
      source:
        input.kind === "direct_request_v2"
          ? {
              kind: "direct_request_v2" as const,
              occurrenceID: input.envelope.occurrenceID,
              excerpt: sourceExcerpt,
            }
          : {
              kind: "accepted_proposal_v2" as const,
              occurrenceID: input.envelope.occurrenceID,
              excerpt: sourceExcerpt,
              proposalPartID: proposal!.partID,
              proposalPresentationPartID: proposal!.presentationPartID,
              proposalPresentationAssistantMessageID: proposal!.presentationAssistantMessageID,
              proposalAssistantMessageID: proposal!.assistantMessageID,
              proposalEmissionOrdinal: proposal!.emissionOrdinal,
              proposalFingerprint: proposal!.fingerprint,
              selection: proposal!.selection,
            },
      resolutionScope,
      resolutionFingerprint,
      preferenceHeadID: snapshot.preferenceHeadID,
      preferenceVersion: snapshot.preferenceVersion,
      operation: snapshot.operation,
      from: snapshot.from,
      to: snapshot.to,
    } satisfies DefaultCourseV2Authorization
    yield* admitPhysicalInvocation(tx, {
      envelope: input.envelope,
      fingerprint: physicalFingerprint,
      command: {
        name: SET_DEFAULT_COURSE_PREFERENCE_V2_CAPABILITY,
        version: SET_DEFAULT_COURSE_PREFERENCE_V2_VERSION,
      },
    })
    yield* tx
      .insert(LearnerDefaultCourseDispositionTable)
      .values({
        invocation_part_id: input.envelope.partID,
        disposition: "candidate_v2",
        authorization_version: 2,
        authorization_kind: input.kind,
        authorization_fingerprint: authorizationFingerprint,
        command_fingerprint: commandFingerprint,
        command_snapshot: command,
        source_excerpt: sourceExcerpt,
        resolution_scope: resolutionScope,
        resolution_fingerprint: resolutionFingerprint,
        preference_head_id: snapshot.preferenceHeadID,
        preference_version: snapshot.preferenceVersion,
        operation: snapshot.operation,
        from_locator: snapshot.from,
        to_locator: snapshot.to,
        selected_course_id: command.target?.courseID ?? null,
        proposal_part_id: proposal?.partID ?? null,
        proposal_presentation_part_id: proposal?.presentationPartID ?? null,
        proposal_presentation_assistant_message_id: proposal?.presentationAssistantMessageID ?? null,
        proposal_assistant_message_id: proposal?.assistantMessageID ?? null,
        proposal_emission_ordinal: proposal?.emissionOrdinal ?? null,
        proposal_fingerprint: proposal?.fingerprint ?? null,
        proposal_selection: proposal?.selection ?? null,
        time_disposed: input.envelope.timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)
    return { type: "admitted" as const, authorizationFingerprint, authorization }
  })
}

export function readDefaultCourseInvocationVersion(
  tx: Transaction,
  input: Readonly<{ partID: PartID; assistantMessageID: MessageID; providerCallID: string }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* lookupPhysicalInvocation(tx, input)
    if (!invocation) return undefined
    if (invocation.command_name !== SET_DEFAULT_COURSE_PREFERENCE_V2_CAPABILITY) {
      return yield* invocationConflict(input)
    }
    const disposition = yield* tx
      .select()
      .from(LearnerDefaultCourseDispositionTable)
      .where(eq(LearnerDefaultCourseDispositionTable.invocation_part_id, invocation.part_id))
      .get()
      .pipe(Effect.orDie)
    if (!disposition) return yield* integrity("Default-Course invocation has no domain disposition")
    const version = disposition.disposition === "legacy_v1" ? 1 : 2
    if (version !== invocation.command_version) {
      return yield* integrity("Default-Course physical version and disposition diverge")
    }
    const acknowledgement = yield* readDefaultCourseAcknowledgement(tx, { partID: invocation.part_id })
    const authorization =
      disposition.disposition === "candidate_v2"
        ? yield* authorizationInfo(disposition, invocation.occurrence_id)
        : undefined
    const semanticTerminal =
      disposition.disposition === "semantic_terminal_v2" ? yield* semanticTerminalInfo(disposition) : undefined
    if (
      invocation.status === "admitted" &&
      disposition.disposition !== "candidate_v2" &&
      !(disposition.disposition === "legacy_v1" && disposition.legacy_row_class === "admitted")
    ) {
      return yield* integrity("Only a complete V2 candidate or migrated admitted V1 row may remain admitted")
    }
    return {
      version,
      status: invocation.status,
      settlement: invocation.settlement,
      disposition: disposition.disposition,
      ...(authorization ? { authorizationFingerprint: authorization.fingerprint, authorization } : {}),
      ...(semanticTerminal ? { semanticTerminal } : {}),
      ...(acknowledgement ? { acknowledgement } : {}),
    } satisfies DefaultCourseInvocationVersion
  })
}

export function settleDefaultCoursePolicy(tx: Transaction, input: DefaultCoursePolicyInput) {
  return Effect.gen(function* () {
    const state = yield* requireCapabilityCandidate(tx, input.partID)
    const policyFingerprint = fingerprint(input.policyBasis)
    const existing = yield* capabilitySettlement(tx, input.partID)
    if (existing) {
      if (
        existing.outcome !== input.outcome ||
        existing.policy_fingerprint !== policyFingerprint ||
        existing.authorization_fingerprint !== state.authorization.authorization_fingerprint
      ) {
        return yield* integrity("Default-Course capability policy settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    const issue = yield* capabilityIssue(tx, input.partID)
    if (issue) return yield* integrity("A prompted capability issue cannot be settled as a policy outcome")
    yield* tx
      .insert(LearnerDefaultCourseCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome: input.outcome,
        authorization_fingerprint: state.authorization.authorization_fingerprint,
        policy_basis: input.policyBasis,
        policy_fingerprint: policyFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      outcome: input.outcome,
      authorizationFingerprint: state.authorization.authorization_fingerprint,
      policyBasis: input.policyBasis,
      policyFingerprint,
      timeSettled: input.time,
      settlementOrder: input.order,
    } as const
  })
}

export function issueDefaultCourseCapabilityPrompt(tx: Transaction, input: DefaultCoursePromptIssueInput) {
  return Effect.gen(function* () {
    const state = yield* requireCapabilityCandidate(tx, input.partID)
    if (yield* capabilitySettlement(tx, input.partID)) {
      return yield* integrity("A terminal capability outcome cannot issue a prompt")
    }
    const policyFingerprint = fingerprint(input.policyBasis)
    const shownScopeFingerprint = fingerprint(input.shownScope)
    const existing = yield* capabilityIssue(tx, input.partID)
    if (existing) {
      if (
        existing.permission_request_id !== input.requestID ||
        existing.authorization_fingerprint !== state.authorization.authorization_fingerprint ||
        existing.policy_fingerprint !== policyFingerprint ||
        existing.shown_scope_fingerprint !== shownScopeFingerprint
      ) {
        return yield* integrity("Default-Course capability issue conflicts")
      }
      return capabilityIssueInfo(existing)
    }
    yield* tx
      .insert(LearnerDefaultCourseCapabilityIssueTable)
      .values({
        invocation_part_id: input.partID,
        permission_request_id: input.requestID,
        authorization_fingerprint: state.authorization.authorization_fingerprint,
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
      authorizationFingerprint: state.authorization.authorization_fingerprint,
      policyBasis: input.policyBasis,
      policyFingerprint,
      shownScope: input.shownScope,
      shownScopeFingerprint,
      timeIssued: input.time,
      issueOrder: input.order,
    } as const
  })
}

export function settleDefaultCoursePrompt(tx: Transaction, input: DefaultCoursePromptSettlementInput) {
  return Effect.gen(function* () {
    const state = yield* requireCapabilityCandidate(tx, input.partID)
    const issue = yield* capabilityIssue(tx, input.partID)
    if (
      !issue ||
      issue.permission_request_id !== input.requestID ||
      issue.authorization_fingerprint !== state.authorization.authorization_fingerprint
    ) {
      return yield* integrity("Default-Course prompt reply has no exact durable issue")
    }
    const replyFingerprint = fingerprint(input.reply)
    const existing = yield* capabilitySettlement(tx, input.partID)
    if (existing) {
      if (
        existing.outcome !== input.outcome ||
        existing.permission_request_id !== input.requestID ||
        existing.reply_fingerprint !== replyFingerprint
      ) {
        return yield* integrity("Default-Course prompt settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    yield* tx
      .insert(LearnerDefaultCourseCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome: input.outcome,
        permission_request_id: input.requestID,
        authorization_fingerprint: state.authorization.authorization_fingerprint,
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
      authorizationFingerprint: state.authorization.authorization_fingerprint,
      reply: input.reply,
      replyFingerprint,
      timeSettled: input.time,
      settlementOrder: input.order,
    } as const
  })
}

export function recoverDefaultCourseCapability(
  tx: Transaction,
  input: Readonly<{ partID: PartID; time: number; order: number }>,
) {
  return Effect.gen(function* () {
    const state = yield* requireCapabilityCandidate(tx, input.partID)
    const existing = yield* capabilitySettlement(tx, input.partID)
    if (existing) return capabilitySettlementInfo(existing)
    const issue = yield* capabilityIssue(tx, input.partID)
    const outcome = issue ? ("prompted_abort" as const) : ("not_evaluated" as const)
    yield* tx
      .insert(LearnerDefaultCourseCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome,
        permission_request_id: issue?.permission_request_id ?? null,
        authorization_fingerprint: state.authorization.authorization_fingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      outcome,
      ...(issue ? { requestID: issue.permission_request_id } : {}),
      authorizationFingerprint: state.authorization.authorization_fingerprint,
      timeSettled: input.time,
      settlementOrder: input.order,
    }
  })
}

export function recoverDefaultCourseV2(
  tx: Transaction,
  input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !invocation ||
      invocation.command_name !== SET_DEFAULT_COURSE_PREFERENCE_V2_CAPABILITY ||
      invocation.command_version !== 2
    ) {
      return yield* integrity("Default-Course V2 recovery invocation is unavailable")
    }
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: invocation.settlement,
        acknowledgement: yield* readDefaultCourseAcknowledgement(tx, { partID: input.partID }),
      }
    }
    const capability = yield* recoverDefaultCourseCapability(tx, {
      partID: input.partID,
      time: input.settlement.time,
      order: input.settlement.order,
    })
    const authorization = yield* requireV2Authorization(tx, input.partID)
    const command = authorization.command_snapshot
    if (!command) return yield* integrity("Default-Course V2 authorization lost its command projection")
    const semantic = yield* settleDefaultCourseSemanticRace(tx, {
      partID: input.partID,
      occurrenceID: invocation.occurrence_id,
      command,
      settlement: input.settlement,
    })
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

export function settleDefaultCourseV2(
  tx: Transaction,
  input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!invocation || invocation.command_name !== SET_DEFAULT_COURSE_PREFERENCE_V2_CAPABILITY) {
      return yield* integrity("Default-Course V2 invocation is unavailable")
    }
    if (invocation.command_version !== 2) {
      return yield* integrity("Legacy V1 invocation cannot enter V2 final settlement")
    }
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: invocation.settlement,
        acknowledgement: yield* readDefaultCourseAcknowledgement(tx, { partID: input.partID }),
      }
    }
    const authorization = yield* requireV2Authorization(tx, input.partID)
    const command = authorization.command_snapshot
    if (!command) return yield* integrity("Default-Course V2 authorization lost its command projection")
    const semantic = yield* settleDefaultCourseSemanticRace(tx, {
      partID: input.partID,
      occurrenceID: invocation.occurrence_id,
      command,
      settlement: input.settlement,
    })
    if (semantic) return semantic
    const capability = yield* capabilitySettlement(tx, input.partID)
    if (!capability || capability.authorization_fingerprint !== authorization.authorization_fingerprint) {
      return yield* integrity("Default-Course final settlement has no exact durable capability outcome")
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
    const fresh = yield* prepareSnapshot(tx, command).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch(() => Effect.succeed({ type: "failure" as const })),
    )
    if (
      fresh.type === "failure" ||
      !sameSnapshot(fresh.value, {
        preferenceHeadID: authorization.preference_head_id,
        preferenceVersion: authorization.preference_version!,
        operation: authorization.operation!,
        from: authorization.from_locator!,
        to: authorization.to_locator!,
      })
    ) {
      const settlement = errorSettlement("stale", input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const previousCourseID =
      authorization.from_locator?.kind === "course" ? authorization.from_locator.locator.courseID : null
    const targetCourseID = command.target?.courseID ?? null
    if (previousCourseID === targetCourseID) {
      const current = yield* LearnerNavigation.readCurrentDefault(tx)
      const settlement = {
        outcome: "no_change",
        navigationKind: "default_course_preference",
        current,
        settlementTime: input.settlement.time,
        settlementOrder: input.settlement.order,
      } as const
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const receipt = command.target ? yield* Course.preparePreferenceTargetProof(tx, command.target) : undefined
    const consumed = yield* LearningFrontier.read(tx)
    if (input.settlement.time < consumed.time) {
      const settlement = errorSettlement("stale", input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const frontier = yield* LearningFrontier.advance(tx, { time: input.settlement.time, consumed: [consumed] })
    const effect = {
      id: createDefaultEffectID(),
      occurrenceID: invocation.occurrence_id,
      previousCourseID,
      courseID: targetCourseID,
      previousVersion: authorization.preference_version!,
      version: authorization.preference_version! + 1,
      timeCommitted: input.settlement.time,
      commitOrder: input.settlement.order,
      frontierSequence: frontier.sequence,
    } satisfies DefaultEffect
    yield* tx
      .insert(DefaultCoursePreferenceTransitionTable)
      .values({
        id: effect.id,
        version: effect.version,
        predecessor_id: authorization.preference_head_id,
        previous_course_id: effect.previousCourseID,
        course_id: effect.courseID,
        occurrence_id: effect.occurrenceID,
        authorization_part_id: input.partID,
        permission_request_id: null,
        confirmation_snapshot: null,
        target_course_version: receipt?.receipt.courseVersion ?? null,
        target_selection_revision_id: receipt?.receipt.selectionRevisionID ?? null,
        target_selection_version: receipt?.receipt.selectionVersion ?? null,
        target_view_id: receipt?.receipt.viewID ?? null,
        target_view_version: receipt?.receipt.viewVersion ?? null,
        target_revision_version: receipt?.receipt.revisionVersion ?? null,
        time_committed: effect.timeCommitted,
        commit_order: effect.commitOrder,
        frontier_sequence: effect.frontierSequence,
        frontier_time: frontier.time,
      })
      .run()
      .pipe(Effect.orDie)
    const receiptID = yield* insertPhysicalReceipt(tx, envelope, input.settlement)
    yield* tx
      .insert(LearnerDefaultCourseCommitSealTable)
      .values({ effect_id: effect.id, receipt_id: receiptID, invocation_part_id: input.partID })
      .run()
      .pipe(Effect.orDie)
    const acknowledgement = acknowledgementSnapshot({
      invocationPartID: input.partID,
      effectAuthorizationPartID: input.partID,
      authorizationVersion: 2,
      effectID: effect.id,
      receiptID,
      operation: authorization.operation!,
      from: authorization.from_locator!,
      to: authorization.to_locator!,
      relation: "active",
      timeCommitted: effect.timeCommitted,
      commitOrder: effect.commitOrder,
    })
    yield* insertAcknowledgement(tx, acknowledgement)
    const current = yield* LearnerNavigation.readCurrentDefault(tx)
    const settlement = {
      outcome: "applied",
      navigationKind: "default_course_preference",
      receiptID,
      effectID: effect.id,
      effect,
      current,
      settlementTime: input.settlement.time,
      settlementOrder: input.settlement.order,
    } as const
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement, acknowledgement }
  })
}

export function readDefaultCourseAcknowledgement(tx: Transaction, input: Readonly<{ partID: PartID }>) {
  return tx
    .select({ presentation: LearnerDefaultCourseAcknowledgementTable.presentation_snapshot })
    .from(LearnerDefaultCourseAcknowledgementTable)
    .where(eq(LearnerDefaultCourseAcknowledgementTable.invocation_part_id, input.partID))
    .get()
    .pipe(
      Effect.map((row) => row?.presentation),
      Effect.orDie,
    )
}

function prepareSnapshot(tx: Transaction, command: DefaultCourseCommand) {
  return Effect.gen(function* () {
    const head = yield* tx
      .select()
      .from(DefaultCoursePreferenceTransitionTable)
      .orderBy(desc(DefaultCoursePreferenceTransitionTable.version))
      .limit(1)
      .get()
      .pipe(Effect.orDie)
    if ((head?.id ?? null) !== command.expectedHeadID || (head?.version ?? 0) !== command.expectedVersion) {
      return yield* new LearnerNavigation.StaleStateError({ kind: "default_course_preference" })
    }
    const from = head?.course_id
      ? ({ kind: "course", locator: yield* exactLocator(tx, head.course_id) } as const)
      : ({ kind: "absent" } as const)
    const proof = command.target ? yield* Course.preparePreferenceTargetProof(tx, command.target) : undefined
    const to = proof
      ? ({ kind: "course", locator: exactLocatorFromReceipt(proof.receipt) } as const)
      : ({ kind: "absent" } as const)
    return {
      preferenceHeadID: head?.id ?? null,
      preferenceVersion: head?.version ?? 0,
      operation: operation(from, to),
      from,
      to,
    }
  })
}

function exactLocator(tx: Transaction, courseID: Course.CourseID) {
  return Effect.gen(function* () {
    const course = yield* tx.select().from(CourseTable).where(eq(CourseTable.id, courseID)).get().pipe(Effect.orDie)
    if (!course) return yield* integrity(`Default Course ${courseID} is unavailable`)
    const selection = yield* tx
      .select()
      .from(CourseWorkingSelectionTable)
      .where(eq(CourseWorkingSelectionTable.course_id, courseID))
      .get()
      .pipe(Effect.orDie)
    if (!selection) return yield* integrity(`Default Course ${courseID} has no working-selection owner`)
    if (!selection.revision_id) {
      return {
        courseID,
        title: { availability: "recorded_v2", value: course.title },
        courseVersion: { availability: "recorded_v2", value: course.state_version },
        workingSelection: {
          availability: "recorded_v2",
          value: {
            revisionID: null,
            selectionVersion: selection.version,
            viewID: null,
            viewName: null,
            viewVersion: null,
            revisionVersion: null,
          },
        },
      } satisfies DefaultCourseStableLocatorV2
    }
    const revision = yield* tx
      .select({
        viewID: CourseViewRevisionTable.view_id,
        revisionVersion: CourseViewRevisionStateTable.state_version,
        viewName: CourseViewTable.name,
        viewVersion: CourseViewTable.state_version,
      })
      .from(CourseViewRevisionTable)
      .innerJoin(CourseViewRevisionStateTable, eq(CourseViewRevisionStateTable.revision_id, CourseViewRevisionTable.id))
      .innerJoin(
        CourseViewTable,
        and(
          eq(CourseViewTable.course_id, CourseViewRevisionTable.course_id),
          eq(CourseViewTable.id, CourseViewRevisionTable.view_id),
        ),
      )
      .where(
        and(eq(CourseViewRevisionTable.course_id, courseID), eq(CourseViewRevisionTable.id, selection.revision_id)),
      )
      .get()
      .pipe(Effect.orDie)
    if (!revision) return yield* integrity(`Default Course ${courseID} working Revision is unavailable`)
    return {
      courseID,
      title: { availability: "recorded_v2", value: course.title },
      courseVersion: { availability: "recorded_v2", value: course.state_version },
      workingSelection: {
        availability: "recorded_v2",
        value: {
          revisionID: selection.revision_id,
          selectionVersion: selection.version,
          viewID: revision.viewID,
          viewName: revision.viewName,
          viewVersion: revision.viewVersion,
          revisionVersion: revision.revisionVersion,
        },
      },
    } satisfies DefaultCourseStableLocatorV2
  })
}

function exactLocatorFromReceipt(receipt: Course.PreferenceTargetReceipt): DefaultCourseStableLocatorV2 {
  return {
    courseID: receipt.courseID,
    title: { availability: "recorded_v2", value: receipt.courseTitle },
    courseVersion: { availability: "recorded_v2", value: receipt.courseVersion },
    workingSelection: {
      availability: "recorded_v2",
      value: {
        revisionID: receipt.selectionRevisionID,
        selectionVersion: receipt.selectionVersion,
        viewID: receipt.viewID,
        viewName: receipt.viewName,
        viewVersion: receipt.viewVersion,
        revisionVersion: receipt.revisionVersion,
      },
    },
  }
}

function validateResolutionScope(
  tx: Transaction,
  command: DefaultCourseCommand,
  scope: DefaultCourseResolutionScope,
  requireComplete: boolean,
) {
  return Effect.gen(function* () {
    const selected = scope.candidates.filter((candidate) => candidate.courseID === scope.selectedCourseID)
    const identities = new Set(scope.candidates.map((candidate) => candidate.courseID))
    const structurallyValid =
      (!requireComplete || scope.coverage === "complete") &&
      scope.candidates.length <= 100 &&
      identities.size === scope.candidates.length &&
      scope.candidates.every((candidate) => candidate.title.trim().length > 0) &&
      ((scope.coverage === "complete" && scope.truncation === undefined) ||
        (scope.coverage === "explicitly_truncated" &&
          !!scope.truncation?.reason.trim() &&
          (scope.truncation.omittedCount === undefined || scope.truncation.omittedCount > 0))) &&
      (command.target
        ? scope.selectedCourseID === command.target.courseID &&
          selected.length === 1 &&
          selected[0]!.courseVersion === command.target.courseVersion
        : scope.selectedCourseID === null)
    if (!structurallyValid) {
      return yield* integrity("Default-Course resolution scope does not authorize the selected command")
    }
    if (scope.candidates.length === 0) return
    const courses = yield* tx
      .select({
        id: CourseTable.id,
        title: CourseTable.title,
        version: CourseTable.state_version,
        withdrawalReason: CourseTable.withdrawal_reason,
      })
      .from(CourseTable)
      .where(
        inArray(
          CourseTable.id,
          scope.candidates.map((candidate) => candidate.courseID),
        ),
      )
      .all()
      .pipe(Effect.orDie)
    const observed = new Map(courses.map((course) => [course.id, course]))
    if (
      scope.candidates.some((candidate) => {
        const course = observed.get(candidate.courseID)
        return (
          !course ||
          course.withdrawalReason !== null ||
          course.title !== candidate.title ||
          course.version !== candidate.courseVersion
        )
      })
    ) {
      return yield* integrity("Default-Course resolution scope contains a stale or unavailable Course")
    }
  })
}

function requireV2Envelope(input: DefaultCourseAuthorizationInput) {
  const expectedBasis = input.kind === "direct_request_v2" ? "learner_request" : "learner_acceptance"
  const valid =
    input.envelope.capabilityIdentity === SET_DEFAULT_COURSE_PREFERENCE_V2_CAPABILITY &&
    input.envelope.capabilityVersion === SET_DEFAULT_COURSE_PREFERENCE_V2_VERSION &&
    input.envelope.authorizationBasis === expectedBasis
  return valid ? Effect.void : integrity("Default-Course V2 envelope has an incompatible capability or source arm")
}

function requireSourceExcerpt(tx: Transaction, envelope: InvocationEnvelope, excerpt: string) {
  return Effect.gen(function* () {
    yield* Occurrence.requireAvailableSource(tx, {
      occurrenceID: envelope.occurrenceID,
      sessionID: envelope.sessionID,
      messageID: envelope.parentUserMessageID,
    }).pipe(
      Effect.mapError(
        () => new IntegrityError({ detail: "Default-Course authorization source is unavailable or changed" }),
      ),
    )
    const message = yield* tx
      .select({ data: MessageTable.data })
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, envelope.sessionID), eq(MessageTable.id, envelope.parentUserMessageID)))
      .get()
      .pipe(Effect.orDie)
    if (!message || message.data.role !== "user") {
      return yield* integrity("Default-Course authorization source is not exact learner input")
    }
    const parts = yield* tx
      .select({ data: PartTable.data })
      .from(PartTable)
      .where(and(eq(PartTable.session_id, envelope.sessionID), eq(PartTable.message_id, envelope.parentUserMessageID)))
      .orderBy(asc(PartTable.time_created), asc(PartTable.id))
      .all()
      .pipe(Effect.orDie)
    const text = parts
      .flatMap((part) => {
        if (part.data.type !== "text") return []
        const value = part.data as Omit<SessionV1.TextPart, "id" | "sessionID" | "messageID">
        return value.synthetic === true ? [] : [value.text]
      })
      .join("\n")
    if (!text.includes(excerpt)) {
      return yield* integrity("Default-Course authorization excerpt is absent from unchanged learner input")
    }
  })
}

function requireStoredProposal(tx: Transaction, input: ResolvedDefaultCourseProposal, envelope: InvocationEnvelope) {
  return Effect.gen(function* () {
    if (input.acceptanceOccurrenceID !== envelope.occurrenceID) {
      return yield* integrity("Accepted Default-Course proposal belongs to another learner acceptance occurrence")
    }
    const row = yield* tx
      .select()
      .from(LearnerDefaultCourseProposalTable)
      .where(eq(LearnerDefaultCourseProposalTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!row || row.proposal_fingerprint !== input.fingerprint) {
      return yield* integrity("Accepted Default-Course proposal is not the immutable stored proposal")
    }
    const resolved = yield* resolveDefaultCourseProposalPresentation(tx, {
      partID: input.presentationPartID,
      acceptanceOccurrenceID: envelope.occurrenceID,
      selection: input.selection,
    })
    const model = yield* tx
      .select({
        occurrenceID: TurnModelOperationTable.causal_occurrence_id,
        timeAdmitted: TurnModelOperationTable.time_admitted,
      })
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, envelope.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (
      resolved.partID !== input.partID ||
      resolved.fingerprint !== input.fingerprint ||
      resolved.presentationPartID !== input.presentationPartID ||
      resolved.presentationAssistantMessageID !== input.presentationAssistantMessageID ||
      resolved.acceptanceOccurrenceID !== input.acceptanceOccurrenceID ||
      resolved.selection !== input.selection ||
      !model ||
      model.occurrenceID !== envelope.occurrenceID ||
      model.timeAdmitted > envelope.timeAdmitted ||
      resolved.presentationAssistantMessageID === envelope.assistantMessageID
    ) {
      return yield* integrity("Accepted Default-Course proposal has no exact later issuing-model binding")
    }
    return resolved
  })
}

function requireProposalSnapshot(
  proposal: DefaultCourseProposal,
  snapshot: Readonly<{
    preferenceHeadID: DefaultEffect["id"] | null
    preferenceVersion: number
    operation: DefaultCourseOperation
    from: DefaultCourseEndpointV2
    to: DefaultCourseEndpointV2
  }>,
) {
  return sameSnapshot(snapshot, {
    preferenceHeadID: proposal.preferenceHeadID,
    preferenceVersion: proposal.preferenceVersion,
    operation: proposal.operation,
    from: proposal.from,
    to: proposal.to,
  })
    ? Effect.void
    : integrity("Accepted Default-Course proposal is stale even though its target may currently compare equal")
}

function sameSnapshot(
  left: Readonly<{
    preferenceHeadID: DefaultEffect["id"] | null
    preferenceVersion: number
    operation: DefaultCourseOperation
    from: DefaultCourseEndpointV2
    to: DefaultCourseEndpointV2
  }>,
  right: Readonly<{
    preferenceHeadID: DefaultEffect["id"] | null
    preferenceVersion: number
    operation: DefaultCourseOperation
    from: DefaultCourseEndpointV2
    to: DefaultCourseEndpointV2
  }>,
) {
  return (
    left.preferenceHeadID === right.preferenceHeadID &&
    left.preferenceVersion === right.preferenceVersion &&
    left.operation === right.operation &&
    JSON.stringify(left.from) === JSON.stringify(right.from) &&
    JSON.stringify(left.to) === JSON.stringify(right.to)
  )
}

function settleDefaultCourseSemanticRace(
  tx: Transaction,
  input: Readonly<{
    partID: PartID
    occurrenceID: OccurrenceID
    command: DefaultCourseCommand
    settlement: SettlementMetadata
  }>,
) {
  return Effect.gen(function* () {
    const resolution = yield* LearnerNavigation.resolveDefaultEffect(tx, {
      occurrenceID: input.occurrenceID,
      targetCourseID: input.command.target?.courseID ?? null,
    }).pipe(Effect.orDie)
    if (resolution.type === "new") return
    if (resolution.type === "already_applied") {
      return yield* settleAlreadyApplied(tx, input.partID, resolution, input.settlement)
    }
    const settlement = errorSettlement("semantic_conflict", input.settlement)
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    const result: Readonly<{
      type: "settled"
      settlement: typeof settlement
      acknowledgement?: undefined
    }> = { type: "settled", settlement }
    return result
  })
}

function settleAlreadyApplied(
  tx: Transaction,
  invocationPartID: PartID,
  resolution: Extract<LearnerNavigation.DefaultResolution, { readonly type: "already_applied" }>,
  metadata: SettlementMetadata,
) {
  return Effect.gen(function* () {
    const effect = yield* tx
      .select({
        authorizationPartID: DefaultCoursePreferenceTransitionTable.authorization_part_id,
        receiptID: LearningCommandReceiptTable.id,
        appliedInvocationPartID: LearnerDefaultCourseCommitSealTable.invocation_part_id,
      })
      .from(DefaultCoursePreferenceTransitionTable)
      .innerJoin(
        LearnerDefaultCourseCommitSealTable,
        eq(LearnerDefaultCourseCommitSealTable.effect_id, DefaultCoursePreferenceTransitionTable.id),
      )
      .innerJoin(
        LearningCommandReceiptTable,
        eq(LearningCommandReceiptTable.id, LearnerDefaultCourseCommitSealTable.receipt_id),
      )
      .where(eq(DefaultCoursePreferenceTransitionTable.id, resolution.effect.id))
      .get()
      .pipe(Effect.orDie)
    if (!effect) return yield* integrity("Already-applied Default-Course effect has no immutable seal")
    const original = yield* readDefaultCourseAcknowledgement(tx, { partID: effect.appliedInvocationPartID })
    if (!original) return yield* integrity("Already-applied Default-Course effect has no stable locator overlay")
    const acknowledgement =
      original.authorizationVersion === 1
        ? acknowledgementSnapshot({
            invocationPartID,
            effectAuthorizationPartID: effect.authorizationPartID,
            authorizationVersion: 1,
            effectID: resolution.effect.id,
            receiptID: effect.receiptID,
            operation: original.operation,
            from: original.from,
            to: original.to,
            relation: resolution.relation,
            timeCommitted: resolution.effect.timeCommitted,
            commitOrder: resolution.effect.commitOrder,
          })
        : acknowledgementSnapshot({
            invocationPartID,
            effectAuthorizationPartID: effect.authorizationPartID,
            authorizationVersion: 2,
            effectID: resolution.effect.id,
            receiptID: effect.receiptID,
            operation: original.operation,
            from: original.from,
            to: original.to,
            relation: resolution.relation,
            timeCommitted: resolution.effect.timeCommitted,
            commitOrder: resolution.effect.commitOrder,
          })
    yield* insertAcknowledgement(tx, acknowledgement)
    const settlement = {
      outcome: "already_applied",
      navigationKind: "default_course_preference",
      receiptID: effect.receiptID,
      effectID: resolution.effect.id,
      effect: resolution.effect,
      current: resolution.current,
      relation: resolution.relation,
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } as const
    yield* settlePhysicalInvocation(tx, invocationPartID, settlement)
    return { type: "settled" as const, settlement, acknowledgement }
  })
}

type DefaultCourseAcknowledgementInput = DefaultCourseAcknowledgement extends infer Acknowledgement
  ? Acknowledgement extends DefaultCourseAcknowledgement
    ? Omit<Acknowledgement, "schemaVersion">
    : never
  : never

function acknowledgementSnapshot(input: DefaultCourseAcknowledgementInput): DefaultCourseAcknowledgement {
  return { schemaVersion: 1, ...input }
}

function insertAcknowledgement(tx: Transaction, acknowledgement: DefaultCourseAcknowledgement) {
  return tx
    .insert(LearnerDefaultCourseAcknowledgementTable)
    .values({
      invocation_part_id: acknowledgement.invocationPartID,
      effect_authorization_part_id: acknowledgement.effectAuthorizationPartID,
      authorization_version: acknowledgement.authorizationVersion,
      effect_id: acknowledgement.effectID,
      receipt_id: acknowledgement.receiptID,
      operation: acknowledgement.operation,
      from_locator: acknowledgement.from,
      to_locator: acknowledgement.to,
      relation: acknowledgement.relation,
      presentation_snapshot: acknowledgement,
      presentation_fingerprint: fingerprint(acknowledgement),
      time_committed: acknowledgement.timeCommitted,
      commit_order: acknowledgement.commitOrder,
    })
    .run()
    .pipe(Effect.orDie)
}

function requireCapabilityCandidate(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (!invocation || invocation.status !== "admitted" || invocation.command_version !== 2) {
      return yield* integrity("Default-Course capability lifecycle requires one admitted V2 invocation")
    }
    return { invocation, authorization: yield* requireV2Authorization(tx, partID) }
  })
}

function requireDefaultCourseDisposition(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const disposition = yield* tx
      .select()
      .from(LearnerDefaultCourseDispositionTable)
      .where(eq(LearnerDefaultCourseDispositionTable.invocation_part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (!disposition) return yield* integrity("Default-Course invocation has no domain disposition")
    return disposition
  })
}

function requireV2Authorization(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const authorization = yield* tx
      .select()
      .from(LearnerDefaultCourseDispositionTable)
      .where(eq(LearnerDefaultCourseDispositionTable.invocation_part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !authorization ||
      authorization.disposition !== "candidate_v2" ||
      authorization.authorization_version !== 2 ||
      authorization.authorization_kind === null ||
      authorization.authorization_kind === "legacy_v1" ||
      authorization.authorization_fingerprint === null
    ) {
      return yield* integrity("Default-Course V2 invocation has no closed semantic authorization")
    }
    return {
      ...authorization,
      disposition: "candidate_v2" as const,
      authorization_version: 2 as const,
      authorization_kind: authorization.authorization_kind,
      authorization_fingerprint: authorization.authorization_fingerprint,
    }
  })
}

function semanticTerminalInfo(
  row: typeof LearnerDefaultCourseDispositionTable.$inferSelect,
): Effect.Effect<DefaultCourseSemanticTerminalDisposition, IntegrityError> {
  if (
    row.disposition !== "semantic_terminal_v2" ||
    !row.semantic_outcome ||
    !row.command_snapshot ||
    !row.semantic_address ||
    !row.semantic_address_fingerprint ||
    !row.incoming_payload_fingerprint ||
    !row.existing_effect_id ||
    !row.existing_payload_fingerprint
  ) {
    return integrity("Default-Course semantic-terminal disposition is incomplete")
  }
  return Effect.succeed({
    kind: "semantic_terminal_v2",
    outcome: row.semantic_outcome,
    command: row.command_snapshot,
    commandFingerprint: row.command_fingerprint,
    semanticAddress: row.semantic_address,
    semanticAddressFingerprint: row.semantic_address_fingerprint,
    incomingPayloadFingerprint: row.incoming_payload_fingerprint,
    existingEffectID: row.existing_effect_id,
    existingPayloadFingerprint: row.existing_payload_fingerprint,
  })
}

function authorizationInfo(
  row: typeof LearnerDefaultCourseDispositionTable.$inferSelect,
  occurrenceID: OccurrenceID,
): Effect.Effect<DefaultCourseV2Authorization, IntegrityError> {
  return Effect.gen(function* () {
    if (
      row.disposition !== "candidate_v2" ||
      row.authorization_version !== 2 ||
      row.authorization_kind === null ||
      row.authorization_kind === "legacy_v1" ||
      row.authorization_fingerprint === null ||
      !row.command_snapshot ||
      !row.source_excerpt ||
      !row.resolution_scope ||
      !row.resolution_fingerprint ||
      row.preference_version === null ||
      !row.operation ||
      !row.from_locator ||
      !row.to_locator
    ) {
      return yield* integrity("Default-Course V2 authorization projection is incomplete")
    }
    const source =
      row.authorization_kind === "direct_request_v2"
        ? {
            kind: "direct_request_v2" as const,
            occurrenceID,
            excerpt: row.source_excerpt,
          }
        : row.proposal_part_id &&
            row.proposal_presentation_part_id &&
            row.proposal_presentation_assistant_message_id &&
            row.proposal_assistant_message_id &&
            row.proposal_emission_ordinal !== null &&
            row.proposal_fingerprint &&
            row.proposal_selection
          ? {
              kind: "accepted_proposal_v2" as const,
              occurrenceID,
              excerpt: row.source_excerpt,
              proposalPartID: row.proposal_part_id,
              proposalPresentationPartID: row.proposal_presentation_part_id,
              proposalPresentationAssistantMessageID: row.proposal_presentation_assistant_message_id,
              proposalAssistantMessageID: row.proposal_assistant_message_id,
              proposalEmissionOrdinal: row.proposal_emission_ordinal,
              proposalFingerprint: row.proposal_fingerprint,
              selection: row.proposal_selection,
            }
          : undefined
    if (!source) return yield* integrity("Accepted Default-Course authorization lost its proposal presentation")
    return {
      kind: row.authorization_kind,
      fingerprint: row.authorization_fingerprint,
      command: row.command_snapshot,
      commandFingerprint: row.command_fingerprint,
      source,
      resolutionScope: row.resolution_scope,
      resolutionFingerprint: row.resolution_fingerprint,
      preferenceHeadID: row.preference_head_id,
      preferenceVersion: row.preference_version,
      operation: row.operation,
      from: row.from_locator,
      to: row.to_locator,
    }
  })
}

function capabilityIssue(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerDefaultCourseCapabilityIssueTable)
    .where(eq(LearnerDefaultCourseCapabilityIssueTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilitySettlement(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearnerDefaultCourseCapabilitySettlementTable)
    .where(eq(LearnerDefaultCourseCapabilitySettlementTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilityIssueInfo(row: typeof LearnerDefaultCourseCapabilityIssueTable.$inferSelect) {
  return {
    requestID: row.permission_request_id,
    authorizationFingerprint: row.authorization_fingerprint,
    policyBasis: row.policy_basis,
    policyFingerprint: row.policy_fingerprint,
    shownScope: row.shown_scope,
    shownScopeFingerprint: row.shown_scope_fingerprint,
    timeIssued: row.time_issued,
    issueOrder: row.issue_order,
  }
}

function capabilitySettlementInfo(row: typeof LearnerDefaultCourseCapabilitySettlementTable.$inferSelect) {
  return {
    outcome: row.outcome,
    ...(row.permission_request_id ? { requestID: row.permission_request_id } : {}),
    authorizationFingerprint: row.authorization_fingerprint,
    ...(row.policy_basis ? { policyBasis: row.policy_basis } : {}),
    ...(row.policy_fingerprint ? { policyFingerprint: row.policy_fingerprint } : {}),
    ...(row.reply ? { reply: row.reply } : {}),
    ...(row.reply_fingerprint ? { replyFingerprint: row.reply_fingerprint } : {}),
    timeSettled: row.time_settled,
    settlementOrder: row.settlement_order,
  }
}

function capabilityErrorCode(outcome: Exclude<DefaultCourseCapabilityOutcome, "policy_allow" | "prompted_allow">) {
  if (outcome === "policy_deny" || outcome === "prompted_deny") return "permission_rejected" as const
  if (outcome === "prompted_correct") return "permission_corrected" as const
  if (outcome === "prompted_cancel") return "cancelled" as const
  return "interrupted" as const
}

function invocationEnvelope(row: typeof LearningCommandInvocationTable.$inferSelect): InvocationEnvelope {
  if (!row.turn_id || !row.input_id) throw new Error("V2 Default-Course invocation lost its Turn identity")
  return {
    turnID: row.turn_id,
    inputID: row.input_id,
    sessionID: row.session_id,
    parentUserMessageID: row.parent_user_message_id,
    assistantMessageID: row.assistant_message_id,
    partID: row.part_id,
    providerCallID: row.provider_call_id,
    occurrenceID: row.occurrence_id,
    emissionOrdinal: row.emission_ordinal,
    capabilityIdentity: row.capability_identity,
    capabilityVersion: row.capability_version,
    authorizationBasis: row.authorization_basis,
    timeAdmitted: row.time_admitted,
  }
}

function invocationFingerprint(input: DefaultCourseAuthorizationInput, command: DefaultCourseCommand) {
  return fingerprint({
    commandName: SET_DEFAULT_COURSE_PREFERENCE_V2_CAPABILITY,
    commandVersion: SET_DEFAULT_COURSE_PREFERENCE_V2_VERSION,
    envelope: input.envelope,
    authorizationKind: input.kind,
    sourceExcerpt: input.sourceExcerpt,
    command,
    ...(input.kind === "direct_request_v2"
      ? { resolutionScope: input.resolutionScope }
      : {
          proposalPartID: input.proposal.partID,
          proposalPresentationPartID: input.proposal.presentationPartID,
          proposalPresentationAssistantMessageID: input.proposal.presentationAssistantMessageID,
          acceptanceOccurrenceID: input.proposal.acceptanceOccurrenceID,
          proposalAssistantMessageID: input.proposal.assistantMessageID,
          proposalEmissionOrdinal: input.proposal.emissionOrdinal,
          proposalFingerprint: input.proposal.fingerprint,
          proposalSelection: input.proposal.selection,
        }),
  })
}

function proposalInfo(row: typeof LearnerDefaultCourseProposalTable.$inferSelect): DefaultCourseProposal {
  return {
    partID: row.part_id,
    turnID: row.turn_id,
    sessionID: row.session_id,
    assistantMessageID: row.assistant_message_id,
    callID: row.call_id,
    emissionOrdinal: row.emission_ordinal,
    command: row.command_snapshot,
    commandFingerprint: row.command_fingerprint,
    resolutionScope: row.resolution_scope,
    resolutionFingerprint: row.resolution_fingerprint,
    preferenceHeadID: row.preference_head_id,
    preferenceVersion: row.preference_version,
    operation: row.operation,
    from: row.from_locator,
    to: row.to_locator,
    fingerprint: row.proposal_fingerprint,
    timePresented: row.time_presented,
  }
}

function proposalPreparation(
  input: DefaultCourseProposalPreparationInput,
  snapshot: Readonly<{
    preferenceHeadID: DefaultEffect["id"] | null
    preferenceVersion: number
    operation: DefaultCourseOperation
    from: DefaultCourseEndpointV2
    to: DefaultCourseEndpointV2
  }>,
  commandFingerprint: string,
  resolutionFingerprint: string,
): DefaultCourseProposal {
  const proposalFingerprint = fingerprint({
    partID: input.partID,
    turnID: input.turnID,
    sessionID: input.sessionID,
    assistantMessageID: input.assistantMessageID,
    callID: input.callID,
    emissionOrdinal: input.emissionOrdinal,
    commandFingerprint,
    resolutionFingerprint,
    preferenceHeadID: snapshot.preferenceHeadID,
    preferenceVersion: snapshot.preferenceVersion,
    operation: snapshot.operation,
    from: snapshot.from,
    to: snapshot.to,
    timePresented: input.timePresented,
  })
  return {
    partID: input.partID,
    turnID: input.turnID,
    sessionID: input.sessionID,
    assistantMessageID: input.assistantMessageID,
    callID: input.callID,
    emissionOrdinal: input.emissionOrdinal,
    command: input.command,
    commandFingerprint,
    resolutionScope: input.resolutionScope,
    resolutionFingerprint,
    preferenceHeadID: snapshot.preferenceHeadID,
    preferenceVersion: snapshot.preferenceVersion,
    operation: snapshot.operation,
    from: snapshot.from,
    to: snapshot.to,
    fingerprint: proposalFingerprint,
    timePresented: input.timePresented,
  }
}

function operation(from: DefaultCourseEndpointV2, to: DefaultCourseEndpointV2): DefaultCourseOperation {
  if (from.kind === "absent" && to.kind === "course") return "set"
  if (from.kind === "course" && to.kind === "absent") return "clear"
  return "change"
}

function resolveProposalSourcePart(
  tx: Transaction,
  partID: PartID,
  visited: readonly PartID[] = [],
): Effect.Effect<PartID, IntegrityError> {
  return Effect.gen(function* () {
    if (visited.includes(partID)) return yield* integrity("Historical Tool presentation contains a cycle")
    const direct = yield* tx
      .select({ partID: LearnerDefaultCourseProposalTable.part_id })
      .from(LearnerDefaultCourseProposalTable)
      .where(eq(LearnerDefaultCourseProposalTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (direct) return direct.partID
    const turn = yield* tx
      .select({ sourcePartID: TurnHistoricalToolPresentationTable.source_part_id })
      .from(TurnHistoricalToolPresentationTable)
      .where(eq(TurnHistoricalToolPresentationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    const occurrence = yield* tx
      .select({ sourcePartID: HistoricalLearningToolPresentationTable.source_part_id })
      .from(HistoricalLearningToolPresentationTable)
      .where(eq(HistoricalLearningToolPresentationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (turn && occurrence && turn.sourcePartID !== occurrence.sourcePartID) {
      return yield* integrity("Generic historical Tool presentation authorities disagree")
    }
    if (!turn) {
      return yield* integrity("Tool Part is neither a proposal nor an authoritative Turn historical presentation")
    }
    return yield* resolveProposalSourcePart(tx, turn.sourcePartID, [...visited, partID])
  })
}

function historicalPresentationTime(
  tx: Transaction,
  partID: PartID,
  sourcePartID: PartID,
  visited: readonly PartID[] = [],
): Effect.Effect<number, IntegrityError> {
  return Effect.gen(function* () {
    if (visited.includes(partID)) return yield* integrity("Historical Tool presentation contains a cycle")
    const turn = yield* tx
      .select({
        sourcePartID: TurnHistoricalToolPresentationTable.source_part_id,
        time: TurnHistoricalToolPresentationTable.time_created,
      })
      .from(TurnHistoricalToolPresentationTable)
      .where(eq(TurnHistoricalToolPresentationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    const occurrence = yield* tx
      .select({
        sourcePartID: HistoricalLearningToolPresentationTable.source_part_id,
        time: HistoricalLearningToolPresentationTable.time_created,
      })
      .from(HistoricalLearningToolPresentationTable)
      .where(eq(HistoricalLearningToolPresentationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (!turn || (occurrence && occurrence.sourcePartID !== turn.sourcePartID)) {
      return yield* integrity("Historical Tool presentation has no exact source/time binding")
    }
    const time = Math.max(turn.time, occurrence?.time ?? 0)
    if (turn.sourcePartID === sourcePartID) return time
    const inherited = yield* historicalPresentationTime(tx, turn.sourcePartID, sourcePartID, [...visited, partID])
    return Math.max(time, inherited)
  })
}

function isProposalPartIdentity(value: unknown, callID: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const part = value as Record<string, unknown>
  return part.type === "tool" && part.callID === callID && part.tool === PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY
}

function isCompletedProposalPart(value: unknown, callID: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const part = value as Record<string, unknown>
  if (part.type !== "tool" || part.callID !== callID || part.tool !== PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    return false
  }
  const state = part.state
  return (
    !!state &&
    typeof state === "object" &&
    !Array.isArray(state) &&
    (state as Record<string, unknown>).status === "completed"
  )
}

function isTruthfulCompletedProposalPart(value: typeof SessionV1.ToolPart.Type, proposal: DefaultCourseProposal) {
  if (!isCompletedProposalPart(value, proposal.callID) || value.state.status !== "completed") return false
  const metadata = value.state.metadata
  const output = Option.getOrUndefined(decodeJson(value.state.output))
  if (!output || typeof output !== "object" || Array.isArray(output)) return false
  const result = output as Record<string, unknown>
  return (
    value.state.time.end === proposal.timePresented &&
    metadata.proposalKind === "default_course_preference" &&
    metadata.proposalFingerprint === proposal.fingerprint &&
    metadata.emissionOrdinal === proposal.emissionOrdinal &&
    metadata.durablyRecorded === true &&
    metadata.mutating === false &&
    result.outcome === "proposal_recorded" &&
    fingerprint(result.proposal) === fingerprint(proposal)
  )
}

function sameProposalPartInput(current: unknown, completed: SessionV1.ToolPart) {
  if (!isProposalPartIdentity(current, completed.callID) || completed.state.status !== "completed") return false
  const state = (current as { readonly state?: unknown }).state
  if (!state || typeof state !== "object" || Array.isArray(state)) return false
  return fingerprint((state as Record<string, unknown>).input) === fingerprint(completed.state.input)
}

function storedPart(value: SessionV1.ToolPart) {
  return {
    type: value.type,
    tool: value.tool,
    callID: value.callID,
    state: value.state,
    ...(value.metadata ? { metadata: value.metadata } : {}),
  } satisfies Omit<SessionV1.ToolPart, "id" | "sessionID" | "messageID">
}

function semanticAddress(occurrenceID: OccurrenceID): DefaultCourseSemanticAddress {
  return { occurrenceID, slot: "default_course_preference" }
}

function defaultPayloadFingerprint(courseID: Course.CourseID | null) {
  return fingerprint({ kind: "default_course_preference", courseID })
}

function fingerprint(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}

function integrity(detail: string) {
  return Effect.fail(new IntegrityError({ detail }))
}
