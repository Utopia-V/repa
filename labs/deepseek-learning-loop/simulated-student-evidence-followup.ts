import { generateText, NoObjectGeneratedError, Output } from "ai"
import { readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import {
  benchmarkEvidenceCases,
  errorTags,
  studentResponseSchema,
  validateEvidenceCandidateAuthority,
  validateExactBatchIds,
  type StudentResponse,
} from "./simulated-student-benchmark"
import {
  assertEvidenceFollowupContractFrozen,
  assertEvidenceFollowupExecutionFrozen,
  criterionDefinitionsByTaskId,
  criterionJudgmentSchema,
  currentEvidenceFollowupContractSha256,
  deriveEvidenceFromCriteria,
  followupPromptOrders,
  followupSystemPrompts,
  scoreFollowupVariants,
  validateCriterionJudgmentAuthority,
  type CriterionJudgment,
  type FollowupRecord,
  type PromptOrder,
} from "./simulated-student-evidence-followup-contract"
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

type FollowupCall = {
  promptOrder: PromptOrder
  trial: number
  caseId: string
  output: unknown
  text: string
  usage: UsageSummary
  estimatedUpperBoundUsd: number
  elapsedMs: number
  finishReasons: string[]
  failureCategory: "structured_output_failure" | "infrastructure_failure" | null
  failure: string | null
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

function buildPrompt(
  order: PromptOrder,
  fixture: (typeof benchmarkEvidenceCases)[number],
  response: StudentResponse,
) {
  const criteria = criterionDefinitionsByTaskId[fixture.taskId]
  if (!criteria) throw new Error(`No frozen criteria for ${fixture.taskId}`)
  const identity = { caseId: fixture.id, sourceRef: fixture.source.ref }
  const rubric = {
    task: fixture.prompt,
    rubric: fixture.rubric,
    learnerAnswer: response.answer,
  }
  const criterionContract = {
    criteria: [
      { criterionId: "claim", description: criteria.claim },
      { criterionId: "justification", description: criteria.justification },
    ],
    allowedErrorTags: errorTags,
  }
  return order === "criteria_first"
    ? { ...identity, ...criterionContract, ...rubric }
    : { ...identity, ...rubric, ...criterionContract }
}

async function runJudgment(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
  promptOrder: PromptOrder
  trial: number
  fixture: (typeof benchmarkEvidenceCases)[number]
  response: StudentResponse
}) : Promise<FollowupCall> {
  input.budget.assertCanStart(1)
  const startedAt = performance.now()
  const outcome = await generateText({
    model: deepSeekChatModel(input.apiKey, input.config),
    system: followupSystemPrompts[input.promptOrder],
    prompt: JSON.stringify(buildPrompt(input.promptOrder, input.fixture, input.response), null, 2),
    output: Output.json({ name: `criteria_${input.promptOrder}_${input.trial}_${input.fixture.id}` }),
    temperature: 0,
    maxOutputTokens: 1_200,
    maxRetries: 3,
    abortSignal: AbortSignal.timeout(120_000),
  })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({ ok: false as const, error }))

  if (!outcome.ok) {
    const structured = NoObjectGeneratedError.isInstance(outcome.error) ? outcome.error : null
    const usage = structured ? summarizeUsage(structured.usage) : emptyUsage()
    const estimatedUpperBoundUsd = structured ? estimateUpperBoundUsd(input.config.model, usage) : 0
    const finishReasons = structured?.finishReason
      ? [structured.finishReason]
      : ["infrastructure-failure"]
    input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })
    return {
      promptOrder: input.promptOrder,
      trial: input.trial,
      caseId: input.fixture.id,
      output: null,
      text: structured?.text ?? "",
      usage,
      estimatedUpperBoundUsd,
      elapsedMs: Math.round(performance.now() - startedAt),
      finishReasons,
      failureCategory: structured ? "structured_output_failure" : "infrastructure_failure",
      failure: formatError(outcome.error).replaceAll(input.apiKey, "[REDACTED]"),
    }
  }

  const usage = summarizeUsage(outcome.result.totalUsage)
  const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
  const finishReasons = outcome.result.steps.map((step) => step.finishReason)
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })
  return {
    promptOrder: input.promptOrder,
    trial: input.trial,
    caseId: input.fixture.id,
    output: outcome.result.output,
    text: outcome.result.text,
    usage,
    estimatedUpperBoundUsd,
    elapsedMs: Math.round(performance.now() - startedAt),
    finishReasons,
    failureCategory: null,
    failure: null,
  }
}

assertEvidenceFollowupContractFrozen()
const manifest = await assertEvidenceFollowupExecutionFrozen()
if (
  manifest.model.model !== "deepseek-v4-flash" ||
  manifest.model.thinking !== "disabled" ||
  manifest.model.temperature !== 0
) {
  throw new Error("Evidence follow-up model profile differs from the frozen manifest")
}
const runDirectoryUrl = new URL("./.runs/", import.meta.url)
const existingFollowups = (await readdir(fileURLToPath(runDirectoryUrl))).filter(
  (name) => name.includes("simulated-student-evidence-followup-v1") && name.endsWith(".json"),
)
if (existingFollowups.length > 0) {
  throw new Error(
    `The single permitted evidence follow-up already has an artifact: ${existingFollowups.join(", ")}`,
  )
}

