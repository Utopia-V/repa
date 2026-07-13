import { SQLiteError, type Database } from "bun:sqlite"
import { realpathSync } from "node:fs"
import { resolve } from "node:path"
import { readLatestTurnEventAt } from "../../interaction/records"
import {
  observeMarkdownArtifact,
  readMarkdownSelector,
} from "../../sources/markdown-artifact"
import { canonicalJson } from "../../storage/canonical-json"
import {
  readCourseViewPage,
  realignMarkdownCourse,
  reviseProvisionalCourse,
  setCourseRouteAnchor,
} from "./course-correction"
import {
  advanceCourseRoute,
  createProvisionalCourse,
  CourseRouteChangedError,
  CourseRouteCompleteError,
  deriveMarkdownCourseIdentity,
  deriveProvisionalCourseIdentity,
  readActiveCourseContext,
  readLearningSpaceRoot,
  registerMarkdownCourse,
  type ActiveCourseContext,
  type ProvisionalCourseItemInput,
} from "./course-view"

export const REGISTER_MARKDOWN_COURSE_TOOL = "register_markdown_course"
export const CREATE_PROVISIONAL_COURSE_TOOL = "create_provisional_course_route"
export const READ_CURRENT_COURSE_MATERIAL_TOOL = "read_current_course_material"
export const ADVANCE_COURSE_ROUTE_TOOL = "advance_course_route"
export const INSPECT_ACTIVE_COURSE_VIEW_TOOL = "inspect_active_course_view"
export const SET_COURSE_ROUTE_ANCHOR_TOOL = "set_course_route_anchor"
export const REVISE_PROVISIONAL_COURSE_TOOL = "revise_provisional_course_route"
export const REALIGN_MARKDOWN_COURSE_TOOL = "realign_current_markdown_course"

export type CourseToolFailure = {
  ok: false
  code:
    | "invalid_context"
    | "invalid_input"
    | "stale_material_revision"
    | "source_unavailable"
    | "stale_course_route"
    | "stale_course_context"
    | "course_complete"
    | "illegal_transition"
  message: string
  expectedRevision?: string
  actualRevision?: string
}

export type CourseMaterialReadReceipt = {
  ok: true
  courseId: string
  courseViewRevisionId: string
  itemId: string
  title: string
  artifactId: string
  artifactRevision: string
  relativePath: string
  startLine: number
  endLine: number
}

export type CourseMaterialReadOutcome =
  | (CourseMaterialReadReceipt & { text: string })
  | CourseToolFailure

export type CourseRouteAdvanceOutcome =
  | {
      ok: true
      disposition: "applied" | "already_applied"
      operationEffectId: string
      courseId: string
      courseViewRevisionId: string
      routeVersion: number
      previousItem: { itemId: string; title: string; ordinal: number }
      currentItem: { itemId: string; title: string; ordinal: number }
    }
  | CourseToolFailure

export type CourseGenesisOutcome =
  | {
      ok: true
      disposition: "applied" | "already_applied"
      operationEffectId: string
      courseId: string
      courseViewRevisionId: string
      basis: "source_grounded" | "model_proposed"
      routeVersion: number
      currentItem: { itemId: string; title: string; ordinal: number }
    }
  | CourseToolFailure

export type CourseInspectionOutcome =
  | {
      ok: true
      courseId: string
      courseViewRevisionId: string
      basis: "source_grounded" | "model_proposed"
      total: number
      offset: number
      limit: number
      routeVersion: number
      routeAnchorItemId: string
      items: Array<{
        itemId: string
        parentItemId: string | null
        ordinal: number
        title: string
      }>
    }
  | CourseToolFailure

export type CourseCorrectionOutcome =
  | {
      ok: true
      disposition: "applied" | "already_applied"
      operationEffectId: string
      courseId: string
      courseViewRevisionId: string
      routeVersion: number
      currentItem: { itemId: string; title: string; ordinal: number }
      previousItem?: { itemId: string; title: string; ordinal: number }
      previousCourseViewRevisionId?: string
      basis?: "source_grounded" | "model_proposed"
    }
  | CourseToolFailure

