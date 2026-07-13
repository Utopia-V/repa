import type { Database } from "bun:sqlite"
import type { MarkdownArtifactObservation } from "../../sources/markdown-artifact"
import { canonicalJson } from "../../storage/canonical-json"
import { advanceSystemState, readSystemState } from "../../storage/system-state"
import {
  ensureMarkdownCourseViewRevision,
  ensureProvisionalCourseViewRevision,
  planMarkdownCourseView,
  planProvisionalCourseView,
  type ProvisionalCourseItemInput,
} from "./course-view-revisions"

const SET_COURSE_ROUTE_ANCHOR_KIND = "set-course-route-anchor-v1"
const REVISE_PROVISIONAL_COURSE_KIND = "revise-provisional-course-v1"
const REALIGN_MARKDOWN_COURSE_KIND = "realign-markdown-course-v1"

type ExpectedCourseState = {
  active_view_version: number
  course_view_revision_id: string
  basis: "source_grounded" | "model_proposed"
  source_artifact_id: string | null
  route_anchor_item_id: string
  route_version: number
  anchor_title: string
  anchor_ordinal: number
}

type ViewTransitionReceipt = {
  courseId: string
  fromCourseViewRevisionId: string
  toCourseViewRevisionId: string
  routeVersionBefore: number
  routeVersionAfter: number
  targetItemId: string
  kind: "provisional_revision" | "material_realign"
}

export function readCourseViewPage(
  database: Database,
  input: {
    courseId: string
    courseViewRevisionId: string
    offset: number
    limit: number
  },
) {
  assertIdentifier(input.courseId, "courseId")
  assertIdentifier(input.courseViewRevisionId, "courseViewRevisionId")
  assertNonNegativeInteger(input.offset, "offset")
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50) {
    throw new RangeError("limit must be an integer from 1 to 50")
  }
  const view = database
    .query("SELECT course_id, basis FROM course_view_revision WHERE course_view_revision_id = ?1")
    .get(input.courseViewRevisionId) as
    | { course_id: string; basis: "source_grounded" | "model_proposed" }
    | null
  if (!view || view.course_id !== input.courseId) {
    throw new Error(`Unknown Course View revision: ${input.courseViewRevisionId}`)
  }
  const total = database
    .query("SELECT COUNT(*) AS count FROM course_view_item WHERE course_view_revision_id = ?1")
    .get(input.courseViewRevisionId) as { count: number }
  const rows = database
    .query(`
      SELECT course_item_id, parent_course_item_id, ordinal, title
      FROM course_view_item
      WHERE course_view_revision_id = ?1
      ORDER BY ordinal ASC
      LIMIT ?2 OFFSET ?3
    `)
    .all(input.courseViewRevisionId, input.limit, input.offset) as Array<{
    course_item_id: string
    parent_course_item_id: string | null
    ordinal: number
    title: string
  }>
  return {
    courseId: input.courseId,
    courseViewRevisionId: input.courseViewRevisionId,
    basis: view.basis,
    total: total.count,
    offset: input.offset,
    limit: input.limit,
    items: rows.map((row) => ({
      itemId: row.course_item_id,
      parentItemId: row.parent_course_item_id,
      ordinal: row.ordinal,
      title: row.title,
    })),
  }
}

