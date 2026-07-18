export * as Representation from "./representation"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm"
import { Context, Effect, Exit, Layer, Scope, Semaphore } from "effect"
import { Artifact } from "./artifact"
import { ContentRoot } from "./content-root"
import { ContentRootNTFS } from "./content-root/ntfs"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { ModelRenditionProfile } from "./representation/model-rendition-profile"
import { PDFTextProfile } from "./representation/pdf-text-profile"
import {
  ConflictError,
  ContinuedUseGrantID,
  ConversionAuthority,
  CurrentUseDeniedError,
  EffectID,
  IntegrityBudgetExceededError,
  InvalidReadError,
  InvalidTransitionError,
  LearnerAuthority,
  NotFoundError,
  ReturnBudgetExceededError,
  RevisionID,
  StorageError,
  UnavailableError,
  createAvailabilityEventID,
  createContinuedUseGrantID,
  createEffectID,
  createRevisionID,
  localPDFRecipe,
  type AcceptanceBasis,
  type Availability,
  type AvailabilityBasis,
  type ConfiguredModelProvenance,
  type ConfiguredModelUsage,
  type Diagnostic,
  type LocalPDFProvenance,
  type LocalPDFUsage,
  type ProducerKind,
  type ProducerProvenance,
  type ProducerUsage,
  type Profile,
  type ResultBoundary,
  type TerminalStatus,
} from "./representation/schema"
import {
  RepresentationAvailabilityCurrentTable,
  RepresentationAvailabilityEventTable,
  RepresentationContinuedUseGrantTable,
  RepresentationEffectTable,
  RepresentationRevisionTable,
} from "./representation/sql"
import { RepresentationStorage } from "./representation/storage"

export {
  ConflictError,
  ContinuedUseGrantID,
  ConversionAuthority,
  CurrentUseDeniedError,
  EffectID,
  IntegrityBudgetExceededError,
  InvalidReadError,
  InvalidTransitionError,
  LearnerAuthority,
  NotFoundError,
  ReturnBudgetExceededError,
  RevisionID,
  StorageError,
  UnavailableError,
  createContinuedUseGrantID,
  createEffectID,
  createRevisionID,
  localPDFRecipe,
} from "./representation/schema"
export type {
  AcceptanceBasis,
  Availability,
  ConfiguredModelProvenance,
  ConfiguredModelUsage,
  Diagnostic,
  LocalPDFProvenance,
  LocalPDFUsage,
  ProducerKind,
  ProducerProvenance,
  ProducerUsage,
  Profile,
  ResultBoundary,
  TerminalStatus,
} from "./representation/schema"

type DatabaseShape = EffectDrizzleSqlite.EffectSQLiteDatabase
export type Transaction = Parameters<Parameters<DatabaseShape["transaction"]>[0]>[0]
type Queryable = DatabaseShape | Transaction
type RevisionRow = typeof RepresentationRevisionTable.$inferSelect
type AvailabilityRow = typeof RepresentationAvailabilityCurrentTable.$inferSelect
type GrantRow = typeof RepresentationContinuedUseGrantTable.$inferSelect

export type SourceProof = {
  readonly ordinary: Artifact.OrdinaryUseRevisionSnapshot
  readonly sourceVersion: number
  readonly authorization: ContentRoot.ReadAuthorizationReceipt
  readonly relativePath: string
  readonly descriptor: ContentRootNTFS.Descriptor
  readonly timeObserved: number
}

export type ConversionIdentity = {
  readonly effectiveArtifactID: Artifact.ArtifactID
  readonly sourceRevisionID: Artifact.RevisionID
  readonly attribution: Artifact.AttributionBasis
  readonly recipe: ProducerProvenance
  readonly authority: ConversionAuthority
}

export type ProducerCandidate =
  | {
      readonly kind: "local_pdf"
      readonly runIdentity: string
      readonly provenance: LocalPDFProvenance
      readonly input: Artifact.Fingerprint
      readonly bytes: Uint8Array
      readonly diagnostics: readonly Diagnostic[]
      readonly usage: LocalPDFUsage
    }
  | {
      readonly kind: "configured_model"
      readonly runIdentity: string
      readonly provenance: ConfiguredModelProvenance
      readonly input: Artifact.Fingerprint
      readonly bytes: Uint8Array
      readonly diagnostics: readonly Diagnostic[]
      readonly usage: ConfiguredModelUsage
    }

export type AcceptanceInput = ConversionIdentity & {
  readonly candidateRevisionID: RevisionID
  readonly sourceProof: SourceProof
  readonly candidate: ProducerCandidate
  readonly timeAccepted: number
}

export type AvailabilityInfo = {
  readonly version: number
  readonly disposition: Availability
  readonly timeUpdated: number
}

export type RepresentationInfo = {
  readonly id: RevisionID
  readonly effectID: EffectID
  readonly sourceProof: SourceProof
  readonly producer: {
    readonly kind: ProducerKind
    readonly identity: string
    readonly version: string
    readonly providerID?: string
    readonly modelID?: string
    readonly profileVariant?: string
    readonly provenance: ProducerProvenance
    readonly runIdentity: string
    readonly diagnostics: readonly Diagnostic[]
    readonly usage: ProducerUsage
  }
  readonly profile: Profile
  readonly resultBoundary: ResultBoundary
  readonly terminalStatus: TerminalStatus
  readonly acceptanceBasis: AcceptanceBasis
  readonly output: {
    readonly mediaType: string
    readonly storageKey: string
    readonly digest: string
    readonly byteLength: number
    readonly recordCount: number
  }
  readonly creation: {
    readonly basis: "deterministic_operation" | "learning_command"
    readonly identity: string
    readonly authorizationBasis: string
    readonly deliveryMode: "deterministic" | "model_tool"
    readonly causalOccurrenceID?: string
    readonly causalInvocationPartID?: string
  }
  readonly availability: AvailabilityInfo
  readonly timeAccepted: number
}

export type ConversionResolution =
  | { readonly type: "new"; readonly semanticFingerprint: string }
  | { readonly type: "already_accepted"; readonly representation: RepresentationInfo }

export type PreparedAcceptance =
  | { readonly type: "already_accepted"; readonly representation: RepresentationInfo }
  | {
      readonly type: "candidate"
      readonly commit: (
        tx: Transaction,
      ) => Effect.Effect<RepresentationInfo, Artifact.Error | ConflictError | NotFoundError>
    }

export type ContinuedUseGrantInfo = {
  readonly id: ContinuedUseGrantID
  readonly effectiveArtifactID: Artifact.ArtifactID
  readonly representationRevisionID: RevisionID
  readonly oldSourceRevisionID: Artifact.RevisionID
  readonly currentSourceRevisionID: Artifact.RevisionID
  readonly currentAttribution: Artifact.AttributionBasis
  readonly currentLineageVersion: number
  readonly version: number
  readonly disposition: "active" | "revoked"
  readonly authorizationBasis: string
  readonly authorizationOperationIdentity: string
  readonly causalOccurrenceID?: string
  readonly causalInvocationPartID?: string
  readonly revocationBasis?: string
  readonly revocationOperationIdentity?: string
  readonly timeAuthorized: number
  readonly timeRevoked?: number
  readonly timeUpdated: number
}

export type ReadBudgets = {
  readonly integrityScanBytes: number
  readonly returnBytes: number
  readonly records: number
}

export type ReadSelection =
  | { readonly type: "whole" }
  | { readonly type: "pdf_pages"; readonly startPage: number }
  | { readonly type: "model_document" }

export type VerifiedContent = {
  readonly bytes: Uint8Array
  readonly records: number
  readonly nextPage?: number
  readonly truncated: boolean
}

export type HistoricalRead = {
  readonly use: "historical"
  readonly representation: RepresentationInfo
  readonly content: VerifiedContent
}

export type CurrentUseRead = {
  readonly use: "current"
  readonly representation: RepresentationInfo
  readonly content: VerifiedContent
  readonly admission:
    | {
        readonly basis: "current_revision"
        readonly artifact: Artifact.OrdinaryUseRevisionSnapshot
      }
    | {
        readonly basis: "continued_use_grant"
        readonly artifact: Artifact.OrdinaryUseRevisionSnapshot
        readonly grantID: ContinuedUseGrantID
        readonly grantVersion: number
      }
}

export interface Interface {
  readonly resolveConversion: (
    input: ConversionIdentity,
  ) => Effect.Effect<ConversionResolution, ConflictError | InvalidTransitionError>
  readonly prepareAcceptance: (input: AcceptanceInput) => Effect.Effect<PreparedAcceptance, Error, Scope.Scope>
  readonly accept: (input: AcceptanceInput) => Effect.Effect<RepresentationInfo, Error>
  readonly get: (revisionID: RevisionID) => Effect.Effect<RepresentationInfo, Error>
  readonly listForArtifact: (input: {
    readonly effectiveArtifactID: Artifact.ArtifactID
    readonly after?: RevisionID
    readonly limit?: number
  }) => Effect.Effect<readonly RepresentationInfo[], Error>
  readonly authorizeContinuedUse: (input: {
    readonly representationRevisionID: RevisionID
    readonly expectedArtifact: Artifact.OrdinaryUseSnapshot
    readonly authority: LearnerAuthority
    readonly timeAuthorized: number
  }) => Effect.Effect<ContinuedUseGrantInfo, Error>
  readonly revokeContinuedUse: (input: {
    readonly grantID: ContinuedUseGrantID
    readonly expectedVersion: number
    readonly authority: LearnerAuthority
    readonly timeRevoked: number
  }) => Effect.Effect<ContinuedUseGrantInfo, Error>
  readonly listContinuedUseGrants: (input: {
    readonly effectiveArtifactID: Artifact.ArtifactID
    readonly representationRevisionID?: RevisionID
  }) => Effect.Effect<readonly ContinuedUseGrantInfo[], Error>
  readonly explicitlyDelete: (input: {
    readonly representationRevisionID: RevisionID
    readonly expectedAvailabilityVersion: number
    readonly integrityScanBytes: number
    readonly authority: LearnerAuthority
    readonly timeDeleted: number
  }) => Effect.Effect<RepresentationInfo, Error>
  readonly reconcileAvailability: (input: {
    readonly representationRevisionID: RevisionID
    readonly integrityScanBytes: number
  }) => Effect.Effect<RepresentationInfo, Error>
  readonly cleanup: (input: {
    readonly now: number
    readonly minimumAgeMs: number
  }) => Effect.Effect<RepresentationStorage.CleanupResult, Error>
}

