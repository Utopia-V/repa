import { mkdirSync, renameSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  createDeepSeekModel,
  estimateDeepSeekUpperBoundUsd,
  loadDeepSeekApiKey,
} from "../../src/providers/deepseek"
import { runTutorTurn } from "../../src/runtime/run-tutor-turn"
import {
  captureDurableSnapshot,
  prepareScenario,
} from "../shared-tutor-policy-pressure/harness"
import { observeLanguageModel } from "../shared-tutor-policy-pressure/observed-model"
import {
  POLICY_PROFILE_REVISION,
  scenarioById,
  VIRTUAL_TIMES,
} from "../shared-tutor-policy-pressure/protocol"
import {
  EXACT_REASON_DEFAULT_CONTRIBUTION,
  withExactReasonDefault,
} from "./exact-reason-default"
import { inspectPredictionResponse } from "./oracle-selected-purpose"

const LEDGER_ID = "ALS-022E"
const PROTOCOL_REVISION = "als-022e-exact-reason-default-v1"
const MODEL_ID = "deepseek-v4-flash" as const
const SAMPLE_COUNT = 8
const RESERVED_PER_CALL_USD = 0.0025
const MAX_CAMPAIGN_USD = 0.02
const MAX_MODEL_STEPS = 4
const MAX_OUTPUT_TOKENS = 750
const TIMEOUT_MS = 90_000

if (import.meta.main) {
  await main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

async function main() {
  const budgetUsd = readBudget()
  const apiKey = await loadDeepSeekApiKey()
  const scenario = scenarioById("return_independent_prediction")
  const campaignId = `exact-reason-default-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`
  const campaignRoot = join(resolve(import.meta.dir), ".runs", campaignId)
  mkdirSync(campaignRoot, { recursive: true })
  const records: Array<Record<string, unknown>> = []
  let spentUsd = 0

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    if (spentUsd + RESERVED_PER_CALL_USD > budgetUsd) {
      throw new Error(`ALS-022E cannot reserve sample ${index + 1}`)
    }
    const sampleNumber = index + 1
    const sampleId = `als022e-${String(sampleNumber).padStart(2, "0")}`
    const caseRoot = join(campaignRoot, sampleId)
    const workspaceRoot = join(caseRoot, "workspace")
    mkdirSync(caseRoot, { recursive: true })
    process.stdout.write(`[${LEDGER_ID}] ${sampleNumber}/${SAMPLE_COUNT}\n`)
    const prepared = await prepareScenario({
      scenario,
      workspaceRoot,
      opaqueSampleId: sampleId,
    })
    const observed = observeLanguageModel(
      createDeepSeekModel({ apiKey, model: MODEL_ID }),
      { redactValues: [apiKey] },
    )
    const model = withExactReasonDefault(observed.model)
    let outcome: Awaited<ReturnType<typeof runTutorTurn>> | undefined
    let failure: { name: string; message: string } | undefined
    try {
      outcome = await runTutorTurn({
        database: prepared.database,
        model,
        workspaceRoot,
        learnerText: scenario.learnerText,
        identity: prepared.identity,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: POLICY_PROFILE_REVISION,
        clock: prepared.clock,
        maxModelSteps: MAX_MODEL_STEPS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      failure = redactError(error, apiKey)
    }
    const finalSnapshot = captureDurableSnapshot(prepared.database)
    const providerCalls = observed.snapshot()
    const estimatedCostUsd = outcome
      ? estimateDeepSeekUpperBoundUsd(MODEL_ID, outcome.usage)
      : RESERVED_PER_CALL_USD
    spentUsd += estimatedCostUsd
    const signals = outcome ? inspectPredictionResponse(outcome.text) : null
    const initialOpen = prepared.initialSnapshot.agendaConcerns.filter(
      (concern) => concern.status === "open",
    ).length
    const finalOpen = finalSnapshot.agendaConcerns.filter(
      (concern) => concern.status === "open",
    ).length
    const mechanicallyPassed = Boolean(
      outcome &&
        signals?.asksForPrediction &&
        !signals.containsKnownSeededAnswer &&
        prepared.initialSnapshot.stateRevision === finalSnapshot.stateRevision &&
        initialOpen === 1 &&
        finalOpen === 1,
    )
    const record = {
      ledgerId: LEDGER_ID,
      protocolRevision: PROTOCOL_REVISION,
      sampleNumber,
      sampleId,
      scenarioId: scenario.id,
      model: {
        requested: MODEL_ID,
        thinking: "disabled",
        maxModelSteps: MAX_MODEL_STEPS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        timeoutMs: TIMEOUT_MS,
      },
      intervention: EXACT_REASON_DEFAULT_CONTRIBUTION,
      virtualRunAt: new Date(VIRTUAL_TIMES.runAt).toISOString(),
      initialSnapshot: prepared.initialSnapshot,
      providerCalls,
      outcome,
      failure,
      signals,
      mechanicallyPassed,
      finalSnapshot,
      estimatedCostUsd,
      recordedAt: new Date().toISOString(),
    }
    records.push(record)
    await atomicJsonWrite(join(caseRoot, "result.json"), record)
    prepared.database.close()
    if (failure) {
      await writeSummary(campaignRoot, budgetUsd, spentUsd, records, false)
      throw new Error(`ALS-022E stopped after ${sampleId}: ${failure.message}`)
    }
  }

  await writeSummary(campaignRoot, budgetUsd, spentUsd, records, true)
  const passed = records.filter((record) => record.mechanicallyPassed).length
  process.stdout.write(
    `Completed ${records.length}; mechanical ${passed}/${records.length}; estimated cost $${spentUsd.toFixed(6)}; artifacts ${campaignRoot}\n`,
  )
}

function readBudget() {
  const raw = process.env.REPA_LAB_MAX_USD
  const value = Number(raw)
  const required = SAMPLE_COUNT * RESERVED_PER_CALL_USD
  if (!raw || !Number.isFinite(value) || value < required || value > MAX_CAMPAIGN_USD) {
    throw new Error(
      `Set REPA_LAB_MAX_USD to exactly $${required.toFixed(2)} or another allowed value no greater than $${MAX_CAMPAIGN_USD.toFixed(2)}`,
    )
  }
  return value
}

async function writeSummary(
  campaignRoot: string,
  budgetUsd: number,
  spentUsd: number,
  records: Array<Record<string, unknown>>,
  completed: boolean,
) {
  await atomicJsonWrite(join(campaignRoot, "summary.json"), {
    ledgerId: LEDGER_ID,
    protocolRevision: PROTOCOL_REVISION,
    completed,
    samples: records.length,
    mechanicallyPassed: records.filter((record) => record.mechanicallyPassed).length,
    budgetUsd,
    estimatedCostUsd: spentUsd,
    results: records.map((record) => ({
      sampleId: record.sampleId,
      outcome: record.outcome,
      signals: record.signals,
      mechanicallyPassed: record.mechanicallyPassed,
      estimatedCostUsd: record.estimatedCostUsd,
    })),
    recordedAt: new Date().toISOString(),
  })
}

function redactError(error: unknown, secret: string) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: (error instanceof Error ? error.message : String(error))
      .split(secret)
      .join("[REDACTED]"),
  }
}

async function atomicJsonWrite(path: string, value: unknown) {
  const temporary = `${path}.partial`
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}
