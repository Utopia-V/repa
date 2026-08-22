import { Effect } from "effect"
import type { Database } from "./database"
import { install as installV23, triggerStatements as triggerStatementsV23, viewStatements } from "./schema-extras-v23"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function triggerName(statement: string) {
  return /CREATE TRIGGER IF NOT EXISTS ([^\s]+)/i.exec(statement)?.[1]
}

export { viewStatements }

const sessionInsertRetiredGuard = `CREATE TRIGGER IF NOT EXISTS session_insert_retired_guard_v24
BEFORE INSERT ON session
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM session_deletion_control_receipt AS receipt
  WHERE receipt.root_session_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'session_id_retired');
END;`

const sessionFrontierCreate = `CREATE TRIGGER IF NOT EXISTS session_presentation_frontier_create_v24
AFTER INSERT ON session
FOR EACH ROW
BEGIN
  INSERT INTO session_presentation_frontier(session_id, frontier_time, message_count, frontier_version)
  VALUES (NEW.id, 0, 0, 1)
  ON CONFLICT(session_id) DO NOTHING;
END;`

const messageFrontierGuard = `CREATE TRIGGER IF NOT EXISTS message_presentation_frontier_guard_v24
BEFORE INSERT ON message
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM message AS existing
  WHERE existing.id = NEW.id
    AND existing.session_id = NEW.session_id
    AND existing.time_created = NEW.time_created
)
AND (
  NOT EXISTS (
    SELECT 1 FROM session_presentation_frontier AS frontier
    WHERE frontier.session_id = NEW.session_id
  )
  OR (
    NEW.time_created <= (
      SELECT frontier.frontier_time
      FROM session_presentation_frontier AS frontier
      WHERE frontier.session_id = NEW.session_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM session_administrative_history AS history
      WHERE history.session_id = NEW.session_id
        AND (
          SELECT count(*)
          FROM session_administrative_history_message AS member
          WHERE member.session_id = history.session_id
        ) < history.message_count
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'session_presentation_frontier_violation');
END;`

const messageFrontierAdvance = `CREATE TRIGGER IF NOT EXISTS message_presentation_frontier_advance_v24
AFTER INSERT ON message
FOR EACH ROW
BEGIN
  UPDATE session_presentation_frontier
  SET frontier_time = max(frontier_time, NEW.time_created),
      message_count = message_count + 1
  WHERE session_id = NEW.session_id;
END;`

const messageFrontierRemove = `CREATE TRIGGER IF NOT EXISTS message_presentation_frontier_remove_v24
AFTER DELETE ON message
FOR EACH ROW
BEGIN
  UPDATE session_presentation_frontier
  SET message_count = message_count - 1
  WHERE session_id = OLD.session_id;
END;`

const messageCreatedImmutable = `CREATE TRIGGER IF NOT EXISTS message_presentation_time_immutable_v24
BEFORE UPDATE OF time_created ON message
FOR EACH ROW
WHEN NEW.time_created <> OLD.time_created
BEGIN
  SELECT RAISE(ABORT, 'message_presentation_time_immutable');
END;`

const historicalInputGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_turn_input_guard_v24
BEFORE INSERT ON turn_input
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM session_administrative_history_message AS history
  WHERE history.message_id = NEW.message_id
)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_not_executable');
END;`

const historicalModelGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_model_operation_guard_v24
BEFORE INSERT ON turn_model_operation
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM session_administrative_history_message AS history
  WHERE history.message_id = NEW.assistant_message_id
)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_not_executable');
END;`

const historicalCandidateGuard = `CREATE TRIGGER IF NOT EXISTS administrative_history_tool_candidate_guard_v24
BEFORE INSERT ON turn_tool_candidate
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM session_administrative_history_part AS history
  WHERE history.part_id = NEW.part_id
)
BEGIN
  SELECT RAISE(ABORT, 'administrative_history_not_executable');
END;`
const deletionControlReceiptUpdateGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_control_receipt_update_guard_v24
BEFORE UPDATE ON session_deletion_control_receipt
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_control_receipt_immutable');
END;`

const deletionControlReceiptDeleteGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_control_receipt_delete_guard_v24
BEFORE DELETE ON session_deletion_control_receipt
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_control_receipt_immutable');
END;`

const deletionAuditBundleInsertGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_audit_bundle_insert_guard_v24
BEFORE INSERT ON session_deletion_audit_bundle
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM session_deletion_control_receipt AS receipt
  WHERE receipt.request_id = NEW.deletion_request_id
    AND receipt.mode = 'minimal_audit'
    AND NOT EXISTS (
      SELECT 1 FROM session_deletion_purge_receipt AS purge
      WHERE purge.deletion_request_id = receipt.request_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_lifecycle_invalid');
END;`

const deletionAuditBundleUpdateGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_audit_bundle_update_guard_v24
BEFORE UPDATE ON session_deletion_audit_bundle
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_immutable');
END;`

const deletionAuditBundleDeleteGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_audit_bundle_delete_guard_v24
BEFORE DELETE ON session_deletion_audit_bundle
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM session_deletion_purge_receipt AS purge
  WHERE purge.deletion_request_id = OLD.deletion_request_id
)
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_requires_purge_settlement');
END;`

const deletionAuditOperationInsertGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_audit_operation_insert_guard_v24
BEFORE INSERT ON session_deletion_audit_operation
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM session_deletion_audit_bundle AS bundle
  JOIN session_deletion_control_receipt AS receipt ON receipt.request_id = bundle.deletion_request_id
  JOIN session ON session.id = receipt.root_session_id
  WHERE bundle.id = NEW.bundle_id
)
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_sealed');
END;`

const deletionAuditOperationUpdateGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_audit_operation_update_guard_v24
BEFORE UPDATE ON session_deletion_audit_operation
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_immutable');
END;`

const deletionAuditOperationDeleteGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_audit_operation_delete_guard_v24
BEFORE DELETE ON session_deletion_audit_operation
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM session_deletion_audit_bundle AS bundle
  JOIN session_deletion_purge_receipt AS purge ON purge.deletion_request_id = bundle.deletion_request_id
  WHERE bundle.id = OLD.bundle_id
)
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_immutable');
END;`

const deletionAuditRecordInsertGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_audit_record_insert_guard_v24
BEFORE INSERT ON session_deletion_audit_record
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM session_deletion_audit_bundle AS bundle
  JOIN session_deletion_control_receipt AS receipt ON receipt.request_id = bundle.deletion_request_id
  JOIN session ON session.id = receipt.root_session_id
  WHERE bundle.id = NEW.bundle_id
)
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_sealed');
END;`

const deletionAuditRecordUpdateGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_audit_record_update_guard_v24
BEFORE UPDATE ON session_deletion_audit_record
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_immutable');
END;`

const deletionAuditRecordDeleteGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_audit_record_delete_guard_v24
BEFORE DELETE ON session_deletion_audit_record
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM session_deletion_audit_bundle AS bundle
  JOIN session_deletion_purge_receipt AS purge ON purge.deletion_request_id = bundle.deletion_request_id
  WHERE bundle.id = OLD.bundle_id
)
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_immutable');
END;`

const deletionPurgeInsertGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_purge_receipt_insert_guard_v24
BEFORE INSERT ON session_deletion_purge_receipt
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM session_deletion_control_receipt AS receipt
  JOIN session_deletion_audit_bundle AS bundle ON bundle.deletion_request_id = receipt.request_id
  WHERE receipt.request_id = NEW.deletion_request_id
    AND receipt.mode = 'minimal_audit'
)
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_audit_lifecycle_invalid');
END;`

const deletionPurgeUpdateGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_purge_receipt_update_guard_v24
BEFORE UPDATE ON session_deletion_purge_receipt
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_purge_receipt_immutable');
END;`

const deletionPurgeDeleteGuard = `CREATE TRIGGER IF NOT EXISTS session_deletion_purge_receipt_delete_guard_v24
BEFORE DELETE ON session_deletion_purge_receipt
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'session_deletion_purge_receipt_immutable');
END;`

export const triggerStatements = [
  ...triggerStatementsV23,
  sessionInsertRetiredGuard,
  sessionFrontierCreate,
  messageFrontierGuard,
  messageFrontierAdvance,
  messageFrontierRemove,
  messageCreatedImmutable,
  historicalInputGuard,
  historicalModelGuard,
  historicalCandidateGuard,
  deletionControlReceiptUpdateGuard,
  deletionControlReceiptDeleteGuard,
  deletionAuditBundleInsertGuard,
  deletionAuditBundleUpdateGuard,
  deletionAuditBundleDeleteGuard,
  deletionAuditOperationInsertGuard,
  deletionAuditOperationUpdateGuard,
  deletionAuditOperationDeleteGuard,
  deletionAuditRecordInsertGuard,
  deletionAuditRecordUpdateGuard,
  deletionAuditRecordDeleteGuard,
  deletionPurgeInsertGuard,
  deletionPurgeUpdateGuard,
  deletionPurgeDeleteGuard,
]

export const triggerNames = triggerStatements.map((statement) => {
  const name = triggerName(statement)
  if (!name) throw new Error("The V24 trigger manifest contains a statement without a trigger name")
  return name
})

export function install(tx: Transaction) {
  return Effect.gen(function* () {
    yield* installV23(tx)
    yield* Effect.forEach(
      triggerStatements.slice(triggerStatementsV23.length),
      (statement) => tx.run(statement).pipe(Effect.orDie),
      { discard: true },
    )
  })
}
