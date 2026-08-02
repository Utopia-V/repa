export * as MaterialMap from "./material-map"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { and, asc, count, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm"
import { Cause, Context, Effect, Layer, Scope } from "effect"
import { Artifact } from "./artifact"
import { ContentRoot } from "./content-root"
import { ContentRootNTFS } from "./content-root/ntfs"
import { Course } from "./course"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { LearningFrontier } from "./learning-frontier"
import { MaterialMapCursor } from "./material-map/cursor"
import {
  AlignmentDispositionEventID,
  AlignmentID,
  Authorship,
  ConflictError,
  DispositionEventID,
  InactiveError,
  InvalidCursorError,
  InvalidTransitionError,
  MapID,
  NotFoundError,
  OutlineNodeID,
  OutcomeUnknownError,
  PersistenceError,
  PreparationError,
  SelectorID,
  createAlignmentDispositionEventID,
  createDispositionEventID,
  type Error as DomainError,
  type Page,
  type PageOptions,
} from "./material-map/schema"
import { MaterialSelector } from "./material-map/selector"
import {
  MaterialCourseAlignmentDispositionEventTable,
  MaterialCourseAlignmentStateTable,
  MaterialCourseAlignmentTable,
  MaterialMapArtifactTargetTable,
  MaterialMapDispositionEventTable,
  MaterialMapRepresentationTargetTable,
  MaterialMapStateTable,
  MaterialMapTable,
  MaterialOutlineNodeTable,
  MaterialSelectorTable,
} from "./material-map/sql"
import { MaterialTarget } from "./material-map/target"
import type {
  AlignmentInfo,
  AlignmentProjection,
  AlignmentProposal,
  AlignmentStaleCause,
  ArtifactTargetReceipt,
  AuthorshipReceipt,
  DispositionEvent,
  ExactArtifactTargetReceipt,
  MapInfo,
  MapProposal,
  MapTarget,
  OutlineNodeInfo,
  RepresentationTargetReceipt,
  SelectorInfo,
  TargetReceipt,
} from "./material-map/types"
import { Representation } from "./representation"

export {
  AlignmentDispositionEventID,
  AlignmentID,
  Authorship,
  ConflictError,
  DispositionEventID,
  InactiveError,
  InvalidCursorError,
  InvalidTransitionError,
  MapID,
  NotFoundError,
  OutlineNodeID,
  OutcomeUnknownError,
  PersistenceError,
  PreparationError,
  SelectorID,
} from "./material-map/schema"
export { createAlignmentID, createMapID, createOutlineNodeID, createSelectorID } from "./material-map/schema"
export { MaterialSelector } from "./material-map/selector"
export { MaterialTarget } from "./material-map/target"
export type {
  AlignmentInfo,
  AlignmentProjection,
  AlignmentProposal,
  AlignmentStaleCause,
  ArtifactTargetReceipt,
  AuthorshipReceipt,
  DispositionEvent,
  ExactArtifactTargetReceipt,
  HistoricalArtifactTargetReceipt,
  MapInfo,
  MapProposal,
  MapTarget,
  OutlineNodeInfo,
  RepresentationTargetReceipt,
  SelectorInfo,
  TargetReceipt,
} from "./material-map/types"
export type { Page, PageOptions } from "./material-map/schema"

type DatabaseShape = EffectDrizzleSqlite.EffectSQLiteDatabase
export type Transaction = Parameters<Parameters<DatabaseShape["transaction"]>[0]>[0]
type Queryable = DatabaseShape | Transaction

export const limits = {
  nodes: 2_000,
  selectors: 10_000,
  depth: 16,
  titleCharacters: 500,
  reasonCharacters: 2_000,
  authorshipBasisCharacters: 2_000,
  capabilityIdentityCharacters: 500,
  canonicalInputBytes: 4 * 1024 * 1024,
} as const

export type Error = DomainError | Artifact.Error | ContentRoot.Error | Course.Error | Representation.Error

export type MapListOptions = PageOptions & {
  readonly target: MapTarget
  readonly includeWithdrawn?: boolean
  readonly includeSuperseded?: boolean
}

export type AlignmentListOptions = PageOptions & {
  readonly includeWithdrawn?: boolean
  readonly includeSuperseded?: boolean
}

export type LocalArtifactMapProposal = Readonly<{
  supersedesMapID?: MapID
  outline: MapProposal["outline"]
}>

export type MapOwnerReceipt = Readonly<{
  mapID: MapID
  canonicalInput: string
  dispositionVersion: number
  disposition: MapInfo["disposition"]["disposition"]
  superseded: boolean
}>

export type AlignmentOwnerReceipt = Readonly<{
  alignmentID: AlignmentID
  canonicalInput: string
  dispositionVersion: number
  disposition: AlignmentInfo["disposition"]["disposition"]
  superseded: boolean
}>

export type OutlineNodeSummary = Omit<OutlineNodeInfo, "selectors"> & Readonly<{ selectorCount: number }>

const ownerProofToken = Symbol("MaterialMap.OwnerProof")

export class MapOwnerProof {
  readonly receipt: MapOwnerReceipt
  #receipt: MapOwnerReceipt

  constructor(token: symbol, receipt: MapOwnerReceipt) {
    if (token !== ownerProofToken) throw new Error("Map-owner proofs are owner-issued")
    this.receipt = Object.freeze({ ...receipt })
    this.#receipt = this.receipt
  }

  expectation(token: symbol) {
    if (token !== ownerProofToken) return
    return this.#receipt
  }
}

export class AlignmentOwnerProof {
  readonly receipt: AlignmentOwnerReceipt
  #receipt: AlignmentOwnerReceipt

  constructor(token: symbol, receipt: AlignmentOwnerReceipt) {
    if (token !== ownerProofToken) throw new Error("Alignment-owner proofs are owner-issued")
    this.receipt = Object.freeze({ ...receipt })
    this.#receipt = this.receipt
  }

  expectation(token: symbol) {
    if (token !== ownerProofToken) return
    return this.#receipt
  }
}

export type SelectorResolution = {
  readonly map: MapInfo
  readonly selector: SelectorInfo
  readonly bytes: Uint8Array
  readonly witness: MaterialSelector.Witness
  readonly receipt: CurrentUseReceipt
}

type CurrentReceiptExpectation = {
  readonly mapID: MapID
  readonly selectorID: SelectorID
  readonly mapDispositionVersion: number
  readonly require: (tx: Transaction) => Effect.Effect<void, Error>
}

const currentReceiptToken = Symbol("MaterialMap.CurrentUseReceipt")

export class CurrentUseReceipt {
  #expectation: CurrentReceiptExpectation
  #consumed = false

  constructor(token: symbol, expectation: CurrentReceiptExpectation) {
    if (token !== currentReceiptToken) throw new Error("Material current-use receipts are owner-issued")
    this.#expectation = expectation
  }

  expectation(token: symbol, consume: boolean) {
    if (token !== currentReceiptToken || (consume && this.#consumed)) return
    if (consume) this.#consumed = true
    return this.#expectation
  }
}

export interface CurrentUseReaderInterface {
  readonly resolveSelector: (input: {
    readonly mapID: MapID
    readonly selectorID: SelectorID
    readonly access: MaterialTarget.TargetAccess
    readonly budgets: MaterialTarget.ReadBudgets
    readonly abort?: AbortSignal
  }) => Effect.Effect<SelectorResolution, Error>
}

export interface Interface {
  /** Prepare a Map through the same owner invariant used by standalone publication. */
  readonly prepareMapWrite: (input: {
    readonly mapID: MapID
    readonly proposal: MapProposal
    readonly authorship: Authorship
    readonly access: MaterialTarget.TargetAccess
    readonly budgets: MaterialTarget.ReadBudgets
    readonly abort?: AbortSignal
  }) => Effect.Effect<PreparedMapWrite, Error, Scope.Scope>
  /** Prepare a Map over the exact bytes of the sole local Artifact mutation arm. */
  readonly prepareLocalArtifactMapWrite: (input: {
    readonly mapID: MapID
    readonly proposal: LocalArtifactMapProposal
    readonly authorship: Authorship
    readonly mutation: Artifact.PreparedMutation
    readonly read: ContentRoot.PreparedLocalRead
  }) => Effect.Effect<PreparedMapWrite, Error>
  /** Prepare a Map over an exact already-admitted Artifact Revision through Gate 10's local-read union. */
  readonly prepareReferencedArtifactMapWrite: (input: {
    readonly mapID: MapID
    readonly proposal: LocalArtifactMapProposal
    readonly authorship: Authorship
    readonly reference: Artifact.RevisionReferenceProof
    readonly read: ContentRoot.PreparedLocalRead
  }) => Effect.Effect<PreparedMapWrite, Error>
  /** Publish one already prepared Map inside a caller-owned local transaction. */
  readonly commitMapInTransaction: (
    tx: Transaction,
    input: Readonly<{ prepared: PreparedMapWrite; time: number }>,
  ) => Effect.Effect<MapInfo, Error>
  /** Publish a neutral alignment to a Map created in the same caller transaction. */
  readonly alignPreparedMapInTransaction: (
    tx: Transaction,
    input: Readonly<{
      alignmentID: AlignmentID
      proposal: AlignmentProposal
      authorship: Authorship
      preparedMap: PreparedMapWrite
      membership: Course.MembershipProof
      time: number
    }>,
  ) => Effect.Effect<AlignmentInfo, Error>
  readonly createMap: (input: {
    readonly mapID: MapID
    readonly proposal: MapProposal
    readonly authorship: Authorship
    readonly access: MaterialTarget.TargetAccess
    readonly budgets: MaterialTarget.ReadBudgets
    readonly abort?: AbortSignal
  }) => Effect.Effect<MapInfo, Error>
  readonly getMap: (mapID: MapID) => Effect.Effect<MapInfo, Error>
  readonly listMaps: (options: MapListOptions) => Effect.Effect<Page<MapInfo>, Error>
  readonly listOutline: (mapID: MapID, options?: PageOptions) => Effect.Effect<Page<OutlineNodeInfo>, Error>
  readonly listOutlineNodes: (mapID: MapID, options?: PageOptions) => Effect.Effect<Page<OutlineNodeSummary>, Error>
  readonly listSelectors: (
    mapID: MapID,
    nodeID: OutlineNodeID,
    options?: PageOptions,
  ) => Effect.Effect<Page<SelectorInfo>, Error>
  readonly getSelector: (mapID: MapID, selectorID: SelectorID) => Effect.Effect<SelectorInfo, Error>
  readonly listMapSuccessors: (mapID: MapID, options?: PageOptions) => Effect.Effect<Page<MapInfo>, Error>
  readonly listMapDispositions: (mapID: MapID, options?: PageOptions) => Effect.Effect<Page<DispositionEvent>, Error>
  readonly withdrawMap: (input: {
    readonly mapID: MapID
    readonly expectedVersion: number
    readonly reason: string
  }) => Effect.Effect<MapInfo, Error>
  readonly restoreMap: (input: {
    readonly mapID: MapID
    readonly expectedVersion: number
  }) => Effect.Effect<MapInfo, Error>
  readonly createAlignment: (input: {
    readonly alignmentID: AlignmentID
    readonly proposal: AlignmentProposal
    readonly authorship: Authorship
    readonly access: MaterialTarget.TargetAccess
    readonly budgets: MaterialTarget.ReadBudgets
    readonly abort?: AbortSignal
  }) => Effect.Effect<AlignmentInfo, Error>
  readonly getAlignment: (alignmentID: AlignmentID) => Effect.Effect<AlignmentInfo, Error>
  readonly listAlignmentsForMap: (
    mapID: MapID,
    options?: AlignmentListOptions,
  ) => Effect.Effect<Page<AlignmentInfo>, Error>
  readonly listAlignmentsForSelector: (
    mapID: MapID,
    selectorID: SelectorID,
    options?: AlignmentListOptions,
  ) => Effect.Effect<Page<AlignmentInfo>, Error>
  readonly listAlignmentsForMembership: (
    endpoint: Course.MembershipEndpoint,
    options?: AlignmentListOptions,
  ) => Effect.Effect<Page<AlignmentInfo>, Error>
  readonly listAlignmentSuccessors: (
    alignmentID: AlignmentID,
    options?: PageOptions,
  ) => Effect.Effect<Page<AlignmentInfo>, Error>
  readonly listAlignmentDispositions: (
    alignmentID: AlignmentID,
    options?: PageOptions,
  ) => Effect.Effect<Page<DispositionEvent>, Error>
  readonly withdrawAlignment: (input: {
    readonly alignmentID: AlignmentID
    readonly expectedVersion: number
    readonly reason: string
  }) => Effect.Effect<AlignmentInfo, Error>
  readonly restoreAlignment: (input: {
    readonly alignmentID: AlignmentID
    readonly expectedVersion: number
  }) => Effect.Effect<AlignmentInfo, Error>
}

export class Service extends Context.Service<Service, Interface>()("@repa/MaterialMap") {}
export class CurrentUseReader extends Context.Service<CurrentUseReader, CurrentUseReaderInterface>()(
  "@repa/MaterialMap/CurrentUseReader",
) {}

const currentUseLayer = Layer.effect(
  CurrentUseReader,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const dependencies = yield* targetDependencies
    const resolveSelector: CurrentUseReaderInterface["resolveSelector"] = Effect.fn("MaterialMap.resolveSelector")(
      function* (input) {
        const prepared = yield* Effect.scoped(
          Effect.gen(function* () {
            const current = yield* snapshot(database.db, (tx) =>
              requireCurrentMapSelector(tx, input.mapID, input.selectorID),
            )
            const proof = yield* MaterialTarget.prepareSelector(dependencies, {
              mapID: current.map.id,
              mapDispositionVersion: current.map.disposition.version,
              target: current.map.target,
              selector: current.selector,
              access: input.access,
              budgets: input.budgets,
              abort: input.abort,
            })
            return { current, proof }
          }),
        )
        const finalized = yield* snapshot(database.db, (tx) =>
          Effect.gen(function* () {
            const current = yield* requireCurrentMapSelector(tx, input.mapID, input.selectorID)
            if (current.map.disposition.version !== prepared.current.map.disposition.version) {
              return yield* new ConflictError({
                entity: "map_state",
                id: input.mapID,
                detail: "Map disposition changed during current-use resolution",
              })
            }
            const expected = yield* MaterialTarget.requirePreparedSelector(tx, prepared.proof, {
              mapID: current.map.id,
              selectorID: current.selector.id,
              mapDispositionVersion: current.map.disposition.version,
            })
            if (!sameWitness(expected.selected.witness, current.selector.witness)) {
              return yield* new PreparationError({
                code: "witness_mismatch",
                detail: "The prepared selector witness no longer matches its immutable selector",
              })
            }
            return current
          }),
        )
        return {
          map: finalized.map,
          selector: finalized.selector,
          bytes: prepared.proof.bytes,
          witness: prepared.proof.witness,
          receipt: new CurrentUseReceipt(currentReceiptToken, {
            mapID: finalized.map.id,
            selectorID: finalized.selector.id,
            mapDispositionVersion: finalized.map.disposition.version,
            require: (tx) =>
              MaterialTarget.requirePreparedSelector(tx, prepared.proof, {
                mapID: finalized.map.id,
                selectorID: finalized.selector.id,
                mapDispositionVersion: finalized.map.disposition.version,
              }).pipe(Effect.asVoid),
          }),
        }
      },
    )
    return { resolveSelector }
  }),
)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const dependencies = yield* targetDependencies
    const courses = yield* Course.Service
    const currentReader = yield* CurrentUseReader
    const db = database.db

    const prepareMapWrite: Interface["prepareMapWrite"] = Effect.fn("MaterialMap.prepareMapWrite")(function* (input) {
      const normalized = yield* normalizeMap(input.mapID, input.proposal, input.authorship)
      const proof = yield* MaterialTarget.prepareMap(dependencies, {
        mapID: input.mapID,
        canonicalInput: normalized.canonicalInput,
        proposal: normalized.proposal,
        access: input.access,
        budgets: input.budgets,
        abort: input.abort,
      })
      return new PreparedMapWrite(
        preparedMapWriteToken,
        input.mapID,
        (tx, time, advanceFrontier) =>
          commitMap(tx, {
            mapID: input.mapID,
            proposal: normalized.proposal,
            authorship: normalized.authorship,
            canonicalInput: normalized.canonicalInput,
            proof,
            time,
            advanceFrontier,
          }).pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die)),
        (selectorID) =>
          MaterialTarget.preparedSelectorFromMap(proof, {
            mapID: input.mapID,
            selectorID,
            mapDispositionVersion: 0,
          }).pipe(
            Effect.map(
              (selectorProof) =>
                new CurrentUseReceipt(currentReceiptToken, {
                  mapID: input.mapID,
                  selectorID,
                  mapDispositionVersion: 0,
                  require: (tx) =>
                    MaterialTarget.requirePreparedSelector(tx, selectorProof, {
                      mapID: input.mapID,
                      selectorID,
                      mapDispositionVersion: 0,
                    }).pipe(Effect.asVoid),
                }),
            ),
          ),
      )
    })

    const prepareLocalArtifactMapWrite: Interface["prepareLocalArtifactMapWrite"] = Effect.fn(
      "MaterialMap.prepareLocalArtifactMapWrite",
    )(function* (input) {
      if (
        !(input.mutation instanceof Artifact.PreparedMutation) ||
        !(input.read instanceof ContentRoot.PreparedLocalRead)
      ) {
        return yield* new InvalidTransitionError({ detail: "Local Map preparation requires exact owner proofs" })
      }
      if (input.mutation.location.value !== input.read.observation.descriptor.canonicalPath) {
        return yield* new PreparationError({
          code: "source_provenance",
          detail: "Artifact mutation and Gate 10 read name different canonical locations",
        })
      }
      if (input.proposal.supersedesMapID === input.mapID) {
        return yield* new InvalidTransitionError({ detail: "A Map cannot supersede itself" })
      }
      const authorship = yield* requireAuthorship(input.authorship)
      const outline = yield* normalizeMapOutline("artifact", input.proposal.outline)
      const selections = yield* selectLocalArtifactOutline(outline, input.read.observation)
      const witnesses = new Map(Array.from(selections, ([id, selected]) => [id, selected.witness] as const))
      const committed = new WeakMap<object, ExactArtifactTargetReceipt>()
      const times = new WeakMap<object, number>()
      const resolve = (tx: Transaction, time: number) => {
        const cached = committed.get(tx)
        if (cached) return Effect.succeed(cached)
        return Effect.gen(function* () {
          yield* input.read.require(tx)
          const result = yield* input.mutation.commit(tx, time)
          const artifact = result.artifact
          const binding = artifact.source.activeBinding
          const attribution = artifact.source.revisionAttribution
          const descriptor = artifact.source.descriptor
          if (
            artifact.withdrawalReason ||
            artifact.correctionHidden ||
            artifact.source.availability !== "available" ||
            artifact.source.currentRevisionID !== result.revisionID ||
            !binding ||
            binding.location !== input.read.observation.descriptor.canonicalPath ||
            !attribution ||
            !descriptor
          ) {
            return yield* new PreparationError({
              code: "stale_target",
              detail: "The local Artifact result is not an exact eligible Map target",
            })
          }
          const receipt = {
            type: "artifact" as const,
            effectiveArtifactID: artifact.id,
            revisionID: result.revisionID,
            attribution,
            dispositionVersion: artifact.dispositionVersion,
            lineageVersion: artifact.lineageVersion,
            sourceVersion: artifact.source.sourceVersion,
            artifactBindingID: binding.id,
            activeLocation: binding.location,
            descriptorObservationID: descriptor.observationID,
            descriptorCorrectionID: descriptor.correctionID,
            fingerprint: input.read.observation.fingerprint,
            mediaType: input.read.observation.mediaType,
            authorization: input.read.authorization,
            relativePath: input.read.authorization.relativePath,
            descriptor: input.read.observation.descriptor,
            timeObserved: input.read.observation.timeObserved,
          } satisfies ExactArtifactTargetReceipt
          committed.set(tx, receipt)
          return receipt
        })
      }
      return new PreparedMapWrite(
        preparedMapWriteToken,
        input.mapID,
        (tx, time, advanceFrontier) =>
          Effect.gen(function* () {
            const receipt = yield* resolve(tx, time)
            const proposal = {
              target: {
                type: "artifact" as const,
                effectiveArtifactID: receipt.effectiveArtifactID,
                revisionID: receipt.revisionID,
                attribution: receipt.attribution,
              },
              ...(input.proposal.supersedesMapID ? { supersedesMapID: input.proposal.supersedesMapID } : {}),
              outline,
            } satisfies MapProposal
            const canonicalInput = canonicalJSON({ version: 1, proposal, authorship })
            if (new TextEncoder().encode(canonicalInput).byteLength > limits.canonicalInputBytes) {
              return yield* invalidPreparation("invalid_outline", "The canonical Map proposal exceeds its byte limit")
            }
            times.set(tx, time)
            return yield* publishMap(
              tx,
              { mapID: input.mapID, proposal, authorship, canonicalInput, time, advanceFrontier },
              receipt,
              witnesses,
            )
          }).pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die)),
        (selectorID) => {
          const selected = selections.get(selectorID)
          if (!selected) {
            return Effect.fail(
              new PreparationError({ code: "stale_target", detail: "Prepared local Map omitted the selector" }),
            )
          }
          return Effect.succeed(
            new CurrentUseReceipt(currentReceiptToken, {
              mapID: input.mapID,
              selectorID,
              mapDispositionVersion: 0,
              require: (tx) =>
                Effect.gen(function* () {
                  const time = times.get(tx)
                  if (time === undefined) {
                    return yield* new PreparationError({
                      code: "stale_target",
                      detail: "The local Map is not committed in this transaction",
                    })
                  }
                  yield* resolve(tx, time)
                  const current = yield* requireCurrentMapSelector(tx, input.mapID, selectorID)
                  if (
                    current.map.disposition.version !== 0 ||
                    !sameWitness(current.selector.witness, selected.witness)
                  ) {
                    return yield* new PreparationError({
                      code: "witness_mismatch",
                      detail: "The committed local Map selector diverged from its prepared bytes",
                    })
                  }
                }).pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die)),
            }),
          )
        },
      )
    })

    const prepareReferencedArtifactMapWrite: Interface["prepareReferencedArtifactMapWrite"] = Effect.fn(
      "MaterialMap.prepareReferencedArtifactMapWrite",
    )(function* (input) {
      if (
        !(input.reference instanceof Artifact.RevisionReferenceProof) ||
        !(input.read instanceof ContentRoot.PreparedLocalRead)
      ) {
        return yield* new InvalidTransitionError({ detail: "Referenced Map preparation requires exact owner proofs" })
      }
      const reference = input.reference.receipt
      if (
        reference.currentRevisionID !== reference.revision.id ||
        !reference.currentAttribution ||
        !sameAttribution(reference.currentAttribution, reference.revision.attribution) ||
        reference.activeLocation !== input.read.observation.descriptor.canonicalPath ||
        reference.revision.fingerprint.algorithm !== input.read.observation.fingerprint.algorithm ||
        reference.revision.fingerprint.digest !== input.read.observation.fingerprint.digest ||
        reference.revision.fingerprint.byteLength !== input.read.observation.fingerprint.byteLength
      ) {
        return yield* new PreparationError({
          code: "source_provenance",
          detail: "The exact Artifact Revision does not match the authorized stable local bytes",
        })
      }
      if (input.proposal.supersedesMapID === input.mapID) {
        return yield* new InvalidTransitionError({ detail: "A Map cannot supersede itself" })
      }
      const authorship = yield* requireAuthorship(input.authorship)
      const outline = yield* normalizeMapOutline("artifact", input.proposal.outline)
      const selections = yield* selectLocalArtifactOutline(outline, input.read.observation)
      const witnesses = new Map(Array.from(selections, ([id, selected]) => [id, selected.witness] as const))
      const receipt = {
        type: "artifact" as const,
        effectiveArtifactID: reference.revision.effectiveArtifactID,
        revisionID: reference.revision.id,
        attribution: reference.revision.attribution,
        dispositionVersion: reference.dispositionVersion,
        lineageVersion: reference.lineageVersion,
        sourceVersion: reference.sourceVersion,
        artifactBindingID: reference.activeBindingID!,
        activeLocation: reference.activeLocation,
        descriptorObservationID: reference.descriptorObservationID!,
        descriptorCorrectionID: reference.descriptorCorrectionID,
        fingerprint: reference.revision.fingerprint,
        mediaType: reference.mediaType!,
        authorization: input.read.authorization,
        relativePath: input.read.authorization.relativePath,
        descriptor: input.read.observation.descriptor,
        timeObserved: input.read.observation.timeObserved,
      } satisfies ExactArtifactTargetReceipt
      return new PreparedMapWrite(
        preparedMapWriteToken,
        input.mapID,
        (tx, time, advanceFrontier) =>
          Effect.gen(function* () {
            yield* input.read.require(tx)
            yield* Artifact.requireRevisionReference(tx, input.reference)
            const proposal = {
              target: {
                type: "artifact" as const,
                effectiveArtifactID: receipt.effectiveArtifactID,
                revisionID: receipt.revisionID,
                attribution: receipt.attribution,
              },
              ...(input.proposal.supersedesMapID ? { supersedesMapID: input.proposal.supersedesMapID } : {}),
              outline,
            } satisfies MapProposal
            const canonicalInput = canonicalJSON({ version: 1, proposal, authorship })
            return yield* publishMap(
              tx,
              { mapID: input.mapID, proposal, authorship, canonicalInput, time, advanceFrontier },
              receipt,
              witnesses,
            )
          }).pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die)),
        (selectorID) => {
          const selected = selections.get(selectorID)
          if (!selected) {
            return Effect.fail(
              new PreparationError({ code: "stale_target", detail: "Prepared referenced Map omitted the selector" }),
            )
          }
          return Effect.succeed(
            new CurrentUseReceipt(currentReceiptToken, {
              mapID: input.mapID,
              selectorID,
              mapDispositionVersion: 0,
              require: (tx) =>
                Effect.gen(function* () {
                  yield* input.read.require(tx)
                  yield* Artifact.requireRevisionReference(tx, input.reference)
                  const current = yield* requireCurrentMapSelector(tx, input.mapID, selectorID)
                  if (
                    current.map.disposition.version !== 0 ||
                    !sameWitness(current.selector.witness, selected.witness)
                  ) {
                    return yield* new PreparationError({
                      code: "witness_mismatch",
                      detail: "The committed referenced Map selector diverged from its prepared bytes",
                    })
                  }
                }).pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die)),
            }),
          )
        },
      )
    })

    const commitMapInTransaction: Interface["commitMapInTransaction"] = Effect.fn("MaterialMap.commitMapInTransaction")(
      function* (tx, input) {
        if (!(input.prepared instanceof PreparedMapWrite)) {
          return yield* new InvalidTransitionError({ detail: "Map composition requires an owner-issued preparation" })
        }
        return yield* input.prepared.commit(tx, input.time)
      },
    )

    const alignPreparedMapInTransaction: Interface["alignPreparedMapInTransaction"] = Effect.fn(
      "MaterialMap.alignPreparedMapInTransaction",
    )(function* (tx, input) {
      if (!(input.preparedMap instanceof PreparedMapWrite) || input.preparedMap.mapID !== input.proposal.mapID) {
        return yield* new InvalidTransitionError({ detail: "Alignment Map preparation does not match its target" })
      }
      const normalized = yield* normalizeAlignment(input.alignmentID, input.proposal, input.authorship)
      return yield* commitAlignment(tx, {
        alignmentID: input.alignmentID,
        proposal: normalized.proposal,
        authorship: normalized.authorship,
        canonicalInput: normalized.canonicalInput,
        material: yield* input.preparedMap.selectorReceipt(normalized.proposal.selectorID),
        membership: input.membership,
        time: input.time,
        advanceFrontier: false,
      }).pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die))
    })

    const createMap: Interface["createMap"] = Effect.fn("MaterialMap.createMap")(function* (input) {
      const normalized = yield* normalizeMap(input.mapID, input.proposal, input.authorship)
      const initial = yield* reconcileMap(db, input.mapID, normalized.canonicalInput)
      if (initial) return initial
      const attempt = Effect.scoped(
        Effect.gen(function* () {
          const proof = yield* MaterialTarget.prepareMap(dependencies, {
            mapID: input.mapID,
            canonicalInput: normalized.canonicalInput,
            proposal: normalized.proposal,
            access: input.access,
            budgets: input.budgets,
            abort: input.abort,
          })
          yield* requireNotAborted(input.abort)
          return yield* db
            .transaction((tx) =>
              commitMap(tx, {
                mapID: input.mapID,
                proposal: normalized.proposal,
                authorship: normalized.authorship,
                canonicalInput: normalized.canonicalInput,
                proof,
                time: Date.now(),
                advanceFrontier: true,
              }),
            )
            .pipe(
              Effect.catchTag("EffectDrizzleQueryError", () =>
                Effect.fail(new PersistenceError({ entity: "map", id: input.mapID, operation: "create" })),
              ),
              Effect.catchTag("SqlError", () =>
                Effect.fail(new PersistenceError({ entity: "map", id: input.mapID, operation: "create" })),
              ),
            )
        }),
      )
      return yield* attempt.pipe(
        Effect.catchCause((captured) => finalMapReconciliation(db, input.mapID, normalized.canonicalInput, captured)),
      )
    })

    const getMap: Interface["getMap"] = Effect.fn("MaterialMap.getMap")(function* (mapID) {
      return yield* snapshot(db, (tx) => requireMapInfo(tx, mapID))
    })

    const listMaps: Interface["listMaps"] = Effect.fn("MaterialMap.listMaps")(function* (options) {
      const includeWithdrawn = options.includeWithdrawn ?? false
      const includeSuperseded = options.includeSuperseded ?? false
      const targetKey = canonicalJSON(options.target)
      const scope = {
        endpoint: "maps" as const,
        parent: targetKey,
        filter: `${includeWithdrawn}/${includeSuperseded}`,
      }
      const page = yield* MaterialMapCursor.options(options, scope)
      const after = yield* timeIDKey(page.key)
      return yield* snapshot(db, (tx) =>
        listMapsPage(tx, options.target, includeWithdrawn, includeSuperseded, page.limit, after, scope),
      )
    })

    const listOutline: Interface["listOutline"] = Effect.fn("MaterialMap.listOutline")(function* (mapID, options) {
      const scope = { endpoint: "outline" as const, parent: mapID, filter: "exact" }
      const page = yield* MaterialMapCursor.options(options, scope)
      const after = yield* numberIDKey(page.key)
      return yield* snapshot(db, (tx) => listOutlinePage(tx, mapID, page.limit, after, scope))
    })

    const getSelector: Interface["getSelector"] = Effect.fn("MaterialMap.getSelector")(function* (mapID, selectorID) {
      return yield* snapshot(db, (tx) => requireSelectorInfo(tx, mapID, selectorID))
    })

    const listOutlineNodes: Interface["listOutlineNodes"] = Effect.fn("MaterialMap.listOutlineNodes")(
      function* (mapID, options) {
        const scope = { endpoint: "outline_nodes" as const, parent: mapID, filter: "exact" }
        const page = yield* MaterialMapCursor.options(options, scope)
        const after = yield* numberIDKey(page.key)
        return yield* snapshot(db, (tx) => listOutlineNodesPage(tx, mapID, page.limit, after, scope))
      },
    )

    const listSelectors: Interface["listSelectors"] = Effect.fn("MaterialMap.listSelectors")(
      function* (mapID, nodeID, options) {
        const scope = { endpoint: "selectors" as const, parent: `${mapID}/${nodeID}`, filter: "exact" }
        const page = yield* MaterialMapCursor.options(options, scope)
        const after = yield* numberIDKey(page.key)
        return yield* snapshot(db, (tx) => listSelectorsPage(tx, mapID, nodeID, page.limit, after, scope))
      },
    )

    const listMapSuccessors: Interface["listMapSuccessors"] = Effect.fn("MaterialMap.listMapSuccessors")(
      function* (mapID, options) {
        const scope = { endpoint: "map_successors" as const, parent: mapID, filter: "exact" }
        const page = yield* MaterialMapCursor.options(options, scope)
        const after = yield* timeIDKey(page.key)
        return yield* snapshot(db, (tx) => listMapSuccessorsPage(tx, mapID, page.limit, after, scope))
      },
    )

    const listMapDispositions: Interface["listMapDispositions"] = Effect.fn("MaterialMap.listMapDispositions")(
      function* (mapID, options) {
        return yield* listDispositions(db, "map", mapID, MaterialMapDispositionEventTable, options)
      },
    )

    const withdrawMap: Interface["withdrawMap"] = Effect.fn("MaterialMap.withdrawMap")(function* (input) {
      return yield* transitionMap(db, input.mapID, input.expectedVersion, "withdrawn", input.reason)
    })

    const restoreMap: Interface["restoreMap"] = Effect.fn("MaterialMap.restoreMap")(function* (input) {
      return yield* transitionMap(db, input.mapID, input.expectedVersion, "active")
    })

    const createAlignment: Interface["createAlignment"] = Effect.fn("MaterialMap.createAlignment")(function* (input) {
      const normalized = yield* normalizeAlignment(input.alignmentID, input.proposal, input.authorship)
      const initial = yield* reconcileAlignment(db, input.alignmentID, normalized.canonicalInput)
      if (initial) return initial
      const attempt = Effect.gen(function* () {
        const material = yield* currentReader.resolveSelector({
          mapID: normalized.proposal.mapID,
          selectorID: normalized.proposal.selectorID,
          access: input.access,
          budgets: input.budgets,
          abort: input.abort,
        })
        const membership = yield* courses.prepareMembership({
          endpoint: normalized.proposal.course,
          selection: normalized.proposal.selection,
        })
        yield* requireNotAborted(input.abort)
        return yield* db
          .transaction((tx) =>
            commitAlignment(tx, {
              alignmentID: input.alignmentID,
              proposal: normalized.proposal,
              authorship: normalized.authorship,
              canonicalInput: normalized.canonicalInput,
              material: material.receipt,
              membership,
              time: Date.now(),
              advanceFrontier: true,
            }),
          )
          .pipe(
            Effect.catchTag("EffectDrizzleQueryError", () =>
              Effect.fail(new PersistenceError({ entity: "alignment", id: input.alignmentID, operation: "create" })),
            ),
            Effect.catchTag("SqlError", () =>
              Effect.fail(new PersistenceError({ entity: "alignment", id: input.alignmentID, operation: "create" })),
            ),
          )
      })
      return yield* attempt.pipe(
        Effect.catchCause((captured) =>
          finalAlignmentReconciliation(db, input.alignmentID, normalized.canonicalInput, captured),
        ),
      )
    })

    const getAlignment: Interface["getAlignment"] = Effect.fn("MaterialMap.getAlignment")(function* (alignmentID) {
      return yield* snapshot(db, (tx) => requireAlignmentInfo(tx, alignmentID))
    })

    const listAlignmentsForMap: Interface["listAlignmentsForMap"] = Effect.fn("MaterialMap.listAlignmentsForMap")(
      function* (mapID, options) {
        return yield* listAlignments(db, {
          endpoint: "map_alignments",
          parent: mapID,
          options,
          where: eq(MaterialCourseAlignmentTable.map_id, mapID),
        })
      },
    )

    const listAlignmentsForSelector: Interface["listAlignmentsForSelector"] = Effect.fn(
      "MaterialMap.listAlignmentsForSelector",
    )(function* (mapID, selectorID, options) {
      return yield* listAlignments(db, {
        endpoint: "selector_alignments",
        parent: `${mapID}/${selectorID}`,
        options,
        where: and(
          eq(MaterialCourseAlignmentTable.map_id, mapID),
          eq(MaterialCourseAlignmentTable.selector_id, selectorID),
        ),
      })
    })

    const listAlignmentsForMembership: Interface["listAlignmentsForMembership"] = Effect.fn(
      "MaterialMap.listAlignmentsForMembership",
    )(function* (endpoint, options) {
      return yield* listAlignments(db, {
        endpoint: "membership_alignments",
        parent: `${endpoint.courseID}/${endpoint.viewID}/${endpoint.revisionID}/${endpoint.itemID}`,
        options,
        where: and(
          eq(MaterialCourseAlignmentTable.course_id, endpoint.courseID),
          eq(MaterialCourseAlignmentTable.view_id, endpoint.viewID),
          eq(MaterialCourseAlignmentTable.revision_id, endpoint.revisionID),
          eq(MaterialCourseAlignmentTable.item_id, endpoint.itemID),
        ),
      })
    })

    const listAlignmentSuccessors: Interface["listAlignmentSuccessors"] = Effect.fn(
      "MaterialMap.listAlignmentSuccessors",
    )(function* (alignmentID, options) {
      return yield* listAlignments(db, {
        endpoint: "alignment_successors",
        parent: alignmentID,
        options,
        where: eq(MaterialCourseAlignmentTable.supersedes_alignment_id, alignmentID),
      })
    })

    const listAlignmentDispositions: Interface["listAlignmentDispositions"] = Effect.fn(
      "MaterialMap.listAlignmentDispositions",
    )(function* (alignmentID, options) {
      return yield* listDispositions(
        db,
        "alignment",
        alignmentID,
        MaterialCourseAlignmentDispositionEventTable,
        options,
      )
    })

    const withdrawAlignment: Interface["withdrawAlignment"] = Effect.fn("MaterialMap.withdrawAlignment")(
      function* (input) {
        return yield* transitionAlignment(db, input.alignmentID, input.expectedVersion, "withdrawn", input.reason)
      },
    )

    const restoreAlignment: Interface["restoreAlignment"] = Effect.fn("MaterialMap.restoreAlignment")(
      function* (input) {
        return yield* transitionAlignment(db, input.alignmentID, input.expectedVersion, "active")
      },
    )

    return Service.of({
      prepareMapWrite,
      prepareLocalArtifactMapWrite,
      prepareReferencedArtifactMapWrite,
      commitMapInTransaction,
      alignPreparedMapInTransaction,
      createMap,
      getMap,
      listMaps,
      listOutline,
      listOutlineNodes,
      listSelectors,
      getSelector,
      listMapSuccessors,
      listMapDispositions,
      withdrawMap,
      restoreMap,
      createAlignment,
      getAlignment,
      listAlignmentsForMap,
      listAlignmentsForSelector,
      listAlignmentsForMembership,
      listAlignmentSuccessors,
      listAlignmentDispositions,
      withdrawAlignment,
      restoreAlignment,
    })
  }),
)

