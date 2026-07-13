import { createHash } from "node:crypto"
import { mkdir, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { generateText, NoObjectGeneratedError, Output } from "ai"
import { z } from "zod"
import {
  benchmarkEvidenceCases,
  benchmarkSelectionScenarios,
  buildEvidenceInterpreterInput,
  buildSelectorInput,
  evidenceCandidateSchema,
  fixedQueueSelect,
  scoreEvidenceCandidates,
  scoreSelections,
  studentResponseSchema,
  validateEvidenceCandidateAuthority,
  validateExactBatchIds,
  validateRenderedStudentResponse,
  type EvidenceCandidate,
  type EvidenceCase,
  type EvidenceInterpreterVariant,
  type MaterialSource,
  type SelectionScenario,
  type SelectorVariant,
  type StudentResponse,
} from "./simulated-student-benchmark"
import {
  assertFormalTrial,
  assertFrozenBenchmarkContract,
  assertFrozenExecutionFiles,
  assertFrozenMaterialHashes,
  currentFrozenContractSha256,
  evidenceInterpreterSystemPrompt,
  frozenBenchmarkV1,
  frozenMaterialHashesForSource,
  simulatedStudentSystemPrompt,
  taskSelectorSystemPrompt,
} from "./simulated-student-freeze"
import { evaluateFormalTrial, type FormalTrialMetrics } from "./simulated-student-verdict"
import {
  BudgetTracker,
  deepSeekChatModel,
  deepSeekModelLabel,
  deepSeekRunConfig,
  estimateUpperBoundUsd,
  formatError,
  loadApiKey,
  persistLocalRun,
  summarizeUsage,
  type RunConfig,
  type UsageSummary,
} from "./lab"

type Phase = "pilot" | "main"

const MAX_STUDENT_OUTPUT_TOKENS = frozenBenchmarkV1.parameters.studentMaxOutputTokens
const MAX_EVIDENCE_OUTPUT_TOKENS = frozenBenchmarkV1.parameters.evidenceMaxOutputTokens
const MAX_SELECTION_OUTPUT_TOKENS = frozenBenchmarkV1.parameters.selectionMaxOutputTokens

const studentBatchSchema = (count: number) =>
  z.object({ responses: z.array(studentResponseSchema).length(count) })

const evidenceBatchSchema = (count: number) =>
  z.object({ candidates: z.array(evidenceCandidateSchema).length(count) })

const selectionRecordSchema = z.object({
  scenarioId: z.string().min(1).max(100),
  actionId: z.string().min(1).max(100),
  basis: z.string().min(1).max(600),
})

const selectionBatchSchema = (count: number) =>
  z.object({ selections: z.array(selectionRecordSchema).length(count) })

type ObservedMaterial = {
  source: MaterialSource
  taskText: string
  solutionText: string
  taskSha256: string
  solutionSha256: string
  combinedSha256: string
  taskRetrieval: "network" | "cache"
  solutionRetrieval: "network" | "cache"
}

type ModelJsonResult = {
  output: unknown
  text: string
  usage: UsageSummary
  estimatedUpperBoundUsd: number
  elapsedMs: number
  finishReasons: string[]
  fatalError: string | null
  fatalCategory: "structured_output_failure" | "infrastructure_failure" | null
}

function emptyUsage(): UsageSummary {
  return {
    inputTokens: 0,
    cacheReadTokens: 0,
    noCacheTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  }
}

function mergeUsage(values: UsageSummary[]) {
  return values.reduce<UsageSummary>(
    (sum, value) => ({
      inputTokens: sum.inputTokens + value.inputTokens,
      cacheReadTokens: sum.cacheReadTokens + value.cacheReadTokens,
      noCacheTokens: sum.noCacheTokens + value.noCacheTokens,
      outputTokens: sum.outputTokens + value.outputTokens,
      reasoningTokens: sum.reasoningTokens + value.reasoningTokens,
      totalTokens: sum.totalTokens + value.totalTokens,
    }),
    emptyUsage(),
  )
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function cachedSourceText(url: string) {
  const directoryUrl = new URL("./.generated/simulated-student-materials/", import.meta.url)
  await mkdir(fileURLToPath(directoryUrl), { recursive: true })
  const filename = `${sha256(url)}.source`
  const file = Bun.file(new URL(filename, directoryUrl))
  return { file, exists: await file.exists() }
}

async function fetchText(
  url: string,
  expectedSha256: string | null,
): Promise<{ text: string; retrieval: "network" | "cache" }> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "repa-simulated-student-lab/0.1" },
        signal: AbortSignal.timeout(frozenBenchmarkV1.parameters.fetchTimeoutMs),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
      const text = await response.text()
      if (expectedSha256 && sha256(text) !== expectedSha256) {
        throw new Error(`Frozen source bytes changed for ${url}`)
      }
      const cache = await cachedSourceText(url)
      await Bun.write(cache.file, text)
      return { text, retrieval: "network" }
    } catch (error) {
      lastError = error
      if (attempt < 3) await Bun.sleep(250 * attempt)
    }
  }
  const cache = await cachedSourceText(url)
  if (cache.exists) {
    const text = await cache.file.text()
    if (expectedSha256 && sha256(text) !== expectedSha256) {
      throw new Error(`Cached frozen source bytes do not match ${url}`)
    }
    return { text, retrieval: "cache" }
  }
  throw lastError
}

