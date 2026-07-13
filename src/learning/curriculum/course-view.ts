import type { Database } from "bun:sqlite"
import type { MarkdownArtifactObservation } from "../../sources/markdown-artifact"
import { canonicalJson } from "../../storage/canonical-json"
import { advanceSystemState, readSystemState } from "../../storage/system-state"
import {
  ensureMarkdownCourseViewRevision,
  ensureProvisionalCourseViewRevision,
  planMarkdownCourseView,
  planProvisionalCourseView,
  stableCurriculumId,
  type ProvisionalCourseItemInput,
} from "./course-view-revisions"

export type { ProvisionalCourseItemInput } from "./course-view-revisions"

const REGISTER_MARKDOWN_COURSE_KIND = "register-markdown-course-v1"
const CREATE_PROVISIONAL_COURSE_KIND = "create-provisional-course-v1"
const ADVANCE_COURSE_ROUTE_KIND = "advance-course-route-v1"

export class CourseRouteChangedError extends Error {
  constructor(readonly courseId: string) {
    super(`Course route changed before advance: ${courseId}`)
    this.name = "CourseRouteChangedError"
  }
}

export class CourseRouteCompleteError extends Error {
  constructor(readonly courseId: string) {
    super(`Course route is already at its final item: ${courseId}`)
    this.name = "CourseRouteCompleteError"
  }
}

export type ActiveCourseContext = {
  courseId: string
  title: string
  courseViewRevisionId: string
  basis: "source_grounded" | "model_proposed"
  learningSpaceId: string
  route: {
    version: number
    anchor: CourseContextItem
    breadcrumb: CourseContextItem[]
    nearby: Array<CourseContextItem & { relation: "previous" | "current" | "next" }>
  }
  material: {
    artifactId: string
    artifactRevision: string
    relativePath: string
    startLine: number
    endLine: number
  } | null
}

type CourseContextItem = {
  itemId: string
  title: string
  ordinal: number
}

export function deriveMarkdownCourseIdentity(observation: MarkdownArtifactObservation) {
  const learningSpaceId = stableCurriculumId("learning-space", observation.workspaceRoot)
  const artifactId = stableCurriculumId(
    "material-artifact",
    learningSpaceId,
    observation.relativePath,
  )
  return {
    learningSpaceId,
    artifactId,
    courseId: stableCurriculumId("course", "markdown", artifactId),
  }
}

export function deriveProvisionalCourseIdentity(input: {
  workspaceRoot: string
  causeItemId: string
}) {
  const learningSpaceId = stableCurriculumId("learning-space", input.workspaceRoot)
  return {
    learningSpaceId,
    courseId: stableCurriculumId("course", "model-proposed", input.causeItemId),
  }
}

