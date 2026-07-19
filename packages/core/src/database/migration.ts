export * as DatabaseMigration from "./migration"

import { sql } from "drizzle-orm"
import { Effect, Semaphore } from "effect"
import type { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { migrations } from "./migration.gen"
import { DatabaseSchemaExtras } from "./schema-extras"
import schema from "./schema.gen"
import {
  APPLICATION_ID,
  BASELINE_ID,
  BASELINE_VERSION,
  DatabaseAdmissionError,
  DatabaseMigrationError,
} from "./admission"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
const lock = Semaphore.makeUnsafe(1)

export type Migration = {
  id: string
  foreignKeyMode?: "rebuild_graph"
  up: (tx: Transaction) => Effect.Effect<void, unknown>
}

type JournalRow = {
  version: number
  id: string
}

export interface ApplyOptions {
  readonly path?: string
  readonly migrations?: readonly Migration[]
}

function pragma(name: "application_id" | "user_version", value: number) {
  return sql.raw(`PRAGMA ${name} = ${value}`)
}

function currentVersion(input: readonly Migration[]) {
  return BASELINE_VERSION + input.length
}

export const version = currentVersion(migrations)

function expectedJournal(input: readonly Migration[]): JournalRow[] {
  return [
    { version: BASELINE_VERSION, id: BASELINE_ID },
    ...input.map((migration, index) => ({ version: BASELINE_VERSION + index + 1, id: migration.id })),
  ]
}

function admissionError(input: {
  path: string
  reason: DatabaseAdmissionError["reason"]
  detail: string
  currentVersion: number
  observedVersion?: number
  cause?: unknown
}) {
  return new DatabaseAdmissionError(input)
}

function checks(db: Database | Transaction, path: string, version: number) {
  return Effect.gen(function* () {
    const integrity = yield* db.all<Record<string, unknown>>(sql.raw("PRAGMA integrity_check"))
    const failed = integrity.find((row) => Object.values(row)[0] !== "ok")
    if (failed) {
      return yield* admissionError({
        path,
        reason: "corrupt",
        detail: `SQLite integrity check failed for ${path}: ${String(Object.values(failed)[0])}`,
        currentVersion: version,
        observedVersion: version,
      })
    }

    const foreignKeys = yield* db.all<Record<string, unknown>>(sql.raw("PRAGMA foreign_key_check"))
    if (foreignKeys.length > 0) {
      return yield* admissionError({
        path,
        reason: "corrupt",
        detail: `SQLite foreign-key check failed for ${path}`,
        currentVersion: version,
        observedVersion: version,
      })
    }
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof DatabaseAdmissionError
        ? cause
        : admissionError({
            path,
            reason: "corrupt",
            detail: `SQLite integrity checks could not read the database at ${path}`,
            currentVersion: version,
            observedVersion: version,
            cause,
          }),
    ),
  )
}

function initialize(db: Database, path: string, input: readonly Migration[]) {
  const expected = expectedJournal(input)
  const version = currentVersion(input)
  return Effect.gen(function* () {
    yield* db.run("PRAGMA journal_mode = DELETE")
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* schema.up(tx)
        yield* DatabaseSchemaExtras.install(tx)
        yield* tx.run(sql`
          CREATE TABLE ${sql.identifier("repa_migration")} (
            version INTEGER PRIMARY KEY,
            id TEXT NOT NULL UNIQUE,
            time_completed INTEGER NOT NULL
          )
        `)
        const completed = Date.now()
        yield* Effect.forEach(
          expected,
          (entry) =>
            tx.run(sql`
              INSERT INTO ${sql.identifier("repa_migration")} (version, id, time_completed)
              VALUES (${entry.version}, ${entry.id}, ${completed})
            `),
          { discard: true },
        )
        yield* tx.run(pragma("application_id", APPLICATION_ID))
        yield* tx.run(pragma("user_version", version))
        yield* checks(tx, path, version)
      }),
    )
  }).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseAdmissionError({
          path,
          reason: "initialization",
          detail: `Failed to initialize the Repa database at ${path}`,
          currentVersion: version,
          cause,
        }),
    ),
  )
}

function observeNumber(db: Database, name: "application_id" | "user_version" | "page_count") {
  return db
    .get<Record<string, unknown>>(sql.raw(`PRAGMA ${name}`))
    .pipe(Effect.map((row) => Number(row ? Object.values(row)[0] : Number.NaN)))
}