const targetDependencies = Effect.gen(function* () {
  return {
    artifacts: yield* Artifact.Service,
    roots: yield* ContentRoot.Service,
    currentRepresentations: yield* Representation.CurrentUseReader,
  } satisfies MaterialTarget.Dependencies
})

export const currentUseReaderNode = makeGlobalNode({
  service: CurrentUseReader,
  layer: currentUseLayer,
  deps: [Database.node, Artifact.node, ContentRoot.node, Representation.currentUseReaderNode],
})

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [
    Database.node,
    Artifact.node,
    ContentRoot.node,
    Course.node,
    Representation.currentUseReaderNode,
    currentUseReaderNode,
  ],
})

function snapshot<A, E, R>(
  database: DatabaseShape,
  read: (tx: Transaction) => Effect.Effect<A, E | EffectDrizzleQueryError, R>,
) {
  return database
    .transaction(read)
    .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die), Effect.catchTag("SqlError", Effect.die))
}

function normalizeMap(mapID: MapID, proposal: MapProposal, authorship: Authorship) {
  return Effect.gen(function* () {
    const receipt = yield* requireAuthorship(authorship)
    const outline = yield* normalizeMapOutline(proposal.target.type, proposal.outline)
    if (proposal.supersedesMapID === mapID) {
      return yield* new InvalidTransitionError({ detail: "A Map cannot supersede itself" })
    }
    const normalized = {
      target: normalizeTarget(proposal.target),
      ...(proposal.supersedesMapID ? { supersedesMapID: proposal.supersedesMapID } : {}),
      outline,
    } satisfies MapProposal
    const canonicalInput = canonicalJSON({ version: 1, proposal: normalized, authorship: receipt })
    if (new TextEncoder().encode(canonicalInput).byteLength > limits.canonicalInputBytes) {
      return yield* invalidPreparation("invalid_outline", "The canonical Map proposal exceeds its byte limit")
    }
    return { proposal: normalized, authorship: receipt, canonicalInput }
  })
}

