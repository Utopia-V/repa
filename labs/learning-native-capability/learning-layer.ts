import { Database } from "bun:sqlite"

export type ProgressKind = "read" | "explained" | "demonstrated" | "followed"
export type AttemptOutcome = "correct" | "incorrect" | "partial"
export type AttemptAssistance = "independent" | "hinted" | "guided"

type InitializeCourseCommand = {
  type: "initialize-course"
  courseId: string
  title: string
  goal: string
  sections: Array<{ id: string; title: string; materialRef?: string }>
}

type SetCurrentSectionCommand = {
  type: "set-current-section"
  courseId: string
  sectionId: string
}

type RecordProgressCommand = {
  type: "record-progress"
  courseId: string
  sectionId: string
  progress: ProgressKind
  sourceItemId?: string
}

type ScheduleRevisitCommand = {
  type: "schedule-revisit"
  revisitId: string
  courseId: string
  sectionId: string
  label: string
  dueAt: number
  sourceItemId?: string
  sourceAttemptId?: string
}

type RecordAttemptCommand = {
  type: "record-attempt"
  attemptId: string
  courseId: string
  sectionId: string
  outcome: AttemptOutcome
  assistance: AttemptAssistance
  sourceItemId: string
}

type RecordAssignmentCommand = {
  type: "record-assignment"
  assignmentId: string
  courseId: string
  title: string
  dueAt: number
  sourceItemId?: string
}

type ResolveAssignmentCommand = {
  type: "resolve-assignment"
  assignmentId: string
  resolution: "completed" | "cancelled"
  sourceItemId?: string
}

type ResolveRevisitCommand = {
  type: "resolve-revisit"
  revisitId: string
  resolution: "completed" | "cancelled"
  sourceItemId?: string
  sourceAttemptId?: string
}

type RetractProgressCommand = {
  type: "retract-progress"
  progressOperationId: string
  reason: string
  sourceItemId?: string
}

type CorrectAttemptCommand = {
  type: "correct-attempt"
  attemptId: string
  outcome: AttemptOutcome
  assistance: AttemptAssistance
  reason: string
  sourceItemId?: string
}

type ReopenAssignmentCommand = {
  type: "reopen-assignment"
  assignmentId: string
}

type ReviseAssignmentCommand = {
  type: "revise-assignment"
  assignmentId: string
  title?: string
  dueAt?: number
  reason: string
  sourceItemId?: string
}

type ReopenRevisitCommand = {
  type: "reopen-revisit"
  revisitId: string
}

type RescheduleRevisitCommand = {
  type: "reschedule-revisit"
  revisitId: string
  dueAt: number
  label?: string
  reason: string
  sourceItemId?: string
}

export type LearningCommand =
  | InitializeCourseCommand
  | SetCurrentSectionCommand
  | RecordProgressCommand
  | RecordAttemptCommand
  | ScheduleRevisitCommand
  | ResolveRevisitCommand
  | RecordAssignmentCommand
  | ResolveAssignmentCommand
  | RetractProgressCommand
  | CorrectAttemptCommand
  | ReopenAssignmentCommand
  | ReviseAssignmentCommand
  | ReopenRevisitCommand
  | RescheduleRevisitCommand

export type LearningOperation = {
  operationId: string
  expectedRevision: number
  sessionId?: string
  at: number
  injectFailure?: "after-command"
  toolInvocation?: {
    invocationId: string
    toolName: string
  }
  command: LearningCommand
}

export type LearningContext = {
  revision: number
  constraints: {
    availableMinutes?: number
  }
  course: {
    id: string
    title: string
    goal: string
    currentSectionId: string
  }
  route: Array<{
    id: string
    title: string
    materialRef?: string
    progress: ProgressKind[]
  }>
  dueRevisits: Array<{
    id: string
    sectionId: string
    label: string
    dueAt: number
    sourceItemId?: string
    sourceAttemptId?: string
  }>
  assignments: Array<{
    id: string
  title: string
  dueAt: number
  sourceItemId?: string
    state: "open" | "overdue"
  }>
}

type OperationRow = {
  kind: string
  payload_json: string
  result_json: string
}

type ToolSettlementRow = {
  invocation_id: string
  operation_id: string
  tool_name: string
  result_json: string
  settled_at: number
}

type CourseRow = {
  course_id: string
  title: string
  goal: string
  current_section_id: string
}

type SectionRow = {
  section_id: string
  title: string
  material_ref: string | null
}

type ProgressRow = {
  progress_id: string
  kind: ProgressKind
  recorded_at: number
  source_item_id: string | null
}

type SessionItemRow = {
  item_id: string
  session_id: string
  role: "user" | "assistant" | "tool"
  content: string
  created_at: number
}

type RevisitRow = {
  revisit_id: string
  course_id: string
  section_id: string
  label: string
  due_at: number
  source_item_id: string | null
  source_attempt_id: string | null
  status: "pending" | "completed" | "cancelled"
  created_at: number
  resolved_at: number | null
  resolved_source_item_id: string | null
  resolved_source_attempt_id: string | null
}

type AssignmentRow = {
  assignment_id: string
  course_id: string
  title: string
  due_at: number
  source_item_id: string | null
  status: "open" | "completed" | "cancelled"
  created_at: number
  resolved_at: number | null
  resolved_source_item_id: string | null
}

type ProgressHistoryRow = ProgressRow & {
  retracted_at: number | null
  correction_reason: string | null
  correction_source_item_id: string | null
}

