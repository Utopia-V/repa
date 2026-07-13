import { generateText, stepCountIs, tool, type ToolSet } from "ai"
import { Effect, Schema } from "effect"
import { mkdir, stat } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
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

const MAX_OUTPUT_TOKENS = 3_000
const MAX_STEPS = 6
const TRIALS = Number.parseInt(process.env.REPA_LAB_TRIALS ?? "3", 10)
const EXPECTED_PREREQUISITE = "integer-floor-division"
const PINNED_OPENCODE_COMMIT = "b1fc8113948b518835c2a39ece49553cffe9b30c"

type Variant = "direct_tools" | "confined_code_mode"

type CallRecord = {
  name: string
  input: unknown
  success: boolean
  error: string | null
}

type CodeModeResult =
  | {
      ok: true
      value: unknown
      logs?: string[]
      truncated?: boolean
      toolCalls: Array<{ name: string }>
    }
  | {
      ok: false
      error: { kind: string; message: string }
      logs?: string[]
      truncated?: boolean
      toolCalls: Array<{ name: string }>
    }

type PinnedCodeModeModule = {
  CodeMode: {
    make(options: unknown): {
      instructions(): string
      execute(code: string): Effect.Effect<CodeModeResult, never, never>
    }
  }
  Tool: {
    make(options: unknown): unknown
  }
}

