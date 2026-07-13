import { generateText, stepCountIs, tool, type ToolSet } from "ai"
import { mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import {
  BudgetTracker,
  deepSeekChatModel,
  deepSeekModelLabel,
  estimateUpperBoundUsd,
  formatError,
  loadApiKey,
  summarizeUsage,
  type RunConfig,
  type UsageSummary,
} from "./lab"

const FLASH_CONFIG: RunConfig = { model: "deepseek-v4-flash", thinking: "disabled" }
const PRO_CONFIG: RunConfig = { model: "deepseek-v4-pro", thinking: "max" }
const MAX_OUTPUT_TOKENS = 2_000
const MAX_STEPS = 4
const TRIALS = Number.parseInt(process.env.REPA_LAB_TRIALS ?? "5", 10)

type ProfileId = "deepseek_v4_flash_only" | "deepseek_v4_pro_only" | "deepseek_v4_flash_then_pro"

type Decision = {
  action: "verification" | "targeted_review" | "advance"
  reason: string
}

const profiles: Array<{ id: ProfileId; label: string }> = [
  {
    id: "deepseek_v4_flash_only",
    label: "DeepSeek-V4-Flash only (API, non-thinking)",
  },
  {
    id: "deepseek_v4_pro_only",
    label: "DeepSeek-V4-Pro only (API, thinking=max)",
  },
  {
    id: "deepseek_v4_flash_then_pro",
    label: "DeepSeek-V4-Flash read → DeepSeek-V4-Pro decide (same agent loop)",
  },
]

function configForStep(profile: ProfileId, stepNumber: number): RunConfig {
  if (profile === "deepseek_v4_flash_only") return FLASH_CONFIG
  if (profile === "deepseek_v4_pro_only") return PRO_CONFIG
  return stepNumber === 0 ? FLASH_CONFIG : PRO_CONFIG
}

async function runTrial(input: {
  apiKey: string
  budget: BudgetTracker
  profile: ProfileId
  trial: number
}) {
  input.budget.assertCanStart(MAX_STEPS)
  let evidenceRead = false
  const reads: unknown[] = []
  const decisions: Decision[] = []
  const tools: ToolSet = {
    read_attempt_evidence: tool({
      description:
        "Read authoritative conditions and outcome for the active formal attempt before selecting a next action.",
      inputSchema: z.object({ attemptId: z.literal("attempt:staged-model-1") }),
      execute: async (toolInput) => {
        evidenceRead = true
        reads.push(toolInput)
        return {
          attemptId: toolInput.attemptId,
          target: "binary-search-loop-invariant",
          outcome: "correct",
          assistance: "hint",
          delayedIndependentCheckPassed: false,
          policyFacts: {
            hintedCorrectDoesNotVerifyIndependentRecall: true,
            incorrectRequiresTargetedReview: true,
            independentCorrectMayAdvance: true,
          },
        }
      },
    }),
    propose_next_learning_action: tool({
      description:
        "Propose the next learning action from the attempt evidence. This is an inspectable proposal, not a durable write.",
      inputSchema: z.object({
        action: z.enum(["verification", "targeted_review", "advance"]),
        reason: z.string().min(1).max(300),
      }),
      execute: async (decision) => {
        if (!evidenceRead) throw new Error("AttemptEvidenceRequired: read evidence before deciding")
        decisions.push(decision)
        return { accepted: true, proposed: decision }
      },
    }),
  }
  const flashModel = deepSeekChatModel(input.apiKey, FLASH_CONFIG)
  const proModel = deepSeekChatModel(input.apiKey, PRO_CONFIG)
  const initialModel = input.profile === "deepseek_v4_pro_only" ? proModel : flashModel
  const startedAt = performance.now()
  let result: Awaited<ReturnType<typeof generateText<ToolSet>>>
  try {
    result = await generateText({
      model: initialModel,
      system: `Operate one learning turn with two deterministic stages.
First read the authoritative attempt evidence. Then propose exactly one next learning action.
A correct answer completed with a hint does not verify independent recall, so it requires independent verification rather than advance.
An incorrect answer requires targeted review. Only an independently correct result may advance.
Do not infer broad mastery. After the proposal tool returns, explain the selected action in one concise sentence.`,
      prompt: "Use attempt:staged-model-1 to select the next learning action.",
      tools,
      activeTools: ["read_attempt_evidence"],
      prepareStep: ({ stepNumber }) => ({
        ...(input.profile === "deepseek_v4_flash_then_pro" && stepNumber > 0
          ? { model: proModel }
          : {}),
        activeTools:
          stepNumber === 0
            ? ["read_attempt_evidence"]
            : stepNumber === 1
              ? ["propose_next_learning_action"]
              : [],
      }),
      toolChoice: "auto",
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
  } catch (error) {
    input.budget.record({ estimatedUpperBoundUsd: 0, stepFinishReasons: ["fatal"] })
    return {
      profileId: input.profile,
      profileLabel: profiles.find((profile) => profile.id === input.profile)?.label,
      trial: input.trial,
      passed: false,
      reads,
      decisions,
      modelSteps: 0,
      stepFinishReasons: ["fatal"],
      steps: [],
      usage: emptyUsage(),
      usageByModel: {
        [deepSeekModelLabel(FLASH_CONFIG)]: emptyUsage(),
        [deepSeekModelLabel(PRO_CONFIG)]: emptyUsage(),
      },
      estimatedUpperBoundUsd: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      text: "",
      fatalError: formatError(error),
    }
  }
  const stepFinishReasons = result.steps.map((step) => step.finishReason)
  const stepRecords = result.steps.map((step, stepNumber) => {
    const config = configForStep(input.profile, stepNumber)
    const usage = summarizeUsage(step.usage)
    return {
      stepNumber,
      model: deepSeekModelLabel(config),
      config,
      selectedTools: step.toolCalls.map((call) => call.toolName),
      usage,
      estimatedUpperBoundUsd: estimateUpperBoundUsd(config.model, usage),
    }
  })
  const estimatedUpperBoundUsd = stepRecords.reduce(
    (sum, step) => sum + step.estimatedUpperBoundUsd,
    0,
  )
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons })
  const usage = summarizeUsage(result.totalUsage)
  const usageByModel = {
    [deepSeekModelLabel(FLASH_CONFIG)]: mergeUsage(
      stepRecords.filter((step) => step.config.model === FLASH_CONFIG.model).map((step) => step.usage),
    ),
    [deepSeekModelLabel(PRO_CONFIG)]: mergeUsage(
      stepRecords.filter((step) => step.config.model === PRO_CONFIG.model).map((step) => step.usage),
    ),
  }
  const decision = decisions[0]
  return {
    profileId: input.profile,
    profileLabel: profiles.find((profile) => profile.id === input.profile)?.label,
    trial: input.trial,
    passed:
      reads.length === 1 &&
      decisions.length === 1 &&
      decision?.action === "verification" &&
      result.text.toLowerCase().includes("verification"),
    reads,
    decisions,
    modelSteps: result.steps.length,
    stepFinishReasons,
    steps: stepRecords,
    usage,
    usageByModel,
    estimatedUpperBoundUsd,
    elapsedMs: Math.round(performance.now() - startedAt),
    text: result.text,
    fatalError: null,
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
    verificationDecisions: trials.filter((trial) => trial.decisions[0]?.action === "verification").length,
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

async function persistComparison(report: unknown) {
  const directoryUrl = new URL("./.runs/", import.meta.url)
  await mkdir(fileURLToPath(directoryUrl), { recursive: true })
  const recordedAt = new Date().toISOString()
  const filename = `${recordedAt.replaceAll(":", "-")}-staged-deepseek-model-collaboration.json`
  const path = fileURLToPath(new URL(filename, directoryUrl))
  await Bun.write(
    path,
    JSON.stringify(
      {
        recordedAt,
        models: [deepSeekModelLabel(FLASH_CONFIG), deepSeekModelLabel(PRO_CONFIG)],
        suite: "staged-deepseek-model-collaboration",
        report,
      },
      null,
      2,
    ),
  )
  return path
}

async function run() {
  if (!Number.isInteger(TRIALS) || TRIALS < 1 || TRIALS > 10) {
    throw new Error(`REPA_LAB_TRIALS must be an integer from 1 to 10; received ${TRIALS}`)
  }
  const apiKey = await loadApiKey()
  const budget = new BudgetTracker({ maxApiSteps: TRIALS * profiles.length * MAX_STEPS + 2 })
  const trials: Awaited<ReturnType<typeof runTrial>>[] = []
  for (let trial = 1; trial <= TRIALS; trial += 1) {
    for (const profile of profiles) {
      trials.push(await runTrial({ apiKey, budget, profile: profile.id, trial }))
    }
  }
  const report = {
    suite: "staged-deepseek-model-collaboration",
    models: [deepSeekModelLabel(FLASH_CONFIG), deepSeekModelLabel(PRO_CONFIG)],
    passed: trials.every((trial) => trial.passed),
    experiment: {
      trialsPerProfile: TRIALS,
      maxStepsPerTrial: MAX_STEPS,
      maxOutputTokensPerTrial: MAX_OUTPUT_TOKENS,
      separateAgentRuntime: false,
      durableLearningWritesExposed: false,
    },
    profiles,
    aggregates: Object.fromEntries(
      profiles.map((profile) => [
        profile.id,
        aggregate(trials.filter((trial) => trial.profileId === profile.id)),
      ]),
    ),
    trials,
    budget: {
      apiSteps: budget.apiSteps,
      estimatedUpperBoundUsd: Number(budget.spentUsd.toFixed(8)),
      configuredMaxUsd: budget.maxUsd,
    },
  }
  const rawTracePath = await persistComparison(report)
  return { rawTracePath, ...report }
}

console.log(JSON.stringify(await run(), null, 2))
