import type { LLMEvent } from "@opencode-ai/llm"
import type { ModelMessage, Tool } from "ai"

export const VERSION = 1 as const

// Use the conservative shared function-name grammar accepted by retained
// provider routes. A route may allow more punctuation, but an internal identity
// never needs that punctuation to remain provider-visible.
const PROVIDER_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

export type Binding = Readonly<{
  version: typeof VERSION
  entries: readonly Readonly<{ internal: string; provider: string }>[]
  fingerprint: string
}>

export type Projection = Readonly<{
  binding: Binding
  provider: (internal: string) => string
  internal: (provider: string) => string
}>

export function make(names: Iterable<string>): Projection {
  const internalNames = [...new Set(names)].toSorted()
  const identities = new Set(internalNames.filter((name) => PROVIDER_NAME.test(name)))
  const used = new Set(identities)
  const providerNames = new Map<string, string>()

  internalNames.forEach((internal) => {
    if (identities.has(internal)) {
      providerNames.set(internal, internal)
      return
    }
    const stem = internal
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24)
    let attempt = 0
    let provider = ""
    do {
      const digest = new Bun.CryptoHasher("sha256")
        .update(`${VERSION}\u0000${internal}\u0000${attempt++}`)
        .digest("hex")
      provider = `repa_${stem || "tool"}_${digest.slice(0, 24)}`
    } while (used.has(provider))
    used.add(provider)
    providerNames.set(internal, provider)
  })

  const entries = Object.freeze(
    internalNames.map((internal) => Object.freeze({ internal, provider: providerNames.get(internal)! })),
  )
  const binding = Object.freeze({
    version: VERSION,
    entries,
    fingerprint: new Bun.CryptoHasher("sha256").update(JSON.stringify({ version: VERSION, entries })).digest("hex"),
  })
  const internalNamesByProvider = new Map(entries.map((entry) => [entry.provider, entry.internal]))

  return Object.freeze({
    binding,
    provider(internal: string) {
      const result = providerNames.get(internal)
      if (result === undefined) throw new Error(`Tool name is outside the frozen provider projection: ${internal}`)
      return result
    },
    internal(provider: string) {
      const result = internalNamesByProvider.get(provider)
      if (result === undefined) throw new Error(`Provider tool name is outside the frozen projection: ${provider}`)
      return result
    },
  })
}

export function messageNames(messages: readonly ModelMessage[]) {
  return messages.flatMap((message) => {
    if (!Array.isArray(message.content)) return []
    return message.content.flatMap((part) => {
      if (
        (part.type === "tool-call" || part.type === "tool-result") &&
        "toolName" in part &&
        typeof part.toolName === "string"
      )
        return [part.toolName]
      return []
    })
  })
}

export function tools(projection: Projection, input: Record<string, Tool>) {
  const result = Object.fromEntries(Object.entries(input).map(([name, item]) => [projection.provider(name), item]))
  if (Object.keys(result).length !== Object.keys(input).length) {
    throw new Error("Provider tool-name projection is not one-to-one")
  }
  return Object.freeze(result)
}

export function messages(projection: Projection, input: readonly ModelMessage[]) {
  return input.map((message): ModelMessage => {
    if (!Array.isArray(message.content)) return message
    return {
      ...message,
      content: message.content.map((part) => {
        if (
          (part.type === "tool-call" || part.type === "tool-result") &&
          "toolName" in part &&
          typeof part.toolName === "string"
        ) {
          return { ...part, toolName: projection.provider(part.toolName) }
        }
        return part
      }),
    } as ModelMessage
  })
}

export function event(projection: Projection, input: LLMEvent, offeredProviderNames: ReadonlySet<string>): LLMEvent {
  switch (input.type) {
    case "tool-input-start":
    case "tool-input-delta":
    case "tool-input-end":
    case "tool-call":
    case "tool-result":
    case "tool-error": {
      if (!offeredProviderNames.has(input.name)) {
        throw new Error(`Provider tool name is outside the prepared provider surface: ${input.name}`)
      }
      return { ...input, name: projection.internal(input.name) }
    }
    default:
      return input
  }
}

export * as ToolNameProjection from "./tool-name-projection"