type AttemptRow = {
  attempt_id: string
  course_id: string
  section_id: string
  outcome: AttemptOutcome
  assistance: AttemptAssistance
  source_item_id: string
  occurred_at: number
}

type EffectiveAttemptRow = AttemptRow & {
  corrected_outcome: AttemptOutcome | null
  corrected_assistance: AttemptAssistance | null
  correction_reason: string | null
  correction_source_item_id: string | null
  corrected_at: number | null
}

export class StaleRevisionError extends Error {
  constructor(expected: number, actual: number) {
    super(`Stale learning revision: expected ${expected}, current ${actual}`)
    this.name = "StaleRevisionError"
  }
}

export class OperationConflictError extends Error {
  constructor(operationId: string) {
    super(`Learning operation ID was reused with different input: ${operationId}`)
    this.name = "OperationConflictError"
  }
}

export function openLearningLab(databasePath: string) {
  const db = new Database(databasePath)
  try {
    db.exec("PRAGMA foreign_keys = ON;")
    db.transaction(() => migrate(db)).immediate()
  } catch (error) {
    try {
      db.close()
    } catch {
      // Preserve the migration error that prevented the lab from opening.
    }
    throw error
  }

  return {
    apply(input: LearningOperation) {
      return applyOperation(db, input)
    },

    appendSessionItem(input: {
      itemId: string
      sessionId: string
      role: "user" | "assistant" | "tool"
      content: string
      at: number
    }) {
      assertIdentifier(input.itemId, "itemId")
      assertIdentifier(input.sessionId, "sessionId")
      assertTimestamp(input.at, "at")
      const existing = db
        .query("SELECT item_id, session_id, role, content, created_at FROM session_item WHERE item_id = ?1")
        .get(input.itemId) as SessionItemRow | null

      if (existing) {
        const same =
          existing.session_id === input.sessionId &&
          existing.role === input.role &&
          existing.content === input.content &&
          existing.created_at === input.at
        if (!same) throw new Error(`Session item ID was reused with different input: ${input.itemId}`)
        return { inserted: false }
      }

      db.query(`
        INSERT INTO session_item (item_id, session_id, role, content, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
      `).run(input.itemId, input.sessionId, input.role, input.content, input.at)
      return { inserted: true }
    },

    readSessionItem(itemId: string) {
      const row = db
        .query("SELECT item_id, session_id, role, content, created_at FROM session_item WHERE item_id = ?1")
        .get(itemId) as SessionItemRow | null
      if (!row) throw new Error(`Unknown session item: ${itemId}`)
      return {
        itemId: row.item_id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        at: row.created_at,
      }
    },

    readProgressHistory(input: { courseId: string; sectionId: string }) {
      assertCourseSection(db, input.courseId, input.sectionId)
      const rows = db
        .query(`
          SELECT
            progress.progress_id,
            progress.kind,
            progress.recorded_at,
            progress.source_item_id,
            progress.retracted_at,
            correction.reason AS correction_reason,
            correction.source_item_id AS correction_source_item_id
          FROM progress_fact AS progress
          LEFT JOIN progress_correction AS correction
            ON correction.progress_id = progress.progress_id
          WHERE progress.course_id = ?1 AND progress.section_id = ?2
          ORDER BY progress.recorded_at ASC, progress.progress_id ASC
        `)
        .all(input.courseId, input.sectionId) as ProgressHistoryRow[]

      return rows.map((row) => ({
        id: row.progress_id,
        kind: row.kind,
        recordedAt: row.recorded_at,
        status: row.retracted_at === null ? ("active" as const) : ("retracted" as const),
        ...(row.source_item_id === null ? {} : { sourceItemId: row.source_item_id }),
        ...(row.correction_reason === null
          ? {}
          : {
              correction: {
                reason: row.correction_reason,
                ...(row.correction_source_item_id === null
                  ? {}
                  : { sourceItemId: row.correction_source_item_id }),
              },
            }),
      }))
    },

    readAttempt(attemptId: string) {
      const row = db
        .query(`
          SELECT
            attempt.attempt_id,
            attempt.course_id,
            attempt.section_id,
            attempt.outcome,
            attempt.assistance,
            attempt.source_item_id,
            attempt.occurred_at,
            correction.outcome AS corrected_outcome,
            correction.assistance AS corrected_assistance,
            correction.reason AS correction_reason,
            correction.source_item_id AS correction_source_item_id,
            correction.created_at AS corrected_at
          FROM attempt
          LEFT JOIN attempt_correction AS correction
            ON correction.correction_id = (
              SELECT latest.correction_id
              FROM attempt_correction AS latest
              WHERE latest.attempt_id = attempt.attempt_id
              ORDER BY latest.revision_after DESC
              LIMIT 1
            )
          WHERE attempt.attempt_id = ?1
        `)
        .get(attemptId) as EffectiveAttemptRow | null
      if (!row) throw new Error(`Unknown attempt: ${attemptId}`)
      const base = {
        id: row.attempt_id,
        courseId: row.course_id,
        sectionId: row.section_id,
        outcome: row.corrected_outcome ?? row.outcome,
        assistance: row.corrected_assistance ?? row.assistance,
        sourceItemId: row.source_item_id,
        occurredAt: row.occurred_at,
      }
      if (row.corrected_at === null) return base
      if (
        row.corrected_outcome === null ||
        row.corrected_assistance === null ||
        row.correction_reason === null
      ) {
        throw new Error(`Incomplete attempt correction: ${attemptId}`)
      }
      return {
        ...base,
        recorded: { outcome: row.outcome, assistance: row.assistance },
        correction: {
          outcome: row.corrected_outcome,
          assistance: row.corrected_assistance,
          reason: row.correction_reason,
          ...(row.correction_source_item_id === null
            ? {}
            : { sourceItemId: row.correction_source_item_id }),
          correctedAt: row.corrected_at,
        },
      }
    },

    readAssignment(assignmentId: string) {
      const row = db
        .query(`
          SELECT assignment_id, course_id, title, due_at, source_item_id,
                 status, created_at, resolved_at, resolved_source_item_id
          FROM assignment
          WHERE assignment_id = ?1
        `)
        .get(assignmentId) as AssignmentRow | null
      if (!row) throw new Error(`Unknown assignment: ${assignmentId}`)
      return {
        id: row.assignment_id,
        courseId: row.course_id,
        title: row.title,
        dueAt: row.due_at,
        status: row.status,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        ...(row.source_item_id === null ? {} : { sourceItemId: row.source_item_id }),
        ...(row.resolved_source_item_id === null
          ? {}
          : { resolvedSourceItemId: row.resolved_source_item_id }),
      }
    },

    readRevisit(revisitId: string) {
      const row = db
        .query(`
          SELECT revisit_id, course_id, section_id, label, due_at, source_item_id,
                 source_attempt_id, status, created_at, resolved_at,
                 resolved_source_item_id, resolved_source_attempt_id
          FROM revisit
          WHERE revisit_id = ?1
        `)
        .get(revisitId) as RevisitRow | null
      if (!row) throw new Error(`Unknown revisit: ${revisitId}`)
      return {
        id: row.revisit_id,
        courseId: row.course_id,
        sectionId: row.section_id,
        label: row.label,
        dueAt: row.due_at,
        status: row.status,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        ...(row.source_item_id === null ? {} : { sourceItemId: row.source_item_id }),
        ...(row.source_attempt_id === null ? {} : { sourceAttemptId: row.source_attempt_id }),
        ...(row.resolved_source_item_id === null
          ? {}
          : { resolvedSourceItemId: row.resolved_source_item_id }),
        ...(row.resolved_source_attempt_id === null
          ? {}
          : { resolvedSourceAttemptId: row.resolved_source_attempt_id }),
      }
    },

    readOperation(operationId: string) {
      const row = db
        .query(`
          SELECT kind, payload_json, result_json, revision_after, created_at
          FROM learning_operation
          WHERE operation_id = ?1
        `)
        .get(operationId) as
        | {
            kind: string
            payload_json: string
            result_json: string
            revision_after: number
            created_at: number
          }
        | null
      if (!row) throw new Error(`Unknown learning operation: ${operationId}`)
      return {
        operationId,
        kind: row.kind,
        input: JSON.parse(row.payload_json) as LearningOperation,
        result: JSON.parse(row.result_json) as { revision: number },
        revisionAfter: row.revision_after,
        createdAt: row.created_at,
      }
    },

    readToolSettlement(invocationId: string) {
      const row = db
        .query(`
          SELECT invocation_id, operation_id, tool_name, result_json, settled_at
          FROM tool_settlement
          WHERE invocation_id = ?1
        `)
        .get(invocationId) as ToolSettlementRow | null
      if (!row) throw new Error(`Unknown tool settlement: ${invocationId}`)
      return {
        invocationId: row.invocation_id,
        operationId: row.operation_id,
        toolName: row.tool_name,
        result: JSON.parse(row.result_json) as { revision: number; replayed: false },
        settledAt: row.settled_at,
      }
    },

    buildContext(input: {
      courseId: string
      now: number
      availableMinutes?: number
    }): LearningContext {
      return db
        .transaction(() => buildContext(db, input.courseId, input.now, input.availableMinutes))
        .deferred()
    },

    buildCurrentContext(input: { now: number; availableMinutes?: number }): LearningContext {
      return db
        .transaction(() => {
          const row = db.query("SELECT active_course_id FROM lab_meta WHERE singleton = 1").get() as
            | { active_course_id: string | null }
            | null
          if (!row?.active_course_id) throw new Error("No active course")
          return buildContext(db, row.active_course_id, input.now, input.availableMinutes)
        })
        .deferred()
    },

    close() {
      db.close()
    },
  }
}