async function loadPinnedCodeMode(): Promise<PinnedCodeModeModule> {
  const generatedDirectory = fileURLToPath(new URL("./.generated/", import.meta.url))
  const sourcePath = fileURLToPath(
    new URL("../../.reference/opencode/packages/codemode/src/index.ts", import.meta.url),
  )
  const bundlePath = fileURLToPath(new URL("./.generated/opencode-codemode.mjs", import.meta.url))
  await mkdir(generatedDirectory, { recursive: true })
  const process = Bun.spawn(
    [
      "bun",
      "build",
      sourcePath,
      "--outfile",
      bundlePath,
      "--target",
      "bun",
      "--external",
      "effect",
      "--external",
      "acorn",
      "--external",
      "typescript",
    ],
    {
      cwd: fileURLToPath(new URL("./", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`Failed to bundle pinned OpenCode code mode: ${stderr || stdout}`)
  }
  const version = (await stat(bundlePath)).mtimeMs
  return (await import(`${pathToFileURL(bundlePath).href}?v=${version}`)) as PinnedCodeModeModule
}

function taskPrompt() {
  return `A recent formal binary-search attempt has attemptId=attempt:code-mode-1.
Read the attempt first. It identifies a candidate prerequisite that was implicated by the observed error.
Then read that prerequisite's topic record and due-review status using the returned identifier; do not guess or substitute the main topic.
Return the candidate prerequisite id, title, review status, and one concise reason. This is a read-only diagnostic; make no learning-state write.`
}

function directTools(calls: CallRecord[]): ToolSet {
  let discoveredPrerequisite: string | null = null
  const requireDiscovered = (toolName: string, topicId: string) => {
    if (discoveredPrerequisite === null) {
      throw new Error(`${toolName} requires get_recent_attempt to complete first`)
    }
    if (topicId !== discoveredPrerequisite) {
      throw new Error(`${toolName} expected the prerequisite returned by get_recent_attempt`)
    }
  }
  return {
    get_recent_attempt: tool({
      description:
        "Read one authoritative recent formal attempt, including the prerequisite implicated by its observed error.",
      inputSchema: z.object({ attemptId: z.literal("attempt:code-mode-1") }),
      execute: async (input) => {
        discoveredPrerequisite = EXPECTED_PREREQUISITE
        calls.push({ name: "get_recent_attempt", input, success: true, error: null })
        return {
          attemptId: input.attemptId,
          outcome: "incorrect",
          errorTag: "midpoint-rounding",
          candidatePrerequisiteId: EXPECTED_PREREQUISITE,
        }
      },
    }),
    get_topic: tool({
      description: "Read the exact topic record identified by a previous learning-context result.",
      inputSchema: z.object({ topicId: z.string() }),
      execute: async (input) => {
        try {
          requireDiscovered("get_topic", input.topicId)
          calls.push({ name: "get_topic", input, success: true, error: null })
          return {
            topicId: input.topicId,
            title: "Integer floor division",
            relationToAttempt: "prerequisite implicated by midpoint-rounding",
          }
        } catch (error) {
          calls.push({ name: "get_topic", input, success: false, error: formatError(error) })
          throw error
        }
      },
    }),
    get_due_status: tool({
      description: "Read review status for the exact topic identified by a previous context result.",
      inputSchema: z.object({ topicId: z.string() }),
      execute: async (input) => {
        try {
          requireDiscovered("get_due_status", input.topicId)
          calls.push({ name: "get_due_status", input, success: true, error: null })
          return { topicId: input.topicId, reviewStatus: "not_due", dueAt: null }
        } catch (error) {
          calls.push({ name: "get_due_status", input, success: false, error: formatError(error) })
          throw error
        }
      },
    }),
  }
}

function codeModeRuntime(module: PinnedCodeModeModule, calls: CallRecord[]) {
  const { CodeMode, Tool } = module
  let discoveredPrerequisite: string | null = null
  const requireDiscovered = (toolName: string, topicId: string) => {
    if (discoveredPrerequisite === null) {
      throw new Error(`${toolName} requires evidence.recentAttempt to complete first`)
    }
    if (topicId !== discoveredPrerequisite) {
      throw new Error(`${toolName} expected the prerequisite returned by evidence.recentAttempt`)
    }
  }
  const recentAttempt = Tool.make({
    description:
      "Read one authoritative recent formal attempt, including the prerequisite implicated by its observed error.",
    input: Schema.Struct({ attemptId: Schema.Literal("attempt:code-mode-1") }),
    output: Schema.Struct({
      attemptId: Schema.String,
      outcome: Schema.String,
      errorTag: Schema.String,
      candidatePrerequisiteId: Schema.String,
    }),
    run: (input: { attemptId: string }) =>
      Effect.sync(() => {
        discoveredPrerequisite = EXPECTED_PREREQUISITE
        calls.push({ name: "evidence.recentAttempt", input, success: true, error: null })
        return {
          attemptId: input.attemptId,
          outcome: "incorrect",
          errorTag: "midpoint-rounding",
          candidatePrerequisiteId: EXPECTED_PREREQUISITE,
        }
      }),
  })
  const topic = Tool.make({
    description: "Read the exact topic record identified by a previous learning-context result.",
    input: Schema.Struct({ topicId: Schema.String }),
    output: Schema.Struct({
      topicId: Schema.String,
      title: Schema.String,
      relationToAttempt: Schema.String,
    }),
    run: (input: { topicId: string }) =>
      Effect.try({
        try: () => {
          requireDiscovered("course.topic", input.topicId)
          calls.push({ name: "course.topic", input, success: true, error: null })
          return {
            topicId: input.topicId,
            title: "Integer floor division",
            relationToAttempt: "prerequisite implicated by midpoint-rounding",
          }
        },
        catch: (error) => {
          calls.push({ name: "course.topic", input, success: false, error: formatError(error) })
          return error
        },
      }),
  })
  const dueStatus = Tool.make({
    description: "Read review status for the exact topic identified by a previous context result.",
    input: Schema.Struct({ topicId: Schema.String }),
    output: Schema.Struct({
      topicId: Schema.String,
      reviewStatus: Schema.String,
      dueAt: Schema.NullOr(Schema.String),
    }),
    run: (input: { topicId: string }) =>
      Effect.try({
        try: () => {
          requireDiscovered("review.dueStatus", input.topicId)
          calls.push({ name: "review.dueStatus", input, success: true, error: null })
          return { topicId: input.topicId, reviewStatus: "not_due", dueAt: null }
        },
        catch: (error) => {
          calls.push({ name: "review.dueStatus", input, success: false, error: formatError(error) })
          return error
        },
      }),
  })
  return CodeMode.make({
    tools: {
      evidence: { recentAttempt },
      course: { topic },
      review: { dueStatus },
    },
    limits: {
      timeoutMs: 2_000,
      maxToolCalls: 4,
      maxOutputBytes: 3_000,
    },
  })
}

async function runTrial(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
  variant: Variant
  trial: number
  codeMode: PinnedCodeModeModule
}) {
  input.budget.assertCanStart(MAX_STEPS)
  const calls: CallRecord[] = []
  const successfulCodeModeResults: CodeModeResult[] = []
  const codeModeDiagnostics: CodeModeResult[] = []
  const runtime = codeModeRuntime(input.codeMode, calls)
  const runtimeInstructions = runtime.instructions()
  const tools: ToolSet =
    input.variant === "direct_tools"
      ? directTools(calls)
      : {
          execute_readonly_learning_query: tool({
            description: `Run one confined read-only orchestration program over the learning query tools below. Durable learning writes are not available.\n\n${runtimeInstructions}`,
            inputSchema: z.object({ code: z.string().min(1) }),
            execute: async ({ code }) => {
              const result = await Effect.runPromise(runtime.execute(code))
              if (!result.ok) {
                codeModeDiagnostics.push(result)
                throw new Error(`${result.error.kind}: ${result.error.message}`)
              }
              successfulCodeModeResults.push(result)
              return result
            },
          }),
        }
  const system =
    input.variant === "direct_tools"
      ? `Use the read-only tools to answer the learner's diagnostic request. Respect data dependencies: read the attempt before using its returned candidatePrerequisiteId. Never infer a durable learning-state change.`
      : `Use execute_readonly_learning_query exactly once to answer the learner's diagnostic request. Write a confined program that reads the attempt, passes its returned candidatePrerequisiteId to both remaining tools, and returns only the requested compact object. Never infer a durable learning-state change.`
  const startedAt = performance.now()
  const result = await generateText({
    model: deepSeekChatModel(input.apiKey, input.config),
    system,
    prompt: taskPrompt(),
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })
  const usage = summarizeUsage(result.totalUsage)
  const stepFinishReasons = result.steps.map((step) => step.finishReason)
  const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons })
  const successfulCalls = calls.filter((call) => call.success)
  const expectedDirect = ["get_recent_attempt", "get_topic", "get_due_status"]
  const expectedCodeMode = ["evidence.recentAttempt", "course.topic", "review.dueStatus"]
  const expected = input.variant === "direct_tools" ? expectedDirect : expectedCodeMode
  const observedNames = successfulCalls.map((call) => call.name)
  const hasExpectedCalls = expected.every((name) => observedNames.includes(name))
  const textHasResult =
    result.text.includes(EXPECTED_PREREQUISITE) &&
    result.text.toLowerCase().includes("integer floor division") &&
    (result.text.toLowerCase().includes("not_due") ||
      result.text.toLowerCase().includes("not due"))

  return {
    variant: input.variant,
    trial: input.trial,
    passed:
      hasExpectedCalls &&
      calls.filter((call) => !call.success).length === 0 &&
      textHasResult &&
      (input.variant === "direct_tools" || successfulCodeModeResults.length === 1),
    calls,
    topLevelTools: result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
    topLevelToolCalls: result.steps.flatMap((step) =>
      step.toolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
    ),
    codeModeInstructionChars: input.variant === "confined_code_mode" ? runtimeInstructions.length : 0,
    successfulCodeModeResults,
    codeModeDiagnostics,
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
    failedChildCalls: trials.reduce(
      (sum, trial) => sum + trial.calls.filter((call) => !call.success).length,
      0,
    ),
    codeModeDiagnostics: trials.reduce(
      (sum, trial) => sum + trial.codeModeDiagnostics.length,
      0,
    ),
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
  const codeMode = await loadPinnedCodeMode()
  const budget = new BudgetTracker({ maxApiSteps: TRIALS * 2 * MAX_STEPS + 2 })
  const variants: Variant[] = ["direct_tools", "confined_code_mode"]
  const trials: Awaited<ReturnType<typeof runTrial>>[] = []
  for (const variant of variants) {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      trials.push(await runTrial({ apiKey, config, budget, variant, trial, codeMode }))
    }
  }
  const report = {
    suite: "pinned-opencode-code-mode-readonly-comparison",
    model: deepSeekModelLabel(config),
    config,
    pinnedReference: {
      repository: "https://github.com/anomalyco/opencode.git",
      tag: "v1.17.18",
      commit: PINNED_OPENCODE_COMMIT,
      source: ".reference/opencode/packages/codemode/src",
    },
    passed: trials.every((trial) => trial.passed),
    experiment: {
      trialsPerVariant: TRIALS,
      maxStepsPerTrial: MAX_STEPS,
      maxOutputTokensPerTrial: MAX_OUTPUT_TOKENS,
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
