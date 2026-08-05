import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { llmClient } from "@opencode-ai/core/effect/app-node-platform"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { LearningContext } from "@opencode-ai/core/learning-context"
import type { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { NamedError } from "@opencode-ai/core/util/error"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { Config } from "@/config/config"
import type { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Auth } from "@/auth"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { Context, Effect, Layer } from "effect"
import * as Stream from "effect/Stream"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { streamText, wrapLanguageModel, type ModelMessage, type Tool } from "ai"
import { convertToLanguageModelPrompt, prepareToolsAndToolChoice, standardizePrompt } from "ai/internal"
import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3Prompt } from "@ai-sdk/provider"
import { isDeepStrictEqual } from "node:util"
import type { LLMEvent } from "@opencode-ai/llm"
import { LLMClient } from "@opencode-ai/llm/route"
import type { LLMClientService } from "@opencode-ai/llm/route"
import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"
import type { MessageV2 } from "./message-v2"
import { LLMAISDK } from "./llm/ai-sdk"
import { LLMNativeRuntime } from "./llm/native-runtime"
import { LLMRequestPrep } from "./llm/request"
import { ToolNameProjection } from "./llm/tool-name-projection"
import { ProviderWire } from "@/provider/wire"
import { INVALID_TOOL_ID } from "@/tool/invalid"

export const OUTPUT_TOKEN_MAX = ProviderTransform.OUTPUT_TOKEN_MAX

export type StreamInput = {
  user: SessionV1.User
  sessionID: string
  parentSessionID?: string
  model: Provider.Model
  agent: Agent.Info
  permission?: PermissionV1.Ruleset
  authority?: readonly Permission.AuthorityLayer[]
  system: string[]
  messages: ModelMessage[]
  /** Exact model-message prefix that the existing compaction owner may replace. */
  compactableMessages?: ModelMessage[]
  /** Exact immutable Session-message prefix represented by `compactableMessages`. */
  compactionSelection?: Readonly<{
    tailStartMessageID: SessionV1.MessageID
    removableMessageIDs: readonly SessionV1.MessageID[]
    removableMessageIDsFingerprint: string
  }>
  small?: boolean
  tools: Record<string, Tool>
  composition: LLMRequestPrep.Composition
  retainedSteeringCut?: RetainedSteering.Cut
  learningContextCut?: LearningContext.Cut
  learningContextRenderedBlock?: string
  retries?: number
  toolChoice?: "auto" | "required" | "none"
}

export type InternalStreamInput = StreamInput & {
  composition: Extract<LLMRequestPrep.Composition, { type: "internal" }>
}

type AISDKPlan = Readonly<{
  type: "ai-sdk"
  language: LanguageModelV3
  tools: Awaited<ReturnType<typeof prepareToolsAndToolChoice>>["tools"]
  toolChoice: Awaited<ReturnType<typeof prepareToolsAndToolChoice>>["toolChoice"]
  providerSurface: ProviderWire.Surface
}>

type RuntimePlan = AISDKPlan | Readonly<{ type: "native"; plan: LLMNativeRuntime.Plan }>

export type Plan = Readonly<{
  input: StreamInput
  request: LLMRequestPrep.Planned
  toolNames: ToolNameProjection.Projection
  providerTools: Record<string, Tool>
  providerDefinitions: Record<string, Tool>
  invalidProviderName?: string
  runtime: RuntimePlan
  providerToolSurface: ReturnType<typeof LearningContext.bindProviderToolSurface>
  capabilityBasis: LearningContext.CapabilityBasis
}>

export type Prepared = Readonly<{
  plan: Plan
  request: LLMRequestPrep.Prepared
  capacity?: LearningContext.CapacityPreparation
  open: (abort: AbortSignal) => Stream.Stream<LLMEvent, unknown>
}>

