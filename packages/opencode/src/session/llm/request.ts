import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { Auth } from "@/auth"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import type { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import type { Agent } from "@/agent/agent"
import type { MessageV2 } from "../message-v2"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { SystemPrompt } from "../system"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Effect, Record } from "effect"
import { jsonSchema, tool as aiTool, type ModelMessage, type Tool } from "ai"
import type { Plugin } from "@/plugin"
import { mergeDeep } from "remeda"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"

const USER_AGENT = `repa/${InstallationVersion}`

export type Composition =
  | { readonly type: "interactive" }
  | { readonly type: "internal"; readonly purpose: SystemPrompt.InternalPurpose }

export type PlanInput = {
  readonly user: SessionV1.User
  readonly sessionID: string
  readonly parentSessionID?: string
  readonly model: Provider.Model
  readonly agent: Agent.Info
  readonly permission?: PermissionV1.Ruleset
  readonly authority?: readonly Permission.AuthorityLayer[]
  readonly system: string[]
  readonly messages: ModelMessage[]
  readonly small?: boolean
  readonly tools: Record<string, Tool>
  readonly toolChoice?: "auto" | "required" | "none"
  readonly provider: Provider.Info
  readonly auth: Auth.Info | undefined
  readonly plugin: Plugin.Interface
  readonly flags: RuntimeFlags.Info
  readonly isWorkflow: boolean
  readonly composition: Composition
}

export type PrepareInput = PlanInput & {
  readonly retainedSteeringCut?: RetainedSteering.Cut
  readonly learningContextRenderedBlock?: string
}

export type Planned = {
  readonly input: PlanInput
  readonly core: string
  readonly task?: string
  readonly extensions: string[]
  readonly isOpenaiOauth: boolean
  readonly tools: Record<string, Tool>
  readonly params: {
    readonly temperature?: number
    readonly topP?: number
    readonly topK?: number
    readonly maxOutputTokens?: number
    readonly options: Record<string, any>
  }
  readonly messageTransformOptions: Record<string, any>
  readonly headers: Record<string, string>
  readonly toolChoice?: "auto" | "required" | "none"
}

export type Prepared = Omit<Planned, "input" | "core" | "task" | "extensions" | "isOpenaiOauth"> & {
  readonly system: string[]
  readonly messages: ModelMessage[]
}

const mergeOptions = (target: Record<string, any>, source: Record<string, any> | undefined): Record<string, any> =>
  mergeDeep(target, source ?? {}) as Record<string, any>

export function renderSystem(system: readonly string[]) {
  return system.join("\n\n")
}

export const plan = Effect.fn("LLMRequestPrep.plan")(function* (input: PlanInput) {
  if (input.composition.type === "internal" && input.composition.purpose === "representation") {
    return yield* Effect.fail(new Error("Representation sampling requires the dedicated Gate 11 carrier"))
  }
  const isOpenaiOauth = input.provider.id === "openai" && input.auth?.type === "oauth"
  const interactive = input.composition.type === "interactive"
  const core = interactive ? SystemPrompt.product() : SystemPrompt.internal()
  const task = input.composition.type === "internal" ? SystemPrompt.internalTask(input.composition.purpose) : undefined
  const extensions = (
    interactive ? [...SystemPrompt.provider(input.model), input.agent.prompt, input.user.system] : []
  ).filter((item): item is string => Boolean(item))
  yield* input.plugin.trigger(
    "experimental.chat.system.transform",
    { sessionID: input.sessionID, model: input.model },
    { system: extensions },
  )

  const variant =
    !input.small && input.model.variants && input.user.model.variant
      ? input.model.variants[input.user.model.variant]
      : {}
  const base = input.small
    ? ProviderTransform.smallOptions(input.model)
    : ProviderTransform.options({
        model: input.model,
        sessionID: input.sessionID,
        providerOptions: input.provider.options,
      })
  const options = mergeOptions(mergeOptions(mergeOptions(base, input.model.options), input.agent.options), variant)
  if (
    input.model.api.npm === "@ai-sdk/azure" &&
    (input.provider.options.useCompletionUrls || input.model.options.useCompletionUrls || options.useCompletionUrls)
  ) {
    delete options.reasoningSummary
    delete options.include
  }
  const transformedParams = yield* input.plugin.trigger(
    "chat.params",
    {
      sessionID: input.sessionID,
      agent: input.agent.name,
      model: input.model,
      provider: input.provider,
      message: input.user,
    },
    {
      temperature: input.model.capabilities.temperature
        ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
        : undefined,
      topP: input.agent.topP ?? ProviderTransform.topP(input.model),
      topK: ProviderTransform.topK(input.model),
      maxOutputTokens: ProviderTransform.maxOutputTokens(input.model, input.flags.outputTokenMax),
      options,
    },
  )
  const { headers } = yield* input.plugin.trigger(
    "chat.headers",
    {
      sessionID: input.sessionID,
      agent: input.agent.name,
      model: input.model,
      provider: input.provider,
      message: input.user,
    },
    {
      headers: {},
    },
  )

  const tools = resolveTools(input)
  // Codex parity: OpenAI Responses-family providers hardcode `strict: false`
  // on every function tool so MCP-sourced and dynamic schemas that don't
  // satisfy OpenAI's structured-outputs constraints still register.
  if (
    input.model.api.npm === "@ai-sdk/openai" ||
    input.model.api.npm === "@ai-sdk/azure" ||
    input.model.api.npm === "@ai-sdk/amazon-bedrock/mantle"
  ) {
    for (const key of Object.keys(tools)) tools[key] = { ...tools[key], strict: false }
  }
  if (
    input.model.providerID.includes("github-copilot") &&
    Object.keys(tools).length === 0 &&
    hasToolCalls(input.messages)
  ) {
    // Copilot needs a tools field when replaying prior tool calls, even if no tools are currently enabled.
    const transport = {
      description: "Do not call this tool. It exists only for API compatibility and must never be invoked.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          reason: { type: "string", description: "Unused" },
        },
      }),
    }
    tools["_noop"] =
      input.composition.type === "internal"
        ? aiTool(transport)
        : aiTool({ ...transport, execute: async () => ({ output: "", title: "", metadata: {} }) })
  }

  return {
    input,
    core,
    task,
    extensions,
    isOpenaiOauth,
    tools: Object.fromEntries(Object.entries(tools).toSorted(([a], [b]) => a.localeCompare(b))),
    params: transformedParams,
    toolChoice: input.composition.type === "internal" ? "none" : input.toolChoice,
    messageTransformOptions: options,
    headers: {
      "x-session-affinity": input.sessionID,
      "X-Session-Id": input.sessionID,
      ...(input.parentSessionID ? { "x-parent-session-id": input.parentSessionID } : {}),
      "User-Agent": USER_AGENT,
      ...input.model.headers,
      ...headers,
    },
  } satisfies Planned
})

