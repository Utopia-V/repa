import type { Database } from "bun:sqlite"
import { readLatestTurnEventAt } from "../interaction/records"
import { canonicalJson } from "../storage/canonical-json"
import { advanceSystemState, readSystemState } from "../storage/system-state"

const RETAIN_KIND = "timed-learner-steering-v0"
const RETAIN_SLOT = "one-time-bounded-policy-contribution-v0"
const WITHDRAW_KIND = "withdraw-timed-learner-steering-v0"
const MAX_STEERING_EXCERPT_CODE_POINTS = 1_000

type ToolSuccess = {
  ok: true
  disposition: "applied" | "already_applied"
  operationEffectId: string
  operationRevision: number
  currentRevision: number
  steeringEffectId: string
  steeringState: "active" | "expired" | "retracted"
}

type ToolFailure = {
  ok: false
  code:
    | "invalid_input"
    | "semantic_conflict"
    | "stale_revision"
    | "illegal_transition"
    | "turn_terminated"
    | "turn_exhausted"
    | "runtime_restarted"
  message: string
  expectedRevision?: number
  actualRevision?: number
}

export type LearnerSteeringToolOutcome = ToolSuccess | ToolFailure

type InvocationRow = {
  invocation_id: string
  tool_name: string
  input_json: string
  status: "running" | "completed" | "failed"
  result_json: string | null
  error_json: string | null
  created_at: number
  model_operation_id: string
  expected_revision: number
  sampled_at: number
  time_zone: string
  turn_id: string
  turn_status: "running" | "completed" | "failed" | "interrupted" | "exhausted"
  model_status: "running" | "completed" | "failed"
  cause_item_id: string
  cause_content: string
  cause_created_at: number
}

type ExecutionRow = InvocationRow & { executed_at: number }

type EffectRow = {
  effect_id: string
  value_json: string
  revision_after: number
}

export function executeLearnerSteeringTool(
  database: Database,
  input: { invocationId: string; executedAt: number },
): LearnerSteeringToolOutcome {
  if (!input.invocationId.trim()) throw new Error("invocationId must not be empty")
  assertTimestamp(input.executedAt, "executedAt")
  return database.transaction(() => {
    const invocation = readInvocationForExecution(database, input.invocationId)
    if (invocation.status === "completed") {
      if (invocation.result_json === null) throw new Error("Completed tool has no result")
      return JSON.parse(invocation.result_json) as ToolSuccess
    }
    if (invocation.status === "failed") {
      if (invocation.error_json === null) throw new Error("Failed tool has no error")
      return JSON.parse(invocation.error_json) as ToolFailure
    }
    if (input.executedAt < invocation.created_at) {
      throw new Error("Tool execution cannot occur before its recorded invocation")
    }
    if (input.executedAt < readLatestTurnEventAt(database, invocation.turn_id)) {
      throw new Error("Tool execution cannot occur before the latest Turn event")
    }
    const execution: ExecutionRow = { ...invocation, executed_at: input.executedAt }
    if (execution.turn_status !== "running" || execution.model_status === "failed") {
      return settleFailure(database, execution, {
        ok: false,
        code: "illegal_transition",
        message: "A tool invocation cannot execute after its Turn or model operation failed",
      })
    }
    if (execution.executed_at < readSystemState(database).lastTransitionAt) {
      return settleFailure(database, execution, {
        ok: false,
        code: "illegal_transition",
        message: "Tool execution occurs before the latest durable state transition",
      })
    }

    try {
      switch (execution.tool_name) {
        case "retain_learning_wide_timed_steering":
          return retainTimedSteering(database, execution)
        case "withdraw_learning_wide_timed_steering":
          return withdrawTimedSteering(database, execution)
        default:
          return settleFailure(database, execution, {
            ok: false,
            code: "invalid_input",
            message: `Unknown learner steering tool: ${execution.tool_name}`,
          })
      }
    } catch (error) {
      if (error instanceof InputError) {
        return settleFailure(database, execution, {
          ok: false,
          code: "invalid_input",
          message: error.message,
        })
      }
      throw error
    }
  }).immediate()
}

