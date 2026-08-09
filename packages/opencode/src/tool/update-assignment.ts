import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { UpdateAssignmentInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const UpdateAssignmentTool = Tool.define<typeof UpdateAssignmentInput, Record<string, unknown>, LearningCommandRuntime.Service>(
  LearningCommand.UPDATE_ASSIGNMENT_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Create only an existing, source-relative, substantial learning obligation reported by the learner or observed in an exact admitted Artifact/Representation source, with a real later teaching, guided-work, review, or Planning consumer. A self-promise, dated Goal, Tutor-proposed practice, administrative deadline, or no-consumer obligation is not an Assignment. interpreted_learner_report and interpreted_source_observation are the only creation causes; a learner direction may only dismiss or reactivate Repa's local use of an existing Assignment, and agent_correction requires exact current Assignment owner reads. This is not a todo, study plan, priority, progress report, activity log, mastery claim, or automatic completion mechanism. Time, silence, absence, and an elapsed due period never imply activity, zero progress, breach, completion, cancellation, or dismissal. The program binds the exact root Agent operation, source, immutable revision/head, civil-time meaning, permission, replay/conflict identity, supersession graph, and atomic settlement.",
      parameters: UpdateAssignmentInput,
      jsonSchema: ToolJsonSchema.fromSchema(UpdateAssignmentInput, { additionalProperties: false }),
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_ASSIGNMENT_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateAssignmentInput>, context: Tool.Context) =>
        runtime.executeCommand(LearningCommand.UPDATE_ASSIGNMENT_CAPABILITY, input, context).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof UpdateAssignmentInput> & { readonly prepareLearningCommand: Preparation }
  }),
)
