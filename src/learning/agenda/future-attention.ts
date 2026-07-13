import type { Database } from "bun:sqlite"
import { canonicalJson } from "../../storage/canonical-json"
import { advanceSystemState, readSystemState } from "../../storage/system-state"

const CREATE_KIND = "agenda-revisit-create-v1"
const ADDRESS_KIND = "agenda-revisit-address-v1"
const DISMISS_KIND = "agenda-revisit-dismiss-v1"
const SUPERSEDE_KIND = "agenda-revisit-supersede-v1"
const REOPEN_KIND = "agenda-revisit-reopen-v1"
const MAX_REASON_CODE_POINTS = 800
const MAX_EXCERPT_CODE_POINTS = 500
const MAX_RATIONALE_CODE_POINTS = 800
export const FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS = 12_000

export type CourseItemTargetRef = {
  courseId: string
  courseViewRevisionId: string
  courseItemId: string
}

export type FutureAttentionAuthorship =
  | { kind: "learner_requested"; learnerRequestExcerpt: string }
  | { kind: "tutor_initiated" }

export type FutureAttentionLearnerRoleConstraint = {
  kind: "learner_response_before_tutor_disclosure"
}

export type FutureAttentionStatus = "open" | "addressed" | "dismissed" | "superseded"

export type FutureAttentionCommandErrorCode =
  | "invalid_input"
  | "semantic_conflict"
  | "stale_agenda_concern"
  | "stale_course_context"
  | "illegal_transition"

export class FutureAttentionCommandError extends Error {
  readonly code: FutureAttentionCommandErrorCode

  constructor(code: FutureAttentionCommandErrorCode, message: string) {
    super(message)
    this.name = "FutureAttentionCommandError"
    this.code = code
  }
}

export type FutureAttentionConcern = {
  id: string
  creationEffectId: string
  sourceItemId: string
  creationModelOperationId: string
  authorship: FutureAttentionAuthorship
  target: CourseItemTargetRef & { courseTitle: string; itemTitle: string }
  reason: string
  learnerRoleConstraint?: FutureAttentionLearnerRoleConstraint
  notBefore: number
  status: FutureAttentionStatus
  version: number
  successorConcernId?: string
  createdAt: number
  updatedAt: number
}

export type FutureAttentionContextConcern = {
  id: string
  version: number
  target: CourseItemTargetRef & { courseTitle: string; itemTitle: string }
  reason: string
  learnerRoleConstraint?: FutureAttentionLearnerRoleConstraint
  authorship: { kind: FutureAttentionAuthorship["kind"] }
  notBefore: number
  eligibility: "upcoming" | "eligible"
  targetState: "current" | "superseded_view"
  sourceItemId: string
}

export type FutureAttentionInspectionConcern = FutureAttentionContextConcern & {
  status: FutureAttentionStatus
  successorConcernId?: string
  updatedAt: number
}

export type FutureAttentionTransition = {
  effectId: string
  concernId: string
  fromStatus: Exclude<FutureAttentionStatus, "superseded">
  toStatus: FutureAttentionStatus
  commandSourceItemId: string
  modelOperationId: string
  serviceOccurrenceItemId?: string
  successorConcernId?: string
  rationale: string
  versionAfter: number
  occurredAt: number
}

export function createFutureAttentionConcern(
  database: Database,
  rawInput: {
    effectId: string
    concernId: string
    causeItemId: string
    modelOperationId: string
    target: CourseItemTargetRef
    authorship: FutureAttentionAuthorship
    reason: string
    learnerRoleConstraint?: FutureAttentionLearnerRoleConstraint
    notBefore: number
    occurredAt: number
  },
) {
  const input = validateCreateInput(rawInput)
  const valueJson = canonicalJson({
    authorship: input.authorship,
    learnerRoleConstraint: input.learnerRoleConstraint ?? null,
    notBefore: input.notBefore,
    reason: input.reason,
    target: input.target,
  })

  return database.transaction(() => {
    const existing = readByCreateSlot(
      database,
      input.causeItemId,
      input.target.courseViewRevisionId,
      input.target.courseItemId,
    )
    if (existing) {
      const existingValueJson = storedCreationValueJson(existing)
      if (existingValueJson !== valueJson) {
        failCommand("semantic_conflict", "The admitted source and Course View target already owns a different future-attention meaning")
      }
      return {
        replayed: true as const,
        operationEffectId: existing.creation_effect_id,
        operationRevision: existing.effect_revision_after,
        concern: readFutureAttentionConcern(database, existing.revisit_id),
      }
    }

    assertUnusedIdentity(database, input.effectId, input.concernId)
    const source = requireCreationSource(database, input.causeItemId, input.modelOperationId)
    if (
      input.authorship.kind === "learner_requested" &&
      !source.content.includes(input.authorship.learnerRequestExcerpt)
    ) {
      failCommand("invalid_input", "Learner-request excerpt is not present in the admitted source")
    }
    requireCurrentTarget(database, input.target)
    if (input.notBefore < source.created_at) {
      failCommand("invalid_input", "Future attention cannot become eligible before its admitted source")
    }
    const state = readSystemState(database)
    assertTransitionTime(
      input.occurredAt,
      Math.max(source.created_at, source.sampled_at),
      state.lastTransitionAt,
    )
    const revisionAfter = state.revision + 1
    const effectSlot = canonicalJson([
      input.target.courseViewRevisionId,
      input.target.courseItemId,
    ])
    database
      .query(`
        INSERT INTO durable_effect (
          effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `)
      .run(
        input.effectId,
        CREATE_KIND,
        input.causeItemId,
        effectSlot,
        valueJson,
        revisionAfter,
        input.occurredAt,
      )
    database
      .query(`
        INSERT INTO agenda_revisit (
          revisit_id,
          creation_effect_id,
          creation_source_item_id,
          creation_model_operation_id,
          semantic_author_kind,
          learner_request_excerpt,
          target_course_id,
          target_course_view_revision_id,
          target_course_item_id,
          reason,
          learner_role_constraint,
          not_before,
          status,
          version,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'open', 1, ?13, ?13)
      `)
      .run(
        input.concernId,
        input.effectId,
        input.causeItemId,
        input.modelOperationId,
        input.authorship.kind,
        input.authorship.kind === "learner_requested"
          ? input.authorship.learnerRequestExcerpt
          : null,
        input.target.courseId,
        input.target.courseViewRevisionId,
        input.target.courseItemId,
        input.reason,
        input.learnerRoleConstraint?.kind ?? null,
        input.notBefore,
        input.occurredAt,
      )
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return {
      replayed: false as const,
      operationEffectId: input.effectId,
      operationRevision: revisionAfter,
      concern: readFutureAttentionConcern(database, input.concernId),
    }
  }).immediate()
}

