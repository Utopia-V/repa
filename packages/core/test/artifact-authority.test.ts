import { describe, expect, test } from "bun:test"
import path from "path"
import { sql } from "drizzle-orm"
import { Effect, Exit, Layer } from "effect"
import { Artifact } from "@opencode-ai/core/artifact"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(LayerNode.compile(LayerNode.group([Artifact.node, Database.node]), [[Database.node, database]]))
const observer = Artifact.Observer.trusted("gate-10-observer", 1)
const admission = Artifact.Admission.learnerInstruction("artifact-admission", 1)
const rebind = Artifact.Rebind.explicitLearnerChoice("artifact-rebind", 1)
const lineage = Artifact.LineageCorrectionAuthority.learnerStatement("lineage-correction", 1)

function location(name: string) {
  return Artifact.CanonicalLocation.trusted(path.resolve("artifact-evidence", name))
}

function fingerprint(hex: string, byteLength = 100): Artifact.Fingerprint {
  return { algorithm: "sha256", digest: hex.repeat(64), byteLength }
}

function present(hex: string, timeObserved: number, mediaType = "application/pdf"): Artifact.PresentObservation {
  return { result: "present", fingerprint: fingerprint(hex), mediaType, observer, timeObserved }
}

function missing(timeObserved: number): Artifact.MissingObservation {
  return { result: "missing", observer, timeObserved }
}

function boundary(artifact: Artifact.ArtifactInfo): Artifact.LineageBoundary {
  return {
    bindingID: artifact.source.activeBinding?.id,
    sourceStateBasis: artifact.source.sourceStateBasis,
    revisionID: artifact.source.currentRevisionID,
    revisionAttribution: artifact.source.revisionAttribution,
    descriptor: artifact.source.descriptor,
    availability: artifact.source.availability,
  }
}

function effectiveBoundary(member: Artifact.LineageCorrectionMemberInfo): Artifact.LineageBoundary {
  return {
    ...member.boundary,
    sourceStateBasis: { type: "lineage_correction", memberID: member.id },
    revisionAttribution: { type: "lineage_correction", memberID: member.id },
  }
}

