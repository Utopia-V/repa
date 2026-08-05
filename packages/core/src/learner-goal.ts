export * as LearnerGoal from "./learner-goal"

import { and, asc, desc, eq, isNull, lt, lte, or, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Course } from "./course"
import { CourseTable } from "./course/sql"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { LearningFrontier } from "./learning-frontier"
import { MAX_LAZY_BYTES, MAX_LAZY_ITEMS, canonicalFingerprint, toJsonValue, utf8Bytes } from "./learning-context/schema"
import { Occurrence } from "./learning-command/occurrence"
import { AdmittedLearnerOccurrenceTable, LearnerOccurrenceTombstoneTable } from "./learning-command/occurrence.sql"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "./learning-command/sql"
import type { AuthorizationBasis, ReceiptID, SettlementMetadata } from "./learning-command/schema"
import { MessageTable, PartTable } from "./session/sql"
import type { SessionSchema } from "./session/schema"
import type { MessageID, SessionV1 } from "./v1/session"
import { LearnerGoalCursor } from "./learner-goal/cursor"
import {
  IntegrityError,
  InvalidCommandError,
  MAX_AGGREGATE_BYTES,
  MAX_CONDITION_BYTES,
  MAX_CONDITIONS,
  MAX_COURSES,
  MAX_OPERATIONS,
  MAX_OUTCOME_BYTES,
  MAX_SOURCE_EXCERPT_BYTES,
  SCHEMA_VERSION,
  createEffectID,
  createGoalID,
  createRevisionID,
  type Command,
  type CanonicalCommandV2,
  type AgentActionProvenanceV2,
  type MaterializedChangeSetV2,
  type AcceptedInvocation,
  type ConfirmationCourse,
  type ConfirmationSnapshot,
  type DiscoveryFilter,
  type Disposition,
  type EffectID,
  type EffectRead,
  type FieldBases,
  type FieldName,
  type GoalID,
  type GoalRead,
  type Invocation,
  type NonSupersededDisposition,
  type Operation,
  type OperationResult,
  type OperationResultV2,
  type PageOptions,
  type PresentationMeaning,
  type ProposalPresentation,
  type ProposalPresentationOperation,
  type Revision,
  type RevisionID,
  type ResultPresentationOperation,
  type ResolvedZoneV2,
  type SemanticSnapshot,
  type StoredCourseMembership,
  type StoredCourseMembershipV2,
  type StoredScope,
  type StoredScopeV2,
  type Target,
  type TargetValueV2,
  type TargetRelation,
  type UpdateDisposition,
} from "./learner-goal/schema"
import {
  LearnerGoalCommandTable,
  LearnerGoalCapabilitySettlementV2Table,
  LearnerGoalCommitSealTable,
  LearnerGoalConditionTable,
  LearnerGoalCourseScopeTable,
  LearnerGoalEffectOperationTable,
  LearnerGoalEffectTable,
  LearnerGoalDispositionV2Table,
  LearnerGoalFieldBasisTable,
  LearnerGoalRevisionTable,
  LearnerGoalStateTable,
  LearnerGoalSupersessionTable,
  LearnerGoalTable,
} from "./learner-goal/sql"
import {
  TIME_ZONE_RELEASE_ID,
  isSupportedTimeZone,
  localDateAt,
  localDateAtResolvedZone,
} from "./learner-goal/time-zone"
import { isOperationResult } from "./learner-goal/operation-result"

export * from "./learner-goal/schema"

type DatabaseShape = Database.Interface["db"]
export type Transaction = Parameters<Parameters<DatabaseShape["transaction"]>[0]>[0]

const committedEffect = sql`EXISTS (
  SELECT 1
  FROM learner_goal_commit_seal AS goal_seal
  JOIN learning_command_receipt AS goal_receipt
    ON goal_receipt.id = goal_seal.receipt_id
  JOIN learning_command_invocation AS goal_invocation
    ON goal_invocation.part_id = goal_seal.invocation_part_id
  WHERE goal_seal.effect_id = ${LearnerGoalEffectTable.id}
    AND goal_receipt.invocation_part_id = goal_seal.invocation_part_id
    AND goal_invocation.receipt_id = goal_receipt.id
    AND goal_invocation.status = 'applied'
    AND (
      (${LearnerGoalEffectTable.schema_version} = 1 AND EXISTS (
        SELECT 1 FROM learner_goal_command AS goal_command
        WHERE goal_command.invocation_part_id = goal_invocation.part_id
          AND goal_command.semantic_fingerprint = ${LearnerGoalEffectTable.semantic_fingerprint}
      ))
      OR (${LearnerGoalEffectTable.schema_version} = 2
        AND ${LearnerGoalEffectTable.agent_action_part_id} = goal_invocation.part_id
        AND EXISTS (
          SELECT 1 FROM learner_goal_disposition_v2 AS goal_disposition
          WHERE goal_disposition.invocation_part_id = goal_invocation.part_id
            AND goal_disposition.disposition = 'candidate_v2'
            AND goal_disposition.command_fingerprint = ${LearnerGoalEffectTable.semantic_fingerprint}
        ))
    )
)`

const committedRevision = sql`EXISTS (
  SELECT 1
  FROM learner_goal_effect AS goal_effect
  JOIN learner_goal_commit_seal AS goal_seal ON goal_seal.effect_id = goal_effect.id
  JOIN learning_command_receipt AS goal_receipt
    ON goal_receipt.id = goal_seal.receipt_id
  JOIN learning_command_invocation AS goal_invocation
    ON goal_invocation.part_id = goal_seal.invocation_part_id
      AND goal_invocation.receipt_id = goal_receipt.id
      AND goal_invocation.status = 'applied'
  WHERE goal_effect.id = ${LearnerGoalRevisionTable.effect_id}
)`

const noCommittedSuccessor = sql`NOT EXISTS (
  SELECT 1
  FROM learner_goal_revision AS goal_successor
  JOIN learner_goal_effect AS successor_effect ON successor_effect.id = goal_successor.effect_id
  JOIN learner_goal_commit_seal AS successor_seal ON successor_seal.effect_id = successor_effect.id
  JOIN learning_command_receipt AS successor_receipt
    ON successor_receipt.id = successor_seal.receipt_id
  JOIN learning_command_invocation AS successor_invocation
    ON successor_invocation.part_id = successor_seal.invocation_part_id
      AND successor_invocation.receipt_id = successor_receipt.id
      AND successor_invocation.status = 'applied'
  WHERE goal_successor.predecessor_id = ${LearnerGoalRevisionTable.id}
)`

type StoredHead = typeof LearnerGoalRevisionTable.$inferSelect

type Meaning = Readonly<{
  outcome: string
  conditions: readonly string[]
  courseIDs: readonly Course.CourseID[]
  target: Target
  disposition: UpdateDisposition
}>

type PreparedCourse = Readonly<{
  courseID: Course.CourseID
  courseTitle: string
  admission:
    | Readonly<{ type: "new"; proof: Course.ActiveOwnerProof }>
    | Readonly<{ type: "carried"; predecessorRevisionID: RevisionID }>
}>

export type PreparedRevision = Readonly<{
  id: RevisionID
  goalID: GoalID
  version: number
  predecessorID?: RevisionID
  effectID: EffectID
  operationOrdinal: number
  revisionRole: "source" | "target"
  snapshot: SemanticSnapshot
  courses: readonly PreparedCourse[]
  disposition: UpdateDisposition
  revisionOrder: number
}>

type PreparedOperation = Readonly<{
  result: OperationResult
  revisions: readonly PreparedRevision[]
  newGoals: readonly Readonly<{ goalID: GoalID; timeCreated: number }>[]
}>

export type PreparedChangeSet = Readonly<{
  effectID: EffectID
  occurrenceID: Invocation["envelope"]["occurrenceID"]
  sourceOrder: number
  semanticFingerprint: string
  authorizationBasis: AuthorizationBasis
  command: Command
  operations: readonly PreparedOperation[]
  settlement: SettlementMetadata
  acknowledgementTitle: string
  acknowledgementBody: string
  revisionSequenceBefore: number
  consumedFrontiers: readonly Readonly<{ sequence: number; time: number }>[]
  timeFloor: number
}>

export type Preparation =
  | Readonly<{ type: "change_set"; value: PreparedChangeSet }>
  | Readonly<{
      type: "no_change"
      operations: readonly OperationResult[]
      acknowledgementTitle: string
      acknowledgementBody: string
    }>

export type SemanticResolution =
  | Readonly<{ type: "candidate" }>
  | Readonly<{ type: "already_applied"; effect: EffectRead }>
  | Readonly<{ type: "semantic_conflict"; effect: EffectRead }>

export type AppliedEffect = Readonly<{
  id: EffectID
  occurrenceID: Invocation["envelope"]["occurrenceID"]
  authorizationBasis: AuthorizationBasis
  semanticFingerprint: string
  operations: readonly OperationResult[]
  acknowledgementTitle: string
  acknowledgementBody: string
  frontierSequence: number
  timeCommitted: number
  commitOrder: number
  revisionSequence: number
}>

type PreparedConfirmationState = Readonly<{
  binding: string
  snapshot: string
}>

const preparedConfirmationStates = new WeakMap<PreparedConfirmation, PreparedConfirmationState>()

/**
 * Process-local proof that a confirmation snapshot was prepared for one exact
 * accepted invocation. Pending proposals remain non-durable; the database
 * receipt stores the snapshot only after the learner accepts it.
 */
export class PreparedConfirmation {
  private constructor() {}
}

export interface ReadInterface {
  readonly readCurrent: (goalID: GoalID, asOf: number) => Effect.Effect<GoalRead | undefined, IntegrityError>
  readonly readHistory: (
    goalID: GoalID,
    asOf: number,
    options?: PageOptions,
  ) => Effect.Effect<
    import("./learner-goal/schema").HistoryPage,
    IntegrityError | import("./learner-goal/schema").InvalidCursorError
  >
  readonly discover: (
    asOf: number,
    filter?: DiscoveryFilter,
    options?: PageOptions,
  ) => Effect.Effect<
    import("./learner-goal/schema").DiscoveryPage,
    IntegrityError | import("./learner-goal/schema").InvalidCursorError
  >
  readonly readEffect: (effectID: EffectID) => Effect.Effect<EffectRead | undefined, IntegrityError>
  readonly readRevision: (
    input: Omit<Parameters<typeof readLearningContextRevision>[1], "asOf" | "maxBytes" | "maxItems"> &
      Readonly<{ asOf: number; maxBytes?: number; maxItems?: number }>,
  ) => ReturnType<typeof readLearningContextRevision>
}

export class ReadService extends Context.Service<ReadService, ReadInterface>()("@repa/LearnerGoal/Read") {}

const readLayer = Layer.effect(
  ReadService,
  Effect.gen(function* () {
    const database = yield* Database.Service
    return {
      readCurrent: (goalID, asOf) => snapshot(database.db, (tx) => readCurrent(tx, goalID, asOf)),
      readHistory: (goalID, asOf, options) => snapshot(database.db, (tx) => readHistory(tx, goalID, asOf, options)),
      discover: (asOf, filter, options) => snapshot(database.db, (tx) => discover(tx, asOf, filter, options)),
      readEffect: (effectID) => snapshot(database.db, (tx) => readEffect(tx, effectID)),
      readRevision: (input) =>
        snapshot(database.db, (tx) =>
          readLearningContextRevision(tx, {
            ...input,
            maxBytes: input.maxBytes ?? MAX_LAZY_BYTES,
            maxItems: input.maxItems ?? MAX_LAZY_ITEMS,
          }),
        ),
    } satisfies ReadInterface
  }),
)

export const readNode = makeGlobalNode({ service: ReadService, layer: readLayer, deps: [Database.node] })

function snapshot<A, E>(database: DatabaseShape, read: (tx: Transaction) => Effect.Effect<A, E>) {
  return database.transaction(read).pipe(Effect.catchTag("SqlError", Effect.die))
}

export function canonicalizeCommand(command: Command): Command {
  return canonicalCommand(command)
}

export function commandFingerprint(command: Command, authorizationBasis: AuthorizationBasis) {
  return new Bun.CryptoHasher("sha256")
    .update(canonicalJson({ schemaVersion: SCHEMA_VERSION, authorizationBasis, command: canonicalCommand(command) }))
    .digest("hex")
}

export function resolveSemantic(
  tx: Transaction,
  input: {
    readonly occurrenceID: Invocation["envelope"]["occurrenceID"]
    readonly command: Command
    readonly authorizationBasis: AuthorizationBasis
  },
): Effect.Effect<SemanticResolution, IntegrityError> {
  return Effect.gen(function* () {
    yield* requireState(tx)
    const row = yield* tx
      .select({ id: LearnerGoalEffectTable.id, command: LearnerGoalEffectTable.command })
      .from(LearnerGoalEffectTable)
      .where(and(eq(LearnerGoalEffectTable.occurrence_id, input.occurrenceID), committedEffect))
      .get()
      .pipe(Effect.orDie)
    if (!row) return { type: "candidate" }
    const effect = yield* readEffect(tx, row.id)
    if (!effect) return yield* integrity(`Committed Goal effect ${row.id} is unreadable`)
    const expected = canonicalizeCommand(input.command)
    return effect.semanticFingerprint === commandFingerprint(expected, input.authorizationBasis) &&
      effect.authorizationBasis === input.authorizationBasis &&
      canonicalJson(row.command) === canonicalJson(expected)
      ? { type: "already_applied", effect }
      : { type: "semantic_conflict", effect }
  })
}

export function prepareConfirmation(
  tx: Transaction,
  input: AcceptedInvocation & { readonly settlement: SettlementMetadata },
): Effect.Effect<PreparedConfirmation, InvalidCommandError | IntegrityError> {
  return Effect.gen(function* () {
    yield* prepareChangeSet(tx, input)
    const goalIDs = new Set<GoalID>()
    input.command.operations.forEach((operation) => {
      if (operation.type !== "create") goalIDs.add(operation.goalID)
      if (operation.type === "replace" && operation.target.type === "existing") goalIDs.add(operation.target.goalID)
    })
    const goalBases = yield* Effect.forEach([...goalIDs].sort(), (goalID) =>
      Effect.gen(function* () {
        const head = yield* goalHead(tx, goalID)
        if (!head) return yield* invalid("stale")
        return {
          goalID,
          revisionID: head.id,
          version: head.version,
          outcome: head.outcome,
          disposition: head.disposition,
        } as const
      }),
    )
    const courseBases = yield* Effect.forEach(
      input.command.operations.flatMap((operation, operationOrdinal) => [
        { operationOrdinal, revisionRole: "source" as const, snapshot: operation.snapshot },
        ...(operation.type === "replace" && operation.target.type === "new"
          ? [{ operationOrdinal, revisionRole: "target" as const, snapshot: operation.target.snapshot }]
          : []),
      ]),
      (revision) => confirmationCourses(tx, revision),
    ).pipe(Effect.map((groups) => groups.flat()))
    return issuePreparedConfirmation(input, {
      schemaVersion: SCHEMA_VERSION,
      authorizationBasis: "learner_acceptance",
      semanticFingerprint: commandFingerprint(input.command, input.envelope.authorizationBasis),
      command: canonicalCommand(input.command),
      goalBases,
      courseBases,
    })
  })
}

export function preparePresentation(
  tx: Transaction,
  input: {
    readonly command: Command
    readonly authorizationBasis: AuthorizationBasis
    readonly asOf: number
  },
): Effect.Effect<ProposalPresentation, InvalidCommandError | IntegrityError> {
  return Effect.gen(function* () {
    const operations = yield* Effect.forEach(input.command.operations, (operation) =>
      proposalPresentationOperation(tx, operation, input.asOf),
    )
    return {
      authorizationBasis: input.authorizationBasis,
      semanticFingerprint: commandFingerprint(input.command, input.authorizationBasis),
      operations,
    }
  })
}

export function prepareResultPresentation(
  tx: Transaction,
  operations: readonly OperationResult[],
  asOf: number,
): Effect.Effect<readonly ResultPresentationOperation[], IntegrityError> {
  return Effect.forEach(operations, (operation) =>
    Effect.gen(function* () {
      const revision = yield* exactRevision(tx, operation.goalID, operation.revisionID, operation.version, asOf)
      const supersessionTarget =
        revision.disposition.type === "superseded" && operation.operation !== "replace"
          ? yield* exactRevision(
              tx,
              revision.disposition.targetGoalID,
              revision.disposition.targetRevisionID,
              undefined,
              asOf,
            ).pipe(
              Effect.map((target) => ({
                goalID: target.goalID,
                revisionID: target.id,
                version: target.version,
                meaning: presentationMeaningFromRevision(target),
              })),
            )
          : undefined
      const replacementTarget = operation.replacementTarget
        ? yield* exactRevision(
            tx,
            operation.replacementTarget.goalID,
            operation.replacementTarget.revisionID,
            operation.replacementTarget.version,
            asOf,
          ).pipe(
            Effect.map((target) => ({
              type: operation.replacementTarget!.type,
              goalID: operation.replacementTarget!.goalID,
              revisionID: operation.replacementTarget!.revisionID,
              version: operation.replacementTarget!.version,
              meaning: presentationMeaningFromRevision(target),
            })),
          )
        : undefined
      return {
        ordinal: operation.ordinal,
        operation: operation.operation,
        result: operation.result,
        goalID: operation.goalID,
        revisionID: operation.revisionID,
        version: operation.version,
        meaning: presentationMeaningFromRevision(revision),
        ...(supersessionTarget ? { supersessionTarget } : {}),
        ...(replacementTarget ? { replacementTarget } : {}),
      }
    }),
  )
}

