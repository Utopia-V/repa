export * as ContentManifest from "./manifest"

import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { waitForAbort } from "@opencode-ai/core/process"
import { Cause, Effect, Exit, Schema } from "effect"

export type MemberOutcome =
  | {
      readonly status: "admitted"
      readonly key: string
      readonly relativePath: string
      readonly artifactID: Artifact.ArtifactID
      readonly sourceRevisionID: Artifact.RevisionID
    }
  | {
      readonly status: "observed" | "unchanged"
      readonly key: string
      readonly relativePath: string
      readonly artifactID: Artifact.ArtifactID
      readonly sourceRevisionID: Artifact.RevisionID
    }
  | {
      readonly status: "stale" | "failed"
      readonly key: string
      readonly relativePath: string
      readonly detail: string
    }

export type Result = {
  readonly inventory: ContentRoot.InventoryResult
  readonly selectedKeys: string[]
  readonly outcomes: MemberOutcome[]
  readonly unattempted: { readonly key: string; readonly relativePath: string }[]
  readonly cancelled: boolean
}

export class SelectionError extends Schema.TaggedErrorClass<SelectionError>()("ContentManifest.SelectionError", {
  detail: Schema.String,
}) {}

export class CancelledError extends Schema.TaggedErrorClass<CancelledError>()("ContentManifest.CancelledError", {
  detail: Schema.String,
}) {}

export function apply(input: {
  readonly contentRootID: ContentRoot.ContentRootID
  readonly files?: readonly string[]
  readonly subtrees?: readonly string[]
  readonly allReturned?: boolean
  readonly scope?: string
  readonly budgets?: Partial<ContentRoot.InventoryBudgets>
  readonly signal?: AbortSignal
  readonly onMember?: (outcome: MemberOutcome, index: number) => Effect.Effect<void>
}) {
  return Effect.gen(function* () {
    if (input.signal?.aborted) {
      return yield* new CancelledError({ detail: "Manifest application was cancelled before inventory began" })
    }
    const roots = yield* ContentRoot.Service
    const artifacts = yield* Artifact.Service
    const inventoryEffect = roots.inventory({
      contentRootID: input.contentRootID,
      scope: input.scope,
      budgets: input.budgets,
    })
    const inventory = input.signal
      ? yield* Effect.raceFirst(inventoryEffect, manifestCancellation(input.signal))
      : yield* inventoryEffect
    const selected = yield* select(inventory, input)
    const outcomes: MemberOutcome[] = []
    const unattempted: { key: string; relativePath: string }[] = []

    for (const [index, member] of selected.entries()) {
      if (input.signal?.aborted) {
        unattempted.push(
          ...selected.slice(index).map((entry) => ({ key: entry.key, relativePath: entry.relativePath })),
        )
        break
      }
      const exit = yield* applyMember(roots, artifacts, inventory, member).pipe(Effect.exit)
      const outcome: MemberOutcome = Exit.isSuccess(exit)
        ? exit.value
        : {
            status: "failed",
            key: member.key,
            relativePath: member.relativePath,
            detail: String(Cause.squash(exit.cause)),
          }
      outcomes.push(outcome)
      if (input.onMember) yield* input.onMember(outcome, index)
    }

    return {
      inventory,
      selectedKeys: selected.map((entry) => entry.key),
      outcomes,
      unattempted,
      cancelled: unattempted.length > 0,
    } satisfies Result
  })
}

function manifestCancellation(signal: AbortSignal) {
  return waitForAbort(signal).pipe(
    Effect.mapError(() => new CancelledError({ detail: "Manifest application was cancelled during inventory" })),
  )
}

