export * as LearningCommandPresentation from "./presentation"

import { Course } from "@opencode-ai/core/course"
import { Assignment } from "@opencode-ai/core/assignment"
import { LearnerStateJudgment } from "@opencode-ai/core/learner-state-judgment"
import { FutureAttention } from "@opencode-ai/core/future-attention"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningBootstrap } from "@opencode-ai/core/learning-bootstrap"
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import type {
  DefaultCourseV3ResultDisposition,
  DefaultCourseV2Authorization,
  DefaultCourseV2ResultDisposition,
} from "@opencode-ai/core/learner-navigation/default-course-v2"
import type {
  DefaultCourseAcknowledgement,
  DefaultCourseAgentAction,
  DefaultCourseProposal,
} from "@opencode-ai/core/learner-navigation/schema"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"

type Capability =
  | typeof LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY
  | typeof LearningCommand.REPRESENTATION_CONVERT_CAPABILITY
  | typeof LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
  | typeof LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY
  | typeof LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY
  | typeof LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY
  | typeof LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY
  | typeof LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY
  | typeof LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY
  | typeof LearningCommand.UPDATE_ASSIGNMENT_CAPABILITY
  | typeof LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY

type BindingInput = Readonly<{
  sessionID: string
  assistantMessageID: string
  providerCallID: string
  partID?: string
}>

export type ResultOwnerPresentation = Readonly<{
  course?: Course.SelectionAcceptancePresentation
  anchor?: LearnerNavigation.AnchorResultPresentation
  retained?: RetainedSteering.ResultPresentation
}>

export function hostDefaultCourseProposalResult(
  proposal: DefaultCourseProposal,
  input: Readonly<{
    sessionID: string
    assistantMessageID: string
    providerCallID: string
    partID: string
    emissionOrdinal: number
  }>,
) {
  if (
    proposal.sessionID !== input.sessionID ||
    proposal.assistantMessageID !== input.assistantMessageID ||
    proposal.callID !== input.providerCallID ||
    proposal.partID !== input.partID ||
    proposal.emissionOrdinal !== input.emissionOrdinal
  ) {
    throw new Error("Default Course proposal diverged from its host-prepared Tool identity")
  }
  return {
    title: "Default Course proposal",
    metadata: {
      proposalKind: "default_course_preference",
      proposalFingerprint: proposal.fingerprint,
      emissionOrdinal: proposal.emissionOrdinal,
      durablyRecorded: true,
      mutating: false,
      truncated: false,
    },
    output: JSON.stringify({
      outcome: "proposal_recorded",
      proposal,
      instruction:
        "This proposal is non-mutating. A later learner acceptance must select this exact proposal Part; the proposing Assistant cannot accept it in the same round.",
    }),
  }
}

export function defaultCourseV2Capability(authorization: DefaultCourseV2Authorization, envelope: BindingInput) {
  return SemanticPresentation.proposal({
    kind: "default_course_v2_capability",
    binding: binding(envelope),
    authorization,
  })
}

export function defaultCourseV2SettlementResult(
  settlement: LearningCommand.PhysicalSettlement,
  disposition: DefaultCourseV2ResultDisposition,
  acknowledgement: DefaultCourseAcknowledgement | undefined,
  envelope: BindingInput,
) {
  if (settlement.outcome === "error" && typeof settlement.code !== "string") {
    throw new Error("Failed Default-Course V2 settlement has no exact error code")
  }
  return SemanticPresentation.result({
    kind: "default_course_v2_result",
    binding: binding(envelope),
    settlement:
      settlement.outcome === "error"
        ? { outcome: settlement.outcome, code: settlement.code as string }
        : { outcome: settlement.outcome },
    disposition,
    ...(acknowledgement?.schemaVersion === 1 ? { acknowledgement } : {}),
  })
}

export function defaultCourseV3Capability(agentAction: DefaultCourseAgentAction, envelope: BindingInput) {
  return SemanticPresentation.proposal({
    kind: "default_course_v3_capability",
    binding: binding(envelope),
    agentAction,
  })
}

export function defaultCourseV3SettlementResult(
  settlement: LearningCommand.PhysicalSettlement,
  disposition: DefaultCourseV3ResultDisposition,
  acknowledgement: DefaultCourseAcknowledgement | undefined,
  envelope: BindingInput,
) {
  if (settlement.outcome === "error" && typeof settlement.code !== "string") {
    throw new Error("Failed Default-Course V3 settlement has no exact error code")
  }
  return SemanticPresentation.result({
    kind: "default_course_v3_result",
    binding: binding(envelope),
    settlement:
      settlement.outcome === "error"
        ? { outcome: settlement.outcome, code: settlement.code as string }
        : { outcome: settlement.outcome },
    disposition,
    ...(acknowledgement ? { acknowledgement } : {}),
  })
}

