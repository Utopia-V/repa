import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import {
  createDeepSeekModel,
  estimateDeepSeekUpperBoundUsd,
  loadDeepSeekApiKey,
  parseDeepSeekModel,
} from "../../src/providers/deepseek"
import { runTutorTurn } from "../../src/runtime/run-tutor-turn"
import {
  assessScenario,
  captureDurableSnapshot,
  prepareScenario,
} from "./harness"
import { buildFrozenManifest, hashFile, repositoryRoot, type FrozenManifest, verifyFrozenManifest } from "./freeze"
import { observeLanguageModel } from "./observed-model"
import {
  mainOrders,
  pilotOrder,
  POLICY_PROFILE_REVISION,
  PROTOCOL_REVISION,
  scenarioById,
  validateProtocol,
  VIRTUAL_TIMES,
  type ScenarioId,
} from "./protocol"

const RESERVED_PER_CONDITION_USD = 0.03
const MAX_MODEL_STEPS = 6
const MAX_OUTPUT_TOKENS = 1_200
const MAX_RETRIES = 0
const PER_CONDITION_TIMEOUT_MS = 90_000

type Mode = "pilot" | "main"

type WorkItem = {
  block: string
  position: number
  scenarioId: ScenarioId
}

export type CompletedCaseExpectation = {
  caseDirectory: string
  completionPath: string
  mode: Mode
  protocolRevision: string
  block: string
  plannedPosition: number
  scenarioId: ScenarioId
  requestedModel: "deepseek-v4-flash"
  policyProfileRevision: string
  sourceFingerprint: string
}

type PersistedCaseResult = {
  mode: Mode
  protocolRevision: string
  block: string
  plannedPosition: number
  scenario: { id: ScenarioId }
  modelConfiguration: {
    requestedModel: "deepseek-v4-flash"
    policyProfileRevision: string
  }
  frozenSource: unknown
  failure?: { name: string; message: string }
  providerCalls: ReturnType<ReturnType<typeof observeLanguageModel>["snapshot"]>
  assessment: ReturnType<typeof assessScenario>
  modelAliasConsistent: boolean
  estimatedCostUsd: number
  budgetChargeUsd: number
}

