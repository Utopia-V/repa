import { describe, expect, test } from "bun:test"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import {
  ORACLE_SELECTED_PURPOSE_MARKER,
  injectOracleSelectedPurpose,
  inspectPredictionResponse,
} from "./oracle-selected-purpose"

function callOptions(prompt: LanguageModelV3CallOptions["prompt"]): LanguageModelV3CallOptions {
  return { prompt }
}

describe("ALS-022A oracle selected-purpose injection", () => {
  test("adds one high-signal contribution without mutating the original request", () => {
    const original = callOptions([
      { role: "system", content: "production system" },
      { role: "user", content: [{ type: "text", text: "继续" }] },
    ])

    const injected = injectOracleSelectedPurpose(original)

    expect(injected).not.toBe(original)
    expect(injected.prompt).not.toBe(original.prompt)
    expect(original.prompt[0]).toEqual({ role: "system", content: "production system" })
    expect(injected.prompt[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining(ORACLE_SELECTED_PURPOSE_MARKER),
    })
    expect(injected.prompt[1]).toBe(original.prompt[1])
  })

  test("fails closed without the production system contribution or on double injection", () => {
    expect(() =>
      injectOracleSelectedPurpose(
        callOptions([{ role: "user", content: [{ type: "text", text: "继续" }] }]),
      ),
    ).toThrow("requires an existing production system contribution")

    const once = injectOracleSelectedPurpose(
      callOptions([{ role: "system", content: "production system" }]),
    )
    expect(() => injectOracleSelectedPurpose(once)).toThrow("injected more than once")
  })

  test("reports mechanical inspection signals without pretending to judge semantics", () => {
    expect(inspectPredictionResponse("请先预测：这段代码会输出什么？")).toEqual({
      asksForPrediction: true,
      containsKnownSeededAnswer: false,
      containsQuestionMark: true,
      normalizedLength: 15,
    })
    expect(inspectPredictionResponse("答案是 2, 2, 1。")).toMatchObject({
      containsKnownSeededAnswer: true,
    })
  })
})