export function setCourseRouteAnchor(
  database: Database,
  input: {
    effectId: string
    causeItemId: string
    courseId: string
    expectedViewRevisionId: string
    expectedAnchorItemId: string
    expectedRouteVersion: number
    targetItemId: string
    occurredAt: number
  },
) {
  validateRouteCommand(input)
  assertIdentifier(input.targetItemId, "targetItemId")
  if (input.targetItemId === input.expectedAnchorItemId) {
    throw new Error("The requested route anchor is already current")
  }
  const receipt = {
    courseId: input.courseId,
    courseViewRevisionId: input.expectedViewRevisionId,
    routeVersionBefore: input.expectedRouteVersion,
    routeVersionAfter: input.expectedRouteVersion + 1,
    previousItemId: input.expectedAnchorItemId,
    targetItemId: input.targetItemId,
  }
  const valueJson = canonicalJson(receipt)

  return database.transaction(() => {
    const replay = readSemanticEffect(
      database,
      SET_COURSE_ROUTE_ANCHOR_KIND,
      input.causeItemId,
      input.courseId,
    )
    if (replay) {
      requireExactReplay(replay, input.effectId, valueJson, "Course route correction")
      return routeAnchorResult(database, receipt, true)
    }
    assertEffectIdUnused(database, input.effectId)
    const source = requireUserSource(database, input.causeItemId)
    const state = readSystemState(database)
    assertTransitionTime(input.occurredAt, source.created_at, state.lastTransitionAt)
    const course = requireExpectedCourseState(database, input)
    const target = readViewItem(database, input.expectedViewRevisionId, input.targetItemId)
    if (!target) throw new Error(`Target item is not in the active Course View: ${input.targetItemId}`)

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
        input.targetItemId,
        receipt.routeVersionAfter,
        input.causeItemId,
        input.occurredAt,
        input.courseId,
        input.expectedViewRevisionId,
        input.expectedAnchorItemId,
        input.expectedRouteVersion,
      )
    if (updated.changes !== 1) throw new Error(`Course route changed during correction: ${input.courseId}`)
    const revisionAfter = state.revision + 1
    insertEffect(database, input, SET_COURSE_ROUTE_ANCHOR_KIND, valueJson, revisionAfter)
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
      courseViewRevisionId: input.expectedViewRevisionId,
      routeVersion: receipt.routeVersionAfter,
      previousItem: {
        itemId: input.expectedAnchorItemId,
        title: course.anchor_title,
        ordinal: course.anchor_ordinal,
      },
      currentItem: { itemId: input.targetItemId, ...target },
    }
  }).immediate()
}

export function reviseProvisionalCourse(
  database: Database,
  input: {
    effectId: string
    causeItemId: string
    courseId: string
    expectedViewRevisionId: string
    expectedAnchorItemId: string
    expectedRouteVersion: number
    items: readonly ProvisionalCourseItemInput[]
    routeAnchorIndex: number
    occurredAt: number
  },
) {
  validateRouteCommand(input)
  assertNonNegativeInteger(input.routeAnchorIndex, "routeAnchorIndex")
  const plan = planProvisionalCourseView(input.courseId, input.items)
  const target = plan.items[input.routeAnchorIndex]
  if (!target) throw new Error("routeAnchorIndex must identify an item in the revised view")
  if (plan.courseViewRevisionId === input.expectedViewRevisionId) {
    throw new Error("The provisional Course View revision did not change")
  }
  const receipt: ViewTransitionReceipt = {
    courseId: input.courseId,
    fromCourseViewRevisionId: input.expectedViewRevisionId,
    toCourseViewRevisionId: plan.courseViewRevisionId,
    routeVersionBefore: input.expectedRouteVersion,
    routeVersionAfter: input.expectedRouteVersion + 1,
    targetItemId: target.itemId,
    kind: "provisional_revision",
  }
  const valueJson = canonicalJson(receipt)

  return database.transaction(() => {
    const replay = readSemanticEffect(
      database,
      REVISE_PROVISIONAL_COURSE_KIND,
      input.causeItemId,
      input.courseId,
    )
    if (replay) {
      requireExactReplay(replay, input.effectId, valueJson, "Provisional Course View revision")
      return transitionResult(database, input.effectId, receipt, true, "model_proposed")
    }
    assertEffectIdUnused(database, input.effectId)
    const source = requireUserSource(database, input.causeItemId)
    const state = readSystemState(database)
    assertTransitionTime(input.occurredAt, source.created_at, state.lastTransitionAt)
    const current = requireExpectedCourseState(database, input)
    if (current.basis !== "model_proposed") {
      throw new Error("Only a model-proposed Course View can use provisional revision")
    }
    ensureProvisionalCourseViewRevision(database, {
      courseId: input.courseId,
      items: input.items,
      sourceItemId: input.causeItemId,
      createdAt: input.occurredAt,
    })
    const revisionAfter = state.revision + 1
    insertEffect(database, input, REVISE_PROVISIONAL_COURSE_KIND, valueJson, revisionAfter)
    transitionCourseView(database, {
      effectId: input.effectId,
      sourceItemId: input.causeItemId,
      occurredAt: input.occurredAt,
      receipt,
      activeViewVersion: current.active_view_version,
      expectedAnchorItemId: input.expectedAnchorItemId,
    })
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return transitionResult(database, input.effectId, receipt, false, "model_proposed")
  }).immediate()
}

