export * as MaterialMapSchema from "./schema"

import { Schema } from "effect"
import { Identifier } from "../id/id"

export const MapID = Schema.String.check(Schema.isPattern(/^mmp_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("MaterialMap.MapID"),
)
export type MapID = typeof MapID.Type

export const OutlineNodeID = Schema.String.check(Schema.isPattern(/^mnd_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("MaterialMap.OutlineNodeID"),
)
export type OutlineNodeID = typeof OutlineNodeID.Type

export const SelectorID = Schema.String.check(Schema.isPattern(/^msl_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("MaterialMap.SelectorID"),
)
export type SelectorID = typeof SelectorID.Type

export const AlignmentID = Schema.String.check(Schema.isPattern(/^mca_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("MaterialMap.AlignmentID"),
)
export type AlignmentID = typeof AlignmentID.Type

export const DispositionEventID = Schema.String.check(Schema.isPattern(/^mde_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("MaterialMap.DispositionEventID"),
)
export type DispositionEventID = typeof DispositionEventID.Type

export const AlignmentDispositionEventID = Schema.String.check(Schema.isPattern(/^mae_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("MaterialMap.AlignmentDispositionEventID"),
)
export type AlignmentDispositionEventID = typeof AlignmentDispositionEventID.Type

const decodeMapID = Schema.decodeUnknownSync(MapID)
const decodeOutlineNodeID = Schema.decodeUnknownSync(OutlineNodeID)
const decodeSelectorID = Schema.decodeUnknownSync(SelectorID)
const decodeAlignmentID = Schema.decodeUnknownSync(AlignmentID)
const decodeDispositionEventID = Schema.decodeUnknownSync(DispositionEventID)
const decodeAlignmentDispositionEventID = Schema.decodeUnknownSync(AlignmentDispositionEventID)

export const createMapID = () => decodeMapID(Identifier.create("mmp", "ascending"))
export const createOutlineNodeID = () => decodeOutlineNodeID(Identifier.create("mnd", "ascending"))
export const createSelectorID = () => decodeSelectorID(Identifier.create("msl", "ascending"))
export const createAlignmentID = () => decodeAlignmentID(Identifier.create("mca", "ascending"))
export const createDispositionEventID = () => decodeDispositionEventID(Identifier.create("mde", "ascending"))
export const createAlignmentDispositionEventID = () =>
  decodeAlignmentDispositionEventID(Identifier.create("mae", "ascending"))

export const SelectorKind = Schema.Literals([
  "whole_target.v1",
  "artifact_byte_range.v1",
  "pdf_page_range.v1",
  "pdf_text_range.v1",
  "model_text_range.v1",
])
export type SelectorKind = typeof SelectorKind.Type

export const TargetKind = Schema.Literals(["artifact", "representation"])
export type TargetKind = typeof TargetKind.Type

export const SelectionBasis = Schema.Literals(["explicit_exact", "observed_working"])
export type SelectionBasis = typeof SelectionBasis.Type

export const Disposition = Schema.Literals(["active", "withdrawn"])
export type Disposition = typeof Disposition.Type

export class Authorship {
  private constructor(
    readonly basis: string,
    readonly capabilityIdentity: string,
    readonly capabilityVersion: number,
  ) {}

  static trusted(basis: string, capabilityIdentity: string, capabilityVersion: number) {
    return new Authorship(basis, capabilityIdentity, capabilityVersion)
  }
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("MaterialMap.NotFoundError", {
  entity: Schema.Literals(["map", "outline_node", "selector", "alignment"]),
  id: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("MaterialMap.ConflictError", {
  entity: Schema.Literals(["map", "alignment", "map_state", "alignment_state"]),
  id: Schema.String,
  detail: Schema.String,
}) {}

export class InactiveError extends Schema.TaggedErrorClass<InactiveError>()("MaterialMap.InactiveError", {
  entity: Schema.Literals(["map", "alignment"]),
  id: Schema.String,
}) {}

export class InvalidTransitionError extends Schema.TaggedErrorClass<InvalidTransitionError>()(
  "MaterialMap.InvalidTransitionError",
  { detail: Schema.String },
) {}

export const PreparationFailureCode = Schema.Literals([
  "source_ineligible",
  "source_unavailable",
  "stale_target",
  "source_provenance",
  "ambiguous_content_root",
  "over_budget",
  "unsupported_selector",
  "invalid_selector",
  "invalid_outline",
  "witness_mismatch",
  "cancelled",
])
export type PreparationFailureCode = typeof PreparationFailureCode.Type

export class PreparationError extends Schema.TaggedErrorClass<PreparationError>()("MaterialMap.PreparationError", {
  code: PreparationFailureCode,
  detail: Schema.String,
}) {}

export class OutcomeUnknownError extends Schema.TaggedErrorClass<OutcomeUnknownError>()(
  "MaterialMap.OutcomeUnknownError",
  {
    entity: Schema.Literals(["map", "alignment"]),
    id: Schema.String,
  },
) {}

export class PersistenceError extends Schema.TaggedErrorClass<PersistenceError>()("MaterialMap.PersistenceError", {
  entity: Schema.Literals(["map", "alignment"]),
  id: Schema.String,
  operation: Schema.Literal("create"),
}) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "MaterialMap.InvalidCursorError",
  {
    detail: Schema.String,
  },
) {}

export type PageOptions = {
  readonly limit?: number
  readonly cursor?: string
}

export type Page<T> = {
  readonly items: T[]
  readonly cursor?: string
}

export type Error =
  | ConflictError
  | InactiveError
  | InvalidCursorError
  | InvalidTransitionError
  | NotFoundError
  | OutcomeUnknownError
  | PersistenceError
  | PreparationError
