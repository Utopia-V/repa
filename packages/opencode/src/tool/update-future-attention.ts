import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { UpdateFutureAttentionInput } from "@/learning-command/input"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

export const UpdateFutureAttentionTool = Tool.define<
  typeof UpdateFutureAttentionInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    return {
      description:
        "Create or correct a bounded source-linked future-attention concern, or serve, dismiss, or reopen an exact current concern head. Use this for a specific later Tutor purpose whose target and earliest applicable time are known; it is not a generic task, reminder, priority, mastery claim, or scheduling authority. Open-language source and correction relations are fallible Agent interpretations. The program binds the exact current learner occurrence, root/delegated lineage, target revision, civil-time provenance, permission, legal transition, replay/conflict identity, and atomic settlement. A current_assistant_when_complete service claim is root-only, remains pending at admission, and may be finalized only from this exact Assistant's fully committed presentation; a later same-input Assistant cannot substitute. Read current owner state before agent_correction and cite its exact head and cut.",
      parameters: UpdateFutureAttentionInput,
      jsonSchema: ToolJsonSchema.fromSchema(UpdateFutureAttentionInput, { additionalProperties: false }),
      prepareLearningCommand: (input: unknown, registration: LearningCommandRuntime.Registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, input, registration),
      execute: (input: Schema.Schema.Type<typeof UpdateFutureAttentionInput>, context: Tool.Context) =>
        runtime.executeCommand(LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY, input, context).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof UpdateFutureAttentionInput> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