export interface Interface {
  readonly plan?: (input: StreamInput) => Effect.Effect<Plan, unknown>
  readonly finalize?: (input: {
    readonly plan: Plan
    readonly retainedSteeringCut?: RetainedSteering.Cut
    readonly learningContextCut?: LearningContext.Cut
    readonly learningContextRenderedBlock?: string
  }) => Effect.Effect<Prepared, unknown>
  readonly stream: (input: Prepared | InternalStreamInput) => Stream.Stream<LLMEvent, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/LLM") {}

export const use = serviceUse(Service)

const live: Layer.Layer<
  Service,
  never,
  Auth.Service | Config.Service | Provider.Service | Plugin.Service | LLMClientService | RuntimeFlags.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const config = yield* Config.Service
    const provider = yield* Provider.Service
    const plugin = yield* Plugin.Service
    const llmClient = yield* LLMClient.Service
    const flags = yield* RuntimeFlags.Service

    const plan: NonNullable<Interface["plan"]> = Effect.fn("LLM.plan")(function* (input) {
      yield* Effect.logInfo("plan", {
        providerID: input.model.providerID,
        modelID: input.model.id,
        "session.id": input.sessionID,
        small: (input.small ?? false).toString(),
        agent: input.agent.name,
        mode: input.agent.mode,
      })

      const [item, info] = yield* Effect.all(
        [provider.getProvider(input.model.providerID), auth.get(input.model.providerID)],
        { concurrency: "unbounded" },
      )
      if (input.model.api.npm === "gitlab-ai-provider") {
        return yield* Effect.fail(
          new NamedError.Unknown({
            message:
              "GitLab workflow models are unavailable in the released-v1 Turn runtime because their provider callback cannot expose a complete tool-candidate set before execution",
          }),
        )
      }
      const request = yield* LLMRequestPrep.plan({
        ...input,
        provider: item,
        auth: info,
        plugin,
        flags,
        isWorkflow: false,
      })
      const toolNames = ToolNameProjection.make([
        ...Object.keys(request.tools),
        ...ToolNameProjection.messageNames(request.input.messages),
      ])
      const providerTools = ToolNameProjection.tools(toolNames, request.tools)
      const invalidProviderName = Object.hasOwn(request.tools, INVALID_TOOL_ID)
        ? toolNames.provider(INVALID_TOOL_ID)
        : undefined
      const providerDefinitions = Object.freeze(
        Object.fromEntries(Object.entries(providerTools).filter(([id]) => id !== invalidProviderName)),
      )

      let runtime: RuntimePlan | undefined
      if (flags.experimentalNativeLlm) {
        const native = LLMNativeRuntime.plan({
          model: input.model,
          provider: item,
          auth: info,
          messages: ToolNameProjection.messages(toolNames, request.input.messages),
          tools: providerDefinitions,
          toolChoice: request.toolChoice,
          temperature: request.params.temperature,
          topP: request.params.topP,
          topK: request.params.topK,
          maxOutputTokens: request.params.maxOutputTokens,
          providerOptions: request.params.options,
          headers: request.headers,
        })
        if (native.type === "supported") {
          runtime = {
            type: "native",
            plan: yield* LLMNativeRuntime.bindProviderSurface({ plan: native, llmClient }),
          }
          yield* Effect.logInfo("llm runtime selected", {
            "llm.runtime": "native",
            "llm.provider": input.model.providerID,
            "llm.model": input.model.id,
          })
        } else {
          yield* Effect.logInfo("native runtime unavailable; falling back to ai-sdk", {
            providerID: input.model.providerID,
            modelID: input.model.id,
            "session.id": input.sessionID,
            small: (input.small ?? false).toString(),
            agent: input.agent.name,
            mode: input.agent.mode,
            reason: native.reason,
          })
        }
      }

      if (!runtime) {
        const language = yield* provider.getInteractiveLanguage(input.model)
        if (language instanceof GitLabWorkflowLanguageModel) {
          return yield* Effect.fail(
            new NamedError.Unknown({
              message:
                "GitLab workflow models are unavailable in the released-v1 Turn runtime because their provider callback cannot expose a complete tool-candidate set before execution",
            }),
          )
        }
        const definitions = yield* Effect.promise(() =>
          prepareToolsAndToolChoice({
            tools: definitionOnlyTools(providerDefinitions),
            activeTools: Object.keys(providerDefinitions),
            toolChoice: request.toolChoice,
          }),
        )
        const probe = providerCallOptions({
          request,
          model: input.model,
          prompt: [
            {
              role: "user",
              content: [{ type: "text", text: "[Gate 18 provider-tool surface probe]" }],
            },
          ],
        })
        const actual = yield* Effect.tryPromise({
          try: () =>
            ProviderWire.capture(language, {
              ...probe,
              tools: definitions.tools,
              toolChoice: definitions.toolChoice,
            }),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        })
        runtime = {
          type: "ai-sdk",
          language,
          ...definitions,
          providerSurface: ProviderWire.project(
            language,
            actual,
            (definitions.tools ?? []).map((definition) => definition.name),
          ),
        }
        yield* Effect.logInfo("llm runtime selected", {
          "llm.runtime": "ai-sdk",
          "llm.provider": input.model.providerID,
          "llm.model": input.model.id,
        })
      }

      const providerToolSurface =
        runtime.type === "native"
          ? LearningContext.bindProviderToolSurface({
              route: { runtime: "native", ...runtime.plan.route },
              toolChoice: runtime.plan.providerSurface.toolChoice,
              definitions: runtime.plan.providerSurface.definitions,
              surface: runtime.plan.providerSurface.providerVisible,
            })
          : LearningContext.bindProviderToolSurface({
              route: {
                runtime: "ai_sdk",
                provider: runtime.language.provider,
                model: runtime.language.modelId,
                protocol: "language-model-v3",
                compiler: runtime.providerSurface.compiler,
                transport: runtime.providerSurface.transport,
              },
              toolChoice: runtime.providerSurface.toolChoice,
              definitions: runtime.providerSurface.definitions,
              surface: runtime.providerSurface.providerVisible,
            })
      const ruleset = Permission.merge(input.agent.permission, input.permission ?? [])
      const authority = input.authority ?? []
      const automatic = Permission.evaluateAuthority(
        LearningContext.AUTOMATIC_CONTEXT_CAPABILITY_ID,
        "*",
        ruleset,
        authority,
      ).action
      const providerToolIDs = new Set(providerToolSurface.definitions.map((definition) => definition.id))
      const lazy =
        request.toolChoice === "none"
          ? []
          : LearningContext.LAZY_READ_CAPABILITY_IDS.filter(
              (id) => Object.hasOwn(request.tools, id) && providerToolIDs.has(toolNames.provider(id)),
            )
      return {
        input,
        request,
        toolNames,
        providerTools,
        providerDefinitions,
        invalidProviderName,
        runtime,
        providerToolSurface,
        capabilityBasis: {
          catalogVersion: LearningContext.CAPABILITY_CATALOG_VERSION,
          policyFingerprint: LearningContext.canonicalFingerprint(
            LearningContext.toJsonValue({
              ruleset,
              authority,
              userTools: input.user.tools ?? {},
              automatic,
              lazy,
              providerToolNames: toolNames.binding,
            }),
          ),
          effectiveAutomaticContext: automatic === "allow",
          effectiveLazyReadCapabilities: lazy,
          effectiveProviderToolSurfaceBinding: providerToolSurface.binding,
        },
      }
    })