export interface HistoricalReaderInterface {
  readonly readHistorical: (input: {
    readonly representationRevisionID: RevisionID
    readonly selection: ReadSelection
    readonly budgets: ReadBudgets
  }) => Effect.Effect<HistoricalRead, Error>
}

export interface CurrentUseReaderInterface {
  readonly readForCurrentUse: (input: {
    readonly representationRevisionID: RevisionID
    readonly effectiveArtifactID: Artifact.ArtifactID
    readonly selection: ReadSelection
    readonly budgets: ReadBudgets
  }) => Effect.Effect<CurrentUseRead, Error>
}

export class Service extends Context.Service<Service, Interface>()("@repa/Representation") {}
export class HistoricalReader extends Context.Service<HistoricalReader, HistoricalReaderInterface>()(
  "@repa/Representation/HistoricalReader",
) {}
export class CurrentUseReader extends Context.Service<CurrentUseReader, CurrentUseReaderInterface>()(
  "@repa/Representation/CurrentUseReader",
) {}

export type Error =
  | Artifact.Error
  | ConflictError
  | CurrentUseDeniedError
  | IntegrityBudgetExceededError
  | InvalidReadError
  | InvalidTransitionError
  | NotFoundError
  | ReturnBudgetExceededError
  | StorageError
  | UnavailableError

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const acceptance = yield* Semaphore.make(1)

    const resolveConversion: Interface["resolveConversion"] = Effect.fn("Representation.resolveConversion")(
      function* (input) {
        const normalized = yield* normalizeIdentity(input)
        return yield* snapshot(db, (tx) => resolveConversionTx(tx, normalized))
      },
    )

    const get: Interface["get"] = Effect.fn("Representation.get")(function* (revisionID) {
      return yield* snapshot(db, (tx) => requireRepresentationInfo(tx, revisionID))
    })

    const listForArtifact: Interface["listForArtifact"] = Effect.fn("Representation.listForArtifact")(
      function* (input) {
        const limit = yield* pageLimit(input.limit)
        const ids = yield* snapshot(db, (tx) =>
          tx
            .select({ id: RepresentationRevisionTable.id })
            .from(RepresentationRevisionTable)
            .where(
              and(
                eq(RepresentationRevisionTable.effective_artifact_id, input.effectiveArtifactID),
                input.after ? gt(RepresentationRevisionTable.id, input.after) : undefined,
              ),
            )
            .orderBy(asc(RepresentationRevisionTable.id))
            .limit(limit)
            .all()
            .pipe(Effect.orDie),
        )
        return yield* snapshot(db, (tx) => Effect.forEach(ids, (row) => requireRepresentationInfo(tx, row.id)))
      },
    )

    const authorizeContinuedUse: Interface["authorizeContinuedUse"] = Effect.fn("Representation.authorizeContinuedUse")(
      function* (input) {
        const authority = yield* requireLearnerAuthority(input.authority)
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            const existing = yield* tx
              .select()
              .from(RepresentationContinuedUseGrantTable)
              .where(
                eq(RepresentationContinuedUseGrantTable.authorization_operation_identity, authority.operationIdentity),
              )
              .get()
              .pipe(Effect.orDie)
            const representation = yield* requireRepresentationRow(tx, input.representationRevisionID)
            const artifact = yield* Artifact.requireOrdinaryUseSnapshot(tx, input.expectedArtifact)
            if (!Number.isSafeInteger(input.timeAuthorized) || input.timeAuthorized < representation.time_accepted) {
              return yield* new InvalidTransitionError({
                detail: "The trusted grant time precedes the accepted Representation",
              })
            }
            const fingerprint = grantFingerprint({
              representation,
              artifact,
              authority,
            })
            if (existing) {
              if (existing.authorization_fingerprint !== fingerprint) {
                return yield* new ConflictError({
                  entity: "continued_use_grant",
                  id: authority.operationIdentity,
                  detail: "The continued-use operation identity was reused with different semantics",
                })
              }
              return grantInfo(existing)
            }
            if (representation.effective_artifact_id !== artifact.effectiveArtifactID) {
              return yield* new InvalidTransitionError({
                detail: "The Representation and current effective Artifact do not match",
              })
            }
            if (representation.source_revision_id === artifact.currentRevisionID) {
              return yield* new InvalidTransitionError({
                detail: "A current-source Representation does not require a continued-use grant",
              })
            }
            const active = yield* tx
              .select()
              .from(RepresentationContinuedUseGrantTable)
              .where(
                and(
                  eq(RepresentationContinuedUseGrantTable.effective_artifact_id, artifact.effectiveArtifactID),
                  eq(RepresentationContinuedUseGrantTable.representation_revision_id, input.representationRevisionID),
                  eq(RepresentationContinuedUseGrantTable.old_source_revision_id, representation.source_revision_id),
                  eq(RepresentationContinuedUseGrantTable.current_source_revision_id, artifact.currentRevisionID),
                  eq(RepresentationContinuedUseGrantTable.disposition, "active"),
                ),
              )
              .get()
              .pipe(Effect.orDie)
            if (
              active &&
              active.current_lineage_version === artifact.lineageVersion &&
              sameAttribution(
                attribution(active.current_attribution_type, active.current_attribution_member_id),
                artifact.attribution,
              )
            ) {
              return grantInfo(active)
            }
            if (active) {
              return yield* new InvalidTransitionError({
                detail: "The active continued-use grant belongs to stale AttributionBasis or lineage state",
              })
            }
            const id = createContinuedUseGrantID()
            yield* tx
              .insert(RepresentationContinuedUseGrantTable)
              .values({
                id,
                effective_artifact_id: artifact.effectiveArtifactID,
                representation_revision_id: representation.id,
                old_source_revision_id: representation.source_revision_id,
                current_source_revision_id: artifact.currentRevisionID,
                current_attribution_type: artifact.attribution.type,
                current_attribution_member_id:
                  artifact.attribution.type === "lineage_correction" ? artifact.attribution.memberID : null,
                current_lineage_version: artifact.lineageVersion,
                version: 1,
                disposition: "active",
                authorization_basis: authority.authorizationBasis,
                authorization_operation_identity: authority.operationIdentity,
                authorization_fingerprint: fingerprint,
                causal_occurrence_id: authority.causalOccurrenceID ?? null,
                causal_invocation_part_id: authority.causalInvocationPartID ?? null,
                time_authorized: input.timeAuthorized,
                time_updated: input.timeAuthorized,
              })
              .run()
              .pipe(Effect.orDie)
            yield* Artifact.requireOrdinaryUseSnapshot(tx, artifact)
            return grantInfo(yield* requireGrantRow(tx, id))
          }),
        )
      },
    )

    const revokeContinuedUse: Interface["revokeContinuedUse"] = Effect.fn("Representation.revokeContinuedUse")(
      function* (input) {
        const authority = yield* requireLearnerAuthority(input.authority)
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            const replay = yield* tx
              .select()
              .from(RepresentationContinuedUseGrantTable)
              .where(
                eq(RepresentationContinuedUseGrantTable.revocation_operation_identity, authority.operationIdentity),
              )
              .get()
              .pipe(Effect.orDie)
            if (replay) {
              if (
                replay.id !== input.grantID ||
                replay.version !== input.expectedVersion + 1 ||
                replay.revocation_basis !== authority.authorizationBasis
              ) {
                return yield* new ConflictError({
                  entity: "continued_use_grant",
                  id: authority.operationIdentity,
                  detail: "The revocation operation identity was reused with different semantics",
                })
              }
              return grantInfo(replay)
            }
            const current = yield* requireGrantRow(tx, input.grantID)
            if (current.version !== input.expectedVersion) {
              return yield* new ConflictError({
                entity: "continued_use_grant",
                id: input.grantID,
                expectedVersion: input.expectedVersion,
                currentVersion: current.version,
                detail: "The continued-use grant version changed",
              })
            }
            if (current.disposition === "revoked") {
              return yield* new InvalidTransitionError({ detail: "The continued-use grant is already revoked" })
            }
            if (!Number.isSafeInteger(input.timeRevoked) || input.timeRevoked < current.time_authorized) {
              return yield* new InvalidTransitionError({
                detail: "The trusted revocation time precedes the continued-use grant",
              })
            }
            const updated = yield* tx
              .update(RepresentationContinuedUseGrantTable)
              .set({
                version: sql`${RepresentationContinuedUseGrantTable.version} + 1`,
                disposition: "revoked",
                revocation_basis: authority.authorizationBasis,
                revocation_operation_identity: authority.operationIdentity,
                time_revoked: input.timeRevoked,
                time_updated: input.timeRevoked,
              })
              .where(
                and(
                  eq(RepresentationContinuedUseGrantTable.id, input.grantID),
                  eq(RepresentationContinuedUseGrantTable.version, input.expectedVersion),
                  eq(RepresentationContinuedUseGrantTable.disposition, "active"),
                  isNull(RepresentationContinuedUseGrantTable.revocation_operation_identity),
                ),
              )
              .returning()
              .get()
              .pipe(Effect.orDie)
            if (!updated) {
              return yield* new ConflictError({
                entity: "continued_use_grant",
                id: input.grantID,
                expectedVersion: input.expectedVersion,
                detail: "The continued-use grant changed during revocation",
              })
            }
            return grantInfo(updated)
          }),
        )
      },
    )

    const listContinuedUseGrants: Interface["listContinuedUseGrants"] = Effect.fn(
      "Representation.listContinuedUseGrants",
    )(function* (input) {
      const rows = yield* snapshot(db, (tx) =>
        tx
          .select()
          .from(RepresentationContinuedUseGrantTable)
          .where(
            and(
              eq(RepresentationContinuedUseGrantTable.effective_artifact_id, input.effectiveArtifactID),
              input.representationRevisionID
                ? eq(RepresentationContinuedUseGrantTable.representation_revision_id, input.representationRevisionID)
                : undefined,
            ),
          )
          .orderBy(
            asc(RepresentationContinuedUseGrantTable.time_authorized),
            asc(RepresentationContinuedUseGrantTable.id),
          )
          .all()
          .pipe(Effect.orDie),
      )
      return rows.map(grantInfo)
    })

    const prepareAcceptance: Interface["prepareAcceptance"] = Effect.fn("Representation.prepareAcceptance")(
      function* (input) {
        const normalized = yield* normalizeAcceptance(input)
        const initial = yield* snapshot(db, (tx) => resolveConversionTx(tx, normalized.identity))
        if (initial.type === "already_accepted") return initial

        yield* Effect.acquireRelease(acceptance.take(1), () => acceptance.release(1).pipe(Effect.asVoid))
        const resolution = yield* snapshot(db, (tx) => resolveConversionTx(tx, normalized.identity))
        if (resolution.type === "already_accepted") return resolution

        const store = yield* openStorage(database.filename)
        const publication = yield* Effect.acquireRelease(
          storageEffect("publish", () =>
            store.publish(normalized.candidateRevisionID, normalized.output.bytes, normalized.output.digest),
          ),
          (held) => storageEffect("verify", () => held.release()).pipe(Effect.ignore),
        )
        return {
          type: "candidate",
          commit: (tx) => Effect.uninterruptible(commitAcceptance(tx, normalized, publication.key)),
        } satisfies PreparedAcceptance
      },
    )

    const accept: Interface["accept"] = Effect.fn("Representation.accept")(function* (input) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const prepared = yield* prepareAcceptance(input)
          if (prepared.type === "already_accepted") return prepared.representation
          return yield* Effect.uninterruptible(snapshot(db, prepared.commit))
        }),
      )
    })

    const explicitlyDelete: Interface["explicitlyDelete"] = Effect.fn("Representation.explicitlyDelete")(
      function* (input) {
        const authority = yield* requireLearnerAuthority(input.authority)
        if (!Number.isSafeInteger(input.integrityScanBytes) || input.integrityScanBytes < 0) {
          return yield* new InvalidReadError({
            detail: "Deletion integrity ceiling must be a non-negative safe integer",
          })
        }
        const initial = yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            const replay = yield* deletionReplay(
              tx,
              authority.operationIdentity,
              input.representationRevisionID,
              input.expectedAvailabilityVersion,
            )
            if (replay) return { type: "replay" as const, representation: replay }
            const row = yield* requireRepresentationRow(tx, input.representationRevisionID)
            const availability = yield* requireAvailabilityRow(tx, row.id)
            if (availability.version !== input.expectedAvailabilityVersion) {
              return yield* new ConflictError({
                entity: "deletion",
                id: row.id,
                expectedVersion: input.expectedAvailabilityVersion,
                currentVersion: availability.version,
                detail: "Representation availability changed before deletion",
              })
            }
            if (availability.disposition === "explicitly_deleted") {
              return { type: "replay" as const, representation: representationInfo(row, availability) }
            }
            return { type: "candidate" as const, row, availability }
          }),
        )
        if (initial.type === "replay") return initial.representation
        if (initial.row.output_byte_length > input.integrityScanBytes) {
          return yield* new IntegrityBudgetExceededError({
            revisionID: initial.row.id,
            requiredBytes: initial.row.output_byte_length,
            ceilingBytes: input.integrityScanBytes,
          })
        }
        const store = yield* openStorage(database.filename)
        const prepared = yield* storageEffect("delete", () =>
          store.prepareDeletion(expectedObject(initial.row), input.integrityScanBytes),
        )
        if (prepared.status === "integrity_mismatch") {
          if (initial.availability.disposition !== "integrity_mismatch") {
            yield* snapshot(db, (tx) =>
              appendAvailability(tx, {
                revisionID: initial.row.id,
                expectedVersion: initial.availability.version,
                disposition: "integrity_mismatch",
                storageKey: initial.row.storage_key,
                basis: "integrity_observation",
                timeObserved: input.timeDeleted,
              }),
            )
          }
          return yield* unavailable(initial.row.id, "integrity_mismatch")
        }
        const commit = snapshot(db, (tx) =>
          commitDeletion(tx, {
            row: initial.row,
            expectedVersion: initial.availability.version,
            authority,
            timeDeleted: input.timeDeleted,
          }),
        )
        if (prepared.status === "missing") return yield* commit

        const exit = yield* Effect.exit(Effect.uninterruptible(commit))
        yield* storageEffect("delete", () => prepared.release())
        if (Exit.isFailure(exit)) {
          yield* storageEffect("restore", () =>
            store.reconcileDeletion(expectedObject(initial.row), input.integrityScanBytes),
          )
          return yield* Effect.failCause(exit.cause)
        }
        yield* storageEffect("cleanup", () =>
          store.cleanupCommittedDeletion(expectedObject(initial.row), input.integrityScanBytes),
        ).pipe(Effect.ignore)
        return exit.value
      },
    )

    const reconcileAvailability: Interface["reconcileAvailability"] = Effect.fn("Representation.reconcileAvailability")(
      function* (input) {
        if (!Number.isSafeInteger(input.integrityScanBytes) || input.integrityScanBytes < 0) {
          return yield* new InvalidReadError({ detail: "Reconciliation ceiling must be a non-negative safe integer" })
        }
        const [row, availability] = yield* snapshot(db, (tx) =>
          Effect.all([
            requireRepresentationRow(tx, input.representationRevisionID),
            requireAvailabilityRow(tx, input.representationRevisionID),
          ]),
        )
        if (row.output_byte_length > input.integrityScanBytes) {
          return yield* new IntegrityBudgetExceededError({
            revisionID: row.id,
            requiredBytes: row.output_byte_length,
            ceilingBytes: input.integrityScanBytes,
          })
        }
        const store = yield* openStorage(database.filename)
        if (availability.disposition === "explicitly_deleted") {
          yield* storageEffect("cleanup", () =>
            store.cleanupCommittedDeletion(expectedObject(row), input.integrityScanBytes),
          ).pipe(Effect.ignore)
          return yield* snapshot(db, (tx) => requireRepresentationInfo(tx, row.id))
        }
        const result = yield* storageEffect("restore", () =>
          store.reconcileDeletion(expectedObject(row), input.integrityScanBytes),
        )
        yield* reconcileAvailabilityResult(db, row, availability, result).pipe(
          Effect.catchTag("Representation.UnavailableError", () => Effect.void),
        )
        return yield* snapshot(db, (tx) => requireRepresentationInfo(tx, row.id))
      },
    )

    const cleanup: Interface["cleanup"] = Effect.fn("Representation.cleanup")(function* (input) {
      if (
        !Number.isSafeInteger(input.now) ||
        input.now < 0 ||
        !Number.isSafeInteger(input.minimumAgeMs) ||
        input.minimumAgeMs < 0
      ) {
        return yield* new InvalidTransitionError({ detail: "Cleanup time and age guard must be non-negative" })
      }
      const rows = yield* snapshot(db, (tx) =>
        tx
          .select({
            key: RepresentationRevisionTable.storage_key,
            disposition: RepresentationAvailabilityCurrentTable.disposition,
          })
          .from(RepresentationRevisionTable)
          .innerJoin(
            RepresentationAvailabilityCurrentTable,
            eq(RepresentationAvailabilityCurrentTable.representation_revision_id, RepresentationRevisionTable.id),
          )
          .all()
          .pipe(Effect.orDie),
      )
      const keys = rows.map((row) => RepresentationStorage.parseKey(row.key))
      const store = yield* openStorage(database.filename)
      return yield* storageEffect("cleanup", () =>
        store.cleanup({
          now: input.now,
          minimumAgeMs: input.minimumAgeMs,
          referencedKeys: new Set(keys),
          retainedDeletionKeys: new Set(
            rows.flatMap((row, index) => (row.disposition === "explicitly_deleted" ? [] : [keys[index]!])),
          ),
        }),
      )
    })

    return {
      resolveConversion,
      prepareAcceptance,
      accept,
      get,
      listForArtifact,
      authorizeContinuedUse,
      revokeContinuedUse,
      listContinuedUseGrants,
      explicitlyDelete,
      reconcileAvailability,
      cleanup,
    }
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })

const historicalLayer = Layer.effect(
  HistoricalReader,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const readHistorical: HistoricalReaderInterface["readHistorical"] = Effect.fn("Representation.readHistorical")(
      function* (input) {
        yield* validateReadBudgets(input.budgets)
        const initial = yield* snapshot(db, (tx) =>
          Effect.all([
            requireRepresentationRow(tx, input.representationRevisionID),
            requireAvailabilityRow(tx, input.representationRevisionID),
          ]),
        )
        const row = initial[0]
        const availability = initial[1]
        yield* requireIntegrityBudget(row, input.budgets)
        if (availability.disposition === "explicitly_deleted") {
          return yield* unavailable(row.id, "explicitly_deleted")
        }
        const store = yield* openStorage(database.filename)
        const reconciled = yield* storageEffect("restore", () =>
          store.reconcileDeletion(expectedObject(row), input.budgets.integrityScanBytes),
        )
        const ready = yield* reconcileAvailabilityResult(db, row, availability, reconciled)
        const read = yield* storageEffect("read", () =>
          store.read(expectedObject(row), input.budgets.integrityScanBytes),
        )
        const verified = yield* applyStorageObservation(db, row, ready, read)
        const content = yield* materializeContent(row, verified.bytes, input.selection, input.budgets)
        return {
          use: "historical",
          representation: yield* snapshot(db, (tx) => requireRepresentationInfo(tx, row.id)),
          content,
        }
      },
    )
    return { readHistorical }
  }),
)

const currentUseLayer = Layer.effect(
  CurrentUseReader,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const readForCurrentUse: CurrentUseReaderInterface["readForCurrentUse"] = Effect.fn(
      "Representation.readForCurrentUse",
    )(function* (input) {
      yield* validateReadBudgets(input.budgets)
      const admission = yield* snapshot(db, (tx) =>
        admitCurrentUse(tx, {
          revisionID: input.representationRevisionID,
          effectiveArtifactID: input.effectiveArtifactID,
        }),
      )
      yield* requireIntegrityBudget(admission.row, input.budgets)
      const store = yield* openStorage(database.filename)
      const reconciled = yield* storageEffect("restore", () =>
        store.reconcileDeletion(expectedObject(admission.row), input.budgets.integrityScanBytes),
      )
      const ready = yield* reconcileAvailabilityResult(db, admission.row, admission.availability, reconciled)
      const read = yield* storageEffect("read", () =>
        store.read(expectedObject(admission.row), input.budgets.integrityScanBytes),
      )
      const verified = yield* applyStorageObservation(db, admission.row, ready, read)
      const content = yield* materializeContent(admission.row, verified.bytes, input.selection, input.budgets)
      const revalidated = yield* snapshot(db, (tx) =>
        revalidateCurrentUse(tx, {
          ...admission,
          availabilityVersion: verified.availability.version,
        }),
      )
      return {
        use: "current",
        representation: yield* snapshot(db, (tx) => requireRepresentationInfo(tx, admission.row.id)),
        content,
        admission: admission.grant
          ? {
              basis: "continued_use_grant",
              artifact: revalidated.artifact,
              grantID: admission.grant.id,
              grantVersion: admission.grant.version,
            }
          : { basis: "current_revision", artifact: revalidated.artifact },
      }
    })
    return { readForCurrentUse }
  }),
)

