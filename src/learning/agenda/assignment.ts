import type { Database } from "bun:sqlite"
import { canonicalJson } from "../../storage/canonical-json"
import { advanceSystemState, readSystemState } from "../../storage/system-state"

const CREATE_KIND = "agenda_assignment_create"
const MAX_TITLE_CODE_POINTS = 500
const MAX_EXCERPT_CODE_POINTS = 1_000
const MAX_RATIONALE_CODE_POINTS = 800

export type AssignmentStatus = "open" | "completed" | "cancelled"
export type AssignmentTransitionKind = "revise" | "complete" | "cancel" | "reopen"

export type AssignmentRevision = Readonly<{
  version: number
  kind: "create" | AssignmentTransitionKind
  status: AssignmentStatus
  title: string
  dueAt: number
  dueAtIso: string
  interpretationTimeZone: string
  rationale: string
  sourceItemId: string
  sourceStartCodePoint: number
  sourceEndCodePoint: number
  modelOperationId: string
  occurredAt: number
}>

export type AssignmentSourceSpan = Readonly<{
  itemId: string
  startCodePoint: number
  endCodePoint: number
  excerpt: string
}>

export type Assignment = Readonly<{
  id: string
  creationEffectId: string
  status: AssignmentStatus
  version: number
  title: string
  dueAt: number
  dueAtIso: string
  interpretationTimeZone: string
  admissionRationale: string
  creationSource: AssignmentSourceSpan
  source: AssignmentSourceSpan
  createdAt: number
  updatedAt: number
}>

export type AssignmentContextItem = Readonly<{
  id: string
  version: number
  title: string
  dueAt: number
  millisecondsUntilDue: number
  temporalState: "open" | "overdue"
  sourceItemId: string
}>

export class AssignmentCommandError extends Error {
  constructor(
    readonly code:
      | "invalid_input"
      | "semantic_conflict"
      | "stale_assignment"
      | "illegal_transition",
    message: string,
  ) {
    super(message)
    this.name = "AssignmentCommandError"
  }
}

