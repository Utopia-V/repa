import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { UpdateLearningCourseInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const UpdateLearningCourseTool = Tool.define<
  typeof UpdateLearningCourseInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Apply one closed, request-bound learning bootstrap to exactly one Course after interpreting the learner's ordinary-language request. Use the bounded Course, Artifact, Representation, Material Map, ContentRoot, and navigation reads for exact existing identities. A Course may be created without a View. Include material only when the learner explicitly adopts, retains, maps, or aligns that exact source; reading, searching, attachments, and web research are not adoption. The set may include at most one local source that can create or freshly observe an Artifact. Supply semantic content, existing owner IDs, predecessor references, and runtime-local keys only; Repa binds generated IDs, versions, authorship provenance, Agent lineage, exact local-read authority, permission, one transaction, replay, recovery, and terminal truth. Tutor-initiated routes must remain unselected. Do not call for teach-only conversation, empty administration, default Course, Goals, steering, progress, mastery, planning, or Session topology.",
      parameters: UpdateLearningCourseInput,
      jsonSchema: ToolJsonSchema.fromSchema(UpdateLearningCourseInput, { additionalProperties: false }),
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateLearningCourseInput>, context: Tool.Context) =>
        runtime.executeCommand(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, input, context).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof UpdateLearningCourseInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
