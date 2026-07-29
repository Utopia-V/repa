export * as LearnerNavigationConstraintSchema from "./constraint-schema-v2"

import { Effect } from "effect"
import type { Database } from "../database/database"
import { statements as statementsV1 } from "./constraint-schema-v1"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const replaced = new Set(["learner_default_course_validate_insert"])

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

function exactDefaultCourseEndpoint(column: string, version: 1 | 2) {
  const recorded = `recorded_v${version}`
  const missingString =
    version === 1
      ? `OR (
          json_extract(${column}, '$.locator.title.availability') = 'not_recorded_v1'
          AND (SELECT count(*) FROM json_each(${column}, '$.locator.title')) = 1
          AND NOT EXISTS (
            SELECT 1 FROM json_each(${column}, '$.locator.title') AS member
            WHERE member.key <> 'availability'
          )
          AND json_type(${column}, '$.locator.title.value') IS NULL
        )`
      : ""
  const missingVersion =
    version === 1
      ? `OR (
          json_extract(${column}, '$.locator.courseVersion.availability') = 'not_recorded_v1'
          AND (SELECT count(*) FROM json_each(${column}, '$.locator.courseVersion')) = 1
          AND NOT EXISTS (
            SELECT 1 FROM json_each(${column}, '$.locator.courseVersion') AS member
            WHERE member.key <> 'availability'
          )
          AND json_type(${column}, '$.locator.courseVersion.value') IS NULL
        )`
      : ""
  const missingSelection =
    version === 1
      ? `OR (
          json_extract(${column}, '$.locator.workingSelection.availability') = 'not_recorded_v1'
          AND (SELECT count(*) FROM json_each(${column}, '$.locator.workingSelection')) = 1
          AND NOT EXISTS (
            SELECT 1 FROM json_each(${column}, '$.locator.workingSelection') AS member
            WHERE member.key <> 'availability'
          )
          AND json_type(${column}, '$.locator.workingSelection.value') IS NULL
        )`
      : ""
  return `(
    (
      json_extract(${column}, '$.kind') = 'absent'
      AND (SELECT count(*) FROM json_each(${column})) = 1
      AND NOT EXISTS (
        SELECT 1 FROM json_each(${column}) AS member WHERE member.key <> 'kind'
      )
    )
    OR
    (
      json_extract(${column}, '$.kind') = 'course'
      AND (SELECT count(*) FROM json_each(${column})) = 2
      AND NOT EXISTS (
        SELECT 1 FROM json_each(${column}) AS member WHERE member.key NOT IN ('kind', 'locator')
      )
      AND json_type(${column}, '$.locator') = 'object'
      AND (SELECT count(*) FROM json_each(${column}, '$.locator')) = 4
      AND NOT EXISTS (
        SELECT 1 FROM json_each(${column}, '$.locator') AS member
        WHERE member.key NOT IN ('courseID', 'title', 'courseVersion', 'workingSelection')
      )
      AND json_type(${column}, '$.locator.courseID') = 'text'
      AND length(json_extract(${column}, '$.locator.courseID')) > 0
      AND json_type(${column}, '$.locator.title') = 'object'
      AND (
        (
          json_extract(${column}, '$.locator.title.availability') = '${recorded}'
          AND (SELECT count(*) FROM json_each(${column}, '$.locator.title')) = 2
          AND NOT EXISTS (
            SELECT 1 FROM json_each(${column}, '$.locator.title') AS member
            WHERE member.key NOT IN ('availability', 'value')
          )
          AND json_type(${column}, '$.locator.title.value') = 'text'
        )
        ${missingString}
      )
      AND json_type(${column}, '$.locator.courseVersion') = 'object'
      AND (
        (
          json_extract(${column}, '$.locator.courseVersion.availability') = '${recorded}'
          AND (SELECT count(*) FROM json_each(${column}, '$.locator.courseVersion')) = 2
          AND NOT EXISTS (
            SELECT 1 FROM json_each(${column}, '$.locator.courseVersion') AS member
            WHERE member.key NOT IN ('availability', 'value')
          )
          AND json_type(${column}, '$.locator.courseVersion.value') = 'integer'
          AND json_extract(${column}, '$.locator.courseVersion.value') >= 0
        )
        ${missingVersion}
      )
      AND json_type(${column}, '$.locator.workingSelection') = 'object'
      AND (
        (
          json_extract(${column}, '$.locator.workingSelection.availability') = '${recorded}'
          AND (SELECT count(*) FROM json_each(${column}, '$.locator.workingSelection')) = 2
          AND NOT EXISTS (
            SELECT 1 FROM json_each(${column}, '$.locator.workingSelection') AS member
            WHERE member.key NOT IN ('availability', 'value')
          )
          AND json_type(${column}, '$.locator.workingSelection.value') = 'object'
          AND (SELECT count(*) FROM json_each(
            ${column}, '$.locator.workingSelection.value'
          )) = 6
          AND NOT EXISTS (
            SELECT 1 FROM json_each(
              ${column}, '$.locator.workingSelection.value'
            ) AS member
            WHERE member.key NOT IN (
              'revisionID', 'selectionVersion', 'viewID', 'viewName',
              'viewVersion', 'revisionVersion'
            )
          )
          AND json_type(${column}, '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
          AND json_type(${column}, '$.locator.workingSelection.value.selectionVersion') = 'integer'
          AND json_extract(${column}, '$.locator.workingSelection.value.selectionVersion') >= 0
          AND json_type(${column}, '$.locator.workingSelection.value.viewID') IN ('text', 'null')
          AND json_type(${column}, '$.locator.workingSelection.value.viewName') IN ('text', 'null')
          AND json_type(${column}, '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
          AND (
            json_type(${column}, '$.locator.workingSelection.value.viewVersion') = 'null'
            OR json_extract(${column}, '$.locator.workingSelection.value.viewVersion') >= 0
          )
          AND json_type(${column}, '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
          AND (
            json_type(${column}, '$.locator.workingSelection.value.revisionVersion') = 'null'
            OR json_extract(${column}, '$.locator.workingSelection.value.revisionVersion') >= 0
          )
          AND (
            (
              json_type(${column}, '$.locator.workingSelection.value.revisionID') = 'null'
              AND json_type(${column}, '$.locator.workingSelection.value.viewID') = 'null'
              AND json_type(${column}, '$.locator.workingSelection.value.viewName') = 'null'
              AND json_type(${column}, '$.locator.workingSelection.value.viewVersion') = 'null'
              AND json_type(${column}, '$.locator.workingSelection.value.revisionVersion') = 'null'
            )
            OR
            (
              json_type(${column}, '$.locator.workingSelection.value.revisionID') = 'text'
              AND json_type(${column}, '$.locator.workingSelection.value.viewID') = 'text'
              AND json_type(${column}, '$.locator.workingSelection.value.viewName') = 'text'
              AND json_type(${column}, '$.locator.workingSelection.value.viewVersion') = 'integer'
              AND json_type(${column}, '$.locator.workingSelection.value.revisionVersion') = 'integer'
            )
          )
        )
        ${missingSelection}
      )
    )
  )`
}

