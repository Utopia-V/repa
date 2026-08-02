export * as LearnerNavigation from "./learner-navigation"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { and, asc, desc, eq, gt, lt, lte, sql } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { Course } from "./course"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { LearningFrontier } from "./learning-frontier"
import { LearnerOccurrenceTombstoneTable } from "./learning-command/occurrence.sql"
import { LearningCommandReceiptTable } from "./learning-command/sql"
import { LearnerNavigationCursor } from "./learner-navigation/cursor"
import {
  AnchorEffectID,
  DefaultEffectID,
  IntegrityError,
  InvalidCursorError,
  InvalidReadError,
  StaleStateError,
  createAnchorEffectID,
  createDefaultEffectID,
  type AnchorEffect,
  type AnchorHistoryItem,
  type AnchorProjection,
  type DefaultConfirmationSnapshot,
  type DefaultCourseCommand,
  type DefaultEffect,
  type DefaultHistoryItem,
  type DefaultProjection,
  type Error,
  type FallbackResolution,
  type Page,
  type PageOptions,
  type RouteAnchorCommand,
  type SourceReceipt,
} from "./learner-navigation/schema"
import {
  CourseRouteAnchorTransitionTable,
  DefaultCoursePreferenceTransitionTable,
  LearnerCourseRouteAnchorCommitSealTable,
  LearnerDefaultCourseCommitSealTable,
} from "./learner-navigation/sql"
import type { OccurrenceID } from "./learning-command/occurrence-schema"
import type { PermissionV1 } from "./v1/permission"
import type { PartID } from "./v1/session"

export {
  AnchorEffectID,
  DefaultEffectID,
  IntegrityError,
  InvalidCursorError,
  InvalidReadError,
  StaleStateError,
} from "./learner-navigation/schema"
export type {
  AnchorEffect,
  AnchorHistoryItem,
  AnchorProjection,
  Command,
  DefaultConfirmationSnapshot,
  DefaultCourseCommand,
  DefaultCourseTarget,
  DefaultEffect,
  DefaultHistoryItem,
  DefaultProjection,
  Error,
  FallbackCourse,
  FallbackResolution,
  Page,
  PageOptions,
  RouteAnchorCommand,
  RouteAnchorTarget,
  SourceReceipt,
} from "./learner-navigation/schema"

type DatabaseShape = EffectDrizzleSqlite.EffectSQLiteDatabase
export type Transaction = Parameters<Parameters<DatabaseShape["transaction"]>[0]>[0]

const decodeCourseID = Schema.decodeUnknownOption(Course.CourseID)

export type PreparedDefault = Readonly<{
  decision: "candidate" | "no_change"
  current: DefaultProjection
  confirmation: DefaultConfirmationSnapshot
  proof?: Course.PreferenceTargetProof
}>

export type PreparedAnchor = Readonly<{
  decision: "candidate" | "no_change"
  current: AnchorProjection
  proof?: Course.MembershipProof
  locator?: Course.PresentationLocator
}>

export type AnchorResultPresentation = Readonly<{
  effect?: AnchorEffect
  effectLocator?: Course.PresentationLocator
  current: AnchorProjection
  currentLocator?: Course.PresentationLocator
  relation?: "active" | "superseded"
}>

export type DefaultResolution =
  | { readonly type: "new" }
  | { readonly type: "semantic_conflict"; readonly effect: DefaultEffect }
  | {
      readonly type: "already_applied"
      readonly effect: DefaultEffect
      readonly current: DefaultProjection
      readonly relation: "active" | "superseded"
    }

export type AnchorResolution =
  | { readonly type: "new" }
  | { readonly type: "semantic_conflict"; readonly effect: AnchorEffect }
  | {
      readonly type: "already_applied"
      readonly effect: AnchorEffect
      readonly current: AnchorProjection
      readonly relation: "active" | "superseded"
    }

export interface ReadInterface {
  readonly currentDefault: () => Effect.Effect<DefaultProjection, Error>
  readonly currentAnchor: (courseID: Course.CourseID) => Effect.Effect<AnchorProjection, Error>
  readonly listDefaultHistory: (options?: PageOptions) => Effect.Effect<Page<DefaultHistoryItem>, Error>
  readonly listAnchorHistory: (
    courseID: Course.CourseID,
    options?: PageOptions,
  ) => Effect.Effect<Page<AnchorHistoryItem>, Error>
  readonly listAnchoredCourses: (options?: PageOptions) => Effect.Effect<Page<AnchorProjection>, Error>
  readonly resolveCourses: (courseIDs: readonly Course.CourseID[]) => Effect.Effect<FallbackResolution, Error>
}

export interface Interface extends ReadInterface {
  readonly prepareDefault: (
    command: DefaultCourseCommand,
    permissionRequestID: PermissionV1.ID,
  ) => Effect.Effect<PreparedDefault, Error | Course.Error>
  readonly prepareAnchor: (command: RouteAnchorCommand) => Effect.Effect<PreparedAnchor, Error | Course.Error>
}