if (import.meta.main) {
  await main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

async function main() {
  validateProtocol()
  const retryInfrastructure = process.argv.includes("--retry-infrastructure")
  const arguments_ = process.argv.slice(2).filter((value) => value !== "--retry-infrastructure")
  const mode = parseMode(arguments_[0])
  const selection = mode === "main" ? (arguments_[1] ?? "all") : "pilot"
  const modelArgument = mode === "main" ? arguments_[2] : arguments_[1]
  const modelId = parseDeepSeekModel(modelArgument)
  if (modelId !== "deepseek-v4-flash") {
    throw new Error("ALS-021 v1 tests only the production-default deepseek-v4-flash condition")
  }
  const budgetUsd = parseBudget(process.env.REPA_LAB_MAX_USD)
  const root = repositoryRoot()
  const labRoot = resolve(root, "labs/shared-tutor-policy-pressure")
  const apiKey = await loadDeepSeekApiKey()
  let manifest: FrozenManifest | undefined
  let manifestHash = "draft"

  if (mode === "main") {
    const manifestPath = join(labRoot, "frozen-v1.json")
    if (!existsSync(manifestPath)) {
      throw new Error("Run the excluded pilot and freeze frozen-v1.json before formal trials")
    }
    manifest = (await Bun.file(manifestPath).json()) as FrozenManifest
    const freezeErrors = await verifyFrozenManifest(manifest, root)
    if (freezeErrors.length > 0) {
      throw new Error(`Frozen protocol mismatch:\n- ${freezeErrors.join("\n- ")}`)
    }
    manifestHash = (await hashFile(manifestPath)).slice(0, 12)
  }

  const work = buildWork(mode, selection)
  const sourceSnapshot = manifest ?? (await buildFrozenManifest(root))
  const frozenCourseFixtureText = await Bun.file(
    new URL("./fixtures/course.md", import.meta.url),
  ).text()
  const frozenFixtureHash = sourceSnapshot.sha256[
    "labs/shared-tutor-policy-pressure/fixtures/course.md"
  ]
  if (!frozenFixtureHash || hashText(frozenCourseFixtureText) !== frozenFixtureHash) {
    throw new Error("Course fixture bytes changed while the campaign was being prepared")
  }
  const sourceFingerprint = frozenSourceFingerprint(sourceSnapshot)
  const campaignDirectory =
    mode === "pilot"
      ? join(labRoot, ".runs", `pilot-${PROTOCOL_REVISION}-${sourceFingerprint}`)
      : join(labRoot, ".runs", `main-${PROTOCOL_REVISION}-${manifestHash}`)
  mkdirSync(campaignDirectory, { recursive: true })
  const releaseCampaignLock = acquireCampaignLock(campaignDirectory)
  process.once("exit", releaseCampaignLock)
  assertCampaignRecoveryState(
    campaignDirectory,
    work.map((item) =>
      join(
        campaignDirectory,
        item.block,
        `${String(item.position + 1).padStart(2, "0")}-${item.scenarioId}`,
      ),
    ),
  )
  const repository = gitSnapshot(root)
  let spentUsd = await existingCampaignCost(campaignDirectory)
  let observedSpentUsd = await existingObservedCampaignCost(campaignDirectory)
  const campaignModelIds = new Set(await existingCampaignModelIds(campaignDirectory))
  const completed: Array<{ scenarioId: ScenarioId; resultPath: string; costUsd: number }> = []

  for (const item of work) {
    const sourceDrift = await verifyFrozenManifest(sourceSnapshot, root)
    if (sourceDrift.length > 0) {
      throw new Error(
        `Experiment source changed during the campaign:\n- ${sourceDrift.join("\n- ")}`,
      )
    }
    const blockDirectory = join(campaignDirectory, item.block)
    mkdirSync(blockDirectory, { recursive: true })
    const caseDirectory = join(
      blockDirectory,
      `${String(item.position + 1).padStart(2, "0")}-${item.scenarioId}`,
    )
    mkdirSync(caseDirectory, { recursive: true })
    assertNoPartialCaseWrites(caseDirectory)
    const caseFiles = readdirSync(caseDirectory)
    const completionPath = join(caseDirectory, "complete.json")
    const caseExpectation: CompletedCaseExpectation = {
      caseDirectory,
      completionPath,
      mode,
      protocolRevision: PROTOCOL_REVISION,
      block: item.block,
      plannedPosition: item.position + 1,
      scenarioId: item.scenarioId,
      requestedModel: modelId,
      policyProfileRevision: POLICY_PROFILE_REVISION,
      sourceFingerprint,
    }
    if (existsSync(completionPath)) {
      const completion = await readValidatedCompletedCase(caseExpectation)
      completed.push({
        scenarioId: item.scenarioId,
        resultPath: completion.resultPath,
        costUsd: completion.estimatedCostUsd,
      })
      continue
    }
    const existingResultNames = caseFiles
      .filter((name) => /^attempt-\d+\.result\.json$/.test(name))
      .sort()
    if (existingResultNames.length > 0) {
      const existingResultPath = join(caseDirectory, existingResultNames.at(-1)!)
      const existingBundle = await readValidatedCaseResult(
        caseExpectation,
        existingResultPath,
      )
      if (!isInfrastructureFailure(existingBundle.failure, existingBundle.providerCalls)) {
        await atomicJsonWrite(completionPath, {
          resultPath: existingResultPath,
          estimatedCostUsd: existingBundle.estimatedCostUsd,
          recoveredFinalization: true,
          reviewablePolicySample: existingBundle.assessment.reviewablePolicySample,
        })
        completed.push({
          scenarioId: item.scenarioId,
          resultPath: existingResultPath,
          costUsd: existingBundle.estimatedCostUsd,
        })
        continue
      }
      if (!retryInfrastructure) {
        throw new Error(
          `Infrastructure failure retained at ${existingResultPath}. ` +
            "Rerun with --retry-infrastructure for the single allowed retry.",
        )
      }
    }
    if (caseFiles.some((name) => name.endsWith(".02-setup-failed.json"))) {
      throw new Error(
        `Scenario setup failed for ${item.block}/${item.scenarioId}; ` +
          "this is not a retryable provider failure",
      )
    }
    const finishedWithoutResult = caseFiles.some((name) => {
      if (!name.endsWith(".03-provider-finished.json")) return false
      return !existsSync(join(caseDirectory, name.replace(".03-provider-finished.json", ".result.json")))
    })
    if (finishedWithoutResult) {
      throw new Error(
        `Provider output was journaled but assessment was not finalized for ` +
          `${item.block}/${item.scenarioId}; do not retry that output automatically`,
      )
    }
    const priorAttempts = countStartedAttempts(caseDirectory)
    if (priorAttempts > 0 && !retryInfrastructure) {
      throw new Error(
        `Incomplete infrastructure attempt retained for ${item.block}/${item.scenarioId}. ` +
          "Inspect it, then rerun with --retry-infrastructure to create one new attempt.",
      )
    }
    if (priorAttempts >= 2) {
      throw new Error(
        `Two infrastructure attempts are already retained for ${item.block}/${item.scenarioId}; ` +
          "the block remains incomplete",
      )
    }
    if (spentUsd + RESERVED_PER_CONDITION_USD > budgetUsd) {
      throw new Error(
        `Budget guard stopped before ${item.block}/${item.scenarioId}: ` +
          `$${spentUsd.toFixed(6)} spent, $${budgetUsd.toFixed(2)} cap, ` +
          `$${RESERVED_PER_CONDITION_USD.toFixed(2)} reserve required`,
      )
    }

    const attemptNumber = priorAttempts + 1
    const attemptLabel = `attempt-${String(attemptNumber).padStart(2, "0")}`
    const opaqueSampleId = `${item.block.replaceAll(/[^a-zA-Z0-9]/g, "")}-${String(item.position + 1).padStart(2, "0")}-a${attemptNumber}`
    const workspaceRoot = join(caseDirectory, `workspace-${attemptLabel}`)
    const resultPath = join(caseDirectory, `${attemptLabel}.result.json`)
    const scenario = scenarioById(item.scenarioId)
    process.stdout.write(
      `[${mode}] ${item.block} ${item.position + 1}/${mode === "pilot" ? pilotOrder.length : scenarioIdsPerBlock()} ${item.scenarioId} ${attemptLabel}\n`,
    )
    await writeAttemptPhase(caseDirectory, attemptNumber, 1, "preparing", {
      ledgerId: "ALS-021",
      mode,
      protocolRevision: PROTOCOL_REVISION,
      block: item.block,
      plannedPosition: item.position + 1,
      scenarioId: item.scenarioId,
      attemptNumber,
      budgetUsd,
      campaignBudgetChargedUsdBefore: spentUsd,
      createdAt: new Date().toISOString(),
    })
    let prepared: Awaited<ReturnType<typeof prepareScenario>>
    try {
      prepared = await prepareScenario({
        scenario,
        workspaceRoot,
        opaqueSampleId,
        courseFixtureText: frozenCourseFixtureText,
      })
    } catch (error) {
      await writeAttemptPhase(caseDirectory, attemptNumber, 2, "setup-failed", {
        failure: safeFailure(error, apiKey),
        recordedAt: new Date().toISOString(),
      })
      throw error
    }
    const observed = observeLanguageModel(createDeepSeekModel({ apiKey, model: modelId }), {
      redactValues: [apiKey],
    })
    await writeAttemptPhase(caseDirectory, attemptNumber, 2, "provider-started", {
      initialSnapshot: prepared.initialSnapshot,
      virtualRunAt: new Date(VIRTUAL_TIMES.runAt).toISOString(),
      maxRetries: MAX_RETRIES,
      timeoutMs: PER_CONDITION_TIMEOUT_MS,
      recordedAt: new Date().toISOString(),
    })
    let outcome: Awaited<ReturnType<typeof runTutorTurn>> | undefined
    let failure: { name: string; message: string } | undefined
    try {
      outcome = await runTutorTurn({
        database: prepared.database,
        model: observed.model,
        workspaceRoot,
        learnerText: scenario.learnerText,
        identity: prepared.identity,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: POLICY_PROFILE_REVISION,
        clock: prepared.clock,
        maxModelSteps: MAX_MODEL_STEPS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: MAX_RETRIES,
        abortSignal: AbortSignal.timeout(PER_CONDITION_TIMEOUT_MS),
      })
    } catch (error) {
      failure = safeFailure(error, apiKey)
    }
    const finalSnapshot = captureDurableSnapshot(prepared.database)
    const observations = observed.snapshot()
    const estimatedCostUsd = outcome
      ? estimateDeepSeekUpperBoundUsd(modelId, outcome.usage)
      : estimateObservedCost(observations, modelId)
    const infrastructureFailure = isInfrastructureFailure(failure, observations)
    const budgetChargeUsd = infrastructureFailure
      ? Math.max(estimatedCostUsd, RESERVED_PER_CONDITION_USD)
      : estimatedCostUsd
    spentUsd += budgetChargeUsd
    observedSpentUsd += estimatedCostUsd
    await writeAttemptPhase(caseDirectory, attemptNumber, 3, "provider-finished", {
      providerCalls: observations,
      outcome,
      failure,
      finalSnapshot,
      estimatedCostUsd,
      budgetChargeUsd,
      campaignObservedEstimatedCostUsdAfter: observedSpentUsd,
      campaignBudgetChargedUsdAfter: spentUsd,
      recordedAt: new Date().toISOString(),
    })
    const assessment = assessScenario({
      prepared,
      finalSnapshot,
      observations,
      outcomeText: outcome?.text,
      ...(failure === undefined ? {} : { executionFailure: failure }),
    })
    for (const actualModelId of assessment.diagnostics.providerModelIds) {
      campaignModelIds.add(actualModelId)
    }
    const modelAliasConsistent = campaignModelIds.size <= 1
    const bundle = {
      ledgerId: "ALS-021",
      mode,
      protocolRevision: PROTOCOL_REVISION,
      block: item.block,
      plannedPosition: item.position + 1,
      scenario,
      modelConfiguration: {
        requestedModel: modelId,
        policyProfileRevision: POLICY_PROFILE_REVISION,
        provider: "deepseek",
        thinking: "disabled",
        temperature: "provider_default",
        providerSeed: null,
        maxModelSteps: MAX_MODEL_STEPS,
        maxOutputTokensPerStep: MAX_OUTPUT_TOKENS,
        maxRetries: MAX_RETRIES,
        timeoutMs: PER_CONDITION_TIMEOUT_MS,
      },
      repository,
      frozenSource: sourceSnapshot,
      learnerText: scenario.learnerText,
      virtualRunAt: new Date(VIRTUAL_TIMES.runAt).toISOString(),
      identity: {
        sessionId: prepared.identity.sessionId,
        turnId: prepared.identity.turnId,
        userItemId: prepared.identity.userItemId,
        assistantItemId: prepared.identity.assistantItemId,
        modelOperationIdTemplate: `model:${opaqueSampleId}:{stepNumber}`,
        toolItemIdTemplate: `item:tool:${opaqueSampleId}:{durableInvocationId}`,
      },
      initialSnapshot: prepared.initialSnapshot,
      providerCalls: observations,
      outcome,
      failure,
      finalSnapshot,
      assessment,
      campaignActualModelIds: [...campaignModelIds].sort(),
      modelAliasConsistent,
      estimatedCostUsd,
      budgetChargeUsd,
      campaignObservedEstimatedCostUsdAfter: observedSpentUsd,
      campaignBudgetChargedUsdAfter: spentUsd,
      recordedAt: new Date().toISOString(),
    }
    await atomicJsonWrite(resultPath, bundle)
    prepared.database.close()
    await writeAttemptPhase(caseDirectory, attemptNumber, 4, "persisted", {
      resultPath,
      estimatedCostUsd,
      recordedAt: new Date().toISOString(),
    })
    if (spentUsd > budgetUsd) {
      throw new Error(
        `Observed cost exceeded the campaign cap after a persisted condition: ` +
          `$${spentUsd.toFixed(6)} > $${budgetUsd.toFixed(2)}`,
      )
    }
    if (hasHarnessIntegrityFailure(assessment)) {
      throw new Error(
        `Program or harness-integrity failure retained at ${resultPath}; ` +
          "the campaign stopped before another live call",
      )
    }
    if (!modelAliasConsistent) {
      throw new Error(
        `Provider model alias changed during the campaign (${[...campaignModelIds].join(", ")}); ` +
          `result retained at ${resultPath} and execution stopped`,
      )
    }
    if (infrastructureFailure) {
      throw new Error(
        `Infrastructure failure retained at ${resultPath}. ` +
          "Rerun with --retry-infrastructure for the single allowed retry.",
      )
    }
    await atomicJsonWrite(completionPath, {
      resultPath,
      estimatedCostUsd,
      attemptNumber,
      reviewablePolicySample: assessment.reviewablePolicySample,
    })
    completed.push({ scenarioId: item.scenarioId, resultPath, costUsd: estimatedCostUsd })
  }

  const summary = {
    ledgerId: "ALS-021",
    mode,
    protocolRevision: PROTOCOL_REVISION,
    selection,
    completed,
    observedEstimatedCampaignCostUsd: observedSpentUsd,
    campaignBudgetChargedUsd: spentUsd,
    budgetUsd,
    qualitativeReview: "pending",
    completedAt: new Date().toISOString(),
  }
  await atomicJsonWrite(
    join(campaignDirectory, `summary-${selection}-${Date.now()}.json`),
    summary,
  )
  process.removeListener("exit", releaseCampaignLock)
  releaseCampaignLock()
  process.stdout.write(
    `Completed ${completed.length} conditions; observed estimate $${observedSpentUsd.toFixed(6)}, budget charge $${spentUsd.toFixed(6)}\n`,
  )
}

export async function readValidatedCompletedCase(
  expectation: CompletedCaseExpectation,
) {
  const completion = (await Bun.file(expectation.completionPath).json()) as {
    resultPath?: unknown
    estimatedCostUsd?: unknown
  }
  if (typeof completion.resultPath !== "string" || !completion.resultPath.trim()) {
    throw new Error(`Completed case has no resultPath: ${expectation.completionPath}`)
  }
  const bundle = await readValidatedCaseResult(expectation, completion.resultPath)
  const resultPath = resolve(completion.resultPath)
  if (isInfrastructureFailure(bundle.failure, bundle.providerCalls)) {
    throw new Error(`Completed case points to an infrastructure failure: ${resultPath}`)
  }
  if (completion.estimatedCostUsd !== bundle.estimatedCostUsd) {
    throw new Error(`Completed result has inconsistent cost accounting: ${resultPath}`)
  }
  return {
    resultPath,
    estimatedCostUsd: bundle.estimatedCostUsd,
  }
}

export async function readValidatedCaseResult(
  expectation: CompletedCaseExpectation,
  candidateResultPath: string,
): Promise<PersistedCaseResult> {
  const caseRoot = resolve(expectation.caseDirectory)
  const resultPath = resolve(candidateResultPath)
  if (
    dirname(resultPath) !== caseRoot ||
    !/^attempt-\d+\.result\.json$/.test(basename(resultPath))
  ) {
    throw new Error(
      `Case result points outside its case directory: ${resultPath}`,
    )
  }
  if (!existsSync(resultPath)) {
    throw new Error(`Completed result is missing: ${resultPath}`)
  }
  const bundle = (await Bun.file(resultPath).json()) as Partial<PersistedCaseResult>
  if (
    !Array.isArray(bundle.providerCalls) ||
    typeof bundle.assessment !== "object" ||
    bundle.assessment === null ||
    !Array.isArray(bundle.assessment.checks)
  ) {
    throw new Error(`Case result has an invalid assessment envelope: ${resultPath}`)
  }
  if (
    bundle.mode !== expectation.mode ||
    bundle.protocolRevision !== expectation.protocolRevision ||
    bundle.block !== expectation.block ||
    bundle.plannedPosition !== expectation.plannedPosition
  ) {
    throw new Error(`Completed result has the wrong campaign coordinates: ${resultPath}`)
  }
  if (bundle.scenario?.id !== expectation.scenarioId) {
    throw new Error(`Completed result has the wrong scenario identity: ${resultPath}`)
  }
  if (bundle.modelConfiguration?.requestedModel !== expectation.requestedModel) {
    throw new Error(`Completed result has the wrong requested model: ${resultPath}`)
  }
  if (
    bundle.modelConfiguration?.policyProfileRevision !==
    expectation.policyProfileRevision
  ) {
    throw new Error(`Completed result has the wrong policy profile: ${resultPath}`)
  }
  if (frozenSourceFingerprint(bundle.frozenSource) !== expectation.sourceFingerprint) {
    throw new Error(`Completed result has the wrong frozen source: ${resultPath}`)
  }
  if (
    bundle.assessment.programPassed !== true ||
    bundle.modelAliasConsistent !== true ||
    hasHarnessIntegrityFailure(bundle.assessment)
  ) {
    throw new Error(`Completed result failed a campaign integrity gate: ${resultPath}`)
  }
  if (
    typeof bundle.estimatedCostUsd !== "number" ||
    !Number.isFinite(bundle.estimatedCostUsd) ||
    bundle.estimatedCostUsd < 0
  ) {
    throw new Error(`Completed result has invalid cost accounting: ${resultPath}`)
  }
  if (
    typeof bundle.budgetChargeUsd !== "number" ||
    !Number.isFinite(bundle.budgetChargeUsd) ||
    bundle.budgetChargeUsd < bundle.estimatedCostUsd
  ) {
    throw new Error(`Completed result has invalid budget charge: ${resultPath}`)
  }
  return bundle as PersistedCaseResult
}

export function frozenSourceFingerprint(value: unknown) {
  return hashText(JSON.stringify(value)).slice(0, 12)
}

export function assertNoPartialCaseWrites(caseDirectory: string) {
  const partials = readdirSync(caseDirectory).filter((name) => name.endsWith(".partial"))
  if (partials.length > 0) {
    throw new Error(
      `Partial campaign write retained in ${caseDirectory}: ${partials.join(", ")}. ` +
        "Do not redispatch provider work until it is inspected.",
    )
  }
}

export function assertCampaignRecoveryState(
  campaignDirectory: string,
  selectedCaseDirectories: readonly string[],
) {
  const selected = new Set(selectedCaseDirectories.map((path) => resolve(path)))
  const files = walkFiles(campaignDirectory)
  const partial = files.find((path) => path.endsWith(".partial"))
  if (partial) {
    throw new Error(`Partial campaign write retained: ${partial}`)
  }
  const caseDirectories = new Set(
    files
      .filter((path) => /^attempt-\d+\./.test(basename(path)))
      .map((path) => dirname(path)),
  )
  for (const caseDirectory of caseDirectories) {
    if (!existsSync(join(caseDirectory, "complete.json")) && !selected.has(resolve(caseDirectory))) {
      throw new Error(
        `Unresolved campaign case is outside the selected work: ${caseDirectory}`,
      )
    }
  }
}

function buildWork(mode: Mode, selection: string): WorkItem[] {
  if (mode === "pilot") {
    return pilotOrder.map((scenarioId, position) => ({
      block: "pilot",
      position,
      scenarioId,
    }))
  }
  const blockIndexes =
    selection === "all"
      ? mainOrders.map((_, index) => index)
      : [parseBlockIndex(selection)]
  return blockIndexes.flatMap((blockIndex) =>
    mainOrders[blockIndex]!.map((scenarioId, position) => ({
      block: `block-${blockIndex + 1}`,
      position,
      scenarioId,
    })),
  )
}

function parseBlockIndex(value: string) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > mainOrders.length) {
    throw new Error(`Main block must be all or 1-${mainOrders.length}: ${value}`)
  }
  return number - 1
}

