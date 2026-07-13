import type { Database } from "bun:sqlite"
import {
  appendSessionItem,
  readLatestTurnEventAt,
  recordToolInvocation,
  settleToolInvocationFailure,
} from "../interaction/records"
import { canonicalJson } from "../storage/canonical-json"
import type { TutorContextCut } from "../tutor/compile-context"

export type TutorStepContext = {
  modelOperationId: string
  contextCut: TutorContextCut
}

export type TutorToolRuntimeBinding = {
  database: Database
  identity: {
    sessionId: string
    turnId: string
    toolItemId(toolCallId: string): string
  }
  clock: () => number
}

export type TutorToolExecutionCoordinator = {
  claim(modelOperationId: string, invocationId: string): boolean
  enqueue<T>(task: () => Promise<T>): Promise<T>
}

export type ContextRefreshRequired = {
  ok: false
  code: "context_refresh_required"
  message: string
}

export function requireTutorStepContext(value: unknown): TutorStepContext {
  if (
    value === null ||
    typeof value !== "object" ||
    !("modelOperationId" in value) ||
    typeof value.modelOperationId !== "string" ||
    !("contextCut" in value) ||
    value.contextCut === null ||
    typeof value.contextCut !== "object"
  ) {
    throw new Error("Learning tool execution requires a trusted Tutor step context")
  }
  return value as TutorStepContext
}

export function recordInvocation(
  input: TutorToolRuntimeBinding,
  invocation: {
    invocationId: string
    modelOperationId: string
    toolName: string
    toolInput: unknown
  },
) {
  const durableInvocationId = tutorToolInvocationId(
    invocation.modelOperationId,
    invocation.invocationId,
  )
  const existing = input.database
    .query("SELECT created_at FROM tool_invocation WHERE invocation_id = ?1")
    .get(durableInvocationId) as { created_at: number } | null
  const createdAt = existing?.created_at ?? nextTutorTurnEventAt(input)
  const recorded = recordToolInvocation(input.database, {
    invocationId: durableInvocationId,
    modelOperationId: invocation.modelOperationId,
    toolName: invocation.toolName,
    input: invocation.toolInput,
    createdAt,
  })
  if ("exhausted" in recorded) {
    throw new Error(
      `Turn exhausted after ${recorded.observed} tool invocations (limit ${recorded.limit})`,
    )
  }
  return { invocationId: durableInvocationId, replayed: recorded.replayed }
}

export function appendToolReceipt(
  input: TutorToolRuntimeBinding,
  toolCallId: string,
  durableInvocationId: string,
  toolName: string,
  toolInput: unknown,
  durableOutcome: unknown,
) {
  const itemId = input.identity.toolItemId(durableInvocationId)
  const existing = input.database
    .query("SELECT created_at FROM session_item WHERE item_id = ?1")
    .get(itemId) as { created_at: number } | null
  const createdAt = existing?.created_at ?? nextTutorTurnEventAt(input)
  appendSessionItem(input.database, {
    itemId,
    sessionId: input.identity.sessionId,
    turnId: input.identity.turnId,
    role: "tool",
    content: canonicalJson({
      toolCallId,
      invocationId: durableInvocationId,
      toolName,
      input: toolInput,
      outcome: durableOutcome,
    }),
    createdAt,
  })
}

export function tutorToolInvocationId(modelOperationId: string, toolCallId: string) {
  return `tool-invocation:${canonicalJson([modelOperationId, toolCallId])}`
}

export function nextTutorTurnEventAt(input: TutorToolRuntimeBinding) {
  return Math.max(input.clock(), readLatestTurnEventAt(input.database, input.identity.turnId))
}

export function createTutorToolExecutionCoordinator(): TutorToolExecutionCoordinator {
  const claimedByModelOperation = new Map<string, string>()
  let tail: Promise<void> = Promise.resolve()
  return {
    claim(modelOperationId, invocationId) {
      const existing = claimedByModelOperation.get(modelOperationId)
      if (existing === undefined) {
        claimedByModelOperation.set(modelOperationId, invocationId)
        return true
      }
      return existing === invocationId
    },
    enqueue(task) {
      const execution = tail.then(task, task)
      tail = execution.then(
        () => undefined,
        () => undefined,
      )
      return execution
    },
  }
}

export async function executeBoundTutorCapability<TOutcome>(
  input: TutorToolRuntimeBinding,
  coordinator: TutorToolExecutionCoordinator,
  request: {
    experimentalContext: unknown
    toolCallId: string
    toolName: string
    toolInput: unknown
    mutatesLearningState: boolean
  },
  execute: (
    invocationId: string,
    executedAt: number,
  ) =>
    | { outcome: TOutcome; durableOutcome: unknown }
    | Promise<{ outcome: TOutcome; durableOutcome: unknown }>,
): Promise<TOutcome | ContextRefreshRequired> {
  return coordinator.enqueue(async () => {
    const stepContext = requireTutorStepContext(request.experimentalContext)
    const recorded = recordInvocation(input, {
      invocationId: request.toolCallId,
      modelOperationId: stepContext.modelOperationId,
      toolName: request.toolName,
      toolInput: request.toolInput,
    })

    let execution:
      | { outcome: TOutcome; durableOutcome: unknown }
      | { outcome: ContextRefreshRequired; durableOutcome: ContextRefreshRequired }
    if (
      request.mutatesLearningState &&
      !recorded.replayed &&
      !coordinator.claim(stepContext.modelOperationId, recorded.invocationId)
    ) {
      const outcome: ContextRefreshRequired = {
        ok: false,
        code: "context_refresh_required",
        message:
          "This model context already initiated a durable learning-state change. Observe the next context cut before requesting another change.",
      }
      settleToolInvocationFailure(input.database, {
        invocationId: recorded.invocationId,
        error: outcome,
        failedAt: nextTutorTurnEventAt(input),
      })
      execution = { outcome, durableOutcome: outcome }
    } else {
      execution = await execute(recorded.invocationId, nextTutorTurnEventAt(input))
    }

    appendToolReceipt(
      input,
      request.toolCallId,
      recorded.invocationId,
      request.toolName,
      request.toolInput,
      execution.durableOutcome,
    )
    return execution.outcome
  })
}