export function addressFutureAttentionConcern(
  database: Database,
  rawInput: {
    effectId: string
    causeItemId: string
    modelOperationId: string
    concernId: string
    expectedVersion: number
    serviceOccurrenceItemId: string
    alignmentRationale: string
    occurredAt: number
  },
) {
  const input = validateAddressInput(rawInput)
  const valueJson = canonicalJson({
    alignmentRationale: input.alignmentRationale,
    concernId: input.concernId,
    expectedVersion: input.expectedVersion,
    serviceOccurrenceItemId: input.serviceOccurrenceItemId,
  })

  return database.transaction(() => {
    const existing = readEffect(database, ADDRESS_KIND, input.causeItemId, input.concernId)
    if (existing) {
      if (existing.value_json !== valueJson) {
        failCommand("semantic_conflict", "The learner occurrence and concern already owns a different address transition")
      }
      requireRecordedTransition(database, existing.effect_id, input.concernId, "addressed")
      return {
        replayed: true as const,
        operationEffectId: existing.effect_id,
        operationRevision: existing.revision_after,
        concern: readFutureAttentionConcern(database, input.concernId),
      }
    }

    assertUnusedEffectIdentity(database, input.effectId)
    const concern = readFutureAttentionConcern(database, input.concernId)
    const commandSource = requireCommandSource(
      database,
      input.causeItemId,
      input.modelOperationId,
    )
    requireLaterCommandSource(database, concern, commandSource)
    requireOpenVersion(concern, input.expectedVersion)
    requireActiveTargetView(database, concern.target)
    const serviceOccurrence = requireServiceOccurrence(
      database,
      concern,
      input.serviceOccurrenceItemId,
    )
    if (input.occurredAt < serviceOccurrence.completed_at) {
      failCommand("illegal_transition", "Agenda transition cannot precede the completed assistant occurrence")
    }
    const state = readSystemState(database)
    assertTransitionTime(
      input.occurredAt,
      Math.max(commandSource.created_at, commandSource.sampled_at, serviceOccurrence.completed_at),
      state.lastTransitionAt,
    )
    const revisionAfter = state.revision + 1
    insertEffect(database, {
      effectId: input.effectId,
      kind: ADDRESS_KIND,
      causeItemId: input.causeItemId,
      effectSlot: input.concernId,
      valueJson,
      revisionAfter,
      occurredAt: input.occurredAt,
    })
    database
      .query(`
        INSERT INTO agenda_revisit_transition (
          transition_effect_id,
          revisit_id,
          from_status,
          to_status,
          command_source_item_id,
          transition_model_operation_id,
          service_occurrence_item_id,
          rationale,
          version_after,
          occurred_at
        ) VALUES (?1, ?2, 'open', 'addressed', ?3, ?4, ?5, ?6, ?7, ?8)
      `)
      .run(
        input.effectId,
        input.concernId,
        input.causeItemId,
        input.modelOperationId,
        input.serviceOccurrenceItemId,
        input.alignmentRationale,
        input.expectedVersion + 1,
        input.occurredAt,
      )
    updateOpenConcern(database, {
      concernId: input.concernId,
      expectedVersion: input.expectedVersion,
      nextStatus: "addressed",
      occurredAt: input.occurredAt,
    })
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return {
      replayed: false as const,
      operationEffectId: input.effectId,
      operationRevision: revisionAfter,
      concern: readFutureAttentionConcern(database, input.concernId),
    }
  }).immediate()
}

export function dismissFutureAttentionConcern(
  database: Database,
  rawInput: {
    effectId: string
    causeItemId: string
    modelOperationId: string
    concernId: string
    expectedVersion: number
    learnerRequestExcerpt: string
    rationale: string
    occurredAt: number
  },
) {
  const input = validateDismissInput(rawInput)
  const valueJson = canonicalJson({
    concernId: input.concernId,
    expectedVersion: input.expectedVersion,
    learnerRequestExcerpt: input.learnerRequestExcerpt,
    rationale: input.rationale,
  })

  return database.transaction(() => {
    const existing = readEffect(database, DISMISS_KIND, input.causeItemId, input.concernId)
    if (existing) {
      if (existing.value_json !== valueJson) {
        failCommand("semantic_conflict", "The learner occurrence and concern already owns a different dismiss transition")
      }
      requireRecordedTransition(database, existing.effect_id, input.concernId, "dismissed")
      return {
        replayed: true as const,
        operationEffectId: existing.effect_id,
        operationRevision: existing.revision_after,
        concern: readFutureAttentionConcern(database, input.concernId),
      }
    }

    assertUnusedEffectIdentity(database, input.effectId)
    const concern = readFutureAttentionConcern(database, input.concernId)
    const commandSource = requireCommandSource(
      database,
      input.causeItemId,
      input.modelOperationId,
    )
    requireLaterCommandSource(database, concern, commandSource)
    if (!commandSource.content.includes(input.learnerRequestExcerpt)) {
      failCommand("invalid_input", "Agenda dismissal excerpt is not present in the admitted learner source")
    }
    requireOpenVersion(concern, input.expectedVersion)
    const state = readSystemState(database)
    assertTransitionTime(
      input.occurredAt,
      Math.max(commandSource.created_at, commandSource.sampled_at),
      state.lastTransitionAt,
    )
    const revisionAfter = state.revision + 1
    insertEffect(database, {
      effectId: input.effectId,
      kind: DISMISS_KIND,
      causeItemId: input.causeItemId,
      effectSlot: input.concernId,
      valueJson,
      revisionAfter,
      occurredAt: input.occurredAt,
    })
    database
      .query(`
        INSERT INTO agenda_revisit_transition (
          transition_effect_id,
          revisit_id,
          from_status,
          to_status,
          command_source_item_id,
          transition_model_operation_id,
          rationale,
          version_after,
          occurred_at
        ) VALUES (?1, ?2, 'open', 'dismissed', ?3, ?4, ?5, ?6, ?7)
      `)
      .run(
        input.effectId,
        input.concernId,
        input.causeItemId,
        input.modelOperationId,
        input.rationale,
        input.expectedVersion + 1,
        input.occurredAt,
      )
    updateOpenConcern(database, {
      concernId: input.concernId,
      expectedVersion: input.expectedVersion,
      nextStatus: "dismissed",
      occurredAt: input.occurredAt,
    })
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return {
      replayed: false as const,
      operationEffectId: input.effectId,
      operationRevision: revisionAfter,
      concern: readFutureAttentionConcern(database, input.concernId),
    }
  }).immediate()
}

export function reopenFutureAttentionConcern(
  database: Database,
  rawInput: {
    effectId: string
    causeItemId: string
    modelOperationId: string
    concernId: string
    expectedVersion: number
    learnerRequestExcerpt: string
    rationale: string
    occurredAt: number
  },
) {
  const input = validateReopenInput(rawInput)
  const valueJson = canonicalJson({
    concernId: input.concernId,
    expectedVersion: input.expectedVersion,
    learnerRequestExcerpt: input.learnerRequestExcerpt,
    rationale: input.rationale,
  })

  return database.transaction(() => {
    const existing = readEffect(database, REOPEN_KIND, input.causeItemId, input.concernId)
    if (existing) {
      if (existing.value_json !== valueJson) {
        failCommand(
          "semantic_conflict",
          "The learner occurrence and concern already owns a different reopen transition",
        )
      }
      requireRecordedTransition(database, existing.effect_id, input.concernId, "open")
      return {
        replayed: true as const,
        operationEffectId: existing.effect_id,
        operationRevision: existing.revision_after,
        concern: readFutureAttentionConcern(database, input.concernId),
      }
    }

    assertUnusedEffectIdentity(database, input.effectId)
    const concern = readFutureAttentionConcern(database, input.concernId)
    const commandSource = requireCommandSource(
      database,
      input.causeItemId,
      input.modelOperationId,
    )
    requireCorrectionAfterDisposition(database, concern, commandSource)
    if (!commandSource.content.includes(input.learnerRequestExcerpt)) {
      failCommand("invalid_input", "Agenda reopen excerpt is not present in the admitted learner source")
    }
    requireReopenableVersion(concern, input.expectedVersion)
    const state = readSystemState(database)
    assertTransitionTime(
      input.occurredAt,
      Math.max(commandSource.created_at, commandSource.sampled_at, concern.updatedAt),
      state.lastTransitionAt,
    )
    const revisionAfter = state.revision + 1
    const nextVersion = input.expectedVersion + 1
    insertEffect(database, {
      effectId: input.effectId,
      kind: REOPEN_KIND,
      causeItemId: input.causeItemId,
      effectSlot: input.concernId,
      valueJson,
      revisionAfter,
      occurredAt: input.occurredAt,
    })
    database
      .query(`
        INSERT INTO agenda_revisit_transition (
          transition_effect_id,
          revisit_id,
          from_status,
          to_status,
          command_source_item_id,
          transition_model_operation_id,
          rationale,
          version_after,
          occurred_at
        ) VALUES (?1, ?2, ?3, 'open', ?4, ?5, ?6, ?7, ?8)
      `)
      .run(
        input.effectId,
        input.concernId,
        concern.status,
        input.causeItemId,
        input.modelOperationId,
        input.rationale,
        nextVersion,
        input.occurredAt,
      )
    const updated = database
      .query(`
        UPDATE agenda_revisit
        SET status = 'open', version = ?1, updated_at = ?2
        WHERE revisit_id = ?3
          AND status = ?4
          AND version = ?5
          AND successor_revisit_id IS NULL
      `)
      .run(
        nextVersion,
        input.occurredAt,
        input.concernId,
        concern.status,
        input.expectedVersion,
      )
    if (updated.changes !== 1) {
      throw new Error(`Agenda concern changed during reopen: ${input.concernId}`)
    }
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return {
      replayed: false as const,
      operationEffectId: input.effectId,
      operationRevision: revisionAfter,
      concern: readFutureAttentionConcern(database, input.concernId),
    }
  }).immediate()
}

