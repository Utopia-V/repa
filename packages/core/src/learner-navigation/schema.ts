export * as LearnerNavigationSchema from "./schema"

import { Schema } from "effect"
import type { PermissionV1 } from "../v1/permission"
import { Identifier } from "../id/id"
import type { Course } from "../course"

export const DefaultEffectID = Schema.String.check(Schema.isPattern(/^ndp_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerNavigation.DefaultEffectID"),
)
export type DefaultEffectID = typeof DefaultEffectID.Type

export const AnchorEffectID = Schema.String.check(Schema.isPattern(/^nar_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerNavigation.AnchorEffectID"),
)
export type AnchorEffectID = typeof AnchorEffectID.Type

const decodeDefaultEffectID = Schema.decodeUnknownSync(DefaultEffectID)
const decodeAnchorEffectID = Schema.decodeUnknownSync(AnchorEffectID)

export const createDefaultEffectID = () => decodeDefaultEffectID(Identifier.create("ndp", "ascending"))
export const createAnchorEffectID = () => decodeAnchorEffectID(Identifier.create("nar", "ascending"))

export type DefaultCourseTarget = Readonly<{
  courseID: Course.CourseID
  courseVersion: number
  selectionRevisionID: Course.RevisionID | null
  selectionVersion: number
  viewID: Course.ViewID | null
  viewVersion: number | null
  revisionVersion: number | null
}>

export type DefaultCourseCommand = Readonly<{
  kind: "default_course_preference"
  expectedHeadID: DefaultEffectID | null
  expectedVersion: number
  target: DefaultCourseTarget | null
}>

export type RouteAnchorTarget = Readonly<{
  viewID: Course.ViewID
  revisionID: Course.RevisionID
  itemID: Course.ItemID
  courseVersion: number
  selectionVersion: number
  viewVersion: number
  revisionVersion: number
}>

export type RouteAnchorCommand = Readonly<{
  kind: "course_route_anchor"
  courseID: Course.CourseID
  expectedHeadID: AnchorEffectID | null
  expectedVersion: number
  target: RouteAnchorTarget | null
}>

export type Command = DefaultCourseCommand | RouteAnchorCommand

export type DefaultConfirmationSnapshot = Readonly<{
  permissionRequestID: PermissionV1.ID
  headID: DefaultEffectID | null
  version: number
  fromCourseID: Course.CourseID | null
  fromCourseTitle: string | null
  target: Course.PreferenceTargetReceipt | null
}>

export type SourceReceipt = Readonly<{
  receiptID: string
  occurrenceID: string
  originSessionID: string
  originMessageID: string
  assistantMessageID: string
  invocationPartID: string
  availability: "available" | "source_unavailable"
  timeDeleted?: number
}>

export type DefaultProjection = Readonly<{
  kind: "default_course_preference"
  headID: DefaultEffectID | null
  version: number
  courseID: Course.CourseID | null
  usability:
    | { readonly usable: true; readonly title: string }
    | {
        readonly usable: false
        readonly cause: "absent" | "course_not_found" | "course_withdrawn"
        readonly title?: string
      }
  source?: SourceReceipt
  timeCommitted?: number
  commitOrder?: number
  frontierSequence?: number
}>

export type AnchorProjection = Readonly<{
  kind: "course_route_anchor"
  courseID: Course.CourseID
  headID: AnchorEffectID | null
  version: number
  target: Course.MembershipEndpoint | null
  usability:
    | { readonly usable: true }
    | {
        readonly usable: false
        readonly cause: "absent" | Extract<Course.MembershipStatus, { readonly status: "stale" }>["cause"]
      }
  source?: SourceReceipt
  timeCommitted?: number
  commitOrder?: number
  frontierSequence?: number
}>

export type DefaultHistoryItem = Readonly<{
  effect: DefaultEffect
  relation: "current" | "superseded"
  source: SourceReceipt
}>

export type AnchorHistoryItem = Readonly<{
  effect: AnchorEffect
  relation: "current" | "superseded"
  source: SourceReceipt
}>

export type FallbackCourse = Readonly<{
  courseID: Course.CourseID
  availability: "available" | "course_not_found" | "course_withdrawn"
  title?: string
}>

export type FallbackResolution = Readonly<{
  source: "explicit" | "default" | "none"
  courses: readonly FallbackCourse[]
  default?: DefaultProjection
}>

export type DefaultEffect = Readonly<{
  id: DefaultEffectID
  occurrenceID: string
  previousCourseID: Course.CourseID | null
  courseID: Course.CourseID | null
  previousVersion: number
  version: number
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type AnchorEffect = Readonly<{
  id: AnchorEffectID
  occurrenceID: string
  courseID: Course.CourseID
  previousTarget: Course.MembershipEndpoint | null
  target: Course.MembershipEndpoint | null
  previousVersion: number
  version: number
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type PageOptions = Readonly<{ limit?: number; cursor?: string }>
export type Page<A> = Readonly<{ items: readonly A[]; cursor?: string }>

export class StaleStateError extends Schema.TaggedErrorClass<StaleStateError>()("LearnerNavigation.StaleStateError", {
  kind: Schema.Literals(["default_course_preference", "course_route_anchor"]),
  courseID: Schema.optional(Schema.String),
}) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "LearnerNavigation.InvalidCursorError",
  { detail: Schema.String },
) {}

export class InvalidReadError extends Schema.TaggedErrorClass<InvalidReadError>()(
  "LearnerNavigation.InvalidReadError",
  {
    detail: Schema.String,
  },
) {}

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()("LearnerNavigation.IntegrityError", {
  detail: Schema.String,
}) {}

export type Error = StaleStateError | InvalidCursorError | InvalidReadError | IntegrityError
