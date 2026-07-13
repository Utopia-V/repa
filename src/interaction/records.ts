import type { Database } from "bun:sqlite"
import { canonicalJson } from "../storage/canonical-json"

export const DEFAULT_TURN_LIMITS = Object.freeze({
  modelOperations: 32,
  toolInvocations: 128,
})

export type ContextCutIdentity = {
  sessionId: string
  sessionSequence: number
  stateRevision: number
  stateTransitionAt: number
  policyProfileRevision: string
  sampledAt: number
  timeZone: string
}

export type ModelContextCut<TContext extends object = Record<string, never>> =
  ContextCutIdentity & TContext

export function createSession(
  database: Database,
  input: { sessionId: string; createdAt: number },
) {
  assertIdentifier(input.sessionId, "sessionId")
  assertTimestamp(input.createdAt, "createdAt")
  return database.transaction(() => {
    const existing = database
      .query("SELECT created_at FROM session WHERE session_id = ?1")
      .get(input.sessionId) as { created_at: number } | null
    if (existing) {
      if (existing.created_at !== input.createdAt) {
        throw new Error(`Session ID was reused with different input: ${input.sessionId}`)
      }
      return { replayed: true as const }
    }
    database
      .query("INSERT INTO session (session_id, created_at) VALUES (?1, ?2)")
      .run(input.sessionId, input.createdAt)
    return { replayed: false as const }
  }).immediate()
}

export function readSession(database: Database, sessionId: string) {
  assertIdentifier(sessionId, "sessionId")
  const row = database
    .query("SELECT created_at FROM session WHERE session_id = ?1")
    .get(sessionId) as { created_at: number } | null
  return row === null ? undefined : { sessionId, createdAt: row.created_at }
}

export function admitUserTurn(
  database: Database,
  input: {
    sessionId: string
    turnId: string
    itemId: string
    content: string
    createdAt: number
    limits?: { modelOperations: number; toolInvocations: number }
  },
) {
  assertIdentifier(input.sessionId, "sessionId")
  assertIdentifier(input.turnId, "turnId")
  assertIdentifier(input.itemId, "itemId")
  assertText(input.content, "content")
  assertTimestamp(input.createdAt, "createdAt")
  const limits = input.limits ?? DEFAULT_TURN_LIMITS
  assertPositiveInteger(limits.modelOperations, "limits.modelOperations")
  assertPositiveInteger(limits.toolInvocations, "limits.toolInvocations")

  return database.transaction(() => {
    const existing = database
      .query(`
        SELECT
          item.sequence,
          item.session_id,
          item.turn_id,
          item.role,
          item.content,
          item.created_at,
          turn.model_operation_limit,
          turn.tool_invocation_limit
        FROM session_item AS item
        JOIN turn ON turn.turn_id = item.turn_id
        WHERE item.item_id = ?1
      `)
      .get(input.itemId) as
      | {
          sequence: number
          session_id: string
          turn_id: string
          role: string
          content: string
          created_at: number
          model_operation_limit: number
          tool_invocation_limit: number
        }
      | null
    if (existing) {
      if (
        existing.session_id !== input.sessionId ||
        existing.turn_id !== input.turnId ||
        existing.role !== "user" ||
        existing.content !== input.content ||
        existing.created_at !== input.createdAt ||
        existing.model_operation_limit !== limits.modelOperations ||
        existing.tool_invocation_limit !== limits.toolInvocations
      ) {
        throw new Error(`Admitted input ID was reused with different input: ${input.itemId}`)
      }
      return { replayed: true as const, sessionSequence: existing.sequence }
    }

    const session = database
      .query("SELECT created_at FROM session WHERE session_id = ?1")
      .get(input.sessionId) as { created_at: number } | null
    if (!session) throw new Error(`Unknown Session: ${input.sessionId}`)
    if (input.createdAt < readLatestSessionEventAt(database, input.sessionId)) {
      throw new Error("Turn input occurs before the latest durable Session event")
    }

    const reusedTurn = database
      .query("SELECT 1 AS found FROM turn WHERE turn_id = ?1")
      .get(input.turnId)
    if (reusedTurn) throw new Error(`Turn ID was reused: ${input.turnId}`)

    database
      .query(`
        INSERT INTO turn (
          turn_id,
          session_id,
          status,
          model_operation_limit,
          tool_invocation_limit,
          started_at
        ) VALUES (?1, ?2, 'running', ?3, ?4, ?5)
      `)
      .run(
        input.turnId,
        input.sessionId,
        limits.modelOperations,
        limits.toolInvocations,
        input.createdAt,
      )
    const inserted = database
      .query(`
        INSERT INTO session_item (item_id, session_id, turn_id, role, content, created_at)
        VALUES (?1, ?2, ?3, 'user', ?4, ?5)
        RETURNING sequence
      `)
      .get(input.itemId, input.sessionId, input.turnId, input.content, input.createdAt) as {
      sequence: number
    }
    return { replayed: false as const, sessionSequence: inserted.sequence }
  }).immediate()
}