function proposalPresentationOperation(
  tx: Transaction,
  operation: Operation,
  asOf: number,
): Effect.Effect<ProposalPresentationOperation, InvalidCommandError | IntegrityError> {
  return Effect.gen(function* () {
    if (operation.type === "create") {
      return {
        type: operation.type,
        resultIntent: "create_new_goal",
        meaning: yield* presentationMeaningFromSnapshot(tx, operation.snapshot, operation.disposition),
      }
    }
    const source = yield* exactRevision(tx, operation.goalID, operation.expectedHeadID, operation.expectedVersion, asOf)
    const sourcePresentation = {
      goalID: source.goalID,
      revisionID: source.id,
      version: source.version,
      meaning: presentationMeaningFromRevision(source),
    }
    if (operation.type === "update") {
      const supersessionTarget =
        operation.disposition.type === "superseded"
          ? yield* exactRevision(
              tx,
              operation.disposition.targetGoalID,
              operation.disposition.targetRevisionID,
              undefined,
              asOf,
            ).pipe(
              Effect.map((target) => ({
                goalID: target.goalID,
                revisionID: target.id,
                version: target.version,
                meaning: presentationMeaningFromRevision(target),
              })),
            )
          : undefined
      return {
        type: operation.type,
        resultIntent:
          operation.disposition.type === "superseded" ? "supersede_with_existing_goal" : "update_existing_goal",
        goalID: operation.goalID,
        expectedHeadID: operation.expectedHeadID,
        expectedVersion: operation.expectedVersion,
        source: sourcePresentation,
        meaning: yield* presentationMeaningFromSnapshot(tx, operation.snapshot, operation.disposition.type),
        ...(supersessionTarget ? { supersessionTarget } : {}),
      }
    }
    const target = operation.target
    const replacementTarget =
      target.type === "new"
        ? {
            type: "new" as const,
            meaning: yield* presentationMeaningFromSnapshot(tx, target.snapshot, target.disposition),
          }
        : yield* exactRevision(tx, target.goalID, target.revisionID, target.version, asOf).pipe(
            Effect.map((revision) => ({
              type: "existing" as const,
              goalID: target.goalID,
              revisionID: target.revisionID,
              version: target.version,
              meaning: presentationMeaningFromRevision(revision),
            })),
          )
    return {
      type: operation.type,
      resultIntent: target.type === "new" ? "supersede_with_new_goal" : "supersede_with_existing_goal",
      goalID: operation.goalID,
      expectedHeadID: operation.expectedHeadID,
      expectedVersion: operation.expectedVersion,
      source: sourcePresentation,
      meaning: yield* presentationMeaningFromSnapshot(tx, operation.snapshot, "superseded"),
      replacementTarget,
    }
  })
}

function presentationMeaningFromSnapshot(
  tx: Transaction,
  snapshot: SemanticSnapshot,
  disposition: "active" | "achieved" | "abandoned" | "superseded",
): Effect.Effect<PresentationMeaning, InvalidCommandError> {
  return Effect.gen(function* () {
    const scope =
      snapshot.scope.type === "learner_home"
        ? ({ type: "learner_home" } as const)
        : {
            type: "courses" as const,
            courses: yield* Effect.forEach(snapshot.scope.courses, (membership) =>
              Effect.gen(function* () {
                const availability = yield* Course.inspectPreferenceTarget(tx, membership.courseID)
                if (membership.basis.type === "new") {
                  if (availability.status !== "available") return yield* invalid("inactive")
                  if (availability.stateVersion !== membership.basis.expectedCourseVersion) {
                    return yield* invalid("stale")
                  }
                  return {
                    courseID: membership.courseID,
                    courseTitle: availability.title,
                    basis: membership.basis,
                    availability: { state: "available" as const, title: availability.title },
                  }
                }
                const stored = yield* storedCourse(tx, membership.basis.predecessorRevisionID, membership.courseID)
                if (!stored) return yield* invalid("validation_error")
                return {
                  courseID: membership.courseID,
                  courseTitle: stored.course_title,
                  basis: membership.basis,
                  availability:
                    availability.status === "available"
                      ? { state: "available" as const, title: availability.title }
                      : ({
                          state: "unavailable" as const,
                          cause: availability.cause,
                          ...("title" in availability ? { title: availability.title } : {}),
                        } as const),
                }
              }),
            ),
          }
    return {
      outcome: snapshot.outcome,
      conditions: snapshot.conditions,
      scope,
      target: snapshot.target,
      disposition,
      fieldBases: snapshot.fieldBases,
    }
  })
}

function presentationMeaningFromRevision(revision: Revision): PresentationMeaning {
  if (revision.schemaVersion !== 1) {
    throw new IntegrityError({ detail: `Current Goal proposal cannot project V2 revision ${revision.id} as V1` })
  }
  return {
    outcome: revision.outcome,
    conditions: revision.conditions,
    scope:
      revision.scope.type === "learner_home"
        ? { type: "learner_home" }
        : {
            type: "courses",
            courses: revision.scope.courses.map((course) => ({
              courseID: course.courseID,
              courseTitle: course.courseTitle,
              basis:
                course.admission.type === "new"
                  ? { type: "new", expectedCourseVersion: course.admission.courseVersion }
                  : course.admission,
              availability: course.availability,
            })),
          },
    target: revision.target,
    disposition: revision.disposition.type,
    fieldBases: revision.fieldBases,
  }
}

function exactRevision(
  tx: Transaction,
  goalID: GoalID,
  revisionID: RevisionID,
  version: number | undefined,
  asOf: number,
): Effect.Effect<Revision, IntegrityError> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(LearnerGoalRevisionTable)
      .where(
        and(
          eq(LearnerGoalRevisionTable.goal_id, goalID),
          eq(LearnerGoalRevisionTable.id, revisionID),
          committedRevision,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!row || (version !== undefined && row.version !== version)) {
      return yield* integrity("Goal presentation revision is unavailable or stale")
    }
    return yield* revisionRead(tx, row, asOf)
  })
}

export function preparedConfirmationSnapshot(prepared: PreparedConfirmation): ConfirmationSnapshot | undefined {
  const state = preparedConfirmationStates.get(prepared)
  if (!state) return undefined
  return freezeJson(JSON.parse(state.snapshot) as ConfirmationSnapshot)
}

export function acceptedPreparedConfirmation(
  prepared: PreparedConfirmation,
  input: AcceptedInvocation,
  displayed: ConfirmationSnapshot,
): ConfirmationSnapshot | undefined {
  const state = preparedConfirmationStates.get(prepared)
  if (!state) return undefined
  const bindingBefore = preparedConfirmationBinding(input)
  const displayedSnapshot = JSON.stringify(displayed)
  const bindingAfter = preparedConfirmationBinding(input)
  if (state.binding !== bindingBefore || state.binding !== bindingAfter || state.snapshot !== displayedSnapshot) {
    return undefined
  }
  return freezeJson(JSON.parse(state.snapshot) as ConfirmationSnapshot)
}

function issuePreparedConfirmation(input: AcceptedInvocation, snapshot: ConfirmationSnapshot) {
  const prepared = Object.freeze(Object.create(PreparedConfirmation.prototype)) as PreparedConfirmation
  preparedConfirmationStates.set(prepared, {
    binding: preparedConfirmationBinding(input),
    snapshot: JSON.stringify(snapshot),
  })
  return prepared
}

function preparedConfirmationBinding(input: AcceptedInvocation) {
  return canonicalJson({
    envelope: input.envelope,
    permissionRequestID: input.permissionRequestID,
    command: canonicalCommand(input.command),
  })
}

function freezeJson<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value
  Object.values(value).forEach(freezeJson)
  return Object.freeze(value) as T
}

function confirmationCourses(
  tx: Transaction,
  input: {
    readonly operationOrdinal: number
    readonly revisionRole: "source" | "target"
    readonly snapshot: SemanticSnapshot
  },
): Effect.Effect<readonly ConfirmationCourse[], InvalidCommandError | IntegrityError> {
  if (input.snapshot.scope.type === "learner_home") return Effect.succeed([])
  return Effect.forEach(input.snapshot.scope.courses, (membership) =>
    Effect.gen(function* () {
      if (membership.basis.type === "new") {
        const proof = yield* prepareActiveCourseProof(tx, {
          courseID: membership.courseID,
          expectedVersion: membership.basis.expectedCourseVersion,
        })
        return {
          operationOrdinal: input.operationOrdinal,
          revisionRole: input.revisionRole,
          courseID: membership.courseID,
          courseTitle: proof.receipt.courseTitle,
          admission: {
            type: "new",
            courseVersion: proof.receipt.courseVersion,
            courseTimeUpdated: proof.receipt.timeUpdated,
          },
          availability: {
            state: "available",
            title: proof.receipt.courseTitle,
            courseVersion: proof.receipt.courseVersion,
            courseTimeUpdated: proof.receipt.timeUpdated,
          },
        } satisfies ConfirmationCourse
      }
      const stored = yield* storedCourse(tx, membership.basis.predecessorRevisionID, membership.courseID)
      if (!stored) return yield* invalid("validation_error")
      const availability = yield* Course.inspectPreferenceTarget(tx, membership.courseID)
      return {
        operationOrdinal: input.operationOrdinal,
        revisionRole: input.revisionRole,
        courseID: membership.courseID,
        courseTitle: stored.course_title,
        admission: { type: "carried", predecessorRevisionID: membership.basis.predecessorRevisionID },
        availability:
          availability.status === "available"
            ? {
                state: "available",
                title: availability.title,
                courseVersion: availability.stateVersion,
                courseTimeUpdated: availability.timeUpdated,
              }
            : availability.cause === "course_withdrawn"
              ? {
                  state: "unavailable",
                  cause: availability.cause,
                  title: availability.title,
                  courseVersion: availability.stateVersion,
                  courseTimeUpdated: availability.timeUpdated,
                }
              : {
                  state: "unavailable",
                  cause: availability.cause,
                },
      } satisfies ConfirmationCourse
    }),
  )
}

export function prepareChangeSet(
  tx: Transaction,
  input: Invocation & { readonly settlement: SettlementMetadata },
): Effect.Effect<Preparation, InvalidCommandError | IntegrityError> {
  return Effect.gen(function* () {
    const state = yield* requireState(tx)
    const occurrence = yield* requireEligibleOccurrence(tx, input.envelope.occurrenceID)
    yield* Occurrence.requireAvailableSource(tx, {
      occurrenceID: occurrence.id,
      sessionID: occurrence.origin_session_id,
      messageID: occurrence.origin_message_id,
    }).pipe(Effect.mapError(() => new InvalidCommandError({ reason: "source_unavailable" })))
    const sourceText = normalizeText(yield* learnerText(tx, occurrence.origin_session_id, occurrence.origin_message_id))
    const command = canonicalCommand(input.command)
    yield* validateCommand(command, input.envelope.authorizationBasis, occurrence, sourceText)

    const currentHeads = yield* goalHeads(tx)
    const sharedFrontier = yield* LearningFrontier.read(tx)
    const initialHeads = new Map(currentHeads.map((head) => [head.goal_id, head]))
    if (input.envelope.authorizationBasis === "learner_request") {
      yield* validateDirectEligibility(tx, command, sourceText, initialHeads)
    }
    const projectedHeads = new Map(initialHeads)
    const consumed = new Set<GoalID>()
    const preparedOperations: PreparedOperation[] = []
    const consumedFrontiers: { sequence: number; time: number }[] = [sharedFrontier]
    const proofTimes: number[] = []
    let nextRevisionOrder = state.revisionSequence
    const effectID = createEffectID()

    for (const [ordinal, operation] of command.operations.entries()) {
      const prepared = yield* prepareOperation(tx, {
        operation,
        ordinal,
        effectID,
        authorizationBasis: input.envelope.authorizationBasis,
        sourceText,
        occurrenceID: occurrence.id,
        projectedHeads,
        initialHeads,
        consumed,
        nextRevisionOrder,
        timeCreated: input.settlement.time,
      })
      nextRevisionOrder += prepared.revisions.length
      prepared.revisions.forEach((revision) => projectedHeads.set(revision.goalID, preparedHead(revision, occurrence)))
      prepared.revisions.forEach((revision) =>
        revision.courses.forEach((course) => {
          if (course.admission.type === "new") proofTimes.push(course.admission.proof.receipt.timeUpdated)
        }),
      )
      const existing = initialHeads.get(prepared.result.goalID)
      if (existing) consumedFrontiers.push({ sequence: existing.frontier_sequence, time: existing.time_committed })
      if (prepared.result.replacementTarget?.type === "existing") {
        const target = initialHeads.get(prepared.result.replacementTarget.goalID)
        if (target) consumedFrontiers.push({ sequence: target.frontier_sequence, time: target.time_committed })
      }
      preparedOperations.push(prepared)
    }

    yield* validateProjectedRelations(tx, projectedHeads, preparedOperations)
    const results = preparedOperations.map((operation) => operation.result)
    const acknowledgementResult = renderAcknowledgement(results)
    if (results.every((result) => result.result === "no_change")) {
      return {
        type: "no_change",
        operations: results,
        acknowledgementTitle: acknowledgementResult.title,
        acknowledgementBody: acknowledgementResult.body,
      }
    }
    const timeFloor = Math.max(
      occurrence.time_admitted,
      ...consumedFrontiers.map((frontier) => frontier.time),
      ...proofTimes,
    )
    if (input.settlement.time < timeFloor) return yield* invalid("stale")
    return {
      type: "change_set",
      value: {
        effectID,
        occurrenceID: occurrence.id,
        sourceOrder: occurrence.source_order,
        semanticFingerprint: commandFingerprint(command, input.envelope.authorizationBasis),
        authorizationBasis: input.envelope.authorizationBasis,
        command,
        operations: preparedOperations,
        settlement: input.settlement,
        acknowledgementTitle: acknowledgementResult.title,
        acknowledgementBody: acknowledgementResult.body,
        revisionSequenceBefore: state.revisionSequence,
        consumedFrontiers,
        timeFloor,
      },
    }
  })
}

type PrepareOperationInput = Readonly<{
  operation: Operation
  ordinal: number
  effectID: EffectID
  authorizationBasis: AuthorizationBasis
  sourceText: string
  occurrenceID: Invocation["envelope"]["occurrenceID"]
  projectedHeads: Map<GoalID, StoredHead>
  initialHeads: Map<GoalID, StoredHead>
  consumed: Set<GoalID>
  nextRevisionOrder: number
  timeCreated: number
}>

function prepareOperation(
  tx: Transaction,
  input: PrepareOperationInput,
): Effect.Effect<PreparedOperation, InvalidCommandError | IntegrityError> {
  return Effect.gen(function* () {
    if (input.operation.type === "create") {
      yield* validateInitialSnapshot(input.operation.snapshot, input.operation.disposition, input.authorizationBasis)
      const goalID = createGoalID()
      const revision = yield* prepareRevision(tx, {
        id: createRevisionID(),
        goalID,
        version: 1,
        effectID: input.effectID,
        operationOrdinal: input.ordinal,
        revisionRole: "source",
        snapshot: input.operation.snapshot,
        disposition: { type: input.operation.disposition },
        revisionOrder: input.nextRevisionOrder + 1,
      })
      return {
        result: operationResult(input.ordinal, "create", "changed", revision, input.operation.snapshot),
        revisions: [revision],
        newGoals: [{ goalID, timeCreated: input.timeCreated }],
      }
    }

    const head = input.projectedHeads.get(input.operation.goalID)
    const initialHead = input.initialHeads.get(input.operation.goalID)
    if (
      !head ||
      !initialHead ||
      head.id !== input.operation.expectedHeadID ||
      head.version !== input.operation.expectedVersion ||
      initialHead.id !== input.operation.expectedHeadID ||
      input.consumed.has(input.operation.goalID)
    ) {
      return yield* invalid("stale")
    }
    input.consumed.add(input.operation.goalID)
    const previous = yield* meaning(tx, head)
    consumedSnapshot(input, head)

    if (input.operation.type === "update") {
      yield* validateUpdateDisposition(previous.disposition, input.operation.disposition)
      yield* validateSuccessorSnapshot(
        input.operation.snapshot,
        input.operation.disposition,
        head.id,
        previous,
        input.authorizationBasis,
      )
      const proposed = meaningFromInput(input.operation.snapshot, input.operation.disposition)
      const courses = yield* prepareCourses(tx, input.operation.snapshot, head.id)
      if (equalMeaning(previous, proposed)) {
        return {
          result: operationResult(input.ordinal, "update", "no_change", head, input.operation.snapshot),
          revisions: [],
          newGoals: [],
        }
      }
      const revision = yield* prepareRevision(
        tx,
        {
          id: createRevisionID(),
          goalID: head.goal_id,
          version: head.version + 1,
          predecessorID: head.id,
          effectID: input.effectID,
          operationOrdinal: input.ordinal,
          revisionRole: "source",
          snapshot: input.operation.snapshot,
          disposition: input.operation.disposition,
          revisionOrder: input.nextRevisionOrder + 1,
        },
        courses,
      )
      return {
        result: operationResult(input.ordinal, "update", "changed", revision, input.operation.snapshot),
        revisions: [revision],
        newGoals: [],
      }
    }

    const target = yield* prepareReplacementTarget(tx, input, head)
    const sourceDisposition = {
      type: "superseded",
      targetGoalID: target.goalID,
      targetRevisionID: target.revisionID,
    } as const
    yield* validateSuccessorSnapshot(
      input.operation.snapshot,
      sourceDisposition,
      head.id,
      previous,
      input.authorizationBasis,
      true,
    )
    const source = yield* prepareRevision(tx, {
      id: createRevisionID(),
      goalID: head.goal_id,
      version: head.version + 1,
      predecessorID: head.id,
      effectID: input.effectID,
      operationOrdinal: input.ordinal,
      revisionRole: "source",
      snapshot: input.operation.snapshot,
      disposition: sourceDisposition,
      revisionOrder: input.nextRevisionOrder + 1,
    })
    const result = {
      ...operationResult(input.ordinal, "replace", "changed", source, input.operation.snapshot),
      replacementTarget: {
        type: input.operation.target.type,
        goalID: target.goalID,
        revisionID: target.revisionID,
        version: target.version,
      },
    } satisfies OperationResult
    return {
      result,
      revisions: target.revision ? [source, target.revision] : [source],
      newGoals: target.newGoal ? [target.newGoal] : [],
    }
  })
}

