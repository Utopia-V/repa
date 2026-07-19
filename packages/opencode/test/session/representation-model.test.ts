import { expect } from "bun:test"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelRenditionProfile } from "@opencode-ai/core/representation/model-rendition-profile"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { MockLanguageModelV3 } from "ai/test"
import { Effect, Fiber, Layer, Result, Scope } from "effect"

import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { MessageID, SessionID } from "@/session/schema"
import { RepresentationModel } from "@/session/representation-model"
import { Session } from "@/session/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { TestInstance } from "../fixture/fixture"
import { materializeTestSession } from "../fixture/session"
import { ProviderTest } from "../fake/provider"
import { pollWithTimeout, testEffect } from "../lib/effect"

const PROVIDER_ID = ProviderV2.ID.make("representation-test")
const MODEL_ID = ModelV2.ID.make("multimodal-test")
const OPENAI_PROVIDER_ID = ProviderV2.ID.make("openai")
const OPENAI_MODEL_ID = ModelV2.ID.make("gpt-5.5")
const HEADER_SECRET = "header-secret-canary"
const MODEL_SECRET = "model-option-secret-canary"
const PROVIDER_SECRET = "provider-secret-canary"
const METADATA_SECRET = "metadata-secret-canary"
const ERROR_SECRET = "provider-error-secret-canary"
const PLUGIN_SECRET = "plugin-field-secret-canary"

const baseModel = ProviderTest.model({
  providerID: PROVIDER_ID,
  id: MODEL_ID,
  api: { id: MODEL_ID, url: "https://representation.invalid", npm: "@ai-sdk/openai-compatible" },
  capabilities: {
    toolcall: true,
    attachment: true,
    reasoning: false,
    temperature: true,
    interleaved: false,
    input: { text: true, image: true, audio: false, video: false, pdf: true },
    output: { text: true, image: false, audio: false, video: false, pdf: false },
  },
  cost: { input: 1, output: 2, cache: { read: 0.5, write: 0.75 } },
  options: { arbitrarySecret: MODEL_SECRET },
  headers: { "x-model-secret": HEADER_SECRET },
  variants: {
    stable: { temperature: 0.25, topP: 0.8, topK: 20, maxOutputTokens: 1024 },
    attacker: { temperature: 1.9 },
  },
})

let currentModel = structuredClone(baseModel)
let language = responseLanguage(successParts())
let hookNames: string[] = []
let hookInputs: string[] = []
let resolvedRefs: string[] = []
let languageResolutions = 0
let languageModels: Provider.Model[] = []
let languageResolutionHangs = false
let languageResolutionFails = false
let streamAborts = 0
let hookFails = false

const providerInfo = ProviderTest.info(
  { key: PROVIDER_SECRET, options: { apiKey: PROVIDER_SECRET, arbitrarySecret: PROVIDER_SECRET } },
  baseModel,
)
const provider = ProviderTest.fake({
  model: baseModel,
  info: providerInfo,
  getModel: (providerID, modelID) => {
    resolvedRefs.push(`${providerID}/${modelID}`)
    if (providerID === PROVIDER_ID && modelID === MODEL_ID) return Effect.succeed(currentModel)
    return Effect.fail(new Provider.ModelNotFoundError({ providerID, modelID }))
  },
  getRepresentationLanguage: (model) =>
    Effect.suspend(() => {
      languageResolutions++
      languageModels.push(model)
      if (languageResolutionHangs) return Effect.never
      if (languageResolutionFails) return Effect.die(new Error(ERROR_SECRET))
      return Effect.succeed(language)
    }),
})

