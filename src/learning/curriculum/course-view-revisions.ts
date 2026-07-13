import type { Database } from "bun:sqlite"
import type { MarkdownArtifactObservation } from "../../sources/markdown-artifact"
import { canonicalJson } from "../../storage/canonical-json"

export type ProvisionalCourseItemInput = {
  title: string
  parentIndex?: number | null
}

export type PlannedCourseViewItem = {
  itemId: string
  parentItemId: string | null
  ordinal: number
  title: string
}

export function planMarkdownCourseView(
  courseId: string,
  observation: MarkdownArtifactObservation,
) {
  const courseViewRevisionId = stableCurriculumId(
    "course-view",
    courseId,
    observation.revision,
    observation.parserRevision,
  )
  const items = observation.headings.map((heading): PlannedCourseViewItem => ({
    itemId: stableCurriculumId("course-item", courseId, heading.key),
    parentItemId:
      heading.parentKey === null
        ? null
        : stableCurriculumId("course-item", courseId, heading.parentKey),
    ordinal: heading.ordinal,
    title: heading.title,
  }))
  return { courseViewRevisionId, items }
}

export function planProvisionalCourseView(
  courseId: string,
  rawItems: readonly ProvisionalCourseItemInput[],
) {
  const normalizedItems = normalizeProvisionalItems(rawItems)
  const courseViewRevisionId = stableCurriculumId(
    "course-view",
    courseId,
    "model-proposed",
    canonicalJson(normalizedItems),
  )
  const items = normalizedItems.map((item, index): PlannedCourseViewItem => ({
    itemId: stableCurriculumId("course-item", courseId, `provisional:${index}`),
    parentItemId:
      item.parentIndex === null
        ? null
        : stableCurriculumId("course-item", courseId, `provisional:${item.parentIndex}`),
    ordinal: index,
    title: item.title,
  }))
  return { courseViewRevisionId, items }
}

export function ensureMarkdownCourseViewRevision(
  database: Database,
  input: {
    courseId: string
    artifactId: string
    observation: MarkdownArtifactObservation
    sourceItemId: string
    createdAt: number
  },
) {
  const plan = planMarkdownCourseView(input.courseId, input.observation)
  const existing = readExistingView(database, plan.courseViewRevisionId)
  if (existing) {
    if (
      existing.course_id !== input.courseId ||
      existing.basis !== "source_grounded" ||
      existing.source_artifact_id !== input.artifactId ||
      existing.source_artifact_revision !== input.observation.revision ||
      existing.parser_revision !== input.observation.parserRevision
    ) {
      throw new Error(`Course View revision identity conflicts: ${plan.courseViewRevisionId}`)
    }
    return plan
  }

  database
    .query(`
      INSERT INTO course_view_revision (
        course_view_revision_id,
        course_id,
        basis,
        source_artifact_id,
        source_artifact_revision,
        parser_revision,
        source_item_id,
        created_at
      ) VALUES (?1, ?2, 'source_grounded', ?3, ?4, ?5, ?6, ?7)
    `)
    .run(
      plan.courseViewRevisionId,
      input.courseId,
      input.artifactId,
      input.observation.revision,
      input.observation.parserRevision,
      input.sourceItemId,
      input.createdAt,
    )
  for (const [index, item] of plan.items.entries()) {
    ensureCourseItem(database, item.itemId, input.courseId, input.createdAt)
    insertViewItem(database, plan.courseViewRevisionId, item)
    const heading = input.observation.headings[index]
    if (!heading) throw new Error(`Missing Markdown heading for course item ${item.itemId}`)
    database
      .query(`
        INSERT INTO material_alignment (
          alignment_id,
          course_view_revision_id,
          course_item_id,
          artifact_id,
          artifact_revision,
          start_line,
          end_line,
          basis,
          source_item_id,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'markdown_heading', ?8, ?9)
      `)
      .run(
        stableCurriculumId(
          "alignment",
          plan.courseViewRevisionId,
          item.itemId,
          input.artifactId,
          input.observation.revision,
        ),
        plan.courseViewRevisionId,
        item.itemId,
        input.artifactId,
        input.observation.revision,
        heading.startLine,
        heading.endLine,
        input.sourceItemId,
        input.createdAt,
      )
  }
  return plan
}