async function fetchObservedMaterials(cases: EvidenceCase[]) {
  const sources = new Map(cases.map((fixture) => [fixture.source.ref, fixture.source]))
  const observed = new Map<string, ObservedMaterial>()
  for (const source of sources.values()) {
    const expected = frozenMaterialHashesForSource(source.ref)
    const task = await fetchText(source.url, expected?.taskSha256 ?? null)
    const solution = source.solutionUrl === source.url
      ? task
      : await fetchText(source.solutionUrl, expected?.solutionSha256 ?? null)
    const taskText = task.text
    const solutionText = solution.text
    observed.set(source.ref, {
      source,
      taskText,
      solutionText,
      taskSha256: sha256(taskText),
      solutionSha256: sha256(solutionText),
      combinedSha256: sha256(`${taskText}\u0000${solutionText}`),
      taskRetrieval: task.retrieval,
      solutionRetrieval: solution.retrieval,
    })
  }
  return observed
}

function boundedMaterial(value: ObservedMaterial) {
  const task = value.taskText.slice(0, 3_500)
  const solution = value.solutionText.slice(0, 3_500)
  return `Observed task bytes (${value.source.url}):\n${task}\n\nObserved solution/rubric bytes (${value.source.solutionUrl}):\n${solution}`
}

async function runModelJson(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
  name: string
  system: string
  prompt: string
  maxOutputTokens: number
}): Promise<ModelJsonResult> {
  input.budget.assertCanStart(1)
  const startedAt = performance.now()
  const outcome = await generateText({
    model: deepSeekChatModel(input.apiKey, input.config),
    system: input.system,
    prompt: input.prompt,
    output: Output.json({ name: input.name }),
    abortSignal: AbortSignal.timeout(frozenBenchmarkV1.parameters.modelTimeoutMs),
    temperature: frozenBenchmarkV1.parameters.temperature,
    maxOutputTokens: input.maxOutputTokens,
    maxRetries: frozenBenchmarkV1.parameters.maxRetries,
  })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({ ok: false as const, error }))

  if (!outcome.ok) {
    const structuredError = NoObjectGeneratedError.isInstance(outcome.error) ? outcome.error : null
    const usage = structuredError ? summarizeUsage(structuredError.usage) : emptyUsage()
    const estimatedUpperBoundUsd = structuredError
      ? estimateUpperBoundUsd(input.config.model, usage)
      : 0
    const finishReasons = structuredError?.finishReason
      ? [structuredError.finishReason]
      : ["infrastructure-failure"]
    input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })
    return {
      output: null,
      text: structuredError?.text ?? "",
      usage,
      estimatedUpperBoundUsd,
      elapsedMs: Math.round(performance.now() - startedAt),
      finishReasons,
      fatalError: formatError(outcome.error).replaceAll(input.apiKey, "[REDACTED]"),
      fatalCategory: structuredError
        ? "structured_output_failure"
        : "infrastructure_failure",
    }
  }

  const usage = summarizeUsage(outcome.result.totalUsage)
  const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
  const finishReasons = outcome.result.steps.map((step) => step.finishReason)
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })
  return {
    output: outcome.result.output,
    text: outcome.result.text,
    usage,
    estimatedUpperBoundUsd,
    elapsedMs: Math.round(performance.now() - startedAt),
    finishReasons,
    fatalError: null,
    fatalCategory: null,
  }
}

