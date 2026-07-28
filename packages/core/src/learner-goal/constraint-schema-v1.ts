export * as LearnerGoalConstraintSchema from "./constraint-schema-v1"

import { Effect } from "effect"
import { eq } from "drizzle-orm"
import type { Database } from "../database/database"
import { LearnerGoalStateGuardTable, LearnerGoalTimeZoneReleaseTable, LearnerGoalTimeZoneTable } from "./sql"
import {
  MAX_AGGREGATE_BYTES,
  MAX_CONDITION_BYTES,
  MAX_CONDITIONS,
  MAX_COURSES,
  MAX_OPERATIONS,
  MAX_OUTCOME_BYTES,
  MAX_SOURCE_EXCERPT_BYTES,
} from "./schema"
import { DATA_SHA256, ENGINE, TIME_ZONE_RELEASE_ID, TZDB_VERSION, supportedNames } from "./time-zone"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const supportedTimeZoneNames = supportedNames()
const supportedTimeZones = supportedTimeZoneNames.map((name) => ({ release_id: TIME_ZONE_RELEASE_ID, name }))
const supportedTimeZoneSQL = supportedTimeZoneNames.map((name) => `'${name.replaceAll("'", "''")}'`).join(", ")

const immutableTables = [
  "learner_goal",
  "learner_goal_effect",
  "learner_goal_revision",
  "learner_goal_condition",
  "learner_goal_course_scope",
  "learner_goal_field_basis",
  "learner_goal_supersession",
  "learner_goal_effect_operation",
  "learner_goal_commit_seal",
  "learner_goal_state_guard",
  "learner_goal_time_zone",
  "learner_goal_time_zone_release",
] as const

export const immutableStatements = immutableTables.flatMap((table) => [
  `CREATE TRIGGER IF NOT EXISTS ${table}_immutable BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS ${table}_delete_forbidden BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_delete_forbidden'); END`,
])

