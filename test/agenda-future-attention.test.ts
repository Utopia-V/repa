import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  admitUserTurn,
  appendSessionItem,
  createSession,
  finishModelOperation,
  finishTurn,
} from "../src/interaction/records"
import {
  advanceCourseRoute,
  createProvisionalCourse,
  readActiveCourseContext,
} from "../src/learning/curriculum/course-view"
import { reviseProvisionalCourse } from "../src/learning/curriculum/course-correction"
import {
  addressFutureAttentionConcern,
  createFutureAttentionConcern,
  dismissFutureAttentionConcern,
  FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS,
  listFutureAttentionTransitions,
  readFutureAttentionConcern,
  readConditionalFutureAttentionCandidate,
  readFutureAttentionContext,
  readFutureAttentionSource,
  reopenFutureAttentionConcern,
  supersedeFutureAttentionConcern,
} from "../src/learning/agenda/future-attention"
import { openRepaDatabase } from "../src/storage/open-database"
import { readSystemState } from "../src/storage/system-state"
import { beginTutorModelOperation, compileTutorContext } from "../src/tutor/compile-context"
import {
  CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
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

describe("Agenda future-attention domain", () => {
  test("the frozen v3 identity still composes one constrained conditional purpose", () => {
    const fixture = agendaFixture("v3-conditional-purpose")
    const created = createFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:v3:conditional",
      concernId: "agenda:v3:conditional",
      causeItemId: fixture.sourceItemId,
      modelOperationId: fixture.modelOperationId,
      target: fixture.target,
      authorship: {
        kind: "learner_requested",
        learnerRequestExcerpt: "明天再独立检查一次",
      },
      reason: "Let the learner predict before Tutor disclosure.",
      learnerRoleConstraint: {
        kind: "learner_response_before_tutor_disclosure",
      },
      notBefore: 50,
      occurredAt: 12,
    })
    createSession(fixture.database, { sessionId: "session:v3:conditional", createdAt: 100 })
    admitUserTurn(fixture.database, {
      sessionId: "session:v3:conditional",
      turnId: "turn:v3:conditional",
      itemId: "item:user:v3:conditional",
      content: "继续。",
      createdAt: 100,
    })

    expect(compileTutorContext(fixture.database, {
      sessionId: "session:v3:conditional",
      sampledAt: 101,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
    }).conditionalCurrentPurpose).toMatchObject({
      source: { concernId: created.concern.id },
      learnerRoleConstraint: {
        kind: "learner_response_before_tutor_disclosure",
      },
    })
  })

  test("one admitted source and exact Course View target own one semantic create slot", () => {
    const fixture = agendaFixture("create-slot")
    const stateBefore = readSystemState(fixture.database)
    const input = {
      effectId: "effect:agenda:create:one",
      concernId: "agenda:one",
      causeItemId: fixture.sourceItemId,
      modelOperationId: fixture.modelOperationId,
      target: fixture.target,
      authorship: {
        kind: "learner_requested" as const,
        learnerRequestExcerpt: "明天再独立检查一次",
      },
      reason: "Check whether object-reference behavior can be predicted independently.",
      notBefore: 50,
      occurredAt: 12,
    }

    const created = createFutureAttentionConcern(fixture.database, input)

    expect(created).toMatchObject({
      replayed: false,
      operationEffectId: "effect:agenda:create:one",
      concern: {
        id: "agenda:one",
        status: "open",
        version: 1,
        target: fixture.target,
      },
    })
    expect(readSystemState(fixture.database).revision).toBe(stateBefore.revision + 1)

    const replay = createFutureAttentionConcern(fixture.database, {
      ...input,
      effectId: "effect:agenda:create:replayed-call",
      concernId: "agenda:ignored-replay-id",
      occurredAt: 13,
    })
    expect(replay).toMatchObject({
      replayed: true,
      operationEffectId: "effect:agenda:create:one",
      concern: { id: "agenda:one", status: "open", version: 1 },
    })
    expect(readSystemState(fixture.database).revision).toBe(stateBefore.revision + 1)

    expect(() =>
      createFutureAttentionConcern(fixture.database, {
        ...input,
        effectId: "effect:agenda:create:conflict",
        concernId: "agenda:conflict",
        reason: "Return with a different purpose in the same create slot.",
        occurredAt: 14,
      }),
    ).toThrow("already owns a different future-attention meaning")
    expect(readFutureAttentionConcern(fixture.database, "agenda:one").reason).toBe(
      input.reason,
    )
  })

  test("one exact constrained concern is a legal conditional candidate but two are unresolved", () => {
    const fixture = agendaFixture("conditional-candidate")
    const constraint = {
      kind: "learner_response_before_tutor_disclosure" as const,
    }
    const first = createConcern(fixture, "agenda:conditional:first", {
      learnerRoleConstraint: constraint,
    })

    expect(first.concern.learnerRoleConstraint).toEqual(constraint)
    expect(readFutureAttentionConcern(
      fixture.database,
      first.concern.id,
    ).learnerRoleConstraint).toEqual(constraint)
    expect(readConditionalFutureAttentionCandidate(fixture.database, {
      activeCourseId: fixture.target.courseId,
      activeCourseViewRevisionId: fixture.target.courseViewRevisionId,
      at: 100,
    })).toMatchObject({
      legalCandidateCount: 1,
      candidate: {
        id: first.concern.id,
        learnerRoleConstraint: constraint,
      },
    })

    const unconstrainedSource = admitAgendaTurn(fixture, {
      scope: "conditional-candidate-unconstrained",
      content: "以后再解释一次这个主题。",
      createdAt: 16,
    })
    createFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:conditional:unconstrained",
      concernId: "agenda:conditional:unconstrained",
      causeItemId: unconstrainedSource.sourceItemId,
      modelOperationId: unconstrainedSource.modelOperationId,
      target: fixture.target,
      authorship: { kind: "tutor_initiated" },
      reason: "Return later with another explanation.",
      notBefore: 50,
      occurredAt: 18,
    })
    expect(readConditionalFutureAttentionCandidate(fixture.database, {
      activeCourseId: fixture.target.courseId,
      activeCourseViewRevisionId: fixture.target.courseViewRevisionId,
      at: 100,
    })).toMatchObject({
      legalCandidateCount: 1,
      candidate: { id: first.concern.id },
    })

    const secondSource = admitAgendaTurn(fixture, {
      scope: "conditional-candidate-second",
      content: "下次仍然先让我回答，再告诉我关键结论。",
      createdAt: 20,
    })
    createFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:conditional:second",
      concernId: "agenda:conditional:second",
      causeItemId: secondSource.sourceItemId,
      modelOperationId: secondSource.modelOperationId,
      target: fixture.target,
      authorship: {
        kind: "learner_requested",
        learnerRequestExcerpt: "先让我回答",
      },
      reason: "Return for another prediction before explaining the decisive rule.",
      learnerRoleConstraint: constraint,
      notBefore: 50,
      occurredAt: 22,
    })

    expect(readConditionalFutureAttentionCandidate(fixture.database, {
      activeCourseId: fixture.target.courseId,
      activeCourseViewRevisionId: fixture.target.courseViewRevisionId,
      at: 100,
    })).toEqual({ legalCandidateCount: 2, candidate: null })

    createSession(fixture.database, {
      sessionId: "session:conditional:ambiguous",
      createdAt: 30,
    })
    admitUserTurn(fixture.database, {
      sessionId: "session:conditional:ambiguous",
      turnId: "turn:conditional:ambiguous",
      itemId: "item:user:conditional:ambiguous",
      content: "继续。",
      createdAt: 30,
    })
    expect(compileTutorContext(fixture.database, {
      sessionId: "session:conditional:ambiguous",
      sampledAt: 31,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: CURRENT_TUTOR_POLICY_PROFILE_REVISION,
    }).conditionalCurrentPurpose).toBeNull()
  })

  test("learner-requested creation must quote the admitted learner source", () => {
    const fixture = agendaFixture("create-authorship")
    const revisionBefore = readSystemState(fixture.database).revision

    expect(() =>
      createFutureAttentionConcern(fixture.database, {
        effectId: "effect:agenda:create:invented-quote",
        concernId: "agenda:invented-quote",
        causeItemId: fixture.sourceItemId,
        modelOperationId: fixture.modelOperationId,
        target: fixture.target,
        authorship: {
          kind: "learner_requested",
          learnerRequestExcerpt: "学习者根本没有说过这句话",
        },
        reason: "A model-authored inference must not masquerade as a learner request.",
        notBefore: 50,
        occurredAt: 12,
      }),
    ).toThrow("excerpt is not present")
    expect(readSystemState(fixture.database).revision).toBe(revisionBefore)
    expect(readFutureAttentionContext(fixture.database, {
      activeCourseId: fixture.target.courseId,
      at: 100,
      limit: 8,
    })).toEqual({ totalOpen: 0, concerns: [] })
  })

  test("time and reopen change eligibility projection without mutating the concern", () => {
    const fixture = agendaFixture("eligibility")
    const sourceText = "这部分还是没懂；明天再独立检查一次。"
    expect(fixture.sourceText).toBe(sourceText)
    createFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:eligibility",
      concernId: "agenda:eligibility",
      causeItemId: fixture.sourceItemId,
      modelOperationId: fixture.modelOperationId,
      target: fixture.target,
      authorship: {
        kind: "learner_requested",
        learnerRequestExcerpt: "明天再独立检查一次",
      },
      reason: "Later check independent prediction of object identity.",
      notBefore: 50,
      occurredAt: 12,
    })
    const revisionAfterCreate = readSystemState(fixture.database).revision

    expect(readFutureAttentionContext(fixture.database, {
      activeCourseId: fixture.target.courseId,
      at: 49,
      limit: 8,
    })).toMatchObject({
      totalOpen: 1,
      concerns: [
        {
          id: "agenda:eligibility",
          eligibility: "upcoming",
          targetState: "current",
          sourceItemId: fixture.sourceItemId,
        },
      ],
    })
    expect(readFutureAttentionContext(fixture.database, {
      activeCourseId: fixture.target.courseId,
      at: 50,
      limit: 8,
    }).concerns[0]?.eligibility).toBe("eligible")
    expect(readSystemState(fixture.database).revision).toBe(revisionAfterCreate)
    expect(JSON.stringify(readFutureAttentionContext(fixture.database, {
      activeCourseId: fixture.target.courseId,
      at: 50,
      limit: 8,
    }))).not.toContain(sourceText)
    expect(readFutureAttentionSource(fixture.database, "agenda:eligibility")).toMatchObject({
      source: { itemId: fixture.sourceItemId, role: "user", content: sourceText },
    })

    fixture.database.close()
    openDatabases.splice(openDatabases.indexOf(fixture.database), 1)
    const reopened = openRepaDatabase(fixture.databasePath)
    openDatabases.push(reopened)
    expect(readFutureAttentionContext(reopened, {
      activeCourseId: fixture.target.courseId,
      at: 50,
      limit: 8,
    }).concerns).toEqual([
      expect.objectContaining({
        id: "agenda:eligibility",
        reason: "Later check independent prediction of object identity.",
        eligibility: "eligible",
      }),
    ])
    expect(readSystemState(reopened).revision).toBe(revisionAfterCreate)
  })

  test("a stale-view concern cannot crowd a current-view concern out of bounded context", () => {
    const fixture = agendaFixture("context-current-first")
    createConcern(fixture, "agenda:old-view")
    const correction = admitAgendaTurn(fixture, {
      scope: "context-view-revision",
      content: "修订课程目录。",
      createdAt: 20,
    })
    const before = readActiveCourseContext(fixture.database)
    if (!before) throw new Error("Context-priority fixture lost its active course")
    reviseProvisionalCourse(fixture.database, {
      effectId: "effect:course:view-revision:context-priority",
      causeItemId: correction.sourceItemId,
      courseId: before.courseId,
      expectedViewRevisionId: before.courseViewRevisionId,
      expectedAnchorItemId: before.route.anchor.itemId,
      expectedRouteVersion: before.route.version,
      items: [{ title: "Identity model" }, { title: "Aliasing model" }],
      routeAnchorIndex: 0,
      occurredAt: 22,
    })
    const current = readActiveCourseContext(fixture.database)
    if (!current) throw new Error("Context-priority fixture has no revised course")
    const currentSource = admitAgendaTurn(fixture, {
      scope: "context-current-target",
      content: "在修订后的当前条目保留一个回访目的。",
      createdAt: 30,
    })
    createFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:current-view",
      concernId: "agenda:current-view",
      causeItemId: currentSource.sourceItemId,
      modelOperationId: currentSource.modelOperationId,
      target: {
        courseId: current.courseId,
        courseViewRevisionId: current.courseViewRevisionId,
        courseItemId: current.route.anchor.itemId,
      },
      authorship: { kind: "tutor_initiated" },
      reason: "Revisit the corrected causal target.",
      notBefore: 70,
      occurredAt: 32,
    })

    expect(readFutureAttentionContext(fixture.database, {
      activeCourseId: current.courseId,
      at: 100,
      limit: 1,
    }).concerns.map((concern) => concern.id)).toEqual(["agenda:current-view"])
    expect(readFutureAttentionContext(fixture.database, {
      activeCourseId: current.courseId,
      at: 100,
      limit: 8,
    }).concerns).toEqual([
      expect.objectContaining({ id: "agenda:current-view", targetState: "current" }),
      expect.objectContaining({ id: "agenda:old-view", targetState: "superseded_view" }),
    ])
  })

  test("bounded lazy source keeps the learner excerpt even when it occurs at the tail", () => {
    const fixture = agendaFixture("bounded-tail-source")
    const excerpt = "明天检查尾部这个请求"
    const longSource = `${"前".repeat(FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS + 500)}${excerpt}`
    const source = admitAgendaTurn(fixture, {
      scope: "long-source-tail",
      content: longSource,
      createdAt: 20,
    })
    createFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:long-source-tail",
      concernId: "agenda:long-source-tail",
      causeItemId: source.sourceItemId,
      modelOperationId: source.modelOperationId,
      target: fixture.target,
      authorship: { kind: "learner_requested", learnerRequestExcerpt: excerpt },
      reason: "Preserve a bounded source window around the actual learner request.",
      notBefore: 50,
      occurredAt: 22,
    })

    const projected = readFutureAttentionSource(fixture.database, "agenda:long-source-tail").source
    expect(projected.contentTruncated).toBe(true)
    expect(projected.content).toContain(excerpt)
    expect(Array.from(projected.content)).toHaveLength(FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS)
    expect(projected.contentStartCodePoint).toBeGreaterThan(0)
  })

  test("addressing cites a later complete occurrence but creates no learning evidence", () => {
    const fixture = agendaFixture("address")
    createConcern(fixture, "agenda:address")
    const later = admitAgendaTurn(fixture, {
      scope: "answer",
      content: "在新例子里，两个变量仍然指向同一个对象。",
      createdAt: 20,
    })

    const addressed = addressFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:address",
      causeItemId: later.sourceItemId,
      modelOperationId: later.modelOperationId,
      concernId: "agenda:address",
      expectedVersion: 1,
      serviceOccurrenceItemId: later.sourceItemId,
      alignmentRationale:
        "The current learner response is the delayed independent prediction requested by this concern.",
      occurredAt: 22,
    })

    expect(addressed).toMatchObject({
      replayed: false,
      operationEffectId: "effect:agenda:address",
      concern: { id: "agenda:address", status: "addressed", version: 2 },
    })
    expect(readFutureAttentionContext(fixture.database, {
      activeCourseId: fixture.target.courseId,
      at: 100,
      limit: 8,
    })).toEqual({ totalOpen: 0, concerns: [] })
    expect(listFutureAttentionTransitions(fixture.database, "agenda:address")).toEqual([
      expect.objectContaining({
        fromStatus: "open",
        toStatus: "addressed",
        serviceOccurrenceItemId: later.sourceItemId,
      }),
    ])
    expect(tableNames(fixture.database)).not.toContain("learner_evidence")

    const replay = addressFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:address:replay",
      causeItemId: later.sourceItemId,
      modelOperationId: later.modelOperationId,
      concernId: "agenda:address",
      expectedVersion: 1,
      serviceOccurrenceItemId: later.sourceItemId,
      alignmentRationale:
        "The current learner response is the delayed independent prediction requested by this concern.",
      occurredAt: 23,
    })
    expect(replay).toMatchObject({
      replayed: true,
      operationEffectId: "effect:agenda:address",
      concern: { status: "addressed", version: 2 },
    })
    expect(() =>
      addressFutureAttentionConcern(fixture.database, {
        effectId: "effect:agenda:address:conflict",
        causeItemId: later.sourceItemId,
        modelOperationId: later.modelOperationId,
        concernId: "agenda:address",
        expectedVersion: 1,
        serviceOccurrenceItemId: later.sourceItemId,
        alignmentRationale: "A conflicting rationale in the same transition slot.",
        occurredAt: 24,
      }),
    ).toThrow("already owns a different address transition")
  })

  test("stale entity input and failed storage transition leave zero partial meaning", () => {
    const fixture = agendaFixture("transition-rollback")
    createConcern(fixture, "agenda:rollback")
    const later = admitAgendaTurn(fixture, {
      scope: "rollback-answer",
      content: "我现在独立回答这个问题。",
      createdAt: 20,
    })
    const stateBefore = readSystemState(fixture.database)

    expect(() =>
      addressFutureAttentionConcern(fixture.database, {
        effectId: "effect:agenda:address:stale-version",
        causeItemId: later.sourceItemId,
        modelOperationId: later.modelOperationId,
        concernId: "agenda:rollback",
        expectedVersion: 2,
        serviceOccurrenceItemId: later.sourceItemId,
        alignmentRationale: "This should fail before writing.",
        occurredAt: 22,
      }),
    ).toThrow("Stale Agenda concern version")
    expect(readSystemState(fixture.database)).toEqual(stateBefore)
    expect(listFutureAttentionTransitions(fixture.database, "agenda:rollback")).toEqual([])

    fixture.database.exec(`
      CREATE TRIGGER reject_agenda_address_for_test
      BEFORE UPDATE ON agenda_revisit
      WHEN NEW.status = 'addressed'
      BEGIN
        SELECT RAISE(ABORT, 'injected Agenda update failure');
      END;
    `)
    expect(() =>
      addressFutureAttentionConcern(fixture.database, {
        effectId: "effect:agenda:address:rolled-back",
        causeItemId: later.sourceItemId,
        modelOperationId: later.modelOperationId,
        concernId: "agenda:rollback",
        expectedVersion: 1,
        serviceOccurrenceItemId: later.sourceItemId,
        alignmentRationale: "The learner supplied the delayed response.",
        occurredAt: 23,
      }),
    ).toThrow("injected Agenda update failure")
    expect(readFutureAttentionConcern(fixture.database, "agenda:rollback")).toMatchObject({
      status: "open",
      version: 1,
    })
    expect(listFutureAttentionTransitions(fixture.database, "agenda:rollback")).toEqual([])
    expect(fixture.database.query(
      "SELECT 1 AS found FROM durable_effect WHERE effect_id = ?1",
    ).get("effect:agenda:address:rolled-back")).toBeNull()
    expect(readSystemState(fixture.database)).toEqual(stateBefore)
  })

  test("route progress does not stale a target, but Course View supersession does", () => {
    const routeFixture = agendaFixture("route-not-stale")
    createConcern(routeFixture, "agenda:route-not-stale")
    const routeAnswer = admitAgendaTurn(routeFixture, {
      scope: "route-answer",
      content: "我独立判断：两个变量仍然指向同一个对象；然后可以继续路线。",
      createdAt: 20,
    })
    const route = readActiveCourseContext(routeFixture.database)
    if (!route) throw new Error("Route fixture lost its active course")
    advanceCourseRoute(routeFixture.database, {
      effectId: "effect:route:advance:agenda-proof",
      causeItemId: routeAnswer.sourceItemId,
      courseId: route.courseId,
      expectedViewRevisionId: route.courseViewRevisionId,
      expectedAnchorItemId: route.route.anchor.itemId,
      expectedRouteVersion: route.route.version,
      occurredAt: 22,
    })
    expect(addressFutureAttentionConcern(routeFixture.database, {
      effectId: "effect:agenda:address:after-route",
      causeItemId: routeAnswer.sourceItemId,
      modelOperationId: routeAnswer.modelOperationId,
      concernId: "agenda:route-not-stale",
      expectedVersion: 1,
      serviceOccurrenceItemId: routeAnswer.sourceItemId,
      alignmentRationale: "Route movement does not erase the later learner occurrence.",
      occurredAt: 23,
    })).toMatchObject({ concern: { status: "addressed" } })

    const viewFixture = agendaFixture("view-stale")
    createConcern(viewFixture, "agenda:view-stale")
    const viewAnswer = admitAgendaTurn(viewFixture, {
      scope: "view-answer",
      content: "课程结构已经修订，但我回答的是旧条目。",
      createdAt: 20,
    })
    const beforeRevision = readActiveCourseContext(viewFixture.database)
    if (!beforeRevision) throw new Error("View fixture lost its active course")
    reviseProvisionalCourse(viewFixture.database, {
      effectId: "effect:course:view-revision:agenda-proof",
      causeItemId: viewAnswer.sourceItemId,
      courseId: beforeRevision.courseId,
      expectedViewRevisionId: beforeRevision.courseViewRevisionId,
      expectedAnchorItemId: beforeRevision.route.anchor.itemId,
      expectedRouteVersion: beforeRevision.route.version,
      items: [
        { title: "Identity through diagrams" },
        { title: "Aliasing through counterexamples" },
      ],
      routeAnchorIndex: 0,
      occurredAt: 22,
    })
    expect(() =>
      addressFutureAttentionConcern(viewFixture.database, {
        effectId: "effect:agenda:address:stale-view",
        causeItemId: viewAnswer.sourceItemId,
        modelOperationId: viewAnswer.modelOperationId,
        concernId: "agenda:view-stale",
        expectedVersion: 1,
        serviceOccurrenceItemId: viewAnswer.sourceItemId,
        alignmentRationale: "Old target should require explicit reconciliation.",
        occurredAt: 23,
      }),
    ).toThrow("Course View is no longer active")
    expect(readFutureAttentionConcern(viewFixture.database, "agenda:view-stale").status).toBe("open")
  })

  test("dismissal requires explicit learner text and does not masquerade as service", () => {
    const fixture = agendaFixture("dismiss")
    createConcern(fixture, "agenda:dismiss")
    const later = admitAgendaTurn(fixture, {
      scope: "cancel",
      content: "取消明天的这次检查，我现在不想保留它。",
      createdAt: 20,
    })

    expect(() =>
      dismissFutureAttentionConcern(fixture.database, {
        effectId: "effect:agenda:dismiss:bad-excerpt",
        causeItemId: later.sourceItemId,
        modelOperationId: later.modelOperationId,
        concernId: "agenda:dismiss",
        expectedVersion: 1,
        learnerRequestExcerpt: "这段文字并不存在",
        rationale: "Learner cancellation.",
        occurredAt: 22,
      }),
    ).toThrow("dismissal excerpt is not present")
    expect(readFutureAttentionConcern(fixture.database, "agenda:dismiss").status).toBe("open")

    dismissFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:dismiss",
      causeItemId: later.sourceItemId,
      modelOperationId: later.modelOperationId,
      concernId: "agenda:dismiss",
      expectedVersion: 1,
      learnerRequestExcerpt: "取消明天的这次检查",
      rationale: "The learner explicitly cancelled future attention.",
      occurredAt: 23,
    })
    expect(readFutureAttentionConcern(fixture.database, "agenda:dismiss")).toMatchObject({
      status: "dismissed",
      version: 2,
    })
    const transitions = listFutureAttentionTransitions(fixture.database, "agenda:dismiss")
    expect(transitions).toEqual([expect.objectContaining({ toStatus: "dismissed" })])
    expect(transitions[0]).not.toHaveProperty("serviceOccurrenceItemId")

    const createReplay = createConcern(fixture, "agenda:ignored-after-dismiss")
    expect(createReplay).toMatchObject({
      replayed: true,
      concern: { id: "agenda:dismiss", status: "dismissed", version: 2 },
    })
  })

  test("an explicit learner correction can reopen a mistaken terminal disposition", () => {
    const fixture = agendaFixture("reopen")
    createConcern(fixture, "agenda:reopen")
    const answer = admitAgendaTurn(fixture, {
      scope: "mistaken-address",
      content: "我只是开始想这个问题。",
      createdAt: 20,
    })
    addressFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:mistaken-address",
      causeItemId: answer.sourceItemId,
      modelOperationId: answer.modelOperationId,
      concernId: "agenda:reopen",
      expectedVersion: 1,
      serviceOccurrenceItemId: answer.sourceItemId,
      alignmentRationale: "This deliberately models a mistaken semantic judgment for correction.",
      occurredAt: 22,
    })
    const correction = admitAgendaTurn(fixture, {
      scope: "reopen-correction",
      content: "你记错了，我只是开始，并没有完成那次独立检查。",
      createdAt: 30,
    })
    const input = {
      effectId: "effect:agenda:reopen",
      causeItemId: correction.sourceItemId,
      modelOperationId: correction.modelOperationId,
      concernId: "agenda:reopen",
      expectedVersion: 2,
      learnerRequestExcerpt: "你记错了",
      rationale: "The learner explicitly corrected the earlier addressed disposition.",
      occurredAt: 32,
    }

    expect(reopenFutureAttentionConcern(fixture.database, input)).toMatchObject({
      replayed: false,
      concern: { id: "agenda:reopen", status: "open", version: 3 },
    })
    expect(listFutureAttentionTransitions(fixture.database, "agenda:reopen")).toEqual([
      expect.objectContaining({ fromStatus: "open", toStatus: "addressed", versionAfter: 2 }),
      expect.objectContaining({ fromStatus: "addressed", toStatus: "open", versionAfter: 3 }),
    ])
    expect(reopenFutureAttentionConcern(fixture.database, {
      ...input,
      effectId: "effect:agenda:reopen:replay",
      occurredAt: 33,
    })).toMatchObject({
      replayed: true,
      operationEffectId: "effect:agenda:reopen",
      concern: { status: "open", version: 3 },
    })
    expect(() =>
      reopenFutureAttentionConcern(fixture.database, {
        ...input,
        effectId: "effect:agenda:reopen:conflict",
        rationale: "A conflicting correction meaning in the same source slot.",
        occurredAt: 34,
      }),
    ).toThrow("different reopen transition")
  })

  test("supersession preserves the old concern and creates one corrected successor", () => {
    const fixture = agendaFixture("supersede")
    createConcern(fixture, "agenda:old", {
      learnerRoleConstraint: {
        kind: "learner_response_before_tutor_disclosure",
      },
    })
    const correction = admitAgendaTurn(fixture, {
      scope: "correction",
      content: "更正一下：不要做独立预测，明天用对比案例讲清楚。",
      createdAt: 20,
    })
    const input = {
      effectId: "effect:agenda:supersede",
      successorConcernId: "agenda:successor",
      causeItemId: correction.sourceItemId,
      modelOperationId: correction.modelOperationId,
      concernId: "agenda:old",
      expectedVersion: 1,
      learnerRequestExcerpt: "更正一下",
      target: fixture.target,
      replacementReason:
        "Repair the learner's causal model after the earlier explanation failed.",
      replacementNotBefore: 60,
      rationale: "The learner corrected both the intended purpose and form of return.",
      occurredAt: 22,
    }

    const superseded = supersedeFutureAttentionConcern(fixture.database, input)

    expect(superseded).toMatchObject({
      replayed: false,
      previous: {
        id: "agenda:old",
        status: "superseded",
        version: 2,
        successorConcernId: "agenda:successor",
      },
      successor: {
        id: "agenda:successor",
        status: "open",
        version: 1,
        sourceItemId: correction.sourceItemId,
        reason: input.replacementReason,
      },
    })
    expect(readFutureAttentionConcern(fixture.database, "agenda:old").sourceItemId).toBe(
      fixture.sourceItemId,
    )
    expect(superseded.previous.learnerRoleConstraint).toEqual({
      kind: "learner_response_before_tutor_disclosure",
    })
    expect(superseded.successor).not.toHaveProperty("learnerRoleConstraint")
    expect(readFutureAttentionContext(fixture.database, {
      activeCourseId: fixture.target.courseId,
      at: 100,
      limit: 8,
    }).concerns.map((concern) => concern.id)).toEqual(["agenda:successor"])
    expect(listFutureAttentionTransitions(fixture.database, "agenda:old")).toEqual([
      expect.objectContaining({
        toStatus: "superseded",
        successorConcernId: "agenda:successor",
      }),
    ])

    const replay = supersedeFutureAttentionConcern(fixture.database, {
      ...input,
      effectId: "effect:agenda:supersede:replay",
      successorConcernId: "agenda:ignored-successor-id",
      occurredAt: 23,
    })
    expect(replay).toMatchObject({
      replayed: true,
      operationEffectId: "effect:agenda:supersede",
      previous: { id: "agenda:old", status: "superseded" },
      successor: { id: "agenda:successor", status: "open" },
    })
    expect(() =>
      supersedeFutureAttentionConcern(fixture.database, {
        ...input,
        effectId: "effect:agenda:supersede:constraint-conflict",
        successorConcernId: "agenda:ignored-constraint-conflict",
        replacementLearnerRoleConstraint: {
          kind: "learner_response_before_tutor_disclosure",
        },
        occurredAt: 24,
      }),
    ).toThrow("different supersede transition")

    expect(createFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:create:after-supersede",
      concernId: "agenda:ignored-create-after-supersede",
      causeItemId: correction.sourceItemId,
      modelOperationId: correction.modelOperationId,
      target: fixture.target,
      authorship: {
        kind: "learner_requested",
        learnerRequestExcerpt: "更正一下",
      },
      reason: input.replacementReason,
      notBefore: input.replacementNotBefore,
      occurredAt: 24,
    })).toMatchObject({
      replayed: true,
      concern: { id: "agenda:successor" },
    })
  })

  test("supersession cannot absorb a successor committed by a separate create command", () => {
    const fixture = agendaFixture("supersede-after-create")
    createConcern(fixture, "agenda:old-before-create")
    const correction = admitAgendaTurn(fixture, {
      scope: "create-then-correct",
      content: "更正一下：明天改用对比案例讲解。",
      createdAt: 20,
    })
    createFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:successor-created-first",
      concernId: "agenda:successor-created-first",
      causeItemId: correction.sourceItemId,
      modelOperationId: correction.modelOperationId,
      target: fixture.target,
      authorship: {
        kind: "learner_requested",
        learnerRequestExcerpt: "更正一下",
      },
      reason: "Repair the learner's causal model after the earlier explanation failed.",
      notBefore: 60,
      occurredAt: 22,
    })

    expect(() =>
      supersedeFutureAttentionConcern(fixture.database, {
        effectId: "effect:agenda:supersede-after-create",
        successorConcernId: "agenda:proposed-but-unneeded",
        causeItemId: correction.sourceItemId,
        modelOperationId: correction.modelOperationId,
        concernId: "agenda:old-before-create",
        expectedVersion: 1,
        learnerRequestExcerpt: "更正一下",
        target: fixture.target,
        replacementReason:
          "Repair the learner's causal model after the earlier explanation failed.",
        replacementNotBefore: 60,
        rationale: "A compound correction must not absorb a separately committed create.",
        occurredAt: 23,
      }),
    ).toThrow("separately committed successor")
    expect(readFutureAttentionConcern(fixture.database, "agenda:old-before-create")).toMatchObject({
      status: "open",
      version: 1,
    })
    expect(readFutureAttentionContext(fixture.database, {
      activeCourseId: fixture.target.courseId,
      at: 100,
      limit: 8,
    }).concerns.map((concern) => concern.id).sort()).toEqual([
      "agenda:old-before-create",
      "agenda:successor-created-first",
    ])
  })

  test("an assistant occurrence must be complete before it can serve an explanation-purpose concern", () => {
    const fixture = agendaFixture("assistant-occurrence")
    createConcern(fixture, "agenda:assistant", {
      reason:
        "Return with a completed alternate representation after the earlier explanation failed.",
    })
    const explanation = admitAgendaTurn(fixture, {
      scope: "explanation",
      content: "请换一种表示讲解。",
      createdAt: 20,
    })
    appendSessionItem(fixture.database, {
      itemId: "item:assistant:explanation",
      sessionId: explanation.sessionId,
      turnId: explanation.turnId,
      role: "assistant",
      content: "这里用两个变量指向同一内存盒子的图来解释。",
      createdAt: 22,
    })
    const recorder = admitAgendaTurn(fixture, {
      scope: "record-explanation",
      content: "把刚才完成的替代讲解记作已经处理。",
      createdAt: 30,
    })

    expect(() =>
      addressFutureAttentionConcern(fixture.database, {
        effectId: "effect:agenda:assistant:too-early",
        causeItemId: recorder.sourceItemId,
        modelOperationId: recorder.modelOperationId,
        concernId: "agenda:assistant",
        expectedVersion: 1,
        serviceOccurrenceItemId: "item:assistant:explanation",
        alignmentRationale: "The alternate representation was supplied.",
        occurredAt: 32,
      }),
    ).toThrow("assistant occurrence must belong to a completed Turn")

    finishModelOperation(fixture.database, {
      modelOperationId: explanation.modelOperationId,
      outcome: "completed",
      finishedAt: 33,
    })
    finishTurn(fixture.database, {
      turnId: explanation.turnId,
      outcome: "completed",
      finishedAt: 100,
    })
    expect(() =>
      addressFutureAttentionConcern(fixture.database, {
        effectId: "effect:agenda:assistant:before-completion-time",
        causeItemId: recorder.sourceItemId,
        modelOperationId: recorder.modelOperationId,
        concernId: "agenda:assistant",
        expectedVersion: 1,
        serviceOccurrenceItemId: "item:assistant:explanation",
        alignmentRationale: "The Turn is terminal in storage but not yet complete at this event time.",
        occurredAt: 35,
      }),
    ).toThrow("cannot precede the completed assistant occurrence")
    const completedRecorder = admitAgendaTurn(fixture, {
      scope: "record-completed-explanation",
      content: "把已经完成的替代表示讲解记作这次回访已经处理。",
      createdAt: 110,
    })
    expect(addressFutureAttentionConcern(fixture.database, {
      effectId: "effect:agenda:assistant:complete",
      causeItemId: completedRecorder.sourceItemId,
      modelOperationId: completedRecorder.modelOperationId,
      concernId: "agenda:assistant",
      expectedVersion: 1,
      serviceOccurrenceItemId: "item:assistant:explanation",
      alignmentRationale: "The completed alternate representation served the concern.",
      occurredAt: 112,
    })).toMatchObject({ concern: { status: "addressed" } })
  })
})