function exactDefaultCourseOperation(operation: string, from: string, to: string) {
  return `(
    (${operation} = 'set'
      AND json_extract(${from}, '$.kind') = 'absent'
      AND json_extract(${to}, '$.kind') = 'course')
    OR
    (${operation} = 'change'
      AND json_extract(${from}, '$.kind') = json_extract(${to}, '$.kind')
      AND json_extract(${from}, '$.kind') IN ('absent', 'course'))
    OR
    (${operation} = 'clear'
      AND json_extract(${from}, '$.kind') = 'course'
      AND json_extract(${to}, '$.kind') = 'absent')
  )`
}

export const defaultCourseTransitionStatement = `CREATE TRIGGER IF NOT EXISTS learner_default_course_validate_insert_v13
 BEFORE INSERT ON learner_default_course_transition
 BEGIN
   SELECT RAISE(ABORT, 'learner_default_course_predecessor_invalid')
   WHERE NEW.predecessor_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM learner_default_course_transition AS predecessor
       WHERE predecessor.id = NEW.predecessor_id
         AND predecessor.version = NEW.version - 1
         AND predecessor.course_id IS NEW.previous_course_id
         AND predecessor.time_committed <= NEW.time_committed
         AND predecessor.frontier_sequence < NEW.frontier_sequence
     );
   SELECT RAISE(ABORT, 'learner_default_course_frontier_invalid')
   WHERE NOT EXISTS (
     SELECT 1 FROM learning_shared_frontier
     WHERE sequence = NEW.frontier_sequence AND time_committed = NEW.frontier_time
   )
     OR EXISTS (
       SELECT 1 FROM learner_course_route_anchor_transition
       WHERE frontier_sequence = NEW.frontier_sequence
     );
   SELECT RAISE(ABORT, 'learner_default_course_disposition_invalid')
   WHERE NOT EXISTS (
     SELECT 1
     FROM learner_default_course_disposition AS authorization
     JOIN learning_command_invocation AS invocation
       ON invocation.part_id = authorization.invocation_part_id
     WHERE authorization.invocation_part_id = NEW.authorization_part_id
       AND invocation.occurrence_id = NEW.occurrence_id
       AND invocation.command_name = 'set_default_course_preference'
       AND (
         (
           authorization.disposition = 'legacy_v1'
           AND authorization.authorization_kind = 'legacy_v1'
           AND authorization.authorization_version = 1
           AND authorization.legacy_row_class IN ('applied', 'already_applied')
           AND authorization.confirmation_availability = 'recorded_v1'
           AND authorization.legacy_effect_id = NEW.id
           AND authorization.effect_confirmation_request_id = NEW.permission_request_id
           AND NEW.permission_request_id IS NOT NULL
           AND json_valid(NEW.confirmation_snapshot)
           AND json_extract(NEW.confirmation_snapshot, '$.permissionRequestID') = NEW.permission_request_id
         )
         OR
         (
           authorization.disposition = 'candidate_v2'
           AND authorization.authorization_kind IN ('direct_request_v2', 'accepted_proposal_v2')
           AND authorization.authorization_version = 2
           AND invocation.command_version = 2
           AND invocation.capability_identity = 'set_default_course_preference'
           AND invocation.capability_version = 2
           AND invocation.authorization_basis = CASE authorization.authorization_kind
             WHEN 'direct_request_v2' THEN 'learner_request'
             ELSE 'learner_acceptance'
           END
           AND invocation.status = 'admitted'
           AND NEW.permission_request_id IS NULL
           AND NEW.confirmation_snapshot IS NULL
           AND authorization.preference_head_id IS NEW.predecessor_id
           AND authorization.preference_version = NEW.version - 1
           AND json_extract(authorization.command_snapshot, '$.expectedHeadID') IS NEW.predecessor_id
           AND json_extract(authorization.command_snapshot, '$.expectedVersion') = NEW.version - 1
           AND json_extract(authorization.command_snapshot, '$.target.courseID') IS NEW.course_id
           AND authorization.selected_course_id IS NEW.course_id
           AND (
             (authorization.operation = 'set'
               AND NEW.previous_course_id IS NULL AND NEW.course_id IS NOT NULL
               AND json_extract(authorization.from_locator, '$.kind') = 'absent'
               AND json_extract(authorization.to_locator, '$.kind') = 'course')
             OR
             (authorization.operation = 'change'
               AND NEW.previous_course_id IS NOT NULL AND NEW.course_id IS NOT NULL
               AND json_extract(authorization.from_locator, '$.kind') = 'course'
               AND json_extract(authorization.to_locator, '$.kind') = 'course')
             OR
             (authorization.operation = 'clear'
               AND NEW.previous_course_id IS NOT NULL AND NEW.course_id IS NULL
               AND json_extract(authorization.from_locator, '$.kind') = 'course'
               AND json_extract(authorization.to_locator, '$.kind') = 'absent')
           )
           AND json_extract(authorization.from_locator, '$.locator.courseID') IS NEW.previous_course_id
           AND json_extract(authorization.to_locator, '$.locator.courseID') IS NEW.course_id
           AND (
             NEW.course_id IS NULL
             OR (
               json_extract(authorization.to_locator, '$.locator.title.availability') = 'recorded_v2'
               AND json_extract(authorization.to_locator, '$.locator.courseVersion.availability') = 'recorded_v2'
               AND json_extract(authorization.to_locator, '$.locator.courseVersion.value') = NEW.target_course_version
               AND json_extract(authorization.to_locator, '$.locator.workingSelection.availability') = 'recorded_v2'
               AND json_extract(authorization.to_locator, '$.locator.workingSelection.value.revisionID')
                   IS NEW.target_selection_revision_id
               AND json_extract(authorization.to_locator, '$.locator.workingSelection.value.selectionVersion')
                   IS NEW.target_selection_version
               AND json_extract(authorization.to_locator, '$.locator.workingSelection.value.viewID')
                   IS NEW.target_view_id
               AND json_extract(authorization.to_locator, '$.locator.workingSelection.value.viewVersion')
                   IS NEW.target_view_version
               AND json_extract(authorization.to_locator, '$.locator.workingSelection.value.revisionVersion')
                   IS NEW.target_revision_version
             )
           )
           AND EXISTS (
             SELECT 1
             FROM learner_default_course_capability_settlement AS capability
             WHERE capability.invocation_part_id = authorization.invocation_part_id
               AND capability.authorization_fingerprint = authorization.authorization_fingerprint
               AND capability.outcome IN ('policy_allow', 'prompted_allow')
           )
         )
       )
   );
 END`

