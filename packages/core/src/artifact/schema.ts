export * as ArtifactSchema from "./schema"

import { Schema } from "effect"
import { Identifier } from "../id/id"

export const ArtifactID = Schema.String.check(Schema.isPattern(/^art_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Artifact.ID"),
)
export type ArtifactID = typeof ArtifactID.Type

export const RevisionID = Schema.String.check(Schema.isPattern(/^arv_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Artifact.RevisionID"),
)
export type RevisionID = typeof RevisionID.Type

export const BindingID = Schema.String.check(Schema.isPattern(/^abn_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Artifact.BindingID"),
)
export type BindingID = typeof BindingID.Type

export const ObservationID = Schema.String.check(Schema.isPattern(/^aob_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Artifact.ObservationID"),
)
export type ObservationID = typeof ObservationID.Type

export const ObservationCorrectionID = Schema.String.check(Schema.isPattern(/^aoc_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Artifact.ObservationCorrectionID"),
)
export type ObservationCorrectionID = typeof ObservationCorrectionID.Type

export const LineageCorrectionSetID = Schema.String.check(Schema.isPattern(/^als_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Artifact.LineageCorrectionSetID"),
)
export type LineageCorrectionSetID = typeof LineageCorrectionSetID.Type

export const LineageCorrectionMemberID = Schema.String.check(Schema.isPattern(/^alm_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Artifact.LineageCorrectionMemberID"),
)
export type LineageCorrectionMemberID = typeof LineageCorrectionMemberID.Type

const decodeArtifactID = Schema.decodeUnknownSync(ArtifactID)
const decodeRevisionID = Schema.decodeUnknownSync(RevisionID)
const decodeBindingID = Schema.decodeUnknownSync(BindingID)
const decodeObservationID = Schema.decodeUnknownSync(ObservationID)
const decodeObservationCorrectionID = Schema.decodeUnknownSync(ObservationCorrectionID)
const decodeLineageCorrectionSetID = Schema.decodeUnknownSync(LineageCorrectionSetID)
const decodeLineageCorrectionMemberID = Schema.decodeUnknownSync(LineageCorrectionMemberID)

export const createArtifactID = () => decodeArtifactID(Identifier.create("art", "ascending"))
export const createRevisionID = () => decodeRevisionID(Identifier.create("arv", "ascending"))
export const createBindingID = () => decodeBindingID(Identifier.create("abn", "ascending"))
export const createObservationID = () => decodeObservationID(Identifier.create("aob", "ascending"))
export const createObservationCorrectionID = () => decodeObservationCorrectionID(Identifier.create("aoc", "ascending"))
export const createLineageCorrectionSetID = () => decodeLineageCorrectionSetID(Identifier.create("als", "ascending"))
export const createLineageCorrectionMemberID = () =>
  decodeLineageCorrectionMemberID(Identifier.create("alm", "ascending"))

export const CreationBasis = Schema.Union([
  Schema.Literal("learner_instruction"),
  Schema.Literal("initialization_import"),
  Schema.Literal("lineage_correction"),
])
export type CreationBasis = typeof CreationBasis.Type

export const Availability = Schema.Union([
  Schema.Literal("available"),
  Schema.Literal("missing"),
  Schema.Literal("unbound"),
])
export type Availability = typeof Availability.Type

export const FingerprintAlgorithm = Schema.Literal("sha256")
export type FingerprintAlgorithm = typeof FingerprintAlgorithm.Type

export const AttributionView = Schema.Union([Schema.Literal("recorded"), Schema.Literal("effective")])
export type AttributionView = typeof AttributionView.Type

export const ObservationResult = Schema.Union([Schema.Literal("present"), Schema.Literal("missing")])
export type ObservationResult = typeof ObservationResult.Type

export const BindingBasis = Schema.Union([
  Schema.Literal("admission"),
  Schema.Literal("explicit_rebind"),
  Schema.Literal("lineage_correction"),
])
export type BindingBasis = typeof BindingBasis.Type

export const BindingEndReason = Schema.Union([Schema.Literal("explicit_rebind"), Schema.Literal("lineage_correction")])
export type BindingEndReason = typeof BindingEndReason.Type

export const ObservationCorrectionBasis = Schema.Union([
  Schema.Literal("learner_correction"),
  Schema.Literal("trusted_observer"),
])
export type ObservationCorrectionBasis = typeof ObservationCorrectionBasis.Type

export const LineageCorrectionBasis = Schema.Union([
  Schema.Literal("learner_statement"),
  Schema.Literal("trusted_non_model_discontinuity"),
])
export type LineageCorrectionBasis = typeof LineageCorrectionBasis.Type

export class CanonicalLocation {
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static trusted(value: string) {
    return new CanonicalLocation(value)
  }
}

export class Admission {
  readonly basis: Exclude<CreationBasis, "lineage_correction">
  readonly capabilityIdentity: string
  readonly capabilityVersion: number

  private constructor(
    basis: Exclude<CreationBasis, "lineage_correction">,
    capabilityIdentity: string,
    capabilityVersion: number,
  ) {
    this.basis = basis
    this.capabilityIdentity = capabilityIdentity
    this.capabilityVersion = capabilityVersion
  }

  static learnerInstruction(capabilityIdentity: string, capabilityVersion: number) {
    return new Admission("learner_instruction", capabilityIdentity, capabilityVersion)
  }

  static initializationImport(capabilityIdentity: string, capabilityVersion: number) {
    return new Admission("initialization_import", capabilityIdentity, capabilityVersion)
  }
}

export class Observer {
  readonly capabilityIdentity: string
  readonly capabilityVersion: number

  private constructor(capabilityIdentity: string, capabilityVersion: number) {
    this.capabilityIdentity = capabilityIdentity
    this.capabilityVersion = capabilityVersion
  }

  static trusted(capabilityIdentity: string, capabilityVersion: number) {
    return new Observer(capabilityIdentity, capabilityVersion)
  }
}

export class Rebind {
  readonly capabilityIdentity: string
  readonly capabilityVersion: number

  private constructor(capabilityIdentity: string, capabilityVersion: number) {
    this.capabilityIdentity = capabilityIdentity
    this.capabilityVersion = capabilityVersion
  }

  static explicitLearnerChoice(capabilityIdentity: string, capabilityVersion: number) {
    return new Rebind(capabilityIdentity, capabilityVersion)
  }
}

export class ObservationCorrectionAuthority {
  readonly basis: ObservationCorrectionBasis
  readonly capabilityIdentity: string
  readonly capabilityVersion: number

  private constructor(basis: ObservationCorrectionBasis, capabilityIdentity: string, capabilityVersion: number) {
    this.basis = basis
    this.capabilityIdentity = capabilityIdentity
    this.capabilityVersion = capabilityVersion
  }

  static learnerCorrection(capabilityIdentity: string, capabilityVersion: number) {
    return new ObservationCorrectionAuthority("learner_correction", capabilityIdentity, capabilityVersion)
  }

  static trustedObserver(capabilityIdentity: string, capabilityVersion: number) {
    return new ObservationCorrectionAuthority("trusted_observer", capabilityIdentity, capabilityVersion)
  }
}

export class LineageCorrectionAuthority {
  readonly basis: LineageCorrectionBasis
  readonly capabilityIdentity: string
  readonly capabilityVersion: number

  private constructor(basis: LineageCorrectionBasis, capabilityIdentity: string, capabilityVersion: number) {
    this.basis = basis
    this.capabilityIdentity = capabilityIdentity
    this.capabilityVersion = capabilityVersion
  }

  static learnerStatement(capabilityIdentity: string, capabilityVersion: number) {
    return new LineageCorrectionAuthority("learner_statement", capabilityIdentity, capabilityVersion)
  }

  static trustedNonModelDiscontinuity(capabilityIdentity: string, capabilityVersion: number) {
    return new LineageCorrectionAuthority("trusted_non_model_discontinuity", capabilityIdentity, capabilityVersion)
  }
}

export type PageOptions = {
  readonly limit?: number
  readonly cursor?: string
}

export type ArtifactPageOptions = PageOptions & {
  readonly includeWithdrawn?: boolean
}

export type RevisionPageOptions = PageOptions & {
  readonly view?: AttributionView
}

export type Page<T> = {
  readonly items: T[]
  readonly cursor?: string
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Artifact.NotFoundError", {
  entity: Schema.Union([
    Schema.Literal("artifact"),
    Schema.Literal("revision"),
    Schema.Literal("binding"),
    Schema.Literal("observation"),
    Schema.Literal("observation_correction"),
    Schema.Literal("lineage_correction_set"),
    Schema.Literal("lineage_correction_member"),
  ]),
  id: Schema.String,
}) {}

export class InactiveError extends Schema.TaggedErrorClass<InactiveError>()("Artifact.InactiveError", {
  artifactID: ArtifactID,
  reason: Schema.Union([Schema.Literal("removed"), Schema.Literal("lineage_correction")]),
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("Artifact.ConflictError", {
  entity: Schema.Union([
    Schema.Literal("artifact"),
    Schema.Literal("source"),
    Schema.Literal("lineage"),
    Schema.Literal("observation_correction"),
  ]),
  id: Schema.String,
  currentDispositionVersion: Schema.optional(Schema.Number),
  currentSourceVersion: Schema.optional(Schema.Number),
  currentLineageVersion: Schema.optional(Schema.Number),
  currentBindingID: Schema.optional(BindingID),
  currentRevisionID: Schema.optional(RevisionID),
  currentAttributionMemberID: Schema.optional(LineageCorrectionMemberID),
  currentSourceObservationID: Schema.optional(ObservationID),
  currentSourceMemberID: Schema.optional(LineageCorrectionMemberID),
  currentAvailability: Schema.optional(Availability),
  currentCorrectionID: Schema.optional(ObservationCorrectionID),
  currentCorrectionSequence: Schema.optional(Schema.Number),
}) {}

export class LocationConflictError extends Schema.TaggedErrorClass<LocationConflictError>()(
  "Artifact.LocationConflictError",
  {
    location: Schema.String,
    artifactID: ArtifactID,
    bindingID: BindingID,
  },
) {}

export class InvalidTransitionError extends Schema.TaggedErrorClass<InvalidTransitionError>()(
  "Artifact.InvalidTransitionError",
  { detail: Schema.String },
) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()("Artifact.InvalidCursorError", {
  detail: Schema.String,
}) {}

export type Error =
  | NotFoundError
  | InactiveError
  | ConflictError
  | LocationConflictError
  | InvalidTransitionError
  | InvalidCursorError
