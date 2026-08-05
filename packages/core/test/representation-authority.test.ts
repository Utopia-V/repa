import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Exit, Layer, ManagedRuntime } from "effect"
import { Artifact } from "@opencode-ai/core/artifact"
import { createArtifactID } from "@opencode-ai/core/artifact/schema"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Representation } from "@opencode-ai/core/representation"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import { ModelRenditionProfile } from "@opencode-ai/core/representation/model-rendition-profile"
import { open, parseKey } from "../src/representation/storage"
import { sql } from "drizzle-orm"

const windowsTest = process.platform === "win32" ? test : test.skip

function appLayer(filename: string) {
  return LayerNode.compile(
    LayerNode.group([
      Representation.node,
      Representation.historicalReaderNode,
      Representation.currentUseReaderNode,
      Representation.tutorCurrentUseReaderNode,
      Artifact.node,
      ContentRoot.node,
      Database.node,
    ]),
    [[Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)]],
  )
}

function digest(bytes: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

function observer(receipt: ContentRoot.ReadAuthorizationReceipt) {
  return Artifact.Observer.trusted(
    `content-root:${receipt.contentRootID}:${receipt.bindingID}:${receipt.grantEpisodeID}`,
    receipt.grantVersion,
  )
}

function ordinary(
  artifact: Artifact.ArtifactInfo,
  revision: Artifact.RevisionInfo,
): Artifact.OrdinaryUseRevisionSnapshot {
  const mediaType = artifact.source.descriptor?.mediaType
  if (!mediaType) throw new Error("Expected effective source media type")
  return {
    effectiveArtifactID: artifact.id,
    dispositionVersion: artifact.dispositionVersion,
    currentRevisionID: revision.id,
    attribution: revision.attribution,
    lineageVersion: artifact.lineageVersion,
    fingerprint: revision.fingerprint,
    mediaType,
  }
}

function lineageBoundary(artifact: Artifact.ArtifactInfo): Artifact.LineageBoundary {
  return {
    bindingID: artifact.source.activeBinding?.id,
    sourceStateBasis: artifact.source.sourceStateBasis,
    revisionID: artifact.source.currentRevisionID,
    revisionAttribution: artifact.source.revisionAttribution,
    descriptor: artifact.source.descriptor,
    availability: artifact.source.availability,
  }
}

function usage(bytes: Uint8Array): Representation.LocalPDFUsage {
  const decoded = PDFTextProfile.decode(bytes)
  if (!decoded.ok) throw new Error(decoded.error)
  return {
    kind: "local_pdf",
    pageCount: decoded.value.profile.pages.length,
    textItemCount: decoded.value.profile.pages.reduce((total, page) => total + page.items.length, 0),
    operatorCount: decoded.value.profile.pages.reduce((total, page) => total + (page.signals?.operatorCount ?? 0), 0),
    imagePaintOperations: decoded.value.profile.pages.reduce(
      (total, page) => total + (page.signals?.imagePaintOperations ?? 0),
      0,
    ),
    signalPageCount: decoded.value.profile.pages.filter((page) => page.signals !== undefined).length,
    profileByteLength: bytes.byteLength,
  }
}

function encodedProfile() {
  const encoded = PDFTextProfile.encode([
    {
      page: 1,
      items: [{ text: "Readable first page", lineBreakAfter: true }],
      signals: { operatorCount: 5, imagePaintOperations: 1 },
    },
    { page: 2, items: [{ text: "Readable second page", lineBreakAfter: false }] },
  ])
  if (!encoded.ok) throw new Error(encoded.error)
  return encoded.value.bytes
}

type Fixture = Awaited<ReturnType<typeof prepareFixture>>

async function prepareFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "repa-representation-authority-"))
  const materials = path.join(directory, "materials")
  const database = path.join(directory, "learner-home.db")
  const source = path.join(materials, "source.pdf")
  await mkdir(materials)
  await writeFile(source, "source revision one")
  const runtime = ManagedRuntime.make(appLayer(database))
  const roots = await runtime.runPromise(ContentRoot.Service)
  const artifacts = await runtime.runPromise(Artifact.Service)
  const representations = await runtime.runPromise(Representation.Service)
  const historical = await runtime.runPromise(Representation.HistoricalReader)
  const current = await runtime.runPromise(Representation.CurrentUseReader)
  const tutor = await runtime.runPromise(Representation.TutorCurrentUseReader)
  const databaseService = await runtime.runPromise(Database.Service)
  const proposal = await runtime.runPromise(roots.propose(materials))
  const root = await runtime.runPromise(
    roots.approve({
      proposal,
      approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Gate 11 authority fixture"),
    }),
  )
  const read = await runtime.runPromise(
    roots.read({ contentRootID: root.id, relativePath: "source.pdf", maxBytes: 1024 * 1024 }),
  )
  if (read.observation.result !== "present") throw new Error("Expected fixture source bytes")
  const artifact = await runtime.runPromise(
    artifacts.admit({
      location: Artifact.CanonicalLocation.trusted(read.observation.descriptor.canonicalPath),
      observation: {
        result: "present",
        fingerprint: read.observation.fingerprint,
        mediaType: read.observation.mediaType,
        observer: observer(read.authorization),
        timeObserved: read.observation.timeObserved,
      },
      authority: Artifact.Admission.learnerInstruction("Gate 11 fixture admission", 1),
    }),
  )
  const sourceRevisionID = artifact.source.currentRevisionID
  const attribution = artifact.source.revisionAttribution
  if (!sourceRevisionID || !attribution) throw new Error("Expected admitted source Revision")
  const revision = await runtime.runPromise(artifacts.getRevision(artifact.id, sourceRevisionID, attribution))
  return {
    directory,
    database,
    source,
    runtime,
    roots,
    artifacts,
    representations,
    historical,
    current,
    tutor,
    databaseService,
    root,
    read,
    artifact,
    revision,
  }
}

