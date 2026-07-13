import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  admitUserTurn,
  createSession,
  finishModelOperation,
  finishTurn,
  readToolInvocation,
  recordToolInvocation,
  recoverOrphanedRuntime,
} from "../src/interaction/records"
import {
  ADDRESS_FUTURE_ATTENTION_TOOL,
  CREATE_FUTURE_ATTENTION_TOOL,
  DISMISS_FUTURE_ATTENTION_TOOL,
  executeFutureAttentionTool,
  INSPECT_RECENT_FUTURE_ATTENTION_TOOL,
  READ_FUTURE_ATTENTION_SOURCE_TOOL,
  REOPEN_FUTURE_ATTENTION_TOOL,
  SUPERSEDE_FUTURE_ATTENTION_TOOL,
} from "../src/learning/agenda/future-attention-tool-execution"
import {
  createFutureAttentionConcern,
  readFutureAttentionConcern,
} from "../src/learning/agenda/future-attention"
import {
  advanceCourseRoute,
  createProvisionalCourse,
  readActiveCourseContext,
} from "../src/learning/curriculum/course-view"
import { openRepaDatabase } from "../src/storage/open-database"
import { readSystemState } from "../src/storage/system-state"
import { beginTutorModelOperation } from "../src/tutor/compile-context"
import { DEFAULT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"

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

describe("Agenda tool execution", () => {
  test("physical create retries settle against one source-bound semantic effect", () => {
    const fixture = agendaToolFixture("create-replay")
    const input = learnerRequestedCreateInput()
    recordAgendaInvocation(fixture, {
      invocationId: "invocation:agenda:create:first",
      toolName: CREATE_FUTURE_ATTENTION_TOOL,
      input,
      createdAt: 12,
    })
    const first = executeFutureAttentionTool(fixture.database, {
      invocationId: "invocation:agenda:create:first",
      executedAt: 13,
    })
    expect(first.outcome).toMatchObject({
      ok: true,
      disposition: "applied",
      concern: { status: "open", version: 1 },
    })
    expect(first.durableOutcome).toEqual(first.outcome)
    if (
      !first.outcome.ok ||
      !("operationEffectId" in first.outcome) ||
      !("concern" in first.outcome)
    ) {
      throw new Error("Create fixture did not produce a mutation success")
    }
    const firstEffectId = first.outcome.operationEffectId
    const revisionAfterFirst = readSystemState(fixture.database).revision

    recordAgendaInvocation(fixture, {
      invocationId: "invocation:agenda:create:retry",
      toolName: CREATE_FUTURE_ATTENTION_TOOL,
      input,
      createdAt: 14,
    })
    const retry = executeFutureAttentionTool(fixture.database, {
      invocationId: "invocation:agenda:create:retry",
      executedAt: 15,
    })
    expect(retry.outcome).toMatchObject({
      ok: true,
      disposition: "already_applied",
      operationEffectId: firstEffectId,
      concern: { id: first.outcome.concern.id },
    })
    expect(readSystemState(fixture.database).revision).toBe(revisionAfterFirst)
    expect(readToolInvocation(
      fixture.database,
      "invocation:agenda:create:retry",
    ).effectId).toBe(firstEffectId)

    recordAgendaInvocation(fixture, {
      invocationId: "invocation:agenda:create:conflict",
      toolName: CREATE_FUTURE_ATTENTION_TOOL,
      input: { ...input, reason: "A conflicting future meaning." },
      createdAt: 16,
    })
    const conflict = executeFutureAttentionTool(fixture.database, {
      invocationId: "invocation:agenda:create:conflict",
      executedAt: 17,
    })
    expect(conflict.outcome).toMatchObject({ ok: false, code: "semantic_conflict" })
    expect(readSystemState(fixture.database).revision).toBe(revisionAfterFirst)
  })

  test("model creation may bind only the admitted learner-response constraint", () => {
    const fixture = agendaToolFixture("create-constraint")
    recordAgendaInvocation(fixture, {
      invocationId: "invocation:agenda:create:constraint",
      toolName: CREATE_FUTURE_ATTENTION_TOOL,
      input: {
        ...learnerRequestedCreateInput(),
        learnerRoleConstraint: {
          kind: "learner_response_before_tutor_disclosure",
        },
      },
      createdAt: 12,
    })

    const execution = executeFutureAttentionTool(fixture.database, {
      invocationId: "invocation:agenda:create:constraint",
      executedAt: 13,
    })

    expect(execution.outcome).toMatchObject({
      ok: true,
      concern: {
        learnerRoleConstraint: {
          kind: "learner_response_before_tutor_disclosure",
        },
      },
    })
    if (!execution.outcome.ok || !("concern" in execution.outcome)) {
      throw new Error("Constrained create did not produce a concern")
    }
    expect(readFutureAttentionConcern(
      fixture.database,
      execution.outcome.concern.id,
    ).learnerRoleConstraint).toEqual({
      kind: "learner_response_before_tutor_disclosure",
    })
  })

  test("Agenda change and tool settlement roll back as one local transaction", () => {
    const fixture = agendaToolFixture("atomic-settlement")
    const stateBefore = readSystemState(fixture.database)
    recordAgendaInvocation(fixture, {
      invocationId: "invocation:agenda:create:atomic",
      toolName: CREATE_FUTURE_ATTENTION_TOOL,
      input: learnerRequestedCreateInput(),
      createdAt: 12,
    })
    fixture.database.exec(`
      CREATE TRIGGER reject_agenda_tool_settlement_for_test
      BEFORE UPDATE OF status ON tool_invocation
      WHEN OLD.invocation_id = 'invocation:agenda:create:atomic'
        AND NEW.status = 'completed'
      BEGIN
        SELECT RAISE(ABORT, 'injected Agenda settlement failure');
      END;
    `)

    expect(() =>
      executeFutureAttentionTool(fixture.database, {
        invocationId: "invocation:agenda:create:atomic",
        executedAt: 13,
      }),
    ).toThrow("injected Agenda settlement failure")
    expect(readToolInvocation(
      fixture.database,
      "invocation:agenda:create:atomic",
    ).status).toBe("running")
    expect((fixture.database.query("SELECT COUNT(*) AS count FROM agenda_revisit").get() as {
      count: number
    }).count).toBe(0)
    expect(readSystemState(fixture.database)).toEqual(stateBefore)

    fixture.database.exec("DROP TRIGGER reject_agenda_tool_settlement_for_test")
    expect(executeFutureAttentionTool(fixture.database, {
      invocationId: "invocation:agenda:create:atomic",
      executedAt: 14,
    }).outcome).toMatchObject({ ok: true, disposition: "applied" })
  })

  test("an impossible civil date fails closed instead of being normalized", () => {
    const fixture = agendaToolFixture("invalid-civil-time")
    recordAgendaInvocation(fixture, {
      invocationId: "invocation:agenda:invalid-civil-time",
      toolName: CREATE_FUTURE_ATTENTION_TOOL,
      input: {
        ...learnerRequestedCreateInput(),
        notBefore: "2026-02-30T00:00:00Z",
      },
      createdAt: 12,
    })
    expect(executeFutureAttentionTool(fixture.database, {
      invocationId: "invocation:agenda:invalid-civil-time",
      executedAt: 13,
    }).outcome).toMatchObject({ ok: false, code: "invalid_input" })
    expect((fixture.database.query("SELECT COUNT(*) AS count FROM agenda_revisit").get() as {
      count: number
    }).count).toBe(0)
  })

  test("a fresh persisted context binds address to its current learner occurrence", () => {
    const fixture = agendaToolFixture("address")
    const concern = createThroughTool(fixture)
    finishAgendaTurn(fixture, 20)
    const later = beginAgendaTurn(fixture, {
      scope: "later-answer",
      content: "两个变量仍然指向同一个对象。",
      createdAt: 30,
    })
    recordAgendaInvocation(later, {
      invocationId: "invocation:agenda:address",
      toolName: ADDRESS_FUTURE_ATTENTION_TOOL,
      input: {
        concernId: concern.id,
        alignmentRationale: "The current learner response is the delayed independent prediction.",
      },
      createdAt: 32,
    })

    const addressed = executeFutureAttentionTool(later.database, {
      invocationId: "invocation:agenda:address",
      executedAt: 33,
    })
    expect(addressed.outcome).toMatchObject({
      ok: true,
      disposition: "applied",
      concern: { id: concern.id, status: "addressed", version: 2 },
    })
    const transition = later.database.query(`
      SELECT command_source_item_id, service_occurrence_item_id
      FROM agenda_revisit_transition
      WHERE revisit_id = ?1
    `).get(concern.id) as {
      command_source_item_id: string
      service_occurrence_item_id: string
    }
    expect(transition).toEqual({
      command_source_item_id: later.sourceItemId,
      service_occurrence_item_id: later.sourceItemId,
    })
  })

  test("lazy source text is model-visible but absent from durable tool results", () => {
    const fixture = agendaToolFixture("source-read")
    const concern = createThroughTool(fixture)
    finishAgendaTurn(fixture, 20)
    const later = beginAgendaTurn(fixture, {
      scope: "source-reader",
      content: "请查看这个回访事项的来源。",
      createdAt: 30,
    })
    recordAgendaInvocation(later, {
      invocationId: "invocation:agenda:source-read",
      toolName: READ_FUTURE_ATTENTION_SOURCE_TOOL,
      input: { concernId: concern.id },
      createdAt: 32,
    })

    const read = executeFutureAttentionTool(later.database, {
      invocationId: "invocation:agenda:source-read",
      executedAt: 33,
    })
    expect(read.outcome).toMatchObject({
      ok: true,
      concernId: concern.id,
      source: { content: fixture.sourceText },
    })
    expect(JSON.stringify(read.durableOutcome)).not.toContain(fixture.sourceText)
    expect(JSON.stringify(readToolInvocation(
      later.database,
      "invocation:agenda:source-read",
    ).result)).not.toContain(fixture.sourceText)
    const terminalReplay = executeFutureAttentionTool(later.database, {
      invocationId: "invocation:agenda:source-read",
      executedAt: 34,
    })
    expect(terminalReplay.outcome).toMatchObject({
      ok: true,
      concernId: concern.id,
      source: { content: fixture.sourceText },
    })
    expect(JSON.stringify(terminalReplay.durableOutcome)).not.toContain(fixture.sourceText)
  })

  test("learner dismissal binds the visible version and exact current excerpt", () => {
    const fixture = agendaToolFixture("dismiss")
    const concern = createThroughTool(fixture)
    finishAgendaTurn(fixture, 20)
    const later = beginAgendaTurn(fixture, {
      scope: "dismiss-current",
      content: "取消明天的检查，我不想保留它。",
      createdAt: 30,
    })
    const input = {
      concernId: concern.id,
      learnerRequestExcerpt: "取消明天的检查",
      rationale: "The learner explicitly cancelled this future attention.",
    }
    recordAgendaInvocation(later, {
      invocationId: "invocation:agenda:dismiss:first",
      toolName: DISMISS_FUTURE_ATTENTION_TOOL,
      input,
      createdAt: 32,
    })
    const dismissed = executeFutureAttentionTool(later.database, {
      invocationId: "invocation:agenda:dismiss:first",
      executedAt: 33,
    })
    expect(dismissed.outcome).toMatchObject({
      ok: true,
      disposition: "applied",
      concern: { id: concern.id, status: "dismissed", version: 2 },
    })

    recordAgendaInvocation(later, {
      invocationId: "invocation:agenda:dismiss:retry",
      toolName: DISMISS_FUTURE_ATTENTION_TOOL,
      input,
      createdAt: 34,
    })
    expect(executeFutureAttentionTool(later.database, {
      invocationId: "invocation:agenda:dismiss:retry",
      executedAt: 35,
    }).outcome).toMatchObject({
      ok: true,
      disposition: "already_applied",
      concern: { status: "dismissed", version: 2 },
    })
  })

  test("fresh-Session inspection grants a bounded correction path for a mistaken disposition", () => {
    const fixture = agendaToolFixture("reopen-inspection")
    const concern = createThroughTool(fixture)
    finishAgendaTurn(fixture, 20)
    const answer = beginAgendaTurn(fixture, {
      scope: "reopen-mistaken-answer",
      content: "我只是开始思考。",
      createdAt: 30,
    })
    recordAgendaInvocation(answer, {
      invocationId: "invocation:agenda:mistaken-address",
      toolName: ADDRESS_FUTURE_ATTENTION_TOOL,
      input: {
        concernId: concern.id,
        alignmentRationale: "This deliberately records a mistaken disposition for correction.",
      },
      createdAt: 32,
    })
    expect(executeFutureAttentionTool(answer.database, {
      invocationId: "invocation:agenda:mistaken-address",
      executedAt: 33,
    }).outcome).toMatchObject({ ok: true, concern: { status: "addressed", version: 2 } })
    finishModelOperation(answer.database, {
      modelOperationId: answer.modelOperationId,
      outcome: "completed",
      finishedAt: 34,
    })
    finishTurn(answer.database, { turnId: answer.turnId, outcome: "completed", finishedAt: 35 })

    const correction = beginAgendaTurn(fixture, {
      scope: "reopen-fresh-correction",
      content: "你记错了，我并没有完成那次独立检查。",
      createdAt: 40,
    })
    const reopenInput = {
      concernId: concern.id,
      learnerRequestExcerpt: "你记错了",
      rationale: "The learner explicitly corrected the mistaken addressed disposition.",
    }
    recordAgendaInvocation(correction, {
      invocationId: "invocation:agenda:reopen-without-inspection",
      toolName: REOPEN_FUTURE_ATTENTION_TOOL,
      input: reopenInput,
      createdAt: 42,
    })
    expect(executeFutureAttentionTool(correction.database, {
      invocationId: "invocation:agenda:reopen-without-inspection",
      executedAt: 43,
    }).outcome).toMatchObject({ ok: false, code: "invalid_context" })

    recordAgendaInvocation(correction, {
      invocationId: "invocation:agenda:inspect-recent",
      toolName: INSPECT_RECENT_FUTURE_ATTENTION_TOOL,
      input: { offset: 0, limit: 10 },
      createdAt: 44,
    })
    const inspected = executeFutureAttentionTool(correction.database, {
      invocationId: "invocation:agenda:inspect-recent",
      executedAt: 45,
    })
    expect(inspected.outcome).toMatchObject({
      ok: true,
      total: 1,
      concerns: [{ id: concern.id, status: "addressed", version: 2 }],
    })
    recordAgendaInvocation(correction, {
      invocationId: "invocation:agenda:reopen-same-sample",
      toolName: REOPEN_FUTURE_ATTENTION_TOOL,
      input: reopenInput,
      createdAt: 46,
    })
    expect(executeFutureAttentionTool(correction.database, {
      invocationId: "invocation:agenda:reopen-same-sample",
      executedAt: 47,
    }).outcome).toMatchObject({ ok: false, code: "invalid_context" })
    finishModelOperation(correction.database, {
      modelOperationId: correction.modelOperationId,
      outcome: "completed",
      finishedAt: 48,
    })
    const reopenModelOperationId = "model:reopen-after-inspection"
    beginTutorModelOperation(correction.database, {
      modelOperationId: reopenModelOperationId,
      turnId: correction.turnId,
      sessionId: correction.sessionId,
      sampledAt: 49,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
    })
    const reopening = { ...correction, modelOperationId: reopenModelOperationId }
    recordAgendaInvocation(reopening, {
      invocationId: "invocation:agenda:reopen-after-inspection",
      toolName: REOPEN_FUTURE_ATTENTION_TOOL,
      input: reopenInput,
      createdAt: 50,
    })
    expect(executeFutureAttentionTool(reopening.database, {
      invocationId: "invocation:agenda:reopen-after-inspection",
      executedAt: 51,
    }).outcome).toMatchObject({
      ok: true,
      disposition: "applied",
      concern: { id: concern.id, status: "open", version: 3 },
    })
  })

  test("supersession and successor creation roll back if invocation settlement fails", () => {
    const fixture = agendaToolFixture("supersede-atomic")
    const concern = createThroughTool(fixture)
    finishAgendaTurn(fixture, 20)
    const correction = beginAgendaTurn(fixture, {
      scope: "supersede-current",
      content: "更正一下：明天回来时，目标是修复我对别名机制的因果模型。",
      createdAt: 30,
    })
    recordAgendaInvocation(correction, {
      invocationId: "invocation:agenda:supersede:atomic",
      toolName: SUPERSEDE_FUTURE_ATTENTION_TOOL,
      input: {
        concernId: concern.id,
        learnerRequestExcerpt: "更正一下",
        replacementReason:
          "Repair the learner's causal model of aliasing after the earlier explanation failed.",
        replacementNotBefore: "1970-01-01T00:00:00.060Z",
        rationale: "The learner corrected the purpose of the future return.",
      },
      createdAt: 32,
    })
    const stateBefore = readSystemState(correction.database)
    correction.database.exec(`
      CREATE TRIGGER reject_agenda_supersede_settlement_for_test
      BEFORE UPDATE OF status ON tool_invocation
      WHEN OLD.invocation_id = 'invocation:agenda:supersede:atomic'
        AND NEW.status = 'completed'
      BEGIN
        SELECT RAISE(ABORT, 'injected Agenda supersede settlement failure');
      END;
    `)

    expect(() =>
      executeFutureAttentionTool(correction.database, {
        invocationId: "invocation:agenda:supersede:atomic",
        executedAt: 33,
      }),
    ).toThrow("injected Agenda supersede settlement failure")
    expect(correction.database.query(
      "SELECT status, version FROM agenda_revisit WHERE revisit_id = ?1",
    ).get(concern.id)).toEqual({ status: "open", version: 1 })
    expect((correction.database.query("SELECT COUNT(*) AS count FROM agenda_revisit").get() as {
      count: number
    }).count).toBe(1)
    expect((correction.database.query(
      "SELECT COUNT(*) AS count FROM agenda_revisit_transition",
    ).get() as { count: number }).count).toBe(0)
    expect(readSystemState(correction.database)).toEqual(stateBefore)

    correction.database.exec("DROP TRIGGER reject_agenda_supersede_settlement_for_test")
    const superseded = executeFutureAttentionTool(correction.database, {
      invocationId: "invocation:agenda:supersede:atomic",
      executedAt: 34,
    })
    expect(superseded.outcome).toMatchObject({
      ok: true,
      disposition: "applied",
      previous: { id: concern.id, status: "superseded", version: 2 },
      successor: { status: "open", version: 1 },
    })
    expect((correction.database.query("SELECT COUNT(*) AS count FROM agenda_revisit").get() as {
      count: number
    }).count).toBe(2)
  })

  test("a timing correction preserves its target after route progress within the same view", () => {
    const fixture = agendaToolFixture("supersede-preserve-target")
    const learnerRoleConstraint = {
      kind: "learner_response_before_tutor_disclosure" as const,
    }
    const concern = createThroughTool(fixture, learnerRoleConstraint)
    const active = readActiveCourseContext(fixture.database)
    if (!active) throw new Error("Supersede target fixture lost its active course")
    const originalTargetItemId = active.route.anchor.itemId
    advanceCourseRoute(fixture.database, {
      effectId: "effect:route:advance-before-supersede",
      causeItemId: fixture.sourceItemId,
      courseId: active.courseId,
      expectedViewRevisionId: active.courseViewRevisionId,
      expectedAnchorItemId: originalTargetItemId,
      expectedRouteVersion: active.route.version,
      occurredAt: 14,
    })
    finishAgendaTurn(fixture, 20)
    const correction = beginAgendaTurn(fixture, {
      scope: "supersede-time-only",
      content: "把刚才那个检查改到稍晚一些，检查目的不变。",
      createdAt: 30,
    })
    recordAgendaInvocation(correction, {
      invocationId: "invocation:agenda:supersede-time-only",
      toolName: SUPERSEDE_FUTURE_ATTENTION_TOOL,
      input: {
        concernId: concern.id,
        learnerRequestExcerpt: "改到稍晚一些",
        replacementReason: "Check object identity through a later independent prediction.",
        replacementLearnerRoleConstraint: learnerRoleConstraint,
        replacementNotBefore: "1970-01-01T00:00:00.060Z",
        rationale: "The learner changed timing while preserving target and purpose.",
      },
      createdAt: 32,
    })
    const superseded = executeFutureAttentionTool(correction.database, {
      invocationId: "invocation:agenda:supersede-time-only",
      executedAt: 33,
    })
    expect(superseded.outcome).toMatchObject({ ok: true, disposition: "applied" })
    expect(superseded.outcome).toMatchObject({
      successor: { learnerRoleConstraint },
    })
    const successor = correction.database.query(`
      SELECT target_course_item_id
      FROM agenda_revisit
      WHERE revisit_id = (
        SELECT successor_revisit_id FROM agenda_revisit WHERE revisit_id = ?1
      )
    `).get(concern.id) as { target_course_item_id: string }
    expect(successor.target_course_item_id).toBe(originalTargetItemId)
    expect(readActiveCourseContext(correction.database)?.route.anchor.itemId).not.toBe(
      originalTargetItemId,
    )
  })

  test("startup recovery makes an orphan invocation terminal without executing meaning", () => {
    const fixture = agendaToolFixture("recovery")
    recordAgendaInvocation(fixture, {
      invocationId: "invocation:agenda:orphan",
      toolName: CREATE_FUTURE_ATTENTION_TOOL,
      input: learnerRequestedCreateInput(),
      createdAt: 12,
    })
    fixture.database.close()
    openDatabases.splice(openDatabases.indexOf(fixture.database), 1)

    const reopened = openRepaDatabase(fixture.databasePath)
    openDatabases.push(reopened)
    recoverOrphanedRuntime(reopened, { recoveredAt: 20 })
    const recovered = executeFutureAttentionTool(reopened, {
      invocationId: "invocation:agenda:orphan",
      executedAt: 21,
    })
    expect(recovered.outcome).toMatchObject({ ok: false, code: "runtime_restarted" })
    expect((reopened.query("SELECT COUNT(*) AS count FROM agenda_revisit").get() as {
      count: number
    }).count).toBe(0)
  })

  test("a guessed or post-sample concern ID cannot expose an old source", () => {
    const fixture = agendaToolFixture("hidden-concern")
    const hidden = beginAgendaTurn(fixture, {
      scope: "hidden-creator",
      content: "把这条隐藏来源留到以后。",
      createdAt: 20,
    })
    const active = readActiveCourseContext(fixture.database)
    if (!active) throw new Error("Hidden-concern fixture lost its active course")
    createFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:hidden",
      concernId: "agenda:hidden-after-sample",
      causeItemId: hidden.sourceItemId,
      modelOperationId: hidden.modelOperationId,
      target: {
        courseId: active.courseId,
        courseViewRevisionId: active.courseViewRevisionId,
        courseItemId: active.route.anchor.itemId,
      },
      authorship: { kind: "tutor_initiated" },
      reason: "A concern created after the other model context was sampled.",
      notBefore: 50,
      occurredAt: 22,
    })
    recordAgendaInvocation(fixture, {
      invocationId: "invocation:agenda:read-hidden",
      toolName: READ_FUTURE_ATTENTION_SOURCE_TOOL,
      input: { concernId: "agenda:hidden-after-sample" },
      createdAt: 23,
    })

    const rejected = executeFutureAttentionTool(fixture.database, {
      invocationId: "invocation:agenda:read-hidden",
      executedAt: 24,
    })
    expect(rejected.outcome).toMatchObject({ ok: false, code: "invalid_context" })
    expect(JSON.stringify(readToolInvocation(
      fixture.database,
      "invocation:agenda:read-hidden",
    ))).not.toContain("把这条隐藏来源留到以后")
  })
})

