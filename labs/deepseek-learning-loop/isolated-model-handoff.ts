import { generateText, tool } from "ai"
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
const SOURCE_REF = "session-item:attempt-log-staged-v1"
const TRIALS = Number.parseInt(process.env.REPA_LAB_TRIALS ?? "3", 10)
const MAX_OUTPUT_TOKENS = 1_500

type EvidencePacket = {
  sourceRef: string
  attemptId: string
  target: string
  outcome: "correct" | "incorrect"
  assistance: "none" | "hint"
  delayedIndependentCheckPassed: boolean
}

type Decision = {
  action: "verification" | "targeted_review" | "advance"
  reason: string
}

type ProfileId =
  | "deepseek_v4_flash_direct"
  | "deepseek_v4_pro_direct"
  | "isolated_deepseek_v4_flash_extract_then_deepseek_v4_pro_decide"

const profiles: Array<{ id: ProfileId; label: string }> = [
  {
    id: "deepseek_v4_flash_direct",
    label: "DeepSeek-V4-Flash direct decision (API, non-thinking)",
  },
  {
    id: "deepseek_v4_pro_direct",
    label: "DeepSeek-V4-Pro direct decision (API, thinking=max)",
  },
  {
    id: "isolated_deepseek_v4_flash_extract_then_deepseek_v4_pro_decide",
    label:
      "Isolated DeepSeek-V4-Flash extraction → fresh DeepSeek-V4-Pro decision",
  },
]

function buildAttemptLog() {
  const lines: string[] = []
  for (let line = 1; line <= 620; line += 1) {
    if (line === 97) {
      lines.push("ARCHIVED ATTEMPT: outcome=correct assistance=none delayedIndependentCheckPassed=true")
      continue
    }
    if (line === 98) {
      lines.push("ARCHIVED ONLY: this record was superseded and is not the active attempt.")
      continue
    }
    if (line === 411) {
      lines.push("BEGIN AUTHORITATIVE ACTIVE ATTEMPT")
      continue
    }
    if (line === 412) {
      lines.push("attemptId=attempt:isolated-handoff-1 target=binary-search-loop-invariant")
      continue
    }
    if (line === 413) {
      lines.push("outcome=correct")
      continue
    }
    if (line === 414) {
      lines.push("assistance=hint")
      continue
    }
    if (line === 415) {
      lines.push("delayedIndependentCheckPassed=false")
      continue
    }
    if (line === 416) {
      lines.push("END AUTHORITATIVE ACTIVE ATTEMPT")
      continue
    }
    lines.push(
      `diagnostic row ${String(line).padStart(3, "0")}: telemetry=${(line * 7919) % 100_003}; no learning evidence in this row; retain for transport diagnostics only.`,
    )
  }
  return lines.map((line, index) => `${String(index + 1).padStart(4, "0")}: ${line}`).join("\n")
}

const attemptLog = buildAttemptLog()

function policyPrompt() {
  return `Select exactly one next action from authoritative evidence.
- correct with assistance=hint and no delayed independent pass -> verification
- incorrect -> targeted_review
- independently correct -> advance
Do not infer broad mastery.`
}

async function directDecision(input: {
  apiKey: string
  config: RunConfig
  profileId: ProfileId
  trial: number
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(1)
  const decisions: Decision[] = []
  const startedAt = performance.now()
  const outcome = await generateText({
      model: deepSeekChatModel(input.apiKey, input.config),
      system: `${policyPrompt()} Read only the AUTHORITATIVE ACTIVE ATTEMPT block; archived records are distractors. Call propose_next_learning_action exactly once.`,
      prompt: `SourceRef: ${SOURCE_REF}\n\n${attemptLog}`,
      tools: {
        propose_next_learning_action: tool({
          description: "Propose an inspectable next action; this is not a durable write.",
          inputSchema: z.object({
            action: z.enum(["verification", "targeted_review", "advance"]),
            reason: z.string().min(1).max(300),
          }),
          execute: async (decision) => {
            decisions.push(decision)
            return { accepted: true }
          },
        }),
      },
      toolChoice: "auto",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 3,
    })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({ ok: false as const, error }))
  if (!outcome.ok) {
    input.budget.record({ estimatedUpperBoundUsd: 0, stepFinishReasons: ["infrastructure-failure"] })
    return {
      profileId: input.profileId,
      profileLabel: profiles.find((profile) => profile.id === input.profileId)?.label,
      trial: input.trial,
      passed: false,
      extractedPacket: null,
      decisions,
      stages: [],
      usage: emptyUsage(),
      estimatedUpperBoundUsd: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      fatalError: formatError(outcome.error),
    }
  }
  const result = outcome.result
  const usage = summarizeUsage(result.totalUsage)
  const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
  const stepFinishReasons = result.steps.map((step) => step.finishReason)
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons })
  return {
    profileId: input.profileId,
    profileLabel: profiles.find((profile) => profile.id === input.profileId)?.label,
    trial: input.trial,
    passed: decisions.length === 1 && decisions[0]?.action === "verification",
    extractedPacket: null,
    decisions,
    stages: [
      {
        role: "direct-decision",
        model: deepSeekModelLabel(input.config),
        usage,
        estimatedUpperBoundUsd,
        finishReasons: stepFinishReasons,
      },
    ],
    usage,
    estimatedUpperBoundUsd,
    elapsedMs: Math.round(performance.now() - startedAt),
    fatalError: null,
  }
}

