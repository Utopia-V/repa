import type { Argv } from "yargs"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { Session } from "@/session/session"
import { SessionID } from "../../session/schema"
import { UI } from "../ui"
import { Locale } from "@/util/locale"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"
import { NotFoundError } from "@/storage/storage"
import { EOL } from "os"
import path from "path"
import { which } from "@opencode-ai/core/util/which"
import { Database } from "@opencode-ai/core/database/database"
import { SessionDeletion } from "@opencode-ai/core/session-deletion"

function pagerCmd(): string[] {
  const lessOptions = ["-R", "-S"]
  if (process.platform !== "win32") {
    return ["less", ...lessOptions]
  }

  // user could have less installed via other options
  const lessOnPath = which("less")
  if (lessOnPath) {
    if (Filesystem.stat(lessOnPath)?.size) return [lessOnPath, ...lessOptions]
  }

  if (Flag.REPA_GIT_BASH_PATH) {
    const less = path.join(Flag.REPA_GIT_BASH_PATH, "..", "..", "usr", "bin", "less.exe")
    if (Filesystem.stat(less)?.size) return [less, ...lessOptions]
  }

  const git = which("git")
  if (git) {
    const less = path.join(git, "..", "..", "usr", "bin", "less.exe")
    if (Filesystem.stat(less)?.size) return [less, ...lessOptions]
  }

  // Fall back to Windows built-in more (via cmd.exe)
  return ["cmd", "/c", "more"]
}

export const SessionCommand = cmd({
  command: "session",
  describe: "manage sessions",
  builder: (yargs: Argv) => yargs.command(SessionListCommand).command(SessionDeleteCommand).demandCommand(),
  async handler() {},
})

export const SessionDeleteCommand = effectCmd({
  command: "delete <sessionID>",
  describe: "delete a session",
  builder: (yargs) =>
    yargs
      .positional("sessionID", {
        describe: "session ID to delete",
        type: "string",
        demandOption: true,
      })
      .option("mode", {
        describe: "delete all lineage or retain the purgeable minimal inspection audit",
        type: "string",
        choices: ["full", "minimal-audit"] as const,
        demandOption: true,
      })
      .option("confirm", {
        describe: "exact request fingerprint printed by a prior no-effect proposal",
        type: "string",
  }),
  handler: Effect.fn("Cli.session.delete")(function* (args) {
    const svc = yield* Session.Service
    const sessionID = SessionID.make(args.sessionID)
    const mode = args.mode === "minimal-audit" ? "minimal_audit" : "full"
    const { db } = yield* Database.Service
    const existing = yield* db.transaction((tx) => SessionDeletion.readStatus(tx, sessionID)).pipe(Effect.orDie)
    if (existing.type === "deleted") {
      if (existing.settlement.mode !== mode) {
        return yield* fail(
          `Session was already deleted with mode ${existing.settlement.mode}; deletion mode cannot be changed`,
        )
      }
      UI.println(
        `Session ${args.sessionID} already deleted at ${existing.settlement.deletionTime}; audit ${existing.auditAvailable ? "retained" : "not retained"}`,
      )
      return
    }
    const proposal = yield* svc
      .proposeRemoval({
        sessionID,
        mode,
      })
      .pipe(
        Effect.catchIf(NotFoundError.isInstance, () => fail(`Session not found: ${args.sessionID}`)),
        Effect.catchTag("SessionBusyError", () => fail(`Session is busy: ${args.sessionID}`)),
        Effect.catchTag("SessionTreeBusyError", (error) =>
          fail(`Session tree is busy (${error.activeTurnIDs.join(", ")}): ${args.sessionID}`),
        ),
      )
    if ("type" in proposal) {
      if (proposal.type === "deletion_mode_conflict") {
        return yield* fail(
          `Session was already deleted with mode ${proposal.settlement.mode}; deletion mode cannot be changed`,
        )
      }
      UI.println(
        `Session ${args.sessionID} already deleted at ${proposal.settlement.deletionTime}; audit ${proposal.auditAvailable ? "retained" : "not retained"}`,
      )
      return
    }
    if (args.confirm !== proposal.requestFingerprint) {
      UI.println(`Deletion proposal for ${proposal.rootSessionID}`)
      UI.println(`  mode: ${args.mode}`)
      UI.println(`  complete Session subtree: ${proposal.subtreeCount}`)
      proposal.targets.forEach((target) =>
        UI.println(`  - ${target.sessionID}${target.parentSessionID ? ` (child of ${target.parentSessionID})` : " (root)"}`),
      )
      UI.println(`  request fingerprint: ${proposal.requestFingerprint}`)
      UI.println(`Local export files are outside this deletion and are not removed.`)
      UI.println(`No data was deleted. Re-run with --confirm ${proposal.requestFingerprint}`)
      return
    }
    const result = yield* svc.commitRemoval(proposal).pipe(
      Effect.catchIf(NotFoundError.isInstance, () => fail(`Session not found: ${args.sessionID}`)),
      Effect.catchTag("SessionBusyError", () => fail(`Session is busy: ${args.sessionID}`)),
      Effect.catchTag("SessionTreeBusyError", (error) =>
        fail(`Session tree is busy (${error.activeTurnIDs.join(", ")}): ${args.sessionID}`),
      ),
      Effect.catchTag("SessionTreeChangedError", () => fail(`Session tree changed; request a new proposal`)),
      Effect.catchTag("SessionDeletion.InvocationConflictError", () => fail(`Deletion request identity conflicted`)),
      Effect.catchTag("SessionDeletion.AuditProjectionError", (error) => fail(`Minimal audit unavailable: ${error.reason}`)),
    )
    UI.println(
      UI.Style.TEXT_SUCCESS_BOLD +
        `Session ${args.sessionID} deletion ${result.type}; audit ${result.auditAvailable ? "retained" : "not retained"}` +
        UI.Style.TEXT_NORMAL,
    )
  }),
})

