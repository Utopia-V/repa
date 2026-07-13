import type { Database } from "bun:sqlite"
import { tool } from "ai"
import { z } from "zod"
import {
  ADVANCE_COURSE_ROUTE_TOOL,
  CREATE_PROVISIONAL_COURSE_TOOL,
  durableCourseToolOutcome,
  executeActiveCourseInspection,
  executeCourseRouteAdvance,
  executeCourseRouteReanchor,
  executeCurrentCourseMaterialRead,
  executeMarkdownCourseRealignment,
  executeMarkdownCourseRegistration,
  executeProvisionalCourseCreation,
  executeProvisionalCourseRevision,
  INSPECT_ACTIVE_COURSE_VIEW_TOOL,
  REALIGN_MARKDOWN_COURSE_TOOL,
  READ_CURRENT_COURSE_MATERIAL_TOOL,
  REGISTER_MARKDOWN_COURSE_TOOL,
  REVISE_PROVISIONAL_COURSE_TOOL,
  SET_COURSE_ROUTE_ANCHOR_TOOL,
} from "../learning/curriculum/course-tool-execution"
import {
  ADDRESS_FUTURE_ATTENTION_TOOL,
  CREATE_FUTURE_ATTENTION_TOOL,
  DISMISS_FUTURE_ATTENTION_TOOL,
  INSPECT_RECENT_FUTURE_ATTENTION_TOOL,
  READ_FUTURE_ATTENTION_SOURCE_TOOL,
  REOPEN_FUTURE_ATTENTION_TOOL,
  SUPERSEDE_FUTURE_ATTENTION_TOOL,
} from "../learning/agenda/future-attention-tool-execution"
import type { TutorContextCut } from "../tutor/compile-context"
import { executeLearnerSteeringTool } from "../tutor/learner-steering"
import { enablesConditionalFutureAttention } from "../tutor/policy-profile"
import { createAgendaTools, type AgendaTutorToolName } from "./agenda-tools"
import {
  createTutorToolExecutionCoordinator,
  executeBoundTutorCapability,
  requireTutorStepContext,
  type TutorStepContext,
} from "./tutor-tool-binding"

export { requireTutorStepContext, type TutorStepContext } from "./tutor-tool-binding"

export const RETAIN_STEERING_TOOL = "retain_learning_wide_timed_steering"

type TutorToolName =
  | AgendaTutorToolName
  | typeof RETAIN_STEERING_TOOL
  | typeof REGISTER_MARKDOWN_COURSE_TOOL
  | typeof CREATE_PROVISIONAL_COURSE_TOOL
  | typeof INSPECT_ACTIVE_COURSE_VIEW_TOOL
  | typeof SET_COURSE_ROUTE_ANCHOR_TOOL
  | typeof REVISE_PROVISIONAL_COURSE_TOOL
  | typeof REALIGN_MARKDOWN_COURSE_TOOL
  | typeof READ_CURRENT_COURSE_MATERIAL_TOOL
  | typeof ADVANCE_COURSE_ROUTE_TOOL

