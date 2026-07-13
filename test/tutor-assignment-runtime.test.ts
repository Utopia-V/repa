import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider"
import { afterEach, describe, expect, test } from "bun:test"
import { MockLanguageModelV3 } from "ai/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { admitUserTurn, createSession } from "../src/interaction/records"
import {
  completeAssignment,
  createAssignment,
  readAssignment,
  readAssignmentContext,
} from "../src/learning/agenda/assignment"
import {
  createFutureAttentionConcern,
  readFutureAttentionContext,
} from "../src/learning/agenda/future-attention"
import {
  createProvisionalCourse,
  readActiveCourseContext,
} from "../src/learning/curriculum/course-view"
import { runTutorTurn } from "../src/runtime/run-tutor-turn"
import { openRepaDatabase } from "../src/storage/open-database"
import { readSystemState } from "../src/storage/system-state"
import { beginTutorModelOperation } from "../src/tutor/compile-context"
import { ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"

const temporaryDirectories: string[] = []
const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A test may close and reopen the same file.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("Tutor Assignment runtime", () => {
  test("model-facing create reaches a fresh Session and cold detail changes a reversible plan", async () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-assignment-runtime-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "repa.sqlite")
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    const base = Date.parse("2026-07-13T10:00:00+08:00")
    const target = seedCourseAndDueConcern(database, directory, base)
    const oldSource = "通识课短报告 7 月 14 日 20:00 截止，还需要 25 分钟，学习价值很低。"

    let createCall = 0
    const createModel = new MockLanguageModelV3({
      doStream: async (options) => {
        createCall += 1
        const prompt = JSON.stringify(options.prompt)
        if (createCall === 1) {
          expect(JSON.stringify(options.tools)).toContain("create_assignment")
          expect(prompt).not.toContain("Open real assignments")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:assignment:create",
              toolName: "create_assignment",
              input: JSON.stringify({
                sourceExcerpt: "通识课短报告 7 月 14 日 20:00 截止",
                title: "通识课短报告",
                dueAt: "2026-07-14T20:00+08:00",
                admissionRationale:
                  "The learner introduced a distinct coursework obligation with a precise deadline.",
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (createCall === 2) {
          expect(prompt).toContain("Open real assignments")
          expect(prompt).toContain("通识课短报告")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "confirmed" },
            {
              type: "text-delta",
              id: "confirmed",
              delta: "我已记下这份通识课短报告，按 7 月 14 日 20:00 的截止时间处理。",
            },
            { type: "text-end", id: "confirmed" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected Assignment create provider call ${createCall}`)
      },
    })
    let createNow = base + 1_000
    const createdOutcome = await runTutorTurn({
      database,
      model: createModel,
      workspaceRoot: directory,
      learnerText: oldSource,
      identity: identity("assignment-create"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++createNow,
      maxModelSteps: 4,
    })
    expect(createdOutcome.text).toContain("7 月 14 日 20:00")
    const compact = readAssignmentContext(database, {
      at: createNow,
      offset: 0,
      limit: 8,
    })
    expect(compact.totalActive).toBe(1)
    const assignmentId = compact.assignments[0]?.id
    if (!assignmentId) throw new Error("Assignment runtime created no Assignment")

    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)
    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    const revisionBeforePlan = readSystemState(reopened).revision
    let planCall = 0
    const planModel = new MockLanguageModelV3({
      doStream: async (options) => {
        planCall += 1
        const prompt = JSON.stringify(options.prompt)
        if (planCall === 1) {
          expect(prompt).toContain(assignmentId)
          expect(prompt).toContain("通识课短报告")
          expect(prompt).toContain(target.concernReason)
          expect(prompt).not.toContain("25 分钟")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:assignment:read",
              toolName: "read_assignment_source",
              input: JSON.stringify({
                assignmentId,
                version: 1,
                offset: 0,
                limit: 500,
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (planCall === 2) {
          expect(prompt).toContain("25 分钟")
          expect(prompt).toContain("学习价值很低")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "plan" },
            {
              type: "text-delta",
              id: "plan",
              delta:
                "这 45 分钟先保护报告提交，再用剩余时间回到对象引用；今天不展开新材料。你若要直接处理报告内容，我们现在就切过去。",
            },
            { type: "text-end", id: "plan" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected Assignment plan provider call ${planCall}`)
      },
    })
    let planNow = Date.parse("2026-07-14T19:30:00+08:00")
    const plan = await runTutorTurn({
      database: reopened,
      model: planModel,
      workspaceRoot: directory,
      learnerText: "我现在只有 45 分钟，继续。",
      identity: identity("assignment-plan"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++planNow,
      maxModelSteps: 4,
    })
    expect(plan.text).toContain("先保护报告提交")
    expect(plan.text).toContain("剩余时间回到对象引用")
    expect(readSystemState(reopened).revision).toBe(revisionBeforePlan)
    expect(readAssignment(reopened, assignmentId)).toMatchObject({
      status: "open",
      version: 1,
    })
    expect(readFutureAttentionContext(reopened, {
      activeCourseId: target.courseId,
      at: planNow,
      limit: 8,
    }).totalOpen).toBe(1)
    expect(readActiveCourseContext(reopened)?.route.anchor.itemId).toBe(target.courseItemId)
    expect(tableNames(reopened)).not.toContain("plan")
  })

  test("an exact direct-help request does not force planning or mutate Assignment", async () => {
    const database = openRepaDatabase(":memory:")
    openDatabases.push(database)
    const base = Date.parse("2026-07-13T12:00:00+08:00")
    const seeded = seedAssignment(database, base)
    const revisionBefore = readSystemState(database).revision
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        expect(JSON.stringify(options.prompt)).toContain(seeded.assignmentId)
        return stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "direct" },
          {
            type: "text-delta",
            id: "direct",
            delta: "可以，先直接处理报告正文。把题目和已有草稿发来，我会按你的要求给出可提交版本。",
          },
          { type: "text-end", id: "direct" },
          finish("stop"),
        ])
      },
    })
    let now = base + 1_000
    const outcome = await runTutorTurn({
      database,
      model,
      workspaceRoot: process.cwd(),
      learnerText: "截止时间很近，请直接帮我完成报告，不要先测试我。",
      identity: identity("assignment-direct"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
    })
    expect(outcome.text).toContain("先直接处理报告正文")
    expect(readSystemState(database).revision).toBe(revisionBefore)
    expect(readAssignment(database, seeded.assignmentId)).toMatchObject({
      status: "open",
      version: 1,
    })
  })

  test("ordinary-language correction inspects terminal history and reopens without exposing IDs", async () => {
    const database = openRepaDatabase(":memory:")
    openDatabases.push(database)
    const base = Date.parse("2026-07-13T14:00:00+08:00")
    const seeded = seedAssignment(database, base)
    createSession(database, { sessionId: "session:complete-seed", createdAt: base + 100 })
    admitUserTurn(database, {
      sessionId: "session:complete-seed",
      turnId: "turn:complete-seed",
      itemId: "item:user:complete-seed",
      content: "短报告已经提交，不需要再处理。",
      createdAt: base + 100,
    })
    beginTutorModelOperation(database, {
      modelOperationId: "model:complete-seed",
      turnId: "turn:complete-seed",
      sessionId: "session:complete-seed",
      sampledAt: base + 101,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
    })
    completeAssignment(database, {
      effectId: "effect:assignment:complete-seed",
      assignmentId: seeded.assignmentId,
      expectedVersion: 1,
      causeItemId: "item:user:complete-seed",
      modelOperationId: "model:complete-seed",
      sourceExcerpt: "短报告已经提交，不需要再处理",
      rationale: "The learner reported that no local action remained.",
      occurredAt: base + 102,
    })

    let call = 0
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        call += 1
        const prompt = JSON.stringify(options.prompt)
        if (call === 1) {
          expect(prompt).not.toContain(seeded.assignmentId)
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:assignment:inspect-terminal",
              toolName: "inspect_assignments",
              input: JSON.stringify({
                scope: "recent_terminal",
                offset: 0,
                limit: 10,
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (call === 2) {
          expect(prompt).toContain(seeded.assignmentId)
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:assignment:reopen-terminal",
              toolName: "reopen_assignment",
              input: JSON.stringify({
                assignmentId: seeded.assignmentId,
                sourceExcerpt: "其实没交上",
                rationale: "The learner corrects the earlier completion report.",
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (call === 3) {
          expect(prompt).toContain("Open real assignments")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "corrected" },
            {
              type: "text-delta",
              id: "corrected",
              delta: "已更正：通识课短报告仍未提交，会继续按原截止时间显示。",
            },
            { type: "text-end", id: "corrected" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected Assignment correction provider call ${call}`)
      },
    })
    let now = base + 1_000
    const outcome = await runTutorTurn({
      database,
      model,
      workspaceRoot: process.cwd(),
      learnerText: "刚才那个其实没交上，请更正。",
      identity: identity("assignment-correction"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
      maxModelSteps: 5,
    })
    expect(outcome.text).toContain("通识课短报告仍未提交")
    expect(outcome.text).not.toContain("assignment:")
    expect(readAssignment(database, seeded.assignmentId)).toMatchObject({
      status: "open",
      version: 3,
    })
  })
})

function seedCourseAndDueConcern(
  database: ReturnType<typeof openRepaDatabase>,
  workspaceRoot: string,
  at: number,
) {
  createSession(database, { sessionId: "session:course", createdAt: at })
  admitUserTurn(database, {
    sessionId: "session:course",
    turnId: "turn:course",
    itemId: "item:user:course",
    content: "建立对象引用课程。",
    createdAt: at,
  })
  createProvisionalCourse(database, {
    effectId: "effect:assignment-runtime:course",
    causeItemId: "item:user:course",
    learningSpaceId: "space:assignment-runtime",
    courseId: "course:assignment-runtime",
    workspaceRoot,
    title: "对象引用",
    items: [{ title: "对象身份" }, { title: "浅复制" }],
    occurredAt: at + 1,
  })
  const course = readActiveCourseContext(database)
  if (!course) throw new Error("Assignment runtime fixture has no Course")
  createSession(database, { sessionId: "session:concern", createdAt: at + 10 })
  admitUserTurn(database, {
    sessionId: "session:concern",
    turnId: "turn:concern",
    itemId: "item:user:concern",
    content: "明天回到对象身份再检查一次。",
    createdAt: at + 10,
  })
  beginTutorModelOperation(database, {
    modelOperationId: "model:concern",
    turnId: "turn:concern",
    sessionId: "session:concern",
    sampledAt: at + 11,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
  })
  const concernReason = "Return to the due object-identity concern after urgent work."
  createFutureAttentionConcern(database, {
    effectId: "effect:assignment-runtime:concern",
    concernId: "agenda:assignment-runtime:concern",
    causeItemId: "item:user:concern",
    modelOperationId: "model:concern",
    target: {
      courseId: course.courseId,
      courseViewRevisionId: course.courseViewRevisionId,
      courseItemId: course.route.anchor.itemId,
    },
    authorship: {
      kind: "learner_requested",
      learnerRequestExcerpt: "明天回到对象身份再检查一次",
    },
    reason: concernReason,
    notBefore: at + 20,
    occurredAt: at + 12,
  })
  return {
    concernReason,
    courseId: course.courseId,
    courseItemId: course.route.anchor.itemId,
  }
}

function seedAssignment(database: ReturnType<typeof openRepaDatabase>, at: number) {
  createSession(database, { sessionId: "session:seed-assignment", createdAt: at })
  admitUserTurn(database, {
    sessionId: "session:seed-assignment",
    turnId: "turn:seed-assignment",
    itemId: "item:user:seed-assignment",
    content: "通识课短报告 7 月 14 日 20:00 截止。",
    createdAt: at,
  })
  beginTutorModelOperation(database, {
    modelOperationId: "model:seed-assignment",
    turnId: "turn:seed-assignment",
    sessionId: "session:seed-assignment",
    sampledAt: at + 1,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
  })
  const assignmentId = "assignment:direct-help"
  createAssignment(database, {
    effectId: "effect:assignment:direct-help",
    assignmentId,
    causeItemId: "item:user:seed-assignment",
    modelOperationId: "model:seed-assignment",
    sourceExcerpt: "通识课短报告 7 月 14 日 20:00 截止",
    title: "通识课短报告",
    dueAt: Date.parse("2026-07-14T20:00:00+08:00"),
    dueAtIso: "2026-07-14T20:00+08:00",
    interpretationTimeZone: "Asia/Shanghai",
    admissionRationale: "The learner reported a coursework obligation.",
    occurredAt: at + 2,
  })
  return { assignmentId }
}

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

function tableNames(database: ReturnType<typeof openRepaDatabase>) {
  return (database.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all() as Array<{ name: string }>).map((row) => row.name)
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