function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_meta (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      revision INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO lab_meta (singleton, revision) VALUES (1, 0);
  `)

  const initialMetaColumns = db.query("PRAGMA table_info(lab_meta)").all() as Array<{ name: string }>
  if (!initialMetaColumns.some((column) => column.name === "active_course_id")) {
    db.exec("ALTER TABLE lab_meta ADD COLUMN active_course_id TEXT;")
  }
  if (!initialMetaColumns.some((column) => column.name === "last_operation_at")) {
    db.exec("ALTER TABLE lab_meta ADD COLUMN last_operation_at INTEGER NOT NULL DEFAULT 0;")
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_operation (
      operation_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      revision_after INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_item (
      item_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_settlement (
      invocation_id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL UNIQUE REFERENCES learning_operation(operation_id),
      tool_name TEXT NOT NULL,
      result_json TEXT NOT NULL,
      settled_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS course (
      course_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      current_section_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS course_section (
      section_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES course(course_id),
      ordinal INTEGER NOT NULL,
      title TEXT NOT NULL,
      material_ref TEXT,
      UNIQUE (course_id, ordinal)
    );

    CREATE TABLE IF NOT EXISTS progress_fact (
      progress_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES course(course_id),
      section_id TEXT NOT NULL REFERENCES course_section(section_id),
      kind TEXT NOT NULL CHECK (kind IN ('read', 'explained', 'demonstrated', 'followed')),
      source_item_id TEXT REFERENCES session_item(item_id),
      recorded_at INTEGER NOT NULL,
      retracted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS progress_correction (
      correction_id TEXT PRIMARY KEY,
      progress_id TEXT NOT NULL UNIQUE REFERENCES progress_fact(progress_id),
      reason TEXT NOT NULL,
      source_item_id TEXT REFERENCES session_item(item_id),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attempt (
      attempt_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES course(course_id),
      section_id TEXT NOT NULL REFERENCES course_section(section_id),
      outcome TEXT NOT NULL CHECK (outcome IN ('correct', 'incorrect', 'partial')),
      assistance TEXT NOT NULL CHECK (assistance IN ('independent', 'hinted', 'guided')),
      source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      occurred_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attempt_correction (
      correction_id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL REFERENCES attempt(attempt_id),
      outcome TEXT NOT NULL CHECK (outcome IN ('correct', 'incorrect', 'partial')),
      assistance TEXT NOT NULL CHECK (assistance IN ('independent', 'hinted', 'guided')),
      reason TEXT NOT NULL,
      source_item_id TEXT REFERENCES session_item(item_id),
      created_at INTEGER NOT NULL,
      revision_after INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS revisit (
      revisit_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES course(course_id),
      section_id TEXT NOT NULL REFERENCES course_section(section_id),
      label TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      source_item_id TEXT REFERENCES session_item(item_id),
      source_attempt_id TEXT REFERENCES attempt(attempt_id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolved_source_item_id TEXT REFERENCES session_item(item_id),
      resolved_source_attempt_id TEXT REFERENCES attempt(attempt_id)
    );

    CREATE TABLE IF NOT EXISTS assignment (
      assignment_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES course(course_id),
      title TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      source_item_id TEXT REFERENCES session_item(item_id),
      status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'cancelled')),
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolved_source_item_id TEXT REFERENCES session_item(item_id)
    );
  `)

  const correctionColumns = db.query("PRAGMA table_info(attempt_correction)").all() as Array<{
    name: string
  }>
  if (!correctionColumns.some((column) => column.name === "revision_after")) {
    db.exec(
      "ALTER TABLE attempt_correction ADD COLUMN revision_after INTEGER NOT NULL DEFAULT 0;",
    )
  }
  db.exec(`
    UPDATE attempt_correction
    SET revision_after = COALESCE(
      (
        SELECT operation.revision_after
        FROM learning_operation AS operation
        WHERE attempt_correction.correction_id = 'attempt-correction:' || operation.operation_id
      ),
      revision_after
    )
    WHERE revision_after = 0;
  `)
  const unmappedCorrections = db
    .query("SELECT COUNT(*) AS count FROM attempt_correction WHERE revision_after = 0")
    .get() as { count: number }
  if (unmappedCorrections.count > 0) {
    throw new Error("Cannot migrate attempt corrections without operation revisions")
  }

  const revisitColumns = db.query("PRAGMA table_info(revisit)").all() as Array<{ name: string }>
  if (!revisitColumns.some((column) => column.name === "resolved_source_item_id")) {
    db.exec("ALTER TABLE revisit ADD COLUMN resolved_source_item_id TEXT REFERENCES session_item(item_id);")
  }
  if (!revisitColumns.some((column) => column.name === "resolved_source_attempt_id")) {
    db.exec("ALTER TABLE revisit ADD COLUMN resolved_source_attempt_id TEXT REFERENCES attempt(attempt_id);")
  }
  const assignmentColumns = db.query("PRAGMA table_info(assignment)").all() as Array<{
    name: string
  }>
  if (!assignmentColumns.some((column) => column.name === "source_item_id")) {
    db.exec("ALTER TABLE assignment ADD COLUMN source_item_id TEXT REFERENCES session_item(item_id);")
  }
  if (!assignmentColumns.some((column) => column.name === "resolved_source_item_id")) {
    db.exec(
      "ALTER TABLE assignment ADD COLUMN resolved_source_item_id TEXT REFERENCES session_item(item_id);",
    )
  }

  db.exec(`
    UPDATE lab_meta
    SET active_course_id = (
      SELECT course_id FROM course ORDER BY rowid ASC LIMIT 1
    )
    WHERE singleton = 1
      AND active_course_id IS NULL
      AND (SELECT COUNT(*) FROM course) = 1;

    UPDATE lab_meta
    SET last_operation_at = COALESCE(
      (SELECT MAX(created_at) FROM learning_operation),
      last_operation_at,
      0
    )
    WHERE singleton = 1;
  `)
}

