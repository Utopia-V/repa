import { Database as NativeDatabase } from "bun:sqlite"
import { Database } from "@opencode-ai/core/database/database"
import { ManagedRuntime } from "effect"

const [mode, filename] = process.argv.slice(2)
if (!mode || !filename) throw new Error("usage: database-crash <baseline-spill|repa-wal|foreign-wal> <path>")
let retained: NativeDatabase | undefined

if (mode === "baseline-spill") {
  const native = (retained = new NativeDatabase(filename))
  native.run("PRAGMA journal_mode = DELETE")
  native.run("PRAGMA synchronous = FULL")
  native.run("PRAGMA cache_size = 4")
  native.run("PRAGMA cache_spill = ON")
  native.run("BEGIN EXCLUSIVE")
  native.run("CREATE TABLE spill (id INTEGER PRIMARY KEY, value BLOB NOT NULL)")
  const insert = native.prepare("INSERT INTO spill (value) VALUES (?)")
  const value = new Uint8Array(64 * 1024)
  for (let index = 0; index < 192; index++) insert.run(value)
  insert.finalize()
  ready()
}

if (mode === "repa-wal") {
  const runtime = ManagedRuntime.make(Database.layerFromPath(filename))
  await runtime.runPromise(Database.Service)
  await runtime.dispose()

  const native = (retained = new NativeDatabase(filename))
  native.run("PRAGMA journal_mode = WAL")
  native.run("PRAGMA wal_autocheckpoint = 0")
  native.run(
    "INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('wal_kept', '/', 1, 1, '[]')",
  )
  ready()
}

if (mode === "foreign-wal") {
  const native = (retained = new NativeDatabase(filename))
  native.run("PRAGMA journal_mode = WAL")
  native.run("PRAGMA wal_autocheckpoint = 0")
  native.run("PRAGMA application_id = 42")
  native.run("CREATE TABLE foreign_state (value TEXT NOT NULL)")
  native.run("INSERT INTO foreign_state VALUES ('kept')")
  ready()
}

function ready() {
  void retained
  process.stdout.write("ready\n")
  process.stdin.resume()
}
