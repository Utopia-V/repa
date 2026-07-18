import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { Effect, Layer, ManagedRuntime } from "effect"
import { eq } from "drizzle-orm"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { ContentRootNTFS } from "@opencode-ai/core/content-root/ntfs"
import {
  ContentMutationGrantTable,
  ContentRootBindingTable,
  ContentRootGrantEpisodeTable,
} from "@opencode-ai/core/content-root/sql"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"

const windowsTest = process.platform === "win32" ? test : test.skip

function appLayer(filename = ":memory:") {
  return LayerNode.compile(LayerNode.group([ContentRoot.node, Database.node]), [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
  ])
}

async function withRuntime<A>(use: (input: { service: ContentRoot.Interface; runtime: ManagedRuntime.ManagedRuntime<ContentRoot.Service | Database.Service, never> }) => Promise<A>) {
  const runtime = ManagedRuntime.make(appLayer())
  try {
    const service = await runtime.runPromise(ContentRoot.Service)
    return await use({ service, runtime })
  } finally {
    await runtime.dispose()
  }
}

async function temporaryDirectory() {
  return mkdtemp(path.join(tmpdir(), "repa-content-root-test-"))
}

function captureFailure(use: () => unknown) {
  try {
    use()
  } catch (error) {
    return error
  }
  throw new Error("Expected the operation to fail")
}