const openaiModel = ProviderTest.model({
  ...structuredClone(baseModel),
  providerID: OPENAI_PROVIDER_ID,
  id: OPENAI_MODEL_ID,
  api: { id: OPENAI_MODEL_ID, url: "https://api.openai.com/v1", npm: "@ai-sdk/openai" },
})
let openaiLanguage = responseLanguage(successParts(), OPENAI_PROVIDER_ID, OPENAI_MODEL_ID)
const openaiProvider = ProviderTest.fake({
  model: openaiModel,
  getRepresentationLanguage: () => Effect.succeed(openaiLanguage),
})
const openaiOauth = new Auth.Oauth({
  type: "oauth",
  refresh: "fixture-refresh-token",
  access: "fixture-access-token",
  expires: Date.now() + 60 * 60 * 1000,
  accountId: "fixture-account",
})
const openaiAuth = Layer.mock(Auth.Service)({
  get: (providerID) => Effect.succeed(providerID === OPENAI_PROVIDER_ID ? openaiOauth : undefined),
  all: () => Effect.succeed({ [OPENAI_PROVIDER_ID]: openaiOauth }),
})
const passthroughPlugin = Layer.mock(Plugin.Service)({
  trigger: (_name, _input, output) => Effect.succeed(output),
})

const trigger: Plugin.Interface["trigger"] = (name, _input, output) =>
  Effect.sync(() => {
    hookNames.push(name)
    hookInputs.push(JSON.stringify(_input))
    if (hookFails) throw new Error(ERROR_SECRET)
    if (name === "chat.headers") {
      const incoming = _input as { model: Provider.Model }
      incoming.model.options.pluginSemanticControl = PLUGIN_SECRET
      incoming.model.cost.input = 0
      incoming.model.cost.output = 0
      incoming.model.cost.cache.read = 0
      incoming.model.cost.cache.write = 0
      const value = output as { headers: Record<string, string> }
      value.headers.Authorization = `Bearer ${HEADER_SECRET}`
    }
    return output
  })
const plugin = Layer.mock(Plugin.Service, { trigger })
const root = LayerNode.group([
  Session.node,
  Config.node,
  Auth.node,
  Plugin.node,
  Provider.node,
  Database.node,
  EventV2Bridge.node,
  SessionProjector.node,
])
const it = testEffect(
  AppNodeBuilder.build(root, [
    [Provider.node, provider.layer],
    [Plugin.node, plugin],
  ]),
)
const openaiIt = testEffect(
  AppNodeBuilder.build(root, [
    [Provider.node, openaiProvider.layer],
    [Plugin.node, passthroughPlugin],
    [Auth.node, openaiAuth],
  ]),
)

const machineConfig = {
  representation: {
    model: {
      provider_id: PROVIDER_ID,
      model_id: MODEL_ID,
      variant: "stable",
      max_input_bytes: 1024 * 1024,
      max_output_bytes: 1024 * 1024,
      timeout_ms: 30_000,
    },
  },
} as const

const openaiMachineConfig = {
  representation: {
    model: {
      provider_id: OPENAI_PROVIDER_ID,
      model_id: OPENAI_MODEL_ID,
      variant: "stable",
      max_input_bytes: 1024 * 1024,
      max_output_bytes: 1024 * 1024,
      timeout_ms: 30_000,
    },
  },
} as const

