import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { fileURLToPath } from "url"
import path from "path"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { Effect, Layer } from "effect"
import { eq, inArray, sql } from "drizzle-orm"
import { DatabaseMigration } from "@opencode-ai/core/database/migration"
import { APPLICATION_ID, BASELINE_ID, BASELINE_VERSION } from "@opencode-ai/core/database/admission"
import sessionUsageMigration from "@opencode-ai/core/database/migration/20260510033149_session_usage"
import normalizeStoragePathsMigration from "@opencode-ai/core/database/migration/20260601010001_normalize_storage_paths"
import sessionMessageProjectionOrderMigration from "@opencode-ai/core/database/migration/20260603040000_session_message_projection_order"
import eventSourcedSessionInputMigration from "@opencode-ai/core/database/migration/20260604172448_event_sourced_session_input"
import contextEpochAgentMigration from "@opencode-ai/core/database/migration/20260605042240_add_context_epoch_agent"
import simplifyIntegrationCredentialsMigration from "@opencode-ai/core/database/migration/20260611192811_lush_chimera"
import simplifySessionInputMigration from "@opencode-ai/core/database/migration/20260622202450_simplify_session_input"
import courseViewAuthorityMigration from "@opencode-ai/core/database/migration/repa/20260714191244_course_view_authority"
import learningCommandSettlementMigration from "@opencode-ai/core/database/migration/repa/20260716045209_learning_command_settlement"
import sourceArtifactAuthorityMigration from "@opencode-ai/core/database/migration/repa/20260716152016_source_artifact_authority"
import contentRootAuthorityMigration from "@opencode-ai/core/database/migration/repa/20260716191911_content_root_authority"
import readableRepresentationLineageMigration from "@opencode-ai/core/database/migration/repa/20260717141402_readable_representation_lineage"
import durableTurnMigration from "@opencode-ai/core/database/migration/repa/20260718134404_gate12_durable_turn"
import materialMapAlignmentMigration from "@opencode-ai/core/database/migration/repa/20260719104356_material_map_alignment"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { SessionTable } from "@opencode-ai/core/session/sql"
import type { SqlClient as SqlClientService } from "effect/unstable/sql/SqlClient"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { tmpdir } from "./fixture/tmpdir"

const run = <A, E>(effect: Effect.Effect<A, E, SqlClientService>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Effect.scoped),
  )

const makeDb = EffectDrizzleSqlite.makeWithDefaults()
type TestDatabase = Effect.Success<typeof makeDb>
const courseTables = [
  "course_view_revision_mapping_source",
  "course_view_revision_mapping_target",
  "course_view_revision_reuse_citation",
  "course_working_selection",
  "course_view_revision_item",
  "course_view_revision_state",
  "course_view_revision_mapping_group",
  "course_view_revision",
  "course_item",
  "course_view",
  "course",
] as const
const learningCommandTables = [
  "learning_command_receipt",
  "learning_command_invocation",
  "course_selection_acceptance_effect",
  "learning_occurrence_tombstone",
  "learning_occurrence_presentation",
  "learning_historical_tool_presentation",
  "learning_admitted_occurrence",
] as const
const artifactTables = [
  "artifact_current_source",
  "artifact_observation_correction",
  "artifact_source_observation",
  "artifact_source_binding",
  "artifact_lineage_correction_member",
  "artifact_lineage_correction_set",
  "artifact_revision",
  "artifact",
] as const
const contentRootTables = [
  "content_root_current",
  "content_mutation_grant",
  "content_root_grant_episode",
  "content_root_binding_episode",
  "content_root_binding",
  "content_root",
] as const
const representationTables = [
  "representation_availability_current",
  "representation_availability_event",
  "representation_continued_use_grant",
  "representation_revision",
  "representation_effect",
] as const
const turnTables = [
  "session_historical_part_presentation",
  "session_historical_message_presentation",
  "turn_historical_tool_presentation",
  "turn_historical_model_presentation",
  "turn_historical_input_presentation",
  "turn_candidate_redaction",
  "turn_transcript_redaction",
  "turn_child_result",
  "turn_child_lineage",
  "turn_candidate_presentation",
  "turn_model_presentation",
  "turn_input_presentation",
  "turn_tool_invocation",
  "turn_tool_candidate",
  "turn_model_operation",
  "turn_input",
  "turn",
  "turn_unavailable_tool",
  "turn_unavailable_model",
  "turn_unavailable_source",
  "learning_shared_frontier",
] as const
const materialTables = [
  "material_course_alignment_disposition_event",
  "material_course_alignment_state",
  "material_course_alignment",
  "material_selector",
  "material_outline_node",
  "material_map_disposition_event",
  "material_map_state",
  "material_map_artifact_target",
  "material_map_representation_target",
  "material_map",
] as const

function applyHistorical(db: TestDatabase, input: readonly DatabaseMigration.Migration[]) {
  return Effect.forEach(input, (migration) => db.transaction((tx) => migration.up(tx)), { discard: true })
}

function normalizeSchemaDefinition(definition: string | null) {
  return (
    definition
      ?.replace(/\s+/g, " ")
      .trim()
      .replace(/^CREATE TABLE [`"]([^`"]+)[`"] /, "CREATE TABLE $1 ") ?? null
  )
}

function courseSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE tbl_name LIKE 'course%' AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function learningCommandSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE (tbl_name LIKE 'learning%' OR tbl_name = 'course_selection_acceptance_effect')
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function artifactSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE tbl_name LIKE 'artifact%' AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function contentRootSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE (tbl_name LIKE 'content_root%' OR tbl_name = 'content_mutation_grant')
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function representationSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE tbl_name LIKE 'representation%' AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function turnSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE (tbl_name LIKE 'turn%' OR tbl_name LIKE 'session_historical_%' OR tbl_name = 'learning_shared_frontier')
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function restoreGate8LearningSchema(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* Effect.forEach(learningCommandTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
      discard: true,
    })
    yield* Effect.forEach(representationTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
      discard: true,
    })
    yield* db.transaction((tx) => learningCommandSettlementMigration.up(tx))
  })
}

