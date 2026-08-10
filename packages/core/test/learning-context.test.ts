import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  CAPABILITY_CATALOG_VERSION,
  CapacityIntegrityError,
  CutIntegrityError,
  GATE19_CAPABILITY_CATALOG_VERSION,
  GATE19_POLICY_VERSION,
  GATE19_RENDERER_VERSION,
  MAX_CANONICAL_BYTES,
  MAX_ENTRY_BYTES,
  MAX_RENDERED_BYTES,
  bindProviderToolSurface,
  boundedValue,
  canonicalFingerprint,
  canonicalJson,
  decodeStored,
  decodeCapacity,
  prepareCapacity,
  prepareCut,
  sha256,
  toJsonValue,
  utf8Bytes,
  type CapabilityBasis,
  type Cut,
} from "@opencode-ai/core/learning-context"
import type { Database } from "@opencode-ai/core/database/database"
import type { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const sessionID = SessionSchema.ID.make("ses_gate18_context")
const turnID = Turn.ID.make("trn_gate18_context")
const inputID = Turn.InputID.make("tri_gate18_context")
const assistantMessageID = SessionV1.MessageID.make("msg_gate18_context")
const route = {
  runtime: "ai_sdk",
  provider: "test-provider",
  model: "test-model",
  protocol: "language-model-v3",
  compiler: {
    sourcePackage: "test-provider",
    sourceVersion: "1",
    projector: "test",
    projectorVersion: 1,
    promptFields: ["messages"],
    publicQuery: ["api-version"],
    credentialQuery: ["api-key"],
    bodyCredentials: [],
    compilerAuth: "api_key",
    terminalRoutes: [],
  },
  transport: {
    method: "POST",
    endpoint: {
      protocol: "https:",
      host: "provider.test",
      pathname: "/v1/responses",
      query: [{ key: "api-version", state: "value", value: "2026-08-04" }],
    },
  },
} as const

function basis(
  surface = bindProviderToolSurface({ route, toolChoice: { state: "absent" }, definitions: [] }).binding,
  lazy: CapabilityBasis["effectiveLazyReadCapabilities"] = [],
) {
  return {
    catalogVersion: CAPABILITY_CATALOG_VERSION,
    policyFingerprint: canonicalFingerprint(toJsonValue({ automaticContext: "withheld", lazy })),
    effectiveAutomaticContext: false,
    effectiveLazyReadCapabilities: lazy,
    effectiveProviderToolSurfaceBinding: surface,
  } satisfies CapabilityBasis
}

function retainedSteering() {
  return {
    assistantMessageID,
    cutAsOf: 10,
    throughSharedFrontier: { sequence: 3, time: 9 },
    fingerprint: "a".repeat(64),
  } as RetainedSteering.Cut
}

function capacityInput(overrides: Partial<Parameters<typeof prepareCapacity>[0]> = {}) {
  return {
    assistantMessageID,
    envelopeFingerprint: "1".repeat(64),
    retainedSteeringFingerprint: "2".repeat(64),
    learningContextFingerprint: "3".repeat(64),
    learningContextRenderedFingerprint: "4".repeat(64),
    providerToolSurfaceFingerprint: "5".repeat(64),
    providerToolSurfaceCanonicalBytes: 400,
    fixedEstimatedTokens: 1_000,
    removableEstimatedTokens: 2_000,
    removableHistory: {
      tailStartMessageID: SessionV1.MessageID.make("msg_capacity_tail"),
      messageCount: 4,
      messageIDsFingerprint: "6".repeat(64),
    },
    ...overrides,
  }
}

describe("LearningContext", () => {
  test("uses ordinal canonical JSON ordering independently of locale", () => {
    expect(canonicalJson({ ä: 1, z: 2, A: 3 })).toBe('{"A":3,"z":2,"ä":1}')
    expect(
      canonicalJson({
        array: [
          { z: 1, a: 2 },
          { β: 3, A: 4 },
        ],
      }),
    ).toBe('{"array":[{"a":2,"z":1},{"A":4,"β":3}]}')
  })

  test("keeps an exact multibyte entry whole and turns its first overflow byte into a stable locator digest", () => {
    const exact = "界".repeat((MAX_ENTRY_BYTES - 2) / 3)
    const overflow = `${exact}a`

    expect(utf8Bytes(JSON.stringify(exact))).toBe(MAX_ENTRY_BYTES)
    expect(boundedValue(exact)).toEqual({ state: "value", value: exact })
    expect(utf8Bytes(JSON.stringify(overflow))).toBe(MAX_ENTRY_BYTES + 1)
    expect(boundedValue(overflow)).toEqual({
      state: "locator_only",
      canonicalBytes: MAX_ENTRY_BYTES + 1,
      fingerprint: sha256(JSON.stringify(overflow)),
      reason: "entry_allowance",
    })
    expect(boundedValue(overflow)).toEqual(boundedValue(overflow))
  })

  test("binds an oversized provider-visible definition without embedding its body in the cut binding", () => {
    const first = bindProviderToolSurface({
      route,
      toolChoice: { state: "present", value: { type: "tool", toolName: "large_tool" } },
      definitions: [
        {
          id: "large_tool",
          value: {
            type: "function",
            name: "large_tool",
            description: "x".repeat(40_000),
            inputSchema: { type: "object", properties: { value: { type: "string" } } },
            strict: true,
          },
        },
      ],
    })
    const changed = bindProviderToolSurface({
      route,
      toolChoice: { state: "present", value: { type: "tool", toolName: "large_tool" } },
      definitions: [
        {
          id: "large_tool",
          value: {
            type: "function",
            name: "large_tool",
            description: `${"x".repeat(39_999)}y`,
            inputSchema: { type: "object", properties: { value: { type: "string" } } },
            strict: true,
          },
        },
      ],
    })

    expect(utf8Bytes(first.canonicalSurface)).toBeGreaterThan(MAX_CANONICAL_BYTES)
    expect(utf8Bytes(canonicalJson(toJsonValue(first.binding)))).toBeLessThan(MAX_CANONICAL_BYTES)
    expect(first.binding.definitions[0]?.canonicalBytes).toBe(changed.binding.definitions[0]?.canonicalBytes)
    expect(first.binding.definitions[0]?.fingerprint).not.toBe(changed.binding.definitions[0]?.fingerprint)
    expect(first.binding.fingerprint).not.toBe(changed.binding.fingerprint)
  })

  test("keeps exact provider definitions canonical while v5 renders only their compact aggregate", async () => {
    const providerSurface = bindProviderToolSurface({
      route,
      toolChoice: { state: "present", value: { type: "tool", toolName: "probe_tool" } },
      definitions: [
        { id: "probe_tool", value: { name: "probe_tool", description: "exact provider definition" } },
        { id: "large_tool", value: { name: "large_tool", description: "x".repeat(4_096) } },
      ],
    })
    const prepared = await Effect.runPromise(
      prepareCut({} as Transaction, {
        operation: { sessionID, turnID, inputID, assistantMessageID, ordinal: 0 },
        retainedSteering: retainedSteering(),
        capabilityBasis: basis(providerSurface.binding),
      }),
    )

    expect(prepared.canonicalCut).toContain('"definitions":[{')
    expect(prepared.canonicalCut).toContain('"id":"probe_tool"')
    expect(prepared.canonicalCut).toContain(providerSurface.binding.definitions[0]!.fingerprint)
    expect(prepared.renderedBlock).toContain('"definitionCount":2')
    expect(prepared.renderedBlock).toContain(providerSurface.binding.combinedFingerprint)
    expect(prepared.renderedBlock).toContain(providerSurface.binding.fingerprint)
    expect(prepared.renderedBlock).not.toContain('"definitions"')
    expect(prepared.renderedBlock).not.toContain('"id":"probe_tool"')
    expect(decodeStored(prepared.canonicalCut, prepared.renderedBlock, assistantMessageID)).toEqual(prepared.cut)
  })

  test("creates and replays a bounded no-read cut when automatic context is withheld", async () => {
    const prepared = await Effect.runPromise(
      prepareCut({} as Transaction, {
        operation: {
          sessionID,
          turnID,
          inputID,
          causalOccurrenceID: "occ_gate18_context",
          assistantMessageID,
          ordinal: 0,
        },
        retainedSteering: retainedSteering(),
        capabilityBasis: basis(),
      }),
    )

    expect(prepared.cut.sections.map((section) => section.owner)).toEqual([
      "course",
      "learner_navigation",
      "learner_goal",
      "material",
      "interaction",
      "learner_response_evidence",
      "future_attention",
      "assignment",
      "learner_state_judgment",
    ])
    expect(
      prepared.cut.sections.every(
        (section) =>
          section.coverage === "not_authorized" &&
          section.countAtCut === "unknown" &&
          section.entries.length === 0 &&
          section.omission.type === "unknown",
      ),
    ).toBeTrue()
    expect(prepared.cut.budget.canonicalBytes).toBe(utf8Bytes(prepared.canonicalCut))
    expect(prepared.cut.budget.renderedBytes).toBe(utf8Bytes(prepared.renderedBlock))
    expect(prepared.cut.budget.canonicalBytes).toBeLessThanOrEqual(MAX_CANONICAL_BYTES)
    expect(prepared.cut.budget.renderedBytes).toBeLessThanOrEqual(MAX_RENDERED_BYTES)
    expect(decodeStored(prepared.canonicalCut, prepared.renderedBlock, assistantMessageID)).toEqual(prepared.cut)
  })

  test("keeps a frozen Gate 19 policy-2 cut byte-exact and readable", async () => {
    const current = await Effect.runPromise(
      prepareCut({} as Transaction, {
        operation: { sessionID, turnID, inputID, assistantMessageID, ordinal: 0 },
        retainedSteering: retainedSteering(),
        capabilityBasis: basis(),
      }),
    )
    const frozen = freezeGate19Cut(current.cut)

    expect(decodeStored(frozen.canonicalCut, frozen.renderedBlock, assistantMessageID)).toEqual(frozen.cut)
    expect(sha256(frozen.canonicalCut)).toBe("58fab29a2ca49bb82d9af69ef0f609483751f7232c113d01a2926aed9c7ad6d1")
    expect(sha256(frozen.renderedBlock)).toBe("32f54b768588967c9cace8e49b4d2b7ddae0cd965257df331c07e181b7b80cda")
  })

  test("rejects a stored cut whose capability catalog contains an unknown lazy-read ID", async () => {
    const prepared = await Effect.runPromise(
      prepareCut({} as Transaction, {
        operation: {
          sessionID,
          turnID,
          inputID,
          assistantMessageID,
          ordinal: 0,
        },
        retainedSteering: retainedSteering(),
        capabilityBasis: basis(),
      }),
    )
    const parsed = JSON.parse(prepared.canonicalCut)
    parsed.capabilityBasis.effectiveLazyReadCapabilities = ["unknown_read"]

    expect(() => decodeStored(canonicalJson(toJsonValue(parsed)), prepared.renderedBlock, assistantMessageID)).toThrow(
      CutIntegrityError,
    )
  })

  test("rejects an outer re-fingerprinted cut whose compact provider-surface seal was forged", async () => {
    const prepared = await Effect.runPromise(
      prepareCut({} as Transaction, {
        operation: {
          sessionID,
          turnID,
          inputID,
          assistantMessageID,
          ordinal: 0,
        },
        retainedSteering: retainedSteering(),
        capabilityBasis: basis(),
      }),
    )
    const parsed = JSON.parse(prepared.canonicalCut)
    const originalSurfaceFingerprint = parsed.capabilityBasis.effectiveProviderToolSurfaceBinding.fingerprint
    const forgedSurfaceFingerprint = "f".repeat(64)
    parsed.capabilityBasis.effectiveProviderToolSurfaceBinding.fingerprint = forgedSurfaceFingerprint
    const originalCutFingerprint = parsed.fingerprint
    parsed.fingerprint = canonicalFingerprint(
      toJsonValue(
        Object.fromEntries(
          Object.entries(parsed).filter(([key]) => key !== "fingerprint" && key !== "renderedFingerprint"),
        ),
      ),
    )
    const renderedBlock = prepared.renderedBlock
      .replace(originalSurfaceFingerprint, forgedSurfaceFingerprint)
      .replace(originalCutFingerprint, parsed.fingerprint)
    parsed.renderedFingerprint = sha256(renderedBlock)
    const canonicalCut = canonicalJson(toJsonValue(parsed))

    expect(utf8Bytes(canonicalCut)).toBe(prepared.cut.budget.canonicalBytes)
    expect(utf8Bytes(renderedBlock)).toBe(prepared.cut.budget.renderedBytes)
    expect(() => decodeStored(canonicalCut, renderedBlock, assistantMessageID)).toThrow(CutIntegrityError)
  })

  test("rejects a fully re-fingerprinted cut whose lazy capabilities disagree with its final provider surface", async () => {
    const providerSurface = bindProviderToolSurface({
      route,
      toolChoice: { state: "absent" },
      definitions: [{ id: "course_query", value: { name: "course_query", description: "read a course" } }],
    })
    const prepared = await Effect.runPromise(
      prepareCut({} as Transaction, {
        operation: { sessionID, turnID, inputID, assistantMessageID, ordinal: 0 },
        retainedSteering: retainedSteering(),
        capabilityBasis: basis(providerSurface.binding, ["course_query"]),
      }),
    )
    const parsed = JSON.parse(prepared.canonicalCut)
    const definition = parsed.capabilityBasis.effectiveProviderToolSurfaceBinding.definitions[0]
    const originalSurfaceFingerprint = parsed.capabilityBasis.effectiveProviderToolSurfaceBinding.fingerprint
    definition.id = "not_a_reader"
    parsed.capabilityBasis.effectiveProviderToolSurfaceBinding.fingerprint = canonicalFingerprint(
      toJsonValue(
        Object.fromEntries(
          Object.entries(parsed.capabilityBasis.effectiveProviderToolSurfaceBinding).filter(
            ([key]) => key !== "fingerprint",
          ),
        ),
      ),
    )
    const originalCutFingerprint = parsed.fingerprint
    parsed.fingerprint = canonicalFingerprint(
      toJsonValue(
        Object.fromEntries(
          Object.entries(parsed).filter(([key]) => key !== "fingerprint" && key !== "renderedFingerprint"),
        ),
      ),
    )
    const renderedBlock = prepared.renderedBlock
      .replace("course_query", "not_a_reader")
      .replace(originalSurfaceFingerprint, parsed.capabilityBasis.effectiveProviderToolSurfaceBinding.fingerprint)
      .replace(originalCutFingerprint, parsed.fingerprint)
    parsed.renderedFingerprint = sha256(renderedBlock)
    const canonicalCut = canonicalJson(toJsonValue(parsed))

    expect(utf8Bytes(canonicalCut)).toBe(prepared.cut.budget.canonicalBytes)
    expect(utf8Bytes(renderedBlock)).toBe(prepared.cut.budget.renderedBytes)
    expect(() => decodeStored(canonicalCut, renderedBlock, assistantMessageID)).toThrow(CutIntegrityError)
  })

  test("rejects a fully re-fingerprinted compact binding with a malformed combined-surface digest", async () => {
    const providerSurface = bindProviderToolSurface({
      route,
      toolChoice: { state: "absent" },
      definitions: [{ id: "probe", value: { name: "probe", description: "exact bytes" } }],
    })
    const prepared = await Effect.runPromise(
      prepareCut({} as Transaction, {
        operation: { sessionID, turnID, inputID, assistantMessageID, ordinal: 0 },
        retainedSteering: retainedSteering(),
        capabilityBasis: basis(providerSurface.binding),
      }),
    )
    const parsed = JSON.parse(prepared.canonicalCut)
    const surface = parsed.capabilityBasis.effectiveProviderToolSurfaceBinding
    const originalCombinedFingerprint = surface.combinedFingerprint
    const originalSurfaceFingerprint = surface.fingerprint
    surface.combinedFingerprint = "g".repeat(64)
    surface.fingerprint = canonicalFingerprint(
      toJsonValue(Object.fromEntries(Object.entries(surface).filter(([key]) => key !== "fingerprint"))),
    )
    const originalCutFingerprint = parsed.fingerprint
    parsed.fingerprint = canonicalFingerprint(
      toJsonValue(
        Object.fromEntries(
          Object.entries(parsed).filter(([key]) => key !== "fingerprint" && key !== "renderedFingerprint"),
        ),
      ),
    )
    const renderedBlock = prepared.renderedBlock
      .replace(originalCombinedFingerprint, surface.combinedFingerprint)
      .replace(originalSurfaceFingerprint, surface.fingerprint)
      .replace(originalCutFingerprint, parsed.fingerprint)
    parsed.renderedFingerprint = sha256(renderedBlock)
    const canonicalCut = canonicalJson(toJsonValue(parsed))

    expect(utf8Bytes(canonicalCut)).toBe(prepared.cut.budget.canonicalBytes)
    expect(utf8Bytes(renderedBlock)).toBe(prepared.cut.budget.renderedBytes)
    expect(() => decodeStored(canonicalCut, renderedBlock, assistantMessageID)).toThrow(CutIntegrityError)
  })

  test("classifies exact final-envelope capacity without treating zero or missing limits as unlimited", () => {
    expect(prepareCapacity(capacityInput({ inputLimitTokens: 4_000 })).assessment).toMatchObject({
      classification: "capacity_known",
      decision: "fit",
      usableInputLimitTokens: 4_000,
      reason: null,
    })
    expect(
      prepareCapacity(capacityInput({ contextLimitTokens: 4_000, outputReserveTokens: 500 })).assessment,
    ).toMatchObject({
      classification: "capacity_known",
      decision: "fit",
      usableInputLimitTokens: 3_500,
    })
    expect(
      prepareCapacity(capacityInput({ contextLimitTokens: 0, inputLimitTokens: 0, outputReserveTokens: 0 })).assessment,
    ).toMatchObject({
      classification: "capacity_unknown",
      decision: "uncertain",
      usableInputLimitTokens: null,
      reason: "model_input_capacity_unknown",
    })
  })

  test("distinguishes removable history overflow from impossible fixed envelopes and invalid limits", () => {
    expect(prepareCapacity(capacityInput({ inputLimitTokens: 2_500 })).assessment).toMatchObject({
      classification: "capacity_known",
      decision: "history_overflow",
      reason: "removable_history_exceeds_usable_input",
    })
    expect(
      prepareCapacity(
        capacityInput({
          fixedEstimatedTokens: 3_000,
          removableEstimatedTokens: 0,
          removableHistory: undefined,
          inputLimitTokens: 2_500,
        }),
      ).assessment,
    ).toMatchObject({
      classification: "capacity_invalid",
      decision: "fixed_overflow",
      reason: "fixed_envelope_exceeds_usable_input",
    })
    expect(
      prepareCapacity(capacityInput({ contextLimitTokens: 1_000, outputReserveTokens: 1_001 })).assessment,
    ).toMatchObject({
      classification: "capacity_invalid",
      decision: "invalid_limits",
      reason: "output_reserve_exhausts_context",
    })
    expect(prepareCapacity(capacityInput({ inputLimitTokens: -1 })).assessment).toMatchObject({
      classification: "capacity_invalid",
      decision: "invalid_limits",
      reason: "inputLimitTokens_invalid",
    })
  })

  test("rejects a canonically re-fingerprinted capacity record with inconsistent classification", () => {
    const prepared = prepareCapacity(capacityInput({ inputLimitTokens: 4_000 }))
    const parsed = JSON.parse(prepared.canonicalAssessment)
    parsed.classification = "capacity_unknown"
    parsed.decision = "uncertain"
    parsed.usableInputLimitTokens = null
    parsed.reason = "model_input_capacity_unknown"
    const base = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== "fingerprint"))
    parsed.fingerprint = canonicalFingerprint(toJsonValue(base))

    expect(() => decodeCapacity(canonicalJson(toJsonValue(parsed)), assistantMessageID)).toThrow(CapacityIntegrityError)
  })
})

