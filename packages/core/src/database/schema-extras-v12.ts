import { Effect } from "effect"
import type { Database } from "./database"
import { constraintStatements as frontierStatements } from "../learning-frontier-constraint-v1"
import { statements as turnStatements } from "../turn/constraint-schema-v1"
import { statements as materialMapStatements } from "../material-map/constraint-schema-v1"
import { statements as navigationStatements } from "../learner-navigation/constraint-schema-v1"
import { statements as retainedSteeringStatements } from "../retained-steering/constraint-schema-v1"
import {
  backfillStateGuard as backfillLearnerGoalStateGuard,
  immutableStatements as learnerGoalImmutableStatements,
  initialize as initializeLearnerGoalAuthority,
  statements as learnerGoalStatements,
} from "../learner-goal/constraint-schema-v1"
import { statements as courseStatements } from "../course/constraint-schema-v1"
import { learningCommandStatements as courseLearningCommandStatements } from "../course/learning-command-constraint-v12"
import { learningCommandStatements as representationLearningCommandStatements } from "../representation/learning-command-constraint-v12"
import { learningCommandStatements as navigationLearningCommandStatements } from "../learner-navigation/learning-command-constraint-v12"
import { learningCommandStatements as retainedSteeringLearningCommandStatements } from "../retained-steering/learning-command-constraint-v12"
import { learningCommandStatements as learnerGoalLearningCommandStatements } from "../learner-goal/learning-command-constraint-v12"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const invocationProjection = "learning_command_invocation_constraint_v12"
const receiptProjection = "learning_command_receipt_constraint_v12"

// These read-only projections are a frozen adapter for the retained v11 domain
// triggers below. They are not a generic effect registry: new domains must add
// native domain-owned v12 constraints and must not extend these projections.
const excluded = new Set([
  "learner_goal_commit_seal_acknowledgement_validate",
  "learner_goal_commit_seal_direct_validate",
  "retained_steering_commit_seal_validate_insert",
  "learner_goal_commit_seal_validate_insert",
  "retained_steering_state_validate_update",
  "learner_goal_state_validate_update",
])

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

function retainedV11Statement(statement: string) {
  const name = triggerName(statement)
  if (!name || excluded.has(name)) return false
  return !/\bON learning_command_(?:invocation|receipt)\b/i.test(statement)
}

function adaptV11Statement(statement: string) {
  const adapted = statement
    .replaceAll("learning_command_invocation AS", `${invocationProjection} AS`)
    .replaceAll("learning_command_receipt AS", `${receiptProjection} AS`)
  const name = triggerName(statement)
  if (name === "learner_goal_commit_seal_command_validate") {
    return removeValidationBlock(
      adapted,
      "learner_goal_commit_seal_no_change_basis_invalid",
      "learner_goal_commit_seal_command_target_invalid",
    )
  }
  if (name === "learner_goal_commit_seal_basis_validate") {
    return removeValidationBlock(
      adapted,
      "learner_goal_commit_seal_authored_basis_invalid",
      "learner_goal_commit_seal_carry_invalid",
    )
  }
  return adapted
}

function adaptLearnerGoalConfirmationBasis(statement: string) {
  return statement
    .replace(
      "CREATE TRIGGER IF NOT EXISTS learner_goal_confirmation_basis_validate_update",
      "CREATE TRIGGER IF NOT EXISTS learner_goal_command_confirmation_basis_validate_v12",
    )
    .replace(
      `BEFORE UPDATE OF goal_confirmation_snapshot ON learning_command_invocation
   WHEN NEW.command_name = 'update_learner_goals'
     AND NEW.authorization_basis = 'learner_acceptance'
     AND NEW.goal_confirmation_snapshot IS NOT NULL`,
      `BEFORE UPDATE OF confirmation_snapshot ON learner_goal_command
   WHEN NEW.confirmation_snapshot IS NOT NULL`,
    )
    .replaceAll("NEW.goal_command_snapshot", "NEW.command_snapshot")
    .replaceAll("NEW.goal_confirmation_snapshot", "NEW.confirmation_snapshot")
}

function removeValidationBlock(statement: string, error: string, nextError: string) {
  const start = statement.indexOf(`     SELECT RAISE(ABORT, '${error}')`)
  const next = statement.indexOf(`     SELECT RAISE(ABORT, '${nextError}')`, start)
  if (start < 0 || next < 0) throw new Error(`Could not remove obsolete v11 validation block ${error}`)
  return statement.slice(0, start) + statement.slice(next)
}