it.instance(
  "uses the exact machine profile and returns only canonical secret-free provenance",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      reset(successParts())
      const input = yield* admittedInput()
      const resolved = yield* RepresentationModel.resolveRecipe(input)

      expect(languageResolutions).toBe(0)
      expect(language.doStreamCalls).toHaveLength(0)
      expect(resolved.recipe).toMatchObject({
        kind: "configured_model",
        providerID: PROVIDER_ID,
        modelID: MODEL_ID,
        profile: { id: ModelRenditionProfile.PROFILE, version: 1 },
        variant: "stable",
        nativeInputCapability: "pdf",
        sampling: { temperature: 0.25, topP: 0.8, topK: 20, maxOutputTokens: 1024 },
      })

      const candidate = yield* resolved.sample({
        bytes: input.bytes,
        attestation: input.attestation,
      })

      expect(language.doStreamCalls).toHaveLength(1)
      expect(languageResolutions).toBe(1)
      expect(languageModels[0]?.options).toEqual({})
      expect(languageModels[0]?.variants).toBeUndefined()
      expect(resolvedRefs).toEqual([`${PROVIDER_ID}/${MODEL_ID}`])
      expect(hookNames).toEqual(["chat.headers"])
      expect(hookInputs[0]).not.toContain("attacker-agent")
      expect(hookInputs[0]).not.toContain("attacker-provider")
      expect(hookInputs[0]).not.toContain("attacker-model")
      expect(hookInputs[0]).not.toContain("attacker-variant")
      expect(hookInputs[0]).not.toContain("ATTACKER_SYSTEM")
      expect(candidate.provenance).toMatchObject({
        kind: "configured_model",
        providerID: PROVIDER_ID,
        modelID: MODEL_ID,
        profile: { id: ModelRenditionProfile.PROFILE, version: 1 },
        variant: "stable",
        nativeInputCapability: "pdf",
        sampling: { temperature: 0.25, topP: 0.8, topK: 20, maxOutputTokens: 1024 },
      })
      expect(candidate.canonicalizer).toEqual({ id: ModelRenditionProfile.CANONICALIZER, version: 1 })
      expect(candidate.terminalStatus).toBe("stop")
      expect(candidate.document).toEqual({
        rendition: "Readable content",
        uncertainty: ["Diagram labels may be incomplete"],
        omissions: [],
      })
      expect(candidate.usage?.kind).toBe("configured_model")
      expect(candidate.usage?.cost).toBeGreaterThan(0)
      expect(ModelRenditionProfile.decode(candidate.bytes)).toEqual({
        ok: true,
        value: { bytes: candidate.bytes, document: candidate.document },
      })

      const call = language.doStreamCalls[0]!
      expect(call.temperature).toBe(0.25)
      expect(call.topP).toBe(0.8)
      expect(call.topK).toBe(20)
      expect(call.maxOutputTokens).toBe(1024)
      expect(call.tools ?? []).toEqual([])
      expect(call.toolChoice).toBeUndefined()
      expect(call.headers?.Authorization).toBe(`Bearer ${HEADER_SECRET}`)
      const prompt = JSON.stringify(call.prompt)
      expect(prompt).toContain("readable access rendition")
      expect(prompt).not.toContain("attacker-provider")
      expect(prompt).not.toContain("attacker-variant")
      expect(JSON.stringify(call.providerOptions)).not.toContain(MODEL_SECRET)
      expect(JSON.stringify(call.providerOptions)).not.toContain(PLUGIN_SECRET)

      const durable = JSON.stringify(candidate)
      expect(durable).not.toContain(HEADER_SECRET)
      expect(durable).not.toContain(MODEL_SECRET)
      expect(durable).not.toContain(PROVIDER_SECRET)
      expect(durable).not.toContain(METADATA_SECRET)
      expect(durable).not.toContain(PLUGIN_SECRET)

      const second = yield* Effect.result(resolved.sample({ bytes: input.bytes, attestation: input.attestation }))
      expect(Result.isFailure(second) && second.failure).toMatchObject({ code: "already_sampled" })
      expect(language.doStreamCalls).toHaveLength(1)
      expect(languageResolutions).toBe(1)
    }),
  { config: machineConfig },
)

openaiIt.instance(
  "adapts the fixed token ceiling to ChatGPT OAuth transport",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      openaiLanguage = responseLanguage(successParts(), OPENAI_PROVIDER_ID, OPENAI_MODEL_ID)
      const input = yield* admittedInput()
      const resolved = yield* RepresentationModel.resolveRecipe(input)
      const candidate = yield* resolved.sample({ bytes: input.bytes, attestation: input.attestation })

      expect(candidate.provenance.sampling.maxOutputTokens).toBe(1024)
      expect(openaiLanguage.doStreamCalls).toHaveLength(1)
      const call = openaiLanguage.doStreamCalls[0]!
      expect(call.maxOutputTokens).toBeUndefined()
      expect(JSON.stringify(call.prompt)).not.toContain("readable access rendition")
      expect(call.providerOptions?.openai).toMatchObject({
        store: false,
        instructions: expect.stringContaining("readable access rendition"),
      })
    }),
  { config: openaiMachineConfig },
)