function applyOperation(db: Database, input: LearningOperation) {
  assertIdentifier(input.operationId, "operationId")
  assertTimestamp(input.at, "at")
  if (input.toolInvocation !== undefined) {
    assertIdentifier(input.toolInvocation.invocationId, "toolInvocation.invocationId")
    assertIdentifier(input.toolInvocation.toolName, "toolInvocation.toolName")
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new RangeError(`Invalid expectedRevision: ${input.expectedRevision}`)
  }

  const payload = canonicalJson(input)
  const execute = db.transaction(() => {
    const existing = db
      .query("SELECT kind, payload_json, result_json FROM learning_operation WHERE operation_id = ?1")
      .get(input.operationId) as OperationRow | null
    if (existing) {
      if (existing.kind !== input.command.type || existing.payload_json !== payload) {
        throw new OperationConflictError(input.operationId)
      }
      return { ...(JSON.parse(existing.result_json) as { revision: number }), replayed: true }
    }

    const actualRevision = currentRevision(db)
    if (input.expectedRevision !== actualRevision) {
      throw new StaleRevisionError(input.expectedRevision, actualRevision)
    }

    const lastOperationAt = currentOperationTime(db)
    if (input.at < lastOperationAt) {
      throw new Error(
        `Learning operation time moved backwards: ${input.at} < ${lastOperationAt}`,
      )
    }

    const revision = actualRevision + 1
    applyCommand(db, input, revision)
    if (input.injectFailure === "after-command") {
      throw new Error("Injected failure after learning command")
    }
    const update = db
      .query(`
        UPDATE lab_meta
        SET revision = ?1, last_operation_at = ?2
        WHERE singleton = 1 AND revision = ?3
      `)
      .run(revision, input.at, actualRevision)
    if (update.changes !== 1) {
      throw new StaleRevisionError(input.expectedRevision, currentRevision(db))
    }
    const result = { revision }
    db.query(`
      INSERT INTO learning_operation (
        operation_id,
        kind,
        payload_json,
        result_json,
        revision_after,
        created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).run(
      input.operationId,
      input.command.type,
      payload,
      JSON.stringify(result),
      revision,
      input.at,
    )
    if (input.toolInvocation !== undefined) {
      db.query(`
        INSERT INTO tool_settlement (
          invocation_id,
          operation_id,
          tool_name,
          result_json,
          settled_at
        ) VALUES (?1, ?2, ?3, ?4, ?5)
      `).run(
        input.toolInvocation.invocationId,
        input.operationId,
        input.toolInvocation.toolName,
        JSON.stringify({ revision, replayed: false }),
        input.at,
      )
    }
    return { ...result, replayed: false }
  })

  return execute.immediate()
}

function applyCommand(db: Database, input: LearningOperation, revisionAfter: number) {
  const command = input.command
  switch (command.type) {
    case "initialize-course": {
      assertIdentifier(command.courseId, "courseId")
      assertText(command.title, "title")
      assertText(command.goal, "goal")
      if (command.sections.length === 0) throw new Error("A course requires at least one section")
      const sectionIds = new Set<string>()
      for (const section of command.sections) {
        assertIdentifier(section.id, "section.id")
        assertText(section.title, "section.title")
        if (sectionIds.has(section.id)) throw new Error(`Duplicate section ID: ${section.id}`)
        sectionIds.add(section.id)
      }

      const firstSection = command.sections[0]
      if (!firstSection) throw new Error("A course requires at least one section")
      db.query(`
        INSERT INTO course (course_id, title, goal, current_section_id)
        VALUES (?1, ?2, ?3, ?4)
      `).run(command.courseId, command.title, command.goal, firstSection.id)
      const insertSection = db.query(`
        INSERT INTO course_section (section_id, course_id, ordinal, title, material_ref)
        VALUES (?1, ?2, ?3, ?4, ?5)
      `)
      command.sections.forEach((section, ordinal) => {
        insertSection.run(
          section.id,
          command.courseId,
          ordinal,
          section.title,
          section.materialRef ?? null,
        )
      })
      db.query("UPDATE lab_meta SET active_course_id = ?1 WHERE singleton = 1").run(command.courseId)
      return
    }

    case "set-current-section": {
      assertCourseSection(db, command.courseId, command.sectionId)
      db.query("UPDATE course SET current_section_id = ?1 WHERE course_id = ?2").run(
        command.sectionId,
        command.courseId,
      )
      return
    }

    case "record-progress": {
      assertCourseSection(db, command.courseId, command.sectionId)
      if (command.sourceItemId !== undefined) {
        const source = assertOperationSourceItem(db, input, command.sourceItemId)
        if (
          (command.progress === "read" || command.progress === "followed") &&
          source.role !== "user" &&
          source.role !== "tool"
        ) {
          throw new Error("Learner progress source must be learner or tool output")
        }
        if (
          (command.progress === "explained" || command.progress === "demonstrated") &&
          source.role !== "assistant" &&
          source.role !== "tool"
        ) {
          throw new Error("Tutor progress source must be assistant or tool output")
        }
      }
      db.query(`
        INSERT INTO progress_fact (
          progress_id,
          course_id,
          section_id,
          kind,
          source_item_id,
          recorded_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `).run(
        `progress:${input.operationId}`,
        command.courseId,
        command.sectionId,
        command.progress,
        command.sourceItemId ?? null,
        input.at,
      )
      return
    }

    case "record-attempt": {
      assertIdentifier(command.attemptId, "attemptId")
      assertCourseSection(db, command.courseId, command.sectionId)
      const source = assertOperationSourceItem(db, input, command.sourceItemId)
      if (source.role !== "user" && source.role !== "tool") {
        throw new Error("Attempt source must be learner or tool output")
      }
      assertAttemptOutcome(command.outcome)
      assertAttemptAssistance(command.assistance)
      db.query(`
        INSERT INTO attempt (
          attempt_id,
          course_id,
          section_id,
          outcome,
          assistance,
          source_item_id,
          occurred_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `).run(
        command.attemptId,
        command.courseId,
        command.sectionId,
        command.outcome,
        command.assistance,
        command.sourceItemId,
        input.at,
      )
      return
    }

    case "correct-attempt": {
      assertIdentifier(command.attemptId, "attemptId")
      assertAttemptOutcome(command.outcome)
      assertAttemptAssistance(command.assistance)
      assertText(command.reason, "reason")
      const attempt = db
        .query("SELECT 1 AS found FROM attempt WHERE attempt_id = ?1")
        .get(command.attemptId) as { found: number } | null
      if (!attempt) throw new Error(`Unknown attempt: ${command.attemptId}`)
      if (command.sourceItemId !== undefined) {
        const source = assertOperationSourceItem(db, input, command.sourceItemId)
        if (source.role !== "user" && source.role !== "tool") {
          throw new Error("Attempt correction source must be learner or tool output")
        }
      }
      db.query(`
        INSERT INTO attempt_correction (
          correction_id,
          attempt_id,
          outcome,
          assistance,
          reason,
          source_item_id,
          created_at,
          revision_after
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      `).run(
        `attempt-correction:${input.operationId}`,
        command.attemptId,
        command.outcome,
        command.assistance,
        command.reason,
        command.sourceItemId ?? null,
        input.at,
        revisionAfter,
      )
      return
    }

    case "schedule-revisit": {
      assertIdentifier(command.revisitId, "revisitId")
      assertCourseSection(db, command.courseId, command.sectionId)
      assertText(command.label, "label")
      assertTimestamp(command.dueAt, "dueAt")
      if (command.sourceItemId !== undefined) {
        assertOperationSourceItem(db, input, command.sourceItemId)
      }
      if (command.sourceAttemptId !== undefined) {
        assertAttempt(db, command.sourceAttemptId, command.courseId, command.sectionId, input.at)
      }
      db.query(`
        INSERT INTO revisit (
          revisit_id,
          course_id,
          section_id,
          label,
          due_at,
          source_item_id,
          source_attempt_id,
          status,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8)
      `).run(
        command.revisitId,
        command.courseId,
        command.sectionId,
        command.label,
        command.dueAt,
        command.sourceItemId ?? null,
        command.sourceAttemptId ?? null,
        input.at,
      )
      return
    }

    case "resolve-revisit": {
      const revisit = db
        .query("SELECT course_id, section_id, status, created_at FROM revisit WHERE revisit_id = ?1")
        .get(command.revisitId) as
        | {
            course_id: string
            section_id: string
            status: "pending" | "completed" | "cancelled"
            created_at: number
          }
        | null
      if (!revisit) throw new Error(`Unknown revisit: ${command.revisitId}`)
      if (revisit.status !== "pending") {
        throw new Error(`Revisit is already resolved: ${command.revisitId}`)
      }
      if (
        command.resolution === "completed" &&
        command.sourceItemId === undefined &&
        command.sourceAttemptId === undefined
      ) {
        throw new Error("A completed revisit requires an actual interaction or attempt")
      }
      if (command.sourceItemId !== undefined) {
        const source = assertOperationSourceItem(db, input, command.sourceItemId)
        if (source.role !== "user" && source.role !== "tool") {
          throw new Error("Revisit completion source must be learner or tool output")
        }
        if (source.created_at < revisit.created_at) {
          throw new Error("Revisit completion source must occur after revisit was created")
        }
      }
      if (command.sourceAttemptId !== undefined) {
        const sourceAttempt = assertAttempt(
          db,
          command.sourceAttemptId,
          revisit.course_id,
          revisit.section_id,
          input.at,
        )
        if (sourceAttempt.occurred_at < revisit.created_at) {
          throw new Error("Revisit completion source must occur after revisit was created")
        }
      }
      db.query(`
        UPDATE revisit
        SET status = ?1,
            resolved_at = ?2,
            resolved_source_item_id = ?3,
            resolved_source_attempt_id = ?4
        WHERE revisit_id = ?5
      `).run(
        command.resolution,
        input.at,
        command.sourceItemId ?? null,
        command.sourceAttemptId ?? null,
        command.revisitId,
      )
      return
    }

    case "reopen-revisit": {
      const revisit = db
        .query("SELECT status FROM revisit WHERE revisit_id = ?1")
        .get(command.revisitId) as { status: "pending" | "completed" | "cancelled" } | null
      if (!revisit) throw new Error(`Unknown revisit: ${command.revisitId}`)
      if (revisit.status === "pending") throw new Error(`Revisit is already pending: ${command.revisitId}`)
      db.query(`
        UPDATE revisit
        SET status = 'pending',
            resolved_at = NULL,
            resolved_source_item_id = NULL,
            resolved_source_attempt_id = NULL
        WHERE revisit_id = ?1
      `).run(command.revisitId)
      return
    }

    case "reschedule-revisit": {
      assertTimestamp(command.dueAt, "dueAt")
      assertText(command.reason, "reason")
      if (command.label !== undefined) assertText(command.label, "label")
      if (command.sourceItemId !== undefined) {
        assertOperationSourceItem(db, input, command.sourceItemId)
      }
      const revisit = db
        .query("SELECT status, label FROM revisit WHERE revisit_id = ?1")
        .get(command.revisitId) as
        | { status: "pending" | "completed" | "cancelled"; label: string }
        | null
      if (!revisit) throw new Error(`Unknown revisit: ${command.revisitId}`)
      if (revisit.status !== "pending") {
        throw new Error(`Revisit must be reopened before rescheduling: ${command.revisitId}`)
      }
      db.query("UPDATE revisit SET label = ?1, due_at = ?2 WHERE revisit_id = ?3").run(
        command.label ?? revisit.label,
        command.dueAt,
        command.revisitId,
      )
      return
    }

    case "record-assignment": {
      assertIdentifier(command.assignmentId, "assignmentId")
      assertCourse(db, command.courseId)
      assertText(command.title, "title")
      assertTimestamp(command.dueAt, "dueAt")
      if (command.sourceItemId !== undefined) {
        const source = assertOperationSourceItem(db, input, command.sourceItemId)
        if (source.role !== "user" && source.role !== "tool") {
          throw new Error("Assignment source must be learner or tool output")
        }
      }
      db.query(`
        INSERT INTO assignment (
          assignment_id,
          course_id,
          title,
          due_at,
          source_item_id,
          status,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6)
      `).run(
        command.assignmentId,
        command.courseId,
        command.title,
        command.dueAt,
        command.sourceItemId ?? null,
        input.at,
      )
      return
    }

    case "reopen-assignment": {
      const assignment = db
        .query("SELECT status FROM assignment WHERE assignment_id = ?1")
        .get(command.assignmentId) as { status: "open" | "completed" | "cancelled" } | null
      if (!assignment) throw new Error(`Unknown assignment: ${command.assignmentId}`)
      if (assignment.status === "open") {
        throw new Error(`Assignment is already open: ${command.assignmentId}`)
      }
      db.query(`
        UPDATE assignment
        SET status = 'open', resolved_at = NULL, resolved_source_item_id = NULL
        WHERE assignment_id = ?1
      `).run(command.assignmentId)
      return
    }

    case "revise-assignment": {
      assertText(command.reason, "reason")
      const hasRevision =
        command.title !== undefined || command.dueAt !== undefined
      if (!hasRevision) throw new Error("Assignment revision must change at least one field")
      if (command.title !== undefined) assertText(command.title, "title")
      if (command.dueAt !== undefined) assertTimestamp(command.dueAt, "dueAt")
      if (command.sourceItemId !== undefined) {
        const source = assertOperationSourceItem(db, input, command.sourceItemId)
        if (source.role !== "user" && source.role !== "tool") {
          throw new Error("Assignment correction source must be learner or tool output")
        }
      }
      const assignment = db
        .query(`
          SELECT title, due_at, status
          FROM assignment
          WHERE assignment_id = ?1
        `)
        .get(command.assignmentId) as
        | { title: string; due_at: number; status: "open" | "completed" | "cancelled" }
        | null
      if (!assignment) throw new Error(`Unknown assignment: ${command.assignmentId}`)
      if (assignment.status !== "open") {
        throw new Error(`Assignment must be reopened before revision: ${command.assignmentId}`)
      }
      db.query(`
        UPDATE assignment
        SET title = ?1, due_at = ?2
        WHERE assignment_id = ?3
      `).run(
        command.title ?? assignment.title,
        command.dueAt ?? assignment.due_at,
        command.assignmentId,
      )
      return
    }

    case "resolve-assignment": {
      const assignment = db
        .query("SELECT status FROM assignment WHERE assignment_id = ?1")
        .get(command.assignmentId) as { status: "open" | "completed" | "cancelled" } | null
      if (!assignment) throw new Error(`Unknown assignment: ${command.assignmentId}`)
      if (assignment.status !== "open") {
        throw new Error(`Assignment is already resolved: ${command.assignmentId}`)
      }
      if (command.sourceItemId === undefined) {
        throw new Error("Assignment resolution requires a learner or tool source")
      }
      const source = assertOperationSourceItem(db, input, command.sourceItemId)
      if (source.role !== "user" && source.role !== "tool") {
        throw new Error("Assignment resolution requires a learner or tool source")
      }
      db.query(`
        UPDATE assignment
        SET status = ?1, resolved_at = ?2, resolved_source_item_id = ?3
        WHERE assignment_id = ?4
      `).run(command.resolution, input.at, command.sourceItemId, command.assignmentId)
      return
    }

    case "retract-progress": {
      assertIdentifier(command.progressOperationId, "progressOperationId")
      assertText(command.reason, "reason")
      if (command.sourceItemId !== undefined) {
        const source = assertOperationSourceItem(db, input, command.sourceItemId)
        if (source.role !== "user" && source.role !== "tool") {
          throw new Error("Correction source must be learner or tool output")
        }
      }
      const progressId = `progress:${command.progressOperationId}`
      const progress = db
        .query("SELECT retracted_at FROM progress_fact WHERE progress_id = ?1")
        .get(progressId) as { retracted_at: number | null } | null
      if (!progress) throw new Error(`Unknown progress operation: ${command.progressOperationId}`)
      if (progress.retracted_at !== null) {
        throw new Error(`Progress is already retracted: ${command.progressOperationId}`)
      }
      db.query(`
        INSERT INTO progress_correction (
          correction_id,
          progress_id,
          reason,
          source_item_id,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5)
      `).run(
        `correction:${input.operationId}`,
        progressId,
        command.reason,
        command.sourceItemId ?? null,
        input.at,
      )
      db.query("UPDATE progress_fact SET retracted_at = ?1 WHERE progress_id = ?2").run(
        input.at,
        progressId,
      )
      return
    }

    default: {
      const unsupported = command as { type?: unknown }
      throw new Error(`Unsupported learning command: ${String(unsupported.type)}`)
    }
  }
}

function buildContext(
  db: Database,
  courseId: string,
  now: number,
  availableMinutes?: number,
): LearningContext {
  assertTimestamp(now, "now")
  const lastOperationAt = currentOperationTime(db)
  if (now < lastOperationAt) {
    throw new Error(`Context time precedes committed learning state: ${now} < ${lastOperationAt}`)
  }
  if (
    availableMinutes !== undefined &&
    (!Number.isSafeInteger(availableMinutes) || availableMinutes < 0)
  ) {
    throw new RangeError(`Invalid availableMinutes: ${availableMinutes}`)
  }
  const course = db
    .query("SELECT course_id, title, goal, current_section_id FROM course WHERE course_id = ?1")
    .get(courseId) as CourseRow | null
  if (!course) throw new Error(`Unknown course: ${courseId}`)

  const sections = db
    .query(`
      SELECT section_id, title, material_ref
      FROM course_section
      WHERE course_id = ?1
      ORDER BY ordinal ASC
    `)
    .all(courseId) as SectionRow[]

  const dueRevisits = db
    .query(`
      SELECT revisit_id, section_id, label, due_at, source_item_id, source_attempt_id
      FROM revisit
      WHERE course_id = ?1 AND status = 'pending' AND due_at <= ?2
      ORDER BY due_at ASC, revisit_id ASC
    `)
    .all(courseId, now) as RevisitRow[]

  const assignments = db
    .query(`
      SELECT assignment_id, title, due_at
      FROM assignment
      WHERE course_id = ?1 AND status = 'open'
      ORDER BY due_at ASC, assignment_id ASC
    `)
    .all(courseId) as AssignmentRow[]

  return {
    revision: currentRevision(db),
    constraints: {
      ...(availableMinutes === undefined ? {} : { availableMinutes }),
    },
    course: {
      id: course.course_id,
      title: course.title,
      goal: course.goal,
      currentSectionId: course.current_section_id,
    },
    route: sections.map((section) => {
      const rows = db
        .query(`
          SELECT kind, MIN(recorded_at) AS first_recorded_at
          FROM progress_fact
          WHERE course_id = ?1 AND section_id = ?2 AND retracted_at IS NULL
          GROUP BY kind
          ORDER BY first_recorded_at ASC, kind ASC
        `)
        .all(courseId, section.section_id) as Array<{ kind: ProgressKind }>
      const base = {
        id: section.section_id,
        title: section.title,
        progress: rows.map((row) => row.kind),
      }
      return section.material_ref === null ? base : { ...base, materialRef: section.material_ref }
    }),
    dueRevisits: dueRevisits.map((row) => ({
      id: row.revisit_id,
      sectionId: row.section_id,
      label: row.label,
      dueAt: row.due_at,
      ...(row.source_item_id === null ? {} : { sourceItemId: row.source_item_id }),
      ...(row.source_attempt_id === null ? {} : { sourceAttemptId: row.source_attempt_id }),
    })),
    assignments: assignments.map((row) => ({
      id: row.assignment_id,
      title: row.title,
      dueAt: row.due_at,
      state: row.due_at <= now ? "overdue" : "open",
    })),
  }
}

function currentRevision(db: Database) {
  const row = db.query("SELECT revision FROM lab_meta WHERE singleton = 1").get() as
    | { revision: number }
    | null
  if (!row) throw new Error("Missing lab revision")
  return row.revision
}

function currentOperationTime(db: Database) {
  const row = db.query("SELECT last_operation_at FROM lab_meta WHERE singleton = 1").get() as
    | { last_operation_at: number }
    | null
  if (!row) throw new Error("Missing lab operation clock")
  return row.last_operation_at
}

function assertCourseSection(db: Database, courseId: string, sectionId: string) {
  const row = db
    .query("SELECT 1 AS found FROM course_section WHERE course_id = ?1 AND section_id = ?2")
    .get(courseId, sectionId) as { found: number } | null
  if (!row) throw new Error(`Unknown course section: ${courseId}/${sectionId}`)
}

function assertCourse(db: Database, courseId: string) {
  const row = db.query("SELECT 1 AS found FROM course WHERE course_id = ?1").get(courseId) as
    | { found: number }
    | null
  if (!row) throw new Error(`Unknown course: ${courseId}`)
}

function assertOperationSourceItem(db: Database, input: LearningOperation, itemId: string) {
  const row = db
    .query("SELECT item_id, session_id, role, content, created_at FROM session_item WHERE item_id = ?1")
    .get(itemId) as SessionItemRow | null
  if (!row) throw new Error(`Unknown session item: ${itemId}`)
  if (input.sessionId === undefined) {
    throw new Error("A source item requires the current Session ID")
  }
  if (row.session_id !== input.sessionId) {
    throw new Error("Source item is not from the current Session")
  }
  if (row.created_at > input.at) {
    throw new Error("Source item occurs after the learning operation")
  }
  return row
}

function assertAttempt(
  db: Database,
  attemptId: string,
  courseId: string,
  sectionId: string,
  operationAt: number,
) {
  const row = db
    .query(`
      SELECT occurred_at
      FROM attempt
      WHERE attempt_id = ?1 AND course_id = ?2 AND section_id = ?3
    `)
    .get(attemptId, courseId, sectionId) as { occurred_at: number } | null
  if (!row) throw new Error(`Unknown or misaligned attempt: ${attemptId}`)
  if (row.occurred_at > operationAt) {
    throw new Error("Source attempt occurs after the learning operation")
  }
  return row
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    )
  }
  return value
}

function assertIdentifier(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}

function assertText(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}

function assertTimestamp(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`Invalid ${label}: ${value}`)
}

function assertAttemptOutcome(value: string): asserts value is AttemptOutcome {
  if (value !== "correct" && value !== "incorrect" && value !== "partial") {
    throw new Error(`Unsupported attempt outcome: ${value}`)
  }
}

function assertAttemptAssistance(value: string): asserts value is AttemptAssistance {
  if (value !== "independent" && value !== "hinted" && value !== "guided") {
    throw new Error(`Unsupported attempt assistance: ${value}`)
  }
}
