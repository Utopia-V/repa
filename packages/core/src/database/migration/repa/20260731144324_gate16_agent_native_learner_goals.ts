import { Effect } from "effect"
import { sql } from "drizzle-orm"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV16 } from "../../schema-extras-v16"

export default {
  id: "20260731144324_gate16_agent_native_learner_goals",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      const triggers = yield* tx
        .all<{ name: string }>(sql`SELECT name FROM sqlite_schema WHERE type = 'trigger' ORDER BY name`)
        .pipe(Effect.orDie)
      yield* Effect.forEach(
        triggers,
        (trigger) => tx.run(sql`DROP TRIGGER ${sql.identifier(trigger.name)}`).pipe(Effect.orDie),
        { discard: true },
      )
      yield* tx.run("DROP VIEW IF EXISTS learning_command_invocation_constraint_v12")
      yield* tx.run("DROP VIEW IF EXISTS learning_command_receipt_constraint_v12")
      yield* tx.run(`
        CREATE TABLE \`learner_goal_capability_issue_v2\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_goal_capability_issue_v2_invocation_part_id_learner_goal_disposition_v2_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_goal_disposition_v2\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`learner_goal_capability_issue_v2_invocation_request_unique\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "learner_goal_capability_issue_v2_fingerprints" CHECK(length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND length("shown_scope_fingerprint") = 64 AND "shown_scope_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_goal_capability_issue_v2_shape" CHECK(length("permission_request_id") > 0 AND json_valid("policy_basis")
                AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_capability_settlement_v2\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`agent_action_fingerprint\` text NOT NULL,
          \`policy_basis\` text,
          \`policy_fingerprint\` text,
          \`reply\` text,
          \`reply_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_goal_capability_settlement_v2_invocation_part_id_learner_goal_disposition_v2_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_goal_disposition_v2\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_learner_goal_capability_settlement_v2_invocation_part_id_permission_request_id_learner_goal_capability_issue_v2_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`learner_goal_capability_issue_v2\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_goal_capability_settlement_v2_fingerprints" CHECK(length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("policy_fingerprint" IS NULL OR (length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("reply_fingerprint" IS NULL OR (length("reply_fingerprint") = 64 AND "reply_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_goal_capability_settlement_v2_closed_union" CHECK(("outcome" = 'not_evaluated' AND "permission_request_id" IS NULL
                  AND "policy_basis" IS NULL AND "policy_fingerprint" IS NULL
                  AND "reply" IS NULL AND "reply_fingerprint" IS NULL)
                OR ("outcome" IN ('policy_allow', 'policy_deny') AND "permission_request_id" IS NULL
                  AND json_valid("policy_basis") AND "policy_fingerprint" IS NOT NULL
                  AND "reply" IS NULL AND "reply_fingerprint" IS NULL)
                OR ("outcome" = 'prompted_abort' AND "permission_request_id" IS NOT NULL
                  AND "policy_basis" IS NULL AND "policy_fingerprint" IS NULL
                  AND "reply" IS NULL AND "reply_fingerprint" IS NULL)
                OR ("outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
                  AND "permission_request_id" IS NOT NULL
                  AND "policy_basis" IS NULL AND "policy_fingerprint" IS NULL
                  AND json_valid("reply") AND "reply_fingerprint" IS NOT NULL)),
          CONSTRAINT "learner_goal_capability_settlement_v2_time" CHECK("time_settled" >= 0 AND "settlement_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`
        CREATE TABLE \`learner_goal_disposition_v2\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`legacy_command_part_id\` text,
          \`command_fingerprint\` text NOT NULL,
          \`canonical_command\` text,
          \`semantic_address\` text,
          \`semantic_address_fingerprint\` text,
          \`incoming_intent_fingerprint\` text,
          \`semantic_outcome\` text,
          \`existing_effect_id\` text,
          \`existing_intent_fingerprint\` text,
          \`agent_action_fingerprint\` text,
          \`agent_action_provenance\` text,
          \`materialized_snapshot\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_learner_goal_disposition_v2_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_learner_goal_disposition_v2_legacy_command_part_id_learner_goal_command_invocation_part_id_fk\` FOREIGN KEY (\`legacy_command_part_id\`) REFERENCES \`learner_goal_command\`(\`invocation_part_id\`) ON DELETE CASCADE,
          CONSTRAINT "learner_goal_disposition_v2_fingerprints" CHECK(length("command_fingerprint") = 64
                AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*'
                AND ("semantic_address_fingerprint" IS NULL OR
                  (length("semantic_address_fingerprint") = 64 AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("incoming_intent_fingerprint" IS NULL OR
                  (length("incoming_intent_fingerprint") = 64 AND "incoming_intent_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("existing_intent_fingerprint" IS NULL OR
                  (length("existing_intent_fingerprint") = 64 AND "existing_intent_fingerprint" NOT GLOB '*[^0-9a-f]*'))
                AND ("agent_action_fingerprint" IS NULL OR
                  (length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_goal_disposition_v2_closed_union" CHECK((
                "disposition" = 'legacy_v1'
                AND "legacy_command_part_id" = "invocation_part_id"
                AND "canonical_command" IS NULL
                AND "semantic_address" IS NULL
                AND "semantic_address_fingerprint" IS NULL
                AND "incoming_intent_fingerprint" IS NULL
                AND "semantic_outcome" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_intent_fingerprint" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "materialized_snapshot" IS NULL
              ) OR (
                "disposition" = 'semantic_terminal_v2'
                AND "legacy_command_part_id" IS NULL
                AND json_valid("canonical_command")
                AND json_type("canonical_command") = 'object'
                AND json_valid("semantic_address")
                AND json_type("semantic_address") = 'object'
                AND json_type("semantic_address", '$.occurrenceID') = 'text'
                AND json_extract("semantic_address", '$.slot') = 'learner_goal_change_set'
                AND "semantic_address_fingerprint" IS NOT NULL
                AND "incoming_intent_fingerprint" IS NOT NULL
                AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                AND "existing_effect_id" IS NOT NULL
                AND "existing_intent_fingerprint" IS NOT NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "materialized_snapshot" IS NULL
              ) OR (
                "disposition" = 'candidate_v2'
                AND "legacy_command_part_id" IS NULL
                AND json_valid("canonical_command")
                AND json_type("canonical_command") = 'object'
                AND json_valid("semantic_address")
                AND json_type("semantic_address") = 'object'
                AND json_type("semantic_address", '$.occurrenceID') = 'text'
                AND json_extract("semantic_address", '$.slot') = 'learner_goal_change_set'
                AND "semantic_address_fingerprint" IS NOT NULL
                AND "incoming_intent_fingerprint" IS NOT NULL
                AND "semantic_outcome" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_intent_fingerprint" IS NULL
                AND "agent_action_fingerprint" IS NOT NULL
                AND json_valid("agent_action_provenance")
                AND json_extract("agent_action_provenance", '$.schemaVersion') = 1
                AND json_extract("agent_action_provenance", '$.kind') IN ('root', 'delegated')
                AND json_extract("agent_action_provenance", '$.capabilityIdentity') = 'update_learner_goals'
                AND json_extract("agent_action_provenance", '$.capabilityVersion') = 2
                AND json_type("agent_action_provenance", '$.lineage') = 'array'
                AND ((json_extract("agent_action_provenance", '$.kind') = 'root'
                      AND json_array_length("agent_action_provenance", '$.lineage') = 0
                      AND json_type("agent_action_provenance", '$.effectiveDelegatedCapability') IS NULL)
                  OR (json_extract("agent_action_provenance", '$.kind') = 'delegated'
                      AND json_array_length("agent_action_provenance", '$.lineage') > 0
                      AND json_type("agent_action_provenance", '$.effectiveDelegatedCapability') = 'object'))
                AND json_valid("materialized_snapshot")
                AND json_type("materialized_snapshot") = 'object'
                AND json_extract("materialized_snapshot", '$.schemaVersion') = 2
                AND json("canonical_command") = json(json_extract("materialized_snapshot", '$.canonicalCommand'))
                AND json_type("materialized_snapshot", '$.operations') = 'array'
                AND json_array_length("materialized_snapshot", '$.operations') BETWEEN 1 AND 8
                AND json_type("materialized_snapshot", '$.revisionSequenceBefore') = 'integer'
                AND json_extract("materialized_snapshot", '$.revisionSequenceBefore') >= 0
                AND json_type("materialized_snapshot", '$.consumedFrontiers') = 'array'
                AND json_type("materialized_snapshot", '$.timeFloor') = 'integer'
                AND json_extract("materialized_snapshot", '$.timeFloor') >= 0
              )),
          CONSTRAINT "learner_goal_disposition_v2_time" CHECK("time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(`ALTER TABLE \`learner_goal_effect_operation\` ADD \`schema_version\` integer DEFAULT 1 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`learner_goal_effect\` ADD \`schema_version\` integer DEFAULT 1 NOT NULL;`)
      yield* tx.run(
        `ALTER TABLE \`learner_goal_effect\` ADD \`agent_action_part_id\` text REFERENCES learner_goal_disposition_v2(invocation_part_id);`,
      )
      yield* tx.run(`ALTER TABLE \`learner_goal_effect\` ADD \`materialized_snapshot\` text;`)
      yield* tx.run(`ALTER TABLE \`learner_goal_revision\` ADD \`schema_version\` integer DEFAULT 1 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`learner_goal_revision\` ADD \`target_value_v2\` text;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_goal_effect\` (
          \`id\` text PRIMARY KEY,
          \`schema_version\` integer DEFAULT 1 NOT NULL,
          \`commit_seal_id\` text NOT NULL,
          \`occurrence_id\` text NOT NULL CONSTRAINT \`learner_goal_effect_occurrence_unique\` UNIQUE,
          \`source_order\` integer NOT NULL,
          \`semantic_fingerprint\` text NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`command\` text NOT NULL,
          \`agent_action_part_id\` text,
          \`materialized_snapshot\` text,
          \`operation_count\` integer NOT NULL,
          \`change_count\` integer NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL CONSTRAINT \`learner_goal_effect_frontier_unique\` UNIQUE,
          \`frontier_time\` integer NOT NULL,
          \`acknowledgement_title\` text NOT NULL,
          \`acknowledgement_body\` text NOT NULL,
          CONSTRAINT \`fk_learner_goal_effect_commit_seal_id_learner_goal_commit_seal_effect_id_fk\` FOREIGN KEY (\`commit_seal_id\`) REFERENCES \`learner_goal_commit_seal\`(\`effect_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_agent_action_part_id_learner_goal_disposition_v2_invocation_part_id_fk\` FOREIGN KEY (\`agent_action_part_id\`) REFERENCES \`learner_goal_disposition_v2\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_effect_seal_identity" CHECK("commit_seal_id" = "id"),
          CONSTRAINT "learner_goal_effect_identity_format" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'gle_' AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "learner_goal_effect_fingerprint" CHECK(length("semantic_fingerprint") = 64 AND "semantic_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_goal_effect_versioned_provenance" CHECK(("schema_version" = 1
                  AND "authorization_basis" IN ('learner_request', 'learner_acceptance')
                  AND "agent_action_part_id" IS NULL
                  AND "materialized_snapshot" IS NULL)
                OR ("schema_version" = 2
                  AND "authorization_basis" = 'agent_action'
                  AND "agent_action_part_id" IS NOT NULL
                  AND json_valid("command")
                  AND json_type("command") = 'object'
                  AND json_valid("materialized_snapshot")
                  AND json_type("materialized_snapshot") = 'object')),
          CONSTRAINT "learner_goal_effect_command_json" CHECK(json_valid("command")),
          CONSTRAINT "learner_goal_effect_counts" CHECK("operation_count" BETWEEN 1 AND 8 AND "change_count" BETWEEN 1 AND "operation_count"),
          CONSTRAINT "learner_goal_effect_time_order" CHECK("source_order" >= 1 AND "time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed"),
          CONSTRAINT "learner_goal_effect_acknowledgement" CHECK(length("acknowledgement_title") > 0 AND length("acknowledgement_body") > 0)
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_goal_effect\`(\`id\`, \`commit_seal_id\`, \`occurrence_id\`, \`source_order\`, \`semantic_fingerprint\`, \`authorization_basis\`, \`command\`, \`operation_count\`, \`change_count\`, \`time_committed\`, \`commit_order\`, \`frontier_sequence\`, \`frontier_time\`, \`acknowledgement_title\`, \`acknowledgement_body\`) SELECT \`id\`, \`commit_seal_id\`, \`occurrence_id\`, \`source_order\`, \`semantic_fingerprint\`, \`authorization_basis\`, \`command\`, \`operation_count\`, \`change_count\`, \`time_committed\`, \`commit_order\`, \`frontier_sequence\`, \`frontier_time\`, \`acknowledgement_title\`, \`acknowledgement_body\` FROM \`learner_goal_effect\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_goal_effect\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learner_goal_effect\` RENAME TO \`learner_goal_effect\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_goal_revision\` (
          \`id\` text PRIMARY KEY,
          \`schema_version\` integer DEFAULT 1 NOT NULL,
          \`goal_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`predecessor_id\` text CONSTRAINT \`learner_goal_revision_predecessor_unique\` UNIQUE,
          \`effect_id\` text NOT NULL,
          \`operation_ordinal\` integer NOT NULL,
          \`revision_role\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`source_order\` integer NOT NULL,
          \`outcome\` text NOT NULL,
          \`scope_kind\` text NOT NULL,
          \`target_kind\` text,
          \`target_instant\` integer,
          \`target_local_date\` text,
          \`target_timezone\` text,
          \`target_timezone_release_id\` text,
          \`target_utc_offset_minutes\` integer,
          \`target_source_expression\` text,
          \`target_normalized\` text,
          \`target_normalization_basis\` text,
          \`target_value_v2\` text,
          \`disposition\` text NOT NULL,
          \`revision_order\` integer NOT NULL CONSTRAINT \`learner_goal_revision_order_unique\` UNIQUE,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL,
          \`frontier_time\` integer NOT NULL,
          CONSTRAINT \`fk_learner_goal_revision_goal_id_learner_goal_id_fk\` FOREIGN KEY (\`goal_id\`) REFERENCES \`learner_goal\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_revision_predecessor_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`predecessor_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_revision_effect_id_learner_goal_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_goal_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_revision_target_timezone_release_id_target_timezone_learner_goal_time_zone_release_id_name_fk\` FOREIGN KEY (\`target_timezone_release_id\`,\`target_timezone\`) REFERENCES \`learner_goal_time_zone\`(\`release_id\`,\`name\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_revision_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_goal_revision_goal_version_unique\` UNIQUE(\`goal_id\`,\`version\`),
          CONSTRAINT \`learner_goal_revision_effect_role_unique\` UNIQUE(\`effect_id\`,\`operation_ordinal\`,\`revision_role\`),
          CONSTRAINT "learner_goal_revision_identity_format" CHECK(length("id") = 30 AND substr("id", 1, 4) = 'glr_' AND substr("id", 5) NOT GLOB '*[^0-9A-Za-z]*'),
          CONSTRAINT "learner_goal_revision_chain_shape" CHECK(("version" = 1 AND "predecessor_id" IS NULL) OR ("version" > 1 AND "predecessor_id" IS NOT NULL)),
          CONSTRAINT "learner_goal_revision_role" CHECK("revision_role" IN ('source', 'target')),
          CONSTRAINT "learner_goal_revision_outcome" CHECK(length(trim("outcome")) > 0),
          CONSTRAINT "learner_goal_revision_scope" CHECK("scope_kind" IN ('learner_home', 'courses')),
          CONSTRAINT "learner_goal_revision_versioned_target" CHECK(COALESCE((
                "schema_version" = 1
                AND "target_value_v2" IS NULL
                AND (
                  ("target_kind" = 'absent' AND "target_instant" IS NULL AND "target_local_date" IS NULL AND "target_timezone" IS NULL AND "target_timezone_release_id" IS NULL AND "target_utc_offset_minutes" IS NULL AND "target_source_expression" IS NULL AND "target_normalized" IS NULL AND "target_normalization_basis" IS NULL)
                  OR ("target_kind" = 'instant' AND "target_instant" IS NOT NULL AND "target_instant" >= 0 AND "target_local_date" IS NULL AND "target_timezone" IS NULL AND "target_timezone_release_id" IS NULL AND "target_utc_offset_minutes" BETWEEN -840 AND 840 AND "target_source_expression" IS NOT NULL AND length("target_source_expression") > 0 AND "target_normalized" IS NOT NULL AND length("target_normalized") > 0 AND round(unixepoch("target_normalized", 'subsec') * 1000) = "target_instant" AND "target_normalization_basis" = 'explicit_offset')
                  OR ("target_kind" = 'local_date' AND "target_instant" IS NULL AND "target_local_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("target_local_date") = "target_local_date" AND "target_timezone" IS NOT NULL AND length("target_timezone") > 0 AND "target_timezone_release_id" IS NOT NULL AND length("target_timezone_release_id") > 0 AND "target_utc_offset_minutes" IS NULL AND "target_source_expression" IS NOT NULL AND length("target_source_expression") > 0 AND "target_normalized" IS NULL AND "target_normalization_basis" IN ('explicit_date', 'source_temporal_context'))
                )
              ) OR (
                "schema_version" = 2
                AND "target_kind" IS NULL
                AND "target_instant" IS NULL
                AND "target_local_date" IS NULL
                AND "target_timezone" IS NULL
                AND "target_timezone_release_id" IS NULL
                AND "target_utc_offset_minutes" IS NULL
                AND "target_source_expression" IS NULL
                AND "target_normalized" IS NULL
                AND "target_normalization_basis" IS NULL
                AND json_valid("target_value_v2")
                AND json_type("target_value_v2") = 'object'
              ), 0)),
          CONSTRAINT "learner_goal_revision_disposition" CHECK("disposition" IN ('active', 'achieved', 'abandoned', 'superseded')),
          CONSTRAINT "learner_goal_revision_order" CHECK("version" >= 1 AND "operation_ordinal" BETWEEN 0 AND 7 AND "source_order" >= 1 AND "revision_order" >= 1 AND "time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed")
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_goal_revision\`(\`id\`, \`goal_id\`, \`version\`, \`predecessor_id\`, \`effect_id\`, \`operation_ordinal\`, \`revision_role\`, \`occurrence_id\`, \`source_order\`, \`outcome\`, \`scope_kind\`, \`target_kind\`, \`target_instant\`, \`target_local_date\`, \`target_timezone\`, \`target_timezone_release_id\`, \`target_utc_offset_minutes\`, \`target_source_expression\`, \`target_normalized\`, \`target_normalization_basis\`, \`disposition\`, \`revision_order\`, \`time_committed\`, \`commit_order\`, \`frontier_sequence\`, \`frontier_time\`) SELECT \`id\`, \`goal_id\`, \`version\`, \`predecessor_id\`, \`effect_id\`, \`operation_ordinal\`, \`revision_role\`, \`occurrence_id\`, \`source_order\`, \`outcome\`, \`scope_kind\`, \`target_kind\`, \`target_instant\`, \`target_local_date\`, \`target_timezone\`, \`target_timezone_release_id\`, \`target_utc_offset_minutes\`, \`target_source_expression\`, \`target_normalized\`, \`target_normalization_basis\`, \`disposition\`, \`revision_order\`, \`time_committed\`, \`commit_order\`, \`frontier_sequence\`, \`frontier_time\` FROM \`learner_goal_revision\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_goal_revision\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learner_goal_revision\` RENAME TO \`learner_goal_revision\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_goal_effect_operation\` (
          \`effect_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`schema_version\` integer DEFAULT 1 NOT NULL,
          \`operation_kind\` text NOT NULL,
          \`result_kind\` text NOT NULL,
          \`goal_id\` text NOT NULL,
          \`revision_id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`disposition\` text NOT NULL,
          \`meaning\` text NOT NULL,
          \`replacement_target_kind\` text,
          \`replacement_target_goal_id\` text,
          \`replacement_target_revision_id\` text,
          \`replacement_target_version\` integer,
          CONSTRAINT \`learner_goal_effect_operation_pk\` PRIMARY KEY(\`effect_id\`, \`ordinal\`),
          CONSTRAINT \`fk_learner_goal_effect_operation_effect_id_learner_goal_effect_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_goal_effect\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_operation_goal_id_learner_goal_id_fk\` FOREIGN KEY (\`goal_id\`) REFERENCES \`learner_goal\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_operation_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_operation_replacement_target_goal_id_learner_goal_id_fk\` FOREIGN KEY (\`replacement_target_goal_id\`) REFERENCES \`learner_goal\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_goal_effect_operation_replacement_target_revision_id_learner_goal_revision_id_fk\` FOREIGN KEY (\`replacement_target_revision_id\`) REFERENCES \`learner_goal_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_goal_effect_operation_ordinal" CHECK("ordinal" BETWEEN 0 AND 7),
          CONSTRAINT "learner_goal_effect_operation_kind" CHECK("operation_kind" IN ('create', 'update', 'replace') AND "result_kind" IN ('changed', 'no_change')),
          CONSTRAINT "learner_goal_effect_operation_result" CHECK("schema_version" IN (1, 2) AND ("operation_kind" = 'update' OR "result_kind" = 'changed') AND "version" >= 1 AND "disposition" IN ('active', 'achieved', 'abandoned', 'superseded') AND json_valid("meaning")),
          CONSTRAINT "learner_goal_effect_operation_replacement" CHECK(("operation_kind" = 'replace' AND "result_kind" = 'changed' AND "disposition" = 'superseded' AND "replacement_target_kind" IN ('existing', 'new') AND "replacement_target_goal_id" IS NOT NULL AND "replacement_target_revision_id" IS NOT NULL AND "replacement_target_version" >= 1) OR ("operation_kind" <> 'replace' AND "replacement_target_kind" IS NULL AND "replacement_target_goal_id" IS NULL AND "replacement_target_revision_id" IS NULL AND "replacement_target_version" IS NULL))
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_goal_effect_operation\`(\`effect_id\`, \`ordinal\`, \`operation_kind\`, \`result_kind\`, \`goal_id\`, \`revision_id\`, \`version\`, \`disposition\`, \`meaning\`, \`replacement_target_kind\`, \`replacement_target_goal_id\`, \`replacement_target_revision_id\`, \`replacement_target_version\`) SELECT \`effect_id\`, \`ordinal\`, \`operation_kind\`, \`result_kind\`, \`goal_id\`, \`revision_id\`, \`version\`, \`disposition\`, \`meaning\`, \`replacement_target_kind\`, \`replacement_target_goal_id\`, \`replacement_target_revision_id\`, \`replacement_target_version\` FROM \`learner_goal_effect_operation\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_goal_effect_operation\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learner_goal_effect_operation\` RENAME TO \`learner_goal_effect_operation\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE INDEX \`learner_goal_revision_history_idx\` ON \`learner_goal_revision\` (\`goal_id\`,\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_goal_revision_effect_idx\` ON \`learner_goal_revision\` (\`effect_id\`,\`operation_ordinal\`,\`revision_role\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_goal_revision_discovery_idx\` ON \`learner_goal_revision\` (\`disposition\`,\`revision_order\`,\`goal_id\`);`,
      )
      yield* tx.run(`
        INSERT INTO learner_goal_disposition_v2(
          invocation_part_id,
          disposition,
          legacy_command_part_id,
          command_fingerprint,
          time_disposed
        )
        SELECT
          invocation.part_id,
          'legacy_v1',
          invocation.part_id,
          command.semantic_fingerprint,
          invocation.time_admitted
        FROM learning_command_invocation AS invocation
        JOIN learner_goal_command AS command
          ON command.invocation_part_id = invocation.part_id
        WHERE invocation.command_name = 'update_learner_goals'
          AND invocation.command_version = 1
      `)
      const missingLegacy = yield* tx.get<{ count: number }>(`
        SELECT count(*) AS count
        FROM learning_command_invocation AS invocation
        LEFT JOIN learner_goal_disposition_v2 AS disposition
          ON disposition.invocation_part_id = invocation.part_id
        WHERE invocation.command_name = 'update_learner_goals'
          AND invocation.command_version = 1
          AND disposition.invocation_part_id IS NULL
      `)
      if (missingLegacy?.count !== 0) {
        return yield* Effect.fail(new Error("Gate 16 migration could not classify every historical Goal invocation"))
      }
      yield* installSchemaExtrasV16(tx)
    })
  },
} satisfies DatabaseMigration.Migration