export function registerMarkdownCourse(
  database: Database,
  input: {
    effectId: string
    causeItemId: string
    learningSpaceId: string
    courseId: string
    artifactId: string
    title: string
    observation: MarkdownArtifactObservation
    occurredAt: number
  },
) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.learningSpaceId, "learningSpaceId")
  assertIdentifier(input.courseId, "courseId")
  assertIdentifier(input.artifactId, "artifactId")
  assertText(input.title, "title")
  assertTimestamp(input.occurredAt, "occurredAt")
  if (input.observation.headings.length === 0) throw new Error("Course material has no headings")

  const { courseViewRevisionId, items } = planMarkdownCourseView(
    input.courseId,
    input.observation,
  )
  const currentItem = items[0]
  if (!currentItem) throw new Error("Course material has no current item")
  const receiptValue = canonicalJson({
    artifactId: input.artifactId,
    artifactRevision: input.observation.revision,
    courseId: input.courseId,
    courseViewRevisionId,
    learningSpaceId: input.learningSpaceId,
    parserRevision: input.observation.parserRevision,
    relativePath: input.observation.relativePath,
    title: input.title,
  })

  return database.transaction(() => {
    const replay = readSemanticEffect(
      database,
      REGISTER_MARKDOWN_COURSE_KIND,
      input.causeItemId,
      input.courseId,
    )
    if (replay) {
      if (replay.effect_id !== input.effectId || replay.value_json !== receiptValue) {
        throw new Error("Markdown course registration conflicts with its existing semantic effect")
      }
      return registrationResult(database, input.courseId, true)
    }
    assertEffectIdUnused(database, input.effectId)
    const source = requireUserSource(database, input.causeItemId)
    const state = readSystemState(database)
    assertTransitionTime(input.occurredAt, source.created_at, state.lastTransitionAt)

    insertOrVerifyLearningSpace(database, {
      learningSpaceId: input.learningSpaceId,
      rootPath: input.observation.workspaceRoot,
      createdAt: input.occurredAt,
    })
    insertOrVerifyArtifact(database, {
      artifactId: input.artifactId,
      learningSpaceId: input.learningSpaceId,
      relativePath: input.observation.relativePath,
      createdAt: input.occurredAt,
    })
    insertOrVerifyMaterialRevision(database, {
      artifactId: input.artifactId,
      artifactRevision: input.observation.revision,
      observedAt: input.observation.observedAt ?? input.occurredAt,
      byteLength: input.observation.byteLength,
      lineCount: input.observation.lineCount,
    })
    insertOrVerifyCourse(database, {
      courseId: input.courseId,
      learningSpaceId: input.learningSpaceId,
      title: input.title,
      createdAt: input.occurredAt,
    })

    const activeView = database
      .query("SELECT course_view_revision_id FROM active_course_view WHERE course_id = ?1")
      .get(input.courseId) as { course_view_revision_id: string } | null
    if (activeView && activeView.course_view_revision_id !== courseViewRevisionId) {
      throw new Error(
        `Course ${input.courseId} already has another active view; explicit reconciliation is required`,
      )
    }

    ensureMarkdownCourseViewRevision(database, {
      courseId: input.courseId,
      artifactId: input.artifactId,
      observation: input.observation,
      sourceItemId: input.causeItemId,
      createdAt: input.occurredAt,
    })

    activateCourseView(database, {
      learningSpaceId: input.learningSpaceId,
      courseId: input.courseId,
      courseViewRevisionId,
      initialItemId: currentItem.itemId,
      sourceItemId: input.causeItemId,
      occurredAt: input.occurredAt,
    })

    const revisionAfter = state.revision + 1
    database
      .query(`
        INSERT INTO durable_effect (
          effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `)
      .run(
        input.effectId,
        REGISTER_MARKDOWN_COURSE_KIND,
        input.causeItemId,
        input.courseId,
        receiptValue,
        revisionAfter,
        input.occurredAt,
      )
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return registrationResult(database, input.courseId, false)
  }).immediate()
}