function normalizeMapOutline(target: MapTarget["type"], proposed: MapProposal["outline"]) {
  return Effect.gen(function* () {
    if (!Array.isArray(proposed) || proposed.length < 1 || proposed.length > limits.nodes) {
      return yield* invalidPreparation("invalid_outline", `A Map must contain 1-${limits.nodes} outline nodes`)
    }
    const nodeIDs = new Set<string>()
    const selectorIDs = new Set<string>()
    const stack: { readonly id: string; readonly depth: number }[] = []
    const outline = yield* Effect.forEach(proposed, (node, index) =>
      Effect.gen(function* () {
        if (nodeIDs.has(node.id)) return yield* invalidPreparation("invalid_outline", "Outline node IDs must be unique")
        nodeIDs.add(node.id)
        if (
          node.preorderPosition !== index ||
          !Number.isSafeInteger(node.depth) ||
          node.depth < 0 ||
          node.depth > limits.depth
        ) {
          return yield* invalidPreparation("invalid_outline", "Outline preorder/depth is invalid")
        }
        if (
          (node.depth === 0 && node.parentNodeID !== undefined) ||
          (node.depth > 0 && stack[node.depth - 1]?.id !== node.parentNodeID) ||
          node.depth > stack.length
        ) {
          return yield* invalidPreparation("invalid_outline", "Outline parentage is not one contiguous preorder forest")
        }
        const title = normalizeText(node.title)
        if (!boundedText(title, limits.titleCharacters)) {
          return yield* invalidPreparation("invalid_outline", "Outline titles must be nonempty and bounded")
        }
        const nodeSelectors = node.selectors
        if (!Array.isArray(nodeSelectors)) {
          return yield* invalidPreparation("invalid_outline", "Each outline node must own an ordered selector list")
        }
        const selectors = yield* Effect.forEach(
          nodeSelectors as MapProposal["outline"][number]["selectors"],
          (selector, position) =>
            Effect.gen(function* () {
              if (selectorIDs.has(selector.id)) {
                return yield* invalidPreparation("invalid_outline", "Selector IDs must be unique inside one Map")
              }
              selectorIDs.add(selector.id)
              if (selector.position !== position) {
                return yield* invalidPreparation("invalid_outline", "Selector positions must be contiguous per node")
              }
              yield* requireCoordinateKind(target, selector.coordinate)
              return { ...selector, position, coordinate: normalizeCoordinate(selector.coordinate) }
            }),
        )
        stack[node.depth] = { id: node.id, depth: node.depth }
        stack.length = node.depth + 1
        return { ...node, title, preorderPosition: index, selectors }
      }),
    )
    const selectorCount = outline.reduce((count, node) => count + node.selectors.length, 0)
    if (selectorCount < 1 || selectorCount > limits.selectors) {
      return yield* invalidPreparation("invalid_outline", `A Map must contain 1-${limits.selectors} selectors`)
    }
    for (const [index, node] of outline.entries()) {
      const leaf = outline[index + 1]?.depth !== node.depth + 1
      if (leaf && node.selectors.length === 0) {
        return yield* invalidPreparation("invalid_outline", "Every outline leaf must own at least one selector")
      }
    }
    return outline
  })
}