export function learnerGoalsV2Capability(candidate: LearnerGoal.CandidateV2, envelope: BindingInput) {
  return SemanticPresentation.proposal({
    kind: "learner_goals_v2_capability",
    binding: binding(envelope),
    commandFingerprint: candidate.commandFingerprint,
    issuance: candidate.agentAction.kind,
    operations: candidate.materialized.operations.map(learnerGoalV2MaterializedOperation),
  })
}

export function learnerGoalsV2SettlementResult(
  settlement: LearningCommand.PhysicalSettlement,
  state: Extract<LearningCommand.GoalInvocationVersion, { readonly version: 2 }>,
  envelope: BindingInput,
) {
  if (settlement.outcome === "error" && typeof settlement.code !== "string") {
    throw new Error("Failed learner Goal V2 settlement has no exact error code")
  }
  const operations =
    settlement.outcome !== "error" &&
    settlement.goalKind === "learner_goal" &&
    settlement.schemaVersion === 2 &&
    Array.isArray(settlement.operations)
      ? (settlement.operations as readonly LearnerGoal.OperationResultV2[]).map(goalV2ResultOperation)
      : []
  return SemanticPresentation.result({
    kind: "learner_goals_v2_result",
    binding: binding(envelope),
    settlement:
      settlement.outcome === "error"
        ? { outcome: settlement.outcome, code: settlement.code as string }
        : { outcome: settlement.outcome },
    disposition: state.disposition,
    ...(state.semanticTerminal ? { semanticOutcome: state.semanticTerminal.outcome } : {}),
    ...(state.candidate ? { issuance: state.candidate.agentAction.kind } : {}),
    ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
    ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
    operations,
  })
}

export function learningBootstrapCapability(candidate: LearningBootstrap.Candidate, envelope: BindingInput) {
  return SemanticPresentation.proposal({
    kind: "learning_bootstrap_capability",
    binding: binding(envelope),
    commandFingerprint: candidate.commandFingerprint,
    issuance: candidate.agentAction.kind,
    scope: learningBootstrapScope(candidate),
  })
}

export function learningBootstrapSettlementResult(
  settlement: LearningCommand.PhysicalSettlement,
  state: LearningBootstrap.InvocationVersion,
  envelope: BindingInput,
) {
  if (settlement.outcome === "error" && typeof settlement.code !== "string") {
    throw new Error("Failed learning-bootstrap settlement has no exact error code")
  }
  const acknowledgement =
    settlement.outcome !== "error" && "acknowledgement" in settlement
      ? (settlement.acknowledgement as LearningBootstrap.Acknowledgement)
      : undefined
  return SemanticPresentation.result({
    kind: "learning_bootstrap_result",
    binding: binding(envelope),
    settlement:
      settlement.outcome === "error"
        ? { outcome: settlement.outcome, code: settlement.code as string }
        : { outcome: settlement.outcome },
    disposition: state.disposition,
    ...(state.semanticTerminal ? { semanticOutcome: state.semanticTerminal.outcome } : {}),
    ...(state.candidate ? { issuance: state.candidate.agentAction.kind } : {}),
    ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
    ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
    ...(acknowledgement ? { acknowledgement } : {}),
  })
}

export function learningBootstrapScope(candidate: LearningBootstrap.Candidate) {
  const command = candidate.canonicalCommand
  return {
    command: structuredClone({
      schemaVersion: 1 as const,
      course: command.course,
      ...(command.route ? { route: command.route } : {}),
      selection: command.selection ?? { type: "preserve" as const },
      materials: command.materials ?? [],
      maps: command.maps ?? [],
      alignments: command.alignments ?? [],
      anchor: command.anchor ?? { type: "preserve" as const },
    }),
  }
}

export function learnerResponseEvidenceCapability(
  candidate: LearnerResponseEvidence.Candidate,
  envelope: BindingInput,
) {
  return SemanticPresentation.proposal({
    kind: "learner_response_evidence_capability",
    binding: binding(envelope),
    commandFingerprint: candidate.commandFingerprint,
    issuance: candidate.agentAction.kind,
    scope: learnerResponseEvidenceScope(candidate),
  })
}

export function learnerResponseEvidenceScope(candidate: LearnerResponseEvidence.Candidate) {
  const command = candidate.canonicalCommand
  const operation = command.operation
  const target = candidate.materialized.target ?? candidate.materialized.current?.target
  if (!target) throw new Error("Learner-response-evidence candidate has no exact target scope")
  return {
    command: structuredClone(command),
    subject: structuredClone(candidate.materialized.subject),
    target: structuredClone(target),
    assessmentScope: "entire_exact_selector" as const,
    programBasis:
      operation === "create" || operation === "revise_from_tutor_interpretation"
        ? ("tutor_interpretation" as const)
        : operation === "revise_from_learner_report"
          ? ("learner_report" as const)
          : ("preserve" as const),
    programDisposition: operation === "retract" ? ("retracted" as const) : ("active" as const),
    assessmentSourcePolicy:
      operation === "create"
        ? ("current_response_and_disclosure" as const)
        : operation === "revise_from_tutor_interpretation"
          ? ("original_response_and_disclosure" as const)
          : operation === "revise_from_learner_report"
            ? ("current_learner_correction" as const)
            : ("preserve_existing_basis" as const),
    nonImplications: ["mastery", "understanding", "retention", "required_next_action"],
  }
}

