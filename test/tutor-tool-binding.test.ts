import { afterEach, describe, expect, test } from "bun:test"
import {
  admitUserTurn,
  createSession,
  finishModelOperation,
  finishTurn,
  readSessionItems,
  readToolInvocation,
} from "../src/interaction/records"
import { executeLearnerSteeringTool } from "../src/tutor/learner-steering"
import { beginTutorModelOperation } from "../src/tutor/compile-context"
import { DEFAULT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"
import {
  createTutorToolExecutionCoordinator,
  executeBoundTutorCapability,
  tutorToolInvocationId,
} from "../src/runtime/tutor-tool-binding"
import { openRepaDatabase } from "../src/storage/open-database"

const databases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(() => {
  for (const database of databases.splice(0).reverse()) database.close()
})

describe("Tutor tool binding", () => {
  test("the per-Turn lane preserves admission order and continues after infrastructure failure", async () => {
    const coordinator = createTutorToolExecutionCoordinator()
    const events: string[] = []
    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = coordinator.enqueue(async () => {
      events.push("first:start")
      await firstBlocked
      events.push("first:end")
      return "first"
    })
    const second = coordinator.enqueue(async () => {
      events.push("second:start")
      events.push("second:end")
      return "second"
    })
    await Promise.resolve()
    expect(events).toEqual(["first:start"])
    releaseFirst()
    expect(await Promise.all([first, second])).toEqual(["first", "second"])
    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"])

    await expect(coordinator.enqueue(async () => {
      throw new Error("lane failure")
    })).rejects.toThrow("lane failure")
    await expect(coordinator.enqueue(async () => "after failure")).resolves.toBe("after failure")
  })

  test("physical replay is idempotent and provider call IDs are scoped to a model operation", async () => {
    const database = openRepaDatabase(":memory:")
    databases.push(database)
    const firstAt = Date.parse("2026-07-12T10:00:00+08:00")
    const first = startModel(database, "first", "今天不要自动考我。", firstAt)
    const firstTimes = [firstAt + 2, firstAt + 1, firstAt, firstAt - 1]
    const firstBinding = {
      database,
      identity: identity("first"),
      clock: () => firstTimes.shift() ?? firstAt + 20,
    }
    const coordinator = createTutorToolExecutionCoordinator()
    const toolInput = {
      verbatimExcerpt: "今天不要自动考我",
      validUntil: "2026-07-12T23:00:00+08:00",
    }
    const executeFirst = () => executeBoundTutorCapability(
      firstBinding,
      coordinator,
      {
        experimentalContext: {
          modelOperationId: first.modelOperationId,
          contextCut: first.context,
        },
        toolCallId: "provider-call:reused",
        toolName: "retain_learning_wide_timed_steering",
        toolInput,
        mutatesLearningState: true,
      },
      (invocationId, executedAt) => {
        const outcome = executeLearnerSteeringTool(database, { invocationId, executedAt })
        return { outcome, durableOutcome: outcome }
      },
    )

    const initial = await executeFirst()
    const replay = await executeFirst()
    expect(replay).toEqual(initial)
    const firstInvocationId = tutorToolInvocationId(
      first.modelOperationId,
      "provider-call:reused",
    )
    expect(readToolInvocation(database, firstInvocationId)).toMatchObject({
      status: "completed",
      createdAt: firstAt + 2,
      settledAt: firstAt + 2,
    })
    expect(countRows(database, "tool_invocation")).toBe(1)
    expect(readSessionItems(database, first.sessionId).filter((item) => item.role === "tool"))
      .toHaveLength(1)

    let secondMutationExecuted = false
    const blocked = await executeBoundTutorCapability(
      firstBinding,
      coordinator,
      {
        experimentalContext: {
          modelOperationId: first.modelOperationId,
          contextCut: first.context,
        },
        toolCallId: "provider-call:second-mutation",
        toolName: "retain_learning_wide_timed_steering",
        toolInput,
        mutatesLearningState: true,
      },
      (invocationId, executedAt) => {
        secondMutationExecuted = true
        const outcome = executeLearnerSteeringTool(database, { invocationId, executedAt })
        return { outcome, durableOutcome: outcome }
      },
    )
    expect(blocked).toMatchObject({ ok: false, code: "context_refresh_required" })
    expect(secondMutationExecuted).toBe(false)
    expect(readToolInvocation(database, tutorToolInvocationId(
      first.modelOperationId,
      "provider-call:second-mutation",
    )).status).toBe("failed")

    finishModelOperation(database, {
      modelOperationId: first.modelOperationId,
      outcome: "completed",
      finishedAt: firstAt + 20,
    })
    finishTurn(database, {
      turnId: first.turnId,
      outcome: "completed",
      finishedAt: firstAt + 20,
    })

    const secondAt = firstAt + 100
    const second = startModel(database, "second", "这次也不要自动考我。", secondAt)
    const secondBinding = {
      database,
      identity: identity("second"),
      clock: () => secondAt + 2,
    }
    const secondInput = {
      verbatimExcerpt: "这次也不要自动考我",
      validUntil: "2026-07-13T23:00:00+08:00",
    }
    await executeBoundTutorCapability(
      secondBinding,
      createTutorToolExecutionCoordinator(),
      {
        experimentalContext: {
          modelOperationId: second.modelOperationId,
          contextCut: second.context,
        },
        toolCallId: "provider-call:reused",
        toolName: "retain_learning_wide_timed_steering",
        toolInput: secondInput,
        mutatesLearningState: true,
      },
      (invocationId, executedAt) => {
        const outcome = executeLearnerSteeringTool(database, { invocationId, executedAt })
        return { outcome, durableOutcome: outcome }
      },
    )
    const secondInvocationId = tutorToolInvocationId(
      second.modelOperationId,
      "provider-call:reused",
    )
    expect(secondInvocationId).not.toBe(firstInvocationId)
    expect(readToolInvocation(database, secondInvocationId).status).toBe("completed")
    expect(countRows(database, "tool_invocation")).toBe(3)
  })
})

function startModel(
  database: ReturnType<typeof openRepaDatabase>,
  scope: string,
  learnerText: string,
  at: number,
) {
  const ids = identity(scope)
  createSession(database, { sessionId: ids.sessionId, createdAt: at })
  admitUserTurn(database, {
    sessionId: ids.sessionId,
    turnId: ids.turnId,
    itemId: `item:user:${scope}`,
    content: learnerText,
    createdAt: at,
  })
  const modelOperationId = `model:${scope}:0`
  const started = beginTutorModelOperation(database, {
    modelOperationId,
    turnId: ids.turnId,
    sessionId: ids.sessionId,
    sampledAt: at + 1,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
  })
  if (started.replayed || "exhausted" in started) throw new Error("Expected a new model operation")
  return {
    ...ids,
    modelOperationId,
    context: started.context,
  }
}

function identity(scope: string) {
  return {
    sessionId: `session:${scope}`,
    turnId: `turn:${scope}`,
    toolItemId: (invocationId: string) => `item:tool:${scope}:${invocationId}`,
  }
}

function countRows(database: ReturnType<typeof openRepaDatabase>, table: string) {
  const row = database.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}