function agendaFixture(scope: string) {
  const directory = mkdtempSync(join(tmpdir(), `repa-agenda-${scope}-`))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, "repa.sqlite")
  const database = openRepaDatabase(databasePath)
  openDatabases.push(database)

  createSession(database, { sessionId: `session:course:${scope}`, createdAt: 1 })
  admitUserTurn(database, {
    sessionId: `session:course:${scope}`,
    turnId: `turn:course:${scope}`,
    itemId: `item:user:course:${scope}`,
    content: "Create an object-reference course.",
    createdAt: 2,
  })
  createProvisionalCourse(database, {
    effectId: `effect:course:${scope}`,
    causeItemId: `item:user:course:${scope}`,
    learningSpaceId: `space:${scope}`,
    courseId: `course:${scope}`,
    workspaceRoot: directory,
    title: "Object references",
    items: [
      { title: "Object identity" },
      { title: "Aliasing and copying" },
    ],
    occurredAt: 3,
  })
  const activeCourse = readActiveCourseContext(database)
  if (!activeCourse) throw new Error("Agenda fixture has no active course")

  const sessionId = `session:agenda:${scope}`
  const turnId = `turn:agenda:${scope}`
  const sourceItemId = `item:user:agenda:${scope}`
  const modelOperationId = `model:agenda:${scope}`
  const sourceText = "这部分还是没懂；明天再独立检查一次。"
  createSession(database, { sessionId, createdAt: 10 })
  admitUserTurn(database, {
    sessionId,
    turnId,
    itemId: sourceItemId,
    content: sourceText,
    createdAt: 10,
  })
  beginTutorModelOperation(database, {
    modelOperationId,
    turnId,
    sessionId,
    sampledAt: 11,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
  })
  return {
    database,
    databasePath,
    sourceItemId,
    sourceText,
    modelOperationId,
    target: {
      courseId: activeCourse.courseId,
      courseViewRevisionId: activeCourse.courseViewRevisionId,
      courseItemId: activeCourse.route.anchor.itemId,
    },
  }
}