function selectLocalArtifactOutline(outline: MapProposal["outline"], observation: ContentRootNTFS.PreparedFile) {
  return Effect.gen(function* () {
    const selected = yield* Effect.forEach(
      outline.flatMap((node) => node.selectors),
      (selector) =>
        Effect.gen(function* () {
          const result = MaterialSelector.select(
            { type: "artifact", bytes: observation.bytes, fingerprint: observation.fingerprint },
            selector.coordinate,
          )
          if (!result.ok) {
            return yield* invalidPreparation(
              result.error === "profile_mismatch" ? "unsupported_selector" : "invalid_selector",
              `Selector validation failed: ${result.error}`,
            )
          }
          return [selector.id, result.value] as const
        }),
    )
    return new Map(selected)
  })
}

function normalizeAlignment(alignmentID: AlignmentID, proposal: AlignmentProposal, authorship: Authorship) {
  return Effect.gen(function* () {
    const receipt = yield* requireAuthorship(authorship)
    const reason = normalizeText(proposal.reason)
    if (!boundedText(reason, limits.reasonCharacters)) {
      return yield* new InvalidTransitionError({ detail: "Alignment reason must be nonempty and bounded" })
    }
    if (proposal.supersedesAlignmentID === alignmentID) {
      return yield* new InvalidTransitionError({ detail: "An alignment cannot supersede itself" })
    }
    if (
      proposal.selection.type === "observed_working" &&
      (proposal.selection.revisionID !== proposal.course.revisionID ||
        !Number.isSafeInteger(proposal.selection.version) ||
        proposal.selection.version < 0)
    ) {
      return yield* new InvalidTransitionError({
        detail: "Observed working selection must name the exact endpoint Revision and a valid version",
      })
    }
    const normalized = {
      ...proposal,
      course: { ...proposal.course },
      selection: { ...proposal.selection },
      reason,
    } satisfies AlignmentProposal
    const canonicalInput = canonicalJSON({ version: 1, proposal: normalized, authorship: receipt })
    if (new TextEncoder().encode(canonicalInput).byteLength > limits.canonicalInputBytes) {
      return yield* new InvalidTransitionError({ detail: "The canonical alignment proposal exceeds its byte limit" })
    }
    return { proposal: normalized, authorship: receipt, canonicalInput }
  })
}

function requireAuthorship(authorship: Authorship) {
  if (!(authorship instanceof Authorship)) {
    return Effect.fail(new InvalidTransitionError({ detail: "Authorship must be bound by a trusted application" }))
  }
  const receipt = {
    basis: normalizeText(authorship.basis),
    capabilityIdentity: normalizeText(authorship.capabilityIdentity),
    capabilityVersion: authorship.capabilityVersion,
  }
  if (
    !boundedText(receipt.basis, limits.authorshipBasisCharacters) ||
    !boundedText(receipt.capabilityIdentity, limits.capabilityIdentityCharacters) ||
    !Number.isSafeInteger(receipt.capabilityVersion) ||
    receipt.capabilityVersion < 0
  ) {
    return Effect.fail(new InvalidTransitionError({ detail: "Authorship capability receipt is invalid" }))
  }
  return Effect.succeed(receipt satisfies AuthorshipReceipt)
}

function requireCoordinate(target: MapTarget, coordinate: MaterialSelector.Coordinate) {
  return requireCoordinateKind(target.type, coordinate)
}

function requireCoordinateKind(target: MapTarget["type"], coordinate: MaterialSelector.Coordinate) {
  if (coordinate.kind === "artifact_byte_range.v1" && target !== "artifact") {
    return invalidPreparation("unsupported_selector", "Artifact byte ranges require an Artifact target")
  }
  if (
    (coordinate.kind === "pdf_page_range.v1" ||
      coordinate.kind === "pdf_text_range.v1" ||
      coordinate.kind === "model_text_range.v1") &&
    target !== "representation"
  ) {
    return invalidPreparation("unsupported_selector", "Profile selectors require a Representation target")
  }
  const values = coordinateNumbers(coordinate)
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return invalidPreparation("invalid_selector", "Selector coordinates must be nonnegative safe integers")
  }
  return Effect.void
}

function coordinateNumbers(coordinate: MaterialSelector.Coordinate) {
  if (coordinate.kind === "whole_target.v1") return []
  if (coordinate.kind === "artifact_byte_range.v1") return [coordinate.startByte, coordinate.endByte]
  if (coordinate.kind === "pdf_page_range.v1") return [coordinate.startPage, coordinate.endPage]
  if (coordinate.kind === "model_text_range.v1") return [coordinate.startScalar, coordinate.endScalar]
  return [
    coordinate.start.page,
    coordinate.start.item,
    coordinate.start.scalar,
    coordinate.end.page,
    coordinate.end.item,
    coordinate.end.scalar,
  ]
}

function normalizeCoordinate(coordinate: MaterialSelector.Coordinate): MaterialSelector.Coordinate {
  if (coordinate.kind !== "pdf_text_range.v1") return { ...coordinate }
  return { ...coordinate, start: { ...coordinate.start }, end: { ...coordinate.end } }
}

function normalizeTarget(target: MapTarget): MapTarget {
  if (target.type === "representation") return { ...target }
  return { ...target, attribution: { ...target.attribution } }
}

function normalizeText(value: string) {
  return value.trim().normalize("NFC").replace(/\r\n?/g, "\n")
}

function boundedText(value: string, characters: number) {
  return value.length > 0 && value.length <= characters
}

function invalidPreparation(code: "invalid_outline" | "invalid_selector" | "unsupported_selector", detail: string) {
  return Effect.fail(new PreparationError({ code, detail }))
}

function requireNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    return Effect.fail(new PreparationError({ code: "cancelled", detail: "Material authoring was cancelled" }))
  }
  return Effect.void
}

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`)
    .join(",")}}`
}

function reconcileMap(db: DatabaseShape, mapID: MapID, canonicalInput: string) {
  const read = db
    .transaction((tx) => findMapInfo(tx, mapID))
    .pipe(Effect.catchCause(() => Effect.fail(new OutcomeUnknownError({ entity: "map", id: mapID }))))
  return Effect.flatMap(read, (current) => {
    if (!current) return Effect.succeed(undefined)
    if (current.canonicalInput !== canonicalInput) {
      return Effect.fail(
        new ConflictError({ entity: "map", id: mapID, detail: "Map ID was reused with different canonical input" }),
      )
    }
    return Effect.succeed(current)
  })
}

function reconcileAlignment(db: DatabaseShape, alignmentID: AlignmentID, canonicalInput: string) {
  const read = db
    .transaction((tx) => findAlignmentInfo(tx, alignmentID))
    .pipe(Effect.catchCause(() => Effect.fail(new OutcomeUnknownError({ entity: "alignment", id: alignmentID }))))
  return Effect.flatMap(read, (current) => {
    if (!current) return Effect.succeed(undefined)
    if (current.canonicalInput !== canonicalInput) {
      return Effect.fail(
        new ConflictError({
          entity: "alignment",
          id: alignmentID,
          detail: "Alignment ID was reused with different canonical input",
        }),
      )
    }
    return Effect.succeed(current)
  })
}

function finalMapReconciliation(db: DatabaseShape, mapID: MapID, canonicalInput: string, captured: Cause.Cause<Error>) {
  return Effect.uninterruptible(
    Effect.flatMap(reconcileMap(db, mapID, canonicalInput), (current) =>
      current ? Effect.succeed(current) : Effect.failCause(captured),
    ),
  )
}

function finalAlignmentReconciliation(
  db: DatabaseShape,
  alignmentID: AlignmentID,
  canonicalInput: string,
  captured: Cause.Cause<Error>,
) {
  return Effect.uninterruptible(
    Effect.flatMap(reconcileAlignment(db, alignmentID, canonicalInput), (current) =>
      current ? Effect.succeed(current) : Effect.failCause(captured),
    ),
  )
}

function commitMap(
  tx: Transaction,
  input: {
    readonly mapID: MapID
    readonly proposal: MapProposal
    readonly authorship: AuthorshipReceipt
    readonly canonicalInput: string
    readonly proof: MaterialTarget.PreparedMapTarget
    readonly time: number
    readonly advanceFrontier: boolean
  },
) {
  return Effect.gen(function* () {
    const prepared = yield* MaterialTarget.requirePreparedMap(tx, input.proof, {
      mapID: input.mapID,
      canonicalInput: input.canonicalInput,
    })
    return yield* publishMap(tx, input, prepared.receipt, prepared.witnesses)
  })
}