type InvocationRow = {
  invocation_id: string
  tool_name: string
  input_json: string
  status: "running" | "completed" | "failed"
  result_json: string | null
  error_json: string | null
  created_at: number
  model_operation_id: string
  context_json: string
  model_status: "running" | "completed" | "failed"
  turn_id: string
  turn_status: "running" | "completed" | "failed" | "interrupted" | "exhausted"
  cause_item_id: string
  cause_created_at: number
}

export async function executeMarkdownCourseRegistration(
  database: Database,
  input: { invocationId: string; workspaceRoot: string; executedAt: number },
): Promise<CourseGenesisOutcome> {
  assertExecutionInput(input)
  const workspaceRoot = canonicalWorkspaceRoot(input.workspaceRoot)
  const prepared = database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseGenesisOutcome>(invocation)
    if (terminal) return { terminal }
    validateExecutable(database, invocation, REGISTER_MARKDOWN_COURSE_TOOL, input.executedAt, false)
    requireNoActiveCourseContext(invocation)
    return { invocation, toolInput: parseMarkdownRegistrationInput(invocation.input_json) }
  }).immediate()
  if (prepared.terminal) return prepared.terminal

  let observation: Awaited<ReturnType<typeof observeMarkdownArtifact>>
  try {
    observation = await observeMarkdownArtifact({
      workspaceRoot,
      relativePath: prepared.toolInput.relativePath,
      observedAt: input.executedAt,
    })
  } catch (error) {
    return settleGenesisFailure(database, input, REGISTER_MARKDOWN_COURSE_TOOL, {
      ok: false,
      code: "source_unavailable",
      message: error instanceof Error ? error.message : String(error),
    })
  }
  const identity = deriveMarkdownCourseIdentity(observation)
  const title = prepared.toolInput.title ?? observation.headings[0]?.title
  if (!title) {
    return settleGenesisFailure(database, input, REGISTER_MARKDOWN_COURSE_TOOL, {
      ok: false,
      code: "invalid_input",
      message: "A Markdown course requires a title",
    })
  }

  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseGenesisOutcome>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, REGISTER_MARKDOWN_COURSE_TOOL, input.executedAt, false)
    requireNoActiveCourseContext(invocation)
    if (readActiveCourseContext(database)) {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "stale_course_context",
        message: "A course became active after this model context was sampled",
      })
    }
    const operationEffectId = `effect:markdown-course:${invocation.invocation_id}`
    const registered = registerMarkdownCourse(database, {
      effectId: operationEffectId,
      causeItemId: invocation.cause_item_id,
      ...identity,
      title,
      observation,
      occurredAt: input.executedAt,
    })
    const outcome: CourseGenesisOutcome = {
      ok: true,
      disposition: registered.replayed ? "already_applied" : "applied",
      operationEffectId,
      courseId: registered.courseId,
      courseViewRevisionId: registered.courseViewRevisionId,
      basis: registered.basis,
      routeVersion: registered.routeVersion,
      currentItem: registered.currentItem,
    }
    settleSuccess(database, invocation, input.executedAt, outcome, operationEffectId)
    return outcome
  }).immediate()
}

export function executeProvisionalCourseCreation(
  database: Database,
  input: { invocationId: string; workspaceRoot: string; executedAt: number },
): CourseGenesisOutcome {
  assertExecutionInput(input)
  const workspaceRoot = canonicalWorkspaceRoot(input.workspaceRoot)
  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseGenesisOutcome>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, CREATE_PROVISIONAL_COURSE_TOOL, input.executedAt, false)
    requireNoActiveCourseContext(invocation)
    if (readActiveCourseContext(database)) {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "stale_course_context",
        message: "A course became active after this model context was sampled",
      })
    }
    let toolInput: { title: string; items: ProvisionalCourseItemInput[] }
    try {
      toolInput = parseProvisionalCourseInput(invocation.input_json)
    } catch (error) {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "invalid_input",
        message: error instanceof Error ? error.message : String(error),
      })
    }
    const identity = deriveProvisionalCourseIdentity({
      workspaceRoot,
      causeItemId: invocation.cause_item_id,
    })
    const operationEffectId = `effect:provisional-course:${invocation.invocation_id}`
    const registered = createProvisionalCourse(database, {
      effectId: operationEffectId,
      causeItemId: invocation.cause_item_id,
      ...identity,
      workspaceRoot,
      title: toolInput.title,
      items: toolInput.items,
      occurredAt: input.executedAt,
    })
    const outcome: CourseGenesisOutcome = {
      ok: true,
      disposition: registered.replayed ? "already_applied" : "applied",
      operationEffectId,
      courseId: registered.courseId,
      courseViewRevisionId: registered.courseViewRevisionId,
      basis: registered.basis,
      routeVersion: registered.routeVersion,
      currentItem: registered.currentItem,
    }
    settleSuccess(database, invocation, input.executedAt, outcome, operationEffectId)
    return outcome
  }).immediate()
}

