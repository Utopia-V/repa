import type { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"
import { readLatestTurnEventAt } from "../../interaction/records"
import { canonicalJson } from "../../storage/canonical-json"
import { readSystemState } from "../../storage/system-state"
import {
  addressFutureAttentionConcern,
  createFutureAttentionConcern,
  dismissFutureAttentionConcern,
  FutureAttentionCommandError,
  readFutureAttentionSource,
  readRecentFutureAttention,
  reopenFutureAttentionConcern,
  supersedeFutureAttentionConcern,
  type CourseItemTargetRef,
  type FutureAttentionConcern,
  type FutureAttentionContextConcern,
  type FutureAttentionInspectionConcern,
} from "./future-attention"

export const CREATE_FUTURE_ATTENTION_TOOL = "create_future_attention"
export const READ_FUTURE_ATTENTION_SOURCE_TOOL = "read_future_attention_source"
export const ADDRESS_FUTURE_ATTENTION_TOOL = "address_future_attention"
export const DISMISS_FUTURE_ATTENTION_TOOL = "dismiss_future_attention"
export const SUPERSEDE_FUTURE_ATTENTION_TOOL = "supersede_future_attention"
export const INSPECT_RECENT_FUTURE_ATTENTION_TOOL = "inspect_recent_future_attention"
export const REOPEN_FUTURE_ATTENTION_TOOL = "reopen_future_attention"

const AGENDA_TOOL_NAMES = new Set([
  CREATE_FUTURE_ATTENTION_TOOL,
  READ_FUTURE_ATTENTION_SOURCE_TOOL,
  ADDRESS_FUTURE_ATTENTION_TOOL,
  DISMISS_FUTURE_ATTENTION_TOOL,
  SUPERSEDE_FUTURE_ATTENTION_TOOL,
  INSPECT_RECENT_FUTURE_ATTENTION_TOOL,
  REOPEN_FUTURE_ATTENTION_TOOL,
])
const MAX_REASON_CODE_POINTS = 800
const MAX_EXCERPT_CODE_POINTS = 500
const MAX_RATIONALE_CODE_POINTS = 800
export const EXPLICIT_OFFSET_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:[zZ]|([+-])(\d{2}):(\d{2}))$/

export type FutureAttentionToolFailure = {
  ok: false
  code:
    | "invalid_input"
    | "invalid_context"
    | "semantic_conflict"
    | "stale_agenda_concern"
    | "stale_course_context"
    | "illegal_transition"
    | "turn_terminated"
    | "turn_exhausted"
    | "runtime_restarted"
  message: string
}

export type FutureAttentionConcernReceipt = {
  id: string
  status: FutureAttentionConcern["status"]
  version: number
  learnerRoleConstraint?: FutureAttentionConcern["learnerRoleConstraint"]
  successorConcernId?: string
}

export type FutureAttentionMutationSuccess = {
  ok: true
  disposition: "applied" | "already_applied"
  operationEffectId: string
  operationRevision: number
  currentRevision: number
  concern: FutureAttentionConcernReceipt
}

export type FutureAttentionSupersedeSuccess = {
  ok: true
  disposition: "applied" | "already_applied"
  operationEffectId: string
  operationRevision: number
  currentRevision: number
  previous: FutureAttentionConcernReceipt
  successor: FutureAttentionConcernReceipt
}

type SourceItemWithText = {
  itemId: string
  sessionId: string
  turnId: string
  role: "user" | "assistant" | "tool"
  content: string
  contentTruncated: boolean
  contentStartCodePoint: number
  contentCodePointLength: number
  createdAt: number
}

type DurableSourceItemRef = Omit<SourceItemWithText, "content">

export type FutureAttentionSourceReadOutcome = {
  ok: true
  concernId: string
  source: SourceItemWithText
  previousAssistant?: SourceItemWithText
}

export type FutureAttentionSourceReadReceipt = {
  ok: true
  concernId: string
  source: DurableSourceItemRef
  previousAssistant?: DurableSourceItemRef
}

export type FutureAttentionInspectionOutcome = ReturnType<typeof readRecentFutureAttention> & {
  ok: true
}

export type FutureAttentionToolOutcome =
  | FutureAttentionMutationSuccess
  | FutureAttentionSupersedeSuccess
  | FutureAttentionInspectionOutcome
  | FutureAttentionSourceReadOutcome
  | FutureAttentionToolFailure

