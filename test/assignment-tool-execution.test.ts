import { afterEach, describe, expect, test } from "bun:test"
import {
  admitUserTurn,
  createSession,
  finishModelOperation,
  finishTurn,
  readSessionItems,
  readToolInvocation,
} from "../src/interaction/records"
import {
  completeAssignment,
  createAssignment,
  readAssignment,
  reviseAssignment,
} from "../src/learning/agenda/assignment"
import {
  COMPLETE_ASSIGNMENT_TOOL,
  CREATE_ASSIGNMENT_TOOL,
  INSPECT_ASSIGNMENTS_TOOL,
  READ_ASSIGNMENT_SOURCE_TOOL,
  REOPEN_ASSIGNMENT_TOOL,
} from "../src/learning/agenda/assignment-tool-execution"
import { createAssignmentTools } from "../src/runtime/assignment-tools"
import {
  createTutorToolExecutionCoordinator,
  tutorToolInvocationId,
  type TutorStepContext,
} from "../src/runtime/tutor-tool-binding"
import { openRepaDatabase } from "../src/storage/open-database"
import { beginTutorModelOperation } from "../src/tutor/compile-context"
import { ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"

const databases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(() => {
  for (const database of databases.splice(0).reverse()) database.close()
})

describe("Assignment model-facing commands", () => {
  test("Create binds source, model time zone, host identities, and physical retry", async () => {
    const fixture = startTurn(
      "create",
      "通识课短报告 7 月 14 日 20:00 截止，还需要 25 分钟。",
      Date.parse("2026-07-13T10:00:00+08:00"),
    )
    const runtime = assignmentRuntime(fixture)
    const input = {
      sourceExcerpt: "通识课短报告 7 月 14 日 20:00 截止",
      title: "通识课短报告",
      dueAt: "2026-07-14T20:00+08:00",
      admissionRationale: "The learner reported a precise coursework obligation.",
    }

    const first = await callTool(
      runtime.tools[CREATE_ASSIGNMENT_TOOL],
      input,
      fixture.step,
      "provider:create",
    )
    const physicalReplay = await callTool(
      runtime.tools[CREATE_ASSIGNMENT_TOOL],
      input,
      fixture.step,
      "provider:create",
    )
    expect(readSessionItems(fixture.database, fixture.sessionId).filter(
      (item) => item.role === "tool",
    )).toHaveLength(1)

    expect(first).toMatchObject({
      ok: true,
      disposition: "applied",
      assignment: {
        status: "open",
        version: 1,
        title: "通识课短报告",
        dueAt: Date.parse("2026-07-14T20:00:00+08:00"),
      },
    })
    expect(physicalReplay).toEqual(first)
    const refreshRequired = await callTool(
      runtime.tools[CREATE_ASSIGNMENT_TOOL],
      input,
      fixture.step,
      "provider:create-second-mutation",
    )
    expect(refreshRequired).toMatchObject({
      ok: false,
      code: "context_refresh_required",
    })
    const assignmentId = mutationAssignmentId(first)
    expect(assignmentId).toStartWith("assignment:")
    expect(readAssignment(fixture.database, assignmentId)).toMatchObject({
      creationSource: {
        itemId: fixture.sourceItemId,
        excerpt: input.sourceExcerpt,
      },
      interpretationTimeZone: "Asia/Shanghai",
      dueAtIso: input.dueAt,
    })
    expect(countRows(fixture.database, "agenda_assignment")).toBe(1)
    expect(countRows(fixture.database, "durable_effect")).toBe(1)
    expect(readSessionItems(fixture.database, fixture.sessionId).filter(
      (item) => item.role === "tool",
    )).toHaveLength(2)
    expect(readToolInvocation(fixture.database, tutorToolInvocationId(
      fixture.modelOperationId,
      "provider:create",
    )).effectId).toStartWith("effect:assignment:")
  })

  test("strict whole-minute and exact-source admission fail without Assignment state", async () => {
    const base = Date.parse("2026-07-13T10:10:00+08:00")
    const seconds = startTurn(
      "seconds",
      "通识课报告在 7 月 14 日 20:00 截止。",
      base,
    )
    const secondsRuntime = assignmentRuntime(seconds)
    expect(await callTool(
      secondsRuntime.tools[CREATE_ASSIGNMENT_TOOL],
      {
        sourceExcerpt: "通识课报告在 7 月 14 日 20:00 截止",
        title: "通识课报告",
        dueAt: "2026-07-14T20:00:30+08:00",
        admissionRationale: "A precise learner-reported coursework obligation.",
      },
      seconds.step,
      "provider:seconds",
    )).toMatchObject({ ok: false, code: "invalid_input" })
    expect(countRows(seconds.database, "agenda_assignment")).toBe(0)

    finishModelAndTurn(seconds, base + 20)
    const ambiguous = startTurn(
      "ambiguous",
      "报告明天 20:00 截止；报告明天 20:00 截止。",
      base + 100,
      seconds.database,
    )
    const ambiguousRuntime = assignmentRuntime(ambiguous)
    expect(await callTool(
      ambiguousRuntime.tools[CREATE_ASSIGNMENT_TOOL],
      {
        sourceExcerpt: "报告明天 20:00 截止",
        title: "报告",
        dueAt: "2026-07-14T20:00+08:00",
        admissionRationale: "The excerpt is deliberately ambiguous.",
      },
      ambiguous.step,
      "provider:ambiguous",
    )).toMatchObject({ ok: false, code: "invalid_input" })
    expect(countRows(ambiguous.database, "agenda_assignment")).toBe(0)
  })

  test("a terminal inspection grants its exact version only to a later model sample", async () => {
    const fixture = terminalAssignmentFixture("inspection")
    const correction = startTurn(
      "inspection:correction",
      "刚才提交失败了，这份报告还要继续处理。",
      fixture.at + 1_000,
      fixture.database,
    )
    const runtime = assignmentRuntime(correction)
    const inspected = await callTool(
      runtime.tools[INSPECT_ASSIGNMENTS_TOOL],
      { scope: "recent_terminal", offset: 0, limit: 10 },
      correction.step,
      "provider:inspect-terminal",
    )
    expect(inspected).toMatchObject({
      ok: true,
      assignments: [{
        id: fixture.assignmentId,
        version: 2,
        status: "completed",
      }],
    })

    finishModelOperation(correction.database, {
      modelOperationId: correction.modelOperationId,
      outcome: "completed",
      finishedAt: runtime.now() + 1,
    })
    const later = continueModel(correction, "after-inspection", runtime.now() + 2)
    const sourceRead = await callTool(
      runtime.tools[READ_ASSIGNMENT_SOURCE_TOOL],
      { assignmentId: fixture.assignmentId, version: 1, offset: 0, limit: 200 },
      later.step,
      "provider:read-inspected-source",
    )
    expect(sourceRead).toMatchObject({
      ok: true,
      assignmentId: fixture.assignmentId,
      version: 1,
      revision: {
        version: 1,
        kind: "create",
        dueAtIso: "2026-07-14T20:00+08:00",
        interpretationTimeZone: "Asia/Shanghai",
        rationale: "The learner reported the assignment.",
      },
      revisionIndex: {
        totalRevisions: 2,
        revisions: [
          { version: 1, kind: "create" },
          { version: 2, kind: "complete" },
        ],
      },
      content: "通识课短报告 7 月 14 日 20:00 截止，还需要 25 分钟。",
    })
    expect(JSON.stringify(readToolInvocation(correction.database, tutorToolInvocationId(
      later.modelOperationId,
      "provider:read-inspected-source",
    )).result)).not.toContain("还需要 25 分钟")
    const guessed = await callTool(
      runtime.tools[READ_ASSIGNMENT_SOURCE_TOOL],
      { assignmentId: "assignment:guessed", version: 1, offset: 0, limit: 10 },
      later.step,
      "provider:read-guessed",
    )
    expect(guessed).toMatchObject({ ok: false, code: "invalid_context" })

    const reopened = await callTool(
      runtime.tools[REOPEN_ASSIGNMENT_TOOL],
      {
        assignmentId: fixture.assignmentId,
        sourceExcerpt: "刚才提交失败了",
        rationale: "The learner reports that the terminal disposition was mistaken.",
      },
      later.step,
      "provider:reopen",
    )
    expect(reopened).toMatchObject({
      ok: true,
      disposition: "applied",
      assignment: { id: fixture.assignmentId, status: "open", version: 3 },
    })
  })

  test("inspection capability binds the sampled entity version instead of rereading latest", async () => {
    const fixture = terminalAssignmentFixture("stale")
    const correction = startTurn(
      "stale:correction",
      "其实没有提交成功，请重新打开它。",
      fixture.at + 1_000,
      fixture.database,
    )
    const runtime = assignmentRuntime(correction)
    await callTool(
      runtime.tools[INSPECT_ASSIGNMENTS_TOOL],
      { scope: "recent_terminal", offset: 0, limit: 10 },
      correction.step,
      "provider:inspect-stale",
    )
    finishModelOperation(correction.database, {
      modelOperationId: correction.modelOperationId,
      outcome: "completed",
      finishedAt: runtime.now() + 1,
    })
    const staleSample = continueModel(correction, "stale-sample", runtime.now() + 2)

    const concurrent = startTurn(
      "stale:concurrent",
      "历史更正：这份报告的标题应当是通识课期末短报告。",
      runtime.now() + 100,
      correction.database,
    )
    reviseAssignment(correction.database, {
      effectId: "effect:assignment:concurrent-revision",
      assignmentId: fixture.assignmentId,
      expectedVersion: 2,
      causeItemId: concurrent.sourceItemId,
      modelOperationId: concurrent.modelOperationId,
      sourceExcerpt: concurrent.sourceText,
      title: "通识课期末短报告",
      rationale: "A concurrent correction advances the entity version.",
      occurredAt: runtime.now() + 200,
    })

    const rejected = await callTool(
      runtime.tools[REOPEN_ASSIGNMENT_TOOL],
      {
        assignmentId: fixture.assignmentId,
        sourceExcerpt: "其实没有提交成功",
        rationale: "This model sample only saw Assignment version 2.",
      },
      staleSample.step,
      "provider:stale-reopen",
    )
    expect(rejected).toMatchObject({ ok: false, code: "stale_assignment" })
    expect(readAssignment(correction.database, fixture.assignmentId)).toMatchObject({
      status: "completed",
      version: 3,
    })
  })

  test("fresh samples get semantic replay while distinct same-title reports remain distinct", async () => {
    const at = Date.parse("2026-07-13T12:00:00+08:00")
    const first = startTurn(
      "semantic:first",
      "A 课的课程报告 7 月 14 日 20:00 截止。",
      at,
    )
    const runtime = assignmentRuntime(first)
    const input = {
      sourceExcerpt: "A 课的课程报告 7 月 14 日 20:00 截止",
      title: "课程报告",
      dueAt: "2026-07-14T20:00+08:00",
      admissionRationale: "The learner reported the A-course obligation.",
    }
    const created = await callTool(
      runtime.tools[CREATE_ASSIGNMENT_TOOL],
      input,
      first.step,
      "provider:create-first",
    )
    finishModelOperation(first.database, {
      modelOperationId: first.modelOperationId,
      outcome: "completed",
      finishedAt: runtime.now() + 1,
    })
    const retrySample = continueModel(first, "semantic-retry", runtime.now() + 2)
    const semanticReplay = await callTool(
      runtime.tools[CREATE_ASSIGNMENT_TOOL],
      input,
      retrySample.step,
      "provider:create-semantic-retry",
    )
    expect(semanticReplay).toMatchObject({
      ok: true,
      disposition: "already_applied",
      assignment: { id: mutationAssignmentId(created) },
    })

    finishModelOperation(first.database, {
      modelOperationId: retrySample.modelOperationId,
      outcome: "completed",
      finishedAt: runtime.now() + 1,
    })
    finishTurn(first.database, {
      turnId: first.turnId,
      outcome: "completed",
      finishedAt: runtime.now() + 2,
    })
    const distinct = startTurn(
      "semantic:distinct",
      "B 课也有一份课程报告 7 月 14 日 20:00 截止。",
      runtime.now() + 100,
      first.database,
    )
    const distinctRuntime = assignmentRuntime(distinct)
    const second = await callTool(
      distinctRuntime.tools[CREATE_ASSIGNMENT_TOOL],
      {
        sourceExcerpt: "B 课也有一份课程报告 7 月 14 日 20:00 截止",
        title: "课程报告",
        dueAt: input.dueAt,
        admissionRationale: "The learner explicitly distinguished the B-course obligation.",
      },
      distinct.step,
      "provider:create-distinct",
    )
    expect(mutationAssignmentId(second)).not.toBe(mutationAssignmentId(created))
    expect(countRows(first.database, "agenda_assignment")).toBe(2)
    expect(runtime.tools[CREATE_ASSIGNMENT_TOOL].description).toContain("inspect")
  })

  test("a terminal mutation retry reaches semantic replay after leaving active context", async () => {
    const at = Date.parse("2026-07-13T13:00:00+08:00")
    const createdTurn = startTurn(
      "terminal-replay:created",
      "通识课短报告 7 月 14 日 20:00 截止。",
      at,
    )
    const created = createAssignment(createdTurn.database, {
      effectId: "effect:assignment:terminal-replay:create",
      assignmentId: "assignment:terminal-replay",
      causeItemId: createdTurn.sourceItemId,
      modelOperationId: createdTurn.modelOperationId,
      sourceExcerpt: createdTurn.sourceText,
      title: "通识课短报告",
      dueAt: Date.parse("2026-07-14T20:00:00+08:00"),
      dueAtIso: "2026-07-14T20:00+08:00",
      interpretationTimeZone: "Asia/Shanghai",
      admissionRationale: "The learner reported a coursework assignment.",
      occurredAt: at + 2,
    })
    finishModelAndTurn(createdTurn, at + 10)

    const completion = startTurn(
      "terminal-replay:completion",
      "短报告已经提交，不需要再处理了。",
      at + 100,
      createdTurn.database,
    )
    const runtime = assignmentRuntime(completion)
    const input = {
      assignmentId: created.assignment.id,
      sourceExcerpt: completion.sourceText,
      rationale: "The learner reported that no local action remains.",
    }
    expect(await callTool(
      runtime.tools[COMPLETE_ASSIGNMENT_TOOL],
      input,
      completion.step,
      "provider:complete-first",
    )).toMatchObject({ ok: true, disposition: "applied" })

    finishModelOperation(completion.database, {
      modelOperationId: completion.modelOperationId,
      outcome: "completed",
      finishedAt: runtime.now() + 1,
    })
    const retrySample = continueModel(completion, "terminal-replay:retry", runtime.now() + 2)
    expect(retrySample.step.contextCut.assignments.totalActive).toBe(0)
    expect(await callTool(
      runtime.tools[COMPLETE_ASSIGNMENT_TOOL],
      input,
      retrySample.step,
      "provider:complete-semantic-retry",
    )).toMatchObject({
      ok: true,
      disposition: "already_applied",
      assignment: { id: created.assignment.id, status: "completed", version: 2 },
    })
  })
})

type StartedTurn = ReturnType<typeof startTurn>

function startTurn(
  scope: string,
  sourceText: string,
  at: number,
  existingDatabase?: ReturnType<typeof openRepaDatabase>,
) {
  const database = existingDatabase ?? openRepaDatabase(":memory:")
  if (!existingDatabase) databases.push(database)
  const sessionId = `session:${scope}`
  const turnId = `turn:${scope}`
  const sourceItemId = `item:user:${scope}`
  const modelOperationId = `model:${scope}:0`
  createSession(database, { sessionId, createdAt: at })
  admitUserTurn(database, {
    sessionId,
    turnId,
    itemId: sourceItemId,
    content: sourceText,
    createdAt: at,
  })
  const started = beginTutorModelOperation(database, {
    modelOperationId,
    turnId,
    sessionId,
    sampledAt: at + 1,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
  })
  if (started.replayed || "exhausted" in started) throw new Error("Expected new model sample")
  return {
    database,
    sessionId,
    turnId,
    sourceItemId,
    sourceText,
    modelOperationId,
    step: {
      modelOperationId,
      contextCut: started.context,
    } satisfies TutorStepContext,
    at,
  }
}

function continueModel(turn: StartedTurn, scope: string, sampledAt: number) {
  const modelOperationId = `model:${scope}`
  const started = beginTutorModelOperation(turn.database, {
    modelOperationId,
    turnId: turn.turnId,
    sessionId: turn.sessionId,
    sampledAt,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
  })
  if (started.replayed || "exhausted" in started) throw new Error("Expected continuation sample")
  return {
    modelOperationId,
    step: {
      modelOperationId,
      contextCut: started.context,
    } satisfies TutorStepContext,
  }
}

function assignmentRuntime(turn: StartedTurn) {
  let clock = turn.at + 2
  const coordinator = createTutorToolExecutionCoordinator()
  const binding = {
    database: turn.database,
    identity: {
      sessionId: turn.sessionId,
      turnId: turn.turnId,
      toolItemId: (invocationId: string) => `item:tool:${turn.turnId}:${invocationId}`,
    },
    clock: () => clock++,
  }
  return {
    tools: createAssignmentTools(binding, coordinator),
    now: () => clock++,
  }
}

async function callTool(
  tool: unknown,
  input: unknown,
  step: TutorStepContext,
  toolCallId: string,
) {
  const executable = tool as {
    execute: (
      input: unknown,
      options: { toolCallId: string; experimental_context: TutorStepContext },
    ) => Promise<unknown>
  }
  return executable.execute(input, { toolCallId, experimental_context: step })
}

function terminalAssignmentFixture(scope: string) {
  const at = Date.parse("2026-07-13T11:00:00+08:00")
  const createdTurn = startTurn(
    `${scope}:created`,
    "通识课短报告 7 月 14 日 20:00 截止，还需要 25 分钟。",
    at,
  )
  const created = createAssignment(createdTurn.database, {
    effectId: `effect:assignment:${scope}:create`,
    assignmentId: `assignment:${scope}`,
    causeItemId: createdTurn.sourceItemId,
    modelOperationId: createdTurn.modelOperationId,
    sourceExcerpt: "通识课短报告 7 月 14 日 20:00 截止",
    title: "通识课短报告",
    dueAt: Date.parse("2026-07-14T20:00:00+08:00"),
    dueAtIso: "2026-07-14T20:00+08:00",
    interpretationTimeZone: "Asia/Shanghai",
    admissionRationale: "The learner reported the assignment.",
    occurredAt: at + 2,
  })
  finishModelAndTurn(createdTurn, at + 10)

  const completedTurn = startTurn(
    `${scope}:completed`,
    "短报告已经提交，不需要再处理了。",
    at + 100,
    createdTurn.database,
  )
  completeAssignment(createdTurn.database, {
    effectId: `effect:assignment:${scope}:complete`,
    assignmentId: created.assignment.id,
    expectedVersion: 1,
    causeItemId: completedTurn.sourceItemId,
    modelOperationId: completedTurn.modelOperationId,
    sourceExcerpt: completedTurn.sourceText,
    rationale: "The learner reported no remaining local action.",
    occurredAt: at + 102,
  })
  finishModelAndTurn(completedTurn, at + 110)
  return { database: createdTurn.database, assignmentId: created.assignment.id, at }
}

function finishModelAndTurn(turn: StartedTurn, at: number) {
  finishModelOperation(turn.database, {
    modelOperationId: turn.modelOperationId,
    outcome: "completed",
    finishedAt: at,
  })
  finishTurn(turn.database, {
    turnId: turn.turnId,
    outcome: "completed",
    finishedAt: at,
  })
}

function mutationAssignmentId(outcome: unknown) {
  const parsed = outcome as { assignment?: { id?: unknown } }
  if (typeof parsed.assignment?.id !== "string") {
    throw new Error("Expected an Assignment mutation receipt")
  }
  return parsed.assignment.id
}

function countRows(database: ReturnType<typeof openRepaDatabase>, table: string) {
  const row = database.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}
