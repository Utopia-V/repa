export * as LearnerNavigationConstraintSchema from "./constraint-schema-v3"

import { Effect } from "effect"
import type { Database } from "../database/database"
import {
  authorityStatements as authorityStatementsV13,
  defaultCourseTransitionStatement as defaultCourseTransitionStatementV13,
} from "./constraint-schema-v2"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

function requireStatement(name: string) {
  const statement = authorityStatementsV13.find((candidate) => triggerName(candidate) === name)
  if (!statement) throw new Error(`The frozen V13 learner-navigation trigger ${name} is missing`)
  return statement
}

function scopeHistorical(statement: string, name: string, when: string) {
  const renamed = statement.replace(/CREATE TRIGGER IF NOT EXISTS [^\s]+/i, `CREATE TRIGGER IF NOT EXISTS ${name}`)
  return renamed.replace(
    /\n(\s*)BEGIN/,
    (_match, indentation: string) => `\n${indentation}WHEN ${when}\n${indentation}BEGIN`,
  )
}

const historicalTransitionStatement = scopeHistorical(
  defaultCourseTransitionStatementV13,
  "learner_default_course_validate_insert_v14_history",
  "NEW.authorization_part_id IS NOT NULL",
)

const historicalDispositionStatement = scopeHistorical(
  requireStatement("learner_default_course_disposition_validate_insert_v13"),
  "learner_default_course_disposition_validate_insert_v14_history",
  "NEW.disposition IN ('legacy_v1', 'semantic_terminal_v2', 'candidate_v2')",
)

const historicalCapabilityIssueStatement = scopeHistorical(
  requireStatement("learner_default_course_capability_issue_validate_insert_v13"),
  "learner_default_course_capability_issue_validate_insert_v14_history",
  "NEW.authorization_fingerprint IS NOT NULL",
)

const historicalCapabilitySettlementStatement = scopeHistorical(
  requireStatement("learner_default_course_capability_settlement_validate_insert_v13"),
  "learner_default_course_capability_settlement_validate_insert_v14_history",
  "NEW.authorization_fingerprint IS NOT NULL",
)

const historicalAcknowledgementStatement = scopeHistorical(
  requireStatement("learner_default_course_acknowledgement_validate_insert_v13").replace(
    "invocation_disposition.disposition = 'semantic_terminal_v2'",
    "invocation_disposition.disposition IN ('semantic_terminal_v2', 'semantic_terminal_v3')",
  ),
  "learner_default_course_acknowledgement_validate_insert_v14_history",
  "NEW.authorization_version IS NOT NULL",
)

const historicalCommitSealStatement = scopeHistorical(
  requireStatement("learner_default_course_commit_seal_validate_insert_v13"),
  "learner_default_course_commit_seal_validate_insert_v14_history",
  `EXISTS (
     SELECT 1 FROM learner_default_course_transition AS effect
     WHERE effect.id = NEW.effect_id AND effect.authorization_part_id IS NOT NULL
   )`,
)

export const proposalRetirementStatement = `CREATE TRIGGER IF NOT EXISTS learner_default_course_proposal_validate_insert_v14
 BEFORE INSERT ON learner_default_course_proposal
 BEGIN
   SELECT RAISE(ABORT, 'learner_default_course_proposal_retired');
 END`

