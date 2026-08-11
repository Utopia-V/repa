export * as SemanticPresentation from "./semantic-presentation"

import { SemanticPresentationV1 } from "@opencode-ai/schema/semantic-presentation-v1"
import { Option, Schema } from "effect"
import { AdvisoryPlanSuggestion } from "./advisory-plan-suggestion"
import { Assignment } from "./assignment"
import { LearningBootstrap } from "./learning-bootstrap"
import { FutureAttention } from "./future-attention"
import { LearnerResponseEvidence } from "./learner-response-evidence"
import { LearnerStateJudgment } from "./learner-state-judgment"
import { PermissionV1 } from "./v1/permission"

export { SemanticPresentationV1 }

export const REQUIRED_METADATA_KEY = "semanticPresentationRequired"
export const PRESENTATION_METADATA_KEY = "semanticPresentationBasis"

const CONTENT_WARNING = "This allows one direct file change only. It does not allow Shell, network, or sibling paths."

const consequentialPermissionCapabilities = new Set([
  "accept_course_view_revision",
  "content_mutation",
  "representation.convert",
  "set_default_course_preference",
  "set_course_route_anchor",
  "update_retained_learning_steering",
  "update_learner_goals",
  "update_learning_course",
  "update_learner_response_evidence",
  "update_future_attention",
  "update_assignment",
  "update_learner_state_judgment",
  "update_advisory_plan_suggestion",
])

const consequentialResultTools = new Set([
  "accept_course_view_revision",
  "content_write",
  "representation.convert",
  "set_default_course_preference",
  "set_course_route_anchor",
  "update_retained_learning_steering",
  "update_learner_goals",
  "update_learning_course",
  "update_learner_response_evidence",
  "update_future_attention",
  "update_assignment",
  "update_learner_state_judgment",
  "update_advisory_plan_suggestion",
])

export type Fact = Readonly<{ label: string; value: string }>
type CourseLocator = Extract<
  SemanticPresentationV1.ProposalBasis,
  { readonly kind: "accept_course_view_revision" }
>["locator"]
type RouteResult = Extract<SemanticPresentationV1.ResultBasis, { readonly kind: "course_route_anchor_result" }>
type RetainedResult = Extract<
  SemanticPresentationV1.ResultBasis,
  { readonly kind: "retained_learning_steering_result" }
>
type DefaultV2AuthorizationBasis = Extract<
  SemanticPresentationV1.ProposalBasis,
  { readonly kind: "default_course_v2_capability" }
>["authorization"]
type DefaultV3AgentActionBasis = Extract<
  SemanticPresentationV1.ProposalBasis,
  { readonly kind: "default_course_v3_capability" }
>["agentAction"]
type DefaultV2Endpoint = DefaultV2AuthorizationBasis["from"]
type DefaultV2Result = Extract<SemanticPresentationV1.ResultBasis, { readonly kind: "default_course_v2_result" }>
type DefaultV3Result = Extract<SemanticPresentationV1.ResultBasis, { readonly kind: "default_course_v3_result" }>
type DefaultAcknowledgement =
  | NonNullable<DefaultV2Result["acknowledgement"]>
  | NonNullable<DefaultV3Result["acknowledgement"]>
type DefaultEndpoint = DefaultV2Endpoint | DefaultAcknowledgement["from"]
type LearningBootstrapResult = Extract<
  SemanticPresentationV1.ResultBasis,
  { readonly kind: "learning_bootstrap_result" }
>
type LearningBootstrapAcknowledgement = NonNullable<LearningBootstrapResult["acknowledgement"]>
type LearningBootstrapChild = LearningBootstrapAcknowledgement["children"][number]
type LearningBootstrapMaterialTarget = NonNullable<LearningBootstrapChild["materialTarget"]>
type LearningBootstrapScope = Extract<
  SemanticPresentationV1.ProposalBasis,
  { readonly kind: "learning_bootstrap_capability" }
>["scope"]
type LearnerResponseEvidenceScope = Extract<
  SemanticPresentationV1.ProposalBasis,
  { readonly kind: "learner_response_evidence_capability" }
>["scope"]
type FutureAttentionScope = Extract<
  SemanticPresentationV1.ProposalBasis,
  { readonly kind: "future_attention_capability" }
>["scope"]
type AssignmentScope = Extract<
  SemanticPresentationV1.ProposalBasis,
  { readonly kind: "assignment_capability" }
>["scope"]
type LearnerStateJudgmentScope = Extract<
  SemanticPresentationV1.ProposalBasis,
  { readonly kind: "learner_state_judgment_capability" }
>["scope"]
type AdvisoryPlanSuggestionScope = Extract<
  SemanticPresentationV1.ProposalBasis,
  { readonly kind: "advisory_plan_suggestion_capability" }
>["scope"]

export type ProposalProjection = Readonly<{
  phase: "proposal"
  capability: string
  title: string
  summary: string
  facts: readonly Fact[]
  approval: "once_only" | "policy"
}>

export type ResultProjection = Readonly<{
  phase: "result"
  capability: string
  title: string
  summary: string
  facts: readonly Fact[]
  outcome: "committed" | "already_applied" | "no_effect" | "failed" | "outcome_unknown"
  durablySettled: boolean
  code?: string
}>

export type Read<A> =
  | { readonly type: "absent" }
  | { readonly type: "invalid" }
  | { readonly type: "valid"; readonly value: A }

type PermissionRequest = Readonly<{
  id: string
  sessionID: string
  permission: string
  patterns: readonly string[]
  always: readonly string[]
  metadata: unknown
  tool?: Readonly<{ messageID: string; callID: string }>
}>

type CompletedToolPart = Readonly<{
  id: string
  sessionID: string
  messageID: string
  callID: string
  tool: string
  state: Readonly<{
    status: string
    title?: string
    metadata?: unknown
  }>
}>

type ProposalExpected = Readonly<{
  capability: string
  patterns: readonly string[]
  always: readonly string[]
  promptRequired: boolean
  approval: "once_only" | "policy"
  metadata: Readonly<Record<string, unknown>>
}>

const decodeProposal = Schema.decodeUnknownOption(SemanticPresentationV1.Proposal)
const decodeResult = Schema.decodeUnknownOption(SemanticPresentationV1.Result)

export function proposal(basis: SemanticPresentationV1.ProposalBasis): SemanticPresentationV1.Proposal {
  return { version: 1, phase: "proposal", basis }
}

export function result(basis: SemanticPresentationV1.ResultBasis): SemanticPresentationV1.Result {
  return { version: 1, phase: "result", basis }
}

export function metadata(value: SemanticPresentationV1.Presentation) {
  return {
    [REQUIRED_METADATA_KEY]: true,
    [PRESENTATION_METADATA_KEY]: value,
  } as const
}

export function readProposal(
  request: PermissionRequest,
  required = requiresPermission(request.permission),
): Read<ProposalProjection> {
  const decoded = readPhase(request.metadata, decodeProposal, required)
  if (decoded.type !== "valid") return decoded
  const expected = expectedProposal(decoded.value)
  if (!expected) return { type: "invalid" }
  const exactReply =
    typeof request.metadata === "object" &&
    request.metadata !== null &&
    !Array.isArray(request.metadata) &&
    (request.metadata as Record<string, unknown>)[PermissionV1.EXACT_REPLY_METADATA_KEY] === true
  if (
    request.permission !== expected.capability ||
    !same(request.patterns, expected.patterns) ||
    !same(request.always, expected.always) ||
    // Permission owns this carrier constraint; it does not change the proposal's semantic authority.
    !same(request.metadata, {
      ...expected.metadata,
      ...(exactReply ? { [PermissionV1.EXACT_REPLY_METADATA_KEY]: true } : {}),
    }) ||
    !bindingMatchesRequest(decoded.value.basis.binding, request)
  ) {
    return { type: "invalid" }
  }
  return { type: "valid", value: projectProposal(decoded.value.basis, expected.approval) }
}

export function readResult(part: CompletedToolPart, required = requiresResult(part.tool)): Read<ResultProjection> {
  const metadata = part.state.metadata
  const decoded = readPhase(metadata, decodeResult, required)
  if (decoded.type !== "valid") return decoded
  const projection = projectResult(decoded.value.basis)
  if (!projection) return { type: "invalid" }
  if (
    part.state.status !== "completed" ||
    part.tool !== projection.capability ||
    part.state.title !== projection.title ||
    !bindingMatchesPart(decoded.value.basis.binding, part) ||
    !same(metadata, expectedResultMetadata(decoded.value, projection))
  ) {
    return { type: "invalid" }
  }
  return { type: "valid", value: projection }
}

export function requiresPermission(capability: string) {
  return consequentialPermissionCapabilities.has(capability)
}

export function requiresResult(tool: string) {
  return consequentialResultTools.has(tool)
}

export function learningBootstrapPermissionConstraint(scope: LearningBootstrapScope) {
  const oneOperationPath = scope.command.materials
    .flatMap((material) => {
      if (material.type === "local" && material.authority.type === "one_operation") return [material.path]
      if (material.type === "artifact" && material.read?.authority.type === "one_operation") return [material.read.path]
      return []
    })
    .at(0)
  return oneOperationPath
    ? ({
        oneOperationPath,
        always: [] as const,
        promptRequired: true as const,
        approval: "once_only" as const,
      } as const)
    : ({
        always: [LearningBootstrap.PERMISSION_PATTERN] as const,
        promptRequired: false as const,
        approval: "policy" as const,
      } as const)
}

export function projectResultBasis(basis: SemanticPresentationV1.ResultBasis) {
  return projectResult(basis)
}

function readPhase<A>(value: unknown, decode: (value: unknown) => Option.Option<A>, required: boolean): Read<A> {
  if (!isRecord(value)) return required ? { type: "invalid" } : { type: "absent" }
  const marked = value[REQUIRED_METADATA_KEY] === true
  const supplied = Object.hasOwn(value, PRESENTATION_METADATA_KEY)
  if (!marked && !supplied) return required ? { type: "invalid" } : { type: "absent" }
  if (!marked) return { type: "invalid" }
  const decoded = decode(value[PRESENTATION_METADATA_KEY])
  if (Option.isNone(decoded)) return { type: "invalid" }
  return { type: "valid", value: decoded.value }
}

function expectedProposal(value: SemanticPresentationV1.Proposal): ProposalExpected | undefined {
  const basis = value.basis
  if (basis.kind === "accept_course_view_revision") {
    if (
      basis.locator.course.id !== basis.courseID ||
      basis.locator.revision.id !== basis.revisionID ||
      basis.locator.item
    ) {
      return undefined
    }
    return expected(value, {
      capability: "accept_course_view_revision",
      patterns: [basis.courseID],
      always: [basis.courseID],
      promptRequired: false,
      approval: "policy",
      domain: { courseID: basis.courseID, revisionID: basis.revisionID },
    })
  }
  if (basis.kind === "representation_convert") {
    return expected(value, {
      capability: "representation.convert",
      patterns: [basis.effectiveArtifactID],
      always: [basis.effectiveArtifactID],
      promptRequired: false,
      approval: "policy",
      domain: {
        effectiveArtifactID: basis.effectiveArtifactID,
        sourceRevisionID: basis.sourceRevisionID,
        producerKind: basis.producerKind,
      },
    })
  }
  if (basis.kind === "content_mutation") {
    const pattern = `${basis.operation}:${basis.anchorPath}\\${basis.relativePath}`
    if (
      basis.binding.requestID ||
      basis.binding.partID === undefined ||
      basis.warning !== CONTENT_WARNING ||
      !same(basis.rights, [basis.operation])
    ) {
      return undefined
    }
    return expected(value, {
      capability: "content_mutation",
      patterns: [pattern],
      always: [],
      promptRequired: true,
      approval: "once_only",
      domain: {
        onceOnly: true,
        operation: basis.operation,
        anchorPath: basis.anchorPath,
        relativePath: basis.relativePath,
        lifetime: basis.lifetime,
        rights: basis.rights,
        warning: basis.warning,
      },
    })
  }
  if (basis.kind === "default_course_confirmation") {
    if (!basis.binding.requestID) return undefined
    const confirmation = {
      permissionRequestID: basis.binding.requestID,
      headID: basis.headID,
      version: basis.version,
      fromCourseID: basis.fromCourseID,
      fromCourseTitle: basis.fromCourseTitle,
      target: basis.target,
    }
    return expected(value, {
      capability: "set_default_course_preference",
      patterns: [basis.target?.courseID ?? "clear"],
      always: [],
      promptRequired: true,
      approval: "once_only",
      domain: { onceOnly: true, navigationKind: "default_course_preference", confirmation },
    })
  }
  if (basis.kind === "default_course_command") {
    const command = {
      kind: "default_course_preference",
      expectedHeadID: basis.expectedHeadID,
      expectedVersion: basis.expectedVersion,
      target: basis.target,
    }
    return expected(value, {
      capability: "set_default_course_preference",
      patterns: [basis.target?.courseID ?? "clear"],
      always: [basis.target?.courseID ?? "clear"],
      promptRequired: false,
      approval: "policy",
      domain: {
        navigationKind: "default_course_preference",
        noChange: basis.noChange,
        command,
      },
      binding: command,
    })
  }
  if (basis.kind === "default_course_v2_capability") {
    const authorization = basis.authorization
    if (
      authorization.kind !== authorization.source.kind ||
      authorization.command.kind !== "default_course_preference" ||
      !defaultAuthorizationTargetMatches(authorization)
    ) {
      return undefined
    }
    const pattern = authorization.to.kind === "course" ? authorization.to.locator.courseID : "clear"
    return expected(value, {
      capability: "set_default_course_preference",
      patterns: [pattern],
      always: [pattern],
      promptRequired: false,
      approval: "policy",
      domain: {
        navigationKind: "default_course_preference",
        authorization,
      },
    })
  }
  if (basis.kind === "default_course_v3_capability") {
    const agentAction = basis.agentAction
    if (!validDefaultV3AgentAction(agentAction, basis.binding)) return undefined
    const pattern = agentAction.to.kind === "course" ? agentAction.to.locator.courseID : "clear"
    return expected(value, {
      capability: "set_default_course_preference",
      patterns: [pattern],
      always: [pattern],
      promptRequired: false,
      approval: "policy",
      domain: {
        navigationKind: "default_course_preference",
        agentAction,
      },
    })
  }
  if (basis.kind === "learner_goals_v2_capability") {
    if (basis.operations.length === 0) return undefined
    return expected(value, {
      capability: "update_learner_goals",
      patterns: ["learner_home"],
      always: ["learner_home"],
      promptRequired: false,
      approval: "policy",
      domain: {
        goalKind: "learner_goal",
        commandFingerprint: basis.commandFingerprint,
        issuance: basis.issuance,
        operations: basis.operations,
      },
    })
  }
  if (basis.kind === "learning_bootstrap_capability") {
    const command = canonicalLearningBootstrapCommand(basis.scope)
    if (
      !command ||
      !same(command, basis.scope.command) ||
      LearningBootstrap.commandFingerprint(command) !== basis.commandFingerprint
    ) {
      return undefined
    }
    const constraint = learningBootstrapPermissionConstraint(basis.scope)
    return expected(value, {
      capability: "update_learning_course",
      patterns: ["learning_course"],
      always: constraint.always,
      promptRequired: constraint.promptRequired,
      approval: constraint.approval,
      domain: {
        bootstrapKind: "learning_bootstrap",
        commandFingerprint: basis.commandFingerprint,
        issuance: basis.issuance,
        scope: basis.scope,
      },
    })
  }
  if (basis.kind === "learner_response_evidence_capability") {
    const command = canonicalLearnerResponseEvidenceCommand(basis.scope)
    if (
      !command ||
      !same(command, basis.scope.command) ||
      !same(learnerResponseEvidenceScope(command, basis.scope.subject, basis.scope.target), basis.scope) ||
      LearnerResponseEvidence.commandFingerprint(command) !== basis.commandFingerprint
    ) {
      return undefined
    }
    return expected(value, {
      capability: "update_learner_response_evidence",
      patterns: [LearnerResponseEvidence.PERMISSION_PATTERN],
      always: [LearnerResponseEvidence.PERMISSION_PATTERN],
      promptRequired: false,
      approval: "policy",
      domain: {
        evidenceKind: "learner_response_evidence",
        commandFingerprint: basis.commandFingerprint,
        issuance: basis.issuance,
        scope: basis.scope,
      },
    })
  }
  if (basis.kind === "future_attention_capability") {
    const command = canonicalFutureAttentionCommand(basis.scope)
    if (
      !command ||
      !same(command, basis.scope.command) ||
      !same(futureAttentionScope(command), basis.scope) ||
      FutureAttention.commandFingerprint(command) !== basis.commandFingerprint
    ) {
      return undefined
    }
    return expected(value, {
      capability: FutureAttention.UPDATE_CAPABILITY,
      patterns: [FutureAttention.PERMISSION_PATTERN],
      always: [FutureAttention.PERMISSION_PATTERN],
      promptRequired: false,
      approval: "policy",
      domain: {
        futureAttentionKind: "change_set",
        commandFingerprint: basis.commandFingerprint,
        issuance: basis.issuance,
        scope: basis.scope,
      },
    })
  }
  if (basis.kind === "assignment_capability") {
    const command = canonicalAssignmentCommand(basis.scope)
    if (
      !command ||
      !same(command, basis.scope.command) ||
      !validAssignmentSourceBasis(command, basis.scope.sourceBasis) ||
      !validAssignmentMaterialized(command, basis.scope.materialized) ||
      !same(assignmentScopeValue(command, basis.scope.sourceBasis, basis.scope.materialized), basis.scope) ||
      Assignment.commandFingerprint(command) !== basis.commandFingerprint
    ) {
      return undefined
    }
    return expected(value, {
      capability: Assignment.UPDATE_CAPABILITY,
      patterns: [Assignment.PERMISSION_PATTERN],
      always: [Assignment.PERMISSION_PATTERN],
      promptRequired: false,
      approval: "policy",
      domain: {
        assignmentKind: "change_set",
        commandFingerprint: basis.commandFingerprint,
        issuance: basis.issuance,
        scope: basis.scope,
      },
    })
  }
  if (basis.kind === "learner_state_judgment_capability") {
    const command = canonicalLearnerStateJudgmentCommand(basis.scope)
    if (
      !command ||
      !same(command, basis.scope.command) ||
      !validLearnerStateJudgmentScope(command, basis.scope) ||
      LearnerStateJudgment.commandFingerprint(command) !== basis.commandFingerprint
    ) {
      return undefined
    }
    return expected(value, {
      capability: LearnerStateJudgment.UPDATE_CAPABILITY,
      patterns: [LearnerStateJudgment.PERMISSION_PATTERN],
      always: [LearnerStateJudgment.PERMISSION_PATTERN],
      promptRequired: false,
      approval: "policy",
      domain: {
        learnerStateJudgmentKind: "revision",
        commandFingerprint: basis.commandFingerprint,
        issuance: basis.issuance,
        scope: basis.scope,
      },
    })
  }
  if (basis.kind === "advisory_plan_suggestion_capability") {
    const command = canonicalAdvisoryPlanSuggestionCommand(basis.scope)
    if (
      !command ||
      !same(command, basis.scope.command) ||
      !validAdvisoryPlanSuggestionScope(command, basis.scope) ||
      AdvisoryPlanSuggestion.commandFingerprint(command) !== basis.commandFingerprint
    ) {
      return undefined
    }
    return expected(value, {
      capability: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
      patterns: [AdvisoryPlanSuggestion.PERMISSION_PATTERN],
      always: [AdvisoryPlanSuggestion.PERMISSION_PATTERN],
      promptRequired: false,
      approval: "policy",
      domain: {
        advisoryPlanSuggestionKind: "change_set",
        commandFingerprint: basis.commandFingerprint,
        issuance: basis.issuance,
        scope: basis.scope,
      },
    })
  }
  if (basis.kind === "course_route_anchor") {
    if (
      (basis.target === null && basis.locator !== undefined) ||
      (basis.target !== null &&
        (!basis.locator ||
          basis.locator.course.id !== basis.courseID ||
          basis.locator.view.id !== basis.target.viewID ||
          basis.locator.revision.id !== basis.target.revisionID ||
          basis.locator.item?.id !== basis.target.itemID))
    ) {
      return undefined
    }
    const command = {
      kind: "course_route_anchor",
      courseID: basis.courseID,
      expectedHeadID: basis.expectedHeadID,
      expectedVersion: basis.expectedVersion,
      target: basis.target,
    }
    return expected(value, {
      capability: "set_course_route_anchor",
      patterns: [basis.courseID],
      always: [basis.courseID],
      promptRequired: false,
      approval: "policy",
      domain: { navigationKind: "course_route_anchor", noChange: basis.noChange, command },
      binding: command,
    })
  }
  if (basis.kind === "retained_learning_steering") {
    const command = retainedCommand(basis)
    if (!command) return undefined
    return expected(value, {
      capability: "update_retained_learning_steering",
      patterns: ["learning_wide"],
      always: ["learning_wide"],
      promptRequired: false,
      approval: "policy",
      domain: { action: basis.action, scope: "learning_wide", command },
      binding: command,
    })
  }
  const command = goalCommand(basis.operations)
  if (!command) return undefined
  if (basis.authorizationBasis === "learner_request") {
    if (basis.confirmation || basis.binding.requestID) return undefined
    return expected(value, {
      capability: "update_learner_goals",
      patterns: ["learner_home"],
      always: ["learner_home"],
      promptRequired: false,
      approval: "policy",
      domain: { authorizationBasis: basis.authorizationBasis, command },
    })
  }
  if (!basis.confirmation || !basis.binding.requestID) return undefined
  if (basis.confirmation.permissionRequestID !== basis.binding.requestID) return undefined
  const confirmation = {
    schemaVersion: basis.confirmation.schemaVersion,
    authorizationBasis: basis.authorizationBasis,
    semanticFingerprint: basis.semanticFingerprint,
    command,
    goalBases: basis.confirmation.goalBases,
    courseBases: basis.confirmation.courseBases,
  }
  return expected(value, {
    capability: "update_learner_goals",
    patterns: ["learner_home"],
    always: [],
    promptRequired: true,
    approval: "once_only",
    domain: {
      onceOnly: true,
      authorizationBasis: basis.authorizationBasis,
      confirmation,
    },
  })
}