async function isolatedHandoff(input: {
  apiKey: string
  trial: number
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(2)
  const startedAt = performance.now()
  const packets: EvidencePacket[] = []
  const extractionOutcome = await generateText({
      model: deepSeekChatModel(input.apiKey, FLASH_CONFIG),
      system: `Extract the AUTHORITATIVE ACTIVE ATTEMPT block into emit_evidence_packet. Ignore archived records. Preserve the supplied sourceRef exactly. Do not select a learning action.`,
      prompt: `SourceRef: ${SOURCE_REF}\n\n${attemptLog}`,
      tools: {
        emit_evidence_packet: tool({
          description: "Emit one provenance-bearing packet extracted from the active attempt log.",
          inputSchema: z.object({
            sourceRef: z.literal(SOURCE_REF),
            attemptId: z.string(),
            target: z.string(),
            outcome: z.enum(["correct", "incorrect"]),
            assistance: z.enum(["none", "hint"]),
            delayedIndependentCheckPassed: z.boolean(),
          }),
          execute: async (packet) => {
            packets.push(packet)
            return { accepted: true }
          },
        }),
      },
      toolChoice: "auto",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 3,
    })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({ ok: false as const, error }))
  if (!extractionOutcome.ok) {
    input.budget.record({ estimatedUpperBoundUsd: 0, stepFinishReasons: ["infrastructure-failure"] })
    return {
      profileId: "isolated_deepseek_v4_flash_extract_then_deepseek_v4_pro_decide" as const,
      profileLabel: profiles[2]!.label,
      trial: input.trial,
      passed: false,
      extractedPacket: null,
      decisions: [],
      stages: [],
      usage: emptyUsage(),
      estimatedUpperBoundUsd: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      fatalError: formatError(extractionOutcome.error),
    }
  }
  const extraction = extractionOutcome.result
  const extractionUsage = summarizeUsage(extraction.totalUsage)
  const extractionCost = estimateUpperBoundUsd(FLASH_CONFIG.model, extractionUsage)
  const extractionReasons = extraction.steps.map((step) => step.finishReason)
  input.budget.record({ estimatedUpperBoundUsd: extractionCost, stepFinishReasons: extractionReasons })

  const packet = packets[0]
  const decisions: Decision[] = []
  if (!packet) {
    return {
      profileId: "isolated_deepseek_v4_flash_extract_then_deepseek_v4_pro_decide" as const,
      profileLabel: profiles[2]!.label,
      trial: input.trial,
      passed: false,
      extractedPacket: null,
      decisions,
      stages: [
        {
          role: "isolated-extraction",
          model: deepSeekModelLabel(FLASH_CONFIG),
          usage: extractionUsage,
          estimatedUpperBoundUsd: extractionCost,
          finishReasons: extractionReasons,
        },
      ],
      usage: extractionUsage,
      estimatedUpperBoundUsd: extractionCost,
      elapsedMs: Math.round(performance.now() - startedAt),
      fatalError: null,
    }
  }

  const decisionOutcome = await generateText({
      model: deepSeekChatModel(input.apiKey, PRO_CONFIG),
      system: `${policyPrompt()} The packet is a fallible extraction with source provenance. Call propose_next_learning_action exactly once.`,
      prompt: `Evidence packet:\n${JSON.stringify(packet)}`,
      tools: {
        propose_next_learning_action: tool({
          description: "Propose an inspectable next action; this is not a durable write.",
          inputSchema: z.object({
            action: z.enum(["verification", "targeted_review", "advance"]),
            reason: z.string().min(1).max(300),
          }),
          execute: async (decision) => {
            decisions.push(decision)
            return { accepted: true }
          },
        }),
      },
      toolChoice: "auto",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 3,
    })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({ ok: false as const, error }))
  if (!decisionOutcome.ok) {
    input.budget.record({ estimatedUpperBoundUsd: 0, stepFinishReasons: ["infrastructure-failure"] })
    return {
      profileId: "isolated_deepseek_v4_flash_extract_then_deepseek_v4_pro_decide" as const,
      profileLabel: profiles[2]!.label,
      trial: input.trial,
      passed: false,
      extractedPacket: packet,
      decisions,
      stages: [
        {
          role: "isolated-extraction",
          model: deepSeekModelLabel(FLASH_CONFIG),
          usage: extractionUsage,
          estimatedUpperBoundUsd: extractionCost,
          finishReasons: extractionReasons,
        },
      ],
      usage: extractionUsage,
      estimatedUpperBoundUsd: extractionCost,
      elapsedMs: Math.round(performance.now() - startedAt),
      fatalError: formatError(decisionOutcome.error),
    }
  }
  const decisionResult = decisionOutcome.result
  const decisionUsage = summarizeUsage(decisionResult.totalUsage)
  const decisionCost = estimateUpperBoundUsd(PRO_CONFIG.model, decisionUsage)
  const decisionReasons = decisionResult.steps.map((step) => step.finishReason)
  input.budget.record({ estimatedUpperBoundUsd: decisionCost, stepFinishReasons: decisionReasons })
  const usage = mergeUsage([extractionUsage, decisionUsage])
  const packetCorrect =
    packet.sourceRef === SOURCE_REF &&
    packet.attemptId === "attempt:isolated-handoff-1" &&
    packet.target === "binary-search-loop-invariant" &&
    packet.outcome === "correct" &&
    packet.assistance === "hint" &&
    packet.delayedIndependentCheckPassed === false

  return {
    profileId: "isolated_deepseek_v4_flash_extract_then_deepseek_v4_pro_decide" as const,
    profileLabel: profiles[2]!.label,
    trial: input.trial,
    passed: packetCorrect && decisions.length === 1 && decisions[0]?.action === "verification",
    extractedPacket: packet,
    decisions,
    stages: [
      {
        role: "isolated-extraction",
        model: deepSeekModelLabel(FLASH_CONFIG),
        usage: extractionUsage,
        estimatedUpperBoundUsd: extractionCost,
        finishReasons: extractionReasons,
      },
      {
        role: "fresh-decision",
        model: deepSeekModelLabel(PRO_CONFIG),
        usage: decisionUsage,
        estimatedUpperBoundUsd: decisionCost,
        finishReasons: decisionReasons,
      },
    ],
    usage,
    estimatedUpperBoundUsd: extractionCost + decisionCost,
    elapsedMs: Math.round(performance.now() - startedAt),
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
    {
      inputTokens: 0,
      cacheReadTokens: 0,
      noCacheTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    },
  )
}

