import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { UpdateLearnerGoalsInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
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
        "Create, update, or replace a bounded set of durable learner Goals only from the exact current learner occurrence. Use authorizationBasis learner_request only for a mechanically closed request: a create explicitly initiates or declares a durable Goal; every consequential field and relation is explicit in current learner wording; authored sourceExcerpt fields quote it; update or replacement Goal IDs occur exactly in that wording; new Course scope names one exact Course ID or unique title and version; targets preserve the exact source expression and mechanical normalization; and lifecycle language explicitly binds the named Goal. Contextual correction, carry, identity continuity, replacement, or any meaning you supply or preserve uses learner_acceptance, which shows the complete candidate in one required once-only confirmation. In accepted candidates, keep exact learner wording authored, mark model-supplied meaning accepted, and carry unchanged predecessor fields. Do not treat a sentence mixing a Goal-like phrase with teaching cadence or an ordinary task as a direct Goal declaration. Do not use this tool for ordinary discussion, hypothetical, quoted, or negated goals, Tutor suggestions, evidence, inferred mastery, schedules, cadence, priorities, or materially ambiguous intent.",
      parameters: UpdateLearnerGoalsInput,
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateLearnerGoalsInput>, context: Tool.Context) =>
        runtime.executeCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, context).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof UpdateLearnerGoalsInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