export function realignMarkdownCourse(
  database: Database,
  input: {
    effectId: string
    causeItemId: string
    courseId: string
    artifactId: string
    expectedViewRevisionId: string
    expectedAnchorItemId: string
    expectedRouteVersion: number
    observation: MarkdownArtifactObservation
    occurredAt: number
  },
) {
  validateRouteCommand(input)
  assertIdentifier(input.artifactId, "artifactId")
  const plan = planMarkdownCourseView(input.courseId, input.observation)
  if (plan.courseViewRevisionId === input.expectedViewRevisionId) {
    throw new Error("The Markdown Course View revision did not change")
  }
  if (!plan.items.some((item) => item.itemId === input.expectedAnchorItemId)) {
    throw new Error("The current route anchor no longer exists in the changed Markdown outline")
  }
  const receipt: ViewTransitionReceipt = {
    courseId: input.courseId,
    fromCourseViewRevisionId: input.expectedViewRevisionId,
    toCourseViewRevisionId: plan.courseViewRevisionId,
    routeVersionBefore: input.expectedRouteVersion,
    routeVersionAfter: input.expectedRouteVersion + 1,
    targetItemId: input.expectedAnchorItemId,
    kind: "material_realign",
  }
  const valueJson = canonicalJson(receipt)

  return database.transaction(() => {
    const replay = readSemanticEffect(
      database,
      REALIGN_MARKDOWN_COURSE_KIND,
      input.causeItemId,
      input.courseId,
    )
    if (replay) {
      requireExactReplay(replay, input.effectId, valueJson, "Markdown material realignment")
      return transitionResult(database, input.effectId, receipt, true, "source_grounded")
    }
    assertEffectIdUnused(database, input.effectId)
    const source = requireUserSource(database, input.causeItemId)
    const state = readSystemState(database)
    assertTransitionTime(input.occurredAt, source.created_at, state.lastTransitionAt)
    const current = requireExpectedCourseState(database, input)
    if (current.basis !== "source_grounded" || current.source_artifact_id !== input.artifactId) {
      throw new Error("Markdown realignment does not match the active source-grounded Course View")
    }
    const artifact = database
      .query(`
        SELECT artifact.relative_path, space.root_path
        FROM material_artifact AS artifact
        JOIN learning_space AS space ON space.learning_space_id = artifact.learning_space_id
        JOIN course ON course.learning_space_id = space.learning_space_id
        WHERE artifact.artifact_id = ?1 AND course.course_id = ?2
      `)
      .get(input.artifactId, input.courseId) as
      | { relative_path: string; root_path: string }
      | null
    if (
      !artifact ||
      artifact.relative_path !== input.observation.relativePath ||
      artifact.root_path !== input.observation.workspaceRoot
    ) {
      throw new Error("Markdown observation does not match the registered artifact origin")
    }
    insertOrVerifyMaterialRevision(database, {
      artifactId: input.artifactId,
      artifactRevision: input.observation.revision,
      observedAt: input.observation.observedAt ?? input.occurredAt,
      byteLength: input.observation.byteLength,
      lineCount: input.observation.lineCount,
    })
    ensureMarkdownCourseViewRevision(database, {
      courseId: input.courseId,
      artifactId: input.artifactId,
      observation: input.observation,
      sourceItemId: input.causeItemId,
      createdAt: input.occurredAt,
    })
    const revisionAfter = state.revision + 1
    insertEffect(database, input, REALIGN_MARKDOWN_COURSE_KIND, valueJson, revisionAfter)
    transitionCourseView(database, {
      effectId: input.effectId,
      sourceItemId: input.causeItemId,
      occurredAt: input.occurredAt,
      receipt,
      activeViewVersion: current.active_view_version,
      expectedAnchorItemId: input.expectedAnchorItemId,
    })
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return transitionResult(database, input.effectId, receipt, false, "source_grounded")
  }).immediate()
}