export type FutureAttentionDurableOutcome =
  | FutureAttentionMutationSuccess
  | FutureAttentionSupersedeSuccess
  | FutureAttentionInspectionOutcome
  | FutureAttentionSourceReadReceipt
  | FutureAttentionToolFailure

export type FutureAttentionToolExecution = {
  outcome: FutureAttentionToolOutcome
  durableOutcome: FutureAttentionDurableOutcome
}

type InvocationRow = {
  invocation_id: string
  tool_name: string
  input_json: string
  status: "running" | "completed" | "failed"
  result_json: string | null
  error_json: string | null
  created_at: number
  model_operation_id: string
  sampled_at: number
  context_json: string
  model_status: "running" | "completed" | "failed"
  turn_id: string
  turn_status: "running" | "completed" | "failed" | "interrupted" | "exhausted"
  cause_item_id: string
  cause_content: string
  cause_created_at: number
}

type PersistedAgendaContext = {
  activeTarget: CourseItemTargetRef | null
  concerns: FutureAttentionContextConcern[]
}

export function executeFutureAttentionTool(
  database: Database,
  input: { invocationId: string; executedAt: number },
): FutureAttentionToolExecution {
  assertExecutionInput(input)
  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalExecution(database, invocation)
    if (terminal) return terminal
    if (!AGENDA_TOOL_NAMES.has(invocation.tool_name)) {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "invalid_input",
        message: `Unknown Agenda tool: ${invocation.tool_name}`,
      })
    }
    if (input.executedAt < invocation.created_at) {
      throw new Error("Agenda tool execution cannot precede its invocation")
    }
    if (input.executedAt < readLatestTurnEventAt(database, invocation.turn_id)) {
      throw new Error("Agenda tool execution cannot precede the latest Turn event")
    }
    if (invocation.turn_status !== "running" || invocation.model_status !== "running") {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "illegal_transition",
        message: "Agenda tool cannot execute after its Turn or model operation ended",
      })
    }

    try {
      switch (invocation.tool_name) {
        case CREATE_FUTURE_ATTENTION_TOOL:
          return executeCreate(database, invocation, input.executedAt)
        case ADDRESS_FUTURE_ATTENTION_TOOL:
          return executeAddress(database, invocation, input.executedAt)
        case READ_FUTURE_ATTENTION_SOURCE_TOOL:
          return executeSourceRead(database, invocation, input.executedAt)
        case INSPECT_RECENT_FUTURE_ATTENTION_TOOL:
          return executeRecentInspection(database, invocation, input.executedAt)
        case DISMISS_FUTURE_ATTENTION_TOOL:
          return executeDismiss(database, invocation, input.executedAt)
        case SUPERSEDE_FUTURE_ATTENTION_TOOL:
          return executeSupersede(database, invocation, input.executedAt)
        case REOPEN_FUTURE_ATTENTION_TOOL:
          return executeReopen(database, invocation, input.executedAt)
        default:
          throw new ToolCommandError("invalid_input", `Unknown Agenda tool: ${invocation.tool_name}`)
      }
    } catch (error) {
      if (error instanceof ToolCommandError || error instanceof FutureAttentionCommandError) {
        return settleFailure(database, invocation, input.executedAt, {
          ok: false,
          code: error.code,
          message: error.message,
        })
      }
      throw error
    }
  }).immediate()
}

function executeCreate(database: Database, invocation: InvocationRow, executedAt: number) {
  const context = readPersistedAgendaContext(invocation)
  if (!context.activeTarget) {
    throw new ToolCommandError(
      "invalid_context",
      "Future attention creation requires an active course in the persisted context cut",
    )
  }
  const toolInput = parseCreateInput(invocation.input_json)
  const created = createFutureAttentionConcern(database, {
    effectId: `effect:agenda:${randomUUID()}`,
    concernId: `agenda:${randomUUID()}`,
    causeItemId: invocation.cause_item_id,
    modelOperationId: invocation.model_operation_id,
    target: context.activeTarget,
    authorship: toolInput.authorship,
    reason: toolInput.reason,
    ...(toolInput.learnerRoleConstraint === undefined
      ? {}
      : { learnerRoleConstraint: toolInput.learnerRoleConstraint }),
    notBefore: toolInput.notBefore,
    occurredAt: executedAt,
  })
  const outcome: FutureAttentionMutationSuccess = {
    ok: true,
    disposition: created.replayed ? "already_applied" : "applied",
    operationEffectId: created.operationEffectId,
    operationRevision: created.operationRevision,
    currentRevision: readSystemState(database).revision,
    concern: concernReceipt(created.concern),
  }
  settleSuccess(database, invocation, executedAt, outcome, created.operationEffectId)
  return { outcome, durableOutcome: outcome }
}

