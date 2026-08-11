import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { UpdateAdvisoryPlanSuggestionInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const UpdateAdvisoryPlanSuggestionTool = Tool.define<
  typeof UpdateAdvisoryPlanSuggestionInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Store, revise, offer an exact alternative to, retire, or restore bounded source-bearing Tutor advice when it can materially improve later teaching, guided work, review, or learning planning. The advice remains fuzzy and fallible: it is not a scheduler, learner commitment, adherence record, progress metric, or mastery proof. Keep learner-visible scope, retrieval scope, exact basis references, authored directory summary, body, and uncertainty distinct. Create only from a responsive or proactive Tutor proposal; use learner_revision or tutor_revision against an exact current head for later changes. Natural learner correction should revise the advice without a separate approval ceremony. Explanation, demonstration, guided work, and useful teaching may remain zero-write. Never infer that advice was followed from time, silence, absence, Assignment state, or plan wording.",
      parameters: UpdateAdvisoryPlanSuggestionInput,
      jsonSchema: ToolJsonSchema.fromSchema(UpdateAdvisoryPlanSuggestionInput, { additionalProperties: false }),
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateAdvisoryPlanSuggestionInput>, context: Tool.Context) =>
        runtime
          .executeCommand(LearningCommand.UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY, input, context)
          .pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof UpdateAdvisoryPlanSuggestionInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