function createConcern(
  fixture: ReturnType<typeof agendaFixture>,
  concernId: string,
  options: {
    reason?: string
    notBefore?: number
    learnerRoleConstraint?: {
      kind: "learner_response_before_tutor_disclosure"
    }
  } = {},
) {
  return createFutureAttentionConcern(fixture.database, {
    effectId: `effect:create:${concernId}`,
    concernId,
    causeItemId: fixture.sourceItemId,
    modelOperationId: fixture.modelOperationId,
    target: fixture.target,
    authorship: {
      kind: "learner_requested",
      learnerRequestExcerpt: "明天再独立检查一次",
    },
    reason: options.reason ?? "Later check independent prediction of object identity.",
    ...(options.learnerRoleConstraint === undefined
      ? {}
      : { learnerRoleConstraint: options.learnerRoleConstraint }),
    notBefore: options.notBefore ?? 50,
    occurredAt: 12,
  })
}

function admitAgendaTurn(
  fixture: ReturnType<typeof agendaFixture>,
  input: { scope: string; content: string; createdAt: number },
) {
  const sessionId = `session:${input.scope}:${fixture.target.courseId}`
  const turnId = `turn:${input.scope}:${fixture.target.courseId}`
  const sourceItemId = `item:user:${input.scope}:${fixture.target.courseId}`
  const modelOperationId = `model:${input.scope}:${fixture.target.courseId}`
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
  return { sessionId, turnId, sourceItemId, modelOperationId }
}

function tableNames(database: ReturnType<typeof openRepaDatabase>) {
  return (
    database
      .query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((row) => row.name)
}
