export * as MaterialMapConstraintSchema from "./constraint-schema"

import { Effect } from "effect"
import type { Database } from "../database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const statements = [
  `CREATE TRIGGER IF NOT EXISTS material_map_validate_insert
  BEFORE INSERT ON material_map
  BEGIN
    SELECT CASE WHEN NOT (
      (NEW.target_kind = 'artifact'
        AND (SELECT count(*) FROM material_map_artifact_target WHERE map_id = NEW.id) = 1
        AND (SELECT count(*) FROM material_map_representation_target WHERE map_id = NEW.id) = 0)
      OR
      (NEW.target_kind = 'representation'
        AND (SELECT count(*) FROM material_map_artifact_target WHERE map_id = NEW.id) = 0
        AND (SELECT count(*) FROM material_map_representation_target WHERE map_id = NEW.id) = 1)
    ) THEN RAISE(ABORT, 'material map target arm is incomplete') END;
    SELECT CASE WHEN (SELECT count(*) FROM material_map_state WHERE map_id = NEW.id AND version = 0 AND disposition = 'active' AND withdrawal_reason IS NULL) <> 1
      THEN RAISE(ABORT, 'material map initial state is incomplete') END;
    SELECT CASE WHEN (SELECT count(*) FROM material_map_disposition_event WHERE map_id = NEW.id AND version = 0 AND disposition = 'active' AND reason IS NULL) <> 1
      THEN RAISE(ABORT, 'material map initial history is incomplete') END;
    SELECT CASE WHEN (SELECT count(*) FROM material_outline_node WHERE map_id = NEW.id) < 1
      THEN RAISE(ABORT, 'material map outline is empty') END;
    SELECT CASE WHEN (SELECT count(*) FROM material_outline_node WHERE map_id = NEW.id) > 2000
      THEN RAISE(ABORT, 'material map outline exceeds limit') END;
    SELECT CASE WHEN (SELECT count(*) FROM material_selector WHERE map_id = NEW.id) < 1
      THEN RAISE(ABORT, 'material map selectors are empty') END;
    SELECT CASE WHEN (SELECT count(*) FROM material_selector WHERE map_id = NEW.id) > 10000
      THEN RAISE(ABORT, 'material map selectors exceed limit') END;
    SELECT CASE WHEN (
      SELECT min(preorder_position) <> 0
        OR max(preorder_position) <> count(*) - 1
      FROM material_outline_node WHERE map_id = NEW.id
    ) THEN RAISE(ABORT, 'material map preorder is not contiguous') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM material_outline_node AS node
      WHERE node.map_id = NEW.id AND node.depth > 0 AND NOT EXISTS (
        SELECT 1 FROM material_outline_node AS parent
        WHERE parent.map_id = NEW.id
          AND parent.id = node.parent_node_id
          AND parent.depth = node.depth - 1
          AND parent.preorder_position = (
            SELECT max(candidate.preorder_position)
            FROM material_outline_node AS candidate
            WHERE candidate.map_id = NEW.id
              AND candidate.preorder_position < node.preorder_position
              AND candidate.depth = node.depth - 1
              AND NOT EXISTS (
                SELECT 1 FROM material_outline_node AS barrier
                WHERE barrier.map_id = NEW.id
                  AND barrier.preorder_position > candidate.preorder_position
                  AND barrier.preorder_position < node.preorder_position
                  AND barrier.depth < node.depth
              )
          )
      )
    ) THEN RAISE(ABORT, 'material map parent is not the preorder owner') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM material_outline_node AS node
      WHERE node.map_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM material_outline_node AS child
          WHERE child.map_id = NEW.id AND child.parent_node_id = node.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM material_selector AS selector
          WHERE selector.map_id = NEW.id AND selector.node_id = node.id
        )
    ) THEN RAISE(ABORT, 'material map leaf has no selector') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM material_outline_node AS node
      WHERE node.map_id = NEW.id AND EXISTS (
        SELECT 1 FROM material_selector AS selector WHERE selector.map_id = NEW.id AND selector.node_id = node.id
      ) AND (
        (SELECT min(selector_position) FROM material_selector WHERE map_id = NEW.id AND node_id = node.id) <> 0
        OR
        (SELECT max(selector_position) FROM material_selector WHERE map_id = NEW.id AND node_id = node.id)
          <> (SELECT count(*) - 1 FROM material_selector WHERE map_id = NEW.id AND node_id = node.id)
      )
    ) THEN RAISE(ABORT, 'material selector order is not contiguous') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_identity_immutable
  BEFORE UPDATE ON material_map BEGIN SELECT RAISE(ABORT, 'material map identity is immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_delete_forbidden
  BEFORE DELETE ON material_map BEGIN SELECT RAISE(ABORT, 'material map deletion is forbidden'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_artifact_target_publication_closed
  BEFORE INSERT ON material_map_artifact_target WHEN EXISTS (SELECT 1 FROM material_map WHERE id = NEW.map_id)
  BEGIN SELECT RAISE(ABORT, 'material map target publication is closed'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_representation_target_publication_closed
  BEFORE INSERT ON material_map_representation_target WHEN EXISTS (SELECT 1 FROM material_map WHERE id = NEW.map_id)
  BEGIN SELECT RAISE(ABORT, 'material map target publication is closed'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_outline_node_publication_closed
  BEFORE INSERT ON material_outline_node WHEN EXISTS (SELECT 1 FROM material_map WHERE id = NEW.map_id)
  BEGIN SELECT RAISE(ABORT, 'material map outline publication is closed'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_selector_publication_closed
  BEFORE INSERT ON material_selector WHEN EXISTS (SELECT 1 FROM material_map WHERE id = NEW.map_id)
  BEGIN SELECT RAISE(ABORT, 'material selector publication is closed'); END`,
  ...[
    "material_map_artifact_target",
    "material_map_representation_target",
    "material_outline_node",
    "material_selector",
  ].flatMap((table) => [
    `CREATE TRIGGER IF NOT EXISTS ${table}_identity_immutable BEFORE UPDATE ON ${table}
    BEGIN SELECT RAISE(ABORT, '${table} is immutable'); END`,
    `CREATE TRIGGER IF NOT EXISTS ${table}_delete_forbidden BEFORE DELETE ON ${table}
    BEGIN SELECT RAISE(ABORT, '${table} deletion is forbidden'); END`,
  ]),
  `CREATE TRIGGER IF NOT EXISTS material_map_state_validate_insert
  BEFORE INSERT ON material_map_state
  WHEN EXISTS (SELECT 1 FROM material_map WHERE id = NEW.map_id)
    OR NEW.version <> 0 OR NEW.disposition <> 'active' OR NEW.withdrawal_reason IS NOT NULL
  BEGIN SELECT RAISE(ABORT, 'material map initial state is invalid'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_disposition_validate_insert
  BEFORE INSERT ON material_map_disposition_event
  BEGIN
    SELECT CASE WHEN NEW.version = 0 AND EXISTS (SELECT 1 FROM material_map WHERE id = NEW.map_id)
      THEN RAISE(ABORT, 'material map initial history publication is closed') END;
    SELECT CASE WHEN NEW.version > 0 AND NOT EXISTS (
      SELECT 1 FROM material_map_state AS state
      WHERE state.map_id = NEW.map_id
        AND state.version = NEW.version - 1
        AND state.disposition <> NEW.disposition
    ) THEN RAISE(ABORT, 'material map history has no exact predecessor state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_disposition_apply
  AFTER INSERT ON material_map_disposition_event WHEN NEW.version > 0
  BEGIN
    UPDATE material_map_state
    SET version = NEW.version,
        disposition = NEW.disposition,
        withdrawal_reason = NEW.reason,
        time_updated = NEW.time_committed
    WHERE map_id = NEW.map_id AND version = NEW.version - 1 AND disposition <> NEW.disposition;
    SELECT CASE WHEN changes() <> 1
      THEN RAISE(ABORT, 'material map history did not advance exact state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_state_validate_update
  BEFORE UPDATE ON material_map_state
  BEGIN
    SELECT CASE WHEN NEW.map_id <> OLD.map_id
      OR NEW.version <> OLD.version + 1
      OR NEW.disposition = OLD.disposition
      OR NOT EXISTS (
        SELECT 1 FROM material_map_disposition_event AS event
        WHERE event.map_id = NEW.map_id
          AND event.version = NEW.version
          AND event.disposition = NEW.disposition
          AND event.reason IS NEW.withdrawal_reason
          AND event.time_committed = NEW.time_updated
      ) THEN RAISE(ABORT, 'material map state transition lacks exact history') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_state_delete_forbidden
  BEFORE DELETE ON material_map_state BEGIN SELECT RAISE(ABORT, 'material map state deletion is forbidden'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_disposition_immutable
  BEFORE UPDATE ON material_map_disposition_event BEGIN SELECT RAISE(ABORT, 'material map history is immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_map_disposition_delete_forbidden
  BEFORE DELETE ON material_map_disposition_event BEGIN SELECT RAISE(ABORT, 'material map history deletion is forbidden'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_validate_insert
  BEFORE INSERT ON material_course_alignment
  BEGIN
    SELECT CASE WHEN (SELECT count(*) FROM material_course_alignment_state WHERE alignment_id = NEW.id AND version = 0 AND disposition = 'active' AND withdrawal_reason IS NULL) <> 1
      THEN RAISE(ABORT, 'material alignment initial state is incomplete') END;
    SELECT CASE WHEN (SELECT count(*) FROM material_course_alignment_disposition_event WHERE alignment_id = NEW.id AND version = 0 AND disposition = 'active' AND reason IS NULL) <> 1
      THEN RAISE(ABORT, 'material alignment initial history is incomplete') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_identity_immutable
  BEFORE UPDATE ON material_course_alignment BEGIN SELECT RAISE(ABORT, 'material alignment identity is immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_delete_forbidden
  BEFORE DELETE ON material_course_alignment BEGIN SELECT RAISE(ABORT, 'material alignment deletion is forbidden'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_state_validate_insert
  BEFORE INSERT ON material_course_alignment_state
  WHEN EXISTS (SELECT 1 FROM material_course_alignment WHERE id = NEW.alignment_id)
    OR NEW.version <> 0 OR NEW.disposition <> 'active' OR NEW.withdrawal_reason IS NOT NULL
  BEGIN SELECT RAISE(ABORT, 'material alignment initial state is invalid'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_disposition_validate_insert
  BEFORE INSERT ON material_course_alignment_disposition_event
  BEGIN
    SELECT CASE WHEN NEW.version = 0 AND EXISTS (SELECT 1 FROM material_course_alignment WHERE id = NEW.alignment_id)
      THEN RAISE(ABORT, 'material alignment initial history publication is closed') END;
    SELECT CASE WHEN NEW.version > 0 AND NOT EXISTS (
      SELECT 1 FROM material_course_alignment_state AS state
      WHERE state.alignment_id = NEW.alignment_id
        AND state.version = NEW.version - 1
        AND state.disposition <> NEW.disposition
    ) THEN RAISE(ABORT, 'material alignment history has no exact predecessor state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_disposition_apply
  AFTER INSERT ON material_course_alignment_disposition_event WHEN NEW.version > 0
  BEGIN
    UPDATE material_course_alignment_state
    SET version = NEW.version,
        disposition = NEW.disposition,
        withdrawal_reason = NEW.reason,
        time_updated = NEW.time_committed
    WHERE alignment_id = NEW.alignment_id AND version = NEW.version - 1 AND disposition <> NEW.disposition;
    SELECT CASE WHEN changes() <> 1
      THEN RAISE(ABORT, 'material alignment history did not advance exact state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_state_validate_update
  BEFORE UPDATE ON material_course_alignment_state
  BEGIN
    SELECT CASE WHEN NEW.alignment_id <> OLD.alignment_id
      OR NEW.version <> OLD.version + 1
      OR NEW.disposition = OLD.disposition
      OR NOT EXISTS (
        SELECT 1 FROM material_course_alignment_disposition_event AS event
        WHERE event.alignment_id = NEW.alignment_id
          AND event.version = NEW.version
          AND event.disposition = NEW.disposition
          AND event.reason IS NEW.withdrawal_reason
          AND event.time_committed = NEW.time_updated
      ) THEN RAISE(ABORT, 'material alignment state transition lacks exact history') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_state_delete_forbidden
  BEFORE DELETE ON material_course_alignment_state BEGIN SELECT RAISE(ABORT, 'material alignment state deletion is forbidden'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_disposition_immutable
  BEFORE UPDATE ON material_course_alignment_disposition_event BEGIN SELECT RAISE(ABORT, 'material alignment history is immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS material_course_alignment_disposition_delete_forbidden
  BEFORE DELETE ON material_course_alignment_disposition_event BEGIN SELECT RAISE(ABORT, 'material alignment history deletion is forbidden'); END`,
] as const

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement), { discard: true })
}
