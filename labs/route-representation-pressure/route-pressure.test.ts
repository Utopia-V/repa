import { describe, expect, test } from "bun:test"
import {
  acceptedPrerequisites,
  addLearnerRevisit,
  authoredOrder,
  breadcrumb,
  continuationAfterTemporaryFocus,
  currentRouteProjection,
  materialRangesForCourseItem,
  nextRouteCandidates,
  orderedPointerProjection,
  resolveMaterialRange,
  type RouteWorld,
} from "./route-pressure"

describe("broad-route representation pressure", () => {
  test("the same ordered list and pointer can hide different hierarchies", () => {
    const nested = makeWorld()
    const shallow = makeWorld({
      items: nested.course.items.map((item) =>
        item.id === "objects" ? { ...item, parentId: "course" } : item,
      ),
    })

    expect(authoredOrder(nested)).toEqual(["course", "basics", "objects", "middle", "target"])
    expect(authoredOrder(shallow)).toEqual(authoredOrder(nested))
    expect(orderedPointerProjection(shallow)).toEqual(orderedPointerProjection(nested))

    expect(breadcrumb(nested, "objects")).toEqual(["course", "basics", "objects"])
    expect(breadcrumb(shallow, "objects")).toEqual(["course", "objects"])
  })

  test("one current pointer cannot distinguish a prerequisite detour from a real rollback", () => {
    const detour = makeWorld({
      learner: { routeAnchorId: "target", activeFocusId: "objects", revisits: [] },
      agenda: {
        temporaryFocusId: "objects",
        rejoinAtId: "target",
        reason: "repair a prerequisite before resuming the target",
      },
    })
    const rollback = makeWorld({
      learner: { routeAnchorId: "objects", activeFocusId: "objects", revisits: [] },
      agenda: undefined,
    })

    expect(orderedPointerProjection(detour)).toEqual(orderedPointerProjection(rollback))
    expect(continuationAfterTemporaryFocus(detour)).toBe("target")
    expect(continuationAfterTemporaryFocus(rollback)).toBe("middle")
    expect(currentRouteProjection(detour)).toEqual({
      routeAnchorId: "target",
      routeBreadcrumb: ["course", "target"],
      activeFocusId: "objects",
      activeBreadcrumb: ["course", "basics", "objects"],
      rejoinAtId: "target",
    })
  })

  test("a deadline jump changes the agenda without pretending the route advanced", () => {
    const deadlineJump = makeWorld({
      learner: { routeAnchorId: "objects", activeFocusId: "target", revisits: [] },
      agenda: {
        temporaryFocusId: "target",
        rejoinAtId: "middle",
        reason: "finish tonight's assignment, then resume the course",
      },
    })
    const genuineAdvance = makeWorld({
      learner: { routeAnchorId: "target", activeFocusId: "target", revisits: [] },
      agenda: undefined,
    })

    expect(orderedPointerProjection(deadlineJump)).toEqual(orderedPointerProjection(genuineAdvance))
    expect(continuationAfterTemporaryFocus(deadlineJump)).toBe("middle")
    expect(continuationAfterTemporaryFocus(genuineAdvance)).toBeNull()
    expect(deadlineJump.course).toEqual(genuineAdvance.course)
  })

  test("authored order cannot reveal alternatives or accepted prerequisites", () => {
    const alternatives = makeWorld({
      relations: [
        {
          kind: "alternative",
          subjectId: "middle",
          objectId: "target",
          acceptance: "accepted",
          sourceRef: "course-source:track-choice",
        },
      ],
    })
    const sequential = makeWorld()

    expect(orderedPointerProjection(alternatives)).toEqual(orderedPointerProjection(sequential))
    expect(nextRouteCandidates(alternatives, "objects")).toEqual(["middle", "target"])
    expect(nextRouteCandidates(sequential, "objects")).toEqual(["middle"])

    const accepted = makeWorld({
      relations: [
        {
          kind: "requires",
          subjectId: "target",
          objectId: "objects",
          acceptance: "accepted",
          sourceRef: "course-source:explicit-prerequisite",
        },
      ],
    })
    const merelyProposed = makeWorld({
      relations: accepted.course.relations.map((relation) => ({
        ...relation,
        acceptance: "proposed" as const,
      })),
    })

    expect(orderedPointerProjection(accepted)).toEqual(orderedPointerProjection(merelyProposed))
    expect(acceptedPrerequisites(accepted, "target")).toEqual(["objects"])
    expect(acceptedPrerequisites(merelyProposed, "target")).toEqual([])
  })

  test("an unversioned range cannot distinguish valid material from a stale anchor", () => {
    const valid = makeWorld()
    const stale = makeWorld({
      materials: valid.materials.map((material) =>
        material.id === "guide" ? { ...material, currentRevision: "sha256:r2" } : material,
      ),
    })

    expect(orderedPointerProjection(valid)).toEqual(orderedPointerProjection(stale))
    expect(resolveMaterialRange(valid, "objects", "guide")).toEqual({
      status: "current",
      artifactId: "guide",
      artifactRevision: "sha256:r1",
      startLine: 20,
      endLine: 34,
    })
    expect(resolveMaterialRange(stale, "objects", "guide")).toEqual({
      status: "stale",
      artifactId: "guide",
      anchoredRevision: "sha256:r1",
      currentRevision: "sha256:r2",
    })
  })

  test("course order, material order, and learner concerns remain separate authorities", () => {
    const world = makeWorld()

    expect(authoredOrder(world)).toEqual(["course", "basics", "objects", "middle", "target"])
    expect(materialRangesForCourseItem(world, "objects").map((range) => range.artifactId)).toEqual([
      "guide",
      "reference",
    ])
    expect(world.materials.find((material) => material.id === "guide")?.sections.flatMap(
      (section) => section.courseItemIds,
    )).toEqual(["objects", "middle", "target"])
    expect(world.materials.find((material) => material.id === "reference")?.sections.flatMap(
      (section) => section.courseItemIds,
    )).toEqual(["target", "objects"])

    const afterError = addLearnerRevisit(world, {
      id: "revisit:objects:1",
      courseItemId: "objects",
      reason: "one learner error",
    })
    expect(afterError.course).toBe(world.course)
    expect(afterError.course.revision).toBe("course:r1")
    expect(afterError.learner.revisits).toEqual([
      {
        id: "revisit:objects:1",
        courseItemId: "objects",
        reason: "one learner error",
      },
    ])
  })
})

