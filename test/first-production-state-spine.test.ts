import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  beginTutorModelOperation,
  compileTutorContext,
} from "../src/tutor/compile-context"
import {
  executeLearnerSteeringTool,
  listTimedLearnerSteering,
} from "../src/tutor/learner-steering"
import {
  admitUserTurn,
  appendSessionItem,
  beginModelOperation,
  createSession,
  finishModelOperation,
  finishTurn,
  readLatestTurnEventAt,
  readModelOperation,
  readSessionItems,
  readTurn,
  readToolInvocation,
  recordToolInvocation,
  recoverOrphanedRuntime,
} from "../src/interaction/records"
import { openRepaDatabase } from "../src/storage/open-database"

type RepaDatabase = ReturnType<typeof openRepaDatabase>

const temporaryDirectories: string[] = []
const openDatabases: RepaDatabase[] = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A reopen test may already have closed this handle.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        rmSync(directory, { recursive: true, force: true })
        break
      } catch (error) {
        if (
          attempt >= 10 ||
          !(error instanceof Error && "code" in error && error.code === "EBUSY")
        ) {
          throw error
        }
        Bun.gc(true)
        await Bun.sleep(40)
      }
    }
  }
})

function epoch(value: string) {
  return new Date(value).getTime()
}

function shanghaiOffsetIso(timestamp: number) {
  return new Date(timestamp + 8 * 60 * 60_000).toISOString().replace("Z", "+08:00")
}

function openTemporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "repa-state-spine-"))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, "repa.sqlite")
  const database = openRepaDatabase(databasePath)
  openDatabases.push(database)
  return { database, databasePath }
}

function openMemoryDatabase() {
  const database = openRepaDatabase(":memory:")
  openDatabases.push(database)
  return database
}

function establishTurn(
  database: RepaDatabase,
  input: {
    sessionId: string
    turnId: string
    itemId: string
    content: string
    at: number
    limits?: { modelOperations: number; toolInvocations: number }
  },
) {
  createSession(database, { sessionId: input.sessionId, createdAt: input.at })
  return admitUserTurn(database, {
    sessionId: input.sessionId,
    turnId: input.turnId,
    itemId: input.itemId,
    content: input.content,
    createdAt: input.at,
    ...(input.limits === undefined ? {} : { limits: input.limits }),
  })
}

function startOperation(
  database: RepaDatabase,
  input: {
    sessionId: string
    turnId: string
    modelOperationId: string
    at: number
  },
) {
  const result = beginTutorModelOperation(database, {
    modelOperationId: input.modelOperationId,
    turnId: input.turnId,
    sessionId: input.sessionId,
    sampledAt: input.at,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: "tutor-policy:test-v1",
  })
  if (result.replayed || "exhausted" in result) {
    throw new Error(`Expected a new model operation: ${input.modelOperationId}`)
  }
  return result.context
}

function recordRetainInvocation(
  database: RepaDatabase,
  input: {
    invocationId: string
    modelOperationId: string
    excerpt: string
    validUntil: number
    at: number
  },
) {
  recordToolInvocation(database, {
    invocationId: input.invocationId,
    modelOperationId: input.modelOperationId,
    toolName: "retain_learning_wide_timed_steering",
    input: {
      verbatimExcerpt: input.excerpt,
      validUntil: shanghaiOffsetIso(input.validUntil),
    },
    createdAt: input.at,
  })
}

function executeTool(database: RepaDatabase, invocationId: string, executedAt: number) {
  return executeLearnerSteeringTool(database, { invocationId, executedAt })
}

