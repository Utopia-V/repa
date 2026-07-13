import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import type { ModelMessage } from "ai"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { LLMRequestPrep } from "@/session/llm/request"
import { LLMNative } from "@/session/llm/native-request"
import { SystemPrompt } from "@/session/system"

const model: Provider.Model = {
  id: "gpt-5-mini",
  providerID: "openai",
  api: {
    id: "gpt-5-mini",
    url: "https://api.openai.com/v1",
    npm: "@ai-sdk/openai",
  },
  name: "GPT-5 Mini",
  capabilities: {
    temperature: true,
    reasoning: true,
    attachment: true,
    toolcall: true,
    input: { text: true, audio: false, image: true, video: false, pdf: false },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 128_000, input: 128_000, output: 32_000 },
  status: "active",
  options: {},
  headers: {},
  release_date: "2026-01-01",
} as Provider.Model

type Options = {
  readonly oauth?: boolean
  readonly workflow?: boolean
  readonly hidden?: boolean
  readonly agentPrompt?: string
  readonly programSystem?: string[]
  readonly userSystem?: string
  readonly transform?: (system: string[]) => void
  readonly paramsTransform?: (params: { options: Record<string, unknown> }) => void
}

function prepare(options: Options = {}) {
  const messages: ModelMessage[] = [{ role: "user", content: "Explain pointers with a diagram." }]
  return Effect.runPromise(
    LLMRequestPrep.prepare({
      user: {
        id: "msg_user-test",
        sessionID: "ses_test",
        role: "user",
        time: { created: 0 },
        agent: options.hidden ? "title" : "repa",
        model: { providerID: "openai", modelID: "gpt-5-mini" },
        ...(options.userSystem ? { system: options.userSystem } : {}),
      } as any,
      sessionID: "ses_test",
      model,
      agent: {
        name: options.hidden ? "title" : "repa",
        mode: "primary",
        hidden: options.hidden,
        prompt: options.agentPrompt,
        options: {},
        permission: [],
      } as any,
      system: options.programSystem ?? ["<learning_context>bounded course context</learning_context>"],
      messages,
      tools: {},
      provider: {
        id: "openai",
        name: "OpenAI",
        source: "config",
        env: ["OPENAI_API_KEY"],
        options: {},
        models: {},
      } as any,
      auth: options.oauth
        ? { type: "oauth", refresh: "refresh", access: "access", expires: Date.now() + 60_000 }
        : undefined,
      plugin: {
        trigger: (name: string, _input: unknown, output: any) => {
          if (name === "experimental.chat.system.transform") options.transform?.(output.system)
          if (name === "chat.params") options.paramsTransform?.(output)
          return Effect.succeed(output)
        },
        list: () => Effect.succeed([]),
        init: () => Effect.void,
      } as any,
      flags: { outputTokenMax: 32_000, client: "test" } as any,
      isWorkflow: options.workflow ?? false,
    }),
  )
}

const text = (message: ModelMessage) => (typeof message.content === "string" ? message.content : "")
const occurrences = (value: string, marker: string) => value.split(marker).length - 1

