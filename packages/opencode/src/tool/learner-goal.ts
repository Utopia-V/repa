import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { UpdateLearnerGoalsInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const UpdateLearnerGoalsTool = Tool.define<
  typeof UpdateLearnerGoalsInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Create, update, or replace a bounded set of durable learner Goals after interpreting the learner's meaning in the ordinary conversation. Use learner_goal_query and course_query lazily for exact current identities and heads. Supply only semantic choices: outcome, conditions, Course IDs, structured target, lifecycle, and exact Goal/head references returned by owner reads. Omitted update fields carry from the exact predecessor. Ask the learner conversationally before calling when unresolved meaning would materially change durable history. Repa binds versions, generated IDs, source and temporal facts, Agent lineage, permission, atomicity, replay, recovery, and correction. Do not use this tool for hypothetical, quoted, negated, or merely suggested aspirations, evidence, inferred mastery, schedules, or task completion.",
      parameters: UpdateLearnerGoalsInput,
      jsonSchema: ToolJsonSchema.fromSchema(UpdateLearnerGoalsInput, { additionalProperties: false }),
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateLearnerGoalsInput>, context: Tool.Context) =>
        runtime.executeCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, context).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof UpdateLearnerGoalsInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
