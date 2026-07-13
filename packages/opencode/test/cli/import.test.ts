import { expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { cliIt } from "../lib/cli-process"

cliIt.live(
  "round-trips a local JSON session with its message and part through the native database",
  ({ home, opencode: repa }) =>
    Effect.gen(function* () {
      const sessionID = "ses_01J5Y5H0AH4Q4NXJ6P4C3P5V2M"
      const messageID = "msg_01J5Y5H0AH4Q4NXJ6P4C3P5V2N"
      const partID = "prt_01J5Y5H0AH4Q4NXJ6P4C3P5V2P"
      const source = path.join(home, "local-session.json")
      const backup = path.join(home, "local-session-backup.json")
      const env = { REPA_DB: path.join(home, "local-round-trip.db") }
      yield* Effect.promise(() =>
        Bun.write(
          source,
          JSON.stringify({
            info: {
              id: sessionID,
              slug: "gate-5a-local-import",
              projectID: "ignored-on-import",
              directory: "ignored-on-import",
              title: "Gate 5A local import",
              version: "1",
              time: { created: 1, updated: 1 },
            },
            messages: [
              {
                info: {
                  id: messageID,
                  sessionID,
                  role: "user",
                  time: { created: 2 },
                  agent: "repa",
                  model: { providerID: "test", modelID: "test-model" },
                },
                parts: [
                  {
                    id: partID,
                    sessionID,
                    messageID,
                    type: "text",
                    text: "local round-trip sentinel",
                  },
                ],
              },
            ],
          }),
        ),
      )

      const imported = yield* repa.spawn(["import", source], { env })
      const firstExport = yield* repa.spawn(["export", sessionID], { env })
      expect(firstExport.exitCode).toBe(0)
      const first = JSON.parse(firstExport.stdout)
      yield* Effect.promise(() => Bun.write(backup, firstExport.stdout))
      const deleted = yield* repa.spawn(["session", "delete", sessionID], { env })
      const missing = yield* repa.spawn(["export", sessionID], { env })
      const restored = yield* repa.spawn(["import", backup], { env })
      const secondExport = yield* repa.spawn(["export", sessionID], { env })
      expect(secondExport.exitCode).toBe(0)
      const second = JSON.parse(secondExport.stdout)

      expect({
        exits: [
          imported.exitCode,
          firstExport.exitCode,
          deleted.exitCode,
          missing.exitCode !== 0,
          restored.exitCode,
          secondExport.exitCode,
        ],
        importOutput: imported.stdout,
        restoredOutput: restored.stdout,
        rebound: {
          projectChanged: first.info.projectID !== "ignored-on-import",
          directoryChanged: first.info.directory !== "ignored-on-import",
          directoryLeaf: path.basename(first.info.directory),
        },
        message: first.messages[0]?.info,
        part: first.messages[0]?.parts[0],
        stable: second,
      }).toEqual({
        exits: [0, 0, 0, true, 0, 0],
        importOutput: `Imported session: ${sessionID}\n`,
        restoredOutput: `Imported session: ${sessionID}\n`,
        rebound: {
          projectChanged: true,
          directoryChanged: true,
          directoryLeaf: path.basename(home),
        },
        message: {
          id: messageID,
          sessionID,
          role: "user",
          time: { created: 2 },
          agent: "repa",
          model: { providerID: "test", modelID: "test-model" },
        },
        part: { id: partID, sessionID, messageID, type: "text", text: "local round-trip sentinel" },
        stable: first,
      })
    }),
  60_000,
)

cliIt.live(
  "rejects HTTP(S) imports as local-JSON-only without making a request",
  ({ opencode: repa }) =>
    Effect.gen(function* () {
      const requests: string[] = []
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch(request) {
              requests.push(request.url)
              return new Response("not available", { status: 503 })
            },
          }),
        ),
        (server) => Effect.sync(() => server.stop(true)),
      )
      const urls = [new URL("share/gate5a", server.url).toString(), "https://127.0.0.1:1/share/gate5a"]
      const results = yield* Effect.all(
        urls.map((url) => repa.spawn(["import", url], { timeoutMs: 10_000 })),
        { concurrency: "unbounded" },
      )

      expect({
        nonzero: results.map((result) => result.exitCode !== 0),
        localOnly: results.map((result) =>
          (result.stdout + result.stderr).includes("Only local JSON files can be imported"),
        ),
        requests: requests.length,
      }).toEqual({
        nonzero: [true, true],
        localOnly: [true, true],
        requests: 0,
      })
    }),
  30_000,
)
