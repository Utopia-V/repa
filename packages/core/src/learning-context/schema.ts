import type { Turn } from "@opencode-ai/schema/turn"
import type { LearningFrontier } from "../learning-frontier"
import type { SessionSchema } from "../session/schema"
import type { MessageID } from "../v1/session"

export const SCHEMA_VERSION = 1 as const
export const LEGACY_POLICY_VERSION = 1 as const
export const POLICY_VERSION = 2 as const
export const LEGACY_RENDERER_VERSION = 1 as const
export const RENDERER_VERSION = 2 as const
export const LEGACY_CAPABILITY_CATALOG_VERSION = 1 as const
export const CAPABILITY_CATALOG_VERSION = 2 as const

export const MAX_CANONICAL_BYTES = 32_768
export const MAX_RENDERED_BYTES = 16_384
export const MAX_ENTRY_BYTES = 2_048
export const MAX_CANDIDATES_PER_FAMILY = 8
export const MAX_INTERACTION_CANDIDATES = 4
export const MAX_LAZY_BYTES = 32_768
export const MAX_LAZY_ITEMS = 64

export const AUTOMATIC_CONTEXT_CAPABILITY_ID = "learning_context" as const
export const LEGACY_LAZY_READ_CAPABILITY_IDS = [
  "course_query",
  "learning_navigation_query",
  "learner_goal_query",
  "learning_material_query",
  "learning_material_read",
  "learning_interaction_read",
] as const
export const LAZY_READ_CAPABILITY_IDS = [
  ...LEGACY_LAZY_READ_CAPABILITY_IDS,
  "learner_response_evidence_read",
] as const

export type LazyReadCapabilityID = (typeof LAZY_READ_CAPABILITY_IDS)[number]

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type ProviderToolChoiceBinding = Readonly<{
  value: JsonValue
  canonicalBytes: number
  fingerprint: string
}>

export type ProviderToolDefinitionBinding = Readonly<{
  id: string
  canonicalBytes: number
  fingerprint: string
}>

export type ProviderCompilerAuth =
  | "api_key"
  | "bedrock_bearer"
  | "vertex_api_key"
  | "vertex_anthropic_token"
  | "gateway_api_key"

export type ProviderBodyCredential = "gateway_call_options" | "openai_hosted_mcp"

export type ProviderCompilerIdentity = Readonly<{
  sourcePackage: string
  sourceVersion: string
  projector: string
  projectorVersion: number
  promptFields: readonly string[]
  publicQuery: readonly string[]
  credentialQuery: readonly string[]
  bodyCredentials: readonly ProviderBodyCredential[]
  compilerAuth: ProviderCompilerAuth
  terminalRoutes: readonly string[]
}>

export type ProviderTransportIdentity = Readonly<{
  method: string
  endpoint: Readonly<{
    protocol: string
    host: string
    pathname: string
    query: readonly (
      | Readonly<{ key: string; state: "value"; value: string }>
      | Readonly<{ key: string; state: "credential" }>
    )[]
  }>
}>

export type ProviderRouteIdentity =
  | Readonly<{
      runtime: "ai_sdk"
      provider: string
      model: string
      protocol: "language-model-v3"
      compiler: ProviderCompilerIdentity
      transport: ProviderTransportIdentity
    }>
  | Readonly<{
      runtime: "native"
      provider: string
      model: string
      route: string
      protocol: string
      compiler: ProviderCompilerIdentity
      transport: ProviderTransportIdentity
    }>

export type ProviderToolSurfaceBinding = Readonly<{
  route: ProviderRouteIdentity
  toolChoice: ProviderToolChoiceBinding
  definitions: readonly ProviderToolDefinitionBinding[]
  definitionCount: number
  combinedFingerprint: string
  combinedCanonicalBytes: number
  fingerprint: string
}>

export type CapabilityBasis = Readonly<{
  catalogVersion: number
  policyFingerprint: string
  effectiveAutomaticContext: boolean
  effectiveLazyReadCapabilities: readonly LazyReadCapabilityID[]
  effectiveProviderToolSurfaceBinding: ProviderToolSurfaceBinding
}>

export type Coverage =
  | "complete"
  | "truncated"
  | "locator_only"
  | "empty"
  | "unavailable"
  | "not_authorized"
  | "not_applicable"

export type Omission =
  | Readonly<{ type: "none" }>
  | Readonly<{
      type: "exact"
      omitted: number
      reasons: readonly Readonly<{
        reason: "candidate_limit" | "gate18_byte_budget"
        omitted: number
      }>[]
    }>
  | Readonly<{ type: "unknown"; reason: string }>

