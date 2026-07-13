import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider"
import { afterEach, describe, expect, test } from "bun:test"
import { MockLanguageModelV3 } from "ai/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  admitUserTurn,
  createSession,
  finishModelOperation,
  finishTurn,
  readModelOperation,
  readSessionItems,
  readToolInvocation,
} from "../src/interaction/records"
import {
  createFutureAttentionConcern,
  readFutureAttentionContext,
} from "../src/learning/agenda/future-attention"
import {
  createProvisionalCourse,
  readActiveCourseContext,
} from "../src/learning/curriculum/course-view"
import { runTutorTurn } from "../src/runtime/run-tutor-turn"
import { tutorToolInvocationId } from "../src/runtime/tutor-tool-binding"
import { openRepaDatabase } from "../src/storage/open-database"
import { readSystemState } from "../src/storage/system-state"
import { beginTutorModelOperation } from "../src/tutor/compile-context"
import {
  CURRENT_TUTOR_POLICY_PROFILE_REVISION,
  DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
} from "../src/tutor/policy-profile"

const temporaryDirectories: string[] = []
const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A test may close its handle before reopening the file.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("Tutor Agenda runtime", () => {
  test("one Agent loop creates, carries, and addresses future attention across Sessions", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-agenda-runtime-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "repa.sqlite")
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    createSession(database, { sessionId: "session:agenda-course", createdAt: 1 })
    admitUserTurn(database, {
      sessionId: "session:agenda-course",
      turnId: "turn:agenda-course",
      itemId: "item:user:agenda-course",
      content: "Create the object-reference course.",
      createdAt: 2,
    })
    createProvisionalCourse(database, {
      effectId: "effect:agenda-runtime-course",
      causeItemId: "item:user:agenda-course",
      learningSpaceId: "space:agenda-runtime",
      courseId: "course:agenda-runtime",
      workspaceRoot: directory,
      title: "Object references",
      items: [{ title: "Object identity" }, { title: "Aliasing" }],
      occurredAt: 3,
    })

    const oldLearnerText = "这部分没懂；明天再让我独立预测一次。"
    const purpose = "Check whether object identity can be predicted independently after a delay."
    let firstCall = 0
    const firstModel = new MockLanguageModelV3({
      doStream: async (options) => {
        firstCall += 1
        const prompt = JSON.stringify(options.prompt)
        if (firstCall === 1) {
          const tools = JSON.stringify(options.tools)
          expect(tools).toContain("create_future_attention")
          expect(tools).not.toContain("learnerRoleConstraint")
          expect(tools).toContain(
            "validUntil is an expiry, not a future activation time",
          )
          expect(tools).toContain(
            "Use this instead of retained steering for a one-time learning return",
          )
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:agenda:create",
              toolName: "create_future_attention",
              input: JSON.stringify({
                authorship: {
                  kind: "learner_requested",
                  learnerRequestExcerpt: "明天再让我独立预测一次",
                },
                reason: purpose,
                notBefore: "1970-01-01T00:00:00.105Z",
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (firstCall === 2) {
          expect(prompt).toContain(purpose)
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "created" },
            { type: "text-delta", id: "created", delta: "好，之后会按这个目的回来。" },
            { type: "text-end", id: "created" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected first Agenda provider call ${firstCall}`)
      },
    })
    let firstNow = 100
    await runTutorTurn({
      database,
      model: firstModel,
      workspaceRoot: directory,
      learnerText: oldLearnerText,
      identity: identity("agenda-first"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++firstNow,
      maxModelSteps: 4,
    })
    const course = readActiveCourseContext(database)
    if (!course) throw new Error("Agenda runtime fixture lost its active course")
    const createdContext = readFutureAttentionContext(database, {
      activeCourseId: course.courseId,
      at: firstNow,
      limit: 8,
    })
    expect(createdContext.totalOpen).toBe(1)
    const createdConcernId = createdContext.concerns[0]?.id
    if (!createdConcernId) throw new Error("Agenda runtime fixture created no concern")

    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)
    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    const revisionBeforeQuestion = readSystemState(reopened).revision
    const questionModel = new MockLanguageModelV3({
      doStream: async (options) => {
        const prompt = JSON.stringify(options.prompt)
        expect(prompt).toContain(purpose)
        expect(prompt).not.toContain(oldLearnerText)
        return stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "question" },
          {
            type: "text-delta",
            id: "question",
            delta: "先开始这次回访：请独立预测两个变量是否仍指向同一个对象。",
          },
          { type: "text-end", id: "question" },
          finish("stop"),
        ])
      },
    })
    let questionNow = 150
    await runTutorTurn({
      database: reopened,
      model: questionModel,
      workspaceRoot: directory,
      learnerText: "现在开始回访。",
      identity: identity("agenda-question-only"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++questionNow,
    })
    expect(readSystemState(reopened).revision).toBe(revisionBeforeQuestion)
    expect(readFutureAttentionContext(reopened, {
      activeCourseId: course.courseId,
      at: questionNow,
      limit: 8,
    }).totalOpen).toBe(1)

    let secondCall = 0
    const secondModel = new MockLanguageModelV3({
      doStream: async (options) => {
        secondCall += 1
        const prompt = JSON.stringify(options.prompt)
        if (secondCall === 1) {
          expect(prompt).toContain(purpose)
          expect(prompt).not.toContain(oldLearnerText)
          expect(JSON.stringify(options.tools)).toContain("address_future_attention")
          expect(prompt).toContain("concernId")
          expect(prompt).toContain(createdConcernId)
          expect(prompt).toContain("entity version 1")
          expect(prompt).not.toContain(`${createdConcernId}@v1`)
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:agenda:address",
              toolName: "address_future_attention",
              input: JSON.stringify({
                concernId: createdConcernId,
                alignmentRationale:
                  "The current learner response is the delayed independent prediction.",
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (secondCall === 2) {
          expect(prompt).not.toContain(purpose)
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "addressed" },
            { type: "text-delta", id: "addressed", delta: "这次独立预测已经完成；先看你的推理。" },
            { type: "text-end", id: "addressed" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected second Agenda provider call ${secondCall}`)
      },
    })
    let secondNow = 200
    await runTutorTurn({
      database: reopened,
      model: secondModel,
      workspaceRoot: directory,
      learnerText: "我独立判断：两个变量仍然指向同一个对象。",
      identity: identity("agenda-fresh"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++secondNow,
      maxModelSteps: 4,
    })

    expect(readFutureAttentionContext(reopened, {
      activeCourseId: course.courseId,
      at: secondNow,
      limit: 8,
    })).toEqual({ totalOpen: 0, concerns: [] })
    expect(JSON.stringify(readSessionItems(reopened, "session:agenda-fresh"))).not.toContain(
      oldLearnerText,
    )

    let correctionCall = 0
    const correctionModel = new MockLanguageModelV3({
      doStream: async (options) => {
        correctionCall += 1
        const prompt = JSON.stringify(options.prompt)
        if (correctionCall === 1) {
          expect(prompt).not.toContain(purpose)
          expect(prompt).not.toContain(oldLearnerText)
          expect(JSON.stringify(options.tools)).toContain("inspect_recent_future_attention")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:agenda:inspect-correction",
              toolName: "inspect_recent_future_attention",
              input: JSON.stringify({ offset: 0, limit: 10 }),
            },
            finish("tool-calls"),
          ])
        }
        if (correctionCall === 2) {
          expect(prompt).toContain(purpose)
          expect(prompt).toContain("addressed")
          const inspected = prompt.match(/agenda:[0-9a-f-]+/)
          if (!inspected) throw new Error("Agenda inspection returned no concern identity")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:agenda:reopen-correction",
              toolName: "reopen_future_attention",
              input: JSON.stringify({
                concernId: inspected[0],
                learnerRequestExcerpt: "你记错了",
                rationale: "The learner explicitly corrected the earlier addressed disposition.",
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (correctionCall === 3) {
          expect(prompt).toContain(purpose)
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "reopened" },
            { type: "text-delta", id: "reopened", delta: "已更正：那次回访仍然是未处理状态。" },
            { type: "text-end", id: "reopened" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected Agenda correction provider call ${correctionCall}`)
      },
    })
    let correctionNow = 300
    await runTutorTurn({
      database: reopened,
      model: correctionModel,
      workspaceRoot: directory,
      learnerText: "你记错了，我刚才只是开始思考，并没有完成那次独立检查。",
      identity: identity("agenda-correction"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++correctionNow,
      maxModelSteps: 5,
    })
    expect(readFutureAttentionContext(reopened, {
      activeCourseId: course.courseId,
      at: correctionNow,
      limit: 8,
    })).toMatchObject({
      totalOpen: 1,
      concerns: [{ id: expect.stringMatching(/^agenda:/), version: 3 }],
    })
  })

  test("ordinary explanation changes and deadline help do not invent future attention", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-agenda-zero-write-"))
    temporaryDirectories.push(directory)
    const database = openRepaDatabase(join(directory, "repa.sqlite"))
    openDatabases.push(database)
    createSession(database, { sessionId: "session:zero-write-setup", createdAt: 1 })
    admitUserTurn(database, {
      sessionId: "session:zero-write-setup",
      turnId: "turn:zero-write-setup",
      itemId: "item:user:zero-write-setup",
      content: "Set up a small course.",
      createdAt: 2,
    })
    createProvisionalCourse(database, {
      effectId: "effect:zero-write-course",
      causeItemId: "item:user:zero-write-setup",
      learningSpaceId: "space:zero-write",
      courseId: "course:zero-write",
      workspaceRoot: directory,
      title: "Linear algebra",
      items: [{ title: "Matrix multiplication" }],
      occurredAt: 3,
    })
    finishTurn(database, {
      turnId: "turn:zero-write-setup",
      outcome: "completed",
      finishedAt: 4,
    })
    const revisionBefore = readSystemState(database).revision
    const effectsBefore = countRows(database, "durable_effect")

    let providerCall = 0
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        providerCall += 1
        expect(JSON.stringify(options.tools)).toContain("create_future_attention")
        const answer = providerCall === 1
          ? "换个直观说法：矩阵乘法是在汇总一组加权贡献。"
          : "先直接处理截止作业：把这一行与这一列逐项相乘后求和。"
        return stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: `zero-write-${providerCall}` },
          { type: "text-delta", id: `zero-write-${providerCall}`, delta: answer },
          { type: "text-end", id: `zero-write-${providerCall}` },
          finish("stop"),
        ])
      },
    })
    let now = 10
    await runTutorTurn({
      database,
      model,
      workspaceRoot: directory,
      learnerText: "刚才太抽象了，换个例子当场讲清楚。",
      identity: identity("zero-write-explanation"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
    })
    await runTutorTurn({
      database,
      model,
      workspaceRoot: directory,
      learnerText: "作业今晚截止，直接帮我把这一步做懂。",
      identity: identity("zero-write-deadline"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
    })

    expect(readSystemState(database).revision).toBe(revisionBefore)
    expect(countRows(database, "durable_effect")).toBe(effectsBefore)
    expect(countRows(database, "agenda_revisit")).toBe(0)
    expect(countRows(database, "agenda_revisit_transition")).toBe(0)
  })

  test("one constrained purpose survives a read continuation without narrating control internals", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-agenda-conditional-runtime-"))
    temporaryDirectories.push(directory)
    const database = openRepaDatabase(join(directory, "repa.sqlite"))
    openDatabases.push(database)
    createSession(database, { sessionId: "session:conditional-course", createdAt: 1 })
    admitUserTurn(database, {
      sessionId: "session:conditional-course",
      turnId: "turn:conditional-course",
      itemId: "item:user:conditional-course",
      content: "Create the course.",
      createdAt: 2,
    })
    createProvisionalCourse(database, {
      effectId: "effect:conditional-course",
      causeItemId: "item:user:conditional-course",
      learningSpaceId: "space:conditional-runtime",
      courseId: "course:conditional-runtime",
      workspaceRoot: directory,
      title: "Object references",
      items: [{ title: "Object identity" }],
      occurredAt: 3,
    })
    const active = readActiveCourseContext(database)
    if (!active) throw new Error("Conditional runtime fixture has no active course")
    finishTurn(database, {
      turnId: "turn:conditional-course",
      outcome: "completed",
      finishedAt: 4,
    })

    createSession(database, { sessionId: "session:conditional-source", createdAt: 10 })
    admitUserTurn(database, {
      sessionId: "session:conditional-source",
      turnId: "turn:conditional-source",
      itemId: "item:user:conditional-source",
      content: "下次继续时先让我预测，再告诉我答案。",
      createdAt: 10,
    })
    beginTutorModelOperation(database, {
      modelOperationId: "model:conditional-source",
      turnId: "turn:conditional-source",
      sessionId: "session:conditional-source",
      sampledAt: 11,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
    })
    const reason = "Check whether the learner can predict alias mutation before receiving help."
    createFutureAttentionConcern(database, {
      effectId: "effect:conditional-purpose",
      concernId: "agenda:conditional-purpose",
      causeItemId: "item:user:conditional-source",
      modelOperationId: "model:conditional-source",
      target: {
        courseId: active.courseId,
        courseViewRevisionId: active.courseViewRevisionId,
        courseItemId: active.route.anchor.itemId,
      },
      authorship: {
        kind: "learner_requested",
        learnerRequestExcerpt: "先让我预测",
      },
      reason,
      learnerRoleConstraint: {
        kind: "learner_response_before_tutor_disclosure",
      },
      notBefore: 20,
      occurredAt: 12,
    })
    finishModelOperation(database, {
      modelOperationId: "model:conditional-source",
      outcome: "completed",
      finishedAt: 13,
    })
    finishTurn(database, {
      turnId: "turn:conditional-source",
      outcome: "completed",
      finishedAt: 14,
    })

    let providerCall = 0
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        providerCall += 1
        const prompt = JSON.stringify(options.prompt)
        expect(JSON.stringify(options.tools)).toContain("learnerRoleConstraint")
        expect(prompt).toContain(reason)
        expect(prompt).toContain(
          "Before explaining the answer or a decisive hint, first obtain the learner's response",
        )
        if (providerCall === 1) {
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:conditional:source",
              toolName: "read_future_attention_source",
              input: JSON.stringify({ concernId: "agenda:conditional-purpose" }),
            },
            finish("tool-calls"),
          ])
        }
        if (providerCall === 2) {
          expect(prompt).toContain("下次继续时先让我预测")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "conditional-question" },
            {
              type: "text-delta",
              id: "conditional-question",
              delta: "先不揭晓结果：如果 alias 和 original 指向同一个对象，修改 alias 后 original 会怎样？",
            },
            { type: "text-end", id: "conditional-question" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected conditional provider call ${providerCall}`)
      },
    })
    let now = 30
    const outcome = await runTutorTurn({
      database,
      model,
      workspaceRoot: directory,
      learnerText: "继续。",
      identity: identity("conditional-runtime"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: CURRENT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
    })

    expect(providerCall).toBe(2)
    expect(outcome.text).toContain("先不揭晓结果")
    expect(outcome.text).not.toContain("Agenda")
    expect(outcome.text).not.toContain("conditional")
    for (const stepNumber of [0, 1]) {
      expect(readModelOperation(
        database,
        `model:conditional-runtime:${stepNumber}`,
      ).context).toMatchObject({
        conditionalCurrentPurpose: {
          source: {
            concernId: "agenda:conditional-purpose",
            concernVersion: 1,
            exactReason: reason,
          },
          learnerRoleConstraint: {
            kind: "learner_response_before_tutor_disclosure",
          },
        },
      })
    }
    expect(readFutureAttentionContext(database, {
      activeCourseId: active.courseId,
      at: now,
      limit: 8,
    }).concerns).toMatchObject([
      { id: "agenda:conditional-purpose", eligibility: "eligible" },
    ])

    const directModel = new MockLanguageModelV3({
      doStream: async (options) => {
        const prompt = JSON.stringify(options.prompt)
        expect(prompt).toContain(reason)
        expect(prompt).toContain("The learner's explicit current request has higher priority")
        return stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "direct-answer" },
          {
            type: "text-delta",
            id: "direct-answer",
            delta: "直接答案：alias 和 original 指向同一个对象，所以通过 alias 修改会被 original 观察到。",
          },
          { type: "text-end", id: "direct-answer" },
          finish("stop"),
        ])
      },
    })
    const direct = await runTutorTurn({
      database,
      model: directModel,
      workspaceRoot: directory,
      learnerText: "这次不要让我预测，直接告诉我答案。",
      identity: identity("conditional-direct-override"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: CURRENT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
    })
    expect(direct.text).toStartWith("直接答案")
    expect(readFutureAttentionContext(database, {
      activeCourseId: active.courseId,
      at: now,
      limit: 8,
    }).concerns).toMatchObject([
      { id: "agenda:conditional-purpose", eligibility: "eligible" },
    ])
  })

  test("one sampled context cannot drive two learning-state mutations", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-agenda-one-mutation-"))
    temporaryDirectories.push(directory)
    const database = openRepaDatabase(join(directory, "repa.sqlite"))
    openDatabases.push(database)
    createSession(database, { sessionId: "session:one-mutation-setup", createdAt: 1 })
    admitUserTurn(database, {
      sessionId: "session:one-mutation-setup",
      turnId: "turn:one-mutation-setup",
      itemId: "item:user:one-mutation-setup",
      content: "Set up the course.",
      createdAt: 2,
    })
    createProvisionalCourse(database, {
      effectId: "effect:one-mutation-course",
      causeItemId: "item:user:one-mutation-setup",
      learningSpaceId: "space:one-mutation",
      courseId: "course:one-mutation",
      workspaceRoot: directory,
      title: "Graphs",
      items: [{ title: "Vertices" }, { title: "Edges" }],
      occurredAt: 3,
    })
    finishTurn(database, {
      turnId: "turn:one-mutation-setup",
      outcome: "completed",
      finishedAt: 4,
    })

    let providerCall = 0
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        providerCall += 1
        if (providerCall === 1) {
          expect(JSON.stringify(options.tools)).toContain("create_future_attention")
          expect(JSON.stringify(options.tools)).toContain("advance_course_route")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:one-mutation:create",
              toolName: "create_future_attention",
              input: JSON.stringify({
                authorship: { kind: "tutor_initiated" },
                reason: "Return later to compare vertex and edge roles after both are introduced.",
                notBefore: "1970-01-01T00:00:00.200Z",
              }),
            },
            {
              type: "tool-call",
              toolCallId: "call:one-mutation:advance",
              toolName: "advance_course_route",
              input: "{}",
            },
            finish("tool-calls"),
          ])
        }
        if (providerCall === 2) {
          expect(JSON.stringify(options.prompt)).toContain("context_refresh_required")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "one-mutation-answer" },
            {
              type: "text-delta",
              id: "one-mutation-answer",
              delta: "已保留稍后比较的学习目的；路线位置没有在同一份旧状态上继续改动。",
            },
            { type: "text-end", id: "one-mutation-answer" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected one-mutation provider call ${providerCall}`)
      },
    })
    let now = 100
    await runTutorTurn({
      database,
      model,
      workspaceRoot: directory,
      learnerText: "以后比较一下顶点和边，然后继续。",
      identity: identity("one-mutation"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
    })

    expect(countRows(database, "agenda_revisit")).toBe(1)
    expect(readActiveCourseContext(database)?.route).toMatchObject({
      version: 1,
      anchor: { title: "Vertices" },
    })
    expect(readToolInvocation(database, tutorToolInvocationId(
      "model:one-mutation:0",
      "call:one-mutation:advance",
    ))).toMatchObject({
      status: "failed",
      error: { ok: false, code: "context_refresh_required" },
    })
    const toolReceipts = readSessionItems(database, "session:one-mutation")
      .filter((item) => item.role === "tool")
    expect(toolReceipts).toHaveLength(2)
    expect(toolReceipts[0]?.content).toContain("call:one-mutation:create")
    expect(toolReceipts[1]?.content).toContain("call:one-mutation:advance")
  })
})

function identity(scope: string) {
  return {
    sessionId: `session:${scope}`,
    turnId: `turn:${scope}`,
    userItemId: `item:user:${scope}`,
    assistantItemId: `item:assistant:${scope}`,
    modelOperationId: (stepNumber: number) => `model:${scope}:${stepNumber}`,
    toolItemId: (toolCallId: string) => `item:tool:${scope}:${toolCallId}`,
  }
}

function countRows(database: ReturnType<typeof openRepaDatabase>, table: string) {
  const row = database.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}

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
  finishReason: "stop" | "tool-calls",
): Extract<LanguageModelV3StreamPart, { type: "finish" }> {
  const usage: LanguageModelV3Usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  }
  return {
    type: "finish",
    finishReason: { unified: finishReason, raw: finishReason },
    usage,
  }
}
