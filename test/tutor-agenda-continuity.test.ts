import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  admitUserTurn,
  createSession,
  finishModelOperation,
  finishTurn,
} from "../src/interaction/records"
import { createFutureAttentionConcern } from "../src/learning/agenda/future-attention"
import {
  createProvisionalCourse,
  readActiveCourseContext,
} from "../src/learning/curriculum/course-view"
import { openRepaDatabase } from "../src/storage/open-database"
import { readSystemState } from "../src/storage/system-state"
import { beginTutorModelOperation, compileTutorContext } from "../src/tutor/compile-context"
import {
  CURRENT_TUTOR_POLICY_PROFILE_REVISION,
  DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
} from "../src/tutor/policy-profile"
import { renderTutorSystemPrompt } from "../src/tutor/render-system-prompt"

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

describe("Tutor Agenda continuity", () => {
  test("a compact concern reaches a fresh Session without replaying old conversation", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-tutor-agenda-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "repa.sqlite")
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)

    createSession(database, { sessionId: "session:course", createdAt: 1 })
    admitUserTurn(database, {
      sessionId: "session:course",
      turnId: "turn:course",
      itemId: "item:user:course",
      content: "Create the course.",
      createdAt: 2,
    })
    createProvisionalCourse(database, {
      effectId: "effect:course",
      causeItemId: "item:user:course",
      learningSpaceId: "space:tutor-agenda",
      courseId: "course:tutor-agenda",
      workspaceRoot: directory,
      title: "Object references",
      items: [{ title: "Object identity" }, { title: "Aliasing" }],
      occurredAt: 3,
    })
    const active = readActiveCourseContext(database)
    if (!active) throw new Error("Fixture has no active course")

    const oldSource = "这部分还是没懂；明天再独立检查一次；旧会话的其余内容不应重放。"
    createSession(database, { sessionId: "session:old", createdAt: 10 })
    admitUserTurn(database, {
      sessionId: "session:old",
      turnId: "turn:old",
      itemId: "item:user:old",
      content: oldSource,
      createdAt: 10,
    })
    beginTutorModelOperation(database, {
      modelOperationId: "model:old",
      turnId: "turn:old",
      sessionId: "session:old",
      sampledAt: 11,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
    })
    createFutureAttentionConcern(database, {
      effectId: "effect:agenda:fresh-session",
      concernId: "agenda:fresh-session",
      causeItemId: "item:user:old",
      modelOperationId: "model:old",
      target: {
        courseId: active.courseId,
        courseViewRevisionId: active.courseViewRevisionId,
        courseItemId: active.route.anchor.itemId,
      },
      authorship: {
        kind: "learner_requested",
        learnerRequestExcerpt: "明天再独立检查一次",
      },
      reason: "Check whether object identity can be predicted without guidance.",
      learnerRoleConstraint: {
        kind: "learner_response_before_tutor_disclosure",
      },
      notBefore: 50,
      occurredAt: 12,
    })
    finishModelOperation(database, {
      modelOperationId: "model:old",
      outcome: "completed",
      finishedAt: 13,
    })
    finishTurn(database, { turnId: "turn:old", outcome: "completed", finishedAt: 14 })
    const revisionAfterCreate = readSystemState(database).revision
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    createSession(reopened, { sessionId: "session:fresh", createdAt: 40 })
    admitUserTurn(reopened, {
      sessionId: "session:fresh",
      turnId: "turn:fresh",
      itemId: "item:user:fresh",
      content: "继续。",
      createdAt: 41,
    })

    const upcoming = compileTutorContext(reopened, {
      sessionId: "session:fresh",
      sampledAt: 49,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: CURRENT_TUTOR_POLICY_PROFILE_REVISION,
    })
    expect(upcoming.futureAttention).toMatchObject({
      totalOpen: 1,
      concerns: [
        {
          id: "agenda:fresh-session",
          version: 1,
          eligibility: "upcoming",
          targetState: "current",
          reason: "Check whether object identity can be predicted without guidance.",
        },
      ],
    })
    expect(JSON.stringify(upcoming)).not.toContain(oldSource)
    expect(JSON.stringify(upcoming)).not.toContain("明天再独立检查一次")
    expect(Object.isFrozen(upcoming.futureAttention)).toBe(true)
    expect(Object.isFrozen(upcoming.futureAttention.concerns)).toBe(true)
    expect(Object.isFrozen(upcoming.futureAttention.concerns[0]?.target)).toBe(true)
    expect(Object.isFrozen(
      upcoming.futureAttention.concerns[0]?.learnerRoleConstraint,
    )).toBe(true)
    expect(upcoming.conditionalCurrentPurpose).toBeNull()

    const eligible = compileTutorContext(reopened, {
      sessionId: "session:fresh",
      sampledAt: 50,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: CURRENT_TUTOR_POLICY_PROFILE_REVISION,
    })
    expect(eligible.futureAttention.concerns[0]?.eligibility).toBe("eligible")
    expect(eligible.conditionalCurrentPurpose).toMatchObject({
      kind: "agenda_future_attention",
      priority: "below_exact_current_request",
      source: {
        concernId: "agenda:fresh-session",
        concernVersion: 1,
        sourceItemId: "item:user:old",
        exactReason: "Check whether object identity can be predicted without guidance.",
      },
      learnerRoleConstraint: {
        kind: "learner_response_before_tutor_disclosure",
      },
      scope: "current_turn",
    })
    expect(Object.isFrozen(eligible.conditionalCurrentPurpose)).toBe(true)
    expect(Object.isFrozen(eligible.conditionalCurrentPurpose?.source)).toBe(true)
    expect(readSystemState(reopened).revision).toBe(revisionAfterCreate)

    const oldPolicy = compileTutorContext(reopened, {
      sessionId: "session:fresh",
      sampledAt: 50,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
    })
    expect(oldPolicy.conditionalCurrentPurpose).toBeNull()

    const prompt = renderTutorSystemPrompt(eligible)
    expect(prompt).toContain("Open source-linked future attention")
    expect(prompt).toContain("Check whether object identity can be predicted without guidance.")
    expect(prompt).toContain("candidate")
    expect(prompt).toContain("not mandatory review")
    expect(prompt).toContain("not evidence or mastery")
    expect(prompt).toContain("Before explaining the answer or a decisive hint, first obtain the learner's response")
    expect(prompt).toContain("The learner's explicit current request has higher priority")
    expect(prompt).not.toContain("Conditional current learning purpose")
    expect(prompt).not.toContain(oldSource)
  })
})
