import { generateText, Output } from "ai"
import {
  alignmentRelations,
  benchmarkCategories,
  benchmarkTasks,
  candidateSignalThresholds,
  lexicalBaseline,
  meetsCandidateSignal,
  scoreAnnotations,
  skillIds,
  type BenchmarkCategory,
  type CandidateAnnotation,
} from "./alignment-benchmark"
import { annotationPolicy, batchAnnotationSchema, batchPrompt } from "./alignment-contract"
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

const TRIALS = Number.parseInt(process.env.REPA_LAB_TRIALS ?? "3", 10)
const MAX_OUTPUT_TOKENS = 8_000

async function runBatch(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
  category: BenchmarkCategory
  trial: number
}) {
  input.budget.assertCanStart(1)
  const expectedCount = benchmarkTasks.filter((item) => item.category === input.category).length
  const schema = batchAnnotationSchema(expectedCount)
  const startedAt = performance.now()
  const outcome = await generateText({
    model: deepSeekChatModel(input.apiKey, input.config),
    system: `${annotationPolicy()}
Return exactly one annotation for every supplied task as one JSON object with this exact shape:
{"annotations":[{"taskId":"source task id","sourceRef":"source reference","status":"resolved|ambiguous|none","confidence":"high|medium|low","alignments":[{"skillId":"one listed skill id","relation":"teaches|assesses|requires"}],"basis":"brief source-grounded reason"}]}
Do not wrap the JSON in Markdown or add prose outside it.`,
    prompt: batchPrompt(input.category),
    output: Output.json({
      name: "candidate_alignment_batch",
      description:
        "JSON containing exactly one source-linked candidate task-to-skill annotation for every supplied task.",
    }),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 3,
  })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({ ok: false as const, error }))

  if (!outcome.ok) {
    input.budget.record({ estimatedUpperBoundUsd: 0, stepFinishReasons: ["infrastructure-or-output-failure"] })
    return {
      trial: input.trial,
      category: input.category,
      annotations: [] as CandidateAnnotation[],
      usage: emptyUsage(),
      estimatedUpperBoundUsd: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      finishReasons: [] as string[],
      text: "",
      fatalError: formatError(outcome.error),
    }
  }

  const result = outcome.result
  const usage = summarizeUsage(result.totalUsage)
  const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
  const finishReasons = result.steps.map((step) => step.finishReason)
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })
  const validation = schema.safeParse(result.output)
  return {
    trial: input.trial,
    category: input.category,
    annotations: validation.success ? validation.data.annotations : [],
    usage,
    estimatedUpperBoundUsd,
    elapsedMs: Math.round(performance.now() - startedAt),
    finishReasons,
    text: result.text,
    rawOutput: result.output,
    fatalError: validation.success
      ? null
      : `SchemaValidationError: ${validation.error.message}`,
  }
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

function mergeUsage(values: UsageSummary[]): UsageSummary {
  return values.reduce<UsageSummary>(
    (total, value) => ({
      inputTokens: total.inputTokens + value.inputTokens,
      cacheReadTokens: total.cacheReadTokens + value.cacheReadTokens,
      noCacheTokens: total.noCacheTokens + value.noCacheTokens,
      outputTokens: total.outputTokens + value.outputTokens,
      reasoningTokens: total.reasoningTokens + value.reasoningTokens,
      totalTokens: total.totalTokens + value.totalTokens,
    }),
    emptyUsage(),
  )
}

async function runTrial(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
  trial: number
  baselineScore: ReturnType<typeof scoreAnnotations>
}) {
  const batches = []
  for (const category of benchmarkCategories) {
    batches.push(
      await runBatch({
        apiKey: input.apiKey,
        config: input.config,
        budget: input.budget,
        category,
        trial: input.trial,
      }),
    )
  }
  const annotations = batches.flatMap((batch) => batch.annotations)
  const score = scoreAnnotations(annotations)
  const usage = mergeUsage(batches.map((batch) => batch.usage))
  return {
    trial: input.trial,
    passedCandidateSignal: meetsCandidateSignal(score, input.baselineScore),
    score,
    annotations,
    batches,
    usage,
    estimatedUpperBoundUsd: batches.reduce(
      (sum, batch) => sum + batch.estimatedUpperBoundUsd,
      0,
    ),
    elapsedMs: batches.reduce((sum, batch) => sum + batch.elapsedMs, 0),
    failures: batches.filter((batch) => batch.fatalError !== null).length,
  }
}

