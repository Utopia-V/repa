import { generateText, stepCountIs, tool, type ToolSet } from "ai"
import { z } from "zod"
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
const MAX_STEPS = 5
const MAX_OUTPUT_TOKENS = 1_500
const FULL_STATE_REF = "learning-state:compiler-construction:v7"
const OVERVIEW_REF = "learning-overview:compiler-construction:v7"
const CURRENT_ATTEMPT_REF = "session-item:attempt:subset-construction:active-v3"
const BLOCKER_REF = "session-item:review:epsilon-closure:failed-v2"

type Variant = "full_state" | "overview_first" | "local_first_lazy_overview"

type Retrieval = {
  toolName: string
  input: unknown
  output: unknown
  returnedChars: number
  success: boolean
  error: string | null
}

type Decision = {
  action: "repair_prerequisite" | "verify_current" | "advance"
  target: string
  evidenceRefs: string[]
  reason: string
}

const overview = {
  snapshotRef: OVERVIEW_REF,
  courseId: "compiler-construction",
  activeGoal: "complete the lexer implementation assessment in six days",
  activeRoute: [
    "regular-language-model",
    "epsilon-closure",
    "subset-construction",
    "lexer-implementation",
  ],
  currentTarget: "subset-construction",
  currentAttemptRef: CURRENT_ATTEMPT_REF,
  blockingPrerequisiteSignals: [
    {
      topicId: "epsilon-closure",
      relation: "prerequisite_of_subset-construction",
      status: "unresolved_failed_review",
      evidenceRef: BLOCKER_REF,
    },
  ],
  unrelatedDueReviews: ["context-free-grammar-normalization"],
}

const items = {
  [CURRENT_ATTEMPT_REF]: {
    itemRef: CURRENT_ATTEMPT_REF,
    topicId: "subset-construction",
    outcome: "correct",
    assistance: "none",
    delayedIndependentCheckPassed: true,
    status: "active",
  },
  [BLOCKER_REF]: {
    itemRef: BLOCKER_REF,
    topicId: "epsilon-closure",
    outcome: "incorrect",
    assistance: "none",
    independent: true,
    interpretation: "failed to include states reachable through repeated epsilon transitions",
    status: "active_unresolved",
  },
} as const

function buildFullState() {
  const lines: string[] = []
  for (let line = 1; line <= 760; line += 1) {
    if (line === 83) {
      lines.push(
        "ARCHIVED SNAPSHOT v3: subset-construction was marked complete and no prerequisite blocker was recorded; suggested action=advance.",
      )
      continue
    }
    if (line === 84) {
      lines.push("ARCHIVED ONLY: superseded by active snapshot v7; never use for current task selection.")
      continue
    }
    if (line === 487) {
      lines.push(`BEGIN AUTHORITATIVE OVERVIEW ${OVERVIEW_REF}`)
      continue
    }
    if (line === 488) {
      lines.push(JSON.stringify(overview))
      continue
    }
    if (line === 489) {
      lines.push(`END AUTHORITATIVE OVERVIEW ${OVERVIEW_REF}`)
      continue
    }
    if (line === 534) {
      lines.push(`BEGIN ACTIVE ITEM ${CURRENT_ATTEMPT_REF}`)
      continue
    }
    if (line === 535) {
      lines.push(JSON.stringify(items[CURRENT_ATTEMPT_REF]))
      continue
    }
    if (line === 536) {
      lines.push(`END ACTIVE ITEM ${CURRENT_ATTEMPT_REF}`)
      continue
    }
    if (line === 602) {
      lines.push(`BEGIN ACTIVE ITEM ${BLOCKER_REF}`)
      continue
    }
    if (line === 603) {
      lines.push(JSON.stringify(items[BLOCKER_REF]))
      continue
    }
    if (line === 604) {
      lines.push(`END ACTIVE ITEM ${BLOCKER_REF}`)
      continue
    }
    lines.push(
      `diagnostic record ${String(line).padStart(3, "0")}: transport=${(line * 104_729) % 1_000_003}; unrelated archived course telemetry; not active learning evidence.`,
    )
  }
  return lines.map((line, index) => `${String(index + 1).padStart(4, "0")}: ${line}`).join("\n")
}

const fullState = buildFullState()

function serializeChars(value: unknown) {
  return JSON.stringify(value).length
}

function recordRetrieval(
  retrievals: Retrieval[],
  toolName: string,
  input: unknown,
  output: unknown,
) {
  retrievals.push({
    toolName,
    input,
    output,
    returnedChars: serializeChars(output),
    success: true,
    error: null,
  })
  return output
}