const agentActionProvenanceShape = `(
  json_valid(NEW.agent_action_provenance)
  AND json_type(NEW.agent_action_provenance) = 'object'
  AND json_type(NEW.agent_action_provenance, '$.schemaVersion') = 'integer'
  AND json_extract(NEW.agent_action_provenance, '$.schemaVersion') = 1
  AND json_type(NEW.agent_action_provenance, '$.occurrenceID') = 'text'
  AND length(json_extract(NEW.agent_action_provenance, '$.occurrenceID')) > 0
  AND json_type(NEW.agent_action_provenance, '$.causalRootOccurrenceID') = 'text'
  AND json_extract(NEW.agent_action_provenance, '$.causalRootOccurrenceID') =
        json_extract(NEW.agent_action_provenance, '$.occurrenceID')
  AND json_type(NEW.agent_action_provenance, '$.sessionID') = 'text'
  AND length(json_extract(NEW.agent_action_provenance, '$.sessionID')) > 0
  AND json_type(NEW.agent_action_provenance, '$.turnID') = 'text'
  AND length(json_extract(NEW.agent_action_provenance, '$.turnID')) > 0
  AND json_type(NEW.agent_action_provenance, '$.inputID') = 'text'
  AND length(json_extract(NEW.agent_action_provenance, '$.inputID')) > 0
  AND json_type(NEW.agent_action_provenance, '$.assistantMessageID') = 'text'
  AND length(json_extract(NEW.agent_action_provenance, '$.assistantMessageID')) > 0
  AND json_type(NEW.agent_action_provenance, '$.invocationPartID') = 'text'
  AND length(json_extract(NEW.agent_action_provenance, '$.invocationPartID')) > 0
  AND json_type(NEW.agent_action_provenance, '$.providerCallID') = 'text'
  AND length(json_extract(NEW.agent_action_provenance, '$.providerCallID')) > 0
  AND json_type(NEW.agent_action_provenance, '$.emissionOrdinal') = 'integer'
  AND json_extract(NEW.agent_action_provenance, '$.emissionOrdinal') >= 0
  AND json_extract(NEW.agent_action_provenance, '$.capabilityIdentity') =
        'set_default_course_preference'
  AND json_type(NEW.agent_action_provenance, '$.capabilityVersion') = 'integer'
  AND json_extract(NEW.agent_action_provenance, '$.capabilityVersion') = 3
  AND (
    (
      json_extract(NEW.agent_action_provenance, '$.kind') = 'root'
      AND json_type(NEW.agent_action_provenance, '$.lineage') = 'array'
      AND json_array_length(NEW.agent_action_provenance, '$.lineage') = 0
      AND json_remove(
        NEW.agent_action_provenance,
        '$.schemaVersion',
        '$.kind',
        '$.occurrenceID',
        '$.causalRootOccurrenceID',
        '$.sessionID',
        '$.turnID',
        '$.inputID',
        '$.assistantMessageID',
        '$.invocationPartID',
        '$.providerCallID',
        '$.emissionOrdinal',
        '$.capabilityIdentity',
        '$.capabilityVersion',
        '$.lineage'
      ) = '{}'
    )
    OR (
      json_extract(NEW.agent_action_provenance, '$.kind') = 'delegated'
      AND json_type(NEW.agent_action_provenance, '$.lineage') = 'array'
      AND json_array_length(NEW.agent_action_provenance, '$.lineage') > 0
      AND json_type(NEW.agent_action_provenance, '$.effectiveDelegatedCapability') = 'object'
      AND json_remove(
        NEW.agent_action_provenance,
        '$.schemaVersion',
        '$.kind',
        '$.occurrenceID',
        '$.causalRootOccurrenceID',
        '$.sessionID',
        '$.turnID',
        '$.inputID',
        '$.assistantMessageID',
        '$.invocationPartID',
        '$.providerCallID',
        '$.emissionOrdinal',
        '$.capabilityIdentity',
        '$.capabilityVersion',
        '$.lineage',
        '$.effectiveDelegatedCapability'
      ) = '{}'
      AND json_remove(
        json_extract(NEW.agent_action_provenance, '$.effectiveDelegatedCapability'),
        '$.identity',
        '$.version',
        '$.projectionVersion',
        '$.fingerprint'
      ) = '{}'
      AND json_extract(
        NEW.agent_action_provenance,
        '$.effectiveDelegatedCapability.identity'
      ) = 'set_default_course_preference'
      AND json_extract(NEW.agent_action_provenance, '$.effectiveDelegatedCapability.version') = 3
      AND json_extract(
        NEW.agent_action_provenance,
        '$.effectiveDelegatedCapability.projectionVersion'
      ) = 2
      AND json_type(
        NEW.agent_action_provenance,
        '$.effectiveDelegatedCapability.fingerprint'
      ) = 'text'
      AND length(
        json_extract(NEW.agent_action_provenance, '$.effectiveDelegatedCapability.fingerprint')
      ) = 64
      AND json_extract(
        NEW.agent_action_provenance,
        '$.effectiveDelegatedCapability.fingerprint'
      ) NOT GLOB '*[^0-9a-f]*'
      AND NOT EXISTS (
        SELECT 1
        FROM json_each(NEW.agent_action_provenance, '$.lineage') AS edge
        WHERE NOT COALESCE((
          edge.type = 'object'
          AND json_remove(
            edge.value,
            '$.childTurnID',
            '$.childSessionID',
            '$.childDepth',
            '$.parentTurnID',
            '$.parentSessionID',
            '$.parentDepth',
            '$.parentTaskPartID',
            '$.parentModelMessageID',
            '$.delegatedCapability',
            '$.delegatedCapabilityFingerprint'
          ) = '{}'
          AND json_type(edge.value, '$.childTurnID') = 'text'
          AND length(json_extract(edge.value, '$.childTurnID')) > 0
          AND json_type(edge.value, '$.childSessionID') = 'text'
          AND length(json_extract(edge.value, '$.childSessionID')) > 0
          AND json_type(edge.value, '$.childDepth') = 'integer'
          AND json_extract(edge.value, '$.childDepth') = CAST(edge.key AS INTEGER) + 1
          AND json_type(edge.value, '$.parentTurnID') = 'text'
          AND length(json_extract(edge.value, '$.parentTurnID')) > 0
          AND json_type(edge.value, '$.parentSessionID') = 'text'
          AND length(json_extract(edge.value, '$.parentSessionID')) > 0
          AND json_type(edge.value, '$.parentDepth') = 'integer'
          AND json_extract(edge.value, '$.parentDepth') = CAST(edge.key AS INTEGER)
          AND json_type(edge.value, '$.parentTaskPartID') = 'text'
          AND length(json_extract(edge.value, '$.parentTaskPartID')) > 0
          AND json_type(edge.value, '$.parentModelMessageID') = 'text'
          AND length(json_extract(edge.value, '$.parentModelMessageID')) > 0
          AND json_type(edge.value, '$.delegatedCapability') = 'object'
          AND json_remove(
            json_extract(edge.value, '$.delegatedCapability'),
            '$.version',
            '$.parent',
            '$.inherited',
            '$.profile',
            '$.explicit'
          ) = '{}'
          AND json_extract(edge.value, '$.delegatedCapability.version') = 2
          AND json_type(edge.value, '$.delegatedCapability.parent') = 'array'
          AND json_type(edge.value, '$.delegatedCapability.inherited') = 'array'
          AND json_type(edge.value, '$.delegatedCapability.profile') = 'array'
          AND json_type(edge.value, '$.delegatedCapability.explicit') = 'array'
          AND json_type(edge.value, '$.delegatedCapabilityFingerprint') = 'text'
          AND length(json_extract(edge.value, '$.delegatedCapabilityFingerprint')) = 64
          AND json_extract(edge.value, '$.delegatedCapabilityFingerprint') NOT GLOB '*[^0-9a-f]*'
        ), 0)
        OR EXISTS (
          SELECT 1
          FROM json_each(edge.value, '$.delegatedCapability.parent') AS rule
          WHERE NOT COALESCE((
            rule.type = 'object'
            AND json_type(rule.value, '$.permission') = 'text'
            AND length(json_extract(rule.value, '$.permission')) > 0
            AND json_type(rule.value, '$.pattern') = 'text'
            AND json_type(rule.value, '$.action') = 'text'
            AND json_extract(rule.value, '$.action') IN ('allow', 'deny', 'ask')
            AND json_remove(rule.value, '$.permission', '$.pattern', '$.action') = '{}'
          ), 0)
        )
        OR EXISTS (
          SELECT 1
          FROM json_each(edge.value, '$.delegatedCapability.profile') AS rule
          WHERE NOT COALESCE((
            rule.type = 'object'
            AND json_type(rule.value, '$.permission') = 'text'
            AND length(json_extract(rule.value, '$.permission')) > 0
            AND json_type(rule.value, '$.pattern') = 'text'
            AND json_type(rule.value, '$.action') = 'text'
            AND json_extract(rule.value, '$.action') IN ('allow', 'deny', 'ask')
            AND json_remove(rule.value, '$.permission', '$.pattern', '$.action') = '{}'
          ), 0)
        )
        OR EXISTS (
          SELECT 1
          FROM json_each(edge.value, '$.delegatedCapability.explicit') AS rule
          WHERE NOT COALESCE((
            rule.type = 'object'
            AND json_type(rule.value, '$.permission') = 'text'
            AND length(json_extract(rule.value, '$.permission')) > 0
            AND json_type(rule.value, '$.pattern') = 'text'
            AND json_type(rule.value, '$.action') = 'text'
            AND json_extract(rule.value, '$.action') IN ('allow', 'deny', 'ask')
            AND json_remove(rule.value, '$.permission', '$.pattern', '$.action') = '{}'
          ), 0)
        )
        OR EXISTS (
          SELECT 1
          FROM json_each(edge.value, '$.delegatedCapability.inherited') AS inherited
          WHERE inherited.type <> 'array'
             OR EXISTS (
               SELECT 1
               FROM json_each(inherited.value) AS rule
               WHERE NOT COALESCE((
                 rule.type = 'object'
                 AND json_type(rule.value, '$.permission') = 'text'
                 AND length(json_extract(rule.value, '$.permission')) > 0
                 AND json_type(rule.value, '$.pattern') = 'text'
                 AND json_type(rule.value, '$.action') = 'text'
                 AND json_extract(rule.value, '$.action') IN ('allow', 'deny', 'ask')
                 AND json_remove(rule.value, '$.permission', '$.pattern', '$.action') = '{}'
               ), 0)
             )
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM json_each(NEW.agent_action_provenance, '$.lineage') AS current
        JOIN json_each(NEW.agent_action_provenance, '$.lineage') AS previous
          ON CAST(previous.key AS INTEGER) = CAST(current.key AS INTEGER) - 1
        WHERE CAST(current.key AS INTEGER) > 0
          AND NOT COALESCE((
            json_extract(current.value, '$.parentTurnID') =
              json_extract(previous.value, '$.childTurnID')
            AND json_extract(current.value, '$.parentSessionID') =
              json_extract(previous.value, '$.childSessionID')
            AND json_extract(current.value, '$.parentDepth') =
              json_extract(previous.value, '$.childDepth')
          ), 0)
      )
      AND json_extract(NEW.agent_action_provenance, '$.turnID') = (
        SELECT json_extract(edge.value, '$.childTurnID')
        FROM json_each(NEW.agent_action_provenance, '$.lineage') AS edge
        ORDER BY CAST(edge.key AS INTEGER) DESC
        LIMIT 1
      )
      AND json_extract(NEW.agent_action_provenance, '$.sessionID') = (
        SELECT json_extract(edge.value, '$.childSessionID')
        FROM json_each(NEW.agent_action_provenance, '$.lineage') AS edge
        ORDER BY CAST(edge.key AS INTEGER) DESC
        LIMIT 1
      )
      AND json_extract(
        NEW.agent_action_provenance,
        '$.effectiveDelegatedCapability.fingerprint'
      ) = (
        SELECT json_extract(edge.value, '$.delegatedCapabilityFingerprint')
        FROM json_each(NEW.agent_action_provenance, '$.lineage') AS edge
        ORDER BY CAST(edge.key AS INTEGER) DESC
        LIMIT 1
      )
    )
  )
)`