function parseMode(value: string | undefined): Mode {
  if (value === "pilot" || value === "main") return value
  throw new Error("Usage: bun run lab:shared-policy -- pilot [model] | main [all|1-8] [model]")
}

function parseBudget(value: string | undefined) {
  const budget = Number(value)
  if (!value || !Number.isFinite(budget) || budget <= 0) {
    throw new Error("Set REPA_LAB_MAX_USD to a positive campaign budget before live calls")
  }
  return budget
}

function scenarioIdsPerBlock() {
  return mainOrders[0]?.length ?? 0
}

function estimateObservedCost(
  observations: ReturnType<ReturnType<typeof observeLanguageModel>["snapshot"]>,
  modelId: "deepseek-v4-flash" | "deepseek-v4-pro",
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
  return estimateDeepSeekUpperBoundUsd(modelId, { inputTokens, outputTokens })
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

function safeFailure(error: unknown, secret: string) {
  const name = error instanceof Error ? error.name : "Error"
  const message = error instanceof Error ? error.message : String(error)
  return {
    name,
    message: message.split(secret).join("[REDACTED]"),
  }
}

async function atomicJsonWrite(path: string, value: unknown) {
  const temporaryPath = `${path}.partial`
  await Bun.write(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporaryPath, path)
}

async function writeAttemptPhase(
  caseDirectory: string,
  attemptNumber: number,
  phaseNumber: number,
  phase: string,
  value: unknown,
) {
  const prefix = `attempt-${String(attemptNumber).padStart(2, "0")}`
  const phasePath = join(
    caseDirectory,
    `${prefix}.${String(phaseNumber).padStart(2, "0")}-${phase}.json`,
  )
  await atomicJsonWrite(phasePath, {
    attemptNumber,
    phase,
    ...asRecord(value),
  })
}

function countStartedAttempts(caseDirectory: string) {
  return readdirSync(caseDirectory).filter((name) =>
    /^attempt-\d+\.01-preparing\.json$/.test(name),
  ).length
}

export async function existingCampaignCost(directory: string): Promise<number> {
  if (!existsSync(directory)) return 0
  let total = 0
  for (const path of walkJson(directory)) {
    if (path.endsWith(".result.json")) {
      const value = await readCostRecord(path)
      total += value.budgetChargeUsd
      continue
    }
    if (path.endsWith(".03-provider-finished.json")) {
      const resultPath = path.replace(".03-provider-finished.json", ".result.json")
      if (!existsSync(resultPath)) {
        const value = await readCostRecord(path)
        total += value.budgetChargeUsd
      }
      continue
    }
    if (path.endsWith(".02-provider-started.json")) {
      const finishedPath = path.replace(
        ".02-provider-started.json",
        ".03-provider-finished.json",
      )
      const resultPath = path.replace(".02-provider-started.json", ".result.json")
      if (!existsSync(finishedPath) && !existsSync(resultPath)) {
        total += RESERVED_PER_CONDITION_USD
      }
    }
  }
  return total
}

export async function existingObservedCampaignCost(directory: string) {
  if (!existsSync(directory)) return 0
  let total = 0
  for (const path of walkJson(directory).filter((candidate) =>
    candidate.endsWith(".result.json"),
  )) {
    const value = await readCostRecord(path)
    total += value.estimatedCostUsd
  }
  for (const path of walkJson(directory).filter((candidate) =>
    candidate.endsWith(".03-provider-finished.json"),
  )) {
    const resultPath = path.replace(".03-provider-finished.json", ".result.json")
    if (!existsSync(resultPath)) {
      const value = await readCostRecord(path)
      total += value.estimatedCostUsd
    }
  }
  return total
}

async function readCostRecord(path: string) {
  const value = (await Bun.file(path).json()) as {
    estimatedCostUsd?: unknown
    budgetChargeUsd?: unknown
  }
  if (
    typeof value.estimatedCostUsd !== "number" ||
    !Number.isFinite(value.estimatedCostUsd) ||
    value.estimatedCostUsd < 0 ||
    typeof value.budgetChargeUsd !== "number" ||
    !Number.isFinite(value.budgetChargeUsd) ||
    value.budgetChargeUsd < value.estimatedCostUsd
  ) {
    throw new Error(`Campaign has an invalid cost record: ${path}`)
  }
  return {
    estimatedCostUsd: value.estimatedCostUsd,
    budgetChargeUsd: value.budgetChargeUsd,
  }
}

async function existingCampaignModelIds(directory: string) {
  if (!existsSync(directory)) return []
  const ids = new Set<string>()
  for (const path of walkJson(directory).filter((candidate) =>
    candidate.endsWith(".result.json"),
  )) {
    const value = (await Bun.file(path).json()) as { campaignActualModelIds?: string[] }
    for (const id of value.campaignActualModelIds ?? []) ids.add(id)
  }
  return [...ids]
}

function walkJson(directory: string): string[] {
  return walkFiles(directory).filter((path) => path.endsWith(".json"))
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(path) : [path]
  })
}

