import { ArtifactSchema } from "@opencode-ai/core/artifact/schema"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { NonNegativeInt } from "@opencode-ai/core/schema"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Schema } from "effect"

export const AcceptCourseViewRevisionInput = Schema.Struct({
  courseID: Course.CourseID,
  revisionID: Course.RevisionID,
  expectedCourseVersion: NonNegativeInt,
  expectedSelectionRevisionID: Schema.NullOr(Course.RevisionID),
  expectedSelectionVersion: NonNegativeInt,
  expectedViewVersion: NonNegativeInt,
  expectedRevisionVersion: NonNegativeInt,
})

export type AcceptCourseViewRevisionInput = typeof AcceptCourseViewRevisionInput.Type

export const RepresentationConvertInput = Schema.Struct({
  effectiveArtifactID: ArtifactSchema.ArtifactID,
  sourceRevisionID: ArtifactSchema.RevisionID,
  contentRootID: ContentRoot.ContentRootID,
  relativePath: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_096)),
})

export type RepresentationConvertInput = typeof RepresentationConvertInput.Type

const DefaultCourseTargetInput = Schema.Struct({
  courseID: Course.CourseID,
  courseVersion: NonNegativeInt,
  selectionRevisionID: Schema.NullOr(Course.RevisionID),
  selectionVersion: NonNegativeInt,
  viewID: Schema.NullOr(Course.ViewID),
  viewVersion: Schema.NullOr(NonNegativeInt),
  revisionVersion: Schema.NullOr(NonNegativeInt),
})

export const SetDefaultCoursePreferenceInput = Schema.Struct({
  expectedHeadID: Schema.NullOr(LearnerNavigation.DefaultEffectID),
  expectedVersion: NonNegativeInt,
  target: Schema.NullOr(DefaultCourseTargetInput),
})

export type SetDefaultCoursePreferenceInput = typeof SetDefaultCoursePreferenceInput.Type

const DefaultCourseResolutionCandidateInput = Schema.Struct({
  courseID: Course.CourseID,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024)),
  courseVersion: NonNegativeInt,
})

const DefaultCourseResolutionScopeInput = Schema.Union([
  Schema.Struct({
    coverage: Schema.Literal("complete"),
    candidates: Schema.Array(DefaultCourseResolutionCandidateInput).check(Schema.isMaxLength(100)),
    selectedCourseID: Schema.NullOr(Course.CourseID),
  }),
  Schema.Struct({
    coverage: Schema.Literal("explicitly_truncated"),
    candidates: Schema.Array(DefaultCourseResolutionCandidateInput).check(Schema.isMaxLength(100)),
    selectedCourseID: Schema.NullOr(Course.CourseID),
    truncation: Schema.Struct({
      reason: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024)),
      omittedCount: Schema.optional(NonNegativeInt),
    }),
  }),
])

const DefaultCourseSourceExcerpt = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024))
const DefaultCourseProposalFingerprint = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))

export const ProposeDefaultCoursePreferenceInput = Schema.Struct({
  expectedHeadID: Schema.NullOr(LearnerNavigation.DefaultEffectID),
  expectedVersion: NonNegativeInt,
  target: Schema.NullOr(DefaultCourseTargetInput),
  resolutionScope: DefaultCourseResolutionScopeInput,
})

export type ProposeDefaultCoursePreferenceInput = typeof ProposeDefaultCoursePreferenceInput.Type

export const SetDefaultCoursePreferenceV2Input = Schema.Union([
  Schema.Struct({
    authorization: Schema.Struct({
      type: Schema.Literal("direct_request_v2"),
      sourceExcerpt: DefaultCourseSourceExcerpt,
      resolutionScope: DefaultCourseResolutionScopeInput,
    }),
    expectedHeadID: Schema.NullOr(LearnerNavigation.DefaultEffectID),
    expectedVersion: NonNegativeInt,
    target: Schema.NullOr(DefaultCourseTargetInput),
  }),
  Schema.Struct({
    authorization: Schema.Struct({
      type: Schema.Literal("accepted_proposal_v2"),
      sourceExcerpt: DefaultCourseSourceExcerpt,
      presentedAssistantMessageID: SessionV1.MessageID,
      presentedPartID: SessionV1.PartID,
      emissionOrdinal: NonNegativeInt,
      proposalFingerprint: DefaultCourseProposalFingerprint,
      selection: Schema.Literals(["sole_presented", "explicit_reference"]),
    }),
  }),
])

export type SetDefaultCoursePreferenceV2Input = typeof SetDefaultCoursePreferenceV2Input.Type

