export * as CourseSchema from "./schema"

import { Schema } from "effect"
import { Identifier } from "../id/id"

export const CourseID = Schema.String.check(Schema.isPattern(/^crs_[0-9A-Za-z]{26}$/)).pipe(Schema.brand("Course.ID"))
export type CourseID = typeof CourseID.Type

export const ViewID = Schema.String.check(Schema.isPattern(/^cvw_[0-9A-Za-z]{26}$/)).pipe(Schema.brand("Course.ViewID"))
export type ViewID = typeof ViewID.Type

export const RevisionID = Schema.String.check(Schema.isPattern(/^cvr_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Course.RevisionID"),
)
export type RevisionID = typeof RevisionID.Type

export const ItemID = Schema.String.check(Schema.isPattern(/^cit_[0-9A-Za-z]{26}$/)).pipe(Schema.brand("Course.ItemID"))
export type ItemID = typeof ItemID.Type

export const MappingGroupID = Schema.String.check(Schema.isPattern(/^cmg_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Course.MappingGroupID"),
)
export type MappingGroupID = typeof MappingGroupID.Type

export const CitationID = Schema.String.check(Schema.isPattern(/^crc_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Course.CitationID"),
)
export type CitationID = typeof CitationID.Type

export const SelectionAcceptanceEffectID = Schema.String.check(Schema.isPattern(/^cse_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("Course.SelectionAcceptanceEffectID"),
)
export type SelectionAcceptanceEffectID = typeof SelectionAcceptanceEffectID.Type

const decodeCourseID = Schema.decodeUnknownSync(CourseID)
const decodeViewID = Schema.decodeUnknownSync(ViewID)
const decodeRevisionID = Schema.decodeUnknownSync(RevisionID)
const decodeItemID = Schema.decodeUnknownSync(ItemID)
const decodeMappingGroupID = Schema.decodeUnknownSync(MappingGroupID)
const decodeCitationID = Schema.decodeUnknownSync(CitationID)
const decodeSelectionAcceptanceEffectID = Schema.decodeUnknownSync(SelectionAcceptanceEffectID)

export const createCourseID = () => decodeCourseID(Identifier.create("crs", "ascending"))
export const createViewID = () => decodeViewID(Identifier.create("cvw", "ascending"))
export const createRevisionID = () => decodeRevisionID(Identifier.create("cvr", "ascending"))
export const createItemID = () => decodeItemID(Identifier.create("cit", "ascending"))
export const createMappingGroupID = () => decodeMappingGroupID(Identifier.create("cmg", "ascending"))
export const createCitationID = () => decodeCitationID(Identifier.create("crc", "ascending"))
export const createSelectionAcceptanceEffectID = () =>
  decodeSelectionAcceptanceEffectID(Identifier.create("cse", "ascending"))

export const AuthorshipBasis = Schema.Union([
  Schema.Literal("learner_authored"),
  Schema.Literal("learner_directed"),
  Schema.Literal("tutor_proposed"),
])
export type AuthorshipBasis = typeof AuthorshipBasis.Type

export class Authorship {
  readonly basis: AuthorshipBasis

  private constructor(basis: AuthorshipBasis) {
    this.basis = basis
  }

  static learnerAuthored() {
    return new Authorship("learner_authored")
  }

  static learnerDirected() {
    return new Authorship("learner_directed")
  }

  static tutorProposed() {
    return new Authorship("tutor_proposed")
  }
}

export const RevisionDisposition = Schema.Union([
  Schema.Literal("working"),
  Schema.Literal("historical"),
  Schema.Literal("candidate"),
  Schema.Literal("withdrawn"),
])
export type RevisionDisposition = typeof RevisionDisposition.Type

export const RevisionWithdrawalReason = Schema.Union([Schema.Literal("rejected_candidate"), Schema.Literal("removed")])
export type RevisionWithdrawalReason = typeof RevisionWithdrawalReason.Type

export const MappingKind = Schema.Union([Schema.Literal("preserve"), Schema.Literal("split"), Schema.Literal("merge")])
export type MappingKind = typeof MappingKind.Type

export type RevisionItemProposal = {
  readonly key: string
  readonly title: string
  readonly parentKey?: string
  readonly reuse?: {
    readonly sourceRevisionID: RevisionID
    readonly itemID: ItemID
  }
}

export type MappingProposal = {
  readonly kind: MappingKind
  readonly sourceItemIDs: readonly ItemID[]
  readonly targetKeys: readonly string[]
}

/** Deliberately excludes authorship; the trusted caller supplies it separately. */
export type RevisionProposal = {
  readonly items: readonly RevisionItemProposal[]
  readonly mappings?: readonly MappingProposal[]
}

export type WithdrawalSelection =
  | { readonly type: "unchanged" }
  | { readonly type: "clear" }
  | {
      readonly type: "replace"
      readonly revisionID: RevisionID
      readonly expectedViewVersion: number
      readonly expectedRevisionVersion: number
    }

export type PageOptions = {
  readonly limit?: number
  readonly cursor?: string
  readonly includeWithdrawn?: boolean
}

export type Page<T> = {
  readonly items: T[]
  readonly cursor?: string
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Course.NotFoundError", {
  entity: Schema.Union([
    Schema.Literal("course"),
    Schema.Literal("view"),
    Schema.Literal("revision"),
    Schema.Literal("item"),
    Schema.Literal("mapping_group"),
  ]),
  id: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("Course.ConflictError", {
  entity: Schema.Union([
    Schema.Literal("course"),
    Schema.Literal("view"),
    Schema.Literal("revision"),
    Schema.Literal("selection"),
  ]),
  id: Schema.String,
}) {}

export class InactiveError extends Schema.TaggedErrorClass<InactiveError>()("Course.InactiveError", {
  entity: Schema.Union([Schema.Literal("course"), Schema.Literal("view"), Schema.Literal("revision")]),
  id: Schema.String,
}) {}

export class InvalidTransitionError extends Schema.TaggedErrorClass<InvalidTransitionError>()(
  "Course.InvalidTransitionError",
  { detail: Schema.String },
) {}

export class InvalidHierarchyError extends Schema.TaggedErrorClass<InvalidHierarchyError>()(
  "Course.InvalidHierarchyError",
  { detail: Schema.String },
) {}

export class InvalidMappingError extends Schema.TaggedErrorClass<InvalidMappingError>()("Course.InvalidMappingError", {
  detail: Schema.String,
}) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()("Course.InvalidCursorError", {
  detail: Schema.String,
}) {}

export class AcceptanceEffectExistsError extends Schema.TaggedErrorClass<AcceptanceEffectExistsError>()(
  "Course.AcceptanceEffectExistsError",
  {
    effectID: SelectionAcceptanceEffectID,
  },
) {}

export type Error =
  | NotFoundError
  | ConflictError
  | InactiveError
  | InvalidTransitionError
  | InvalidHierarchyError
  | InvalidMappingError
  | InvalidCursorError
  | AcceptanceEffectExistsError
