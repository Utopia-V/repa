export const statements = [
  `CREATE TRIGGER IF NOT EXISTS future_attention_change_set_projection_once
BEFORE UPDATE ON future_attention_change_set
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN json_extract(OLD.admission_projection, '$.state') <> 'preparing'
      OR json_extract(NEW.admission_projection, '$.state') IS NOT NULL
      OR json_type(NEW.admission_projection, '$.changes') <> 'array'
      OR NEW.id <> OLD.id OR NEW.occurrence_id <> OLD.occurrence_id OR NEW.slot <> OLD.slot
      OR NEW.canonical_command <> OLD.canonical_command OR NEW.command_fingerprint <> OLD.command_fingerprint
      OR NEW.invocation_part_id <> OLD.invocation_part_id OR NEW.physical_receipt_id <> OLD.physical_receipt_id
      OR NEW.time_committed <> OLD.time_committed OR NEW.commit_order <> OLD.commit_order
      OR NEW.frontier_sequence <> OLD.frontier_sequence
    THEN RAISE(ABORT, 'future_attention_change_set_projection_once')
  END;
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_change_set_immutable
BEFORE DELETE ON future_attention_change_set
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'future_attention_change_set_immutable');
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_concern_immutable_payload
BEFORE UPDATE ON future_attention_concern
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.id <> OLD.id
      OR NEW.predecessor_concern_id IS NOT OLD.predecessor_concern_id
      OR NEW.create_change_set_id <> OLD.create_change_set_id OR NEW.purpose <> OLD.purpose
      OR NEW.source_relation <> OLD.source_relation OR NEW.source <> OLD.source
      OR NEW.course_id <> OLD.course_id OR NEW.view_id <> OLD.view_id
      OR NEW.course_revision_id <> OLD.course_revision_id OR NEW.course_item_id <> OLD.course_item_id
      OR NEW.selection <> OLD.selection OR NEW.membership_receipt <> OLD.membership_receipt
      OR NEW.not_before_instant <> OLD.not_before_instant
      OR NEW.temporal_source_expression <> OLD.temporal_source_expression
      OR NEW.effective_utc_offset_minutes <> OLD.effective_utc_offset_minutes
      OR NEW.resolved_zone <> OLD.resolved_zone OR NEW.service_timing <> OLD.service_timing
      OR NEW.interaction_order IS NOT OLD.interaction_order OR NEW.semantic_value <> OLD.semantic_value
      OR NEW.semantic_bytes <> OLD.semantic_bytes OR NEW.time_created <> OLD.time_created
      OR NEW.current_version <> OLD.current_version + 1
    THEN RAISE(ABORT, 'future_attention_concern_immutable_payload')
  END;
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM future_attention_transition t
      WHERE t.id = NEW.current_transition_id AND t.concern_id = NEW.id
        AND t.version = NEW.current_version AND t.predecessor_transition_id = OLD.current_transition_id
    )
    THEN RAISE(ABORT, 'future_attention_concern_head_transition')
  END;
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_concern_no_delete
BEFORE DELETE ON future_attention_concern
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'future_attention_concern_no_delete');
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_transition_topology
BEFORE INSERT ON future_attention_transition
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.kind = 'created' AND NOT (
      NEW.version = 0 AND NEW.predecessor_transition_id IS NULL AND NEW.disposition = 'open'
      AND NEW.mutation IS NULL AND NEW.rationale IS NULL AND NEW.service_receipt_id IS NULL
      AND EXISTS (
        SELECT 1 FROM future_attention_concern c
        WHERE c.id = NEW.concern_id AND c.current_transition_id = NEW.id AND c.current_version = 0
      )
    ) THEN RAISE(ABORT, 'future_attention_transition_created')
    WHEN NEW.kind <> 'created' AND NOT EXISTS (
      SELECT 1 FROM future_attention_concern c
      JOIN future_attention_transition p ON p.id = c.current_transition_id
      WHERE c.id = NEW.concern_id AND c.current_transition_id = NEW.predecessor_transition_id
        AND c.current_version + 1 = NEW.version AND p.version = c.current_version
    ) THEN RAISE(ABORT, 'future_attention_transition_predecessor')
    WHEN NEW.kind = 'superseded' AND NOT (
      NEW.disposition = 'superseded' AND NEW.mutation IS NOT NULL AND NEW.service_receipt_id IS NULL
      AND EXISTS (
        SELECT 1 FROM future_attention_transition p
        WHERE p.id = NEW.predecessor_transition_id AND p.disposition IN ('open', 'served', 'dismissed')
      )
    ) THEN RAISE(ABORT, 'future_attention_transition_superseded')
    WHEN NEW.kind IN ('served', 'served_by_correction') AND NOT (
      NEW.disposition = 'served' AND NEW.service_receipt_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM future_attention_transition p
        WHERE p.id = NEW.predecessor_transition_id AND p.disposition = 'open'
      )
      AND EXISTS (
        SELECT 1 FROM future_attention_service_receipt r
        WHERE r.id = NEW.service_receipt_id AND r.transition_id = NEW.id
      )
    ) THEN RAISE(ABORT, 'future_attention_transition_served')
    WHEN NEW.kind IN ('dismissed', 'dismissed_by_correction') AND NOT (
      NEW.disposition = 'dismissed' AND NEW.service_receipt_id IS NULL
      AND EXISTS (
        SELECT 1 FROM future_attention_transition p
        WHERE p.id = NEW.predecessor_transition_id AND p.disposition IN ('open', 'served')
      )
    ) THEN RAISE(ABORT, 'future_attention_transition_dismissed')
    WHEN NEW.kind = 'reopened' AND NOT (
      NEW.disposition = 'open' AND NEW.mutation IS NOT NULL AND NEW.service_receipt_id IS NULL
      AND EXISTS (
        SELECT 1 FROM future_attention_transition p
        WHERE p.id = NEW.predecessor_transition_id AND p.disposition IN ('served', 'dismissed')
      )
    ) THEN RAISE(ABORT, 'future_attention_transition_reopened')
  END;
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_transition_immutable
BEFORE UPDATE ON future_attention_transition
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'future_attention_transition_immutable');
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_transition_no_delete
BEFORE DELETE ON future_attention_transition
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'future_attention_transition_no_delete');
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_service_receipt_immutable
BEFORE UPDATE ON future_attention_service_receipt
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'future_attention_service_receipt_immutable');
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_service_receipt_no_delete
BEFORE DELETE ON future_attention_service_receipt
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'future_attention_service_receipt_no_delete');
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_claim_group_binding
BEFORE INSERT ON future_attention_claim_group
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM future_attention_change_set c
    JOIN learning_command_receipt r ON r.id = c.physical_receipt_id
    JOIN learning_command_invocation i ON i.part_id = c.invocation_part_id
    WHERE c.id = NEW.change_set_id AND c.physical_receipt_id = NEW.physical_receipt_id
      AND c.invocation_part_id = NEW.invocation_part_id AND c.occurrence_id = NEW.occurrence_id
      AND r.invocation_part_id = NEW.invocation_part_id AND i.assistant_message_id = NEW.assistant_message_id
      AND i.turn_id = NEW.turn_id AND i.session_id = NEW.session_id
  ) THEN RAISE(ABORT, 'future_attention_claim_group_binding') END;
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_claim_group_immutable
BEFORE UPDATE ON future_attention_claim_group
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'future_attention_claim_group_immutable');
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_claim_member_binding
BEFORE INSERT ON future_attention_claim_member
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM future_attention_concern c
    JOIN future_attention_transition t ON t.id = c.current_transition_id
    WHERE c.id = NEW.concern_id AND c.current_version = NEW.expected_version
      AND c.current_transition_id = NEW.expected_transition_id AND t.disposition = 'open'
  ) THEN RAISE(ABORT, 'future_attention_claim_member_binding') END;
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_claim_member_immutable
BEFORE UPDATE ON future_attention_claim_member
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'future_attention_claim_member_immutable');
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_claim_finalization_complete
BEFORE INSERT ON future_attention_claim_finalization
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN json_array_length(NEW.member_results) <> (
      SELECT count(*) FROM future_attention_claim_member m WHERE m.group_id = NEW.group_id
    ) THEN RAISE(ABORT, 'future_attention_claim_finalization_member_count')
    WHEN NEW.outcome = 'served' AND EXISTS (
      SELECT 1 FROM json_each(NEW.member_results) WHERE json_extract(value, '$.outcome') <> 'served'
    ) THEN RAISE(ABORT, 'future_attention_claim_finalization_served_shape')
    WHEN NEW.outcome = 'not_served' AND EXISTS (
      SELECT 1 FROM json_each(NEW.member_results) WHERE json_extract(value, '$.outcome') <> 'not_served'
    ) THEN RAISE(ABORT, 'future_attention_claim_finalization_not_served_shape')
  END;
END`,
  `CREATE TRIGGER IF NOT EXISTS future_attention_claim_finalization_immutable
BEFORE UPDATE ON future_attention_claim_finalization
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'future_attention_claim_finalization_immutable');
END`,
] as const