function createTools(input: {
  variant: Variant
  retrievals: Retrieval[]
  decisions: Decision[]
}): ToolSet {
  const readFullState = tool({
    description:
      "Read the complete versioned synthetic learning state. Use only the current authoritative overview and active items; archived records are distractors.",
    inputSchema: z.object({ sourceRef: z.literal(FULL_STATE_REF) }),
    execute: async (toolInput) =>
      recordRetrieval(input.retrievals, "read_full_learning_state", toolInput, {
        sourceRef: FULL_STATE_REF,
        content: fullState,
      }),
  })
  const readOverview = tool({
    description:
      "Read the compact current course overview before selecting a next learning action from only local evidence.",
    inputSchema: z.object({ courseId: z.literal("compiler-construction") }),
    execute: async (toolInput) =>
      recordRetrieval(input.retrievals, "read_course_overview", toolInput, overview),
  })
  const readItem = tool({
    description:
      "Read one exact active learning item referenced by the current overview. Preserve its itemRef as evidence provenance.",
    inputSchema: z.object({
      itemRef: z.enum([CURRENT_ATTEMPT_REF, BLOCKER_REF]),
    }),
    execute: async (toolInput) => {
      const output = items[toolInput.itemRef]
      return recordRetrieval(input.retrievals, "read_learning_item", toolInput, output)
    },
  })
  const propose = tool({
    description:
      "Propose one inspectable next learning action. This tool cannot write durable learning state.",
    inputSchema: z.object({
      action: z.enum(["repair_prerequisite", "verify_current", "advance"]),
      target: z.string().min(1).max(100),
      evidenceRefs: z.array(z.string().min(1)).min(1).max(5),
      reason: z.string().min(1).max(400),
    }),
    execute: async (decision) => {
      input.decisions.push(decision)
      return { recordedForInspection: true }
    },
  })

  if (input.variant === "full_state") {
    return {
      read_full_learning_state: readFullState,
      propose_next_learning_action: propose,
    }
  }
  if (input.variant === "overview_first") {
    return {
      read_learning_item: readItem,
      propose_next_learning_action: propose,
    }
  }
  return {
    read_course_overview: readOverview,
    read_learning_item: readItem,
    propose_next_learning_action: propose,
  }
}

function selectionPolicy() {
  return `Apply this deterministic task-selection policy in order:
1. If the active route contains an unresolved failed prerequisite review, repair that prerequisite before continuing the current target.
2. Otherwise, if the current attempt was assisted or lacks a delayed independent pass, verify the current target.
3. Otherwise advance.
Do not infer broad mastery. Use only active, source-referenced evidence. Call propose_next_learning_action exactly once after obtaining the context required by the variant.`
}

function initialPrompt(variant: Variant) {
  const question =
    "Select the next learning action for the active compiler-construction route under the supplied policy."
  if (variant === "full_state") {
    return `${question}\nRead ${FULL_STATE_REF} before deciding.`
  }
  if (variant === "overview_first") {
    return `${question}\nCompact current overview:\n${JSON.stringify(overview)}\nRead the exact evidence item for any blocking signal before deciding.`
  }
  return `${question}\nCurrent local attempt:\n${JSON.stringify(items[CURRENT_ATTEMPT_REF])}\nThis local item is not a course overview. Read the current course overview and then any exact blocking evidence before deciding.`
}

function requiredReadsSatisfied(variant: Variant, retrievals: Retrieval[]) {
  const names = retrievals.filter((item) => item.success).map((item) => item.toolName)
  if (variant === "full_state") return names.includes("read_full_learning_state")
  const blockerRead = retrievals.some(
    (item) =>
      item.success &&
      item.toolName === "read_learning_item" &&
      typeof item.input === "object" &&
      item.input !== null &&
      "itemRef" in item.input &&
      item.input.itemRef === BLOCKER_REF,
  )
  if (variant === "overview_first") return blockerRead
  return names.includes("read_course_overview") && blockerRead
}

function decisionCorrect(decision: Decision | undefined) {
  return (
    decision?.action === "repair_prerequisite" &&
    decision.target === "epsilon-closure" &&
    decision.evidenceRefs.includes(BLOCKER_REF)
  )
}

function actionChoiceCorrect(decision: Decision | undefined) {
  return decision?.action === "repair_prerequisite"
}

