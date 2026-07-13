import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  admitUserTurn,
  createSession,
  readToolInvocation,
  recordToolInvocation,
} from "../src/interaction/records"
import {
  ADVANCE_COURSE_ROUTE_TOOL,
  executeCourseRouteAdvance,
  executeCurrentCourseMaterialRead,
  READ_CURRENT_COURSE_MATERIAL_TOOL,
} from "../src/learning/curriculum/course-tool-execution"
import {
  readActiveCourseContext,
  registerMarkdownCourse,
} from "../src/learning/curriculum/course-view"
import { observeMarkdownArtifact } from "../src/sources/markdown-artifact"
import { openRepaDatabase } from "../src/storage/open-database"
import { beginTutorModelOperation } from "../src/tutor/compile-context"
import { DEFAULT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"

const temporaryDirectories: string[] = []
const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A test may close its handle explicitly.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("course capability execution", () => {
  test("a changed source fails the revision-bound material read closed", async () => {
    const fixture = await courseFixture("stale-read")
    admitCapabilityTurn(fixture.database, "stale-read", 10)
    beginTutorModelOperation(fixture.database, {
      modelOperationId: "model:stale-read",
      turnId: "turn:stale-read",
      sessionId: "session:stale-read",
      sampledAt: 11,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
    })
    recordToolInvocation(fixture.database, {
      invocationId: "call:stale-read",
      modelOperationId: "model:stale-read",
      toolName: READ_CURRENT_COURSE_MATERIAL_TOOL,
      input: {},
      createdAt: 12,
    })
    await Bun.write(fixture.materialPath, `${fixture.material}\nchanged after alignment`)

    const outcome = await executeCurrentCourseMaterialRead(fixture.database, {
      invocationId: "call:stale-read",
      executedAt: 13,
    })

    expect(outcome).toMatchObject({
      ok: false,
      code: "stale_material_revision",
      expectedRevision: fixture.observation.revision,
    })
    expect(readToolInvocation(fixture.database, "call:stale-read")).toMatchObject({
      status: "failed",
      effectId: undefined,
      error: { ok: false, code: "stale_material_revision" },
    })
    expect(JSON.stringify(readToolInvocation(fixture.database, "call:stale-read"))).not.toContain(
      "changed after alignment",
    )
  })

  test("route effect and tool receipt roll back together when settlement fails", async () => {
    const fixture = await courseFixture("atomic-advance")
    admitCapabilityTurn(fixture.database, "atomic-advance", 10)
    beginTutorModelOperation(fixture.database, {
      modelOperationId: "model:atomic-advance",
      turnId: "turn:atomic-advance",
      sessionId: "session:atomic-advance",
      sampledAt: 11,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
    })
    recordToolInvocation(fixture.database, {
      invocationId: "call:atomic-advance",
      modelOperationId: "model:atomic-advance",
      toolName: ADVANCE_COURSE_ROUTE_TOOL,
      input: {},
      createdAt: 12,
    })
    fixture.database.exec(`
      CREATE TRIGGER force_course_tool_settlement_failure
      BEFORE UPDATE OF status ON tool_invocation
      WHEN OLD.invocation_id = 'call:atomic-advance' AND NEW.status = 'completed'
      BEGIN
        SELECT RAISE(ABORT, 'forced course tool settlement failure');
      END;
    `)

    expect(() =>
      executeCourseRouteAdvance(fixture.database, {
        invocationId: "call:atomic-advance",
        executedAt: 13,
      }),
    ).toThrow("forced course tool settlement failure")
    expect(readActiveCourseContext(fixture.database)?.route.anchor.title).toBe("Objects")
    expect(readToolInvocation(fixture.database, "call:atomic-advance").status).toBe("running")
    expect(
      (
        fixture.database
          .query("SELECT COUNT(*) AS count FROM durable_effect WHERE effect_id = ?1")
          .get("effect:course-route:call:atomic-advance") as { count: number }
      ).count,
    ).toBe(0)

    fixture.database.exec("DROP TRIGGER force_course_tool_settlement_failure")
    expect(
      executeCourseRouteAdvance(fixture.database, {
        invocationId: "call:atomic-advance",
        executedAt: 14,
      }),
    ).toMatchObject({
      ok: true,
      disposition: "applied",
      currentItem: { title: "References" },
    })
    expect(readActiveCourseContext(fixture.database)?.route.anchor.title).toBe("References")
    expect(readToolInvocation(fixture.database, "call:atomic-advance")).toMatchObject({
      status: "completed",
      effectId: "effect:course-route:call:atomic-advance",
    })
  })
})

async function courseFixture(scope: string) {
  const root = mkdtempSync(join(tmpdir(), `repa-course-tool-${scope}-`))
  temporaryDirectories.push(root)
  const materialPath = join(root, "objects.md")
  const material = [
    "# Objects",
    "Objects group related values.",
    "## References",
    "Variables hold references to objects.",
  ].join("\n")
  await Bun.write(materialPath, material)
  const observation = await observeMarkdownArtifact({
    workspaceRoot: root,
    relativePath: "objects.md",
    observedAt: 3,
  })
  // These cases exercise course/tool transaction semantics, not database reopen.
  // Keeping SQLite in memory avoids a Windows file-lock race during temp-source cleanup.
  const database = openRepaDatabase(":memory:")
  openDatabases.push(database)
  createSession(database, { sessionId: `session:setup:${scope}`, createdAt: 1 })
  admitUserTurn(database, {
    sessionId: `session:setup:${scope}`,
    turnId: `turn:setup:${scope}`,
    itemId: `item:user:setup:${scope}`,
    content: "Use objects.md as a course.",
    createdAt: 2,
  })
  registerMarkdownCourse(database, {
    effectId: `effect:register:${scope}`,
    causeItemId: `item:user:setup:${scope}`,
    learningSpaceId: `space:${scope}`,
    courseId: `course:${scope}`,
    artifactId: `artifact:${scope}`,
    title: "Object references",
    observation,
    occurredAt: 3,
  })
  return { database, materialPath, material, observation }
}

function admitCapabilityTurn(
  database: ReturnType<typeof openRepaDatabase>,
  scope: string,
  createdAt: number,
) {
  createSession(database, { sessionId: `session:${scope}`, createdAt })
  admitUserTurn(database, {
    sessionId: `session:${scope}`,
    turnId: `turn:${scope}`,
    itemId: `item:user:${scope}`,
    content: "Continue.",
    createdAt,
  })
}