export const historicalReaderNode = makeGlobalNode({
  service: HistoricalReader,
  layer: historicalLayer,
  deps: [Database.node],
})

export const currentUseReaderNode = makeGlobalNode({
  service: CurrentUseReader,
  layer: currentUseLayer,
  deps: [Database.node],
})

function snapshot<A, E, R>(database: DatabaseShape, read: (tx: Transaction) => Effect.Effect<A, E, R>) {
  return database.transaction(read).pipe(Effect.catchTag("SqlError", Effect.die))
}

function resolveConversionTx(
  tx: Transaction,
  input: NormalizedIdentity,
): Effect.Effect<ConversionResolution, ConflictError> {
  return Effect.gen(function* () {
    const existing = yield* tx
      .select()
      .from(RepresentationEffectTable)
      .where(eq(RepresentationEffectTable.operation_identity, input.authority.operationIdentity))
      .get()
      .pipe(Effect.orDie)
    if (!existing) return { type: "new", semanticFingerprint: input.semanticFingerprint }
    if (existing.semantic_fingerprint !== input.semanticFingerprint) {
      return yield* new ConflictError({
        entity: "effect",
        id: input.authority.operationIdentity,
        detail: "The conversion operation identity was reused with different semantics",
      })
    }
    const revision = yield* tx
      .select({ id: RepresentationRevisionTable.id })
      .from(RepresentationRevisionTable)
      .where(eq(RepresentationRevisionTable.effect_id, existing.id))
      .get()
      .pipe(Effect.orDie)
    if (!revision) return yield* Effect.die("Committed Representation effect has no immutable Revision")
    return {
      type: "already_accepted",
      representation: yield* requireRepresentationInfo(tx, revision.id).pipe(Effect.orDie),
    }
  })
}

