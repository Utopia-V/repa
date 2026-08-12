type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

const hardLimits = Object.freeze({
  canonicalBytes: 32_768,
  renderedBytes: 16_384,
  entryBytes: 2_048,
  candidatesPerFamily: 8,
  interactionCandidates: 4,
  lazyBytes: 32_768,
  lazyItems: 64,
})

const sectionPolicy = [
  ["course", "eligible_courses_and_structurally_referenced_default"],
  ["learner_navigation", "default_and_included_course_anchors"],
  ["learner_goal", "current_goal_heads"],
  ["material", "alignments_reached_from_included_course_membership"],
  ["interaction", "terminal_root_turns_outside_current_session"],
  ["learner_response_evidence", "active_source_deleted_heads_for_structurally_included_course_membership"],
  ["future_attention", "all_due_open_target_current_concerns_in_learner_home"],
  ["assignment", "all_current_open_assignment_heads_in_learner_home"],
  ["learner_state_judgment", "active_heads_intersecting_context_anchors_or_learner_home_wide"],
  ["advisory_plan_suggestion", "active_heads_matching_context_owner_keys_or_bounded_learner_home_fallback"],
] as const

/** Frozen predecessor producers copied before Gate 21A introduced renderer 7. */
export function prepareFrozenV23LearningContextCut(
  generation: 1 | 2 | 6,
  input: {
    readonly sessionID: string
    readonly turnID: string
    readonly inputID: string
    readonly occurrenceID: string
    readonly assistantMessageID: string
    readonly ordinal: number
    readonly cutAsOf: number
    readonly throughSharedFrontier: Readonly<{ sequence: number; time: number }>
    readonly retainedSteeringFingerprint: string
  },
) {
  const providerToolSurface = bindProviderToolSurface({
    route: {
      runtime: "ai_sdk",
      provider: "unavailable",
      model: "unavailable",
      protocol: "language-model-v3",
      compiler: {
        sourcePackage: "unavailable",
        sourceVersion: "0",
        projector: "unavailable",
        projectorVersion: 1,
        promptFields: [],
        publicQuery: [],
        credentialQuery: [],
        bodyCredentials: [],
        compilerAuth: "api_key",
        terminalRoutes: [],
      },
      transport: {
        method: "POST",
        endpoint: { protocol: "https:", host: "unavailable.invalid", pathname: "/", query: [] },
      },
    },
    toolChoice: { state: "absent" },
    definitions: [],
  })
  const ownerCount = generation === 1 ? 5 : generation === 2 ? 6 : 10
  const base = {
    schemaVersion: 1,
    policyVersion: generation,
    rendererVersion: generation,
    operation: {
      sessionID: input.sessionID,
      turnID: input.turnID,
      inputID: input.inputID,
      causalOccurrenceID: input.occurrenceID,
      assistantMessageID: input.assistantMessageID,
      ordinal: input.ordinal,
    },
    cutAsOf: input.cutAsOf,
    throughSharedFrontier: input.throughSharedFrontier,
    retainedSteering: {
      assistantMessageID: input.assistantMessageID,
      cutAsOf: input.cutAsOf,
      fingerprint: input.retainedSteeringFingerprint,
    },
    capabilityBasis: {
      catalogVersion: generation,
      policyFingerprint: canonicalFingerprint(toJsonValue({ automaticContext: "withheld", lazy: [] })),
      effectiveAutomaticContext: false,
      effectiveLazyReadCapabilities: [],
      effectiveProviderToolSurfaceBinding: providerToolSurface,
    },
    sections: sectionPolicy.slice(0, ownerCount).map(([owner, scope]) => ({
      owner,
      scope,
      selectionBasis: "automatic_context_capability_withheld",
      coverage: "not_authorized",
      countAtCut: "unknown",
      omission: { type: "unknown", reason: "automatic_context_capability_withheld" },
      entries: [],
    })),
  }
  const entryCounts = Object.fromEntries(base.sections.map((section) => [section.owner, section.entries.length]))
  let canonicalBytes = 0
  let renderedBytes = 0
  for (let attempt = 0; attempt < 8; attempt++) {
    const budget = { canonicalBytes, renderedBytes, entryCounts, hardLimits }
    const fingerprint = canonicalFingerprint(toJsonValue({ ...base, budget }))
    const draft = { ...base, budget, fingerprint, renderedFingerprint: "0".repeat(64) }
    const renderedBlock = render(draft)
    renderedBytes = utf8Bytes(renderedBlock)
    const cut = {
      ...draft,
      budget: { ...budget, renderedBytes },
      renderedFingerprint: sha256(renderedBlock),
    }
    const canonicalCut = canonicalJson(toJsonValue(cut))
    const nextCanonicalBytes = utf8Bytes(canonicalCut)
    if (nextCanonicalBytes === canonicalBytes && cut.budget.renderedBytes === renderedBytes) {
      if (nextCanonicalBytes > hardLimits.canonicalBytes || renderedBytes > hardLimits.renderedBytes) {
        throw new Error(`Frozen generation ${generation} learning context exceeds its historical limits`)
      }
      return { cut, canonicalCut, renderedBlock }
    }
    canonicalBytes = nextCanonicalBytes
  }
  throw new Error(`Frozen generation ${generation} learning-context byte accounting did not converge`)
}