export function executeActiveCourseInspection(
  database: Database,
  input: { invocationId: string; executedAt: number },
): CourseInspectionOutcome {
  assertExecutionInput(input)
  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseInspectionOutcome>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, INSPECT_ACTIVE_COURSE_VIEW_TOOL, input.executedAt, false)
    const context = requireActiveCourse(invocation)
    let pagination: { offset: number; limit: number }
    try {
      pagination = parseInspectionInput(invocation.input_json)
    } catch (error) {
      return settleFailure(database, invocation, input.executedAt, invalidInputFailure(error))
    }
    const page = readCourseViewPage(database, {
      courseId: context.courseId,
      courseViewRevisionId: context.courseViewRevisionId,
      ...pagination,
    })
    const outcome: CourseInspectionOutcome = {
      ok: true,
      ...page,
      routeVersion: context.route.version,
      routeAnchorItemId: context.route.anchor.itemId,
    }
    settleSuccess(database, invocation, input.executedAt, outcome)
    return outcome
  }).immediate()
}

export function executeCourseRouteReanchor(
  database: Database,
  input: { invocationId: string; executedAt: number },
): CourseCorrectionOutcome {
  assertExecutionInput(input)
  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseCorrectionOutcome>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, SET_COURSE_ROUTE_ANCHOR_TOOL, input.executedAt, false)
    const context = requireActiveCourse(invocation)
    let targetOrdinal: number
    try {
      targetOrdinal = parseTargetOrdinal(invocation.input_json)
    } catch (error) {
      return settleFailure(database, invocation, input.executedAt, invalidInputFailure(error))
    }
    const page = readCourseViewPage(database, {
      courseId: context.courseId,
      courseViewRevisionId: context.courseViewRevisionId,
      offset: targetOrdinal,
      limit: 1,
    })
    const target = page.items[0]
    if (!target || target.ordinal !== targetOrdinal) {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "invalid_input",
        message: `No active Course View item has ordinal ${targetOrdinal}`,
      })
    }
    try {
      const operationEffectId = `effect:course-reanchor:${invocation.invocation_id}`
      const corrected = setCourseRouteAnchor(database, {
        effectId: operationEffectId,
        causeItemId: invocation.cause_item_id,
        courseId: context.courseId,
        expectedViewRevisionId: context.courseViewRevisionId,
        expectedAnchorItemId: context.route.anchor.itemId,
        expectedRouteVersion: context.route.version,
        targetItemId: target.itemId,
        occurredAt: input.executedAt,
      })
      const outcome: CourseCorrectionOutcome = {
        ok: true,
        disposition: corrected.replayed ? "already_applied" : "applied",
        operationEffectId,
        courseId: corrected.courseId,
        courseViewRevisionId: corrected.courseViewRevisionId,
        routeVersion: corrected.routeVersion,
        previousItem: corrected.previousItem,
        currentItem: corrected.currentItem,
      }
      settleSuccess(database, invocation, input.executedAt, outcome, operationEffectId)
      return outcome
    } catch (error) {
      return settleCorrectionError(database, invocation, input.executedAt, error)
    }
  }).immediate()
}