export const defaultCourseTransitionStatement = `CREATE TRIGGER IF NOT EXISTS learner_default_course_validate_insert_v14_agent
 BEFORE INSERT ON learner_default_course_transition
 WHEN NEW.agent_action_part_id IS NOT NULL
 BEGIN
   SELECT RAISE(ABORT, 'learner_default_course_agent_transition_invalid')
   WHERE NEW.authorization_part_id IS NOT NULL
      OR NEW.permission_request_id IS NOT NULL
      OR NEW.confirmation_snapshot IS NOT NULL
      OR NOT EXISTS (
        SELECT 1
        FROM learner_default_course_disposition AS action
        JOIN learning_command_invocation AS invocation
          ON invocation.part_id = action.invocation_part_id
        JOIN learner_default_course_capability_settlement AS capability
          ON capability.invocation_part_id = action.invocation_part_id
        WHERE action.invocation_part_id = NEW.agent_action_part_id
          AND action.disposition = 'agent_action_v3'
          AND action.agent_action_version = 3
          AND invocation.command_name = 'set_default_course_preference'
          AND invocation.command_version = 3
          AND invocation.capability_identity = 'set_default_course_preference'
          AND invocation.capability_version = 3
          AND invocation.authorization_basis = 'agent_action'
          AND invocation.status = 'admitted'
          AND invocation.occurrence_id = NEW.occurrence_id
          AND capability.authorization_fingerprint IS NULL
          AND capability.agent_action_fingerprint = action.agent_action_fingerprint
          AND capability.outcome IN ('policy_allow', 'prompted_allow')
          AND action.preference_version = NEW.version - 1
          AND action.preference_head_id IS NEW.predecessor_id
          AND json_extract(action.from_locator, '$.kind') =
                CASE WHEN NEW.previous_course_id IS NULL THEN 'absent' ELSE 'course' END
          AND (
            NEW.previous_course_id IS NULL
            OR json_extract(action.from_locator, '$.locator.courseID') = NEW.previous_course_id
          )
          AND json_extract(action.to_locator, '$.kind') =
                CASE WHEN NEW.course_id IS NULL THEN 'absent' ELSE 'course' END
          AND (
            NEW.course_id IS NULL
            OR (
              json_extract(action.to_locator, '$.locator.courseID') = NEW.course_id
              AND json_extract(action.to_locator, '$.locator.courseVersion.value') = NEW.target_course_version
              AND json_extract(action.to_locator, '$.locator.workingSelection.value.revisionID')
                    IS NEW.target_selection_revision_id
              AND json_extract(action.to_locator, '$.locator.workingSelection.value.selectionVersion')
                    = NEW.target_selection_version
              AND json_extract(action.to_locator, '$.locator.workingSelection.value.viewID') IS NEW.target_view_id
              AND json_extract(action.to_locator, '$.locator.workingSelection.value.viewVersion')
                    IS NEW.target_view_version
              AND json_extract(action.to_locator, '$.locator.workingSelection.value.revisionVersion')
                    IS NEW.target_revision_version
            )
          )
      );
 END`

