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
} from "./lab"
import { citationCoversLines, normalizeDisplayText } from "./text-oracles"

const MATERIAL_ID = "zephyr-course-spec-v1"
const SOURCE_REF = "material:zephyr-course-spec:v1"
const ACTIVATION_CODE = "LANTERN-17"
const SETTLING_INTERVAL = "43 ms"
const TARGET_START = 516
const CODE_LINE = 518
const INTERVAL_LINE = 519
const TARGET_END = 521
const LINE_COUNT = 900
const MAX_OUTPUT_TOKENS = 2_500
const MAX_STEPS = 4
const TRIALS = Number.parseInt(process.env.REPA_LAB_TRIALS ?? "3", 10)

type Variant = "full_payload" | "bounded_source_read"

type Retrieval = {
  toolName: string
  input: unknown
  success: boolean
  error: string | null
  output: unknown
  returnedChars: number
}

function buildMaterial() {
  const lines: string[] = []
  for (let line = 1; line <= LINE_COUNT; line += 1) {
    if (line === 121) {
      lines.push(
        "Archived classroom example — Zephyr escrow rehearsal used LANTERN-71; this is obsolete and never valid for production confirmation.",
      )
      continue
    }
    if (line === 122) {
      lines.push(
        "The same obsolete rehearsal waited 34 ms. Treat both values as distractors when reading the authoritative production section.",
      )
      continue
    }
    if (line === TARGET_START) {
      lines.push("Section: Zephyr escrow protocol — authoritative production confirmation parameters.")
      continue
    }
    if (line === TARGET_START + 1) {
      lines.push("Status: normative for production confirmation; archived examples and classroom drills do not apply.")
      continue
    }
    if (line === CODE_LINE) {
      lines.push(`Production activation code: ${ACTIVATION_CODE}.`)
      continue
    }
    if (line === INTERVAL_LINE) {
      lines.push(`Mandatory settling interval: exactly ${SETTLING_INTERVAL} before confirmation.`)
      continue
    }
    if (line === TARGET_END - 1) {
      lines.push("Both parameters must be satisfied together; neither substitutes for the other.")
      continue
    }
    if (line === TARGET_END) {
      lines.push("End normative Zephyr production confirmation parameters.")
      continue
    }
    const code = `PRACTICE-${String((line * 7919) % 100_000).padStart(5, "0")}`
    const interval = 20 + ((line * 37) % 70)
    lines.push(
      `Archive unit ${String(line).padStart(3, "0")}: mnemonic ${code}, interval ${interval} ms; illustrative material only and not an authoritative production rule.`,
    )
  }
  return lines
}

const materialLines = buildMaterial()
const fullContent = materialLines
  .map((line, index) => `${String(index + 1).padStart(4, "0")}: ${line}`)
  .join("\n")

function windowContent(startLine: number, endLine: number) {
  return materialLines
    .slice(startLine - 1, endLine)
    .map((line, index) => `${String(startLine + index).padStart(4, "0")}: ${line}`)
    .join("\n")
}

function recordRetrieval(
  retrievals: Retrieval[],
  toolName: string,
  input: unknown,
  output: unknown,
) {
  const serialized = JSON.stringify(output)
  retrievals.push({
    toolName,
    input,
    success: true,
    error: null,
    output,
    returnedChars: serialized.length,
  })
  return output
}

function toolsFor(variant: Variant, retrievals: Retrieval[]): ToolSet {
  let discoveredRange: { startLine: number; endLine: number } | null = null
  const full = tool({
    description:
      "Read the complete synthetic course specification with stable line numbers. Use when no bounded retrieval path is available.",
    inputSchema: z.object({ materialId: z.literal(MATERIAL_ID) }),
    execute: async (input) =>
      recordRetrieval(retrievals, "read_full_course_material", input, {
        sourceRef: SOURCE_REF,
        lineCount: LINE_COUNT,
        content: fullContent,
      }),
  })
  const search = tool({
    description:
      "Locate relevant line windows in course material. Results contain stable references and candidate ranges, not the requested facts themselves.",
    inputSchema: z.object({
      materialId: z.literal(MATERIAL_ID),
      query: z.string().min(1).max(300),
    }),
    execute: async (input) => {
      discoveredRange = { startLine: TARGET_START, endLine: TARGET_END }
      return recordRetrieval(retrievals, "search_course_material", input, {
        sourceRef: SOURCE_REF,
        matches: [
          {
            sectionId: "zephyr-production-confirmation",
            startLine: TARGET_START,
            endLine: TARGET_END,
            preview:
              "Authoritative production confirmation parameters. Read the exact window to obtain the values.",
          },
        ],
      })
    },
  })
  const readWindow = tool({
    description:
      "Read one exact line window returned by search_course_material, preserving source and line provenance.",
    inputSchema: z.object({
      sourceRef: z.literal(SOURCE_REF),
      startLine: z.number().int().min(1).max(LINE_COUNT),
      endLine: z.number().int().min(1).max(LINE_COUNT),
    }),
    execute: async (input) => {
      try {
        if (
          discoveredRange === null ||
          input.startLine !== discoveredRange.startLine ||
          input.endLine !== discoveredRange.endLine
        ) {
          throw new Error("MaterialRangeNotDiscovered: use the exact range returned by search first")
        }
        return recordRetrieval(retrievals, "read_material_window", input, {
          sourceRef: SOURCE_REF,
          startLine: input.startLine,
          endLine: input.endLine,
          content: windowContent(input.startLine, input.endLine),
          windowRef: `${SOURCE_REF}#L${input.startLine}-L${input.endLine}`,
        })
      } catch (error) {
        retrievals.push({
          toolName: "read_material_window",
          input,
          success: false,
          error: formatError(error),
          output: null,
          returnedChars: 0,
        })
        throw error
      }
    },
  })

  return variant === "full_payload"
    ? { read_full_course_material: full }
    : { search_course_material: search, read_material_window: readWindow }
}