export const statements = [
  `CREATE TRIGGER IF NOT EXISTS learner_goal_time_zone_release_validate_insert
   BEFORE INSERT ON learner_goal_time_zone_release
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_time_zone_release_unsupported')
     WHERE NEW.id <> '${TIME_ZONE_RELEASE_ID}'
        OR NEW.tzdb_version <> '${TZDB_VERSION}'
        OR NEW.engine <> '${ENGINE}'
        OR NEW.data_sha256 <> '${DATA_SHA256}';
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_time_zone_validate_insert
   BEFORE INSERT ON learner_goal_time_zone
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_time_zone_unsupported')
     WHERE NEW.release_id <> '${TIME_ZONE_RELEASE_ID}'
        OR NEW.name IS NULL
        OR NEW.name NOT IN (${supportedTimeZoneSQL});
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_state_validate_insert
   BEFORE INSERT ON learner_goal_state
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_state_initial_invalid')
     WHERE NEW.singleton <> 1
        OR NEW.revision_sequence <> 0;
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_state_validate_update
   BEFORE UPDATE OF singleton, revision_sequence ON learner_goal_state
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_state_transition_invalid')
     WHERE NEW.singleton <> OLD.singleton
        OR NEW.revision_sequence <= OLD.revision_sequence
        OR NOT EXISTS (
          SELECT 1
          FROM learner_goal_effect AS effect
          JOIN learning_command_receipt AS receipt ON receipt.goal_effect_id = effect.id
          JOIN learning_command_invocation AS invocation ON invocation.part_id = receipt.invocation_part_id
          WHERE NOT EXISTS (
              SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = effect.id
            )
            AND invocation.status = 'applied'
            AND invocation.goal_effect_id = effect.id
            AND receipt.invocation_part_id = invocation.part_id
            AND (SELECT count(*) FROM learner_goal_revision WHERE effect_id = effect.id)
                = NEW.revision_sequence - OLD.revision_sequence
            AND (SELECT min(revision_order) FROM learner_goal_revision WHERE effect_id = effect.id)
                = OLD.revision_sequence + 1
            AND (SELECT max(revision_order) FROM learner_goal_revision WHERE effect_id = effect.id)
                = NEW.revision_sequence
        )
        OR (SELECT count(*) FROM learner_goal_effect AS effect
            WHERE NOT EXISTS (
              SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = effect.id
            )) <> 1;
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_state_guard_insert
   AFTER INSERT ON learner_goal_state
   BEGIN
     INSERT OR IGNORE INTO learner_goal_state_guard (singleton) VALUES (NEW.singleton);
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_state_delete_forbidden
   BEFORE DELETE ON learner_goal_state
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_state_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_effect_validate_insert
   BEFORE INSERT ON learner_goal_effect
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_effect_identity_invalid')
      WHERE length(NEW.id) <> 30
         OR substr(NEW.id, 1, 4) <> 'gle_'
         OR substr(NEW.id, 5) GLOB '*[^0-9A-Za-z]*';
     SELECT RAISE(ABORT, 'learner_goal_effect_unsealed_predecessor')
     WHERE EXISTS (
       SELECT 1 FROM learner_goal_effect AS effect
       WHERE NOT EXISTS (
         SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = effect.id
       )
     );
     SELECT RAISE(ABORT, 'learner_goal_effect_source_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learning_admitted_occurrence AS occurrence
       JOIN learning_occurrence_source_order AS allocation ON allocation.sequence = occurrence.source_order
       WHERE occurrence.id = NEW.occurrence_id
         AND occurrence.source_order = NEW.source_order
         AND occurrence.source_temporal_state IN ('resolved', 'unavailable')
         AND allocation.occurrence_id = occurrence.id
         AND allocation.origin_session_id = occurrence.origin_session_id
         AND allocation.origin_message_id = occurrence.origin_message_id
         AND allocation.time_allocated = occurrence.time_admitted
         AND occurrence.time_admitted <= NEW.time_committed
         AND NOT EXISTS (
           SELECT 1 FROM learning_occurrence_tombstone AS tombstone
           WHERE tombstone.occurrence_id = occurrence.id
         )
     );
     SELECT RAISE(ABORT, 'learner_goal_effect_frontier_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_shared_frontier AS frontier
       WHERE frontier.sequence = NEW.frontier_sequence
         AND frontier.time_committed = NEW.frontier_time
         AND NEW.frontier_time = NEW.time_committed
     );
     SELECT RAISE(ABORT, 'learner_goal_effect_authorization_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_command_invocation AS invocation
       WHERE invocation.occurrence_id = NEW.occurrence_id
         AND invocation.command_name = 'update_learner_goals'
         AND invocation.command_version = 1
         AND invocation.capability_identity = 'update_learner_goals'
         AND invocation.capability_version = 1
          AND invocation.authorization_basis = NEW.authorization_basis
          AND invocation.goal_semantic_fingerprint = NEW.semantic_fingerprint
          AND json(invocation.goal_command_snapshot) = json(NEW.command)
         AND invocation.status = 'admitted'
         AND ((NEW.authorization_basis = 'learner_request'
                AND invocation.permission_request_id IS NULL
                AND invocation.goal_confirmation_snapshot IS NULL)
           OR (NEW.authorization_basis = 'learner_acceptance'
                AND invocation.permission_request_id IS NOT NULL
                AND invocation.goal_confirmation_snapshot IS NULL))
     );
     SELECT RAISE(ABORT, 'learner_goal_effect_command_invalid')
     WHERE NOT COALESCE(
       json_type(NEW.command) = 'object'
       AND (SELECT count(*) FROM json_each(NEW.command)) = 1
       AND json_type(NEW.command, '$.operations') = 'array'
       AND json_array_length(NEW.command, '$.operations') = NEW.operation_count
       AND NEW.operation_count BETWEEN 1 AND ${MAX_OPERATIONS}
       AND length(CAST(NEW.command AS BLOB)) <= ${MAX_AGGREGATE_BYTES}
       AND NOT EXISTS (
         SELECT 1 FROM json_each(NEW.command, '$.operations') AS operation
         WHERE CAST(operation.key AS INTEGER) NOT BETWEEN 0 AND ${MAX_OPERATIONS - 1}
            OR json_extract(operation.value, '$.type') NOT IN ('create', 'update', 'replace')
       ),
       0
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_identity_validate_insert
   BEFORE INSERT ON learner_goal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_identity_owner_invalid')
      WHERE length(NEW.id) <> 30
         OR substr(NEW.id, 1, 4) <> 'gol_'
         OR substr(NEW.id, 5) GLOB '*[^0-9A-Za-z]*'
        OR (SELECT count(*) FROM learner_goal_effect AS effect
            WHERE effect.time_committed = NEW.time_created
              AND NOT EXISTS (
                SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = effect.id
              )) <> 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_revision_validate_insert
   BEFORE INSERT ON learner_goal_revision
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_revision_owner_invalid')
      WHERE length(NEW.id) <> 30
         OR substr(NEW.id, 1, 4) <> 'glr_'
         OR substr(NEW.id, 5) GLOB '*[^0-9A-Za-z]*'
        OR NOT EXISTS (
          SELECT 1 FROM learner_goal_effect AS effect
          WHERE effect.id = NEW.effect_id
            AND effect.occurrence_id = NEW.occurrence_id
            AND effect.source_order = NEW.source_order
            AND effect.time_committed = NEW.time_committed
            AND effect.commit_order = NEW.commit_order
            AND effect.frontier_sequence = NEW.frontier_sequence
            AND effect.frontier_time = NEW.frontier_time
            AND NOT EXISTS (
              SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = effect.id
            )
        )
        OR NEW.revision_order <> (
          SELECT state.revision_sequence + count(existing.id) + 1
          FROM learner_goal_state AS state
          LEFT JOIN learner_goal_revision AS existing ON existing.effect_id = NEW.effect_id
          WHERE state.singleton = 1
        );
     SELECT RAISE(ABORT, 'learner_goal_revision_chain_invalid')
     WHERE (NEW.version = 1 AND (
              NEW.predecessor_id IS NOT NULL
              OR NOT EXISTS (
                SELECT 1 FROM learner_goal AS goal
                WHERE goal.id = NEW.goal_id AND goal.time_created = NEW.time_committed
              )
              OR EXISTS (SELECT 1 FROM learner_goal_revision WHERE goal_id = NEW.goal_id)
            ))
        OR (NEW.version > 1 AND NOT EXISTS (
              SELECT 1 FROM learner_goal_revision AS predecessor
              JOIN learner_goal_commit_seal AS seal ON seal.effect_id = predecessor.effect_id
              WHERE predecessor.id = NEW.predecessor_id
                AND predecessor.goal_id = NEW.goal_id
                AND predecessor.version = NEW.version - 1
                AND predecessor.source_order < NEW.source_order
                AND predecessor.time_committed <= NEW.time_committed
                AND NOT EXISTS (
                  SELECT 1 FROM learner_goal_revision AS successor
                  WHERE successor.predecessor_id = predecessor.id
                )
            ));
      SELECT RAISE(ABORT, 'learner_goal_revision_temporal_basis_invalid')
      WHERE NEW.target_normalization_basis = 'source_temporal_context'
       AND (NEW.target_kind <> 'local_date' OR NOT EXISTS (
         SELECT 1 FROM learning_admitted_occurrence AS occurrence
         WHERE occurrence.id = NEW.occurrence_id
           AND occurrence.source_temporal_state = 'resolved'
           AND occurrence.source_timezone = NEW.target_timezone
           AND occurrence.source_utc_offset_minutes IS NOT NULL
        ));
      SELECT RAISE(ABORT, 'learner_goal_revision_instant_offset_invalid')
      WHERE NEW.target_kind = 'instant'
        AND (NEW.target_normalized IS NULL
          OR NEW.target_utc_offset_minutes IS NULL
          OR NEW.target_normalization_basis <> 'explicit_offset'
          OR NEW.target_timezone IS NOT NULL
          OR NEW.target_timezone_release_id IS NOT NULL
          OR CASE
               WHEN upper(substr(NEW.target_normalized, -1)) = 'Z'
                 THEN NEW.target_utc_offset_minutes <> 0
               WHEN substr(NEW.target_normalized, -6, 1) IN ('+', '-')
                 AND substr(NEW.target_normalized, -3, 1) = ':'
                 AND substr(NEW.target_normalized, -5, 2) NOT GLOB '*[^0-9]*'
                 AND substr(NEW.target_normalized, -2, 2) NOT GLOB '*[^0-9]*'
                 THEN NEW.target_utc_offset_minutes <>
                   (CASE substr(NEW.target_normalized, -6, 1) WHEN '+' THEN 1 ELSE -1 END) *
                   (CAST(substr(NEW.target_normalized, -5, 2) AS INTEGER) * 60 +
                    CAST(substr(NEW.target_normalized, -2, 2) AS INTEGER))
               ELSE 1
              END);
      SELECT RAISE(ABORT, 'learner_goal_revision_target_semantics_invalid')
      WHERE (NEW.target_kind = 'instant' AND (
               unixepoch(NEW.target_normalized, 'subsec') IS NULL
               OR round(unixepoch(NEW.target_normalized, 'subsec') * 1000) <> NEW.target_instant
             ))
         OR (NEW.target_kind = 'local_date' AND (
               date(NEW.target_local_date) IS NULL
               OR date(NEW.target_local_date) <> NEW.target_local_date
             ));
      SELECT RAISE(ABORT, 'learner_goal_revision_capacity')
     WHERE length(CAST(NEW.outcome AS BLOB)) > ${MAX_OUTCOME_BYTES};
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_condition_validate_insert
   BEFORE INSERT ON learner_goal_condition
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_condition_owner_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learner_goal_revision AS revision
       WHERE revision.id = NEW.revision_id
         AND NOT EXISTS (
           SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = revision.effect_id
         )
     )
       OR NEW.ordinal <> (SELECT count(*) FROM learner_goal_condition WHERE revision_id = NEW.revision_id)
       OR NEW.ordinal >= ${MAX_CONDITIONS}
       OR length(CAST(NEW.content AS BLOB)) > ${MAX_CONDITION_BYTES}
       OR EXISTS (
            SELECT 1 FROM learner_goal_condition AS condition
            WHERE condition.revision_id = NEW.revision_id
              AND replace(replace(condition.content, char(13) || char(10), char(10)), char(13), char(10)) =
                  replace(replace(NEW.content, char(13) || char(10), char(10)), char(13), char(10))
          );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_course_scope_validate_insert
   BEFORE INSERT ON learner_goal_course_scope
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_course_scope_owner_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learner_goal_revision AS revision
       WHERE revision.id = NEW.revision_id
         AND revision.scope_kind = 'courses'
         AND NOT EXISTS (
           SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = revision.effect_id
         )
     )
       OR (SELECT count(*) FROM learner_goal_course_scope WHERE revision_id = NEW.revision_id) >= ${MAX_COURSES};
     SELECT RAISE(ABORT, 'learner_goal_course_scope_new_basis_invalid')
     WHERE NEW.admission_kind = 'new'
       AND (NOT EXISTS (
              SELECT 1 FROM course AS course
              WHERE course.id = NEW.course_id
                AND course.title = NEW.course_title
                AND course.state_version = NEW.admitted_course_version
                AND course.time_updated = NEW.admitted_course_time_updated
                AND course.withdrawal_reason IS NULL
            )
         OR EXISTS (
              SELECT 1
              FROM learner_goal_revision AS revision
              JOIN learner_goal_course_scope AS predecessor
                ON predecessor.revision_id = revision.predecessor_id
               AND predecessor.course_id = NEW.course_id
              WHERE revision.id = NEW.revision_id
            ));
     SELECT RAISE(ABORT, 'learner_goal_course_scope_carry_basis_invalid')
     WHERE NEW.admission_kind = 'carried'
       AND NOT EXISTS (
         SELECT 1
         FROM learner_goal_revision AS revision
         JOIN learner_goal_course_scope AS predecessor
           ON predecessor.revision_id = revision.predecessor_id
          AND predecessor.course_id = NEW.course_id
         WHERE revision.id = NEW.revision_id
           AND NEW.carried_from_revision_id = revision.predecessor_id
           AND predecessor.course_title = NEW.course_title
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_field_basis_validate_insert
   BEFORE INSERT ON learner_goal_field_basis
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_field_basis_owner_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_goal_revision AS revision
       JOIN learner_goal_effect AS effect ON effect.id = revision.effect_id
       WHERE revision.id = NEW.revision_id
         AND NOT EXISTS (
           SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = effect.id
         )
         AND (NEW.basis_kind <> 'accepted' OR effect.authorization_basis = 'learner_acceptance')
         AND (NEW.basis_kind <> 'carried'
              OR (revision.predecessor_id IS NOT NULL
                  AND NEW.predecessor_revision_id = revision.predecessor_id))
     )
       OR (NEW.source_excerpt IS NOT NULL
           AND length(CAST(NEW.source_excerpt AS BLOB)) > ${MAX_SOURCE_EXCERPT_BYTES});
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_supersession_validate_insert
   BEFORE INSERT ON learner_goal_supersession
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_supersession_owner_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learner_goal_revision AS revision
       WHERE revision.id = NEW.revision_id
         AND revision.goal_id = NEW.source_goal_id
         AND revision.disposition = 'superseded'
         AND NOT EXISTS (
           SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = revision.effect_id
         )
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_effect_operation_validate_insert
   BEFORE INSERT ON learner_goal_effect_operation
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_operation_owner_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learner_goal_effect AS effect
       WHERE effect.id = NEW.effect_id
         AND NOT EXISTS (
           SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = effect.id
         )
     )
       OR NEW.ordinal <> (SELECT count(*) FROM learner_goal_effect_operation WHERE effect_id = NEW.effect_id);
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_receipt_validate_insert
   BEFORE INSERT ON learning_command_receipt
   WHEN NEW.goal_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_receipt_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = effect.occurrence_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE effect.id = NEW.goal_effect_id
         AND effect.occurrence_id = NEW.occurrence_id
         AND effect.time_committed = NEW.time_committed
         AND effect.commit_order = NEW.commit_order
         AND effect.authorization_basis = NEW.authorization_basis
         AND occurrence.origin_session_id = NEW.origin_session_id
         AND occurrence.origin_message_id = NEW.origin_message_id
         AND invocation.status = 'admitted'
         AND invocation.command_name = 'update_learner_goals'
         AND invocation.command_version = 1
         AND invocation.occurrence_id = NEW.occurrence_id
         AND invocation.assistant_message_id = NEW.assistant_message_id
         AND invocation.capability_identity = NEW.capability_identity
         AND invocation.capability_version = NEW.capability_version
         AND invocation.authorization_basis = NEW.authorization_basis
         AND invocation.goal_semantic_fingerprint = effect.semantic_fingerprint
         AND ((NEW.authorization_basis = 'learner_request'
                AND NEW.permission_request_id IS NULL
                AND NEW.confirmation_snapshot IS NULL)
           OR (NEW.authorization_basis = 'learner_acceptance'
                AND NEW.permission_request_id = invocation.permission_request_id
                AND invocation.goal_confirmation_snapshot IS NULL
                AND json_extract(NEW.confirmation_snapshot, '$.semanticFingerprint')
                    = effect.semantic_fingerprint))
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_receipt_immutable
   BEFORE UPDATE ON learning_command_receipt
   WHEN OLD.goal_effect_id IS NOT NULL OR NEW.goal_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_receipt_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_receipt_delete_forbidden
   BEFORE DELETE ON learning_command_receipt
   WHEN OLD.goal_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_receipt_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_invocation_identity_immutable
   BEFORE UPDATE OF part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
                    occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
                     capability_version, authorization_basis, input_fingerprint, goal_semantic_fingerprint,
                     goal_command_snapshot,
                    permission_request_id, time_admitted, turn_id, input_id
   ON learning_command_invocation
   WHEN OLD.command_name = 'update_learner_goals' OR NEW.command_name = 'update_learner_goals'
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_invocation_identity_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_invocation_terminal_immutable
   BEFORE UPDATE ON learning_command_invocation
   WHEN OLD.command_name = 'update_learner_goals' AND OLD.status <> 'admitted'
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_invocation_terminal_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_invocation_admitted_insert_only
   BEFORE INSERT ON learning_command_invocation
   WHEN NEW.command_name = 'update_learner_goals'
     AND (NEW.status <> 'admitted' OR NEW.goal_confirmation_snapshot IS NOT NULL)
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_invocation_admitted_insert_only');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_confirmation_validate_update
   BEFORE UPDATE OF goal_confirmation_snapshot ON learning_command_invocation
   WHEN NEW.command_name = 'update_learner_goals'
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_confirmation_invalid')
     WHERE OLD.status <> 'admitted'
        OR NEW.status <> 'applied'
        OR OLD.authorization_basis <> 'learner_acceptance'
        OR OLD.goal_confirmation_snapshot IS NOT NULL
        OR NEW.goal_confirmation_snapshot IS NULL
        OR NOT COALESCE(
          json_type(NEW.goal_confirmation_snapshot) = 'object'
          AND (SELECT count(*) FROM json_each(NEW.goal_confirmation_snapshot)) = 6
          AND json_extract(NEW.goal_confirmation_snapshot, '$.schemaVersion') = 1
          AND json_extract(NEW.goal_confirmation_snapshot, '$.authorizationBasis') = 'learner_acceptance'
          AND json_extract(NEW.goal_confirmation_snapshot, '$.semanticFingerprint') = NEW.goal_semantic_fingerprint
          AND json_type(NEW.goal_confirmation_snapshot, '$.command.operations') = 'array'
          AND json(json_extract(NEW.goal_confirmation_snapshot, '$.command')) = json(NEW.goal_command_snapshot)
          AND json_array_length(NEW.goal_confirmation_snapshot, '$.command.operations') BETWEEN 1 AND ${MAX_OPERATIONS}
          AND json_type(NEW.goal_confirmation_snapshot, '$.goalBases') = 'array'
          AND json_type(NEW.goal_confirmation_snapshot, '$.courseBases') = 'array'
          AND json_array_length(NEW.goal_confirmation_snapshot, '$.courseBases') <= ${MAX_OPERATIONS * MAX_COURSES * 2}
          AND NEW.goal_effect_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM learning_command_receipt AS receipt
            WHERE receipt.invocation_part_id = NEW.part_id
              AND receipt.goal_effect_id = NEW.goal_effect_id
              AND receipt.permission_request_id = NEW.permission_request_id
              AND receipt.confirmation_snapshot = NEW.goal_confirmation_snapshot
          ),
          0
        );
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_confirmation_basis_validate_update
   BEFORE UPDATE OF goal_confirmation_snapshot ON learning_command_invocation
   WHEN NEW.command_name = 'update_learner_goals'
     AND NEW.authorization_basis = 'learner_acceptance'
     AND NEW.goal_confirmation_snapshot IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_confirmation_goal_basis_invalid')
     WHERE EXISTS (
       WITH expected(goal_id, revision_id, version) AS (
         SELECT
           json_extract(operation.value, '$.goalID'),
           json_extract(operation.value, '$.expectedHeadID'),
           json_extract(operation.value, '$.expectedVersion')
         FROM json_each(NEW.goal_command_snapshot, '$.operations') AS operation
         WHERE json_extract(operation.value, '$.type') IN ('update', 'replace')
         UNION
         SELECT
           json_extract(operation.value, '$.target.goalID'),
           json_extract(operation.value, '$.target.revisionID'),
           json_extract(operation.value, '$.target.version')
         FROM json_each(NEW.goal_command_snapshot, '$.operations') AS operation
         WHERE json_extract(operation.value, '$.type') = 'replace'
           AND json_extract(operation.value, '$.target.type') = 'existing'
       ), supplied AS (
         SELECT basis.value
         FROM json_each(NEW.goal_confirmation_snapshot, '$.goalBases') AS basis
       )
       SELECT 1
       WHERE (SELECT count(*) FROM supplied) <> (SELECT count(*) FROM expected)
          OR EXISTS (
               SELECT 1 FROM supplied
               WHERE (SELECT count(*) FROM json_each(supplied.value)) <> 5
                  OR EXISTS (
                       SELECT 1 FROM json_each(supplied.value) AS member
                       WHERE member.key NOT IN ('goalID', 'revisionID', 'version', 'outcome', 'disposition')
                     )
                  OR length(json_extract(supplied.value, '$.goalID')) <> 30
                  OR substr(json_extract(supplied.value, '$.goalID'), 1, 4) <> 'gol_'
                  OR substr(json_extract(supplied.value, '$.goalID'), 5) GLOB '*[^0-9A-Za-z]*'
                  OR length(json_extract(supplied.value, '$.revisionID')) <> 30
                  OR substr(json_extract(supplied.value, '$.revisionID'), 1, 4) <> 'glr_'
                  OR substr(json_extract(supplied.value, '$.revisionID'), 5) GLOB '*[^0-9A-Za-z]*'
                  OR json_type(supplied.value, '$.version') <> 'integer'
                  OR json_extract(supplied.value, '$.version') < 1
                  OR json_type(supplied.value, '$.outcome') <> 'text'
                  OR json_extract(supplied.value, '$.disposition') NOT IN ('active', 'achieved', 'abandoned', 'superseded')
             )
          OR EXISTS (
               SELECT 1
               FROM expected
               LEFT JOIN learner_goal_revision AS revision
                 ON revision.id = expected.revision_id
                AND revision.goal_id = expected.goal_id
                AND revision.version = expected.version
               WHERE revision.id IS NULL
                  OR NOT EXISTS (
                       SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = revision.effect_id
                     )
                  OR (SELECT count(*) FROM supplied
                      WHERE json_extract(supplied.value, '$.goalID') = expected.goal_id
                        AND json_extract(supplied.value, '$.revisionID') = expected.revision_id
                        AND json_extract(supplied.value, '$.version') = expected.version
                        AND json_extract(supplied.value, '$.outcome') = revision.outcome
                        AND json_extract(supplied.value, '$.disposition') = revision.disposition) <> 1
             )
          OR EXISTS (
               SELECT 1 FROM supplied
               WHERE NOT EXISTS (
                 SELECT 1 FROM expected
                 WHERE expected.goal_id = json_extract(supplied.value, '$.goalID')
                   AND expected.revision_id = json_extract(supplied.value, '$.revisionID')
                   AND expected.version = json_extract(supplied.value, '$.version')
               )
             )
     );
     SELECT RAISE(ABORT, 'learner_goal_confirmation_course_basis_invalid')
     WHERE EXISTS (
       WITH snapshots(operation_ordinal, revision_role, snapshot) AS (
         SELECT CAST(operation.key AS INTEGER), 'source', json_extract(operation.value, '$.snapshot')
         FROM json_each(NEW.goal_command_snapshot, '$.operations') AS operation
         UNION ALL
         SELECT CAST(operation.key AS INTEGER), 'target', json_extract(operation.value, '$.target.snapshot')
         FROM json_each(NEW.goal_command_snapshot, '$.operations') AS operation
         WHERE json_extract(operation.value, '$.type') = 'replace'
           AND json_extract(operation.value, '$.target.type') = 'new'
       ), expected(operation_ordinal, revision_role, course_id, basis) AS (
         SELECT snapshots.operation_ordinal, snapshots.revision_role,
                json_extract(course.value, '$.courseID'), json_extract(course.value, '$.basis')
         FROM snapshots
         JOIN json_each(snapshots.snapshot, '$.scope.courses') AS course
       ), supplied AS (
         SELECT basis.value
         FROM json_each(NEW.goal_confirmation_snapshot, '$.courseBases') AS basis
       )
       SELECT 1
       WHERE (SELECT count(*) FROM supplied) <> (SELECT count(*) FROM expected)
          OR EXISTS (
               SELECT 1 FROM supplied
               WHERE (SELECT count(*) FROM json_each(supplied.value)) <> 6
                  OR EXISTS (
                       SELECT 1 FROM json_each(supplied.value) AS member
                       WHERE member.key NOT IN (
                         'operationOrdinal', 'revisionRole', 'courseID', 'courseTitle', 'admission', 'availability'
                       )
                     )
                  OR json_type(supplied.value, '$.operationOrdinal') <> 'integer'
                  OR json_extract(supplied.value, '$.operationOrdinal') NOT BETWEEN 0 AND ${MAX_OPERATIONS - 1}
                  OR json_extract(supplied.value, '$.revisionRole') NOT IN ('source', 'target')
                  OR json_type(supplied.value, '$.courseID') <> 'text'
                  OR json_type(supplied.value, '$.courseTitle') <> 'text'
                  OR (SELECT count(*) FROM json_each(supplied.value, '$.admission')) <>
                     CASE json_extract(supplied.value, '$.admission.type') WHEN 'new' THEN 3 WHEN 'carried' THEN 2 ELSE -1 END
                  OR EXISTS (
                       SELECT 1 FROM json_each(supplied.value, '$.admission') AS member
                       WHERE member.key NOT IN ('type', 'courseVersion', 'courseTimeUpdated', 'predecessorRevisionID')
                     )
                  OR (SELECT count(*) FROM json_each(supplied.value, '$.availability')) <>
                     CASE json_extract(supplied.value, '$.availability.state')
                       WHEN 'available' THEN 4
                       WHEN 'unavailable' THEN CASE
                         WHEN json_extract(supplied.value, '$.availability.cause') = 'course_not_found' THEN 2
                         WHEN json_extract(supplied.value, '$.availability.cause') = 'course_withdrawn' THEN 5
                         ELSE -1 END
                       ELSE -1 END
                  OR EXISTS (
                       SELECT 1 FROM json_each(supplied.value, '$.availability') AS member
                       WHERE member.key NOT IN ('state', 'title', 'cause', 'courseVersion', 'courseTimeUpdated')
                     )
                  OR (json_extract(supplied.value, '$.availability.state') = 'available'
                      AND (json_type(supplied.value, '$.availability.title') <> 'text'
                        OR length(trim(json_extract(supplied.value, '$.availability.title'))) = 0
                        OR json_type(supplied.value, '$.availability.courseVersion') <> 'integer'
                        OR json_extract(supplied.value, '$.availability.courseVersion') < 0
                        OR json_type(supplied.value, '$.availability.courseTimeUpdated') <> 'integer'
                        OR json_extract(supplied.value, '$.availability.courseTimeUpdated') < 0))
                  OR (json_extract(supplied.value, '$.availability.state') = 'unavailable' AND (
                       json_extract(supplied.value, '$.availability.cause') NOT IN ('course_not_found', 'course_withdrawn')
                       OR (json_extract(supplied.value, '$.availability.cause') = 'course_withdrawn' AND (
                            json_type(supplied.value, '$.availability.title') <> 'text'
                            OR length(trim(json_extract(supplied.value, '$.availability.title'))) = 0
                            OR json_type(supplied.value, '$.availability.courseVersion') <> 'integer'
                            OR json_extract(supplied.value, '$.availability.courseVersion') < 0
                            OR json_type(supplied.value, '$.availability.courseTimeUpdated') <> 'integer'
                            OR json_extract(supplied.value, '$.availability.courseTimeUpdated') < 0
                          ))
                     ))
             )
          OR EXISTS (
               SELECT 1 FROM expected
               WHERE (SELECT count(*) FROM supplied
                      WHERE json_extract(supplied.value, '$.operationOrdinal') = expected.operation_ordinal
                        AND json_extract(supplied.value, '$.revisionRole') = expected.revision_role
                        AND json_extract(supplied.value, '$.courseID') = expected.course_id
                          AND ((json_extract(expected.basis, '$.type') = 'new'
                              AND json_extract(supplied.value, '$.admission.type') = 'new'
                              AND json_extract(supplied.value, '$.availability.state') = 'available'
                              AND json_extract(supplied.value, '$.availability.courseVersion') =
                                  json_extract(supplied.value, '$.admission.courseVersion')
                              AND json_extract(supplied.value, '$.availability.courseTimeUpdated') =
                                  json_extract(supplied.value, '$.admission.courseTimeUpdated')
                              AND json_extract(supplied.value, '$.admission.courseVersion') =
                                  json_extract(expected.basis, '$.expectedCourseVersion')
                              AND EXISTS (
                                SELECT 1 FROM course
                                WHERE course.id = expected.course_id
                                  AND course.title = json_extract(supplied.value, '$.courseTitle')
                                  AND course.title = json_extract(supplied.value, '$.availability.title')
                                  AND course.state_version = json_extract(supplied.value, '$.admission.courseVersion')
                                  AND course.time_updated = json_extract(supplied.value, '$.admission.courseTimeUpdated')
                                  AND course.withdrawal_reason IS NULL
                              ))
                          OR (json_extract(expected.basis, '$.type') = 'carried'
                              AND json_extract(supplied.value, '$.admission.type') = 'carried'
                              AND json_extract(supplied.value, '$.admission.predecessorRevisionID') =
                                  json_extract(expected.basis, '$.predecessorRevisionID')
                              AND EXISTS (
                                SELECT 1 FROM learner_goal_course_scope AS predecessor
                                WHERE predecessor.revision_id = json_extract(expected.basis, '$.predecessorRevisionID')
                                  AND predecessor.course_id = expected.course_id
                                  AND predecessor.course_title = json_extract(supplied.value, '$.courseTitle')
                              )
                              AND (
                                EXISTS (
                                  SELECT 1 FROM course_state_history AS history
                                  WHERE history.course_id = expected.course_id
                                    AND history.title = json_extract(supplied.value, '$.availability.title')
                                    AND history.version = json_extract(supplied.value, '$.availability.courseVersion')
                                    AND history.time_updated =
                                        json_extract(supplied.value, '$.availability.courseTimeUpdated')
                                    AND ((history.withdrawal_reason IS NULL
                                          AND json_extract(supplied.value, '$.availability.state') = 'available')
                                      OR (history.withdrawal_reason = 'removed'
                                          AND json_extract(supplied.value, '$.availability.state') = 'unavailable'
                                          AND json_extract(supplied.value, '$.availability.cause') = 'course_withdrawn'))
                                )
                                OR (
                                  NOT EXISTS (SELECT 1 FROM course WHERE course.id = expected.course_id)
                                  AND json_extract(supplied.value, '$.availability.state') = 'unavailable'
                                  AND json_extract(supplied.value, '$.availability.cause') = 'course_not_found'
                                  AND json_type(supplied.value, '$.availability.title') IS NULL
                                )
                              )))) <> 1
             )
          OR EXISTS (
               SELECT 1 FROM supplied
               WHERE NOT EXISTS (
                 SELECT 1 FROM expected
                 WHERE expected.operation_ordinal = json_extract(supplied.value, '$.operationOrdinal')
                   AND expected.revision_role = json_extract(supplied.value, '$.revisionRole')
                   AND expected.course_id = json_extract(supplied.value, '$.courseID')
               )
             )
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_invocation_validate_settlement
   BEFORE UPDATE OF status, settlement, time_settled, settlement_order, goal_effect_id
   ON learning_command_invocation
   WHEN NEW.command_name = 'update_learner_goals' AND NEW.status <> 'admitted'
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_invocation_settlement_invalid')
     WHERE OLD.status <> 'admitted'
        OR NOT COALESCE(
          json_valid(NEW.settlement)
          AND json_extract(NEW.settlement, '$.outcome') = NEW.status
          AND json_extract(NEW.settlement, '$.settlementTime') = NEW.time_settled
          AND json_extract(NEW.settlement, '$.settlementOrder') = NEW.settlement_order
          AND (
            (NEW.status IN ('applied', 'already_applied')
              AND json_extract(NEW.settlement, '$.goalKind') = 'learner_goal'
              AND json_extract(NEW.settlement, '$.effectID') = NEW.goal_effect_id
              AND json_type(NEW.settlement, '$.operations') = 'array'
              AND json_type(NEW.settlement, '$.acknowledgementTitle') = 'text'
              AND json_type(NEW.settlement, '$.acknowledgementBody') = 'text')
            OR (NEW.status = 'no_change'
              AND NEW.goal_effect_id IS NULL
              AND json_extract(NEW.settlement, '$.goalKind') = 'learner_goal'
              AND json_type(NEW.settlement, '$.operations') = 'array')
            OR (NEW.status = 'error'
              AND NEW.goal_effect_id IS NULL
              AND json_type(NEW.settlement, '$.code') = 'text')
          ),
          0
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_validate_insert
   BEFORE INSERT ON learner_goal_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_owner_invalid')
     WHERE (SELECT count(*) FROM learner_goal_effect AS effect
            WHERE NOT EXISTS (
              SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = effect.id
            )) <> 1
        OR NOT EXISTS (
          SELECT 1
          FROM learner_goal_effect AS effect
          JOIN learner_goal_state AS state ON state.singleton = 1
          JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
          JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
          WHERE effect.id = NEW.effect_id
            AND effect.commit_seal_id = effect.id
            AND receipt.goal_effect_id = effect.id
            AND receipt.invocation_part_id = invocation.part_id
            AND receipt.occurrence_id = effect.occurrence_id
            AND receipt.authorization_basis = effect.authorization_basis
            AND receipt.time_committed = effect.time_committed
            AND receipt.commit_order = effect.commit_order
            AND invocation.status = 'applied'
            AND invocation.goal_effect_id = effect.id
            AND invocation.goal_semantic_fingerprint = effect.semantic_fingerprint
            AND json(invocation.goal_command_snapshot) = json(effect.command)
            AND invocation.authorization_basis = effect.authorization_basis
            AND json_extract(invocation.settlement, '$.receiptID') = receipt.id
            AND json_extract(invocation.settlement, '$.effectID') = effect.id
             AND json_extract(invocation.settlement, '$.authorizationBasis') = effect.authorization_basis
             AND json_extract(invocation.settlement, '$.frontierSequence') = effect.frontier_sequence
             AND json_extract(invocation.settlement, '$.settlementTime') = effect.time_committed
             AND json_extract(invocation.settlement, '$.settlementOrder') = effect.commit_order
             AND json_extract(invocation.settlement, '$.acknowledgementTitle') = effect.acknowledgement_title
             AND json_extract(invocation.settlement, '$.acknowledgementBody') = effect.acknowledgement_body
             AND json_array_length(invocation.settlement, '$.operations') = effect.operation_count
             AND NOT EXISTS (
               SELECT 1
               FROM json_each(invocation.settlement, '$.operations') AS settled
               LEFT JOIN learner_goal_effect_operation AS operation
                 ON operation.effect_id = effect.id AND operation.ordinal = CAST(settled.key AS INTEGER)
               WHERE operation.effect_id IS NULL
                  OR json_extract(settled.value, '$.ordinal') IS NOT operation.ordinal
                  OR json_extract(settled.value, '$.operation') IS NOT operation.operation_kind
                  OR json_extract(settled.value, '$.result') IS NOT operation.result_kind
                  OR json_extract(settled.value, '$.goalID') IS NOT operation.goal_id
                  OR json_extract(settled.value, '$.revisionID') IS NOT operation.revision_id
                  OR json_extract(settled.value, '$.version') IS NOT operation.version
                  OR json_extract(settled.value, '$.disposition') IS NOT operation.disposition
                  OR json(json_extract(settled.value, '$.meaning')) <> json(operation.meaning)
                  OR json_extract(settled.value, '$.replacementTarget.type') IS NOT operation.replacement_target_kind
                  OR json_extract(settled.value, '$.replacementTarget.goalID') IS NOT operation.replacement_target_goal_id
                  OR json_extract(settled.value, '$.replacementTarget.revisionID') IS NOT operation.replacement_target_revision_id
                  OR json_extract(settled.value, '$.replacementTarget.version') IS NOT operation.replacement_target_version
             )
             AND state.revision_sequence = (SELECT max(revision_order) FROM learner_goal_revision)
            AND ((effect.authorization_basis = 'learner_request'
                   AND receipt.permission_request_id IS NULL
                   AND receipt.confirmation_snapshot IS NULL
                   AND invocation.goal_confirmation_snapshot IS NULL)
              OR (effect.authorization_basis = 'learner_acceptance'
                   AND receipt.permission_request_id = invocation.permission_request_id
                   AND receipt.confirmation_snapshot = invocation.goal_confirmation_snapshot
                   AND json_extract(receipt.confirmation_snapshot, '$.semanticFingerprint')
                       = effect.semantic_fingerprint
                   AND json(json_extract(receipt.confirmation_snapshot, '$.command')) = json(effect.command)
                   AND json_extract(invocation.settlement, '$.confirmationRequestID')
                       = invocation.permission_request_id))
        );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_batch_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learner_goal_effect AS effect
       WHERE effect.id = NEW.effect_id
         AND (SELECT count(*) FROM learner_goal_effect_operation WHERE effect_id = effect.id)
             = effect.operation_count
         AND (SELECT count(*) FROM learner_goal_effect_operation
              WHERE effect_id = effect.id AND result_kind = 'changed') = effect.change_count
         AND NOT EXISTS (
           SELECT 1 FROM learner_goal_effect_operation AS operation
           WHERE operation.effect_id = effect.id
             AND (operation.ordinal < 0
               OR operation.ordinal >= effect.operation_count
               OR json_extract(effect.command, '$.operations[' || operation.ordinal || '].type')
                    <> operation.operation_kind)
         )
         AND NOT EXISTS (
           SELECT 1 FROM learner_goal_revision AS revision
           WHERE revision.effect_id = effect.id
             AND NOT EXISTS (
               SELECT 1 FROM learner_goal_effect_operation AS operation
               WHERE operation.effect_id = effect.id
                 AND operation.ordinal = revision.operation_ordinal
                 AND ((revision.revision_role = 'source'
                       AND operation.result_kind = 'changed'
                       AND operation.goal_id = revision.goal_id
                       AND operation.revision_id = revision.id
                       AND operation.version = revision.version
                       AND operation.disposition = revision.disposition)
                   OR (revision.revision_role = 'target'
                       AND operation.operation_kind = 'replace'
                       AND operation.replacement_target_kind = 'new'
                       AND operation.replacement_target_goal_id = revision.goal_id
                       AND operation.replacement_target_revision_id = revision.id
                       AND operation.replacement_target_version = revision.version))
             )
         )
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_semantic_validate
   BEFORE INSERT ON learner_goal_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_revision_incomplete')
     WHERE EXISTS (
       SELECT 1 FROM learner_goal_revision AS revision
       WHERE revision.effect_id = NEW.effect_id
         AND ((SELECT count(*) FROM learner_goal_field_basis AS basis
               WHERE basis.revision_id = revision.id) <> 5
           OR (revision.scope_kind = 'learner_home' AND EXISTS (
                 SELECT 1 FROM learner_goal_course_scope AS scope WHERE scope.revision_id = revision.id
              ))
           OR (revision.scope_kind = 'courses' AND (SELECT count(*) FROM learner_goal_course_scope AS scope
                 WHERE scope.revision_id = revision.id) NOT BETWEEN 1 AND ${MAX_COURSES})
           OR (revision.disposition = 'superseded' AND (SELECT count(*) FROM learner_goal_supersession AS relation
                 WHERE relation.revision_id = revision.id) <> 1)
           OR (revision.disposition <> 'superseded' AND EXISTS (
                 SELECT 1 FROM learner_goal_supersession AS relation WHERE relation.revision_id = revision.id
              ))
           OR (SELECT count(*) FROM learner_goal_condition AS condition
               WHERE condition.revision_id = revision.id) > ${MAX_CONDITIONS}
            OR EXISTS (
                 SELECT 1 FROM learner_goal_condition AS condition
                 WHERE condition.revision_id = revision.id
                   AND condition.ordinal >= (SELECT count(*) FROM learner_goal_condition
                                              WHERE revision_id = revision.id)
               )
            OR EXISTS (
                 SELECT 1
                 FROM learner_goal_condition AS left_condition
                 JOIN learner_goal_condition AS right_condition
                   ON right_condition.revision_id = left_condition.revision_id
                  AND right_condition.ordinal > left_condition.ordinal
                 WHERE left_condition.revision_id = revision.id
                   AND replace(replace(left_condition.content, char(13) || char(10), char(10)), char(13), char(10)) =
                       replace(replace(right_condition.content, char(13) || char(10), char(10)), char(13), char(10))
               )
            OR (revision.target_kind = 'instant' AND (
                 unixepoch(revision.target_normalized, 'subsec') IS NULL
                 OR round(unixepoch(revision.target_normalized, 'subsec') * 1000) <> revision.target_instant
               ))
            OR (revision.target_kind = 'local_date' AND (
                 date(revision.target_local_date) IS NULL
                 OR date(revision.target_local_date) <> revision.target_local_date
               ))
            OR (revision.target_timezone IS NOT NULL AND NOT EXISTS (
                 SELECT 1 FROM learner_goal_time_zone AS zone
                 WHERE zone.release_id = revision.target_timezone_release_id
                   AND zone.name = revision.target_timezone
               )))
      );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_operation_incomplete')
     WHERE EXISTS (
       SELECT 1 FROM learner_goal_effect_operation AS operation
       WHERE operation.effect_id = NEW.effect_id
         AND ((operation.result_kind = 'changed' AND NOT EXISTS (
                SELECT 1 FROM learner_goal_revision AS revision
                WHERE revision.effect_id = operation.effect_id
                  AND revision.operation_ordinal = operation.ordinal
                  AND revision.revision_role = 'source'
                  AND revision.id = operation.revision_id
                  AND revision.goal_id = operation.goal_id
                  AND revision.version = operation.version
              ))
           OR (operation.result_kind = 'no_change' AND (
                EXISTS (SELECT 1 FROM learner_goal_revision AS revision
                        WHERE revision.effect_id = operation.effect_id
                          AND revision.operation_ordinal = operation.ordinal)
                OR NOT EXISTS (
                  SELECT 1 FROM learner_goal_revision AS revision
                  JOIN learner_goal_commit_seal AS seal ON seal.effect_id = revision.effect_id
                  WHERE revision.id = operation.revision_id
                    AND revision.goal_id = operation.goal_id
                    AND revision.version = operation.version
                    AND revision.disposition = operation.disposition
                    AND NOT EXISTS (
                      SELECT 1 FROM learner_goal_revision AS successor
                      WHERE successor.predecessor_id = revision.id
                    )
                )
              ))
           OR (operation.operation_kind = 'create' AND (operation.version <> 1
                OR operation.disposition = 'superseded'))
           OR (operation.operation_kind = 'update' AND operation.replacement_target_kind IS NOT NULL)
           OR (operation.operation_kind = 'update' AND operation.disposition = 'superseded' AND NOT EXISTS (
                SELECT 1
                FROM learner_goal_revision AS source
                JOIN learner_goal_revision AS predecessor ON predecessor.id = source.predecessor_id
                JOIN learner_goal_supersession AS old_relation ON old_relation.revision_id = predecessor.id
                JOIN learner_goal_supersession AS new_relation ON new_relation.revision_id = source.id
                WHERE source.id = operation.revision_id
                  AND predecessor.disposition = 'superseded'
                  AND old_relation.target_goal_id = new_relation.target_goal_id
                  AND old_relation.target_revision_id = new_relation.target_revision_id
              ))
           OR (operation.operation_kind = 'replace' AND NOT EXISTS (
                SELECT 1 FROM learner_goal_revision AS source
                JOIN learner_goal_supersession AS relation ON relation.revision_id = source.id
                JOIN learner_goal_field_basis AS basis
                  ON basis.revision_id = source.id AND basis.field = 'disposition'
                WHERE source.id = operation.revision_id
                  AND source.disposition = 'superseded'
                  AND basis.basis_kind <> 'carried'
                  AND relation.target_goal_id = operation.replacement_target_goal_id
                  AND relation.target_revision_id = operation.replacement_target_revision_id
              ))
           OR (operation.replacement_target_kind = 'new' AND NOT EXISTS (
                SELECT 1 FROM learner_goal_revision AS target
                WHERE target.id = operation.replacement_target_revision_id
                  AND target.goal_id = operation.replacement_target_goal_id
                  AND target.version = 1
                  AND target.effect_id = operation.effect_id
                  AND target.operation_ordinal = operation.ordinal
                  AND target.revision_role = 'target'
                  AND target.disposition <> 'superseded'
              ))
           OR (operation.replacement_target_kind = 'existing' AND NOT EXISTS (
                SELECT 1 FROM learner_goal_revision AS target
                JOIN learner_goal_commit_seal AS seal ON seal.effect_id = target.effect_id
                WHERE target.id = operation.replacement_target_revision_id
                  AND target.goal_id = operation.replacement_target_goal_id
                  AND target.version = operation.replacement_target_version
                  AND target.goal_id <> operation.goal_id
                  AND (NOT EXISTS (
                        SELECT 1 FROM learner_goal_revision AS successor
                        WHERE successor.predecessor_id = target.id
                      ) OR EXISTS (
                        SELECT 1 FROM learner_goal_revision AS successor
                        WHERE successor.predecessor_id = target.id
                          AND successor.effect_id = operation.effect_id
                      ))
              )))
     );
      SELECT RAISE(ABORT, 'learner_goal_commit_seal_identity_incomplete')
     WHERE EXISTS (
       SELECT 1 FROM learner_goal AS goal
       WHERE NOT EXISTS (
         SELECT 1 FROM learner_goal_revision AS initial
         WHERE initial.goal_id = goal.id AND initial.version = 1
           AND (initial.effect_id = NEW.effect_id OR EXISTS (
             SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = initial.effect_id
           ))
       )
     )
       OR EXISTS (
         SELECT 1 FROM learner_goal_revision AS revision
         WHERE revision.effect_id <> NEW.effect_id
           AND NOT EXISTS (
             SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = revision.effect_id
           )
        );
      SELECT RAISE(ABORT, 'learner_goal_commit_seal_identity_format_invalid')
      WHERE EXISTS (
        SELECT 1 FROM learner_goal_effect AS effect
        WHERE effect.id = NEW.effect_id
          AND (length(effect.id) <> 30
            OR substr(effect.id, 1, 4) <> 'gle_'
            OR substr(effect.id, 5) GLOB '*[^0-9A-Za-z]*')
      )
        OR EXISTS (
          SELECT 1 FROM learner_goal_revision AS revision
          WHERE revision.effect_id = NEW.effect_id
            AND (length(revision.id) <> 30
              OR substr(revision.id, 1, 4) <> 'glr_'
              OR substr(revision.id, 5) GLOB '*[^0-9A-Za-z]*'
              OR length(revision.goal_id) <> 30
              OR substr(revision.goal_id, 1, 4) <> 'gol_'
              OR substr(revision.goal_id, 5) GLOB '*[^0-9A-Za-z]*')
        )
        OR EXISTS (
          SELECT 1 FROM learner_goal_effect_operation AS operation
          WHERE operation.effect_id = NEW.effect_id
            AND (length(operation.goal_id) <> 30
              OR substr(operation.goal_id, 1, 4) <> 'gol_'
              OR substr(operation.goal_id, 5) GLOB '*[^0-9A-Za-z]*'
              OR length(operation.revision_id) <> 30
              OR substr(operation.revision_id, 1, 4) <> 'glr_'
              OR substr(operation.revision_id, 5) GLOB '*[^0-9A-Za-z]*'
              OR (operation.replacement_target_goal_id IS NOT NULL AND (
                   length(operation.replacement_target_goal_id) <> 30
                   OR substr(operation.replacement_target_goal_id, 1, 4) <> 'gol_'
                   OR substr(operation.replacement_target_goal_id, 5) GLOB '*[^0-9A-Za-z]*'))
              OR (operation.replacement_target_revision_id IS NOT NULL AND (
                   length(operation.replacement_target_revision_id) <> 30
                   OR substr(operation.replacement_target_revision_id, 1, 4) <> 'glr_'
                   OR substr(operation.replacement_target_revision_id, 5) GLOB '*[^0-9A-Za-z]*')))
        );
      SELECT RAISE(ABORT, 'learner_goal_commit_seal_meaning_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect_operation AS operation
       JOIN learner_goal_revision AS revision ON revision.id = operation.revision_id
       WHERE operation.effect_id = NEW.effect_id
          AND ((SELECT count(*) FROM json_each(operation.meaning)) <> 4
            OR EXISTS (
                 SELECT 1 FROM json_each(operation.meaning) AS member
                 WHERE member.key NOT IN ('outcome', 'conditions', 'scope', 'target')
               )
            OR json_type(operation.meaning, '$.outcome') <> 'text'
            OR json_type(operation.meaning, '$.conditions') <> 'array'
            OR json_type(operation.meaning, '$.scope') <> 'object'
            OR (SELECT count(*) FROM json_each(operation.meaning, '$.scope')) <>
               CASE json_extract(operation.meaning, '$.scope.type')
                 WHEN 'learner_home' THEN 1 WHEN 'courses' THEN 2 ELSE -1 END
            OR EXISTS (
                 SELECT 1 FROM json_each(operation.meaning, '$.scope') AS member
                 WHERE member.key NOT IN ('type', 'courseIDs')
               )
            OR (json_extract(operation.meaning, '$.scope.type') = 'courses'
                AND json_type(operation.meaning, '$.scope.courseIDs') <> 'array')
            OR json_type(operation.meaning, '$.target') <> 'object'
            OR (SELECT count(*) FROM json_each(operation.meaning, '$.target')) <>
               CASE json_extract(operation.meaning, '$.target.type')
                 WHEN 'absent' THEN 1
                 WHEN 'local_date' THEN 5
                 WHEN 'instant' THEN 6
                 ELSE -1 END
            OR EXISTS (
                 SELECT 1 FROM json_each(operation.meaning, '$.target') AS member
                 WHERE member.key NOT IN (
                   'type', 'instant', 'date', 'timeZone', 'sourceExpression', 'normalized',
                   'utcOffsetMinutes', 'normalizationBasis'
                 )
               )
            OR json_extract(operation.meaning, '$.outcome') <> revision.outcome
           OR json_extract(operation.meaning, '$.scope.type') <> revision.scope_kind
           OR json_extract(operation.meaning, '$.target.type') <> revision.target_kind
           OR operation.disposition <> revision.disposition
           OR json_array_length(operation.meaning, '$.conditions') <>
                (SELECT count(*) FROM learner_goal_condition WHERE revision_id = revision.id)
           OR EXISTS (
                SELECT 1 FROM learner_goal_condition AS condition
                WHERE condition.revision_id = revision.id
                  AND json_extract(operation.meaning, '$.conditions[' || condition.ordinal || ']')
                      <> condition.content
              )
           OR (revision.scope_kind = 'learner_home'
               AND json_type(operation.meaning, '$.scope.courseIDs') IS NOT NULL)
           OR (revision.scope_kind = 'courses' AND (
                json_type(operation.meaning, '$.scope.courseIDs') <> 'array'
                OR json_array_length(operation.meaning, '$.scope.courseIDs') <>
                    (SELECT count(*) FROM learner_goal_course_scope WHERE revision_id = revision.id)
                OR EXISTS (
                  SELECT 1 FROM json_each(operation.meaning, '$.scope.courseIDs') AS item
                  WHERE NOT EXISTS (
                    SELECT 1 FROM learner_goal_course_scope AS scope
                    WHERE scope.revision_id = revision.id
                      AND scope.course_id = item.value
                  )
                )
              ))
           OR (revision.target_kind = 'instant' AND (
                json_extract(operation.meaning, '$.target.instant') IS NOT revision.target_instant
                OR json_extract(operation.meaning, '$.target.timeZone') IS NOT revision.target_timezone
                OR json_extract(operation.meaning, '$.target.utcOffsetMinutes') IS NOT revision.target_utc_offset_minutes
                OR json_extract(operation.meaning, '$.target.sourceExpression') IS NOT revision.target_source_expression
                OR json_extract(operation.meaning, '$.target.normalized') IS NOT revision.target_normalized
                OR json_extract(operation.meaning, '$.target.normalizationBasis') IS NOT revision.target_normalization_basis
              ))
           OR (revision.target_kind = 'local_date' AND (
                json_extract(operation.meaning, '$.target.date') IS NOT revision.target_local_date
                OR json_extract(operation.meaning, '$.target.timeZone') IS NOT revision.target_timezone
                OR json_extract(operation.meaning, '$.target.sourceExpression') IS NOT revision.target_source_expression
                OR json_extract(operation.meaning, '$.target.normalizationBasis') IS NOT revision.target_normalization_basis
              )))
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_acknowledgement_validate
   BEFORE INSERT ON learner_goal_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_acknowledgement_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       WHERE effect.id = NEW.effect_id
         AND (effect.acknowledgement_title <>
              CASE effect.change_count WHEN 1 THEN 'Updated learning Goal' ELSE 'Updated learning Goals' END
           OR effect.acknowledgement_body <>
              (SELECT group_concat(summary, '. ') FROM (
                 SELECT '#' || (operation.ordinal + 1) || ' ' || operation.result_kind || ': “' ||
                   replace(json_extract(operation.meaning, '$.outcome'), char(10), ' ⏎ ') || '”' ||
                   COALESCE(
                     (SELECT '; conditions: ' || group_concat(
                        '“' || replace(condition.value, char(10), ' ⏎ ') || '”', ', '
                      ) FROM json_each(operation.meaning, '$.conditions') AS condition),
                     '; no attainment conditions'
                   ) || '; ' ||
                   CASE json_extract(operation.meaning, '$.scope.type')
                     WHEN 'learner_home' THEN 'LearnerHome-wide'
                     ELSE 'Courses ' || (SELECT group_concat(course.value, ', ')
                       FROM json_each(operation.meaning, '$.scope.courseIDs') AS course)
                   END || '; ' ||
                   CASE json_extract(operation.meaning, '$.target.type')
                     WHEN 'absent' THEN 'no target'
                     WHEN 'instant' THEN 'target ' || json_extract(operation.meaning, '$.target.normalized')
                     ELSE 'target ' || json_extract(operation.meaning, '$.target.date') || ' (' ||
                       json_extract(operation.meaning, '$.target.timeZone') || ')'
                   END || '; ' || operation.disposition || ' (Goal ' || operation.goal_id ||
                   ', v' || operation.version || ')' ||
                   CASE WHEN operation.operation_kind = 'replace'
                     THEN '; replaced by ' || operation.replacement_target_goal_id ||
                       ' at v' || operation.replacement_target_version
                     ELSE '' END AS summary
                 FROM learner_goal_effect_operation AS operation
                 WHERE operation.effect_id = effect.id
                 ORDER BY operation.ordinal
              )) || '.' ||
              CASE WHEN effect.operation_count > effect.change_count
                THEN ' ' || (effect.operation_count - effect.change_count) || ' requested item' ||
                  CASE WHEN effect.operation_count - effect.change_count = 1
                    THEN ' was' ELSE 's were' END || ' unchanged.'
                ELSE '' END ||
              ' You can correct any stored Goal with a later explicit request.')
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_command_validate
   BEFORE INSERT ON learner_goal_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_command_shape_invalid')
     WHERE EXISTS (
       SELECT 1 FROM learner_goal_effect AS effect
       WHERE effect.id = NEW.effect_id
         AND ((SELECT count(*) FROM json_each(effect.command)) <> 1
           OR EXISTS (SELECT 1 FROM json_each(effect.command) AS root WHERE root.key <> 'operations')
           OR json_type(effect.command, '$.operations') <> 'array'
           OR EXISTS (
                SELECT 1 FROM json_each(effect.command, '$.operations') AS command_operation
                WHERE (SELECT count(*) FROM json_each(command_operation.value)) <>
                      CASE json_extract(command_operation.value, '$.type')
                        WHEN 'create' THEN 3 WHEN 'update' THEN 6 WHEN 'replace' THEN 6 ELSE -1 END
                  OR EXISTS (
                       SELECT 1 FROM json_each(command_operation.value) AS member
                       WHERE member.key NOT IN (
                         'type', 'snapshot', 'disposition', 'goalID', 'expectedHeadID', 'expectedVersion', 'target'
                       )
                     )
                  OR (SELECT count(*) FROM json_each(command_operation.value, '$.snapshot')) <> 5
                  OR EXISTS (
                       SELECT 1 FROM json_each(command_operation.value, '$.snapshot') AS member
                       WHERE member.key NOT IN ('outcome', 'conditions', 'scope', 'target', 'fieldBases')
                     )
                  OR (SELECT count(*) FROM json_each(command_operation.value, '$.snapshot.fieldBases')) <> 5
                  OR EXISTS (
                       SELECT 1 FROM json_each(command_operation.value, '$.snapshot.fieldBases') AS field
                       WHERE field.key NOT IN ('outcome', 'conditions', 'scope', 'target', 'disposition')
                          OR (SELECT count(*) FROM json_each(field.value)) <>
                             CASE json_extract(field.value, '$.type')
                               WHEN 'authored' THEN 2 WHEN 'accepted' THEN 1 WHEN 'carried' THEN 2 ELSE -1 END
                          OR EXISTS (
                               SELECT 1 FROM json_each(field.value) AS member
                               WHERE member.key NOT IN ('type', 'sourceExcerpt', 'predecessorRevisionID')
                             )
                     )
                  OR (SELECT count(*) FROM json_each(command_operation.value, '$.snapshot.scope')) <>
                     CASE json_extract(command_operation.value, '$.snapshot.scope.type')
                       WHEN 'learner_home' THEN 1 WHEN 'courses' THEN 2 ELSE -1 END
                  OR EXISTS (
                       SELECT 1 FROM json_each(command_operation.value, '$.snapshot.scope') AS member
                       WHERE member.key NOT IN ('type', 'courses')
                     )
                  OR EXISTS (
                       SELECT 1 FROM json_each(command_operation.value, '$.snapshot.scope.courses') AS course
                       WHERE (SELECT count(*) FROM json_each(course.value)) <> 2
                          OR EXISTS (
                               SELECT 1 FROM json_each(course.value) AS member
                               WHERE member.key NOT IN ('courseID', 'basis')
                             )
                          OR (SELECT count(*) FROM json_each(course.value, '$.basis')) <> 2
                          OR EXISTS (
                               SELECT 1 FROM json_each(course.value, '$.basis') AS member
                               WHERE member.key NOT IN ('type', 'expectedCourseVersion', 'predecessorRevisionID')
                             )
                     )
                  OR (SELECT count(*) FROM json_each(command_operation.value, '$.snapshot.target')) <>
                     CASE json_extract(command_operation.value, '$.snapshot.target.type')
                       WHEN 'absent' THEN 1
                       WHEN 'local_date' THEN 5
                       WHEN 'instant' THEN 6
                       ELSE -1 END
                  OR EXISTS (
                       SELECT 1 FROM json_each(command_operation.value, '$.snapshot.target') AS member
                       WHERE member.key NOT IN (
                         'type', 'instant', 'date', 'timeZone', 'sourceExpression', 'normalized',
                         'utcOffsetMinutes', 'normalizationBasis'
                       )
                     )
                  OR (json_extract(command_operation.value, '$.type') = 'update' AND (
                       (SELECT count(*) FROM json_each(command_operation.value, '$.disposition')) <>
                         CASE json_extract(command_operation.value, '$.disposition.type')
                           WHEN 'superseded' THEN 3
                           WHEN 'active' THEN 1 WHEN 'achieved' THEN 1 WHEN 'abandoned' THEN 1 ELSE -1 END
                       OR EXISTS (
                            SELECT 1 FROM json_each(command_operation.value, '$.disposition') AS member
                            WHERE member.key NOT IN ('type', 'targetGoalID', 'targetRevisionID')
                          )
                     ))
                  OR (json_extract(command_operation.value, '$.type') = 'replace' AND (
                       (SELECT count(*) FROM json_each(command_operation.value, '$.target')) <>
                         CASE json_extract(command_operation.value, '$.target.type')
                           WHEN 'existing' THEN 4 WHEN 'new' THEN 3 ELSE -1 END
                       OR EXISTS (
                            SELECT 1 FROM json_each(command_operation.value, '$.target') AS member
                            WHERE member.key NOT IN ('type', 'goalID', 'revisionID', 'version', 'snapshot', 'disposition')
                          )
                       OR (json_extract(command_operation.value, '$.target.type') = 'new' AND (
                            (SELECT count(*) FROM json_each(command_operation.value, '$.target.snapshot')) <> 5
                            OR EXISTS (
                                 SELECT 1 FROM json_each(command_operation.value, '$.target.snapshot') AS member
                                 WHERE member.key NOT IN ('outcome', 'conditions', 'scope', 'target', 'fieldBases')
                               )
                            OR (SELECT count(*) FROM json_each(command_operation.value, '$.target.snapshot.fieldBases')) <> 5
                            OR EXISTS (
                                 SELECT 1 FROM json_each(command_operation.value, '$.target.snapshot.fieldBases') AS field
                                 WHERE field.key NOT IN ('outcome', 'conditions', 'scope', 'target', 'disposition')
                                    OR (SELECT count(*) FROM json_each(field.value)) <>
                                       CASE json_extract(field.value, '$.type')
                                         WHEN 'authored' THEN 2 WHEN 'accepted' THEN 1 WHEN 'carried' THEN 2 ELSE -1 END
                                    OR EXISTS (
                                         SELECT 1 FROM json_each(field.value) AS member
                                         WHERE member.key NOT IN ('type', 'sourceExcerpt', 'predecessorRevisionID')
                                       )
                               )
                            OR (SELECT count(*) FROM json_each(command_operation.value, '$.target.snapshot.scope')) <>
                               CASE json_extract(command_operation.value, '$.target.snapshot.scope.type')
                                 WHEN 'learner_home' THEN 1 WHEN 'courses' THEN 2 ELSE -1 END
                            OR EXISTS (
                                 SELECT 1 FROM json_each(command_operation.value, '$.target.snapshot.scope.courses') AS course
                                 WHERE (SELECT count(*) FROM json_each(course.value)) <> 2
                                    OR EXISTS (
                                         SELECT 1 FROM json_each(course.value) AS member
                                         WHERE member.key NOT IN ('courseID', 'basis')
                                       )
                                    OR (SELECT count(*) FROM json_each(course.value, '$.basis')) <> 2
                                    OR EXISTS (
                                         SELECT 1 FROM json_each(course.value, '$.basis') AS member
                                         WHERE member.key NOT IN ('type', 'expectedCourseVersion', 'predecessorRevisionID')
                                       )
                               )
                            OR (SELECT count(*) FROM json_each(command_operation.value, '$.target.snapshot.target')) <>
                               CASE json_extract(command_operation.value, '$.target.snapshot.target.type')
                                 WHEN 'absent' THEN 1
                                 WHEN 'local_date' THEN 5
                                 WHEN 'instant' THEN 6
                                 ELSE -1 END
                            OR EXISTS (
                                 SELECT 1 FROM json_each(command_operation.value, '$.target.snapshot.target') AS member
                                 WHERE member.key NOT IN (
                                   'type', 'instant', 'date', 'timeZone', 'sourceExpression', 'normalized',
                                   'utcOffsetMinutes', 'normalizationBasis'
                                 )
                               )
                          ))
                     ))
              )
         )
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_command_operation_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN json_each(effect.command, '$.operations') AS command_operation
       LEFT JOIN learner_goal_effect_operation AS operation
         ON operation.effect_id = effect.id AND operation.ordinal = CAST(command_operation.key AS INTEGER)
       LEFT JOIN learner_goal_revision AS revision ON revision.id = operation.revision_id
       LEFT JOIN learner_goal_supersession AS relation ON relation.revision_id = revision.id
       WHERE effect.id = NEW.effect_id
         AND (operation.effect_id IS NULL
           OR revision.id IS NULL
           OR CAST(command_operation.key AS INTEGER) <> operation.ordinal
           OR json_extract(command_operation.value, '$.type') IS NOT operation.operation_kind
           OR (operation.operation_kind = 'create' AND (
                json_extract(command_operation.value, '$.disposition') IS NOT revision.disposition
                OR revision.version <> 1
                OR revision.predecessor_id IS NOT NULL
              ))
           OR (operation.operation_kind = 'update' AND (
                json_extract(command_operation.value, '$.goalID') IS NOT revision.goal_id
                OR json_extract(command_operation.value, '$.expectedHeadID') IS NOT
                   CASE operation.result_kind WHEN 'changed' THEN revision.predecessor_id ELSE revision.id END
                OR json_extract(command_operation.value, '$.expectedVersion') IS NOT
                   CASE operation.result_kind WHEN 'changed' THEN revision.version - 1 ELSE revision.version END
                OR json_extract(command_operation.value, '$.disposition.type') IS NOT revision.disposition
                OR (revision.disposition = 'superseded' AND (
                     json_extract(command_operation.value, '$.disposition.targetGoalID') IS NOT relation.target_goal_id
                     OR json_extract(command_operation.value, '$.disposition.targetRevisionID') IS NOT relation.target_revision_id
                   ))
                OR (revision.disposition <> 'superseded' AND (
                     json_type(command_operation.value, '$.disposition.targetGoalID') IS NOT NULL
                     OR json_type(command_operation.value, '$.disposition.targetRevisionID') IS NOT NULL
                   ))
              ))
           OR (operation.operation_kind = 'replace' AND (
                json_extract(command_operation.value, '$.goalID') IS NOT revision.goal_id
                OR json_extract(command_operation.value, '$.expectedHeadID') IS NOT revision.predecessor_id
                OR json_extract(command_operation.value, '$.expectedVersion') IS NOT revision.version - 1
                OR json_extract(command_operation.value, '$.target.type') IS NOT operation.replacement_target_kind
                OR (operation.replacement_target_kind = 'existing' AND (
                     json_extract(command_operation.value, '$.target.goalID') IS NOT operation.replacement_target_goal_id
                     OR json_extract(command_operation.value, '$.target.revisionID') IS NOT operation.replacement_target_revision_id
                     OR json_extract(command_operation.value, '$.target.version') IS NOT operation.replacement_target_version
                   ))
              )))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_command_snapshot_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN json_each(effect.command, '$.operations') AS command_operation
       JOIN learner_goal_effect_operation AS operation
         ON operation.effect_id = effect.id AND operation.ordinal = CAST(command_operation.key AS INTEGER)
       JOIN learner_goal_revision AS revision ON revision.id = operation.revision_id
       WHERE effect.id = NEW.effect_id
         AND (json_extract(command_operation.value, '$.snapshot.outcome') IS NOT revision.outcome
           OR json_extract(command_operation.value, '$.snapshot.scope.type') IS NOT revision.scope_kind
           OR json_extract(command_operation.value, '$.snapshot.target.type') IS NOT revision.target_kind
           OR json_array_length(command_operation.value, '$.snapshot.conditions') <>
                (SELECT count(*) FROM learner_goal_condition WHERE revision_id = revision.id)
           OR EXISTS (
                SELECT 1 FROM learner_goal_condition AS condition
                WHERE condition.revision_id = revision.id
                  AND json_extract(command_operation.value,
                       '$.snapshot.conditions[' || condition.ordinal || ']') IS NOT condition.content
              )
           OR (revision.scope_kind = 'learner_home'
               AND json_type(command_operation.value, '$.snapshot.scope.courses') IS NOT NULL)
           OR (revision.scope_kind = 'courses' AND (
                json_type(command_operation.value, '$.snapshot.scope.courses') <> 'array'
                OR json_array_length(command_operation.value, '$.snapshot.scope.courses') <>
                   (SELECT count(*) FROM learner_goal_course_scope WHERE revision_id = revision.id)
                OR EXISTS (
                  SELECT 1 FROM learner_goal_course_scope AS scope
                  WHERE scope.revision_id = revision.id
                    AND NOT EXISTS (
                      SELECT 1 FROM json_each(command_operation.value, '$.snapshot.scope.courses') AS member
                      WHERE json_extract(member.value, '$.courseID') = scope.course_id
                    )
                )
              ))
           OR json_extract(command_operation.value, '$.snapshot.target.instant') IS NOT revision.target_instant
           OR json_extract(command_operation.value, '$.snapshot.target.date') IS NOT revision.target_local_date
           OR json_extract(command_operation.value, '$.snapshot.target.timeZone') IS NOT revision.target_timezone
           OR json_extract(command_operation.value, '$.snapshot.target.utcOffsetMinutes') IS NOT revision.target_utc_offset_minutes
           OR json_extract(command_operation.value, '$.snapshot.target.sourceExpression') IS NOT revision.target_source_expression
           OR json_extract(command_operation.value, '$.snapshot.target.normalized') IS NOT revision.target_normalized
           OR json_extract(command_operation.value, '$.snapshot.target.normalizationBasis') IS NOT revision.target_normalization_basis)
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_command_basis_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN json_each(effect.command, '$.operations') AS command_operation
       JOIN learner_goal_effect_operation AS operation
         ON operation.effect_id = effect.id AND operation.ordinal = CAST(command_operation.key AS INTEGER)
       JOIN learner_goal_revision AS revision ON revision.id = operation.revision_id
       JOIN learner_goal_field_basis AS basis ON basis.revision_id = revision.id
       WHERE effect.id = NEW.effect_id
         AND operation.result_kind = 'changed'
         AND (json_extract(command_operation.value,
                '$.snapshot.fieldBases.' || basis.field || '.type') IS NOT basis.basis_kind
           OR json_extract(command_operation.value,
                '$.snapshot.fieldBases.' || basis.field || '.sourceExcerpt') IS NOT basis.source_excerpt
           OR json_extract(command_operation.value,
                '$.snapshot.fieldBases.' || basis.field || '.predecessorRevisionID') IS NOT basis.predecessor_revision_id)
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_command_course_basis_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN json_each(effect.command, '$.operations') AS command_operation
       JOIN learner_goal_effect_operation AS operation
         ON operation.effect_id = effect.id AND operation.ordinal = CAST(command_operation.key AS INTEGER)
       JOIN learner_goal_revision AS revision ON revision.id = operation.revision_id
       JOIN learner_goal_course_scope AS scope ON scope.revision_id = revision.id
       WHERE effect.id = NEW.effect_id
         AND ((operation.result_kind = 'changed' AND NOT EXISTS (
                SELECT 1 FROM json_each(command_operation.value, '$.snapshot.scope.courses') AS member
                WHERE json_extract(member.value, '$.courseID') = scope.course_id
                  AND json_extract(member.value, '$.basis.type') = scope.admission_kind
                  AND json_extract(member.value, '$.basis.expectedCourseVersion') IS scope.admitted_course_version
                  AND json_extract(member.value, '$.basis.predecessorRevisionID') IS scope.carried_from_revision_id
              ))
           OR (operation.result_kind = 'no_change' AND NOT EXISTS (
                SELECT 1 FROM json_each(command_operation.value, '$.snapshot.scope.courses') AS member
                WHERE json_extract(member.value, '$.courseID') = scope.course_id
                  AND json_extract(member.value, '$.basis.type') = 'carried'
                  AND json_extract(member.value, '$.basis.predecessorRevisionID') = revision.id
              )))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_no_change_basis_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = effect.occurrence_id
       JOIN json_each(effect.command, '$.operations') AS command_operation
       JOIN learner_goal_effect_operation AS operation
         ON operation.effect_id = effect.id AND operation.ordinal = CAST(command_operation.key AS INTEGER)
       JOIN learner_goal_revision AS revision ON revision.id = operation.revision_id
       WHERE effect.id = NEW.effect_id
         AND operation.result_kind = 'no_change'
         AND ((SELECT count(*) FROM json_each(command_operation.value, '$.snapshot.fieldBases')) <> 5
           OR EXISTS (
                SELECT 1 FROM json_each(command_operation.value, '$.snapshot.fieldBases') AS basis
                WHERE basis.key NOT IN ('outcome', 'conditions', 'scope', 'target', 'disposition')
                  OR (json_extract(basis.value, '$.type') = 'accepted'
                      AND effect.authorization_basis <> 'learner_acceptance')
                  OR (json_extract(basis.value, '$.type') = 'carried'
                      AND json_extract(basis.value, '$.predecessorRevisionID') IS NOT revision.id)
                  OR (json_extract(basis.value, '$.type') = 'authored' AND (
                      json_type(basis.value, '$.sourceExcerpt') <> 'text'
                      OR instr(
                        (SELECT group_concat(source_text, char(10)) FROM (
                           SELECT json_extract(part.data, '$.text') AS source_text
                           FROM part
                           WHERE part.session_id = occurrence.origin_session_id
                             AND part.message_id = occurrence.origin_message_id
                             AND json_extract(part.data, '$.type') = 'text'
                             AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                           ORDER BY part.time_created, part.id
                        )),
                        json_extract(basis.value, '$.sourceExcerpt')
                      ) = 0))
              ))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_command_target_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN json_each(effect.command, '$.operations') AS command_operation
       JOIN learner_goal_effect_operation AS operation
         ON operation.effect_id = effect.id AND operation.ordinal = CAST(command_operation.key AS INTEGER)
       JOIN learner_goal_revision AS revision
         ON revision.id = operation.replacement_target_revision_id
       WHERE effect.id = NEW.effect_id
         AND operation.replacement_target_kind = 'new'
         AND (json_extract(command_operation.value, '$.target.disposition') IS NOT revision.disposition
           OR json_extract(command_operation.value, '$.target.snapshot.outcome') IS NOT revision.outcome
           OR json_extract(command_operation.value, '$.target.snapshot.scope.type') IS NOT revision.scope_kind
           OR json_extract(command_operation.value, '$.target.snapshot.target.type') IS NOT revision.target_kind
           OR json_array_length(command_operation.value, '$.target.snapshot.conditions') <>
              (SELECT count(*) FROM learner_goal_condition WHERE revision_id = revision.id)
           OR EXISTS (
                SELECT 1 FROM learner_goal_condition AS condition
                WHERE condition.revision_id = revision.id
                  AND json_extract(command_operation.value,
                       '$.target.snapshot.conditions[' || condition.ordinal || ']') IS NOT condition.content
              )
           OR (revision.scope_kind = 'learner_home'
               AND json_type(command_operation.value, '$.target.snapshot.scope.courses') IS NOT NULL)
           OR (revision.scope_kind = 'courses' AND (
                json_type(command_operation.value, '$.target.snapshot.scope.courses') <> 'array'
                OR json_array_length(command_operation.value, '$.target.snapshot.scope.courses') <>
                   (SELECT count(*) FROM learner_goal_course_scope WHERE revision_id = revision.id)
                OR EXISTS (
                  SELECT 1 FROM learner_goal_course_scope AS scope
                  WHERE scope.revision_id = revision.id
                    AND NOT EXISTS (
                      SELECT 1 FROM json_each(command_operation.value, '$.target.snapshot.scope.courses') AS member
                      WHERE json_extract(member.value, '$.courseID') = scope.course_id
                        AND json_extract(member.value, '$.basis.type') = scope.admission_kind
                        AND json_extract(member.value, '$.basis.expectedCourseVersion') IS scope.admitted_course_version
                        AND json_extract(member.value, '$.basis.predecessorRevisionID') IS scope.carried_from_revision_id
                    )
                )
              ))
           OR json_extract(command_operation.value, '$.target.snapshot.target.instant') IS NOT revision.target_instant
           OR json_extract(command_operation.value, '$.target.snapshot.target.date') IS NOT revision.target_local_date
           OR json_extract(command_operation.value, '$.target.snapshot.target.timeZone') IS NOT revision.target_timezone
           OR json_extract(command_operation.value, '$.target.snapshot.target.utcOffsetMinutes') IS NOT revision.target_utc_offset_minutes
           OR json_extract(command_operation.value, '$.target.snapshot.target.sourceExpression') IS NOT revision.target_source_expression
           OR json_extract(command_operation.value, '$.target.snapshot.target.normalized') IS NOT revision.target_normalized
           OR json_extract(command_operation.value, '$.target.snapshot.target.normalizationBasis') IS NOT revision.target_normalization_basis
           OR EXISTS (
                SELECT 1 FROM learner_goal_field_basis AS basis
                WHERE basis.revision_id = revision.id
                  AND (json_extract(command_operation.value,
                         '$.target.snapshot.fieldBases.' || basis.field || '.type') IS NOT basis.basis_kind
                    OR json_extract(command_operation.value,
                         '$.target.snapshot.fieldBases.' || basis.field || '.sourceExcerpt') IS NOT basis.source_excerpt
                    OR json_extract(command_operation.value,
                         '$.target.snapshot.fieldBases.' || basis.field || '.predecessorRevisionID') IS NOT basis.predecessor_revision_id)
              ))
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_direct_validate
   BEFORE INSERT ON learner_goal_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_cadence_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = effect.occurrence_id
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND (
           instr(lower((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           ))), 'every day') > 0
           OR instr(lower((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           ))), 'each day') > 0
           OR instr(lower((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           ))), 'per day') > 0
           OR instr(lower((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           ))), 'daily') > 0
           OR instr((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )), '每天') > 0
           OR instr((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )), '每日') > 0
           OR instr((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )), '每周') > 0
           OR instr((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )), '每月') > 0
           OR EXISTS (
             SELECT 1 FROM json_each('["every week","weekly","every month","monthly"]') AS marker
             WHERE instr(lower((SELECT group_concat(source_text, char(10)) FROM (
               SELECT json_extract(part.data, '$.text') AS source_text FROM part
               WHERE part.session_id = occurrence.origin_session_id
                 AND part.message_id = occurrence.origin_message_id
                 AND json_extract(part.data, '$.type') = 'text'
                 AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
               ORDER BY part.time_created, part.id
             ))), marker.value) > 0
           )
         )
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_initiation_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = effect.occurrence_id
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND EXISTS (SELECT 1 FROM json_each(effect.command, '$.operations') AS operation
                     WHERE json_extract(operation.value, '$.type') = 'create')
         AND NOT (
           lower(ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )))) GLOB '/goal*'
           OR lower(ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )))) GLOB 'create goal:*'
           OR lower(ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )))) GLOB 'create goals:*'
           OR lower(ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )))) GLOB 'create a durable goal:*'
           OR lower(ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )))) GLOB 'create durable goal:*'
           OR lower(ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )))) GLOB 'create durable goals:*'
           OR lower(ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )))) GLOB 'set goal:*'
           OR lower(ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           )))) GLOB 'set my goal:*'
           OR ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           ))) GLOB '创建目标：*'
           OR ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           ))) GLOB '建立目标：*'
           OR ltrim((SELECT group_concat(source_text, char(10)) FROM (
             SELECT json_extract(part.data, '$.text') AS source_text FROM part
             WHERE part.session_id = occurrence.origin_session_id
               AND part.message_id = occurrence.origin_message_id
               AND json_extract(part.data, '$.type') = 'text'
               AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
             ORDER BY part.time_created, part.id
           ))) GLOB '我的目标是*'
         )
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_initiation_intent_invalid')
     WHERE EXISTS (
       WITH source AS (
         SELECT session_id, message_id, lower(ltrim(group_concat(source_text, char(10)))) AS text
         FROM (
           SELECT part.session_id, part.message_id, json_extract(part.data, '$.text') AS source_text
           FROM part
           WHERE json_extract(part.data, '$.type') = 'text'
             AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
           ORDER BY part.time_created, part.id
         )
         GROUP BY session_id, message_id
       )
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = effect.occurrence_id
       JOIN source
         ON source.session_id = occurrence.origin_session_id
           AND source.message_id = occurrence.origin_message_id
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND EXISTS (SELECT 1 FROM json_each(effect.command, '$.operations') AS operation
                     WHERE json_extract(operation.value, '$.type') = 'create')
         AND (
           EXISTS (
             SELECT 1 FROM json_each('["do not","don''t","i do not","i don''t","not my","suppose","if i were"]') AS marker
             WHERE source.text GLOB '/goal ' || marker.value || '*'
                OR source.text GLOB '/goal: ' || marker.value || '*'
                OR source.text GLOB '/goal' || marker.value || '*'
                OR source.text GLOB 'create goal: ' || marker.value || '*'
                OR source.text GLOB 'create goals: ' || marker.value || '*'
                OR source.text GLOB 'create a durable goal: ' || marker.value || '*'
                OR source.text GLOB 'create durable goal: ' || marker.value || '*'
                OR source.text GLOB 'create durable goals: ' || marker.value || '*'
                OR source.text GLOB 'set goal: ' || marker.value || '*'
                OR source.text GLOB 'set my goal: ' || marker.value || '*'
           )
           OR source.text GLOB '/goal不要*'
           OR source.text GLOB '/goal 不要*'
           OR source.text GLOB '/goal别*'
           OR source.text GLOB '/goal 别*'
           OR source.text GLOB '/goal假如*'
           OR source.text GLOB '/goal 假如*'
           OR source.text GLOB '/goal如果只是*'
           OR source.text GLOB '/goal 如果只是*'
           OR source.text GLOB '创建目标：不要*'
           OR source.text GLOB '创建目标：别*'
           OR source.text GLOB '创建目标：假如*'
           OR source.text GLOB '创建目标：如果只是*'
           OR source.text GLOB '建立目标：不要*'
           OR source.text GLOB '建立目标：别*'
           OR source.text GLOB '建立目标：假如*'
           OR source.text GLOB '建立目标：如果只是*'
         )
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_initial_default_invalid')
     WHERE EXISTS (
       WITH source AS (
         SELECT session_id, message_id, group_concat(source_text, char(10)) AS text
         FROM (
           SELECT part.session_id, part.message_id, json_extract(part.data, '$.text') AS source_text
           FROM part
           WHERE json_extract(part.data, '$.type') = 'text'
             AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
           ORDER BY part.time_created, part.id
         )
         GROUP BY session_id, message_id
       )
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = effect.occurrence_id
       JOIN source
         ON source.session_id = occurrence.origin_session_id
           AND source.message_id = occurrence.origin_message_id
       JOIN learner_goal_revision AS revision ON revision.effect_id = effect.id
       JOIN learner_goal_field_basis AS scope_basis
         ON scope_basis.revision_id = revision.id AND scope_basis.field = 'scope'
       JOIN learner_goal_field_basis AS target_basis
         ON target_basis.revision_id = revision.id AND target_basis.field = 'target'
       JOIN learner_goal_field_basis AS condition_basis
         ON condition_basis.revision_id = revision.id AND condition_basis.field = 'conditions'
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND revision.version = 1
         AND (
           (revision.scope_kind = 'learner_home'
             AND (instr(lower(source.text), 'course') > 0 OR instr(source.text, '课程') > 0)
             AND (scope_basis.basis_kind <> 'authored'
               OR (instr(lower(scope_basis.source_excerpt), 'learnerhome') = 0
                 AND instr(scope_basis.source_excerpt, '学习者主目录') = 0
                 AND instr(scope_basis.source_excerpt, '学习者空间') = 0)))
           OR (revision.target_kind = 'absent'
             AND (instr(lower(source.text), 'target') > 0
               OR instr(lower(source.text), 'deadline') > 0
               OR instr(lower(source.text), ' by ') > 0
               OR instr(lower(source.text), 'before the exam') > 0
               OR source.text GLOB '*[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
               OR instr(source.text, '截止') > 0
               OR instr(source.text, '日期') > 0
               OR instr(source.text, '考试前') > 0
               OR instr(source.text, '之前') > 0)
             AND (target_basis.basis_kind <> 'authored'
               OR NOT (
                 ((instr(lower(target_basis.source_excerpt), 'no') > 0
                     OR instr(lower(target_basis.source_excerpt), 'remove') > 0
                     OR instr(lower(target_basis.source_excerpt), 'clear') > 0
                     OR instr(lower(target_basis.source_excerpt), 'without') > 0)
                   AND (instr(lower(target_basis.source_excerpt), 'target') > 0
                     OR instr(lower(target_basis.source_excerpt), 'deadline') > 0
                     OR instr(lower(target_basis.source_excerpt), 'date') > 0))
                 OR instr(target_basis.source_excerpt, '无目标') > 0
                 OR instr(target_basis.source_excerpt, '无截止日期') > 0
                 OR ((instr(target_basis.source_excerpt, '移除') > 0
                       OR instr(target_basis.source_excerpt, '清除') > 0
                       OR instr(target_basis.source_excerpt, '取消') > 0)
                     AND (instr(target_basis.source_excerpt, '目标') > 0
                       OR instr(target_basis.source_excerpt, '日期') > 0))
               )))
           OR ((SELECT count(*) FROM learner_goal_condition
                WHERE revision_id = revision.id) = 0
             AND (instr(lower(source.text), ' if ') > 0
               OR instr(lower(source.text), ' when ') > 0
               OR instr(lower(source.text), ' until ') > 0
               OR instr(lower(source.text), 'score') > 0
               OR instr(lower(source.text), '>=') > 0
               OR instr(lower(source.text), 'condition') > 0
               OR instr(source.text, '条件') > 0
               OR instr(source.text, '达到') > 0
               OR instr(source.text, '分数') > 0)
             AND (condition_basis.basis_kind <> 'authored'
               OR NOT (
                 instr(lower(condition_basis.source_excerpt), 'no conditions') > 0
                 OR instr(lower(condition_basis.source_excerpt), 'without conditions') > 0
                 OR instr(condition_basis.source_excerpt, '无条件') > 0
                 OR instr(condition_basis.source_excerpt, '没有条件') > 0
               )))
           OR (revision.disposition = 'active'
             AND (EXISTS (
                    SELECT 1 FROM json_each('["achieved","abandoned","replaced","superseded","done","completed"]') AS marker
                    WHERE instr(lower(source.text), marker.value) > 0
                  )
               OR EXISTS (
                    SELECT 1 FROM json_each('["放弃","达成","已完成","替代","取代"]') AS marker
                    WHERE instr(source.text, marker.value) > 0
                  )))
         )
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_identity_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = effect.occurrence_id
       JOIN json_each(effect.command, '$.operations') AS command_operation
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND json_extract(command_operation.value, '$.type') IN ('update', 'replace')
         AND instr(
           (SELECT group_concat(source_text, char(10)) FROM (
              SELECT json_extract(part.data, '$.text') AS source_text
              FROM part
              WHERE part.session_id = occurrence.origin_session_id
                AND part.message_id = occurrence.origin_message_id
                AND json_extract(part.data, '$.type') = 'text'
                AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
              ORDER BY part.time_created, part.id
           )),
           json_extract(command_operation.value, '$.goalID')
         ) = 0
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_lifecycle_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learner_goal_revision AS revision ON revision.effect_id = effect.id
       LEFT JOIN learner_goal_revision AS predecessor ON predecessor.id = revision.predecessor_id
       LEFT JOIN learner_goal_field_basis AS basis
         ON basis.revision_id = revision.id AND basis.field = 'disposition'
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND revision.disposition IN ('active', 'achieved', 'abandoned')
         AND ((revision.version = 1 AND revision.disposition <> 'active')
           OR (revision.version > 1 AND (
                predecessor.disposition = 'superseded'
                OR predecessor.disposition <> revision.disposition
                OR (revision.disposition IN ('achieved', 'abandoned') AND basis.basis_kind <> 'carried')
              )))
         AND (basis.basis_kind <> 'authored'
           OR NOT (
             instr(lower(basis.source_excerpt),
               'goal ' || lower(CASE revision.version WHEN 1 THEN revision.outcome ELSE revision.goal_id END) ||
               ' is ' || revision.disposition) > 0
             OR instr(lower(basis.source_excerpt),
               lower(CASE revision.version WHEN 1 THEN revision.outcome ELSE revision.goal_id END) ||
               ' disposition: ' || revision.disposition) > 0
             OR instr(basis.source_excerpt,
               (CASE revision.version WHEN 1 THEN revision.outcome ELSE revision.goal_id END) ||
               ' 状态：' || CASE revision.disposition
                 WHEN 'achieved' THEN '已达成' WHEN 'abandoned' THEN '已放弃' ELSE '进行中' END) > 0
             OR instr(basis.source_excerpt,
               (CASE revision.version WHEN 1 THEN revision.outcome ELSE revision.goal_id END) ||
               ' 状态: ' || CASE revision.disposition
                 WHEN 'achieved' THEN '已达成' WHEN 'abandoned' THEN '已放弃' ELSE '进行中' END) > 0
           ))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_update_intent_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = effect.occurrence_id
       JOIN json_each(effect.command, '$.operations') AS command_operation
       JOIN learner_goal_effect_operation AS operation
         ON operation.effect_id = effect.id AND operation.ordinal = CAST(command_operation.key AS INTEGER)
       JOIN learner_goal_revision AS revision ON revision.id = operation.revision_id
       LEFT JOIN learner_goal_revision AS predecessor ON predecessor.id = revision.predecessor_id
       LEFT JOIN learner_goal_field_basis AS basis
         ON basis.revision_id = revision.id AND basis.field = 'disposition'
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND operation.operation_kind = 'update'
         AND json_extract(command_operation.value, '$.disposition.type') <> 'superseded'
         AND ((operation.result_kind = 'no_change' AND NOT (
                instr('; ' || replace(replace(lower((SELECT group_concat(source_text, char(10)) FROM (
                  SELECT json_extract(part.data, '$.text') AS source_text FROM part
                  WHERE part.session_id = occurrence.origin_session_id
                    AND part.message_id = occurrence.origin_message_id
                    AND json_extract(part.data, '$.type') = 'text'
                    AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                  ORDER BY part.time_created, part.id
                ))), char(10), '; '), '；', '; '), '; keep ' || lower(revision.goal_id) || ' unchanged') > 0
                OR instr('; ' || replace(replace(lower((SELECT group_concat(source_text, char(10)) FROM (
                  SELECT json_extract(part.data, '$.text') AS source_text FROM part
                  WHERE part.session_id = occurrence.origin_session_id
                    AND part.message_id = occurrence.origin_message_id
                    AND json_extract(part.data, '$.type') = 'text'
                    AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                  ORDER BY part.time_created, part.id
                ))), char(10), '; '), '；', '; '), '; keep goal ' || lower(revision.goal_id) || ' unchanged') > 0
                OR instr((SELECT group_concat(source_text, char(10)) FROM (
                  SELECT json_extract(part.data, '$.text') AS source_text FROM part
                  WHERE part.session_id = occurrence.origin_session_id
                    AND part.message_id = occurrence.origin_message_id
                    AND json_extract(part.data, '$.type') = 'text'
                    AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                  ORDER BY part.time_created, part.id
                )), '保持' || revision.goal_id || '不变') > 0
                OR instr((SELECT group_concat(source_text, char(10)) FROM (
                  SELECT json_extract(part.data, '$.text') AS source_text FROM part
                  WHERE part.session_id = occurrence.origin_session_id
                    AND part.message_id = occurrence.origin_message_id
                    AND json_extract(part.data, '$.type') = 'text'
                    AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                  ORDER BY part.time_created, part.id
                )), '保持 ' || revision.goal_id || ' 不变') > 0
              ))
           OR (operation.result_kind = 'changed'
             AND NOT (predecessor.disposition = 'superseded'
               OR predecessor.disposition <> revision.disposition
               OR (revision.disposition IN ('achieved', 'abandoned') AND basis.basis_kind <> 'carried'))
             AND NOT EXISTS (
               SELECT 1 FROM json_each('["update","correct","change","set"]') AS verb
               WHERE instr('; ' || replace(replace(lower((SELECT group_concat(source_text, char(10)) FROM (
                 SELECT json_extract(part.data, '$.text') AS source_text FROM part
                 WHERE part.session_id = occurrence.origin_session_id
                   AND part.message_id = occurrence.origin_message_id
                   AND json_extract(part.data, '$.type') = 'text'
                   AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                 ORDER BY part.time_created, part.id
               ))), char(10), '; '), '；', '; '), '; ' || verb.value || ' ' || lower(revision.goal_id)) > 0
             )
             AND NOT EXISTS (
               SELECT 1 FROM json_each('["更新","更正","修改","设置"]') AS verb
               WHERE instr((SELECT group_concat(source_text, char(10)) FROM (
                 SELECT json_extract(part.data, '$.text') AS source_text FROM part
                 WHERE part.session_id = occurrence.origin_session_id
                   AND part.message_id = occurrence.origin_message_id
                   AND json_extract(part.data, '$.type') = 'text'
                   AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                 ORDER BY part.time_created, part.id
               )), verb.value || revision.goal_id) > 0
                  OR instr((SELECT group_concat(source_text, char(10)) FROM (
                    SELECT json_extract(part.data, '$.text') AS source_text FROM part
                    WHERE part.session_id = occurrence.origin_session_id
                      AND part.message_id = occurrence.origin_message_id
                      AND json_extract(part.data, '$.type') = 'text'
                      AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                    ORDER BY part.time_created, part.id
                  )), verb.value || ' ' || revision.goal_id) > 0
             )))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_relation_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learner_goal_revision AS revision ON revision.effect_id = effect.id
       JOIN learner_goal_supersession AS relation ON relation.revision_id = revision.id
       JOIN learner_goal_field_basis AS basis
         ON basis.revision_id = revision.id AND basis.field = 'disposition'
       JOIN learner_goal_effect_operation AS operation
         ON operation.effect_id = revision.effect_id
           AND operation.ordinal = revision.operation_ordinal
           AND operation.revision_id = revision.id
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND (basis.basis_kind <> 'authored'
           OR NOT (
             instr(lower(basis.source_excerpt),
               'replace ' || lower(revision.goal_id) || ' with ' ||
               lower(CASE operation.replacement_target_kind
                 WHEN 'new' THEN 'a new goal' ELSE relation.target_goal_id END)) > 0
             OR instr(lower(basis.source_excerpt),
               lower(revision.goal_id) || ' is replaced by ' ||
               lower(CASE operation.replacement_target_kind
                 WHEN 'new' THEN 'a new goal' ELSE relation.target_goal_id END)) > 0
             OR instr(basis.source_excerpt,
               '用' || CASE operation.replacement_target_kind
                 WHEN 'new' THEN '新 Goal' ELSE relation.target_goal_id END ||
               '替代' || revision.goal_id) > 0
           ))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_condition_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learner_goal_revision AS revision ON revision.effect_id = effect.id
       JOIN learner_goal_field_basis AS basis
         ON basis.revision_id = revision.id AND basis.field = 'conditions'
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND basis.basis_kind = 'authored'
         AND (EXISTS (
                SELECT 1 FROM learner_goal_condition AS condition
                WHERE condition.revision_id = revision.id
                  AND instr(basis.source_excerpt, condition.content) = 0
              )
           OR (revision.version > 1
             AND NOT EXISTS (
               SELECT 1 FROM learner_goal_condition AS condition
               WHERE condition.revision_id = revision.id
             )
             AND instr(lower(basis.source_excerpt), 'no conditions') = 0
             AND instr(lower(basis.source_excerpt), 'without conditions') = 0
             AND instr(basis.source_excerpt, '无条件') = 0
             AND instr(basis.source_excerpt, '没有条件') = 0))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_course_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learner_goal_revision AS revision ON revision.effect_id = effect.id
       JOIN learner_goal_course_scope AS scope ON scope.revision_id = revision.id
       JOIN learner_goal_field_basis AS basis
         ON basis.revision_id = revision.id AND basis.field = 'scope'
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND ((scope.admission_kind = 'new' AND (
                basis.basis_kind <> 'authored'
                OR (instr(basis.source_excerpt, scope.course_id) = 0
                  AND (instr(basis.source_excerpt, scope.course_title) = 0
                    OR (SELECT count(*) FROM course
                        WHERE title = scope.course_title AND withdrawal_reason IS NULL) <> 1))
              ))
           OR (scope.admission_kind = 'carried'
             AND basis.basis_kind = 'authored'
             AND instr(basis.source_excerpt, scope.course_id) = 0
             AND instr(basis.source_excerpt, scope.course_title) = 0))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_home_scope_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learner_goal_revision AS revision ON revision.effect_id = effect.id
       JOIN learner_goal_field_basis AS basis
         ON basis.revision_id = revision.id AND basis.field = 'scope'
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND revision.version > 1
         AND revision.scope_kind = 'learner_home'
         AND basis.basis_kind = 'authored'
         AND instr(lower(basis.source_excerpt), 'learnerhome') = 0
         AND instr(basis.source_excerpt, '学习者主目录') = 0
         AND instr(basis.source_excerpt, '学习者空间') = 0
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_scope_removal_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learner_goal_revision AS revision ON revision.effect_id = effect.id
       JOIN learner_goal_course_scope AS old_scope ON old_scope.revision_id = revision.predecessor_id
       JOIN learner_goal_field_basis AS basis
         ON basis.revision_id = revision.id AND basis.field = 'scope'
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND NOT EXISTS (
           SELECT 1 FROM learner_goal_course_scope AS current_scope
           WHERE current_scope.revision_id = revision.id AND current_scope.course_id = old_scope.course_id
         )
         AND (basis.basis_kind <> 'authored'
           OR (instr(basis.source_excerpt, old_scope.course_id) = 0
             AND instr(basis.source_excerpt, old_scope.course_title) = 0)
           OR NOT (
             (instr(lower(basis.source_excerpt), 'remove') > 0
               AND (instr(lower(basis.source_excerpt), 'course') > 0
                 OR instr(lower(basis.source_excerpt), 'scope') > 0))
             OR (instr(lower(basis.source_excerpt), 'clear') > 0
               AND (instr(lower(basis.source_excerpt), 'course') > 0
                 OR instr(lower(basis.source_excerpt), 'scope') > 0))
             OR (instr(lower(basis.source_excerpt), 'drop') > 0
               AND (instr(lower(basis.source_excerpt), 'course') > 0
                 OR instr(lower(basis.source_excerpt), 'scope') > 0))
             OR ((instr(basis.source_excerpt, '移除') > 0
                   OR instr(basis.source_excerpt, '清除') > 0
                   OR instr(basis.source_excerpt, '取消') > 0)
                 AND instr(basis.source_excerpt, '课程') > 0)
           ))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_direct_target_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learner_goal_revision AS revision ON revision.effect_id = effect.id
       LEFT JOIN learner_goal_revision AS predecessor ON predecessor.id = revision.predecessor_id
       JOIN learner_goal_field_basis AS basis
         ON basis.revision_id = revision.id AND basis.field = 'target'
       WHERE effect.id = NEW.effect_id
         AND effect.authorization_basis = 'learner_request'
         AND ((revision.target_kind <> 'absent'
              AND (revision.version = 1 OR basis.basis_kind = 'authored'
                OR predecessor.target_kind <> revision.target_kind
                OR predecessor.target_instant IS NOT revision.target_instant
                OR predecessor.target_local_date IS NOT revision.target_local_date
                OR predecessor.target_timezone IS NOT revision.target_timezone
                OR predecessor.target_timezone_release_id IS NOT revision.target_timezone_release_id
                OR predecessor.target_utc_offset_minutes IS NOT revision.target_utc_offset_minutes
                OR predecessor.target_source_expression IS NOT revision.target_source_expression
                OR predecessor.target_normalized IS NOT revision.target_normalized
                OR predecessor.target_normalization_basis IS NOT revision.target_normalization_basis)
              AND (
                basis.basis_kind <> 'authored'
                OR instr(basis.source_excerpt, revision.target_source_expression) = 0
                OR (revision.target_kind = 'instant'
                    AND revision.target_source_expression <> revision.target_normalized)
                OR (revision.target_kind = 'local_date'
                    AND revision.target_source_expression <> revision.target_local_date)
                OR (revision.target_kind = 'local_date'
                    AND instr(basis.source_excerpt, revision.target_timezone) = 0)
              ))
           OR (revision.target_kind = 'absent' AND revision.version > 1
              AND (basis.basis_kind = 'authored'
                OR predecessor.target_kind <> revision.target_kind
                OR predecessor.target_instant IS NOT revision.target_instant
                OR predecessor.target_local_date IS NOT revision.target_local_date
                OR predecessor.target_timezone IS NOT revision.target_timezone
                OR predecessor.target_timezone_release_id IS NOT revision.target_timezone_release_id
                OR predecessor.target_utc_offset_minutes IS NOT revision.target_utc_offset_minutes
                OR predecessor.target_source_expression IS NOT revision.target_source_expression
                OR predecessor.target_normalized IS NOT revision.target_normalized
                OR predecessor.target_normalization_basis IS NOT revision.target_normalization_basis)
              AND (
                basis.basis_kind <> 'authored'
                OR NOT (
                  ((instr(lower(basis.source_excerpt), 'no') > 0
                      OR instr(lower(basis.source_excerpt), 'remove') > 0
                      OR instr(lower(basis.source_excerpt), 'clear') > 0
                      OR instr(lower(basis.source_excerpt), 'without') > 0)
                    AND (instr(lower(basis.source_excerpt), 'target') > 0
                      OR instr(lower(basis.source_excerpt), 'deadline') > 0
                      OR instr(lower(basis.source_excerpt), 'date') > 0))
                  OR instr(basis.source_excerpt, '无目标') > 0
                  OR instr(basis.source_excerpt, '无截止日期') > 0
                  OR ((instr(basis.source_excerpt, '移除') > 0
                        OR instr(basis.source_excerpt, '清除') > 0
                        OR instr(basis.source_excerpt, '取消') > 0)
                      AND (instr(basis.source_excerpt, '目标') > 0
                        OR instr(basis.source_excerpt, '日期') > 0))
                )
              )))
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_basis_validate
   BEFORE INSERT ON learner_goal_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_authored_basis_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_field_basis AS basis
       JOIN learner_goal_revision AS revision ON revision.id = basis.revision_id
       JOIN learner_goal_effect AS effect ON effect.id = revision.effect_id
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = effect.occurrence_id
       WHERE revision.effect_id = NEW.effect_id
         AND ((effect.authorization_basis = 'learner_request' AND basis.basis_kind = 'accepted')
           OR (basis.basis_kind = 'authored' AND instr(
                (SELECT group_concat(source_text, char(10)) FROM (
                   SELECT json_extract(part.data, '$.text') AS source_text
                   FROM part
                   WHERE part.session_id = occurrence.origin_session_id
                     AND part.message_id = occurrence.origin_message_id
                     AND json_extract(part.data, '$.type') = 'text'
                     AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                   ORDER BY part.time_created, part.id
                )),
                basis.source_excerpt
              ) = 0)
           OR (effect.authorization_basis = 'learner_request'
               AND basis.field = 'outcome'
               AND basis.basis_kind = 'authored'
               AND instr(
                 (SELECT group_concat(source_text, char(10)) FROM (
                    SELECT json_extract(part.data, '$.text') AS source_text
                    FROM part
                    WHERE part.session_id = occurrence.origin_session_id
                      AND part.message_id = occurrence.origin_message_id
                      AND json_extract(part.data, '$.type') = 'text'
                      AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                    ORDER BY part.time_created, part.id
                 )),
                 revision.outcome
               ) = 0)
           OR (effect.authorization_basis = 'learner_request'
               AND basis.field = 'conditions'
               AND basis.basis_kind = 'authored'
               AND EXISTS (
                 SELECT 1 FROM learner_goal_condition AS condition
                 WHERE condition.revision_id = revision.id
                   AND instr(
                     (SELECT group_concat(source_text, char(10)) FROM (
                        SELECT json_extract(part.data, '$.text') AS source_text
                        FROM part
                        WHERE part.session_id = occurrence.origin_session_id
                          AND part.message_id = occurrence.origin_message_id
                          AND json_extract(part.data, '$.type') = 'text'
                          AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                        ORDER BY part.time_created, part.id
                     )),
                     condition.content
                   ) = 0
               ))
           OR (effect.authorization_basis = 'learner_request'
               AND revision.target_kind <> 'absent'
               AND basis.field = 'target'
               AND basis.basis_kind = 'authored'
               AND instr(
                 (SELECT group_concat(source_text, char(10)) FROM (
                    SELECT json_extract(part.data, '$.text') AS source_text
                    FROM part
                    WHERE part.session_id = occurrence.origin_session_id
                      AND part.message_id = occurrence.origin_message_id
                      AND json_extract(part.data, '$.type') = 'text'
                      AND coalesce(json_extract(part.data, '$.synthetic'), 0) <> 1
                    ORDER BY part.time_created, part.id
                 )),
                 revision.target_source_expression
               ) = 0))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_carry_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_field_basis AS basis
       JOIN learner_goal_revision AS revision ON revision.id = basis.revision_id
       JOIN learner_goal_revision AS predecessor ON predecessor.id = basis.predecessor_revision_id
       WHERE revision.effect_id = NEW.effect_id
         AND basis.basis_kind = 'carried'
         AND (predecessor.id <> revision.predecessor_id
           OR predecessor.goal_id <> revision.goal_id
           OR (basis.field = 'outcome' AND predecessor.outcome <> revision.outcome)
           OR (basis.field = 'conditions' AND (
                (SELECT count(*) FROM learner_goal_condition WHERE revision_id = predecessor.id)
                  <> (SELECT count(*) FROM learner_goal_condition WHERE revision_id = revision.id)
                OR EXISTS (
                  SELECT 1 FROM learner_goal_condition AS current
                  WHERE current.revision_id = revision.id
                    AND NOT EXISTS (
                      SELECT 1 FROM learner_goal_condition AS previous
                      WHERE previous.revision_id = predecessor.id
                        AND previous.ordinal = current.ordinal
                        AND previous.content = current.content
                    )
                )))
           OR (basis.field = 'scope' AND (
                predecessor.scope_kind <> revision.scope_kind
                OR (SELECT count(*) FROM learner_goal_course_scope WHERE revision_id = predecessor.id)
                  <> (SELECT count(*) FROM learner_goal_course_scope WHERE revision_id = revision.id)
                OR EXISTS (
                  SELECT 1 FROM learner_goal_course_scope AS current
                  WHERE current.revision_id = revision.id
                    AND NOT EXISTS (
                      SELECT 1 FROM learner_goal_course_scope AS previous
                      WHERE previous.revision_id = predecessor.id
                        AND previous.course_id = current.course_id
                    )
                )))
           OR (basis.field = 'target' AND (
                predecessor.target_kind <> revision.target_kind
                OR predecessor.target_instant IS NOT revision.target_instant
                OR predecessor.target_local_date IS NOT revision.target_local_date
                OR predecessor.target_timezone IS NOT revision.target_timezone
                OR predecessor.target_timezone_release_id IS NOT revision.target_timezone_release_id
                OR predecessor.target_utc_offset_minutes IS NOT revision.target_utc_offset_minutes
                OR predecessor.target_source_expression IS NOT revision.target_source_expression
                OR predecessor.target_normalized IS NOT revision.target_normalized
                OR predecessor.target_normalization_basis IS NOT revision.target_normalization_basis
              ))
           OR (basis.field = 'disposition' AND (
                predecessor.disposition <> revision.disposition
                OR (predecessor.disposition = 'superseded' AND NOT EXISTS (
                  SELECT 1
                  FROM learner_goal_supersession AS old_relation
                  JOIN learner_goal_supersession AS new_relation
                    ON new_relation.revision_id = revision.id
                  WHERE old_relation.revision_id = predecessor.id
                    AND old_relation.target_goal_id = new_relation.target_goal_id
                    AND old_relation.target_revision_id = new_relation.target_revision_id
                ))
              )))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_dependency_incomplete')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_revision AS revision
       JOIN learner_goal_revision AS predecessor ON predecessor.id = revision.predecessor_id
       WHERE revision.effect_id = NEW.effect_id
         AND ((revision.outcome <> predecessor.outcome AND EXISTS (
                SELECT 1 FROM learner_goal_field_basis
                WHERE revision_id = revision.id
                  AND field IN ('conditions', 'scope', 'target')
                  AND basis_kind = 'carried'
              ))
           OR ((revision.scope_kind <> predecessor.scope_kind
                OR (SELECT count(*) FROM learner_goal_course_scope WHERE revision_id = revision.id)
                  <> (SELECT count(*) FROM learner_goal_course_scope WHERE revision_id = predecessor.id)
                OR EXISTS (
                  SELECT 1 FROM learner_goal_course_scope AS current
                  WHERE current.revision_id = revision.id
                    AND NOT EXISTS (SELECT 1 FROM learner_goal_course_scope AS previous
                                    WHERE previous.revision_id = predecessor.id
                                      AND previous.course_id = current.course_id)
              )) AND EXISTS (
                SELECT 1 FROM learner_goal_field_basis
                WHERE revision_id = revision.id
                  AND field IN ('outcome', 'conditions', 'target')
                  AND basis_kind = 'carried'
              ))
           OR (revision.disposition IN ('achieved', 'abandoned', 'superseded')
               AND EXISTS (
                 SELECT 1 FROM learner_goal_field_basis
                 WHERE revision_id = revision.id AND field = 'disposition' AND basis_kind = 'carried'
               )
               AND EXISTS (
                 SELECT 1 FROM learner_goal_field_basis
                 WHERE revision_id = revision.id
                   AND field IN ('outcome', 'conditions', 'scope', 'target')
                   AND basis_kind <> 'carried'
               )))
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_relation_validate
   BEFORE INSERT ON learner_goal_commit_seal
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_relation_target_invalid')
     WHERE EXISTS (
       SELECT 1
       FROM learner_goal_supersession AS relation
       JOIN learner_goal_revision AS source ON source.id = relation.revision_id
       WHERE source.effect_id = NEW.effect_id
         AND (relation.source_goal_id <> source.goal_id
           OR relation.target_goal_id = source.goal_id
           OR NOT EXISTS (
             SELECT 1 FROM learner_goal_revision AS target
             WHERE target.id = relation.target_revision_id
               AND target.goal_id = relation.target_goal_id
               AND (target.effect_id = NEW.effect_id OR EXISTS (
                 SELECT 1 FROM learner_goal_commit_seal AS seal WHERE seal.effect_id = target.effect_id
               ))
           ))
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_relation_incoming_invalid')
     WHERE EXISTS (
       SELECT relation.target_goal_id
       FROM learner_goal_revision AS head
       JOIN learner_goal_supersession AS relation ON relation.revision_id = head.id
       WHERE NOT EXISTS (
         SELECT 1 FROM learner_goal_revision AS successor WHERE successor.predecessor_id = head.id
       )
       GROUP BY relation.target_goal_id
       HAVING count(*) > 1
     );
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_relation_cycle')
     WHERE EXISTS (
       WITH RECURSIVE
       edge(source_goal_id, target_goal_id) AS (
         SELECT head.goal_id, relation.target_goal_id
         FROM learner_goal_revision AS head
         JOIN learner_goal_supersession AS relation ON relation.revision_id = head.id
         WHERE NOT EXISTS (
           SELECT 1 FROM learner_goal_revision AS successor WHERE successor.predecessor_id = head.id
         )
       ),
       reach(origin_goal_id, target_goal_id) AS (
         SELECT source_goal_id, target_goal_id FROM edge
         UNION
         SELECT reach.origin_goal_id, edge.target_goal_id
         FROM reach JOIN edge ON edge.source_goal_id = reach.target_goal_id
       )
       SELECT 1 FROM reach WHERE origin_goal_id = target_goal_id
     );
   END`,
] as const

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* initialize(tx)
    yield* Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
    yield* backfillStateGuard(tx)
    yield* Effect.forEach(immutableStatements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
  })
}

