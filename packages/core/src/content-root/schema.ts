export * as ContentRootSchema from "./schema"

import { Schema } from "effect"
import { Identifier } from "../id/id"

export const ContentRootID = Schema.String.check(Schema.isPattern(/^crt_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("ContentRoot.ID"),
)
export type ContentRootID = typeof ContentRootID.Type

export const BindingID = Schema.String.check(Schema.isPattern(/^crb_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("ContentRoot.BindingID"),
)
export type BindingID = typeof BindingID.Type

export const BindingEpisodeID = Schema.String.check(Schema.isPattern(/^cbe_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("ContentRoot.BindingEpisodeID"),
)
export type BindingEpisodeID = typeof BindingEpisodeID.Type

export const GrantEpisodeID = Schema.String.check(Schema.isPattern(/^cge_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("ContentRoot.GrantEpisodeID"),
)
export type GrantEpisodeID = typeof GrantEpisodeID.Type

export const MutationGrantID = Schema.String.check(Schema.isPattern(/^cmg_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("ContentRoot.MutationGrantID"),
)
export type MutationGrantID = typeof MutationGrantID.Type

const decodeContentRootID = Schema.decodeUnknownSync(ContentRootID)
const decodeBindingID = Schema.decodeUnknownSync(BindingID)
const decodeBindingEpisodeID = Schema.decodeUnknownSync(BindingEpisodeID)
const decodeGrantEpisodeID = Schema.decodeUnknownSync(GrantEpisodeID)
const decodeMutationGrantID = Schema.decodeUnknownSync(MutationGrantID)

export const createContentRootID = () => decodeContentRootID(Identifier.create("crt", "ascending"))
export const createBindingID = () => decodeBindingID(Identifier.create("crb", "ascending"))
export const createBindingEpisodeID = () => decodeBindingEpisodeID(Identifier.create("cbe", "ascending"))
export const createGrantEpisodeID = () => decodeGrantEpisodeID(Identifier.create("cge", "ascending"))
export const createMutationGrantID = () => decodeMutationGrantID(Identifier.create("cmg", "ascending"))

export const MutationRight = Schema.Literals([
  "create",
  "modify",
  "delete",
  "rename_source",
  "rename_destination",
])
export type MutationRight = typeof MutationRight.Type

export const MutationScope = Schema.Literals(["exact", "subtree"])
export type MutationScope = typeof MutationScope.Type

export class UnsupportedFilesystemError extends Schema.TaggedErrorClass<UnsupportedFilesystemError>()(
  "ContentRoot.UnsupportedFilesystemError",
  {
    path: Schema.String,
    platform: Schema.String,
    filesystem: Schema.optional(Schema.String),
    detail: Schema.String,
  },
) {}

export class PathError extends Schema.TaggedErrorClass<PathError>()("ContentRoot.PathError", {
  path: Schema.String,
  reason: Schema.Literals([
    "invalid_path",
    "not_found",
    "not_directory",
    "not_file",
    "unreadable",
    "reparse_point",
    "outside_scope",
    "identity_mismatch",
    "stale",
    "mutated",
    "budget_exceeded",
  ]),
  detail: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("ContentRoot.NotFoundError", {
  entity: Schema.Literals(["content_root", "binding", "grant_episode", "mutation_grant"]),
  id: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("ContentRoot.ConflictError", {
  entity: Schema.Literals(["binding", "binding_episode", "grant_episode", "mutation_grant"]),
  id: Schema.String,
  detail: Schema.String,
  expectedVersion: Schema.optional(Schema.Number),
  currentVersion: Schema.optional(Schema.Number),
}) {}

export class InvalidTransitionError extends Schema.TaggedErrorClass<InvalidTransitionError>()(
  "ContentRoot.InvalidTransitionError",
  { detail: Schema.String },
) {}

export type Error =
  | UnsupportedFilesystemError
  | PathError
  | NotFoundError
  | ConflictError
  | InvalidTransitionError
