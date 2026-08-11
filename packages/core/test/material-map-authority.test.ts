import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { sql } from "drizzle-orm"
import { Deferred, Effect, Layer, ManagedRuntime } from "effect"
import { AdvisoryPlanSuggestion } from "@opencode-ai/core/advisory-plan-suggestion"
import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { Representation } from "@opencode-ai/core/representation"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import {
  applyAdvisoryPlanSuggestionInvocation,
  seedAdvisoryPlanSuggestionInvocation,
} from "./fixture/advisory-plan-suggestion"

const windowsTest = process.platform === "win32" ? test : test.skip

function appLayer(filename: string) {
  return LayerNode.compile(
    LayerNode.group([
      MaterialMap.node,
      MaterialMap.currentUseReaderNode,
      MaterialMap.tutorCurrentUseReaderNode,
      Course.node,
      Representation.node,
      Representation.currentUseReaderNode,
      Representation.tutorCurrentUseReaderNode,
      Artifact.node,
      ContentRoot.node,
      Database.node,
    ]),
    [[Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)]],
  )
}

type Fixture = Awaited<ReturnType<typeof prepareFixture>>

async function prepareFixture(materialsName = "materials") {
  const directory = await mkdtemp(path.join(tmpdir(), "repa-material-map-"))
  const filename = path.join(directory, "learner-home.db")
  const materialsDirectory = path.join(directory, materialsName)
  const source = path.join(materialsDirectory, "source.pdf")
  const clone = path.join(materialsDirectory, "clone.pdf")
  const bytes = new TextEncoder().encode("Introduction🙂\nSecond section\n")
  await mkdir(materialsDirectory)
  await writeFile(source, bytes)
  await writeFile(clone, bytes)
  const runtime = ManagedRuntime.make(appLayer(filename))
  const roots = await runtime.runPromise(ContentRoot.Service)
  const artifacts = await runtime.runPromise(Artifact.Service)
  const representations = await runtime.runPromise(Representation.Service)
  const representationCurrent = await runtime.runPromise(Representation.CurrentUseReader)
  const courses = await runtime.runPromise(Course.Service)
  const maps = await runtime.runPromise(MaterialMap.Service)
  const current = await runtime.runPromise(MaterialMap.CurrentUseReader)
  const tutor = await runtime.runPromise(MaterialMap.TutorCurrentUseReader)
  const database = await runtime.runPromise(Database.Service)
  const proposal = await runtime.runPromise(roots.propose(materialsDirectory))
  const root = await runtime.runPromise(
    roots.approve({
      proposal,
      approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Gate 13 test material root"),
    }),
  )
  const read = await runtime.runPromise(
    roots.read({ contentRootID: root.id, relativePath: "source.pdf", maxBytes: 1024 * 1024 }),
  )
  if (read.observation.result !== "present") throw new Error("Expected source bytes")
  const presentRead = { ...read, observation: read.observation }
  const artifact = await runtime.runPromise(
    artifacts.admit({
      location: Artifact.CanonicalLocation.trusted(presentRead.observation.descriptor.canonicalPath),
      observation: {
        result: "present",
        fingerprint: presentRead.observation.fingerprint,
        mediaType: presentRead.observation.mediaType,
        observer: observer(presentRead.authorization),
        timeObserved: presentRead.observation.timeObserved,
      },
      authority: Artifact.Admission.learnerInstruction("Gate 13 test admission", 1),
    }),
  )
  if (!artifact.source.currentRevisionID || !artifact.source.revisionAttribution) {
    throw new Error("Expected exact Artifact Revision")
  }
  const revision = await runtime.runPromise(
    artifacts.getRevision(artifact.id, artifact.source.currentRevisionID, artifact.source.revisionAttribution),
  )
  return {
    directory,
    filename,
    source,
    clone,
    bytes,
    runtime,
    roots,
    artifacts,
    representations,
    representationCurrent,
    courses,
    maps,
    current,
    tutor,
    database,
    root,
    read: presentRead,
    artifact,
    revision,
  }
}

async function closeFixture(fixture: Fixture) {
  await fixture.runtime.dispose()
  await rm(fixture.directory, { recursive: true, force: true })
}

