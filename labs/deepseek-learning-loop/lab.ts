import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText, stepCountIs, tool, type ModelMessage } from "ai"
import { mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { z } from "zod"

export type ModelID = "deepseek-v4-flash" | "deepseek-v4-pro"
export type ThinkingMode = "disabled" | "high" | "max"

export type RunConfig = {
  model: ModelID
  thinking: ThinkingMode
}

export function deepSeekRunConfig(value: string | undefined): RunConfig {
  if (!value || value === "deepseek-v4-flash") {
    return { model: "deepseek-v4-flash", thinking: "disabled" }
  }
  if (value === "deepseek-v4-pro") {
    return { model: "deepseek-v4-pro", thinking: "max" }
  }
  throw new Error(`Unknown DeepSeek model profile: ${value}`)
}

export function deepSeekModelLabel(config: RunConfig) {
  return config.model === "deepseek-v4-pro"
    ? "DeepSeek-V4-Pro (API, thinking=max)"
    : "DeepSeek-V4-Flash (API, non-thinking)"
}

export type ExperimentPolicy =
  | "model_discretion"
  | "force_required_tool_first"
  | "enforce_declared_contract_on_completion"

export type ActivityContract = {
  onCompletion: "none" | "verification_obligation"
}

export type LearningContext =
  | {
      interactionKind: "ordinary_clarification"
      sourceRef: string
      target?: string
    }
  | {
      interactionKind: "selected_explanation"
      sourceRef: string
      target: string
      activityContract: ActivityContract
    }
  | {
      interactionKind: "formal_assessment_result"
      sourceRef: string
      target: string
      task: {
        taskId: string
        attemptId: string
        expectedAnswer: string
        assistance: "none" | "hint"
      }
    }
  | {
      interactionKind: "correction"
      sourceRef: string
      target: string
      interpretationId: string
    }

export type LearningEvent =
  | {
      type: "formal_task_result"
      taskId: string
      attemptId: string
      sourceRef: string
      target: string
      outcome: "correct" | "incorrect" | "partial"
      assistance: "none" | "hint"
      gradingBasis: string
    }
  | {
      type: "learning_obligation"
      kind: "verification" | "targeted_review"
      sourceRef: string
      target: string
      reason: string
    }
  | {
      type: "evidence_correction"
      interpretationId: string
      action: "retract" | "supersede"
      sourceRef: string
      reason: string
    }

export type ScenarioExpectation =
  | { kind: "no_learning_write" }
  | { kind: "verification_without_result"; target: string }
  | {
      kind: "formal_result"
      target: string
      outcome: "correct" | "incorrect" | "partial"
      assistance: "none" | "hint"
      obligation: "verification" | "targeted_review"
    }
  | { kind: "correction"; interpretationId: string }

export type Scenario = {
  id: string
  description: string
  context: LearningContext
  messages: ModelMessage[]
  expectation: ScenarioExpectation
}

export type UsageSummary = {
  inputTokens: number
  cacheReadTokens: number
  noCacheTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
}

export type ToolExecutionTrace = {
  toolCallId: string
  toolName: string
  stepNumber: number | null
  startedMs: number
  durationMs: number | null
  success: boolean | null
  error: string | null
}

export type ScenarioTrace = {
  scenarioId: string
  description: string
  config: RunConfig
  experimentPolicy: ExperimentPolicy
  maxOutputTokens: number
  maxSteps: number
  derivedEvents: LearningEvent[]
  text: string
  attemptedTools: string[]
  toolExecutions: ToolExecutionTrace[]
  events: LearningEvent[]
  stepFinishReasons: string[]
  usage: UsageSummary
  estimatedUpperBoundUsd: number
  elapsedMs: number
  passed: boolean
  failures: string[]
}

export class BudgetTracker {
  readonly maxUsd: number
  readonly maxApiSteps: number
  spentUsd = 0
  apiSteps = 0

  constructor(input: { maxUsd?: number; maxApiSteps?: number } = {}) {
    this.maxUsd = input.maxUsd ?? Number(process.env.REPA_LAB_MAX_USD ?? "0.25")
    this.maxApiSteps = input.maxApiSteps ?? 48
  }

  assertCanStart(maxAdditionalSteps = 4) {
    if (this.spentUsd >= this.maxUsd) {
      throw new Error(`Experiment budget reached: $${this.spentUsd.toFixed(6)} >= $${this.maxUsd.toFixed(2)}`)
    }
    if (this.apiSteps + maxAdditionalSteps > this.maxApiSteps) {
      throw new Error(`Experiment API-step limit would be exceeded: ${this.apiSteps} + ${maxAdditionalSteps}`)
    }
  }

  record(trace: Pick<ScenarioTrace, "estimatedUpperBoundUsd" | "stepFinishReasons">) {
    this.spentUsd += trace.estimatedUpperBoundUsd
    this.apiSteps += trace.stepFinishReasons.length
  }
}

export async function runTutorScenario(input: {
  apiKey: string
  config: RunConfig
  scenario: Scenario
  budget: BudgetTracker
  experimentPolicy?: ExperimentPolicy
  maxOutputTokens?: number
  maxSteps?: number
}): Promise<ScenarioTrace> {
  const maxSteps = input.maxSteps ?? 4
  input.budget.assertCanStart(maxSteps)
  const state: LearningEvent[] = []
  const tools = learningTools(state, input.scenario.context)
  const provider = deepSeekProvider(input.apiKey, input.config)
  const experimentPolicy = input.experimentPolicy ?? "model_discretion"
  const maxOutputTokens = input.maxOutputTokens ?? 700
  const startedAt = performance.now()
  const toolExecutions: ToolExecutionTrace[] = []
  const executionByCallId = new Map<string, ToolExecutionTrace>()
  const result = await generateText({
    model: provider.chatModel(input.config.model),
    system: tutorSystemPrompt(input.scenario.context),
    messages: input.scenario.messages,
    tools,
    toolChoice: "auto",
    ...(
      experimentPolicy === "force_required_tool_first" &&
      input.scenario.context.interactionKind === "selected_explanation" &&
      input.scenario.context.activityContract.onCompletion === "verification_obligation"
        ? {
            prepareStep: ({ stepNumber }: { stepNumber: number }) =>
            stepNumber === 0
              ? {
                  activeTools: ["create_learning_obligation"],
                  toolChoice: { type: "tool", toolName: "create_learning_obligation" },
                }
              : { toolChoice: "auto" as const },
          }
        : {}),
    stopWhen: stepCountIs(maxSteps),
    maxOutputTokens,
    experimental_onToolCallStart(event) {
      const execution: ToolExecutionTrace = {
        toolCallId: event.toolCall.toolCallId,
        toolName: event.toolCall.toolName,
        stepNumber: event.stepNumber ?? null,
        startedMs: Math.round(performance.now() - startedAt),
        durationMs: null,
        success: null,
        error: null,
      }
      executionByCallId.set(execution.toolCallId, execution)
      toolExecutions.push(execution)
    },
    experimental_onToolCallFinish(event) {
      const execution = executionByCallId.get(event.toolCall.toolCallId)
      if (!execution) return
      execution.durationMs = Math.round(event.durationMs)
      execution.success = event.success
      execution.error = event.success ? null : formatError(event.error)
    },
  })
  const derivedEvents = applyExperimentPostconditions({
    policy: experimentPolicy,
    context: input.scenario.context,
    text: result.text,
    finishReasons: result.steps.map((step) => step.finishReason),
    state,
  })
  const usage = summarizeUsage(result.totalUsage)
  const attemptedTools = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName))
  const base = {
    scenarioId: input.scenario.id,
    description: input.scenario.description,
    config: input.config,
    experimentPolicy,
    maxOutputTokens,
    maxSteps,
    derivedEvents,
    text: result.text,
    attemptedTools,
    toolExecutions,
    events: state,
    stepFinishReasons: result.steps.map((step) => step.finishReason),
    usage,
    estimatedUpperBoundUsd: estimateUpperBoundUsd(input.config.model, usage),
    elapsedMs: Math.round(performance.now() - startedAt),
  }
  const failures = evaluateScenario(input.scenario.expectation, base)
  const trace: ScenarioTrace = {
    ...base,
    passed: failures.length === 0,
    failures,
  }
  input.budget.record(trace)
  return trace
}

