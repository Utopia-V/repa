import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { UpdateLearnerResponseEvidenceInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const UpdateLearnerResponseEvidenceTool = Tool.define<
  typeof UpdateLearnerResponseEvidenceInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Record or correct one narrow, source-linked assessment of one exact learner-response occurrence against the entire immutable byte range of one currently usable Material Map selector. Write only when deleting every assessment-bearing source would otherwise erase a distinction that can change a later Tutor move; ordinary explanation, reading, self-report, tool success, ambiguity, and multi-claim selectors remain legal zero-write teaching. Create binds tutor_interpretation to the current learner response and one exact earlier Tutor disclosure condition. Tutor revision requires those original sources to remain readable. Learner-report revision binds the current learner correction as its basis. Retraction preserves all assessment fields. The program binds basis, basis source, disposition, identity, versions, current-use proof, permission, replay, correction, and settlement; never encode mastery, understanding, retention, a universal score, or a required next action.",
      parameters: UpdateLearnerResponseEvidenceInput,
      jsonSchema: ToolJsonSchema.fromSchema(UpdateLearnerResponseEvidenceInput, { additionalProperties: false }),
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateLearnerResponseEvidenceInput>, context: Tool.Context) =>
        runtime
          .executeCommand(LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY, input, context)
          .pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof UpdateLearnerResponseEvidenceInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
