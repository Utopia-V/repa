import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect } from "effect"
import { EOL } from "os"
import { InstanceRef } from "@/effect/instance-ref"
import type { InstanceContext } from "@/project/instance-context"
import { SessionImportHistory } from "@/session/import-history"
import { effectCmd, fail } from "../effect-cmd"

export const ImportCommand = effectCmd({
  command: "import <file>",
  describe: "restore or copy a Session from a local Repa offline-history bundle",
  builder: (yargs) =>
    yargs
      .positional("file", {
        describe: "path to a local Repa offline-history JSON file",
        type: "string",
        demandOption: true,
      })
      .option("mode", {
        describe: "preserve identities in another database, or create a fully reidentified local copy",
        type: "string",
        choices: ["exact", "copy"] as const,
        demandOption: true,
      })
      .option("prompt", {
        describe: "genuine learner input that starts a copied Session",
        type: "string",
      })
      .option("confirm", {
        describe: "exact copy confirmation token printed by a prior no-effect proposal",
        type: "string",
      }),
  handler: Effect.fn("Cli.import")(function* (args) {
    const ctx = yield* InstanceRef
    if (!ctx) return yield* Effect.die("InstanceRef not provided")
    return yield* runImport(args, ctx)
  }),
})

const runImport = Effect.fn("Cli.import.body")(function* (
  args: { file: string; mode: "exact" | "copy"; prompt?: string; confirm?: string },
  ctx: InstanceContext,
) {
  const fs = yield* FSUtil.Service
  if (/^https?:\/\//i.test(args.file)) return yield* fail("Only local JSON files can be imported")

  const source = yield* fs.readFileStringSafe(args.file).pipe(Effect.orDie)
  if (source === undefined) return yield* fail(`File not found: ${args.file}`)
  const decoded = yield* SessionImportHistory.decode(source).pipe(
    Effect.catchTag("SessionImportHistory.DecodeError", (error) => fail(`Invalid import bundle: ${error.reason}`)),
    Effect.catchTag("SessionImportHistory.UnusableError", (error) => fail(`Unusable import history: ${error.reason}`)),
    Effect.catchTag("SessionImportHistory.UnsafeError", (error) => fail(`Unsafe import history: ${error.reason}`)),
    Effect.catchTag("SessionPresentation.FrontierUnrepresentableError", () =>
      fail("Imported history has no representable presentation successor"),
    ),
  )
  const sourceStillMatches = fs
    .readFileStringSafe(args.file)
    .pipe(
      Effect.map(
        (current) =>
          current !== undefined &&
          SessionImportHistory.fingerprintBytes(current) === decoded.sourceFileFingerprint,
      ),
      Effect.orElseSucceed(() => false),
    )

  if (args.mode === "exact") {
    const result = yield* SessionImportHistory.exactRestore({ decoded, context: ctx, sourceStillMatches }).pipe(
      Effect.catchTag("SessionIDRetiredError", (error) =>
        fail(`Session ID is retired in this database: ${error.sessionID}`),
      ),
      Effect.catchTag("SessionImportHistory.SameDatabaseError", () =>
        fail("Exact restore is allowed only into another LearnerHome database; use --mode copy for this database"),
      ),
      Effect.catchTag("SessionImportHistory.IdentityConflictError", (error) =>
        fail(`Import identity/content conflict (${error.identityKind}): ${error.identity}`),
      ),
      Effect.catchTag("SessionImportHistory.SourceChangedError", () =>
        fail("The local import file changed after validation; request a new import"),
      ),
      Effect.catchTag("SessionPresentation.FrontierUnrepresentableError", () =>
        fail("Imported history has no representable presentation successor"),
      ),
      Effect.catchTag("SessionPresentation.AdministrativeHistoryIntegrityError", (error) =>
        fail(`Administrative import history could not be sealed: ${error.reason}`),
      ),
    )
    process.stdout.write(
      `${result.type === "applied" ? "Restored" : "Already restored"} session with exact identities: ${result.sessionID}${EOL}`,
    )
    return
  }

  const learnerPrompt = args.prompt?.trim()
  if (!learnerPrompt) return yield* fail("Copy import requires a non-empty --prompt learner input")
  if (!args.confirm) {
    const proposal = yield* SessionImportHistory.prepareCopyProposal({ decoded, prompt: learnerPrompt }).pipe(
      Effect.catchTag("SessionPresentation.FrontierUnrepresentableError", () =>
        fail("Imported history has no representable presentation successor"),
      ),
    )
    process.stdout.write(`Copy proposal for ${decoded.bundle.info.id}${EOL}`)
    process.stdout.write(`  new Session: ${proposal.targetSessionID}${EOL}`)
    process.stdout.write(`  imported Messages: ${proposal.messageMapping.length}${EOL}`)
    process.stdout.write(`  imported typed Part identities: ${proposal.partMapping.length}${EOL}`)
    process.stdout.write(`  mapping fingerprint: ${proposal.mappingFingerprint}${EOL}`)
    process.stdout.write(`No data was imported. Re-run with --confirm ${SessionImportHistory.encodeCopyProposal(proposal)}${EOL}`)
    return
  }

  const proposal = yield* SessionImportHistory.decodeCopyProposal(args.confirm).pipe(
    Effect.catchTag("SessionImportHistory.ConfirmationError", (error) =>
      fail(`Invalid copy confirmation: ${error.reason}`),
    ),
  )
  const result = yield* SessionImportHistory.copy({
    decoded,
    proposal,
    prompt: learnerPrompt,
    sourceStillMatches,
  }).pipe(
    Effect.catchTag("SessionImportHistory.ConfirmationError", (error) =>
      fail(`Invalid copy confirmation: ${error.reason}`),
    ),
    Effect.catchTag("SessionImportHistory.IdentityConflictError", (error) =>
      fail(`Import identity/content conflict (${error.identityKind}): ${error.identity}`),
    ),
    Effect.catchTag("SessionImportHistory.SourceChangedError", () =>
      fail("The local import file changed after validation; request a new import"),
    ),
    Effect.catchTag("SessionPresentation.FrontierUnrepresentableError", () =>
      fail("Imported history has no representable presentation successor"),
    ),
    Effect.catch((error) => fail(error instanceof Error ? error.message : "Copy import failed")),
  )
  process.stdout.write(`Imported as new Session: ${result.sessionID}${EOL}`)
  process.stdout.write(`Identity-preserving restore did not occur; the original Session address was not reused.${EOL}`)
})