export function listTimedLearnerSteering(database: Database) {
  const rows = database
    .query(`
      SELECT
        steering.steering_effect_id,
        steering.source_item_id,
        steering.verbatim_excerpt,
        steering.effective_from,
        steering.valid_until,
        steering.interpretation_model_operation_id,
        steering.interpretation_time_zone,
        steering.retracted_at,
        steering.retraction_effect_id,
        correction.cause_item_id AS retraction_source_item_id
      FROM timed_learner_steering AS steering
      LEFT JOIN durable_effect AS correction
        ON correction.effect_id = steering.retraction_effect_id
      JOIN session_item AS source ON source.item_id = steering.source_item_id
      ORDER BY source.sequence ASC, steering.steering_effect_id ASC
    `)
    .all() as Array<{
    steering_effect_id: string
    source_item_id: string
    verbatim_excerpt: string
    effective_from: number
    valid_until: number
    interpretation_model_operation_id: string
    interpretation_time_zone: string
    retracted_at: number | null
    retraction_effect_id: string | null
    retraction_source_item_id: string | null
  }>
  return rows.map((row) => ({
    effectId: row.steering_effect_id,
    sourceItemId: row.source_item_id,
    verbatimExcerpt: row.verbatim_excerpt,
    effectiveFrom: row.effective_from,
    validUntil: row.valid_until,
    interpretationModelOperationId: row.interpretation_model_operation_id,
    interpretationTimeZone: row.interpretation_time_zone,
    retractedAt: row.retracted_at ?? undefined,
    retractionEffectId: row.retraction_effect_id ?? undefined,
    retractionSourceItemId: row.retraction_source_item_id ?? undefined,
  }))
}

function retainTimedSteering(database: Database, invocation: ExecutionRow) {
  const toolInput = parseRetainInput(JSON.parse(invocation.input_json) as unknown)
  if (!invocation.cause_content.includes(toolInput.verbatimExcerpt)) {
    return settleFailure(database, invocation, {
      ok: false,
      code: "invalid_input",
      message: "Learner steering excerpt is not present in the runtime-bound source item",
    })
  }
  if (toolInput.validUntil <= invocation.cause_created_at) {
    return settleFailure(database, invocation, {
      ok: false,
      code: "invalid_input",
      message: "Learner steering must expire after its admitted source",
    })
  }

  const valueJson = canonicalJson({
    effectiveFrom: invocation.cause_created_at,
    validUntil: toolInput.validUntil,
    verbatimExcerpt: toolInput.verbatimExcerpt,
  })
  const existing = readEffect(database, RETAIN_KIND, invocation.cause_item_id, RETAIN_SLOT)
  if (existing) {
    if (existing.value_json !== valueJson) {
      return settleFailure(database, invocation, {
        ok: false,
        code: "semantic_conflict",
        message: "The admitted learner input already has a different timed steering interpretation",
      })
    }
    const state = readSteeringState(database, existing.effect_id, invocation.executed_at)
    return settleSuccess(database, invocation, existing.effect_id, {
      ok: true,
      disposition: "already_applied",
      operationEffectId: existing.effect_id,
      operationRevision: existing.revision_after,
      currentRevision: currentRevision(database),
      steeringEffectId: existing.effect_id,
      steeringState: state,
    })
  }

  if (toolInput.validUntil <= invocation.executed_at) {
    return settleFailure(database, invocation, {
      ok: false,
      code: "invalid_input",
      message: "A new learner steering effect cannot commit after its applicability expired",
    })
  }

  const actualState = readSystemState(database)
  const actualRevision = actualState.revision
  if (invocation.executed_at < actualState.lastTransitionAt) {
    return settleFailure(database, invocation, {
      ok: false,
      code: "illegal_transition",
      message: "Tool execution occurs before the latest durable state transition",
    })
  }
  if (actualRevision !== invocation.expected_revision) {
    return settleFailure(database, invocation, {
      ok: false,
      code: "stale_revision",
      message: `Stale state revision: expected ${invocation.expected_revision}, current ${actualRevision}`,
      expectedRevision: invocation.expected_revision,
      actualRevision,
    })
  }

  const effectId = `effect:${crypto.randomUUID()}`
  const revisionAfter = actualRevision + 1
  database
    .query(`
      INSERT INTO durable_effect (
        effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `)
    .run(
      effectId,
      RETAIN_KIND,
      invocation.cause_item_id,
      RETAIN_SLOT,
      valueJson,
      revisionAfter,
      invocation.executed_at,
    )
  database
    .query(`
      INSERT INTO timed_learner_steering (
        steering_effect_id,
        source_item_id,
        verbatim_excerpt,
        effective_from,
        valid_until,
        interpretation_model_operation_id,
        interpretation_time_zone
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `)
    .run(
      effectId,
      invocation.cause_item_id,
      toolInput.verbatimExcerpt,
      invocation.cause_created_at,
      toolInput.validUntil,
      invocation.model_operation_id,
      invocation.time_zone,
    )
  advanceSystemState(database, {
    expectedRevision: actualRevision,
    expectedTransitionAt: actualState.lastTransitionAt,
    nextRevision: revisionAfter,
    transitionAt: invocation.executed_at,
  })
  return settleSuccess(database, invocation, effectId, {
    ok: true,
    disposition: "applied",
    operationEffectId: effectId,
    operationRevision: revisionAfter,
    currentRevision: revisionAfter,
    steeringEffectId: effectId,
    steeringState: "active",
  })
}