export function createProvisionalCourse(
  database: Database,
  input: {
    effectId: string
    causeItemId: string
    learningSpaceId: string
    courseId: string
    workspaceRoot: string
    title: string
    items: readonly ProvisionalCourseItemInput[]
    occurredAt: number
  },
) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.learningSpaceId, "learningSpaceId")
  assertIdentifier(input.courseId, "courseId")
  assertText(input.workspaceRoot, "workspaceRoot")
  assertText(input.title, "title")
  assertTimestamp(input.occurredAt, "occurredAt")
  const { courseViewRevisionId, items } = planProvisionalCourseView(
    input.courseId,
    input.items,
  )
  const initialItem = items[0]
  if (!initialItem) throw new Error("A provisional course requires at least one item")
  const receiptValue = canonicalJson({
    basis: "model_proposed",
    courseId: input.courseId,
    courseViewRevisionId,
    learningSpaceId: input.learningSpaceId,
    title: input.title,
  })

  return database.transaction(() => {
    const replay = readSemanticEffect(
      database,
      CREATE_PROVISIONAL_COURSE_KIND,
      input.causeItemId,
      input.courseId,
    )
    if (replay) {
      if (replay.effect_id !== input.effectId || replay.value_json !== receiptValue) {
        throw new Error("Provisional course creation conflicts with its existing semantic effect")
      }
      return registrationResult(database, input.courseId, true)
    }
    assertEffectIdUnused(database, input.effectId)
    const source = requireUserSource(database, input.causeItemId)
    const state = readSystemState(database)
    assertTransitionTime(input.occurredAt, source.created_at, state.lastTransitionAt)

    insertOrVerifyLearningSpace(database, {
      learningSpaceId: input.learningSpaceId,
      rootPath: input.workspaceRoot,
      createdAt: input.occurredAt,
    })
    insertOrVerifyCourse(database, {
      courseId: input.courseId,
      learningSpaceId: input.learningSpaceId,
      title: input.title,
      createdAt: input.occurredAt,
    })
    const activeView = database
      .query("SELECT course_view_revision_id FROM active_course_view WHERE course_id = ?1")
      .get(input.courseId) as { course_view_revision_id: string } | null
    if (activeView && activeView.course_view_revision_id !== courseViewRevisionId) {
      throw new Error(
        `Course ${input.courseId} already has another active view; explicit reconciliation is required`,
      )
    }

    ensureProvisionalCourseViewRevision(database, {
      courseId: input.courseId,
      items: input.items,
      sourceItemId: input.causeItemId,
      createdAt: input.occurredAt,
    })

    activateCourseView(database, {
      learningSpaceId: input.learningSpaceId,
      courseId: input.courseId,
      courseViewRevisionId,
      initialItemId: initialItem.itemId,
      sourceItemId: input.causeItemId,
      occurredAt: input.occurredAt,
    })

    const revisionAfter = state.revision + 1
    database
      .query(`
        INSERT INTO durable_effect (
          effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `)
      .run(
        input.effectId,
        CREATE_PROVISIONAL_COURSE_KIND,
        input.causeItemId,
        input.courseId,
        receiptValue,
        revisionAfter,
        input.occurredAt,
      )
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return registrationResult(database, input.courseId, false)
  }).immediate()
}

export function advanceCourseRoute(
  database: Database,
  input: {
    effectId: string
    causeItemId: string
    courseId: string
    expectedViewRevisionId: string
    expectedAnchorItemId: string
    expectedRouteVersion: number
    occurredAt: number
  },
) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.courseId, "courseId")
  assertIdentifier(input.expectedViewRevisionId, "expectedViewRevisionId")
  assertIdentifier(input.expectedAnchorItemId, "expectedAnchorItemId")
  assertPositiveInteger(input.expectedRouteVersion, "expectedRouteVersion")
  assertTimestamp(input.occurredAt, "occurredAt")
  const slot = `${input.courseId}:${input.expectedAnchorItemId}`

  return database.transaction(() => {
    const existing = readSemanticEffect(
      database,
      ADVANCE_COURSE_ROUTE_KIND,
      input.causeItemId,
      slot,
    )
    if (existing) {
      if (existing.effect_id !== input.effectId) {
        throw new Error("Course route advance conflicts with its existing semantic effect")
      }
      return routeAdvanceResult(database, input.courseId, input.expectedAnchorItemId, true)
    }
    assertEffectIdUnused(database, input.effectId)
    const source = requireUserSource(database, input.causeItemId)
    const state = readSystemState(database)
    assertTransitionTime(input.occurredAt, source.created_at, state.lastTransitionAt)

    const route = database
      .query(`
        SELECT
          route.course_view_revision_id,
          route.route_anchor_item_id,
          route.version,
          item.ordinal,
          item.title
        FROM course_route_progress AS route
        JOIN course_view_item AS item
          ON item.course_view_revision_id = route.course_view_revision_id
         AND item.course_item_id = route.route_anchor_item_id
        WHERE route.course_id = ?1
      `)
      .get(input.courseId) as
      | {
          course_view_revision_id: string
          route_anchor_item_id: string
          version: number
          ordinal: number
          title: string
        }
      | null
    if (!route) throw new CourseRouteChangedError(input.courseId)
    if (
      route.course_view_revision_id !== input.expectedViewRevisionId ||
      route.route_anchor_item_id !== input.expectedAnchorItemId ||
      route.version !== input.expectedRouteVersion
    ) {
      throw new CourseRouteChangedError(input.courseId)
    }
    const next = database
      .query(`
        SELECT course_item_id, title, ordinal
        FROM course_view_item
        WHERE course_view_revision_id = ?1 AND ordinal > ?2
        ORDER BY ordinal ASC
        LIMIT 1
      `)
      .get(route.course_view_revision_id, route.ordinal) as
      | { course_item_id: string; title: string; ordinal: number }
      | null
    if (!next) throw new CourseRouteCompleteError(input.courseId)

    const nextVersion = route.version + 1
    const updated = database
      .query(`
        UPDATE course_route_progress
        SET route_anchor_item_id = ?1,
            version = ?2,
            source_item_id = ?3,
            updated_at = ?4
        WHERE course_id = ?5
          AND course_view_revision_id = ?6
          AND route_anchor_item_id = ?7
          AND version = ?8
      `)
      .run(
        next.course_item_id,
        nextVersion,
        input.causeItemId,
        input.occurredAt,
        input.courseId,
        input.expectedViewRevisionId,
        input.expectedAnchorItemId,
        input.expectedRouteVersion,
      )
    if (updated.changes !== 1) throw new CourseRouteChangedError(input.courseId)

    const valueJson = canonicalJson({
      courseId: input.courseId,
      courseViewRevisionId: route.course_view_revision_id,
      fromItemId: route.route_anchor_item_id,
      routeVersionAfter: nextVersion,
      routeVersionBefore: route.version,
      toItemId: next.course_item_id,
    })
    const revisionAfter = state.revision + 1
    database
      .query(`
        INSERT INTO durable_effect (
          effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `)
      .run(
        input.effectId,
        ADVANCE_COURSE_ROUTE_KIND,
        input.causeItemId,
        slot,
        valueJson,
        revisionAfter,
        input.occurredAt,
      )
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return {
      replayed: false as const,
      effectId: input.effectId,
      courseId: input.courseId,
      courseViewRevisionId: route.course_view_revision_id,
      routeVersion: nextVersion,
      previousItem: {
        itemId: route.route_anchor_item_id,
        title: route.title,
        ordinal: route.ordinal,
      },
      currentItem: {
        itemId: next.course_item_id,
        title: next.title,
        ordinal: next.ordinal,
      },
    }
  }).immediate()
}

