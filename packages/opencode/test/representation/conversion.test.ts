import { Artifact } from "@opencode-ai/core/artifact"
import { ArtifactSchema } from "@opencode-ai/core/artifact/schema"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppProcess } from "@opencode-ai/core/process"
import { Representation } from "@opencode-ai/core/representation"
import { RepresentationRevisionTable } from "@opencode-ai/core/representation/sql"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { expect, test } from "bun:test"
import { Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime } from "effect"
import { mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { RepresentationConversion } from "@/representation/conversion"
import { Session } from "@/session/session"
import { pdfFixture } from "../fixture/pdf"

const windowsTest = process.platform === "win32" ? test : test.skip

windowsTest(
  "binds one exact Artifact Revision and ContentRoot receipt while rejecting wrong or ambiguous sources",
  async () => {
    const fixture = await setup("exact")
    try {
      await fixture.runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const representations = yield* Representation.Service
          const inner = yield* approveRoot(roots, fixture.sourceDirectory, "inner source root")
          const outer = yield* approveRoot(roots, fixture.workspaceDirectory, "overlapping workspace root")
          const artifact = yield* admitArtifact(artifacts, roots, inner, "lecture.pdf")
          const revisionID = artifact.source.currentRevisionID!

          const wrong = yield* Effect.exit(
            RepresentationConversion.convert({
              ...conversionInput(artifact, inner, "lecture.pdf", "wrong-revision"),
              sourceRevisionID: ArtifactSchema.createRevisionID(),
            }),
          )
          expectFailure(wrong, "stale_source")

          const ambiguous = yield* Effect.exit(
            RepresentationConversion.convert({
              ...conversionInput(artifact, outer, "materials/lecture.pdf", "ambiguous-root"),
              rootSelection: RepresentationConversion.RootSelection.artifactProvenance(),
            }),
          )
          expectFailure(ambiguous, "ambiguous_content_root")
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)

          const accepted = yield* RepresentationConversion.convert({
            ...conversionInput(artifact, outer, "materials/lecture.pdf", "explicit-overlap"),
            rootSelection: RepresentationConversion.RootSelection.explicitLearner(
              "learner selected the displayed overlapping root",
            ),
          })
          expect(accepted.type).toBe("accepted")
          expect(accepted.representation.sourceProof.ordinary.currentRevisionID).toBe(revisionID)
          expect(accepted.representation.sourceProof.authorization.contentRootID).toBe(outer.id)
          expect(accepted.representation.sourceProof.relativePath).toBe("materials/lecture.pdf")
          expect(accepted.representation.sourceProof.ordinary.fingerprint).toEqual(
            (yield* artifacts.getRevision(artifact.id, revisionID, { type: "recorded" })).fingerprint,
          )
          expect(yield* representations.listForArtifact({ effectiveArtifactID: artifact.id })).toHaveLength(1)
        }).pipe(Effect.scoped),
      )
    } finally {
      await fixture.dispose()
    }
  },
  30_000,
)

windowsTest(
  "fails closed for pre-abort, missing bytes, and changed bytes",
  async () => {
    const fixture = await setup("source-failure")
    try {
      await fixture.runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const root = yield* approveRoot(roots, fixture.sourceDirectory, "source failure root")
          const artifact = yield* admitArtifact(artifacts, roots, root, "lecture.pdf")

          const controller = new AbortController()
          controller.abort()
          const aborted = yield* Effect.exit(
            RepresentationConversion.convert({
              ...conversionInput(artifact, root, "lecture.pdf", "pre-abort"),
              abort: controller.signal,
            }),
          )
          expectFailure(aborted, "cancelled")

          yield* Effect.promise(() => rm(fixture.sourcePath))
          const missing = yield* Effect.exit(
            RepresentationConversion.convert(conversionInput(artifact, root, "lecture.pdf", "missing")),
          )
          expectFailure(missing, "source_unavailable")
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)

          yield* Effect.promise(() => writeFile(fixture.sourcePath, pdfFixture([{ text: "Changed source" }])))
          const changed = yield* Effect.exit(
            RepresentationConversion.convert(conversionInput(artifact, root, "lecture.pdf", "changed")),
          )
          expectFailure(changed, "stale_source")
          expect((yield* artifacts.getArtifact(artifact.id)).source.currentRevisionID).not.toBe(
            artifact.source.currentRevisionID,
          )
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)

          const current = yield* artifacts.getArtifact(artifact.id)
          yield* roots.revoke({
            contentRootID: root.id,
            expectedGrantVersion: root.grantVersion,
            basis: "revoked before a new conversion read",
          })
          const revoked = yield* Effect.exit(
            RepresentationConversion.convert(conversionInput(current, root, "lecture.pdf", "pre-read-revoke")),
          )
          expectFailure(revoked, "content_root_stale")
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)
        }).pipe(Effect.scoped),
      )
    } finally {
      await fixture.dispose()
    }
  },
  30_000,
)