export function supersedeFutureAttentionConcern(
  database: Database,
  rawInput: {
    effectId: string
    successorConcernId: string
    causeItemId: string
    modelOperationId: string
    concernId: string
    expectedVersion: number
    learnerRequestExcerpt: string
    target: CourseItemTargetRef
    replacementReason: string
    replacementLearnerRoleConstraint?: FutureAttentionLearnerRoleConstraint
    replacementNotBefore: number
    rationale: string
    occurredAt: number
  },
) {
  const input = validateSupersedeInput(rawInput)
  const valueJson = canonicalJson({
    concernId: input.concernId,
    expectedVersion: input.expectedVersion,
    learnerRequestExcerpt: input.learnerRequestExcerpt,
    rationale: input.rationale,
    replacementLearnerRoleConstraint: input.replacementLearnerRoleConstraint ?? null,
    replacementNotBefore: input.replacementNotBefore,
    replacementReason: input.replacementReason,
    target: input.target,
  })

  return database.transaction(() => {
    const existing = readEffect(database, SUPERSEDE_KIND, input.causeItemId, input.concernId)
    if (existing) {
      if (existing.value_json !== valueJson) {
        failCommand("semantic_conflict", "The learner occurrence and concern already owns a different supersede transition")
      }
      const transition = requireRecordedTransition(
        database,
        existing.effect_id,
        input.concernId,
        "superseded",
      )
      if (!transition.successor_revisit_id) {
        throw new Error(`Agenda supersede transition has no successor: ${existing.effect_id}`)
      }
      return {
        replayed: true as const,
        operationEffectId: existing.effect_id,
        operationRevision: existing.revision_after,
        previous: readFutureAttentionConcern(database, input.concernId),
        successor: readFutureAttentionConcern(database, transition.successor_revisit_id),
      }
    }

    const previous = readFutureAttentionConcern(database, input.concernId)
    const commandSource = requireCommandSource(
      database,
      input.causeItemId,
      input.modelOperationId,
    )
    requireLaterCommandSource(database, previous, commandSource)
    if (!commandSource.content.includes(input.learnerRequestExcerpt)) {
      failCommand("invalid_input", "Agenda supersession excerpt is not present in the admitted learner source")
    }
    requireOpenVersion(previous, input.expectedVersion)
    requireCurrentTarget(database, input.target)
    if (input.replacementNotBefore < commandSource.created_at) {
      failCommand("invalid_input", "Replacement future attention cannot become eligible before its correction source")
    }
    const state = readSystemState(database)
    assertTransitionTime(
      input.occurredAt,
      Math.max(commandSource.created_at, commandSource.sampled_at),
      state.lastTransitionAt,
    )
    const existingSuccessor = readByCreateSlot(
      database,
      input.causeItemId,
      input.target.courseViewRevisionId,
      input.target.courseItemId,
    )
    if (existingSuccessor) {
      failCommand(
        "semantic_conflict",
        "Supersession cannot absorb a separately committed successor in its create slot",
      )
    }
    assertUnusedIdentity(database, input.effectId, input.successorConcernId)
    const successorConcernId = input.successorConcernId
    const revisionAfter = state.revision + 1
    insertEffect(database, {
      effectId: input.effectId,
      kind: SUPERSEDE_KIND,
      causeItemId: input.causeItemId,
      effectSlot: input.concernId,
      valueJson,
      revisionAfter,
      occurredAt: input.occurredAt,
    })
    database
      .query(`
          INSERT INTO agenda_revisit (
            revisit_id,
            creation_effect_id,
            creation_source_item_id,
            creation_model_operation_id,
            semantic_author_kind,
            learner_request_excerpt,
            target_course_id,
            target_course_view_revision_id,
            target_course_item_id,
            reason,
            learner_role_constraint,
            not_before,
            status,
            version,
            created_at,
            updated_at
          ) VALUES (?1, ?2, ?3, ?4, 'learner_requested', ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'open', 1, ?12, ?12)
      `)
      .run(
        successorConcernId,
        input.effectId,
        input.causeItemId,
        input.modelOperationId,
        input.learnerRequestExcerpt,
        input.target.courseId,
        input.target.courseViewRevisionId,
        input.target.courseItemId,
        input.replacementReason,
        input.replacementLearnerRoleConstraint?.kind ?? null,
        input.replacementNotBefore,
        input.occurredAt,
      )
    database
      .query(`
        INSERT INTO agenda_revisit_transition (
          transition_effect_id,
          revisit_id,
          from_status,
          to_status,
          command_source_item_id,
          transition_model_operation_id,
          successor_revisit_id,
          rationale,
          version_after,
          occurred_at
        ) VALUES (?1, ?2, 'open', 'superseded', ?3, ?4, ?5, ?6, ?7, ?8)
      `)
      .run(
        input.effectId,
        input.concernId,
        input.causeItemId,
        input.modelOperationId,
        successorConcernId,
        input.rationale,
        input.expectedVersion + 1,
        input.occurredAt,
      )
    updateOpenConcern(database, {
      concernId: input.concernId,
      expectedVersion: input.expectedVersion,
      nextStatus: "superseded",
      successorConcernId,
      occurredAt: input.occurredAt,
    })
    advanceSystemState(database, {
      expectedRevision: state.revision,
      expectedTransitionAt: state.lastTransitionAt,
      nextRevision: revisionAfter,
      transitionAt: input.occurredAt,
    })
    return {
      replayed: false as const,
      operationEffectId: input.effectId,
      operationRevision: revisionAfter,
      previous: readFutureAttentionConcern(database, input.concernId),
      successor: readFutureAttentionConcern(database, successorConcernId),
    }
  }).immediate()
}

