export * as ContentRoot from "./content-root"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { and, asc, desc, eq, max, or } from "drizzle-orm"
import { Context, Effect, Layer, Scope, Semaphore } from "effect"
import { win32 } from "path"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { LearningFrontier } from "./learning-frontier"
import { ContentRootNTFS } from "./content-root/ntfs"
import {
  BindingEpisodeID,
  BindingID,
  ConflictError,
  ContentRootID,
  GrantEpisodeID,
  InvalidTransitionError,
  MutationGrantID,
  NotFoundError,
  PathError,
  UnsupportedFilesystemError,
  createBindingEpisodeID,
  createBindingID,
  createContentRootID,
  createGrantEpisodeID,
  createMutationGrantID,
  type Error,
  type MutationRight,
  type MutationScope,
} from "./content-root/schema"
import {
  ContentMutationGrantTable,
  ContentRootBindingEpisodeTable,
  ContentRootBindingTable,
  ContentRootCurrentTable,
  ContentRootGrantEpisodeTable,
  ContentRootTable,
} from "./content-root/sql"

export {
  BindingEpisodeID,
  BindingID,
  ConflictError,
  ContentRootID,
  GrantEpisodeID,
  InvalidTransitionError,
  MutationGrantID,
  NotFoundError,
  PathError,
  UnsupportedFilesystemError,
} from "./content-root/schema"
export type { Error, MutationRight, MutationScope } from "./content-root/schema"

type DatabaseShape = EffectDrizzleSqlite.EffectSQLiteDatabase
export type Transaction = Parameters<Parameters<DatabaseShape["transaction"]>[0]>[0]
type Queryable = DatabaseShape | Transaction
type BindingRow = typeof ContentRootBindingTable.$inferSelect
type BindingEpisodeRow = typeof ContentRootBindingEpisodeTable.$inferSelect
type GrantEpisodeRow = typeof ContentRootGrantEpisodeTable.$inferSelect
type MutationGrantRow = typeof ContentMutationGrantTable.$inferSelect

export class Proposal {
  private constructor(
    readonly descriptor: ContentRootNTFS.Descriptor,
    readonly timeProposed: number,
  ) {}

  static inspected(descriptor: ContentRootNTFS.Descriptor) {
    return new Proposal(descriptor, Date.now())
  }
}

type LearnerApprovalTarget =
  | { readonly kind: "content_root"; readonly proposal: Proposal }
  | {
      readonly kind: "content_root_rebind"
      readonly proposal: Proposal
      readonly contentRootID: ContentRootID
      readonly expectedBindingVersion: number
      readonly expectedGrantVersion: number
    }
  | { readonly kind: "mutation_grant"; readonly proposal: MutationProposal }

export class LearnerApproval {
  readonly #mutationGrantID?: MutationGrantID

  private constructor(
    readonly basis: string,
    private readonly target: LearnerApprovalTarget,
    mutationGrantID?: MutationGrantID,
  ) {
    this.#mutationGrantID = mutationGrantID
  }

  static contentRoot(proposal: Proposal, basis: string) {
    return new LearnerApproval(requireBasis(basis), { kind: "content_root", proposal })
  }

  static contentRootRebind(
    input: {
      readonly proposal: Proposal
      readonly contentRootID: ContentRootID
      readonly expectedBindingVersion: number
      readonly expectedGrantVersion: number
    },
    basis: string,
  ) {
    return new LearnerApproval(requireBasis(basis), { kind: "content_root_rebind", ...input })
  }

  static mutationGrant(proposal: MutationProposal, basis: string) {
    return new LearnerApproval(requireBasis(basis), { kind: "mutation_grant", proposal }, createMutationGrantID())
  }

  authorizes(target: LearnerApprovalTarget) {
    if (this.target.kind !== target.kind || this.target.proposal !== target.proposal) return false
    if (this.target.kind !== "content_root_rebind" || target.kind !== "content_root_rebind") return true
    return (
      this.target.contentRootID === target.contentRootID &&
      this.target.expectedBindingVersion === target.expectedBindingVersion &&
      this.target.expectedGrantVersion === target.expectedGrantVersion
    )
  }

  mutationGrantIdentity(proposal: MutationProposal) {
    if (this.target.kind !== "mutation_grant" || this.target.proposal !== proposal) return
    return this.#mutationGrantID
  }
}

export class MutationProposal {
  private constructor(
    readonly anchor: ContentRootNTFS.Descriptor,
    readonly relativeScope: string,
    readonly scopeKind: MutationScope,
    readonly rights: readonly MutationRight[],
    readonly provenance?: { readonly contentRootID: ContentRootID; readonly bindingID: BindingID },
  ) {}

  static inspected(input: {
    anchor: ContentRootNTFS.Descriptor
    relativeScope: string
    scopeKind: MutationScope
    rights: readonly MutationRight[]
    provenance?: { readonly contentRootID: ContentRootID; readonly bindingID: BindingID }
  }) {
    return new MutationProposal(
      input.anchor,
      input.relativeScope,
      input.scopeKind,
      [...new Set(input.rights)].sort(),
      input.provenance,
    )
  }
}

export class OnceMutationProposal {
  private constructor(
    readonly anchor: ContentRootNTFS.Descriptor,
    readonly relativePath: string,
    readonly operation: "create" | "modify",
    readonly expectedTarget?: ContentRootNTFS.Descriptor,
  ) {}

  static inspected(input: {
    anchor: ContentRootNTFS.Descriptor
    relativePath: string
    operation: "create" | "modify"
    expectedTarget?: ContentRootNTFS.Descriptor
  }) {
    return new OnceMutationProposal(input.anchor, input.relativePath, input.operation, input.expectedTarget)
  }
}

export class OnceMutationApproval {
  #consumed = false

  private constructor(
    readonly proposal: OnceMutationProposal,
    readonly invocationIdentity: string,
    readonly basis: "direct_learner_invocation" | "system_confirmation",
  ) {}

  static directLearnerInvocation(proposal: OnceMutationProposal, invocationIdentity: string) {
    return new OnceMutationApproval(proposal, requireBasis(invocationIdentity), "direct_learner_invocation")
  }

  static systemConfirmation(proposal: OnceMutationProposal, invocationIdentity: string) {
    return new OnceMutationApproval(proposal, requireBasis(invocationIdentity), "system_confirmation")
  }

  consume(proposal: OnceMutationProposal) {
    if (this.proposal !== proposal || this.#consumed) return false
    this.#consumed = true
    return true
  }
}

export type BindingInfo = {
  readonly id: BindingID
  readonly contentRootID: ContentRootID
  readonly descriptor: ContentRootNTFS.Descriptor
  readonly timeCreated: number
}

export type BindingEpisodeInfo = {
  readonly id: BindingEpisodeID
  readonly bindingID: BindingID
  readonly ordinal: number
  readonly approvalBasis: string
  readonly timeStarted: number
  readonly timeEnded?: number
  readonly endReason?: "explicit_rebind"
}

export type GrantEpisodeInfo = {
  readonly id: GrantEpisodeID
  readonly bindingID: BindingID
  readonly bindingEpisodeID: BindingEpisodeID
  readonly ordinal: number
  readonly approvalBasis: string
  readonly timeApproved: number
  readonly closeBasis?: string
  readonly timeClosed?: number
  readonly timeUpdated: number
}

export type RootInfo = {
  readonly id: ContentRootID
  readonly timeCreated: number
  readonly disposition: "active" | "revoked"
  readonly binding: BindingInfo
  readonly bindingEpisode: BindingEpisodeInfo
  readonly grant?: GrantEpisodeInfo
  readonly grantVersion: number
  readonly verification: ContentRootNTFS.Verification
}

export type ReadAuthorizationReceipt = {
  readonly contentRootID: ContentRootID
  readonly bindingID: BindingID
  readonly bindingEpisodeID: BindingEpisodeID
  readonly bindingEpisodeOrdinal: number
  readonly grantEpisodeID: GrantEpisodeID
  readonly grantVersion: number
}

export type ReadResult = {
  readonly authorization: ReadAuthorizationReceipt
  readonly observation: ContentRootNTFS.PreparedFile | ContentRootNTFS.PreparedMissing
}

export type LocalReadAuthorizationReceipt =
  | Readonly<{
      kind: "content_root"
      root: ContentRootNTFS.Descriptor
      relativePath: string
      canonicalPath: string
      contentRoot: ReadAuthorizationReceipt
      grantEpisodeOrdinal: number
    }>
  | Readonly<{
      kind: "active_workspace"
      root: ContentRootNTFS.Descriptor
      relativePath: string
      canonicalPath: string
      workspaceIdentity: string
    }>
  | Readonly<{
      kind: "one_operation"
      root: ContentRootNTFS.Descriptor
      relativePath: string
      canonicalPath: string
      operationIdentity: string
      approvalBasis: string
    }>

const workspaceReadToken = Symbol("ContentRoot.ActiveWorkspaceRead")
const operationReadToken = Symbol("ContentRoot.OneOperationRead")
const preparedLocalReadToken = Symbol("ContentRoot.PreparedLocalRead")

/** Trusted active execution-workspace scope; it never becomes a durable ContentRoot. */
export class ActiveWorkspaceRead {
  private constructor(
    readonly directory: string,
    readonly workspaceIdentity: string,
  ) {}

