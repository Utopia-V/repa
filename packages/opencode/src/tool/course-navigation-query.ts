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
])

const LearningNavigationQueryInput = Schema.Struct({
  action: Schema.Literal("current_default"),
})

export const CourseQueryTool = Tool.define<typeof CourseQueryInput, Record<string, unknown>, Course.Service>(
  COURSE_QUERY_TOOL_ID,
  Effect.gen(function* () {
    const courses = yield* Course.Service
    return {
      description:
        "Read Course-owner state. List one bounded page with an opaque scope-bound cursor, or get one exact Course by ID. A cursor continues that query but is not a frozen snapshot. This tool never changes learning state.",
      parameters: CourseQueryInput,
      execute: (input: Schema.Schema.Type<typeof CourseQueryInput>, context) => {
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
                    ...(result.cursor ? { cursor: result.cursor } : {}),
                  },
                  output: JSON.stringify(result, null, 2),
                }
              }),
            ),
          context.abort,
        ).pipe(Effect.orDie)
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
        "Read the exact current default-Course head and projection, including version, usability, and durable source when present. This tool never changes navigation or learning-command state.",
      parameters: LearningNavigationQueryInput,
      execute: (_input, context) =>
        abortable(navigation.currentDefault(), context.abort).pipe(
          Effect.map((current) => ({
            title: "Current default Course",
            metadata: { action: "current_default", headID: current.headID, version: current.version },
            output: JSON.stringify({ current }, null, 2),
          })),
          Effect.orDie,
        ),
    }
  }),
)

function abortable<A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) {
  if (signal.aborted) return waitForAbort(signal)
  return Effect.raceFirst(effect, waitForAbort(signal))
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