function agendaToolFixture(scope: string) {
  const directory = mkdtempSync(join(tmpdir(), `repa-agenda-tool-${scope}-`))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, "repa.sqlite")
  const database = openRepaDatabase(databasePath)
  openDatabases.push(database)

  createSession(database, { sessionId: `session:course:${scope}`, createdAt: 1 })
  admitUserTurn(database, {
    sessionId: `session:course:${scope}`,
    turnId: `turn:course:${scope}`,
    itemId: `item:user:course:${scope}`,
    content: "Create the course.",
    createdAt: 2,
  })
  createProvisionalCourse(database, {
    effectId: `effect:course:${scope}`,
    causeItemId: `item:user:course:${scope}`,
    learningSpaceId: `space:${scope}`,
    courseId: `course:${scope}`,
    workspaceRoot: directory,
    title: "Object references",
    items: [{ title: "Object identity" }, { title: "Aliasing" }],
    occurredAt: 3,
  })
  const activeCourse = readActiveCourseContext(database)
  if (!activeCourse) throw new Error("Agenda tool fixture has no active course")
  const sourceText = "这部分还是没懂；明天再独立检查一次。"
  const turn = beginAgendaTurn(
    { database, databasePath, targetCourseId: activeCourse.courseId },
    { scope: `initial:${scope}`, content: sourceText, createdAt: 10 },
  )
  return {
    ...turn,
    databasePath,
    sourceText,
  }
}