function canonicalLearningBootstrapCommand(scope: LearningBootstrapScope) {
  try {
    return LearningBootstrap.canonicalizeCommand({
      course: scope.command.course,
      ...(scope.command.route ? { route: scope.command.route } : {}),
      selection: scope.command.selection,
      materials: scope.command.materials,
      maps: scope.command.maps,
      alignments: scope.command.alignments,
      anchor: scope.command.anchor,
    } as unknown as LearningBootstrap.Command)
  } catch {
    return undefined
  }
}

function canonicalLearnerResponseEvidenceCommand(scope: LearnerResponseEvidenceScope) {
  try {
    const command = scope.command
    return LearnerResponseEvidence.canonicalizeCommand(
      (command.operation === "create"
        ? {
            operation: command.operation,
            relation: command.relation,
            exposure: command.exposure,
            conditionAssistantMessageID: command.conditionAssistantMessageID,
            target: command.target,
            alignmentID: command.alignmentID,
          }
        : command.operation === "retract"
          ? {
              operation: command.operation,
              recordID: command.recordID as LearnerResponseEvidence.RecordID,
              expectedVersion: command.expectedVersion,
            }
          : {
              operation: command.operation,
              recordID: command.recordID as LearnerResponseEvidence.RecordID,
              expectedVersion: command.expectedVersion,
              relation: command.relation,
              exposure: command.exposure,
            }) as unknown as LearnerResponseEvidence.Command,
    )
  } catch {
    return undefined
  }
}

function canonicalFutureAttentionCommand(scope: FutureAttentionScope) {
  try {
    if (
      !isRecord(scope.command) ||
      scope.command.schemaVersion !== 1 ||
      !Array.isArray(scope.command.operations) ||
      Object.keys(scope.command).sort().join(",") !== "operations,schemaVersion"
    ) {
      return undefined
    }
    const command = FutureAttention.canonicalizeCommand({
      operations: scope.command.operations as FutureAttention.Operation[],
    })
    return same(command, scope.command) ? command : undefined
  } catch {
    return undefined
  }
}

export function futureAttentionScope(command: FutureAttention.CanonicalChangeSet) {
  const sourceRelations = [
    ...command.operations.flatMap((operation) =>
      operation.type === "create"
        ? [operation.concern.source.type]
        : operation.type === "replace"
          ? [
              operation.mutation.type,
              ...(operation.successorSource.type === "rebind_current_source"
                ? [operation.successorSource.source.type]
                : []),
            ]
          : operation.type === "dismiss" || operation.type === "reopen"
            ? [operation.mutation.type]
            : [],
    ),
  ].filter((value, index, values) => values.indexOf(value) === index)
  return {
    command: structuredClone(command),
    operationCount: command.operations.length,
    completionClaimCount: command.operations.filter(
      (operation) =>
        (operation.type === "serve" && operation.service.source.type === "current_assistant_when_complete") ||
        (operation.type === "replace" &&
          operation.successorDisposition.type === "serve_current_assistant_when_complete"),
    ).length,
    sourceRelations,
    nonImplications: ["task", "reminder", "priority", "mastery", "required_next_action"],
  }
}

function canonicalAssignmentCommand(scope: AssignmentScope) {
  try {
    if (
      !isRecord(scope.command) ||
      scope.command.schemaVersion !== 1 ||
      !Array.isArray(scope.command.intents) ||
      Object.keys(scope.command).sort().join(",") !== "cause,intents,schemaVersion"
    ) {
      return undefined
    }
    const command = Assignment.canonicalizeCommand({
      cause: scope.command.cause as Assignment.CanonicalChangeSet["cause"],
      intents: scope.command.intents as Assignment.CanonicalChangeSet["intents"],
    })
    return same(command, scope.command) ? command : undefined
  } catch {
    return undefined
  }
}

function canonicalLearnerStateJudgmentCommand(scope: LearnerStateJudgmentScope) {
  try {
    const value = scope.command as LearnerStateJudgment.CanonicalCommand
    const command = LearnerStateJudgment.canonicalizeCommand(
      value.operation === "create"
        ? { operation: value.operation, cause: value.cause, snapshot: value.snapshot }
        : value.operation === "retire"
          ? {
              operation: value.operation,
              judgmentID: value.judgmentID,
              expectedHead: value.expectedHead,
              cause: value.cause,
              rationale: value.rationale,
            }
          : value.operation === "restore" && value.snapshot === undefined
            ? {
                operation: value.operation,
                judgmentID: value.judgmentID,
                expectedHead: value.expectedHead,
                cause: value.cause,
                rationale: value.rationale,
              }
            : {
                operation: value.operation,
                judgmentID: value.judgmentID,
                expectedHead: value.expectedHead,
                cause: value.cause,
                snapshot: value.snapshot!,
                rationale: value.rationale,
              },
    )
    return same(command, scope.command) ? command : undefined
  } catch {
    return undefined
  }
}

export function learnerStateJudgmentScope(candidate: LearnerStateJudgment.Candidate) {
  const snapshot = candidate.materialized.snapshot
  return {
    command: structuredClone(candidate.canonicalCommand),
    materialized: {
      outcome: candidate.materialized.outcome,
      judgmentID: candidate.materialized.judgmentID,
      revisionID: candidate.materialized.revisionID,
      effectID: candidate.materialized.effectID,
      ...(candidate.materialized.predecessorRevisionID
        ? { previousRevisionID: candidate.materialized.predecessorRevisionID }
        : {}),
      version: candidate.materialized.version,
      operation: candidate.materialized.operation,
      disposition: candidate.materialized.disposition,
    },
    materializedSnapshot: structuredClone(snapshot),
    authorAndCause: structuredClone(candidate.materialized.authorAndCause),
    causeType: candidate.canonicalCommand.cause.type,
    subjectLabel: snapshot.subject.label,
    judgmentBody: snapshot.judgmentBody,
    ...(snapshot.uncertaintyAndLimits ? { uncertaintyAndLimits: snapshot.uncertaintyAndLimits } : {}),
    scopeType: snapshot.subject.scope.type,
    anchorKinds:
      snapshot.subject.scope.type === "learner_home"
        ? []
        : [...new Set(snapshot.subject.scope.anchors.map((binding) => binding.ref.type))].toSorted(),
    anchorRefs:
      snapshot.subject.scope.type === "learner_home"
        ? []
        : snapshot.subject.scope.anchors.map((binding) => structuredClone(binding.ref)),
    basisRefCount: snapshot.exactBasis.length,
    basisRefs: snapshot.exactBasis.map((binding) => structuredClone(binding.ref)),
    basisScope: "whole_judgment" as const,
    hasUncertaintyOrLimits: snapshot.uncertaintyAndLimits !== undefined,
    nonImplications: [
      "fallible_judgment_not_mastery_certification",
      "basis_set_supports_whole_revision_not_individual_clauses",
      "silence_age_assignment_completion_or_plan_wording_implies_no_state_change",
      "permission_allows_storage_but_does_not_certify_the_judgment",
    ],
  }
}

function validLearnerStateJudgmentScope(
  command: LearnerStateJudgment.CanonicalCommand,
  scope: LearnerStateJudgmentScope,
) {
  if (
    !isRecord(scope.materializedSnapshot) ||
    !isRecord(scope.authorAndCause) ||
    !isRecord(scope.materializedSnapshot.subject) ||
    !isRecord(scope.materializedSnapshot.subject.scope) ||
    !Array.isArray(scope.materializedSnapshot.exactBasis) ||
    scope.materialized.operation !== command.operation ||
    scope.causeType !== command.cause.type ||
    scope.authorAndCause.type !== command.cause.type ||
    scope.materializedSnapshot.subject.label !== scope.subjectLabel ||
    scope.materializedSnapshot.judgmentBody !== scope.judgmentBody ||
    scope.materializedSnapshot.basisScope !== "whole_judgment" ||
    scope.materializedSnapshot.subject.scope.type !== scope.scopeType ||
    scope.materializedSnapshot.exactBasis.length !== scope.basisRefCount ||
    scope.basisRefs.length !== scope.basisRefCount ||
    scope.hasUncertaintyOrLimits !== (scope.uncertaintyAndLimits !== undefined) ||
    scope.materializedSnapshot.uncertaintyAndLimits !== scope.uncertaintyAndLimits ||
    !/^lsj_[0-9A-Za-z]{26}$/.test(scope.materialized.judgmentID) ||
    !/^lsr_[0-9A-Za-z]{26}$/.test(scope.materialized.revisionID) ||
    !/^lse_[0-9A-Za-z]{26}$/.test(scope.materialized.effectID)
  ) {
    return false
  }
  const anchors =
    scope.scopeType === "anchored" && Array.isArray(scope.materializedSnapshot.subject.scope.anchors)
      ? scope.materializedSnapshot.subject.scope.anchors
      : []
  if (
    (scope.scopeType === "learner_home" && (scope.anchorRefs.length !== 0 || scope.anchorKinds.length !== 0)) ||
    (scope.scopeType === "anchored" && scope.anchorRefs.length === 0) ||
    anchors.length !== scope.anchorRefs.length ||
    !anchors.every(
      (binding, index) => isRecord(binding) && isRecord(binding.ref) && same(binding.ref, scope.anchorRefs[index]),
    ) ||
    !scope.materializedSnapshot.exactBasis.every(
      (binding, index) => isRecord(binding) && isRecord(binding.ref) && same(binding.ref, scope.basisRefs[index]),
    ) ||
    !same(
      scope.anchorKinds,
      [...new Set(scope.anchorRefs.flatMap((ref) => (isRecord(ref) && typeof ref.type === "string" ? [ref.type] : [])))].toSorted(),
    ) ||
    !same(scope.nonImplications, [
      "fallible_judgment_not_mastery_certification",
      "basis_set_supports_whole_revision_not_individual_clauses",
      "silence_age_assignment_completion_or_plan_wording_implies_no_state_change",
      "permission_allows_storage_but_does_not_certify_the_judgment",
    ])
  ) {
    return false
  }
  if (command.operation === "create") {
    if (
      scope.materialized.version !== 1 ||
      scope.materialized.previousRevisionID !== undefined ||
      scope.materialized.disposition !== "active"
    ) {
      return false
    }
  } else if (
    scope.materialized.judgmentID !== command.judgmentID ||
    scope.materialized.previousRevisionID !== command.expectedHead.revisionID ||
    scope.materialized.version !== command.expectedHead.version + 1 ||
    (command.operation === "retire" && scope.materialized.disposition !== "retired") ||
    (command.operation === "restore" && scope.materialized.disposition !== "active")
  ) {
    return false
  }
  if ("snapshot" in command && command.snapshot) {
    return (
      command.snapshot.subject.label === scope.subjectLabel &&
      command.snapshot.judgmentBody === scope.judgmentBody &&
      command.snapshot.uncertaintyAndLimits === scope.uncertaintyAndLimits &&
      same(
        command.snapshot.subject.scope.type === "learner_home" ? [] : command.snapshot.subject.scope.anchors,
        scope.anchorRefs,
      ) &&
      same(command.snapshot.exactBasisRefs, scope.basisRefs)
    )
  }
  return true
}

function canonicalAdvisoryPlanSuggestionCommand(scope: AdvisoryPlanSuggestionScope) {
  try {
    const value = scope.command as AdvisoryPlanSuggestion.CanonicalCommand
    const command = AdvisoryPlanSuggestion.canonicalizeCommand({ cause: value.cause, intents: value.intents })
    return same(command, scope.command) ? command : undefined
  } catch {
    return undefined
  }
}

const advisoryPlanSuggestionNonImplications = [
  "advice_not_schedule_commitment_or_approved_plan",
  "permission_allows_storage_but_is_not_pedagogical_agreement",
  "retire_or_restore_implies_no_adherence_rejection_learning_completion_or_producer_lifecycle_change",
  "clock_silence_and_absence_imply_no_following_progress_or_mastery",
] as const

export function advisoryPlanSuggestionScope(candidate: AdvisoryPlanSuggestion.Candidate) {
  const command = candidate.canonicalCommand
  return {
    command: structuredClone(command),
    materialized: candidate.materialized.map((item) => ({
      outcome: item.outcome,
      suggestionID: item.suggestionID,
      revisionID: item.revisionID,
      effectID: item.effectID,
      ...(item.predecessorRevisionID ? { previousRevisionID: item.predecessorRevisionID } : {}),
      version: item.version,
      operation: item.operation,
      operationOrdinal: item.operationOrdinal,
      ...(item.createOrdinal === undefined ? {} : { createOrdinal: item.createOrdinal }),
      disposition: item.disposition,
      ...(item.alternativeToRevision ? { alternativeToRevision: item.alternativeToRevision } : {}),
      materializedSnapshot: structuredClone(item.snapshot),
      learnerVisibleScope: item.snapshot.learnerVisibleScope,
      retrievalScope: structuredClone(item.snapshot.retrievalScope),
      purpose: item.snapshot.purpose,
      directorySummary: item.snapshot.directorySummary,
      body: item.snapshot.body,
      exactBasisRefs: item.snapshot.exactBasis.map((binding) => structuredClone(binding.ref)),
      exactBasisBindings: item.snapshot.exactBasis.map((binding) => structuredClone(binding)),
      ...(item.snapshot.assumptionsAndUncertainty
        ? { assumptionsAndUncertainty: item.snapshot.assumptionsAndUncertainty }
        : {}),
      authorAndCause: structuredClone(item.authorAndCause),
    })),
    operationCount: command.intents.length,
    causeType: command.cause.type,
    targetedSuggestionIDs: command.intents.flatMap((intent) =>
      "suggestionID" in intent ? [intent.suggestionID] : [],
    ),
    expectedHeads: command.intents.flatMap((intent) =>
      "suggestionID" in intent
        ? [
            {
              suggestionID: intent.suggestionID,
              revisionID: intent.expectedHead.revisionID,
              version: intent.expectedHead.version,
              ownerCutFingerprint: intent.expectedHead.ownerCutFingerprint,
            },
          ]
        : [],
    ),
    alternativeTargets: command.intents.flatMap((intent) =>
      intent.operation === "alternative" ? [structuredClone(intent.alternativeToRevision)] : [],
    ),
    nonImplications: [...advisoryPlanSuggestionNonImplications],
  }
}

