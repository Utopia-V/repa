export * as RepresentationModel from "./representation-model"

import { ConfigRepresentationV1 } from "@opencode-ai/core/v1/config/representation"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelRenditionProfile } from "@opencode-ai/core/representation/model-rendition-profile"
import { RepresentationSchema } from "@opencode-ai/core/representation/schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Usage } from "@opencode-ai/llm"
import { Effect, Exit, Schema } from "effect"
import { streamText, type ModelMessage } from "ai"

import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SystemPrompt } from "@/session/system"

const DEFAULT_INPUT_BYTES = 20 * 1024 * 1024
const DEFAULT_OUTPUT_BYTES = 1024 * 1024
const DEFAULT_OUTPUT_TOKENS = 16_384
const DEFAULT_TIMEOUT_MS = 120_000
const USER_AGENT = `repa/${InstallationVersion}`

export const FailureCode = Schema.Literals([
  "profile_missing",
  "profile_disabled",
  "profile_invalid",
  "session_missing",
  "message_missing",
  "message_invalid",
  "model_unresolved",
  "capability_unsupported",
  "input_mismatch",
  "cancelled",
  "timed_out",
  "output_overflow",
  "diagnostic_overflow",
  "provider_failure",
  "content_filtered",
  "tool_attempted",
  "truncated",
  "unknown_finish",
  "incomplete",
  "invalid_utf8",
  "invalid_schema",
  "empty_rendition",
  "already_sampled",
])
export type FailureCode = Schema.Schema.Type<typeof FailureCode>

export const FailureField = Schema.Literals([
  "profile",
  "provider",
  "model",
  "variant",
  "media_type",
  "session",
  "message",
  "source_bytes",
  "source_digest",
  "temperature",
  "top_p",
  "top_k",
  "max_output_tokens",
  "result",
])
export type FailureField = Schema.Schema.Type<typeof FailureField>

export class Failure extends Schema.TaggedErrorClass<Failure>()("RepresentationModelFailure", {
  code: FailureCode,
  field: Schema.optional(FailureField),
}) {
  static isInstance(input: unknown): input is Failure {
    return input instanceof Failure
  }
}

const Result = Schema.Struct({
  rendition: Schema.String,
  uncertainty: Schema.Array(Schema.String),
  omissions: Schema.Array(Schema.String),
})

export type ResolveInput = {
  readonly sessionID: SessionID
  readonly messageID: MessageID
  readonly mediaType: "application/pdf" | `image/${string}`
}

export type SampleInput = {
  readonly bytes: Uint8Array
  readonly attestation: {
    readonly algorithm: "sha256"
    readonly digest: string
    readonly byteLength: number
  }
  readonly abort?: AbortSignal
}

export type Input = ResolveInput & SampleInput

type Sampling = {
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly maxOutputTokens: number
}

type UsageProjection = RepresentationSchema.ConfiguredModelUsage

export type Candidate = {
  readonly bytes: Uint8Array
  readonly document: ModelRenditionProfile.Document
  readonly inputAttestation: {
    readonly algorithm: "sha256"
    readonly digest: string
    readonly byteLength: number
  }
  readonly provenance: RepresentationSchema.ConfiguredModelProvenance
  readonly canonicalizer: { readonly id: "repa.model-rendition-json.v1"; readonly version: 1 }
  readonly terminalStatus: "stop"
  readonly usage?: UsageProjection
}

export type Resolved = {
  readonly recipe: RepresentationSchema.ConfiguredModelProvenance
  readonly sample: (input: SampleInput) => Effect.Effect<Candidate, Failure>
}

type ProviderUsage = {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly totalTokens?: number
  readonly inputTokenDetails?: {
    readonly cacheReadTokens?: number
    readonly cacheWriteTokens?: number
  }
  readonly outputTokenDetails?: { readonly reasoningTokens?: number }
}

