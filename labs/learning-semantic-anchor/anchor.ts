import { Database } from "bun:sqlite"

export type OccurrenceInput = {
  operationId: string
  occurrenceId: string
  target: string
  relatedTarget?: string
  outcome: "success" | "failure"
  independent: boolean
  delayed: boolean
}

export type LearnerContext = {
  goal: string
  target: string
  projectionRevision: number
  learnerState: "needs_probe" | "stable" | "needs_repair"
  sourceOccurrenceIds: string[]
  repairTarget?: string
}

export type TutorAction =
  | { kind: "probe"; target: string }
  | { kind: "advance"; target: string }
  | { kind: "repair"; target: string }

type OccurrenceRow = {
  operation_id: string
  occurrence_id: string
  target: string
  related_target: string | null
  outcome: "success" | "failure"
  independent: 0 | 1
  delayed: 0 | 1
}

type ProjectionRow = {
  target: string
  state: LearnerContext["learnerState"]
  repair_target: string | null
  source_occurrence_ids: string
  revision: number
}

export class OperationConflictError extends Error {
  constructor(operationId: string) {
    super(`Operation ID was reused with different occurrence data: ${operationId}`)
    this.name = "OperationConflictError"
  }
}

export function createLabDatabase() {
  const db = new Database(":memory:")
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE lab_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      projection_revision INTEGER NOT NULL
    );

    INSERT INTO lab_meta (singleton, projection_revision) VALUES (1, 0);

    CREATE TABLE session_fact (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      body TEXT NOT NULL
    );

    CREATE TABLE learning_occurrence (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL UNIQUE,
      occurrence_id TEXT NOT NULL UNIQUE,
      target TEXT NOT NULL,
      related_target TEXT,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
      independent INTEGER NOT NULL CHECK (independent IN (0, 1)),
      delayed INTEGER NOT NULL CHECK (delayed IN (0, 1))
    );

    CREATE TABLE learner_projection (
      target TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('needs_probe', 'stable', 'needs_repair')),
      repair_target TEXT,
      source_occurrence_ids TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
  `)
  return db
}

export function recordSessionFact(
  db: Database,
  input: { id: string; kind: "assistant_text" | "tool_failed"; body: string },
) {
  db.query("INSERT INTO session_fact (id, kind, body) VALUES (?1, ?2, ?3)").run(input.id, input.kind, input.body)
}

export function commitOccurrence(db: Database, input: OccurrenceInput) {
  return db.transaction(() => {
    const existing = findByOperation(db, input.operationId)
    if (existing) {
      if (!sameOccurrence(existing, input)) throw new OperationConflictError(input.operationId)
      return {
        occurrenceId: existing.occurrence_id,
        projectionRevision: currentRevision(db),
        inserted: false,
      }
    }

    db.query(`
      INSERT INTO learning_occurrence (
        operation_id,
        occurrence_id,
        target,
        related_target,
        outcome,
        independent,
        delayed
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).run(
      input.operationId,
      input.occurrenceId,
      input.target,
      input.relatedTarget ?? null,
      input.outcome,
      Number(input.independent),
      Number(input.delayed),
    )

    const projectionRevision = currentRevision(db) + 1
    db.query("UPDATE lab_meta SET projection_revision = ?1 WHERE singleton = 1").run(projectionRevision)
    rebuildProjectionAt(db, projectionRevision)
    return { occurrenceId: input.occurrenceId, projectionRevision, inserted: true }
  })()
}

export function rebuildProjection(db: Database) {
  db.transaction(() => rebuildProjectionAt(db, currentRevision(db)))()
}