export function executeProvisionalCourseRevision(
  database: Database,
  input: { invocationId: string; executedAt: number },
): CourseCorrectionOutcome {
  assertExecutionInput(input)
  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseCorrectionOutcome>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, REVISE_PROVISIONAL_COURSE_TOOL, input.executedAt, false)
    const context = requireActiveCourse(invocation)
    if (context.basis !== "model_proposed") {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "invalid_context",
        message: "Only a model-proposed Course View can be revised with this tool",
      })
    }
    let toolInput: { items: ProvisionalCourseItemInput[]; routeAnchorIndex: number }
    try {
      toolInput = parseProvisionalRevisionInput(invocation.input_json)
    } catch (error) {
      return settleFailure(database, invocation, input.executedAt, invalidInputFailure(error))
    }
    try {
      const operationEffectId = `effect:course-revision:${invocation.invocation_id}`
      const revised = reviseProvisionalCourse(database, {
        effectId: operationEffectId,
        causeItemId: invocation.cause_item_id,
        courseId: context.courseId,
        expectedViewRevisionId: context.courseViewRevisionId,
        expectedAnchorItemId: context.route.anchor.itemId,
        expectedRouteVersion: context.route.version,
        items: toolInput.items,
        routeAnchorIndex: toolInput.routeAnchorIndex,
        occurredAt: input.executedAt,
      })
      const outcome: CourseCorrectionOutcome = {
        ok: true,
        disposition: revised.replayed ? "already_applied" : "applied",
        operationEffectId,
        courseId: revised.courseId,
        courseViewRevisionId: revised.courseViewRevisionId,
        previousCourseViewRevisionId: revised.previousCourseViewRevisionId,
        basis: revised.basis,
        routeVersion: revised.routeVersion,
        currentItem: revised.currentItem,
      }
      settleSuccess(database, invocation, input.executedAt, outcome, operationEffectId)
      return outcome
    } catch (error) {
      return settleCorrectionError(database, invocation, input.executedAt, error)
    }
  }).immediate()
}

export async function executeMarkdownCourseRealignment(
  database: Database,
  input: { invocationId: string; executedAt: number },
): Promise<CourseCorrectionOutcome> {
  assertExecutionInput(input)
  const prepared = database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseCorrectionOutcome>(invocation)
    if (terminal) return { terminal }
    validateExecutable(database, invocation, REALIGN_MARKDOWN_COURSE_TOOL, input.executedAt)
    const context = requireActiveCourse(invocation)
    if (context.basis !== "source_grounded" || !context.material) {
      const failure: CourseToolFailure = {
        ok: false,
        code: "invalid_context",
        message: "Material realignment requires a source-grounded active course item",
      }
      settleFailure(database, invocation, input.executedAt, failure)
      return { terminal: failure }
    }
    return {
      context,
      root: readLearningSpaceRoot(database, context.learningSpaceId),
    }
  }).immediate()
  if (prepared.terminal) return prepared.terminal

  let observation: Awaited<ReturnType<typeof observeMarkdownArtifact>>
  try {
    observation = await observeMarkdownArtifact({
      workspaceRoot: prepared.root,
      relativePath: prepared.context.material!.relativePath,
      observedAt: input.executedAt,
    })
  } catch (error) {
    return settleGeneralCourseFailure(database, input, REALIGN_MARKDOWN_COURSE_TOOL, {
      ok: false,
      code: "source_unavailable",
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseCorrectionOutcome>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, REALIGN_MARKDOWN_COURSE_TOOL, input.executedAt)
    const context = requireActiveCourse(invocation)
    if (context.basis !== "source_grounded" || !context.material) {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "invalid_context",
        message: "Material realignment context is no longer source-grounded",
      })
    }
    try {
      const operationEffectId = `effect:material-realign:${invocation.invocation_id}`
      const realigned = realignMarkdownCourse(database, {
        effectId: operationEffectId,
        causeItemId: invocation.cause_item_id,
        courseId: context.courseId,
        artifactId: context.material.artifactId,
        expectedViewRevisionId: context.courseViewRevisionId,
        expectedAnchorItemId: context.route.anchor.itemId,
        expectedRouteVersion: context.route.version,
        observation,
        occurredAt: input.executedAt,
      })
      const outcome: CourseCorrectionOutcome = {
        ok: true,
        disposition: realigned.replayed ? "already_applied" : "applied",
        operationEffectId,
        courseId: realigned.courseId,
        courseViewRevisionId: realigned.courseViewRevisionId,
        previousCourseViewRevisionId: realigned.previousCourseViewRevisionId,
        basis: realigned.basis,
        routeVersion: realigned.routeVersion,
        currentItem: realigned.currentItem,
      }
      settleSuccess(database, invocation, input.executedAt, outcome, operationEffectId)
      return outcome
    } catch (error) {
      return settleCorrectionError(database, invocation, input.executedAt, error)
    }
  }).immediate()
}