export const dispositionStatement = `CREATE TRIGGER IF NOT EXISTS learner_default_course_disposition_validate_insert_v14_agent
 BEFORE INSERT ON learner_default_course_disposition
 WHEN NEW.disposition IN ('semantic_terminal_v3', 'agent_action_v3')
 BEGIN
   SELECT RAISE(ABORT, 'learner_default_course_agent_disposition_invalid')
   WHERE NOT EXISTS (
     SELECT 1
     FROM learning_command_invocation AS invocation
     WHERE invocation.part_id = NEW.invocation_part_id
       AND invocation.command_name = 'set_default_course_preference'
       AND invocation.command_version = 3
       AND invocation.capability_identity = 'set_default_course_preference'
       AND invocation.capability_version = 3
       AND invocation.authorization_basis = 'agent_action'
       AND invocation.status = 'admitted'
       AND invocation.time_admitted <= NEW.time_disposed
       AND (
         (
           NEW.disposition = 'semantic_terminal_v3'
           AND json_extract(NEW.semantic_address, '$.occurrenceID') = invocation.occurrence_id
           AND EXISTS (
             SELECT 1
             FROM learner_default_course_transition AS effect
             WHERE effect.id = NEW.existing_effect_id
               AND (
                 (NEW.semantic_outcome = 'already_applied'
                   AND NEW.incoming_payload_fingerprint = NEW.existing_payload_fingerprint)
                 OR
                 (NEW.semantic_outcome = 'semantic_conflict'
                   AND NEW.incoming_payload_fingerprint <> NEW.existing_payload_fingerprint)
               )
           )
         )
         OR
         (
           NEW.disposition = 'agent_action_v3'
           AND ${agentActionProvenanceShape}
           AND json_extract(NEW.agent_action_provenance, '$.occurrenceID') = invocation.occurrence_id
           AND json_extract(NEW.agent_action_provenance, '$.causalRootOccurrenceID') = invocation.occurrence_id
           AND json_extract(NEW.agent_action_provenance, '$.sessionID') = invocation.session_id
           AND json_extract(NEW.agent_action_provenance, '$.turnID') = invocation.turn_id
           AND json_extract(NEW.agent_action_provenance, '$.inputID') = invocation.input_id
           AND json_extract(NEW.agent_action_provenance, '$.assistantMessageID') =
                 invocation.assistant_message_id
           AND json_extract(NEW.agent_action_provenance, '$.invocationPartID') = invocation.part_id
           AND json_extract(NEW.agent_action_provenance, '$.providerCallID') = invocation.provider_call_id
           AND json_extract(NEW.agent_action_provenance, '$.emissionOrdinal') = invocation.emission_ordinal
           AND NEW.operation = CASE
             WHEN json_extract(NEW.from_locator, '$.kind') = 'absent'
               AND json_extract(NEW.to_locator, '$.kind') = 'course'
             THEN 'set'
             WHEN json_extract(NEW.from_locator, '$.kind') = 'course'
               AND json_extract(NEW.to_locator, '$.kind') = 'absent'
             THEN 'clear'
             ELSE 'change'
           END
           AND (
             (
               NEW.preference_version = 0
               AND NEW.preference_head_id IS NULL
               AND json_extract(NEW.from_locator, '$.kind') = 'absent'
               AND NOT EXISTS (SELECT 1 FROM learner_default_course_transition)
             )
             OR EXISTS (
               SELECT 1
               FROM learner_default_course_transition AS head
               WHERE head.id = NEW.preference_head_id
                 AND head.version = NEW.preference_version
                 AND json_extract(NEW.from_locator, '$.kind') =
                       CASE WHEN head.course_id IS NULL THEN 'absent' ELSE 'course' END
                 AND (
                   head.course_id IS NULL
                   OR json_extract(NEW.from_locator, '$.locator.courseID') = head.course_id
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM learner_default_course_transition AS later
                   WHERE later.version > head.version
                 )
             )
           )
         )
       )
   );
 END`

