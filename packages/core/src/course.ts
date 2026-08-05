export * as Course from "./course"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { LearningFrontier } from "./learning-frontier"
import { CourseCursor } from "./course/cursor"
import { CourseRevision } from "./course/revision"
import {
  Authorship,
  AcceptanceEffectExistsError,
  ConflictError,
  CourseID,
  InactiveError,
  InvalidCursorError,
  InvalidTransitionError,
  ItemID,
  NotFoundError,
  RevisionID,
  ViewID,
  createSelectionAcceptanceEffectID,
  createCourseID,
  createRevisionID,
  createViewID,
  type AuthorshipBasis,
  type CitationID,
  type Error,
  type MappingGroupID,
  type MappingKind,
  type Page,
  type PageOptions,
  type RevisionDisposition,
  type RevisionProposal,
  type RevisionWithdrawalReason,
  type SelectionAcceptanceEffectID,
  type WithdrawalSelection,
} from "./course/schema"
import {
  CourseItemTable,
  CourseSelectionAcceptanceCommitSealTable,
  CourseSelectionAcceptanceEffectTable,
  CourseTable,
  CourseViewRevisionItemTable,
  CourseViewRevisionMappingGroupTable,
  CourseViewRevisionMappingSourceTable,
  CourseViewRevisionMappingTargetTable,
  CourseViewRevisionReuseCitationTable,
  CourseViewRevisionStateTable,
  CourseViewRevisionTable,
  CourseViewTable,
  CourseWorkingSelectionTable,
} from "./course/sql"
import type { OccurrenceID } from "./learning-command/occurrence-schema"

export {
  Authorship,
  AcceptanceEffectExistsError,
  ConflictError,
  InactiveError,
  InvalidCursorError,
  InvalidHierarchyError,
  InvalidMappingError,
  InvalidTransitionError,
  NotFoundError,
  CourseID,
  ViewID,
  RevisionID,
  ItemID,
  MappingGroupID,
  CitationID,
  SelectionAcceptanceEffectID,
} from "./course/schema"
export type {
  AuthorshipBasis,
  Error,
  MappingKind,
  Page,
  PageOptions,
  RevisionDisposition,
  RevisionProposal,
  RevisionWithdrawalReason,
  WithdrawalSelection,
} from "./course/schema"

type DatabaseShape = EffectDrizzleSqlite.EffectSQLiteDatabase
export type Transaction = Parameters<Parameters<DatabaseShape["transaction"]>[0]>[0]
type Queryable = DatabaseShape | Transaction

function snapshot<A, E, R>(database: DatabaseShape, read: (tx: Transaction) => Effect.Effect<A, E, R>) {
  return database.transaction(read).pipe(Effect.catchTag("SqlError", Effect.die))
}

export type Selection = {
  readonly revisionID?: RevisionID
  readonly version: number
}

export type MembershipEndpoint = {
  readonly courseID: CourseID
  readonly viewID: ViewID
  readonly revisionID: RevisionID
  readonly itemID: ItemID
}

export type PresentationLocator = Readonly<{
  course: Readonly<{ id: CourseID; title: string; showID: boolean }>
  view: Readonly<{ id: ViewID; name: string; showID: boolean }>
  revision: Readonly<{ id: RevisionID; number: number; showID: boolean }>
  item?: Readonly<{ id: ItemID; title: string; position: number; showID: boolean }>
}>

export type MembershipSelection =
  | { readonly type: "explicit_exact" }
  | {
      readonly type: "observed_working"
      readonly revisionID: RevisionID
      readonly version: number
    }

type MembershipExpectation = {
  readonly endpoint: MembershipEndpoint
  readonly selection: MembershipSelection
  readonly courseVersion: number
  readonly viewVersion: number
  readonly revisionVersion: number
}

export type MembershipReceipt = MembershipExpectation

export type MembershipStatus =
  | { readonly status: "eligible" }
  | {
      readonly status: "stale"
      readonly cause:
        | "course_not_found"
        | "course_withdrawn"
        | "view_not_found"
        | "view_withdrawn"
        | "revision_not_found"
        | "revision_withdrawn"
        | "membership_missing"
        | "working_selection_mismatch"
    }

const membershipProofToken = Symbol("Course.MembershipProof")

export class MembershipProof {
  readonly endpoint: MembershipEndpoint
  readonly selection: MembershipSelection
  readonly receipt: MembershipReceipt
  #expectation: MembershipExpectation

  constructor(token: symbol, expectation: MembershipExpectation) {
    if (token !== membershipProofToken) throw new Error("Course membership proofs are owner-issued")
    this.endpoint = Object.freeze({ ...expectation.endpoint })
    this.selection = Object.freeze({ ...expectation.selection })
    this.receipt = Object.freeze({ ...expectation, endpoint: this.endpoint, selection: this.selection })
    this.#expectation = this.receipt
  }

  expectation(token: symbol) {
    if (token !== membershipProofToken) return
    return this.#expectation
  }
}

export type PreferenceTargetReceipt = Readonly<{
  courseID: CourseID
  courseTitle: string
  courseVersion: number
  selectionRevisionID: RevisionID | null
  selectionVersion: number
  viewID: ViewID | null
  viewName: string | null
  viewVersion: number | null
  revisionVersion: number | null
}>

export type PreferenceTargetExpectation = Readonly<{
  courseID: CourseID
  courseVersion: number
  selectionRevisionID: RevisionID | null
  selectionVersion: number
  viewID: ViewID | null
  viewVersion: number | null
  revisionVersion: number | null
}>

const preferenceTargetProofToken = Symbol("Course.PreferenceTargetProof")

export class PreferenceTargetProof {
  readonly receipt: PreferenceTargetReceipt
  #expectation: PreferenceTargetExpectation

  constructor(token: symbol, receipt: PreferenceTargetReceipt) {
    if (token !== preferenceTargetProofToken) throw new Error("Course preference target proofs are owner-issued")
    this.receipt = Object.freeze({ ...receipt })
    this.#expectation = Object.freeze({
      courseID: receipt.courseID,
      courseVersion: receipt.courseVersion,
      selectionRevisionID: receipt.selectionRevisionID,
      selectionVersion: receipt.selectionVersion,
      viewID: receipt.viewID,
      viewVersion: receipt.viewVersion,
      revisionVersion: receipt.revisionVersion,
    })
  }

  expectation(token: symbol): PreferenceTargetExpectation | undefined {
    if (token !== preferenceTargetProofToken) return undefined
    return this.#expectation
  }
}

export type PreferenceTargetStatus =
  | {
      readonly status: "available"
      readonly courseID: CourseID
      readonly title: string
      readonly stateVersion: number
      readonly timeUpdated: number
    }
  | {
      readonly status: "unavailable"
      readonly courseID: CourseID
      readonly cause: "course_not_found"
    }
  | {
      readonly status: "unavailable"
      readonly courseID: CourseID
      readonly cause: "course_withdrawn"
      readonly title: string
      readonly stateVersion: number
      readonly timeUpdated: number
    }

export type ActiveOwnerReceipt = Readonly<{
  courseID: CourseID
  courseTitle: string
  courseVersion: number
  timeUpdated: number
}>

const activeOwnerProofToken = Symbol("Course.ActiveOwnerProof")

/** Exact active Course-owner state for another authority's bounded reference. */
export class ActiveOwnerProof {
  readonly receipt: ActiveOwnerReceipt
  #courseVersion: number

  constructor(token: symbol, receipt: ActiveOwnerReceipt) {
    if (token !== activeOwnerProofToken) throw new Error("Course active-owner proofs are owner-issued")
    this.receipt = Object.freeze({ ...receipt })
    this.#courseVersion = receipt.courseVersion
  }

