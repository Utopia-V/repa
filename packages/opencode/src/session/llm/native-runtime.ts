import type { Auth } from "@/auth"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { errorMessage } from "@/util/error"
import { isRecord } from "@/util/record"
import { asSchema, type ModelMessage, type Tool } from "ai"
import { Effect } from "effect"
import * as Stream from "effect/Stream"
import {
  LLMClient,
  LLMRequest,
  Tool as NativeTool,
  ToolDefinition,
  ToolFailure,
  type JsonSchema,
  type LLMEvent,
} from "@opencode-ai/llm"
import type { LLMClientShape } from "@opencode-ai/llm/route"
import { LLMNative } from "./native-request"
import { isDeepStrictEqual } from "node:util"
import { ProviderWire } from "@/provider/wire"

export type RuntimeStatus =
  | { readonly type: "supported"; readonly apiKey: string; readonly baseURL?: string }
  | { readonly type: "unsupported"; readonly reason: string }
export type StreamResult =
  | { readonly type: "supported"; readonly stream: Stream.Stream<LLMEvent, unknown> }
  | { readonly type: "unsupported"; readonly reason: string }

type PlanBase = Readonly<{
  type: "supported"
  input: Omit<StreamInput, "llmClient" | "abort">
  apiKey: string
  baseURL?: string
  definitions: readonly ToolDefinition[]
  route: Readonly<{ provider: string; model: string; route: string; protocol: string }>
  toolChoice: unknown
}>

export type Plan = Omit<PlanBase, "route"> &
  Readonly<{
    route: PlanBase["route"] &
      Readonly<{ compiler: ProviderWire.Certificate; transport: ProviderWire.Surface["transport"] }>
    providerSurface: ProviderWire.Surface
  }>

export type PlanResult = PlanBase | Readonly<{ type: "unsupported"; reason: string }>

const NATIVE_CERTIFICATE = {
  sourcePackage: "@opencode-ai/llm",
  sourceVersion: "1.17.18",
  projector: "native-route",
  projectorVersion: 1,
  promptFields: ["contents", "input", "instructions", "messages", "system", "systemInstruction"],
  publicQuery: ["$alt", "alt", "api-version", "prettyPrint"],
  credentialQuery: ["api-key", "key"],
  bodyCredentials: ["openai_hosted_mcp"],
  compilerAuth: "api_key",
  terminalRoutes: [],
} as const satisfies ProviderWire.Certificate

type StreamInput = {
  readonly model: Provider.Model
  readonly provider: Provider.Info
  readonly auth: Auth.Info | undefined
  readonly llmClient: LLMClientShape
  readonly messages: ModelMessage[]
  readonly tools: Record<string, Tool>
  readonly toolChoice?: "auto" | "required" | "none"
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly maxOutputTokens?: number
  readonly providerOptions?: Record<string, any>
  readonly headers: Record<string, string>
  readonly abort: AbortSignal
}

export function status(input: Pick<StreamInput, "model" | "provider" | "auth">): RuntimeStatus {
  const providerID = input.model.providerID
  if (providerID !== "openai" && providerID !== "anthropic")
    return { type: "unsupported", reason: "provider is not openai or anthropic" }
  const npm = input.model.api.npm
  if (npm !== "@ai-sdk/openai" && npm !== "@ai-sdk/openai-compatible" && npm !== "@ai-sdk/anthropic")
    return { type: "unsupported", reason: "provider package is not OpenAI, OpenAI-compatible, or Anthropic" }
  if (input.auth?.type === "oauth")
    return { type: "unsupported", reason: "OAuth auth uses the certified AI SDK terminal route" }

  const apiKey = typeof input.provider.options.apiKey === "string" ? input.provider.options.apiKey : input.provider.key
  if (!apiKey) return { type: "unsupported", reason: "API key is not configured" }

  return {
    type: "supported",
    apiKey,
    baseURL: typeof input.provider.options.baseURL === "string" ? input.provider.options.baseURL : undefined,
  }
}

export function stream(input: StreamInput): StreamResult {
  const planned = plan(input)
  if (planned.type === "unsupported") return planned
  if (!input.llmClient.prepareStream) {
    const request = nativeRequest(planned.input, planned, planned.definitions, input.messages)
    const fallback = input.llmClient.stream(request)
    return {
      type: "supported",
      stream: fallback,
    }
  }
  return {
    type: "supported",
    stream: Stream.unwrap(
      Effect.gen(function* () {
        const bound = yield* bindProviderSurface({ plan: planned, llmClient: input.llmClient })
        return (yield* prepare({ plan: bound, llmClient: input.llmClient, messages: input.messages })).stream
      }),
    ),
  }
}

export function plan(input: Omit<StreamInput, "llmClient" | "abort">): PlanResult {
  const current = status(input)
  if (current.type === "unsupported") return current
  const request = nativeRequest(input, current, providerToolDefinitions(input.tools), input.messages)
  const resolved = LLMClient.resolveRequest(request)
  return {
    type: "supported",
    input,
    apiKey: current.apiKey,
    baseURL: current.baseURL,
    definitions: resolved.tools,
    route: {
      provider: String(resolved.model.provider),
      model: String(resolved.model.id),
      route: resolved.model.route.id,
      protocol: String(resolved.model.route.protocol),
    },
    toolChoice: resolved.toolChoice,
  }
}