function commitAcceptance(
  tx: Transaction,
  input: NormalizedAcceptance,
  storageKey: string,
): Effect.Effect<RepresentationInfo, Artifact.Error | ConflictError | NotFoundError> {
  return Effect.gen(function* () {
    const resolution = yield* resolveConversionTx(tx, input.identity)
    if (resolution.type === "already_accepted") return resolution.representation
    const collision = yield* tx
      .select({ id: RepresentationRevisionTable.id })
      .from(RepresentationRevisionTable)
      .where(eq(RepresentationRevisionTable.id, input.candidateRevisionID))
      .get()
      .pipe(Effect.orDie)
    if (collision) {
      return yield* new ConflictError({
        entity: "effect",
        id: input.candidateRevisionID,
        detail: "The candidate Representation Revision identity is already occupied",
      })
    }
    const artifact = yield* Artifact.requireOrdinaryUseRevisionSnapshot(tx, input.sourceProof.ordinary)
    const effectID = createEffectID()
    yield* tx
      .insert(RepresentationEffectTable)
      .values({
        id: effectID,
        operation_identity: input.identity.authority.operationIdentity,
        semantic_fingerprint: input.identity.semanticFingerprint,
        time_committed: input.timeAccepted,
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(RepresentationRevisionTable)
      .values({
        id: input.candidateRevisionID,
        effect_id: effectID,
        source_revision_id: artifact.currentRevisionID,
        effective_artifact_id: artifact.effectiveArtifactID,
        attribution_type: artifact.attribution.type,
        attribution_member_id:
          artifact.attribution.type === "lineage_correction" ? artifact.attribution.memberID : null,
        accepted_disposition_version: artifact.dispositionVersion,
        accepted_lineage_version: artifact.lineageVersion,
        source_version: input.sourceProof.sourceVersion,
        source_media_type: artifact.mediaType,
        source_digest: artifact.fingerprint.digest,
        source_byte_length: artifact.fingerprint.byteLength,
        content_root_id: input.sourceProof.authorization.contentRootID,
        content_root_binding_id: input.sourceProof.authorization.bindingID,
        content_root_binding_episode_id: input.sourceProof.authorization.bindingEpisodeID,
        content_root_binding_episode_ordinal: input.sourceProof.authorization.bindingEpisodeOrdinal,
        content_root_grant_episode_id: input.sourceProof.authorization.grantEpisodeID,
        content_root_grant_version: input.sourceProof.authorization.grantVersion,
        normalized_relative_path: input.sourceProof.relativePath,
        source_object_platform: "windows_ntfs",
        source_object_verifier_version: input.sourceProof.descriptor.verifierVersion,
        source_object_canonical_path: input.sourceProof.descriptor.canonicalPath,
        source_object_canonical_path_key: input.sourceProof.descriptor.canonicalPathKey,
        source_object_volume_serial: input.sourceProof.descriptor.volumeSerial,
        source_object_id: input.sourceProof.descriptor.objectID,
        source_object_creation_time: input.sourceProof.descriptor.creationTime,
        source_object_change_time: input.sourceProof.descriptor.changeTime,
        source_object_last_write_time: input.sourceProof.descriptor.lastWriteTime,
        source_object_size: input.sourceProof.descriptor.size,
        source_object_kind: "file",
        source_observed_time: input.sourceProof.timeObserved,
        presented_input_digest: input.candidate.input.digest,
        presented_input_byte_length: input.candidate.input.byteLength,
        producer_kind: input.candidate.kind,
        producer_identity: input.output.producerIdentity,
        producer_version: input.output.producerVersion,
        provider_id: input.output.providerID ?? null,
        model_id: input.output.modelID ?? null,
        profile_variant: input.output.profileVariant ?? null,
        task_version: input.output.taskVersion,
        profile: input.output.profile,
        canonicalizer_version: input.output.canonicalizerVersion,
        provenance_version: input.output.provenanceVersion,
        provenance: input.candidate.provenance,
        run_identity: input.candidate.runIdentity,
        result_boundary: input.output.resultBoundary,
        terminal_status: input.output.terminalStatus,
        diagnostics: input.candidate.diagnostics,
        usage: input.candidate.usage,
        output_media_type: input.output.mediaType,
        storage_key: storageKey,
        output_digest: input.output.digest,
        output_byte_length: input.output.byteLength,
        profile_record_count: input.output.recordCount,
        acceptance_basis: input.output.acceptanceBasis,
        creation_basis: input.identity.authority.creationBasis,
        creation_identity: input.identity.authority.operationIdentity,
        authorization_intent: "persistent_readable_access",
        authorization_basis: input.identity.authority.authorizationBasis,
        delivery_mode: input.identity.authority.deliveryMode,
        causal_occurrence_id: input.identity.authority.causalOccurrenceID ?? null,
        causal_invocation_part_id: input.identity.authority.causalInvocationPartID ?? null,
        time_accepted: input.timeAccepted,
      })
      .run()
      .pipe(Effect.orDie)
    const availabilityEventID = createAvailabilityEventID()
    yield* tx
      .insert(RepresentationAvailabilityEventTable)
      .values({
        id: availabilityEventID,
        representation_revision_id: input.candidateRevisionID,
        version: 1,
        disposition: "available",
        observed_storage_key: storageKey,
        observed_digest: input.output.digest,
        observed_byte_length: input.output.byteLength,
        basis: "acceptance",
        operation_identity: input.identity.authority.operationIdentity,
        time_observed: input.timeAccepted,
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(RepresentationAvailabilityCurrentTable)
      .values({
        representation_revision_id: input.candidateRevisionID,
        version: 1,
        disposition: "available",
        time_updated: input.timeAccepted,
      })
      .run()
      .pipe(Effect.orDie)
    return representationInfo(
      yield* requireRepresentationRow(tx, input.candidateRevisionID),
      yield* requireAvailabilityRow(tx, input.candidateRevisionID),
    )
  })
}

function appendAvailability(
  tx: Transaction,
  input: {
    readonly revisionID: RevisionID
    readonly expectedVersion: number
    readonly disposition: Availability
    readonly storageKey: string
    readonly digest?: string
    readonly byteLength?: number
    readonly basis: AvailabilityBasis
    readonly operationIdentity?: string
    readonly timeObserved: number
  },
) {
  return Effect.gen(function* () {
    const current = yield* requireAvailabilityRow(tx, input.revisionID)
    if (current.version !== input.expectedVersion) {
      return yield* new ConflictError({
        entity: "availability",
        id: input.revisionID,
        expectedVersion: input.expectedVersion,
        currentVersion: current.version,
        detail: "Representation availability changed",
      })
    }
    if (current.disposition === "explicitly_deleted") {
      return yield* new InvalidTransitionError({ detail: "Explicit deletion is terminal for this Representation" })
    }
    if (!Number.isSafeInteger(input.timeObserved) || input.timeObserved < current.time_updated) {
      return yield* new InvalidTransitionError({
        detail: "The trusted availability observation time precedes current Representation state",
      })
    }
    const version = current.version + 1
    yield* tx
      .insert(RepresentationAvailabilityEventTable)
      .values({
        id: createAvailabilityEventID(),
        representation_revision_id: input.revisionID,
        version,
        disposition: input.disposition,
        observed_storage_key: input.storageKey,
        observed_digest: input.digest ?? null,
        observed_byte_length: input.byteLength ?? null,
        basis: input.basis,
        operation_identity: input.operationIdentity ?? null,
        time_observed: input.timeObserved,
      })
      .run()
      .pipe(Effect.orDie)
    const updated = yield* tx
      .update(RepresentationAvailabilityCurrentTable)
      .set({ version, disposition: input.disposition, time_updated: input.timeObserved })
      .where(
        and(
          eq(RepresentationAvailabilityCurrentTable.representation_revision_id, input.revisionID),
          eq(RepresentationAvailabilityCurrentTable.version, input.expectedVersion),
        ),
      )
      .returning()
      .get()
      .pipe(Effect.orDie)
    if (!updated) {
      return yield* new ConflictError({
        entity: "availability",
        id: input.revisionID,
        expectedVersion: input.expectedVersion,
        detail: "Representation availability changed during observation",
      })
    }
    return updated
  })
}

function deletionReplay(tx: Transaction, operationIdentity: string, revisionID: RevisionID, expectedVersion: number) {
  return Effect.gen(function* () {
    const event = yield* tx
      .select()
      .from(RepresentationAvailabilityEventTable)
      .where(eq(RepresentationAvailabilityEventTable.operation_identity, operationIdentity))
      .get()
      .pipe(Effect.orDie)
    if (!event) return undefined
    if (
      event.disposition !== "explicitly_deleted" ||
      event.representation_revision_id !== revisionID ||
      event.version !== expectedVersion + 1
    ) {
      return yield* new ConflictError({
        entity: "deletion",
        id: operationIdentity,
        detail: "The deletion operation identity is already used by another availability transition",
      })
    }
    return yield* requireRepresentationInfo(tx, event.representation_revision_id)
  })
}

function commitDeletion(
  tx: Transaction,
  input: {
    readonly row: RevisionRow
    readonly expectedVersion: number
    readonly authority: LearnerAuthority
    readonly timeDeleted: number
  },
) {
  return Effect.gen(function* () {
    const replay = yield* deletionReplay(tx, input.authority.operationIdentity, input.row.id, input.expectedVersion)
    if (replay) return replay
    const current = yield* requireAvailabilityRow(tx, input.row.id)
    if (current.version !== input.expectedVersion) {
      return yield* new ConflictError({
        entity: "deletion",
        id: input.row.id,
        expectedVersion: input.expectedVersion,
        currentVersion: current.version,
        detail: "Representation availability changed during deletion",
      })
    }
    if (
      !Number.isSafeInteger(input.timeDeleted) ||
      input.timeDeleted < input.row.time_accepted ||
      input.timeDeleted < current.time_updated
    ) {
      return yield* new InvalidTransitionError({
        detail: "The trusted deletion time precedes accepted Representation state",
      })
    }
    const deleted = yield* appendAvailability(tx, {
      revisionID: input.row.id,
      expectedVersion: input.expectedVersion,
      disposition: "explicitly_deleted",
      storageKey: input.row.storage_key,
      basis: "explicit_deletion",
      operationIdentity: input.authority.operationIdentity,
      timeObserved: input.timeDeleted,
    })
    return representationInfo(input.row, deleted)
  })
}

function reconcileAvailabilityResult(
  db: DatabaseShape,
  row: RevisionRow,
  availability: AvailabilityRow,
  result: RepresentationStorage.ReconciliationResult,
) {
  return Effect.gen(function* () {
    if (result.status === "available") {
      if (availability.disposition === "available") return availability
      return yield* snapshot(db, (tx) =>
        appendAvailability(tx, {
          revisionID: row.id,
          expectedVersion: availability.version,
          disposition: "available",
          storageKey: row.storage_key,
          digest: row.output_digest,
          byteLength: row.output_byte_length,
          basis: "deletion_recovery",
          timeObserved: Date.now(),
        }),
      )
    }
    if (result.status === "externally_missing") {
      if (availability.disposition !== "externally_missing") {
        yield* snapshot(db, (tx) =>
          appendAvailability(tx, {
            revisionID: row.id,
            expectedVersion: availability.version,
            disposition: "externally_missing",
            storageKey: row.storage_key,
            basis: "deletion_recovery",
            timeObserved: Date.now(),
          }),
        )
      }
      return yield* unavailable(row.id, "externally_missing")
    }
    if (availability.disposition !== "integrity_mismatch") {
      yield* snapshot(db, (tx) =>
        appendAvailability(tx, {
          revisionID: row.id,
          expectedVersion: availability.version,
          disposition: "integrity_mismatch",
          storageKey: row.storage_key,
          basis: "deletion_recovery",
          timeObserved: Date.now(),
        }),
      )
    }
    return yield* unavailable(row.id, "integrity_mismatch")
  })
}

type CurrentAdmission = {
  readonly row: RevisionRow
  readonly availability: AvailabilityRow
  readonly artifact: Artifact.OrdinaryUseRevisionSnapshot
  readonly grant?: GrantRow
}

function admitCurrentUse(
  tx: Transaction,
  input: { readonly revisionID: RevisionID; readonly effectiveArtifactID: Artifact.ArtifactID },
) {
  return Effect.gen(function* () {
    const row = yield* requireRepresentationRow(tx, input.revisionID)
    if (row.effective_artifact_id !== input.effectiveArtifactID) {
      return yield* new CurrentUseDeniedError({
        revisionID: input.revisionID,
        effectiveArtifactID: input.effectiveArtifactID,
        reason: "wrong_artifact",
      })
    }
    const artifact = yield* Artifact.readOrdinaryUseRevisionSnapshot(tx, input.effectiveArtifactID)
    const availability = yield* requireAvailabilityRow(tx, input.revisionID)
    if (availability.disposition === "explicitly_deleted") {
      return yield* new UnavailableError({
        revisionID: input.revisionID,
        disposition: "explicitly_deleted",
        detail: "The Representation was explicitly deleted",
      })
    }
    if (
      row.source_revision_id === artifact.currentRevisionID &&
      row.accepted_lineage_version === artifact.lineageVersion &&
      sameAttribution(attribution(row.attribution_type, row.attribution_member_id), artifact.attribution)
    ) {
      return { row, availability, artifact } satisfies CurrentAdmission
    }
    if (row.source_revision_id === artifact.currentRevisionID) {
      return yield* new CurrentUseDeniedError({
        revisionID: input.revisionID,
        effectiveArtifactID: input.effectiveArtifactID,
        reason: "source_drift",
      })
    }
    const grant = yield* tx
      .select()
      .from(RepresentationContinuedUseGrantTable)
      .where(
        and(
          eq(RepresentationContinuedUseGrantTable.effective_artifact_id, artifact.effectiveArtifactID),
          eq(RepresentationContinuedUseGrantTable.representation_revision_id, row.id),
          eq(RepresentationContinuedUseGrantTable.old_source_revision_id, row.source_revision_id),
          eq(RepresentationContinuedUseGrantTable.current_source_revision_id, artifact.currentRevisionID),
          eq(RepresentationContinuedUseGrantTable.current_lineage_version, artifact.lineageVersion),
          eq(RepresentationContinuedUseGrantTable.current_attribution_type, artifact.attribution.type),
          artifact.attribution.type === "lineage_correction"
            ? eq(RepresentationContinuedUseGrantTable.current_attribution_member_id, artifact.attribution.memberID)
            : isNull(RepresentationContinuedUseGrantTable.current_attribution_member_id),
          eq(RepresentationContinuedUseGrantTable.disposition, "active"),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!grant) {
      return yield* new CurrentUseDeniedError({
        revisionID: input.revisionID,
        effectiveArtifactID: input.effectiveArtifactID,
        reason: "grant_required",
      })
    }
    return { row, availability, artifact, grant } satisfies CurrentAdmission
  })
}

function revalidateCurrentUse(tx: Transaction, input: CurrentAdmission & { readonly availabilityVersion: number }) {
  return Effect.gen(function* () {
    const artifact = yield* Artifact.requireOrdinaryUseRevisionSnapshot(tx, input.artifact)
    const availability = yield* requireAvailabilityRow(tx, input.row.id)
    if (availability.version !== input.availabilityVersion || availability.disposition !== "available") {
      return yield* new CurrentUseDeniedError({
        revisionID: input.row.id,
        effectiveArtifactID: input.row.effective_artifact_id,
        reason: "availability_changed",
      })
    }
    if (!input.grant) return { artifact, availability }
    const grant = yield* requireGrantRow(tx, input.grant.id)
    if (
      grant.version !== input.grant.version ||
      grant.disposition !== "active" ||
      grant.effective_artifact_id !== artifact.effectiveArtifactID ||
      grant.representation_revision_id !== input.row.id ||
      grant.old_source_revision_id !== input.row.source_revision_id ||
      grant.current_source_revision_id !== artifact.currentRevisionID ||
      grant.current_lineage_version !== artifact.lineageVersion ||
      !sameAttribution(
        attribution(grant.current_attribution_type, grant.current_attribution_member_id),
        artifact.attribution,
      )
    ) {
      return yield* new CurrentUseDeniedError({
        revisionID: input.row.id,
        effectiveArtifactID: input.row.effective_artifact_id,
        reason: grant.disposition === "revoked" ? "grant_revoked" : "grant_stale",
      })
    }
    return { artifact, availability, grant }
  })
}

function materializeContent(
  row: RevisionRow,
  bytes: Uint8Array,
  selection: ReadSelection,
  budgets: ReadBudgets,
): Effect.Effect<VerifiedContent, InvalidReadError | ReturnBudgetExceededError> {
  return Effect.gen(function* () {
    yield* validateReadBudgets(budgets)
    if (selection.type === "whole") {
      if (bytes.byteLength > budgets.returnBytes || row.profile_record_count > budgets.records) {
        return yield* new ReturnBudgetExceededError({
          revisionID: row.id,
          requiredBytes: bytes.byteLength,
          ceilingBytes: budgets.returnBytes,
        })
      }
      return {
        bytes: bytes.slice(),
        records: row.profile_record_count,
        truncated: false,
      }
    }
    if (selection.type === "model_document") {
      if (row.profile !== "repa.model-rendition.v1") {
        return yield* new InvalidReadError({ detail: "The exact Representation does not own a model document record" })
      }
      if (budgets.records < 1 || bytes.byteLength > budgets.returnBytes) {
        return yield* new ReturnBudgetExceededError({
          revisionID: row.id,
          requiredBytes: bytes.byteLength,
          ceilingBytes: budgets.returnBytes,
        })
      }
      return { bytes: bytes.slice(), records: 1, truncated: false }
    }
    if (row.profile !== "repa.pdf-text.v1") {
      return yield* new InvalidReadError({ detail: "The exact Representation does not own mechanical page records" })
    }
    const profile = PDFTextProfile.decode(bytes)
    if (!profile.ok) {
      return yield* new InvalidReadError({ detail: `The accepted PDF profile is invalid: ${profile.error}` })
    }
    const result = PDFTextProfile.readPageRecords(profile.value, {
      startPage: selection.startPage,
      maxRecords: budgets.records,
      maxBytes: budgets.returnBytes,
    })
    if (!result.ok) return yield* new InvalidReadError({ detail: `Invalid PDF page selection: ${result.error}` })
    return {
      bytes: result.value.bytes.slice(),
      records: result.value.pages.length,
      nextPage: result.value.nextPage,
      truncated: result.value.truncated,
    }
  })
}

function validateReadBudgets(input: ReadBudgets): Effect.Effect<void, InvalidReadError> {
  if (
    Number.isSafeInteger(input.integrityScanBytes) &&
    input.integrityScanBytes >= 0 &&
    Number.isSafeInteger(input.returnBytes) &&
    input.returnBytes >= 0 &&
    Number.isSafeInteger(input.records) &&
    input.records >= 0
  ) {
    return Effect.void
  }
  return Effect.fail(new InvalidReadError({ detail: "Representation read budgets must be non-negative safe integers" }))
}

function requireIntegrityBudget(row: RevisionRow, budgets: ReadBudgets) {
  if (row.output_byte_length <= budgets.integrityScanBytes) return Effect.void
  return Effect.fail(
    new IntegrityBudgetExceededError({
      revisionID: row.id,
      requiredBytes: row.output_byte_length,
      ceilingBytes: budgets.integrityScanBytes,
    }),
  )
}

function expectedObject(row: RevisionRow): RepresentationStorage.ExpectedObject {
  return {
    key: RepresentationStorage.parseKey(row.storage_key),
    digest: row.output_digest,
    byteLength: row.output_byte_length,
  }
}

function applyStorageObservation(
  db: DatabaseShape,
  row: RevisionRow,
  availability: AvailabilityRow,
  result: RepresentationStorage.ReadResult,
) {
  return Effect.gen(function* () {
    if (result.status === "verified") {
      if (availability.disposition === "available") {
        return { bytes: result.bytes, availability }
      }
      const restored = yield* snapshot(db, (tx) =>
        appendAvailability(tx, {
          revisionID: row.id,
          expectedVersion: availability.version,
          disposition: "available",
          storageKey: row.storage_key,
          digest: row.output_digest,
          byteLength: row.output_byte_length,
          basis: "exact_restoration",
          timeObserved: Date.now(),
        }),
      )
      return { bytes: result.bytes, availability: restored }
    }
    if (result.status === "missing") {
      if (availability.disposition !== "externally_missing") {
        yield* snapshot(db, (tx) =>
          appendAvailability(tx, {
            revisionID: row.id,
            expectedVersion: availability.version,
            disposition: "externally_missing",
            storageKey: row.storage_key,
            basis: "missing_observation",
            timeObserved: Date.now(),
          }),
        )
      }
      return yield* unavailable(row.id, "externally_missing")
    }
    if (availability.disposition !== "integrity_mismatch") {
      yield* snapshot(db, (tx) =>
        appendAvailability(tx, {
          revisionID: row.id,
          expectedVersion: availability.version,
          disposition: "integrity_mismatch",
          storageKey: row.storage_key,
          basis: "integrity_observation",
          timeObserved: Date.now(),
        }),
      )
    }
    return yield* unavailable(row.id, "integrity_mismatch")
  })
}

function openStorage(filename: string) {
  return storageEffect("prepare", () => RepresentationStorage.open(filename))
}

function storageEffect<A>(operation: StorageError["operation"], run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) => {
      if (cause instanceof StorageError) return cause
      if (cause instanceof RepresentationStorage.IntegrityCeilingExceededError) {
        return new StorageError({
          operation,
          reason: "unreadable",
          detail: `The managed object exceeded the storage scan ceiling (${cause.requiredBytes}/${cause.ceilingBytes})`,
        })
      }
      return new StorageError({
        operation,
        reason: "unreadable",
        detail: `The managed Representation storage operation failed without a classified result`,
      })
    },
  })
}

function unavailable(revisionID: RevisionID, disposition: Availability) {
  return Effect.fail(
    new UnavailableError({
      revisionID,
      disposition,
      detail: `Representation ${revisionID} is ${disposition}`,
    }),
  )
}

type NormalizedIdentity = ConversionIdentity & {
  readonly authority: ConversionAuthority
  readonly recipe: ProducerProvenance
  readonly semanticFingerprint: string
}

type NormalizedAcceptance = {
  readonly identity: NormalizedIdentity
  readonly candidateRevisionID: RevisionID
  readonly sourceProof: SourceProof
  readonly candidate: ProducerCandidate
  readonly output: {
    readonly bytes: Uint8Array
    readonly digest: string
    readonly byteLength: number
    readonly recordCount: number
    readonly mediaType: string
    readonly profile: Profile
    readonly resultBoundary: ResultBoundary
    readonly acceptanceBasis: AcceptanceBasis
    readonly producerIdentity: string
    readonly producerVersion: string
    readonly providerID?: string
    readonly modelID?: string
    readonly profileVariant?: string
    readonly taskVersion: number
    readonly canonicalizerVersion: number
    readonly provenanceVersion: number
    readonly terminalStatus: TerminalStatus
  }
  readonly timeAccepted: number
}

function normalizeIdentity(input: ConversionIdentity): Effect.Effect<NormalizedIdentity, InvalidTransitionError> {
  return Effect.gen(function* () {
    const authority = yield* requireConversionAuthority(input.authority)
    const recipe = yield* sanitizeProvenance(input.recipe)
    if (
      !/^art_[0-9A-Za-z]{26}$/.test(input.effectiveArtifactID) ||
      !/^arv_[0-9A-Za-z]{26}$/.test(input.sourceRevisionID) ||
      !validAttribution(input.attribution)
    ) {
      return yield* invalid("Invalid source AttributionBasis")
    }
    return {
      ...input,
      authority,
      recipe,
      semanticFingerprint: semanticFingerprint({
        effectiveArtifactID: input.effectiveArtifactID,
        sourceRevisionID: input.sourceRevisionID,
        attribution: input.attribution,
        recipe,
        intent: "persistent_readable_access",
        creationBasis: authority.creationBasis,
        authorizationBasis: authority.authorizationBasis,
        deliveryMode: authority.deliveryMode,
        causalOccurrenceID: authority.causalOccurrenceID,
      }),
    }
  })
}

function normalizeAcceptance(input: AcceptanceInput): Effect.Effect<NormalizedAcceptance, InvalidTransitionError> {
  return Effect.gen(function* () {
    const identity = yield* normalizeIdentity(input)
    const sourceProof = yield* sanitizeSourceProof(input.sourceProof)
    const candidate = yield* sanitizeCandidate(input.candidate)
    if (!/^rep_[0-9A-Za-z]{26}$/.test(input.candidateRevisionID)) {
      return yield* invalid("The candidate Representation Revision identity is malformed")
    }
    if (
      sourceProof.ordinary.effectiveArtifactID !== identity.effectiveArtifactID ||
      sourceProof.ordinary.currentRevisionID !== identity.sourceRevisionID ||
      !sameAttribution(sourceProof.ordinary.attribution, identity.attribution)
    ) {
      return yield* invalid("The accepted source proof does not match the conversion identity")
    }
    if (canonicalJSON(candidate.provenance) !== canonicalJSON(identity.recipe)) {
      return yield* invalid("The producer result does not match the selected closed recipe")
    }
    if (!sameFingerprint(candidate.input, sourceProof.ordinary.fingerprint)) {
      return yield* invalid("The producer input attestation does not match the Gate 9 source bytes")
    }
    if (
      (candidate.kind === "local_pdf" && sourceProof.ordinary.mediaType !== "application/pdf") ||
      (candidate.kind === "configured_model" && candidate.provenance.mediaType !== sourceProof.ordinary.mediaType)
    ) {
      return yield* invalid("The producer recipe media type does not match the exact Gate 9 source")
    }
    if (!Number.isSafeInteger(input.timeAccepted) || input.timeAccepted < input.sourceProof.timeObserved) {
      return yield* invalid("The trusted acceptance time precedes the source observation")
    }
    const digest = sha256(candidate.bytes)
    if (candidate.kind === "local_pdf") {
      const profile = PDFTextProfile.decode(candidate.bytes)
      if (!profile.ok) return yield* invalid(`Invalid local PDF profile: ${profile.error}`)
      const pages = profile.value.profile.pages
      if (
        candidate.usage.pageCount !== pages.length ||
        candidate.usage.textItemCount !== pages.reduce((count, page) => count + page.items.length, 0) ||
        candidate.usage.signalPageCount !== pages.filter((page) => page.signals !== undefined).length ||
        candidate.usage.operatorCount !==
          pages.reduce((count, page) => count + (page.signals?.operatorCount ?? 0), 0) ||
        candidate.usage.imagePaintOperations !==
          pages.reduce((count, page) => count + (page.signals?.imagePaintOperations ?? 0), 0) ||
        candidate.usage.profileByteLength !== candidate.bytes.byteLength
      ) {
        return yield* invalid("The local PDF usage projection does not describe the accepted profile")
      }
      return {
        identity,
        candidateRevisionID: input.candidateRevisionID,
        sourceProof,
        candidate,
        output: {
          bytes: candidate.bytes.slice(),
          digest,
          byteLength: candidate.bytes.byteLength,
          recordCount: profile.value.records.length,
          mediaType: "application/vnd.repa.pdf-text+jsonl;version=1",
          profile: "repa.pdf-text.v1",
          resultBoundary: "framed_stdout_v1",
          acceptanceBasis: "mechanical_profile",
          producerIdentity: "pdfjs-dist",
          producerVersion: "5.7.284",
          taskVersion: 1,
          canonicalizerVersion: 1,
          provenanceVersion: 1,
          terminalStatus: "completed",
        },
        timeAccepted: input.timeAccepted,
      }
    }
    const profile = ModelRenditionProfile.decode(candidate.bytes)
    if (!profile.ok) return yield* invalid(`Invalid configured-model profile: ${profile.error}`)
    return {
      identity,
      candidateRevisionID: input.candidateRevisionID,
      sourceProof,
      candidate,
      output: {
        bytes: candidate.bytes.slice(),
        digest,
        byteLength: candidate.bytes.byteLength,
        recordCount: 1,
        mediaType: "application/vnd.repa.model-rendition+json;version=1",
        profile: "repa.model-rendition.v1",
        resultBoundary: "model_schema_v1",
        acceptanceBasis: "model_claimed_rendition",
        producerIdentity: `${candidate.provenance.providerID}/${candidate.provenance.modelID}`,
        producerVersion: "repa-configured-model-adapter.v1",
        providerID: candidate.provenance.providerID,
        modelID: candidate.provenance.modelID,
        profileVariant: candidate.provenance.variant,
        taskVersion: 1,
        canonicalizerVersion: 1,
        provenanceVersion: 1,
        terminalStatus: "stop",
      },
      timeAccepted: input.timeAccepted,
    }
  })
}

function sanitizeSourceProof(input: SourceProof): Effect.Effect<SourceProof, InvalidTransitionError> {
  return Effect.gen(function* () {
    const relativePath = yield* Effect.try({
      try: () => ContentRootNTFS.normalizeRelativePath(input.relativePath),
      catch: () => new InvalidTransitionError({ detail: "The source-proof relative path is invalid" }),
    })
    if (
      !Number.isSafeInteger(input.sourceVersion) ||
      input.sourceVersion < 0 ||
      !Number.isSafeInteger(input.timeObserved) ||
      input.timeObserved < 0 ||
      input.descriptor.kind !== "file" ||
      input.descriptor.size !== input.ordinary.fingerprint.byteLength ||
      input.ordinary.fingerprint.algorithm !== "sha256" ||
      !isDigest(input.ordinary.fingerprint.digest) ||
      !Number.isSafeInteger(input.ordinary.fingerprint.byteLength) ||
      input.ordinary.fingerprint.byteLength < 0 ||
      !Number.isSafeInteger(input.ordinary.dispositionVersion) ||
      input.ordinary.dispositionVersion < 0 ||
      !Number.isSafeInteger(input.ordinary.lineageVersion) ||
      input.ordinary.lineageVersion < 0 ||
      !validAttribution(input.ordinary.attribution) ||
      input.ordinary.mediaType.trim().length === 0 ||
      input.relativePath !== relativePath ||
      !validSourceDescriptor(input.descriptor) ||
      !validReadReceipt(input.authorization)
    ) {
      return yield* invalid("The source-proof snapshot is malformed")
    }
    return {
      ordinary: {
        ...input.ordinary,
        fingerprint: { ...input.ordinary.fingerprint },
        attribution: { ...input.ordinary.attribution },
      },
      sourceVersion: input.sourceVersion,
      authorization: { ...input.authorization },
      relativePath: input.relativePath,
      descriptor: { ...input.descriptor },
      timeObserved: input.timeObserved,
    }
  })
}

function sanitizeCandidate(input: ProducerCandidate): Effect.Effect<ProducerCandidate, InvalidTransitionError> {
  return Effect.gen(function* () {
    if (
      !input.runIdentity.trim() ||
      input.runIdentity.length > 4_096 ||
      input.input.algorithm !== "sha256" ||
      !isDigest(input.input.digest) ||
      !Number.isSafeInteger(input.input.byteLength) ||
      input.input.byteLength < 0
    ) {
      return yield* invalid("The producer result identity or input attestation is malformed")
    }
    const provenance = yield* sanitizeProvenance(input.provenance)
    const diagnostics = yield* sanitizeDiagnostics(input.diagnostics)
    if (input.kind === "local_pdf") {
      if (provenance.kind !== "local_pdf" || input.usage.kind !== "local_pdf") {
        return yield* invalid("The local producer result has mismatched provenance or usage")
      }
      const usage = yield* sanitizeLocalUsage(input.usage)
      return {
        kind: "local_pdf",
        runIdentity: input.runIdentity,
        provenance,
        input: { ...input.input },
        bytes: input.bytes.slice(),
        diagnostics,
        usage,
      }
    }
    if (provenance.kind !== "configured_model" || input.usage.kind !== "configured_model") {
      return yield* invalid("The configured-model result has mismatched provenance or usage")
    }
    return {
      kind: "configured_model",
      runIdentity: input.runIdentity,
      provenance,
      input: { ...input.input },
      bytes: input.bytes.slice(),
      diagnostics,
      usage: yield* sanitizeModelUsage(input.usage),
    }
  })
}

function sanitizeProvenance(input: ProducerProvenance): Effect.Effect<ProducerProvenance, InvalidTransitionError> {
  if (input.kind === "local_pdf") {
    if (
      input.producerID !== "pdfjs-dist" ||
      input.producerVersion !== "5.7.284" ||
      input.task.id !== "representation" ||
      input.task.version !== 1 ||
      input.profile.id !== "repa.pdf-text.v1" ||
      input.profile.version !== 1 ||
      input.canonicalizer.id !== "repa.pdf-text-jsonl.v1" ||
      input.canonicalizer.version !== 1 ||
      canonicalJSON(input.limits) !== canonicalJSON(localPDFRecipe.limits) ||
      !positiveIntegers([
        input.limits.inputBytes,
        input.limits.outputBytes,
        input.limits.recordBytes,
        input.limits.pages,
        input.limits.itemsPerPage,
        input.limits.textItemBytes,
        input.limits.operatorsPerPage,
        input.limits.diagnostics,
        input.limits.wallTimeMs,
      ])
    ) {
      return invalid("The local PDF recipe is outside the closed Gate 11 profile")
    }
    return Effect.succeed(localPDFRecipe)
  }
  if (
    !input.providerID.trim() ||
    input.providerID !== input.providerID.trim() ||
    input.providerID.length > 256 ||
    !input.modelID.trim() ||
    input.modelID !== input.modelID.trim() ||
    input.modelID.length > 512 ||
    input.task.id !== "representation" ||
    input.task.version !== 1 ||
    input.profile.id !== "repa.model-rendition.v1" ||
    input.profile.version !== 1 ||
    !input.mediaType.trim() ||
    (input.variant !== undefined &&
      (!input.variant.trim() || input.variant !== input.variant.trim() || input.variant.length > 256)) ||
    !["pdf", "image"].includes(input.nativeInputCapability) ||
    !(
      (input.mediaType === "application/pdf" && input.nativeInputCapability === "pdf") ||
      (/^image\/[a-z0-9.+-]+$/i.test(input.mediaType) && input.nativeInputCapability === "image")
    ) ||
    !positiveIntegers([input.limits.inputBytes, input.limits.outputBytes, input.limits.wallTimeMs]) ||
    input.limits.inputBytes > 50 * 1024 * 1024 ||
    input.limits.outputBytes > 4 * 1024 * 1024 ||
    input.limits.wallTimeMs > 10 * 60 * 1_000 ||
    !Number.isSafeInteger(input.sampling.maxOutputTokens) ||
    input.sampling.maxOutputTokens < 1 ||
    input.sampling.maxOutputTokens > 32_768 ||
    !optionalFinite(input.sampling.temperature, 0, 2) ||
    !optionalFinite(input.sampling.topP, 0, 1) ||
    !optionalInteger(input.sampling.topK, 1, 1_000)
  ) {
    return invalid("The configured-model recipe is outside the closed Gate 11 profile")
  }
  return Effect.succeed({
    kind: "configured_model",
    providerID: input.providerID,
    modelID: input.modelID,
    task: { id: "representation", version: 1 },
    profile: { id: "repa.model-rendition.v1", version: 1 },
    ...(input.variant ? { variant: input.variant } : {}),
    mediaType: input.mediaType,
    nativeInputCapability: input.nativeInputCapability,
    sampling: {
      ...(input.sampling.temperature === undefined ? {} : { temperature: input.sampling.temperature }),
      ...(input.sampling.topP === undefined ? {} : { topP: input.sampling.topP }),
      ...(input.sampling.topK === undefined ? {} : { topK: input.sampling.topK }),
      maxOutputTokens: input.sampling.maxOutputTokens,
    },
    limits: {
      inputBytes: input.limits.inputBytes,
      outputBytes: input.limits.outputBytes,
      wallTimeMs: input.limits.wallTimeMs,
    },
  })
}

function sanitizeDiagnostics(
  input: readonly Diagnostic[],
): Effect.Effect<readonly Diagnostic[], InvalidTransitionError> {
  const allowed = new Set([
    "parser_warning",
    "parser_info",
    "source_page_count_mismatch",
    "unsupported_text_item",
    "operator_signals_unavailable",
    "provider_usage_unavailable",
    "provider_cost_unavailable",
  ])
  if (
    !Array.isArray(input) ||
    input.length > allowed.size ||
    input.some(
      (item) =>
        !allowed.has(item.code) ||
        !Number.isSafeInteger(item.count) ||
        item.count < 1 ||
        item.count > localPDFRecipe.limits.diagnostics,
    ) ||
    input.reduce((count, item) => count + item.count, 0) > localPDFRecipe.limits.diagnostics ||
    new Set(input.map((item) => item.code)).size !== input.length
  ) {
    return invalid("Producer diagnostics are outside the closed allowlist")
  }
  return Effect.succeed(input.map((item) => ({ code: item.code, count: item.count })))
}

function sanitizeLocalUsage(input: LocalPDFUsage): Effect.Effect<LocalPDFUsage, InvalidTransitionError> {
  const values = [
    input.pageCount,
    input.textItemCount,
    input.operatorCount,
    input.imagePaintOperations,
    input.signalPageCount,
    input.profileByteLength,
  ]
  if (!nonnegativeIntegers(values)) {
    return invalid("Local PDF usage contains an invalid numeric fact")
  }
  return Effect.succeed({
    kind: "local_pdf",
    pageCount: input.pageCount,
    textItemCount: input.textItemCount,
    operatorCount: input.operatorCount,
    imagePaintOperations: input.imagePaintOperations,
    signalPageCount: input.signalPageCount,
    profileByteLength: input.profileByteLength,
  })
}

function sanitizeModelUsage(input: ConfiguredModelUsage): Effect.Effect<ConfiguredModelUsage, InvalidTransitionError> {
  const tokens = input.tokens
  const values = [
    tokens?.total,
    tokens?.input,
    tokens?.output,
    tokens?.reasoning,
    tokens?.cache?.read,
    tokens?.cache?.write,
  ].filter((value): value is number => value !== undefined)
  if (!nonnegativeIntegers(values) || (input.cost !== undefined && (!Number.isFinite(input.cost) || input.cost < 0))) {
    return invalid("Configured-model usage contains an invalid numeric fact")
  }
  return Effect.succeed({
    kind: "configured_model",
    ...(input.cost === undefined ? {} : { cost: input.cost }),
    ...(tokens === undefined
      ? {}
      : {
          tokens: {
            ...(tokens.total === undefined ? {} : { total: tokens.total }),
            ...(tokens.input === undefined ? {} : { input: tokens.input }),
            ...(tokens.output === undefined ? {} : { output: tokens.output }),
            ...(tokens.reasoning === undefined ? {} : { reasoning: tokens.reasoning }),
            ...(tokens.cache === undefined
              ? {}
              : {
                  cache: {
                    ...(tokens.cache.read === undefined ? {} : { read: tokens.cache.read }),
                    ...(tokens.cache.write === undefined ? {} : { write: tokens.cache.write }),
                  },
                }),
          },
        }),
  })
}

function requireConversionAuthority(input: unknown): Effect.Effect<ConversionAuthority, InvalidTransitionError> {
  if (!(input instanceof ConversionAuthority)) return invalid("Conversion intent requires a trusted authority")
  if (
    !input.operationIdentity.trim() ||
    input.operationIdentity.length > 4_096 ||
    !input.authorizationBasis.trim() ||
    input.authorizationBasis.length > 4_096 ||
    (input.creationBasis === "learning_command" &&
      (!input.causalOccurrenceID?.trim() ||
        input.causalOccurrenceID.length > 4_096 ||
        !input.causalInvocationPartID?.trim() ||
        input.causalInvocationPartID.length > 4_096))
  ) {
    return invalid("The trusted conversion authority is malformed")
  }
  return Effect.succeed(input)
}

function requireLearnerAuthority(input: unknown): Effect.Effect<LearnerAuthority, InvalidTransitionError> {
  if (!(input instanceof LearnerAuthority)) return invalid("The transition requires trusted learner authority")
  if (
    !input.operationIdentity.trim() ||
    input.operationIdentity.length > 4_096 ||
    !input.authorizationBasis.trim() ||
    input.authorizationBasis.length > 4_096 ||
    (input.causalOccurrenceID !== undefined &&
      (!input.causalOccurrenceID.trim() || input.causalOccurrenceID.length > 4_096)) ||
    (input.causalInvocationPartID !== undefined &&
      (!input.causalInvocationPartID.trim() || input.causalInvocationPartID.length > 4_096))
  ) {
    return invalid("The trusted learner authority is malformed")
  }
  return Effect.succeed(input)
}

function requireRepresentationRow(source: Queryable, revisionID: RevisionID) {
  return Effect.gen(function* () {
    const row = yield* source
      .select()
      .from(RepresentationRevisionTable)
      .where(eq(RepresentationRevisionTable.id, revisionID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* new NotFoundError({ entity: "revision", id: revisionID })
    return row
  })
}

function requireAvailabilityRow(source: Queryable, revisionID: RevisionID) {
  return Effect.gen(function* () {
    const row = yield* source
      .select()
      .from(RepresentationAvailabilityCurrentTable)
      .where(eq(RepresentationAvailabilityCurrentTable.representation_revision_id, revisionID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* Effect.die(`Representation ${revisionID} has no availability projection`)
    return row
  })
}

function requireRepresentationInfo(source: Queryable, revisionID: RevisionID) {
  return Effect.gen(function* () {
    const [row, availability] = yield* Effect.all([
      requireRepresentationRow(source, revisionID),
      requireAvailabilityRow(source, revisionID),
    ])
    return representationInfo(row, availability)
  })
}

function requireGrantRow(source: Queryable, grantID: ContinuedUseGrantID) {
  return Effect.gen(function* () {
    const row = yield* source
      .select()
      .from(RepresentationContinuedUseGrantTable)
      .where(eq(RepresentationContinuedUseGrantTable.id, grantID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* new NotFoundError({ entity: "continued_use_grant", id: grantID })
    return row
  })
}

function representationInfo(row: RevisionRow, availability: AvailabilityRow): RepresentationInfo {
  return {
    id: row.id,
    effectID: row.effect_id,
    sourceProof: {
      ordinary: {
        effectiveArtifactID: row.effective_artifact_id,
        dispositionVersion: row.accepted_disposition_version,
        currentRevisionID: row.source_revision_id,
        attribution: attribution(row.attribution_type, row.attribution_member_id),
        lineageVersion: row.accepted_lineage_version,
        fingerprint: { algorithm: "sha256", digest: row.source_digest, byteLength: row.source_byte_length },
        mediaType: row.source_media_type,
      },
      sourceVersion: row.source_version,
      authorization: {
        contentRootID: row.content_root_id,
        bindingID: row.content_root_binding_id,
        bindingEpisodeID: row.content_root_binding_episode_id,
        bindingEpisodeOrdinal: row.content_root_binding_episode_ordinal,
        grantEpisodeID: row.content_root_grant_episode_id,
        grantVersion: row.content_root_grant_version,
      },
      relativePath: row.normalized_relative_path,
      descriptor: {
        platform: "windows_ntfs",
        verifierVersion: row.source_object_verifier_version,
        canonicalPath: row.source_object_canonical_path,
        canonicalPathKey: row.source_object_canonical_path_key,
        volumeSerial: row.source_object_volume_serial,
        objectID: row.source_object_id,
        creationTime: row.source_object_creation_time,
        changeTime: row.source_object_change_time,
        lastWriteTime: row.source_object_last_write_time,
        size: row.source_object_size,
        kind: "file",
      },
      timeObserved: row.source_observed_time,
    },
    producer: {
      kind: row.producer_kind,
      identity: row.producer_identity,
      version: row.producer_version,
      providerID: row.provider_id ?? undefined,
      modelID: row.model_id ?? undefined,
      profileVariant: row.profile_variant ?? undefined,
      provenance: row.provenance,
      runIdentity: row.run_identity,
      diagnostics: row.diagnostics,
      usage: row.usage,
    },
    profile: row.profile,
    resultBoundary: row.result_boundary,
    terminalStatus: row.terminal_status,
    acceptanceBasis: row.acceptance_basis,
    output: {
      mediaType: row.output_media_type,
      storageKey: row.storage_key,
      digest: row.output_digest,
      byteLength: row.output_byte_length,
      recordCount: row.profile_record_count,
    },
    creation: {
      basis: row.creation_basis,
      identity: row.creation_identity,
      authorizationBasis: row.authorization_basis,
      deliveryMode: row.delivery_mode,
      causalOccurrenceID: row.causal_occurrence_id ?? undefined,
      causalInvocationPartID: row.causal_invocation_part_id ?? undefined,
    },
    availability: {
      version: availability.version,
      disposition: availability.disposition,
      timeUpdated: availability.time_updated,
    },
    timeAccepted: row.time_accepted,
  }
}

function grantInfo(row: GrantRow): ContinuedUseGrantInfo {
  return {
    id: row.id,
    effectiveArtifactID: row.effective_artifact_id,
    representationRevisionID: row.representation_revision_id,
    oldSourceRevisionID: row.old_source_revision_id,
    currentSourceRevisionID: row.current_source_revision_id,
    currentAttribution: attribution(row.current_attribution_type, row.current_attribution_member_id),
    currentLineageVersion: row.current_lineage_version,
    version: row.version,
    disposition: row.disposition,
    authorizationBasis: row.authorization_basis,
    authorizationOperationIdentity: row.authorization_operation_identity,
    causalOccurrenceID: row.causal_occurrence_id ?? undefined,
    causalInvocationPartID: row.causal_invocation_part_id ?? undefined,
    revocationBasis: row.revocation_basis ?? undefined,
    revocationOperationIdentity: row.revocation_operation_identity ?? undefined,
    timeAuthorized: row.time_authorized,
    timeRevoked: row.time_revoked ?? undefined,
    timeUpdated: row.time_updated,
  }
}

function attribution(type: "recorded" | "lineage_correction", memberID: string | null): Artifact.AttributionBasis {
  if (type === "recorded") return { type: "recorded" }
  return { type: "lineage_correction", memberID: memberID as Artifact.LineageCorrectionMemberID }
}

function grantFingerprint(input: {
  readonly representation: RevisionRow
  readonly artifact: Artifact.OrdinaryUseSnapshot
  readonly authority: LearnerAuthority
}) {
  return semanticFingerprint({
    representationRevisionID: input.representation.id,
    effectiveArtifactID: input.artifact.effectiveArtifactID,
    oldSourceRevisionID: input.representation.source_revision_id,
    currentSourceRevisionID: input.artifact.currentRevisionID,
    currentAttribution: input.artifact.attribution,
    currentLineageVersion: input.artifact.lineageVersion,
    authorizationBasis: input.authority.authorizationBasis,
  })
}

function semanticFingerprint(value: unknown) {
  return sha256(new TextEncoder().encode(canonicalJSON(value)))
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

function sha256(bytes: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

function sameFingerprint(left: Artifact.Fingerprint, right: Artifact.Fingerprint) {
  return left.algorithm === right.algorithm && left.digest === right.digest && left.byteLength === right.byteLength
}

function sameAttribution(left: Artifact.AttributionBasis, right: Artifact.AttributionBasis) {
  return (
    left.type === right.type &&
    (left.type === "recorded" || (right.type === "lineage_correction" && left.memberID === right.memberID))
  )
}

function validAttribution(input: Artifact.AttributionBasis) {
  return (
    input.type === "recorded" || (input.type === "lineage_correction" && /^alm_[0-9A-Za-z]{26}$/.test(input.memberID))
  )
}

function validReadReceipt(input: ContentRoot.ReadAuthorizationReceipt) {
  return (
    /^crt_[0-9A-Za-z]{26}$/.test(input.contentRootID) &&
    /^crb_[0-9A-Za-z]{26}$/.test(input.bindingID) &&
    /^cbe_[0-9A-Za-z]{26}$/.test(input.bindingEpisodeID) &&
    /^cge_[0-9A-Za-z]{26}$/.test(input.grantEpisodeID) &&
    Number.isSafeInteger(input.bindingEpisodeOrdinal) &&
    input.bindingEpisodeOrdinal >= 1 &&
    Number.isSafeInteger(input.grantVersion) &&
    input.grantVersion >= 1
  )
}

function validSourceDescriptor(input: ContentRootNTFS.Descriptor) {
  return (
    input.platform === "windows_ntfs" &&
    Number.isSafeInteger(input.verifierVersion) &&
    input.verifierVersion >= 1 &&
    input.canonicalPath.length > 0 &&
    input.canonicalPath.length <= 65_536 &&
    input.canonicalPathKey === input.canonicalPath.toLowerCase() &&
    /^[0-9a-f]{16}$/.test(input.volumeSerial) &&
    /^[0-9a-f]{32}$/.test(input.objectID) &&
    /^\d+$/.test(input.creationTime) &&
    /^\d+$/.test(input.changeTime) &&
    /^\d+$/.test(input.lastWriteTime) &&
    Number.isSafeInteger(input.size) &&
    input.size >= 0 &&
    input.kind === "file"
  )
}

function pageLimit(value: number | undefined): Effect.Effect<number, InvalidReadError> {
  const limit = value ?? 100
  if (Number.isSafeInteger(limit) && limit >= 1 && limit <= 500) return Effect.succeed(limit)
  return Effect.fail(new InvalidReadError({ detail: "Representation page limit must be between 1 and 500" }))
}

function positiveIntegers(values: readonly number[]) {
  return values.every((value) => Number.isSafeInteger(value) && value > 0)
}

function nonnegativeIntegers(values: readonly number[]) {
  return values.every((value) => Number.isSafeInteger(value) && value >= 0)
}

function optionalFinite(value: number | undefined, minimum: number, maximum: number) {
  return value === undefined || (Number.isFinite(value) && value >= minimum && value <= maximum)
}

function optionalInteger(value: number | undefined, minimum: number, maximum: number) {
  return value === undefined || (Number.isSafeInteger(value) && value >= minimum && value <= maximum)
}

function isDigest(value: string) {
  return /^[0-9a-f]{64}$/.test(value)
}

function invalid(detail: string) {
  return Effect.fail(new InvalidTransitionError({ detail }))
}