windowsTest(
  "revalidates Artifact semantics at commit after the producer has finished",
  async () => {
    const fixture = await setup("artifact-race")
    try {
      await fixture.runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const root = yield* approveRoot(roots, fixture.sourceDirectory, "artifact race root")
          const artifact = yield* admitArtifact(artifacts, roots, root, "lecture.pdf")
          const prepared = yield* RepresentationConversion.prepare(
            conversionInput(artifact, root, "lecture.pdf", "withdraw-race"),
          )
          expect(prepared.type).toBe("candidate")
          if (prepared.type !== "candidate") return yield* Effect.die("Expected a fresh candidate")

          yield* artifacts.withdraw({
            artifactID: artifact.id,
            expectedDispositionVersion: artifact.dispositionVersion,
          })
          const committed = yield* Effect.exit(database.db.transaction(prepared.acceptance.commit))
          expect(Exit.isFailure(committed)).toBe(true)
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)
        }).pipe(Effect.scoped),
      )
    } finally {
      await fixture.dispose()
    }
  },
  30_000,
)

windowsTest(
  "rejects a real current-Revision drift after the producer has finished",
  async () => {
    const fixture = await setup("revision-race")
    try {
      await fixture.runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const root = yield* approveRoot(roots, fixture.sourceDirectory, "revision race root")
          const artifact = yield* admitArtifact(artifacts, roots, root, "lecture.pdf")
          const prepared = yield* RepresentationConversion.prepare(
            conversionInput(artifact, root, "lecture.pdf", "revision-race"),
          )
          expect(prepared.type).toBe("candidate")
          if (prepared.type !== "candidate") return yield* Effect.die("Expected a fresh candidate")

          yield* Effect.promise(() => writeFile(fixture.sourcePath, pdfFixture([{ text: "New exact revision" }])))
          const read = yield* roots.read({
            contentRootID: root.id,
            relativePath: "lecture.pdf",
            maxBytes: 1024 * 1024,
          })
          if (read.observation.result !== "present") return yield* Effect.die("Expected the replacement PDF")
          const advanced = yield* artifacts.observe({
            expected: Artifact.expectedSource(yield* artifacts.getArtifact(artifact.id)),
            observation: {
              result: "present",
              fingerprint: read.observation.fingerprint,
              mediaType: read.observation.mediaType,
              observer: Artifact.Observer.trusted(observerIdentity(root), read.authorization.grantVersion),
              timeObserved: read.observation.timeObserved,
            },
          })
          expect(advanced.artifact.source.currentRevisionID).not.toBe(artifact.source.currentRevisionID)
          const committed = yield* Effect.exit(database.db.transaction(prepared.acceptance.commit))
          expect(Exit.isFailure(committed)).toBe(true)
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)
        }).pipe(Effect.scoped),
      )
    } finally {
      await fixture.dispose()
    }
  },
  30_000,
)

windowsTest(
  "rejects a source larger than the selected producer input ceiling without publication",
  async () => {
    const fixture = await setup("oversized")
    try {
      await fixture.runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const root = yield* approveRoot(roots, fixture.sourceDirectory, "oversized source root")
          const byteLength = Representation.localPDFRecipe.limits.inputBytes + 1
          yield* Effect.promise(() => truncate(fixture.sourcePath, byteLength))
          const artifact = yield* artifacts.admit({
            location: Artifact.CanonicalLocation.trusted(fixture.sourcePath),
            observation: {
              result: "present",
              fingerprint: { algorithm: "sha256", digest: "0".repeat(64), byteLength },
              mediaType: "application/pdf",
              observer: Artifact.Observer.trusted(observerIdentity(root), root.grantVersion),
              timeObserved: Date.now(),
            },
            authority: Artifact.Admission.learnerInstruction("admit:oversized", 1),
          })
          const oversized = yield* Effect.exit(
            RepresentationConversion.convert(conversionInput(artifact, root, "lecture.pdf", "oversized")),
          )
          expect(Exit.isFailure(oversized)).toBe(true)
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)
        }).pipe(Effect.scoped),
      )
    } finally {
      await fixture.dispose()
    }
  },
  30_000,
)