  static trusted(directory: string, workspaceIdentity: string) {
    return new ActiveWorkspaceRead(directory, workspaceIdentity)
  }

  expectation(token: symbol) {
    if (token !== workspaceReadToken) return undefined
    return { directory: this.directory, workspaceIdentity: this.workspaceIdentity }
  }
}

/** Trusted exact permission result for one local-read operation; it is never persisted as a root. */
export class OneOperationRead {
  private constructor(
    readonly path: string,
    readonly operationIdentity: string,
    readonly approvalBasis: string,
  ) {}

  static trusted(path: string, operationIdentity: string, approvalBasis: string) {
    return new OneOperationRead(path, operationIdentity, approvalBasis)
  }

  expectation(token: symbol) {
    if (token !== operationReadToken) return undefined
    return { path: this.path, operationIdentity: this.operationIdentity, approvalBasis: this.approvalBasis }
  }
}

/** Race-safe bytes and exact authority provenance for one Gate 10 local read. */
export class PreparedLocalRead {
  readonly authorization: LocalReadAuthorizationReceipt
  readonly observation: ContentRootNTFS.PreparedFile
  #require: (tx: Transaction) => Effect.Effect<LocalReadAuthorizationReceipt, Error>

  constructor(
    token: symbol,
    authorization: LocalReadAuthorizationReceipt,
    observation: ContentRootNTFS.PreparedFile,
    require: (tx: Transaction) => Effect.Effect<LocalReadAuthorizationReceipt, Error>,
  ) {
    if (token !== preparedLocalReadToken) throw new Error("Local-read proofs are owner-issued")
    this.authorization = Object.freeze({ ...authorization, root: Object.freeze({ ...authorization.root }) })
    this.observation = Object.freeze({ ...observation, bytes: observation.bytes.slice() })
    this.#require = require
  }

  require(tx: Transaction) {
    return this.#require(tx)
  }
}

export type MutationGrantInfo = {
  readonly id: MutationGrantID
  readonly anchor: ContentRootNTFS.Descriptor
  readonly relativeScope: string
  readonly scopeKind: MutationScope
  readonly rights: MutationRight[]
  readonly version: number
  readonly disposition: "active" | "revoked"
  readonly approvalBasis: string
  readonly timeApproved: number
  readonly revocationBasis?: string
  readonly timeRevoked?: number
  readonly timeUpdated: number
  readonly provenance?: { readonly contentRootID: ContentRootID; readonly bindingID: BindingID }
  readonly verification: ContentRootNTFS.Verification
}

type StoredRoot = Omit<RootInfo, "verification">
type StoredMutationGrant = Omit<MutationGrantInfo, "verification">

export type InventoryBudgets = {
  readonly maxDepth: number
  readonly maxEntries: number
  readonly maxDirectories: number
  readonly maxFiles: number
  readonly maxDurationMs: number
  readonly maxPathBytes: number
  readonly maxReturnedBytes: number
  readonly maxFileBytes: number
}

export type InventoryEntry = {
  readonly key: string
  readonly relativePath: string
  readonly kind: "directory" | "file"
  readonly size: number
  readonly mediaType?: string
  readonly supported: boolean
  readonly objectID: string
}

export type InventoryResult = {
  readonly contentRootID: ContentRootID
  readonly bindingID: BindingID
  readonly grantEpisodeID: GrantEpisodeID
  readonly grantVersion: number
  readonly requestedScope: string
  readonly budgets: InventoryBudgets
  readonly ignoredPaths: readonly string[]
  readonly protectedPaths: readonly string[]
  readonly entries: InventoryEntry[]
  readonly visited: { readonly entries: number; readonly directories: number; readonly files: number }
  readonly returnedBytes: number
  readonly truncated: boolean
  readonly truncationReasons: string[]
  readonly frontier: string[]
}

export type SearchResult = {
  readonly inventory: InventoryResult
  readonly query: string
  readonly matches: {
    readonly key: string
    readonly relativePath: string
    readonly line: number
    readonly text: string
  }[]
  readonly contextBytes: number
  readonly truncated: boolean
  readonly truncationReasons: string[]
}

export function candidateKey(input: {
  readonly contentRootID: ContentRootID
  readonly bindingID: BindingID
  readonly grantEpisodeID: GrantEpisodeID
  readonly relativePath: string
  readonly descriptor: ContentRootNTFS.Descriptor
}) {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(
    `${input.contentRootID}\0${input.bindingID}\0${input.grantEpisodeID}\0${input.relativePath}\0${input.descriptor.volumeSerial}\0${input.descriptor.objectID}\0${input.descriptor.creationTime}`,
  )
  return hasher.digest("hex")
}

export interface Interface {
  readonly propose: (path: string) => Effect.Effect<Proposal, Error>
  readonly approve: (input: {
    readonly proposal: Proposal
    readonly approval: LearnerApproval
  }) => Effect.Effect<RootInfo, Error>
  readonly get: (contentRootID: ContentRootID) => Effect.Effect<RootInfo, Error>
  readonly list: () => Effect.Effect<RootInfo[], Error>
  readonly revoke: (input: {
    readonly contentRootID: ContentRootID
    readonly expectedGrantVersion: number
    readonly basis: string
  }) => Effect.Effect<RootInfo, Error>
  readonly rebind: (input: {
    readonly contentRootID: ContentRootID
    readonly expectedBindingVersion: number
    readonly expectedGrantVersion: number
    readonly proposal: Proposal
    readonly approval: LearnerApproval
  }) => Effect.Effect<RootInfo, Error>
  readonly inventory: (input: {
    readonly contentRootID: ContentRootID
    readonly scope?: string
    readonly budgets?: Partial<InventoryBudgets>
  }) => Effect.Effect<InventoryResult, Error>
  readonly search: (input: {
    readonly contentRootID: ContentRootID
    readonly query: string
    readonly scope?: string
    readonly budgets?: Partial<InventoryBudgets>
    readonly maxMatches?: number
    readonly maxContextBytes?: number
  }) => Effect.Effect<SearchResult, Error>
  readonly read: (input: {
    readonly contentRootID: ContentRootID
    readonly relativePath: string
    readonly maxBytes?: number
  }) => Effect.Effect<ReadResult, Error>
  /** Prepare one exact Gate 10 local read without admitting Artifact state. */
  readonly prepareLocalRead: (
    input:
      | Readonly<{
          authority: { readonly type: "content_root"; readonly contentRootID: ContentRootID }
          path: string
          maxBytes?: number
        }>
      | Readonly<{
          authority: { readonly type: "active_workspace"; readonly scope: ActiveWorkspaceRead }
          path: string
          maxBytes?: number
        }>
      | Readonly<{
          authority: { readonly type: "one_operation"; readonly grant: OneOperationRead }
          path: string
          maxBytes?: number
        }>,
  ) => Effect.Effect<PreparedLocalRead, Error>
  readonly subscribeInvalidation: (contentRootID: ContentRootID) => Effect.Effect<AbortSignal, never, Scope.Scope>
  readonly proposeMutationGrant: (input: {
    readonly anchorPath: string
    readonly relativeScope: string
    readonly scopeKind: MutationScope
    readonly rights: readonly MutationRight[]
    readonly provenance?: { readonly contentRootID: ContentRootID; readonly bindingID: BindingID }
  }) => Effect.Effect<MutationProposal, Error>
  readonly approveMutationGrant: (input: {
    readonly proposal: MutationProposal
    readonly approval: LearnerApproval
  }) => Effect.Effect<MutationGrantInfo, Error>
  readonly listMutationGrants: () => Effect.Effect<MutationGrantInfo[], Error>
  readonly getMutationGrant: (mutationGrantID: MutationGrantID) => Effect.Effect<MutationGrantInfo, Error>
  readonly revokeMutationGrant: (input: {
    readonly mutationGrantID: MutationGrantID
    readonly expectedVersion: number
    readonly basis: string
  }) => Effect.Effect<MutationGrantInfo, Error>
  readonly authorizeMutation: (input: {
    readonly mutationGrantID: MutationGrantID
    readonly expectedVersion: number
    readonly right: MutationRight
    readonly relativePath: string
  }) => Effect.Effect<{ readonly grant: MutationGrantInfo; readonly canonicalPath: string }, Error>
  readonly authorizeRename: (input: {
    readonly source: {
      readonly mutationGrantID: MutationGrantID
      readonly expectedVersion: number
      readonly relativePath: string
    }
    readonly destination: {
      readonly mutationGrantID: MutationGrantID
      readonly expectedVersion: number
      readonly relativePath: string
    }
  }) => Effect.Effect<
    { readonly sourcePath: string; readonly destinationPath: string; readonly grants: MutationGrantInfo[] },
    Error
  >
  readonly proposeFileMutation: (filePath: string) => Effect.Effect<OnceMutationProposal, Error>
  readonly writeOnce: (input: {
    readonly proposal: OnceMutationProposal
    readonly approval: OnceMutationApproval
    readonly bytes: Uint8Array
  }) => Effect.Effect<ContentRootNTFS.MutationWriteResult, Error>
  readonly writeWithGrant: (input: {
    readonly mutationGrantID: MutationGrantID
    readonly expectedVersion: number
    readonly relativePath: string
    readonly bytes: Uint8Array
  }) => Effect.Effect<
    { readonly grant: MutationGrantInfo; readonly result: ContentRootNTFS.MutationWriteResult },
    Error
  >
}

export class Service extends Context.Service<Service, Interface>()("@repa/ContentRoot") {}

const serialize = Semaphore.makeUnsafe(1)
const DEFAULT_BUDGETS: InventoryBudgets = {
  maxDepth: 8,
  maxEntries: 2000,
  maxDirectories: 500,
  maxFiles: 1500,
  maxDurationMs: 5000,
  maxPathBytes: 4096,
  maxReturnedBytes: 512 * 1024,
  maxFileBytes: 32 * 1024 * 1024,
}
const IGNORED_NAMES = new Set(["node_modules"])
const PROTECTED_NAMES = new Set([".git"])

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const invalidationSubscribers = new Map<ContentRootID, Set<AbortController>>()