export const SetDefaultCoursePreferenceV3Input = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("set"),
    courseID: Course.CourseID,
  }),
  Schema.Struct({
    action: Schema.Literal("clear"),
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export type SetDefaultCoursePreferenceV3Input = typeof SetDefaultCoursePreferenceV3Input.Type

const RouteAnchorTargetInput = Schema.Struct({
  viewID: Course.ViewID,
  revisionID: Course.RevisionID,
  itemID: Course.ItemID,
  courseVersion: NonNegativeInt,
  selectionVersion: NonNegativeInt,
  viewVersion: NonNegativeInt,
  revisionVersion: NonNegativeInt,
})

export const SetCourseRouteAnchorInput = Schema.Struct({
  courseID: Course.CourseID,
  expectedHeadID: Schema.NullOr(LearnerNavigation.AnchorEffectID),
  expectedVersion: NonNegativeInt,
  target: Schema.NullOr(RouteAnchorTargetInput),
})

export type SetCourseRouteAnchorInput = typeof SetCourseRouteAnchorInput.Type

const SteeringText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048))
const SteeringSourceExcerpt = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024))
const SteeringReason = Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024)))

export const UpdateRetainedLearningSteeringInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("create"),
    sourceExcerpt: SteeringSourceExcerpt,
    operativeInstruction: SteeringText,
    learnerReason: SteeringReason,
    validUntil: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  }),
  Schema.Struct({
    action: Schema.Literal("replace"),
    policyID: RetainedSteering.PolicyID,
    expectedHeadID: RetainedSteering.TransitionID,
    expectedVersion: NonNegativeInt,
    sourceExcerpt: SteeringSourceExcerpt,
    operativeInstruction: SteeringText,
    learnerReason: SteeringReason,
    validUntil: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  }),
  Schema.Struct({
    action: Schema.Literal("retract"),
    policyID: RetainedSteering.PolicyID,
    expectedHeadID: RetainedSteering.TransitionID,
    expectedVersion: NonNegativeInt,
    sourceExcerpt: SteeringSourceExcerpt,
    learnerReason: SteeringReason,
  }),
])

export type UpdateRetainedLearningSteeringInput = typeof UpdateRetainedLearningSteeringInput.Type

const GoalOutcome = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(LearnerGoal.MAX_OUTCOME_BYTES))
const GoalCondition = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(LearnerGoal.MAX_CONDITION_BYTES))
const GoalSourceExcerpt = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(LearnerGoal.MAX_SOURCE_EXCERPT_BYTES),
)

const GoalFieldBasisInput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("authored"), sourceExcerpt: GoalSourceExcerpt }),
  Schema.Struct({ type: Schema.Literal("accepted") }),
  Schema.Struct({ type: Schema.Literal("carried"), predecessorRevisionID: LearnerGoal.RevisionID }),
])

const GoalFieldBasesInput = Schema.Struct({
  outcome: GoalFieldBasisInput,
  conditions: GoalFieldBasisInput,
  scope: GoalFieldBasisInput,
  target: GoalFieldBasisInput,
  disposition: GoalFieldBasisInput,
})

const GoalCourseMembershipInput = Schema.Struct({
  courseID: Course.CourseID,
  basis: Schema.Union([
    Schema.Struct({ type: Schema.Literal("new"), expectedCourseVersion: NonNegativeInt }),
    Schema.Struct({ type: Schema.Literal("carried"), predecessorRevisionID: LearnerGoal.RevisionID }),
  ]),
})

const GoalScopeInput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("learner_home") }),
  Schema.Struct({
    type: Schema.Literal("courses"),
    courses: Schema.Array(GoalCourseMembershipInput).check(Schema.isLengthBetween(1, LearnerGoal.MAX_COURSES)),
  }),
])

const GoalTargetInput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({
    type: Schema.Literal("instant"),
    instant: Schema.Number,
    sourceExpression: GoalSourceExcerpt,
    normalized: GoalSourceExcerpt,
    utcOffsetMinutes: Schema.Number,
    normalizationBasis: Schema.Literal("explicit_offset"),
  }),
  Schema.Struct({
    type: Schema.Literal("local_date"),
    date: GoalSourceExcerpt,
    timeZone: GoalSourceExcerpt,
    sourceExpression: GoalSourceExcerpt,
    normalizationBasis: Schema.Literals(["explicit_date", "source_temporal_context"]),
  }),
])

const GoalSemanticSnapshotInput = Schema.Struct({
  outcome: GoalOutcome,
  conditions: Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS)),
  scope: GoalScopeInput,
  target: GoalTargetInput,
  fieldBases: GoalFieldBasesInput,
})

