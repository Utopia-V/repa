export * as SemanticPresentation from "./semantic-presentation"

import { SemanticPresentationV1 } from "@opencode-ai/schema/semantic-presentation-v1"
import { Option, Schema } from "effect"
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
])

const consequentialResultTools = new Set([
  "accept_course_view_revision",
  "content_write",
  "representation.convert",
  "set_default_course_preference",
  "set_course_route_anchor",
  "update_retained_learning_steering",
  "update_learner_goals",
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
    commandVersion: basis.kind === "default_course_v3_result" ? 3 : basis.kind === "default_course_v2_result" ? 2 : 1,
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