export function readActiveCourseContext(database: Database): ActiveCourseContext | undefined {
  const row = database
    .query(`
      SELECT
        course.course_id,
        course.title AS course_title,
        focus.learning_space_id,
        view.course_view_revision_id,
        view.basis,
        route.version AS route_version,
        route.route_anchor_item_id,
        anchor.title AS anchor_title,
        anchor.ordinal AS anchor_ordinal,
        alignment.artifact_id,
        alignment.artifact_revision,
        artifact.relative_path,
        alignment.start_line,
        alignment.end_line
      FROM current_learning_focus AS focus
      JOIN course ON course.course_id = focus.course_id
      JOIN active_course_view AS active ON active.course_id = course.course_id
      JOIN course_view_revision AS view
        ON view.course_view_revision_id = active.course_view_revision_id
      JOIN course_route_progress AS route ON route.course_id = course.course_id
      JOIN course_view_item AS anchor
        ON anchor.course_view_revision_id = route.course_view_revision_id
       AND anchor.course_item_id = route.route_anchor_item_id
      LEFT JOIN material_alignment AS alignment
        ON alignment.course_view_revision_id = route.course_view_revision_id
       AND alignment.course_item_id = route.route_anchor_item_id
      LEFT JOIN material_artifact AS artifact ON artifact.artifact_id = alignment.artifact_id
      WHERE focus.singleton = 1
    `)
    .get() as
    | {
        course_id: string
        course_title: string
        learning_space_id: string
        course_view_revision_id: string
        basis: "source_grounded" | "model_proposed"
        route_version: number
        route_anchor_item_id: string
        anchor_title: string
        anchor_ordinal: number
        artifact_id: string | null
        artifact_revision: string | null
        relative_path: string | null
        start_line: number | null
        end_line: number | null
      }
    | null
  if (!row) return undefined

  const breadcrumbRows = database
    .query(`
      WITH RECURSIVE breadcrumb(course_item_id, parent_course_item_id, title, ordinal, depth) AS (
        SELECT course_item_id, parent_course_item_id, title, ordinal, 0
        FROM course_view_item
        WHERE course_view_revision_id = ?1 AND course_item_id = ?2

        UNION ALL

        SELECT parent.course_item_id, parent.parent_course_item_id, parent.title, parent.ordinal,
               breadcrumb.depth + 1
        FROM course_view_item AS parent
        JOIN breadcrumb ON breadcrumb.parent_course_item_id = parent.course_item_id
        WHERE parent.course_view_revision_id = ?1
      )
      SELECT course_item_id, title, ordinal
      FROM breadcrumb
      ORDER BY depth DESC
    `)
    .all(row.course_view_revision_id, row.route_anchor_item_id) as Array<{
    course_item_id: string
    title: string
    ordinal: number
  }>
  const nearbyRows = database
    .query(`
      SELECT course_item_id, title, ordinal
      FROM course_view_item
      WHERE course_view_revision_id = ?1 AND ordinal BETWEEN ?2 AND ?3
      ORDER BY ordinal ASC
    `)
    .all(
      row.course_view_revision_id,
      Math.max(0, row.anchor_ordinal - 1),
      row.anchor_ordinal + 3,
    ) as Array<{ course_item_id: string; title: string; ordinal: number }>
  const anchor = {
    itemId: row.route_anchor_item_id,
    title: row.anchor_title,
    ordinal: row.anchor_ordinal,
  }

  return {
    courseId: row.course_id,
    title: row.course_title,
    courseViewRevisionId: row.course_view_revision_id,
    basis: row.basis,
    learningSpaceId: row.learning_space_id,
    route: {
      version: row.route_version,
      anchor,
      breadcrumb: breadcrumbRows.map(toContextItem),
      nearby: nearbyRows.map((item) => ({
        ...toContextItem(item),
        relation:
          item.ordinal < row.anchor_ordinal
            ? ("previous" as const)
            : item.ordinal === row.anchor_ordinal
              ? ("current" as const)
              : ("next" as const),
      })),
    },
    material:
      row.artifact_id === null ||
      row.artifact_revision === null ||
      row.relative_path === null ||
      row.start_line === null ||
      row.end_line === null
        ? null
        : {
            artifactId: row.artifact_id,
            artifactRevision: row.artifact_revision,
            relativePath: row.relative_path,
            startLine: row.start_line,
            endLine: row.end_line,
          },
  }
}

