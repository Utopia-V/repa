import { Effect, Schema } from "effect"
import { Tool } from "./tool"

export const INVALID_TOOL_ID = "invalid"

export const Parameters = Schema.Struct({
  tool: Schema.String,
  error: Schema.String,
})

export const InvalidTool = Tool.define(
  INVALID_TOOL_ID,
  Effect.succeed({
    description: "Do not use",
    parameters: Parameters,
    execute: (params: { tool: string; error: string }) =>
      Effect.succeed({
        title: "Invalid Tool",
        output: `The arguments provided to the tool are invalid: ${params.error}`,
        metadata: {},
      }),
  }),
)
