import type { Argv } from "yargs"
import { confirm, isCancel } from "@clack/prompts"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Config } from "@/config/config"
import { TuiConfig } from "@/config/tui"
import { ContentManifest } from "@/content-root/manifest"
import { Effect, Schema } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"

const RootID = Schema.decodeUnknownEffect(ContentRoot.ContentRootID)
const MutationGrantID = Schema.decodeUnknownEffect(ContentRoot.MutationGrantID)

export const ContentCommand = cmd({
  command: "content",
  describe: "manage bounded learning-content authority",
  builder: (yargs: Argv) =>
    yargs.command(ContentRootCommand).command(ContentMutationCommand).command(ContentOriginsCommand).demandCommand(),
  async handler() {},
})

const ContentRootCommand = cmd({
  command: "root",
  describe: "manage durable observation-only ContentRoots",
  builder: (yargs: Argv) =>
    yargs
      .command(ContentRootAddCommand)
      .command(ContentRootListCommand)
      .command(ContentRootRevokeCommand)
      .command(ContentRootRebindCommand)
      .command(ContentRootInventoryCommand)
      .command(ContentRootImportCommand)
      .demandCommand(),
  async handler() {},
})

const ContentRootAddCommand = effectCmd({
  command: "add <path>",
  describe: "approve one exact directory for bounded observation",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("path", { type: "string", demandOption: true, describe: "local NTFS directory" })
      .option("yes", { type: "boolean", default: false, describe: "accept the displayed durable observation grant" }),
  handler: Effect.fn("Cli.content.root.add")(function* (args) {
    const roots = yield* ContentRoot.Service
    const proposal = yield* domain(roots.propose(args.path))
    yield* confirmation(
      args.yes,
      `Allow Repa to list, search, read, and observe learning content under ${proposal.descriptor.canonicalPath} until you revoke it? The configured model may receive selected content. This does not allow file changes, local commands, network access, connectors, or automatic import.`,
    )
    const root = yield* domain(
      roots.approve({
        proposal,
        approval: ContentRoot.LearnerApproval.contentRoot(proposal, "terminal content root approval"),
      }),
    )
    console.log(JSON.stringify(root, null, 2))
  }),
})

const ContentRootListCommand = effectCmd({
  command: "list",
  aliases: ["ls"],
  describe: "list active, revoked, unavailable, and mismatched roots",
  instance: false,
  handler: Effect.fn("Cli.content.root.list")(function* () {
    console.log(JSON.stringify(yield* domain((yield* ContentRoot.Service).list()), null, 2))
  }),
})

const ContentRootRevokeCommand = effectCmd({
  command: "revoke <contentRootID>",
  describe: "revoke future observation under one exact grant version",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("contentRootID", { type: "string", demandOption: true })
      .option("grant-version", { type: "number", demandOption: true })
      .option("basis", { type: "string", default: "terminal content root revocation" }),
  handler: Effect.fn("Cli.content.root.revoke")(function* (args) {
    const root = yield* domain(
      (yield* ContentRoot.Service).revoke({
        contentRootID: yield* decodeRootID(args.contentRootID),
        expectedGrantVersion: args.grantVersion,
        basis: args.basis,
      }),
    )
    console.log(JSON.stringify(root, null, 2))
  }),
})

const ContentRootRebindCommand = effectCmd({
  command: "rebind <contentRootID> <path>",
  describe: "explicitly bind an existing root identity to a newly displayed directory object",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("contentRootID", { type: "string", demandOption: true })
      .positional("path", { type: "string", demandOption: true })
      .option("binding-version", { type: "number", demandOption: true })
      .option("grant-version", { type: "number", demandOption: true })
      .option("yes", { type: "boolean", default: false }),
  handler: Effect.fn("Cli.content.root.rebind")(function* (args) {
    const roots = yield* ContentRoot.Service
    const proposal = yield* domain(roots.propose(args.path))
    const contentRootID = yield* decodeRootID(args.contentRootID)
    yield* confirmation(
      args.yes,
      `Rebind this ContentRoot to exact directory ${proposal.descriptor.canonicalPath} and grant observation until revoked? This does not transfer or revoke any independent file-mutation grant.`,
    )
    const root = yield* domain(
      roots.rebind({
        contentRootID,
        expectedBindingVersion: args.bindingVersion,
        expectedGrantVersion: args.grantVersion,
        proposal,
        approval: ContentRoot.LearnerApproval.contentRootRebind(
          {
            proposal,
            contentRootID,
            expectedBindingVersion: args.bindingVersion,
            expectedGrantVersion: args.grantVersion,
          },
          "terminal explicit root rebind",
        ),
      }),
    )
    console.log(JSON.stringify(root, null, 2))
  }),
})