export function applyExperimentPostconditions(input: {
  policy: ExperimentPolicy
  context: LearningContext
  text: string
  finishReasons: string[]
  state: LearningEvent[]
}) {
  const derived: LearningEvent[] = []
  if (
    input.policy !== "enforce_declared_contract_on_completion" ||
    input.context.interactionKind !== "selected_explanation" ||
    input.context.activityContract.onCompletion !== "verification_obligation" ||
    !input.text.trim() ||
    input.finishReasons.at(-1) !== "stop"
  ) {
    return derived
  }
  const alreadyExists = input.state.some(
    (event) =>
      event.type === "learning_obligation" &&
      event.kind === "verification" &&
      event.sourceRef === input.context.sourceRef &&
      event.target === input.context.target,
  )
  if (alreadyExists) return derived
  const event: LearningEvent = {
    type: "learning_obligation",
    kind: "verification",
    sourceRef: input.context.sourceRef,
    target: input.context.target,
    reason: "A completed selected explanation requires later independent verification.",
  }
  input.state.push(event)
  derived.push(event)
  return derived
}

export async function simulateLearner(input: {
  apiKey: string
  config: RunConfig
  task: string
  profile: string
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(1)
  const provider = deepSeekProvider(input.apiKey, input.config)
  const startedAt = performance.now()
  const result = await generateText({
    model: provider.chatModel(input.config.model),
    system:
      "You are simulating an honest learner for a controlled education experiment. " +
      "Follow the learner profile exactly. Answer naturally and briefly. Do not mention that you are a model or an experiment.",
    prompt: `Learner profile:\n${input.profile}\n\nTask:\n${input.task}`,
    maxOutputTokens: 260,
  })
  const usage = summarizeUsage(result.totalUsage)
  const trace = {
    text: result.text,
    usage,
    estimatedUpperBoundUsd: estimateUpperBoundUsd(input.config.model, usage),
    elapsedMs: Math.round(performance.now() - startedAt),
    stepFinishReasons: result.steps.map((step) => step.finishReason),
  }
  input.budget.record(trace)
  return trace
}

export function evaluateScenario(
  expectation: ScenarioExpectation,
  observed: Pick<ScenarioTrace, "attemptedTools" | "events">,
) {
  const failures: string[] = []
  const results = observed.events.filter((event) => event.type === "formal_task_result")
  const obligations = observed.events.filter((event) => event.type === "learning_obligation")
  const corrections = observed.events.filter((event) => event.type === "evidence_correction")

  if (expectation.kind === "no_learning_write") {
    if (observed.attemptedTools.length > 0) {
      failures.push(`ordinary conversation attempted tools: ${observed.attemptedTools.join(", ")}`)
    }
    if (observed.events.length > 0) failures.push("ordinary conversation created learning events")
    return failures
  }

  if (expectation.kind === "verification_without_result") {
    if (results.length > 0) failures.push("selected explanation created a formal task result")
    const matching = obligations.filter(
      (event) => event.kind === "verification" && event.target === expectation.target,
    )
    if (matching.length !== 1) {
      failures.push(`expected one verification obligation, observed ${matching.length}`)
    }
    if (corrections.length > 0) failures.push("selected explanation created an unrelated correction")
    return failures
  }

  if (expectation.kind === "formal_result") {
    const matchingResult = results.filter(
      (event) =>
        event.target === expectation.target &&
        event.outcome === expectation.outcome &&
        event.assistance === expectation.assistance,
    )
    if (matchingResult.length !== 1) {
      failures.push(
        `expected one ${expectation.outcome}/${expectation.assistance} result, observed ${matchingResult.length}`,
      )
    }
    const matchingObligation = obligations.filter(
      (event) => event.target === expectation.target && event.kind === expectation.obligation,
    )
    if (matchingObligation.length !== 1) {
      failures.push(`expected one ${expectation.obligation} obligation, observed ${matchingObligation.length}`)
    }
    if (corrections.length > 0) failures.push("formal result created an unrelated correction")
    return failures
  }

  const matching = corrections.filter(
    (event) => event.interpretationId === expectation.interpretationId,
  )
  if (matching.length !== 1) {
    failures.push(`expected one correction for ${expectation.interpretationId}, observed ${matching.length}`)
  }
  if (results.length > 0) failures.push("correction created a duplicate task result")
  return failures
}

export function summarizeUsage(value: unknown): UsageSummary {
  const usage = isRecord(value) ? value : {}
  const inputDetails = isRecord(usage.inputTokenDetails) ? usage.inputTokenDetails : {}
  const outputDetails = isRecord(usage.outputTokenDetails) ? usage.outputTokenDetails : {}
  const inputTokens = finiteNumber(usage.inputTokens)
  const cacheReadTokens = finiteNumber(inputDetails.cacheReadTokens)
  const noCacheTokens = finiteNumber(inputDetails.noCacheTokens) || Math.max(0, inputTokens - cacheReadTokens)
  const outputTokens = finiteNumber(usage.outputTokens)
  const reasoningTokens = finiteNumber(outputDetails.reasoningTokens) || finiteNumber(usage.reasoningTokens)
  return {
    inputTokens,
    cacheReadTokens,
    noCacheTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: finiteNumber(usage.totalTokens) || inputTokens + outputTokens,
  }
}

export function estimateUpperBoundUsd(model: ModelID, usage: UsageSummary) {
  const price =
    model === "deepseek-v4-pro"
      ? { cacheHit: 0.003625, cacheMiss: 0.435, output: 0.87 }
      : { cacheHit: 0.0028, cacheMiss: 0.14, output: 0.28 }
  return (
    usage.cacheReadTokens * price.cacheHit +
    usage.noCacheTokens * price.cacheMiss +
    usage.outputTokens * price.output
  ) / 1_000_000
}

export async function loadApiKey() {
  const path = new URL("../../.secret", import.meta.url)
  const raw = (await Bun.file(path).text()).trim()
  if (!raw) throw new Error("DeepSeek API key file is empty")
  if (raw.startsWith("{")) {
    const value = JSON.parse(raw) as Record<string, unknown>
    const key = value.DEEPSEEK_API_KEY ?? value.apiKey
    if (typeof key === "string" && key.trim()) return key.trim()
    throw new Error("DeepSeek API key JSON has no supported key")
  }
  const assignment = raw.match(/^(?:DEEPSEEK_API_KEY|API_KEY)\s*=\s*(.+)$/m)
  return assignment?.[1]?.trim() || raw
}

export async function persistLocalRun(input: {
  suite: string
  config: RunConfig
  report: unknown
}) {
  const directoryUrl = new URL("./.runs/", import.meta.url)
  const directoryPath = fileURLToPath(directoryUrl)
  await mkdir(directoryPath, { recursive: true })
  const recordedAt = new Date().toISOString()
  const timestamp = recordedAt.replaceAll(":", "-")
  const filename = `${timestamp}-${input.suite}-${input.config.model}.json`
  const path = fileURLToPath(new URL(filename, directoryUrl))
  await Bun.write(
    path,
    JSON.stringify(
      {
        recordedAt,
        model: deepSeekModelLabel(input.config),
        suite: input.suite,
        report: input.report,
      },
      null,
      2,
    ),
  )
  return path
}

function deepSeekProvider(apiKey: string, config: RunConfig) {
  return createOpenAICompatible({
    name: "deepseek",
    baseURL: "https://api.deepseek.com",
    apiKey,
    includeUsage: true,
    transformRequestBody(body) {
      if (config.thinking === "disabled") {
        return { ...body, thinking: { type: "disabled" } }
      }
      return {
        ...body,
        thinking: { type: "enabled" },
        reasoning_effort: config.thinking,
      }
    },
  })
}

export function deepSeekChatModel(apiKey: string, config: RunConfig) {
  return deepSeekProvider(apiKey, config).chatModel(config.model)
}

function tutorSystemPrompt(context: LearningContext) {
  return `You are the Tutor inside an agentic learning system.

The generic agent harness already handles messages, tool execution, and continuation.
You must apply the learning policy below.

Rules:
1. Ordinary clarification: answer normally and call no learning tool.
2. Selected explanation: obey activityContract.onCompletion. If it is verification_obligation, teach and create exactly one verification obligation. If it is none, teach without a learning write. Never record mastery or a formal task result for an explanation.
3. Formal assessment result: grade against the supplied task context. Record exactly one formal result with real assistance conditions. Then create targeted review for an incorrect/partial result, or verification for a hinted correct result.
4. Correction: correct the cited interpretation; do not create a duplicate task result.
5. Never infer global mastery, alter curriculum structure, or invent an unobserved result.
6. Use the exact task IDs, attempt IDs, source references, targets, and assistance conditions from context.
7. After any tool calls, give the learner a concise natural continuation.

Learning context JSON:
${JSON.stringify(context)}`
}

function learningTools(state: LearningEvent[], context: LearningContext) {
  return {
    record_formal_task_result: tool({
      description:
        "Record the result of the currently active formal learning task. Never use for ordinary questions or explanations.",
      inputSchema: z.object({
        taskId: z.string(),
        attemptId: z.string(),
        sourceRef: z.string(),
        target: z.string(),
        outcome: z.enum(["correct", "incorrect", "partial"]),
        assistance: z.enum(["none", "hint"]),
        gradingBasis: z.string().min(1).max(300),
      }),
      execute: async (event) => {
        if (context.interactionKind !== "formal_assessment_result") {
          throw new Error("No formal assessment result is active")
        }
        if (
          event.taskId !== context.task.taskId ||
          event.attemptId !== context.task.attemptId ||
          event.sourceRef !== context.sourceRef ||
          event.target !== context.target
        ) {
          throw new Error("Formal result identifiers do not match the active task")
        }
        if (event.assistance !== context.task.assistance) {
          throw new Error("Recorded assistance does not match observed conditions")
        }
        state.push({ type: "formal_task_result", ...event })
        return { accepted: true, resultIndex: state.length - 1 }
      },
    }),
    create_learning_obligation: tool({
      description:
        "Create targeted future learning work after selected teaching or a formal result. This is not mastery evidence.",
      inputSchema: z.object({
        kind: z.enum(["verification", "targeted_review"]),
        sourceRef: z.string(),
        target: z.string(),
        reason: z.string().min(1).max(300),
      }),
      execute: async (event) => {
        if (context.interactionKind === "ordinary_clarification" || context.interactionKind === "correction") {
          throw new Error("This interaction cannot create a learning obligation")
        }
        if (
          context.interactionKind === "selected_explanation" &&
          context.activityContract.onCompletion !== "verification_obligation"
        ) {
          throw new Error("The declared activity contract requires no learning obligation")
        }
        if (event.sourceRef !== context.sourceRef || event.target !== context.target) {
          throw new Error("Obligation provenance does not match learning context")
        }
        state.push({ type: "learning_obligation", ...event })
        return { accepted: true, obligationIndex: state.length - 1 }
      },
    }),
    correct_evidence_interpretation: tool({
      description:
        "Retract or supersede a cited prior evidence interpretation after a provenance-bearing correction.",
      inputSchema: z.object({
        interpretationId: z.string(),
        action: z.enum(["retract", "supersede"]),
        sourceRef: z.string(),
        reason: z.string().min(1).max(300),
      }),
      execute: async (event) => {
        if (context.interactionKind !== "correction") throw new Error("No correction is active")
        if (
          event.interpretationId !== context.interpretationId ||
          event.sourceRef !== context.sourceRef
        ) {
          throw new Error("Correction provenance does not match learning context")
        }
        state.push({ type: "evidence_correction", ...event })
        return { accepted: true, correctionIndex: state.length - 1 }
      },
    }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function formatError(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
