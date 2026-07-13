import { Database } from "bun:sqlite"

export type FormalTaskResultInput = {
  invocationId: string
  attemptId: string
  taskId: string
  sourceItemId: string
  target: string
  outcome: "success" | "miss"
  assistance: "none" | "hinted"
  evaluatorRevision: string
  occurredAt: number
}

export type CandidateReason =
  | "formal_task_needed"
  | "ready_new_work"
  | "assessment_triggered_review"
  | "verification_obligation"
  | "naturally_due_review"

export type LearningContext = {
  target: string
  projectionRevision: number
  obligationRevision: number
  localSignal: "unresolved" | "locally_positive" | "needs_review" | "needs_verification"
  activeInterpretationIds: string[]
  candidateReasons: CandidateReason[]
}

export type TutorAction =
  | { kind: "offer_formal_task"; target: string }
  | { kind: "continue_ready_work"; target: string }
  | { kind: "targeted_review"; target: string }
  | { kind: "verify"; target: string }
  | { kind: "due_review"; target: string }

type InvocationStatus = "recorded" | "succeeded"
type EvidenceMeaning = "independent_success" | "guided_success" | "miss"

type InvocationRow = {
  invocation_id: string
  payload_json: string
  status: InvocationStatus
  result_json: string | null
}

type FormalTaskRow = {
  task_id: string
  target: string
  purpose: string
  alignment_source: string
}

type EvidenceRow = {
  sequence: number
  interpretation_id: string
  attempt_id: string
  target: string
  meaning: EvidenceMeaning
  status: "active" | "retracted"
}

type ProjectionRow = {
  target: string
  local_signal: LearningContext["localSignal"]
  active_interpretation_ids: string
  revision: number
}

type ObligationRow = {
  kind: "assessment_review" | "verification" | "scheduled_review"
  due_at: number | null
}

export class OperationConflictError extends Error {
  constructor(invocationId: string) {
    super(`Invocation ID was reused with different input: ${invocationId}`)
    this.name = "OperationConflictError"
  }
}