export function appendSessionItem(
  database: Database,
  input: {
    itemId: string
    sessionId: string
    turnId: string
    role: "assistant" | "tool"
    content: string
    createdAt: number
  },
) {
  assertIdentifier(input.itemId, "itemId")
  assertIdentifier(input.sessionId, "sessionId")
  assertIdentifier(input.turnId, "turnId")
  assertText(input.content, "content")
  assertTimestamp(input.createdAt, "createdAt")

  return database.transaction(() => {
    const existing = database
      .query(`
        SELECT session_id, turn_id, role, content, created_at, sequence
        FROM session_item
        WHERE item_id = ?1
      `)
      .get(input.itemId) as
      | {
          session_id: string
          turn_id: string
          role: string
          content: string
          created_at: number
          sequence: number
        }
      | null
    if (existing) {
      if (
        existing.session_id !== input.sessionId ||
        existing.turn_id !== input.turnId ||
        existing.role !== input.role ||
        existing.content !== input.content ||
        existing.created_at !== input.createdAt
      ) {
        throw new Error(`Session item ID was reused with different input: ${input.itemId}`)
      }
      return { replayed: true as const, sessionSequence: existing.sequence }
    }

    const turn = database
      .query("SELECT session_id, status, started_at FROM turn WHERE turn_id = ?1")
      .get(input.turnId) as
      | { session_id: string; status: string; started_at: number }
      | null
    if (!turn) throw new Error(`Unknown Turn: ${input.turnId}`)
    if (turn.session_id !== input.sessionId) {
      throw new Error("Session item Session does not match its Turn")
    }
    if (turn.status !== "running") {
      throw new Error(`Cannot append output to a terminal Turn: ${input.turnId}`)
    }
    if (input.createdAt < turn.started_at) {
      throw new Error("Session item cannot occur before its Turn")
    }
    if (input.createdAt < readLatestTurnEventAt(database, input.turnId)) {
      throw new Error("Session item cannot occur before the latest Turn event")
    }

    const inserted = database
      .query(`
        INSERT INTO session_item (item_id, session_id, turn_id, role, content, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        RETURNING sequence
      `)
      .get(
        input.itemId,
        input.sessionId,
        input.turnId,
        input.role,
        input.content,
        input.createdAt,
      ) as { sequence: number }
    return { replayed: false as const, sessionSequence: inserted.sequence }
  }).immediate()
}

export function readSessionItems(database: Database, sessionId: string) {
  assertIdentifier(sessionId, "sessionId")
  const session = readSession(database, sessionId)
  if (!session) throw new Error(`Unknown Session: ${sessionId}`)
  const rows = database
    .query(`
      SELECT sequence, item_id, turn_id, role, content, created_at
      FROM session_item
      WHERE session_id = ?1
      ORDER BY sequence ASC
    `)
    .all(sessionId) as Array<{
    sequence: number
    item_id: string
    turn_id: string
    role: "user" | "assistant" | "tool"
    content: string
    created_at: number
  }>
  return rows.map((row) => ({
    sequence: row.sequence,
    itemId: row.item_id,
    sessionId,
    turnId: row.turn_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }))
}

export function finishTurn(
  database: Database,
  input: {
    turnId: string
    outcome: "completed" | "failed" | "interrupted"
    finishedAt: number
  },
) {
  assertIdentifier(input.turnId, "turnId")
  assertTimestamp(input.finishedAt, "finishedAt")
  return database.transaction(() => {
    const turn = database
      .query("SELECT status, started_at FROM turn WHERE turn_id = ?1")
      .get(input.turnId) as { status: string; started_at: number } | null
    if (!turn) throw new Error(`Unknown Turn: ${input.turnId}`)
    if (turn.status !== "running") throw new Error(`Turn is already terminal: ${input.turnId}`)
    if (input.finishedAt < turn.started_at) throw new Error("Turn cannot finish before it starts")

    const latestTurnEventAt = readLatestTurnEventAt(database, input.turnId)
    if (input.finishedAt < latestTurnEventAt) {
      throw new Error("Turn cannot finish before its latest child event")
    }

    const runningChildren = database
      .query(`
        SELECT
          EXISTS(
            SELECT 1 FROM model_operation
            WHERE turn_id = ?1 AND status = 'running'
          ) AS running_models,
          EXISTS(
            SELECT 1
            FROM tool_invocation AS invocation
            JOIN model_operation AS model
              ON model.model_operation_id = invocation.model_operation_id
            WHERE model.turn_id = ?1 AND invocation.status = 'running'
          ) AS running_tools
      `)
      .get(input.turnId) as { running_models: number; running_tools: number }
    if (
      input.outcome === "completed" &&
      (runningChildren.running_models !== 0 || runningChildren.running_tools !== 0)
    ) {
      throw new Error("A completed Turn cannot retain running model or tool work")
    }

    if (input.outcome !== "completed") {
      const toolFailure = canonicalJson({
        ok: false,
        code: "turn_terminated",
        message: `Turn ended as ${input.outcome} before the tool invocation settled`,
      })
      database
        .query(`
          UPDATE tool_invocation
          SET status = 'failed', error_json = ?1, settled_at = ?2
          WHERE status = 'running'
            AND model_operation_id IN (
              SELECT model_operation_id FROM model_operation WHERE turn_id = ?3
            )
        `)
        .run(toolFailure, input.finishedAt, input.turnId)
      database
        .query(`
          UPDATE model_operation
          SET status = 'failed', completed_at = ?1
          WHERE turn_id = ?2 AND status = 'running'
        `)
        .run(input.finishedAt, input.turnId)
    }

    const updated = database
      .query(`
        UPDATE turn
        SET status = ?1, finished_at = ?2
        WHERE turn_id = ?3 AND status = 'running'
      `)
      .run(input.outcome, input.finishedAt, input.turnId)
    if (updated.changes !== 1) throw new Error(`Turn changed before settlement: ${input.turnId}`)
    return { status: input.outcome }
  }).immediate()
}