export const authorityStatements = [
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_proposal_validate_insert_v13
   BEFORE INSERT ON learner_default_course_proposal
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_proposal_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM turn_tool_candidate AS candidate
       JOIN turn_candidate_presentation AS presentation ON presentation.part_id = candidate.part_id
       JOIN part ON part.id = candidate.part_id
       JOIN turn_tool_invocation AS invocation ON invocation.part_id = candidate.part_id
       LEFT JOIN learning_command_invocation AS physical ON physical.part_id = candidate.part_id
       WHERE candidate.part_id = NEW.part_id
         AND candidate.turn_id = NEW.turn_id
         AND candidate.session_id = NEW.session_id
         AND candidate.assistant_message_id = NEW.assistant_message_id
         AND candidate.call_id = NEW.call_id
         AND candidate.emission_ordinal = NEW.emission_ordinal
         AND candidate.tool = 'propose_default_course_preference'
         AND candidate.state = 'admitted'
         AND presentation.session_id = NEW.session_id
         AND invocation.state = 'running'
         AND physical.part_id IS NULL
         AND part.session_id = NEW.session_id
         AND part.message_id = NEW.assistant_message_id
         AND json_extract(part.data, '$.type') = 'tool'
         AND json_extract(part.data, '$.callID') = NEW.call_id
         AND json_extract(part.data, '$.tool') = 'propose_default_course_preference'
         AND json_extract(part.data, '$.state.status') = 'completed'
         AND json_extract(part.data, '$.state.time.end') = NEW.time_presented
         AND json_extract(part.data, '$.state.metadata.proposalKind') = 'default_course_preference'
         AND json_extract(part.data, '$.state.metadata.proposalFingerprint') = NEW.proposal_fingerprint
         AND json_extract(part.data, '$.state.metadata.emissionOrdinal') = NEW.emission_ordinal
         AND json_extract(part.data, '$.state.metadata.durablyRecorded') = 1
         AND json_extract(part.data, '$.state.metadata.mutating') = 0
         AND json_extract(json_extract(part.data, '$.state.output'), '$.outcome') = 'proposal_recorded'
         AND json_extract(json_extract(part.data, '$.state.output'), '$.proposal.fingerprint')
             = NEW.proposal_fingerprint
         AND ${exactDefaultCourseEndpoint("NEW.from_locator", 2)}
         AND ${exactDefaultCourseEndpoint("NEW.to_locator", 2)}
         AND ${exactDefaultCourseOperation("NEW.operation", "NEW.from_locator", "NEW.to_locator")}
         AND candidate.time_registered <= NEW.time_presented
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_proposal_part_immutable_v13
   BEFORE UPDATE ON part
   WHEN EXISTS (
     SELECT 1 FROM learner_default_course_proposal AS proposal
     WHERE proposal.part_id = OLD.id
   )
     AND (
       NEW.id IS NOT OLD.id
       OR NEW.message_id IS NOT OLD.message_id
       OR NEW.session_id IS NOT OLD.session_id
       OR NEW.time_created IS NOT OLD.time_created
       OR NEW.data IS NOT OLD.data
     )
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_proposal_part_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_disposition_validate_insert_v13
   BEFORE INSERT ON learner_default_course_disposition
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_legacy_disposition_migration_only')
     WHERE NEW.disposition = 'legacy_v1';
     SELECT RAISE(ABORT, 'learner_default_course_disposition_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learning_command_invocation AS invocation
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = invocation.occurrence_id
       JOIN turn_model_operation AS invocation_model
         ON invocation_model.assistant_message_id = invocation.assistant_message_id
       WHERE invocation.part_id = NEW.invocation_part_id
         AND invocation.command_name = 'set_default_course_preference'
         AND invocation.command_version = 2
         AND invocation.capability_identity = 'set_default_course_preference'
         AND invocation.capability_version = 2
         AND invocation.status = 'admitted'
         AND invocation.time_admitted = NEW.time_disposed
         AND occurrence.id = invocation.occurrence_id
         AND occurrence.origin_session_id = invocation.session_id
         AND occurrence.origin_message_id = invocation.parent_user_message_id
         AND invocation_model.causal_occurrence_id = invocation.occurrence_id
         AND occurrence.time_admitted <= invocation_model.time_admitted
         AND invocation_model.time_admitted <= invocation.time_admitted
         AND (
           (
             NEW.disposition = 'semantic_terminal_v2'
             AND invocation.authorization_basis IN ('learner_request', 'learner_acceptance')
             AND json_extract(NEW.command_snapshot, '$.kind') = 'default_course_preference'
             AND json_extract(NEW.semantic_address, '$.occurrenceID') = invocation.occurrence_id
             AND json_extract(NEW.semantic_address, '$.slot') = 'default_course_preference'
             AND EXISTS (
               SELECT 1
               FROM learner_default_course_transition AS effect
               JOIN learner_default_course_commit_seal AS seal ON seal.effect_id = effect.id
               JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
               WHERE effect.id = NEW.existing_effect_id
                 AND effect.occurrence_id = invocation.occurrence_id
                 AND (
                   (
                     NEW.semantic_outcome = 'already_applied'
                     AND effect.course_id IS json_extract(NEW.command_snapshot, '$.target.courseID')
                     AND NEW.incoming_payload_fingerprint = NEW.existing_payload_fingerprint
                   )
                   OR
                   (
                     NEW.semantic_outcome = 'semantic_conflict'
                     AND effect.course_id IS NOT json_extract(NEW.command_snapshot, '$.target.courseID')
                     AND NEW.incoming_payload_fingerprint <> NEW.existing_payload_fingerprint
                   )
                 )
             )
           )
           OR
           (
             NEW.disposition = 'candidate_v2'
             AND invocation.authorization_basis = CASE NEW.authorization_kind
               WHEN 'direct_request_v2' THEN 'learner_request'
               ELSE 'learner_acceptance'
             END
             AND ${exactDefaultCourseEndpoint("NEW.from_locator", 2)}
             AND ${exactDefaultCourseEndpoint("NEW.to_locator", 2)}
             AND ${exactDefaultCourseOperation("NEW.operation", "NEW.from_locator", "NEW.to_locator")}
             AND EXISTS (
               SELECT 1 FROM message AS source_message
               WHERE source_message.id = invocation.parent_user_message_id
                 AND source_message.session_id = invocation.session_id
                 AND json_extract(source_message.data, '$.role') = 'user'
             )
             AND (
               (
                 NEW.authorization_kind = 'direct_request_v2'
                 AND json_extract(NEW.resolution_scope, '$.coverage') = 'complete'
               )
               OR
               (
                 NEW.authorization_kind = 'accepted_proposal_v2'
                 AND EXISTS (
               WITH RECURSIVE lineage(part_id) AS (
                 SELECT NEW.proposal_presentation_part_id
                 UNION
                 SELECT historical.source_part_id
                 FROM lineage
                 JOIN turn_historical_tool_presentation AS historical
                   ON historical.part_id = lineage.part_id
                 WHERE lineage.part_id <> NEW.proposal_part_id
               )
               SELECT 1
               FROM learner_default_course_proposal AS proposal
               JOIN turn_model_operation AS proposal_model
                 ON proposal_model.assistant_message_id = proposal.assistant_message_id
               JOIN part AS presentation
                 ON presentation.id = NEW.proposal_presentation_part_id
               WHERE proposal.part_id = NEW.proposal_part_id
                 AND presentation.message_id = NEW.proposal_presentation_assistant_message_id
                 AND proposal.assistant_message_id = NEW.proposal_assistant_message_id
                 AND proposal.emission_ordinal = NEW.proposal_emission_ordinal
                 AND proposal.proposal_fingerprint = NEW.proposal_fingerprint
                 AND proposal.command_fingerprint = NEW.command_fingerprint
                 AND proposal.resolution_fingerprint = NEW.resolution_fingerprint
                 AND proposal.preference_head_id IS NEW.preference_head_id
                 AND proposal.preference_version = NEW.preference_version
                 AND proposal.operation = NEW.operation
                 AND json(proposal.command_snapshot) = json(NEW.command_snapshot)
                 AND json(proposal.resolution_scope) = json(NEW.resolution_scope)
                 AND json(proposal.from_locator) = json(NEW.from_locator)
                 AND json(proposal.to_locator) = json(NEW.to_locator)
                 AND proposal.time_presented < occurrence.time_admitted
                 AND occurrence.time_admitted <= invocation.time_admitted
                 AND NEW.proposal_presentation_assistant_message_id <> invocation.assistant_message_id
                 AND proposal.assistant_message_id <> invocation.assistant_message_id
                 AND proposal_model.causal_occurrence_id IS NOT invocation.occurrence_id
                 AND EXISTS (
                   SELECT 1 FROM lineage WHERE part_id = NEW.proposal_part_id
                 )
                 AND NOT EXISTS (
                   SELECT 1
                   FROM lineage
                   JOIN turn_historical_tool_presentation AS historical
                     ON historical.part_id = lineage.part_id
                   LEFT JOIN learning_historical_tool_presentation AS auxiliary
                     ON auxiliary.part_id = historical.part_id
                   WHERE historical.time_created >= occurrence.time_admitted
                      OR (
                        auxiliary.part_id IS NOT NULL
                        AND auxiliary.source_part_id <> historical.source_part_id
                      )
                 )
                 AND (
                   NEW.proposal_selection = 'explicit_reference'
                   OR (
                     NEW.proposal_selection = 'sole_presented'
                     AND (
                       SELECT count(*)
                       FROM learner_default_course_proposal AS sibling
                       WHERE sibling.assistant_message_id = proposal.assistant_message_id
                     ) = 1
                   )
                 )
                 )
               )
             )
           )
         )
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_capability_issue_validate_insert_v13
   BEFORE INSERT ON learner_default_course_capability_issue
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_capability_issue_invalid')
     WHERE EXISTS (
       SELECT 1 FROM learner_default_course_capability_settlement
       WHERE invocation_part_id = NEW.invocation_part_id
     )
       OR NOT EXISTS (
         SELECT 1
         FROM learner_default_course_disposition AS authorization
         JOIN learning_command_invocation AS invocation
           ON invocation.part_id = authorization.invocation_part_id
         WHERE authorization.invocation_part_id = NEW.invocation_part_id
           AND authorization.authorization_version = 2
           AND authorization.disposition = 'candidate_v2'
           AND authorization.authorization_fingerprint = NEW.authorization_fingerprint
           AND invocation.status = 'admitted'
           AND authorization.time_disposed <= NEW.time_issued
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_capability_settlement_validate_insert_v13
   BEFORE INSERT ON learner_default_course_capability_settlement
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_capability_settlement_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_default_course_disposition AS authorization
       JOIN learning_command_invocation AS invocation
         ON invocation.part_id = authorization.invocation_part_id
       WHERE authorization.invocation_part_id = NEW.invocation_part_id
         AND authorization.authorization_version = 2
         AND authorization.disposition = 'candidate_v2'
         AND authorization.authorization_fingerprint = NEW.authorization_fingerprint
         AND invocation.status = 'admitted'
         AND authorization.time_disposed <= NEW.time_settled
     )
       OR (
         NEW.outcome IN (
           'prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel', 'prompted_abort'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM learner_default_course_capability_issue AS issue
           WHERE issue.invocation_part_id = NEW.invocation_part_id
             AND issue.permission_request_id = NEW.permission_request_id
             AND issue.authorization_fingerprint = NEW.authorization_fingerprint
             AND issue.time_issued <= NEW.time_settled
             AND issue.issue_order <= NEW.settlement_order
         )
       )
       OR (
         NEW.outcome IN ('not_evaluated', 'policy_allow', 'policy_deny')
         AND EXISTS (
           SELECT 1 FROM learner_default_course_capability_issue
           WHERE invocation_part_id = NEW.invocation_part_id
         )
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_acknowledgement_validate_insert_v13
   BEFORE INSERT ON learner_default_course_acknowledgement
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_acknowledgement_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_default_course_disposition AS invocation_disposition
       JOIN learner_default_course_transition AS effect ON effect.id = NEW.effect_id
       JOIN learner_default_course_disposition AS effect_authorization
         ON effect_authorization.invocation_part_id = effect.authorization_part_id
       JOIN learner_default_course_commit_seal AS seal ON seal.effect_id = effect.id
       JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
       WHERE invocation_disposition.invocation_part_id = NEW.invocation_part_id
         AND effect_authorization.authorization_version = NEW.authorization_version
         AND effect_authorization.disposition IN ('legacy_v1', 'candidate_v2')
         AND effect.authorization_part_id = NEW.effect_authorization_part_id
         AND receipt.id = NEW.receipt_id
         AND receipt.time_committed = NEW.time_committed
         AND receipt.commit_order = NEW.commit_order
         AND json_extract(NEW.presentation_snapshot, '$.schemaVersion') = 1
         AND json_extract(NEW.presentation_snapshot, '$.invocationPartID') = NEW.invocation_part_id
         AND json_extract(NEW.presentation_snapshot, '$.effectAuthorizationPartID')
             = NEW.effect_authorization_part_id
         AND json_extract(NEW.presentation_snapshot, '$.authorizationVersion') = NEW.authorization_version
         AND json_extract(NEW.presentation_snapshot, '$.effectID') = NEW.effect_id
         AND json_extract(NEW.presentation_snapshot, '$.receiptID') = NEW.receipt_id
         AND json_extract(NEW.presentation_snapshot, '$.operation') = NEW.operation
         AND json(json_extract(NEW.presentation_snapshot, '$.from')) = json(NEW.from_locator)
         AND json(json_extract(NEW.presentation_snapshot, '$.to')) = json(NEW.to_locator)
         AND json_extract(NEW.presentation_snapshot, '$.relation') = NEW.relation
         AND json_extract(NEW.presentation_snapshot, '$.timeCommitted') = NEW.time_committed
         AND json_extract(NEW.presentation_snapshot, '$.commitOrder') = NEW.commit_order
         AND (
           (
             NEW.authorization_version = 1
             AND ${exactDefaultCourseEndpoint("NEW.from_locator", 1)}
             AND ${exactDefaultCourseEndpoint("NEW.to_locator", 1)}
           )
           OR
           (
             NEW.authorization_version = 2
             AND ${exactDefaultCourseEndpoint("NEW.from_locator", 2)}
             AND ${exactDefaultCourseEndpoint("NEW.to_locator", 2)}
           )
         )
         AND ${exactDefaultCourseOperation("NEW.operation", "NEW.from_locator", "NEW.to_locator")}
         AND (
           invocation_disposition.disposition IN ('legacy_v1', 'candidate_v2')
           OR (
             invocation_disposition.disposition = 'semantic_terminal_v2'
             AND invocation_disposition.semantic_outcome = 'already_applied'
             AND invocation_disposition.existing_effect_id = NEW.effect_id
             AND invocation_disposition.incoming_payload_fingerprint
                 = invocation_disposition.existing_payload_fingerprint
           )
         )
         AND (
           (
             effect_authorization.authorization_version = 2
             AND json(effect_authorization.from_locator) = json(NEW.from_locator)
             AND json(effect_authorization.to_locator) = json(NEW.to_locator)
             AND effect_authorization.operation = NEW.operation
           )
           OR effect_authorization.authorization_version = 1
         )
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_commit_seal_validate_insert_v13
   BEFORE INSERT ON learner_default_course_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_commit_seal_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_default_course_transition AS effect
       JOIN learner_default_course_disposition AS authorization
         ON authorization.invocation_part_id = effect.authorization_part_id
       JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_part_id = NEW.invocation_part_id
         AND receipt.invocation_part_id = NEW.invocation_part_id
         AND receipt.occurrence_id = effect.occurrence_id
         AND invocation.occurrence_id = effect.occurrence_id
         AND invocation.command_name = 'set_default_course_preference'
         AND invocation.command_version = authorization.authorization_version
         AND authorization.disposition IN ('legacy_v1', 'candidate_v2')
         AND invocation.capability_identity = 'set_default_course_preference'
         AND invocation.capability_version = authorization.authorization_version
         AND invocation.authorization_basis = receipt.authorization_basis
         AND invocation.status = 'admitted'
     );
   END`,
  ...[
    "learner_default_course_proposal",
    "learner_default_course_disposition",
    "learner_default_course_capability_issue",
    "learner_default_course_capability_settlement",
    "learner_default_course_acknowledgement",
  ].flatMap((table) => [
    `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_v13
     BEFORE UPDATE ON ${table}
     BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`,
    `CREATE TRIGGER IF NOT EXISTS ${table}_delete_forbidden_v13
     BEFORE DELETE ON ${table}
     BEGIN SELECT RAISE(ABORT, '${table}_delete_forbidden'); END`,
  ]),
] as const

export const statements = [
  ...statementsV1.filter((statement) => {
    const name = triggerName(statement)
    return !name || !replaced.has(name)
  }),
  defaultCourseTransitionStatement,
  ...authorityStatements,
] as const

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