export const viewStatements = [
  `CREATE VIEW IF NOT EXISTS ${invocationProjection} AS
   SELECT invocation.*,
          retained.semantic_fingerprint AS retained_steering_semantic_fingerprint,
          goal.semantic_fingerprint AS goal_semantic_fingerprint,
          goal.command_snapshot AS goal_command_snapshot,
          COALESCE(default_command.permission_request_id, goal.permission_request_id) AS permission_request_id,
          goal.confirmation_snapshot AS goal_confirmation_snapshot,
          (SELECT seal.effect_id FROM course_selection_acceptance_commit_seal AS seal
             WHERE seal.receipt_id = invocation.receipt_id) AS effect_id,
          (SELECT seal.effect_id FROM representation_command_commit_seal AS seal
             WHERE seal.receipt_id = invocation.receipt_id) AS representation_effect_id,
          (SELECT seal.effect_id FROM learner_default_course_commit_seal AS seal
             WHERE seal.receipt_id = invocation.receipt_id) AS default_navigation_effect_id,
          (SELECT seal.effect_id FROM learner_course_route_anchor_commit_seal AS seal
             WHERE seal.receipt_id = invocation.receipt_id) AS anchor_navigation_effect_id,
          COALESCE(
            (SELECT seal.transition_id FROM retained_steering_commit_seal AS seal
               WHERE seal.receipt_id = invocation.receipt_id),
            CASE WHEN invocation.command_name = 'update_retained_learning_steering'
              THEN json_extract(invocation.settlement, '$.effectID') END
          ) AS retained_steering_effect_id,
          COALESCE(
            (SELECT seal.effect_id FROM learner_goal_commit_seal AS seal
               WHERE seal.receipt_id = invocation.receipt_id),
            CASE WHEN invocation.command_name = 'update_learner_goals'
              THEN json_extract(invocation.settlement, '$.effectID') END
          ) AS goal_effect_id
   FROM learning_command_invocation AS invocation
   LEFT JOIN retained_steering_command AS retained
     ON retained.invocation_part_id = invocation.part_id
   LEFT JOIN learner_goal_command AS goal
     ON goal.invocation_part_id = invocation.part_id
   LEFT JOIN learner_default_course_command AS default_command
     ON default_command.invocation_part_id = invocation.part_id`,
  `CREATE VIEW IF NOT EXISTS ${receiptProjection} AS
   SELECT receipt.*,
          course_seal.effect_id AS effect_id,
          representation_seal.effect_id AS representation_effect_id,
          default_seal.effect_id AS default_navigation_effect_id,
          anchor_seal.effect_id AS anchor_navigation_effect_id,
          COALESCE(
            retained_seal.transition_id,
            CASE WHEN invocation.command_name = 'update_retained_learning_steering'
              THEN json_extract(invocation.settlement, '$.effectID') END
          ) AS retained_steering_effect_id,
          COALESCE(
            goal_seal.effect_id,
            CASE WHEN invocation.command_name = 'update_learner_goals'
              THEN json_extract(invocation.settlement, '$.effectID') END
          ) AS goal_effect_id,
          COALESCE(default_transition.permission_request_id, goal_command.permission_request_id)
            AS permission_request_id,
          COALESCE(default_transition.confirmation_snapshot, goal_command.confirmation_snapshot)
            AS confirmation_snapshot
   FROM learning_command_receipt AS receipt
   LEFT JOIN learning_command_invocation AS invocation
     ON invocation.part_id = receipt.invocation_part_id
   LEFT JOIN course_selection_acceptance_commit_seal AS course_seal
     ON course_seal.receipt_id = receipt.id
   LEFT JOIN representation_command_commit_seal AS representation_seal
     ON representation_seal.receipt_id = receipt.id
   LEFT JOIN learner_default_course_commit_seal AS default_seal
     ON default_seal.receipt_id = receipt.id
   LEFT JOIN learner_default_course_transition AS default_transition
     ON default_transition.id = default_seal.effect_id
   LEFT JOIN learner_course_route_anchor_commit_seal AS anchor_seal
     ON anchor_seal.receipt_id = receipt.id
   LEFT JOIN retained_steering_commit_seal AS retained_seal
     ON retained_seal.receipt_id = receipt.id
   LEFT JOIN learner_goal_commit_seal AS goal_seal
     ON goal_seal.receipt_id = receipt.id
   LEFT JOIN learner_goal_command AS goal_command
     ON goal_command.invocation_part_id = invocation.part_id`,
] as const