export function createLabDatabase() {
  const db = new Database(":memory:")
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE lab_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      projection_revision INTEGER NOT NULL,
      obligation_revision INTEGER NOT NULL
    );

    INSERT INTO lab_meta (
      singleton,
      projection_revision,
      obligation_revision
    ) VALUES (1, 0, 0);

    CREATE TABLE session_item (
      item_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('user_text', 'assistant_text')),
      body TEXT NOT NULL
    );

    CREATE TABLE formal_task (
      task_id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      purpose TEXT NOT NULL,
      alignment_source TEXT NOT NULL
    );

    CREATE TABLE tool_invocation (
      invocation_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('recorded', 'succeeded')),
      result_json TEXT
    );

    CREATE TABLE task_result (
      attempt_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES formal_task(task_id),
      source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      target TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'miss')),
      assistance TEXT NOT NULL CHECK (assistance IN ('none', 'hinted')),
      occurred_at INTEGER NOT NULL
    );

    CREATE TABLE evidence_interpretation (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      interpretation_id TEXT NOT NULL UNIQUE,
      attempt_id TEXT NOT NULL REFERENCES task_result(attempt_id),
      target TEXT NOT NULL,
      meaning TEXT NOT NULL CHECK (meaning IN ('independent_success', 'guided_success', 'miss')),
      evaluator_revision TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'retracted'))
    );

    CREATE TABLE evidence_correction (
      correction_id TEXT PRIMARY KEY,
      interpretation_id TEXT NOT NULL REFERENCES evidence_interpretation(interpretation_id),
      action TEXT NOT NULL CHECK (action = 'retract'),
      reason TEXT NOT NULL
    );

    CREATE TABLE learning_obligation (
      obligation_id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('assessment_review', 'verification', 'scheduled_review')),
      source_item_id TEXT REFERENCES session_item(item_id),
      source_interpretation_id TEXT REFERENCES evidence_interpretation(interpretation_id),
      due_at INTEGER,
      status TEXT NOT NULL CHECK (status IN ('active', 'cancelled'))
    );

    CREATE TABLE learner_projection (
      target TEXT PRIMARY KEY,
      local_signal TEXT NOT NULL CHECK (
        local_signal IN ('locally_positive', 'needs_review', 'needs_verification')
      ),
      active_interpretation_ids TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
  `)
  return db
}

export function recordSessionItem(
  db: Database,
  input: { itemId: string; kind: "user_text" | "assistant_text"; body: string },
) {
  db.query("INSERT INTO session_item (item_id, kind, body) VALUES (?1, ?2, ?3)").run(
    input.itemId,
    input.kind,
    input.body,
  )
}

export function registerFormalTask(
  db: Database,
  input: {
    taskId: string
    target: string
    purpose: "teaching" | "practice" | "assessment" | "review"
    alignmentSource: string
  },
) {
  db.query(`
    INSERT INTO formal_task (task_id, target, purpose, alignment_source)
    VALUES (?1, ?2, ?3, ?4)
  `).run(input.taskId, input.target, input.purpose, input.alignmentSource)
}

export function recordInvocation(db: Database, input: FormalTaskResultInput) {
  const payload = canonicalPayload(input)
  const existing = findInvocation(db, input.invocationId)
  if (existing) {
    assertSameOperation(existing, input.invocationId, payload)
    return { inserted: false, status: existing.status }
  }

  db.query(`
    INSERT INTO tool_invocation (invocation_id, payload_json, status)
    VALUES (?1, ?2, 'recorded')
  `).run(input.invocationId, payload)
  return { inserted: true, status: "recorded" as const }
}

export function commitFormalTaskResult(
  db: Database,
  input: FormalTaskResultInput,
  options: { injectFailure?: "before_settlement" } = {},
) {
  return db.transaction(() => {
    const invocation = findInvocation(db, input.invocationId)
    if (!invocation) throw new Error(`Invocation was not recorded: ${input.invocationId}`)
    assertSameOperation(invocation, input.invocationId, canonicalPayload(input))

    const interpretationId = interpretationIdentity(input)
    if (invocation.status === "succeeded") {
      return {
        inserted: false,
        attemptId: input.attemptId,
        interpretationId,
        projectionRevision: currentRevisions(db).projection,
      }
    }

    const task = findFormalTask(db, input.taskId)
    if (!task) throw new Error(`Formal task does not exist: ${input.taskId}`)
    if (task.target !== input.target) {
      throw new Error(`Task target mismatch: ${task.target} != ${input.target}`)
    }
    if (!sessionItemExists(db, input.sourceItemId)) {
      throw new Error(`Source Session item does not exist: ${input.sourceItemId}`)
    }

    db.query(`
      INSERT INTO task_result (
        attempt_id,
        task_id,
        source_item_id,
        target,
        outcome,
        assistance,
        occurred_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).run(
      input.attemptId,
      input.taskId,
      input.sourceItemId,
      input.target,
      input.outcome,
      input.assistance,
      input.occurredAt,
    )

    const meaning = evidenceMeaning(input)
    db.query(`
      INSERT INTO evidence_interpretation (
        interpretation_id,
        attempt_id,
        target,
        meaning,
        evaluator_revision,
        status
      ) VALUES (?1, ?2, ?3, ?4, ?5, 'active')
    `).run(interpretationId, input.attemptId, input.target, meaning, input.evaluatorRevision)

    if (meaning === "miss") {
      insertObligation(db, {
        obligationId: `assessment-review:${interpretationId}`,
        target: input.target,
        kind: "assessment_review",
        sourceInterpretationId: interpretationId,
      })
    } else if (meaning === "guided_success") {
      insertObligation(db, {
        obligationId: `verify:${interpretationId}`,
        target: input.target,
        kind: "verification",
        sourceInterpretationId: interpretationId,
      })
    }

    const projectionRevision = bumpProjectionRevision(db)
    rebuildProjectionAt(db, projectionRevision)

    if (options.injectFailure === "before_settlement") {
      throw new Error("injected failure before settlement")
    }

    const result = {
      attemptId: input.attemptId,
      interpretationId,
      projectionRevision,
    }
    const settlement = db.query(`
      UPDATE tool_invocation
      SET status = 'succeeded', result_json = ?2
      WHERE invocation_id = ?1 AND status = 'recorded'
    `).run(input.invocationId, JSON.stringify(result))
    if (settlement.changes !== 1) {
      throw new Error(`Invocation did not settle exactly once: ${input.invocationId}`)
    }

    return { inserted: true, ...result }
  })()
}

export function completeSelectedExplanation(
  db: Database,
  input: {
    obligationId: string
    sourceItemId: string
    target: string
    onCompletion: "verification_obligation"
  },
) {
  if (!sessionItemExists(db, input.sourceItemId)) {
    throw new Error(`Source Session item does not exist: ${input.sourceItemId}`)
  }
  db.transaction(() => {
    insertObligation(db, {
      obligationId: input.obligationId,
      target: input.target,
      kind: "verification",
      sourceItemId: input.sourceItemId,
    })
  })()
}