export function learnerResponseEvidenceSettlementResult(
  settlement: LearningCommand.PhysicalSettlement,
  state: LearnerResponseEvidence.InvocationVersion,
  envelope: BindingInput,
) {
  if (settlement.outcome === "error" && typeof settlement.code !== "string") {
    throw new Error("Failed learner-response-evidence settlement has no exact error code")
  }
  const effect = learnerResponseEvidenceEffect(settlement)
  return SemanticPresentation.result({
    kind: "learner_response_evidence_result",
    binding: binding(envelope),
    settlement:
      settlement.outcome === "error"
        ? { outcome: settlement.outcome, code: settlement.code as string }
        : { outcome: settlement.outcome },
    disposition: state.disposition,
    ...(state.semanticTerminal ? { semanticOutcome: state.semanticTerminal.outcome } : {}),
    ...(state.candidate ? { issuance: state.candidate.agentAction.kind } : {}),
    ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
    ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
    ...(effect ? { effect } : {}),
  })
}

export function futureAttentionCapability(candidate: FutureAttention.Candidate, envelope: BindingInput) {
  return SemanticPresentation.proposal({
    kind: "future_attention_capability",
    binding: binding(envelope),
    commandFingerprint: candidate.commandFingerprint,
    issuance: candidate.agentAction.kind,
    scope: SemanticPresentation.futureAttentionScope(candidate.canonicalCommand),
  })
}

export function futureAttentionSettlementResult(
  settlement: LearningCommand.PhysicalSettlement,
  state: FutureAttention.InvocationVersion,
  envelope: BindingInput,
) {
  if (settlement.outcome === "error" && typeof settlement.code !== "string") {
    throw new Error("Failed FutureAttention settlement has no exact error code")
  }
  const effect = futureAttentionEffect(settlement)
  return SemanticPresentation.result({
    kind: "future_attention_result",
    binding: binding(envelope),
    settlement:
      settlement.outcome === "error"
        ? { outcome: settlement.outcome, code: settlement.code as string }
        : { outcome: settlement.outcome },
    disposition: state.disposition,
    ...(state.semanticTerminal ? { semanticOutcome: state.semanticTerminal.outcome } : {}),
    ...(state.candidate ? { issuance: state.candidate.agentAction.kind } : {}),
    ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
    ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
    ...(effect ? { effect } : {}),
  })
}

export function assignmentCapability(candidate: Assignment.Candidate, envelope: BindingInput) {
  if (candidate.agentAction.kind !== "root") throw new Error("Assignment capability requires a root Agent action")
  return SemanticPresentation.proposal({
    kind: "assignment_capability",
    binding: binding(envelope),
    commandFingerprint: candidate.commandFingerprint,
    issuance: "root",
    scope: SemanticPresentation.assignmentScope(candidate),
  })
}

export function assignmentSettlementResult(
  settlement: LearningCommand.PhysicalSettlement,
  state: Assignment.InvocationVersion,
  envelope: BindingInput,
) {
  if (settlement.outcome === "error" && typeof settlement.code !== "string") {
    throw new Error("Failed Assignment settlement has no exact error code")
  }
  const effect = assignmentEffect(settlement)
  if (state.candidate?.agentAction.kind === "delegated") {
    throw new Error("Assignment settlement contains an illegal delegated Agent action")
  }
  return SemanticPresentation.result({
    kind: "assignment_result",
    binding: binding(envelope),
    settlement:
      settlement.outcome === "error"
        ? { outcome: settlement.outcome, code: settlement.code as string }
        : { outcome: settlement.outcome },
    disposition: state.disposition,
    ...(state.semanticTerminal ? { semanticOutcome: state.semanticTerminal.outcome } : {}),
    ...(state.candidate ? { issuance: "root" as const } : {}),
    ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
    ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
    ...(effect ? { effect } : {}),
  })
}

function assignmentEffect(settlement: LearningCommand.PhysicalSettlement) {
  if (settlement.outcome === "error" || !("assignmentKind" in settlement) || settlement.assignmentKind !== "change_set") {
    return undefined
  }
  const value = settlement as unknown as
    | Assignment.AppliedSettlement
    | Assignment.AlreadyAppliedSettlement
    | Assignment.NoChangeSettlement
  return {
    ...(value.outcome === "already_applied" ? { existingOutcome: value.existingOutcome } : {}),
    ...(value.outcome === "applied" || (value.outcome === "already_applied" && value.existingOutcome === "applied")
      ? { effectID: value.effectID }
      : {}),
    changes: value.outcome === "no_change" ? [] : structuredClone(value.changes),
    intentResults: structuredClone(value.intentResults),
  }
}