openaiIt.instance(
  "rejects ChatGPT OAuth usage above the fixed token ceiling",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      openaiLanguage = responseLanguage(successParts(), OPENAI_PROVIDER_ID, OPENAI_MODEL_ID)
      const result = yield* Effect.result(RepresentationModel.sample(yield* admittedInput()))

      expect(Result.isFailure(result) && result.failure).toMatchObject({
        code: "truncated",
        field: "max_output_tokens",
      })
      expect(openaiLanguage.doStreamCalls).toHaveLength(1)
      expect(openaiLanguage.doStreamCalls[0]?.maxOutputTokens).toBeUndefined()
    }),
  {
    config: {
      representation: {
        model: { ...openaiMachineConfig.representation.model, max_output_tokens: 4 },
      },
    },
  },
)

openaiIt.instance(
  "rejects ChatGPT OAuth without finite terminal output usage",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      openaiLanguage = responseLanguage(textParts(validText(), "stop", Number.NaN), OPENAI_PROVIDER_ID, OPENAI_MODEL_ID)
      const result = yield* Effect.result(RepresentationModel.sample(yield* admittedInput()))

      expect(Result.isFailure(result) && result.failure).toMatchObject({
        code: "incomplete",
        field: "max_output_tokens",
      })
      expect(openaiLanguage.doStreamCalls).toHaveLength(1)
      expect(openaiLanguage.doStreamCalls[0]?.maxOutputTokens).toBeUndefined()
    }),
  { config: openaiMachineConfig },
)

it.instance(
  "fails a missing profile before resolving identity or a default model",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      reset(successParts())
      const result = yield* Effect.result(
        RepresentationModel.resolveRecipe({
          sessionID: SessionID.make("ses_missing-profile"),
          messageID: MessageID.make("msg_missing-profile"),
          mediaType: "application/pdf",
        }),
      )

      expect(Result.isFailure(result) && result.failure).toMatchObject({
        code: "profile_missing",
        field: "profile",
      })
      expect(resolvedRefs).toEqual([])
      expect(languageResolutions).toBe(0)
    }),
  { config: {} },
)

it.instance(
  "fails an explicitly disabled profile without requiring model identity",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      reset(successParts())
      const result = yield* Effect.result(
        RepresentationModel.resolveRecipe({
          sessionID: SessionID.make("ses_disabled-profile"),
          messageID: MessageID.make("msg_disabled-profile"),
          mediaType: "application/pdf",
        }),
      )

      expect(Result.isFailure(result) && result.failure).toMatchObject({
        code: "profile_disabled",
        field: "profile",
      })
      expect(resolvedRefs).toEqual([])
      expect(languageResolutions).toBe(0)
    }),
  { config: { representation: { model: { enabled: false } } } },
)

it.instance(
  "fails missing identity and unsupported modality before provider sampling",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      reset(successParts())
      const bytes = new TextEncoder().encode("fake-pdf")
      const missing = yield* Effect.result(
        RepresentationModel.sample({
          sessionID: SessionID.make("ses_missing-representation"),
          messageID: MessageID.make("msg_missing-representation"),
          bytes,
          mediaType: "application/pdf",
          attestation: attest(bytes),
        }),
      )
      expect(Result.isFailure(missing) && missing.failure).toMatchObject({
        code: "session_missing",
        field: "session",
      })
      expect(language.doStreamCalls).toHaveLength(0)

      const input = yield* admittedInput()
      currentModel = {
        ...baseModel,
        capabilities: {
          ...baseModel.capabilities,
          input: { ...baseModel.capabilities.input, pdf: false },
        },
      }
      const unsupported = yield* Effect.result(RepresentationModel.sample(input))
      expect(Result.isFailure(unsupported) && unsupported.failure).toMatchObject({
        code: "capability_unsupported",
        field: "media_type",
      })
      expect(language.doStreamCalls).toHaveLength(0)

      reset(successParts())
      currentModel.variants!.stable = {
        ...currentModel.variants!.stable,
        reasoningEffort: "high",
      }
      const unknownVariantControl = yield* Effect.result(RepresentationModel.sample(input))
      expect(Result.isFailure(unknownVariantControl) && unknownVariantControl.failure).toMatchObject({
        code: "profile_invalid",
        field: "variant",
      })
      expect(language.doStreamCalls).toHaveLength(0)
    }),
  { config: machineConfig },
)

