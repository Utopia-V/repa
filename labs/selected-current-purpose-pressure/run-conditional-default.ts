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
  VIRTUAL_TIMES,
} from "../shared-tutor-policy-pressure/protocol"
import {
  CONDITIONAL_DEFAULT_CONTRIBUTION,
  withConditionalDefault,
} from "./conditional-default"
import {
  CONDITIONAL_DEFAULT_PROTOCOL_REVISION,
  conditionalDefaultScenarios,
  inspectConditionalDefaultOutcome,
  validateConditionalDefaultProtocol,
} from "./conditional-default-protocol"

const LEDGER_ID = "ALS-022D"
const MODEL_ID = "deepseek-v4-flash" as const
const TRIALS = 2
const RESERVED_PER_CALL_USD = 0.002
const MAX_CAMPAIGN_USD = 0.02
const MAX_MODEL_STEPS = 4
const MAX_OUTPUT_TOKENS = 800
const TIMEOUT_MS = 90_000

if (import.meta.main) {
  await main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

async function main() {
  validateConditionalDefaultProtocol()
  const budgetUsd = readBudget()
  const apiKey = await loadDeepSeekApiKey()
  const campaignId = `conditional-default-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`
  const campaignRoot = join(resolve(import.meta.dir), ".runs", campaignId)
  mkdirSync(campaignRoot, { recursive: true })
  const records: Array<Record<string, unknown>> = []
  let spentUsd = 0

  for (let trial = 1; trial <= TRIALS; trial += 1) {
    const order =
      trial === 1
        ? conditionalDefaultScenarios
        : [...conditionalDefaultScenarios].reverse()
    for (const item of order) {
      if (spentUsd + RESERVED_PER_CALL_USD > budgetUsd) {
        throw new Error(`ALS-022D cannot reserve another call within $${budgetUsd.toFixed(2)}`)
      }
      const sampleId = `t${trial}-${item.key}`
      const caseRoot = join(campaignRoot, sampleId)
      const workspaceRoot = join(caseRoot, "workspace")
      mkdirSync(caseRoot, { recursive: true })
      process.stdout.write(`[${LEDGER_ID}] ${sampleId}\n`)
      const prepared = await prepareScenario({
        scenario: item.scenario,
        workspaceRoot,
        opaqueSampleId: sampleId,
      })
      const observed = observeLanguageModel(
        createDeepSeekModel({ apiKey, model: MODEL_ID }),
        { redactValues: [apiKey] },
      )
      const model = withConditionalDefault(observed.model)
      const startedAt = performance.now()
      let outcome: Awaited<ReturnType<typeof runTutorTurn>> | undefined
      let failure: { name: string; message: string } | undefined
      try {
        outcome = await runTutorTurn({
          database: prepared.database,
          model,
          workspaceRoot,
          learnerText: item.scenario.learnerText,
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
      const initialOpenConcerns = prepared.initialSnapshot.agendaConcerns.filter(
        (concern) => concern.status === "open",
      ).length
      const finalOpenConcerns = finalSnapshot.agendaConcerns.filter(
        (concern) => concern.status === "open",
      ).length
      const toolNames = finalSnapshot.toolInvocations.map(
        (invocation) => invocation.toolName,
      )
      const inspection = outcome
        ? inspectConditionalDefaultOutcome({
            caseKey: item.key,
            text: outcome.text,
            initialStateRevision: prepared.initialSnapshot.stateRevision,
            finalStateRevision: finalSnapshot.stateRevision,
            initialOpenConcerns,
            finalOpenConcerns,
            toolNames,
          })
        : null
      const record = {
        ledgerId: LEDGER_ID,
        protocolRevision: CONDITIONAL_DEFAULT_PROTOCOL_REVISION,
        sampleId,
        trial,
        caseKey: item.key,
        expected: item.expected,
        scenario: item.scenario,
        model: {
          requested: MODEL_ID,
          thinking: "disabled",
          maxModelSteps: MAX_MODEL_STEPS,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          maxRetries: 0,
          timeoutMs: TIMEOUT_MS,
        },
        intervention: CONDITIONAL_DEFAULT_CONTRIBUTION,
        virtualRunAt: new Date(VIRTUAL_TIMES.runAt).toISOString(),
        initialSnapshot: prepared.initialSnapshot,
        providerCalls,
        outcome,
        failure,
        inspection,
        finalSnapshot,
        estimatedCostUsd,
        elapsedMs: Math.round(performance.now() - startedAt),
        recordedAt: new Date().toISOString(),
      }
      records.push(record)
      await atomicJsonWrite(join(caseRoot, "result.json"), record)
      prepared.database.close()
      if (failure) {
        await writeSummary(campaignRoot, budgetUsd, spentUsd, records, false)
        throw new Error(`ALS-022D stopped after ${sampleId}: ${failure.message}`)
      }
    }
  }

  await writeSummary(campaignRoot, budgetUsd, spentUsd, records, true)
  const passed = records.filter(
    (record) =>
      (record.inspection as { mechanicallyPassed: boolean } | null)
        ?.mechanicallyPassed,
  ).length
  process.stdout.write(
    `Completed ${records.length}; mechanical ${passed}/${records.length}; estimated cost $${spentUsd.toFixed(6)}; artifacts ${campaignRoot}\n`,
  )
}

function readBudget() {
  const raw = process.env.REPA_LAB_MAX_USD
  const value = Number(raw)
  const required = conditionalDefaultScenarios.length * TRIALS * RESERVED_PER_CALL_USD
  if (!raw || !Number.isFinite(value) || value < required || value > MAX_CAMPAIGN_USD) {
    throw new Error(
      `Set REPA_LAB_MAX_USD between $${required.toFixed(4)} and $${MAX_CAMPAIGN_USD.toFixed(2)}`,
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
    protocolRevision: CONDITIONAL_DEFAULT_PROTOCOL_REVISION,
    completed,
    calls: records.length,
    mechanicallyPassed: records.filter(
      (record) =>
        (record.inspection as { mechanicallyPassed: boolean } | null)
          ?.mechanicallyPassed,
    ).length,
    byCase: Object.fromEntries(
      conditionalDefaultScenarios.map((item) => [
        item.key,
        records
          .filter((record) => record.caseKey === item.key)
          .map((record) => ({
            sampleId: record.sampleId,
            outcome: record.outcome,
            inspection: record.inspection,
            estimatedCostUsd: record.estimatedCostUsd,
          })),
      ]),
    ),
    budgetUsd,
    estimatedCostUsd: spentUsd,
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
