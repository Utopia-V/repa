import { generateText, stepCountIs, tool, type ToolSet } from "ai"
import { z } from "zod"
import {
  BudgetTracker,
  deepSeekChatModel,
  deepSeekModelLabel,
  deepSeekRunConfig,
  estimateUpperBoundUsd,
  loadApiKey,
  persistLocalRun,
  summarizeUsage,
  type RunConfig,
} from "./lab"

const MAX_OUTPUT_TOKENS = 3_000
const MAX_STEPS = 4
const TRIALS = Number.parseInt(process.env.REPA_LAB_TRIALS ?? "3", 10)
const TARGET_TOOL = "record_formal_task_result"
const DISCOVERY_TOOL = "discover_learning_tools"

type Variant = "broad_catalog" | "context_narrowed" | "lazy_discovery"

type ExecutorEntry = {
  toolName: string
  input: unknown
}

const distractors = [
  ["record_learning_exposure", "Record that material was seen or heard; this is not assessed performance."],
  ["record_self_report", "Record a learner's subjective report about confidence or understanding."],
  ["record_informal_answer", "Record an answer from ordinary conversation without a formal task contract."],
  ["record_hint_assisted_answer", "Record an answer completed after a hint or other assistance."],
  ["mark_topic_understood", "Store a provisional learner claim that a topic feels understood."],
  ["mark_topic_mastered", "Propose a broad mastery claim after sufficient accumulated evidence."],
  ["record_session_summary", "Store a human-readable summary of the current learning session."],
  ["record_note_created", "Record that a learning note was created or updated."],
  ["record_material_read", "Record that a named course material was read."],
  ["record_video_watched", "Record that a course video was watched."],
  ["record_practice_started", "Record the beginning of a practice activity."],
  ["record_practice_completed", "Record completion of a practice activity without grading its answer."],
  ["record_review_attempt", "Record an attempt against an already scheduled review item."],
  ["record_assignment_progress", "Record progress on an assignment without claiming learning evidence."],
  ["record_assignment_submission", "Record that an assignment was submitted."],
  ["create_targeted_review", "Create future review work after an observed gap."],
  ["schedule_review", "Schedule an already justified review item at a future time."],
  ["create_verification_obligation", "Create a future check after teaching without recording a result."],
  ["propose_learning_plan", "Propose a time-budgeted sequence of future learning actions."],
  ["record_teacher_explanation", "Record that an explanation was delivered; this is exposure only."],
  ["record_learner_question", "Record a question asked by the learner."],
  ["record_error_attribution", "Record a supported interpretation of why an observed answer was wrong."],
  ["correct_evidence_interpretation", "Retract or supersede a cited prior evidence interpretation."],
  ["propose_flashcard", "Propose a recall card without scheduling or syncing it."],
  ["patch_learning_note", "Patch a human-readable learning note."],
  ["update_curriculum_graph", "Propose a prerequisite or topic-relationship change."],
  ["import_material", "Import course material into the local learning workspace."],
  ["search_course_material", "Search indexed course material for relevant passages."],
  ["calculate_next_review", "Calculate a candidate interval for an existing review item."],
  ["record_confidence_report", "Record a subjective confidence report from the learner."],
  ["record_time_spent", "Record elapsed time for a learning activity."],
  ["record_break", "Record a break inside a longer learning session."],
  ["triage_assignment", "Classify assignment urgency and learning value."],
  ["record_peer_feedback", "Record feedback supplied by a peer."],
  ["record_project_artifact", "Record a durable artifact produced during project work."],
  ["record_open_book_task_result", "Record a task result completed with reference materials available."],
] as const

const directToolNames = [TARGET_TOOL, ...distractors.map(([name]) => name)]

function createToolCatalog(executorEntries: ExecutorEntry[], commits: unknown[]): ToolSet {
  const catalog: ToolSet = {
    [TARGET_TOOL]: tool({
      description:
        "Record exactly one result from the currently active formal assessment task, preserving authoritative task identity, provenance, and observed assistance.",
      inputSchema: z.object({
        taskId: z.literal("task:catalog-1"),
        attemptId: z.literal("attempt:catalog-1"),
        sourceRef: z.literal("session-item:catalog-1"),
        target: z.literal("binary-search-midpoint"),
        outcome: z.literal("correct"),
        assistance: z.literal("none"),
        gradingBasis: z.string().min(1).max(200),
      }),
      execute: async (input) => {
        executorEntries.push({ toolName: TARGET_TOOL, input })
        commits.push(input)
        return { accepted: true, resultIndex: commits.length - 1 }
      },
    }),
    [DISCOVERY_TOOL]: tool({
      description:
        "Search the learning tool catalog by semantic intent. Use this only when the direct learning tools have not yet been exposed.",
      inputSchema: z.object({ query: z.string().min(1).max(300) }),
      execute: async (input) => {
        executorEntries.push({ toolName: DISCOVERY_TOOL, input })
        return {
          matches: [
            {
              name: TARGET_TOOL,
              description:
                "Record the authoritative result of the active formal independent assessment task.",
            },
          ],
        }
      },
    }),
  }

  for (const [name, description] of distractors) {
    catalog[name] = tool({
      description,
      inputSchema: z.object({
        sourceRef: z.string(),
        target: z.string(),
        note: z.string().min(1).max(200),
      }),
      execute: async (input) => {
        executorEntries.push({ toolName: name, input })
        return { accepted: true, experimentalDistractor: true }
      },
    })
  }
  return catalog
}