    const requestInvalidation = (contentRootID: ContentRootID) =>
      Effect.sync(() => {
        for (const controller of invalidationSubscribers.get(contentRootID) ?? []) controller.abort()
      })

    const subscribeInvalidation: Interface["subscribeInvalidation"] = Effect.fn("ContentRoot.subscribeInvalidation")(
      function* (contentRootID) {
        const controller = yield* Effect.acquireRelease(
          serialize.withPermit(
            Effect.sync(() => {
              const controller = new AbortController()
              const subscribers = invalidationSubscribers.get(contentRootID) ?? new Set<AbortController>()
              subscribers.add(controller)
              invalidationSubscribers.set(contentRootID, subscribers)
              return controller
            }),
          ),
          (controller) =>
            Effect.sync(() => {
              const subscribers = invalidationSubscribers.get(contentRootID)
              subscribers?.delete(controller)
              if (subscribers?.size === 0) invalidationSubscribers.delete(contentRootID)
            }),
        )
        return controller.signal
      },
    )

    const propose: Interface["propose"] = Effect.fn("ContentRoot.propose")(function* (path) {
      return Proposal.inspected(yield* native(() => ContentRootNTFS.inspectDirectory(path)))
    })

    const get: Interface["get"] = Effect.fn("ContentRoot.get")(function* (contentRootID) {
      return yield* materialize(yield* snapshot(db, (tx) => requireStoredRoot(tx, contentRootID)))
    })

    const list: Interface["list"] = Effect.fn("ContentRoot.list")(function* () {
      const ids = yield* snapshot(db, (tx) =>
        tx
          .select({ id: ContentRootTable.id })
          .from(ContentRootTable)
          .orderBy(asc(ContentRootTable.time_created), asc(ContentRootTable.id)),
      )
      return yield* Effect.forEach(ids, (row) => get(row.id), { concurrency: 4 })
    })