    const finalize: NonNullable<Interface["finalize"]> = Effect.fn("LLM.finalize")(function* (input) {
      if (
        input.plan.input.composition.type === "interactive" &&
        (!input.learningContextCut ||
          !input.retainedSteeringCut ||
          !isDeepStrictEqual(input.plan.capabilityBasis, input.learningContextCut.capabilityBasis) ||
          input.learningContextCut.retainedSteering.assistantMessageID !==
            input.retainedSteeringCut.assistantMessageID ||
          input.learningContextCut.retainedSteering.cutAsOf !== input.retainedSteeringCut.cutAsOf ||
          input.learningContextCut.retainedSteering.fingerprint !== input.retainedSteeringCut.fingerprint)
      ) {
        return yield* Effect.fail(new Error("Gate 18 cut does not bind this exact request plan and retained steering"))
      }
      const request = LLMRequestPrep.finalize(input.plan.request, input)
      const capacityCuts =
        input.plan.input.composition.type === "interactive" && input.retainedSteeringCut && input.learningContextCut
          ? { retained: input.retainedSteeringCut, learning: input.learningContextCut }
          : undefined
      if (input.plan.runtime.type === "native") {
        const runtime = input.plan.runtime.plan
        const partition = providerMessagePartition(input.plan, request)
        const native = yield* LLMNativeRuntime.prepare({
          plan: runtime,
          llmClient,
          messages: ToolNameProjection.messages(input.plan.toolNames, request.messages),
          providerOptions: request.params.options,
        })
        const semantic = ProviderWire.semanticCertified(runtime.route.compiler, native.compiled)
        const capacity = capacityCuts
          ? prepareCapacity(input.plan, request, capacityCuts.retained, capacityCuts.learning, partition, semantic)
          : undefined
        return {
          plan: input.plan,
          request,
          capacity,
          open: () => {
            const offeredProviderNames = new Set(
              request.toolChoice === "none"
                ? []
                : runtime.providerSurface.definitions.map((definition) => definition.id),
            )
            return native.stream.pipe(
              Stream.map((event) => ToolNameProjection.event(input.plan.toolNames, event, offeredProviderNames)),
            )
          },
        }
      }

      const runtime = input.plan.runtime
      const cfg = yield* config.get()
      const bridge = yield* EffectBridge.make()
      const tracer = cfg.experimental?.openTelemetry
        ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
        : undefined
      const telemetryTracer = tracer
        ? new Proxy(tracer, {
            get(target, prop, receiver) {
              if (prop !== "startSpan") return Reflect.get(target, prop, receiver)
              return (...args: Parameters<typeof target.startSpan>) => {
                const span = target.startSpan(...args)
                span.setAttribute("session.id", input.plan.input.sessionID)
                return span
              }
            },
          })
        : undefined
      const frozen = yield* Effect.tryPromise({
        try: async () => {
          const partition = providerMessagePartition(input.plan, request)
          const prompt = await convertToLanguageModelPrompt({
            prompt: await standardizePrompt({ messages: partition.full }),
            supportedUrls: await runtime.language.supportedUrls,
            download: undefined,
          })
          return { prompt, partition: languagePromptPartition(prompt, partition) }
        },
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      })
      const compiled = yield* Effect.tryPromise({
        try: () =>
          ProviderWire.capture(runtime.language, {
            ...providerCallOptions({ request, model: input.plan.input.model, prompt: frozen.prompt }),
            tools: runtime.tools,
            toolChoice: runtime.toolChoice,
          }),
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      })
      const finalSurface = ProviderWire.project(
        runtime.language,
        compiled,
        (runtime.tools ?? []).map((definition) => definition.name),
      )
      if (!isDeepStrictEqual(finalSurface, runtime.providerSurface)) {
        return yield* Effect.fail(new Error("Final AI SDK provider capability surface changed after Gate 18 admission"))
      }
      const semantic = ProviderWire.semantic(runtime.language, compiled)
      const finalCapacity = capacityCuts
        ? prepareCapacity(input.plan, request, capacityCuts.retained, capacityCuts.learning, frozen.partition, semantic)
        : undefined

      return {
        plan: input.plan,
        request,
        capacity: finalCapacity,
        open: (abort) =>
          Stream.suspend(() => {
            const offeredProviderNames = new Set(
              request.toolChoice === "none" ? [] : (runtime.tools ?? []).map((definition) => definition.name),
            )
            const repairedFallbacks = new Map<string, Readonly<{ providerName: string; input: unknown }>>()
            const result = streamText({
              onError(error) {
                bridge.fork(
                  Effect.logError("stream error", {
                    providerID: input.plan.input.model.providerID,
                    modelID: input.plan.input.model.id,
                    "session.id": input.plan.input.sessionID,
                    small: (input.plan.input.small ?? false).toString(),
                    agent: input.plan.input.agent.name,
                    mode: input.plan.input.agent.mode,
                    error,
                  }),
                )
              },
              includeRawChunks: input.plan.input.model.providerID.includes("github-copilot"),
              async experimental_repairToolCall(failed) {
                const lower = failed.toolCall.toolName.toLowerCase()
                if (lower !== failed.toolCall.toolName && offeredProviderNames.has(lower)) {
                  return { ...failed.toolCall, toolName: lower }
                }
                if (!offeredProviderNames.has(failed.toolCall.toolName) || !input.plan.invalidProviderName) return null
                const repaired = {
                  tool: failed.toolCall.toolName,
                  error: failed.error.message,
                }
                repairedFallbacks.set(failed.toolCall.toolCallId, {
                  providerName: failed.toolCall.toolName,
                  input: repaired,
                })
                return {
                  ...failed.toolCall,
                  input: JSON.stringify(repaired),
                  toolName: input.plan.invalidProviderName,
                }
              },
              temperature: request.params.temperature,
              topP: request.params.topP,
              topK: request.params.topK,
              providerOptions: ProviderTransform.providerOptions(input.plan.input.model, request.params.options),
              activeTools: Object.keys(input.plan.providerDefinitions),
              tools: definitionOnlyTools(input.plan.providerTools),
              toolChoice: request.toolChoice,
              maxOutputTokens: request.params.maxOutputTokens,
              abortSignal: abort,
              headers: request.headers,
              maxRetries: input.plan.input.retries ?? 0,
              // The exact provider prompt, including downloaded media bytes, was
              // materialized once above. A retry only standardizes this harmless
              // placeholder before middleware reinstates that immutable prompt.
              messages: [{ role: "user", content: "[Gate 18 prepared request]" }],
              model: wrapLanguageModel({
                model: ProviderWire.verified(runtime.language, compiled),
                middleware: [
                  {
                    specificationVersion: "v3" as const,
                    async transformParams(args) {
                      return {
                        ...args.params,
                        prompt: frozen.prompt,
                        tools: runtime.tools,
                        toolChoice: runtime.toolChoice,
                      }
                    },
                  },
                ],
              }),
              experimental_telemetry: {
                isEnabled: cfg.experimental?.openTelemetry,
                functionId: "session.llm",
                tracer: telemetryTracer,
                metadata: {
                  userId: cfg.username ?? "unknown",
                  sessionId: input.plan.input.sessionID,
                },
              },
            })
            const state = LLMAISDK.adapterState()
            return Stream.fromAsyncIterable(result.fullStream, (error) =>
              error instanceof Error ? error : new Error(String(error)),
            ).pipe(
              Stream.mapEffect((event) =>
                LLMAISDK.toLLMEvents(state, event, input.plan.toolNames.internal, {
                  offeredProviderNames,
                  repairedFallbacks,
                }),
              ),
              Stream.flatMap((events) => Stream.fromIterable(events)),
            )
          }),
      }
    })