export function readTurn(database: Database, turnId: string) {
  const row = database
    .query(`
      SELECT
        turn.session_id,
        turn.status,
        turn.model_operation_limit,
        turn.tool_invocation_limit,
        turn.started_at,
        turn.finished_at,
        exhaustion.attempt_kind,
        exhaustion.attempted_id,
        exhaustion.observed_count,
        exhaustion.configured_limit,
        exhaustion.occurred_at
      FROM turn
      LEFT JOIN turn_exhaustion AS exhaustion
        ON exhaustion.turn_id = turn.turn_id
      WHERE turn.turn_id = ?1
    `)
    .get(turnId) as
    | {
        session_id: string
        status: "running" | "completed" | "failed" | "interrupted" | "exhausted"
        model_operation_limit: number
        tool_invocation_limit: number
        started_at: number
        finished_at: number | null
        attempt_kind: "model_operation" | "tool_invocation" | null
        attempted_id: string | null
        observed_count: number | null
        configured_limit: number | null
        occurred_at: number | null
      }
    | null
  if (!row) throw new Error(`Unknown Turn: ${turnId}`)
  return {
    turnId,
    sessionId: row.session_id,
    status: row.status,
    limits: {
      modelOperations: row.model_operation_limit,
      toolInvocations: row.tool_invocation_limit,
    },
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    ...(row.attempt_kind === null
      ? {}
      : {
          exhaustion: {
            counter:
              row.attempt_kind === "model_operation" ? "model_operations" : "tool_invocations",
            observed: row.observed_count as number,
            limit: row.configured_limit as number,
            attemptedId: row.attempted_id as string,
            occurredAt: row.occurred_at as number,
          },
        }),
  }
}

/**
 * Low-level composition boundary for a model sample. The context factory is
 * invoked synchronously inside the same write transaction that admits the
 * operation, so a context cut cannot age or observe a different durable state
 * before it is owned by a model operation.
 */