function aggregate(trials: Array<Awaited<ReturnType<typeof directDecision>> | Awaited<ReturnType<typeof isolatedHandoff>>>) {
  const count = trials.length || 1
  return {
    trials: trials.length,
    passedTrials: trials.filter((trial) => trial.passed).length,
    verificationDecisions: trials.filter((trial) => trial.decisions[0]?.action === "verification").length,
    averageModelCalls: Number(
      (trials.reduce((sum, trial) => sum + trial.stages.length, 0) / count).toFixed(2),
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
    infrastructureFailures: trials.filter((trial) => trial.fatalError !== null).length,
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

async function persistComparison(report: unknown) {
  const directoryUrl = new URL("./.runs/", import.meta.url)
  await mkdir(fileURLToPath(directoryUrl), { recursive: true })
  const recordedAt = new Date().toISOString()
  const filename = `${recordedAt.replaceAll(":", "-")}-isolated-deepseek-model-handoff.json`
  const path = fileURLToPath(new URL(filename, directoryUrl))
  await Bun.write(
    path,
    JSON.stringify(
      {
        recordedAt,
        models: [deepSeekModelLabel(FLASH_CONFIG), deepSeekModelLabel(PRO_CONFIG)],
        suite: "isolated-deepseek-model-handoff",
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
  const budget = new BudgetTracker({ maxApiSteps: TRIALS * 4 + 2 })
  const trials: Array<
    Awaited<ReturnType<typeof directDecision>> | Awaited<ReturnType<typeof isolatedHandoff>>
  > = []
  for (let trial = 1; trial <= TRIALS; trial += 1) {
    trials.push(
      await directDecision({
        apiKey,
        config: FLASH_CONFIG,
        profileId: "deepseek_v4_flash_direct",
        trial,
        budget,
      }),
    )
    trials.push(
      await directDecision({
        apiKey,
        config: PRO_CONFIG,
        profileId: "deepseek_v4_pro_direct",
        trial,
        budget,
      }),
    )
    trials.push(await isolatedHandoff({ apiKey, trial, budget }))
  }
  const report = {
    suite: "isolated-deepseek-model-handoff",
    models: [deepSeekModelLabel(FLASH_CONFIG), deepSeekModelLabel(PRO_CONFIG)],
    passed: trials.every((trial) => trial.passed),
    experiment: {
      trialsPerProfile: TRIALS,
      sourceRef: SOURCE_REF,
      rawEvidenceChars: attemptLog.length,
      separateAgentRuntime: false,
      sharedProviderToolHistory: false,
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
