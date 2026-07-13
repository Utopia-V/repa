import {
  generateText,
  stepCountIs,
  tool,
  type ModelMessage,
  type ToolApprovalResponse,
} from "ai"
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

const MAX_OUTPUT_TOKENS = 2_500

async function approvalBranches(apiKey: string, config: RunConfig, budget: BudgetTracker) {
  const executions: Array<{ operationId: string; scope: string }> = []
  const tools = {
    external_learning_write: tool({
      description: "Perform one external, reviewable learning-data write.",
      inputSchema: z.object({
        operationId: z.literal("approval:write-1"),
        scope: z.literal("external"),
      }),
      needsApproval: true,
      execute: async (input) => {
        executions.push(input)
        return { accepted: true, executionIndex: executions.length - 1 }
      },
    }),
  }
  const system = `Call external_learning_write exactly once with the supplied identifiers.
If execution is denied, do not retry the call. Explain the final outcome in one sentence.`
  const initialMessages: ModelMessage[] = [
    {
      role: "user",
      content:
        "Perform operationId=approval:write-1 with scope=external. This operation requires explicit approval.",
    },
  ]

  budget.assertCanStart(1)
  const first = await generateText({
    model: deepSeekChatModel(apiKey, config),
    system,
    messages: initialMessages,
    tools,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })
  const firstUsage = summarizeUsage(first.totalUsage)
  const firstReasons = first.steps.map((step) => step.finishReason)
  budget.record({
    estimatedUpperBoundUsd: estimateUpperBoundUsd(config.model, firstUsage),
    stepFinishReasons: firstReasons,
  })
  const request = first.content.find((part) => part.type === "tool-approval-request")
  if (!request) {
    return {
      id: "approval-branches",
      passed: false,
      failure: "model did not produce a tool approval request",
      executions,
      first: { text: first.text, content: first.content, usage: firstUsage },
    }
  }
  const baseMessages: ModelMessage[] = [...initialMessages, ...first.response.messages]

  const approvedResponse: ToolApprovalResponse = {
    type: "tool-approval-response",
    approvalId: request.approvalId,
    approved: true,
    reason: "Controlled experiment approval",
  }
  budget.assertCanStart(4)
  const approved = await generateText({
    model: deepSeekChatModel(apiKey, config),
    system,
    messages: [
      ...baseMessages,
      { role: "tool", content: [approvedResponse] },
    ],
    tools,
    stopWhen: stepCountIs(4),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })
  const approvedUsage = summarizeUsage(approved.totalUsage)
  const approvedReasons = approved.steps.map((step) => step.finishReason)
  budget.record({
    estimatedUpperBoundUsd: estimateUpperBoundUsd(config.model, approvedUsage),
    stepFinishReasons: approvedReasons,
  })
  const executionCountAfterApproval = executions.length

  const deniedResponse: ToolApprovalResponse = {
    type: "tool-approval-response",
    approvalId: request.approvalId,
    approved: false,
    reason: "Controlled experiment denial",
  }
  budget.assertCanStart(2)
  const denied = await generateText({
    model: deepSeekChatModel(apiKey, config),
    system,
    messages: [
      ...baseMessages,
      { role: "tool", content: [deniedResponse] },
    ],
    tools,
    stopWhen: stepCountIs(2),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })
  const deniedUsage = summarizeUsage(denied.totalUsage)
  const deniedReasons = denied.steps.map((step) => step.finishReason)
  budget.record({
    estimatedUpperBoundUsd: estimateUpperBoundUsd(config.model, deniedUsage),
    stepFinishReasons: deniedReasons,
  })

  return {
    id: "approval-branches",
    passed: executionCountAfterApproval === 1 && executions.length === 1,
    failure: null,
    approvalId: request.approvalId,
    requestedTool: request.toolCall.toolName,
    requestedInput: request.toolCall.input,
    executionCountBeforeDecision: 0,
    executionCountAfterApproval,
    executionCountAfterDenial: executions.length,
    approvedText: approved.text,
    deniedText: denied.text,
    stepFinishReasons: {
      request: firstReasons,
      approved: approvedReasons,
      denied: deniedReasons,
    },
    usage: mergeUsage(firstUsage, approvedUsage, deniedUsage),
  }
}