const ContentRootInventoryCommand = effectCmd({
  command: "inventory <contentRootID>",
  describe: "produce one bounded ephemeral candidate manifest",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("contentRootID", { type: "string", demandOption: true })
      .option("scope", { type: "string", default: "." })
      .option("max-entries", { type: "number" })
      .option("max-depth", { type: "number" })
      .option("max-file-bytes", { type: "number" }),
  handler: Effect.fn("Cli.content.root.inventory")(function* (args) {
    const result = yield* domain(
      (yield* ContentRoot.Service).inventory({
        contentRootID: yield* decodeRootID(args.contentRootID),
        scope: args.scope,
        budgets: compact({
          maxEntries: args.maxEntries,
          maxDepth: args.maxDepth,
          maxFileBytes: args.maxFileBytes,
        }),
      }),
    )
    console.log(JSON.stringify(result, null, 2))
  }),
})

const ContentRootImportCommand = effectCmd({
  command: "import <contentRootID>",
  describe: "apply an explicit bounded manifest selection one Artifact transaction at a time",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("contentRootID", { type: "string", demandOption: true })
      .option("file", { type: "array", string: true, describe: "exact returned candidate key or relative path" })
      .option("subtree", { type: "array", string: true, describe: "returned directory key or relative path" })
      .option("all", { type: "boolean", default: false, describe: "select all supported returned files" })
      .option("scope", { type: "string", default: "." })
      .option("max-entries", { type: "number" })
      .option("max-depth", { type: "number" })
      .option("max-file-bytes", { type: "number" }),
  handler: Effect.fn("Cli.content.root.import")(function* (args) {
    if (!args.all && !args.file?.length && !args.subtree?.length) {
      return yield* fail("Select --file, --subtree, or --all from the bounded manifest")
    }
    const result = yield* domain(
      ContentManifest.apply({
        contentRootID: yield* decodeRootID(args.contentRootID),
        files: args.file,
        subtrees: args.subtree,
        allReturned: args.all,
        scope: args.scope,
        budgets: compact({
          maxEntries: args.maxEntries,
          maxDepth: args.maxDepth,
          maxFileBytes: args.maxFileBytes,
        }),
      }),
    )
    console.log(JSON.stringify(result, null, 2))
  }),
})

const ContentMutationCommand = cmd({
  command: "mutation",
  describe: "manage independently anchored direct file-mutation authority",
  builder: (yargs: Argv) =>
    yargs
      .command(ContentMutationGrantCommand)
      .command(ContentMutationListCommand)
      .command(ContentMutationRevokeCommand)
      .command(ContentMutationWriteCommand)
      .demandCommand(),
  async handler() {},
})

const ContentMutationGrantCommand = effectCmd({
  command: "grant <anchorPath> <relativeScope>",
  describe: "approve a durable exact path or subtree mutation grant",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("anchorPath", { type: "string", demandOption: true })
      .positional("relativeScope", { type: "string", demandOption: true })
      .option("scope-kind", { choices: ["exact", "subtree"] as const, demandOption: true })
      .option("right", {
        type: "array",
        string: true,
        choices: ["create", "modify", "delete", "rename_source", "rename_destination"] as const,
        demandOption: true,
      })
      .option("yes", { type: "boolean", default: false }),
  handler: Effect.fn("Cli.content.mutation.grant")(function* (args) {
    const roots = yield* ContentRoot.Service
    const proposal = yield* domain(
      roots.proposeMutationGrant({
        anchorPath: args.anchorPath,
        relativeScope: args.relativeScope,
        scopeKind: args.scopeKind,
        rights: args.right,
      }),
    )
    yield* confirmation(
      args.yes,
      `Allow Repa to ${proposal.rights.join(", ")} under ${proposal.anchor.canonicalPath}\\${proposal.relativeScope} (${proposal.scopeKind}) until revoked? This grant is independently anchored and does not allow Shell, network, connectors, sibling paths, or ContentRoot widening.`,
    )
    const grant = yield* domain(
      roots.approveMutationGrant({
        proposal,
        approval: ContentRoot.LearnerApproval.mutationGrant(proposal, "terminal durable mutation approval"),
      }),
    )
    console.log(JSON.stringify(grant, null, 2))
  }),
})