describe("first production state and context spine", () => {
  test("admitted input identity, rather than repeated text, determines a new occurrence", () => {
    const { database } = openTemporaryDatabase()
    const at = epoch("2026-07-11T08:00:00+08:00")

    expect(
      establishTurn(database, {
        sessionId: "session:identity",
        turnId: "turn:first",
        itemId: "item:first",
        content: "继续",
        at,
        limits: { modelOperations: 7, toolInvocations: 9 },
      }),
    ).toEqual({ replayed: false, sessionSequence: 1 })

    expect(() =>
      admitUserTurn(database, {
        sessionId: "session:identity",
        turnId: "turn:first",
        itemId: "item:first",
        content: "继续",
        createdAt: at,
      }),
    ).toThrow("Admitted input ID was reused with different input")
    expect(
      admitUserTurn(database, {
        sessionId: "session:identity",
        turnId: "turn:first",
        itemId: "item:first",
        content: "继续",
        createdAt: at,
        limits: { modelOperations: 7, toolInvocations: 9 },
      }),
    ).toEqual({ replayed: true, sessionSequence: 1 })
    expect(readTurn(database, "turn:first").limits).toEqual({
      modelOperations: 7,
      toolInvocations: 9,
    })
    expect(() =>
      admitUserTurn(database, {
        sessionId: "session:identity",
        turnId: "turn:first",
        itemId: "item:first",
        content: "继续",
        createdAt: at,
        limits: { modelOperations: 8, toolInvocations: 9 },
      }),
    ).toThrow("Admitted input ID was reused with different input")

    expect(() =>
      admitUserTurn(database, {
        sessionId: "session:identity",
        turnId: "turn:first",
        itemId: "item:first",
        content: "same ID, different meaning",
        createdAt: at,
      }),
    ).toThrow("Admitted input ID was reused with different input")

    finishTurn(database, { turnId: "turn:first", outcome: "completed", finishedAt: at + 1 })
    expect(
      admitUserTurn(database, {
        sessionId: "session:identity",
        turnId: "turn:second",
        itemId: "item:second",
        content: "继续",
        createdAt: at + 2,
      }),
    ).toEqual({ replayed: false, sessionSequence: 2 })
    expect(
      admitUserTurn(database, {
        sessionId: "session:identity",
        turnId: "turn:first",
        itemId: "item:first",
        content: "继续",
        createdAt: at,
        limits: { modelOperations: 7, toolInvocations: 9 },
      }),
    ).toEqual({ replayed: true, sessionSequence: 1 })

    const compiled = compileTutorContext(database, {
      sessionId: "session:identity",
      sampledAt: at + 2,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: "tutor-policy:test-v1",
    })
    expect(() =>
      beginModelOperation(database, {
        modelOperationId: "model:mutable-cut",
        turnId: "turn:second",
        sampling: {
          sessionId: "session:identity",
          sampledAt: at + 2,
          timeZone: "Asia/Shanghai",
          policyProfileRevision: "tutor-policy:test-v1",
        },
        compileContext: () => ({ ...compiled }),
      }),
    ).toThrow("immutable compiled context cut")
    const forgedPastCut = Object.freeze({ ...compiled, sampledAt: at + 1 })
    expect(() =>
      beginModelOperation(database, {
        modelOperationId: "model:past-cut",
        turnId: "turn:second",
        sampling: {
          sessionId: "session:identity",
          sampledAt: at + 1,
          timeZone: "Asia/Shanghai",
          policyProfileRevision: "tutor-policy:test-v1",
        },
        compileContext: () => forgedPastCut,
      }),
    ).toThrow("before the latest Turn event")
  })

  test("a new Turn cannot predate the latest durable event in its Session", () => {
    const database = openMemoryDatabase()

    createSession(database, { sessionId: "session:cross-turn-time", createdAt: 0 })
    admitUserTurn(database, {
      sessionId: "session:cross-turn-time",
      turnId: "turn:earlier",
      itemId: "item:user:earlier",
      content: "第一轮",
      createdAt: 10,
    })
    appendSessionItem(database, {
      sessionId: "session:cross-turn-time",
      turnId: "turn:earlier",
      itemId: "item:assistant:earlier",
      role: "assistant",
      content: "第一轮回答",
      createdAt: 100,
    })
    finishTurn(database, {
      turnId: "turn:earlier",
      outcome: "completed",
      finishedAt: 101,
    })

    expect(() =>
      admitUserTurn(database, {
        sessionId: "session:cross-turn-time",
        turnId: "turn:backdated",
        itemId: "item:user:backdated",
        content: "时钟回退后的第二轮",
        createdAt: 50,
      }),
    ).toThrow("Turn input occurs before the latest durable Session event")
    expect(() => readTurn(database, "turn:backdated")).toThrow("Unknown Turn")
    expect(readSessionItems(database, "session:cross-turn-time").map((item) => item.itemId)).toEqual([
      "item:user:earlier",
      "item:assistant:earlier",
    ])
    expect(readLatestTurnEventAt(database, "turn:earlier")).toBe(101)
  })

  test("a context cut includes terminal Turn time even when there is no assistant item", () => {
    const database = openMemoryDatabase()

    createSession(database, { sessionId: "session:failed-time", createdAt: 0 })
    admitUserTurn(database, {
      sessionId: "session:failed-time",
      turnId: "turn:failed",
      itemId: "item:user:failed-time",
      content: "这一轮会失败",
      createdAt: 10,
    })
    finishTurn(database, {
      turnId: "turn:failed",
      outcome: "failed",
      finishedAt: 100,
    })

    expect(() =>
      compileTutorContext(database, {
        sessionId: "session:failed-time",
        sampledAt: 51,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }),
    ).toThrow("Context cut occurs before durable Session history")
    expect(() =>
      admitUserTurn(database, {
        sessionId: "session:failed-time",
        turnId: "turn:after-failure",
        itemId: "item:user:after-failure",
        content: "失败后的下一轮",
        createdAt: 50,
      }),
    ).toThrow("Turn input occurs before the latest durable Session event")
  })

  test("Session chronology allows equal timestamps and does not couple different Sessions", () => {
    const database = openMemoryDatabase()

    createSession(database, { sessionId: "session:time-a", createdAt: 0 })
    admitUserTurn(database, {
      sessionId: "session:time-a",
      turnId: "turn:time-a:first",
      itemId: "item:time-a:first",
      content: "A 的第一轮",
      createdAt: 10,
    })
    finishTurn(database, {
      turnId: "turn:time-a:first",
      outcome: "failed",
      finishedAt: 100,
    })
    expect(
      admitUserTurn(database, {
        sessionId: "session:time-a",
        turnId: "turn:time-a:equal",
        itemId: "item:time-a:equal",
        content: "与上一事件同一毫秒",
        createdAt: 100,
      }),
    ).toEqual({ replayed: false, sessionSequence: 2 })

    createSession(database, { sessionId: "session:time-b", createdAt: 0 })
    expect(
      admitUserTurn(database, {
        sessionId: "session:time-b",
        turnId: "turn:time-b:first",
        itemId: "item:time-b:first",
        content: "B 有自己的时间线",
        createdAt: 50,
      }),
    ).toMatchObject({ replayed: false })
  })

  test("the generic model-operation boundary rejects backdated legacy Session history", () => {
    const database = openMemoryDatabase()

    createSession(database, { sessionId: "session:legacy-time", createdAt: 0 })
    admitUserTurn(database, {
      sessionId: "session:legacy-time",
      turnId: "turn:legacy:first",
      itemId: "item:legacy:first",
      content: "旧版本先接纳的第一轮",
      createdAt: 10,
    })
    finishTurn(database, {
      turnId: "turn:legacy:first",
      outcome: "failed",
      finishedAt: 100,
    })

    // Reproduce a database that the pre-frontier implementation could create.
    database
      .query(`
        INSERT INTO turn (
          turn_id, session_id, status, model_operation_limit,
          tool_invocation_limit, started_at
        ) VALUES (?1, ?2, 'running', 4, 8, ?3)
      `)
      .run("turn:legacy:backdated", "session:legacy-time", 50)
    database
      .query(`
        INSERT INTO session_item (item_id, session_id, turn_id, role, content, created_at)
        VALUES (?1, ?2, ?3, 'user', ?4, ?5)
      `)
      .run(
        "item:legacy:backdated",
        "session:legacy-time",
        "turn:legacy:backdated",
        "旧版本错误接纳的第二轮",
        50,
      )

    const permissiveCut = Object.freeze({
      sessionId: "session:legacy-time",
      sessionSequence: 2,
      stateRevision: 0,
      stateTransitionAt: 0,
      policyProfileRevision: "tutor-policy:test-v1",
      sampledAt: 51,
      timeZone: "Asia/Shanghai",
    })
    expect(() =>
      beginModelOperation(database, {
        modelOperationId: "model:legacy:backdated",
        turnId: "turn:legacy:backdated",
        sampling: {
          sessionId: "session:legacy-time",
          sampledAt: 51,
          timeZone: "Asia/Shanghai",
          policyProfileRevision: "tutor-policy:test-v1",
        },
        compileContext: () => permissiveCut,
      }),
    ).toThrow("Model context cut occurs before durable Session history")
  })

  test("one semantic steering effect can settle several physical invocations", () => {
    const { database, databasePath } = openTemporaryDatabase()
    const at = epoch("2026-07-11T08:00:00+08:00")
    const validUntil = epoch("2026-07-12T00:00:00+08:00")
    establishTurn(database, {
      sessionId: "session:morning",
      turnId: "turn:morning",
      itemId: "item:morning",
      content: "我已经读完这一节了；今天先别测我。",
      at,
    })
    const initialContext = startOperation(database, {
      sessionId: "session:morning",
      turnId: "turn:morning",
      modelOperationId: "model:morning",
      at: at + 1,
    })
    expect(initialContext.stateRevision).toBe(0)

    recordRetainInvocation(database, {
      invocationId: "call:first",
      modelOperationId: "model:morning",
      excerpt: "今天先别测我",
      validUntil,
      at: at + 2,
    })
    const first = executeTool(database, "call:first", at + 2)
    expect(first).toMatchObject({
      ok: true,
      disposition: "applied",
      operationRevision: 1,
      currentRevision: 1,
      steeringState: "active",
    })
    if (!first.ok) throw new Error("Expected first steering effect to commit")
    expect(() =>
      compileTutorContext(database, {
        sessionId: "session:morning",
        sampledAt: at + 1,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }),
    ).toThrow("before the latest durable state transition")
    expect(executeTool(database, "call:first", at + 100)).toEqual(first)
    expect(() =>
      recordToolInvocation(database, {
        invocationId: "call:first",
        modelOperationId: "model:morning",
        toolName: "retain_learning_wide_timed_steering",
        input: { verbatimExcerpt: "今天先别测我", validUntil: validUntil + 1 },
        createdAt: at + 2,
      }),
    ).toThrow("Tool invocation ID was reused with different input")

    recordRetainInvocation(database, {
      invocationId: "call:resampled",
      modelOperationId: "model:morning",
      excerpt: "今天先别测我",
      validUntil,
      at: at + 3,
    })
    expect(executeTool(database, "call:resampled", at + 3)).toEqual({
      ...first,
      disposition: "already_applied",
    })
    expect(listTimedLearnerSteering(database)).toHaveLength(1)
    expect(readToolInvocation(database, "call:first").status).toBe("completed")
    expect(readToolInvocation(database, "call:resampled").status).toBe("completed")

    expect(() =>
      beginTutorModelOperation(database, {
        modelOperationId: "model:overlapping",
        turnId: "turn:morning",
        sessionId: "session:morning",
        sampledAt: at + 4,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }),
    ).toThrow("Turn already has a running model operation")

    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)
    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    recoverOrphanedRuntime(reopened, { recoveredAt: at + 20 * 60_000 })

    establishTurn(reopened, {
      sessionId: "session:continue",
      turnId: "turn:continue",
      itemId: "item:continue",
      content: "继续",
      at: at + 25 * 60_000,
    })
    const sameDay = compileTutorContext(reopened, {
      sessionId: "session:continue",
      sampledAt: at + 25 * 60_000,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: "tutor-policy:test-v1",
    })
    expect(sameDay.stateRevision).toBe(1)
    expect(sameDay.stateTransitionAt).toBe(at + 2)
    expect(sameDay.activeLearnerSteering).toEqual([
      expect.objectContaining({
        effectId: first.ok ? first.steeringEffectId : "unreachable",
        sourceItemId: "item:morning",
        verbatimExcerpt: "今天先别测我",
        validUntil,
      }),
    ])
    expect(sameDay.policyPrompt).toContain("Active learning-wide learner steering")
    expect(sameDay.policyPrompt).toContain("今天先别测我")
    expect(sameDay.policyPrompt).toContain("item:morning")
    expect(sameDay.policyPrompt).toContain(first.steeringEffectId)
    expect(Object.isFrozen(sameDay)).toBe(true)
    expect(Object.isFrozen(sameDay.activeLearnerSteering)).toBe(true)

    const expired = compileTutorContext(reopened, {
      sessionId: "session:continue",
      sampledAt: validUntil,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: "tutor-policy:test-v1",
    })
    expect(expired.activeLearnerSteering).toEqual([])
    expect(expired.stateRevision).toBe(1)
    expect(listTimedLearnerSteering(reopened)).toHaveLength(1)

  })

  test("semantic replay precedes stale rejection while conflicting meaning fails", () => {
    // This oracle does not exercise reopen or cross-connection behavior. Keeping
    // it in memory avoids retaining a Windows file solely for prepared-statement
    // diagnostics that remain live until Bun's test frame is collected.
    const database = openMemoryDatabase()
    const at = epoch("2026-07-11T09:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")

    establishTurn(database, {
      sessionId: "session:first",
      turnId: "turn:first",
      itemId: "item:first",
      content: "今天不要安排测试。",
      at,
    })
    startOperation(database, {
      sessionId: "session:first",
      turnId: "turn:first",
      modelOperationId: "model:first",
      at: at + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:first",
      modelOperationId: "model:first",
      excerpt: "今天不要安排测试",
      validUntil: midnight,
      at: at + 2,
    })
    const first = executeTool(database, "call:first", at + 2)
    expect(first.ok).toBe(true)

    recordRetainInvocation(database, {
      invocationId: "call:conflict",
      modelOperationId: "model:first",
      excerpt: "今天不要安排测试",
      validUntil: midnight + 24 * 60 * 60_000,
      at: at + 3,
    })
    expect(executeTool(database, "call:conflict", at + 3)).toMatchObject({
      ok: false,
      code: "semantic_conflict",
    })
    expect(listTimedLearnerSteering(database)).toHaveLength(1)

    establishTurn(database, {
      sessionId: "session:stale",
      turnId: "turn:stale",
      itemId: "item:stale",
      content: "今晚先别提问。",
      at: at + 10,
    })
    startOperation(database, {
      sessionId: "session:stale",
      turnId: "turn:stale",
      modelOperationId: "model:stale",
      at: at + 11,
    })

    establishTurn(database, {
      sessionId: "session:intervening",
      turnId: "turn:intervening",
      itemId: "item:intervening",
      content: "下午先不要给我练习。",
      at: at + 20,
    })
    startOperation(database, {
      sessionId: "session:intervening",
      turnId: "turn:intervening",
      modelOperationId: "model:intervening",
      at: at + 21,
    })
    recordRetainInvocation(database, {
      invocationId: "call:intervening",
      modelOperationId: "model:intervening",
      excerpt: "下午先不要给我练习",
      validUntil: midnight,
      at: at + 22,
    })
    expect(executeTool(database, "call:intervening", at + 22)).toMatchObject({
      ok: true,
      currentRevision: 2,
    })

    recordRetainInvocation(database, {
      invocationId: "call:stale-new-effect",
      modelOperationId: "model:stale",
      excerpt: "今晚先别提问",
      validUntil: midnight,
      at: at + 23,
    })
    expect(executeTool(database, "call:stale-new-effect", at + 23)).toMatchObject({
      ok: false,
      code: "stale_revision",
      actualRevision: 2,
      expectedRevision: 1,
    })

    recordRetainInvocation(database, {
      invocationId: "call:old-effect-after-state-advanced",
      modelOperationId: "model:first",
      excerpt: "今天不要安排测试",
      validUntil: midnight,
      at: at + 24,
    })
    expect(
      executeTool(database, "call:old-effect-after-state-advanced", at + 24),
    ).toMatchObject({
      ok: true,
      disposition: "already_applied",
      operationRevision: 1,
      currentRevision: 2,
    })
  })

  test("a new admitted source can repeat text and a later source can retract it", () => {
    const { database } = openTemporaryDatabase()
    const at = epoch("2026-07-11T10:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")

    establishTurn(database, {
      sessionId: "session:source-one",
      turnId: "turn:source-one",
      itemId: "item:source-one",
      content: "今天先别测我。",
      at,
    })
    startOperation(database, {
      sessionId: "session:source-one",
      turnId: "turn:source-one",
      modelOperationId: "model:source-one",
      at: at + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:source-one",
      modelOperationId: "model:source-one",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: at + 2,
    })
    const first = executeTool(database, "call:source-one", at + 2)
    if (!first.ok) throw new Error("Expected first steering effect to commit")

    establishTurn(database, {
      sessionId: "session:source-two",
      turnId: "turn:source-two",
      itemId: "item:source-two",
      content: "今天先别测我。",
      at: at + 10,
    })
    startOperation(database, {
      sessionId: "session:source-two",
      turnId: "turn:source-two",
      modelOperationId: "model:source-two",
      at: at + 11,
    })
    recordRetainInvocation(database, {
      invocationId: "call:source-two",
      modelOperationId: "model:source-two",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: at + 12,
    })
    const second = executeTool(database, "call:source-two", at + 12)
    expect(second).toMatchObject({ ok: true, disposition: "applied", currentRevision: 2 })
    expect(listTimedLearnerSteering(database)).toHaveLength(2)

    const orderedPolicy = compileTutorContext(database, {
      sessionId: "session:source-two",
      sampledAt: at + 13,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: "tutor-policy:test-v1",
    })
    expect(orderedPolicy.activeLearnerSteering.map((entry) => entry.sourceItemId)).toEqual([
      "item:source-one",
      "item:source-two",
    ])
    expect(orderedPolicy.policyPrompt).toContain("the later entry wins")

    establishTurn(database, {
      sessionId: "session:correction",
      turnId: "turn:correction",
      itemId: "item:correction",
      content: "我改主意了，第一条不用再遵守。",
      at: at + 20,
    })
    startOperation(database, {
      sessionId: "session:correction",
      turnId: "turn:correction",
      modelOperationId: "model:correction",
      at: at + 21,
    })
    recordToolInvocation(database, {
      invocationId: "call:withdraw-first",
      modelOperationId: "model:correction",
      toolName: "withdraw_learning_wide_timed_steering",
      input: { steeringEffectId: first.steeringEffectId },
      createdAt: at + 22,
    })
    const withdrawal = executeTool(database, "call:withdraw-first", at + 22)
    expect(withdrawal).toMatchObject({
      ok: true,
      disposition: "applied",
      currentRevision: 3,
      steeringEffectId: first.steeringEffectId,
      steeringState: "retracted",
    })
    if (!withdrawal.ok) throw new Error("Expected steering withdrawal to commit")
    expect(readToolInvocation(database, "call:withdraw-first").effectId).toBe(
      withdrawal.operationEffectId,
    )

    const history = listTimedLearnerSteering(database)
    expect(history[0]).toMatchObject({
      effectId: first.steeringEffectId,
      sourceItemId: "item:source-one",
      retractionSourceItemId: "item:correction",
    })
    expect(history[1]).toMatchObject({
      effectId: second.ok ? second.steeringEffectId : "unreachable",
      sourceItemId: "item:source-two",
      retractionSourceItemId: undefined,
    })

    recordRetainInvocation(database, {
      invocationId: "call:replay-retracted",
      modelOperationId: "model:source-one",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: at + 23,
    })
    expect(executeTool(database, "call:replay-retracted", at + 23)).toMatchObject({
      ok: true,
      disposition: "already_applied",
      steeringEffectId: first.steeringEffectId,
      steeringState: "retracted",
      currentRevision: 3,
    })

    const context = compileTutorContext(database, {
      sessionId: "session:correction",
      sampledAt: at + 24,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: "tutor-policy:test-v1",
    })
    expect(context.activeLearnerSteering.map((entry) => entry.effectId)).toEqual([
      second.ok ? second.steeringEffectId : "unreachable",
    ])
  })

  test("effect admission and tool settlement roll back together", () => {
    const { database } = openTemporaryDatabase()
    const at = epoch("2026-07-11T11:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")

    establishTurn(database, {
      sessionId: "session:atomic",
      turnId: "turn:atomic",
      itemId: "item:atomic",
      content: "今天不要测我。",
      at,
    })
    const context = startOperation(database, {
      sessionId: "session:atomic",
      turnId: "turn:atomic",
      modelOperationId: "model:atomic",
      at: at + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:atomic",
      modelOperationId: "model:atomic",
      excerpt: "今天不要测我",
      validUntil: midnight,
      at: at + 2,
    })

    database.exec(`
      CREATE TEMP TRIGGER inject_settlement_failure
      BEFORE UPDATE OF status ON tool_invocation
      WHEN NEW.invocation_id = 'call:atomic' AND NEW.status = 'completed'
      BEGIN
        SELECT RAISE(ABORT, 'injected settlement failure');
      END;
    `)
    expect(() => executeTool(database, "call:atomic", at + 3)).toThrow(
      "injected settlement failure",
    )
    expect(listTimedLearnerSteering(database)).toEqual([])
    expect(readToolInvocation(database, "call:atomic").status).toBe("running")
    expect(
      compileTutorContext(database, {
        sessionId: "session:atomic",
        sampledAt: at + 3,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }).stateRevision,
    ).toBe(0)

    database.exec("DROP TRIGGER inject_settlement_failure")
    expect(executeTool(database, "call:atomic", at + 4)).toMatchObject({
      ok: true,
      disposition: "applied",
      currentRevision: 1,
    })

    const recorded = readModelOperation(database, "model:atomic")
    expect(recorded.context).toEqual(context)
    expect(recorded).toMatchObject({
      sessionSequence: 1,
      stateRevision: 0,
      stateTransitionAt: 0,
      policyProfileRevision: "tutor-policy:test-v1",
      sampledAt: at + 1,
      timeZone: "Asia/Shanghai",
    })
  })

  test("a newly interpreted steering effect cannot commit after it already expired", () => {
    const { database } = openTemporaryDatabase()
    const morning = epoch("2026-07-11T08:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")
    establishTurn(database, {
      sessionId: "session:late-interpretation",
      turnId: "turn:late-interpretation",
      itemId: "item:late-interpretation",
      content: "今天别测我。",
      at: morning,
    })
    startOperation(database, {
      sessionId: "session:late-interpretation",
      turnId: "turn:late-interpretation",
      modelOperationId: "model:late-interpretation",
      at: midnight + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:late-interpretation",
      modelOperationId: "model:late-interpretation",
      excerpt: "今天别测我",
      validUntil: midnight,
      at: midnight + 2,
    })
    expect(executeTool(database, "call:late-interpretation", midnight + 2)).toMatchObject({
      ok: false,
      code: "invalid_input",
    })
    expect(listTimedLearnerSteering(database)).toEqual([])
  })

  test("a later semantic replay through a new invocation reports the effect has expired", () => {
    const { database } = openTemporaryDatabase()
    const morning = epoch("2026-07-11T08:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")
    establishTurn(database, {
      sessionId: "session:expired-replay",
      turnId: "turn:expired-replay",
      itemId: "item:expired-replay",
      content: "今天先别测我。",
      at: morning,
    })
    startOperation(database, {
      sessionId: "session:expired-replay",
      turnId: "turn:expired-replay",
      modelOperationId: "model:initial-retain",
      at: morning + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:initial-retain",
      modelOperationId: "model:initial-retain",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: morning + 2,
    })
    finishModelOperation(database, {
      modelOperationId: "model:initial-retain",
      outcome: "completed",
      finishedAt: morning + 2,
    })
    expect(executeTool(database, "call:initial-retain", morning + 2)).toMatchObject({
      ok: true,
      steeringState: "active",
    })

    startOperation(database, {
      sessionId: "session:expired-replay",
      turnId: "turn:expired-replay",
      modelOperationId: "model:expired-replay",
      at: midnight + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:expired-replay",
      modelOperationId: "model:expired-replay",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: midnight + 2,
    })
    expect(executeTool(database, "call:expired-replay", midnight + 2)).toMatchObject({
      ok: true,
      disposition: "already_applied",
      steeringState: "expired",
      currentRevision: 1,
    })
  })

  test("Session output is part of Turn time for settlement and startup recovery", () => {
    const at = epoch("2026-07-11T11:30:00+08:00")
    const first = openMemoryDatabase()
    establishTurn(first, {
      sessionId: "session:item-time",
      turnId: "turn:item-time",
      itemId: "item:user:item-time",
      content: "Explain this once.",
      at,
    })
    startOperation(first, {
      sessionId: "session:item-time",
      turnId: "turn:item-time",
      modelOperationId: "model:item-time",
      at: at + 1,
    })
    appendSessionItem(first, {
      itemId: "item:assistant:item-time",
      sessionId: "session:item-time",
      turnId: "turn:item-time",
      role: "assistant",
      content: "Here is the explanation.",
      createdAt: at + 5,
    })
    expect(() => finishModelOperation(first, {
      modelOperationId: "model:item-time",
      outcome: "completed",
      finishedAt: at + 4,
    })).toThrow("Model operation cannot finish before the latest Turn event")
    expect(() => finishTurn(first, {
      turnId: "turn:item-time",
      outcome: "interrupted",
      finishedAt: at + 4,
    })).toThrow("Turn cannot finish before its latest child event")
    finishModelOperation(first, {
      modelOperationId: "model:item-time",
      outcome: "completed",
      finishedAt: at + 5,
    })
    finishTurn(first, {
      turnId: "turn:item-time",
      outcome: "completed",
      finishedAt: at + 5,
    })

    const { database, databasePath } = openTemporaryDatabase()
    establishTurn(database, {
      sessionId: "session:item-recovery",
      turnId: "turn:item-recovery",
      itemId: "item:user:item-recovery",
      content: "Explain this before restart.",
      at: at + 20,
    })
    startOperation(database, {
      sessionId: "session:item-recovery",
      turnId: "turn:item-recovery",
      modelOperationId: "model:item-recovery",
      at: at + 21,
    })
    appendSessionItem(database, {
      itemId: "item:assistant:item-recovery",
      sessionId: "session:item-recovery",
      turnId: "turn:item-recovery",
      role: "assistant",
      content: "Durable output before restart.",
      createdAt: at + 25,
    })
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)
    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    expect(() => recoverOrphanedRuntime(reopened, { recoveredAt: at + 24 })).toThrow(
      "Recovery time occurs before orphaned durable work",
    )
    expect(recoverOrphanedRuntime(reopened, { recoveredAt: at + 25 })).toEqual({
      interruptedTurns: 1,
      failedModelOperations: 1,
      failedToolInvocations: 0,
    })
  })

  test("terminal Turns and startup recovery prevent orphaned calls from writing", () => {
    const { database, databasePath } = openTemporaryDatabase()
    const at = epoch("2026-07-11T12:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")

    establishTurn(database, {
      sessionId: "session:terminal",
      turnId: "turn:terminal",
      itemId: "item:terminal",
      content: "今天先别测我。",
      at,
    })
    startOperation(database, {
      sessionId: "session:terminal",
      turnId: "turn:terminal",
      modelOperationId: "model:terminal",
      at: at + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:terminal",
      modelOperationId: "model:terminal",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: at + 2,
    })
    recordToolInvocation(database, {
      invocationId: "call:terminal-later-sibling",
      modelOperationId: "model:terminal",
      toolName: "read_material",
      input: { ref: "material:one" },
      createdAt: at + 3,
    })
    expect(() => executeTool(database, "call:terminal", at + 2)).toThrow(
      "Tool execution cannot occur before the latest Turn event",
    )
    expect(() =>
      finishModelOperation(database, {
        modelOperationId: "model:terminal",
        outcome: "completed",
        finishedAt: at + 1,
      }),
    ).toThrow("Model operation cannot finish before the latest Turn event")
    expect(() =>
      finishTurn(database, {
        turnId: "turn:terminal",
        outcome: "interrupted",
        finishedAt: at + 2,
      }),
    ).toThrow("Turn cannot finish before its latest child event")
    expect(readTurn(database, "turn:terminal").status).toBe("running")
    expect(readModelOperation(database, "model:terminal").status).toBe("running")
    expect(readToolInvocation(database, "call:terminal").status).toBe("running")
    finishTurn(database, {
      turnId: "turn:terminal",
      outcome: "interrupted",
      finishedAt: at + 3,
    })
    expect(executeTool(database, "call:terminal", at + 4)).toMatchObject({
      ok: false,
      code: "turn_terminated",
    })
    expect(listTimedLearnerSteering(database)).toEqual([])

    establishTurn(database, {
      sessionId: "session:orphan",
      turnId: "turn:orphan",
      itemId: "item:orphan",
      content: "今晚别测试。",
      at: at + 10,
    })
    startOperation(database, {
      sessionId: "session:orphan",
      turnId: "turn:orphan",
      modelOperationId: "model:orphan",
      at: at + 11,
    })
    recordRetainInvocation(database, {
      invocationId: "call:orphan",
      modelOperationId: "model:orphan",
      excerpt: "今晚别测试",
      validUntil: midnight,
      at: at + 12,
    })

    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)
    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    expect(() => recoverOrphanedRuntime(reopened, { recoveredAt: at + 11 })).toThrow(
      "Recovery time occurs before orphaned durable work",
    )
    expect(readTurn(reopened, "turn:orphan").status).toBe("running")
    expect(readModelOperation(reopened, "model:orphan").status).toBe("running")
    expect(readToolInvocation(reopened, "call:orphan").status).toBe("running")
    expect(recoverOrphanedRuntime(reopened, { recoveredAt: at + 20 })).toEqual({
      interruptedTurns: 1,
      failedModelOperations: 1,
      failedToolInvocations: 1,
    })
    expect(readTurn(reopened, "turn:orphan").status).toBe("interrupted")
    expect(readModelOperation(reopened, "model:orphan").status).toBe("failed")
    expect(readToolInvocation(reopened, "call:orphan").status).toBe("failed")
    expect(executeTool(reopened, "call:orphan", at + 21)).toMatchObject({
      ok: false,
      code: "runtime_restarted",
    })
    expect(listTimedLearnerSteering(reopened)).toEqual([])
  })

  test("separate SQLite connections settle one semantic effect and two invocations", () => {
    const { database, databasePath } = openTemporaryDatabase()
    const secondConnection = openRepaDatabase(databasePath)
    openDatabases.push(secondConnection)
    const at = epoch("2026-07-11T13:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")

    establishTurn(database, {
      sessionId: "session:two-connections",
      turnId: "turn:two-connections",
      itemId: "item:two-connections",
      content: "今天先别测我。",
      at,
    })
    startOperation(database, {
      sessionId: "session:two-connections",
      turnId: "turn:two-connections",
      modelOperationId: "model:connection-a",
      at: at + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:connection-a",
      modelOperationId: "model:connection-a",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: at + 2,
    })
    recordRetainInvocation(secondConnection, {
      invocationId: "call:connection-b",
      modelOperationId: "model:connection-a",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: at + 3,
    })
    finishModelOperation(database, {
      modelOperationId: "model:connection-a",
      outcome: "completed",
      finishedAt: at + 3,
    })

    const first = executeTool(database, "call:connection-a", at + 4)
    const second = executeTool(secondConnection, "call:connection-b", at + 5)
    expect(first).toMatchObject({ ok: true, disposition: "applied", currentRevision: 1 })
    expect(second).toMatchObject({
      ok: true,
      disposition: "already_applied",
      currentRevision: 1,
    })
    if (!first.ok || !second.ok) throw new Error("Expected both invocations to settle")
    expect(second.operationEffectId).toBe(first.operationEffectId)
    expect(listTimedLearnerSteering(secondConnection)).toHaveLength(1)
  })

  test("generic successful tool settlement does not require a learning effect", () => {
    const { database } = openTemporaryDatabase()
    const at = epoch("2026-07-11T14:00:00+08:00")
    establishTurn(database, {
      sessionId: "session:read-only-tool",
      turnId: "turn:read-only-tool",
      itemId: "item:read-only-tool",
      content: "查一下当前资料。",
      at,
    })
    startOperation(database, {
      sessionId: "session:read-only-tool",
      turnId: "turn:read-only-tool",
      modelOperationId: "model:read-only-tool",
      at: at + 1,
    })
    recordToolInvocation(database, {
      invocationId: "call:read-only-tool",
      modelOperationId: "model:read-only-tool",
      toolName: "read_material",
      input: { ref: "material:one" },
      createdAt: at + 2,
    })
    database
      .query(`
        UPDATE tool_invocation
        SET status = 'completed', result_json = ?1, settled_at = ?2
        WHERE invocation_id = ?3 AND status = 'running'
      `)
      .run(JSON.stringify({ found: true }), at + 3, "call:read-only-tool")
    expect(readToolInvocation(database, "call:read-only-tool")).toMatchObject({
      status: "completed",
      effectId: undefined,
      result: { found: true },
    })
  })

  test("retained excerpts stay source-grounded and bounded", () => {
    const { database } = openTemporaryDatabase()
    const at = epoch("2026-07-11T15:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")
    const oversizedExcerpt = "不".repeat(1_001)
    establishTurn(database, {
      sessionId: "session:bounded-excerpt",
      turnId: "turn:bounded-excerpt",
      itemId: "item:bounded-excerpt",
      content: `今天先别测我。${oversizedExcerpt}`,
      at,
    })
    startOperation(database, {
      sessionId: "session:bounded-excerpt",
      turnId: "turn:bounded-excerpt",
      modelOperationId: "model:bounded-excerpt",
      at: at + 1,
    })

    recordRetainInvocation(database, {
      invocationId: "call:ungrounded-excerpt",
      modelOperationId: "model:bounded-excerpt",
      excerpt: "这句话不在来源里",
      validUntil: midnight,
      at: at + 2,
    })
    expect(executeTool(database, "call:ungrounded-excerpt", at + 2)).toMatchObject({
      ok: false,
      code: "invalid_input",
    })
    recordRetainInvocation(database, {
      invocationId: "call:oversized-excerpt",
      modelOperationId: "model:bounded-excerpt",
      excerpt: oversizedExcerpt,
      validUntil: midnight,
      at: at + 3,
    })
    expect(executeTool(database, "call:oversized-excerpt", at + 3)).toMatchObject({
      ok: false,
      code: "invalid_input",
      message: expect.stringContaining("1000 Unicode code points"),
    })
    expect(listTimedLearnerSteering(database)).toEqual([])
    expect(
      compileTutorContext(database, {
        sessionId: "session:bounded-excerpt",
        sampledAt: at + 4,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }).stateRevision,
    ).toBe(0)
  })

  test("new state effects cannot be backdated behind a later state transition", () => {
    const { database } = openTemporaryDatabase()
    const at = epoch("2026-07-11T16:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")
    establishTurn(database, {
      sessionId: "session:chronology-a",
      turnId: "turn:chronology-a",
      itemId: "item:chronology-a",
      content: "今天先别测我。",
      at,
    })
    startOperation(database, {
      sessionId: "session:chronology-a",
      turnId: "turn:chronology-a",
      modelOperationId: "model:chronology-a",
      at: at + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:chronology-a",
      modelOperationId: "model:chronology-a",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: at + 2,
    })
    expect(executeTool(database, "call:chronology-a", at + 5)).toMatchObject({
      ok: true,
      currentRevision: 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:chronology-a-replay",
      modelOperationId: "model:chronology-a",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: at + 7,
    })

    establishTurn(database, {
      sessionId: "session:chronology-b",
      turnId: "turn:chronology-b",
      itemId: "item:chronology-b",
      content: "今天也先别安排练习。",
      at: at + 6,
    })
    startOperation(database, {
      sessionId: "session:chronology-b",
      turnId: "turn:chronology-b",
      modelOperationId: "model:chronology-b",
      at: at + 6,
    })
    recordRetainInvocation(database, {
      invocationId: "call:chronology-b",
      modelOperationId: "model:chronology-b",
      excerpt: "今天也先别安排练习",
      validUntil: midnight,
      at: at + 8,
    })
    expect(executeTool(database, "call:chronology-b", at + 20)).toMatchObject({
      ok: true,
      currentRevision: 2,
    })
    expect(executeTool(database, "call:chronology-a-replay", at + 15)).toMatchObject({
      ok: false,
      code: "illegal_transition",
    })
    const cut = compileTutorContext(database, {
      sessionId: "session:chronology-b",
      sampledAt: at + 20,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: "tutor-policy:test-v1",
    })
    expect(cut).toMatchObject({ stateRevision: 2, stateTransitionAt: at + 20 })
  })

  test("time-sensitive context is compiled when its model operation is atomically admitted", () => {
    const { database } = openTemporaryDatabase()
    const beforeMidnight = epoch("2026-07-11T23:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")
    establishTurn(database, {
      sessionId: "session:atomic-sample",
      turnId: "turn:retain-before-midnight",
      itemId: "item:retain-before-midnight",
      content: "今天先别测我。",
      at: beforeMidnight,
    })
    startOperation(database, {
      sessionId: "session:atomic-sample",
      turnId: "turn:retain-before-midnight",
      modelOperationId: "model:retain-before-midnight",
      at: beforeMidnight + 1,
    })
    recordRetainInvocation(database, {
      invocationId: "call:retain-before-midnight",
      modelOperationId: "model:retain-before-midnight",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: beforeMidnight + 2,
    })
    expect(executeTool(database, "call:retain-before-midnight", beforeMidnight + 2)).toMatchObject({
      ok: true,
      steeringState: "active",
    })
    finishModelOperation(database, {
      modelOperationId: "model:retain-before-midnight",
      outcome: "completed",
      finishedAt: beforeMidnight + 3,
    })
    finishTurn(database, {
      turnId: "turn:retain-before-midnight",
      outcome: "completed",
      finishedAt: beforeMidnight + 4,
    })

    admitUserTurn(database, {
      sessionId: "session:atomic-sample",
      turnId: "turn:sample-after-midnight",
      itemId: "item:sample-after-midnight",
      content: "继续。",
      createdAt: midnight - 2,
    })
    const previewBeforeExpiry = compileTutorContext(database, {
      sessionId: "session:atomic-sample",
      sampledAt: midnight - 1,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: "tutor-policy:test-v1",
    })
    expect(previewBeforeExpiry.activeLearnerSteering).toHaveLength(1)

    const admittedAfterExpiry = beginTutorModelOperation(database, {
      modelOperationId: "model:sample-after-midnight",
      turnId: "turn:sample-after-midnight",
      sessionId: "session:atomic-sample",
      sampledAt: midnight + 1,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: "tutor-policy:test-v1",
    })
    expect(admittedAfterExpiry).toMatchObject({
      replayed: false,
      context: { sampledAt: midnight + 1, activeLearnerSteering: [], policyPrompt: "" },
    })
    if (admittedAfterExpiry.replayed || "exhausted" in admittedAfterExpiry) {
      throw new Error("Expected the after-expiry sample to start a new model operation")
    }
    expect(readModelOperation(database, "model:sample-after-midnight").context).toEqual(
      admittedAfterExpiry.context,
    )
    expect(
      beginTutorModelOperation(database, {
        modelOperationId: "model:sample-after-midnight",
        turnId: "turn:sample-after-midnight",
        sessionId: "session:atomic-sample",
        sampledAt: midnight + 1,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }),
    ).toEqual({ replayed: true })
  })

  test("separate model and tool limits exhaust a Turn before more work starts", () => {
    const { database, databasePath } = openTemporaryDatabase()
    const at = epoch("2026-07-11T17:00:00+08:00")
    const midnight = epoch("2026-07-12T00:00:00+08:00")

    establishTurn(database, {
      sessionId: "session:model-limit",
      turnId: "turn:model-limit",
      itemId: "item:model-limit",
      content: "继续。",
      at,
      limits: { modelOperations: 1, toolInvocations: 4 },
    })
    startOperation(database, {
      sessionId: "session:model-limit",
      turnId: "turn:model-limit",
      modelOperationId: "model:within-limit",
      at: at + 1,
    })
    finishModelOperation(database, {
      modelOperationId: "model:within-limit",
      outcome: "completed",
      finishedAt: at + 2,
    })
    expect(() =>
      beginTutorModelOperation(database, {
        modelOperationId: "model:backdated-limit-attempt",
        turnId: "turn:model-limit",
        sessionId: "session:model-limit",
        sampledAt: at + 1,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }),
    ).toThrow("Model context cut occurs before the latest Turn event")
    expect(readTurn(database, "turn:model-limit").status).toBe("running")
    expect(
      beginTutorModelOperation(database, {
        modelOperationId: "model:beyond-limit",
        turnId: "turn:model-limit",
        sessionId: "session:model-limit",
        sampledAt: at + 3,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }),
    ).toEqual({
      exhausted: true,
      counter: "model_operations",
      observed: 1,
      limit: 1,
      attemptedModelOperationId: "model:beyond-limit",
    })
    expect(readTurn(database, "turn:model-limit")).toMatchObject({
      status: "exhausted",
      limits: { modelOperations: 1, toolInvocations: 4 },
      exhaustion: {
        counter: "model_operations",
        observed: 1,
        limit: 1,
        attemptedId: "model:beyond-limit",
        occurredAt: at + 3,
      },
    })
    expect(readLatestTurnEventAt(database, "turn:model-limit")).toBe(at + 3)
    expect(
      beginTutorModelOperation(database, {
        modelOperationId: "model:beyond-limit",
        turnId: "turn:model-limit",
        sessionId: "session:model-limit",
        sampledAt: at + 3,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }),
    ).toEqual({
      exhausted: true,
      counter: "model_operations",
      observed: 1,
      limit: 1,
      attemptedModelOperationId: "model:beyond-limit",
    })
    expect(() =>
      beginTutorModelOperation(database, {
        modelOperationId: "model:beyond-limit",
        turnId: "turn:model-limit",
        sessionId: "session:model-limit",
        sampledAt: at + 4,
        timeZone: "Asia/Shanghai",
        policyProfileRevision: "tutor-policy:test-v1",
      }),
    ).toThrow("Model operation ID was reused with different input")

    establishTurn(database, {
      sessionId: "session:tool-limit",
      turnId: "turn:tool-limit",
      itemId: "item:tool-limit",
      content: "今天先别测我。",
      at: at + 10,
      limits: { modelOperations: 2, toolInvocations: 1 },
    })
    startOperation(database, {
      sessionId: "session:tool-limit",
      turnId: "turn:tool-limit",
      modelOperationId: "model:tool-limit",
      at: at + 11,
    })
    recordRetainInvocation(database, {
      invocationId: "call:within-tool-limit",
      modelOperationId: "model:tool-limit",
      excerpt: "今天先别测我",
      validUntil: midnight,
      at: at + 12,
    })
    expect(() =>
      recordToolInvocation(database, {
        invocationId: "call:backdated-tool-limit-attempt",
        modelOperationId: "model:tool-limit",
        toolName: "read_material",
        input: { ref: "material:one" },
        createdAt: at + 11,
      }),
    ).toThrow("Tool invocation occurs before the latest Turn event")
    expect(readTurn(database, "turn:tool-limit").status).toBe("running")
    expect(readToolInvocation(database, "call:within-tool-limit").status).toBe("running")
    expect(
      recordToolInvocation(database, {
        invocationId: "call:beyond-tool-limit",
        modelOperationId: "model:tool-limit",
        toolName: "read_material",
        input: { ref: "material:one" },
        createdAt: at + 13,
      }),
    ).toEqual({
      exhausted: true,
      counter: "tool_invocations",
      observed: 1,
      limit: 1,
      attemptedInvocationId: "call:beyond-tool-limit",
    })
    expect(readTurn(database, "turn:tool-limit")).toMatchObject({
      status: "exhausted",
      exhaustion: {
        counter: "tool_invocations",
        observed: 1,
        limit: 1,
        attemptedId: "call:beyond-tool-limit",
        occurredAt: at + 13,
      },
    })
    expect(
      recordToolInvocation(database, {
        invocationId: "call:beyond-tool-limit",
        modelOperationId: "model:tool-limit",
        toolName: "read_material",
        input: { ref: "material:one" },
        createdAt: at + 13,
      }),
    ).toEqual({
      exhausted: true,
      counter: "tool_invocations",
      observed: 1,
      limit: 1,
      attemptedInvocationId: "call:beyond-tool-limit",
    })
    expect(() =>
      recordToolInvocation(database, {
        invocationId: "call:beyond-tool-limit",
        modelOperationId: "model:tool-limit",
        toolName: "read_material",
        input: { ref: "material:different" },
        createdAt: at + 13,
      }),
    ).toThrow("Tool invocation ID was reused with different input")
    expect(readModelOperation(database, "model:tool-limit").status).toBe("failed")
    expect(readToolInvocation(database, "call:within-tool-limit")).toMatchObject({
      status: "failed",
      error: { code: "turn_exhausted" },
    })
    expect(() => readToolInvocation(database, "call:beyond-tool-limit")).toThrow(
      "Unknown tool invocation",
    )
    expect(listTimedLearnerSteering(database)).toEqual([])

    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)
    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    expect(
      recordToolInvocation(reopened, {
        invocationId: "call:beyond-tool-limit",
        modelOperationId: "model:tool-limit",
        toolName: "read_material",
        input: { ref: "material:one" },
        createdAt: at + 13,
      }),
    ).toEqual({
      exhausted: true,
      counter: "tool_invocations",
      observed: 1,
      limit: 1,
      attemptedInvocationId: "call:beyond-tool-limit",
    })
  })
})
