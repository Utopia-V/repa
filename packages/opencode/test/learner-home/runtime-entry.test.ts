import { expect } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"

cliIt.live(
  "keeps db path diagnostic available but rejects :memory: runtime materialization",
  ({ opencode }) =>
    Effect.gen(function* () {
      const diagnostic = yield* opencode.spawn(["db", "path"], { env: { REPA_DB: ":memory:" } })
      opencode.expectExit(diagnostic, 0, "db path")
      expect(diagnostic.stdout.trim()).toBe(":memory:")

      const runtime = yield* opencode.spawn(["db", "SELECT 1"], { env: { REPA_DB: ":memory:" } })
      opencode.expectExit(runtime, 1, "db query")
      expect(runtime.stderr).toContain("requires a filesystem database")
    }),
  60_000,
)

cliIt.live(
  "does not launch an external sqlite shell behind the retained connection",
  ({ opencode }) =>
    Effect.gen(function* () {
      const result = yield* opencode.spawn(["db"])
      opencode.expectExit(result, 1, "db")
      expect(result.stderr).toContain("integrated interactive database shell is not available")
    }),
  60_000,
)

cliIt.live(
  "lets one real server own the database while an attached run remains a client",
  ({ opencode }) =>
    Effect.gen(function* () {
      const server = yield* opencode.serve()
      const blocked = yield* opencode.spawn(["db", "SELECT 1"])
      opencode.expectExit(blocked, 1, "contending db query")
      expect(blocked.stderr).toContain("Another Repa process currently owns this LearnerHome")

      const attached = yield* opencode.run("reply with ok", { extraArgs: ["--attach", server.url] })
      opencode.expectExit(attached, 0, "attached run")
    }),
  90_000,
)