type CancellationState = {
  started: boolean
  signalPresent: boolean
  signalObservedAborted: boolean
  abortHandlerRan: boolean
  committed: boolean
}

async function cancellationCase(
  apiKey: string,
  config: RunConfig,
  cooperative: boolean,
) {
  const state: CancellationState = {
    started: false,
    signalPresent: false,
    signalObservedAborted: false,
    abortHandlerRan: false,
    committed: false,
  }
  const controller = new AbortController()
  let abortScheduled = false
  let finalText = ""
  let fatalError: string | null = null
  const startedAt = performance.now()

  try {
    const result = await generateText({
      model: deepSeekChatModel(apiKey, config),
      system:
        "Call long_local_effect exactly once. Do not write prose before the tool call.",
      prompt: `Run the ${cooperative ? "cooperative" : "uncooperative"} local effect now.`,
      tools: {
        long_local_effect: tool({
          description: "A controlled local effect used to observe cancellation behavior.",
          inputSchema: z.object({
            operationId: z.literal(
              cooperative ? "cancel:cooperative-1" : "cancel:uncooperative-1",
            ),
          }),
          execute: async (_input, options) => {
            state.started = true
            state.signalPresent = Boolean(options.abortSignal)
            if (cooperative) {
              await waitCooperatively(1_500, options.abortSignal, state)
            } else {
              await delay(180)
              state.signalObservedAborted = Boolean(options.abortSignal?.aborted)
            }
            state.committed = true
            return { accepted: true }
          },
        }),
      },
      abortSignal: controller.signal,
      stopWhen: stepCountIs(4),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      experimental_onToolCallStart() {
        if (abortScheduled) return
        abortScheduled = true
        setTimeout(() => controller.abort("controlled-user-interrupt"), 25)
      },
    })
    finalText = result.text
  } catch (error) {
    fatalError = formatError(error)
  }

  await delay(250)
  state.signalObservedAborted ||= controller.signal.aborted
  return {
    id: cooperative ? "cancellation-cooperative-tool" : "cancellation-uncooperative-tool",
    passed:
      state.started &&
      controller.signal.aborted &&
      (cooperative
        ? state.abortHandlerRan && !state.committed
        : !state.abortHandlerRan && state.committed),
    cooperative,
    state,
    controllerAborted: controller.signal.aborted,
    finalText,
    fatalError,
    elapsedMs: Math.round(performance.now() - startedAt),
  }
}

function waitCooperatively(ms: number, signal: AbortSignal | undefined, state: CancellationState) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    if (!signal) return
    const abort = () => {
      clearTimeout(timer)
      state.abortHandlerRan = true
      state.signalObservedAborted = true
      const error = new Error("Controlled tool observed abort signal before commit")
      error.name = "AbortError"
      reject(error)
    }
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  })
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function mergeUsage(...values: UsageSummary[]): UsageSummary {
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

const config = deepSeekRunConfig(process.argv[2])
const apiKey = await loadApiKey()
const budget = new BudgetTracker({ maxApiSteps: 32 })
const traces = [
  await approvalBranches(apiKey, config, budget),
  await cancellationCase(apiKey, config, true),
  await cancellationCase(apiKey, config, false),
]
const report = {
  suite: "approval-and-cancellation",
  model: deepSeekModelLabel(config),
  config,
  passed: traces.every((trace) => trace.passed),
  traces,
  budget: {
    recordedApiSteps: budget.apiSteps,
    recordedEstimatedUpperBoundUsd: Number(budget.spentUsd.toFixed(8)),
    note: "aborted calls may be billed but do not return complete usage to this runner",
  },
}

const rawTracePath = await persistLocalRun({ suite: report.suite, config, report })
console.log(JSON.stringify({ rawTracePath, ...report }, null, 2))
