import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  CAPABILITY_CATALOG_VERSION,
  CapacityIntegrityError,
  CutIntegrityError,
  GATE19_CAPABILITY_CATALOG_VERSION,
  GATE19_POLICY_VERSION,
  GATE19_RENDERER_VERSION,
  GATE21_RENDERER_VERSION,
  LAZY_READ_CAPABILITY_IDS,
  MAX_CANONICAL_BYTES,
  MAX_ENTRY_BYTES,
  MAX_RENDERED_BYTES,
  POLICY_VERSION,
  RENDERER_VERSION,
  bindProviderToolSurface,
  boundedValue,
  canonicalFingerprint,
  canonicalJson,
  decodeStored,
  decodeCapacity,
  prepareCapacity,
  prepareCut,
  renderCut,
  sha256,
  toJsonValue,
  utf8Bytes,
  type CapabilityBasis,
  type Cut,
  type Section,
} from "@opencode-ai/core/learning-context"
import type { Database } from "@opencode-ai/core/database/database"
import type { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { frozenGate21ACollision } from "./fixture/frozen-gate21a-collision"
import { prepareFrozenV23LearningContextCut } from "./fixture/frozen-v23-learning-context"

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

function expectedRenderer7Sections(sections: readonly Section[]) {
  return sections.map((section) =>
    Object.fromEntries(
      Object.entries(section).flatMap(([name, value]): [string, unknown][] => {
        if (name === "scope" || name === "selectionBasis") return []
        if (
          (name === "assignmentOwnerCut" ||
            name === "learnerStateJudgmentOwnerCut" ||
            name === "advisoryPlanSuggestionOwnerCut") &&
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value)
        ) {
          return [[name, Object.fromEntries(Object.entries(value).filter(([field]) => field !== "fingerprint"))]]
        }
        return [[name, value]]
      }),
    ),
  )
}

