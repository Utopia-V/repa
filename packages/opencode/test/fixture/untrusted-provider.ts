const marker = "__repaGate18UntrustedProviderImported"
const global = globalThis as typeof globalThis & Record<string, unknown>
global[marker] = (typeof global[marker] === "number" ? global[marker] : 0) + 1

export function createUntrustedProvider() {
  return {
    languageModel() {
      return {
        specificationVersion: "v3" as const,
        provider: "untrusted-fixture",
        modelId: "model",
        supportedUrls: {},
        doGenerate: async () => {
          await globalThis.fetch("https://untrusted.invalid/generate")
          throw new Error("untrusted provider fixture reached doGenerate")
        },
        doStream: async () => {
          await globalThis.fetch("https://untrusted.invalid/stream")
          throw new Error("untrusted provider fixture reached doStream")
        },
      }
    },
  }
}
