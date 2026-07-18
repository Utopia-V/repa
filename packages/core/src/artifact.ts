export * as Artifact from "./artifact"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { and, asc, desc, eq, gt, inArray, isNull, max, or, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { isAbsolute, posix, win32 } from "path"
import { ArtifactCursor } from "./artifact/cursor"
import {
  Admission,
  ArtifactID,
  BindingID,
  CanonicalLocation,
  ConflictError,
  InactiveError,
  InvalidCursorError,
  InvalidTransitionError,
  LineageCorrectionAuthority,
  LineageCorrectionMemberID,
  LineageCorrectionSetID,
  LocationConflictError,
  NotFoundError,
  ObservationCorrectionAuthority,
  ObservationCorrectionID,
  ObservationID,
  Observer,
  Rebind,
  RevisionID,
  createArtifactID,
  createBindingID,
  createLineageCorrectionMemberID,
  createLineageCorrectionSetID,
  createObservationCorrectionID,
  createObservationID,
  createRevisionID,
  type ArtifactPageOptions,
  type AttributionView,
  type Availability,
  type CreationBasis,
  type Error,
  type Page,
  type PageOptions,
  type RevisionPageOptions,
} from "./artifact/schema"
import {
  ArtifactCurrentSourceTable,
  ArtifactLineageCorrectionMemberTable,
  ArtifactLineageCorrectionSetTable,
  ArtifactObservationCorrectionTable,
  ArtifactRevisionTable,
  ArtifactSourceBindingTable,
  ArtifactSourceObservationTable,
  ArtifactTable,
} from "./artifact/sql"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"

export {
  Admission,
  ArtifactID,
  BindingID,
  CanonicalLocation,
  ConflictError,
  InactiveError,
  InvalidCursorError,
  InvalidTransitionError,
  LineageCorrectionAuthority,
  LineageCorrectionMemberID,
  LineageCorrectionSetID,
  LocationConflictError,
  NotFoundError,
  ObservationCorrectionAuthority,
  ObservationCorrectionID,
  ObservationID,
  Observer,
  Rebind,
  RevisionID,
} from "./artifact/schema"
export type {
  ArtifactPageOptions,
  AttributionView,
  Availability,
  CreationBasis,
  Error,
  Page,
  PageOptions,
  RevisionPageOptions,
} from "./artifact/schema"

type DatabaseShape = EffectDrizzleSqlite.EffectSQLiteDatabase
export type Transaction = Parameters<Parameters<DatabaseShape["transaction"]>[0]>[0]
type Queryable = DatabaseShape | Transaction

type ArtifactRow = typeof ArtifactTable.$inferSelect
type CurrentSourceRow = typeof ArtifactCurrentSourceTable.$inferSelect
type RevisionRow = typeof ArtifactRevisionTable.$inferSelect
type BindingRow = typeof ArtifactSourceBindingTable.$inferSelect
type ObservationRow = typeof ArtifactSourceObservationTable.$inferSelect
type ObservationCorrectionRow = typeof ArtifactObservationCorrectionTable.$inferSelect
type LineageMemberRow = typeof ArtifactLineageCorrectionMemberTable.$inferSelect

export type Fingerprint = {
  readonly algorithm: "sha256"
  readonly digest: string
  readonly byteLength: number
}

export type PresentObservation = {
  readonly result: "present"
  readonly fingerprint: Fingerprint
  readonly mediaType: string
  readonly observer: Observer
  readonly timeObserved: number
}

export type MissingObservation = {
  readonly result: "missing"
  readonly observer: Observer
  readonly timeObserved: number
}

export type SourceObservation = PresentObservation | MissingObservation

export type AttributionBasis =
  | { readonly type: "recorded" }
  | { readonly type: "lineage_correction"; readonly memberID: LineageCorrectionMemberID }

export type SourceStateBasis =
  | { readonly type: "observation"; readonly observationID: ObservationID }
  | { readonly type: "lineage_correction"; readonly memberID: LineageCorrectionMemberID }

export type Descriptor = {
  readonly observationID: ObservationID
  readonly correctionID?: ObservationCorrectionID
  readonly mediaType: string
}

export type CurrentSource = {
  readonly sourceVersion: number
  readonly activeBinding?: {
    readonly id: BindingID
    readonly ordinal: number
    readonly location: string
  }
  readonly currentRevisionID?: RevisionID
  readonly revisionAttribution?: AttributionBasis
  readonly sourceStateBasis?: SourceStateBasis
  readonly descriptor?: Descriptor
  readonly availability: Availability
  readonly timeUpdated: number
}

export type ArtifactInfo = {
  readonly id: ArtifactID
  readonly admissionRootArtifactID: ArtifactID
  readonly creationBasis: CreationBasis
  readonly creationCorrectionSetID?: LineageCorrectionSetID
  readonly creationCapability?: {
    readonly identity: string
    readonly version: number
  }
  readonly dispositionVersion: number
  readonly lineageVersion: number
  readonly withdrawalReason?: "removed"
  readonly correctionHidden: boolean
  readonly timeCreated: number
  readonly timeUpdated: number
  readonly source: CurrentSource
}

export type ExpectedSource = {
  readonly artifactID: ArtifactID
  readonly dispositionVersion: number
  readonly lineageVersion: number
  readonly sourceVersion: number
  readonly activeBindingID?: BindingID
  readonly activeLocation?: string
  readonly currentRevisionID?: RevisionID
  readonly revisionAttribution?: AttributionBasis
  readonly sourceStateBasis?: SourceStateBasis
  readonly descriptorObservationID?: ObservationID
  readonly descriptorCorrectionID?: ObservationCorrectionID
  readonly mediaType?: string
  readonly availability: Availability
}

export type OrdinaryUseSnapshot = {
  readonly effectiveArtifactID: ArtifactID
  readonly dispositionVersion: number
  readonly currentRevisionID: RevisionID
  readonly attribution: AttributionBasis
  readonly lineageVersion: number
}

export type OrdinaryUseRevisionSnapshot = OrdinaryUseSnapshot & {
  readonly fingerprint: Fingerprint
  readonly mediaType: string
}

export type RevisionInfo = {
  readonly id: RevisionID
  readonly recordedArtifactID: ArtifactID
  readonly effectiveArtifactID: ArtifactID
  readonly fingerprint: Fingerprint
  readonly attribution: AttributionBasis
  readonly timeFirstObserved: number
}

export type BindingInfo = {
  readonly id: BindingID
  readonly artifactID: ArtifactID
  readonly ordinal: number
  readonly location: string
  readonly basis:
    | {
        readonly type: "admission" | "explicit_rebind"
        readonly capabilityIdentity: string
        readonly capabilityVersion: number
      }
    | { readonly type: "lineage_correction"; readonly memberID: LineageCorrectionMemberID }
  readonly timeStarted: number
  readonly timeEnded?: number
  readonly endReason?: "explicit_rebind" | "lineage_correction"
}

export type ObservationInfo = {
  readonly id: ObservationID
  readonly recordedArtifactID: ArtifactID
  readonly bindingID: BindingID
  readonly ordinal: number
  readonly result: "present" | "missing"
  readonly revisionID?: RevisionID
  readonly recordedRevisionAttribution?: AttributionBasis
  readonly effectiveArtifactID: ArtifactID
  readonly effectiveAttribution: AttributionBasis
  readonly recordedMediaType?: string
  readonly effectiveMediaType?: string
  readonly effectiveTimeObserved: number
  readonly latestCorrectionID?: ObservationCorrectionID
  readonly observer: { readonly capabilityIdentity: string; readonly capabilityVersion: number }
  readonly timeObserved: number
  readonly timeCommitted: number
}

export type ObservationCorrectionInfo = {
  readonly id: ObservationCorrectionID
  readonly observationID: ObservationID
  readonly sequence: number
  readonly predecessorCorrectionID?: ObservationCorrectionID
  readonly mediaType: string
  readonly correctedTimeObserved?: number
  readonly basis: "learner_correction" | "trusted_observer"
  readonly capabilityIdentity: string
  readonly capabilityVersion: number
  readonly timeCommitted: number
}

export type LineageBoundary = {
  readonly bindingID?: BindingID
  readonly sourceStateBasis?: SourceStateBasis
  readonly revisionID?: RevisionID
  readonly revisionAttribution?: AttributionBasis
  readonly descriptor?: Descriptor
  readonly availability: Availability
}

export type LineageOutcome =
  | { readonly type: "recorded" }
  | { readonly type: "artifact"; readonly artifactID: ArtifactID }
  | { readonly type: "new" }

export type LineageMemberProposal = {
  readonly recordedArtifactID: ArtifactID
  readonly expectedLineageVersion: number
  readonly startAfterOrdinal: number
  readonly endAtOrdinal: number
  readonly timeEffective: number
  readonly expectedWinningAttribution: AttributionBasis
  readonly boundary: LineageBoundary
  readonly outcome: LineageOutcome
  readonly projectOutcome?: boolean
}

export type LineageCorrectionMemberInfo = {
  readonly id: LineageCorrectionMemberID
  readonly setID: LineageCorrectionSetID
  readonly admissionRootArtifactID: ArtifactID
  readonly recordedArtifactID: ArtifactID
  readonly lineageVersion: number
  readonly startAfterOrdinal: number
  readonly endAtOrdinal: number
  readonly timeEffective: number
  readonly expectedWinningAttribution: AttributionBasis
  readonly boundary: LineageBoundary
  readonly outcome: { readonly type: "recorded" } | { readonly type: "artifact"; readonly artifactID: ArtifactID }
  readonly basis: "learner_statement" | "trusted_non_model_discontinuity"
  readonly capabilityIdentity: string
  readonly capabilityVersion: number
  readonly newArtifactID?: ArtifactID
  readonly timeCommitted: number
}

export type LineageCorrectionResult = {
  readonly setID: LineageCorrectionSetID
  readonly newArtifact?: ArtifactInfo
  readonly affectedArtifacts: ArtifactInfo[]
  readonly members: LineageCorrectionMemberInfo[]
}

export type ObservationTransition = {
  readonly changed: boolean
  readonly observationID?: ObservationID
  readonly artifact: ArtifactInfo
}

export type ActiveLocationOwner = {
  readonly artifact: ArtifactInfo
  readonly binding: BindingInfo
}

export interface Interface {
  readonly admit: (input: {
    readonly location: CanonicalLocation
    readonly observation: PresentObservation
    readonly authority: Admission
  }) => Effect.Effect<ArtifactInfo, Error>
  readonly observe: (input: {
    readonly expected: ExpectedSource
    readonly observation: SourceObservation
  }) => Effect.Effect<ObservationTransition, Error>
  readonly correctObservation: (input: {
    readonly observationID: ObservationID
    readonly expectedPredecessorCorrectionID?: ObservationCorrectionID
    readonly mediaType: string
    readonly correctedTimeObserved?: number
    readonly authority: ObservationCorrectionAuthority
    readonly expectedArtifacts: readonly ExpectedSource[]
  }) => Effect.Effect<
    {
      readonly correction: ObservationCorrectionInfo
      readonly affectedArtifacts: ArtifactInfo[]
    },
    Error
  >
  readonly rebind: (input: {
    readonly expected: ExpectedSource
    readonly destination: CanonicalLocation
    readonly observation: PresentObservation
    readonly authority: Rebind
  }) => Effect.Effect<ArtifactInfo, Error>
  readonly correctLineage: (input: {
    readonly admissionRootArtifactID: ArtifactID
    readonly createTarget: boolean
    readonly authority: LineageCorrectionAuthority
    readonly members: readonly LineageMemberProposal[]
    readonly expectedArtifacts: readonly ExpectedSource[]
  }) => Effect.Effect<LineageCorrectionResult, Error>
  readonly withdraw: (input: {
    readonly artifactID: ArtifactID
    readonly expectedDispositionVersion: number
  }) => Effect.Effect<ArtifactInfo, Error>
  readonly restore: (input: {
    readonly artifactID: ArtifactID
    readonly expectedDispositionVersion: number
  }) => Effect.Effect<ArtifactInfo, Error>
  readonly listArtifacts: (options?: ArtifactPageOptions) => Effect.Effect<Page<ArtifactInfo>, Error>
  readonly getArtifact: (artifactID: ArtifactID) => Effect.Effect<ArtifactInfo, Error>
  readonly lookupActiveLocation: (location: CanonicalLocation) => Effect.Effect<ActiveLocationOwner | undefined, Error>
  readonly listRevisions: (
    artifactID: ArtifactID,
    options?: RevisionPageOptions,
  ) => Effect.Effect<Page<RevisionInfo>, Error>
  readonly getRevision: (
    artifactID: ArtifactID,
    revisionID: RevisionID,
    attribution: AttributionBasis,
  ) => Effect.Effect<RevisionInfo, Error>
  readonly listBindings: (artifactID: ArtifactID, options?: PageOptions) => Effect.Effect<Page<BindingInfo>, Error>
  readonly listObservations: (
    artifactID: ArtifactID,
    options?: PageOptions,
  ) => Effect.Effect<Page<ObservationInfo>, Error>
  readonly getObservation: (observationID: ObservationID) => Effect.Effect<ObservationInfo, Error>
  readonly listObservationCorrections: (
    artifactID: ArtifactID,
    options?: PageOptions,
  ) => Effect.Effect<Page<ObservationCorrectionInfo>, Error>
  readonly listLineageCorrections: (
    artifactID: ArtifactID,
    options?: PageOptions,
  ) => Effect.Effect<Page<LineageCorrectionMemberInfo>, Error>
}

export class Service extends Context.Service<Service, Interface>()("@repa/Artifact") {}

export function expectedSource(info: ArtifactInfo): ExpectedSource {
  return {
    artifactID: info.id,
    dispositionVersion: info.dispositionVersion,
    lineageVersion: info.lineageVersion,
    sourceVersion: info.source.sourceVersion,
    activeBindingID: info.source.activeBinding?.id,
    activeLocation: info.source.activeBinding?.location,
    currentRevisionID: info.source.currentRevisionID,
    revisionAttribution: info.source.revisionAttribution,
    sourceStateBasis: info.source.sourceStateBasis,
    descriptorObservationID: info.source.descriptor?.observationID,
    descriptorCorrectionID: info.source.descriptor?.correctionID,
    mediaType: info.source.descriptor?.mediaType,
    availability: info.source.availability,
  }
}

export function readOrdinaryUseSnapshot(tx: Transaction, artifactID: ArtifactID) {
  return Effect.gen(function* () {
    return yield* makeOrdinaryUseSnapshot(yield* getArtifactInfo(tx, artifactID))
  })
}

export function requireOrdinaryUseSnapshot(tx: Transaction, expected: OrdinaryUseSnapshot) {
  return Effect.gen(function* () {
    const current = yield* getArtifactInfo(tx, expected.effectiveArtifactID)
    const actual = yield* makeOrdinaryUseSnapshot(current)
    if (!equalOrdinaryUseSnapshot(expected, actual)) return yield* sourceConflict(current)
    return actual
  })
}

export function readOrdinaryUseRevisionSnapshot(tx: Transaction, artifactID: ArtifactID) {
  return Effect.gen(function* () {
    const current = yield* getArtifactInfo(tx, artifactID)
    return yield* makeOrdinaryUseRevisionSnapshot(tx, current)
  })
}

export function requireOrdinaryUseRevisionSnapshot(tx: Transaction, expected: OrdinaryUseRevisionSnapshot) {
  return Effect.gen(function* () {
    const current = yield* getArtifactInfo(tx, expected.effectiveArtifactID)
    const actual = yield* makeOrdinaryUseRevisionSnapshot(tx, current)
    if (!equalOrdinaryUseRevisionSnapshot(expected, actual)) return yield* sourceConflict(current)
    return actual
  })
}

function snapshot<A, E, R>(database: DatabaseShape, read: (tx: Transaction) => Effect.Effect<A, E, R>) {
  return database.transaction(read).pipe(Effect.catchTag("SqlError", Effect.die))
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db

    const admit: Interface["admit"] = Effect.fn("Artifact.admit")(function* (input) {
      const location = yield* requireLocation(input.location)
      const observation = yield* requirePresentObservation(input.observation)
      const authority = yield* requireAdmission(input.authority)
      const artifactID = createArtifactID()
      const revisionID = createRevisionID()
      const bindingID = createBindingID()
      const observationID = createObservationID()
      const time = Date.now()

      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireLocationAvailable(tx, location)
            yield* tx
              .insert(ArtifactTable)
              .values({
                id: artifactID,
                admission_root_artifact_id: artifactID,
                creation_basis: authority.basis,
                creation_capability_identity: authority.capabilityIdentity,
                creation_capability_version: authority.capabilityVersion,
                disposition_version: 0,
                lineage_version: 0,
                correction_hidden: false,
                time_created: time,
                time_updated: time,
              })
              .run()
              .pipe(Effect.orDie)
            yield* tx
              .insert(ArtifactRevisionTable)
              .values({
                id: revisionID,
                recorded_artifact_id: artifactID,
                fingerprint_algorithm: observation.fingerprint.algorithm,
                fingerprint_digest: observation.fingerprint.digest,
                byte_length: observation.fingerprint.byteLength,
                time_first_observed: observation.timeObserved,
              })
              .run()
              .pipe(Effect.orDie)
            yield* tx
              .insert(ArtifactSourceBindingTable)
              .values({
                id: bindingID,
                recorded_artifact_id: artifactID,
                binding_ordinal: 1,
                canonical_location: location,
                basis_kind: "admission",
                basis_capability_identity: authority.capabilityIdentity,
                basis_capability_version: authority.capabilityVersion,
                time_started: time,
              })
              .run()
              .pipe(Effect.orDie)
            yield* tx
              .insert(ArtifactSourceObservationTable)
              .values({
                id: observationID,
                recorded_artifact_id: artifactID,
                binding_id: bindingID,
                occurrence_ordinal: 1,
                result: "present",
                revision_id: revisionID,
                media_type: observation.mediaType,
                observer_capability_identity: observation.observer.capabilityIdentity,
                observer_capability_version: observation.observer.capabilityVersion,
                time_observed: observation.timeObserved,
                time_committed: time,
              })
              .run()
              .pipe(Effect.orDie)
            yield* tx
              .insert(ArtifactCurrentSourceTable)
              .values({
                artifact_id: artifactID,
                source_version: 0,
                active_binding_id: bindingID,
                current_revision_id: revisionID,
                source_state_observation_id: observationID,
                descriptor_observation_id: observationID,
                effective_media_type: observation.mediaType,
                availability: "available",
                time_updated: time,
              })
              .run()
              .pipe(Effect.orDie)
            return yield* getArtifactInfo(tx, artifactID)
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const observe: Interface["observe"] = Effect.fn("Artifact.observe")(function* (input) {
      const observation = yield* requireObservation(input.observation)
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const current = yield* requireExpectedSource(tx, input.expected, true)
            const binding = current.source.activeBinding
            if (!binding) return yield* new InvalidTransitionError({ detail: "An active binding is required" })

            if (observation.result === "missing") {
              if (current.source.availability === "missing") return { changed: false, artifact: current }
              const observationID = createObservationID()
              const time = Date.now()
              yield* tx
                .insert(ArtifactSourceObservationTable)
                .values({
                  id: observationID,
                  recorded_artifact_id: current.id,
                  binding_id: binding.id,
                  occurrence_ordinal: yield* nextObservationOrdinal(tx, current.id),
                  result: "missing",
                  observer_capability_identity: observation.observer.capabilityIdentity,
                  observer_capability_version: observation.observer.capabilityVersion,
                  time_observed: observation.timeObserved,
                  time_committed: time,
                })
                .run()
                .pipe(Effect.orDie)
              yield* updateCurrentSource(tx, current, {
                source_state_observation_id: observationID,
                source_state_member_id: null,
                availability: "missing",
                time_updated: time,
              })
              return {
                changed: true,
                observationID,
                artifact: yield* getArtifactInfo(tx, current.id),
              }
            }

            const currentRevision = current.source.currentRevisionID
              ? yield* requireRevisionRow(tx, current.source.currentRevisionID)
              : undefined
            const same = currentRevision ? sameFingerprint(currentRevision, observation.fingerprint) : false
            if (same && current.source.availability === "available") {
              if (current.source.descriptor?.mediaType !== observation.mediaType) {
                return yield* new InvalidTransitionError({
                  detail: "A changed media determination requires an Observation correction",
                })
              }
              return { changed: false, artifact: current }
            }

            const resolved = yield* resolveRevision(tx, current.id, observation)
            const observationID = createObservationID()
            const time = Date.now()
            yield* tx
              .insert(ArtifactSourceObservationTable)
              .values({
                id: observationID,
                recorded_artifact_id: current.id,
                binding_id: binding.id,
                occurrence_ordinal: yield* nextObservationOrdinal(tx, current.id),
                result: "present",
                revision_id: resolved.revision.id,
                revision_attribution_member_id:
                  resolved.attribution.type === "lineage_correction" ? resolved.attribution.memberID : undefined,
                media_type: observation.mediaType,
                observer_capability_identity: observation.observer.capabilityIdentity,
                observer_capability_version: observation.observer.capabilityVersion,
                time_observed: observation.timeObserved,
                time_committed: time,
              })
              .run()
              .pipe(Effect.orDie)
            yield* updateCurrentSource(tx, current, {
              current_revision_id: resolved.revision.id,
              revision_attribution_member_id:
                resolved.attribution.type === "lineage_correction" ? resolved.attribution.memberID : null,
              source_state_observation_id: observationID,
              source_state_member_id: null,
              descriptor_observation_id: observationID,
              descriptor_correction_id: null,
              effective_media_type: observation.mediaType,
              availability: "available",
              time_updated: time,
            })
            return {
              changed: true,
              observationID,
              artifact: yield* getArtifactInfo(tx, current.id),
            }
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const rebind: Interface["rebind"] = Effect.fn("Artifact.rebind")(function* (input) {
      const destination = yield* requireLocation(input.destination)
      const observation = yield* requirePresentObservation(input.observation)
      const authority = yield* requireRebind(input.authority)
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const current = yield* requireExpectedSource(tx, input.expected, true)
            const binding = current.source.activeBinding
            if (!binding) return yield* new InvalidTransitionError({ detail: "An active binding is required" })
            if (binding.location === destination) {
              return yield* new InvalidTransitionError({
                detail: "Rebind destination must differ from the active location",
              })
            }
            yield* requireLocationAvailable(tx, destination)
            const resolved = yield* resolveRevision(tx, current.id, observation)
            const bindingID = createBindingID()
            const observationID = createObservationID()
            const time = Date.now()
            const closed = yield* tx
              .update(ArtifactSourceBindingTable)
              .set({ time_ended: time, end_reason: "explicit_rebind" })
              .where(
                and(
                  eq(ArtifactSourceBindingTable.id, binding.id),
                  eq(ArtifactSourceBindingTable.recorded_artifact_id, current.id),
                  isNull(ArtifactSourceBindingTable.time_ended),
                ),
              )
              .returning({ id: ArtifactSourceBindingTable.id })
              .get()
              .pipe(Effect.orDie)
            if (!closed) return yield* sourceConflict(current)
            yield* tx
              .insert(ArtifactSourceBindingTable)
              .values({
                id: bindingID,
                recorded_artifact_id: current.id,
                binding_ordinal: yield* nextBindingOrdinal(tx, current.id),
                canonical_location: destination,
                basis_kind: "explicit_rebind",
                basis_capability_identity: authority.capabilityIdentity,
                basis_capability_version: authority.capabilityVersion,
                time_started: time,
              })
              .run()
              .pipe(Effect.orDie)
            yield* tx
              .insert(ArtifactSourceObservationTable)
              .values({
                id: observationID,
                recorded_artifact_id: current.id,
                binding_id: bindingID,
                occurrence_ordinal: yield* nextObservationOrdinal(tx, current.id),
                result: "present",
                revision_id: resolved.revision.id,
                revision_attribution_member_id:
                  resolved.attribution.type === "lineage_correction" ? resolved.attribution.memberID : undefined,
                media_type: observation.mediaType,
                observer_capability_identity: observation.observer.capabilityIdentity,
                observer_capability_version: observation.observer.capabilityVersion,
                time_observed: observation.timeObserved,
                time_committed: time,
              })
              .run()
              .pipe(Effect.orDie)
            yield* updateCurrentSource(tx, current, {
              active_binding_id: bindingID,
              current_revision_id: resolved.revision.id,
              revision_attribution_member_id:
                resolved.attribution.type === "lineage_correction" ? resolved.attribution.memberID : null,
              source_state_observation_id: observationID,
              source_state_member_id: null,
              descriptor_observation_id: observationID,
              descriptor_correction_id: null,
              effective_media_type: observation.mediaType,
              availability: "available",
              time_updated: time,
            })
            return yield* getArtifactInfo(tx, current.id)
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const correctObservation: Interface["correctObservation"] = Effect.fn("Artifact.correctObservation")(
      function* (input) {
        const mediaType = yield* requireMediaType(input.mediaType)
        const correctedTimeObserved = yield* optionalTime(input.correctedTimeObserved)
        const authority = yield* requireObservationCorrectionAuthority(input.authority)
        return yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              const observation = yield* requireObservationRow(tx, input.observationID)
              if (observation.result !== "present") {
                return yield* new InvalidTransitionError({ detail: "Only a present Observation can be corrected" })
              }
              const latest = yield* latestObservationCorrection(tx, observation.id)
              if ((latest?.id ?? undefined) !== input.expectedPredecessorCorrectionID) {
                return yield* correctionConflict(observation.id, latest)
              }
              const currentMediaType = latest?.media_type ?? observation.media_type!
              const currentTimeObserved = latest?.corrected_time_observed ?? observation.time_observed
              const nextTimeObserved = correctedTimeObserved ?? currentTimeObserved
              if (currentMediaType === mediaType && nextTimeObserved === currentTimeObserved) {
                return yield* new InvalidTransitionError({ detail: "Observation correction must supersede a value" })
              }

              const affectedRows = yield* tx
                .select({ artifactID: ArtifactCurrentSourceTable.artifact_id })
                .from(ArtifactCurrentSourceTable)
                .where(eq(ArtifactCurrentSourceTable.descriptor_observation_id, observation.id))
                .orderBy(asc(ArtifactCurrentSourceTable.artifact_id))
                .all()
                .pipe(Effect.orDie)
              const affected = yield* Effect.forEach(affectedRows, (row) => getArtifactInfo(tx, row.artifactID))
              yield* requireExpectedSet(input.expectedArtifacts, affected)

              const correctionID = createObservationCorrectionID()
              const time = Date.now()
              yield* tx
                .insert(ArtifactObservationCorrectionTable)
                .values({
                  id: correctionID,
                  observation_id: observation.id,
                  correction_sequence: (latest?.correction_sequence ?? 0) + 1,
                  predecessor_correction_id: latest?.id,
                  media_type: mediaType,
                  corrected_time_observed:
                    nextTimeObserved === observation.time_observed ? undefined : nextTimeObserved,
                  basis: authority.basis,
                  capability_identity: authority.capabilityIdentity,
                  capability_version: authority.capabilityVersion,
                  time_committed: time,
                })
                .run()
                .pipe(Effect.orDie)
              yield* Effect.forEach(
                affected,
                (artifact) =>
                  updateCurrentSource(tx, artifact, {
                    descriptor_correction_id: correctionID,
                    effective_media_type: mediaType,
                    time_updated: time,
                  }),
                { discard: true },
              )
              const correction = yield* requireObservationCorrectionRow(tx, correctionID)
              return {
                correction: observationCorrectionInfo(correction),
                affectedArtifacts: yield* Effect.forEach(affected, (artifact) => getArtifactInfo(tx, artifact.id)),
              }
            }),
          )
          .pipe(Effect.catchTag("SqlError", Effect.die))
      },
    )

    const correctLineage: Interface["correctLineage"] = Effect.fn("Artifact.correctLineage")(function* (input) {
      const authority = yield* requireLineageCorrectionAuthority(input.authority)
      if (input.members.length === 0) {
        return yield* new InvalidTransitionError({ detail: "Lineage correction requires at least one member" })
      }
      const setID = createLineageCorrectionSetID()
      const newArtifactID = input.createTarget ? createArtifactID() : undefined
      const memberIDs = input.members.map(() => createLineageCorrectionMemberID())
      return yield* db
        .transaction((tx) =>
          applyLineageCorrection(tx, {
            ...input,
            authority,
            setID,
            newArtifactID,
            memberIDs,
            timeCommitted: Date.now(),
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const withdraw: Interface["withdraw"] = Effect.fn("Artifact.withdraw")(function* (input) {
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const artifact = yield* requireArtifactRow(tx, input.artifactID)
            if (artifact.disposition_version !== input.expectedDispositionVersion) {
              return yield* artifactConflict(artifact)
            }
            if (artifact.withdrawal_reason) {
              return yield* new InvalidTransitionError({ detail: "Artifact is already withdrawn" })
            }
            const time = Date.now()
            const updated = yield* tx
              .update(ArtifactTable)
              .set({
                withdrawal_reason: "removed",
                disposition_version: sql`${ArtifactTable.disposition_version} + 1`,
                time_updated: time,
              })
              .where(
                and(
                  eq(ArtifactTable.id, artifact.id),
                  eq(ArtifactTable.disposition_version, input.expectedDispositionVersion),
                  isNull(ArtifactTable.withdrawal_reason),
                ),
              )
              .returning({ id: ArtifactTable.id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* artifactConflict(artifact)
            return yield* getArtifactInfo(tx, artifact.id)
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const restore: Interface["restore"] = Effect.fn("Artifact.restore")(function* (input) {
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const artifact = yield* requireArtifactRow(tx, input.artifactID)
            if (artifact.disposition_version !== input.expectedDispositionVersion) {
              return yield* artifactConflict(artifact)
            }
            if (!artifact.withdrawal_reason) {
              return yield* new InvalidTransitionError({ detail: "Artifact is not ordinarily withdrawn" })
            }
            const updated = yield* tx
              .update(ArtifactTable)
              .set({
                withdrawal_reason: null,
                disposition_version: sql`${ArtifactTable.disposition_version} + 1`,
                time_updated: Date.now(),
              })
              .where(
                and(
                  eq(ArtifactTable.id, artifact.id),
                  eq(ArtifactTable.disposition_version, input.expectedDispositionVersion),
                  eq(ArtifactTable.withdrawal_reason, "removed"),
                ),
              )
              .returning({ id: ArtifactTable.id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* artifactConflict(artifact)
            return yield* getArtifactInfo(tx, artifact.id)
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const listArtifacts: Interface["listArtifacts"] = Effect.fn("Artifact.listArtifacts")(function* (input) {
      const includeWithdrawn = input?.includeWithdrawn ?? false
      const scope = { endpoint: "artifacts" as const, parent: "home", filter: includeWithdrawn ? "all" : "ordinary" }
      const page = yield* ArtifactCursor.options(input, scope)
      const after = yield* twoPartKey(page.key, "number", "string")
      return yield* snapshot(db, (tx) =>
        Effect.gen(function* () {
          const rows = yield* tx
            .select({ id: ArtifactTable.id, timeCreated: ArtifactTable.time_created })
            .from(ArtifactTable)
            .where(
              and(
                includeWithdrawn
                  ? undefined
                  : and(isNull(ArtifactTable.withdrawal_reason), eq(ArtifactTable.correction_hidden, false)),
                after
                  ? or(
                      gt(ArtifactTable.time_created, after[0]),
                      and(eq(ArtifactTable.time_created, after[0]), sql`${ArtifactTable.id} > ${after[1]}`),
                    )
                  : undefined,
              ),
            )
            .orderBy(asc(ArtifactTable.time_created), asc(ArtifactTable.id))
            .limit(page.limit + 1)
            .all()
            .pipe(Effect.orDie)
          const visible = rows.slice(0, page.limit)
          const items = yield* Effect.forEach(visible, (row) => getArtifactInfo(tx, row.id))
          return pageResult(items, rows.length > page.limit, scope, (item) => [item.timeCreated, item.id])
        }),
      )
    })

    const getArtifact: Interface["getArtifact"] = Effect.fn("Artifact.getArtifact")(function* (artifactID) {
      return yield* snapshot(db, (tx) => getArtifactInfo(tx, artifactID))
    })

    const lookupActiveLocation: Interface["lookupActiveLocation"] = Effect.fn("Artifact.lookupActiveLocation")(
      function* (input) {
        const location = yield* requireLocation(input)
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            const binding = yield* tx
              .select()
              .from(ArtifactSourceBindingTable)
              .where(
                and(
                  eq(ArtifactSourceBindingTable.canonical_location, location),
                  isNull(ArtifactSourceBindingTable.time_ended),
                ),
              )
              .get()
              .pipe(Effect.orDie)
            if (!binding) return undefined
            return {
              artifact: yield* getArtifactInfo(tx, binding.recorded_artifact_id),
              binding: bindingInfo(binding),
            }
          }),
        )
      },
    )

    const listRevisions: Interface["listRevisions"] = Effect.fn("Artifact.listRevisions")(
      function* (artifactID, input) {
        const view = input?.view ?? "effective"
        const scope = { endpoint: "revisions" as const, parent: artifactID, filter: view }
        const page = yield* ArtifactCursor.options(input, scope)
        const after = yield* threePartStringKey(page.key)
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            yield* requireArtifactRow(tx, artifactID)
            const rows = yield* revisionRows(tx, {
              artifactID,
              view,
              after,
              limit: page.limit + 1,
            })
            const items = rows.slice(0, page.limit).map((row) => revisionInfo(row, artifactID))
            return pageResult(items, rows.length > page.limit, scope, (item) => [
              item.timeFirstObserved,
              item.id,
              item.attribution.type === "recorded" ? "" : item.attribution.memberID,
            ])
          }),
        )
      },
    )

    const getRevision: Interface["getRevision"] = Effect.fn("Artifact.getRevision")(
      function* (artifactID, revisionID, attribution) {
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            yield* requireArtifactRow(tx, artifactID)
            if (attribution.type === "lineage_correction") {
              return yield* exactCorrectedRevision(tx, artifactID, revisionID, attribution.memberID)
            }
            const revision = yield* tx
              .select()
              .from(ArtifactRevisionTable)
              .where(
                and(
                  eq(ArtifactRevisionTable.id, revisionID),
                  eq(ArtifactRevisionTable.recorded_artifact_id, artifactID),
                ),
              )
              .get()
              .pipe(Effect.orDie)
            if (!revision) return yield* new NotFoundError({ entity: "revision", id: revisionID })
            return revisionInfo({ ...revision, attribution_member_id: null }, artifactID)
          }),
        )
      },
    )

    const listBindings: Interface["listBindings"] = Effect.fn("Artifact.listBindings")(function* (artifactID, input) {
      const scope = { endpoint: "bindings" as const, parent: artifactID, filter: "all" }
      const page = yield* ArtifactCursor.options(input, scope)
      const after = yield* twoPartKey(page.key, "number", "string")
      return yield* snapshot(db, (tx) =>
        Effect.gen(function* () {
          yield* requireArtifactRow(tx, artifactID)
          const rows = yield* tx
            .select()
            .from(ArtifactSourceBindingTable)
            .where(
              and(
                eq(ArtifactSourceBindingTable.recorded_artifact_id, artifactID),
                after
                  ? or(
                      gt(ArtifactSourceBindingTable.binding_ordinal, after[0]),
                      and(
                        eq(ArtifactSourceBindingTable.binding_ordinal, after[0]),
                        sql`${ArtifactSourceBindingTable.id} > ${after[1]}`,
                      ),
                    )
                  : undefined,
              ),
            )
            .orderBy(asc(ArtifactSourceBindingTable.binding_ordinal), asc(ArtifactSourceBindingTable.id))
            .limit(page.limit + 1)
            .all()
            .pipe(Effect.orDie)
          const items = rows.slice(0, page.limit).map(bindingInfo)
          return pageResult(items, rows.length > page.limit, scope, (item) => [item.ordinal, item.id])
        }),
      )
    })

    const listObservations: Interface["listObservations"] = Effect.fn("Artifact.listObservations")(
      function* (artifactID, input) {
        const scope = { endpoint: "observations" as const, parent: artifactID, filter: "all" }
        const page = yield* ArtifactCursor.options(input, scope)
        const after = yield* twoPartKey(page.key, "number", "string")
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            yield* requireArtifactRow(tx, artifactID)
            const rows = yield* tx
              .select()
              .from(ArtifactSourceObservationTable)
              .where(
                and(
                  eq(ArtifactSourceObservationTable.recorded_artifact_id, artifactID),
                  after
                    ? or(
                        gt(ArtifactSourceObservationTable.occurrence_ordinal, after[0]),
                        and(
                          eq(ArtifactSourceObservationTable.occurrence_ordinal, after[0]),
                          sql`${ArtifactSourceObservationTable.id} > ${after[1]}`,
                        ),
                      )
                    : undefined,
                ),
              )
              .orderBy(asc(ArtifactSourceObservationTable.occurrence_ordinal), asc(ArtifactSourceObservationTable.id))
              .limit(page.limit + 1)
              .all()
              .pipe(Effect.orDie)
            const items = yield* Effect.forEach(rows.slice(0, page.limit), (row) => observationInfo(tx, row))
            return pageResult(items, rows.length > page.limit, scope, (item) => [item.ordinal, item.id])
          }),
        )
      },
    )

    const listObservationCorrections: Interface["listObservationCorrections"] = Effect.fn(
      "Artifact.listObservationCorrections",
    )(function* (artifactID, input) {
      const scope = { endpoint: "observation_corrections" as const, parent: artifactID, filter: "all" }
      const page = yield* ArtifactCursor.options(input, scope)
      const after = yield* threePartNumberKey(page.key)
      return yield* snapshot(db, (tx) =>
        Effect.gen(function* () {
          yield* requireArtifactRow(tx, artifactID)
          const rows = yield* tx
            .select({
              correction: ArtifactObservationCorrectionTable,
              ordinal: ArtifactSourceObservationTable.occurrence_ordinal,
            })
            .from(ArtifactObservationCorrectionTable)
            .innerJoin(
              ArtifactSourceObservationTable,
              eq(ArtifactSourceObservationTable.id, ArtifactObservationCorrectionTable.observation_id),
            )
            .where(
              and(
                or(
                  eq(ArtifactSourceObservationTable.recorded_artifact_id, artifactID),
                  sql`COALESCE((
                    SELECT CASE
                      WHEN candidate.outcome_kind = 'recorded' THEN ${ArtifactSourceObservationTable.recorded_artifact_id}
                      ELSE candidate.outcome_artifact_id
                    END
                    FROM artifact_lineage_correction_member candidate
                    WHERE candidate.recorded_artifact_id = ${ArtifactSourceObservationTable.recorded_artifact_id}
                      AND candidate.start_after_ordinal < candidate.end_at_ordinal
                      AND candidate.start_after_ordinal < ${ArtifactSourceObservationTable.occurrence_ordinal}
                      AND candidate.end_at_ordinal >= ${ArtifactSourceObservationTable.occurrence_ordinal}
                    ORDER BY candidate.lineage_version DESC, candidate.id DESC
                    LIMIT 1
                  ), ${ArtifactSourceObservationTable.recorded_artifact_id}) = ${artifactID}`,
                ),
                after
                  ? or(
                      gt(ArtifactSourceObservationTable.occurrence_ordinal, after[0]),
                      and(
                        eq(ArtifactSourceObservationTable.occurrence_ordinal, after[0]),
                        gt(ArtifactObservationCorrectionTable.correction_sequence, after[1]),
                      ),
                      and(
                        eq(ArtifactSourceObservationTable.occurrence_ordinal, after[0]),
                        eq(ArtifactObservationCorrectionTable.correction_sequence, after[1]),
                        sql`${ArtifactObservationCorrectionTable.id} > ${after[2]}`,
                      ),
                    )
                  : undefined,
              ),
            )
            .orderBy(
              asc(ArtifactSourceObservationTable.occurrence_ordinal),
              asc(ArtifactObservationCorrectionTable.correction_sequence),
              asc(ArtifactObservationCorrectionTable.id),
            )
            .limit(page.limit + 1)
            .all()
            .pipe(Effect.orDie)
          const visible = rows.slice(0, page.limit)
          const items = visible.map((row) => observationCorrectionInfo(row.correction))
          const keys = new Map(
            visible.map((row) => [
              row.correction.id,
              [row.ordinal, row.correction.correction_sequence, row.correction.id] as const,
            ]),
          )
          return pageResult(items, rows.length > page.limit, scope, (item) => keys.get(item.id)!)
        }),
      )
    })

    const listLineageCorrections: Interface["listLineageCorrections"] = Effect.fn("Artifact.listLineageCorrections")(
      function* (artifactID, input) {
        const scope = { endpoint: "lineage_corrections" as const, parent: artifactID, filter: "involving" }
        const page = yield* ArtifactCursor.options(input, scope)
        const after = yield* threePartStringKey(page.key)
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            yield* requireArtifactRow(tx, artifactID)
            const rows = yield* tx
              .select({ member: ArtifactLineageCorrectionMemberTable, set: ArtifactLineageCorrectionSetTable })
              .from(ArtifactLineageCorrectionMemberTable)
              .innerJoin(
                ArtifactLineageCorrectionSetTable,
                eq(ArtifactLineageCorrectionSetTable.id, ArtifactLineageCorrectionMemberTable.set_id),
              )
              .where(
                and(
                  or(
                    eq(ArtifactLineageCorrectionMemberTable.recorded_artifact_id, artifactID),
                    eq(ArtifactLineageCorrectionMemberTable.outcome_artifact_id, artifactID),
                    eq(ArtifactLineageCorrectionSetTable.new_artifact_id, artifactID),
                  ),
                  after
                    ? or(
                        gt(ArtifactLineageCorrectionSetTable.time_committed, after[0]),
                        and(
                          eq(ArtifactLineageCorrectionSetTable.time_committed, after[0]),
                          sql`${ArtifactLineageCorrectionSetTable.id} > ${after[1]}`,
                        ),
                        and(
                          eq(ArtifactLineageCorrectionSetTable.time_committed, after[0]),
                          sql`${ArtifactLineageCorrectionSetTable.id} = ${after[1]}`,
                          sql`${ArtifactLineageCorrectionMemberTable.id} > ${after[2]}`,
                        ),
                      )
                    : undefined,
                ),
              )
              .orderBy(
                asc(ArtifactLineageCorrectionSetTable.time_committed),
                asc(ArtifactLineageCorrectionSetTable.id),
                asc(ArtifactLineageCorrectionMemberTable.id),
              )
              .limit(page.limit + 1)
              .all()
              .pipe(Effect.orDie)
            const visible = rows.slice(0, page.limit)
            const items = visible.map((row) => lineageMemberInfo(row.member, row.set))
            const keys = new Map(
              visible.map((row) => [row.member.id, [row.set.time_committed, row.set.id, row.member.id] as const]),
            )
            return pageResult(items, rows.length > page.limit, scope, (item) => keys.get(item.id)!)
          }),
        )
      },
    )

    const getObservation: Interface["getObservation"] = Effect.fn("Artifact.getObservation")(function* (observationID) {
      return yield* snapshot(db, (tx) =>
        Effect.gen(function* () {
          const row = yield* tx
            .select()
            .from(ArtifactSourceObservationTable)
            .where(eq(ArtifactSourceObservationTable.id, observationID))
            .get()
            .pipe(Effect.orDie)
          if (!row) return yield* new NotFoundError({ entity: "observation", id: observationID })
          return yield* observationInfo(tx, row)
        }),
      )
    })

    return Service.of({
      admit,
      observe,
      correctObservation,
      rebind,
      correctLineage,
      withdraw,
      restore,
      listArtifacts,
      getArtifact,
      lookupActiveLocation,
      listRevisions,
      getRevision,
      listBindings,
      listObservations,
      getObservation,
      listObservationCorrections,
      listLineageCorrections,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })

type RevisionQueryRow = {
  id: RevisionID
  recorded_artifact_id: ArtifactID
  fingerprint_algorithm: "sha256"
  fingerprint_digest: string
  byte_length: number
  time_first_observed: number
  attribution_member_id: LineageCorrectionMemberID | null
}

function revisionRows(
  source: Queryable,
  input: {
    readonly artifactID: ArtifactID
    readonly view: AttributionView
    readonly revisionID?: RevisionID
    readonly fingerprint?: Fingerprint
    readonly after?: readonly [number, string, string]
    readonly limit: number
  },
) {
  const revision = input.revisionID ? sql`AND r.id = ${input.revisionID}` : sql``
  const fingerprint = input.fingerprint
    ? sql`AND r.fingerprint_algorithm = ${input.fingerprint.algorithm} AND r.fingerprint_digest = ${input.fingerprint.digest} AND r.byte_length = ${input.fingerprint.byteLength}`
    : sql``
  const after = input.after
    ? sql`AND (r.time_first_observed > ${input.after[0]} OR (r.time_first_observed = ${input.after[0]} AND r.id > ${input.after[1]}) OR (r.time_first_observed = ${input.after[0]} AND r.id = ${input.after[1]} AND COALESCE(e.attribution_member_id, '') > ${input.after[2]}))`
    : sql``
  if (input.view === "recorded") {
    return source
      .all<RevisionQueryRow>(
        sql`
        SELECT r.id, r.recorded_artifact_id, r.fingerprint_algorithm, r.fingerprint_digest,
          r.byte_length, r.time_first_observed, NULL AS attribution_member_id
        FROM artifact_revision r
        WHERE r.recorded_artifact_id = ${input.artifactID}
        ${revision}
        ${fingerprint}
        ${
          input.after
            ? sql`AND (r.time_first_observed > ${input.after[0]} OR (r.time_first_observed = ${input.after[0]} AND r.id > ${input.after[1]}))`
            : sql``
        }
        ORDER BY r.time_first_observed, r.id, attribution_member_id
        LIMIT ${input.limit}
      `,
      )
      .pipe(Effect.orDie)
  }
  return source
    .all<RevisionQueryRow>(
      sql`
      WITH observation_effective AS (
        SELECT o.revision_id,
          COALESCE(winner.id, o.revision_attribution_member_id) AS attribution_member_id,
          CASE
            WHEN winner.id IS NULL OR winner.outcome_kind = 'recorded' THEN o.recorded_artifact_id
            ELSE winner.outcome_artifact_id
          END AS effective_artifact_id
        FROM artifact_source_observation o
        LEFT JOIN artifact_lineage_correction_member winner ON winner.id = (
          SELECT candidate.id
          FROM artifact_lineage_correction_member candidate
          WHERE candidate.recorded_artifact_id = o.recorded_artifact_id
            AND candidate.start_after_ordinal < candidate.end_at_ordinal
            AND candidate.start_after_ordinal < o.occurrence_ordinal
            AND candidate.end_at_ordinal >= o.occurrence_ordinal
          ORDER BY candidate.lineage_version DESC, candidate.id DESC
          LIMIT 1
        )
        WHERE o.result = 'present'
      ),
      boundary_effective AS (
        SELECT winner.boundary_revision_id AS revision_id,
          winner.id AS attribution_member_id,
          CASE
            WHEN winner.outcome_kind = 'recorded' THEN winner.recorded_artifact_id
            ELSE winner.outcome_artifact_id
          END AS effective_artifact_id
        FROM artifact_lineage_correction_member winner
        WHERE winner.boundary_revision_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM artifact_lineage_correction_member newer
            WHERE newer.recorded_artifact_id = winner.recorded_artifact_id
              AND newer.lineage_version > winner.lineage_version
              AND (
                (newer.start_after_ordinal < newer.end_at_ordinal
                  AND newer.start_after_ordinal < winner.end_at_ordinal
                  AND newer.end_at_ordinal >= winner.end_at_ordinal)
                OR (newer.start_after_ordinal = newer.end_at_ordinal
                  AND newer.end_at_ordinal = winner.end_at_ordinal)
              )
          )
      ),
      effective AS (
        SELECT DISTINCT revision_id, attribution_member_id, effective_artifact_id FROM observation_effective
        UNION
        SELECT DISTINCT revision_id, attribution_member_id, effective_artifact_id FROM boundary_effective
      )
      SELECT r.id, r.recorded_artifact_id, r.fingerprint_algorithm, r.fingerprint_digest,
        r.byte_length, r.time_first_observed, e.attribution_member_id
      FROM effective e
      INNER JOIN artifact_revision r ON r.id = e.revision_id
      WHERE e.effective_artifact_id = ${input.artifactID}
      ${revision}
      ${fingerprint}
      ${after}
      ORDER BY r.time_first_observed, r.id, COALESCE(e.attribution_member_id, '')
      LIMIT ${input.limit}
    `,
    )
    .pipe(Effect.orDie)
}

function revisionInfo(row: RevisionQueryRow, effectiveArtifactID: ArtifactID): RevisionInfo {
  return {
    id: row.id,
    recordedArtifactID: row.recorded_artifact_id,
    effectiveArtifactID,
    fingerprint: {
      algorithm: row.fingerprint_algorithm,
      digest: row.fingerprint_digest,
      byteLength: row.byte_length,
    },
    attribution: row.attribution_member_id
      ? { type: "lineage_correction", memberID: row.attribution_member_id }
      : { type: "recorded" },
    timeFirstObserved: row.time_first_observed,
  }
}

function exactCorrectedRevision(
  source: Queryable,
  artifactID: ArtifactID,
  revisionID: RevisionID,
  memberID: LineageCorrectionMemberID,
) {
  return Effect.gen(function* () {
    const member = yield* source
      .select()
      .from(ArtifactLineageCorrectionMemberTable)
      .where(eq(ArtifactLineageCorrectionMemberTable.id, memberID))
      .get()
      .pipe(Effect.orDie)
    const owner = member?.outcome_kind === "recorded" ? member.recorded_artifact_id : member?.outcome_artifact_id
    if (!member || owner !== artifactID) {
      return yield* new NotFoundError({ entity: "revision", id: revisionID })
    }
    const observation = yield* source
      .select({ id: ArtifactSourceObservationTable.id })
      .from(ArtifactSourceObservationTable)
      .where(
        and(
          eq(ArtifactSourceObservationTable.recorded_artifact_id, member.recorded_artifact_id),
          eq(ArtifactSourceObservationTable.result, "present"),
          eq(ArtifactSourceObservationTable.revision_id, revisionID),
          gt(ArtifactSourceObservationTable.occurrence_ordinal, member.start_after_ordinal),
          sql`${ArtifactSourceObservationTable.occurrence_ordinal} <= ${member.end_at_ordinal}`,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (member.boundary_revision_id !== revisionID && !observation) {
      return yield* new NotFoundError({ entity: "revision", id: revisionID })
    }
    const revision = yield* requireRevisionRow(source, revisionID)
    return revisionInfo({ ...revision, attribution_member_id: member.id }, artifactID)
  })
}

function resolveRevision(source: Queryable, artifactID: ArtifactID, observation: PresentObservation) {
  return Effect.gen(function* () {
    const recorded = yield* source
      .select()
      .from(ArtifactRevisionTable)
      .where(
        and(
          eq(ArtifactRevisionTable.recorded_artifact_id, artifactID),
          eq(ArtifactRevisionTable.fingerprint_algorithm, observation.fingerprint.algorithm),
          eq(ArtifactRevisionTable.fingerprint_digest, observation.fingerprint.digest),
          eq(ArtifactRevisionTable.byte_length, observation.fingerprint.byteLength),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (recorded) return { revision: recorded, attribution: { type: "recorded" } as const }

    const effective = (yield* revisionRows(source, {
      artifactID,
      view: "effective",
      fingerprint: observation.fingerprint,
      limit: 1,
    }))[0]
    if (effective) {
      return {
        revision: yield* requireRevisionRow(source, effective.id),
        attribution: effective.attribution_member_id
          ? ({ type: "lineage_correction", memberID: effective.attribution_member_id } as const)
          : ({ type: "recorded" } as const),
      }
    }

    const revision = {
      id: createRevisionID(),
      recorded_artifact_id: artifactID,
      fingerprint_algorithm: observation.fingerprint.algorithm,
      fingerprint_digest: observation.fingerprint.digest,
      byte_length: observation.fingerprint.byteLength,
      time_first_observed: observation.timeObserved,
    } satisfies typeof ArtifactRevisionTable.$inferInsert
    yield* source.insert(ArtifactRevisionTable).values(revision).run().pipe(Effect.orDie)
    return { revision: { ...revision }, attribution: { type: "recorded" } as const }
  })
}

function getArtifactInfo(source: Queryable, artifactID: ArtifactID) {
  return Effect.gen(function* () {
    const artifact = yield* requireArtifactRow(source, artifactID)
    const current = yield* requireCurrentSourceRow(source, artifactID)
    const binding = current.active_binding_id ? yield* requireBindingRow(source, current.active_binding_id) : undefined
    const creation =
      artifact.creation_basis === "lineage_correction"
        ? yield* source
            .select({ id: ArtifactLineageCorrectionSetTable.id })
            .from(ArtifactLineageCorrectionSetTable)
            .where(eq(ArtifactLineageCorrectionSetTable.new_artifact_id, artifact.id))
            .get()
            .pipe(Effect.orDie)
        : undefined
    return artifactInfo(artifact, current, binding, creation?.id)
  })
}

function artifactInfo(
  artifact: ArtifactRow,
  current: CurrentSourceRow,
  binding: BindingRow | undefined,
  creationCorrectionSetID: LineageCorrectionSetID | undefined,
): ArtifactInfo {
  return {
    id: artifact.id,
    admissionRootArtifactID: artifact.admission_root_artifact_id,
    creationBasis: artifact.creation_basis,
    creationCorrectionSetID,
    creationCapability:
      artifact.creation_capability_identity && artifact.creation_capability_version
        ? {
            identity: artifact.creation_capability_identity,
            version: artifact.creation_capability_version,
          }
        : undefined,
    dispositionVersion: artifact.disposition_version,
    lineageVersion: artifact.lineage_version,
    withdrawalReason: artifact.withdrawal_reason ?? undefined,
    correctionHidden: artifact.correction_hidden,
    timeCreated: artifact.time_created,
    timeUpdated: artifact.time_updated,
    source: {
      sourceVersion: current.source_version,
      activeBinding: binding
        ? { id: binding.id, ordinal: binding.binding_ordinal, location: binding.canonical_location }
        : undefined,
      currentRevisionID: current.current_revision_id ?? undefined,
      revisionAttribution: current.current_revision_id
        ? current.revision_attribution_member_id
          ? { type: "lineage_correction", memberID: current.revision_attribution_member_id }
          : { type: "recorded" }
        : undefined,
      sourceStateBasis: current.source_state_observation_id
        ? { type: "observation", observationID: current.source_state_observation_id }
        : current.source_state_member_id
          ? { type: "lineage_correction", memberID: current.source_state_member_id }
          : undefined,
      descriptor:
        current.descriptor_observation_id && current.effective_media_type
          ? {
              observationID: current.descriptor_observation_id,
              correctionID: current.descriptor_correction_id ?? undefined,
              mediaType: current.effective_media_type,
            }
          : undefined,
      availability: current.availability,
      timeUpdated: current.time_updated,
    },
  }
}

function requireArtifactRow(source: Queryable, artifactID: ArtifactID) {
  return Effect.gen(function* () {
    const artifact = yield* source
      .select()
      .from(ArtifactTable)
      .where(eq(ArtifactTable.id, artifactID))
      .get()
      .pipe(Effect.orDie)
    if (!artifact) return yield* new NotFoundError({ entity: "artifact", id: artifactID })
    return artifact
  })
}

function requireCurrentSourceRow(source: Queryable, artifactID: ArtifactID) {
  return Effect.gen(function* () {
    const current = yield* source
      .select()
      .from(ArtifactCurrentSourceTable)
      .where(eq(ArtifactCurrentSourceTable.artifact_id, artifactID))
      .get()
      .pipe(Effect.orDie)
    if (!current) return yield* new NotFoundError({ entity: "artifact", id: artifactID })
    return current
  })
}

function requireRevisionRow(source: Queryable, revisionID: RevisionID) {
  return Effect.gen(function* () {
    const revision = yield* source
      .select()
      .from(ArtifactRevisionTable)
      .where(eq(ArtifactRevisionTable.id, revisionID))
      .get()
      .pipe(Effect.orDie)
    if (!revision) return yield* new NotFoundError({ entity: "revision", id: revisionID })
    return revision
  })
}

function requireBindingRow(source: Queryable, bindingID: BindingID) {
  return Effect.gen(function* () {
    const binding = yield* source
      .select()
      .from(ArtifactSourceBindingTable)
      .where(eq(ArtifactSourceBindingTable.id, bindingID))
      .get()
      .pipe(Effect.orDie)
    if (!binding) return yield* new NotFoundError({ entity: "binding", id: bindingID })
    return binding
  })
}

function requireObservationRow(source: Queryable, observationID: ObservationID) {
  return Effect.gen(function* () {
    const observation = yield* source
      .select()
      .from(ArtifactSourceObservationTable)
      .where(eq(ArtifactSourceObservationTable.id, observationID))
      .get()
      .pipe(Effect.orDie)
    if (!observation) return yield* new NotFoundError({ entity: "observation", id: observationID })
    return observation
  })
}

function requireObservationCorrectionRow(source: Queryable, correctionID: ObservationCorrectionID) {
  return Effect.gen(function* () {
    const correction = yield* source
      .select()
      .from(ArtifactObservationCorrectionTable)
      .where(eq(ArtifactObservationCorrectionTable.id, correctionID))
      .get()
      .pipe(Effect.orDie)
    if (!correction) return yield* new NotFoundError({ entity: "observation_correction", id: correctionID })
    return correction
  })
}

function requireExpectedSource(source: Queryable, expected: ExpectedSource, active: boolean) {
  return Effect.gen(function* () {
    const current = yield* getArtifactInfo(source, expected.artifactID)
    if (!equalExpected(expected, current)) return yield* sourceConflict(current)
    if (active && current.withdrawalReason) {
      return yield* new InactiveError({ artifactID: current.id, reason: "removed" })
    }
    if (active && current.correctionHidden) {
      return yield* new InactiveError({ artifactID: current.id, reason: "lineage_correction" })
    }
    return current
  })
}

function makeOrdinaryUseSnapshot(current: ArtifactInfo) {
  if (current.withdrawalReason) {
    return Effect.fail(new InactiveError({ artifactID: current.id, reason: "removed" }))
  }
  if (current.correctionHidden) {
    return Effect.fail(new InactiveError({ artifactID: current.id, reason: "lineage_correction" }))
  }
  if (!current.source.currentRevisionID || !current.source.revisionAttribution) {
    return Effect.fail(
      new InvalidTransitionError({ detail: `Artifact ${current.id} has no current Revision attribution` }),
    )
  }
  return Effect.succeed({
    effectiveArtifactID: current.id,
    dispositionVersion: current.dispositionVersion,
    currentRevisionID: current.source.currentRevisionID,
    attribution: current.source.revisionAttribution,
    lineageVersion: current.lineageVersion,
  } satisfies OrdinaryUseSnapshot)
}

function makeOrdinaryUseRevisionSnapshot(tx: Transaction, current: ArtifactInfo) {
  return Effect.gen(function* () {
    const ordinary = yield* makeOrdinaryUseSnapshot(current)
    if (!current.source.descriptor) {
      return yield* new InvalidTransitionError({
        detail: `Artifact ${current.id} has no current source descriptor`,
      })
    }
    const revision = yield* requireRevisionRow(tx, ordinary.currentRevisionID)
    return {
      ...ordinary,
      fingerprint: {
        algorithm: revision.fingerprint_algorithm,
        digest: revision.fingerprint_digest,
        byteLength: revision.byte_length,
      },
      mediaType: current.source.descriptor.mediaType,
    } satisfies OrdinaryUseRevisionSnapshot
  })
}

function updateCurrentSource(
  tx: Transaction,
  current: ArtifactInfo,
  values: Partial<typeof ArtifactCurrentSourceTable.$inferInsert>,
) {
  return Effect.gen(function* () {
    const updated = yield* tx
      .update(ArtifactCurrentSourceTable)
      .set({ ...values, source_version: sql`${ArtifactCurrentSourceTable.source_version} + 1` })
      .where(
        and(
          eq(ArtifactCurrentSourceTable.artifact_id, current.id),
          eq(ArtifactCurrentSourceTable.source_version, current.source.sourceVersion),
        ),
      )
      .returning({ id: ArtifactCurrentSourceTable.artifact_id })
      .get()
      .pipe(Effect.orDie)
    if (!updated) return yield* sourceConflict(current)
    return undefined
  })
}

function requireLocationAvailable(source: Queryable, location: string) {
  return Effect.gen(function* () {
    const owner = yield* source
      .select({
        artifactID: ArtifactSourceBindingTable.recorded_artifact_id,
        bindingID: ArtifactSourceBindingTable.id,
      })
      .from(ArtifactSourceBindingTable)
      .where(
        and(eq(ArtifactSourceBindingTable.canonical_location, location), isNull(ArtifactSourceBindingTable.time_ended)),
      )
      .get()
      .pipe(Effect.orDie)
    if (owner) {
      return yield* new LocationConflictError({
        location,
        artifactID: owner.artifactID,
        bindingID: owner.bindingID,
      })
    }
    return undefined
  })
}

function nextObservationOrdinal(source: Queryable, artifactID: ArtifactID) {
  return source
    .select({ value: max(ArtifactSourceObservationTable.occurrence_ordinal) })
    .from(ArtifactSourceObservationTable)
    .where(eq(ArtifactSourceObservationTable.recorded_artifact_id, artifactID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row?.value ?? 0) + 1),
    )
}

function nextBindingOrdinal(source: Queryable, artifactID: ArtifactID) {
  return source
    .select({ value: max(ArtifactSourceBindingTable.binding_ordinal) })
    .from(ArtifactSourceBindingTable)
    .where(eq(ArtifactSourceBindingTable.recorded_artifact_id, artifactID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row?.value ?? 0) + 1),
    )
}

function latestObservationCorrection(source: Queryable, observationID: ObservationID) {
  return source
    .select()
    .from(ArtifactObservationCorrectionTable)
    .where(eq(ArtifactObservationCorrectionTable.observation_id, observationID))
    .orderBy(desc(ArtifactObservationCorrectionTable.correction_sequence), desc(ArtifactObservationCorrectionTable.id))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
}

function winningMemberAtObservation(source: Queryable, artifactID: ArtifactID, ordinal: number) {
  return source
    .select()
    .from(ArtifactLineageCorrectionMemberTable)
    .where(
      and(
        eq(ArtifactLineageCorrectionMemberTable.recorded_artifact_id, artifactID),
        sql`${ArtifactLineageCorrectionMemberTable.start_after_ordinal} < ${ArtifactLineageCorrectionMemberTable.end_at_ordinal}`,
        sql`${ArtifactLineageCorrectionMemberTable.start_after_ordinal} < ${ordinal}`,
        sql`${ArtifactLineageCorrectionMemberTable.end_at_ordinal} >= ${ordinal}`,
      ),
    )
    .orderBy(desc(ArtifactLineageCorrectionMemberTable.lineage_version), desc(ArtifactLineageCorrectionMemberTable.id))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
}

function observationInfo(source: Queryable, observation: ObservationRow) {
  return Effect.gen(function* () {
    const correction =
      observation.result === "present" ? yield* latestObservationCorrection(source, observation.id) : undefined
    const winner = yield* winningMemberAtObservation(
      source,
      observation.recorded_artifact_id,
      observation.occurrence_ordinal,
    )
    const effectiveArtifactID = winner
      ? winner.outcome_kind === "recorded"
        ? winner.recorded_artifact_id
        : winner.outcome_artifact_id!
      : observation.recorded_artifact_id
    return {
      id: observation.id,
      recordedArtifactID: observation.recorded_artifact_id,
      bindingID: observation.binding_id,
      ordinal: observation.occurrence_ordinal,
      result: observation.result,
      revisionID: observation.revision_id ?? undefined,
      recordedRevisionAttribution: observation.revision_id
        ? observation.revision_attribution_member_id
          ? { type: "lineage_correction", memberID: observation.revision_attribution_member_id }
          : { type: "recorded" }
        : undefined,
      effectiveArtifactID,
      effectiveAttribution: winner ? { type: "lineage_correction", memberID: winner.id } : { type: "recorded" },
      recordedMediaType: observation.media_type ?? undefined,
      effectiveMediaType: correction?.media_type ?? observation.media_type ?? undefined,
      effectiveTimeObserved: correction?.corrected_time_observed ?? observation.time_observed,
      latestCorrectionID: correction?.id,
      observer: {
        capabilityIdentity: observation.observer_capability_identity,
        capabilityVersion: observation.observer_capability_version,
      },
      timeObserved: observation.time_observed,
      timeCommitted: observation.time_committed,
    } satisfies ObservationInfo
  })
}

function observationCorrectionInfo(row: ObservationCorrectionRow): ObservationCorrectionInfo {
  return {
    id: row.id,
    observationID: row.observation_id,
    sequence: row.correction_sequence,
    predecessorCorrectionID: row.predecessor_correction_id ?? undefined,
    mediaType: row.media_type,
    correctedTimeObserved: row.corrected_time_observed ?? undefined,
    basis: row.basis,
    capabilityIdentity: row.capability_identity,
    capabilityVersion: row.capability_version,
    timeCommitted: row.time_committed,
  }
}

function lineageMemberInfo(
  member: LineageMemberRow,
  set: typeof ArtifactLineageCorrectionSetTable.$inferSelect,
): LineageCorrectionMemberInfo {
  return {
    id: member.id,
    setID: member.set_id,
    admissionRootArtifactID: set.admission_root_artifact_id,
    recordedArtifactID: member.recorded_artifact_id,
    lineageVersion: member.lineage_version,
    startAfterOrdinal: member.start_after_ordinal,
    endAtOrdinal: member.end_at_ordinal,
    timeEffective: member.time_effective,
    expectedWinningAttribution: member.expected_winning_member_id
      ? { type: "lineage_correction", memberID: member.expected_winning_member_id }
      : { type: "recorded" },
    boundary: {
      bindingID: member.boundary_binding_id ?? undefined,
      sourceStateBasis: member.boundary_observation_id
        ? { type: "observation", observationID: member.boundary_observation_id }
        : member.boundary_source_member_id
          ? { type: "lineage_correction", memberID: member.boundary_source_member_id }
          : undefined,
      revisionID: member.boundary_revision_id ?? undefined,
      revisionAttribution: member.boundary_revision_id
        ? member.boundary_revision_attribution_member_id
          ? { type: "lineage_correction", memberID: member.boundary_revision_attribution_member_id }
          : { type: "recorded" }
        : undefined,
      descriptor:
        member.boundary_descriptor_observation_id && member.boundary_media_type
          ? {
              observationID: member.boundary_descriptor_observation_id,
              correctionID: member.boundary_descriptor_correction_id ?? undefined,
              mediaType: member.boundary_media_type,
            }
          : undefined,
      availability: member.boundary_availability,
    },
    outcome:
      member.outcome_kind === "recorded"
        ? { type: "recorded" }
        : { type: "artifact", artifactID: member.outcome_artifact_id! },
    basis: set.basis,
    capabilityIdentity: set.capability_identity,
    capabilityVersion: set.capability_version,
    newArtifactID: set.new_artifact_id ?? undefined,
    timeCommitted: set.time_committed,
  }
}

function bindingInfo(row: BindingRow): BindingInfo {
  return {
    id: row.id,
    artifactID: row.recorded_artifact_id,
    ordinal: row.binding_ordinal,
    location: row.canonical_location,
    basis:
      row.basis_kind === "lineage_correction"
        ? { type: "lineage_correction", memberID: row.basis_lineage_member_id! }
        : {
            type: row.basis_kind,
            capabilityIdentity: row.basis_capability_identity!,
            capabilityVersion: row.basis_capability_version!,
          },
    timeStarted: row.time_started,
    timeEnded: row.time_ended ?? undefined,
    endReason: row.end_reason ?? undefined,
  }
}

function equalExpected(expected: ExpectedSource, current: ArtifactInfo) {
  const actual = expectedSource(current)
  return (
    expected.artifactID === actual.artifactID &&
    expected.dispositionVersion === actual.dispositionVersion &&
    expected.lineageVersion === actual.lineageVersion &&
    expected.sourceVersion === actual.sourceVersion &&
    expected.activeBindingID === actual.activeBindingID &&
    expected.activeLocation === actual.activeLocation &&
    expected.currentRevisionID === actual.currentRevisionID &&
    equalOptionalAttribution(expected.revisionAttribution, actual.revisionAttribution) &&
    equalOptionalSourceState(expected.sourceStateBasis, actual.sourceStateBasis) &&
    expected.descriptorObservationID === actual.descriptorObservationID &&
    expected.descriptorCorrectionID === actual.descriptorCorrectionID &&
    expected.mediaType === actual.mediaType &&
    expected.availability === actual.availability
  )
}

function equalOrdinaryUseSnapshot(left: OrdinaryUseSnapshot, right: OrdinaryUseSnapshot) {
  return (
    left.effectiveArtifactID === right.effectiveArtifactID &&
    left.dispositionVersion === right.dispositionVersion &&
    left.currentRevisionID === right.currentRevisionID &&
    equalAttribution(left.attribution, right.attribution) &&
    left.lineageVersion === right.lineageVersion
  )
}

function equalOrdinaryUseRevisionSnapshot(left: OrdinaryUseRevisionSnapshot, right: OrdinaryUseRevisionSnapshot) {
  return (
    equalOrdinaryUseSnapshot(left, right) &&
    left.fingerprint.algorithm === right.fingerprint.algorithm &&
    left.fingerprint.digest === right.fingerprint.digest &&
    left.fingerprint.byteLength === right.fingerprint.byteLength &&
    left.mediaType === right.mediaType
  )
}

function requireExpectedSet(expected: readonly ExpectedSource[], current: readonly ArtifactInfo[]) {
  return Effect.gen(function* () {
    const input = [...expected].sort((left, right) => left.artifactID.localeCompare(right.artifactID))
    const actual = [...current].sort((left, right) => left.id.localeCompare(right.id))
    const unique = new Set(input.map((item) => item.artifactID))
    if (
      unique.size !== input.length ||
      input.length !== actual.length ||
      input.some((item, index) => actual[index]?.id !== item.artifactID || !equalExpected(item, actual[index]))
    ) {
      const first = actual[0]
      if (first) return yield* sourceConflict(first)
      return yield* new ConflictError({ entity: "source", id: "affected_artifact_set" })
    }
    return undefined
  })
}

function equalAttribution(left: AttributionBasis, right: AttributionBasis) {
  return (
    left.type === right.type &&
    (left.type === "recorded" || (right.type === "lineage_correction" && left.memberID === right.memberID))
  )
}

function equalOptionalAttribution(left: AttributionBasis | undefined, right: AttributionBasis | undefined) {
  if (!left || !right) return left === right
  return equalAttribution(left, right)
}

function equalOptionalSourceState(left: SourceStateBasis | undefined, right: SourceStateBasis | undefined) {
  if (!left || !right) return left === right
  return (
    left.type === right.type &&
    (left.type === "observation"
      ? right.type === "observation" && left.observationID === right.observationID
      : right.type === "lineage_correction" && left.memberID === right.memberID)
  )
}

function sourceConflict(current: ArtifactInfo) {
  return Effect.fail(
    new ConflictError({
      entity: "source",
      id: current.id,
      currentDispositionVersion: current.dispositionVersion,
      currentSourceVersion: current.source.sourceVersion,
      currentLineageVersion: current.lineageVersion,
      currentBindingID: current.source.activeBinding?.id,
      currentRevisionID: current.source.currentRevisionID,
      currentAttributionMemberID:
        current.source.revisionAttribution?.type === "lineage_correction"
          ? current.source.revisionAttribution.memberID
          : undefined,
      currentSourceObservationID:
        current.source.sourceStateBasis?.type === "observation"
          ? current.source.sourceStateBasis.observationID
          : undefined,
      currentSourceMemberID:
        current.source.sourceStateBasis?.type === "lineage_correction"
          ? current.source.sourceStateBasis.memberID
          : undefined,
      currentAvailability: current.source.availability,
    }),
  )
}

function artifactConflict(current: ArtifactRow) {
  return Effect.fail(
    new ConflictError({
      entity: "artifact",
      id: current.id,
      currentDispositionVersion: current.disposition_version,
      currentLineageVersion: current.lineage_version,
    }),
  )
}

function correctionConflict(observationID: ObservationID, current: ObservationCorrectionRow | undefined) {
  return Effect.fail(
    new ConflictError({
      entity: "observation_correction",
      id: observationID,
      currentCorrectionID: current?.id,
      currentCorrectionSequence: current?.correction_sequence ?? 0,
    }),
  )
}

function sameFingerprint(revision: RevisionRow, fingerprint: Fingerprint) {
  return (
    revision.fingerprint_algorithm === fingerprint.algorithm &&
    revision.fingerprint_digest === fingerprint.digest &&
    revision.byte_length === fingerprint.byteLength
  )
}

function requireFingerprint(input: Fingerprint) {
  if (
    input.algorithm === "sha256" &&
    /^[0-9a-f]{64}$/.test(input.digest) &&
    Number.isSafeInteger(input.byteLength) &&
    input.byteLength >= 0
  ) {
    return Effect.succeed({ ...input })
  }
  return Effect.fail(
    new InvalidTransitionError({ detail: "Fingerprint must be lowercase SHA-256 and exact byte length" }),
  )
}

function requireMediaType(value: string) {
  const mediaType = value.trim()
  if (mediaType.length > 0) return Effect.succeed(mediaType)
  return Effect.fail(new InvalidTransitionError({ detail: "Media type must be non-empty" }))
}

function requireTime(value: number, name: string) {
  if (Number.isSafeInteger(value) && value >= 0) return Effect.succeed(value)
  return Effect.fail(new InvalidTransitionError({ detail: `${name} must be a non-negative safe integer` }))
}

function optionalTime(value: number | undefined) {
  return value === undefined ? Effect.succeed(undefined) : requireTime(value, "Corrected observation time")
}

function requireLocation(input: CanonicalLocation) {
  if (!(input instanceof CanonicalLocation)) {
    return Effect.fail(new InvalidTransitionError({ detail: "Canonical location must be bound by a trusted caller" }))
  }
  if (
    input.value.length === 0 ||
    (!isAbsolute(input.value) && !posix.isAbsolute(input.value) && !win32.isAbsolute(input.value))
  ) {
    return Effect.fail(new InvalidTransitionError({ detail: "Canonical location must be an absolute path" }))
  }
  return Effect.succeed(input.value)
}

function requireCapability(input: { readonly capabilityIdentity: string; readonly capabilityVersion: number }) {
  if (
    input.capabilityIdentity.trim().length > 0 &&
    Number.isSafeInteger(input.capabilityVersion) &&
    input.capabilityVersion >= 1
  ) {
    return Effect.succeed({
      capabilityIdentity: input.capabilityIdentity.trim(),
      capabilityVersion: input.capabilityVersion,
    })
  }
  return Effect.fail(new InvalidTransitionError({ detail: "Trusted capability identity and version are invalid" }))
}

function requireAdmission(input: unknown) {
  if (!(input instanceof Admission)) {
    return Effect.fail(
      new InvalidTransitionError({ detail: "Admission must be bound by a trusted application capability" }),
    )
  }
  return Effect.gen(function* () {
    const capability = yield* requireCapability(input)
    return { ...capability, basis: input.basis }
  })
}

function requireObserver(input: unknown) {
  if (!(input instanceof Observer)) {
    return Effect.fail(
      new InvalidTransitionError({ detail: "Observer must be bound by a trusted application capability" }),
    )
  }
  return Effect.gen(function* () {
    yield* requireCapability(input)
    return input
  })
}

function requireRebind(input: unknown) {
  if (!(input instanceof Rebind)) {
    return Effect.fail(
      new InvalidTransitionError({ detail: "Rebind requires application-bound explicit learner intent" }),
    )
  }
  return Effect.gen(function* () {
    yield* requireCapability(input)
    return input
  })
}

function requireObservationCorrectionAuthority(input: unknown) {
  if (!(input instanceof ObservationCorrectionAuthority)) {
    return Effect.fail(new InvalidTransitionError({ detail: "Observation correction authority is not trusted" }))
  }
  return Effect.gen(function* () {
    yield* requireCapability(input)
    return input
  })
}

function requireLineageCorrectionAuthority(input: unknown) {
  if (!(input instanceof LineageCorrectionAuthority)) {
    return Effect.fail(new InvalidTransitionError({ detail: "Lineage correction authority is not trusted" }))
  }
  return Effect.gen(function* () {
    yield* requireCapability(input)
    return input
  })
}

type ApplyLineageInput = Omit<Parameters<Interface["correctLineage"]>[0], "authority"> & {
  readonly authority: LineageCorrectionAuthority
  readonly setID: LineageCorrectionSetID
  readonly newArtifactID?: ArtifactID
  readonly memberIDs: readonly LineageCorrectionMemberID[]
  readonly timeCommitted: number
}

type ModelLineageMember = {
  readonly id: LineageCorrectionMemberID
  readonly recordedArtifactID: ArtifactID
  readonly lineageVersion: number
  readonly startAfterOrdinal: number
  readonly endAtOrdinal: number
  readonly boundary: LineageBoundary
  readonly outcomeArtifactID: ArtifactID
  readonly setTime: number
}

type PreparedLineageMember = ModelLineageMember & {
  readonly proposal: LineageMemberProposal
  readonly currentOwnerID?: ArtifactID
  readonly reachesCurrent: boolean
}

type ProjectionDraft = {
  readonly activeBindingID?: BindingID
  readonly currentRevisionID?: RevisionID
  readonly revisionAttributionMemberID?: LineageCorrectionMemberID
  readonly sourceStateObservationID?: ObservationID
  readonly sourceStateMemberID?: LineageCorrectionMemberID
  readonly descriptorObservationID?: ObservationID
  readonly descriptorCorrectionID?: ObservationCorrectionID
  readonly mediaType?: string
  readonly availability: Availability
}

type StateCandidate = {
  readonly artifactID: ArtifactID
  readonly boundary: LineageBoundary
  readonly orderTime: number
  readonly orderKind: number
  readonly orderID: string
}

function applyLineageCorrection(tx: Transaction, input: ApplyLineageInput) {
  return Effect.gen(function* () {
    if (input.memberIDs.length !== input.members.length) {
      return yield* new InvalidTransitionError({ detail: "Lineage member identity allocation is incomplete" })
    }
    yield* requireTime(input.timeCommitted, "Lineage correction commit time")
    const root = yield* requireArtifactRow(tx, input.admissionRootArtifactID)
    if (root.admission_root_artifact_id !== root.id) {
      return yield* new InvalidTransitionError({ detail: "Correction root must be an independent admission root" })
    }

    const artifactRows = yield* tx
      .select()
      .from(ArtifactTable)
      .where(eq(ArtifactTable.admission_root_artifact_id, root.id))
      .orderBy(asc(ArtifactTable.id))
      .all()
      .pipe(Effect.orDie)
    const artifactByID = new Map(artifactRows.map((artifact) => [artifact.id, artifact]))
    const infoRows = yield* Effect.forEach(artifactRows, (artifact) => getArtifactInfo(tx, artifact.id))
    const infoByID = new Map(infoRows.map((artifact) => [artifact.id, artifact]))

    const observationRows = yield* tx
      .select({ observation: ArtifactSourceObservationTable })
      .from(ArtifactSourceObservationTable)
      .innerJoin(ArtifactTable, eq(ArtifactTable.id, ArtifactSourceObservationTable.recorded_artifact_id))
      .where(eq(ArtifactTable.admission_root_artifact_id, root.id))
      .orderBy(
        asc(ArtifactSourceObservationTable.recorded_artifact_id),
        asc(ArtifactSourceObservationTable.occurrence_ordinal),
      )
      .all()
      .pipe(Effect.orDie)
    const observations = observationRows.map((row) => row.observation)
    const observationsByArtifact = new Map<ArtifactID, ObservationRow[]>()
    for (const observation of observations) {
      const history = observationsByArtifact.get(observation.recorded_artifact_id) ?? []
      history.push(observation)
      observationsByArtifact.set(observation.recorded_artifact_id, history)
    }

    const correctionRows = yield* tx
      .select({ correction: ArtifactObservationCorrectionTable })
      .from(ArtifactObservationCorrectionTable)
      .innerJoin(
        ArtifactSourceObservationTable,
        eq(ArtifactSourceObservationTable.id, ArtifactObservationCorrectionTable.observation_id),
      )
      .innerJoin(ArtifactTable, eq(ArtifactTable.id, ArtifactSourceObservationTable.recorded_artifact_id))
      .where(eq(ArtifactTable.admission_root_artifact_id, root.id))
      .orderBy(
        asc(ArtifactObservationCorrectionTable.observation_id),
        asc(ArtifactObservationCorrectionTable.correction_sequence),
      )
      .all()
      .pipe(Effect.orDie)
    const latestCorrectionByObservation = new Map<ObservationID, ObservationCorrectionRow>()
    for (const row of correctionRows) latestCorrectionByObservation.set(row.correction.observation_id, row.correction)

    const existingRows = yield* tx
      .select({ member: ArtifactLineageCorrectionMemberTable, set: ArtifactLineageCorrectionSetTable })
      .from(ArtifactLineageCorrectionMemberTable)
      .innerJoin(
        ArtifactLineageCorrectionSetTable,
        eq(ArtifactLineageCorrectionSetTable.id, ArtifactLineageCorrectionMemberTable.set_id),
      )
      .where(eq(ArtifactLineageCorrectionSetTable.admission_root_artifact_id, root.id))
      .all()
      .pipe(Effect.orDie)
    const existingMembers = existingRows.map((row) => modelLineageMember(row.member, row.set.time_committed))
    const existingByID = new Map(existingMembers.map((member) => [member.id, member]))

    const hasNewOutcome = input.members.some((member) => member.outcome.type === "new")
    if (hasNewOutcome !== input.createTarget || input.createTarget !== (input.newArtifactID !== undefined)) {
      return yield* new InvalidTransitionError({
        detail: hasNewOutcome ? "A new lineage outcome requires target creation" : "An unused new target is illegal",
      })
    }
    if (
      input.createTarget &&
      input.members.filter((member) => member.outcome.type === "new" && member.projectOutcome).length !== 1
    ) {
      return yield* new InvalidTransitionError({
        detail: "A new correction target requires exactly one projected outcome member",
      })
    }

    yield* validateLineageMemberShapes(input.members)
    yield* validateSameSetOverlap(input.members)

    const prepared = yield* Effect.forEach(input.members, (proposal, index) =>
      Effect.gen(function* () {
        const recorded =
          artifactByID.get(proposal.recordedArtifactID) ?? (yield* requireArtifactRow(tx, proposal.recordedArtifactID))
        if (recorded.admission_root_artifact_id !== root.id) {
          return yield* new InvalidTransitionError({ detail: "Lineage members must share one admission root" })
        }
        if (recorded.lineage_version !== proposal.expectedLineageVersion) {
          return yield* lineageConflict(recorded)
        }
        const history = observationsByArtifact.get(recorded.id) ?? []
        const latestOrdinal = history.at(-1)?.occurrence_ordinal ?? 0
        if (
          proposal.endAtOrdinal > latestOrdinal ||
          (proposal.startAfterOrdinal === proposal.endAtOrdinal && proposal.endAtOrdinal === 0)
        ) {
          return yield* new InvalidTransitionError({
            detail: "Lineage interval is outside recorded Observation history",
          })
        }

        const expectedMember =
          proposal.expectedWinningAttribution.type === "lineage_correction"
            ? existingByID.get(proposal.expectedWinningAttribution.memberID)
            : undefined
        if (proposal.expectedWinningAttribution.type === "lineage_correction" && !expectedMember) {
          return yield* new NotFoundError({
            entity: "lineage_correction_member",
            id: proposal.expectedWinningAttribution.memberID,
          })
        }

        if (proposal.startAfterOrdinal < proposal.endAtOrdinal) {
          const covered = history.filter(
            (observation) =>
              observation.occurrence_ordinal > proposal.startAfterOrdinal &&
              observation.occurrence_ordinal <= proposal.endAtOrdinal,
          )
          if (
            covered.length !== proposal.endAtOrdinal - proposal.startAfterOrdinal ||
            covered.some(
              (observation) =>
                !equalAttribution(
                  attributionForWinner(
                    winningModelMemberAtObservation(existingMembers, recorded.id, observation.occurrence_ordinal),
                  ),
                  proposal.expectedWinningAttribution,
                ),
            )
          ) {
            return yield* new InvalidTransitionError({
              detail: "Lineage interval crosses an attribution boundary or has ambiguous Observation coverage",
            })
          }
        } else if (
          !equalAttribution(
            attributionForWinner(winningModelMemberAtBoundary(existingMembers, recorded.id, proposal.endAtOrdinal)),
            proposal.expectedWinningAttribution,
          )
        ) {
          return yield* new InvalidTransitionError({ detail: "Empty lineage boundary has a stale winning basis" })
        }

        const currentOwnerID = ownerForAttribution(recorded.id, proposal.expectedWinningAttribution, existingByID)
        const currentOwner = infoByID.get(currentOwnerID)
        if (!currentOwner) return yield* new NotFoundError({ entity: "artifact", id: currentOwnerID })
        const latestObservation = history.at(-1)
        const reachesCurrent =
          proposal.endAtOrdinal === latestOrdinal &&
          controlsCurrentSource(currentOwner, proposal.expectedWinningAttribution, latestObservation)
        const boundaryCandidates = [
          yield* rawHistoryBoundary(
            history,
            proposal.endAtOrdinal,
            proposal.expectedWinningAttribution,
            latestCorrectionByObservation,
          ),
          expectedMember ? effectiveMemberBoundary(expectedMember) : undefined,
          reachesCurrent ? currentBoundary(currentOwner) : undefined,
        ].filter((boundary): boundary is LineageBoundary => boundary !== undefined)
        if (!boundaryCandidates.some((boundary) => equalBoundary(boundary, proposal.boundary))) {
          return yield* sourceConflict(currentOwner)
        }

        const outcomeArtifactID = yield* resolveLineageOutcome(
          tx,
          proposal.outcome,
          recorded.id,
          input.newArtifactID,
          artifactByID,
          root.id,
        )
        return {
          id: input.memberIDs[index],
          proposal,
          recordedArtifactID: recorded.id,
          lineageVersion: proposal.expectedLineageVersion + 1,
          startAfterOrdinal: proposal.startAfterOrdinal,
          endAtOrdinal: proposal.endAtOrdinal,
          boundary: proposal.boundary,
          outcomeArtifactID,
          setTime: input.timeCommitted,
          currentOwnerID: reachesCurrent ? currentOwnerID : undefined,
          reachesCurrent,
        } satisfies PreparedLineageMember
      }),
    )

    if (prepared.some((member) => member.reachesCurrent && !member.proposal.projectOutcome)) {
      return yield* new InvalidTransitionError({
        detail: "A current-reaching lineage member must project its outcome",
      })
    }
    const projected = prepared.filter((member) => member.proposal.projectOutcome)
    if (new Set(projected.map((member) => member.outcomeArtifactID)).size !== projected.length) {
      return yield* new InvalidTransitionError({ detail: "Only one member may project one outcome Artifact" })
    }
    const closingOwners = new Map<ArtifactID, PreparedLineageMember>()
    for (const member of prepared.filter(
      (candidate) => candidate.reachesCurrent && candidate.currentOwnerID !== candidate.outcomeArtifactID,
    )) {
      if (closingOwners.has(member.currentOwnerID!)) {
        return yield* new InvalidTransitionError({ detail: "One current Artifact cannot transfer two bindings" })
      }
      closingOwners.set(member.currentOwnerID!, member)
    }

    for (const member of projected) {
      if (!member.reachesCurrent && member.outcomeArtifactID !== input.newArtifactID) {
        const target = infoByID.get(member.outcomeArtifactID)!
        if (target.source.activeBinding && !closingOwners.has(target.id)) {
          return yield* new InvalidTransitionError({
            detail: "A historical lineage member cannot replace an unrelated active projection",
          })
        }
      }
      if (member.reachesCurrent && member.currentOwnerID !== member.outcomeArtifactID) {
        const target = infoByID.get(member.outcomeArtifactID)
        if (target?.source.activeBinding && !closingOwners.has(target.id)) {
          return yield* new InvalidTransitionError({ detail: "Lineage transfer target already has an active binding" })
        }
      }
    }

    const modelMembers = [...existingMembers, ...prepared]
    const ownersWithHistory = effectiveHistoryOwners(observations, modelMembers)
    if (input.newArtifactID && !ownersWithHistory.has(input.newArtifactID)) {
      return yield* new InvalidTransitionError({ detail: "New lineage target has no effective source history" })
    }

    const drafts = new Map<ArtifactID, ProjectionDraft>()
    for (const [ownerID] of closingOwners) {
      drafts.set(
        ownerID,
        fallbackProjection(bestStateCandidate(ownerID, observations, modelMembers, latestCorrectionByObservation)),
      )
    }

    const incomingBindings = new Map<
      ArtifactID,
      { readonly id: BindingID; readonly location: string; readonly memberID: LineageCorrectionMemberID }
    >()
    for (const member of projected) {
      const currentOwner = member.currentOwnerID ? infoByID.get(member.currentOwnerID) : undefined
      const transfersBinding =
        member.reachesCurrent &&
        currentOwner?.source.activeBinding !== undefined &&
        member.boundary.availability !== "unbound"
      const keepsBinding = transfersBinding && member.currentOwnerID === member.outcomeArtifactID
      const bindingID = keepsBinding
        ? currentOwner.source.activeBinding.id
        : transfersBinding
          ? createBindingID()
          : undefined
      if (transfersBinding && !keepsBinding) {
        incomingBindings.set(member.outcomeArtifactID, {
          id: bindingID!,
          location: currentOwner.source.activeBinding.location,
          memberID: member.id,
        })
      }
      drafts.set(member.outcomeArtifactID, projectedMemberState(member, bindingID, transfersBinding))
    }

    const desiredHidden = new Map<ArtifactID, boolean>()
    for (const artifact of artifactRows) {
      const hidden = !ownersWithHistory.has(artifact.id)
      desiredHidden.set(artifact.id, hidden)
      if (hidden && !artifact.correction_hidden && !drafts.has(artifact.id)) {
        drafts.set(artifact.id, emptyProjection())
      }
      if (!hidden && artifact.correction_hidden && !drafts.has(artifact.id)) {
        return yield* new InvalidTransitionError({
          detail: "Restoring a correction-hidden Artifact requires one exact projected member",
        })
      }
    }

    const changedExistingIDs = new Set<ArtifactID>()
    for (const artifactID of drafts.keys()) if (artifactID !== input.newArtifactID) changedExistingIDs.add(artifactID)
    for (const artifact of artifactRows) {
      if (artifact.correction_hidden !== desiredHidden.get(artifact.id)) changedExistingIDs.add(artifact.id)
    }
    const changedExisting = [...changedExistingIDs]
      .sort((left, right) => left.localeCompare(right))
      .map((artifactID) => infoByID.get(artifactID)!)
    yield* requireExpectedSet(input.expectedArtifacts, changedExisting)

    yield* tx
      .insert(ArtifactLineageCorrectionSetTable)
      .values({
        id: input.setID,
        admission_root_artifact_id: root.id,
        basis: input.authority.basis,
        capability_identity: input.authority.capabilityIdentity,
        capability_version: input.authority.capabilityVersion,
        time_committed: input.timeCommitted,
      })
      .run()
      .pipe(Effect.orDie)
    if (input.newArtifactID) {
      yield* tx
        .insert(ArtifactTable)
        .values({
          id: input.newArtifactID,
          admission_root_artifact_id: root.id,
          creation_basis: "lineage_correction",
          disposition_version: 0,
          lineage_version: 0,
          correction_hidden: false,
          time_created: input.timeCommitted,
          time_updated: input.timeCommitted,
        })
        .run()
        .pipe(Effect.orDie)
      yield* tx
        .update(ArtifactLineageCorrectionSetTable)
        .set({ new_artifact_id: input.newArtifactID })
        .where(eq(ArtifactLineageCorrectionSetTable.id, input.setID))
        .run()
        .pipe(Effect.orDie)
    }

    yield* tx
      .insert(ArtifactLineageCorrectionMemberTable)
      .values(
        prepared.map((member) => ({
          id: member.id,
          set_id: input.setID,
          recorded_artifact_id: member.recordedArtifactID,
          lineage_version: member.lineageVersion,
          start_after_ordinal: member.startAfterOrdinal,
          end_at_ordinal: member.endAtOrdinal,
          time_effective: member.proposal.timeEffective,
          expected_winning_member_id:
            member.proposal.expectedWinningAttribution.type === "lineage_correction"
              ? member.proposal.expectedWinningAttribution.memberID
              : undefined,
          boundary_binding_id: member.boundary.bindingID,
          boundary_observation_id:
            member.boundary.sourceStateBasis?.type === "observation"
              ? member.boundary.sourceStateBasis.observationID
              : undefined,
          boundary_source_member_id:
            member.boundary.sourceStateBasis?.type === "lineage_correction"
              ? member.boundary.sourceStateBasis.memberID
              : undefined,
          boundary_revision_id: member.boundary.revisionID,
          boundary_revision_attribution_member_id:
            member.boundary.revisionAttribution?.type === "lineage_correction"
              ? member.boundary.revisionAttribution.memberID
              : undefined,
          boundary_descriptor_observation_id: member.boundary.descriptor?.observationID,
          boundary_descriptor_correction_id: member.boundary.descriptor?.correctionID,
          boundary_media_type: member.boundary.descriptor?.mediaType,
          boundary_availability: member.boundary.availability,
          outcome_kind: member.proposal.outcome.type === "recorded" ? ("recorded" as const) : ("artifact" as const),
          outcome_artifact_id: member.proposal.outcome.type === "recorded" ? undefined : member.outcomeArtifactID,
        })),
      )
      .run()
      .pipe(Effect.orDie)

    const touchedHistories = [...new Set(prepared.map((member) => member.recordedArtifactID))]
    for (const artifactID of touchedHistories) {
      const artifact = artifactByID.get(artifactID)!
      const updated = yield* tx
        .update(ArtifactTable)
        .set({ lineage_version: sql`${ArtifactTable.lineage_version} + 1`, time_updated: input.timeCommitted })
        .where(and(eq(ArtifactTable.id, artifact.id), eq(ArtifactTable.lineage_version, artifact.lineage_version)))
        .returning({ id: ArtifactTable.id })
        .get()
        .pipe(Effect.orDie)
      if (!updated) return yield* lineageConflict(artifact)
    }

    for (const [ownerID] of closingOwners) {
      const owner = infoByID.get(ownerID)!
      const binding = owner.source.activeBinding
      if (!binding) continue
      const closed = yield* tx
        .update(ArtifactSourceBindingTable)
        .set({ time_ended: input.timeCommitted, end_reason: "lineage_correction" })
        .where(
          and(
            eq(ArtifactSourceBindingTable.id, binding.id),
            eq(ArtifactSourceBindingTable.recorded_artifact_id, owner.id),
            isNull(ArtifactSourceBindingTable.time_ended),
          ),
        )
        .returning({ id: ArtifactSourceBindingTable.id })
        .get()
        .pipe(Effect.orDie)
      if (!closed) return yield* sourceConflict(owner)
    }

    for (const [artifactID, binding] of incomingBindings) {
      yield* tx
        .insert(ArtifactSourceBindingTable)
        .values({
          id: binding.id,
          recorded_artifact_id: artifactID,
          binding_ordinal: yield* nextBindingOrdinal(tx, artifactID),
          canonical_location: binding.location,
          basis_kind: "lineage_correction",
          basis_lineage_member_id: binding.memberID,
          time_started: input.timeCommitted,
        })
        .run()
        .pipe(Effect.orDie)
    }

    for (const [artifactID, draft] of drafts) {
      if (artifactID === input.newArtifactID) {
        yield* tx
          .insert(ArtifactCurrentSourceTable)
          .values(currentSourceInsert(artifactID, draft, 0, input.timeCommitted))
          .run()
          .pipe(Effect.orDie)
        continue
      }
      const current = infoByID.get(artifactID)!
      const updated = yield* tx
        .update(ArtifactCurrentSourceTable)
        .set({
          ...currentSourceValues(draft, input.timeCommitted),
          source_version: sql`${ArtifactCurrentSourceTable.source_version} + 1`,
        })
        .where(
          and(
            eq(ArtifactCurrentSourceTable.artifact_id, artifactID),
            eq(ArtifactCurrentSourceTable.source_version, current.source.sourceVersion),
          ),
        )
        .returning({ id: ArtifactCurrentSourceTable.artifact_id })
        .get()
        .pipe(Effect.orDie)
      if (!updated) return yield* sourceConflict(current)
    }

    for (const artifact of artifactRows) {
      const hidden = desiredHidden.get(artifact.id)!
      if (hidden === artifact.correction_hidden) continue
      const updated = yield* tx
        .update(ArtifactTable)
        .set({
          correction_hidden: hidden,
          disposition_version: sql`${ArtifactTable.disposition_version} + 1`,
          time_updated: input.timeCommitted,
        })
        .where(
          and(eq(ArtifactTable.id, artifact.id), eq(ArtifactTable.disposition_version, artifact.disposition_version)),
        )
        .returning({ id: ArtifactTable.id })
        .get()
        .pipe(Effect.orDie)
      if (!updated) return yield* artifactConflict(artifact)
    }

    if (changedExistingIDs.size > 0) {
      yield* tx
        .update(ArtifactTable)
        .set({ time_updated: input.timeCommitted })
        .where(inArray(ArtifactTable.id, [...changedExistingIDs]))
        .run()
        .pipe(Effect.orDie)
    }

    const committedSet = yield* tx
      .select()
      .from(ArtifactLineageCorrectionSetTable)
      .where(eq(ArtifactLineageCorrectionSetTable.id, input.setID))
      .get()
      .pipe(Effect.orDie)
    const committedMembers = yield* tx
      .select()
      .from(ArtifactLineageCorrectionMemberTable)
      .where(eq(ArtifactLineageCorrectionMemberTable.set_id, input.setID))
      .orderBy(asc(ArtifactLineageCorrectionMemberTable.id))
      .all()
      .pipe(Effect.orDie)
    return {
      setID: input.setID,
      newArtifact: input.newArtifactID ? yield* getArtifactInfo(tx, input.newArtifactID) : undefined,
      affectedArtifacts: yield* Effect.forEach(
        [...changedExistingIDs].sort((left, right) => left.localeCompare(right)),
        (artifactID) => getArtifactInfo(tx, artifactID),
      ),
      members: committedMembers.map((member) => lineageMemberInfo(member, committedSet!)),
    }
  })
}

function modelLineageMember(member: LineageMemberRow, setTime: number): ModelLineageMember {
  return {
    id: member.id,
    recordedArtifactID: member.recorded_artifact_id,
    lineageVersion: member.lineage_version,
    startAfterOrdinal: member.start_after_ordinal,
    endAtOrdinal: member.end_at_ordinal,
    boundary: lineageBoundaryFromRow(member),
    outcomeArtifactID: member.outcome_kind === "recorded" ? member.recorded_artifact_id : member.outcome_artifact_id!,
    setTime,
  }
}

function lineageBoundaryFromRow(member: LineageMemberRow): LineageBoundary {
  return {
    bindingID: member.boundary_binding_id ?? undefined,
    sourceStateBasis: member.boundary_observation_id
      ? { type: "observation", observationID: member.boundary_observation_id }
      : member.boundary_source_member_id
        ? { type: "lineage_correction", memberID: member.boundary_source_member_id }
        : undefined,
    revisionID: member.boundary_revision_id ?? undefined,
    revisionAttribution: member.boundary_revision_id
      ? member.boundary_revision_attribution_member_id
        ? { type: "lineage_correction", memberID: member.boundary_revision_attribution_member_id }
        : { type: "recorded" }
      : undefined,
    descriptor:
      member.boundary_descriptor_observation_id && member.boundary_media_type
        ? {
            observationID: member.boundary_descriptor_observation_id,
            correctionID: member.boundary_descriptor_correction_id ?? undefined,
            mediaType: member.boundary_media_type,
          }
        : undefined,
    availability: member.boundary_availability,
  }
}

function validateLineageMemberShapes(members: readonly LineageMemberProposal[]) {
  return Effect.forEach(
    members,
    (member) =>
      Effect.gen(function* () {
        if (
          !Number.isSafeInteger(member.expectedLineageVersion) ||
          member.expectedLineageVersion < 0 ||
          !Number.isSafeInteger(member.startAfterOrdinal) ||
          !Number.isSafeInteger(member.endAtOrdinal) ||
          member.startAfterOrdinal < 0 ||
          member.endAtOrdinal < member.startAfterOrdinal
        ) {
          return yield* new InvalidTransitionError({ detail: "Lineage interval and version must be exact integers" })
        }
        yield* requireTime(member.timeEffective, "Lineage effective time")
        if (
          !member.boundary.revisionID ||
          !member.boundary.revisionAttribution ||
          !member.boundary.sourceStateBasis ||
          !member.boundary.descriptor
        ) {
          return yield* new InvalidTransitionError({
            detail: "Lineage member requires one exact non-empty boundary state",
          })
        }
        yield* requireMediaType(member.boundary.descriptor.mediaType)
        if (
          (member.boundary.availability === "unbound" && member.boundary.bindingID) ||
          (member.boundary.availability !== "unbound" && !member.boundary.bindingID)
        ) {
          return yield* new InvalidTransitionError({ detail: "Lineage boundary binding and availability disagree" })
        }
        return undefined
      }),
    { discard: true },
  )
}

function validateSameSetOverlap(members: readonly LineageMemberProposal[]) {
  for (let leftIndex = 0; leftIndex < members.length; leftIndex++) {
    const left = members[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex++) {
      const right = members[rightIndex]
      if (left.recordedArtifactID !== right.recordedArtifactID) continue
      const leftEmpty = left.startAfterOrdinal === left.endAtOrdinal
      const rightEmpty = right.startAfterOrdinal === right.endAtOrdinal
      const overlaps =
        leftEmpty && rightEmpty
          ? left.endAtOrdinal === right.endAtOrdinal
          : !leftEmpty && !rightEmpty
            ? Math.max(left.startAfterOrdinal, right.startAfterOrdinal) <
              Math.min(left.endAtOrdinal, right.endAtOrdinal)
            : false
      if (overlaps) {
        return Effect.fail(new InvalidTransitionError({ detail: "Lineage members overlap within one source history" }))
      }
    }
  }
  return Effect.void
}

function resolveLineageOutcome(
  source: Queryable,
  outcome: LineageOutcome,
  recordedArtifactID: ArtifactID,
  newArtifactID: ArtifactID | undefined,
  artifactByID: ReadonlyMap<ArtifactID, ArtifactRow>,
  rootID: ArtifactID,
) {
  return Effect.gen(function* () {
    if (outcome.type === "recorded") return recordedArtifactID
    if (outcome.type === "new") {
      if (newArtifactID) return newArtifactID
      return yield* new InvalidTransitionError({ detail: "New lineage outcome has no target" })
    }
    const target = artifactByID.get(outcome.artifactID) ?? (yield* requireArtifactRow(source, outcome.artifactID))
    if (target.admission_root_artifact_id !== rootID) {
      return yield* new InvalidTransitionError({ detail: "Lineage target is outside exact correction ancestry" })
    }
    return target.id
  })
}

function ownerForAttribution(
  recordedArtifactID: ArtifactID,
  attribution: AttributionBasis,
  existingByID: ReadonlyMap<LineageCorrectionMemberID, ModelLineageMember>,
) {
  if (attribution.type === "recorded") return recordedArtifactID
  return existingByID.get(attribution.memberID)!.outcomeArtifactID
}

function winningModelMemberAtObservation(
  members: readonly ModelLineageMember[],
  artifactID: ArtifactID,
  ordinal: number,
) {
  return members
    .filter(
      (member) =>
        member.recordedArtifactID === artifactID &&
        member.startAfterOrdinal < member.endAtOrdinal &&
        member.startAfterOrdinal < ordinal &&
        member.endAtOrdinal >= ordinal,
    )
    .sort(compareModelMembers)
    .at(0)
}

function winningModelMemberAtBoundary(members: readonly ModelLineageMember[], artifactID: ArtifactID, ordinal: number) {
  return members
    .filter(
      (member) =>
        member.recordedArtifactID === artifactID &&
        ((member.startAfterOrdinal < member.endAtOrdinal &&
          member.startAfterOrdinal < ordinal &&
          member.endAtOrdinal >= ordinal) ||
          (member.startAfterOrdinal === member.endAtOrdinal && member.endAtOrdinal === ordinal)),
    )
    .sort(compareModelMembers)
    .at(0)
}

function compareModelMembers(left: ModelLineageMember, right: ModelLineageMember) {
  if (left.lineageVersion !== right.lineageVersion) return right.lineageVersion - left.lineageVersion
  return right.id.localeCompare(left.id)
}

function attributionForWinner(member: ModelLineageMember | undefined): AttributionBasis {
  return member ? { type: "lineage_correction", memberID: member.id } : { type: "recorded" }
}

function controlsCurrentSource(
  current: ArtifactInfo,
  attribution: AttributionBasis,
  latestObservation: ObservationRow | undefined,
) {
  if (attribution.type === "recorded") {
    return (
      latestObservation !== undefined &&
      current.id === latestObservation.recorded_artifact_id &&
      current.source.sourceStateBasis?.type === "observation" &&
      current.source.sourceStateBasis.observationID === latestObservation.id
    )
  }
  return (
    current.source.sourceStateBasis?.type === "lineage_correction" &&
    current.source.sourceStateBasis.memberID === attribution.memberID
  )
}

function revisionAttributionForObservation(observation: ObservationRow): AttributionBasis {
  return observation.revision_attribution_member_id
    ? { type: "lineage_correction", memberID: observation.revision_attribution_member_id }
    : { type: "recorded" }
}

function rawHistoryBoundary(
  observations: readonly ObservationRow[],
  ordinal: number,
  attribution: AttributionBasis,
  corrections: ReadonlyMap<ObservationID, ObservationCorrectionRow>,
) {
  return Effect.gen(function* () {
    const state = observations.find((observation) => observation.occurrence_ordinal === ordinal)
    if (!state) return yield* new InvalidTransitionError({ detail: "Lineage boundary Observation does not exist" })
    const present = observations
      .filter((observation) => observation.occurrence_ordinal <= ordinal && observation.result === "present")
      .at(-1)
    if (!present?.revision_id || !present.media_type) {
      return yield* new InvalidTransitionError({ detail: "Lineage boundary has no exact Revision state" })
    }
    const correction = corrections.get(present.id)
    return {
      bindingID: state.binding_id,
      sourceStateBasis: { type: "observation", observationID: state.id },
      revisionID: present.revision_id,
      revisionAttribution:
        attribution.type === "lineage_correction" ? attribution : revisionAttributionForObservation(present),
      descriptor: {
        observationID: present.id,
        correctionID: correction?.id,
        mediaType: correction?.media_type ?? present.media_type,
      },
      availability: state.result === "present" ? "available" : "missing",
    } satisfies LineageBoundary
  })
}

function currentBoundary(artifact: ArtifactInfo): LineageBoundary {
  return {
    bindingID: artifact.source.activeBinding?.id,
    sourceStateBasis: artifact.source.sourceStateBasis,
    revisionID: artifact.source.currentRevisionID,
    revisionAttribution: artifact.source.revisionAttribution,
    descriptor: artifact.source.descriptor,
    availability: artifact.source.availability,
  }
}

function effectiveMemberBoundary(member: ModelLineageMember): LineageBoundary {
  return {
    ...member.boundary,
    sourceStateBasis: { type: "lineage_correction", memberID: member.id },
    revisionAttribution: member.boundary.revisionID ? { type: "lineage_correction", memberID: member.id } : undefined,
  }
}

function equalBoundary(left: LineageBoundary, right: LineageBoundary) {
  return (
    left.bindingID === right.bindingID &&
    left.revisionID === right.revisionID &&
    equalOptionalAttribution(left.revisionAttribution, right.revisionAttribution) &&
    equalOptionalSourceState(left.sourceStateBasis, right.sourceStateBasis) &&
    left.descriptor?.observationID === right.descriptor?.observationID &&
    left.descriptor?.correctionID === right.descriptor?.correctionID &&
    left.descriptor?.mediaType === right.descriptor?.mediaType &&
    left.availability === right.availability
  )
}

function effectiveHistoryOwners(observations: readonly ObservationRow[], members: readonly ModelLineageMember[]) {
  const owners = new Set<ArtifactID>()
  for (const observation of observations) {
    if (observation.result !== "present") continue
    const winner = winningModelMemberAtObservation(
      members,
      observation.recorded_artifact_id,
      observation.occurrence_ordinal,
    )
    owners.add(winner?.outcomeArtifactID ?? observation.recorded_artifact_id)
  }
  for (const member of members) {
    if (!member.boundary.revisionID) continue
    if (winningModelMemberAtBoundary(members, member.recordedArtifactID, member.endAtOrdinal)?.id === member.id) {
      owners.add(member.outcomeArtifactID)
    }
  }
  return owners
}

function bestStateCandidate(
  artifactID: ArtifactID,
  observations: readonly ObservationRow[],
  members: readonly ModelLineageMember[],
  corrections: ReadonlyMap<ObservationID, ObservationCorrectionRow>,
) {
  const candidates: StateCandidate[] = []
  const byArtifact = new Map<ArtifactID, ObservationRow[]>()
  for (const observation of observations) {
    const history = byArtifact.get(observation.recorded_artifact_id) ?? []
    history.push(observation)
    byArtifact.set(observation.recorded_artifact_id, history)
  }
  for (const observation of observations) {
    if (observation.result !== "present") continue
    if (winningModelMemberAtObservation(members, observation.recorded_artifact_id, observation.occurrence_ordinal)) {
      continue
    }
    if (observation.recorded_artifact_id !== artifactID) continue
    const correction = corrections.get(observation.id)
    candidates.push({
      artifactID,
      boundary: {
        bindingID: observation.binding_id,
        sourceStateBasis: { type: "observation", observationID: observation.id },
        revisionID: observation.revision_id!,
        revisionAttribution: revisionAttributionForObservation(observation),
        descriptor: {
          observationID: observation.id,
          correctionID: correction?.id,
          mediaType: correction?.media_type ?? observation.media_type!,
        },
        availability: "available",
      },
      orderTime: observation.time_committed,
      orderKind: 0,
      orderID: observation.id,
    })
  }
  for (const member of members) {
    if (!member.boundary.revisionID || member.outcomeArtifactID !== artifactID) continue
    if (winningModelMemberAtBoundary(members, member.recordedArtifactID, member.endAtOrdinal)?.id !== member.id) {
      continue
    }
    candidates.push({
      artifactID,
      boundary: effectiveMemberBoundary(member),
      orderTime: member.setTime,
      orderKind: 1,
      orderID: member.id,
    })
  }
  return candidates.sort((left, right) => {
    if (left.orderTime !== right.orderTime) return right.orderTime - left.orderTime
    if (left.orderKind !== right.orderKind) return right.orderKind - left.orderKind
    return right.orderID.localeCompare(left.orderID)
  })[0]
}

function fallbackProjection(candidate: StateCandidate | undefined): ProjectionDraft {
  if (!candidate?.boundary.revisionID || !candidate.boundary.descriptor) return emptyProjection()
  return {
    currentRevisionID: candidate.boundary.revisionID,
    revisionAttributionMemberID:
      candidate.boundary.revisionAttribution?.type === "lineage_correction"
        ? candidate.boundary.revisionAttribution.memberID
        : undefined,
    sourceStateObservationID:
      candidate.boundary.sourceStateBasis?.type === "observation"
        ? candidate.boundary.sourceStateBasis.observationID
        : undefined,
    sourceStateMemberID:
      candidate.boundary.sourceStateBasis?.type === "lineage_correction"
        ? candidate.boundary.sourceStateBasis.memberID
        : undefined,
    descriptorObservationID: candidate.boundary.descriptor.observationID,
    descriptorCorrectionID: candidate.boundary.descriptor.correctionID,
    mediaType: candidate.boundary.descriptor.mediaType,
    availability: "unbound",
  }
}

function projectedMemberState(
  member: PreparedLineageMember,
  bindingID: BindingID | undefined,
  transfersBinding: boolean,
): ProjectionDraft {
  return {
    activeBindingID: bindingID,
    currentRevisionID: member.boundary.revisionID,
    revisionAttributionMemberID: member.id,
    sourceStateMemberID: member.id,
    descriptorObservationID: member.boundary.descriptor!.observationID,
    descriptorCorrectionID: member.boundary.descriptor!.correctionID,
    mediaType: member.boundary.descriptor!.mediaType,
    availability: transfersBinding ? member.boundary.availability : "unbound",
  }
}

function emptyProjection(): ProjectionDraft {
  return { availability: "unbound" }
}

function currentSourceValues(draft: ProjectionDraft, time: number) {
  return {
    active_binding_id: draft.activeBindingID ?? null,
    current_revision_id: draft.currentRevisionID ?? null,
    revision_attribution_member_id: draft.revisionAttributionMemberID ?? null,
    source_state_observation_id: draft.sourceStateObservationID ?? null,
    source_state_member_id: draft.sourceStateMemberID ?? null,
    descriptor_observation_id: draft.descriptorObservationID ?? null,
    descriptor_correction_id: draft.descriptorCorrectionID ?? null,
    effective_media_type: draft.mediaType ?? null,
    availability: draft.availability,
    time_updated: time,
  }
}

function currentSourceInsert(artifactID: ArtifactID, draft: ProjectionDraft, version: number, time: number) {
  return {
    artifact_id: artifactID,
    source_version: version,
    ...currentSourceValues(draft, time),
  } satisfies typeof ArtifactCurrentSourceTable.$inferInsert
}

function lineageConflict(current: ArtifactRow) {
  return Effect.fail(
    new ConflictError({
      entity: "lineage",
      id: current.id,
      currentDispositionVersion: current.disposition_version,
      currentLineageVersion: current.lineage_version,
    }),
  )
}

function requireObservation(input: SourceObservation) {
  return Effect.gen(function* () {
    yield* requireObserver(input.observer)
    yield* requireTime(input.timeObserved, "Observation time")
    if (input.result === "missing") return input
    return yield* requirePresentObservation(input)
  })
}

function requirePresentObservation(input: PresentObservation) {
  return Effect.gen(function* () {
    if (input.result !== "present") {
      return yield* new InvalidTransitionError({ detail: "A present Observation is required" })
    }
    const fingerprint = yield* requireFingerprint(input.fingerprint)
    const mediaType = yield* requireMediaType(input.mediaType)
    const observer = yield* requireObserver(input.observer)
    const timeObserved = yield* requireTime(input.timeObserved, "Observation time")
    return { result: "present" as const, fingerprint, mediaType, observer, timeObserved }
  })
}

function pageResult<T>(
  items: T[],
  hasMore: boolean,
  scope: ArtifactCursor.Scope,
  key: (item: T) => readonly (string | number)[],
): Page<T> {
  const last = items.at(-1)
  return { items, cursor: hasMore && last ? ArtifactCursor.next(scope, key(last)) : undefined }
}

function twoPartKey(input: readonly (string | number)[] | undefined, first: "number", second: "string") {
  if (!input) return Effect.succeed(undefined)
  if (
    first === "number" &&
    second === "string" &&
    input.length === 2 &&
    typeof input[0] === "number" &&
    typeof input[1] === "string"
  ) {
    return Effect.succeed([input[0], input[1]] as const)
  }
  return Effect.fail(new InvalidCursorError({ detail: "Cursor key does not match this endpoint" }))
}

function threePartStringKey(input: readonly (string | number)[] | undefined) {
  if (!input) return Effect.succeed(undefined)
  if (
    input.length === 3 &&
    typeof input[0] === "number" &&
    typeof input[1] === "string" &&
    typeof input[2] === "string"
  ) {
    return Effect.succeed([input[0], input[1], input[2]] as const)
  }
  return Effect.fail(new InvalidCursorError({ detail: "Cursor key does not match this endpoint" }))
}

function threePartNumberKey(input: readonly (string | number)[] | undefined) {
  if (!input) return Effect.succeed(undefined)
  if (
    input.length === 3 &&
    typeof input[0] === "number" &&
    typeof input[1] === "number" &&
    typeof input[2] === "string"
  ) {
    return Effect.succeed([input[0], input[1], input[2]] as const)
  }
  return Effect.fail(new InvalidCursorError({ detail: "Cursor key does not match this endpoint" }))
}