export function readLearningSpaceRoot(database: Database, learningSpaceId: string) {
  assertIdentifier(learningSpaceId, "learningSpaceId")
  const row = database
    .query("SELECT root_path FROM learning_space WHERE learning_space_id = ?1")
    .get(learningSpaceId) as { root_path: string } | null
  if (!row) throw new Error(`Unknown LearningSpace: ${learningSpaceId}`)
  return row.root_path
}

function registrationResult(database: Database, courseId: string, replayed: boolean) {
  const context = readActiveCourseContext(database)
  if (!context || context.courseId !== courseId) {
    throw new Error(`Registered course is not the active learning focus: ${courseId}`)
  }
  return {
    replayed,
    courseId,
    courseViewRevisionId: context.courseViewRevisionId,
    basis: context.basis,
    routeVersion: context.route.version,
    currentItem: context.route.anchor,
  }
}

function routeAdvanceResult(
  database: Database,
  courseId: string,
  previousItemId: string,
  replayed: boolean,
) {
  const context = readActiveCourseContext(database)
  if (!context || context.courseId !== courseId) {
    throw new Error(`Advanced course is not active: ${courseId}`)
  }
  const previous = database
    .query(`
      SELECT title, ordinal
      FROM course_view_item
      WHERE course_view_revision_id = ?1 AND course_item_id = ?2
    `)
    .get(context.courseViewRevisionId, previousItemId) as
    | { title: string; ordinal: number }
    | null
  if (!previous) throw new Error(`Missing previous course item: ${previousItemId}`)
  return {
    replayed,
    courseId,
    courseViewRevisionId: context.courseViewRevisionId,
    routeVersion: context.route.version,
    previousItem: { itemId: previousItemId, ...previous },
    currentItem: context.route.anchor,
  }
}

