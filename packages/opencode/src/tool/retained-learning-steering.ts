import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { UpdateRetainedLearningSteeringInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const UpdateRetainedLearningSteeringTool = Tool.define<
  typeof UpdateRetainedLearningSteeringInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Retain, replace, or retract one learner-authored learning-wide steering instruction only when the exact current learner input explicitly authorizes that cross-Course scope and a finite end. Use create for a new lineage; replace or retract only with the exact policy/head/version shown in protected retained-steering context. Quote an exact sourceExcerpt, never invent learnerReason, and supply validUntil as ISO-8601 with an explicit offset. Bare phrases such as 'today do not quiz me' are current-only unless the learner clearly makes them learning-wide.",
      parameters: UpdateRetainedLearningSteeringInput,
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateRetainedLearningSteeringInput>, context: Tool.Context) =>
        runtime
          .executeCommand(LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY, input, context)
          .pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof UpdateRetainedLearningSteeringInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
