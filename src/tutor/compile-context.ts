import type { Database } from "bun:sqlite"
import {
  beginModelOperation,
  readLastStateTransitionAt,
  readLatestSessionEventAt,
  readSessionSequence,
  readStateRevision,
  type ModelContextCut,
} from "../interaction/records"
import {
  readActiveCourseContext,
  type ActiveCourseContext,
} from "../learning/curriculum/course-view"
import {
  readConditionalFutureAttentionCandidate,
  readFutureAttentionContext,
  type FutureAttentionContextConcern,
} from "../learning/agenda/future-attention"
import {
  readAssignmentContext,
  type AssignmentContextItem,
} from "../learning/agenda/assignment"
import { enablesAssignments, enablesConditionalFutureAttention } from "./policy-profile"

export type ActiveLearnerSteering = {
  effectId: string
  sourceItemId: string
  sourceSequence: number
  verbatimExcerpt: string
  effectiveFrom: number
  validUntil: number
  interpretationModelOperationId: string
  interpretationTimeZone: string
}

export type ConditionalCurrentPurpose = Readonly<{
  kind: "agenda_future_attention"
  priority: "below_exact_current_request"
  source: Readonly<{
    concernId: string
    concernVersion: number
    sourceItemId: string
    target: Readonly<{
      courseId: string
      courseViewRevisionId: string
      courseItemId: string
    }>
    exactReason: string
  }>
  learnerRoleConstraint: Readonly<{
    kind: "learner_response_before_tutor_disclosure"
  }>
  scope: "current_turn"
}>

export type TutorContext = {
  activeLearnerSteering: readonly Readonly<ActiveLearnerSteering>[]
  activeCourse: Readonly<ActiveCourseContext> | null
  futureAttention: Readonly<{
    totalOpen: number
    concerns: readonly Readonly<FutureAttentionContextConcern>[]
  }>
  assignments: Readonly<{
    totalActive: number
    offset: number
    assignments: readonly Readonly<AssignmentContextItem>[]
  }>
  conditionalCurrentPurpose: ConditionalCurrentPurpose | null
  policyPrompt: string
}

export type TutorContextCut = ModelContextCut<TutorContext>

export function beginTutorModelOperation(
  database: Database,
  input: {
    modelOperationId: string
    turnId: string
    sessionId: string
    sampledAt: number
    timeZone: string
    policyProfileRevision: string
  },
) {
  const sampling = {
    sessionId: input.sessionId,
    sampledAt: input.sampledAt,
    timeZone: input.timeZone,
    policyProfileRevision: input.policyProfileRevision,
  }
  return beginModelOperation(database, {
    modelOperationId: input.modelOperationId,
    turnId: input.turnId,
    sampling,
    compileContext: () => compileTutorContext(database, sampling),
  })
}