export function finalize(
  planned: Planned,
  cuts: { readonly retainedSteeringCut?: RetainedSteering.Cut; readonly learningContextRenderedBlock?: string },
): Prepared {
  const interactive = planned.input.composition.type === "interactive"
  if (interactive && !cuts.retainedSteeringCut) {
    throw new Error("Interactive request has no exact retained steering cut")
  }
  if (interactive && !cuts.learningContextRenderedBlock) {
    throw new Error("Interactive request has no exact learning context block")
  }
  const retainedSteering = interactive ? RetainedSteering.renderCut(cuts.retainedSteeringCut!) : undefined
  const learningContext = interactive ? cuts.learningContextRenderedBlock : undefined
  const protectedPrompts = new Set([
    SystemPrompt.product(),
    SystemPrompt.internal(),
    ...(planned.task ? [planned.task] : []),
    ...(retainedSteering ? [retainedSteering] : []),
    ...(learningContext ? [learningContext] : []),
  ])
  const system = [
    planned.core,
    ...(interactive ? [retainedSteering, learningContext, ...planned.input.system] : [planned.task]),
    ...planned.extensions,
  ].filter(
    (item, index): item is string =>
      typeof item === "string" && (index <= (interactive ? 2 : 1) || !protectedPrompts.has(item)),
  )
  const messages =
    planned.isOpenaiOauth || planned.input.isWorkflow
      ? planned.input.messages
      : [
          ...system.map(
            (content): ModelMessage => ({
              role: "system",
              content,
            }),
          ),
          ...planned.input.messages,
        ]
  const params = planned.isOpenaiOauth
    ? {
        ...planned.params,
        options: { ...planned.params.options, instructions: renderSystem(system) },
      }
    : planned.params
  return {
    system,
    messages,
    tools: planned.tools,
    params,
    toolChoice: planned.toolChoice,
    messageTransformOptions: planned.messageTransformOptions,
    headers: planned.headers,
  }
}

export const prepare = Effect.fn("LLMRequestPrep.prepare")(function* (input: PrepareInput) {
  return finalize(yield* plan(input), input)
})

function resolveTools(input: Pick<PlanInput, "tools" | "agent" | "permission" | "authority" | "user" | "composition">) {
  if (input.composition.type === "internal") return {}
  const disabled = Permission.disabled(
    Object.keys(input.tools),
    Permission.merge(input.agent.permission, input.permission ?? []),
    input.authority ?? [],
  )
  return Record.filter(input.tools, (_, k) => input.user.tools?.[k] !== false && !disabled.has(k))
}

export function hasToolCalls(messages: ModelMessage[]): boolean {
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue
    for (const part of msg.content) {
      if (part.type === "tool-call" || part.type === "tool-result") return true
    }
  }
  return false
}

export * as LLMRequestPrep from "./request"
