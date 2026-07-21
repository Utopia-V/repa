import { ArtifactSchema } from "@opencode-ai/core/artifact/schema"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { NonNegativeInt } from "@opencode-ai/core/schema"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
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

export const UpdateLearnerGoalsInput = Schema.Union([
  Schema.Struct({ authorizationBasis: Schema.Literal("learner_request"), operations: GoalOperationsInput }),
  Schema.Struct({ authorizationBasis: Schema.Literal("learner_acceptance"), operations: GoalOperationsInput }),
])

export type UpdateLearnerGoalsInput = typeof UpdateLearnerGoalsInput.Type

const decode = Schema.decodeUnknownSync(AcceptCourseViewRevisionInput)
const decodeRepresentation = Schema.decodeUnknownSync(RepresentationConvertInput)
const decodeDefault = Schema.decodeUnknownSync(SetDefaultCoursePreferenceInput)
const decodeAnchor = Schema.decodeUnknownSync(SetCourseRouteAnchorInput)
const decodeSteering = Schema.decodeUnknownSync(UpdateRetainedLearningSteeringInput)
const decodeGoals = Schema.decodeUnknownSync(UpdateLearnerGoalsInput)

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

export function normalizeGoals(input: unknown): UpdateLearnerGoalsInput {
  return decodeGoals(input)
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
  if (toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) return normalizeDefault(input)
  if (toolID === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY) return normalizeAnchor(input)
  if (toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) return normalizeSteering(input)
  if (toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) return normalizeGoals(input)
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

export function anchorCommand(input: SetCourseRouteAnchorInput): LearnerNavigation.RouteAnchorCommand {
  return { kind: "course_route_anchor", ...input }
}

export function retainedSteeringCommand(input: UpdateRetainedLearningSteeringInput): RetainedSteering.Command {
  return { ...input }
}

export function learnerGoalCommand(input: UpdateLearnerGoalsInput): LearnerGoal.Command {
  return { operations: input.operations }
}

export * as LearningCommandInput from "./input"