function consumedSnapshot(input: PrepareOperationInput, head: StoredHead) {
  input.projectedHeads.set(head.goal_id, head)
}

function prepareReplacementTarget(tx: Transaction, input: PrepareOperationInput, source: StoredHead) {
  return Effect.gen(function* () {
    if (input.operation.type !== "replace") return yield* invalid("validation_error")
    if (input.operation.target.type === "existing") {
      const target = input.initialHeads.get(input.operation.target.goalID)
      if (
        !target ||
        target.goal_id === source.goal_id ||
        target.id !== input.operation.target.revisionID ||
        target.version !== input.operation.target.version
      ) {
        return yield* invalid("stale")
      }
      return {
        goalID: target.goal_id,
        revisionID: target.id,
        version: target.version,
        revision: undefined,
        newGoal: undefined,
      }
    }
    yield* validateInitialSnapshot(
      input.operation.target.snapshot,
      input.operation.target.disposition,
      input.authorizationBasis,
    )
    const goalID = createGoalID()
    const revision = yield* prepareRevision(tx, {
      id: createRevisionID(),
      goalID,
      version: 1,
      effectID: input.effectID,
      operationOrdinal: input.ordinal,
      revisionRole: "target",
      snapshot: input.operation.target.snapshot,
      disposition: { type: input.operation.target.disposition },
      revisionOrder: input.nextRevisionOrder + 2,
    })
    return {
      goalID,
      revisionID: revision.id,
      version: 1,
      revision,
      newGoal: { goalID, timeCreated: input.timeCreated },
    }
  })
}

function prepareRevision(
  tx: Transaction,
  input: Omit<PreparedRevision, "courses">,
  courses?: PreparedRevision["courses"],
): Effect.Effect<PreparedRevision, InvalidCommandError> {
  return Effect.gen(function* () {
    if (courses) return { ...input, courses }
    return { ...input, courses: yield* prepareCourses(tx, input.snapshot, input.predecessorID) }
  })
}

function prepareCourses(tx: Transaction, snapshot: SemanticSnapshot, predecessorID?: RevisionID) {
  return Effect.gen(function* () {
    if (snapshot.scope.type === "learner_home") return []
    return yield* Effect.forEach(snapshot.scope.courses, (membership) =>
      Effect.gen(function* () {
        if (membership.basis.type === "new") {
          const proof = yield* prepareActiveCourseProof(tx, {
            courseID: membership.courseID,
            expectedVersion: membership.basis.expectedCourseVersion,
          })
          if (predecessorID && (yield* storedCourse(tx, predecessorID, membership.courseID))) {
            return yield* invalid("validation_error")
          }
          return {
            courseID: membership.courseID,
            courseTitle: proof.receipt.courseTitle,
            admission: { type: "new", proof },
          } as const
        }
        if (!predecessorID || membership.basis.predecessorRevisionID !== predecessorID) {
          return yield* invalid("validation_error")
        }
        const predecessor = yield* storedCourse(tx, predecessorID, membership.courseID)
        if (!predecessor) return yield* invalid("validation_error")
        return {
          courseID: membership.courseID,
          courseTitle: predecessor.course_title,
          admission: { type: "carried", predecessorRevisionID: predecessorID },
        } as const
      }),
    )
  })
}

function validateInitialSnapshot(
  snapshot: SemanticSnapshot,
  disposition: NonSupersededDisposition,
  authorizationBasis: AuthorizationBasis,
) {
  return Effect.gen(function* () {
    yield* validateFieldBasisShapes(snapshot.fieldBases, authorizationBasis)
    if (Object.values(snapshot.fieldBases).some((basis) => basis.type === "carried")) {
      return yield* invalid("dependency_incomplete")
    }
    if (disposition !== "active" && snapshot.fieldBases.disposition.type === "carried") {
      return yield* invalid("dependency_incomplete")
    }
  })
}

function validateSuccessorSnapshot(
  snapshot: SemanticSnapshot,
  disposition: UpdateDisposition,
  predecessorID: RevisionID,
  previous: Meaning,
  authorizationBasis: AuthorizationBasis,
  replacement = false,
) {
  return Effect.gen(function* () {
    yield* validateFieldBasisShapes(snapshot.fieldBases, authorizationBasis)
    const proposed = meaningFromInput(snapshot, disposition)
    const changed = semanticChanges(previous, proposed)
    const fields: FieldName[] = ["outcome", "conditions", "scope", "target", "disposition"]
    for (const field of fields) {
      const basis = snapshot.fieldBases[field]
      if (basis.type !== "carried") continue
      if (basis.predecessorRevisionID !== predecessorID || !equalField(field, previous, proposed)) {
        return yield* invalid("dependency_incomplete")
      }
    }
    if (replacement && snapshot.fieldBases.disposition.type === "carried") {
      return yield* invalid("dependency_incomplete")
    }
    if (changed.has("outcome")) {
      for (const field of ["conditions", "scope", "target"] as const) {
        if (snapshot.fieldBases[field].type === "carried") return yield* invalid("dependency_incomplete")
      }
      if (proposed.disposition.type !== "active" && snapshot.fieldBases.disposition.type === "carried") {
        return yield* invalid("dependency_incomplete")
      }
    }
    if (changed.has("scope")) {
      for (const field of ["outcome", "conditions", "target"] as const) {
        if (snapshot.fieldBases[field].type === "carried") return yield* invalid("dependency_incomplete")
      }
    }
    const changedSemantic = ["outcome", "conditions", "scope", "target"].filter((field) =>
      changed.has(field as FieldName),
    )
    if (
      changedSemantic.length > 0 &&
      proposed.disposition.type !== "active" &&
      snapshot.fieldBases.disposition.type === "carried"
    ) {
      return yield* invalid("dependency_incomplete")
    }
    if (
      authorizationBasis === "learner_request" &&
      changedSemantic.length > 1 &&
      (["outcome", "conditions", "scope", "target"] as const).some(
        (field) => !changed.has(field) && snapshot.fieldBases[field].type === "carried",
      )
    ) {
      return yield* invalid("dependency_incomplete")
    }
  })
}

function validateUpdateDisposition(previous: UpdateDisposition, proposed: UpdateDisposition) {
  if (previous.type !== "superseded" && proposed.type === "superseded") return invalid("relation_conflict")
  if (
    previous.type === "superseded" &&
    proposed.type === "superseded" &&
    (previous.targetGoalID !== proposed.targetGoalID || previous.targetRevisionID !== proposed.targetRevisionID)
  ) {
    return invalid("relation_conflict")
  }
  return Effect.void
}

function validateFieldBasisShapes(fieldBases: FieldBases, authorizationBasis: AuthorizationBasis) {
  const fields: FieldName[] = ["outcome", "conditions", "scope", "target", "disposition"]
  if (Object.keys(fieldBases).length !== fields.length || fields.some((field) => !fieldBases[field])) {
    return invalid("validation_error")
  }
  if (authorizationBasis === "learner_request" && fields.some((field) => fieldBases[field].type === "accepted")) {
    return invalid("validation_error")
  }
  return Effect.void
}

function validateCommand(
  command: Command,
  authorizationBasis: AuthorizationBasis,
  occurrence: typeof AdmittedLearnerOccurrenceTable.$inferSelect & { source_order: number },
  sourceText: string,
) {
  return Effect.gen(function* () {
    if (!closedCommand(command)) return yield* invalid("validation_error")
    if (command.operations.length < 1 || command.operations.length > MAX_OPERATIONS) {
      return yield* invalid("capacity_exceeded")
    }
    if (bytes(canonicalJson(command)) > MAX_AGGREGATE_BYTES) return yield* invalid("capacity_exceeded")
    for (const operation of command.operations) {
      const snapshots =
        operation.type === "replace" && operation.target.type === "new"
          ? [operation.snapshot, operation.target.snapshot]
          : [operation.snapshot]
      for (const snapshot of snapshots) {
        yield* validateSnapshot(snapshot, authorizationBasis, occurrence, sourceText)
      }
      if (
        operation.type !== "create" &&
        (!Number.isSafeInteger(operation.expectedVersion) || operation.expectedVersion < 1)
      ) {
        return yield* invalid("validation_error")
      }
      if (
        operation.type === "replace" &&
        operation.target.type === "existing" &&
        (!Number.isSafeInteger(operation.target.version) || operation.target.version < 1)
      ) {
        return yield* invalid("validation_error")
      }
    }
  })
}

function closedCommand(command: unknown): command is Command {
  if (!isRecord(command) || !hasKeys(command, ["operations"]) || !Array.isArray(command.operations)) return false
  return command.operations.every((operation) => {
    if (!isRecord(operation) || typeof operation.type !== "string" || !closedSnapshot(operation.snapshot)) return false
    if (operation.type === "create") {
      return (
        hasKeys(operation, ["type", "snapshot", "disposition"]) &&
        ["active", "achieved", "abandoned"].includes(String(operation.disposition))
      )
    }
    if (operation.type === "update") {
      if (!isRecord(operation.disposition)) return false
      return (
        hasKeys(operation, ["type", "goalID", "expectedHeadID", "expectedVersion", "snapshot", "disposition"]) &&
        (operation.disposition.type === "superseded"
          ? hasKeys(operation.disposition, ["type", "targetGoalID", "targetRevisionID"])
          : hasKeys(operation.disposition, ["type"]))
      )
    }
    if (operation.type !== "replace" || !isRecord(operation.target)) return false
    return (
      hasKeys(operation, ["type", "goalID", "expectedHeadID", "expectedVersion", "snapshot", "target"]) &&
      (operation.target.type === "existing"
        ? hasKeys(operation.target, ["type", "goalID", "revisionID", "version"])
        : hasKeys(operation.target, ["type", "snapshot", "disposition"]) && closedSnapshot(operation.target.snapshot))
    )
  })
}

function closedSnapshot(snapshot: unknown): snapshot is SemanticSnapshot {
  if (
    !isRecord(snapshot) ||
    !hasKeys(snapshot, ["outcome", "conditions", "scope", "target", "fieldBases"]) ||
    typeof snapshot.outcome !== "string" ||
    !Array.isArray(snapshot.conditions) ||
    snapshot.conditions.some((condition) => typeof condition !== "string") ||
    !isRecord(snapshot.scope) ||
    !isRecord(snapshot.target) ||
    !isRecord(snapshot.fieldBases)
  )
    return false
  if (!hasKeys(snapshot.fieldBases, ["outcome", "conditions", "scope", "target", "disposition"])) return false
  if (
    Object.values(snapshot.fieldBases).some((basis) =>
      !isRecord(basis)
        ? true
        : basis.type === "authored"
          ? !hasKeys(basis, ["type", "sourceExcerpt"])
          : basis.type === "accepted"
            ? !hasKeys(basis, ["type"])
            : basis.type === "carried"
              ? !hasKeys(basis, ["type", "predecessorRevisionID"])
              : true,
    )
  ) {
    return false
  }
  if (
    snapshot.scope.type === "learner_home"
      ? !hasKeys(snapshot.scope, ["type"])
      : !hasKeys(snapshot.scope, ["type", "courses"]) ||
        !Array.isArray(snapshot.scope.courses) ||
        snapshot.scope.courses.some(
          (membership) =>
            !isRecord(membership) ||
            !hasKeys(membership, ["courseID", "basis"]) ||
            !isRecord(membership.basis) ||
            (membership.basis.type === "new"
              ? !hasKeys(membership.basis, ["type", "expectedCourseVersion"])
              : membership.basis.type === "carried"
                ? !hasKeys(membership.basis, ["type", "predecessorRevisionID"])
                : true),
        )
  ) {
    return false
  }
  if (snapshot.target.type === "absent") return hasKeys(snapshot.target, ["type"])
  if (snapshot.target.type === "local_date") {
    return hasKeys(snapshot.target, ["type", "date", "timeZone", "sourceExpression", "normalizationBasis"])
  }
  return hasKeys(snapshot.target, [
    "type",
    "instant",
    "sourceExpression",
    "normalized",
    "utcOffsetMinutes",
    "normalizationBasis",
  ])
}

function hasKeys(value: object, keys: readonly string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function closedConfirmation(value: unknown): value is ConfirmationSnapshot {
  if (
    !isRecord(value) ||
    !hasKeys(value, [
      "schemaVersion",
      "authorizationBasis",
      "semanticFingerprint",
      "command",
      "goalBases",
      "courseBases",
    ]) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.authorizationBasis !== "learner_acceptance" ||
    typeof value.semanticFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.semanticFingerprint) ||
    !closedCommand(value.command) ||
    !Array.isArray(value.goalBases) ||
    !Array.isArray(value.courseBases)
  )
    return false
  const goals = value.goalBases.every(
    (basis) =>
      isRecord(basis) &&
      hasKeys(basis, ["goalID", "revisionID", "version", "outcome", "disposition"]) &&
      validGoalID(basis.goalID) &&
      validRevisionID(basis.revisionID) &&
      Number.isSafeInteger(basis.version) &&
      Number(basis.version) >= 1 &&
      typeof basis.outcome === "string" &&
      ["active", "achieved", "abandoned", "superseded"].includes(String(basis.disposition)),
  )
  if (!goals || new Set(value.goalBases.map((basis) => basis.goalID)).size !== value.goalBases.length) return false
  const courses = value.courseBases.every((basis) => {
    if (
      !isRecord(basis) ||
      !hasKeys(basis, ["operationOrdinal", "revisionRole", "courseID", "courseTitle", "admission", "availability"]) ||
      !Number.isSafeInteger(basis.operationOrdinal) ||
      Number(basis.operationOrdinal) < 0 ||
      Number(basis.operationOrdinal) >= MAX_OPERATIONS ||
      !["source", "target"].includes(String(basis.revisionRole)) ||
      typeof basis.courseID !== "string" ||
      typeof basis.courseTitle !== "string" ||
      !isRecord(basis.admission) ||
      !isRecord(basis.availability)
    )
      return false
    const admission =
      basis.admission.type === "new"
        ? hasKeys(basis.admission, ["type", "courseVersion", "courseTimeUpdated"]) &&
          Number.isSafeInteger(basis.admission.courseVersion) &&
          Number(basis.admission.courseVersion) >= 0 &&
          Number.isSafeInteger(basis.admission.courseTimeUpdated) &&
          Number(basis.admission.courseTimeUpdated) >= 0
        : basis.admission.type === "carried" &&
          hasKeys(basis.admission, ["type", "predecessorRevisionID"]) &&
          validRevisionID(basis.admission.predecessorRevisionID)
    const availability =
      basis.availability.state === "available"
        ? hasKeys(basis.availability, ["state", "title", "courseVersion", "courseTimeUpdated"]) &&
          typeof basis.availability.title === "string" &&
          Number.isSafeInteger(basis.availability.courseVersion) &&
          Number(basis.availability.courseVersion) >= 0 &&
          Number.isSafeInteger(basis.availability.courseTimeUpdated) &&
          Number(basis.availability.courseTimeUpdated) >= 0
        : basis.availability.state === "unavailable" && basis.availability.cause === "course_not_found"
          ? hasKeys(basis.availability, ["state", "cause"])
          : basis.availability.state === "unavailable" &&
            basis.availability.cause === "course_withdrawn" &&
            hasKeys(basis.availability, ["state", "cause", "title", "courseVersion", "courseTimeUpdated"]) &&
            typeof basis.availability.title === "string" &&
            Number.isSafeInteger(basis.availability.courseVersion) &&
            Number(basis.availability.courseVersion) >= 0 &&
            Number.isSafeInteger(basis.availability.courseTimeUpdated) &&
            Number(basis.availability.courseTimeUpdated) >= 0
    return admission && availability
  })
  const courseKeys = value.courseBases.map(
    (basis) => `${basis.operationOrdinal}:${basis.revisionRole}:${basis.courseID}`,
  )
  return courses && new Set(courseKeys).size === courseKeys.length
}

function validGoalID(value: unknown): value is GoalID {
  return typeof value === "string" && /^gol_[0-9A-Za-z]{26}$/.test(value)
}

function validRevisionID(value: unknown): value is RevisionID {
  return typeof value === "string" && /^glr_[0-9A-Za-z]{26}$/.test(value)
}

function validEffectID(value: unknown): value is EffectID {
  return typeof value === "string" && /^gle_[0-9A-Za-z]{26}$/.test(value)
}