    const preparedStream = (input: Prepared) =>
      Stream.scoped(
        Stream.unwrap(
          Effect.gen(function* () {
            const ctrl = yield* Effect.acquireRelease(
              Effect.sync(() => new AbortController()),
              (ctrl) => Effect.sync(() => ctrl.abort()),
            )
            const events = input.open(ctrl.signal)
            if (input.plan.input.composition.type === "interactive") return events
            return events.pipe(
              Stream.mapEffect((event) =>
                event.type === "tool-call"
                  ? Effect.fail(new Error(`Internal operation cannot call tool: ${event.name}`))
                  : Effect.succeed(event),
              ),
            )
          }),
        ),
      )

    const stream: Interface["stream"] = (input) => {
      if ("open" in input) return preparedStream(input)
      return Stream.unwrap(
        plan(input).pipe(
          Effect.flatMap((planned) =>
            finalize({
              plan: planned,
              retainedSteeringCut: input.retainedSteeringCut,
              learningContextCut: input.learningContextCut,
              learningContextRenderedBlock: input.learningContextRenderedBlock,
            }),
          ),
          Effect.map(preparedStream),
        ),
      )
    }

    return Service.of({ plan, finalize, stream })
  }),
)

export const hasToolCalls = LLMRequestPrep.hasToolCalls