export class ReadService extends Context.Service<ReadService, ReadInterface>()("@repa/LearnerNavigation/Read") {}
export class Service extends Context.Service<Service, Interface>()("@repa/LearnerNavigation") {}

function makeReadInterface(db: DatabaseShape): ReadInterface {
  return {
    currentDefault: () => snapshot(db, (tx) => readCurrentDefault(tx)),
    currentAnchor: (courseID) => snapshot(db, (tx) => readCurrentAnchor(tx, courseID)),
    listDefaultHistory: (options) => snapshot(db, (tx) => readDefaultHistory(tx, options)),
    listAnchorHistory: (courseID, options) => snapshot(db, (tx) => readAnchorHistory(tx, courseID, options)),
    listAnchoredCourses: (options) => snapshot(db, (tx) => readAnchoredCourses(tx, options)),
    resolveCourses: (courseIDs) => snapshot(db, (tx) => resolveCourseFallback(tx, courseIDs)),
  }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const read = makeReadInterface(db)
    const prepareDefault = (command: DefaultCourseCommand, permissionRequestID: PermissionV1.ID) =>
      snapshot(db, (tx) => prepareDefaultInTransaction(tx, command, permissionRequestID))
    const prepareAnchor = (command: RouteAnchorCommand) => snapshot(db, (tx) => prepareAnchorInTransaction(tx, command))
    return Service.of({
      ...read,
      prepareDefault,
      prepareAnchor,
    })
  }),
)

const readLayer = Layer.effect(
  ReadService,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    return ReadService.of(makeReadInterface(db))
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
export const readNode = makeGlobalNode({ service: ReadService, layer: readLayer, deps: [Database.node] })

function snapshot<A, E, R>(database: DatabaseShape, read: (tx: Transaction) => Effect.Effect<A, E, R>) {
  return database.transaction(read).pipe(Effect.catchTag("SqlError", Effect.die))
}

export function prepareDefaultInTransaction(
  tx: Transaction,
  command: DefaultCourseCommand,
  permissionRequestID: PermissionV1.ID,
) {
  return Effect.gen(function* () {
    const head = yield* defaultHead(tx)
    yield* requireDefaultHead(command, head)
    const current = yield* defaultProjection(tx, head)
    const targetCourseID = command.target?.courseID ?? null
    if (targetCourseID === (head?.course_id ?? null)) {
      return {
        decision: "no_change",
        current,
        confirmation: {
          permissionRequestID,
          headID: head?.id ?? null,
          version: head?.version ?? 0,
          fromCourseID: head?.course_id ?? null,
          fromCourseTitle: defaultTitle(current),
          target: null,
        },
      } satisfies PreparedDefault
    }
    const proof = command.target ? yield* Course.preparePreferenceTargetProof(tx, command.target) : undefined
    return {
      decision: "candidate",
      current,
      confirmation: {
        permissionRequestID,
        headID: head?.id ?? null,
        version: head?.version ?? 0,
        fromCourseID: head?.course_id ?? null,
        fromCourseTitle: defaultTitle(current),
        target: proof?.receipt ?? null,
      },
      ...(proof ? { proof } : {}),
    } satisfies PreparedDefault
  })
}

export function prepareAnchorInTransaction(tx: Transaction, command: RouteAnchorCommand) {
  return Effect.gen(function* () {
    const head = yield* anchorHead(tx, command.courseID)
    yield* requireAnchorHead(command, head)
    const current = yield* anchorProjection(tx, command.courseID, head)
    const target = commandTarget(command)
    const locator = target ? yield* Course.readMembershipPresentationLocator(tx, target) : undefined
    if (sameEndpoint(commandTarget(command), anchorTarget(head))) {
      return {
        decision: "no_change",
        current,
        ...(locator ? { locator } : {}),
      } satisfies PreparedAnchor
    }
    if (!command.target) return { decision: "candidate", current } satisfies PreparedAnchor
    const proof = yield* Course.prepareMembershipProof(tx, {
      endpoint: commandTarget(command)!,
      selection: {
        type: "observed_working",
        revisionID: command.target.revisionID,
        version: command.target.selectionVersion,
      },
    })
    if (
      proof.receipt.courseVersion !== command.target.courseVersion ||
      proof.receipt.viewVersion !== command.target.viewVersion ||
      proof.receipt.revisionVersion !== command.target.revisionVersion
    ) {
      return yield* staleAnchor(command.courseID)
    }
    return { decision: "candidate", current, proof, locator: locator! } satisfies PreparedAnchor
  })
}

export function resolveDefaultEffect(
  tx: Transaction,
  input: { readonly occurrenceID: OccurrenceID; readonly targetCourseID: Course.CourseID | null },
): Effect.Effect<DefaultResolution, Error> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(DefaultCoursePreferenceTransitionTable)
      .where(eq(DefaultCoursePreferenceTransitionTable.occurrence_id, input.occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return { type: "new" as const }
    const effect = defaultEffect(row)
    if (row.course_id !== input.targetCourseID) return { type: "semantic_conflict" as const, effect }
    const current = yield* readCurrentDefault(tx)
    return {
      type: "already_applied" as const,
      effect,
      current,
      relation: current.headID === row.id ? ("active" as const) : ("superseded" as const),
    }
  })
}