export function listFutureAttentionTransitions(database: Database, concernId: string) {
  assertIdentifier(concernId, "concernId")
  const rows = database
    .query(`
      SELECT
        transition_effect_id,
        revisit_id,
        from_status,
        to_status,
        command_source_item_id,
        transition_model_operation_id,
        service_occurrence_item_id,
        successor_revisit_id,
        rationale,
        version_after,
        occurred_at
      FROM agenda_revisit_transition
      WHERE revisit_id = ?1
      ORDER BY version_after ASC
    `)
    .all(concernId) as TransitionRow[]
  return rows.map(mapTransition)
}

export function readFutureAttentionConcern(database: Database, concernId: string) {
  assertIdentifier(concernId, "concernId")
  const row = database
    .query(`
      SELECT
        revisit.revisit_id,
        revisit.creation_effect_id,
        revisit.creation_source_item_id,
        revisit.creation_model_operation_id,
        revisit.semantic_author_kind,
        revisit.learner_request_excerpt,
        revisit.target_course_id,
        revisit.target_course_view_revision_id,
        revisit.target_course_item_id,
        course.title AS course_title,
        item.title AS item_title,
        revisit.reason,
        revisit.learner_role_constraint,
        revisit.not_before,
        revisit.status,
        revisit.version,
        revisit.successor_revisit_id,
        revisit.created_at,
        revisit.updated_at
      FROM agenda_revisit AS revisit
      JOIN course ON course.course_id = revisit.target_course_id
      JOIN course_view_item AS item
        ON item.course_view_revision_id = revisit.target_course_view_revision_id
       AND item.course_item_id = revisit.target_course_item_id
      WHERE revisit.revisit_id = ?1
    `)
    .get(concernId) as ConcernRow | null
  if (!row) throw new Error(`Unknown Agenda future-attention concern: ${concernId}`)
  return mapConcern(row)
}

export function readFutureAttentionContext(
  database: Database,
  input: { activeCourseId: string; at: number; limit: number },
) {
  assertIdentifier(input.activeCourseId, "activeCourseId")
  assertTimestamp(input.at, "at")
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 32) {
    failCommand("invalid_input", "Future-attention context limit must be an integer from 1 to 32")
  }
  const count = database
    .query(`
      SELECT COUNT(*) AS count
      FROM agenda_revisit
      WHERE target_course_id = ?1 AND status = 'open'
    `)
    .get(input.activeCourseId) as { count: number }
  const rows = database
    .query(`
      SELECT
        revisit.revisit_id,
        revisit.version,
        revisit.target_course_id,
        revisit.target_course_view_revision_id,
        revisit.target_course_item_id,
        course.title AS course_title,
        item.title AS item_title,
        revisit.reason,
        revisit.learner_role_constraint,
        revisit.semantic_author_kind,
        revisit.learner_request_excerpt,
        revisit.not_before,
        revisit.creation_source_item_id,
        active.course_view_revision_id AS active_view_revision_id
      FROM agenda_revisit AS revisit
      JOIN course ON course.course_id = revisit.target_course_id
      JOIN course_view_item AS item
        ON item.course_view_revision_id = revisit.target_course_view_revision_id
       AND item.course_item_id = revisit.target_course_item_id
      LEFT JOIN active_course_view AS active ON active.course_id = revisit.target_course_id
      WHERE revisit.target_course_id = ?1 AND revisit.status = 'open'
      ORDER BY
        CASE
          WHEN active.course_view_revision_id = revisit.target_course_view_revision_id THEN 0
          ELSE 1
        END,
        CASE WHEN revisit.not_before <= ?2 THEN 0 ELSE 1 END,
        revisit.not_before ASC,
        revisit.created_at ASC,
        revisit.revisit_id ASC
      LIMIT ?3
    `)
    .all(input.activeCourseId, input.at, input.limit) as ContextRow[]
  return {
    totalOpen: count.count,
    concerns: rows.map((row): FutureAttentionContextConcern => ({
      id: row.revisit_id,
      version: row.version,
      target: {
        courseId: row.target_course_id,
        courseViewRevisionId: row.target_course_view_revision_id,
        courseItemId: row.target_course_item_id,
        courseTitle: row.course_title,
        itemTitle: row.item_title,
      },
      reason: row.reason,
      ...(row.learner_role_constraint === null
        ? {}
        : { learnerRoleConstraint: { kind: row.learner_role_constraint } }),
      authorship: { kind: row.semantic_author_kind },
      notBefore: row.not_before,
      eligibility: row.not_before <= input.at ? "eligible" : "upcoming",
      targetState:
        row.active_view_revision_id === row.target_course_view_revision_id
          ? "current"
          : "superseded_view",
      sourceItemId: row.creation_source_item_id,
    })),
  }
}

export function readConditionalFutureAttentionCandidate(
  database: Database,
  input: {
    activeCourseId: string
    activeCourseViewRevisionId: string
    at: number
  },
) {
  assertIdentifier(input.activeCourseId, "activeCourseId")
  assertIdentifier(input.activeCourseViewRevisionId, "activeCourseViewRevisionId")
  assertTimestamp(input.at, "at")
  const rows = database
    .query(`
      SELECT
        revisit.revisit_id,
        revisit.version,
        revisit.target_course_id,
        revisit.target_course_view_revision_id,
        revisit.target_course_item_id,
        course.title AS course_title,
        item.title AS item_title,
        revisit.reason,
        revisit.learner_role_constraint,
        revisit.semantic_author_kind,
        revisit.learner_request_excerpt,
        revisit.not_before,
        revisit.creation_source_item_id,
        active.course_view_revision_id AS active_view_revision_id,
        COUNT(*) OVER () AS legal_candidate_count
      FROM agenda_revisit AS revisit
      JOIN course ON course.course_id = revisit.target_course_id
      JOIN course_view_item AS item
        ON item.course_view_revision_id = revisit.target_course_view_revision_id
       AND item.course_item_id = revisit.target_course_item_id
      JOIN active_course_view AS active
        ON active.course_id = revisit.target_course_id
       AND active.course_view_revision_id = ?2
      WHERE revisit.target_course_id = ?1
        AND revisit.target_course_view_revision_id = ?2
        AND revisit.status = 'open'
        AND revisit.not_before <= ?3
        AND revisit.learner_role_constraint = 'learner_response_before_tutor_disclosure'
      ORDER BY revisit.not_before ASC, revisit.created_at ASC, revisit.revisit_id ASC
      LIMIT 2
    `)
    .all(input.activeCourseId, input.activeCourseViewRevisionId, input.at) as Array<
      ContextRow & { legal_candidate_count: number }
    >
  const legalCandidateCount = rows[0]?.legal_candidate_count ?? 0
  if (legalCandidateCount !== 1) return { legalCandidateCount, candidate: null }
  const row = rows[0]
  if (!row || row.learner_role_constraint === null) {
    throw new Error("Conditional future-attention candidate lost its required constraint")
  }
  return {
    legalCandidateCount,
    candidate: {
      id: row.revisit_id,
      version: row.version,
      target: {
        courseId: row.target_course_id,
        courseViewRevisionId: row.target_course_view_revision_id,
        courseItemId: row.target_course_item_id,
        courseTitle: row.course_title,
        itemTitle: row.item_title,
      },
      reason: row.reason,
      learnerRoleConstraint: { kind: row.learner_role_constraint },
      authorship: { kind: row.semantic_author_kind },
      notBefore: row.not_before,
      eligibility: "eligible" as const,
      targetState: "current" as const,
      sourceItemId: row.creation_source_item_id,
    } satisfies FutureAttentionContextConcern,
  }
}