windowsTest(
  "does not let availability-only sourceVersion changes retroactively defeat an exact candidate",
  async () => {
    const fixture = await setup("availability-race")
    try {
      await fixture.runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const root = yield* approveRoot(roots, fixture.sourceDirectory, "availability race root")
          const artifact = yield* admitArtifact(artifacts, roots, root, "lecture.pdf")
          const revisionID = artifact.source.currentRevisionID!
          const prepared = yield* RepresentationConversion.prepare(
            conversionInput(artifact, root, "lecture.pdf", "availability-only-race"),
          )
          expect(prepared.type).toBe("candidate")
          if (prepared.type !== "candidate") return yield* Effect.die("Expected a fresh candidate")

          const current = yield* artifacts.getArtifact(artifact.id)
          const missing = yield* artifacts.observe({
            expected: Artifact.expectedSource(current),
            observation: {
              result: "missing",
              observer: Artifact.Observer.trusted(observerIdentity(root), root.grantVersion),
              timeObserved: Date.now(),
            },
          })
          expect(missing.artifact.source.currentRevisionID).toBe(revisionID)
          expect(missing.artifact.source.sourceVersion).toBeGreaterThan(current.source.sourceVersion)
          const accepted = yield* database.db.transaction(prepared.acceptance.commit)
          expect(accepted.sourceProof.ordinary.currentRevisionID).toBe(revisionID)
          expect(accepted.sourceProof.sourceVersion).toBe(current.source.sourceVersion)
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(1)
        }).pipe(Effect.scoped),
      )
    } finally {
      await fixture.dispose()
    }
  },
  30_000,
)

windowsTest(
  "accepts under the immutable read receipt when root revocation loses the race",
  async () => {
    const fixture = await setup("root-race")
    try {
      await fixture.runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const root = yield* approveRoot(roots, fixture.sourceDirectory, "root race")
          const artifact = yield* admitArtifact(artifacts, roots, root, "lecture.pdf")
          const prepared = yield* RepresentationConversion.prepare(
            conversionInput(artifact, root, "lecture.pdf", "post-read-revoke"),
          )
          expect(prepared.type).toBe("candidate")
          if (prepared.type !== "candidate") return yield* Effect.die("Expected a fresh candidate")

          const revoked = yield* roots.revoke({
            contentRootID: root.id,
            expectedGrantVersion: root.grantVersion,
            basis: "revocation after the producer completed",
          })
          expect(revoked).toMatchObject({ disposition: "revoked", grantVersion: root.grantVersion, grant: undefined })
          const accepted = yield* database.db.transaction(prepared.acceptance.commit)
          expect(accepted.sourceProof.authorization.grantEpisodeID).toBe(root.grant!.id)
          expect(accepted.sourceProof.authorization.grantVersion).toBe(root.grantVersion)
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(1)
        }).pipe(Effect.scoped),
      )
    } finally {
      await fixture.dispose()
    }
  },
  30_000,
)

windowsTest(
  "preserves root-revocation cancellation through the composed local producer",
  async () => {
    const fixture = await setup("root-cancellation")
    try {
      await fixture.runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const processService = yield* AppProcess.Service
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const root = yield* approveRoot(roots, fixture.sourceDirectory, "root cancellation")
          const artifact = yield* admitArtifact(artifacts, roots, root, "lecture.pdf")
          const started = yield* Deferred.make<void>()
          const fiber = yield* RepresentationConversion.convert(
            conversionInput(artifact, root, "lecture.pdf", "root-revoke-cancellation"),
          )
            .pipe(
              Effect.provideService(AppProcess.Service, {
                ...processService,
                run: (_command, options) =>
                  Deferred.succeed(started, undefined).pipe(
                    Effect.andThen(
                      Effect.gen(function* () {
                        while (!options?.signal?.aborted) yield* Effect.sleep("1 millis")
                        return yield* Effect.fail(
                          new AppProcess.AppProcessError({
                            command: "repa-pdf-worker",
                            cause: new Error("cancelled by root revocation"),
                          }),
                        )
                      }),
                    ),
                  ),
              }),
              Effect.forkChild,
            )

          yield* Deferred.await(started)
          yield* roots.revoke({
            contentRootID: root.id,
            expectedGrantVersion: root.grantVersion,
            basis: "revoke while local producer is running",
          })
          expectFailure(yield* Fiber.await(fiber), "cancelled")
          expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)
        }).pipe(Effect.scoped),
      )
    } finally {
      await fixture.dispose()
    }
  },
  30_000,
)

