import { describe, expect, test } from "bun:test"
import path from "path"
import { Effect, Exit, Layer } from "effect"
import { sql } from "drizzle-orm"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(LayerNode.compile(LayerNode.group([Course.node, Database.node]), [[Database.node, database]]))

describe("Course authority", () => {
  it.effect("keeps exact selection stable and closes stale withdrawal races", () =>
    Effect.gen(function* () {
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Algorithms" })
      expect(course.selection).toEqual({ revisionID: undefined, version: 0 })

      const first = yield* courses.createView({
        courseID: course.id,
        name: "Conceptual route",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: {
          items: [
            { key: "root", title: "Graph algorithms" },
            { key: "bfs", title: "Breadth-first search", parentKey: "root" },
            { key: "dfs", title: "Depth-first search", parentKey: "root" },
          ],
        },
      })
      const selectedFirst = yield* courses.select({
        courseID: course.id,
        revisionID: first.revision.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      })
      expect(selectedFirst).toEqual({ revisionID: first.revision.id, version: 1 })

      const firstItems = yield* courses.listRevisionItems(course.id, first.view.id, first.revision.id)
      const byTitle = new Map(firstItems.items.map((item) => [item.title, item.itemID]))
      const second = yield* courses.addRevision({
        courseID: course.id,
        viewID: first.view.id,
        predecessorRevisionID: first.revision.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        authorship: Course.Authorship.tutorProposed(),
        revision: {
          items: [
            { key: "root", title: "Graph algorithms" },
            { key: "bfs", title: "Breadth-first search", parentKey: "root" },
            { key: "dfs", title: "Depth-first search", parentKey: "root" },
            { key: "shortest", title: "Shortest paths", parentKey: "root" },
          ],
          mappings: [
            { kind: "preserve", sourceItemIDs: [byTitle.get("Graph algorithms")!], targetKeys: ["root"] },
            { kind: "preserve", sourceItemIDs: [byTitle.get("Breadth-first search")!], targetKeys: ["bfs"] },
            { kind: "preserve", sourceItemIDs: [byTitle.get("Depth-first search")!], targetKeys: ["dfs"] },
          ],
        },
      })

      expect((yield* courses.getCourse(course.id)).selection).toEqual({ revisionID: first.revision.id, version: 1 })
      expect((yield* courses.getRevision(course.id, first.view.id, first.revision.id)).disposition).toBe("working")
      expect((yield* courses.getRevision(course.id, first.view.id, second.id)).disposition).toBe("candidate")

      yield* courses.select({
        courseID: course.id,
        revisionID: second.id,
        expectedCourseVersion: 0,
        expectedSelectionRevisionID: first.revision.id,
        expectedSelectionVersion: 1,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      })
      const staleReject = yield* Effect.flip(
        courses.rejectCandidate({
          courseID: course.id,
          viewID: first.view.id,
          revisionID: second.id,
          expectedCourseVersion: 0,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
          expectedSelectionRevisionID: first.revision.id,
          expectedSelectionVersion: 1,
        }),
      )
      expect(staleReject).toMatchObject({ _tag: "Course.ConflictError", entity: "selection" })
      const staleWithdraw = yield* Effect.flip(
        courses.withdrawRevision({
          courseID: course.id,
          viewID: first.view.id,
          revisionID: second.id,
          expectedCourseVersion: 0,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
          expectedSelectionRevisionID: first.revision.id,
          expectedSelectionVersion: 1,
          selection: { type: "clear" },
        }),
      )
      expect(staleWithdraw).toMatchObject({ _tag: "Course.ConflictError", entity: "selection" })
      expect((yield* courses.getRevision(course.id, first.view.id, second.id)).disposition).toBe("working")

      const alternate = yield* courses.createView({
        courseID: course.id,
        name: "Problem route",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerDirected(),
        revision: { items: [{ key: "problems", title: "Graph problems" }] },
      })
      yield* courses.withdrawRevision({
        courseID: course.id,
        viewID: alternate.view.id,
        revisionID: alternate.revision.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
        expectedSelectionRevisionID: second.id,
        expectedSelectionVersion: 2,
        selection: { type: "unchanged" },
      })
      yield* courses.restoreRevision({
        courseID: course.id,
        viewID: alternate.view.id,
        revisionID: alternate.revision.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 1,
      })

      const staleReplacement = yield* Effect.flip(
        courses.withdrawRevision({
          courseID: course.id,
          viewID: first.view.id,
          revisionID: second.id,
          expectedCourseVersion: 0,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
          expectedSelectionRevisionID: second.id,
          expectedSelectionVersion: 2,
          selection: {
            type: "replace",
            revisionID: alternate.revision.id,
            expectedViewVersion: 0,
            expectedRevisionVersion: 0,
          },
        }),
      )
      expect(staleReplacement).toMatchObject({ _tag: "Course.ConflictError", entity: "revision" })
      expect((yield* courses.getCourse(course.id)).selection).toEqual({ revisionID: second.id, version: 2 })

      const withdrawn = yield* courses.withdrawRevision({
        courseID: course.id,
        viewID: first.view.id,
        revisionID: second.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
        expectedSelectionRevisionID: second.id,
        expectedSelectionVersion: 2,
        selection: {
          type: "replace",
          revisionID: alternate.revision.id,
          expectedViewVersion: 0,
          expectedRevisionVersion: 2,
        },
      })
      expect(withdrawn).toMatchObject({ disposition: "withdrawn", withdrawalReason: "removed", stateVersion: 1 })
      expect((yield* courses.getCourse(course.id)).selection).toEqual({
        revisionID: alternate.revision.id,
        version: 3,
      })

      const restored = yield* courses.restoreRevision({
        courseID: course.id,
        viewID: first.view.id,
        revisionID: second.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 1,
      })
      expect(restored.authorshipBasis).toBe("tutor_proposed")
      expect(restored.disposition).toBe("candidate")
      expect((yield* courses.getCourse(course.id)).selection.revisionID).toBe(alternate.revision.id)

      const removedCourse = yield* courses.withdrawCourse({
        courseID: course.id,
        expectedCourseVersion: 0,
        expectedSelectionRevisionID: alternate.revision.id,
        expectedSelectionVersion: 3,
      })
      expect(removedCourse.selection).toEqual({ revisionID: undefined, version: 4 })
      const restoredCourse = yield* courses.restoreCourse({ courseID: course.id, expectedCourseVersion: 1 })
      expect(restoredCourse).toMatchObject({ stateVersion: 2, selection: { revisionID: undefined, version: 4 } })
    }),
  )

  it.effect("clears or replaces a selected View without restoring its old selection", () =>
    Effect.gen(function* () {
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Operating systems" })
      const primary = yield* courses.createView({
        courseID: course.id,
        name: "Conceptual route",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "process", title: "Processes" }] },
      })
      const alternate = yield* courses.createView({
        courseID: course.id,
        name: "Exercise route",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "exercise", title: "Scheduling exercises" }] },
      })

      yield* courses.select({
        courseID: course.id,
        revisionID: primary.revision.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      })
      const cleared = yield* courses.withdrawView({
        courseID: course.id,
        viewID: primary.view.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedSelectionRevisionID: primary.revision.id,
        expectedSelectionVersion: 1,
        selection: { type: "clear" },
      })
      expect(cleared).toMatchObject({ stateVersion: 1, withdrawalReason: "removed" })
      expect((yield* courses.getCourse(course.id)).selection).toEqual({ revisionID: undefined, version: 2 })

      const restoredAfterClear = yield* courses.restoreView({
        courseID: course.id,
        viewID: primary.view.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 1,
      })
      expect(restoredAfterClear).toMatchObject({ stateVersion: 2, withdrawalReason: undefined })
      expect((yield* courses.getCourse(course.id)).selection).toEqual({ revisionID: undefined, version: 2 })

      yield* courses.select({
        courseID: course.id,
        revisionID: primary.revision.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 2,
        expectedViewVersion: 2,
        expectedRevisionVersion: 0,
      })
      yield* courses.withdrawView({
        courseID: course.id,
        viewID: primary.view.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 2,
        expectedSelectionRevisionID: primary.revision.id,
        expectedSelectionVersion: 3,
        selection: {
          type: "replace",
          revisionID: alternate.revision.id,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
        },
      })
      expect((yield* courses.getCourse(course.id)).selection).toEqual({
        revisionID: alternate.revision.id,
        version: 4,
      })

      yield* courses.restoreView({
        courseID: course.id,
        viewID: primary.view.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 3,
      })
      expect((yield* courses.getCourse(course.id)).selection).toEqual({
        revisionID: alternate.revision.id,
        version: 4,
      })
    }),
  )

  it.effect("binds authorship through the application capability rather than proposed content", () =>
    Effect.gen(function* () {
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Compilers" })
      const forged = yield* Effect.flip(
        courses.createView({
          courseID: course.id,
          name: "Forged route",
          expectedCourseVersion: 0,
          authorship: { basis: "tutor_proposed" } as ReturnType<typeof Course.Authorship.tutorProposed>,
          revision: { items: [{ key: "parser", title: "Parsing" }] },
        }),
      )

      expect(forged).toMatchObject({ _tag: "Course.InvalidTransitionError" })
      expect((yield* courses.listViews(course.id)).items).toEqual([])
    }),
  )

  it.effect("enforces hierarchy, mapping identity, exact reuse citation, and atomic publication", () =>
    Effect.gen(function* () {
      const courses = yield* Course.Service
      const storage = yield* Database.Service
      const course = yield* courses.createCourse({ title: "Data structures" })
      const first = yield* courses.createView({
        courseID: course.id,
        name: "Structures",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: {
          items: [
            { key: "a", title: "Trees" },
            { key: "b", title: "Binary trees", parentKey: "a" },
            { key: "c", title: "Search trees", parentKey: "a" },
            { key: "d", title: "Tries" },
          ],
        },
      })
      const firstItems = yield* courses.listRevisionItems(course.id, first.view.id, first.revision.id)
      const ids = new Map(firstItems.items.map((item) => [item.title, item.itemID]))
      const second = yield* courses.addRevision({
        courseID: course.id,
        viewID: first.view.id,
        predecessorRevisionID: first.revision.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        authorship: Course.Authorship.learnerDirected(),
        revision: {
          items: [
            { key: "a", title: "Tree structures" },
            { key: "b1", title: "Balanced binary trees", parentKey: "a" },
            { key: "b2", title: "Unbalanced binary trees", parentKey: "a" },
            { key: "merged", title: "Search tries" },
            { key: "new", title: "Heaps" },
          ],
          mappings: [
            { kind: "preserve", sourceItemIDs: [ids.get("Trees")!], targetKeys: ["a"] },
            { kind: "split", sourceItemIDs: [ids.get("Binary trees")!], targetKeys: ["b1", "b2"] },
            {
              kind: "merge",
              sourceItemIDs: [ids.get("Search trees")!, ids.get("Tries")!],
              targetKeys: ["merged"],
            },
          ],
        },
      })
      const secondItems = yield* courses.listRevisionItems(course.id, first.view.id, second.id)
      expect(secondItems.items.find((item) => item.title === "Tree structures")?.itemID).toBe(ids.get("Trees"))
      expect(secondItems.items.find((item) => item.title === "Balanced binary trees")?.itemID).not.toBe(
        ids.get("Binary trees"),
      )
      expect(
        (yield* courses.listMappingGroups(course.id, first.view.id, second.id)).items.map((item) => item.kind).sort(),
      ).toEqual(["merge", "preserve", "split"])

      const reusable = secondItems.items.find((item) => item.title === "Balanced binary trees")!
      const other = yield* courses.createView({
        courseID: course.id,
        name: "Exam route",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.tutorProposed(),
        revision: {
          items: [
            {
              key: "balanced",
              title: "Balanced binary trees",
              reuse: { sourceRevisionID: second.id, itemID: reusable.itemID },
            },
          ],
        },
      })
      expect((yield* courses.listReuseCitations(course.id, other.view.id, other.revision.id)).items).toMatchObject([
        { sourceRevisionID: second.id, itemID: reusable.itemID },
      ])

      const invalidHierarchy = yield* Effect.flip(
        courses.addRevision({
          courseID: course.id,
          viewID: first.view.id,
          predecessorRevisionID: second.id,
          expectedCourseVersion: 0,
          expectedViewVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: {
            items: [
              { key: "root", title: "Root" },
              { key: "child", title: "Child", parentKey: "root" },
              { key: "closed", title: "Closed root" },
              { key: "reentry", title: "Reentry", parentKey: "root" },
            ],
          },
        }),
      )
      expect(invalidHierarchy).toMatchObject({ _tag: "Course.InvalidHierarchyError" })
      const invalidMapping = yield* Effect.flip(
        courses.addRevision({
          courseID: course.id,
          viewID: first.view.id,
          predecessorRevisionID: second.id,
          expectedCourseVersion: 0,
          expectedViewVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: {
            items: [
              { key: "left", title: "Left" },
              { key: "right", title: "Right" },
            ],
            mappings: [
              {
                kind: "split",
                sourceItemIDs: [
                  secondItems.items.find((item) => item.title === "Balanced binary trees")!.itemID,
                  secondItems.items.find((item) => item.title === "Unbalanced binary trees")!.itemID,
                ],
                targetKeys: ["left", "right"],
              },
            ],
          },
        }),
      )
      expect(invalidMapping).toMatchObject({ _tag: "Course.InvalidMappingError" })
      expect((yield* courses.listRevisions(course.id, first.view.id)).items).toHaveLength(2)

      yield* storage.db.run(sql`
        CREATE TRIGGER reject_second_revision_item
        BEFORE INSERT ON course_view_revision_item
        WHEN NEW.preorder_position = 1
        BEGIN
          SELECT RAISE(ABORT, 'injected publication failure');
        END
      `)
      const before = yield* storage.db.get<{ value: number }>(sql`SELECT count(*) AS value FROM course_item`)
      const failed = yield* Effect.exit(
        courses.createView({
          courseID: course.id,
          name: "Must roll back",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: {
            items: [
              { key: "one", title: "One" },
              { key: "two", title: "Two" },
            ],
          },
        }),
      )
      expect(Exit.isFailure(failed)).toBeTrue()
      yield* storage.db.run(sql`DROP TRIGGER reject_second_revision_item`)
      expect(yield* storage.db.get(sql`SELECT count(*) AS value FROM course_item`)).toEqual(before)
      expect((yield* courses.listViews(course.id)).items.map((view) => view.name)).not.toContain("Must roll back")
    }),
  )

  it.effect("rejects cross-Course rows and child transitions under withdrawn parents", () =>
    Effect.gen(function* () {
      const courses = yield* Course.Service
      const storage = yield* Database.Service
      const left = yield* courses.createCourse({ title: "Left" })
      const right = yield* courses.createCourse({ title: "Right" })
      const leftView = yield* courses.createView({
        courseID: left.id,
        name: "Left view",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "left", title: "Left item" }] },
      })
      const rightView = yield* courses.createView({
        courseID: right.id,
        name: "Right view",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "right", title: "Right item" }] },
      })
      const leftItem = (yield* courses.listRevisionItems(left.id, leftView.view.id, leftView.revision.id)).items[0]!
      const rightItem = (yield* courses.listRevisionItems(right.id, rightView.view.id, rightView.revision.id)).items[0]!

      const crossRevision = yield* Effect.exit(
        storage.db.run(sql`
        INSERT INTO course_view_revision
          (id, course_id, view_id, revision_number, predecessor_revision_id, authorship_basis, time_created)
        VALUES
          ('cross-revision', ${right.id}, ${leftView.view.id}, 1, NULL, 'learner_authored', 1)
      `),
      )
      expect(Exit.isFailure(crossRevision)).toBeTrue()

      const crossMembership = yield* Effect.exit(
        storage.db.run(sql`
        INSERT INTO course_view_revision_item
          (course_id, view_id, revision_id, item_id, title, preorder_position, depth)
        VALUES
          (${right.id}, ${leftView.view.id}, ${leftView.revision.id}, ${rightItem.itemID}, 'Cross', 1, 0)
      `),
      )
      expect(Exit.isFailure(crossMembership)).toBeTrue()

      yield* storage.db.run(sql`
        INSERT INTO course_item (id, course_id, time_created)
        VALUES ('cross-parent-target', ${left.id}, 1)
      `)
      const crossParent = yield* Effect.exit(
        storage.db.run(sql`
        INSERT INTO course_view_revision_item
          (course_id, view_id, revision_id, item_id, parent_item_id, title, preorder_position, depth)
        VALUES
          (${left.id}, ${leftView.view.id}, ${leftView.revision.id}, 'cross-parent-target', ${rightItem.itemID}, 'Cross parent', 1, 1)
      `),
      )
      expect(Exit.isFailure(crossParent)).toBeTrue()

      const crossMapping = yield* Effect.exit(
        storage.db.run(sql`
        INSERT INTO course_view_revision_mapping_group
          (id, course_id, view_id, source_revision_id, target_revision_id, kind, source_key, target_key)
        VALUES
          ('cross-mapping', ${left.id}, ${leftView.view.id}, ${leftView.revision.id}, ${rightView.revision.id}, 'preserve', ${leftItem.itemID}, ${leftItem.itemID})
      `),
      )
      expect(Exit.isFailure(crossMapping)).toBeTrue()

      const crossSelection = yield* Effect.exit(
        storage.db.run(sql`
        UPDATE course_working_selection
        SET revision_id = ${leftView.revision.id}, version = version + 1
        WHERE course_id = ${right.id}
      `),
      )
      expect(Exit.isFailure(crossSelection)).toBeTrue()
      expect((yield* courses.getCourse(right.id)).selection).toEqual({ revisionID: undefined, version: 0 })

      yield* courses.withdrawRevision({
        courseID: left.id,
        viewID: leftView.view.id,
        revisionID: leftView.revision.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
        expectedSelectionVersion: 0,
        selection: { type: "unchanged" },
      })
      yield* courses.withdrawView({
        courseID: left.id,
        viewID: leftView.view.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedSelectionVersion: 0,
        selection: { type: "unchanged" },
      })
      const restoreUnderWithdrawnView = yield* Effect.flip(
        courses.restoreRevision({
          courseID: left.id,
          viewID: leftView.view.id,
          revisionID: leftView.revision.id,
          expectedCourseVersion: 0,
          expectedViewVersion: 1,
          expectedRevisionVersion: 1,
        }),
      )
      expect(restoreUnderWithdrawnView).toMatchObject({ _tag: "Course.InactiveError", entity: "view" })
      const createUnderWithdrawnView = yield* Effect.flip(
        courses.addRevision({
          courseID: left.id,
          viewID: leftView.view.id,
          predecessorRevisionID: leftView.revision.id,
          expectedCourseVersion: 0,
          expectedViewVersion: 1,
          authorship: Course.Authorship.learnerAuthored(),
          revision: { items: [{ key: "new", title: "New" }] },
        }),
      )
      expect(createUnderWithdrawnView).toMatchObject({ _tag: "Course.InactiveError", entity: "view" })
    }),
  )

  it.effect("derives candidate and historical state from current eligible revisions", () =>
    Effect.gen(function* () {
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Logic" })
      const view = yield* courses.createView({
        courseID: course.id,
        name: "Proof route",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "proof", title: "Proofs" }] },
      })
      const item = (yield* courses.listRevisionItems(course.id, view.view.id, view.revision.id)).items[0]!
      const latest = yield* courses.addRevision({
        courseID: course.id,
        viewID: view.view.id,
        predecessorRevisionID: view.revision.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        authorship: Course.Authorship.tutorProposed(),
        revision: {
          items: [{ key: "proof", title: "Proof methods" }],
          mappings: [{ kind: "preserve", sourceItemIDs: [item.itemID], targetKeys: ["proof"] }],
        },
      })
      expect((yield* courses.getRevision(course.id, view.view.id, view.revision.id)).disposition).toBe("historical")
      yield* courses.withdrawRevision({
        courseID: course.id,
        viewID: view.view.id,
        revisionID: latest.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
        expectedSelectionVersion: 0,
        selection: { type: "unchanged" },
      })
      expect((yield* courses.getRevision(course.id, view.view.id, view.revision.id)).disposition).toBe("candidate")
      yield* courses.restoreRevision({
        courseID: course.id,
        viewID: view.view.id,
        revisionID: latest.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 1,
      })
      expect((yield* courses.getRevision(course.id, view.view.id, view.revision.id)).disposition).toBe("historical")
      const rejected = yield* courses.rejectCandidate({
        courseID: course.id,
        viewID: view.view.id,
        revisionID: latest.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 2,
        expectedSelectionVersion: 0,
      })
      expect(rejected).toMatchObject({ disposition: "withdrawn", withdrawalReason: "rejected_candidate" })
      expect((yield* courses.getRevision(course.id, view.view.id, view.revision.id)).disposition).toBe("candidate")
    }),
  )

  it.effect("rejects hierarchy and title bounds before publishing a View", () =>
    Effect.gen(function* () {
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Boundaries" })
      const proposals = [
        { items: [] },
        {
          items: Array.from({ length: 1025 }, (_, index) => ({ key: `item-${index}`, title: `Item ${index}` })),
        },
        {
          items: Array.from({ length: 18 }, (_, index) => ({
            key: `depth-${index}`,
            title: `Depth ${index}`,
            parentKey: index === 0 ? undefined : `depth-${index - 1}`,
          })),
        },
        {
          items: [
            { key: "root", title: "Root" },
            { key: "child", title: "Child", parentKey: "   " },
          ],
        },
        { items: [{ key: "long", title: "x".repeat(501) }] },
      ]
      yield* Effect.forEach(
        proposals,
        (revision, index) =>
          Effect.gen(function* () {
            const error = yield* Effect.flip(
              courses.createView({
                courseID: course.id,
                name: `Invalid ${index}`,
                expectedCourseVersion: 0,
                authorship: Course.Authorship.learnerAuthored(),
                revision,
              }),
            )
            expect(error).toMatchObject({ _tag: "Course.InvalidHierarchyError" })
          }),
        { discard: true },
      )
      expect((yield* courses.listViews(course.id)).items).toEqual([])
    }),
  )
})

