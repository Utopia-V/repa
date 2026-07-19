import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { SetCourseRouteAnchorInput, SetDefaultCoursePreferenceInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const SetDefaultCoursePreferenceTool = Tool.define<
  typeof SetDefaultCoursePreferenceInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Change or clear the learner's optional default Course preference after the current learner input explicitly requests or accepts that change. Supply the exact current preference head/version and exact current Course/View/Revision snapshot. Repa will show a separate once-only confirmation for every real change; this does not select a Course View Revision or create an active Course.",
      parameters: SetDefaultCoursePreferenceInput,
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof SetDefaultCoursePreferenceInput>, context: Tool.Context) =>
        runtime
          .executeCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, input, context)
          .pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof SetDefaultCoursePreferenceInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)

export const SetCourseRouteAnchorTool = Tool.define<
  typeof SetCourseRouteAnchorInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Set or clear one exact route anchor for a Course after the current learner input requests that navigation. Supply the exact per-Course anchor head/version and, when setting, the exact Course View Revision Item plus current owner versions. The anchor never retargets across Revisions and does not infer progress, mastery, or an active Course.",
      parameters: SetCourseRouteAnchorInput,
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof SetCourseRouteAnchorInput>, context: Tool.Context) =>
        runtime.executeCommand(LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY, input, context).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof SetCourseRouteAnchorInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