export function resolveAnchorEffect(
  tx: Transaction,
  input: {
    readonly occurrenceID: OccurrenceID
    readonly courseID: Course.CourseID
    readonly target: Course.MembershipEndpoint | null
  },
): Effect.Effect<AnchorResolution, Error> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(CourseRouteAnchorTransitionTable)
      .where(
        and(
          eq(CourseRouteAnchorTransitionTable.occurrence_id, input.occurrenceID),
          eq(CourseRouteAnchorTransitionTable.course_id, input.courseID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!row) return { type: "new" as const }
    const effect = anchorEffect(row)
    if (!sameEndpoint(effect.target, input.target)) return { type: "semantic_conflict" as const, effect }
    const current = yield* readCurrentAnchor(tx, input.courseID)
    return {
      type: "already_applied" as const,
      effect,
      current,
      relation: current.headID === row.id ? ("active" as const) : ("superseded" as const),
    }
  })
}

export function readAnchorResultPresentation(
  tx: Transaction,
  input: { readonly effectID: AnchorEffectID } | { readonly courseID: Course.CourseID },
): Effect.Effect<AnchorResultPresentation, Error | Course.Error> {
  return Effect.gen(function* () {
    const row =
      "effectID" in input
        ? yield* tx
            .select({ transition: CourseRouteAnchorTransitionTable })
            .from(CourseRouteAnchorTransitionTable)
            .innerJoin(
              LearnerCourseRouteAnchorCommitSealTable,
              eq(LearnerCourseRouteAnchorCommitSealTable.effect_id, CourseRouteAnchorTransitionTable.id),
            )
            .where(eq(CourseRouteAnchorTransitionTable.id, input.effectID))
            .get()
            .pipe(Effect.orDie)
        : undefined
    if ("effectID" in input && !row) {
      return yield* Effect.die(`Committed Course route-anchor effect ${input.effectID} is unavailable`)
    }
    const effect = row ? anchorEffect(row.transition) : undefined
    const courseID = effect?.courseID ?? ("courseID" in input ? input.courseID : undefined)
    if (!courseID) return yield* Effect.die("Course route-anchor result lost its owner Course")
    const current = yield* readCurrentAnchor(tx, courseID)
    const effectLocator = effect?.target
      ? yield* Course.readMembershipPresentationLocator(tx, effect.target)
      : undefined
    const currentLocator = current.target
      ? yield* Course.readMembershipPresentationLocator(tx, current.target)
      : undefined
    return {
      ...(effect ? { effect } : {}),
      ...(effectLocator ? { effectLocator } : {}),
      current,
      ...(currentLocator ? { currentLocator } : {}),
      ...(effect ? { relation: current.headID === effect.id ? ("active" as const) : ("superseded" as const) } : {}),
    }
  })
}

export function applyDefault(
  tx: Transaction,
  input: {
    readonly occurrenceID: OccurrenceID
    readonly authorizationPartID: PartID
    readonly command: DefaultCourseCommand
    readonly permissionRequestID: PermissionV1.ID
    readonly confirmation: DefaultConfirmationSnapshot
    readonly proof?: Course.PreferenceTargetProof
    readonly trustedTime: number
    readonly commitOrder: number
  },
) {
  return Effect.gen(function* () {
    const head = yield* defaultHead(tx)
    yield* requireDefaultHead(input.command, head)
    const previousCourseID = head?.course_id ?? null
    const targetCourseID = input.command.target?.courseID ?? null
    if (previousCourseID === targetCourseID) return yield* staleDefault()
    const receipt = input.command.target ? yield* requireDefaultProof(tx, input.command, input.proof) : null
    const expectedConfirmation = {
      permissionRequestID: input.permissionRequestID,
      headID: head?.id ?? null,
      version: head?.version ?? 0,
      fromCourseID: previousCourseID,
      fromCourseTitle: input.confirmation.fromCourseTitle,
      target: receipt,
    } satisfies DefaultConfirmationSnapshot
    if (JSON.stringify(input.confirmation) !== JSON.stringify(expectedConfirmation)) return yield* staleDefault()
    const consumed = yield* LearningFrontier.read(tx)
    if (input.trustedTime < consumed.time) return yield* staleDefault()
    const frontier = yield* LearningFrontier.advance(tx, { time: input.trustedTime, consumed: [consumed] })
    const id = createDefaultEffectID()
    yield* tx
      .insert(DefaultCoursePreferenceTransitionTable)
      .values({
        id,
        version: (head?.version ?? 0) + 1,
        predecessor_id: head?.id ?? null,
        previous_course_id: previousCourseID,
        course_id: targetCourseID,
        occurrence_id: input.occurrenceID,
        authorization_part_id: input.authorizationPartID,
        agent_action_part_id: null,
        permission_request_id: input.permissionRequestID,
        confirmation_snapshot: input.confirmation,
        target_course_version: receipt?.courseVersion ?? null,
        target_selection_revision_id: receipt?.selectionRevisionID ?? null,
        target_selection_version: receipt?.selectionVersion ?? null,
        target_view_id: receipt?.viewID ?? null,
        target_view_version: receipt?.viewVersion ?? null,
        target_revision_version: receipt?.revisionVersion ?? null,
        time_committed: input.trustedTime,
        commit_order: input.commitOrder,
        frontier_sequence: frontier.sequence,
        frontier_time: frontier.time,
      })
      .run()
      .pipe(Effect.orDie)
    return defaultEffect({
      id,
      version: (head?.version ?? 0) + 1,
      predecessor_id: head?.id ?? null,
      previous_course_id: previousCourseID,
      course_id: targetCourseID,
      occurrence_id: input.occurrenceID,
      authorization_part_id: input.authorizationPartID,
      agent_action_part_id: null,
      permission_request_id: input.permissionRequestID,
      confirmation_snapshot: input.confirmation,
      target_course_version: receipt?.courseVersion ?? null,
      target_selection_revision_id: receipt?.selectionRevisionID ?? null,
      target_selection_version: receipt?.selectionVersion ?? null,
      target_view_id: receipt?.viewID ?? null,
      target_view_version: receipt?.viewVersion ?? null,
      target_revision_version: receipt?.revisionVersion ?? null,
      time_committed: input.trustedTime,
      commit_order: input.commitOrder,
      frontier_sequence: frontier.sequence,
      frontier_time: frontier.time,
    })
  })
}