export function beginModelOperation<TContext extends object>(
  database: Database,
  input: {
    modelOperationId: string
    turnId: string
    sampling: {
      sessionId: string
      sampledAt: number
      timeZone: string
      policyProfileRevision: string
    }
    compileContext: () => ModelContextCut<TContext>
  },
) {
  assertIdentifier(input.modelOperationId, "modelOperationId")
  assertIdentifier(input.turnId, "turnId")
  assertIdentifier(input.sampling.sessionId, "sampling.sessionId")
  assertTimestamp(input.sampling.sampledAt, "sampling.sampledAt")
  assertIdentifier(input.sampling.policyProfileRevision, "sampling.policyProfileRevision")
  assertTimeZone(input.sampling.timeZone)
  const exhaustionRequestJson = canonicalJson({
    modelOperationId: input.modelOperationId,
    turnId: input.turnId,
    sampling: input.sampling,
  })
  return database.transaction(() => {
    const existing = database
      .query(`
        SELECT
          model.turn_id,
          turn.session_id,
          model.policy_profile_revision,
          model.sampled_at,
          model.time_zone
        FROM model_operation AS model
        JOIN turn ON turn.turn_id = model.turn_id
        WHERE model.model_operation_id = ?1
      `)
      .get(input.modelOperationId) as
      | {
          turn_id: string
          session_id: string
          policy_profile_revision: string
          sampled_at: number
          time_zone: string
        }
      | null
    if (existing) {
      if (
        existing.turn_id !== input.turnId ||
        existing.session_id !== input.sampling.sessionId ||
        existing.policy_profile_revision !== input.sampling.policyProfileRevision ||
        existing.sampled_at !== input.sampling.sampledAt ||
        existing.time_zone !== input.sampling.timeZone
      ) {
        throw new Error(
          `Model operation ID was reused with different input: ${input.modelOperationId}`,
        )
      }
      return { replayed: true as const }
    }

    const priorExhaustion = readTurnExhaustionByAttempt(
      database,
      "model_operation",
      input.modelOperationId,
    )
    if (priorExhaustion) {
      if (
        priorExhaustion.turn_id !== input.turnId ||
        priorExhaustion.request_json !== exhaustionRequestJson
      ) {
        throw new Error(
          `Model operation ID was reused with different input: ${input.modelOperationId}`,
        )
      }
      return {
        exhausted: true as const,
        counter: "model_operations" as const,
        observed: priorExhaustion.observed_count,
        limit: priorExhaustion.configured_limit,
        attemptedModelOperationId: input.modelOperationId,
      }
    }

    const turn = database
      .query(`
        SELECT session_id, status, model_operation_limit
        FROM turn
        WHERE turn_id = ?1
      `)
      .get(input.turnId) as
      | { session_id: string; status: string; model_operation_limit: number }
      | null
    if (!turn) throw new Error(`Unknown Turn: ${input.turnId}`)
    if (turn.status !== "running") throw new Error(`Turn is not running: ${input.turnId}`)
    if (turn.session_id !== input.sampling.sessionId) {
      throw new Error("Context cut Session does not match model operation Turn")
    }
    const runningOperation = database
      .query(`
        SELECT model_operation_id
        FROM model_operation
        WHERE turn_id = ?1 AND status = 'running'
      `)
      .get(input.turnId) as { model_operation_id: string } | null
    if (runningOperation) {
      throw new Error(
        `Turn already has a running model operation: ${runningOperation.model_operation_id}`,
      )
    }
    const unsettledTool = database
      .query(`
        SELECT invocation.invocation_id
        FROM tool_invocation AS invocation
        JOIN model_operation AS model
          ON model.model_operation_id = invocation.model_operation_id
        WHERE model.turn_id = ?1 AND invocation.status = 'running'
        LIMIT 1
      `)
      .get(input.turnId) as { invocation_id: string } | null
    if (unsettledTool) {
      throw new Error(
        `Turn has an unsettled tool invocation: ${unsettledTool.invocation_id}`,
      )
    }
    if (input.sampling.sampledAt < readLatestTurnEventAt(database, input.turnId)) {
      throw new Error("Model context cut occurs before the latest Turn event")
    }
    const operationCount = database
      .query("SELECT COUNT(*) AS count FROM model_operation WHERE turn_id = ?1")
      .get(input.turnId) as { count: number }
    if (operationCount.count >= turn.model_operation_limit) {
      const latestStateTransitionAt = readLastStateTransitionAt(database)
      if (input.sampling.sampledAt < latestStateTransitionAt) {
        throw new Error("Model operation exhaustion occurs before the latest state transition")
      }
      database
        .query(`
          INSERT INTO turn_exhaustion (
            turn_id,
            attempt_kind,
            attempted_id,
            observed_count,
            configured_limit,
            request_json,
            occurred_at
          ) VALUES (?1, 'model_operation', ?2, ?3, ?4, ?5, ?6)
        `)
        .run(
          input.turnId,
          input.modelOperationId,
          operationCount.count,
          turn.model_operation_limit,
          exhaustionRequestJson,
          input.sampling.sampledAt,
        )
      const exhausted = database
        .query(`
          UPDATE turn
          SET status = 'exhausted', finished_at = ?1
          WHERE turn_id = ?2 AND status = 'running'
        `)
        .run(input.sampling.sampledAt, input.turnId)
      if (exhausted.changes !== 1) {
        throw new Error(`Turn changed before model-operation exhaustion: ${input.turnId}`)
      }
      return {
        exhausted: true as const,
        counter: "model_operations" as const,
        observed: operationCount.count,
        limit: turn.model_operation_limit,
        attemptedModelOperationId: input.modelOperationId,
      }
    }

    const context = input.compileContext()
    if (!Object.isFrozen(context)) {
      throw new Error("Model operation requires an immutable compiled context cut")
    }
    if (
      context.sessionId !== input.sampling.sessionId ||
      context.sampledAt !== input.sampling.sampledAt ||
      context.policyProfileRevision !== input.sampling.policyProfileRevision ||
      context.timeZone !== input.sampling.timeZone
    ) {
      throw new Error("Compiled context cut does not match its sampling request")
    }
    if (
      !Number.isSafeInteger(context.sessionSequence) ||
      context.sessionSequence < 0 ||
      !Number.isSafeInteger(context.stateRevision) ||
      context.stateRevision < 0 ||
      !Number.isSafeInteger(context.stateTransitionAt) ||
      context.stateTransitionAt < 0
    ) {
      throw new Error("Context cut sequence and revision must be non-negative integers")
    }
    const contextJson = canonicalJson(context)

    if (context.sampledAt < readLatestSessionEventAt(database, turn.session_id)) {
      throw new Error("Model context cut occurs before durable Session history")
    }

    const currentSequence = readSessionSequence(database, turn.session_id)
    if (currentSequence !== context.sessionSequence) {
      throw new Error(
        `Stale Session cut: expected ${context.sessionSequence}, current ${currentSequence}`,
      )
    }
    const currentRevision = readStateRevision(database)
    if (currentRevision !== context.stateRevision) {
      throw new Error(
        `Stale state cut: expected ${context.stateRevision}, current ${currentRevision}`,
      )
    }
    const currentTransitionAt = readLastStateTransitionAt(database)
    if (currentTransitionAt !== context.stateTransitionAt) {
      throw new Error(
        `Stale state time: expected ${context.stateTransitionAt}, current ${currentTransitionAt}`,
      )
    }
    if (context.sampledAt < currentTransitionAt) {
      throw new Error("Model context cut occurs before the latest durable state transition")
    }

    database
      .query(`
        INSERT INTO model_operation (
          model_operation_id,
          turn_id,
          session_sequence,
          state_revision,
          state_transition_at,
          policy_profile_revision,
          sampled_at,
          time_zone,
          context_json,
          status
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'running')
      `)
      .run(
        input.modelOperationId,
        input.turnId,
        context.sessionSequence,
        context.stateRevision,
        context.stateTransitionAt,
        context.policyProfileRevision,
        context.sampledAt,
        context.timeZone,
        contextJson,
      )
    return { replayed: false as const, context }
  }).immediate()
}