function executeAddress(database: Database, invocation: InvocationRow, executedAt: number) {
  const toolInput = parseAddressInput(invocation.input_json)
  const context = readPersistedAgendaContext(invocation)
  const visible = requireOpenConcernCapability(
    database,
    invocation,
    context,
    toolInput.concernId,
  )
  if (visible.targetState !== "current") {
    throw new ToolCommandError(
      "stale_course_context",
      "A concern targeting a superseded Course View must be reconciled, not addressed",
    )
  }
  const addressed = addressFutureAttentionConcern(database, {
    effectId: `effect:agenda:${randomUUID()}`,
    causeItemId: invocation.cause_item_id,
    modelOperationId: invocation.model_operation_id,
    concernId: visible.id,
    expectedVersion: visible.version,
    serviceOccurrenceItemId: invocation.cause_item_id,
    alignmentRationale: toolInput.alignmentRationale,
    occurredAt: executedAt,
  })
  const outcome: FutureAttentionMutationSuccess = {
    ok: true,
    disposition: addressed.replayed ? "already_applied" : "applied",
    operationEffectId: addressed.operationEffectId,
    operationRevision: addressed.operationRevision,
    currentRevision: readSystemState(database).revision,
    concern: concernReceipt(addressed.concern),
  }
  settleSuccess(database, invocation, executedAt, outcome, addressed.operationEffectId)
  return { outcome, durableOutcome: outcome }
}

function executeSourceRead(database: Database, invocation: InvocationRow, executedAt: number) {
  const toolInput = parseConcernOnlyInput(invocation.input_json)
  const context = readPersistedAgendaContext(invocation)
  requireConcernCapability(database, invocation, context, toolInput.concernId)
  const source = readFutureAttentionSource(database, toolInput.concernId)
  const outcome: FutureAttentionSourceReadOutcome = { ok: true, ...source }
  const durableOutcome = durableSourceReceipt(outcome)
  settleSuccess(database, invocation, executedAt, durableOutcome)
  return { outcome, durableOutcome }
}

function executeRecentInspection(
  database: Database,
  invocation: InvocationRow,
  executedAt: number,
) {
  const context = readPersistedAgendaContext(invocation)
  if (!context.activeTarget) {
    throw new ToolCommandError(
      "invalid_context",
      "Recent Agenda inspection requires an active course in persisted context",
    )
  }
  const toolInput = parseInspectionInput(invocation.input_json)
  const inspected = readRecentFutureAttention(database, {
    activeCourseId: context.activeTarget.courseId,
    at: executedAt,
    offset: toolInput.offset,
    limit: toolInput.limit,
  })
  const outcome: FutureAttentionInspectionOutcome = { ok: true, ...inspected }
  settleSuccess(database, invocation, executedAt, outcome)
  return { outcome, durableOutcome: outcome }
}

function executeDismiss(database: Database, invocation: InvocationRow, executedAt: number) {
  const toolInput = parseDismissInput(invocation.input_json)
  const context = readPersistedAgendaContext(invocation)
  const visible = requireOpenConcernCapability(
    database,
    invocation,
    context,
    toolInput.concernId,
  )
  const dismissed = dismissFutureAttentionConcern(database, {
    effectId: `effect:agenda:${randomUUID()}`,
    causeItemId: invocation.cause_item_id,
    modelOperationId: invocation.model_operation_id,
    concernId: visible.id,
    expectedVersion: visible.version,
    learnerRequestExcerpt: toolInput.learnerRequestExcerpt,
    rationale: toolInput.rationale,
    occurredAt: executedAt,
  })
  const outcome: FutureAttentionMutationSuccess = {
    ok: true,
    disposition: dismissed.replayed ? "already_applied" : "applied",
    operationEffectId: dismissed.operationEffectId,
    operationRevision: dismissed.operationRevision,
    currentRevision: readSystemState(database).revision,
    concern: concernReceipt(dismissed.concern),
  }
  settleSuccess(database, invocation, executedAt, outcome, dismissed.operationEffectId)
  return { outcome, durableOutcome: outcome }
}