    const approve: Interface["approve"] = Effect.fn("ContentRoot.approve")(function* (input) {
      const proposal = yield* requireProposal(input.proposal)
      const approval = yield* requireApproval(input.approval, { kind: "content_root", proposal })
      const current = yield* native(() => ContentRootNTFS.inspectDirectory(proposal.descriptor.canonicalPath))
      if (!ContentRootNTFS.sameObject(proposal.descriptor, current)) {
        return yield* new PathError({
          path: proposal.descriptor.canonicalPath,
          reason: "stale",
          detail: "The directory changed after the approval scope was displayed",
        })
      }
      const stored = yield* serialize.withPermit(
        db
          .transaction((tx) => approveStored(tx, current, approval.basis))
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die), Effect.catchTag("SqlError", Effect.die)),
      )
      return yield* materialize(stored)
    })

    const revoke: Interface["revoke"] = Effect.fn("ContentRoot.revoke")(function* (input) {
      const basis = requireBasis(input.basis)
      const stored = yield* serialize.withPermit(
        Effect.gen(function* () {
          const transition = yield* db
            .transaction((tx) => revokeStored(tx, input.contentRootID, input.expectedGrantVersion, basis))
            .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die), Effect.catchTag("SqlError", Effect.die))
          if (transition.invalidated) yield* requestInvalidation(input.contentRootID)
          return transition.stored
        }),
      )
      return yield* materialize(stored)
    })

    const rebind: Interface["rebind"] = Effect.fn("ContentRoot.rebind")(function* (input) {
      const proposal = yield* requireProposal(input.proposal)
      const approval = yield* requireApproval(input.approval, {
        kind: "content_root_rebind",
        proposal,
        contentRootID: input.contentRootID,
        expectedBindingVersion: input.expectedBindingVersion,
        expectedGrantVersion: input.expectedGrantVersion,
      })
      const current = yield* native(() => ContentRootNTFS.inspectDirectory(proposal.descriptor.canonicalPath))
      if (!ContentRootNTFS.sameObject(proposal.descriptor, current)) {
        return yield* new PathError({
          path: proposal.descriptor.canonicalPath,
          reason: "stale",
          detail: "The rebind destination changed after it was displayed",
        })
      }
      const stored = yield* serialize.withPermit(
        Effect.gen(function* () {
          const transition = yield* db
            .transaction((tx) =>
              rebindStored(tx, {
                contentRootID: input.contentRootID,
                expectedBindingVersion: input.expectedBindingVersion,
                expectedGrantVersion: input.expectedGrantVersion,
                descriptor: current,
                basis: approval.basis,
              }),
            )
            .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die), Effect.catchTag("SqlError", Effect.die))
          if (transition.invalidated) yield* requestInvalidation(input.contentRootID)
          return transition.stored
        }),
      )
      return yield* materialize(stored)
    })

    const authorize = Effect.fn("ContentRoot.authorize")(function* (contentRootID: ContentRootID) {
      const stored = yield* snapshot(db, (tx) => requireStoredRoot(tx, contentRootID))
      if (stored.disposition !== "active" || !stored.grant) {
        return yield* new InvalidTransitionError({ detail: `ContentRoot ${contentRootID} is revoked` })
      }
      const verification = yield* native(() => ContentRootNTFS.verifyDirectory(stored.binding.descriptor))
      if (verification.status !== "verified") {
        return yield* new PathError({
          path: stored.binding.descriptor.canonicalPath,
          reason: verification.status === "identity_mismatch" ? "identity_mismatch" : "unreadable",
          detail: "The current ContentRoot binding is not available for this operation",
        })
      }
      return { stored, grant: stored.grant }
    })

    const inventory: Interface["inventory"] = Effect.fn("ContentRoot.inventory")(function* (input) {
      const startedAt = Date.now()
      const budgets = resolveBudgets(input.budgets)
      const authorized = yield* authorize(input.contentRootID)
      return yield* inventoryAuthorized(authorized.stored, authorized.grant, input.scope, budgets, startedAt)
    })

    const read: Interface["read"] = Effect.fn("ContentRoot.read")(function* (input) {
      const authorized = yield* authorize(input.contentRootID)
      const observation = yield* native(() =>
        ContentRootNTFS.prepareFile(
          authorized.stored.binding.descriptor,
          input.relativePath,
          input.maxBytes ?? DEFAULT_BUDGETS.maxFileBytes,
        ),
      )
      return {
        authorization: {
          contentRootID: authorized.stored.id,
          bindingID: authorized.stored.binding.id,
          bindingEpisodeID: authorized.stored.bindingEpisode.id,
          bindingEpisodeOrdinal: authorized.stored.bindingEpisode.ordinal,
          grantEpisodeID: authorized.grant.id,
          grantVersion: authorized.stored.grantVersion,
        },
        observation,
      }
    })

    const prepareLocalRead: Interface["prepareLocalRead"] = Effect.fn("ContentRoot.prepareLocalRead")(
      function* (input) {
        if (input.authority.type === "content_root") {
          const authorized = yield* authorize(input.authority.contentRootID)
          const relativePath = yield* localRelativePath(authorized.stored.binding.descriptor, input.path)
          const observation = yield* native(() =>
            ContentRootNTFS.prepareFile(
              authorized.stored.binding.descriptor,
              relativePath,
              input.maxBytes ?? DEFAULT_BUDGETS.maxFileBytes,
            ),
          )
          if (observation.result === "missing") {
            return yield* new PathError({
              path: input.path,
              reason: "not_found",
              detail: "The exact authorized local source is missing",
            })
          }
          const authorization = {
            kind: "content_root" as const,
            root: authorized.stored.binding.descriptor,
            relativePath,
            canonicalPath: observation.descriptor.canonicalPath,
            contentRoot: {
              contentRootID: authorized.stored.id,
              bindingID: authorized.stored.binding.id,
              bindingEpisodeID: authorized.stored.bindingEpisode.id,
              bindingEpisodeOrdinal: authorized.stored.bindingEpisode.ordinal,
              grantEpisodeID: authorized.grant.id,
              grantVersion: authorized.stored.grantVersion,
            },
            grantEpisodeOrdinal: authorized.grant.ordinal,
          } satisfies LocalReadAuthorizationReceipt
          return new PreparedLocalRead(preparedLocalReadToken, authorization, observation, (tx) =>
            Effect.gen(function* () {
              const current = yield* requireStoredRoot(tx, authorization.contentRoot.contentRootID)
              if (
                current.disposition !== "active" ||
                !current.grant ||
                current.binding.id !== authorization.contentRoot.bindingID ||
                current.bindingEpisode.id !== authorization.contentRoot.bindingEpisodeID ||
                current.bindingEpisode.ordinal !== authorization.contentRoot.bindingEpisodeOrdinal ||
                current.grant.id !== authorization.contentRoot.grantEpisodeID ||
                current.grant.ordinal !== authorization.grantEpisodeOrdinal ||
                current.grantVersion !== authorization.contentRoot.grantVersion ||
                !ContentRootNTFS.sameObject(current.binding.descriptor, authorization.root)
              ) {
                return yield* new ConflictError({
                  entity: "grant_episode",
                  id: authorization.contentRoot.grantEpisodeID,
                  detail: "The exact ContentRoot read authority changed before local composition",
                })
              }
              yield* native(() => ContentRootNTFS.requireSameObject(authorization.root))
              yield* native(() => ContentRootNTFS.requireUnchangedFile(observation.descriptor))
              return authorization
            }).pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die)),
          )
        }

        if (input.authority.type === "active_workspace") {
          const scope = input.authority.scope.expectation(workspaceReadToken)
          if (!scope || !scope.directory || !scope.workspaceIdentity) {
            return yield* new InvalidTransitionError({ detail: "Active workspace read scope is invalid" })
          }
          const root = yield* native(() => ContentRootNTFS.inspectDirectory(scope.directory))
          const relativePath = yield* localRelativePath(root, input.path)
          const observation = yield* native(() =>
            ContentRootNTFS.prepareFile(root, relativePath, input.maxBytes ?? DEFAULT_BUDGETS.maxFileBytes),
          )
          if (observation.result === "missing") {
            return yield* new PathError({
              path: input.path,
              reason: "not_found",
              detail: "The exact active-workspace source is missing",
            })
          }
          const authorization = {
            kind: "active_workspace" as const,
            root,
            relativePath,
            canonicalPath: observation.descriptor.canonicalPath,
            workspaceIdentity: scope.workspaceIdentity,
          } satisfies LocalReadAuthorizationReceipt
          return new PreparedLocalRead(preparedLocalReadToken, authorization, observation, () =>
            Effect.gen(function* () {
              yield* native(() => ContentRootNTFS.requireSameObject(authorization.root))
              yield* native(() => ContentRootNTFS.requireUnchangedFile(observation.descriptor))
              return authorization
            }),
          )
        }

        const grant = input.authority.grant.expectation(operationReadToken)
        if (!grant || !grant.path || !grant.operationIdentity || !grant.approvalBasis.trim()) {
          return yield* new InvalidTransitionError({ detail: "One-operation local read grant is invalid" })
        }
        const requested = win32.resolve(input.path)
        if (requested.toLocaleLowerCase("und") !== win32.resolve(grant.path).toLocaleLowerCase("und")) {
          return yield* new PathError({
            path: input.path,
            reason: "identity_mismatch",
            detail: "The local path does not match the exact one-operation learner grant",
          })
        }
        const root = yield* native(() => ContentRootNTFS.inspectDirectory(win32.dirname(requested)))
        const relativePath = yield* localRelativePath(root, requested)
        const observation = yield* native(() =>
          ContentRootNTFS.prepareFile(root, relativePath, input.maxBytes ?? DEFAULT_BUDGETS.maxFileBytes),
        )
        if (observation.result === "missing") {
          return yield* new PathError({
            path: input.path,
            reason: "not_found",
            detail: "The exact one-operation source is missing",
          })
        }
        const authorization = {
          kind: "one_operation" as const,
          root,
          relativePath,
          canonicalPath: observation.descriptor.canonicalPath,
          operationIdentity: grant.operationIdentity,
          approvalBasis: grant.approvalBasis,
        } satisfies LocalReadAuthorizationReceipt
        return new PreparedLocalRead(preparedLocalReadToken, authorization, observation, () =>
          Effect.gen(function* () {
            yield* native(() => ContentRootNTFS.requireSameObject(authorization.root))
            yield* native(() => ContentRootNTFS.requireUnchangedFile(observation.descriptor))
            return authorization
          }),
        )
      },
    )

    const search: Interface["search"] = Effect.fn("ContentRoot.search")(function* (input) {
      if (!input.query) return yield* new InvalidTransitionError({ detail: "Search query must not be empty" })
      const startedAt = Date.now()
      const budgets = resolveBudgets(input.budgets)
      const authorized = yield* authorize(input.contentRootID)
      const inventory = yield* inventoryAuthorized(authorized.stored, authorized.grant, input.scope, budgets, startedAt)
      return yield* searchAuthorized(
        inventory,
        authorized.stored.binding.descriptor,
        input.query,
        input.maxMatches ?? 200,
        input.maxContextBytes ?? 64 * 1024,
        startedAt,
      )
    })

    const proposeMutationGrant: Interface["proposeMutationGrant"] = Effect.fn("ContentRoot.proposeMutationGrant")(
      function* (input) {
        if (input.rights.length === 0) {
          return yield* new InvalidTransitionError({ detail: "A mutation grant must contain at least one exact right" })
        }
        const anchor = yield* native(() => ContentRootNTFS.inspectDirectory(input.anchorPath))
        const relativeScope = ContentRootNTFS.normalizeRelativePath(input.relativeScope)
        if (input.provenance) {
          const root = yield* snapshot(db, (tx) => requireStoredRoot(tx, input.provenance!.contentRootID))
          if (root.binding.id !== input.provenance.bindingID) {
            return yield* new InvalidTransitionError({
              detail: "Mutation provenance does not name the root's current binding",
            })
          }
        }
        return MutationProposal.inspected({
          anchor,
          relativeScope,
          scopeKind: input.scopeKind,
          rights: input.rights,
          provenance: input.provenance,
        })
      },
    )

    const getMutationGrant: Interface["getMutationGrant"] = Effect.fn("ContentRoot.getMutationGrant")(
      function* (mutationGrantID) {
        return yield* materializeMutationGrant(
          yield* snapshot(db, (tx) => requireStoredMutationGrant(tx, mutationGrantID)),
        )
      },
    )

    const listMutationGrants: Interface["listMutationGrants"] = Effect.fn("ContentRoot.listMutationGrants")(
      function* () {
        const ids = yield* snapshot(db, (tx) =>
          tx
            .select({ id: ContentMutationGrantTable.id })
            .from(ContentMutationGrantTable)
            .orderBy(asc(ContentMutationGrantTable.time_approved), asc(ContentMutationGrantTable.id)),
        )
        return yield* Effect.forEach(ids, (row) => getMutationGrant(row.id), { concurrency: 4 })
      },
    )

    const approveMutationGrant: Interface["approveMutationGrant"] = Effect.fn("ContentRoot.approveMutationGrant")(
      function* (input) {
        const proposal = yield* requireMutationProposal(input.proposal)
        const approval = yield* requireApproval(input.approval, { kind: "mutation_grant", proposal })
        const id = approval.mutationGrantIdentity(proposal)
        if (!id) {
          return yield* new InvalidTransitionError({ detail: "Mutation approval has no stable authority identity" })
        }
        const stored = yield* serialize.withPermit(
          Effect.gen(function* () {
            const existing = yield* snapshot(db, (tx) =>
              tx.select().from(ContentMutationGrantTable).where(eq(ContentMutationGrantTable.id, id)).get(),
            )
            if (existing) return mutationGrantInfo(existing)

            const current = yield* native(() => ContentRootNTFS.inspectDirectory(proposal.anchor.canonicalPath))
            if (!ContentRootNTFS.sameObject(proposal.anchor, current)) {
              return yield* new PathError({
                path: proposal.anchor.canonicalPath,
                reason: "stale",
                detail: "The mutation anchor changed after the grant was displayed",
              })
            }
            const time = Date.now()
            return yield* db
              .transaction((tx) =>
                Effect.gen(function* () {
                  const replay = yield* tx
                    .select()
                    .from(ContentMutationGrantTable)
                    .where(eq(ContentMutationGrantTable.id, id))
                    .get()
                  if (replay) return mutationGrantInfo(replay)
                  yield* tx.insert(ContentMutationGrantTable).values({
                    id,
                    canonical_anchor_path: current.canonicalPath,
                    canonical_anchor_path_key: current.canonicalPathKey,
                    platform: current.platform,
                    volume_serial: current.volumeSerial,
                    object_id: current.objectID,
                    creation_time: current.creationTime,
                    initial_change_time: current.changeTime,
                    verifier_version: current.verifierVersion,
                    relative_scope: proposal.relativeScope,
                    scope_kind: proposal.scopeKind,
                    allow_create: proposal.rights.includes("create"),
                    allow_modify: proposal.rights.includes("modify"),
                    allow_delete: proposal.rights.includes("delete"),
                    allow_rename_source: proposal.rights.includes("rename_source"),
                    allow_rename_destination: proposal.rights.includes("rename_destination"),
                    version: 1,
                    disposition: "active",
                    approval_basis: approval.basis,
                    time_approved: time,
                    time_updated: time,
                    provenance_content_root_id: proposal.provenance?.contentRootID,
                    provenance_binding_id: proposal.provenance?.bindingID,
                  })
                  yield* LearningFrontier.advance(tx, { time })
                  return yield* requireStoredMutationGrant(tx, id)
                }),
              )
              .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die), Effect.catchTag("SqlError", Effect.die))
          }),
        )
        return yield* materializeMutationGrant(stored)
      },
    )

    const revokeMutationGrant: Interface["revokeMutationGrant"] = Effect.fn("ContentRoot.revokeMutationGrant")(
      function* (input) {
        const basis = requireBasis(input.basis)
        const stored = yield* serialize.withPermit(
          db
            .transaction((tx) =>
              Effect.gen(function* () {
                const current = yield* requireStoredMutationGrant(tx, input.mutationGrantID)
                if (current.version !== input.expectedVersion) {
                  return yield* new ConflictError({
                    entity: "mutation_grant",
                    id: current.id,
                    detail: "Mutation grant version changed",
                    expectedVersion: input.expectedVersion,
                    currentVersion: current.version,
                  })
                }
                if (current.disposition === "revoked") return current
                const time = Date.now()
                const updated = yield* tx
                  .update(ContentMutationGrantTable)
                  .set({
                    disposition: "revoked",
                    version: current.version + 1,
                    revocation_basis: basis,
                    time_revoked: time,
                    time_updated: time,
                  })
                  .where(
                    and(
                      eq(ContentMutationGrantTable.id, current.id),
                      eq(ContentMutationGrantTable.version, input.expectedVersion),
                      eq(ContentMutationGrantTable.disposition, "active"),
                    ),
                  )
                  .returning({ id: ContentMutationGrantTable.id })
                  .get()
                if (!updated) {
                  return yield* new ConflictError({
                    entity: "mutation_grant",
                    id: current.id,
                    detail: "Mutation grant changed concurrently",
                    expectedVersion: input.expectedVersion,
                  })
                }
                yield* LearningFrontier.advance(tx, { time })
                return yield* requireStoredMutationGrant(tx, current.id)
              }),
            )
            .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die), Effect.catchTag("SqlError", Effect.die)),
        )
        return yield* materializeMutationGrant(stored)
      },
    )

    const authorizeMutation: Interface["authorizeMutation"] = Effect.fn("ContentRoot.authorizeMutation")(
      function* (input) {
        const grant = yield* getMutationGrant(input.mutationGrantID)
        if (grant.version !== input.expectedVersion) {
          return yield* new ConflictError({
            entity: "mutation_grant",
            id: grant.id,
            detail: "Mutation grant version changed",
            expectedVersion: input.expectedVersion,
            currentVersion: grant.version,
          })
        }
        if (grant.disposition !== "active") {
          return yield* new InvalidTransitionError({ detail: `Mutation grant ${grant.id} is revoked` })
        }
        if (!grant.rights.includes(input.right)) {
          return yield* new InvalidTransitionError({ detail: `Mutation grant ${grant.id} lacks ${input.right}` })
        }
        if (grant.verification.status !== "verified") {
          return yield* new PathError({
            path: grant.anchor.canonicalPath,
            reason: grant.verification.status === "identity_mismatch" ? "identity_mismatch" : "unreadable",
            detail: "The independent mutation anchor is not currently verified",
          })
        }
        const relativePath = ContentRootNTFS.normalizeRelativePath(input.relativePath)
        if (!inMutationScope(grant, relativePath)) {
          return yield* new PathError({
            path: relativePath,
            reason: "outside_scope",
            detail: "The requested mutation path is outside the durable grant scope",
          })
        }
        return { grant, canonicalPath: ContentRootNTFS.containsPath(grant.anchor, relativePath) }
      },
    )

    const authorizeRename: Interface["authorizeRename"] = Effect.fn("ContentRoot.authorizeRename")(function* (input) {
      const source = yield* authorizeMutation({ ...input.source, right: "rename_source" })
      const destination = yield* authorizeMutation({ ...input.destination, right: "rename_destination" })
      return {
        sourcePath: source.canonicalPath,
        destinationPath: destination.canonicalPath,
        grants: source.grant.id === destination.grant.id ? [source.grant] : [source.grant, destination.grant],
      }
    })

    const proposeFileMutation: Interface["proposeFileMutation"] = Effect.fn("ContentRoot.proposeFileMutation")(
      function* (filePath) {
        if (process.platform !== "win32") {
          return yield* new UnsupportedFilesystemError({
            path: filePath,
            platform: process.platform,
            detail: "Mediated file mutation currently supports only local Windows NTFS volumes",
          })
        }
        const absolute = win32.resolve(filePath)
        const anchor = yield* native(() => ContentRootNTFS.inspectDirectory(win32.dirname(absolute)))
        const relativePath = ContentRootNTFS.normalizeRelativePath(win32.basename(absolute))
        const target = yield* native(() => ContentRootNTFS.inspectRelative(anchor, relativePath)).pipe(
          Effect.map((descriptor) => ({ operation: "modify" as const, descriptor })),
          Effect.catchTag("ContentRoot.PathError", (error) =>
            error.reason === "not_found"
              ? Effect.succeed({ operation: "create" as const, descriptor: undefined })
              : Effect.fail(error),
          ),
        )
        if (target.descriptor?.kind === "directory") {
          return yield* new PathError({
            path: filePath,
            reason: "not_file",
            detail: "The exact mutation target is a directory",
          })
        }
        return OnceMutationProposal.inspected({
          anchor,
          relativePath,
          operation: target.operation,
          expectedTarget: target.descriptor,
        })
      },
    )

    const writeOnce: Interface["writeOnce"] = Effect.fn("ContentRoot.writeOnce")(function* (input) {
      if (!(input.proposal instanceof OnceMutationProposal) || !(input.approval instanceof OnceMutationApproval)) {
        return yield* new InvalidTransitionError({
          detail: "A mediated one-shot write requires an exact runtime proposal",
        })
      }
      if (!input.approval.consume(input.proposal)) {
        return yield* new InvalidTransitionError({ detail: "The one-shot mutation grant is stale or already consumed" })
      }
      return yield* native(() =>
        ContentRootNTFS.writeFile(
          input.proposal.anchor,
          input.proposal.relativePath,
          input.bytes,
          { create: input.proposal.operation === "create", modify: input.proposal.operation === "modify" },
          input.proposal.expectedTarget,
        ),
      )
    })

    const writeWithGrant: Interface["writeWithGrant"] = Effect.fn("ContentRoot.writeWithGrant")(function* (input) {
      const grant = yield* getMutationGrant(input.mutationGrantID)
      if (grant.version !== input.expectedVersion) {
        return yield* new ConflictError({
          entity: "mutation_grant",
          id: grant.id,
          detail: "Mutation grant version changed",
          expectedVersion: input.expectedVersion,
          currentVersion: grant.version,
        })
      }
      if (grant.disposition !== "active") {
        return yield* new InvalidTransitionError({ detail: `Mutation grant ${grant.id} is revoked` })
      }
      if (!grant.rights.includes("create") && !grant.rights.includes("modify")) {
        return yield* new InvalidTransitionError({ detail: `Mutation grant ${grant.id} has no write right` })
      }
      if (grant.verification.status !== "verified") {
        return yield* new PathError({
          path: grant.anchor.canonicalPath,
          reason: grant.verification.status === "identity_mismatch" ? "identity_mismatch" : "unreadable",
          detail: "The independent mutation anchor is not currently verified",
        })
      }
      const relativePath = ContentRootNTFS.normalizeRelativePath(input.relativePath)
      if (!inMutationScope(grant, relativePath)) {
        return yield* new PathError({
          path: relativePath,
          reason: "outside_scope",
          detail: "The requested mutation path is outside the durable grant scope",
        })
      }
      const result = yield* native(() =>
        ContentRootNTFS.writeFile(grant.anchor, relativePath, input.bytes, {
          create: grant.rights.includes("create"),
          modify: grant.rights.includes("modify"),
        }),
      )
      return { grant, result }
    })

    return Service.of({
      propose,
      approve,
      get,
      list,
      revoke,
      rebind,
      inventory,
      search,
      read,
      prepareLocalRead,
      subscribeInvalidation,
      proposeMutationGrant,
      approveMutationGrant,
      listMutationGrants,
      getMutationGrant,
      revokeMutationGrant,
      authorizeMutation,
      authorizeRename,
      proposeFileMutation,
      writeOnce,
      writeWithGrant,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })

function snapshot<A, E, R>(
  database: DatabaseShape,
  read: (tx: Transaction) => Effect.Effect<A, E | EffectDrizzleQueryError, R>,
) {
  return database
    .transaction(read)
    .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die), Effect.catchTag("SqlError", Effect.die))
}

function native<A>(run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) => {
      if (cause instanceof PathError || cause instanceof UnsupportedFilesystemError) return cause
      return new InvalidTransitionError({ detail: cause instanceof Error ? cause.message : String(cause) })
    },
  })
}

function requireProposal(input: Proposal) {
  if (input instanceof Proposal) return Effect.succeed(input)
  return Effect.fail(
    new InvalidTransitionError({ detail: "ContentRoot approval requires a runtime-inspected proposal" }),
  )
}

function requireMutationProposal(input: MutationProposal) {
  if (input instanceof MutationProposal) return Effect.succeed(input)
  return Effect.fail(new InvalidTransitionError({ detail: "Mutation approval requires a runtime-inspected proposal" }))
}

function requireApproval(input: LearnerApproval, target: LearnerApprovalTarget) {
  if (input instanceof LearnerApproval && input.authorizes(target)) return Effect.succeed(input)
  return Effect.fail(
    new InvalidTransitionError({
      detail: "The system-owned learner confirmation does not match this exact authority request",
    }),
  )
}