async function renderStudents(input: {
  apiKey: string
  studentConfig: RunConfig
  budget: BudgetTracker
  cases: EvidenceCase[]
}) {
  const calls: ModelJsonResult[] = []
  const responses: StudentResponse[] = []
  const schemaErrors: Array<{ caseId: string; error: string }> = []
  const identityFailures: Array<{ caseId: string; failures: string[] }> = []
  for (const fixture of input.cases) {
    const call = await runModelJson({
      apiKey: input.apiKey,
      config: input.studentConfig,
      budget: input.budget,
      name: `simulated_student_${fixture.id}`,
      system: simulatedStudentSystemPrompt,
      prompt: JSON.stringify(
        [
          {
            caseId: fixture.id,
            task: fixture.prompt,
            observedAssistance: fixture.observedAssistance,
            learnerProfile: fixture.learnerProfile,
            responseContract: fixture.responseContract,
          },
        ],
        null,
        2,
      ),
      maxOutputTokens: MAX_STUDENT_OUTPUT_TOKENS,
    })
    calls.push(call)
    const parsed = studentBatchSchema(1).safeParse(call.output)
    if (!parsed.success) {
      schemaErrors.push({ caseId: fixture.id, error: parsed.error.message })
      continue
    }
    const failures = validateExactBatchIds(
      [fixture.id],
      parsed.data.responses.map((response) => response.caseId),
    )
    if (failures.length > 0) identityFailures.push({ caseId: fixture.id, failures })
    responses.push(...parsed.data.responses)
  }
  const byId = new Map(responses.map((response) => [response.caseId, response]))
  const validations = input.cases.map((fixture) => {
    const response = byId.get(fixture.id)
    return {
      caseId: fixture.id,
      response: response ?? null,
      failures: response
        ? validateRenderedStudentResponse(fixture, response)
        : ["student response is missing"],
    }
  })
  return {
    calls,
    schemaErrors,
    identityFailures,
    responses,
    validations,
    validResponses: validations
      .filter((item) => item.response !== null && item.failures.length === 0)
      .map((item) => item.response as StudentResponse),
  }
}

async function interpretEvidence(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
  variant: EvidenceInterpreterVariant
  cases: EvidenceCase[]
  responses: StudentResponse[]
  materials: Map<string, ObservedMaterial>
}) {
  const responseById = new Map(input.responses.map((response) => [response.caseId, response]))
  const activeCases = input.cases.filter((fixture) => responseById.has(fixture.id))
  const calls: ModelJsonResult[] = []
  const candidates: EvidenceCandidate[] = []
  const schemaErrors: Array<{ caseId: string; error: string }> = []
  const identityFailures: Array<{ caseId: string; failures: string[] }> = []
  for (const fixture of activeCases) {
    const material = input.materials.get(fixture.source.ref)
    if (!material) throw new Error(`Missing observed material for ${fixture.source.ref}`)
    const payload = buildEvidenceInterpreterInput(
      fixture,
      responseById.get(fixture.id)!,
      input.variant,
      boundedMaterial(material),
    )
    const call = await runModelJson({
      apiKey: input.apiKey,
      config: input.config,
      budget: input.budget,
      name: `evidence_${input.variant}_${fixture.id}`,
      system: evidenceInterpreterSystemPrompt,
      prompt: JSON.stringify([payload], null, 2),
      maxOutputTokens: MAX_EVIDENCE_OUTPUT_TOKENS,
    })
    calls.push(call)
    const parsed = evidenceBatchSchema(1).safeParse(call.output)
    if (!parsed.success) {
      schemaErrors.push({ caseId: fixture.id, error: parsed.error.message })
      continue
    }
    const failures = validateExactBatchIds(
      [fixture.id],
      parsed.data.candidates.map((candidate) => candidate.caseId),
    )
    if (failures.length > 0) identityFailures.push({ caseId: fixture.id, failures })
    candidates.push(...parsed.data.candidates)
  }
  const candidateById = new Map(candidates.map((candidate) => [candidate.caseId, candidate]))
  const authority = activeCases.map((fixture) => {
    const candidate = candidateById.get(fixture.id)
    return {
      caseId: fixture.id,
      candidate: candidate ?? null,
      failures: candidate
        ? validateEvidenceCandidateAuthority(fixture, candidate)
        : ["evidence candidate is missing"],
    }
  })
  const admitted = authority
    .filter((item) => item.candidate !== null && item.failures.length === 0)
    .map((item) => item.candidate as EvidenceCandidate)
  return {
    variant: input.variant,
    calls,
    schemaErrors,
    identityFailures,
    candidates,
    authority,
    admitted,
    score: scoreEvidenceCandidates(candidates, input.cases),
  }
}