function transitionCourseView(
  database: Database,
  input: {
    effectId: string
    sourceItemId: string
    occurredAt: number
    receipt: ViewTransitionReceipt
    activeViewVersion: number
    expectedAnchorItemId: string
  },
) {
  const superseded = database
    .query(`
      UPDATE course_view_revision
      SET superseded_at = ?1
      WHERE course_view_revision_id = ?2 AND superseded_at IS NULL
    `)
    .run(input.occurredAt, input.receipt.fromCourseViewRevisionId)
  if (superseded.changes !== 1) throw new Error("Course View changed before supersession")
  const activated = database
    .query(`
      UPDATE active_course_view
      SET course_view_revision_id = ?1,
          version = ?2,
          source_item_id = ?3,
          updated_at = ?4
      WHERE course_id = ?5
        AND course_view_revision_id = ?6
        AND version = ?7
    `)
    .run(
      input.receipt.toCourseViewRevisionId,
      input.activeViewVersion + 1,
      input.sourceItemId,
      input.occurredAt,
      input.receipt.courseId,
      input.receipt.fromCourseViewRevisionId,
      input.activeViewVersion,
    )
  if (activated.changes !== 1) throw new Error("Active Course View changed during supersession")
  const route = database
    .query(`
      UPDATE course_route_progress
      SET course_view_revision_id = ?1,
          route_anchor_item_id = ?2,
          version = ?3,
          source_item_id = ?4,
          updated_at = ?5
      WHERE course_id = ?6
        AND course_view_revision_id = ?7
        AND route_anchor_item_id = ?8
        AND version = ?9
    `)
    .run(
      input.receipt.toCourseViewRevisionId,
      input.receipt.targetItemId,
      input.receipt.routeVersionAfter,
      input.sourceItemId,
      input.occurredAt,
      input.receipt.courseId,
      input.receipt.fromCourseViewRevisionId,
      input.expectedAnchorItemId,
      input.receipt.routeVersionBefore,
    )
  if (route.changes !== 1) throw new Error("Course route changed during view reconciliation")
  database
    .query(`
      INSERT INTO course_view_transition (
        transition_effect_id,
        course_id,
        from_course_view_revision_id,
        to_course_view_revision_id,
        kind,
        source_item_id,
        created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `)
    .run(
      input.effectId,
      input.receipt.courseId,
      input.receipt.fromCourseViewRevisionId,
      input.receipt.toCourseViewRevisionId,
      input.receipt.kind,
      input.sourceItemId,
      input.occurredAt,
    )
}

function requireExpectedCourseState(
  database: Database,
  input: {
    courseId: string
    expectedViewRevisionId: string
    expectedAnchorItemId: string
    expectedRouteVersion: number
  },
) {
  const row = database
    .query(`
      SELECT
        active.version AS active_view_version,
        active.course_view_revision_id,
        view.basis,
        view.source_artifact_id,
        route.route_anchor_item_id,
        route.version AS route_version,
        anchor.title AS anchor_title,
        anchor.ordinal AS anchor_ordinal
      FROM active_course_view AS active
      JOIN course_view_revision AS view
        ON view.course_view_revision_id = active.course_view_revision_id
      JOIN course_route_progress AS route ON route.course_id = active.course_id
      JOIN course_view_item AS anchor
        ON anchor.course_view_revision_id = route.course_view_revision_id
       AND anchor.course_item_id = route.route_anchor_item_id
      WHERE active.course_id = ?1
    `)
    .get(input.courseId) as ExpectedCourseState | null
  if (
    !row ||
    row.course_view_revision_id !== input.expectedViewRevisionId ||
    row.route_anchor_item_id !== input.expectedAnchorItemId ||
    row.route_version !== input.expectedRouteVersion
  ) {
    throw new Error(`Course state changed before correction: ${input.courseId}`)
  }
  return row
}