test("Course identities, selection, and mappings survive database reopen", async () => {
  await using tmp = await tmpdir()
  const filename = path.join(tmp.path, "reopen.sqlite")
  const firstLayer = LayerNode.compile(Course.node, [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
  ])
  const written = await Effect.runPromise(
    Effect.gen(function* () {
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Persistent course" })
      const primary = yield* courses.createView({
        courseID: course.id,
        name: "Persistent primary view",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerDirected(),
        revision: { items: [{ key: "item", title: "Persistent item" }] },
      })
      const item = (yield* courses.listRevisionItems(course.id, primary.view.id, primary.revision.id)).items[0]!
      const successor = yield* courses.addRevision({
        courseID: course.id,
        viewID: primary.view.id,
        predecessorRevisionID: primary.revision.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        authorship: Course.Authorship.tutorProposed(),
        revision: {
          items: [{ key: "item", title: "Persistent item revised" }],
          mappings: [{ kind: "preserve", sourceItemIDs: [item.itemID], targetKeys: ["item"] }],
        },
      })
      const mapping = (yield* courses.listMappingGroups(course.id, primary.view.id, successor.id)).items[0]!
      const alternate = yield* courses.createView({
        courseID: course.id,
        name: "Persistent alternate view",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "alternate", title: "Alternate item" }] },
      })
      yield* courses.select({
        courseID: course.id,
        revisionID: successor.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      })
      return {
        courseID: course.id,
        primaryViewID: primary.view.id,
        firstRevisionID: primary.revision.id,
        successorRevisionID: successor.id,
        alternateViewID: alternate.view.id,
        alternateRevisionID: alternate.revision.id,
        itemID: item.itemID,
        mappingGroupID: mapping.id,
      }
    }).pipe(Effect.provide(firstLayer), Effect.scoped),
  )

  const secondLayer = LayerNode.compile(Course.node, [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
  ])
  await Effect.runPromise(
    Effect.gen(function* () {
      const courses = yield* Course.Service
      expect((yield* courses.getCourse(written.courseID)).selection).toEqual({
        revisionID: written.successorRevisionID,
        version: 1,
      })
      expect((yield* courses.listViews(written.courseID)).items.map((item) => item.id)).toEqual([
        written.primaryViewID,
        written.alternateViewID,
      ])
      expect(yield* courses.getView(written.courseID, written.primaryViewID)).toMatchObject({
        name: "Persistent primary view",
      })
      expect(yield* courses.getView(written.courseID, written.alternateViewID)).toMatchObject({
        name: "Persistent alternate view",
      })
      expect(
        yield* courses.getRevision(written.courseID, written.primaryViewID, written.firstRevisionID),
      ).toMatchObject({
        authorshipBasis: "learner_directed",
        disposition: "historical",
      })
      expect(
        yield* courses.getRevision(written.courseID, written.primaryViewID, written.successorRevisionID),
      ).toMatchObject({
        authorshipBasis: "tutor_proposed",
        disposition: "working",
      })
      expect(
        (yield* courses.listRevisions(written.courseID, written.primaryViewID)).items.map((item) => ({
          id: item.id,
          revisionNumber: item.revisionNumber,
        })),
      ).toEqual([
        { id: written.firstRevisionID, revisionNumber: 1 },
        { id: written.successorRevisionID, revisionNumber: 2 },
      ])
      expect(
        yield* courses.getRevisionTransition(written.courseID, written.primaryViewID, written.successorRevisionID),
      ).toEqual({
        revisionID: written.successorRevisionID,
        predecessorRevisionID: written.firstRevisionID,
      })
      expect(
        (yield* courses.listMappingGroups(written.courseID, written.primaryViewID, written.successorRevisionID)).items,
      ).toEqual([
        {
          id: written.mappingGroupID,
          kind: "preserve",
          sourceRevisionID: written.firstRevisionID,
          targetRevisionID: written.successorRevisionID,
        },
      ])
      expect(
        (yield* courses.listMappingSources(
          written.courseID,
          written.primaryViewID,
          written.successorRevisionID,
          written.mappingGroupID,
        )).items,
      ).toEqual([{ itemID: written.itemID }])
      expect(
        (yield* courses.listMappingTargets(
          written.courseID,
          written.primaryViewID,
          written.successorRevisionID,
          written.mappingGroupID,
        )).items,
      ).toEqual([{ itemID: written.itemID }])
      expect(
        (yield* courses.listRevisionItems(written.courseID, written.primaryViewID, written.successorRevisionID)).items,
      ).toEqual([
        {
          itemID: written.itemID,
          parentItemID: undefined,
          title: "Persistent item revised",
          preorderPosition: 0,
          depth: 0,
        },
      ])
      expect(
        yield* courses.getRevision(written.courseID, written.alternateViewID, written.alternateRevisionID),
      ).toMatchObject({ disposition: "candidate" })
    }).pipe(Effect.provide(secondLayer), Effect.scoped),
  )
})
