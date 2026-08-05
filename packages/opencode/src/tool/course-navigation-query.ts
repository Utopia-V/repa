import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { waitForAbort } from "@opencode-ai/core/process"
import { NonNegativeInt, PositiveInt } from "@opencode-ai/core/schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import { learningContextReadResult } from "./learning-context-read"
import { Tool } from "./tool"

export const COURSE_QUERY_TOOL_ID = "course_query"
export const LEARNING_NAVIGATION_QUERY_TOOL_ID = "learning_navigation_query"
export const COURSE_NAVIGATION_QUERY_TOOL_IDS = [COURSE_QUERY_TOOL_ID, LEARNING_NAVIGATION_QUERY_TOOL_ID] as const

const CourseQueryInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("list"),
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
    cursor: Schema.optional(Schema.String),
    includeWithdrawn: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({
    action: Schema.Literal("get"),
    courseID: Course.CourseID,
  }),
  Schema.Struct({
    action: Schema.Literal("pinned_learning_context"),
    cutAssistantMessageID: SessionV1.MessageID,
    entryIndex: NonNegativeInt.check(Schema.isLessThanOrEqualTo(7)),
    start: Schema.optional(NonNegativeInt),
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
  }),
  Schema.Struct({
    action: Schema.Literal("list_views"),
    courseID: Course.CourseID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
    cursor: Schema.optional(Schema.String),
    includeWithdrawn: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({ action: Schema.Literal("get_view"), courseID: Course.CourseID, viewID: Course.ViewID }),
  Schema.Struct({
    action: Schema.Literal("list_revisions"),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
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
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
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
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
    cursor: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literals(["list_mapping_sources", "list_mapping_targets"]),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    revisionID: Course.RevisionID,
    groupID: Course.MappingGroupID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
    cursor: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literal("list_reuse_citations"),
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    revisionID: Course.RevisionID,
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
    cursor: Schema.optional(Schema.String),
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

const LearningNavigationQueryInput = Schema.Union([
  Schema.Struct({ action: Schema.Literal("current_default") }),
  Schema.Struct({ action: Schema.Literal("current_anchor"), courseID: Course.CourseID }),
  Schema.Struct({
    action: Schema.Literal("pinned_default_transition"),
    effectID: LearnerNavigation.DefaultEffectID,
  }),
  Schema.Struct({
    action: Schema.Literal("pinned_anchor_transition"),
    courseID: Course.CourseID,
    effectID: LearnerNavigation.AnchorEffectID,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const CourseQueryTool = Tool.define<
  typeof CourseQueryInput,
  Record<string, unknown>,
  Course.Service | Database.Service
>(
  COURSE_QUERY_TOOL_ID,
  Effect.gen(function* () {
    const courses = yield* Course.Service
    const database = yield* Database.Service
    return {
      description:
        "Read exact Course-owner state, including bounded View, Revision, item, mapping, and reuse-citation pages. pinned_learning_context expands a zero-based Course entry from one exact stored Gate 18 cut; it never retargets to a newer working Revision and labels a later selection as superseded. Every list or pinned range returns at most 64 records and truthful remainder; a fresh-query cursor is not a frozen snapshot. Results fail truthfully when the Gate 18 lazy-read byte allowance cannot carry a whole value. This tool never changes learning state.",
      parameters: CourseQueryInput,
      execute: (input: Schema.Schema.Type<typeof CourseQueryInput>, context) => {
        if (input.action === "pinned_learning_context") {
          return abortable(
            Effect.gen(function* () {
              const stored = yield* database.db.transaction((tx) =>
                LearningContext.readCut(tx, input.cutAssistantMessageID),
              )
              if (stored.type !== "available") {
                return learningContextReadResult({
                  title: "Pinned Course context",
                  metadata: {
                    action: input.action,
                    cutAssistantMessageID: input.cutAssistantMessageID,
                    entryIndex: input.entryIndex,
                    result: stored.type,
                  },
                  value: { result: stored },
                  itemCount: 0,
                })
              }
              const section = stored.cut.sections.find((value) => value.owner === "course")!
              const entry = section.entries[input.entryIndex]
              if (!entry || entry.kind !== "course") {
                return learningContextReadResult({
                  title: "Pinned Course context",
                  metadata: {
                    action: input.action,
                    cutAssistantMessageID: input.cutAssistantMessageID,
                    entryIndex: input.entryIndex,
                    result: "entry_not_found",
                  },
                  value: { result: { type: "entry_not_found" } },
                  itemCount: 0,
                })
              }
              const result = yield* courses.readLearningContextLocator({
                locator: entry.locator,
                ...(input.start === undefined ? {} : { start: input.start }),
                ...(input.limit === undefined ? {} : { limit: input.limit }),
              })
              return learningContextReadResult({
                title: "Pinned Course context",
                metadata: {
                  action: input.action,
                  cutAssistantMessageID: input.cutAssistantMessageID,
                  entryIndex: input.entryIndex,
                  result: result.type,
                  ...(result.type === "available" ? { relation: result.relation } : {}),
                },
                value: { result },
                itemCount: result.type === "available" ? (result.working?.range.returnedCount ?? 1) : 0,
              })
            }),
            context.abort,
          ).pipe(Effect.orDie)
        }
        if (input.action === "list") {
          return abortable(
            courses
              .listCourses({
                limit: input.limit ?? 64,
                ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
                ...(input.includeWithdrawn === undefined ? {} : { includeWithdrawn: input.includeWithdrawn }),
              })
              .pipe(
                Effect.map((page) => {
                  const result = { ...page, items: page.items.map(courseRead) }
                  return learningContextReadResult({
                    title: "Courses",
                    metadata: {
                      action: input.action,
                      count: result.items.length,
                      omitted: result.cursor !== undefined,
                      ...(result.cursor ? { cursor: result.cursor } : {}),
                    },
                    value: { ...result, omitted: result.cursor !== undefined },
                    itemCount: result.items.length,
                  })
                }),
              ),
            context.abort,
          ).pipe(Effect.orDie)
        }
        if (input.action === "get") {
          return abortable(
            courses.getCourse(input.courseID).pipe(
              Effect.map((course) =>
                learningContextReadResult({
                  title: course.title,
                  metadata: { action: input.action, courseID: course.id, stateVersion: course.stateVersion },
                  value: { course: courseRead(course) },
                  itemCount: 1,
                }),
              ),
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
        "Read the exact current default-Course projection or route-anchor head, or expand one pinned default/anchor transition by its exact effect identity. Pinned reads never retarget to the current head. Results fail truthfully when the Gate 18 lazy-read byte allowance cannot carry a whole value. This tool never changes navigation or learning-command state.",
      parameters: LearningNavigationQueryInput,
      execute: (input, context) => {
        if (input.action === "current_default") {
          return abortable(navigation.currentDefault(), context.abort).pipe(
            Effect.map((current) =>
              learningContextReadResult({
                title: "Current default Course",
                metadata: { action: input.action, headID: current.headID, version: current.version },
                value: { current },
                itemCount: 1,
              }),
            ),
            Effect.orDie,
          )
        }
        if (input.action === "pinned_default_transition") {
          return abortable(navigation.readDefaultTransition(input.effectID), context.abort).pipe(
            Effect.map((result) =>
              learningContextReadResult({
                title: "Pinned default-Course transition",
                metadata: { action: input.action, effectID: input.effectID, result: result.type },
                value: { result },
                itemCount: result.type === "available" ? 1 : 0,
              }),
            ),
            Effect.orDie,
          )
        }
        if (input.action === "pinned_anchor_transition") {
          return abortable(
            navigation.readAnchorTransition({ courseID: input.courseID, effectID: input.effectID }),
            context.abort,
          ).pipe(
            Effect.map((result) =>
              learningContextReadResult({
                title: "Pinned Course route-anchor transition",
                metadata: {
                  action: input.action,
                  courseID: input.courseID,
                  effectID: input.effectID,
                  result: result.type,
                },
                value: { result },
                itemCount: result.type === "available" ? 1 : 0,
              }),
            ),
            Effect.orDie,
          )
        }
        return abortable(navigation.currentAnchor(input.courseID), context.abort).pipe(
          Effect.map((current) =>
            learningContextReadResult({
              title: "Current Course route anchor",
              metadata: { action: input.action, headID: current.headID, version: current.version },
              value: { current },
              itemCount: 1,
            }),
          ),
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
    limit: input.limit ?? 64,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...("includeWithdrawn" in input && input.includeWithdrawn !== undefined
      ? { includeWithdrawn: input.includeWithdrawn as boolean }
      : {}),
  }
}

function exactRead<A, E, R>(effect: Effect.Effect<A, E, R>, action: string, signal: AbortSignal) {
  return abortable(effect, signal).pipe(
    Effect.map((value) =>
      learningContextReadResult({
        title: action.replaceAll("_", " "),
        metadata: { action },
        value: { value },
        itemCount: 1,
      }),
    ),
    Effect.orDie,
  )
}

function pageRead<A, E, R>(
  effect: Effect.Effect<Readonly<{ items: readonly A[]; cursor?: string }>, E, R>,
  action: string,
  signal: AbortSignal,
) {
  return abortable(effect, signal).pipe(
    Effect.map((page) =>
      learningContextReadResult({
        title: action.replaceAll("_", " "),
        metadata: {
          action,
          count: page.items.length,
          omitted: page.cursor !== undefined,
          ...(page.cursor ? { cursor: page.cursor } : {}),
        },
        value: { ...page, omitted: page.cursor !== undefined },
        itemCount: page.items.length,
      }),
    ),
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