function decodeRenderer7Sections(renderedBlock: string) {
  const line = renderedBlock.split("\n").find((item) => item.startsWith("sectionsV7: "))
  if (line === undefined) throw new Error("Missing renderer-7 sections packet")
  const packet: unknown = JSON.parse(line.slice("sectionsV7: ".length))
  if (packet === null || typeof packet !== "object" || Array.isArray(packet)) {
    throw new Error("Malformed renderer-7 sections packet")
  }
  const source = packet as Record<string, unknown>
  if (
    !Array.isArray(source.K) ||
    !source.K.every((item) => typeof item === "string") ||
    !Array.isArray(source.V) ||
    !source.V.every((item) => typeof item === "string") ||
    !Array.isArray(source.S)
  ) {
    throw new Error("Malformed renderer-7 dictionaries")
  }
  const keys = source.K as string[]
  const values = source.V as string[]
  const unpackJson = (value: unknown): unknown => {
    if (!Array.isArray(value) || !Number.isSafeInteger(value[0])) {
      if (value === null || typeof value !== "object") return value
      throw new Error("Malformed renderer-7 JSON value")
    }
    if (value[0] === 2) {
      const exact = values[Number(value[1])]
      if (exact === undefined) throw new Error("Renderer-7 value index is out of range")
      return exact
    }
    if (value[0] === 3 && typeof value[1] === "string") {
      const exact = Buffer.from(value[1], "base64url").toString("hex")
      if (!/^[0-9a-f]{64}$/.test(exact)) throw new Error("Malformed renderer-7 hex value")
      return exact
    }
    if (value[0] === 1) return value.slice(1).map(unpackJson)
    if (value[0] !== 0 || value.length % 2 !== 1) throw new Error("Malformed renderer-7 JSON container")
    const entries: [string, unknown][] = []
    for (let index = 1; index < value.length; index += 2) {
      const encodedKey = value[index]
      const key = typeof encodedKey === "number" ? keys[encodedKey] : encodedKey
      if (typeof key !== "string") throw new Error("Renderer-7 key index is out of range")
      entries.push([key, unpackJson(value[index + 1])])
    }
    return Object.fromEntries(entries)
  }
  return source.S.map((value) => {
    if (!Array.isArray(value) || value.length !== 6) throw new Error("Malformed renderer-7 section row")
    const [owner, coverage, countAtCut, omissionRow, entryRows, metadata] = value
    if (!Array.isArray(omissionRow) || !Array.isArray(entryRows)) {
      throw new Error("Malformed renderer-7 section content")
    }
    const omission =
      omissionRow[0] === "none"
        ? { type: "none" }
        : omissionRow[0] === "unknown"
          ? { type: "unknown", reason: omissionRow[1] }
          : {
              type: "exact",
              omitted: omissionRow[1],
              reasons: Array.isArray(omissionRow[2])
                ? omissionRow[2].map((item) => {
                    if (!Array.isArray(item)) throw new Error("Malformed renderer-7 omission reason")
                    return { reason: item[0], omitted: item[1] }
                  })
                : [],
            }
    const section: Record<string, unknown> = {
      owner,
      coverage,
      countAtCut,
      omission,
      entries: entryRows.map((item) => {
        if (!Array.isArray(item) || item.length !== 3) throw new Error("Malformed renderer-7 entry")
        return {
          kind: item[0],
          locator: unpackJson(item[1]),
          ...(item[2] === null ? {} : { semantic: unpackJson(item[2]) }),
        }
      }),
    }
    if (owner === "assignment" && Array.isArray(metadata)) {
      section.assignmentOwnerCut = {
        frontierSequence: metadata[0],
        frontierTime: metadata[1],
        headCount: metadata[2],
      }
      section.asOf = metadata[3]
      section.mode = metadata[4]
    }
    if (owner === "learner_state_judgment" && Array.isArray(metadata)) {
      if (metadata[0] !== null) {
        section.learnerStateJudgmentOwnerCut = {
          frontierSequence: metadata[0],
          frontierTime: metadata[1],
          headCount: metadata[2],
        }
      }
      if (metadata[3] !== null) section.asOf = metadata[3]
      if (metadata[4] !== null) section.eligibleAnchorCount = metadata[4]
      if (metadata[5] !== null) section.eligibleAnchorsFingerprint = metadata[5]
      if (metadata[6] !== null) section.directoryCursor = metadata[6]
    }
    if (owner === "advisory_plan_suggestion" && Array.isArray(metadata)) {
      if (metadata[0] !== null) {
        section.advisoryPlanSuggestionOwnerCut = {
          frontierSequence: metadata[0],
          frontierTime: metadata[1],
          headCount: metadata[2],
        }
      }
      if (metadata[3] !== null) section.asOf = metadata[3]
      if (metadata[4] !== null) section.eligibleKeyCount = metadata[4]
      if (metadata[5] !== null) section.eligibleKeysFingerprint = metadata[5]
      if (metadata[6] !== null) section.directoryCursor = metadata[6]
    }
    return section
  })
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

  test("keeps exact provider definitions canonical while v7 renders only their compact aggregate", async () => {
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
    expect(prepared.renderedBlock).toContain('"definitions":2')
    expect(prepared.renderedBlock).toContain(providerSurface.binding.combinedFingerprint)
    expect(prepared.renderedBlock).toContain(providerSurface.binding.fingerprint)
    expect(prepared.renderedBlock).not.toContain('"definitions":[')
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
      "advisory_plan_suggestion",
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
    expect({
      schema: prepared.cut.schemaVersion,
      policy: prepared.cut.policyVersion,
      renderer: prepared.cut.rendererVersion,
      catalog: prepared.cut.capabilityBasis.catalogVersion,
    }).toEqual({ schema: 1, policy: POLICY_VERSION, renderer: RENDERER_VERSION, catalog: CAPABILITY_CATALOG_VERSION })
    expect(POLICY_VERSION).toBe(6)
    expect(GATE21_RENDERER_VERSION).toBe(6)
    expect(RENDERER_VERSION).toBe(7)
    expect(prepared.canonicalCut).toContain('"scope":"eligible_courses_and_structurally_referenced_default"')
    expect(prepared.canonicalCut).toContain('"selectionBasis":"automatic_context_capability_withheld"')
    expect(prepared.renderedBlock).not.toContain('"scope":')
    expect(prepared.renderedBlock).not.toContain('"selectionBasis":')
    expect(prepared.renderedBlock).toContain("sectionsV7 codec:")
    expect(decodeRenderer7Sections(prepared.renderedBlock)).toEqual(expectedRenderer7Sections(prepared.cut.sections))
    expect(prepared.renderedBlock).toContain("omission-honest owners compose")
    expect(prepared.renderedBlock).toContain(
      "FutureAttention: contribution withheld by the effective capability basis; identity and count are unknown.",
    )
    expect(prepared.renderedBlock).not.toContain("sole complete concern")
    expect(prepared.renderedBlock).toContain(
      "retained steering controls non-overlapping behavior and yields locally only to a clearly more specific overlapping request",
    )
    expect(prepared.renderedBlock).not.toContain("one scaffold question means one learner-response prompt")
    expect(prepared.renderedBlock).toContain("natural correction revises the current head")
    expect(prepared.renderedBlock).toContain("near term may be concrete, distant provisional")
    expect(prepared.renderedBlock).toContain(
      "Never expose internal IDs/lifecycle labels/Context/precedence/control machinery",
    )
    expect(prepared.cut.budget.canonicalBytes).toBe(utf8Bytes(prepared.canonicalCut))
    expect(prepared.cut.budget.renderedBytes).toBe(utf8Bytes(prepared.renderedBlock))
    expect(prepared.cut.budget.canonicalBytes).toBeLessThanOrEqual(MAX_CANONICAL_BYTES)
    expect(prepared.cut.budget.renderedBytes).toBeLessThanOrEqual(MAX_RENDERED_BYTES)
    expect(decodeStored(prepared.canonicalCut, prepared.renderedBlock, assistantMessageID)).toEqual(prepared.cut)
  })

  test("replays the frozen fully populated Gate 21A collision with one lossless renderer-7 projection", () => {
    const cut = decodeStored(
      frozenGate21ACollision.canonicalCut,
      frozenGate21ACollision.renderedBlock,
      SessionV1.MessageID.make(frozenGate21ACollision.assistantMessageID),
    )
    const sections = Object.fromEntries(cut.sections.map((section) => [section.owner, section]))

    expect(frozenGate21ACollision.provenance).toMatchObject({
      phase: "collision",
      providerRequestCount: 1,
      terminal: { outcome: "failed", reason: "provider_failure" },
    })
    expect(cut).toMatchObject({
      schemaVersion: 1,
      policyVersion: 6,
      rendererVersion: 7,
      fingerprint: frozenGate21ACollision.cutFingerprint,
      renderedFingerprint: frozenGate21ACollision.renderedFingerprint,
      budget: {
        canonicalBytes: frozenGate21ACollision.canonicalBytes,
        renderedBytes: frozenGate21ACollision.renderedBytes,
      },
      capabilityBasis: {
        catalogVersion: 6,
        effectiveAutomaticContext: true,
        effectiveLazyReadCapabilities: [...LAZY_READ_CAPABILITY_IDS],
      },
    })
    expect(utf8Bytes(frozenGate21ACollision.canonicalCut)).toBe(frozenGate21ACollision.canonicalBytes)
    expect(utf8Bytes(frozenGate21ACollision.renderedBlock)).toBe(frozenGate21ACollision.renderedBytes)
    expect(frozenGate21ACollision.canonicalBytes).toBeLessThanOrEqual(MAX_CANONICAL_BYTES)
    expect(frozenGate21ACollision.renderedBytes).toBeLessThanOrEqual(MAX_RENDERED_BYTES)
    expect(canonicalJson(toJsonValue(cut))).toBe(frozenGate21ACollision.canonicalCut)
    expect(renderCut(cut)).toBe(frozenGate21ACollision.renderedBlock)
    expect(decodeRenderer7Sections(frozenGate21ACollision.renderedBlock)).toEqual(
      expectedRenderer7Sections(cut.sections),
    )

    expect(cut.sections.map((section) => section.owner)).toEqual([
      "course",
      "learner_navigation",
      "learner_goal",
      "material",
      "interaction",
      "learner_response_evidence",
      "future_attention",
      "assignment",
      "learner_state_judgment",
      "advisory_plan_suggestion",
    ])
    for (const owner of [
      "course",
      "learner_navigation",
      "learner_goal",
      "material",
      "learner_response_evidence",
      "future_attention",
      "assignment",
      "learner_state_judgment",
    ] as const) {
      expect(sections[owner]).toMatchObject({ countAtCut: 1, entries: [{ kind: expect.any(String) }] })
    }
    expect(sections.interaction).toMatchObject({
      coverage: "truncated",
      countAtCut: 9,
      omission: { type: "exact", omitted: 5, reasons: [{ reason: "candidate_limit", omitted: 5 }] },
    })
    expect(sections.interaction?.entries).toHaveLength(4)
    expect(sections.future_attention).toMatchObject({ coverage: "complete", omission: { type: "none" } })
    expect(sections.assignment).toMatchObject({
      coverage: "complete",
      mode: "sole_candidate_pressure",
      omission: { type: "none" },
    })
    expect(sections.learner_state_judgment).toMatchObject({
      coverage: "complete",
      directoryCursor: expect.any(String),
    })
    expect(sections.advisory_plan_suggestion).toMatchObject({
      coverage: "truncated",
      countAtCut: 8,
      entries: [{ kind: "advisory_plan_suggestion", semantic: { state: "value" } }],
      omission: {
        type: "exact",
        omitted: 7,
        reasons: [{ reason: "gate18_byte_budget", omitted: 7 }],
      },
      directoryCursor: expect.any(String),
    })
    expect(frozenGate21ACollision.renderedBlock).toContain(
      "FutureAttention: conditional default. An exact current learner request may override an overlapping present action; otherwise realize the sole complete concern naturally. Override alone neither serves nor mutates it.",
    )
    expect(frozenGate21ACollision.renderedBlock).toContain(
      "Never expose internal IDs/lifecycle labels/Context/precedence/control machinery or make the learner manage owner state.",
    )
  })

  test("keeps the frozen Gate 21 renderer-6 cut byte-exact while current preparation uses renderer 7", async () => {
    const frozen = prepareFrozenV23LearningContextCut(6, {
      sessionID,
      turnID,
      inputID,
      occurrenceID: "occ_gate18_context",
      assistantMessageID,
      ordinal: 0,
      cutAsOf: 10,
      throughSharedFrontier: { sequence: 3, time: 9 },
      retainedSteeringFingerprint: "a".repeat(64),
    })
    const cut = frozen.cut as unknown as Cut

    expect(decodeStored(frozen.canonicalCut, frozen.renderedBlock, assistantMessageID)).toEqual(cut)
    expect(renderCut(cut)).toBe(frozen.renderedBlock)
    expect(sha256(frozen.canonicalCut)).toBe("154b718b3197671e2db88d8c145c9fd07f9d7fe8924f804e463450c5877c984e")
    expect(sha256(frozen.renderedBlock)).toBe("2930fee0b428c41b246aae981e70e634e4728ba9d430b1c11dee0f497c052d58")

    const current = await Effect.runPromise(
      prepareCut({} as Transaction, {
        operation: { sessionID, turnID, inputID, assistantMessageID, ordinal: 0 },
        retainedSteering: retainedSteering(),
        capabilityBasis: basis(),
      }),
    )
    expect(current.cut.rendererVersion).toBe(RENDERER_VERSION)
    expect(current.cut.policyVersion).toBe(POLICY_VERSION)
  })

  test("rejects unknown or mixed current policy-renderer tuples before replay routing", async () => {
    const prepared = await Effect.runPromise(
      prepareCut({} as Transaction, {
        operation: { sessionID, turnID, inputID, assistantMessageID, ordinal: 0 },
        retainedSteering: retainedSteering(),
        capabilityBasis: basis(),
      }),
    )

    for (const [policyVersion, rendererVersion] of [
      [6, 8],
      [5, 7],
      [7, 7],
    ] as const) {
      const cut = { ...JSON.parse(prepared.canonicalCut), policyVersion, rendererVersion }
      try {
        decodeStored(canonicalJson(toJsonValue(cut)), prepared.renderedBlock, assistantMessageID)
        throw new Error(`Unexpectedly accepted policy/renderer tuple ${policyVersion}/${rendererVersion}`)
      } catch (error) {
        expect(error).toBeInstanceOf(CutIntegrityError)
        if (error instanceof CutIntegrityError) expect(error.reason).toBe("malformed_cut")
      }
    }
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
        section.owner !== "learner_state_judgment" &&
        section.owner !== "advisory_plan_suggestion",
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