async function runTrial(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
  variant: Variant
  trial: number
}) {
  input.budget.assertCanStart(MAX_STEPS)
  const retrievals: Retrieval[] = []
  const decisions: Decision[] = []
  const startedAt = performance.now()
  const outcome = await generateText({
    model: deepSeekChatModel(input.apiKey, input.config),
    system: selectionPolicy(),
    prompt: initialPrompt(input.variant),
    tools: createTools({ variant: input.variant, retrievals, decisions }),
    toolChoice: "auto",
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 3,
  })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({ ok: false as const, error }))

  if (!outcome.ok) {
    input.budget.record({ estimatedUpperBoundUsd: 0, stepFinishReasons: ["infrastructure-failure"] })
    return {
      variant: input.variant,
      trial: input.trial,
      passed: false,
      requiredReadsSatisfied: false,
      actionChoiceCorrect: false,
      decisionCorrect: false,
      decisions,
      retrievals,
      upfrontContextChars: initialPrompt(input.variant).length,
      returnedChars: retrievals.reduce((sum, item) => sum + item.returnedChars, 0),
      modelSteps: 0,
      stepFinishReasons: [] as string[],
      usage: emptyUsage(),
      estimatedUpperBoundUsd: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      text: "",
      fatalError: formatError(outcome.error),
    }
  }

  const result = outcome.result
  const usage = summarizeUsage(result.totalUsage)
  const stepFinishReasons = result.steps.map((step) => step.finishReason)
  const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons })
  const readsSatisfied = requiredReadsSatisfied(input.variant, retrievals)
  const actionCorrect = decisions.length === 1 && actionChoiceCorrect(decisions[0])
  const correct = decisions.length === 1 && decisionCorrect(decisions[0])
  return {
    variant: input.variant,
    trial: input.trial,
    passed: readsSatisfied && correct && retrievals.every((item) => item.success),
    requiredReadsSatisfied: readsSatisfied,
    actionChoiceCorrect: actionCorrect,
    decisionCorrect: correct,
    decisions,
    retrievals,
    upfrontContextChars: initialPrompt(input.variant).length,
    returnedChars: retrievals.reduce((sum, item) => sum + item.returnedChars, 0),
    modelSteps: result.steps.length,
    stepFinishReasons,
    stepUsage: result.steps.map((step, stepNumber) => ({
      stepNumber,
      tools: step.toolCalls.map((call) => call.toolName),
      usage: summarizeUsage(step.usage),
    })),
    usage,
    estimatedUpperBoundUsd,
    elapsedMs: Math.round(performance.now() - startedAt),
    text: result.text,
    fatalError: null,
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

function aggregate(trials: Awaited<ReturnType<typeof runTrial>>[]) {
  const count = trials.length || 1
  return {
    trials: trials.length,
    passedTrials: trials.filter((trial) => trial.passed).length,
    correctActionChoices: trials.filter((trial) => trial.actionChoiceCorrect).length,
    correctDecisions: trials.filter((trial) => trial.decisionCorrect).length,
    completeRequiredReads: trials.filter((trial) => trial.requiredReadsSatisfied).length,
    infrastructureFailures: trials.filter((trial) => trial.fatalError !== null).length,
    averageUpfrontContextChars: Math.round(
      trials.reduce((sum, trial) => sum + trial.upfrontContextChars, 0) / count,
    ),
    averageReturnedChars: Math.round(
      trials.reduce((sum, trial) => sum + trial.returnedChars, 0) / count,
    ),
    averageModelSteps: Number(
      (trials.reduce((sum, trial) => sum + trial.modelSteps, 0) / count).toFixed(2),
    ),
    averageInputTokens: Math.round(
      trials.reduce((sum, trial) => sum + trial.usage.inputTokens, 0) / count,
    ),
    averageNoCacheTokens: Math.round(
      trials.reduce((sum, trial) => sum + trial.usage.noCacheTokens, 0) / count,
    ),
    averageOutputTokens: Math.round(
      trials.reduce((sum, trial) => sum + trial.usage.outputTokens, 0) / count,
    ),
    averageReasoningTokens: Math.round(
      trials.reduce((sum, trial) => sum + trial.usage.reasoningTokens, 0) / count,
    ),
    averageUpperBoundUsd: Number(
      (trials.reduce((sum, trial) => sum + trial.estimatedUpperBoundUsd, 0) / count).toFixed(8),
    ),
    averageElapsedMs: Math.round(
      trials.reduce((sum, trial) => sum + trial.elapsedMs, 0) / count,
    ),
  }
}

async function run(config: RunConfig) {
  if (!Number.isInteger(TRIALS) || TRIALS < 1 || TRIALS > 10) {
    throw new Error(`REPA_LAB_TRIALS must be an integer from 1 to 10; received ${TRIALS}`)
  }
  const apiKey = await loadApiKey()
  const variants: Variant[] = ["full_state", "overview_first", "local_first_lazy_overview"]
  const budget = new BudgetTracker({ maxApiSteps: TRIALS * variants.length * MAX_STEPS + 2 })
  const trials: Awaited<ReturnType<typeof runTrial>>[] = []
  for (const variant of variants) {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      trials.push(await runTrial({ apiKey, config, budget, variant, trial }))
    }
  }
  const report = {
    suite: "global-overview-and-lazy-learning-context",
    model: deepSeekModelLabel(config),
    config,
    passed: trials.every((trial) => trial.passed),
    experiment: {
      trialsPerVariant: TRIALS,
      maxStepsPerTrial: MAX_STEPS,
      rawFullStateChars: fullState.length,
      compactOverviewChars: JSON.stringify(overview).length,
      syntheticLearningState: true,
      durableLearningWritesExposed: false,
    },
    aggregates: Object.fromEntries(
      variants.map((variant) => [
        variant,
        aggregate(trials.filter((trial) => trial.variant === variant)),
      ]),
    ),
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
