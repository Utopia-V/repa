import type { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"
import { readLatestTurnEventAt } from "../../interaction/records"
import { canonicalJson } from "../../storage/canonical-json"
import { readSystemState } from "../../storage/system-state"
import {
  parseStrictOffsetTimestamp,
  StrictOffsetTimestampError,
} from "../../time/strict-offset-timestamp"
import {
  AssignmentCommandError,
  cancelAssignment,
  completeAssignment,
  createAssignment,
  inspectAssignments,
  readAssignmentSource,
  readAssignmentRevisionIndex,
  reopenAssignment,
  replayAssignmentTransition,
  reviseAssignment,
  type Assignment,
  type AssignmentInspectionItem,
} from "./assignment"

export const CREATE_ASSIGNMENT_TOOL = "create_assignment"
export const INSPECT_ASSIGNMENTS_TOOL = "inspect_assignments"
export const READ_ASSIGNMENT_SOURCE_TOOL = "read_assignment_source"
export const REVISE_ASSIGNMENT_TOOL = "revise_assignment"
export const COMPLETE_ASSIGNMENT_TOOL = "complete_assignment"
export const CANCEL_ASSIGNMENT_TOOL = "cancel_assignment"
export const REOPEN_ASSIGNMENT_TOOL = "reopen_assignment"

export type AssignmentToolName =
  | typeof CREATE_ASSIGNMENT_TOOL
  | typeof INSPECT_ASSIGNMENTS_TOOL
  | typeof READ_ASSIGNMENT_SOURCE_TOOL
  | typeof REVISE_ASSIGNMENT_TOOL
  | typeof COMPLETE_ASSIGNMENT_TOOL
  | typeof CANCEL_ASSIGNMENT_TOOL
  | typeof REOPEN_ASSIGNMENT_TOOL

const ASSIGNMENT_TOOL_NAMES = new Set<AssignmentToolName>([
  CREATE_ASSIGNMENT_TOOL,
  INSPECT_ASSIGNMENTS_TOOL,
  READ_ASSIGNMENT_SOURCE_TOOL,
  REVISE_ASSIGNMENT_TOOL,
  COMPLETE_ASSIGNMENT_TOOL,
  CANCEL_ASSIGNMENT_TOOL,
  REOPEN_ASSIGNMENT_TOOL,
])

const MAX_TITLE_CODE_POINTS = 500
const MAX_EXCERPT_CODE_POINTS = 1_000
const MAX_RATIONALE_CODE_POINTS = 800

export type AssignmentToolFailure = Readonly<{
  ok: false
  code:
    | "invalid_input"
    | "invalid_context"
    | "semantic_conflict"
    | "stale_assignment"
    | "illegal_transition"
    | "turn_terminated"
    | "turn_exhausted"
    | "runtime_restarted"
  message: string
}>

export type AssignmentReceipt = Readonly<{
  id: string
  status: Assignment["status"]
  version: number
  title: string
  dueAt: number
  dueAtIso: string
}>

export type AssignmentMutationSuccess = Readonly<{
  ok: true
  disposition: "applied" | "already_applied"
  operationEffectId: string
  operationRevision: number
  currentRevision: number
  assignment: AssignmentReceipt
}>

export type AssignmentInspectionSuccess = ReturnType<typeof inspectAssignments> & {
  ok: true
}

type AssignmentSourceOutcome = ReturnType<typeof readAssignmentSource> & {
  ok: true
  revisionIndex: ReturnType<typeof readAssignmentRevisionIndex>
}

type AssignmentSourceReceipt = Omit<AssignmentSourceOutcome, "content">

export type AssignmentToolOutcome =
  | AssignmentMutationSuccess
  | AssignmentInspectionSuccess
  | AssignmentSourceOutcome
  | AssignmentToolFailure

export type AssignmentDurableOutcome =
  | AssignmentMutationSuccess
  | AssignmentInspectionSuccess
  | AssignmentSourceReceipt
  | AssignmentToolFailure

export type AssignmentToolExecution = Readonly<{
  outcome: AssignmentToolOutcome
  durableOutcome: AssignmentDurableOutcome
}>

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
  time_zone: string
  context_json: string
  model_status: "running" | "completed" | "failed"
  turn_id: string
  turn_status: "running" | "completed" | "failed" | "interrupted" | "exhausted"
  cause_item_id: string
}

type AssignmentCapability = Pick<AssignmentInspectionItem, "id" | "version">

