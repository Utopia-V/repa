export * as LearnerGoalSchema from "./schema"

import { Schema } from "effect"
import type { Course } from "../course"
import { Identifier } from "../id/id"
import type { OccurrenceID } from "../learning-command/occurrence-schema"
import type { AuthorizationBasis, InvocationEnvelope, ReceiptID } from "../learning-command/schema"
import type { SessionSchema } from "../session/schema"
import type { MessageID } from "../v1/session"
import type { PermissionV1 } from "../v1/permission"

export const GoalID = Schema.String.check(Schema.isPattern(/^gol_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerGoal.GoalID"),
)
export type GoalID = typeof GoalID.Type

export const RevisionID = Schema.String.check(Schema.isPattern(/^glr_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerGoal.RevisionID"),
)
export type RevisionID = typeof RevisionID.Type

export const EffectID = Schema.String.check(Schema.isPattern(/^gle_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerGoal.EffectID"),
)
export type EffectID = typeof EffectID.Type

const decodeGoalID = Schema.decodeUnknownSync(GoalID)
const decodeRevisionID = Schema.decodeUnknownSync(RevisionID)
const decodeEffectID = Schema.decodeUnknownSync(EffectID)

export const createGoalID = () => decodeGoalID(Identifier.create("gol", "ascending"))
export const createRevisionID = () => decodeRevisionID(Identifier.create("glr", "ascending"))
export const createEffectID = () => decodeEffectID(Identifier.create("gle", "ascending"))

export const SCHEMA_VERSION = 1 as const
export const PERMISSION_PATTERN = "learner_home" as const
export const MAX_OPERATIONS = 8
export const MAX_CONDITIONS = 16
export const MAX_COURSES = 16
export const MAX_OUTCOME_BYTES = 4_096
export const MAX_CONDITION_BYTES = 2_048
export const MAX_SOURCE_EXCERPT_BYTES = 2_048
export const MAX_AGGREGATE_BYTES = 32_768

export type FieldName = "outcome" | "conditions" | "scope" | "target" | "disposition"

export type FieldBasis =
  | Readonly<{ type: "authored"; sourceExcerpt: string }>
  | Readonly<{ type: "accepted" }>
  | Readonly<{ type: "carried"; predecessorRevisionID: RevisionID }>

export type FieldBases = Readonly<Record<FieldName, FieldBasis>>

export type CourseMembership = Readonly<{
  courseID: Course.CourseID
  basis:
    | Readonly<{ type: "new"; expectedCourseVersion: number }>
    | Readonly<{ type: "carried"; predecessorRevisionID: RevisionID }>
}>

export type Scope =
  | Readonly<{ type: "learner_home" }>
  | Readonly<{ type: "courses"; courses: readonly CourseMembership[] }>

export type Target =
  | Readonly<{ type: "absent" }>
  | Readonly<{
      type: "instant"
      instant: number
      sourceExpression: string
      normalized: string
      utcOffsetMinutes: number
      normalizationBasis: "explicit_offset"
    }>
  | Readonly<{
      type: "local_date"
      date: string
      timeZone: string
      sourceExpression: string
      normalizationBasis: "explicit_date" | "source_temporal_context"
    }>

export type SemanticSnapshot = Readonly<{
  outcome: string
  conditions: readonly string[]
  scope: Scope
  target: Target
  fieldBases: FieldBases
}>

export type NonSupersededDisposition = "active" | "achieved" | "abandoned"

export type UpdateDisposition =
  | Readonly<{ type: NonSupersededDisposition }>
  | Readonly<{ type: "superseded"; targetGoalID: GoalID; targetRevisionID: RevisionID }>

export type CreateOperation = Readonly<{
  type: "create"
  snapshot: SemanticSnapshot
  disposition: NonSupersededDisposition
}>

export type UpdateOperation = Readonly<{
  type: "update"
  goalID: GoalID
  expectedHeadID: RevisionID
  expectedVersion: number
  snapshot: SemanticSnapshot
  disposition: UpdateDisposition
}>

export type ExistingReplacementTarget = Readonly<{
  type: "existing"
  goalID: GoalID
  revisionID: RevisionID
  version: number
}>

export type NewReplacementTarget = Readonly<{
  type: "new"
  snapshot: SemanticSnapshot
  disposition: NonSupersededDisposition
}>

export type ReplaceOperation = Readonly<{
  type: "replace"
  goalID: GoalID
  expectedHeadID: RevisionID
  expectedVersion: number
  snapshot: SemanticSnapshot
  target: ExistingReplacementTarget | NewReplacementTarget
}>

export type Operation = CreateOperation | UpdateOperation | ReplaceOperation

export type Command = Readonly<{ operations: readonly Operation[] }>

export type DirectInvocation = Readonly<{
  envelope: InvocationEnvelope & Readonly<{ authorizationBasis: "learner_request" }>
  command: Command
}>

export type AcceptedInvocation = Readonly<{
  envelope: InvocationEnvelope & Readonly<{ authorizationBasis: "learner_acceptance" }>
  command: Command
  permissionRequestID: PermissionV1.ID
}>

export type Invocation = DirectInvocation | AcceptedInvocation

export type ConfirmationCourse = Readonly<{
  operationOrdinal: number
  revisionRole: "source" | "target"
  courseID: Course.CourseID
  courseTitle: string
  admission:
    | Readonly<{ type: "new"; courseVersion: number; courseTimeUpdated: number }>
    | Readonly<{ type: "carried"; predecessorRevisionID: RevisionID }>
  availability:
    | Readonly<{ state: "available"; title: string; courseVersion: number; courseTimeUpdated: number }>
    | Readonly<{ state: "unavailable"; cause: "course_not_found" }>
    | Readonly<{
        state: "unavailable"
        cause: "course_withdrawn"
        title: string
        courseVersion: number
        courseTimeUpdated: number
      }>
}>

export type ConfirmationGoal = Readonly<{
  goalID: GoalID
  revisionID: RevisionID
  version: number
  outcome: string
  disposition: "active" | "achieved" | "abandoned" | "superseded"
}>

export type ConfirmationSnapshot = Readonly<{
  schemaVersion: typeof SCHEMA_VERSION
  authorizationBasis: "learner_acceptance"
  semanticFingerprint: string
  command: Command
  goalBases: readonly ConfirmationGoal[]
  courseBases: readonly ConfirmationCourse[]
}>

export type StoredCourseMembership = Readonly<{
  courseID: Course.CourseID
  courseTitle: string
  admission:
    | Readonly<{ type: "new"; courseVersion: number; courseTimeUpdated: number }>
    | Readonly<{ type: "carried"; predecessorRevisionID: RevisionID }>
  availability:
    | Readonly<{ state: "available"; title: string }>
    | Readonly<{ state: "unavailable"; cause: "course_not_found" | "course_withdrawn"; title?: string }>
}>

export type StoredScope =
  | Readonly<{ type: "learner_home" }>
  | Readonly<{ type: "courses"; courses: readonly StoredCourseMembership[] }>

export type Disposition =
  | Readonly<{ type: NonSupersededDisposition }>
  | Readonly<{
      type: "superseded"
      targetGoalID: GoalID
      targetRevisionID: RevisionID
      targetCurrentHead?: Readonly<{ revisionID: RevisionID; version: number }>
    }>

export type TargetRelation = "before" | "reached" | "after" | "on" | "unknown"

export type SourceRead = Readonly<{
  occurrenceID: OccurrenceID
  sourceOrder: number
  originSessionID: SessionSchema.ID
  originMessageID: MessageID
  availability: Readonly<{ state: "available" }> | Readonly<{ state: "source_unavailable"; timeDeleted: number }>
}>

export type Revision = Readonly<{
  id: RevisionID
  goalID: GoalID
  version: number
  predecessorID?: RevisionID
  outcome: string
  conditions: readonly string[]
  scope: StoredScope
  target: Target
  targetRelation: TargetRelation
  disposition: Disposition
  fieldBases: FieldBases
  occurrenceID: OccurrenceID
  sourceOrder: number
  effectID: EffectID
  operationOrdinal: number
  revisionOrder: number
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
  source: SourceRead
}>

export type GoalRead = Readonly<{
  goalID: GoalID
  timeCreated: number
  head: Revision
}>

export type OperationResult = Readonly<{
  ordinal: number
  operation: "create" | "update" | "replace"
  result: "changed" | "no_change"
  goalID: GoalID
  revisionID: RevisionID
  version: number
  disposition: "active" | "achieved" | "abandoned" | "superseded"
  meaning: Readonly<{
    outcome: string
    conditions: readonly string[]
    scope: Readonly<{ type: "learner_home" }> | Readonly<{ type: "courses"; courseIDs: readonly Course.CourseID[] }>
    target: Target
  }>
  replacementTarget?: Readonly<{
    type: "existing" | "new"
    goalID: GoalID
    revisionID: RevisionID
    version: number
  }>
}>

/**
 * A title-bearing, command-equivalent snapshot for consequential presentation.
 * It is a trusted rendering input, not a new Goal authority: identities and
 * versions still bind it to the owning command/revisions, while consumers must
 * omit those opaque identities from learner-facing prose.
 */
export type PresentationCourse = Readonly<{
  courseID: Course.CourseID
  courseTitle: string
  basis:
    | Readonly<{ type: "new"; expectedCourseVersion: number }>
    | Readonly<{ type: "carried"; predecessorRevisionID: RevisionID }>
  availability:
    | Readonly<{ state: "available"; title: string }>
    | Readonly<{ state: "unavailable"; cause: "course_not_found" | "course_withdrawn"; title?: string }>
}>

export type PresentationMeaning = Readonly<{
  outcome: string
  conditions: readonly string[]
  scope:
    | Readonly<{ type: "learner_home" }>
    | Readonly<{ type: "courses"; courses: readonly PresentationCourse[] }>
  target: Target
  disposition: "active" | "achieved" | "abandoned" | "superseded"
  fieldBases: FieldBases
}>

export type ProposalPresentationOperation =
  | Readonly<{
      type: "create"
      resultIntent: "create_new_goal"
      meaning: PresentationMeaning
    }>
  | Readonly<{
      type: "update"
      resultIntent: "update_existing_goal" | "supersede_with_existing_goal"
      goalID: GoalID
      expectedHeadID: RevisionID
      expectedVersion: number
      source: Readonly<{
        goalID: GoalID
        revisionID: RevisionID
        version: number
        meaning: PresentationMeaning
      }>
      meaning: PresentationMeaning
      supersessionTarget?: Readonly<{
        goalID: GoalID
        revisionID: RevisionID
        version: number
        meaning: PresentationMeaning
      }>
    }>
  | Readonly<{
      type: "replace"
      resultIntent: "supersede_with_existing_goal" | "supersede_with_new_goal"
      goalID: GoalID
      expectedHeadID: RevisionID
      expectedVersion: number
      source: Readonly<{
        goalID: GoalID
        revisionID: RevisionID
        version: number
        meaning: PresentationMeaning
      }>
      meaning: PresentationMeaning
      replacementTarget:
        | Readonly<{
            type: "existing"
            goalID: GoalID
            revisionID: RevisionID
            version: number
            meaning: PresentationMeaning
          }>
        | Readonly<{
            type: "new"
            meaning: PresentationMeaning
          }>
    }>

export type ProposalPresentation = Readonly<{
  authorizationBasis: AuthorizationBasis
  semanticFingerprint: string
  operations: readonly ProposalPresentationOperation[]
}>

export type ResultPresentationOperation = Readonly<{
  ordinal: number
  operation: "create" | "update" | "replace"
  result: "changed" | "no_change"
  goalID: GoalID
  revisionID: RevisionID
  version: number
  meaning: PresentationMeaning
  supersessionTarget?: Readonly<{
    goalID: GoalID
    revisionID: RevisionID
    version: number
    meaning: PresentationMeaning
  }>
  replacementTarget?: Readonly<{
    type: "existing" | "new"
    goalID: GoalID
    revisionID: RevisionID
    version: number
    meaning: PresentationMeaning
  }>
}>

export type AppliedSettlement = Readonly<{
  outcome: "applied"
  goalKind: "learner_goal"
  receiptID: ReceiptID
  effectID: EffectID
  authorizationBasis: AuthorizationBasis
  confirmationRequestID?: PermissionV1.ID
  operations: readonly OperationResult[]
  acknowledgementTitle: string
  acknowledgementBody: string
  frontierSequence: number
  settlementTime: number
  settlementOrder: number
}>

export type AlreadyAppliedSettlement = Omit<AppliedSettlement, "outcome"> &
  Readonly<{
    outcome: "already_applied"
    currentHeads: readonly Readonly<{ goalID: GoalID; revisionID: RevisionID; version: number }>[]
  }>

export type NoChangeSettlement = Readonly<{
  outcome: "no_change"
  goalKind: "learner_goal"
  operations: readonly OperationResult[]
  acknowledgementTitle: string
  acknowledgementBody: string
  settlementTime: number
  settlementOrder: number
}>

export type EffectRead = Readonly<{
  effectID: EffectID
  receiptID: ReceiptID
  occurrenceID: OccurrenceID
  authorizationBasis: AuthorizationBasis
  semanticFingerprint: string
  operations: readonly OperationResult[]
  confirmation?: ConfirmationSnapshot
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
  acknowledgementTitle: string
  acknowledgementBody: string
}>

export type PageOptions = Readonly<{ limit?: number; cursor?: string }>
export type DiscoveryFilter = Readonly<{
  disposition?: "active" | "achieved" | "abandoned" | "superseded"
  courseID?: Course.CourseID
}>
export type DiscoveryPage = Readonly<{
  throughRevision: number
  items: readonly GoalRead[]
  cursor?: string
}>
export type HistoryPage = Readonly<{
  goalID: GoalID
  throughRevision: number
  items: readonly Revision[]
  cursor?: string
}>

export class InvalidCommandError extends Schema.TaggedErrorClass<InvalidCommandError>()(
  "LearnerGoal.InvalidCommandError",
  {
    reason: Schema.Union([
      Schema.Literal("validation_error"),
      Schema.Literal("source_unavailable"),
      Schema.Literal("temporal_context_unavailable"),
      Schema.Literal("stale"),
      Schema.Literal("inactive"),
      Schema.Literal("capacity_exceeded"),
      Schema.Literal("dependency_incomplete"),
      Schema.Literal("relation_conflict"),
    ]),
  },
) {}

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()("LearnerGoal.IntegrityError", {
  detail: Schema.String,
}) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "LearnerGoal.InvalidCursorError",
  {
    detail: Schema.String,
  },
) {}