export function readModelOperation(database: Database, modelOperationId: string) {
  const row = database
    .query(`
      SELECT
        turn_id,
        session_sequence,
        state_revision,
        state_transition_at,
        policy_profile_revision,
        sampled_at,
        time_zone,
        context_json,
        status
      FROM model_operation
      WHERE model_operation_id = ?1
    `)
    .get(modelOperationId) as
    | {
        turn_id: string
        session_sequence: number
        state_revision: number
        state_transition_at: number
        policy_profile_revision: string
        sampled_at: number
        time_zone: string
        context_json: string
        status: "running" | "completed" | "failed"
      }
    | null
  if (!row) throw new Error(`Unknown model operation: ${modelOperationId}`)
  return {
    modelOperationId,
    turnId: row.turn_id,
    sessionSequence: row.session_sequence,
    stateRevision: row.state_revision,
    stateTransitionAt: row.state_transition_at,
    policyProfileRevision: row.policy_profile_revision,
    sampledAt: row.sampled_at,
    timeZone: row.time_zone,
    context: JSON.parse(row.context_json) as ModelContextCut<Record<string, unknown>>,
    status: row.status,
  }
}

export function finishModelOperation(
  database: Database,
  input: {
    modelOperationId: string
    outcome: "completed" | "failed"
    finishedAt: number
  },
) {
  assertIdentifier(input.modelOperationId, "modelOperationId")
  assertTimestamp(input.finishedAt, "finishedAt")
  return database.transaction(() => {
    const operation = database
      .query(`
        SELECT
          model.status,
          model.sampled_at,
          model.turn_id,
          turn.status AS turn_status,
          turn.tool_invocation_limit
        FROM model_operation AS model
        JOIN turn ON turn.turn_id = model.turn_id
        WHERE model.model_operation_id = ?1
      `)
      .get(input.modelOperationId) as
      | {
          status: string
          sampled_at: number
          turn_id: string
          turn_status: string
          tool_invocation_limit: number
        }
      | null
    if (!operation) throw new Error(`Unknown model operation: ${input.modelOperationId}`)
    if (operation.status !== "running") {
      throw new Error(`Model operation is already terminal: ${input.modelOperationId}`)
    }
    if (input.finishedAt < operation.sampled_at) {
      throw new Error("Model operation cannot finish before its context cut")
    }
    if (input.finishedAt < readLatestTurnEventAt(database, operation.turn_id)) {
      throw new Error("Model operation cannot finish before the latest Turn event")
    }
    const updated = database
      .query(`
        UPDATE model_operation
        SET status = ?1, completed_at = ?2
        WHERE model_operation_id = ?3 AND status = 'running'
      `)
      .run(input.outcome, input.finishedAt, input.modelOperationId)
    if (updated.changes !== 1) {
      throw new Error(`Model operation changed before settlement: ${input.modelOperationId}`)
    }
    return { status: input.outcome }
  }).immediate()
}