async function selectActions(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
  variant: SelectorVariant
  scenarios: SelectionScenario[]
  inferredEvidence: EvidenceCandidate[]
  studentResponses: StudentResponse[]
}) {
  const evidenceById = new Map(input.inferredEvidence.map((candidate) => [candidate.caseId, candidate]))
  const responseById = new Map(input.studentResponses.map((response) => [response.caseId, response.answer]))
  const calls: ModelJsonResult[] = []
  const selections: Array<z.infer<typeof selectionRecordSchema>> = []
  const schemaErrors: Array<{ scenarioId: string; error: string }> = []
  const identityFailures: Array<{ scenarioId: string; failures: string[] }> = []
  for (const scenario of input.scenarios) {
    const linked = scenario.evidenceCaseId ? evidenceById.get(scenario.evidenceCaseId) : undefined
    let payload = buildSelectorInput(
      scenario,
      input.variant,
      linked,
      scenario.evidenceCaseId ? responseById.get(scenario.evidenceCaseId) : undefined,
    )
    if (input.variant === "inferred_state_model" && scenario.evidenceCaseId && !linked) {
      payload = {
        ...payload,
        learnerProjection: "No admissible evidence interpretation is available for the linked attempt.",
        obligations: [],
      }
    }
    const call = await runModelJson({
      apiKey: input.apiKey,
      config: input.config,
      budget: input.budget,
      name: `selection_${input.variant}_${scenario.id}`,
      system: taskSelectorSystemPrompt,
      prompt: JSON.stringify([payload], null, 2),
      maxOutputTokens: MAX_SELECTION_OUTPUT_TOKENS,
    })
    calls.push(call)
    const parsed = selectionBatchSchema(1).safeParse(call.output)
    if (!parsed.success) {
      schemaErrors.push({ scenarioId: scenario.id, error: parsed.error.message })
      continue
    }
    const failures = validateExactBatchIds(
      [scenario.id],
      parsed.data.selections.map((selection) => selection.scenarioId),
    )
    if (failures.length > 0) identityFailures.push({ scenarioId: scenario.id, failures })
    selections.push(...parsed.data.selections)
  }
  const scenarioById = new Map(input.scenarios.map((scenario) => [scenario.id, scenario]))
  const invalidSelections = selections.flatMap((selection) => {
    const scenario = scenarioById.get(selection.scenarioId)
    if (!scenario) return [{ scenarioId: selection.scenarioId, reason: "unknown scenario" }]
    if (!scenario.candidates.some((candidate) => candidate.id === selection.actionId)) {
      return [{ scenarioId: selection.scenarioId, reason: "action is not a supplied candidate" }]
    }
    return []
  })
  return {
    variant: input.variant,
    calls,
    schemaErrors,
    identityFailures,
    selections,
    invalidSelections,
    score: scoreSelections(selections, input.scenarios),
    evidenceLinkedScore: scoreSelections(
      selections,
      input.scenarios.filter((scenario) => scenario.evidenceCaseId !== null),
    ),
    handAuthoredPolicyScore: scoreSelections(
      selections,
      input.scenarios.filter((scenario) => scenario.evidenceCaseId === null),
    ),
  }
}

function materialManifest(materials: Map<string, ObservedMaterial>) {
  return [...materials.values()].map((material) => ({
    sourceRef: material.source.ref,
    taskUrl: material.source.url,
    solutionUrl: material.source.solutionUrl,
    publicPage: material.source.publicPage,
    attribution: material.source.attribution,
    license: material.source.license,
    taskBytes: Buffer.byteLength(material.taskText),
    solutionBytes: Buffer.byteLength(material.solutionText),
    taskSha256: material.taskSha256,
    solutionSha256: material.solutionSha256,
    combinedSha256: material.combinedSha256,
    taskRetrieval: material.taskRetrieval,
    solutionRetrieval: material.solutionRetrieval,
  }))
}