function bindProviderToolSurface(input: {
  readonly route: unknown
  readonly toolChoice: unknown
  readonly definitions: readonly Readonly<{ id: string; value: unknown }>[]
}) {
  const route = toJsonValue(input.route)
  const toolChoice = toJsonValue(input.toolChoice)
  const definitions = input.definitions.map((definition) => ({ id: definition.id, value: toJsonValue(definition.value) }))
  const canonicalToolChoice = canonicalJson(toolChoice)
  const canonicalDefinitions = definitions.map((definition) => canonicalJson(definition.value))
  const canonicalSurface = canonicalJson(toJsonValue({ route, toolChoice, definitions }))
  const compact = {
    route,
    toolChoice: {
      value: toolChoice,
      canonicalBytes: utf8Bytes(canonicalToolChoice),
      fingerprint: sha256(canonicalToolChoice),
    },
    definitions: definitions.map((definition, index) => ({
      id: definition.id,
      canonicalBytes: utf8Bytes(canonicalDefinitions[index]!),
      fingerprint: sha256(canonicalDefinitions[index]!),
    })),
    definitionCount: definitions.length,
    combinedFingerprint: sha256(canonicalSurface),
    combinedCanonicalBytes: utf8Bytes(canonicalSurface),
  }
  return { ...compact, fingerprint: canonicalFingerprint(toJsonValue(compact)) }
}

function render(cut: ReturnType<typeof draftShape>) {
  return cut.rendererVersion === 6 ? renderGate21(cut) : renderFrozen(cut)
}

function renderFrozen(cut: ReturnType<typeof draftShape>) {
  return [
    "[Repa learning context — protected]",
    `schemaVersion: ${cut.schemaVersion}; policyVersion: ${cut.policyVersion}; rendererVersion: ${cut.rendererVersion}`,
    `cutFingerprint: ${cut.fingerprint}`,
    `cutAsOf: ${cut.cutAsOf}; throughSharedFrontier: ${canonicalJson(toJsonValue(cut.throughSharedFrontier))}`,
    `retainedSteering: ${canonicalJson(toJsonValue(cut.retainedSteering))}`,
    `capabilityBasis: ${canonicalJson(
      toJsonValue({
        catalogVersion: cut.capabilityBasis.catalogVersion,
        policyFingerprint: cut.capabilityBasis.policyFingerprint,
        effectiveAutomaticContext: cut.capabilityBasis.effectiveAutomaticContext,
        effectiveLazyReadCapabilities: cut.capabilityBasis.effectiveLazyReadCapabilities,
        providerToolSurface: cut.capabilityBasis.effectiveProviderToolSurfaceBinding,
      }),
    )}`,
    `sections (canonical order is not priority): ${canonicalJson(toJsonValue(cut.sections))}`,
    "This is a bounded observation condition for this sample, not learning truth, priority, mastery, progress, or a selected Tutor move. Use exact owner reads when available; never infer missing detail or authorization from a locator.",
    "[/Repa learning context]",
  ].join("\n")
}