function activateCourseView(
  database: Database,
  input: {
    learningSpaceId: string
    courseId: string
    courseViewRevisionId: string
    initialItemId: string
    sourceItemId: string
    occurredAt: number
  },
) {
  const activeView = database
    .query("SELECT course_view_revision_id FROM active_course_view WHERE course_id = ?1")
    .get(input.courseId) as { course_view_revision_id: string } | null
  if (!activeView) {
    database
      .query(`
        INSERT INTO active_course_view (
          course_id, course_view_revision_id, version, source_item_id, updated_at
        ) VALUES (?1, ?2, 1, ?3, ?4)
      `)
      .run(input.courseId, input.courseViewRevisionId, input.sourceItemId, input.occurredAt)
  } else if (activeView.course_view_revision_id !== input.courseViewRevisionId) {
    throw new Error(
      `Course ${input.courseId} already has another active view; explicit reconciliation is required`,
    )
  }

  const route = database
    .query("SELECT course_view_revision_id FROM course_route_progress WHERE course_id = ?1")
    .get(input.courseId) as { course_view_revision_id: string } | null
  if (!route) {
    database
      .query(`
        INSERT INTO course_route_progress (
          course_id,
          course_view_revision_id,
          route_anchor_item_id,
          version,
          source_item_id,
          updated_at
        ) VALUES (?1, ?2, ?3, 1, ?4, ?5)
      `)
      .run(
        input.courseId,
        input.courseViewRevisionId,
        input.initialItemId,
        input.sourceItemId,
        input.occurredAt,
      )
  } else if (route.course_view_revision_id !== input.courseViewRevisionId) {
    throw new Error(`Course route requires explicit reconciliation: ${input.courseId}`)
  }

  const focus = database
    .query("SELECT course_id, version FROM current_learning_focus WHERE singleton = 1")
    .get() as { course_id: string; version: number } | null
  if (!focus) {
    database
      .query(`
        INSERT INTO current_learning_focus (
          singleton,
          learning_space_id,
          course_id,
          version,
          source_item_id,
          updated_at
        ) VALUES (1, ?1, ?2, 1, ?3, ?4)
      `)
      .run(input.learningSpaceId, input.courseId, input.sourceItemId, input.occurredAt)
  } else if (focus.course_id !== input.courseId) {
    const updated = database
      .query(`
        UPDATE current_learning_focus
        SET learning_space_id = ?1,
            course_id = ?2,
            version = ?3,
            source_item_id = ?4,
            updated_at = ?5
        WHERE singleton = 1 AND version = ?6
      `)
      .run(
        input.learningSpaceId,
        input.courseId,
        focus.version + 1,
        input.sourceItemId,
        input.occurredAt,
        focus.version,
      )
    if (updated.changes !== 1) throw new Error("Current learning focus changed during activation")
  }
}

function insertOrVerifyLearningSpace(
  database: Database,
  input: { learningSpaceId: string; rootPath: string; createdAt: number },
) {
  const existing = database
    .query("SELECT root_path FROM learning_space WHERE learning_space_id = ?1")
    .get(input.learningSpaceId) as { root_path: string } | null
  if (existing) {
    if (existing.root_path !== input.rootPath) {
      throw new Error(`LearningSpace identity conflicts: ${input.learningSpaceId}`)
    }
    return
  }
  database
    .query("INSERT INTO learning_space (learning_space_id, root_path, created_at) VALUES (?1, ?2, ?3)")
    .run(input.learningSpaceId, input.rootPath, input.createdAt)
}

