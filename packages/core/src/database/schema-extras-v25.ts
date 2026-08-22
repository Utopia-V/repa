import { Effect } from "effect"
import type { Database } from "./database"
import { install as installV24, triggerStatements as triggerStatementsV24, viewStatements } from "./schema-extras-v24"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

export { viewStatements }

const historicalMessageUpdateGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_message_update_guard_v25
BEFORE UPDATE ON message
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM session_administrative_history_message AS history WHERE history.message_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_message_immutable');
END;`

const historicalMessageDeleteGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_message_delete_guard_v25
BEFORE DELETE ON message
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM session_administrative_history_message AS history WHERE history.message_id = OLD.id)
AND EXISTS (SELECT 1 FROM session WHERE session.id = OLD.session_id)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_message_immutable');
END;`

const historicalEmbeddedCandidateGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_embedded_tool_candidate_guard_v25
BEFORE INSERT ON turn_tool_candidate
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM session_administrative_history_embedded_part AS history WHERE history.part_id = NEW.part_id
)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_not_executable');
END;`

const historicalPartInsertGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_part_insert_guard_v25
BEFORE INSERT ON part
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM session_administrative_history_message AS history
  WHERE history.session_id = NEW.session_id AND history.message_id = NEW.message_id
  UNION ALL
  SELECT 1 FROM session_administrative_history_embedded_part AS history WHERE history.part_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_part_immutable');
END;`

const historicalPartUpdateGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_part_update_guard_v25
BEFORE UPDATE ON part
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM session_administrative_history_part AS history WHERE history.part_id = OLD.id
  UNION ALL
  SELECT 1 FROM session_administrative_history_message AS history
  WHERE history.session_id = OLD.session_id AND history.message_id = OLD.message_id
)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_part_immutable');
END;`

const historicalPartDeleteGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_part_delete_guard_v25
BEFORE DELETE ON part
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM session_administrative_history_part AS history WHERE history.part_id = OLD.id)
AND EXISTS (SELECT 1 FROM session WHERE session.id = OLD.session_id)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_part_immutable');
END;`

const administrativeHistoryUpdateGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_update_guard_v25
BEFORE UPDATE ON session_administrative_history
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_immutable');
END;`

const administrativeHistoryDeleteGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_delete_guard_v25
BEFORE DELETE ON session_administrative_history
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM session WHERE session.id = OLD.session_id)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_immutable');
END;`

const administrativeHistoryMessageInsertGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_message_insert_guard_v25
BEFORE INSERT ON session_administrative_history_message
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM session_administrative_history AS history
  WHERE history.session_id = NEW.session_id
    AND (SELECT count(*) FROM session_administrative_history_message AS member
         WHERE member.session_id = history.session_id) < history.message_count
)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_sealed');
END;`

const administrativeHistoryMessageUpdateGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_message_member_update_guard_v25
BEFORE UPDATE ON session_administrative_history_message
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_immutable');
END;`

const administrativeHistoryMessageDeleteGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_message_member_delete_guard_v25
BEFORE DELETE ON session_administrative_history_message
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM session WHERE session.id = OLD.session_id)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_immutable');
END;`

const administrativeHistoryPartMemberInsertGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_part_member_insert_guard_v25
BEFORE INSERT ON session_administrative_history_part
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM session_administrative_history AS history
  JOIN session_administrative_history_message AS message
    ON message.session_id = history.session_id
   AND message.message_id = NEW.message_id
   AND message.ordinal = NEW.message_ordinal
  WHERE history.session_id = NEW.session_id
    AND (
      (SELECT count(*) FROM session_administrative_history_part AS part WHERE part.session_id = history.session_id)
      +
      (SELECT count(*) FROM session_administrative_history_embedded_part AS part
       WHERE part.session_id = history.session_id)
    ) < history.part_count
)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_membership_invalid');
END;`

const administrativeHistoryPartMemberUpdateGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_part_member_update_guard_v25
BEFORE UPDATE ON session_administrative_history_part
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_immutable');
END;`

const administrativeHistoryPartMemberDeleteGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_part_member_delete_guard_v25
BEFORE DELETE ON session_administrative_history_part
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM session WHERE session.id = OLD.session_id)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_immutable');
END;`

const administrativeHistoryEmbeddedPartInsertGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_embedded_part_insert_guard_v25
BEFORE INSERT ON session_administrative_history_embedded_part
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM session_administrative_history AS history
  JOIN session_administrative_history_part AS parent
    ON parent.session_id = history.session_id
   AND parent.message_id = NEW.message_id
   AND parent.part_id = NEW.parent_part_id
   AND parent.message_ordinal = NEW.message_ordinal
   AND parent.part_ordinal = NEW.part_ordinal
  WHERE history.session_id = NEW.session_id
    AND (
      (SELECT count(*) FROM session_administrative_history_part AS part WHERE part.session_id = history.session_id)
      +
      (SELECT count(*) FROM session_administrative_history_embedded_part AS part
       WHERE part.session_id = history.session_id)
    ) < history.part_count
)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_membership_invalid');
END;`

const administrativeHistoryEmbeddedPartUpdateGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_embedded_part_update_guard_v25
BEFORE UPDATE ON session_administrative_history_embedded_part
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_immutable');
END;`

const administrativeHistoryEmbeddedPartDeleteGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_embedded_part_delete_guard_v25
BEFORE DELETE ON session_administrative_history_embedded_part
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM session WHERE session.id = OLD.session_id)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_immutable');
END;`

export const triggerStatements = [
  ...triggerStatementsV24,
  historicalMessageUpdateGuard,
  historicalMessageDeleteGuard,
  historicalEmbeddedCandidateGuard,
  historicalPartInsertGuard,
  historicalPartUpdateGuard,
  historicalPartDeleteGuard,
  administrativeHistoryUpdateGuard,
  administrativeHistoryDeleteGuard,
  administrativeHistoryMessageInsertGuard,
  administrativeHistoryMessageUpdateGuard,
  administrativeHistoryMessageDeleteGuard,
  administrativeHistoryPartMemberInsertGuard,
  administrativeHistoryPartMemberUpdateGuard,
  administrativeHistoryPartMemberDeleteGuard,
  administrativeHistoryEmbeddedPartInsertGuard,
  administrativeHistoryEmbeddedPartUpdateGuard,
  administrativeHistoryEmbeddedPartDeleteGuard,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V25 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV24(tx)
    yield* Effect.forEach(
      triggerStatements.slice(triggerStatementsV24.length),
      (statement) => tx.run(statement).pipe(Effect.orDie),
      { discard: true },
    )
  })
}