const mainCases = benchmarkEvidenceCases.filter((fixture) => fixture.phase === "main")
const fixtureById = new Map(mainCases.map((fixture) => [fixture.id, fixture]))
const inputRecords: Array<{ trial: number; fixture: (typeof mainCases)[number]; response: StudentResponse }> = []
for (const artifact of manifest.inputArtifacts) {
  const envelope = (await Bun.file(new URL(artifact.path, import.meta.url)).json()) as {
    report?: { formalTrial?: unknown; students?: { responses?: unknown } }
  }
  if (envelope.report?.formalTrial !== artifact.trial) {
    throw new Error(`Frozen input artifact has the wrong formal trial: ${artifact.path}`)
  }
  const parsed = studentResponseSchema.array().safeParse(envelope.report.students?.responses)
  if (!parsed.success) throw new Error(`Frozen student responses are invalid: ${artifact.path}`)
  const ids = parsed.data.map((response) => response.caseId)
  const identityFailures = validateExactBatchIds(mainCases.map((fixture) => fixture.id), ids)
  if (identityFailures.length > 0) {
    throw new Error(`Frozen response identity failure: ${identityFailures.join("; ")}`)
  }
  for (const response of parsed.data) {
    const fixture = fixtureById.get(response.caseId)
    if (!fixture) throw new Error(`Unknown frozen fixture ${response.caseId}`)
    inputRecords.push({ trial: artifact.trial, fixture, response })
  }
}

const leakDiagnostics = inputRecords.every(({ fixture, response }) => {
  const payload = JSON.stringify(buildPrompt("criteria_first", fixture, response))
  return (
    !payload.includes("expectedCandidate") &&
    !payload.includes("learnerProfile") &&
    !payload.includes(fixture.learnerProfile)
  )
})
if (!leakDiagnostics) throw new Error("Follow-up model input leaks frozen hidden truth")

const apiKey = await loadApiKey()
const config = deepSeekRunConfig("deepseek-v4-flash")
const budget = new BudgetTracker({ maxApiSteps: 60 })
const calls: FollowupCall[] = []
const records: Record<PromptOrder, FollowupRecord[]> = {
  criteria_first: [],
  rubric_first: [],
}
const invalidOutputs: Array<{
  promptOrder: PromptOrder
  trial: number
  caseId: string
  failures: string[]
}> = []

for (const promptOrder of followupPromptOrders) {
  for (const input of inputRecords) {
    const call = await runJudgment({ apiKey, config, budget, promptOrder, ...input })
    calls.push(call)
    const parsed = criterionJudgmentSchema.safeParse(call.output)
    if (!parsed.success) {
      invalidOutputs.push({
        promptOrder,
        trial: input.trial,
        caseId: input.fixture.id,
        failures: [parsed.error.message],
      })
      continue
    }
    const criterionFailures = validateCriterionJudgmentAuthority(input.fixture, parsed.data)
    if (criterionFailures.length > 0) {
      invalidOutputs.push({
        promptOrder,
        trial: input.trial,
        caseId: input.fixture.id,
        failures: criterionFailures,
      })
      continue
    }
    const candidate = deriveEvidenceFromCriteria(input.fixture, parsed.data as CriterionJudgment)
    const authorityFailures = validateEvidenceCandidateAuthority(input.fixture, candidate)
    records[promptOrder].push({
      trial: input.trial,
      caseId: input.fixture.id,
      candidate,
      authorityFailures,
    })
  }
}

const scores = scoreFollowupVariants(records)
const usage = mergeUsage(calls.map((call) => call.usage))
const report = {
  suite: "simulated-student-evidence-criteria-followup",
  version: "v1",
  contractSha256: currentEvidenceFollowupContractSha256,
  model: deepSeekModelLabel(config),
  measurementRevision: true,
  benchmarkRescueClaim: false,
  inputArtifacts: manifest.inputArtifacts,
  inputRecords: inputRecords.map((input) => ({
    trial: input.trial,
    caseId: input.fixture.id,
    response: input.response,
  })),
  leakDiagnostics: { hiddenTruthAbsent: leakDiagnostics },
  calls,
  records,
  invalidOutputs,
  scores,
  verdict: scores.pass
    ? "criterion_judgment_and_deterministic_derivation_supported_as_working_boundary"
    : "evidence_representation_remains_unresolved",
  selectionConclusion:
    "The formal one-step selection scenarios did not distinguish inferred state from stateless behavior; no selector architecture is promoted.",
  usage,
  elapsedMs: calls.reduce((sum, call) => sum + call.elapsedMs, 0),
  estimatedUpperBoundUsd: Number(
    calls.reduce((sum, call) => sum + call.estimatedUpperBoundUsd, 0).toFixed(8),
  ),
  claimBoundary: {
    supports: "measurement-contract behavior on the 24 frozen simulated responses",
    doesNotSupport: [
      "model improvement over v1",
      "human learning outcomes",
      "a universal rubric ontology",
      "stateful selector advantage",
    ],
  },
}
const rawTracePath = await persistLocalRun({
  suite: "simulated-student-evidence-followup-v1",
  config,
  report,
})
console.log(
  JSON.stringify(
    {
      rawTracePath,
      contractSha256: report.contractSha256,
      invalidOutputs: invalidOutputs.length,
      scores,
      verdict: report.verdict,
      usage,
      elapsedMs: report.elapsedMs,
      estimatedUpperBoundUsd: report.estimatedUpperBoundUsd,
    },
    null,
    2,
  ),
)