describe("session.llm.request composition", () => {
  test("keeps Repa core and program context when a plugin replaces extensions", async () => {
    const prepared = await prepare({
      agentPrompt: "CUSTOM_AGENT_POLICY",
      userSystem: "CALLER_SYSTEM_GUIDANCE",
      transform(system) {
        system.length = 0
        system.push("PLUGIN_REPLACEMENT")
      },
    })

    expect(prepared.system[0]).toBe(SystemPrompt.product())
    expect(prepared.system).toContain("<learning_context>bounded course context</learning_context>")
    expect(prepared.system).toContain("PLUGIN_REPLACEMENT")
    expect(prepared.system.join("\n")).not.toContain("CUSTOM_AGENT_POLICY")
    expect(prepared.system.join("\n")).not.toContain("CALLER_SYSTEM_GUIDANCE")
    expect(occurrences(prepared.system.join("\n"), "<repa_product_contract>")).toBe(1)
  })

  test("makes a custom agent prompt additive on the ordinary message carrier", async () => {
    const prepared = await prepare({ agentPrompt: "CUSTOM_AGENT_POLICY", userSystem: "CALLER_SYSTEM_GUIDANCE" })
    const systemMessages = prepared.messages.filter((message) => message.role === "system")

    expect(prepared.system[0]).toBe(SystemPrompt.product())
    expect(prepared.system.join("\n")).toContain("CUSTOM_AGENT_POLICY")
    expect(prepared.system.join("\n")).toContain("CALLER_SYSTEM_GUIDANCE")
    expect(systemMessages.map(text)).toEqual(prepared.system)
    expect(prepared.messages.at(-1)).toEqual({ role: "user", content: "Explain pointers with a diagram." })
  })

  test("places the complete composition in OpenAI OAuth instructions exactly once", async () => {
    const prepared = await prepare({ oauth: true, agentPrompt: "CUSTOM_AGENT_POLICY" })
    const instructions = prepared.params.options.instructions as string

    expect(prepared.messages.every((message) => message.role !== "system")).toBe(true)
    expect(instructions).toBe(LLMRequestPrep.renderSystem(prepared.system))
    expect(occurrences(instructions, "<repa_product_contract>")).toBe(1)
    expect(instructions).toContain("<learning_context>bounded course context</learning_context>")
  })

  test("restores protected OAuth instructions after a parameter hook", async () => {
    const prepared = await prepare({
      oauth: true,
      paramsTransform(params) {
        params.options = { instructions: "PLUGIN_REPLACEMENT" }
      },
    })
    const instructions = prepared.params.options.instructions as string

    expect(instructions).toBe(LLMRequestPrep.renderSystem(prepared.system))
    expect(occurrences(instructions, "<repa_product_contract>")).toBe(1)
    expect(instructions).not.toBe("PLUGIN_REPLACEMENT")
  })

  test("leaves workflow messages clean while retaining the complete workflow system prompt", async () => {
    const prepared = await prepare({ workflow: true })

    expect(prepared.messages.every((message) => message.role !== "system")).toBe(true)
    expect(prepared.system[0]).toBe(SystemPrompt.product())
    expect(occurrences(prepared.system.join("\n"), "<repa_product_contract>")).toBe(1)
    expect(prepared.system).toContain("<learning_context>bounded course context</learning_context>")
    expect(LLMRequestPrep.renderSystem(prepared.system)).toContain("<repa_product_contract>")
  })

  test("preserves the core through native ordinary and OAuth lowering", async () => {
    const ordinary = await prepare()
    const ordinaryRequest = LLMNative.request({
      model,
      apiKey: "test-key",
      messages: ordinary.messages,
    })
    const ordinarySystem = ordinaryRequest.system.map((part) => part.text).join("\n")

    expect(occurrences(ordinarySystem, "<repa_product_contract>")).toBe(1)

    const oauth = await prepare({ oauth: true })
    const oauthRequest = LLMNative.request({
      model,
      apiKey: "test-key",
      messages: oauth.messages,
      providerOptions: ProviderTransform.providerOptions(model, oauth.params.options),
    })
    const instructions = (oauthRequest.providerOptions?.openai as { instructions?: string } | undefined)?.instructions

    expect(instructions).toBe(LLMRequestPrep.renderSystem(oauth.system))
    expect(occurrences(instructions ?? "", "<repa_product_contract>")).toBe(1)
  })

  test("gives hidden operations only their narrow boundary and task prompt", async () => {
    const prepared = await prepare({
      hidden: true,
      agentPrompt: "Generate only a session title.",
      userSystem: "INTERACTIVE_CALLER_GUIDANCE",
      transform(system) {
        system.length = 0
        system.push("PLUGIN_INTERNAL_EXTENSION")
      },
    })
    const joined = prepared.system.join("\n")

    expect(prepared.system[0]).toBe(SystemPrompt.internal())
    expect(joined).toContain("Generate only a session title.")
    expect(joined).toContain("PLUGIN_INTERNAL_EXTENSION")
    expect(joined).not.toContain("<learning_context>bounded course context</learning_context>")
    expect(joined).not.toContain("INTERACTIVE_CALLER_GUIDANCE")
    expect(joined).not.toContain("<repa_product_contract>")
    expect(joined).not.toContain(SystemPrompt.provider(model)[0])
  })

  test("filters an exact core copy injected by an extension hook", async () => {
    const prepared = await prepare({
      transform(system) {
        system.push(SystemPrompt.product())
      },
    })

    expect(occurrences(prepared.system.join("\n"), "<repa_product_contract>")).toBe(1)
  })
})