export function readRecentFutureAttention(
  database: Database,
  input: { activeCourseId: string; at: number; offset: number; limit: number },
) {
  assertIdentifier(input.activeCourseId, "activeCourseId")
  assertTimestamp(input.at, "at")
  assertNonNegativeInteger(input.offset, "offset")
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20) {
    failCommand("invalid_input", "Future-attention inspection limit must be an integer from 1 to 20")
  }
  const count = database
    .query(`
      SELECT COUNT(*) AS count
      FROM agenda_revisit
      WHERE target_course_id = ?1
    `)
    .get(input.activeCourseId) as { count: number }
  const rows = database
    .query(`
      SELECT
        revisit.revisit_id,
        revisit.version,
        revisit.target_course_id,
        revisit.target_course_view_revision_id,
        revisit.target_course_item_id,
        course.title AS course_title,
        item.title AS item_title,
        revisit.reason,
        revisit.learner_role_constraint,
        revisit.semantic_author_kind,
        revisit.not_before,
        revisit.status,
        revisit.successor_revisit_id,
        revisit.creation_source_item_id,
        revisit.updated_at,
        active.course_view_revision_id AS active_view_revision_id
      FROM agenda_revisit AS revisit
      JOIN course ON course.course_id = revisit.target_course_id
      JOIN course_view_item AS item
        ON item.course_view_revision_id = revisit.target_course_view_revision_id
       AND item.course_item_id = revisit.target_course_item_id
      LEFT JOIN active_course_view AS active ON active.course_id = revisit.target_course_id
      WHERE revisit.target_course_id = ?1
      ORDER BY revisit.updated_at DESC, revisit.revisit_id ASC
      LIMIT ?2 OFFSET ?3
    `)
    .all(input.activeCourseId, input.limit, input.offset) as InspectionRow[]
  return {
    total: count.count,
    offset: input.offset,
    limit: input.limit,
    concerns: rows.map((row): FutureAttentionInspectionConcern => ({
      id: row.revisit_id,
      version: row.version,
      target: {
        courseId: row.target_course_id,
        courseViewRevisionId: row.target_course_view_revision_id,
        courseItemId: row.target_course_item_id,
        courseTitle: row.course_title,
        itemTitle: row.item_title,
      },
      reason: row.reason,
      ...(row.learner_role_constraint === null
        ? {}
        : { learnerRoleConstraint: { kind: row.learner_role_constraint } }),
      authorship: { kind: row.semantic_author_kind },
      notBefore: row.not_before,
      eligibility: row.not_before <= input.at ? "eligible" : "upcoming",
      targetState:
        row.active_view_revision_id === row.target_course_view_revision_id
          ? "current"
          : "superseded_view",
      sourceItemId: row.creation_source_item_id,
      status: row.status,
      ...(row.successor_revisit_id ? { successorConcernId: row.successor_revisit_id } : {}),
      updatedAt: row.updated_at,
    })),
  }
}

export function readFutureAttentionSource(database: Database, concernId: string) {
  const concern = readFutureAttentionConcern(database, concernId)
  const source = database
    .query(`
      SELECT sequence, item_id, session_id, turn_id, role, content, created_at
      FROM session_item
      WHERE item_id = ?1
    `)
    .get(concern.sourceItemId) as SourceRow | null
  if (!source) throw new Error(`Agenda source item is missing: ${concern.sourceItemId}`)
  const previousAssistant = database
    .query(`
      SELECT item_id, session_id, turn_id, role, content, created_at
      FROM session_item
      WHERE session_id = ?1 AND sequence < ?2 AND role = 'assistant'
      ORDER BY sequence DESC
      LIMIT 1
    `)
    .get(source.session_id, source.sequence) as Omit<SourceRow, "sequence"> | null
  return {
    concernId,
    source: mapSource(source, {
      ...(concern.authorship.kind === "learner_requested"
        ? { focusText: concern.authorship.learnerRequestExcerpt }
        : {}),
      preferEnd: true,
    }),
    ...(previousAssistant
      ? { previousAssistant: mapSource(previousAssistant, { preferEnd: true }) }
      : {}),
  }
}

type ConcernRow = {
  revisit_id: string
  creation_effect_id: string
  creation_source_item_id: string
  creation_model_operation_id: string
  semantic_author_kind: "learner_requested" | "tutor_initiated"
  learner_request_excerpt: string | null
  target_course_id: string
  target_course_view_revision_id: string
  target_course_item_id: string
  course_title: string
  item_title: string
  reason: string
  learner_role_constraint: FutureAttentionLearnerRoleConstraint["kind"] | null
  not_before: number
  status: FutureAttentionStatus
  version: number
  successor_revisit_id: string | null
  created_at: number
  updated_at: number
}

type ContextRow = {
  revisit_id: string
  version: number
  target_course_id: string
  target_course_view_revision_id: string
  target_course_item_id: string
  course_title: string
  item_title: string
  reason: string
  learner_role_constraint: FutureAttentionLearnerRoleConstraint["kind"] | null
  semantic_author_kind: "learner_requested" | "tutor_initiated"
  learner_request_excerpt: string | null
  not_before: number
  creation_source_item_id: string
  active_view_revision_id: string | null
}

type InspectionRow = Omit<ContextRow, "learner_request_excerpt"> & {
  status: FutureAttentionStatus
  successor_revisit_id: string | null
  updated_at: number
}

type TransitionRow = {
  transition_effect_id: string
  revisit_id: string
  from_status: Exclude<FutureAttentionStatus, "superseded">
  to_status: FutureAttentionStatus
  command_source_item_id: string
  transition_model_operation_id: string
  service_occurrence_item_id: string | null
  successor_revisit_id: string | null
  rationale: string
  version_after: number
  occurred_at: number
}

type CommandSourceRow = {
  sequence: number
  role: string
  content: string
  created_at: number
  turn_id: string
  model_turn_id: string
  model_status: string
  turn_status: string
  sampled_at: number
}

type CreateSlotRow = {
  revisit_id: string
  creation_effect_id: string
  effect_revision_after: number
  semantic_author_kind: "learner_requested" | "tutor_initiated"
  learner_request_excerpt: string | null
  target_course_id: string
  target_course_view_revision_id: string
  target_course_item_id: string
  reason: string
  learner_role_constraint: FutureAttentionLearnerRoleConstraint["kind"] | null
  not_before: number
}

type SourceRow = {
  sequence: number
  item_id: string
  session_id: string
  turn_id: string
  role: "user" | "assistant" | "tool"
  content: string
  created_at: number
}