export async function executeCurrentCourseMaterialRead(
  database: Database,
  input: { invocationId: string; executedAt: number },
): Promise<CourseMaterialReadOutcome> {
  assertExecutionInput(input)
  const prepared = database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseMaterialReadReceipt | CourseToolFailure>(invocation)
    const context = requireActiveCourse(invocation)
    const material = context.material
    if (!material) {
      const failure: CourseToolFailure = {
        ok: false,
        code: "invalid_context",
        message: "The current course item has no aligned material",
      }
      if (terminal) return { terminal, context, root: "", failure }
      validateExecutable(database, invocation, READ_CURRENT_COURSE_MATERIAL_TOOL, input.executedAt)
      settleFailure(database, invocation, input.executedAt, failure)
      return { terminal: failure, context, root: "", failure }
    }
    const root = readLearningSpaceRoot(database, context.learningSpaceId)
    if (terminal) return { terminal, context, root }
    validateExecutable(database, invocation, READ_CURRENT_COURSE_MATERIAL_TOOL, input.executedAt)
    return { context, root }
  }).immediate()

  if (prepared.terminal && prepared.terminal.ok === false) return prepared.terminal
  const material = prepared.context.material
  if (!material) {
    return prepared.failure ?? {
      ok: false,
      code: "invalid_context",
      message: "The current course item has no aligned material",
    }
  }

  let observed: Awaited<ReturnType<typeof readMarkdownSelector>>
  try {
    observed = await readMarkdownSelector({
      workspaceRoot: prepared.root,
      relativePath: material.relativePath,
      expectedRevision: material.artifactRevision,
      startLine: material.startLine,
      endLine: material.endLine,
    })
  } catch (error) {
    const failure: CourseToolFailure = {
      ok: false,
      code: "source_unavailable",
      message: error instanceof Error ? error.message : String(error),
    }
    settleReadAfterObservation(database, input, failure)
    return failure
  }
  if (observed.status === "stale") {
    const failure: CourseToolFailure = {
      ok: false,
      code: "stale_material_revision",
      message: "The aligned material changed; the old selector was not read",
      expectedRevision: observed.expectedRevision,
      actualRevision: observed.actualRevision,
    }
    settleReadAfterObservation(database, input, failure)
    return failure
  }

  const receipt: CourseMaterialReadReceipt = {
    ok: true,
    courseId: prepared.context.courseId,
    courseViewRevisionId: prepared.context.courseViewRevisionId,
    itemId: prepared.context.route.anchor.itemId,
    title: prepared.context.route.anchor.title,
    artifactId: material.artifactId,
    artifactRevision: material.artifactRevision,
    relativePath: material.relativePath,
    startLine: observed.startLine,
    endLine: observed.endLine,
  }
  settleReadAfterObservation(database, input, receipt)
  return { ...receipt, text: observed.text }
}

export function executeCourseRouteAdvance(
  database: Database,
  input: { invocationId: string; executedAt: number },
): CourseRouteAdvanceOutcome {
  assertExecutionInput(input)
  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseRouteAdvanceOutcome>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, ADVANCE_COURSE_ROUTE_TOOL, input.executedAt)
    const context = requireActiveCourse(invocation)
    try {
      const operationEffectId = `effect:course-route:${invocation.invocation_id}`
      const advanced = advanceCourseRoute(database, {
        effectId: operationEffectId,
        causeItemId: invocation.cause_item_id,
        courseId: context.courseId,
        expectedViewRevisionId: context.courseViewRevisionId,
        expectedAnchorItemId: context.route.anchor.itemId,
        expectedRouteVersion: context.route.version,
        occurredAt: input.executedAt,
      })
      const outcome: CourseRouteAdvanceOutcome = {
        ok: true,
        disposition: advanced.replayed ? "already_applied" : "applied",
        operationEffectId,
        courseId: advanced.courseId,
        courseViewRevisionId: advanced.courseViewRevisionId,
        routeVersion: advanced.routeVersion,
        previousItem: advanced.previousItem,
        currentItem: advanced.currentItem,
      }
      settleSuccess(database, invocation, input.executedAt, outcome, operationEffectId)
      return outcome
    } catch (error) {
      if (error instanceof CourseRouteChangedError) {
        return settleFailure(database, invocation, input.executedAt, {
          ok: false,
          code: "stale_course_route",
          message: error.message,
        })
      }
      if (error instanceof CourseRouteCompleteError) {
        return settleFailure(database, invocation, input.executedAt, {
          ok: false,
          code: "course_complete",
          message: error.message,
        })
      }
      throw error
    }
  }).immediate()
}

