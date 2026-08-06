export * as LearnerResponseEvidenceConstraintSchemaV1 from "./constraint-schema-v1"

import { Effect } from "effect"
import type { Database } from "../database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const candidateTables = [
  "learner_response_evidence_disposition",
  "learner_response_evidence_capability_issue",
  "learner_response_evidence_capability_settlement",
] as const

const immutableTables = [
  "learner_response_evidence_revision",
  "learner_response_evidence_commit_seal",
] as const

export const statements = [
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_disposition_validate_insert_v19
   BEFORE INSERT ON learner_response_evidence_disposition
   BEGIN
     SELECT RAISE(ABORT, 'learner_response_evidence_disposition_invalid_v19')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_command_invocation AS invocation
       WHERE invocation.part_id = NEW.invocation_part_id
         AND invocation.command_name = 'update_learner_response_evidence'
         AND invocation.command_version = 1
         AND invocation.capability_identity = 'update_learner_response_evidence'
         AND invocation.capability_version = 1
         AND invocation.authorization_basis = 'agent_action'
         AND invocation.status = 'admitted'
         AND invocation.time_admitted <= NEW.time_disposed
     )
       OR json_extract(NEW.canonical_command, '$.schemaVersion') <> 1
       OR (
         NEW.disposition = 'candidate_v1'
         AND (
           json_extract(NEW.agent_action, '$.schemaVersion') <> 1
           OR json_extract(NEW.agent_action, '$.invocationPartID') IS NOT NEW.invocation_part_id
           OR json_extract(NEW.agent_action, '$.capabilityIdentity') IS NOT 'update_learner_response_evidence'
           OR json_extract(NEW.agent_action, '$.capabilityVersion') <> 1
            OR json_extract(NEW.materialized_candidate, '$.schemaVersion') <> 1
            OR json_extract(NEW.materialized_candidate, '$.effectRecordID') IS NULL
            OR length(json_extract(NEW.materialized_candidate, '$.effectRecordID')) = 0
            OR json_extract(NEW.materialized_candidate, '$.effectVersion') IS NULL
            OR json_extract(NEW.materialized_candidate, '$.effectVersion') < 0
            OR json(json_extract(NEW.materialized_candidate, '$.canonicalCommand')) IS NOT json(NEW.canonical_command)
           OR json_extract(NEW.materialized_candidate, '$.agentAction.invocationPartID') IS NOT NEW.invocation_part_id
            OR json_extract(NEW.materialized_candidate, '$.commandCause.occurrenceID') IS NOT (
              SELECT occurrence_id FROM learning_command_invocation WHERE part_id = NEW.invocation_part_id
            )
            OR (
              json_extract(NEW.canonical_command, '$.operation') = 'create'
              AND json_extract(NEW.materialized_candidate, '$.effectVersion') <> 0
            )
            OR (
              json_extract(NEW.canonical_command, '$.operation') <> 'create'
              AND (
                json_extract(NEW.materialized_candidate, '$.effectRecordID') IS NOT json_extract(NEW.canonical_command, '$.recordID')
                OR json_extract(NEW.materialized_candidate, '$.effectVersion') IS NOT json_extract(NEW.canonical_command, '$.expectedVersion') + 1
              )
            )
         )
       )
       OR (
         NEW.disposition = 'semantic_terminal_v1'
         AND NOT EXISTS (
           SELECT 1
           FROM learner_response_evidence_record AS record
           JOIN learner_response_evidence_revision AS revision ON revision.id = record.current_revision_id
           JOIN learner_response_evidence_commit_seal AS seal ON seal.revision_id = revision.id
           JOIN learning_command_invocation AS applied ON applied.part_id = seal.invocation_part_id
           JOIN learning_command_invocation AS current ON current.part_id = NEW.invocation_part_id
           WHERE record.id = NEW.existing_record_id
             AND revision.id = NEW.existing_revision_id
             AND applied.status = 'applied'
             AND record.subject_occurrence_id = current.occurrence_id
             AND NEW.existing_assessment_fingerprint IS NOT NULL
         )
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_capability_issue_validate_insert_v19
   BEFORE INSERT ON learner_response_evidence_capability_issue
   BEGIN
     SELECT RAISE(ABORT, 'learner_response_evidence_capability_issue_invalid_v19')
     WHERE EXISTS (
       SELECT 1 FROM learner_response_evidence_capability_settlement
       WHERE invocation_part_id = NEW.invocation_part_id
     )
       OR NOT EXISTS (
         SELECT 1
         FROM learner_response_evidence_disposition AS disposition
         JOIN learning_command_invocation AS invocation ON invocation.part_id = disposition.invocation_part_id
         WHERE disposition.invocation_part_id = NEW.invocation_part_id
           AND disposition.disposition = 'candidate_v1'
            AND disposition.agent_action_fingerprint = NEW.agent_action_fingerprint
            AND invocation.status = 'admitted'
            AND invocation.time_admitted <= NEW.time_issued
            AND json(json_extract(NEW.shown_scope, '$.scope.command')) = json(disposition.canonical_command)
            AND json_extract(NEW.shown_scope, '$.scope.subject.occurrenceID') = json_extract(disposition.materialized_candidate, '$.subject.occurrenceID')
            AND json_extract(NEW.shown_scope, '$.scope.subject.sourceOrder') = json_extract(disposition.materialized_candidate, '$.subject.sourceOrder')
            AND json_extract(NEW.shown_scope, '$.scope.subject.sessionID') = json_extract(disposition.materialized_candidate, '$.subject.sessionID')
            AND json_extract(NEW.shown_scope, '$.scope.subject.messageID') = json_extract(disposition.materialized_candidate, '$.subject.messageID')
            AND json_extract(NEW.shown_scope, '$.scope.subject.turnID') = json_extract(disposition.materialized_candidate, '$.subject.turnID')
            AND json_extract(NEW.shown_scope, '$.scope.subject.inputID') = json_extract(disposition.materialized_candidate, '$.subject.inputID')
            AND json_extract(NEW.shown_scope, '$.scope.subject.timeAdmitted') = json_extract(disposition.materialized_candidate, '$.subject.timeAdmitted')
            AND json_extract(NEW.shown_scope, '$.scope.target.mapID') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.mapID'),
              json_extract(disposition.materialized_candidate, '$.current.target.mapID')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.selectorID') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.selectorID'),
              json_extract(disposition.materialized_candidate, '$.current.target.selectorID')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.courseID') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.courseID'),
              json_extract(disposition.materialized_candidate, '$.current.target.courseID')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.viewID') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.viewID'),
              json_extract(disposition.materialized_candidate, '$.current.target.viewID')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.revisionID') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.revisionID'),
              json_extract(disposition.materialized_candidate, '$.current.target.revisionID')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.itemID') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.itemID'),
              json_extract(disposition.materialized_candidate, '$.current.target.itemID')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.alignmentID') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.alignmentID'),
              json_extract(disposition.materialized_candidate, '$.current.target.alignmentID')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.alignmentDispositionVersion') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.alignmentDispositionVersion'),
              json_extract(disposition.materialized_candidate, '$.current.target.alignmentDispositionVersion')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.mapDispositionVersion') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.mapDispositionVersion'),
              json_extract(disposition.materialized_candidate, '$.current.target.mapDispositionVersion')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.courseVersion') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.courseVersion'),
              json_extract(disposition.materialized_candidate, '$.current.target.courseVersion')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.viewVersion') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.viewVersion'),
              json_extract(disposition.materialized_candidate, '$.current.target.viewVersion')
            )
            AND json_extract(NEW.shown_scope, '$.scope.target.revisionVersion') = COALESCE(
              json_extract(disposition.materialized_candidate, '$.target.revisionVersion'),
              json_extract(disposition.materialized_candidate, '$.current.target.revisionVersion')
            )
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_capability_settlement_validate_insert_v19
   BEFORE INSERT ON learner_response_evidence_capability_settlement
   BEGIN
     SELECT RAISE(ABORT, 'learner_response_evidence_capability_settlement_invalid_v19')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_response_evidence_disposition AS disposition
       JOIN learning_command_invocation AS invocation ON invocation.part_id = disposition.invocation_part_id
       WHERE disposition.invocation_part_id = NEW.invocation_part_id
         AND disposition.disposition = 'candidate_v1'
         AND disposition.agent_action_fingerprint = NEW.agent_action_fingerprint
         AND invocation.status = 'admitted'
         AND invocation.time_admitted <= NEW.time_settled
     )
       OR (
         NEW.outcome IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel', 'prompted_abort')
         AND NOT EXISTS (
           SELECT 1 FROM learner_response_evidence_capability_issue AS issue
           WHERE issue.invocation_part_id = NEW.invocation_part_id
             AND issue.permission_request_id = NEW.permission_request_id
             AND issue.agent_action_fingerprint = NEW.agent_action_fingerprint
             AND issue.time_issued <= NEW.time_settled
             AND issue.issue_order <= NEW.settlement_order
         )
       )
       OR (
         NEW.outcome IN ('not_evaluated', 'policy_allow', 'policy_deny')
         AND EXISTS (
           SELECT 1 FROM learner_response_evidence_capability_issue
           WHERE invocation_part_id = NEW.invocation_part_id
         )
       );
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_model_source_retention_validate_insert_v19
   BEFORE INSERT ON turn_model_source_retention
   WHEN NEW.owner = 'learner_response_evidence'
   BEGIN
     SELECT RAISE(ABORT, 'learner_response_evidence_model_source_retention_invalid_v19')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_response_evidence_disposition AS disposition
       JOIN learner_response_evidence_capability_settlement AS capability
         ON capability.invocation_part_id = disposition.invocation_part_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = disposition.invocation_part_id
       JOIN learning_command_receipt AS receipt ON receipt.invocation_part_id = invocation.part_id
       WHERE disposition.disposition = 'candidate_v1'
         AND json_extract(disposition.canonical_command, '$.operation') = 'create'
         AND capability.outcome IN ('policy_allow', 'prompted_allow')
         AND capability.agent_action_fingerprint = disposition.agent_action_fingerprint
         AND invocation.status = 'admitted'
         AND json_extract(disposition.materialized_candidate, '$.effectRecordID') = NEW.owner_reference_id
         AND json_extract(disposition.materialized_candidate, '$.effectVersion') = 0
         AND json_extract(disposition.materialized_candidate, '$.condition.turnID') = NEW.source_turn_id
         AND json_extract(disposition.materialized_candidate, '$.condition.assistantMessageID') = NEW.source_assistant_message_id
         AND json_extract(disposition.materialized_candidate, '$.condition.timeSettled') = NEW.source_time_settled
         AND receipt.time_committed = NEW.time_registered
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_record_validate_insert_v19
   BEFORE INSERT ON learner_response_evidence_record
   BEGIN
     SELECT RAISE(ABORT, 'learner_response_evidence_record_invalid_v19')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_response_evidence_disposition AS disposition
       JOIN learner_response_evidence_capability_settlement AS capability
         ON capability.invocation_part_id = disposition.invocation_part_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = disposition.invocation_part_id
       JOIN learning_command_receipt AS receipt ON receipt.invocation_part_id = invocation.part_id
       WHERE disposition.disposition = 'candidate_v1'
         AND json_extract(disposition.canonical_command, '$.operation') = 'create'
         AND capability.outcome IN ('policy_allow', 'prompted_allow')
          AND capability.agent_action_fingerprint = disposition.agent_action_fingerprint
          AND invocation.status = 'admitted'
          AND receipt.occurrence_id = NEW.subject_occurrence_id
          AND json_extract(disposition.materialized_candidate, '$.effectRecordID') = NEW.id
          AND json_extract(disposition.materialized_candidate, '$.effectVersion') = 0
          AND json_extract(disposition.materialized_candidate, '$.subject.occurrenceID') = NEW.subject_occurrence_id
          AND json_extract(disposition.materialized_candidate, '$.subject.sourceOrder') = NEW.subject_source_order
          AND json_extract(disposition.materialized_candidate, '$.subject.sessionID') = NEW.subject_session_id
          AND json_extract(disposition.materialized_candidate, '$.subject.messageID') = NEW.subject_message_id
          AND json_extract(disposition.materialized_candidate, '$.subject.turnID') = NEW.subject_turn_id
          AND json_extract(disposition.materialized_candidate, '$.subject.inputID') = NEW.subject_input_id
          AND json_extract(disposition.materialized_candidate, '$.subject.timeAdmitted') = NEW.subject_time_admitted
          AND json_extract(disposition.materialized_candidate, '$.target.mapID') = NEW.map_id
          AND json_extract(disposition.materialized_candidate, '$.target.selectorID') = NEW.selector_id
         AND json_extract(disposition.materialized_candidate, '$.target.courseID') = NEW.course_id
         AND json_extract(disposition.materialized_candidate, '$.target.viewID') = NEW.view_id
         AND json_extract(disposition.materialized_candidate, '$.target.revisionID') = NEW.course_revision_id
          AND json_extract(disposition.materialized_candidate, '$.target.itemID') = NEW.course_item_id
          AND json_extract(disposition.materialized_candidate, '$.target.alignmentID') = NEW.admission_alignment_id
          AND json_extract(disposition.materialized_candidate, '$.target.alignmentDispositionVersion') = NEW.alignment_disposition_version
          AND json_extract(disposition.materialized_candidate, '$.target.mapDispositionVersion') = NEW.map_disposition_version
          AND json_extract(disposition.materialized_candidate, '$.target.courseVersion') = NEW.course_version
          AND json_extract(disposition.materialized_candidate, '$.target.viewVersion') = NEW.view_version
          AND json_extract(disposition.materialized_candidate, '$.target.revisionVersion') = NEW.course_revision_version
          AND json_extract(disposition.materialized_candidate, '$.condition.sessionID') = NEW.condition_session_id
          AND json_extract(disposition.materialized_candidate, '$.condition.turnID') = NEW.condition_turn_id
          AND json_extract(disposition.materialized_candidate, '$.condition.assistantMessageID') = NEW.condition_assistant_message_id
          AND json_extract(disposition.materialized_candidate, '$.condition.timeSettled') = NEW.condition_time_settled
          AND json_extract(disposition.canonical_command, '$.conditionAssistantMessageID') = NEW.condition_assistant_message_id
          AND json_extract(disposition.canonical_command, '$.target.mapID') = NEW.map_id
          AND json_extract(disposition.canonical_command, '$.target.selectorID') = NEW.selector_id
          AND json_extract(disposition.canonical_command, '$.target.courseID') = NEW.course_id
          AND json_extract(disposition.canonical_command, '$.target.viewID') = NEW.view_id
          AND json_extract(disposition.canonical_command, '$.target.revisionID') = NEW.course_revision_id
          AND json_extract(disposition.canonical_command, '$.target.itemID') = NEW.course_item_id
          AND json_extract(disposition.canonical_command, '$.alignmentID') = NEW.admission_alignment_id
          AND receipt.time_committed = NEW.time_created
      )
       OR NOT EXISTS (
         SELECT 1 FROM material_course_alignment AS alignment
         WHERE alignment.id = NEW.admission_alignment_id
           AND alignment.map_id = NEW.map_id
           AND alignment.selector_id = NEW.selector_id
           AND alignment.course_id = NEW.course_id
           AND alignment.view_id = NEW.view_id
           AND alignment.revision_id = NEW.course_revision_id
            AND alignment.item_id = NEW.course_item_id
        )
         OR NOT EXISTS (
           SELECT 1 FROM turn_model_source_retention AS retention
           WHERE retention.owner = 'learner_response_evidence'
             AND retention.owner_reference_id = NEW.id
             AND retention.source_turn_id = NEW.condition_turn_id
             AND retention.source_assistant_message_id = NEW.condition_assistant_message_id
             AND retention.source_time_settled = NEW.condition_time_settled
             AND retention.time_registered = NEW.time_created
        )
        OR NOT EXISTS (
          SELECT 1
          FROM turn_model_operation AS condition_operation
          JOIN learning_admitted_occurrence AS condition_cause
            ON condition_cause.id = condition_operation.causal_occurrence_id
          WHERE condition_operation.assistant_message_id = NEW.condition_assistant_message_id
            AND condition_operation.session_id = NEW.condition_session_id
            AND condition_operation.turn_id = NEW.condition_turn_id
            AND condition_operation.state = 'completed'
            AND condition_operation.time_settled = NEW.condition_time_settled
            AND condition_cause.source_order IS NOT NULL
            AND condition_cause.source_order < NEW.subject_source_order
         );
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_revision_validate_insert_v19
   BEFORE INSERT ON learner_response_evidence_revision
   BEGIN
     SELECT RAISE(ABORT, 'learner_response_evidence_revision_invalid_v19')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_response_evidence_disposition AS disposition
       JOIN learner_response_evidence_capability_settlement AS capability
         ON capability.invocation_part_id = disposition.invocation_part_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = disposition.invocation_part_id
       JOIN learning_command_receipt AS receipt ON receipt.invocation_part_id = invocation.part_id
       JOIN learning_shared_frontier AS frontier ON frontier.singleton = 1
       WHERE disposition.invocation_part_id = NEW.invocation_part_id
         AND disposition.disposition = 'candidate_v1'
         AND json_extract(disposition.canonical_command, '$.operation') = NEW.operation
         AND capability.outcome IN ('policy_allow', 'prompted_allow')
         AND capability.agent_action_fingerprint = disposition.agent_action_fingerprint
         AND invocation.status = 'admitted'
         AND invocation.occurrence_id = NEW.command_cause_occurrence_id
         AND receipt.occurrence_id = NEW.command_cause_occurrence_id
         AND receipt.time_committed = NEW.time_committed
         AND receipt.commit_order = NEW.commit_order
          AND frontier.sequence = NEW.frontier_sequence
          AND frontier.time_committed = NEW.frontier_time
          AND json_extract(disposition.materialized_candidate, '$.effectRecordID') = NEW.record_id
          AND json_extract(disposition.materialized_candidate, '$.effectVersion') = NEW.version
          AND json_extract(disposition.materialized_candidate, '$.programBasis') = NEW.basis
          AND json_extract(disposition.materialized_candidate, '$.programDisposition') = NEW.disposition
          AND json_extract(disposition.materialized_candidate, '$.commandCause.occurrenceID') = NEW.command_cause_occurrence_id
          AND json_extract(disposition.materialized_candidate, '$.commandCause.sourceOrder') = NEW.command_cause_source_order
          AND json_extract(disposition.materialized_candidate, '$.commandCause.sessionID') = NEW.command_cause_session_id
          AND json_extract(disposition.materialized_candidate, '$.commandCause.messageID') = NEW.command_cause_message_id
          AND json_extract(disposition.materialized_candidate, '$.commandCause.turnID') = NEW.command_cause_turn_id
          AND json_extract(disposition.materialized_candidate, '$.commandCause.inputID') = NEW.command_cause_input_id
          AND json_extract(disposition.materialized_candidate, '$.commandCause.timeAdmitted') = NEW.command_cause_time_admitted
          AND (
            NEW.operation = 'retract'
            OR (
              json_extract(disposition.canonical_command, '$.relation') = NEW.relation
              AND json_extract(disposition.canonical_command, '$.exposure') = NEW.exposure
            )
          )
          AND (
            NEW.operation = 'create'
            OR (
              json_extract(disposition.canonical_command, '$.recordID') = NEW.record_id
              AND json_extract(disposition.canonical_command, '$.expectedVersion') + 1 = NEW.version
            )
          )
      )
        OR (
          NEW.operation <> 'create'
          AND NOT EXISTS (
            SELECT 1
            FROM learner_response_evidence_record AS record
            JOIN learner_response_evidence_revision AS prior ON prior.id = record.current_revision_id
            JOIN learner_response_evidence_disposition AS disposition
              ON disposition.invocation_part_id = NEW.invocation_part_id
            WHERE record.id = NEW.record_id
              AND record.current_revision_id = NEW.predecessor_revision_id
              AND record.current_version + 1 = NEW.version
              AND json_extract(disposition.materialized_candidate, '$.current.recordID') = record.id
              AND json_extract(disposition.materialized_candidate, '$.current.currentRevisionID') = record.current_revision_id
              AND json_extract(disposition.materialized_candidate, '$.current.currentVersion') = record.current_version
              AND json_extract(disposition.materialized_candidate, '$.current.relation') = prior.relation
              AND json_extract(disposition.materialized_candidate, '$.current.exposure') = prior.exposure
              AND json_extract(disposition.materialized_candidate, '$.current.basis') = prior.basis
              AND json_extract(disposition.materialized_candidate, '$.current.disposition') = prior.disposition
              AND json_extract(disposition.materialized_candidate, '$.current.subject.occurrenceID') = record.subject_occurrence_id
              AND json_extract(disposition.materialized_candidate, '$.current.subject.sourceOrder') = record.subject_source_order
              AND json_extract(disposition.materialized_candidate, '$.current.subject.sessionID') = record.subject_session_id
              AND json_extract(disposition.materialized_candidate, '$.current.subject.messageID') = record.subject_message_id
              AND json_extract(disposition.materialized_candidate, '$.current.subject.turnID') = record.subject_turn_id
              AND json_extract(disposition.materialized_candidate, '$.current.subject.inputID') = record.subject_input_id
              AND json_extract(disposition.materialized_candidate, '$.current.subject.timeAdmitted') = record.subject_time_admitted
              AND json_extract(disposition.materialized_candidate, '$.current.condition.sessionID') = record.condition_session_id
              AND json_extract(disposition.materialized_candidate, '$.current.condition.turnID') = record.condition_turn_id
              AND json_extract(disposition.materialized_candidate, '$.current.condition.assistantMessageID') = record.condition_assistant_message_id
              AND json_extract(disposition.materialized_candidate, '$.current.condition.timeSettled') = record.condition_time_settled
              AND json_extract(disposition.materialized_candidate, '$.current.target.mapID') = record.map_id
              AND json_extract(disposition.materialized_candidate, '$.current.target.selectorID') = record.selector_id
              AND json_extract(disposition.materialized_candidate, '$.current.target.courseID') = record.course_id
              AND json_extract(disposition.materialized_candidate, '$.current.target.viewID') = record.view_id
              AND json_extract(disposition.materialized_candidate, '$.current.target.revisionID') = record.course_revision_id
              AND json_extract(disposition.materialized_candidate, '$.current.target.itemID') = record.course_item_id
              AND json_extract(disposition.materialized_candidate, '$.current.target.alignmentID') = record.admission_alignment_id
              AND json_extract(disposition.materialized_candidate, '$.current.target.alignmentDispositionVersion') = record.alignment_disposition_version
              AND json_extract(disposition.materialized_candidate, '$.current.target.mapDispositionVersion') = record.map_disposition_version
              AND json_extract(disposition.materialized_candidate, '$.current.target.courseVersion') = record.course_version
              AND json_extract(disposition.materialized_candidate, '$.current.target.viewVersion') = record.view_version
              AND json_extract(disposition.materialized_candidate, '$.current.target.revisionVersion') = record.course_revision_version
              AND json_extract(disposition.materialized_candidate, '$.current.basisSource.occurrenceID') = prior.basis_occurrence_id
              AND json_extract(disposition.materialized_candidate, '$.current.basisSource.sourceOrder') = prior.basis_source_order
              AND json_extract(disposition.materialized_candidate, '$.current.basisSource.sessionID') = prior.basis_session_id
              AND json_extract(disposition.materialized_candidate, '$.current.basisSource.messageID') = prior.basis_message_id
              AND json_extract(disposition.materialized_candidate, '$.current.basisSource.turnID') = prior.basis_turn_id
              AND json_extract(disposition.materialized_candidate, '$.current.basisSource.inputID') = prior.basis_input_id
              AND json_extract(disposition.materialized_candidate, '$.current.basisSource.timeAdmitted') = prior.basis_time_admitted
          )
        )
        OR (
          NEW.operation = 'create'
          AND (NEW.version <> 0 OR NEW.predecessor_revision_id IS NOT NULL
            OR NEW.basis <> 'tutor_interpretation' OR NEW.disposition <> 'active'
            OR NOT EXISTS (
            SELECT 1 FROM learner_response_evidence_record AS record
           WHERE record.id = NEW.record_id
             AND record.current_revision_id = NEW.id
             AND record.current_version = 0
             AND record.subject_occurrence_id = NEW.basis_occurrence_id
             AND record.subject_source_order = NEW.basis_source_order
             AND record.subject_session_id = NEW.basis_session_id
             AND record.subject_message_id = NEW.basis_message_id
             AND record.subject_turn_id = NEW.basis_turn_id
              AND record.subject_input_id = NEW.basis_input_id
              AND record.subject_time_admitted = NEW.basis_time_admitted
            ))
        )
        OR (
          NEW.operation = 'revise_from_tutor_interpretation'
          AND (NEW.basis <> 'tutor_interpretation' OR NEW.disposition <> 'active' OR NOT EXISTS (
           SELECT 1 FROM learner_response_evidence_record AS record
           WHERE record.id = NEW.record_id
             AND record.current_revision_id = NEW.predecessor_revision_id
             AND record.current_version + 1 = NEW.version
             AND record.subject_occurrence_id = NEW.basis_occurrence_id
             AND record.subject_source_order = NEW.basis_source_order
             AND record.subject_session_id = NEW.basis_session_id
             AND record.subject_message_id = NEW.basis_message_id
             AND record.subject_turn_id = NEW.basis_turn_id
              AND record.subject_input_id = NEW.basis_input_id
              AND record.subject_time_admitted = NEW.basis_time_admitted
          ))
        )
        OR (
          NEW.operation = 'revise_from_learner_report'
          AND (NEW.basis <> 'learner_report' OR NEW.disposition <> 'active'
            OR NEW.basis_occurrence_id <> NEW.command_cause_occurrence_id
           OR NEW.basis_source_order <> NEW.command_cause_source_order
           OR NEW.basis_session_id <> NEW.command_cause_session_id
           OR NEW.basis_message_id <> NEW.command_cause_message_id
           OR NEW.basis_turn_id <> NEW.command_cause_turn_id
           OR NEW.basis_input_id <> NEW.command_cause_input_id
           OR NEW.basis_time_admitted <> NEW.command_cause_time_admitted
           OR NOT EXISTS (
             SELECT 1 FROM learner_response_evidence_record AS record
             WHERE record.id = NEW.record_id
               AND record.current_revision_id = NEW.predecessor_revision_id
               AND record.current_version + 1 = NEW.version
               AND record.subject_occurrence_id <> NEW.basis_occurrence_id
           ))
       )
        OR (
          NEW.operation = 'retract'
          AND (NEW.disposition <> 'retracted' OR NOT EXISTS (
           SELECT 1
           FROM learner_response_evidence_record AS record
           JOIN learner_response_evidence_revision AS prior ON prior.id = record.current_revision_id
           WHERE record.id = NEW.record_id
             AND record.current_revision_id = NEW.predecessor_revision_id
             AND record.current_version + 1 = NEW.version
             AND NEW.relation = prior.relation
             AND NEW.exposure = prior.exposure
             AND NEW.basis = prior.basis
             AND NEW.basis_occurrence_id = prior.basis_occurrence_id
             AND NEW.basis_source_order = prior.basis_source_order
             AND NEW.basis_session_id = prior.basis_session_id
             AND NEW.basis_message_id = prior.basis_message_id
             AND NEW.basis_turn_id = prior.basis_turn_id
              AND NEW.basis_input_id = prior.basis_input_id
              AND NEW.basis_time_admitted = prior.basis_time_admitted
          ))
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_record_validate_head_update_v19
   BEFORE UPDATE ON learner_response_evidence_record
   BEGIN
     SELECT RAISE(ABORT, 'learner_response_evidence_record_update_invalid_v19')
     WHERE NEW.id <> OLD.id
       OR NEW.subject_occurrence_id <> OLD.subject_occurrence_id
       OR NEW.subject_source_order <> OLD.subject_source_order
       OR NEW.subject_session_id <> OLD.subject_session_id
       OR NEW.subject_message_id <> OLD.subject_message_id
       OR NEW.subject_turn_id <> OLD.subject_turn_id
       OR NEW.subject_input_id <> OLD.subject_input_id
       OR NEW.subject_time_admitted <> OLD.subject_time_admitted
       OR NEW.map_id <> OLD.map_id OR NEW.selector_id <> OLD.selector_id
       OR NEW.course_id <> OLD.course_id OR NEW.view_id <> OLD.view_id
       OR NEW.course_revision_id <> OLD.course_revision_id OR NEW.course_item_id <> OLD.course_item_id
       OR NEW.admission_alignment_id <> OLD.admission_alignment_id
       OR NEW.alignment_disposition_version <> OLD.alignment_disposition_version
       OR NEW.map_disposition_version <> OLD.map_disposition_version
       OR NEW.course_version <> OLD.course_version OR NEW.view_version <> OLD.view_version
       OR NEW.course_revision_version <> OLD.course_revision_version
       OR NEW.condition_session_id <> OLD.condition_session_id
       OR NEW.condition_turn_id <> OLD.condition_turn_id
       OR NEW.condition_assistant_message_id <> OLD.condition_assistant_message_id
       OR NEW.condition_time_settled <> OLD.condition_time_settled
       OR NEW.time_created <> OLD.time_created
       OR NEW.current_version <> OLD.current_version + 1
       OR NOT EXISTS (
         SELECT 1 FROM learner_response_evidence_revision AS revision
         WHERE revision.id = NEW.current_revision_id
           AND revision.record_id = OLD.id
           AND revision.version = NEW.current_version
           AND revision.predecessor_revision_id = OLD.current_revision_id
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_commit_seal_validate_insert_v19
   BEFORE INSERT ON learner_response_evidence_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_response_evidence_commit_seal_invalid_v19')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_response_evidence_revision AS revision
       JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE revision.id = NEW.revision_id
         AND revision.commit_seal_id = NEW.revision_id
         AND revision.invocation_part_id = NEW.invocation_part_id
         AND receipt.invocation_part_id = NEW.invocation_part_id
         AND receipt.occurrence_id = revision.command_cause_occurrence_id
         AND receipt.time_committed = revision.time_committed
         AND receipt.commit_order = revision.commit_order
         AND invocation.status = 'admitted'
         AND invocation.command_name = 'update_learner_response_evidence'
         AND invocation.command_version = 1
         AND invocation.capability_identity = receipt.capability_identity
         AND invocation.capability_version = receipt.capability_version
         AND invocation.authorization_basis = receipt.authorization_basis
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_learning_command_terminal_validate_v19
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted' AND OLD.command_name = 'update_learner_response_evidence'
   BEGIN
     SELECT RAISE(ABORT, 'learner_response_evidence_learning_command_terminal_invalid_v19')
     WHERE OLD.command_version <> 1
       OR OLD.capability_identity <> 'update_learner_response_evidence'
       OR OLD.capability_version <> 1
       OR OLD.authorization_basis <> 'agent_action'
       OR json_extract(NEW.settlement, '$.outcome') IS NOT NEW.status
       OR json_extract(NEW.settlement, '$.settlementTime') IS NOT NEW.time_settled
       OR json_extract(NEW.settlement, '$.settlementOrder') IS NOT NEW.settlement_order
       OR NOT COALESCE((
         (
           NEW.status IN ('applied', 'already_applied')
           AND json_extract(NEW.settlement, '$.evidenceKind') = 'learner_response_evidence'
           AND json_extract(NEW.settlement, '$.schemaVersion') = 1
           AND json_extract(NEW.settlement, '$.receiptID') = NEW.receipt_id
           AND EXISTS (
              SELECT 1
              FROM learner_response_evidence_revision AS revision
              JOIN learner_response_evidence_record AS record ON record.id = revision.record_id
              JOIN learner_response_evidence_commit_seal AS seal ON seal.revision_id = revision.id
             JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
             WHERE revision.id = json_extract(NEW.settlement, '$.revisionID')
               AND revision.id = json_extract(NEW.settlement, '$.effectID')
                AND revision.record_id = json_extract(NEW.settlement, '$.recordID')
                AND revision.version = json_extract(NEW.settlement, '$.version')
                AND record.subject_occurrence_id = json_extract(NEW.settlement, '$.subject.occurrenceID')
                AND record.subject_source_order = json_extract(NEW.settlement, '$.subject.sourceOrder')
                AND record.subject_session_id = json_extract(NEW.settlement, '$.subject.sessionID')
                AND record.subject_message_id = json_extract(NEW.settlement, '$.subject.messageID')
                AND record.subject_turn_id = json_extract(NEW.settlement, '$.subject.turnID')
                AND record.subject_input_id = json_extract(NEW.settlement, '$.subject.inputID')
                AND record.subject_time_admitted = json_extract(NEW.settlement, '$.subject.timeAdmitted')
                AND record.map_id = json_extract(NEW.settlement, '$.target.mapID')
                AND record.selector_id = json_extract(NEW.settlement, '$.target.selectorID')
                AND record.course_id = json_extract(NEW.settlement, '$.target.courseID')
                AND record.view_id = json_extract(NEW.settlement, '$.target.viewID')
                AND record.course_revision_id = json_extract(NEW.settlement, '$.target.revisionID')
                AND record.course_item_id = json_extract(NEW.settlement, '$.target.itemID')
                AND record.admission_alignment_id = json_extract(NEW.settlement, '$.target.alignmentID')
                AND record.alignment_disposition_version = json_extract(NEW.settlement, '$.target.alignmentDispositionVersion')
                AND record.map_disposition_version = json_extract(NEW.settlement, '$.target.mapDispositionVersion')
                AND record.course_version = json_extract(NEW.settlement, '$.target.courseVersion')
                AND record.view_version = json_extract(NEW.settlement, '$.target.viewVersion')
                AND record.course_revision_version = json_extract(NEW.settlement, '$.target.revisionVersion')
                AND revision.operation = json_extract(NEW.settlement, '$.operation')
               AND revision.relation = json_extract(NEW.settlement, '$.relation')
               AND revision.exposure = json_extract(NEW.settlement, '$.exposure')
               AND revision.basis = json_extract(NEW.settlement, '$.basis')
               AND revision.disposition = json_extract(NEW.settlement, '$.disposition')
               AND revision.frontier_sequence = json_extract(NEW.settlement, '$.frontierSequence')
               AND receipt.id = NEW.receipt_id
               AND receipt.occurrence_id = OLD.occurrence_id
               AND (NEW.status = 'already_applied' OR seal.invocation_part_id = OLD.part_id)
               AND (NEW.status = 'already_applied' OR (
                 revision.invocation_part_id = OLD.part_id
                 AND revision.time_committed = NEW.time_settled
                 AND revision.commit_order = NEW.settlement_order
               ))
           )
         )
         OR (
           NEW.status = 'error'
           AND NEW.receipt_id IS NULL
           AND json_extract(NEW.settlement, '$.code') IN (
             'semantic_conflict', 'context_refresh_required', 'permission_rejected',
             'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
             'capacity_exceeded', 'stale', 'validation_error'
           )
           AND NOT EXISTS (
             SELECT 1 FROM learner_response_evidence_revision
             WHERE invocation_part_id = OLD.part_id
           )
         )
       ), 0);
   END`,
  ...candidateTables.map(
    (table) =>
      `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_v19 BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable_v19'); END`,
  ),
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_disposition_delete_forbidden_v19
   BEFORE DELETE ON learner_response_evidence_disposition
   WHEN EXISTS (SELECT 1 FROM learning_command_invocation WHERE part_id = OLD.invocation_part_id)
    BEGIN SELECT RAISE(ABORT, 'learner_response_evidence_disposition_delete_forbidden_v19'); END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_model_source_retention_immutable_v19
   BEFORE UPDATE ON turn_model_source_retention
   WHEN OLD.owner = 'learner_response_evidence' OR NEW.owner = 'learner_response_evidence'
   BEGIN SELECT RAISE(ABORT, 'learner_response_evidence_model_source_retention_immutable_v19'); END`,
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_model_source_retention_delete_forbidden_v19
   BEFORE DELETE ON turn_model_source_retention
   WHEN OLD.owner = 'learner_response_evidence'
   BEGIN SELECT RAISE(ABORT, 'learner_response_evidence_model_source_retention_delete_forbidden_v19'); END`,
  ...["learner_response_evidence_capability_issue", "learner_response_evidence_capability_settlement"].map(
    (table) =>
      `CREATE TRIGGER IF NOT EXISTS ${table}_delete_forbidden_v19 BEFORE DELETE ON ${table}
       WHEN EXISTS (SELECT 1 FROM learner_response_evidence_disposition WHERE invocation_part_id = OLD.invocation_part_id)
       BEGIN SELECT RAISE(ABORT, '${table}_delete_forbidden_v19'); END`,
  ),
  ...immutableTables.flatMap((table) => [
    `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_v19 BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable_v19'); END`,
    `CREATE TRIGGER IF NOT EXISTS ${table}_delete_forbidden_v19 BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_delete_forbidden_v19'); END`,
  ]),
  `CREATE TRIGGER IF NOT EXISTS learner_response_evidence_record_delete_forbidden_v19
   BEFORE DELETE ON learner_response_evidence_record
   BEGIN SELECT RAISE(ABORT, 'learner_response_evidence_record_delete_forbidden_v19'); END`,
] as const

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
