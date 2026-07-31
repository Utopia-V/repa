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
import { TurnLifecycle, type ValidatedAgentActionRegistration } from "../turn/turn"
import { TurnHistoricalToolPresentationTable, TurnModelOperationTable } from "../turn/sql"
import { Wildcard } from "../util/wildcard"
import type { PermissionV1 } from "../v1/permission"
import { SessionV1, type MessageID, type PartID } from "../v1/session"
import {
  createDefaultEffectID,
  IntegrityError,
  type DefaultCourseAcknowledgement,
  type DefaultCourseAgentAction,
  type DefaultCourseAgentActionProvenance,
  type DefaultCourseAgentCommandV3,
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
export const SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY = "set_default_course_preference"
export const SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION = 3
const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

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
  | Extract<DefaultCourseSemanticTerminalDisposition, { readonly kind: "semantic_terminal_v2" }>

export type DefaultCourseV3ResultDisposition =
  | Readonly<{ kind: "agent_action_v3"; agentAction: DefaultCourseAgentAction }>
  | Extract<DefaultCourseSemanticTerminalDisposition, { readonly kind: "semantic_terminal_v3" }>

export type DefaultCourseAgentActionInput = Readonly<{
  envelope: InvocationEnvelope
  settlement?: SettlementMetadata
  command: DefaultCourseAgentCommandV3
}>

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

type DefaultCourseInvocationState = Readonly<{
  status: "admitted" | "applied" | "already_applied" | "no_change" | "error"
  settlement: unknown
  acknowledgement?: DefaultCourseAcknowledgement
}>

export type DefaultCourseInvocationVersion =
  | (DefaultCourseInvocationState &
      Readonly<{
        version: 1
        disposition: "legacy_v1"
      }>)
  | (DefaultCourseInvocationState &
      Readonly<{
        version: 2
        disposition: "semantic_terminal_v2" | "candidate_v2"
        authorizationFingerprint?: string
        authorization?: DefaultCourseV2Authorization
        semanticTerminal?: Extract<DefaultCourseSemanticTerminalDisposition, { readonly kind: "semantic_terminal_v2" }>
      }>)
  | (DefaultCourseInvocationState &
      Readonly<{
        version: 3
        disposition: "semantic_terminal_v3" | "agent_action_v3"
        agentActionFingerprint?: string
        agentAction?: DefaultCourseAgentAction
        semanticTerminal?: Extract<DefaultCourseSemanticTerminalDisposition, { readonly kind: "semantic_terminal_v3" }>
      }>)

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

export function reserveDefaultCourseV3(tx: Transaction, input: DefaultCourseAgentActionInput) {
  return Effect.gen(function* () {
    const physicalFingerprint = fingerprint({
      commandName: SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY,
      commandVersion: SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION,
      envelope: input.envelope,
      command: input.command,
    })
    const existing = yield* findPhysicalInvocation(tx, input, physicalFingerprint, {
      name: SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY,
      version: SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION,
    })
    if (existing) {
      const disposition = yield* requireDefaultCourseDisposition(tx, existing.part_id)
      const agentAction =
        disposition.disposition === "agent_action_v3" ? yield* agentActionInfo(disposition) : undefined
      const semanticTerminal =
        disposition.disposition === "semantic_terminal_v3" ? yield* semanticTerminalInfo(disposition) : undefined
      if (existing.status === "admitted") {
        if (!agentAction) return yield* integrity("Only a complete Default-Course Agent action may remain admitted")
        return {
          type: "admitted" as const,
          agentActionFingerprint: agentAction.fingerprint,
          agentAction,
        }
      }
      return {
        type: "replay" as const,
        settlement: existing.settlement,
        disposition: disposition.disposition,
        ...(agentAction ? { agentAction } : {}),
        ...(semanticTerminal ? { semanticTerminal } : {}),
        acknowledgement: yield* readDefaultCourseAcknowledgement(tx, { partID: existing.part_id }),
      }
    }

    yield* requireV3Envelope(input.envelope)
    const registration = {
      turnID: input.envelope.turnID,
      inputID: input.envelope.inputID,
      causalOccurrenceID: input.envelope.occurrenceID,
      partID: input.envelope.partID,
      callID: input.envelope.providerCallID,
      emissionOrdinal: input.envelope.emissionOrdinal,
      sessionID: input.envelope.sessionID,
      assistantMessageID: input.envelope.assistantMessageID,
      capabilityIdentity: input.envelope.capabilityIdentity,
    }
    yield* TurnLifecycle.validateLearningCommandRegistration(tx, registration).pipe(
      Effect.mapError((error) => new IntegrityError({ detail: error.reason })),
    )
    const commandFingerprint = fingerprint(input.command)
    const address = semanticAddress(input.envelope.occurrenceID)
    const addressFingerprint = fingerprint(address)
    const targetCourseID = v3TargetCourseID(input.command)
    const incomingPayloadFingerprint = defaultPayloadFingerprint(targetCourseID)
    const semantic = yield* LearnerNavigation.resolveDefaultEffect(tx, {
      occurrenceID: input.envelope.occurrenceID,
      targetCourseID,
    }).pipe(Effect.orDie)
    if (semantic.type !== "new") {
      if (!input.settlement) {
        return yield* integrity("Default-Course V3 semantic-terminal admission has no settlement metadata")
      }
      const semanticTerminal = {
        kind: "semantic_terminal_v3",
        outcome: semantic.type,
        command: input.command,
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
          name: SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY,
          version: SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION,
        },
      })
      yield* tx
        .insert(LearnerDefaultCourseDispositionTable)
        .values({
          invocation_part_id: input.envelope.partID,
          disposition: "semantic_terminal_v3",
          command_fingerprint: commandFingerprint,
          semantic_outcome: semantic.type,
          command_snapshot: input.command,
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

    const trusted = yield* TurnLifecycle.validateAgentActionRegistration(tx, registration).pipe(
      Effect.mapError((error) => new IntegrityError({ detail: error.reason })),
    )
    yield* requireExplicitDelegation(trusted, targetCourseID ?? "clear")
    const snapshot = yield* prepareV3Snapshot(tx, input.command)
    const provenance = yield* agentActionProvenance(input.envelope, trusted)
    const agentActionFingerprint = fingerprint({
      provenance,
      commandFingerprint,
      preferenceHeadID: snapshot.preferenceHeadID,
      preferenceVersion: snapshot.preferenceVersion,
      operation: snapshot.operation,
      from: snapshot.from,
      to: snapshot.to,
    })
    const agentAction = {
      kind: "agent_action_v3",
      fingerprint: agentActionFingerprint,
      provenance,
      command: input.command,
      commandFingerprint,
      preferenceHeadID: snapshot.preferenceHeadID,
      preferenceVersion: snapshot.preferenceVersion,
      operation: snapshot.operation,
      from: snapshot.from,
      to: snapshot.to,
    } satisfies DefaultCourseAgentAction
    yield* admitPhysicalInvocation(tx, {
      envelope: input.envelope,
      fingerprint: physicalFingerprint,
      command: {
        name: SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY,
        version: SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION,
      },
    })
    yield* tx
      .insert(LearnerDefaultCourseDispositionTable)
      .values({
        invocation_part_id: input.envelope.partID,
        disposition: "agent_action_v3",
        agent_action_version: 3,
        agent_action_fingerprint: agentActionFingerprint,
        agent_action_provenance: provenance,
        command_fingerprint: commandFingerprint,
        command_snapshot: input.command,
        preference_head_id: snapshot.preferenceHeadID,
        preference_version: snapshot.preferenceVersion,
        operation: snapshot.operation,
        from_locator: snapshot.from,
        to_locator: snapshot.to,
        selected_course_id: null,
        time_disposed: input.envelope.timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)
    return { type: "admitted" as const, agentActionFingerprint, agentAction }
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
    const version =
      disposition.disposition === "legacy_v1"
        ? 1
        : disposition.disposition === "semantic_terminal_v3" || disposition.disposition === "agent_action_v3"
          ? 3
          : 2
    if (version !== invocation.command_version) {
      return yield* integrity("Default-Course physical version and disposition diverge")
    }
    const acknowledgement = yield* readDefaultCourseAcknowledgement(tx, { partID: invocation.part_id })
    if (
      invocation.status === "admitted" &&
      disposition.disposition !== "candidate_v2" &&
      disposition.disposition !== "agent_action_v3" &&
      !(disposition.disposition === "legacy_v1" && disposition.legacy_row_class === "admitted")
    ) {
      return yield* integrity("Only a complete V2 candidate or migrated admitted V1 row may remain admitted")
    }
    const state = {
      status: invocation.status,
      settlement: invocation.settlement,
      ...(acknowledgement ? { acknowledgement } : {}),
    }
    if (disposition.disposition === "legacy_v1") {
      return { ...state, version: 1 as const, disposition: "legacy_v1" as const }
    }
    if (disposition.disposition === "candidate_v2") {
      const authorization = yield* authorizationInfo(disposition, invocation.occurrence_id)
      return {
        ...state,
        version: 2 as const,
        disposition: "candidate_v2" as const,
        authorizationFingerprint: authorization.fingerprint,
        authorization,
      }
    }
    if (disposition.disposition === "semantic_terminal_v2") {
      const semanticTerminal = yield* semanticTerminalInfo(disposition)
      if (semanticTerminal.kind !== "semantic_terminal_v2") {
        return yield* integrity("Default-Course V2 semantic-terminal version diverged")
      }
      return { ...state, version: 2 as const, disposition: "semantic_terminal_v2" as const, semanticTerminal }
    }
    if (disposition.disposition === "agent_action_v3") {
      const agentAction = yield* agentActionInfo(disposition)
      return {
        ...state,
        version: 3 as const,
        disposition: "agent_action_v3" as const,
        agentActionFingerprint: agentAction.fingerprint,
        agentAction,
      }
    }
    const semanticTerminal = yield* semanticTerminalInfo(disposition)
    if (semanticTerminal.kind !== "semantic_terminal_v3") {
      return yield* integrity("Default-Course V3 semantic-terminal version diverged")
    }
    return { ...state, version: 3 as const, disposition: "semantic_terminal_v3" as const, semanticTerminal }
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
        !matchesCapabilityBasis(existing, state.basis)
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
        ...capabilityBasisColumns(state.basis),
        policy_basis: input.policyBasis,
        policy_fingerprint: policyFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      outcome: input.outcome,
      ...capabilityBasisInfo(state.basis),
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
        !matchesCapabilityBasis(existing, state.basis) ||
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
        ...capabilityBasisColumns(state.basis),
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
      ...capabilityBasisInfo(state.basis),
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
    if (!issue || issue.permission_request_id !== input.requestID || !matchesCapabilityBasis(issue, state.basis)) {
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
        ...capabilityBasisColumns(state.basis),
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
      ...capabilityBasisInfo(state.basis),
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
        ...capabilityBasisColumns(state.basis),
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      outcome,
      ...(issue ? { requestID: issue.permission_request_id } : {}),
      ...capabilityBasisInfo(state.basis),
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
      targetCourseID: command.target?.courseID ?? null,
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
      targetCourseID: command.target?.courseID ?? null,
      settlement: input.settlement,
    })
    if (semantic) return semantic
    const capability = yield* capabilitySettlement(tx, input.partID)
    if (
      !capability ||
      capability.authorization_fingerprint !== authorization.authorization_fingerprint ||
      capability.agent_action_fingerprint !== null
    ) {
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

export function recoverDefaultCourseV3(
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
      invocation.command_name !== SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY ||
      invocation.command_version !== 3
    ) {
      return yield* integrity("Default-Course V3 recovery invocation is unavailable")
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
    const agentAction = yield* requireV3AgentAction(tx, input.partID)
    if (!isDefaultCourseV3Command(agentAction.command_snapshot)) {
      return yield* integrity("Default-Course V3 Agent action lost its command projection")
    }
    const semantic = yield* settleDefaultCourseSemanticRace(tx, {
      partID: input.partID,
      occurrenceID: invocation.occurrence_id,
      targetCourseID: v3TargetCourseID(agentAction.command_snapshot),
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

export function settleDefaultCourseV3(
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
      invocation.command_name !== SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY ||
      invocation.command_version !== 3
    ) {
      return yield* integrity("Default-Course V3 invocation is unavailable")
    }
    if (invocation.status !== "admitted") {
      return {
        type: "replay" as const,
        settlement: invocation.settlement,
        acknowledgement: yield* readDefaultCourseAcknowledgement(tx, { partID: input.partID }),
      }
    }
    const agentAction = yield* requireV3AgentAction(tx, input.partID)
    if (!isDefaultCourseV3Command(agentAction.command_snapshot)) {
      return yield* integrity("Default-Course V3 Agent action lost its command projection")
    }
    const command = agentAction.command_snapshot
    const semantic = yield* settleDefaultCourseSemanticRace(tx, {
      partID: input.partID,
      occurrenceID: invocation.occurrence_id,
      targetCourseID: v3TargetCourseID(command),
      settlement: input.settlement,
    })
    if (semantic) return semantic
    const capability = yield* capabilitySettlement(tx, input.partID)
    if (
      !capability ||
      capability.authorization_fingerprint !== null ||
      capability.agent_action_fingerprint !== agentAction.agent_action_fingerprint
    ) {
      return yield* integrity("Default-Course V3 final settlement has no exact durable capability outcome")
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
    const fresh = yield* prepareV3Snapshot(tx, command).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch(() => Effect.succeed({ type: "failure" as const })),
    )
    if (
      fresh.type === "failure" ||
      !sameSnapshot(fresh.value, {
        preferenceHeadID: agentAction.preference_head_id,
        preferenceVersion: agentAction.preference_version!,
        operation: agentAction.operation!,
        from: agentAction.from_locator!,
        to: agentAction.to_locator!,
      })
    ) {
      const settlement = errorSettlement("stale", input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const previousCourseID =
      agentAction.from_locator?.kind === "course" ? agentAction.from_locator.locator.courseID : null
    const targetCourseID = v3TargetCourseID(command)
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
      previousVersion: agentAction.preference_version!,
      version: agentAction.preference_version! + 1,
      timeCommitted: input.settlement.time,
      commitOrder: input.settlement.order,
      frontierSequence: frontier.sequence,
    } satisfies DefaultEffect
    yield* tx
      .insert(DefaultCoursePreferenceTransitionTable)
      .values({
        id: effect.id,
        version: effect.version,
        predecessor_id: agentAction.preference_head_id,
        previous_course_id: effect.previousCourseID,
        course_id: effect.courseID,
        occurrence_id: effect.occurrenceID,
        authorization_part_id: null,
        agent_action_part_id: input.partID,
        permission_request_id: null,
        confirmation_snapshot: null,
        target_course_version: fresh.value.proof?.receipt.courseVersion ?? null,
        target_selection_revision_id: fresh.value.proof?.receipt.selectionRevisionID ?? null,
        target_selection_version: fresh.value.proof?.receipt.selectionVersion ?? null,
        target_view_id: fresh.value.proof?.receipt.viewID ?? null,
        target_view_version: fresh.value.proof?.receipt.viewVersion ?? null,
        target_revision_version: fresh.value.proof?.receipt.revisionVersion ?? null,
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
      effectAgentActionPartID: input.partID,
      agentActionVersion: 3,
      effectID: effect.id,
      receiptID,
      operation: agentAction.operation!,
      from: agentAction.from_locator!,
      to: agentAction.to_locator!,
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

function prepareV3Snapshot(tx: Transaction, command: DefaultCourseAgentCommandV3) {
  return Effect.gen(function* () {
    const head = yield* tx
      .select()
      .from(DefaultCoursePreferenceTransitionTable)
      .orderBy(desc(DefaultCoursePreferenceTransitionTable.version))
      .limit(1)
      .get()
      .pipe(Effect.orDie)
    const from = head?.course_id
      ? ({ kind: "course", locator: yield* exactLocator(tx, head.course_id) } as const)
      : ({ kind: "absent" } as const)
    const proof =
      command.action === "set" ? yield* Course.prepareCurrentPreferenceTargetProof(tx, command.courseID) : undefined
    const to = proof
      ? ({ kind: "course", locator: exactLocatorFromReceipt(proof.receipt) } as const)
      : ({ kind: "absent" } as const)
    return {
      preferenceHeadID: head?.id ?? null,
      preferenceVersion: head?.version ?? 0,
      operation: operation(from, to),
      from,
      to,
      proof,
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

function requireV3Envelope(envelope: InvocationEnvelope) {
  const valid =
    envelope.capabilityIdentity === SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY &&
    envelope.capabilityVersion === SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION &&
    envelope.authorizationBasis === "agent_action"
  return valid ? Effect.void : integrity("Default-Course V3 envelope has an incompatible Agent-action basis")
}

function agentActionProvenance(
  envelope: InvocationEnvelope,
  trusted: ValidatedAgentActionRegistration,
): Effect.Effect<DefaultCourseAgentActionProvenance, IntegrityError> {
  return Effect.gen(function* () {
    if (
      trusted.occurrenceID !== envelope.occurrenceID ||
      trusted.depth !== trusted.lineage.length ||
      (trusted.admissionKind === "learner" && (trusted.depth !== 0 || trusted.lineage.length !== 0)) ||
      (trusted.admissionKind === "delegated_task" && (trusted.depth <= 0 || trusted.lineage.length === 0))
    ) {
      return yield* integrity("Default-Course Agent action has no exact root-or-delegated Turn lineage")
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
      capabilityIdentity: SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY as "set_default_course_preference",
      capabilityVersion: SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION as 3,
    }
    if (trusted.admissionKind === "learner") {
      return { ...common, kind: "root" as const, lineage: [] }
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
      return yield* integrity("Default-Course delegated Agent action has no exact effective capability")
    }
    return {
      ...common,
      kind: "delegated" as const,
      lineage: lineage as [(typeof lineage)[number], ...(typeof lineage)[number][]],
      effectiveDelegatedCapability: {
        identity: SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY,
        version: SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION,
        projectionVersion: 2,
        fingerprint: effective.delegatedCapabilityFingerprint,
      },
    }
  })
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
    targetCourseID: Course.CourseID | null
    settlement: SettlementMetadata
  }>,
) {
  return Effect.gen(function* () {
    const resolution = yield* LearnerNavigation.resolveDefaultEffect(tx, {
      occurrenceID: input.occurrenceID,
      targetCourseID: input.targetCourseID,
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
        agentActionPartID: DefaultCoursePreferenceTransitionTable.agent_action_part_id,
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
    if (
      ("authorizationVersion" in original &&
        (effect.authorizationPartID !== original.effectAuthorizationPartID || effect.agentActionPartID !== null)) ||
      ("agentActionVersion" in original &&
        (effect.agentActionPartID !== original.effectAgentActionPartID || effect.authorizationPartID !== null))
    ) {
      return yield* integrity("Already-applied Default-Course effect provenance diverges from its acknowledgement")
    }
    const acknowledgement =
      "authorizationVersion" in original && original.authorizationVersion === 1
        ? acknowledgementSnapshot({
            invocationPartID,
            effectAuthorizationPartID: original.effectAuthorizationPartID,
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
        : "authorizationVersion" in original
          ? acknowledgementSnapshot({
              invocationPartID,
              effectAuthorizationPartID: original.effectAuthorizationPartID,
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
          : acknowledgementSnapshot({
              invocationPartID,
              effectAgentActionPartID: original.effectAgentActionPartID,
              agentActionVersion: 3,
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
  return "agentActionVersion" in input ? { schemaVersion: 2, ...input } : { schemaVersion: 1, ...input }
}

function insertAcknowledgement(tx: Transaction, acknowledgement: DefaultCourseAcknowledgement) {
  return tx
    .insert(LearnerDefaultCourseAcknowledgementTable)
    .values({
      invocation_part_id: acknowledgement.invocationPartID,
      effect_authorization_part_id:
        "authorizationVersion" in acknowledgement ? acknowledgement.effectAuthorizationPartID : null,
      authorization_version: "authorizationVersion" in acknowledgement ? acknowledgement.authorizationVersion : null,
      effect_agent_action_part_id:
        "agentActionVersion" in acknowledgement ? acknowledgement.effectAgentActionPartID : null,
      agent_action_version: "agentActionVersion" in acknowledgement ? acknowledgement.agentActionVersion : null,
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
    if (
      !invocation ||
      invocation.status !== "admitted" ||
      (invocation.command_version !== 2 && invocation.command_version !== 3)
    ) {
      return yield* integrity("Default-Course capability lifecycle requires one admitted candidate")
    }
    if (invocation.command_version === 2) {
      const authorization = yield* requireV2Authorization(tx, partID)
      return {
        invocation,
        authorization,
        basis: { kind: "authorization" as const, fingerprint: authorization.authorization_fingerprint },
      }
    }
    const agentAction = yield* requireV3AgentAction(tx, partID)
    return {
      invocation,
      agentAction,
      basis: { kind: "agent_action" as const, fingerprint: agentAction.agent_action_fingerprint },
    }
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
      authorization.authorization_fingerprint === null ||
      !isDefaultCourseV2Command(authorization.command_snapshot)
    ) {
      return yield* integrity("Default-Course V2 invocation has no closed semantic authorization")
    }
    return {
      ...authorization,
      disposition: "candidate_v2" as const,
      authorization_version: 2 as const,
      authorization_kind: authorization.authorization_kind,
      authorization_fingerprint: authorization.authorization_fingerprint,
      command_snapshot: authorization.command_snapshot,
    }
  })
}

function requireV3AgentAction(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const agentAction = yield* tx
      .select()
      .from(LearnerDefaultCourseDispositionTable)
      .where(eq(LearnerDefaultCourseDispositionTable.invocation_part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !agentAction ||
      agentAction.disposition !== "agent_action_v3" ||
      agentAction.agent_action_version !== 3 ||
      !agentAction.agent_action_fingerprint ||
      !isDefaultCourseV3Command(agentAction.command_snapshot)
    ) {
      return yield* integrity("Default-Course V3 invocation has no closed Agent-issuance provenance")
    }
    return {
      ...agentAction,
      disposition: "agent_action_v3" as const,
      agent_action_version: 3 as const,
      agent_action_fingerprint: agentAction.agent_action_fingerprint,
      command_snapshot: agentAction.command_snapshot,
    }
  })
}

function semanticTerminalInfo(
  row: typeof LearnerDefaultCourseDispositionTable.$inferSelect,
): Effect.Effect<DefaultCourseSemanticTerminalDisposition, IntegrityError> {
  if (
    (row.disposition !== "semantic_terminal_v2" && row.disposition !== "semantic_terminal_v3") ||
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
  if (row.disposition === "semantic_terminal_v2" && isDefaultCourseV2Command(row.command_snapshot)) {
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
  if (row.disposition === "semantic_terminal_v3" && isDefaultCourseV3Command(row.command_snapshot)) {
    return Effect.succeed({
      kind: "semantic_terminal_v3",
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
  return integrity("Default-Course semantic-terminal command version is invalid")
}

function agentActionInfo(
  row: typeof LearnerDefaultCourseDispositionTable.$inferSelect,
): Effect.Effect<DefaultCourseAgentAction, IntegrityError> {
  if (
    row.disposition !== "agent_action_v3" ||
    row.agent_action_version !== 3 ||
    !row.agent_action_fingerprint ||
    !row.agent_action_provenance ||
    !isDefaultCourseV3Command(row.command_snapshot) ||
    row.preference_version === null ||
    !row.operation ||
    !row.from_locator ||
    !row.to_locator
  ) {
    return integrity("Default-Course V3 Agent-action projection is incomplete")
  }
  return Effect.succeed({
    kind: "agent_action_v3",
    fingerprint: row.agent_action_fingerprint,
    provenance: row.agent_action_provenance,
    command: row.command_snapshot,
    commandFingerprint: row.command_fingerprint,
    preferenceHeadID: row.preference_head_id,
    preferenceVersion: row.preference_version,
    operation: row.operation,
    from: row.from_locator,
    to: row.to_locator,
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
      !isDefaultCourseV2Command(row.command_snapshot) ||
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
    ...storedCapabilityBasisInfo(row),
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
    ...storedCapabilityBasisInfo(row),
    ...(row.policy_basis ? { policyBasis: row.policy_basis } : {}),
    ...(row.policy_fingerprint ? { policyFingerprint: row.policy_fingerprint } : {}),
    ...(row.reply ? { reply: row.reply } : {}),
    ...(row.reply_fingerprint ? { replyFingerprint: row.reply_fingerprint } : {}),
    timeSettled: row.time_settled,
    settlementOrder: row.settlement_order,
  }
}

type CapabilityBasis =
  | Readonly<{ kind: "authorization"; fingerprint: string }>
  | Readonly<{ kind: "agent_action"; fingerprint: string }>

function capabilityBasisColumns(basis: CapabilityBasis) {
  return basis.kind === "authorization"
    ? { authorization_fingerprint: basis.fingerprint, agent_action_fingerprint: null }
    : { authorization_fingerprint: null, agent_action_fingerprint: basis.fingerprint }
}

function capabilityBasisInfo(basis: CapabilityBasis) {
  return basis.kind === "authorization"
    ? { authorizationFingerprint: basis.fingerprint }
    : { agentActionFingerprint: basis.fingerprint }
}

function storedCapabilityBasisInfo(row: {
  readonly authorization_fingerprint: string | null
  readonly agent_action_fingerprint: string | null
}) {
  if (row.authorization_fingerprint && !row.agent_action_fingerprint) {
    return { authorizationFingerprint: row.authorization_fingerprint }
  }
  if (!row.authorization_fingerprint && row.agent_action_fingerprint) {
    return { agentActionFingerprint: row.agent_action_fingerprint }
  }
  throw new Error("Default-Course capability row has no closed provenance basis")
}

function matchesCapabilityBasis(
  row: { readonly authorization_fingerprint: string | null; readonly agent_action_fingerprint: string | null },
  basis: CapabilityBasis,
) {
  return basis.kind === "authorization"
    ? row.authorization_fingerprint === basis.fingerprint && row.agent_action_fingerprint === null
    : row.authorization_fingerprint === null && row.agent_action_fingerprint === basis.fingerprint
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

function semanticAddress(occurrenceID: OccurrenceID): DefaultCourseSemanticAddress {
  return { occurrenceID, slot: "default_course_preference" }
}

function defaultPayloadFingerprint(courseID: Course.CourseID | null) {
  return fingerprint({ kind: "default_course_preference", courseID })
}

function v3TargetCourseID(command: DefaultCourseAgentCommandV3) {
  return command.action === "set" ? command.courseID : null
}

function isDefaultCourseV2Command(value: unknown): value is DefaultCourseCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const command = value as Record<string, unknown>
  return (
    command.kind === "default_course_preference" &&
    Number.isSafeInteger(command.expectedVersion) &&
    (command.expectedHeadID === null || typeof command.expectedHeadID === "string") &&
    (command.target === null ||
      (!!command.target &&
        typeof command.target === "object" &&
        !Array.isArray(command.target) &&
        typeof (command.target as Record<string, unknown>).courseID === "string"))
  )
}

function isDefaultCourseV3Command(value: unknown): value is DefaultCourseAgentCommandV3 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const command = value as Record<string, unknown>
  const keys = Object.keys(command).toSorted()
  if (command.action === "clear") return keys.length === 1 && keys[0] === "action"
  return (
    command.action === "set" &&
    typeof command.courseID === "string" &&
    keys.length === 2 &&
    keys[0] === "action" &&
    keys[1] === "courseID"
  )
}

function isDelegatedCapabilityProjection(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const capability = value as Record<string, unknown>
  return (
    capability.version === 2 &&
    Array.isArray(capability.parent) &&
    Array.isArray(capability.inherited) &&
    Array.isArray(capability.profile) &&
    Array.isArray(capability.explicit)
  )
}

function requireExplicitDelegation(trusted: ValidatedAgentActionRegistration, pattern: string) {
  if (trusted.admissionKind === "learner") return Effect.void
  const effective = trusted.lineage.at(-1)?.delegatedCapability
  if (!isDelegatedCapabilityProjection(effective)) {
    return integrity("Default-Course delegated Agent action has no exact capability projection")
  }
  const explicit = (effective as Readonly<{ explicit: readonly unknown[] }>).explicit
  const granted = explicit.some(
    (value) =>
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).action === "allow" &&
      typeof (value as Record<string, unknown>).permission === "string" &&
      typeof (value as Record<string, unknown>).pattern === "string" &&
      Wildcard.matchIdentifier(
        SET_DEFAULT_COURSE_PREFERENCE_V3_CAPABILITY,
        (value as Record<string, unknown>).permission as string,
      ) &&
      Wildcard.match(pattern, (value as Record<string, unknown>).pattern as string),
  )
  return granted
    ? Effect.void
    : integrity("Default-Course delegated Agent action lacks the required explicit capability")
}

function fingerprint(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}

function integrity(detail: string) {
  return Effect.fail(new IntegrityError({ detail }))
}