const structuralStatements = [
  `CREATE TRIGGER IF NOT EXISTS learning_command_invocation_admitted_insert_only_v12
   BEFORE INSERT ON learning_command_invocation
   BEGIN
     SELECT RAISE(ABORT, 'learning_command_invocation_must_start_admitted')
     WHERE NEW.status <> 'admitted' OR NEW.receipt_id IS NOT NULL OR NEW.settlement IS NOT NULL
        OR NEW.time_settled IS NOT NULL OR NEW.settlement_order IS NOT NULL;
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_command_invocation_identity_immutable_v12
   BEFORE UPDATE ON learning_command_invocation
   BEGIN
     SELECT RAISE(ABORT, 'learning_command_invocation_identity_immutable')
     WHERE NEW.part_id IS NOT OLD.part_id
        OR NEW.session_id IS NOT OLD.session_id
        OR NEW.parent_user_message_id IS NOT OLD.parent_user_message_id
        OR NEW.assistant_message_id IS NOT OLD.assistant_message_id
        OR NEW.provider_call_id IS NOT OLD.provider_call_id
        OR NEW.occurrence_id IS NOT OLD.occurrence_id
        OR NEW.command_name IS NOT OLD.command_name
        OR NEW.command_version IS NOT OLD.command_version
        OR NEW.emission_ordinal IS NOT OLD.emission_ordinal
        OR NEW.capability_identity IS NOT OLD.capability_identity
        OR NEW.capability_version IS NOT OLD.capability_version
        OR NEW.authorization_basis IS NOT OLD.authorization_basis
        OR NEW.input_fingerprint IS NOT OLD.input_fingerprint
        OR NEW.time_admitted IS NOT OLD.time_admitted
        OR NEW.turn_id IS NOT OLD.turn_id
        OR NEW.input_id IS NOT OLD.input_id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_command_invocation_terminal_immutable_v12
   BEFORE UPDATE ON learning_command_invocation
   WHEN OLD.status <> 'admitted'
   BEGIN
     SELECT RAISE(ABORT, 'learning_command_invocation_terminal_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_command_invocation_terminal_validate_v12
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted'
   BEGIN
     SELECT RAISE(ABORT, 'learning_command_invocation_terminal_invalid')
     WHERE NEW.status = 'admitted'
        OR (NEW.status IN ('applied', 'already_applied') AND NOT EXISTS (
          SELECT 1 FROM learning_command_receipt AS receipt
          WHERE receipt.id = NEW.receipt_id
            AND receipt.occurrence_id = NEW.occurrence_id
            AND receipt.capability_identity = NEW.capability_identity
            AND receipt.capability_version = NEW.capability_version
            AND receipt.authorization_basis = NEW.authorization_basis
            AND (NEW.status = 'already_applied' OR receipt.invocation_part_id = NEW.part_id)
            AND (NEW.status = 'already_applied'
              OR (receipt.time_committed = NEW.time_settled AND receipt.commit_order = NEW.settlement_order))
        ))
        OR (NEW.status IN ('no_change', 'error') AND NEW.receipt_id IS NOT NULL);
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_command_receipt_validate_insert_v12
   BEFORE INSERT ON learning_command_receipt
   BEGIN
     SELECT RAISE(ABORT, 'learning_command_receipt_authority_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learning_command_invocation AS invocation
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = invocation.occurrence_id
       WHERE invocation.part_id = NEW.invocation_part_id
         AND invocation.status = 'admitted'
         AND invocation.occurrence_id = NEW.occurrence_id
         AND invocation.assistant_message_id = NEW.assistant_message_id
         AND invocation.capability_identity = NEW.capability_identity
         AND invocation.capability_version = NEW.capability_version
         AND invocation.authorization_basis = NEW.authorization_basis
         AND occurrence.origin_session_id = NEW.origin_session_id
         AND occurrence.origin_message_id = NEW.origin_message_id
         AND invocation.time_admitted <= NEW.time_committed
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_command_receipt_immutable_v12
   BEFORE UPDATE ON learning_command_receipt
   BEGIN
     SELECT RAISE(ABORT, 'learning_command_receipt_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learning_command_receipt_delete_forbidden_v12
   BEFORE DELETE ON learning_command_receipt
   BEGIN
     SELECT RAISE(ABORT, 'learning_command_receipt_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_command_validate_insert_v12
   BEFORE INSERT ON learner_default_course_command
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_command_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_command_invocation AS invocation
       WHERE invocation.part_id = NEW.invocation_part_id
         AND invocation.command_name = 'set_default_course_preference'
         AND invocation.command_version = 1
         AND invocation.capability_identity = 'set_default_course_preference'
         AND invocation.capability_version = 1
         AND invocation.authorization_basis = 'learner_acceptance'
         AND invocation.status = 'admitted'
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_command_validate_insert_v12
   BEFORE INSERT ON retained_steering_command
   BEGIN
     SELECT RAISE(ABORT, 'retained_steering_command_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_command_invocation AS invocation
       WHERE invocation.part_id = NEW.invocation_part_id
         AND invocation.command_name = 'update_retained_learning_steering'
         AND invocation.command_version = 1
         AND invocation.capability_identity = 'update_retained_learning_steering'
         AND invocation.capability_version = 1
         AND invocation.authorization_basis = 'learner_request'
         AND invocation.status = 'admitted'
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_command_validate_insert_v12
   BEFORE INSERT ON learner_goal_command
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_command_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_command_invocation AS invocation
       WHERE invocation.part_id = NEW.invocation_part_id
         AND invocation.command_name = 'update_learner_goals'
         AND invocation.command_version = 1
         AND invocation.capability_identity = 'update_learner_goals'
         AND invocation.capability_version = 1
         AND invocation.status = 'admitted'
         AND ((invocation.authorization_basis = 'learner_request' AND NEW.permission_request_id IS NULL)
           OR (invocation.authorization_basis = 'learner_acceptance' AND NEW.permission_request_id IS NOT NULL))
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_command_confirmation_validate_v12
   BEFORE UPDATE OF confirmation_snapshot ON learner_goal_command
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_command_confirmation_invalid')
     WHERE OLD.confirmation_snapshot IS NOT NULL
        OR NEW.confirmation_snapshot IS NULL
        OR NEW.invocation_part_id IS NOT OLD.invocation_part_id
        OR NEW.semantic_fingerprint IS NOT OLD.semantic_fingerprint
        OR json(NEW.command_snapshot) IS NOT json(OLD.command_snapshot)
        OR NEW.permission_request_id IS NOT OLD.permission_request_id
        OR NOT EXISTS (
          SELECT 1 FROM learning_command_invocation AS invocation
          WHERE invocation.part_id = NEW.invocation_part_id
            AND invocation.status = 'admitted'
            AND invocation.authorization_basis = 'learner_acceptance'
        )
        OR NOT COALESCE(
          json_type(NEW.confirmation_snapshot) = 'object'
          AND (SELECT count(*) FROM json_each(NEW.confirmation_snapshot)) = 6
          AND json_extract(NEW.confirmation_snapshot, '$.schemaVersion') = 1
          AND json_extract(NEW.confirmation_snapshot, '$.authorizationBasis') = 'learner_acceptance'
          AND json_type(NEW.confirmation_snapshot, '$.command.operations') = 'array'
          AND json_type(NEW.confirmation_snapshot, '$.goalBases') = 'array'
          AND json_type(NEW.confirmation_snapshot, '$.courseBases') = 'array',
          0
        )
        OR json_extract(NEW.confirmation_snapshot, '$.semanticFingerprint') IS NOT NEW.semantic_fingerprint
        OR json(json_extract(NEW.confirmation_snapshot, '$.command')) IS NOT json(NEW.command_snapshot);
   END`,
  `CREATE TRIGGER IF NOT EXISTS retained_steering_command_immutable_v12
   BEFORE UPDATE ON retained_steering_command
   BEGIN SELECT RAISE(ABORT, 'retained_steering_command_immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_command_immutable_v12
   BEFORE UPDATE ON learner_default_course_command
   BEGIN SELECT RAISE(ABORT, 'learner_default_course_command_immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_command_identity_immutable_v12
   BEFORE UPDATE ON learner_goal_command
   WHEN NEW.invocation_part_id IS NOT OLD.invocation_part_id
     OR NEW.semantic_fingerprint IS NOT OLD.semantic_fingerprint
     OR json(NEW.command_snapshot) IS NOT json(OLD.command_snapshot)
     OR NEW.permission_request_id IS NOT OLD.permission_request_id
   BEGIN SELECT RAISE(ABORT, 'learner_goal_command_identity_immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_authorization_basis_validate_v12
   BEFORE INSERT ON learner_goal_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_authorization_basis_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_field_basis AS basis
       JOIN learner_goal_revision AS revision ON revision.id = basis.revision_id
       JOIN learner_goal_effect AS effect ON effect.id = revision.effect_id
       WHERE revision.effect_id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND basis.basis_kind = 'accepted'
     );
   END`,
  ...sealStatements(
    "course_selection_acceptance_commit_seal",
    "effect_id",
    "course_selection_acceptance_effect",
    "id",
    "accept_course_view_revision",
    "occurrence_id",
  ),
  ...sealStatements(
    "learner_default_course_commit_seal",
    "effect_id",
    "learner_default_course_transition",
    "id",
    "set_default_course_preference",
    "occurrence_id",
  ),
  ...sealStatements(
    "learner_course_route_anchor_commit_seal",
    "effect_id",
    "learner_course_route_anchor_transition",
    "id",
    "set_course_route_anchor",
    "occurrence_id",
  ),
  `CREATE TRIGGER IF NOT EXISTS representation_command_commit_seal_validate_insert_v12
   BEFORE INSERT ON representation_command_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'representation_command_commit_seal_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM representation_effect AS effect
       JOIN representation_revision AS revision ON revision.effect_id = effect.id
       JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE effect.id = NEW.effect_id
         AND receipt.invocation_part_id = NEW.invocation_part_id
         AND receipt.occurrence_id = invocation.occurrence_id
         AND invocation.command_name = 'representation.convert'
         AND invocation.command_version = 1
         AND invocation.capability_identity = 'representation.convert'
         AND invocation.capability_version = 1
         AND invocation.capability_identity = receipt.capability_identity
         AND invocation.capability_version = receipt.capability_version
         AND invocation.authorization_basis = receipt.authorization_basis
         AND invocation.status = 'admitted'
         AND revision.causal_occurrence_id = invocation.occurrence_id
         AND revision.causal_invocation_part_id = invocation.part_id
     );
   END`,
  ...sealGuardStatements("representation_command_commit_seal"),
] as const