function mapConcern(row: ConcernRow): FutureAttentionConcern {
  return {
    id: row.revisit_id,
    creationEffectId: row.creation_effect_id,
    sourceItemId: row.creation_source_item_id,
    creationModelOperationId: row.creation_model_operation_id,
    authorship:
      row.semantic_author_kind === "learner_requested"
        ? {
            kind: "learner_requested",
            learnerRequestExcerpt: requireNullableText(row.learner_request_excerpt),
          }
        : { kind: "tutor_initiated" },
    target: {
      courseId: row.target_course_id,
      courseViewRevisionId: row.target_course_view_revision_id,
      courseItemId: row.target_course_item_id,
      courseTitle: row.course_title,
      itemTitle: row.item_title,
    },
    reason: row.reason,
    ...(row.learner_role_constraint === null
      ? {}
      : { learnerRoleConstraint: { kind: row.learner_role_constraint } }),
    notBefore: row.not_before,
    status: row.status,
    version: row.version,
    ...(row.successor_revisit_id ? { successorConcernId: row.successor_revisit_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSource(
  row: Omit<SourceRow, "sequence"> | SourceRow,
  options: { focusText?: string; preferEnd?: boolean } = {},
) {
  const projected = projectFutureAttentionSourceContent(row.content, options)
  return {
    itemId: row.item_id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    role: row.role,
    content: projected.content,
    contentTruncated: projected.truncated,
    contentStartCodePoint: projected.startCodePoint,
    contentCodePointLength: projected.codePointLength,
    createdAt: row.created_at,
  }
}

export function projectFutureAttentionSourceContent(
  content: string,
  options: { focusText?: string; preferEnd?: boolean } = {},
) {
  const codePoints = Array.from(content)
  if (codePoints.length <= FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS) {
    return {
      content,
      truncated: false as const,
      startCodePoint: 0,
      codePointLength: codePoints.length,
    }
  }
  let startCodePoint = options.preferEnd
    ? codePoints.length - FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS
    : 0
  if (options.focusText) {
    const focusIndex = content.indexOf(options.focusText)
    if (focusIndex >= 0) {
      const focusStartCodePoint = Array.from(content.slice(0, focusIndex)).length
      const focusLength = Array.from(options.focusText).length
      const desiredStart = focusStartCodePoint - Math.floor(
        (FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS - focusLength) / 2,
      )
      startCodePoint = Math.max(
        0,
        Math.min(desiredStart, codePoints.length - FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS),
      )
    }
  }
  return {
    content: codePoints
      .slice(startCodePoint, startCodePoint + FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS)
      .join(""),
    truncated: true as const,
    startCodePoint,
    codePointLength: FUTURE_ATTENTION_SOURCE_MAX_CODE_POINTS,
  }
}

function mapTransition(row: TransitionRow): FutureAttentionTransition {
  return {
    effectId: row.transition_effect_id,
    concernId: row.revisit_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    commandSourceItemId: row.command_source_item_id,
    modelOperationId: row.transition_model_operation_id,
    ...(row.service_occurrence_item_id
      ? { serviceOccurrenceItemId: row.service_occurrence_item_id }
      : {}),
    ...(row.successor_revisit_id ? { successorConcernId: row.successor_revisit_id } : {}),
    rationale: row.rationale,
    versionAfter: row.version_after,
    occurredAt: row.occurred_at,
  }
}

function storedCreationValueJson(row: CreateSlotRow) {
  return canonicalJson({
    authorship:
      row.semantic_author_kind === "learner_requested"
        ? {
            kind: "learner_requested",
            learnerRequestExcerpt: requireNullableText(row.learner_request_excerpt),
          }
        : { kind: "tutor_initiated" },
    notBefore: row.not_before,
    learnerRoleConstraint:
      row.learner_role_constraint === null
        ? null
        : { kind: row.learner_role_constraint },
    reason: row.reason,
    target: {
      courseId: row.target_course_id,
      courseViewRevisionId: row.target_course_view_revision_id,
      courseItemId: row.target_course_item_id,
    },
  })
}

function validateCreateInput(input: Parameters<typeof createFutureAttentionConcern>[1]) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.concernId, "concernId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.modelOperationId, "modelOperationId")
  assertTarget(input.target)
  const reason = boundedText(input.reason, "reason", MAX_REASON_CODE_POINTS)
  const learnerRoleConstraint = validateLearnerRoleConstraint(input.learnerRoleConstraint)
  assertTimestamp(input.notBefore, "notBefore")
  assertTimestamp(input.occurredAt, "occurredAt")
  let authorship: FutureAttentionAuthorship
  if (input.authorship.kind === "learner_requested") {
    authorship = {
      kind: "learner_requested",
      learnerRequestExcerpt: boundedText(
        input.authorship.learnerRequestExcerpt,
        "learnerRequestExcerpt",
        MAX_EXCERPT_CODE_POINTS,
      ),
    }
  } else if (input.authorship.kind === "tutor_initiated") {
    authorship = { kind: "tutor_initiated" }
  } else {
    failCommand("invalid_input", "Unknown future-attention authorship")
  }
  return { ...input, reason, authorship, learnerRoleConstraint }
}

function validateLearnerRoleConstraint(
  constraint: FutureAttentionLearnerRoleConstraint | undefined,
) {
  if (constraint === undefined) return undefined
  if (constraint.kind !== "learner_response_before_tutor_disclosure") {
    failCommand("invalid_input", "Unknown future-attention learner-role constraint")
  }
  return { kind: constraint.kind } satisfies FutureAttentionLearnerRoleConstraint
}

function validateAddressInput(input: Parameters<typeof addressFutureAttentionConcern>[1]) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.modelOperationId, "modelOperationId")
  assertIdentifier(input.concernId, "concernId")
  assertPositiveInteger(input.expectedVersion, "expectedVersion")
  assertIdentifier(input.serviceOccurrenceItemId, "serviceOccurrenceItemId")
  const alignmentRationale = boundedText(
    input.alignmentRationale,
    "alignmentRationale",
    MAX_RATIONALE_CODE_POINTS,
  )
  assertTimestamp(input.occurredAt, "occurredAt")
  return { ...input, alignmentRationale }
}

function validateDismissInput(input: Parameters<typeof dismissFutureAttentionConcern>[1]) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.modelOperationId, "modelOperationId")
  assertIdentifier(input.concernId, "concernId")
  assertPositiveInteger(input.expectedVersion, "expectedVersion")
  const learnerRequestExcerpt = boundedText(
    input.learnerRequestExcerpt,
    "learnerRequestExcerpt",
    MAX_EXCERPT_CODE_POINTS,
  )
  const rationale = boundedText(input.rationale, "rationale", MAX_RATIONALE_CODE_POINTS)
  assertTimestamp(input.occurredAt, "occurredAt")
  return { ...input, learnerRequestExcerpt, rationale }
}

function validateReopenInput(input: Parameters<typeof reopenFutureAttentionConcern>[1]) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.modelOperationId, "modelOperationId")
  assertIdentifier(input.concernId, "concernId")
  assertPositiveInteger(input.expectedVersion, "expectedVersion")
  const learnerRequestExcerpt = boundedText(
    input.learnerRequestExcerpt,
    "learnerRequestExcerpt",
    MAX_EXCERPT_CODE_POINTS,
  )
  const rationale = boundedText(input.rationale, "rationale", MAX_RATIONALE_CODE_POINTS)
  assertTimestamp(input.occurredAt, "occurredAt")
  return { ...input, learnerRequestExcerpt, rationale }
}

function validateSupersedeInput(input: Parameters<typeof supersedeFutureAttentionConcern>[1]) {
  assertIdentifier(input.effectId, "effectId")
  assertIdentifier(input.successorConcernId, "successorConcernId")
  assertIdentifier(input.causeItemId, "causeItemId")
  assertIdentifier(input.modelOperationId, "modelOperationId")
  assertIdentifier(input.concernId, "concernId")
  assertPositiveInteger(input.expectedVersion, "expectedVersion")
  const learnerRequestExcerpt = boundedText(
    input.learnerRequestExcerpt,
    "learnerRequestExcerpt",
    MAX_EXCERPT_CODE_POINTS,
  )
  assertTarget(input.target)
  const replacementReason = boundedText(
    input.replacementReason,
    "replacementReason",
    MAX_REASON_CODE_POINTS,
  )
  const replacementLearnerRoleConstraint = validateLearnerRoleConstraint(
    input.replacementLearnerRoleConstraint,
  )
  assertTimestamp(input.replacementNotBefore, "replacementNotBefore")
  const rationale = boundedText(input.rationale, "rationale", MAX_RATIONALE_CODE_POINTS)
  assertTimestamp(input.occurredAt, "occurredAt")
  return {
    ...input,
    learnerRequestExcerpt,
    replacementReason,
    replacementLearnerRoleConstraint,
    rationale,
  }
}

