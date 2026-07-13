import { readdirSync } from "node:fs"
import { relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  BLIND_REVIEW_SCHEMA_REVISION,
  blindReviewOrder,
  contrastReviewPlan,
  mainOrders,
  POLICY_PROFILE_REVISION,
  PROTOCOL_REVISION,
  scenarioIds,
} from "./protocol"

export type FrozenManifest = {
  protocolRevision: string
  requestedModel: "deepseek-v4-flash"
  policyProfileRevision: string
  provider: "deepseek"
  thinking: "disabled"
  temperature: "provider_default"
  providerSeed: null
  maxModelSteps: 6
  maxOutputTokensPerStep: 1_200
  maxRetries: 0
  perConditionTimeoutMs: 90_000
  bunVersion: string
  runtimePlatform: string
  blindReviewSchemaRevision: string
  blindReviewOrder: readonly string[]
  contrastReviewPlan: readonly unknown[]
  scenarioIds: readonly string[]
  mainOrders: readonly (readonly string[])[]
  sha256: Record<string, string>
}

export function repositoryRoot() {
  return resolve(fileURLToPath(new URL("../..", import.meta.url)))
}

export async function buildFrozenManifest(root = repositoryRoot()): Promise<FrozenManifest> {
  const paths = freezePaths(root)
  const sha256: Record<string, string> = {}
  for (const path of paths) {
    sha256[path] = await hashFile(resolve(root, path))
  }
  return {
    protocolRevision: PROTOCOL_REVISION,
    requestedModel: "deepseek-v4-flash",
    policyProfileRevision: POLICY_PROFILE_REVISION,
    provider: "deepseek",
    thinking: "disabled",
    temperature: "provider_default",
    providerSeed: null,
    maxModelSteps: 6,
    maxOutputTokensPerStep: 1_200,
    maxRetries: 0,
    perConditionTimeoutMs: 90_000,
    bunVersion: Bun.version,
    runtimePlatform: `${process.platform}-${process.arch}`,
    blindReviewSchemaRevision: BLIND_REVIEW_SCHEMA_REVISION,
    blindReviewOrder,
    contrastReviewPlan,
    scenarioIds,
    mainOrders,
    sha256,
  }
}

export async function verifyFrozenManifest(manifest: FrozenManifest, root = repositoryRoot()) {
  const current = await buildFrozenManifest(root)
  const errors: string[] = []
  for (const key of [
    "protocolRevision",
    "requestedModel",
    "policyProfileRevision",
    "provider",
    "thinking",
    "temperature",
    "providerSeed",
    "maxModelSteps",
    "maxOutputTokensPerStep",
    "maxRetries",
    "perConditionTimeoutMs",
    "bunVersion",
    "runtimePlatform",
    "blindReviewSchemaRevision",
    "blindReviewOrder",
    "contrastReviewPlan",
    "scenarioIds",
    "mainOrders",
  ] as const) {
    if (JSON.stringify(current[key]) !== JSON.stringify(manifest[key])) {
      errors.push(`${key} differs from frozen-v1.json`)
    }
  }
  const frozenPaths = Object.keys(manifest.sha256).sort()
  const currentPaths = Object.keys(current.sha256).sort()
  if (JSON.stringify(frozenPaths) !== JSON.stringify(currentPaths)) {
    errors.push("frozen source path set changed")
  }
  for (const path of new Set([...frozenPaths, ...currentPaths])) {
    if (manifest.sha256[path] !== current.sha256[path]) {
      errors.push(`hash mismatch: ${path}`)
    }
  }
  return errors
}

export async function hashFile(path: string) {
  const buffer = await Bun.file(path).arrayBuffer()
  return new Bun.CryptoHasher("sha256").update(buffer).digest("hex")
}

function freezePaths(root: string) {
  const production = walkFiles(resolve(root, "src"), root).filter((path) => path.endsWith(".ts"))
  return [
    "AGENTS.md",
    "package.json",
    "bun.lock",
    "docs/research/shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md",
    "labs/shared-tutor-policy-pressure/protocol.ts",
    "labs/shared-tutor-policy-pressure/harness.ts",
    "labs/shared-tutor-policy-pressure/observed-model.ts",
    "labs/shared-tutor-policy-pressure/freeze.ts",
    "labs/shared-tutor-policy-pressure/run.ts",
    "labs/shared-tutor-policy-pressure/review.ts",
    "labs/shared-tutor-policy-pressure/formal-review-lock.ts",
    "labs/shared-tutor-policy-pressure/formal-review.ts",
    "labs/shared-tutor-policy-pressure/provider-input-equivalence.ts",
    "labs/shared-tutor-policy-pressure/fixtures/course.md",
    "labs/shared-tutor-policy-pressure/fixtures/pilot-5171a2474590-provider-replay.json",
    ...production,
  ].sort()
}

function walkFiles(directory: string, root: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name)
    if (entry.isDirectory()) return walkFiles(absolute, root)
    return [relative(root, absolute).replaceAll("\\", "/")]
  })
}

if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(await buildFrozenManifest(), null, 2)}\n`)
}