  expectation(token: symbol) {
    if (token !== activeOwnerProofToken) return
    return { courseID: this.receipt.courseID, courseVersion: this.#courseVersion }
  }
}

export type SelectionAcceptanceInput = {
  readonly courseID: CourseID
  readonly revisionID: RevisionID
  readonly expectedCourseVersion: number
  readonly expectedSelectionRevisionID?: RevisionID
  readonly expectedSelectionVersion: number
  readonly expectedViewVersion: number
  readonly expectedRevisionVersion: number
}

export type SelectionAcceptanceEffect = {
  readonly id: SelectionAcceptanceEffectID
  readonly occurrenceID: OccurrenceID
  readonly courseID: CourseID
  readonly revisionID: RevisionID
  readonly previousSelection: Selection
  readonly committedSelection: Selection
  readonly timeCommitted: number
}

export type SelectionAcceptanceResolution =
  | { readonly type: "new" }
  | {
      readonly type: "already_applied"
      readonly effect: SelectionAcceptanceEffect
      readonly currentSelection: Selection
      readonly currentSelectionTime: number
      readonly relation: "active" | "superseded"
    }
  | { readonly type: "semantic_conflict"; readonly effect: SelectionAcceptanceEffect }

export type SelectionAcceptancePresentation = Readonly<{
  effect: SelectionAcceptanceEffect
  currentSelection: Selection
  relation: "active" | "superseded"
  locator: PresentationLocator
}>

export type CourseInfo = {
  readonly id: CourseID
  readonly title: string
  readonly stateVersion: number
  readonly withdrawalReason?: "removed"
  readonly timeCreated: number
  readonly timeUpdated: number
  readonly selection: Selection
}

export type ViewInfo = {
  readonly id: ViewID
  readonly courseID: CourseID
  readonly name: string
  readonly stateVersion: number
  readonly withdrawalReason?: "removed"
  readonly effectiveWithdrawal?: "course" | "view"
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type RevisionSummary = {
  readonly id: RevisionID
  readonly courseID: CourseID
  readonly viewID: ViewID
  readonly revisionNumber: number
  readonly predecessorRevisionID?: RevisionID
  readonly authorshipBasis: AuthorshipBasis
  readonly stateVersion: number
  readonly withdrawalReason?: RevisionWithdrawalReason
  readonly effectiveWithdrawal?: "course" | "view" | "revision"
  readonly disposition: RevisionDisposition
  readonly timeCreated: number
}

export type RevisionItem = {
  readonly itemID: ItemID
  readonly parentItemID?: ItemID
  readonly title: string
  readonly preorderPosition: number
  readonly depth: number
}

export type MappingGroup = {
  readonly id: MappingGroupID
  readonly kind: MappingKind
  readonly sourceRevisionID: RevisionID
  readonly targetRevisionID: RevisionID
}

export type MappingMember = {
  readonly itemID: ItemID
}

export type ReuseCitation = {
  readonly id: CitationID
  readonly sourceViewID: ViewID
  readonly sourceRevisionID: RevisionID
  readonly targetViewID: ViewID
  readonly targetRevisionID: RevisionID
  readonly itemID: ItemID
}

export type RevisionTransition = {
  readonly revisionID: RevisionID
  readonly predecessorRevisionID?: RevisionID
}

export type LearningContextCourse = Readonly<{
  status: "available"
  course: CourseInfo
  working?: Readonly<{
    view: ViewInfo
    revision: RevisionSummary
    itemCountAtCut: number
    items: readonly RevisionItem[]
  }>
}>

export type LearningContextCourseProjection = Readonly<{
  countAtCut: number
  entries: readonly (
    | LearningContextCourse
    | Readonly<{ status: "unavailable"; courseID: CourseID; cause: "course_not_found" }>
  )[]
}>

export type LearningContextLocator = Readonly<{
  courseID: CourseID
  stateVersion: number
  selectionRevisionID: RevisionID | null
  selectionVersion: number
  workingViewID: ViewID | null
  workingViewVersion: number | null
  workingRevisionID: RevisionID | null
  workingRevisionNumber: number | null
  workingRevisionVersion: number | null
  predecessorRevisionID: RevisionID | null
  itemIDs: readonly ItemID[]
  itemCountAtCut: number
  lazyReadAvailable: boolean
}>

export type LearningContextLocatorRead =
  | Readonly<{
      type: "available"
      relation: "exact" | "superseded"
      selectionAtCut: Selection
      currentSelection: Selection
      course: CourseInfo
      working?: Readonly<{
        view: ViewInfo
        revision: RevisionSummary
        range: Readonly<{
          start: number
          returnedCount: number
          itemCountAtCut: number
          remaining: number
          items: readonly RevisionItem[]
        }>
      }>
    }>
  | Readonly<{
      type: "superseded"
      cause: "course_changed" | "view_changed" | "revision_changed" | "revision_contents_changed"
    }>
  | Readonly<{
      type: "unavailable"
      cause: "course_not_found" | "view_not_found" | "revision_not_found"
    }>

export function learningContextLocator(
  value: LearningContextCourse,
  lazyReadAvailable: boolean,
): LearningContextLocator {
  return {
    courseID: value.course.id,
    stateVersion: value.course.stateVersion,
    selectionRevisionID: value.course.selection.revisionID ?? null,
    selectionVersion: value.course.selection.version,
    workingViewID: value.working?.view.id ?? null,
    workingViewVersion: value.working?.view.stateVersion ?? null,
    workingRevisionID: value.working?.revision.id ?? null,
    workingRevisionNumber: value.working?.revision.revisionNumber ?? null,
    workingRevisionVersion: value.working?.revision.stateVersion ?? null,
    predecessorRevisionID: value.working?.revision.predecessorRevisionID ?? null,
    itemIDs: value.working?.items.map((item) => item.itemID) ?? [],
    itemCountAtCut: value.working?.itemCountAtCut ?? 0,
    lazyReadAvailable,
  }
}

export type PublishedRevision = Readonly<{
  view: ViewInfo
  revision: RevisionSummary
  items: Readonly<Record<string, ItemID>>
}>

export type RevisionOwnerReceipt = Readonly<{
  courseID: CourseID
  courseVersion: number
  viewID: ViewID
  viewVersion: number
  revisionID: RevisionID
  revisionVersion: number
  revisionNumber: number
}>

const revisionOwnerProofToken = Symbol("Course.RevisionOwnerProof")

export class RevisionOwnerProof {
  readonly receipt: RevisionOwnerReceipt
  #receipt: RevisionOwnerReceipt

  constructor(token: symbol, receipt: RevisionOwnerReceipt) {
    if (token !== revisionOwnerProofToken) throw new Error("Course Revision-owner proofs are owner-issued")
    this.receipt = Object.freeze({ ...receipt })
    this.#receipt = this.receipt
  }

  expectation(token: symbol) {
    if (token !== revisionOwnerProofToken) return
    return this.#receipt
  }
}

export type TransactionSelectionInput = Readonly<{
  courseID: CourseID
  revisionID?: RevisionID
  expectedCourseVersion: number
  expectedSelectionRevisionID?: RevisionID
  expectedSelectionVersion: number
  expectedViewVersion?: number
  expectedRevisionVersion?: number
  time: number
}>

export interface Interface {
  /** Owner-private transaction seam used by one local application composition. */
  readonly createCourseInTransaction: (
    tx: Transaction,
    input: Readonly<{ title: string; time: number }>,
  ) => Effect.Effect<CourseInfo, Error>
  /** Owner-private transaction seam used by one local application composition. */
  readonly correctCourseInTransaction: (
    tx: Transaction,
    input: Readonly<{ courseID: CourseID; title: string; expectedCourseVersion: number; time: number }>,
  ) => Effect.Effect<CourseInfo, Error>
  /** Owner-private transaction seam used by one local application composition. */
  readonly createViewInTransaction: (
    tx: Transaction,
    input: Readonly<{
      courseID: CourseID
      name: string
      expectedCourseVersion: number
      authorship: Authorship
      revision: RevisionProposal
      time: number
    }>,
  ) => Effect.Effect<PublishedRevision, Error>
  /** Owner-private transaction seam used by one local application composition. */
  readonly addRevisionInTransaction: (
    tx: Transaction,
    input: Readonly<{
      courseID: CourseID
      viewID: ViewID
      predecessorRevisionID: RevisionID
      expectedCourseVersion: number
      expectedViewVersion: number
      authorship: Authorship
      revision: RevisionProposal
      time: number
    }>,
  ) => Effect.Effect<PublishedRevision, Error>
  /** Owner-private transaction seam used by one local application composition. */
  readonly selectInTransaction: (tx: Transaction, input: TransactionSelectionInput) => Effect.Effect<Selection, Error>
  readonly createCourse: (input: { readonly title: string }) => Effect.Effect<CourseInfo, Error>
  readonly correctCourse: (input: {
    readonly courseID: CourseID
    readonly title: string
    readonly expectedCourseVersion: number
  }) => Effect.Effect<CourseInfo, Error>
  readonly createView: (input: {
    readonly courseID: CourseID
    readonly name: string
    readonly expectedCourseVersion: number
    readonly authorship: Authorship
    readonly revision: RevisionProposal
  }) => Effect.Effect<{ readonly view: ViewInfo; readonly revision: RevisionSummary }, Error>
  readonly correctView: (input: {
    readonly courseID: CourseID
    readonly viewID: ViewID
    readonly name: string
    readonly expectedCourseVersion: number
    readonly expectedViewVersion: number
  }) => Effect.Effect<ViewInfo, Error>
  readonly addRevision: (input: {
    readonly courseID: CourseID
    readonly viewID: ViewID
    readonly predecessorRevisionID: RevisionID
    readonly expectedCourseVersion: number
    readonly expectedViewVersion: number
    readonly authorship: Authorship
    readonly revision: RevisionProposal
  }) => Effect.Effect<RevisionSummary, Error>
  readonly select: (input: {
    readonly courseID: CourseID
    readonly revisionID?: RevisionID
    readonly expectedCourseVersion: number
    readonly expectedSelectionRevisionID?: RevisionID
    readonly expectedSelectionVersion: number
    readonly expectedViewVersion?: number
    readonly expectedRevisionVersion?: number
  }) => Effect.Effect<Selection, Error>
  readonly rejectCandidate: (input: {
    readonly courseID: CourseID
    readonly viewID: ViewID
    readonly revisionID: RevisionID
    readonly expectedCourseVersion: number
    readonly expectedViewVersion: number
    readonly expectedRevisionVersion: number
    readonly expectedSelectionRevisionID?: RevisionID
    readonly expectedSelectionVersion: number
  }) => Effect.Effect<RevisionSummary, Error>
  readonly withdrawRevision: (input: {
    readonly courseID: CourseID
    readonly viewID: ViewID
    readonly revisionID: RevisionID
    readonly expectedCourseVersion: number
    readonly expectedViewVersion: number
    readonly expectedRevisionVersion: number
    readonly expectedSelectionRevisionID?: RevisionID
    readonly expectedSelectionVersion: number
    readonly selection: WithdrawalSelection
  }) => Effect.Effect<RevisionSummary, Error>
  readonly withdrawView: (input: {
    readonly courseID: CourseID
    readonly viewID: ViewID
    readonly expectedCourseVersion: number
    readonly expectedViewVersion: number
    readonly expectedSelectionRevisionID?: RevisionID
    readonly expectedSelectionVersion: number
    readonly selection: WithdrawalSelection
  }) => Effect.Effect<ViewInfo, Error>
  readonly withdrawCourse: (input: {
    readonly courseID: CourseID
    readonly expectedCourseVersion: number
    readonly expectedSelectionRevisionID?: RevisionID
    readonly expectedSelectionVersion: number
  }) => Effect.Effect<CourseInfo, Error>
  readonly restoreCourse: (input: {
    readonly courseID: CourseID
    readonly expectedCourseVersion: number
  }) => Effect.Effect<CourseInfo, Error>
  readonly restoreView: (input: {
    readonly courseID: CourseID
    readonly viewID: ViewID
    readonly expectedCourseVersion: number
    readonly expectedViewVersion: number
  }) => Effect.Effect<ViewInfo, Error>
  readonly restoreRevision: (input: {
    readonly courseID: CourseID
    readonly viewID: ViewID
    readonly revisionID: RevisionID
    readonly expectedCourseVersion: number
    readonly expectedViewVersion: number
    readonly expectedRevisionVersion: number
  }) => Effect.Effect<RevisionSummary, Error>
  readonly listCourses: (options?: PageOptions) => Effect.Effect<Page<CourseInfo>, Error>
  readonly getCourse: (courseID: CourseID) => Effect.Effect<CourseInfo, Error>
  readonly readLearningContextLocator: (input: {
    readonly locator: unknown
    readonly start?: number
    readonly limit?: number
  }) => Effect.Effect<LearningContextLocatorRead, Error>
  readonly listViews: (courseID: CourseID, options?: PageOptions) => Effect.Effect<Page<ViewInfo>, Error>
  readonly getView: (courseID: CourseID, viewID: ViewID) => Effect.Effect<ViewInfo, Error>
  readonly listRevisions: (
    courseID: CourseID,
    viewID: ViewID,
    options?: PageOptions,
  ) => Effect.Effect<Page<RevisionSummary>, Error>
  readonly getRevision: (
    courseID: CourseID,
    viewID: ViewID,
    revisionID: RevisionID,
  ) => Effect.Effect<RevisionSummary, Error>
  readonly prepareMembership: (input: {
    readonly endpoint: MembershipEndpoint
    readonly selection: MembershipSelection
  }) => Effect.Effect<MembershipProof, Error>
  readonly listRevisionItems: (
    courseID: CourseID,
    viewID: ViewID,
    revisionID: RevisionID,
    options?: PageOptions,
  ) => Effect.Effect<Page<RevisionItem>, Error>
  readonly getRevisionTransition: (
    courseID: CourseID,
    viewID: ViewID,
    revisionID: RevisionID,
  ) => Effect.Effect<RevisionTransition, Error>
  readonly listMappingGroups: (
    courseID: CourseID,
    viewID: ViewID,
    revisionID: RevisionID,
    options?: PageOptions,
  ) => Effect.Effect<Page<MappingGroup>, Error>
  readonly listMappingSources: (
    courseID: CourseID,
    viewID: ViewID,
    revisionID: RevisionID,
    groupID: MappingGroupID,
    options?: PageOptions,
  ) => Effect.Effect<Page<MappingMember>, Error>
  readonly listMappingTargets: (
    courseID: CourseID,
    viewID: ViewID,
    revisionID: RevisionID,
    groupID: MappingGroupID,
    options?: PageOptions,
  ) => Effect.Effect<Page<MappingMember>, Error>
  readonly listReuseCitations: (
    courseID: CourseID,
    viewID: ViewID,
    revisionID: RevisionID,
    options?: PageOptions,
  ) => Effect.Effect<Page<ReuseCitation>, Error>
}

export class Service extends Context.Service<Service, Interface>()("@repa/Course") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db

    const getCourseInfo = (source: Queryable, courseID: CourseID) =>
      Effect.gen(function* () {
        const course = yield* requireCourse(source, courseID)
        const selection = yield* requireSelection(source, courseID)
        return courseInfo(course, selection)
      })

    const getViewInfo = (source: Queryable, courseID: CourseID, viewID: ViewID) =>
      Effect.gen(function* () {
        const course = yield* requireCourse(source, courseID)
        const view = yield* requireView(source, courseID, viewID)
        return viewInfo(course, view)
      })

    const getRevisionSummary = (source: Queryable, courseID: CourseID, viewID: ViewID, revisionID: RevisionID) =>
      Effect.gen(function* () {
        const course = yield* requireCourse(source, courseID)
        const view = yield* requireView(source, courseID, viewID)
        const revision = yield* requireRevision(source, courseID, viewID, revisionID)
        const selection = yield* requireSelection(source, courseID)
        const latest = yield* latestEligibleRevisionNumber(source, course, view)
        return revisionSummary(course, view, revision, selection, latest)
      })

    const readCourseInfo = (courseID: CourseID) => snapshot(db, (tx) => getCourseInfo(tx, courseID))
    const readViewInfo = (courseID: CourseID, viewID: ViewID) => snapshot(db, (tx) => getViewInfo(tx, courseID, viewID))
    const readRevisionSummary = (courseID: CourseID, viewID: ViewID, revisionID: RevisionID) =>
      snapshot(db, (tx) => getRevisionSummary(tx, courseID, viewID, revisionID))

    const publishRevision = (input: {
      readonly tx: Transaction
      readonly courseID: CourseID
      readonly viewID: ViewID
      readonly revisionID: RevisionID
      readonly revisionNumber: number
      readonly predecessorRevisionID?: RevisionID
      readonly authorshipBasis: AuthorshipBasis
      readonly prepared: CourseRevision.PreparedRevision
      readonly time: number
    }) =>
      Effect.gen(function* () {
        const identities = input.prepared.items.filter((item) => item.createIdentity)
        if (identities.length > 0) {
          yield* input.tx
            .insert(CourseItemTable)
            .values(
              identities.map((item) => ({
                id: item.itemID,
                course_id: input.courseID,
                time_created: input.time,
              })),
            )
            .run()
            .pipe(Effect.orDie)
        }
        yield* input.tx
          .insert(CourseViewRevisionTable)
          .values({
            id: input.revisionID,
            course_id: input.courseID,
            view_id: input.viewID,
            revision_number: input.revisionNumber,
            predecessor_revision_id: input.predecessorRevisionID,
            authorship_basis: input.authorshipBasis,
            time_created: input.time,
          })
          .run()
          .pipe(Effect.orDie)
        yield* input.tx
          .insert(CourseViewRevisionStateTable)
          .values({
            course_id: input.courseID,
            view_id: input.viewID,
            revision_id: input.revisionID,
            state_version: 0,
            time_updated: input.time,
          })
          .run()
          .pipe(Effect.orDie)
        yield* input.tx
          .insert(CourseViewRevisionItemTable)
          .values(
            input.prepared.items.map((item) => ({
              course_id: input.courseID,
              view_id: input.viewID,
              revision_id: input.revisionID,
              item_id: item.itemID,
              parent_item_id: item.parentItemID,
              title: item.title,
              preorder_position: item.preorderPosition,
              depth: item.depth,
            })),
          )
          .run()
          .pipe(Effect.orDie)

        if (input.prepared.mappings.length > 0) {
          yield* input.tx
            .insert(CourseViewRevisionMappingGroupTable)
            .values(
              input.prepared.mappings.map((mapping) => ({
                id: mapping.id,
                course_id: input.courseID,
                view_id: input.viewID,
                source_revision_id: input.predecessorRevisionID!,
                target_revision_id: input.revisionID,
                kind: mapping.kind,
                source_key: mapping.sourceKey,
                target_key: mapping.targetKey,
              })),
            )
            .run()
            .pipe(Effect.orDie)
          yield* input.tx
            .insert(CourseViewRevisionMappingSourceTable)
            .values(
              input.prepared.mappings.flatMap((mapping) =>
                mapping.sourceItemIDs.map((itemID) => ({
                  course_id: input.courseID,
                  view_id: input.viewID,
                  source_revision_id: input.predecessorRevisionID!,
                  target_revision_id: input.revisionID,
                  group_id: mapping.id,
                  item_id: itemID,
                })),
              ),
            )
            .run()
            .pipe(Effect.orDie)
          yield* input.tx
            .insert(CourseViewRevisionMappingTargetTable)
            .values(
              input.prepared.mappings.flatMap((mapping) =>
                mapping.targetItemIDs.map((itemID) => ({
                  course_id: input.courseID,
                  view_id: input.viewID,
                  source_revision_id: input.predecessorRevisionID!,
                  target_revision_id: input.revisionID,
                  group_id: mapping.id,
                  item_id: itemID,
                })),
              ),
            )
            .run()
            .pipe(Effect.orDie)
        }

        if (input.prepared.citations.length > 0) {
          yield* input.tx
            .insert(CourseViewRevisionReuseCitationTable)
            .values(
              input.prepared.citations.map((citation) => ({
                id: citation.id,
                course_id: input.courseID,
                source_view_id: citation.sourceViewID,
                source_revision_id: citation.sourceRevisionID,
                target_view_id: input.viewID,
                target_revision_id: input.revisionID,
                item_id: citation.itemID,
              })),
            )
            .run()
            .pipe(Effect.orDie)
        }
      })

    const prepareRevision = (
      source: Queryable,
      courseID: CourseID,
      proposal: RevisionProposal,
      predecessorRevisionID?: RevisionID,
    ) =>
      Effect.gen(function* () {
        const reuse = proposal.items.flatMap((item) => (item.reuse ? [item.reuse] : []))
        const citedMemberships =
          reuse.length === 0
            ? []
            : yield* source
                .select({
                  viewID: CourseViewRevisionItemTable.view_id,
                  revisionID: CourseViewRevisionItemTable.revision_id,
                  itemID: CourseViewRevisionItemTable.item_id,
                })
                .from(CourseViewRevisionItemTable)
                .where(
                  and(
                    eq(CourseViewRevisionItemTable.course_id, courseID),
                    inArray(
                      CourseViewRevisionItemTable.revision_id,
                      reuse.map((item) => item.sourceRevisionID),
                    ),
                    inArray(
                      CourseViewRevisionItemTable.item_id,
                      reuse.map((item) => item.itemID),
                    ),
                  ),
                )
                .all()
                .pipe(Effect.orDie)
        const predecessorItems = predecessorRevisionID
          ? yield* source
              .select({
                viewID: CourseViewRevisionItemTable.view_id,
                revisionID: CourseViewRevisionItemTable.revision_id,
                itemID: CourseViewRevisionItemTable.item_id,
              })
              .from(CourseViewRevisionItemTable)
              .where(
                and(
                  eq(CourseViewRevisionItemTable.course_id, courseID),
                  eq(CourseViewRevisionItemTable.revision_id, predecessorRevisionID),
                ),
              )
              .all()
              .pipe(Effect.orDie)
          : undefined
        return yield* CourseRevision.prepare({
          proposal,
          predecessor: predecessorRevisionID
            ? { revisionID: predecessorRevisionID, items: predecessorItems! }
            : undefined,
          citedMemberships,
        })
      })

    const createCourseInTransaction: Interface["createCourseInTransaction"] = Effect.fn(
      "Course.createCourseInTransaction",
    )(function* (tx, input) {
      const title = yield* titleValue(input.title, "Course")
      const courseID = createCourseID()
      yield* tx
        .insert(CourseTable)
        .values({
          id: courseID,
          title,
          state_version: 0,
          time_created: input.time,
          time_updated: input.time,
        })
        .run()
        .pipe(Effect.orDie)
      yield* tx
        .insert(CourseWorkingSelectionTable)
        .values({ course_id: courseID, version: 0, time_updated: input.time })
        .run()
        .pipe(Effect.orDie)
      return yield* getCourseInfo(tx, courseID)
    })

    const correctCourseInTransaction: Interface["correctCourseInTransaction"] = Effect.fn(
      "Course.correctCourseInTransaction",
    )(function* (tx, input) {
      const title = yield* titleValue(input.title, "Course")
      yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
      const updated = yield* tx
        .update(CourseTable)
        .set({ title, state_version: sql`${CourseTable.state_version} + 1`, time_updated: input.time })
        .where(
          and(
            eq(CourseTable.id, input.courseID),
            eq(CourseTable.state_version, input.expectedCourseVersion),
            isNull(CourseTable.withdrawal_reason),
          ),
        )
        .returning({ id: CourseTable.id })
        .get()
        .pipe(Effect.orDie)
      if (!updated) return yield* conflict("course", input.courseID)
      return yield* getCourseInfo(tx, input.courseID)
    })

    const createViewInTransaction: Interface["createViewInTransaction"] = Effect.fn("Course.createViewInTransaction")(
      function* (tx, input) {
        const name = yield* titleValue(input.name, "View")
        yield* requireAuthorship(input.authorship)
        yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
        const prepared = yield* prepareRevision(tx, input.courseID, input.revision)
        const viewID = createViewID()
        const revisionID = createRevisionID()
        yield* tx
          .insert(CourseViewTable)
          .values({
            id: viewID,
            course_id: input.courseID,
            name,
            state_version: 0,
            time_created: input.time,
            time_updated: input.time,
          })
          .run()
          .pipe(Effect.orDie)
        yield* publishRevision({
          tx,
          courseID: input.courseID,
          viewID,
          revisionID,
          revisionNumber: 1,
          authorshipBasis: input.authorship.basis,
          prepared,
          time: input.time,
        })
        return {
          view: yield* getViewInfo(tx, input.courseID, viewID),
          revision: yield* getRevisionSummary(tx, input.courseID, viewID, revisionID),
          items: Object.fromEntries(prepared.items.map((item) => [item.key, item.itemID])),
        }
      },
    )

    const addRevisionInTransaction: Interface["addRevisionInTransaction"] = Effect.fn(
      "Course.addRevisionInTransaction",
    )(function* (tx, input) {
      yield* requireAuthorship(input.authorship)
      yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
      const view = yield* requireView(tx, input.courseID, input.viewID, input.expectedViewVersion, true)
      const latest = yield* tx
        .select({ id: CourseViewRevisionTable.id, revisionNumber: CourseViewRevisionTable.revision_number })
        .from(CourseViewRevisionTable)
        .where(
          and(eq(CourseViewRevisionTable.course_id, input.courseID), eq(CourseViewRevisionTable.view_id, input.viewID)),
        )
        .orderBy(sql`${CourseViewRevisionTable.revision_number} DESC`)
        .limit(1)
        .get()
        .pipe(Effect.orDie)
      if (!latest || latest.id !== input.predecessorRevisionID) {
        return yield* conflict("revision", input.predecessorRevisionID)
      }
      const prepared = yield* prepareRevision(tx, input.courseID, input.revision, input.predecessorRevisionID)
      const revisionID = createRevisionID()
      yield* publishRevision({
        tx,
        courseID: input.courseID,
        viewID: input.viewID,
        revisionID,
        revisionNumber: latest.revisionNumber + 1,
        predecessorRevisionID: input.predecessorRevisionID,
        authorshipBasis: input.authorship.basis,
        prepared,
        time: input.time,
      })
      return {
        view: viewInfo(yield* requireCourse(tx, input.courseID), view),
        revision: yield* getRevisionSummary(tx, input.courseID, input.viewID, revisionID),
        items: Object.fromEntries(prepared.items.map((item) => [item.key, item.itemID])),
      }
    })

    const selectInTransaction: Interface["selectInTransaction"] = Effect.fn("Course.selectInTransaction")(
      function* (tx, input) {
        yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
        yield* requireSelection(tx, input.courseID, input.expectedSelectionRevisionID, input.expectedSelectionVersion)
        if (input.revisionID) {
          if (input.expectedViewVersion === undefined || input.expectedRevisionVersion === undefined) {
            return yield* new InvalidTransitionError({
              detail: "Selecting a Revision requires exact View and Revision state versions",
            })
          }
          yield* requireEligibleTarget(
            tx,
            input.courseID,
            input.revisionID,
            input.expectedViewVersion,
            input.expectedRevisionVersion,
          )
        }
        return yield* updateSelection(
          tx,
          input.courseID,
          input.expectedSelectionRevisionID,
          input.expectedSelectionVersion,
          input.revisionID,
          input.time,
        )
      },
    )

    const createCourse: Interface["createCourse"] = Effect.fn("Course.createCourse")(function* (input) {
      const time = Date.now()
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const course = yield* createCourseInTransaction(tx, { title: input.title, time })
            yield* LearningFrontier.advance(tx, { time })
            return course
          }),
        )
        .pipe(Effect.orDie)
    })

    const correctCourse: Interface["correctCourse"] = Effect.fn("Course.correctCourse")(function* (input) {
      const time = Date.now()
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const course = yield* correctCourseInTransaction(tx, { ...input, time })
            yield* LearningFrontier.advance(tx, { time })
            return course
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const createView: Interface["createView"] = Effect.fn("Course.createView")(function* (input) {
      const time = Date.now()
      const published = yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const result = yield* createViewInTransaction(tx, { ...input, time })
            yield* LearningFrontier.advance(tx, { time })
            return result
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return { view: published.view, revision: published.revision }
    })

    const correctView: Interface["correctView"] = Effect.fn("Course.correctView")(function* (input) {
      const name = yield* titleValue(input.name, "View")
      const time = Date.now()
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            yield* requireView(tx, input.courseID, input.viewID, input.expectedViewVersion, true)
            const updated = yield* tx
              .update(CourseViewTable)
              .set({ name, state_version: sql`${CourseViewTable.state_version} + 1`, time_updated: time })
              .where(
                and(
                  eq(CourseViewTable.course_id, input.courseID),
                  eq(CourseViewTable.id, input.viewID),
                  eq(CourseViewTable.state_version, input.expectedViewVersion),
                  isNull(CourseViewTable.withdrawal_reason),
                ),
              )
              .returning({ id: CourseViewTable.id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* conflict("view", input.viewID)
            yield* LearningFrontier.advance(tx, { time })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readViewInfo(input.courseID, input.viewID)
    })

    const addRevision: Interface["addRevision"] = Effect.fn("Course.addRevision")(function* (input) {
      const time = Date.now()
      const published = yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const result = yield* addRevisionInTransaction(tx, { ...input, time })
            yield* LearningFrontier.advance(tx, { time })
            return result
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return published.revision
    })

    const select: Interface["select"] = Effect.fn("Course.select")(function* (input) {
      const time = Date.now()
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const selection = yield* selectInTransaction(tx, { ...input, time })
            yield* LearningFrontier.advance(tx, { time })
            return selection
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const rejectCandidate: Interface["rejectCandidate"] = Effect.fn("Course.rejectCandidate")(function* (input) {
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            yield* requireView(tx, input.courseID, input.viewID, input.expectedViewVersion, true)
            const revision = yield* requireRevision(
              tx,
              input.courseID,
              input.viewID,
              input.revisionID,
              input.expectedRevisionVersion,
              true,
            )
            const selection = yield* requireSelection(
              tx,
              input.courseID,
              input.expectedSelectionRevisionID,
              input.expectedSelectionVersion,
            )
            if (selection.revision_id === input.revisionID) {
              return yield* new InvalidTransitionError({ detail: "A working Revision is not a candidate" })
            }
            const later = yield* tx
              .select({ id: CourseViewRevisionTable.id })
              .from(CourseViewRevisionTable)
              .innerJoin(
                CourseViewRevisionStateTable,
                eq(CourseViewRevisionStateTable.revision_id, CourseViewRevisionTable.id),
              )
              .where(
                and(
                  eq(CourseViewRevisionTable.course_id, input.courseID),
                  eq(CourseViewRevisionTable.view_id, input.viewID),
                  gt(CourseViewRevisionTable.revision_number, revision.revision_number),
                  isNull(CourseViewRevisionStateTable.withdrawal_reason),
                ),
              )
              .limit(1)
              .get()
              .pipe(Effect.orDie)
            if (later) {
              return yield* new InvalidTransitionError({
                detail: "Only the latest eligible unselected Revision is a candidate",
              })
            }
            yield* assertSelectionUnchanged(tx, selection)
            const time = Date.now()
            const updated = yield* tx
              .update(CourseViewRevisionStateTable)
              .set({
                withdrawal_reason: "rejected_candidate",
                state_version: sql`${CourseViewRevisionStateTable.state_version} + 1`,
                time_updated: time,
              })
              .where(
                and(
                  eq(CourseViewRevisionStateTable.revision_id, input.revisionID),
                  eq(CourseViewRevisionStateTable.state_version, input.expectedRevisionVersion),
                  isNull(CourseViewRevisionStateTable.withdrawal_reason),
                ),
              )
              .returning({ revisionID: CourseViewRevisionStateTable.revision_id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* conflict("revision", input.revisionID)
            yield* LearningFrontier.advance(tx, { time })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readRevisionSummary(input.courseID, input.viewID, input.revisionID)
    })

    const withdrawRevision: Interface["withdrawRevision"] = Effect.fn("Course.withdrawRevision")(function* (input) {
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            yield* requireView(tx, input.courseID, input.viewID, input.expectedViewVersion, true)
            yield* requireRevision(
              tx,
              input.courseID,
              input.viewID,
              input.revisionID,
              input.expectedRevisionVersion,
              true,
            )
            const selection = yield* requireSelection(
              tx,
              input.courseID,
              input.expectedSelectionRevisionID,
              input.expectedSelectionVersion,
            )
            const time = Date.now()
            yield* applyWithdrawalSelection(tx, {
              courseID: input.courseID,
              selection,
              effect: input.selection,
              affected: selection.revision_id === input.revisionID,
              forbiddenRevisionID: input.revisionID,
              time,
            })
            const updated = yield* tx
              .update(CourseViewRevisionStateTable)
              .set({
                withdrawal_reason: "removed",
                state_version: sql`${CourseViewRevisionStateTable.state_version} + 1`,
                time_updated: time,
              })
              .where(
                and(
                  eq(CourseViewRevisionStateTable.revision_id, input.revisionID),
                  eq(CourseViewRevisionStateTable.state_version, input.expectedRevisionVersion),
                  isNull(CourseViewRevisionStateTable.withdrawal_reason),
                ),
              )
              .returning({ revisionID: CourseViewRevisionStateTable.revision_id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* conflict("revision", input.revisionID)
            yield* LearningFrontier.advance(tx, { time })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readRevisionSummary(input.courseID, input.viewID, input.revisionID)
    })

    const withdrawView: Interface["withdrawView"] = Effect.fn("Course.withdrawView")(function* (input) {
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            yield* requireView(tx, input.courseID, input.viewID, input.expectedViewVersion, true)
            const selection = yield* requireSelection(
              tx,
              input.courseID,
              input.expectedSelectionRevisionID,
              input.expectedSelectionVersion,
            )
            const selected = selection.revision_id
              ? yield* tx
                  .select({ viewID: CourseViewRevisionTable.view_id })
                  .from(CourseViewRevisionTable)
                  .where(
                    and(
                      eq(CourseViewRevisionTable.course_id, input.courseID),
                      eq(CourseViewRevisionTable.id, selection.revision_id),
                    ),
                  )
                  .get()
                  .pipe(Effect.orDie)
              : undefined
            const time = Date.now()
            yield* applyWithdrawalSelection(tx, {
              courseID: input.courseID,
              selection,
              effect: input.selection,
              affected: selected?.viewID === input.viewID,
              forbiddenViewID: input.viewID,
              time,
            })
            const updated = yield* tx
              .update(CourseViewTable)
              .set({
                withdrawal_reason: "removed",
                state_version: sql`${CourseViewTable.state_version} + 1`,
                time_updated: time,
              })
              .where(
                and(
                  eq(CourseViewTable.course_id, input.courseID),
                  eq(CourseViewTable.id, input.viewID),
                  eq(CourseViewTable.state_version, input.expectedViewVersion),
                  isNull(CourseViewTable.withdrawal_reason),
                ),
              )
              .returning({ viewID: CourseViewTable.id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* conflict("view", input.viewID)
            yield* LearningFrontier.advance(tx, { time })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readViewInfo(input.courseID, input.viewID)
    })

    const withdrawCourse: Interface["withdrawCourse"] = Effect.fn("Course.withdrawCourse")(function* (input) {
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            yield* requireSelection(
              tx,
              input.courseID,
              input.expectedSelectionRevisionID,
              input.expectedSelectionVersion,
            )
            const time = Date.now()
            yield* updateSelection(
              tx,
              input.courseID,
              input.expectedSelectionRevisionID,
              input.expectedSelectionVersion,
              undefined,
              time,
            )
            const updated = yield* tx
              .update(CourseTable)
              .set({
                withdrawal_reason: "removed",
                state_version: sql`${CourseTable.state_version} + 1`,
                time_updated: time,
              })
              .where(
                and(
                  eq(CourseTable.id, input.courseID),
                  eq(CourseTable.state_version, input.expectedCourseVersion),
                  isNull(CourseTable.withdrawal_reason),
                ),
              )
              .returning({ courseID: CourseTable.id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* conflict("course", input.courseID)
            yield* LearningFrontier.advance(tx, { time })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readCourseInfo(input.courseID)
    })

    const restoreCourse: Interface["restoreCourse"] = Effect.fn("Course.restoreCourse")(function* (input) {
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const course = yield* requireCourse(tx, input.courseID, input.expectedCourseVersion)
            if (!course.withdrawal_reason) {
              return yield* new InvalidTransitionError({ detail: "Course is already active" })
            }
            const selection = yield* requireSelection(tx, input.courseID)
            if (selection.revision_id) {
              return yield* new InvalidTransitionError({
                detail: "A withdrawn Course cannot be restored with a selection",
              })
            }
            const time = Date.now()
            const updated = yield* tx
              .update(CourseTable)
              .set({
                withdrawal_reason: null,
                state_version: sql`${CourseTable.state_version} + 1`,
                time_updated: time,
              })
              .where(
                and(
                  eq(CourseTable.id, input.courseID),
                  eq(CourseTable.state_version, input.expectedCourseVersion),
                  eq(CourseTable.withdrawal_reason, "removed"),
                ),
              )
              .returning({ courseID: CourseTable.id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* conflict("course", input.courseID)
            yield* LearningFrontier.advance(tx, { time })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readCourseInfo(input.courseID)
    })

    const restoreView: Interface["restoreView"] = Effect.fn("Course.restoreView")(function* (input) {
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            const view = yield* requireView(tx, input.courseID, input.viewID, input.expectedViewVersion)
            if (!view.withdrawal_reason) {
              return yield* new InvalidTransitionError({ detail: "View is already active" })
            }
            const time = Date.now()
            const updated = yield* tx
              .update(CourseViewTable)
              .set({
                withdrawal_reason: null,
                state_version: sql`${CourseViewTable.state_version} + 1`,
                time_updated: time,
              })
              .where(
                and(
                  eq(CourseViewTable.course_id, input.courseID),
                  eq(CourseViewTable.id, input.viewID),
                  eq(CourseViewTable.state_version, input.expectedViewVersion),
                  eq(CourseViewTable.withdrawal_reason, "removed"),
                ),
              )
              .returning({ viewID: CourseViewTable.id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* conflict("view", input.viewID)
            yield* LearningFrontier.advance(tx, { time })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readViewInfo(input.courseID, input.viewID)
    })

    const restoreRevision: Interface["restoreRevision"] = Effect.fn("Course.restoreRevision")(function* (input) {
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            yield* requireView(tx, input.courseID, input.viewID, input.expectedViewVersion, true)
            const revision = yield* requireRevision(
              tx,
              input.courseID,
              input.viewID,
              input.revisionID,
              input.expectedRevisionVersion,
            )
            if (!revision.withdrawal_reason) {
              return yield* new InvalidTransitionError({ detail: "Revision is already active" })
            }
            const time = Date.now()
            const updated = yield* tx
              .update(CourseViewRevisionStateTable)
              .set({
                withdrawal_reason: null,
                state_version: sql`${CourseViewRevisionStateTable.state_version} + 1`,
                time_updated: time,
              })
              .where(
                and(
                  eq(CourseViewRevisionStateTable.revision_id, input.revisionID),
                  eq(CourseViewRevisionStateTable.state_version, input.expectedRevisionVersion),
                  eq(CourseViewRevisionStateTable.withdrawal_reason, revision.withdrawal_reason),
                ),
              )
              .returning({ revisionID: CourseViewRevisionStateTable.revision_id })
              .get()
              .pipe(Effect.orDie)
            if (!updated) return yield* conflict("revision", input.revisionID)
            yield* LearningFrontier.advance(tx, { time })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readRevisionSummary(input.courseID, input.viewID, input.revisionID)
    })

    const listCourses: Interface["listCourses"] = Effect.fn("Course.listCourses")(function* (input) {
      const includeWithdrawn = input?.includeWithdrawn ?? false
      const scope = { endpoint: "courses" as const, parent: "home", includeWithdrawn }
      const page = yield* CourseCursor.options(input, scope)
      const after = yield* twoPartKey(page.key, "number", "string")
      return yield* snapshot(db, (tx) =>
        Effect.gen(function* () {
          const rows = yield* tx
            .select()
            .from(CourseTable)
            .where(
              and(
                includeWithdrawn ? undefined : isNull(CourseTable.withdrawal_reason),
                after
                  ? or(
                      gt(CourseTable.time_created, after[0]),
                      and(eq(CourseTable.time_created, after[0]), gt(CourseTable.id, after[1] as CourseID)),
                    )
                  : undefined,
              ),
            )
            .orderBy(asc(CourseTable.time_created), asc(CourseTable.id))
            .limit(page.limit + 1)
            .all()
            .pipe(Effect.orDie)
          const visible = rows.slice(0, page.limit)
          const items = yield* Effect.forEach(visible, (course) =>
            requireSelection(tx, course.id).pipe(Effect.map((selection) => courseInfo(course, selection))),
          )
          return pageResult(items, rows.length > page.limit, scope, (item) => [item.timeCreated, item.id])
        }),
      )
    })

    const getCourse: Interface["getCourse"] = Effect.fn("Course.getCourse")(function* (courseID) {
      return yield* readCourseInfo(courseID)
    })

    const listViews: Interface["listViews"] = Effect.fn("Course.listViews")(function* (courseID, input) {
      const includeWithdrawn = input?.includeWithdrawn ?? false
      const scope = { endpoint: "views" as const, parent: courseID, includeWithdrawn }
      const page = yield* CourseCursor.options(input, scope)
      const after = yield* twoPartKey(page.key, "number", "string")
      return yield* snapshot(db, (tx) =>
        Effect.gen(function* () {
          const course = yield* requireCourse(tx, courseID)
          if (course.withdrawal_reason && !includeWithdrawn) return { items: [] }
          const rows = yield* tx
            .select()
            .from(CourseViewTable)
            .where(
              and(
                eq(CourseViewTable.course_id, courseID),
                includeWithdrawn ? undefined : isNull(CourseViewTable.withdrawal_reason),
                after
                  ? or(
                      gt(CourseViewTable.time_created, after[0]),
                      and(eq(CourseViewTable.time_created, after[0]), gt(CourseViewTable.id, after[1] as ViewID)),
                    )
                  : undefined,
              ),
            )
            .orderBy(asc(CourseViewTable.time_created), asc(CourseViewTable.id))
            .limit(page.limit + 1)
            .all()
            .pipe(Effect.orDie)
          const items = rows.slice(0, page.limit).map((view) => viewInfo(course, view))
          return pageResult(items, rows.length > page.limit, scope, (item) => [item.timeCreated, item.id])
        }),
      )
    })

    const getView: Interface["getView"] = Effect.fn("Course.getView")(function* (courseID, viewID) {
      return yield* readViewInfo(courseID, viewID)
    })

    const listRevisions: Interface["listRevisions"] = Effect.fn("Course.listRevisions")(
      function* (courseID, viewID, input) {
        const includeWithdrawn = input?.includeWithdrawn ?? false
        const scope = { endpoint: "revisions" as const, parent: `${courseID}/${viewID}`, includeWithdrawn }
        const page = yield* CourseCursor.options(input, scope)
        const after = yield* twoPartKey(page.key, "number", "string")
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            const course = yield* requireCourse(tx, courseID)
            const view = yield* requireView(tx, courseID, viewID)
            if ((course.withdrawal_reason || view.withdrawal_reason) && !includeWithdrawn) return { items: [] }
            const rows = yield* tx
              .select({
                id: CourseViewRevisionTable.id,
                course_id: CourseViewRevisionTable.course_id,
                view_id: CourseViewRevisionTable.view_id,
                revision_number: CourseViewRevisionTable.revision_number,
                predecessor_revision_id: CourseViewRevisionTable.predecessor_revision_id,
                authorship_basis: CourseViewRevisionTable.authorship_basis,
                time_created: CourseViewRevisionTable.time_created,
                state_version: CourseViewRevisionStateTable.state_version,
                withdrawal_reason: CourseViewRevisionStateTable.withdrawal_reason,
                time_updated: CourseViewRevisionStateTable.time_updated,
              })
              .from(CourseViewRevisionTable)
              .innerJoin(
                CourseViewRevisionStateTable,
                eq(CourseViewRevisionStateTable.revision_id, CourseViewRevisionTable.id),
              )
              .where(
                and(
                  eq(CourseViewRevisionTable.course_id, courseID),
                  eq(CourseViewRevisionTable.view_id, viewID),
                  includeWithdrawn ? undefined : isNull(CourseViewRevisionStateTable.withdrawal_reason),
                  after
                    ? or(
                        gt(CourseViewRevisionTable.revision_number, after[0]),
                        and(
                          eq(CourseViewRevisionTable.revision_number, after[0]),
                          gt(CourseViewRevisionTable.id, after[1] as RevisionID),
                        ),
                      )
                    : undefined,
                ),
              )
              .orderBy(asc(CourseViewRevisionTable.revision_number), asc(CourseViewRevisionTable.id))
              .limit(page.limit + 1)
              .all()
              .pipe(Effect.orDie)
            const selection = yield* requireSelection(tx, courseID)
            const latest = yield* latestEligibleRevisionNumber(tx, course, view)
            const items = rows
              .slice(0, page.limit)
              .map((revision) => revisionSummary(course, view, revision, selection, latest))
            return pageResult(items, rows.length > page.limit, scope, (item) => [item.revisionNumber, item.id])
          }),
        )
      },
    )

    const getRevision: Interface["getRevision"] = Effect.fn("Course.getRevision")(
      function* (courseID, viewID, revisionID) {
        return yield* readRevisionSummary(courseID, viewID, revisionID)
      },
    )

    const listRevisionItems: Interface["listRevisionItems"] = Effect.fn("Course.listRevisionItems")(
      function* (courseID, viewID, revisionID, input) {
        const includeWithdrawn = input?.includeWithdrawn ?? false
        const scope = { endpoint: "items" as const, parent: `${courseID}/${viewID}/${revisionID}`, includeWithdrawn }
        const page = yield* CourseCursor.options(input, scope)
        const after = yield* twoPartKey(page.key, "number", "string")
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            yield* requireReadableRevision(tx, courseID, viewID, revisionID, includeWithdrawn)
            const rows = yield* tx
              .select()
              .from(CourseViewRevisionItemTable)
              .where(
                and(
                  eq(CourseViewRevisionItemTable.course_id, courseID),
                  eq(CourseViewRevisionItemTable.view_id, viewID),
                  eq(CourseViewRevisionItemTable.revision_id, revisionID),
                  after
                    ? or(
                        gt(CourseViewRevisionItemTable.preorder_position, after[0]),
                        and(
                          eq(CourseViewRevisionItemTable.preorder_position, after[0]),
                          gt(CourseViewRevisionItemTable.item_id, after[1] as ItemID),
                        ),
                      )
                    : undefined,
                ),
              )
              .orderBy(asc(CourseViewRevisionItemTable.preorder_position), asc(CourseViewRevisionItemTable.item_id))
              .limit(page.limit + 1)
              .all()
              .pipe(Effect.orDie)
            const items = rows.slice(0, page.limit).map(
              (item) =>
                ({
                  itemID: item.item_id,
                  parentItemID: item.parent_item_id ?? undefined,
                  title: item.title,
                  preorderPosition: item.preorder_position,
                  depth: item.depth,
                }) satisfies RevisionItem,
            )
            return pageResult(items, rows.length > page.limit, scope, (item) => [item.preorderPosition, item.itemID])
          }),
        )
      },
    )

    const getRevisionTransition: Interface["getRevisionTransition"] = Effect.fn("Course.getRevisionTransition")(
      function* (courseID, viewID, revisionID) {
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            const revision = yield* requireRevision(tx, courseID, viewID, revisionID)
            return {
              revisionID: revision.id,
              predecessorRevisionID: revision.predecessor_revision_id ?? undefined,
            }
          }),
        )
      },
    )

    const listMappingGroups: Interface["listMappingGroups"] = Effect.fn("Course.listMappingGroups")(
      function* (courseID, viewID, revisionID, input) {
        const includeWithdrawn = input?.includeWithdrawn ?? false
        const scope = {
          endpoint: "mapping_groups" as const,
          parent: `${courseID}/${viewID}/${revisionID}`,
          includeWithdrawn,
        }
        const page = yield* CourseCursor.options(input, scope)
        const after = yield* threePartKey(page.key)
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            yield* requireReadableRevision(tx, courseID, viewID, revisionID, includeWithdrawn)
            const rows = yield* tx
              .select()
              .from(CourseViewRevisionMappingGroupTable)
              .where(
                and(
                  eq(CourseViewRevisionMappingGroupTable.course_id, courseID),
                  eq(CourseViewRevisionMappingGroupTable.view_id, viewID),
                  eq(CourseViewRevisionMappingGroupTable.target_revision_id, revisionID),
                  after
                    ? or(
                        gt(CourseViewRevisionMappingGroupTable.source_key, after[0]),
                        and(
                          eq(CourseViewRevisionMappingGroupTable.source_key, after[0]),
                          gt(CourseViewRevisionMappingGroupTable.target_key, after[1]),
                        ),
                        and(
                          eq(CourseViewRevisionMappingGroupTable.source_key, after[0]),
                          eq(CourseViewRevisionMappingGroupTable.target_key, after[1]),
                          gt(CourseViewRevisionMappingGroupTable.id, after[2] as MappingGroupID),
                        ),
                      )
                    : undefined,
                ),
              )
              .orderBy(
                asc(CourseViewRevisionMappingGroupTable.source_key),
                asc(CourseViewRevisionMappingGroupTable.target_key),
                asc(CourseViewRevisionMappingGroupTable.id),
              )
              .limit(page.limit + 1)
              .all()
              .pipe(Effect.orDie)
            const items = rows.slice(0, page.limit).map(
              (mapping) =>
                ({
                  id: mapping.id,
                  kind: mapping.kind,
                  sourceRevisionID: mapping.source_revision_id,
                  targetRevisionID: mapping.target_revision_id,
                }) satisfies MappingGroup,
            )
            const keys = new Map(rows.map((row) => [row.id, [row.source_key, row.target_key, row.id] as const]))
            return pageResult(items, rows.length > page.limit, scope, (item) => keys.get(item.id)!)
          }),
        )
      },
    )

    const listMappingSources: Interface["listMappingSources"] = Effect.fn("Course.listMappingSources")(
      function* (courseID, viewID, revisionID, groupID, input) {
        return yield* snapshot(db, (tx) =>
          listMappingMembers(
            tx,
            CourseViewRevisionMappingSourceTable,
            "mapping_sources",
            courseID,
            viewID,
            revisionID,
            groupID,
            input,
          ),
        )
      },
    )

    const listMappingTargets: Interface["listMappingTargets"] = Effect.fn("Course.listMappingTargets")(
      function* (courseID, viewID, revisionID, groupID, input) {
        return yield* snapshot(db, (tx) =>
          listMappingMembers(
            tx,
            CourseViewRevisionMappingTargetTable,
            "mapping_targets",
            courseID,
            viewID,
            revisionID,
            groupID,
            input,
          ),
        )
      },
    )

    const listReuseCitations: Interface["listReuseCitations"] = Effect.fn("Course.listReuseCitations")(
      function* (courseID, viewID, revisionID, input) {
        const includeWithdrawn = input?.includeWithdrawn ?? false
        const scope = {
          endpoint: "reuse_citations" as const,
          parent: `${courseID}/${viewID}/${revisionID}`,
          includeWithdrawn,
        }
        const page = yield* CourseCursor.options(input, scope)
        const after = yield* threePartKey(page.key)
        return yield* snapshot(db, (tx) =>
          Effect.gen(function* () {
            yield* requireReadableRevision(tx, courseID, viewID, revisionID, includeWithdrawn)
            const rows = yield* tx
              .select()
              .from(CourseViewRevisionReuseCitationTable)
              .where(
                and(
                  eq(CourseViewRevisionReuseCitationTable.course_id, courseID),
                  eq(CourseViewRevisionReuseCitationTable.target_view_id, viewID),
                  eq(CourseViewRevisionReuseCitationTable.target_revision_id, revisionID),
                  after
                    ? or(
                        gt(CourseViewRevisionReuseCitationTable.source_revision_id, after[0] as RevisionID),
                        and(
                          eq(CourseViewRevisionReuseCitationTable.source_revision_id, after[0] as RevisionID),
                          gt(CourseViewRevisionReuseCitationTable.item_id, after[1] as ItemID),
                        ),
                        and(
                          eq(CourseViewRevisionReuseCitationTable.source_revision_id, after[0] as RevisionID),
                          eq(CourseViewRevisionReuseCitationTable.item_id, after[1] as ItemID),
                          gt(CourseViewRevisionReuseCitationTable.id, after[2] as CitationID),
                        ),
                      )
                    : undefined,
                ),
              )
              .orderBy(
                asc(CourseViewRevisionReuseCitationTable.source_revision_id),
                asc(CourseViewRevisionReuseCitationTable.item_id),
                asc(CourseViewRevisionReuseCitationTable.id),
              )
              .limit(page.limit + 1)
              .all()
              .pipe(Effect.orDie)
            const items = rows.slice(0, page.limit).map(
              (citation) =>
                ({
                  id: citation.id,
                  sourceViewID: citation.source_view_id,
                  sourceRevisionID: citation.source_revision_id,
                  targetViewID: citation.target_view_id,
                  targetRevisionID: citation.target_revision_id,
                  itemID: citation.item_id,
                }) satisfies ReuseCitation,
            )
            const keys = new Map(rows.map((row) => [row.id, [row.source_revision_id, row.item_id, row.id] as const]))
            return pageResult(items, rows.length > page.limit, scope, (item) => keys.get(item.id)!)
          }),
        )
      },
    )

    const prepareMembership: Interface["prepareMembership"] = Effect.fn("Course.prepareMembership")(function* (input) {
      return yield* snapshot(db, (tx) => prepareMembershipProof(tx, input))
    })

    const readLearningContextLocator: Interface["readLearningContextLocator"] = Effect.fn(
      "Course.readLearningContextLocator",
    )(function* (input) {
      const locator = yield* decodeLearningContextLocator(input.locator)
      const start = input.start ?? 0
      const limit = input.limit ?? 64
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 64) {
        return yield* new InvalidTransitionError({ detail: "Pinned Course range must use start >= 0 and limit 1..64" })
      }
      return yield* snapshot(db, (tx) => inspectLearningContextLocator(tx, locator, start, limit))
    })

    return Service.of({
      createCourseInTransaction,
      correctCourseInTransaction,
      createViewInTransaction,
      addRevisionInTransaction,
      selectInTransaction,
      createCourse,
      correctCourse,
      createView,
      correctView,
      addRevision,
      select,
      rejectCandidate,
      withdrawRevision,
      withdrawView,
      withdrawCourse,
      restoreCourse,
      restoreView,
      restoreRevision,
      listCourses,
      getCourse,
      readLearningContextLocator,
      listViews,
      getView,
      listRevisions,
      getRevision,
      prepareMembership,
      listRevisionItems,
      getRevisionTransition,
      listMappingGroups,
      listMappingSources,
      listMappingTargets,
      listReuseCitations,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })

export function requireMembershipProof(tx: Transaction, proof: MembershipProof) {
  return Effect.gen(function* () {
    const expected = proof instanceof MembershipProof ? proof.expectation(membershipProofToken) : undefined
    if (!expected) {
      return yield* new InvalidTransitionError({ detail: "Course membership proof is not owner-issued" })
    }
    yield* requireCourse(tx, expected.endpoint.courseID, expected.courseVersion, true)
    yield* requireView(tx, expected.endpoint.courseID, expected.endpoint.viewID, expected.viewVersion, true)
    yield* requireRevision(
      tx,
      expected.endpoint.courseID,
      expected.endpoint.viewID,
      expected.endpoint.revisionID,
      expected.revisionVersion,
      true,
    )
    yield* requireMembershipRow(tx, expected.endpoint)
    if (expected.selection.type === "observed_working") {
      yield* requireSelection(tx, expected.endpoint.courseID, expected.selection.revisionID, expected.selection.version)
    }
    return proof
  })
}

export function requirePreferenceTargetProof(tx: Transaction, proof: PreferenceTargetProof) {
  return Effect.gen(function* () {
    const expected = proof instanceof PreferenceTargetProof ? proof.expectation(preferenceTargetProofToken) : undefined
    if (!expected) {
      return yield* new InvalidTransitionError({ detail: "Course preference target proof is not owner-issued" })
    }
    yield* preparePreferenceTargetProof(tx, expected)
    return proof
  })
}

export function prepareActiveOwnerProof(
  tx: Transaction,
  input: { readonly courseID: CourseID; readonly expectedVersion: number },
) {
  return Effect.gen(function* () {
    const course = yield* requireCourse(tx, input.courseID, input.expectedVersion, true)
    return new ActiveOwnerProof(activeOwnerProofToken, {
      courseID: course.id,
      courseTitle: course.title,
      courseVersion: course.state_version,
      timeUpdated: course.time_updated,
    })
  })
}

export function requireActiveOwnerProof(tx: Transaction, proof: ActiveOwnerProof) {
  return Effect.gen(function* () {
    const expected = proof instanceof ActiveOwnerProof ? proof.expectation(activeOwnerProofToken) : undefined
    if (!expected) {
      return yield* new InvalidTransitionError({ detail: "Course active-owner proof is not owner-issued" })
    }
    yield* requireCourse(tx, expected.courseID, expected.courseVersion, true)
    return proof
  })
}

export function prepareRevisionOwnerProof(
  tx: Transaction,
  input: { readonly courseID: CourseID; readonly viewID: ViewID; readonly revisionID: RevisionID },
) {
  return Effect.gen(function* () {
    const course = yield* requireCourse(tx, input.courseID, undefined, true)
    const view = yield* requireView(tx, input.courseID, input.viewID, undefined, true)
    const revision = yield* requireRevision(tx, input.courseID, input.viewID, input.revisionID, undefined, true)
    return new RevisionOwnerProof(revisionOwnerProofToken, {
      courseID: course.id,
      courseVersion: course.state_version,
      viewID: view.id,
      viewVersion: view.state_version,
      revisionID: revision.id,
      revisionVersion: revision.state_version,
      revisionNumber: revision.revision_number,
    })
  })
}

export function prepareSelectionTargetProof(
  tx: Transaction,
  input: { readonly courseID: CourseID; readonly revisionID: RevisionID },
) {
  return Effect.gen(function* () {
    const revision = yield* tx
      .select({ viewID: CourseViewRevisionTable.view_id })
      .from(CourseViewRevisionTable)
      .where(
        and(eq(CourseViewRevisionTable.course_id, input.courseID), eq(CourseViewRevisionTable.id, input.revisionID)),
      )
      .get()
      .pipe(Effect.orDie)
    if (!revision) return yield* new NotFoundError({ entity: "revision", id: input.revisionID })
    return yield* prepareRevisionOwnerProof(tx, {
      courseID: input.courseID,
      viewID: revision.viewID,
      revisionID: input.revisionID,
    })
  })
}

export function requireRevisionOwnerProof(tx: Transaction, proof: RevisionOwnerProof) {
  return Effect.gen(function* () {
    const expected = proof instanceof RevisionOwnerProof ? proof.expectation(revisionOwnerProofToken) : undefined
    if (!expected)
      return yield* new InvalidTransitionError({ detail: "Course Revision-owner proof is not owner-issued" })
    const current = yield* prepareRevisionOwnerProof(tx, expected)
    if (
      current.receipt.courseVersion !== expected.courseVersion ||
      current.receipt.viewVersion !== expected.viewVersion ||
      current.receipt.revisionVersion !== expected.revisionVersion ||
      current.receipt.revisionNumber !== expected.revisionNumber
    ) {
      return yield* conflict("revision", expected.revisionID)
    }
    return current
  })
}

export function inspectPreferenceTarget(tx: Transaction, courseID: CourseID) {
  return Effect.gen(function* () {
    const course = yield* tx
      .select({
        title: CourseTable.title,
        state_version: CourseTable.state_version,
        withdrawal_reason: CourseTable.withdrawal_reason,
        time_updated: CourseTable.time_updated,
      })
      .from(CourseTable)
      .where(eq(CourseTable.id, courseID))
      .get()
      .pipe(Effect.orDie)
    if (!course) {
      return {
        status: "unavailable",
        courseID,
        cause: "course_not_found",
      } satisfies PreferenceTargetStatus
    }
    if (course.withdrawal_reason) {
      return {
        status: "unavailable",
        courseID,
        cause: "course_withdrawn",
        title: course.title,
        stateVersion: course.state_version,
        timeUpdated: course.time_updated,
      } satisfies PreferenceTargetStatus
    }
    return {
      status: "available",
      courseID,
      title: course.title,
      stateVersion: course.state_version,
      timeUpdated: course.time_updated,
    } satisfies PreferenceTargetStatus
  })
}

export function inspectMembershipStatus(tx: Transaction, endpoint: MembershipEndpoint, selection: MembershipSelection) {
  return Effect.gen(function* () {
    const course = yield* tx
      .select({ withdrawal_reason: CourseTable.withdrawal_reason })
      .from(CourseTable)
      .where(eq(CourseTable.id, endpoint.courseID))
      .get()
      .pipe(Effect.orDie)
    if (!course) return { status: "stale", cause: "course_not_found" } as const
    if (course.withdrawal_reason) return { status: "stale", cause: "course_withdrawn" } as const
    const view = yield* tx
      .select({ withdrawal_reason: CourseViewTable.withdrawal_reason })
      .from(CourseViewTable)
      .where(and(eq(CourseViewTable.course_id, endpoint.courseID), eq(CourseViewTable.id, endpoint.viewID)))
      .get()
      .pipe(Effect.orDie)
    if (!view) return { status: "stale", cause: "view_not_found" } as const
    if (view.withdrawal_reason) return { status: "stale", cause: "view_withdrawn" } as const
    const revision = yield* tx
      .select({ withdrawal_reason: CourseViewRevisionStateTable.withdrawal_reason })
      .from(CourseViewRevisionTable)
      .innerJoin(CourseViewRevisionStateTable, eq(CourseViewRevisionStateTable.revision_id, CourseViewRevisionTable.id))
      .where(
        and(
          eq(CourseViewRevisionTable.course_id, endpoint.courseID),
          eq(CourseViewRevisionTable.view_id, endpoint.viewID),
          eq(CourseViewRevisionTable.id, endpoint.revisionID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!revision) return { status: "stale", cause: "revision_not_found" } as const
    if (revision.withdrawal_reason) return { status: "stale", cause: "revision_withdrawn" } as const
    const item = yield* tx
      .select({ item_id: CourseViewRevisionItemTable.item_id })
      .from(CourseViewRevisionItemTable)
      .where(
        and(
          eq(CourseViewRevisionItemTable.course_id, endpoint.courseID),
          eq(CourseViewRevisionItemTable.view_id, endpoint.viewID),
          eq(CourseViewRevisionItemTable.revision_id, endpoint.revisionID),
          eq(CourseViewRevisionItemTable.item_id, endpoint.itemID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!item) return { status: "stale", cause: "membership_missing" } as const
    if (selection.type === "explicit_exact") return { status: "eligible" } as const
    const working = yield* tx
      .select({ revision_id: CourseWorkingSelectionTable.revision_id })
      .from(CourseWorkingSelectionTable)
      .where(eq(CourseWorkingSelectionTable.course_id, endpoint.courseID))
      .get()
      .pipe(Effect.orDie)
    if (working?.revision_id !== endpoint.revisionID) {
      return { status: "stale", cause: "working_selection_mismatch" } as const
    }
    return { status: "eligible" } as const
  })
}

type CourseRow = typeof CourseTable.$inferSelect
type ViewRow = typeof CourseViewTable.$inferSelect
type SelectionRow = typeof CourseWorkingSelectionTable.$inferSelect
type RevisionRow = {
  readonly id: RevisionID
  readonly course_id: CourseID
  readonly view_id: ViewID
  readonly revision_number: number
  readonly predecessor_revision_id: RevisionID | null
  readonly authorship_basis: AuthorshipBasis
  readonly time_created: number
  readonly state_version: number
  readonly withdrawal_reason: RevisionWithdrawalReason | null
  readonly time_updated: number
}

function requireCourse(source: Queryable, courseID: CourseID, expectedVersion?: number, active = false) {
  return Effect.gen(function* () {
    const course = yield* source.select().from(CourseTable).where(eq(CourseTable.id, courseID)).get().pipe(Effect.orDie)
    if (!course) return yield* new NotFoundError({ entity: "course", id: courseID })
    if (expectedVersion !== undefined && course.state_version !== expectedVersion) {
      return yield* conflict("course", courseID)
    }
    if (active && course.withdrawal_reason) return yield* new InactiveError({ entity: "course", id: courseID })
    return course
  })
}

function requireView(source: Queryable, courseID: CourseID, viewID: ViewID, expectedVersion?: number, active = false) {
  return Effect.gen(function* () {
    const view = yield* source
      .select()
      .from(CourseViewTable)
      .where(and(eq(CourseViewTable.course_id, courseID), eq(CourseViewTable.id, viewID)))
      .get()
      .pipe(Effect.orDie)
    if (!view) return yield* new NotFoundError({ entity: "view", id: viewID })
    if (expectedVersion !== undefined && view.state_version !== expectedVersion) return yield* conflict("view", viewID)
    if (active && view.withdrawal_reason) return yield* new InactiveError({ entity: "view", id: viewID })
    return view
  })
}

function requireRevision(
  source: Queryable,
  courseID: CourseID,
  viewID: ViewID,
  revisionID: RevisionID,
  expectedVersion?: number,
  active = false,
) {
  return Effect.gen(function* () {
    const revision = yield* source
      .select({
        id: CourseViewRevisionTable.id,
        course_id: CourseViewRevisionTable.course_id,
        view_id: CourseViewRevisionTable.view_id,
        revision_number: CourseViewRevisionTable.revision_number,
        predecessor_revision_id: CourseViewRevisionTable.predecessor_revision_id,
        authorship_basis: CourseViewRevisionTable.authorship_basis,
        time_created: CourseViewRevisionTable.time_created,
        state_version: CourseViewRevisionStateTable.state_version,
        withdrawal_reason: CourseViewRevisionStateTable.withdrawal_reason,
        time_updated: CourseViewRevisionStateTable.time_updated,
      })
      .from(CourseViewRevisionTable)
      .innerJoin(CourseViewRevisionStateTable, eq(CourseViewRevisionStateTable.revision_id, CourseViewRevisionTable.id))
      .where(
        and(
          eq(CourseViewRevisionTable.course_id, courseID),
          eq(CourseViewRevisionTable.view_id, viewID),
          eq(CourseViewRevisionTable.id, revisionID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!revision) return yield* new NotFoundError({ entity: "revision", id: revisionID })
    if (expectedVersion !== undefined && revision.state_version !== expectedVersion) {
      return yield* conflict("revision", revisionID)
    }
    if (active && revision.withdrawal_reason) {
      return yield* new InactiveError({ entity: "revision", id: revisionID })
    }
    return revision
  })
}

function requireSelection(
  source: Queryable,
  courseID: CourseID,
  expectedRevisionID?: RevisionID,
  expectedVersion?: number,
) {
  return Effect.gen(function* () {
    const selection = yield* source
      .select()
      .from(CourseWorkingSelectionTable)
      .where(eq(CourseWorkingSelectionTable.course_id, courseID))
      .get()
      .pipe(Effect.orDie)
    if (!selection) return yield* new NotFoundError({ entity: "course", id: courseID })
    if (
      expectedVersion !== undefined &&
      (selection.version !== expectedVersion || (selection.revision_id ?? undefined) !== expectedRevisionID)
    ) {
      return yield* conflict("selection", courseID)
    }
    return selection
  })
}

export function prepareMembershipProof(
  tx: Transaction,
  input: { readonly endpoint: MembershipEndpoint; readonly selection: MembershipSelection },
) {
  return Effect.gen(function* () {
    if (input.selection.type === "observed_working" && input.selection.revisionID !== input.endpoint.revisionID) {
      return yield* new InvalidTransitionError({
        detail: "Observed working membership must name the endpoint Revision",
      })
    }
    const course = yield* requireCourse(tx, input.endpoint.courseID, undefined, true)
    const view = yield* requireView(tx, input.endpoint.courseID, input.endpoint.viewID, undefined, true)
    const revision = yield* requireRevision(
      tx,
      input.endpoint.courseID,
      input.endpoint.viewID,
      input.endpoint.revisionID,
      undefined,
      true,
    )
    yield* requireMembershipRow(tx, input.endpoint)
    if (input.selection.type === "observed_working") {
      yield* requireSelection(tx, input.endpoint.courseID, input.selection.revisionID, input.selection.version)
    }
    return new MembershipProof(membershipProofToken, {
      endpoint: input.endpoint,
      selection: input.selection,
      courseVersion: course.state_version,
      viewVersion: view.state_version,
      revisionVersion: revision.state_version,
    })
  })
}

export function readRevisionPresentationLocator(
  tx: Transaction,
  input: { readonly courseID: CourseID; readonly revisionID: RevisionID },
) {
  return Effect.gen(function* () {
    const revision = yield* tx
      .select({ viewID: CourseViewRevisionTable.view_id })
      .from(CourseViewRevisionTable)
      .where(
        and(eq(CourseViewRevisionTable.course_id, input.courseID), eq(CourseViewRevisionTable.id, input.revisionID)),
      )
      .get()
      .pipe(Effect.orDie)
    if (!revision) return yield* new NotFoundError({ entity: "revision", id: input.revisionID })
    return yield* presentationLocator(tx, {
      courseID: input.courseID,
      viewID: revision.viewID,
      revisionID: input.revisionID,
    })
  })
}

export function readMembershipPresentationLocator(tx: Transaction, endpoint: MembershipEndpoint) {
  return presentationLocator(tx, endpoint)
}

export function preparePreferenceTargetProof(tx: Transaction, expected: PreferenceTargetExpectation) {
  return Effect.gen(function* () {
    const course = yield* requireCourse(tx, expected.courseID, expected.courseVersion, true)
    const selection = yield* requireSelection(
      tx,
      expected.courseID,
      expected.selectionRevisionID ?? undefined,
      expected.selectionVersion,
    )
    if (expected.selectionRevisionID === null) {
      if (expected.viewID !== null || expected.viewVersion !== null || expected.revisionVersion !== null) {
        return yield* new InvalidTransitionError({
          detail: "A Course preference target without a working Revision cannot name View or Revision state",
        })
      }
      return new PreferenceTargetProof(preferenceTargetProofToken, {
        courseID: course.id,
        courseTitle: course.title,
        courseVersion: course.state_version,
        selectionRevisionID: null,
        selectionVersion: selection.version,
        viewID: null,
        viewName: null,
        viewVersion: null,
        revisionVersion: null,
      })
    }
    if (expected.viewID === null || expected.viewVersion === null || expected.revisionVersion === null) {
      return yield* new InvalidTransitionError({
        detail: "A Course preference target with a working Revision must name its exact View and state versions",
      })
    }
    const view = yield* requireView(tx, expected.courseID, expected.viewID, expected.viewVersion, true)
    const revision = yield* requireRevision(
      tx,
      expected.courseID,
      expected.viewID,
      expected.selectionRevisionID,
      expected.revisionVersion,
      true,
    )
    return new PreferenceTargetProof(preferenceTargetProofToken, {
      courseID: course.id,
      courseTitle: course.title,
      courseVersion: course.state_version,
      selectionRevisionID: selection.revision_id,
      selectionVersion: selection.version,
      viewID: view.id,
      viewName: view.name,
      viewVersion: view.state_version,
      revisionVersion: revision.state_version,
    })
  })
}

export function prepareCurrentPreferenceTargetProof(tx: Transaction, courseID: CourseID) {
  return Effect.gen(function* () {
    const course = yield* requireCourse(tx, courseID, undefined, true)
    const selection = yield* requireSelection(tx, courseID)
    if (!selection.revision_id) {
      return new PreferenceTargetProof(preferenceTargetProofToken, {
        courseID: course.id,
        courseTitle: course.title,
        courseVersion: course.state_version,
        selectionRevisionID: null,
        selectionVersion: selection.version,
        viewID: null,
        viewName: null,
        viewVersion: null,
        revisionVersion: null,
      })
    }
    const revision = yield* tx
      .select({ viewID: CourseViewRevisionTable.view_id })
      .from(CourseViewRevisionTable)
      .where(
        and(eq(CourseViewRevisionTable.course_id, courseID), eq(CourseViewRevisionTable.id, selection.revision_id)),
      )
      .get()
      .pipe(Effect.orDie)
    if (!revision) return yield* new NotFoundError({ entity: "revision", id: selection.revision_id })
    const view = yield* requireView(tx, courseID, revision.viewID, undefined, true)
    const state = yield* requireRevision(tx, courseID, revision.viewID, selection.revision_id, undefined, true)
    return new PreferenceTargetProof(preferenceTargetProofToken, {
      courseID: course.id,
      courseTitle: course.title,
      courseVersion: course.state_version,
      selectionRevisionID: selection.revision_id,
      selectionVersion: selection.version,
      viewID: view.id,
      viewName: view.name,
      viewVersion: view.state_version,
      revisionVersion: state.state_version,
    })
  })
}

function requireMembershipRow(source: Queryable, endpoint: MembershipEndpoint) {
  return Effect.gen(function* () {
    const item = yield* source
      .select({ item_id: CourseViewRevisionItemTable.item_id })
      .from(CourseViewRevisionItemTable)
      .where(
        and(
          eq(CourseViewRevisionItemTable.course_id, endpoint.courseID),
          eq(CourseViewRevisionItemTable.view_id, endpoint.viewID),
          eq(CourseViewRevisionItemTable.revision_id, endpoint.revisionID),
          eq(CourseViewRevisionItemTable.item_id, endpoint.itemID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!item) return yield* new NotFoundError({ entity: "item", id: endpoint.itemID })
    return item
  })
}

function requireEligibleTarget(
  source: Queryable,
  courseID: CourseID,
  revisionID: RevisionID,
  expectedViewVersion: number,
  expectedRevisionVersion: number,
) {
  return Effect.gen(function* () {
    const identity = yield* source
      .select({ viewID: CourseViewRevisionTable.view_id })
      .from(CourseViewRevisionTable)
      .where(and(eq(CourseViewRevisionTable.course_id, courseID), eq(CourseViewRevisionTable.id, revisionID)))
      .get()
      .pipe(Effect.orDie)
    if (!identity) return yield* new NotFoundError({ entity: "revision", id: revisionID })
    yield* requireView(source, courseID, identity.viewID, expectedViewVersion, true)
    return yield* requireRevision(source, courseID, identity.viewID, revisionID, expectedRevisionVersion, true)
  })
}

function requireReadableRevision(
  source: Queryable,
  courseID: CourseID,
  viewID: ViewID,
  revisionID: RevisionID,
  includeWithdrawn: boolean,
) {
  return Effect.gen(function* () {
    const course = yield* requireCourse(source, courseID)
    const view = yield* requireView(source, courseID, viewID)
    const revision = yield* requireRevision(source, courseID, viewID, revisionID)
    if (!includeWithdrawn && (course.withdrawal_reason || view.withdrawal_reason || revision.withdrawal_reason)) {
      return yield* new InactiveError({
        entity: course.withdrawal_reason ? "course" : view.withdrawal_reason ? "view" : "revision",
        id: course.withdrawal_reason ? courseID : view.withdrawal_reason ? viewID : revisionID,
      })
    }
    return revision
  })
}

export function resolveSelectionAcceptance(
  tx: Transaction,
  input: { readonly occurrenceID: OccurrenceID; readonly courseID: CourseID; readonly revisionID: RevisionID },
): Effect.Effect<SelectionAcceptanceResolution, Error> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(CourseSelectionAcceptanceEffectTable)
      .innerJoin(
        CourseSelectionAcceptanceCommitSealTable,
        eq(CourseSelectionAcceptanceCommitSealTable.effect_id, CourseSelectionAcceptanceEffectTable.id),
      )
      .where(
        and(
          eq(CourseSelectionAcceptanceEffectTable.occurrence_id, input.occurrenceID),
          eq(CourseSelectionAcceptanceEffectTable.course_id, input.courseID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!row) return { type: "new" as const }
    const effect = selectionAcceptanceEffect(row.course_selection_acceptance_effect)
    if (row.course_selection_acceptance_effect.accepted_revision_id !== input.revisionID) {
      return { type: "semantic_conflict" as const, effect }
    }
    const current = yield* requireSelection(tx, input.courseID)
    const currentSelection = selection(current)
    return {
      type: "already_applied" as const,
      effect,
      currentSelection,
      currentSelectionTime: current.time_updated,
      relation:
        current.revision_id === row.course_selection_acceptance_effect.accepted_revision_id &&
        current.version === row.course_selection_acceptance_effect.committed_selection_version
          ? ("active" as const)
          : ("superseded" as const),
    }
  })
}

export function readSelectionAcceptancePresentation(
  tx: Transaction,
  effectID: SelectionAcceptanceEffectID,
): Effect.Effect<SelectionAcceptancePresentation, Error> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ effect: CourseSelectionAcceptanceEffectTable })
      .from(CourseSelectionAcceptanceEffectTable)
      .innerJoin(
        CourseSelectionAcceptanceCommitSealTable,
        eq(CourseSelectionAcceptanceCommitSealTable.effect_id, CourseSelectionAcceptanceEffectTable.id),
      )
      .where(eq(CourseSelectionAcceptanceEffectTable.id, effectID))
      .get()
      .pipe(Effect.orDie)
    if (!row) {
      return yield* Effect.die(`Committed Course selection effect ${effectID} is unavailable`)
    }
    const effect = selectionAcceptanceEffect(row.effect)
    const current = yield* requireSelection(tx, effect.courseID)
    return {
      effect,
      currentSelection: selection(current),
      relation:
        current.revision_id === effect.revisionID && current.version === effect.committedSelection.version
          ? "active"
          : "superseded",
      locator: yield* readRevisionPresentationLocator(tx, {
        courseID: effect.courseID,
        revisionID: effect.revisionID,
      }),
    }
  })
}

export function applySelectionAcceptance(
  tx: Transaction,
  input: {
    readonly occurrenceID: OccurrenceID
    readonly command: SelectionAcceptanceInput
    readonly trustedTime: number
  },
): Effect.Effect<SelectionAcceptanceEffect, Error> {
  return Effect.gen(function* () {
    const resolution = yield* resolveSelectionAcceptance(tx, {
      occurrenceID: input.occurrenceID,
      courseID: input.command.courseID,
      revisionID: input.command.revisionID,
    })
    if (resolution.type !== "new") {
      return yield* new AcceptanceEffectExistsError({ effectID: resolution.effect.id })
    }

    const course = yield* requireCourse(tx, input.command.courseID, input.command.expectedCourseVersion, true)
    const previous = yield* requireSelection(
      tx,
      input.command.courseID,
      input.command.expectedSelectionRevisionID,
      input.command.expectedSelectionVersion,
    )
    if (previous.revision_id === input.command.revisionID) {
      return yield* new InvalidTransitionError({ detail: "The target Revision is already the working selection" })
    }
    const revision = yield* requireEligibleTarget(
      tx,
      input.command.courseID,
      input.command.revisionID,
      input.command.expectedViewVersion,
      input.command.expectedRevisionVersion,
    )
    const view = yield* requireView(tx, input.command.courseID, revision.view_id)
    if (
      input.trustedTime < 0 ||
      input.trustedTime < course.time_updated ||
      input.trustedTime < previous.time_updated ||
      input.trustedTime < view.time_updated ||
      input.trustedTime < revision.time_updated
    ) {
      return yield* new InvalidTransitionError({ detail: "Trusted settlement time precedes consumed Course state" })
    }

    const committed = yield* updateSelection(
      tx,
      input.command.courseID,
      previous.revision_id ?? undefined,
      previous.version,
      revision.id,
      input.trustedTime,
    )
    const effectID = createSelectionAcceptanceEffectID()
    yield* tx
      .insert(CourseSelectionAcceptanceEffectTable)
      .values({
        id: effectID,
        occurrence_id: input.occurrenceID,
        course_id: input.command.courseID,
        accepted_revision_id: revision.id,
        previous_revision_id: previous.revision_id,
        previous_selection_version: previous.version,
        committed_selection_version: committed.version,
        time_committed: input.trustedTime,
      })
      .run()
      .pipe(Effect.orDie)
    yield* LearningFrontier.advance(tx, { time: input.trustedTime })
    return {
      id: effectID,
      occurrenceID: input.occurrenceID,
      courseID: input.command.courseID,
      revisionID: revision.id,
      previousSelection: selection(previous),
      committedSelection: committed,
      timeCommitted: input.trustedTime,
    }
  })
}

function updateSelection(
  tx: Transaction,
  courseID: CourseID,
  expectedRevisionID: RevisionID | undefined,
  expectedVersion: number,
  revisionID: RevisionID | undefined,
  time: number,
) {
  return Effect.gen(function* () {
    const updated = yield* tx
      .update(CourseWorkingSelectionTable)
      .set({
        revision_id: revisionID ?? null,
        version: sql`${CourseWorkingSelectionTable.version} + 1`,
        time_updated: time,
      })
      .where(
        and(
          eq(CourseWorkingSelectionTable.course_id, courseID),
          eq(CourseWorkingSelectionTable.version, expectedVersion),
          expectedRevisionID
            ? eq(CourseWorkingSelectionTable.revision_id, expectedRevisionID)
            : isNull(CourseWorkingSelectionTable.revision_id),
        ),
      )
      .returning({ revisionID: CourseWorkingSelectionTable.revision_id, version: CourseWorkingSelectionTable.version })
      .get()
      .pipe(Effect.orDie)
    if (!updated) return yield* conflict("selection", courseID)
    return { revisionID: updated.revisionID ?? undefined, version: updated.version }
  })
}

function selection(row: SelectionRow): Selection {
  return { revisionID: row.revision_id ?? undefined, version: row.version }
}

function selectionAcceptanceEffect(
  row: typeof CourseSelectionAcceptanceEffectTable.$inferSelect,
): SelectionAcceptanceEffect {
  return {
    id: row.id,
    occurrenceID: row.occurrence_id,
    courseID: row.course_id,
    revisionID: row.accepted_revision_id,
    previousSelection: { revisionID: row.previous_revision_id ?? undefined, version: row.previous_selection_version },
    committedSelection: { revisionID: row.accepted_revision_id, version: row.committed_selection_version },
    timeCommitted: row.time_committed,
  }
}

function presentationLocator(
  tx: Transaction,
  input: {
    readonly courseID: CourseID
    readonly viewID: ViewID
    readonly revisionID: RevisionID
    readonly itemID?: ItemID
  },
) {
  return Effect.gen(function* () {
    const course = yield* requireCourse(tx, input.courseID)
    const view = yield* requireView(tx, input.courseID, input.viewID)
    const revision = yield* requireRevision(tx, input.courseID, input.viewID, input.revisionID)
    const [sameTitleCourses, sameNameViews] = yield* Effect.all([
      tx
        .select({ id: CourseTable.id })
        .from(CourseTable)
        .where(eq(CourseTable.title, course.title))
        .limit(2)
        .all()
        .pipe(Effect.orDie),
      tx
        .select({ id: CourseViewTable.id })
        .from(CourseViewTable)
        .where(and(eq(CourseViewTable.course_id, course.id), eq(CourseViewTable.name, view.name)))
        .limit(2)
        .all()
        .pipe(Effect.orDie),
    ])
    const item = input.itemID
      ? yield* tx
          .select({
            id: CourseViewRevisionItemTable.item_id,
            title: CourseViewRevisionItemTable.title,
            position: CourseViewRevisionItemTable.preorder_position,
          })
          .from(CourseViewRevisionItemTable)
          .where(
            and(
              eq(CourseViewRevisionItemTable.course_id, input.courseID),
              eq(CourseViewRevisionItemTable.view_id, input.viewID),
              eq(CourseViewRevisionItemTable.revision_id, input.revisionID),
              eq(CourseViewRevisionItemTable.item_id, input.itemID),
            ),
          )
          .get()
          .pipe(Effect.orDie)
      : undefined
    if (input.itemID && !item) return yield* new NotFoundError({ entity: "item", id: input.itemID })
    return {
      course: { id: course.id, title: course.title, showID: sameTitleCourses.length > 1 },
      view: { id: view.id, name: view.name, showID: sameNameViews.length > 1 },
      revision: { id: revision.id, number: revision.revision_number, showID: false },
      ...(item
        ? {
            item: {
              id: item.id,
              title: item.title,
              position: item.position,
              showID: false,
            },
          }
        : {}),
    } satisfies PresentationLocator
  })
}

function assertSelectionUnchanged(tx: Transaction, selection: SelectionRow) {
  return Effect.gen(function* () {
    const updated = yield* tx
      .update(CourseWorkingSelectionTable)
      .set({ version: sql`${CourseWorkingSelectionTable.version}` })
      .where(
        and(
          eq(CourseWorkingSelectionTable.course_id, selection.course_id),
          eq(CourseWorkingSelectionTable.version, selection.version),
          selection.revision_id
            ? eq(CourseWorkingSelectionTable.revision_id, selection.revision_id)
            : isNull(CourseWorkingSelectionTable.revision_id),
        ),
      )
      .returning({ courseID: CourseWorkingSelectionTable.course_id })
      .get()
      .pipe(Effect.orDie)
    if (!updated) return yield* conflict("selection", selection.course_id)
  })
}

function applyWithdrawalSelection(
  tx: Transaction,
  input: {
    readonly courseID: CourseID
    readonly selection: SelectionRow
    readonly effect: WithdrawalSelection
    readonly affected: boolean
    readonly forbiddenViewID?: ViewID
    readonly forbiddenRevisionID?: RevisionID
    readonly time: number
  },
) {
  return Effect.gen(function* () {
    if (!input.affected) {
      if (input.effect.type !== "unchanged") {
        return yield* new InvalidTransitionError({
          detail: "An unrelated withdrawal cannot change the working selection",
        })
      }
      return yield* assertSelectionUnchanged(tx, input.selection)
    }
    if (input.effect.type === "unchanged") {
      return yield* new InvalidTransitionError({
        detail: "Withdrawing the selected target requires an explicit clear or legal replacement",
      })
    }
    if (input.effect.type === "clear") {
      return yield* updateSelection(
        tx,
        input.courseID,
        input.selection.revision_id ?? undefined,
        input.selection.version,
        undefined,
        input.time,
      )
    }

    const replacement = yield* requireEligibleTarget(
      tx,
      input.courseID,
      input.effect.revisionID,
      input.effect.expectedViewVersion,
      input.effect.expectedRevisionVersion,
    )
    if (replacement.id === input.forbiddenRevisionID || replacement.view_id === input.forbiddenViewID) {
      return yield* new InvalidTransitionError({ detail: "Replacement would be made ineligible by this withdrawal" })
    }
    return yield* updateSelection(
      tx,
      input.courseID,
      input.selection.revision_id ?? undefined,
      input.selection.version,
      replacement.id,
      input.time,
    )
  })
}

/**
 * Gate 18 owner projection. The caller owns the surrounding transaction; this
 * function neither advances the shared frontier nor creates an observation.
 */
export function projectLearningContext(
  tx: Transaction,
  input: { readonly limit: number; readonly includeCourseIDs?: readonly CourseID[] },
): Effect.Effect<LearningContextCourseProjection, Error> {
  return Effect.gen(function* () {
    const count = yield* tx
      .select({ value: sql<number>`count(*)` })
      .from(CourseTable)
      .where(isNull(CourseTable.withdrawal_reason))
      .get()
      .pipe(Effect.orDie)
    const candidates = yield* tx
      .select()
      .from(CourseTable)
      .where(isNull(CourseTable.withdrawal_reason))
      .orderBy(asc(CourseTable.time_created), asc(CourseTable.id))
      .limit(input.limit)
      .all()
      .pipe(Effect.orDie)
    const forced = [...new Set(input.includeCourseIDs ?? [])].filter(
      (courseID) => !candidates.some((course) => course.id === courseID),
    )
    const forcedRows =
      forced.length === 0
        ? []
        : yield* tx.select().from(CourseTable).where(inArray(CourseTable.id, forced)).all().pipe(Effect.orDie)
    const rows = [
      ...candidates,
      ...forcedRows.toSorted((left, right) =>
        left.time_created === right.time_created
          ? left.id.localeCompare(right.id)
          : left.time_created - right.time_created,
      ),
    ]
    const entries = yield* Effect.forEach(rows, (course) =>
      Effect.gen(function* () {
        const selection = yield* requireSelection(tx, course.id)
        if (!selection.revision_id) {
          return { status: "available" as const, course: courseInfo(course, selection) }
        }
        const revision = yield* tx
          .select({ revision: CourseViewRevisionTable, state: CourseViewRevisionStateTable })
          .from(CourseViewRevisionTable)
          .innerJoin(
            CourseViewRevisionStateTable,
            eq(CourseViewRevisionStateTable.revision_id, CourseViewRevisionTable.id),
          )
          .where(
            and(
              eq(CourseViewRevisionTable.course_id, course.id),
              eq(CourseViewRevisionTable.id, selection.revision_id),
            ),
          )
          .get()
          .pipe(Effect.orDie)
        if (!revision) return yield* new NotFoundError({ entity: "revision", id: selection.revision_id })
        const view = yield* requireView(tx, course.id, revision.revision.view_id)
        const itemCount = yield* tx
          .select({ value: sql<number>`count(*)` })
          .from(CourseViewRevisionItemTable)
          .where(eq(CourseViewRevisionItemTable.revision_id, revision.revision.id))
          .get()
          .pipe(Effect.orDie)
        const items = yield* tx
          .select()
          .from(CourseViewRevisionItemTable)
          .where(eq(CourseViewRevisionItemTable.revision_id, revision.revision.id))
          .orderBy(asc(CourseViewRevisionItemTable.preorder_position), asc(CourseViewRevisionItemTable.item_id))
          .limit(input.limit)
          .all()
          .pipe(Effect.orDie)
        return {
          status: "available" as const,
          course: courseInfo(course, selection),
          working: {
            view: viewInfo(course, view),
            revision: revisionSummary(
              course,
              view,
              { ...revision.revision, ...revision.state },
              selection,
              yield* latestEligibleRevisionNumber(tx, course, view),
            ),
            itemCountAtCut: itemCount?.value ?? 0,
            items: items.map((item) => ({
              itemID: item.item_id,
              parentItemID: item.parent_item_id ?? undefined,
              title: item.title,
              preorderPosition: item.preorder_position,
              depth: item.depth,
            })),
          },
        } satisfies LearningContextCourse
      }),
    )
    const found = new Set(rows.map((row) => row.id))
    const forcedUnavailable = forced.filter((courseID) => !found.has(courseID))
    return {
      countAtCut:
        (count?.value ?? 0) +
        forcedRows.filter((course) => course.withdrawal_reason !== null).length +
        forcedUnavailable.length,
      entries: [
        ...entries,
        ...forcedUnavailable.map((courseID) => ({
          status: "unavailable" as const,
          courseID,
          cause: "course_not_found" as const,
        })),
      ],
    }
  })
}

function decodeLearningContextLocator(value: unknown): Effect.Effect<LearningContextLocator, InvalidTransitionError> {
  if (!isLearningContextLocator(value)) {
    return Effect.fail(
      new InvalidTransitionError({ detail: "Pinned Course locator is malformed or relationally inconsistent" }),
    )
  }
  return Effect.succeed(value)
}

function isLearningContextLocator(value: unknown): value is LearningContextLocator {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  if (
    !isDeepStrictEqual(
      Object.keys(input).toSorted(),
      [
        "courseID",
        "itemCountAtCut",
        "itemIDs",
        "lazyReadAvailable",
        "predecessorRevisionID",
        "selectionRevisionID",
        "selectionVersion",
        "stateVersion",
        "workingRevisionID",
        "workingRevisionNumber",
        "workingRevisionVersion",
        "workingViewID",
        "workingViewVersion",
      ].toSorted(),
    ) ||
    !Schema.is(CourseID)(input.courseID) ||
    !nonnegative(input.stateVersion) ||
    !nullable(input.selectionRevisionID, RevisionID) ||
    !nonnegative(input.selectionVersion) ||
    !nullable(input.workingViewID, ViewID) ||
    !nullableInteger(input.workingViewVersion) ||
    !nullable(input.workingRevisionID, RevisionID) ||
    !nullableInteger(input.workingRevisionNumber) ||
    !nullableInteger(input.workingRevisionVersion) ||
    !nullable(input.predecessorRevisionID, RevisionID) ||
    !Array.isArray(input.itemIDs) ||
    !input.itemIDs.every(Schema.is(ItemID)) ||
    new Set(input.itemIDs).size !== input.itemIDs.length ||
    !nonnegative(input.itemCountAtCut) ||
    input.itemCountAtCut < input.itemIDs.length ||
    typeof input.lazyReadAvailable !== "boolean"
  ) {
    return false
  }
  const withoutWorking = input.selectionRevisionID === null
  return withoutWorking
    ? input.workingViewID === null &&
        input.workingViewVersion === null &&
        input.workingRevisionID === null &&
        input.workingRevisionNumber === null &&
        input.workingRevisionVersion === null &&
        input.predecessorRevisionID === null &&
        input.itemIDs.length === 0 &&
        input.itemCountAtCut === 0
    : input.workingRevisionID === input.selectionRevisionID &&
        input.workingViewID !== null &&
        input.workingViewVersion !== null &&
        input.workingRevisionNumber !== null &&
        input.workingRevisionNumber >= 1 &&
        input.workingRevisionVersion !== null &&
        ((input.workingRevisionNumber === 1 && input.predecessorRevisionID === null) ||
          (input.workingRevisionNumber > 1 && input.predecessorRevisionID !== null))
}

function inspectLearningContextLocator(
  tx: Transaction,
  locator: LearningContextLocator,
  start: number,
  limit: number,
): Effect.Effect<LearningContextLocatorRead, Error> {
  return Effect.gen(function* () {
    const course = yield* tx
      .select()
      .from(CourseTable)
      .where(eq(CourseTable.id, locator.courseID))
      .get()
      .pipe(Effect.orDie)
    if (!course) return { type: "unavailable", cause: "course_not_found" } as const
    if (course.state_version !== locator.stateVersion) return { type: "superseded", cause: "course_changed" } as const
    const selection = yield* requireSelection(tx, locator.courseID)
    const selectionAtCut: SelectionRow = {
      ...selection,
      revision_id: locator.selectionRevisionID,
      version: locator.selectionVersion,
    }
    const relation =
      selection.revision_id === locator.selectionRevisionID && selection.version === locator.selectionVersion
        ? ("exact" as const)
        : ("superseded" as const)
    if (locator.workingRevisionID === null) {
      return {
        type: "available",
        relation,
        selectionAtCut: { revisionID: undefined, version: locator.selectionVersion },
        currentSelection: { revisionID: selection.revision_id ?? undefined, version: selection.version },
        course: courseInfo(course, selectionAtCut),
      }
    }
    const view = yield* tx
      .select()
      .from(CourseViewTable)
      .where(and(eq(CourseViewTable.course_id, locator.courseID), eq(CourseViewTable.id, locator.workingViewID!)))
      .get()
      .pipe(Effect.orDie)
    if (!view) return { type: "unavailable", cause: "view_not_found" } as const
    if (view.state_version !== locator.workingViewVersion) return { type: "superseded", cause: "view_changed" } as const
    const revision = yield* tx
      .select({ revision: CourseViewRevisionTable, state: CourseViewRevisionStateTable })
      .from(CourseViewRevisionTable)
      .innerJoin(CourseViewRevisionStateTable, eq(CourseViewRevisionStateTable.revision_id, CourseViewRevisionTable.id))
      .where(
        and(
          eq(CourseViewRevisionTable.course_id, locator.courseID),
          eq(CourseViewRevisionTable.view_id, locator.workingViewID!),
          eq(CourseViewRevisionTable.id, locator.workingRevisionID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!revision) return { type: "unavailable", cause: "revision_not_found" } as const
    if (
      revision.state.state_version !== locator.workingRevisionVersion ||
      revision.revision.revision_number !== locator.workingRevisionNumber ||
      revision.revision.predecessor_revision_id !== locator.predecessorRevisionID
    ) {
      return { type: "superseded", cause: "revision_changed" } as const
    }
    const itemCount =
      (yield* tx
        .select({ value: sql<number>`count(*)` })
        .from(CourseViewRevisionItemTable)
        .where(eq(CourseViewRevisionItemTable.revision_id, locator.workingRevisionID))
        .get()
        .pipe(Effect.orDie))?.value ?? 0
    const prefix = yield* tx
      .select({ itemID: CourseViewRevisionItemTable.item_id })
      .from(CourseViewRevisionItemTable)
      .where(eq(CourseViewRevisionItemTable.revision_id, locator.workingRevisionID))
      .orderBy(asc(CourseViewRevisionItemTable.preorder_position), asc(CourseViewRevisionItemTable.item_id))
      .limit(locator.itemIDs.length)
      .all()
      .pipe(Effect.orDie)
    if (
      itemCount !== locator.itemCountAtCut ||
      !isDeepStrictEqual(
        prefix.map((item) => item.itemID),
        locator.itemIDs,
      )
    ) {
      return { type: "superseded", cause: "revision_contents_changed" } as const
    }
    const items = yield* tx
      .select()
      .from(CourseViewRevisionItemTable)
      .where(eq(CourseViewRevisionItemTable.revision_id, locator.workingRevisionID))
      .orderBy(asc(CourseViewRevisionItemTable.preorder_position), asc(CourseViewRevisionItemTable.item_id))
      .limit(limit)
      .offset(start)
      .all()
      .pipe(Effect.orDie)
    return {
      type: "available",
      relation,
      selectionAtCut: { revisionID: locator.selectionRevisionID ?? undefined, version: locator.selectionVersion },
      currentSelection: { revisionID: selection.revision_id ?? undefined, version: selection.version },
      course: courseInfo(course, selectionAtCut),
      working: {
        view: viewInfo(course, view),
        revision: revisionSummary(
          course,
          view,
          { ...revision.revision, ...revision.state },
          selectionAtCut,
          yield* latestEligibleRevisionNumber(tx, course, view),
        ),
        range: {
          start,
          returnedCount: items.length,
          itemCountAtCut: locator.itemCountAtCut,
          remaining: Math.max(0, locator.itemCountAtCut - start - items.length),
          items: items.map((item) => ({
            itemID: item.item_id,
            parentItemID: item.parent_item_id ?? undefined,
            title: item.title,
            preorderPosition: item.preorder_position,
            depth: item.depth,
          })),
        },
      },
    }
  })
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function nullableInteger(value: unknown): value is number | null {
  return value === null || nonnegative(value)
}

function nullable<A>(value: unknown, schema: Schema.Schema<A>): value is A | null {
  return value === null || Schema.is(schema)(value)
}

function courseInfo(course: CourseRow, selection: SelectionRow): CourseInfo {
  return {
    id: course.id,
    title: course.title,
    stateVersion: course.state_version,
    withdrawalReason: course.withdrawal_reason ?? undefined,
    timeCreated: course.time_created,
    timeUpdated: course.time_updated,
    selection: { revisionID: selection.revision_id ?? undefined, version: selection.version },
  }
}

function viewInfo(course: CourseRow, view: ViewRow): ViewInfo {
  return {
    id: view.id,
    courseID: view.course_id,
    name: view.name,
    stateVersion: view.state_version,
    withdrawalReason: view.withdrawal_reason ?? undefined,
    effectiveWithdrawal: course.withdrawal_reason ? "course" : view.withdrawal_reason ? "view" : undefined,
    timeCreated: view.time_created,
    timeUpdated: view.time_updated,
  }
}

function revisionSummary(
  course: CourseRow,
  view: ViewRow,
  revision: RevisionRow,
  selection: SelectionRow,
  latestEligible: number | undefined,
): RevisionSummary {
  const effectiveWithdrawal = course.withdrawal_reason
    ? "course"
    : view.withdrawal_reason
      ? "view"
      : revision.withdrawal_reason
        ? "revision"
        : undefined
  const disposition = effectiveWithdrawal
    ? "withdrawn"
    : selection.revision_id === revision.id
      ? "working"
      : latestEligible !== undefined && latestEligible > revision.revision_number
        ? "historical"
        : "candidate"
  return {
    id: revision.id,
    courseID: revision.course_id,
    viewID: revision.view_id,
    revisionNumber: revision.revision_number,
    predecessorRevisionID: revision.predecessor_revision_id ?? undefined,
    authorshipBasis: revision.authorship_basis,
    stateVersion: revision.state_version,
    withdrawalReason: revision.withdrawal_reason ?? undefined,
    effectiveWithdrawal,
    disposition,
    timeCreated: revision.time_created,
  }
}

function latestEligibleRevisionNumber(source: Queryable, course: CourseRow, view: ViewRow) {
  if (course.withdrawal_reason || view.withdrawal_reason) return Effect.succeed(undefined)
  return source
    .select({ value: sql<number | null>`max(${CourseViewRevisionTable.revision_number})` })
    .from(CourseViewRevisionTable)
    .innerJoin(CourseViewRevisionStateTable, eq(CourseViewRevisionStateTable.revision_id, CourseViewRevisionTable.id))
    .where(
      and(
        eq(CourseViewRevisionTable.course_id, course.id),
        eq(CourseViewRevisionTable.view_id, view.id),
        isNull(CourseViewRevisionStateTable.withdrawal_reason),
      ),
    )
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => row?.value ?? undefined),
    )
}

function titleValue(value: string, entity: "Course" | "View") {
  const title = value.trim()
  const length = Array.from(title).length
  if (length >= 1 && length <= 200) return Effect.succeed(title)
  return Effect.fail(
    new InvalidTransitionError({ detail: `${entity} title must contain 1 to 200 Unicode code points` }),
  )
}

function requireAuthorship(authorship: Authorship) {
  if (authorship instanceof Authorship) return Effect.void
  return Effect.fail(
    new InvalidTransitionError({ detail: "Authorship must be bound by a trusted application capability" }),
  )
}

function conflict(entity: "course" | "view" | "revision" | "selection", id: string) {
  return Effect.fail(new ConflictError({ entity, id }))
}

function pageResult<T>(
  items: T[],
  hasMore: boolean,
  scope: CourseCursor.Scope,
  key: (item: T) => readonly (string | number)[],
): Page<T> {
  const last = items.at(-1)
  return { items, cursor: hasMore && last ? CourseCursor.next(scope, key(last)) : undefined }
}

function twoPartKey(input: readonly (string | number)[] | undefined, _first: "number", _second: "string") {
  if (!input) return Effect.succeed(undefined)
  if (input.length === 2 && typeof input[0] === "number" && typeof input[1] === "string") {
    return Effect.succeed([input[0], input[1]] as const)
  }
  return Effect.fail(new InvalidCursorError({ detail: "Cursor key does not match this endpoint" }))
}

function threePartKey(input: readonly (string | number)[] | undefined) {
  if (!input) return Effect.succeed(undefined)
  if (
    input.length === 3 &&
    typeof input[0] === "string" &&
    typeof input[1] === "string" &&
    typeof input[2] === "string"
  ) {
    return Effect.succeed([input[0], input[1], input[2]] as const)
  }
  return Effect.fail(new InvalidCursorError({ detail: "Cursor key does not match this endpoint" }))
}

function onePartKey(input: readonly (string | number)[] | undefined) {
  if (!input) return Effect.succeed(undefined)
  if (input.length === 1 && typeof input[0] === "string") return Effect.succeed(input[0])
  return Effect.fail(new InvalidCursorError({ detail: "Cursor key does not match this endpoint" }))
}

function listMappingMembers(
  source: Queryable,
  table: typeof CourseViewRevisionMappingSourceTable | typeof CourseViewRevisionMappingTargetTable,
  endpoint: "mapping_sources" | "mapping_targets",
  courseID: CourseID,
  viewID: ViewID,
  revisionID: RevisionID,
  groupID: MappingGroupID,
  input?: PageOptions,
) {
  return Effect.gen(function* () {
    const includeWithdrawn = input?.includeWithdrawn ?? false
    const scope = {
      endpoint,
      parent: `${courseID}/${viewID}/${revisionID}/${groupID}`,
      includeWithdrawn,
    }
    const page = yield* CourseCursor.options(input, scope)
    const after = yield* onePartKey(page.key)
    yield* requireReadableRevision(source, courseID, viewID, revisionID, includeWithdrawn)
    const group = yield* source
      .select({ id: CourseViewRevisionMappingGroupTable.id })
      .from(CourseViewRevisionMappingGroupTable)
      .where(
        and(
          eq(CourseViewRevisionMappingGroupTable.course_id, courseID),
          eq(CourseViewRevisionMappingGroupTable.view_id, viewID),
          eq(CourseViewRevisionMappingGroupTable.target_revision_id, revisionID),
          eq(CourseViewRevisionMappingGroupTable.id, groupID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!group) return yield* new NotFoundError({ entity: "mapping_group", id: groupID })

    const rows = after
      ? yield* source
          .all<{
            item_id: ItemID
          }>(
            sql`SELECT item_id FROM ${table} WHERE group_id = ${groupID} AND item_id > ${after} ORDER BY item_id LIMIT ${page.limit + 1}`,
          )
          .pipe(Effect.orDie)
      : yield* source
          .all<{
            item_id: ItemID
          }>(sql`SELECT item_id FROM ${table} WHERE group_id = ${groupID} ORDER BY item_id LIMIT ${page.limit + 1}`)
          .pipe(Effect.orDie)
    const items = rows.slice(0, page.limit).map((row) => ({ itemID: row.item_id }))
    return pageResult(items, rows.length > page.limit, scope, (item) => [item.itemID])
  })
}