function executeSupersede(database: Database, invocation: InvocationRow, executedAt: number) {
  const toolInput = parseSupersedeInput(invocation.input_json)
  const context = readPersistedAgendaContext(invocation)
  const visible = requireOpenConcernCapability(
    database,
    invocation,
    context,
    toolInput.concernId,
  )
  if (!context.activeTarget) {
    throw new ToolCommandError(
      "invalid_context",
      "Future-attention supersession requires an active course target in persisted context",
    )
  }
  const replacementTarget: CourseItemTargetRef = visible.targetState === "current"
    ? {
        courseId: visible.target.courseId,
        courseViewRevisionId: visible.target.courseViewRevisionId,
        courseItemId: visible.target.courseItemId,
      }
    : context.activeTarget
  const superseded = supersedeFutureAttentionConcern(database, {
    effectId: `effect:agenda:${randomUUID()}`,
    successorConcernId: `agenda:${randomUUID()}`,
    causeItemId: invocation.cause_item_id,
    modelOperationId: invocation.model_operation_id,
    concernId: visible.id,
    expectedVersion: visible.version,
    learnerRequestExcerpt: toolInput.learnerRequestExcerpt,
    target: replacementTarget,
    replacementReason: toolInput.replacementReason,
    ...(toolInput.replacementLearnerRoleConstraint === undefined
      ? {}
      : {
          replacementLearnerRoleConstraint:
            toolInput.replacementLearnerRoleConstraint,
        }),
    replacementNotBefore: toolInput.replacementNotBefore,
    rationale: toolInput.rationale,
    occurredAt: executedAt,
  })
  const outcome: FutureAttentionSupersedeSuccess = {
    ok: true,
    disposition: superseded.replayed ? "already_applied" : "applied",
    operationEffectId: superseded.operationEffectId,
    operationRevision: superseded.operationRevision,
    currentRevision: readSystemState(database).revision,
    previous: concernReceipt(superseded.previous),
    successor: concernReceipt(superseded.successor),
  }
  settleSuccess(database, invocation, executedAt, outcome, superseded.operationEffectId)
  return { outcome, durableOutcome: outcome }
}

function executeReopen(database: Database, invocation: InvocationRow, executedAt: number) {
  const toolInput = parseReopenInput(invocation.input_json)
  const context = readPersistedAgendaContext(invocation)
  if (!context.activeTarget) {
    throw new ToolCommandError(
      "invalid_context",
      "Agenda reopen requires an active course in persisted context",
    )
  }
  const inspected = requireInspectedConcern(
    database,
    invocation,
    toolInput.concernId,
  )
  if (inspected.target.courseId !== context.activeTarget.courseId) {
    throw new ToolCommandError(
      "invalid_context",
      "Inspected Agenda concern is outside the current active course",
    )
  }
  const reopened = reopenFutureAttentionConcern(database, {
    effectId: `effect:agenda:${randomUUID()}`,
    causeItemId: invocation.cause_item_id,
    modelOperationId: invocation.model_operation_id,
    concernId: inspected.id,
    expectedVersion: inspected.version,
    learnerRequestExcerpt: toolInput.learnerRequestExcerpt,
    rationale: toolInput.rationale,
    occurredAt: executedAt,
  })
  const outcome: FutureAttentionMutationSuccess = {
    ok: true,
    disposition: reopened.replayed ? "already_applied" : "applied",
    operationEffectId: reopened.operationEffectId,
    operationRevision: reopened.operationRevision,
    currentRevision: readSystemState(database).revision,
    concern: concernReceipt(reopened.concern),
  }
  settleSuccess(database, invocation, executedAt, outcome, reopened.operationEffectId)
  return { outcome, durableOutcome: outcome }
}

function concernReceipt(concern: FutureAttentionConcern): FutureAttentionConcernReceipt {
  return {
    id: concern.id,
    status: concern.status,
    version: concern.version,
    ...(concern.learnerRoleConstraint === undefined
      ? {}
      : { learnerRoleConstraint: concern.learnerRoleConstraint }),
    ...(concern.successorConcernId
      ? { successorConcernId: concern.successorConcernId }
      : {}),
  }
}

function durableSourceReceipt(
  outcome: FutureAttentionSourceReadOutcome,
): FutureAttentionSourceReadReceipt {
  return {
    ok: true,
    concernId: outcome.concernId,
    source: stripContent(outcome.source),
    ...(outcome.previousAssistant
      ? { previousAssistant: stripContent(outcome.previousAssistant) }
      : {}),
  }
}