export function ensureProvisionalCourseViewRevision(
  database: Database,
  input: {
    courseId: string
    items: readonly ProvisionalCourseItemInput[]
    sourceItemId: string
    createdAt: number
  },
) {
  const plan = planProvisionalCourseView(input.courseId, input.items)
  const existing = readExistingView(database, plan.courseViewRevisionId)
  if (existing) {
    if (existing.course_id !== input.courseId || existing.basis !== "model_proposed") {
      throw new Error(`Course View revision identity conflicts: ${plan.courseViewRevisionId}`)
    }
    return plan
  }

  database
    .query(`
      INSERT INTO course_view_revision (
        course_view_revision_id,
        course_id,
        basis,
        source_artifact_id,
        source_artifact_revision,
        parser_revision,
        source_item_id,
        created_at
      ) VALUES (?1, ?2, 'model_proposed', NULL, NULL, NULL, ?3, ?4)
    `)
    .run(plan.courseViewRevisionId, input.courseId, input.sourceItemId, input.createdAt)
  for (const item of plan.items) {
    ensureCourseItem(database, item.itemId, input.courseId, input.createdAt)
    insertViewItem(database, plan.courseViewRevisionId, item)
  }
  return plan
}

export function stableCurriculumId(prefix: string, ...parts: string[]) {
  const digest = new Bun.CryptoHasher("sha256").update(parts.join("\u0000")).digest("hex")
  return `${prefix}:${digest.slice(0, 32)}`
}

function readExistingView(database: Database, courseViewRevisionId: string) {
  return database
    .query(`
      SELECT course_id, basis, source_artifact_id, source_artifact_revision, parser_revision
      FROM course_view_revision
      WHERE course_view_revision_id = ?1
    `)
    .get(courseViewRevisionId) as
    | {
        course_id: string
        basis: "source_grounded" | "model_proposed"
        source_artifact_id: string | null
        source_artifact_revision: string | null
        parser_revision: string | null
      }
    | null
}

function ensureCourseItem(
  database: Database,
  courseItemId: string,
  courseId: string,
  createdAt: number,
) {
  database
    .query(`
      INSERT INTO course_item (course_item_id, course_id, created_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(course_item_id) DO NOTHING
    `)
    .run(courseItemId, courseId, createdAt)
  const owner = database
    .query("SELECT course_id FROM course_item WHERE course_item_id = ?1")
    .get(courseItemId) as { course_id: string }
  if (owner.course_id !== courseId) {
    throw new Error(`Course item identity belongs to another course: ${courseItemId}`)
  }
}

function insertViewItem(
  database: Database,
  courseViewRevisionId: string,
  item: PlannedCourseViewItem,
) {
  database
    .query(`
      INSERT INTO course_view_item (
        course_view_revision_id,
        course_item_id,
        parent_course_item_id,
        ordinal,
        title
      ) VALUES (?1, ?2, ?3, ?4, ?5)
    `)
    .run(
      courseViewRevisionId,
      item.itemId,
      item.parentItemId,
      item.ordinal,
      item.title,
    )
}

function normalizeProvisionalItems(items: readonly ProvisionalCourseItemInput[]) {
  if (items.length === 0) throw new Error("A provisional course requires at least one item")
  if (items.length > 128) throw new Error("A provisional course cannot exceed 128 items")
  return items.map((item, index) => {
    if (!item.title.trim()) throw new Error(`items[${index}].title must not be empty`)
    if (Array.from(item.title).length > 500) {
      throw new Error(`items[${index}].title cannot exceed 500 Unicode code points`)
    }
    const parentIndex = item.parentIndex ?? null
    if (
      parentIndex !== null &&
      (!Number.isSafeInteger(parentIndex) || parentIndex < 0 || parentIndex >= index)
    ) {
      throw new Error(`items[${index}].parentIndex must refer to an earlier item`)
    }
    return { title: item.title.trim(), parentIndex }
  })
}