export function recordToolInvocation(
  database: Database,
  input: {
    invocationId: string
    modelOperationId: string
    toolName: string
    input: unknown
    createdAt: number
  },
) {
  assertIdentifier(input.invocationId, "invocationId")
  assertIdentifier(input.modelOperationId, "modelOperationId")
  assertIdentifier(input.toolName, "toolName")
  assertTimestamp(input.createdAt, "createdAt")
  const inputJson = canonicalJson(input.input)
  const exhaustionRequestJson = canonicalJson({
    invocationId: input.invocationId,
    modelOperationId: input.modelOperationId,
    toolName: input.toolName,
    input: input.input,
    createdAt: input.createdAt,
  })
  return database.transaction(() => {
    const existing = database
      .query(`
        SELECT model_operation_id, tool_name, input_json, created_at
        FROM tool_invocation
        WHERE invocation_id = ?1
      `)
      .get(input.invocationId) as
      | {
          model_operation_id: string
          tool_name: string
          input_json: string
          created_at: number
        }
      | null
    if (existing) {
      if (
        existing.model_operation_id !== input.modelOperationId ||
        existing.tool_name !== input.toolName ||
        existing.input_json !== inputJson ||
        existing.created_at !== input.createdAt
      ) {
        throw new Error(`Tool invocation ID was reused with different input: ${input.invocationId}`)
      }
      return { replayed: true as const }
    }

    const priorExhaustion = readTurnExhaustionByAttempt(
      database,
      "tool_invocation",
      input.invocationId,
    )
    if (priorExhaustion) {
      if (priorExhaustion.request_json !== exhaustionRequestJson) {
        throw new Error(`Tool invocation ID was reused with different input: ${input.invocationId}`)
      }
      return {
        exhausted: true as const,
        counter: "tool_invocations" as const,
        observed: priorExhaustion.observed_count,
        limit: priorExhaustion.configured_limit,
        attemptedInvocationId: input.invocationId,
      }
    }

    const operation = database
      .query(`
        SELECT
          model.status,
          model.sampled_at,
          model.turn_id,
          turn.status AS turn_status,
          turn.tool_invocation_limit
        FROM model_operation AS model
        JOIN turn ON turn.turn_id = model.turn_id
        WHERE model.model_operation_id = ?1
      `)
      .get(input.modelOperationId) as
      | {
          status: string
          sampled_at: number
          turn_id: string
          turn_status: string
          tool_invocation_limit: number
        }
      | null
    if (!operation) throw new Error(`Unknown model operation: ${input.modelOperationId}`)
    if (operation.status !== "running") {
      throw new Error(`Model operation is not running: ${input.modelOperationId}`)
    }
    if (operation.turn_status !== "running") {
      throw new Error(`Turn is not running: ${operation.turn_id}`)
    }
    if (input.createdAt < operation.sampled_at) {
      throw new Error("Tool invocation occurs before its model context cut")
    }
    if (input.createdAt < readLatestTurnEventAt(database, operation.turn_id)) {
      throw new Error("Tool invocation occurs before the latest Turn event")
    }

    const invocationCount = database
      .query(`
        SELECT COUNT(*) AS count
        FROM tool_invocation AS invocation
        JOIN model_operation AS model
          ON model.model_operation_id = invocation.model_operation_id
        WHERE model.turn_id = ?1
      `)
      .get(operation.turn_id) as { count: number }
    if (invocationCount.count >= operation.tool_invocation_limit) {
      database
        .query(`
          INSERT INTO turn_exhaustion (
            turn_id,
            attempt_kind,
            attempted_id,
            observed_count,
            configured_limit,
            request_json,
            occurred_at
          ) VALUES (?1, 'tool_invocation', ?2, ?3, ?4, ?5, ?6)
        `)
        .run(
          operation.turn_id,
          input.invocationId,
          invocationCount.count,
          operation.tool_invocation_limit,
          exhaustionRequestJson,
          input.createdAt,
        )
      const failure = canonicalJson({
        ok: false,
        code: "turn_exhausted",
        message: `Turn reached its tool invocation limit of ${operation.tool_invocation_limit}`,
      })
      database
        .query(`
          UPDATE tool_invocation
          SET status = 'failed', error_json = ?1, settled_at = ?2
          WHERE status = 'running'
            AND model_operation_id IN (
              SELECT model_operation_id FROM model_operation WHERE turn_id = ?3
            )
        `)
        .run(failure, input.createdAt, operation.turn_id)
      database
        .query(`
          UPDATE model_operation
          SET status = 'failed', completed_at = ?1
          WHERE turn_id = ?2 AND status = 'running'
        `)
        .run(input.createdAt, operation.turn_id)
      const exhausted = database
        .query(`
          UPDATE turn
          SET status = 'exhausted', finished_at = ?1
          WHERE turn_id = ?2 AND status = 'running'
        `)
        .run(input.createdAt, operation.turn_id)
      if (exhausted.changes !== 1) {
        throw new Error(`Turn changed before tool-invocation exhaustion: ${operation.turn_id}`)
      }
      return {
        exhausted: true as const,
        counter: "tool_invocations" as const,
        observed: invocationCount.count,
        limit: operation.tool_invocation_limit,
        attemptedInvocationId: input.invocationId,
      }
    }

    database
      .query(`
        INSERT INTO tool_invocation (
          invocation_id,
          model_operation_id,
          tool_name,
          input_json,
          status,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, 'running', ?5)
      `)
      .run(input.invocationId, input.modelOperationId, input.toolName, inputJson, input.createdAt)
    return { replayed: false as const }
  }).immediate()
}

export function settleToolInvocationFailure(
  database: Database,
  input: { invocationId: string; error: unknown; failedAt: number },
) {
  assertIdentifier(input.invocationId, "invocationId")
  assertTimestamp(input.failedAt, "failedAt")
  const errorJson = canonicalJson(input.error)
  return database.transaction(() => {
    const invocation = database
      .query(`
        SELECT
          invocation.status,
          invocation.error_json,
          invocation.created_at,
          model.turn_id
        FROM tool_invocation AS invocation
        JOIN model_operation AS model
          ON model.model_operation_id = invocation.model_operation_id
        WHERE invocation.invocation_id = ?1
      `)
      .get(input.invocationId) as
      | {
          status: "running" | "completed" | "failed"
          error_json: string | null
          created_at: number
          turn_id: string
        }
      | null
    if (!invocation) throw new Error(`Unknown tool invocation: ${input.invocationId}`)
    if (invocation.status === "completed") {
      throw new Error(`Cannot fail a completed tool invocation: ${input.invocationId}`)
    }
    if (invocation.status === "failed") {
      if (invocation.error_json === null) {
        throw new Error(`Failed tool invocation has no error: ${input.invocationId}`)
      }
      return JSON.parse(invocation.error_json) as unknown
    }
    if (input.failedAt < invocation.created_at) {
      throw new Error("Tool failure cannot occur before its recorded invocation")
    }
    if (input.failedAt < readLatestTurnEventAt(database, invocation.turn_id)) {
      throw new Error("Tool failure cannot occur before the latest Turn event")
    }
    const settled = database
      .query(`
        UPDATE tool_invocation
        SET status = 'failed', error_json = ?1, settled_at = ?2
        WHERE invocation_id = ?3 AND status = 'running'
      `)
      .run(errorJson, input.failedAt, input.invocationId)
    if (settled.changes !== 1) {
      throw new Error(`Tool invocation changed before failure settlement: ${input.invocationId}`)
    }
    return input.error
  }).immediate()
}