export function definitionOnlyTools(tools: Record<string, Tool>): Record<string, Tool> {
  return Object.fromEntries(Object.entries(tools).map(([name, item]) => [name, { ...item, execute: undefined }]))
}

function prepareCapacity(
  plan: Plan,
  request: LLMRequestPrep.Prepared,
  retainedSteeringCut: RetainedSteering.Cut,
  learningContextCut: LearningContext.Cut,
  partition: Readonly<{
    full: readonly unknown[]
    fixed: readonly unknown[]
    removable: readonly unknown[]
  }>,
  compiled: ProviderWire.SemanticRequest,
) {
  const compiler =
    plan.runtime.type === "native" ? plan.runtime.plan.route.compiler : plan.runtime.providerSurface.compiler
  const common = {
    route: plan.providerToolSurface.route,
    providerToolSurface: plan.providerToolSurface.surface,
    parameters: ProviderWire.semanticBodyCertified(
      compiler,
      LearningContext.toJsonValue({
        temperature: request.params.temperature,
        topP: request.params.topP,
        topK: request.params.topK,
        maxOutputTokens: request.params.maxOutputTokens,
        providerOptions: ProviderTransform.providerOptions(plan.input.model, request.params.options),
      }),
    ),
  }
  const full = LearningContext.toJsonValue(compiled)
  const fixed = LearningContext.toJsonValue({ ...common, messages: partition.fixed })
  const removable = LearningContext.toJsonValue({ messages: partition.removable })
  return LearningContext.prepareCapacity({
    assistantMessageID: learningContextCut.operation.assistantMessageID,
    envelopeFingerprint: LearningContext.canonicalFingerprint(full),
    retainedSteeringFingerprint: retainedSteeringCut.fingerprint,
    learningContextFingerprint: learningContextCut.fingerprint,
    learningContextRenderedFingerprint: learningContextCut.renderedFingerprint,
    providerToolSurfaceFingerprint: plan.providerToolSurface.binding.combinedFingerprint,
    providerToolSurfaceCanonicalBytes: plan.providerToolSurface.binding.combinedCanonicalBytes,
    fixedEstimatedTokens: LearningContext.utf8Bytes(LearningContext.canonicalJson(fixed)),
    removableEstimatedTokens:
      partition.removable.length === 0 ? 0 : LearningContext.utf8Bytes(LearningContext.canonicalJson(removable)),
    removableHistory:
      partition.removable.length === 0 || !plan.input.compactionSelection
        ? undefined
        : {
            tailStartMessageID: plan.input.compactionSelection.tailStartMessageID,
            messageCount: plan.input.compactionSelection.removableMessageIDs.length,
            messageIDsFingerprint: plan.input.compactionSelection.removableMessageIDsFingerprint,
          },
    contextLimitTokens: plan.input.model.limit.context,
    inputLimitTokens: plan.input.model.limit.input,
    outputReserveTokens: request.params.maxOutputTokens ?? plan.input.model.limit.output,
  })
}

