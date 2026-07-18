export * as RepresentationSchema from "./schema"

import { Schema } from "effect"
import { Identifier } from "../id/id"

export const RevisionID = Schema.String.check(Schema.isPattern(/^rep_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Representation.RevisionID"),
)
export type RevisionID = typeof RevisionID.Type

export const EffectID = Schema.String.check(Schema.isPattern(/^rfx_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Representation.EffectID"),
)
export type EffectID = typeof EffectID.Type

export const AvailabilityEventID = Schema.String.check(Schema.isPattern(/^rav_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Representation.AvailabilityEventID"),
)
export type AvailabilityEventID = typeof AvailabilityEventID.Type

export const ContinuedUseGrantID = Schema.String.check(Schema.isPattern(/^rcg_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Representation.ContinuedUseGrantID"),
)
export type ContinuedUseGrantID = typeof ContinuedUseGrantID.Type

const decodeRevisionID = Schema.decodeUnknownSync(RevisionID)
const decodeEffectID = Schema.decodeUnknownSync(EffectID)
const decodeAvailabilityEventID = Schema.decodeUnknownSync(AvailabilityEventID)
const decodeContinuedUseGrantID = Schema.decodeUnknownSync(ContinuedUseGrantID)

export const createRevisionID = () => decodeRevisionID(Identifier.create("rep", "ascending"))
export const createEffectID = () => decodeEffectID(Identifier.create("rfx", "ascending"))
export const createAvailabilityEventID = () => decodeAvailabilityEventID(Identifier.create("rav", "ascending"))
export const createContinuedUseGrantID = () => decodeContinuedUseGrantID(Identifier.create("rcg", "ascending"))

export const ProducerKind = Schema.Literals(["local_pdf", "configured_model"])
export type ProducerKind = typeof ProducerKind.Type

export const Profile = Schema.Literals(["repa.pdf-text.v1", "repa.model-rendition.v1"])
export type Profile = typeof Profile.Type

export const ResultBoundary = Schema.Literals(["framed_stdout_v1", "model_schema_v1"])
export type ResultBoundary = typeof ResultBoundary.Type

export const TerminalStatus = Schema.Literals(["completed", "stop"])
export type TerminalStatus = typeof TerminalStatus.Type

export const AcceptanceBasis = Schema.Literals(["mechanical_profile", "model_claimed_rendition"])
export type AcceptanceBasis = typeof AcceptanceBasis.Type

export const Availability = Schema.Literals([
  "available",
  "externally_missing",
  "integrity_mismatch",
  "explicitly_deleted",
])
export type Availability = typeof Availability.Type

export const AvailabilityBasis = Schema.Literals([
  "acceptance",
  "verified_read",
  "missing_observation",
  "integrity_observation",
  "exact_restoration",
  "explicit_deletion",
  "deletion_recovery",
])
export type AvailabilityBasis = typeof AvailabilityBasis.Type

export const GrantDisposition = Schema.Literals(["active", "revoked"])
export type GrantDisposition = typeof GrantDisposition.Type

export const AttributionType = Schema.Literals(["recorded", "lineage_correction"])
export type AttributionType = typeof AttributionType.Type

export const CreationBasis = Schema.Literals(["deterministic_operation", "learning_command"])
export type CreationBasis = typeof CreationBasis.Type

export const ConversionIntent = Schema.Literal("persistent_readable_access")
export type ConversionIntent = typeof ConversionIntent.Type

export const DeliveryMode = Schema.Literals(["deterministic", "model_tool"])
export type DeliveryMode = typeof DeliveryMode.Type

export const NativeInputCapability = Schema.Literals(["pdf", "image"])
export type NativeInputCapability = typeof NativeInputCapability.Type

export const DiagnosticCode = Schema.Literals([
  "parser_warning",
  "parser_info",
  "source_page_count_mismatch",
  "unsupported_text_item",
  "operator_signals_unavailable",
  "provider_usage_unavailable",
  "provider_cost_unavailable",
])
export type DiagnosticCode = typeof DiagnosticCode.Type

export type Diagnostic = {
  readonly code: DiagnosticCode
  readonly count: number
}

export type LocalPDFProvenance = {
  readonly kind: "local_pdf"
  readonly producerID: "pdfjs-dist"
  readonly producerVersion: "5.7.284"
  readonly task: { readonly id: "representation"; readonly version: 1 }
  readonly profile: { readonly id: "repa.pdf-text.v1"; readonly version: 1 }
  readonly canonicalizer: { readonly id: "repa.pdf-text-jsonl.v1"; readonly version: 1 }
  readonly limits: {
    readonly inputBytes: number
    readonly outputBytes: number
    readonly recordBytes: number
    readonly pages: number
    readonly itemsPerPage: number
    readonly textItemBytes: number
    readonly operatorsPerPage: number
    readonly diagnostics: number
    readonly wallTimeMs: number
  }
}

export const localPDFRecipe = Object.freeze({
  kind: "local_pdf",
  producerID: "pdfjs-dist",
  producerVersion: "5.7.284",
  task: Object.freeze({ id: "representation", version: 1 }),
  profile: Object.freeze({ id: "repa.pdf-text.v1", version: 1 }),
  canonicalizer: Object.freeze({ id: "repa.pdf-text-jsonl.v1", version: 1 }),
  limits: Object.freeze({
    inputBytes: 64 * 1024 * 1024,
    outputBytes: 64 * 1024 * 1024,
    recordBytes: 8 * 1024 * 1024,
    pages: 2_000,
    itemsPerPage: 100_000,
    textItemBytes: 1024 * 1024,
    operatorsPerPage: 1_000_000,
    diagnostics: 10_000,
    wallTimeMs: 120_000,
  }),
}) satisfies LocalPDFProvenance

export type ConfiguredModelProvenance = {
  readonly kind: "configured_model"
  readonly providerID: string
  readonly modelID: string
  readonly task: { readonly id: "representation"; readonly version: 1 }
  readonly profile: { readonly id: "repa.model-rendition.v1"; readonly version: 1 }
  readonly variant?: string
  readonly mediaType: string
  readonly nativeInputCapability: NativeInputCapability
  readonly sampling: {
    readonly temperature?: number
    readonly topP?: number
    readonly topK?: number
    readonly maxOutputTokens: number
  }
  readonly limits: {
    readonly inputBytes: number
    readonly outputBytes: number
    readonly wallTimeMs: number
  }
}

export type ProducerProvenance = LocalPDFProvenance | ConfiguredModelProvenance

export type LocalPDFUsage = {
  readonly kind: "local_pdf"
  readonly pageCount: number
  readonly textItemCount: number
  readonly operatorCount: number
  readonly imagePaintOperations: number
  readonly signalPageCount: number
  readonly profileByteLength: number
}

export type ConfiguredModelUsage = {
  readonly kind: "configured_model"
  readonly cost?: number
  readonly tokens?: {
    readonly total?: number
    readonly input?: number
    readonly output?: number
    readonly reasoning?: number
    readonly cache?: { readonly read?: number; readonly write?: number }
  }
}

export type ProducerUsage = LocalPDFUsage | ConfiguredModelUsage

export class ConversionAuthority {
  readonly creationBasis: CreationBasis
  readonly operationIdentity: string
  readonly authorizationBasis: string
  readonly deliveryMode: DeliveryMode
  readonly causalOccurrenceID?: string
  readonly causalInvocationPartID?: string

  private constructor(input: {
    readonly creationBasis: CreationBasis
    readonly operationIdentity: string
    readonly authorizationBasis: string
    readonly deliveryMode: DeliveryMode
    readonly causalOccurrenceID?: string
    readonly causalInvocationPartID?: string
  }) {
    this.creationBasis = input.creationBasis
    this.operationIdentity = input.operationIdentity
    this.authorizationBasis = input.authorizationBasis
    this.deliveryMode = input.deliveryMode
    this.causalOccurrenceID = input.causalOccurrenceID
    this.causalInvocationPartID = input.causalInvocationPartID
  }

  static deterministic(operationIdentity: string, learnerBasis: string) {
    return new ConversionAuthority({
      creationBasis: "deterministic_operation",
      operationIdentity,
      authorizationBasis: learnerBasis,
      deliveryMode: "deterministic",
    })
  }

  static learningCommand(input: {
    readonly operationIdentity: string
    readonly authorizationBasis: string
    readonly occurrenceID: string
    readonly invocationPartID: string
  }) {
    return new ConversionAuthority({
      creationBasis: "learning_command",
      operationIdentity: input.operationIdentity,
      authorizationBasis: input.authorizationBasis,
      deliveryMode: "model_tool",
      causalOccurrenceID: input.occurrenceID,
      causalInvocationPartID: input.invocationPartID,
    })
  }
}

export class LearnerAuthority {
  readonly operationIdentity: string
  readonly authorizationBasis: string
  readonly causalOccurrenceID?: string
  readonly causalInvocationPartID?: string

  private constructor(input: {
    readonly operationIdentity: string
    readonly authorizationBasis: string
    readonly causalOccurrenceID?: string
    readonly causalInvocationPartID?: string
  }) {
    this.operationIdentity = input.operationIdentity
    this.authorizationBasis = input.authorizationBasis
    this.causalOccurrenceID = input.causalOccurrenceID
    this.causalInvocationPartID = input.causalInvocationPartID
  }

  static deterministic(operationIdentity: string, learnerBasis: string) {
    return new LearnerAuthority({ operationIdentity, authorizationBasis: learnerBasis })
  }

  static learningCommand(input: {
    readonly operationIdentity: string
    readonly authorizationBasis: string
    readonly occurrenceID: string
    readonly invocationPartID: string
  }) {
    return new LearnerAuthority({
      operationIdentity: input.operationIdentity,
      authorizationBasis: input.authorizationBasis,
      causalOccurrenceID: input.occurrenceID,
      causalInvocationPartID: input.invocationPartID,
    })
  }
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Representation.NotFoundError", {
  entity: Schema.Literals(["revision", "effect", "availability", "continued_use_grant"]),
  id: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("Representation.ConflictError", {
  entity: Schema.Literals(["effect", "source", "availability", "continued_use_grant", "deletion"]),
  id: Schema.String,
  expectedVersion: Schema.optional(Schema.Number),
  currentVersion: Schema.optional(Schema.Number),
  detail: Schema.String,
}) {}

export class InvalidTransitionError extends Schema.TaggedErrorClass<InvalidTransitionError>()(
  "Representation.InvalidTransitionError",
  { detail: Schema.String },
) {}

export class UnavailableError extends Schema.TaggedErrorClass<UnavailableError>()("Representation.UnavailableError", {
  revisionID: RevisionID,
  disposition: Availability,
  detail: Schema.String,
}) {}

export class IntegrityBudgetExceededError extends Schema.TaggedErrorClass<IntegrityBudgetExceededError>()(
  "Representation.IntegrityBudgetExceededError",
  { revisionID: RevisionID, requiredBytes: Schema.Number, ceilingBytes: Schema.Number },
) {}

export class ReturnBudgetExceededError extends Schema.TaggedErrorClass<ReturnBudgetExceededError>()(
  "Representation.ReturnBudgetExceededError",
  { revisionID: RevisionID, requiredBytes: Schema.Number, ceilingBytes: Schema.Number },
) {}

export class InvalidReadError extends Schema.TaggedErrorClass<InvalidReadError>()("Representation.InvalidReadError", {
  detail: Schema.String,
}) {}

export class CurrentUseDeniedError extends Schema.TaggedErrorClass<CurrentUseDeniedError>()(
  "Representation.CurrentUseDeniedError",
  {
    revisionID: RevisionID,
    effectiveArtifactID: Schema.String,
    reason: Schema.Literals([
      "artifact_ineligible",
      "wrong_artifact",
      "source_drift",
      "grant_required",
      "grant_stale",
      "grant_revoked",
      "availability_changed",
    ]),
  },
) {}

export class StorageError extends Schema.TaggedErrorClass<StorageError>()("Representation.StorageError", {
  operation: Schema.Literals(["prepare", "publish", "verify", "read", "delete", "restore", "cleanup"]),
  reason: Schema.Literals([
    "unsupported",
    "invalid_key",
    "already_exists",
    "missing",
    "identity_mismatch",
    "integrity_mismatch",
    "busy",
    "unreadable",
    "unresolved_recovery",
  ]),
  detail: Schema.String,
}) {}

export type Error =
  | NotFoundError
  | ConflictError
  | InvalidTransitionError
  | UnavailableError
  | IntegrityBudgetExceededError
  | ReturnBudgetExceededError
  | InvalidReadError
  | CurrentUseDeniedError
  | StorageError
