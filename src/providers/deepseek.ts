import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

export type DeepSeekModelId = "deepseek-v4-flash" | "deepseek-v4-pro"

export function createDeepSeekModel(input: { apiKey: string; model: DeepSeekModelId }) {
  const provider = createOpenAICompatible({
    name: "deepseek",
    baseURL: "https://api.deepseek.com",
    apiKey: input.apiKey,
    includeUsage: true,
    transformRequestBody(body) {
      if (input.model === "deepseek-v4-flash") {
        return { ...body, thinking: { type: "disabled" } }
      }
      return {
        ...body,
        thinking: { type: "enabled" },
        reasoning_effort: "max",
      }
    },
  })
  return provider.chatModel(input.model)
}

export async function loadDeepSeekApiKey() {
  const environmentKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (environmentKey) return environmentKey

  const path = new URL("../../.secret", import.meta.url)
  if (!(await Bun.file(path).exists())) {
    throw new Error("Set DEEPSEEK_API_KEY or create the local .secret file")
  }
  const raw = (await Bun.file(path).text()).trim()
  if (!raw) throw new Error("DeepSeek API key file is empty")
  if (raw.startsWith("{")) {
    const value = JSON.parse(raw) as Record<string, unknown>
    const key = value.DEEPSEEK_API_KEY ?? value.apiKey
    if (typeof key === "string" && key.trim()) return key.trim()
    throw new Error("DeepSeek API key JSON has no supported key")
  }
  const assignment = raw.match(/^(?:DEEPSEEK_API_KEY|API_KEY)\s*=\s*(.+)$/m)
  return assignment?.[1]?.trim() || raw
}

export function parseDeepSeekModel(value: string | undefined): DeepSeekModelId {
  if (value === undefined || value === "deepseek-v4-flash") return "deepseek-v4-flash"
  if (value === "deepseek-v4-pro") return value
  throw new Error(`Unsupported DeepSeek model: ${value}`)
}

export function estimateDeepSeekUpperBoundUsd(
  model: DeepSeekModelId,
  usage: { inputTokens: number | undefined; outputTokens: number | undefined },
) {
  const prices =
    model === "deepseek-v4-pro"
      ? { inputPerMillion: 0.435, outputPerMillion: 0.87 }
      : { inputPerMillion: 0.14, outputPerMillion: 0.28 }
  return (
    ((usage.inputTokens ?? 0) * prices.inputPerMillion +
      (usage.outputTokens ?? 0) * prices.outputPerMillion) /
    1_000_000
  )
}
