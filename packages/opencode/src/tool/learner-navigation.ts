import { LearningCommand } from "@opencode-ai/core/learning-command"
import { PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY } from "@opencode-ai/core/learner-navigation/default-course-v2"
import { Effect, Schema } from "effect"
import {
  ProposeDefaultCoursePreferenceInput,
  SetCourseRouteAnchorInput,
  SetDefaultCoursePreferenceV2Input,
} from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const SetDefaultCoursePreferenceTool = Tool.define<
  typeof SetDefaultCoursePreferenceV2Input,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Change or clear the learner's optional default Course preference only from one exact current learner request or a strictly later exact acceptance of a host-recorded proposal. Supply the closed authorization evidence and exact bounded Course resolution scope. Repa evaluates capability policy before applying or reporting no change; this does not select a Course View Revision or create an active Course.",
      parameters: SetDefaultCoursePreferenceV2Input,
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof SetDefaultCoursePreferenceV2Input>, context: Tool.Context) =>
        runtime
          .executeCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, input, context)
          .pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof SetDefaultCoursePreferenceV2Input> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)

export const ProposeDefaultCoursePreferenceTool = Tool.define<
  typeof ProposeDefaultCoursePreferenceInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Present one host-recorded, nonmutating proposal to change or clear the learner's optional default Course preference. Supply the exact current preference head/version and a complete or explicitly truncated Course resolution scope. This proposal never changes learning state, grants capability, or authorizes a same-round mutation; a later exact learner acceptance is required.",
      parameters: ProposeDefaultCoursePreferenceInput,
      prepareToolCall: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareDefaultCourseProposal(input, registration),
      execute: () => Effect.die("Host-prepared Default-Course proposals must complete during Tool-call preparation"),
    } satisfies Tool.DefWithoutID<typeof ProposeDefaultCoursePreferenceInput> & {
      readonly prepareToolCall: Preparation
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