export const SessionListCommand = effectCmd({
  command: "list",
  describe: "list sessions",
  builder: (yargs) =>
    yargs
      .option("max-count", {
        alias: "n",
        describe: "limit to N most recent sessions",
        type: "number",
      })
      .option("format", {
        describe: "output format",
        type: "string",
        choices: ["table", "json"],
        default: "table",
      }),
  handler: Effect.fn("Cli.session.list")(function* (args) {
    const sessions = yield* Session.Service.use((svc) => svc.list({ roots: true, limit: args.maxCount }))

    if (sessions.length === 0) return

    const output = args.format === "json" ? formatSessionJSON(sessions) : formatSessionTable(sessions)

    const shouldPaginate = process.stdout.isTTY && !args.maxCount && args.format === "table"

    if (shouldPaginate) {
      yield* Effect.promise(async () => {
        const proc = Process.spawn(pagerCmd(), {
          stdin: "pipe",
          stdout: "inherit",
          stderr: "inherit",
        })

        if (!proc.stdin) {
          console.log(output)
          return
        }

        proc.stdin.write(output)
        proc.stdin.end()
        await proc.exited
      })
    } else {
      console.log(output)
    }
  }),
})

function formatSessionTable(sessions: Session.Info[]): string {
  const lines: string[] = []

  const maxIdWidth = Math.max(20, ...sessions.map((s) => s.id.length))
  const maxTitleWidth = Math.max(25, ...sessions.map((s) => s.title.length))

  const header = `Session ID${" ".repeat(maxIdWidth - 10)}  Title${" ".repeat(maxTitleWidth - 5)}  Updated`
  lines.push(header)
  lines.push("─".repeat(header.length))
  for (const session of sessions) {
    const truncatedTitle = Locale.truncate(session.title, maxTitleWidth)
    const timeStr = Locale.todayTimeOrDateTime(session.time.updated)
    const line = `${session.id.padEnd(maxIdWidth)}  ${truncatedTitle.padEnd(maxTitleWidth)}  ${timeStr}`
    lines.push(line)
  }

  return lines.join(EOL)
}

function formatSessionJSON(sessions: Session.Info[]): string {
  const jsonData = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updated: session.time.updated,
    created: session.time.created,
    projectId: session.projectID,
    directory: session.directory,
  }))
  return JSON.stringify(jsonData, null, 2)
}