function insertOrVerifyArtifact(
  database: Database,
  input: {
    artifactId: string
    learningSpaceId: string
    relativePath: string
    createdAt: number
  },
) {
  const existing = database
    .query("SELECT learning_space_id, relative_path, kind FROM material_artifact WHERE artifact_id = ?1")
    .get(input.artifactId) as
    | { learning_space_id: string; relative_path: string; kind: string }
    | null
  if (existing) {
    if (
      existing.learning_space_id !== input.learningSpaceId ||
      existing.relative_path !== input.relativePath ||
      existing.kind !== "markdown"
    ) {
      throw new Error(`Material artifact identity conflicts: ${input.artifactId}`)
    }
    return
  }
  database
    .query(`
      INSERT INTO material_artifact (
        artifact_id, learning_space_id, kind, relative_path, created_at
      ) VALUES (?1, ?2, 'markdown', ?3, ?4)
    `)
    .run(input.artifactId, input.learningSpaceId, input.relativePath, input.createdAt)
}

function insertOrVerifyMaterialRevision(
  database: Database,
  input: {
    artifactId: string
    artifactRevision: string
    observedAt: number
    byteLength: number
    lineCount: number
  },
) {
  const existing = database
    .query(`
      SELECT byte_length, line_count
      FROM material_revision
      WHERE artifact_id = ?1 AND artifact_revision = ?2
    `)
    .get(input.artifactId, input.artifactRevision) as
    | { byte_length: number; line_count: number }
    | null
  if (existing) {
    if (existing.byte_length !== input.byteLength || existing.line_count !== input.lineCount) {
      throw new Error(`Material revision metadata conflicts: ${input.artifactRevision}`)
    }
    return
  }
  database
    .query(`
      INSERT INTO material_revision (
        artifact_id, artifact_revision, observed_at, byte_length, line_count
      ) VALUES (?1, ?2, ?3, ?4, ?5)
    `)
    .run(
      input.artifactId,
      input.artifactRevision,
      input.observedAt,
      input.byteLength,
      input.lineCount,
    )
}

function insertOrVerifyCourse(
  database: Database,
  input: { courseId: string; learningSpaceId: string; title: string; createdAt: number },
) {
  const existing = database
    .query("SELECT learning_space_id, title FROM course WHERE course_id = ?1")
    .get(input.courseId) as { learning_space_id: string; title: string } | null
  if (existing) {
    if (existing.learning_space_id !== input.learningSpaceId || existing.title !== input.title) {
      throw new Error(`Course identity conflicts: ${input.courseId}`)
    }
    return
  }
  database
    .query("INSERT INTO course (course_id, learning_space_id, title, created_at) VALUES (?1, ?2, ?3, ?4)")
    .run(input.courseId, input.learningSpaceId, input.title, input.createdAt)
}

function readSemanticEffect(
  database: Database,
  kind: string,
  causeItemId: string,
  effectSlot: string,
) {
  return database
    .query(`
      SELECT effect_id, value_json
      FROM durable_effect
      WHERE kind = ?1 AND cause_item_id = ?2 AND effect_slot = ?3
    `)
    .get(kind, causeItemId, effectSlot) as { effect_id: string; value_json: string } | null
}

function assertEffectIdUnused(database: Database, effectId: string) {
  const existing = database
    .query("SELECT 1 AS found FROM durable_effect WHERE effect_id = ?1")
    .get(effectId)
  if (existing) throw new Error(`Durable effect ID was reused: ${effectId}`)
}

function requireUserSource(database: Database, itemId: string) {
  const source = database
    .query("SELECT role, created_at FROM session_item WHERE item_id = ?1")
    .get(itemId) as { role: string; created_at: number } | null
  if (!source) throw new Error(`Unknown course command source: ${itemId}`)
  if (source.role !== "user") throw new Error("Course command source must be admitted learner input")
  return source
}

function assertTransitionTime(occurredAt: number, sourceAt: number, lastTransitionAt: number) {
  if (occurredAt < sourceAt) throw new Error("Course transition cannot precede its source input")
  if (occurredAt < lastTransitionAt) {
    throw new Error("Course transition cannot precede the latest system transition")
  }
}

function toContextItem(row: { course_item_id: string; title: string; ordinal: number }) {
  return { itemId: row.course_item_id, title: row.title, ordinal: row.ordinal }
}

function assertIdentifier(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}

function assertText(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}

function assertTimestamp(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${label} must be a non-negative integer timestamp`)
  }
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}