async function closeFixture(fixture: Fixture) {
  await fixture.runtime.dispose()
  await rm(fixture.directory, { recursive: true, force: true })
}

function acceptance(
  fixture: Fixture,
  operationIdentity: string,
  candidateRevisionID = Representation.createRevisionID(),
  bytes = encodedProfile(),
) {
  if (fixture.read.observation.result !== "present") throw new Error("Expected fixture source bytes")
  return {
    effectiveArtifactID: fixture.artifact.id,
    sourceRevisionID: fixture.revision.id,
    attribution: fixture.revision.attribution,
    recipe: Representation.localPDFRecipe,
    authority: Representation.ConversionAuthority.deterministic(operationIdentity, "learner requested readable access"),
    candidateRevisionID,
    sourceProof: {
      ordinary: ordinary(fixture.artifact, fixture.revision),
      sourceVersion: fixture.artifact.source.sourceVersion,
      authorization: fixture.read.authorization,
      relativePath: "source.pdf",
      descriptor: fixture.read.observation.descriptor,
      timeObserved: fixture.read.observation.timeObserved,
    },
    candidate: {
      kind: "local_pdf" as const,
      runIdentity: `run:${candidateRevisionID}`,
      provenance: Representation.localPDFRecipe,
      input: fixture.revision.fingerprint,
      bytes,
      diagnostics: [],
      usage: usage(bytes),
    },
    timeAccepted: fixture.read.observation.timeObserved + 1,
  }
}