function requireBasis(input: string) {
  const value = input.trim()
  if (!value || value.length > 4096)
    throw new InvalidTransitionError({ detail: "Approval basis must be 1-4096 characters" })
  return value
}

function bindingDescriptor(row: BindingRow | MutationGrantRow): ContentRootNTFS.Descriptor {
  const mutation = "canonical_anchor_path" in row
  return {
    platform: row.platform,
    verifierVersion: row.verifier_version,
    canonicalPath: mutation ? row.canonical_anchor_path : row.canonical_path,
    canonicalPathKey: mutation ? row.canonical_anchor_path_key : row.canonical_path_key,
    volumeSerial: row.volume_serial,
    objectID: row.object_id,
    creationTime: row.creation_time,
    changeTime: row.initial_change_time,
    lastWriteTime: row.initial_change_time,
    size: 0,
    kind: "directory",
  }
}

function bindingInfo(row: BindingRow): BindingInfo {
  return {
    id: row.id,
    contentRootID: row.content_root_id,
    descriptor: bindingDescriptor(row),
    timeCreated: row.time_created,
  }
}

function bindingEpisodeInfo(row: BindingEpisodeRow): BindingEpisodeInfo {
  return {
    id: row.id,
    bindingID: row.binding_id,
    ordinal: row.ordinal,
    approvalBasis: row.approval_basis,
    timeStarted: row.time_started,
    timeEnded: row.time_ended ?? undefined,
    endReason: row.end_reason ?? undefined,
  }
}

function grantEpisodeInfo(row: GrantEpisodeRow): GrantEpisodeInfo {
  return {
    id: row.id,
    bindingID: row.binding_id,
    bindingEpisodeID: row.binding_episode_id,
    ordinal: row.ordinal,
    approvalBasis: row.approval_basis,
    timeApproved: row.time_approved,
    closeBasis: row.close_basis ?? undefined,
    timeClosed: row.time_closed ?? undefined,
    timeUpdated: row.time_updated,
  }
}

const requireStoredRoot = Effect.fn("ContentRoot.requireStoredRoot")(function* (
  query: Queryable,
  contentRootID: ContentRootID,
) {
  const root = yield* query.select().from(ContentRootTable).where(eq(ContentRootTable.id, contentRootID)).get()
  if (!root) return yield* new NotFoundError({ entity: "content_root", id: contentRootID })
  const current = yield* query
    .select()
    .from(ContentRootCurrentTable)
    .where(eq(ContentRootCurrentTable.content_root_id, contentRootID))
    .get()
  if (!current)
    return yield* new InvalidTransitionError({ detail: `ContentRoot ${contentRootID} has no current projection` })
  const binding = yield* query
    .select()
    .from(ContentRootBindingTable)
    .where(eq(ContentRootBindingTable.id, current.binding_id))
    .get()
  const bindingEpisode = yield* query
    .select()
    .from(ContentRootBindingEpisodeTable)
    .where(eq(ContentRootBindingEpisodeTable.id, current.binding_episode_id))
    .get()
  if (!binding || !bindingEpisode) {
    return yield* new InvalidTransitionError({
      detail: `ContentRoot ${contentRootID} has an incomplete current binding`,
    })
  }
  const grant = current.grant_episode_id
    ? yield* query
        .select()
        .from(ContentRootGrantEpisodeTable)
        .where(eq(ContentRootGrantEpisodeTable.id, current.grant_episode_id))
        .get()
    : undefined
  const latest = yield* query
    .select()
    .from(ContentRootGrantEpisodeTable)
    .where(eq(ContentRootGrantEpisodeTable.content_root_id, contentRootID))
    .orderBy(desc(ContentRootGrantEpisodeTable.ordinal), desc(ContentRootGrantEpisodeTable.id))
    .limit(1)
    .get()
  if (!latest || (current.grant_episode_id && !grant)) {
    return yield* new InvalidTransitionError({ detail: `ContentRoot ${contentRootID} has incomplete grant history` })
  }
  return {
    id: root.id,
    timeCreated: root.time_created,
    disposition: current.disposition,
    binding: bindingInfo(binding),
    bindingEpisode: bindingEpisodeInfo(bindingEpisode),
    grant: grant ? grantEpisodeInfo(grant) : undefined,
    grantVersion: latest.ordinal,
  } satisfies StoredRoot
})

function materialize(stored: StoredRoot) {
  return native(() => ContentRootNTFS.verifyDirectory(stored.binding.descriptor)).pipe(
    Effect.map((verification) => ({ ...stored, verification })),
  )
}

function localRelativePath(root: ContentRootNTFS.Descriptor, requested: string) {
  return Effect.gen(function* () {
    const target = win32.isAbsolute(requested)
      ? (yield* native(() => ContentRootNTFS.inspectExisting(requested))).canonicalPath
      : undefined
    return yield* Effect.try({
      try: () => {
        const relative = target ? win32.relative(root.canonicalPath, target) : requested
        const normalized = ContentRootNTFS.normalizeRelativePath(relative)
        const resolved = ContentRootNTFS.containsPath(root, normalized)
        if (
          win32.relative(root.canonicalPath, resolved).startsWith("..") ||
          (target && resolved.toLocaleLowerCase("und") !== target.toLocaleLowerCase("und"))
        ) {
          throw new Error("The requested path escapes its exact local-read root")
        }
        return normalized
      },
      catch: (cause) =>
        new PathError({
          path: requested,
          reason: "outside_scope",
          detail: cause instanceof Error ? cause.message : "The requested path is outside its exact local-read root",
        }),
    })
  })
}

const approveStored = Effect.fn("ContentRoot.approveStored")(function* (
  tx: Transaction,
  descriptor: ContentRootNTFS.Descriptor,
  basis: string,
) {
  const exact = yield* exactBinding(tx, descriptor)
  if (exact) {
    yield* requireComparableVerifier(exact, descriptor)
    const current = yield* requireStoredRoot(tx, exact.content_root_id)
    if (current.binding.id !== exact.id) {
      return yield* new InvalidTransitionError({
        detail: "This exact directory binding is historical; explicitly rebind its ContentRoot before reuse",
      })
    }
    if (current.disposition === "active") return current
    return yield* appendGrant(tx, current, basis)
  }

  const ambiguous = yield* bindingsSharingPathOrObject(tx, descriptor)
  if (ambiguous.length > 0) {
    return yield* new ConflictError({
      entity: "binding",
      id: ambiguous[0]!.id,
      detail: "The path or directory object already belongs to ContentRoot history; explicit rebind is required",
    })
  }

  const contentRootID = createContentRootID()
  const bindingID = createBindingID()
  const bindingEpisodeID = createBindingEpisodeID()
  const grantEpisodeID = createGrantEpisodeID()
  const time = Date.now()
  yield* tx.insert(ContentRootTable).values({ id: contentRootID, time_created: time })
  yield* tx.insert(ContentRootBindingTable).values(bindingValues(contentRootID, bindingID, descriptor, time))
  yield* tx.insert(ContentRootBindingEpisodeTable).values({
    id: bindingEpisodeID,
    content_root_id: contentRootID,
    binding_id: bindingID,
    ordinal: 1,
    approval_basis: basis,
    time_started: time,
  })
  yield* tx.insert(ContentRootGrantEpisodeTable).values({
    id: grantEpisodeID,
    content_root_id: contentRootID,
    binding_id: bindingID,
    binding_episode_id: bindingEpisodeID,
    ordinal: 1,
    approval_basis: basis,
    time_approved: time,
    time_updated: time,
  })
  yield* tx.insert(ContentRootCurrentTable).values({
    content_root_id: contentRootID,
    binding_id: bindingID,
    binding_episode_id: bindingEpisodeID,
    grant_episode_id: grantEpisodeID,
    disposition: "active",
    time_updated: time,
  })
  yield* LearningFrontier.advance(tx, { time })
  return yield* requireStoredRoot(tx, contentRootID)
})

const appendGrant = Effect.fn("ContentRoot.appendGrant")(function* (
  tx: Transaction,
  current: StoredRoot,
  basis: string,
) {
  if (current.grant) return current
  const id = createGrantEpisodeID()
  const time = Date.now()
  yield* tx.insert(ContentRootGrantEpisodeTable).values({
    id,
    content_root_id: current.id,
    binding_id: current.binding.id,
    binding_episode_id: current.bindingEpisode.id,
    ordinal: current.grantVersion + 1,
    approval_basis: basis,
    time_approved: time,
    time_updated: time,
  })
  yield* tx
    .update(ContentRootCurrentTable)
    .set({ grant_episode_id: id, disposition: "active", time_updated: time })
    .where(eq(ContentRootCurrentTable.content_root_id, current.id))
  yield* LearningFrontier.advance(tx, { time })
  return yield* requireStoredRoot(tx, current.id)
})

