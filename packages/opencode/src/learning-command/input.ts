import { ArtifactSchema } from "@opencode-ai/core/artifact/schema"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { NonNegativeInt } from "@opencode-ai/core/schema"
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

const decode = Schema.decodeUnknownSync(AcceptCourseViewRevisionInput)
const decodeRepresentation = Schema.decodeUnknownSync(RepresentationConvertInput)

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

export function normalizeCommand(toolID: string, input: unknown) {
  if (toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) return normalize(input)
  if (toolID === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY) return normalizeRepresentation(input)
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

export * as LearningCommandInput from "./input"