export function readToolInvocation(database: Database, invocationId: string) {
  const row = database
    .query(`
      SELECT
        model_operation_id,
        tool_name,
        input_json,
        status,
        effect_id,
        result_json,
        error_json,
        created_at,
        settled_at
      FROM tool_invocation
      WHERE invocation_id = ?1
    `)
    .get(invocationId) as
    | {
        model_operation_id: string
        tool_name: string
        input_json: string
        status: "running" | "completed" | "failed"
        effect_id: string | null
        result_json: string | null
        error_json: string | null
        created_at: number
        settled_at: number | null
      }
    | null
  if (!row) throw new Error(`Unknown tool invocation: ${invocationId}`)
  return {
    invocationId,
    modelOperationId: row.model_operation_id,
    toolName: row.tool_name,
    input: JSON.parse(row.input_json) as unknown,
    status: row.status,
    effectId: row.effect_id ?? undefined,
    result: row.result_json === null ? undefined : (JSON.parse(row.result_json) as unknown),
    error: row.error_json === null ? undefined : (JSON.parse(row.error_json) as unknown),
    createdAt: row.created_at,
    settledAt: row.settled_at ?? undefined,
  }
}

/**
 * Call once at process startup only after the caller has established that no
 * prior in-memory Session owner is still alive. Opening an additional SQLite
 * connection is not, by itself, proof that durable work is orphaned.
 */
export function recoverOrphanedRuntime(
  database: Database,
  input: { recoveredAt: number },
) {
  assertTimestamp(input.recoveredAt, "recoveredAt")
  return database.transaction(() => {
    const latestRunningTime = database
      .query(`
        SELECT MAX(event_at) AS latest
        FROM (
          SELECT turn.started_at AS event_at
          FROM turn
          WHERE turn.status = 'running'

          UNION ALL

          SELECT model.sampled_at AS event_at
          FROM model_operation AS model
          JOIN turn ON turn.turn_id = model.turn_id
          WHERE turn.status = 'running'

          UNION ALL

          SELECT model.completed_at AS event_at
          FROM model_operation AS model
          JOIN turn ON turn.turn_id = model.turn_id
          WHERE turn.status = 'running' AND model.completed_at IS NOT NULL

          UNION ALL

          SELECT item.created_at AS event_at
          FROM session_item AS item
          JOIN turn ON turn.turn_id = item.turn_id
          WHERE turn.status = 'running'

          UNION ALL

          SELECT invocation.created_at AS event_at
          FROM tool_invocation AS invocation
          JOIN model_operation AS model
            ON model.model_operation_id = invocation.model_operation_id
          JOIN turn ON turn.turn_id = model.turn_id
          WHERE turn.status = 'running'

          UNION ALL

          SELECT invocation.settled_at AS event_at
          FROM tool_invocation AS invocation
          JOIN model_operation AS model
            ON model.model_operation_id = invocation.model_operation_id
          JOIN turn ON turn.turn_id = model.turn_id
          WHERE turn.status = 'running' AND invocation.settled_at IS NOT NULL
        )
      `)
      .get() as { latest: number | null }
    if (latestRunningTime.latest !== null && input.recoveredAt < latestRunningTime.latest) {
      throw new Error("Recovery time occurs before orphaned durable work")
    }

    const toolFailure = canonicalJson({
      ok: false,
      code: "runtime_restarted",
      message: "The process restarted before the tool invocation settled",
    })
    const failedTools = database
      .query(`
        UPDATE tool_invocation
        SET status = 'failed', error_json = ?1, settled_at = ?2
        WHERE status = 'running'
      `)
      .run(toolFailure, input.recoveredAt)
    const failedModels = database
      .query(`
        UPDATE model_operation
        SET status = 'failed', completed_at = ?1
        WHERE status = 'running'
      `)
      .run(input.recoveredAt)
    const interruptedTurns = database
      .query(`
        UPDATE turn
        SET status = 'interrupted', finished_at = ?1
        WHERE status = 'running'
      `)
      .run(input.recoveredAt)
    return {
      interruptedTurns: interruptedTurns.changes,
      failedModelOperations: failedModels.changes,
      failedToolInvocations: failedTools.changes,
    }
  }).immediate()
}

export function readStateRevision(database: Database) {
  const row = database
    .query("SELECT state_revision FROM system_state WHERE singleton = 1")
    .get() as { state_revision: number }
  return row.state_revision
}

export function readLastStateTransitionAt(database: Database) {
  const row = database
    .query("SELECT last_transition_at FROM system_state WHERE singleton = 1")
    .get() as { last_transition_at: number }
  return row.last_transition_at
}