function beginAgendaTurn(
  fixture: {
    database: ReturnType<typeof openRepaDatabase>
    databasePath: string
    targetCourseId?: string
  },
  input: { scope: string; content: string; createdAt: number },
) {
  const sessionId = `session:${input.scope}`
  const turnId = `turn:${input.scope}`
  const sourceItemId = `item:user:${input.scope}`
  const modelOperationId = `model:${input.scope}`
  createSession(fixture.database, { sessionId, createdAt: input.createdAt })
  admitUserTurn(fixture.database, {
    sessionId,
    turnId,
    itemId: sourceItemId,
    content: input.content,
    createdAt: input.createdAt,
  })
  beginTutorModelOperation(fixture.database, {
    modelOperationId,
    turnId,
    sessionId,
    sampledAt: input.createdAt + 1,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
  })
  return {
    database: fixture.database,
    databasePath: fixture.databasePath,
    sessionId,
    turnId,
    sourceItemId,
    modelOperationId,
    sourceText: input.content,
  }
}

function recordAgendaInvocation(
  fixture: ReturnType<typeof agendaToolFixture> | ReturnType<typeof beginAgendaTurn>,
  input: { invocationId: string; toolName: string; input: unknown; createdAt: number },
) {
  recordToolInvocation(fixture.database, {
    invocationId: input.invocationId,
    modelOperationId: fixture.modelOperationId,
    toolName: input.toolName,
    input: input.input,
    createdAt: input.createdAt,
  })
}