function validateDirectEligibility(
  tx: Transaction,
  command: Command,
  sourceText: string,
  initialHeads: Map<GoalID, StoredHead>,
) {
  return Effect.gen(function* () {
    const directives = directGoalDirectives(sourceText)
    if (
      directCadence(sourceText) ||
      directProhibitedInitiation(sourceText) ||
      !directives ||
      directives.length !== command.operations.length
    ) {
      return yield* invalid("dependency_incomplete")
    }
    for (const [ordinal, operation] of command.operations.entries()) {
      const directive = directives[ordinal]!
      yield* validateDirectDirectiveBinding(operation, directive.text)
      if (operation.type === "create") {
        if (!directive.goalInitiation) return yield* invalid("dependency_incomplete")
        yield* validateDirectInitialDefaults(operation.snapshot, operation.disposition, directive.text)
        yield* validateDirectConditions(operation.snapshot, directive.text)
        yield* validateDirectCourses(tx, operation.snapshot, directive.text)
        yield* validateDirectTarget(operation.snapshot, directive.text)
        if (operation.disposition !== "active") {
          yield* requireDirectLifecycle(
            operation.snapshot.fieldBases.disposition,
            operation.disposition,
            directive.text,
            operation.snapshot.outcome,
          )
        }
        continue
      }

      const head = initialHeads.get(operation.goalID)
      if (!head || head.id !== operation.expectedHeadID || head.version !== operation.expectedVersion) continue
      if (!directive.text.includes(operation.goalID)) return yield* invalid("dependency_incomplete")
      const previous = yield* meaning(tx, head)
      yield* validateDirectConditions(operation.snapshot, directive.text, head.id)
      yield* validateDirectCourses(tx, operation.snapshot, directive.text, head.id, previous.courseIDs)
      yield* validateDirectTarget(operation.snapshot, directive.text, previous.target)

      if (operation.type === "replace") {
        const targetID = operation.target.type === "existing" ? operation.target.goalID : undefined
        yield* requireDirectReplacement(
          operation.snapshot.fieldBases.disposition,
          directive.text,
          operation.goalID,
          targetID,
        )
        if (operation.target.type === "new") {
          yield* validateDirectInitialDefaults(operation.target.snapshot, operation.target.disposition, directive.text)
          yield* validateDirectConditions(operation.target.snapshot, directive.text)
          yield* validateDirectCourses(tx, operation.target.snapshot, directive.text)
          yield* validateDirectTarget(operation.target.snapshot, directive.text)
          if (operation.target.disposition !== "active") {
            yield* requireDirectLifecycle(
              operation.target.snapshot.fieldBases.disposition,
              operation.target.disposition,
              directive.text,
              operation.target.snapshot.outcome,
            )
          }
        }
        continue
      }

      if (operation.disposition.type === "superseded") {
        yield* requireDirectReplacement(
          operation.snapshot.fieldBases.disposition,
          directive.text,
          operation.goalID,
          operation.disposition.targetGoalID,
        )
        continue
      }
      const lifecycle =
        previous.disposition.type === "superseded" ||
        previous.disposition.type !== operation.disposition.type ||
        (operation.disposition.type !== "active" && operation.snapshot.fieldBases.disposition.type !== "carried")
      if (lifecycle) {
        yield* requireDirectLifecycle(
          operation.snapshot.fieldBases.disposition,
          operation.disposition.type,
          directive.text,
          operation.goalID,
        )
        continue
      }
      const proposed = meaningFromInput(operation.snapshot, operation.disposition)
      if (equalMeaning(previous, proposed)) {
        if (!directNoChange(directive.text, operation.goalID)) return yield* invalid("dependency_incomplete")
        continue
      }
      if (!directUpdate(directive.text, operation.goalID)) return yield* invalid("dependency_incomplete")
    }
  })
}

function validateDirectDirectiveBinding(operation: Operation, sourceText: string) {
  const snapshots =
    operation.type === "replace" && operation.target.type === "new"
      ? [operation.snapshot, operation.target.snapshot]
      : [operation.snapshot]
  for (const snapshot of snapshots) {
    for (const basis of Object.values(snapshot.fieldBases)) {
      if (basis.type === "authored" && !sourceText.includes(normalizeText(basis.sourceExcerpt))) {
        return invalid("dependency_incomplete")
      }
    }
    if (snapshot.fieldBases.outcome.type === "authored" && !sourceText.includes(normalizeText(snapshot.outcome))) {
      return invalid("dependency_incomplete")
    }
    if (
      snapshot.fieldBases.conditions.type === "authored" &&
      snapshot.conditions.some((condition) => !sourceText.includes(normalizeText(condition)))
    ) {
      return invalid("dependency_incomplete")
    }
  }
  return Effect.void
}

function validateDirectInitialDefaults(
  snapshot: SemanticSnapshot,
  disposition: NonSupersededDisposition,
  sourceText: string,
) {
  return Effect.gen(function* () {
    if (
      snapshot.scope.type === "learner_home" &&
      directCourseIntent(sourceText) &&
      (snapshot.fieldBases.scope.type !== "authored" ||
        !directLearnerHomeScope(snapshot.fieldBases.scope.sourceExcerpt))
    ) {
      return yield* invalid("dependency_incomplete")
    }
    if (
      snapshot.target.type === "absent" &&
      directTargetIntent(sourceText) &&
      (snapshot.fieldBases.target.type !== "authored" || !directTargetRemoval(snapshot.fieldBases.target.sourceExcerpt))
    ) {
      return yield* invalid("dependency_incomplete")
    }
    if (
      snapshot.conditions.length === 0 &&
      directConditionIntent(sourceText) &&
      (snapshot.fieldBases.conditions.type !== "authored" ||
        !directNoConditions(snapshot.fieldBases.conditions.sourceExcerpt))
    ) {
      return yield* invalid("dependency_incomplete")
    }
    if (disposition === "active" && directLifecycleIntent(sourceText)) {
      return yield* invalid("dependency_incomplete")
    }
  })
}

function directCourseIntent(source: string) {
  return source.toLowerCase().includes("course") || source.includes("课程")
}

function validateDirectConditions(snapshot: SemanticSnapshot, sourceText: string, predecessorID?: RevisionID) {
  const basis = snapshot.fieldBases.conditions
  if (basis.type !== "authored") return Effect.void
  if (snapshot.conditions.some((condition) => !basis.sourceExcerpt.includes(condition))) {
    return invalid("dependency_incomplete")
  }
  if (predecessorID && snapshot.conditions.length === 0 && !directNoConditions(basis.sourceExcerpt)) {
    return invalid("dependency_incomplete")
  }
  if (!sourceText.includes(basis.sourceExcerpt)) return invalid("dependency_incomplete")
  return Effect.void
}

function directNoConditions(source: string) {
  const normalized = source.toLowerCase()
  return (
    normalized.includes("no conditions") ||
    normalized.includes("without conditions") ||
    source.includes("无条件") ||
    source.includes("没有条件")
  )
}

function directConditionIntent(source: string) {
  const normalized = source.toLowerCase()
  return (
    [" if ", " when ", " until ", "score", ">=", "condition"].some((marker) => normalized.includes(marker)) ||
    ["条件", "达到", "分数"].some((marker) => source.includes(marker))
  )
}

function directTargetIntent(source: string) {
  const normalized = source.toLowerCase()
  return (
    ["target", "deadline", " by ", "before the exam"].some((marker) => normalized.includes(marker)) ||
    /\d{4}-\d{2}-\d{2}/u.test(source) ||
    ["截止", "日期", "考试前", "之前"].some((marker) => source.includes(marker))
  )
}

function directLifecycleIntent(source: string) {
  const normalized = source.toLowerCase()
  return (
    ["achieved", "abandoned", "replaced", "superseded", "done", "completed"].some((marker) =>
      normalized.includes(marker),
    ) || ["放弃", "达成", "已完成", "替代", "取代"].some((marker) => source.includes(marker))
  )
}

type DirectGoalDirective = Readonly<{ text: string; goalInitiation: boolean }>

function directGoalDirectives(source: string): readonly DirectGoalDirective[] | undefined {
  const text = source.trim()
  const plural = /^(?:create (?:durable )?goals)\s*[:：]\s*/iu.exec(text)
  if (plural) {
    const directives = numberedDirectives(text.slice(plural[0].length))
    return directives?.map((directive) => ({ text: directive, goalInitiation: true }))
  }
  if (/^(?:create (?:durable )?goals)\b/iu.test(text)) return undefined

  const numbered = numberedDirectives(text)
  if (numbered) {
    return numbered.map((directive) => ({
      text: directive,
      goalInitiation: directGoalInitiation(directive),
    }))
  }
  if (/\(\d+\)\s*/u.test(text)) return undefined

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length > 1 && lines.every(directGoalInitiation)) {
    return lines.map((line) => ({ text: line, goalInitiation: true }))
  }
  return [{ text, goalInitiation: directGoalInitiation(text) }]
}

function numberedDirectives(source: string) {
  const text = source.trim()
  const markers = [...text.matchAll(/\((\d+)\)\s*/gu)]
  if (markers.length === 0 || markers[0]!.index !== 0) return undefined
  if (markers.some((marker, index) => Number(marker[1]) !== index + 1)) return undefined
  const directives = markers.map((marker, index) =>
    text.slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? text.length).trim(),
  )
  if (directives.some((directive) => directive.length === 0)) return undefined
  return directives
}

function directGoalInitiation(source: string) {
  const normalized = source.trimStart().toLowerCase()
  return (
    normalized.startsWith("/goal") ||
    normalized.startsWith("create goal:") ||
    normalized.startsWith("create goals:") ||
    normalized.startsWith("create a durable goal:") ||
    normalized.startsWith("create durable goal:") ||
    normalized.startsWith("create durable goals:") ||
    normalized.startsWith("set goal:") ||
    normalized.startsWith("set my goal:") ||
    source.trimStart().startsWith("创建目标：") ||
    source.trimStart().startsWith("建立目标：") ||
    source.trimStart().startsWith("我的目标是")
  )
}

