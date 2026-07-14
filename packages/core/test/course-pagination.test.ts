import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(LayerNode.compile(Course.node, [[Database.node, database]]))

function expectExactKeys(actual: readonly string[], expected: readonly string[]) {
  expect(actual).toHaveLength(expected.length)
  expect(new Set(actual).size).toBe(actual.length)
  expect([...actual].sort()).toEqual([...expected].sort())
}

describe("Course bounded reads", () => {
  it.effect(
    "pages every Course-owned collection with stable scoped cursors",
    () =>
      Effect.gen(function* () {
        const service = yield* Course.Service
        const courses = yield* Effect.forEach(
          Array.from({ length: 55 }, (_, index) => index),
          (index) => service.createCourse({ title: `Course ${index.toString().padStart(2, "0")}` }),
          { concurrency: 1 },
        )
        const firstCourses = yield* service.listCourses({ limit: 50 })
        const remainingCourses = yield* service.listCourses({ limit: 50, cursor: firstCourses.cursor })
        expect(firstCourses.items).toHaveLength(50)
        expect(remainingCourses.items).toHaveLength(5)
        expectExactKeys(
          [...firstCourses.items, ...remainingCourses.items].map((item) => item.id),
          courses.map((item) => item.id),
        )

        const emptyCursor = yield* Effect.flip(service.listCourses({ cursor: "" }))
        expect(emptyCursor).toMatchObject({ _tag: "Course.InvalidCursorError" })

        const wrongScope = yield* Effect.flip(
          service.listViews(courses[0]!.id, { limit: 50, cursor: firstCourses.cursor }),
        )
        expect(wrongScope).toMatchObject({ _tag: "Course.InvalidCursorError" })
        const wrongFilter = yield* Effect.flip(
          service.listCourses({ limit: 50, cursor: firstCourses.cursor, includeWithdrawn: true }),
        )
        expect(wrongFilter).toMatchObject({ _tag: "Course.InvalidCursorError" })

        const course = courses[0]!
        const sourceItems = [
          { key: "split", title: "Split source" },
          ...Array.from({ length: 55 }, (_, index) => ({ key: `merge-${index}`, title: `Merge ${index}` })),
          ...Array.from({ length: 55 }, (_, index) => ({ key: `keep-${index}`, title: `Keep ${index}` })),
        ]
        const mapped = yield* service.createView({
          courseID: course.id,
          name: "Mapped route",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: { items: sourceItems },
        })
        const sourcePage = yield* service.listRevisionItems(course.id, mapped.view.id, mapped.revision.id, {
          limit: 100,
        })
        const lastSourcePage = yield* service.listRevisionItems(course.id, mapped.view.id, mapped.revision.id, {
          limit: 100,
          cursor: sourcePage.cursor,
        })
        expect(sourcePage.items).toHaveLength(100)
        expect(lastSourcePage.items).toHaveLength(11)
        const allSourceItems = [...sourcePage.items, ...lastSourcePage.items]
        expectExactKeys(
          allSourceItems.map((item) => item.title),
          sourceItems.map((item) => item.title),
        )
        expect(new Set(allSourceItems.map((item) => item.itemID)).size).toBe(sourceItems.length)
        const sourceIDs = new Map(allSourceItems.map((item) => [item.title, item.itemID]))

        const splitTargets = Array.from({ length: 55 }, (_, index) => ({
          key: `split-${index}`,
          title: `Split target ${index}`,
        }))
        const preservedTargets = Array.from({ length: 55 }, (_, index) => ({
          key: `keep-${index}`,
          title: `Keep ${index}`,
        }))
        const revised = yield* service.addRevision({
          courseID: course.id,
          viewID: mapped.view.id,
          predecessorRevisionID: mapped.revision.id,
          expectedCourseVersion: 0,
          expectedViewVersion: 0,
          authorship: Course.Authorship.learnerDirected(),
          revision: {
            items: [...splitTargets, { key: "merged", title: "Merged target" }, ...preservedTargets],
            mappings: [
              {
                kind: "split",
                sourceItemIDs: [sourceIDs.get("Split source")!],
                targetKeys: splitTargets.map((item) => item.key),
              },
              {
                kind: "merge",
                sourceItemIDs: Array.from({ length: 55 }, (_, index) => sourceIDs.get(`Merge ${index}`)!),
                targetKeys: ["merged"],
              },
              ...Array.from({ length: 55 }, (_, index) => ({
                kind: "preserve" as const,
                sourceItemIDs: [sourceIDs.get(`Keep ${index}`)!],
                targetKeys: [`keep-${index}`],
              })),
            ],
          },
        })
        const wrongParent = yield* Effect.flip(
          service.listRevisionItems(course.id, mapped.view.id, revised.id, {
            limit: 100,
            cursor: sourcePage.cursor,
          }),
        )
        expect(wrongParent).toMatchObject({ _tag: "Course.InvalidCursorError" })

        const firstGroups = yield* service.listMappingGroups(course.id, mapped.view.id, revised.id, { limit: 50 })
        const lastGroups = yield* service.listMappingGroups(course.id, mapped.view.id, revised.id, {
          limit: 50,
          cursor: firstGroups.cursor,
        })
        expect(firstGroups.items).toHaveLength(50)
        expect(lastGroups.items).toHaveLength(7)
        const groups = [...firstGroups.items, ...lastGroups.items]
        expect(groups).toHaveLength(57)
        expect(new Set(groups.map((group) => group.id)).size).toBe(57)
        expect(groups.filter((group) => group.kind === "preserve")).toHaveLength(55)
        expect(groups.filter((group) => group.kind === "split")).toHaveLength(1)
        expect(groups.filter((group) => group.kind === "merge")).toHaveLength(1)
        const split = groups.find((group) => group.kind === "split")!
        const merge = groups.find((group) => group.kind === "merge")!

        const splitTargetPage = yield* service.listMappingTargets(course.id, mapped.view.id, revised.id, split.id, {
          limit: 50,
        })
        const splitTargetTail = yield* service.listMappingTargets(course.id, mapped.view.id, revised.id, split.id, {
          limit: 50,
          cursor: splitTargetPage.cursor,
        })
        expect(splitTargetPage.items).toHaveLength(50)
        expect(splitTargetTail.items).toHaveLength(5)
        const allSplitTargets = [...splitTargetPage.items, ...splitTargetTail.items]
        const mergeSourcePage = yield* service.listMappingSources(course.id, mapped.view.id, revised.id, merge.id, {
          limit: 50,
        })
        const mergeSourceTail = yield* service.listMappingSources(course.id, mapped.view.id, revised.id, merge.id, {
          limit: 50,
          cursor: mergeSourcePage.cursor,
        })
        expect(mergeSourcePage.items).toHaveLength(50)
        expect(mergeSourceTail.items).toHaveLength(5)
        expectExactKeys(
          [...mergeSourcePage.items, ...mergeSourceTail.items].map((item) => item.itemID),
          Array.from({ length: 55 }, (_, index) => sourceIDs.get(`Merge ${index}`)!),
        )

        const revisedItemsPage = yield* service.listRevisionItems(course.id, mapped.view.id, revised.id, { limit: 100 })
        const revisedItemsTail = yield* service.listRevisionItems(course.id, mapped.view.id, revised.id, {
          limit: 100,
          cursor: revisedItemsPage.cursor,
        })
        const allRevisedItems = [...revisedItemsPage.items, ...revisedItemsTail.items]
        expectExactKeys(
          allRevisedItems.map((item) => item.title),
          [...splitTargets, { key: "merged", title: "Merged target" }, ...preservedTargets].map((item) => item.title),
        )
        const revisedIDs = new Map(allRevisedItems.map((item) => [item.title, item.itemID]))
        expectExactKeys(
          allSplitTargets.map((item) => item.itemID),
          splitTargets.map((item) => revisedIDs.get(item.title)!),
        )
        const reused = allRevisedItems.slice(0, 55)
        const cited = yield* service.createView({
          courseID: course.id,
          name: "Cited route",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.tutorProposed(),
          revision: {
            items: reused.map((item, index) => ({
              key: `reuse-${index}`,
              title: item.title,
              reuse: { sourceRevisionID: revised.id, itemID: item.itemID },
            })),
          },
        })
        const citationPage = yield* service.listReuseCitations(course.id, cited.view.id, cited.revision.id, {
          limit: 50,
        })
        const citationTail = yield* service.listReuseCitations(course.id, cited.view.id, cited.revision.id, {
          limit: 50,
          cursor: citationPage.cursor,
        })
        expect(citationPage.items).toHaveLength(50)
        expect(citationTail.items).toHaveLength(5)
        const citations = [...citationPage.items, ...citationTail.items]
        expect(new Set(citations.map((item) => item.id)).size).toBe(55)
        expectExactKeys(
          citations.map((item) => item.itemID),
          reused.map((item) => item.itemID),
        )

        const chain = yield* service.createView({
          courseID: course.id,
          name: "Revision chain",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: { items: [{ key: "chain", title: "Chain 0" }] },
        })
        const chainItem = (yield* service.listRevisionItems(course.id, chain.view.id, chain.revision.id)).items[0]!
        let predecessor = chain.revision.id
        const revisionIDs = [chain.revision.id]
        for (let index = 1; index < 55; index++) {
          const revision = yield* service.addRevision({
            courseID: course.id,
            viewID: chain.view.id,
            predecessorRevisionID: predecessor,
            expectedCourseVersion: 0,
            expectedViewVersion: 0,
            authorship: Course.Authorship.learnerAuthored(),
            revision: {
              items: [{ key: "chain", title: `Chain ${index}` }],
              mappings: [{ kind: "preserve", sourceItemIDs: [chainItem.itemID], targetKeys: ["chain"] }],
            },
          })
          predecessor = revision.id
          revisionIDs.push(revision.id)
        }
        const revisionPage = yield* service.listRevisions(course.id, chain.view.id, { limit: 50 })
        const revisionTail = yield* service.listRevisions(course.id, chain.view.id, {
          limit: 50,
          cursor: revisionPage.cursor,
        })
        expect(revisionPage.items).toHaveLength(50)
        expect(revisionTail.items).toHaveLength(5)
        expect(revisionPage.items.concat(revisionTail.items).map((item) => item.id)).toEqual(revisionIDs)

        const extraViews = yield* Effect.forEach(
          Array.from({ length: 52 }, (_, index) => index),
          (index) =>
            service.createView({
              courseID: course.id,
              name: `Extra route ${index}`,
              expectedCourseVersion: 0,
              authorship: Course.Authorship.learnerAuthored(),
              revision: { items: [{ key: "only", title: `Only ${index}` }] },
            }),
          { concurrency: 1 },
        )
        const viewPage = yield* service.listViews(course.id, { limit: 50 })
        const viewTail = yield* service.listViews(course.id, { limit: 50, cursor: viewPage.cursor })
        expect(viewPage.items).toHaveLength(50)
        expect(viewTail.items).toHaveLength(5)
        expectExactKeys(
          viewPage.items.concat(viewTail.items).map((item) => item.id),
          [mapped.view.id, cited.view.id, chain.view.id, ...extraViews.map((item) => item.view.id)],
        )
        const otherCourseParent = yield* Effect.flip(
          service.listViews(courses[1]!.id, { limit: 50, cursor: viewPage.cursor }),
        )
        expect(otherCourseParent).toMatchObject({ _tag: "Course.InvalidCursorError" })
      }),
    30_000,
  )
})