describe("Material Map authority", () => {
  windowsTest(
    "projects a real Material selector into advisory currentness without rewriting the advice",
    async () => {
      const fixture = await prepareFixture()
      try {
        const input = artifactMapInput(fixture)
        const map = await fixture.runtime.runPromise(fixture.maps.createMap(input))
        const selectorID = input.proposal.outline[1]!.selectors[0]!.id
        const ref = { type: "material_selector" as const, mapID: map.id, selectorID }
        const time = Date.now() + 1_000
        const invocation = await fixture.runtime.runPromise(
          seedAdvisoryPlanSuggestionInvocation(
            fixture.database.db,
            "material_reference",
            {
              cause: {
                type: "proactive_tutor_proposal",
                rationale: "Keep one exact-material teaching suggestion inspectable without changing the map.",
              },
              intents: [
                {
                  operation: "create",
                  operationOrdinal: 0,
                  createOrdinal: 0,
                  snapshot: {
                    learnerVisibleScope: "Exact source-section learning approach",
                    retrievalScope: {
                      type: "anchored",
                      anchors: [
                        {
                          stableOwnerKey: { type: "material_selector", mapID: map.id, selectorID },
                          exactBoundRef: ref,
                        },
                      ],
                    },
                    purpose: "Keep advice tied to an exact inspectable source selector.",
                    directorySummary: "Read the selected source section before attempting transfer.",
                    body: "Read the exact selected section, explain its central invariant, then try one transfer example.",
                    exactBasisRefs: [ref],
                    assumptionsAndUncertainty: "Material availability is owner truth; the advice remains fallible.",
                  },
                },
              ],
            },
            "Keep this material-specific learning approach available.",
            time,
          ),
        )
        const applied = await fixture.runtime.runPromise(
          applyAdvisoryPlanSuggestionInvocation(fixture.database.db, invocation, time + 2),
        )
        if (applied.type !== "settled" || applied.settlement.outcome !== "applied") {
          throw new Error("Expected the Material-backed suggestion")
        }
        const result = applied.settlement.intentResults[0]
        if (!result || result.outcome !== "changed") throw new Error("Expected one Material-backed revision")
        const before = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            AdvisoryPlanSuggestion.readCurrent(tx, result.suggestionID, time + 10),
          ),
        )
        expect(before).toMatchObject({
          retrievalAnchorRelations: [{ exactBoundRef: ref, relation: { state: "current" } }],
          basisDependencies: [{ ref, state: "current" }],
        })

        await fixture.runtime.runPromise(
          fixture.maps.withdrawMap({ mapID: map.id, expectedVersion: 0, reason: "source outline withdrawn" }),
        )
        const after = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            AdvisoryPlanSuggestion.readCurrent(tx, result.suggestionID, time + 20),
          ),
        )
        expect(after).toMatchObject({
          retrievalAnchorRelations: [{ exactBoundRef: ref, relation: { state: "source_unavailable" } }],
          basisDependencies: [{ ref, state: "source_unavailable" }],
        })
        expect(after?.revision).toEqual(before?.revision)
      } finally {
        await closeFixture(fixture)
      }
    },
    120_000,
  )

  windowsTest("rejects Map ABA between pinned Tutor locator inspection and byte admission", async () => {
    const fixture = await prepareFixture()
    try {
      const input = artifactMapInput(fixture)
      const map = await fixture.runtime.runPromise(fixture.maps.createMap(input))
      const selectorID = input.proposal.outline[1]!.selectors[1]!.id
      const selector = await fixture.runtime.runPromise(fixture.maps.getSelector(map.id, selectorID))
      const inspected = await fixture.runtime.runPromise(
        fixture.database.db.transaction((tx) =>
          MaterialMap.inspectTutorAccess(tx, {
            mapID: map.id,
            mapDispositionVersion: 0,
            selectorID,
            selectorCoordinate: selector.coordinate,
            selectorWitness: selector.witness,
            target: input.proposal.target,
          }),
        ),
      )
      const invocation = ContentRoot.CurrentLocalReadInvocation.trusted("gate18-aba-read", "gate18-test-profile")
      const read = await fixture.runtime.runPromise(
        fixture.roots.prepareLocalRead({
          authority: { type: "content_root", contentRootID: fixture.root.id },
          path: fixture.source,
          maxBytes: 1024 * 1024,
          invocation,
        }),
      )
      await fixture.runtime.runPromise(
        fixture.maps.withdrawMap({ mapID: map.id, expectedVersion: 0, reason: "ABA before Tutor admission" }),
      )
      await fixture.runtime.runPromise(fixture.maps.restoreMap({ mapID: map.id, expectedVersion: 1 }))

      const failure = await fixture.runtime.runPromise(
        Effect.flip(
          fixture.tutor.resolveSelector({
            mapID: map.id,
            selectorID,
            accessProof: inspected.proof,
            access: { type: "artifact", read, invocation },
            budgets: {
              artifactBytes: 1024 * 1024,
              representation: { integrityScanBytes: 1024 * 1024, returnBytes: 32_000, records: 64 },
            },
          }),
        ),
      )
      expect(failure).toBeInstanceOf(MaterialMap.PreparationError)
      if (failure instanceof MaterialMap.PreparationError) expect(failure.code).toBe("stale_target")
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest("expands exact Gate 18 metadata without bytes and fails closed after Map drift", async () => {
    const fixture = await prepareFixture()
    try {
      const mapInput = artifactMapInput(fixture)
      const map = await fixture.runtime.runPromise(fixture.maps.createMap(mapInput))
      const course = await createCourseEndpoint(fixture, "Pinned material")
      const draft = alignmentInput(map.id, mapInput.proposal.outline[1]!.selectors[0]!.id, course.endpoints[0]!)
      const alignment = await fixture.runtime.runPromise(
        fixture.maps.createAlignment({ ...draft, access: mapInput.access }),
      )
      const projection = await fixture.runtime.runPromise(
        fixture.database.db.transaction((tx) =>
          MaterialMap.projectLearningContext(tx, { endpoints: [course.endpoints[0]!], limit: 8 }),
        ),
      )
      const entry = projection.entries.find((value) => value.alignment.id === alignment.id)
      if (!entry) throw new Error("Expected projected material locator")
      const locator = MaterialMap.learningContextLocator(entry, { metadata: true, tutor: true })
      const frontier = await fixture.runtime.runPromise(
        fixture.database.db.get<{ sequence: number }>(
          sql`SELECT sequence FROM learning_shared_frontier WHERE singleton = 1`,
        ),
      )

      const exact = await fixture.runtime.runPromise(fixture.maps.readLearningContextMetadata(locator))
      expect(exact).toMatchObject({
        type: "available",
        relation: "exact",
        value: {
          alignment: { id: alignment.id },
          map: { id: map.id },
          selector: { id: mapInput.proposal.outline[1]!.selectors[0]!.id },
          target: { type: "artifact" },
        },
      })
      expect(JSON.stringify(exact)).not.toContain('"bytes"')
      expect(
        await fixture.runtime.runPromise(
          fixture.database.db.get<{ sequence: number }>(
            sql`SELECT sequence FROM learning_shared_frontier WHERE singleton = 1`,
          ),
        ),
      ).toEqual(frontier)

      await fixture.runtime.runPromise(
        fixture.maps.withdrawMap({ mapID: map.id, expectedVersion: 0, reason: "later correction" }),
      )
      const afterCorrection = await fixture.runtime.runPromise(
        fixture.database.db.get<{ sequence: number }>(
          sql`SELECT sequence FROM learning_shared_frontier WHERE singleton = 1`,
        ),
      )
      expect(await fixture.runtime.runPromise(fixture.maps.readLearningContextMetadata(locator))).toMatchObject({
        type: "superseded",
        currentLocator: { map: { id: map.id, disposition: { version: 1, value: "withdrawn" } } },
      })
      expect(
        await fixture.runtime.runPromise(
          fixture.database.db.get<{ sequence: number }>(
            sql`SELECT sequence FROM learning_shared_frontier WHERE singleton = 1`,
          ),
        ),
      ).toEqual(afterCorrection)

      expect(
        await fixture.runtime.runPromise(
          fixture.maps.readLearningContextMetadata({
            ...locator,
            alignment: { ...locator.alignment, id: MaterialMap.createAlignmentID() },
          }),
        ),
      ).toEqual({ type: "unavailable", cause: "alignment_not_found" })
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest(
    "accepts Unicode case-bearing Artifact paths across Representation and Material persistence",
    async () => {
      const fixture = await prepareFixture("Ä-materials")
      try {
        if (fixture.read.observation.result !== "present") throw new Error("Expected Unicode-path source bytes")
        expect(fixture.read.observation.descriptor.canonicalPath).toContain("Ä-materials")
        expect(fixture.read.observation.descriptor.canonicalPathKey).toContain("ä-materials")

        const artifactInput = artifactMapInput(fixture)
        const artifactMap = await fixture.runtime.runPromise(fixture.maps.createMap(artifactInput))
        expect(artifactMap).toMatchObject({
          id: artifactInput.mapID,
          target: { type: "artifact", effectiveArtifactID: fixture.artifact.id, revisionID: fixture.revision.id },
        })

        const representation = await acceptRepresentation(fixture)
        const representationInput = representationMapInput(fixture, representation)
        const representationMap = await fixture.runtime.runPromise(fixture.maps.createMap(representationInput))
        expect(representationMap).toMatchObject({
          id: representationInput.mapID,
          target: { type: "representation", representationRevisionID: representation.id },
        })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest(
    "owns exact Artifact Maps, alternatives, source provenance, replay, media correction, and withdrawal",
    async () => {
      const fixture = await prepareFixture()
      try {
        const first = artifactMapInput(fixture)
        const created = await fixture.runtime.runPromise(fixture.maps.createMap(first))
        expect(created).toMatchObject({
          id: first.mapID,
          target: {
            type: "artifact",
            effectiveArtifactID: fixture.artifact.id,
            revisionID: fixture.revision.id,
            fingerprint: fixture.revision.fingerprint,
            mediaType: fixture.read.observation.mediaType,
          },
          disposition: { version: 0, disposition: "active" },
          superseded: false,
        })

        const outlineFirst = await fixture.runtime.runPromise(fixture.maps.listOutline(created.id, { limit: 1 }))
        expect(outlineFirst.items).toMatchObject([{ title: "Material structure", selectors: [] }])
        expect(outlineFirst.cursor).toBeString()
        const outlineSecond = await fixture.runtime.runPromise(
          fixture.maps.listOutline(created.id, { limit: 1, cursor: outlineFirst.cursor }),
        )
        expect(outlineSecond.items[0]).toMatchObject({
          title: "Opening passage",
          selectors: [
            { coordinate: { kind: "whole_target.v1" } },
            { coordinate: { kind: "artifact_byte_range.v1", startByte: 0, endByte: 12 } },
          ],
        })
        await expect(
          fixture.runtime.runPromise(
            fixture.maps.listMaps({ target: first.proposal.target, cursor: outlineFirst.cursor }),
          ),
        ).rejects.toMatchObject({ _tag: "MaterialMap.InvalidCursorError" })

        const afterCreate = await fixture.runtime.runPromise(
          fixture.database.db.get<{ sequence: number }>(
            sql`SELECT sequence FROM learning_shared_frontier WHERE singleton = 1`,
          ),
        )
        const replay = await fixture.runtime.runPromise(fixture.maps.createMap(first))
        const afterReplay = await fixture.runtime.runPromise(
          fixture.database.db.get<{ sequence: number }>(
            sql`SELECT sequence FROM learning_shared_frontier WHERE singleton = 1`,
          ),
        )
        expect(replay).toEqual(created)
        expect(afterReplay).toEqual(afterCreate)

        await expect(
          fixture.runtime.runPromise(
            fixture.maps.createMap({
              ...first,
              proposal: {
                ...first.proposal,
                outline: first.proposal.outline.map((node, index) =>
                  index === 1 ? { ...node, title: "Changed semantic input" } : node,
                ),
              },
              access: { type: "representation" },
            }),
          ),
        ).rejects.toMatchObject({ _tag: "MaterialMap.ConflictError", entity: "map", id: first.mapID })

        const alternative = artifactMapInput(fixture)
        const second = await fixture.runtime.runPromise(fixture.maps.createMap(alternative))
        expect(second.id).not.toBe(created.id)
        const alternatives = await fixture.runtime.runPromise(
          fixture.maps.listMaps({ target: first.proposal.target, includeSuperseded: true }),
        )
        expect(new Set(alternatives.items.map((map) => map.id))).toEqual(new Set([created.id, second.id]))

        const observationsBefore = (
          await fixture.runtime.runPromise(fixture.artifacts.listObservations(fixture.artifact.id))
        ).items.length
        const wrongPath = artifactMapInput(fixture, {
          access: {
            type: "artifact",
            source: MaterialMap.MaterialTarget.ArtifactSourceSelection.explicitLearner({
              root: fixture.root,
              relativePath: "clone.pdf",
              basis: "learner selected the displayed overlapping root episode",
              capabilityIdentity: "repa.test.material-source",
              capabilityVersion: 1,
            }),
          },
        })
        await expect(fixture.runtime.runPromise(fixture.maps.createMap(wrongPath))).rejects.toMatchObject({
          _tag: "MaterialMap.PreparationError",
          code: "source_provenance",
        })
        expect(
          (await fixture.runtime.runPromise(fixture.artifacts.listObservations(fixture.artifact.id))).items,
        ).toHaveLength(observationsBefore)
        await expect(fixture.runtime.runPromise(fixture.maps.getMap(wrongPath.mapID))).rejects.toMatchObject({
          _tag: "MaterialMap.NotFoundError",
        })

        const currentArtifact = await fixture.runtime.runPromise(fixture.artifacts.getArtifact(fixture.artifact.id))
        const corrected = await fixture.runtime.runPromise(
          fixture.artifacts.correctObservation({
            observationID: currentArtifact.source.descriptor!.observationID,
            expectedPredecessorCorrectionID: currentArtifact.source.descriptor!.correctionID,
            mediaType: "application/x-gate13-corrected",
            authority: Artifact.ObservationCorrectionAuthority.learnerCorrection("learner", 1),
            expectedArtifacts: [Artifact.expectedSource(currentArtifact)],
          }),
        )
        expect(corrected.affectedArtifacts[0]!.source.descriptor?.mediaType).toBe("application/x-gate13-corrected")
        expect((await fixture.runtime.runPromise(fixture.maps.getMap(created.id))).target).toMatchObject({
          mediaType: fixture.read.observation.mediaType,
        })

        const rangeSelectorID = first.proposal.outline[1]!.selectors[1]!.id
        const resolved = await fixture.runtime.runPromise(
          fixture.current.resolveSelector({
            mapID: created.id,
            selectorID: rangeSelectorID,
            access: first.access,
            budgets: materialBudgets(),
          }),
        )
        expect(resolved.bytes).toEqual(fixture.bytes.slice(0, 12))

        const withdrawn = await fixture.runtime.runPromise(
          fixture.maps.withdrawMap({ mapID: created.id, expectedVersion: 0, reason: "learner hid this outline" }),
        )
        expect(withdrawn.disposition).toMatchObject({ version: 1, disposition: "withdrawn" })
        await expect(
          fixture.runtime.runPromise(
            fixture.current.resolveSelector({
              mapID: created.id,
              selectorID: rangeSelectorID,
              access: first.access,
              budgets: materialBudgets(),
            }),
          ),
        ).rejects.toMatchObject({ _tag: "MaterialMap.InactiveError", entity: "map" })
        const restored = await fixture.runtime.runPromise(
          fixture.maps.restoreMap({ mapID: created.id, expectedVersion: 1 }),
        )
        expect(restored.disposition).toMatchObject({ version: 2, disposition: "active" })
        await expect(
          fixture.runtime.runPromise(
            fixture.maps.withdrawMap({ mapID: created.id, expectedVersion: 0, reason: "stale ABA caller" }),
          ),
        ).rejects.toMatchObject({ _tag: "MaterialMap.ConflictError", entity: "map_state" })
        expect(
          (await fixture.runtime.runPromise(fixture.maps.listMapDispositions(created.id))).items.map((event) => [
            event.version,
            event.disposition,
          ]),
        ).toEqual([
          [0, "active"],
          [1, "withdrawn"],
          [2, "active"],
        ])
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest("discards buffered selector content when Map withdrawal or owner ABA wins final disclosure", async () => {
    const fixture = await prepareFixture()
    try {
      const input = artifactMapInput(fixture)
      const map = await fixture.runtime.runPromise(fixture.maps.createMap(input))
      const selectorID = input.proposal.outline[1]!.selectors[1]!.id

      const withdrawalReached = await fixture.runtime.runPromise(Deferred.make<void>())
      const withdrawalRelease = await fixture.runtime.runPromise(Deferred.make<void>())
      const originalRead = fixture.roots.read
      const restoreWithdrawalRead = replaceMethod(fixture.roots, "read", (request) =>
        originalRead(request).pipe(
          Effect.tap(() =>
            Deferred.succeed(withdrawalReached, undefined).pipe(Effect.andThen(Deferred.await(withdrawalRelease))),
          ),
        ),
      )
      const withdrawalRead = fixture.runtime.runPromise(
        fixture.current.resolveSelector({
          mapID: map.id,
          selectorID,
          access: input.access,
          budgets: materialBudgets(),
        }),
      )
      try {
        await fixture.runtime.runPromise(Deferred.await(withdrawalReached).pipe(Effect.timeout("5 seconds")))
        await fixture.runtime.runPromise(
          fixture.maps.withdrawMap({ mapID: map.id, expectedVersion: 0, reason: "withdrawal won disclosure" }),
        )
        await fixture.runtime.runPromise(Deferred.succeed(withdrawalRelease, undefined))
        await expect(withdrawalRead).rejects.toMatchObject({ _tag: "MaterialMap.InactiveError", entity: "map" })
      } finally {
        await fixture.runtime.runPromise(Deferred.succeed(withdrawalRelease, undefined))
        restoreWithdrawalRead()
        await withdrawalRead.catch(() => undefined)
      }
      await fixture.runtime.runPromise(fixture.maps.restoreMap({ mapID: map.id, expectedVersion: 1 }))

      const abaReached = await fixture.runtime.runPromise(Deferred.make<void>())
      const abaRelease = await fixture.runtime.runPromise(Deferred.make<void>())
      const abaOriginalRead = fixture.roots.read
      const restoreABARead = replaceMethod(fixture.roots, "read", (request) =>
        abaOriginalRead(request).pipe(
          Effect.tap(() => Deferred.succeed(abaReached, undefined).pipe(Effect.andThen(Deferred.await(abaRelease)))),
        ),
      )
      const abaRead = fixture.runtime.runPromise(
        fixture.current.resolveSelector({
          mapID: map.id,
          selectorID,
          access: input.access,
          budgets: materialBudgets(),
        }),
      )
      try {
        await fixture.runtime.runPromise(Deferred.await(abaReached).pipe(Effect.timeout("5 seconds")))
        await fixture.runtime.runPromise(
          fixture.maps.withdrawMap({ mapID: map.id, expectedVersion: 2, reason: "ABA withdrawal" }),
        )
        await fixture.runtime.runPromise(fixture.maps.restoreMap({ mapID: map.id, expectedVersion: 3 }))
        await fixture.runtime.runPromise(Deferred.succeed(abaRelease, undefined))
        await expect(abaRead).rejects.toMatchObject({ _tag: "MaterialMap.ConflictError", entity: "map_state" })
      } finally {
        await fixture.runtime.runPromise(Deferred.succeed(abaRelease, undefined))
        restoreABARead()
        await abaRead.catch(() => undefined)
      }

      const disclosed = await fixture.runtime.runPromise(
        fixture.current.resolveSelector({
          mapID: map.id,
          selectorID,
          access: input.access,
          budgets: materialBudgets(),
        }),
      )
      await fixture.runtime.runPromise(
        fixture.maps.withdrawMap({ mapID: map.id, expectedVersion: 4, reason: "post-disclosure withdrawal" }),
      )
      expect(disclosed.bytes).toEqual(fixture.bytes.slice(0, 12))
    } finally {
      await closeFixture(fixture)
    }

    const representationFixture = await prepareFixture()
    try {
      const representation = await acceptRepresentation(representationFixture)
      const input = representationMapInput(representationFixture, representation)
      const map = await representationFixture.runtime.runPromise(representationFixture.maps.createMap(input))
      const reached = await representationFixture.runtime.runPromise(Deferred.make<void>())
      const release = await representationFixture.runtime.runPromise(Deferred.make<void>())
      const originalRead = representationFixture.representationCurrent.readForCurrentUse
      let delayed = false
      const restoreRead = replaceMethod(representationFixture.representationCurrent, "readForCurrentUse", (request) =>
        originalRead(request).pipe(
          Effect.tap(() => {
            if (delayed) return Effect.void
            delayed = true
            return Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release)))
          }),
        ),
      )
      const pending = representationFixture.runtime.runPromise(
        representationFixture.current.resolveSelector({
          mapID: map.id,
          selectorID: input.proposal.outline[0]!.selectors[0]!.id,
          access: input.access,
          budgets: materialBudgets(),
        }),
      )
      try {
        await representationFixture.runtime.runPromise(Deferred.await(reached).pipe(Effect.timeout("5 seconds")))
        const withdrawn = await representationFixture.runtime.runPromise(
          representationFixture.artifacts.withdraw({
            artifactID: representationFixture.artifact.id,
            expectedDispositionVersion: representationFixture.artifact.dispositionVersion,
          }),
        )
        await representationFixture.runtime.runPromise(
          representationFixture.artifacts.restore({
            artifactID: representationFixture.artifact.id,
            expectedDispositionVersion: withdrawn.dispositionVersion,
          }),
        )
        await representationFixture.runtime.runPromise(Deferred.succeed(release, undefined))
        await expect(pending).rejects.toMatchObject({
          _tag: "Artifact.ConflictError",
          entity: "source",
          id: representationFixture.artifact.id,
        })
      } finally {
        await representationFixture.runtime.runPromise(Deferred.succeed(release, undefined))
        restoreRead()
        await pending.catch(() => undefined)
      }
    } finally {
      await closeFixture(representationFixture)
    }
  })

  windowsTest("loses the Artifact creation CAS when media is corrected before Map commit", async () => {
    const fixture = await prepareFixture()
    try {
      const input = artifactMapInput(fixture)
      const reached = await fixture.runtime.runPromise(Deferred.make<void>())
      const release = await fixture.runtime.runPromise(Deferred.make<void>())
      const originalRead = fixture.roots.read
      const restoreRead = replaceMethod(fixture.roots, "read", (request) =>
        originalRead(request).pipe(
          Effect.tap(() => Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release)))),
        ),
      )
      const pending = fixture.runtime.runPromise(fixture.maps.createMap(input))
      try {
        await fixture.runtime.runPromise(Deferred.await(reached).pipe(Effect.timeout("5 seconds")))
        await fixture.runtime.runPromise(
          fixture.artifacts.correctObservation({
            observationID: fixture.artifact.source.descriptor!.observationID,
            expectedPredecessorCorrectionID: fixture.artifact.source.descriptor!.correctionID,
            mediaType: "application/x-gate13-precommit-correction",
            authority: Artifact.ObservationCorrectionAuthority.learnerCorrection("learner", 1),
            expectedArtifacts: [Artifact.expectedSource(fixture.artifact)],
          }),
        )
        await fixture.runtime.runPromise(Deferred.succeed(release, undefined))
        await expect(pending).rejects.toMatchObject({
          _tag: "Artifact.ConflictError",
          entity: "source",
          id: fixture.artifact.id,
        })
      } finally {
        await fixture.runtime.runPromise(Deferred.succeed(release, undefined))
        restoreRead()
        await pending.catch(() => undefined)
      }
      await expect(fixture.runtime.runPromise(fixture.maps.getMap(input.mapID))).rejects.toMatchObject({
        _tag: "MaterialMap.NotFoundError",
      })
      expect(
        (await fixture.runtime.runPromise(fixture.artifacts.getArtifact(fixture.artifact.id))).source.descriptor
          ?.mediaType,
      ).toBe("application/x-gate13-precommit-correction")
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest("fails missing and replaced active Artifact sources without fallback or partial Map state", async () => {
    const missing = await prepareFixture()
    try {
      const input = artifactMapInput(missing)
      await rm(missing.source)
      await expect(missing.runtime.runPromise(missing.maps.createMap(input))).rejects.toMatchObject({
        _tag: "MaterialMap.PreparationError",
        code: "source_unavailable",
      })
      expect(
        (await missing.runtime.runPromise(missing.artifacts.getArtifact(missing.artifact.id))).source.availability,
      ).toBe("missing")
      await expect(missing.runtime.runPromise(missing.maps.getMap(input.mapID))).rejects.toMatchObject({
        _tag: "MaterialMap.NotFoundError",
      })
    } finally {
      await closeFixture(missing)
    }

    const replaced = await prepareFixture()
    try {
      const input = artifactMapInput(replaced)
      const map = await replaced.runtime.runPromise(replaced.maps.createMap(input))
      const changedBytes = new TextEncoder().encode("same path, different source object and revision")
      await rm(replaced.source)
      await writeFile(replaced.source, changedBytes)
      await expect(
        replaced.runtime.runPromise(
          replaced.current.resolveSelector({
            mapID: map.id,
            selectorID: input.proposal.outline[1]!.selectors[0]!.id,
            access: input.access,
            budgets: materialBudgets(),
          }),
        ),
      ).rejects.toMatchObject({ _tag: "MaterialMap.PreparationError", code: "stale_target" })
      const current = await replaced.runtime.runPromise(replaced.artifacts.getArtifact(replaced.artifact.id))
      expect(current.source.currentRevisionID).not.toBe(replaced.revision.id)
      expect(await replaced.runtime.runPromise(replaced.maps.getMap(map.id))).toMatchObject({ id: map.id })
    } finally {
      await closeFixture(replaced)
    }
  })

  windowsTest("binds one exact ContentRoot episode across overlap, revoke, and regrant", async () => {
    const fixture = await prepareFixture()
    try {
      const parentProposal = await fixture.runtime.runPromise(fixture.roots.propose(fixture.directory))
      const parentRoot = await fixture.runtime.runPromise(
        fixture.roots.approve({
          proposal: parentProposal,
          approval: ContentRoot.LearnerApproval.contentRoot(parentProposal, "Gate 13 overlapping parent root"),
        }),
      )
      const observationsBefore = (
        await fixture.runtime.runPromise(fixture.artifacts.listObservations(fixture.artifact.id))
      ).items.length
      const unnamed = artifactMapInput(fixture, {
        access: {
          type: "artifact",
          source: {} as unknown as MaterialMap.MaterialTarget.ArtifactSourceSelection,
        },
      })
      await expect(fixture.runtime.runPromise(fixture.maps.createMap(unnamed))).rejects.toMatchObject({
        _tag: "MaterialMap.PreparationError",
        code: "ambiguous_content_root",
      })
      expect(
        (await fixture.runtime.runPromise(fixture.artifacts.listObservations(fixture.artifact.id))).items,
      ).toHaveLength(observationsBefore)

      const explicit = artifactMapInput(fixture, {
        access: {
          type: "artifact",
          source: MaterialMap.MaterialTarget.ArtifactSourceSelection.explicitLearner({
            root: parentRoot,
            relativePath: "materials/source.pdf",
            basis: "learner selected the parent root episode shown by the application",
            capabilityIdentity: "repa.test.material-source",
            capabilityVersion: 1,
          }),
        },
      })
      expect(await fixture.runtime.runPromise(fixture.maps.createMap(explicit))).toMatchObject({ id: explicit.mapID })

      const oldEpisode = artifactMapInput(fixture)
      await fixture.runtime.runPromise(
        fixture.roots.revoke({
          contentRootID: fixture.root.id,
          expectedGrantVersion: fixture.root.grantVersion,
          basis: "learner revoked the original material root",
        }),
      )
      await expect(fixture.runtime.runPromise(fixture.maps.createMap(oldEpisode))).rejects.toMatchObject({
        _tag: "MaterialMap.PreparationError",
        code: "source_provenance",
      })
      const renewedProposal = await fixture.runtime.runPromise(fixture.roots.propose(path.dirname(fixture.source)))
      const renewedRoot = await fixture.runtime.runPromise(
        fixture.roots.approve({
          proposal: renewedProposal,
          approval: ContentRoot.LearnerApproval.contentRoot(renewedProposal, "Gate 13 source regrant"),
        }),
      )
      await expect(fixture.runtime.runPromise(fixture.maps.createMap(oldEpisode))).rejects.toMatchObject({
        _tag: "MaterialMap.PreparationError",
        code: "source_provenance",
      })
      const regranted = artifactMapInput(fixture, {
        access: {
          type: "artifact",
          source: MaterialMap.MaterialTarget.ArtifactSourceSelection.explicitLearner({
            root: renewedRoot,
            relativePath: "source.pdf",
            basis: "learner selected the new grant episode",
            capabilityIdentity: "repa.test.material-source",
            capabilityVersion: 2,
          }),
        },
      })
      expect(await fixture.runtime.runPromise(fixture.maps.createMap(regranted))).toMatchObject({ id: regranted.mapID })
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest(
    "preserves branched Map and alignment correction without preferred pointers or endpoint movement",
    async () => {
      const fixture = await prepareFixture()
      try {
        const baseInput = artifactMapInput(fixture)
        const base = await fixture.runtime.runPromise(fixture.maps.createMap(baseInput))
        const representation = await acceptRepresentation(fixture)
        const representationDraft = representationMapInput(fixture, representation)
        const representationSuccessorInput = {
          ...representationDraft,
          proposal: { ...representationDraft.proposal, supersedesMapID: base.id },
        }
        const artifactDraft = artifactMapInput(fixture)
        const artifactSuccessorInput = {
          ...artifactDraft,
          proposal: { ...artifactDraft.proposal, supersedesMapID: base.id },
        }
        const representationSuccessor = await fixture.runtime.runPromise(
          fixture.maps.createMap(representationSuccessorInput),
        )
        const artifactSuccessor = await fixture.runtime.runPromise(fixture.maps.createMap(artifactSuccessorInput))
        expect((await fixture.runtime.runPromise(fixture.maps.getMap(base.id))).superseded).toBeTrue()
        expect(
          new Set(
            (await fixture.runtime.runPromise(fixture.maps.listMapSuccessors(base.id))).items.map((map) => map.id),
          ),
        ).toEqual(new Set([representationSuccessor.id, artifactSuccessor.id]))
        expect(representationSuccessor.target.type).toBe("representation")
        expect(artifactSuccessor.target.type).toBe("artifact")
        expect(
          new Set(
            representationSuccessorInput.proposal.outline.flatMap((node) => [
              node.id,
              ...node.selectors.map((s) => s.id),
            ]),
          ),
        ).not.toEqual(
          new Set(
            baseInput.proposal.outline.flatMap((node) => [node.id, ...node.selectors.map((selector) => selector.id)]),
          ),
        )

        const course = await createCourseEndpoint(fixture, "Correction branches")
        const baseAlignmentInput = {
          ...alignmentInput(base.id, baseInput.proposal.outline[1]!.selectors[0]!.id, course.endpoints[0]!),
          access: baseInput.access,
        }
        const baseAlignment = await fixture.runtime.runPromise(fixture.maps.createAlignment(baseAlignmentInput))
        expect(
          (await fixture.runtime.runPromise(fixture.maps.listAlignmentsForMap(representationSuccessor.id))).items,
        ).toEqual([])
        expect(
          (await fixture.runtime.runPromise(fixture.maps.listAlignmentsForMap(artifactSuccessor.id))).items,
        ).toEqual([])

        const firstDraft = alignmentInput(
          base.id,
          baseInput.proposal.outline[1]!.selectors[1]!.id,
          course.endpoints[1]!,
        )
        const firstSuccessorInput = {
          ...firstDraft,
          proposal: {
            ...firstDraft.proposal,
            reason: "Correction changes the exact selector, Course item, and rationale",
            supersedesAlignmentID: baseAlignment.id,
          },
          access: baseInput.access,
        }
        const secondDraft = alignmentInput(
          representationSuccessor.id,
          representationSuccessorInput.proposal.outline[0]!.selectors[0]!.id,
          course.endpoints[0]!,
        )
        const secondSuccessorInput = {
          ...secondDraft,
          proposal: {
            ...secondDraft.proposal,
            reason: "Independent correction changes the material target",
            supersedesAlignmentID: baseAlignment.id,
          },
        }
        const firstSuccessor = await fixture.runtime.runPromise(fixture.maps.createAlignment(firstSuccessorInput))
        const secondSuccessor = await fixture.runtime.runPromise(fixture.maps.createAlignment(secondSuccessorInput))
        expect(
          new Set(
            (await fixture.runtime.runPromise(fixture.maps.listAlignmentSuccessors(baseAlignment.id))).items.map(
              (alignment) => alignment.id,
            ),
          ),
        ).toEqual(new Set([firstSuccessor.id, secondSuccessor.id]))
        expect(await fixture.runtime.runPromise(fixture.maps.getAlignment(baseAlignment.id))).toMatchObject({
          mapID: base.id,
          selectorID: baseAlignmentInput.proposal.selectorID,
          superseded: true,
        })

        const withdrawn = await fixture.runtime.runPromise(
          fixture.maps.withdrawAlignment({
            alignmentID: firstSuccessor.id,
            expectedVersion: 0,
            reason: "temporarily hidden correction",
          }),
        )
        const restored = await fixture.runtime.runPromise(
          fixture.maps.restoreAlignment({
            alignmentID: firstSuccessor.id,
            expectedVersion: withdrawn.disposition.version,
          }),
        )
        expect(restored).toMatchObject({
          mapID: firstSuccessor.mapID,
          selectorID: firstSuccessor.selectorID,
          course: firstSuccessor.course,
          reason: firstSuccessor.reason,
          disposition: { version: 2, disposition: "active" },
        })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest("owns optional neutral many-to-many alignment and derives typed current stale causes", async () => {
    const fixture = await prepareFixture()
    try {
      const representation = await acceptRepresentation(fixture)
      const mapInput = representationMapInput(fixture, representation)
      const map = await fixture.runtime.runPromise(fixture.maps.createMap(mapInput))
      const course = await fixture.runtime.runPromise(fixture.courses.createCourse({ title: "Algorithms" }))
      const view = await fixture.runtime.runPromise(
        fixture.courses.createView({
          courseID: course.id,
          name: "Exact route",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: {
            items: [
              { key: "root", title: "Foundations" },
              { key: "child", title: "Worked examples", parentKey: "root" },
            ],
          },
        }),
      )
      const items = await fixture.runtime.runPromise(
        fixture.courses.listRevisionItems(course.id, view.view.id, view.revision.id),
      )
      const endpoint = {
        courseID: course.id,
        viewID: view.view.id,
        revisionID: view.revision.id,
        itemID: items.items[0]!.itemID,
      }
      const selectorIDs = mapInput.proposal.outline[0]!.selectors.map((selector) => selector.id)
      const first = alignmentInput(map.id, selectorIDs[0]!, endpoint)
      const accepted = await fixture.runtime.runPromise(fixture.maps.createAlignment(first))
      expect(accepted).toMatchObject({
        mapID: map.id,
        selectorID: selectorIDs[0],
        course: endpoint,
        selection: { type: "explicit_exact" },
        disposition: { version: 0, disposition: "active" },
        projection: { status: "content_unverified", staleCauses: [] },
      })

      const sameMembership = alignmentInput(map.id, selectorIDs[1]!, endpoint)
      const second = await fixture.runtime.runPromise(fixture.maps.createAlignment(sameMembership))
      const sameSelector = alignmentInput(map.id, selectorIDs[0]!, { ...endpoint, itemID: items.items[1]!.itemID })
      const third = await fixture.runtime.runPromise(fixture.maps.createAlignment(sameSelector))
      expect((await fixture.runtime.runPromise(fixture.maps.listAlignmentsForMap(map.id))).items).toHaveLength(3)
      expect(
        (await fixture.runtime.runPromise(fixture.maps.listAlignmentsForSelector(map.id, selectorIDs[0]!))).items.map(
          (alignment) => alignment.id,
        ),
      ).toEqual([accepted.id, third.id])
      expect(
        (await fixture.runtime.runPromise(fixture.maps.listAlignmentsForMembership(endpoint))).items.map(
          (alignment) => alignment.id,
        ),
      ).toEqual([accepted.id, second.id])

      const selected = await fixture.runtime.runPromise(
        fixture.courses.select({
          courseID: course.id,
          revisionID: view.revision.id,
          expectedCourseVersion: 0,
          expectedSelectionVersion: 0,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
        }),
      )
      const working = alignmentInput(map.id, selectorIDs[0]!, endpoint, {
        selection: { type: "observed_working", revisionID: view.revision.id, version: selected.version },
      })
      const workingAccepted = await fixture.runtime.runPromise(fixture.maps.createAlignment(working))
      expect(workingAccepted.projection.status).toBe("content_unverified")

      const alternate = await fixture.runtime.runPromise(
        fixture.courses.createView({
          courseID: course.id,
          name: "Alternative route",
          expectedCourseVersion: 0,
          authorship: Course.Authorship.learnerAuthored(),
          revision: { items: [{ key: "alternate", title: "Alternative" }] },
        }),
      )
      await fixture.runtime.runPromise(
        fixture.courses.select({
          courseID: course.id,
          revisionID: alternate.revision.id,
          expectedCourseVersion: 0,
          expectedSelectionRevisionID: view.revision.id,
          expectedSelectionVersion: selected.version,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
        }),
      )
      expect(
        (await fixture.runtime.runPromise(fixture.maps.getAlignment(workingAccepted.id))).projection,
      ).toMatchObject({
        status: "stale",
        staleCauses: [{ side: "course", reason: "working_selection_mismatch" }],
      })
      const reselected = await fixture.runtime.runPromise(
        fixture.courses.select({
          courseID: course.id,
          revisionID: view.revision.id,
          expectedCourseVersion: 0,
          expectedSelectionRevisionID: alternate.revision.id,
          expectedSelectionVersion: selected.version + 1,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
        }),
      )
      expect(reselected.version).toBeGreaterThan(selected.version)
      expect((await fixture.runtime.runPromise(fixture.maps.getAlignment(workingAccepted.id))).projection.status).toBe(
        "content_unverified",
      )

      const changedBytes = new TextEncoder().encode("A later exact source revision")
      const changed = await fixture.runtime.runPromise(
        fixture.artifacts.observe({
          expected: Artifact.expectedSource(fixture.artifact),
          observation: {
            result: "present",
            fingerprint: {
              algorithm: "sha256",
              digest: new Bun.CryptoHasher("sha256").update(changedBytes).digest("hex"),
              byteLength: changedBytes.byteLength,
            },
            mediaType: "application/pdf",
            observer: observer(fixture.read.authorization),
            timeObserved: fixture.read.observation.timeObserved + 20,
          },
        }),
      )
      expect((await fixture.runtime.runPromise(fixture.maps.getAlignment(accepted.id))).projection).toMatchObject({
        status: "stale",
        staleCauses: [{ side: "material", target: "representation", reason: "grant_required" }],
      })
      const currentRevisionID = changed.artifact.source.currentRevisionID
      const currentAttribution = changed.artifact.source.revisionAttribution
      if (!currentRevisionID || !currentAttribution) throw new Error("Expected changed Artifact Revision")
      const grant = await fixture.runtime.runPromise(
        fixture.representations.authorizeContinuedUse({
          representationRevisionID: representation.id,
          expectedArtifact: {
            effectiveArtifactID: changed.artifact.id,
            dispositionVersion: changed.artifact.dispositionVersion,
            currentRevisionID,
            attribution: currentAttribution,
            lineageVersion: changed.artifact.lineageVersion,
          },
          authority: Representation.LearnerAuthority.deterministic(
            `gate13-grant:${representation.id}`,
            "learner retained the exact readable Representation",
          ),
          timeAuthorized: representation.timeAccepted + 30,
        }),
      )
      expect((await fixture.runtime.runPromise(fixture.maps.getAlignment(accepted.id))).projection.status).toBe(
        "content_unverified",
      )
      await fixture.runtime.runPromise(
        fixture.representations.revokeContinuedUse({
          grantID: grant.id,
          expectedVersion: grant.version,
          authority: Representation.LearnerAuthority.deterministic(
            `gate13-revoke:${representation.id}`,
            "learner revoked continued use",
          ),
          timeRevoked: representation.timeAccepted + 40,
        }),
      )
      expect((await fixture.runtime.runPromise(fixture.maps.getAlignment(accepted.id))).projection).toMatchObject({
        status: "stale",
        staleCauses: [{ side: "material", target: "representation", reason: "grant_required" }],
      })
      await fixture.runtime.runPromise(
        fixture.representations.authorizeContinuedUse({
          representationRevisionID: representation.id,
          expectedArtifact: {
            effectiveArtifactID: changed.artifact.id,
            dispositionVersion: changed.artifact.dispositionVersion,
            currentRevisionID,
            attribution: currentAttribution,
            lineageVersion: changed.artifact.lineageVersion,
          },
          authority: Representation.LearnerAuthority.deterministic(
            `gate13-regrant:${representation.id}`,
            "learner restored continued use",
          ),
          timeAuthorized: representation.timeAccepted + 50,
        }),
      )

      await fixture.runtime.runPromise(
        fixture.maps.withdrawMap({ mapID: map.id, expectedVersion: 0, reason: "material outline withdrawn" }),
      )
      expect((await fixture.runtime.runPromise(fixture.maps.getAlignment(accepted.id))).projection).toMatchObject({
        status: "stale",
        staleCauses: [{ side: "map", reason: "withdrawn" }],
      })
      await fixture.runtime.runPromise(fixture.maps.restoreMap({ mapID: map.id, expectedVersion: 1 }))
      await fixture.runtime.runPromise(
        fixture.maps.withdrawAlignment({
          alignmentID: accepted.id,
          expectedVersion: 0,
          reason: "relation no longer intended",
        }),
      )
      expect((await fixture.runtime.runPromise(fixture.maps.getAlignment(accepted.id))).projection).toMatchObject({
        status: "stale",
        staleCauses: [{ side: "relation", reason: "withdrawn" }],
      })
      expect(
        (await fixture.runtime.runPromise(fixture.maps.listAlignmentsForMap(map.id))).items.map((item) => item.id),
      ).not.toContain(accepted.id)
      expect(
        (
          await fixture.runtime.runPromise(
            fixture.maps.listAlignmentsForMap(map.id, { includeWithdrawn: true, includeSuperseded: true }),
          )
        ).items.map((item) => item.id),
      ).toContain(accepted.id)
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest(
    "reopens exact Maps, correction branches, cursors, dispositions, and stale projections without repair",
    async () => {
      const fixture = await prepareFixture()
      try {
        const baseInput = artifactMapInput(fixture)
        const base = await fixture.runtime.runPromise(fixture.maps.createMap(baseInput))
        const successorDraft = artifactMapInput(fixture)
        const successorInput = {
          ...successorDraft,
          proposal: { ...successorDraft.proposal, supersedesMapID: base.id },
        }
        const successor = await fixture.runtime.runPromise(fixture.maps.createMap(successorInput))
        const course = await createCourseEndpoint(fixture, "Restart persistence")
        const alignmentDraft = alignmentInput(
          base.id,
          baseInput.proposal.outline[1]!.selectors[0]!.id,
          course.endpoints[0]!,
        )
        const alignmentInputValue = { ...alignmentDraft, access: baseInput.access }
        const alignment = await fixture.runtime.runPromise(fixture.maps.createAlignment(alignmentInputValue))
        const firstPage = await fixture.runtime.runPromise(fixture.maps.listOutline(base.id, { limit: 1 }))
        const selector = await fixture.runtime.runPromise(
          fixture.maps.getSelector(base.id, baseInput.proposal.outline[1]!.selectors[0]!.id),
        )
        await fixture.runtime.runPromise(
          fixture.maps.withdrawMap({ mapID: base.id, expectedVersion: 0, reason: "persisted withdrawal" }),
        )
        const before = await fixture.runtime.runPromise(materialSnapshot(fixture.database))

        await fixture.runtime.dispose()
        fixture.runtime = ManagedRuntime.make(appLayer(fixture.filename))
        fixture.maps = await fixture.runtime.runPromise(MaterialMap.Service)
        fixture.database = await fixture.runtime.runPromise(Database.Service)

        expect(await fixture.runtime.runPromise(fixture.maps.getMap(base.id))).toMatchObject({
          id: base.id,
          superseded: true,
          disposition: { version: 1, disposition: "withdrawn", withdrawalReason: "persisted withdrawal" },
        })
        expect((await fixture.runtime.runPromise(fixture.maps.listMapSuccessors(base.id))).items).toMatchObject([
          { id: successor.id, supersedesMapID: base.id },
        ])
        expect(
          await fixture.runtime.runPromise(
            fixture.maps.getSelector(base.id, baseInput.proposal.outline[1]!.selectors[0]!.id),
          ),
        ).toEqual(selector)
        expect(
          await fixture.runtime.runPromise(fixture.maps.listOutline(base.id, { limit: 1, cursor: firstPage.cursor })),
        ).toMatchObject({ items: [{ id: baseInput.proposal.outline[1]!.id, title: "Opening passage" }] })
        expect(await fixture.runtime.runPromise(fixture.maps.getAlignment(alignment.id))).toMatchObject({
          id: alignment.id,
          mapID: base.id,
          disposition: { version: 0, disposition: "active" },
          projection: {
            status: "stale",
            staleCauses: [
              { side: "map", reason: "withdrawn" },
              { side: "map", reason: "superseded" },
            ],
          },
        })
        expect(await fixture.runtime.runPromise(materialSnapshot(fixture.database))).toEqual(before)
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest(
    "durably reconciles a same-ID Map twin after cancellation and reports unknown lookup outcomes",
    async () => {
      const fixture = await prepareFixture()
      try {
        const parentProposal = await fixture.runtime.runPromise(fixture.roots.propose(fixture.directory))
        const parentRoot = await fixture.runtime.runPromise(
          fixture.roots.approve({
            proposal: parentProposal,
            approval: ContentRoot.LearnerApproval.contentRoot(parentProposal, "Gate 13 reconciliation root"),
          }),
        )
        const input = artifactMapInput(fixture)
        const reached = await fixture.runtime.runPromise(Deferred.make<void>())
        const release = await fixture.runtime.runPromise(Deferred.make<void>())
        const originalRead = fixture.roots.read
        const restoreRead = replaceMethod(fixture.roots, "read", (request) =>
          originalRead(request).pipe(
            Effect.tap(() =>
              request.contentRootID === parentRoot.id
                ? Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release)))
                : Effect.void,
            ),
          ),
        )
        const abort = new AbortController()
        const delayed = fixture.runtime.runPromise(
          fixture.maps.createMap({
            ...input,
            access: {
              type: "artifact",
              source: MaterialMap.MaterialTarget.ArtifactSourceSelection.explicitLearner({
                root: parentRoot,
                relativePath: "materials/source.pdf",
                basis: "learner selected the overlapping reconciliation root",
                capabilityIdentity: "repa.test.material-source",
                capabilityVersion: 1,
              }),
            },
            abort: abort.signal,
          }),
        )
        try {
          await fixture.runtime.runPromise(Deferred.await(reached).pipe(Effect.timeout("5 seconds")))
          const committed = await fixture.runtime.runPromise(fixture.maps.createMap(input))
          abort.abort()
          await fixture.runtime.runPromise(Deferred.succeed(release, undefined))
          expect(await delayed).toEqual(committed)
          expect(
            await fixture.runtime.runPromise(
              fixture.database.db.get<{ count: number }>(
                sql`SELECT count(*) AS count FROM material_map WHERE id = ${input.mapID}`,
              ),
            ),
          ).toEqual({ count: 1 })

          const withdrawn = await fixture.runtime.runPromise(
            fixture.artifacts.withdraw({
              artifactID: fixture.artifact.id,
              expectedDispositionVersion: fixture.artifact.dispositionVersion,
            }),
          )
          expect(
            await fixture.runtime.runPromise(fixture.maps.createMap({ ...input, access: { type: "representation" } })),
          ).toEqual(committed)
          await expect(
            fixture.runtime.runPromise(
              fixture.maps.createMap({
                ...input,
                proposal: {
                  ...input.proposal,
                  outline: input.proposal.outline.map((node, index) =>
                    index === 1 ? { ...node, title: "conflicting retry" } : node,
                  ),
                },
                access: { type: "representation" },
              }),
            ),
          ).rejects.toMatchObject({ _tag: "MaterialMap.ConflictError", entity: "map", id: input.mapID })
          await fixture.runtime.runPromise(
            fixture.artifacts.restore({
              artifactID: fixture.artifact.id,
              expectedDispositionVersion: withdrawn.dispositionVersion,
            }),
          )
        } finally {
          abort.abort()
          await fixture.runtime.runPromise(Deferred.succeed(release, undefined))
          restoreRead()
          await delayed.catch(() => undefined)
        }

        const unknownInput = artifactMapInput(fixture)
        const unknownReached = await fixture.runtime.runPromise(Deferred.make<void>())
        const unknownRelease = await fixture.runtime.runPromise(Deferred.make<void>())
        const unknownOriginalRead = fixture.roots.read
        const restoreUnknownRead = replaceMethod(fixture.roots, "read", (request) =>
          unknownOriginalRead(request).pipe(
            Effect.tap(() =>
              request.contentRootID === parentRoot.id
                ? Deferred.succeed(unknownReached, undefined).pipe(Effect.andThen(Deferred.await(unknownRelease)))
                : Effect.void,
            ),
          ),
        )
        const unknownAbort = new AbortController()
        const unknown = fixture.runtime.runPromise(
          fixture.maps.createMap({
            ...unknownInput,
            access: {
              type: "artifact",
              source: MaterialMap.MaterialTarget.ArtifactSourceSelection.explicitLearner({
                root: parentRoot,
                relativePath: "materials/source.pdf",
                basis: "learner selected the unknown-outcome root",
                capabilityIdentity: "repa.test.material-source",
                capabilityVersion: 2,
              }),
            },
            abort: unknownAbort.signal,
          }),
        )
        const originalTransaction = fixture.database.db.transaction
        try {
          await fixture.runtime.runPromise(Deferred.await(unknownReached).pipe(Effect.timeout("5 seconds")))
          unknownAbort.abort()
          Object.defineProperty(fixture.database.db, "transaction", {
            configurable: true,
            writable: true,
            value: () => Effect.fail(new Error("injected durable lookup outage")),
          })
          await fixture.runtime.runPromise(Deferred.succeed(unknownRelease, undefined))
          await expect(unknown).rejects.toMatchObject({
            _tag: "MaterialMap.OutcomeUnknownError",
            entity: "map",
            id: unknownInput.mapID,
          })
        } finally {
          unknownAbort.abort()
          await fixture.runtime.runPromise(Deferred.succeed(unknownRelease, undefined))
          Object.defineProperty(fixture.database.db, "transaction", {
            configurable: true,
            writable: true,
            value: originalTransaction,
          })
          restoreUnknownRead()
          await unknown.catch(() => undefined)
        }
        await expect(fixture.runtime.runPromise(fixture.maps.getMap(unknownInput.mapID))).rejects.toMatchObject({
          _tag: "MaterialMap.NotFoundError",
        })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest("durably reconciles a same-ID alignment twin after Course staleness and endpoint drift", async () => {
    const fixture = await prepareFixture()
    try {
      const representation = await acceptRepresentation(fixture)
      const mapInput = representationMapInput(fixture, representation)
      const map = await fixture.runtime.runPromise(fixture.maps.createMap(mapInput))
      const course = await createCourseEndpoint(fixture, "Alignment reconciliation")
      const input = alignmentInput(map.id, mapInput.proposal.outline[0]!.selectors[0]!.id, course.endpoints[0]!)
      const reached = await fixture.runtime.runPromise(Deferred.make<void>())
      const release = await fixture.runtime.runPromise(Deferred.make<void>())
      const originalRead = fixture.representationCurrent.readForCurrentUse
      let delayedFirst = false
      const restoreRead = replaceMethod(fixture.representationCurrent, "readForCurrentUse", (request) =>
        originalRead(request).pipe(
          Effect.tap(() => {
            if (delayedFirst) return Effect.void
            delayedFirst = true
            return Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release)))
          }),
        ),
      )
      const delayed = fixture.runtime.runPromise(fixture.maps.createAlignment(input))
      try {
        await fixture.runtime.runPromise(Deferred.await(reached).pipe(Effect.timeout("5 seconds")))
        const committed = await fixture.runtime.runPromise(fixture.maps.createAlignment(input))
        await fixture.runtime.runPromise(
          fixture.courses.withdrawCourse({
            courseID: course.course.id,
            expectedCourseVersion: 0,
            expectedSelectionVersion: 0,
          }),
        )
        await fixture.runtime.runPromise(Deferred.succeed(release, undefined))
        expect(await delayed).toEqual(await fixture.runtime.runPromise(fixture.maps.getAlignment(committed.id)))
        expect(
          await fixture.runtime.runPromise(
            fixture.maps.createAlignment({
              ...input,
              access: {
                type: "artifact",
                source: MaterialMap.MaterialTarget.ArtifactSourceSelection.inherited(fixture.root, "source.pdf"),
              },
            }),
          ),
        ).toEqual(await fixture.runtime.runPromise(fixture.maps.getAlignment(committed.id)))
        await expect(
          fixture.runtime.runPromise(
            fixture.maps.createAlignment({
              ...input,
              proposal: { ...input.proposal, reason: "conflicting alignment retry" },
              access: {
                type: "artifact",
                source: MaterialMap.MaterialTarget.ArtifactSourceSelection.inherited(fixture.root, "source.pdf"),
              },
            }),
          ),
        ).rejects.toMatchObject({
          _tag: "MaterialMap.ConflictError",
          entity: "alignment",
          id: input.alignmentID,
        })
      } finally {
        await fixture.runtime.runPromise(Deferred.succeed(release, undefined))
        restoreRead()
        await delayed.catch(() => undefined)
      }

      const absentAbort = new AbortController()
      absentAbort.abort()
      const absent = alignmentInput(map.id, mapInput.proposal.outline[0]!.selectors[1]!.id, course.endpoints[1]!)
      await expect(
        fixture.runtime.runPromise(fixture.maps.createAlignment({ ...absent, abort: absentAbort.signal })),
      ).rejects.toMatchObject({ _tag: "MaterialMap.PreparationError", code: "cancelled" })
      await expect(fixture.runtime.runPromise(fixture.maps.getAlignment(absent.alignmentID))).rejects.toMatchObject({
        _tag: "MaterialMap.NotFoundError",
      })

      const unknown = alignmentInput(map.id, mapInput.proposal.outline[0]!.selectors[1]!.id, course.endpoints[1]!)
      const unknownReached = await fixture.runtime.runPromise(Deferred.make<void>())
      const unknownRelease = await fixture.runtime.runPromise(Deferred.make<void>())
      const unknownOriginalRead = fixture.representationCurrent.readForCurrentUse
      let delayedUnknown = false
      const restoreUnknownRead = replaceMethod(fixture.representationCurrent, "readForCurrentUse", (request) =>
        unknownOriginalRead(request).pipe(
          Effect.tap(() => {
            if (delayedUnknown) return Effect.void
            delayedUnknown = true
            return Deferred.succeed(unknownReached, undefined).pipe(Effect.andThen(Deferred.await(unknownRelease)))
          }),
        ),
      )
      const unknownAbort = new AbortController()
      const unknownResult = fixture.runtime.runPromise(
        fixture.maps.createAlignment({ ...unknown, abort: unknownAbort.signal }),
      )
      const originalTransaction = fixture.database.db.transaction
      try {
        await fixture.runtime.runPromise(Deferred.await(unknownReached).pipe(Effect.timeout("5 seconds")))
        unknownAbort.abort()
        Object.defineProperty(fixture.database.db, "transaction", {
          configurable: true,
          writable: true,
          value: () => Effect.fail(new Error("injected alignment lookup outage")),
        })
        await fixture.runtime.runPromise(Deferred.succeed(unknownRelease, undefined))
        await expect(unknownResult).rejects.toMatchObject({
          _tag: "MaterialMap.OutcomeUnknownError",
          entity: "alignment",
          id: unknown.alignmentID,
        })
      } finally {
        unknownAbort.abort()
        await fixture.runtime.runPromise(Deferred.succeed(unknownRelease, undefined))
        Object.defineProperty(fixture.database.db, "transaction", {
          configurable: true,
          writable: true,
          value: originalTransaction,
        })
        restoreUnknownRead()
        await unknownResult.catch(() => undefined)
      }
      await expect(fixture.runtime.runPromise(fixture.maps.getAlignment(unknown.alignmentID))).rejects.toMatchObject({
        _tag: "MaterialMap.NotFoundError",
      })
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest(
    "rolls back every Map and alignment publication boundary without advancing the shared frontier",
    async () => {
      const fixture = await prepareFixture()
      try {
        const representation = await acceptRepresentation(fixture)
        for (const [index, boundary] of [
          { table: "material_map_representation_target", timing: "BEFORE INSERT" },
          { table: "material_outline_node", timing: "BEFORE INSERT" },
          { table: "material_selector", timing: "BEFORE INSERT" },
          { table: "material_map_state", timing: "BEFORE INSERT" },
          { table: "material_map_disposition_event", timing: "BEFORE INSERT" },
          { table: "material_map", timing: "BEFORE INSERT" },
          { table: "learning_shared_frontier", timing: "BEFORE UPDATE" },
        ].entries()) {
          const trigger = `gate13_map_failure_${index}`
          const before = await fixture.runtime.runPromise(materialSnapshot(fixture.database))
          await fixture.runtime.runPromise(
            fixture.database.db.run(
              sql.raw(
                `CREATE TEMP TRIGGER ${trigger} ${boundary.timing} ON ${boundary.table} BEGIN SELECT RAISE(ABORT, 'gate13 injected map failure'); END`,
              ),
            ),
          )
          const input = representationMapInput(fixture, representation)
          try {
            await expect(fixture.runtime.runPromise(fixture.maps.createMap(input))).rejects.toMatchObject({
              _tag: "MaterialMap.PersistenceError",
              entity: "map",
              id: input.mapID,
            })
          } finally {
            await fixture.runtime.runPromise(fixture.database.db.run(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`)))
          }
          expect(await fixture.runtime.runPromise(materialSnapshot(fixture.database))).toEqual(before)
        }

        const mapInput = representationMapInput(fixture, representation)
        const map = await fixture.runtime.runPromise(fixture.maps.createMap(mapInput))
        const course = await createCourseEndpoint(fixture, "Publication rollback")
        for (const [index, boundary] of [
          { table: "material_course_alignment_state", timing: "BEFORE INSERT" },
          { table: "material_course_alignment_disposition_event", timing: "BEFORE INSERT" },
          { table: "material_course_alignment", timing: "BEFORE INSERT" },
          { table: "learning_shared_frontier", timing: "BEFORE UPDATE" },
        ].entries()) {
          const trigger = `gate13_alignment_failure_${index}`
          const before = await fixture.runtime.runPromise(materialSnapshot(fixture.database))
          await fixture.runtime.runPromise(
            fixture.database.db.run(
              sql.raw(
                `CREATE TEMP TRIGGER ${trigger} ${boundary.timing} ON ${boundary.table} BEGIN SELECT RAISE(ABORT, 'gate13 injected alignment failure'); END`,
              ),
            ),
          )
          const input = alignmentInput(map.id, mapInput.proposal.outline[0]!.selectors[0]!.id, course.endpoints[0]!)
          try {
            await expect(fixture.runtime.runPromise(fixture.maps.createAlignment(input))).rejects.toMatchObject({
              _tag: "MaterialMap.PersistenceError",
              entity: "alignment",
              id: input.alignmentID,
            })
          } finally {
            await fixture.runtime.runPromise(fixture.database.db.run(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`)))
          }
          expect(await fixture.runtime.runPromise(materialSnapshot(fixture.database))).toEqual(before)
        }
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest("enforces aggregate publication, immutability, and exact composite ownership in SQLite", async () => {
    const fixture = await prepareFixture()
    try {
      const representation = await acceptRepresentation(fixture)
      const partialID = MaterialMap.createMapID()
      await expect(
        fixture.runtime.runPromise(
          fixture.database.db.run(sql`INSERT INTO material_map (
            id, canonical_input, target_kind, supersedes_map_id,
            authorship_basis, authorship_capability_identity, authorship_capability_version, time_created
          ) VALUES (${partialID}, '{}', 'representation', NULL, 'raw constraint probe', 'repa.test', 1, 1)`),
        ),
      ).rejects.toBeDefined()

      const wrongArmID = MaterialMap.createMapID()
      await expect(
        fixture.runtime.runPromise(
          publishRawRepresentationMap(fixture.database, {
            mapID: wrongArmID,
            representationRevisionID: representation.id,
            targetKind: "artifact",
            nodeID: MaterialMap.createOutlineNodeID(),
          }),
        ),
      ).rejects.toBeDefined()
      const orphanID = MaterialMap.createMapID()
      await expect(
        fixture.runtime.runPromise(
          publishRawRepresentationMap(fixture.database, {
            mapID: orphanID,
            representationRevisionID: representation.id,
            targetKind: "representation",
            nodeID: MaterialMap.createOutlineNodeID(),
            parentNodeID: MaterialMap.createOutlineNodeID(),
            depth: 1,
          }),
        ),
      ).rejects.toBeDefined()
      const cycleID = MaterialMap.createMapID()
      const cycleNodeID = MaterialMap.createOutlineNodeID()
      await expect(
        fixture.runtime.runPromise(
          publishRawRepresentationMap(fixture.database, {
            mapID: cycleID,
            representationRevisionID: representation.id,
            targetKind: "representation",
            nodeID: cycleNodeID,
            parentNodeID: cycleNodeID,
            depth: 1,
          }),
        ),
      ).rejects.toBeDefined()

      const invalidSelectorDraft = representationMapInput(fixture, representation)
      const invalidSelector = {
        ...invalidSelectorDraft,
        proposal: {
          ...invalidSelectorDraft.proposal,
          outline: invalidSelectorDraft.proposal.outline.map((node, nodeIndex) => ({
            ...node,
            selectors: node.selectors.map((selector, selectorIndex) =>
              nodeIndex === 0 && selectorIndex === 0
                ? {
                    ...selector,
                    coordinate: { kind: "artifact_byte_range.v1" as const, startByte: 0, endByte: 1 },
                  }
                : selector,
            ),
          })),
        },
      }
      await expect(fixture.runtime.runPromise(fixture.maps.createMap(invalidSelector))).rejects.toMatchObject({
        _tag: "MaterialMap.PreparationError",
        code: "unsupported_selector",
      })

      const firstInput = representationMapInput(fixture, representation)
      const first = await fixture.runtime.runPromise(fixture.maps.createMap(firstInput))
      const secondInput = representationMapInput(fixture, representation)
      const second = await fixture.runtime.runPromise(fixture.maps.createMap(secondInput))
      await expect(
        fixture.runtime.runPromise(
          fixture.database.db.run(sql`UPDATE material_map SET canonical_input = '{}' WHERE id = ${first.id}`),
        ),
      ).rejects.toBeDefined()
      await expect(
        fixture.runtime.runPromise(
          fixture.database.db.run(
            sql`DELETE FROM material_selector WHERE id = ${firstInput.proposal.outline[0]!.selectors[0]!.id}`,
          ),
        ),
      ).rejects.toBeDefined()
      await expect(
        fixture.runtime.runPromise(
          fixture.database.db.run(
            sql`UPDATE material_map_state SET version = 1, disposition = 'withdrawn', withdrawal_reason = 'missing history' WHERE map_id = ${first.id}`,
          ),
        ),
      ).rejects.toBeDefined()
      await fixture.runtime.runPromise(
        fixture.database.db.run(sql`INSERT INTO material_map_disposition_event (
          id, map_id, version, disposition, reason, time_committed
        ) VALUES (${`mde_raw_${Date.now()}`}, ${first.id}, 1, 'withdrawn', 'raw exact transition', 2)`),
      )
      expect(
        await fixture.runtime.runPromise(
          fixture.database.db.get<{ version: number; disposition: string; reason: string }>(sql`SELECT
            version, disposition, withdrawal_reason AS reason
            FROM material_map_state WHERE map_id = ${first.id}`),
        ),
      ).toEqual({ version: 1, disposition: "withdrawn", reason: "raw exact transition" })

      const firstCourse = await createCourseEndpoint(fixture, "First composite owner")
      const secondCourse = await createCourseEndpoint(fixture, "Second composite owner")
      const crossMapAlignmentID = MaterialMap.createAlignmentID()
      await expect(
        fixture.runtime.runPromise(
          publishRawAlignment(fixture.database, {
            alignmentID: crossMapAlignmentID,
            mapID: first.id,
            selectorID: secondInput.proposal.outline[0]!.selectors[0]!.id,
            endpoint: firstCourse.endpoints[0]!,
          }),
        ),
      ).rejects.toBeDefined()
      const crossCourseAlignmentID = MaterialMap.createAlignmentID()
      await expect(
        fixture.runtime.runPromise(
          publishRawAlignment(fixture.database, {
            alignmentID: crossCourseAlignmentID,
            mapID: second.id,
            selectorID: secondInput.proposal.outline[0]!.selectors[0]!.id,
            endpoint: {
              courseID: firstCourse.course.id,
              viewID: secondCourse.endpoints[0]!.viewID,
              revisionID: secondCourse.endpoints[0]!.revisionID,
              itemID: secondCourse.endpoints[0]!.itemID,
            },
          }),
        ),
      ).rejects.toBeDefined()
      expect(
        await fixture.runtime.runPromise(
          fixture.database.db.get<{ count: number }>(sql`SELECT count(*) AS count FROM material_course_alignment
            WHERE id IN (${crossMapAlignmentID}, ${crossCourseAlignmentID})`),
        ),
      ).toEqual({ count: 0 })
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest("rejects a new alignment when Course membership ABA wins the final transaction", async () => {
    const fixture = await prepareFixture()
    try {
      const representation = await acceptRepresentation(fixture)
      const mapInput = representationMapInput(fixture, representation)
      const map = await fixture.runtime.runPromise(fixture.maps.createMap(mapInput))
      const course = await createCourseEndpoint(fixture, "Course proof race")
      const input = alignmentInput(map.id, mapInput.proposal.outline[0]!.selectors[0]!.id, course.endpoints[0]!)
      const reached = await fixture.runtime.runPromise(Deferred.make<void>())
      const release = await fixture.runtime.runPromise(Deferred.make<void>())
      const originalPrepare = fixture.courses.prepareMembership
      let delayed = false
      const restorePrepare = replaceMethod(fixture.courses, "prepareMembership", (request) =>
        originalPrepare(request).pipe(
          Effect.tap(() => {
            if (delayed) return Effect.void
            delayed = true
            return Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release)))
          }),
        ),
      )
      const pending = fixture.runtime.runPromise(fixture.maps.createAlignment(input))
      try {
        await fixture.runtime.runPromise(Deferred.await(reached).pipe(Effect.timeout("5 seconds")))
        const withdrawn = await fixture.runtime.runPromise(
          fixture.courses.withdrawCourse({
            courseID: course.course.id,
            expectedCourseVersion: 0,
            expectedSelectionVersion: 0,
          }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.restoreCourse({
            courseID: course.course.id,
            expectedCourseVersion: withdrawn.stateVersion,
          }),
        )
        await fixture.runtime.runPromise(Deferred.succeed(release, undefined))
        await expect(pending).rejects.toMatchObject({
          _tag: "Course.ConflictError",
          entity: "course",
          id: course.course.id,
        })
      } finally {
        await fixture.runtime.runPromise(Deferred.succeed(release, undefined))
        restorePrepare()
        await pending.catch(() => undefined)
      }
      await expect(fixture.runtime.runPromise(fixture.maps.getAlignment(input.alignmentID))).rejects.toMatchObject({
        _tag: "MaterialMap.NotFoundError",
      })
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest(
    "keeps Course membership proof revalidation owner-owned and closes withdrawal and selection ABA",
    async () => {
      const fixture = await prepareFixture()
      try {
        const course = await fixture.runtime.runPromise(fixture.courses.createCourse({ title: "Databases" }))
        const view = await fixture.runtime.runPromise(
          fixture.courses.createView({
            courseID: course.id,
            name: "Primary route",
            expectedCourseVersion: 0,
            authorship: Course.Authorship.learnerAuthored(),
            revision: { items: [{ key: "transactions", title: "Transactions" }] },
          }),
        )
        const item = (
          await fixture.runtime.runPromise(fixture.courses.listRevisionItems(course.id, view.view.id, view.revision.id))
        ).items[0]!
        const endpoint = {
          courseID: course.id,
          viewID: view.view.id,
          revisionID: view.revision.id,
          itemID: item.itemID,
        }
        const courseProof = await fixture.runtime.runPromise(
          fixture.courses.prepareMembership({ endpoint, selection: { type: "explicit_exact" } }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.withdrawCourse({
            courseID: course.id,
            expectedCourseVersion: 0,
            expectedSelectionVersion: 0,
          }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.restoreCourse({ courseID: course.id, expectedCourseVersion: 1 }),
        )
        await expect(
          fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) => Course.requireMembershipProof(tx, courseProof)),
          ),
        ).rejects.toMatchObject({ _tag: "Course.ConflictError", entity: "course" })

        const afterCourseABA = await fixture.runtime.runPromise(fixture.courses.getCourse(course.id))
        const viewProof = await fixture.runtime.runPromise(
          fixture.courses.prepareMembership({ endpoint, selection: { type: "explicit_exact" } }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.withdrawView({
            courseID: course.id,
            viewID: view.view.id,
            expectedCourseVersion: 2,
            expectedViewVersion: 0,
            expectedSelectionVersion: afterCourseABA.selection.version,
            selection: { type: "unchanged" },
          }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.restoreView({
            courseID: course.id,
            viewID: view.view.id,
            expectedCourseVersion: 2,
            expectedViewVersion: 1,
          }),
        )
        await expect(
          fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) => Course.requireMembershipProof(tx, viewProof)),
          ),
        ).rejects.toMatchObject({ _tag: "Course.ConflictError", entity: "view" })

        const afterViewABA = await fixture.runtime.runPromise(fixture.courses.getCourse(course.id))
        const revisionProof = await fixture.runtime.runPromise(
          fixture.courses.prepareMembership({ endpoint, selection: { type: "explicit_exact" } }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.withdrawRevision({
            courseID: course.id,
            viewID: view.view.id,
            revisionID: view.revision.id,
            expectedCourseVersion: 2,
            expectedViewVersion: 2,
            expectedRevisionVersion: 0,
            expectedSelectionVersion: afterViewABA.selection.version,
            selection: { type: "unchanged" },
          }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.restoreRevision({
            courseID: course.id,
            viewID: view.view.id,
            revisionID: view.revision.id,
            expectedCourseVersion: 2,
            expectedViewVersion: 2,
            expectedRevisionVersion: 1,
          }),
        )
        await expect(
          fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) => Course.requireMembershipProof(tx, revisionProof)),
          ),
        ).rejects.toMatchObject({ _tag: "Course.ConflictError", entity: "revision" })

        const afterRevisionABA = await fixture.runtime.runPromise(fixture.courses.getCourse(course.id))
        const selected = await fixture.runtime.runPromise(
          fixture.courses.select({
            courseID: course.id,
            revisionID: view.revision.id,
            expectedCourseVersion: 2,
            expectedSelectionVersion: afterRevisionABA.selection.version,
            expectedViewVersion: 2,
            expectedRevisionVersion: 2,
          }),
        )
        const selectionProof = await fixture.runtime.runPromise(
          fixture.courses.prepareMembership({
            endpoint,
            selection: { type: "observed_working", revisionID: view.revision.id, version: selected.version },
          }),
        )
        const alternate = await fixture.runtime.runPromise(
          fixture.courses.createView({
            courseID: course.id,
            name: "Alternate route",
            expectedCourseVersion: 2,
            authorship: Course.Authorship.learnerAuthored(),
            revision: { items: [{ key: "alternate", title: "Alternate" }] },
          }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.select({
            courseID: course.id,
            revisionID: alternate.revision.id,
            expectedCourseVersion: 2,
            expectedSelectionRevisionID: view.revision.id,
            expectedSelectionVersion: selected.version,
            expectedViewVersion: 0,
            expectedRevisionVersion: 0,
          }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.select({
            courseID: course.id,
            revisionID: view.revision.id,
            expectedCourseVersion: 2,
            expectedSelectionRevisionID: alternate.revision.id,
            expectedSelectionVersion: selected.version + 1,
            expectedViewVersion: 2,
            expectedRevisionVersion: 2,
          }),
        )
        await expect(
          fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) => Course.requireMembershipProof(tx, selectionProof)),
          ),
        ).rejects.toMatchObject({ _tag: "Course.ConflictError", entity: "selection" })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest("pages every Material Map collection with stable scoped cursors", async () => {
    const fixture = await prepareFixture()
    try {
      const representation = await acceptRepresentation(fixture)
      const initial = representationMapInput(fixture, representation)
      const leaf = initial.proposal.outline[0]!
      const rootNodeID = MaterialMap.createOutlineNodeID()
      const baseInput = {
        ...initial,
        proposal: {
          ...initial.proposal,
          outline: [
            {
              id: rootNodeID,
              title: "Paginated material structure",
              preorderPosition: 0,
              depth: 0,
              selectors: [],
            },
            { ...leaf, parentNodeID: rootNodeID, preorderPosition: 1, depth: 1 },
          ],
        },
      }
      const base = await fixture.runtime.runPromise(fixture.maps.createMap(baseInput))
      const alternativeInput = representationMapInput(fixture, representation)
      const alternative = await fixture.runtime.runPromise(fixture.maps.createMap(alternativeInput))
      const successorInputs = [
        representationMapInput(fixture, representation),
        representationMapInput(fixture, representation),
      ].map((input) => ({ ...input, proposal: { ...input.proposal, supersedesMapID: base.id } }))
      const successors = await Promise.all(
        successorInputs.map((input) => fixture.runtime.runPromise(fixture.maps.createMap(input))),
      )
      const withdrawnMap = await fixture.runtime.runPromise(
        fixture.maps.withdrawMap({ mapID: base.id, expectedVersion: 0, reason: "pagination history" }),
      )
      await fixture.runtime.runPromise(
        fixture.maps.restoreMap({ mapID: base.id, expectedVersion: withdrawnMap.disposition.version }),
      )

      const maps = await collectPages((cursor) =>
        fixture.runtime.runPromise(
          fixture.maps.listMaps({
            target: baseInput.proposal.target,
            includeWithdrawn: true,
            includeSuperseded: true,
            limit: 1,
            ...(cursor ? { cursor } : {}),
          }),
        ),
      )
      expect(new Set(maps.map((map) => map.id))).toEqual(
        new Set([base.id, alternative.id, ...successors.map((map) => map.id)]),
      )
      expect(
        (
          await collectPages((cursor) =>
            fixture.runtime.runPromise(fixture.maps.listOutline(base.id, { limit: 1, ...(cursor ? { cursor } : {}) })),
          )
        ).map((node) => node.id),
      ).toEqual(baseInput.proposal.outline.map((node) => node.id))
      expect(
        new Set(
          (
            await collectPages((cursor) =>
              fixture.runtime.runPromise(
                fixture.maps.listMapSuccessors(base.id, { limit: 1, ...(cursor ? { cursor } : {}) }),
              ),
            )
          ).map((map) => map.id),
        ),
      ).toEqual(new Set(successors.map((map) => map.id)))
      expect(
        (
          await collectPages((cursor) =>
            fixture.runtime.runPromise(
              fixture.maps.listMapDispositions(base.id, { limit: 1, ...(cursor ? { cursor } : {}) }),
            ),
          )
        ).map((event) => event.version),
      ).toEqual([0, 1, 2])

      const course = await createCourseEndpoint(fixture, "Paginated material alignment")
      const selectorIDs = baseInput.proposal.outline[1]!.selectors.map((selector) => selector.id)
      const drafts = [
        alignmentInput(base.id, selectorIDs[0]!, course.endpoints[0]!),
        alignmentInput(base.id, selectorIDs[0]!, course.endpoints[1]!),
        alignmentInput(base.id, selectorIDs[1]!, course.endpoints[0]!),
      ]
      const alignments = await Promise.all(
        drafts.map((draft) => fixture.runtime.runPromise(fixture.maps.createAlignment(draft))),
      )
      const successorDrafts = [
        alignmentInput(base.id, selectorIDs[0]!, course.endpoints[0]!),
        alignmentInput(base.id, selectorIDs[0]!, course.endpoints[0]!),
      ].map((draft, index) => ({
        ...draft,
        proposal: {
          ...draft.proposal,
          reason: `Corrected pagination relation ${index + 1}`,
          supersedesAlignmentID: alignments[0]!.id,
        },
      }))
      const alignmentSuccessors = await Promise.all(
        successorDrafts.map((draft) => fixture.runtime.runPromise(fixture.maps.createAlignment(draft))),
      )
      const withdrawnAlignment = await fixture.runtime.runPromise(
        fixture.maps.withdrawAlignment({
          alignmentID: alignments[0]!.id,
          expectedVersion: 0,
          reason: "pagination history",
        }),
      )
      await fixture.runtime.runPromise(
        fixture.maps.restoreAlignment({
          alignmentID: alignments[0]!.id,
          expectedVersion: withdrawnAlignment.disposition.version,
        }),
      )
      const allAlignmentIDs = new Set([...alignments, ...alignmentSuccessors].map((alignment) => alignment.id))
      expect(
        new Set(
          (
            await collectPages((cursor) =>
              fixture.runtime.runPromise(
                fixture.maps.listAlignmentsForMap(base.id, {
                  includeWithdrawn: true,
                  includeSuperseded: true,
                  limit: 1,
                  ...(cursor ? { cursor } : {}),
                }),
              ),
            )
          ).map((alignment) => alignment.id),
        ),
      ).toEqual(allAlignmentIDs)
      expect(
        new Set(
          (
            await collectPages((cursor) =>
              fixture.runtime.runPromise(
                fixture.maps.listAlignmentsForSelector(base.id, selectorIDs[0]!, {
                  includeWithdrawn: true,
                  includeSuperseded: true,
                  limit: 1,
                  ...(cursor ? { cursor } : {}),
                }),
              ),
            )
          ).map((alignment) => alignment.id),
        ),
      ).toEqual(new Set([alignments[0]!.id, alignments[1]!.id, ...alignmentSuccessors.map((item) => item.id)]))
      expect(
        new Set(
          (
            await collectPages((cursor) =>
              fixture.runtime.runPromise(
                fixture.maps.listAlignmentsForMembership(course.endpoints[0]!, {
                  includeWithdrawn: true,
                  includeSuperseded: true,
                  limit: 1,
                  ...(cursor ? { cursor } : {}),
                }),
              ),
            )
          ).map((alignment) => alignment.id),
        ),
      ).toEqual(new Set([alignments[0]!.id, alignments[2]!.id, ...alignmentSuccessors.map((item) => item.id)]))
      expect(
        new Set(
          (
            await collectPages((cursor) =>
              fixture.runtime.runPromise(
                fixture.maps.listAlignmentSuccessors(alignments[0]!.id, {
                  limit: 1,
                  ...(cursor ? { cursor } : {}),
                }),
              ),
            )
          ).map((alignment) => alignment.id),
        ),
      ).toEqual(new Set(alignmentSuccessors.map((alignment) => alignment.id)))
      expect(
        (
          await collectPages((cursor) =>
            fixture.runtime.runPromise(
              fixture.maps.listAlignmentDispositions(alignments[0]!.id, {
                limit: 1,
                ...(cursor ? { cursor } : {}),
              }),
            ),
          )
        ).map((event) => event.version),
      ).toEqual([0, 1, 2])

      const firstMapPage = await fixture.runtime.runPromise(
        fixture.maps.listMaps({
          target: baseInput.proposal.target,
          includeSuperseded: true,
          limit: 1,
        }),
      )
      await expect(
        fixture.runtime.runPromise(
          fixture.maps.listMaps({
            target: baseInput.proposal.target,
            includeSuperseded: false,
            limit: 1,
            cursor: firstMapPage.cursor,
          }),
        ),
      ).rejects.toMatchObject({ _tag: "MaterialMap.InvalidCursorError" })
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest("keeps Representation current-use proof revalidation owner-owned across Artifact ABA", async () => {
    const fixture = await prepareFixture()
    try {
      const representation = await acceptRepresentation(fixture)
      const read = await fixture.runtime.runPromise(
        fixture.representationCurrent.readForCurrentUse({
          representationRevisionID: representation.id,
          effectiveArtifactID: fixture.artifact.id,
          selection: { type: "whole" },
          budgets: materialBudgets().representation,
        }),
      )
      const withdrawn = await fixture.runtime.runPromise(
        fixture.artifacts.withdraw({
          artifactID: fixture.artifact.id,
          expectedDispositionVersion: fixture.artifact.dispositionVersion,
        }),
      )
      await fixture.runtime.runPromise(
        fixture.artifacts.restore({
          artifactID: fixture.artifact.id,
          expectedDispositionVersion: withdrawn.dispositionVersion,
        }),
      )
      await expect(
        fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) => Representation.requireCurrentUseProof(tx, read.proof)),
        ),
      ).rejects.toMatchObject({ _tag: "Artifact.ConflictError", entity: "source", id: fixture.artifact.id })
    } finally {
      await closeFixture(fixture)
    }
  })
})

function artifactMapInput(
  fixture: Fixture,
  override?: Partial<Parameters<MaterialMap.Interface["createMap"]>[0]>,
): Parameters<MaterialMap.Interface["createMap"]>[0] {
  const mapID = MaterialMap.createMapID()
  const rootNodeID = MaterialMap.createOutlineNodeID()
  const leafNodeID = MaterialMap.createOutlineNodeID()
  return {
    mapID,
    proposal: {
      target: {
        type: "artifact",
        effectiveArtifactID: fixture.artifact.id,
        revisionID: fixture.revision.id,
        attribution: fixture.revision.attribution,
      },
      outline: [
        {
          id: rootNodeID,
          title: "Material structure",
          preorderPosition: 0,
          depth: 0,
          selectors: [],
        },
        {
          id: leafNodeID,
          parentNodeID: rootNodeID,
          title: "Opening passage",
          preorderPosition: 1,
          depth: 1,
          selectors: [
            { id: MaterialMap.createSelectorID(), position: 0, coordinate: { kind: "whole_target.v1" } },
            {
              id: MaterialMap.createSelectorID(),
              position: 1,
              coordinate: { kind: "artifact_byte_range.v1", startByte: 0, endByte: 12 },
            },
          ],
        },
      ],
    },
    authorship: MaterialMap.Authorship.trusted("learner-authored material outline", "repa.test.material", 1),
    access: {
      type: "artifact",
      source: MaterialMap.MaterialTarget.ArtifactSourceSelection.inherited(fixture.root, "source.pdf"),
    },
    budgets: materialBudgets(),
    ...override,
  }
}

function representationMapInput(
  fixture: Fixture,
  representation: Representation.RepresentationInfo,
): Parameters<MaterialMap.Interface["createMap"]>[0] {
  return {
    mapID: MaterialMap.createMapID(),
    proposal: {
      target: { type: "representation", representationRevisionID: representation.id },
      outline: [
        {
          id: MaterialMap.createOutlineNodeID(),
          title: "Readable passages",
          preorderPosition: 0,
          depth: 0,
          selectors: [
            {
              id: MaterialMap.createSelectorID(),
              position: 0,
              coordinate: { kind: "pdf_page_range.v1", startPage: 1, endPage: 1 },
            },
            {
              id: MaterialMap.createSelectorID(),
              position: 1,
              coordinate: {
                kind: "pdf_text_range.v1",
                start: { page: 1, item: 0, scalar: 0 },
                end: { page: 2, item: 0, scalar: 6 },
              },
            },
          ],
        },
      ],
    },
    authorship: MaterialMap.Authorship.trusted("learner accepted visible passages", "repa.test.material", 1),
    access: { type: "representation", effectiveArtifactID: fixture.artifact.id },
    budgets: materialBudgets(),
  }
}

function alignmentInput(
  mapID: MaterialMap.MapID,
  selectorID: MaterialMap.SelectorID,
  course: Course.MembershipEndpoint,
  options?: { readonly selection?: Course.MembershipSelection },
): Parameters<MaterialMap.Interface["createAlignment"]>[0] {
  return {
    alignmentID: MaterialMap.createAlignmentID(),
    proposal: {
      mapID,
      selectorID,
      course,
      selection: options?.selection ?? { type: "explicit_exact" },
      reason: "The selected passage explicitly grounds this exact Course item",
    },
    authorship: MaterialMap.Authorship.trusted("learner-authored exact grounding", "repa.test.alignment", 1),
    access: { type: "representation" },
    budgets: materialBudgets(),
  }
}

async function acceptRepresentation(fixture: Fixture) {
  const encoded = PDFTextProfile.encode([
    { page: 1, items: [{ text: "First readable page", lineBreakAfter: true }] },
    { page: 2, items: [{ text: "Second readable page", lineBreakAfter: false }] },
  ])
  if (!encoded.ok || fixture.read.observation.result !== "present") throw new Error("Expected PDF profile fixture")
  const ordinary = ordinarySnapshot(fixture)
  return fixture.runtime.runPromise(
    fixture.representations.accept({
      effectiveArtifactID: fixture.artifact.id,
      sourceRevisionID: fixture.revision.id,
      attribution: fixture.revision.attribution,
      recipe: Representation.localPDFRecipe,
      authority: Representation.ConversionAuthority.deterministic(
        `gate13:${Representation.createRevisionID()}`,
        "learner requested readable material",
      ),
      candidateRevisionID: Representation.createRevisionID(),
      sourceProof: {
        ordinary,
        sourceVersion: fixture.artifact.source.sourceVersion,
        authorization: fixture.read.authorization,
        relativePath: "source.pdf",
        descriptor: fixture.read.observation.descriptor,
        timeObserved: fixture.read.observation.timeObserved,
      },
      candidate: {
        kind: "local_pdf",
        runIdentity: `gate13-run:${Date.now()}:${Math.random()}`,
        provenance: Representation.localPDFRecipe,
        input: fixture.revision.fingerprint,
        bytes: encoded.value.bytes,
        diagnostics: [],
        usage: {
          kind: "local_pdf",
          pageCount: 2,
          textItemCount: 2,
          operatorCount: 0,
          imagePaintOperations: 0,
          signalPageCount: 0,
          profileByteLength: encoded.value.bytes.byteLength,
        },
      },
      timeAccepted: fixture.read.observation.timeObserved + 1,
    }),
  )
}

async function createCourseEndpoint(fixture: Fixture, title: string) {
  const course = await fixture.runtime.runPromise(fixture.courses.createCourse({ title }))
  const view = await fixture.runtime.runPromise(
    fixture.courses.createView({
      courseID: course.id,
      name: "Exact material alignment view",
      expectedCourseVersion: 0,
      authorship: Course.Authorship.learnerAuthored(),
      revision: {
        items: [
          { key: "first", title: "First exact membership" },
          { key: "second", title: "Second exact membership" },
        ],
      },
    }),
  )
  const items = await fixture.runtime.runPromise(
    fixture.courses.listRevisionItems(course.id, view.view.id, view.revision.id),
  )
  return {
    course,
    view,
    endpoints: items.items.map((item) => ({
      courseID: course.id,
      viewID: view.view.id,
      revisionID: view.revision.id,
      itemID: item.itemID,
    })),
  }
}

function materialSnapshot(database: Database.Interface) {
  return Effect.gen(function* () {
    const rows = yield* database.db.get<{
      maps: number
      nodes: number
      selectors: number
      alignments: number
      mapEvents: number
      alignmentEvents: number
    }>(sql`SELECT
      (SELECT count(*) FROM material_map) AS maps,
      (SELECT count(*) FROM material_outline_node) AS nodes,
      (SELECT count(*) FROM material_selector) AS selectors,
      (SELECT count(*) FROM material_course_alignment) AS alignments,
      (SELECT count(*) FROM material_map_disposition_event) AS mapEvents,
      (SELECT count(*) FROM material_course_alignment_disposition_event) AS alignmentEvents`)
    const frontier = yield* database.db.get<{ sequence: number; timeCommitted: number }>(sql`SELECT
      sequence,
      time_committed AS timeCommitted
      FROM learning_shared_frontier WHERE singleton = 1`)
    return { rows, frontier }
  })
}

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const original = target[key]
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
  return () => Object.defineProperty(target, key, { configurable: true, writable: true, value: original })
}

function publishRawRepresentationMap(
  database: Database.Interface,
  input: {
    readonly mapID: MaterialMap.MapID
    readonly representationRevisionID: Representation.RevisionID
    readonly targetKind: "artifact" | "representation"
    readonly nodeID: string
    readonly parentNodeID?: string
    readonly depth?: number
  },
) {
  const selectorID = MaterialMap.createSelectorID()
  return database.db.transaction((tx) =>
    Effect.gen(function* () {
      yield* tx.run("PRAGMA defer_foreign_keys = ON")
      yield* tx.run(sql`INSERT INTO material_map_representation_target (map_id, representation_revision_id)
        VALUES (${input.mapID}, ${input.representationRevisionID})`)
      yield* tx.run(sql`INSERT INTO material_map_state (
        map_id, version, disposition, withdrawal_reason, time_updated
      ) VALUES (${input.mapID}, 0, 'active', NULL, 1)`)
      yield* tx.run(sql`INSERT INTO material_map_disposition_event (
        id, map_id, version, disposition, reason, time_committed
      ) VALUES (${`mde_raw_initial_${input.mapID}`}, ${input.mapID}, 0, 'active', NULL, 1)`)
      yield* tx.run(sql`INSERT INTO material_outline_node (
        id, map_id, parent_node_id, title, preorder_position, depth
      ) VALUES (${input.nodeID}, ${input.mapID}, ${input.parentNodeID ?? null}, 'raw node', 0, ${input.depth ?? 0})`)
      yield* tx.run(sql`INSERT INTO material_selector (
        id, map_id, node_id, selector_position, kind,
        artifact_start_byte, artifact_end_byte,
        pdf_start_page, pdf_end_page, pdf_start_item, pdf_start_scalar, pdf_end_item, pdf_end_scalar,
        model_start_scalar, model_end_scalar,
        witness_algorithm, witness_digest, witness_byte_length
      ) VALUES (
        ${selectorID}, ${input.mapID}, ${input.nodeID}, 0, 'whole_target.v1',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        'sha256', ${"0".repeat(64)}, 1
      )`)
      yield* tx.run(sql`INSERT INTO material_map (
        id, canonical_input, target_kind, supersedes_map_id,
        authorship_basis, authorship_capability_identity, authorship_capability_version, time_created
      ) VALUES (${input.mapID}, '{}', ${input.targetKind}, NULL, 'raw constraint probe', 'repa.test', 1, 1)`)
    }),
  )
}

function publishRawAlignment(
  database: Database.Interface,
  input: {
    readonly alignmentID: MaterialMap.AlignmentID
    readonly mapID: MaterialMap.MapID
    readonly selectorID: MaterialMap.SelectorID
    readonly endpoint: Course.MembershipEndpoint
  },
) {
  return database.db.transaction((tx) =>
    Effect.gen(function* () {
      yield* tx.run("PRAGMA defer_foreign_keys = ON")
      yield* tx.run(sql`INSERT INTO material_course_alignment_state (
        alignment_id, version, disposition, withdrawal_reason, time_updated
      ) VALUES (${input.alignmentID}, 0, 'active', NULL, 1)`)
      yield* tx.run(sql`INSERT INTO material_course_alignment_disposition_event (
        id, alignment_id, version, disposition, reason, time_committed
      ) VALUES (${`mae_raw_initial_${input.alignmentID}`}, ${input.alignmentID}, 0, 'active', NULL, 1)`)
      yield* tx.run(sql`INSERT INTO material_course_alignment (
        id, canonical_input, map_id, selector_id,
        course_id, view_id, revision_id, item_id,
        selection_basis, observed_selection_revision_id, observed_selection_version,
        accepted_course_version, accepted_view_version, accepted_revision_version,
        reason, supersedes_alignment_id,
        authorship_basis, authorship_capability_identity, authorship_capability_version, time_created
      ) VALUES (
        ${input.alignmentID}, '{}', ${input.mapID}, ${input.selectorID},
        ${input.endpoint.courseID}, ${input.endpoint.viewID}, ${input.endpoint.revisionID}, ${input.endpoint.itemID},
        'explicit_exact', NULL, NULL, 0, 0, 0,
        'raw exact relation', NULL, 'raw constraint probe', 'repa.test', 1, 1
      )`)
    }),
  )
}

function ordinarySnapshot(fixture: Fixture): Artifact.OrdinaryUseRevisionSnapshot {
  return {
    effectiveArtifactID: fixture.artifact.id,
    dispositionVersion: fixture.artifact.dispositionVersion,
    currentRevisionID: fixture.revision.id,
    attribution: fixture.revision.attribution,
    lineageVersion: fixture.artifact.lineageVersion,
    fingerprint: fixture.revision.fingerprint,
    mediaType: fixture.artifact.source.descriptor!.mediaType,
  }
}

function materialBudgets(): MaterialMap.MaterialTarget.ReadBudgets {
  return {
    artifactBytes: 1024 * 1024,
    representation: { integrityScanBytes: 1024 * 1024, returnBytes: 1024 * 1024, records: 100 },
  }
}

async function collectPages<T>(read: (cursor?: string) => Promise<MaterialMap.Page<T>>, cursor?: string): Promise<T[]> {
  const page = await read(cursor)
  if (!page.cursor) return page.items
  return [...page.items, ...(await collectPages(read, page.cursor))]
}

function observer(receipt: ContentRoot.ReadAuthorizationReceipt) {
  return Artifact.Observer.trusted(
    `content-root:${receipt.contentRootID}:${receipt.bindingID}:${receipt.grantEpisodeID}`,
    receipt.grantVersion,
  )
}