export type BoundedValue =
  | Readonly<{ state: "value"; value: JsonValue }>
  | Readonly<{
      state: "locator_only"
      canonicalBytes: number
      fingerprint: string
      reason: "entry_allowance" | "gate18_byte_budget"
    }>

export type Entry = Readonly<{
  kind:
    | "course"
    | "navigation_default"
    | "navigation_anchor"
    | "goal"
    | "material"
    | "interaction"
    | "learner_response_evidence"
  locator: Readonly<Record<string, JsonValue>>
  semantic?: BoundedValue
}>

export type Section = Readonly<{
  owner:
    | "course"
    | "learner_navigation"
    | "learner_goal"
    | "material"
    | "interaction"
    | "learner_response_evidence"
  scope: string
  selectionBasis: string
  coverage: Coverage
  countAtCut: number | "unknown"
  omission: Omission
  entries: readonly Entry[]
}>

export type HardLimits = Readonly<{
  canonicalBytes: typeof MAX_CANONICAL_BYTES
  renderedBytes: typeof MAX_RENDERED_BYTES
  entryBytes: typeof MAX_ENTRY_BYTES
  candidatesPerFamily: typeof MAX_CANDIDATES_PER_FAMILY
  interactionCandidates: typeof MAX_INTERACTION_CANDIDATES
  lazyBytes: typeof MAX_LAZY_BYTES
  lazyItems: typeof MAX_LAZY_ITEMS
}>

export type Budget = Readonly<{
  canonicalBytes: number
  renderedBytes: number
  entryCounts: Readonly<Record<Section["owner"], number>>
  hardLimits: HardLimits
}>

export type Operation = Readonly<{
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  inputID: Turn.InputID
  causalOccurrenceID?: string
  assistantMessageID: MessageID
  ordinal: number
}>

export type Cut = Readonly<{
  schemaVersion: typeof SCHEMA_VERSION
  policyVersion: typeof LEGACY_POLICY_VERSION | typeof POLICY_VERSION
  rendererVersion: typeof LEGACY_RENDERER_VERSION | typeof RENDERER_VERSION
  operation: Operation
  cutAsOf: number
  throughSharedFrontier: LearningFrontier.Snapshot
  retainedSteering: Readonly<{
    assistantMessageID: MessageID
    cutAsOf: number
    fingerprint: string
  }>
  capabilityBasis: CapabilityBasis
  sections: readonly Section[]
  budget: Budget
  fingerprint: string
  renderedFingerprint: string
}>

export type CutRead =
  | Readonly<{ type: "available"; cut: Cut; renderedBlock: string }>
  | Readonly<{ type: "source_unavailable"; assistantMessageID: MessageID; turnID: Turn.ID }>
  | Readonly<{ type: "not_found"; assistantMessageID: MessageID }>

export type CapacityClassification = "capacity_known" | "capacity_unknown" | "capacity_invalid"
export type CapacityDecision = "fit" | "uncertain" | "history_overflow" | "fixed_overflow" | "invalid_limits"

export type CapacityRemovableHistory = Readonly<{
  tailStartMessageID: MessageID
  messageCount: number
  messageIDsFingerprint: string
}>

export type CapacityAssessment = Readonly<{
  schemaVersion: typeof SCHEMA_VERSION
  assistantMessageID: MessageID
  envelopeFingerprint: string
  retainedSteeringFingerprint: string
  learningContextFingerprint: string
  learningContextRenderedFingerprint: string
  providerToolSurfaceFingerprint: string
  providerToolSurfaceCanonicalBytes: number
  method: "canonical_utf8_bytes_as_conservative_token_upper_bound"
  classification: CapacityClassification
  decision: CapacityDecision
  fixedEstimatedTokens: number
  removableEstimatedTokens: number
  removableHistory: CapacityRemovableHistory | null
  totalEstimatedTokens: number
  contextLimitTokens: number | null
  inputLimitTokens: number | null
  outputReserveTokens: number | null
  usableInputLimitTokens: number | null
  reason: string | null
  fingerprint: string
}>

export type CapacityRead =
  | Readonly<{ type: "available"; assessment: CapacityAssessment; canonicalAssessment: string }>
  | Readonly<{ type: "not_found"; assistantMessageID: MessageID }>

export class CutIntegrityError extends Error {
  readonly assistantMessageID: string
  readonly reason: string

  constructor(input: { assistantMessageID: string; reason: string }) {
    super(`Learning-context cut ${input.assistantMessageID} is invalid: ${input.reason}`)
    this.name = "LearningContext.CutIntegrityError"
    this.assistantMessageID = input.assistantMessageID
    this.reason = input.reason
  }
}