function validAdvisoryPlanSuggestionScope(
  command: AdvisoryPlanSuggestion.CanonicalCommand,
  scope: AdvisoryPlanSuggestionScope,
) {
  const targetedSuggestionIDs = command.intents.flatMap((intent) =>
    "suggestionID" in intent ? [intent.suggestionID] : [],
  )
  const expectedHeads = command.intents.flatMap((intent) =>
    "suggestionID" in intent
      ? [
          {
            suggestionID: intent.suggestionID,
            revisionID: intent.expectedHead.revisionID,
            version: intent.expectedHead.version,
            ownerCutFingerprint: intent.expectedHead.ownerCutFingerprint,
          },
        ]
      : [],
  )
  const alternativeTargets = command.intents.flatMap((intent) =>
    intent.operation === "alternative" ? [intent.alternativeToRevision] : [],
  )
  if (
    scope.operationCount !== command.intents.length ||
    scope.materialized.length !== command.intents.length ||
    scope.causeType !== command.cause.type ||
    !same(scope.targetedSuggestionIDs, targetedSuggestionIDs) ||
    !same(scope.expectedHeads, expectedHeads) ||
    !same(scope.alternativeTargets, alternativeTargets) ||
    !same(scope.nonImplications, advisoryPlanSuggestionNonImplications) ||
    new Set(scope.materialized.map((item) => item.effectID)).size !== 1
  ) {
    return false
  }
  return scope.materialized.every((item, index) => {
    const intent = command.intents[index]
    if (
      !intent ||
      item.operation !== intent.operation ||
      item.operationOrdinal !== intent.operationOrdinal ||
      !isRecord(item.materializedSnapshot) ||
      !/^aps_[0-9A-Za-z]{26}$/.test(item.suggestionID) ||
      !/^apr_[0-9A-Za-z]{26}$/.test(item.revisionID) ||
      !/^ape_[0-9A-Za-z]{26}$/.test(item.effectID) ||
      !Number.isSafeInteger(item.version) ||
      item.version < 1 ||
      !isRecord(item.authorAndCause) ||
      item.authorAndCause.type !== command.cause.type
    ) {
      return false
    }
    if (
      item.materializedSnapshot.learnerVisibleScope !== item.learnerVisibleScope ||
      !same(item.materializedSnapshot.retrievalScope, item.retrievalScope) ||
      item.materializedSnapshot.purpose !== item.purpose ||
      item.materializedSnapshot.directorySummary !== item.directorySummary ||
      item.materializedSnapshot.body !== item.body ||
      item.materializedSnapshot.assumptionsAndUncertainty !== item.assumptionsAndUncertainty ||
      !Array.isArray(item.materializedSnapshot.exactBasis) ||
      !item.materializedSnapshot.exactBasis.every(
        (binding, bindingIndex) =>
          isRecord(binding) && isRecord(binding.ref) && same(binding.ref, item.exactBasisRefs[bindingIndex]),
      ) ||
      item.materializedSnapshot.exactBasis.length !== item.exactBasisRefs.length ||
      !same(item.materializedSnapshot.exactBasis, item.exactBasisBindings) ||
      ((item.operation === "create" || item.operation === "alternative" || item.operation === "restore") &&
        item.disposition !== "active") ||
      (item.operation === "retire" && item.disposition !== "retired") ||
      (item.outcome === "no_change" && item.operation !== "revise")
    ) {
      return false
    }
    if (intent.operation === "create" || intent.operation === "alternative") {
      if (item.createOrdinal !== intent.createOrdinal || item.version !== 1 || item.previousRevisionID !== undefined) {
        return false
      }
    } else if (
      item.suggestionID !== intent.suggestionID ||
      item.previousRevisionID !== intent.expectedHead.revisionID ||
      item.version !== intent.expectedHead.version + (item.outcome === "changed" ? 1 : 0) ||
      item.createOrdinal !== undefined
    ) {
      return false
    }
    if (
      (intent.operation === "alternative" && !same(item.alternativeToRevision, intent.alternativeToRevision)) ||
      (intent.operation === "create" && item.alternativeToRevision !== undefined) ||
      (intent.operation !== "create" &&
        intent.operation !== "alternative" &&
        item.alternativeToRevision !== undefined &&
        (!/^aps_[0-9A-Za-z]{26}$/.test(item.alternativeToRevision.suggestionID) ||
          !/^apr_[0-9A-Za-z]{26}$/.test(item.alternativeToRevision.revisionID) ||
          !Number.isSafeInteger(item.alternativeToRevision.version) ||
          item.alternativeToRevision.version < 1))
    ) {
      return false
    }
    if ("snapshot" in intent && intent.snapshot) {
      const materializedAnchors =
        isRecord(item.retrievalScope) && item.retrievalScope.type === "anchored" && Array.isArray(item.retrievalScope.anchors)
          ? item.retrievalScope.anchors.flatMap((anchor) =>
              isRecord(anchor) && isRecord(anchor.exactBound) && isRecord(anchor.exactBound.ref)
                ? [{ stableOwnerKey: anchor.stableOwnerKey, exactBoundRef: anchor.exactBound.ref }]
                : [],
            )
          : []
      return (
        item.learnerVisibleScope === intent.snapshot.learnerVisibleScope &&
        item.purpose === intent.snapshot.purpose &&
        item.directorySummary === intent.snapshot.directorySummary &&
        item.body === intent.snapshot.body &&
        item.assumptionsAndUncertainty === intent.snapshot.assumptionsAndUncertainty &&
        same(item.exactBasisRefs, intent.snapshot.exactBasisRefs) &&
        (intent.snapshot.retrievalScope.type === "learner_home_fallback"
          ? same(item.retrievalScope, intent.snapshot.retrievalScope)
          : same(materializedAnchors, intent.snapshot.retrievalScope.anchors))
      )
    }
    return true
  })
}

export function assignmentScope(
  candidate: Pick<Assignment.Candidate, "canonicalCommand" | "causeBasis" | "materialized">,
) {
  const command = candidate.canonicalCommand
  const materialized = candidate.materialized.map((item) => ({
    outcome: item.outcome,
    ordinal: item.ordinal,
    operation: item.intent.type,
    assignmentID: item.assignmentID,
    revisionID: item.revisionID,
    finalDisposition: item.finalDisposition,
    ...(item.relationTarget ? { relationTarget: item.relationTarget } : {}),
    ...(item.successorAssignmentID ? { successorAssignmentID: item.successorAssignmentID } : {}),
    ...(item.successorRevisionID ? { successorRevisionID: item.successorRevisionID } : {}),
  }))
  return assignmentScopeValue(command, candidate.causeBasis, materialized)
}

function assignmentScopeValue(
  command: Assignment.CanonicalChangeSet,
  sourceBasis: unknown,
  materialized: AssignmentScope["materialized"],
) {
  const targetedAssignmentIDs = command.intents.flatMap((intent) =>
    "assignmentID" in intent ? [intent.assignmentID] : [],
  )
  const expectedHeads = command.intents.flatMap((intent) =>
    "expectedHead" in intent
      ? [
          {
            assignmentID: intent.assignmentID,
            revisionID: intent.expectedHead.revisionID,
            version: intent.expectedHead.version,
            ownerCutFingerprint: intent.expectedHead.ownerCutFingerprint,
          },
        ]
      : [],
  )
  const sourceActions = command.intents.flatMap((intent) =>
    "sourceAction" in intent ? [intent.sourceAction.type] : [],
  )
  const finalDispositions = command.intents.flatMap((intent) => {
    if (intent.type === "create") return ["open" as const]
    if (intent.type === "replace") return ["superseded" as const]
    return intent.finalDisposition ? [intent.finalDisposition] : []
  })
  const replacementTargets = command.intents.flatMap((intent) => {
    if (intent.type === "replace" && intent.successor.type === "bind") return [intent.successor.target]
    if (intent.type !== "create" && intent.type !== "replace" && intent.relationAction.type === "set_or_retarget") {
      return [intent.relationAction.target]
    }
    return []
  })
  return {
    command: structuredClone(command),
    sourceBasis: structuredClone(sourceBasis),
    materialized: structuredClone(materialized),
    operationCount: command.intents.length,
    causeType: command.cause.type,
    targetedAssignmentIDs,
    expectedHeads,
    sourceActions,
    finalDispositions,
    replacementTargets,
    nonImplications: [
      "activity",
      "progress",
      "mastery",
      "learner_commitment",
      "study_plan",
      "selected_tutor_move",
    ],
  }
}

function assignmentOperationText(
  intent: Assignment.CanonicalChangeSet["intents"][number],
  materialized: AssignmentScope["materialized"][number] | undefined,
) {
  const identity = materialized
    ? materialized.outcome === "no_change"
      ? `${materialized.assignmentID}/${materialized.revisionID}; unchanged; disposition ${materialized.finalDisposition}`
      : `${materialized.assignmentID}/${materialized.revisionID}; disposition ${materialized.finalDisposition}`
    : "materialized identity unavailable"
  if (intent.type === "create") {
    return `create #${intent.createOrdinal}; ${identity}; ${assignmentSnapshotText(intent.snapshot)}`
  }
  if (intent.type === "replace") {
    const successor =
      intent.successor.type === "create"
        ? `new successor #${intent.successor.createOrdinal} ${materialized?.successorAssignmentID ?? "identity unavailable"}/${materialized?.successorRevisionID ?? "revision unavailable"}; ${assignmentSnapshotText(intent.successor.snapshot)}`
        : `existing successor ${intent.successor.target.assignmentID}/${intent.successor.target.revisionID} v${intent.successor.target.version}`
    return `replace ${intent.assignmentID}/${intent.expectedHead.revisionID} v${intent.expectedHead.version}; result ${identity}; ${successor}; source ${intent.sourceAction.type}; rationale ${intent.rationale}`
  }
  return `${intent.type} ${intent.assignmentID}/${intent.expectedHead.revisionID} v${intent.expectedHead.version}; result ${identity}; relation ${intent.relationAction.type}${materialized?.relationTarget ? ` -> ${materialized.relationTarget.assignmentID}/${materialized.relationTarget.revisionID} v${materialized.relationTarget.version}` : ""}; source ${intent.sourceAction.type}; ${intent.snapshot ? assignmentSnapshotText(intent.snapshot) : "semantic snapshot preserved"}; rationale ${intent.rationale}`
}

function assignmentSourceFacts(value: unknown): readonly Fact[] {
  if (!isRecord(value) || typeof value.type !== "string") return [fact("Exact source", "invalid")]
  if (value.type === "learner_occurrence" && isRecord(value.excerpt)) {
    return [
      fact(
        "Exact learner source",
        `${String(value.occurrenceID)}; session ${String(value.sessionID)}; message ${String(value.messageID)}; turn ${String(value.turnID)}; input ${String(value.inputID)}; source order ${String(value.sourceOrder)}`,
      ),
      fact(
        "Source excerpt",
        `${String(value.excerpt.startByte)}..${String(value.excerpt.endByte)} bytes; sha256 ${String(value.excerpt.sha256)}; ${String(value.excerpt.text)}`,
      ),
    ]
  }
  if (value.type === "artifact_revision" && isRecord(value.selector)) {
    return [
      fact(
        "Exact Artifact source",
        `${String(value.artifactID)}/${String(value.revisionID)}; attribution ${JSON.stringify(value.attribution)}; selector ${String(value.selector.locator)}; locator digest ${String(value.selector.locatorDigest)}${value.selector.excerptSha256 ? `; excerpt sha256 ${String(value.selector.excerptSha256)}` : ""}`,
      ),
      fact("Source admission", JSON.stringify(value.admission) ?? "unavailable"),
    ]
  }
  if (value.type === "representation_revision" && isRecord(value.selector)) {
    return [
      fact(
        "Exact Representation source",
        `${String(value.representationRevisionID)}; selector ${String(value.selector.locator)}; locator digest ${String(value.selector.locatorDigest)}`,
      ),
      fact("Source admission", JSON.stringify(value.admission) ?? "unavailable"),
    ]
  }
  if (value.type === "assignment_owner_read" && Array.isArray(value.ownerReads)) {
    return [
      fact(
        "Exact Assignment owner reads",
        value.ownerReads
          .map((read) =>
            isRecord(read)
              ? `${String(read.assignmentID)}/${String(read.revisionID)} v${String(read.version)} at ${String(read.ownerCutFingerprint)}`
              : "invalid",
          )
          .join(", "),
      ),
    ]
  }
  return [fact("Exact source", "invalid")]
}

function assignmentSnapshotText(
  snapshot: Extract<Assignment.CanonicalChangeSet["intents"][number], { type: "create" }>["snapshot"],
) {
  const scope =
    snapshot.scope.type === "learner_home"
      ? "LearnerHome"
      : `Courses ${(snapshot.scope.courseIDs ?? []).join(", ") || "none"}`
  return `summary ${snapshot.obligationSummary}; learning context ${snapshot.learningContext}; scope ${scope}; due ${assignmentDueText(snapshot.dueBasis)}; expiry ${snapshot.expiryBoundary ? assignmentDueText(snapshot.expiryBoundary) : "none"}`
}

function assignmentDueText(due: unknown) {
  if (!isRecord(due) || typeof due.type !== "string") return "invalid"
  if (due.type === "unresolved" || due.type === "explicitly_no_deadline") return due.type
  if (due.type === "local_date" && typeof due.civilDate === "string") return `${due.civilDate} (${due.comparator})`
  if (due.type === "instant" && typeof due.sourceExpression === "string") {
    return `${due.sourceExpression} (${due.comparator})`
  }
  return "invalid"
}

function validAssignmentSourceBasis(command: Assignment.CanonicalChangeSet, value: unknown) {
  if (!isRecord(value) || typeof value.type !== "string") return false
  const cause = command.cause
  if (cause.type === "agent_correction") {
    return value.type === "assignment_owner_read" && same(value.ownerReads, cause.ownerReads)
  }
  if (cause.type === "interpreted_learner_report" || cause.type === "interpreted_learner_direction") {
    if (value.type !== "learner_occurrence" || !isRecord(value.excerpt)) return false
    return (
      value.excerpt.text === cause.excerpt.text &&
      value.excerpt.startByte === cause.excerpt.startByte &&
      value.excerpt.endByte === cause.excerpt.endByte &&
      typeof value.excerpt.sha256 === "string" &&
      value.excerpt.sha256 === new Bun.CryptoHasher("sha256").update(cause.excerpt.text).digest("hex")
    )
  }
  const source = cause.source
  if (source.type === "artifact_revision") {
    if (
      value.type !== "artifact_revision" ||
      value.artifactID !== source.artifactID ||
      value.revisionID !== source.revisionID ||
      !same(value.attribution, source.attribution) ||
      !isRecord(value.selector)
    ) {
      return false
    }
    return (
      value.selector.locator === source.selector.locator &&
      same(value.selector.excerpt, source.selector.excerpt) &&
      typeof value.selector.locatorDigest === "string"
    )
  }
  return (
    value.type === "representation_revision" &&
    value.representationRevisionID === source.representationRevisionID &&
    isRecord(value.selector) &&
    value.selector.locator === source.selector.locator &&
    typeof value.selector.locatorDigest === "string"
  )
}

function validAssignmentMaterialized(
  command: Assignment.CanonicalChangeSet,
  values: AssignmentScope["materialized"],
) {
  if (new Set(values.map((value) => value.ordinal)).size !== values.length) return false
  return values.every((value) => {
    const intent = command.intents[value.ordinal]
    if (
      !intent ||
      intent.type !== value.operation ||
      !/^asn_[0-9A-Za-z]{26}$/.test(value.assignmentID) ||
      !/^asr_[0-9A-Za-z]{26}$/.test(value.revisionID)
    ) {
      return false
    }
    if (value.outcome === "no_change" && intent.type !== "revise") return false
    if (intent.type === "create") {
      return (
        value.finalDisposition === "open" &&
        value.relationTarget === undefined &&
        value.successorAssignmentID === undefined &&
        value.successorRevisionID === undefined
      )
    }
    if (value.assignmentID !== intent.assignmentID) return false
    if (intent.type === "replace") {
      if (value.finalDisposition !== "superseded" || !value.relationTarget || !value.successorAssignmentID) {
        return false
      }
      if (value.relationTarget.assignmentID !== value.successorAssignmentID) return false
      if (intent.successor.type === "bind") {
        return same(value.relationTarget, intent.successor.target) && value.successorRevisionID === undefined
      }
      return (
        typeof value.successorRevisionID === "string" &&
        /^asr_[0-9A-Za-z]{26}$/.test(value.successorRevisionID) &&
        value.relationTarget.revisionID === value.successorRevisionID &&
        value.relationTarget.version === 1
      )
    }
    if (value.successorAssignmentID !== undefined || value.successorRevisionID !== undefined) return false
    const expectedDisposition =
      intent.type === "correct"
        ? intent.finalDisposition
        : intent.type === "complete"
          ? "completed"
          : intent.type === "cancel"
            ? "cancelled"
            : intent.type === "dismiss"
              ? "dismissed"
              : intent.type === "reopen"
                ? "open"
                : undefined
    if (expectedDisposition && value.finalDisposition !== expectedDisposition) return false
    if (intent.relationAction.type === "set_or_retarget") {
      return same(value.relationTarget, intent.relationAction.target)
    }
    if (intent.relationAction.type === "clear") return value.relationTarget === undefined
    return true
  })
}