export const capabilityIssueStatement = `CREATE TRIGGER IF NOT EXISTS learner_default_course_capability_issue_validate_insert_v14_agent
 BEFORE INSERT ON learner_default_course_capability_issue
 WHEN NEW.agent_action_fingerprint IS NOT NULL
 BEGIN
   SELECT RAISE(ABORT, 'learner_default_course_agent_capability_issue_invalid')
   WHERE NEW.authorization_fingerprint IS NOT NULL
      OR NOT EXISTS (
        SELECT 1
        FROM learner_default_course_disposition AS action
        JOIN learning_command_invocation AS invocation
          ON invocation.part_id = action.invocation_part_id
        WHERE action.invocation_part_id = NEW.invocation_part_id
          AND action.disposition = 'agent_action_v3'
          AND action.agent_action_fingerprint = NEW.agent_action_fingerprint
          AND invocation.command_version = 3
          AND invocation.authorization_basis = 'agent_action'
          AND invocation.status = 'admitted'
          AND invocation.time_admitted <= NEW.time_issued
          AND NOT EXISTS (
            SELECT 1 FROM learner_default_course_capability_settlement AS settlement
            WHERE settlement.invocation_part_id = NEW.invocation_part_id
          )
      );
 END`

export const capabilitySettlementStatement = `CREATE TRIGGER IF NOT EXISTS learner_default_course_capability_settlement_validate_insert_v14_agent
 BEFORE INSERT ON learner_default_course_capability_settlement
 WHEN NEW.agent_action_fingerprint IS NOT NULL
 BEGIN
   SELECT RAISE(ABORT, 'learner_default_course_agent_capability_settlement_invalid')
   WHERE NEW.authorization_fingerprint IS NOT NULL
      OR NOT EXISTS (
        SELECT 1
        FROM learner_default_course_disposition AS action
        JOIN learning_command_invocation AS invocation
          ON invocation.part_id = action.invocation_part_id
        WHERE action.invocation_part_id = NEW.invocation_part_id
          AND action.disposition = 'agent_action_v3'
          AND action.agent_action_fingerprint = NEW.agent_action_fingerprint
          AND invocation.command_version = 3
          AND invocation.authorization_basis = 'agent_action'
          AND invocation.status = 'admitted'
          AND invocation.time_admitted <= NEW.time_settled
      )
      OR (
        NEW.outcome IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel', 'prompted_abort')
        AND NOT EXISTS (
          SELECT 1
          FROM learner_default_course_capability_issue AS issue
          WHERE issue.invocation_part_id = NEW.invocation_part_id
            AND issue.permission_request_id = NEW.permission_request_id
            AND issue.agent_action_fingerprint = NEW.agent_action_fingerprint
            AND issue.authorization_fingerprint IS NULL
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
 END`

