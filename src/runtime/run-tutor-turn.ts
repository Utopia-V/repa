import type { Database } from "bun:sqlite"
import {
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
} from "ai"
import {
  admitUserTurn,
  appendSessionItem,
  createSession,
  finishModelOperation,
  finishTurn,
  readLastStateTransitionAt,
  readLatestSessionEventAt,
  readLatestTurnEventAt,
  readSession,
  readSessionItems,
  readTurn,
} from "../interaction/records"
import { beginTutorModelOperation, type TutorContextCut } from "../tutor/compile-context"
import { renderTutorSystemPrompt } from "../tutor/render-system-prompt"
import {
  activeTutorToolNames,
  createTutorTools,
  requireTutorStepContext,
  type TutorStepContext,
} from "./tutor-tools"

export type RunTutorTurnInput = {
  database: Database
  model: LanguageModel
  workspaceRoot: string
  learnerText: string
  identity: {
    sessionId: string
    turnId: string
    userItemId: string
    assistantItemId: string
    modelOperationId(stepNumber: number): string
    toolItemId(toolCallId: string): string
  }
  timeZone: string
  policyProfileRevision: string
  clock?: () => number
  maxModelSteps?: number
  maxOutputTokens?: number
  maxRetries?: number
  abortSignal?: AbortSignal
  onTextDelta?: (delta: string) => void | Promise<void>
}

export type RunTutorTurnOutcome = {
  text: string
  modelSteps: number
  finishReason: string
  usage: {
    inputTokens: number | undefined
    outputTokens: number | undefined
    totalTokens: number | undefined
  }
}

export async function runTutorTurn(input: RunTutorTurnInput): Promise<RunTutorTurnOutcome> {
  if (
    input.maxRetries !== undefined &&
    (!Number.isSafeInteger(input.maxRetries) || input.maxRetries < 0)
  ) {
    throw new Error("maxRetries must be a non-negative integer")
  }
  const clock = input.clock ?? Date.now
  const maxModelSteps = input.maxModelSteps ?? 12
  const sessionCreatedAt = clock()
  const existingSession = readSession(input.database, input.identity.sessionId)
  if (!existingSession) {
    createSession(input.database, {
      sessionId: input.identity.sessionId,
      createdAt: sessionCreatedAt,
    })
  }
  const userCreatedAt = Math.max(
    clock(),
    readLatestSessionEventAt(input.database, input.identity.sessionId),
  )
  admitUserTurn(input.database, {
    sessionId: input.identity.sessionId,
    turnId: input.identity.turnId,
    itemId: input.identity.userItemId,
    content: input.learnerText,
    createdAt: userCreatedAt,
    limits: {
      modelOperations: maxModelSteps,
      toolInvocations: maxModelSteps * 4,
    },
  })
  const nextCausalEventAt = () =>
    Math.max(
      clock(),
      readLatestTurnEventAt(input.database, input.identity.turnId),
      readLastStateTransitionAt(input.database),
    )

  const messages = modelVisibleSessionHistory(input.database, input.identity.sessionId)
  const tools = createTutorTools({
    database: input.database,
    identity: input.identity,
    workspaceRoot: input.workspaceRoot,
    clock: nextCausalEventAt,
    policyProfileRevision: input.policyProfileRevision,
  })

  let text = ""
  try {
    const result = streamText({
      model: input.model,
      messages,
      tools,
      toolChoice: "auto",
      stopWhen: stepCountIs(maxModelSteps),
      maxOutputTokens: input.maxOutputTokens ?? 2_000,
      ...(input.maxRetries === undefined ? {} : { maxRetries: input.maxRetries }),
      ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
      prepareStep: ({ stepNumber }) => {
        const modelOperationId = input.identity.modelOperationId(stepNumber)
        const admitted = beginTutorModelOperation(input.database, {
          modelOperationId,
          turnId: input.identity.turnId,
          sessionId: input.identity.sessionId,
          sampledAt: nextCausalEventAt(),
          timeZone: input.timeZone,
          policyProfileRevision: input.policyProfileRevision,
        })
        if ("exhausted" in admitted) {
          throw new Error(
            `Turn exhausted after ${admitted.observed} model operations (limit ${admitted.limit})`,
          )
        }
        const contextCut = admitted.context ?? requireExistingContext(admitted, modelOperationId)
        return {
          system: renderTutorSystemPrompt(contextCut),
          activeTools: activeTutorToolNames(contextCut),
          experimental_context: {
            modelOperationId,
            contextCut,
          } satisfies TutorStepContext,
        }
      },
      onStepFinish: (step) => {
        const stepContext = requireTutorStepContext(step.experimental_context)
        finishModelOperation(input.database, {
          modelOperationId: stepContext.modelOperationId,
          outcome: step.finishReason === "error" ? "failed" : "completed",
          finishedAt: nextCausalEventAt(),
        })
      },
    })

    let streamFailure: unknown
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        text += part.text
        await input.onTextDelta?.(part.text)
      } else if (part.type === "error" && streamFailure === undefined) {
        streamFailure = part.error
      } else if (part.type === "abort" && streamFailure === undefined) {
        streamFailure = new Error(part.reason || "Tutor Turn was aborted")
      }
    }
    if (streamFailure !== undefined) throw asError(streamFailure)
    const [steps, finishReason, usage] = await Promise.all([
      result.steps,
      result.finishReason,
      result.totalUsage,
    ])
    if (finishReason === "error") {
      throw new Error("Model operation failed before producing a Tutor response")
    }
    if (!text.trim()) {
      throw new Error("Tutor Turn completed without a model-visible assistant response")
    }
    appendSessionItem(input.database, {
      itemId: input.identity.assistantItemId,
      sessionId: input.identity.sessionId,
      turnId: input.identity.turnId,
      role: "assistant",
      content: text,
      createdAt: nextCausalEventAt(),
    })
    finishTurn(input.database, {
      turnId: input.identity.turnId,
      outcome: "completed",
      finishedAt: nextCausalEventAt(),
    })
    return {
      text,
      modelSteps: steps.length,
      finishReason,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      },
    }
  } catch (error) {
    const turn = readTurn(input.database, input.identity.turnId)
    if (turn.status === "running") {
      finishTurn(input.database, {
        turnId: input.identity.turnId,
        outcome: input.abortSignal?.aborted ? "interrupted" : "failed",
        finishedAt: nextCausalEventAt(),
      })
    }
    throw error
  }
}

function modelVisibleSessionHistory(database: Database, sessionId: string): ModelMessage[] {
  return readSessionItems(database, sessionId).flatMap((item): ModelMessage[] => {
    if (item.role === "user") return [{ role: "user", content: item.content }]
    if (item.role === "assistant") return [{ role: "assistant", content: item.content }]
    return []
  })
}

function requireExistingContext(
  admitted: { replayed: true } | { replayed: false; context: TutorContextCut },
  modelOperationId: string,
): TutorContextCut {
  if ("context" in admitted) return admitted.context
  throw new Error(`Model operation replay is not executable in the active runner: ${modelOperationId}`)
}

function asError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value))
}
