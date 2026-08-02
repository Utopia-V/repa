import { Course } from "@opencode-ai/core/course"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { waitForAbort } from "@opencode-ai/core/process"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import { Tool } from "./tool"

export const COURSE_QUERY_TOOL_ID = "course_query"
export const LEARNING_NAVIGATION_QUERY_TOOL_ID = "learning_navigation_query"
export const COURSE_NAVIGATION_QUERY_TOOL_IDS = [COURSE_QUERY_TOOL_ID, LEARNING_NAVIGATION_QUERY_TOOL_ID] as const

const CourseQueryInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("list"),
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
    cursor: Schema.optional(Schema.String),
    includeWithdrawn: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({
    action: Schema.Literal("get"),
    courseID: Course.CourseID,
  }),
  Schema.Struct({
    action: Schema.Literal("list_views"),
    courseID: Course.CourseID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
    cursor: Schema.optional(Schema.String),
    includeWithdrawn: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({ action: Schema.Literal("get_view"), courseID: Course.CourseID, viewID: Course.ViewID }),
  Schema.Struct({
    action: Schema.Literal("list_revisions"),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
    cursor: Schema.optional(Schema.String),
    includeWithdrawn: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({
    action: Schema.Literal("get_revision"),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    revisionID: Course.RevisionID,
  }),
  Schema.Struct({
    action: Schema.Literal("list_revision_items"),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    revisionID: Course.RevisionID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
    cursor: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literal("get_revision_transition"),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    revisionID: Course.RevisionID,
  }),
  Schema.Struct({
    action: Schema.Literal("list_mapping_groups"),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    revisionID: Course.RevisionID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
    cursor: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literals(["list_mapping_sources", "list_mapping_targets"]),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    revisionID: Course.RevisionID,
    groupID: Course.MappingGroupID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
    cursor: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literal("list_reuse_citations"),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    revisionID: Course.RevisionID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
    cursor: Schema.optional(Schema.String),
  }),
])

const LearningNavigationQueryInput = Schema.Union([
  Schema.Struct({ action: Schema.Literal("current_default") }),
  Schema.Struct({ action: Schema.Literal("current_anchor"), courseID: Course.CourseID }),
])

export const CourseQueryTool = Tool.define<typeof CourseQueryInput, Record<string, unknown>, Course.Service>(
  COURSE_QUERY_TOOL_ID,
  Effect.gen(function* () {
    const courses = yield* Course.Service
    return {
      description:
        "Read exact Course-owner state, including bounded View, Revision, item, mapping, and reuse-citation pages. Every list returns at most 100 records and an opaque scope-bound cursor when more were omitted; a cursor continues that query but is not a frozen snapshot. This tool never changes learning state.",
      parameters: CourseQueryInput,
      execute: (input: Schema.Schema.Type<typeof CourseQueryInput>, context) => {
        if (input.action === "list") {
          return abortable(
            courses
              .listCourses({
                ...(input.limit === undefined ? {} : { limit: input.limit }),
                ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
                ...(input.includeWithdrawn === undefined ? {} : { includeWithdrawn: input.includeWithdrawn }),
              })
              .pipe(
                Effect.map((page) => {
                  const result = { ...page, items: page.items.map(courseRead) }
                  return {
                    title: "Courses",
                    metadata: {
                      action: input.action,
                      count: result.items.length,
                      omitted: result.cursor !== undefined,
                      ...(result.cursor ? { cursor: result.cursor } : {}),
                    },
                    output: JSON.stringify({ ...result, omitted: result.cursor !== undefined }, null, 2),
                  }
                }),
              ),
            context.abort,
          ).pipe(Effect.orDie)
        }
        if (input.action === "get") {
          return abortable(
            courses.getCourse(input.courseID).pipe(
              Effect.map((course) => ({
                title: course.title,
                metadata: { action: input.action, courseID: course.id, stateVersion: course.stateVersion },
                output: JSON.stringify({ course: courseRead(course) }, null, 2),
              })),
            ),
            context.abort,
          ).pipe(Effect.orDie)
        }
        if (input.action === "get_view")
          return exactRead(courses.getView(input.courseID, input.viewID), input.action, context.abort)
        if (input.action === "get_revision")
          return exactRead(
            courses.getRevision(input.courseID, input.viewID, input.revisionID),
            input.action,
            context.abort,
          )
        if (input.action === "get_revision_transition")
          return exactRead(
            courses.getRevisionTransition(input.courseID, input.viewID, input.revisionID),
            input.action,
            context.abort,
          )
        if (input.action === "list_views")
          return pageRead(courses.listViews(input.courseID, pageOptions(input)), input.action, context.abort)
        if (input.action === "list_revisions")
          return pageRead(
            courses.listRevisions(input.courseID, input.viewID, pageOptions(input)),
            input.action,
            context.abort,
          )
        if (input.action === "list_revision_items")
          return pageRead(
            courses.listRevisionItems(input.courseID, input.viewID, input.revisionID, pageOptions(input)),
            input.action,
            context.abort,
          )
        if (input.action === "list_mapping_groups")
          return pageRead(
            courses.listMappingGroups(input.courseID, input.viewID, input.revisionID, pageOptions(input)),
            input.action,
            context.abort,
          )
        if (input.action === "list_mapping_sources")
          return pageRead(
            courses.listMappingSources(
              input.courseID,
              input.viewID,
              input.revisionID,
              input.groupID,
              pageOptions(input),
            ),
            input.action,
            context.abort,
          )
        if (input.action === "list_mapping_targets")
          return pageRead(
            courses.listMappingTargets(
              input.courseID,
              input.viewID,
              input.revisionID,
              input.groupID,
              pageOptions(input),
            ),
            input.action,
            context.abort,
          )
        if (input.action === "list_reuse_citations")
          return pageRead(
            courses.listReuseCitations(input.courseID, input.viewID, input.revisionID, pageOptions(input)),
            input.action,
            context.abort,
          )
        throw new Error(`Unknown Course query action ${input.action}`)
      },
    }
  }),
)

export const LearningNavigationQueryTool = Tool.define<
  typeof LearningNavigationQueryInput,
  Record<string, unknown>,
  LearnerNavigation.ReadService
>(
  LEARNING_NAVIGATION_QUERY_TOOL_ID,
  Effect.gen(function* () {
    const navigation = yield* LearnerNavigation.ReadService
    return {
      description:
        "Read the exact current default-Course projection or the exact route-anchor head for one Course, including version, usability, and durable source when present. This tool never changes navigation or learning-command state.",
      parameters: LearningNavigationQueryInput,
      execute: (input, context) => {
        if (input.action === "current_default") {
          return abortable(navigation.currentDefault(), context.abort).pipe(
            Effect.map((current) => ({
              title: "Current default Course",
              metadata: { action: input.action, headID: current.headID, version: current.version },
              output: JSON.stringify({ current }, null, 2),
            })),
            Effect.orDie,
          )
        }
        return abortable(navigation.currentAnchor(input.courseID), context.abort).pipe(
          Effect.map((current) => ({
            title: "Current Course route anchor",
            metadata: { action: input.action, headID: current.headID, version: current.version },
            output: JSON.stringify({ current }, null, 2),
          })),
          Effect.orDie,
        )
      },
    }
  }),
)

function abortable<A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) {
  if (signal.aborted) return waitForAbort(signal)
  return Effect.raceFirst(effect, waitForAbort(signal))
}

function pageOptions(input: { readonly limit?: number; readonly cursor?: string }) {
  return {
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...("includeWithdrawn" in input && input.includeWithdrawn !== undefined
      ? { includeWithdrawn: input.includeWithdrawn as boolean }
      : {}),
  }
}

function exactRead<A, E, R>(effect: Effect.Effect<A, E, R>, action: string, signal: AbortSignal) {
  return abortable(effect, signal).pipe(
    Effect.map((value) => ({
      title: action.replaceAll("_", " "),
      metadata: { action },
      output: JSON.stringify({ value }, null, 2),
    })),
    Effect.orDie,
  )
}

function pageRead<A, E, R>(
  effect: Effect.Effect<Readonly<{ items: readonly A[]; cursor?: string }>, E, R>,
  action: string,
  signal: AbortSignal,
) {
  return abortable(effect, signal).pipe(
    Effect.map((page) => ({
      title: action.replaceAll("_", " "),
      metadata: {
        action,
        count: page.items.length,
        omitted: page.cursor !== undefined,
        ...(page.cursor ? { cursor: page.cursor } : {}),
      },
      output: JSON.stringify({ ...page, omitted: page.cursor !== undefined }, null, 2),
    })),
    Effect.orDie,
  )
}

function courseRead(course: Course.CourseInfo) {
  return {
    id: course.id,
    title: course.title,
    disposition: course.withdrawalReason ? ("withdrawn" as const) : ("active" as const),
    stateVersion: course.stateVersion,
    withdrawalReason: course.withdrawalReason ?? null,
    workingSelection: {
      revisionID: course.selection.revisionID ?? null,
      version: course.selection.version,
    },
    timeCreated: course.timeCreated,
    timeUpdated: course.timeUpdated,
  }
}