export function createTutorTools(input: {
  database: Database
  identity: {
    sessionId: string
    turnId: string
    toolItemId(toolCallId: string): string
  }
  workspaceRoot: string
  clock: () => number
  policyProfileRevision: string
}) {
  const coordinator = createTutorToolExecutionCoordinator()
  return {
    ...createAgendaTools(input, coordinator, {
      exposeLearnerRoleConstraint: enablesConditionalFutureAttention(
        input.policyProfileRevision,
      ),
    }),
    [RETAIN_STEERING_TOOL]: tool({
      description:
        "Retain an explicit learner instruction that is already in force only when it must constrain Tutor behavior after the current model sample or in a later Session. This is temporary policy, not a stable preference, future learning appointment, or learning evidence. validUntil is an expiry, not a future activation time. Copy an exact excerpt from the current learner input and supply an ISO-8601 expiry with an explicit offset.",
      inputSchema: z.strictObject({
        verbatimExcerpt: z.string().min(1).max(1_000),
        validUntil: z.string().regex(/(?:[zZ]|[+-]\d{2}:\d{2})$/),
      }),
      execute: async (toolInput, options) =>
        executeBoundTutorCapability(input, coordinator, {
          experimentalContext: options.experimental_context,
          toolCallId: options.toolCallId,
          toolName: RETAIN_STEERING_TOOL,
          toolInput,
          mutatesLearningState: true,
        }, (invocationId, executedAt) => {
          const outcome = executeLearnerSteeringTool(input.database, {
            invocationId,
            executedAt,
          })
          return { outcome, durableOutcome: outcome }
        }),
    }),
    [REGISTER_MARKDOWN_COURSE_TOOL]: tool({
      description:
        "Create a source-grounded course from a learner-designated Markdown file inside the trusted current workspace. Use only when there is no active course. Supply the learner's relative path; title is optional. Reading or editing a file alone never creates a course.",
      inputSchema: z.strictObject({
        relativePath: z.string().min(1).max(2_000),
        title: z.string().min(1).max(500).optional(),
      }),
      execute: async (toolInput, options) =>
        executeBoundTutorCapability(input, coordinator, {
          experimentalContext: options.experimental_context,
          toolCallId: options.toolCallId,
          toolName: REGISTER_MARKDOWN_COURSE_TOOL,
          toolInput,
          mutatesLearningState: true,
        }, async (invocationId, executedAt) => {
          const outcome = await executeMarkdownCourseRegistration(input.database, {
            invocationId,
            workspaceRoot: input.workspaceRoot,
            executedAt,
          })
          return { outcome, durableOutcome: outcome }
        }),
    }),
    [CREATE_PROVISIONAL_COURSE_TOOL]: tool({
      description:
        "Create a coarse, explicitly model-proposed and correctable course route when the learner wants to learn a subject but has no source material. Use only when there is no active course. Authored order is navigation, not a prerequisite claim or evidence about the learner.",
      inputSchema: z.strictObject({
        title: z.string().min(1).max(500),
        items: z
          .array(
            z.strictObject({
              title: z.string().min(1).max(500),
              parentIndex: z.number().int().nonnegative().nullable().optional(),
            }),
          )
          .min(1)
          .max(128),
      }),
      execute: async (toolInput, options) =>
        executeBoundTutorCapability(input, coordinator, {
          experimentalContext: options.experimental_context,
          toolCallId: options.toolCallId,
          toolName: CREATE_PROVISIONAL_COURSE_TOOL,
          toolInput,
          mutatesLearningState: true,
        }, (invocationId, executedAt) => {
          const outcome = executeProvisionalCourseCreation(input.database, {
            invocationId,
            workspaceRoot: input.workspaceRoot,
            executedAt,
          })
          return { outcome, durableOutcome: outcome }
        }),
    }),
    [INSPECT_ACTIVE_COURSE_VIEW_TOOL]: tool({
      description:
        "Inspect a bounded page of the immutable active Course View, including stable item IDs, parent links, authored ordinals, and titles. Use this before describing or correcting parts outside the compact nearby context. It returns no material prose.",
      inputSchema: z.strictObject({
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (toolInput, options) =>
        executeBoundTutorCapability(input, coordinator, {
          experimentalContext: options.experimental_context,
          toolCallId: options.toolCallId,
          toolName: INSPECT_ACTIVE_COURSE_VIEW_TOOL,
          toolInput,
          mutatesLearningState: false,
        }, (invocationId, executedAt) => {
          const outcome = executeActiveCourseInspection(input.database, {
            invocationId,
            executedAt,
          })
          return { outcome, durableOutcome: outcome }
        }),
    }),
    [SET_COURSE_ROUTE_ANCHOR_TOOL]: tool({
      description:
        "Correct durable route position to an authored ordinal in the active Course View. Use when the learner corrects where they are or explicitly asks to jump. This changes navigation only, never mastery or Course View structure.",
      inputSchema: z.strictObject({
        targetOrdinal: z.number().int().nonnegative(),
      }),
      execute: async (toolInput, options) =>
        executeBoundTutorCapability(input, coordinator, {
          experimentalContext: options.experimental_context,
          toolCallId: options.toolCallId,
          toolName: SET_COURSE_ROUTE_ANCHOR_TOOL,
          toolInput,
          mutatesLearningState: true,
        }, (invocationId, executedAt) => {
          const outcome = executeCourseRouteReanchor(input.database, {
            invocationId,
            executedAt,
          })
          return { outcome, durableOutcome: outcome }
        }),
    }),
    [REVISE_PROVISIONAL_COURSE_TOOL]: tool({
      description:
        "Supersede the active model-proposed Course View with a corrected full ordered hierarchy. Preserve the old revision and provenance. Use only for a provisional view, normally after inspection or a clear learner correction. routeAnchorIndex selects the rejoined position in the new view.",
      inputSchema: z.strictObject({
        items: z
          .array(
            z.strictObject({
              title: z.string().min(1).max(500),
              parentIndex: z.number().int().nonnegative().nullable().optional(),
            }),
          )
          .min(1)
          .max(128),
        routeAnchorIndex: z.number().int().nonnegative(),
      }),
      execute: async (toolInput, options) =>
        executeBoundTutorCapability(input, coordinator, {
          experimentalContext: options.experimental_context,
          toolCallId: options.toolCallId,
          toolName: REVISE_PROVISIONAL_COURSE_TOOL,
          toolInput,
          mutatesLearningState: true,
        }, (invocationId, executedAt) => {
          const outcome = executeProvisionalCourseRevision(input.database, {
            invocationId,
            executedAt,
          })
          return { outcome, durableOutcome: outcome }
        }),
    }),
    [REALIGN_MARKDOWN_COURSE_TOOL]: tool({
      description:
        "Observe the registered Markdown artifact again and, only if its content revision changed while the current anchor still exists, supersede the source-grounded Course View and material alignments explicitly. Pass no path or revision.",
      inputSchema: z.strictObject({}),
      execute: async (toolInput, options) =>
        executeBoundTutorCapability(input, coordinator, {
          experimentalContext: options.experimental_context,
          toolCallId: options.toolCallId,
          toolName: REALIGN_MARKDOWN_COURSE_TOOL,
          toolInput,
          mutatesLearningState: true,
        }, async (invocationId, executedAt) => {
          const outcome = await executeMarkdownCourseRealignment(input.database, {
            invocationId,
            executedAt,
          })
          return { outcome, durableOutcome: outcome }
        }),
    }),
    [READ_CURRENT_COURSE_MATERIAL_TOOL]: tool({
      description:
        "Read only the exact revision-bound material range aligned to the active course item. The system supplies the trusted course, item, path, revision, and bounds; pass no path or IDs.",
      inputSchema: z.strictObject({}),
      execute: async (toolInput, options) =>
        executeBoundTutorCapability(input, coordinator, {
          experimentalContext: options.experimental_context,
          toolCallId: options.toolCallId,
          toolName: READ_CURRENT_COURSE_MATERIAL_TOOL,
          toolInput,
          mutatesLearningState: false,
        }, async (invocationId, executedAt) => {
          const outcome = await executeCurrentCourseMaterialRead(input.database, {
            invocationId,
            executedAt,
          })
          return { outcome, durableOutcome: durableCourseToolOutcome(outcome) }
        }),
    }),
    [ADVANCE_COURSE_ROUTE_TOOL]: tool({
      description:
        "Advance durable route position from the active course item to the next authored item. This records navigation/progress only, never mastery. It is valid after covering the item or when the learner already asked this Turn to explain and then advance; do not ask them to confirm that request again. The system binds the exact course-view revision, anchor, and route version; pass no IDs.",
      inputSchema: z.strictObject({}),
      execute: async (toolInput, options) =>
        executeBoundTutorCapability(input, coordinator, {
          experimentalContext: options.experimental_context,
          toolCallId: options.toolCallId,
          toolName: ADVANCE_COURSE_ROUTE_TOOL,
          toolInput,
          mutatesLearningState: true,
        }, (invocationId, executedAt) => {
          const outcome = executeCourseRouteAdvance(input.database, {
            invocationId,
            executedAt,
          })
          return { outcome, durableOutcome: outcome }
        }),
    }),
  }
}

export function activeTutorToolNames(context: TutorContextCut): TutorToolName[] {
  const names: TutorToolName[] = [RETAIN_STEERING_TOOL]
  if (!context.activeCourse) {
    names.push(REGISTER_MARKDOWN_COURSE_TOOL, CREATE_PROVISIONAL_COURSE_TOOL)
    return names
  }
  names.push(CREATE_FUTURE_ATTENTION_TOOL)
  names.push(INSPECT_RECENT_FUTURE_ATTENTION_TOOL, REOPEN_FUTURE_ATTENTION_TOOL)
  if (context.futureAttention.concerns.length > 0) {
    names.push(
      READ_FUTURE_ATTENTION_SOURCE_TOOL,
      DISMISS_FUTURE_ATTENTION_TOOL,
      SUPERSEDE_FUTURE_ATTENTION_TOOL,
    )
  }
  if (context.futureAttention.concerns.some((concern) => concern.targetState === "current")) {
    names.push(ADDRESS_FUTURE_ATTENTION_TOOL)
  }
  names.push(INSPECT_ACTIVE_COURSE_VIEW_TOOL, SET_COURSE_ROUTE_ANCHOR_TOOL)
  if (context.activeCourse.material) {
    names.push(READ_CURRENT_COURSE_MATERIAL_TOOL, REALIGN_MARKDOWN_COURSE_TOOL)
  }
  if (context.activeCourse.basis === "model_proposed") {
    names.push(REVISE_PROVISIONAL_COURSE_TOOL)
  }
  if (context.activeCourse.route.nearby.some((item) => item.relation === "next")) {
    names.push(ADVANCE_COURSE_ROUTE_TOOL)
  }
  return names
}