function stripContent(item: SourceItemWithText): DurableSourceItemRef {
  const { content: _content, ...reference } = item
  return reference
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
        model.sampled_at,
        model.context_json,
        model.status AS model_status,
        turn.turn_id,
        turn.status AS turn_status,
        source.item_id AS cause_item_id,
        source.content AS cause_content,
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
  if (!row) throw new Error(`Unknown Agenda tool invocation: ${invocationId}`)
  return row
}

function terminalExecution(
  database: Database,
  invocation: InvocationRow,
): FutureAttentionToolExecution | undefined {
  if (invocation.status === "failed") {
    if (invocation.error_json === null) throw new Error("Failed Agenda tool has no error")
    const failure = JSON.parse(invocation.error_json) as FutureAttentionToolFailure
    return { outcome: failure, durableOutcome: failure }
  }
  if (invocation.status !== "completed") return undefined
  if (invocation.result_json === null) throw new Error("Completed Agenda tool has no result")
  const durableOutcome = JSON.parse(invocation.result_json) as FutureAttentionDurableOutcome
  if (!durableOutcome.ok) return { outcome: durableOutcome, durableOutcome }
  if (invocation.tool_name === INSPECT_RECENT_FUTURE_ATTENTION_TOOL) {
    if (!("concerns" in durableOutcome)) {
      throw new Error("Completed Agenda inspection has no concern page")
    }
    return { outcome: durableOutcome, durableOutcome }
  }
  if (invocation.tool_name !== READ_FUTURE_ATTENTION_SOURCE_TOOL) {
    if (!("operationEffectId" in durableOutcome)) {
      throw new Error("Completed Agenda mutation has no operation effect")
    }
    return { outcome: durableOutcome, durableOutcome }
  }
  if (!("source" in durableOutcome)) {
    throw new Error("Completed Agenda source read has no source receipt")
  }
  const outcome: FutureAttentionSourceReadOutcome = {
    ok: true,
    concernId: durableOutcome.concernId,
    source: restoreSourceItem(database, durableOutcome.source),
    ...(durableOutcome.previousAssistant
      ? { previousAssistant: restoreSourceItem(database, durableOutcome.previousAssistant) }
      : {}),
  }
  return { outcome, durableOutcome }
}

function restoreSourceItem(database: Database, reference: DurableSourceItemRef) {
  const row = database
    .query(`
      SELECT item_id, session_id, turn_id, role, content, created_at
      FROM session_item
      WHERE item_id = ?1
    `)
    .get(reference.itemId) as
    | {
        item_id: string
        session_id: string
        turn_id: string
        role: "user" | "assistant" | "tool"
        content: string
        created_at: number
      }
    | null
  if (
    !row ||
    row.session_id !== reference.sessionId ||
    row.turn_id !== reference.turnId ||
    row.role !== reference.role ||
    row.created_at !== reference.createdAt
  ) {
    throw new Error(`Agenda source receipt no longer resolves exactly: ${reference.itemId}`)
  }
  const codePoints = Array.from(row.content)
  if (
    !Number.isSafeInteger(reference.contentStartCodePoint) ||
    !Number.isSafeInteger(reference.contentCodePointLength) ||
    reference.contentStartCodePoint < 0 ||
    reference.contentCodePointLength < 0 ||
    reference.contentStartCodePoint + reference.contentCodePointLength > codePoints.length
  ) {
    throw new Error(`Agenda source projection receipt is invalid: ${reference.itemId}`)
  }
  const content = codePoints
    .slice(
      reference.contentStartCodePoint,
      reference.contentStartCodePoint + reference.contentCodePointLength,
    )
    .join("")
  const truncated = reference.contentCodePointLength < codePoints.length
  if (truncated !== reference.contentTruncated) {
    throw new Error(`Agenda source truncation receipt changed: ${reference.itemId}`)
  }
  return {
    itemId: row.item_id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    role: row.role,
    content,
    contentTruncated: truncated,
    contentStartCodePoint: reference.contentStartCodePoint,
    contentCodePointLength: reference.contentCodePointLength,
    createdAt: row.created_at,
  }
}