function withdrawTimedSteering(database: Database, invocation: ExecutionRow) {
  const toolInput = parseWithdrawInput(JSON.parse(invocation.input_json) as unknown)
  const valueJson = canonicalJson({ steeringEffectId: toolInput.steeringEffectId })
  const existing = readEffect(
    database,
    WITHDRAW_KIND,
    invocation.cause_item_id,
    toolInput.steeringEffectId,
  )
  if (existing) {
    if (existing.value_json !== valueJson) {
      return settleFailure(database, invocation, {
        ok: false,
        code: "semantic_conflict",
        message: "The correction source already owns a different withdrawal effect",
      })
    }
    return settleSuccess(database, invocation, existing.effect_id, {
      ok: true,
      disposition: "already_applied",
      operationEffectId: existing.effect_id,
      operationRevision: existing.revision_after,
      currentRevision: currentRevision(database),
      steeringEffectId: toolInput.steeringEffectId,
      steeringState: readSteeringState(
        database,
        toolInput.steeringEffectId,
        invocation.executed_at,
      ),
    })
  }

  const steering = database
    .query(`
      SELECT retracted_at
      FROM timed_learner_steering
      WHERE steering_effect_id = ?1
    `)
    .get(toolInput.steeringEffectId) as { retracted_at: number | null } | null
  if (!steering) {
    return settleFailure(database, invocation, {
      ok: false,
      code: "illegal_transition",
      message: `Unknown timed learner steering: ${toolInput.steeringEffectId}`,
    })
  }
  if (steering.retracted_at !== null) {
    return settleFailure(database, invocation, {
      ok: false,
      code: "illegal_transition",
      message: `Timed learner steering is already retracted: ${toolInput.steeringEffectId}`,
    })
  }

  const actualState = readSystemState(database)
  const actualRevision = actualState.revision
  if (invocation.executed_at < actualState.lastTransitionAt) {
    return settleFailure(database, invocation, {
      ok: false,
      code: "illegal_transition",
      message: "Tool execution occurs before the latest durable state transition",
    })
  }
  if (actualRevision !== invocation.expected_revision) {
    return settleFailure(database, invocation, {
      ok: false,
      code: "stale_revision",
      message: `Stale state revision: expected ${invocation.expected_revision}, current ${actualRevision}`,
      expectedRevision: invocation.expected_revision,
      actualRevision,
    })
  }

  const withdrawalEffectId = `effect:${crypto.randomUUID()}`
  const revisionAfter = actualRevision + 1
  database
    .query(`
      INSERT INTO durable_effect (
        effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `)
    .run(
      withdrawalEffectId,
      WITHDRAW_KIND,
      invocation.cause_item_id,
      toolInput.steeringEffectId,
      valueJson,
      revisionAfter,
      invocation.executed_at,
    )
  const retracted = database
    .query(`
      UPDATE timed_learner_steering
      SET retracted_at = ?1, retraction_effect_id = ?2
      WHERE steering_effect_id = ?3 AND retracted_at IS NULL
    `)
    .run(invocation.executed_at, withdrawalEffectId, toolInput.steeringEffectId)
  if (retracted.changes !== 1) {
    throw new Error(`Timed learner steering changed during withdrawal: ${toolInput.steeringEffectId}`)
  }
  advanceSystemState(database, {
    expectedRevision: actualRevision,
    expectedTransitionAt: actualState.lastTransitionAt,
    nextRevision: revisionAfter,
    transitionAt: invocation.executed_at,
  })
  return settleSuccess(database, invocation, withdrawalEffectId, {
    ok: true,
    disposition: "applied",
    operationEffectId: withdrawalEffectId,
    operationRevision: revisionAfter,
    currentRevision: revisionAfter,
    steeringEffectId: toolInput.steeringEffectId,
    steeringState: "retracted",
  })
}