function sealStatements(
  seal: string,
  sealEffectColumn: string,
  effect: string,
  effectIDColumn: string,
  capability: string,
  occurrenceColumn: string,
) {
  return [
    `CREATE TRIGGER IF NOT EXISTS ${seal}_validate_insert_v12
     BEFORE INSERT ON ${seal}
     BEGIN
       SELECT RAISE(ABORT, '${seal}_invalid')
       WHERE NOT EXISTS (
         SELECT 1
         FROM ${effect} AS effect
         JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
         JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
         WHERE effect.${effectIDColumn} = NEW.${sealEffectColumn}
           AND receipt.invocation_part_id = NEW.invocation_part_id
           AND receipt.occurrence_id = effect.${occurrenceColumn}
           AND invocation.occurrence_id = effect.${occurrenceColumn}
           AND invocation.command_name = '${capability}'
           AND invocation.command_version = 1
           AND invocation.capability_identity = '${capability}'
           AND invocation.capability_version = 1
           AND invocation.capability_identity = receipt.capability_identity
           AND invocation.capability_version = receipt.capability_version
           AND invocation.authorization_basis = receipt.authorization_basis
           AND invocation.status = 'admitted'
       );
     END`,
    ...sealGuardStatements(seal),
  ]
}

function sealGuardStatements(seal: string) {
  return [
    `CREATE TRIGGER IF NOT EXISTS ${seal}_immutable_v12
     BEFORE UPDATE ON ${seal}
     BEGIN SELECT RAISE(ABORT, '${seal}_immutable'); END`,
    `CREATE TRIGGER IF NOT EXISTS ${seal}_delete_forbidden_v12
     BEFORE DELETE ON ${seal}
     BEGIN SELECT RAISE(ABORT, '${seal}_delete_forbidden'); END`,
  ]
}

