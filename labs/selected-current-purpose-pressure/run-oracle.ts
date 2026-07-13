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
  PROTOCOL_REVISION as BASE_PROTOCOL_REVISION,
  scenarioById,
  VIRTUAL_TIMES,
} from "../shared-tutor-policy-pressure/protocol"
import {
  inspectPredictionResponse,
  ORACLE_SELECTED_PURPOSE,
  withOracleSelectedPurpose,
} from "./oracle-selected-purpose"

const LEDGER_ID = "ALS-022A"
const PROTOCOL_REVISION = "als-022a-oracle-selected-purpose-v1"
const MODEL_ID = "deepseek-v4-flash" as const
const SAMPLE_COUNT = 8
const RESERVED_PER_CASE_USD = 0.0025
const MAX_CAMPAIGN_USD = 0.02
const MAX_MODEL_STEPS = 4
const MAX_OUTPUT_TOKENS = 700
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
  const labRoot = resolve(import.meta.dir)
  const campaignId = new Date().toISOString().replaceAll(/[:.]/g, "-")
  const campaignRoot = join(labRoot, ".runs", campaignId)
  mkdirSync(campaignRoot, { recursive: true })
  const scenario = scenarioById("return_independent_prediction")
  let spentUsd = 0
  const results: Array<Record<string, unknown>> = []

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    if (spentUsd + RESERVED_PER_CASE_USD > budgetUsd) {
      throw new Error(
        `ALS-022A budget cannot reserve sample ${index + 1}: ` +
          `$${spentUsd.toFixed(6)} + $${RESERVED_PER_CASE_USD.toFixed(4)} > $${budgetUsd.toFixed(2)}`,
      )
    }
    const sampleNumber = index + 1
    const sampleId = `als022a-${String(sampleNumber).padStart(2, "0")}`
    const caseRoot = join(campaignRoot, sampleId)
    const workspaceRoot = join(caseRoot, "workspace")
    mkdirSync(caseRoot, { recursive: true })
    process.stdout.write(`[${LEDGER_ID}] ${sampleNumber}/${SAMPLE_COUNT} ${sampleId}\n`)

    const prepared = await prepareScenario({
      scenario,
      workspaceRoot,
      opaqueSampleId: sampleId,
    })
    const observed = observeLanguageModel(
      createDeepSeekModel({ apiKey, model: MODEL_ID }),
      { redactValues: [apiKey] },
    )
    const model = withOracleSelectedPurpose(observed.model)
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
      : estimateObservedCost(providerCalls)
    spentUsd += Math.max(estimatedCostUsd, failure ? RESERVED_PER_CASE_USD : 0)
    const result = {
      ledgerId: LEDGER_ID,
      protocolRevision: PROTOCOL_REVISION,
      baseProtocolRevision: BASE_PROTOCOL_REVISION,
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
      intervention: ORACLE_SELECTED_PURPOSE,
      virtualRunAt: new Date(VIRTUAL_TIMES.runAt).toISOString(),
      initialSnapshot: prepared.initialSnapshot,
      providerCalls,
      outcome,
      failure,
      mechanicalSignals: outcome ? inspectPredictionResponse(outcome.text) : null,
      finalSnapshot,
      estimatedCostUsd,
      campaignCostUsdAfter: spentUsd,
      recordedAt: new Date().toISOString(),
    }
    await atomicJsonWrite(join(caseRoot, "result.json"), result)
    results.push(result)
    prepared.database.close()

    if (failure) {
      await writeSummary(campaignRoot, budgetUsd, spentUsd, results, false)
      throw new Error(
        `ALS-022A stopped after retaining failed sample ${sampleId}: ${failure.message}`,
      )
    }
  }

  await writeSummary(campaignRoot, budgetUsd, spentUsd, results, true)
  process.stdout.write(
    `Completed ${results.length}/${SAMPLE_COUNT}; estimated cost $${spentUsd.toFixed(6)}; artifacts ${campaignRoot}\n`,
  )
}

function readBudget() {
  const raw = process.env.REPA_LAB_MAX_USD
  const value = Number(raw)
  if (!raw || !Number.isFinite(value) || value <= 0 || value > MAX_CAMPAIGN_USD) {
    throw new Error(
      `Set REPA_LAB_MAX_USD to a positive value no greater than ${MAX_CAMPAIGN_USD.toFixed(2)}`,
    )
  }
  if (value < SAMPLE_COUNT * RESERVED_PER_CASE_USD) {
    throw new Error(
      `ALS-022A requires ${SAMPLE_COUNT} x $${RESERVED_PER_CASE_USD.toFixed(4)} reservations`,
    )
  }
  return value
}

async function writeSummary(
  campaignRoot: string,
  budgetUsd: number,
  spentUsd: number,
  results: Array<Record<string, unknown>>,
  completed: boolean,
) {
  await atomicJsonWrite(join(campaignRoot, "summary.json"), {
    ledgerId: LEDGER_ID,
    protocolRevision: PROTOCOL_REVISION,
    completed,
    sampleCount: results.length,
    budgetUsd,
    estimatedCostUsd: spentUsd,
    samples: results.map((result) => ({
      sampleId: result.sampleId,
      outcome: result.outcome,
      failure: result.failure,
      mechanicalSignals: result.mechanicalSignals,
      estimatedCostUsd: result.estimatedCostUsd,
    })),
    recordedAt: new Date().toISOString(),
  })
}

function estimateObservedCost(
  observations: ReturnType<ReturnType<typeof observeLanguageModel>["snapshot"]>,
) {
  let inputTokens = 0
  let outputTokens = 0
  for (const observation of observations) {
    for (const part of observation.streamParts) {
      if (
        typeof part === "object" &&
        part !== null &&
        !Array.isArray(part) &&
        part.type === "finish" &&
        typeof part.usage === "object" &&
        part.usage !== null &&
        !Array.isArray(part.usage)
      ) {
        inputTokens += nestedTokenTotal(part.usage.inputTokens)
        outputTokens += nestedTokenTotal(part.usage.outputTokens)
      }
    }
  }
  return estimateDeepSeekUpperBoundUsd(MODEL_ID, { inputTokens, outputTokens })
}

function nestedTokenTotal(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "total" in value &&
    typeof value.total === "number"
  ) {
    return value.total
  }
  return 0
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