const ContentMutationListCommand = effectCmd({
  command: "list",
  aliases: ["ls"],
  describe: "list durable mutation grants and anchor verification",
  instance: false,
  handler: Effect.fn("Cli.content.mutation.list")(function* () {
    console.log(JSON.stringify(yield* domain((yield* ContentRoot.Service).listMutationGrants()), null, 2))
  }),
})

const ContentMutationRevokeCommand = effectCmd({
  command: "revoke <mutationGrantID>",
  describe: "revoke one exact durable mutation-grant version",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("mutationGrantID", { type: "string", demandOption: true })
      .option("version", { type: "number", demandOption: true })
      .option("basis", { type: "string", default: "terminal mutation grant revocation" }),
  handler: Effect.fn("Cli.content.mutation.revoke")(function* (args) {
    const grant = yield* domain(
      (yield* ContentRoot.Service).revokeMutationGrant({
        mutationGrantID: yield* decodeMutationGrantID(args.mutationGrantID),
        expectedVersion: args.version,
        basis: args.basis,
      }),
    )
    console.log(JSON.stringify(grant, null, 2))
  }),
})

const ContentMutationWriteCommand = effectCmd({
  command: "write <filePath>",
  describe: "perform one exact direct learner-authorized file create or replace",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("filePath", { type: "string", demandOption: true })
      .option("content", { type: "string", demandOption: true }),
  handler: Effect.fn("Cli.content.mutation.write")(function* (args) {
    const roots = yield* ContentRoot.Service
    const proposal = yield* domain(roots.proposeFileMutation(args.filePath))
    const result = yield* domain(
      roots.writeOnce({
        proposal,
        approval: ContentRoot.OnceMutationApproval.directLearnerInvocation(proposal, "terminal content mutation write"),
        bytes: new TextEncoder().encode(args.content),
      }),
    )
    console.log(JSON.stringify(result, null, 2))
  }),
})

const ContentOriginsCommand = effectCmd({
  command: "origins",
  describe: "inspect quarantined project config, TUI, and discovery declarations",
  handler: Effect.fn("Cli.content.origins")(function* () {
    const main = yield* (yield* Config.Service).originDiagnostics()
    const tui = yield* Effect.promise(() => TuiConfig.originDiagnostics())
    console.log(JSON.stringify({ main, tui }, null, 2))
  }),
})

function decodeRootID(input: string) {
  return RootID(input).pipe(Effect.catch(() => fail(`Invalid ContentRoot ID: ${input}`)))
}

function decodeMutationGrantID(input: string) {
  return MutationGrantID(input).pipe(Effect.catch(() => fail(`Invalid mutation grant ID: ${input}`)))
}

function confirmation(accepted: boolean, message: string) {
  if (accepted) return Effect.void
  return Effect.promise(() => confirm({ message })).pipe(
    Effect.flatMap((answer) => (isCancel(answer) || !answer ? fail("Authority change cancelled") : Effect.void)),
  )
}

function domain<A, E, R>(self: Effect.Effect<A, E, R>) {
  return self.pipe(
    Effect.catch((error) => {
      const cause = error as { detail?: string; message?: string; _tag?: string }
      return fail(cause.detail ?? cause.message ?? cause._tag ?? String(error))
    }),
  )
}

function compact<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter((entry) => entry[1] !== undefined)) as Partial<T>
}