function learnerResponseEvidenceScope(
  command: LearnerResponseEvidence.CanonicalCommand,
  subject: LearnerResponseEvidenceScope["subject"],
  target: LearnerResponseEvidenceScope["target"],
) {
  const operation = command.operation
  return {
    command,
    subject,
    target,
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
    nonImplications: ["mastery", "understanding", "retention", "required_next_action"] as const,
  }
}

function expected(
  value: SemanticPresentationV1.Proposal,
  input: {
    readonly capability: string
    readonly patterns: readonly string[]
    readonly always: readonly string[]
    readonly promptRequired: boolean
    readonly approval: "once_only" | "policy"
    readonly domain: Readonly<Record<string, unknown>>
    readonly binding?: unknown
  },
): ProposalExpected | undefined {
  if (input.binding !== undefined) {
    const basis = value.basis
    if (
      (basis.kind === "default_course_command" || basis.kind === "course_route_anchor") &&
      !same(input.binding, navigationCommand(basis))
    ) {
      return undefined
    }
    if (basis.kind === "retained_learning_steering" && !same(input.binding, retainedCommand(basis))) {
      return undefined
    }
  }
  return {
    capability: input.capability,
    patterns: input.patterns,
    always: input.always,
    promptRequired: input.promptRequired,
    approval: input.approval,
    metadata: {
      ...input.domain,
      ...metadata(value),
      ...(input.promptRequired ? { [PermissionV1.PROMPT_REQUIRED_METADATA_KEY]: true } : {}),
    },
  }
}

function navigationCommand(
  basis:
    | Extract<SemanticPresentationV1.ProposalBasis, { kind: "default_course_command" }>
    | Extract<SemanticPresentationV1.ProposalBasis, { kind: "course_route_anchor" }>,
) {
  if (basis.kind === "default_course_command") {
    return {
      kind: "default_course_preference",
      expectedHeadID: basis.expectedHeadID,
      expectedVersion: basis.expectedVersion,
      target: basis.target,
    }
  }
  return {
    kind: "course_route_anchor",
    courseID: basis.courseID,
    expectedHeadID: basis.expectedHeadID,
    expectedVersion: basis.expectedVersion,
    target: basis.target,
  }
}

function retainedCommand(basis: Extract<SemanticPresentationV1.ProposalBasis, { kind: "retained_learning_steering" }>) {
  const common = {
    action: basis.action,
    sourceExcerpt: basis.sourceExcerpt,
    ...(basis.learnerReason === undefined ? {} : { learnerReason: basis.learnerReason }),
  }
  if (basis.action === "create") {
    if (!basis.operativeInstruction || !basis.validUntil) return undefined
    if (basis.policyID || basis.expectedHeadID || basis.expectedVersion !== undefined) return undefined
    return { ...common, operativeInstruction: basis.operativeInstruction, validUntil: basis.validUntil }
  }
  if (!basis.policyID || !basis.expectedHeadID || basis.expectedVersion === undefined) return undefined
  if (basis.action === "replace") {
    if (!basis.operativeInstruction || !basis.validUntil) return undefined
    return {
      ...common,
      operativeInstruction: basis.operativeInstruction,
      validUntil: basis.validUntil,
      policyID: basis.policyID,
      expectedHeadID: basis.expectedHeadID,
      expectedVersion: basis.expectedVersion,
    }
  }
  if (basis.operativeInstruction || basis.validUntil) return undefined
  return {
    ...common,
    policyID: basis.policyID,
    expectedHeadID: basis.expectedHeadID,
    expectedVersion: basis.expectedVersion,
  }
}

function goalCommand(operations: readonly SemanticPresentationV1.GoalProposalOperation[]) {
  const command = operations.map((operation) => {
    const snapshot = goalSnapshot(operation.meaning)
    if (operation.type === "create") {
      if (operation.meaning.disposition === "superseded" || operation.resultIntent !== "create_new_goal") {
        return undefined
      }
      return { type: operation.type, snapshot, disposition: operation.meaning.disposition }
    }
    if (operation.type === "update") {
      if (!goalSourceMatchesOperation(operation)) return undefined
      if (operation.meaning.disposition === "superseded") {
        if (!operation.supersessionTarget || operation.resultIntent !== "supersede_with_existing_goal") {
          return undefined
        }
        return {
          type: operation.type,
          goalID: operation.goalID,
          expectedHeadID: operation.expectedHeadID,
          expectedVersion: operation.expectedVersion,
          snapshot,
          disposition: {
            type: "superseded",
            targetGoalID: operation.supersessionTarget.goalID,
            targetRevisionID: operation.supersessionTarget.revisionID,
          },
        }
      }
      if (operation.supersessionTarget || operation.resultIntent !== "update_existing_goal") return undefined
      return {
        type: operation.type,
        goalID: operation.goalID,
        expectedHeadID: operation.expectedHeadID,
        expectedVersion: operation.expectedVersion,
        snapshot,
        disposition: { type: operation.meaning.disposition },
      }
    }
    if (!goalSourceMatchesOperation(operation)) return undefined
    if (operation.meaning.disposition !== "superseded") return undefined
    if (
      (operation.replacementTarget.type === "new" && operation.resultIntent !== "supersede_with_new_goal") ||
      (operation.replacementTarget.type === "existing" && operation.resultIntent !== "supersede_with_existing_goal")
    ) {
      return undefined
    }
    return {
      type: operation.type,
      goalID: operation.goalID,
      expectedHeadID: operation.expectedHeadID,
      expectedVersion: operation.expectedVersion,
      snapshot,
      target:
        operation.replacementTarget.type === "new"
          ? {
              type: "new",
              snapshot: goalSnapshot(operation.replacementTarget.meaning),
              disposition: operation.replacementTarget.meaning.disposition,
            }
          : {
              type: "existing",
              goalID: operation.replacementTarget.goalID,
              revisionID: operation.replacementTarget.revisionID,
              version: operation.replacementTarget.version,
            },
    }
  })
  if (command.some((operation) => operation === undefined)) return undefined
  return { operations: command }
}

function goalSnapshot(meaning: SemanticPresentationV1.GoalProposalOperation["meaning"]) {
  return {
    outcome: meaning.outcome,
    conditions: meaning.conditions,
    scope:
      meaning.scope.type === "learner_home"
        ? { type: "learner_home" }
        : {
            type: "courses",
            courses: meaning.scope.courses.map((course) => ({
              courseID: course.courseID,
              basis: course.basis,
            })),
          },
    target: meaning.target,
    fieldBases: meaning.fieldBases,
  }
}

function goalSourceMatchesOperation(
  operation: Exclude<SemanticPresentationV1.GoalProposalOperation, { type: "create" }>,
) {
  return (
    operation.source.goalID === operation.goalID &&
    operation.source.revisionID === operation.expectedHeadID &&
    operation.source.version === operation.expectedVersion
  )
}

