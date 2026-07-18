import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { RepresentationConvertInput } from "@/learning-command/input"
import { RepresentationCommandRuntime } from "@/learning-command/representation-runtime"
import { Tool } from "./tool"

type Preparation = RepresentationCommandRuntime.Interface["prepare"]

export const RepresentationConvertTool = Tool.define<
  typeof RepresentationConvertInput,
  Record<string, unknown>,
  RepresentationCommandRuntime.Service
>(
  LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* RepresentationCommandRuntime.Service
    return {
      description:
        "Create one durable readable Representation for the exact current Artifact Revision after the learner has requested persistent readable access. The ContentRoot and relative path must be the Artifact's admitted source provenance. Repa selects the closed producer recipe: the pinned local text-layer producer for PDF paths and the separately configured multimodal profile for supported image paths. This does not summarize, teach, select passages, or choose a preferred Representation.",
      parameters: RepresentationConvertInput,
      prepareLearningCommand: runtime.prepare,
      execute: (input: Schema.Schema.Type<typeof RepresentationConvertInput>, context: Tool.Context) =>
        runtime.execute(input, context).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof RepresentationConvertInput, Record<string, unknown>> & {
      readonly prepareLearningCommand: Preparation
    }
  }),
)