function directProhibitedInitiation(source: string) {
  const normalized = source.trimStart().toLowerCase()
  if (
    /\b(?:do not|don't|never)\s+(?:store|save|record|remember|create|set)\b/u.test(normalized) ||
    /\b(?:not|isn't|is not)\s+(?:my\s+)?(?:goal|a goal)\b/u.test(normalized) ||
    /\b(?:only|just)\s+(?:an?\s+)?(?:example|hypothetical)\b/u.test(normalized) ||
    /(?:不要|别)(?:存储|保存|记录|记住|创建|建立)|(?:只是|仅仅是)(?:一个)?(?:例子|示例|假设)|不是我的目标/u.test(source)
  ) {
    return true
  }
  const english = normalized.replace(
    /^(?:\/goal|create goals?|create (?:a )?durable goals?|set (?:my )?goal)\s*[:：]?\s*/u,
    "",
  )
  if (/^(?:do not|don't|i do not|i don't|not my|suppose|if i were)\b/u.test(english)) return true
  const chinese = source.trimStart().replace(/^(?:\/goal|创建目标：|建立目标：|我的目标是)\s*/u, "")
  return /^(?:不要|别|假如|如果只是)/u.test(chinese)
}

function directCadence(source: string) {
  const normalized = source.toLowerCase()
  return (
    ["every day", "each day", "per day", "daily", "every week", "weekly", "every month", "monthly"].some((marker) =>
      normalized.includes(marker),
    ) || ["每天", "每日", "每周", "每月"].some((marker) => source.includes(marker))
  )
}

function directUpdate(source: string, goalID: GoalID) {
  const clauses = `; ${source.toLowerCase().replaceAll("\n", "; ").replaceAll("；", "; ")}`
  const id = goalID.toLowerCase()
  return (
    ["update", "correct", "change", "set"].some((verb) => clauses.includes(`; ${verb} ${id}`)) ||
    ["更新", "更正", "修改", "设置"].some(
      (verb) => source.includes(`${verb}${goalID}`) || source.includes(`${verb} ${goalID}`),
    )
  )
}

function directNoChange(source: string, goalID: GoalID) {
  const clauses = `; ${source.toLowerCase().replaceAll("\n", "; ").replaceAll("；", "; ")}`
  const id = goalID.toLowerCase()
  return (
    clauses.includes(`; keep ${id} unchanged`) ||
    clauses.includes(`; keep goal ${id} unchanged`) ||
    source.includes(`保持${goalID}不变`) ||
    source.includes(`保持 ${goalID} 不变`)
  )
}

function validateDirectCourses(
  tx: Transaction,
  snapshot: SemanticSnapshot,
  sourceText: string,
  predecessorID?: RevisionID,
  predecessorCourseIDs: readonly Course.CourseID[] = [],
) {
  return Effect.gen(function* () {
    const currentCourseIDs =
      snapshot.scope.type === "courses" ? snapshot.scope.courses.map((membership) => membership.courseID) : []
    const scopeChanged = canonicalJson([...predecessorCourseIDs].sort()) !== canonicalJson([...currentCourseIDs].sort())
    if (snapshot.scope.type === "learner_home") {
      if (!predecessorID) return
      const basis = snapshot.fieldBases.scope
      if (basis.type !== "authored") return
      if (!directLearnerHomeScope(basis.sourceExcerpt)) {
        return yield* invalid("dependency_incomplete")
      }
      if (!scopeChanged) return
      if (!directScopeRemoval(basis.sourceExcerpt)) return yield* invalid("dependency_incomplete")
      const predecessorCourses = yield* tx
        .select({ courseID: LearnerGoalCourseScopeTable.course_id, title: LearnerGoalCourseScopeTable.course_title })
        .from(LearnerGoalCourseScopeTable)
        .where(eq(LearnerGoalCourseScopeTable.revision_id, predecessorID))
        .all()
        .pipe(Effect.orDie)
      if (
        predecessorCourses.some(
          (course) => !basis.sourceExcerpt.includes(course.courseID) && !basis.sourceExcerpt.includes(course.title),
        )
      ) {
        return yield* invalid("dependency_incomplete")
      }
      return
    }
    const basis = snapshot.fieldBases.scope
    for (const membership of snapshot.scope.courses) {
      if (basis.type !== "authored") continue
      if (membership.basis.type === "new") {
        const proof = yield* prepareActiveCourseProof(tx, {
          courseID: membership.courseID,
          expectedVersion: membership.basis.expectedCourseVersion,
        })
        const exactTitleMatches = yield* tx
          .select({ id: CourseTable.id })
          .from(CourseTable)
          .where(and(eq(CourseTable.title, proof.receipt.courseTitle), isNull(CourseTable.withdrawal_reason)))
          .all()
          .pipe(Effect.orDie)
        if (
          !basis.sourceExcerpt.includes(membership.courseID) &&
          !(basis.sourceExcerpt.includes(proof.receipt.courseTitle) && exactTitleMatches.length === 1)
        ) {
          return yield* invalid("dependency_incomplete")
        }
        continue
      }
      if (!predecessorID || membership.basis.predecessorRevisionID !== predecessorID) {
        return yield* invalid("dependency_incomplete")
      }
      const predecessor = yield* storedCourse(tx, predecessorID, membership.courseID)
      if (
        !predecessor ||
        (!basis.sourceExcerpt.includes(membership.courseID) && !basis.sourceExcerpt.includes(predecessor.course_title))
      ) {
        return yield* invalid("dependency_incomplete")
      }
    }
    if (!predecessorID || !scopeChanged) return
    if (basis.type !== "authored") return yield* invalid("dependency_incomplete")
    const predecessorCourses = yield* tx
      .select({ courseID: LearnerGoalCourseScopeTable.course_id, title: LearnerGoalCourseScopeTable.course_title })
      .from(LearnerGoalCourseScopeTable)
      .where(eq(LearnerGoalCourseScopeTable.revision_id, predecessorID))
      .all()
      .pipe(Effect.orDie)
    const removed = predecessorCourses.filter((course) => !currentCourseIDs.includes(course.courseID))
    if (
      removed.some(
        (course) => !basis.sourceExcerpt.includes(course.courseID) && !basis.sourceExcerpt.includes(course.title),
      )
    ) {
      return yield* invalid("dependency_incomplete")
    }
  })
}

function validateDirectTarget(snapshot: SemanticSnapshot, sourceText: string, previous?: Target) {
  return Effect.gen(function* () {
    const changed = previous
      ? canonicalJson(previous) !== canonicalJson(snapshot.target)
      : snapshot.target.type !== "absent"
    const basis = snapshot.fieldBases.target
    if (!changed && (!previous || basis.type !== "authored")) return
    if (basis.type !== "authored") return yield* invalid("dependency_incomplete")
    if (snapshot.target.type === "absent") {
      if (!directTargetRemoval(basis.sourceExcerpt)) return yield* invalid("dependency_incomplete")
      return
    }
    if (!basis.sourceExcerpt.includes(snapshot.target.sourceExpression)) {
      return yield* invalid("dependency_incomplete")
    }
    if (snapshot.target.type === "local_date" && !snapshot.target.sourceExpression.includes(snapshot.target.date)) {
      return yield* invalid("dependency_incomplete")
    }
    if (
      snapshot.target.type === "local_date" &&
      normalizeText(snapshot.target.sourceExpression) !== snapshot.target.date
    ) {
      return yield* invalid("dependency_incomplete")
    }
    if (snapshot.target.type === "local_date" && !basis.sourceExcerpt.includes(snapshot.target.timeZone)) {
      return yield* invalid("dependency_incomplete")
    }
    if (
      snapshot.target.type === "instant" &&
      normalizeText(snapshot.target.sourceExpression) !== normalizeText(snapshot.target.normalized)
    ) {
      return yield* invalid("dependency_incomplete")
    }
    if (!sourceText.includes(basis.sourceExcerpt)) return yield* invalid("dependency_incomplete")
  })
}

function directLearnerHomeScope(source: string) {
  return (
    /\blearnerhome(?:-wide)?(?:\s+(?:goal|scope))?\b/iu.test(source) ||
    /(?:学习者主目录|学习者空间)(?:范围|目标)?/u.test(source)
  )
}

function requireDirectLifecycle(
  basis: FieldBases["disposition"],
  disposition: NonSupersededDisposition,
  sourceText: string,
  identity: string,
) {
  if (
    basis.type !== "authored" ||
    !basis.sourceExcerpt.includes(identity) ||
    !directLifecycle(disposition, basis.sourceExcerpt, identity) ||
    !sourceText.includes(basis.sourceExcerpt)
  ) {
    return invalid("dependency_incomplete")
  }
  return Effect.void
}

function requireDirectReplacement(
  basis: FieldBases["disposition"],
  sourceText: string,
  sourceGoalID: GoalID,
  targetGoalID?: GoalID,
) {
  if (
    basis.type !== "authored" ||
    !basis.sourceExcerpt.includes(sourceGoalID) ||
    (targetGoalID && !basis.sourceExcerpt.includes(targetGoalID)) ||
    !directReplacement(basis.sourceExcerpt, sourceGoalID, targetGoalID) ||
    !sourceText.includes(basis.sourceExcerpt)
  ) {
    return invalid("dependency_incomplete")
  }
  return Effect.void
}

function directLifecycle(disposition: NonSupersededDisposition, source: string, identity: string) {
  const normalized = source.toLowerCase()
  const exact = identity.toLowerCase()
  const chinese = disposition === "achieved" ? "已达成" : disposition === "abandoned" ? "已放弃" : "进行中"
  return (
    normalized.includes(`goal ${exact} is ${disposition}`) ||
    normalized.includes(`${exact} disposition: ${disposition}`) ||
    source.includes(`${identity} 状态：${chinese}`) ||
    source.includes(`${identity} 状态: ${chinese}`)
  )
}

function directReplacement(source: string, sourceGoalID: GoalID, targetGoalID?: GoalID) {
  const normalized = source.toLowerCase()
  const sourceID = sourceGoalID.toLowerCase()
  const targetID = targetGoalID?.toLowerCase() ?? "a new goal"
  return (
    normalized.includes(`replace ${sourceID} with ${targetID}`) ||
    normalized.includes(`${sourceID} is replaced by ${targetID}`) ||
    source.includes(`用${targetGoalID ?? "新 Goal"}替代${sourceGoalID}`)
  )
}

function directScopeRemoval(source: string) {
  return /\b(?:remove|clear|drop)(?:d)?\b.*\b(?:course|scope)\b|(?:移除|清除|取消).*课程/iu.test(source)
}

function directTargetRemoval(source: string) {
  return /\b(?:no|remove|clear|without)\b.*\b(?:target|deadline|date)\b|无(?:目标|截止日期)|(?:移除|清除|取消).*(?:目标|日期)/iu.test(
    source,
  )
}

function validateSnapshot(
  snapshot: SemanticSnapshot,
  authorizationBasis: AuthorizationBasis,
  occurrence: typeof AdmittedLearnerOccurrenceTable.$inferSelect & { source_order: number },
  sourceText: string,
) {
  return Effect.gen(function* () {
    const outcome = normalizeText(snapshot.outcome)
    if (outcome.trim().length === 0 || bytes(outcome) > MAX_OUTCOME_BYTES) return yield* invalid("validation_error")
    if (snapshot.conditions.length > MAX_CONDITIONS) return yield* invalid("capacity_exceeded")
    if (new Set(snapshot.conditions.map(normalizeText)).size !== snapshot.conditions.length) {
      return yield* invalid("validation_error")
    }
    for (const condition of snapshot.conditions) {
      if (normalizeText(condition).trim().length === 0 || bytes(condition) > MAX_CONDITION_BYTES) {
        return yield* invalid("validation_error")
      }
    }
    if (snapshot.scope.type === "courses") {
      if (snapshot.scope.courses.length < 1 || snapshot.scope.courses.length > MAX_COURSES) {
        return yield* invalid("capacity_exceeded")
      }
      if (new Set(snapshot.scope.courses.map((course) => course.courseID)).size !== snapshot.scope.courses.length) {
        return yield* invalid("validation_error")
      }
      for (const course of snapshot.scope.courses) {
        if (
          course.basis.type === "new" &&
          (!Number.isSafeInteger(course.basis.expectedCourseVersion) || course.basis.expectedCourseVersion < 0)
        ) {
          return yield* invalid("validation_error")
        }
      }
    }
    yield* validateFieldBasisShapes(snapshot.fieldBases, authorizationBasis)
    for (const basis of Object.values(snapshot.fieldBases)) {
      if (basis.type !== "authored") continue
      const excerpt = normalizeText(basis.sourceExcerpt)
      if (excerpt.trim().length === 0 || bytes(excerpt) > MAX_SOURCE_EXCERPT_BYTES || !sourceText.includes(excerpt)) {
        return yield* invalid("validation_error")
      }
    }
    if (authorizationBasis === "learner_request") {
      if (snapshot.fieldBases.outcome.type === "authored" && !sourceText.includes(outcome)) {
        return yield* invalid("validation_error")
      }
      if (
        snapshot.fieldBases.conditions.type === "authored" &&
        snapshot.conditions.some((condition) => !sourceText.includes(normalizeText(condition)))
      ) {
        return yield* invalid("validation_error")
      }
    }
    yield* validateTarget(snapshot.target, authorizationBasis, occurrence, sourceText)
  })
}

function validateTarget(
  target: Target,
  authorizationBasis: AuthorizationBasis,
  occurrence: typeof AdmittedLearnerOccurrenceTable.$inferSelect,
  sourceText: string,
) {
  return Effect.gen(function* () {
    if (target.type === "absent") return
    if (
      target.sourceExpression.trim().length === 0 ||
      bytes(target.sourceExpression) > MAX_SOURCE_EXCERPT_BYTES ||
      (authorizationBasis === "learner_request" && !sourceText.includes(normalizeText(target.sourceExpression)))
    ) {
      return yield* invalid("validation_error")
    }
    if (target.normalizationBasis === "source_temporal_context") {
      if (
        occurrence.source_temporal_state !== "resolved" ||
        !occurrence.source_timezone ||
        occurrence.source_utc_offset_minutes === null
      ) {
        return yield* invalid("temporal_context_unavailable")
      }
      if (authorizationBasis === "learner_request") return yield* invalid("dependency_incomplete")
    }
    if (target.type === "instant") {
      const offset = explicitOffsetMinutes(target.normalized)
      if (
        !Number.isSafeInteger(target.instant) ||
        target.instant < 0 ||
        !Number.isInteger(target.utcOffsetMinutes) ||
        target.utcOffsetMinutes < -840 ||
        target.utcOffsetMinutes > 840 ||
        target.normalized.trim().length === 0 ||
        Date.parse(target.normalized) !== target.instant ||
        offset !== target.utcOffsetMinutes
      ) {
        return yield* invalid("validation_error")
      }
      return
    }
    if (!validDate(target.date) || !validTimeZone(target.timeZone)) return yield* invalid("validation_error")
    if (target.normalizationBasis === "source_temporal_context" && target.timeZone !== occurrence.source_timezone) {
      return yield* invalid("validation_error")
    }
  })
}

function explicitOffsetMinutes(value: string) {
  const match = /(?:Z|([+-])(\d{2}):(\d{2}))$/i.exec(value)
  if (!match) return undefined
  if (!match[1]) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === "+" ? minutes : -minutes
}

export function applyChangeSet(
  tx: Transaction,
  prepared: PreparedChangeSet,
): Effect.Effect<AppliedEffect, InvalidCommandError | IntegrityError> {
  return Effect.gen(function* () {
    const state = yield* requireState(tx)
    if (state.revisionSequence !== prepared.revisionSequenceBefore) return yield* invalid("stale")
    yield* revalidatePrepared(tx, prepared)
    yield* tx.run("PRAGMA defer_foreign_keys = ON").pipe(Effect.orDie)
    const frontier = yield* LearningFrontier.advance(tx, {
      time: prepared.settlement.time,
      consumed: prepared.consumedFrontiers,
    })
    if (frontier.time !== prepared.settlement.time) return yield* invalid("stale")
    const changed = prepared.operations.filter((operation) => operation.result.result === "changed")
    yield* tx
      .insert(LearnerGoalEffectTable)
      .values({
        id: prepared.effectID,
        commit_seal_id: prepared.effectID,
        occurrence_id: prepared.occurrenceID,
        source_order: prepared.sourceOrder,
        semantic_fingerprint: prepared.semanticFingerprint,
        authorization_basis: prepared.authorizationBasis,
        command: prepared.command,
        operation_count: prepared.operations.length,
        change_count: changed.length,
        time_committed: frontier.time,
        commit_order: prepared.settlement.order,
        frontier_sequence: frontier.sequence,
        frontier_time: frontier.time,
        acknowledgement_title: prepared.acknowledgementTitle,
        acknowledgement_body: prepared.acknowledgementBody,
      })
      .run()
      .pipe(Effect.orDie)

    const newGoals = prepared.operations.flatMap((operation) => operation.newGoals)
    yield* Effect.forEach(
      newGoals,
      (goal) =>
        tx.insert(LearnerGoalTable).values({ id: goal.goalID, time_created: frontier.time }).run().pipe(Effect.orDie),
      { discard: true },
    )

    const revisions = prepared.operations.flatMap((operation) => operation.revisions)
    yield* Effect.forEach(revisions, (revision) => insertRevision(tx, revision, prepared, frontier), {
      discard: true,
    })
    yield* Effect.forEach(
      prepared.operations,
      (operation) =>
        tx
          .insert(LearnerGoalEffectOperationTable)
          .values({
            effect_id: prepared.effectID,
            ordinal: operation.result.ordinal,
            operation_kind: operation.result.operation,
            result_kind: operation.result.result,
            goal_id: operation.result.goalID,
            revision_id: operation.result.revisionID,
            version: operation.result.version,
            disposition: operation.result.disposition,
            meaning: operation.result.meaning,
            replacement_target_kind: operation.result.replacementTarget?.type ?? null,
            replacement_target_goal_id: operation.result.replacementTarget?.goalID ?? null,
            replacement_target_revision_id: operation.result.replacementTarget?.revisionID ?? null,
            replacement_target_version: operation.result.replacementTarget?.version ?? null,
          })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    return {
      id: prepared.effectID,
      occurrenceID: prepared.occurrenceID,
      authorizationBasis: prepared.authorizationBasis,
      semanticFingerprint: prepared.semanticFingerprint,
      operations: prepared.operations.map((operation) => operation.result),
      acknowledgementTitle: prepared.acknowledgementTitle,
      acknowledgementBody: prepared.acknowledgementBody,
      frontierSequence: frontier.sequence,
      timeCommitted: frontier.time,
      commitOrder: prepared.settlement.order,
      revisionSequence: prepared.revisionSequenceBefore + revisions.length,
    }
  })
}

export function sealEffect(
  tx: Transaction,
  input: {
    readonly effect: AppliedEffect
    readonly receiptID: ReceiptID
    readonly invocationPartID: SessionV1.PartID
    readonly expectedRevisionSequence: number
  },
) {
  return Effect.gen(function* () {
    const updated = yield* tx
      .update(LearnerGoalStateTable)
      .set({ revision_sequence: input.effect.revisionSequence })
      .where(
        and(
          eq(LearnerGoalStateTable.singleton, 1),
          eq(LearnerGoalStateTable.revision_sequence, input.expectedRevisionSequence),
        ),
      )
      .returning({ revisionSequence: LearnerGoalStateTable.revision_sequence })
      .get()
      .pipe(Effect.orDie)
    if (!updated || updated.revisionSequence !== input.effect.revisionSequence) {
      return yield* invalid("stale")
    }
    yield* tx
      .insert(LearnerGoalCommitSealTable)
      .values({
        effect_id: input.effect.id,
        receipt_id: input.receiptID,
        invocation_part_id: input.invocationPartID,
      })
      .run()
      .pipe(Effect.orDie)
  })
}

function revalidatePrepared(tx: Transaction, prepared: PreparedChangeSet) {
  return Effect.gen(function* () {
    for (const [ordinal, operation] of prepared.command.operations.entries()) {
      const result = prepared.operations[ordinal]?.result
      if (!result || result.ordinal !== ordinal) return yield* integrity("Prepared Goal operations lost order")
      if (operation.type !== "create") {
        const head = yield* goalHead(tx, operation.goalID)
        if (!head || head.id !== operation.expectedHeadID || head.version !== operation.expectedVersion) {
          return yield* invalid("stale")
        }
      }
      if (operation.type === "replace" && operation.target.type === "existing") {
        const target = yield* goalHead(tx, operation.target.goalID)
        if (!target || target.id !== operation.target.revisionID || target.version !== operation.target.version) {
          return yield* invalid("stale")
        }
      }
    }
    yield* Effect.forEach(
      prepared.operations
        .flatMap((operation) => operation.revisions)
        .flatMap((revision) => revision.courses)
        .flatMap((course) => (course.admission.type === "new" ? [course.admission.proof] : [])),
      (proof) => Course.requireActiveOwnerProof(tx, proof).pipe(Effect.mapError((error) => courseError(error))),
      { discard: true },
    )
  })
}

function insertRevision(
  tx: Transaction,
  revision: PreparedRevision,
  prepared: PreparedChangeSet,
  frontier: Readonly<{ sequence: number; time: number }>,
) {
  return Effect.gen(function* () {
    const target = targetColumns(revision.snapshot.target)
    yield* tx
      .insert(LearnerGoalRevisionTable)
      .values({
        id: revision.id,
        goal_id: revision.goalID,
        version: revision.version,
        predecessor_id: revision.predecessorID ?? null,
        effect_id: revision.effectID,
        operation_ordinal: revision.operationOrdinal,
        revision_role: revision.revisionRole,
        occurrence_id: prepared.occurrenceID,
        source_order: prepared.sourceOrder,
        outcome: revision.snapshot.outcome,
        scope_kind: revision.snapshot.scope.type,
        ...target,
        disposition: revision.disposition.type,
        revision_order: revision.revisionOrder,
        time_committed: frontier.time,
        commit_order: prepared.settlement.order,
        frontier_sequence: frontier.sequence,
        frontier_time: frontier.time,
      })
      .run()
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      revision.snapshot.conditions,
      (condition, ordinal) =>
        tx
          .insert(LearnerGoalConditionTable)
          .values({ revision_id: revision.id, ordinal, content: condition })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    yield* Effect.forEach(
      revision.courses,
      (course) =>
        tx
          .insert(LearnerGoalCourseScopeTable)
          .values({
            revision_id: revision.id,
            course_id: course.courseID,
            course_title: course.courseTitle,
            admission_kind: course.admission.type,
            admitted_course_version:
              course.admission.type === "new" ? course.admission.proof.receipt.courseVersion : null,
            admitted_course_time_updated:
              course.admission.type === "new" ? course.admission.proof.receipt.timeUpdated : null,
            carried_from_revision_id:
              course.admission.type === "carried" ? course.admission.predecessorRevisionID : null,
          })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    yield* Effect.forEach(
      Object.entries(revision.snapshot.fieldBases) as readonly [FieldName, FieldBases[FieldName]][],
      ([field, basis]) =>
        tx
          .insert(LearnerGoalFieldBasisTable)
          .values({
            revision_id: revision.id,
            field,
            basis_kind: basis.type,
            source_excerpt: basis.type === "authored" ? basis.sourceExcerpt : null,
            predecessor_revision_id: basis.type === "carried" ? basis.predecessorRevisionID : null,
          })
          .run()
          .pipe(Effect.orDie),
      { discard: true },
    )
    if (revision.disposition.type === "superseded") {
      yield* tx
        .insert(LearnerGoalSupersessionTable)
        .values({
          revision_id: revision.id,
          source_goal_id: revision.goalID,
          target_goal_id: revision.disposition.targetGoalID,
          target_revision_id: revision.disposition.targetRevisionID,
        })
        .run()
        .pipe(Effect.orDie)
    }
  })
}

function targetColumns(target: Target) {
  const absent = {
    target_instant: null,
    target_local_date: null,
    target_timezone: null,
    target_timezone_release_id: null,
    target_utc_offset_minutes: null,
    target_source_expression: null,
    target_normalized: null,
    target_normalization_basis: null,
    target_value_v2: null,
  }
  if (target.type === "absent") return { target_kind: target.type, ...absent } as const
  if (target.type === "instant") {
    return {
      target_kind: target.type,
      target_instant: target.instant,
      target_local_date: null,
      target_timezone: null,
      target_timezone_release_id: null,
      target_utc_offset_minutes: target.utcOffsetMinutes,
      target_source_expression: target.sourceExpression,
      target_normalized: target.normalized,
      target_normalization_basis: target.normalizationBasis,
      target_value_v2: null,
    } as const
  }
  return {
    target_kind: target.type,
    target_instant: null,
    target_local_date: target.date,
    target_timezone: target.timeZone,
    target_timezone_release_id: TIME_ZONE_RELEASE_ID,
    target_utc_offset_minutes: null,
    target_source_expression: target.sourceExpression,
    target_normalized: null,
    target_normalization_basis: target.normalizationBasis,
    target_value_v2: null,
  } as const
}

function validateProjectedRelations(
  tx: Transaction,
  projectedHeads: Map<GoalID, StoredHead>,
  operations: readonly PreparedOperation[],
) {
  return Effect.gen(function* () {
    const prepared = new Map(
      operations.flatMap((operation) => operation.revisions).map((revision) => [revision.id, revision]),
    )
    const outgoing = new Map<GoalID, GoalID>()
    const incoming = new Map<GoalID, GoalID>()
    for (const [goalID, head] of projectedHeads) {
      const revision = prepared.get(head.id)
      const disposition = revision?.disposition ?? (yield* meaning(tx, head)).disposition
      if (disposition.type !== "superseded") continue
      if (disposition.targetGoalID === goalID || !projectedHeads.has(disposition.targetGoalID)) {
        return yield* invalid("relation_conflict")
      }
      const existing = incoming.get(disposition.targetGoalID)
      if (existing && existing !== goalID) return yield* invalid("relation_conflict")
      outgoing.set(goalID, disposition.targetGoalID)
      incoming.set(disposition.targetGoalID, goalID)
    }
    for (const start of outgoing.keys()) {
      const seen = new Set<GoalID>()
      let current: GoalID | undefined = start
      while (current) {
        if (seen.has(current)) return yield* invalid("relation_conflict")
        seen.add(current)
        current = outgoing.get(current)
      }
    }
  })
}

function preparedHead(
  revision: PreparedRevision,
  occurrence: typeof AdmittedLearnerOccurrenceTable.$inferSelect & { source_order: number },
): StoredHead {
  return {
    schema_version: 1,
    id: revision.id,
    goal_id: revision.goalID,
    version: revision.version,
    predecessor_id: revision.predecessorID ?? null,
    effect_id: revision.effectID,
    operation_ordinal: revision.operationOrdinal,
    revision_role: revision.revisionRole,
    occurrence_id: occurrence.id,
    source_order: occurrence.source_order,
    outcome: revision.snapshot.outcome,
    scope_kind: revision.snapshot.scope.type,
    ...targetColumns(revision.snapshot.target),
    disposition: revision.disposition.type,
    revision_order: revision.revisionOrder,
    time_committed: 0,
    commit_order: 0,
    frontier_sequence: 0,
    frontier_time: 0,
  }
}

function operationResult(
  ordinal: number,
  operation: "create" | "update" | "replace",
  result: "changed" | "no_change",
  revision: PreparedRevision | StoredHead,
  snapshot: SemanticSnapshot,
): OperationResult {
  const resultMeaning = {
    outcome: snapshot.outcome,
    conditions: snapshot.conditions,
    scope:
      snapshot.scope.type === "learner_home"
        ? { type: "learner_home" as const }
        : { type: "courses" as const, courseIDs: snapshot.scope.courses.map((course) => course.courseID) },
    target: snapshot.target,
  }
  if ("goalID" in revision) {
    return {
      ordinal,
      operation,
      result,
      goalID: revision.goalID,
      revisionID: revision.id,
      version: revision.version,
      disposition: revision.disposition.type,
      meaning: resultMeaning,
    }
  }
  return {
    ordinal,
    operation,
    result,
    goalID: revision.goal_id,
    revisionID: revision.id,
    version: revision.version,
    disposition: revision.disposition,
    meaning: resultMeaning,
  }
}

function meaningFromInput(snapshot: SemanticSnapshot, disposition: UpdateDisposition): Meaning {
  return {
    outcome: snapshot.outcome,
    conditions: snapshot.conditions,
    courseIDs:
      snapshot.scope.type === "courses"
        ? snapshot.scope.courses.map((course) => course.courseID).sort((left, right) => left.localeCompare(right))
        : [],
    target: snapshot.target,
    disposition,
  }
}

function meaning(tx: Transaction, row: StoredHead): Effect.Effect<Meaning, IntegrityError> {
  return Effect.gen(function* () {
    const [conditions, courses, supersession] = yield* Effect.all([
      tx
        .select()
        .from(LearnerGoalConditionTable)
        .where(eq(LearnerGoalConditionTable.revision_id, row.id))
        .orderBy(asc(LearnerGoalConditionTable.ordinal))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(LearnerGoalCourseScopeTable)
        .where(eq(LearnerGoalCourseScopeTable.revision_id, row.id))
        .orderBy(asc(LearnerGoalCourseScopeTable.course_id))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(LearnerGoalSupersessionTable)
        .where(eq(LearnerGoalSupersessionTable.revision_id, row.id))
        .get()
        .pipe(Effect.orDie),
    ])
    if (
      (row.scope_kind === "learner_home" && courses.length !== 0) ||
      (row.scope_kind === "courses" && courses.length === 0) ||
      (row.disposition === "superseded" && !supersession) ||
      (row.disposition !== "superseded" && supersession)
    ) {
      return yield* integrity(`Goal revision ${row.id} has an incomplete semantic union`)
    }
    const disposition: UpdateDisposition = supersession
      ? {
          type: "superseded",
          targetGoalID: supersession.target_goal_id,
          targetRevisionID: supersession.target_revision_id,
        }
      : { type: row.disposition as NonSupersededDisposition }
    return {
      outcome: row.outcome,
      conditions: conditions.map((condition) => condition.content),
      courseIDs: courses.map((course) => course.course_id),
      target: target(row),
      disposition,
    }
  })
}

function semanticChanges(previous: Meaning, proposed: Meaning) {
  const changed = new Set<FieldName>()
  if (previous.outcome !== proposed.outcome) changed.add("outcome")
  if (canonicalJson(previous.conditions) !== canonicalJson(proposed.conditions)) changed.add("conditions")
  if (canonicalJson(previous.courseIDs) !== canonicalJson(proposed.courseIDs)) changed.add("scope")
  if (canonicalJson(previous.target) !== canonicalJson(proposed.target)) changed.add("target")
  if (canonicalJson(previous.disposition) !== canonicalJson(proposed.disposition)) changed.add("disposition")
  return changed
}

function equalMeaning(left: Meaning, right: Meaning) {
  return canonicalJson(left) === canonicalJson(right)
}

function equalField(field: FieldName, previous: Meaning, proposed: Meaning) {
  if (field === "outcome") return previous.outcome === proposed.outcome
  if (field === "conditions") return canonicalJson(previous.conditions) === canonicalJson(proposed.conditions)
  if (field === "scope") return canonicalJson(previous.courseIDs) === canonicalJson(proposed.courseIDs)
  if (field === "target") return canonicalJson(previous.target) === canonicalJson(proposed.target)
  return canonicalJson(previous.disposition) === canonicalJson(proposed.disposition)
}

function target(row: StoredHead): Target {
  if (row.target_kind === "absent") return { type: "absent" }
  if (row.target_kind === "instant") {
    if (
      row.target_instant === null ||
      row.target_utc_offset_minutes === null ||
      !row.target_source_expression ||
      !row.target_normalized ||
      row.target_timezone !== null ||
      row.target_timezone_release_id !== null ||
      row.target_normalization_basis !== "explicit_offset"
    ) {
      throw new IntegrityError({ detail: `Goal revision ${row.id} has a malformed instant target` })
    }
    return {
      type: "instant",
      instant: row.target_instant,
      sourceExpression: row.target_source_expression,
      normalized: row.target_normalized,
      utcOffsetMinutes: row.target_utc_offset_minutes,
      normalizationBasis: "explicit_offset",
    }
  }
  if (
    !row.target_local_date ||
    !row.target_timezone ||
    row.target_timezone_release_id !== TIME_ZONE_RELEASE_ID ||
    !row.target_source_expression ||
    !["explicit_date", "source_temporal_context"].includes(row.target_normalization_basis ?? "")
  ) {
    throw new IntegrityError({ detail: `Goal revision ${row.id} has a malformed local-date target` })
  }
  return {
    type: "local_date",
    date: row.target_local_date,
    timeZone: row.target_timezone,
    sourceExpression: row.target_source_expression,
    normalizationBasis: row.target_normalization_basis as "explicit_date" | "source_temporal_context",
  }
}

function goalHeads(tx: Transaction) {
  return tx
    .select()
    .from(LearnerGoalRevisionTable)
    .where(and(committedRevision, noCommittedSuccessor))
    .orderBy(asc(LearnerGoalRevisionTable.goal_id))
    .all()
    .pipe(Effect.orDie)
}

function goalHead(tx: Transaction, goalID: GoalID) {
  return tx
    .select()
    .from(LearnerGoalRevisionTable)
    .where(and(eq(LearnerGoalRevisionTable.goal_id, goalID), committedRevision, noCommittedSuccessor))
    .limit(2)
    .all()
    .pipe(
      Effect.orDie,
      Effect.flatMap((rows) =>
        rows.length <= 1 ? Effect.succeed(rows[0]) : integrity(`Goal ${goalID} has more than one current head`),
      ),
    )
}

function storedCourse(tx: Transaction, revisionID: RevisionID, courseID: Course.CourseID) {
  return tx
    .select()
    .from(LearnerGoalCourseScopeTable)
    .where(
      and(eq(LearnerGoalCourseScopeTable.revision_id, revisionID), eq(LearnerGoalCourseScopeTable.course_id, courseID)),
    )
    .get()
    .pipe(Effect.orDie)
}

export function readCurrent(
  tx: Transaction,
  goalID: GoalID,
  asOf: number,
): Effect.Effect<GoalRead | undefined, IntegrityError> {
  return Effect.gen(function* () {
    yield* requireState(tx)
    const goal = yield* tx
      .select()
      .from(LearnerGoalTable)
      .where(eq(LearnerGoalTable.id, goalID))
      .get()
      .pipe(Effect.orDie)
    if (!goal) return undefined
    const head = yield* goalHead(tx, goalID)
    if (!head) return yield* integrity(`Goal ${goalID} has no committed head`)
    return { goalID, timeCreated: goal.time_created, head: yield* revisionRead(tx, head, asOf) }
  })
}

export function readHistory(tx: Transaction, goalID: GoalID, asOf: number, options?: PageOptions) {
  return Effect.gen(function* () {
    const cursor = yield* LearnerGoalCursor.historyOptions(options, goalID)
    const state = yield* requireState(tx)
    const throughRevision = cursor.throughRevision ?? state.revisionSequence
    if (throughRevision > state.revisionSequence) return yield* integrity("Goal cursor names a future revision")
    const rows = yield* tx
      .select()
      .from(LearnerGoalRevisionTable)
      .where(
        and(
          eq(LearnerGoalRevisionTable.goal_id, goalID),
          lte(LearnerGoalRevisionTable.revision_order, throughRevision),
          committedRevision,
          ...(cursor.beforeVersion === undefined ? [] : [lt(LearnerGoalRevisionTable.version, cursor.beforeVersion)]),
        ),
      )
      .orderBy(desc(LearnerGoalRevisionTable.version), desc(LearnerGoalRevisionTable.id))
      .limit(cursor.limit + 1)
      .all()
      .pipe(Effect.orDie)
    const page = rows.slice(0, cursor.limit)
    const last = page.at(-1)
    return {
      goalID,
      throughRevision,
      items: yield* Effect.forEach(page, (row) => revisionRead(tx, row, asOf)),
      ...(rows.length > cursor.limit && last
        ? { cursor: LearnerGoalCursor.nextHistory(goalID, throughRevision, last.version) }
        : {}),
    }
  })
}

export function discover(tx: Transaction, asOf: number, filter: DiscoveryFilter = {}, options?: PageOptions) {
  return Effect.gen(function* () {
    const scope = canonicalJson(filter)
    const cursor = yield* LearnerGoalCursor.discoveryOptions(options, scope)
    const state = yield* requireState(tx)
    const throughRevision = cursor.throughRevision ?? state.revisionSequence
    if (throughRevision > state.revisionSequence) return yield* integrity("Goal cursor names a future revision")
    const noSnapshotSuccessor = sql`NOT EXISTS (
      SELECT 1
      FROM learner_goal_revision AS snapshot_successor
      JOIN learner_goal_effect AS snapshot_effect ON snapshot_effect.id = snapshot_successor.effect_id
      JOIN learner_goal_commit_seal AS snapshot_seal ON snapshot_seal.effect_id = snapshot_effect.id
      JOIN learning_command_receipt AS snapshot_receipt
        ON snapshot_receipt.id = snapshot_seal.receipt_id
      JOIN learning_command_invocation AS snapshot_invocation
        ON snapshot_invocation.part_id = snapshot_seal.invocation_part_id
          AND snapshot_invocation.receipt_id = snapshot_receipt.id
          AND snapshot_invocation.status = 'applied'
      WHERE snapshot_successor.predecessor_id = ${LearnerGoalRevisionTable.id}
        AND snapshot_successor.revision_order <= ${throughRevision}
    )`
    const rows = yield* tx
      .select({ revision: LearnerGoalRevisionTable, timeCreated: LearnerGoalTable.time_created })
      .from(LearnerGoalRevisionTable)
      .innerJoin(LearnerGoalTable, eq(LearnerGoalTable.id, LearnerGoalRevisionTable.goal_id))
      .where(
        and(
          lte(LearnerGoalRevisionTable.revision_order, throughRevision),
          committedRevision,
          noSnapshotSuccessor,
          ...(filter.disposition ? [eq(LearnerGoalRevisionTable.disposition, filter.disposition)] : []),
          ...(filter.courseID
            ? [
                sql`EXISTS (
                  SELECT 1 FROM learner_goal_course_scope AS filtered_scope
                  WHERE filtered_scope.revision_id = ${LearnerGoalRevisionTable.id}
                    AND filtered_scope.course_id = ${filter.courseID}
                )`,
              ]
            : []),
          ...(cursor.beforeRevisionOrder === undefined || cursor.beforeGoalID === undefined
            ? []
            : [
                or(
                  lt(LearnerGoalRevisionTable.revision_order, cursor.beforeRevisionOrder),
                  and(
                    eq(LearnerGoalRevisionTable.revision_order, cursor.beforeRevisionOrder),
                    lt(LearnerGoalRevisionTable.goal_id, cursor.beforeGoalID),
                  ),
                )!,
              ]),
        ),
      )
      .orderBy(desc(LearnerGoalRevisionTable.revision_order), desc(LearnerGoalRevisionTable.goal_id))
      .limit(cursor.limit + 1)
      .all()
      .pipe(Effect.orDie)
    const page = rows.slice(0, cursor.limit)
    const last = page.at(-1)
    return {
      throughRevision,
      items: yield* Effect.forEach(page, (row) =>
        revisionRead(tx, row.revision, asOf).pipe(
          Effect.map((head) => ({ goalID: row.revision.goal_id, timeCreated: row.timeCreated, head })),
        ),
      ),
      ...(rows.length > cursor.limit && last
        ? {
            cursor: LearnerGoalCursor.nextDiscovery(
              scope,
              throughRevision,
              last.revision.revision_order,
              last.revision.goal_id,
            ),
          }
        : {}),
    }
  })
}

/** Gate 18 transaction-scoped, zero-write Goal projection. */
export function projectLearningContext(tx: Transaction, asOf: number, limit: number) {
  return Effect.gen(function* () {
    const count = yield* tx
      .select({ value: sql<number>`count(*)` })
      .from(LearnerGoalTable)
      .get()
      .pipe(Effect.orDie)
    const page = yield* discover(tx, asOf, {}, { limit })
    const countAtCut = count?.value ?? 0
    if (page.items.length !== Math.min(countAtCut, limit)) {
      return yield* integrity("Goal learning-context projection disagrees with the Goal identity count")
    }
    return {
      countAtCut,
      throughRevision: page.throughRevision,
      entries: yield* Effect.forEach(page.items, (goal) =>
        Effect.gen(function* () {
          const scopeCourses = goal.head.scope.type === "courses" ? goal.head.scope.courses : []
          return {
            ...goal,
            learningContextDependencies: {
              asOf,
              target: goal.head.target,
              targetRelation: goal.head.targetRelation,
              scopeCourses: yield* Effect.forEach(scopeCourses, (course) =>
                Course.inspectPreferenceTarget(tx, course.courseID),
              ),
            },
          }
        }),
      ),
    }
  })
}

export type LearningContextRevisionField = "outcome" | "conditions" | "scope" | "target" | "fieldBases" | "disposition"

export class LearningContextReadError extends Error {
  readonly code: "invalid_budget" | "mandatory_over_budget"

  constructor(code: LearningContextReadError["code"], message: string) {
    super(message)
    this.name = "LearnerGoal.LearningContextReadError"
    this.code = code
  }
}

/** Read one immutable Goal Revision without retargeting to the current head. */
export function readLearningContextRevision(
  tx: Transaction,
  input: {
    readonly goalID: GoalID
    readonly revisionID: RevisionID
    readonly asOf: number
    readonly maxBytes: number
    readonly maxItems: number
    readonly field?: LearningContextRevisionField
    readonly offset?: number
  },
) {
  return Effect.gen(function* () {
    if (
      !Number.isSafeInteger(input.asOf) ||
      input.asOf < 0 ||
      !Number.isSafeInteger(input.maxBytes) ||
      input.maxBytes <= 0 ||
      input.maxBytes > MAX_LAZY_BYTES ||
      !Number.isSafeInteger(input.maxItems) ||
      input.maxItems <= 0 ||
      input.maxItems > MAX_LAZY_ITEMS ||
      !Number.isSafeInteger(input.offset ?? 0) ||
      (input.offset ?? 0) < 0
    ) {
      return yield* Effect.fail(
        new LearningContextReadError(
          "invalid_budget",
          "Goal learning-context reads must stay within the Gate 18 byte and item limits",
        ),
      )
    }
    const goal = yield* tx
      .select()
      .from(LearnerGoalTable)
      .where(eq(LearnerGoalTable.id, input.goalID))
      .get()
      .pipe(Effect.orDie)
    if (!goal) return { type: "unavailable" as const, cause: "goal_not_found" as const }
    const revision = yield* tx
      .select()
      .from(LearnerGoalRevisionTable)
      .where(
        and(
          eq(LearnerGoalRevisionTable.goal_id, input.goalID),
          eq(LearnerGoalRevisionTable.id, input.revisionID),
          committedRevision,
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!revision) return { type: "unavailable" as const, cause: "revision_not_found" as const }
    const value = yield* revisionRead(tx, revision, input.asOf)
    const identity = {
      id: value.id,
      goalID: value.goalID,
      version: value.version,
      ...(value.predecessorID ? { predecessorID: value.predecessorID } : {}),
      schemaVersion: value.schemaVersion,
      targetVersion: value.targetVersion,
      revisionOrder: value.revisionOrder,
      effectID: value.effectID,
      occurrenceID: value.occurrenceID,
      sourceOrder: value.sourceOrder,
      timeCommitted: value.timeCommitted,
      commitOrder: value.commitOrder,
      frontierSequence: value.frontierSequence,
      source: value.source,
    }
    const wholeReference = exactLearningContextValue(value)
    if (!input.field) {
      const itemCount = 1 + value.conditions.length + (value.scope.type === "courses" ? value.scope.courses.length : 0)
      if (itemCount > input.maxItems) {
        return yield* boundedLearningContextRead(
          {
            type: "over_budget" as const,
            reason: "item_budget" as const,
            goalID: input.goalID,
            revision: identity,
            relationAsOf: input.asOf,
            requiredItems: itemCount,
            required: wholeReference,
            availableFields: learningContextRevisionFields(value),
          },
          input.maxBytes,
        )
      }
      return yield* boundedLearningContextRead(
        {
          type: "available" as const,
          goalID: input.goalID,
          timeCreated: goal.time_created,
          relationAsOf: input.asOf,
          revision: value,
          itemCount,
        },
        input.maxBytes,
        {
          type: "over_budget" as const,
          reason: "byte_budget" as const,
          goalID: input.goalID,
          revision: identity,
          relationAsOf: input.asOf,
          requiredItems: itemCount,
          required: wholeReference,
          availableFields: learningContextRevisionFields(value),
        },
      )
    }

    const offset = input.offset ?? 0
    const field = learningContextField(value, input.field, offset, input.maxItems)
    return yield* boundedLearningContextRead(
      {
        type: "available" as const,
        goalID: input.goalID,
        timeCreated: goal.time_created,
        relationAsOf: input.asOf,
        revision: identity,
        field: input.field,
        value: field,
        itemCount: fieldItemCount(field),
      },
      input.maxBytes,
      {
        type: "over_budget" as const,
        reason: "field_byte_budget" as const,
        goalID: input.goalID,
        revision: identity,
        relationAsOf: input.asOf,
        field: input.field,
        required: exactLearningContextValue(field),
      },
    )
  })
}

function learningContextRevisionFields(value: Revision): readonly LearningContextRevisionField[] {
  return [
    "outcome",
    "conditions",
    "scope",
    "target",
    ...(value.schemaVersion === 1 ? (["fieldBases"] as const) : []),
    "disposition",
  ]
}

function learningContextField(
  revision: Revision,
  field: LearningContextRevisionField,
  offset: number,
  maxItems: number,
) {
  if (field === "conditions") {
    const items = revision.conditions.slice(offset, offset + maxItems)
    return {
      offset,
      items,
      total: revision.conditions.length,
      full: exactLearningContextValue(revision.conditions),
      ...(offset + items.length < revision.conditions.length ? { nextOffset: offset + items.length } : {}),
    }
  }
  if (field === "scope" && revision.scope.type === "courses") {
    const items = revision.scope.courses.slice(offset, offset + maxItems)
    return {
      type: "courses" as const,
      offset,
      items,
      total: revision.scope.courses.length,
      full: exactLearningContextValue(revision.scope),
      ...(offset + items.length < revision.scope.courses.length ? { nextOffset: offset + items.length } : {}),
    }
  }
  if (field === "fieldBases") {
    return revision.schemaVersion === 1
      ? { type: "available" as const, value: revision.fieldBases }
      : { type: "not_applicable" as const }
  }
  return revision[field]
}

function fieldItemCount(value: unknown) {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) return 1
  return value.items.length
}

function exactLearningContextValue(value: unknown) {
  const canonical = JSON.stringify(toJsonValue(value))
  return { canonicalBytes: utf8Bytes(canonical), fingerprint: canonicalFingerprint(toJsonValue(value)) }
}

function boundedLearningContextRead<const T extends Readonly<Record<string, unknown>>>(
  value: T,
  maxBytes: number,
  fallback?: Readonly<Record<string, unknown>>,
) {
  return Effect.gen(function* () {
    const result = measuredLearningContextRead(value)
    if (result.canonicalBytes <= maxBytes) return result
    if (fallback) {
      const bounded = measuredLearningContextRead(fallback)
      if (bounded.canonicalBytes <= maxBytes) return bounded
    }
    return yield* Effect.fail(
      new LearningContextReadError(
        "mandatory_over_budget",
        "The exact Goal revision locator cannot fit within the requested Gate 18 byte budget",
      ),
    )
  })
}

function measuredLearningContextRead<const T extends Readonly<Record<string, unknown>>>(value: T) {
  let canonicalBytes = 0
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = { ...value, canonicalBytes }
    const next = utf8Bytes(JSON.stringify(toJsonValue(result)))
    if (next === canonicalBytes) return result
    canonicalBytes = next
  }
  throw new LearningContextReadError("mandatory_over_budget", "Goal learning-context byte accounting did not converge")
}

export function readEffect(tx: Transaction, effectID: EffectID): Effect.Effect<EffectRead | undefined, IntegrityError> {
  return Effect.gen(function* () {
    const effect = yield* tx
      .select()
      .from(LearnerGoalEffectTable)
      .where(and(eq(LearnerGoalEffectTable.id, effectID), committedEffect))
      .get()
      .pipe(Effect.orDie)
    if (!effect) return undefined
    if (!validEffectID(effect.id)) return yield* integrity(`Goal effect ${effect.id} has an invalid identity`)
    if (effect.schema_version === 2) return yield* readEffectV2(tx, effect)
    if (
      effect.schema_version !== 1 ||
      effect.authorization_basis === "agent_action" ||
      !closedCommand(effect.command) ||
      commandFingerprint(effect.command, effect.authorization_basis) !== effect.semantic_fingerprint
    ) {
      return yield* integrity(`Goal effect ${effect.id} has an invalid semantic address`)
    }
    const [operations, authority] = yield* Effect.all([
      tx
        .select()
        .from(LearnerGoalEffectOperationTable)
        .where(eq(LearnerGoalEffectOperationTable.effect_id, effect.id))
        .orderBy(asc(LearnerGoalEffectOperationTable.ordinal))
        .all()
        .pipe(Effect.orDie),
      tx
        .select({
          receiptID: LearningCommandReceiptTable.id,
          invocationPartID: LearningCommandReceiptTable.invocation_part_id,
          authorizationBasis: LearningCommandInvocationTable.authorization_basis,
          receiptIDOnInvocation: LearningCommandInvocationTable.receipt_id,
          commandSnapshot: LearnerGoalCommandTable.command_snapshot,
          semanticFingerprint: LearnerGoalCommandTable.semantic_fingerprint,
          confirmation: LearnerGoalCommandTable.confirmation_snapshot,
        })
        .from(LearnerGoalCommitSealTable)
        .innerJoin(
          LearningCommandReceiptTable,
          eq(LearningCommandReceiptTable.id, LearnerGoalCommitSealTable.receipt_id),
        )
        .innerJoin(
          LearningCommandInvocationTable,
          eq(LearningCommandInvocationTable.part_id, LearnerGoalCommitSealTable.invocation_part_id),
        )
        .innerJoin(
          LearnerGoalCommandTable,
          eq(LearnerGoalCommandTable.invocation_part_id, LearnerGoalCommitSealTable.invocation_part_id),
        )
        .where(eq(LearnerGoalCommitSealTable.effect_id, effect.id))
        .get()
        .pipe(Effect.orDie),
    ])
    if (!authority || operations.length !== effect.operation_count) {
      return yield* integrity(`Goal effect ${effect.id} lost its receipt or operation set`)
    }
    if (
      !closedCommand(authority.commandSnapshot) ||
      canonicalJson(authority.commandSnapshot) !== canonicalJson(effect.command) ||
      authority.semanticFingerprint !== effect.semantic_fingerprint ||
      authority.authorizationBasis !== effect.authorization_basis ||
      authority.receiptIDOnInvocation !== authority.receiptID
    ) {
      return yield* integrity(`Goal effect ${effect.id} lost its reserved semantic address`)
    }
    const results = operations.map(operationResultFromRow)
    if (results.some((result) => !result)) {
      return yield* integrity(`Goal effect ${effect.id} has an invalid stored operation result`)
    }
    const confirmation = authority.confirmation as unknown
    if (
      (effect.authorization_basis === "learner_acceptance" &&
        (!closedConfirmation(confirmation) ||
          confirmation.semanticFingerprint !== effect.semantic_fingerprint ||
          canonicalJson(confirmation.command) !== canonicalJson(effect.command) ||
          canonicalJson(authority.confirmation) !== canonicalJson(confirmation))) ||
      (effect.authorization_basis === "learner_request" && confirmation !== null)
    ) {
      return yield* integrity(`Goal effect ${effect.id} has an invalid confirmation basis`)
    }
    const validResults = results as OperationResult[]
    const acknowledgementResult = renderAcknowledgement(validResults)
    return {
      schemaVersion: 1,
      effectID: effect.id,
      receiptID: authority.receiptID,
      occurrenceID: effect.occurrence_id,
      authorizationBasis: effect.authorization_basis,
      semanticFingerprint: effect.semantic_fingerprint,
      operations: validResults,
      ...(closedConfirmation(confirmation) ? { confirmation } : {}),
      timeCommitted: effect.time_committed,
      commitOrder: effect.commit_order,
      frontierSequence: effect.frontier_sequence,
      acknowledgementTitle: acknowledgementResult.title,
      acknowledgementBody: acknowledgementResult.body,
    }
  })
}

function readEffectV2(
  tx: Transaction,
  effect: typeof LearnerGoalEffectTable.$inferSelect,
): Effect.Effect<EffectRead, IntegrityError> {
  return Effect.gen(function* () {
    const [rows, authority] = yield* Effect.all([
      tx
        .select()
        .from(LearnerGoalEffectOperationTable)
        .where(eq(LearnerGoalEffectOperationTable.effect_id, effect.id))
        .orderBy(asc(LearnerGoalEffectOperationTable.ordinal))
        .all()
        .pipe(Effect.orDie),
      tx
        .select({
          receiptID: LearningCommandReceiptTable.id,
          invocationPartID: LearningCommandReceiptTable.invocation_part_id,
          authorizationBasis: LearningCommandInvocationTable.authorization_basis,
          receiptIDOnInvocation: LearningCommandInvocationTable.receipt_id,
          disposition: LearnerGoalDispositionV2Table.disposition,
          commandFingerprint: LearnerGoalDispositionV2Table.command_fingerprint,
          canonicalCommand: LearnerGoalDispositionV2Table.canonical_command,
          agentAction: LearnerGoalDispositionV2Table.agent_action_provenance,
          materialized: LearnerGoalDispositionV2Table.materialized_snapshot,
          capabilityOutcome: LearnerGoalCapabilitySettlementV2Table.outcome,
          permissionRequestID: LearnerGoalCapabilitySettlementV2Table.permission_request_id,
        })
        .from(LearnerGoalCommitSealTable)
        .innerJoin(
          LearningCommandReceiptTable,
          eq(LearningCommandReceiptTable.id, LearnerGoalCommitSealTable.receipt_id),
        )
        .innerJoin(
          LearningCommandInvocationTable,
          eq(LearningCommandInvocationTable.part_id, LearnerGoalCommitSealTable.invocation_part_id),
        )
        .innerJoin(
          LearnerGoalDispositionV2Table,
          eq(LearnerGoalDispositionV2Table.invocation_part_id, LearnerGoalCommitSealTable.invocation_part_id),
        )
        .innerJoin(
          LearnerGoalCapabilitySettlementV2Table,
          eq(LearnerGoalCapabilitySettlementV2Table.invocation_part_id, LearnerGoalCommitSealTable.invocation_part_id),
        )
        .where(eq(LearnerGoalCommitSealTable.effect_id, effect.id))
        .get()
        .pipe(Effect.orDie),
    ])
    if (
      !authority ||
      effect.authorization_basis !== "agent_action" ||
      !effect.agent_action_part_id ||
      !effect.materialized_snapshot ||
      authority.authorizationBasis !== "agent_action" ||
      authority.receiptIDOnInvocation !== authority.receiptID ||
      authority.invocationPartID !== effect.agent_action_part_id ||
      authority.disposition !== "candidate_v2" ||
      authority.commandFingerprint !== effect.semantic_fingerprint ||
      !authority.canonicalCommand ||
      !authority.agentAction ||
      !authority.materialized ||
      authority.agentAction.schemaVersion !== 1 ||
      authority.agentAction.invocationPartID !== effect.agent_action_part_id ||
      authority.materialized.schemaVersion !== 2 ||
      effect.materialized_snapshot.schemaVersion !== 2 ||
      canonicalJson(authority.canonicalCommand) !== canonicalJson(effect.command) ||
      canonicalJson(authority.materialized) !== canonicalJson(effect.materialized_snapshot) ||
      canonicalJson(authority.materialized.canonicalCommand) !== canonicalJson(authority.canonicalCommand) ||
      new Bun.CryptoHasher("sha256").update(JSON.stringify(authority.canonicalCommand)).digest("hex") !==
        effect.semantic_fingerprint ||
      (authority.capabilityOutcome !== "policy_allow" && authority.capabilityOutcome !== "prompted_allow")
    ) {
      return yield* integrity(`Goal V2 effect ${effect.id} lost its Agent-action or capability basis`)
    }
    const expected = authority.materialized.operations.map(operationResultV2FromMaterialized)
    const operations = rows.map(
      (row): OperationResultV2 => ({
        schemaVersion: 2,
        ordinal: row.ordinal,
        operation: row.operation_kind,
        result: row.result_kind,
        goalID: row.goal_id,
        revisionID: row.revision_id,
        version: row.version,
        disposition: row.disposition,
        meaning: row.meaning as OperationResultV2["meaning"],
        ...(row.replacement_target_kind
          ? {
              replacementTarget: {
                type: row.replacement_target_kind,
                goalID: row.replacement_target_goal_id!,
                revisionID: row.replacement_target_revision_id!,
                version: row.replacement_target_version!,
              },
            }
          : {}),
      }),
    )
    if (
      rows.length !== effect.operation_count ||
      rows.some((row) => row.schema_version !== 2) ||
      expected.some((operation) => !operation) ||
      canonicalJson(operations) !== canonicalJson(expected)
    ) {
      return yield* integrity(`Goal V2 effect ${effect.id} lost its exact operation projection`)
    }
    return {
      schemaVersion: 2,
      effectID: effect.id,
      receiptID: authority.receiptID,
      occurrenceID: effect.occurrence_id,
      authorizationBasis: "agent_action",
      semanticFingerprint: effect.semantic_fingerprint,
      command: authority.canonicalCommand,
      agentAction: authority.agentAction,
      materialized: authority.materialized,
      capability: {
        outcome: authority.capabilityOutcome,
        ...(authority.permissionRequestID ? { permissionRequestID: authority.permissionRequestID } : {}),
      },
      operations,
      timeCommitted: effect.time_committed,
      commitOrder: effect.commit_order,
      frontierSequence: effect.frontier_sequence,
      acknowledgementTitle: effect.acknowledgement_title,
      acknowledgementBody: effect.acknowledgement_body,
    }
  })
}

function operationResultV2FromMaterialized(
  operation: MaterializedChangeSetV2["operations"][number],
): OperationResultV2 | undefined {
  if (operation.after.schemaVersion !== 2 || !closedTargetValueV2(operation.after.target)) return undefined
  const replacementTarget = operation.replacementTarget
  if (replacementTarget && replacementTarget.after.schemaVersion !== 2) return undefined
  return {
    schemaVersion: 2,
    ordinal: operation.ordinal,
    operation: operation.operation,
    result: operation.result,
    goalID: operation.after.goalID,
    revisionID: operation.after.revisionID,
    version: operation.after.version,
    disposition: operation.after.disposition.type,
    meaning: {
      outcome: operation.after.outcome,
      conditions: operation.after.conditions,
      scope:
        operation.after.scope.type === "learner_home"
          ? { type: "learner_home" }
          : { type: "courses", courseIDs: operation.after.scope.courses.map((course) => course.courseID) },
      target: operation.after.target,
    },
    ...(replacementTarget
      ? {
          replacementTarget: {
            type: replacementTarget.type,
            goalID: replacementTarget.after.goalID,
            revisionID: replacementTarget.after.revisionID,
            version: replacementTarget.after.version,
          },
        }
      : {}),
  }
}

function operationResultFromRow(row: typeof LearnerGoalEffectOperationTable.$inferSelect): OperationResult | undefined {
  if (row.schema_version !== 1) return undefined
  const result = {
    ordinal: row.ordinal,
    operation: row.operation_kind,
    result: row.result_kind,
    goalID: row.goal_id,
    revisionID: row.revision_id,
    version: row.version,
    disposition: row.disposition,
    meaning: row.meaning,
    ...(row.replacement_target_kind !== null
      ? {
          replacementTarget: {
            type: row.replacement_target_kind,
            goalID: row.replacement_target_goal_id,
            revisionID: row.replacement_target_revision_id,
            version: row.replacement_target_version,
          },
        }
      : {}),
  }
  return isOperationResult(result) ? result : undefined
}

function revisionRead(tx: Transaction, row: StoredHead, asOf: number): Effect.Effect<Revision, IntegrityError> {
  return Effect.gen(function* () {
    const [conditions, courses, fieldRows, supersession, occurrence, tombstone, receipt] = yield* Effect.all([
      tx
        .select()
        .from(LearnerGoalConditionTable)
        .where(eq(LearnerGoalConditionTable.revision_id, row.id))
        .orderBy(asc(LearnerGoalConditionTable.ordinal))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(LearnerGoalCourseScopeTable)
        .where(eq(LearnerGoalCourseScopeTable.revision_id, row.id))
        .orderBy(asc(LearnerGoalCourseScopeTable.course_id))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(LearnerGoalFieldBasisTable)
        .where(eq(LearnerGoalFieldBasisTable.revision_id, row.id))
        .all()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(LearnerGoalSupersessionTable)
        .where(eq(LearnerGoalSupersessionTable.revision_id, row.id))
        .get()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(AdmittedLearnerOccurrenceTable)
        .where(eq(AdmittedLearnerOccurrenceTable.id, row.occurrence_id))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ timeDeleted: LearnerOccurrenceTombstoneTable.time_deleted })
        .from(LearnerOccurrenceTombstoneTable)
        .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, row.occurrence_id))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: LearningCommandReceiptTable.id })
        .from(LearnerGoalCommitSealTable)
        .innerJoin(
          LearningCommandReceiptTable,
          eq(LearningCommandReceiptTable.id, LearnerGoalCommitSealTable.receipt_id),
        )
        .where(eq(LearnerGoalCommitSealTable.effect_id, row.effect_id))
        .get()
        .pipe(Effect.orDie),
    ])
    if (!occurrence?.source_order || !receipt) {
      return yield* integrity(`Goal revision ${row.id} lost source or receipt authority`)
    }
    if (conditions.some((condition, ordinal) => condition.ordinal !== ordinal)) {
      return yield* integrity(`Goal revision ${row.id} has non-contiguous conditions`)
    }
    const fieldBases = row.schema_version === 1 ? yield* readFieldBases(row.id, fieldRows) : undefined
    if (row.schema_version === 2 && fieldRows.length !== 0) {
      return yield* integrity(`Goal V2 revision ${row.id} unexpectedly has historical field bases`)
    }
    const scopeCourses = yield* Effect.forEach(courses, (course) =>
      Effect.gen(function* () {
        const availability = yield* Course.inspectPreferenceTarget(tx, course.course_id)
        const common = {
          courseID: course.course_id,
          courseTitle: course.course_title,
          availability:
            availability.status === "available"
              ? ({ state: "available", title: availability.title } as const)
              : {
                  state: "unavailable" as const,
                  cause: availability.cause,
                  ...(availability.title ? { title: availability.title } : {}),
                },
        }
        if (row.schema_version === 1) {
          return {
            ...common,
            admission:
              course.admission_kind === "new"
                ? {
                    type: "new",
                    courseVersion: course.admitted_course_version!,
                    courseTimeUpdated: course.admitted_course_time_updated!,
                  }
                : { type: "carried", predecessorRevisionID: course.carried_from_revision_id! },
          } satisfies StoredCourseMembership
        }
        return {
          ...common,
          admission:
            course.admission_kind === "new"
              ? {
                  type: "bound",
                  courseVersion: course.admitted_course_version!,
                  courseTimeUpdated: course.admitted_course_time_updated!,
                }
              : { type: "carried", predecessorRevisionID: course.carried_from_revision_id! },
        } satisfies StoredCourseMembershipV2
      }),
    )
    if (
      (row.scope_kind === "learner_home" && scopeCourses.length !== 0) ||
      (row.scope_kind === "courses" && scopeCourses.length === 0) ||
      (row.disposition === "superseded" && !supersession) ||
      (row.disposition !== "superseded" && supersession)
    ) {
      return yield* integrity(`Goal revision ${row.id} has a malformed scope or disposition`)
    }
    const currentTarget = supersession ? yield* goalHead(tx, supersession.target_goal_id) : undefined
    const disposition: Disposition = supersession
      ? {
          type: "superseded",
          targetGoalID: supersession.target_goal_id,
          targetRevisionID: supersession.target_revision_id,
          ...(currentTarget
            ? { targetCurrentHead: { revisionID: currentTarget.id, version: currentTarget.version } }
            : {}),
        }
      : { type: row.disposition as NonSupersededDisposition }
    const common = {
      id: row.id,
      goalID: row.goal_id,
      version: row.version,
      ...(row.predecessor_id ? { predecessorID: row.predecessor_id } : {}),
      outcome: row.outcome,
      conditions: conditions.map((condition) => condition.content),
      targetRelation: targetRelation(row, asOf),
      disposition,
      occurrenceID: row.occurrence_id,
      sourceOrder: row.source_order,
      effectID: row.effect_id,
      operationOrdinal: row.operation_ordinal,
      revisionOrder: row.revision_order,
      timeCommitted: row.time_committed,
      commitOrder: row.commit_order,
      frontierSequence: row.frontier_sequence,
      source: {
        occurrenceID: occurrence.id,
        sourceOrder: occurrence.source_order,
        originSessionID: occurrence.origin_session_id,
        originMessageID: occurrence.origin_message_id,
        availability: tombstone
          ? ({ state: "source_unavailable", timeDeleted: tombstone.timeDeleted } as const)
          : ({ state: "available" } as const),
      },
    }
    if (row.schema_version === 1 && fieldBases) {
      const scope: StoredScope =
        row.scope_kind === "learner_home"
          ? { type: "learner_home" }
          : { type: "courses", courses: scopeCourses as readonly StoredCourseMembership[] }
      return {
        ...common,
        schemaVersion: 1 as const,
        targetVersion: 1 as const,
        scope,
        target: target(row),
        fieldBases,
      }
    }
    if (row.schema_version !== 2 || !closedTargetValueV2(row.target_value_v2)) {
      return yield* integrity(`Goal revision ${row.id} has an invalid V2 target projection`)
    }
    const scope: StoredScopeV2 =
      row.scope_kind === "learner_home"
        ? { type: "learner_home" }
        : { type: "courses", courses: scopeCourses as readonly StoredCourseMembershipV2[] }
    return {
      ...common,
      schemaVersion: 2 as const,
      targetVersion: 2 as const,
      scope,
      target: row.target_value_v2,
    }
  })
}