export function readSessionSequence(database: Database, sessionId: string) {
  const row = database
    .query("SELECT MAX(sequence) AS sequence FROM session_item WHERE session_id = ?1")
    .get(sessionId) as { sequence: number | null }
  return row.sequence ?? 0
}

/**
 * Returns the causal time floor for admitting or sampling later work in one
 * Session. Session item order alone is insufficient: a failed or interrupted
 * Turn can have a terminal event after its last model-visible item.
 */
export function readLatestSessionEventAt(database: Database, sessionId: string) {
  assertIdentifier(sessionId, "sessionId")
  const row = database
    .query(`
      SELECT MAX(event_at) AS event_at
      FROM (
        SELECT created_at AS event_at
        FROM session
        WHERE session_id = ?1

        UNION ALL

        SELECT started_at AS event_at
        FROM turn
        WHERE session_id = ?1

        UNION ALL

        SELECT finished_at AS event_at
        FROM turn
        WHERE session_id = ?1 AND finished_at IS NOT NULL

        UNION ALL

        SELECT item.created_at AS event_at
        FROM session_item AS item
        WHERE item.session_id = ?1

        UNION ALL

        SELECT model.sampled_at AS event_at
        FROM model_operation AS model
        JOIN turn ON turn.turn_id = model.turn_id
        WHERE turn.session_id = ?1

        UNION ALL

        SELECT model.completed_at AS event_at
        FROM model_operation AS model
        JOIN turn ON turn.turn_id = model.turn_id
        WHERE turn.session_id = ?1 AND model.completed_at IS NOT NULL

        UNION ALL

        SELECT invocation.created_at AS event_at
        FROM tool_invocation AS invocation
        JOIN model_operation AS model
          ON model.model_operation_id = invocation.model_operation_id
        JOIN turn ON turn.turn_id = model.turn_id
        WHERE turn.session_id = ?1

        UNION ALL

        SELECT invocation.settled_at AS event_at
        FROM tool_invocation AS invocation
        JOIN model_operation AS model
          ON model.model_operation_id = invocation.model_operation_id
        JOIN turn ON turn.turn_id = model.turn_id
        WHERE turn.session_id = ?1 AND invocation.settled_at IS NOT NULL

        UNION ALL

        SELECT exhaustion.occurred_at AS event_at
        FROM turn_exhaustion AS exhaustion
        JOIN turn ON turn.turn_id = exhaustion.turn_id
        WHERE turn.session_id = ?1
      )
    `)
    .get(sessionId) as { event_at: number | null }
  if (row.event_at === null) throw new Error(`Unknown Session: ${sessionId}`)
  return row.event_at
}

function readTurnExhaustionByAttempt(
  database: Database,
  attemptKind: "model_operation" | "tool_invocation",
  attemptedId: string,
) {
  return database
    .query(`
      SELECT
        turn_id,
        observed_count,
        configured_limit,
        request_json,
        occurred_at
      FROM turn_exhaustion
      WHERE attempt_kind = ?1 AND attempted_id = ?2
    `)
    .get(attemptKind, attemptedId) as
    | {
        turn_id: string
        observed_count: number
        configured_limit: number
        request_json: string
        occurred_at: number
      }
    | null
}

export function readLatestTurnEventAt(database: Database, turnId: string) {
  const row = database
    .query(`
      SELECT MAX(event_at) AS event_at
      FROM (
        SELECT started_at AS event_at
        FROM turn
        WHERE turn_id = ?1

        UNION ALL

        SELECT finished_at AS event_at
        FROM turn
        WHERE turn_id = ?1 AND finished_at IS NOT NULL

        UNION ALL

        SELECT sampled_at AS event_at
        FROM model_operation
        WHERE turn_id = ?1

        UNION ALL

        SELECT completed_at AS event_at
        FROM model_operation
        WHERE turn_id = ?1 AND completed_at IS NOT NULL

        UNION ALL

        SELECT created_at AS event_at
        FROM session_item
        WHERE turn_id = ?1

        UNION ALL

        SELECT invocation.created_at AS event_at
        FROM tool_invocation AS invocation
        JOIN model_operation AS model
          ON model.model_operation_id = invocation.model_operation_id
        WHERE model.turn_id = ?1

        UNION ALL

        SELECT invocation.settled_at AS event_at
        FROM tool_invocation AS invocation
        JOIN model_operation AS model
          ON model.model_operation_id = invocation.model_operation_id
        WHERE model.turn_id = ?1 AND invocation.settled_at IS NOT NULL

        UNION ALL

        SELECT occurred_at AS event_at
        FROM turn_exhaustion
        WHERE turn_id = ?1
      )
    `)
    .get(turnId) as { event_at: number | null }
  if (row.event_at === null) throw new Error(`Unknown Turn: ${turnId}`)
  return row.event_at
}

function assertIdentifier(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}

function assertText(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function assertTimestamp(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || Number.isNaN(new Date(value).getTime())) {
    throw new RangeError(`${label} must be a non-negative integer timestamp`)
  }
}

function assertTimeZone(timeZone: string) {
  if (!timeZone.trim()) throw new Error("context.timeZone must not be empty")
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0)
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}`)
  }
}
