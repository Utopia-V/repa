import { ArtifactSchema } from "@opencode-ai/core/artifact/schema"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { LearningCommand } from "@opencode-ai/core/learning-command"
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

const decode = Schema.decodeUnknownSync(AcceptCourseViewRevisionInput)
const decodeRepresentation = Schema.decodeUnknownSync(RepresentationConvertInput)
const decodeDefault = Schema.decodeUnknownSync(SetDefaultCoursePreferenceInput)
const decodeAnchor = Schema.decodeUnknownSync(SetCourseRouteAnchorInput)
const decodeSteering = Schema.decodeUnknownSync(UpdateRetainedLearningSteeringInput)

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

function normalizeBoundary(input: string) {
  const value = input.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
    value,
  )
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

export function retainedSteeringCommand(
  input: UpdateRetainedLearningSteeringInput,
): RetainedSteering.Command {
  return { ...input }
}

export * as LearningCommandInput from "./input"
