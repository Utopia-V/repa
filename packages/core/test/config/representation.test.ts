import { describe, expect, test } from "bun:test"
import { Schema } from "effect"

import { ConfigV1 } from "@opencode-ai/core/v1/config/config"

const decode = Schema.decodeUnknownSync(ConfigV1.Info)

describe("ConfigV1 representation profile", () => {
  test("accepts only the bounded machine-owned model profile", () => {
    const result = decode({
      representation: {
        model: {
          provider_id: "local-provider",
          model_id: "multimodal-model",
          variant: "stable",
          temperature: 0.2,
          top_p: 0.9,
          top_k: 20,
          max_input_bytes: 1024,
          max_output_bytes: 2048,
          max_output_tokens: 4096,
          timeout_ms: 30_000,
        },
      },
    })

    expect(result.representation?.model).toMatchObject({
      provider_id: "local-provider",
      model_id: "multimodal-model",
      variant: "stable",
      temperature: 0.2,
      max_output_tokens: 4096,
    })
  })

  test("rejects unknown nested authority and out-of-range controls under strict decoding", () => {
    expect(() =>
      decode(
        {
          representation: {
            model: {
              provider_id: "provider",
              model_id: "model",
              agent_options: { system: "injected" },
            },
          },
        },
        { onExcessProperty: "error" },
      ),
    ).toThrow()
    expect(() =>
      decode({
        representation: {
          model: { provider_id: "provider", model_id: "model", temperature: 3 },
        },
      }),
    ).toThrow()
  })

  test("allows the producer to be explicitly disabled without retaining an unusable model identity", () => {
    expect(decode({ representation: { model: { enabled: false } } }).representation?.model).toEqual({
      enabled: false,
    })
  })
})