function makeWorld(
  overrides: Partial<{
    items: RouteWorld["course"]["items"]
    relations: RouteWorld["course"]["relations"]
    learner: RouteWorld["learner"]
    agenda: RouteWorld["agenda"]
    materials: RouteWorld["materials"]
  }> = {},
): RouteWorld {
  const items: RouteWorld["course"]["items"] = [
    { id: "course", title: "Course", parentId: null, order: 0 },
    { id: "basics", title: "Basics", parentId: "course", order: 0 },
    { id: "objects", title: "Object references", parentId: "basics", order: 0 },
    { id: "middle", title: "Middle route", parentId: "course", order: 1 },
    { id: "target", title: "Target project", parentId: "course", order: 2 },
  ]
  const materials: RouteWorld["materials"] = [
    {
      id: "guide",
      currentRevision: "sha256:r1",
      sections: [
        {
          artifactRevision: "sha256:r1",
          startLine: 20,
          endLine: 34,
          courseItemIds: ["objects"],
        },
        {
          artifactRevision: "sha256:r1",
          startLine: 35,
          endLine: 50,
          courseItemIds: ["middle", "target"],
        },
      ],
    },
    {
      id: "reference",
      currentRevision: "sha256:ref1",
      sections: [
        {
          artifactRevision: "sha256:ref1",
          startLine: 5,
          endLine: 12,
          courseItemIds: ["target"],
        },
        {
          artifactRevision: "sha256:ref1",
          startLine: 60,
          endLine: 72,
          courseItemIds: ["objects"],
        },
      ],
    },
  ]

  const agenda = Object.prototype.hasOwnProperty.call(overrides, "agenda")
    ? overrides.agenda
    : undefined
  return {
    course: {
      revision: "course:r1",
      items: overrides.items ?? items,
      relations: overrides.relations ?? [],
    },
    learner:
      overrides.learner ??
      ({ routeAnchorId: "objects", activeFocusId: "objects", revisits: [] } satisfies RouteWorld["learner"]),
    ...(agenda === undefined ? {} : { agenda }),
    materials: overrides.materials ?? materials,
  }
}