export class CutCapacityError extends Error {
  readonly assistantMessageID: string
  readonly boundary: "canonical" | "rendered" | "mandatory"
  readonly observedBytes: number
  readonly ceilingBytes: number

  constructor(input: {
    assistantMessageID: string
    boundary: "canonical" | "rendered" | "mandatory"
    observedBytes: number
    ceilingBytes: number
  }) {
    super(
      `Learning-context ${input.boundary} bytes exceed the Gate 18 ceiling (${input.observedBytes}/${input.ceilingBytes})`,
    )
    this.name = "LearningContext.CutCapacityError"
    this.assistantMessageID = input.assistantMessageID
    this.boundary = input.boundary
    this.observedBytes = input.observedBytes
    this.ceilingBytes = input.ceilingBytes
  }
}

export class CapacityIntegrityError extends Error {
  readonly assistantMessageID: string
  readonly reason: string

  constructor(input: { assistantMessageID: string; reason: string }) {
    super(`Model capacity evidence ${input.assistantMessageID} is invalid: ${input.reason}`)
    this.name = "LearningContext.CapacityIntegrityError"
    this.assistantMessageID = input.assistantMessageID
    this.reason = input.reason
  }
}

export class CapacityConflictError extends Error {
  readonly assistantMessageID: string

  constructor(assistantMessageID: string) {
    super(`Model capacity evidence conflicts for ${assistantMessageID}`)
    this.name = "LearningContext.CapacityConflictError"
    this.assistantMessageID = assistantMessageID
  }
}

export const hardLimits: HardLimits = Object.freeze({
  canonicalBytes: MAX_CANONICAL_BYTES,
  renderedBytes: MAX_RENDERED_BYTES,
  entryBytes: MAX_ENTRY_BYTES,
  candidatesPerFamily: MAX_CANDIDATES_PER_FAMILY,
  interactionCandidates: MAX_INTERACTION_CANDIDATES,
  lazyBytes: MAX_LAZY_BYTES,
  lazyItems: MAX_LAZY_ITEMS,
})

export function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

export function sha256(value: string | Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

export function canonicalJson(value: JsonValue) {
  return JSON.stringify(canonicalValue(value))
}

export function canonicalFingerprint(value: JsonValue) {
  return sha256(canonicalJson(value))
}

export function toJsonValue(value: unknown): JsonValue {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error("Value is not representable as JSON")
  return canonicalValue(JSON.parse(encoded) as JsonValue)
}

export function boundedValue(value: JsonValue): BoundedValue {
  const canonical = canonicalJson(value)
  const canonicalBytes = utf8Bytes(canonical)
  return canonicalBytes <= MAX_ENTRY_BYTES
    ? { state: "value", value: canonicalValue(value) }
    : {
        state: "locator_only",
        canonicalBytes,
        fingerprint: sha256(canonical),
        reason: "entry_allowance",
      }
}

export function bindProviderToolSurface(input: {
  readonly route: ProviderRouteIdentity
  readonly toolChoice: unknown
  readonly definitions: readonly Readonly<{ id: string; value: unknown }>[]
  /**
   * Exact provider-route-visible tool projection when the route lowers the
   * generic definitions into a different wire shape. The route identity is
   * still bound outside this value. When omitted, the canonical composed
   * definition/tool-choice surface is used.
   */
  readonly surface?: unknown
}) {
  if (new Set(input.definitions.map((definition) => definition.id)).size !== input.definitions.length) {
    throw new Error("Provider-visible tool definition IDs must be unique")
  }
  const route = toJsonValue(input.route) as unknown as ProviderRouteIdentity
  const toolChoice = toJsonValue(input.toolChoice)
  const definitions = input.definitions.map((definition) => {
    if (definition.id.length === 0) throw new Error("Provider-visible tool definition IDs must not be empty")
    return { id: definition.id, value: toJsonValue(definition.value) }
  })
  const canonicalToolChoice = canonicalJson(toolChoice)
  const canonicalDefinitions = definitions.map((definition) => canonicalJson(definition.value))
  const surface =
    input.surface === undefined
      ? toJsonValue({ route, toolChoice, definitions })
      : toJsonValue({ route, providerVisible: toJsonValue(input.surface) })
  const canonicalSurface = canonicalJson(surface)
  const compactBinding = {
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
  return {
    route,
    toolChoice,
    definitions,
    surface,
    canonicalSurface,
    binding: {
      ...compactBinding,
      fingerprint: canonicalFingerprint(toJsonValue(compactBinding)),
    } satisfies ProviderToolSurfaceBinding,
  }
}

export function canonicalValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("Canonical JSON cannot contain non-finite numbers")
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalValue(item)]),
  )
}