export const acknowledgementStatement = `CREATE TRIGGER IF NOT EXISTS learner_default_course_acknowledgement_validate_insert_v14_agent
 BEFORE INSERT ON learner_default_course_acknowledgement
 WHEN NEW.agent_action_version IS NOT NULL
 BEGIN
   SELECT RAISE(ABORT, 'learner_default_course_agent_acknowledgement_invalid')
   WHERE NOT EXISTS (
     SELECT 1
     FROM learner_default_course_disposition AS invocation_disposition
     JOIN learner_default_course_transition AS effect ON effect.id = NEW.effect_id
     JOIN learner_default_course_disposition AS effect_action
       ON effect_action.invocation_part_id = effect.agent_action_part_id
     JOIN learner_default_course_commit_seal AS seal ON seal.effect_id = effect.id
     JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
     WHERE invocation_disposition.invocation_part_id = NEW.invocation_part_id
       AND effect_action.disposition = 'agent_action_v3'
       AND effect_action.agent_action_version = NEW.agent_action_version
       AND effect.agent_action_part_id = NEW.effect_agent_action_part_id
       AND receipt.id = NEW.receipt_id
       AND receipt.time_committed = NEW.time_committed
       AND receipt.commit_order = NEW.commit_order
       AND json_extract(NEW.presentation_snapshot, '$.schemaVersion') = 2
       AND json_extract(NEW.presentation_snapshot, '$.invocationPartID') = NEW.invocation_part_id
       AND json_extract(NEW.presentation_snapshot, '$.effectAgentActionPartID') =
             NEW.effect_agent_action_part_id
       AND json_extract(NEW.presentation_snapshot, '$.agentActionVersion') = NEW.agent_action_version
       AND json_extract(NEW.presentation_snapshot, '$.effectID') = NEW.effect_id
       AND json_extract(NEW.presentation_snapshot, '$.receiptID') = NEW.receipt_id
       AND json_extract(NEW.presentation_snapshot, '$.operation') = NEW.operation
       AND json(json_extract(NEW.presentation_snapshot, '$.from')) = json(NEW.from_locator)
       AND json(json_extract(NEW.presentation_snapshot, '$.to')) = json(NEW.to_locator)
       AND json_extract(NEW.presentation_snapshot, '$.relation') = NEW.relation
       AND json_extract(NEW.presentation_snapshot, '$.timeCommitted') = NEW.time_committed
       AND json_extract(NEW.presentation_snapshot, '$.commitOrder') = NEW.commit_order
       AND effect_action.operation = NEW.operation
       AND json(effect_action.from_locator) = json(NEW.from_locator)
       AND json(effect_action.to_locator) = json(NEW.to_locator)
       AND (
         invocation_disposition.disposition = 'agent_action_v3'
         OR (
           invocation_disposition.disposition = 'semantic_terminal_v3'
           AND invocation_disposition.semantic_outcome = 'already_applied'
           AND invocation_disposition.existing_effect_id = NEW.effect_id
           AND invocation_disposition.incoming_payload_fingerprint =
                 invocation_disposition.existing_payload_fingerprint
         )
       )
   );
 END`