async function assertFormalTrialUnused(trial: 1 | 2 | 3) {
  const directoryUrl = new URL("./.runs/", import.meta.url)
  let names: string[]
  try {
    names = await readdir(fileURLToPath(directoryUrl))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  for (const name of names.filter(
    (value) => value.includes("simulated-student-benchmark-main") && value.endsWith(".json"),
  )) {
    const envelope = (await Bun.file(new URL(name, directoryUrl)).json()) as {
      report?: { formalTrial?: unknown }
    }
    if (envelope.report?.formalTrial === trial) {
      throw new Error(
        `Formal benchmark trial ${trial} already has a persisted result (${name}); selective reruns are forbidden`,
      )
    }
  }
}

function assertPhase(value: string | undefined): Phase {
  if (!value || value === "pilot") return "pilot"
  if (value === "main") return "main"
  throw new Error(`Unknown benchmark phase: ${value}`)
}

async function run(phase: Phase, tutorConfig: RunConfig) {
  if (phase === "main" && process.env.REPA_BENCHMARK_FROZEN !== "1") {
    throw new Error("Main benchmark is locked until the pilot note and frozen manifest are committed")
  }

  const formalTrial = phase === "main" ? assertFormalTrial(process.env.REPA_BENCHMARK_TRIAL) : null
  if (phase === "main") {
    assertFrozenBenchmarkContract()
    await assertFrozenExecutionFiles()
    await assertFormalTrialUnused(formalTrial!)
    if (
      tutorConfig.model !== frozenBenchmarkV1.models.tutorAndSelector.model ||
      tutorConfig.thinking !== frozenBenchmarkV1.models.tutorAndSelector.thinking
    ) {
      throw new Error("Main benchmark tutor/selector model does not match frozen benchmark v1")
    }
  }

  const apiKey = await loadApiKey()
  const studentConfig = deepSeekRunConfig("deepseek-v4-flash")
  const budget = new BudgetTracker({ maxApiSteps: frozenBenchmarkV1.parameters.maxApiSteps })
  const evidenceCases = benchmarkEvidenceCases.filter((fixture) => fixture.phase === phase)
  const selectionScenarios = benchmarkSelectionScenarios.filter((scenario) => scenario.phase === phase)
  const materials = await fetchObservedMaterials(evidenceCases)
  if (phase === "main") assertFrozenMaterialHashes(materialManifest(materials))

  const students = await renderStudents({
    apiKey,
    studentConfig,
    budget,
    cases: evidenceCases,
  })

  const evidenceResults = []
  for (const variant of ["answer_only", "declared_contract"] as const) {
    evidenceResults.push(
      await interpretEvidence({
        apiKey,
        config: tutorConfig,
        budget,
        variant,
        cases: evidenceCases,
        responses: students.validResponses,
        materials,
      }),
    )
  }
  const declared = evidenceResults.find((result) => result.variant === "declared_contract")!

  const selectionResults = []
  for (const variant of ["stateless_model", "oracle_state_model", "inferred_state_model"] as const) {
    selectionResults.push(
      await selectActions({
        apiKey,
        config: tutorConfig,
        budget,
        variant,
        scenarios: selectionScenarios,
        inferredEvidence: declared.admitted,
        studentResponses: students.validResponses,
      }),
    )
  }

  const fixedPredictions = selectionScenarios.map((scenario) => ({
    scenarioId: scenario.id,
    actionId: fixedQueueSelect(scenario),
  }))
  const requestLeakChecks = {
    evidenceInputsHideLearnerProfile: evidenceCases.every((fixture) => {
      const response = students.validResponses.find((item) => item.caseId === fixture.id)
      if (!response) return false
      return !JSON.stringify(
        buildEvidenceInterpreterInput(
          fixture,
          response,
          "declared_contract",
          boundedMaterial(materials.get(fixture.source.ref)!),
        ),
      ).includes(fixture.learnerProfile)
    }),
    inferredSelectorHidesOracleFields: selectionScenarios.every(
      (scenario) =>
        !JSON.stringify(
          buildSelectorInput(
            scenario,
            "inferred_state_model",
            scenario.evidenceCaseId
              ? declared.admitted.find((candidate) => candidate.caseId === scenario.evidenceCaseId)
              : undefined,
          ),
        ).includes("expectedActionId") &&
        !JSON.stringify(
          buildSelectorInput(
            scenario,
            "inferred_state_model",
            scenario.evidenceCaseId
              ? declared.admitted.find((candidate) => candidate.caseId === scenario.evidenceCaseId)
              : undefined,
          ),
        ).includes("forbiddenActionIds"),
    ),
    inferredSelectorHidesHiddenLearnerState: selectionScenarios.every(
      (scenario) =>
        !JSON.stringify(
          buildSelectorInput(
            scenario,
            "inferred_state_model",
            scenario.evidenceCaseId
              ? declared.admitted.find((candidate) => candidate.caseId === scenario.evidenceCaseId)
              : undefined,
          ),
        ).includes(scenario.hiddenLearnerState),
    ),
    statelessSelectorHidesProjection: selectionScenarios.every((scenario) => {
      const serialized = JSON.stringify(buildSelectorInput(scenario, "stateless_model"))
      return !serialized.includes(scenario.hiddenLearnerState) && !serialized.includes(scenario.inferredProjection)
    }),
  }

  const calls = [
    ...students.calls,
    ...evidenceResults.flatMap((result) => result.calls),
    ...selectionResults.flatMap((result) => result.calls),
  ]
  const modelFailureCategories = calls.reduce<Record<string, number>>((counts, call) => {
    if (call.fatalCategory) counts[call.fatalCategory] = (counts[call.fatalCategory] ?? 0) + 1
    return counts
  }, {})
  const hardGateDiagnostics = {
    requestLeakChecks,
    invalidStudentStimuli: students.validations.filter((item) => item.failures.length > 0).length,
    studentSchemaErrors: students.schemaErrors.length,
    studentIdentityFailures: students.identityFailures.length,
    declaredAuthorityRejections: declared.authority.filter((item) => item.failures.length > 0).length,
    admittedAuthorityViolations: declared.admitted.filter((candidate) => {
      const fixture = evidenceCases.find((item) => item.id === candidate.caseId)
      return !fixture || validateEvidenceCandidateAuthority(fixture, candidate).length > 0
    }).length,
    declaredSchemaErrors: declared.schemaErrors.length,
    declaredIdentityFailures: declared.identityFailures.length,
    selectorSchemaErrors: selectionResults.reduce((sum, result) => sum + result.schemaErrors.length, 0),
    selectorIdentityFailures: selectionResults.reduce(
      (sum, result) => sum + result.identityFailures.length,
      0,
    ),
    invalidSelectorActions: selectionResults.reduce(
      (sum, result) => sum + result.invalidSelections.length,
      0,
    ),
    modelFailureCategories,
    curriculumWriteSurfaceExposed: false,
    sourceCount: materials.size,
    logicalModelCalls: calls.length,
  }
  const hardGateFailures: string[] = []
  for (const [name, passed] of Object.entries(requestLeakChecks)) {
    if (!passed) hardGateFailures.push(`request leak check failed: ${name}`)
  }
  if (hardGateDiagnostics.admittedAuthorityViolations > 0) {
    hardGateFailures.push("invalid evidence passed domain admission")
  }
  if (declared.score.assistanceAccuracy !== 1) hardGateFailures.push("assistance was not preserved")
  if (phase === "main" && materials.size !== Object.keys(frozenBenchmarkV1.materials).length) {
    hardGateFailures.push("frozen material source count mismatch")
  }
  if (phase === "main" && calls.length !== frozenBenchmarkV1.parameters.apiCallsPerTrial) {
    hardGateFailures.push("logical model call count does not match frozen isolation plan")
  }
  const stateless = selectionResults.find((result) => result.variant === "stateless_model")!
  const oracle = selectionResults.find((result) => result.variant === "oracle_state_model")!
  const inferred = selectionResults.find((result) => result.variant === "inferred_state_model")!
  if (oracle.score.hardInvariantViolationRate > 0) {
    hardGateFailures.push("oracle selector chose a forbidden action")
  }
  if (inferred.score.hardInvariantViolationRate > 0) {
    hardGateFailures.push("inferred selector chose a forbidden action")
  }
  const correctCount = (accuracy: number, total: number) => Math.round(accuracy * total)
  const trialMetrics: FormalTrialMetrics | null = phase === "main"
    ? {
        trial: formalTrial!,
        hardGateFailures,
        evidence: {
          answerOnlyExactCorrect: correctCount(evidenceResults[0]!.score.exactRecordAccuracy, evidenceCases.length),
          declaredOutcomeCorrect: correctCount(declared.score.outcomeAccuracy, evidenceCases.length),
          declaredAssistanceCorrect: correctCount(declared.score.assistanceAccuracy, evidenceCases.length),
          declaredClaimSetCorrect: correctCount(declared.score.claimSetAccuracy, evidenceCases.length),
          declaredExactCorrect: correctCount(declared.score.exactRecordAccuracy, evidenceCases.length),
          falseIndependentClaims: declared.score.falseIndependentEvidenceCount,
          correctIndependentClaims: declared.score.correctIndependentSuccessClaims,
        },
        selection: {
          fixedCorrect: correctCount(
            scoreSelections(fixedPredictions, selectionScenarios).exactActionAccuracy,
            selectionScenarios.length,
          ),
          statelessCorrect: correctCount(stateless.score.exactActionAccuracy, selectionScenarios.length),
          oracleCorrect: correctCount(oracle.score.exactActionAccuracy, selectionScenarios.length),
          oracleHardViolations: correctCount(
            oracle.score.hardInvariantViolationRate,
            selectionScenarios.length,
          ),
          inferredCorrect: correctCount(inferred.score.exactActionAccuracy, selectionScenarios.length),
          inferredHardViolations: correctCount(
            inferred.score.hardInvariantViolationRate,
            selectionScenarios.length,
          ),
          inferredEvidenceLinkedCorrect: correctCount(
            inferred.evidenceLinkedScore.exactActionAccuracy,
            inferred.evidenceLinkedScore.scenarios,
          ),
        },
      }
    : null
  const trialAssessment = trialMetrics ? evaluateFormalTrial(trialMetrics) : null
  const report = {
    suite: "simulated-student-benchmark",
    benchmarkVersion: phase === "pilot" ? "pilot-0" : "v1",
    phase,
    formalTrial,
    frozenContractSha256: phase === "main" ? currentFrozenContractSha256 : null,
    models: {
      student: deepSeekModelLabel(studentConfig),
      tutorAndSelector: deepSeekModelLabel(tutorConfig),
    },
    experiment: {
      realMaterial: true,
      materialDomain: "javascript-function-values-this-and-binding",
      evidenceCases: evidenceCases.map((fixture) => fixture.id),
      selectionScenarios: selectionScenarios.map((scenario) => scenario.id),
      evidenceVariants: ["answer_only", "declared_contract"],
      selectionVariants: ["fixed_queue", "stateless_model", "oracle_state_model", "inferred_state_model"],
      durableLearningWritesExposed: false,
      humanLearningOutcomeClaim: false,
    },
    materialManifest: materialManifest(materials),
    students,
    evidenceResults,
    fixedQueue: {
      predictions: fixedPredictions,
      score: scoreSelections(fixedPredictions, selectionScenarios),
    },
    selectionResults,
    hardGateDiagnostics,
    trialMetrics,
    trialAssessment,
    usage: mergeUsage(calls.map((call) => call.usage)),
    elapsedMs: calls.reduce((sum, call) => sum + call.elapsedMs, 0),
    estimatedUpperBoundUsd: Number(
      calls.reduce((sum, call) => sum + call.estimatedUpperBoundUsd, 0).toFixed(8),
    ),
    budget: {
      apiSteps: budget.apiSteps,
      estimatedUpperBoundUsd: Number(budget.spentUsd.toFixed(8)),
      configuredMaxUsd: budget.maxUsd,
    },
  }
  const rawTracePath = await persistLocalRun({ suite: `${report.suite}-${phase}`, config: tutorConfig, report })
  return { rawTracePath, ...report }
}

const phase = assertPhase(process.argv[2])
const config = deepSeekRunConfig(process.argv[3])
const report = await run(phase, config)
if (process.env.REPA_LAB_SUMMARY_ONLY === "1") {
  const answerOnly = report.evidenceResults.find((result) => result.variant === "answer_only")!
  const declared = report.evidenceResults.find((result) => result.variant === "declared_contract")!
  const selection = Object.fromEntries(
    report.selectionResults.map((result) => [result.variant, result.score]),
  )
  console.log(
    JSON.stringify(
      {
        rawTracePath: report.rawTracePath,
        benchmarkVersion: report.benchmarkVersion,
        formalTrial: report.formalTrial,
        hardGateDiagnostics: report.hardGateDiagnostics,
        evidence: { answerOnly: answerOnly.score, declared: declared.score },
        selection: { fixedQueue: report.fixedQueue.score, ...selection },
        usage: report.usage,
        elapsedMs: report.elapsedMs,
        estimatedUpperBoundUsd: report.estimatedUpperBoundUsd,
      },
      null,
      2,
    ),
  )
} else {
  console.log(JSON.stringify(report, null, 2))
}
