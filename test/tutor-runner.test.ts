import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider"
import { APICallError } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { readModelOperation, readSessionItems, readTurn } from "../src/interaction/records"
import { runTutorTurn } from "../src/runtime/run-tutor-turn"
import { openRepaDatabase } from "../src/storage/open-database"
import { advanceSystemState } from "../src/storage/system-state"
import { listTimedLearnerSteering } from "../src/tutor/learner-steering"
import { DEFAULT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"

const temporaryDirectories: string[] = []
const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // The test may already have closed the handle before reopening it.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("Tutor runtime", () => {
  test("learning-wide state reaches a fresh Session without replaying the old transcript", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-tutor-runner-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "repa.sqlite")
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    let now = Date.parse("2026-07-12T01:00:00+08:00")
    const clock = () => ++now
    let providerCall = 0
    const model = new MockLanguageModelV3({
      doStream: async () => {
        providerCall += 1
        if (providerCall === 1) {
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:retain-no-test",
              toolName: "retain_learning_wide_timed_steering",
              input: JSON.stringify({
                verbatimExcerpt: "今天不要自动考我",
                validUntil: "2026-07-12T23:00:00+08:00",
              }),
            },
            finish("stop"),
          ])
        }
        if (providerCall === 2) {
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "answer" },
            {
              type: "text-delta",
              id: "answer",
              delta: "好，今天先讲解和演示，不自动考你。",
            },
            { type: "text-end", id: "answer" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected provider call ${providerCall}`)
      },
    })

    const outcome = await runTutorTurn({
      database,
      model,
      workspaceRoot: directory,
      learnerText: "我想继续学对象引用。今天不要自动考我。",
      identity: {
        sessionId: "session:dogfood",
        turnId: "turn:first",
        userItemId: "item:user:first",
        assistantItemId: "item:assistant:first",
        modelOperationId: (stepNumber) => `model:first:${stepNumber}`,
        toolItemId: (toolCallId) => `item:tool:${toolCallId}`,
      },
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock,
      maxModelSteps: 4,
    })

    expect(outcome.text).toBe("好，今天先讲解和演示，不自动考你。")
    expect(outcome.modelSteps).toBe(2)
    expect(providerCall).toBe(2)
    expect(readTurn(database, "turn:first").status).toBe("completed")

    const firstCut = readModelOperation(database, "model:first:0").context as unknown as {
      activeLearnerSteering: unknown[]
    }
    const secondCut = readModelOperation(database, "model:first:1").context as unknown as {
      activeLearnerSteering: Array<{ verbatimExcerpt: string }>
    }
    expect(firstCut.activeLearnerSteering).toHaveLength(0)
    expect(secondCut.activeLearnerSteering).toEqual([
      expect.objectContaining({ verbatimExcerpt: "今天不要自动考我" }),
    ])
    expect(listTimedLearnerSteering(database)).toHaveLength(1)
    expect(readSessionItems(database, "session:dogfood").map((item) => item.role)).toEqual([
      "user",
      "tool",
      "assistant",
    ])
    database.close()

    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    expect(readTurn(reopened, "turn:first").status).toBe("completed")
    expect(listTimedLearnerSteering(reopened)).toHaveLength(1)
    expect(readSessionItems(reopened, "session:dogfood").at(-1)).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "好，今天先讲解和演示，不自动考你。",
      }),
    )

    const continuationModel = new MockLanguageModelV3({
      doStream: async () =>
        stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "continued-answer" },
          {
            type: "text-delta",
            id: "continued-answer",
            delta: "我们继续对象引用，仍然不自动测试。",
          },
          { type: "text-end", id: "continued-answer" },
          finish("stop"),
        ]),
    })
    const continuation = await runTutorTurn({
      database: reopened,
      model: continuationModel,
      workspaceRoot: directory,
      learnerText: "继续讲对象引用",
      identity: {
        sessionId: "session:fresh",
        turnId: "turn:second",
        userItemId: "item:user:second",
        assistantItemId: "item:assistant:second",
        modelOperationId: (stepNumber) => `model:second:${stepNumber}`,
        toolItemId: (toolCallId) => `item:second-tool:${toolCallId}`,
      },
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock,
    })
    expect(continuation.text).toBe("我们继续对象引用，仍然不自动测试。")
    const reopenedCut = readModelOperation(reopened, "model:second:0").context as unknown as {
      activeLearnerSteering: Array<{ verbatimExcerpt: string }>
    }
    expect(reopenedCut.activeLearnerSteering).toEqual([
      expect.objectContaining({ verbatimExcerpt: "今天不要自动考我" }),
    ])
    expect(listTimedLearnerSteering(reopened)).toHaveLength(1)
    expect(readSessionItems(reopened, "session:fresh").map((item) => item.role)).toEqual([
      "user",
      "assistant",
    ])
    expect(readSessionItems(reopened, "session:dogfood").map((item) => item.role)).toEqual([
      "user",
      "tool",
      "assistant",
    ])
    reopened.close()
  })

  test("a regressing wall clock cannot strand durable assistant output in a running Turn", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-tutor-clock-floor-"))
    temporaryDirectories.push(directory)
    const database = openRepaDatabase(join(directory, "repa.sqlite"))
    openDatabases.push(database)
    const times = [10, 11, 12, 13, 14, 13, 12]
    const model = new MockLanguageModelV3({
      doStream: async () =>
        stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "clock-answer" },
          { type: "text-delta", id: "clock-answer", delta: "时间回退也不会拆散这个回答。" },
          { type: "text-end", id: "clock-answer" },
          finish("stop"),
        ]),
    })

    const outcome = await runTutorTurn({
      database,
      model,
      workspaceRoot: directory,
      learnerText: "解释一下。",
      identity: {
        sessionId: "session:clock-floor",
        turnId: "turn:clock-floor",
        userItemId: "item:user:clock-floor",
        assistantItemId: "item:assistant:clock-floor",
        modelOperationId: (stepNumber) => `model:clock-floor:${stepNumber}`,
        toolItemId: (toolCallId) => `item:tool:clock-floor:${toolCallId}`,
      },
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => times.shift() ?? 12,
    })

    expect(outcome.text).toBe("时间回退也不会拆散这个回答。")
    expect(readTurn(database, "turn:clock-floor").status).toBe("completed")
    expect(readModelOperation(database, "model:clock-floor:0").status).toBe("completed")
    expect(readSessionItems(database, "session:clock-floor").map((item) => item.role)).toEqual([
      "user",
      "assistant",
    ])
  })

  test("a regressing wall clock is floored by prior durable events across Turns", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-tutor-session-clock-floor-"))
    temporaryDirectories.push(directory)
    const database = openRepaDatabase(join(directory, "repa.sqlite"))
    openDatabases.push(database)
    const firstTimes = [0, 10, 100, 101, 102, 103]
    const answerModel = (text: string, id: string) =>
      new MockLanguageModelV3({
        doStream: async () =>
          stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id },
            { type: "text-delta", id, delta: text },
            { type: "text-end", id },
            finish("stop"),
          ]),
      })

    await runTutorTurn({
      database,
      model: answerModel("第一轮回答。", "first-answer"),
      workspaceRoot: directory,
      learnerText: "第一轮",
      identity: {
        sessionId: "session:cross-turn-clock-floor",
        turnId: "turn:cross-turn-clock-floor:first",
        userItemId: "item:user:cross-turn-clock-floor:first",
        assistantItemId: "item:assistant:cross-turn-clock-floor:first",
        modelOperationId: (stepNumber) => `model:cross-turn-clock-floor:first:${stepNumber}`,
        toolItemId: (toolCallId) => `item:tool:cross-turn-clock-floor:first:${toolCallId}`,
      },
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => firstTimes.shift() ?? 103,
    })
    const firstFinishedAt = readTurn(database, "turn:cross-turn-clock-floor:first").finishedAt
    expect(firstFinishedAt).toBeDefined()

    await runTutorTurn({
      database,
      model: answerModel("第二轮回答。", "second-answer"),
      workspaceRoot: directory,
      learnerText: "时钟回退后的第二轮",
      identity: {
        sessionId: "session:cross-turn-clock-floor",
        turnId: "turn:cross-turn-clock-floor:second",
        userItemId: "item:user:cross-turn-clock-floor:second",
        assistantItemId: "item:assistant:cross-turn-clock-floor:second",
        modelOperationId: (stepNumber) => `model:cross-turn-clock-floor:second:${stepNumber}`,
        toolItemId: (toolCallId) => `item:tool:cross-turn-clock-floor:second:${toolCallId}`,
      },
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => 50,
    })

    const items = readSessionItems(database, "session:cross-turn-clock-floor")
    expect(items.map((item) => item.role)).toEqual(["user", "assistant", "user", "assistant"])
    expect(items[2]?.createdAt).toBe(firstFinishedAt)
    expect(readTurn(database, "turn:cross-turn-clock-floor:second").status).toBe("completed")
  })

  test("model sampling floors a regressing clock to unrelated global state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-tutor-global-clock-floor-"))
    temporaryDirectories.push(directory)
    const database = openRepaDatabase(join(directory, "repa.sqlite"))
    openDatabases.push(database)
    advanceSystemState(database, {
      expectedRevision: 0,
      expectedTransitionAt: 0,
      nextRevision: 1,
      transitionAt: 100,
    })
    let providerCalls = 0
    const model = new MockLanguageModelV3({
      doStream: async () => {
        providerCalls += 1
        return stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "global-floor-answer" },
          { type: "text-delta", id: "global-floor-answer", delta: "全局状态仍然可见。" },
          { type: "text-end", id: "global-floor-answer" },
          finish("stop"),
        ])
      },
    })

    const outcome = await runTutorTurn({
      database,
      model,
      workspaceRoot: directory,
      learnerText: "读取当前学习状态。",
      identity: {
        sessionId: "session:global-clock-floor",
        turnId: "turn:global-clock-floor",
        userItemId: "item:user:global-clock-floor",
        assistantItemId: "item:assistant:global-clock-floor",
        modelOperationId: (stepNumber) => `model:global-clock-floor:${stepNumber}`,
        toolItemId: (toolCallId) => `item:tool:global-clock-floor:${toolCallId}`,
      },
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => 50,
    })

    expect(outcome.text).toBe("全局状态仍然可见。")
    expect(providerCalls).toBe(1)
    expect(readModelOperation(database, "model:global-clock-floor:0").sampledAt).toBe(100)
    expect(readTurn(database, "turn:global-clock-floor").status).toBe("completed")
  })

  test("a provider failure terminates the Turn without inventing an assistant response", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-tutor-failure-"))
    temporaryDirectories.push(directory)
    const database = openRepaDatabase(join(directory, "repa.sqlite"))
    openDatabases.push(database)
    let now = Date.parse("2026-07-12T02:00:00+08:00")
    const model = new MockLanguageModelV3({
      doStream: async () =>
        stream([
          { type: "stream-start", warnings: [] },
          finish("error"),
        ]),
    })

    await expect(
      runTutorTurn({
        database,
        model,
        workspaceRoot: directory,
        learnerText: "继续",
        identity: {
          sessionId: "session:failure",
          turnId: "turn:failure",
          userItemId: "item:user:failure",
          assistantItemId: "item:assistant:failure",
          modelOperationId: (stepNumber) => `model:failure:${stepNumber}`,
          toolItemId: (toolCallId) => `item:tool:failure:${toolCallId}`,
        },
        timeZone: "Asia/Shanghai",
        policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
        clock: () => ++now,
      }),
    ).rejects.toThrow("Model operation failed before producing a Tutor response")

    expect(readTurn(database, "turn:failure").status).toBe("failed")
    expect(readModelOperation(database, "model:failure:0").status).toBe("failed")
    expect(readSessionItems(database, "session:failure").map((item) => item.role)).toEqual([
      "user",
    ])
  })

  test("a caller can disable hidden provider retries for an attributable Turn", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-tutor-no-retry-"))
    temporaryDirectories.push(directory)
    const database = openRepaDatabase(join(directory, "repa.sqlite"))
    openDatabases.push(database)
    let providerCalls = 0
    const transportFailure = new APICallError({
      message: "controlled transport failure",
      url: "https://provider.invalid/test",
      requestBodyValues: {},
      statusCode: 503,
      isRetryable: true,
    })
    const model = new MockLanguageModelV3({
      doStream: async () => {
        providerCalls += 1
        throw transportFailure
      },
    })

    await expect(
      runTutorTurn({
        database,
        model,
        workspaceRoot: directory,
        learnerText: "继续",
        identity: {
          sessionId: "session:no-retry",
          turnId: "turn:no-retry",
          userItemId: "item:user:no-retry",
          assistantItemId: "item:assistant:no-retry",
          modelOperationId: (stepNumber) => `model:no-retry:${stepNumber}`,
          toolItemId: (toolCallId) => `item:tool:no-retry:${toolCallId}`,
        },
        timeZone: "Asia/Shanghai",
        policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
        clock: () => 100,
        maxRetries: 0,
      }),
    ).rejects.toThrow("controlled transport failure")

    expect(providerCalls).toBe(1)
    expect(readTurn(database, "turn:no-retry").status).toBe("failed")
  })
})

function stream(parts: LanguageModelV3StreamPart[]) {
  return {
    stream: new ReadableStream<LanguageModelV3StreamPart>({
      start(controller) {
        for (const part of parts) controller.enqueue(part)
        controller.close()
      },
    }),
  }
}

function finish(
  reason: "stop" | "tool-calls" | "error",
): Extract<LanguageModelV3StreamPart, { type: "finish" }> {
  return {
    type: "finish",
    finishReason: { unified: reason, raw: reason },
    usage: emptyUsage(),
  }
}

function emptyUsage(): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: 10,
      noCache: 10,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: {
      total: 5,
      text: 5,
      reasoning: 0,
    },
  }
}