export function createAssignment(
  database: Database,
  rawInput: {
    effectId: string
    assignmentId: string
    causeItemId: string
    modelOperationId: string
    sourceExcerpt: string
    title: string
    dueAt: number
    dueAtIso: string
    interpretationTimeZone: string
    admissionRationale: string
    occurredAt: number
  },
) {
  const input = validateCreateInput(rawInput)
  return database.transaction(() => {
    const source = requireCommandSource(
      database,
      input.causeItemId,
      input.modelOperationId,
    )
    if (source.time_zone !== input.interpretationTimeZone) {
      fail("invalid_input", "Assignment interpretation time zone differs from its model context")
    }
    const span = resolveUniqueSourceSpan(source.content, input.sourceExcerpt)
    const effectSlot = canonicalJson([span.startCodePoint, span.endCodePoint])
    const valueJson = canonicalJson({
      admissionRationale: input.admissionRationale,
      dueAt: input.dueAt,
      sourceExcerpt: span.excerpt,
      title: input.title,
    })
    const existing = database
      .query(`
        SELECT effect.effect_id, effect.value_json, effect.revision_after,
               assignment.assignment_id
        FROM durable_effect AS effect
        JOIN agenda_assignment AS assignment
          ON assignment.creation_effect_id = effect.effect_id
        WHERE effect.kind = ?1
          AND effect.cause_item_id = ?2
          AND effect.effect_slot = ?3
      `)
      .get(CREATE_KIND, input.causeItemId, effectSlot) as {
        effect_id: string
        value_json: string
        revision_after: number
        assignment_id: string
      } | null
    if (existing) {
      if (existing.value_json !== valueJson) {
        fail(
          "semantic_conflict",
          "The admitted Assignment source occurrence already owns different meaning",
        )
      }
      return {
        replayed: true as const,
        operationEffectId: existing.effect_id,
        operationRevision: existing.revision_after,
        assignment: readAssignment(database, existing.assignment_id),
      }
    }

    assertUnusedIdentity(database, input.effectId, input.assignmentId)
    const state = readSystemState(database)
    assertTransitionTime(
      input.occurredAt,
      Math.max(source.created_at, source.sampled_at),
      state.lastTransitionAt,
    )
    const revisionAfter = state.revision + 1
    database.query(`
      INSERT INTO durable_effect (
        effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).run(
      input.effectId,
      CREATE_KIND,
      input.causeItemId,
      effectSlot,
      valueJson,
      revisionAfter,
      input.occurredAt,
    )
    database.query(`
      INSERT INTO agenda_assignment (
        assignment_id,
        creation_effect_id,
        creation_source_item_id,
        creation_model_operation_id,
        source_start_code_point,
        source_end_code_point,
        source_excerpt,
        creation_title,
        creation_due_at,
        creation_due_at_iso,
        creation_interpretation_time_zone,
        current_source_item_id,
        current_model_operation_id,
        current_source_start_code_point,
        current_source_end_code_point,
        current_source_excerpt,
        title,
        due_at,
        due_at_iso,
        interpretation_time_zone,
        admission_rationale,
        status,
        version,
        created_at,
        updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7,
        ?8, ?9, ?10, ?11,
        ?3, ?4, ?5, ?6, ?7,
        ?8, ?9, ?10, ?11, ?12, 'open', 1, ?13, ?13
      )
    `).run(
      input.assignmentId,
      input.effectId,
      input.causeItemId,
      input.modelOperationId,
      span.startCodePoint,
      span.endCodePoint,
      span.excerpt,
      input.title,
      input.dueAt,
      input.dueAtIso,
      input.interpretationTimeZone,
      input.admissionRationale,
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
      operationEffectId: input.effectId,
      operationRevision: revisionAfter,
      assignment: readAssignment(database, input.assignmentId),
    }
  }).immediate()
}

export function readAssignment(database: Database, assignmentId: string): Assignment {
  const row = database.query(`
    SELECT assignment_id, creation_effect_id, creation_source_item_id,
           source_start_code_point, source_end_code_point, source_excerpt,
           current_source_item_id, current_source_start_code_point,
           current_source_end_code_point, current_source_excerpt,
           title, due_at, due_at_iso, interpretation_time_zone,
           admission_rationale, status, version, created_at, updated_at
    FROM agenda_assignment
    WHERE assignment_id = ?1
  `).get(assignmentId) as AssignmentRow | null
  if (!row) throw new Error(`Unknown Assignment: ${assignmentId}`)
  return mapAssignment(row)
}

type BaseTransitionInput = {
  effectId: string
  assignmentId: string
  expectedVersion: number
  causeItemId: string
  modelOperationId: string
  sourceExcerpt: string
  rationale: string
  occurredAt: number
}

type AssignmentMetadataReplacement = {
  title?: string
  dueAt?: number
  dueAtIso?: string
  interpretationTimeZone?: string
}

type AssignmentTransitionMeaningInput = Omit<
  BaseTransitionInput,
  "effectId" | "expectedVersion" | "occurredAt"
> & AssignmentMetadataReplacement

export function reviseAssignment(
  database: Database,
  input: BaseTransitionInput & AssignmentMetadataReplacement,
) {
  if (input.title === undefined && input.dueAt === undefined) {
    fail("invalid_input", "Assignment revision requires a title or deadline correction")
  }
  return transitionAssignment(database, "revise", input)
}

export function completeAssignment(database: Database, input: BaseTransitionInput) {
  return transitionAssignment(database, "complete", input)
}

export function cancelAssignment(database: Database, input: BaseTransitionInput) {
  return transitionAssignment(database, "cancel", input)
}

export function reopenAssignment(
  database: Database,
  input: BaseTransitionInput & AssignmentMetadataReplacement,
) {
  return transitionAssignment(database, "reopen", input)
}

export function replayAssignmentTransition(
  database: Database,
  kind: AssignmentTransitionKind,
  rawInput: AssignmentTransitionMeaningInput,
) {
  assertIdentifier(rawInput.assignmentId, "assignmentId")
  assertIdentifier(rawInput.causeItemId, "causeItemId")
  assertIdentifier(rawInput.modelOperationId, "modelOperationId")
  return database.transaction(() => {
    const source = requireCommandSource(
      database,
      rawInput.causeItemId,
      rawInput.modelOperationId,
    )
    const input = normalizeTransitionMeaning(rawInput, source.time_zone)
    const span = resolveUniqueSourceSpan(source.content, input.sourceExcerpt)
    return readTransitionReplay(database, kind, input, span)
  }).deferred()
}

export function readAssignmentRevisionIndex(
  database: Database,
  input: {
    assignmentId: string
    offset: number
    limit: number
    throughVersion?: number
  },
) {
  assertIdentifier(input.assignmentId, "assignmentId")
  assertNonNegativeInteger(input.offset, "offset")
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    fail("invalid_input", "limit must be an integer between 1 and 100")
  }
  const current = database.query(`
    SELECT version
    FROM agenda_assignment
    WHERE assignment_id = ?1
  `).get(input.assignmentId) as { version: number } | null
  if (!current) fail("invalid_input", `Unknown Assignment: ${input.assignmentId}`)
  const throughVersion = input.throughVersion ?? current.version
  if (
    !Number.isSafeInteger(throughVersion) ||
    throughVersion < 1 ||
    throughVersion > current.version
  ) {
    fail("invalid_input", "throughVersion must identify a persisted Assignment revision")
  }
  const rows = database.query(`
    SELECT version, kind, status, title, due_at, due_at_iso,
           interpretation_time_zone, rationale, source_item_id,
           source_start_code_point, source_end_code_point,
           model_operation_id, occurred_at
    FROM (
      SELECT 1 AS version,
             'create' AS kind,
             'open' AS status,
             creation_title AS title,
             creation_due_at AS due_at,
             creation_due_at_iso AS due_at_iso,
             creation_interpretation_time_zone AS interpretation_time_zone,
             admission_rationale AS rationale,
             creation_source_item_id AS source_item_id,
             source_start_code_point,
             source_end_code_point,
             creation_model_operation_id AS model_operation_id,
             created_at AS occurred_at
      FROM agenda_assignment
      WHERE assignment_id = ?1

      UNION ALL

      SELECT version_after AS version,
             kind,
             to_status AS status,
             title_after AS title,
             due_at_after AS due_at,
             due_at_iso_after AS due_at_iso,
             interpretation_time_zone_after AS interpretation_time_zone,
             rationale,
             command_source_item_id AS source_item_id,
             source_start_code_point,
             source_end_code_point,
             transition_model_operation_id AS model_operation_id,
             occurred_at
      FROM agenda_assignment_transition
      WHERE assignment_id = ?1
        AND version_after <= ?2
    )
    WHERE version <= ?2
    ORDER BY version ASC
    LIMIT ?3 OFFSET ?4
  `).all(input.assignmentId, throughVersion, input.limit, input.offset) as Array<{
    version: number
    kind: AssignmentRevision["kind"]
    status: AssignmentStatus
    title: string
    due_at: number
    due_at_iso: string
    interpretation_time_zone: string
    rationale: string
    source_item_id: string
    source_start_code_point: number
    source_end_code_point: number
    model_operation_id: string
    occurred_at: number
  }>
  return {
    totalRevisions: throughVersion,
    visibleThroughVersion: throughVersion,
    offset: input.offset,
    limit: input.limit,
    revisions: rows.map((row): AssignmentRevision => ({
      version: row.version,
      kind: row.kind,
      status: row.status,
      title: row.title,
      dueAt: row.due_at,
      dueAtIso: row.due_at_iso,
      interpretationTimeZone: row.interpretation_time_zone,
      rationale: row.rationale,
      sourceItemId: row.source_item_id,
      sourceStartCodePoint: row.source_start_code_point,
      sourceEndCodePoint: row.source_end_code_point,
      modelOperationId: row.model_operation_id,
      occurredAt: row.occurred_at,
    })),
  }
}

export function readAssignmentContext(
  database: Database,
  input: { at: number; offset: number; limit: number },
) {
  assertTimestamp(input.at, "at")
  assertNonNegativeInteger(input.offset, "offset")
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    fail("invalid_input", "limit must be an integer between 1 and 100")
  }
  const total = database.query(`
    SELECT COUNT(*) AS count
    FROM agenda_assignment
    WHERE status = 'open'
  `).get() as { count: number }
  const rows = database.query(`
    SELECT assignment_id, version, title, due_at, current_source_item_id
    FROM agenda_assignment
    WHERE status = 'open'
    ORDER BY due_at ASC, assignment_id ASC
    LIMIT ?1 OFFSET ?2
  `).all(input.limit, input.offset) as Array<{
    assignment_id: string
    version: number
    title: string
    due_at: number
    current_source_item_id: string
  }>
  return {
    totalActive: total.count,
    offset: input.offset,
    assignments: rows.map((row): AssignmentContextItem => ({
      id: row.assignment_id,
      version: row.version,
      title: row.title,
      dueAt: row.due_at,
      millisecondsUntilDue: row.due_at - input.at,
      temporalState: input.at >= row.due_at ? "overdue" : "open",
      sourceItemId: row.current_source_item_id,
    })),
  }
}

export type AssignmentInspectionItem = Readonly<{
  id: string
  version: number
  title: string
  dueAt: number
  status: AssignmentStatus
  temporalState: "open" | "overdue" | "completed" | "cancelled"
  sourceItemId: string
  updatedAt: number
}>

export function inspectAssignments(
  database: Database,
  input: {
    scope: "active" | "recent_terminal"
    at: number
    offset: number
    limit: number
  },
) {
  assertTimestamp(input.at, "at")
  assertNonNegativeInteger(input.offset, "offset")
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    fail("invalid_input", "limit must be an integer between 1 and 100")
  }
  const statusPredicate = input.scope === "active"
    ? "status = 'open'"
    : "status IN ('completed', 'cancelled')"
  const order = input.scope === "active"
    ? "due_at ASC, assignment_id ASC"
    : "updated_at DESC, assignment_id ASC"
  const total = database.query(`
    SELECT COUNT(*) AS count
    FROM agenda_assignment
    WHERE ${statusPredicate}
  `).get() as { count: number }
  const rows = database.query(`
    SELECT assignment_id, version, title, due_at, status,
           current_source_item_id, updated_at
    FROM agenda_assignment
    WHERE ${statusPredicate}
    ORDER BY ${order}
    LIMIT ?1 OFFSET ?2
  `).all(input.limit, input.offset) as Array<{
    assignment_id: string
    version: number
    title: string
    due_at: number
    status: AssignmentStatus
    current_source_item_id: string
    updated_at: number
  }>
  return {
    scope: input.scope,
    total: total.count,
    offset: input.offset,
    assignments: rows.map((row): AssignmentInspectionItem => ({
      id: row.assignment_id,
      version: row.version,
      title: row.title,
      dueAt: row.due_at,
      status: row.status,
      temporalState: row.status === "open"
        ? (input.at >= row.due_at ? "overdue" : "open")
        : row.status,
      sourceItemId: row.current_source_item_id,
      updatedAt: row.updated_at,
    })),
  }
}

export function readAssignmentSource(
  database: Database,
  input: { assignmentId: string; version: number; offset: number; limit: number },
) {
  assertIdentifier(input.assignmentId, "assignmentId")
  if (!Number.isSafeInteger(input.version) || input.version < 1) {
    fail("invalid_input", "version must be a positive integer")
  }
  assertNonNegativeInteger(input.offset, "offset")
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 4_000) {
    fail("invalid_input", "limit must be an integer between 1 and 4000")
  }
  const source = input.version === 1
    ? database.query(`
        SELECT creation_source_item_id AS source_item_id,
               source_start_code_point, source_end_code_point, source_excerpt
        FROM agenda_assignment
        WHERE assignment_id = ?1
      `).get(input.assignmentId)
    : database.query(`
        SELECT command_source_item_id AS source_item_id,
               source_start_code_point, source_end_code_point, source_excerpt
        FROM agenda_assignment_transition
        WHERE assignment_id = ?1 AND version_after = ?2
      `).get(input.assignmentId, input.version)
  const typedSource = source as {
    source_item_id: string
    source_start_code_point: number
    source_end_code_point: number
    source_excerpt: string
  } | null
  if (!typedSource) {
    fail(
      "invalid_input",
      `Unknown Assignment source version: ${input.assignmentId}@${input.version}`,
    )
  }
  const revision = readAssignmentRevisionIndex(database, {
    assignmentId: input.assignmentId,
    throughVersion: input.version,
    offset: input.version - 1,
    limit: 1,
  }).revisions[0]
  if (!revision) {
    throw new Error(`Assignment revision metadata is missing: ${input.assignmentId}@${input.version}`)
  }
  const item = database.query(`
    SELECT content
    FROM session_item
    WHERE item_id = ?1
  `).get(typedSource.source_item_id) as { content: string } | null
  if (!item) throw new Error(`Assignment source item is missing: ${typedSource.source_item_id}`)
  const codePoints = Array.from(item.content)
  if (input.offset > codePoints.length) {
    fail("invalid_input", "Assignment source offset exceeds source length")
  }
  const end = Math.min(codePoints.length, input.offset + input.limit)
  return {
    assignmentId: input.assignmentId,
    version: input.version,
    revision,
    sourceItemId: typedSource.source_item_id,
    sourceSpan: {
      startCodePoint: typedSource.source_start_code_point,
      endCodePoint: typedSource.source_end_code_point,
      excerpt: typedSource.source_excerpt,
    },
    totalCodePoints: codePoints.length,
    offset: input.offset,
    limit: input.limit,
    end,
    truncatedBefore: input.offset > 0,
    truncatedAfter: end < codePoints.length,
    content: codePoints.slice(input.offset, end).join(""),
  }
}

type AssignmentRow = {
  assignment_id: string
  creation_effect_id: string
  creation_source_item_id: string
  source_start_code_point: number
  source_end_code_point: number
  source_excerpt: string
  current_source_item_id: string
  current_source_start_code_point: number
  current_source_end_code_point: number
  current_source_excerpt: string
  title: string
  due_at: number
  due_at_iso: string
  interpretation_time_zone: string
  admission_rationale: string
  status: AssignmentStatus
  version: number
  created_at: number
  updated_at: number
}

type CommandSourceRow = {
  role: string
  content: string
  created_at: number
  turn_id: string
  model_turn_id: string
  sampled_at: number
  time_zone: string
}

function mapAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.assignment_id,
    creationEffectId: row.creation_effect_id,
    status: row.status,
    version: row.version,
    title: row.title,
    dueAt: row.due_at,
    dueAtIso: row.due_at_iso,
    interpretationTimeZone: row.interpretation_time_zone,
    admissionRationale: row.admission_rationale,
    creationSource: {
      itemId: row.creation_source_item_id,
      startCodePoint: row.source_start_code_point,
      endCodePoint: row.source_end_code_point,
      excerpt: row.source_excerpt,
    },
    source: {
      itemId: row.current_source_item_id,
      startCodePoint: row.current_source_start_code_point,
      endCodePoint: row.current_source_end_code_point,
      excerpt: row.current_source_excerpt,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function transitionAssignment(
  database: Database,
  kind: AssignmentTransitionKind,
  rawInput: BaseTransitionInput & AssignmentMetadataReplacement,
) {
  const envelope = validateTransitionInput(rawInput)
  return database.transaction(() => {
    const source = requireCommandSource(
      database,
      envelope.causeItemId,
      envelope.modelOperationId,
    )
    const input = normalizeTransitionMeaning(envelope, source.time_zone)
    const span = resolveUniqueSourceSpan(source.content, input.sourceExcerpt)
    const replay = readTransitionReplay(database, kind, input, span, input.expectedVersion)
    if (replay) return replay

    const current = readAssignment(database, input.assignmentId)
    if (current.version !== input.expectedVersion) {
      fail(
        "stale_assignment",
        `Assignment version changed: expected ${input.expectedVersion}, current ${current.version}`,
      )
    }
    assertUnusedEffectIdentity(database, input.effectId)
    const next = nextAssignmentValue(current, kind, input)
    const state = readSystemState(database)
    assertTransitionTime(
      input.occurredAt,
      Math.max(source.created_at, source.sampled_at),
      state.lastTransitionAt,
    )
    const revisionAfter = state.revision + 1
    const versionAfter = current.version + 1
    database.query(`
      INSERT INTO durable_effect (
        effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).run(
      input.effectId,
      assignmentTransitionEffectKind(kind),
      input.causeItemId,
      assignmentTransitionEffectSlot(input.assignmentId, kind, span),
      assignmentTransitionValueJson(input, span, input.expectedVersion),
      revisionAfter,
      input.occurredAt,
    )
    database.query(`
      INSERT INTO agenda_assignment_transition (
        transition_effect_id, assignment_id, kind, from_status, to_status,
        command_source_item_id, transition_model_operation_id,
        source_start_code_point, source_end_code_point, source_excerpt,
        title_after, due_at_after, due_at_iso_after,
        interpretation_time_zone_after, rationale, version_after, occurred_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
        ?11, ?12, ?13, ?14, ?15, ?16, ?17
      )
    `).run(
      input.effectId,
      input.assignmentId,
      kind,
      current.status,
      next.status,
      input.causeItemId,
      input.modelOperationId,
      span.startCodePoint,
      span.endCodePoint,
      span.excerpt,
      next.title,
      next.dueAt,
      next.dueAtIso,
      next.interpretationTimeZone,
      input.rationale,
      versionAfter,
      input.occurredAt,
    )
    database.query(`
      UPDATE agenda_assignment
      SET current_source_item_id = ?1,
          current_model_operation_id = ?2,
          current_source_start_code_point = ?3,
          current_source_end_code_point = ?4,
          current_source_excerpt = ?5,
          title = ?6,
          due_at = ?7,
          due_at_iso = ?8,
          interpretation_time_zone = ?9,
          status = ?10,
          version = ?11,
          updated_at = ?12
      WHERE assignment_id = ?13 AND version = ?14
    `).run(
      input.causeItemId,
      input.modelOperationId,
      span.startCodePoint,
      span.endCodePoint,
      span.excerpt,
      next.title,
      next.dueAt,
      next.dueAtIso,
      next.interpretationTimeZone,
      next.status,
      versionAfter,
      input.occurredAt,
      input.assignmentId,
      input.expectedVersion,
    )
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return {
      replayed: false as const,
      operationEffectId: input.effectId,
      operationRevision: revisionAfter,
      assignment: readAssignment(database, input.assignmentId),
    }
  }).immediate()
}

function nextAssignmentValue(
  current: Assignment,
  kind: AssignmentTransitionKind,
  input: BaseTransitionInput & AssignmentMetadataReplacement,
) {
  const title = input.title === undefined
    ? current.title
    : input.title
  const dueAt = input.dueAt ?? current.dueAt
  const dueAtIso = input.dueAtIso === undefined
    ? current.dueAtIso
    : input.dueAtIso
  const interpretationTimeZone = input.interpretationTimeZone ?? current.interpretationTimeZone
  let status = current.status
  if (kind === "complete") {
    if (current.status !== "open") fail("illegal_transition", "Only an open Assignment can complete")
    status = "completed"
  } else if (kind === "cancel") {
    if (current.status !== "open") fail("illegal_transition", "Only an open Assignment can cancel")
    status = "cancelled"
  } else if (kind === "reopen") {
    if (current.status === "open") fail("illegal_transition", "An open Assignment cannot reopen")
    status = "open"
  }
  return { title, dueAt, dueAtIso, interpretationTimeZone, status }
}

function normalizeTransitionMeaning<T extends AssignmentTransitionMeaningInput>(
  input: T,
  sourceTimeZone: string,
) {
  const sourceExcerpt = boundedString(
    input.sourceExcerpt,
    "sourceExcerpt",
    MAX_EXCERPT_CODE_POINTS,
    false,
  )
  const rationale = boundedString(input.rationale, "rationale", MAX_RATIONALE_CODE_POINTS)
  const title = input.title === undefined
    ? undefined
    : boundedString(input.title, "title", MAX_TITLE_CODE_POINTS)
  const hasDeadline = input.dueAt !== undefined || input.dueAtIso !== undefined ||
    input.interpretationTimeZone !== undefined
  if (
    hasDeadline &&
    (input.dueAt === undefined ||
      input.dueAtIso === undefined ||
      input.interpretationTimeZone === undefined)
  ) {
    fail(
      "invalid_input",
      "Assignment deadline correction requires dueAt, dueAtIso, and interpretationTimeZone",
    )
  }
  if (input.interpretationTimeZone !== undefined && input.interpretationTimeZone !== sourceTimeZone) {
    fail("invalid_input", "Assignment interpretation time zone differs from its model context")
  }
  if (input.dueAt !== undefined) assertTimestamp(input.dueAt, "dueAt")
  const dueAtIso = input.dueAtIso === undefined
    ? undefined
    : boundedString(input.dueAtIso, "dueAtIso", 100)
  const interpretationTimeZone = input.interpretationTimeZone === undefined
    ? undefined
    : boundedString(input.interpretationTimeZone, "interpretationTimeZone", 200)
  return {
    ...input,
    sourceExcerpt,
    rationale,
    ...(title === undefined ? {} : { title }),
    ...(dueAtIso === undefined ? {} : { dueAtIso }),
    ...(interpretationTimeZone === undefined ? {} : { interpretationTimeZone }),
  }
}

function readTransitionReplay(
  database: Database,
  kind: AssignmentTransitionKind,
  input: AssignmentTransitionMeaningInput,
  span: { startCodePoint: number; endCodePoint: number; excerpt: string },
  expectedVersion?: number,
) {
  const existing = database.query(`
    SELECT effect.effect_id, effect.value_json, effect.revision_after,
           transition.assignment_id
    FROM durable_effect AS effect
    JOIN agenda_assignment_transition AS transition
      ON transition.transition_effect_id = effect.effect_id
    WHERE effect.kind = ?1
      AND effect.cause_item_id = ?2
      AND effect.effect_slot = ?3
  `).get(
    assignmentTransitionEffectKind(kind),
    input.causeItemId,
    assignmentTransitionEffectSlot(input.assignmentId, kind, span),
  ) as {
    effect_id: string
    value_json: string
    revision_after: number
    assignment_id: string
  } | null
  if (!existing) return undefined
  let replayExpectedVersion = expectedVersion
  if (replayExpectedVersion === undefined) {
    const stored = JSON.parse(existing.value_json) as unknown
    if (
      stored === null ||
      typeof stored !== "object" ||
      !Number.isSafeInteger((stored as { expectedVersion?: unknown }).expectedVersion)
    ) {
      throw new Error(`Assignment transition effect has invalid semantic value: ${existing.effect_id}`)
    }
    replayExpectedVersion = (stored as { expectedVersion: number }).expectedVersion
  }
  const valueJson = assignmentTransitionValueJson(input, span, replayExpectedVersion)
  if (existing.value_json !== valueJson) {
    fail(
      "semantic_conflict",
      "The admitted Assignment transition occurrence already owns different meaning",
    )
  }
  return {
    replayed: true as const,
    operationEffectId: existing.effect_id,
    operationRevision: existing.revision_after,
    assignment: readAssignment(database, existing.assignment_id),
  }
}

function assignmentTransitionEffectKind(kind: AssignmentTransitionKind) {
  return `agenda_assignment_${kind}`
}

function assignmentTransitionEffectSlot(
  assignmentId: string,
  kind: AssignmentTransitionKind,
  span: { startCodePoint: number; endCodePoint: number },
) {
  return canonicalJson([assignmentId, kind, span.startCodePoint, span.endCodePoint])
}

function assignmentTransitionValueJson(
  input: AssignmentTransitionMeaningInput,
  span: { excerpt: string },
  expectedVersion: number,
) {
  return canonicalJson({
    dueAt: input.dueAt ?? null,
    expectedVersion,
    rationale: input.rationale,
    sourceExcerpt: span.excerpt,
    title: input.title ?? null,
  })
}

function requireCommandSource(
  database: Database,
  sourceItemId: string,
  modelOperationId: string,
) {
  const row = database.query(`
    SELECT source.role, source.content, source.created_at, source.turn_id,
           model.turn_id AS model_turn_id, model.sampled_at, model.time_zone
    FROM session_item AS source
    JOIN model_operation AS model ON model.model_operation_id = ?2
    WHERE source.item_id = ?1
  `).get(sourceItemId, modelOperationId) as CommandSourceRow | null
  if (!row || row.role !== "user" || row.turn_id !== row.model_turn_id) {
    fail("invalid_input", "Assignment command must bind the admitted learner item")
  }
  if (row.created_at > row.sampled_at) {
    fail("invalid_input", "Assignment source occurs after its model context")
  }
  return row
}

function resolveUniqueSourceSpan(content: string, rawExcerpt: string) {
  const excerpt = boundedString(rawExcerpt, "sourceExcerpt", MAX_EXCERPT_CODE_POINTS, false)
  const sourceCodePoints = Array.from(content)
  const excerptCodePoints = Array.from(excerpt)
  const matches: number[] = []
  for (let start = 0; start <= sourceCodePoints.length - excerptCodePoints.length; start += 1) {
    if (excerptCodePoints.every((codePoint, offset) => sourceCodePoints[start + offset] === codePoint)) {
      matches.push(start)
      if (matches.length > 1) break
    }
  }
  if (matches.length === 0) {
    fail("invalid_input", "Assignment excerpt is absent from the admitted source")
  }
  if (matches.length > 1) {
    fail("invalid_input", "Assignment excerpt is ambiguous in the admitted source")
  }
  const startCodePoint = matches[0]
  if (startCodePoint === undefined) {
    fail("invalid_input", "Assignment excerpt is absent from the admitted source")
  }
  const endCodePoint = startCodePoint + excerptCodePoints.length
  return {
    startCodePoint,
    endCodePoint,
    excerpt,
  }
}

function validateCreateInput(input: Parameters<typeof createAssignment>[1]) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.assignmentId, "assignmentId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.modelOperationId, "modelOperationId")
  const sourceExcerpt = boundedString(
    input.sourceExcerpt,
    "sourceExcerpt",
    MAX_EXCERPT_CODE_POINTS,
    false,
  )
  const title = boundedString(input.title, "title", MAX_TITLE_CODE_POINTS)
  const dueAtIso = boundedString(input.dueAtIso, "dueAtIso", 100)
  const interpretationTimeZone = boundedString(
    input.interpretationTimeZone,
    "interpretationTimeZone",
    200,
  )
  const admissionRationale = boundedString(
    input.admissionRationale,
    "admissionRationale",
    MAX_RATIONALE_CODE_POINTS,
  )
  assertTimestamp(input.dueAt, "dueAt")
  assertTimestamp(input.occurredAt, "occurredAt")
  return {
    ...input,
    sourceExcerpt,
    title,
    dueAtIso,
    interpretationTimeZone,
    admissionRationale,
  }
}

