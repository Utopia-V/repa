export * as LearnerNavigationConstraintSchema from "./constraint-schema"

import { Effect } from "effect"
import type { Database } from "../database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const statements = [
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_conflict_forbidden
   BEFORE INSERT ON learner_default_course_transition
   WHEN EXISTS (
     SELECT 1
     FROM learner_default_course_transition AS existing
     WHERE existing.id = NEW.id
       OR existing.version = NEW.version
       OR (NEW.predecessor_id IS NOT NULL AND existing.predecessor_id = NEW.predecessor_id)
       OR existing.occurrence_id = NEW.occurrence_id
       OR existing.frontier_sequence = NEW.frontier_sequence
   )
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_conflict_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_validate_insert
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
     SELECT RAISE(ABORT, 'learner_default_course_confirmation_invalid')
     WHERE json_type(NEW.confirmation_snapshot) IS NOT 'object'
        OR (SELECT count(*) FROM json_each(NEW.confirmation_snapshot)) <> 6
        OR EXISTS (
          SELECT 1 FROM json_each(NEW.confirmation_snapshot)
          WHERE key NOT IN ('permissionRequestID', 'headID', 'version', 'fromCourseID', 'fromCourseTitle', 'target')
        )
        OR json_type(NEW.confirmation_snapshot, '$.permissionRequestID') IS NOT 'text'
        OR json_extract(NEW.confirmation_snapshot, '$.permissionRequestID') IS NOT NEW.permission_request_id
        OR ((NEW.predecessor_id IS NULL AND json_type(NEW.confirmation_snapshot, '$.headID') IS NOT 'null')
          OR (NEW.predecessor_id IS NOT NULL AND json_type(NEW.confirmation_snapshot, '$.headID') IS NOT 'text'))
        OR NOT (json_extract(NEW.confirmation_snapshot, '$.headID') IS NEW.predecessor_id)
        OR json_type(NEW.confirmation_snapshot, '$.version') IS NOT 'integer'
        OR json_extract(NEW.confirmation_snapshot, '$.version') IS NOT NEW.version - 1
        OR ((NEW.previous_course_id IS NULL AND json_type(NEW.confirmation_snapshot, '$.fromCourseID') IS NOT 'null')
          OR (NEW.previous_course_id IS NOT NULL AND json_type(NEW.confirmation_snapshot, '$.fromCourseID') IS NOT 'text'))
        OR NOT (json_extract(NEW.confirmation_snapshot, '$.fromCourseID') IS NEW.previous_course_id)
        OR ((NEW.previous_course_id IS NULL AND json_type(NEW.confirmation_snapshot, '$.fromCourseTitle') IS NOT 'null')
          OR (NEW.previous_course_id IS NOT NULL AND json_type(NEW.confirmation_snapshot, '$.fromCourseTitle') IS NOT 'text'))
        OR (NEW.previous_course_id IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM course
             WHERE id = NEW.previous_course_id
               AND title IS json_extract(NEW.confirmation_snapshot, '$.fromCourseTitle')
           ))
        OR (NEW.course_id IS NULL AND json_type(NEW.confirmation_snapshot, '$.target') IS NOT 'null')
        OR (NEW.course_id IS NOT NULL AND (
             json_type(NEW.confirmation_snapshot, '$.target') IS NOT 'object'
          OR (SELECT count(*) FROM json_each(NEW.confirmation_snapshot, '$.target')) <> 9
          OR EXISTS (
               SELECT 1 FROM json_each(NEW.confirmation_snapshot, '$.target')
               WHERE key NOT IN ('courseID', 'courseTitle', 'courseVersion', 'selectionRevisionID', 'selectionVersion', 'viewID', 'viewName', 'viewVersion', 'revisionVersion')
             )
          OR json_type(NEW.confirmation_snapshot, '$.target.courseID') IS NOT 'text'
          OR json_extract(NEW.confirmation_snapshot, '$.target.courseID') IS NOT NEW.course_id
          OR json_type(NEW.confirmation_snapshot, '$.target.courseTitle') IS NOT 'text'
          OR NOT EXISTS (
               SELECT 1 FROM course
               WHERE id = NEW.course_id
                 AND title IS json_extract(NEW.confirmation_snapshot, '$.target.courseTitle')
             )
          OR json_type(NEW.confirmation_snapshot, '$.target.courseVersion') IS NOT 'integer'
          OR json_extract(NEW.confirmation_snapshot, '$.target.courseVersion') IS NOT NEW.target_course_version
          OR ((NEW.target_selection_revision_id IS NULL AND json_type(NEW.confirmation_snapshot, '$.target.selectionRevisionID') IS NOT 'null')
            OR (NEW.target_selection_revision_id IS NOT NULL AND json_type(NEW.confirmation_snapshot, '$.target.selectionRevisionID') IS NOT 'text'))
          OR NOT (json_extract(NEW.confirmation_snapshot, '$.target.selectionRevisionID') IS NEW.target_selection_revision_id)
          OR json_type(NEW.confirmation_snapshot, '$.target.selectionVersion') IS NOT 'integer'
          OR json_extract(NEW.confirmation_snapshot, '$.target.selectionVersion') IS NOT NEW.target_selection_version
          OR ((NEW.target_view_id IS NULL AND json_type(NEW.confirmation_snapshot, '$.target.viewID') IS NOT 'null')
            OR (NEW.target_view_id IS NOT NULL AND json_type(NEW.confirmation_snapshot, '$.target.viewID') IS NOT 'text'))
          OR NOT (json_extract(NEW.confirmation_snapshot, '$.target.viewID') IS NEW.target_view_id)
          OR ((NEW.target_view_id IS NULL AND json_type(NEW.confirmation_snapshot, '$.target.viewName') IS NOT 'null')
            OR (NEW.target_view_id IS NOT NULL AND json_type(NEW.confirmation_snapshot, '$.target.viewName') IS NOT 'text'))
          OR (NEW.target_view_id IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM course_view
               WHERE course_id = NEW.course_id
                 AND id = NEW.target_view_id
                 AND name IS json_extract(NEW.confirmation_snapshot, '$.target.viewName')
             ))
          OR ((NEW.target_view_version IS NULL AND json_type(NEW.confirmation_snapshot, '$.target.viewVersion') IS NOT 'null')
            OR (NEW.target_view_version IS NOT NULL AND json_type(NEW.confirmation_snapshot, '$.target.viewVersion') IS NOT 'integer'))
          OR NOT (json_extract(NEW.confirmation_snapshot, '$.target.viewVersion') IS NEW.target_view_version)
          OR ((NEW.target_revision_version IS NULL AND json_type(NEW.confirmation_snapshot, '$.target.revisionVersion') IS NOT 'null')
            OR (NEW.target_revision_version IS NOT NULL AND json_type(NEW.confirmation_snapshot, '$.target.revisionVersion') IS NOT 'integer'))
          OR NOT (json_extract(NEW.confirmation_snapshot, '$.target.revisionVersion') IS NEW.target_revision_version)
        ));
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_immutable
   BEFORE UPDATE ON learner_default_course_transition
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_delete_forbidden
   BEFORE DELETE ON learner_default_course_transition
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_course_route_anchor_validate_insert
   BEFORE INSERT ON learner_course_route_anchor_transition
   BEGIN
     SELECT RAISE(ABORT, 'learner_course_route_anchor_predecessor_invalid')
     WHERE NEW.predecessor_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM learner_course_route_anchor_transition AS predecessor
         WHERE predecessor.id = NEW.predecessor_id
           AND predecessor.course_id = NEW.course_id
           AND predecessor.version = NEW.version - 1
           AND predecessor.target_view_id IS NEW.previous_view_id
           AND predecessor.target_revision_id IS NEW.previous_revision_id
           AND predecessor.target_item_id IS NEW.previous_item_id
           AND predecessor.time_committed <= NEW.time_committed
           AND predecessor.frontier_sequence < NEW.frontier_sequence
       );
     SELECT RAISE(ABORT, 'learner_course_route_anchor_frontier_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_shared_frontier
       WHERE sequence = NEW.frontier_sequence AND time_committed = NEW.frontier_time
     )
       OR EXISTS (
         SELECT 1 FROM learner_default_course_transition
         WHERE frontier_sequence = NEW.frontier_sequence
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_course_route_anchor_conflict_forbidden
   BEFORE INSERT ON learner_course_route_anchor_transition
   WHEN EXISTS (
     SELECT 1
     FROM learner_course_route_anchor_transition AS existing
     WHERE existing.id = NEW.id
       OR (existing.course_id = NEW.course_id AND existing.id = NEW.id)
       OR (existing.course_id = NEW.course_id AND existing.version = NEW.version)
       OR (
         NEW.predecessor_id IS NOT NULL
         AND existing.course_id = NEW.course_id
         AND existing.predecessor_id = NEW.predecessor_id
       )
       OR (existing.occurrence_id = NEW.occurrence_id AND existing.course_id = NEW.course_id)
       OR existing.frontier_sequence = NEW.frontier_sequence
   )
   BEGIN
     SELECT RAISE(ABORT, 'learner_course_route_anchor_conflict_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_course_route_anchor_immutable
   BEFORE UPDATE ON learner_course_route_anchor_transition
   BEGIN
     SELECT RAISE(ABORT, 'learner_course_route_anchor_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_course_route_anchor_delete_forbidden
   BEFORE DELETE ON learner_course_route_anchor_transition
   BEGIN
     SELECT RAISE(ABORT, 'learner_course_route_anchor_delete_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_default_course_receipt_validate_insert
   BEFORE INSERT ON learning_command_receipt
   WHEN NEW.default_navigation_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'learner_default_course_receipt_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_default_course_transition AS transition
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = transition.occurrence_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE transition.id = NEW.default_navigation_effect_id
         AND transition.occurrence_id = NEW.occurrence_id
         AND transition.permission_request_id = NEW.permission_request_id
         AND transition.confirmation_snapshot IS NEW.confirmation_snapshot
         AND transition.time_committed = NEW.time_committed
         AND transition.commit_order = NEW.commit_order
         AND occurrence.origin_session_id = NEW.origin_session_id
         AND occurrence.origin_message_id = NEW.origin_message_id
         AND invocation.occurrence_id = NEW.occurrence_id
         AND invocation.assistant_message_id = NEW.assistant_message_id
         AND invocation.command_name = 'set_default_course_preference'
         AND invocation.capability_identity = NEW.capability_identity
         AND invocation.capability_version = NEW.capability_version
         AND invocation.authorization_basis = NEW.authorization_basis
         AND invocation.permission_request_id = NEW.permission_request_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_course_route_anchor_receipt_validate_insert
   BEFORE INSERT ON learning_command_receipt
   WHEN NEW.anchor_navigation_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'learner_course_route_anchor_receipt_invalid')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_course_route_anchor_transition AS transition
       JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = transition.occurrence_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE transition.id = NEW.anchor_navigation_effect_id
         AND transition.occurrence_id = NEW.occurrence_id
         AND transition.time_committed = NEW.time_committed
         AND transition.commit_order = NEW.commit_order
         AND occurrence.origin_session_id = NEW.origin_session_id
         AND occurrence.origin_message_id = NEW.origin_message_id
         AND invocation.occurrence_id = NEW.occurrence_id
         AND invocation.assistant_message_id = NEW.assistant_message_id
         AND invocation.command_name = 'set_course_route_anchor'
         AND invocation.capability_identity = NEW.capability_identity
         AND invocation.capability_version = NEW.capability_version
         AND invocation.authorization_basis = NEW.authorization_basis
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_navigation_receipt_conflict_forbidden
   BEFORE INSERT ON learning_command_receipt
   WHEN EXISTS (
     SELECT 1
     FROM learning_command_receipt AS existing
      WHERE (
        existing.default_navigation_effect_id IS NOT NULL
        OR existing.anchor_navigation_effect_id IS NOT NULL
        OR NEW.default_navigation_effect_id IS NOT NULL
        OR NEW.anchor_navigation_effect_id IS NOT NULL
      )
       AND (
         existing.id = NEW.id
         OR existing.invocation_part_id = NEW.invocation_part_id
         OR (
           NEW.default_navigation_effect_id IS NOT NULL
           AND existing.default_navigation_effect_id = NEW.default_navigation_effect_id
         )
         OR (
           NEW.anchor_navigation_effect_id IS NOT NULL
           AND existing.anchor_navigation_effect_id = NEW.anchor_navigation_effect_id
         )
       )
   )
   BEGIN
     SELECT RAISE(ABORT, 'learner_navigation_receipt_conflict_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_navigation_receipt_update_conflict_forbidden
   BEFORE UPDATE ON learning_command_receipt
   WHEN EXISTS (
     SELECT 1
     FROM learning_command_receipt AS existing
     WHERE existing.id <> OLD.id
       AND (existing.default_navigation_effect_id IS NOT NULL OR existing.anchor_navigation_effect_id IS NOT NULL)
       AND (
         existing.id = NEW.id
         OR existing.invocation_part_id = NEW.invocation_part_id
         OR (
           NEW.default_navigation_effect_id IS NOT NULL
           AND existing.default_navigation_effect_id = NEW.default_navigation_effect_id
         )
         OR (
           NEW.anchor_navigation_effect_id IS NOT NULL
           AND existing.anchor_navigation_effect_id = NEW.anchor_navigation_effect_id
         )
       )
   )
   BEGIN
     SELECT RAISE(ABORT, 'learner_navigation_receipt_update_conflict_forbidden');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_navigation_receipt_immutable
   BEFORE UPDATE ON learning_command_receipt
   WHEN OLD.default_navigation_effect_id IS NOT NULL
     OR OLD.anchor_navigation_effect_id IS NOT NULL
     OR NEW.default_navigation_effect_id IS NOT NULL
     OR NEW.anchor_navigation_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'learner_navigation_receipt_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_navigation_receipt_delete_forbidden
   BEFORE DELETE ON learning_command_receipt
   WHEN OLD.default_navigation_effect_id IS NOT NULL OR OLD.anchor_navigation_effect_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'learner_navigation_receipt_delete_forbidden');
   END`,
] as const

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