function gitSnapshot(root: string) {
  return {
    head: spawnGit(root, ["rev-parse", "HEAD"]),
    statusShort: spawnGit(root, ["status", "--short"]),
  }
}

function spawnGit(root: string, arguments_: string[]) {
  const result = Bun.spawnSync(["git", ...arguments_], { cwd: root })
  return result.exitCode === 0
    ? result.stdout.toString().trim()
    : `git failed (${result.exitCode})`
}

export function isInfrastructureFailure(
  failure: { name: string; message: string } | undefined,
  observations: ReturnType<ReturnType<typeof observeLanguageModel>["snapshot"]>,
) {
  if (!failure) return false
  return observations.some(
    (observation) =>
      observation.status === "failed" ||
      observation.status === "cancelled" ||
      observation.streamParts.some(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          !Array.isArray(part) &&
          (part.type === "error" ||
            (part.type === "finish" &&
              typeof part.finishReason === "object" &&
              part.finishReason !== null &&
              !Array.isArray(part.finishReason) &&
              part.finishReason.unified === "error")),
      ),
  )
}

function hasHarnessIntegrityFailure(assessment: ReturnType<typeof assessScenario>) {
  return !assessment.programPassed || !assessment.harnessIntegrityPassed
}

function acquireCampaignLock(campaignDirectory: string) {
  const lockPath = join(campaignDirectory, "campaign.lock.json")
  if (existsSync(lockPath)) {
    let ownerPid: number
    try {
      const value = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: number }
      if (!Number.isSafeInteger(value.pid) || (value.pid ?? 0) <= 0) {
        throw new Error("lock has no valid pid")
      }
      ownerPid = value.pid!
    } catch (error) {
      throw new Error(
        `ALS-021 campaign lock ownership is unknown; fail closed: ${lockPath}`,
        { cause: error },
      )
    }
    try {
      process.kill(ownerPid, 0)
    } catch (error) {
      if (isErrnoException(error) && error.code === "ESRCH") {
        // A well-formed lock whose owner is confirmed absent is preserved as stale.
        renameSync(lockPath, `${lockPath}.stale-${Date.now()}`)
      } else {
        throw new Error(
          `ALS-021 campaign lock owner could not be checked; fail closed: ${lockPath}`,
          { cause: error },
        )
      }
    }
    if (existsSync(lockPath)) {
      throw new Error(`ALS-021 campaign is already running: ${lockPath}`)
    }
  }
  const descriptor = openSync(lockPath, "wx")
  writeFileSync(
    descriptor,
    `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2)}\n`,
  )
  closeSync(descriptor)
  let released = false
  return () => {
    if (released) return
    released = true
    try {
      unlinkSync(lockPath)
    } catch {
      // A hard-stop recovery may already have preserved or removed the lock.
    }
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string"
}

function hashText(value: string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return { value }
}