const GoalNonSupersededDispositionInput = Schema.Literals(["active", "achieved", "abandoned"])
const GoalUpdateDispositionInput = Schema.Union([
  Schema.Struct({ type: GoalNonSupersededDispositionInput }),
  Schema.Struct({
    type: Schema.Literal("superseded"),
    targetGoalID: LearnerGoal.GoalID,
    targetRevisionID: LearnerGoal.RevisionID,
  }),
])

const GoalOperationInput = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("create"),
    snapshot: GoalSemanticSnapshotInput,
    disposition: GoalNonSupersededDispositionInput,
  }),
  Schema.Struct({
    type: Schema.Literal("update"),
    goalID: LearnerGoal.GoalID,
    expectedHeadID: LearnerGoal.RevisionID,
    expectedVersion: NonNegativeInt,
    snapshot: GoalSemanticSnapshotInput,
    disposition: GoalUpdateDispositionInput,
  }),
  Schema.Struct({
    type: Schema.Literal("replace"),
    goalID: LearnerGoal.GoalID,
    expectedHeadID: LearnerGoal.RevisionID,
    expectedVersion: NonNegativeInt,
    snapshot: GoalSemanticSnapshotInput,
    target: Schema.Union([
      Schema.Struct({
        type: Schema.Literal("existing"),
        goalID: LearnerGoal.GoalID,
        revisionID: LearnerGoal.RevisionID,
        version: NonNegativeInt,
      }),
      Schema.Struct({
        type: Schema.Literal("new"),
        snapshot: GoalSemanticSnapshotInput,
        disposition: GoalNonSupersededDispositionInput,
      }),
    ]),
  }),
])

const GoalOperationsInput = Schema.Array(GoalOperationInput).check(
  Schema.isLengthBetween(1, LearnerGoal.MAX_OPERATIONS),
)

export const LegacyUpdateLearnerGoalsInput = Schema.Union([
  Schema.Struct({ authorizationBasis: Schema.Literal("learner_request"), operations: GoalOperationsInput }),
  Schema.Struct({ authorizationBasis: Schema.Literal("learner_acceptance"), operations: GoalOperationsInput }),
])

export type LegacyUpdateLearnerGoalsInput = typeof LegacyUpdateLearnerGoalsInput.Type

const GoalTimeZoneIntentV2 = Schema.Union([
  Schema.Struct({ type: Schema.Literal("source") }),
  Schema.Struct({
    type: Schema.Literal("iana"),
    name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  }),
  Schema.Struct({
    type: Schema.Literal("fixed_offset"),
    offsetMinutes: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(-840),
      Schema.isLessThanOrEqualTo(840),
    ),
  }),
])

const GoalTargetIntentV2 = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({
    type: Schema.Literal("instant"),
    localDateTime: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/)),
    timeZone: GoalTimeZoneIntentV2,
  }),
  Schema.Struct({
    type: Schema.Literal("local_date"),
    date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
    timeZone: GoalTimeZoneIntentV2,
  }),
])

const GoalScopeIntentV2 = Schema.Union([
  Schema.Struct({ type: Schema.Literal("learner_home") }),
  Schema.Struct({
    type: Schema.Literal("courses"),
    courseIDs: Schema.Array(Course.CourseID).check(Schema.isLengthBetween(1, LearnerGoal.MAX_COURSES)),
  }),
])

const GoalDispositionV2 = Schema.Literals(["active", "achieved", "abandoned"])

const GoalPatchV2 = Schema.Struct({
  outcome: Schema.optional(GoalOutcome),
  conditions: Schema.optional(Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS))),
  scope: Schema.optional(GoalScopeIntentV2),
  target: Schema.optional(GoalTargetIntentV2),
  disposition: Schema.optional(GoalDispositionV2),
})

const GoalCreateOperationV2 = Schema.Struct({
  type: Schema.Literal("create"),
  outcome: GoalOutcome,
  conditions: Schema.optional(Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS))),
  scope: Schema.optional(GoalScopeIntentV2),
  target: Schema.optional(GoalTargetIntentV2),
  disposition: Schema.optional(GoalDispositionV2),
})

const GoalUpdateOperationV2 = Schema.Struct({
  type: Schema.Literal("update"),
  goalID: LearnerGoal.GoalID,
  headRevisionID: LearnerGoal.RevisionID,
  patch: GoalPatchV2,
})