function removeGate13(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* Effect.forEach(materialTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
      discard: true,
    })
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 7}`)
  })
}

describe("DatabaseMigration", () => {
  test("serializes concurrent embedded initialization for one database path", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "embedded.sqlite")
    const layers = [Database.layerFromPath(filename), Database.layerFromPath(filename)]

    await Effect.runPromise(
      Effect.all(
        layers.map((layer) => Effect.scoped(Layer.build(layer))),
        { concurrency: "unbounded" },
      ),
    )
  })
  if (process.platform === "linux") {
    test("declared schema has no ungenerated migrations", async () => {
      const result = await $`bun ${fileURLToPath(new URL("../script/migration.ts", import.meta.url))} --check`
        .quiet()
        .nothrow()
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      expect(result.stdout.toString()).toContain("No schema changes, nothing to migrate")
    }, 30_000)
  }

  test("initializes the current native Repa schema", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)

        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'`)).toEqual({
          name: "session",
        })
        expect(
          yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_input'`),
        ).toEqual({ name: "session_input" })
        expect(
          yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_context_epoch'`),
        ).toEqual({ name: "session_context_epoch" })
        expect(
          yield* db.get(
            sql`SELECT name FROM pragma_table_info('session_context_epoch') WHERE name IN ('agent', 'replacement_seq', 'revision')`,
          ),
        ).toBeUndefined()
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA application_id"))).toEqual({
          application_id: APPLICATION_ID,
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })
        expect(yield* db.all(sql`SELECT version, id FROM repa_migration ORDER BY version`)).toEqual([
          { version: BASELINE_VERSION, id: BASELINE_ID },
          { version: BASELINE_VERSION + 1, id: courseViewAuthorityMigration.id },
          { version: BASELINE_VERSION + 2, id: learningCommandSettlementMigration.id },
          { version: BASELINE_VERSION + 3, id: sourceArtifactAuthorityMigration.id },
          { version: BASELINE_VERSION + 4, id: contentRootAuthorityMigration.id },
          { version: BASELINE_VERSION + 5, id: readableRepresentationLineageMigration.id },
          { version: BASELINE_VERSION + 6, id: durableTurnMigration.id },
          { version: BASELINE_VERSION + 7, id: materialMapAlignmentMigration.id },
        ])
        expect(
          yield* db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'course%' ORDER BY name`),
        ).toHaveLength(12)
        expect(
          yield* db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'artifact%' ORDER BY name`,
          ),
        ).toHaveLength(8)
        expect(
          yield* db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'content_root%' OR name = 'content_mutation_grant') ORDER BY name`,
          ),
        ).toHaveLength(6)
        expect(
          yield* db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'representation%' ORDER BY name`,
          ),
        ).toHaveLength(5)
        expect(
          yield* db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('event_aggregate_seq_idx', 'event_aggregate_type_seq_idx', 'session_input_session_pending_seq_idx', 'session_input_session_pending_delivery_seq_idx', 'session_input_session_admitted_seq_idx', 'session_input_session_promoted_seq_idx', 'session_message_session_idx', 'session_message_session_type_idx', 'session_message_session_seq_idx', 'session_message_session_type_seq_idx', 'session_message_session_time_created_id_idx') ORDER BY name`,
          ),
        ).toEqual([
          { name: "event_aggregate_seq_idx" },
          { name: "event_aggregate_type_seq_idx" },
          { name: "session_input_session_admitted_seq_idx" },
          { name: "session_input_session_pending_delivery_seq_idx" },
          { name: "session_input_session_promoted_seq_idx" },
          { name: "session_message_session_seq_idx" },
          { name: "session_message_session_time_created_id_idx" },
          { name: "session_message_session_type_seq_idx" },
        ])
      }),
    )
  })

  test("upgrades a Gate 6 database without changing Session rows", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db, { migrations: [] })
        yield* Effect.forEach(learningCommandTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* Effect.forEach(courseTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('global', '/learning', 1, 1, '[]')`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES ('session', 'global', 'session', '/learning', 'Before Gate 7', 'test', 1, 1)`,
        )

        yield* DatabaseMigration.apply(db, {
          path: "gate-6.db",
          migrations: [courseViewAuthorityMigration],
        })

        expect(yield* db.get(sql`SELECT id, title, directory FROM session WHERE id = 'session'`)).toEqual({
          id: "session",
          title: "Before Gate 7",
          directory: "/learning",
        })
        expect(
          yield* db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'course%' ORDER BY name`),
        ).toHaveLength(11)
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION + 1,
        })
      }),
    )
  })

  test("builds the same Gate 7 schema through fresh and upgrade paths", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* courseSchema(db)

        yield* Effect.forEach(courseTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.transaction((tx) => courseViewAuthorityMigration.up(tx))

        expect(yield* courseSchema(db)).toEqual(fresh)
      }),
    )
  })

  test("builds the same Gate 8 schema from Gate 7 without fabricating legacy occurrence lineage", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)

        yield* Effect.forEach(learningCommandTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('gate7-project', '/learning', 1, 1, '[]')`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES ('gate7-session', 'gate7-project', 'gate7', '/learning', 'Gate 7', 'test', 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('msg_gate7_legacy', 'gate7-session', 1, 1, '{"role":"user"}')`,
        )
        yield* db.transaction((tx) => learningCommandSettlementMigration.up(tx))

        expect(
          (yield* db.all<{ name: string }>(sql`PRAGMA table_info('learning_command_invocation')`)).map(
            (column) => column.name,
          ),
        ).not.toContain("representation_effect_id")
        expect(
          (yield* db.all<{ name: string }>(sql`PRAGMA table_info('learning_command_receipt')`)).map(
            (column) => column.name,
          ),
        ).not.toContain("representation_effect_id")
        expect(yield* db.all(sql`SELECT * FROM learning_admitted_occurrence`)).toEqual([])
        expect(yield* db.get(sql`SELECT id, data FROM message WHERE id = 'msg_gate7_legacy'`)).toEqual({
          id: "msg_gate7_legacy",
          data: '{"role":"user"}',
        })
      }),
    )
  })

  test("builds the same Gate 9 schema from Gate 8 without fabricating Artifact authority", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* artifactSchema(db)

        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* restoreGate8LearningSchema(db)
        yield* Effect.forEach(contentRootTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* Effect.forEach(artifactTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(
          sql`DELETE FROM repa_migration WHERE version IN (${BASELINE_VERSION + 3}, ${BASELINE_VERSION + 4}, ${BASELINE_VERSION + 5}, ${BASELINE_VERSION + 6})`,
        )
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 2}`))
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('gate8-project', '/learning', 1, 1, '[]')`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES ('gate8-session', 'gate8-project', 'gate8', '/learning', 'Gate 8', 'test', 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('msg_gate8', 'gate8-session', 1, 1, '{"role":"user"}')`,
        )
        yield* db.run(
          sql`INSERT INTO course (id, title, state_version, time_created, time_updated) VALUES ('crs_gate8', 'Gate 8 course', 0, 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO learning_admitted_occurrence (id, origin_session_id, origin_message_id, time_admitted) VALUES ('loc_gate8', 'gate8-session', 'msg_gate8', 1)`,
        )

        yield* DatabaseMigration.apply(db)

        expect(yield* artifactSchema(db)).toEqual(fresh)
        expect(yield* db.all(sql`SELECT id FROM artifact`)).toEqual([])
        const memberForeignKeys = new Set(
          (yield* db.all<{ from: string }>(sql`PRAGMA foreign_key_list('artifact_lineage_correction_member')`)).map(
            (row) => row.from,
          ),
        )
        for (const column of [
          "boundary_binding_id",
          "boundary_observation_id",
          "boundary_descriptor_observation_id",
          "boundary_descriptor_correction_id",
        ]) {
          expect(memberForeignKeys).toContain(column)
        }
        expect(yield* db.get(sql`SELECT id, title FROM session WHERE id = 'gate8-session'`)).toEqual({
          id: "gate8-session",
          title: "Gate 8",
        })
        expect(yield* db.get(sql`SELECT id, title FROM course WHERE id = 'crs_gate8'`)).toEqual({
          id: "crs_gate8",
          title: "Gate 8 course",
        })
        expect(yield* db.get(sql`SELECT id FROM learning_admitted_occurrence WHERE id = 'loc_gate8'`)).toEqual({
          id: "loc_gate8",
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })

        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        yield* db.run(sql`
          INSERT INTO artifact (
            id, admission_root_artifact_id, creation_basis, creation_capability_identity,
            creation_capability_version, disposition_version, lineage_version, correction_hidden,
            time_created, time_updated
          ) VALUES ('artifact-fk', 'artifact-fk', 'learner_instruction', 'test', 1, 0, 0, 0, 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO artifact_revision (
            id, recorded_artifact_id, fingerprint_algorithm, fingerprint_digest,
            byte_length, time_first_observed
          ) VALUES ('revision-fk', 'artifact-fk', 'sha256', ${"a".repeat(64)}, 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO artifact_source_binding (
            id, recorded_artifact_id, binding_ordinal, canonical_location, basis_kind,
            basis_capability_identity, basis_capability_version, time_started
          ) VALUES ('binding-fk', 'artifact-fk', 1, '/fk.pdf', 'admission', 'test', 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO artifact_source_observation (
            id, recorded_artifact_id, binding_id, occurrence_ordinal, result, revision_id,
            media_type, observer_capability_identity, observer_capability_version,
            time_observed, time_committed
          ) VALUES (
            'observation-fk', 'artifact-fk', 'binding-fk', 1, 'present', 'revision-fk',
            'application/pdf', 'test', 1, 1, 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO artifact_lineage_correction_set (
            id, admission_root_artifact_id, basis, capability_identity, capability_version,
            time_committed
          ) VALUES ('set-fk', 'artifact-fk', 'learner_statement', 'test', 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO artifact_lineage_correction_member (
            id, set_id, recorded_artifact_id, lineage_version, start_after_ordinal,
            end_at_ordinal, time_effective, boundary_binding_id, boundary_observation_id,
            boundary_revision_id, boundary_descriptor_observation_id, boundary_media_type,
            boundary_availability, outcome_kind
          ) VALUES (
            'member-fk', 'set-fk', 'artifact-fk', 1, 0, 1, 1, 'binding-fk',
            'observation-fk', 'revision-fk', 'observation-fk', 'application/pdf',
            'available', 'recorded'
          )
        `)
        for (const column of [
          "boundary_binding_id",
          "boundary_observation_id",
          "boundary_descriptor_observation_id",
          "boundary_descriptor_correction_id",
        ]) {
          const dangling = yield* Effect.exit(
            db.run(
              sql`UPDATE artifact_lineage_correction_member SET ${sql.identifier(column)} = ${"missing"} WHERE id = 'member-fk'`,
            ),
          )
          expect(dangling._tag).toBe("Failure")
        }
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("builds the same Gate 10 schema from Gate 9 without fabricating filesystem authority", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* contentRootSchema(db)

        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* restoreGate8LearningSchema(db)
        yield* Effect.forEach(contentRootTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(
          sql`DELETE FROM repa_migration WHERE version IN (${BASELINE_VERSION + 4}, ${BASELINE_VERSION + 5}, ${BASELINE_VERSION + 6})`,
        )
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 3}`))
        yield* db.run(sql`
          INSERT INTO artifact (
            id, admission_root_artifact_id, creation_basis, creation_capability_identity,
            creation_capability_version, disposition_version, lineage_version, correction_hidden,
            time_created, time_updated
          ) VALUES ('gate9-artifact', 'gate9-artifact', 'learner_instruction', 'test', 1, 0, 0, 0, 1, 1)
        `)

        yield* DatabaseMigration.apply(db)

        expect(yield* contentRootSchema(db)).toEqual(fresh)
        expect(yield* db.all(sql`SELECT id FROM content_root`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM content_mutation_grant`)).toEqual([])
        expect(yield* db.get(sql`SELECT id FROM artifact WHERE id = 'gate9-artifact'`)).toEqual({
          id: "gate9-artifact",
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("builds the same Gate 11 schema from Gate 10 without fabricating Representation authority", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const freshLearning = yield* learningCommandSchema(db)
        const freshContentRoot = yield* contentRootSchema(db)
        const freshRepresentation = yield* representationSchema(db)

        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* restoreGate8LearningSchema(db)
        yield* Effect.forEach(contentRootTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.transaction((tx) => contentRootAuthorityMigration.up(tx))
        yield* db.run(
          sql`DELETE FROM repa_migration WHERE version IN (${BASELINE_VERSION + 5}, ${BASELINE_VERSION + 6})`,
        )
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 4}`))
        yield* db.run(
          sql`INSERT INTO learning_admitted_occurrence (id, origin_session_id, origin_message_id, time_admitted) VALUES ('loc_gate10', 'gate10-session', 'gate10-message', 1)`,
        )
        yield* db.run(sql`
          INSERT INTO learning_command_invocation (
            part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
            occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
            capability_version, authorization_basis, input_fingerprint, status, time_admitted
          ) VALUES (
            'part_gate10', 'gate10-session', 'user_gate10', 'assistant_gate10', 'call_gate10',
            'loc_gate10', 'accept_course_view_revision', 1, 0, 'accept_course_view_revision',
            1, 'learner_request', ${"a".repeat(64)}, 'admitted', 1
          )
        `)
        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        yield* db.run(
          sql`INSERT INTO course (id, title, state_version, time_created, time_updated) VALUES ('crs_gate10', 'Gate 10 course', 0, 1, 1)`,
        )
        yield* db.run(sql`
          INSERT INTO course_view (id, course_id, name, state_version, time_created, time_updated)
          VALUES ('view_gate10', 'crs_gate10', 'Gate 10 view', 0, 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO course_view_revision (
            id, course_id, view_id, revision_number, authorship_basis, time_created
          ) VALUES ('revision_gate10', 'crs_gate10', 'view_gate10', 1, 'learner_directed', 1)
        `)
        yield* db.run(sql`
          INSERT INTO course_view_revision_state (course_id, view_id, revision_id, state_version, time_updated)
          VALUES ('crs_gate10', 'view_gate10', 'revision_gate10', 0, 1)
        `)
        yield* db.run(sql`
          INSERT INTO learning_admitted_occurrence (id, origin_session_id, origin_message_id, time_admitted)
          VALUES ('loc_gate10_applied', 'gate10-session', 'gate10-message-applied', 1)
        `)
        yield* db.run(sql`
          INSERT INTO course_selection_acceptance_effect (
            id, occurrence_id, course_id, accepted_revision_id, previous_selection_version,
            committed_selection_version, time_committed
          ) VALUES ('effect_gate10', 'loc_gate10_applied', 'crs_gate10', 'revision_gate10', 0, 1, 2)
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_invocation (
            part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
            occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
            capability_version, authorization_basis, input_fingerprint, status, effect_id, settlement,
            time_admitted, time_settled, settlement_order
          ) VALUES (
            'part_gate10_applied', 'gate10-session', 'user_gate10_applied', 'assistant_gate10_applied',
            'call_gate10_applied', 'loc_gate10_applied', 'accept_course_view_revision', 1, 0,
            'accept_course_view_revision', 1, 'learner_request', ${"b".repeat(64)}, 'applied',
            'effect_gate10', '{"outcome":"applied"}', 1, 2, 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_receipt (
            id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
            invocation_part_id, capability_identity, capability_version, authorization_basis,
            effect_id, time_committed, commit_order
          ) VALUES (
            'receipt_gate10', 'loc_gate10_applied', 'gate10-session', 'gate10-message-applied',
            'assistant_gate10_applied', 'part_gate10_applied', 'accept_course_view_revision', 1,
            'learner_request', 'effect_gate10', 2, 1
          )
        `)
        yield* db.run(sql`INSERT INTO content_root (id, time_created) VALUES ('root_gate10', 1)`)
        yield* db.run(sql`
          INSERT INTO content_root_binding (
            id, content_root_id, canonical_path, canonical_path_key, platform, volume_serial,
            object_id, creation_time, initial_change_time, verifier_version, time_created
          ) VALUES (
            'binding_gate10', 'root_gate10', 'C:\\gate10', 'c:\\gate10', 'windows_ntfs', 'volume',
            '0123456789abcdef0123456789abcdef', 'creation', 'change', 1, 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO content_root_binding_episode (
            id, content_root_id, binding_id, ordinal, approval_basis, time_started
          ) VALUES ('binding_episode_gate10', 'root_gate10', 'binding_gate10', 1, 'learner approval', 1)
        `)
        yield* db.run(sql`
          INSERT INTO content_root_grant_episode (
            id, content_root_id, binding_id, binding_episode_id, ordinal, approval_basis,
            time_approved, time_updated
          ) VALUES (
            'grant_episode_gate10', 'root_gate10', 'binding_gate10', 'binding_episode_gate10', 1,
            'learner approval', 1, 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO content_root_current (
            content_root_id, binding_id, binding_episode_id, grant_episode_id, disposition, time_updated
          ) VALUES (
            'root_gate10', 'binding_gate10', 'binding_episode_gate10', 'grant_episode_gate10', 'active', 1
          )
        `)
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])

        yield* DatabaseMigration.apply(db)

        expect(yield* learningCommandSchema(db)).toEqual(freshLearning)
        expect(yield* contentRootSchema(db)).toEqual(freshContentRoot)
        expect(yield* representationSchema(db)).toEqual(freshRepresentation)
        expect(yield* db.all(sql`SELECT id FROM representation_revision`)).toEqual([])
        expect(
          yield* db.get(
            sql`SELECT part_id, status, representation_effect_id, turn_id, input_id FROM learning_command_invocation WHERE part_id = 'part_gate10'`,
          ),
        ).toEqual({
          part_id: "part_gate10",
          status: "admitted",
          representation_effect_id: null,
          turn_id: null,
          input_id: null,
        })
        expect(
          yield* db.get(sql`
            SELECT id, invocation_part_id, effect_id
            FROM learning_command_receipt
            WHERE id = 'receipt_gate10'
          `),
        ).toEqual({ id: "receipt_gate10", invocation_part_id: "part_gate10_applied", effect_id: "effect_gate10" })
        expect(
          yield* db.get(sql`
            SELECT content_root_id, binding_id, binding_episode_id, grant_episode_id, disposition
            FROM content_root_current
            WHERE content_root_id = 'root_gate10'
          `),
        ).toEqual({
          content_root_id: "root_gate10",
          binding_id: "binding_gate10",
          binding_episode_id: "binding_episode_gate10",
          grant_episode_id: "grant_episode_gate10",
          disposition: "active",
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA foreign_keys"))).toEqual({ foreign_keys: 1 })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("builds the same Gate 12 schema from Gate 11 without fabricating legacy Turns", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* turnSchema(db)

        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 6}`)
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 5}`))
        yield* db.run(sql`
          INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
          VALUES ('gate11-project', '/learning', 1, 1, '[]')
        `)
        yield* db.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES ('gate11-legacy', 'gate11-project', 'legacy', '/learning', 'Legacy transcript', 'test', 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data)
          VALUES ('msg_gate11_legacy', 'gate11-legacy', 1, 1, '{"role":"user"}')
        `)
        yield* db.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES ('gate11-empty', 'gate11-project', 'empty', '/learning', 'Empty', 'test', 2, 2)
        `)
        yield* db.run(sql`INSERT INTO event_sequence (aggregate_id, seq) VALUES ('gate11-empty', 0)`)
        yield* db.run(sql`
          INSERT INTO event (id, aggregate_id, seq, type, data)
          VALUES ('evt_gate11_empty', 'gate11-empty', 0, 'session.created.1', '{}')
        `)

        yield* DatabaseMigration.apply(db)

        expect(yield* turnSchema(db)).toEqual(fresh)
        expect(yield* db.all(sql`SELECT id FROM turn`)).toEqual([])
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = 'gate11-legacy'`)).toEqual({ id: "gate11-legacy" })
        expect(yield* db.get(sql`SELECT id FROM message WHERE id = 'msg_gate11_legacy'`)).toEqual({
          id: "msg_gate11_legacy",
        })
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = 'gate11-empty'`)).toBeUndefined()
        expect(yield* db.get(sql`SELECT id FROM event WHERE aggregate_id = 'gate11-empty'`)).toBeUndefined()
        expect(
          yield* db.get(sql`SELECT aggregate_id FROM event_sequence WHERE aggregate_id = 'gate11-empty'`),
        ).toBeUndefined()
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("rolls Gate 12 migration back for a referenced empty legacy Session", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 6}`)
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 5}`))
        yield* db.run(sql`
          INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
          VALUES ('gate11-anomaly-project', '/learning', 1, 1, '[]')
        `)
        yield* db.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES ('gate11-anomaly', 'gate11-anomaly-project', 'anomaly', '/learning', 'Anomaly', 'test', 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO session_input (id, session_id, prompt, delivery, admitted_seq, time_created)
          VALUES ('input_gate11_anomaly', 'gate11-anomaly', '{}', 'steer', 0, 1)
        `)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "gate11-anomaly.db" }))

        expect(error).toMatchObject({ migrationID: durableTurnMigration.id })
        expect(String(error.cause)).toContain("cannot migrate referenced empty legacy Session gate11-anomaly")
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = 'gate11-anomaly'`)).toEqual({
          id: "gate11-anomaly",
        })
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE name = 'turn'`)).toBeUndefined()
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION + 5,
        })
        expect(
          yield* db.get(sql`SELECT version FROM repa_migration WHERE version = ${BASELINE_VERSION + 6}`),
        ).toBeUndefined()
      }),
    )
  })

  test("rejects a non-empty foreign database", async () => {
    await expect(
      run(
        Effect.gen(function* () {
          const db = yield* makeDb
          yield* db.run(sql`CREATE TABLE unrelated (id text PRIMARY KEY)`)
          yield* DatabaseMigration.apply(db)
        }),
      ),
    ).rejects.toThrow("is not a recognized Repa database")
  })

  test("backfills existing Context Epoch rows to the build agent", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(
          sql`CREATE TABLE session_context_epoch (session_id text PRIMARY KEY, baseline text NOT NULL, snapshot text NOT NULL, baseline_seq integer NOT NULL, replacement_seq integer, revision integer DEFAULT 0 NOT NULL)`,
        )
        yield* db.run(
          sql`INSERT INTO session_context_epoch (session_id, baseline, snapshot, baseline_seq) VALUES ('ses_existing', 'baseline', '{}', 0)`,
        )

        yield* applyHistorical(db, [contextEpochAgentMigration])

        expect(yield* db.get(sql`SELECT agent FROM session_context_epoch WHERE session_id = 'ses_existing'`)).toEqual({
          agent: "build",
        })
      }),
    )
  })

  test("keeps legacy credential fields nullable", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(
          sql`CREATE TABLE credential (id text PRIMARY KEY, connector_id text NOT NULL, method_id text NOT NULL, label text NOT NULL, value text NOT NULL, active integer DEFAULT false NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL)`,
        )
        yield* db.run(
          sql`CREATE UNIQUE INDEX credential_connector_active_idx ON credential (connector_id) WHERE active = 1`,
        )
        yield* applyHistorical(db, [simplifyIntegrationCredentialsMigration])

        yield* db.run(
          sql`INSERT INTO credential (id, connector_id, method_id, label, value, active, time_created, time_updated) VALUES ('legacy', 'openai', 'oauth', 'Legacy', '{}', 1, 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO credential (id, integration_id, label, value, time_created, time_updated) VALUES ('current', 'anthropic', 'Current', '{}', 2, 2)`,
        )
        expect(yield* db.get(sql`SELECT connector_id, method_id, active FROM credential WHERE id = 'current'`)).toEqual(
          { connector_id: null, method_id: null, active: null },
        )
      }),
    )
  })

  test("resets beta history and rebuilds event-sourced Session input storage", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY, workspace_id text)`)
        yield* db.run(sql`CREATE TABLE workspace (id text PRIMARY KEY)`)
        yield* db.run(sql`CREATE TABLE message (id text PRIMARY KEY)`)
        yield* db.run(sql`CREATE TABLE part (id text PRIMARY KEY)`)
        yield* db.run(sql`CREATE TABLE event_sequence (aggregate_id text PRIMARY KEY, seq integer NOT NULL)`)
        yield* db.run(
          sql`CREATE TABLE event (id text PRIMARY KEY, aggregate_id text NOT NULL, seq integer NOT NULL, type text NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(sql`CREATE INDEX event_aggregate_seq_idx ON event (aggregate_id, seq)`)
        yield* db.run(sql`CREATE INDEX event_aggregate_type_seq_idx ON event (aggregate_id, type, seq)`)
        yield* db.run(
          sql`CREATE TABLE session_message (id text PRIMARY KEY, session_id text NOT NULL, type text NOT NULL, seq integer NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(sql`CREATE INDEX session_message_session_seq_idx ON session_message (session_id, seq)`)
        yield* db.run(
          sql`CREATE TABLE session_input (seq integer PRIMARY KEY AUTOINCREMENT, id text NOT NULL UNIQUE, session_id text NOT NULL, prompt text NOT NULL, delivery text NOT NULL, promoted_seq integer, time_created integer NOT NULL)`,
        )
        yield* db.run(
          sql`CREATE INDEX session_input_session_pending_delivery_seq_idx ON session_input (session_id, promoted_seq, delivery, seq)`,
        )
        yield* db.run(sql`INSERT INTO session (id, workspace_id) VALUES ('session', 'wrk_old')`)
        yield* db.run(sql`INSERT INTO workspace (id) VALUES ('wrk_old')`)
        yield* db.run(sql`INSERT INTO message (id) VALUES ('message')`)
        yield* db.run(sql`INSERT INTO part (id) VALUES ('part')`)
        yield* db.run(sql`INSERT INTO event_sequence (aggregate_id, seq) VALUES ('session', 0)`)
        yield* db.run(
          sql`INSERT INTO event (id, aggregate_id, seq, type, data) VALUES ('evt_old', 'session', 0, 'old.1', '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES ('msg_old', 'session', 'user', 0, 1, 1, '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_input (id, session_id, prompt, delivery, time_created) VALUES ('msg_pending', 'session', '{}', 'steer', 1)`,
        )

        yield* applyHistorical(db, [eventSourcedSessionInputMigration])

        expect(yield* db.all(sql`SELECT id, workspace_id FROM session`)).toEqual([
          { id: "session", workspace_id: null },
        ])
        expect(yield* db.all(sql`SELECT id FROM workspace`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM message`)).toEqual([{ id: "message" }])
        expect(yield* db.all(sql`SELECT id FROM part`)).toEqual([{ id: "part" }])
        expect(yield* db.all(sql`SELECT id FROM event`)).toEqual([])
        expect(yield* db.all(sql`SELECT aggregate_id FROM event_sequence`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM session_message`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM session_input`)).toEqual([])
        expect(
          (yield* db.all<{ name: string }>(sql`PRAGMA table_info(session_input)`)).map((column) => column.name),
        ).toEqual(["id", "session_id", "prompt", "delivery", "admitted_seq", "promoted_seq", "time_created"])
        expect(
          (yield* db.all<{ name: string; unique: number }>(sql`PRAGMA index_list(session_message)`)).find(
            (index) => index.name === "session_message_session_seq_idx",
          ),
        ).toMatchObject({ unique: 1 })
        expect(
          (yield* db.all<{ name: string; unique: number }>(sql`PRAGMA index_list(event)`)).find(
            (index) => index.name === "event_aggregate_seq_idx",
          ),
        ).toMatchObject({ unique: 1 })
        expect(
          (yield* db.all<{ name: string; unique: number }>(sql`PRAGMA index_list(session_input)`)).filter((index) =>
            ["session_input_session_admitted_seq_idx", "session_input_session_promoted_seq_idx"].includes(index.name),
          ),
        ).toEqual([
          expect.objectContaining({ name: "session_input_session_promoted_seq_idx", unique: 1 }),
          expect.objectContaining({ name: "session_input_session_admitted_seq_idx", unique: 1 }),
        ])
      }),
    )
  })

  test("preserves canonical V1 state and restarts its event stream", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        yield* DatabaseMigration.apply(db)
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('global', '/project', 1, 1, '[]')`,
        )
        yield* db.run(
          sql`INSERT INTO workspace (id, type, project_id, time_used) VALUES ('workspace', 'local', 'global', 1)`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, project_id, workspace_id, slug, directory, title, version, time_created, time_updated) VALUES ('session', 'global', 'workspace', 'session', '/project', 'Before', 'test', 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('message', 'session', 1, 1, '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES ('part', 'message', 'session', 1, 1, '{}')`,
        )
        yield* db.run(sql`INSERT INTO event_sequence (aggregate_id, seq) VALUES ('session', 9)`)
        yield* db.run(
          sql`INSERT INTO event (id, aggregate_id, seq, type, data) VALUES ('event', 'session', 9, 'session.updated.1', '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_input (id, session_id, prompt, delivery, admitted_seq, time_created) VALUES ('input', 'session', '{}', 'steer', 9, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES ('projected', 'session', 'user', 9, 1, 1, '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_context_epoch (session_id, baseline, snapshot, baseline_seq) VALUES ('session', 'baseline', '{}', 9)`,
        )
        yield* applyHistorical(db, [simplifySessionInputMigration])

        const database = Layer.succeed(Database.Service, { db, filename: ":memory:" })
        yield* EventV2.Service.use((service) =>
          service.publish(SessionV1.Event.Updated, {
            sessionID: SessionSchema.ID.make("session"),
            info: {
              id: SessionSchema.ID.make("session"),
              slug: "session",
              projectID: ProjectV2.ID.global,
              directory: "/project",
              title: "After",
              version: "test",
              time: { created: 1, updated: 2 },
            },
          }),
        ).pipe(
          Effect.provide(
            AppNodeBuilder.build(LayerNode.group([EventV2.node, SessionProjector.node]), [[Database.node, database]]),
          ),
        )

        expect(
          yield* db.get(sql`
            SELECT
              (SELECT title FROM session WHERE id = 'session') AS title,
              (SELECT workspace_id FROM session WHERE id = 'session') AS workspaceID,
              (SELECT COUNT(*) FROM message WHERE id = 'message') AS messages,
              (SELECT COUNT(*) FROM part WHERE id = 'part') AS parts,
              (SELECT COUNT(*) FROM workspace) AS workspaces,
              (SELECT COUNT(*) FROM session_input) AS sessionInputs,
              (SELECT COUNT(*) FROM session_message) AS sessionMessages,
              (SELECT COUNT(*) FROM session_context_epoch) AS contextEpochs,
              (SELECT seq FROM event_sequence WHERE aggregate_id = 'session') AS seq,
              (SELECT type FROM event WHERE aggregate_id = 'session') AS eventType
          `),
        ).toEqual({
          title: "After",
          workspaceID: null,
          messages: 1,
          parts: 1,
          workspaces: 0,
          sessionInputs: 0,
          sessionMessages: 0,
          contextEpochs: 0,
          seq: 0,
          eventType: "session.updated.1",
        })
      }),
    )
  })

  test("resets incompatible projected Session messages before adding sequence order", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY)`)
        yield* db.run(
          sql`CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(
          sql`CREATE TABLE part (id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(sql`CREATE TABLE event (id text PRIMARY KEY, seq integer NOT NULL)`)
        yield* db.run(
          sql`CREATE TABLE session_message (id text PRIMARY KEY, session_id text NOT NULL, type text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(
          sql`CREATE INDEX session_message_session_time_created_id_idx ON session_message (session_id, time_created, id)`,
        )
        yield* db.run(
          sql`CREATE INDEX session_message_session_type_time_created_id_idx ON session_message (session_id, type, time_created, id)`,
        )
        yield* db.run(sql`INSERT INTO session (id) VALUES ('session')`)
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('legacy_message', 'session', 1, 1, '{"role":"user"}')`,
        )
        yield* db.run(
          sql`INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES ('legacy_part', 'legacy_message', 'session', 1, 1, '{"type":"text","text":"hello"}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_message (id, session_id, type, time_created, time_updated, data) VALUES ('stale_projection', 'session', 'user', 1, 1, '{}')`,
        )

        yield* applyHistorical(db, [sessionMessageProjectionOrderMigration])

        expect(yield* db.all(sql`SELECT id, session_id, data FROM message`)).toEqual([
          { id: "legacy_message", session_id: "session", data: '{"role":"user"}' },
        ])
        expect(yield* db.all(sql`SELECT id, message_id, session_id, data FROM part`)).toEqual([
          {
            id: "legacy_part",
            message_id: "legacy_message",
            session_id: "session",
            data: '{"type":"text","text":"hello"}',
          },
        ])
        expect(yield* db.all(sql`SELECT id FROM session_message`)).toEqual([])

        yield* db.run(
          sql`INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES ('fresh_projection', 'session', 'user', 7, 2, 2, '{}')`,
        )
        expect(yield* db.get(sql`SELECT id, seq FROM session_message`)).toEqual({ id: "fresh_projection", seq: 7 })
      }),
    )
  })

  test("runs session usage backfill in order with schema changes", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY, time_updated integer NOT NULL)`)
        yield* db.run(sql`CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, data text NOT NULL)`)
        yield* db.run(sql`INSERT INTO session (id, time_updated) VALUES ('session_1', 1)`)
        yield* db.run(
          sql`INSERT INTO message (id, session_id, data) VALUES ('message_1', 'session_1', '{"role":"assistant","cost":1.25,"tokens":{"input":2,"output":3,"reasoning":4,"cache":{"read":5,"write":6}}}')`,
        )

        yield* applyHistorical(db, [sessionUsageMigration])

        expect(
          yield* db.get(
            sql`SELECT cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write FROM session WHERE id = 'session_1'`,
          ),
        ).toEqual({
          cost: 1.25,
          tokens_input: 2,
          tokens_output: 3,
          tokens_reasoning: 4,
          tokens_cache_read: 5,
          tokens_cache_write: 6,
        })
      }),
    )
  })

  test("normalizes Windows storage paths and leaves POSIX paths untouched", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE project (id text PRIMARY KEY, worktree text NOT NULL, sandboxes text NOT NULL)`)
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY, directory text NOT NULL, path text)`)
        // Windows-shaped rows (drive + backslash) must be normalized.
        yield* db.run(
          sql`INSERT INTO project (id, worktree, sandboxes) VALUES (${"win"}, ${"C:\\Repo\\Thing"}, ${JSON.stringify([
            "C:\\Repo\\Thing\\sandbox",
          ])})`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, directory, path) VALUES (${"win"}, ${"C:\\Repo\\Thing\\packages\\api"}, ${"packages\\api"})`,
        )
        // UNC worktrees and their sandboxes must normalize too (not just drive paths).
        yield* db.run(
          sql`INSERT INTO project (id, worktree, sandboxes) VALUES (${"unc"}, ${"\\\\server\\share"}, ${JSON.stringify([
            "\\\\server\\share\\sandbox",
          ])})`,
        )
        // The "/" worktree sentinel and POSIX paths (including a pathological
        // backslash in a POSIX filename) must survive byte-for-byte.
        yield* db.run(sql`INSERT INTO project (id, worktree, sandboxes) VALUES (${"global"}, ${"/"}, ${"[]"})`)
        yield* db.run(
          sql`INSERT INTO session (id, directory, path) VALUES (${"posix"}, ${"/home/me/we\\ird"}, ${"src\\weird"})`,
        )

        yield* applyHistorical(db, [normalizeStoragePathsMigration])

        expect(yield* db.get(sql`SELECT worktree, sandboxes FROM project WHERE id = 'win'`)).toEqual({
          worktree: "C:/Repo/Thing",
          sandboxes: JSON.stringify(["C:/Repo/Thing/sandbox"]),
        })
        expect(yield* db.get(sql`SELECT directory, path FROM session WHERE id = 'win'`)).toEqual({
          directory: "C:/Repo/Thing/packages/api",
          path: "packages/api",
        })
        expect(yield* db.get(sql`SELECT worktree, sandboxes FROM project WHERE id = 'unc'`)).toEqual({
          worktree: "//server/share",
          sandboxes: JSON.stringify(["//server/share/sandbox"]),
        })
        expect(yield* db.get(sql`SELECT worktree FROM project WHERE id = 'global'`)).toEqual({ worktree: "/" })
        expect(yield* db.get(sql`SELECT directory, path FROM session WHERE id = 'posix'`)).toEqual({
          directory: "/home/me/we\\ird",
          path: "src\\weird",
        })
      }),
    )
  })

  test("maps native Windows paths through database columns", async () => {
    if (process.platform !== "win32") return
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const projectID = ProjectV2.ID.make("codec_project")
        const worktree = AbsolutePath.make("C:\\Repo\\Thing")
        const sandbox = AbsolutePath.make("C:\\Repo\\Thing\\sandbox")
        const directory = "C:\\Repo\\Thing\\packages\\api"
        const sessionID = SessionSchema.ID.make("ses_codec")

        expect(() =>
          Effect.runSync(
            db
              .insert(ProjectTable)
              .values({
                id: ProjectV2.ID.make("invalid_path"),
                worktree: AbsolutePath.make("not-absolute"),
                sandboxes: [],
                time_created: 1,
                time_updated: 1,
              })
              .run(),
          ),
        ).toThrow()

        yield* db
          .insert(ProjectTable)
          .values({
            id: projectID,
            worktree,
            sandboxes: [sandbox],
            time_created: 1,
            time_updated: 1,
          })
          .run()
        yield* db
          .insert(SessionTable)
          .values({
            id: sessionID,
            project_id: projectID,
            slug: "codec",
            directory,
            path: "packages\\api",
            title: "Codec",
            version: "test",
            time_created: 1,
            time_updated: 1,
          })
          .run()

        expect(
          yield* db.get<{ worktree: string; sandboxes: string }>(
            sql`SELECT worktree, sandboxes FROM project WHERE id = ${projectID}`,
          ),
        ).toEqual({
          worktree: "C:/Repo/Thing",
          sandboxes: JSON.stringify(["C:/Repo/Thing/sandbox"]),
        })
        expect(
          yield* db.get<{ directory: string; path: string }>(
            sql`SELECT directory, path FROM session WHERE id = ${sessionID}`,
          ),
        ).toEqual({
          directory: "C:/Repo/Thing/packages/api",
          path: "packages/api",
        })

        const project = yield* db.select().from(ProjectTable).where(eq(ProjectTable.worktree, worktree)).get()
        const session = yield* db.select().from(SessionTable).where(eq(SessionTable.directory, directory)).get()
        expect(project?.worktree).toBe(worktree)
        expect(project?.sandboxes).toEqual([sandbox])
        expect(session?.directory).toBe(directory)
        expect(session?.path).toBe("packages/api")

        expect((yield* db.select().from(SessionTable).where(eq(SessionTable.path, "packages\\api")).get())?.id).toBe(
          sessionID,
        )

        const moved = AbsolutePath.make("D:\\Moved\\Thing")
        const updated = yield* db
          .update(ProjectTable)
          .set({ worktree: moved, sandboxes: [moved] })
          .where(eq(ProjectTable.id, projectID))
          .returning()
          .get()
        expect(updated?.worktree).toBe(moved)
        expect(updated?.sandboxes).toEqual([moved])
        expect(
          yield* db.get<{ worktree: string; sandboxes: string }>(
            sql`SELECT worktree, sandboxes FROM project WHERE id = ${projectID}`,
          ),
        ).toEqual({ worktree: "D:/Moved/Thing", sandboxes: JSON.stringify(["D:/Moved/Thing"]) })
        expect(
          (yield* db
            .select()
            .from(ProjectTable)
            .where(inArray(ProjectTable.worktree, [moved]))
            .get())?.id,
        ).toBe(projectID)

        yield* db.run(sql`UPDATE project SET worktree = ${"not-absolute"} WHERE id = ${projectID}`)
        expect(() =>
          Effect.runSync(db.select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get()),
        ).toThrow()
      }),
    )
  })

  test("rejects an OpenCode-shaped database without importing its journal", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY)`)
        yield* db.run(
          sql`CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric, name text, applied_at TEXT)`,
        )
        yield* db.run(sql`
          INSERT INTO __drizzle_migrations (hash, created_at, name, applied_at)
          VALUES ('hash', 1, '20260127222353_familiar_lady_ursula', ${new Date().toISOString()})
        `)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "legacy.db" }))

        expect(error).toMatchObject({ reason: "foreign", path: "legacy.db" })
        expect(yield* db.all(sql`SELECT id FROM session`)).toEqual([])
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE name = 'repa_migration'`)).toBeUndefined()
        expect(yield* db.get(sql`SELECT name FROM __drizzle_migrations`)).toEqual({
          name: "20260127222353_familiar_lady_ursula",
        })
      }),
    )
  })

  test("rejects a future Repa database", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(sql.raw(`PRAGMA user_version = ${DatabaseMigration.version + 1}`))

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "future.db" }))

        expect(error).toMatchObject({ reason: "future" })
        expect(yield* db.all(sql`SELECT version, id FROM repa_migration ORDER BY version`)).toEqual([
          { version: BASELINE_VERSION, id: BASELINE_ID },
          { version: BASELINE_VERSION + 1, id: courseViewAuthorityMigration.id },
          { version: BASELINE_VERSION + 2, id: learningCommandSettlementMigration.id },
          { version: BASELINE_VERSION + 3, id: sourceArtifactAuthorityMigration.id },
          { version: BASELINE_VERSION + 4, id: contentRootAuthorityMigration.id },
          { version: BASELINE_VERSION + 5, id: readableRepresentationLineageMigration.id },
          { version: BASELINE_VERSION + 6, id: durableTurnMigration.id },
          { version: BASELINE_VERSION + 7, id: materialMapAlignmentMigration.id },
        ])
      }),
    )
  })

  test("rejects an inconsistent Repa migration lineage", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db, { migrations: [] })
        yield* db.run(sql`UPDATE repa_migration SET id = 'not-the-repa-baseline' WHERE version = 1`)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "partial.db" }))

        expect(error).toMatchObject({ reason: "partial" })
        expect(yield* db.get(sql`SELECT id FROM repa_migration WHERE version = 1`)).toEqual({
          id: "not-the-repa-baseline",
        })
      }),
    )
  })

  test("rolls a failed Repa migration back with its version and journal", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db, { migrations: [] })
        const failing = {
          id: "repa_test_failure",
          up(tx) {
            return Effect.gen(function* () {
              yield* tx.run(sql`CREATE TABLE should_rollback (id text PRIMARY KEY)`)
              return yield* Effect.fail(new Error("injected migration failure"))
            })
          },
        } satisfies DatabaseMigration.Migration

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "migration.db", migrations: [failing] }))

        expect(error).toMatchObject({ _tag: "DatabaseMigrationError" })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION,
        })
        expect(yield* db.all(sql`SELECT version, id FROM repa_migration ORDER BY version`)).toEqual([
          { version: BASELINE_VERSION, id: BASELINE_ID },
        ])
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE name = 'should_rollback'`)).toBeUndefined()
      }),
    )
  })

  test("restores foreign-key enforcement after a failed graph-rebuild migration", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db, { migrations: [] })
        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        const failing = {
          id: "repa_test_graph_rebuild_failure",
          foreignKeyMode: "rebuild_graph",
          up(tx) {
            return Effect.gen(function* () {
              yield* tx.run(sql`CREATE TABLE graph_rebuild_should_rollback (id text PRIMARY KEY)`)
              return yield* Effect.fail(new Error("injected graph-rebuild failure"))
            })
          },
        } satisfies DatabaseMigration.Migration

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "graph.db", migrations: [failing] }))

        expect(error).toMatchObject({ _tag: "DatabaseMigrationError" })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA foreign_keys"))).toEqual({ foreign_keys: 1 })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION,
        })
        expect(yield* db.all(sql`SELECT version, id FROM repa_migration ORDER BY version`)).toEqual([
          { version: BASELINE_VERSION, id: BASELINE_ID },
        ])
        expect(
          yield* db.get(sql`SELECT name FROM sqlite_master WHERE name = 'graph_rebuild_should_rollback'`),
        ).toBeUndefined()
      }),
    )
  })

  test("rejects existing foreign-key violations", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(sql`PRAGMA foreign_keys = OFF`)
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('orphan', 'missing', 1, 1, '{}')`,
        )
        yield* db.run(sql`PRAGMA foreign_keys = ON`)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "orphan.db" }))

        expect(error).toMatchObject({ reason: "corrupt" })
        expect(yield* db.get(sql`SELECT id FROM message`)).toEqual({ id: "orphan" })
      }),
    )
  })

  test("reopens a current Repa baseline without changing durable rows", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('kept', '/', 1, 1, '[]')`,
        )

        yield* DatabaseMigration.apply(db, { path: "current.db" })

        expect(yield* db.get(sql`SELECT id FROM project WHERE id = 'kept'`)).toEqual({ id: "kept" })
      }),
    )
  })
})