const revokeStored = Effect.fn("ContentRoot.revokeStored")(function* (
  tx: Transaction,
  contentRootID: ContentRootID,
  expectedVersion: number,
  basis: string,
) {
  const current = yield* requireStoredRoot(tx, contentRootID)
  if (current.grantVersion !== expectedVersion) {
    return yield* new ConflictError({
      entity: "grant_episode",
      id: current.grant?.id ?? contentRootID,
      detail: "Observation grant version changed",
      expectedVersion,
      currentVersion: current.grantVersion,
    })
  }
  if (!current.grant) return { stored: current, invalidated: false }
  const time = Date.now()
  const closed = yield* tx
    .update(ContentRootGrantEpisodeTable)
    .set({ close_basis: basis, time_closed: time, time_updated: time })
    .where(
      and(
        eq(ContentRootGrantEpisodeTable.id, current.grant.id),
        eq(ContentRootGrantEpisodeTable.ordinal, expectedVersion),
      ),
    )
    .returning({ id: ContentRootGrantEpisodeTable.id })
    .get()
  if (!closed) {
    return yield* new ConflictError({
      entity: "grant_episode",
      id: current.grant.id,
      detail: "Observation grant changed concurrently",
      expectedVersion,
    })
  }
  yield* tx
    .update(ContentRootCurrentTable)
    .set({ grant_episode_id: null, disposition: "revoked", time_updated: time })
    .where(
      and(
        eq(ContentRootCurrentTable.content_root_id, current.id),
        eq(ContentRootCurrentTable.grant_episode_id, current.grant.id),
      ),
    )
  yield* LearningFrontier.advance(tx, { time })
  return { stored: yield* requireStoredRoot(tx, contentRootID), invalidated: true }
})

const rebindStored = Effect.fn("ContentRoot.rebindStored")(function* (
  tx: Transaction,
  input: {
    contentRootID: ContentRootID
    expectedBindingVersion: number
    expectedGrantVersion: number
    descriptor: ContentRootNTFS.Descriptor
    basis: string
  },
) {
  const current = yield* requireStoredRoot(tx, input.contentRootID)
  if (current.bindingEpisode.ordinal !== input.expectedBindingVersion) {
    return yield* new ConflictError({
      entity: "binding_episode",
      id: current.bindingEpisode.id,
      detail: "Root binding version changed",
      expectedVersion: input.expectedBindingVersion,
      currentVersion: current.bindingEpisode.ordinal,
    })
  }
  if (current.grantVersion !== input.expectedGrantVersion) {
    return yield* new ConflictError({
      entity: "grant_episode",
      id: current.grant?.id ?? current.id,
      detail: "Observation grant version changed",
      expectedVersion: input.expectedGrantVersion,
      currentVersion: current.grantVersion,
    })
  }

  const exact = yield* exactBinding(tx, input.descriptor)
  if (exact) yield* requireComparableVerifier(exact, input.descriptor)
  if (exact?.content_root_id !== undefined && exact.content_root_id !== current.id) {
    return yield* new ConflictError({
      entity: "binding",
      id: exact.id,
      detail: "The destination exact binding belongs to another ContentRoot",
    })
  }
  if (exact?.id === current.binding.id) {
    if (current.grant) return { stored: current, invalidated: false }
    return { stored: yield* appendGrant(tx, current, input.basis), invalidated: false }
  }

  const ambiguous = yield* bindingsSharingPathOrObject(tx, input.descriptor)
  const conflict = ambiguous.find((binding) => binding.content_root_id !== current.id)
  if (conflict) {
    return yield* new ConflictError({
      entity: "binding",
      id: conflict.id,
      detail: "The destination path or directory object belongs to another ContentRoot",
    })
  }

  const time = Date.now()
  if (current.grant) {
    yield* tx
      .update(ContentRootGrantEpisodeTable)
      .set({ close_basis: "explicit_rebind", time_closed: time, time_updated: time })
      .where(eq(ContentRootGrantEpisodeTable.id, current.grant.id))
  }
  yield* tx
    .update(ContentRootBindingEpisodeTable)
    .set({ time_ended: time, end_reason: "explicit_rebind" })
    .where(eq(ContentRootBindingEpisodeTable.id, current.bindingEpisode.id))

  const bindingID = exact?.id ?? createBindingID()
  if (!exact) {
    yield* tx.insert(ContentRootBindingTable).values(bindingValues(current.id, bindingID, input.descriptor, time))
  }
  const bindingEpisodeID = createBindingEpisodeID()
  const grantEpisodeID = createGrantEpisodeID()
  yield* tx.insert(ContentRootBindingEpisodeTable).values({
    id: bindingEpisodeID,
    content_root_id: current.id,
    binding_id: bindingID,
    ordinal: current.bindingEpisode.ordinal + 1,
    approval_basis: input.basis,
    time_started: time,
  })
  yield* tx.insert(ContentRootGrantEpisodeTable).values({
    id: grantEpisodeID,
    content_root_id: current.id,
    binding_id: bindingID,
    binding_episode_id: bindingEpisodeID,
    ordinal: current.grantVersion + 1,
    approval_basis: input.basis,
    time_approved: time,
    time_updated: time,
  })
  yield* tx
    .update(ContentRootCurrentTable)
    .set({
      binding_id: bindingID,
      binding_episode_id: bindingEpisodeID,
      grant_episode_id: grantEpisodeID,
      disposition: "active",
      time_updated: time,
    })
    .where(eq(ContentRootCurrentTable.content_root_id, current.id))
  yield* LearningFrontier.advance(tx, { time })
  return { stored: yield* requireStoredRoot(tx, current.id), invalidated: true }
})

function bindingValues(
  contentRootID: ContentRootID,
  bindingID: BindingID,
  descriptor: ContentRootNTFS.Descriptor,
  time: number,
) {
  return {
    id: bindingID,
    content_root_id: contentRootID,
    canonical_path: descriptor.canonicalPath,
    canonical_path_key: descriptor.canonicalPathKey,
    platform: descriptor.platform,
    volume_serial: descriptor.volumeSerial,
    object_id: descriptor.objectID,
    creation_time: descriptor.creationTime,
    initial_change_time: descriptor.changeTime,
    verifier_version: descriptor.verifierVersion,
    time_created: time,
  }
}

const exactBinding = Effect.fn("ContentRoot.exactBinding")(function* (
  query: Queryable,
  descriptor: ContentRootNTFS.Descriptor,
) {
  return yield* query
    .select()
    .from(ContentRootBindingTable)
    .where(
      and(
        eq(ContentRootBindingTable.canonical_path_key, descriptor.canonicalPathKey),
        eq(ContentRootBindingTable.platform, descriptor.platform),
        eq(ContentRootBindingTable.volume_serial, descriptor.volumeSerial),
        eq(ContentRootBindingTable.object_id, descriptor.objectID),
        eq(ContentRootBindingTable.creation_time, descriptor.creationTime),
      ),
    )
    .get()
})

function requireComparableVerifier(row: BindingRow, descriptor: ContentRootNTFS.Descriptor) {
  if (row.verifier_version === descriptor.verifierVersion) return Effect.void
  return Effect.fail(
    new InvalidTransitionError({
      detail: `Binding verifier version ${row.verifier_version} cannot be compared with runtime verifier version ${descriptor.verifierVersion}; identity migration or reapproval is required`,
    }),
  )
}

const bindingsSharingPathOrObject = Effect.fn("ContentRoot.bindingsSharingPathOrObject")(function* (
  query: Queryable,
  descriptor: ContentRootNTFS.Descriptor,
) {
  return yield* query
    .select()
    .from(ContentRootBindingTable)
    .where(
      or(
        eq(ContentRootBindingTable.canonical_path_key, descriptor.canonicalPathKey),
        and(
          eq(ContentRootBindingTable.platform, descriptor.platform),
          eq(ContentRootBindingTable.volume_serial, descriptor.volumeSerial),
          eq(ContentRootBindingTable.object_id, descriptor.objectID),
          eq(ContentRootBindingTable.creation_time, descriptor.creationTime),
        ),
      ),
    )
})

const requireStoredMutationGrant = Effect.fn("ContentRoot.requireStoredMutationGrant")(function* (
  query: Queryable,
  mutationGrantID: MutationGrantID,
) {
  const row = yield* query
    .select()
    .from(ContentMutationGrantTable)
    .where(eq(ContentMutationGrantTable.id, mutationGrantID))
    .get()
  if (!row) return yield* new NotFoundError({ entity: "mutation_grant", id: mutationGrantID })
  return mutationGrantInfo(row)
})

function mutationGrantInfo(row: MutationGrantRow): StoredMutationGrant {
  const rights: MutationRight[] = []
  if (row.allow_create) rights.push("create")
  if (row.allow_modify) rights.push("modify")
  if (row.allow_delete) rights.push("delete")
  if (row.allow_rename_source) rights.push("rename_source")
  if (row.allow_rename_destination) rights.push("rename_destination")
  return {
    id: row.id,
    anchor: bindingDescriptor(row),
    relativeScope: row.relative_scope,
    scopeKind: row.scope_kind,
    rights,
    version: row.version,
    disposition: row.disposition,
    approvalBasis: row.approval_basis,
    timeApproved: row.time_approved,
    revocationBasis: row.revocation_basis ?? undefined,
    timeRevoked: row.time_revoked ?? undefined,
    timeUpdated: row.time_updated,
    provenance:
      row.provenance_content_root_id && row.provenance_binding_id
        ? { contentRootID: row.provenance_content_root_id, bindingID: row.provenance_binding_id }
        : undefined,
  }
}

