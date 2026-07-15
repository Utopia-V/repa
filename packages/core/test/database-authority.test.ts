import { describe, expect, test } from "bun:test"
import { Database as NativeDatabase } from "bun:sqlite"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Layer, ManagedRuntime } from "effect"
import { sql } from "drizzle-orm"
import { Database } from "@opencode-ai/core/database/database"
import { DatabaseBusyError, DatabaseStorageError } from "@opencode-ai/core/database/authority"
import { APPLICATION_ID } from "@opencode-ai/core/database/admission"
import { tmpdir } from "./fixture/tmpdir"

const crashFixture = path.join(import.meta.dir, "fixture/database-crash.ts")

function digest(input: Uint8Array) {
  return createHash("sha256").update(input).digest("hex")
}

async function crash(mode: "baseline-spill" | "repa-wal" | "foreign-wal", filename: string) {
  const child = Bun.spawn([process.execPath, crashFixture, mode, filename], {
    cwd: path.join(import.meta.dir, ".."),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  const reader = child.stdout.getReader()
  const output = await reader.read()
  reader.releaseLock()
  expect(new TextDecoder().decode(output.value)).toContain("ready")
  child.kill()
  const exit = await child.exited
  if (exit === 0) throw new Error(`Crash fixture exited normally: ${await new Response(child.stderr).text()}`)
}

async function withRuntime(filename: string, use: (database: Database.Interface) => Promise<void>) {
  const runtime = ManagedRuntime.make(Database.runtimeLayerFromPath(filename))
  try {
    await use(await runtime.runPromise(Database.Service))
  } finally {
    await runtime.dispose()
  }
}

describe("Database runtime authority", () => {
  test("rejects :memory: for ordinary runtime while explicit test injection remains available", async () => {
    const rejected = await Effect.runPromise(
      Effect.flip(Effect.scoped(Layer.build(Database.runtimeLayerFromPath(":memory:")))),
    )
    expect(rejected).toBeInstanceOf(DatabaseStorageError)
    expect(rejected).toMatchObject({ reason: "memory" })

    await Effect.runPromise(
      Database.Service.use(({ db }) =>
        db
          .get<{ value: number }>(sql`SELECT 1 AS value`)
          .pipe(Effect.tap((row) => Effect.sync(() => expect(row).toEqual({ value: 1 })))),
      ).pipe(Effect.provide(Database.layerFromPath(":memory:")), Effect.scoped),
    )
  })

  test("rejects a clean foreign database without changing its bytes or creating sidecars", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "foreign.db")
    const native = new NativeDatabase(filename)
    native.run("CREATE TABLE foreign_state (value TEXT NOT NULL)")
    native.run("INSERT INTO foreign_state VALUES ('kept')")
    native.close()
    const before = digest(await fs.readFile(filename))

    const rejected = await Effect.runPromise(
      Effect.flip(Effect.scoped(Layer.build(Database.runtimeLayerFromPath(filename)))),
    )

    expect(rejected).toMatchObject({ _tag: "DatabaseAdmissionError", reason: "foreign" })
    expect(digest(await fs.readFile(filename))).toBe(before)
    for (const suffix of ["-journal", "-wal", "-shm"]) expect(existsSync(filename + suffix)).toBe(false)
  })

  test("does not let arbitrary sidecars authorize initialization of a clean identityless database", async () => {
    await using tmp = await tmpdir()

    for (const [sidecarIndex, suffix] of ["-journal", "-wal", "-shm"].entries()) {
      for (const [stateIndex, payload] of [new Uint8Array(), Buffer.from("stale sidecar")].entries()) {
        for (const userVersion of [0, 7]) {
          const filename = path.join(tmp.path, `foreign-${sidecarIndex}-${stateIndex}-${userVersion}.db`)
          const native = new NativeDatabase(filename)
          native.run("VACUUM")
          native.run(`PRAGMA user_version = ${userVersion}`)
          native.close()
          expect((await fs.stat(filename)).size).toBeGreaterThan(0)
          await fs.writeFile(filename + suffix, payload)

          const rejected = await Effect.runPromise(
            Effect.flip(Effect.scoped(Layer.build(Database.runtimeLayerFromPath(filename)))),
          )

          if (payload.byteLength === 0) {
            expect(rejected).toMatchObject({ _tag: "DatabaseAdmissionError", reason: "foreign" })
          }
          await fs.rm(filename + suffix, { force: true })
          const reopened = new NativeDatabase(filename)
          try {
            expect(reopened.query("PRAGMA application_id").get()).toEqual({ application_id: 0 })
            expect(reopened.query("PRAGMA user_version").get()).toEqual({ user_version: userVersion })
            expect(reopened.query("SELECT name FROM sqlite_master WHERE name = 'repa_migration'").get()).toBeNull()
          } finally {
            reopened.close()
          }
        }
      }
    }
  })

  test("rejects a dangling final file symlink before SQLite can split main and sidecar paths", async () => {
    await using tmp = await tmpdir()
    const target = path.join(tmp.path, "target.db")
    const alias = path.join(tmp.path, "alias.db")
    await fs.symlink(target, alias, "file")

    const rejected = await Effect.runPromise(
      Effect.flip(Effect.scoped(Layer.build(Database.runtimeLayerFromPath(alias)))),
    )

    expect(rejected).toBeInstanceOf(DatabaseStorageError)
    expect(existsSync(target)).toBe(false)
    for (const filename of [alias, target]) {
      for (const suffix of ["-journal", "-wal", "-shm"]) expect(existsSync(filename + suffix)).toBe(false)
    }
  })

  test("holds ownership on the retained database connection and releases it on runtime disposal", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "owned.db")
    const first = ManagedRuntime.make(Database.runtimeLayerFromPath(filename))
    const second = ManagedRuntime.make(Database.runtimeLayerFromPath(filename))
    try {
      const database = await first.runPromise(Database.Service)
      expect((await fs.readFile(filename)).readUInt32BE(68)).toBe(APPLICATION_ID)
      expect(await Effect.runPromise(database.db.get<{ journal_mode: string }>(sql`PRAGMA journal_mode`))).toEqual({
        journal_mode: "wal",
      })
      const rejected = await second.runPromise(Database.Service).catch((error) => error)
      expect(rejected).toBeInstanceOf(DatabaseBusyError)
    } finally {
      await first.dispose()
      await second.dispose().catch(() => {})
    }

    const next = ManagedRuntime.make(Database.runtimeLayerFromPath(filename))
    try {
      await next.runPromise(Database.Service)
    } finally {
      await next.dispose()
    }
  })

  test("recovers a cache-spilled baseline transaction to empty and initializes exactly once", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "baseline-crash.db")
    await crash("baseline-spill", filename)

    const before = await fs.readFile(filename)
    expect(before.byteLength).toBeGreaterThan(0)
    expect(before.readUInt32BE(68)).toBe(0)
    expect(existsSync(filename + "-journal")).toBe(true)

    await withRuntime(filename, async ({ db }) => {
      expect(await Effect.runPromise(db.get<{ application_id: number }>(sql`PRAGMA application_id`))).toEqual({
        application_id: APPLICATION_ID,
      })
      expect(
        await Effect.runPromise(db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM repa_migration`)),
      ).toEqual({ count: 2 })
      expect(await Effect.runPromise(db.get(sql`SELECT name FROM sqlite_master WHERE name = 'spill'`))).toBeUndefined()
    })

    await withRuntime(filename, async ({ db }) => {
      expect(
        await Effect.runPromise(db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM repa_migration`)),
      ).toEqual({ count: 2 })
    })
  })

  test("recovers committed Repa WAL state before admission on the retained connection", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "repa-wal-crash.db")
    await crash("repa-wal", filename)
    expect(existsSync(filename + "-wal")).toBe(true)
    expect((await fs.readFile(filename)).readUInt32BE(68)).toBe(APPLICATION_ID)

    await withRuntime(filename, async ({ db }) => {
      expect(
        await Effect.runPromise(db.get<{ id: string }>(sql`SELECT id FROM project WHERE id = 'wal_kept'`)),
      ).toEqual({ id: "wal_kept" })
    })
  })

  test("permits pager recovery of an ambiguous foreign WAL without Repa-authored writes", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "foreign-wal-crash.db")
    await crash("foreign-wal", filename)
    expect(existsSync(filename + "-wal")).toBe(true)

    const rejected = await Effect.runPromise(
      Effect.flip(Effect.scoped(Layer.build(Database.runtimeLayerFromPath(filename)))),
    )
    expect(rejected).toMatchObject({ _tag: "DatabaseAdmissionError", reason: "foreign" })

    const native = new NativeDatabase(filename)
    try {
      expect(native.query("PRAGMA application_id").get()).toEqual({ application_id: 42 })
      expect(native.query("SELECT value FROM foreign_state").get()).toEqual({ value: "kept" })
      expect(native.query("SELECT name FROM sqlite_master WHERE name = 'repa_migration'").get()).toBeNull()
    } finally {
      native.close()
    }
  })
})
