import { afterEach, describe, expect, test } from "bun:test"
import { createSession, admitUserTurn } from "../src/interaction/records"
import {
  cancelAssignment,
  completeAssignment,
  createAssignment,
  readAssignment,
  readAssignmentContext,
  readAssignmentRevisionIndex,
  readAssignmentSource,
  inspectAssignments,
  reopenAssignment,
  reviseAssignment,
} from "../src/learning/agenda/assignment"
import { openRepaDatabase } from "../src/storage/open-database"
import { readSystemState } from "../src/storage/system-state"
import { beginTutorModelOperation } from "../src/tutor/compile-context"
import { DEFAULT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"

const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A failed-path assertion may already have closed its fixture.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
})

describe("Agenda Assignment domain", () => {
  test("one admitted report creates a LearnerHome Assignment and overdue is query-time state", () => {
    const fixture = assignmentFixture("create")
    const stateBefore = readSystemState(fixture.database)
    const created = createAssignment(fixture.database, {
      effectId: "effect:assignment:create",
      assignmentId: "assignment:create",
      causeItemId: fixture.sourceItemId,
      modelOperationId: fixture.modelOperationId,
      sourceExcerpt: fixture.sourceText,
      title: "通识课短报告",
      dueAt: 60_000,
      dueAtIso: "1970-01-01T08:01:00+08:00",
      interpretationTimeZone: "Asia/Shanghai",
      admissionRationale: "The learner explicitly reported a coursework deliverable.",
      occurredAt: 1_200,
    })

    expect(created).toMatchObject({
      replayed: false,
      operationEffectId: "effect:assignment:create",
      assignment: {
        id: "assignment:create",
        status: "open",
        version: 1,
        title: "通识课短报告",
        dueAt: 60_000,
        source: {
          itemId: fixture.sourceItemId,
          excerpt: fixture.sourceText,
          startCodePoint: 0,
          endCodePoint: Array.from(fixture.sourceText).length,
        },
      },
    })
    expect(readAssignment(fixture.database, "assignment:create")).toEqual(
      created.assignment,
    )
    expect(readAssignmentContext(fixture.database, { at: 59_999, offset: 0, limit: 8 }))
      .toMatchObject({
        totalActive: 1,
        assignments: [{ id: "assignment:create", temporalState: "open" }],
      })
    expect(readAssignmentContext(fixture.database, { at: 60_000, offset: 0, limit: 8 }))
      .toMatchObject({
        totalActive: 1,
        assignments: [{ id: "assignment:create", temporalState: "overdue" }],
      })
    expect(readSystemState(fixture.database)).toEqual({
      revision: stateBefore.revision + 1,
      lastTransitionAt: 1_200,
    })
  })

  test("create replay is source-occurrence scoped while distinct same-title work can coexist", () => {
    const fixture = assignmentFixture("identity")
    const firstInput = assignmentCreateInput(fixture, {
      effectId: "effect:assignment:identity:first",
      assignmentId: "assignment:identity:first",
    })
    const first = createAssignment(fixture.database, firstInput)
    const replay = createAssignment(fixture.database, {
      ...firstInput,
      effectId: "effect:assignment:identity:replay",
      assignmentId: "assignment:identity:ignored",
      occurredAt: 1_300,
    })
    expect(replay).toMatchObject({
      replayed: true,
      operationEffectId: first.operationEffectId,
      assignment: { id: first.assignment.id },
    })

    const equivalentSpelling = createAssignment(fixture.database, {
      ...firstInput,
      effectId: "effect:assignment:identity:equivalent-offset",
      assignmentId: "assignment:identity:equivalent-offset",
      dueAtIso: "1970-01-01T00:01:00Z",
      occurredAt: 1_350,
    })
    expect(equivalentSpelling).toMatchObject({
      replayed: true,
      operationEffectId: first.operationEffectId,
    })
    expect(() =>
      createAssignment(fixture.database, {
        ...firstInput,
        effectId: "effect:assignment:identity:conflict",
        assignmentId: "assignment:identity:conflict",
        dueAt: 120_000,
        dueAtIso: "1970-01-01T08:02:00+08:00",
        occurredAt: 1_400,
      }),
    ).toThrow("already owns different meaning")

    const later = admitAssignmentTurn(fixture, {
      scope: "identity:second",
      sourceText: "另一门课也有一份同名的通识课短报告明天 20:00 截止。",
      createdAt: 1_500,
    })
    const second = createAssignment(fixture.database, {
      ...assignmentCreateInput(later, {
        effectId: "effect:assignment:identity:second",
        assignmentId: "assignment:identity:second",
      }),
      title: first.assignment.title,
      dueAt: first.assignment.dueAt,
      dueAtIso: first.assignment.dueAtIso,
      occurredAt: 1_700,
    })
    expect(second.assignment.id).not.toBe(first.assignment.id)
    expect(readAssignmentContext(fixture.database, { at: 1_800, offset: 0, limit: 8 }))
      .toMatchObject({ totalActive: 2 })
  })

  test("creation requires one unique exact source occurrence", () => {
    const fixture = assignmentFixture("source-span", "报告明天 20:00 截止；报告明天 20:00 截止。")
    expect(() =>
      createAssignment(fixture.database, {
        ...assignmentCreateInput(fixture, {
          effectId: "effect:assignment:source:ambiguous",
          assignmentId: "assignment:source:ambiguous",
        }),
        sourceExcerpt: "报告明天 20:00 截止",
      }),
    ).toThrow("ambiguous")
    expect(() =>
      createAssignment(fixture.database, {
        ...assignmentCreateInput(fixture, {
          effectId: "effect:assignment:source:absent",
          assignmentId: "assignment:source:absent",
        }),
        sourceExcerpt: "不存在的作业",
      }),
    ).toThrow("absent")
    expect(readSystemState(fixture.database).revision).toBe(0)

    const overlapping = assignmentFixture("source-overlap", "哈哈哈")
    expect(() => createAssignment(overlapping.database, {
      ...assignmentCreateInput(overlapping, {
        effectId: "effect:assignment:source:overlap",
        assignmentId: "assignment:source:overlap",
      }),
      sourceExcerpt: "哈哈",
    })).toThrow("ambiguous")

    const astral = assignmentFixture("source-astral", "😀 截止")
    expect(() => createAssignment(astral.database, {
      ...assignmentCreateInput(astral, {
        effectId: "effect:assignment:source:astral",
        assignmentId: "assignment:source:astral",
      }),
      sourceExcerpt: "\ud83d",
    })).toThrow("absent")
  })

  test("revision preserves disposition and reopen can atomically correct metadata", () => {
    const fixture = assignmentFixture("transitions")
    const created = createAssignment(
      fixture.database,
      assignmentCreateInput(fixture, {
        effectId: "effect:assignment:transitions:create",
        assignmentId: "assignment:transitions",
      }),
    )
    const revisedSource = admitAssignmentTurn(fixture, {
      scope: "transitions:revise",
      sourceText: "更正一下：短报告延期到后天 20:00。",
      createdAt: 1_300,
    })
    const revised = reviseAssignment(fixture.database, {
      effectId: "effect:assignment:transitions:revise",
      assignmentId: created.assignment.id,
      expectedVersion: 1,
      causeItemId: revisedSource.sourceItemId,
      modelOperationId: revisedSource.modelOperationId,
      sourceExcerpt: revisedSource.sourceText,
      dueAt: 120_000,
      dueAtIso: "1970-01-01T08:02:00+08:00",
      interpretationTimeZone: "Asia/Shanghai",
      rationale: "The learner corrected the deadline.",
      occurredAt: 1_500,
    })
    expect(revised.assignment).toMatchObject({
      status: "open",
      version: 2,
      dueAt: 120_000,
      source: { itemId: revisedSource.sourceItemId },
    })
    expect(reviseAssignment(fixture.database, {
      effectId: "effect:assignment:transitions:revise-equivalent-offset",
      assignmentId: created.assignment.id,
      expectedVersion: 1,
      causeItemId: revisedSource.sourceItemId,
      modelOperationId: revisedSource.modelOperationId,
      sourceExcerpt: revisedSource.sourceText,
      dueAt: 120_000,
      dueAtIso: "1970-01-01T00:02:00Z",
      interpretationTimeZone: "Asia/Shanghai",
      rationale: "The learner corrected the deadline.",
      occurredAt: 1_550,
    })).toMatchObject({ replayed: true, operationEffectId: revised.operationEffectId })
    expect(readAssignmentContext(fixture.database, { at: 1_550, offset: 0, limit: 8 }))
      .toMatchObject({ assignments: [{ sourceItemId: revisedSource.sourceItemId }] })

    const completedSource = admitAssignmentTurn(fixture, {
      scope: "transitions:complete",
      sourceText: "短报告已经提交，不需要再处理了。",
      createdAt: 1_600,
    })
    const completed = completeAssignment(fixture.database, {
      effectId: "effect:assignment:transitions:complete",
      assignmentId: created.assignment.id,
      expectedVersion: 2,
      causeItemId: completedSource.sourceItemId,
      modelOperationId: completedSource.modelOperationId,
      sourceExcerpt: completedSource.sourceText,
      rationale: "The learner reported that the tracked obligation is satisfied.",
      occurredAt: 1_800,
    })
    expect(completed.assignment).toMatchObject({ status: "completed", version: 3 })

    const historySource = admitAssignmentTurn(fixture, {
      scope: "transitions:history",
      sourceText: "历史更正：那份报告原本其实是 20:01 截止。",
      createdAt: 1_900,
    })
    const historyCorrected = reviseAssignment(fixture.database, {
      effectId: "effect:assignment:transitions:history",
      assignmentId: created.assignment.id,
      expectedVersion: 3,
      causeItemId: historySource.sourceItemId,
      modelOperationId: historySource.modelOperationId,
      sourceExcerpt: historySource.sourceText,
      dueAt: 180_000,
      dueAtIso: "1970-01-01T08:03:00+08:00",
      interpretationTimeZone: "Asia/Shanghai",
      rationale: "The learner corrected historical deadline metadata.",
      occurredAt: 2_100,
    })
    expect(historyCorrected.assignment).toMatchObject({
      status: "completed",
      version: 4,
      dueAt: 180_000,
    })

    const reopenSource = admitAssignmentTurn(fixture, {
      scope: "transitions:reopen",
      sourceText: "其实提交失败了，而且老师又延期到明天 20:00。",
      createdAt: 2_200,
    })
    const reopened = reopenAssignment(fixture.database, {
      effectId: "effect:assignment:transitions:reopen",
      assignmentId: created.assignment.id,
      expectedVersion: 4,
      causeItemId: reopenSource.sourceItemId,
      modelOperationId: reopenSource.modelOperationId,
      sourceExcerpt: reopenSource.sourceText,
      dueAt: 240_000,
      dueAtIso: "1970-01-01T08:04:00+08:00",
      interpretationTimeZone: "Asia/Shanghai",
      rationale: "The failed submission reopens the obligation with its corrected deadline.",
      occurredAt: 2_400,
    })
    expect(reopened.assignment).toMatchObject({
      status: "open",
      version: 5,
      dueAt: 240_000,
      source: { itemId: reopenSource.sourceItemId },
    })
    expect(reopenAssignment(fixture.database, {
      effectId: "effect:assignment:transitions:reopen-equivalent-offset",
      assignmentId: created.assignment.id,
      expectedVersion: 4,
      causeItemId: reopenSource.sourceItemId,
      modelOperationId: reopenSource.modelOperationId,
      sourceExcerpt: reopenSource.sourceText,
      dueAt: 240_000,
      dueAtIso: "1970-01-01T00:04:00Z",
      interpretationTimeZone: "Asia/Shanghai",
      rationale: "The failed submission reopens the obligation with its corrected deadline.",
      occurredAt: 2_450,
    })).toMatchObject({ replayed: true, operationEffectId: reopened.operationEffectId })
    expect(readAssignmentRevisionIndex(fixture.database, {
      assignmentId: created.assignment.id,
      offset: 0,
      limit: 3,
    })).toMatchObject({
      totalRevisions: 5,
      offset: 0,
      revisions: [
        {
          version: 1,
          kind: "create",
          status: "open",
          title: "通识课短报告",
          dueAt: 60_000,
          dueAtIso: "1970-01-01T08:01:00+08:00",
          interpretationTimeZone: "Asia/Shanghai",
          modelOperationId: fixture.modelOperationId,
        },
        {
          version: 2,
          kind: "revise",
          status: "open",
          dueAt: 120_000,
          rationale: "The learner corrected the deadline.",
          modelOperationId: revisedSource.modelOperationId,
        },
        {
          version: 3,
          kind: "complete",
          status: "completed",
          dueAt: 120_000,
          modelOperationId: completedSource.modelOperationId,
        },
      ],
    })
    expect(readAssignmentRevisionIndex(fixture.database, {
      assignmentId: created.assignment.id,
      offset: 3,
      limit: 2,
    }).revisions.map((revision) => revision.kind)).toEqual(["revise", "reopen"])

    const revisedSourceRead = readAssignmentSource(fixture.database, {
      assignmentId: created.assignment.id,
      version: 2,
      offset: 0,
      limit: 200,
    })
    expect(revisedSourceRead.revision).toMatchObject({
      version: 2,
      kind: "revise",
      dueAtIso: "1970-01-01T08:02:00+08:00",
      interpretationTimeZone: "Asia/Shanghai",
      rationale: "The learner corrected the deadline.",
      modelOperationId: revisedSource.modelOperationId,
    })
  })

  test("active and terminal inspection page independently while source detail stays bounded", () => {
    const fixture = assignmentFixture(
      "inspection",
      `${"前文".repeat(80)}通识课短报告明天 20:00 截止，大约还需要 25 分钟。${"后文".repeat(80)}`,
    )
    const exactExcerpt = "通识课短报告明天 20:00 截止"
    const first = createAssignment(fixture.database, {
      ...assignmentCreateInput(fixture, {
        effectId: "effect:assignment:inspection:first",
        assignmentId: "assignment:inspection:first",
      }),
      sourceExcerpt: exactExcerpt,
    })
    const secondSource = admitAssignmentTurn(fixture, {
      scope: "inspection:second",
      sourceText: "课程海报作业明天 21:00 截止。",
      createdAt: 1_300,
    })
    const second = createAssignment(fixture.database, {
      ...assignmentCreateInput(secondSource, {
        effectId: "effect:assignment:inspection:second",
        assignmentId: "assignment:inspection:second",
      }),
      title: "课程海报作业",
      dueAt: 120_000,
      dueAtIso: "1970-01-01T08:02:00+08:00",
      occurredAt: 1_500,
    })

    expect(inspectAssignments(fixture.database, {
      scope: "active",
      at: 1_600,
      offset: 0,
      limit: 1,
    })).toMatchObject({
      total: 2,
      offset: 0,
      assignments: [{ id: first.assignment.id, status: "open" }],
    })

    const completedSource = admitAssignmentTurn(fixture, {
      scope: "inspection:complete",
      sourceText: "课程海报已经提交，不需要再处理。",
      createdAt: 1_700,
    })
    completeAssignment(fixture.database, {
      effectId: "effect:assignment:inspection:complete",
      assignmentId: second.assignment.id,
      expectedVersion: 1,
      causeItemId: completedSource.sourceItemId,
      modelOperationId: completedSource.modelOperationId,
      sourceExcerpt: completedSource.sourceText,
      rationale: "The tracked submission obligation is satisfied.",
      occurredAt: 1_900,
    })
    expect(inspectAssignments(fixture.database, {
      scope: "recent_terminal",
      at: 2_000,
      offset: 0,
      limit: 10,
    })).toMatchObject({
      total: 1,
      assignments: [{ id: second.assignment.id, status: "completed" }],
    })

    const source = readAssignmentSource(fixture.database, {
      assignmentId: first.assignment.id,
      version: 1,
      offset: 150,
      limit: 80,
    })
    expect(source).toMatchObject({
      assignmentId: first.assignment.id,
      version: 1,
      sourceItemId: fixture.sourceItemId,
      offset: 150,
      limit: 80,
      truncatedBefore: true,
      truncatedAfter: true,
    })
    expect(source.content).toContain(exactExcerpt)
    expect(source.totalCodePoints).toBe(Array.from(fixture.sourceText).length)
  })

  test("an unrelated global commit does not stale a current Assignment entity version", () => {
    const fixture = assignmentFixture("entity-version")
    const target = createAssignment(
      fixture.database,
      assignmentCreateInput(fixture, {
        effectId: "effect:assignment:entity-version:target",
        assignmentId: "assignment:entity-version:target",
      }),
    )
    const unrelatedSource = admitAssignmentTurn(fixture, {
      scope: "entity-version:unrelated",
      sourceText: "另一门课的海报作业明天 21:00 截止。",
      createdAt: 1_300,
    })
    createAssignment(fixture.database, {
      ...assignmentCreateInput(unrelatedSource, {
        effectId: "effect:assignment:entity-version:unrelated",
        assignmentId: "assignment:entity-version:unrelated",
      }),
      title: "海报作业",
      dueAt: 180_000,
      dueAtIso: "1970-01-01T08:03:00+08:00",
      occurredAt: 1_500,
    })
    const correction = admitAssignmentTurn(fixture, {
      scope: "entity-version:correction",
      sourceText: "更正：通识课短报告延期到后天 20:00。",
      createdAt: 1_600,
    })

    const revised = reviseAssignment(fixture.database, {
      effectId: "effect:assignment:entity-version:revise",
      assignmentId: target.assignment.id,
      expectedVersion: 1,
      causeItemId: correction.sourceItemId,
      modelOperationId: correction.modelOperationId,
      sourceExcerpt: correction.sourceText,
      dueAt: 240_000,
      dueAtIso: "1970-01-01T08:04:00+08:00",
      interpretationTimeZone: "Asia/Shanghai",
      rationale: "The learner corrected the target deadline.",
      occurredAt: 1_800,
    })
    expect(revised.assignment).toMatchObject({ id: target.assignment.id, version: 2 })
    expect(readSystemState(fixture.database).revision).toBe(3)
  })

  test("transition replay precedes stale rejection and rollback leaves no partial Assignment meaning", () => {
    const fixture = assignmentFixture("failure")
    const created = createAssignment(
      fixture.database,
      assignmentCreateInput(fixture, {
        effectId: "effect:assignment:failure:create",
        assignmentId: "assignment:failure",
      }),
    )
    const completeSource = admitAssignmentTurn(fixture, {
      scope: "failure:complete",
      sourceText: "短报告已经提交，不需要再处理。",
      createdAt: 1_300,
    })
    const completeInput = {
      effectId: "effect:assignment:failure:complete",
      assignmentId: created.assignment.id,
      expectedVersion: 1,
      causeItemId: completeSource.sourceItemId,
      modelOperationId: completeSource.modelOperationId,
      sourceExcerpt: completeSource.sourceText,
      rationale: "The tracked obligation is satisfied.",
      occurredAt: 1_500,
    }
    completeAssignment(fixture.database, completeInput)
    const reopenSource = admitAssignmentTurn(fixture, {
      scope: "failure:reopen",
      sourceText: "提交失败了，其实还要继续处理。",
      createdAt: 1_600,
    })
    reopenAssignment(fixture.database, {
      effectId: "effect:assignment:failure:reopen",
      assignmentId: created.assignment.id,
      expectedVersion: 2,
      causeItemId: reopenSource.sourceItemId,
      modelOperationId: reopenSource.modelOperationId,
      sourceExcerpt: reopenSource.sourceText,
      rationale: "The reported failed submission restores the obligation.",
      occurredAt: 1_800,
    })

    const replay = completeAssignment(fixture.database, {
      ...completeInput,
      effectId: "effect:assignment:failure:replayed-call",
      occurredAt: 1_900,
    })
    expect(replay).toMatchObject({
      replayed: true,
      operationEffectId: completeInput.effectId,
      assignment: { status: "open", version: 3 },
    })
    expect(() => completeAssignment(fixture.database, {
      ...completeInput,
      effectId: "effect:assignment:failure:conflict",
      rationale: "A conflicting meaning for the same occurrence.",
      occurredAt: 2_000,
    })).toThrow("already owns different meaning")

    const staleSource = admitAssignmentTurn(fixture, {
      scope: "failure:stale",
      sourceText: "短报告现在已经提交。",
      createdAt: 2_100,
    })
    const revisionBeforeStale = readSystemState(fixture.database).revision
    expect(() => completeAssignment(fixture.database, {
      effectId: "effect:assignment:failure:stale",
      assignmentId: created.assignment.id,
      expectedVersion: 1,
      causeItemId: staleSource.sourceItemId,
      modelOperationId: staleSource.modelOperationId,
      sourceExcerpt: staleSource.sourceText,
      rationale: "This sample saw a stale Assignment version.",
      occurredAt: 2_300,
    })).toThrow("version changed")
    expect(readSystemState(fixture.database).revision).toBe(revisionBeforeStale)

    const cancelSource = admitAssignmentTurn(fixture, {
      scope: "failure:cancel",
      sourceText: "这份本地记录是重复的，请不要再跟踪它。",
      createdAt: 2_400,
    })
    const cancelled = cancelAssignment(fixture.database, {
      effectId: "effect:assignment:failure:cancel",
      assignmentId: created.assignment.id,
      expectedVersion: 3,
      causeItemId: cancelSource.sourceItemId,
      modelOperationId: cancelSource.modelOperationId,
      sourceExcerpt: cancelSource.sourceText,
      rationale: "The learner cancels local tracking of a duplicate record.",
      occurredAt: 2_600,
    })
    expect(cancelled.assignment).toMatchObject({ status: "cancelled", version: 4 })

    const rollbackSource = admitAssignmentTurn(fixture, {
      scope: "failure:rollback",
      sourceText: "刚才取消错了，其实仍要继续处理，而且延期到明天 20:00。",
      createdAt: 2_700,
    })
    fixture.database.exec(`
      CREATE TRIGGER fail_assignment_reopen
      BEFORE UPDATE ON agenda_assignment
      BEGIN
        SELECT RAISE(ABORT, 'controlled Assignment rollback');
      END;
    `)
    const revisionBeforeRollback = readSystemState(fixture.database).revision
    expect(() => reopenAssignment(fixture.database, {
      effectId: "effect:assignment:failure:rollback",
      assignmentId: created.assignment.id,
      expectedVersion: 4,
      causeItemId: rollbackSource.sourceItemId,
      modelOperationId: rollbackSource.modelOperationId,
      sourceExcerpt: rollbackSource.sourceText,
      dueAt: 300_000,
      dueAtIso: "1970-01-01T08:05:00+08:00",
      interpretationTimeZone: "Asia/Shanghai",
      rationale: "The learner corrects disposition and deadline atomically.",
      occurredAt: 2_900,
    })).toThrow("controlled Assignment rollback")
    fixture.database.exec("DROP TRIGGER fail_assignment_reopen")
    expect(readAssignment(fixture.database, created.assignment.id)).toMatchObject({
      status: "cancelled",
      version: 4,
      dueAt: 60_000,
    })
    expect(readSystemState(fixture.database).revision).toBe(revisionBeforeRollback)
    expect(fixture.database.query(
      "SELECT 1 AS found FROM durable_effect WHERE effect_id = ?1",
    ).get("effect:assignment:failure:rollback")).toBeNull()
  })
})