export const resolveRecipe = Effect.fn("RepresentationModel.resolveRecipe")(function* (input: ResolveInput) {
  const config = yield* Config.Service
  const sessions = yield* Session.Service
  const provider = yield* Provider.Service
  const plugin = yield* Plugin.Service
  const auth = yield* Auth.Service

  const cfg = yield* config.get()
  const profile = cfg.representation?.model
  if (!profile) return yield* fail("profile_missing", "profile")
  if (profile.enabled === false) return yield* fail("profile_disabled", "profile")
  if (!profile.provider_id.trim()) return yield* fail("profile_invalid", "provider")
  if (!profile.model_id.trim()) return yield* fail("profile_invalid", "model")
  if (profile.variant !== undefined && !profile.variant.trim()) return yield* fail("profile_invalid", "variant")

  const maxInputBytes = profile.max_input_bytes ?? DEFAULT_INPUT_BYTES
  const maxOutputBytes = profile.max_output_bytes ?? DEFAULT_OUTPUT_BYTES
  const timeoutMs = profile.timeout_ms ?? DEFAULT_TIMEOUT_MS
  if (input.mediaType !== "application/pdf" && !/^image\/[a-z0-9.+-]+$/i.test(input.mediaType)) {
    return yield* fail("profile_invalid", "media_type")
  }

  const session = yield* Effect.exit(sessions.get(input.sessionID))
  if (Exit.isFailure(session)) return yield* fail("session_missing", "session")
  const message = yield* Effect.exit(MessageV2.get({ sessionID: input.sessionID, messageID: input.messageID }))
  if (Exit.isFailure(message)) return yield* fail("message_missing", "message")
  if (message.value.info.role !== "user") return yield* fail("message_invalid", "message")

  const modelResult = yield* Effect.exit(
    provider.getModel(ProviderV2.ID.make(profile.provider_id.trim()), ModelV2.ID.make(profile.model_id.trim())),
  )
  if (Exit.isFailure(modelResult)) return yield* fail("model_unresolved", "model")
  const resolvedModel = modelResult.value
  if (!resolvedModel.capabilities.output.text) return yield* fail("capability_unsupported", "model")
  if (input.mediaType === "application/pdf" && !resolvedModel.capabilities.input.pdf) {
    return yield* fail("capability_unsupported", "media_type")
  }
  if (input.mediaType !== "application/pdf" && !resolvedModel.capabilities.input.image) {
    return yield* fail("capability_unsupported", "media_type")
  }
  if (resolvedModel.api.npm === "gitlab-ai-provider") return yield* fail("capability_unsupported", "model")

  const sampling = resolveSampling(profile, resolvedModel)
  if (Failure.isInstance(sampling)) return yield* sampling
  const model = representationModel(resolvedModel)
  const recipe = Object.freeze({
    kind: "configured_model",
    providerID: model.providerID,
    modelID: model.id,
    task: Object.freeze({ id: "representation", version: 1 }),
    profile: Object.freeze({ id: ModelRenditionProfile.PROFILE, version: 1 }),
    variant: profile.variant,
    mediaType: input.mediaType,
    nativeInputCapability: input.mediaType === "application/pdf" ? "pdf" : "image",
    sampling: Object.freeze(sampling),
    limits: Object.freeze({ inputBytes: maxInputBytes, outputBytes: maxOutputBytes, wallTimeMs: timeoutMs }),
  } satisfies RepresentationSchema.ConfiguredModelProvenance)
  const initiatingUser: SessionV1.User = {
    id: message.value.info.id,
    sessionID: message.value.info.sessionID,
    role: "user",
    time: { ...message.value.info.time },
    agent: "representation",
    model: { providerID: model.providerID, modelID: model.id },
  }
  let sampled = false

  return {
    recipe,
    sample: (sourceInput: SampleInput) =>
      Effect.suspend(() => {
        if (sampled) return Effect.fail(fail("already_sampled"))
        sampled = true
        return executeSample({
          input,
          sourceInput,
          recipe,
          model,
          initiatingUser,
          provider,
          plugin,
          auth,
        })
      }),
  } satisfies Resolved
})

export const sample = Effect.fn("RepresentationModel.sample")(function* (input: Input) {
  const resolved = yield* resolveRecipe(input)
  return yield* resolved.sample(input)
})