export const commitSealStatement = `CREATE TRIGGER IF NOT EXISTS learner_default_course_commit_seal_validate_insert_v14_agent
 BEFORE INSERT ON learner_default_course_commit_seal
 WHEN EXISTS (
   SELECT 1 FROM learner_default_course_transition AS effect
   WHERE effect.id = NEW.effect_id AND effect.agent_action_part_id IS NOT NULL
 )
 BEGIN
   SELECT RAISE(ABORT, 'learner_default_course_agent_commit_seal_invalid')
   WHERE NOT EXISTS (
     SELECT 1
     FROM learner_default_course_transition AS effect
     JOIN learner_default_course_disposition AS action
       ON action.invocation_part_id = effect.agent_action_part_id
     JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
     JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
     WHERE effect.id = NEW.effect_id
       AND effect.agent_action_part_id = NEW.invocation_part_id
       AND receipt.invocation_part_id = NEW.invocation_part_id
       AND receipt.occurrence_id = effect.occurrence_id
       AND invocation.occurrence_id = effect.occurrence_id
       AND invocation.command_name = 'set_default_course_preference'
       AND invocation.command_version = 3
       AND invocation.capability_identity = 'set_default_course_preference'
       AND invocation.capability_version = 3
       AND invocation.authorization_basis = 'agent_action'
       AND receipt.authorization_basis = 'agent_action'
       AND invocation.status = 'admitted'
       AND action.disposition = 'agent_action_v3'
       AND action.agent_action_version = 3
   );
 END`

export const authorityStatements = [
  historicalTransitionStatement,
  defaultCourseTransitionStatement,
  proposalRetirementStatement,
  historicalDispositionStatement,
  dispositionStatement,
  historicalCapabilityIssueStatement,
  capabilityIssueStatement,
  historicalCapabilitySettlementStatement,
  capabilitySettlementStatement,
  historicalAcknowledgementStatement,
  acknowledgementStatement,
  historicalCommitSealStatement,
  commitSealStatement,
] as const

export const statements = authorityStatements

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