export function learnerStateJudgmentCapability(
  candidate: LearnerStateJudgment.Candidate,
  envelope: BindingInput,
) {
  if (candidate.agentAction.kind !== "root") {
    throw new Error("Learner-state judgment capability requires a root Agent action")
  }
  return SemanticPresentation.proposal({
    kind: "learner_state_judgment_capability",
    binding: binding(envelope),
    commandFingerprint: candidate.commandFingerprint,
    issuance: "root",
    scope: SemanticPresentation.learnerStateJudgmentScope(candidate),
  })
}

export function learnerStateJudgmentSettlementResult(
  settlement: LearningCommand.PhysicalSettlement,
  state: LearnerStateJudgment.InvocationVersion,
  envelope: BindingInput,
) {
  if (settlement.outcome === "error" && typeof settlement.code !== "string") {
    throw new Error("Failed learner-state judgment settlement has no exact error code")
  }
  if (state.candidate?.agentAction.kind === "delegated") {
    throw new Error("Learner-state judgment settlement contains an illegal delegated Agent action")
  }
  const effect = learnerStateJudgmentEffect(settlement)
  return SemanticPresentation.result({
    kind: "learner_state_judgment_result",
    binding: binding(envelope),
    settlement:
      settlement.outcome === "error"
        ? { outcome: settlement.outcome, code: settlement.code as string }
        : { outcome: settlement.outcome },
    disposition: state.disposition,
    ...(state.semanticTerminal ? { semanticOutcome: state.semanticTerminal.outcome } : {}),
    ...(state.candidate ? { issuance: "root" as const } : {}),
    ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
    ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
    ...(effect ? { effect } : {}),
  })
}

function learnerStateJudgmentEffect(settlement: LearningCommand.PhysicalSettlement) {
  if (
    settlement.outcome === "error" ||
    !("learnerStateJudgmentKind" in settlement) ||
    settlement.learnerStateJudgmentKind !== "revision"
  ) {
    return undefined
  }
  const value = settlement as unknown as
    | LearnerStateJudgment.AppliedSettlement
    | LearnerStateJudgment.AlreadyAppliedSettlement
    | LearnerStateJudgment.NoChangeSettlement
  return {
    ...(value.outcome === "already_applied"
      ? { existingOutcome: "applied" as const }
      : value.outcome === "no_change"
        ? { existingOutcome: "no_change" as const }
        : {}),
    ...(value.outcome === "applied" || value.outcome === "already_applied"
      ? { effectID: value.effectID }
      : {}),
    ...(value.judgmentID ? { judgmentID: value.judgmentID } : {}),
    ...(value.revisionID ? { revisionID: value.revisionID } : {}),
    ...(value.version !== undefined ? { version: value.version } : {}),
    ...(value.outcome === "applied" || value.outcome === "already_applied"
      ? { operation: value.operation, disposition: value.disposition }
      : {}),
  }
}

function futureAttentionEffect(settlement: LearningCommand.PhysicalSettlement) {
  if (
    settlement.outcome === "error" ||
    !("futureAttentionKind" in settlement) ||
    settlement.futureAttentionKind !== "change_set"
  ) {
    return undefined
  }
  const value = settlement as unknown as
    | FutureAttention.AppliedSettlement
    | FutureAttention.AlreadyAppliedSettlement
    | FutureAttention.NoChangeSettlement
  return {
    ...(value.outcome === "no_change" ? {} : { effectID: value.effectID }),
    occurrenceID: value.occurrenceID,
    changes: structuredClone(value.changes),
    ...("claim" in value && value.claim
      ? {
          claim: {
            groupID: value.claim.groupID,
            claimStateAtAdmission: value.claim.claimStateAtAdmission,
            currentClaimState: value.claim.claimState,
            ...(value.claim.finalizationReceiptID
              ? { finalizationReceiptID: value.claim.finalizationReceiptID }
              : {}),
          },
        }
      : {}),
  }
}

function learnerResponseEvidenceEffect(settlement: LearningCommand.PhysicalSettlement) {
  if (
    settlement.outcome === "error" ||
    !("evidenceKind" in settlement) ||
    settlement.evidenceKind !== "learner_response_evidence"
  ) {
    return undefined
  }
  const value = settlement as unknown as
    | LearnerResponseEvidence.AppliedSettlement
    | LearnerResponseEvidence.AlreadyAppliedSettlement
  return {
    recordID: value.recordID,
    revisionID: value.revisionID,
    version: value.version,
    subject: structuredClone(value.subject),
    target: structuredClone(value.target),
    operation: value.operation,
    relation: value.relation,
    exposure: value.exposure,
    basis: value.basis,
    disposition: value.disposition,
  }
}