function assignmentFixture(
  scope: string,
  sourceText = "通识课短报告明天 20:00 截止，大约还需要 25 分钟。",
) {
  const database = openRepaDatabase(":memory:")
  openDatabases.push(database)
  const sessionId = `session:${scope}`
  const turnId = `turn:${scope}`
  const sourceItemId = `item:user:${scope}`
  const modelOperationId = `model:${scope}`
  createSession(database, { sessionId, createdAt: 1_000 })
  admitUserTurn(database, {
    sessionId,
    turnId,
    itemId: sourceItemId,
    content: sourceText,
    createdAt: 1_000,
  })
  beginTutorModelOperation(database, {
    modelOperationId,
    turnId,
    sessionId,
    sampledAt: 1_100,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
  })
  return { database, sourceItemId, modelOperationId, sourceText }
}

function admitAssignmentTurn(
  fixture: ReturnType<typeof assignmentFixture>,
  input: { scope: string; sourceText: string; createdAt: number },
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
    content: input.sourceText,
    createdAt: input.createdAt,
  })
  beginTutorModelOperation(fixture.database, {
    modelOperationId,
    turnId,
    sessionId,
    sampledAt: input.createdAt + 100,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
  })
  return {
    database: fixture.database,
    sourceItemId,
    modelOperationId,
    sourceText: input.sourceText,
  }
}

function assignmentCreateInput(
  fixture: Pick<ReturnType<typeof assignmentFixture>, "sourceItemId" | "modelOperationId" | "sourceText">,
  identity: { effectId: string; assignmentId: string },
) {
  return {
    ...identity,
    causeItemId: fixture.sourceItemId,
    modelOperationId: fixture.modelOperationId,
    sourceExcerpt: fixture.sourceText,
    title: "通识课短报告",
    dueAt: 60_000,
    dueAtIso: "1970-01-01T08:01:00+08:00",
    interpretationTimeZone: "Asia/Shanghai",
    admissionRationale: "The learner explicitly reported a coursework deliverable.",
    occurredAt: 1_200,
  }
}