function settleSuccess(
  database: Database,
  invocation: ExecutionRow,
  operationEffectId: string,
  result: ToolSuccess,
) {
  const settled = database
    .query(`
      UPDATE tool_invocation
      SET
        status = 'completed',
        effect_id = ?1,
        result_json = ?2,
        settled_at = ?3
      WHERE invocation_id = ?4 AND status = 'running'
    `)
    .run(operationEffectId, canonicalJson(result), invocation.executed_at, invocation.invocation_id)
  if (settled.changes !== 1) {
    throw new Error(`Tool invocation changed before success settlement: ${invocation.invocation_id}`)
  }
  return result
}

function settleFailure(database: Database, invocation: ExecutionRow, failure: ToolFailure) {
  const settled = database
    .query(`
      UPDATE tool_invocation
      SET status = 'failed', error_json = ?1, settled_at = ?2
      WHERE invocation_id = ?3 AND status = 'running'
    `)
    .run(canonicalJson(failure), invocation.executed_at, invocation.invocation_id)
  if (settled.changes !== 1) {
    throw new Error(`Tool invocation changed before failure settlement: ${invocation.invocation_id}`)
  }
  return failure
}

function readInvocationForExecution(database: Database, invocationId: string) {
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
        model.state_revision AS expected_revision,
        model.sampled_at,
        model.time_zone,
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
  if (!row) throw new Error(`Unknown tool invocation: ${invocationId}`)
  return row
}

function readEffect(
  database: Database,
  kind: string,
  causeItemId: string,
  effectSlot: string,
) {
  return database
    .query(`
      SELECT effect_id, value_json, revision_after
      FROM durable_effect
      WHERE kind = ?1 AND cause_item_id = ?2 AND effect_slot = ?3
    `)
    .get(kind, causeItemId, effectSlot) as EffectRow | null
}

function readSteeringState(database: Database, effectId: string, at: number) {
  const row = database
    .query(`
      SELECT valid_until, retracted_at
      FROM timed_learner_steering
      WHERE steering_effect_id = ?1
    `)
    .get(effectId) as { valid_until: number; retracted_at: number | null } | null
  if (!row) throw new Error(`Unknown timed learner steering effect: ${effectId}`)
  if (row.retracted_at !== null) return "retracted" as const
  return at < row.valid_until ? ("active" as const) : ("expired" as const)
}

function currentRevision(database: Database) {
  return readSystemState(database).revision
}

function parseRetainInput(value: unknown) {
  const object = expectObject(value)
  expectExactKeys(object, ["validUntil", "verbatimExcerpt"])
  if (typeof object.verbatimExcerpt !== "string" || !object.verbatimExcerpt.trim()) {
    throw new InputError("verbatimExcerpt must be a non-empty string")
  }
  if (Array.from(object.verbatimExcerpt).length > MAX_STEERING_EXCERPT_CODE_POINTS) {
    throw new InputError(
      `verbatimExcerpt must not exceed ${MAX_STEERING_EXCERPT_CODE_POINTS} Unicode code points`,
    )
  }
  if (
    typeof object.validUntil !== "string" ||
    !/(?:[zZ]|[+-]\d{2}:\d{2})$/.test(object.validUntil)
  ) {
    throw new InputError("validUntil must be an ISO-8601 timestamp with an explicit UTC offset")
  }
  const validUntil = Date.parse(object.validUntil)
  assertTimestamp(validUntil, "validUntil")
  return {
    verbatimExcerpt: object.verbatimExcerpt,
    validUntil,
  }
}

function parseWithdrawInput(value: unknown) {
  const object = expectObject(value)
  expectExactKeys(object, ["steeringEffectId"])
  if (typeof object.steeringEffectId !== "string" || !object.steeringEffectId.trim()) {
    throw new InputError("steeringEffectId must be a non-empty string")
  }
  return { steeringEffectId: object.steeringEffectId }
}

function expectObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("Tool input must be an object")
  }
  return value as Record<string, unknown>
}

function expectExactKeys(object: Record<string, unknown>, expectedKeys: string[]) {
  const actual = Object.keys(object).sort()
  const expected = [...expectedKeys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new InputError(`Tool input keys must be exactly: ${expected.join(", ")}`)
  }
}

function assertTimestamp(value: unknown, label: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Number.isNaN(new Date(value).getTime())
  ) {
    throw new InputError(`${label} must be a non-negative integer timestamp`)
  }
}

class InputError extends Error {}
