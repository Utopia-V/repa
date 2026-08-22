import { expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { cliIt } from "../lib/cli-process"

cliIt.live(
  "keeps deleted identities final while supporting exact cross-database restore and explicit reidentified copy",
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
            type: "repa_session_offline_history",
            schemaVersion: 1,
            sourceDatabaseID: `lhm_${"1".repeat(32)}`,
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

      const imported = yield* repa.spawn(["import", source, "--mode", "exact"], { env })
      const exactReplay = yield* repa.spawn(["import", source, "--mode", "exact"], { env })
      const firstExport = yield* repa.spawn(["export", sessionID], { env })
      expect(firstExport.exitCode).toBe(0)
      const first = JSON.parse(firstExport.stdout)
      yield* Effect.promise(() => Bun.write(backup, firstExport.stdout))

      const deletionProposal = yield* repa.spawn(["session", "delete", sessionID, "--mode", "full"], { env })
      const deletionProposalOutput = deletionProposal.stdout + deletionProposal.stderr
      const deletionConfirmation = /--confirm ([0-9a-f]{64})/.exec(deletionProposalOutput)?.[1]
      expect(deletionConfirmation).toBeDefined()
      const deleted = yield* repa.spawn(
        ["session", "delete", sessionID, "--mode", "full", "--confirm", deletionConfirmation!],
        { env },
      )
      const missing = yield* repa.spawn(["export", sessionID], { env })
      const deletionReplay = yield* repa.spawn(["session", "delete", sessionID, "--mode", "full"], { env })
      const modeConflict = yield* repa.spawn(["session", "delete", sessionID, "--mode", "minimal-audit"], { env })
      const retiredRestore = yield* repa.spawn(["import", backup, "--mode", "exact"], { env })

      const copyProposal = yield* repa.spawn(
        ["import", backup, "--mode", "copy", "--prompt", "Continue from this imported history"],
        { env },
      )
      const copyConfirmation = /--confirm (\S+)/.exec(copyProposal.stdout)?.[1]
      expect(copyConfirmation).toBeDefined()
      const copyArgs = [
        "import",
        backup,
        "--mode",
        "copy",
        "--prompt",
        "Continue from this imported history",
        "--confirm",
        copyConfirmation!,
      ]
      const copied = yield* repa.spawn(copyArgs, { env, timeoutMs: 30_000 })
      const copyReplay = yield* repa.spawn(copyArgs, { env, timeoutMs: 30_000 })
      const copiedSessionID = /Imported as new Session: (\S+)/.exec(copied.stdout)?.[1]
      expect(copiedSessionID).toBeDefined()
      const copiedExport = yield* repa.spawn(["export", copiedSessionID!], { env })
      expect(copiedExport.exitCode).toBe(0)
      const copiedBundle = JSON.parse(copiedExport.stdout)

      expect({
        exits: [
          imported.exitCode,
          exactReplay.exitCode,
          firstExport.exitCode,
          deletionProposal.exitCode,
          deleted.exitCode,
          missing.exitCode !== 0,
          deletionReplay.exitCode,
          modeConflict.exitCode !== 0,
          retiredRestore.exitCode !== 0,
          copyProposal.exitCode,
          copied.exitCode,
          copyReplay.exitCode,
          copiedExport.exitCode,
        ],
        importOutput: imported.stdout,
        exactReplay: exactReplay.stdout,
        exactReplayError: exactReplay.stderr,
        deletion: {
          proposedWithoutMutation: deletionProposalOutput.includes("No data was deleted"),
          localExportOutsideScope: deletionProposalOutput.includes(
            "Local export files are outside this deletion and are not removed",
          ),
          applied: (deleted.stdout + deleted.stderr).includes("deletion applied"),
          replayed: (deletionReplay.stdout + deletionReplay.stderr).includes("already deleted"),
          conflict: (modeConflict.stdout + modeConflict.stderr).includes("deletion mode cannot be changed"),
        },
        retiredRestore: (retiredRestore.stdout + retiredRestore.stderr).includes("Session ID is retired"),
        rebound: {
          projectChanged: first.info.projectID !== "ignored-on-import",
          directoryChanged: first.info.directory !== "ignored-on-import",
          directoryLeaf: path.basename(first.info.directory),
        },
        message: first.messages[0]?.info,
        part: first.messages[0]?.parts[0],
        copy: {
          proposalNoMutation: copyProposal.stdout.includes("No data was imported"),
          newSession: copiedSessionID !== sessionID,
          replaySameSession: copyReplay.stdout.includes(`Imported as new Session: ${copiedSessionID}`),
          sourceMessageAbsent: copiedBundle.messages.every(
            (message: { info: { id: string } }) => message.info.id !== messageID,
          ),
          sourcePartAbsent: copiedBundle.messages.every((message: { parts: { id: string }[] }) =>
            message.parts.every((part) => part.id !== partID),
          ),
          learnerContinuationPresent: copiedBundle.messages.some((message: { parts: { type: string; text?: string }[] }) =>
            message.parts.some((part) => part.type === "text" && part.text === "Continue from this imported history"),
          ),
        },
      }).toEqual({
        exits: [0, 0, 0, 0, 0, true, 0, true, true, 0, 0, 0, 0],
        importOutput: `Restored session with exact identities: ${sessionID}\n`,
        exactReplay: `Already restored session with exact identities: ${sessionID}\n`,
        exactReplayError: "",
        deletion: {
          proposedWithoutMutation: true,
          localExportOutsideScope: true,
          applied: true,
          replayed: true,
          conflict: true,
        },
        retiredRestore: true,
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
        copy: {
          proposalNoMutation: true,
          newSession: true,
          replaySameSession: true,
          sourceMessageAbsent: true,
          sourcePartAbsent: true,
          learnerContinuationPresent: true,
        },
      })
    }),
  120_000,
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
        urls.map((url) => repa.spawn(["import", url, "--mode", "exact"], { timeoutMs: 10_000 })),
        { concurrency: 1 },
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