describe("Artifact authority", () => {
  it.effect("admits explicit sources and preserves exact Observation and Revision state", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const p = location("ordinary-primary.pdf")
      const q = location("ordinary-independent-copy.pdf")
      const admitted = yield* artifacts.admit({ location: p, observation: present("a", 10), authority: admission })

      expect(admitted).toMatchObject({
        admissionRootArtifactID: admitted.id,
        creationBasis: "learner_instruction",
        dispositionVersion: 0,
        lineageVersion: 0,
        correctionHidden: false,
        source: { sourceVersion: 0, availability: "available" },
      })
      expect(admitted.source.activeBinding?.location).toBe(p.value)

      const duplicateLocation = yield* Effect.flip(
        artifacts.admit({ location: p, observation: present("b", 11), authority: admission }),
      )
      expect(duplicateLocation).toMatchObject({
        _tag: "Artifact.LocationConflictError",
        location: p.value,
        artifactID: admitted.id,
      })

      const independent = yield* artifacts.admit({ location: q, observation: present("a", 12), authority: admission })
      expect(independent.id).not.toBe(admitted.id)
      expect(independent.admissionRootArtifactID).toBe(independent.id)
      expect((yield* artifacts.listArtifacts()).items).toHaveLength(2)

      const forged = yield* Effect.flip(
        artifacts.admit({
          location: { value: path.resolve("artifact-evidence", "forged.pdf") } as Artifact.CanonicalLocation,
          observation: present("c", 13),
          authority: admission,
        }),
      )
      expect(forged).toMatchObject({ _tag: "Artifact.InvalidTransitionError" })
      expect((yield* artifacts.listArtifacts()).items).toHaveLength(2)

      const noOp = yield* artifacts.observe({
        expected: Artifact.expectedSource(admitted),
        observation: present("a", 20),
      })
      expect(noOp.changed).toBeFalse()
      expect(noOp.artifact.source.sourceVersion).toBe(0)

      const b = yield* artifacts.observe({
        expected: Artifact.expectedSource(noOp.artifact),
        observation: present("b", 30),
      })
      const aAgain = yield* artifacts.observe({
        expected: Artifact.expectedSource(b.artifact),
        observation: present("a", 40),
      })
      expect(aAgain.changed).toBeTrue()
      expect(aAgain.artifact.source.sourceVersion).toBe(2)
      expect((yield* artifacts.listRevisions(admitted.id, { view: "recorded" })).items).toHaveLength(2)
      expect((yield* artifacts.listObservations(admitted.id)).items).toHaveLength(3)

      const unavailable = yield* artifacts.observe({
        expected: Artifact.expectedSource(aAgain.artifact),
        observation: missing(50),
      })
      expect(unavailable.artifact.source).toMatchObject({ availability: "missing", sourceVersion: 3 })
      const repeatedMissing = yield* artifacts.observe({
        expected: Artifact.expectedSource(unavailable.artifact),
        observation: missing(60),
      })
      expect(repeatedMissing.changed).toBeFalse()
      const restoredBytes = yield* artifacts.observe({
        expected: Artifact.expectedSource(repeatedMissing.artifact),
        observation: present("a", 70),
      })
      expect(restoredBytes.artifact.source).toMatchObject({ availability: "available", sourceVersion: 4 })
      expect((yield* artifacts.listObservations(admitted.id)).items).toHaveLength(5)

      const changedDescriptor = yield* Effect.flip(
        artifacts.observe({
          expected: Artifact.expectedSource(restoredBytes.artifact),
          observation: present("a", 80, "application/x-pdf"),
        }),
      )
      expect(changedDescriptor).toMatchObject({ _tag: "Artifact.InvalidTransitionError" })

      const corrected = yield* artifacts.correctObservation({
        observationID: restoredBytes.observationID!,
        mediaType: "application/x-pdf",
        authority: Artifact.ObservationCorrectionAuthority.trustedObserver("media-detector", 2),
        expectedArtifacts: [Artifact.expectedSource(restoredBytes.artifact)],
      })
      expect(corrected.correction).toMatchObject({ sequence: 1, mediaType: "application/x-pdf" })
      expect(corrected.affectedArtifacts[0]!.source).toMatchObject({
        sourceVersion: 5,
        descriptor: { correctionID: corrected.correction.id, mediaType: "application/x-pdf" },
      })
      const correctedNoOp = yield* artifacts.observe({
        expected: Artifact.expectedSource(corrected.affectedArtifacts[0]!),
        observation: present("a", 90, "application/x-pdf"),
      })
      expect(correctedNoOp.changed).toBeFalse()

      const missingAgain = yield* artifacts.observe({
        expected: Artifact.expectedSource(correctedNoOp.artifact),
        observation: missing(100),
      })
      const differentRestoration = yield* artifacts.observe({
        expected: Artifact.expectedSource(missingAgain.artifact),
        observation: present("c", 110, "application/x-pdf"),
      })
      expect(differentRestoration.artifact.source).toMatchObject({ availability: "available", sourceVersion: 7 })
      expect((yield* artifacts.listRevisions(admitted.id, { view: "recorded" })).items).toHaveLength(3)
      expect((yield* artifacts.listObservations(admitted.id)).items).toHaveLength(7)

      const withdrawn = yield* artifacts.withdraw({ artifactID: admitted.id, expectedDispositionVersion: 0 })
      expect(withdrawn).toMatchObject({ dispositionVersion: 1, withdrawalReason: "removed" })
      expect((yield* artifacts.lookupActiveLocation(p))?.artifact.id).toBe(admitted.id)
      const inactive = yield* Effect.flip(
        artifacts.observe({ expected: Artifact.expectedSource(withdrawn), observation: present("b", 120) }),
      )
      expect(inactive).toMatchObject({ _tag: "Artifact.InactiveError", reason: "removed" })
      const restored = yield* artifacts.restore({ artifactID: admitted.id, expectedDispositionVersion: 1 })
      expect(restored).toMatchObject({ dispositionVersion: 2, withdrawalReason: undefined })
      expect((yield* artifacts.listObservations(admitted.id)).items).toHaveLength(7)
      const staleAfterAba = yield* Effect.flip(
        artifacts.observe({
          expected: Artifact.expectedSource(differentRestoration.artifact),
          observation: present("d", 130),
        }),
      )
      expect(staleAfterAba).toMatchObject({ _tag: "Artifact.ConflictError", id: admitted.id })
    }),
  )

  it.effect("guards ordinary use by semantic Artifact state without coupling source availability", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const storage = yield* Database.Service
      const admitted = yield* artifacts.admit({
        location: location("ordinary-use-guard.pdf"),
        observation: present("a", 10),
        authority: admission,
      })
      const ordinary = yield* storage.db.transaction((tx) => Artifact.readOrdinaryUseSnapshot(tx, admitted.id))
      expect(Object.keys(ordinary).sort()).toEqual([
        "attribution",
        "currentRevisionID",
        "dispositionVersion",
        "effectiveArtifactID",
        "lineageVersion",
      ])
      const expected = yield* storage.db.transaction((tx) => Artifact.readOrdinaryUseRevisionSnapshot(tx, admitted.id))
      expect(Object.keys(expected).sort()).toEqual([
        "attribution",
        "currentRevisionID",
        "dispositionVersion",
        "effectiveArtifactID",
        "fingerprint",
        "lineageVersion",
        "mediaType",
      ])

      const unavailable = yield* artifacts.observe({
        expected: Artifact.expectedSource(admitted),
        observation: missing(20),
      })
      expect(unavailable.artifact.source.sourceVersion).toBeGreaterThan(admitted.source.sourceVersion)
      expect(yield* storage.db.transaction((tx) => Artifact.requireOrdinaryUseRevisionSnapshot(tx, expected))).toEqual(
        expected,
      )

      const restored = yield* artifacts.observe({
        expected: Artifact.expectedSource(unavailable.artifact),
        observation: present("a", 30),
      })
      expect(restored.artifact.source.sourceVersion).toBeGreaterThan(unavailable.artifact.source.sourceVersion)
      expect(yield* storage.db.transaction((tx) => Artifact.requireOrdinaryUseRevisionSnapshot(tx, expected))).toEqual(
        expected,
      )

      const corrected = yield* artifacts.correctObservation({
        observationID: restored.observationID!,
        mediaType: "application/x-pdf",
        authority: Artifact.ObservationCorrectionAuthority.trustedObserver("media-detector", 1),
        expectedArtifacts: [Artifact.expectedSource(restored.artifact)],
      })
      expect(
        yield* Effect.flip(storage.db.transaction((tx) => Artifact.requireOrdinaryUseRevisionSnapshot(tx, expected))),
      ).toMatchObject({ _tag: "Artifact.ConflictError", id: admitted.id })
      const correctedExpected = yield* storage.db.transaction((tx) =>
        Artifact.readOrdinaryUseRevisionSnapshot(tx, admitted.id),
      )
      expect(correctedExpected).toMatchObject({ mediaType: "application/x-pdf", fingerprint: fingerprint("a") })

      const drifted = yield* artifacts.observe({
        expected: Artifact.expectedSource(corrected.affectedArtifacts[0]!),
        observation: present("b", 40, "application/x-pdf"),
      })
      expect(drifted.artifact.source.currentRevisionID).not.toBe(correctedExpected.currentRevisionID)
      expect(
        yield* Effect.flip(
          storage.db.transaction((tx) => Artifact.requireOrdinaryUseRevisionSnapshot(tx, correctedExpected)),
        ),
      ).toMatchObject({ _tag: "Artifact.ConflictError", id: admitted.id })
    }),
  )

  it.effect("rebinds only by explicit choice and rolls a failed source transition back atomically", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const storage = yield* Database.Service
      const p = location("rebind-primary.pdf")
      const q = location("rebind-destination.pdf")
      const admitted = yield* artifacts.admit({ location: p, observation: present("a", 10), authority: admission })
      const stale = Artifact.expectedSource(admitted)
      const rebound = yield* artifacts.rebind({
        expected: stale,
        destination: q,
        observation: present("b", 20),
        authority: rebind,
      })

      expect(yield* artifacts.lookupActiveLocation(p)).toBeUndefined()
      expect((yield* artifacts.lookupActiveLocation(q))?.artifact.id).toBe(admitted.id)
      const locationPlan = yield* storage.db.all<{ detail: string }>(sql`
        EXPLAIN QUERY PLAN
        SELECT id
        FROM artifact_source_binding
        WHERE canonical_location = ${q.value} AND time_ended IS NULL
      `)
      expect(locationPlan.map((row) => row.detail).join(" ")).toContain("artifact_source_binding_active_location_idx")
      expect((yield* artifacts.listBindings(admitted.id)).items).toMatchObject([
        { ordinal: 1, location: p.value, endReason: "explicit_rebind" },
        { ordinal: 2, location: q.value, timeEnded: undefined },
      ])
      const staleWrite = yield* Effect.flip(artifacts.observe({ expected: stale, observation: present("c", 30) }))
      expect(staleWrite).toMatchObject({ _tag: "Artifact.ConflictError", id: admitted.id })

      const missingAdmission = yield* Effect.flip(
        artifacts.admit({
          location: location("missing-admission.pdf"),
          observation: missing(35) as unknown as Artifact.PresentObservation,
          authority: admission,
        }),
      )
      expect(missingAdmission).toMatchObject({ _tag: "Artifact.InvalidTransitionError" })

      yield* storage.db.run(sql`
        CREATE TRIGGER reject_artifact_admission
        BEFORE INSERT ON artifact_source_observation
        WHEN NEW.observer_capability_identity = 'reject-admission'
        BEGIN
          SELECT RAISE(ABORT, 'injected admission failure');
        END
      `)
      const failedAdmission = yield* Effect.exit(
        artifacts.admit({
          location: location("failed-admission.pdf"),
          observation: { ...present("c", 36), observer: Artifact.Observer.trusted("reject-admission", 1) },
          authority: admission,
        }),
      )
      expect(Exit.isFailure(failedAdmission)).toBeTrue()
      yield* storage.db.run(sql`DROP TRIGGER reject_artifact_admission`)
      expect((yield* artifacts.listArtifacts()).items).toHaveLength(1)

      yield* storage.db.run(sql`
        CREATE TRIGGER reject_artifact_observation
        BEFORE INSERT ON artifact_source_observation
        WHEN NEW.occurrence_ordinal = 3
        BEGIN
          SELECT RAISE(ABORT, 'injected observation failure');
        END
      `)
      const failed = yield* Effect.exit(
        artifacts.observe({ expected: Artifact.expectedSource(rebound), observation: present("c", 40) }),
      )
      expect(Exit.isFailure(failed)).toBeTrue()
      yield* storage.db.run(sql`DROP TRIGGER reject_artifact_observation`)
      expect(yield* artifacts.getArtifact(admitted.id)).toEqual(rebound)
      expect((yield* artifacts.listObservations(admitted.id)).items).toHaveLength(2)
      expect((yield* artifacts.listRevisions(admitted.id, { view: "recorded" })).items).toHaveLength(2)
    }),
  )

  it.effect("serializes competing admission of one canonical location to one typed owner", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const contested = location("contested-admission.pdf")
      const results = yield* Effect.all(
        ["a", "b"].map((hex, index) =>
          artifacts.admit({
            location: contested,
            observation: present(hex, 10 + index),
            authority: admission,
          }),
        ),
        { concurrency: "unbounded", mode: "result" },
      )
      const success = results.filter((result) => result._tag === "Success")
      const failure = results.filter((result) => result._tag === "Failure")

      expect(success).toHaveLength(1)
      expect(failure).toHaveLength(1)
      expect(failure[0]!._tag === "Failure" ? failure[0]!.failure : undefined).toMatchObject({
        _tag: "Artifact.LocationConflictError",
        artifactID: success[0]!._tag === "Success" ? success[0]!.success.id : undefined,
      })
      expect((yield* artifacts.lookupActiveLocation(contested))?.artifact.id).toBe(
        success[0]!._tag === "Success" ? success[0]!.success.id : undefined,
      )
    }),
  )

  it.effect("corrects an unnoticed replacement across binding episodes without retargeting old references", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const storage = yield* Database.Service
      const p = location("lineage-primary.pdf")
      const q = location("lineage-rebound.pdf")
      const x = yield* artifacts.admit({ location: p, observation: present("a", 10), authority: admission })
      const b = yield* artifacts.observe({ expected: Artifact.expectedSource(x), observation: present("b", 20) })
      const bRevisionID = b.artifact.source.currentRevisionID!
      const c = yield* artifacts.rebind({
        expected: Artifact.expectedSource(b.artifact),
        destination: q,
        observation: present("c", 30),
        authority: rebind,
      })

      const request = {
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(c)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 1,
            endAtOrdinal: 3,
            timeEffective: 15,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(c),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      } as const
      yield* storage.db.run(sql`
        CREATE TRIGGER reject_lineage_member
        BEFORE INSERT ON artifact_lineage_correction_member
        BEGIN
          SELECT RAISE(ABORT, 'injected lineage failure');
        END
      `)
      const failed = yield* Effect.exit(artifacts.correctLineage(request))
      expect(Exit.isFailure(failed)).toBeTrue()
      yield* storage.db.run(sql`DROP TRIGGER reject_lineage_member`)
      expect((yield* artifacts.listArtifacts()).items).toHaveLength(1)
      expect((yield* artifacts.listLineageCorrections(x.id)).items).toEqual([])
      expect(yield* artifacts.getArtifact(x.id)).toEqual(c)
      expect((yield* artifacts.lookupActiveLocation(q))?.artifact.id).toBe(x.id)

      const correction = yield* artifacts.correctLineage(request)
      const y = correction.newArtifact!
      const correctedX = yield* artifacts.getArtifact(x.id)

      expect(y).toMatchObject({
        admissionRootArtifactID: x.id,
        creationBasis: "lineage_correction",
        source: { availability: "available", activeBinding: { location: q.value } },
      })
      expect(correctedX.source).toMatchObject({ availability: "unbound", activeBinding: undefined })
      expect((yield* artifacts.lookupActiveLocation(q))?.artifact.id).toBe(y.id)

      const observations = (yield* artifacts.listObservations(x.id)).items
      expect(observations.map((item) => item.recordedArtifactID)).toEqual([x.id, x.id, x.id])
      expect(observations.map((item) => item.effectiveArtifactID)).toEqual([x.id, y.id, y.id])
      expect((yield* artifacts.listRevisions(x.id, { view: "recorded" })).items).toHaveLength(3)
      expect(
        (yield* artifacts.listRevisions(x.id, { view: "effective" })).items.map((item) => item.fingerprint.digest),
      ).toEqual([fingerprint("a").digest])
      expect(
        (yield* artifacts.listRevisions(y.id, { view: "effective" })).items.map((item) => item.fingerprint.digest),
      ).toEqual([fingerprint("b").digest, fingerprint("c").digest])
      expect(yield* artifacts.getRevision(x.id, bRevisionID, { type: "recorded" })).toMatchObject({
        recordedArtifactID: x.id,
        effectiveArtifactID: x.id,
        attribution: { type: "recorded" },
      })
      expect((yield* artifacts.listBindings(x.id)).items).toMatchObject([
        { location: p.value, endReason: "explicit_rebind" },
        { location: q.value, endReason: "lineage_correction" },
      ])
      expect((yield* artifacts.listBindings(y.id)).items).toMatchObject([
        { location: q.value, basis: { type: "lineage_correction" }, timeEnded: undefined },
      ])
      for (const column of [
        "boundary_binding_id",
        "boundary_observation_id",
        "boundary_descriptor_observation_id",
        "boundary_descriptor_correction_id",
      ]) {
        const dangling = yield* Effect.exit(
          storage.db.run(
            sql`UPDATE artifact_lineage_correction_member SET ${sql.identifier(column)} = ${"missing"} WHERE id = ${correction.members[0]!.id}`,
          ),
        )
        expect(Exit.isFailure(dangling)).toBeTrue()
      }
      expect(yield* storage.db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
    }),
  )

  it.effect("represents an identical-byte identity break without fabricating an Observation", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const p = location("same-byte-replacement.pdf")
      const x = yield* artifacts.admit({ location: p, observation: present("a", 10), authority: admission })
      const correction = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(x)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 1,
            endAtOrdinal: 1,
            timeEffective: 20,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(x),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      const y = correction.newArtifact!

      expect((yield* artifacts.listObservations(x.id)).items).toHaveLength(1)
      expect((yield* artifacts.listRevisions(x.id, { view: "effective" })).items).toHaveLength(1)
      expect((yield* artifacts.listRevisions(y.id, { view: "effective" })).items).toHaveLength(1)
      expect((yield* artifacts.lookupActiveLocation(p))?.artifact.id).toBe(y.id)
      expect((yield* artifacts.getArtifact(x.id)).source.availability).toBe("unbound")
      expect(correction.members[0]).toMatchObject({ startAfterOrdinal: 1, endAtOrdinal: 1 })
    }),
  )

  it.effect("rejects mixed admission roots while allowing one finite same-root multi-history correction", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const p = yield* artifacts.admit({
        location: location("mixed-root-p.pdf"),
        observation: present("a", 10),
        authority: admission,
      })
      const q = yield* artifacts.admit({
        location: location("mixed-root-q.pdf"),
        observation: present("b", 11),
        authority: admission,
      })
      const before = (yield* artifacts.listArtifacts()).items.length
      const mixed = yield* Effect.flip(
        artifacts.correctLineage({
          admissionRootArtifactID: p.id,
          createTarget: true,
          authority: lineage,
          expectedArtifacts: [Artifact.expectedSource(p), Artifact.expectedSource(q)],
          members: [
            {
              recordedArtifactID: p.id,
              expectedLineageVersion: 0,
              startAfterOrdinal: 0,
              endAtOrdinal: 1,
              timeEffective: 20,
              expectedWinningAttribution: { type: "recorded" },
              boundary: boundary(p),
              outcome: { type: "new" },
              projectOutcome: true,
            },
            {
              recordedArtifactID: q.id,
              expectedLineageVersion: 0,
              startAfterOrdinal: 0,
              endAtOrdinal: 1,
              timeEffective: 20,
              expectedWinningAttribution: { type: "recorded" },
              boundary: boundary(q),
              outcome: { type: "new" },
            },
          ],
        }),
      )
      expect(mixed).toMatchObject({ _tag: "Artifact.InvalidTransitionError" })
      expect((yield* artifacts.listArtifacts()).items).toHaveLength(before)
      expect((yield* artifacts.getArtifact(p.id)).lineageVersion).toBe(0)
      expect((yield* artifacts.getArtifact(q.id)).lineageVersion).toBe(0)

      const x = yield* artifacts.admit({
        location: location("same-root-x.pdf"),
        observation: present("c", 30),
        authority: admission,
      })
      const xD = yield* artifacts.observe({ expected: Artifact.expectedSource(x), observation: present("d", 40) })
      const first = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(xD.artifact)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 1,
            endAtOrdinal: 2,
            timeEffective: 35,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(xD.artifact),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      const yE = yield* artifacts.observe({
        expected: Artifact.expectedSource(first.newArtifact!),
        observation: present("e", 50),
      })
      const firstMember = first.members[0]!
      const second = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(yE.artifact)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 1,
            startAfterOrdinal: 1,
            endAtOrdinal: 2,
            timeEffective: 45,
            expectedWinningAttribution: { type: "lineage_correction", memberID: firstMember.id },
            boundary: effectiveBoundary(firstMember),
            outcome: { type: "new" },
          },
          {
            recordedArtifactID: first.newArtifact!.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 0,
            endAtOrdinal: 1,
            timeEffective: 45,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(yE.artifact),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })

      expect(second.newArtifact?.admissionRootArtifactID).toBe(x.id)
      expect((yield* artifacts.lookupActiveLocation(location("same-root-x.pdf")))?.artifact.id).toBe(
        second.newArtifact!.id,
      )
      expect((yield* artifacts.listRevisions(second.newArtifact!.id, { view: "effective" })).items).toHaveLength(2)
      expect((yield* artifacts.getArtifact(first.newArtifact!.id)).correctionHidden).toBeTrue()
      const lineagePage1 = yield* artifacts.listLineageCorrections(second.newArtifact!.id, { limit: 1 })
      const lineagePage2 = yield* artifacts.listLineageCorrections(second.newArtifact!.id, {
        limit: 1,
        cursor: lineagePage1.cursor,
      })
      expect(new Set([...lineagePage1.items, ...lineagePage2.items].map((item) => item.id))).toEqual(
        new Set(second.members.map((item) => item.id)),
      )
    }),
  )

  it.effect("resolves an immutable corrected Revision after its member is superseded", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const x = yield* artifacts.admit({
        location: location("superseded-reference.pdf"),
        observation: present("a", 10),
        authority: admission,
      })
      const revisionID = x.source.currentRevisionID!
      const first = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(x)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 0,
            endAtOrdinal: 1,
            timeEffective: 5,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(x),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      const firstMember = first.members[0]!
      const exact = {
        type: "lineage_correction" as const,
        memberID: firstMember.id,
      }
      expect(yield* artifacts.getRevision(first.newArtifact!.id, revisionID, exact)).toMatchObject({
        id: revisionID,
        effectiveArtifactID: first.newArtifact!.id,
        attribution: exact,
      })

      yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(first.newArtifact!)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 1,
            startAfterOrdinal: 0,
            endAtOrdinal: 1,
            timeEffective: 6,
            expectedWinningAttribution: exact,
            boundary: effectiveBoundary(firstMember),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })

      expect(yield* artifacts.getRevision(first.newArtifact!.id, revisionID, exact)).toMatchObject({
        id: revisionID,
        effectiveArtifactID: first.newArtifact!.id,
        attribution: exact,
      })
    }),
  )

  it.effect("preserves cross-recorded Revision attribution in reads, boundaries, and fallback", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const x = yield* artifacts.admit({
        location: location("cross-recorded-x.pdf"),
        observation: present("a", 10),
        authority: admission,
      })
      const first = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(x)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 0,
            endAtOrdinal: 1,
            timeEffective: 5,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(x),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      const firstMember = first.members[0]!
      const exact = { type: "lineage_correction" as const, memberID: firstMember.id }
      const yA = yield* artifacts.rebind({
        expected: Artifact.expectedSource(first.newArtifact!),
        destination: location("cross-recorded-y.pdf"),
        observation: present("a", 20),
        authority: rebind,
      })
      const aRevisionID = yA.source.currentRevisionID!
      const revisions = (yield* artifacts.listRevisions(yA.id, { view: "effective" })).items
      expect(revisions).toHaveLength(1)
      expect(revisions[0]).toMatchObject({ id: aRevisionID, attribution: exact })
      const yObservation = (yield* artifacts.listObservations(yA.id)).items[0]!
      expect(yObservation.recordedRevisionAttribution).toEqual(exact)

      const yB = yield* artifacts.observe({
        expected: Artifact.expectedSource(yA),
        observation: present("b", 30),
      })
      const falseBoundary = yield* Effect.flip(
        artifacts.correctLineage({
          admissionRootArtifactID: x.id,
          createTarget: true,
          authority: lineage,
          expectedArtifacts: [],
          members: [
            {
              recordedArtifactID: yA.id,
              expectedLineageVersion: 0,
              startAfterOrdinal: 0,
              endAtOrdinal: 1,
              timeEffective: 15,
              expectedWinningAttribution: { type: "recorded" },
              boundary: {
                bindingID: yObservation.bindingID,
                sourceStateBasis: { type: "observation", observationID: yObservation.id },
                revisionID: yObservation.revisionID,
                revisionAttribution: { type: "recorded" },
                descriptor: {
                  observationID: yObservation.id,
                  mediaType: yObservation.effectiveMediaType!,
                },
                availability: "available",
              },
              outcome: { type: "new" },
              projectOutcome: true,
            },
          ],
        }),
      )
      expect(falseBoundary).toMatchObject({ _tag: "Artifact.ConflictError" })

      const historical = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [],
        members: [
          {
            recordedArtifactID: yA.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 0,
            endAtOrdinal: 1,
            timeEffective: 15,
            expectedWinningAttribution: { type: "recorded" },
            boundary: {
              bindingID: yObservation.bindingID,
              sourceStateBasis: { type: "observation", observationID: yObservation.id },
              revisionID: yObservation.revisionID,
              revisionAttribution: exact,
              descriptor: {
                observationID: yObservation.id,
                mediaType: yObservation.effectiveMediaType!,
              },
              availability: "available",
            },
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      expect(historical.newArtifact?.source.revisionAttribution).toEqual({
        type: "lineage_correction",
        memberID: historical.members[0]!.id,
      })

      const yBeforeCurrent = yield* artifacts.getArtifact(yA.id)
      const current = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(yBeforeCurrent)],
        members: [
          {
            recordedArtifactID: yA.id,
            expectedLineageVersion: 1,
            startAfterOrdinal: 1,
            endAtOrdinal: 2,
            timeEffective: 25,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(yBeforeCurrent),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      const fallback = yield* artifacts.getArtifact(yA.id)
      expect(fallback.source).toMatchObject({
        availability: "unbound",
        currentRevisionID: aRevisionID,
        revisionAttribution: exact,
      })
      expect(yield* artifacts.getRevision(yA.id, aRevisionID, exact)).toMatchObject({
        id: aRevisionID,
        effectiveArtifactID: yA.id,
        attribution: exact,
      })
      expect(current.newArtifact?.source.currentRevisionID).toBe(yB.artifact.source.currentRevisionID)
    }),
  )

  it.effect("propagates non-byte correction through a point split and keeps historical correction unbound", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const pointLocation = location("point-misattribution.pdf")
      const x = yield* artifacts.admit({
        location: pointLocation,
        observation: present("a", 10),
        authority: admission,
      })
      const point = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(x)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 0,
            endAtOrdinal: 1,
            timeEffective: 5,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(x),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      const y = point.newArtifact!
      expect((yield* artifacts.getArtifact(x.id)).correctionHidden).toBeTrue()
      expect((yield* artifacts.lookupActiveLocation(pointLocation))?.artifact.id).toBe(y.id)

      const observation = (yield* artifacts.listObservations(x.id)).items[0]!
      const corrected = yield* artifacts.correctObservation({
        observationID: observation.id,
        mediaType: "application/x-pdf",
        correctedTimeObserved: 11,
        authority: Artifact.ObservationCorrectionAuthority.learnerCorrection("learner", 1),
        expectedArtifacts: [Artifact.expectedSource(y)],
      })
      expect(corrected.affectedArtifacts).toMatchObject([
        { id: y.id, source: { descriptor: { mediaType: "application/x-pdf" } } },
      ])
      const successor = yield* artifacts.correctObservation({
        observationID: observation.id,
        expectedPredecessorCorrectionID: corrected.correction.id,
        mediaType: "application/final-pdf",
        authority: Artifact.ObservationCorrectionAuthority.trustedObserver("detector", 2),
        expectedArtifacts: [Artifact.expectedSource(corrected.affectedArtifacts[0]!)],
      })
      expect((yield* artifacts.listObservations(x.id)).items[0]).toMatchObject({
        recordedMediaType: "application/pdf",
        effectiveMediaType: "application/final-pdf",
        effectiveTimeObserved: 11,
        latestCorrectionID: successor.correction.id,
      })
      expect(yield* artifacts.getObservation(observation.id)).toMatchObject({
        id: observation.id,
        effectiveArtifactID: y.id,
        observer: { capabilityIdentity: "gate-10-observer", capabilityVersion: 1 },
        effectiveMediaType: "application/final-pdf",
      })
      expect((yield* artifacts.listObservationCorrections(x.id)).items.map((item) => item.id)).toEqual([
        corrected.correction.id,
        successor.correction.id,
      ])
      expect((yield* artifacts.listObservationCorrections(y.id)).items.map((item) => item.id)).toEqual([
        corrected.correction.id,
        successor.correction.id,
      ])
      const staleCorrection = yield* Effect.flip(
        artifacts.correctObservation({
          observationID: observation.id,
          expectedPredecessorCorrectionID: corrected.correction.id,
          mediaType: "text/plain",
          authority: Artifact.ObservationCorrectionAuthority.trustedObserver("detector", 2),
          expectedArtifacts: [Artifact.expectedSource(successor.affectedArtifacts[0]!)],
        }),
      )
      expect(staleCorrection).toMatchObject({
        _tag: "Artifact.ConflictError",
        entity: "observation_correction",
        currentCorrectionID: successor.correction.id,
      })

      const historicalLocation = location("historical-correction.pdf")
      const historical = yield* artifacts.admit({
        location: historicalLocation,
        observation: present("b", 20),
        authority: admission,
      })
      const middle = yield* artifacts.observe({
        expected: Artifact.expectedSource(historical),
        observation: present("c", 30),
      })
      const current = yield* artifacts.observe({
        expected: Artifact.expectedSource(middle.artifact),
        observation: present("d", 40),
      })
      const currentBefore = Artifact.expectedSource(current.artifact)
      const observations = (yield* artifacts.listObservations(historical.id)).items
      const middleObservation = observations[1]!
      const historicalSplit = yield* artifacts.correctLineage({
        admissionRootArtifactID: historical.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [],
        members: [
          {
            recordedArtifactID: historical.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 1,
            endAtOrdinal: 2,
            timeEffective: 25,
            expectedWinningAttribution: { type: "recorded" },
            boundary: {
              bindingID: middleObservation.bindingID,
              sourceStateBasis: { type: "observation", observationID: middleObservation.id },
              revisionID: middleObservation.revisionID,
              revisionAttribution: { type: "recorded" },
              descriptor: {
                observationID: middleObservation.id,
                mediaType: middleObservation.effectiveMediaType!,
              },
              availability: "available",
            },
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      expect(historicalSplit.newArtifact!.source).toMatchObject({
        availability: "unbound",
        activeBinding: undefined,
      })
      expect((yield* artifacts.lookupActiveLocation(historicalLocation))?.artifact.id).toBe(historical.id)
      const currentAfter = yield* artifacts.getArtifact(historical.id)
      expect({ ...Artifact.expectedSource(currentAfter), lineageVersion: currentBefore.lineageVersion }).toEqual(
        currentBefore,
      )
      expect((yield* artifacts.listObservations(historical.id)).items.map((item) => item.effectiveArtifactID)).toEqual([
        historical.id,
        historicalSplit.newArtifact!.id,
        historical.id,
      ])
    }),
  )

  it.effect("rejects stale, overlapping, unused-target, and out-of-ancestry lineage deltas atomically", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const x = yield* artifacts.admit({
        location: location("invalid-lineage-x.pdf"),
        observation: present("a", 10),
        authority: admission,
      })
      const xB = yield* artifacts.observe({ expected: Artifact.expectedSource(x), observation: present("b", 20) })
      const q = yield* artifacts.admit({
        location: location("invalid-lineage-q.pdf"),
        observation: present("c", 30),
        authority: admission,
      })
      const artifactsBefore = (yield* artifacts.listArtifacts()).items.length

      const overlap = yield* Effect.flip(
        artifacts.correctLineage({
          admissionRootArtifactID: x.id,
          createTarget: false,
          authority: lineage,
          expectedArtifacts: [],
          members: [
            {
              recordedArtifactID: x.id,
              expectedLineageVersion: 0,
              startAfterOrdinal: 0,
              endAtOrdinal: 2,
              timeEffective: 5,
              expectedWinningAttribution: { type: "recorded" },
              boundary: boundary(xB.artifact),
              outcome: { type: "recorded" },
            },
            {
              recordedArtifactID: x.id,
              expectedLineageVersion: 0,
              startAfterOrdinal: 1,
              endAtOrdinal: 2,
              timeEffective: 15,
              expectedWinningAttribution: { type: "recorded" },
              boundary: boundary(xB.artifact),
              outcome: { type: "recorded" },
            },
          ],
        }),
      )
      expect(overlap).toMatchObject({ _tag: "Artifact.InvalidTransitionError" })

      const unusedTarget = yield* Effect.flip(
        artifacts.correctLineage({
          admissionRootArtifactID: x.id,
          createTarget: true,
          authority: lineage,
          expectedArtifacts: [],
          members: [
            {
              recordedArtifactID: x.id,
              expectedLineageVersion: 0,
              startAfterOrdinal: 0,
              endAtOrdinal: 1,
              timeEffective: 5,
              expectedWinningAttribution: { type: "recorded" },
              boundary: boundary(x),
              outcome: { type: "recorded" },
            },
          ],
        }),
      )
      expect(unusedTarget).toMatchObject({ _tag: "Artifact.InvalidTransitionError" })

      const foreignTarget = yield* Effect.flip(
        artifacts.correctLineage({
          admissionRootArtifactID: x.id,
          createTarget: false,
          authority: lineage,
          expectedArtifacts: [Artifact.expectedSource(xB.artifact)],
          members: [
            {
              recordedArtifactID: x.id,
              expectedLineageVersion: 0,
              startAfterOrdinal: 0,
              endAtOrdinal: 2,
              timeEffective: 5,
              expectedWinningAttribution: { type: "recorded" },
              boundary: boundary(xB.artifact),
              outcome: { type: "artifact", artifactID: q.id },
              projectOutcome: true,
            },
          ],
        }),
      )
      expect(foreignTarget).toMatchObject({ _tag: "Artifact.InvalidTransitionError" })
      expect((yield* artifacts.listArtifacts()).items).toHaveLength(artifactsBefore)
      expect((yield* artifacts.getArtifact(x.id)).lineageVersion).toBe(0)
      expect((yield* artifacts.listLineageCorrections(x.id)).items).toEqual([])

      const valid = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(xB.artifact)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 1,
            endAtOrdinal: 2,
            timeEffective: 15,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(xB.artifact),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      const stale = yield* Effect.flip(
        artifacts.correctLineage({
          admissionRootArtifactID: x.id,
          createTarget: false,
          authority: lineage,
          expectedArtifacts: [],
          members: [
            {
              recordedArtifactID: x.id,
              expectedLineageVersion: 0,
              startAfterOrdinal: 1,
              endAtOrdinal: 2,
              timeEffective: 15,
              expectedWinningAttribution: { type: "lineage_correction", memberID: valid.members[0]!.id },
              boundary: valid.members[0]!.boundary,
              outcome: { type: "recorded" },
            },
          ],
        }),
      )
      expect(stale).toMatchObject({ _tag: "Artifact.ConflictError", entity: "lineage", id: x.id })
      expect((yield* artifacts.listLineageCorrections(x.id)).items).toHaveLength(1)
    }),
  )

  it.effect("compresses arbitrarily many rebind episodes into one correction interval", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const x = yield* artifacts.admit({
        location: location("many-rebinds-0.pdf"),
        observation: present("a", 10),
        authority: admission,
      })
      const first = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(x)],
        members: [
          {
            recordedArtifactID: x.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 0,
            endAtOrdinal: 1,
            timeEffective: 5,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(x),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      let rebound = first.newArtifact!
      for (const index of Array.from({ length: 12 }, (_, value) => value + 1)) {
        rebound = yield* artifacts.rebind({
          expected: Artifact.expectedSource(rebound),
          destination: location(`many-rebinds-${index}.pdf`),
          observation: present((index % 6).toString(16), 20 + index),
          authority: rebind,
        })
      }
      const second = yield* artifacts.correctLineage({
        admissionRootArtifactID: x.id,
        createTarget: true,
        authority: lineage,
        expectedArtifacts: [Artifact.expectedSource(rebound)],
        members: [
          {
            recordedArtifactID: first.newArtifact!.id,
            expectedLineageVersion: 0,
            startAfterOrdinal: 0,
            endAtOrdinal: 12,
            timeEffective: 19,
            expectedWinningAttribution: { type: "recorded" },
            boundary: boundary(rebound),
            outcome: { type: "new" },
            projectOutcome: true,
          },
        ],
      })
      expect(second.members).toHaveLength(1)
      expect(second.members[0]).toMatchObject({ startAfterOrdinal: 0, endAtOrdinal: 12 })
      expect((yield* artifacts.getArtifact(x.id)).correctionHidden).toBeTrue()
      expect((yield* artifacts.listBindings(first.newArtifact!.id)).items).toHaveLength(13)
      expect((yield* artifacts.lookupActiveLocation(location("many-rebinds-12.pdf")))?.artifact.id).toBe(
        second.newArtifact!.id,
      )
    }),
  )

  it.effect("pages every public collection with endpoint-scoped cursors", () =>
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const first = yield* artifacts.admit({
        location: location("page-1.pdf"),
        observation: present("a", 10),
        authority: admission,
      })
      const second = yield* artifacts.admit({
        location: location("page-2.pdf"),
        observation: present("b", 20),
        authority: admission,
      })
      yield* artifacts.admit({
        location: location("page-3.pdf"),
        observation: present("c", 30),
        authority: admission,
      })
      const rebound = yield* artifacts.rebind({
        expected: Artifact.expectedSource(first),
        destination: location("page-1-rebound.pdf"),
        observation: present("d", 40),
        authority: rebind,
      })
      const latest = yield* artifacts.observe({
        expected: Artifact.expectedSource(rebound),
        observation: present("e", 50),
      })

      const artifactPage1 = yield* artifacts.listArtifacts({ limit: 1 })
      const artifactPage2 = yield* artifacts.listArtifacts({ limit: 1, cursor: artifactPage1.cursor })
      const artifactPage3 = yield* artifacts.listArtifacts({ limit: 1, cursor: artifactPage2.cursor })
      expect(
        new Set([...artifactPage1.items, ...artifactPage2.items, ...artifactPage3.items].map((item) => item.id)),
      ).toEqual(new Set([first.id, second.id, artifactPage3.items[0]!.id]))
      const wrongFilter = yield* Effect.flip(
        artifacts.listArtifacts({ limit: 1, includeWithdrawn: true, cursor: artifactPage1.cursor }),
      )
      expect(wrongFilter).toMatchObject({ _tag: "Artifact.InvalidCursorError" })

      const bindingPage = yield* artifacts.listBindings(first.id, { limit: 1 })
      expect(bindingPage.cursor).toBeDefined()
      expect((yield* artifacts.listBindings(first.id, { limit: 1, cursor: bindingPage.cursor })).items).toHaveLength(1)
      const wrongEndpoint = yield* Effect.flip(artifacts.listArtifacts({ limit: 1, cursor: bindingPage.cursor }))
      expect(wrongEndpoint).toMatchObject({ _tag: "Artifact.InvalidCursorError" })

      const revisionPage = yield* artifacts.listRevisions(first.id, { limit: 1, view: "recorded" })
      expect(revisionPage.cursor).toBeDefined()
      const revisionPage2 = yield* artifacts.listRevisions(first.id, {
        limit: 1,
        view: "recorded",
        cursor: revisionPage.cursor,
      })
      const revisionPage3 = yield* artifacts.listRevisions(first.id, {
        limit: 1,
        view: "recorded",
        cursor: revisionPage2.cursor,
      })
      expect(
        new Set([...revisionPage.items, ...revisionPage2.items, ...revisionPage3.items].map((item) => item.id)),
      ).toEqual(new Set((yield* artifacts.listRevisions(first.id, { view: "recorded" })).items.map((item) => item.id)))
      const wrongView = yield* Effect.flip(
        artifacts.listRevisions(first.id, { limit: 1, view: "effective", cursor: revisionPage.cursor }),
      )
      expect(wrongView).toMatchObject({ _tag: "Artifact.InvalidCursorError" })
      const wrongOwner = yield* Effect.flip(
        artifacts.listRevisions(second.id, { limit: 1, view: "recorded", cursor: revisionPage.cursor }),
      )
      expect(wrongOwner).toMatchObject({ _tag: "Artifact.InvalidCursorError" })

      const observations = (yield* artifacts.listObservations(first.id)).items
      const observationPage1 = yield* artifacts.listObservations(first.id, { limit: 1 })
      const observationPage2 = yield* artifacts.listObservations(first.id, {
        limit: 1,
        cursor: observationPage1.cursor,
      })
      const observationPage3 = yield* artifacts.listObservations(first.id, {
        limit: 1,
        cursor: observationPage2.cursor,
      })
      expect(
        new Set(
          [...observationPage1.items, ...observationPage2.items, ...observationPage3.items].map((item) => item.id),
        ),
      ).toEqual(new Set(observations.map((item) => item.id)))

      yield* artifacts.correctObservation({
        observationID: observations[0]!.id,
        mediaType: "application/x-first",
        authority: Artifact.ObservationCorrectionAuthority.trustedObserver("detector", 1),
        expectedArtifacts: [],
      })
      const currentCorrection = yield* artifacts.correctObservation({
        observationID: observations[2]!.id,
        mediaType: "application/x-current",
        authority: Artifact.ObservationCorrectionAuthority.trustedObserver("detector", 1),
        expectedArtifacts: [Artifact.expectedSource(latest.artifact)],
      })
      const correctionPage1 = yield* artifacts.listObservationCorrections(first.id, { limit: 1 })
      const correctionPage2 = yield* artifacts.listObservationCorrections(first.id, {
        limit: 1,
        cursor: correctionPage1.cursor,
      })
      expect([...correctionPage1.items, ...correctionPage2.items].map((item) => item.id)).toEqual([
        (yield* artifacts.listObservationCorrections(first.id)).items[0]!.id,
        currentCorrection.correction.id,
      ])

      const tooLarge = yield* Effect.flip(artifacts.listArtifacts({ limit: 101 }))
      expect(tooLarge).toMatchObject({ _tag: "Artifact.InvalidCursorError" })
      yield* artifacts.withdraw({ artifactID: second.id, expectedDispositionVersion: 0 })
      expect((yield* artifacts.listArtifacts()).items.map((item) => item.id)).not.toContain(second.id)
      expect((yield* artifacts.listArtifacts({ includeWithdrawn: true })).items.map((item) => item.id)).toContain(
        second.id,
      )
    }),
  )
})