function systemPrompt(variant: Variant) {
  const common = `You are inside a controlled learning-tool selection experiment.
The current interaction is an authoritative FORMAL ASSESSMENT RESULT, not exposure, self-report, review scheduling, note work, or a broad mastery claim.
The learner independently answered 6 for the midpoint of indices 4 and 8; the expected answer is 6, so the observed outcome is correct.
Use taskId=task:catalog-1, attemptId=attempt:catalog-1, sourceRef=session-item:catalog-1, target=binary-search-midpoint, and assistance=none.
The only correct durable action is to record that formal result exactly once. Do not create review work or make a mastery claim. After the accepted write, report completion in one sentence.`
  if (variant !== "lazy_discovery") return common
  return `${common}
At the first step no direct learning write is visible. First call discover_learning_tools exactly once with the intent above. After it returns a match, call that matched tool exactly once.`
}

async function runTrial(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
  variant: Variant
  trial: number
}) {
  input.budget.assertCanStart(MAX_STEPS)
  const executorEntries: ExecutorEntry[] = []
  const commits: unknown[] = []
  const tools = createToolCatalog(executorEntries, commits)
  const startedAt = performance.now()

  const result = await generateText({
    model: deepSeekChatModel(input.apiKey, input.config),
    system: systemPrompt(input.variant),
    prompt: "Process the authoritative formal result now using the available tool mechanism.",
    tools,
    activeTools:
      input.variant === "broad_catalog"
        ? directToolNames
        : input.variant === "context_narrowed"
          ? [TARGET_TOOL]
          : [DISCOVERY_TOOL],
    ...(input.variant === "lazy_discovery"
      ? {
          prepareStep: ({ stepNumber }: { stepNumber: number }) => ({
            activeTools: stepNumber === 0 ? [DISCOVERY_TOOL] : [TARGET_TOOL],
          }),
        }
      : {}),
    toolChoice: "auto",
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })

  const usage = summarizeUsage(result.totalUsage)
  const stepFinishReasons = result.steps.map((step) => step.finishReason)
  const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons })

  const selectedTools = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName))
  const wrongExecutorEntries = executorEntries.filter(
    (entry) => entry.toolName !== TARGET_TOOL && entry.toolName !== DISCOVERY_TOOL,
  )
  const discoveryEntries = executorEntries.filter((entry) => entry.toolName === DISCOVERY_TOOL)
  const targetEntries = executorEntries.filter((entry) => entry.toolName === TARGET_TOOL)
  const expectedDiscoveryCount = input.variant === "lazy_discovery" ? 1 : 0

  return {
    variant: input.variant,
    trial: input.trial,
    passed:
      commits.length === 1 &&
      targetEntries.length === 1 &&
      wrongExecutorEntries.length === 0 &&
      discoveryEntries.length === expectedDiscoveryCount,
    catalogToolCount: Object.keys(tools).length,
    directToolCount: directToolNames.length,
    selectedTools,
    executorEntries,
    correctCommits: commits.length,
    wrongExecutorEntries: wrongExecutorEntries.length,
    discoveryEntries: discoveryEntries.length,
    modelSteps: result.steps.length,
    stepFinishReasons,
    stepUsage: result.steps.map((step, stepNumber) => ({
      stepNumber,
      selectedTools: step.toolCalls.map((call) => call.toolName),
      usage: summarizeUsage(step.usage),
    })),
    usage,
    estimatedUpperBoundUsd,
    elapsedMs: Math.round(performance.now() - startedAt),
    text: result.text,
  }
}

function aggregate(trials: Awaited<ReturnType<typeof runTrial>>[]) {
  const count = trials.length || 1
  return {
    trials: trials.length,
    passedTrials: trials.filter((trial) => trial.passed).length,
    wrongExecutorEntries: trials.reduce((sum, trial) => sum + trial.wrongExecutorEntries, 0),
    averageModelSteps: Number(
      (trials.reduce((sum, trial) => sum + trial.modelSteps, 0) / count).toFixed(2),
    ),
    averageInputTokens: Math.round(
      trials.reduce((sum, trial) => sum + trial.usage.inputTokens, 0) / count,
    ),
    averageOutputTokens: Math.round(
      trials.reduce((sum, trial) => sum + trial.usage.outputTokens, 0) / count,
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
  const budget = new BudgetTracker({ maxApiSteps: TRIALS * 3 * MAX_STEPS + 2 })
  const variants: Variant[] = ["broad_catalog", "context_narrowed", "lazy_discovery"]
  const trials: Awaited<ReturnType<typeof runTrial>>[] = []
  for (const variant of variants) {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      trials.push(await runTrial({ apiKey, config, budget, variant, trial }))
    }
  }

  const aggregates = Object.fromEntries(
    variants.map((variant) => [
      variant,
      aggregate(trials.filter((trial) => trial.variant === variant)),
    ]),
  )
  const report = {
    suite: "tool-catalog-narrowing-and-lazy-discovery",
    model: deepSeekModelLabel(config),
    config,
    passed: trials.every((trial) => trial.passed),
    experiment: {
      trialsPerVariant: TRIALS,
      maxStepsPerTrial: MAX_STEPS,
      maxOutputTokensPerTrial: MAX_OUTPUT_TOKENS,
      catalogToolCount: distractors.length + 2,
      directToolCount: directToolNames.length,
    },
    aggregates,
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