export function durableCourseToolOutcome(
  outcome: CourseMaterialReadOutcome | CourseRouteAdvanceOutcome,
) {
  if (outcome.ok === false || !("text" in outcome)) return outcome
  const { text: _text, ...receipt } = outcome
  return receipt
}

function settleReadAfterObservation(
  database: Database,
  input: { invocationId: string; executedAt: number },
  outcome: CourseMaterialReadReceipt | CourseToolFailure,
) {
  database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseMaterialReadReceipt | CourseToolFailure>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, READ_CURRENT_COURSE_MATERIAL_TOOL, input.executedAt)
    return outcome.ok
      ? settleSuccess(database, invocation, input.executedAt, outcome)
      : settleFailure(database, invocation, input.executedAt, outcome)
  }).immediate()
}

function readInvocation(database: Database, invocationId: string) {
  const row = database
    .query(`
      SELECT
        invocation.invocation_id,
        invocation.tool_name,
        invocation.input_json,
        invocation.status,
        invocation.result_json,
        invocation.error_json,
        invocation.created_at,
        model.model_operation_id,
        model.context_json,
        model.status AS model_status,
        turn.turn_id,
        turn.status AS turn_status,
        source.item_id AS cause_item_id,
        source.created_at AS cause_created_at
      FROM tool_invocation AS invocation
      JOIN model_operation AS model
        ON model.model_operation_id = invocation.model_operation_id
      JOIN turn ON turn.turn_id = model.turn_id
      JOIN session_item AS source
        ON source.turn_id = turn.turn_id AND source.role = 'user'
      WHERE invocation.invocation_id = ?1
    `)
    .get(invocationId) as InvocationRow | null
  if (!row) throw new Error(`Unknown course tool invocation: ${invocationId}`)
  return row
}

function validateExecutable(
  database: Database,
  invocation: InvocationRow,
  expectedToolName: string,
  executedAt: number,
  requiresEmptyInput = true,
) {
  if (invocation.tool_name !== expectedToolName) {
    throw new Error(`Unexpected course tool: ${invocation.tool_name}`)
  }
  if (requiresEmptyInput && invocation.input_json !== "{}") {
    throw new Error("Course tool input must be empty")
  }
  if (invocation.turn_status !== "running" || invocation.model_status !== "running") {
    throw new Error("Course tool cannot execute after its Turn or model operation ended")
  }
  if (executedAt < invocation.created_at) {
    throw new Error("Course tool execution cannot precede its invocation")
  }
  if (executedAt < readLatestTurnEventAt(database, invocation.turn_id)) {
    throw new Error("Course tool execution cannot precede the latest Turn event")
  }
}

function requireNoActiveCourseContext(invocation: InvocationRow) {
  const context = JSON.parse(invocation.context_json) as Record<string, unknown>
  if (!("activeCourse" in context)) {
    throw new Error("Course genesis tool requires an explicit activeCourse context contribution")
  }
  if (context.activeCourse !== null) {
    throw new Error("Course genesis tool was not available in a context with an active course")
  }
}

function requireActiveCourse(invocation: InvocationRow): ActiveCourseContext {
  const context = JSON.parse(invocation.context_json) as Record<string, unknown>
  const course = context.activeCourse
  if (!isActiveCourseContext(course)) {
    throw new Error("Course tool requires an active course in its persisted context cut")
  }
  return course
}

