import type { Argv } from "yargs"
import { confirm, isCancel } from "@clack/prompts"
import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Representation } from "@opencode-ai/core/representation"
import { Config } from "@/config/config"
import { TuiConfig } from "@/config/tui"
import { ContentManifest } from "@/content-root/manifest"
import { RepresentationConversion } from "@/representation/conversion"
import { MessageID, SessionID } from "@/session/schema"
import { Effect, Schema } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"

const RootID = Schema.decodeUnknownEffect(ContentRoot.ContentRootID)
const MutationGrantID = Schema.decodeUnknownEffect(ContentRoot.MutationGrantID)
const ArtifactID = Schema.decodeUnknownEffect(Artifact.ArtifactID)
const ArtifactRevisionID = Schema.decodeUnknownEffect(Artifact.RevisionID)
const RepresentationRevisionID = Schema.decodeUnknownEffect(Representation.RevisionID)
const ContinuedUseGrantID = Schema.decodeUnknownEffect(Representation.ContinuedUseGrantID)
const DecodeSessionID = Schema.decodeUnknownEffect(SessionID)
const DecodeMessageID = Schema.decodeUnknownEffect(MessageID)

export const ContentCommand = cmd({
  command: "content",
  describe: "manage bounded learning-content authority",
  builder: (yargs: Argv) =>
    yargs
      .command(ContentRootCommand)
      .command(ContentRepresentationCommand)
      .command(ContentMutationCommand)
      .command(ContentOriginsCommand)
      .demandCommand(),
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

const ContentRepresentationCommand = cmd({
  command: "representation",
  describe: "derive and use immutable readable Representations",
  builder: (yargs: Argv) =>
    yargs
      .command(ContentRepresentationConvertCommand)
      .command(ContentRepresentationListCommand)
      .command(ContentRepresentationShowCommand)
      .command(ContentRepresentationReadHistoricalCommand)
      .command(ContentRepresentationReadCurrentCommand)
      .command(ContentRepresentationGrantCommand)
      .command(ContentRepresentationGrantListCommand)
      .command(ContentRepresentationRevokeGrantCommand)
      .command(ContentRepresentationDeleteCommand)
      .command(ContentRepresentationReconcileCommand)
      .demandCommand(),
  async handler() {},
})

const ContentRepresentationConvertCommand = effectCmd({
  command: "convert <artifactID> <sourceRevisionID> <contentRootID> <relativePath>",
  describe: "derive one immutable readable Representation from an exact admitted source",
  builder: (yargs) =>
    yargs
      .positional("artifactID", { type: "string", demandOption: true })
      .positional("sourceRevisionID", { type: "string", demandOption: true })
      .positional("contentRootID", { type: "string", demandOption: true })
      .positional("relativePath", { type: "string", demandOption: true })
      .option("producer", {
        choices: ["local_pdf", "configured_model"] as const,
        default: "local_pdf" as const,
        describe: "closed Gate 11 producer recipe",
      })
      .option("operation", {
        type: "string",
        demandOption: true,
        describe: "stable retry identity; use a fresh value for intentional retranslation",
      })
      .option("basis", { type: "string", default: "explicit terminal readable-access request" })
      .option("root-selection", {
        choices: ["artifact_provenance", "explicit_learner"] as const,
        default: "artifact_provenance" as const,
      })
      .option("root-basis", { type: "string", describe: "required reason for explicit overlapping-root selection" })
      .option("session-id", { type: "string", describe: "existing initiating Session for configured model" })
      .option("message-id", { type: "string", describe: "existing initiating user Message for configured model" }),
  instance: (args) => args.producer === "configured_model",
  handler: Effect.fn("Cli.content.representation.convert")(function* (args) {
    if (args["root-selection"] === "explicit_learner" && !args["root-basis"]?.trim()) {
      return yield* fail("--root-basis is required with --root-selection explicit_learner")
    }
    if (args.producer === "configured_model" && (!args["session-id"] || !args["message-id"])) {
      return yield* fail("--session-id and --message-id are required for the configured model producer")
    }
    const producer =
      args.producer === "local_pdf"
        ? ({ kind: "local_pdf" } as const)
        : ({
            kind: "configured_model",
            sessionID: yield* decodeSessionID(args["session-id"]!),
            messageID: yield* decodeMessageID(args["message-id"]!),
          } as const)
    const result = yield* domain(
      RepresentationConversion.convert({
        effectiveArtifactID: yield* decodeArtifactID(args.artifactID),
        sourceRevisionID: yield* decodeArtifactRevisionID(args.sourceRevisionID),
        contentRootID: yield* decodeRootID(args.contentRootID),
        relativePath: args.relativePath,
        rootSelection:
          args["root-selection"] === "artifact_provenance"
            ? RepresentationConversion.RootSelection.artifactProvenance()
            : RepresentationConversion.RootSelection.explicitLearner(args["root-basis"]!),
        producer,
        authority: Representation.ConversionAuthority.deterministic(args.operation, args.basis),
      }),
    )
    console.log(JSON.stringify(result, null, 2))
  }),
})

const ContentRepresentationListCommand = effectCmd({
  command: "list <artifactID>",
  aliases: ["ls"],
  describe: "list immutable Representation Revisions for one effective Artifact",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("artifactID", { type: "string", demandOption: true })
      .option("after", { type: "string" })
      .option("limit", { type: "number" }),
  handler: Effect.fn("Cli.content.representation.list")(function* (args) {
    console.log(
      JSON.stringify(
        yield* domain(
          (yield* Representation.Service).listForArtifact({
            effectiveArtifactID: yield* decodeArtifactID(args.artifactID),
            ...(args.after ? { after: yield* decodeRepresentationRevisionID(args.after) } : {}),
            ...(args.limit === undefined ? {} : { limit: args.limit }),
          }),
        ),
        null,
        2,
      ),
    )
  }),
})

const ContentRepresentationShowCommand = effectCmd({
  command: "show <representationRevisionID>",
  describe: "inspect one exact immutable Representation Revision",
  instance: false,
  builder: (yargs) => yargs.positional("representationRevisionID", { type: "string", demandOption: true }),
  handler: Effect.fn("Cli.content.representation.show")(function* (args) {
    console.log(
      JSON.stringify(
        yield* domain(
          (yield* Representation.Service).get(yield* decodeRepresentationRevisionID(args.representationRevisionID)),
        ),
        null,
        2,
      ),
    )
  }),
})

const ContentRepresentationReadHistoricalCommand = effectCmd({
  command: "read-historical <representationRevisionID>",
  describe: "read verified exact bytes explicitly for historical or audit use",
  instance: false,
  builder: (yargs) =>
    representationReadBuilder(yargs.positional("representationRevisionID", { type: "string", demandOption: true })),
  handler: Effect.fn("Cli.content.representation.readHistorical")(function* (args) {
    printRepresentationRead(
      yield* domain(
        (yield* Representation.HistoricalReader).readHistorical({
          representationRevisionID: yield* decodeRepresentationRevisionID(args.representationRevisionID),
          selection: readSelection(args.profile, args.startPage),
          budgets: readBudgets(args),
        }),
      ),
    )
  }),
})

const ContentRepresentationReadCurrentCommand = effectCmd({
  command: "read-current <representationRevisionID> <artifactID>",
  describe: "read verified bytes only after current-teaching admission",
  instance: false,
  builder: (yargs) =>
    representationReadBuilder(
      yargs
        .positional("representationRevisionID", { type: "string", demandOption: true })
        .positional("artifactID", { type: "string", demandOption: true }),
    ),
  handler: Effect.fn("Cli.content.representation.readCurrent")(function* (args) {
    printRepresentationRead(
      yield* domain(
        (yield* Representation.CurrentUseReader).readForCurrentUse({
          representationRevisionID: yield* decodeRepresentationRevisionID(args.representationRevisionID),
          effectiveArtifactID: yield* decodeArtifactID(args.artifactID),
          selection: readSelection(args.profile, args.startPage),
          budgets: readBudgets(args),
        }),
      ),
    )
  }),
})

const ContentRepresentationGrantCommand = effectCmd({
  command: "grant <representationRevisionID> <artifactID>",
  describe: "authorize current teaching with one exact old/new source pair",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("representationRevisionID", { type: "string", demandOption: true })
      .positional("artifactID", { type: "string", demandOption: true })
      .option("operation", { type: "string", demandOption: true })
      .option("basis", { type: "string", default: "explicit terminal continued-use authorization" }),
  handler: Effect.fn("Cli.content.representation.grant")(function* (args) {
    const artifact = yield* domain((yield* Artifact.Service).getArtifact(yield* decodeArtifactID(args.artifactID)))
    const currentRevisionID = artifact.source.currentRevisionID
    const attribution = artifact.source.revisionAttribution
    if (!currentRevisionID || !attribution) return yield* fail("Artifact has no exact current Revision")
    console.log(
      JSON.stringify(
        yield* domain(
          (yield* Representation.Service).authorizeContinuedUse({
            representationRevisionID: yield* decodeRepresentationRevisionID(args.representationRevisionID),
            expectedArtifact: {
              effectiveArtifactID: artifact.id,
              dispositionVersion: artifact.dispositionVersion,
              currentRevisionID,
              attribution,
              lineageVersion: artifact.lineageVersion,
            },
            authority: Representation.LearnerAuthority.deterministic(args.operation, args.basis),
            timeAuthorized: Date.now(),
          }),
        ),
        null,
        2,
      ),
    )
  }),
})

const ContentRepresentationGrantListCommand = effectCmd({
  command: "grants <artifactID>",
  describe: "list active and revoked exact continued-use grants",
  instance: false,
  builder: (yargs) =>
    yargs.positional("artifactID", { type: "string", demandOption: true }).option("representation", { type: "string" }),
  handler: Effect.fn("Cli.content.representation.grants")(function* (args) {
    console.log(
      JSON.stringify(
        yield* domain(
          (yield* Representation.Service).listContinuedUseGrants({
            effectiveArtifactID: yield* decodeArtifactID(args.artifactID),
            ...(args.representation
              ? { representationRevisionID: yield* decodeRepresentationRevisionID(args.representation) }
              : {}),
          }),
        ),
        null,
        2,
      ),
    )
  }),
})

const ContentRepresentationRevokeGrantCommand = effectCmd({
  command: "revoke-grant <grantID>",
  describe: "revoke one exact continued-use grant version",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("grantID", { type: "string", demandOption: true })
      .option("version", { type: "number", demandOption: true })
      .option("operation", { type: "string", demandOption: true })
      .option("basis", { type: "string", default: "explicit terminal continued-use revocation" }),
  handler: Effect.fn("Cli.content.representation.revokeGrant")(function* (args) {
    console.log(
      JSON.stringify(
        yield* domain(
          (yield* Representation.Service).revokeContinuedUse({
            grantID: yield* decodeContinuedUseGrantID(args.grantID),
            expectedVersion: args.version,
            authority: Representation.LearnerAuthority.deterministic(args.operation, args.basis),
            timeRevoked: Date.now(),
          }),
        ),
        null,
        2,
      ),
    )
  }),
})

const ContentRepresentationDeleteCommand = effectCmd({
  command: "delete <representationRevisionID>",
  describe: "terminally delete one exact Representation Revision",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("representationRevisionID", { type: "string", demandOption: true })
      .option("availability-version", { type: "number", demandOption: true })
      .option("integrity-scan-bytes", { type: "number", demandOption: true })
      .option("operation", { type: "string", demandOption: true })
      .option("basis", { type: "string", default: "explicit terminal Representation deletion" })
      .option("yes", { type: "boolean", default: false }),
  handler: Effect.fn("Cli.content.representation.delete")(function* (args) {
    const representationRevisionID = yield* decodeRepresentationRevisionID(args.representationRevisionID)
    yield* confirmation(
      args.yes,
      `Permanently mark ${representationRevisionID} explicitly deleted and remove its exact managed bytes? Historical lineage remains, but this Revision cannot be restored or used again.`,
    )
    console.log(
      JSON.stringify(
        yield* domain(
          (yield* Representation.Service).explicitlyDelete({
            representationRevisionID,
            expectedAvailabilityVersion: args.availabilityVersion,
            integrityScanBytes: args.integrityScanBytes,
            authority: Representation.LearnerAuthority.deterministic(args.operation, args.basis),
            timeDeleted: Date.now(),
          }),
        ),
        null,
        2,
      ),
    )
  }),
})

const ContentRepresentationReconcileCommand = effectCmd({
  command: "reconcile <representationRevisionID>",
  describe: "reconcile managed-object availability without changing source or teaching eligibility",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("representationRevisionID", { type: "string", demandOption: true })
      .option("integrity-scan-bytes", { type: "number", demandOption: true }),
  handler: Effect.fn("Cli.content.representation.reconcile")(function* (args) {
    console.log(
      JSON.stringify(
        yield* domain(
          (yield* Representation.Service).reconcileAvailability({
            representationRevisionID: yield* decodeRepresentationRevisionID(args.representationRevisionID),
            integrityScanBytes: args.integrityScanBytes,
          }),
        ),
        null,
        2,
      ),
    )
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

function decodeArtifactID(input: string) {
  return ArtifactID(input).pipe(Effect.catch(() => fail(`Invalid Artifact ID: ${input}`)))
}

function decodeArtifactRevisionID(input: string) {
  return ArtifactRevisionID(input).pipe(Effect.catch(() => fail(`Invalid Artifact Revision ID: ${input}`)))
}

function decodeRepresentationRevisionID(input: string) {
  return RepresentationRevisionID(input).pipe(Effect.catch(() => fail(`Invalid Representation Revision ID: ${input}`)))
}

function decodeContinuedUseGrantID(input: string) {
  return ContinuedUseGrantID(input).pipe(Effect.catch(() => fail(`Invalid continued-use grant ID: ${input}`)))
}

function decodeSessionID(input: string) {
  return DecodeSessionID(input).pipe(Effect.catch(() => fail(`Invalid Session ID: ${input}`)))
}

function decodeMessageID(input: string) {
  return DecodeMessageID(input).pipe(Effect.catch(() => fail(`Invalid Message ID: ${input}`)))
}

function representationReadBuilder(yargs: Argv) {
  return yargs
    .option("profile", { choices: ["whole", "pdf_pages", "model_document"] as const, default: "whole" as const })
    .option("start-page", { type: "number", default: 1 })
    .option("integrity-scan-bytes", { type: "number", default: 64 * 1024 * 1024 })
    .option("return-bytes", { type: "number", default: 1024 * 1024 })
    .option("records", { type: "number", default: 100 })
}

function readSelection(profile: "whole" | "pdf_pages" | "model_document", startPage: number) {
  if (profile === "pdf_pages") return { type: "pdf_pages" as const, startPage }
  if (profile === "model_document") return { type: "model_document" as const }
  return { type: "whole" as const }
}

function readBudgets(input: { integrityScanBytes: number; returnBytes: number; records: number }) {
  return {
    integrityScanBytes: input.integrityScanBytes,
    returnBytes: input.returnBytes,
    records: input.records,
  }
}

function printRepresentationRead(input: Representation.HistoricalRead | Representation.CurrentUseRead) {
  console.log(
    JSON.stringify(
      {
        ...input,
        content: {
          ...input.content,
          bytes: new TextDecoder("utf-8", { fatal: true }).decode(input.content.bytes),
        },
      },
      null,
      2,
    ),
  )
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
