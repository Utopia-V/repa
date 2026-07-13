import { mkdirSync, renameSync } from "node:fs"
import { join, resolve } from "node:path"
import { generateText, Output } from "ai"
import {
  createDeepSeekModel,
  estimateDeepSeekUpperBoundUsd,
  loadDeepSeekApiKey,
} from "../../src/providers/deepseek"
import {
  assessSourceSelectorOutput,
  renderSourceSelectorScenario,
  SOURCE_SELECTOR_PROTOCOL_REVISION,
  SOURCE_SELECTOR_SYSTEM_PROMPT,
  sourceSelectorScenarios,
  validateSourceSelectorProtocol,
} from "./source-selector-protocol"

const LEDGER_ID = "ALS-022C"
const MODEL_ID = "deepseek-v4-flash" as const
const TRIALS = 2
const RESERVED_PER_CALL_USD = 0.0011
const MAX_CAMPAIGN_USD = 0.02
const MAX_OUTPUT_TOKENS = 260
const TIMEOUT_MS = 60_000

if (import.meta.main) {
  await main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

async function main() {
  validateSourceSelectorProtocol()
  const budgetUsd = readBudget()
  const apiKey = await loadDeepSeekApiKey()
  const model = createDeepSeekModel({ apiKey, model: MODEL_ID })
  const campaignId = `source-selector-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`
  const campaignRoot = join(resolve(import.meta.dir), ".runs", campaignId)
  mkdirSync(campaignRoot, { recursive: true })
  let spentUsd = 0
  const records: Array<Record<string, unknown>> = []

  for (let trial = 1; trial <= TRIALS; trial += 1) {
    const order = trial === 1 ? sourceSelectorScenarios : [...sourceSelectorScenarios].reverse()
    for (const scenario of order) {
      if (spentUsd + RESERVED_PER_CALL_USD > budgetUsd) {
        throw new Error(`ALS-022C cannot reserve another call within $${budgetUsd.toFixed(2)}`)
      }
      const sampleId = `t${trial}-${scenario.id}`
      process.stdout.write(`[${LEDGER_ID}] ${sampleId}\n`)
      const startedAt = performance.now()
      let result: Awaited<ReturnType<typeof generateText>> | undefined
      let failure: { name: string; message: string } | undefined
      try {
        result = await generateText({
          model,
          system: SOURCE_SELECTOR_SYSTEM_PROMPT,
          prompt: renderSourceSelectorScenario(scenario),
          output: Output.json({
            name: "governing_learning_source",
            description:
              "A control-only choice among exact current request, one legal Agenda candidate, or unresolved conflict.",
          }),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        failure = redactError(error, apiKey)
      }
      const usage = result?.totalUsage
      const estimatedCostUsd = result
        ? estimateDeepSeekUpperBoundUsd(MODEL_ID, {
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          })
        : RESERVED_PER_CALL_USD
      spentUsd += estimatedCostUsd
      const assessment = result
        ? assessSourceSelectorOutput(scenario, result.output)
        : {
            passed: false,
            transportValid: false,
            sourceCorrect: false,
            identityCorrect: false,
            fieldsConsistent: false,
            locallyAdmitted: false,
            detail: failure?.message ?? "no result",
          }
      const record = {
        ledgerId: LEDGER_ID,
        protocolRevision: SOURCE_SELECTOR_PROTOCOL_REVISION,
        sampleId,
        trial,
        scenario,
        model: {
          requested: MODEL_ID,
          thinking: "disabled",
          transport: "json_object plus local Zod validation",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          maxRetries: 0,
          timeoutMs: TIMEOUT_MS,
        },
        modelInput: {
          system: SOURCE_SELECTOR_SYSTEM_PROMPT,
          prompt: renderSourceSelectorScenario(scenario),
        },
        rawText: result?.text ?? null,
        output: result?.output ?? null,
        assessment,
        usage: usage ?? null,
        estimatedCostUsd,
        elapsedMs: Math.round(performance.now() - startedAt),
        failure,
        recordedAt: new Date().toISOString(),
      }
      records.push(record)
      await atomicJsonWrite(join(campaignRoot, `${sampleId}.json`), record)
      if (failure) {
        await writeSummary(campaignRoot, budgetUsd, spentUsd, records, false)
        throw new Error(`ALS-022C stopped after ${sampleId}: ${failure.message}`)
      }
    }
  }

  await writeSummary(campaignRoot, budgetUsd, spentUsd, records, true)
  const passed = records.filter(
    (record) => (record.assessment as { passed: boolean }).passed,
  ).length
  process.stdout.write(
    `Completed ${records.length}; exact ${passed}/${records.length}; estimated cost $${spentUsd.toFixed(6)}; artifacts ${campaignRoot}\n`,
  )
}

function readBudget() {
  const raw = process.env.REPA_LAB_MAX_USD
  const value = Number(raw)
  const required = sourceSelectorScenarios.length * TRIALS * RESERVED_PER_CALL_USD
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
  const assessments = records.map(
    (record) => record.assessment as {
      passed: boolean
      transportValid: boolean
      sourceCorrect: boolean
      identityCorrect: boolean
      fieldsConsistent: boolean
      locallyAdmitted: boolean
    },
  )
  await atomicJsonWrite(join(campaignRoot, "summary.json"), {
    ledgerId: LEDGER_ID,
    protocolRevision: SOURCE_SELECTOR_PROTOCOL_REVISION,
    completed,
    calls: records.length,
    passed: assessments.filter((item) => item.passed).length,
    transportValid: assessments.filter((item) => item.transportValid).length,
    sourceCorrect: assessments.filter((item) => item.sourceCorrect).length,
    identityCorrect: assessments.filter((item) => item.identityCorrect).length,
    fieldsConsistent: assessments.filter((item) => item.fieldsConsistent).length,
    locallyAdmitted: assessments.filter((item) => item.locallyAdmitted).length,
    byScenario: Object.fromEntries(
      sourceSelectorScenarios.map((scenario) => [
        scenario.id,
        records
          .filter(
            (record) =>
              (record.scenario as { id: string }).id === scenario.id,
          )
          .map((record) => ({
            sampleId: record.sampleId,
            output: record.output,
            assessment: record.assessment,
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