function isActiveCourseContext(value: unknown): value is ActiveCourseContext {
  if (value === null || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.courseId !== "string" ||
    typeof candidate.courseViewRevisionId !== "string" ||
    typeof candidate.learningSpaceId !== "string" ||
    candidate.route === null ||
    typeof candidate.route !== "object"
  ) {
    return false
  }
  const route = candidate.route as Record<string, unknown>
  if (
    !Number.isSafeInteger(route.version) ||
    route.anchor === null ||
    typeof route.anchor !== "object"
  ) {
    return false
  }
  const anchor = route.anchor as Record<string, unknown>
  return typeof anchor.itemId === "string" && typeof anchor.title === "string"
}

function terminalOutcome<T>(invocation: InvocationRow): T | undefined {
  if (invocation.status === "completed") {
    if (invocation.result_json === null) throw new Error("Completed course tool has no result")
    return JSON.parse(invocation.result_json) as T
  }
  if (invocation.status === "failed") {
    if (invocation.error_json === null) throw new Error("Failed course tool has no error")
    return JSON.parse(invocation.error_json) as T
  }
  return undefined
}

function settleGenesisFailure(
  database: Database,
  input: { invocationId: string; executedAt: number },
  toolName: typeof REGISTER_MARKDOWN_COURSE_TOOL | typeof CREATE_PROVISIONAL_COURSE_TOOL,
  failure: CourseToolFailure,
) {
  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseGenesisOutcome>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, toolName, input.executedAt, false)
    return settleFailure(database, invocation, input.executedAt, failure)
  }).immediate()
}

function settleGeneralCourseFailure(
  database: Database,
  input: { invocationId: string; executedAt: number },
  toolName: string,
  failure: CourseToolFailure,
) {
  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalOutcome<CourseCorrectionOutcome>(invocation)
    if (terminal) return terminal
    validateExecutable(database, invocation, toolName, input.executedAt, toolName === REALIGN_MARKDOWN_COURSE_TOOL)
    return settleFailure(database, invocation, input.executedAt, failure)
  }).immediate()
}

function settleCorrectionError(
  database: Database,
  invocation: InvocationRow,
  settledAt: number,
  error: unknown,
) {
  if (error instanceof SQLiteError) throw error
  const message = error instanceof Error ? error.message : String(error)
  return settleFailure(database, invocation, settledAt, {
    ok: false,
    code: /changed|stale/i.test(message) ? "stale_course_route" : "invalid_input",
    message,
  })
}

function invalidInputFailure(error: unknown): CourseToolFailure {
  return {
    ok: false,
    code: "invalid_input",
    message: error instanceof Error ? error.message : String(error),
  }
}

function parseInspectionInput(inputJson: string) {
  const value = expectObject(JSON.parse(inputJson) as unknown)
  expectKeys(value, [], ["limit", "offset"])
  const offset = value.offset ?? 0
  const limit = value.limit ?? 30
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new Error("offset must be a non-negative integer")
  }
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 50) {
    throw new Error("limit must be an integer from 1 to 50")
  }
  return { offset: offset as number, limit: limit as number }
}

function parseTargetOrdinal(inputJson: string) {
  const value = expectObject(JSON.parse(inputJson) as unknown)
  expectKeys(value, ["targetOrdinal"], [])
  if (!Number.isSafeInteger(value.targetOrdinal) || (value.targetOrdinal as number) < 0) {
    throw new Error("targetOrdinal must be a non-negative integer")
  }
  return value.targetOrdinal as number
}

function parseProvisionalRevisionInput(inputJson: string) {
  const value = expectObject(JSON.parse(inputJson) as unknown)
  expectKeys(value, ["items", "routeAnchorIndex"], [])
  if (!Array.isArray(value.items)) throw new Error("items must be an array")
  if (!Number.isSafeInteger(value.routeAnchorIndex) || (value.routeAnchorIndex as number) < 0) {
    throw new Error("routeAnchorIndex must be a non-negative integer")
  }
  return {
    items: parseProvisionalItems(value.items),
    routeAnchorIndex: value.routeAnchorIndex as number,
  }
}