function average(
  trials: Awaited<ReturnType<typeof runTrial>>[],
  select: (trial: Awaited<ReturnType<typeof runTrial>>) => number,
) {
  return Number(
    (trials.reduce((sum, trial) => sum + select(trial), 0) / (trials.length || 1)).toFixed(6),
  )
}

function aggregate(trials: Awaited<ReturnType<typeof runTrial>>[]) {
  return {
    trials: trials.length,
    passedCandidateSignal: trials.filter((trial) => trial.passedCandidateSignal).length,
    transportValid: trials.filter((trial) => trial.score.transport.valid).length,
    averageExactRecordAccuracy: average(trials, (trial) => trial.score.exactRecordAccuracy),
    averageEdgePrecision: average(trials, (trial) => trial.score.edges.precision),
    averageEdgeRecall: average(trials, (trial) => trial.score.edges.recall),
    averageEdgeF1: average(trials, (trial) => trial.score.edges.f1),
    averageSemanticHiddenEdgeRecall: average(
      trials,
      (trial) => trial.score.categories.semantic_hidden!.edgeRecall,
    ),
    averageKeywordTrapFalsePositiveRate: average(
      trials,
      (trial) => trial.score.keywordTrapFalsePositiveRate,
    ),
    averageAmbiguousRecall: average(trials, (trial) => trial.score.ambiguousRecall),
    averageHighConfidenceErrors: average(trials, (trial) => trial.score.highConfidenceErrors),
    averageInputTokens: Math.round(average(trials, (trial) => trial.usage.inputTokens)),
    averageNoCacheTokens: Math.round(average(trials, (trial) => trial.usage.noCacheTokens)),
    averageOutputTokens: Math.round(average(trials, (trial) => trial.usage.outputTokens)),
    averageReasoningTokens: Math.round(average(trials, (trial) => trial.usage.reasoningTokens)),
    averageUpperBoundUsd: Number(
      average(trials, (trial) => trial.estimatedUpperBoundUsd).toFixed(8),
    ),
    averageElapsedMs: Math.round(average(trials, (trial) => trial.elapsedMs)),
    failures: trials.reduce((sum, trial) => sum + trial.failures, 0),
  }
}

async function run(config: RunConfig) {
  if (!Number.isInteger(TRIALS) || TRIALS < 1 || TRIALS > 10) {
    throw new Error(`REPA_LAB_TRIALS must be an integer from 1 to 10; received ${TRIALS}`)
  }
  const apiKey = await loadApiKey()
  const budget = new BudgetTracker({ maxApiSteps: TRIALS * benchmarkCategories.length + 2 })
  const baselineAnnotations = lexicalBaseline()
  const baselineScore = scoreAnnotations(baselineAnnotations)
  const trials = []
  for (let trial = 1; trial <= TRIALS; trial += 1) {
    trials.push(await runTrial({ apiKey, config, budget, trial, baselineScore }))
  }
  const report = {
    suite: "structured-output-task-alignment",
    model: deepSeekModelLabel(config),
    config,
    passed: trials.every((trial) => trial.passedCandidateSignal),
    experiment: {
      trials: TRIALS,
      records: benchmarkTasks.length,
      categories: benchmarkCategories,
      skills: skillIds,
      relationVocabulary: alignmentRelations,
      thresholds: candidateSignalThresholds,
      outputMechanism: "ai-sdk-output-json-plus-local-zod",
      syntheticArtifacts: true,
      durableLearningWritesExposed: false,
    },
    lexicalBaseline: { score: baselineScore, annotations: baselineAnnotations },
    aggregate: aggregate(trials),
    trials,
    budget: {
      apiSteps: budget.apiSteps,
      estimatedUpperBoundUsd: Number(budget.spentUsd.toFixed(8)),
      configuredMaxUsd: budget.maxUsd,
    },
  }
  const rawTracePath = await persistLocalRun({ suite: report.suite, config, report })
  return { rawTracePath, ...report }
}

const report = await run(deepSeekRunConfig(process.argv[2]))
console.log(JSON.stringify(report, null, 2))
