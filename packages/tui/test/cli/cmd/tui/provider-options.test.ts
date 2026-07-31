import { describe, expect, test } from "bun:test"
import { normalizeCustomProviderID, providerOptions } from "../../../../src/component/dialog-provider"

describe("providerOptions", () => {
  test("includes a synthetic Other option for custom providers", () => {
    expect(providerOptions([{ id: "openai", name: "OpenAI" }]).at(-1)).toMatchObject({
      title: "Other",
      description: "Custom provider",
      category: "Providers",
    })
  })

  test("describes active OpenAI subscription and API-key authentication", () => {
    expect(providerOptions([{ id: "openai", name: "OpenAI" }])[0]?.description).toBe("(ChatGPT Plus/Pro or API key)")
  })

  test("does not use Other as the generic provider category", () => {
    expect(providerOptions([{ id: "mistral", name: "Mistral" }])[0]?.category).toBe("Providers")
  })

  test("keeps popular providers first and sorts the rest alphabetically", () => {
    expect(
      providerOptions([
        { id: "openai", name: "OpenAI" },
        { id: "custom-z", name: "Zebra Provider" },
        { id: "anthropic", name: "Anthropic" },
        { id: "mistral", name: "Mistral" },
        { id: "aws", name: "AWS Bedrock" },
      ]).map((option) => option.value),
    ).toEqual(["openai", "anthropic", "aws", "mistral", "custom-z", "__opencode_custom_provider__"])
  })

  test("treats explicitly configured OpenCode provider ids as ordinary providers", () => {
    expect(
      providerOptions([
        { id: "opencode", name: "OpenCode Zen" },
        { id: "opencode-go", name: "OpenCode Go" },
      ]).slice(0, 2),
    ).toEqual([
      {
        type: "provider",
        title: "OpenCode Go",
        value: "opencode-go",
        providerID: "opencode-go",
        description: undefined,
        category: "Providers",
      },
      {
        type: "provider",
        title: "OpenCode Zen",
        value: "opencode",
        providerID: "opencode",
        description: undefined,
        category: "Providers",
      },
    ])
  })

  test("does not collide with a configured provider named other", () => {
    const values = providerOptions([{ id: "other", name: "Other Provider" }]).map((option) => option.value)
    expect(new Set(values).size).toBe(values.length)
  })

  test("normalizes and validates custom provider ids", () => {
    expect(normalizeCustomProviderID("  custom-provider  ")).toBe("custom-provider")
    expect(normalizeCustomProviderID("custom_provider")).toBe("custom_provider")
    expect(normalizeCustomProviderID("@ai-sdk/custom-provider")).toBe("custom-provider")
    expect(normalizeCustomProviderID("-custom-provider")).toBeUndefined()
    expect(normalizeCustomProviderID("Custom Provider")).toBeUndefined()
  })
})