function parseMarkdownRegistrationInput(inputJson: string) {
  const value = expectObject(JSON.parse(inputJson) as unknown)
  expectKeys(value, ["relativePath"], ["title"])
  if (typeof value.relativePath !== "string" || !value.relativePath.trim()) {
    throw new Error("relativePath must be a non-empty string")
  }
  if (
    value.title !== undefined &&
    (typeof value.title !== "string" || !value.title.trim())
  ) {
    throw new Error("title must be a non-empty string when supplied")
  }
  return {
    relativePath: value.relativePath,
    ...(typeof value.title === "string" ? { title: value.title.trim() } : {}),
  }
}

function parseProvisionalCourseInput(inputJson: string) {
  const value = expectObject(JSON.parse(inputJson) as unknown)
  expectKeys(value, ["items", "title"], [])
  if (typeof value.title !== "string" || !value.title.trim()) {
    throw new Error("title must be a non-empty string")
  }
  if (!Array.isArray(value.items)) throw new Error("items must be an array")
  const items = parseProvisionalItems(value.items)
  return { title: value.title.trim(), items }
}

function parseProvisionalItems(values: unknown[]) {
  return values.map((rawItem, index): ProvisionalCourseItemInput => {
    const item = expectObject(rawItem)
    expectKeys(item, ["title"], ["parentIndex"])
    if (typeof item.title !== "string" || !item.title.trim()) {
      throw new Error(`items[${index}].title must be a non-empty string`)
    }
    if (
      item.parentIndex !== undefined &&
      item.parentIndex !== null &&
      !Number.isSafeInteger(item.parentIndex)
    ) {
      throw new Error(`items[${index}].parentIndex must be an integer or null`)
    }
    return {
      title: item.title.trim(),
      ...(item.parentIndex === undefined
        ? {}
        : { parentIndex: item.parentIndex as number | null }),
    }
  })
}

function expectObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool input must be an object")
  }
  return value as Record<string, unknown>
}

function expectKeys(
  object: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
) {
  const allowed = new Set([...required, ...optional])
  const actual = Object.keys(object)
  if (required.some((key) => !(key in object)) || actual.some((key) => !allowed.has(key))) {
    throw new Error(
      `Tool input keys must be ${required.join(", ")}${optional.length ? ` with optional ${optional.join(", ")}` : ""}`,
    )
  }
}

function canonicalWorkspaceRoot(workspaceRoot: string) {
  if (!workspaceRoot.trim()) throw new Error("workspaceRoot must not be empty")
  return realpathSync.native(resolve(workspaceRoot))
}

function settleSuccess<T>(
  database: Database,
  invocation: InvocationRow,
  settledAt: number,
  result: T,
  effectId?: string,
) {
  const updated = database
    .query(`
      UPDATE tool_invocation
      SET status = 'completed', effect_id = ?1, result_json = ?2, settled_at = ?3
      WHERE invocation_id = ?4 AND status = 'running'
    `)
    .run(effectId ?? null, canonicalJson(result), settledAt, invocation.invocation_id)
  if (updated.changes !== 1) {
    throw new Error(`Course tool changed before success settlement: ${invocation.invocation_id}`)
  }
  return result
}

function settleFailure(
  database: Database,
  invocation: InvocationRow,
  settledAt: number,
  failure: CourseToolFailure,
) {
  const updated = database
    .query(`
      UPDATE tool_invocation
      SET status = 'failed', error_json = ?1, settled_at = ?2
      WHERE invocation_id = ?3 AND status = 'running'
    `)
    .run(canonicalJson(failure), settledAt, invocation.invocation_id)
  if (updated.changes !== 1) {
    throw new Error(`Course tool changed before failure settlement: ${invocation.invocation_id}`)
  }
  return failure
}

function assertExecutionInput(input: { invocationId: string; executedAt: number }) {
  if (!input.invocationId.trim()) throw new Error("invocationId must not be empty")
  if (
    !Number.isSafeInteger(input.executedAt) ||
    input.executedAt < 0 ||
    Number.isNaN(new Date(input.executedAt).getTime())
  ) {
    throw new Error("executedAt must be a non-negative integer timestamp")
  }
}
