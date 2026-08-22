import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV24 } from "../../schema-extras-v24"

export default {
  id: "20260813111949_gate22_session_deletion_restore_lineage",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_deletion_audit_bundle\` (
          \`id\` text PRIMARY KEY,
          \`deletion_request_id\` text NOT NULL UNIQUE,
          \`projection_schema_version\` integer NOT NULL,
          \`operation_count\` integer NOT NULL,
          \`operation_fingerprint\` text NOT NULL,
          \`relation_count\` integer NOT NULL,
          \`relation_fingerprint\` text NOT NULL,
          \`deletion_time\` integer NOT NULL,
          \`session_bodies_deleted\` integer NOT NULL,
          CONSTRAINT \`fk_session_deletion_audit_bundle_deletion_request_id_session_deletion_control_receipt_request_id_fk\` FOREIGN KEY (\`deletion_request_id\`) REFERENCES \`session_deletion_control_receipt\`(\`request_id\`) ON DELETE RESTRICT,
          CONSTRAINT "session_deletion_audit_bundle_identity" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'sda_'
                AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "session_deletion_audit_bundle_shape" CHECK("projection_schema_version" = 1 AND "operation_count" >= 0
                AND "relation_count" >= 0 AND "deletion_time" >= 0
                AND "session_bodies_deleted" = 1
                AND length("operation_fingerprint") = 64
                AND "operation_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("relation_fingerprint") = 64
                AND "relation_fingerprint" NOT GLOB '*[^0-9a-f]*')
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`session_deletion_audit_operation\` (
          \`bundle_id\` text NOT NULL,
          \`operation_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`terminal_status\` text NOT NULL,
          CONSTRAINT \`session_deletion_audit_operation_pk\` PRIMARY KEY(\`bundle_id\`, \`operation_id\`),
          CONSTRAINT \`fk_session_deletion_audit_operation_bundle_id_session_deletion_audit_bundle_id_fk\` FOREIGN KEY (\`bundle_id\`) REFERENCES \`session_deletion_audit_bundle\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`session_deletion_audit_operation_ordinal_unique\` UNIQUE(\`bundle_id\`,\`ordinal\`),
          CONSTRAINT "session_deletion_audit_operation_identity" CHECK(length("operation_id") = 30 AND substr("operation_id", 1, 4) = 'sdo_'
                AND substr("operation_id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "session_deletion_audit_operation_shape" CHECK("ordinal" >= 0 AND "terminal_status" IN ('completed', 'failed', 'interrupted'))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`session_deletion_audit_record\` (
          \`bundle_id\` text NOT NULL,
          \`operation_id\` text NOT NULL,
          \`owner_kind\` text NOT NULL,
          \`record_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          \`revision_version\` integer NOT NULL,
          \`context_classification\` text NOT NULL,
          \`exact_read\` integer NOT NULL,
          \`typed_citation\` integer NOT NULL,
          CONSTRAINT \`session_deletion_audit_record_pk\` PRIMARY KEY(\`bundle_id\`, \`operation_id\`, \`owner_kind\`, \`record_id\`, \`revision_id\`),
          CONSTRAINT \`fk_session_deletion_audit_record_bundle_id_operation_id_session_deletion_audit_operation_bundle_id_operation_id_fk\` FOREIGN KEY (\`bundle_id\`,\`operation_id\`) REFERENCES \`session_deletion_audit_operation\`(\`bundle_id\`,\`operation_id\`) ON DELETE CASCADE,
          CONSTRAINT "session_deletion_audit_record_shape" CHECK(length("record_id") > 0 AND length("revision_id") > 0 AND "revision_version" >= 1
                AND "context_classification" IN ('not_entered', 'locator_only', 'semantic_full')
                AND ("context_classification" <> 'not_entered' OR "exact_read" = 1 OR "typed_citation" = 1))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`session_deletion_control_receipt\` (
          \`request_id\` text PRIMARY KEY,
          \`request_fingerprint\` text NOT NULL,
          \`settlement_schema_version\` integer NOT NULL,
          \`root_session_id\` text NOT NULL UNIQUE,
          \`subtree_count\` integer NOT NULL,
          \`subtree_fingerprint\` text NOT NULL,
          \`mode\` text NOT NULL,
          \`permission_decision_fingerprint\` text NOT NULL,
          \`proposal_schema_version\` integer NOT NULL,
          \`outcome\` text NOT NULL,
          \`deletion_time\` integer NOT NULL,
          \`session_bodies_deleted\` integer NOT NULL,
          \`settlement\` text NOT NULL,
          \`settlement_fingerprint\` text NOT NULL,
          CONSTRAINT "session_deletion_control_receipt_identity" CHECK(length("request_id") = 30 AND substr("request_id", 1, 4) = 'sdr_'
                AND substr("request_id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "session_deletion_control_receipt_fingerprints" CHECK(length("request_fingerprint") = 64 AND "request_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("subtree_fingerprint") = 64 AND "subtree_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("permission_decision_fingerprint") = 64
                AND "permission_decision_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("settlement_fingerprint") = 64
                AND "settlement_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "session_deletion_control_receipt_shape" CHECK("settlement_schema_version" = 1 AND "proposal_schema_version" = 1
                AND "subtree_count" >= 1 AND "mode" IN ('full', 'minimal_audit')
                AND "outcome" = 'applied' AND "deletion_time" >= 0
                AND "session_bodies_deleted" = 1 AND json_valid("settlement")
                AND json_extract("settlement", '$.schemaVersion') = 1
                AND json_extract("settlement", '$.requestID') = "request_id"
                AND json_extract("settlement", '$.requestFingerprint') = "request_fingerprint"
                AND json_extract("settlement", '$.rootSessionID') = "root_session_id"
                AND json_extract("settlement", '$.subtreeCount') = "subtree_count"
                AND json_extract("settlement", '$.subtreeFingerprint') = "subtree_fingerprint"
                AND json_extract("settlement", '$.mode') = "mode"
                AND json_extract("settlement", '$.permissionDecisionFingerprint') = "permission_decision_fingerprint"
                AND json_extract("settlement", '$.proposalSchemaVersion') = 1
                AND json_extract("settlement", '$.outcome') = 'applied'
                AND json_extract("settlement", '$.deletionTime') = "deletion_time"
                AND json_extract("settlement", '$.sessionBodiesDeleted') = 1)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`session_deletion_purge_receipt\` (
          \`request_id\` text PRIMARY KEY,
          \`request_fingerprint\` text NOT NULL,
          \`settlement_schema_version\` integer NOT NULL,
          \`deletion_request_id\` text NOT NULL CONSTRAINT \`session_deletion_purge_receipt_deletion_unique\` UNIQUE,
          \`outcome\` text NOT NULL,
          \`purge_time\` integer NOT NULL,
          \`settlement\` text NOT NULL,
          \`settlement_fingerprint\` text NOT NULL,
          CONSTRAINT \`fk_session_deletion_purge_receipt_deletion_request_id_session_deletion_control_receipt_request_id_fk\` FOREIGN KEY (\`deletion_request_id\`) REFERENCES \`session_deletion_control_receipt\`(\`request_id\`) ON DELETE RESTRICT,
          CONSTRAINT "session_deletion_purge_receipt_identity" CHECK(length("request_id") = 30 AND substr("request_id", 1, 4) = 'spr_'
                AND substr("request_id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "session_deletion_purge_receipt_fingerprints" CHECK(length("request_fingerprint") = 64 AND "request_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("settlement_fingerprint") = 64
                AND "settlement_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "session_deletion_purge_receipt_shape" CHECK("settlement_schema_version" = 1 AND "outcome" = 'applied' AND "purge_time" >= 0
                AND json_valid("settlement")
                AND json_extract("settlement", '$.schemaVersion') = 1
                AND json_extract("settlement", '$.requestID') = "request_id"
                AND json_extract("settlement", '$.requestFingerprint') = "request_fingerprint"
                AND json_extract("settlement", '$.deletionRequestID') = "deletion_request_id"
                AND json_extract("settlement", '$.outcome') = 'applied'
                AND json_extract("settlement", '$.purgeTime') = "purge_time")
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`turn_candidate_part_model_unique\` ON \`turn_tool_candidate\` (\`part_id\`,\`assistant_message_id\`);`,
      )
      yield* tx.run(`
        CREATE TABLE \`turn_lineage_candidate_coverage\` (
          \`part_id\` text PRIMARY KEY,
          \`assistant_message_id\` text NOT NULL,
          \`producer_kind\` text NOT NULL,
          \`outcome\` text NOT NULL,
          \`catalog_version\` integer NOT NULL,
          \`result_schema_version\` integer NOT NULL,
          \`relation_count\` integer NOT NULL,
          \`relation_fingerprint\` text NOT NULL,
          \`time_covered\` integer NOT NULL,
          CONSTRAINT \`fk_turn_lineage_candidate_coverage_part_id_turn_tool_candidate_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`turn_tool_candidate\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_turn_lineage_candidate_coverage_part_id_assistant_message_id_turn_tool_candidate_part_id_assistant_message_id_fk\` FOREIGN KEY (\`part_id\`,\`assistant_message_id\`) REFERENCES \`turn_tool_candidate\`(\`part_id\`,\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_lineage_candidate_coverage_shape" CHECK("producer_kind" IN ('lazy_read', 'typed_citation', 'not_eligible')
                AND "outcome" IN ('positive_projected', 'no_positive_relation', 'not_started', 'not_eligible')
                AND "catalog_version" >= 1 AND "result_schema_version" >= 1
                AND "relation_count" >= 0 AND length("relation_fingerprint") = 64
                AND "relation_fingerprint" NOT GLOB '*[^0-9a-f]*' AND "time_covered" >= 0
                AND (("outcome" = 'positive_projected' AND "relation_count" > 0)
                  OR ("outcome" <> 'positive_projected' AND "relation_count" = 0)))
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_lineage_operation_coverage\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`coverage_schema_version\` integer NOT NULL,
          \`catalog_version\` integer NOT NULL,
          \`candidate_count\` integer NOT NULL,
          \`covered_candidate_count\` integer NOT NULL,
          \`relation_count\` integer NOT NULL,
          \`relation_fingerprint\` text NOT NULL,
          \`time_sealed\` integer NOT NULL,
          CONSTRAINT \`fk_turn_lineage_operation_coverage_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_lineage_operation_coverage_shape" CHECK("coverage_schema_version" = 1 AND "catalog_version" >= 1
                AND "candidate_count" >= 0 AND "covered_candidate_count" = "candidate_count"
                AND "relation_count" >= 0 AND length("relation_fingerprint") = 64
                AND "relation_fingerprint" NOT GLOB '*[^0-9a-f]*' AND "time_sealed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`turn_lineage_record_relation\` (
          \`assistant_message_id\` text NOT NULL,
          \`relation_kind\` text NOT NULL,
          \`owner_kind\` text NOT NULL,
          \`record_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          \`revision_version\` integer NOT NULL,
          \`producer_part_id\` text NOT NULL,
          \`producer_version\` integer NOT NULL,
          CONSTRAINT \`turn_lineage_record_relation_pk\` PRIMARY KEY(\`assistant_message_id\`, \`relation_kind\`, \`owner_kind\`, \`record_id\`, \`revision_id\`),
          CONSTRAINT \`fk_turn_lineage_record_relation_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_lineage_record_relation_shape" CHECK("relation_kind" IN ('exact_read', 'typed_citation') AND length("record_id") > 0
                AND length("revision_id") > 0 AND "revision_version" >= 1
                AND length("producer_part_id") > 0 AND "producer_version" >= 1)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`session_administrative_history_message\` (
          \`session_id\` text NOT NULL,
          \`message_id\` text PRIMARY KEY,
          \`ordinal\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_session_administrative_history_message_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_session_administrative_history_message_session_id_session_administrative_history_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session_administrative_history\`(\`session_id\`) ON DELETE CASCADE,
          CONSTRAINT \`session_administrative_history_message_ordinal_unique\` UNIQUE(\`session_id\`,\`ordinal\`),
          CONSTRAINT "session_administrative_history_message_shape" CHECK("ordinal" >= 0 AND "time_created" >= 0 AND "time_created" <= 9007199254740991)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`session_administrative_history_part\` (
          \`session_id\` text NOT NULL,
          \`message_id\` text NOT NULL,
          \`part_id\` text PRIMARY KEY,
          \`message_ordinal\` integer NOT NULL,
          \`part_ordinal\` integer NOT NULL,
          CONSTRAINT \`fk_session_administrative_history_part_part_id_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`part\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_session_administrative_history_part_message_id_session_administrative_history_message_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`session_administrative_history_message\`(\`message_id\`) ON DELETE CASCADE,
          CONSTRAINT \`session_administrative_history_part_ordinal_unique\` UNIQUE(\`session_id\`,\`message_ordinal\`,\`part_ordinal\`),
          CONSTRAINT "session_administrative_history_part_shape" CHECK("message_ordinal" >= 0 AND "part_ordinal" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`session_administrative_history\` (
          \`session_id\` text PRIMARY KEY,
          \`kind\` text NOT NULL,
          \`bundle_version\` integer NOT NULL,
          \`classifier_version\` integer NOT NULL,
          \`order_version\` integer NOT NULL,
          \`source_file_fingerprint\` text NOT NULL,
          \`message_count\` integer NOT NULL,
          \`part_count\` integer NOT NULL,
          \`membership_fingerprint\` text NOT NULL,
          \`order_fingerprint\` text NOT NULL,
          \`history_frontier_time\` integer NOT NULL,
          \`imported_revert_absent\` integer NOT NULL,
          CONSTRAINT \`fk_session_administrative_history_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "session_administrative_history_fingerprints" CHECK(length("source_file_fingerprint") = 64
                AND "source_file_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("membership_fingerprint") = 64
                AND "membership_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("order_fingerprint") = 64
                AND "order_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "session_administrative_history_shape" CHECK("kind" IN ('offline_exact_restore', 'local_import_copy')
                AND "bundle_version" = 1 AND "classifier_version" = 1 AND "order_version" = 1
                AND "message_count" >= 1 AND "part_count" >= 1
                AND "history_frontier_time" >= 0 AND "history_frontier_time" <= 9007199254740991
                AND "imported_revert_absent" = 1)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`session_presentation_frontier\` (
          \`session_id\` text PRIMARY KEY,
          \`frontier_time\` integer NOT NULL,
          \`message_count\` integer NOT NULL,
          \`frontier_version\` integer NOT NULL,
          CONSTRAINT \`fk_session_presentation_frontier_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "session_presentation_frontier_shape" CHECK("frontier_time" >= 0 AND "frontier_time" <= 9007199254740991
                AND "message_count" >= 0 AND "frontier_version" = 1)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `CREATE INDEX \`session_deletion_audit_record_lookup_idx\` ON \`session_deletion_audit_record\` (\`owner_kind\`,\`record_id\`,\`revision_id\`,\`revision_version\`,\`bundle_id\`);`,
      )
      yield* tx.run(`
        INSERT INTO session_presentation_frontier(session_id, frontier_time, message_count, frontier_version)
        SELECT session.id, COALESCE(MAX(message.time_created), 0), count(message.id), 1
        FROM session
        LEFT JOIN message ON message.session_id = session.id
        GROUP BY session.id;
      `)
      yield* installSchemaExtrasV24(tx)
    })
  },
} satisfies DatabaseMigration.Migration