const adaptedV11Statements = [
  ...frontierStatements,
  ...turnStatements,
  ...materialMapStatements,
  ...navigationStatements,
  ...retainedSteeringStatements,
  ...courseStatements,
  ...learnerGoalStatements,
  ...learnerGoalImmutableStatements,
]
  .filter(retainedV11Statement)
  .map(adaptV11Statement)

const triggerCandidates = [
  ...courseLearningCommandStatements,
  ...representationLearningCommandStatements,
  ...navigationLearningCommandStatements,
  ...retainedSteeringLearningCommandStatements,
  ...learnerGoalLearningCommandStatements,
  ...adaptedV11Statements,
    adaptLearnerGoalConfirmationBasis(
      learnerGoalStatements.find(
        (statement) => triggerName(statement) === "learner_goal_confirmation_basis_validate_update",
      ) ?? (() => {
        throw new Error("The frozen v11 Goal confirmation basis trigger is missing")
      })(),
    ),
  ...structuralStatements,
]

const seenTriggers = new Set<string>()

export const triggerStatements = triggerCandidates.filter((statement) => {
  const name = triggerName(statement)
  if (!name || seenTriggers.has(name)) return false
  seenTriggers.add(name)
  return true
})

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The v12 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* initializeLearnerGoalAuthority(tx)
    yield* Effect.forEach(viewStatements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
    yield* Effect.forEach(triggerStatements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
    yield* backfillLearnerGoalStateGuard(tx)
  })
}