function validCitation(text: string) {
  return citationCoversLines({
    text,
    sourceRef: SOURCE_REF,
    requiredStart: CODE_LINE,
    requiredEnd: INTERVAL_LINE,
  })
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
  const tools = toolsFor(input.variant, retrievals)
  const system =
    input.variant === "full_payload"
      ? `Use read_full_course_material exactly once. Find the authoritative production section rather than the archived classroom distractor. Answer only from tool content and cite a sourceRef line range containing both facts.`
      : `First call search_course_material. Then call read_material_window with the exact returned sourceRef and range. Answer only from that window and cite its stable windowRef. Do not answer from the search preview.`
  const startedAt = performance.now()
  const result = await generateText({
    model: deepSeekChatModel(input.apiKey, input.config),
    system,
    prompt: `In materialId=${MATERIAL_ID}, what activation code and settling interval are required by the authoritative Zephyr escrow protocol for production confirmation? Cite the stable source reference and a line range containing both facts.`,
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })
  const usage = summarizeUsage(result.totalUsage)
  const stepFinishReasons = result.steps.map((step) => step.finishReason)
  const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons })
  const expectedTools =
    input.variant === "full_payload"
      ? ["read_full_course_material"]
      : ["search_course_material", "read_material_window"]
  const successfulTools = retrievals.filter((retrieval) => retrieval.success).map((item) => item.toolName)
  const hasExpectedTools = expectedTools.every((name) => successfulTools.includes(name))
  const normalizedText = normalizeDisplayText(result.text)
  const answerCorrect =
    normalizedText.includes(ACTIVATION_CODE) &&
    normalizedText.toLowerCase().includes(SETTLING_INTERVAL.toLowerCase())
  const citationCorrect = validCitation(result.text)

  return {
    variant: input.variant,
    trial: input.trial,
    passed:
      answerCorrect &&
      citationCorrect &&
      hasExpectedTools &&
      retrievals.every((retrieval) => retrieval.success),
    answerCorrect,
    citationCorrect,
    material: {
      sourceRef: SOURCE_REF,
      lineCount: LINE_COUNT,
      contentChars: fullContent.length,
      codeLine: CODE_LINE,
      intervalLine: INTERVAL_LINE,
      targetWindow: { startLine: TARGET_START, endLine: TARGET_END },
    },
    retrievals,
    topLevelToolCalls: result.steps.flatMap((step) =>
      step.toolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
    ),
    returnedChars: retrievals.reduce((sum, retrieval) => sum + retrieval.returnedChars, 0),
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
  }
}

function aggregate(trials: Awaited<ReturnType<typeof runTrial>>[]) {
  const count = trials.length || 1
  return {
    trials: trials.length,
    passedTrials: trials.filter((trial) => trial.passed).length,
    correctAnswers: trials.filter((trial) => trial.answerCorrect).length,
    correctCitations: trials.filter((trial) => trial.citationCorrect).length,
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
  const budget = new BudgetTracker({ maxApiSteps: TRIALS * 2 * MAX_STEPS + 2 })
  const variants: Variant[] = ["full_payload", "bounded_source_read"]
  const trials: Awaited<ReturnType<typeof runTrial>>[] = []
  for (const variant of variants) {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      trials.push(await runTrial({ apiKey, config, budget, variant, trial }))
    }
  }
  const report = {
    suite: "bounded-material-retrieval-and-source-reference",
    model: deepSeekModelLabel(config),
    config,
    passed: trials.every((trial) => trial.passed),
    experiment: {
      trialsPerVariant: TRIALS,
      maxStepsPerTrial: MAX_STEPS,
      maxOutputTokensPerTrial: MAX_OUTPUT_TOKENS,
      syntheticMaterial: true,
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