function learnerRequestedCreateInput() {
  return {
    authorship: {
      kind: "learner_requested" as const,
      learnerRequestExcerpt: "明天再独立检查一次",
    },
    reason: "Check object identity through a later independent prediction.",
    notBefore: "1970-01-01T00:00:00.050Z",
  }
}

function createThroughTool(
  fixture: ReturnType<typeof agendaToolFixture>,
  learnerRoleConstraint?: {
    kind: "learner_response_before_tutor_disclosure"
  },
) {
  recordAgendaInvocation(fixture, {
    invocationId: `invocation:create:${fixture.turnId}`,
    toolName: CREATE_FUTURE_ATTENTION_TOOL,
    input: {
      ...learnerRequestedCreateInput(),
      ...(learnerRoleConstraint === undefined ? {} : { learnerRoleConstraint }),
    },
    createdAt: 12,
  })
  const result = executeFutureAttentionTool(fixture.database, {
    invocationId: `invocation:create:${fixture.turnId}`,
    executedAt: 13,
  })
  if (!result.outcome.ok || !("concern" in result.outcome)) {
    throw new Error("Agenda fixture creation failed")
  }
  return result.outcome.concern
}

function finishAgendaTurn(fixture: ReturnType<typeof agendaToolFixture>, at: number) {
  finishModelOperation(fixture.database, {
    modelOperationId: fixture.modelOperationId,
    outcome: "completed",
    finishedAt: at - 1,
  })
  finishTurn(fixture.database, {
    turnId: fixture.turnId,
    outcome: "completed",
    finishedAt: at,
  })
}