function renderGate21(cut: ReturnType<typeof draftShape>) {
  const surface = cut.capabilityBasis.effectiveProviderToolSurfaceBinding
  return [
    "[Repa learning context — protected]",
    `schemaVersion: ${cut.schemaVersion}; policyVersion: ${cut.policyVersion}; rendererVersion: ${cut.rendererVersion}`,
    `cutFingerprint: ${cut.fingerprint}`,
    `cutAsOf: ${cut.cutAsOf}; throughSharedFrontier: ${canonicalJson(toJsonValue(cut.throughSharedFrontier))}`,
    `retainedSteering: ${canonicalJson(toJsonValue(cut.retainedSteering))}`,
    `capabilityBasis: ${canonicalJson(
      toJsonValue({
        catalogVersion: cut.capabilityBasis.catalogVersion,
        policyFingerprint: cut.capabilityBasis.policyFingerprint,
        effectiveAutomaticContext: cut.capabilityBasis.effectiveAutomaticContext,
        effectiveLazyReadCapabilities: cut.capabilityBasis.effectiveLazyReadCapabilities,
        providerToolSurface: {
          definitionCount: surface.definitionCount,
          combinedCanonicalBytes: surface.combinedCanonicalBytes,
          combinedFingerprint: surface.combinedFingerprint,
          fingerprint: surface.fingerprint,
          toolChoice: {
            canonicalBytes: surface.toolChoice.canonicalBytes,
            fingerprint: surface.toolChoice.fingerprint,
          },
        },
      }),
    )}`,
    "futureAttention: automatic contribution withheld by the effective capability basis.",
    "Future attention is a conditional default, not service, evidence, mastery, progress, priority, or a durable selected Tutor move.",
    "assignment: automatic contribution withheld by the effective capability basis.",
    "Assignment context is obligation pressure for learning help, not task administration or evidence that work happened. Time, silence, absence, and elapsed due periods imply no activity, zero progress, breach, completion, or lifecycle transition.",
    "learnerStateJudgment: automatic Context withheld; identity and count are unknown. Age, silence, Assignment state, and plans imply no learner-state change; useful teaching may remain zero-write.",
    "advisoryPlanSuggestion: automatic Context withheld; identity and count are unknown. Advice is not a schedule, commitment, activity record, mastery claim, or selected plan.",
    `sections (canonical order is not priority): ${canonicalJson(toJsonValue(cut.sections))}`,
    "This is a bounded observation condition for this sample, not learning truth, priority, mastery, progress, or a selected Tutor move. Use exact owner reads when available; never infer missing detail or authorization from a locator.",
    "[/Repa learning context]",
  ].join("\n")
}

function draftShape(value: {
  readonly schemaVersion: number
  readonly policyVersion: number
  readonly rendererVersion: number
  readonly fingerprint: string
  readonly cutAsOf: number
  readonly throughSharedFrontier: unknown
  readonly retainedSteering: unknown
  readonly capabilityBasis: {
    readonly catalogVersion: number
    readonly policyFingerprint: string
    readonly effectiveAutomaticContext: boolean
    readonly effectiveLazyReadCapabilities: readonly unknown[]
    readonly effectiveProviderToolSurfaceBinding: ReturnType<typeof bindProviderToolSurface>
  }
  readonly sections: readonly Readonly<{ readonly owner: string; readonly entries: readonly unknown[] }>[]
}) {
  return value
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function sha256(value: string | Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function canonicalFingerprint(value: JsonValue) {
  return sha256(canonicalJson(value))
}

function canonicalJson(value: JsonValue) {
  return JSON.stringify(canonicalValue(value))
}

function toJsonValue(value: unknown): JsonValue {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error("Frozen Gate 21 value is not representable as JSON")
  return canonicalValue(JSON.parse(encoded) as JsonValue)
}

function canonicalValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite frozen JSON number")
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalValue(item)]),
  )
}