function readFieldBases(
  revisionID: RevisionID,
  rows: readonly (typeof LearnerGoalFieldBasisTable.$inferSelect)[],
): Effect.Effect<FieldBases, IntegrityError> {
  const fields: FieldName[] = ["outcome", "conditions", "scope", "target", "disposition"]
  const values = new Map(rows.map((row) => [row.field, row]))
  if (rows.length !== fields.length || fields.some((field) => !values.has(field))) {
    return integrity(`Goal revision ${revisionID} has an incomplete field-basis set`)
  }
  const basis = (field: FieldName): FieldBases[FieldName] => {
    const row = values.get(field)!
    if (row.basis_kind === "authored") return { type: "authored", sourceExcerpt: row.source_excerpt! }
    if (row.basis_kind === "accepted") return { type: "accepted" }
    return { type: "carried", predecessorRevisionID: row.predecessor_revision_id! }
  }
  return Effect.succeed({
    outcome: basis("outcome"),
    conditions: basis("conditions"),
    scope: basis("scope"),
    target: basis("target"),
    disposition: basis("disposition"),
  })
}

function targetRelation(row: StoredHead, asOf: number): TargetRelation {
  if (row.schema_version === 2) {
    if (!closedTargetValueV2(row.target_value_v2)) {
      throw new IntegrityError({ detail: `Goal revision ${row.id} has an invalid V2 target` })
    }
    if (row.target_value_v2.type === "absent") return "unknown"
    if (row.target_value_v2.type === "instant") {
      if (asOf < row.target_value_v2.instant) return "before"
      if (asOf === row.target_value_v2.instant) return "reached"
      return "after"
    }
    const current = localDateAtResolvedZone(asOf, row.target_value_v2.resolvedZone)
    if (current < row.target_value_v2.date) return "before"
    if (current === row.target_value_v2.date) return "on"
    return "after"
  }
  if (row.target_kind === "absent") return "unknown"
  if (row.target_kind === "instant") {
    if (
      row.target_instant === null ||
      row.target_normalized === null ||
      row.target_utc_offset_minutes === null ||
      Date.parse(row.target_normalized) !== row.target_instant ||
      explicitOffsetMinutes(row.target_normalized) !== row.target_utc_offset_minutes ||
      row.target_timezone !== null ||
      row.target_timezone_release_id !== null ||
      row.target_normalization_basis !== "explicit_offset"
    )
      throw new IntegrityError({ detail: `Goal revision ${row.id} has an invalid target instant` })
    if (asOf < row.target_instant) return "before"
    if (asOf === row.target_instant) return "reached"
    return "after"
  }
  if (
    !row.target_local_date ||
    !row.target_timezone ||
    row.target_timezone_release_id !== TIME_ZONE_RELEASE_ID ||
    !validDate(row.target_local_date) ||
    !validTimeZone(row.target_timezone)
  ) {
    throw new IntegrityError({ detail: `Goal revision ${row.id} lost local target date` })
  }
  const current = localDateAt(asOf, row.target_timezone)
  if (current < row.target_local_date) return "before"
  if (current === row.target_local_date) return "on"
  return "after"
}