export function learnerGoalV2MaterializedOperation(operation: LearnerGoal.MaterializedOperationV2) {
  return {
    ordinal: operation.ordinal,
    operation: operation.operation,
    result: operation.result,
    ...(operation.before ? { before: goalV2Revision(operation.before) } : {}),
    after: goalV2Revision(operation.after),
    ...(operation.replacementTarget
      ? {
          replacementTarget: {
            type: operation.replacementTarget.type,
            ...(operation.replacementTarget.before
              ? { before: goalV2Revision(operation.replacementTarget.before) }
              : {}),
            after: goalV2Revision(operation.replacementTarget.after),
          },
        }
      : {}),
  }
}

function goalV2Revision(revision: LearnerGoal.VersionedRevisionSnapshot) {
  return {
    schemaVersion: revision.schemaVersion,
    goalID: revision.goalID,
    revisionID: revision.revisionID,
    version: revision.version,
    meaning: {
      outcome: revision.outcome,
      conditions: revision.conditions,
      scope:
        revision.scope.type === "learner_home"
          ? ({ type: "learner_home" } as const)
          : ({ type: "courses", courseIDs: revision.scope.courses.map((course) => course.courseID) } as const),
      target: goalV2Target(revision.target),
      disposition: revision.disposition.type,
    },
  }
}

function goalV2ResultOperation(operation: LearnerGoal.OperationResultV2) {
  return {
    schemaVersion: operation.schemaVersion,
    ordinal: operation.ordinal,
    operation: operation.operation,
    result: operation.result,
    goalID: operation.goalID,
    revisionID: operation.revisionID,
    version: operation.version,
    meaning: {
      outcome: operation.meaning.outcome,
      conditions: operation.meaning.conditions,
      scope: operation.meaning.scope,
      target: goalV2Target(operation.meaning.target),
      disposition: operation.disposition,
    },
    ...(operation.replacementTarget ? { replacementTarget: operation.replacementTarget } : {}),
  }
}

function goalV2Target(target: LearnerGoal.Target | LearnerGoal.TargetValueV2) {
  if (target.type === "absent") return "none"
  if (target.type === "instant") {
    return "resolvedZone" in target
      ? `${new Date(target.instant).toISOString()} (${goalV2Zone(target.resolvedZone)}; UTC${offsetText(target.utcOffsetMinutes)})`
      : `${target.normalized} (UTC${offsetText(target.utcOffsetMinutes)}; historical V1)`
  }
  return "resolvedZone" in target
    ? `${target.date} (${goalV2Zone(target.resolvedZone)})`
    : `${target.date} (${target.timeZone}; historical V1)`
}

function goalV2Zone(zone: LearnerGoal.ResolvedZoneV2) {
  return zone.type === "iana" ? `${zone.name}; ${zone.releaseID}` : `UTC${offsetText(zone.offsetMinutes)}`
}