function publishMap(
  tx: Transaction,
  input: {
    readonly mapID: MapID
    readonly proposal: MapProposal
    readonly authorship: AuthorshipReceipt
    readonly canonicalInput: string
    readonly time: number
    readonly advanceFrontier: boolean
  },
  receipt: ExactArtifactTargetReceipt | RepresentationTargetReceipt,
  witnesses: ReadonlyMap<SelectorID, MaterialSelector.Witness>,
) {
  return Effect.gen(function* () {
    const replay = yield* findMapInfo(tx, input.mapID)
    if (replay) {
      if (replay.canonicalInput !== input.canonicalInput) {
        return yield* new ConflictError({
          entity: "map",
          id: input.mapID,
          detail: "Concurrent Map ID reuse changed canonical input",
        })
      }
      return replay
    }
    const outlineIDs = input.proposal.outline.map((node) => node.id)
    const selectorIDs = input.proposal.outline.flatMap((node) => node.selectors.map((selector) => selector.id))
    const reusedOutline = yield* tx
      .select({ id: MaterialOutlineNodeTable.id })
      .from(MaterialOutlineNodeTable)
      .where(inArray(MaterialOutlineNodeTable.id, outlineIDs))
      .limit(1)
      .get()
    if (reusedOutline) {
      return yield* new InvalidTransitionError({ detail: `Outline node identity ${reusedOutline.id} is already owned` })
    }
    const reusedSelector = yield* tx
      .select({ id: MaterialSelectorTable.id })
      .from(MaterialSelectorTable)
      .where(inArray(MaterialSelectorTable.id, selectorIDs))
      .limit(1)
      .get()
    if (reusedSelector) {
      return yield* new InvalidTransitionError({ detail: `Selector identity ${reusedSelector.id} is already owned` })
    }
    if (input.proposal.supersedesMapID) yield* requireMapInfo(tx, input.proposal.supersedesMapID)
    if (receipt.type !== input.proposal.target.type || !receiptMatchesTarget(receipt, input.proposal.target)) {
      return yield* new PreparationError({
        code: "stale_target",
        detail: "Prepared receipt does not match the Map target",
      })
    }
    const time = input.time
    yield* tx.run("PRAGMA defer_foreign_keys = ON")
    if (receipt.type === "artifact") {
      yield* tx.insert(MaterialMapArtifactTargetTable).values(artifactTargetValues(input.mapID, receipt))
    } else {
      yield* tx.insert(MaterialMapRepresentationTargetTable).values({
        map_id: input.mapID,
        representation_revision_id: receipt.representationRevisionID,
      })
    }
    yield* tx.insert(MaterialOutlineNodeTable).values(
      input.proposal.outline.map((node) => ({
        id: node.id,
        map_id: input.mapID,
        parent_node_id: node.parentNodeID,
        title: node.title,
        preorder_position: node.preorderPosition,
        depth: node.depth,
      })),
    )
    const selectors = input.proposal.outline.flatMap((node) =>
      node.selectors.map((selector) => {
        const witness = witnesses.get(selector.id)
        if (!witness) throw new Error(`Prepared target omitted selector ${selector.id}`)
        return selectorValues(input.mapID, node.id, selector, witness)
      }),
    )
    yield* tx.insert(MaterialSelectorTable).values(selectors)
    yield* tx.insert(MaterialMapStateTable).values({
      map_id: input.mapID,
      version: 0,
      disposition: "active",
      time_updated: time,
    })
    yield* tx.insert(MaterialMapDispositionEventTable).values({
      id: createDispositionEventID(),
      map_id: input.mapID,
      version: 0,
      disposition: "active",
      time_committed: time,
    })
    yield* tx.insert(MaterialMapTable).values({
      id: input.mapID,
      canonical_input: input.canonicalInput,
      target_kind: input.proposal.target.type,
      supersedes_map_id: input.proposal.supersedesMapID,
      authorship_basis: input.authorship.basis,
      authorship_capability_identity: input.authorship.capabilityIdentity,
      authorship_capability_version: input.authorship.capabilityVersion,
      time_created: time,
    })
    if (input.advanceFrontier) {
      yield* LearningFrontier.advance(tx, { time }).pipe(
        Effect.catchCause(() =>
          Effect.fail(new PersistenceError({ entity: "map", id: input.mapID, operation: "create" })),
        ),
      )
    }
    return yield* requireMapInfo(tx, input.mapID)
  })
}

function commitAlignment(
  tx: Transaction,
  input: {
    readonly alignmentID: AlignmentID
    readonly proposal: AlignmentProposal
    readonly authorship: AuthorshipReceipt
    readonly canonicalInput: string
    readonly material: CurrentUseReceipt
    readonly membership: Course.MembershipProof
    readonly time: number
    readonly advanceFrontier: boolean
  },
) {
  return Effect.gen(function* () {
    const replay = yield* findAlignmentInfo(tx, input.alignmentID)
    if (replay) {
      if (replay.canonicalInput !== input.canonicalInput) {
        return yield* new ConflictError({
          entity: "alignment",
          id: input.alignmentID,
          detail: "Concurrent alignment ID reuse changed canonical input",
        })
      }
      return replay
    }
    const material =
      input.material instanceof CurrentUseReceipt ? input.material.expectation(currentReceiptToken, true) : undefined
    if (!material || material.mapID !== input.proposal.mapID || material.selectorID !== input.proposal.selectorID) {
      return yield* new PreparationError({
        code: "stale_target",
        detail: "Alignment requires one fresh exact selector current-use receipt",
      })
    }
    const current = yield* requireCurrentMapSelector(tx, input.proposal.mapID, input.proposal.selectorID)
    if (current.map.disposition.version !== material.mapDispositionVersion) {
      return yield* new ConflictError({
        entity: "map_state",
        id: input.proposal.mapID,
        detail: "Map disposition changed after selector preparation",
      })
    }
    yield* material.require(tx)
    if (
      canonicalJSON(input.membership.endpoint) !== canonicalJSON(input.proposal.course) ||
      canonicalJSON(input.membership.selection) !== canonicalJSON(input.proposal.selection)
    ) {
      return yield* new InvalidTransitionError({ detail: "Course proof belongs to another alignment endpoint" })
    }
    yield* Course.requireMembershipProof(tx, input.membership)
    if (input.proposal.supersedesAlignmentID) {
      yield* requireAlignmentInfo(tx, input.proposal.supersedesAlignmentID)
    }
    const time = input.time
    yield* tx.run("PRAGMA defer_foreign_keys = ON")
    yield* tx.insert(MaterialCourseAlignmentStateTable).values({
      alignment_id: input.alignmentID,
      version: 0,
      disposition: "active",
      time_updated: time,
    })
    yield* tx.insert(MaterialCourseAlignmentDispositionEventTable).values({
      id: createAlignmentDispositionEventID(),
      alignment_id: input.alignmentID,
      version: 0,
      disposition: "active",
      time_committed: time,
    })
    yield* tx.insert(MaterialCourseAlignmentTable).values({
      id: input.alignmentID,
      canonical_input: input.canonicalInput,
      map_id: input.proposal.mapID,
      selector_id: input.proposal.selectorID,
      course_id: input.proposal.course.courseID,
      view_id: input.proposal.course.viewID,
      revision_id: input.proposal.course.revisionID,
      item_id: input.proposal.course.itemID,
      selection_basis: input.proposal.selection.type,
      observed_selection_revision_id:
        input.proposal.selection.type === "observed_working" ? input.proposal.selection.revisionID : undefined,
      observed_selection_version:
        input.proposal.selection.type === "observed_working" ? input.proposal.selection.version : undefined,
      accepted_course_version: input.membership.receipt.courseVersion,
      accepted_view_version: input.membership.receipt.viewVersion,
      accepted_revision_version: input.membership.receipt.revisionVersion,
      reason: input.proposal.reason,
      supersedes_alignment_id: input.proposal.supersedesAlignmentID,
      authorship_basis: input.authorship.basis,
      authorship_capability_identity: input.authorship.capabilityIdentity,
      authorship_capability_version: input.authorship.capabilityVersion,
      time_created: time,
    })
    if (input.advanceFrontier) {
      yield* LearningFrontier.advance(tx, { time }).pipe(
        Effect.catchCause(() =>
          Effect.fail(new PersistenceError({ entity: "alignment", id: input.alignmentID, operation: "create" })),
        ),
      )
    }
    return yield* requireAlignmentInfo(tx, input.alignmentID)
  })
}

function receiptMatchesTarget(receipt: TargetReceipt, target: MapTarget) {
  if (receipt.type !== target.type) return false
  if (receipt.type === "representation" && target.type === "representation") {
    return receipt.representationRevisionID === target.representationRevisionID
  }
  if (receipt.type !== "artifact" || target.type !== "artifact") return false
  return (
    receipt.effectiveArtifactID === target.effectiveArtifactID &&
    receipt.revisionID === target.revisionID &&
    sameAttribution(receipt.attribution, target.attribution)
  )
}

function artifactTargetValues(mapID: MapID, receipt: ExactArtifactTargetReceipt) {
  const contentRoot = receipt.authorization.kind === "content_root" ? receipt.authorization : undefined
  const workspace = receipt.authorization.kind === "active_workspace" ? receipt.authorization : undefined
  const operation = receipt.authorization.kind === "one_operation" ? receipt.authorization : undefined
  return {
    map_id: mapID,
    artifact_id: receipt.effectiveArtifactID,
    artifact_revision_id: receipt.revisionID,
    attribution_type: receipt.attribution.type,
    attribution_member_id: receipt.attribution.type === "lineage_correction" ? receipt.attribution.memberID : undefined,
    disposition_version: receipt.dispositionVersion,
    lineage_version: receipt.lineageVersion,
    source_version: receipt.sourceVersion,
    artifact_binding_id: receipt.artifactBindingID,
    active_location: receipt.activeLocation,
    descriptor_observation_id: receipt.descriptorObservationID,
    descriptor_correction_id: receipt.descriptorCorrectionID,
    fingerprint_algorithm: receipt.fingerprint.algorithm,
    fingerprint_digest: receipt.fingerprint.digest,
    byte_length: receipt.fingerprint.byteLength,
    media_type: receipt.mediaType,
    authority_kind: receipt.authorization.kind,
    root_object_descriptor_state: "exact_v1",
    content_root_id: contentRoot?.contentRoot.contentRootID,
    content_root_binding_id: contentRoot?.contentRoot.bindingID,
    content_root_binding_episode_id: contentRoot?.contentRoot.bindingEpisodeID,
    content_root_binding_episode_ordinal: contentRoot?.contentRoot.bindingEpisodeOrdinal,
    content_root_grant_episode_id: contentRoot?.contentRoot.grantEpisodeID,
    content_root_grant_episode_ordinal: contentRoot?.grantEpisodeOrdinal,
    content_root_grant_version: contentRoot?.contentRoot.grantVersion,
    workspace_identity: workspace?.workspaceIdentity,
    operation_identity: operation?.operationIdentity,
    operation_approval_basis: operation?.approvalBasis,
    normalized_relative_path: receipt.relativePath,
    root_object_platform: receipt.authorization.root.platform,
    root_object_verifier_version: receipt.authorization.root.verifierVersion,
    root_object_canonical_path: receipt.authorization.root.canonicalPath,
    root_object_canonical_path_key: receipt.authorization.root.canonicalPathKey,
    root_object_volume_serial: receipt.authorization.root.volumeSerial,
    root_object_id: receipt.authorization.root.objectID,
    root_object_creation_time: receipt.authorization.root.creationTime,
    root_object_change_time: receipt.authorization.root.changeTime,
    root_object_last_write_time: receipt.authorization.root.lastWriteTime,
    root_object_size: receipt.authorization.root.size,
    source_object_platform: receipt.descriptor.platform,
    source_object_verifier_version: receipt.descriptor.verifierVersion,
    source_object_canonical_path: receipt.descriptor.canonicalPath,
    source_object_canonical_path_key: receipt.descriptor.canonicalPathKey,
    source_object_volume_serial: receipt.descriptor.volumeSerial,
    source_object_id: receipt.descriptor.objectID,
    source_object_creation_time: receipt.descriptor.creationTime,
    source_object_change_time: receipt.descriptor.changeTime,
    source_object_last_write_time: receipt.descriptor.lastWriteTime,
    source_object_size: receipt.descriptor.size,
    source_observed_time: receipt.timeObserved,
  } satisfies typeof MaterialMapArtifactTargetTable.$inferInsert
}