function closedTargetValueV2(value: unknown): value is TargetValueV2 {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).toSorted()
  if (value.type === "absent") return keys.length === 1 && keys[0] === "type"
  if (value.type === "instant") {
    return (
      keys.length === 4 &&
      keys[0] === "instant" &&
      keys[1] === "resolvedZone" &&
      keys[2] === "type" &&
      keys[3] === "utcOffsetMinutes" &&
      Number.isInteger(value.instant) &&
      (value.instant as number) >= 0 &&
      Number.isInteger(value.utcOffsetMinutes) &&
      (value.utcOffsetMinutes as number) >= -840 &&
      (value.utcOffsetMinutes as number) <= 840 &&
      closedResolvedZoneV2(value.resolvedZone)
    )
  }
  return (
    value.type === "local_date" &&
    keys.length === 3 &&
    keys[0] === "date" &&
    keys[1] === "resolvedZone" &&
    keys[2] === "type" &&
    typeof value.date === "string" &&
    validDate(value.date) &&
    closedResolvedZoneV2(value.resolvedZone)
  )
}

function closedResolvedZoneV2(value: unknown): value is ResolvedZoneV2 {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).toSorted()
  if (value.type === "fixed_offset") {
    return (
      keys.length === 2 &&
      keys[0] === "offsetMinutes" &&
      keys[1] === "type" &&
      Number.isInteger(value.offsetMinutes) &&
      (value.offsetMinutes as number) >= -840 &&
      (value.offsetMinutes as number) <= 840
    )
  }
  return (
    value.type === "iana" &&
    keys.length === 3 &&
    keys[0] === "name" &&
    keys[1] === "releaseID" &&
    keys[2] === "type" &&
    typeof value.name === "string" &&
    isSupportedTimeZone(value.name) &&
    value.releaseID === TIME_ZONE_RELEASE_ID
  )
}

