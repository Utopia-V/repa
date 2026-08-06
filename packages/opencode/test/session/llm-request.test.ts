import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { LLMClient } from "@opencode-ai/llm/route"
import { jsonSchema, tool as aiTool, type ModelMessage, type Tool } from "ai"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { LLMRequestPrep } from "@/session/llm/request"
import { LLMNative } from "@/session/llm/native-request"
import { SystemPrompt } from "@/session/system"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { retainedSteeringCut } from "@test/fixture/retained-steering"

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
  readonly retainedSteeringCut?: RetainedSteering.Cut | null
  readonly learningContextRenderedBlock?: string | null
}

const learningContextBlock = [
  "[Repa learning context — protected]",
  "schemaVersion: repa.learning-context-cut.v1",
  "cutFingerprint: test-learning-context",
  "[/Repa learning context]",
].join("\n")

function prepare(options: Options = {}) {
  const messages: ModelMessage[] = options.messages ?? [{ role: "user", content: "Explain pointers with a diagram." }]
  const providerID = options.providerID ?? model.providerID
  const currentModel = { ...model, providerID, headers: options.modelHeaders ?? {} } as Provider.Model
  const composition = options.composition ?? { type: "interactive" as const }
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
      composition,
      retainedSteeringCut:
        composition.type === "interactive"
          ? options.retainedSteeringCut === null
            ? undefined
            : (options.retainedSteeringCut ?? retainedSteeringCut())
          : undefined,
      learningContextRenderedBlock:
        composition.type === "interactive"
          ? options.learningContextRenderedBlock === null
            ? undefined
            : (options.learningContextRenderedBlock ?? learningContextBlock)
          : undefined,
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

const gate19LaterRequest =
  "Continue. If my previous response supported the criterion before you disclosed the answer, give only one application question. If it did not support the criterion, give only the correction. If you disclosed the answer first, give only a new answer-hidden check. Choose exactly one branch."

type Gate19Trace = Readonly<{
  relation: "supports" | "does_not_support"
  exposure: "learner_response_before_tutor_disclosure" | "tutor_disclosure_before_learner_response"
}>

function gate19LearningContext(trace?: Gate19Trace) {
  const entries = trace
    ? [
        {
          kind: "learner_response_evidence",
          locator: {
            recordID: "lre_00000000000000000000000001",
            revisionID: "lrr_00000000000000000000000002",
            version: 0,
            subjectOccurrenceID: "lco_00000000000000000000000003",
            subjectSourceOrder: 2,
            target: {
              mapID: "mmp_00000000000000000000000003",
              selectorID: "msl_00000000000000000000000005",
              courseID: "crs_00000000000000000000000007",
              viewID: "cvw_00000000000000000000000008",
              revisionID: "cvr_00000000000000000000000009",
              itemID: "cit_0000000000000000000000000A",
              alignmentID: "mca_00000000000000000000000006",
            },
            lazyReadAvailable: true,
          },
          semantic: {
            state: "value",
            value: {
              assessmentScope: "entire_exact_selector",
              relation: trace.relation,
              basis: "tutor_interpretation",
              exposure: trace.exposure,
              disposition: "active",
              sourceAvailability: {
                subject: "source_deleted",
                condition: "source_deleted",
                basis: "source_deleted",
              },
              targetRelation: { map: "current", selector: "current", alignment: "current", course: "current" },
              selectorByteLength: 101,
              interpretation:
                "Fallible source-linked assessment of this one deleted response against the entire exact selector under the recorded disclosure condition.",
              nonImplications: [
                "mastery",
                "understanding",
                "retention",
                "correctness_beyond_this_selector_bound_occurrence",
                "required_next_action",
              ],
            },
          },
        },
      ]
    : []
  const assistantMessageID = "msg_gate19_provider_trace"
  const surface = LearningContext.bindProviderToolSurface({
    route: {
      runtime: "ai_sdk",
      provider: "openai",
      model: "gpt-5-mini",
      protocol: "language-model-v3",
      compiler: {
        sourcePackage: "@ai-sdk/openai",
        sourceVersion: "3.0.53",
        projector: "openai-responses",
        projectorVersion: 1,
        promptFields: ["input", "instructions"],
        publicQuery: [],
        credentialQuery: [],
        bodyCredentials: ["openai_hosted_mcp"],
        compilerAuth: "api_key",
        terminalRoutes: [],
      },
      transport: {
        method: "POST",
        endpoint: { protocol: "https:", host: "api.openai.com", pathname: "/v1/responses", query: [] },
      },
    },
    toolChoice: { state: "present", value: "auto" },
    definitions: [
      {
        id: "learner_response_evidence_read",
        value: {
          type: "function",
          name: "learner_response_evidence_read",
          description: "Read bounded learner-response evidence owner state.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          strict: true,
        },
      },
    ],
  }).binding
  const base = {
    schemaVersion: LearningContext.SCHEMA_VERSION,
    policyVersion: LearningContext.POLICY_VERSION,
    rendererVersion: LearningContext.RENDERER_VERSION,
    operation: {
      sessionID: "ses_gate19_provider_trace",
      turnID: "trn_gate19_provider_trace",
      inputID: "tri_gate19_provider_trace",
      causalOccurrenceID: "lco_gate19_provider_trace",
      assistantMessageID,
      ordinal: 0,
    },
    cutAsOf: 300,
    throughSharedFrontier: { sequence: 1, time: 300 },
    retainedSteering: { assistantMessageID, cutAsOf: 300, fingerprint: "a".repeat(64) },
    capabilityBasis: {
      catalogVersion: LearningContext.CAPABILITY_CATALOG_VERSION,
      policyFingerprint: LearningContext.canonicalFingerprint(
        LearningContext.toJsonValue({ automaticContext: true, lazy: ["learner_response_evidence_read"] }),
      ),
      effectiveAutomaticContext: true,
      effectiveLazyReadCapabilities: ["learner_response_evidence_read"],
      effectiveProviderToolSurfaceBinding: surface,
    },
    sections: [
      {
        owner: "course",
        scope: "eligible_courses_and_structurally_referenced_default",
        selectionBasis: "course_created_time_then_id_not_priority",
        coverage: "empty",
        countAtCut: 0,
        omission: { type: "none" },
        entries: [],
      },
      {
        owner: "learner_navigation",
        scope: "default_and_included_course_anchors",
        selectionBasis: "structural_default_then_course_id_not_priority",
        coverage: "empty",
        countAtCut: 0,
        omission: { type: "none" },
        entries: [],
      },
      {
        owner: "learner_goal",
        scope: "current_goal_heads",
        selectionBasis: "revision_order_desc_then_goal_id_desc_not_priority",
        coverage: "empty",
        countAtCut: 0,
        omission: { type: "none" },
        entries: [],
      },
      {
        owner: "material",
        scope: "alignments_reached_from_included_course_membership",
        selectionBasis: "alignment_created_time_then_id_not_priority",
        coverage: "empty",
        countAtCut: 0,
        omission: { type: "none" },
        entries: [],
      },
      {
        owner: "interaction",
        scope: "terminal_root_turns_outside_current_session",
        selectionBasis: "terminal_time_desc_then_turn_id_desc_not_priority",
        coverage: "empty",
        countAtCut: 0,
        omission: { type: "none" },
        entries: [],
      },
      {
        owner: "learner_response_evidence",
        scope: "active_source_deleted_heads_for_structurally_included_course_membership",
        selectionBasis: "subject_source_order_then_record_id_not_priority",
        coverage: entries.length === 0 ? "empty" : "complete",
        countAtCut: entries.length,
        omission: { type: "none" },
        entries,
      },
    ],
  } as const
  const entryCounts = {
    course: 0,
    learner_navigation: 0,
    learner_goal: 0,
    material: 0,
    interaction: 0,
    learner_response_evidence: entries.length,
  }
  let canonicalBytes = 0
  let renderedBytes = 0
  for (let attempt = 0; attempt < 8; attempt++) {
    const budget = { canonicalBytes, renderedBytes, entryCounts, hardLimits: LearningContext.hardLimits }
    const fingerprint = LearningContext.canonicalFingerprint(LearningContext.toJsonValue({ ...base, budget }))
    const draft = { ...base, budget, fingerprint, renderedFingerprint: "0".repeat(64) }
    const renderedBlock = renderGate19LearningContext(draft as unknown as LearningContext.Cut)
    renderedBytes = LearningContext.utf8Bytes(renderedBlock)
    const cut = {
      ...draft,
      budget: { ...budget, renderedBytes },
      renderedFingerprint: LearningContext.sha256(renderedBlock),
    } as unknown as LearningContext.Cut
    const canonicalCut = LearningContext.canonicalJson(LearningContext.toJsonValue(cut))
    const nextCanonicalBytes = LearningContext.utf8Bytes(canonicalCut)
    if (nextCanonicalBytes === canonicalBytes && cut.budget.renderedBytes === renderedBytes) {
      const validated = LearningContext.renderCut(cut)
      if (validated !== renderedBlock) throw new Error("Gate 19 protected context fixture does not match renderer v2")
      return validated
    }
    canonicalBytes = nextCanonicalBytes
  }
  throw new Error("Gate 19 protected context fixture byte accounting did not converge")
}

function renderGate19LearningContext(cut: LearningContext.Cut) {
  return [
    "[Repa learning context — protected]",
    `schemaVersion: ${cut.schemaVersion}; policyVersion: ${cut.policyVersion}; rendererVersion: ${cut.rendererVersion}`,
    `cutFingerprint: ${cut.fingerprint}`,
    `cutAsOf: ${cut.cutAsOf}; throughSharedFrontier: ${LearningContext.canonicalJson(LearningContext.toJsonValue(cut.throughSharedFrontier))}`,
    `retainedSteering: ${LearningContext.canonicalJson(LearningContext.toJsonValue(cut.retainedSteering))}`,
    `capabilityBasis: ${LearningContext.canonicalJson(
      LearningContext.toJsonValue({
        catalogVersion: cut.capabilityBasis.catalogVersion,
        policyFingerprint: cut.capabilityBasis.policyFingerprint,
        effectiveAutomaticContext: cut.capabilityBasis.effectiveAutomaticContext,
        effectiveLazyReadCapabilities: cut.capabilityBasis.effectiveLazyReadCapabilities,
        providerToolSurface: cut.capabilityBasis.effectiveProviderToolSurfaceBinding,
      }),
    )}`,
    `sections (canonical order is not priority): ${LearningContext.canonicalJson(LearningContext.toJsonValue(cut.sections))}`,
    "This is a bounded observation condition for this sample, not learning truth, priority, mastery, progress, or a selected Tutor move. Use exact owner reads when available; never infer missing detail or authorization from a locator.",
    "[/Repa learning context]",
  ].join("\n")
}

function providerText(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(providerText)
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(providerText)
  return []
}

function gate19TraceOracle(providerVisible: unknown) {
  const context = providerText(providerVisible).find((value) =>
    value.includes("[Repa learning context — protected]"),
  )
  if (!context || !context.includes('"owner":"learner_response_evidence"')) return "underdetermined_without_record"
  if (
    context.includes('"relation":"supports"') &&
    context.includes('"exposure":"learner_response_before_tutor_disclosure"')
  )
    return "application_question_only"
  if (context.includes('"relation":"does_not_support"')) return "correction_only"
  if (
    context.includes('"relation":"supports"') &&
    context.includes('"exposure":"tutor_disclosure_before_learner_response"')
  )
    return "new_answer_hidden_check_only"
  return "underdetermined_without_record"
}

async function compileProviderBody(renderedBlock: string, oauth: boolean, messages?: ModelMessage[]) {
  const prepared = await prepare({
    oauth,
    learningContextRenderedBlock: renderedBlock,
    messages: messages ?? [{ role: "user", content: gate19LaterRequest }],
  })
  const request = LLMNative.request({
    model,
    apiKey: "test-key",
    messages: prepared.messages,
    providerOptions: ProviderTransform.providerOptions(model, prepared.params.options),
  })
  const compiled = await Effect.runPromise(LLMClient.prepare(request))
  return compiled.body
}

function gate19SameSessionOracle(providerVisible: unknown) {
  const visible = providerText(providerVisible).join("\n")
  if (visible.includes("I am still mixing those two roles up; correct me with one contrast, then let me retry."))
    return "contrast_correction_then_retry"
  if (visible.includes("That distinction is now clear; give me one application question."))
    return "application_question_only"
  return "underdetermined"
}

describe("session.llm.request composition", () => {
  test("keeps the exact retained steering cut protected and present exactly once", async () => {
    const cut = retainedSteeringCut()
    const rendered = RetainedSteering.renderCut(cut)
    const prepared = await prepare({
      retainedSteeringCut: cut,
      transform(system) {
        system.length = 0
        system.push("PLUGIN_REPLACEMENT", rendered, SystemPrompt.product())
      },
    })

    expect(prepared.system.slice(0, 2)).toEqual([SystemPrompt.product(), rendered])
    expect(occurrences(prepared.system.join("\n"), "[Repa retained learner steering — protected]")).toBe(1)
    expect(prepared.system).toContain("<learning_context>bounded course context</learning_context>")
    expect(prepared.system).toContain("PLUGIN_REPLACEMENT")
  })

  test("fails closed when an interactive operation has no exact retained steering cut", async () => {
    await expect(prepare({ retainedSteeringCut: null })).rejects.toThrow("no exact retained steering cut")
  })

  test("fails closed when an interactive operation has no exact learning-context block", async () => {
    await expect(prepare({ learningContextRenderedBlock: null })).rejects.toThrow("no exact learning context block")
  })

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

  test("carries source-deleted learner evidence into provider-visible requests without selecting a production move", async () => {
    expect(new Bun.CryptoHasher("sha256").update(gate19LaterRequest).digest("hex")).toBe(
      "1b19637374085117ae91e3ae7542f9fb961a089c93e9b8457e8611f2fee41e2d",
    )
    const cases = [
      {
        trace: {
          relation: "supports",
          exposure: "learner_response_before_tutor_disclosure",
        } as const,
        branch: "application_question_only",
      },
      {
        trace: {
          relation: "does_not_support",
          exposure: "learner_response_before_tutor_disclosure",
        } as const,
        branch: "correction_only",
      },
      {
        trace: {
          relation: "supports",
          exposure: "tutor_disclosure_before_learner_response",
        } as const,
        branch: "new_answer_hidden_check_only",
      },
    ]

    for (const item of cases) {
      const block = gate19LearningContext(item.trace)
      for (const oauth of [false, true]) {
        const body = await compileProviderBody(block, oauth)
        const visible = providerText(body).join("\n")
        expect(occurrences(visible, "[Repa learning context — protected]")).toBe(1)
        expect(occurrences(visible, gate19LaterRequest)).toBe(1)
        expect(gate19TraceOracle(body)).toBe(item.branch)
        expect(visible).not.toContain("Session transcript history therefore does not replace separate learning authorities.")
        expect(visible).not.toContain("The Session transcript itself contains everything Repa needs")
        expect(visible).not.toContain("Now repeat that distinction.")
      }
    }

    const zeroWriteBody = await compileProviderBody(gate19LearningContext(), false)
    expect(gate19TraceOracle(zeroWriteBody)).toBe("underdetermined_without_record")
    expect(cases.map(() => gate19TraceOracle(zeroWriteBody))).toEqual([
      "underdetermined_without_record",
      "underdetermined_without_record",
      "underdetermined_without_record",
    ])
  })

  test("lets ordinary same-session interaction change a peer teaching move with zero learner-evidence write", async () => {
    const shared: ModelMessage[] = [
      {
        role: "user",
        content: "I thought the Session transcript itself was Repa's long-term learning-state model.",
      },
      {
        role: "assistant",
        content:
          "The Session transcript is interaction history; separate learning authorities own durable learning meaning.",
      },
    ]
    const confused = await compileProviderBody(gate19LearningContext(), false, [
      ...shared,
      {
        role: "user",
        content: "I am still mixing those two roles up; correct me with one contrast, then let me retry.",
      },
    ])
    const ready = await compileProviderBody(gate19LearningContext(), false, [
      ...shared,
      { role: "user", content: "That distinction is now clear; give me one application question." },
    ])

    expect(gate19SameSessionOracle(confused)).toBe("contrast_correction_then_retry")
    expect(gate19SameSessionOracle(ready)).toBe("application_question_only")
    for (const body of [confused, ready]) {
      const visible = providerText(body).join("\n")
      expect(visible).toContain('"owner":"learner_response_evidence"')
      expect(visible).toContain('"countAtCut":0')
      expect(visible).not.toContain('"relation":"supports"')
      expect(visible).not.toContain('"relation":"does_not_support"')
    }
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
      expect(joined).not.toContain("[Repa retained learner steering — protected]")
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