function projectProposal(
  basis: SemanticPresentationV1.ProposalBasis,
  approval: "once_only" | "policy",
): ProposalProjection {
  if (basis.kind === "accept_course_view_revision") {
    return proposalProjection(
      basis,
      approval,
      "accept_course_view_revision",
      "Accept this Course View revision",
      "This approval is bound to one exact Course revision and the displayed state versions.",
      [
        ...courseLocatorFacts(basis.locator),
        fact("Expected Course version", basis.expectedCourseVersion),
        fact(
          "Expected selection",
          basis.expectedSelectionRevisionID
            ? `revision present; version ${basis.expectedSelectionVersion}`
            : `none; version ${basis.expectedSelectionVersion}`,
        ),
        fact("Expected View version", basis.expectedViewVersion),
        fact("Expected Revision version", basis.expectedRevisionVersion),
      ],
    )
  }
  if (basis.kind === "future_attention_capability") {
    const command = canonicalFutureAttentionCommand(basis.scope)
    return proposalProjection(
      basis,
      approval,
      FutureAttention.UPDATE_CAPABILITY,
      "Update future attention",
      "This configured capability approval is bound to one exact learner occurrence and one atomic, source-linked change set. Open-language relations remain fallible Agent interpretations; current-Assistant service remains pending until this exact presentation finalizes.",
      [
        fact("Issuance", basis.issuance),
        fact("Operations", basis.scope.operationCount),
        fact("Completion-conditioned claims", basis.scope.completionClaimCount),
        fact("Source relations", basis.scope.sourceRelations.join(", ") || "none"),
        ...(command?.operations.map((operation, index) =>
          fact(`Future-attention change ${index + 1}`, futureAttentionOperationText(operation)),
        ) ?? []),
        fact("Does not imply", basis.scope.nonImplications.join(", ")),
      ],
    )
  }
  if (basis.kind === "learner_state_judgment_capability") {
    return proposalProjection(
      basis,
      approval,
      LearnerStateJudgment.UPDATE_CAPABILITY,
      "Store or correct this learner-state judgment",
      "This approval is bound to one exact, source-bearing, fallible whole-judgment revision. It permits durable storage; it does not certify mastery or prove any individual clause.",
      [
        fact("Issuance", basis.issuance),
        fact("Operation", basis.scope.materialized.operation),
        fact(
          "Exact revision",
          `${basis.scope.materialized.judgmentID}/${basis.scope.materialized.revisionID} v${basis.scope.materialized.version}; ${basis.scope.materialized.disposition}; ${basis.scope.materialized.outcome}`,
        ),
        ...(basis.scope.materialized.previousRevisionID
          ? [fact("Expected predecessor", basis.scope.materialized.previousRevisionID)]
          : []),
        fact("Cause", basis.scope.causeType),
        fact("Subject", `${basis.scope.subjectLabel}; scope ${basis.scope.scopeType}`),
        fact("Fallible judgment", basis.scope.judgmentBody),
        ...(basis.scope.uncertaintyAndLimits
          ? [fact("Uncertainty and limits", basis.scope.uncertaintyAndLimits)]
          : []),
        fact("Exact subject anchors", JSON.stringify(basis.scope.anchorRefs)),
        fact(
          "Exact basis for the whole judgment",
          `${basis.scope.basisRefCount} reference(s); ${JSON.stringify(basis.scope.basisRefs)}`,
        ),
        fact("Does not imply", basis.scope.nonImplications.join(", ")),
      ],
    )
  }
  if (basis.kind === "advisory_plan_suggestion_capability") {
    return proposalProjection(
      basis,
      approval,
      AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
      "Store or revise advisory learning suggestions",
      "This approval is bound to one exact, source-bearing, fallible advisory change set. It permits durable storage; it does not approve a schedule, certify learning, or claim that the learner followed the advice.",
      [
        fact("Issuance", basis.issuance),
        fact("Cause", basis.scope.causeType),
        fact("Operations", basis.scope.operationCount),
        ...(basis.scope.expectedHeads.length > 0
          ? [
              fact(
                "Expected heads",
                basis.scope.expectedHeads
                  .map((head) => `${head.suggestionID}/${head.revisionID} v${head.version}`)
                  .join(", "),
              ),
            ]
          : []),
        ...basis.scope.materialized.flatMap((item) => [
          fact(
            `Suggestion action ${item.operationOrdinal + 1}`,
            `${item.operation}; ${item.suggestionID}/${item.revisionID} v${item.version}; ${item.disposition}; ${item.outcome}${item.createOrdinal === undefined ? "" : `; create ordinal ${item.createOrdinal}`}`,
          ),
          ...(item.previousRevisionID ? [fact("Expected predecessor", item.previousRevisionID)] : []),
          ...(item.alternativeToRevision
            ? [
                fact(
                  "Exact alternative target",
                  `${item.alternativeToRevision.suggestionID}/${item.alternativeToRevision.revisionID} v${item.alternativeToRevision.version}`,
                ),
              ]
            : []),
          fact("Learner-visible scope", item.learnerVisibleScope),
          fact("Retrieval scope", JSON.stringify(item.retrievalScope)),
          fact("Purpose", item.purpose),
          fact("Directory summary", item.directorySummary),
          fact("Advisory body", item.body),
          ...(item.assumptionsAndUncertainty
            ? [fact("Assumptions and uncertainty", item.assumptionsAndUncertainty)]
            : []),
          fact("Exact basis references", JSON.stringify(item.exactBasisRefs)),
          fact("Exact basis bindings", JSON.stringify(item.exactBasisBindings)),
          fact("Root author and cause", JSON.stringify(item.authorAndCause)),
        ]),
        fact("Does not imply", basis.scope.nonImplications.join(", ")),
      ],
    )
  }
  if (basis.kind === "assignment_capability") {
    const command = canonicalAssignmentCommand(basis.scope)
    return proposalProjection(
      basis,
      approval,
      Assignment.UPDATE_CAPABILITY,
      "Update Assignment records",
      "This configured capability approval is bound to one exact, source-bearing correction set. Assignment state records an obligation; it does not prove activity, progress, mastery, commitment, or completion outside the explicit transition.",
      [
        fact("Issuance", basis.issuance),
        fact("Cause", basis.scope.causeType),
        ...assignmentSourceFacts(basis.scope.sourceBasis),
        fact("Operations", basis.scope.operationCount),
        ...(basis.scope.expectedHeads.length > 0
          ? [
              fact(
                "Expected heads",
                basis.scope.expectedHeads
                  .map((head) => `${head.assignmentID}/${head.revisionID} v${head.version}`)
                  .join(", "),
              ),
            ]
          : []),
        ...(command?.intents.map((intent, index) =>
          fact(
            `Assignment change ${index + 1}`,
            assignmentOperationText(
              intent,
              basis.scope.materialized.find((materialized) => materialized.ordinal === index),
            ),
          ),
        ) ?? []),
        fact("Does not imply", basis.scope.nonImplications.join(", ")),
      ],
    )
  }
  if (basis.kind === "learner_response_evidence_capability") {
    const command = basis.scope.command
    const target = basis.scope.target
    return proposalProjection(
      basis,
      approval,
      "update_learner_response_evidence",
      command.operation === "create" ? "Record this learner-response evidence" : "Correct this learner-response evidence",
      "This configured capability approval is bound to one exact occurrence-and-selector assessment or one exact corrected head. It does not assert mastery or understanding.",
      [
        fact("Issuance", basis.issuance),
        fact("Operation", command.operation),
        fact(
          "Subject occurrence",
          `${basis.scope.subject.occurrenceID}; session ${basis.scope.subject.sessionID}; turn ${basis.scope.subject.turnID}; input ${basis.scope.subject.inputID}; source order ${basis.scope.subject.sourceOrder}`,
        ),
        fact(
          "Exact target",
          `${target.mapID}/${target.selectorID} -> ${target.courseID}/${target.viewID}/${target.revisionID}/${target.itemID}`,
        ),
        fact(
          "Target versions",
          `alignment ${target.alignmentDispositionVersion}; map ${target.mapDispositionVersion}; course ${target.courseVersion}; view ${target.viewVersion}; revision ${target.revisionVersion}`,
        ),
        ...(command.operation === "create" ? [] : [fact("Expected record head", `${command.recordID} version ${command.expectedVersion}`)]),
        fact("Assessment scope", basis.scope.assessmentScope),
        fact("Program-bound basis", basis.scope.programBasis),
        fact("Program-bound disposition", basis.scope.programDisposition),
        fact("Assessment source", basis.scope.assessmentSourcePolicy),
        ...(command.operation === "retract"
          ? []
          : [fact("Relation", command.relation), fact("Disclosure order", command.exposure)]),
        fact("Does not imply", basis.scope.nonImplications.join(", ")),
      ],
    )
  }
  if (basis.kind === "representation_convert") {
    return proposalProjection(
      basis,
      approval,
      "representation.convert",
      "Create a readable representation",
      "This approval converts one exact Artifact revision with the trusted producer shown below.",
      [
        fact("Artifact", basis.effectiveArtifactID),
        fact("Source Revision", basis.sourceRevisionID),
        fact("Producer", basis.producerKind),
      ],
    )
  }
  if (basis.kind === "content_mutation") {
    return proposalProjection(
      basis,
      approval,
      "content_mutation",
      `Allow one file ${basis.operation}`,
      CONTENT_WARNING,
      [
        fact("Operation", basis.operation),
        fact("Anchor", basis.anchorPath),
        fact("Relative path", basis.relativePath),
        fact("Lifetime", basis.lifetime),
        fact("Rights", basis.rights.join(", ")),
      ],
    )
  }
  if (basis.kind === "default_course_confirmation") {
    return proposalProjection(
      basis,
      approval,
      "set_default_course_preference",
      basis.target ? "Confirm the default Course preference" : "Confirm clearing the default Course preference",
      "This one-time confirmation is bound to the exact current preference and target state.",
      [
        fact(
          "Current preference",
          basis.fromCourseTitle
            ? `"${basis.fromCourseTitle}"; version ${basis.version}`
            : `none; version ${basis.version}`,
        ),
        fact("Target Course", basis.target ? `"${basis.target.courseTitle}"` : "none"),
        ...(basis.target
          ? [
              fact(
                "Target versions",
                `Course ${basis.target.courseVersion}; selection ${basis.target.selectionVersion}`,
              ),
              fact(
                "Working View",
                basis.target.viewName ? `"${basis.target.viewName}"; version ${basis.target.viewVersion}` : "none",
              ),
              fact(
                "Working Revision",
                basis.target.selectionRevisionID ? `present; version ${basis.target.revisionVersion}` : "none",
              ),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "default_course_v2_capability") {
    return proposalProjection(
      basis,
      approval,
      "set_default_course_preference",
      basis.authorization.to.kind === "course"
        ? "Set the default Course preference"
        : "Clear the default Course preference",
      "This approval is bound to one exact learner-authorized operation and its symmetric before/after Course locators.",
      [
        fact("Authorization", basis.authorization.kind),
        fact("Operation", basis.authorization.operation),
        ...defaultEndpointFacts("From", basis.authorization.from),
        ...defaultEndpointFacts("To", basis.authorization.to),
        fact("Preference version", basis.authorization.preferenceVersion),
        fact("Resolution coverage", basis.authorization.resolutionScope.coverage),
      ],
    )
  }
  if (basis.kind === "default_course_v3_capability") {
    return proposalProjection(
      basis,
      approval,
      "set_default_course_preference",
      basis.agentAction.to.kind === "course"
        ? "Set the default Course preference"
        : "Clear the default Course preference",
      "This approval is bound to one exact Agent-issued operation and its runtime-captured before/after Course locators.",
      [
        fact("Issuance", basis.agentAction.provenance.kind),
        fact("Operation", basis.agentAction.operation),
        ...defaultEndpointFacts("From", basis.agentAction.from),
        ...defaultEndpointFacts("To", basis.agentAction.to),
        fact("Preference version", basis.agentAction.preferenceVersion),
      ],
    )
  }
  if (basis.kind === "learner_goals_v2_capability") {
    return proposalProjection(
      basis,
      approval,
      "update_learner_goals",
      basis.operations.length === 1 ? "Update this learner Goal" : "Update these learner Goals",
      "This configured capability approval is bound to the exact Agent-issued change set and its runtime-materialized before/after Goal state.",
      [
        fact("Issuance", basis.issuance),
        ...basis.operations.map((operation) =>
          fact(`Goal change ${operation.ordinal + 1}`, goalV2MaterializedText(operation)),
        ),
      ],
    )
  }
  if (basis.kind === "learning_bootstrap_capability") {
    const command = basis.scope.command
    return proposalProjection(
      basis,
      approval,
      "update_learning_course",
      "Apply this learning bootstrap",
      "This configured capability approval is bound to one exact Agent-issued Course bootstrap and its closed local consequence set.",
      [
        fact("Issuance", basis.issuance),
        fact("Command fingerprint", basis.commandFingerprint),
        fact(
          "Course",
          command.course.type === "new"
            ? `create \"${command.course.title}\"`
            : command.course.title === undefined
              ? `use existing ${command.course.courseID}`
              : `correct ${command.course.courseID} title to \"${command.course.title}\"`,
        ),
        ...learningBootstrapRouteFacts(command.route),
        fact("Selection", learningBootstrapSelectionText(command.selection)),
        ...command.materials.map((material) =>
          fact(`Material ${material.key}`, learningBootstrapProposalMaterialText(material)),
        ),
        ...command.maps.flatMap(learningBootstrapMapFacts),
        ...command.alignments.map((alignment) =>
          fact(`Alignment ${alignment.key}`, learningBootstrapAlignmentText(alignment)),
        ),
        fact("Anchor", learningBootstrapProposalAnchorText(command.anchor)),
      ],
    )
  }
  if (basis.kind === "default_course_command") {
    return proposalProjection(
      basis,
      approval,
      "set_default_course_preference",
      basis.target ? "Set the default Course preference" : "Clear the default Course preference",
      "This approval is bound to the exact preference version and target.",
      [
        fact("Expected preference version", basis.expectedVersion),
        fact("Target", basis.target ? `one Course at version ${basis.target.courseVersion}` : "none"),
        fact("Expected result", basis.noChange ? "no change" : "change"),
      ],
    )
  }
  if (basis.kind === "course_route_anchor") {
    return proposalProjection(
      basis,
      approval,
      "set_course_route_anchor",
      basis.target ? "Set this Course route anchor" : "Clear the Course route anchor",
      "This approval is bound to one Course, its current anchor version, and the exact target.",
      [
        ...(basis.locator ? courseLocatorFacts(basis.locator) : []),
        fact("Expected anchor version", basis.expectedVersion),
        fact("Target", basis.target ? `one exact item; Course version ${basis.target.courseVersion}` : "none"),
        fact("Expected result", basis.noChange ? "no change" : "change"),
      ],
    )
  }
  if (basis.kind === "retained_learning_steering") {
    return proposalProjection(
      basis,
      approval,
      "update_retained_learning_steering",
      `${titleCase(basis.action)} retained learning steering`,
      "This exact learner instruction becomes durable learning-wide policy state.",
      [
        fact("Action", basis.action),
        fact("Scope", "learning-wide"),
        fact("Learner source", basis.sourceExcerpt),
        ...(basis.operativeInstruction ? [fact("Instruction", basis.operativeInstruction)] : []),
        ...(basis.learnerReason ? [fact("Reason", basis.learnerReason)] : []),
        ...(basis.validUntil ? [fact("Valid until", basis.validUntil)] : []),
        ...(basis.expectedVersion === undefined ? [] : [fact("Expected policy version", basis.expectedVersion)]),
      ],
    )
  }
  return proposalProjection(
    basis,
    approval,
    "update_learner_goals",
    basis.authorizationBasis === "learner_acceptance"
      ? "Confirm durable learner Goal changes"
      : "Allow direct learner Goal changes",
    basis.authorizationBasis === "learner_acceptance"
      ? "This one-time candidate becomes correctable Goal state; it is not evidence, mastery, priority, or a study schedule."
      : "This exact learner-authored request becomes correctable Goal state.",
    [
      fact(
        "Authorization",
        basis.authorizationBasis === "learner_acceptance" ? "one-time learner acceptance" : "direct learner request",
      ),
      ...(basis.confirmation?.goalBases.map((goal, index) =>
        fact(`Current Goal basis ${index + 1}`, `"${goal.outcome}"; ${goal.disposition}; version ${goal.version}`),
      ) ?? []),
      ...(basis.confirmation?.courseBases.map((course, index) =>
        fact(
          `Course basis ${index + 1}`,
          `"${course.courseTitle}" (${course.revisionRole} for change ${course.operationOrdinal + 1}); ${
            course.availability.state === "available"
              ? `available as "${course.availability.title}"`
              : `unavailable: ${course.availability.cause}`
          }`,
        ),
      ) ?? []),
      ...basis.operations.map((operation, index) => fact(`Goal change ${index + 1}`, goalProposalText(operation))),
    ],
  )
}

function learningBootstrapRouteFacts(route: LearningBootstrapScope["command"]["route"]): readonly Fact[] {
  if (!route) return [fact("Route", "none")]
  const routeIdentity =
    route.type === "successor_revision"
      ? `${route.type}; key ${route.key}; View ${route.viewID}; predecessor Revision ${route.predecessorRevisionID}`
      : `${route.type}; key ${route.key}; name \"${route.name}\"`
  return [
    fact("Route", `${routeIdentity}; authorship ${route.authorship}`),
    ...route.revision.items.map((item) =>
      fact(
        `Route item ${item.key}`,
        `title \"${item.title}\"; parent ${item.parentKey ?? "none"}; ${
          item.reuse ? `reuse ${item.reuse.sourceRevisionID}/${item.reuse.itemID}` : "new identity"
        }`,
      ),
    ),
    ...(route.revision.mappings ?? []).map((mapping, index) =>
      fact(
        `Route mapping ${index + 1}`,
        `${mapping.kind}; source item(s) [${mapping.sourceItemIDs.join(", ")}]; target key(s) [${mapping.targetKeys.join(", ")}]`,
      ),
    ),
  ]
}

function learningBootstrapSelectionText(selection: LearningBootstrapScope["command"]["selection"]) {
  if (selection.type !== "set") return selection.type
  return selection.target.type === "route"
    ? "set to the proposed route"
    : `set to existing Revision ${selection.target.revisionID}`
}

function learningBootstrapProposalMaterialText(material: LearningBootstrapScope["command"]["materials"][number]) {
  if (material.type === "representation") return `Representation Revision ${material.representationRevisionID}`
  if (material.type === "local") {
    return `new local Artifact from ${learningBootstrapReadText(material)}`
  }
  const attribution =
    material.attribution.type === "recorded"
      ? "recorded attribution"
      : `lineage correction member ${material.attribution.memberID}`
  return `Artifact ${material.artifactID}; Revision ${material.revisionID}; ${attribution}; ${
    material.read ? `read ${learningBootstrapReadText(material.read)}` : "no local read"
  }`
}

function learningBootstrapReadText(read: {
  readonly path: string
  readonly authority:
    | { readonly type: "content_root"; readonly contentRootID: string }
    | { readonly type: "active_workspace" }
    | { readonly type: "one_operation" }
}) {
  return `path \"${read.path}\"; authority ${
    read.authority.type === "content_root" ? `content_root ${read.authority.contentRootID}` : read.authority.type
  }`
}

function learningBootstrapMapFacts(map: LearningBootstrapScope["command"]["maps"][number]): readonly Fact[] {
  return [
    fact(
      `Map ${map.key}`,
      `material ${map.materialKey}; authorship ${map.authorship}; supersedes ${map.supersedesMapID ?? "none"}`,
    ),
    ...map.outline.flatMap((node) => [
      fact(`Map ${map.key} node ${node.key}`, `title \"${node.title}\"; parent ${node.parentKey ?? "none"}`),
      ...node.selectors.map((selector) =>
        fact(
          `Map ${map.key} selector ${selector.key}`,
          `node ${node.key}; ${learningBootstrapCoordinateText(selector.coordinate)}`,
        ),
      ),
    ]),
  ]
}

function learningBootstrapCoordinateText(
  coordinate: LearningBootstrapScope["command"]["maps"][number]["outline"][number]["selectors"][number]["coordinate"],
) {
  if (coordinate.kind === "whole_target.v1") return "whole target"
  if (coordinate.kind === "artifact_byte_range.v1")
    return `artifact bytes ${coordinate.startByte}..${coordinate.endByte}`
  if (coordinate.kind === "pdf_page_range.v1") return `PDF pages ${coordinate.startPage}..${coordinate.endPage}`
  if (coordinate.kind === "model_text_range.v1")
    return `model scalars ${coordinate.startScalar}..${coordinate.endScalar}`
  return `PDF text ${coordinate.start.page}/${coordinate.start.item}/${coordinate.start.scalar}..${coordinate.end.page}/${coordinate.end.item}/${coordinate.end.scalar}`
}

function learningBootstrapAlignmentText(alignment: LearningBootstrapScope["command"]["alignments"][number]) {
  const course =
    alignment.course.type === "route_item"
      ? `route item ${alignment.course.itemKey}`
      : `existing ${alignment.course.viewID}/${alignment.course.revisionID}/${alignment.course.itemID}; selection ${alignment.course.selection}`
  return `Map ${alignment.mapKey}; selector ${alignment.selectorKey}; authorship ${alignment.authorship}; Course ${course}; reason \"${alignment.reason}\"; supersedes ${alignment.supersedesAlignmentID ?? "none"}`
}

function learningBootstrapProposalAnchorText(anchor: LearningBootstrapScope["command"]["anchor"]) {
  if (anchor.type !== "set") return anchor.type
  return anchor.target.type === "route_item"
    ? `set to route item ${anchor.target.itemKey}`
    : `set to existing ${anchor.target.viewID}/${anchor.target.revisionID}/${anchor.target.itemID}`
}

function proposalProjection(
  _basis: SemanticPresentationV1.ProposalBasis,
  approval: "once_only" | "policy",
  capability: string,
  title: string,
  summary: string,
  facts: readonly Fact[],
): ProposalProjection {
  return { phase: "proposal", capability, title, summary, facts, approval }
}

function expectedResultMetadata(presentation: SemanticPresentationV1.Result, projection: ResultProjection) {
  const basis = presentation.basis
  const common = {
    command: projection.capability,
    commandVersion:
      basis.kind === "default_course_v3_result"
        ? 3
        : basis.kind === "default_course_v2_result" || basis.kind === "learner_goals_v2_result"
          ? 2
          : 1,
    outcome: basis.settlement.outcome,
    ...(basis.settlement.outcome === "error" ? { code: basis.settlement.code } : {}),
    durablySettled: projection.durablySettled,
  }
  if (basis.kind === "content_write_result") {
    return {
      ...common,
      truncated: false,
      ...(basis.authority.type === "one_shot"
        ? { onceOnly: true }
        : {
            mutationGrantID: basis.authority.grantID,
            mutationGrantVersion: basis.authority.grantVersion,
          }),
      operation: basis.operation,
      byteLength: basis.byteLength,
      anchorPath: basis.anchorPath,
      relativePath: basis.relativePath,
      ...metadata(presentation),
    }
  }
  return {
    ...common,
    truncated: false,
    ...metadata(presentation),
  }
}

function projectResult(basis: SemanticPresentationV1.ResultBasis): ResultProjection | undefined {
  const settlement = basis.settlement
  const outcome = resultOutcome(settlement)
  const failure = settlement.outcome === "error" ? [fact("Failure", settlement.code)] : []
  if (basis.kind === "accept_course_view_revision_result") {
    if (
      settlement.outcome === "error" &&
      (basis.courseID !== undefined ||
        basis.revisionID !== undefined ||
        basis.locator !== undefined ||
        basis.previousSelection !== undefined ||
        basis.committedSelection !== undefined ||
        basis.currentSelection !== undefined ||
        basis.relation !== undefined)
    ) {
      return undefined
    }
    if (
      settlement.outcome !== "error" &&
      (!basis.courseID ||
        !basis.revisionID ||
        !basis.locator ||
        basis.locator.course.id !== basis.courseID ||
        basis.locator.revision.id !== basis.revisionID ||
        basis.locator.item ||
        !basis.committedSelection ||
        !basis.currentSelection ||
        !basis.relation)
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      "accept_course_view_revision",
      "Course view revision acceptance",
      resultSummary("Course view revision acceptance", outcome),
      [
        ...failure,
        ...(basis.locator ? courseLocatorFacts(basis.locator) : []),
        ...(basis.committedSelection
          ? [
              fact("Committed selection", `version ${basis.committedSelection.version}`),
              ...(basis.currentSelection
                ? [fact("Current selection", `version ${basis.currentSelection.version}`)]
                : []),
              ...(basis.relation ? [fact("Relation", basis.relation)] : []),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "representation_convert_result") {
    if (
      settlement.outcome !== "error" &&
      (!basis.effectiveArtifactID || !basis.sourceRevisionID || !basis.representationRevisionID || !basis.producerKind)
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      "representation.convert",
      "Readable representation conversion",
      resultSummary("Readable representation conversion", outcome),
      [
        ...failure,
        ...(basis.effectiveArtifactID
          ? [
              fact("Artifact", basis.effectiveArtifactID),
              fact("Source Revision", basis.sourceRevisionID!),
              fact("Representation Revision", basis.representationRevisionID!),
              fact("Producer", basis.producerKind!),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "default_course_result") {
    if (settlement.outcome !== "error" && !basis.current) return undefined
    return resultProjection(
      basis,
      "set_default_course_preference",
      "Default Course preference",
      resultSummary("Default Course preference", outcome),
      [
        ...failure,
        ...(basis.current
          ? [
              fact(
                "Current preference",
                basis.current.status === "available"
                  ? `"${basis.current.title ?? "Untitled Course"}"; version ${basis.current.version}`
                  : `${basis.current.status}; version ${basis.current.version}`,
              ),
              ...(basis.relation ? [fact("Relation", basis.relation)] : []),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "default_course_v2_result") {
    const disposition = basis.disposition
    const acknowledgement = basis.acknowledgement
    if (
      acknowledgement &&
      (acknowledgement.invocationPartID !== basis.binding.partID || !validDefaultAcknowledgement(acknowledgement))
    ) {
      return undefined
    }
    if (disposition.kind === "semantic_terminal_v2") {
      const duplicate = disposition.outcome === "already_applied"
      if (
        duplicate
          ? settlement.outcome !== "already_applied" ||
            !acknowledgement ||
            acknowledgement.effectID !== disposition.existingEffectID ||
            disposition.incomingPayloadFingerprint !== disposition.existingPayloadFingerprint
          : settlement.outcome !== "error" ||
            settlement.code !== "semantic_conflict" ||
            acknowledgement !== undefined ||
            disposition.incomingPayloadFingerprint === disposition.existingPayloadFingerprint
      ) {
        return undefined
      }
    } else {
      const authorization = disposition.authorization
      const acknowledgementRequired = settlement.outcome === "applied" || settlement.outcome === "already_applied"
      if (
        authorization.kind !== authorization.source.kind ||
        !defaultAuthorizationTargetMatches(authorization) ||
        acknowledgementRequired !== Boolean(acknowledgement) ||
        ((settlement.outcome === "applied" || settlement.outcome === "already_applied") &&
          acknowledgement &&
          (acknowledgement.authorizationVersion !== 2 || acknowledgement.operation !== authorization.operation)) ||
        (settlement.outcome === "applied" &&
          acknowledgement &&
          (acknowledgement.authorizationVersion !== 2 ||
            acknowledgement.effectAuthorizationPartID !== basis.binding.partID ||
            acknowledgement.operation !== authorization.operation ||
            !same(acknowledgement.from, authorization.from) ||
            !same(acknowledgement.to, authorization.to)))
      ) {
        return undefined
      }
    }
    const owner =
      disposition.kind === "candidate_v2"
        ? [
            fact("Disposition", disposition.kind),
            fact("Authorization", disposition.authorization.kind),
            fact("Operation", disposition.authorization.operation),
            ...defaultEndpointFacts("From", disposition.authorization.from),
            ...defaultEndpointFacts("To", disposition.authorization.to),
          ]
        : [
            fact("Disposition", disposition.kind),
            fact("Semantic outcome", disposition.outcome),
            fact("Existing effect", disposition.existingEffectID),
          ]
    return resultProjection(
      basis,
      "set_default_course_preference",
      "Default Course preference",
      resultSummary("Default Course preference", outcome),
      [
        ...failure,
        ...owner,
        ...(acknowledgement
          ? [
              fact("Effect authorization", acknowledgement.effectAuthorizationPartID),
              fact("Operation", acknowledgement.operation),
              ...defaultEndpointFacts("Effect from", acknowledgement.from),
              ...defaultEndpointFacts("Effect to", acknowledgement.to),
              fact("Relation", acknowledgement.relation),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "default_course_v3_result") {
    const disposition = basis.disposition
    const acknowledgement = basis.acknowledgement
    if (
      acknowledgement &&
      (acknowledgement.invocationPartID !== basis.binding.partID || !validDefaultAcknowledgement(acknowledgement))
    ) {
      return undefined
    }
    if (disposition.kind === "semantic_terminal_v3") {
      const duplicate = disposition.outcome === "already_applied"
      if (
        duplicate
          ? settlement.outcome !== "already_applied" ||
            !acknowledgement ||
            acknowledgement.effectID !== disposition.existingEffectID ||
            disposition.incomingPayloadFingerprint !== disposition.existingPayloadFingerprint
          : settlement.outcome !== "error" ||
            settlement.code !== "semantic_conflict" ||
            acknowledgement !== undefined ||
            disposition.incomingPayloadFingerprint === disposition.existingPayloadFingerprint
      ) {
        return undefined
      }
    } else {
      const agentAction = disposition.agentAction
      const acknowledgementRequired = settlement.outcome === "applied" || settlement.outcome === "already_applied"
      if (
        !validDefaultV3AgentAction(agentAction, basis.binding) ||
        acknowledgementRequired !== Boolean(acknowledgement) ||
        (settlement.outcome === "applied" &&
          acknowledgement &&
          (acknowledgement.schemaVersion !== 2 ||
            acknowledgement.effectAgentActionPartID !== basis.binding.partID ||
            acknowledgement.operation !== agentAction.operation ||
            !same(acknowledgement.from, agentAction.from) ||
            !same(acknowledgement.to, agentAction.to)))
      ) {
        return undefined
      }
    }
    const owner =
      disposition.kind === "agent_action_v3"
        ? [
            fact("Disposition", disposition.kind),
            fact("Issuance", disposition.agentAction.provenance.kind),
            fact("Operation", disposition.agentAction.operation),
            ...defaultEndpointFacts("From", disposition.agentAction.from),
            ...defaultEndpointFacts("To", disposition.agentAction.to),
          ]
        : [
            fact("Disposition", disposition.kind),
            fact("Semantic outcome", disposition.outcome),
            fact("Existing effect", disposition.existingEffectID),
          ]
    return resultProjection(
      basis,
      "set_default_course_preference",
      "Default Course preference",
      resultSummary("Default Course preference", outcome),
      [
        ...failure,
        ...owner,
        ...(acknowledgement
          ? [
              fact(
                acknowledgement.schemaVersion === 2 ? "Effect Agent action" : "Effect authorization",
                acknowledgement.schemaVersion === 2
                  ? acknowledgement.effectAgentActionPartID
                  : acknowledgement.effectAuthorizationPartID,
              ),
              fact("Operation", acknowledgement.operation),
              ...defaultEndpointFacts("Effect from", acknowledgement.from),
              ...defaultEndpointFacts("Effect to", acknowledgement.to),
              fact("Relation", acknowledgement.relation),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "course_route_anchor_result") {
    if (
      settlement.outcome === "error" &&
      (basis.effect !== undefined || basis.current !== undefined || basis.relation !== undefined)
    ) {
      return undefined
    }
    if (
      settlement.outcome !== "error" &&
      (!basis.current ||
        !validAnchorCurrent(basis.current) ||
        (basis.effect !== undefined && !validAnchorEffect(basis.effect)) ||
        (basis.effect !== undefined && basis.relation === undefined) ||
        (basis.effect === undefined && basis.relation !== undefined))
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      "set_course_route_anchor",
      "Course route anchor",
      resultSummary("Course route anchor", outcome),
      [
        ...failure,
        ...(basis.effect?.locator ? courseLocatorFacts(basis.effect.locator, "Committed ") : []),
        ...(basis.effect ? [fact("Committed anchor", `${basis.effect.target}; version ${basis.effect.version}`)] : []),
        ...(basis.current?.locator ? courseLocatorFacts(basis.current.locator, "Current ") : []),
        ...(basis.current
          ? [
              fact("Current anchor", `${basis.current.target}; version ${basis.current.version}`),
              ...(basis.current.staleCause ? [fact("Stale cause", basis.current.staleCause)] : []),
              ...(basis.relation ? [fact("Relation", basis.relation)] : []),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "retained_learning_steering_result") {
    if (
      settlement.outcome === "error" &&
      (basis.action !== undefined ||
        basis.scope !== undefined ||
        basis.effect !== undefined ||
        basis.previous !== undefined ||
        basis.current !== undefined ||
        basis.relation !== undefined)
    ) {
      return undefined
    }
    if (
      settlement.outcome !== "error" &&
      (!basis.action ||
        basis.scope !== "learning_wide" ||
        !basis.effect ||
        !basis.current ||
        !basis.relation ||
        !validRetainedTransition(basis.effect) ||
        !validRetainedTransition(basis.current) ||
        (basis.previous !== undefined && !validRetainedTransition(basis.previous)) ||
        (basis.action === "create" && basis.previous !== undefined) ||
        (basis.action === "retract" && basis.effect.state !== "retracted") ||
        (basis.action !== "retract" && basis.effect.state !== "operative"))
    ) {
      return undefined
    }
    const title = basis.action === "retract" ? "Removed retained learning steering" : "Retained learning steering"
    return resultProjection(basis, "update_retained_learning_steering", title, resultSummary(title, outcome), [
      ...failure,
      ...(basis.effect
        ? [
            fact("Action", basis.action!),
            fact("Scope", basis.scope!),
            ...(basis.action === "retract"
              ? basis.previous?.operativeInstruction
                ? [fact("Retracted instruction", basis.previous.operativeInstruction)]
                : []
              : basis.effect.operativeInstruction
                ? [fact("Instruction", basis.effect.operativeInstruction)]
                : []),
            ...(basis.effect.validUntilNormalized ? [fact("Valid until", basis.effect.validUntilNormalized)] : []),
            ...(basis.effect.boundaryTimeZone && basis.effect.boundaryUtcOffsetMinutes !== undefined
              ? [
                  fact(
                    "Time zone",
                    `${basis.effect.boundaryTimeZone} (${utcOffset(basis.effect.boundaryUtcOffsetMinutes)})`,
                  ),
                ]
              : []),
            ...(basis.action === "replace" && basis.previous
              ? [
                  fact(
                    "Replaces",
                    `version ${basis.previous.version}: ${basis.previous.operativeInstruction ?? basis.previous.state}`,
                  ),
                ]
              : basis.action === "replace" && settlement.outcome === "no_change"
                ? [
                    fact(
                      "Replacement relation",
                      `The requested replacement already matches current version ${basis.effect.version}.`,
                    ),
                  ]
                : []),
            fact("State", basis.effect.state),
            fact("Status", basis.effect.status),
            fact("Version", basis.effect.version),
            ...(basis.action === "retract"
              ? [
                  fact("Effect", "This retained instruction no longer applies."),
                  fact("Correction", "A later explicit learner direction can reinstate or replace it."),
                ]
              : [
                  fact(
                    "Correction",
                    "Replace or retract this retained instruction with a later explicit learner direction.",
                  ),
                ]),
            ...(basis.relation === "superseded"
              ? [
                  fact("Relation", "superseded"),
                  fact(
                    "Current policy",
                    `version ${basis.current!.version}; ${basis.current!.state}${
                      basis.current!.operativeInstruction ? `: ${basis.current!.operativeInstruction}` : ""
                    }`,
                  ),
                ]
              : []),
          ]
        : []),
    ])
  }
  if (basis.kind === "learner_goals_result") {
    if (settlement.outcome !== "error" && (!basis.authorizationBasis || basis.operations.length === 0)) {
      return undefined
    }
    return resultProjection(
      basis,
      "update_learner_goals",
      goalResultTitle(basis, outcome),
      goalResultSummary(basis, outcome),
      [
        ...failure,
        ...(basis.authorizationBasis
          ? [
              fact(
                "Authorization",
                basis.authorizationBasis === "learner_acceptance" ? "learner acceptance" : "direct learner request",
              ),
            ]
          : []),
        ...basis.operations.map((operation) => fact(`Goal change ${operation.ordinal + 1}`, goalResultText(operation))),
      ],
    )
  }
  if (basis.kind === "learner_goals_v2_result") {
    const semanticTerminal = basis.disposition === "semantic_terminal_v2"
    const candidate = basis.disposition === "candidate_v2"
    if (
      semanticTerminal !== (basis.semanticOutcome !== undefined) ||
      candidate !== (basis.issuance !== undefined) ||
      candidate !== (basis.capabilityOutcome !== undefined) ||
      (!candidate && basis.permissionRequestID !== undefined) ||
      (semanticTerminal &&
        (basis.semanticOutcome === "already_applied"
          ? settlement.outcome !== "already_applied"
          : settlement.outcome !== "error" || settlement.code !== "semantic_conflict")) ||
      (settlement.outcome === "error" && basis.operations.length !== 0) ||
      (settlement.outcome !== "error" && basis.operations.length === 0)
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      "update_learner_goals",
      goalV2ResultTitle(basis, outcome),
      goalV2ResultSummary(basis, outcome),
      [
        ...failure,
        fact("Disposition", basis.disposition),
        ...(basis.issuance ? [fact("Issuance", basis.issuance)] : []),
        ...(basis.capabilityOutcome ? [fact("Capability", basis.capabilityOutcome)] : []),
        ...(basis.permissionRequestID ? [fact("Permission request", basis.permissionRequestID)] : []),
        ...basis.operations.map((operation) =>
          fact(`Goal change ${operation.ordinal + 1}`, goalV2ResultText(operation)),
        ),
      ],
    )
  }
  if (basis.kind === "learning_bootstrap_result") {
    const semanticTerminal = basis.disposition === "semantic_terminal_v1"
    const candidate = basis.disposition === "candidate_v1"
    if (
      semanticTerminal !== (basis.semanticOutcome !== undefined) ||
      candidate !== (basis.issuance !== undefined) ||
      (!candidate && basis.capabilityOutcome !== undefined) ||
      (!candidate && basis.permissionRequestID !== undefined) ||
      (semanticTerminal &&
        (basis.semanticOutcome === "already_applied"
          ? settlement.outcome !== "already_applied"
          : settlement.outcome !== "error" || settlement.code !== "semantic_conflict")) ||
      (settlement.outcome === "error" && basis.acknowledgement !== undefined) ||
      (settlement.outcome !== "error" &&
        (!basis.acknowledgement || basis.acknowledgement.outcome !== settlement.outcome))
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      "update_learning_course",
      "Learning bootstrap settlement",
      resultSummary("Learning bootstrap", outcome),
      [
        ...failure,
        fact("Disposition", basis.disposition),
        ...(basis.issuance ? [fact("Issuance", basis.issuance)] : []),
        ...(basis.capabilityOutcome ? [fact("Capability", basis.capabilityOutcome)] : []),
        ...(basis.permissionRequestID ? [fact("Permission request", basis.permissionRequestID)] : []),
        ...(basis.acknowledgement?.course
          ? [fact("Course", `\"${basis.acknowledgement.course.title}\" (${basis.acknowledgement.course.id})`)]
          : []),
        ...(basis.acknowledgement?.view
          ? [
              fact(
                "View",
                `\"${basis.acknowledgement.view.name}\" (${basis.acknowledgement.view.id}); Revision ${basis.acknowledgement.view.revisionID}`,
              ),
            ]
          : []),
        ...(basis.acknowledgement?.children.map((child, index) =>
          fact(`${titleCase(child.kind)} ${index + 1}`, learningBootstrapChildText(child)),
        ) ?? []),
        ...(basis.acknowledgement?.selectedRevisionID !== undefined
          ? [fact("Working selection", basis.acknowledgement.selectedRevisionID ?? "none")]
          : []),
        ...(basis.acknowledgement?.anchor
          ? [fact("Route anchor", learningBootstrapAnchorText(basis.acknowledgement.anchor))]
          : []),
        ...(basis.acknowledgement ? [fact("Correction", basis.acknowledgement.correction)] : []),
      ],
    )
  }
  if (basis.kind === "learner_response_evidence_result") {
    const semanticTerminal = basis.disposition === "semantic_terminal_v1"
    const candidate = basis.disposition === "candidate_v1"
    const committed = settlement.outcome === "applied" || settlement.outcome === "already_applied"
    if (
      semanticTerminal !== (basis.semanticOutcome !== undefined) ||
      candidate !== (basis.issuance !== undefined) ||
      candidate !== (basis.capabilityOutcome !== undefined) ||
      (!candidate && basis.permissionRequestID !== undefined) ||
      committed !== (basis.effect !== undefined) ||
      (semanticTerminal &&
        (basis.semanticOutcome === "already_applied"
          ? settlement.outcome !== "already_applied"
          : settlement.outcome !== "error" || settlement.code !== "semantic_conflict")) ||
      (basis.effect?.operation === "retract" && basis.effect.disposition !== "retracted") ||
      (basis.effect?.operation !== "retract" && basis.effect?.disposition === "retracted") ||
      ((basis.effect?.operation === "create" || basis.effect?.operation === "revise_from_tutor_interpretation") &&
        basis.effect.basis !== "tutor_interpretation") ||
      (basis.effect?.operation === "revise_from_learner_report" && basis.effect.basis !== "learner_report")
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      "update_learner_response_evidence",
      "Learner-response evidence settlement",
      resultSummary("Learner-response evidence", outcome),
      [
        ...failure,
        fact("Disposition", basis.disposition),
        ...(basis.issuance ? [fact("Issuance", basis.issuance)] : []),
        ...(basis.capabilityOutcome ? [fact("Capability", basis.capabilityOutcome)] : []),
        ...(basis.permissionRequestID ? [fact("Permission request", basis.permissionRequestID)] : []),
        ...(basis.effect
          ? [
              fact("Record", `${basis.effect.recordID} version ${basis.effect.version}`),
              fact("Revision", basis.effect.revisionID),
              fact(
                "Subject occurrence",
                `${basis.effect.subject.occurrenceID}; session ${basis.effect.subject.sessionID}; turn ${basis.effect.subject.turnID}; input ${basis.effect.subject.inputID}; source order ${basis.effect.subject.sourceOrder}`,
              ),
              fact(
                "Exact target",
                `${basis.effect.target.mapID}/${basis.effect.target.selectorID} -> ${basis.effect.target.courseID}/${basis.effect.target.viewID}/${basis.effect.target.revisionID}/${basis.effect.target.itemID}`,
              ),
              fact("Operation", basis.effect.operation),
              fact("Relation", basis.effect.relation),
              fact("Disclosure order", basis.effect.exposure),
              fact("Evidence basis", basis.effect.basis),
              fact("Record disposition", basis.effect.disposition),
              fact("Does not imply", "mastery, understanding, retention, or a required next action"),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "future_attention_result") {
    const semanticTerminal = basis.disposition === "semantic_terminal_v1"
    const candidate = basis.disposition === "candidate_v1"
    const projected = settlement.outcome !== "error"
    if (
      semanticTerminal !== (basis.semanticOutcome !== undefined) ||
      candidate !== (basis.issuance !== undefined) ||
      candidate !== (basis.capabilityOutcome !== undefined) ||
      (!candidate && basis.permissionRequestID !== undefined) ||
      projected !== (basis.effect !== undefined) ||
      (settlement.outcome === "no_change" && basis.effect?.effectID !== undefined) ||
      ((settlement.outcome === "applied" || settlement.outcome === "already_applied") &&
        basis.effect?.effectID === undefined) ||
      (semanticTerminal &&
        (basis.semanticOutcome === "already_applied"
          ? settlement.outcome !== "already_applied"
          : settlement.outcome !== "error" || settlement.code !== "semantic_conflict")) ||
      (basis.effect?.claim?.currentClaimState === "pending" &&
        basis.effect.claim.finalizationReceiptID !== undefined) ||
      (basis.effect?.claim?.currentClaimState !== undefined &&
        basis.effect.claim.currentClaimState !== "pending" &&
        basis.effect.claim.finalizationReceiptID === undefined)
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      FutureAttention.UPDATE_CAPABILITY,
      "Future-attention settlement",
      resultSummary("Future attention", outcome),
      [
        ...failure,
        fact("Disposition", basis.disposition),
        ...(basis.issuance ? [fact("Issuance", basis.issuance)] : []),
        ...(basis.capabilityOutcome ? [fact("Capability", basis.capabilityOutcome)] : []),
        ...(basis.permissionRequestID ? [fact("Permission request", basis.permissionRequestID)] : []),
        ...(basis.effect
          ? [
              ...basis.effect.changes.map((change, index) =>
                fact(
                  `Future-attention result ${index + 1}`,
                  change.operation === "replace"
                    ? `replacement ${change.outcome}; predecessor ${change.disposition}; corrected concern ${change.successorDisposition}; version ${change.successorVersion}`
                    : `${change.operation} ${change.outcome}; ${change.disposition}; version ${change.version}`,
                ),
              ),
              ...(basis.effect.claim
                ? [
                    fact("Claim at this physical settlement", basis.effect.claim.claimStateAtAdmission),
                    fact("Current claim observation", basis.effect.claim.currentClaimState),
                    ...(basis.effect.claim.finalizationReceiptID
                      ? [fact("Finalization", "append-only receipt recorded")]
                      : []),
                  ]
                : []),
              fact(
                "Observation rule",
                "Exact physical replay preserves this settlement cut; later current truth is a separate receipt/event, owner read, or new physical duplicate.",
              ),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "assignment_result") {
    const semanticTerminal = basis.disposition === "semantic_terminal_v1"
    const candidate = basis.disposition === "candidate_v1"
    const projected = settlement.outcome !== "error"
    if (
      semanticTerminal !== (basis.semanticOutcome !== undefined) ||
      candidate !== (basis.issuance !== undefined) ||
      candidate !== (basis.capabilityOutcome !== undefined) ||
      (!candidate && basis.permissionRequestID !== undefined) ||
      projected !== (basis.effect !== undefined) ||
      (settlement.outcome === "no_change" &&
        (basis.effect?.existingOutcome !== undefined ||
          basis.effect?.effectID !== undefined ||
          basis.effect?.changes.length !== 0 ||
          basis.effect?.intentResults.length === 0 ||
          basis.effect?.intentResults.some((result) => result.outcome !== "no_change"))) ||
      (settlement.outcome === "applied" &&
        (basis.effect?.existingOutcome !== undefined ||
          !basis.effect?.effectID ||
          basis.effect.changes.length === 0 ||
          basis.effect.intentResults.length === 0 ||
          basis.effect.intentResults.every((result) => result.outcome === "no_change"))) ||
      (settlement.outcome === "already_applied" &&
        (basis.effect?.existingOutcome === "applied"
          ? !basis.effect.effectID ||
            basis.effect.changes.length === 0 ||
            basis.effect.intentResults.length === 0 ||
            basis.effect.intentResults.every((result) => result.outcome === "no_change")
          : basis.effect?.existingOutcome === "no_change"
            ? basis.effect.effectID !== undefined ||
              basis.effect.changes.length !== 0 ||
              basis.effect.intentResults.length === 0 ||
              basis.effect.intentResults.some((result) => result.outcome !== "no_change")
            : true)) ||
      (semanticTerminal &&
        (basis.semanticOutcome === "already_applied"
          ? settlement.outcome !== "already_applied"
          : settlement.outcome !== "error" || settlement.code !== "semantic_conflict"))
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      Assignment.UPDATE_CAPABILITY,
      "Assignment settlement",
      assignmentResultSummary(basis, outcome),
      [
        ...failure,
        fact("Disposition", basis.disposition),
        ...(basis.issuance ? [fact("Issuance", basis.issuance)] : []),
        ...(basis.capabilityOutcome ? [fact("Capability", basis.capabilityOutcome)] : []),
        ...(basis.permissionRequestID ? [fact("Permission request", basis.permissionRequestID)] : []),
        ...(basis.effect
          ? [
              ...(basis.effect.existingOutcome
                ? [fact("Existing semantic outcome", basis.effect.existingOutcome)]
                : []),
              ...basis.effect.intentResults.map((result, index) =>
                fact(
                  `Assignment result ${index + 1}`,
                  result.outcome === "no_change"
                    ? `${result.operation}; ${result.assignmentID} unchanged at ${result.currentRevision.revisionID} v${result.currentRevision.version}`
                    : `${result.operation}; ${result.assignmentID} -> ${result.committedRevision.revisionID} v${result.committedRevision.version}${result.successorAssignmentID ? `; successor ${result.successorAssignmentID}` : ""}`,
                ),
              ),
              fact(
                "Does not imply",
                "activity, elapsed-work progress, mastery, learner commitment, a study plan, or an automatically selected Tutor move",
              ),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "learner_state_judgment_result") {
    const semanticTerminal = basis.disposition === "semantic_terminal_v1"
    const candidate = basis.disposition === "candidate_v1"
    const projected = settlement.outcome !== "error"
    const semanticOutcomeValid =
      !semanticTerminal ||
      (basis.semanticOutcome === "same_effect"
        ? settlement.outcome === "already_applied"
        : basis.semanticOutcome === "same_no_change"
          ? settlement.outcome === "no_change"
          : basis.semanticOutcome === "semantic_conflict" &&
            settlement.outcome === "error" &&
            settlement.code === "semantic_conflict")
    if (
      semanticTerminal !== (basis.semanticOutcome !== undefined) ||
      candidate !== (basis.issuance !== undefined) ||
      candidate !== (basis.capabilityOutcome !== undefined) ||
      (!candidate && basis.permissionRequestID !== undefined) ||
      projected !== (basis.effect !== undefined) ||
      !semanticOutcomeValid ||
      (settlement.outcome === "applied" &&
        (!basis.effect?.effectID ||
          !basis.effect.judgmentID ||
          !basis.effect.revisionID ||
          basis.effect.existingOutcome !== undefined)) ||
      (settlement.outcome === "already_applied" &&
        (basis.effect?.existingOutcome !== "applied" ||
          !basis.effect.effectID ||
          !basis.effect.judgmentID ||
          !basis.effect.revisionID)) ||
      (settlement.outcome === "no_change" &&
        (basis.effect?.existingOutcome !== "no_change" || basis.effect.effectID !== undefined))
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      LearnerStateJudgment.UPDATE_CAPABILITY,
      "Learner-state judgment settlement",
      resultSummary("Learner-state judgment", outcome),
      [
        ...failure,
        fact("Disposition", basis.disposition),
        ...(basis.issuance ? [fact("Issuance", basis.issuance)] : []),
        ...(basis.capabilityOutcome ? [fact("Capability", basis.capabilityOutcome)] : []),
        ...(basis.permissionRequestID ? [fact("Permission request", basis.permissionRequestID)] : []),
        ...(basis.effect
          ? [
              ...(basis.effect.existingOutcome
                ? [fact("Existing semantic outcome", basis.effect.existingOutcome)]
                : []),
              ...(basis.effect.judgmentID && basis.effect.operation && basis.effect.disposition
                ? [
                    fact(
                      "Exact learner-state revision",
                      `${basis.effect.judgmentID}/${basis.effect.revisionID} v${basis.effect.version}; ${basis.effect.operation}; ${basis.effect.disposition}`,
                    ),
                  ]
                : basis.effect.judgmentID
                  ? [
                      fact(
                        "Unchanged learner-state revision",
                        `${basis.effect.judgmentID}/${basis.effect.revisionID} v${basis.effect.version}`,
                      ),
                    ]
                : []),
              fact(
                "Epistemic status",
                "Fallible, source-bearing whole-judgment memory; not mastery certification, per-clause proof, activity, progress, or a required Tutor move.",
              ),
            ]
          : []),
      ],
    )
  }
  if (basis.kind === "advisory_plan_suggestion_result") {
    const semanticTerminal = basis.disposition === "semantic_terminal_v1"
    const candidate = basis.disposition === "candidate_v1"
    const projected = settlement.outcome !== "error"
    const semanticOutcomeValid =
      !semanticTerminal ||
      (basis.semanticOutcome === "same_effect"
        ? settlement.outcome === "already_applied"
        : basis.semanticOutcome === "same_no_change"
          ? settlement.outcome === "no_change"
          : basis.semanticOutcome === "semantic_conflict" &&
            settlement.outcome === "error" &&
            settlement.code === "semantic_conflict")
    if (
      semanticTerminal !== (basis.semanticOutcome !== undefined) ||
      candidate !== (basis.issuance !== undefined) ||
      candidate !== (basis.capabilityOutcome !== undefined) ||
      (!candidate && basis.permissionRequestID !== undefined) ||
      projected !== (basis.effect !== undefined) ||
      !semanticOutcomeValid ||
      (settlement.outcome === "applied" &&
        (!basis.effect?.effectID ||
          !basis.effect.receiptID ||
          basis.effect.existingOutcome !== undefined ||
          basis.effect.noChangeReason !== undefined ||
          basis.effect.intentResults.length === 0)) ||
      (settlement.outcome === "already_applied" &&
        (basis.effect?.existingOutcome !== "applied" ||
          !basis.effect.effectID ||
          !basis.effect.receiptID ||
          basis.effect.noChangeReason !== undefined ||
          basis.effect.intentResults.length === 0)) ||
      (settlement.outcome === "no_change" &&
        (basis.effect?.existingOutcome !== "no_change" ||
          !basis.effect.noChangeReason ||
          basis.effect.effectID !== undefined ||
          basis.effect.receiptID !== undefined ||
          basis.effect.intentResults.length === 0))
    ) {
      return undefined
    }
    return resultProjection(
      basis,
      AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
      "Advisory learning suggestion settlement",
      resultSummary("Advisory learning suggestion change set", outcome),
      [
        ...failure,
        fact("Disposition", basis.disposition),
        ...(basis.issuance ? [fact("Issuance", basis.issuance)] : []),
        ...(basis.capabilityOutcome ? [fact("Capability", basis.capabilityOutcome)] : []),
        ...(basis.permissionRequestID ? [fact("Permission request", basis.permissionRequestID)] : []),
        ...(basis.effect
          ? [
              ...(basis.effect.existingOutcome
                ? [fact("Existing semantic outcome", basis.effect.existingOutcome)]
                : []),
              ...(basis.effect.noChangeReason ? [fact("No-change reason", basis.effect.noChangeReason)] : []),
              ...(basis.effect.effectID ? [fact("Effect", basis.effect.effectID)] : []),
              ...(basis.effect.receiptID ? [fact("Receipt", basis.effect.receiptID)] : []),
              ...basis.effect.intentResults.map((item) =>
                fact(
                  `Suggestion result ${item.operationOrdinal + 1}`,
                  `${item.outcome}; ${item.operation}; ${item.suggestionID}/${item.revisionID} v${item.version}; ${item.disposition}${item.alternativeToRevision ? `; alternative to ${item.alternativeToRevision.suggestionID}/${item.alternativeToRevision.revisionID} v${item.alternativeToRevision.version}` : ""}`,
                ),
              ),
              fact(
                "Advisory status",
                "Fallible, source-bearing Tutor advice; not a schedule, learner commitment, adherence record, progress measure, mastery proof, or automatically selected next move.",
              ),
            ]
          : []),
      ],
    )
  }
  if (settlement.outcome !== "applied") return undefined
  return resultProjection(
    basis,
    "content_write",
    `File ${basis.operation} committed`,
    `The exact file was ${basis.operation === "create" ? "created" : "modified"} through the displayed authority.`,
    [
      fact("Anchor", basis.anchorPath),
      fact("Relative path", basis.relativePath),
      fact("Operation", basis.operation),
      fact("Bytes written", basis.byteLength),
      fact(
        "Authority",
        basis.authority.type === "one_shot"
          ? "one physical tool invocation; no durable mutation grant created"
          : `mutation grant version ${basis.authority.grantVersion}`,
      ),
    ],
  )
}

function learningBootstrapChildText(child: LearningBootstrapChild) {
  const identity = child.id ? `; effect ${child.id}` : ""
  if (child.kind === "route") {
    return `${child.outcome}: ${child.detail}; View ${child.viewID ?? "unavailable"}; Revision ${child.revisionID ?? "unavailable"}; authorship ${child.authorship ?? "unavailable"}${identity}`
  }
  if (child.kind === "selection") {
    return `${child.outcome}: ${child.detail}; selected Revision ${child.selectedRevisionID ?? "none"}${identity}`
  }
  if (child.kind === "material" && child.materialTarget) {
    return `${child.outcome}: ${child.detail}; ${learningBootstrapMaterialText(child.materialTarget)}${identity}`
  }
  return `${child.outcome}: ${child.detail}${identity}`
}

function futureAttentionOperationText(operation: FutureAttention.Operation) {
  if (operation.type === "create") {
    const target = operation.concern.target.endpoint
    return `create \"${operation.concern.purpose}\"; ${operation.concern.source.type}; target ${target.courseID}/${target.viewID}/${target.revisionID}/${target.itemID}; not before ${operation.concern.notBefore.sourceExpression}; service ${operation.concern.serviceTiming}`
  }
  if (operation.type === "replace") {
    const target = operation.concern.target.endpoint
    return `replace selected concern at version ${operation.expectedVersion}; ${operation.mutation.type}; successor ${operation.successorDisposition.type}; purpose \"${operation.concern.purpose}\"; target ${target.courseID}/${target.viewID}/${target.revisionID}/${target.itemID}; not before ${operation.concern.notBefore.sourceExpression}`
  }
  if (operation.type === "serve") {
    return `serve selected concern at version ${operation.expectedVersion} from ${operation.service.source.type}; rationale \"${operation.service.rationale}\"`
  }
  return `${operation.type} selected concern at version ${operation.expectedVersion}; ${operation.mutation.type}`
}

function learningBootstrapMaterialText(target: LearningBootstrapMaterialTarget) {
  if (target.type === "representation") {
    return `Representation Revision ${target.representationRevisionID}`
  }
  const attribution =
    target.attribution.type === "recorded"
      ? "recorded attribution"
      : `lineage correction ${target.attribution.memberID}`
  return `Artifact ${target.artifactID}; Revision ${target.revisionID}; ${attribution}${
    target.sourceAuthority ? `; ${learningBootstrapSourceAuthorityText(target.sourceAuthority)}` : ""
  }`
}

function learningBootstrapSourceAuthorityText(
  authority: NonNullable<Extract<LearningBootstrapMaterialTarget, { readonly type: "artifact" }>["sourceAuthority"]>,
) {
  const object = `root object ${authority.root.objectID} on volume ${authority.root.volumeSerial}`
  if (authority.kind === "content_root") {
    return `ContentRoot ${authority.contentRoot.contentRootID}; grant ${authority.contentRoot.grantEpisodeID} v${authority.contentRoot.grantVersion}; ${authority.canonicalPath}; ${object}`
  }
  if (authority.kind === "active_workspace") {
    return `active workspace ${authority.workspaceIdentity}; ${authority.canonicalPath}; ${object}`
  }
  return `one-operation grant ${authority.operationIdentity}; ${authority.canonicalPath}; ${object}`
}

function learningBootstrapAnchorText(anchor: NonNullable<LearningBootstrapAcknowledgement["anchor"]>) {
  const target = anchor.target
    ? `${anchor.target.courseID}/${anchor.target.viewID}/${anchor.target.revisionID}/${anchor.target.itemID}`
    : "none"
  const usability = anchor.usability.usable ? "usable" : `unusable: ${anchor.usability.cause}`
  return `${target}; ${usability}; head ${anchor.headID ?? "none"}`
}

function resultProjection(
  basis: SemanticPresentationV1.ResultBasis,
  capability: string,
  title: string,
  summary: string,
  facts: readonly Fact[],
): ResultProjection {
  const settlement = basis.settlement
  const outcome = resultOutcome(settlement)
  const durablySettled = outcome !== "outcome_unknown"
  return {
    phase: "result",
    capability,
    title,
    summary,
    facts,
    outcome,
    durablySettled,
    ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
  }
}

function resultOutcome(settlement: SemanticPresentationV1.ResultBasis["settlement"]) {
  if (settlement.outcome === "applied") return "committed" as const
  if (settlement.outcome === "already_applied") return "already_applied" as const
  if (settlement.outcome === "no_change") return "no_effect" as const
  return settlement.code === "outcome_unknown" ? ("outcome_unknown" as const) : ("failed" as const)
}

function resultSummary(title: string, outcome: ResultProjection["outcome"]) {
  if (outcome === "committed") return `${title} committed.`
  if (outcome === "already_applied") return `${title} was already applied; no duplicate effect was created.`
  if (outcome === "no_effect") return `${title} made no durable change.`
  if (outcome === "outcome_unknown") return `${title} has an unknown outcome; no success is claimed.`
  return `${title} failed; no success is claimed.`
}

function assignmentResultSummary(
  basis: Extract<SemanticPresentationV1.ResultBasis, { kind: "assignment_result" }>,
  outcome: ResultProjection["outcome"],
) {
  if (outcome === "already_applied" && basis.effect?.existingOutcome === "no_change") {
    return "The exact Assignment command was already settled as no change; no Assignment effect was created."
  }
  return resultSummary("Assignment records", outcome)
}

function goalV2MaterializedText(
  operation: Extract<
    SemanticPresentationV1.ProposalBasis,
    { kind: "learner_goals_v2_capability" }
  >["operations"][number],
) {
  const before = operation.before
    ? `from Goal version ${operation.before.version} “${operation.before.meaning.outcome}”`
    : "from no prior Goal"
  const after = `to Goal version ${operation.after.version} “${operation.after.meaning.outcome}”; ${goalV2MeaningText(operation.after.meaning)}`
  const replacement = operation.replacementTarget
    ? `; replacement target Goal version ${operation.replacementTarget.after.version} “${operation.replacementTarget.after.meaning.outcome}”`
    : ""
  return `${titleCase(operation.operation)}; ${operation.result === "changed" ? "change" : "no change"}; ${before}; ${after}${replacement}`
}

function goalV2ResultTitle(
  basis: Extract<SemanticPresentationV1.ResultBasis, { kind: "learner_goals_v2_result" }>,
  outcome: ResultProjection["outcome"],
) {
  if (outcome === "failed") return "Learner Goals not changed"
  if (outcome === "outcome_unknown") return "Learner Goal outcome unknown"
  if (outcome === "no_effect") return "Learning Goals unchanged"
  return basis.operations.filter((operation) => operation.result === "changed").length === 1
    ? "Updated learning Goal"
    : "Updated learning Goals"
}

function goalV2ResultSummary(
  basis: Extract<SemanticPresentationV1.ResultBasis, { kind: "learner_goals_v2_result" }>,
  outcome: ResultProjection["outcome"],
) {
  if (outcome === "failed" || outcome === "outcome_unknown") return resultSummary("Learner Goal update", outcome)
  if (outcome === "already_applied") {
    return "The exact Goal change set was already applied; no duplicate effect was created."
  }
  if (outcome === "no_effect") return "The exact Goal change set made no durable change."
  const unchanged = basis.operations.filter((operation) => operation.result === "no_change").length
  return `The displayed Goal changes committed${unchanged ? `; ${unchanged} remained unchanged` : ""}. The stored Goals remain correctable.`
}

function goalV2ResultText(
  operation: Extract<SemanticPresentationV1.ResultBasis, { kind: "learner_goals_v2_result" }>["operations"][number],
) {
  const replacement = operation.replacementTarget
    ? `; replacement ${operation.replacementTarget.type} Goal at version ${operation.replacementTarget.version}`
    : ""
  return `${titleCase(operation.operation)}; ${operation.result === "changed" ? "changed" : "no change"}; Goal version ${operation.version}; ${goalV2MeaningText(operation.meaning)}${replacement}`
}

function goalV2MeaningText(
  meaning:
    | Extract<
        SemanticPresentationV1.ProposalBasis,
        { kind: "learner_goals_v2_capability" }
      >["operations"][number]["after"]["meaning"]
    | Extract<SemanticPresentationV1.ResultBasis, { kind: "learner_goals_v2_result" }>["operations"][number]["meaning"],
) {
  const scope = meaning.scope.type === "learner_home" ? "LearnerHome" : meaning.scope.courseIDs.join(", ")
  return `outcome “${meaning.outcome}”; conditions ${meaning.conditions.length ? meaning.conditions.join("; ") : "none"}; scope ${scope}; target ${meaning.target}; lifecycle ${meaning.disposition}`
}

function goalResultTitle(
  basis: Extract<SemanticPresentationV1.ResultBasis, { kind: "learner_goals_result" }>,
  outcome: ResultProjection["outcome"],
) {
  if (outcome === "failed") return "Learner Goals not changed"
  if (outcome === "outcome_unknown") return "Learner Goal outcome unknown"
  if (outcome === "no_effect") return "Learning Goals unchanged"
  return basis.operations.filter((operation) => operation.result === "changed").length === 1
    ? "Updated learning Goal"
    : "Updated learning Goals"
}

function goalResultSummary(
  basis: Extract<SemanticPresentationV1.ResultBasis, { kind: "learner_goals_result" }>,
  outcome: ResultProjection["outcome"],
) {
  if (outcome === "failed" || outcome === "outcome_unknown") return resultSummary("Learner Goal update", outcome)
  if (outcome === "already_applied") {
    return "Every displayed Goal operation was already applied; no duplicate effect was created."
  }
  if (outcome === "no_effect") return "Every displayed Goal operation made no durable change."
  const unchanged = basis.operations.filter((operation) => operation.result === "no_change").length
  return `The displayed Goal operations committed${unchanged ? `; ${unchanged} remained unchanged` : ""}. The stored Goals remain correctable.`
}

function goalProposalText(operation: SemanticPresentationV1.GoalProposalOperation) {
  const lines = [
    `Operation: ${goalIntent(operation.resultIntent)}`,
    ...(operation.type === "create"
      ? goalMeaningLines(operation.meaning)
      : [
          `Current Goal version: ${operation.source.version}`,
          ...goalMeaningLines(operation.source.meaning, "Current "),
          ...goalMeaningLines(operation.meaning, "Proposed "),
        ]),
  ]
  if (operation.type === "update" && operation.supersessionTarget) {
    lines.push("Relation: the source Goal becomes superseded by the existing target Goal")
    lines.push(`Target Goal version: ${operation.supersessionTarget.version}`)
    lines.push(...goalMeaningLines(operation.supersessionTarget.meaning, "Target "))
  }
  if (operation.type === "replace") {
    lines.push(
      `Relation: the source Goal becomes superseded by ${operation.replacementTarget.type === "new" ? "a new" : "the existing"} replacement Goal`,
    )
    if (operation.replacementTarget.type === "existing") {
      lines.push(`Replacement Goal version: ${operation.replacementTarget.version}`)
    }
    lines.push(...goalMeaningLines(operation.replacementTarget.meaning, "Replacement "))
  }
  return lines.join("\n")
}

function goalResultText(operation: SemanticPresentationV1.GoalResultOperation) {
  const lines = [
    `Operation: ${titleCase(operation.operation)}`,
    `Result: ${operation.result === "changed" ? "changed" : "no change"}`,
    ...goalMeaningLines(operation.meaning),
  ]
  if (operation.replacementTarget) {
    lines.push(
      `Relation: the source Goal is superseded by ${operation.replacementTarget.type === "new" ? "a new" : "the existing"} replacement Goal`,
    )
    lines.push(...goalMeaningLines(operation.replacementTarget.meaning, "Replacement "))
  } else if (operation.supersessionTarget) {
    lines.push("Relation: the source Goal is superseded by the existing target Goal")
    lines.push(...goalMeaningLines(operation.supersessionTarget.meaning, "Target "))
  }
  return lines.join("\n")
}

function goalMeaningLines(meaning: SemanticPresentationV1.GoalProposalOperation["meaning"], prefix = "") {
  return [
    `${prefix}Outcome: ${meaning.outcome}`,
    `${prefix}Conditions: ${meaning.conditions.length ? meaning.conditions.join("; ") : "none"}`,
    `${prefix}Scope: ${goalScope(meaning.scope)}`,
    `${prefix}Target: ${goalTarget(meaning.target)}`,
    `${prefix}Lifecycle: ${meaning.disposition}`,
    `${prefix}Field bases: ${goalFieldBases(meaning.fieldBases)}`,
  ]
}

function goalScope(scope: SemanticPresentationV1.GoalProposalOperation["meaning"]["scope"]) {
  if (scope.type === "learner_home") return "the learner home"
  return scope.courses
    .map(
      (course) =>
        `"${course.courseTitle}" (${course.basis.type === "new" ? `new at Course version ${course.basis.expectedCourseVersion}` : "carried from the preceding Goal revision"}; ${
          course.availability.state === "available"
            ? `available as "${course.availability.title}"`
            : `unavailable: ${course.availability.cause}`
        })`,
    )
    .join(", ")
}

function goalTarget(target: SemanticPresentationV1.GoalProposalOperation["meaning"]["target"]) {
  if (target.type === "absent") return "none"
  if (target.type === "instant") return `${target.sourceExpression} (${target.normalized})`
  return `${target.sourceExpression} (${target.date} in ${target.timeZone})`
}

function goalFieldBases(bases: SemanticPresentationV1.GoalProposalOperation["meaning"]["fieldBases"]) {
  return (["outcome", "conditions", "scope", "target", "disposition"] as const)
    .map((field) => `${titleCase(field)} — ${fieldBasis(bases[field])}`)
    .join("; ")
}

function fieldBasis(basis: SemanticPresentationV1.GoalProposalOperation["meaning"]["fieldBases"]["outcome"]) {
  if (basis.type === "authored") return `authored from “${basis.sourceExcerpt}”`
  if (basis.type === "accepted") return "accepted in this confirmation"
  return "carried from the preceding Goal revision"
}

function goalIntent(intent: SemanticPresentationV1.GoalProposalOperation["resultIntent"]) {
  if (intent === "create_new_goal") return "create a new Goal"
  if (intent === "update_existing_goal") return "update an existing Goal"
  if (intent === "supersede_with_new_goal") return "supersede the source with a new replacement Goal"
  return "supersede the source with an existing Goal"
}

function bindingMatchesRequest(binding: SemanticPresentationV1.ToolBinding, request: PermissionRequest) {
  if (!request.tool) return false
  return (
    binding.sessionID === request.sessionID &&
    binding.messageID === request.tool.messageID &&
    binding.callID === request.tool.callID &&
    (binding.requestID === undefined || binding.requestID === request.id)
  )
}

function bindingMatchesPart(binding: SemanticPresentationV1.ToolBinding, part: CompletedToolPart) {
  return (
    binding.sessionID === part.sessionID &&
    binding.messageID === part.messageID &&
    binding.callID === part.callID &&
    (binding.partID === undefined || binding.partID === part.id)
  )
}

function courseLocatorFacts(locator: CourseLocator, prefix = ""): readonly Fact[] {
  return [
    fact(`${prefix}Course`, locatorValue(locator.course.title, locator.course.id, locator.course.showID)),
    fact(`${prefix}View`, locatorValue(locator.view.name, locator.view.id, locator.view.showID)),
    fact(
      `${prefix}Revision`,
      locatorValue(`#${locator.revision.number}`, locator.revision.id, locator.revision.showID),
    ),
    ...(locator.item
      ? [
          fact(
            `${prefix}Item`,
            locatorValue(
              `${locator.item.title} (position ${locator.item.position})`,
              locator.item.id,
              locator.item.showID,
            ),
          ),
        ]
      : []),
  ]
}

function locatorValue(readable: string, id: string, showID: boolean) {
  return showID ? `${readable} [${id}]` : readable
}

function validAnchorCurrent(current: NonNullable<RouteResult["current"]>) {
  if (current.target === "absent") return current.locator === undefined && current.staleCause === undefined
  if (!current.locator || current.locator.course.id !== current.courseID || !current.locator.item) return false
  if (current.target === "available") return current.staleCause === undefined
  return current.staleCause !== undefined
}

function validAnchorEffect(effect: NonNullable<RouteResult["effect"]>) {
  if (effect.target === "absent") return effect.locator === undefined
  return effect.locator?.course.id === effect.courseID && effect.locator.item !== undefined
}

function validRetainedTransition(transition: NonNullable<RetainedResult["effect"]>) {
  if (transition.state === "retracted") {
    return (
      transition.status === "retracted" &&
      transition.operativeInstruction === undefined &&
      transition.validUntilNormalized === undefined &&
      transition.boundaryTimeZone === undefined &&
      transition.boundaryUtcOffsetMinutes === undefined
    )
  }
  return (
    transition.status !== "retracted" &&
    Boolean(transition.operativeInstruction) &&
    Boolean(transition.validUntilNormalized) &&
    Boolean(transition.boundaryTimeZone) &&
    transition.boundaryUtcOffsetMinutes !== undefined &&
    Math.abs(transition.boundaryUtcOffsetMinutes) <= 14 * 60
  )
}

function utcOffset(minutes: number) {
  const sign = minutes < 0 ? "-" : "+"
  const value = Math.abs(minutes)
  return `${sign}${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
}

function fact(label: string, value: string | number): Fact {
  return { label, value: String(value) }
}

function defaultAuthorizationTargetMatches(authorization: DefaultV2AuthorizationBasis) {
  const target = authorization.command.target
  const selected = authorization.resolutionScope.selectedCourseID
  const selectedCandidates = authorization.resolutionScope.candidates.filter(
    (candidate) => candidate.courseID === selected,
  )
  const operation =
    authorization.from.kind === "absent" && authorization.to.kind === "course"
      ? "set"
      : authorization.from.kind === "course" && authorization.to.kind === "absent"
        ? "clear"
        : "change"
  if (
    authorization.command.expectedHeadID !== authorization.preferenceHeadID ||
    authorization.command.expectedVersion !== authorization.preferenceVersion ||
    !validDefaultV2Endpoint(authorization.from) ||
    !validDefaultV2Endpoint(authorization.to) ||
    authorization.operation !== operation ||
    selected !== (target?.courseID ?? null) ||
    (authorization.resolutionScope.coverage === "complete"
      ? authorization.resolutionScope.truncation !== undefined
      : !authorization.resolutionScope.truncation?.reason.trim()) ||
    (authorization.source.kind === "direct_request_v2" && authorization.resolutionScope.coverage !== "complete")
  ) {
    return false
  }
  if (!target) return authorization.to.kind === "absent" && selectedCandidates.length === 0
  if (
    selectedCandidates.length !== 1 ||
    selectedCandidates[0]!.courseVersion !== target.courseVersion ||
    authorization.to.kind !== "course" ||
    authorization.to.locator.courseID !== target.courseID ||
    authorization.to.locator.title.availability !== "recorded_v2" ||
    authorization.to.locator.title.value !== selectedCandidates[0]!.title ||
    authorization.to.locator.courseVersion.availability !== "recorded_v2" ||
    authorization.to.locator.courseVersion.value !== target.courseVersion ||
    authorization.to.locator.workingSelection.availability !== "recorded_v2"
  ) {
    return false
  }
  const selection = authorization.to.locator.workingSelection.value
  return (
    selection.revisionID === target.selectionRevisionID &&
    selection.selectionVersion === target.selectionVersion &&
    selection.viewID === target.viewID &&
    selection.viewVersion === target.viewVersion &&
    selection.revisionVersion === target.revisionVersion
  )
}

function validDefaultV3AgentAction(
  agentAction: DefaultV3AgentActionBasis,
  binding: SemanticPresentationV1.ToolBinding,
) {
  const targetCourseID = agentAction.command.action === "set" ? agentAction.command.courseID : null
  const provenance = agentAction.provenance
  const lineageValid =
    provenance.kind === "root"
      ? provenance.lineage.length === 0 && provenance.occurrenceID === provenance.causalRootOccurrenceID
      : provenance.lineage.length > 0 &&
        provenance.lineage.at(-1)?.childTurnID === provenance.turnID &&
        provenance.effectiveDelegatedCapability.identity === "set_default_course_preference" &&
        provenance.effectiveDelegatedCapability.version === 3 &&
        provenance.effectiveDelegatedCapability.projectionVersion === 2 &&
        provenance.effectiveDelegatedCapability.fingerprint ===
          provenance.lineage.at(-1)?.delegatedCapabilityFingerprint
  return (
    binding.partID !== undefined &&
    provenance.sessionID === binding.sessionID &&
    provenance.assistantMessageID === binding.messageID &&
    provenance.invocationPartID === binding.partID &&
    provenance.providerCallID === binding.callID &&
    provenance.capabilityIdentity === "set_default_course_preference" &&
    provenance.capabilityVersion === 3 &&
    lineageValid &&
    validDefaultV2Endpoint(agentAction.from) &&
    validDefaultV2Endpoint(agentAction.to) &&
    defaultOperation(agentAction.from, agentAction.to) === agentAction.operation &&
    (targetCourseID === null
      ? agentAction.to.kind === "absent"
      : agentAction.to.kind === "course" && agentAction.to.locator.courseID === targetCourseID)
  )
}

function validDefaultAcknowledgement(acknowledgement: DefaultAcknowledgement) {
  return (
    defaultOperation(acknowledgement.from, acknowledgement.to) === acknowledgement.operation &&
    (acknowledgement.schemaVersion === 2
      ? acknowledgement.agentActionVersion === 3 &&
        validDefaultV2Endpoint(acknowledgement.from) &&
        validDefaultV2Endpoint(acknowledgement.to)
      : acknowledgement.authorizationVersion === 1
        ? validDefaultV1Endpoint(acknowledgement.from) && validDefaultV1Endpoint(acknowledgement.to)
        : validDefaultV2Endpoint(acknowledgement.from) && validDefaultV2Endpoint(acknowledgement.to))
  )
}

function validDefaultV1Endpoint(endpoint: Extract<DefaultAcknowledgement, { authorizationVersion: 1 }>["from"]) {
  if (endpoint.kind === "absent") return true
  const locator = endpoint.locator
  return (
    locator.workingSelection.availability === "not_recorded_v1" ||
    validDefaultWorkingSelection(locator.workingSelection.value)
  )
}

function validDefaultV2Endpoint(endpoint: DefaultV2Endpoint) {
  if (endpoint.kind === "absent") return true
  return (
    endpoint.locator.title.availability === "recorded_v2" &&
    endpoint.locator.courseVersion.availability === "recorded_v2" &&
    endpoint.locator.workingSelection.availability === "recorded_v2" &&
    validDefaultWorkingSelection(endpoint.locator.workingSelection.value)
  )
}

function validDefaultWorkingSelection(selection: {
  readonly revisionID: string | null
  readonly selectionVersion: number
  readonly viewID: string | null
  readonly viewName: string | null
  readonly viewVersion: number | null
  readonly revisionVersion: number | null
}) {
  if (selection.revisionID === null) {
    return (
      selection.viewID === null &&
      selection.viewName === null &&
      selection.viewVersion === null &&
      selection.revisionVersion === null
    )
  }
  return (
    selection.viewID !== null &&
    selection.viewName !== null &&
    selection.viewVersion !== null &&
    selection.revisionVersion !== null
  )
}

function defaultOperation(from: DefaultEndpoint, to: DefaultEndpoint) {
  if (from.kind === "absent" && to.kind === "course") return "set"
  if (from.kind === "course" && to.kind === "absent") return "clear"
  return "change"
}

function defaultEndpointFacts(prefix: string, endpoint: DefaultEndpoint): readonly Fact[] {
  if (endpoint.kind === "absent") return [fact(prefix, "none")]
  const locator = endpoint.locator
  const title = locator.title.availability === "not_recorded_v1" ? "title not recorded" : `"${locator.title.value}"`
  const courseVersion =
    locator.courseVersion.availability === "not_recorded_v1"
      ? "Course version not recorded"
      : `Course version ${locator.courseVersion.value}`
  if (locator.workingSelection.availability === "not_recorded_v1") {
    return [
      fact(prefix, `${title}; ${locator.courseID}`),
      fact(`${prefix} versions`, `${courseVersion}; working selection not recorded`),
    ]
  }
  const selection = locator.workingSelection.value
  return [
    fact(prefix, `${title}; ${locator.courseID}`),
    fact(
      `${prefix} versions`,
      `${courseVersion}; selection ${selection.selectionVersion}; View ${selection.viewVersion ?? "none"}; Revision ${selection.revisionVersion ?? "none"}`,
    ),
  ]
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ")
}

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => same(value, right[index]))
    )
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && same(left[key], right[key]))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
