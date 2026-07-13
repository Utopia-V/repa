export type CourseItem = {
  id: string
  title: string
  parentId: string | null
  order: number
}

export type CourseRelation = {
  kind: "requires" | "alternative"
  subjectId: string
  objectId: string
  acceptance: "accepted" | "proposed"
  sourceRef: string
}

export type CourseView = {
  revision: string
  items: CourseItem[]
  relations: CourseRelation[]
}

export type MaterialSection = {
  artifactRevision: string
  startLine: number
  endLine: number
  courseItemIds: string[]
}

export type MaterialArtifact = {
  id: string
  currentRevision: string
  sections: MaterialSection[]
}

export type LearnerRevisit = {
  id: string
  courseItemId: string
  reason: string
}

export type LearnerOverlay = {
  routeAnchorId: string
  activeFocusId: string
  revisits: LearnerRevisit[]
}

export type AgendaDetour = {
  temporaryFocusId: string
  rejoinAtId: string
  reason: string
}

export type RouteWorld = {
  course: CourseView
  learner: LearnerOverlay
  agenda?: AgendaDetour
  materials: MaterialArtifact[]
}

export function authoredOrder(world: RouteWorld): string[] {
  const byId = new Map(world.course.items.map((item) => [item.id, item]))
  if (byId.size !== world.course.items.length) throw new Error("Course item ids must be unique")

  const children = new Map<string | null, CourseItem[]>()
  for (const item of world.course.items) {
    if (item.parentId !== null && !byId.has(item.parentId)) {
      throw new Error(`Course item ${item.id} has missing parent ${item.parentId}`)
    }
    const siblings = children.get(item.parentId) ?? []
    siblings.push(item)
    children.set(item.parentId, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  }

  const ordered: string[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (item: CourseItem) => {
    if (visiting.has(item.id)) throw new Error(`Course containment cycle at ${item.id}`)
    if (visited.has(item.id)) return
    visiting.add(item.id)
    ordered.push(item.id)
    for (const child of children.get(item.id) ?? []) visit(child)
    visiting.delete(item.id)
    visited.add(item.id)
  }
  for (const root of children.get(null) ?? []) visit(root)
  if (visited.size !== world.course.items.length) {
    throw new Error("Course containment must form a rooted hierarchy")
  }
  return ordered
}

export function breadcrumb(world: RouteWorld, itemId: string): string[] {
  const byId = new Map(world.course.items.map((item) => [item.id, item]))
  const path: string[] = []
  const seen = new Set<string>()
  let current = byId.get(itemId)
  if (!current) throw new Error(`Unknown course item ${itemId}`)
  while (current) {
    if (seen.has(current.id)) throw new Error(`Course containment cycle at ${current.id}`)
    seen.add(current.id)
    path.push(current.id)
    current = current.parentId === null ? undefined : byId.get(current.parentId)
  }
  return path.reverse()
}

/**
 * The deliberately lossy baseline under test. It preserves display order, one
 * current pointer, and an unversioned material range, but no hierarchy,
 * relation authority, broad anchor, detour, or artifact revision.
 */
export function orderedPointerProjection(world: RouteWorld) {
  const range = materialRangesForCourseItem(world, world.learner.activeFocusId)[0]
  return {
    orderedItemIds: authoredOrder(world),
    currentItemId: world.learner.activeFocusId,
    materialRange:
      range === undefined
        ? null
        : {
            artifactId: range.artifactId,
            startLine: range.startLine,
            endLine: range.endLine,
          },
  }
}

export function currentRouteProjection(world: RouteWorld) {
  return {
    routeAnchorId: world.learner.routeAnchorId,
    routeBreadcrumb: breadcrumb(world, world.learner.routeAnchorId),
    activeFocusId: world.learner.activeFocusId,
    activeBreadcrumb: breadcrumb(world, world.learner.activeFocusId),
    rejoinAtId: world.agenda?.rejoinAtId ?? null,
  }
}

export function continuationAfterTemporaryFocus(world: RouteWorld): string | null {
  if (
    world.agenda?.temporaryFocusId === world.learner.activeFocusId &&
    world.agenda.rejoinAtId
  ) {
    return world.agenda.rejoinAtId
  }
  return authoredSuccessor(world, world.learner.activeFocusId)
}

export function nextRouteCandidates(world: RouteWorld, currentItemId: string): string[] {
  const first = authoredSuccessor(world, currentItemId)
  if (first === null) return []

  const candidates = new Set([first])
  let changed = true
  while (changed) {
    changed = false
    for (const relation of world.course.relations) {
      if (relation.kind !== "alternative" || relation.acceptance !== "accepted") continue
      if (candidates.has(relation.subjectId) && !candidates.has(relation.objectId)) {
        candidates.add(relation.objectId)
        changed = true
      }
      if (candidates.has(relation.objectId) && !candidates.has(relation.subjectId)) {
        candidates.add(relation.subjectId)
        changed = true
      }
    }
  }

  const position = new Map(authoredOrder(world).map((itemId, index) => [itemId, index]))
  return [...candidates].sort(
    (left, right) => requirePosition(position, left) - requirePosition(position, right),
  )
}

export function acceptedPrerequisites(world: RouteWorld, targetItemId: string): string[] {
  const position = new Map(authoredOrder(world).map((itemId, index) => [itemId, index]))
  return world.course.relations
    .filter(
      (relation) =>
        relation.kind === "requires" &&
        relation.subjectId === targetItemId &&
        relation.acceptance === "accepted",
    )
    .map((relation) => relation.objectId)
    .sort((left, right) => requirePosition(position, left) - requirePosition(position, right))
}

export function materialRangesForCourseItem(world: RouteWorld, courseItemId: string) {
  return world.materials.flatMap((material) =>
    material.sections.flatMap((section) =>
      section.courseItemIds.includes(courseItemId)
        ? [
            {
              artifactId: material.id,
              artifactRevision: section.artifactRevision,
              currentArtifactRevision: material.currentRevision,
              startLine: section.startLine,
              endLine: section.endLine,
            },
          ]
        : [],
    ),
  )
}

export function resolveMaterialRange(
  world: RouteWorld,
  courseItemId: string,
  artifactId: string,
) {
  const range = materialRangesForCourseItem(world, courseItemId).find(
    (candidate) => candidate.artifactId === artifactId,
  )
  if (!range) return { status: "missing" as const, artifactId }
  if (range.artifactRevision !== range.currentArtifactRevision) {
    return {
      status: "stale" as const,
      artifactId,
      anchoredRevision: range.artifactRevision,
      currentRevision: range.currentArtifactRevision,
    }
  }
  return {
    status: "current" as const,
    artifactId,
    artifactRevision: range.artifactRevision,
    startLine: range.startLine,
    endLine: range.endLine,
  }
}

export function addLearnerRevisit(world: RouteWorld, revisit: LearnerRevisit): RouteWorld {
  return {
    ...world,
    learner: {
      ...world.learner,
      revisits: [...world.learner.revisits, revisit],
    },
  }
}

function authoredSuccessor(world: RouteWorld, itemId: string): string | null {
  const order = authoredOrder(world)
  const index = order.indexOf(itemId)
  if (index < 0) throw new Error(`Unknown course item ${itemId}`)
  return order[index + 1] ?? null
}

function requirePosition(positions: Map<string, number>, itemId: string) {
  const position = positions.get(itemId)
  if (position === undefined) throw new Error(`Relation points to unknown course item ${itemId}`)
  return position
}
