import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { UpdateLearnerStateJudgmentInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const UpdateLearnerStateJudgmentTool = Tool.define<
  typeof UpdateLearnerStateJudgmentInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Store, correct, retire, or restore one durable, source-bearing, fallible judgment about what the learner currently understands, can apply, or still finds difficult, only when that memory can materially improve later teaching or review. Create only from an interpreted learner report, a source-citing Tutor model judgment, or an exact owner observation; learner_correction revises an exact current head. The judgment body and exact basis references support one whole revision; they do not certify mastery or prove each clause separately. Use exact Course, Material, Goal, Assignment, learner-response-evidence, or Interaction references, keep uncertainty visible, and revise the exact current head when the learner naturally corrects it. Explanation, demonstration, guided work, and useful teaching may remain zero-write. Never infer a judgment from silence, elapsed time, Assignment completion, plan wording, effort, activity, or a score, and do not create routine after-every-turn bookkeeping.",
      parameters: UpdateLearnerStateJudgmentInput,
      jsonSchema: ToolJsonSchema.fromSchema(UpdateLearnerStateJudgmentInput, { additionalProperties: false }),
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateLearnerStateJudgmentInput>, context: Tool.Context) =>
        runtime
          .executeCommand(LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY, input, context)
          .pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof UpdateLearnerStateJudgmentInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