function requireCreationSource(database: Database, sourceItemId: string, modelOperationId: string) {
  const row = database
    .query(`
      SELECT
        source.role,
        source.content,
        source.created_at,
        source.turn_id,
        model.turn_id AS model_turn_id,
        model.status AS model_status,
        model.sampled_at,
        turn.status AS turn_status
      FROM session_item AS source
      JOIN model_operation AS model ON model.model_operation_id = ?2
      JOIN turn ON turn.turn_id = model.turn_id
      WHERE source.item_id = ?1
    `)
    .get(sourceItemId, modelOperationId) as
    | {
        role: string
        content: string
        created_at: number
        turn_id: string
        model_turn_id: string
        model_status: string
        sampled_at: number
        turn_status: string
      }
    | null
  if (!row) failCommand("illegal_transition", "Unknown Agenda creation source or model operation")
  if (row.role !== "user") failCommand("illegal_transition", "Agenda creation source must be admitted learner input")
  if (row.turn_id !== row.model_turn_id) {
    failCommand("illegal_transition", "Agenda creation source and model operation must belong to the same Turn")
  }
  if (row.model_status !== "running" || row.turn_status !== "running") {
    failCommand("illegal_transition", "A new Agenda concern requires a running Turn and model operation")
  }
  return row
}

function requireCommandSource(
  database: Database,
  sourceItemId: string,
  modelOperationId: string,
) {
  const row = database
    .query(`
      SELECT
        source.sequence,
        source.role,
        source.content,
        source.created_at,
        source.turn_id,
        model.turn_id AS model_turn_id,
        model.status AS model_status,
        model.sampled_at,
        turn.status AS turn_status
      FROM session_item AS source
      JOIN model_operation AS model ON model.model_operation_id = ?2
      JOIN turn ON turn.turn_id = model.turn_id
      WHERE source.item_id = ?1
    `)
    .get(sourceItemId, modelOperationId) as CommandSourceRow | null
  if (!row) failCommand("illegal_transition", "Unknown Agenda command source or model operation")
  if (row.role !== "user") failCommand("illegal_transition", "Agenda command source must be admitted learner input")
  if (row.turn_id !== row.model_turn_id) {
    failCommand("illegal_transition", "Agenda command source and model operation must belong to the same Turn")
  }
  if (row.model_status !== "running" || row.turn_status !== "running") {
    failCommand("illegal_transition", "An Agenda command requires a running Turn and model operation")
  }
  return row
}

function requireLaterCommandSource(
  database: Database,
  concern: FutureAttentionConcern,
  commandSource: CommandSourceRow,
) {
  const creationSource = database
    .query("SELECT sequence FROM session_item WHERE item_id = ?1")
    .get(concern.sourceItemId) as { sequence: number } | null
  if (!creationSource) throw new Error(`Agenda source item is missing: ${concern.sourceItemId}`)
  if (
    commandSource.sequence <= creationSource.sequence ||
    commandSource.created_at < concern.createdAt
  ) {
    failCommand("illegal_transition", "Agenda transition command must come from a later learner occurrence")
  }
}

function requireCorrectionAfterDisposition(
  database: Database,
  concern: FutureAttentionConcern,
  commandSource: CommandSourceRow,
) {
  const disposition = database
    .query(`
      SELECT transition.occurred_at, source.sequence AS command_source_sequence
      FROM agenda_revisit_transition AS transition
      JOIN session_item AS source
        ON source.item_id = transition.command_source_item_id
      WHERE transition.revisit_id = ?1 AND transition.version_after = ?2
    `)
    .get(concern.id, concern.version) as
    | { occurred_at: number; command_source_sequence: number }
    | null
  if (!disposition) {
    throw new Error(`Agenda terminal disposition receipt is missing: ${concern.id}@${concern.version}`)
  }
  if (
    commandSource.sequence <= disposition.command_source_sequence ||
    commandSource.created_at < disposition.occurred_at
  ) {
    failCommand(
      "illegal_transition",
      "Agenda reopen correction must follow the disposition it corrects",
    )
  }
}

function requireServiceOccurrence(
  database: Database,
  concern: FutureAttentionConcern,
  occurrenceItemId: string,
) {
  const row = database
    .query(`
      SELECT
        occurrence.sequence,
        occurrence.role,
        occurrence.created_at,
        turn.status AS turn_status,
        turn.finished_at,
        source.sequence AS creation_source_sequence
      FROM session_item AS occurrence
      JOIN turn ON turn.turn_id = occurrence.turn_id
      JOIN session_item AS source ON source.item_id = ?2
      WHERE occurrence.item_id = ?1
    `)
    .get(occurrenceItemId, concern.sourceItemId) as
    | {
        sequence: number
        role: "user" | "assistant" | "tool"
        created_at: number
        turn_status: string
        finished_at: number | null
        creation_source_sequence: number
      }
    | null
  if (!row) failCommand("illegal_transition", `Unknown Agenda service occurrence: ${occurrenceItemId}`)
  if (row.sequence <= row.creation_source_sequence || row.created_at < concern.createdAt) {
    failCommand("illegal_transition", "Agenda service occurrence must be later than concern creation")
  }
  if (row.role === "tool") {
    failCommand("illegal_transition", "A tool receipt is not a legal first-slice Agenda service occurrence")
  }
  if (row.role === "assistant" && row.turn_status !== "completed") {
    failCommand("illegal_transition", "Agenda assistant occurrence must belong to a completed Turn")
  }
  if (row.role === "assistant" && row.finished_at === null) {
    throw new Error("Completed Agenda assistant occurrence has no completion time")
  }
  return {
    ...row,
    completed_at: row.role === "assistant" ? requireNullableNumber(row.finished_at) : row.created_at,
  }
}

function requireOpenVersion(concern: FutureAttentionConcern, expectedVersion: number) {
  if (concern.status !== "open") {
    failCommand("stale_agenda_concern", `Agenda concern is not open: ${concern.id}`)
  }
  if (concern.version !== expectedVersion) {
    failCommand(
      "stale_agenda_concern",
      `Stale Agenda concern version: expected ${expectedVersion}, current ${concern.version}`,
    )
  }
}

function requireReopenableVersion(
  concern: FutureAttentionConcern,
  expectedVersion: number,
) {
  if (concern.version !== expectedVersion) {
    failCommand(
      "stale_agenda_concern",
      `Stale Agenda concern version: expected ${expectedVersion}, current ${concern.version}`,
    )
  }
  if (concern.status !== "addressed" && concern.status !== "dismissed") {
    failCommand(
      "illegal_transition",
      `Only an addressed or dismissed Agenda concern can reopen: ${concern.id}`,
    )
  }
}

function requireRecordedTransition(
  database: Database,
  effectId: string,
  concernId: string,
  toStatus: FutureAttentionStatus,
) {
  const row = database
    .query(`
      SELECT
        transition_effect_id,
        revisit_id,
        from_status,
        to_status,
        command_source_item_id,
        transition_model_operation_id,
        service_occurrence_item_id,
        successor_revisit_id,
        rationale,
        version_after,
        occurred_at
      FROM agenda_revisit_transition
      WHERE transition_effect_id = ?1
    `)
    .get(effectId) as TransitionRow | null
  if (!row || row.revisit_id !== concernId || row.to_status !== toStatus) {
    throw new Error(`Agenda transition receipt is missing or inconsistent: ${effectId}`)
  }
  return row
}