describe("ContentRoot authority", () => {
  test("classifies the closed native-image set used by Representation conversion", () => {
    expect(ContentRootNTFS.detectMediaType("C:\\materials\\diagram.PNG")).toBe("image/png")
    expect(ContentRootNTFS.detectMediaType("C:\\materials\\scan.jpg")).toBe("image/jpeg")
    expect(ContentRootNTFS.detectMediaType("C:\\materials\\scan.JPEG")).toBe("image/jpeg")
    expect(ContentRootNTFS.detectMediaType("C:\\materials\\animation.gif")).toBe("image/gif")
    expect(ContentRootNTFS.detectMediaType("C:\\materials\\figure.webp")).toBe("image/webp")
    expect(ContentRootNTFS.detectMediaType("C:\\materials\\unknown.bin")).toBe("application/octet-stream")
  })

  test("returns a typed unsupported result outside the Windows verifier", async () => {
    const platform = process.platform
    Object.defineProperty(process, "platform", { value: "linux" })
    try {
      await expect(ContentRootNTFS.inspectDirectory("C:\\materials")).rejects.toMatchObject({
        _tag: "ContentRoot.UnsupportedFilesystemError",
        platform: "linux",
      })
      expect(
        await ContentRootNTFS.verifyDirectory({
          platform: "windows_ntfs",
          verifierVersion: ContentRootNTFS.VERIFIER_VERSION,
          canonicalPath: "C:\\materials",
          canonicalPathKey: "c:\\materials",
          volumeSerial: "0",
          objectID: "0",
          creationTime: "0",
          changeTime: "0",
          lastWriteTime: "0",
          size: 0,
          kind: "directory",
        }),
      ).toMatchObject({ status: "unsupported" })
    } finally {
      Object.defineProperty(process, "platform", { value: platform })
    }
  })

  windowsTest("rejects UNC, reserved, and invalid-Unicode authority paths", async () => {
    await expect(ContentRootNTFS.inspectDirectory("\\\\server\\share\\materials")).rejects.toMatchObject({
      _tag: "ContentRoot.PathError",
      reason: "invalid_path",
    })
    expect(captureFailure(() => ContentRootNTFS.normalizeRelativePath("CON/readme.md"))).toMatchObject({
      _tag: "ContentRoot.PathError",
      reason: "invalid_path",
    })
    expect(captureFailure(() => ContentRootNTFS.normalizeRelativePath(`bad-${String.fromCharCode(0xd800)}.md`))).toMatchObject({
      _tag: "ContentRoot.PathError",
      reason: "invalid_path",
    })
  })

  windowsTest("serializes duplicate approval and appends grant episodes after revoke", async () => {
    const directory = await temporaryDirectory()
    const other = await temporaryDirectory()
    try {
      await withRuntime(async ({ service, runtime }) => {
        const proposal = await runtime.runPromise(service.propose(directory))
        const roots = await Promise.all(
          Array.from({ length: 8 }, () =>
            runtime.runPromise(
              service.approve({
                proposal,
                approval: ContentRoot.LearnerApproval.contentRoot(proposal, "learner accepted displayed root"),
              }),
            ),
          ),
        )

        expect(new Set(roots.map((root) => root.id)).size).toBe(1)
        expect(new Set(roots.map((root) => root.grant?.id)).size).toBe(1)
        expect((await runtime.runPromise(service.list())).length).toBe(1)
        const otherProposal = await runtime.runPromise(service.propose(other))
        expect(
          await runtime.runPromise(
            Effect.flip(
              service.approve({
                proposal: otherProposal,
                approval: ContentRoot.LearnerApproval.contentRoot(proposal, "confirmation for the first root only"),
              }),
            ),
          ),
        ).toMatchObject({ _tag: "ContentRoot.InvalidTransitionError" })
        expect((await runtime.runPromise(service.list())).length).toBe(1)

        const revoked = await runtime.runPromise(
          service.revoke({ contentRootID: roots[0]!.id, expectedGrantVersion: 1, basis: "learner revoked" }),
        )
        expect(revoked).toMatchObject({ disposition: "revoked", grantVersion: 1 })
        expect(revoked.grant).toBeUndefined()

        const reapprovalProposal = await runtime.runPromise(service.propose(directory))
        const reapproved = await runtime.runPromise(
          service.approve({
            proposal: reapprovalProposal,
            approval: ContentRoot.LearnerApproval.contentRoot(reapprovalProposal, "learner reapproved same root"),
          }),
        )
        expect(reapproved.id).toBe(roots[0]!.id)
        expect(reapproved.binding.id).toBe(roots[0]!.binding.id)
        expect(reapproved.bindingEpisode.id).toBe(roots[0]!.bindingEpisode.id)
        expect(reapproved).toMatchObject({ disposition: "active", grantVersion: 2 })

        const database = await runtime.runPromise(Database.Service)
        const episodes = await Effect.runPromise(
          database.db
            .select()
            .from(ContentRootGrantEpisodeTable)
            .orderBy(ContentRootGrantEpisodeTable.ordinal),
        )
        expect(episodes).toHaveLength(2)
        expect(episodes[0]).toMatchObject({ ordinal: 1, close_basis: "learner revoked" })
        expect(episodes[1]).toMatchObject({ ordinal: 2, close_basis: null })
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
      await rm(other, { recursive: true, force: true })
    }
  })

  windowsTest("returns an immutable read receipt and requests scoped cancellation on revoke", async () => {
    const directory = await temporaryDirectory()
    await writeFile(path.join(directory, "source.md"), "exact source")
    try {
      await withRuntime(async ({ service, runtime }) => {
        const proposal = await runtime.runPromise(service.propose(directory))
        const root = await runtime.runPromise(
          service.approve({
            proposal,
            approval: ContentRoot.LearnerApproval.contentRoot(proposal, "receipt source root"),
          }),
        )
        const outcome = await runtime.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const invalidation = yield* service.subscribeInvalidation(root.id)
              const read = yield* service.read({
                contentRootID: root.id,
                relativePath: "source.md",
                maxBytes: 1000,
              })
              const revoked = yield* service.revoke({
                contentRootID: root.id,
                expectedGrantVersion: root.grantVersion,
                basis: "cancel admitted conversion",
              })
              return { invalidated: invalidation.aborted, read, revoked }
            }),
          ),
        )

        expect(outcome.invalidated).toBeTrue()
        expect(outcome.read.authorization).toEqual({
          contentRootID: root.id,
          bindingID: root.binding.id,
          bindingEpisodeID: root.bindingEpisode.id,
          bindingEpisodeOrdinal: root.bindingEpisode.ordinal,
          grantEpisodeID: root.grant!.id,
          grantVersion: root.grantVersion,
        })
        expect(outcome.read.observation).toMatchObject({
          result: "present",
          relativePath: "source.md",
          mediaType: "text/markdown",
        })
        expect(outcome.revoked).toMatchObject({ disposition: "revoked", grantVersion: root.grantVersion })
        expect(
          await runtime.runPromise(
            Effect.flip(
              service.read({ contentRootID: root.id, relativePath: "source.md", maxBytes: 1000 }),
            ),
          ),
        ).toMatchObject({ _tag: "ContentRoot.InvalidTransitionError" })
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("suspends replacement and movement until an exact versioned rebind", async () => {
    const parent = await temporaryDirectory()
    const original = path.join(parent, "root")
    const retained = path.join(parent, "retained")
    await mkdir(original)
    try {
      await withRuntime(async ({ service, runtime }) => {
        const initialProposal = await runtime.runPromise(service.propose(original))
        const approved = await runtime.runPromise(
          service.approve({
            proposal: initialProposal,
            approval: ContentRoot.LearnerApproval.contentRoot(initialProposal, "initial root"),
          }),
        )

        await rename(original, retained)
        await mkdir(original)
        const replaced = await runtime.runPromise(service.get(approved.id))
        expect(replaced.verification.status).toBe("identity_mismatch")

        const replacement = await runtime.runPromise(service.propose(original))
        const generic = await runtime.runPromise(
          Effect.flip(
            service.approve({
              proposal: replacement,
              approval: ContentRoot.LearnerApproval.contentRoot(replacement, "replacement generic approval"),
            }),
          ),
        )
        expect(generic).toMatchObject({ _tag: "ContentRoot.ConflictError", entity: "binding" })

        const rebindOutcome = await runtime.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const invalidation = yield* service.subscribeInvalidation(approved.id)
              const rebound = yield* service.rebind({
                contentRootID: approved.id,
                expectedBindingVersion: 1,
                expectedGrantVersion: 1,
                proposal: replacement,
                approval: ContentRoot.LearnerApproval.contentRootRebind(
                  {
                    proposal: replacement,
                    contentRootID: approved.id,
                    expectedBindingVersion: 1,
                    expectedGrantVersion: 1,
                  },
                  "explicit replacement rebind",
                ),
              })
              return { invalidated: invalidation.aborted, rebound }
            }),
          ),
        )
        expect(rebindOutcome.invalidated).toBeTrue()
        const rebound = rebindOutcome.rebound
        expect(rebound.id).toBe(approved.id)
        expect(rebound.binding.id).not.toBe(approved.binding.id)
        expect(rebound.bindingEpisode.ordinal).toBe(2)
        expect(rebound.grantVersion).toBe(2)

        const staleProposal = await runtime.runPromise(service.propose(retained))
        const stale = await runtime.runPromise(
          Effect.flip(
            service.rebind({
              contentRootID: approved.id,
              expectedBindingVersion: 1,
              expectedGrantVersion: 1,
              proposal: staleProposal,
              approval: ContentRoot.LearnerApproval.contentRootRebind(
                {
                  proposal: staleProposal,
                  contentRootID: approved.id,
                  expectedBindingVersion: 1,
                  expectedGrantVersion: 1,
                },
                "stale rebind",
              ),
            }),
          ),
        )
        expect(stale).toMatchObject({
          _tag: "ContentRoot.ConflictError",
          entity: "binding_episode",
          expectedVersion: 1,
          currentVersion: 2,
        })
      })
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  windowsTest("keeps durable mutation grants independently anchored and checks both rename paths", async () => {
    const parent = await temporaryDirectory()
    const observed = path.join(parent, "observed")
    const reboundTarget = path.join(parent, "rebound")
    await mkdir(path.join(observed, "notes"), { recursive: true })
    await mkdir(path.join(observed, "archive"), { recursive: true })
    await writeFile(path.join(observed, "notes", "week-1.md"), "before")
    await mkdir(reboundTarget)
    try {
      await withRuntime(async ({ service, runtime }) => {
        const rootProposal = await runtime.runPromise(service.propose(observed))
        const root = await runtime.runPromise(
          service.approve({
            proposal: rootProposal,
            approval: ContentRoot.LearnerApproval.contentRoot(rootProposal, "observe root"),
          }),
        )
        const grantProposal = await runtime.runPromise(
          service.proposeMutationGrant({
            anchorPath: observed,
            relativeScope: "notes",
            scopeKind: "subtree",
            rights: ["modify", "rename_source"],
            provenance: { contentRootID: root.id, bindingID: root.binding.id },
          }),
        )
        const grant = await runtime.runPromise(
          service.approveMutationGrant({
            proposal: grantProposal,
            approval: ContentRoot.LearnerApproval.mutationGrant(grantProposal, "write notes only"),
          }),
        )

        await runtime.runPromise(
          service.revoke({ contentRootID: root.id, expectedGrantVersion: 1, basis: "stop observation" }),
        )
        expect((await runtime.runPromise(service.getMutationGrant(grant.id))).disposition).toBe("active")

        const reapprovalProposal = await runtime.runPromise(service.propose(observed))
        const reapproved = await runtime.runPromise(
          service.approve({
            proposal: reapprovalProposal,
            approval: ContentRoot.LearnerApproval.contentRoot(reapprovalProposal, "observe again"),
          }),
        )
        const reboundProposal = await runtime.runPromise(service.propose(reboundTarget))
        await runtime.runPromise(
          service.rebind({
            contentRootID: root.id,
            expectedBindingVersion: 1,
            expectedGrantVersion: reapproved.grantVersion,
            proposal: reboundProposal,
            approval: ContentRoot.LearnerApproval.contentRootRebind(
              {
                proposal: reboundProposal,
                contentRootID: root.id,
                expectedBindingVersion: 1,
                expectedGrantVersion: reapproved.grantVersion,
              },
              "move observation authority only",
            ),
          }),
        )
        const independent = await runtime.runPromise(service.getMutationGrant(grant.id))
        expect(independent.anchor.canonicalPath).toBe(grant.anchor.canonicalPath)
        expect(independent.verification.status).toBe("verified")

        const allowed = await runtime.runPromise(
          service.authorizeMutation({
            mutationGrantID: grant.id,
            expectedVersion: 1,
            right: "modify",
            relativePath: "notes/week-1.md",
          }),
        )
        expect(allowed.canonicalPath).toBe(path.join(grant.anchor.canonicalPath, "notes", "week-1.md"))
        expect(
          await runtime.runPromise(
            Effect.flip(
              service.authorizeMutation({
                mutationGrantID: grant.id,
                expectedVersion: 1,
                right: "modify",
                relativePath: "outside.md",
              }),
            ),
          ),
        ).toMatchObject({ _tag: "ContentRoot.PathError", reason: "outside_scope" })

        const destinationProposal = await runtime.runPromise(
          service.proposeMutationGrant({
            anchorPath: observed,
            relativeScope: "archive",
            scopeKind: "subtree",
            rights: ["rename_destination"],
          }),
        )
        const destination = await runtime.runPromise(
          Effect.flip(
            service.approveMutationGrant({
              proposal: destinationProposal,
              approval: ContentRoot.LearnerApproval.mutationGrant(grantProposal, "notes scope only"),
            }),
          ),
        )
        expect(destination).toMatchObject({ _tag: "ContentRoot.InvalidTransitionError" })
        const approvedDestination = await runtime.runPromise(
          service.approveMutationGrant({
            proposal: destinationProposal,
            approval: ContentRoot.LearnerApproval.mutationGrant(destinationProposal, "archive destinations"),
          }),
        )
        const renameAuthorization = await runtime.runPromise(
          service.authorizeRename({
            source: { mutationGrantID: grant.id, expectedVersion: 1, relativePath: "notes/week-1.md" },
            destination: {
              mutationGrantID: approvedDestination.id,
              expectedVersion: 1,
              relativePath: "archive/week-1.md",
            },
          }),
        )
        expect(renameAuthorization.grants.map((item) => item.id)).toEqual([grant.id, approvedDestination.id])

        const written = await runtime.runPromise(
          service.writeWithGrant({
            mutationGrantID: grant.id,
            expectedVersion: 1,
            relativePath: "notes/week-1.md",
            bytes: new TextEncoder().encode("after"),
          }),
        )
        expect(written.result).toMatchObject({ operation: "modify", byteLength: 5 })
        expect(await readFile(path.join(observed, "notes", "week-1.md"), "utf8")).toBe("after")

        const once = await runtime.runPromise(service.proposeFileMutation(path.join(observed, "once.md")))
        const onceApproval = ContentRoot.OnceMutationApproval.directLearnerInvocation(once, "terminal invocation")
        expect(
          await runtime.runPromise(
            service.writeOnce({ proposal: once, approval: onceApproval, bytes: new TextEncoder().encode("once") }),
          ),
        ).toMatchObject({ operation: "create", byteLength: 4 })
        expect(
          await runtime.runPromise(
            Effect.flip(
              service.writeOnce({ proposal: once, approval: onceApproval, bytes: new TextEncoder().encode("twice") }),
            ),
          ),
        ).toMatchObject({ _tag: "ContentRoot.InvalidTransitionError" })

        const stale = await runtime.runPromise(service.proposeFileMutation(path.join(observed, "once.md")))
        await rm(path.join(observed, "once.md"))
        await writeFile(path.join(observed, "once.md"), "replacement")
        expect(
          await runtime.runPromise(
            Effect.flip(
              service.writeOnce({
                proposal: stale,
                approval: ContentRoot.OnceMutationApproval.directLearnerInvocation(stale, "stale invocation"),
                bytes: new TextEncoder().encode("forbidden"),
              }),
            ),
          ),
        ).toMatchObject({ _tag: "ContentRoot.PathError", reason: "stale" })

        await rename(observed, path.join(parent, "old-anchor"))
        await mkdir(observed)
        expect((await runtime.runPromise(service.getMutationGrant(grant.id))).verification.status).toBe(
          "identity_mismatch",
        )
      })
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  windowsTest("maps one durable learner approval to one revocable grant across exact retries", async () => {
    const directory = await temporaryDirectory()
    try {
      await withRuntime(async ({ service, runtime }) => {
        const proposal = await runtime.runPromise(
          service.proposeMutationGrant({
            anchorPath: directory,
            relativeScope: "notes.md",
            scopeKind: "exact",
            rights: ["create", "modify"],
          }),
        )
        const approval = ContentRoot.LearnerApproval.mutationGrant(proposal, "one durable notes grant")
        const [first, retry] = await Promise.all([
          runtime.runPromise(service.approveMutationGrant({ proposal, approval })),
          runtime.runPromise(service.approveMutationGrant({ proposal, approval })),
        ])

        expect(retry.id).toBe(first.id)
        expect((await runtime.runPromise(service.listMutationGrants())).filter((grant) => grant.disposition === "active")).toHaveLength(1)

        const revoked = await runtime.runPromise(
          service.revokeMutationGrant({
            mutationGrantID: first.id,
            expectedVersion: first.version,
            basis: "learner revoked the one grant",
          }),
        )
        const replay = await runtime.runPromise(service.approveMutationGrant({ proposal, approval }))
        expect(replay).toMatchObject({ id: first.id, disposition: "revoked", version: revoked.version })
        expect((await runtime.runPromise(service.listMutationGrants())).filter((grant) => grant.disposition === "active")).toEqual([])
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("preserves unknown persisted verifier versions and fails roots and mutation anchors closed", async () => {
    const directory = await temporaryDirectory()
    try {
      await withRuntime(async ({ service, runtime }) => {
        const rootProposal = await runtime.runPromise(service.propose(directory))
        const root = await runtime.runPromise(
          service.approve({
            proposal: rootProposal,
            approval: ContentRoot.LearnerApproval.contentRoot(rootProposal, "versioned root"),
          }),
        )
        const mutationProposal = await runtime.runPromise(
          service.proposeMutationGrant({
            anchorPath: directory,
            relativeScope: "notes.md",
            scopeKind: "exact",
            rights: ["create"],
          }),
        )
        const mutation = await runtime.runPromise(
          service.approveMutationGrant({
            proposal: mutationProposal,
            approval: ContentRoot.LearnerApproval.mutationGrant(mutationProposal, "versioned mutation anchor"),
          }),
        )
        const database = await runtime.runPromise(Database.Service)
        await runtime.runPromise(
          database.db
            .update(ContentRootBindingTable)
            .set({ verifier_version: 999 })
            .where(eq(ContentRootBindingTable.id, root.binding.id)),
        )
        await runtime.runPromise(
          database.db
            .update(ContentMutationGrantTable)
            .set({ verifier_version: 999 })
            .where(eq(ContentMutationGrantTable.id, mutation.id)),
        )

        const persistedRoot = await runtime.runPromise(service.get(root.id))
        expect(persistedRoot.binding.descriptor.verifierVersion).toBe(999)
        expect(persistedRoot.verification).toMatchObject({ status: "unsupported" })
        expect(
          await runtime.runPromise(Effect.flip(service.inventory({ contentRootID: root.id }))),
        ).toMatchObject({ _tag: "ContentRoot.PathError", reason: "unreadable" })

        const persistedMutation = await runtime.runPromise(service.getMutationGrant(mutation.id))
        expect(persistedMutation.anchor.verifierVersion).toBe(999)
        expect(persistedMutation.verification).toMatchObject({ status: "unsupported" })
        expect(
          await runtime.runPromise(
            Effect.flip(
              service.authorizeMutation({
                mutationGrantID: mutation.id,
                expectedVersion: mutation.version,
                right: "create",
                relativePath: "notes.md",
              }),
            ),
          ),
        ).toMatchObject({ _tag: "ContentRoot.PathError", reason: "unreadable" })

        const retryProposal = await runtime.runPromise(service.propose(directory))
        expect(
          await runtime.runPromise(
            Effect.flip(
              service.approve({
                proposal: retryProposal,
                approval: ContentRoot.LearnerApproval.contentRoot(retryProposal, "must migrate first"),
              }),
            ),
          ),
        ).toMatchObject({ _tag: "ContentRoot.InvalidTransitionError" })
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("bounds deterministic inventory/search/read and rejects traversal and reparse entries", async () => {
    const parent = await temporaryDirectory()
    const rootPath = path.join(parent, "root")
    const outside = path.join(parent, "outside")
    await mkdir(path.join(rootPath, "b"), { recursive: true })
    await mkdir(path.join(rootPath, "a", "deep"), { recursive: true })
    await mkdir(path.join(rootPath, ".Git"), { recursive: true })
    await mkdir(path.join(rootPath, "NODE_MODULES"), { recursive: true })
    await mkdir(outside)
    await writeFile(path.join(rootPath, "b", "two.md"), "second needle")
    await writeFile(path.join(rootPath, "a", "one.md"), "first needle\nnext")
    await writeFile(path.join(rootPath, "a", "deep", "three.md"), "third")
    await writeFile(path.join(rootPath, "a", "binary.bin"), new Uint8Array([0, 1, 2]))
    await writeFile(path.join(rootPath, ".Git", "protected.md"), "must not be observed")
    await writeFile(path.join(rootPath, "NODE_MODULES", "ignored.md"), "must not be observed")
    await symlink(outside, path.join(rootPath, "link"), "junction")
    try {
      await withRuntime(async ({ service, runtime }) => {
        const proposal = await runtime.runPromise(service.propose(rootPath))
        const root = await runtime.runPromise(
          service.approve({
            proposal,
            approval: ContentRoot.LearnerApproval.contentRoot(proposal, "learning material root"),
          }),
        )
        const budgets = {
          maxDepth: 3,
          maxEntries: 20,
          maxDirectories: 10,
          maxFiles: 10,
          maxDurationMs: 5000,
          maxPathBytes: 1000,
          maxReturnedBytes: 10000,
          maxFileBytes: 1000,
        }
        const reparse = await runtime.runPromise(Effect.flip(service.inventory({ contentRootID: root.id, budgets })))
        expect(reparse).toMatchObject({ _tag: "ContentRoot.PathError", reason: "reparse_point" })

        await rm(path.join(rootPath, "link"), { recursive: true, force: true })
        const inventory = await runtime.runPromise(service.inventory({ contentRootID: root.id, budgets }))
        expect(inventory.entries.map((entry) => entry.relativePath)).toEqual([
          "a",
          "a/binary.bin",
          "a/deep",
          "a/deep/three.md",
          "a/one.md",
          "b",
          "b/two.md",
        ])
        expect(inventory.entries.find((entry) => entry.relativePath === "a/binary.bin")?.supported).toBeFalse()
        expect(inventory.truncated).toBeFalse()

        const limited = await runtime.runPromise(
          service.inventory({ contentRootID: root.id, budgets: { ...budgets, maxEntries: 2 } }),
        )
        expect(limited.truncated).toBeTrue()
        expect(limited.truncationReasons).toContain("entry_count")
        expect(limited.frontier.length).toBeGreaterThan(0)

        const depth = await runtime.runPromise(
          service.inventory({ contentRootID: root.id, budgets: { ...budgets, maxDepth: 1 } }),
        )
        expect(depth.truncationReasons).toContain("depth")
        expect(depth.frontier).toContain("a/deep")

        const directories = await runtime.runPromise(
          service.inventory({ contentRootID: root.id, budgets: { ...budgets, maxDirectories: 1 } }),
        )
        expect(directories.truncationReasons).toContain("directory_count")

        const files = await runtime.runPromise(
          service.inventory({ contentRootID: root.id, budgets: { ...budgets, maxFiles: 1 } }),
        )
        expect(files.truncationReasons).toContain("file_count")

        const paths = await runtime.runPromise(
          service.inventory({ contentRootID: root.id, budgets: { ...budgets, maxPathBytes: 2 } }),
        )
        expect(paths.truncationReasons).toContain("path_bytes")

        const returned = await runtime.runPromise(
          service.inventory({ contentRootID: root.id, budgets: { ...budgets, maxReturnedBytes: 1 } }),
        )
        expect(returned.truncationReasons).toContain("returned_bytes")

        const candidateBytes = await runtime.runPromise(
          service.inventory({ contentRootID: root.id, budgets: { ...budgets, maxFileBytes: 1 } }),
        )
        expect(candidateBytes.entries.find((entry) => entry.relativePath === "a/one.md")?.supported).toBeFalse()

        const elapsed = await runtime.runPromise(
          service.inventory({ contentRootID: root.id, budgets: { ...budgets, maxDurationMs: 1 } }),
        )
        expect(elapsed.truncationReasons).toContain("elapsed_time")

        const search = await runtime.runPromise(
          service.search({ contentRootID: root.id, query: "needle", budgets, maxMatches: 1 }),
        )
        expect(search.matches).toEqual([
          expect.objectContaining({ relativePath: "a/one.md", line: 1, text: "first needle" }),
        ])
        expect(search.truncationReasons).toContain("match_count")

        const context = await runtime.runPromise(
          service.search({ contentRootID: root.id, query: "needle", budgets, maxContextBytes: 4 }),
        )
        expect(context.matches).toEqual([])
        expect(context.truncationReasons).toContain("context_bytes")

        const deadlinePath = path.join(rootPath, "a", "deadline.md")
        await writeFile(deadlinePath, "deadline needle\n".repeat(250_000))
        const deadline = await runtime.runPromise(
          service.search({
            contentRootID: root.id,
            query: "deadline needle",
            budgets: { ...budgets, maxDurationMs: 1, maxFileBytes: 8 * 1024 * 1024 },
          }),
        )
        expect(deadline.matches).toEqual([])
        expect(deadline.truncated).toBeTrue()
        expect(deadline.truncationReasons).toContain("elapsed_time")
        await rm(deadlinePath)

        const present = await runtime.runPromise(
          service.read({ contentRootID: root.id, relativePath: "a/one.md", maxBytes: 1000 }),
        )
        expect(present.authorization).toEqual({
          contentRootID: root.id,
          bindingID: root.binding.id,
          bindingEpisodeID: root.bindingEpisode.id,
          bindingEpisodeOrdinal: root.bindingEpisode.ordinal,
          grantEpisodeID: root.grant!.id,
          grantVersion: root.grantVersion,
        })
        expect(present.observation).toMatchObject({ result: "present", mediaType: "text/markdown" })
        if (present.observation.result === "present") {
          expect(new TextDecoder().decode(present.observation.bytes)).toBe("first needle\nnext")
        }
        expect(
          await runtime.runPromise(
            service.read({ contentRootID: root.id, relativePath: "a/missing.md", maxBytes: 1000 }),
          ),
        ).toMatchObject({ observation: { result: "missing" } })
        expect(
          await runtime.runPromise(
            Effect.flip(service.read({ contentRootID: root.id, relativePath: "../outside/x", maxBytes: 1000 })),
          ),
        ).toMatchObject({ _tag: "ContentRoot.PathError", reason: "invalid_path" })

        await mkdir(path.join(rootPath, "cancel"))
        await Promise.all(
          Array.from({ length: 100 }, (_, index) =>
            writeFile(path.join(rootPath, "cancel", `${index.toString().padStart(3, "0")}.md`), "cancel"),
          ),
        )
        const controller = new AbortController()
        const cancelled = runtime.runPromise(
          service.inventory({
            contentRootID: root.id,
            budgets: { ...budgets, maxEntries: 1000, maxFiles: 1000, maxDurationMs: 5000 },
          }),
          { signal: controller.signal },
        )
        setTimeout(() => controller.abort(), 0)
        await expect(cancelled).rejects.toThrow()
      })
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  windowsTest("returns only a whole verified snapshot while another process rewrites a file", async () => {
    const directory = await temporaryDirectory()
    const source = path.join(directory, "changing.bin")
    const byteLength = 2 * 1024 * 1024
    await writeFile(source, new Uint8Array(byteLength).fill(65))
    const writer = Bun.spawn({
      cmd: [
        process.execPath,
        "-e",
        `const file = ${JSON.stringify(source)};
const size = ${byteLength};
console.log("ready");
for (let index = 0; index < 80; index++) {
  await Bun.write(file, new Uint8Array(size).fill(index % 2 === 0 ? 66 : 65));
  await Bun.sleep(1);
}`,
      ],
      stdout: "pipe",
      stderr: "pipe",
    })
    try {
      const output = writer.stdout.getReader()
      const ready = await output.read()
      output.releaseLock()
      expect(new TextDecoder().decode(ready.value)).toContain("ready")

      const root = await ContentRootNTFS.inspectDirectory(directory)
      const outcomes = await Promise.all(
        Array.from({ length: 8 }, async () => {
          try {
            return await ContentRootNTFS.prepareFile(root, "changing.bin", byteLength)
          } catch (error) {
            expect(error).toMatchObject({
              _tag: "ContentRoot.PathError",
              reason: expect.stringMatching(/^(mutated|stale|unreadable)$/),
            })
            return undefined
          }
        }),
      )
      for (const outcome of outcomes) {
        if (!outcome || outcome.result !== "present") continue
        expect(outcome.bytes.byteLength).toBe(byteLength)
        expect([65, 66]).toContain(outcome.bytes[0])
        expect(outcome.bytes.every((byte) => byte === outcome.bytes[0])).toBeTrue()
        const hasher = new Bun.CryptoHasher("sha256")
        hasher.update(outcome.bytes)
        expect(outcome.fingerprint.digest).toBe(hasher.digest("hex"))
      }
      expect(outcomes).toHaveLength(8)
      expect(outcomes.some((outcome) => !outcome)).toBeTrue()
      expect(await writer.exited).toBe(0)

      const stable = await ContentRootNTFS.prepareFile(root, "changing.bin", byteLength)
      expect(stable.result).toBe("present")
      if (stable.result === "present") {
        expect(stable.bytes.every((byte) => byte === stable.bytes[0])).toBeTrue()
        const hasher = new Bun.CryptoHasher("sha256")
        hasher.update(stable.bytes)
        expect(stable.fingerprint.digest).toBe(hasher.digest("hex"))
      }
    } finally {
      writer.kill()
      await writer.exited
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("keeps an admitted operation on its exact grant snapshot while revoke blocks later work", async () => {
    const directory = await temporaryDirectory()
    await Promise.all(
      Array.from({ length: 200 }, (_, index) =>
        writeFile(path.join(directory, `${index.toString().padStart(3, "0")}.md`), "snapshot"),
      ),
    )
    try {
      await withRuntime(async ({ service, runtime }) => {
        const proposal = await runtime.runPromise(service.propose(directory))
        const root = await runtime.runPromise(
          service.approve({
            proposal,
            approval: ContentRoot.LearnerApproval.contentRoot(proposal, "in-flight snapshot root"),
          }),
        )
        const inventory = runtime.runPromise(service.inventory({ contentRootID: root.id }))
        await Bun.sleep(5)
        await runtime.runPromise(
          service.revoke({ contentRootID: root.id, expectedGrantVersion: 1, basis: "concurrent revoke" }),
        )
        const admitted = await inventory
        expect(admitted.grantVersion).toBe(1)
        expect(admitted.entries).toHaveLength(200)
        expect(
          await runtime.runPromise(Effect.flip(service.inventory({ contentRootID: root.id }))),
        ).toMatchObject({ _tag: "ContentRoot.InvalidTransitionError" })
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("persists active and revoked authority across runtime restart", async () => {
    const directory = await temporaryDirectory()
    const databasePath = path.join(directory, "learner-home.db")
    const contentPath = path.join(directory, "materials")
    await mkdir(contentPath)
    let rootID: ContentRoot.ContentRootID
    let activeMutationID: ContentRoot.MutationGrantID
    let revokedMutationID: ContentRoot.MutationGrantID
    try {
      const first = ManagedRuntime.make(appLayer(databasePath))
      try {
        const service = await first.runPromise(ContentRoot.Service)
        const rootProposal = await first.runPromise(service.propose(contentPath))
        const root = await first.runPromise(
          service.approve({
            proposal: rootProposal,
            approval: ContentRoot.LearnerApproval.contentRoot(rootProposal, "persisted root"),
          }),
        )
        rootID = root.id
        const activeMutationProposal = await first.runPromise(
          service.proposeMutationGrant({
            anchorPath: contentPath,
            relativeScope: "active.md",
            scopeKind: "exact",
            rights: ["create", "modify"],
          }),
        )
        activeMutationID = (
          await first.runPromise(
            service.approveMutationGrant({
              proposal: activeMutationProposal,
              approval: ContentRoot.LearnerApproval.mutationGrant(
                activeMutationProposal,
                "persist active mutation grant",
              ),
            }),
          )
        ).id
        const revokedMutationProposal = await first.runPromise(
          service.proposeMutationGrant({
            anchorPath: contentPath,
            relativeScope: "revoked.md",
            scopeKind: "exact",
            rights: ["create"],
          }),
        )
        const revokedMutation = await first.runPromise(
          service.approveMutationGrant({
            proposal: revokedMutationProposal,
            approval: ContentRoot.LearnerApproval.mutationGrant(
              revokedMutationProposal,
              "persist revoked mutation grant",
            ),
          }),
        )
        revokedMutationID = revokedMutation.id
        await first.runPromise(
          service.revokeMutationGrant({
            mutationGrantID: revokedMutation.id,
            expectedVersion: 1,
            basis: "persisted mutation revoke",
          }),
        )
        await first.runPromise(
          service.revoke({ contentRootID: root.id, expectedGrantVersion: 1, basis: "persisted revoke" }),
        )
      } finally {
        await first.dispose()
      }

      const second = ManagedRuntime.make(appLayer(databasePath))
      try {
        const service = await second.runPromise(ContentRoot.Service)
        const restored = await second.runPromise(service.get(rootID!))
        expect(restored).toMatchObject({ disposition: "revoked", grantVersion: 1 })
        expect(restored.bindingEpisode.ordinal).toBe(1)
        expect(restored.verification.status).toBe("verified")
        expect(await second.runPromise(service.getMutationGrant(activeMutationID!))).toMatchObject({
          disposition: "active",
          version: 1,
          verification: { status: "verified" },
        })
        expect(await second.runPromise(service.getMutationGrant(revokedMutationID!))).toMatchObject({
          disposition: "revoked",
          version: 2,
          revocationBasis: "persisted mutation revoke",
          verification: { status: "verified" },
        })
      } finally {
        await second.dispose()
      }
      expect((await readFile(databasePath)).byteLength).toBeGreaterThan(0)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