describe("Representation authority", () => {
  windowsTest(
    "owns immutable acceptance, bounded historical/current reads, drift grants, and exact retry",
    async () => {
      const fixture = await prepareFixture()
      try {
        const input = acceptance(fixture, "terminal:convert:one")
        const accepted = await fixture.runtime.runPromise(fixture.representations.accept(input))
        expect(accepted).toMatchObject({
          id: input.candidateRevisionID,
          sourceProof: { ordinary: ordinary(fixture.artifact, fixture.revision) },
          producer: { kind: "local_pdf", provenance: Representation.localPDFRecipe },
          availability: { disposition: "available", version: 1 },
        })

        const replay = await fixture.runtime.runPromise(
          fixture.representations.resolveConversion({
            effectiveArtifactID: fixture.artifact.id,
            sourceRevisionID: fixture.revision.id,
            attribution: fixture.revision.attribution,
            recipe: Representation.localPDFRecipe,
            authority: Representation.ConversionAuthority.deterministic(
              "terminal:convert:one",
              "learner requested readable access",
            ),
          }),
        )
        expect(replay).toMatchObject({ type: "already_accepted", representation: { id: accepted.id } })
        await expect(
          fixture.runtime.runPromise(
            fixture.representations.resolveConversion({
              effectiveArtifactID: fixture.artifact.id,
              sourceRevisionID: fixture.revision.id,
              attribution: fixture.revision.attribution,
              recipe: Representation.localPDFRecipe,
              authority: Representation.ConversionAuthority.deterministic(
                "terminal:convert:one",
                "different authorization basis",
              ),
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.ConflictError", entity: "effect" })

        const budgets = {
          integrityScanBytes: accepted.output.byteLength,
          returnBytes: accepted.output.byteLength,
          records: accepted.output.recordCount,
        }
        const historical = await fixture.runtime.runPromise(
          fixture.historical.readHistorical({
            representationRevisionID: accepted.id,
            selection: { type: "pdf_pages", startPage: 1 },
            budgets: { ...budgets, records: 1 },
          }),
        )
        expect(historical.content).toMatchObject({ records: 1, nextPage: 2, truncated: true })
        await expect(
          fixture.runtime.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets: { ...budgets, integrityScanBytes: accepted.output.byteLength - 1 },
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.IntegrityBudgetExceededError" })
        await expect(
          fixture.runtime.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets: { ...budgets, returnBytes: accepted.output.byteLength - 1 },
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.ReturnBudgetExceededError" })

        const direct = await fixture.runtime.runPromise(
          fixture.current.readForCurrentUse({
            representationRevisionID: accepted.id,
            effectiveArtifactID: fixture.artifact.id,
            selection: { type: "whole" },
            budgets,
          }),
        )
        expect(direct.admission.basis).toBe("current_revision")
        const tutor = await fixture.runtime.runPromise(
          fixture.tutor.readForTutor({
            representationRevisionID: accepted.id,
            effectiveArtifactID: fixture.artifact.id,
            selection: { type: "whole" },
            budgets,
          }),
        )
        expect(tutor).toMatchObject({ use: "tutor_current", admission: { basis: "current_revision" } })
        await expect(
          fixture.runtime.runPromise(
            fixture.tutor.readForTutor({
              representationRevisionID: accepted.id,
              effectiveArtifactID: fixture.artifact.id,
              selection: { type: "whole" },
              budgets: { ...budgets, returnBytes: 32_769 },
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.InvalidReadError" })
        await expect(
          fixture.runtime.runPromise(
            fixture.tutor.readForTutor({
              representationRevisionID: accepted.id,
              effectiveArtifactID: fixture.artifact.id,
              selection: { type: "whole" },
              budgets: { ...budgets, records: 65 },
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.InvalidReadError" })

        const canary = "gate11-provider-secret-canary"
        const modelDocument = ModelRenditionProfile.encode({
          rendition: "I cannot reproduce this document; here is a brief overview instead.",
          uncertainty: ["This may be refusal-like or summary-like prose"],
          omissions: [],
        })
        if (!modelDocument.ok) throw new Error(modelDocument.error)
        const modelRecipe = {
          kind: "configured_model",
          providerID: "fixture-provider",
          modelID: "fixture-model",
          task: { id: "representation", version: 1 },
          profile: { id: "repa.model-rendition.v1", version: 1 },
          variant: "stable",
          mediaType: "application/pdf",
          nativeInputCapability: "pdf",
          sampling: { maxOutputTokens: 1024 },
          limits: { inputBytes: 1024 * 1024, outputBytes: 1024 * 1024, wallTimeMs: 30_000 },
          apiKey: canary,
          headers: { Authorization: canary },
        } as unknown as Representation.ConfiguredModelProvenance
        const modelRevisionID = Representation.createRevisionID()
        const model = await fixture.runtime.runPromise(
          fixture.representations.accept({
            effectiveArtifactID: fixture.artifact.id,
            sourceRevisionID: fixture.revision.id,
            attribution: fixture.revision.attribution,
            recipe: modelRecipe,
            authority: Representation.ConversionAuthority.deterministic(
              "terminal:convert:model-canary",
              "learner requested configured model rendition",
            ),
            candidateRevisionID: modelRevisionID,
            sourceProof: input.sourceProof,
            candidate: {
              kind: "configured_model",
              runIdentity: `run:${modelRevisionID}`,
              provenance: modelRecipe,
              input: fixture.revision.fingerprint,
              bytes: modelDocument.value.bytes,
              diagnostics: [{ code: "provider_usage_unavailable", count: 1 }],
              usage: { kind: "configured_model" },
            },
            timeAccepted: input.timeAccepted + 1,
          }),
        )
        expect(model.acceptanceBasis).toBe("model_claimed_rendition")
        expect(JSON.stringify(model)).not.toContain(canary)
        expect(
          JSON.stringify(
            await fixture.runtime.runPromise(
              fixture.databaseService.db.get(
                sql`SELECT provenance, diagnostics, usage FROM representation_revision WHERE id = ${model.id}`,
              ),
            ),
          ),
        ).not.toContain(canary)

        const secondBytes = new TextEncoder().encode("source revision two")
        const second = await fixture.runtime.runPromise(
          fixture.artifacts.observe({
            expected: Artifact.expectedSource(fixture.artifact),
            observation: {
              result: "present",
              fingerprint: { algorithm: "sha256", digest: digest(secondBytes), byteLength: secondBytes.byteLength },
              mediaType: "application/pdf",
              observer: observer(fixture.read.authorization),
              timeObserved: fixture.read.observation.timeObserved + 10,
            },
          }),
        )
        await expect(
          fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: fixture.artifact.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.CurrentUseDeniedError", reason: "grant_required" })

        const secondRevisionID = second.artifact.source.currentRevisionID
        const secondAttribution = second.artifact.source.revisionAttribution
        if (!secondRevisionID || !secondAttribution) throw new Error("Expected second source Revision")
        const grant = await fixture.runtime.runPromise(
          fixture.representations.authorizeContinuedUse({
            representationRevisionID: accepted.id,
            expectedArtifact: {
              effectiveArtifactID: second.artifact.id,
              dispositionVersion: second.artifact.dispositionVersion,
              currentRevisionID: secondRevisionID,
              attribution: secondAttribution,
              lineageVersion: second.artifact.lineageVersion,
            },
            authority: Representation.LearnerAuthority.deterministic(
              "terminal:continued-use:one",
              "learner confirmed exact old representation",
            ),
            timeAuthorized: accepted.timeAccepted + 20,
          }),
        )
        expect(grant).toMatchObject({ disposition: "active", oldSourceRevisionID: fixture.revision.id })

        const missing = await fixture.runtime.runPromise(
          fixture.artifacts.observe({
            expected: Artifact.expectedSource(second.artifact),
            observation: {
              result: "missing",
              observer: observer(fixture.read.authorization),
              timeObserved: fixture.read.observation.timeObserved + 30,
            },
          }),
        )
        const restored = await fixture.runtime.runPromise(
          fixture.artifacts.observe({
            expected: Artifact.expectedSource(missing.artifact),
            observation: {
              result: "present",
              fingerprint: { algorithm: "sha256", digest: digest(secondBytes), byteLength: secondBytes.byteLength },
              mediaType: "application/pdf",
              observer: observer(fixture.read.authorization),
              timeObserved: fixture.read.observation.timeObserved + 40,
            },
          }),
        )
        expect(restored.artifact.source.sourceVersion).toBeGreaterThan(second.artifact.source.sourceVersion)
        const granted = await fixture.runtime.runPromise(
          fixture.current.readForCurrentUse({
            representationRevisionID: accepted.id,
            effectiveArtifactID: fixture.artifact.id,
            selection: { type: "whole" },
            budgets,
          }),
        )
        expect(granted.admission).toMatchObject({
          basis: "continued_use_grant",
          grantID: grant.id,
          grantVersion: grant.version,
        })

        const revoked = await fixture.runtime.runPromise(
          fixture.representations.revokeContinuedUse({
            grantID: grant.id,
            expectedVersion: grant.version,
            authority: Representation.LearnerAuthority.deterministic(
              "terminal:continued-use:revoke",
              "learner revoked exact continued use",
            ),
            timeRevoked: accepted.timeAccepted + 50,
          }),
        )
        expect(
          await fixture.runtime.runPromise(
            fixture.representations.revokeContinuedUse({
              grantID: grant.id,
              expectedVersion: grant.version,
              authority: Representation.LearnerAuthority.deterministic(
                "terminal:continued-use:revoke",
                "learner revoked exact continued use",
              ),
              timeRevoked: accepted.timeAccepted + 60,
            }),
          ),
        ).toEqual(revoked)
        await expect(
          fixture.runtime.runPromise(
            fixture.representations.revokeContinuedUse({
              grantID: grant.id,
              expectedVersion: grant.version,
              authority: Representation.LearnerAuthority.deterministic(
                "terminal:continued-use:revoke",
                "different revocation semantics",
              ),
              timeRevoked: accepted.timeAccepted + 60,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.ConflictError", entity: "continued_use_grant" })
        await expect(
          fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: fixture.artifact.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.CurrentUseDeniedError", reason: "grant_required" })

        const replacementGrant = await fixture.runtime.runPromise(
          fixture.representations.authorizeContinuedUse({
            representationRevisionID: accepted.id,
            expectedArtifact: {
              effectiveArtifactID: restored.artifact.id,
              dispositionVersion: restored.artifact.dispositionVersion,
              currentRevisionID: secondRevisionID,
              attribution: secondAttribution,
              lineageVersion: restored.artifact.lineageVersion,
            },
            authority: Representation.LearnerAuthority.deterministic(
              "terminal:continued-use:two",
              "learner authorized the same exact drift pair again",
            ),
            timeAuthorized: accepted.timeAccepted + 55,
          }),
        )
        expect(replacementGrant.id).not.toBe(grant.id)
        expect(
          await fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: fixture.artifact.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).toMatchObject({ admission: { basis: "continued_use_grant", grantID: replacementGrant.id } })

        const thirdBytes = new TextEncoder().encode("source revision three")
        const third = await fixture.runtime.runPromise(
          fixture.artifacts.observe({
            expected: Artifact.expectedSource(restored.artifact),
            observation: {
              result: "present",
              fingerprint: { algorithm: "sha256", digest: digest(thirdBytes), byteLength: thirdBytes.byteLength },
              mediaType: "application/pdf",
              observer: observer(fixture.read.authorization),
              timeObserved: fixture.read.observation.timeObserved + 60,
            },
          }),
        )
        expect(third.artifact.source.currentRevisionID).not.toBe(secondRevisionID)
        await expect(
          fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: fixture.artifact.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.CurrentUseDeniedError", reason: "grant_required" })

        const withdrawn = await fixture.runtime.runPromise(
          fixture.artifacts.withdraw({
            artifactID: fixture.artifact.id,
            expectedDispositionVersion: restored.artifact.dispositionVersion,
          }),
        )
        await expect(
          fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: fixture.artifact.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Artifact.InactiveError" })
        const restoredDisposition = await fixture.runtime.runPromise(
          fixture.artifacts.restore({
            artifactID: fixture.artifact.id,
            expectedDispositionVersion: withdrawn.dispositionVersion,
          }),
        )
        expect(restoredDisposition.withdrawalReason).toBeUndefined()
        await expect(
          fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: fixture.artifact.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.CurrentUseDeniedError", reason: "grant_required" })

        const observations = await fixture.runtime.runPromise(
          fixture.artifacts.listObservations(restoredDisposition.id),
        )
        const endAtOrdinal = Math.max(...observations.items.map((item) => item.ordinal))
        const correction = await fixture.runtime.runPromise(
          fixture.artifacts.correctLineage({
            admissionRootArtifactID: restoredDisposition.admissionRootArtifactID,
            createTarget: true,
            authority: Artifact.LineageCorrectionAuthority.learnerStatement("Gate 11 correction-hidden evidence", 1),
            expectedArtifacts: [Artifact.expectedSource(restoredDisposition)],
            members: [
              {
                recordedArtifactID: restoredDisposition.id,
                expectedLineageVersion: restoredDisposition.lineageVersion,
                startAfterOrdinal: 0,
                endAtOrdinal,
                timeEffective: Math.max(...observations.items.map((item) => item.effectiveTimeObserved)),
                expectedWinningAttribution: restoredDisposition.source.revisionAttribution!,
                boundary: lineageBoundary(restoredDisposition),
                outcome: { type: "new" },
                projectOutcome: true,
              },
            ],
          }),
        )
        expect(correction.newArtifact).toBeDefined()
        const hiddenArtifact = await fixture.runtime.runPromise(fixture.artifacts.getArtifact(restoredDisposition.id))
        expect(hiddenArtifact).toMatchObject({ correctionHidden: true })
        const hiddenRevisionID = restoredDisposition.source.currentRevisionID
        const hiddenAttribution = restoredDisposition.source.revisionAttribution
        if (!hiddenRevisionID || !hiddenAttribution) throw new Error("Expected pre-correction current source")
        await expect(
          fixture.runtime.runPromise(
            fixture.representations.accept(acceptance(fixture, "terminal:conversion:correction-hidden")),
          ),
        ).rejects.toMatchObject({ _tag: "Artifact.InactiveError", reason: "lineage_correction" })
        await expect(
          fixture.runtime.runPromise(
            fixture.representations.authorizeContinuedUse({
              representationRevisionID: accepted.id,
              expectedArtifact: {
                effectiveArtifactID: hiddenArtifact.id,
                dispositionVersion: hiddenArtifact.dispositionVersion,
                currentRevisionID: hiddenRevisionID,
                attribution: hiddenAttribution,
                lineageVersion: hiddenArtifact.lineageVersion,
              },
              authority: Representation.LearnerAuthority.deterministic(
                "terminal:grant:correction-hidden",
                "learner attempted authorization after lineage correction",
              ),
              timeAuthorized: fixture.read.observation.timeObserved + 80,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Artifact.InactiveError", reason: "lineage_correction" })
        expect(
          await fixture.runtime.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).toMatchObject({ use: "historical", representation: { id: accepted.id } })
        await expect(
          fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: restoredDisposition.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Artifact.InactiveError" })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest(
    "tracks external absence, recovery, explicit deletion, and restart without exposing foreign bytes",
    async () => {
      const fixture = await prepareFixture()
      try {
        const accepted = await fixture.runtime.runPromise(
          fixture.representations.accept(acceptance(fixture, "terminal:convert:storage")),
        )
        const budgets = {
          integrityScanBytes: accepted.output.byteLength,
          returnBytes: accepted.output.byteLength,
          records: accepted.output.recordCount,
        }
        const filename = accepted.output.storageKey.split("/").at(-1)
        if (!filename) throw new Error("Expected managed object filename")
        const canonical = await findFile(fixture.directory, filename)
        const displaced = `${canonical}.external`
        await rename(canonical, displaced)
        await expect(
          fixture.runtime.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.UnavailableError", disposition: "externally_missing" })
        expect(await fixture.runtime.runPromise(fixture.representations.get(accepted.id))).toMatchObject({
          availability: { disposition: "externally_missing", version: 2 },
        })

        await rename(displaced, canonical)
        const recovered = await fixture.runtime.runPromise(
          fixture.historical.readHistorical({
            representationRevisionID: accepted.id,
            selection: { type: "whole" },
            budgets,
          }),
        )
        expect(recovered.representation.availability).toMatchObject({ disposition: "available", version: 3 })

        await fixture.runtime.dispose()
        const second = ManagedRuntime.make(appLayer(fixture.database))
        fixture.runtime = second
        fixture.representations = await second.runPromise(Representation.Service)
        fixture.historical = await second.runPromise(Representation.HistoricalReader)
        expect(await second.runPromise(fixture.representations.get(accepted.id))).toMatchObject({
          id: accepted.id,
          availability: { disposition: "available", version: 3 },
        })
        expect(
          await second.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).toMatchObject({ use: "historical", content: { truncated: false } })

        const deletionTime = Date.now() + 10_000
        const deleted = await second.runPromise(
          fixture.representations.explicitlyDelete({
            representationRevisionID: accepted.id,
            expectedAvailabilityVersion: 3,
            integrityScanBytes: accepted.output.byteLength,
            authority: Representation.LearnerAuthority.deterministic(
              "terminal:delete:one",
              "learner explicitly deleted exact representation",
            ),
            timeDeleted: deletionTime,
          }),
        )
        expect(deleted.availability).toMatchObject({ disposition: "explicitly_deleted", version: 4 })
        expect(
          await second.runPromise(
            fixture.representations.explicitlyDelete({
              representationRevisionID: accepted.id,
              expectedAvailabilityVersion: 3,
              integrityScanBytes: accepted.output.byteLength,
              authority: Representation.LearnerAuthority.deterministic(
                "terminal:delete:one",
                "learner explicitly deleted exact representation",
              ),
              timeDeleted: deletionTime + 1,
            }),
          ),
        ).toEqual(deleted)
        await expect(
          second.runPromise(
            fixture.representations.explicitlyDelete({
              representationRevisionID: accepted.id,
              expectedAvailabilityVersion: 4,
              integrityScanBytes: accepted.output.byteLength,
              authority: Representation.LearnerAuthority.deterministic(
                "terminal:delete:one",
                "learner explicitly deleted exact representation",
              ),
              timeDeleted: deletionTime + 1,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.ConflictError", entity: "deletion" })
        await expect(
          second.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.UnavailableError", disposition: "explicitly_deleted" })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest(
    "keeps availability history atomic across mismatch, database failure, concurrent restoration, and restart",
    async () => {
      const fixture = await prepareFixture()
      try {
        const accepted = await fixture.runtime.runPromise(
          fixture.representations.accept(acceptance(fixture, "terminal:availability:atomic")),
        )
        const budgets = {
          integrityScanBytes: accepted.output.byteLength,
          returnBytes: accepted.output.byteLength,
          records: accepted.output.recordCount,
        }
        const filename = accepted.output.storageKey.split("/").at(-1)
        if (!filename) throw new Error("Expected managed object filename")
        const canonical = await findFile(fixture.directory, filename)
        const exact = `${canonical}.exact`

        await rename(canonical, exact)
        await expect(
          fixture.runtime.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.UnavailableError", disposition: "externally_missing" })

        await writeFile(canonical, "foreign bytes")
        await expect(
          fixture.runtime.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.UnavailableError", disposition: "integrity_mismatch" })
        expect(await readFile(canonical, "utf8")).toBe("foreign bytes")
        expect(
          await fixture.runtime.runPromise(
            fixture.databaseService.db.all<{ version: number; disposition: string }>(sql`
              SELECT version, disposition
              FROM representation_availability_event
              WHERE representation_revision_id = ${accepted.id}
              ORDER BY version
            `),
          ),
        ).toEqual([
          { version: 1, disposition: "available" },
          { version: 2, disposition: "externally_missing" },
          { version: 3, disposition: "integrity_mismatch" },
        ])

        await rm(canonical)
        await rename(exact, canonical)
        await fixture.runtime.runPromise(
          fixture.databaseService.db.run(sql`
            CREATE TRIGGER reject_representation_restoration
            BEFORE UPDATE ON representation_availability_current
            BEGIN
              SELECT RAISE(ABORT, 'injected availability failure');
            END
          `),
        )
        const failed = await fixture.runtime.runPromise(
          Effect.exit(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        )
        expect(Exit.isFailure(failed)).toBeTrue()
        await fixture.runtime.runPromise(
          fixture.databaseService.db.run(sql`DROP TRIGGER reject_representation_restoration`),
        )
        expect(
          await fixture.runtime.runPromise(
            fixture.databaseService.db.all<{ version: number }>(sql`
              SELECT version
              FROM representation_availability_event
              WHERE representation_revision_id = ${accepted.id}
              ORDER BY version
            `),
          ),
        ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }])
        expect(await fixture.runtime.runPromise(fixture.representations.get(accepted.id))).toMatchObject({
          id: accepted.id,
          availability: { disposition: "integrity_mismatch", version: 3 },
        })

        const concurrent = await Promise.allSettled(
          [0, 1].map(() =>
            fixture.runtime.runPromise(
              fixture.historical.readHistorical({
                representationRevisionID: accepted.id,
                selection: { type: "whole" },
                budgets,
              }),
            ),
          ),
        )
        expect(concurrent.some((result) => result.status === "fulfilled")).toBeTrue()
        expect(
          await fixture.runtime.runPromise(
            fixture.databaseService.db.all<{ version: number; disposition: string }>(sql`
              SELECT version, disposition
              FROM representation_availability_event
              WHERE representation_revision_id = ${accepted.id}
              ORDER BY version
            `),
          ),
        ).toEqual([
          { version: 1, disposition: "available" },
          { version: 2, disposition: "externally_missing" },
          { version: 3, disposition: "integrity_mismatch" },
          { version: 4, disposition: "available" },
        ])

        await fixture.runtime.dispose()
        const restarted = ManagedRuntime.make(appLayer(fixture.database))
        fixture.runtime = restarted
        fixture.representations = await restarted.runPromise(Representation.Service)
        fixture.historical = await restarted.runPromise(Representation.HistoricalReader)
        fixture.current = await restarted.runPromise(Representation.CurrentUseReader)
        fixture.databaseService = await restarted.runPromise(Database.Service)
        expect(await restarted.runPromise(fixture.representations.get(accepted.id))).toMatchObject({
          id: accepted.id,
          effectID: accepted.effectID,
          availability: { disposition: "available", version: 4 },
        })
        expect(
          await restarted.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: accepted.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).toMatchObject({ use: "historical", representation: { id: accepted.id } })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest(
    "keeps unaccepted retry receipts semantic-neutral and deletion recovery atomic across restart",
    async () => {
      const fixture = await prepareFixture()
      try {
        const abandoned = acceptance(fixture, "terminal:retry:fresh-receipt")
        expect(
          await fixture.runtime.runPromise(
            Effect.scoped(fixture.representations.prepareAcceptance(abandoned).pipe(Effect.map((value) => value.type))),
          ),
        ).toBe("candidate")
        const freshRead = await fixture.runtime.runPromise(
          fixture.roots.read({ contentRootID: fixture.root.id, relativePath: "source.pdf", maxBytes: 1024 * 1024 }),
        )
        if (freshRead.observation.result !== "present") throw new Error("Expected fresh exact source receipt")
        const retry = acceptance(fixture, "terminal:retry:fresh-receipt")
        const retried = await fixture.runtime.runPromise(
          fixture.representations.accept({
            ...retry,
            sourceProof: {
              ...retry.sourceProof,
              authorization: freshRead.authorization,
              descriptor: freshRead.observation.descriptor,
              timeObserved: freshRead.observation.timeObserved,
            },
            timeAccepted: freshRead.observation.timeObserved + 1,
          }),
        )
        const independent = await fixture.runtime.runPromise(
          fixture.representations.accept(acceptance(fixture, "terminal:retry:independent")),
        )
        expect(retried.id).not.toBe(abandoned.candidateRevisionID)
        expect(independent.id).not.toBe(retried.id)
        expect(independent.effectID).not.toBe(retried.effectID)
        expect(independent.output.storageKey).not.toBe(retried.output.storageKey)
        expect(independent.output.digest).toBe(retried.output.digest)

        const budgets = {
          integrityScanBytes: retried.output.byteLength,
          returnBytes: retried.output.byteLength,
          records: retried.output.recordCount,
        }
        await fixture.runtime.runPromise(
          fixture.databaseService.db.run(sql`
            CREATE TRIGGER reject_representation_deletion
            BEFORE INSERT ON representation_availability_event
            WHEN NEW.disposition = 'explicitly_deleted'
            BEGIN
              SELECT RAISE(ABORT, 'injected deletion failure');
            END
          `),
        )
        const failed = await fixture.runtime.runPromise(
          Effect.exit(
            fixture.representations.explicitlyDelete({
              representationRevisionID: retried.id,
              expectedAvailabilityVersion: 1,
              integrityScanBytes: retried.output.byteLength,
              authority: Representation.LearnerAuthority.deterministic(
                "terminal:delete:rollback",
                "learner requested exact deletion",
              ),
              timeDeleted: retried.timeAccepted + 10,
            }),
          ),
        )
        expect(Exit.isFailure(failed)).toBeTrue()
        await fixture.runtime.runPromise(
          fixture.databaseService.db.run(sql`DROP TRIGGER reject_representation_deletion`),
        )
        expect(await fixture.runtime.runPromise(fixture.representations.get(retried.id))).toMatchObject({
          availability: { disposition: "available", version: 1 },
        })
        expect(
          await fixture.runtime.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: retried.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).toMatchObject({ use: "historical" })

        const store = await open(fixture.database)
        const prepared = await store.prepareDeletion(
          {
            key: parseKey(retried.output.storageKey),
            digest: retried.output.digest,
            byteLength: retried.output.byteLength,
          },
          retried.output.byteLength,
        )
        if (prepared.status !== "moved") throw new Error("Expected retained deletion stage")
        await prepared.release()
        await fixture.runtime.dispose()
        const restarted = ManagedRuntime.make(appLayer(fixture.database))
        fixture.runtime = restarted
        fixture.representations = await restarted.runPromise(Representation.Service)
        fixture.historical = await restarted.runPromise(Representation.HistoricalReader)
        fixture.current = await restarted.runPromise(Representation.CurrentUseReader)
        fixture.databaseService = await restarted.runPromise(Database.Service)
        expect(
          await restarted.runPromise(
            fixture.representations.reconcileAvailability({
              representationRevisionID: retried.id,
              integrityScanBytes: retried.output.byteLength,
            }),
          ),
        ).toMatchObject({ availability: { disposition: "available", version: 1 } })

        const retriedFilename = retried.output.storageKey.split("/").at(-1)
        if (!retriedFilename) throw new Error("Expected retried managed filename")
        const retriedCanonical = await findFile(fixture.directory, retriedFilename)
        const fileSystem = await import("node:fs/promises")
        const writer = await fileSystem.open(retriedCanonical, "r+")
        try {
          await expect(
            restarted.runPromise(
              fixture.representations.explicitlyDelete({
                representationRevisionID: retried.id,
                expectedAvailabilityVersion: 1,
                integrityScanBytes: retried.output.byteLength,
                authority: Representation.LearnerAuthority.deterministic(
                  "terminal:delete:busy",
                  "learner requested exact deletion",
                ),
                timeDeleted: retried.timeAccepted + 20,
              }),
            ),
          ).rejects.toMatchObject({ _tag: "Representation.StorageError", reason: "busy" })
        } finally {
          await writer.close()
        }
        expect(await restarted.runPromise(fixture.representations.get(retried.id))).toMatchObject({
          availability: { disposition: "available", version: 1 },
        })

        const retainedExternal = `${retriedCanonical}.external`
        await rename(retriedCanonical, retainedExternal)
        const deleted = await restarted.runPromise(
          fixture.representations.explicitlyDelete({
            representationRevisionID: retried.id,
            expectedAvailabilityVersion: 1,
            integrityScanBytes: retried.output.byteLength,
            authority: Representation.LearnerAuthority.deterministic(
              "terminal:delete:missing",
              "learner requested exact deletion",
            ),
            timeDeleted: retried.timeAccepted + 30,
          }),
        )
        expect(deleted.availability).toMatchObject({ disposition: "explicitly_deleted", version: 2 })
        expect(await readFile(retainedExternal)).toEqual(Buffer.from(encodedProfile()))

        const independentFilename = independent.output.storageKey.split("/").at(-1)
        if (!independentFilename) throw new Error("Expected independent managed filename")
        const independentCanonical = await findFile(fixture.directory, independentFilename)
        await writeFile(independentCanonical, "foreign independent bytes")
        await expect(
          restarted.runPromise(
            fixture.representations.explicitlyDelete({
              representationRevisionID: independent.id,
              expectedAvailabilityVersion: 1,
              integrityScanBytes: independent.output.byteLength,
              authority: Representation.LearnerAuthority.deterministic(
                "terminal:delete:mismatch",
                "learner requested exact deletion",
              ),
              timeDeleted: independent.timeAccepted + 30,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.UnavailableError", disposition: "integrity_mismatch" })
        expect(await readFile(independentCanonical, "utf8")).toBe("foreign independent bytes")

        await fixture.runtime.dispose()
        const afterDeletion = ManagedRuntime.make(appLayer(fixture.database))
        fixture.runtime = afterDeletion
        fixture.representations = await afterDeletion.runPromise(Representation.Service)
        fixture.historical = await afterDeletion.runPromise(Representation.HistoricalReader)
        fixture.current = await afterDeletion.runPromise(Representation.CurrentUseReader)
        fixture.databaseService = await afterDeletion.runPromise(Database.Service)
        expect(await afterDeletion.runPromise(fixture.representations.get(retried.id))).toMatchObject({
          availability: { disposition: "explicitly_deleted", version: 2 },
        })
        expect(await afterDeletion.runPromise(fixture.representations.get(independent.id))).toMatchObject({
          availability: { disposition: "integrity_mismatch", version: 2 },
        })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest(
    "rejects inactive conversion and grant issuance while preserving an exact active grant across restoration and restart",
    async () => {
      const fixture = await prepareFixture()
      try {
        const accepted = await fixture.runtime.runPromise(
          fixture.representations.accept(acceptance(fixture, "terminal:grant:restoration")),
        )
        const initiallyWithdrawn = await fixture.runtime.runPromise(
          fixture.artifacts.withdraw({
            artifactID: fixture.artifact.id,
            expectedDispositionVersion: fixture.artifact.dispositionVersion,
          }),
        )
        await expect(
          fixture.runtime.runPromise(
            fixture.representations.accept(acceptance(fixture, "terminal:conversion:withdrawn")),
          ),
        ).rejects.toMatchObject({ _tag: "Artifact.InactiveError" })
        const initiallyRestored = await fixture.runtime.runPromise(
          fixture.artifacts.restore({
            artifactID: fixture.artifact.id,
            expectedDispositionVersion: initiallyWithdrawn.dispositionVersion,
          }),
        )

        const secondBytes = new TextEncoder().encode("source revision for grant restoration")
        const second = await fixture.runtime.runPromise(
          fixture.artifacts.observe({
            expected: Artifact.expectedSource(initiallyRestored),
            observation: {
              result: "present",
              fingerprint: { algorithm: "sha256", digest: digest(secondBytes), byteLength: secondBytes.byteLength },
              mediaType: "application/pdf",
              observer: observer(fixture.read.authorization),
              timeObserved: fixture.read.observation.timeObserved + 20,
            },
          }),
        )
        const secondRevisionID = second.artifact.source.currentRevisionID
        const secondAttribution = second.artifact.source.revisionAttribution
        if (!secondRevisionID || !secondAttribution) throw new Error("Expected current drift Revision")
        const expectedArtifact = {
          effectiveArtifactID: second.artifact.id,
          dispositionVersion: second.artifact.dispositionVersion,
          currentRevisionID: secondRevisionID,
          attribution: secondAttribution,
          lineageVersion: second.artifact.lineageVersion,
        }
        const grant = await fixture.runtime.runPromise(
          fixture.representations.authorizeContinuedUse({
            representationRevisionID: accepted.id,
            expectedArtifact,
            authority: Representation.LearnerAuthority.deterministic(
              "terminal:grant:active-restoration",
              "learner authorized the exact old/current pair",
            ),
            timeAuthorized: accepted.timeAccepted + 30,
          }),
        )
        const withdrawn = await fixture.runtime.runPromise(
          fixture.artifacts.withdraw({
            artifactID: second.artifact.id,
            expectedDispositionVersion: second.artifact.dispositionVersion,
          }),
        )
        await expect(
          fixture.runtime.runPromise(
            fixture.representations.authorizeContinuedUse({
              representationRevisionID: accepted.id,
              expectedArtifact,
              authority: Representation.LearnerAuthority.deterministic(
                "terminal:grant:withdrawn",
                "learner attempted authorization while withdrawn",
              ),
              timeAuthorized: accepted.timeAccepted + 40,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Artifact.InactiveError" })
        await expect(
          fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: accepted.sourceProof.ordinary.effectiveArtifactID,
              selection: { type: "whole" },
              budgets: {
                integrityScanBytes: accepted.output.byteLength,
                returnBytes: accepted.output.byteLength,
                records: accepted.output.recordCount,
              },
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Artifact.InactiveError" })
        const restored = await fixture.runtime.runPromise(
          fixture.artifacts.restore({
            artifactID: second.artifact.id,
            expectedDispositionVersion: withdrawn.dispositionVersion,
          }),
        )
        const budgets = {
          integrityScanBytes: accepted.output.byteLength,
          returnBytes: accepted.output.byteLength,
          records: accepted.output.recordCount,
        }
        expect(
          await fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: restored.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).toMatchObject({ admission: { basis: "continued_use_grant", grantID: grant.id, grantVersion: grant.version } })
        await expect(
          fixture.runtime.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: createArtifactID(),
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.CurrentUseDeniedError", reason: "wrong_artifact" })

        await fixture.runtime.dispose()
        const restarted = ManagedRuntime.make(appLayer(fixture.database))
        fixture.runtime = restarted
        fixture.representations = await restarted.runPromise(Representation.Service)
        fixture.historical = await restarted.runPromise(Representation.HistoricalReader)
        fixture.current = await restarted.runPromise(Representation.CurrentUseReader)
        fixture.databaseService = await restarted.runPromise(Database.Service)
        expect(
          await restarted.runPromise(
            fixture.representations.listContinuedUseGrants({ effectiveArtifactID: restored.id }),
          ),
        ).toMatchObject([{ id: grant.id, disposition: "active", version: grant.version }])
        expect(
          await restarted.runPromise(
            fixture.current.readForCurrentUse({
              representationRevisionID: accepted.id,
              effectiveArtifactID: restored.id,
              selection: { type: "whole" },
              budgets,
            }),
          ),
        ).toMatchObject({ admission: { basis: "continued_use_grant", grantID: grant.id } })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest(
    "hashes a complete large object before returning one bounded page and rejects a wrong Revision ID",
    async () => {
      const fixture = await prepareFixture()
      try {
        const profile = PDFTextProfile.encode([
          { page: 1, items: [{ text: "small first page", lineBreakAfter: false }] },
          { page: 2, items: [{ text: "x".repeat(512 * 1024), lineBreakAfter: false }] },
        ])
        if (!profile.ok) throw new Error(profile.error)
        const input = acceptance(
          fixture,
          "terminal:read:large-object",
          Representation.createRevisionID(),
          profile.value.bytes,
        )
        const accepted = await fixture.runtime.runPromise(fixture.representations.accept(input))
        const firstRecordBytes = profile.value.records[0]!.end - profile.value.records[0]!.start
        const bounded = await fixture.runtime.runPromise(
          fixture.historical.readHistorical({
            representationRevisionID: accepted.id,
            selection: { type: "pdf_pages", startPage: 1 },
            budgets: {
              integrityScanBytes: accepted.output.byteLength,
              returnBytes: firstRecordBytes,
              records: 1,
            },
          }),
        )
        expect(accepted.output.byteLength).toBeGreaterThan(bounded.content.bytes.byteLength * 1_000)
        expect(bounded.content).toMatchObject({ records: 1, nextPage: 2, truncated: true })
        await expect(
          fixture.runtime.runPromise(
            fixture.historical.readHistorical({
              representationRevisionID: Representation.createRevisionID(),
              selection: { type: "whole" },
              budgets: {
                integrityScanBytes: accepted.output.byteLength,
                returnBytes: accepted.output.byteLength,
                records: accepted.output.recordCount,
              },
            }),
          ),
        ).rejects.toMatchObject({ _tag: "Representation.NotFoundError" })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest("derives cleanup references from accepted rows and reclaims only old same-store orphans", async () => {
    const fixture = await prepareFixture()
    try {
      const accepted = await fixture.runtime.runPromise(
        fixture.representations.accept(acceptance(fixture, "terminal:cleanup:accepted")),
      )
      const store = await open(fixture.database)
      const orphanBytes = new TextEncoder().encode("unreferenced managed output")
      const orphan = await store.publish(Representation.createRevisionID(), orphanBytes, digest(orphanBytes))
      await orphan.release()
      const orphanFilename = orphan.key.split("/").at(-1)
      if (!orphanFilename) throw new Error("Expected orphan managed filename")
      const orphanPath = await findFile(fixture.directory, orphanFilename)

      expect(
        await fixture.runtime.runPromise(
          fixture.representations.cleanup({ now: Date.now() + 10_000, minimumAgeMs: 1_000 }),
        ),
      ).toEqual({ canonicalObjects: 1, publicationStages: 0, deletionStages: 0 })
      await expect(readFile(orphanPath)).rejects.toThrow()
      expect(
        await fixture.runtime.runPromise(
          fixture.historical.readHistorical({
            representationRevisionID: accepted.id,
            selection: { type: "whole" },
            budgets: {
              integrityScanBytes: accepted.output.byteLength,
              returnBytes: accepted.output.byteLength,
              records: accepted.output.recordCount,
            },
          }),
        ),
      ).toMatchObject({ use: "historical", representation: { id: accepted.id } })
    } finally {
      await closeFixture(fixture)
    }
  })
})

async function findFile(directory: string, filename: string): Promise<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name)
    if (entry.isFile() && entry.name === filename) return child
    if (entry.isDirectory()) {
      const nested = await findFile(child, filename).catch(() => undefined)
      if (nested) return nested
    }
  }
  throw new Error(`Managed object ${filename} was not found`)
}
