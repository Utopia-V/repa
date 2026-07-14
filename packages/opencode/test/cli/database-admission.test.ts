import { expect } from "bun:test"
import path from "node:path"
import { Database } from "bun:sqlite"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"

cliIt.live(
  "leaves an unrecognized database in place while keeping db path reachable",
  ({ home, opencode: repa }) =>
    Effect.gen(function* () {
      const filename = path.join(home, "foreign.db")
      const native = new Database(filename)
      native.run("CREATE TABLE foreign_state (id TEXT PRIMARY KEY)")
      native.run("INSERT INTO foreign_state (id) VALUES ('kept')")
      native.close()
      const before = new Uint8Array(yield* Effect.promise(() => Bun.file(filename).arrayBuffer()))

      const rejected = yield* repa.spawn(["db", "SELECT 1"], { env: { REPA_DB: filename } })

      expect(rejected.exitCode).toBe(1)
      expect(rejected.stderr).toContain("not a recognized Repa database")
      expect(rejected.stderr).toContain("left the database in place")
      expect(new Uint8Array(yield* Effect.promise(() => Bun.file(filename).arrayBuffer()))).toEqual(before)

      const visible = yield* repa.spawn(["db", "path"], { env: { REPA_DB: filename } })
      expect(visible.exitCode).toBe(0)
      expect(visible.stdout.trim()).toBe(filename)
    }),
  60_000,
)
