export * as ConfigRepresentationV1 from "./representation"

import { Schema } from "effect"

const Probability = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))
const Temperature = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 2 }))
const TopK = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000 }))
const InputBytes = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 * 1024 * 1024 }))
const OutputBytes = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 * 1024 * 1024 }))
const OutputTokens = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32_768 }))
const Timeout = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 * 60 * 1_000 }))

const Controls = {
  variant: Schema.optional(Schema.String),
  temperature: Schema.optional(Temperature),
  top_p: Schema.optional(Probability),
  top_k: Schema.optional(TopK),
  max_input_bytes: Schema.optional(InputBytes),
  max_output_bytes: Schema.optional(OutputBytes),
  max_output_tokens: Schema.optional(OutputTokens),
  timeout_ms: Schema.optional(Timeout),
}

export const ActiveModelProfile = Schema.Struct({
  enabled: Schema.optional(Schema.Literal(true)),
  provider_id: Schema.String,
  model_id: Schema.String,
  ...Controls,
})

export const ModelProfile = Schema.Union([Schema.Struct({ enabled: Schema.Literal(false) }), ActiveModelProfile])

export const Info = Schema.Struct({
  model: Schema.optional(ModelProfile),
})

export type ModelProfile = Schema.Schema.Type<typeof ModelProfile>
export type ActiveModelProfile = Schema.Schema.Type<typeof ActiveModelProfile>