test("Artifact authority survives database reopen with exact correction bases", async () => {
  await using tmp = await tmpdir()
  const filename = path.join(tmp.path, "artifact-reopen.sqlite")
  const firstLayer = LayerNode.compile(Artifact.node, [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
  ])
  const written = await Effect.runPromise(
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      const admitted = yield* artifacts.admit({
        location: location("persistent.pdf"),
        observation: present("f", 10),
        authority: admission,
      })
      const missingState = yield* artifacts.observe({
        expected: Artifact.expectedSource(admitted),
        observation: missing(20),
      })
      return {
        artifactID: admitted.id,
        expected: Artifact.expectedSource(missingState.artifact),
        observations: (yield* artifacts.listObservations(admitted.id)).items.map((item) => item.id),
      }
    }).pipe(Effect.provide(firstLayer), Effect.scoped),
  )

  const secondLayer = LayerNode.compile(Artifact.node, [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
  ])
  await Effect.runPromise(
    Effect.gen(function* () {
      const artifacts = yield* Artifact.Service
      expect(Artifact.expectedSource(yield* artifacts.getArtifact(written.artifactID))).toEqual(written.expected)
      expect((yield* artifacts.listObservations(written.artifactID)).items.map((item) => item.id)).toEqual(
        written.observations,
      )
    }).pipe(Effect.provide(secondLayer), Effect.scoped),
  )
})