function executeSample(input: {
  readonly input: ResolveInput
  readonly sourceInput: SampleInput
  readonly recipe: RepresentationSchema.ConfiguredModelProvenance
  readonly model: Provider.Model
  readonly initiatingUser: SessionV1.User
  readonly provider: Provider.Interface
  readonly plugin: Plugin.Interface
  readonly auth: Auth.Interface
}) {
  return Effect.gen(function* () {
    const maxInputBytes = input.recipe.limits.inputBytes
    const maxOutputBytes = input.recipe.limits.outputBytes
    if (input.sourceInput.bytes.byteLength > maxInputBytes) return yield* fail("input_mismatch", "source_bytes")
    if (input.sourceInput.attestation.algorithm !== "sha256") return yield* fail("input_mismatch", "source_digest")
    if (
      !Number.isSafeInteger(input.sourceInput.attestation.byteLength) ||
      input.sourceInput.attestation.byteLength !== input.sourceInput.bytes.byteLength
    ) {
      return yield* fail("input_mismatch", "source_bytes")
    }
    if (!/^[0-9a-f]{64}$/i.test(input.sourceInput.attestation.digest)) {
      return yield* fail("input_mismatch", "source_digest")
    }
    if (input.sourceInput.abort?.aborted) return yield* fail("cancelled")

    const source = input.sourceInput.bytes.slice()
    const providerInfo = yield* Effect.exit(input.provider.getProvider(input.model.providerID))
    if (Exit.isFailure(providerInfo)) return yield* fail("provider_failure", "provider")
    const authInfo = yield* Effect.exit(input.auth.get(input.model.providerID))
    if (Exit.isFailure(authInfo)) return yield* fail("provider_failure", "provider")
    const language = yield* Effect.exit(input.provider.getRepresentationLanguage(input.model))
    if (Exit.isFailure(language)) return yield* fail("provider_failure", "provider")

    const transportModel = representationModel(input.model)
    const headers = yield* Effect.exit(
      input.plugin.trigger(
        "chat.headers",
        {
          sessionID: input.input.sessionID,
          agent: "representation",
          model: transportModel,
          provider: {
            ...providerInfo.value,
            options: { ...providerInfo.value.options },
            models: { [transportModel.id]: transportModel },
          },
          message: input.initiatingUser,
        },
        {
          headers: {
            "x-session-affinity": input.input.sessionID,
            "X-Session-Id": input.input.sessionID,
            "User-Agent": USER_AGENT,
            ...input.model.headers,
          },
        },
      ),
    )
    if (Exit.isFailure(headers)) return yield* fail("provider_failure", "provider")

    const digest = sha256(source)
    if (digest !== input.sourceInput.attestation.digest.toLowerCase()) {
      return yield* fail("input_mismatch", "source_digest")
    }

    const system = [SystemPrompt.internal(), SystemPrompt.internalTask("representation")]
    const isOpenaiOauth = input.model.providerID === "openai" && authInfo.value?.type === "oauth"
    const userMessage: ModelMessage = {
      role: "user",
      content:
        input.input.mediaType === "application/pdf"
          ? [{ type: "file", data: source, mediaType: input.input.mediaType, filename: "source.pdf" }]
          : [{ type: "image", image: source, mediaType: input.input.mediaType }],
    }
    const messages: ModelMessage[] = isOpenaiOauth
      ? [userMessage]
      : [...system.map((content): ModelMessage => ({ role: "system", content })), userMessage]
    const maxOutputTokens = isOpenaiOauth ? undefined : input.recipe.sampling.maxOutputTokens
    const options = {
      ...(["@ai-sdk/openai", "@ai-sdk/azure", "@ai-sdk/github-copilot"].includes(input.model.api.npm)
        ? { store: false }
        : {}),
      ...(isOpenaiOauth ? { instructions: system.join("\n\n") } : {}),
    }

    const captured = yield* Effect.tryPromise({
      try: async (effectSignal) => {
        const run = new AbortController()
        const signals = [effectSignal, run.signal, ...(input.sourceInput.abort ? [input.sourceInput.abort] : [])]
        const signal = AbortSignal.any(signals)
        const reject = (code: FailureCode, field?: FailureField): never => {
          run.abort()
          throw fail(code, field)
        }

        const response = streamText({
          model: language.value,
          messages,
          temperature: input.recipe.sampling.temperature,
          topP: input.recipe.sampling.topP,
          topK: input.recipe.sampling.topK,
          maxOutputTokens,
          providerOptions: ProviderTransform.providerOptions(input.model, options),
          headers: headers.value.headers,
          tools: {},
          toolChoice: "none",
          maxRetries: 0,
          abortSignal: signal,
          experimental_telemetry: { isEnabled: false },
          onError: () => {},
        })

        const chunks: string[] = []
        let approximateBytes = 0
        let finishCount = 0
        let terminal: string | undefined
        let usage: UsageProjection | undefined
        for await (const event of response.fullStream) {
          switch (event.type) {
            case "text-delta":
              chunks.push(event.text)
              approximateBytes += new TextEncoder().encode(event.text).byteLength
              if (approximateBytes > maxOutputBytes) reject("output_overflow", "result")
              break
            case "finish":
              finishCount++
              terminal = event.finishReason
              usage = projectUsage(input.model, event.totalUsage)
              if (isOpenaiOauth) {
                const outputTokens = finite(event.totalUsage.outputTokens) ?? reject("incomplete", "max_output_tokens")
                if (outputTokens > input.recipe.sampling.maxOutputTokens) {
                  reject("truncated", "max_output_tokens")
                }
              }
              break
            case "tool-input-start":
            case "tool-input-delta":
            case "tool-input-end":
            case "tool-call":
            case "tool-result":
            case "tool-error":
            case "tool-approval-request":
              return reject("tool_attempted", "result")
            case "file":
            case "source":
              return reject("invalid_schema", "result")
            case "error":
              return reject("provider_failure", "result")
            case "abort":
              return reject(input.sourceInput.abort?.aborted ? "cancelled" : "provider_failure")
          }
        }

        if (finishCount !== 1) reject("incomplete", "result")
        if (terminal === "content-filter") reject("content_filtered", "result")
        if (terminal === "tool-calls") reject("tool_attempted", "result")
        if (terminal === "length") reject("truncated", "result")
        if (terminal === "error") reject("provider_failure", "result")
        if (terminal !== "stop") reject("unknown_finish", "result")

        const text = chunks.join("")
        if (hasUnpairedSurrogate(text)) reject("invalid_utf8", "result")
        const bytes = new TextEncoder().encode(text)
        if (bytes.byteLength > maxOutputBytes) reject("output_overflow", "result")
        const decoded = Schema.decodeUnknownExit(Schema.fromJsonString(Result))(text, {
          errors: "all",
          onExcessProperty: "error",
        })
        if (Exit.isFailure(decoded)) return reject("invalid_schema", "result")
        const limits = {
          ...ModelRenditionProfile.defaultLimits,
          maxProfileBytes: maxOutputBytes,
          maxRenditionBytes: Math.min(ModelRenditionProfile.defaultLimits.maxRenditionBytes, maxOutputBytes),
        }
        const canonical = ModelRenditionProfile.encode(decoded.value, limits)
        if (!canonical.ok) {
          run.abort()
          throw profileFailure(canonical.error)
        }
        const verified = ModelRenditionProfile.decode(canonical.value.bytes, limits)
        if (!verified.ok) return reject("invalid_schema", "result")

        return { bytes: verified.value.bytes, document: verified.value.document, usage }
      },
      catch: (cause) => {
        if (Failure.isInstance(cause)) return cause
        if (input.sourceInput.abort?.aborted) return fail("cancelled")
        return fail("provider_failure")
      },
    })

    return {
      bytes: captured.bytes,
      document: captured.document,
      inputAttestation: { algorithm: "sha256", digest, byteLength: source.byteLength },
      provenance: input.recipe,
      canonicalizer: { id: ModelRenditionProfile.CANONICALIZER, version: 1 },
      terminalStatus: "stop",
      usage: captured.usage,
    } satisfies Candidate
  }).pipe(
    Effect.timeoutOrElse({
      duration: input.recipe.limits.wallTimeMs,
      orElse: () => Effect.fail(fail("timed_out")),
    }),
  )
}