function selectorValues(
  mapID: MapID,
  nodeID: OutlineNodeInfo["id"],
  selector: MapProposal["outline"][number]["selectors"][number],
  witness: MaterialSelector.Witness,
) {
  const coordinate = selector.coordinate
  return {
    id: selector.id,
    map_id: mapID,
    node_id: nodeID,
    selector_position: selector.position,
    kind: coordinate.kind,
    artifact_start_byte: coordinate.kind === "artifact_byte_range.v1" ? coordinate.startByte : undefined,
    artifact_end_byte: coordinate.kind === "artifact_byte_range.v1" ? coordinate.endByte : undefined,
    pdf_start_page:
      coordinate.kind === "pdf_page_range.v1"
        ? coordinate.startPage
        : coordinate.kind === "pdf_text_range.v1"
          ? coordinate.start.page
          : undefined,
    pdf_end_page:
      coordinate.kind === "pdf_page_range.v1"
        ? coordinate.endPage
        : coordinate.kind === "pdf_text_range.v1"
          ? coordinate.end.page
          : undefined,
    pdf_start_item: coordinate.kind === "pdf_text_range.v1" ? coordinate.start.item : undefined,
    pdf_start_scalar: coordinate.kind === "pdf_text_range.v1" ? coordinate.start.scalar : undefined,
    pdf_end_item: coordinate.kind === "pdf_text_range.v1" ? coordinate.end.item : undefined,
    pdf_end_scalar: coordinate.kind === "pdf_text_range.v1" ? coordinate.end.scalar : undefined,
    model_start_scalar: coordinate.kind === "model_text_range.v1" ? coordinate.startScalar : undefined,
    model_end_scalar: coordinate.kind === "model_text_range.v1" ? coordinate.endScalar : undefined,
    witness_algorithm: witness.algorithm,
    witness_digest: witness.digest,
    witness_byte_length: witness.byteLength,
  } satisfies typeof MaterialSelectorTable.$inferInsert
}

function sourceRootDescriptor(row: typeof MaterialMapArtifactTargetTable.$inferSelect) {
  if (row.root_object_descriptor_state !== "exact_v1") {
    throw new Error("Historical partial ContentRoot descriptors cannot be read as exact descriptors")
  }
  return {
    platform: row.root_object_platform!,
    verifierVersion: row.root_object_verifier_version!,
    canonicalPath: row.root_object_canonical_path!,
    canonicalPathKey: row.root_object_canonical_path_key!,
    volumeSerial: row.root_object_volume_serial!,
    objectID: row.root_object_id!,
    creationTime: row.root_object_creation_time!,
    changeTime: row.root_object_change_time!,
    lastWriteTime: row.root_object_last_write_time!,
    size: row.root_object_size!,
    kind: "directory" as const,
  }
}

function historicalSourceRootDescriptor(row: typeof MaterialMapArtifactTargetTable.$inferSelect) {
  return {
    schemaVersion: 1 as const,
    completeness: "historical_v16_partial" as const,
    known: {
      platform: row.root_object_platform!,
      verifierVersion: row.root_object_verifier_version!,
      canonicalPath: row.root_object_canonical_path!,
      canonicalPathKey: row.root_object_canonical_path_key!,
      volumeSerial: row.root_object_volume_serial!,
      objectID: row.root_object_id!,
      creationTime: row.root_object_creation_time!,
      changeTime: row.root_object_change_time!,
      kind: "directory" as const,
    },
    unknown: ["lastWriteTime", "size"] as const,
  }
}

const preparedMapWriteToken = Symbol("MaterialMap.PreparedMapWrite")

/** Owner-issued Map publication whose stable target preparation may join another local transaction. */
export class PreparedMapWrite {
  readonly mapID: MapID
  #commit: (tx: Transaction, time: number, advanceFrontier: boolean) => Effect.Effect<MapInfo, Error>
  #selector: (selectorID: SelectorID) => Effect.Effect<CurrentUseReceipt, Error>

  constructor(
    token: symbol,
    mapID: MapID,
    commit: (tx: Transaction, time: number, advanceFrontier: boolean) => Effect.Effect<MapInfo, Error>,
    selector: (selectorID: SelectorID) => Effect.Effect<CurrentUseReceipt, Error>,
  ) {
    if (token !== preparedMapWriteToken) throw new Error("Prepared Map writes are owner-issued")
    this.mapID = mapID
    this.#commit = commit
    this.#selector = selector
  }

  commit(tx: Transaction, time: number, advanceFrontier = false) {
    return this.#commit(tx, time, advanceFrontier)
  }

  selectorReceipt(selectorID: SelectorID) {
    return this.#selector(selectorID)
  }
}

export function prepareMapOwnerProof(tx: Transaction, mapID: MapID) {
  return Effect.map(
    requireMapInfo(tx, mapID),
    (map) =>
      new MapOwnerProof(ownerProofToken, {
        mapID: map.id,
        canonicalInput: map.canonicalInput,
        dispositionVersion: map.disposition.version,
        disposition: map.disposition.disposition,
        superseded: map.superseded,
      }),
  )
}

export function requireMapOwnerProof(tx: Transaction, proof: MapOwnerProof) {
  return Effect.gen(function* () {
    const expected = proof instanceof MapOwnerProof ? proof.expectation(ownerProofToken) : undefined
    if (!expected) return yield* new InvalidTransitionError({ detail: "Map-owner proof is not owner-issued" })
    const current = yield* prepareMapOwnerProof(tx, expected.mapID)
    if (
      current.receipt.canonicalInput !== expected.canonicalInput ||
      current.receipt.dispositionVersion !== expected.dispositionVersion ||
      current.receipt.disposition !== expected.disposition ||
      current.receipt.superseded !== expected.superseded
    ) {
      return yield* new ConflictError({ entity: "map_state", id: expected.mapID, detail: "Map state changed" })
    }
    return current
  })
}

export function prepareAlignmentOwnerProof(tx: Transaction, alignmentID: AlignmentID) {
  return Effect.map(
    requireAlignmentInfo(tx, alignmentID),
    (alignment) =>
      new AlignmentOwnerProof(ownerProofToken, {
        alignmentID: alignment.id,
        canonicalInput: alignment.canonicalInput,
        dispositionVersion: alignment.disposition.version,
        disposition: alignment.disposition.disposition,
        superseded: alignment.superseded,
      }),
  )
}

export function requireAlignmentOwnerProof(tx: Transaction, proof: AlignmentOwnerProof) {
  return Effect.gen(function* () {
    const expected = proof instanceof AlignmentOwnerProof ? proof.expectation(ownerProofToken) : undefined
    if (!expected) return yield* new InvalidTransitionError({ detail: "Alignment-owner proof is not owner-issued" })
    const current = yield* prepareAlignmentOwnerProof(tx, expected.alignmentID)
    if (
      current.receipt.canonicalInput !== expected.canonicalInput ||
      current.receipt.dispositionVersion !== expected.dispositionVersion ||
      current.receipt.disposition !== expected.disposition ||
      current.receipt.superseded !== expected.superseded
    ) {
      return yield* new ConflictError({
        entity: "alignment_state",
        id: expected.alignmentID,
        detail: "Alignment state changed",
      })
    }
    return current
  })
}

function sourceDescriptor(row: typeof MaterialMapArtifactTargetTable.$inferSelect) {
  return {
    platform: row.source_object_platform,
    verifierVersion: row.source_object_verifier_version,
    canonicalPath: row.source_object_canonical_path,
    canonicalPathKey: row.source_object_canonical_path_key,
    volumeSerial: row.source_object_volume_serial,
    objectID: row.source_object_id,
    creationTime: row.source_object_creation_time,
    changeTime: row.source_object_change_time,
    lastWriteTime: row.source_object_last_write_time,
    size: row.source_object_size,
    kind: "file" as const,
  }
}

function findMapInfo(source: Queryable, mapID: MapID) {
  return Effect.gen(function* () {
    const row = yield* source
      .select({ map: MaterialMapTable, state: MaterialMapStateTable })
      .from(MaterialMapTable)
      .innerJoin(MaterialMapStateTable, eq(MaterialMapStateTable.map_id, MaterialMapTable.id))
      .where(eq(MaterialMapTable.id, mapID))
      .get()
    if (!row) return undefined
    const target =
      row.map.target_kind === "artifact"
        ? yield* requireArtifactTarget(source, mapID)
        : yield* requireRepresentationTarget(source, mapID)
    const successor = yield* source
      .select({ id: MaterialMapTable.id })
      .from(MaterialMapTable)
      .where(eq(MaterialMapTable.supersedes_map_id, mapID))
      .limit(1)
      .get()
    return {
      id: row.map.id,
      canonicalInput: row.map.canonical_input,
      target,
      supersedesMapID: row.map.supersedes_map_id ?? undefined,
      authorship: {
        basis: row.map.authorship_basis,
        capabilityIdentity: row.map.authorship_capability_identity,
        capabilityVersion: row.map.authorship_capability_version,
      },
      timeCreated: row.map.time_created,
      disposition: {
        version: row.state.version,
        disposition: row.state.disposition,
        withdrawalReason: row.state.withdrawal_reason ?? undefined,
        timeUpdated: row.state.time_updated,
      },
      superseded: successor !== undefined,
    } satisfies MapInfo
  })
}

function requireMapInfo(source: Queryable, mapID: MapID) {
  return Effect.gen(function* () {
    const info = yield* findMapInfo(source, mapID)
    if (!info) return yield* new NotFoundError({ entity: "map", id: mapID })
    return info
  })
}

function requireArtifactTarget(source: Queryable, mapID: MapID) {
  return Effect.gen(function* () {
    const row = yield* source
      .select()
      .from(MaterialMapArtifactTargetTable)
      .where(eq(MaterialMapArtifactTargetTable.map_id, mapID))
      .get()
    if (!row) {
      return yield* new InvalidTransitionError({ detail: `Artifact target receipt is missing for Map ${mapID}` })
    }
    const authorization: ArtifactTargetReceipt["authorization"] =
      row.authority_kind === "content_root"
        ? row.root_object_descriptor_state === "historical_v16_partial"
          ? {
              kind: "content_root_historical_v16",
              root: historicalSourceRootDescriptor(row),
              relativePath: row.normalized_relative_path,
              canonicalPath: row.source_object_canonical_path,
              contentRoot: {
                contentRootID: row.content_root_id!,
                bindingID: row.content_root_binding_id!,
                bindingEpisodeID: row.content_root_binding_episode_id!,
                bindingEpisodeOrdinal: row.content_root_binding_episode_ordinal!,
                grantEpisodeID: row.content_root_grant_episode_id!,
                grantVersion: row.content_root_grant_version!,
              },
              grantEpisodeOrdinal: row.content_root_grant_episode_ordinal!,
            }
          : {
              kind: "content_root",
              root: sourceRootDescriptor(row),
              relativePath: row.normalized_relative_path,
              canonicalPath: row.source_object_canonical_path,
              contentRoot: {
                contentRootID: row.content_root_id!,
                bindingID: row.content_root_binding_id!,
                bindingEpisodeID: row.content_root_binding_episode_id!,
                bindingEpisodeOrdinal: row.content_root_binding_episode_ordinal!,
                grantEpisodeID: row.content_root_grant_episode_id!,
                grantVersion: row.content_root_grant_version!,
              },
              grantEpisodeOrdinal: row.content_root_grant_episode_ordinal!,
            }
        : row.authority_kind === "active_workspace"
          ? {
              kind: "active_workspace",
              root: sourceRootDescriptor(row),
              relativePath: row.normalized_relative_path,
              canonicalPath: row.source_object_canonical_path,
              workspaceIdentity: row.workspace_identity!,
            }
          : {
              kind: "one_operation",
              root: sourceRootDescriptor(row),
              relativePath: row.normalized_relative_path,
              canonicalPath: row.source_object_canonical_path,
              operationIdentity: row.operation_identity!,
              approvalBasis: row.operation_approval_basis!,
            }
    return {
      type: "artifact",
      effectiveArtifactID: row.artifact_id,
      revisionID: row.artifact_revision_id,
      attribution:
        row.attribution_type === "recorded"
          ? { type: "recorded" }
          : { type: "lineage_correction", memberID: row.attribution_member_id! },
      dispositionVersion: row.disposition_version,
      lineageVersion: row.lineage_version,
      sourceVersion: row.source_version,
      artifactBindingID: row.artifact_binding_id,
      activeLocation: row.active_location,
      descriptorObservationID: row.descriptor_observation_id,
      descriptorCorrectionID: row.descriptor_correction_id ?? undefined,
      fingerprint: {
        algorithm: row.fingerprint_algorithm,
        digest: row.fingerprint_digest,
        byteLength: row.byte_length,
      },
      mediaType: row.media_type,
      authorization,
      relativePath: row.normalized_relative_path,
      descriptor: sourceDescriptor(row),
      timeObserved: row.source_observed_time,
    } satisfies ArtifactTargetReceipt
  })
}

function requireRepresentationTarget(source: Queryable, mapID: MapID) {
  return Effect.gen(function* () {
    const row = yield* source
      .select()
      .from(MaterialMapRepresentationTargetTable)
      .where(eq(MaterialMapRepresentationTargetTable.map_id, mapID))
      .get()
    if (!row) {
      return yield* new InvalidTransitionError({ detail: `Representation target receipt is missing for Map ${mapID}` })
    }
    return {
      type: "representation",
      representationRevisionID: row.representation_revision_id,
    } satisfies RepresentationTargetReceipt
  })
}

function requireSelectorInfo(source: Queryable, mapID: MapID, selectorID: SelectorID) {
  return Effect.gen(function* () {
    const row = yield* source
      .select()
      .from(MaterialSelectorTable)
      .where(and(eq(MaterialSelectorTable.map_id, mapID), eq(MaterialSelectorTable.id, selectorID)))
      .get()
    if (!row) return yield* new NotFoundError({ entity: "selector", id: selectorID })
    return selectorInfo(row)
  })
}