export function scheduleReview(
  db: Database,
  input: { obligationId: string; target: string; dueAt: number },
) {
  db.transaction(() => {
    insertObligation(db, {
      obligationId: input.obligationId,
      target: input.target,
      kind: "scheduled_review",
      dueAt: input.dueAt,
    })
  })()
}

export function correctInterpretation(
  db: Database,
  input: {
    correctionId: string
    interpretationId: string
    action: "retract"
    reason: string
  },
) {
  db.transaction(() => {
    const interpretation = db
      .query<EvidenceRow, [string]>(`
        SELECT sequence, interpretation_id, attempt_id, target, meaning, status
        FROM evidence_interpretation
        WHERE interpretation_id = ?1
      `)
      .get(input.interpretationId)
    if (!interpretation) {
      throw new Error(`Evidence interpretation does not exist: ${input.interpretationId}`)
    }
    if (interpretation.status !== "active") {
      throw new Error(`Evidence interpretation is already inactive: ${input.interpretationId}`)
    }

    db.query(`
      INSERT INTO evidence_correction (correction_id, interpretation_id, action, reason)
      VALUES (?1, ?2, ?3, ?4)
    `).run(input.correctionId, input.interpretationId, input.action, input.reason)
    db.query(`
      UPDATE evidence_interpretation
      SET status = 'retracted'
      WHERE interpretation_id = ?1
    `).run(input.interpretationId)

    const cancelled = db.query(`
      UPDATE learning_obligation
      SET status = 'cancelled'
      WHERE source_interpretation_id = ?1 AND status = 'active'
    `).run(input.interpretationId)
    if (cancelled.changes > 0) bumpObligationRevision(db)

    const revision = bumpProjectionRevision(db)
    rebuildProjectionAt(db, revision)
  })()
}

export function assembleLearningContext(
  db: Database,
  input: { target: string; now: number },
): LearningContext {
  const revisions = currentRevisions(db)
  const row = db
    .query<ProjectionRow, [string]>(`
      SELECT target, local_signal, active_interpretation_ids, revision
      FROM learner_projection
      WHERE target = ?1
    `)
    .get(input.target)

  const localSignal = row?.local_signal ?? "unresolved"
  const activeInterpretationIds = row
    ? (JSON.parse(row.active_interpretation_ids) as string[])
    : []
  const candidateReasons = candidateReasonsFor(db, input.target, input.now, localSignal)

  return {
    target: input.target,
    projectionRevision: row?.revision ?? revisions.projection,
    obligationRevision: revisions.obligation,
    localSignal,
    activeInterpretationIds,
    candidateReasons,
  }
}

export function selectNextAction(context: LearningContext): TutorAction {
  if (context.candidateReasons.includes("assessment_triggered_review")) {
    return { kind: "targeted_review", target: context.target }
  }
  if (context.candidateReasons.includes("verification_obligation")) {
    return { kind: "verify", target: context.target }
  }
  if (context.candidateReasons.includes("naturally_due_review")) {
    return { kind: "due_review", target: context.target }
  }
  if (context.candidateReasons.includes("ready_new_work")) {
    return { kind: "continue_ready_work", target: context.target }
  }
  return { kind: "offer_formal_task", target: context.target }
}

export function rebuildProjection(db: Database) {
  db.transaction(() => rebuildProjectionAt(db, currentRevisions(db).projection))()
}

export function deleteProjectionForRebuildTest(db: Database) {
  db.query("DELETE FROM learner_projection").run()
}

export function countTaskResults(db: Database) {
  return countRows(db, "task_result")
}

export function countEvidenceInterpretations(db: Database) {
  return countRows(db, "evidence_interpretation")
}

export function getInvocationStatus(db: Database, invocationId: string) {
  return findInvocation(db, invocationId)?.status
}

function canonicalPayload(input: FormalTaskResultInput) {
  return JSON.stringify([
    input.attemptId,
    input.taskId,
    input.sourceItemId,
    input.target,
    input.outcome,
    input.assistance,
    input.evaluatorRevision,
    input.occurredAt,
  ])
}

function interpretationIdentity(input: FormalTaskResultInput) {
  return `evidence:${input.attemptId}:${input.evaluatorRevision}`
}

function evidenceMeaning(input: FormalTaskResultInput): EvidenceMeaning {
  if (input.outcome === "miss") return "miss"
  return input.assistance === "none" ? "independent_success" : "guided_success"
}

function findInvocation(db: Database, invocationId: string) {
  return db
    .query<InvocationRow, [string]>(`
      SELECT invocation_id, payload_json, status, result_json
      FROM tool_invocation
      WHERE invocation_id = ?1
    `)
    .get(invocationId)
}

