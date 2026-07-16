export * as Course from "./course"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { CourseCursor } from "./course/cursor"
import { CourseRevision } from "./course/revision"
import {
  Authorship,
  AcceptanceEffectExistsError,
  ConflictError,
  InactiveError,
  InvalidCursorError,
  InvalidTransitionError,
  NotFoundError,
  createSelectionAcceptanceEffectID,
  createCourseID,
  createRevisionID,
  createViewID,
  type AuthorshipBasis,
  type CitationID,
  type CourseID,
  type Error,
  type ItemID,
  type MappingGroupID,
  type MappingKind,
  type Page,
  type PageOptions,
  type RevisionDisposition,
  type RevisionID,
  type RevisionProposal,
  type RevisionWithdrawalReason,
  type SelectionAcceptanceEffectID,
  type ViewID,
  type WithdrawalSelection,
} from "./course/schema"
import {
  CourseItemTable,
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

export interface Interface {
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

    const createCourse: Interface["createCourse"] = Effect.fn("Course.createCourse")(function* (input) {
      const title = yield* titleValue(input.title, "Course")
      const courseID = createCourseID()
      const time = Date.now()
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .insert(CourseTable)
              .values({
                id: courseID,
                title,
                state_version: 0,
                time_created: time,
                time_updated: time,
              })
              .run()
              .pipe(Effect.orDie)
            yield* tx
              .insert(CourseWorkingSelectionTable)
              .values({ course_id: courseID, version: 0, time_updated: time })
              .run()
              .pipe(Effect.orDie)
          }),
        )
        .pipe(Effect.orDie)
      return yield* readCourseInfo(courseID)
    })

    const correctCourse: Interface["correctCourse"] = Effect.fn("Course.correctCourse")(function* (input) {
      const title = yield* titleValue(input.title, "Course")
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            const updated = yield* tx
              .update(CourseTable)
              .set({ title, state_version: sql`${CourseTable.state_version} + 1`, time_updated: Date.now() })
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
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readCourseInfo(input.courseID)
    })

    const createView: Interface["createView"] = Effect.fn("Course.createView")(function* (input) {
      const name = yield* titleValue(input.name, "View")
      yield* requireAuthorship(input.authorship)
      const viewID = createViewID()
      const revisionID = createRevisionID()
      const time = Date.now()
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            const prepared = yield* prepareRevision(tx, input.courseID, input.revision)
            yield* tx
              .insert(CourseViewTable)
              .values({
                id: viewID,
                course_id: input.courseID,
                name,
                state_version: 0,
                time_created: time,
                time_updated: time,
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
              time,
            })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* snapshot(db, (tx) =>
        Effect.all({
          view: getViewInfo(tx, input.courseID, viewID),
          revision: getRevisionSummary(tx, input.courseID, viewID, revisionID),
        }),
      )
    })

    const correctView: Interface["correctView"] = Effect.fn("Course.correctView")(function* (input) {
      const name = yield* titleValue(input.name, "View")
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            yield* requireView(tx, input.courseID, input.viewID, input.expectedViewVersion, true)
            const updated = yield* tx
              .update(CourseViewTable)
              .set({ name, state_version: sql`${CourseViewTable.state_version} + 1`, time_updated: Date.now() })
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
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readViewInfo(input.courseID, input.viewID)
    })

    const addRevision: Interface["addRevision"] = Effect.fn("Course.addRevision")(function* (input) {
      yield* requireAuthorship(input.authorship)
      const revisionID = createRevisionID()
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            yield* requireView(tx, input.courseID, input.viewID, input.expectedViewVersion, true)
            const latest = yield* tx
              .select({ id: CourseViewRevisionTable.id, revisionNumber: CourseViewRevisionTable.revision_number })
              .from(CourseViewRevisionTable)
              .where(
                and(
                  eq(CourseViewRevisionTable.course_id, input.courseID),
                  eq(CourseViewRevisionTable.view_id, input.viewID),
                ),
              )
              .orderBy(sql`${CourseViewRevisionTable.revision_number} DESC`)
              .limit(1)
              .get()
              .pipe(Effect.orDie)
            if (!latest || latest.id !== input.predecessorRevisionID) {
              return yield* conflict("revision", input.predecessorRevisionID)
            }
            const prepared = yield* prepareRevision(tx, input.courseID, input.revision, input.predecessorRevisionID)
            yield* publishRevision({
              tx,
              courseID: input.courseID,
              viewID: input.viewID,
              revisionID,
              revisionNumber: latest.revisionNumber + 1,
              predecessorRevisionID: input.predecessorRevisionID,
              authorshipBasis: input.authorship.basis,
              prepared,
              time: Date.now(),
            })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* readRevisionSummary(input.courseID, input.viewID, revisionID)
    })

    const select: Interface["select"] = Effect.fn("Course.select")(function* (input) {
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* requireCourse(tx, input.courseID, input.expectedCourseVersion, true)
            yield* requireSelection(
              tx,
              input.courseID,
              input.expectedSelectionRevisionID,
              input.expectedSelectionVersion,
            )
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
              Date.now(),
            )
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
            const updated = yield* tx
              .update(CourseViewRevisionStateTable)
              .set({
                withdrawal_reason: "rejected_candidate",
                state_version: sql`${CourseViewRevisionStateTable.state_version} + 1`,
                time_updated: Date.now(),
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
            yield* applyWithdrawalSelection(tx, {
              courseID: input.courseID,
              selection,
              effect: input.selection,
              affected: selection.revision_id === input.revisionID,
              forbiddenRevisionID: input.revisionID,
            })
            const updated = yield* tx
              .update(CourseViewRevisionStateTable)
              .set({
                withdrawal_reason: "removed",
                state_version: sql`${CourseViewRevisionStateTable.state_version} + 1`,
                time_updated: Date.now(),
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
            yield* applyWithdrawalSelection(tx, {
              courseID: input.courseID,
              selection,
              effect: input.selection,
              affected: selected?.viewID === input.viewID,
              forbiddenViewID: input.viewID,
            })
            const updated = yield* tx
              .update(CourseViewTable)
              .set({
                withdrawal_reason: "removed",
                state_version: sql`${CourseViewTable.state_version} + 1`,
                time_updated: Date.now(),
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
            yield* updateSelection(
              tx,
              input.courseID,
              input.expectedSelectionRevisionID,
              input.expectedSelectionVersion,
              undefined,
              Date.now(),
            )
            const updated = yield* tx
              .update(CourseTable)
              .set({
                withdrawal_reason: "removed",
                state_version: sql`${CourseTable.state_version} + 1`,
                time_updated: Date.now(),
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
            const updated = yield* tx
              .update(CourseTable)
              .set({
                withdrawal_reason: null,
                state_version: sql`${CourseTable.state_version} + 1`,
                time_updated: Date.now(),
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
            const updated = yield* tx
              .update(CourseViewTable)
              .set({
                withdrawal_reason: null,
                state_version: sql`${CourseViewTable.state_version} + 1`,
                time_updated: Date.now(),
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
            const updated = yield* tx
              .update(CourseViewRevisionStateTable)
              .set({
                withdrawal_reason: null,
                state_version: sql`${CourseViewRevisionStateTable.state_version} + 1`,
                time_updated: Date.now(),
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

    return Service.of({
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
      listViews,
      getView,
      listRevisions,
      getRevision,
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
      .where(
        and(
          eq(CourseSelectionAcceptanceEffectTable.occurrence_id, input.occurrenceID),
          eq(CourseSelectionAcceptanceEffectTable.course_id, input.courseID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!row) return { type: "new" as const }
    const effect = selectionAcceptanceEffect(row)
    if (row.accepted_revision_id !== input.revisionID) {
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
        current.revision_id === row.accepted_revision_id && current.version === row.committed_selection_version
          ? ("active" as const)
          : ("superseded" as const),
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
        Date.now(),
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
      Date.now(),
    )
  })
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
