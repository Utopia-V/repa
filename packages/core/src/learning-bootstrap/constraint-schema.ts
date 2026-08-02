import { Effect } from "effect"
import type { Database } from "../database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const guardedTables = [
  "learning_bootstrap_effect",
  "learning_bootstrap_commit_seal",
  "learning_course_material_adoption",
  "learning_bootstrap_course_result",
  "learning_bootstrap_route_result",
  "learning_bootstrap_selection_result",
  "learning_bootstrap_material_result",
  "learning_bootstrap_map_result",
  "learning_bootstrap_alignment_result",
  "learning_bootstrap_anchor_result",
] as const

const candidateTables = [
  "learning_bootstrap_disposition",
  "learning_bootstrap_capability_issue",
  "learning_bootstrap_capability_settlement",
] as const

export const statements = [
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_disposition_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_disposition
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_disposition_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_command_invocation AS invocation
       WHERE invocation.part_id = NEW.invocation_part_id
         AND invocation.command_name = 'update_learning_course'
         AND invocation.command_version = 1
         AND invocation.capability_identity = 'update_learning_course'
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
           OR json_extract(NEW.agent_action, '$.capabilityIdentity') IS NOT 'update_learning_course'
           OR json_extract(NEW.agent_action, '$.capabilityVersion') <> 1
           OR json(json_extract(NEW.materialized_candidate, '$.canonicalCommand'))
             IS NOT json(NEW.canonical_command)
           OR json_extract(NEW.materialized_candidate, '$.agentAction.invocationPartID')
             IS NOT NEW.invocation_part_id
         )
       )
       OR (
         NEW.disposition = 'semantic_terminal_v1'
         AND NOT EXISTS (
           SELECT 1 FROM learning_bootstrap_effect AS effect
           WHERE effect.id = NEW.existing_effect_id
             AND effect.occurrence_id = (
               SELECT occurrence_id FROM learning_command_invocation
               WHERE part_id = NEW.invocation_part_id
             )
             AND effect.semantic_fingerprint = NEW.existing_intent_fingerprint
             AND (
               (NEW.semantic_outcome = 'already_applied'
                 AND NEW.command_fingerprint = effect.semantic_fingerprint)
               OR (NEW.semantic_outcome = 'semantic_conflict'
                 AND NEW.command_fingerprint <> effect.semantic_fingerprint)
             )
         )
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_capability_issue_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_capability_issue
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_capability_issue_invalid_v17')
     WHERE EXISTS (
       SELECT 1 FROM learning_bootstrap_capability_settlement AS settlement
       WHERE settlement.invocation_part_id = NEW.invocation_part_id
     )
       OR NOT EXISTS (
         SELECT 1
         FROM learning_bootstrap_disposition AS disposition
         JOIN learning_command_invocation AS invocation
           ON invocation.part_id = disposition.invocation_part_id
         WHERE disposition.invocation_part_id = NEW.invocation_part_id
           AND disposition.disposition = 'candidate_v1'
           AND disposition.agent_action_fingerprint = NEW.agent_action_fingerprint
           AND invocation.status = 'admitted'
           AND invocation.time_admitted <= NEW.time_issued
           AND NEW.issue_order >= 0
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_capability_settlement_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_capability_settlement
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_capability_settlement_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learning_bootstrap_disposition AS disposition
       JOIN learning_command_invocation AS invocation
         ON invocation.part_id = disposition.invocation_part_id
       WHERE disposition.invocation_part_id = NEW.invocation_part_id
         AND disposition.disposition = 'candidate_v1'
         AND disposition.agent_action_fingerprint = NEW.agent_action_fingerprint
         AND invocation.status = 'admitted'
         AND invocation.time_admitted <= NEW.time_settled
     )
       OR (
         NEW.outcome IN (
           'prompted_allow', 'prompted_deny', 'prompted_correct',
           'prompted_cancel', 'prompted_abort'
         )
         AND NOT EXISTS (
           SELECT 1 FROM learning_bootstrap_capability_issue AS issue
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
           SELECT 1 FROM learning_bootstrap_capability_issue AS issue
           WHERE issue.invocation_part_id = NEW.invocation_part_id
         )
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_effect_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_effect
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_effect_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learning_bootstrap_disposition AS disposition
       JOIN learning_bootstrap_capability_settlement AS capability
         ON capability.invocation_part_id = disposition.invocation_part_id
       JOIN learning_command_invocation AS invocation
         ON invocation.part_id = disposition.invocation_part_id
       JOIN learning_command_receipt AS receipt
         ON receipt.invocation_part_id = invocation.part_id
       WHERE disposition.invocation_part_id = NEW.invocation_part_id
         AND disposition.disposition = 'candidate_v1'
         AND disposition.command_fingerprint = NEW.semantic_fingerprint
         AND json(disposition.canonical_command) = json(NEW.command)
         AND json(disposition.materialized_candidate) = json(NEW.materialized_candidate)
         AND capability.agent_action_fingerprint = disposition.agent_action_fingerprint
         AND capability.outcome IN ('policy_allow', 'prompted_allow')
         AND invocation.status = 'admitted'
         AND invocation.occurrence_id = NEW.occurrence_id
         AND receipt.occurrence_id = NEW.occurrence_id
         AND receipt.capability_identity = 'update_learning_course'
         AND receipt.capability_version = 1
         AND receipt.authorization_basis = 'agent_action'
         AND receipt.time_committed = NEW.time_committed
         AND receipt.commit_order = NEW.commit_order
         AND NEW.time_committed >= disposition.time_disposed
     )
       OR NOT EXISTS (
         SELECT 1 FROM learning_shared_frontier AS frontier
         WHERE frontier.singleton = 1
           AND frontier.sequence = NEW.frontier_sequence
           AND frontier.time_committed = NEW.frontier_time
       )
       OR json_extract(NEW.command, '$.schemaVersion') <> 1
       OR json_extract(NEW.materialized_candidate, '$.schemaVersion') <> 1
       OR json_extract(NEW.acknowledgement, '$.schemaVersion') <> 1
       OR json_extract(NEW.acknowledgement, '$.outcome') <> 'applied'
       OR json(NEW.child_results) <> json(json_extract(NEW.acknowledgement, '$.children'));
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_commit_seal_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_commit_seal_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learning_bootstrap_effect AS effect
       JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
       JOIN learning_command_invocation AS invocation
         ON invocation.part_id = NEW.invocation_part_id
       WHERE effect.id = NEW.effect_id
         AND effect.commit_seal_id = NEW.effect_id
         AND effect.invocation_part_id = NEW.invocation_part_id
         AND receipt.invocation_part_id = NEW.invocation_part_id
         AND receipt.occurrence_id = effect.occurrence_id
         AND receipt.time_committed = effect.time_committed
         AND receipt.commit_order = effect.commit_order
         AND invocation.status = 'admitted'
         AND invocation.occurrence_id = effect.occurrence_id
         AND invocation.command_name = 'update_learning_course'
         AND invocation.command_version = 1
         AND invocation.capability_identity = receipt.capability_identity
         AND invocation.capability_version = receipt.capability_version
         AND invocation.authorization_basis = receipt.authorization_basis
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_course_material_adoption_validate_insert_v17
   BEFORE INSERT ON learning_course_material_adoption
   BEGIN
     SELECT RAISE(ABORT, 'learning_course_material_adoption_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_bootstrap_effect AS effect
       WHERE effect.id = NEW.creation_effect_id
         AND effect.course_id = NEW.course_id
     )
       OR (
         NEW.attribution_type = 'recorded'
         AND EXISTS (
           SELECT 1 FROM learning_course_material_adoption AS existing
           WHERE existing.course_id = NEW.course_id
             AND existing.target_kind = 'artifact'
             AND existing.artifact_id = NEW.artifact_id
             AND existing.artifact_revision_id = NEW.artifact_revision_id
             AND existing.attribution_type = 'recorded'
         )
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_course_result_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_course_result
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_course_result_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_bootstrap_effect AS effect
       WHERE effect.id = NEW.effect_id AND effect.course_id = NEW.course_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_route_result_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_route_result
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_route_result_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learning_bootstrap_effect AS effect
       JOIN course_view AS view ON view.id = NEW.view_id
       JOIN course_view_revision AS revision
         ON revision.id = NEW.revision_id AND revision.view_id = NEW.view_id
       WHERE effect.id = NEW.effect_id
         AND view.course_id = effect.course_id
         AND revision.course_id = effect.course_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_selection_result_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_selection_result
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_selection_result_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_bootstrap_effect AS effect
       WHERE effect.id = NEW.effect_id
     )
       OR (
         NEW.selected_revision_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM learning_bootstrap_effect AS effect
           JOIN course_view_revision AS revision
             ON revision.id = NEW.selected_revision_id
           WHERE effect.id = NEW.effect_id
             AND revision.course_id = effect.course_id
         )
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_material_result_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_material_result
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_material_result_invalid_v17')
     WHERE NEW.ordinal < 0
       OR NOT EXISTS (
         SELECT 1
         FROM learning_bootstrap_effect AS effect
         JOIN learning_course_material_adoption AS adoption
           ON adoption.id = NEW.adoption_id
         WHERE effect.id = NEW.effect_id
           AND adoption.course_id = effect.course_id
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_map_result_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_map_result
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_map_result_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1 FROM material_map AS map
       WHERE map.id = NEW.map_id
     )
       OR NOT EXISTS (
         SELECT 1 FROM learning_bootstrap_effect AS effect
         WHERE effect.id = NEW.effect_id
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_alignment_result_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_alignment_result
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_alignment_result_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learning_bootstrap_effect AS effect
       JOIN material_course_alignment AS alignment
         ON alignment.id = NEW.alignment_id
       WHERE effect.id = NEW.effect_id
         AND alignment.course_id = effect.course_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_anchor_result_validate_insert_v17
   BEFORE INSERT ON learning_bootstrap_anchor_result
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_anchor_result_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_bootstrap_effect AS effect
       WHERE effect.id = NEW.effect_id
     )
       OR (
         NEW.anchor_effect_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM learning_bootstrap_effect AS effect
           JOIN learner_course_route_anchor_transition AS anchor
             ON anchor.id = NEW.anchor_effect_id
           WHERE effect.id = NEW.effect_id
             AND anchor.course_id = effect.course_id
             AND anchor.occurrence_id = effect.occurrence_id
             AND anchor.time_committed = effect.time_committed
             AND anchor.commit_order = effect.commit_order
             AND anchor.frontier_sequence = effect.frontier_sequence
         )
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_learning_command_terminal_validate_v17
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted' AND OLD.command_name = 'update_learning_course'
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_learning_command_terminal_invalid_v17')
     WHERE OLD.command_version <> 1
       OR OLD.capability_identity <> 'update_learning_course'
       OR OLD.capability_version <> 1
       OR OLD.authorization_basis <> 'agent_action'
       OR json_extract(NEW.settlement, '$.outcome') IS NOT NEW.status
       OR json_extract(NEW.settlement, '$.settlementTime') IS NOT NEW.time_settled
       OR json_extract(NEW.settlement, '$.settlementOrder') IS NOT NEW.settlement_order
       OR NOT COALESCE((
         (
           NEW.status IN ('applied', 'already_applied')
           AND json_extract(NEW.settlement, '$.bootstrapKind') = 'learning_bootstrap'
           AND json_extract(NEW.settlement, '$.schemaVersion') = 1
           AND json_extract(NEW.settlement, '$.receiptID') = NEW.receipt_id
           AND json_type(NEW.settlement, '$.children') = 'array'
           AND json_type(NEW.settlement, '$.acknowledgement') = 'object'
           AND EXISTS (
             SELECT 1
             FROM learning_bootstrap_effect AS effect
             JOIN learning_bootstrap_commit_seal AS seal ON seal.effect_id = effect.id
             JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
             JOIN learning_bootstrap_course_result AS course_result
               ON course_result.effect_id = effect.id
             JOIN learning_bootstrap_selection_result AS selection_result
               ON selection_result.effect_id = effect.id
             JOIN learning_bootstrap_anchor_result AS anchor_result
               ON anchor_result.effect_id = effect.id
             WHERE effect.id = json_extract(NEW.settlement, '$.effectID')
               AND seal.receipt_id = NEW.receipt_id
               AND receipt.occurrence_id = OLD.occurrence_id
               AND (NEW.status = 'already_applied' OR seal.invocation_part_id = OLD.part_id)
               AND effect.course_id = json_extract(NEW.settlement, '$.courseID')
               AND effect.frontier_sequence = json_extract(NEW.settlement, '$.frontierSequence')
               AND json(effect.child_results) = json(json_extract(NEW.settlement, '$.children'))
               AND (
                 (NEW.status = 'applied'
                   AND json(effect.acknowledgement) = json(json_extract(NEW.settlement, '$.acknowledgement')))
                 OR (NEW.status = 'already_applied'
                   AND json(json_set(effect.acknowledgement, '$.outcome', 'already_applied')) =
                     json(json_extract(NEW.settlement, '$.acknowledgement')))
               )
               AND (NEW.status = 'already_applied'
                 OR (
                   effect.invocation_part_id = OLD.part_id
                   AND effect.time_committed = NEW.time_settled
                   AND effect.commit_order = NEW.settlement_order
                 ))
           )
         )
         OR (
           NEW.status = 'no_change'
           AND NEW.receipt_id IS NULL
           AND json_extract(NEW.settlement, '$.bootstrapKind') = 'learning_bootstrap'
           AND json_extract(NEW.settlement, '$.schemaVersion') = 1
           AND json_type(NEW.settlement, '$.children') = 'array'
           AND json_extract(NEW.settlement, '$.acknowledgement.outcome') = 'no_change'
           AND EXISTS (
             SELECT 1
             FROM learning_bootstrap_disposition AS disposition
             JOIN learning_bootstrap_capability_settlement AS capability
               ON capability.invocation_part_id = disposition.invocation_part_id
             WHERE disposition.invocation_part_id = OLD.part_id
               AND disposition.disposition = 'candidate_v1'
               AND capability.outcome IN ('policy_allow', 'prompted_allow')
           )
           AND NOT EXISTS (
             SELECT 1 FROM learning_bootstrap_effect AS effect
             WHERE effect.invocation_part_id = OLD.part_id
           )
         )
         OR (
           NEW.status = 'error'
           AND NEW.receipt_id IS NULL
           AND (SELECT count(*) FROM json_each(NEW.settlement)) IN (4, 5)
           AND json_extract(NEW.settlement, '$.code') IN (
             'semantic_conflict', 'context_refresh_required', 'permission_rejected',
             'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
             'temporal_context_unavailable', 'capacity_exceeded', 'outcome_unknown',
             'stale', 'inactive', 'validation_error'
           )
           AND NOT EXISTS (
             SELECT 1 FROM learning_bootstrap_effect AS effect
             WHERE effect.invocation_part_id = OLD.part_id
           )
         )
       ), 0);
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_course_route_anchor_commit_seal_validate_insert_v17
   BEFORE INSERT ON learner_course_route_anchor_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_course_route_anchor_commit_seal_invalid_v17')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_course_route_anchor_transition AS anchor
       JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
       JOIN learning_command_invocation AS invocation
         ON invocation.part_id = NEW.invocation_part_id
       WHERE anchor.id = NEW.effect_id
         AND receipt.invocation_part_id = NEW.invocation_part_id
         AND receipt.occurrence_id = anchor.occurrence_id
         AND invocation.occurrence_id = anchor.occurrence_id
         AND invocation.status = 'admitted'
         AND invocation.capability_identity = receipt.capability_identity
         AND invocation.capability_version = receipt.capability_version
         AND invocation.authorization_basis = receipt.authorization_basis
         AND (
           (
             invocation.command_name = 'set_course_route_anchor'
             AND invocation.command_version = 1
             AND invocation.capability_identity = 'set_course_route_anchor'
             AND invocation.capability_version = 1
           )
           OR (
             invocation.command_name = 'update_learning_course'
             AND invocation.command_version = 1
             AND invocation.capability_identity = 'update_learning_course'
             AND invocation.capability_version = 1
             AND invocation.authorization_basis = 'agent_action'
             AND EXISTS (
               SELECT 1
               FROM learning_bootstrap_anchor_result AS result
               JOIN learning_bootstrap_effect AS effect ON effect.id = result.effect_id
               JOIN learning_bootstrap_commit_seal AS seal ON seal.effect_id = effect.id
               WHERE result.anchor_effect_id = anchor.id
                 AND result.outcome = 'changed'
                 AND effect.invocation_part_id = invocation.part_id
                 AND effect.occurrence_id = anchor.occurrence_id
                 AND effect.course_id = anchor.course_id
                 AND effect.frontier_sequence = anchor.frontier_sequence
                 AND seal.receipt_id = NEW.receipt_id
             )
           )
         )
     );
   END`,
  ...candidateTables.map(
    (table) =>
      `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_v17 BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable_v17'); END`,
  ),
  `CREATE TRIGGER IF NOT EXISTS learning_bootstrap_disposition_delete_forbidden_v17
   BEFORE DELETE ON learning_bootstrap_disposition
   WHEN EXISTS (
     SELECT 1 FROM learning_command_invocation
     WHERE part_id = OLD.invocation_part_id
   )
   BEGIN
     SELECT RAISE(ABORT, 'learning_bootstrap_disposition_delete_forbidden_v17');
   END`,
  ...["learning_bootstrap_capability_issue", "learning_bootstrap_capability_settlement"].map(
    (table) =>
      `CREATE TRIGGER IF NOT EXISTS ${table}_delete_forbidden_v17
       BEFORE DELETE ON ${table}
       WHEN EXISTS (
         SELECT 1 FROM learning_bootstrap_disposition
         WHERE invocation_part_id = OLD.invocation_part_id
       )
       BEGIN SELECT RAISE(ABORT, '${table}_delete_forbidden_v17'); END`,
  ),
  ...guardedTables.flatMap((table) => [
    `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_v17 BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable_v17'); END`,
    `CREATE TRIGGER IF NOT EXISTS ${table}_delete_forbidden_v17 BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_delete_forbidden_v17'); END`,
  ]),
] as const

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