export function executeAssignmentTool(
  database: Database,
  input: { invocationId: string; executedAt: number },
): AssignmentToolExecution {
  assertExecutionInput(input)
  return database.transaction(() => {
    const invocation = readInvocation(database, input.invocationId)
    const terminal = terminalExecution(database, invocation)
    if (terminal) return terminal
    if (!ASSIGNMENT_TOOL_NAMES.has(invocation.tool_name as AssignmentToolName)) {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "invalid_input",
        message: `Unknown Assignment tool: ${invocation.tool_name}`,
      })
    }
    if (input.executedAt < invocation.created_at) {
      throw new Error("Assignment tool execution cannot precede its invocation")
    }
    if (input.executedAt < readLatestTurnEventAt(database, invocation.turn_id)) {
      throw new Error("Assignment tool execution cannot precede the latest Turn event")
    }
    if (invocation.turn_status !== "running" || invocation.model_status !== "running") {
      return settleFailure(database, invocation, input.executedAt, {
        ok: false,
        code: "illegal_transition",
        message: "Assignment tool cannot execute after its Turn or model operation ended",
      })
    }

    try {
      switch (invocation.tool_name as AssignmentToolName) {
        case CREATE_ASSIGNMENT_TOOL:
          return executeCreate(database, invocation, input.executedAt)
        case INSPECT_ASSIGNMENTS_TOOL:
          return executeInspection(database, invocation, input.executedAt)
        case READ_ASSIGNMENT_SOURCE_TOOL:
          return executeSourceRead(database, invocation, input.executedAt)
        case REVISE_ASSIGNMENT_TOOL:
          return executeRevise(database, invocation, input.executedAt)
        case COMPLETE_ASSIGNMENT_TOOL:
          return executeComplete(database, invocation, input.executedAt)
        case CANCEL_ASSIGNMENT_TOOL:
          return executeCancel(database, invocation, input.executedAt)
        case REOPEN_ASSIGNMENT_TOOL:
          return executeReopen(database, invocation, input.executedAt)
      }
    } catch (error) {
      if (error instanceof AssignmentCommandError || error instanceof ToolCommandError) {
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
  const toolInput = parseCreateInput(invocation.input_json, invocation.time_zone)
  const created = createAssignment(database, {
    effectId: `effect:assignment:${randomUUID()}`,
    assignmentId: `assignment:${randomUUID()}`,
    causeItemId: invocation.cause_item_id,
    modelOperationId: invocation.model_operation_id,
    sourceExcerpt: toolInput.sourceExcerpt,
    title: toolInput.title,
    dueAt: toolInput.dueAt,
    dueAtIso: toolInput.dueAtIso,
    interpretationTimeZone: invocation.time_zone,
    admissionRationale: toolInput.admissionRationale,
    occurredAt: executedAt,
  })
  return settleMutation(database, invocation, executedAt, created)
}

function executeInspection(database: Database, invocation: InvocationRow, executedAt: number) {
  const input = parseInspectionInput(invocation.input_json)
  const outcome: AssignmentInspectionSuccess = {
    ok: true,
    ...inspectAssignments(database, { ...input, at: executedAt }),
  }
  settleSuccess(database, invocation, executedAt, outcome)
  return { outcome, durableOutcome: outcome }
}

function executeSourceRead(database: Database, invocation: InvocationRow, executedAt: number) {
  const input = parseSourceReadInput(invocation.input_json)
  const capability = requireAssignmentCapability(database, invocation, input.assignmentId)
  const version = input.version ?? capability.version
  if (version > capability.version) {
    throw new ToolCommandError(
      "invalid_context",
      `Assignment source version was not visible to this model context: ${input.assignmentId}@${version}`,
    )
  }
  const source = readAssignmentSource(database, {
    assignmentId: capability.id,
    version,
    offset: input.offset,
    limit: input.limit,
  })
  const revisionIndex = readAssignmentRevisionIndex(database, {
    assignmentId: capability.id,
    throughVersion: capability.version,
    offset: input.revisionOffset,
    limit: input.revisionLimit,
  })
  const outcome: AssignmentSourceOutcome = { ok: true, ...source, revisionIndex }
  const { content: _content, ...durableOutcome } = outcome
  settleSuccess(database, invocation, executedAt, durableOutcome)
  return { outcome, durableOutcome }
}

function executeRevise(database: Database, invocation: InvocationRow, executedAt: number) {
  const input = parseMetadataMutationInput(invocation.input_json, invocation.time_zone, true)
  const meaning = assignmentTransitionMeaning(invocation, input)
  const replay = replayAssignmentTransition(database, "revise", meaning)
  if (replay) return settleMutation(database, invocation, executedAt, replay)
  const capability = requireAssignmentCapability(database, invocation, input.assignmentId)
  const revised = reviseAssignment(database, {
    effectId: `effect:assignment:${randomUUID()}`,
    ...meaning,
    assignmentId: capability.id,
    expectedVersion: capability.version,
    occurredAt: executedAt,
  })
  return settleMutation(database, invocation, executedAt, revised)
}

function executeComplete(database: Database, invocation: InvocationRow, executedAt: number) {
  const input = parseDispositionInput(invocation.input_json)
  const meaning = assignmentTransitionMeaning(invocation, input)
  const replay = replayAssignmentTransition(database, "complete", meaning)
  if (replay) return settleMutation(database, invocation, executedAt, replay)
  const capability = requireAssignmentCapability(database, invocation, input.assignmentId)
  const completed = completeAssignment(database, {
    effectId: `effect:assignment:${randomUUID()}`,
    ...meaning,
    assignmentId: capability.id,
    expectedVersion: capability.version,
    occurredAt: executedAt,
  })
  return settleMutation(database, invocation, executedAt, completed)
}

function executeCancel(database: Database, invocation: InvocationRow, executedAt: number) {
  const input = parseDispositionInput(invocation.input_json)
  const meaning = assignmentTransitionMeaning(invocation, input)
  const replay = replayAssignmentTransition(database, "cancel", meaning)
  if (replay) return settleMutation(database, invocation, executedAt, replay)
  const capability = requireAssignmentCapability(database, invocation, input.assignmentId)
  const cancelled = cancelAssignment(database, {
    effectId: `effect:assignment:${randomUUID()}`,
    ...meaning,
    assignmentId: capability.id,
    expectedVersion: capability.version,
    occurredAt: executedAt,
  })
  return settleMutation(database, invocation, executedAt, cancelled)
}

function executeReopen(database: Database, invocation: InvocationRow, executedAt: number) {
  const input = parseMetadataMutationInput(invocation.input_json, invocation.time_zone, false)
  const meaning = assignmentTransitionMeaning(invocation, input)
  const replay = replayAssignmentTransition(database, "reopen", meaning)
  if (replay) return settleMutation(database, invocation, executedAt, replay)
  const capability = requireAssignmentCapability(database, invocation, input.assignmentId)
  const reopened = reopenAssignment(database, {
    effectId: `effect:assignment:${randomUUID()}`,
    ...meaning,
    assignmentId: capability.id,
    expectedVersion: capability.version,
    occurredAt: executedAt,
  })
  return settleMutation(database, invocation, executedAt, reopened)
}

function assignmentTransitionMeaning(
  invocation: InvocationRow,
  input: {
    assignmentId: string
    sourceExcerpt: string
    rationale: string
    title?: string
    deadline?: { dueAt: number; dueAtIso: string }
  },
) {
  return {
    assignmentId: input.assignmentId,
    causeItemId: invocation.cause_item_id,
    modelOperationId: invocation.model_operation_id,
    sourceExcerpt: input.sourceExcerpt,
    rationale: input.rationale,
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.deadline === undefined
      ? {}
      : {
          dueAt: input.deadline.dueAt,
          dueAtIso: input.deadline.dueAtIso,
          interpretationTimeZone: invocation.time_zone,
        }),
  }
}

function settleMutation(
  database: Database,
  invocation: InvocationRow,
  executedAt: number,
  mutation: {
    replayed: boolean
    operationEffectId: string
    operationRevision: number
    assignment: Assignment
  },
) {
  const outcome: AssignmentMutationSuccess = {
    ok: true,
    disposition: mutation.replayed ? "already_applied" : "applied",
    operationEffectId: mutation.operationEffectId,
    operationRevision: mutation.operationRevision,
    currentRevision: readSystemState(database).revision,
    assignment: assignmentReceipt(mutation.assignment),
  }
  settleSuccess(
    database,
    invocation,
    executedAt,
    outcome,
    mutation.operationEffectId,
  )
  return { outcome, durableOutcome: outcome }
}

function assignmentReceipt(assignment: Assignment): AssignmentReceipt {
  return {
    id: assignment.id,
    status: assignment.status,
    version: assignment.version,
    title: assignment.title,
    dueAt: assignment.dueAt,
    dueAtIso: assignment.dueAtIso,
  }
}

function readInvocation(database: Database, invocationId: string) {
  const row = database.query(`
    SELECT invocation.invocation_id, invocation.tool_name, invocation.input_json,
           invocation.status, invocation.result_json, invocation.error_json,
           invocation.created_at, model.model_operation_id, model.sampled_at,
           model.time_zone, model.context_json, model.status AS model_status,
           turn.turn_id, turn.status AS turn_status, source.item_id AS cause_item_id
    FROM tool_invocation AS invocation
    JOIN model_operation AS model
      ON model.model_operation_id = invocation.model_operation_id
    JOIN turn ON turn.turn_id = model.turn_id
    JOIN session_item AS source
      ON source.turn_id = turn.turn_id AND source.role = 'user'
    WHERE invocation.invocation_id = ?1
  `).get(invocationId) as InvocationRow | null
  if (!row) throw new Error(`Unknown Assignment tool invocation: ${invocationId}`)
  return row
}

function terminalExecution(
  database: Database,
  invocation: InvocationRow,
): AssignmentToolExecution | undefined {
  if (invocation.status === "failed") {
    if (invocation.error_json === null) throw new Error("Failed Assignment tool has no error")
    const failure = JSON.parse(invocation.error_json) as AssignmentToolFailure
    return { outcome: failure, durableOutcome: failure }
  }
  if (invocation.status !== "completed") return undefined
  if (invocation.result_json === null) throw new Error("Completed Assignment tool has no result")
  const durableOutcome = JSON.parse(invocation.result_json) as AssignmentDurableOutcome
  if (!durableOutcome.ok) return { outcome: durableOutcome, durableOutcome }
  if (invocation.tool_name !== READ_ASSIGNMENT_SOURCE_TOOL) {
    const outcome = durableOutcome as Exclude<
      AssignmentDurableOutcome,
      AssignmentSourceReceipt
    >
    return { outcome, durableOutcome }
  }
  if (!("assignmentId" in durableOutcome) || !("sourceSpan" in durableOutcome)) {
    throw new Error("Completed Assignment source read has no source receipt")
  }
  const receipt = durableOutcome as AssignmentSourceReceipt
  const restored = {
    ...readAssignmentSource(database, {
      assignmentId: receipt.assignmentId,
      version: receipt.version,
      offset: receipt.offset,
      limit: receipt.limit,
    }),
    revisionIndex: readAssignmentRevisionIndex(database, {
      assignmentId: receipt.assignmentId,
      throughVersion: receipt.revisionIndex.visibleThroughVersion,
      offset: receipt.revisionIndex.offset,
      limit: receipt.revisionIndex.limit,
    }),
  }
  const { content: _content, ...restoredReceipt } = restored
  const { ok: _ok, ...expectedReceipt } = durableOutcome
  if (canonicalJson(restoredReceipt) !== canonicalJson(expectedReceipt)) {
    throw new Error(
      `Assignment source receipt no longer resolves exactly: ${durableOutcome.assignmentId}@${durableOutcome.version}`,
    )
  }
  return {
    outcome: { ok: true, ...restored },
    durableOutcome,
  }
}

function requireAssignmentCapability(
  database: Database,
  invocation: InvocationRow,
  assignmentId: string,
) {
  const contextual = readPersistedAssignmentCapabilities(invocation)
    .find((candidate) => candidate.id === assignmentId)
  if (contextual) return contextual

  const inspectedRows = database.query(`
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
  `).all(
    invocation.turn_id,
    INSPECT_ASSIGNMENTS_TOOL,
    invocation.model_operation_id,
    invocation.sampled_at,
  ) as Array<{ result_json: string }>
  for (const row of inspectedRows) {
    const result = JSON.parse(row.result_json) as unknown
    const object = expectObject(result, "Persisted Assignment inspection", "invalid_context")
    if (object.ok !== true || !Array.isArray(object.assignments)) continue
    for (const candidate of object.assignments) {
      const capability = parseCapability(candidate, "Inspected Assignment")
      if (capability.id === assignmentId) return capability
    }
  }
  throw new ToolCommandError(
    "invalid_context",
    `Assignment was not granted by this model context or a prior visible inspection: ${assignmentId}`,
  )
}

function readPersistedAssignmentCapabilities(invocation: InvocationRow) {
  let raw: unknown
  try {
    raw = JSON.parse(invocation.context_json) as unknown
  } catch {
    throw new ToolCommandError("invalid_context", "Persisted Tutor context is not valid JSON")
  }
  const context = expectObject(raw, "Persisted Tutor context", "invalid_context")
  if (context.assignments === undefined) return []
  const contribution = expectObject(
    context.assignments,
    "Persisted Assignment context contribution",
    "invalid_context",
  )
  if (!Array.isArray(contribution.assignments)) {
    throw new ToolCommandError(
      "invalid_context",
      "Persisted Assignment context has no bounded assignment list",
    )
  }
  return contribution.assignments.map((value) => parseCapability(
    value,
    "Persisted Assignment",
  ))
}

function parseCapability(value: unknown, label: string): AssignmentCapability {
  const object = expectObject(value, label, "invalid_context")
  if (
    typeof object.id !== "string" ||
    !object.id.trim() ||
    !Number.isSafeInteger(object.version) ||
    (object.version as number) < 1
  ) {
    throw new ToolCommandError("invalid_context", `${label} capability is incomplete`)
  }
  return { id: object.id, version: object.version as number }
}

function parseCreateInput(inputJson: string, timeZone: string) {
  const object = parseInputObject(inputJson)
  expectExactKeys(object, ["admissionRationale", "dueAt", "sourceExcerpt", "title"])
  const dueAtIso = boundedString(object.dueAt, "dueAt", 100)
  return {
    sourceExcerpt: sourceExcerpt(object.sourceExcerpt),
    title: boundedString(object.title, "title", MAX_TITLE_CODE_POINTS),
    ...parseDeadline(dueAtIso, timeZone, "dueAt"),
    admissionRationale: boundedString(
      object.admissionRationale,
      "admissionRationale",
      MAX_RATIONALE_CODE_POINTS,
    ),
  }
}

function parseInspectionInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectAllowedKeys(object, ["limit", "offset", "scope"])
  if (object.scope !== "active" && object.scope !== "recent_terminal") {
    throw new ToolCommandError("invalid_input", "scope must be active or recent_terminal")
  }
  const scope: "active" | "recent_terminal" = object.scope
  const offset = optionalInteger(object.offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER)
  const limit = optionalInteger(object.limit, "limit", 10, 1, 20)
  return { scope, offset, limit }
}

function parseSourceReadInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectAllowedKeys(object, [
    "assignmentId",
    "limit",
    "offset",
    "revisionLimit",
    "revisionOffset",
    "version",
  ])
  const version = object.version === undefined
    ? undefined
    : requiredInteger(object.version, "version", 1, Number.MAX_SAFE_INTEGER)
  return {
    assignmentId: boundedString(object.assignmentId, "assignmentId", 500),
    ...(version === undefined ? {} : { version }),
    offset: optionalInteger(object.offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
    limit: optionalInteger(object.limit, "limit", 1_000, 1, 4_000),
    revisionOffset: optionalInteger(
      object.revisionOffset,
      "revisionOffset",
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    revisionLimit: optionalInteger(object.revisionLimit, "revisionLimit", 20, 1, 20),
  }
}

function parseDispositionInput(inputJson: string) {
  const object = parseInputObject(inputJson)
  expectExactKeys(object, ["assignmentId", "rationale", "sourceExcerpt"])
  return {
    assignmentId: boundedString(object.assignmentId, "assignmentId", 500),
    sourceExcerpt: sourceExcerpt(object.sourceExcerpt),
    rationale: boundedString(object.rationale, "rationale", MAX_RATIONALE_CODE_POINTS),
  }
}

function parseMetadataMutationInput(
  inputJson: string,
  timeZone: string,
  requireMetadata: boolean,
) {
  const object = parseInputObject(inputJson)
  expectAllowedKeys(object, ["assignmentId", "dueAt", "rationale", "sourceExcerpt", "title"])
  if (requireMetadata && object.title === undefined && object.dueAt === undefined) {
    throw new ToolCommandError(
      "invalid_input",
      "Assignment revision requires a corrected title or deadline",
    )
  }
  const title = object.title === undefined
    ? undefined
    : boundedString(object.title, "title", MAX_TITLE_CODE_POINTS)
  const deadline = object.dueAt === undefined
    ? undefined
    : parseDeadline(boundedString(object.dueAt, "dueAt", 100), timeZone, "dueAt")
  return {
    assignmentId: boundedString(object.assignmentId, "assignmentId", 500),
    sourceExcerpt: sourceExcerpt(object.sourceExcerpt),
    rationale: boundedString(object.rationale, "rationale", MAX_RATIONALE_CODE_POINTS),
    ...(title === undefined ? {} : { title }),
    ...(deadline === undefined ? {} : { deadline }),
  }
}

function parseDeadline(value: string, timeZone: string, label: string) {
  try {
    return {
      dueAt: parseStrictOffsetTimestamp(value, { precision: "minute", timeZone }),
      dueAtIso: value,
    }
  } catch (error) {
    if (error instanceof StrictOffsetTimestampError) {
      const detail = error.code === "invalid_precision"
        ? "must use whole-minute precision without seconds"
        : error.message
      throw new ToolCommandError("invalid_input", `${label} ${detail}`)
    }
    throw error
  }
}

function parseInputObject(inputJson: string) {
  try {
    return expectObject(JSON.parse(inputJson) as unknown, "Assignment tool input")
  } catch (error) {
    if (error instanceof ToolCommandError) throw error
    throw new ToolCommandError("invalid_input", "Assignment tool input is not valid JSON")
  }
}

function expectObject(
  value: unknown,
  label: string,
  code: AssignmentToolFailure["code"] = "invalid_input",
) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolCommandError(code, `${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function expectExactKeys(object: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(object)
  const allowed = new Set(expected)
  if (
    keys.length !== expected.length ||
    keys.some((key) => !allowed.has(key)) ||
    expected.some((key) => !(key in object))
  ) {
    throw new ToolCommandError(
      "invalid_input",
      `Assignment tool input keys must be exactly: ${expected.join(", ")}`,
    )
  }
}

function expectAllowedKeys(object: Record<string, unknown>, allowed: readonly string[]) {
  const keys = new Set(allowed)
  if (Object.keys(object).some((key) => !keys.has(key))) {
    throw new ToolCommandError(
      "invalid_input",
      `Assignment tool input keys may only be: ${allowed.join(", ")}`,
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

function sourceExcerpt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolCommandError("invalid_input", "sourceExcerpt must be a non-empty string")
  }
  if (Array.from(value).length > MAX_EXCERPT_CODE_POINTS) {
    throw new ToolCommandError(
      "invalid_input",
      `sourceExcerpt must not exceed ${MAX_EXCERPT_CODE_POINTS} Unicode code points`,
    )
  }
  return value
}

function optionalInteger(
  value: unknown,
  label: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  return value === undefined
    ? fallback
    : requiredInteger(value, label, minimum, maximum)
}

function requiredInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new ToolCommandError(
      "invalid_input",
      `${label} must be an integer from ${minimum} to ${maximum}`,
    )
  }
  return value as number
}

function settleSuccess(
  database: Database,
  invocation: InvocationRow,
  settledAt: number,
  durableOutcome: AssignmentDurableOutcome,
  effectId?: string,
) {
  const updated = database.query(`
    UPDATE tool_invocation
    SET status = 'completed', effect_id = ?1, result_json = ?2, settled_at = ?3
    WHERE invocation_id = ?4 AND status = 'running'
  `).run(
    effectId ?? null,
    canonicalJson(durableOutcome),
    settledAt,
    invocation.invocation_id,
  )
  if (updated.changes !== 1) {
    throw new Error(
      `Assignment tool changed before success settlement: ${invocation.invocation_id}`,
    )
  }
}

function settleFailure(
  database: Database,
  invocation: InvocationRow,
  settledAt: number,
  failure: AssignmentToolFailure,
): AssignmentToolExecution {
  const updated = database.query(`
    UPDATE tool_invocation
    SET status = 'failed', error_json = ?1, settled_at = ?2
    WHERE invocation_id = ?3 AND status = 'running'
  `).run(canonicalJson(failure), settledAt, invocation.invocation_id)
  if (updated.changes !== 1) {
    throw new Error(
      `Assignment tool changed before failure settlement: ${invocation.invocation_id}`,
    )
  }
  return { outcome: failure, durableOutcome: failure }
}

function assertExecutionInput(input: { invocationId: string; executedAt: number }) {
  if (!input.invocationId.trim()) throw new Error("invocationId must not be empty")
  if (!Number.isSafeInteger(input.executedAt) || input.executedAt < 0) {
    throw new Error("executedAt must be a non-negative integer timestamp")
  }
}

class ToolCommandError extends Error {
  constructor(
    readonly code: AssignmentToolFailure["code"],
    message: string,
  ) {
    super(message)
    this.name = "ToolCommandError"
  }
}
