import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { MockLanguageModelV3 } from "ai/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runTutorTurn } from "../../src/runtime/run-tutor-turn"
import { prepareScenario } from "./harness"
import {
  pilotOrder,
  POLICY_PROFILE_REVISION,
  scenarioById,
  scenarioIds,
  type ScenarioId,
} from "./protocol"

const FIXTURE_SCHEMA_REVISION = "als-021-provider-replay-v1"
const DEFAULT_FIXTURE_URL = new URL(
  "./fixtures/pilot-5171a2474590-provider-replay.json",
  import.meta.url,
)
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const MAX_MODEL_STEPS = 6
const MAX_OUTPUT_TOKENS = 1_200
const MAX_RETRIES = 0
const TIME_ZONE = "Asia/Shanghai"
const RECORDED_TRANSPORT_PATHS = [
  "bun.lock",
  "package.json",
  "src/providers/deepseek.ts",
] as const
const BYTE_EXACT_RUNTIME_TRANSPORT_PATHS = [
  "bun.lock",
  "src/providers/deepseek.ts",
] as const

type SerializableValue =
  | null
  | boolean
  | number
  | string
  | SerializableValue[]
  | { [key: string]: SerializableValue }

export type ProviderReplayFixture = {
  schemaRevision: typeof FIXTURE_SCHEMA_REVISION
  provenance: {
    campaignDirectoryName: string
    sourceFingerprint: string
    protocolRevision: string
    recordedPolicyProfileRevision: string
    waiverTargetPolicyProfileRevision: string
    bunVersion: string
    runtimePlatform: string
    criticalTransportSha256: Record<string, string>
    modelConfiguration: Record<string, SerializableValue>
  }
  traces: Array<{
    position: number
    scenarioId: ScenarioId
    opaqueSampleId: string
    setup: "course_only" | "controlled_prior_transcript" | "eligible_agenda"
    learnerText: string
    agendaReason: string | null
    selectedAttemptNumber: number
    selectedResultFile: string
    selectedResultSha256: string
    sourceRecordedAt: string
    requests: SerializableValue[]
    replayStreamParts: SerializableValue[][]
  }>
}

export type ProviderTraceComparison = {
  equivalent: boolean
  expectedGeneratedIdentities: GeneratedIdentityCounts
  actualGeneratedIdentities: GeneratedIdentityCounts
  expectedSha256: string
  actualSha256: string
  difference?: {
    path: string
    expected: unknown
    actual: unknown
  }
}

export type ProviderEquivalenceReport = {
  equivalent: boolean
  baselineSourceFingerprint: string
  currentPolicyProfileRevision: string
  casesCompared: number
  requestsCompared: number
  failures: string[]
}

type GeneratedIdentityCounts = {
  agendaConcern: number
  agendaEffect: number
}

const GENERATED_AGENDA_ID =
  /effect:agenda:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|agenda:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g

/**
 * Compare complete request traces, preserving array and object-key order.
 *
 * The only tolerated difference is the value of production-generated Agenda
 * UUIDs. They are alpha-renamed once per whole trace, by identity kind and
 * first occurrence, so splitting or merging an identity still fails.
 */
export function compareProviderVisibleRequestTraces(
  expected: readonly unknown[],
  actual: readonly unknown[],
): ProviderTraceComparison {
  const expectedNormalized = normalizeGeneratedAgendaIdentities(jsonSnapshot(expected))
  const actualNormalized = normalizeGeneratedAgendaIdentities(jsonSnapshot(actual))
  const expectedJson = JSON.stringify(expectedNormalized.value)
  const actualJson = JSON.stringify(actualNormalized.value)
  const equivalent = expectedJson === actualJson
  const difference = equivalent
    ? undefined
    : firstDifference(expectedNormalized.value, actualNormalized.value)

  return {
    equivalent,
    expectedGeneratedIdentities: expectedNormalized.counts,
    actualGeneratedIdentities: actualNormalized.counts,
    expectedSha256: hashText(expectedJson),
    actualSha256: hashText(actualJson),
    ...(difference === undefined ? {} : { difference }),
  }
}

/** Read and validate the checked-in, provider-independent replay oracle. */
export async function readProviderReplayFixture(
  fixtureUrl: URL = DEFAULT_FIXTURE_URL,
): Promise<ProviderReplayFixture> {
  if (!(await Bun.file(fixtureUrl).exists())) {
    throw new Error(`Provider replay fixture is missing: ${fileURLToPath(fixtureUrl)}`)
  }
  const value = await Bun.file(fixtureUrl).json()
  return validateReplayFixture(value)
}