it.instance(
  "rejects provider and hook failures, tool use, truncation, filtering, and malformed schema",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      const input = yield* admittedInput()

      reset(successParts())
      languageResolutionFails = true
      const resolutionFailure = yield* Effect.result(RepresentationModel.sample(input))
      expect(Result.isFailure(resolutionFailure) && resolutionFailure.failure).toMatchObject({
        code: "provider_failure",
        field: "provider",
      })
      expect(JSON.stringify(Result.isFailure(resolutionFailure) ? resolutionFailure.failure : undefined)).not.toContain(
        ERROR_SECRET,
      )
      expect(language.doStreamCalls).toHaveLength(0)

      reset(successParts())
      hookFails = true
      const hookFailure = yield* Effect.result(RepresentationModel.sample(input))
      expect(Result.isFailure(hookFailure) && hookFailure.failure).toMatchObject({
        code: "provider_failure",
        field: "provider",
      })
      expect(JSON.stringify(Result.isFailure(hookFailure) ? hookFailure.failure : undefined)).not.toContain(
        ERROR_SECRET,
      )
      expect(language.doStreamCalls).toHaveLength(0)

      const cases: ReadonlyArray<{ parts: LanguageModelV3StreamPart[]; code: RepresentationModel.FailureCode }> = [
        {
          parts: [
            { type: "stream-start", warnings: [] },
            { type: "tool-call", toolCallId: "tool-1", toolName: "write", input: "{}" },
          ],
          code: "tool_attempted",
        },
        { parts: textParts(validText(), "length"), code: "truncated" },
        { parts: textParts(validText(), "content-filter"), code: "content_filtered" },
        {
          parts: textParts(
            JSON.stringify({ rendition: "Readable", uncertainty: [], omissions: [], extra: "not allowed" }),
          ),
          code: "invalid_schema",
        },
        {
          parts: textParts(
            JSON.stringify({
              rendition: "Readable",
              uncertainty: Array.from({ length: 257 }, () => "bounded claim"),
              omissions: [],
            }),
          ),
          code: "diagnostic_overflow",
        },
        {
          parts: [
            { type: "stream-start", warnings: [] },
            { type: "error", error: new Error(ERROR_SECRET) },
          ],
          code: "provider_failure",
        },
      ]

      for (const item of cases) {
        reset(item.parts)
        const result = yield* Effect.result(RepresentationModel.sample(input))
        expect(Result.isFailure(result) && result.failure).toMatchObject({ code: item.code })
        expect(JSON.stringify(Result.isFailure(result) ? result.failure : result.success)).not.toContain(ERROR_SECRET)
        expect(language.doStreamCalls).toHaveLength(1)
      }
    }),
  { config: machineConfig },
)

it.instance(
  "aborts one provider result when its raw or canonical output exceeds the configured byte ceiling",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      reset(textParts(JSON.stringify({ rendition: "x".repeat(256), uncertainty: [], omissions: [] })))
      const result = yield* Effect.result(RepresentationModel.sample(yield* admittedInput()))

      expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "output_overflow", field: "result" })
      expect(language.doStreamCalls).toHaveLength(1)
    }),
  {
    config: {
      representation: {
        model: { ...machineConfig.representation.model, max_output_bytes: 128 },
      },
    },
  },
)

