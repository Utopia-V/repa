import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { admitUserTurn, createSession, finishTurn } from "../src/interaction/records"
import {
  readCourseViewPage,
  realignMarkdownCourse,
  reviseProvisionalCourse,
  setCourseRouteAnchor,
} from "../src/learning/curriculum/course-correction"
import {
  createProvisionalCourse,
  readActiveCourseContext,
  registerMarkdownCourse,
} from "../src/learning/curriculum/course-view"
import {
  observeMarkdownArtifact,
  readMarkdownSelector,
} from "../src/sources/markdown-artifact"
import { openRepaDatabase } from "../src/storage/open-database"

const temporaryDirectories: string[] = []
const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(() => {
  closeOpenDatabases()
  Bun.gc(true)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

function closeOpenDatabases() {
  for (const database of openDatabases.splice(0).reverse()) database.close()
}

describe("Course View inspection and correction", () => {
  test("a provisional route is inspectable, re-anchorable, and revised by supersession", () => {
    const fixture = learnerHome("provisional-correction")
    const source = admit(fixture.database, "create", 1, "Create a graph course")
    const created = createProvisionalCourse(fixture.database, {
      effectId: "effect:create-provisional-correction",
      causeItemId: source.itemId,
      learningSpaceId: "space:provisional-correction",
      courseId: "course:provisional-correction",
      workspaceRoot: fixture.root,
      title: "Graph algorithms",
      items: [
        { title: "Graph foundations" },
        { title: "Breadth-first search", parentIndex: 0 },
        { title: "Depth-first search", parentIndex: 0 },
      ],
      occurredAt: 2,
    })
    finishTurn(fixture.database, { turnId: source.turnId, outcome: "completed", finishedAt: 3 })

    const firstPage = readCourseViewPage(fixture.database, {
      courseId: created.courseId,
      courseViewRevisionId: created.courseViewRevisionId,
      offset: 0,
      limit: 2,
    })
    expect(firstPage).toMatchObject({
      total: 3,
      offset: 0,
      limit: 2,
      items: [
        { ordinal: 0, title: "Graph foundations", parentItemId: null },
        { ordinal: 1, title: "Breadth-first search" },
      ],
    })
    expect(firstPage.items[1]?.parentItemId).toBe(firstPage.items[0]?.itemId)

    const reanchorSource = admit(fixture.database, "reanchor", 10, "We are actually at BFS")
    const reanchored = setCourseRouteAnchor(fixture.database, {
      effectId: "effect:reanchor-bfs",
      causeItemId: reanchorSource.itemId,
      courseId: created.courseId,
      expectedViewRevisionId: created.courseViewRevisionId,
      expectedAnchorItemId: created.currentItem.itemId,
      expectedRouteVersion: 1,
      targetItemId: firstPage.items[1]!.itemId,
      occurredAt: 11,
    })
    expect(reanchored).toMatchObject({
      replayed: false,
      routeVersion: 2,
      previousItem: { title: "Graph foundations" },
      currentItem: { title: "Breadth-first search" },
    })
    finishTurn(fixture.database, {
      turnId: reanchorSource.turnId,
      outcome: "completed",
      finishedAt: 12,
    })

    const revisionSource = admit(
      fixture.database,
      "revise",
      20,
      "Rename foundations and add shortest paths after BFS",
    )
    const revised = reviseProvisionalCourse(fixture.database, {
      effectId: "effect:revise-provisional",
      causeItemId: revisionSource.itemId,
      courseId: created.courseId,
      expectedViewRevisionId: created.courseViewRevisionId,
      expectedAnchorItemId: reanchored.currentItem.itemId,
      expectedRouteVersion: 2,
      items: [
        { title: "Graph representations" },
        { title: "Breadth-first search", parentIndex: 0 },
        { title: "Shortest paths", parentIndex: 0 },
        { title: "Depth-first search", parentIndex: 0 },
      ],
      routeAnchorIndex: 1,
      occurredAt: 21,
    })
    expect(revised).toMatchObject({
      replayed: false,
      previousCourseViewRevisionId: created.courseViewRevisionId,
      basis: "model_proposed",
      routeVersion: 3,
      currentItem: { title: "Breadth-first search", ordinal: 1 },
    })
    expect(readActiveCourseContext(fixture.database)).toMatchObject({
      courseViewRevisionId: revised.courseViewRevisionId,
      basis: "model_proposed",
      route: { version: 3, anchor: { title: "Breadth-first search" } },
    })
    expect(
      fixture.database
        .query(`
          SELECT kind, to_course_view_revision_id
          FROM course_view_transition
          WHERE from_course_view_revision_id = ?1
        `)
        .get(created.courseViewRevisionId),
    ).toEqual({
      kind: "provisional_revision",
      to_course_view_revision_id: revised.courseViewRevisionId,
    })
    expect(
      fixture.database
        .query("SELECT superseded_at FROM course_view_revision WHERE course_view_revision_id = ?1")
        .get(created.courseViewRevisionId),
    ).toEqual({ superseded_at: 21 })

    expect(
      reviseProvisionalCourse(fixture.database, {
        effectId: "effect:revise-provisional",
        causeItemId: revisionSource.itemId,
        courseId: created.courseId,
        expectedViewRevisionId: created.courseViewRevisionId,
        expectedAnchorItemId: reanchored.currentItem.itemId,
        expectedRouteVersion: 2,
        items: [
          { title: "Graph representations" },
          { title: "Breadth-first search", parentIndex: 0 },
          { title: "Shortest paths", parentIndex: 0 },
          { title: "Depth-first search", parentIndex: 0 },
        ],
        routeAnchorIndex: 1,
        occurredAt: 21,
      }).replayed,
    ).toBe(true)
  })

  test("a changed Markdown artifact creates an explicit aligned revision without rewriting history", async () => {
    const fixture = learnerHome("material-realignment")
    const materialPath = join(fixture.root, "objects.md")
    await Bun.write(materialPath, "# Objects\nold body\n## References\nold references")
    const originalObservation = await observeMarkdownArtifact({
      workspaceRoot: fixture.root,
      relativePath: "objects.md",
      observedAt: 2,
    })
    const source = admit(fixture.database, "register", 1, "Use the edited Markdown")
    const registered = registerMarkdownCourse(fixture.database, {
      effectId: "effect:register-realignment",
      causeItemId: source.itemId,
      learningSpaceId: "space:material-realignment",
      courseId: "course:material-realignment",
      artifactId: "artifact:material-realignment",
      title: "Objects",
      observation: originalObservation,
      occurredAt: 2,
    })
    finishTurn(fixture.database, { turnId: source.turnId, outcome: "completed", finishedAt: 3 })

    await Bun.write(materialPath, "# Objects\nnew corrected body\n## References\nnew references")
    const changedObservation = await observeMarkdownArtifact({
      workspaceRoot: fixture.root,
      relativePath: "objects.md",
      observedAt: 10,
    })
    const correctionSource = admit(
      fixture.database,
      "realign",
      11,
      "I edited the material; align the course again",
    )
    const realigned = realignMarkdownCourse(fixture.database, {
      effectId: "effect:realign-material",
      causeItemId: correctionSource.itemId,
      courseId: registered.courseId,
      artifactId: "artifact:material-realignment",
      expectedViewRevisionId: registered.courseViewRevisionId,
      expectedAnchorItemId: registered.currentItem.itemId,
      expectedRouteVersion: 1,
      observation: changedObservation,
      occurredAt: 12,
    })

    expect(realigned).toMatchObject({
      replayed: false,
      previousCourseViewRevisionId: registered.courseViewRevisionId,
      basis: "source_grounded",
      routeVersion: 2,
      currentItem: { title: "Objects" },
    })
    const active = readActiveCourseContext(fixture.database)
    expect(active).toMatchObject({
      courseViewRevisionId: realigned.courseViewRevisionId,
      route: { version: 2, anchor: { title: "Objects" } },
      material: { artifactRevision: changedObservation.revision },
    })
    expect(
      (
        fixture.database
          .query("SELECT COUNT(*) AS count FROM material_revision WHERE artifact_id = ?1")
          .get("artifact:material-realignment") as { count: number }
      ).count,
    ).toBe(2)
    expect(
      fixture.database
        .query(`
          SELECT kind, to_course_view_revision_id
          FROM course_view_transition
          WHERE from_course_view_revision_id = ?1
        `)
        .get(registered.courseViewRevisionId),
    ).toEqual({
      kind: "material_realign",
      to_course_view_revision_id: realigned.courseViewRevisionId,
    })
    const selected = await readMarkdownSelector({
      workspaceRoot: fixture.root,
      relativePath: active!.material!.relativePath,
      expectedRevision: active!.material!.artifactRevision,
      startLine: active!.material!.startLine,
      endLine: active!.material!.endLine,
    })
    expect(selected).toMatchObject({ status: "current", text: "# Objects\nnew corrected body" })
  })
})

function learnerHome(scope: string) {
  const root = mkdtempSync(join(tmpdir(), `repa-${scope}-`))
  temporaryDirectories.push(root)
  const database = openRepaDatabase(":memory:")
  openDatabases.push(database)
  return { root, database }
}

function admit(
  database: ReturnType<typeof openRepaDatabase>,
  scope: string,
  createdAt: number,
  content: string,
) {
  const sessionId = `session:${scope}`
  const turnId = `turn:${scope}`
  const itemId = `item:user:${scope}`
  createSession(database, { sessionId, createdAt })
  admitUserTurn(database, { sessionId, turnId, itemId, content, createdAt })
  return { sessionId, turnId, itemId }
}