function select(
  inventory: ContentRoot.InventoryResult,
  input: { readonly files?: readonly string[]; readonly subtrees?: readonly string[]; readonly allReturned?: boolean },
) {
  return Effect.gen(function* () {
    const files = inventory.entries.filter((entry) => entry.kind === "file" && entry.supported)
    const directories = inventory.entries.filter((entry) => entry.kind === "directory")
    const selected = new Map<string, ContentRoot.InventoryEntry>()

    if (input.allReturned) for (const entry of files) selected.set(entry.key, entry)
    for (const requested of input.files ?? []) {
      const entry = files.find((candidate) => candidate.key === requested || candidate.relativePath === requested)
      if (!entry) {
        return yield* new SelectionError({
          detail: `Selected file was not a supported member of this manifest: ${requested}`,
        })
      }
      selected.set(entry.key, entry)
    }
    for (const requested of input.subtrees ?? []) {
      const directory = directories.find(
        (candidate) => candidate.key === requested || candidate.relativePath === requested,
      )
      if (!directory) {
        return yield* new SelectionError({ detail: `Selected subtree was not returned by this manifest: ${requested}` })
      }
      for (const entry of files) {
        if (entry.relativePath.startsWith(`${directory.relativePath}/`)) selected.set(entry.key, entry)
      }
    }
    if (selected.size === 0) {
      return yield* new SelectionError({
        detail: "Select an exact returned file, returned subtree, or all returned files",
      })
    }
    return [...selected.values()].sort((left, right) => comparePath(left.relativePath, right.relativePath))
  })
}

function applyMember(
  roots: ContentRoot.Interface,
  artifacts: Artifact.Interface,
  inventory: ContentRoot.InventoryResult,
  member: ContentRoot.InventoryEntry,
) {
  return Effect.gen(function* () {
    const read = yield* roots.read({
      contentRootID: inventory.contentRootID,
      relativePath: member.relativePath,
      maxBytes: inventory.budgets.maxFileBytes,
    })
    if (
      read.authorization.bindingID !== inventory.bindingID ||
      read.authorization.grantEpisodeID !== inventory.grantEpisodeID ||
      read.authorization.grantVersion !== inventory.grantVersion
    ) {
      return {
        status: "stale",
        key: member.key,
        relativePath: member.relativePath,
        detail: "The ContentRoot authorization changed after inventory",
      } satisfies MemberOutcome
    }
    const prepared = read.observation
    if (prepared.result === "missing") {
      return {
        status: "stale",
        key: member.key,
        relativePath: member.relativePath,
        detail: "The selected manifest member is now missing; no Artifact was created",
      } satisfies MemberOutcome
    }
    if (
      ContentRoot.candidateKey({
        contentRootID: read.authorization.contentRootID,
        bindingID: read.authorization.bindingID,
        grantEpisodeID: read.authorization.grantEpisodeID,
        relativePath: member.relativePath,
        descriptor: prepared.descriptor,
      }) !== member.key
    ) {
      return {
        status: "stale",
        key: member.key,
        relativePath: member.relativePath,
        detail: "The selected manifest member was replaced after inventory; no Artifact was created",
      } satisfies MemberOutcome
    }
    const location = Artifact.CanonicalLocation.trusted(prepared.descriptor.canonicalPath)
    const observer = Artifact.Observer.trusted(
      `content-root:${read.authorization.contentRootID}:${read.authorization.bindingID}:${read.authorization.grantEpisodeID}`,
      read.authorization.grantVersion,
    )
    const observation = {
      result: "present" as const,
      fingerprint: prepared.fingerprint,
      mediaType: prepared.mediaType,
      observer,
      timeObserved: prepared.timeObserved,
    }
    const owner = yield* artifacts.lookupActiveLocation(location)
    if (!owner) {
      const artifact = yield* artifacts.admit({
        location,
        observation,
        authority: Artifact.Admission.initializationImport(
          `content-root:${read.authorization.contentRootID}:${read.authorization.grantEpisodeID}`,
          read.authorization.grantVersion,
        ),
      })
      const sourceRevisionID = artifact.source.currentRevisionID
      if (!sourceRevisionID) return yield* Effect.die("A present Artifact admission has no current Revision")
      return {
        status: "admitted",
        key: member.key,
        relativePath: member.relativePath,
        artifactID: artifact.id,
        sourceRevisionID,
      } satisfies MemberOutcome
    }
    const observed = yield* artifacts.observe({ expected: Artifact.expectedSource(owner.artifact), observation })
    const sourceRevisionID = observed.artifact.source.currentRevisionID
    if (!sourceRevisionID) return yield* Effect.die("A present Artifact observation has no current Revision")
    return {
      status: observed.changed ? "observed" : "unchanged",
      key: member.key,
      relativePath: member.relativePath,
      artifactID: observed.artifact.id,
      sourceRevisionID,
    } satisfies MemberOutcome
  })
}

function comparePath(left: string, right: string) {
  const insensitive = left.toLowerCase().localeCompare(right.toLowerCase(), "en")
  return insensitive || left.localeCompare(right, "en")
}