function conversionInput(
  artifact: Artifact.ArtifactInfo,
  root: ContentRoot.RootInfo,
  relativePath: string,
  operation: string,
): RepresentationConversion.Input {
  return {
    effectiveArtifactID: artifact.id,
    sourceRevisionID: artifact.source.currentRevisionID!,
    contentRootID: root.id,
    relativePath,
    rootSelection: RepresentationConversion.RootSelection.artifactProvenance(),
    producer: { kind: "local_pdf" },
    authority: Representation.ConversionAuthority.deterministic(operation, "learner requested readable access"),
  }
}

function approveRoot(roots: ContentRoot.Interface, pathname: string, basis: string) {
  return Effect.gen(function* () {
    const proposal = yield* roots.propose(pathname)
    return yield* roots.approve({ proposal, approval: ContentRoot.LearnerApproval.contentRoot(proposal, basis) })
  })
}

function admitArtifact(
  artifacts: Artifact.Interface,
  roots: ContentRoot.Interface,
  root: ContentRoot.RootInfo,
  relativePath: string,
) {
  return Effect.gen(function* () {
    const read = yield* roots.read({ contentRootID: root.id, relativePath, maxBytes: 1024 * 1024 })
    if (read.observation.result !== "present") return yield* Effect.die("Expected the PDF fixture")
    return yield* artifacts.admit({
      location: Artifact.CanonicalLocation.trusted(read.observation.descriptor.canonicalPath),
      observation: {
        result: "present",
        fingerprint: read.observation.fingerprint,
        mediaType: read.observation.mediaType,
        observer: Artifact.Observer.trusted(observerIdentity(root), read.authorization.grantVersion),
        timeObserved: read.observation.timeObserved,
      },
      authority: Artifact.Admission.learnerInstruction(`admit:${relativePath}`, 1),
    })
  })
}

function observerIdentity(root: ContentRoot.RootInfo) {
  return `content-root:${root.id}:${root.binding.id}:${root.grant!.id}`
}

function expectFailure<E>(exit: Exit.Exit<unknown, E>, code: RepresentationConversion.FailureCode) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) return
  const reason = exit.cause.reasons[0]
  expect(reason?._tag).toBe("Fail")
  if (reason?._tag === "Fail") expect(reason.error).toMatchObject({ code })
}

async function setup(name: string) {
  const directory = await mkdtemp(path.join(tmpdir(), `repa-conversion-${name}-`))
  const workspaceDirectory = path.join(directory, "workspace")
  const sourceDirectory = path.join(workspaceDirectory, "materials")
  const sourcePath = path.join(sourceDirectory, "lecture.pdf")
  const stateDirectory = path.join(directory, "state")
  await mkdir(sourceDirectory, { recursive: true })
  await mkdir(stateDirectory)
  await writeFile(sourcePath, pdfFixture([{ text: "Exact readable source" }]))
  const runtime = ManagedRuntime.make(
    LayerNode.compile(
      LayerNode.group([
        Artifact.node,
        ContentRoot.node,
        Representation.node,
        AppProcess.node,
        Auth.node,
        Config.node,
        Plugin.node,
        Provider.node,
        Session.node,
        SessionProjector.node,
        Database.node,
      ]),
      [[Database.node, Database.layerFromPath(path.join(stateDirectory, "repa.sqlite")).pipe(Layer.orDie)]],
    ),
  )
  return {
    runtime,
    workspaceDirectory,
    sourceDirectory,
    sourcePath,
    dispose: async () => {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