function materializeMutationGrant(stored: StoredMutationGrant) {
  return native(() => ContentRootNTFS.verifyDirectory(stored.anchor)).pipe(
    Effect.map((verification) => ({ ...stored, verification })),
  )
}

function inMutationScope(grant: MutationGrantInfo, relativePath: string) {
  if (grant.scopeKind === "exact") return grant.relativeScope === relativePath
  return relativePath === grant.relativeScope || relativePath.startsWith(`${grant.relativeScope}/`)
}

function resolveBudgets(input?: Partial<InventoryBudgets>) {
  const result = { ...DEFAULT_BUDGETS, ...input }
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new InvalidTransitionError({ detail: `Inventory budget ${name} must be a positive safe integer` })
    }
  }
  return result
}

function inventoryAuthorized(
  stored: StoredRoot,
  grant: GrantEpisodeInfo,
  requestedScope?: string,
  budgets = DEFAULT_BUDGETS,
  startedAt = Date.now(),
) {
  return Effect.gen(function* () {
    const scope =
      !requestedScope || requestedScope === "." ? "." : ContentRootNTFS.normalizeRelativePath(requestedScope)
    const queue = [{ path: scope, depth: 0 }]
    const entries: InventoryEntry[] = []
    const frontier: string[] = []
    const truncationReasons = new Set<string>()
    const visited = { entries: 0, directories: 0, files: 0 }
    let returnedBytes = 0

    scan: while (queue.length > 0) {
      yield* Effect.yieldNow
      if (durationExhausted(startedAt, budgets)) {
        truncationReasons.add("elapsed_time")
        frontier.push(...queue.map((item) => item.path))
        break
      }
      if (visited.directories >= budgets.maxDirectories) {
        truncationReasons.add("directory_count")
        frontier.push(...queue.map((item) => item.path))
        break
      }
      const directory = queue.shift()!
      visited.directories++
      const names = yield* native(() => ContentRootNTFS.listDirectory(stored.binding.descriptor, directory.path))
      for (const name of names) {
        yield* Effect.yieldNow
        if (durationExhausted(startedAt, budgets)) {
          truncationReasons.add("elapsed_time")
          frontier.push(directory.path, ...queue.map((item) => item.path))
          break scan
        }
        const authorityName = name.toLowerCase()
        if (PROTECTED_NAMES.has(authorityName) || IGNORED_NAMES.has(authorityName)) continue
        if (visited.entries >= budgets.maxEntries) {
          truncationReasons.add("entry_count")
          frontier.push(joinRelative(directory.path, name))
          frontier.push(...queue.map((item) => item.path))
          break scan
        }
        const relativePath = joinRelative(directory.path, name)
        if (Buffer.byteLength(relativePath, "utf8") > budgets.maxPathBytes) {
          truncationReasons.add("path_bytes")
          frontier.push(relativePath)
          continue
        }
        const descriptor = yield* native(() => ContentRootNTFS.inspectRelative(stored.binding.descriptor, relativePath))
        visited.entries++
        if (descriptor.kind === "directory") {
          const entry = inventoryEntry(stored, grant, relativePath, descriptor)
          const bytes = Buffer.byteLength(JSON.stringify(entry), "utf8")
          if (returnedBytes + bytes > budgets.maxReturnedBytes) {
            truncationReasons.add("returned_bytes")
            frontier.push(relativePath)
            frontier.push(...queue.map((item) => item.path))
            break scan
          }
          entries.push(entry)
          returnedBytes += bytes
          if (directory.depth >= budgets.maxDepth) {
            truncationReasons.add("depth")
            frontier.push(relativePath)
            continue
          }
          queue.push({ path: relativePath, depth: directory.depth + 1 })
          continue
        }
        visited.files++
        if (visited.files > budgets.maxFiles) {
          truncationReasons.add("file_count")
          frontier.push(relativePath)
          frontier.push(...queue.map((item) => item.path))
          break scan
        }
        const entry = inventoryEntry(stored, grant, relativePath, descriptor, budgets.maxFileBytes)
        const bytes = Buffer.byteLength(JSON.stringify(entry), "utf8")
        if (returnedBytes + bytes > budgets.maxReturnedBytes) {
          truncationReasons.add("returned_bytes")
          frontier.push(relativePath)
          frontier.push(...queue.map((item) => item.path))
          break scan
        }
        entries.push(entry)
        returnedBytes += bytes
      }
      queue.sort((left, right) => comparePath(left.path, right.path))
    }

    entries.sort((left, right) => comparePath(left.relativePath, right.relativePath))
    frontier.sort(comparePath)
    return {
      contentRootID: stored.id,
      bindingID: stored.binding.id,
      grantEpisodeID: grant.id,
      grantVersion: grant.ordinal,
      requestedScope: scope,
      budgets,
      ignoredPaths: [...IGNORED_NAMES],
      protectedPaths: [...PROTECTED_NAMES],
      entries,
      visited,
      returnedBytes,
      truncated: truncationReasons.size > 0,
      truncationReasons: [...truncationReasons].sort(),
      frontier,
    } satisfies InventoryResult
  })
}

function inventoryEntry(
  stored: StoredRoot,
  grant: GrantEpisodeInfo,
  relativePath: string,
  descriptor: ContentRootNTFS.Descriptor,
  maxFileBytes = DEFAULT_BUDGETS.maxFileBytes,
) {
  const mediaType = descriptor.kind === "file" ? ContentRootNTFS.detectMediaType(relativePath) : undefined
  const supported =
    descriptor.kind === "directory" || (mediaType !== "application/octet-stream" && descriptor.size <= maxFileBytes)
  return {
    key: candidateKey({
      contentRootID: stored.id,
      bindingID: stored.binding.id,
      grantEpisodeID: grant.id,
      relativePath,
      descriptor,
    }),
    relativePath,
    kind: descriptor.kind,
    size: descriptor.size,
    mediaType,
    supported,
    objectID: descriptor.objectID,
  } satisfies InventoryEntry
}

function searchAuthorized(
  inventory: InventoryResult,
  descriptor: ContentRootNTFS.Descriptor,
  query: string,
  maxMatches: number,
  maxContextBytes: number,
  startedAt: number,
) {
  return Effect.gen(function* () {
    if (
      !Number.isSafeInteger(maxMatches) ||
      maxMatches < 1 ||
      !Number.isSafeInteger(maxContextBytes) ||
      maxContextBytes < 1
    ) {
      return yield* new InvalidTransitionError({ detail: "Search limits must be positive safe integers" })
    }
    const matches: SearchResult["matches"] = []
    const reasons = new Set<string>(inventory.truncationReasons)
    const normalizedQuery = query.toLowerCase()
    let contextBytes = 0
    scan: for (const entry of inventory.entries) {
      yield* Effect.yieldNow
      if (durationExhausted(startedAt, inventory.budgets)) {
        reasons.add("elapsed_time")
        break
      }
      if (entry.kind !== "file" || !entry.supported || !entry.mediaType?.startsWith("text/")) continue
      if (matches.length >= maxMatches) {
        reasons.add("match_count")
        break
      }
      if (contextBytes >= maxContextBytes) {
        reasons.add("context_bytes")
        break
      }
      const prepared = yield* native(() =>
        ContentRootNTFS.prepareFile(descriptor, entry.relativePath, inventory.budgets.maxFileBytes),
      )
      if (durationExhausted(startedAt, inventory.budgets)) {
        reasons.add("elapsed_time")
        break
      }
      if (prepared.result !== "present") continue
      if (
        candidateKey({
          contentRootID: inventory.contentRootID,
          bindingID: inventory.bindingID,
          grantEpisodeID: inventory.grantEpisodeID,
          relativePath: entry.relativePath,
          descriptor: prepared.descriptor,
        }) !== entry.key
      ) {
        reasons.add("stale_member")
        continue
      }
      const lines = new TextDecoder("utf-8").decode(prepared.bytes).split(/\r?\n/)
      if (durationExhausted(startedAt, inventory.budgets)) {
        reasons.add("elapsed_time")
        break
      }
      for (const [index, line] of lines.entries()) {
        if ((index & 63) === 0) yield* Effect.yieldNow
        if (durationExhausted(startedAt, inventory.budgets)) {
          reasons.add("elapsed_time")
          break scan
        }
        if (!line.toLowerCase().includes(normalizedQuery)) continue
        const text = line.slice(0, 2000)
        const bytes = Buffer.byteLength(text, "utf8")
        if (matches.length >= maxMatches) {
          reasons.add("match_count")
          break
        }
        if (contextBytes + bytes > maxContextBytes) {
          reasons.add("context_bytes")
          break
        }
        matches.push({ key: entry.key, relativePath: entry.relativePath, line: index + 1, text })
        contextBytes += bytes
      }
    }
    return {
      inventory,
      query,
      matches,
      contextBytes,
      truncated: reasons.size > 0,
      truncationReasons: [...reasons].sort(),
    } satisfies SearchResult
  })
}

function durationExhausted(startedAt: number, budgets: InventoryBudgets) {
  return Date.now() - startedAt >= budgets.maxDurationMs
}

function joinRelative(parent: string, child: string) {
  return parent === "." ? child : `${parent}/${child}`
}

function comparePath(left: string, right: string) {
  const insensitive = left.toLowerCase().localeCompare(right.toLowerCase(), "en")
  return insensitive || left.localeCompare(right, "en")
}
