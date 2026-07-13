import { readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import {
  assertFrozenBenchmarkContract,
  assertFrozenExecutionFiles,
  currentFrozenContractSha256,
  expectedFrozenContractSha256,
  frozenBenchmarkV1,
} from "./simulated-student-freeze"
import { aggregateFormalTrials, formalTrialMetricsSchema } from "./simulated-student-verdict"

assertFrozenBenchmarkContract()
await assertFrozenExecutionFiles()

const directoryUrl = new URL("./.runs/", import.meta.url)
const directoryPath = fileURLToPath(directoryUrl)
const names = (await readdir(directoryPath)).filter(
  (name) => name.includes("simulated-student-benchmark-main") && name.endsWith(".json"),
)
const trials = []
for (const name of names) {
  const envelope = (await Bun.file(new URL(name, directoryUrl)).json()) as {
    report?: {
      benchmarkVersion?: unknown
      frozenContractSha256?: unknown
      formalTrial?: unknown
      trialMetrics?: unknown
      models?: unknown
      materialManifest?: unknown
      usage?: Record<string, number>
      elapsedMs?: number
      estimatedUpperBoundUsd?: number
    }
  }
  const report = envelope.report
  if (!report || report.benchmarkVersion !== frozenBenchmarkV1.version) continue
  if (report.frozenContractSha256 !== currentFrozenContractSha256) {
    throw new Error(`Formal artifact ${name} used a different frozen contract`)
  }
  const metrics = formalTrialMetricsSchema.parse(report.trialMetrics)
  trials.push({ name, metrics, report })
}

const counts = new Map<number, number>()
for (const trial of trials) counts.set(trial.metrics.trial, (counts.get(trial.metrics.trial) ?? 0) + 1)
const duplicates = [...counts].filter(([, count]) => count !== 1)
if (duplicates.length > 0) {
  throw new Error(
    `Formal trial artifacts are not unique: ${duplicates.map(([trial, count]) => `${trial}=${count}`).join(", ")}`,
  )
}

const aggregate = aggregateFormalTrials(trials.map((trial) => trial.metrics))
const report = {
  suite: "simulated-student-benchmark-aggregate",
  benchmarkVersion: frozenBenchmarkV1.version,
  benchmarkName: "controlled semantic-contract and one-step policy-execution benchmark",
  frozenContractSha256: currentFrozenContractSha256,
  expectedFrozenContractSha256,
  trialArtifacts: trials
    .sort((left, right) => left.metrics.trial - right.metrics.trial)
    .map((trial) => ({
      trial: trial.metrics.trial,
      file: trial.name,
      metrics: trial.metrics,
      models: trial.report.models,
      materialManifest: trial.report.materialManifest,
      usage: trial.report.usage,
      elapsedMs: trial.report.elapsedMs,
      estimatedUpperBoundUsd: trial.report.estimatedUpperBoundUsd,
    })),
  aggregate,
  claimBoundary: {
    supports:
      "controlled evidence semantics and one-step frozen-policy execution in the first JavaScript domain",
    doesNotSupport: [
      "real student learning improvement",
      "long-term retention or transfer",
      "general scheduler optimality",
      "cross-domain validity",
    ],
  },
}
const recordedAt = new Date().toISOString()
const filename = `${recordedAt.replaceAll(":", "-")}-simulated-student-benchmark-aggregate-v1.json`
const path = fileURLToPath(new URL(filename, directoryUrl))
await Bun.write(path, JSON.stringify({ recordedAt, report }, null, 2))
console.log(JSON.stringify({ path, ...report }, null, 2))