const capacityPartition = Symbol("Gate18.capacityPartition")
type PartitionedMessage = ModelMessage & { readonly [capacityPartition]?: "fixed" | "removable" }

function providerMessagePartition(plan: Plan, request: LLMRequestPrep.Prepared) {
  const compactable = plan.input.compactableMessages ?? []
  const selection = plan.input.compactionSelection
  const selectionValid =
    compactable.length === 0 ||
    (selection !== undefined &&
      selection.removableMessageIDs.length > 0 &&
      LearningContext.canonicalFingerprint(LearningContext.toJsonValue(selection.removableMessageIDs)) ===
        selection.removableMessageIDsFingerprint)
  const inputStart = request.messages.length - plan.input.messages.length
  const valid =
    selectionValid &&
    inputStart >= 0 &&
    isDeepStrictEqual(request.messages.slice(inputStart), plan.input.messages) &&
    compactable.length <= plan.input.messages.length &&
    isDeepStrictEqual(plan.input.messages.slice(0, compactable.length), compactable)
  const marked = cloneModelMessages(request.messages).map((message, index) => ({
    ...message,
    [capacityPartition]:
      valid && index >= inputStart && index < inputStart + compactable.length ? "removable" : "fixed",
  })) as PartitionedMessage[]
  const transformed = ProviderTransform.message(
    ToolNameProjection.messages(plan.toolNames, marked),
    plan.input.model,
    request.messageTransformOptions,
  )
  const labels = transformed.map((message) => (message as PartitionedMessage)[capacityPartition])
  transformed.forEach((message) => Reflect.deleteProperty(message, capacityPartition))
  const trusted = labels.every((label) => label === "fixed" || label === "removable")
    ? (labels as ("fixed" | "removable")[])
    : transformed.map(() => "fixed" as const)
  return {
    full: transformed,
    fixed: transformed.filter((_, index) => trusted[index] === "fixed"),
    removable: transformed.filter((_, index) => trusted[index] === "removable"),
    labels: trusted,
  }
}