function requireState(tx: Transaction) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(LearnerGoalStateTable)
      .where(eq(LearnerGoalStateTable.singleton, 1))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* integrity("Learner Goal state is unavailable")
    return { revisionSequence: row.revision_sequence }
  })
}

function requireEligibleOccurrence(tx: Transaction, occurrenceID: Invocation["envelope"]["occurrenceID"]) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.id, occurrenceID))
      .get()
      .pipe(Effect.orDie)
    if (!row?.source_order || !row.source_temporal_state) return yield* invalid("validation_error")
    return row as typeof row & { source_order: number; source_temporal_state: "resolved" | "unavailable" }
  })
}

function learnerText(tx: Transaction, sessionID: SessionSchema.ID, messageID: MessageID) {
  return Effect.gen(function* () {
    const message = yield* tx
      .select({ id: MessageTable.id })
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, sessionID), eq(MessageTable.id, messageID)))
      .get()
      .pipe(Effect.orDie)
    if (!message) return yield* invalid("source_unavailable")
    const parts = yield* tx
      .select({ data: PartTable.data })
      .from(PartTable)
      .where(and(eq(PartTable.session_id, sessionID), eq(PartTable.message_id, messageID)))
      .orderBy(asc(PartTable.time_created), asc(PartTable.id))
      .all()
      .pipe(Effect.orDie)
    return parts
      .flatMap((part) => {
        if (part.data.type !== "text") return []
        const text = part.data as Omit<SessionV1.TextPart, "id" | "sessionID" | "messageID">
        return text.synthetic === true ? [] : [text.text]
      })
      .join("\n")
  })
}

function canonicalCommand(command: Command): Command {
  return {
    operations: command.operations.map((operation) => {
      if (operation.type === "create") {
        return { ...operation, snapshot: canonicalSnapshot(operation.snapshot) }
      }
      if (operation.type === "update") {
        return { ...operation, snapshot: canonicalSnapshot(operation.snapshot) }
      }
      return {
        ...operation,
        snapshot: canonicalSnapshot(operation.snapshot),
        target:
          operation.target.type === "existing"
            ? operation.target
            : { ...operation.target, snapshot: canonicalSnapshot(operation.target.snapshot) },
      }
    }),
  }
}

function canonicalSnapshot(snapshot: SemanticSnapshot): SemanticSnapshot {
  return {
    outcome: normalizeText(snapshot.outcome),
    conditions: snapshot.conditions.map(normalizeText),
    scope:
      snapshot.scope.type === "learner_home"
        ? snapshot.scope
        : {
            type: "courses",
            courses: [...snapshot.scope.courses].sort((left, right) => left.courseID.localeCompare(right.courseID)),
          },
    target:
      snapshot.target.type === "absent"
        ? snapshot.target
        : {
            ...snapshot.target,
            sourceExpression: normalizeText(snapshot.target.sourceExpression),
            ...(snapshot.target.type === "instant" ? { normalized: normalizeText(snapshot.target.normalized) } : {}),
          },
    fieldBases: Object.fromEntries(
      Object.entries(snapshot.fieldBases).map(([field, basis]) => [
        field,
        basis.type === "authored" ? { ...basis, sourceExcerpt: normalizeText(basis.sourceExcerpt) } : basis,
      ]),
    ) as FieldBases,
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  return `{${Object.entries(value)
    .filter((entry) => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`
}

function normalizeText(value: string) {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
}

function bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validTimeZone(value: string) {
  return isSupportedTimeZone(value)
}

export function renderAcknowledgement(results: readonly OperationResult[]) {
  const changed = results.filter((result) => result.result === "changed")
  const unchanged = results.length - changed.length
  const summaries = results.map((result) => {
    const scope =
      result.meaning.scope.type === "learner_home"
        ? "LearnerHome-wide"
        : `Courses ${result.meaning.scope.courseIDs.join(", ")}`
    const target =
      result.meaning.target.type === "absent"
        ? "no target"
        : result.meaning.target.type === "instant"
          ? `target ${result.meaning.target.normalized}`
          : `target ${result.meaning.target.date} (${result.meaning.target.timeZone})`
    const conditions = result.meaning.conditions.length
      ? `; conditions: ${result.meaning.conditions.map((condition) => `“${displayText(condition)}”`).join(", ")}`
      : "; no attainment conditions"
    const replacement =
      result.operation === "replace" && result.replacementTarget
        ? `; replaced by ${result.replacementTarget.goalID} at v${result.replacementTarget.version}`
        : ""
    return `#${result.ordinal + 1} ${result.result}: “${displayText(result.meaning.outcome)}”${conditions}; ${scope}; ${target}; ${result.disposition} (Goal ${result.goalID}, v${result.version})${replacement}`
  })
  if (changed.length === 0) {
    return {
      title: "Learning Goals unchanged",
      body: `${summaries.join(". ")}. No Goal revision was written. You can correct any stored Goal with a later explicit request.`,
    }
  }
  return {
    title: changed.length === 1 ? "Updated learning Goal" : "Updated learning Goals",
    body: `${summaries.join(". ")}.${unchanged ? ` ${unchanged} requested item${unchanged === 1 ? " was" : "s were"} unchanged.` : ""} You can correct any stored Goal with a later explicit request.`,
  }
}

function displayText(value: string) {
  return value.replaceAll("\n", " ⏎ ")
}

function courseError(error: unknown) {
  if (error instanceof Course.InactiveError || error instanceof Course.NotFoundError) {
    return new InvalidCommandError({ reason: "inactive" })
  }
  if (error instanceof Course.ConflictError) return new InvalidCommandError({ reason: "stale" })
  return new InvalidCommandError({ reason: "validation_error" })
}

function prepareActiveCourseProof(
  tx: Transaction,
  input: { readonly courseID: Course.CourseID; readonly expectedVersion: number },
) {
  return Effect.gen(function* () {
    const availability = yield* Course.inspectPreferenceTarget(tx, input.courseID)
    if (availability.status !== "available") return yield* invalid("inactive")
    return yield* Course.prepareActiveOwnerProof(tx, input).pipe(Effect.mapError((error) => courseError(error)))
  })
}

function invalid(reason: InvalidCommandError["reason"]) {
  return Effect.fail(new InvalidCommandError({ reason }))
}

function integrity(detail: string) {
  return Effect.fail(new IntegrityError({ detail }))
}