function selectorInfo(row: typeof MaterialSelectorTable.$inferSelect): SelectorInfo {
  return {
    id: row.id,
    mapID: row.map_id,
    nodeID: row.node_id,
    position: row.selector_position,
    coordinate: selectorCoordinate(row),
    witness: {
      algorithm: row.witness_algorithm,
      digest: row.witness_digest,
      byteLength: row.witness_byte_length,
    },
  }
}

function selectorCoordinate(row: typeof MaterialSelectorTable.$inferSelect): MaterialSelector.Coordinate {
  if (row.kind === "whole_target.v1") return { kind: row.kind }
  if (row.kind === "artifact_byte_range.v1") {
    return { kind: row.kind, startByte: row.artifact_start_byte!, endByte: row.artifact_end_byte! }
  }
  if (row.kind === "pdf_page_range.v1") {
    return { kind: row.kind, startPage: row.pdf_start_page!, endPage: row.pdf_end_page! }
  }
  if (row.kind === "model_text_range.v1") {
    return { kind: row.kind, startScalar: row.model_start_scalar!, endScalar: row.model_end_scalar! }
  }
  return {
    kind: row.kind,
    start: { page: row.pdf_start_page!, item: row.pdf_start_item!, scalar: row.pdf_start_scalar! },
    end: { page: row.pdf_end_page!, item: row.pdf_end_item!, scalar: row.pdf_end_scalar! },
  }
}

function requireCurrentMapSelector(source: Queryable, mapID: MapID, selectorID: SelectorID) {
  return Effect.gen(function* () {
    const map = yield* requireMapInfo(source, mapID)
    if (map.disposition.disposition !== "active") return yield* new InactiveError({ entity: "map", id: mapID })
    const selector = yield* requireSelectorInfo(source, mapID, selectorID)
    return { map, selector }
  })
}

function findAlignmentInfo(source: Transaction, alignmentID: AlignmentID) {
  return Effect.gen(function* () {
    const row = yield* source
      .select({ alignment: MaterialCourseAlignmentTable, state: MaterialCourseAlignmentStateTable })
      .from(MaterialCourseAlignmentTable)
      .innerJoin(
        MaterialCourseAlignmentStateTable,
        eq(MaterialCourseAlignmentStateTable.alignment_id, MaterialCourseAlignmentTable.id),
      )
      .where(eq(MaterialCourseAlignmentTable.id, alignmentID))
      .get()
    if (!row) return undefined
    const successor = yield* source
      .select({ id: MaterialCourseAlignmentTable.id })
      .from(MaterialCourseAlignmentTable)
      .where(eq(MaterialCourseAlignmentTable.supersedes_alignment_id, alignmentID))
      .limit(1)
      .get()
    const endpoint = {
      courseID: row.alignment.course_id,
      viewID: row.alignment.view_id,
      revisionID: row.alignment.revision_id,
      itemID: row.alignment.item_id,
    }
    const selection =
      row.alignment.selection_basis === "explicit_exact"
        ? { type: "explicit_exact" as const }
        : {
            type: "observed_working" as const,
            revisionID: row.alignment.observed_selection_revision_id!,
            version: row.alignment.observed_selection_version!,
          }
    const map = yield* requireMapInfo(source, row.alignment.map_id)
    const material =
      map.target.type === "artifact"
        ? yield* Artifact.inspectOrdinaryUseByteStatus(source, {
            effectiveArtifactID: map.target.effectiveArtifactID,
            dispositionVersion: map.target.dispositionVersion,
            currentRevisionID: map.target.revisionID,
            attribution: map.target.attribution,
            lineageVersion: map.target.lineageVersion,
            fingerprint: map.target.fingerprint,
          })
        : yield* Representation.inspectCurrentUseStatus(source, map.target.representationRevisionID)
    const course = yield* Course.inspectMembershipStatus(source, endpoint, selection)
    const staleCauses: AlignmentStaleCause[] = [
      ...(row.state.disposition === "withdrawn" ? [{ side: "relation", reason: "withdrawn" } as const] : []),
      ...(successor ? [{ side: "relation", reason: "superseded" } as const] : []),
      ...(map.disposition.disposition === "withdrawn" ? [{ side: "map", reason: "withdrawn" } as const] : []),
      ...(map.superseded ? [{ side: "map", reason: "superseded" } as const] : []),
      ...(material.status === "stale"
        ? [{ side: "material", target: map.target.type, reason: material.cause } as AlignmentStaleCause]
        : []),
      ...(course.status === "stale" ? [{ side: "course", reason: course.cause } as const] : []),
    ]
    const projection: AlignmentProjection =
      staleCauses.length > 0 ? { status: "stale", staleCauses } : { status: "content_unverified", staleCauses: [] }
    return {
      id: row.alignment.id,
      canonicalInput: row.alignment.canonical_input,
      mapID: row.alignment.map_id,
      selectorID: row.alignment.selector_id,
      course: endpoint,
      selection,
      membershipReceipt: {
        endpoint,
        selection,
        courseVersion: row.alignment.accepted_course_version,
        viewVersion: row.alignment.accepted_view_version,
        revisionVersion: row.alignment.accepted_revision_version,
      },
      reason: row.alignment.reason,
      supersedesAlignmentID: row.alignment.supersedes_alignment_id ?? undefined,
      authorship: {
        basis: row.alignment.authorship_basis,
        capabilityIdentity: row.alignment.authorship_capability_identity,
        capabilityVersion: row.alignment.authorship_capability_version,
      },
      timeCreated: row.alignment.time_created,
      disposition: {
        version: row.state.version,
        disposition: row.state.disposition,
        withdrawalReason: row.state.withdrawal_reason ?? undefined,
        timeUpdated: row.state.time_updated,
      },
      superseded: successor !== undefined,
      projection,
    } satisfies AlignmentInfo
  })
}

function requireAlignmentInfo(source: Transaction, alignmentID: AlignmentID) {
  return Effect.gen(function* () {
    const info = yield* findAlignmentInfo(source, alignmentID)
    if (!info) return yield* new NotFoundError({ entity: "alignment", id: alignmentID })
    return info
  })
}

function sameAttribution(left: Artifact.AttributionBasis, right: Artifact.AttributionBasis) {
  if (left.type !== right.type) return false
  if (left.type === "recorded" || right.type === "recorded") return true
  return left.memberID === right.memberID
}

function sameWitness(left: MaterialSelector.Witness, right: MaterialSelector.Witness) {
  return left.algorithm === right.algorithm && left.digest === right.digest && left.byteLength === right.byteLength
}

function listMapsPage(
  source: Queryable,
  target: MapTarget,
  includeWithdrawn: boolean,
  includeSuperseded: boolean,
  limit: number,
  after: readonly [number, MapID] | undefined,
  scope: MaterialMapCursor.Scope,
) {
  return Effect.gen(function* () {
    const rows =
      target.type === "artifact"
        ? yield* source
            .select({ id: MaterialMapTable.id, time_created: MaterialMapTable.time_created })
            .from(MaterialMapTable)
            .innerJoin(MaterialMapStateTable, eq(MaterialMapStateTable.map_id, MaterialMapTable.id))
            .innerJoin(MaterialMapArtifactTargetTable, eq(MaterialMapArtifactTargetTable.map_id, MaterialMapTable.id))
            .where(
              and(
                eq(MaterialMapArtifactTargetTable.artifact_id, target.effectiveArtifactID),
                eq(MaterialMapArtifactTargetTable.artifact_revision_id, target.revisionID),
                eq(MaterialMapArtifactTargetTable.attribution_type, target.attribution.type),
                target.attribution.type === "recorded"
                  ? isNull(MaterialMapArtifactTargetTable.attribution_member_id)
                  : eq(MaterialMapArtifactTargetTable.attribution_member_id, target.attribution.memberID),
                includeWithdrawn ? undefined : eq(MaterialMapStateTable.disposition, "active"),
                includeSuperseded
                  ? undefined
                  : sql`NOT EXISTS (SELECT 1 FROM material_map AS successor WHERE successor.supersedes_map_id = ${MaterialMapTable.id})`,
                after
                  ? or(
                      gt(MaterialMapTable.time_created, after[0]),
                      and(eq(MaterialMapTable.time_created, after[0]), gt(MaterialMapTable.id, after[1])),
                    )
                  : undefined,
              ),
            )
            .orderBy(asc(MaterialMapTable.time_created), asc(MaterialMapTable.id))
            .limit(limit + 1)
            .all()
        : yield* source
            .select({ id: MaterialMapTable.id, time_created: MaterialMapTable.time_created })
            .from(MaterialMapTable)
            .innerJoin(MaterialMapStateTable, eq(MaterialMapStateTable.map_id, MaterialMapTable.id))
            .innerJoin(
              MaterialMapRepresentationTargetTable,
              eq(MaterialMapRepresentationTargetTable.map_id, MaterialMapTable.id),
            )
            .where(
              and(
                eq(MaterialMapRepresentationTargetTable.representation_revision_id, target.representationRevisionID),
                includeWithdrawn ? undefined : eq(MaterialMapStateTable.disposition, "active"),
                includeSuperseded
                  ? undefined
                  : sql`NOT EXISTS (SELECT 1 FROM material_map AS successor WHERE successor.supersedes_map_id = ${MaterialMapTable.id})`,
                after
                  ? or(
                      gt(MaterialMapTable.time_created, after[0]),
                      and(eq(MaterialMapTable.time_created, after[0]), gt(MaterialMapTable.id, after[1])),
                    )
                  : undefined,
              ),
            )
            .orderBy(asc(MaterialMapTable.time_created), asc(MaterialMapTable.id))
            .limit(limit + 1)
            .all()
    const selected = rows.slice(0, limit)
    const items = yield* Effect.forEach(selected, (row) => requireMapInfo(source, row.id))
    const keys = new Map(selected.map((row) => [row.id, [row.time_created, row.id] as const]))
    return pageResult(items, rows.length > limit, scope, (item) => keys.get(item.id)!)
  })
}