function fail(code: FailureCode, field?: FailureField) {
  return new Failure({ code, field })
}

function representationModel(model: Provider.Model): Provider.Model {
  return {
    ...model,
    api: { ...model.api },
    capabilities: {
      ...model.capabilities,
      input: { ...model.capabilities.input },
      output: { ...model.capabilities.output },
      interleaved:
        typeof model.capabilities.interleaved === "object"
          ? { ...model.capabilities.interleaved }
          : model.capabilities.interleaved,
    },
    cost: {
      ...model.cost,
      cache: { ...model.cost.cache },
      tiers: model.cost.tiers?.map((tier) => ({ ...tier, cache: { ...tier.cache }, tier: { ...tier.tier } })),
      experimentalOver200K: model.cost.experimentalOver200K
        ? { ...model.cost.experimentalOver200K, cache: { ...model.cost.experimentalOver200K.cache } }
        : undefined,
    },
    limit: { ...model.limit },
    options: {},
    headers: { ...model.headers },
    variants: undefined,
  }
}

function resolveSampling(
  profile: ConfigRepresentationV1.ActiveModelProfile,
  model: Provider.Model,
): Sampling | Failure {
  const variant = profile.variant === undefined ? {} : model.variants?.[profile.variant]
  if (profile.variant !== undefined && !variant) return fail("profile_invalid", "variant")
  const unknown = Object.keys(variant ?? {}).find(
    (key) => !["temperature", "topP", "topK", "maxOutputTokens"].includes(key),
  )
  if (unknown) return fail("profile_invalid", "variant")

  const temperature = profile.temperature ?? variant?.temperature
  const topP = profile.top_p ?? variant?.topP
  const topK = profile.top_k ?? variant?.topK
  const configuredOutputTokens = profile.max_output_tokens ?? variant?.maxOutputTokens ?? DEFAULT_OUTPUT_TOKENS
  if (temperature !== undefined && !boundedNumber(temperature, 0, 2)) return fail("profile_invalid", "temperature")
  if (temperature !== undefined && !model.capabilities.temperature) return fail("capability_unsupported", "temperature")
  if (topP !== undefined && !boundedNumber(topP, 0, 1)) return fail("profile_invalid", "top_p")
  if (topK !== undefined && !boundedInteger(topK, 1, 1_000)) return fail("profile_invalid", "top_k")
  if (!boundedInteger(configuredOutputTokens, 1, 32_768)) return fail("profile_invalid", "max_output_tokens")

  return {
    temperature,
    topP,
    topK,
    maxOutputTokens: Math.min(
      configuredOutputTokens,
      model.limit.output > 0 ? model.limit.output : DEFAULT_OUTPUT_TOKENS,
    ),
  }
}