/**
 * Replay the selected second-pilot model streams through the current Tutor
 * loop. This uses a local mock model and performs no provider or network call.
 */
export async function verifyRecordedPilotProviderInputEquivalence(
  fixtureUrl: URL = DEFAULT_FIXTURE_URL,
): Promise<ProviderEquivalenceReport> {
  const fixture = await readProviderReplayFixture(fixtureUrl)
  const failures: string[] = []
  const temporaryRoots: string[] = []
  let requestsCompared = 0

  if (fixture.provenance.waiverTargetPolicyProfileRevision !== POLICY_PROFILE_REVISION) {
    failures.push(
      `policy profile revision changed: expected ` +
        `${fixture.provenance.waiverTargetPolicyProfileRevision}, got ${POLICY_PROFILE_REVISION}`,
    )
  }
  if (fixture.provenance.bunVersion !== Bun.version) {
    failures.push(
      `Bun version changed: expected ${fixture.provenance.bunVersion}, got ${Bun.version}`,
    )
  }
  const runtimePlatform = `${process.platform}-${process.arch}`
  if (fixture.provenance.runtimePlatform !== runtimePlatform) {
    failures.push(
      `runtime platform changed: expected ${fixture.provenance.runtimePlatform}, ` +
        `got ${runtimePlatform}`,
    )
  }
  // package.json remains recorded provenance, but scripts and test isolation
  // are not provider transport. The exact lockfile, adapter source, model
  // configuration, and every provider-visible request remain hard gates.
  for (const path of BYTE_EXACT_RUNTIME_TRANSPORT_PATHS) {
    const expected = fixture.provenance.criticalTransportSha256[path]
    const actual = await hashFile(resolve(REPOSITORY_ROOT, path))
    if (expected !== actual) {
      failures.push(`provider transport source changed: ${path}`)
    }
  }
  verifyModelConfiguration(fixture, failures)

  try {
    for (const trace of fixture.traces) {
      const scenario = scenarioById(trace.scenarioId)
      if (
        scenario.setup !== trace.setup ||
        scenario.learnerText !== trace.learnerText ||
        (scenario.agendaReason ?? null) !== trace.agendaReason
      ) {
        failures.push(`${trace.scenarioId}: model-visible scenario setup changed`)
        continue
      }

      const temporaryRoot = mkdtempSync(join(tmpdir(), "repa-als021-provider-replay-"))
      temporaryRoots.push(temporaryRoot)
      let prepared: Awaited<ReturnType<typeof prepareScenario>> | undefined
      let replayedCalls = 0
      let model: MockLanguageModelV3 | undefined
      try {
        prepared = await prepareScenario({
          scenario,
          workspaceRoot: join(temporaryRoot, "workspace"),
          opaqueSampleId: trace.opaqueSampleId,
        })
        model = new MockLanguageModelV3({
          provider: "deepseek.chat",
          modelId: "deepseek-v4-flash",
          doStream: async () => {
            const streamParts = trace.replayStreamParts[replayedCalls]
            replayedCalls += 1
            if (!streamParts) {
              throw new Error(`replay emitted an unexpected provider call ${replayedCalls}`)
            }
            return { stream: replayModelStream(streamParts) }
          },
        })
        await runTutorTurn({
          database: prepared.database,
          model,
          workspaceRoot: prepared.workspaceRoot,
          learnerText: scenario.learnerText,
          identity: prepared.identity,
          timeZone: TIME_ZONE,
          policyProfileRevision: POLICY_PROFILE_REVISION,
          clock: prepared.clock,
          maxModelSteps: MAX_MODEL_STEPS,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          maxRetries: MAX_RETRIES,
        })

        if (replayedCalls !== trace.replayStreamParts.length) {
          failures.push(
            `${trace.scenarioId}: consumed ${replayedCalls} of ` +
              `${trace.replayStreamParts.length} recorded model streams`,
          )
        }
        const actualRequests = model.doStreamCalls.map((request) => jsonSnapshot(request))
        requestsCompared += Math.min(trace.requests.length, actualRequests.length)
        const comparison = compareProviderVisibleRequestTraces(
          trace.requests,
          actualRequests,
        )
        if (!comparison.equivalent) {
          const difference = comparison.difference
          failures.push(
            `${trace.scenarioId}: provider-visible request changed` +
              (difference
                ? ` at ${difference.path}: expected ${summarize(difference.expected)}, ` +
                  `got ${summarize(difference.actual)}`
                : ""),
          )
        }
      } catch (error) {
        failures.push(`${trace.scenarioId}: replay failed: ${errorMessage(error)}`)
      } finally {
        try {
          prepared?.database.close()
        } catch (error) {
          failures.push(`${trace.scenarioId}: database cleanup failed: ${errorMessage(error)}`)
        }
      }
    }
  } finally {
    Bun.gc(true)
    await Bun.sleep(80)
    for (const temporaryRoot of temporaryRoots) {
      try {
        rmSync(temporaryRoot, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 40,
        })
      } catch (error) {
        failures.push(`temporary replay cleanup failed: ${errorMessage(error)}`)
      }
    }
  }

  return {
    equivalent: failures.length === 0,
    baselineSourceFingerprint: fixture.provenance.sourceFingerprint,
    currentPolicyProfileRevision: POLICY_PROFILE_REVISION,
    casesCompared: fixture.traces.length,
    requestsCompared,
    failures,
  }
}

