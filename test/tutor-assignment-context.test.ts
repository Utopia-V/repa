import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { admitUserTurn, createSession } from "../src/interaction/records"
import { createAssignment } from "../src/learning/agenda/assignment"
import {
  CREATE_ASSIGNMENT_TOOL,
  type AssignmentToolName,
} from "../src/learning/agenda/assignment-tool-execution"
import { CREATE_FUTURE_ATTENTION_TOOL } from "../src/learning/agenda/future-attention-tool-execution"
import { activeTutorToolNames, createTutorTools } from "../src/runtime/tutor-tools"
import { openRepaDatabase } from "../src/storage/open-database"
import { beginTutorModelOperation, compileTutorContext } from "../src/tutor/compile-context"
import {
  ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
  CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
  DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
} from "../src/tutor/policy-profile"
import { renderTutorSystemPrompt } from "../src/tutor/render-system-prompt"

const temporaryDirectories: string[] = []
const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) database.close()
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("Tutor Assignment context", () => {
  test("v4 composes LearnerHome Assignment without an active Course while v3 remains unchanged", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-assignment-context-"))
    temporaryDirectories.push(directory)
    const database = openRepaDatabase(join(directory, "repa.sqlite"))
    openDatabases.push(database)

    createSession(database, { sessionId: "session:assignment:create", createdAt: 1_000 })
    admitUserTurn(database, {
      sessionId: "session:assignment:create",
      turnId: "turn:assignment:create",
      itemId: "item:user:assignment:create",
      content: "通识课短报告明天 20:00 截止，大约还需要 25 分钟。",
      createdAt: 1_000,
    })
    beginTutorModelOperation(database, {
      modelOperationId: "model:assignment:create",
      turnId: "turn:assignment:create",
      sessionId: "session:assignment:create",
      sampledAt: 1_100,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
    })
    createAssignment(database, {
      effectId: "effect:assignment:context",
      assignmentId: "assignment:context",
      causeItemId: "item:user:assignment:create",
      modelOperationId: "model:assignment:create",
      sourceExcerpt: "通识课短报告明天 20:00 截止",
      title: "通识课短报告",
      dueAt: 60_000,
      dueAtIso: "1970-01-01T08:01:00+08:00",
      interpretationTimeZone: "Asia/Shanghai",
      admissionRationale: "The learner reported a coursework deliverable.",
      occurredAt: 1_200,
    })
    createSession(database, { sessionId: "session:fresh", createdAt: 1_300 })

    const v3 = compileTutorContext(database, {
      sessionId: "session:fresh",
      sampledAt: 59_000,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
    })
    expect(v3.assignments).toEqual({ totalActive: 0, offset: 0, assignments: [] })
    expect(renderTutorSystemPrompt(v3)).not.toContain("Open real assignments")

    const v4 = compileTutorContext(database, {
      sessionId: "session:fresh",
      sampledAt: 60_000,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
    })
    expect(v4.activeCourse).toBeNull()
    expect(v4.assignments).toMatchObject({
      totalActive: 1,
      offset: 0,
      assignments: [{
        id: "assignment:context",
        version: 1,
          title: "通识课短报告",
          temporalState: "overdue",
          millisecondsUntilDue: 0,
        sourceItemId: "item:user:assignment:create",
      }],
    })
    const prompt = renderTutorSystemPrompt(v4)
    expect(prompt).toContain("Open real assignments")
    expect(prompt).toContain("通识课短报告")
    expect(prompt).toContain("overdue")
    expect(prompt).toContain("item:user:assignment:create")
    expect(prompt).not.toContain("25 分钟")
    expect(prompt).toContain("broad request such as continue or plan")
    expect(prompt).toContain("do not silently ignore the conflict")
    expect(prompt).toContain("deadline is now")
    expect(Object.isFrozen(v4.assignments.assignments[0])).toBeTrue()
    expect(Object.isFrozen(v4.assignments)).toBeTrue()

    const v2Tools = tutorToolsForPolicy(
      database,
      directory,
      DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
    )
    const v3Tools = tutorToolsForPolicy(
      database,
      directory,
      CONDITIONAL_PURPOSE_TUTOR_POLICY_PROFILE_REVISION,
    )
    const v4Tools = tutorToolsForPolicy(
      database,
      directory,
      ASSIGNMENT_TUTOR_POLICY_PROFILE_REVISION,
    )
    expect(CREATE_ASSIGNMENT_TOOL in v2Tools).toBeFalse()
    expect(CREATE_ASSIGNMENT_TOOL in v3Tools).toBeFalse()
    expect(CREATE_ASSIGNMENT_TOOL in v4Tools).toBeTrue()
    expect((v4Tools[CREATE_ASSIGNMENT_TOOL] as { description: string }).description).toContain(
      "ordinary job or personal deliverable",
    )
    expect((v4Tools[CREATE_ASSIGNMENT_TOOL] as { description: string }).description).toContain(
      "current learning goal",
    )
    expect((v4Tools[CREATE_ASSIGNMENT_TOOL] as { description: string }).description).toContain(
      "Do not narrate",
    )
    expect(activeTutorToolNames(v3)).not.toContain(
      CREATE_ASSIGNMENT_TOOL as AssignmentToolName,
    )
    expect(activeTutorToolNames(v4)).toContain(CREATE_ASSIGNMENT_TOOL)

    const constrainedCreate = {
      authorship: { kind: "tutor_initiated" },
      reason: "Return for an independent response.",
      learnerRoleConstraint: {
        kind: "learner_response_before_tutor_disclosure",
      },
      notBefore: "2026-07-14T20:00:00+08:00",
    }
    expect(toolSchema(v2Tools, CREATE_FUTURE_ATTENTION_TOOL).safeParse(
      constrainedCreate,
    ).success).toBeFalse()
    expect(toolSchema(v3Tools, CREATE_FUTURE_ATTENTION_TOOL).safeParse(
      constrainedCreate,
    ).success).toBeTrue()
  })
})

function tutorToolsForPolicy(
  database: ReturnType<typeof openRepaDatabase>,
  workspaceRoot: string,
  policyProfileRevision: string,
) {
  return createTutorTools({
    database,
    identity: {
      sessionId: "session:fresh",
      turnId: "turn:unused-tool-shape",
      toolItemId: (toolCallId) => `item:tool:${toolCallId}`,
    },
    workspaceRoot,
    clock: () => 70_000,
    policyProfileRevision,
  })
}

function toolSchema(
  tools: ReturnType<typeof tutorToolsForPolicy>,
  name: typeof CREATE_FUTURE_ATTENTION_TOOL,
) {
  return tools[name].inputSchema as {
    safeParse(input: unknown): { success: boolean }
  }
}