it.instance(
  "aborts and awaits a hanging provider stream without exposing its error",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      reset("hang")
      const input = yield* admittedInput()
      const abort = new AbortController()
      const fiber = yield* Effect.result(RepresentationModel.sample({ ...input, abort: abort.signal })).pipe(
        Effect.forkChild,
      )
      yield* pollWithTimeout(
        Effect.sync(() => (language.doStreamCalls.length === 1 ? true : undefined)),
        "representation provider was not called",
      )
      abort.abort()
      const result = yield* Fiber.join(fiber)

      expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "cancelled" })
      expect(JSON.stringify(Result.isFailure(result) ? result.failure : result.success)).not.toContain(ERROR_SECRET)
      expect(language.doStreamCalls).toHaveLength(1)
      expect(streamAborts).toBe(1)
    }),
  { config: machineConfig },
)

it.instance(
  "bounds provider setup and streaming with one wall-clock deadline",
  () =>
    Effect.gen(function* () {
      yield* TestInstance
      yield* Scope.Scope
      reset("hang")
      const input = yield* admittedInput()
      languageResolutionHangs = true
      const setup = yield* Effect.result(RepresentationModel.sample(input))

      expect(Result.isFailure(setup) && setup.failure).toMatchObject({ code: "timed_out" })
      expect(language.doStreamCalls).toHaveLength(0)
      expect(streamAborts).toBe(0)

      languageResolutionHangs = false
      const stream = yield* Effect.result(RepresentationModel.sample(input))
      expect(Result.isFailure(stream) && stream.failure).toMatchObject({ code: "timed_out" })
      expect(language.doStreamCalls).toHaveLength(1)
      expect(streamAborts).toBe(1)
    }),
  {
    config: {
      representation: {
        model: { ...machineConfig.representation.model, timeout_ms: 50 },
      },
    },
  },
)

function reset(parts: LanguageModelV3StreamPart[] | "hang") {
  currentModel = structuredClone(baseModel)
  language = responseLanguage(parts)
  hookNames = []
  hookInputs = []
  resolvedRefs = []
  languageResolutions = 0
  languageModels = []
  languageResolutionHangs = false
  languageResolutionFails = false
  streamAborts = 0
  hookFails = false
}

const admittedInput = Effect.fn("Test.admittedRepresentationInput")(function* () {
  const seeded = yield* materializeTestSession({
    title: "Representation test",
    agent: "attacker-agent",
    model: {
      providerID: ProviderV2.ID.make("attacker-provider"),
      modelID: ModelV2.ID.make("attacker-model"),
      variant: "attacker-variant",
    },
    text: "representation input",
  })
  const bytes = new TextEncoder().encode("%PDF-1.7 fake fixture")
  return {
    sessionID: seeded.info.id,
    messageID: seeded.user.id,
    bytes,
    mediaType: "application/pdf" as const,
    attestation: attest(bytes),
  }
})

function responseLanguage(parts: LanguageModelV3StreamPart[] | "hang", providerID = PROVIDER_ID, modelID = MODEL_ID) {
  return new MockLanguageModelV3({
    provider: providerID,
    modelId: modelID,
    doStream: async (options: LanguageModelV3CallOptions) => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          if (parts !== "hang") {
            parts.forEach((part) => controller.enqueue(part))
            controller.close()
            return
          }
          options.abortSignal?.addEventListener(
            "abort",
            () => {
              streamAborts++
              controller.error(new Error(ERROR_SECRET))
            },
            { once: true },
          )
        },
      }),
    }),
  })
}

function successParts() {
  return textParts(validText())
}

function validText() {
  return JSON.stringify({
    rendition: "Readable content",
    uncertainty: ["Diagram labels may be incomplete"],
    omissions: [],
  })
}

function textParts(
  text: string,
  reason: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" = "stop",
  outputTokens = 8,
): LanguageModelV3StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
    {
      type: "finish",
      finishReason: { unified: reason, raw: reason },
      usage: {
        inputTokens: { total: 12, noCache: 10, cacheRead: 2, cacheWrite: 0 },
        outputTokens: { total: outputTokens, text: 7, reasoning: 1 },
        raw: { secret: METADATA_SECRET },
      },
      providerMetadata: { test: { secret: METADATA_SECRET } },
    },
  ]
}

function attest(bytes: Uint8Array) {
  return {
    algorithm: "sha256" as const,
    digest: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
  }
}