function normalizeGeneratedAgendaIdentities(value: SerializableValue) {
  const identities = new Map<string, string>()
  const counts: GeneratedIdentityCounts = { agendaConcern: 0, agendaEffect: 0 }
  const visit = (current: SerializableValue): SerializableValue => {
    if (typeof current === "string") {
      return current.replace(GENERATED_AGENDA_ID, (identity) => {
        const existing = identities.get(identity)
        if (existing) return existing
        const kind = identity.startsWith("effect:agenda:")
          ? "agendaEffect"
          : "agendaConcern"
        counts[kind] += 1
        const replacement =
          kind === "agendaEffect"
            ? `<GENERATED_AGENDA_EFFECT_${counts[kind]}>`
            : `<GENERATED_AGENDA_CONCERN_${counts[kind]}>`
        identities.set(identity, replacement)
        return replacement
      })
    }
    if (Array.isArray(current)) return current.map(visit)
    if (current !== null && typeof current === "object") {
      return Object.fromEntries(
        Object.entries(current).map(([key, entry]) => [key, visit(entry)]),
      )
    }
    return current
  }
  return { value: visit(value), counts }
}

function firstDifference(
  expected: SerializableValue,
  actual: SerializableValue,
  path = "$",
): { path: string; expected: unknown; actual: unknown } {
  if (Object.is(expected, actual)) return { path, expected, actual }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return { path: `${path}.length`, expected: expected.length, actual: actual.length }
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (JSON.stringify(expected[index]) !== JSON.stringify(actual[index])) {
        return firstDifference(expected[index]!, actual[index]!, `${path}[${index}]`)
      }
    }
  }
  if (isRecord(expected) && isRecord(actual)) {
    const expectedKeys = Object.keys(expected)
    const actualKeys = Object.keys(actual)
    if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
      return { path: `${path}.[[keys]]`, expected: expectedKeys, actual: actualKeys }
    }
    for (const key of expectedKeys) {
      if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
        return firstDifference(expected[key]!, actual[key]!, `${path}.${key}`)
      }
    }
  }
  return { path, expected, actual }
}

function validateReplayFixture(value: unknown): ProviderReplayFixture {
  const fixture = requireRecord(value, "provider replay fixture")
  if (fixture.schemaRevision !== FIXTURE_SCHEMA_REVISION) {
    throw new Error(`Unsupported provider replay fixture revision: ${fixture.schemaRevision}`)
  }
  const provenance = requireRecord(fixture.provenance, "fixture.provenance")
  requireString(provenance.sourceFingerprint, "fixture source fingerprint")
  requireString(provenance.protocolRevision, "fixture protocol revision")
  requireString(provenance.recordedPolicyProfileRevision, "recorded policy revision")
  requireString(provenance.waiverTargetPolicyProfileRevision, "target policy revision")
  requireString(provenance.bunVersion, "fixture Bun version")
  requireString(provenance.runtimePlatform, "fixture runtime platform")
  const criticalHashes = requireRecord(
    provenance.criticalTransportSha256,
    "critical transport hashes",
  )
  for (const path of RECORDED_TRANSPORT_PATHS) {
    const hash = requireString(criticalHashes[path], `critical hash ${path}`)
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`Invalid SHA-256 for ${path}`)
  }
  requireRecord(provenance.modelConfiguration, "fixture model configuration")
  const traces = requireArray(fixture.traces, "fixture.traces")
  if (traces.length !== pilotOrder.length) {
    throw new Error(`Provider replay fixture must contain ${pilotOrder.length} traces`)
  }
  let requestCount = 0
  for (const [index, value] of traces.entries()) {
    const trace = requireRecord(value, `fixture.traces[${index}]`)
    if (requireSafeInteger(trace.position, "trace position") !== index + 1) {
      throw new Error(`Provider replay trace position is not contiguous at ${index + 1}`)
    }
    const scenarioId = requireScenarioId(trace.scenarioId)
    if (scenarioId !== pilotOrder[index]) {
      throw new Error(`Provider replay order differs at position ${index + 1}`)
    }
    requireString(trace.opaqueSampleId, `${scenarioId}.opaqueSampleId`)
    requireSetup(trace.setup)
    requireString(trace.learnerText, `${scenarioId}.learnerText`)
    if (trace.agendaReason !== null) {
      requireString(trace.agendaReason, `${scenarioId}.agendaReason`)
    }
    requireSafeInteger(trace.selectedAttemptNumber, `${scenarioId}.attemptNumber`)
    requireString(trace.selectedResultFile, `${scenarioId}.selectedResultFile`)
    const resultHash = requireString(
      trace.selectedResultSha256,
      `${scenarioId}.selectedResultSha256`,
    )
    if (!/^[0-9a-f]{64}$/.test(resultHash)) {
      throw new Error(`Invalid selected result SHA-256 for ${scenarioId}`)
    }
    requireString(trace.sourceRecordedAt, `${scenarioId}.sourceRecordedAt`)
    const requests = requireArray(trace.requests, `${scenarioId}.requests`)
    const streams = requireArray(trace.replayStreamParts, `${scenarioId}.streams`)
    if (requests.length === 0 || requests.length !== streams.length) {
      throw new Error(`${scenarioId} has inconsistent replay call counts`)
    }
    for (const stream of streams) requireArray(stream, `${scenarioId}.stream`)
    requestCount += requests.length
  }
  if (requestCount !== 29) {
    throw new Error(`Provider replay fixture must contain 29 requests, found ${requestCount}`)
  }
  assertNoSecrets(fixture)
  return fixture as ProviderReplayFixture
}