export function applyAnchor(
  tx: Transaction,
  input: {
    readonly occurrenceID: OccurrenceID
    readonly command: RouteAnchorCommand
    readonly proof?: Course.MembershipProof
    readonly trustedTime: number
    readonly commitOrder: number
  },
) {
  return Effect.gen(function* () {
    const consumed = yield* LearningFrontier.read(tx)
    if (input.trustedTime < consumed.time) return yield* staleAnchor(input.command.courseID)
    const frontier = yield* LearningFrontier.advance(tx, { time: input.trustedTime, consumed: [consumed] })
    return yield* applyAnchorAtFrontier(tx, { ...input, frontier })
  })
}

/** Owner-private anchor transition that shares a caller's one local frontier advance. */
export function applyAnchorAtFrontier(
  tx: Transaction,
  input: {
    readonly occurrenceID: OccurrenceID
    readonly command: RouteAnchorCommand
    readonly proof?: Course.MembershipProof
    readonly trustedTime: number
    readonly commitOrder: number
    readonly frontier: LearningFrontier.Snapshot
  },
) {
  return Effect.gen(function* () {
    const head = yield* anchorHead(tx, input.command.courseID)
    yield* requireAnchorHead(input.command, head)
    const previous = anchorTarget(head)
    const target = commandTarget(input.command)
    if (sameEndpoint(previous, target)) return yield* staleAnchor(input.command.courseID)
    const proof = input.command.target ? yield* requireAnchorProof(tx, input.command, input.proof) : undefined
    if (input.frontier.time !== input.trustedTime || input.frontier.sequence < 1) {
      return yield* staleAnchor(input.command.courseID)
    }
    const id = createAnchorEffectID()
    yield* tx
      .insert(CourseRouteAnchorTransitionTable)
      .values({
        id,
        course_id: input.command.courseID,
        version: (head?.version ?? 0) + 1,
        predecessor_id: head?.id ?? null,
        previous_view_id: previous?.viewID ?? null,
        previous_revision_id: previous?.revisionID ?? null,
        previous_item_id: previous?.itemID ?? null,
        target_view_id: target?.viewID ?? null,
        target_revision_id: target?.revisionID ?? null,
        target_item_id: target?.itemID ?? null,
        occurrence_id: input.occurrenceID,
        target_course_version: proof?.receipt.courseVersion ?? null,
        target_selection_version:
          proof?.receipt.selection.type === "observed_working" ? proof.receipt.selection.version : null,
        target_view_version: proof?.receipt.viewVersion ?? null,
        target_revision_version: proof?.receipt.revisionVersion ?? null,
        time_committed: input.trustedTime,
        commit_order: input.commitOrder,
        frontier_sequence: input.frontier.sequence,
        frontier_time: input.frontier.time,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      id,
      occurrenceID: input.occurrenceID,
      courseID: input.command.courseID,
      previousTarget: previous,
      target,
      previousVersion: head?.version ?? 0,
      version: (head?.version ?? 0) + 1,
      timeCommitted: input.trustedTime,
      commitOrder: input.commitOrder,
      frontierSequence: input.frontier.sequence,
    } satisfies AnchorEffect
  })
}

export function readCurrentDefault(tx: Transaction) {
  return defaultHead(tx).pipe(Effect.flatMap((head) => defaultProjection(tx, head)))
}

export function readCurrentAnchor(tx: Transaction, courseID: Course.CourseID) {
  return anchorHead(tx, courseID).pipe(Effect.flatMap((head) => anchorProjection(tx, courseID, head)))
}

/** Seal an anchor transition to the exact physical receipt that committed it. */
export function sealAnchor(
  tx: Transaction,
  input: Readonly<{
    effectID: AnchorEffectID
    receiptID: (typeof LearningCommandReceiptTable.$inferSelect)["id"]
    invocationPartID: PartID
  }>,
) {
  return tx
    .insert(LearnerCourseRouteAnchorCommitSealTable)
    .values({ effect_id: input.effectID, receipt_id: input.receiptID, invocation_part_id: input.invocationPartID })
    .run()
    .pipe(Effect.orDie)
}

function readDefaultHistory(tx: Transaction, input?: PageOptions) {
  return Effect.gen(function* () {
    const scope = { endpoint: "default_history" as const, parent: "learner-home" }
    const options = yield* LearnerNavigationCursor.options(input, scope)
    const throughSequence = options.throughSequence ?? (yield* LearningFrontier.read(tx)).sequence
    const afterVersion = options.key ? Number(options.key[0]) : undefined
    if (afterVersion !== undefined && (!Number.isSafeInteger(afterVersion) || afterVersion < 1)) {
      return yield* new InvalidCursorError({ detail: "Default history cursor has an invalid version" })
    }
    const rows = yield* tx
      .select()
      .from(DefaultCoursePreferenceTransitionTable)
      .where(
        and(
          lte(DefaultCoursePreferenceTransitionTable.frontier_sequence, throughSequence),
          afterVersion === undefined ? undefined : lt(DefaultCoursePreferenceTransitionTable.version, afterVersion),
        ),
      )
      .orderBy(desc(DefaultCoursePreferenceTransitionTable.version), desc(DefaultCoursePreferenceTransitionTable.id))
      .limit(options.limit + 1)
      .all()
      .pipe(Effect.orDie)
    const page = rows.slice(0, options.limit)
    const items = yield* Effect.forEach(page, (row) =>
      sourceReceipt(tx, { kind: "default", effectID: row.id }).pipe(
        Effect.map(
          (source) =>
            ({
              effect: defaultEffect(row),
              relation: row.id === rows[0]?.id && afterVersion === undefined ? "current" : "superseded",
              source,
            }) satisfies DefaultHistoryItem,
        ),
      ),
    )
    return {
      items,
      ...(rows.length > options.limit
        ? { cursor: LearnerNavigationCursor.next(scope, throughSequence, [page.at(-1)!.version]) }
        : {}),
    } satisfies Page<DefaultHistoryItem>
  })
}

function readAnchorHistory(tx: Transaction, courseID: Course.CourseID, input?: PageOptions) {
  return Effect.gen(function* () {
    const scope = { endpoint: "anchor_history" as const, parent: courseID }
    const options = yield* LearnerNavigationCursor.options(input, scope)
    const throughSequence = options.throughSequence ?? (yield* LearningFrontier.read(tx)).sequence
    const afterVersion = options.key ? Number(options.key[0]) : undefined
    if (afterVersion !== undefined && (!Number.isSafeInteger(afterVersion) || afterVersion < 1)) {
      return yield* new InvalidCursorError({ detail: "Anchor history cursor has an invalid version" })
    }
    const rows = yield* tx
      .select()
      .from(CourseRouteAnchorTransitionTable)
      .where(
        and(
          eq(CourseRouteAnchorTransitionTable.course_id, courseID),
          lte(CourseRouteAnchorTransitionTable.frontier_sequence, throughSequence),
          afterVersion === undefined ? undefined : lt(CourseRouteAnchorTransitionTable.version, afterVersion),
        ),
      )
      .orderBy(desc(CourseRouteAnchorTransitionTable.version), desc(CourseRouteAnchorTransitionTable.id))
      .limit(options.limit + 1)
      .all()
      .pipe(Effect.orDie)
    const page = rows.slice(0, options.limit)
    const items = yield* Effect.forEach(page, (row) =>
      sourceReceipt(tx, { kind: "anchor", effectID: row.id }).pipe(
        Effect.map(
          (source) =>
            ({
              effect: anchorEffect(row),
              relation: row.id === rows[0]?.id && afterVersion === undefined ? "current" : "superseded",
              source,
            }) satisfies AnchorHistoryItem,
        ),
      ),
    )
    return {
      items,
      ...(rows.length > options.limit
        ? { cursor: LearnerNavigationCursor.next(scope, throughSequence, [page.at(-1)!.version]) }
        : {}),
    } satisfies Page<AnchorHistoryItem>
  })
}

function readAnchoredCourses(tx: Transaction, input?: PageOptions) {
  return Effect.gen(function* () {
    const scope = { endpoint: "anchored_courses" as const, parent: "learner-home" }
    const options = yield* LearnerNavigationCursor.options(input, scope)
    const throughSequence = options.throughSequence ?? (yield* LearningFrontier.read(tx)).sequence
    const afterCourseID = options.key?.[0]
    if (afterCourseID !== undefined && typeof afterCourseID !== "string") {
      return yield* new InvalidCursorError({ detail: "Anchored-Course cursor has an invalid Course ID" })
    }
    const after = afterCourseID === undefined ? undefined : Option.getOrUndefined(decodeCourseID(afterCourseID))
    if (afterCourseID !== undefined && after === undefined) {
      return yield* new InvalidCursorError({ detail: "Anchored-Course cursor has an invalid Course ID" })
    }
    const rows = yield* tx
      .select()
      .from(CourseRouteAnchorTransitionTable)
      .where(
        and(
          lte(CourseRouteAnchorTransitionTable.frontier_sequence, throughSequence),
          after === undefined ? undefined : gt(CourseRouteAnchorTransitionTable.course_id, after),
          sql`NOT EXISTS (
            SELECT 1 FROM learner_course_route_anchor_transition AS successor
            WHERE successor.predecessor_id = ${CourseRouteAnchorTransitionTable.id}
              AND successor.frontier_sequence <= ${throughSequence}
          )`,
        ),
      )
      .orderBy(asc(CourseRouteAnchorTransitionTable.course_id))
      .limit(options.limit + 1)
      .all()
      .pipe(Effect.orDie)
    const page = rows.slice(0, options.limit)
    const items = yield* Effect.forEach(page, (row) => anchorProjection(tx, row.course_id, row))
    return {
      items,
      ...(rows.length > options.limit
        ? { cursor: LearnerNavigationCursor.next(scope, throughSequence, [page.at(-1)!.course_id]) }
        : {}),
    } satisfies Page<AnchorProjection>
  })
}

function resolveCourseFallback(tx: Transaction, input: readonly Course.CourseID[]) {
  return Effect.gen(function* () {
    if (input.length > 100) {
      return yield* new InvalidReadError({ detail: "Fallback resolution accepts at most 100 explicit Course IDs" })
    }
    const courseIDs = input.filter((courseID, index) => input.indexOf(courseID) === index)
    if (courseIDs.length > 0) {
      const courses = yield* Effect.forEach(courseIDs, (courseID) =>
        Course.inspectPreferenceTarget(tx, courseID).pipe(
          Effect.map((status) => ({
            courseID,
            availability: status.status === "available" ? ("available" as const) : status.cause,
            ...(status.title ? { title: status.title } : {}),
          })),
        ),
      )
      return { source: "explicit", courses } satisfies FallbackResolution
    }
    const current = yield* readCurrentDefault(tx)
    if (current.courseID && current.usability.usable) {
      return {
        source: "default",
        courses: [{ courseID: current.courseID, availability: "available", title: current.usability.title }],
        default: current,
      } satisfies FallbackResolution
    }
    return { source: "none", courses: [], default: current } satisfies FallbackResolution
  })
}

function defaultHead(tx: Transaction) {
  return Effect.gen(function* () {
    const rows = yield* tx
      .select()
      .from(DefaultCoursePreferenceTransitionTable)
      .where(
        sql`NOT EXISTS (
          SELECT 1 FROM learner_default_course_transition AS successor
          WHERE successor.predecessor_id = ${DefaultCoursePreferenceTransitionTable.id}
        )`,
      )
      .limit(2)
      .all()
      .pipe(Effect.orDie)
    if (rows.length > 1) return yield* new IntegrityError({ detail: "Default Course history has multiple heads" })
    return rows[0]
  })
}

function anchorHead(tx: Transaction, courseID: Course.CourseID) {
  return Effect.gen(function* () {
    const rows = yield* tx
      .select()
      .from(CourseRouteAnchorTransitionTable)
      .where(
        and(
          eq(CourseRouteAnchorTransitionTable.course_id, courseID),
          sql`NOT EXISTS (
            SELECT 1 FROM learner_course_route_anchor_transition AS successor
            WHERE successor.predecessor_id = ${CourseRouteAnchorTransitionTable.id}
          )`,
        ),
      )
      .limit(2)
      .all()
      .pipe(Effect.orDie)
    if (rows.length > 1) {
      return yield* new IntegrityError({ detail: `Course ${courseID} route-anchor history has multiple heads` })
    }
    return rows[0]
  })
}

function requireDefaultHead(
  command: DefaultCourseCommand,
  head: typeof DefaultCoursePreferenceTransitionTable.$inferSelect | undefined,
) {
  if ((head?.id ?? null) !== command.expectedHeadID || (head?.version ?? 0) !== command.expectedVersion) {
    return staleDefault()
  }
  return Effect.void
}

function requireAnchorHead(
  command: RouteAnchorCommand,
  head: typeof CourseRouteAnchorTransitionTable.$inferSelect | undefined,
) {
  if ((head?.id ?? null) !== command.expectedHeadID || (head?.version ?? 0) !== command.expectedVersion) {
    return staleAnchor(command.courseID)
  }
  return Effect.void
}

function requireDefaultProof(
  tx: Transaction,
  command: DefaultCourseCommand,
  proof: Course.PreferenceTargetProof | undefined,
) {
  return Effect.gen(function* () {
    if (!command.target || !proof) return yield* staleDefault()
    yield* Course.requirePreferenceTargetProof(tx, proof)
    const receipt = proof.receipt
    if (
      receipt.courseID !== command.target.courseID ||
      receipt.courseVersion !== command.target.courseVersion ||
      receipt.selectionRevisionID !== command.target.selectionRevisionID ||
      receipt.selectionVersion !== command.target.selectionVersion ||
      receipt.viewID !== command.target.viewID ||
      receipt.viewVersion !== command.target.viewVersion ||
      receipt.revisionVersion !== command.target.revisionVersion
    ) {
      return yield* staleDefault()
    }
    return receipt
  })
}

function requireAnchorProof(tx: Transaction, command: RouteAnchorCommand, proof: Course.MembershipProof | undefined) {
  return Effect.gen(function* () {
    if (!command.target || !proof) return yield* staleAnchor(command.courseID)
    yield* Course.requireMembershipProof(tx, proof)
    if (
      proof.endpoint.courseID !== command.courseID ||
      proof.endpoint.viewID !== command.target.viewID ||
      proof.endpoint.revisionID !== command.target.revisionID ||
      proof.endpoint.itemID !== command.target.itemID ||
      proof.selection.type !== "observed_working" ||
      proof.selection.revisionID !== command.target.revisionID ||
      proof.selection.version !== command.target.selectionVersion ||
      proof.receipt.courseVersion !== command.target.courseVersion ||
      proof.receipt.viewVersion !== command.target.viewVersion ||
      proof.receipt.revisionVersion !== command.target.revisionVersion
    ) {
      return yield* staleAnchor(command.courseID)
    }
    return proof
  })
}

function defaultProjection(
  tx: Transaction,
  row: typeof DefaultCoursePreferenceTransitionTable.$inferSelect | undefined,
) {
  return Effect.gen(function* () {
    if (!row) {
      return {
        kind: "default_course_preference",
        headID: null,
        version: 0,
        courseID: null,
        usability: { usable: false, cause: "absent" },
      } satisfies DefaultProjection
    }
    const source = yield* sourceReceipt(tx, { kind: "default", effectID: row.id })
    if (!row.course_id) {
      return {
        kind: "default_course_preference",
        headID: row.id,
        version: row.version,
        courseID: null,
        usability: { usable: false, cause: "absent" },
        source,
        timeCommitted: row.time_committed,
        commitOrder: row.commit_order,
        frontierSequence: row.frontier_sequence,
      } satisfies DefaultProjection
    }
    const status = yield* Course.inspectPreferenceTarget(tx, row.course_id)
    return {
      kind: "default_course_preference",
      headID: row.id,
      version: row.version,
      courseID: row.course_id,
      usability:
        status.status === "available"
          ? { usable: true, title: status.title }
          : { usable: false, cause: status.cause, ...(status.title ? { title: status.title } : {}) },
      source,
      timeCommitted: row.time_committed,
      commitOrder: row.commit_order,
      frontierSequence: row.frontier_sequence,
    } satisfies DefaultProjection
  })
}

function anchorProjection(
  tx: Transaction,
  courseID: Course.CourseID,
  row: typeof CourseRouteAnchorTransitionTable.$inferSelect | undefined,
) {
  return Effect.gen(function* () {
    if (!row) {
      return {
        kind: "course_route_anchor",
        courseID,
        headID: null,
        version: 0,
        target: null,
        usability: { usable: false, cause: "absent" },
      } satisfies AnchorProjection
    }
    const target = anchorTarget(row)
    const source = yield* sourceReceipt(tx, { kind: "anchor", effectID: row.id })
    if (!target) {
      return {
        kind: "course_route_anchor",
        courseID,
        headID: row.id,
        version: row.version,
        target: null,
        usability: { usable: false, cause: "absent" },
        source,
        timeCommitted: row.time_committed,
        commitOrder: row.commit_order,
        frontierSequence: row.frontier_sequence,
      } satisfies AnchorProjection
    }
    const status = yield* Course.inspectMembershipStatus(tx, target, {
      type: "observed_working",
      revisionID: target.revisionID,
      version: row.target_selection_version ?? 0,
    })
    return {
      kind: "course_route_anchor",
      courseID,
      headID: row.id,
      version: row.version,
      target,
      usability: status.status === "eligible" ? { usable: true } : { usable: false, cause: status.cause },
      source,
      timeCommitted: row.time_committed,
      commitOrder: row.commit_order,
      frontierSequence: row.frontier_sequence,
    } satisfies AnchorProjection
  })
}

function sourceReceipt(
  tx: Transaction,
  input:
    | { readonly kind: "default"; readonly effectID: DefaultEffectID }
    | { readonly kind: "anchor"; readonly effectID: AnchorEffectID },
) {
  return Effect.gen(function* () {
    const receipt =
      input.kind === "default"
        ? yield* tx
            .select({
              id: LearningCommandReceiptTable.id,
              occurrence_id: LearningCommandReceiptTable.occurrence_id,
              origin_session_id: LearningCommandReceiptTable.origin_session_id,
              origin_message_id: LearningCommandReceiptTable.origin_message_id,
              assistant_message_id: LearningCommandReceiptTable.assistant_message_id,
              invocation_part_id: LearningCommandReceiptTable.invocation_part_id,
            })
            .from(LearnerDefaultCourseCommitSealTable)
            .innerJoin(
              LearningCommandReceiptTable,
              eq(LearningCommandReceiptTable.id, LearnerDefaultCourseCommitSealTable.receipt_id),
            )
            .where(eq(LearnerDefaultCourseCommitSealTable.effect_id, input.effectID))
            .get()
            .pipe(Effect.orDie)
        : yield* tx
            .select({
              id: LearningCommandReceiptTable.id,
              occurrence_id: LearningCommandReceiptTable.occurrence_id,
              origin_session_id: LearningCommandReceiptTable.origin_session_id,
              origin_message_id: LearningCommandReceiptTable.origin_message_id,
              assistant_message_id: LearningCommandReceiptTable.assistant_message_id,
              invocation_part_id: LearningCommandReceiptTable.invocation_part_id,
            })
            .from(LearnerCourseRouteAnchorCommitSealTable)
            .innerJoin(
              LearningCommandReceiptTable,
              eq(LearningCommandReceiptTable.id, LearnerCourseRouteAnchorCommitSealTable.receipt_id),
            )
            .where(eq(LearnerCourseRouteAnchorCommitSealTable.effect_id, input.effectID))
            .get()
            .pipe(Effect.orDie)
    if (!receipt) return yield* new IntegrityError({ detail: `Navigation effect ${input.effectID} has no receipt` })
    const tombstone = yield* tx
      .select()
      .from(LearnerOccurrenceTombstoneTable)
      .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, receipt.occurrence_id))
      .get()
      .pipe(Effect.orDie)
    return {
      receiptID: receipt.id,
      occurrenceID: receipt.occurrence_id,
      originSessionID: receipt.origin_session_id,
      originMessageID: receipt.origin_message_id,
      assistantMessageID: receipt.assistant_message_id,
      invocationPartID: receipt.invocation_part_id,
      availability: tombstone ? "source_unavailable" : "available",
      ...(tombstone ? { timeDeleted: tombstone.time_deleted } : {}),
    } satisfies SourceReceipt
  })
}