function applyRecognized(db: Database, path: string, observedVersion: number, input: readonly Migration[]) {
  return Effect.gen(function* () {
    let version = observedVersion
    for (const migration of input.slice(observedVersion - BASELINE_VERSION)) {
      const fromVersion = version
      const toVersion = fromVersion + 1
      const apply = db.transaction((tx) =>
        Effect.gen(function* () {
          yield* migration.up(tx)
          yield* tx.run(sql`
            INSERT INTO ${sql.identifier("repa_migration")} (version, id, time_completed)
            VALUES (${toVersion}, ${migration.id}, ${Date.now()})
          `)
          yield* tx.run(pragma("user_version", toVersion))
          yield* checks(tx, path, toVersion)
        }),
      )
      yield* (
        migration.foreignKeyMode === "rebuild_graph"
          ? Effect.gen(function* () {
              yield* setForeignKeys(db, false)
              return yield* apply
            }).pipe(Effect.ensuring(setForeignKeys(db, true).pipe(Effect.orDie)))
          : apply
      ).pipe(
        Effect.mapError(
          (cause) =>
            new DatabaseMigrationError({
              path,
              migrationID: migration.id,
              fromVersion,
              toVersion,
              cause,
            }),
        ),
      )
      version = toVersion
    }
  })
}

function setForeignKeys(db: Database, enabled: boolean) {
  return Effect.gen(function* () {
    yield* db.run(`PRAGMA foreign_keys = ${enabled ? "ON" : "OFF"}`)
    const observed = yield* db.get<Record<string, unknown>>(sql.raw("PRAGMA foreign_keys"))
    if (Number(observed ? Object.values(observed)[0] : Number.NaN) !== Number(enabled)) {
      return yield* Effect.fail(
        new Error(`SQLite foreign-key enforcement could not be ${enabled ? "enabled" : "disabled"}`),
      )
    }
  })
}

function admitExisting(db: Database, path: string, input: readonly Migration[]) {
  const expected = expectedJournal(input)
  const version = currentVersion(input)
  return Effect.gen(function* () {
    const applicationID = yield* observeNumber(db, "application_id")
    const observedVersion = yield* observeNumber(db, "user_version")

    if (applicationID !== APPLICATION_ID) {
      return yield* admissionError({
        path,
        reason: "foreign",
        detail: `The database at ${path} is not a recognized Repa database`,
        currentVersion: version,
        observedVersion,
      })
    }
    if (!Number.isInteger(observedVersion) || observedVersion < BASELINE_VERSION) {
      return yield* admissionError({
        path,
        reason: "unsupported-old",
        detail: `The Repa database at ${path} predates the supported baseline`,
        currentVersion: version,
        observedVersion,
      })
    }
    if (observedVersion > version) {
      return yield* admissionError({
        path,
        reason: "future",
        detail: `The Repa database at ${path} uses schema version ${observedVersion}, but this build supports ${version}`,
        currentVersion: version,
        observedVersion,
      })
    }

    const tables = yield* db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    if (!tables.some((table) => table.name === "repa_migration")) {
      return yield* admissionError({
        path,
        reason: "partial",
        detail: `The Repa database at ${path} has no Repa migration journal`,
        currentVersion: version,
        observedVersion,
      })
    }

    const completed = yield* db.all<JournalRow>(sql`
      SELECT version, id
      FROM ${sql.identifier("repa_migration")}
      ORDER BY version
    `)
    const prefix = expected.slice(0, observedVersion)
    const coherent =
      completed.length === prefix.length &&
      completed.every((entry, index) => entry.version === prefix[index]?.version && entry.id === prefix[index]?.id)
    if (!coherent) {
      return yield* admissionError({
        path,
        reason: "partial",
        detail: `The Repa database at ${path} has an inconsistent migration lineage`,
        currentVersion: version,
        observedVersion,
      })
    }

    yield* checks(db, path, observedVersion)
    yield* applyRecognized(db, path, observedVersion, input)
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof DatabaseAdmissionError || cause instanceof DatabaseMigrationError
        ? cause
        : admissionError({
            path,
            reason: "partial",
            detail: `Could not verify the Repa database structure at ${path}`,
            currentVersion: version,
            cause,
          }),
    ),
  )
}

export function apply(db: Database, options: ApplyOptions = {}) {
  const path = options.path ?? ":memory:"
  const input = options.migrations ?? migrations
  return lock.withPermit(
    Effect.gen(function* () {
      const applicationID = yield* observeNumber(db, "application_id")
      if (applicationID === 0) {
        const userVersion = yield* observeNumber(db, "user_version")
        const pageCount = yield* observeNumber(db, "page_count")
        if (userVersion === 0 && pageCount === 0) return yield* initialize(db, path, input)
      }
      yield* admitExisting(db, path, input)
    }),
  )
}