function validateTransitionInput(input: BaseTransitionInput & AssignmentMetadataReplacement) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.assignmentId, "assignmentId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.modelOperationId, "modelOperationId")
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    fail("invalid_input", "expectedVersion must be a positive integer")
  }
  const sourceExcerpt = boundedString(
    input.sourceExcerpt,
    "sourceExcerpt",
    MAX_EXCERPT_CODE_POINTS,
    false,
  )
  const rationale = boundedString(
    input.rationale,
    "rationale",
    MAX_RATIONALE_CODE_POINTS,
  )
  assertTimestamp(input.occurredAt, "occurredAt")
  return { ...input, sourceExcerpt, rationale }
}

function assertUnusedIdentity(database: Database, effectId: string, assignmentId: string) {
  const effect = database.query("SELECT 1 AS found FROM durable_effect WHERE effect_id = ?1")
    .get(effectId)
  if (effect) fail("semantic_conflict", `Effect identity is already used: ${effectId}`)
  const assignment = database
    .query("SELECT 1 AS found FROM agenda_assignment WHERE assignment_id = ?1")
    .get(assignmentId)
  if (assignment) fail("semantic_conflict", `Assignment identity is already used: ${assignmentId}`)
}

function assertUnusedEffectIdentity(database: Database, effectId: string) {
  const effect = database.query("SELECT 1 AS found FROM durable_effect WHERE effect_id = ?1")
    .get(effectId)
  if (effect) fail("semantic_conflict", `Effect identity is already used: ${effectId}`)
}

function assertTransitionTime(occurredAt: number, sourceFloor: number, stateFloor: number) {
  if (occurredAt < sourceFloor || occurredAt < stateFloor) {
    fail("invalid_input", "Assignment transition cannot predate its source or durable state")
  }
}

function boundedString(
  value: unknown,
  label: string,
  maxCodePoints: number,
  trim = true,
) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_input", `${label} must be a non-empty string`)
  }
  const normalized = trim ? value.trim() : value
  if (Array.from(normalized).length > maxCodePoints) {
    fail("invalid_input", `${label} must not exceed ${maxCodePoints} Unicode code points`)
  }
  return normalized
}

function assertIdentifier(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_input", `${label} must be a non-empty string`)
  }
}

function assertTimestamp(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail("invalid_input", `${label} must be a non-negative integer timestamp`)
  }
}

function assertNonNegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail("invalid_input", `${label} must be a non-negative integer`)
  }
}

function fail(code: ConstructorParameters<typeof AssignmentCommandError>[0], message: string): never {
  throw new AssignmentCommandError(code, message)
}