function defaultEffect(row: typeof DefaultCoursePreferenceTransitionTable.$inferSelect): DefaultEffect {
  return {
    id: row.id,
    occurrenceID: row.occurrence_id,
    previousCourseID: row.previous_course_id,
    courseID: row.course_id,
    previousVersion: row.version - 1,
    version: row.version,
    timeCommitted: row.time_committed,
    commitOrder: row.commit_order,
    frontierSequence: row.frontier_sequence,
  }
}

function anchorEffect(row: typeof CourseRouteAnchorTransitionTable.$inferSelect): AnchorEffect {
  return {
    id: row.id,
    occurrenceID: row.occurrence_id,
    courseID: row.course_id,
    previousTarget: previousAnchorTarget(row),
    target: anchorTarget(row),
    previousVersion: row.version - 1,
    version: row.version,
    timeCommitted: row.time_committed,
    commitOrder: row.commit_order,
    frontierSequence: row.frontier_sequence,
  }
}

function commandTarget(command: RouteAnchorCommand): Course.MembershipEndpoint | null {
  if (!command.target) return null
  return {
    courseID: command.courseID,
    viewID: command.target.viewID,
    revisionID: command.target.revisionID,
    itemID: command.target.itemID,
  }
}

function anchorTarget(row: typeof CourseRouteAnchorTransitionTable.$inferSelect | undefined) {
  if (!row?.target_view_id || !row.target_revision_id || !row.target_item_id) return null
  return {
    courseID: row.course_id,
    viewID: row.target_view_id,
    revisionID: row.target_revision_id,
    itemID: row.target_item_id,
  } satisfies Course.MembershipEndpoint
}

function previousAnchorTarget(row: typeof CourseRouteAnchorTransitionTable.$inferSelect) {
  if (!row.previous_view_id || !row.previous_revision_id || !row.previous_item_id) return null
  return {
    courseID: row.course_id,
    viewID: row.previous_view_id,
    revisionID: row.previous_revision_id,
    itemID: row.previous_item_id,
  } satisfies Course.MembershipEndpoint
}

function sameEndpoint(left: Course.MembershipEndpoint | null, right: Course.MembershipEndpoint | null) {
  return (
    left?.courseID === right?.courseID &&
    left?.viewID === right?.viewID &&
    left?.revisionID === right?.revisionID &&
    left?.itemID === right?.itemID
  )
}

function defaultTitle(current: DefaultProjection) {
  return "title" in current.usability ? (current.usability.title ?? null) : null
}

function staleDefault() {
  return Effect.fail(new StaleStateError({ kind: "default_course_preference" }))
}

function staleAnchor(courseID: Course.CourseID) {
  return Effect.fail(new StaleStateError({ kind: "course_route_anchor", courseID }))
}