function offsetText(minutes: number) {
  const sign = minutes < 0 ? "-" : "+"
  const absolute = Math.abs(minutes)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`
}

export function acceptCourseProposal(
  invocation: LearningCommand.AcceptCourseViewRevisionInvocation,
  locator: Course.PresentationLocator,
) {
  return SemanticPresentation.proposal({
    kind: "accept_course_view_revision",
    binding: binding(invocation.envelope),
    courseID: invocation.command.courseID,
    revisionID: invocation.command.revisionID,
    locator,
    expectedCourseVersion: invocation.command.expectedCourseVersion,
    ...(invocation.command.expectedSelectionRevisionID === undefined
      ? {}
      : { expectedSelectionRevisionID: invocation.command.expectedSelectionRevisionID }),
    expectedSelectionVersion: invocation.command.expectedSelectionVersion,
    expectedViewVersion: invocation.command.expectedViewVersion,
    expectedRevisionVersion: invocation.command.expectedRevisionVersion,
  })
}

export function representationProposal(invocation: LearningCommand.RepresentationConvertInvocation) {
  return SemanticPresentation.proposal({
    kind: "representation_convert",
    binding: binding(invocation.envelope),
    effectiveArtifactID: invocation.command.effectiveArtifactID,
    sourceRevisionID: invocation.command.sourceRevisionID,
    producerKind: invocation.producerKind,
  })
}

export function defaultCourseProposal(
  invocation: LearningCommand.SetDefaultCoursePreferenceInvocation,
  confirmation: LearnerNavigation.DefaultConfirmationSnapshot,
) {
  return SemanticPresentation.proposal({
    kind: "default_course_confirmation",
    binding: binding(invocation.envelope, invocation.permissionRequestID),
    headID: confirmation.headID,
    version: confirmation.version,
    fromCourseID: confirmation.fromCourseID,
    fromCourseTitle: confirmation.fromCourseTitle,
    target: confirmation.target,
  })
}

export function defaultCourseCommandProposal(
  invocation: LearningCommand.SetDefaultCoursePreferenceInvocation,
  noChange: boolean,
) {
  return SemanticPresentation.proposal({
    kind: "default_course_command",
    binding: binding(invocation.envelope),
    expectedHeadID: invocation.command.expectedHeadID,
    expectedVersion: invocation.command.expectedVersion,
    target: invocation.command.target,
    noChange,
  })
}

export function routeAnchorProposal(
  invocation: LearningCommand.SetCourseRouteAnchorInvocation,
  noChange: boolean,
  locator?: Course.PresentationLocator,
) {
  return SemanticPresentation.proposal({
    kind: "course_route_anchor",
    binding: binding(invocation.envelope),
    courseID: invocation.command.courseID,
    expectedHeadID: invocation.command.expectedHeadID,
    expectedVersion: invocation.command.expectedVersion,
    target: invocation.command.target,
    ...(locator ? { locator } : {}),
    noChange,
  })
}

export function retainedSteeringProposal(invocation: LearningCommand.RetainedSteeringInvocation) {
  return SemanticPresentation.proposal({
    kind: "retained_learning_steering",
    binding: binding(invocation.envelope),
    ...invocation.command,
  })
}

export function learnerGoalsProposal(
  invocation: LearnerGoal.Invocation,
  prepared: LearnerGoal.ProposalPresentation,
  confirmation?: LearnerGoal.ConfirmationSnapshot,
) {
  if (prepared.authorizationBasis === "agent_action") {
    throw new Error("Historical learner Goal proposal cannot claim current Agent-action provenance")
  }
  return SemanticPresentation.proposal({
    kind: "learner_goals",
    binding: binding(
      invocation.envelope,
      invocation.envelope.authorizationBasis === "learner_acceptance"
        ? (invocation as LearnerGoal.AcceptedInvocation).permissionRequestID
        : undefined,
    ),
    authorizationBasis: prepared.authorizationBasis,
    semanticFingerprint: prepared.semanticFingerprint,
    operations: prepared.operations,
    ...(confirmation
      ? {
          confirmation: {
            schemaVersion: confirmation.schemaVersion,
            permissionRequestID: (invocation as LearnerGoal.AcceptedInvocation).permissionRequestID,
            goalBases: confirmation.goalBases,
            courseBases: confirmation.courseBases,
          },
        }
      : {}),
  })
}

export function settlementResult(
  settlement: LearningCommand.Settlement,
  capability: Capability,
  envelope: BindingInput,
  goalOperations: readonly LearnerGoal.ResultPresentationOperation[] = [],
  owner: ResultOwnerPresentation = {},
) {
  const common = {
    binding: binding(envelope),
    settlement: settlementBasis(settlement),
  }
  if (capability === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    if (settlement.outcome !== "error") requireCoursePresentation(settlement, owner.course)
    return SemanticPresentation.result({
      kind: "accept_course_view_revision_result",
      ...common,
      ...(settlement.outcome === "error"
        ? {}
        : owner.course
          ? {
              courseID: owner.course.effect.courseID,
              revisionID: owner.course.effect.revisionID,
              locator: owner.course.locator,
              previousSelection: courseSelection(owner.course.effect.previousSelection),
              committedSelection: courseSelection(owner.course.effect.committedSelection),
              currentSelection: courseSelection(owner.course.currentSelection),
              relation: owner.course.relation,
            }
          : {}),
    })
  }
  if (capability === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY) {
    return SemanticPresentation.result({
      kind: "representation_convert_result",
      ...common,
      ...(settlement.outcome === "error"
        ? {}
        : "effectiveArtifactID" in settlement
          ? {
              effectiveArtifactID: settlement.effectiveArtifactID,
              sourceRevisionID: settlement.sourceRevisionID,
              representationRevisionID: settlement.representationRevisionID,
              producerKind: settlement.producerKind,
            }
          : {}),
    })
  }
  if (capability === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    return SemanticPresentation.result({
      kind: "default_course_result",
      ...common,
      ...(settlement.outcome === "error"
        ? {}
        : "navigationKind" in settlement &&
            settlement.navigationKind === "default_course_preference" &&
            "current" in settlement
          ? {
              current: defaultCurrent(settlement.current as LearnerNavigation.DefaultProjection),
              ...("relation" in settlement ? { relation: settlement.relation } : {}),
            }
          : {}),
    })
  }
  if (capability === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY) {
    if (settlement.outcome !== "error") requireAnchorPresentation(settlement, owner.anchor)
    return SemanticPresentation.result({
      kind: "course_route_anchor_result",
      ...common,
      ...(settlement.outcome === "error"
        ? {}
        : owner.anchor
          ? {
              ...(owner.anchor.effect
                ? {
                    effect: {
                      courseID: owner.anchor.effect.courseID,
                      version: owner.anchor.effect.version,
                      target: owner.anchor.effect.target ? ("present" as const) : ("absent" as const),
                      ...(owner.anchor.effectLocator ? { locator: owner.anchor.effectLocator } : {}),
                    },
                  }
                : {}),
              current: anchorCurrent(owner.anchor.current, owner.anchor.currentLocator),
              ...(owner.anchor.relation ? { relation: owner.anchor.relation } : {}),
            }
          : {}),
    })
  }
  if (capability === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) {
    if (settlement.outcome !== "error" && !owner.retained) {
      throw new Error("Retained steering settlement is missing its committed owner presentation")
    }
    return SemanticPresentation.result({
      kind: "retained_learning_steering_result",
      ...common,
      ...(settlement.outcome === "error"
        ? {}
        : owner.retained
          ? {
              action: owner.retained.action,
              scope: owner.retained.scope,
              effect: owner.retained.effect,
              ...(owner.retained.previous ? { previous: owner.retained.previous } : {}),
              current: owner.retained.current,
              relation: owner.retained.relation,
            }
          : {}),
    })
  }
  requireGoalSettlementPresentation(settlement, goalOperations)
  const authorizationBasis = "authorizationBasis" in settlement ? settlement.authorizationBasis : undefined
  if (authorizationBasis === "agent_action") {
    throw new Error("Historical learner Goal result cannot claim current Agent-action provenance")
  }
  return SemanticPresentation.result({
    kind: "learner_goals_result",
    ...common,
    ...(authorizationBasis ? { authorizationBasis } : {}),
    operations: goalOperations,
  })
}

function courseSelection(selection: { readonly revisionID?: string; readonly version: number }) {
  return {
    ...(selection.revisionID === undefined ? {} : { revisionID: selection.revisionID }),
    version: selection.version,
  }
}

export function unknownResult(capability: Capability, envelope: BindingInput) {
  return settlementResult(
    {
      outcome: "error",
      code: "outcome_unknown",
      settlementTime: Date.now(),
      settlementOrder: 0,
    },
    capability,
    envelope,
  )
}

export function contentMutationProposal(input: {
  readonly sessionID: string
  readonly messageID: string
  readonly callID: string
  readonly partID: string
  readonly operation: "create" | "modify"
  readonly anchorPath: string
  readonly relativePath: string
}) {
  return SemanticPresentation.proposal({
    kind: "content_mutation",
    binding: {
      sessionID: input.sessionID,
      messageID: input.messageID,
      callID: input.callID,
      partID: input.partID,
    },
    operation: input.operation,
    anchorPath: input.anchorPath,
    relativePath: input.relativePath,
    lifetime: "this physical tool invocation",
    rights: [input.operation],
    warning: "This allows one direct file change only. It does not allow Shell, network, or sibling paths.",
  })
}

export function contentWriteResult(input: {
  readonly sessionID: string
  readonly messageID: string
  readonly callID: string
  readonly partID?: string
  readonly operation: "create" | "modify"
  readonly anchorPath: string
  readonly relativePath: string
  readonly byteLength: number
  readonly authority:
    | Readonly<{ type: "one_shot" }>
    | Readonly<{ type: "mutation_grant"; grantID: string; grantVersion: number }>
}) {
  return SemanticPresentation.result({
    kind: "content_write_result",
    binding: {
      sessionID: input.sessionID,
      messageID: input.messageID,
      callID: input.callID,
      ...(input.partID ? { partID: input.partID } : {}),
    },
    settlement: { outcome: "applied" },
    operation: input.operation,
    anchorPath: input.anchorPath,
    relativePath: input.relativePath,
    byteLength: input.byteLength,
    authority: input.authority,
  })
}

function settlementBasis(settlement: LearningCommand.Settlement) {
  return settlement.outcome === "error"
    ? ({ outcome: settlement.outcome, code: settlement.code } as const)
    : ({ outcome: settlement.outcome } as const)
}

function binding(input: BindingInput, requestID?: string) {
  return {
    sessionID: input.sessionID,
    messageID: input.assistantMessageID,
    callID: input.providerCallID,
    ...(input.partID ? { partID: input.partID } : {}),
    ...(requestID ? { requestID } : {}),
  }
}

function defaultCurrent(current: LearnerNavigation.DefaultProjection) {
  return {
    version: current.version,
    courseID: current.courseID,
    status: current.usability.usable ? ("available" as const) : current.usability.cause,
    ...("title" in current.usability && current.usability.title ? { title: current.usability.title } : {}),
  }
}

function anchorCurrent(current: LearnerNavigation.AnchorProjection, locator?: Course.PresentationLocator) {
  return {
    courseID: current.courseID,
    version: current.version,
    target:
      current.target === null
        ? ("absent" as const)
        : current.usability.usable
          ? ("available" as const)
          : ("stale" as const),
    ...(!current.usability.usable && current.usability.cause !== "absent"
      ? { staleCause: current.usability.cause }
      : {}),
    ...(locator ? { locator } : {}),
  }
}

function requireCoursePresentation(
  settlement: Exclude<LearningCommand.Settlement, LearningCommand.ErrorSettlement>,
  presentation: Course.SelectionAcceptancePresentation | undefined,
) {
  if (
    !presentation ||
    !("effectID" in settlement) ||
    settlement.effectID !== presentation.effect.id ||
    !("courseID" in settlement) ||
    settlement.courseID !== presentation.effect.courseID ||
    !("revisionID" in settlement) ||
    settlement.revisionID !== presentation.effect.revisionID ||
    !("committedSelection" in settlement) ||
    !sameValue(settlement.committedSelection, presentation.effect.committedSelection)
  ) {
    throw new Error("Course settlement is missing its exact committed owner presentation")
  }
}

function requireAnchorPresentation(
  settlement: Exclude<LearningCommand.Settlement, LearningCommand.ErrorSettlement>,
  presentation: LearnerNavigation.AnchorResultPresentation | undefined,
) {
  if (
    !presentation ||
    !("navigationKind" in settlement) ||
    settlement.navigationKind !== "course_route_anchor" ||
    ("effectID" in settlement && (!presentation.effect || presentation.effect.id !== settlement.effectID)) ||
    (!("effectID" in settlement) && presentation.effect)
  ) {
    throw new Error("Course route-anchor settlement is missing its exact committed owner presentation")
  }
}

function requireGoalSettlementPresentation(
  settlement: LearningCommand.Settlement,
  operations: readonly LearnerGoal.ResultPresentationOperation[],
) {
  if (settlement.outcome === "error") {
    if (operations.length !== 0) {
      throw new Error("Failed learner Goal settlements cannot carry committed Goal presentation operations")
    }
    return
  }
  if (!("goalKind" in settlement) || settlement.goalKind !== "learner_goal") {
    throw new Error("Learner Goal presentation received a settlement from another command domain")
  }
  if (
    settlement.operations.length !== operations.length ||
    settlement.operations.some((operation, index) => !goalOperationMatches(operation, operations[index]))
  ) {
    throw new Error("Learner Goal result presentation does not match the committed settlement")
  }
}

function goalOperationMatches(
  settled: LearnerGoal.OperationResult,
  presented: LearnerGoal.ResultPresentationOperation | undefined,
) {
  if (!presented) return false
  if (
    settled.ordinal !== presented.ordinal ||
    settled.operation !== presented.operation ||
    settled.result !== presented.result ||
    settled.goalID !== presented.goalID ||
    settled.revisionID !== presented.revisionID ||
    settled.version !== presented.version ||
    settled.disposition !== presented.meaning.disposition ||
    settled.meaning.outcome !== presented.meaning.outcome ||
    !sameValue(settled.meaning.conditions, presented.meaning.conditions) ||
    !sameValue(settled.meaning.target, presented.meaning.target) ||
    !goalScopeMatches(settled.meaning.scope, presented.meaning.scope)
  ) {
    return false
  }
  const requiresSupersessionTarget =
    settled.operation !== "replace" && settled.disposition === "superseded" && settled.replacementTarget === undefined
  if (requiresSupersessionTarget !== (presented.supersessionTarget !== undefined)) return false
  if (settled.replacementTarget === undefined) return presented.replacementTarget === undefined
  return (
    presented.replacementTarget !== undefined &&
    settled.replacementTarget.type === presented.replacementTarget.type &&
    settled.replacementTarget.goalID === presented.replacementTarget.goalID &&
    settled.replacementTarget.revisionID === presented.replacementTarget.revisionID &&
    settled.replacementTarget.version === presented.replacementTarget.version &&
    presented.supersessionTarget === undefined
  )
}

function goalScopeMatches(
  settled: LearnerGoal.OperationResult["meaning"]["scope"],
  presented: LearnerGoal.ResultPresentationOperation["meaning"]["scope"],
) {
  if (settled.type === "learner_home" || presented.type === "learner_home") {
    return settled.type === presented.type
  }
  return sameValue(
    settled.courseIDs,
    presented.courses.map((course) => course.courseID),
  )
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    )
  }
  if (
    typeof left !== "object" ||
    left === null ||
    Array.isArray(left) ||
    typeof right !== "object" ||
    right === null ||
    Array.isArray(right)
  ) {
    return false
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]))
  )
}
