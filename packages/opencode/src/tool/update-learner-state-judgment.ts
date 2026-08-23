import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Database } from "@opencode-ai/core/database/database"
import { Effect, Schema } from "effect"
import {
  CompactLearnerStateCorrectionInput,
  UpdateLearnerStateJudgmentToolInput,
  type UpdateLearnerStateJudgmentInput,
} from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"
import { resolveCompactLearnerStateCorrection } from "./learner-state-correction"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const UpdateLearnerStateJudgmentTool = Tool.define<
  typeof UpdateLearnerStateJudgmentToolInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service | Database.Service
>(
  LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    const database = yield* Database.Service
    const decode = Schema.decodeUnknownEffect(UpdateLearnerStateJudgmentToolInput)
    const expand = (input: unknown, registration: LearningCommandRuntime.Registration) =>
      decode(input).pipe(
        Effect.flatMap((value) =>
          Schema.is(CompactLearnerStateCorrectionInput)(value)
            ? resolveCompactLearnerStateCorrection(database, value, registration)
            : Effect.succeed(value as UpdateLearnerStateJudgmentInput),
        ),
      )
    return {
      description:
        "Store, correct, retire, or restore one durable, source-bearing, fallible judgment about what the learner currently understands, can apply, or still finds difficult, only when that memory can materially improve later teaching or review. Create only from an interpreted learner report, a source-citing Tutor model judgment, or an exact owner observation; learner_correction revises an exact current head. IMPORTANT: after a completed current read in the same Session, an ordinary learner correction that changes the judgment body or remaining difficulty MUST use revise_from_current_read, not full revise. Copy correctionHandle.currentReadCallID exactly from that read result—never substitute judgmentID or revisionID—and supply only that handle, one exact sourceExcerpt from the current learner message, judgmentBody, uncertaintyAndLimits, and rationale. Repa carries the exact current judgment/head/subject/bases and binds UTF-8 offsets, so never copy those structures. Use full revise after such a read only when the learner explicitly changes the judgment's subject identity/scope or exact basis. The judgment body and exact basis references support one whole revision; they do not certify mastery or prove each clause separately. Use exact Course, Material, Goal, Assignment, learner-response-evidence, or Interaction references, keep uncertainty visible, and revise the exact current head when the learner naturally corrects it. Full input shape is strict: snapshot.subject contains only label and scope; snapshot.judgmentBody, exactBasisRefs, uncertaintyAndLimits, and basisScope are siblings of subject; rationale is top-level and never inside snapshot. Explanation, demonstration, guided work, and useful teaching may remain zero-write. Never infer a judgment from silence, elapsed time, Assignment completion, plan wording, effort, activity, or a score, and do not create routine after-every-turn bookkeeping.",
      parameters: UpdateLearnerStateJudgmentToolInput,
      jsonSchema: ToolJsonSchema.fromSchema(UpdateLearnerStateJudgmentToolInput, { additionalProperties: false }),
      resolveLearningCommandInput: expand,
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateLearnerStateJudgmentToolInput>, context: Tool.Context) => {
        const registration = context.extra?.toolCall
        if (!registration || typeof registration !== "object") {
          return Effect.die(new Error("Compact learner-state correction is missing its registered Tool identity"))
        }
        return expand(input, registration as LearningCommandRuntime.Registration).pipe(
          Effect.flatMap((value) =>
            runtime.executeCommand(LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY, value, context),
          ),
          Effect.orDie,
        )
      },
    } satisfies Tool.DefWithoutID<typeof UpdateLearnerStateJudgmentToolInput> & {
      readonly prepareLearningCommand: Preparation
      readonly resolveLearningCommandInput: typeof expand
    }
  }),
)