function boundedNumber(input: unknown, minimum: number, maximum: number): input is number {
  return typeof input === "number" && Number.isFinite(input) && input >= minimum && input <= maximum
}

function boundedInteger(input: unknown, minimum: number, maximum: number): input is number {
  return Number.isInteger(input) && boundedNumber(input, minimum, maximum)
}

function sha256(input: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex")
}

function hasUnpairedSurrogate(input: string) {
  for (let i = 0; i < input.length; i++) {
    const current = input.charCodeAt(i)
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = input.charCodeAt(i + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      i++
      continue
    }
    if (current >= 0xdc00 && current <= 0xdfff) return true
  }
  return false
}

function projectUsage(model: Provider.Model, input: ProviderUsage | undefined): UsageProjection | undefined {
  if (!input) return undefined
  const values = {
    inputTokens: finite(input.inputTokens),
    outputTokens: finite(input.outputTokens),
    totalTokens: finite(input.totalTokens),
    cacheReadInputTokens: finite(input.inputTokenDetails?.cacheReadTokens),
    cacheWriteInputTokens: finite(input.inputTokenDetails?.cacheWriteTokens),
    reasoningTokens: finite(input.outputTokenDetails?.reasoningTokens),
  }
  if (Object.values(values).every((value) => value === undefined)) return undefined
  const projected = Session.getUsage({ model, usage: new Usage(values) })
  const hasBillableUsage = [
    values.inputTokens,
    values.outputTokens,
    values.cacheReadInputTokens,
    values.cacheWriteInputTokens,
    values.reasoningTokens,
  ].some((value) => value !== undefined)
  return {
    kind: "configured_model",
    cost: modelHasCost(model) && hasBillableUsage ? finite(projected.cost) : undefined,
    tokens: {
      total: values.totalTokens,
      input: values.inputTokens === undefined ? undefined : projected.tokens.input,
      output: values.outputTokens === undefined ? undefined : projected.tokens.output,
      reasoning: values.reasoningTokens === undefined ? undefined : projected.tokens.reasoning,
      cache:
        values.cacheReadInputTokens === undefined && values.cacheWriteInputTokens === undefined
          ? undefined
          : {
              read: values.cacheReadInputTokens === undefined ? undefined : projected.tokens.cache.read,
              write: values.cacheWriteInputTokens === undefined ? undefined : projected.tokens.cache.write,
            },
    },
  }
}

function profileFailure(error: ModelRenditionProfile.ErrorCode) {
  if (error === "empty_rendition") return fail("empty_rendition", "result")
  if (error === "claim_limit_exceeded") return fail("diagnostic_overflow", "result")
  if (error === "profile_limit_exceeded" || error === "rendition_limit_exceeded") {
    return fail("output_overflow", "result")
  }
  if (error === "invalid_encoding") return fail("invalid_utf8", "result")
  return fail("invalid_schema", "result")
}

function modelHasCost(model: Provider.Model) {
  if (model.cost.input > 0 || model.cost.output > 0 || model.cost.cache.read > 0 || model.cost.cache.write > 0) {
    return true
  }
  return (
    model.cost.tiers?.some(
      (item) => item.input > 0 || item.output > 0 || item.cache.read > 0 || item.cache.write > 0,
    ) ?? false
  )
}

function finite(input: number | undefined) {
  if (input === undefined || !Number.isFinite(input) || input < 0) return undefined
  return input
}