function transitionResult(
  database: Database,
  effectId: string,
  receipt: ViewTransitionReceipt,
  replayed: boolean,
  basis: "source_grounded" | "model_proposed",
) {
  const currentItem = readViewItem(
    database,
    receipt.toCourseViewRevisionId,
    receipt.targetItemId,
  )
  if (!currentItem) throw new Error(`Missing reconciled route item: ${receipt.targetItemId}`)
  return {
    replayed,
    effectId,
    courseId: receipt.courseId,
    previousCourseViewRevisionId: receipt.fromCourseViewRevisionId,
    courseViewRevisionId: receipt.toCourseViewRevisionId,
    basis,
    routeVersion: receipt.routeVersionAfter,
    currentItem: { itemId: receipt.targetItemId, ...currentItem },
  }
}

function routeAnchorResult(
  database: Database,
  receipt: {
    courseId: string
    courseViewRevisionId: string
    routeVersionAfter: number
    previousItemId: string
    targetItemId: string
  },
  replayed: boolean,
) {
  const previous = readViewItem(database, receipt.courseViewRevisionId, receipt.previousItemId)
  const current = readViewItem(database, receipt.courseViewRevisionId, receipt.targetItemId)
  if (!previous || !current) throw new Error("Course route correction items are missing")
  return {
    replayed,
    courseId: receipt.courseId,
    courseViewRevisionId: receipt.courseViewRevisionId,
    routeVersion: receipt.routeVersionAfter,
    previousItem: { itemId: receipt.previousItemId, ...previous },
    currentItem: { itemId: receipt.targetItemId, ...current },
  }
}

function readViewItem(database: Database, courseViewRevisionId: string, itemId: string) {
  return database
    .query(`
      SELECT title, ordinal
      FROM course_view_item
      WHERE course_view_revision_id = ?1 AND course_item_id = ?2
    `)
    .get(courseViewRevisionId, itemId) as { title: string; ordinal: number } | null
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

function insertEffect(
  database: Database,
  input: { effectId: string; causeItemId: string; courseId: string; occurredAt: number },
  kind: string,
  valueJson: string,
  revisionAfter: number,
) {
  database
    .query(`
      INSERT INTO durable_effect (
        effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `)
    .run(
      input.effectId,
      kind,
      input.causeItemId,
      input.courseId,
      valueJson,
      revisionAfter,
      input.occurredAt,
    )
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

function requireExactReplay(
  effect: { effect_id: string; value_json: string },
  effectId: string,
  valueJson: string,
  label: string,
) {
  if (effect.effect_id !== effectId || effect.value_json !== valueJson) {
    throw new Error(`${label} conflicts with its existing semantic effect`)
  }
}

function assertEffectIdUnused(database: Database, effectId: string) {
  if (database.query("SELECT 1 AS found FROM durable_effect WHERE effect_id = ?1").get(effectId)) {
    throw new Error(`Durable effect ID was reused: ${effectId}`)
  }
}

function requireUserSource(database: Database, itemId: string) {
  const source = database
    .query("SELECT role, created_at FROM session_item WHERE item_id = ?1")
    .get(itemId) as { role: string; created_at: number } | null
  if (!source) throw new Error(`Unknown course correction source: ${itemId}`)
  if (source.role !== "user") throw new Error("Course correction source must be learner input")
  return source
}

function validateRouteCommand(input: {
  effectId: string
  causeItemId: string
  courseId: string
  expectedViewRevisionId: string
  expectedAnchorItemId: string
  expectedRouteVersion: number
  occurredAt: number
}) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.courseId, "courseId")
  assertIdentifier(input.expectedViewRevisionId, "expectedViewRevisionId")
  assertIdentifier(input.expectedAnchorItemId, "expectedAnchorItemId")
  if (!Number.isSafeInteger(input.expectedRouteVersion) || input.expectedRouteVersion < 1) {
    throw new Error("expectedRouteVersion must be a positive integer")
  }
  assertTimestamp(input.occurredAt, "occurredAt")
}

function assertTransitionTime(occurredAt: number, sourceAt: number, lastTransitionAt: number) {
  if (occurredAt < sourceAt) throw new Error("Course correction cannot precede its source input")
  if (occurredAt < lastTransitionAt) {
    throw new Error("Course correction cannot precede the latest system transition")
  }
}

function assertIdentifier(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`)
  }
}

function assertTimestamp(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${label} must be a non-negative integer timestamp`)
  }
}