function cloneModelMessages(messages: readonly ModelMessage[]) {
  return messages.map((message) => cloneMessageValue(message) as ModelMessage)
}

function cloneMessageValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneMessageValue)
  if (typeof value !== "object" || value === null) return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneMessageValue(item)]))
}

function providerCallOptions(input: {
  request: Pick<LLMRequestPrep.Planned, "params" | "headers">
  model: Provider.Model
  prompt: LanguageModelV3Prompt
  abort?: AbortSignal
}): LanguageModelV3CallOptions {
  return {
    prompt: input.prompt,
    temperature: input.request.params.temperature,
    topP: input.request.params.topP,
    topK: input.request.params.topK,
    maxOutputTokens: input.request.params.maxOutputTokens,
    providerOptions: ProviderTransform.providerOptions(input.model, input.request.params.options),
    headers: input.request.headers,
    includeRawChunks: input.model.providerID.includes("github-copilot"),
    abortSignal: input.abort,
  }
}

function languagePromptPartition(
  prompt: Awaited<ReturnType<typeof convertToLanguageModelPrompt>>,
  input: ReturnType<typeof providerMessagePartition>,
) {
  const labels: ("fixed" | "removable")[] = []
  let previousRole: ModelMessage["role"] | undefined
  let mixed = false
  input.full.forEach((message, index) => {
    const label = input.labels[index]!
    if (message.role === "tool" && previousRole === "tool") {
      if (labels.at(-1) !== label) mixed = true
    } else {
      labels.push(label)
    }
    previousRole = message.role
  })
  if (mixed || labels.length !== prompt.length) {
    return { full: prompt, fixed: prompt, removable: [] }
  }
  return {
    full: prompt,
    fixed: prompt.filter((_, index) => labels[index] === "fixed"),
    removable: prompt.filter((_, index) => labels[index] === "removable"),
  }
}

export const node = LayerNode.make({
  service: Service,
  layer: live,
  deps: [Auth.node, Config.node, Provider.node, Plugin.node, llmClient, RuntimeFlags.node],
})

export * as LLM from "./llm"
