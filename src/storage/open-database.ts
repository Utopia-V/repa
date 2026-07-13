import { Database } from "bun:sqlite"

type Migration = {
  from: number
  to: number
  apply(database: Database): void
}

const MIGRATIONS: readonly Migration[] = [
  { from: 0, to: 1, apply: migrateToVersion1 },
  { from: 1, to: 2, apply: migrateToVersion2 },
  { from: 2, to: 3, apply: migrateToVersion3 },
  { from: 3, to: 4, apply: migrateToVersion4 },
  { from: 4, to: 5, apply: migrateToVersion5 },
]
const CURRENT_SCHEMA_VERSION = MIGRATIONS.at(-1)?.to ?? 0

export function openRepaDatabase(databasePath: string) {
  const database = new Database(databasePath)
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `)
    migrate(database)
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

function migrate(database: Database) {
  const observed = database.query("PRAGMA user_version").get() as { user_version: number }
  if (observed.user_version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${observed.user_version} is newer than supported schema ${CURRENT_SCHEMA_VERSION}`,
    )
  }
  if (observed.user_version === CURRENT_SCHEMA_VERSION) return

  database.transaction(() => {
    // Another process can complete the migration while this connection waits
    // to acquire the write transaction. Dispatch from the version inside the
    // lock, not the version observed before it.
    const current = database.query("PRAGMA user_version").get() as { user_version: number }
    if (current.user_version === CURRENT_SCHEMA_VERSION) return
    if (current.user_version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema ${current.user_version} is newer than supported schema ${CURRENT_SCHEMA_VERSION}`,
      )
    }

    let version = current.user_version
    while (version < CURRENT_SCHEMA_VERSION) {
      const migration = MIGRATIONS.find((candidate) => candidate.from === version)
      if (!migration) throw new Error(`No migration path from database schema ${version}`)
      if (migration.to !== migration.from + 1) {
        throw new Error(`Migration registry is not contiguous at schema ${migration.from}`)
      }
      migration.apply(database)
      database.exec(`PRAGMA user_version = ${migration.to}`)
      version = migration.to
    }
  }).immediate()
}

function migrateToVersion1(database: Database) {
  database.exec(`
      CREATE TABLE system_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
        last_transition_at INTEGER NOT NULL CHECK (last_transition_at >= 0)
      );

      INSERT INTO system_state (singleton, state_revision, last_transition_at)
      VALUES (1, 0, 0);

      CREATE TABLE session (
        session_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE turn (
        turn_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES session(session_id),
        status TEXT NOT NULL CHECK (
          status IN ('running', 'completed', 'failed', 'interrupted', 'exhausted')
        ),
        model_operation_limit INTEGER NOT NULL CHECK (model_operation_limit > 0),
        tool_invocation_limit INTEGER NOT NULL CHECK (tool_invocation_limit > 0),
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      );

      CREATE UNIQUE INDEX one_running_turn_per_session
        ON turn(session_id)
        WHERE status = 'running';

      CREATE TABLE turn_exhaustion (
        turn_id TEXT PRIMARY KEY REFERENCES turn(turn_id),
        attempt_kind TEXT NOT NULL CHECK (
          attempt_kind IN ('model_operation', 'tool_invocation')
        ),
        attempted_id TEXT NOT NULL,
        observed_count INTEGER NOT NULL CHECK (observed_count >= 0),
        configured_limit INTEGER NOT NULL CHECK (configured_limit > 0),
        request_json TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        UNIQUE (attempt_kind, attempted_id)
      );

      CREATE TRIGGER exhausted_turn_requires_receipt
      BEFORE UPDATE OF status ON turn
      WHEN NEW.status = 'exhausted'
        AND NOT EXISTS (
          SELECT 1 FROM turn_exhaustion WHERE turn_id = NEW.turn_id
        )
      BEGIN
        SELECT RAISE(ABORT, 'an exhausted Turn requires a durable exhaustion receipt');
      END;

      CREATE TRIGGER exhausted_turn_cannot_be_inserted
      BEFORE INSERT ON turn
      WHEN NEW.status = 'exhausted'
      BEGIN
        SELECT RAISE(ABORT, 'an exhausted Turn must be produced by a limit transition');
      END;

      CREATE TRIGGER exhausted_turn_receipt_cannot_change
      BEFORE UPDATE ON turn_exhaustion
      BEGIN
        SELECT RAISE(ABORT, 'a Turn exhaustion receipt is immutable');
      END;

      CREATE TRIGGER exhausted_turn_receipt_is_immutable
      BEFORE DELETE ON turn_exhaustion
      WHEN EXISTS (
        SELECT 1 FROM turn
        WHERE turn_id = OLD.turn_id AND status = 'exhausted'
      )
      BEGIN
        SELECT RAISE(ABORT, 'an exhausted Turn cannot lose its exhaustion receipt');
      END;

      CREATE TABLE session_item (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL REFERENCES session(session_id),
        turn_id TEXT NOT NULL REFERENCES turn(turn_id),
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX one_admitted_user_item_per_turn
        ON session_item(turn_id)
        WHERE role = 'user';

      CREATE TABLE model_operation (
        model_operation_id TEXT PRIMARY KEY,
        turn_id TEXT NOT NULL REFERENCES turn(turn_id),
        session_sequence INTEGER NOT NULL CHECK (session_sequence >= 0),
        state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
        state_transition_at INTEGER NOT NULL CHECK (state_transition_at >= 0),
        policy_profile_revision TEXT NOT NULL,
        sampled_at INTEGER NOT NULL,
        time_zone TEXT NOT NULL,
        context_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        completed_at INTEGER
      );

      CREATE UNIQUE INDEX one_running_model_operation_per_turn
        ON model_operation(turn_id)
        WHERE status = 'running';

      CREATE TABLE durable_effect (
        effect_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        cause_item_id TEXT NOT NULL REFERENCES session_item(item_id),
        effect_slot TEXT NOT NULL,
        value_json TEXT NOT NULL,
        revision_after INTEGER NOT NULL CHECK (revision_after > 0),
        created_at INTEGER NOT NULL,
        UNIQUE (kind, cause_item_id, effect_slot)
      );

      CREATE TABLE tool_invocation (
        invocation_id TEXT PRIMARY KEY,
        model_operation_id TEXT NOT NULL REFERENCES model_operation(model_operation_id),
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        effect_id TEXT REFERENCES durable_effect(effect_id),
        result_json TEXT,
        error_json TEXT,
        created_at INTEGER NOT NULL,
        settled_at INTEGER,
        CHECK (
          (
            status = 'running'
            AND effect_id IS NULL
            AND result_json IS NULL
            AND error_json IS NULL
            AND settled_at IS NULL
          )
          OR (
            status = 'completed'
            AND result_json IS NOT NULL
            AND error_json IS NULL
            AND settled_at IS NOT NULL
          )
          OR (
            status = 'failed'
            AND effect_id IS NULL
            AND result_json IS NULL
            AND error_json IS NOT NULL
            AND settled_at IS NOT NULL
          )
        )
      );

      CREATE TABLE timed_learner_steering (
        steering_effect_id TEXT PRIMARY KEY REFERENCES durable_effect(effect_id),
        source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
        verbatim_excerpt TEXT NOT NULL,
        effective_from INTEGER NOT NULL,
        valid_until INTEGER NOT NULL,
        interpretation_model_operation_id TEXT NOT NULL
          REFERENCES model_operation(model_operation_id),
        interpretation_time_zone TEXT NOT NULL,
        retracted_at INTEGER,
        retraction_effect_id TEXT REFERENCES durable_effect(effect_id),
        CHECK (effective_from < valid_until),
        CHECK (
          (retracted_at IS NULL AND retraction_effect_id IS NULL)
          OR (retracted_at IS NOT NULL AND retraction_effect_id IS NOT NULL)
        )
      );

    `)
}

function migrateToVersion2(database: Database) {
  database.exec(`
    CREATE TABLE learning_space (
      learning_space_id TEXT PRIMARY KEY,
      root_path TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE material_artifact (
      artifact_id TEXT PRIMARY KEY,
      learning_space_id TEXT NOT NULL REFERENCES learning_space(learning_space_id),
      kind TEXT NOT NULL CHECK (kind IN ('markdown')),
      relative_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (learning_space_id, relative_path)
    );

    CREATE TABLE material_revision (
      artifact_id TEXT NOT NULL REFERENCES material_artifact(artifact_id),
      artifact_revision TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
      line_count INTEGER NOT NULL CHECK (line_count > 0),
      PRIMARY KEY (artifact_id, artifact_revision)
    );

    CREATE TABLE course (
      course_id TEXT PRIMARY KEY,
      learning_space_id TEXT NOT NULL REFERENCES learning_space(learning_space_id),
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE course_view_revision (
      course_view_revision_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES course(course_id),
      basis TEXT NOT NULL CHECK (basis IN ('source_grounded', 'model_proposed')),
      source_artifact_id TEXT REFERENCES material_artifact(artifact_id),
      source_artifact_revision TEXT,
      parser_revision TEXT,
      source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      created_at INTEGER NOT NULL,
      superseded_at INTEGER,
      CHECK (
        (
          basis = 'source_grounded'
          AND source_artifact_id IS NOT NULL
          AND source_artifact_revision IS NOT NULL
          AND parser_revision IS NOT NULL
        )
        OR (
          basis = 'model_proposed'
          AND source_artifact_id IS NULL
          AND source_artifact_revision IS NULL
          AND parser_revision IS NULL
        )
      ),
      FOREIGN KEY (source_artifact_id, source_artifact_revision)
        REFERENCES material_revision(artifact_id, artifact_revision)
    );

    CREATE TABLE course_item (
      course_item_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES course(course_id),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE course_view_item (
      course_view_revision_id TEXT NOT NULL
        REFERENCES course_view_revision(course_view_revision_id),
      course_item_id TEXT NOT NULL REFERENCES course_item(course_item_id),
      parent_course_item_id TEXT,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      title TEXT NOT NULL,
      PRIMARY KEY (course_view_revision_id, course_item_id),
      UNIQUE (course_view_revision_id, ordinal),
      FOREIGN KEY (course_view_revision_id, parent_course_item_id)
        REFERENCES course_view_item(course_view_revision_id, course_item_id)
        DEFERRABLE INITIALLY DEFERRED
    );

    CREATE TABLE active_course_view (
      course_id TEXT PRIMARY KEY REFERENCES course(course_id),
      course_view_revision_id TEXT NOT NULL UNIQUE
        REFERENCES course_view_revision(course_view_revision_id),
      version INTEGER NOT NULL CHECK (version > 0),
      source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE material_alignment (
      alignment_id TEXT PRIMARY KEY,
      course_view_revision_id TEXT NOT NULL,
      course_item_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      artifact_revision TEXT NOT NULL,
      start_line INTEGER NOT NULL CHECK (start_line > 0),
      end_line INTEGER NOT NULL CHECK (end_line >= start_line),
      basis TEXT NOT NULL CHECK (basis IN ('markdown_heading')),
      source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      created_at INTEGER NOT NULL,
      UNIQUE (course_view_revision_id, course_item_id, artifact_id, artifact_revision),
      FOREIGN KEY (course_view_revision_id, course_item_id)
        REFERENCES course_view_item(course_view_revision_id, course_item_id),
      FOREIGN KEY (artifact_id, artifact_revision)
        REFERENCES material_revision(artifact_id, artifact_revision)
    );

    CREATE TABLE course_route_progress (
      course_id TEXT PRIMARY KEY REFERENCES course(course_id),
      course_view_revision_id TEXT NOT NULL,
      route_anchor_item_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (course_view_revision_id, route_anchor_item_id)
        REFERENCES course_view_item(course_view_revision_id, course_item_id)
    );

    CREATE TABLE current_learning_focus (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      learning_space_id TEXT NOT NULL REFERENCES learning_space(learning_space_id),
      course_id TEXT NOT NULL REFERENCES course(course_id),
      version INTEGER NOT NULL CHECK (version > 0),
      source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      updated_at INTEGER NOT NULL
    );
  `)
}

function migrateToVersion3(database: Database) {
  database.exec(`
    CREATE TABLE course_view_transition (
      transition_effect_id TEXT PRIMARY KEY REFERENCES durable_effect(effect_id),
      course_id TEXT NOT NULL REFERENCES course(course_id),
      from_course_view_revision_id TEXT NOT NULL
        REFERENCES course_view_revision(course_view_revision_id),
      to_course_view_revision_id TEXT NOT NULL
        REFERENCES course_view_revision(course_view_revision_id),
      kind TEXT NOT NULL CHECK (kind IN ('provisional_revision', 'material_realign')),
      source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      created_at INTEGER NOT NULL,
      UNIQUE (from_course_view_revision_id),
      CHECK (from_course_view_revision_id <> to_course_view_revision_id)
    );
  `)
}

function migrateToVersion4(database: Database) {
  database.exec(`
    CREATE TABLE agenda_revisit (
      revisit_id TEXT PRIMARY KEY,
      creation_effect_id TEXT NOT NULL UNIQUE REFERENCES durable_effect(effect_id),
      creation_source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      creation_model_operation_id TEXT NOT NULL
        REFERENCES model_operation(model_operation_id),
      semantic_author_kind TEXT NOT NULL CHECK (
        semantic_author_kind IN ('learner_requested', 'tutor_initiated')
      ),
      learner_request_excerpt TEXT,
      target_course_id TEXT NOT NULL REFERENCES course(course_id),
      target_course_view_revision_id TEXT NOT NULL,
      target_course_item_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      not_before INTEGER NOT NULL CHECK (not_before >= 0),
      status TEXT NOT NULL CHECK (
        status IN ('open', 'addressed', 'dismissed', 'superseded')
      ),
      version INTEGER NOT NULL CHECK (version > 0),
      successor_revisit_id TEXT REFERENCES agenda_revisit(revisit_id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (
        creation_source_item_id,
        target_course_view_revision_id,
        target_course_item_id
      ),
      FOREIGN KEY (target_course_view_revision_id, target_course_item_id)
        REFERENCES course_view_item(course_view_revision_id, course_item_id),
      CHECK (
        (
          semantic_author_kind = 'learner_requested'
          AND learner_request_excerpt IS NOT NULL
        )
        OR (
          semantic_author_kind = 'tutor_initiated'
          AND learner_request_excerpt IS NULL
        )
      ),
      CHECK (
        (status = 'superseded' AND successor_revisit_id IS NOT NULL)
        OR (status <> 'superseded' AND successor_revisit_id IS NULL)
      )
    );

    CREATE TABLE agenda_revisit_transition (
      transition_effect_id TEXT PRIMARY KEY REFERENCES durable_effect(effect_id),
      revisit_id TEXT NOT NULL REFERENCES agenda_revisit(revisit_id),
      from_status TEXT NOT NULL CHECK (
        from_status IN ('open', 'addressed', 'dismissed')
      ),
      to_status TEXT NOT NULL CHECK (
        to_status IN ('open', 'addressed', 'dismissed', 'superseded')
      ),
      command_source_item_id TEXT NOT NULL REFERENCES session_item(item_id),
      transition_model_operation_id TEXT NOT NULL
        REFERENCES model_operation(model_operation_id),
      service_occurrence_item_id TEXT REFERENCES session_item(item_id),
      successor_revisit_id TEXT REFERENCES agenda_revisit(revisit_id),
      rationale TEXT NOT NULL,
      version_after INTEGER NOT NULL CHECK (version_after > 1),
      occurred_at INTEGER NOT NULL,
      UNIQUE (revisit_id, version_after),
      CHECK (
        (
          to_status = 'addressed'
          AND from_status = 'open'
          AND service_occurrence_item_id IS NOT NULL
          AND successor_revisit_id IS NULL
        )
        OR (
          to_status = 'dismissed'
          AND from_status = 'open'
          AND service_occurrence_item_id IS NULL
          AND successor_revisit_id IS NULL
        )
        OR (
          to_status = 'superseded'
          AND from_status = 'open'
          AND service_occurrence_item_id IS NULL
          AND successor_revisit_id IS NOT NULL
        )
        OR (
          to_status = 'open'
          AND from_status IN ('addressed', 'dismissed')
          AND service_occurrence_item_id IS NULL
          AND successor_revisit_id IS NULL
        )
      )
    );

    CREATE INDEX open_agenda_revisit_by_course_and_time
      ON agenda_revisit(target_course_id, status, not_before, created_at);
  `)
}

function migrateToVersion5(database: Database) {
  database.exec(`
    ALTER TABLE agenda_revisit
    ADD COLUMN learner_role_constraint TEXT CHECK (
      learner_role_constraint IS NULL
      OR learner_role_constraint = 'learner_response_before_tutor_disclosure'
    );
  `)
}