export const bindProviderSurface = Effect.fn("LLMNativeRuntime.bindProviderSurface")(function* (input: {
  readonly plan: PlanBase
  readonly llmClient: LLMClientShape
}) {
  if (!input.llmClient.prepareStream) {
    return yield* Effect.fail(new Error("Native Gate 18 binding requires compile-once stream support"))
  }
  const request = nativeRequest(input.plan.input, input.plan, input.plan.definitions, [
    { role: "user", content: "[Gate 18 native provider-tool surface probe]" },
  ])
  const prepared = yield* input.llmClient.prepareStream(request)
  if (prepared.route.id !== input.plan.route.route || prepared.route.protocol !== input.plan.route.protocol) {
    return yield* Effect.fail(new Error("Native provider route changed while binding the Gate 18 tool surface"))
  }
  const compiled = yield* Effect.promise(() =>
    ProviderWire.normalize({
      certificate: NATIVE_CERTIFICATE,
      method: prepared.transport.method,
      url: prepared.transport.url,
      body: prepared.body,
    }),
  )
  const providerSurface = ProviderWire.projectCertified(
    NATIVE_CERTIFICATE,
    compiled,
    input.plan.definitions.map((definition) => String(definition.name)),
  )
  return {
    ...input.plan,
    route: { ...input.plan.route, compiler: NATIVE_CERTIFICATE, transport: providerSurface.transport },
    providerSurface,
  } satisfies Plan
})

export const prepare = Effect.fn("LLMNativeRuntime.prepare")(function* (input: {
  readonly plan: Plan
  readonly llmClient: LLMClientShape
  readonly messages: ModelMessage[]
  readonly providerOptions?: Record<string, any>
}) {
  const request = nativeRequest(
    { ...input.plan.input, providerOptions: input.providerOptions ?? input.plan.input.providerOptions },
    input.plan,
    input.plan.definitions,
    input.messages,
  )
  const resolved = LLMClient.resolveRequest(request)
  if (
    !isDeepStrictEqual(resolved.tools, input.plan.definitions) ||
    !isDeepStrictEqual(resolved.toolChoice, input.plan.toolChoice)
  ) {
    return yield* Effect.fail(new Error("Native provider tool surface changed after Gate 18 admission"))
  }
  if (!input.llmClient.prepareStream) {
    return yield* Effect.fail(new Error("Native Gate 18 preparation requires compile-once stream support"))
  }
  const prepared = yield* input.llmClient.prepareStream(request)
  const compiled = yield* Effect.promise(() =>
    ProviderWire.normalize({
      certificate: NATIVE_CERTIFICATE,
      method: prepared.transport.method,
      url: prepared.transport.url,
      body: prepared.body,
    }),
  )
  const surface = ProviderWire.projectCertified(
    NATIVE_CERTIFICATE,
    compiled,
    input.plan.definitions.map((definition) => String(definition.name)),
  )
  if (
    prepared.route.id !== input.plan.route.route ||
    prepared.route.protocol !== input.plan.route.protocol ||
    !isDeepStrictEqual(prepared.request.tools, input.plan.definitions) ||
    !isDeepStrictEqual(prepared.request.toolChoice, input.plan.toolChoice) ||
    !isDeepStrictEqual(surface, input.plan.providerSurface)
  ) {
    return yield* Effect.fail(new Error("Native compiled request changed its admitted provider surface"))
  }
  return {
    surface,
    compiled,
    stream: prepared.stream,
  }
})

function nativeRequest(
  input: Omit<StreamInput, "llmClient" | "abort">,
  auth: Pick<Plan, "apiKey" | "baseURL">,
  definitions: readonly ToolDefinition[],
  messages: ModelMessage[],
) {
  // ProviderTransform.providerOptions builds AI-SDK-shaped options for the
  // selected SDK key and the native SDK consumes those same official fields.
  return LLMNative.request({
    model: input.model,
    apiKey: auth.apiKey,
    baseURL: auth.baseURL,
    messages: ProviderTransform.message(messages, input.model, input.providerOptions ?? {}),
    definitions,
    toolChoice: input.toolChoice,
    temperature: input.temperature,
    topP: input.topP,
    topK: input.topK,
    maxOutputTokens: input.maxOutputTokens,
    providerOptions: ProviderTransform.providerOptions(input.model, input.providerOptions ?? {}),
    headers: { ...providerHeaders(input.provider.options.headers), ...input.headers },
  })
}

function providerHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
}

function nativeSchema(value: unknown): JsonSchema {
  if (!value || typeof value !== "object") return { type: "object", properties: {} }
  if ("jsonSchema" in value && value.jsonSchema && typeof value.jsonSchema === "object")
    return value.jsonSchema as JsonSchema
  return asSchema(value as Parameters<typeof asSchema>[0]).jsonSchema as JsonSchema
}

function providerToolDefinitions(tools: Record<string, Tool>) {
  return Object.entries(tools).map(([name, item]) =>
    ToolDefinition.make({
      name,
      description: item.description ?? "",
      inputSchema: nativeSchema(item.inputSchema),
      ...(item.outputSchema === undefined ? {} : { outputSchema: nativeSchema(item.outputSchema) }),
    }),
  )
}

export function nativeTools(tools: Record<string, Tool>, input: Pick<StreamInput, "messages" | "abort">) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, item]) => [
      name,
      // Tool execution remains opencode-owned. The native runtime only adapts
      // the @opencode-ai/llm tool call back into the AI SDK Tool.execute shape.
      NativeTool.make({
        description: item.description ?? "",
        jsonSchema: nativeSchema(item.inputSchema),
        execute: (args: unknown, ctx) =>
          Effect.tryPromise({
            try: () => {
              if (!item.execute) throw new Error(`Tool has no execute handler: ${name}`)
              return item.execute(args, {
                toolCallId: ctx?.id ?? name,
                messages: input.messages,
                abortSignal: input.abort,
              })
            },
            catch: (error) => new ToolFailure({ message: errorMessage(error), error }),
          }),
      }),
    ]),
  )
}

export * as LLMNativeRuntime from "./native-runtime"