export function assembleContext(db: Database, input: { goal: string; target: string }): LearnerContext {
  const row = db
    .query<ProjectionRow, [string]>(`
      SELECT target, state, repair_target, source_occurrence_ids, revision
      FROM learner_projection
      WHERE target = ?1
    `)
    .get(input.target)

  if (!row) {
    return {
      goal: input.goal,
      target: input.target,
      projectionRevision: currentRevision(db),
      learnerState: "needs_probe",
      sourceOccurrenceIds: [],
    }
  }

  const base: LearnerContext = {
    goal: input.goal,
    target: row.target,
    projectionRevision: row.revision,
    learnerState: row.state,
    sourceOccurrenceIds: JSON.parse(row.source_occurrence_ids) as string[],
  }
  return row.repair_target ? { ...base, repairTarget: row.repair_target } : base
}

export function selectTutorAction(context: LearnerContext): TutorAction {
  if (context.learnerState === "needs_repair" && context.repairTarget) {
    return { kind: "repair", target: context.repairTarget }
  }
  if (context.learnerState === "stable") return { kind: "advance", target: context.target }
  return { kind: "probe", target: context.target }
}

export function occurrenceCount(db: Database) {
  const row = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM learning_occurrence").get()
  return row?.count ?? 0
}

export function deleteProjectionForRebuildTest(db: Database) {
  db.query("DELETE FROM learner_projection").run()
}

function currentRevision(db: Database) {
  const row = db
    .query<{ projection_revision: number }, []>("SELECT projection_revision FROM lab_meta WHERE singleton = 1")
    .get()
  if (!row) throw new Error("Lab projection revision is missing")
  return row.projection_revision
}

function findByOperation(db: Database, operationId: string) {
  return db
    .query<OccurrenceRow, [string]>(`
      SELECT operation_id, occurrence_id, target, related_target, outcome, independent, delayed
      FROM learning_occurrence
      WHERE operation_id = ?1
    `)
    .get(operationId)
}

function sameOccurrence(row: OccurrenceRow, input: OccurrenceInput) {
  return (
    row.occurrence_id === input.occurrenceId &&
    row.target === input.target &&
    row.related_target === (input.relatedTarget ?? null) &&
    row.outcome === input.outcome &&
    row.independent === Number(input.independent) &&
    row.delayed === Number(input.delayed)
  )
}

function rebuildProjectionAt(db: Database, revision: number) {
  const occurrences = db
    .query<OccurrenceRow & { sequence: number }, []>(`
      SELECT sequence, operation_id, occurrence_id, target, related_target, outcome, independent, delayed
      FROM learning_occurrence
      ORDER BY sequence ASC
    `)
    .all()

  const byTarget = Map.groupBy(occurrences, (occurrence) => occurrence.target)
  db.query("DELETE FROM learner_projection").run()

  const insert = db.query(`
    INSERT INTO learner_projection (
      target,
      state,
      repair_target,
      source_occurrence_ids,
      revision
    ) VALUES (?1, ?2, ?3, ?4, ?5)
  `)

  for (const [target, targetOccurrences] of byTarget) {
    const repairEvidence = targetOccurrences.filter(
      (occurrence) => occurrence.outcome === "failure" && occurrence.independent === 1 && occurrence.related_target,
    )
    const stableEvidence = targetOccurrences.filter(
      (occurrence) => occurrence.outcome === "success" && occurrence.independent === 1 && occurrence.delayed === 1,
    )

    if (repairEvidence.length >= 2) {
      const latest = repairEvidence.at(-1)
      if (!latest?.related_target) throw new Error("Repair evidence lost its related target")
      insert.run(
        target,
        "needs_repair",
        latest.related_target,
        JSON.stringify(repairEvidence.map((occurrence) => occurrence.occurrence_id)),
        revision,
      )
      continue
    }

    if (stableEvidence.length > 0) {
      insert.run(
        target,
        "stable",
        null,
        JSON.stringify(stableEvidence.map((occurrence) => occurrence.occurrence_id)),
        revision,
      )
      continue
    }

    insert.run(
      target,
      "needs_probe",
      null,
      JSON.stringify(targetOccurrences.map((occurrence) => occurrence.occurrence_id)),
      revision,
    )
  }
}
