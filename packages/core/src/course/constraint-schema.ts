export * as CourseConstraintSchema from "./constraint-schema"

import { Effect } from "effect"
import type { Database } from "../database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const statements = [
  `CREATE TRIGGER IF NOT EXISTS course_state_history_validate_insert
   BEFORE INSERT ON course_state_history
   BEGIN
     SELECT RAISE(ABORT, 'course_state_history_basis_invalid')
     WHERE NOT EXISTS (
       SELECT 1 FROM course
       WHERE course.id = NEW.course_id
         AND course.state_version = NEW.version
         AND course.title = NEW.title
         AND course.withdrawal_reason IS NEW.withdrawal_reason
         AND course.time_updated = NEW.time_updated
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS course_state_history_capture_insert
   AFTER INSERT ON course
   BEGIN
     INSERT INTO course_state_history (course_id, version, title, withdrawal_reason, time_updated)
     VALUES (NEW.id, NEW.state_version, NEW.title, NEW.withdrawal_reason, NEW.time_updated);
   END`,
  `CREATE TRIGGER IF NOT EXISTS course_state_history_capture_update
   AFTER UPDATE OF title, state_version, withdrawal_reason, time_updated ON course
   BEGIN
     INSERT INTO course_state_history (course_id, version, title, withdrawal_reason, time_updated)
     VALUES (NEW.id, NEW.state_version, NEW.title, NEW.withdrawal_reason, NEW.time_updated);
   END`,
  `CREATE TRIGGER IF NOT EXISTS course_state_history_immutable
   BEFORE UPDATE ON course_state_history
   BEGIN
     SELECT RAISE(ABORT, 'course_state_history_immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS course_state_history_delete_forbidden
   BEFORE DELETE ON course_state_history
   BEGIN
     SELECT RAISE(ABORT, 'course_state_history_delete_forbidden');
   END`,
] as const

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