const GoalReplaceOperationV2 = Schema.Struct({
  type: Schema.Literal("replace"),
  goalID: LearnerGoal.GoalID,
  headRevisionID: LearnerGoal.RevisionID,
  patch: Schema.optional(
    Schema.Struct({
      outcome: Schema.optional(GoalOutcome),
      conditions: Schema.optional(Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS))),
      scope: Schema.optional(GoalScopeIntentV2),
      target: Schema.optional(GoalTargetIntentV2),
    }),
  ),
  target: Schema.Union([
    Schema.Struct({
      type: Schema.Literal("existing"),
      goalID: LearnerGoal.GoalID,
      headRevisionID: LearnerGoal.RevisionID,
    }),
    Schema.Struct({
      type: Schema.Literal("new"),
      outcome: GoalOutcome,
      conditions: Schema.optional(Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS))),
      scope: Schema.optional(GoalScopeIntentV2),
      target: Schema.optional(GoalTargetIntentV2),
      disposition: Schema.optional(GoalDispositionV2),
    }),
  ]),
})

export const UpdateLearnerGoalsInput = Schema.Struct({
  operations: Schema.Array(Schema.Union([GoalCreateOperationV2, GoalUpdateOperationV2, GoalReplaceOperationV2])).check(
    Schema.isLengthBetween(1, LearnerGoal.MAX_OPERATIONS),
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export type UpdateLearnerGoalsInput = typeof UpdateLearnerGoalsInput.Type

const decode = Schema.decodeUnknownSync(AcceptCourseViewRevisionInput)
const decodeRepresentation = Schema.decodeUnknownSync(RepresentationConvertInput)
const decodeDefault = Schema.decodeUnknownSync(SetDefaultCoursePreferenceInput)
const decodeDefaultProposal = Schema.decodeUnknownSync(ProposeDefaultCoursePreferenceInput)
const decodeDefaultV2 = Schema.decodeUnknownSync(SetDefaultCoursePreferenceV2Input)
const decodeDefaultV3 = Schema.decodeUnknownSync(SetDefaultCoursePreferenceV3Input)
const decodeAnchor = Schema.decodeUnknownSync(SetCourseRouteAnchorInput)
const decodeSteering = Schema.decodeUnknownSync(UpdateRetainedLearningSteeringInput)
const decodeLegacyGoals = Schema.decodeUnknownSync(LegacyUpdateLearnerGoalsInput)
const decodeGoalsV2 = Schema.decodeUnknownSync(UpdateLearnerGoalsInput)

export function normalize(input: unknown): AcceptCourseViewRevisionInput {
  const value = decode(input)
  return {
    courseID: value.courseID,
    revisionID: value.revisionID,
    expectedCourseVersion: value.expectedCourseVersion,
    expectedSelectionRevisionID: value.expectedSelectionRevisionID,
    expectedSelectionVersion: value.expectedSelectionVersion,
    expectedViewVersion: value.expectedViewVersion,
    expectedRevisionVersion: value.expectedRevisionVersion,
  }
}

export function normalizeRepresentation(input: unknown): RepresentationConvertInput {
  const value = decodeRepresentation(input)
  return {
    effectiveArtifactID: value.effectiveArtifactID,
    sourceRevisionID: value.sourceRevisionID,
    contentRootID: value.contentRootID,
    relativePath: value.relativePath.replaceAll("/", "\\"),
  }
}

export function normalizeDefault(input: unknown): SetDefaultCoursePreferenceInput {
  const value = decodeDefault(input)
  return {
    expectedHeadID: value.expectedHeadID,
    expectedVersion: value.expectedVersion,
    target: value.target ? { ...value.target } : null,
  }
}

export function normalizeDefaultProposal(input: unknown): ProposeDefaultCoursePreferenceInput {
  const value = decodeDefaultProposal(input)
  return {
    expectedHeadID: value.expectedHeadID,
    expectedVersion: value.expectedVersion,
    target: value.target ? { ...value.target } : null,
    resolutionScope: normalizeDefaultResolutionScope(value.resolutionScope),
  }
}

export function normalizeDefaultV2(input: unknown): SetDefaultCoursePreferenceV2Input {
  const value = decodeDefaultV2(input)
  if (!("expectedHeadID" in value)) {
    return {
      authorization: {
        ...value.authorization,
        sourceExcerpt: value.authorization.sourceExcerpt.trim(),
      },
    }
  }
  return {
    authorization: {
      type: value.authorization.type,
      sourceExcerpt: value.authorization.sourceExcerpt.trim(),
      resolutionScope: normalizeDefaultResolutionScope(value.authorization.resolutionScope),
    },
    expectedHeadID: value.expectedHeadID,
    expectedVersion: value.expectedVersion,
    target: value.target ? { ...value.target } : null,
  }
}

export function normalizeDefaultV3(input: unknown): SetDefaultCoursePreferenceV3Input {
  const value = decodeDefaultV3(input)
  return value.action === "set" ? { action: value.action, courseID: value.courseID } : { action: value.action }
}

export function normalizeAnchor(input: unknown): SetCourseRouteAnchorInput {
  const value = decodeAnchor(input)
  return {
    courseID: value.courseID,
    expectedHeadID: value.expectedHeadID,
    expectedVersion: value.expectedVersion,
    target: value.target ? { ...value.target } : null,
  }
}

export function normalizeSteering(input: unknown): UpdateRetainedLearningSteeringInput {
  const value = decodeSteering(input)
  if (value.action === "retract") return { ...value }
  return { ...value, validUntil: normalizeBoundary(value.validUntil) }
}

export function normalizeLegacyGoals(input: unknown): LegacyUpdateLearnerGoalsInput {
  return decodeLegacyGoals(input)
}

export function normalizeGoalsV2(input: unknown): UpdateLearnerGoalsInput {
  LearningCommand.canonicalizeCommandV2(input as LearnerGoal.CommandV2)
  return decodeGoalsV2(input)
}

function normalizeBoundary(input: string) {
  const value = input.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match || !Number.isSafeInteger(Date.parse(value))) return value
  const milliseconds = (match[7] ?? "0").padEnd(3, "0")
  const offset = match[8] === "Z" ? "+00:00" : match[8]
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${milliseconds}${offset}`
}

export function normalizeCommand(toolID: string, input: unknown) {
  if (toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) return normalize(input)
  if (toolID === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY) return normalizeRepresentation(input)
  if (toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) return normalizeDefaultV3(input)
  if (toolID === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY) return normalizeAnchor(input)
  if (toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) return normalizeSteering(input)
  if (toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) return normalizeGoalsV2(input)
  throw new Error(`Unknown reserved learning command ${toolID}`)
}

export function command(input: AcceptCourseViewRevisionInput): Course.SelectionAcceptanceInput {
  return {
    courseID: input.courseID,
    revisionID: input.revisionID,
    expectedCourseVersion: input.expectedCourseVersion,
    expectedSelectionRevisionID: input.expectedSelectionRevisionID ?? undefined,
    expectedSelectionVersion: input.expectedSelectionVersion,
    expectedViewVersion: input.expectedViewVersion,
    expectedRevisionVersion: input.expectedRevisionVersion,
  }
}

export function defaultCommand(input: SetDefaultCoursePreferenceInput): LearnerNavigation.DefaultCourseCommand {
  return { kind: "default_course_preference", ...input }
}

export function defaultProposalCommand(
  input: ProposeDefaultCoursePreferenceInput,
): LearnerNavigation.DefaultCourseCommand {
  return {
    kind: "default_course_preference",
    expectedHeadID: input.expectedHeadID,
    expectedVersion: input.expectedVersion,
    target: input.target,
  }
}

export function directDefaultV2Command(
  input: Extract<SetDefaultCoursePreferenceV2Input, { readonly authorization: { readonly type: "direct_request_v2" } }>,
): LearnerNavigation.DefaultCourseCommand {
  return {
    kind: "default_course_preference",
    expectedHeadID: input.expectedHeadID,
    expectedVersion: input.expectedVersion,
    target: input.target,
  }
}

export function anchorCommand(input: SetCourseRouteAnchorInput): LearnerNavigation.RouteAnchorCommand {
  return { kind: "course_route_anchor", ...input }
}

export function retainedSteeringCommand(input: UpdateRetainedLearningSteeringInput): RetainedSteering.Command {
  return { ...input }
}

export function learnerGoalCommand(input: LegacyUpdateLearnerGoalsInput): LearnerGoal.Command {
  return { operations: input.operations }
}

function normalizeDefaultResolutionScope(
  input: ProposeDefaultCoursePreferenceInput["resolutionScope"],
): ProposeDefaultCoursePreferenceInput["resolutionScope"] {
  const candidates = input.candidates.map((candidate) => ({
    ...candidate,
    title: candidate.title.trim(),
  }))
  if (input.coverage === "complete") {
    return { coverage: input.coverage, candidates, selectedCourseID: input.selectedCourseID }
  }
  return {
    coverage: input.coverage,
    candidates,
    selectedCourseID: input.selectedCourseID,
    truncation: {
      reason: input.truncation.reason.trim(),
      ...(input.truncation.omittedCount === undefined ? {} : { omittedCount: input.truncation.omittedCount }),
    },
  }
}

export * as LearningCommandInput from "./input"