function listOutlinePage(
  source: Queryable,
  mapID: MapID,
  limit: number,
  after: readonly [number, string] | undefined,
  scope: MaterialMapCursor.Scope,
) {
  return Effect.gen(function* () {
    yield* requireMapInfo(source, mapID)
    const rows = yield* source
      .select()
      .from(MaterialOutlineNodeTable)
      .where(
        and(
          eq(MaterialOutlineNodeTable.map_id, mapID),
          after
            ? or(
                gt(MaterialOutlineNodeTable.preorder_position, after[0]),
                and(
                  eq(MaterialOutlineNodeTable.preorder_position, after[0]),
                  gt(MaterialOutlineNodeTable.id, after[1] as OutlineNodeInfo["id"]),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(MaterialOutlineNodeTable.preorder_position), asc(MaterialOutlineNodeTable.id))
      .limit(limit + 1)
      .all()
    const selected = rows.slice(0, limit)
    const items = yield* Effect.forEach(selected, (row) =>
      Effect.gen(function* () {
        const selectors = yield* source
          .select()
          .from(MaterialSelectorTable)
          .where(and(eq(MaterialSelectorTable.map_id, mapID), eq(MaterialSelectorTable.node_id, row.id)))
          .orderBy(asc(MaterialSelectorTable.selector_position), asc(MaterialSelectorTable.id))
          .all()
        return {
          id: row.id,
          mapID: row.map_id,
          parentNodeID: row.parent_node_id ?? undefined,
          title: row.title,
          preorderPosition: row.preorder_position,
          depth: row.depth,
          selectors: selectors.map(selectorInfo),
        } satisfies OutlineNodeInfo
      }),
    )
    const keys = new Map(selected.map((row) => [row.id, [row.preorder_position, row.id] as const]))
    return pageResult(items, rows.length > limit, scope, (item) => keys.get(item.id)!)
  })
}

function listSelectorsPage(
  source: Queryable,
  mapID: MapID,
  nodeID: OutlineNodeID,
  limit: number,
  after: readonly [number, string] | undefined,
  scope: MaterialMapCursor.Scope,
) {
  return Effect.gen(function* () {
    yield* requireMapInfo(source, mapID)
    const node = yield* source
      .select({ id: MaterialOutlineNodeTable.id })
      .from(MaterialOutlineNodeTable)
      .where(and(eq(MaterialOutlineNodeTable.map_id, mapID), eq(MaterialOutlineNodeTable.id, nodeID)))
      .get()
    if (!node) return yield* new NotFoundError({ entity: "outline_node", id: nodeID })
    const rows = yield* source
      .select()
      .from(MaterialSelectorTable)
      .where(
        and(
          eq(MaterialSelectorTable.map_id, mapID),
          eq(MaterialSelectorTable.node_id, nodeID),
          after
            ? or(
                gt(MaterialSelectorTable.selector_position, after[0]),
                and(
                  eq(MaterialSelectorTable.selector_position, after[0]),
                  gt(MaterialSelectorTable.id, after[1] as SelectorID),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(MaterialSelectorTable.selector_position), asc(MaterialSelectorTable.id))
      .limit(limit + 1)
      .all()
    const selected = rows.slice(0, limit)
    const items = selected.map(selectorInfo)
    const keys = new Map(selected.map((row) => [row.id, [row.selector_position, row.id] as const]))
    return pageResult(items, rows.length > limit, scope, (item) => keys.get(item.id)!)
  })
}

function listOutlineNodesPage(
  source: Queryable,
  mapID: MapID,
  limit: number,
  after: readonly [number, string] | undefined,
  scope: MaterialMapCursor.Scope,
) {
  return Effect.gen(function* () {
    yield* requireMapInfo(source, mapID)
    const rows = yield* source
      .select()
      .from(MaterialOutlineNodeTable)
      .where(
        and(
          eq(MaterialOutlineNodeTable.map_id, mapID),
          after
            ? or(
                gt(MaterialOutlineNodeTable.preorder_position, after[0]),
                and(
                  eq(MaterialOutlineNodeTable.preorder_position, after[0]),
                  gt(MaterialOutlineNodeTable.id, after[1] as OutlineNodeID),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(MaterialOutlineNodeTable.preorder_position), asc(MaterialOutlineNodeTable.id))
      .limit(limit + 1)
      .all()
    const selected = rows.slice(0, limit)
    const items = yield* Effect.forEach(selected, (row) =>
      source
        .select({ count: count() })
        .from(MaterialSelectorTable)
        .where(and(eq(MaterialSelectorTable.map_id, mapID), eq(MaterialSelectorTable.node_id, row.id)))
        .get()
        .pipe(
          Effect.map(
            (selectors) =>
              ({
                id: row.id,
                mapID: row.map_id,
                parentNodeID: row.parent_node_id ?? undefined,
                title: row.title,
                preorderPosition: row.preorder_position,
                depth: row.depth,
                selectorCount: selectors?.count ?? 0,
              }) satisfies OutlineNodeSummary,
          ),
        ),
    )
    const keys = new Map(selected.map((row) => [row.id, [row.preorder_position, row.id] as const]))
    return pageResult(items, rows.length > limit, scope, (item) => keys.get(item.id)!)
  })
}

function listMapSuccessorsPage(
  source: Queryable,
  mapID: MapID,
  limit: number,
  after: readonly [number, MapID] | undefined,
  scope: MaterialMapCursor.Scope,
) {
  return Effect.gen(function* () {
    yield* requireMapInfo(source, mapID)
    const rows = yield* source
      .select({ id: MaterialMapTable.id, time_created: MaterialMapTable.time_created })
      .from(MaterialMapTable)
      .where(
        and(
          eq(MaterialMapTable.supersedes_map_id, mapID),
          after
            ? or(
                gt(MaterialMapTable.time_created, after[0]),
                and(eq(MaterialMapTable.time_created, after[0]), gt(MaterialMapTable.id, after[1])),
              )
            : undefined,
        ),
      )
      .orderBy(asc(MaterialMapTable.time_created), asc(MaterialMapTable.id))
      .limit(limit + 1)
      .all()
    const selected = rows.slice(0, limit)
    const items = yield* Effect.forEach(selected, (row) => requireMapInfo(source, row.id))
    const keys = new Map(selected.map((row) => [row.id, [row.time_created, row.id] as const]))
    return pageResult(items, rows.length > limit, scope, (item) => keys.get(item.id)!)
  })
}

function listAlignments(
  db: DatabaseShape,
  input: {
    readonly endpoint: "map_alignments" | "selector_alignments" | "membership_alignments" | "alignment_successors"
    readonly parent: string
    readonly options?: AlignmentListOptions | PageOptions
    readonly where?: SQL
  },
) {
  return Effect.gen(function* () {
    const history = input.endpoint === "alignment_successors"
    const includeWithdrawn = history
      ? true
      : ((input.options as AlignmentListOptions | undefined)?.includeWithdrawn ?? false)
    const includeSuperseded = history
      ? true
      : ((input.options as AlignmentListOptions | undefined)?.includeSuperseded ?? false)
    const scope = {
      endpoint: input.endpoint,
      parent: input.parent,
      filter: `${includeWithdrawn}/${includeSuperseded}`,
    } satisfies MaterialMapCursor.Scope
    const page = yield* MaterialMapCursor.options(input.options, scope)
    const after = yield* timeAlignmentKey(page.key)
    return yield* snapshot(db, (tx) =>
      Effect.gen(function* () {
        const rows = yield* tx
          .select({ id: MaterialCourseAlignmentTable.id, time_created: MaterialCourseAlignmentTable.time_created })
          .from(MaterialCourseAlignmentTable)
          .innerJoin(
            MaterialCourseAlignmentStateTable,
            eq(MaterialCourseAlignmentStateTable.alignment_id, MaterialCourseAlignmentTable.id),
          )
          .where(
            and(
              input.where,
              includeWithdrawn ? undefined : eq(MaterialCourseAlignmentStateTable.disposition, "active"),
              includeSuperseded
                ? undefined
                : sql`NOT EXISTS (SELECT 1 FROM material_course_alignment AS successor WHERE successor.supersedes_alignment_id = ${MaterialCourseAlignmentTable.id})`,
              after
                ? or(
                    gt(MaterialCourseAlignmentTable.time_created, after[0]),
                    and(
                      eq(MaterialCourseAlignmentTable.time_created, after[0]),
                      gt(MaterialCourseAlignmentTable.id, after[1]),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(asc(MaterialCourseAlignmentTable.time_created), asc(MaterialCourseAlignmentTable.id))
          .limit(page.limit + 1)
          .all()
        const selected = rows.slice(0, page.limit)
        const items = yield* Effect.forEach(selected, (row) => requireAlignmentInfo(tx, row.id))
        const keys = new Map(selected.map((row) => [row.id, [row.time_created, row.id] as const]))
        return pageResult(items, rows.length > page.limit, scope, (item) => keys.get(item.id)!)
      }),
    )
  })
}

function listDispositions(
  db: DatabaseShape,
  entity: "map" | "alignment",
  id: MapID | AlignmentID,
  _table: typeof MaterialMapDispositionEventTable | typeof MaterialCourseAlignmentDispositionEventTable,
  options?: PageOptions,
) {
  return Effect.gen(function* () {
    const scope = {
      endpoint: entity === "map" ? ("map_dispositions" as const) : ("alignment_dispositions" as const),
      parent: id,
      filter: "exact",
    }
    const page = yield* MaterialMapCursor.options(options, scope)
    const after = yield* numberIDKey(page.key)
    return yield* snapshot(db, (tx) =>
      Effect.gen(function* () {
        if (entity === "map") {
          yield* requireMapInfo(tx, id as MapID)
          const rows = yield* tx
            .select()
            .from(MaterialMapDispositionEventTable)
            .where(
              and(
                eq(MaterialMapDispositionEventTable.map_id, id as MapID),
                after
                  ? or(
                      gt(MaterialMapDispositionEventTable.version, after[0]),
                      and(
                        eq(MaterialMapDispositionEventTable.version, after[0]),
                        gt(MaterialMapDispositionEventTable.id, after[1] as DispositionEventID),
                      ),
                    )
                  : undefined,
              ),
            )
            .orderBy(asc(MaterialMapDispositionEventTable.version), asc(MaterialMapDispositionEventTable.id))
            .limit(page.limit + 1)
            .all()
          const selected = rows.slice(0, page.limit)
          const items = selected.map(dispositionEvent)
          const keys = new Map(selected.map((row) => [row.version, [row.version, row.id] as const]))
          return pageResult(items, rows.length > page.limit, scope, (item) => keys.get(item.version)!)
        }
        yield* requireAlignmentInfo(tx, id as AlignmentID)
        const rows = yield* tx
          .select()
          .from(MaterialCourseAlignmentDispositionEventTable)
          .where(
            and(
              eq(MaterialCourseAlignmentDispositionEventTable.alignment_id, id as AlignmentID),
              after
                ? or(
                    gt(MaterialCourseAlignmentDispositionEventTable.version, after[0]),
                    and(
                      eq(MaterialCourseAlignmentDispositionEventTable.version, after[0]),
                      gt(MaterialCourseAlignmentDispositionEventTable.id, after[1] as AlignmentDispositionEventID),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(
            asc(MaterialCourseAlignmentDispositionEventTable.version),
            asc(MaterialCourseAlignmentDispositionEventTable.id),
          )
          .limit(page.limit + 1)
          .all()
        const selected = rows.slice(0, page.limit)
        const items = selected.map(dispositionEvent)
        const keys = new Map(selected.map((row) => [row.version, [row.version, row.id] as const]))
        return pageResult(items, rows.length > page.limit, scope, (item) => keys.get(item.version)!)
      }),
    )
  })
}

function dispositionEvent(row: {
  readonly version: number
  readonly disposition: "active" | "withdrawn"
  readonly reason: string | null
  readonly time_committed: number
}): DispositionEvent {
  return {
    version: row.version,
    disposition: row.disposition,
    reason: row.reason ?? undefined,
    timeCommitted: row.time_committed,
  }
}

function transitionMap(
  db: DatabaseShape,
  mapID: MapID,
  expectedVersion: number,
  disposition: "active" | "withdrawn",
  inputReason?: string,
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const current = yield* requireMapInfo(tx, mapID)
        if (current.disposition.version !== expectedVersion) {
          return yield* new ConflictError({
            entity: "map_state",
            id: mapID,
            detail: "Map disposition version changed",
          })
        }
        if (current.disposition.disposition === disposition) {
          return yield* new InvalidTransitionError({
            detail: disposition === "active" ? "Map is already active" : "Map is already withdrawn",
          })
        }
        const reason = disposition === "withdrawn" ? normalizeText(inputReason ?? "") : undefined
        if (disposition === "withdrawn" && !boundedText(reason!, limits.reasonCharacters)) {
          return yield* new InvalidTransitionError({ detail: "Map withdrawal reason must be nonempty and bounded" })
        }
        const time = Date.now()
        yield* tx.insert(MaterialMapDispositionEventTable).values({
          id: createDispositionEventID(),
          map_id: mapID,
          version: expectedVersion + 1,
          disposition,
          reason,
          time_committed: time,
        })
        yield* LearningFrontier.advance(tx, { time })
        return yield* requireMapInfo(tx, mapID)
      }),
    )
    .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die), Effect.catchTag("SqlError", Effect.die))
}

function transitionAlignment(
  db: DatabaseShape,
  alignmentID: AlignmentID,
  expectedVersion: number,
  disposition: "active" | "withdrawn",
  inputReason?: string,
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const current = yield* requireAlignmentInfo(tx, alignmentID)
        if (current.disposition.version !== expectedVersion) {
          return yield* new ConflictError({
            entity: "alignment_state",
            id: alignmentID,
            detail: "Alignment disposition version changed",
          })
        }
        if (current.disposition.disposition === disposition) {
          return yield* new InvalidTransitionError({
            detail: disposition === "active" ? "Alignment is already active" : "Alignment is already withdrawn",
          })
        }
        const reason = disposition === "withdrawn" ? normalizeText(inputReason ?? "") : undefined
        if (disposition === "withdrawn" && !boundedText(reason!, limits.reasonCharacters)) {
          return yield* new InvalidTransitionError({
            detail: "Alignment withdrawal reason must be nonempty and bounded",
          })
        }
        const time = Date.now()
        yield* tx.insert(MaterialCourseAlignmentDispositionEventTable).values({
          id: createAlignmentDispositionEventID(),
          alignment_id: alignmentID,
          version: expectedVersion + 1,
          disposition,
          reason,
          time_committed: time,
        })
        yield* LearningFrontier.advance(tx, { time })
        return yield* requireAlignmentInfo(tx, alignmentID)
      }),
    )
    .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.die), Effect.catchTag("SqlError", Effect.die))
}

function timeIDKey(key: readonly (string | number)[] | undefined) {
  if (key === undefined) return Effect.succeed(undefined)
  if (key.length !== 2 || typeof key[0] !== "number" || typeof key[1] !== "string") {
    return Effect.fail(new InvalidCursorError({ detail: "Map cursor key is invalid" }))
  }
  return Effect.succeed([key[0], key[1] as MapID] as const)
}

function timeAlignmentKey(key: readonly (string | number)[] | undefined) {
  if (key === undefined) return Effect.succeed(undefined)
  if (key.length !== 2 || typeof key[0] !== "number" || typeof key[1] !== "string") {
    return Effect.fail(new InvalidCursorError({ detail: "Alignment cursor key is invalid" }))
  }
  return Effect.succeed([key[0], key[1] as AlignmentID] as const)
}

function numberIDKey(key: readonly (string | number)[] | undefined) {
  if (key === undefined) return Effect.succeed(undefined)
  if (key.length !== 2 || typeof key[0] !== "number" || typeof key[1] !== "string") {
    return Effect.fail(new InvalidCursorError({ detail: "Material cursor key is invalid" }))
  }
  return Effect.succeed([key[0], key[1]] as const)
}

function pageResult<T>(
  items: T[],
  hasMore: boolean,
  scope: MaterialMapCursor.Scope,
  key: (item: T) => readonly (string | number)[],
): Page<T> {
  const last = items.at(-1)
  return { items, cursor: hasMore && last ? MaterialMapCursor.next(scope, key(last)) : undefined }
}