function assertSameOperation(row: InvocationRow, invocationId: string, payload: string) {
  if (row.payload_json !== payload) throw new OperationConflictError(invocationId)
}

function findFormalTask(db: Database, taskId: string) {
  return db
    .query<FormalTaskRow, [string]>(`
      SELECT task_id, target, purpose, alignment_source
      FROM formal_task
      WHERE task_id = ?1
    `)
    .get(taskId)
}

function sessionItemExists(db: Database, itemId: string) {
  return Boolean(
    db.query<{ present: number }, [string]>("SELECT 1 AS present FROM session_item WHERE item_id = ?1").get(itemId),
  )
}

function insertObligation(
  db: Database,
  input: {
    obligationId: string
    target: string
    kind: ObligationRow["kind"]
    sourceItemId?: string
    sourceInterpretationId?: string
    dueAt?: number
  },
) {
  const inserted = db.query(`
    INSERT INTO learning_obligation (
      obligation_id,
      target,
      kind,
      source_item_id,
      source_interpretation_id,
      due_at,
      status
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active')
  `).run(
    input.obligationId,
    input.target,
    input.kind,
    input.sourceItemId ?? null,
    input.sourceInterpretationId ?? null,
    input.dueAt ?? null,
  )
  if (inserted.changes > 0) bumpObligationRevision(db)
}

function candidateReasonsFor(
  db: Database,
  target: string,
  now: number,
  localSignal: LearningContext["localSignal"],
) {
  const reasons: CandidateReason[] = []
  const obligations = db
    .query<ObligationRow, [string]>(`
      SELECT kind, due_at
      FROM learning_obligation
      WHERE target = ?1 AND status = 'active'
      ORDER BY obligation_id
    `)
    .all(target)

  for (const obligation of obligations) {
    if (obligation.kind === "assessment_review") addUnique(reasons, "assessment_triggered_review")
    if (obligation.kind === "verification") addUnique(reasons, "verification_obligation")
    if (obligation.kind === "scheduled_review" && obligation.due_at !== null && obligation.due_at <= now) {
      addUnique(reasons, "naturally_due_review")
    }
  }

  if (localSignal === "locally_positive") addUnique(reasons, "ready_new_work")
  if (localSignal === "unresolved") addUnique(reasons, "formal_task_needed")
  if (localSignal === "needs_review") addUnique(reasons, "assessment_triggered_review")
  if (localSignal === "needs_verification") addUnique(reasons, "verification_obligation")
  return reasons
}

function addUnique(values: CandidateReason[], value: CandidateReason) {
  if (!values.includes(value)) values.push(value)
}

function currentRevisions(db: Database) {
  const row = db
    .query<{ projection_revision: number; obligation_revision: number }, []>(`
      SELECT projection_revision, obligation_revision
      FROM lab_meta
      WHERE singleton = 1
    `)
    .get()
  if (!row) throw new Error("Lab revisions are missing")
  return { projection: row.projection_revision, obligation: row.obligation_revision }
}

function bumpProjectionRevision(db: Database) {
  const next = currentRevisions(db).projection + 1
  db.query("UPDATE lab_meta SET projection_revision = ?1 WHERE singleton = 1").run(next)
  return next
}

function bumpObligationRevision(db: Database) {
  const next = currentRevisions(db).obligation + 1
  db.query("UPDATE lab_meta SET obligation_revision = ?1 WHERE singleton = 1").run(next)
  return next
}

function rebuildProjectionAt(db: Database, revision: number) {
  const evidence = db
    .query<EvidenceRow, []>(`
      SELECT sequence, interpretation_id, attempt_id, target, meaning, status
      FROM evidence_interpretation
      WHERE status = 'active'
      ORDER BY sequence
    `)
    .all()
  const byTarget = Map.groupBy(evidence, (entry) => entry.target)

  db.query("DELETE FROM learner_projection").run()
  const insert = db.query(`
    INSERT INTO learner_projection (
      target,
      local_signal,
      active_interpretation_ids,
      revision
    ) VALUES (?1, ?2, ?3, ?4)
  `)

  for (const [target, entries] of byTarget) {
    const meanings = new Set(entries.map((entry) => entry.meaning))
    const localSignal: Exclude<LearningContext["localSignal"], "unresolved"> = meanings.has("miss")
      ? "needs_review"
      : meanings.has("guided_success")
        ? "needs_verification"
        : "locally_positive"
    insert.run(
      target,
      localSignal,
      JSON.stringify(entries.map((entry) => entry.interpretation_id)),
      revision,
    )
  }
}

function countRows(db: Database, table: "task_result" | "evidence_interpretation") {
  const row = db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()
  return row?.count ?? 0
}