function readPersistedAgendaContext(invocation: InvocationRow): PersistedAgendaContext {
  const raw = JSON.parse(invocation.context_json) as unknown
  const context = expectObject(raw, "Persisted Tutor context")
  const activeTarget = parseActiveTarget(context.activeCourse)
  const futureAttention = expectObject(
    context.futureAttention,
    "Persisted future-attention context contribution",
    "invalid_context",
  )
  if (!Array.isArray(futureAttention.concerns)) {
    throw new ToolCommandError(
      "invalid_context",
      "Persisted future-attention context has no bounded concern list",
    )
  }
  return {
    activeTarget,
    concerns: futureAttention.concerns.map(parseVisibleConcern),
  }
}

function parseActiveTarget(value: unknown): CourseItemTargetRef | null {
  if (value === null) return null
  const course = expectObject(value, "Persisted active course", "invalid_context")
  const route = expectObject(course.route, "Persisted active course route", "invalid_context")
  const anchor = expectObject(route.anchor, "Persisted active course anchor", "invalid_context")
  if (
    typeof course.courseId !== "string" ||
    typeof course.courseViewRevisionId !== "string" ||
    typeof anchor.itemId !== "string"
  ) {
    throw new ToolCommandError("invalid_context", "Persisted active course target is incomplete")
  }
  return {
    courseId: course.courseId,
    courseViewRevisionId: course.courseViewRevisionId,
    courseItemId: anchor.itemId,
  }
}

function parseVisibleConcern(value: unknown): FutureAttentionContextConcern {
  const concern = expectObject(value, "Persisted Agenda concern", "invalid_context")
  if (
    typeof concern.id !== "string" ||
    !Number.isSafeInteger(concern.version) ||
    (concern.targetState !== "current" && concern.targetState !== "superseded_view")
  ) {
    throw new ToolCommandError("invalid_context", "Persisted Agenda concern is incomplete")
  }
  return concern as FutureAttentionContextConcern
}

function requireConcernCapability(
  database: Database,
  invocation: InvocationRow,
  context: PersistedAgendaContext,
  concernId: string,
): FutureAttentionContextConcern | FutureAttentionInspectionConcern {
  const concern = context.concerns.find((candidate) => candidate.id === concernId)
    ?? requireInspectedConcern(database, invocation, concernId)
  if (!context.activeTarget || concern.target.courseId !== context.activeTarget.courseId) {
    throw new ToolCommandError(
      "invalid_context",
      "Agenda concern capability is outside the current active course",
    )
  }
  return concern
}

function requireOpenConcernCapability(
  database: Database,
  invocation: InvocationRow,
  context: PersistedAgendaContext,
  concernId: string,
) {
  const concern = requireConcernCapability(database, invocation, context, concernId)
  if ("status" in concern && concern.status !== "open") {
    throw new ToolCommandError(
      "stale_agenda_concern",
      `Inspected Agenda concern is no longer open: ${concern.id}`,
    )
  }
  return concern
}

function requireInspectedConcern(
  database: Database,
  invocation: InvocationRow,
  concernId: string,
) {
  const rows = database
    .query(`
      SELECT inspected.result_json
      FROM tool_invocation AS inspected
      JOIN model_operation AS model
        ON model.model_operation_id = inspected.model_operation_id
      WHERE model.turn_id = ?1
        AND inspected.tool_name = ?2
        AND inspected.status = 'completed'
        AND inspected.settled_at IS NOT NULL
        AND inspected.model_operation_id <> ?3
        AND inspected.settled_at <= ?4
      ORDER BY inspected.settled_at DESC, inspected.invocation_id ASC
    `)
    .all(
      invocation.turn_id,
      INSPECT_RECENT_FUTURE_ATTENTION_TOOL,
      invocation.model_operation_id,
      invocation.sampled_at,
    ) as Array<{ result_json: string }>
  for (const row of rows) {
    const result = JSON.parse(row.result_json) as FutureAttentionInspectionOutcome
    if (!result.ok || !Array.isArray(result.concerns)) continue
    const concern = result.concerns.find((candidate) => candidate.id === concernId)
    if (concern) return concern
  }
  throw new ToolCommandError(
    "invalid_context",
    `Agenda concern was not granted by an inspection visible to this model context: ${concernId}`,
  )
}

function parseCreateInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectAllowedKeys(object, ["authorship", "learnerRoleConstraint", "notBefore", "reason"])
  const learnerRoleConstraint = parseLearnerRoleConstraint(object.learnerRoleConstraint)
  const authorship = expectObject(object.authorship, "authorship")
  if (authorship.kind === "learner_requested") {
    expectExactKeys(authorship, ["kind", "learnerRequestExcerpt"])
    return {
      authorship: {
        kind: "learner_requested" as const,
        learnerRequestExcerpt: boundedString(
          authorship.learnerRequestExcerpt,
          "authorship.learnerRequestExcerpt",
          MAX_EXCERPT_CODE_POINTS,
        ),
      },
      reason: boundedString(object.reason, "reason", MAX_REASON_CODE_POINTS),
      ...(learnerRoleConstraint === undefined ? {} : { learnerRoleConstraint }),
      notBefore: explicitOffsetTimestamp(object.notBefore, "notBefore"),
    }
  }
  if (authorship.kind === "tutor_initiated") {
    expectExactKeys(authorship, ["kind"])
    return {
      authorship: { kind: "tutor_initiated" as const },
      reason: boundedString(object.reason, "reason", MAX_REASON_CODE_POINTS),
      ...(learnerRoleConstraint === undefined ? {} : { learnerRoleConstraint }),
      notBefore: explicitOffsetTimestamp(object.notBefore, "notBefore"),
    }
  }
  throw new ToolCommandError("invalid_input", "Unknown future-attention authorship")
}

function parseAddressInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectExactKeys(object, ["alignmentRationale", "concernId"])
  return {
    concernId: boundedString(object.concernId, "concernId", 500),
    alignmentRationale: boundedString(
      object.alignmentRationale,
      "alignmentRationale",
      MAX_RATIONALE_CODE_POINTS,
    ),
  }
}

function parseConcernOnlyInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectExactKeys(object, ["concernId"])
  return { concernId: boundedString(object.concernId, "concernId", 500) }
}

function parseInspectionInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectAllowedKeys(object, ["limit", "offset"])
  const offset = object.offset ?? 0
  const limit = object.limit ?? 10
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new ToolCommandError("invalid_input", "offset must be a non-negative integer")
  }
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 20) {
    throw new ToolCommandError("invalid_input", "limit must be an integer from 1 to 20")
  }
  return { offset: offset as number, limit: limit as number }
}

function parseReopenInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectExactKeys(object, ["concernId", "learnerRequestExcerpt", "rationale"])
  return {
    concernId: boundedString(object.concernId, "concernId", 500),
    learnerRequestExcerpt: boundedString(
      object.learnerRequestExcerpt,
      "learnerRequestExcerpt",
      MAX_EXCERPT_CODE_POINTS,
    ),
    rationale: boundedString(object.rationale, "rationale", MAX_RATIONALE_CODE_POINTS),
  }
}

function parseDismissInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectExactKeys(object, ["concernId", "learnerRequestExcerpt", "rationale"])
  return {
    concernId: boundedString(object.concernId, "concernId", 500),
    learnerRequestExcerpt: boundedString(
      object.learnerRequestExcerpt,
      "learnerRequestExcerpt",
      MAX_EXCERPT_CODE_POINTS,
    ),
    rationale: boundedString(object.rationale, "rationale", MAX_RATIONALE_CODE_POINTS),
  }
}

function parseSupersedeInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectAllowedKeys(object, [
    "concernId",
    "learnerRequestExcerpt",
    "rationale",
    "replacementLearnerRoleConstraint",
    "replacementNotBefore",
    "replacementReason",
  ])
  const replacementLearnerRoleConstraint = parseLearnerRoleConstraint(
    object.replacementLearnerRoleConstraint,
  )
  return {
    concernId: boundedString(object.concernId, "concernId", 500),
    learnerRequestExcerpt: boundedString(
      object.learnerRequestExcerpt,
      "learnerRequestExcerpt",
      MAX_EXCERPT_CODE_POINTS,
    ),
    rationale: boundedString(object.rationale, "rationale", MAX_RATIONALE_CODE_POINTS),
    replacementNotBefore: explicitOffsetTimestamp(
      object.replacementNotBefore,
      "replacementNotBefore",
    ),
    replacementReason: boundedString(
      object.replacementReason,
      "replacementReason",
      MAX_REASON_CODE_POINTS,
    ),
    ...(replacementLearnerRoleConstraint === undefined
      ? {}
      : { replacementLearnerRoleConstraint }),
  }
}

