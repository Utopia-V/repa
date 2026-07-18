import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { jsonSchema, tool as aiTool, type ModelMessage, type Tool } from "ai"
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
  readonly providerID?: string
  readonly modelHeaders?: Record<string, string>
  readonly pluginHeaders?: Record<string, string>
  readonly oauth?: boolean
  readonly workflow?: boolean
  readonly hidden?: boolean
  readonly agentPrompt?: string
  readonly programSystem?: string[]
  readonly userSystem?: string
  readonly transform?: (system: string[]) => void
  readonly paramsTransform?: (params: { options: Record<string, unknown> }) => void
  readonly composition?: LLMRequestPrep.Composition
  readonly messages?: ModelMessage[]
  readonly tools?: Record<string, Tool>
  readonly toolChoice?: "auto" | "required" | "none"
}

function prepare(options: Options = {}) {
  const messages: ModelMessage[] = options.messages ?? [{ role: "user", content: "Explain pointers with a diagram." }]
  const providerID = options.providerID ?? model.providerID
  const currentModel = { ...model, providerID, headers: options.modelHeaders ?? {} } as Provider.Model
  return Effect.runPromise(
    LLMRequestPrep.prepare({
      user: {
        id: "msg_user-test",
        sessionID: "ses_test",
        role: "user",
        time: { created: 0 },
        agent: options.hidden ? "title" : "repa",
        model: { providerID, modelID: "gpt-5-mini" },
        ...(options.userSystem ? { system: options.userSystem } : {}),
      } as any,
      sessionID: "ses_test",
      parentSessionID: "ses_parent-test",
      model: currentModel,
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
      tools: options.tools ?? {},
      toolChoice: options.toolChoice,
      composition: options.composition ?? { type: "interactive" },
      provider: {
        id: providerID,
        name: providerID,
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
          if (name === "chat.headers") Object.assign(output.headers, options.pluginHeaders)
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
  test("rejects representation before generic request hooks can inherit caller state", async () => {
    let transformed = false
    let parameterized = false
    await expect(
      prepare({
        composition: { type: "internal", purpose: "representation" },
        transform() {
          transformed = true
        },
        paramsTransform() {
          parameterized = true
        },
      }),
    ).rejects.toThrow("dedicated Gate 11 carrier")
    expect(transformed).toBe(false)
    expect(parameterized).toBe(false)
  })

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

  test("treats an explicitly named hidden profile as interactive presentation metadata", async () => {
    const prepared = await prepare({
      hidden: true,
      agentPrompt: "SUMMARY_PROFILE_GUIDANCE",
      userSystem: "INTERACTIVE_CALLER_GUIDANCE",
      transform(system) {
        system.length = 0
        system.push("PLUGIN_REPLACEMENT")
      },
    })
    const joined = prepared.system.join("\n")

    expect(prepared.system[0]).toBe(SystemPrompt.product())
    expect(joined).toContain("<learning_context>bounded course context</learning_context>")
    expect(joined).toContain("PLUGIN_REPLACEMENT")
    expect(joined).not.toContain(SystemPrompt.internal())
    expect(joined).not.toContain("SUMMARY_PROFILE_GUIDANCE")
    expect(joined).not.toContain("INTERACTIVE_CALLER_GUIDANCE")
    expect(joined).toContain("<repa_product_contract>")
  })

  test("binds each internal stream purpose to its fixed task independent of Agent metadata", async () => {
    for (const purpose of ["title", "compaction", "project-copy-name"] as const) {
      const prepared = await prepare({
        agentPrompt: "CONFIGURED_AGENT_REPLACEMENT",
        userSystem: "INTERACTIVE_CALLER_GUIDANCE",
        programSystem: ["<learning_context>must-not-cross</learning_context>"],
        composition: { type: "internal", purpose },
        transform(system) {
          system.length = 0
          system.push("PLUGIN_INTERNAL_CONTEXT", SystemPrompt.internalTask(purpose), SystemPrompt.product())
        },
      })
      const joined = prepared.system.join("\n")

      expect(prepared.system.slice(0, 2)).toEqual([SystemPrompt.internal(), SystemPrompt.internalTask(purpose)])
      expect(joined).toContain("PLUGIN_INTERNAL_CONTEXT")
      expect(occurrences(joined, SystemPrompt.internalTask(purpose))).toBe(1)
      expect(joined).not.toContain("CONFIGURED_AGENT_REPLACEMENT")
      expect(joined).not.toContain("INTERACTIVE_CALLER_GUIDANCE")
      expect(joined).not.toContain("<learning_context>must-not-cross</learning_context>")
      expect(joined).not.toContain("<repa_product_contract>")
      expect(prepared.tools).toEqual({})
      expect(prepared.toolChoice).toBe("none")
    }
  })

  test("keeps Copilot replay compatibility wire-only for internal compaction", async () => {
    const prepared = await prepare({
      providerID: "github-copilot",
      composition: { type: "internal", purpose: "compaction" },
      toolChoice: "required",
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "call-1", toolName: "read", input: {} }],
        },
      ],
      tools: {
        read: aiTool({
          description: "Read a file",
          inputSchema: jsonSchema({ type: "object", properties: {} }),
          execute: async () => "domain-result",
        }),
      },
    })

    expect(Object.keys(prepared.tools)).toEqual(["_noop"])
    expect(prepared.tools._noop?.execute).toBeUndefined()
    expect(prepared.toolChoice).toBe("none")
  })

  test("filters an exact core copy injected by an extension hook", async () => {
    const prepared = await prepare({
      transform(system) {
        system.push(SystemPrompt.product())
      },
    })

    expect(occurrences(prepared.system.join("\n"), "<repa_product_contract>")).toBe(1)
  })

  test("treats opencode provider ids like ordinary custom providers when preparing request headers", async () => {
    const prepared = await Promise.all(
      ["ordinary", "opencode", "opencode-local"].map((providerID) => prepare({ providerID })),
    )

    expect(prepared.map((item) => item.headers)).toEqual([
      prepared[0].headers,
      prepared[0].headers,
      prepared[0].headers,
    ])
    expect(prepared[0].headers).toMatchObject({
      "x-session-affinity": "ses_test",
      "X-Session-Id": "ses_test",
      "x-parent-session-id": "ses_parent-test",
    })
    expect(Object.keys(prepared[0].headers).filter((key) => key.startsWith("x-opencode-"))).toEqual([])
  })

  test("preserves explicit provider and plugin headers for a custom provider named opencode", async () => {
    const prepared = await prepare({
      providerID: "opencode",
      modelHeaders: { "x-opencode-explicit": "configured" },
      pluginHeaders: { "x-plugin-explicit": "plugin" },
    })

    expect(prepared.headers).toMatchObject({
      "x-opencode-explicit": "configured",
      "x-plugin-explicit": "plugin",
    })
    expect(Object.keys(prepared.headers)).not.toContain("x-opencode-session")
  })
})