function requireCurrentTarget(database: Database, target: CourseItemTargetRef) {
  const row = database
    .query(`
      SELECT
        focus.course_id AS focused_course_id,
        active.course_view_revision_id AS active_view_revision_id,
        item.course_item_id
      FROM current_learning_focus AS focus
      JOIN active_course_view AS active ON active.course_id = focus.course_id
      LEFT JOIN course_view_item AS item
        ON item.course_view_revision_id = ?2 AND item.course_item_id = ?3
      WHERE focus.singleton = 1 AND focus.course_id = ?1
    `)
    .get(target.courseId, target.courseViewRevisionId, target.courseItemId) as
    | {
        focused_course_id: string
        active_view_revision_id: string
        course_item_id: string | null
      }
    | null
  if (
    !row ||
    row.active_view_revision_id !== target.courseViewRevisionId ||
    row.course_item_id !== target.courseItemId
  ) {
    failCommand("stale_course_context", "Agenda target changed after the model context was sampled")
  }
}

function requireActiveTargetView(database: Database, target: CourseItemTargetRef) {
  const row = database
    .query(`
      SELECT
        active.course_view_revision_id AS active_view_revision_id,
        item.course_item_id
      FROM active_course_view AS active
      LEFT JOIN course_view_item AS item
        ON item.course_view_revision_id = ?2 AND item.course_item_id = ?3
      WHERE active.course_id = ?1
    `)
    .get(target.courseId, target.courseViewRevisionId, target.courseItemId) as
    | { active_view_revision_id: string; course_item_id: string | null }
    | null
  if (
    !row ||
    row.active_view_revision_id !== target.courseViewRevisionId ||
    row.course_item_id !== target.courseItemId
  ) {
    failCommand("stale_course_context", "Agenda target Course View is no longer active")
  }
}

function readEffect(database: Database, kind: string, causeItemId: string, effectSlot: string) {
  return database
    .query(`
      SELECT effect_id, value_json, revision_after
      FROM durable_effect
      WHERE kind = ?1 AND cause_item_id = ?2 AND effect_slot = ?3
    `)
    .get(kind, causeItemId, effectSlot) as
    | { effect_id: string; value_json: string; revision_after: number }
    | null
}

function insertEffect(
  database: Database,
  input: {
    effectId: string
    kind: string
    causeItemId: string
    effectSlot: string
    valueJson: string
    revisionAfter: number
    occurredAt: number
  },
) {
  database
    .query(`
      INSERT INTO durable_effect (
        effect_id, kind, cause_item_id, effect_slot, value_json, revision_after, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `)
    .run(
      input.effectId,
      input.kind,
      input.causeItemId,
      input.effectSlot,
      input.valueJson,
      input.revisionAfter,
      input.occurredAt,
    )
}

function updateOpenConcern(
  database: Database,
  input: {
    concernId: string
    expectedVersion: number
    nextStatus: "addressed" | "dismissed" | "superseded"
    successorConcernId?: string
    occurredAt: number
  },
) {
  const nextVersion = input.expectedVersion + 1
  const updated = input.nextStatus === "superseded"
    ? database
        .query(`
          UPDATE agenda_revisit
          SET
            status = 'superseded',
            version = ?1,
            successor_revisit_id = ?2,
            updated_at = ?3
          WHERE revisit_id = ?4 AND status = 'open' AND version = ?5
        `)
        .run(
          nextVersion,
          input.successorConcernId ?? null,
          input.occurredAt,
          input.concernId,
          input.expectedVersion,
        )
    : database
        .query(`
          UPDATE agenda_revisit
          SET status = ?1, version = ?2, updated_at = ?3
          WHERE revisit_id = ?4 AND status = 'open' AND version = ?5
        `)
        .run(
          input.nextStatus,
          nextVersion,
          input.occurredAt,
          input.concernId,
          input.expectedVersion,
        )
  if (updated.changes !== 1) {
    throw new Error(`Agenda concern changed during transition: ${input.concernId}`)
  }
}

function readByCreateSlot(
  database: Database,
  sourceItemId: string,
  viewRevisionId: string,
  itemId: string,
) {
  return database
    .query(`
      SELECT revisit_id, creation_effect_id
        , effect.revision_after AS effect_revision_after
        , semantic_author_kind
        , learner_request_excerpt
        , target_course_id
        , target_course_view_revision_id
        , target_course_item_id
        , reason
        , learner_role_constraint
        , not_before
      FROM agenda_revisit
      JOIN durable_effect AS effect ON effect.effect_id = agenda_revisit.creation_effect_id
      WHERE creation_source_item_id = ?1
        AND target_course_view_revision_id = ?2
        AND target_course_item_id = ?3
    `)
    .get(sourceItemId, viewRevisionId, itemId) as CreateSlotRow | null
}

function assertUnusedIdentity(database: Database, effectId: string, concernId: string) {
  assertUnusedEffectIdentity(database, effectId)
  const concern = database.query("SELECT 1 AS found FROM agenda_revisit WHERE revisit_id = ?1").get(concernId)
  if (concern) throw new Error(`Agenda concern ID was reused: ${concernId}`)
}

function assertUnusedEffectIdentity(database: Database, effectId: string) {
  const effect = database.query("SELECT 1 AS found FROM durable_effect WHERE effect_id = ?1").get(effectId)
  if (effect) throw new Error(`Durable effect ID was reused: ${effectId}`)
}

function assertTarget(target: CourseItemTargetRef) {
  assertIdentifier(target.courseId, "target.courseId")
  assertIdentifier(target.courseViewRevisionId, "target.courseViewRevisionId")
  assertIdentifier(target.courseItemId, "target.courseItemId")
}

function assertTransitionTime(occurredAt: number, sourceAt: number, lastTransitionAt: number) {
  if (occurredAt < sourceAt) {
    failCommand("illegal_transition", "Agenda transition cannot precede its source")
  }
  if (occurredAt < lastTransitionAt) {
    failCommand("illegal_transition", "Agenda transition cannot precede the latest durable state transition")
  }
}

function boundedText(value: string, label: string, maxCodePoints: number) {
  if (!value.trim()) failCommand("invalid_input", `${label} must not be empty`)
  const normalized = value.trim()
  if (Array.from(normalized).length > maxCodePoints) {
    failCommand("invalid_input", `${label} must not exceed ${maxCodePoints} Unicode code points`)
  }
  return normalized
}

function requireNullableText(value: string | null) {
  if (value === null) throw new Error("Learner-requested Agenda concern has no source excerpt")
  return value
}

function requireNullableNumber(value: number | null) {
  if (value === null) throw new Error("Required durable timestamp is missing")
  return value
}

function assertIdentifier(value: string, label: string) {
  if (!value.trim()) failCommand("invalid_input", `${label} must not be empty`)
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    failCommand("invalid_input", `${label} must be a positive integer`)
  }
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    failCommand("invalid_input", `${label} must be a non-negative integer`)
  }
}

function assertTimestamp(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || Number.isNaN(new Date(value).getTime())) {
    failCommand("invalid_input", `${label} must be a non-negative integer timestamp`)
  }
}

function failCommand(code: FutureAttentionCommandErrorCode, message: string): never {
  throw new FutureAttentionCommandError(code, message)
}
