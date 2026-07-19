import { describe, expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { APPLICATION_ID, BASELINE_VERSION } from "@opencode-ai/core/database/admission"
import { DatabaseMigration } from "@opencode-ai/core/database/migration"

const makeDb = EffectDrizzleSqlite.makeWithDefaults()
type TestDatabase = Effect.Success<typeof makeDb>

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

const run = <A, E>(effect: Effect.Effect<A, E, import("effect/unstable/sql/SqlClient").SqlClient>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Effect.scoped),
  )

describe("Material Map migration", () => {
  test("builds the same Gate 13 schema through fresh and Gate-12 upgrade paths", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        yield* DatabaseMigration.apply(db)
        const fresh = yield* materialSchema(db)
        expect(fresh.filter((entry) => entry.type === "table").map((entry) => entry.name)).toEqual(
          [...materialTables].sort(),
        )
        expect(fresh.some((entry) => entry.name === "material_map_validate_insert")).toBeTrue()
        expect(fresh.some((entry) => entry.name === "material_map_disposition_apply")).toBeTrue()
        expect(fresh.some((entry) => entry.name === "material_course_alignment_disposition_apply")).toBeTrue()
        const freshPathKeyTables = yield* pathKeyTableDefinitions(db)
        expect(freshPathKeyTables.map((entry) => entry.name)).toEqual([
          "material_map_artifact_target",
          "representation_revision",
        ])
        expect(freshPathKeyTables.every((entry) => !entry.definition.toLowerCase().includes("lower("))).toBeTrue()

        yield* Effect.forEach(materialTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 7}`)
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 6}`))
        yield* DatabaseMigration.apply(db)

        expect(yield* materialSchema(db)).toEqual(fresh)
        expect(yield* pathKeyTableDefinitions(db)).toEqual(freshPathKeyTables)
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA foreign_keys"))).toEqual({ foreign_keys: 1 })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION + 7,
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA application_id"))).toEqual({
          application_id: APPLICATION_ID,
        })
        expect(yield* db.all(sql`SELECT id FROM material_map`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM material_course_alignment`)).toEqual([])
      }),
    )
  })
})

function materialSchema(db: TestDatabase) {
  return db
    .all<{
      readonly type: string
      readonly name: string
      readonly tableName: string
      readonly definition: string | null
    }>(
      sql`
        SELECT type, name, tbl_name AS tableName, sql AS definition
        FROM sqlite_master
        WHERE tbl_name LIKE 'material_%' AND name NOT LIKE 'sqlite_autoindex_%'
        ORDER BY type, name
      `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: row.definition?.replace(/\s+/g, " ").trim() ?? null,
        })),
      ),
    )
}

function pathKeyTableDefinitions(db: TestDatabase) {
  return db
    .all<{ readonly name: string; readonly definition: string }>(
      sql`
      SELECT name, sql AS definition
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('material_map_artifact_target', 'representation_revision')
      ORDER BY name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: row.definition
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^CREATE TABLE [`"]([^`"]+)[`"] /, "CREATE TABLE $1 "),
        })),
      ),
    )
}