export function compileTutorContext(
  database: Database,
  input: {
    sessionId: string
    sampledAt: number
    timeZone: string
    policyProfileRevision: string
  },
): TutorContextCut {
  assertTimestamp(input.sampledAt, "sampledAt")
  assertTimeZone(input.timeZone)
  if (!input.policyProfileRevision.trim()) {
    throw new Error("policyProfileRevision must not be empty")
  }
  return database.transaction(() => {
    const latestSessionEventAt = readLatestSessionEventAt(database, input.sessionId)
    const lastStateTransitionAt = readLastStateTransitionAt(database)
    if (input.sampledAt < lastStateTransitionAt) {
      throw new Error("Context cut occurs before the latest durable state transition")
    }
    if (input.sampledAt < latestSessionEventAt) {
      throw new Error("Context cut occurs before durable Session history")
    }

    const activeLearnerSteering = database
      .query(`
        SELECT
          steering.steering_effect_id,
          steering.source_item_id,
          source.sequence AS source_sequence,
          steering.verbatim_excerpt,
          steering.effective_from,
          steering.valid_until,
          steering.interpretation_model_operation_id,
          steering.interpretation_time_zone
        FROM timed_learner_steering AS steering
        JOIN session_item AS source ON source.item_id = steering.source_item_id
        WHERE steering.effective_from <= ?1
          AND ?1 < steering.valid_until
          AND steering.retracted_at IS NULL
        ORDER BY source.sequence ASC, steering.steering_effect_id ASC
      `)
      .all(input.sampledAt) as Array<{
      steering_effect_id: string
      source_item_id: string
      source_sequence: number
      verbatim_excerpt: string
      effective_from: number
      valid_until: number
      interpretation_model_operation_id: string
      interpretation_time_zone: string
    }>

    const contributions: ActiveLearnerSteering[] = activeLearnerSteering.map((row) => ({
      effectId: row.steering_effect_id,
      sourceItemId: row.source_item_id,
      sourceSequence: row.source_sequence,
      verbatimExcerpt: row.verbatim_excerpt,
      effectiveFrom: row.effective_from,
      validUntil: row.valid_until,
      interpretationModelOperationId: row.interpretation_model_operation_id,
      interpretationTimeZone: row.interpretation_time_zone,
    }))
    const activeCourse = readActiveCourseContext(database) ?? null
    const futureAttention = activeCourse
      ? readFutureAttentionContext(database, {
          activeCourseId: activeCourse.courseId,
          at: input.sampledAt,
          limit: 8,
        })
      : { totalOpen: 0, concerns: [] }
    const assignments = enablesAssignments(input.policyProfileRevision)
      ? readAssignmentContext(database, { at: input.sampledAt, offset: 0, limit: 8 })
      : { totalActive: 0, offset: 0, assignments: [] }
    const conditionalCandidate = activeCourse &&
        enablesConditionalFutureAttention(input.policyProfileRevision)
      ? readConditionalFutureAttentionCandidate(database, {
          activeCourseId: activeCourse.courseId,
          activeCourseViewRevisionId: activeCourse.courseViewRevisionId,
          at: input.sampledAt,
        }).candidate
      : null
    const conditionalCurrentPurpose: ConditionalCurrentPurpose | null = conditionalCandidate
      ? {
          kind: "agenda_future_attention",
          priority: "below_exact_current_request",
          source: {
            concernId: conditionalCandidate.id,
            concernVersion: conditionalCandidate.version,
            sourceItemId: conditionalCandidate.sourceItemId,
            target: {
              courseId: conditionalCandidate.target.courseId,
              courseViewRevisionId: conditionalCandidate.target.courseViewRevisionId,
              courseItemId: conditionalCandidate.target.courseItemId,
            },
            exactReason: conditionalCandidate.reason,
          },
          learnerRoleConstraint: conditionalCandidate.learnerRoleConstraint,
          scope: "current_turn",
        }
      : null
    const context = {
      activeLearnerSteering: contributions,
      activeCourse,
      futureAttention,
      assignments,
      conditionalCurrentPurpose,
      policyPrompt: renderLearnerSteeringPolicy(contributions),
    } satisfies TutorContext
    const cut: TutorContextCut = {
      sessionId: input.sessionId,
      sessionSequence: readSessionSequence(database, input.sessionId),
      stateRevision: readStateRevision(database),
      stateTransitionAt: lastStateTransitionAt,
      policyProfileRevision: input.policyProfileRevision,
      sampledAt: input.sampledAt,
      timeZone: input.timeZone,
      ...context,
    }
    for (const contribution of cut.activeLearnerSteering) Object.freeze(contribution)
    Object.freeze(cut.activeLearnerSteering)
    if (cut.activeCourse) freezeActiveCourse(cut.activeCourse)
    freezeFutureAttention(cut.futureAttention)
    freezeAssignments(cut.assignments)
    if (cut.conditionalCurrentPurpose) freezeConditionalCurrentPurpose(
      cut.conditionalCurrentPurpose,
    )
    return Object.freeze(cut)
  }).deferred()
}

function freezeAssignments(context: TutorContext["assignments"]) {
  for (const assignment of context.assignments) Object.freeze(assignment)
  Object.freeze(context.assignments)
  Object.freeze(context)
}

function freezeConditionalCurrentPurpose(purpose: ConditionalCurrentPurpose) {
  Object.freeze(purpose.source.target)
  Object.freeze(purpose.source)
  Object.freeze(purpose.learnerRoleConstraint)
  Object.freeze(purpose)
}

function freezeFutureAttention(context: TutorContext["futureAttention"]) {
  for (const concern of context.concerns) {
    Object.freeze(concern.target)
    Object.freeze(concern.authorship)
    if (concern.learnerRoleConstraint) Object.freeze(concern.learnerRoleConstraint)
    Object.freeze(concern)
  }
  Object.freeze(context.concerns)
  Object.freeze(context)
}

function freezeActiveCourse(context: ActiveCourseContext) {
  Object.freeze(context.route.anchor)
  for (const item of context.route.breadcrumb) Object.freeze(item)
  Object.freeze(context.route.breadcrumb)
  for (const item of context.route.nearby) Object.freeze(item)
  Object.freeze(context.route.nearby)
  Object.freeze(context.route)
  if (context.material) Object.freeze(context.material)
  Object.freeze(context)
}

function renderLearnerSteeringPolicy(contributions: ActiveLearnerSteering[]) {
  if (contributions.length === 0) return ""
  const entries = contributions.map(
    (entry) =>
      `- [admitted order ${entry.sourceSequence}] ${JSON.stringify(entry.verbatimExcerpt)} (effect: ${entry.effectId}; source: ${entry.sourceItemId}; active until: ${formatInTimeZone(entry.validUntil, entry.interpretationTimeZone)} ${entry.interpretationTimeZone}; absolute: ${new Date(entry.validUntil).toISOString()})`,
  )
  return [
    "Active learning-wide learner steering (temporary policy; not a stable preference or learning evidence):",
    ...entries,
    "Entries are ordered from older to newer admitted learner input. If retained instructions conflict within overlapping scope, the later entry wins; combine instructions that do not conflict.",
    "Apply still-active steering to Tutor behavior. A more specific instruction in the current learner input may override it for this Turn without silently retracting the retained instruction.",
  ].join("\n")
}

function formatInTimeZone(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(timestamp)
}

function assertTimestamp(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || Number.isNaN(new Date(value).getTime())) {
    throw new RangeError(`${label} must be a non-negative integer timestamp`)
  }
}

function assertTimeZone(timeZone: string) {
  if (!timeZone.trim()) throw new Error("timeZone must not be empty")
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0)
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}`)
  }
}