function verifyModelConfiguration(fixture: ProviderReplayFixture, failures: string[]) {
  const expected: Record<string, SerializableValue> = {
    requestedModel: "deepseek-v4-flash",
    provider: "deepseek",
    thinking: "disabled",
    temperature: "provider_default",
    providerSeed: null,
    maxModelSteps: MAX_MODEL_STEPS,
    maxOutputTokensPerStep: MAX_OUTPUT_TOKENS,
    maxRetries: MAX_RETRIES,
    timeoutMs: 90_000,
  }
  if (JSON.stringify(fixture.provenance.modelConfiguration) !== JSON.stringify(expected)) {
    failures.push("recorded provider model configuration is not the frozen ALS-021 condition")
  }
}

function replayModelStream(parts: SerializableValue[]) {
  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const value of parts) {
        const part = structuredClone(value) as Record<string, unknown>
        if (part.type === "response-metadata" && typeof part.timestamp === "string") {
          part.timestamp = new Date(part.timestamp)
        }
        controller.enqueue(part as LanguageModelV3StreamPart)
      }
      controller.close()
    },
  })
}

function assertNoSecrets(value: unknown) {
  const serialized = JSON.stringify(value)
  const forbidden =
    /authorization|api[_-]?key|providerRequest|providerResponse|cookie|\[REDACTED\]/i
  if (forbidden.test(serialized)) {
    throw new Error("Provider replay fixture contains a forbidden secret-bearing field")
  }
}

function jsonSnapshot(value: unknown): SerializableValue {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error("Provider replay value is not serializable")
  return JSON.parse(serialized) as SerializableValue
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function requireSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return value as number
}

function requireScenarioId(value: unknown): ScenarioId {
  const id = requireString(value, "scenarioId")
  if (!(scenarioIds as readonly string[]).includes(id)) {
    throw new Error(`Unknown provider replay scenario: ${id}`)
  }
  return id as ScenarioId
}

function requireSetup(
  value: unknown,
): "course_only" | "controlled_prior_transcript" | "eligible_agenda" {
  if (
    value !== "course_only" &&
    value !== "controlled_prior_transcript" &&
    value !== "eligible_agenda"
  ) {
    throw new Error(`Unknown provider replay setup: ${String(value)}`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, SerializableValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function hashFile(path: string) {
  const buffer = await Bun.file(path).arrayBuffer()
  return new Bun.CryptoHasher("sha256").update(buffer).digest("hex")
}

function hashText(value: string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function summarize(value: unknown) {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) return String(value)
  return serialized.length <= 180 ? serialized : `${serialized.slice(0, 177)}...`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

if (import.meta.main) {
  const command = process.argv[2]
  if (command === "verify") {
    const report = await verifyRecordedPilotProviderInputEquivalence()
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (!report.equivalent) process.exitCode = 1
  } else {
    throw new Error("Usage: provider-input-equivalence.ts verify")
  }
}