export function initialize(tx: Transaction) {
  return Effect.gen(function* () {
    yield* tx
      .insert(LearnerGoalTimeZoneReleaseTable)
      .values({
        id: TIME_ZONE_RELEASE_ID,
        tzdb_version: TZDB_VERSION,
        engine: ENGINE,
        data_sha256: DATA_SHA256,
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    yield* tx.insert(LearnerGoalTimeZoneTable).values(supportedTimeZones).onConflictDoNothing().run().pipe(Effect.orDie)
    const release = yield* tx
      .select()
      .from(LearnerGoalTimeZoneReleaseTable)
      .where(eq(LearnerGoalTimeZoneReleaseTable.id, TIME_ZONE_RELEASE_ID))
      .get()
      .pipe(Effect.orDie)
    if (
      !release ||
      release.tzdb_version !== TZDB_VERSION ||
      release.engine !== ENGINE ||
      release.data_sha256 !== DATA_SHA256
    ) {
      return yield* Effect.die(`Time-zone release ${TIME_ZONE_RELEASE_ID} does not match the bundled authority`)
    }
    const installedNames = yield* tx
      .select({ name: LearnerGoalTimeZoneTable.name })
      .from(LearnerGoalTimeZoneTable)
      .where(eq(LearnerGoalTimeZoneTable.release_id, TIME_ZONE_RELEASE_ID))
      .all()
      .pipe(Effect.orDie)
    const installed = new Set(installedNames.map((row) => row.name))
    if (
      installed.size !== supportedTimeZoneNames.length ||
      supportedTimeZoneNames.some((name) => !installed.has(name))
    ) {
      return yield* Effect.die(`Time-zone release ${TIME_ZONE_RELEASE_ID} has a different identifier set`)
    }
  })
}

export function backfillStateGuard(tx: Transaction) {
  return tx
    .run("INSERT OR IGNORE INTO learner_goal_state_guard (singleton) SELECT singleton FROM learner_goal_state")
    .pipe(Effect.orDie)
}