function parseLearnerRoleConstraint(value: unknown) {
  if (value === undefined) return undefined
  const constraint = expectObject(value, "learnerRoleConstraint")
  expectExactKeys(constraint, ["kind"])
  if (constraint.kind !== "learner_response_before_tutor_disclosure") {
    throw new ToolCommandError(
      "invalid_input",
      "Unknown future-attention learner-role constraint",
    )
  }
  return { kind: constraint.kind } as const
}

function parseInputObject(inputJson: string) {
  try {
    return expectObject(JSON.parse(inputJson) as unknown, "Agenda tool input")
  } catch (error) {
    if (error instanceof ToolCommandError) throw error
    throw new ToolCommandError("invalid_input", "Agenda tool input is not valid JSON")
  }
}

function expectObject(
  value: unknown,
  label: string,
  code: FutureAttentionToolFailure["code"] = "invalid_input",
) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolCommandError(code, `${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function expectExactKeys(object: Record<string, unknown>, expected: readonly string[]) {
  const expectedKeys = new Set(expected)
  const actual = Object.keys(object)
  if (
    actual.length !== expectedKeys.size ||
    actual.some((key) => !expectedKeys.has(key)) ||
    expected.some((key) => !(key in object))
  ) {
    throw new ToolCommandError(
      "invalid_input",
      `Agenda tool input keys must be exactly: ${expected.join(", ")}`,
    )
  }
}

function expectAllowedKeys(object: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed)
  if (Object.keys(object).some((key) => !allowedKeys.has(key))) {
    throw new ToolCommandError(
      "invalid_input",
      `Agenda tool input keys may only be: ${allowed.join(", ")}`,
    )
  }
}

function boundedString(value: unknown, label: string, maxCodePoints: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolCommandError("invalid_input", `${label} must be a non-empty string`)
  }
  const normalized = value.trim()
  if (Array.from(normalized).length > maxCodePoints) {
    throw new ToolCommandError(
      "invalid_input",
      `${label} must not exceed ${maxCodePoints} Unicode code points`,
    )
  }
  return normalized
}

function explicitOffsetTimestamp(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new ToolCommandError(
      "invalid_input",
      `${label} must be an ISO-8601 timestamp with an explicit UTC offset`,
    )
  }
  const match = EXPLICIT_OFFSET_TIMESTAMP_PATTERN.exec(value)
  if (!match) {
    throw new ToolCommandError(
      "invalid_input",
      `${label} must be an ISO-8601 timestamp with an explicit UTC offset`,
    )
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[8] === undefined ? 0 : Number(match[8])
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9])
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new ToolCommandError("invalid_input", `${label} contains an invalid civil date or time`)
  }
  const timestamp = Date.parse(value)
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new ToolCommandError("invalid_input", `${label} is not a valid non-negative timestamp`)
  }
  return timestamp
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function settleSuccess(
  database: Database,
  invocation: InvocationRow,
  settledAt: number,
  durableOutcome: FutureAttentionDurableOutcome,
  effectId?: string,
) {
  const updated = database
    .query(`
      UPDATE tool_invocation
      SET status = 'completed', effect_id = ?1, result_json = ?2, settled_at = ?3
      WHERE invocation_id = ?4 AND status = 'running'
    `)
    .run(
      effectId ?? null,
      canonicalJson(durableOutcome),
      settledAt,
      invocation.invocation_id,
    )
  if (updated.changes !== 1) {
    throw new Error(`Agenda tool changed before success settlement: ${invocation.invocation_id}`)
  }
}

function settleFailure(
  database: Database,
  invocation: InvocationRow,
  settledAt: number,
  failure: FutureAttentionToolFailure,
): FutureAttentionToolExecution {
  const updated = database
    .query(`
      UPDATE tool_invocation
      SET status = 'failed', error_json = ?1, settled_at = ?2
      WHERE invocation_id = ?3 AND status = 'running'
    `)
    .run(canonicalJson(failure), settledAt, invocation.invocation_id)
  if (updated.changes !== 1) {
    throw new Error(`Agenda tool changed before failure settlement: ${invocation.invocation_id}`)
  }
  return { outcome: failure, durableOutcome: failure }
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

class ToolCommandError extends Error {
  readonly code: FutureAttentionToolFailure["code"]

  constructor(code: FutureAttentionToolFailure["code"], message: string) {
    super(message)
    this.name = "ToolCommandError"
    this.code = code
  }
}
