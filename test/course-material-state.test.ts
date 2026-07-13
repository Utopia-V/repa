import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  advanceCourseRoute,
  readActiveCourseContext,
  registerMarkdownCourse,
} from "../src/learning/curriculum/course-view"
import {
  admitUserTurn,
  createSession,
  finishTurn,
} from "../src/interaction/records"
import { observeMarkdownArtifact } from "../src/sources/markdown-artifact"
import { openRepaDatabase } from "../src/storage/open-database"
import { compileTutorContext } from "../src/tutor/compile-context"
import { DEFAULT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"

const temporaryDirectories: string[] = []
const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A test may close before reopening the same database.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("Course and material state", () => {
  test("a compact route projection survives into a fresh Session without material text", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-course-state-"))
    temporaryDirectories.push(root)
    const databasePath = join(root, "repa.sqlite")
    const materialPath = join(root, "objects.md")
    await Bun.write(materialPath, fixtureMarkdown())
    const observed = await observeMarkdownArtifact({
      workspaceRoot: root,
      relativePath: "objects.md",
    })

    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    createSession(database, { sessionId: "session:setup", createdAt: 100 })
    admitUserTurn(database, {
      sessionId: "session:setup",
      turnId: "turn:setup",
      itemId: "item:user:setup",
      content: "Use objects.md as my course and begin.",
      createdAt: 101,
    })

    const registered = registerMarkdownCourse(database, {
      effectId: "effect:register-objects-course",
      causeItemId: "item:user:setup",
      learningSpaceId: "space:objects",
      courseId: "course:objects",
      artifactId: "artifact:objects",
      title: "Object references",
      observation: observed,
      occurredAt: 102,
    })
    expect(registered.replayed).toBe(false)
    expect(registered.basis).toBe("source_grounded")
    expect(registered.currentItem.title).toBe("Objects")

    const beforeAdvance = readActiveCourseContext(database)
    expect(beforeAdvance?.route.anchor.title).toBe("Objects")
    expect(JSON.stringify(beforeAdvance)).not.toContain("Variables hold references")

    const advanced = advanceCourseRoute(database, {
      effectId: "effect:advance-to-references",
      causeItemId: "item:user:setup",
      courseId: "course:objects",
      expectedViewRevisionId: registered.courseViewRevisionId,
      expectedAnchorItemId: registered.currentItem.itemId,
      expectedRouteVersion: 1,
      occurredAt: 103,
    })
    expect(advanced).toMatchObject({
      replayed: false,
      routeVersion: 2,
      previousItem: { title: "Objects" },
      currentItem: { title: "References" },
    })
    finishTurn(database, { turnId: "turn:setup", outcome: "completed", finishedAt: 104 })
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    createSession(reopened, { sessionId: "session:fresh", createdAt: 110 })
    admitUserTurn(reopened, {
      sessionId: "session:fresh",
      turnId: "turn:fresh",
      itemId: "item:user:fresh",
      content: "继续",
      createdAt: 111,
    })
    const context = compileTutorContext(reopened, {
      sessionId: "session:fresh",
      sampledAt: 112,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
    })

    expect(context.activeCourse).toEqual(
      expect.objectContaining({
        courseId: "course:objects",
        title: "Object references",
        basis: "source_grounded",
        route: expect.objectContaining({
          version: 2,
          anchor: expect.objectContaining({ title: "References" }),
        }),
        material: expect.objectContaining({
          artifactRevision: observed.revision,
          relativePath: "objects.md",
          startLine: 3,
          endLine: 8,
        }),
      }),
    )
    expect(JSON.stringify(context)).not.toContain("Variables hold references")
    expect(context.sessionId).toBe("session:fresh")
    expect(context.stateRevision).toBe(2)
  })
})

function fixtureMarkdown() {
  return [
    "# Objects",
    "Objects group related values.",
    "## References",
    "Variables hold references to objects.",
    "```js",
    "# not a Markdown heading",
    "const alias = object",
    "```",
    "### Equality",
    "Equality compares object identity.",
    "## Mutation",
    "Aliases observe the same mutation.",
  ].join("\n")
}
