export * as LearningCommandPresentation from "./presentation"

import { Course } from "@opencode-ai/core/course"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"

type Capability =
  | typeof LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY
  | typeof LearningCommand.REPRESENTATION_CONVERT_CAPABILITY
  | typeof LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
  | typeof LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY
  | typeof LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY
  | typeof LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY

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
  return SemanticPresentation.result({
    kind: "learner_goals_result",
    ...common,
    ...("authorizationBasis" in settlement
      ? { authorizationBasis: settlement.authorizationBasis }
      : {}),
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
    status: current.usability.usable
      ? ("available" as const)
      : current.usability.cause,
    ...("title" in current.usability && current.usability.title
      ? { title: current.usability.title }
      : {}),
  }
}

function anchorCurrent(
  current: LearnerNavigation.AnchorProjection,
  locator?: Course.PresentationLocator,
) {
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
    ("effectID" in settlement &&
      (!presentation.effect || presentation.effect.id !== settlement.effectID)) ||
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
    settled.operation !== "replace" &&
    settled.disposition === "superseded" &&
    settled.replacementTarget === undefined
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
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]),
    )
  )
}