function freezeGate19Cut(current: Cut) {
  const base = {
    schemaVersion: current.schemaVersion,
    policyVersion: GATE19_POLICY_VERSION,
    rendererVersion: GATE19_RENDERER_VERSION,
    operation: current.operation,
    cutAsOf: current.cutAsOf,
    throughSharedFrontier: current.throughSharedFrontier,
    retainedSteering: current.retainedSteering,
    capabilityBasis: {
      ...current.capabilityBasis,
      catalogVersion: GATE19_CAPABILITY_CATALOG_VERSION,
    },
    sections: current.sections.filter(
      (section) =>
        section.owner !== "future_attention" &&
        section.owner !== "assignment" &&
        section.owner !== "learner_state_judgment",
    ),
  } as const
  const entryCounts = Object.fromEntries(base.sections.map((section) => [section.owner, section.entries.length]))
  let canonicalBytes = 0
  let renderedBytes = 0
  for (let attempt = 0; attempt < 8; attempt++) {
    const budget = { ...current.budget, canonicalBytes, renderedBytes, entryCounts }
    const fingerprint = canonicalFingerprint(toJsonValue({ ...base, budget }))
    const draft = { ...base, budget, fingerprint, renderedFingerprint: "0".repeat(64) } as unknown as Cut
    const renderedBlock = renderGate19Cut(draft)
    renderedBytes = utf8Bytes(renderedBlock)
    const cut = {
      ...draft,
      budget: { ...budget, renderedBytes },
      renderedFingerprint: sha256(renderedBlock),
    } as unknown as Cut
    const canonicalCut = canonicalJson(toJsonValue(cut))
    const nextCanonicalBytes = utf8Bytes(canonicalCut)
    if (nextCanonicalBytes === canonicalBytes) return { cut, canonicalCut, renderedBlock }
    canonicalBytes = nextCanonicalBytes
  }
  throw new Error("Frozen Gate 19 cut byte accounting did not converge")
}

function renderGate19Cut(cut: Cut) {
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
