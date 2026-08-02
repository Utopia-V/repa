import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { $ } from "bun"
import { fileURLToPath } from "url"
import path from "path"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { Effect, Exit, Layer, ManagedRuntime } from "effect"
import { eq, inArray, sql } from "drizzle-orm"
import { DatabaseMigration } from "@opencode-ai/core/database/migration"
import { APPLICATION_ID, BASELINE_ID, BASELINE_VERSION } from "@opencode-ai/core/database/admission"
import { install as installSchemaExtrasV10 } from "@opencode-ai/core/database/schema-extras-v10"
import { install as installSchemaExtrasV11 } from "@opencode-ai/core/database/schema-extras-v11"
import { install as installSchemaExtrasV12 } from "@opencode-ai/core/database/schema-extras-v12"
import { install as installSchemaExtrasV13 } from "@opencode-ai/core/database/schema-extras-v13"
import sessionUsageMigration from "@opencode-ai/core/database/migration/20260510033149_session_usage"
import normalizeStoragePathsMigration from "@opencode-ai/core/database/migration/20260601010001_normalize_storage_paths"
import sessionMessageProjectionOrderMigration from "@opencode-ai/core/database/migration/20260603040000_session_message_projection_order"
import eventSourcedSessionInputMigration from "@opencode-ai/core/database/migration/20260604172448_event_sourced_session_input"
import contextEpochAgentMigration from "@opencode-ai/core/database/migration/20260605042240_add_context_epoch_agent"
import simplifyIntegrationCredentialsMigration from "@opencode-ai/core/database/migration/20260611192811_lush_chimera"
import simplifySessionInputMigration from "@opencode-ai/core/database/migration/20260622202450_simplify_session_input"
import courseViewAuthorityMigration from "@opencode-ai/core/database/migration/repa/20260714191244_course_view_authority"
import learningCommandSettlementMigration from "@opencode-ai/core/database/migration/repa/20260716045209_learning_command_settlement"
import sourceArtifactAuthorityMigration from "@opencode-ai/core/database/migration/repa/20260716152016_source_artifact_authority"
import contentRootAuthorityMigration from "@opencode-ai/core/database/migration/repa/20260716191911_content_root_authority"
import readableRepresentationLineageMigration from "@opencode-ai/core/database/migration/repa/20260717141402_readable_representation_lineage"
import durableTurnMigration from "@opencode-ai/core/database/migration/repa/20260718134404_gate12_durable_turn"
import materialMapAlignmentMigration from "@opencode-ai/core/database/migration/repa/20260719104356_material_map_alignment"
import learnerNavigationMigration from "@opencode-ai/core/database/migration/repa/20260719155243_learner_navigation"
import retainedSteeringMigration from "@opencode-ai/core/database/migration/repa/20260720113159_gate15_retained_steering"
import learnerGoalsMigration from "@opencode-ai/core/database/migration/repa/20260720200330_gate16_learner_goals"
import domainNeutralLearningCommandLedgerMigration from "@opencode-ai/core/database/migration/repa/20260727121200_domain_neutral_learning_command_ledger"
import defaultCourseV2Migration from "@opencode-ai/core/database/migration/repa/20260729144139_gate14_default_course_v2"
import agentNativeDefaultCourseMigration from "@opencode-ai/core/database/migration/repa/20260730115237_gate14_agent_native_default_course"
import messageDiffProjectionMigration from "@opencode-ai/core/database/migration/repa/20260731120541_gate08_message_diff_projection"
import agentNativeLearnerGoalsMigration from "@opencode-ai/core/database/migration/repa/20260731144324_gate16_agent_native_learner_goals"
import learningBootstrapMigration from "@opencode-ai/core/database/migration/repa/20260802114557_gate17_learning_bootstrap"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, SessionTable } from "@opencode-ai/core/session/sql"
import type { SqlClient as SqlClientService } from "effect/unstable/sql/SqlClient"
import { Database } from "@opencode-ai/core/database/database"
import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { Representation } from "@opencode-ai/core/representation"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Occurrence } from "@opencode-ai/core/learning-command/occurrence"
import { LearnerAdmission } from "@opencode-ai/core/learning-command/occurrence-schema"
import { learningCommandStatements } from "@opencode-ai/core/learner-navigation/learning-command-constraint-v12"
import { noEffectStatement } from "@opencode-ai/core/learner-navigation/learning-command-constraint-v13"
import { tmpdir } from "./fixture/tmpdir"
import databaseV11Schema from "./fixture/database-v11-schema"
import databaseV12Schema from "./fixture/database-v12-schema"
import databaseV13Schema from "./fixture/database-v13-schema"

setDefaultTimeout(20_000)

const run = <A, E>(effect: Effect.Effect<A, E, SqlClientService>, filename = ":memory:") =>
  Effect.runPromise(effect.pipe(Effect.provide(SqliteClient.layer({ filename, disableWAL: true })), Effect.scoped))

function materialMapLayer(filename: string) {
  return LayerNode.compile(
    LayerNode.group([
      MaterialMap.node,
      MaterialMap.currentUseReaderNode,
      Course.node,
      Representation.node,
      Representation.currentUseReaderNode,
      Artifact.node,
      ContentRoot.node,
      Database.node,
    ]),
    [[Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)]],
  )
}

const makeDb = EffectDrizzleSqlite.makeWithDefaults()
type TestDatabase = Effect.Success<typeof makeDb>
const courseTables = [
  "course_view_revision_mapping_source",
  "course_view_revision_mapping_target",
  "course_view_revision_reuse_citation",
  "course_working_selection",
  "course_view_revision_item",
  "course_view_revision_state",
  "course_view_revision_mapping_group",
  "course_view_revision",
  "course_item",
  "course_view",
  "course",
] as const
const learningCommandTables = [
  "learning_command_receipt",
  "learning_command_invocation",
  "learner_default_course_transition",
  "learner_course_route_anchor_transition",
  "course_selection_acceptance_effect",
  "learning_occurrence_tombstone",
  "learning_occurrence_presentation",
  "learning_historical_tool_presentation",
  "learning_admitted_occurrence",
] as const
const artifactTables = [
  "artifact_current_source",
  "artifact_observation_correction",
  "artifact_source_observation",
  "artifact_source_binding",
  "artifact_lineage_correction_member",
  "artifact_lineage_correction_set",
  "artifact_revision",
  "artifact",
] as const
const contentRootTables = [
  "content_root_current",
  "content_mutation_grant",
  "content_root_grant_episode",
  "content_root_binding_episode",
  "content_root_binding",
  "content_root",
] as const
const representationTables = [
  "representation_availability_current",
  "representation_availability_event",
  "representation_continued_use_grant",
  "representation_revision",
  "representation_effect",
] as const
const turnTables = [
  "session_historical_part_presentation",
  "session_historical_message_presentation",
  "turn_historical_tool_presentation",
  "turn_historical_model_presentation",
  "turn_historical_input_presentation",
  "turn_candidate_redaction",
  "turn_transcript_redaction",
  "turn_child_result",
  "turn_child_lineage",
  "turn_candidate_presentation",
  "turn_model_presentation",
  "turn_input_presentation",
  "turn_tool_invocation",
  "turn_tool_candidate",
  "turn_model_operation",
  "turn_input",
  "turn",
  "turn_unavailable_tool",
  "turn_unavailable_model",
  "turn_unavailable_source",
  "learning_shared_frontier",
] as const
const materialTables = [
  "material_course_alignment_disposition_event",
  "material_course_alignment_state",
  "material_course_alignment",
  "material_selector",
  "material_outline_node",
  "material_map_disposition_event",
  "material_map_state",
  "material_map_artifact_target",
  "material_map_representation_target",
  "material_map",
] as const

function applyHistorical(db: TestDatabase, input: readonly DatabaseMigration.Migration[]) {
  return Effect.forEach(input, (migration) => db.transaction((tx) => migration.up(tx)), { discard: true })
}

function normalizeSchemaDefinition(definition: string | null) {
  return (
    definition
      ?.replace(/[`"]/g, "")
      ?.replace(/\s+/g, " ")
      .trim()
      .replace(/\s*([(),])\s*/g, "$1")
      .replace(/\blearning_command_invocation\./g, "") ?? null
  )
}

const databaseV11Migrations = [
  courseViewAuthorityMigration,
  learningCommandSettlementMigration,
  sourceArtifactAuthorityMigration,
  contentRootAuthorityMigration,
  readableRepresentationLineageMigration,
  durableTurnMigration,
  materialMapAlignmentMigration,
  learnerNavigationMigration,
  retainedSteeringMigration,
  learnerGoalsMigration,
] as const

const databaseV16Migrations = [
  ...databaseV11Migrations,
  domainNeutralLearningCommandLedgerMigration,
  defaultCourseV2Migration,
  agentNativeDefaultCourseMigration,
  messageDiffProjectionMigration,
  agentNativeLearnerGoalsMigration,
] as const

function schemaManifestDigest(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
        AND sql IS NOT NULL
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) => {
        const hash = new Bun.CryptoHasher("sha256")
        hash.update(
          rows.map((row) => [row.type, row.name, row.tableName, row.definition].join("\u0000")).join("\u0001"),
        )
        return hash.digest("hex")
      }),
    )
}

function structuralManifest(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; definition: string }>(
      sql`
      SELECT type, name, sql AS definition
      FROM sqlite_schema
      WHERE type IN ('trigger', 'view')
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function routeOwnedManifest(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
        AND sql IS NOT NULL
        AND (
          tbl_name IN (
            'learner_course_route_anchor_transition',
            'learner_course_route_anchor_commit_seal'
          )
          OR name = 'course_route_anchor_learning_command_terminal_validate_v12'
        )
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

type FrozenV11Corruption =
  | "course_receipt_basis"
  | "course_command_version"
  | "course_capability_version"
  | "representation_revision_basis"
  | "default_confirmation"
  | "anchor_receipt_time"
  | "retained_fingerprint"
  | "retained_seal"
  | "goal_confirmation"
  | "anchor_no_change_payload"
  | "anchor_no_change_usability"
  | "anchor_no_change_partial_source"
  | "goal_operation_meaning"
  | "goal_replacement_target"
  | "retained_error_code"
  | "retained_error_detail"

function initializeDatabaseV11(
  db: TestDatabase,
  input?: {
    receiptCommitOrder?: number
    settlementReceiptID?: string
    settlementEffectID?: string
    corruption?: FrozenV11Corruption
  },
) {
  const receiptCommitOrder = input?.receiptCommitOrder ?? 1
  const settlement = JSON.stringify({
    outcome: "applied",
    receiptID: input?.settlementReceiptID ?? "lcr_00000000000000000000000001",
    effectID: input?.settlementEffectID ?? "cse_00000000000000000000000001",
    courseID: "crs_00000000000000000000000001",
    revisionID: "cvr_00000000000000000000000001",
    previousSelection: { version: 0 },
    committedSelection: { revisionID: "cvr_00000000000000000000000001", version: 1 },
    settlementTime: 11,
    settlementOrder: 1,
  })
  return db.transaction((tx) =>
    Effect.gen(function* () {
      yield* databaseV11Schema.up(tx)
      if (input?.corruption === "course_command_version" || input?.corruption === "course_capability_version") {
        yield* tx.run("PRAGMA ignore_check_constraints = ON")
      }
      yield* tx.run(sql`
        INSERT INTO learning_occurrence_source_order (
          sequence, occurrence_id, origin_session_id, origin_message_id, time_allocated,
          source_temporal_state, source_timezone, source_utc_offset_minutes
        ) VALUES (
          1, 'lco_00000000000000000000000001', 'ses_v11', 'msg_v11_course', 1, 'resolved', 'UTC', 0
        )
      `)
      yield* tx.run(sql`
        INSERT INTO learning_admitted_occurrence (
          id, origin_session_id, origin_message_id, time_admitted, source_order,
          source_temporal_state, source_timezone, source_utc_offset_minutes
        ) VALUES (
          'lco_00000000000000000000000001', 'ses_v11', 'msg_v11_course', 1, 1, 'resolved', 'UTC', 0
        )
      `)
      yield* tx.run(sql`
        INSERT INTO course (id, title, state_version, time_created, time_updated)
        VALUES ('crs_00000000000000000000000001', 'Frozen v11 migration fixture', 0, 1, 1)
      `)
      yield* tx.run(sql`
        INSERT INTO course_state_history (course_id, version, title, time_updated)
        VALUES ('crs_00000000000000000000000001', 0, 'Frozen v11 migration fixture', 1)
      `)
      yield* tx.run(sql`
        INSERT INTO course_view (id, course_id, name, state_version, time_created, time_updated)
        VALUES ('cvw_00000000000000000000000001', 'crs_00000000000000000000000001', 'Frozen v11 view', 0, 1, 1)
      `)
      yield* tx.run(sql`
        INSERT INTO course_view_revision (
          id, course_id, view_id, revision_number, authorship_basis, time_created
        ) VALUES ('cvr_00000000000000000000000001', 'crs_00000000000000000000000001', 'cvw_00000000000000000000000001', 1, 'learner_directed', 1)
      `)
      yield* tx.run(sql`
        INSERT INTO course_view_revision_state (
          course_id, view_id, revision_id, state_version, time_updated
        ) VALUES ('crs_00000000000000000000000001', 'cvw_00000000000000000000000001', 'cvr_00000000000000000000000001', 0, 1)
      `)
      yield* tx.run(sql`
        INSERT INTO course_item (id, course_id, time_created)
        VALUES ('cit_00000000000000000000000001', 'crs_00000000000000000000000001', 1)
      `)
      yield* tx.run(sql`
        INSERT INTO course_view_revision_item (
          course_id, view_id, revision_id, item_id, title, preorder_position, depth
        ) VALUES (
          'crs_00000000000000000000000001', 'cvw_00000000000000000000000001', 'cvr_00000000000000000000000001', 'cit_00000000000000000000000001', 'Frozen v11 item', 0, 0
        )
      `)
      yield* tx.run(sql`
        INSERT INTO course_selection_acceptance_effect (
          id, occurrence_id, course_id, accepted_revision_id, previous_selection_version,
          committed_selection_version, time_committed
        ) VALUES (
          'cse_00000000000000000000000001', 'lco_00000000000000000000000001', 'crs_00000000000000000000000001', 'cvr_00000000000000000000000001', 0, 1, 11
        )
      `)
      yield* tx.run(sql`
        INSERT INTO learning_command_invocation (
          part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
          occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
          capability_version, authorization_basis, input_fingerprint, status, effect_id,
          settlement, time_admitted, time_settled, settlement_order
        ) VALUES (
          'prt_v11_course', 'ses_v11', 'msg_v11_course', 'msg_v11_assistant_course',
          'call-v11-course', 'lco_00000000000000000000000001', 'accept_course_view_revision',
          ${input?.corruption === "course_command_version" ? 2 : 1}, 0,
          'accept_course_view_revision',
          ${input?.corruption === "course_capability_version" ? 2 : 1},
          'learner_request', ${"1".repeat(64)}, 'applied',
          'cse_00000000000000000000000001',
          ${settlement},
          1, 11, 1
        )
      `)
      yield* tx.run(sql`
        INSERT INTO learning_command_receipt (
          id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
          invocation_part_id, capability_identity, capability_version, authorization_basis,
          effect_id, time_committed, commit_order
        ) VALUES (
          'lcr_00000000000000000000000001', 'lco_00000000000000000000000001', 'ses_v11', 'msg_v11_course',
          'msg_v11_assistant_course', 'prt_v11_course', 'accept_course_view_revision',
          ${input?.corruption === "course_capability_version" ? 2 : 1},
          ${input?.corruption === "course_receipt_basis" ? "learner_acceptance" : "learner_request"},
          'cse_00000000000000000000000001', 11, ${receiptCommitOrder}
        )
      `)
      yield* seedFrozenV11LearningHistory(tx, input?.corruption)
      yield* tx.run("PRAGMA ignore_check_constraints = OFF")
      yield* installSchemaExtrasV11(tx)
      yield* tx.run(sql`
        CREATE TABLE ${sql.identifier("repa_migration")} (
          version INTEGER PRIMARY KEY,
          id TEXT NOT NULL UNIQUE,
          time_completed INTEGER NOT NULL
        )
      `)
      yield* tx.run(sql`
        INSERT INTO ${sql.identifier("repa_migration")} (version, id, time_completed)
        VALUES (${BASELINE_VERSION}, ${BASELINE_ID}, 1)
      `)
      yield* Effect.forEach(
        databaseV11Migrations,
        (migration, index) =>
          tx.run(sql`
            INSERT INTO ${sql.identifier("repa_migration")} (version, id, time_completed)
            VALUES (${BASELINE_VERSION + index + 1}, ${migration.id}, 1)
          `),
        { discard: true },
      )
      yield* tx.run(sql.raw(`PRAGMA application_id = ${APPLICATION_ID}`))
      yield* tx.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + databaseV11Migrations.length}`))
    }),
  )
}

function initializeDatabaseV16(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* initializeDatabaseV11(db)
    yield* DatabaseMigration.apply(db, {
      path: "frozen-gate16.db",
      migrations: databaseV16Migrations,
    })
  })
}

function seedFrozenV16MaterialMap(db: TestDatabase) {
  return db.transaction((tx) =>
    Effect.gen(function* () {
      yield* tx.run(sql.raw("PRAGMA defer_foreign_keys = ON"))
      yield* tx.run(sql`
        INSERT INTO content_root (id, time_created)
        VALUES ('root_gate17_fixture', 100)
      `)
      yield* tx.run(sql`
        INSERT INTO content_root_binding (
          id, content_root_id, canonical_path, canonical_path_key, platform,
          volume_serial, object_id, creation_time, initial_change_time,
          verifier_version, time_created
        ) VALUES (
          'root_binding_gate17_fixture', 'root_gate17_fixture', ${"C:\\gate17"}, ${"c:\\gate17"},
          'windows_ntfs', 'volume-gate17', ${"1".repeat(32)}, 'root-created', 'root-changed', 1, 100
        )
      `)
      yield* tx.run(sql`
        INSERT INTO content_root_binding_episode (
          id, content_root_id, binding_id, ordinal, approval_basis, time_started
        ) VALUES (
          'root_binding_episode_gate17_fixture', 'root_gate17_fixture',
          'root_binding_gate17_fixture', 1, 'frozen Gate 16 fixture', 100
        )
      `)
      yield* tx.run(sql`
        INSERT INTO content_root_grant_episode (
          id, content_root_id, binding_id, binding_episode_id, ordinal,
          approval_basis, time_approved, time_updated
        ) VALUES (
          'root_grant_episode_gate17_fixture', 'root_gate17_fixture',
          'root_binding_gate17_fixture', 'root_binding_episode_gate17_fixture', 1,
          'frozen Gate 16 fixture', 100, 100
        )
      `)
      yield* tx.run(sql`
        INSERT INTO artifact (
          id, admission_root_artifact_id, creation_basis, creation_capability_identity,
          creation_capability_version, disposition_version, lineage_version, time_created, time_updated
        ) VALUES (
          'artifact_gate17_fixture', 'artifact_gate17_fixture', 'learner_instruction',
          'frozen_gate16_fixture', 1, 0, 0, 100, 100
        )
      `)
      yield* tx.run(sql`
        INSERT INTO artifact_revision (
          id, recorded_artifact_id, fingerprint_algorithm, fingerprint_digest,
          byte_length, time_first_observed
        ) VALUES (
          'artifact_revision_gate17_fixture', 'artifact_gate17_fixture', 'sha256',
          ${"2".repeat(64)}, 4, 100
        )
      `)
      yield* tx.run(sql`
        INSERT INTO artifact_source_binding (
          id, recorded_artifact_id, binding_ordinal, canonical_location, basis_kind,
          basis_capability_identity, basis_capability_version, time_started
        ) VALUES (
          'artifact_binding_gate17_fixture', 'artifact_gate17_fixture', 1,
          ${"C:\\gate17\\fixture.txt"}, 'admission', 'frozen_gate16_fixture', 1, 100
        )
      `)
      yield* tx.run(sql`
        INSERT INTO artifact_source_observation (
          id, recorded_artifact_id, binding_id, occurrence_ordinal, result, revision_id,
          media_type, observer_capability_identity, observer_capability_version,
          time_observed, time_committed
        ) VALUES (
          'artifact_observation_gate17_fixture', 'artifact_gate17_fixture',
          'artifact_binding_gate17_fixture', 1, 'present', 'artifact_revision_gate17_fixture',
          'text/plain', 'frozen_gate16_fixture', 1, 100, 100
        )
      `)
      yield* tx.run(sql`
        INSERT INTO material_map_artifact_target (
          map_id, artifact_id, artifact_revision_id, attribution_type, attribution_member_id,
          disposition_version, lineage_version, source_version, artifact_binding_id, active_location,
          descriptor_observation_id, descriptor_correction_id, fingerprint_algorithm, fingerprint_digest,
          byte_length, media_type, content_root_id, content_root_binding_id,
          content_root_binding_episode_id, content_root_binding_episode_ordinal,
          content_root_grant_episode_id, content_root_grant_episode_ordinal, content_root_grant_version,
          normalized_relative_path, source_object_platform, source_object_verifier_version,
          source_object_canonical_path, source_object_canonical_path_key, source_object_volume_serial,
          source_object_id, source_object_creation_time, source_object_change_time,
          source_object_last_write_time, source_object_size, source_observed_time
        ) VALUES (
          'map_gate17_fixture', 'artifact_gate17_fixture', 'artifact_revision_gate17_fixture',
          'recorded', NULL, 0, 0, 1, 'artifact_binding_gate17_fixture', ${"C:\\gate17\\fixture.txt"},
          'artifact_observation_gate17_fixture', NULL, 'sha256', ${"2".repeat(64)},
          4, 'text/plain', 'root_gate17_fixture', 'root_binding_gate17_fixture',
          'root_binding_episode_gate17_fixture', 1, 'root_grant_episode_gate17_fixture', 1, 1,
          'fixture.txt', 'windows_ntfs', 1, ${"C:\\gate17\\fixture.txt"}, ${"c:\\gate17\\fixture.txt"},
          'volume-gate17', ${"3".repeat(32)}, 'source-created', 'source-changed',
          'source-written', 4, 100
        )
      `)
      yield* tx.run(sql`
        INSERT INTO material_map_state (map_id, version, disposition, withdrawal_reason, time_updated)
        VALUES ('map_gate17_fixture', 0, 'active', NULL, 100)
      `)
      yield* tx.run(sql`
        INSERT INTO material_map_disposition_event (id, map_id, version, disposition, reason, time_committed)
        VALUES ('map_disposition_gate17_fixture', 'map_gate17_fixture', 0, 'active', NULL, 100)
      `)
      yield* tx.run(sql`
        INSERT INTO material_outline_node (id, map_id, parent_node_id, title, preorder_position, depth)
        VALUES ('map_node_gate17_fixture', 'map_gate17_fixture', NULL, 'Fixture', 0, 0)
      `)
      yield* tx.run(sql`
        INSERT INTO material_selector (
          id, map_id, node_id, selector_position, kind, witness_algorithm,
          witness_digest, witness_byte_length
        ) VALUES (
          'map_selector_gate17_fixture', 'map_gate17_fixture', 'map_node_gate17_fixture',
          0, 'whole_target.v1', 'sha256', ${"2".repeat(64)}, 4
        )
      `)
      yield* tx.run(sql`
        INSERT INTO material_map (
          id, canonical_input, target_kind, authorship_basis,
          authorship_capability_identity, authorship_capability_version, time_created
        ) VALUES (
          'map_gate17_fixture', ${JSON.stringify({ fixture: "frozen_gate16" })}, 'artifact',
          'frozen Gate 16 fixture', 'frozen_gate16_fixture', 1, 100
        )
      `)
    }),
  )
}

function seedFrozenV11LearningHistory(
  tx: Parameters<DatabaseMigration.Migration["up"]>[0],
  corruption: FrozenV11Corruption | undefined,
) {
  const defaultConfirmation = {
    permissionRequestID: "permission_v11_default",
    headID: null,
    version: 0,
    fromCourseID: null,
    fromCourseTitle: null,
    target: {
      courseID: "crs_00000000000000000000000001",
      courseTitle: "Frozen v11 migration fixture",
      courseVersion: 0,
      selectionRevisionID: null,
      selectionVersion: 0,
      viewID: null,
      viewName: null,
      viewVersion: null,
      revisionVersion: null,
    },
  }
  const defaultReceiptConfirmation =
    corruption === "default_confirmation" ? { ...defaultConfirmation, target: null } : defaultConfirmation
  const goalCommand = {
    operations: [
      {
        type: "create",
        snapshot: {
          outcome: "Preserve exact v11 migration semantics",
          conditions: [],
          scope: { type: "learner_home" },
          target: { type: "absent" },
          fieldBases: {
            outcome: { type: "accepted" },
            conditions: { type: "accepted" },
            scope: { type: "accepted" },
            target: { type: "accepted" },
            disposition: { type: "accepted" },
          },
        },
        disposition: "active",
      },
    ],
  }
  const goalMeaning =
    corruption === "goal_operation_meaning"
      ? {}
      : {
          outcome: "Preserve exact v11 migration semantics",
          conditions: [],
          scope: { type: "learner_home" },
          target: { type: "absent" },
        }
  const goalFingerprint = "6".repeat(64)
  const goalConfirmation = {
    schemaVersion: 1,
    authorizationBasis: "learner_acceptance",
    semanticFingerprint: goalFingerprint,
    command: goalCommand,
    goalBases: [],
    courseBases: [],
  }
  const goalInvocationConfirmation =
    corruption === "goal_confirmation" ? { ...goalConfirmation, semanticFingerprint: "7".repeat(64) } : goalConfirmation
  const representationSettlement = JSON.stringify({
    outcome: "applied",
    receiptID: "lcr_00000000000000000000000002",
    effectID: "rfx_00000000000000000000000001",
    representationRevisionID: "rep_00000000000000000000000001",
    effectiveArtifactID: "art_00000000000000000000000001",
    sourceRevisionID: "arv_00000000000000000000000001",
    producerKind: "configured_model",
    settlementTime: 12,
    settlementOrder: 2,
  })
  const defaultCurrent = {
    kind: "default_course_preference",
    headID: "ndp_00000000000000000000000001",
    version: 1,
    courseID: "crs_00000000000000000000000001",
    usability: { usable: true, title: "Frozen v11 migration fixture" },
    source: {
      receiptID: "lcr_00000000000000000000000003",
      occurrenceID: "lco_00000000000000000000000003",
      originSessionID: "ses_v11",
      originMessageID: "msg_v11_default",
      assistantMessageID: "msg_v11_assistant_default",
      invocationPartID: "prt_v11_default",
      availability: "available",
    },
    timeCommitted: 13,
    commitOrder: 3,
    frontierSequence: 1,
  }
  const defaultSettlement = JSON.stringify({
    outcome: "applied",
    navigationKind: "default_course_preference",
    receiptID: "lcr_00000000000000000000000003",
    effectID: "ndp_00000000000000000000000001",
    effect: {
      id: "ndp_00000000000000000000000001",
      occurrenceID: "lco_00000000000000000000000003",
      previousCourseID: null,
      courseID: "crs_00000000000000000000000001",
      previousVersion: 0,
      version: 1,
      timeCommitted: 13,
      commitOrder: 3,
      frontierSequence: 1,
    },
    current: defaultCurrent,
    confirmation: defaultConfirmation,
    settlementTime: 13,
    settlementOrder: 3,
  })
  const anchorEffect = {
    id: "nar_00000000000000000000000001",
    occurrenceID: "lco_00000000000000000000000004",
    courseID: "crs_00000000000000000000000001",
    previousTarget: null,
    target: {
      courseID: "crs_00000000000000000000000001",
      viewID: "cvw_00000000000000000000000001",
      revisionID: "cvr_00000000000000000000000001",
      itemID: "cit_00000000000000000000000001",
    },
    previousVersion: 0,
    version: 1,
    timeCommitted: 14,
    commitOrder: 4,
    frontierSequence: 2,
  }
  const anchorCurrent = {
    kind: "course_route_anchor",
    courseID: "crs_00000000000000000000000001",
    headID: "nar_00000000000000000000000001",
    version: 1,
    target: anchorEffect.target,
    usability: { usable: true },
    source: {
      receiptID: "lcr_00000000000000000000000004",
      occurrenceID: "lco_00000000000000000000000004",
      originSessionID: "ses_v11",
      originMessageID: "msg_v11_anchor",
      assistantMessageID: "msg_v11_assistant_anchor",
      invocationPartID: "prt_v11_anchor",
      availability: "available",
    },
    timeCommitted: 14,
    commitOrder: 4,
    frontierSequence: 2,
  }
  const anchorSettlement = JSON.stringify({
    outcome: "applied",
    navigationKind: "course_route_anchor",
    receiptID: "lcr_00000000000000000000000004",
    effectID: "nar_00000000000000000000000001",
    effect: anchorEffect,
    current: anchorCurrent,
    settlementTime: 14,
    settlementOrder: 4,
  })
  const noChangeSettlement = JSON.stringify(
    corruption === "anchor_no_change_payload"
      ? {
          outcome: "no_change",
          navigationKind: "course_route_anchor",
          settlementTime: 18,
          settlementOrder: 8,
        }
      : {
          outcome: "no_change",
          navigationKind: "course_route_anchor",
          current:
            corruption === "anchor_no_change_usability"
              ? { ...anchorCurrent, usability: {} }
              : corruption === "anchor_no_change_partial_source"
                ? {
                    kind: "course_route_anchor",
                    courseID: "crs_00000000000000000000000001",
                    headID: null,
                    version: 0,
                    target: null,
                    usability: { usable: false, cause: "absent" },
                    timeCommitted: 18,
                  }
                : anchorCurrent,
          settlementTime: 18,
          settlementOrder: 8,
        },
  )
  const errorSettlement = JSON.stringify({
    outcome: "error",
    code: corruption === "retained_error_code" ? "invented_domain_failure" : "validation_error",
    ...(corruption === "retained_error_detail" ? { detail: { effectID: "rst_00000000000000000000000001" } } : {}),
    settlementTime: 19,
    settlementOrder: 9,
  })
  const retainedSettlement = JSON.stringify({
    outcome: "applied",
    receiptID: "lcr_00000000000000000000000005",
    effectID: "rst_00000000000000000000000001",
    policyID: "rsp_00000000000000000000000001",
    version: 1,
    state: "operative",
    acknowledgementTitle: "Preference retained",
    acknowledgementBody: "Concrete examples will be used first.",
    settlementTime: 15,
    settlementOrder: 5,
  })
  const goalOperation = {
    ordinal: 0,
    operation: "create",
    result: "changed",
    goalID: "gol_00000000000000000000000001",
    revisionID: "glr_00000000000000000000000001",
    version: 1,
    disposition: "active",
    meaning: goalMeaning,
    ...(corruption === "goal_replacement_target" ? { replacementTarget: {} } : {}),
  }
  const goalSettlement = JSON.stringify({
    outcome: "applied",
    goalKind: "learner_goal",
    receiptID: "lcr_00000000000000000000000006",
    effectID: "gle_00000000000000000000000001",
    authorizationBasis: "learner_acceptance",
    confirmationRequestID: "permission_v11_goal",
    frontierSequence: 4,
    acknowledgementTitle: "Goal recorded",
    acknowledgementBody: "The migration goal is now part of the learner record.",
    operations: [goalOperation],
    settlementTime: 16,
    settlementOrder: 6,
  })
  const replaySettlement = JSON.stringify({
    ...JSON.parse(representationSettlement),
    outcome: "already_applied",
    settlementTime: 17,
    settlementOrder: 7,
  })

  return Effect.gen(function* () {
    yield* tx.run(sql`
      INSERT INTO learning_occurrence_source_order (
        sequence, occurrence_id, origin_session_id, origin_message_id, time_allocated,
        source_temporal_state, source_timezone, source_utc_offset_minutes
      ) VALUES
        (2, 'lco_00000000000000000000000002', 'ses_v11', 'msg_v11_representation', 2, 'resolved', 'UTC', 0),
        (3, 'lco_00000000000000000000000003', 'ses_v11', 'msg_v11_default', 3, 'resolved', 'UTC', 0),
        (4, 'lco_00000000000000000000000004', 'ses_v11', 'msg_v11_anchor', 4, 'resolved', 'UTC', 0),
        (5, 'lco_00000000000000000000000005', 'ses_v11', 'msg_v11_retained', 5, 'resolved', 'UTC', 0),
        (6, 'lco_00000000000000000000000006', 'ses_v11', 'msg_v11_goal', 6, 'resolved', 'UTC', 0),
        (7, 'lco_00000000000000000000000007', 'ses_v11', 'msg_v11_no_change', 7, 'resolved', 'UTC', 0),
        (8, 'lco_00000000000000000000000008', 'ses_v11', 'msg_v11_error', 8, 'resolved', 'UTC', 0),
        (9, 'lco_00000000000000000000000009', 'ses_v11', 'msg_v11_admitted', 9, 'resolved', 'UTC', 0)
    `)
    yield* tx.run(sql`
      INSERT INTO learning_admitted_occurrence (
        id, origin_session_id, origin_message_id, time_admitted, source_order,
        source_temporal_state, source_timezone, source_utc_offset_minutes
      ) VALUES
        ('lco_00000000000000000000000002', 'ses_v11', 'msg_v11_representation', 2, 2, 'resolved', 'UTC', 0),
        ('lco_00000000000000000000000003', 'ses_v11', 'msg_v11_default', 3, 3, 'resolved', 'UTC', 0),
        ('lco_00000000000000000000000004', 'ses_v11', 'msg_v11_anchor', 4, 4, 'resolved', 'UTC', 0),
        ('lco_00000000000000000000000005', 'ses_v11', 'msg_v11_retained', 5, 5, 'resolved', 'UTC', 0),
        ('lco_00000000000000000000000006', 'ses_v11', 'msg_v11_goal', 6, 6, 'resolved', 'UTC', 0),
        ('lco_00000000000000000000000007', 'ses_v11', 'msg_v11_no_change', 7, 7, 'resolved', 'UTC', 0),
        ('lco_00000000000000000000000008', 'ses_v11', 'msg_v11_error', 8, 8, 'resolved', 'UTC', 0),
        ('lco_00000000000000000000000009', 'ses_v11', 'msg_v11_admitted', 9, 9, 'resolved', 'UTC', 0)
    `)

    yield* tx.run(sql`
      INSERT INTO artifact (
        id, admission_root_artifact_id, creation_basis, creation_capability_identity,
        creation_capability_version, disposition_version, lineage_version, correction_hidden,
        time_created, time_updated
      ) VALUES (
        'art_00000000000000000000000001', 'art_00000000000000000000000001', 'learner_instruction', 'fixture', 1, 0, 0, 0, 1, 1
      )
    `)
    yield* tx.run(sql`
      INSERT INTO artifact_revision (
        id, recorded_artifact_id, fingerprint_algorithm, fingerprint_digest,
        byte_length, time_first_observed
      ) VALUES (
        'arv_00000000000000000000000001', 'art_00000000000000000000000001', 'sha256', ${"a".repeat(64)}, 1, 1
      )
    `)
    yield* tx.run(sql`INSERT INTO content_root (id, time_created) VALUES ('content_root_v11', 1)`)
    yield* tx.run(sql`
      INSERT INTO content_root_binding (
        id, content_root_id, canonical_path, canonical_path_key, platform, volume_serial,
        object_id, creation_time, initial_change_time, verifier_version, time_created
      ) VALUES (
        'content_binding_v11', 'content_root_v11', 'C:\\v11', 'c:\\v11',
        'windows_ntfs', 'volume-v11', '0123456789abcdef0123456789abcdef',
        'creation-v11', 'change-v11', 1, 1
      )
    `)
    yield* tx.run(sql`
      INSERT INTO content_root_binding_episode (
        id, content_root_id, binding_id, ordinal, approval_basis, time_started
      ) VALUES (
        'content_binding_episode_v11', 'content_root_v11', 'content_binding_v11',
        1, 'learner approval', 1
      )
    `)
    yield* tx.run(sql`
      INSERT INTO content_root_grant_episode (
        id, content_root_id, binding_id, binding_episode_id, ordinal, approval_basis,
        time_approved, time_updated
      ) VALUES (
        'content_grant_episode_v11', 'content_root_v11', 'content_binding_v11',
        'content_binding_episode_v11', 1, 'learner approval', 1, 1
      )
    `)
    yield* tx.run(sql`
      INSERT INTO representation_effect (
        id, operation_identity, semantic_fingerprint, time_committed
      ) VALUES (
        'rfx_00000000000000000000000001', 'operation-v11-representation', ${"2".repeat(64)}, 12
      )
    `)
    yield* tx.run(sql`
      INSERT INTO representation_revision (
        id, effect_id, source_revision_id, effective_artifact_id, attribution_type,
        accepted_disposition_version, accepted_lineage_version, source_version,
        source_media_type, source_digest, source_byte_length, content_root_id,
        content_root_binding_id, content_root_binding_episode_id,
        content_root_binding_episode_ordinal, content_root_grant_episode_id,
        content_root_grant_version, normalized_relative_path, source_object_platform,
        source_object_verifier_version, source_object_canonical_path,
        source_object_canonical_path_key, source_object_volume_serial, source_object_id,
        source_object_creation_time, source_object_change_time, source_object_last_write_time,
        source_object_size, source_object_kind, source_observed_time, presented_input_digest,
        presented_input_byte_length, producer_kind, producer_identity, producer_version,
        provider_id, model_id, task_version, profile, canonicalizer_version,
        provenance_version, provenance, run_identity, result_boundary, terminal_status,
        diagnostics, usage, output_media_type, storage_key, output_digest,
        output_byte_length, profile_record_count, acceptance_basis, creation_basis,
        creation_identity, authorization_intent, authorization_basis, delivery_mode,
        causal_occurrence_id, causal_invocation_part_id, time_accepted
      ) VALUES (
        'rep_00000000000000000000000001', 'rfx_00000000000000000000000001', 'arv_00000000000000000000000001',
        'art_00000000000000000000000001', 'recorded', 0, 0, 0, 'application/pdf', ${"a".repeat(64)}, 1,
        'content_root_v11', 'content_binding_v11', 'content_binding_episode_v11', 1,
        'content_grant_episode_v11', 1, 'source.pdf', 'windows_ntfs', 1,
        'C:\\v11\\source.pdf', 'c:\\v11\\source.pdf', 'volume-v11',
        '0123456789abcdef0123456789abcdef', 'creation-v11', 'change-v11', 'write-v11',
        1, 'file', 2, ${"a".repeat(64)}, 1, 'configured_model', 'fixture-model', '1',
        'fixture-provider', 'fixture-model', 1, 'repa.model-rendition.v1', 1, 1, '{}',
        'run-v11', 'model_schema_v1', 'stop', '[]', '{}', 'text/markdown',
        'representation-v11.md', ${"b".repeat(64)}, 1, 1, 'model_claimed_rendition',
        'learning_command', 'operation-v11-representation', 'persistent_readable_access',
        ${corruption === "representation_revision_basis" ? "learner_acceptance" : "learner_request"},
        'model_tool', 'lco_00000000000000000000000002', 'prt_v11_representation', 12
      )
    `)

    yield* tx.run(sql`
      INSERT INTO learner_default_course_transition (
        id, version, previous_course_id, course_id, occurrence_id, permission_request_id,
        confirmation_snapshot, target_course_version, target_selection_version,
        time_committed, commit_order, frontier_sequence, frontier_time
      ) VALUES (
        'ndp_00000000000000000000000001', 1, NULL, 'crs_00000000000000000000000001', 'lco_00000000000000000000000003',
        'permission_v11_default', ${JSON.stringify(defaultConfirmation)}, 0, 0, 13, 3, 1, 13
      )
    `)
    yield* tx.run(sql`
      INSERT INTO learner_course_route_anchor_transition (
        id, course_id, version, target_view_id, target_revision_id, target_item_id,
        occurrence_id, target_course_version, target_selection_version, target_view_version,
        target_revision_version, time_committed, commit_order, frontier_sequence, frontier_time
      ) VALUES (
        'nar_00000000000000000000000001', 'crs_00000000000000000000000001', 1, 'cvw_00000000000000000000000001', 'cvr_00000000000000000000000001', 'cit_00000000000000000000000001',
        'lco_00000000000000000000000004', 0, 0, 0, 0, 14, 4, 2, 14
      )
    `)

    yield* tx.run(sql`
      INSERT INTO retained_steering_commit_seal (transition_id, receipt_id, invocation_part_id)
      VALUES (
        'rst_00000000000000000000000001',
        ${corruption === "retained_seal" ? "lcr_00000000000000000000000001" : "lcr_00000000000000000000000005"},
        'prt_v11_retained'
      )
    `)
    yield* tx.run(
      sql`INSERT INTO retained_steering_policy (id, time_created) VALUES ('rsp_00000000000000000000000001', 5)`,
    )
    yield* tx.run(sql`
      INSERT INTO retained_steering_state (singleton, steering_revision, latest_cut_as_of)
      VALUES (1, 1, 0)
    `)
    yield* tx.run(sql`
      INSERT INTO retained_steering_transition (
        id, commit_seal_id, policy_id, version, previous_state, occurrence_id, source_order,
        state, scope, source_excerpt, operative_instruction, learner_reason, effective_from,
        valid_until, valid_until_source, valid_until_normalized, boundary_timezone,
        boundary_utc_offset_minutes, semantic_fingerprint, steering_revision, time_committed,
        commit_order, frontier_sequence, frontier_time, acknowledgement_title,
        acknowledgement_body
      ) VALUES (
        'rst_00000000000000000000000001', 'rst_00000000000000000000000001', 'rsp_00000000000000000000000001', 1, 'absent',
        'lco_00000000000000000000000005', 5, 'operative', 'learning_wide', 'Keep examples concrete',
        'Use concrete examples first', 'I learn faster that way', 5, 500,
        'until the course ends', '1970-01-01T00:08:20.000Z', 'UTC', 0,
        ${"5".repeat(64)}, 1, 15, 5, 3, 15, 'Preference retained',
        'Concrete examples will be used first.'
      )
    `)

    yield* tx.run(sql`
      INSERT INTO learner_goal_commit_seal (effect_id, receipt_id, invocation_part_id)
      VALUES (
        'gle_00000000000000000000000001', 'lcr_00000000000000000000000006', 'prt_v11_goal'
      )
    `)
    yield* tx.run(sql`
      INSERT INTO learner_goal_effect (
        id, commit_seal_id, occurrence_id, source_order, semantic_fingerprint,
        authorization_basis, command, operation_count, change_count, time_committed,
        commit_order, frontier_sequence, frontier_time, acknowledgement_title,
        acknowledgement_body
      ) VALUES (
        'gle_00000000000000000000000001', 'gle_00000000000000000000000001',
        'lco_00000000000000000000000006', 6, ${goalFingerprint}, 'learner_acceptance',
        ${JSON.stringify(goalCommand)}, 1, 1, 16, 6, 4, 16, 'Goal recorded',
        'The migration goal is now part of the learner record.'
      )
    `)
    yield* tx.run(sql`
      INSERT INTO learner_goal (id, time_created)
      VALUES ('gol_00000000000000000000000001', 16)
    `)
    yield* tx.run(sql`
      INSERT INTO learner_goal_revision (
        id, goal_id, version, effect_id, operation_ordinal, revision_role, occurrence_id,
        source_order, outcome, scope_kind, target_kind, disposition, revision_order,
        time_committed, commit_order, frontier_sequence, frontier_time
      ) VALUES (
        'glr_00000000000000000000000001', 'gol_00000000000000000000000001', 1,
        'gle_00000000000000000000000001', 0, 'source', 'lco_00000000000000000000000006', 6,
        'Preserve exact v11 migration semantics', 'learner_home', 'absent', 'active',
        1, 16, 6, 4, 16
      )
    `)
    yield* tx.run(sql`
      INSERT INTO learner_goal_field_basis (
        revision_id, field, basis_kind
      ) VALUES
        ('glr_00000000000000000000000001', 'outcome', 'accepted'),
        ('glr_00000000000000000000000001', 'conditions', 'accepted'),
        ('glr_00000000000000000000000001', 'scope', 'accepted'),
        ('glr_00000000000000000000000001', 'target', 'accepted'),
        ('glr_00000000000000000000000001', 'disposition', 'accepted')
    `)
    yield* tx.run(sql`
      INSERT INTO learner_goal_effect_operation (
        effect_id, ordinal, operation_kind, result_kind, goal_id, revision_id,
        version, disposition, meaning
      ) VALUES (
        'gle_00000000000000000000000001', 0, 'create', 'changed',
        'gol_00000000000000000000000001', 'glr_00000000000000000000000001',
        1, 'active', ${JSON.stringify(goalMeaning)}
      )
    `)
    yield* tx.run(sql`INSERT INTO learner_goal_state (singleton, revision_sequence) VALUES (1, 1)`)
    yield* tx.run(sql`INSERT INTO learner_goal_state_guard (singleton) VALUES (1)`)

    yield* tx.run(sql`
      INSERT INTO learning_command_invocation (
        part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
        occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
        capability_version, authorization_basis, input_fingerprint,
        retained_steering_semantic_fingerprint, goal_semantic_fingerprint,
        goal_command_snapshot, status, effect_id, representation_effect_id,
        default_navigation_effect_id, anchor_navigation_effect_id,
        retained_steering_effect_id, goal_effect_id, permission_request_id,
        goal_confirmation_snapshot, settlement, time_admitted, time_settled,
        settlement_order, turn_id, input_id
      ) VALUES
        (
          'prt_v11_representation', 'ses_v11', 'msg_v11_representation',
          'msg_v11_assistant_representation', 'call-v11-representation',
          'lco_00000000000000000000000002', 'representation.convert', 1, 0,
          'representation.convert', 1, 'learner_request', ${"2".repeat(64)}, NULL, NULL,
          NULL, 'applied', NULL, 'rfx_00000000000000000000000001', NULL, NULL, NULL, NULL,
          NULL, NULL, ${representationSettlement}, 2, 12, 2,
          'turn-v11-representation', 'input-v11-representation'
        ),
        (
          'prt_v11_default', 'ses_v11', 'msg_v11_default', 'msg_v11_assistant_default',
          'call-v11-default', 'lco_00000000000000000000000003', 'set_default_course_preference', 1, 0,
          'set_default_course_preference', 1, 'learner_acceptance', ${"3".repeat(64)},
          NULL, NULL, NULL, 'applied', NULL, NULL, 'ndp_00000000000000000000000001', NULL, NULL, NULL,
          'permission_v11_default', NULL, ${defaultSettlement}, 3, 13, 3,
          'turn-v11-default', 'input-v11-default'
        ),
        (
          'prt_v11_anchor', 'ses_v11', 'msg_v11_anchor', 'msg_v11_assistant_anchor',
          'call-v11-anchor', 'lco_00000000000000000000000004', 'set_course_route_anchor', 1, 0,
          'set_course_route_anchor', 1, 'learner_request', ${"4".repeat(64)}, NULL, NULL,
          NULL, 'applied', NULL, NULL, NULL, 'nar_00000000000000000000000001', NULL, NULL, NULL, NULL,
          ${anchorSettlement}, 4, 14, 4, 'turn-v11-anchor', 'input-v11-anchor'
        ),
        (
          'prt_v11_retained', 'ses_v11', 'msg_v11_retained', 'msg_v11_assistant_retained',
          'call-v11-retained', 'lco_00000000000000000000000005', 'update_retained_learning_steering', 1, 0,
          'update_retained_learning_steering', 1, 'learner_request', ${"5".repeat(64)},
          ${corruption === "retained_fingerprint" ? "7".repeat(64) : "5".repeat(64)},
          NULL, NULL, 'applied', NULL, NULL, NULL, NULL, 'rst_00000000000000000000000001', NULL,
          NULL, NULL, ${retainedSettlement}, 5, 15, 5,
          'turn-v11-retained', 'input-v11-retained'
        ),
        (
          'prt_v11_goal', 'ses_v11', 'msg_v11_goal', 'msg_v11_assistant_goal',
          'call-v11-goal', 'lco_00000000000000000000000006', 'update_learner_goals', 1, 0,
          'update_learner_goals', 1, 'learner_acceptance', ${"6".repeat(64)}, NULL,
          ${goalFingerprint}, ${JSON.stringify(goalCommand)}, 'applied', NULL, NULL, NULL,
          NULL, NULL, 'gle_00000000000000000000000001', 'permission_v11_goal',
          ${JSON.stringify(goalInvocationConfirmation)}, ${goalSettlement}, 6, 16, 6,
          'turn-v11-goal', 'input-v11-goal'
        ),
        (
          'prt_v11_replay', 'ses_v11', 'msg_v11_representation',
          'msg_v11_assistant_replay', 'call-v11-replay', 'lco_00000000000000000000000002',
          'representation.convert', 1, 0, 'representation.convert', 1, 'learner_request',
          ${"7".repeat(64)}, NULL, NULL, NULL, 'already_applied', NULL,
          'rfx_00000000000000000000000001', NULL, NULL, NULL, NULL, NULL, NULL,
          ${replaySettlement}, 7, 17, 7, 'turn-v11-replay', 'input-v11-replay'
        ),
        (
          'prt_v11_no_change', 'ses_v11', 'msg_v11_no_change',
          'msg_v11_assistant_no_change', 'call-v11-no-change', 'lco_00000000000000000000000007',
          'set_course_route_anchor', 1, 0, 'set_course_route_anchor', 1,
          'learner_request', ${"8".repeat(64)}, NULL, NULL, NULL, 'no_change',
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          ${noChangeSettlement},
          7, 18, 8, 'turn-v11-no-change', 'input-v11-no-change'
        ),
        (
          'prt_v11_error', 'ses_v11', 'msg_v11_error', 'msg_v11_assistant_error',
          'call-v11-error', 'lco_00000000000000000000000008', 'update_retained_learning_steering', 1, 0,
          'update_retained_learning_steering', 1, 'learner_request', ${"9".repeat(64)},
          ${"9".repeat(64)}, NULL, NULL, 'error', NULL, NULL, NULL, NULL, NULL, NULL,
          NULL, NULL,
          ${errorSettlement},
          8, 19, 9, 'turn-v11-error', 'input-v11-error'
        ),
        (
          'prt_v11_admitted', 'ses_v11', 'msg_v11_admitted',
          'msg_v11_assistant_admitted', 'call-v11-admitted', 'lco_00000000000000000000000009',
          'update_retained_learning_steering', 1, 0,
          'update_retained_learning_steering', 1, 'learner_request', ${"a".repeat(64)},
          ${"a".repeat(64)}, NULL, NULL, 'admitted', NULL, NULL, NULL, NULL, NULL, NULL,
          NULL, NULL, NULL, 9, NULL, NULL, 'turn-v11-admitted', 'input-v11-admitted'
        )
    `)

    yield* tx.run(sql`
      INSERT INTO learning_command_receipt (
        id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
        invocation_part_id, capability_identity, capability_version, authorization_basis,
        effect_id, representation_effect_id, default_navigation_effect_id,
        anchor_navigation_effect_id, retained_steering_effect_id, goal_effect_id,
        permission_request_id, confirmation_snapshot, time_committed, commit_order
      ) VALUES
        (
          'lcr_00000000000000000000000002', 'lco_00000000000000000000000002', 'ses_v11',
          'msg_v11_representation', 'msg_v11_assistant_representation',
          'prt_v11_representation', 'representation.convert', 1, 'learner_request',
          NULL, 'rfx_00000000000000000000000001', NULL, NULL, NULL, NULL, NULL, NULL, 12, 2
        ),
        (
          'lcr_00000000000000000000000003', 'lco_00000000000000000000000003', 'ses_v11', 'msg_v11_default',
          'msg_v11_assistant_default', 'prt_v11_default',
          'set_default_course_preference', 1, 'learner_acceptance', NULL, NULL,
          'ndp_00000000000000000000000001', NULL, NULL, NULL, 'permission_v11_default',
          ${JSON.stringify(defaultReceiptConfirmation)}, 13, 3
        ),
        (
          'lcr_00000000000000000000000004', 'lco_00000000000000000000000004', 'ses_v11', 'msg_v11_anchor',
          'msg_v11_assistant_anchor', 'prt_v11_anchor', 'set_course_route_anchor',
          1, 'learner_request', NULL, NULL, NULL, 'nar_00000000000000000000000001', NULL, NULL,
          NULL, NULL, ${corruption === "anchor_receipt_time" ? 99 : 14}, 4
        ),
        (
          'lcr_00000000000000000000000005', 'lco_00000000000000000000000005', 'ses_v11', 'msg_v11_retained',
          'msg_v11_assistant_retained', 'prt_v11_retained',
          'update_retained_learning_steering', 1, 'learner_request', NULL, NULL,
          NULL, NULL, 'rst_00000000000000000000000001', NULL, NULL, NULL, 15, 5
        ),
        (
          'lcr_00000000000000000000000006', 'lco_00000000000000000000000006', 'ses_v11', 'msg_v11_goal',
          'msg_v11_assistant_goal', 'prt_v11_goal', 'update_learner_goals', 1,
          'learner_acceptance', NULL, NULL, NULL, NULL, NULL,
          'gle_00000000000000000000000001', 'permission_v11_goal',
          ${JSON.stringify(goalConfirmation)}, 16, 6
        )
    `)
  })
}

function courseSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE tbl_name LIKE 'course%'
        AND tbl_name <> 'course_state_history'
        AND name NOT LIKE 'course_state_history_%'
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function learningCommandSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE (tbl_name LIKE 'learning%' OR tbl_name = 'course_selection_acceptance_effect')
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function artifactSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE tbl_name LIKE 'artifact%' AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function contentRootSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE (tbl_name LIKE 'content_root%' OR tbl_name = 'content_mutation_grant')
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function representationSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE tbl_name LIKE 'representation%' AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function turnSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE (tbl_name LIKE 'turn%' OR tbl_name LIKE 'session_historical_%' OR tbl_name = 'learning_shared_frontier')
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function learnerNavigationSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE (tbl_name LIKE 'learner_%' OR tbl_name IN ('learning_command_invocation', 'learning_command_receipt'))
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function retainedSteeringSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE tbl_name IN (
        'learning_admitted_occurrence', 'learning_occurrence_source_order',
        'learning_command_invocation', 'learning_command_receipt', 'turn_model_operation',
        'retained_steering_state', 'retained_steering_policy', 'retained_steering_transition',
        'retained_steering_commit_seal'
      )
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function learnerGoalSchema(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_master
      WHERE (tbl_name LIKE 'learner_goal%'
        OR tbl_name = 'course_state_history'
        OR name LIKE 'course_state_history_%'
        OR tbl_name IN ('learning_command_invocation', 'learning_command_receipt'))
        AND name NOT LIKE 'sqlite_autoindex_%'
      ORDER BY type, name
    `,
    )
    .pipe(Effect.map((rows) => rows.map((row) => ({ ...row, definition: normalizeSchemaDefinition(row.definition) }))))
}

function dropCourseStateHistory(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* db.run(sql`DROP TRIGGER IF EXISTS course_state_history_capture_insert`)
    yield* db.run(sql`DROP TRIGGER IF EXISTS course_state_history_capture_update`)
    yield* db.run(sql`DROP TABLE IF EXISTS course_state_history`)
  })
}

function restoreV12DefaultCourseTransition(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* db.run(
      sql.raw(`
      CREATE TABLE __v12_learner_default_course_transition (
        id text PRIMARY KEY,
        version integer NOT NULL CONSTRAINT learner_default_course_version_unique UNIQUE,
        predecessor_id text CONSTRAINT learner_default_course_predecessor_unique UNIQUE,
        previous_course_id text,
        course_id text,
        occurrence_id text NOT NULL CONSTRAINT learner_default_course_occurrence_unique UNIQUE,
        permission_request_id text NOT NULL,
        confirmation_snapshot text NOT NULL,
        target_course_version integer,
        target_selection_revision_id text,
        target_selection_version integer,
        target_view_id text,
        target_view_version integer,
        target_revision_version integer,
        time_committed integer NOT NULL,
        commit_order integer NOT NULL,
        frontier_sequence integer NOT NULL CONSTRAINT learner_default_course_frontier_unique UNIQUE,
        frontier_time integer NOT NULL,
        FOREIGN KEY (predecessor_id) REFERENCES learner_default_course_transition(id) ON DELETE RESTRICT,
        FOREIGN KEY (previous_course_id) REFERENCES course(id) ON DELETE RESTRICT,
        FOREIGN KEY (course_id) REFERENCES course(id) ON DELETE RESTRICT,
        FOREIGN KEY (course_id, target_view_id) REFERENCES course_view(course_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (course_id, target_view_id, target_selection_revision_id)
          REFERENCES course_view_revision(course_id, view_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (occurrence_id) REFERENCES learning_admitted_occurrence(id) ON DELETE RESTRICT,
        CHECK((version = 1 AND predecessor_id IS NULL AND previous_course_id IS NULL)
          OR (version > 1 AND predecessor_id IS NOT NULL)),
        CHECK(NOT (course_id IS previous_course_id)),
        CHECK((course_id IS NULL AND target_course_version IS NULL
          AND target_selection_revision_id IS NULL AND target_selection_version IS NULL
          AND target_view_id IS NULL AND target_view_version IS NULL AND target_revision_version IS NULL)
          OR (course_id IS NOT NULL AND target_course_version IS NOT NULL
            AND target_selection_version IS NOT NULL
            AND ((target_selection_revision_id IS NULL AND target_view_id IS NULL
              AND target_view_version IS NULL AND target_revision_version IS NULL)
              OR (target_selection_revision_id IS NOT NULL AND target_view_id IS NOT NULL
                AND target_view_version IS NOT NULL AND target_revision_version IS NOT NULL)))),
        CHECK(version >= 1
          AND (target_course_version IS NULL OR target_course_version >= 0)
          AND (target_selection_version IS NULL OR target_selection_version >= 0)
          AND (target_view_version IS NULL OR target_view_version >= 0)
          AND (target_revision_version IS NULL OR target_revision_version >= 0)),
        CHECK(length(permission_request_id) > 0),
        CHECK(json_valid(confirmation_snapshot)),
        CHECK(time_committed >= 0 AND commit_order >= 0
          AND frontier_sequence >= 1 AND frontier_time = time_committed)
      ) WITHOUT ROWID
    `),
    )
    yield* db.run(
      sql.raw(`
      INSERT INTO __v12_learner_default_course_transition (
        id, version, predecessor_id, previous_course_id, course_id, occurrence_id,
        permission_request_id, confirmation_snapshot, target_course_version,
        target_selection_revision_id, target_selection_version, target_view_id,
        target_view_version, target_revision_version, time_committed, commit_order,
        frontier_sequence, frontier_time
      )
      SELECT
        id, version, predecessor_id, previous_course_id, course_id, occurrence_id,
        permission_request_id, confirmation_snapshot, target_course_version,
        target_selection_revision_id, target_selection_version, target_view_id,
        target_view_version, target_revision_version, time_committed, commit_order,
        frontier_sequence, frontier_time
      FROM learner_default_course_transition
    `),
    )
    yield* db.run(sql`DROP TABLE learner_default_course_transition`)
    yield* db.run(sql`ALTER TABLE __v12_learner_default_course_transition RENAME TO learner_default_course_transition`)
    yield* db.run(
      sql`CREATE INDEX learner_default_course_history_idx ON learner_default_course_transition (version, id)`,
    )
    yield* db.run(
      sql`CREATE INDEX learner_default_course_frontier_idx ON learner_default_course_transition (frontier_sequence, version)`,
    )
  })
}

function removeMessageDiffProjection(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* db.run(sql`ALTER TABLE message DROP COLUMN summary_diffs`)
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 14}`)
  })
}

function completeSchemaManifest(db: TestDatabase) {
  return db
    .all<{ type: string; name: string; tableName: string; definition: string | null }>(
      sql`
      SELECT type, name, tbl_name AS tableName, sql AS definition
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
        AND sql IS NOT NULL
      ORDER BY type, name
    `,
    )
    .pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          ...row,
          definition: normalizeSchemaDefinition(row.definition),
        })),
      ),
    )
}

function dropGate17(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* db.run(sql.raw("PRAGMA foreign_keys = OFF"))
    const triggers = yield* db.all<{ name: string }>(sql`
      SELECT name FROM sqlite_master
      WHERE type = 'trigger'
        AND (name LIKE 'learning_bootstrap_%'
          OR name LIKE 'learning_course_material_%'
          OR name = 'learner_course_route_anchor_commit_seal_validate_insert_v17'
          OR name = 'material_map_validate_insert')
    `)
    yield* Effect.forEach(triggers, (trigger) => db.run(sql`DROP TRIGGER ${sql.identifier(trigger.name)}`), {
      discard: true,
    })
    for (const table of [
      "learning_bootstrap_alignment_result",
      "learning_bootstrap_anchor_result",
      "learning_bootstrap_capability_settlement",
      "learning_bootstrap_capability_issue",
      "learning_bootstrap_map_result",
      "learning_bootstrap_material_result",
      "learning_bootstrap_selection_result",
      "learning_bootstrap_route_result",
      "learning_bootstrap_course_result",
      "learning_course_material_adoption",
      "learning_bootstrap_commit_seal",
      "learning_bootstrap_disposition",
      "learning_bootstrap_effect",
    ]) {
      yield* db.run(sql`DROP TABLE IF EXISTS ${sql.identifier(table)}`)
    }
    yield* db.run(
      sql.raw(`
      CREATE TABLE __gate16_material_map_artifact_target (
        map_id text PRIMARY KEY,
        artifact_id text NOT NULL,
        artifact_revision_id text NOT NULL,
        attribution_type text NOT NULL,
        attribution_member_id text,
        disposition_version integer NOT NULL,
        lineage_version integer NOT NULL,
        source_version integer NOT NULL,
        artifact_binding_id text NOT NULL,
        active_location text NOT NULL,
        descriptor_observation_id text NOT NULL,
        descriptor_correction_id text,
        fingerprint_algorithm text NOT NULL,
        fingerprint_digest text NOT NULL,
        byte_length integer NOT NULL,
        media_type text NOT NULL,
        content_root_id text NOT NULL,
        content_root_binding_id text NOT NULL,
        content_root_binding_episode_id text NOT NULL,
        content_root_binding_episode_ordinal integer NOT NULL,
        content_root_grant_episode_id text NOT NULL,
        content_root_grant_episode_ordinal integer NOT NULL,
        content_root_grant_version integer NOT NULL,
        normalized_relative_path text NOT NULL,
        source_object_platform text NOT NULL,
        source_object_verifier_version integer NOT NULL,
        source_object_canonical_path text NOT NULL,
        source_object_canonical_path_key text NOT NULL,
        source_object_volume_serial text NOT NULL,
        source_object_id text NOT NULL,
        source_object_creation_time text NOT NULL,
        source_object_change_time text NOT NULL,
        source_object_last_write_time text NOT NULL,
        source_object_size integer NOT NULL,
        source_observed_time integer NOT NULL,
        FOREIGN KEY (map_id) REFERENCES material_map(id) ON DELETE RESTRICT,
        FOREIGN KEY (artifact_id) REFERENCES artifact(id) ON DELETE RESTRICT,
        FOREIGN KEY (artifact_revision_id) REFERENCES artifact_revision(id) ON DELETE RESTRICT,
        FOREIGN KEY (artifact_binding_id) REFERENCES artifact_source_binding(id) ON DELETE RESTRICT,
        FOREIGN KEY (descriptor_observation_id) REFERENCES artifact_source_observation(id) ON DELETE RESTRICT,
        FOREIGN KEY (descriptor_correction_id) REFERENCES artifact_observation_correction(id) ON DELETE RESTRICT,
        FOREIGN KEY (attribution_member_id) REFERENCES artifact_lineage_correction_member(id) ON DELETE RESTRICT,
        FOREIGN KEY (content_root_id) REFERENCES content_root(id) ON DELETE RESTRICT,
        FOREIGN KEY (content_root_id, content_root_binding_id)
          REFERENCES content_root_binding(content_root_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (content_root_id, content_root_binding_episode_id, content_root_binding_id, content_root_binding_episode_ordinal)
          REFERENCES content_root_binding_episode(content_root_id, id, binding_id, ordinal) ON DELETE RESTRICT,
        FOREIGN KEY (content_root_id, content_root_grant_episode_id, content_root_binding_id, content_root_binding_episode_id, content_root_grant_episode_ordinal)
          REFERENCES content_root_grant_episode(content_root_id, id, binding_id, binding_episode_id, ordinal) ON DELETE RESTRICT,
        CHECK((attribution_type = 'recorded' AND attribution_member_id IS NULL)
          OR (attribution_type = 'lineage_correction' AND attribution_member_id IS NOT NULL)),
        CHECK(disposition_version >= 0 AND lineage_version >= 0 AND source_version >= 0
          AND content_root_binding_episode_ordinal >= 1 AND content_root_grant_episode_ordinal >= 1
          AND content_root_grant_version >= 1),
        CHECK(fingerprint_algorithm = 'sha256' AND length(fingerprint_digest) = 64
          AND fingerprint_digest NOT GLOB '*[^0-9a-f]*' AND byte_length > 0 AND length(media_type) > 0),
        CHECK(length(active_location) > 0 AND length(normalized_relative_path) > 0
          AND source_object_platform = 'windows_ntfs' AND source_object_verifier_version >= 1
          AND length(source_object_canonical_path) > 0 AND length(source_object_canonical_path_key) > 0
          AND source_object_canonical_path = active_location AND length(source_object_volume_serial) > 0
          AND length(source_object_id) = 32 AND length(source_object_creation_time) > 0
          AND length(source_object_change_time) > 0 AND length(source_object_last_write_time) > 0
          AND source_object_size = byte_length AND source_observed_time >= 0)
      )
    `),
    )
    yield* db.run(
      sql.raw(`
      INSERT INTO __gate16_material_map_artifact_target (
        map_id, artifact_id, artifact_revision_id, attribution_type, attribution_member_id,
        disposition_version, lineage_version, source_version, artifact_binding_id, active_location,
        descriptor_observation_id, descriptor_correction_id, fingerprint_algorithm, fingerprint_digest,
        byte_length, media_type, content_root_id, content_root_binding_id,
        content_root_binding_episode_id, content_root_binding_episode_ordinal,
        content_root_grant_episode_id, content_root_grant_episode_ordinal, content_root_grant_version,
        normalized_relative_path, source_object_platform, source_object_verifier_version,
        source_object_canonical_path, source_object_canonical_path_key, source_object_volume_serial,
        source_object_id, source_object_creation_time, source_object_change_time,
        source_object_last_write_time, source_object_size, source_observed_time
      )
      SELECT
        map_id, artifact_id, artifact_revision_id, attribution_type, attribution_member_id,
        disposition_version, lineage_version, source_version, artifact_binding_id, active_location,
        descriptor_observation_id, descriptor_correction_id, fingerprint_algorithm, fingerprint_digest,
        byte_length, media_type, content_root_id, content_root_binding_id,
        content_root_binding_episode_id, content_root_binding_episode_ordinal,
        content_root_grant_episode_id, content_root_grant_episode_ordinal, content_root_grant_version,
        normalized_relative_path, source_object_platform, source_object_verifier_version,
        source_object_canonical_path, source_object_canonical_path_key, source_object_volume_serial,
        source_object_id, source_object_creation_time, source_object_change_time,
        source_object_last_write_time, source_object_size, source_observed_time
      FROM material_map_artifact_target
    `),
    )
    yield* db.run(sql`DROP TABLE material_map_artifact_target`)
    yield* db.run(sql`ALTER TABLE __gate16_material_map_artifact_target RENAME TO material_map_artifact_target`)
    yield* db.run(
      sql`CREATE INDEX material_map_artifact_target_idx ON material_map_artifact_target (artifact_id, artifact_revision_id, attribution_type, attribution_member_id, map_id)`,
    )
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 16}`)
    yield* db.run(sql.raw("PRAGMA foreign_keys = ON"))
  })
}

function dropGate16(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* dropGate17(db)
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 15}`)
    yield* removeMessageDiffProjection(db)
    yield* db.run(sql.raw("PRAGMA foreign_keys = OFF"))
    yield* db.run(sql`DROP VIEW IF EXISTS learning_command_invocation_constraint_v12`)
    yield* db.run(sql`DROP VIEW IF EXISTS learning_command_receipt_constraint_v12`)
    const triggers = yield* db.all<{ name: string }>(sql`
      SELECT name FROM sqlite_master WHERE type = 'trigger'
    `)
    yield* Effect.forEach(triggers, (trigger) => db.run(sql`DROP TRIGGER ${sql.identifier(trigger.name)}`), {
      discard: true,
    })
    yield* restoreV12DefaultCourseTransition(db)
    for (const table of [
      "learner_goal_capability_settlement_v2",
      "learner_goal_capability_issue_v2",
      "learner_goal_disposition_v2",
      "learner_default_course_acknowledgement",
      "learner_default_course_capability_settlement",
      "learner_default_course_capability_issue",
      "learner_default_course_disposition",
      "learner_default_course_proposal",
    ]) {
      yield* db.run(sql`DROP TABLE IF EXISTS ${sql.identifier(table)}`)
    }
    for (const table of [
      "course_selection_acceptance_commit_seal",
      "representation_command_commit_seal",
      "learner_default_course_commit_seal",
      "learner_course_route_anchor_commit_seal",
      "learner_default_course_command",
      "retained_steering_command",
      "learner_goal_command",
      "learner_goal_state_guard",
      "learner_goal_commit_seal",
      "learner_goal_effect_operation",
      "learner_goal_supersession",
      "learner_goal_field_basis",
      "learner_goal_course_scope",
      "learner_goal_condition",
      "learner_goal_revision",
      "learner_goal_time_zone",
      "learner_goal_time_zone_release",
      "learner_goal_effect",
      "learner_goal",
      "learner_goal_state",
      "course_state_history",
    ]) {
      yield* db.run(sql`DROP TABLE IF EXISTS ${sql.identifier(table)}`)
    }
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 12}`)
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 11}`)
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 10}`)
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 13}`)
    yield* db.run(sql.raw("PRAGMA foreign_keys = ON"))
  })
}

function restoreGate8LearningSchema(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* Effect.forEach(learningCommandTables, (name) => db.run(sql`DROP TABLE IF EXISTS ${sql.identifier(name)}`), {
      discard: true,
    })
    yield* Effect.forEach(representationTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
      discard: true,
    })
    yield* db.transaction((tx) => learningCommandSettlementMigration.up(tx))
  })
}

function removeGate13(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* removeGate14(db)
    yield* Effect.forEach(materialTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
      discard: true,
    })
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 7}`)
  })
}

function removeGate14(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* removeGate15(db)
    yield* db.run(sql.raw("PRAGMA foreign_keys = OFF"))
    yield* db.run(sql`DROP TABLE learning_command_receipt`)
    yield* db.run(sql`DROP TABLE learning_command_invocation`)
    yield* db.run(sql`DROP TABLE learner_default_course_transition`)
    yield* db.run(sql`DROP TABLE learner_course_route_anchor_transition`)
    yield* db.run(
      sql.raw(`
      CREATE TABLE learning_command_invocation (
        part_id text PRIMARY KEY, session_id text NOT NULL, parent_user_message_id text NOT NULL,
        assistant_message_id text NOT NULL, provider_call_id text NOT NULL, occurrence_id text NOT NULL,
        command_name text NOT NULL, command_version integer NOT NULL, emission_ordinal integer NOT NULL,
        capability_identity text NOT NULL, capability_version integer NOT NULL, authorization_basis text NOT NULL,
        input_fingerprint text NOT NULL, status text NOT NULL, effect_id text, representation_effect_id text,
        settlement text, time_admitted integer NOT NULL, time_settled integer, settlement_order integer,
        turn_id text, input_id text,
        FOREIGN KEY (occurrence_id) REFERENCES learning_admitted_occurrence(id) ON DELETE RESTRICT,
        FOREIGN KEY (effect_id) REFERENCES course_selection_acceptance_effect(id) ON DELETE RESTRICT,
        FOREIGN KEY (representation_effect_id) REFERENCES representation_effect(id) ON DELETE RESTRICT,
        UNIQUE(assistant_message_id, provider_call_id), UNIQUE(assistant_message_id, emission_ordinal),
        CHECK(length(provider_call_id) > 0),
        CHECK(command_name IN ('accept_course_view_revision', 'representation.convert')),
        CHECK(command_version = 1), CHECK(emission_ordinal >= 0), CHECK(length(capability_identity) > 0),
        CHECK(capability_version >= 1),
        CHECK((command_name = 'accept_course_view_revision' AND capability_identity = 'accept_course_view_revision' AND capability_version = 1) OR (command_name = 'representation.convert' AND capability_identity = 'representation.convert' AND capability_version = 1)),
        CHECK(authorization_basis IN ('learner_request', 'learner_acceptance')),
        CHECK(length(input_fingerprint) = 64), CHECK(status IN ('admitted', 'applied', 'already_applied', 'error')),
        CHECK((status = 'admitted' AND settlement IS NULL AND time_settled IS NULL AND settlement_order IS NULL AND effect_id IS NULL AND representation_effect_id IS NULL) OR (status <> 'admitted' AND settlement IS NOT NULL AND time_settled IS NOT NULL AND settlement_order IS NOT NULL)),
        CHECK((status IN ('applied', 'already_applied') AND ((command_name = 'accept_course_view_revision' AND effect_id IS NOT NULL AND representation_effect_id IS NULL) OR (command_name = 'representation.convert' AND effect_id IS NULL AND representation_effect_id IS NOT NULL))) OR (status IN ('admitted', 'error') AND effect_id IS NULL AND representation_effect_id IS NULL)),
        CHECK(time_admitted >= 0 AND (time_settled IS NULL OR time_settled >= time_admitted) AND (settlement_order IS NULL OR settlement_order >= 0))
      )
    `),
    )
    yield* db.run(
      sql.raw(`
      CREATE TABLE learning_command_receipt (
        id text PRIMARY KEY, occurrence_id text NOT NULL, origin_session_id text NOT NULL,
        origin_message_id text NOT NULL, assistant_message_id text NOT NULL,
        invocation_part_id text NOT NULL UNIQUE, capability_identity text NOT NULL,
        capability_version integer NOT NULL, authorization_basis text NOT NULL,
        effect_id text UNIQUE, representation_effect_id text UNIQUE,
        time_committed integer NOT NULL, commit_order integer NOT NULL,
        FOREIGN KEY (occurrence_id) REFERENCES learning_admitted_occurrence(id) ON DELETE RESTRICT,
        FOREIGN KEY (invocation_part_id) REFERENCES learning_command_invocation(part_id) ON DELETE RESTRICT,
        FOREIGN KEY (effect_id) REFERENCES course_selection_acceptance_effect(id) ON DELETE RESTRICT,
        FOREIGN KEY (representation_effect_id) REFERENCES representation_effect(id) ON DELETE RESTRICT,
        CHECK(length(capability_identity) > 0), CHECK(capability_version >= 1),
        CHECK(authorization_basis IN ('learner_request', 'learner_acceptance')),
        CHECK((capability_identity = 'accept_course_view_revision' AND capability_version = 1 AND effect_id IS NOT NULL AND representation_effect_id IS NULL) OR (capability_identity = 'representation.convert' AND capability_version = 1 AND effect_id IS NULL AND representation_effect_id IS NOT NULL)),
        CHECK(time_committed >= 0 AND commit_order >= 0)
      )
    `),
    )
    yield* db.run(
      sql`CREATE UNIQUE INDEX learning_command_invocation_one_mutation_idx ON learning_command_invocation (assistant_message_id) WHERE status = 'applied'`,
    )
    yield* db.run(
      sql`CREATE INDEX learning_command_invocation_session_owner_idx ON learning_command_invocation (session_id, assistant_message_id, part_id)`,
    )
    yield* db.run(
      sql`CREATE INDEX learning_command_invocation_occurrence_idx ON learning_command_invocation (occurrence_id, part_id)`,
    )
    yield* db.run(
      sql`CREATE INDEX learning_command_invocation_admitted_idx ON learning_command_invocation (status, session_id, time_admitted)`,
    )
    yield* db.run(
      sql`CREATE INDEX learning_command_receipt_occurrence_idx ON learning_command_receipt (occurrence_id, id)`,
    )
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 8}`)
    yield* db.run(sql.raw("PRAGMA foreign_keys = ON"))
  })
}

function removeGate15(db: TestDatabase) {
  return Effect.gen(function* () {
    yield* dropGate16(db)
    yield* db.run(sql.raw("PRAGMA foreign_keys = OFF"))
    const triggers = yield* db.all<{ name: string }>(sql`
      SELECT name FROM sqlite_master
      WHERE type = 'trigger'
        AND (
          name LIKE 'retained_steering_%'
          OR name LIKE 'turn_model_retained_steering_%'
          OR name LIKE 'learning_occurrence_gate15_%'
          OR name LIKE 'learning_occurrence_source_order_%'
          OR sql LIKE '%learning_admitted_occurrence%'
          OR sql LIKE '%turn_model_operation%'
        )
    `)
    yield* Effect.forEach(triggers, (trigger) => db.run(sql`DROP TRIGGER ${sql.identifier(trigger.name)}`), {
      discard: true,
    })
    yield* db.run(sql`DROP TABLE IF EXISTS retained_steering_transition`)
    yield* db.run(sql`DROP TABLE IF EXISTS retained_steering_commit_seal`)
    yield* db.run(sql`DROP TABLE IF EXISTS retained_steering_policy`)
    yield* db.run(sql`DROP TABLE IF EXISTS retained_steering_state`)
    yield* db.run(sql`DROP TABLE IF EXISTS learning_occurrence_source_order`)
    yield* db.run(
      sql.raw(`
      CREATE TABLE __gate14_learning_admitted_occurrence (
        id text PRIMARY KEY,
        origin_session_id text NOT NULL,
        origin_message_id text NOT NULL,
        time_admitted integer NOT NULL,
        UNIQUE(origin_session_id, origin_message_id),
        CHECK(time_admitted >= 0)
      )
    `),
    )
    yield* db.run(
      sql.raw(`
      INSERT INTO __gate14_learning_admitted_occurrence (id, origin_session_id, origin_message_id, time_admitted)
      SELECT id, origin_session_id, origin_message_id, time_admitted FROM learning_admitted_occurrence
    `),
    )
    yield* db.run(sql`DROP TABLE learning_admitted_occurrence`)
    yield* db.run(sql`ALTER TABLE __gate14_learning_admitted_occurrence RENAME TO learning_admitted_occurrence`)
    yield* db.run(
      sql.raw(`
      CREATE TABLE __gate14_turn_model_operation (
        assistant_message_id text PRIMARY KEY,
        turn_id text NOT NULL,
        session_id text NOT NULL,
        input_id text NOT NULL,
        causal_occurrence_id text,
        ordinal integer NOT NULL,
        state text DEFAULT 'running' NOT NULL,
        request_fingerprint text NOT NULL,
        context_fingerprint text NOT NULL,
        snapshot_frontier_sequence integer NOT NULL,
        snapshot_frontier_time integer NOT NULL,
        observed_shared_frontier_sequence integer NOT NULL,
        observed_shared_frontier_time integer NOT NULL,
        time_admitted integer NOT NULL,
        time_settled integer,
        candidates_sealed integer DEFAULT false NOT NULL,
        candidate_count integer,
        time_candidates_sealed integer,
        FOREIGN KEY (turn_id) REFERENCES turn(id) ON DELETE CASCADE,
        FOREIGN KEY (causal_occurrence_id) REFERENCES learning_admitted_occurrence(id) ON DELETE RESTRICT,
        FOREIGN KEY (turn_id, session_id) REFERENCES turn(id, session_id) ON DELETE CASCADE,
        FOREIGN KEY (turn_id, input_id) REFERENCES turn_input(turn_id, id) ON DELETE RESTRICT,
        UNIQUE(turn_id, assistant_message_id),
        UNIQUE(turn_id, assistant_message_id, session_id),
        CHECK(ordinal >= 0),
        CHECK(length(request_fingerprint) = 64 AND length(context_fingerprint) = 64),
        CHECK(snapshot_frontier_sequence >= 0 AND observed_shared_frontier_sequence >= snapshot_frontier_sequence AND snapshot_frontier_time >= 0 AND observed_shared_frontier_time >= snapshot_frontier_time AND time_admitted >= snapshot_frontier_time AND time_admitted >= observed_shared_frontier_time),
        CHECK((state = 'running' AND time_settled IS NULL) OR (state IN ('completed', 'failed', 'interrupted') AND time_settled IS NOT NULL AND time_settled >= time_admitted)),
        CHECK((candidates_sealed = 0 AND candidate_count IS NULL AND time_candidates_sealed IS NULL) OR (candidates_sealed = 1 AND candidate_count IS NOT NULL AND candidate_count >= 0 AND time_candidates_sealed IS NOT NULL AND time_candidates_sealed >= time_admitted))
      )
    `),
    )
    yield* db.run(
      sql.raw(`
      INSERT INTO __gate14_turn_model_operation (
        assistant_message_id, turn_id, session_id, input_id, causal_occurrence_id, ordinal, state,
        request_fingerprint, context_fingerprint, snapshot_frontier_sequence, snapshot_frontier_time,
        observed_shared_frontier_sequence, observed_shared_frontier_time, time_admitted, time_settled,
        candidates_sealed, candidate_count, time_candidates_sealed
      ) SELECT
        assistant_message_id, turn_id, session_id, input_id, causal_occurrence_id, ordinal, state,
        request_fingerprint, context_fingerprint, snapshot_frontier_sequence, snapshot_frontier_time,
        observed_shared_frontier_sequence, observed_shared_frontier_time, time_admitted, time_settled,
        candidates_sealed, candidate_count, time_candidates_sealed
      FROM turn_model_operation
    `),
    )
    yield* db.run(sql`DROP TABLE turn_model_operation`)
    yield* db.run(sql`ALTER TABLE __gate14_turn_model_operation RENAME TO turn_model_operation`)
    yield* db.run(sql`CREATE UNIQUE INDEX turn_model_turn_ordinal_idx ON turn_model_operation (turn_id, ordinal)`)
    yield* db.run(sql`DROP TABLE learning_command_receipt`)
    yield* db.run(sql`DROP TABLE learning_command_invocation`)
    yield* db.run(
      sql.raw(`
      CREATE TABLE learning_command_invocation (
        part_id text PRIMARY KEY,
        session_id text NOT NULL,
        parent_user_message_id text NOT NULL,
        assistant_message_id text NOT NULL,
        provider_call_id text NOT NULL,
        occurrence_id text NOT NULL,
        command_name text NOT NULL,
        command_version integer NOT NULL,
        emission_ordinal integer NOT NULL,
        capability_identity text NOT NULL,
        capability_version integer NOT NULL,
        authorization_basis text NOT NULL,
        input_fingerprint text NOT NULL,
        status text NOT NULL,
        effect_id text,
        representation_effect_id text,
        default_navigation_effect_id text,
        anchor_navigation_effect_id text,
        permission_request_id text,
        settlement text,
        time_admitted integer NOT NULL,
        time_settled integer,
        settlement_order integer,
        turn_id text,
        input_id text,
        FOREIGN KEY (occurrence_id) REFERENCES learning_admitted_occurrence(id) ON DELETE RESTRICT,
        FOREIGN KEY (effect_id) REFERENCES course_selection_acceptance_effect(id) ON DELETE RESTRICT,
        FOREIGN KEY (representation_effect_id) REFERENCES representation_effect(id) ON DELETE RESTRICT,
        FOREIGN KEY (default_navigation_effect_id) REFERENCES learner_default_course_transition(id) ON DELETE RESTRICT,
        FOREIGN KEY (anchor_navigation_effect_id) REFERENCES learner_course_route_anchor_transition(id) ON DELETE RESTRICT,
        UNIQUE(assistant_message_id, provider_call_id),
        UNIQUE(assistant_message_id, emission_ordinal),
        CHECK(command_name IN ('accept_course_view_revision', 'representation.convert', 'set_default_course_preference', 'set_course_route_anchor')),
        CHECK(command_version = 1),
        CHECK(status IN ('admitted', 'applied', 'already_applied', 'no_change', 'error'))
      )
    `),
    )
    yield* db.run(
      sql.raw(`
      CREATE TABLE learning_command_receipt (
        id text PRIMARY KEY,
        occurrence_id text NOT NULL,
        origin_session_id text NOT NULL,
        origin_message_id text NOT NULL,
        assistant_message_id text NOT NULL,
        invocation_part_id text NOT NULL UNIQUE,
        capability_identity text NOT NULL,
        capability_version integer NOT NULL,
        authorization_basis text NOT NULL,
        effect_id text UNIQUE,
        representation_effect_id text UNIQUE,
        default_navigation_effect_id text UNIQUE,
        anchor_navigation_effect_id text UNIQUE,
        permission_request_id text,
        confirmation_snapshot text,
        time_committed integer NOT NULL,
        commit_order integer NOT NULL,
        FOREIGN KEY (occurrence_id) REFERENCES learning_admitted_occurrence(id) ON DELETE RESTRICT,
        FOREIGN KEY (invocation_part_id) REFERENCES learning_command_invocation(part_id) ON DELETE RESTRICT,
        FOREIGN KEY (effect_id) REFERENCES course_selection_acceptance_effect(id) ON DELETE RESTRICT,
        FOREIGN KEY (representation_effect_id) REFERENCES representation_effect(id) ON DELETE RESTRICT,
        FOREIGN KEY (default_navigation_effect_id) REFERENCES learner_default_course_transition(id) ON DELETE RESTRICT,
        FOREIGN KEY (anchor_navigation_effect_id) REFERENCES learner_course_route_anchor_transition(id) ON DELETE RESTRICT
      ) WITHOUT ROWID
    `),
    )
    yield* db.run(
      sql`CREATE UNIQUE INDEX learning_command_invocation_one_mutation_idx ON learning_command_invocation (assistant_message_id) WHERE status = 'applied'`,
    )
    yield* db.run(
      sql`CREATE INDEX learning_command_invocation_session_owner_idx ON learning_command_invocation (session_id, assistant_message_id, part_id)`,
    )
    yield* db.run(
      sql`CREATE INDEX learning_command_invocation_occurrence_idx ON learning_command_invocation (occurrence_id, part_id)`,
    )
    yield* db.run(
      sql`CREATE INDEX learning_command_invocation_admitted_idx ON learning_command_invocation (status, session_id, time_admitted)`,
    )
    yield* db.run(
      sql`CREATE INDEX learning_command_receipt_occurrence_idx ON learning_command_receipt (occurrence_id, id)`,
    )
    yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 9}`)
    yield* db.run(sql.raw("PRAGMA foreign_keys = ON"))
  })
}

describe("DatabaseMigration", () => {
  test("serializes concurrent embedded initialization for one database path", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "embedded.sqlite")
    const layers = [Database.layerFromPath(filename), Database.layerFromPath(filename)]

    await Effect.runPromise(
      Effect.all(
        layers.map((layer) => Effect.scoped(Layer.build(layer))),
        { concurrency: "unbounded" },
      ),
    )
  })
  if (process.platform === "linux") {
    test("declared schema has no ungenerated migrations", async () => {
      const result = await $`bun ${fileURLToPath(new URL("../script/migration.ts", import.meta.url))} --check`
        .quiet()
        .nothrow()
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      expect(result.stdout.toString()).toContain("No schema changes, nothing to migrate")
    }, 30_000)
  }

  test("initializes the current native Repa schema", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)

        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'`)).toEqual({
          name: "session",
        })
        expect(
          yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_input'`),
        ).toEqual({ name: "session_input" })
        expect(
          yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_context_epoch'`),
        ).toEqual({ name: "session_context_epoch" })
        expect(
          yield* db.get(
            sql`SELECT name FROM pragma_table_info('session_context_epoch') WHERE name IN ('agent', 'replacement_seq', 'revision')`,
          ),
        ).toBeUndefined()
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA application_id"))).toEqual({
          application_id: APPLICATION_ID,
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })
        expect(yield* db.all(sql`SELECT version, id FROM repa_migration ORDER BY version`)).toEqual([
          { version: BASELINE_VERSION, id: BASELINE_ID },
          { version: BASELINE_VERSION + 1, id: courseViewAuthorityMigration.id },
          { version: BASELINE_VERSION + 2, id: learningCommandSettlementMigration.id },
          { version: BASELINE_VERSION + 3, id: sourceArtifactAuthorityMigration.id },
          { version: BASELINE_VERSION + 4, id: contentRootAuthorityMigration.id },
          { version: BASELINE_VERSION + 5, id: readableRepresentationLineageMigration.id },
          { version: BASELINE_VERSION + 6, id: durableTurnMigration.id },
          { version: BASELINE_VERSION + 7, id: materialMapAlignmentMigration.id },
          { version: BASELINE_VERSION + 8, id: learnerNavigationMigration.id },
          { version: BASELINE_VERSION + 9, id: retainedSteeringMigration.id },
          { version: BASELINE_VERSION + 10, id: learnerGoalsMigration.id },
          { version: BASELINE_VERSION + 11, id: domainNeutralLearningCommandLedgerMigration.id },
          { version: BASELINE_VERSION + 12, id: defaultCourseV2Migration.id },
          { version: BASELINE_VERSION + 13, id: agentNativeDefaultCourseMigration.id },
          { version: BASELINE_VERSION + 14, id: messageDiffProjectionMigration.id },
          { version: BASELINE_VERSION + 15, id: agentNativeLearnerGoalsMigration.id },
          { version: BASELINE_VERSION + 16, id: learningBootstrapMigration.id },
        ])
        expect(
          yield* db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'course%' ORDER BY name`),
        ).toHaveLength(14)
        expect(
          yield* db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'artifact%' ORDER BY name`,
          ),
        ).toHaveLength(8)
        expect(
          yield* db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'content_root%' OR name = 'content_mutation_grant') ORDER BY name`,
          ),
        ).toHaveLength(6)
        expect(
          yield* db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'representation%' ORDER BY name`,
          ),
        ).toHaveLength(6)
        expect(
          yield* db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('event_aggregate_seq_idx', 'event_aggregate_type_seq_idx', 'session_input_session_pending_seq_idx', 'session_input_session_pending_delivery_seq_idx', 'session_input_session_admitted_seq_idx', 'session_input_session_promoted_seq_idx', 'session_message_session_idx', 'session_message_session_type_idx', 'session_message_session_seq_idx', 'session_message_session_type_seq_idx', 'session_message_session_time_created_id_idx') ORDER BY name`,
          ),
        ).toEqual([
          { name: "event_aggregate_seq_idx" },
          { name: "event_aggregate_type_seq_idx" },
          { name: "session_input_session_admitted_seq_idx" },
          { name: "session_input_session_pending_delivery_seq_idx" },
          { name: "session_input_session_promoted_seq_idx" },
          { name: "session_message_session_seq_idx" },
          { name: "session_message_session_time_created_id_idx" },
          { name: "session_message_session_type_seq_idx" },
        ])
      }),
    )
  })

  test("adds the per-message diff projection and backfills historical User summaries", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.transaction((tx) => databaseV13Schema.up(tx))
        yield* db.transaction((tx) => installSchemaExtrasV13(tx))
        yield* db.run("PRAGMA foreign_keys = OFF")
        yield* db.transaction((tx) => agentNativeDefaultCourseMigration.up(tx))
        yield* db.run("PRAGMA foreign_keys = ON")

        const sessionID = SessionSchema.ID.make("ses_gate08_message_diff_upgrade")
        const messageID = SessionV1.MessageID.ascending("msg_gate08_message_diff_upgrade")
        const diffs = [
          {
            file: "lesson.ts",
            patch: "@@ -0,0 +1 @@\n+practice\n",
            additions: 1,
            deletions: 0,
            status: "added" as const,
          },
        ]
        yield* db
          .insert(ProjectTable)
          .values({
            id: ProjectV2.ID.make("project_gate08_message_diff_upgrade"),
            worktree: AbsolutePath.make("C:\\gate08-message-diff"),
            sandboxes: [],
            time_created: 0,
            time_updated: 0,
          })
          .run()
        yield* db
          .insert(SessionTable)
          .values({
            id: sessionID,
            project_id: ProjectV2.ID.make("project_gate08_message_diff_upgrade"),
            slug: sessionID,
            directory: "C:\\gate08-message-diff",
            title: "Gate 8 message diff upgrade",
            version: "test",
            time_created: 0,
            time_updated: 0,
          })
          .run()
        yield* db.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data)
          VALUES (
            ${messageID},
            ${sessionID},
            0,
            0,
            ${JSON.stringify({
              role: "user",
              time: { created: 0 },
              agent: "repa",
              model: { providerID: "test", modelID: "test" },
              summary: { additions: 1, deletions: 0, files: 1, diffs },
            })}
          )
        `)

        yield* db.transaction((tx) => messageDiffProjectionMigration.up(tx))
        return {
          columns: yield* db.all<{ name: string }>(sql`PRAGMA table_info('message')`),
          row: yield* db
            .select({ diffs: MessageTable.summary_diffs, data: MessageTable.data })
            .from(MessageTable)
            .where(eq(MessageTable.id, messageID))
            .get(),
        }
      }),
    )

    expect(result.columns.some((column) => column.name === "summary_diffs")).toBe(true)
    if (!result.row || result.row.data.role !== "user") throw new Error("Expected migrated User Message")
    const summary = result.row.data.summary
    if (!summary || typeof summary !== "object") throw new Error("Expected migrated legacy summary")
    if (!result.row.diffs) throw new Error("Expected migrated per-message diff projection")
    expect(result.row.diffs).toEqual([
      {
        file: "lesson.ts",
        patch: "@@ -0,0 +1 @@\n+practice\n",
        additions: 1,
        deletions: 0,
        status: "added",
      },
    ])
    expect(summary.diffs).toEqual(result.row.diffs)
  })

  test("rejects mixed or incomplete Agent-native Default-Course disposition shapes", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(sql`
          INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
          VALUES ('project_v14_shape', '/learning', 0, 0, '[]')
        `)
        const provenance = (index: number, override: Readonly<Record<string, unknown>> = {}) => ({
          schemaVersion: 1,
          kind: "root",
          occurrenceID: `occ_v14_shape_${index}`,
          causalRootOccurrenceID: `occ_v14_shape_${index}`,
          sessionID: `ses_v14_shape_${index}`,
          turnID: `trn_v14_shape_${index}`,
          inputID: `inp_v14_shape_${index}`,
          assistantMessageID: `msg_v14_shape_assistant_${index}`,
          invocationPartID: `prt_v14_shape_${index}`,
          providerCallID: `call_v14_shape_${index}`,
          emissionOrdinal: 0,
          capabilityIdentity: "set_default_course_preference",
          capabilityVersion: 3,
          lineage: [],
          ...override,
        })
        const delegated = (
          index: number,
          override: Readonly<Record<string, unknown>> = {},
          edgeOverride: Readonly<Record<string, unknown>> = {},
        ) => {
          const root = provenance(index)
          const fingerprint = "d".repeat(64)
          const edge = {
            childTurnID: root.turnID,
            childSessionID: root.sessionID,
            childDepth: 1,
            parentTurnID: `trn_v14_shape_parent_${index}`,
            parentSessionID: `ses_v14_shape_parent_${index}`,
            parentDepth: 0,
            parentTaskPartID: `prt_v14_shape_parent_${index}`,
            parentModelMessageID: `msg_v14_shape_parent_${index}`,
            delegatedCapability: {
              version: 2,
              parent: [],
              inherited: [],
              profile: [],
              explicit: [
                {
                  permission: "set_default_course_preference",
                  pattern: "*",
                  action: "allow",
                },
              ],
            },
            delegatedCapabilityFingerprint: fingerprint,
            ...edgeOverride,
          }
          return {
            ...root,
            kind: "delegated",
            lineage: [edge],
            effectiveDelegatedCapability: {
              identity: "set_default_course_preference",
              version: 3,
              projectionVersion: 2,
              fingerprint,
            },
            ...override,
          }
        }
        const insert = (
          index: number,
          input: Readonly<{
            provenance: unknown
            operation: string
            command?: unknown
            from?: unknown
            to?: unknown
            course?: Readonly<{
              id: string
              title: string
              workingSelection?:
                | Readonly<{ kind: "absent" }>
                | Readonly<{
                    kind: "recorded"
                    revisionID: string
                    selectionVersion: number
                    viewID: string
                    viewName: string
                    viewVersion: number
                    revisionVersion: number
                  }>
            }>
          }>,
        ) =>
          Effect.gen(function* () {
            yield* db.run(sql`
              INSERT INTO session (
                id, project_id, slug, directory, title, version, time_created, time_updated
              ) VALUES (
                ${`ses_v14_shape_${index}`}, 'project_v14_shape', ${`shape-${index}`},
                '/learning', 'V14 shape fixture', 'test', ${index}, ${index}
              )
            `)
            yield* db.run(sql`
              INSERT INTO message (id, session_id, time_created, time_updated, data)
              VALUES (
                ${`msg_v14_shape_user_${index}`}, ${`ses_v14_shape_${index}`},
                ${index}, ${index}, '{"role":"user"}'
              )
            `)
            yield* db.run(sql`
              INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
              VALUES (
                ${`prt_v14_shape_user_${index}`}, ${`msg_v14_shape_user_${index}`},
                ${`ses_v14_shape_${index}`}, ${index}, ${index},
                '{"type":"text","text":"V14 disposition shape fixture"}'
              )
            `)
            yield* db.run(sql`
              INSERT INTO learning_occurrence_source_order (
                occurrence_id, origin_session_id, origin_message_id, time_allocated,
                source_temporal_state, source_timezone, source_utc_offset_minutes
              ) VALUES (
                ${`occ_v14_shape_${index}`}, ${`ses_v14_shape_${index}`},
                ${`msg_v14_shape_user_${index}`}, ${index}, 'resolved', 'UTC', 0
              )
            `)
            yield* db.run(sql`
              INSERT INTO learning_admitted_occurrence (
                id, origin_session_id, origin_message_id, time_admitted, source_order,
                source_temporal_state, source_timezone, source_utc_offset_minutes
              ) VALUES (
                ${`occ_v14_shape_${index}`},
                ${`ses_v14_shape_${index}`},
                ${`msg_v14_shape_user_${index}`},
                ${index},
                (
                  SELECT sequence FROM learning_occurrence_source_order
                  WHERE occurrence_id = ${`occ_v14_shape_${index}`}
                ),
                'resolved', 'UTC', 0
              )
            `)
            yield* db.run(sql`
              INSERT INTO learning_command_invocation (
                part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
                occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
                capability_version, authorization_basis, input_fingerprint, status, time_admitted,
                turn_id, input_id
              ) VALUES (
                ${`prt_v14_shape_${index}`},
                ${`ses_v14_shape_${index}`},
                ${`msg_v14_shape_user_${index}`},
                ${`msg_v14_shape_assistant_${index}`},
                ${`call_v14_shape_${index}`},
                ${`occ_v14_shape_${index}`},
                'set_default_course_preference', 3, 0, 'set_default_course_preference',
                3, 'agent_action', ${String(index % 10).repeat(64)}, 'admitted', ${index},
                ${`trn_v14_shape_${index}`}, ${`inp_v14_shape_${index}`}
              )
            `)
            if (input.course) {
              yield* db.run(sql`
                INSERT INTO course (id, title, state_version, time_created, time_updated)
                VALUES (${input.course.id}, ${input.course.title}, 0, ${index}, ${index})
              `)
              if (input.course.workingSelection?.kind === "absent") {
                yield* db.run(sql`
                  INSERT INTO course_working_selection (course_id, revision_id, version, time_updated)
                  VALUES (${input.course.id}, NULL, 0, ${index})
                `)
              }
              if (input.course.workingSelection?.kind === "recorded") {
                yield* db.run(sql`
                  INSERT INTO course_view (
                    id, course_id, name, state_version, time_created, time_updated
                  ) VALUES (
                    ${input.course.workingSelection.viewID}, ${input.course.id},
                    ${input.course.workingSelection.viewName},
                    ${input.course.workingSelection.viewVersion}, ${index}, ${index}
                  )
                `)
                yield* db.run(sql`
                  INSERT INTO course_view_revision (
                    id, course_id, view_id, revision_number, authorship_basis, time_created
                  ) VALUES (
                    ${input.course.workingSelection.revisionID}, ${input.course.id},
                    ${input.course.workingSelection.viewID}, 1, 'tutor_proposed', ${index}
                  )
                `)
                yield* db.run(sql`
                  INSERT INTO course_view_revision_state (
                    course_id, view_id, revision_id, state_version, time_updated
                  ) VALUES (
                    ${input.course.id}, ${input.course.workingSelection.viewID},
                    ${input.course.workingSelection.revisionID},
                    ${input.course.workingSelection.revisionVersion}, ${index}
                  )
                `)
                yield* db.run(sql`
                  INSERT INTO course_working_selection (course_id, revision_id, version, time_updated)
                  VALUES (
                    ${input.course.id}, ${input.course.workingSelection.revisionID},
                    ${input.course.workingSelection.selectionVersion}, ${index}
                  )
                `)
              }
            }
            return yield* db
              .run(
                sql`
                INSERT INTO learner_default_course_disposition (
                  invocation_part_id, disposition, agent_action_version, agent_action_fingerprint,
                  agent_action_provenance, command_fingerprint, command_snapshot, preference_version,
                  operation, from_locator, to_locator, time_disposed
                ) VALUES (
                  ${`prt_v14_shape_${index}`}, 'agent_action_v3', 3, ${"a".repeat(64)},
                  ${JSON.stringify(input.provenance)}, ${"b".repeat(64)},
                  ${JSON.stringify(input.command ?? { action: "clear" })}, 0,
                  ${input.operation}, ${JSON.stringify(input.from ?? { kind: "absent" })},
                  ${JSON.stringify(input.to ?? { kind: "absent" })}, ${index}
                )
              `,
              )
              .pipe(Effect.exit)
          })

        const valid = yield* insert(1, { provenance: provenance(1), operation: "change" })
        const unknownRootField = yield* insert(2, {
          provenance: provenance(2, { unexpected: "shadow" }),
          operation: "change",
        })
        const contradictoryOperation = yield* insert(3, {
          provenance: provenance(3),
          operation: "set",
        })
        const incompleteDelegated = yield* insert(4, {
          provenance: provenance(4, { kind: "delegated", lineage: [{}] }),
          operation: "change",
        })
        const validDelegated = yield* insert(5, {
          provenance: delegated(5),
          operation: "change",
        })
        const unknownDelegatedField = yield* insert(6, {
          provenance: delegated(6, {}, { unexpected: "shadow" }),
          operation: "change",
        })
        const malformedDelegatedRule = yield* insert(7, {
          provenance: delegated(
            7,
            {},
            {
              delegatedCapability: {
                version: 2,
                parent: [],
                inherited: [],
                profile: [],
                explicit: [
                  {
                    permission: "set_default_course_preference",
                    pattern: "*",
                    action: "allow",
                    unexpected: "shadow",
                  },
                ],
              },
            },
          ),
          operation: "change",
        })
        const mismatchedEffectiveFingerprint = yield* insert(8, {
          provenance: delegated(8, {
            effectiveDelegatedCapability: {
              identity: "set_default_course_preference",
              version: 3,
              projectionVersion: 2,
              fingerprint: "e".repeat(64),
            },
          }),
          operation: "change",
        })
        const validCourseID = "crs_00000000000000000000000009"
        const validCourseLocator = yield* insert(9, {
          provenance: provenance(9),
          operation: "set",
          command: { action: "set", courseID: validCourseID },
          course: { id: validCourseID, title: "Valid V14 locator", workingSelection: { kind: "absent" } },
          to: {
            kind: "course",
            locator: {
              courseID: validCourseID,
              title: { availability: "recorded_v2", value: "Valid V14 locator" },
              courseVersion: { availability: "recorded_v2", value: 0 },
              workingSelection: {
                availability: "recorded_v2",
                value: {
                  revisionID: null,
                  selectionVersion: 0,
                  viewID: null,
                  viewName: null,
                  viewVersion: null,
                  revisionVersion: null,
                },
              },
            },
          },
        })
        const unknownAbsentEndpoint = yield* insert(10, {
          provenance: provenance(10),
          operation: "change",
          from: { kind: "absent", unexpected: "accepted" },
        })
        const incompleteCourseID = "crs_00000000000000000000000011"
        const incompleteCourseEndpoint = yield* insert(11, {
          provenance: provenance(11),
          operation: "set",
          command: { action: "set", courseID: incompleteCourseID },
          course: { id: incompleteCourseID, title: "Incomplete V14 locator" },
          to: {
            kind: "course",
            unexpected: "accepted",
            locator: {
              courseID: incompleteCourseID,
              unexpected: "accepted",
              title: { availability: "recorded_v2", unexpected: "accepted" },
              courseVersion: { availability: "recorded_v2", unexpected: "accepted" },
              workingSelection: { availability: "recorded_v2", unexpected: "accepted" },
            },
          },
        })
        const recordedCourseID = "crs_00000000000000000000000012"
        const recordedSelection = {
          kind: "recorded" as const,
          revisionID: "cvr_00000000000000000000000012",
          selectionVersion: 1,
          viewID: "cvw_00000000000000000000000012",
          viewName: "Recorded V14 view",
          viewVersion: 0,
          revisionVersion: 0,
        }
        const recordedEndpoint = {
          kind: "course" as const,
          locator: {
            courseID: recordedCourseID,
            title: { availability: "recorded_v2" as const, value: "Recorded V14 locator" },
            courseVersion: { availability: "recorded_v2" as const, value: 0 },
            workingSelection: {
              availability: "recorded_v2" as const,
              value: {
                revisionID: recordedSelection.revisionID,
                selectionVersion: recordedSelection.selectionVersion,
                viewID: recordedSelection.viewID,
                viewName: recordedSelection.viewName,
                viewVersion: recordedSelection.viewVersion,
                revisionVersion: recordedSelection.revisionVersion,
              },
            },
          },
        }
        const validRecordedSelection = yield* insert(12, {
          provenance: provenance(12),
          operation: "set",
          command: { action: "set", courseID: recordedCourseID },
          course: {
            id: recordedCourseID,
            title: "Recorded V14 locator",
            workingSelection: recordedSelection,
          },
          to: recordedEndpoint,
        })
        const mixedMissingRevisionCourseID = "crs_00000000000000000000000013"
        const mixedMissingRevisionSelection = {
          ...recordedSelection,
          revisionID: "cvr_00000000000000000000000013",
          viewID: "cvw_00000000000000000000000013",
        }
        const mixedMissingRevision = yield* insert(13, {
          provenance: provenance(13),
          operation: "set",
          command: { action: "set", courseID: mixedMissingRevisionCourseID },
          course: {
            id: mixedMissingRevisionCourseID,
            title: "Mixed missing revision V14 locator",
            workingSelection: mixedMissingRevisionSelection,
          },
          to: {
            ...recordedEndpoint,
            locator: {
              ...recordedEndpoint.locator,
              courseID: mixedMissingRevisionCourseID,
              title: { availability: "recorded_v2", value: "Mixed missing revision V14 locator" },
              workingSelection: {
                availability: "recorded_v2",
                value: {
                  revisionID: null,
                  selectionVersion: mixedMissingRevisionSelection.selectionVersion,
                  viewID: mixedMissingRevisionSelection.viewID,
                  viewName: mixedMissingRevisionSelection.viewName,
                  viewVersion: mixedMissingRevisionSelection.viewVersion,
                  revisionVersion: mixedMissingRevisionSelection.revisionVersion,
                },
              },
            },
          },
        })
        const mixedMissingViewCourseID = "crs_00000000000000000000000014"
        const mixedMissingViewSelection = {
          ...recordedSelection,
          revisionID: "cvr_00000000000000000000000014",
          viewID: "cvw_00000000000000000000000014",
        }
        const mixedMissingView = yield* insert(14, {
          provenance: provenance(14),
          operation: "set",
          command: { action: "set", courseID: mixedMissingViewCourseID },
          course: {
            id: mixedMissingViewCourseID,
            title: "Mixed missing view V14 locator",
            workingSelection: mixedMissingViewSelection,
          },
          to: {
            ...recordedEndpoint,
            locator: {
              ...recordedEndpoint.locator,
              courseID: mixedMissingViewCourseID,
              title: { availability: "recorded_v2", value: "Mixed missing view V14 locator" },
              workingSelection: {
                availability: "recorded_v2",
                value: {
                  revisionID: mixedMissingViewSelection.revisionID,
                  selectionVersion: mixedMissingViewSelection.selectionVersion,
                  viewID: null,
                  viewName: null,
                  viewVersion: null,
                  revisionVersion: null,
                },
              },
            },
          },
        })
        return {
          valid,
          unknownRootField,
          contradictoryOperation,
          incompleteDelegated,
          validDelegated,
          unknownDelegatedField,
          malformedDelegatedRule,
          mismatchedEffectiveFingerprint,
          validCourseLocator,
          unknownAbsentEndpoint,
          incompleteCourseEndpoint,
          validRecordedSelection,
          mixedMissingRevision,
          mixedMissingView,
        }
      }),
    )

    expect(result.valid._tag).toBe("Success")
    expect(result.unknownRootField._tag).toBe("Failure")
    expect(result.contradictoryOperation._tag).toBe("Failure")
    expect(result.incompleteDelegated._tag).toBe("Failure")
    expect(result.validDelegated._tag).toBe("Success")
    expect(result.unknownDelegatedField._tag).toBe("Failure")
    expect(result.malformedDelegatedRule._tag).toBe("Failure")
    expect(result.mismatchedEffectiveFingerprint._tag).toBe("Failure")
    expect(result.validCourseLocator._tag).toBe("Success")
    expect(result.unknownAbsentEndpoint._tag).toBe("Failure")
    expect(result.incompleteCourseEndpoint._tag).toBe("Failure")
    expect(result.validRecordedSelection._tag).toBe("Success")
    expect(result.mixedMissingRevision._tag).toBe("Failure")
    expect(result.mixedMissingView._tag).toBe("Failure")
  })

  test("upgrades a frozen Gate 16 database to exact fresh Gate 17 parity without fabricating bootstrap state", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "frozen-gate16.db")
    const fresh = await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        return yield* completeSchemaManifest(db)
      }),
    )
    const upgraded = await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* initializeDatabaseV16(db)
        yield* seedFrozenV16MaterialMap(db)

        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION + databaseV16Migrations.length,
        })
        expect(
          yield* db.get(sql`
            SELECT name FROM sqlite_schema
            WHERE type = 'table' AND name = 'learning_bootstrap_effect'
          `),
        ).toBeUndefined()

        yield* DatabaseMigration.apply(db, { path: filename })

        return {
          manifest: yield* completeSchemaManifest(db),
          journal: yield* db.all(sql`SELECT version, id FROM repa_migration ORDER BY version DESC LIMIT 1`),
          target: yield* db.get(sql`
            SELECT authority_kind, content_root_id, normalized_relative_path,
              root_object_descriptor_state,
              root_object_platform, root_object_verifier_version, root_object_canonical_path,
              root_object_canonical_path_key, root_object_volume_serial, root_object_id,
              root_object_creation_time, root_object_change_time, root_object_last_write_time,
              root_object_size, source_object_size
            FROM material_map_artifact_target
            WHERE map_id = 'map_gate17_fixture'
          `),
          map: yield* db.get(sql`
            SELECT id, canonical_input FROM material_map WHERE id = 'map_gate17_fixture'
          `),
          bootstrapRows: yield* db.all(sql`SELECT id FROM learning_bootstrap_effect`),
          foreignKeys: yield* db.all(sql.raw("PRAGMA foreign_key_check")),
          anchorSeal: yield* db.get<{ definition: string }>(sql`
            SELECT sql AS definition FROM sqlite_schema
            WHERE type = 'trigger'
              AND name = 'learner_course_route_anchor_commit_seal_validate_insert_v17'
          `),
        }
      }),
      filename,
    )
    const runtime = ManagedRuntime.make(materialMapLayer(filename))
    const ownerMap = await runtime.runPromise(
      Effect.flatMap(MaterialMap.Service, (maps) => maps.getMap("map_gate17_fixture" as MaterialMap.MapID)),
    )
    await runtime.dispose()

    expect(upgraded.manifest).toEqual(fresh)
    expect(upgraded.journal).toEqual([
      { version: BASELINE_VERSION + databaseV16Migrations.length + 1, id: learningBootstrapMigration.id },
    ])
    expect(upgraded.target).toEqual({
      authority_kind: "content_root",
      content_root_id: "root_gate17_fixture",
      normalized_relative_path: "fixture.txt",
      root_object_descriptor_state: "historical_v16_partial",
      root_object_platform: "windows_ntfs",
      root_object_verifier_version: 1,
      root_object_canonical_path: "C:\\gate17",
      root_object_canonical_path_key: "c:\\gate17",
      root_object_volume_serial: "volume-gate17",
      root_object_id: "1".repeat(32),
      root_object_creation_time: "root-created",
      root_object_change_time: "root-changed",
      root_object_last_write_time: null,
      root_object_size: null,
      source_object_size: 4,
    })
    expect(ownerMap.target).toMatchObject({
      type: "artifact",
      authorization: {
        kind: "content_root_historical_v16",
        root: {
          schemaVersion: 1,
          completeness: "historical_v16_partial",
          known: {
            canonicalPath: "C:\\gate17",
            changeTime: "root-changed",
            kind: "directory",
          },
          unknown: ["lastWriteTime", "size"],
        },
      },
    })
    if (ownerMap.target.type !== "artifact" || ownerMap.target.authorization.kind !== "content_root_historical_v16") {
      throw new Error("Expected the frozen Gate 16 target to expose an explicit partial historical root")
    }
    expect("lastWriteTime" in ownerMap.target.authorization.root.known).toBeFalse()
    expect("size" in ownerMap.target.authorization.root.known).toBeFalse()
    expect(upgraded.map).toEqual({
      id: "map_gate17_fixture",
      canonical_input: JSON.stringify({ fixture: "frozen_gate16" }),
    })
    expect(upgraded.bootstrapRows).toEqual([])
    expect(upgraded.foreignKeys).toEqual([])
    expect(upgraded.anchorSeal?.definition).toContain("invocation.command_name = 'update_learning_course'")
    expect(upgraded.anchorSeal?.definition).toContain("learning_bootstrap_anchor_result")
  })

  test("upgrades the frozen v12 schema through v13 to exact current Default-Course structural parity", async () => {
    const tables = [
      "learner_default_course_acknowledgement",
      "learner_default_course_disposition",
      "learner_default_course_capability_issue",
      "learner_default_course_capability_settlement",
      "learner_default_course_proposal",
      "learner_default_course_transition",
    ]
    const definitions = (db: TestDatabase) =>
      db
        .all<{ name: string; definition: string }>(
          sql`
          SELECT name, sql AS definition
          FROM sqlite_schema
          WHERE type = 'table'
            AND name IN (${sql.join(
              tables.map((name) => sql`${name}`),
              sql`, `,
            )})
          ORDER BY name
        `,
        )
        .pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              name: row.name,
              definition: normalizeSchemaDefinition(row.definition),
            })),
          ),
        )
    const upgraded = await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.transaction((tx) => databaseV12Schema.up(tx))
        yield* db.transaction((tx) => installSchemaExtrasV12(tx))
        const route = yield* routeOwnedManifest(db)
        yield* db.run("PRAGMA foreign_keys = OFF")
        yield* db.transaction((tx) => defaultCourseV2Migration.up(tx))
        yield* db.transaction((tx) => agentNativeDefaultCourseMigration.up(tx))
        yield* db.transaction((tx) => messageDiffProjectionMigration.up(tx))
        yield* db.transaction((tx) => agentNativeLearnerGoalsMigration.up(tx))
        yield* db.transaction((tx) => learningBootstrapMigration.up(tx))
        yield* db.run("PRAGMA foreign_keys = ON")
        return {
          structures: yield* structuralManifest(db),
          definitions: yield* definitions(db),
          route,
          migratedRoute: yield* routeOwnedManifest(db),
          foreignKeys: yield* db.all(sql.raw("PRAGMA foreign_key_check")),
        }
      }),
    )
    const fresh = await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        return {
          structures: yield* structuralManifest(db),
          definitions: yield* definitions(db),
        }
      }),
    )
    expect(upgraded.structures).toEqual(fresh.structures)
    expect(upgraded.definitions).toEqual(fresh.definitions)
    const anchorSeal = (item: { name: string }) =>
      item.name === "learner_course_route_anchor_commit_seal_validate_insert_v12" ||
      item.name === "learner_course_route_anchor_commit_seal_validate_insert_v17"
    expect(upgraded.migratedRoute.filter((item) => !anchorSeal(item))).toEqual(
      upgraded.route.filter((item) => !anchorSeal(item)),
    )
    expect(upgraded.route.some((item) => item.name.endsWith("validate_insert_v12"))).toBe(true)
    expect(
      upgraded.migratedRoute.find((item) => item.name === "learner_course_route_anchor_commit_seal_validate_insert_v17")
        ?.definition,
    ).toContain("invocation.command_name = 'update_learning_course'")
    expect(upgraded.foreignKeys).toEqual([])
  })

  test("upgrades frozen v13 Default-Course rows without rewriting history or reopening proposal production", async () => {
    const preservedTables = [
      "learning_command_invocation",
      "learner_default_course_disposition",
      "learner_default_course_capability_settlement",
      "learner_default_course_proposal",
    ] as const
    const snapshot = (db: TestDatabase, columns?: ReadonlyMap<(typeof preservedTables)[number], readonly string[]>) =>
      Effect.forEach(preservedTables, (name) =>
        Effect.gen(function* () {
          const projection =
            columns?.get(name) ??
            (yield* db.all<{ name: string }>(sql`PRAGMA table_info(${sql.identifier(name)})`)).map(
              (column) => column.name,
            )
          const rows = yield* db.all<Record<string, unknown>>(
            sql`SELECT ${sql.join(
              projection.map((column) => sql.identifier(column)),
              sql`, `,
            )} FROM ${sql.identifier(name)}`,
          )
          return {
            name,
            columns: projection,
            rows: rows.toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
          }
        }),
      )

    const upgraded = await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.transaction((tx) => databaseV13Schema.up(tx))
        yield* db.run(sql`
          INSERT INTO learning_admitted_occurrence (
            id, origin_session_id, origin_message_id, time_admitted
          ) VALUES
            ('occ_v13_v1', 'ses_v13', 'msg_v13_v1', 1),
            ('occ_v13_v2', 'ses_v13', 'msg_v13_v2', 2)
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_invocation (
            part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
            occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
            capability_version, authorization_basis, input_fingerprint, status, time_admitted
          ) VALUES
            (
              'prt_v13_v1', 'ses_v13', 'msg_v13_v1', 'asst_v13_v1', 'call_v13_v1',
              'occ_v13_v1', 'set_default_course_preference', 1, 0, 'set_default_course_preference',
              1, 'learner_request', ${"1".repeat(64)}, 'admitted', 1
            ),
            (
              'prt_v13_v2', 'ses_v13', 'msg_v13_v2', 'asst_v13_v2', 'call_v13_v2',
              'occ_v13_v2', 'set_default_course_preference', 2, 0, 'set_default_course_preference',
              2, 'learner_request', ${"2".repeat(64)}, 'admitted', 2
            )
        `)
        yield* db.run(sql`
          INSERT INTO learner_default_course_disposition (
            invocation_part_id, disposition, authorization_version, authorization_kind,
            authorization_fingerprint, command_fingerprint, legacy_row_class,
            confirmation_availability, command_permission_request_id, time_disposed
          ) VALUES (
            'prt_v13_v1', 'legacy_v1', 1, 'legacy_v1',
            ${"3".repeat(64)}, ${"4".repeat(64)}, 'admitted',
            'not_recorded_v1', 'permission_v13_v1', 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO learner_default_course_disposition (
            invocation_part_id, disposition, authorization_version, authorization_kind,
            authorization_fingerprint, command_fingerprint, command_snapshot, source_excerpt,
            resolution_scope, resolution_fingerprint, preference_version, operation,
            from_locator, to_locator, time_disposed
          ) VALUES (
            'prt_v13_v2', 'candidate_v2', 2, 'direct_request_v2',
            ${"5".repeat(64)}, ${"6".repeat(64)},
            '{"kind":"default_course_preference","expectedHeadID":null,"expectedVersion":0,"target":null}',
            'clear it',
            '{"coverage":"complete"}', ${"7".repeat(64)}, 0, 'clear',
            '{"kind":"absent"}', '{"kind":"absent"}', 2
          )
        `)
        yield* db.run(sql`
          INSERT INTO learner_default_course_capability_settlement (
            invocation_part_id, outcome, authorization_fingerprint, policy_basis,
            policy_fingerprint, time_settled, settlement_order
          ) VALUES (
            'prt_v13_v2', 'policy_deny', ${"5".repeat(64)}, '{"decision":"deny"}',
            ${"8".repeat(64)}, 3, 3
          )
        `)
        yield* db.transaction((tx) => installSchemaExtrasV13(tx))
        const before = yield* snapshot(db)
        const columns = new Map(before.map((entry) => [entry.name, entry.columns] as const))

        yield* db.run("PRAGMA foreign_keys = OFF")
        yield* db.transaction((tx) => agentNativeDefaultCourseMigration.up(tx))
        yield* db.transaction((tx) => messageDiffProjectionMigration.up(tx))
        yield* db.transaction((tx) => agentNativeLearnerGoalsMigration.up(tx))
        yield* db.transaction((tx) => learningBootstrapMigration.up(tx))
        yield* db.run("PRAGMA foreign_keys = ON")

        const after = yield* snapshot(db, columns)
        const structures = yield* structuralManifest(db)
        const legacyAgentColumns = yield* db.all(sql`
          SELECT invocation_part_id, agent_action_version, agent_action_fingerprint
          FROM learner_default_course_disposition
          ORDER BY invocation_part_id
        `)
        const retiredProposal = yield* Effect.exit(
          db.run(sql`INSERT INTO learner_default_course_proposal (part_id) VALUES ('proposal_v14_forbidden')`),
        )
        yield* db.run(sql`
          INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
          VALUES ('project_v14_locator_upgrade', '/learning', 10, 10, '[]')
        `)
        yield* db.run(sql`
          INSERT INTO session (
            id, project_id, slug, directory, title, version, time_created, time_updated
          ) VALUES
            (
              'ses_v14_locator_upgrade_1', 'project_v14_locator_upgrade', 'locator-1',
              '/learning', 'V14 locator upgrade fixture', 'test', 10, 10
            ),
            (
              'ses_v14_locator_upgrade_2', 'project_v14_locator_upgrade', 'locator-2',
              '/learning', 'V14 locator upgrade fixture', 'test', 11, 11
            ),
            (
              'ses_v14_locator_upgrade_3', 'project_v14_locator_upgrade', 'locator-3',
              '/learning', 'V14 locator upgrade fixture', 'test', 12, 12
            ),
            (
              'ses_v14_locator_upgrade_4', 'project_v14_locator_upgrade', 'locator-4',
              '/learning', 'V14 locator upgrade fixture', 'test', 13, 13
            ),
            (
              'ses_v14_locator_upgrade_5', 'project_v14_locator_upgrade', 'locator-5',
              '/learning', 'V14 locator upgrade fixture', 'test', 14, 14
            )
        `)
        yield* db.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES
            (
              'msg_v14_locator_upgrade_user_1', 'ses_v14_locator_upgrade_1',
              10, 10, '{"role":"user"}'
            ),
            (
              'msg_v14_locator_upgrade_user_2', 'ses_v14_locator_upgrade_2',
              11, 11, '{"role":"user"}'
            ),
            (
              'msg_v14_locator_upgrade_user_3', 'ses_v14_locator_upgrade_3',
              12, 12, '{"role":"user"}'
            ),
            (
              'msg_v14_locator_upgrade_user_4', 'ses_v14_locator_upgrade_4',
              13, 13, '{"role":"user"}'
            ),
            (
              'msg_v14_locator_upgrade_user_5', 'ses_v14_locator_upgrade_5',
              14, 14, '{"role":"user"}'
            )
        `)
        yield* db.run(sql`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES
            (
              'prt_v14_locator_upgrade_1', 'msg_v14_locator_upgrade_user_1',
              'ses_v14_locator_upgrade_1', 10, 10,
              '{"type":"text","text":"V14 locator upgrade fixture"}'
            ),
            (
              'prt_v14_locator_upgrade_2', 'msg_v14_locator_upgrade_user_2',
              'ses_v14_locator_upgrade_2', 11, 11,
              '{"type":"text","text":"V14 locator upgrade fixture"}'
            ),
            (
              'prt_v14_locator_upgrade_3', 'msg_v14_locator_upgrade_user_3',
              'ses_v14_locator_upgrade_3', 12, 12,
              '{"type":"text","text":"V14 locator upgrade fixture"}'
            ),
            (
              'prt_v14_locator_upgrade_4', 'msg_v14_locator_upgrade_user_4',
              'ses_v14_locator_upgrade_4', 13, 13,
              '{"type":"text","text":"V14 locator upgrade fixture"}'
            ),
            (
              'prt_v14_locator_upgrade_5', 'msg_v14_locator_upgrade_user_5',
              'ses_v14_locator_upgrade_5', 14, 14,
              '{"type":"text","text":"V14 locator upgrade fixture"}'
            )
        `)
        yield* db.run(sql`
          INSERT INTO learning_occurrence_source_order (
            occurrence_id, origin_session_id, origin_message_id, time_allocated,
            source_temporal_state, source_timezone, source_utc_offset_minutes
          ) VALUES
            (
              'occ_v14_locator_upgrade_1', 'ses_v14_locator_upgrade_1',
              'msg_v14_locator_upgrade_user_1', 10, 'resolved', 'UTC', 0
            ),
            (
              'occ_v14_locator_upgrade_2', 'ses_v14_locator_upgrade_2',
              'msg_v14_locator_upgrade_user_2', 11, 'resolved', 'UTC', 0
            ),
            (
              'occ_v14_locator_upgrade_3', 'ses_v14_locator_upgrade_3',
              'msg_v14_locator_upgrade_user_3', 12, 'resolved', 'UTC', 0
            ),
            (
              'occ_v14_locator_upgrade_4', 'ses_v14_locator_upgrade_4',
              'msg_v14_locator_upgrade_user_4', 13, 'resolved', 'UTC', 0
            ),
            (
              'occ_v14_locator_upgrade_5', 'ses_v14_locator_upgrade_5',
              'msg_v14_locator_upgrade_user_5', 14, 'resolved', 'UTC', 0
            )
        `)
        yield* db.run(sql`
          INSERT INTO learning_admitted_occurrence (
            id, origin_session_id, origin_message_id, time_admitted, source_order,
            source_temporal_state, source_timezone, source_utc_offset_minutes
          ) VALUES
            (
              'occ_v14_locator_upgrade_1', 'ses_v14_locator_upgrade_1',
              'msg_v14_locator_upgrade_user_1', 10,
              (SELECT sequence FROM learning_occurrence_source_order WHERE occurrence_id = 'occ_v14_locator_upgrade_1'),
              'resolved', 'UTC', 0
            ),
            (
              'occ_v14_locator_upgrade_2', 'ses_v14_locator_upgrade_2',
              'msg_v14_locator_upgrade_user_2', 11,
              (SELECT sequence FROM learning_occurrence_source_order WHERE occurrence_id = 'occ_v14_locator_upgrade_2'),
              'resolved', 'UTC', 0
            ),
            (
              'occ_v14_locator_upgrade_3', 'ses_v14_locator_upgrade_3',
              'msg_v14_locator_upgrade_user_3', 12,
              (SELECT sequence FROM learning_occurrence_source_order WHERE occurrence_id = 'occ_v14_locator_upgrade_3'),
              'resolved', 'UTC', 0
            ),
            (
              'occ_v14_locator_upgrade_4', 'ses_v14_locator_upgrade_4',
              'msg_v14_locator_upgrade_user_4', 13,
              (SELECT sequence FROM learning_occurrence_source_order WHERE occurrence_id = 'occ_v14_locator_upgrade_4'),
              'resolved', 'UTC', 0
            ),
            (
              'occ_v14_locator_upgrade_5', 'ses_v14_locator_upgrade_5',
              'msg_v14_locator_upgrade_user_5', 14,
              (SELECT sequence FROM learning_occurrence_source_order WHERE occurrence_id = 'occ_v14_locator_upgrade_5'),
              'resolved', 'UTC', 0
            )
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_invocation (
            part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
            occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
            capability_version, authorization_basis, input_fingerprint, status, time_admitted,
            turn_id, input_id
          ) VALUES
            (
              'prt_v14_locator_upgrade_1', 'ses_v14_locator_upgrade_1',
              'msg_v14_locator_upgrade_user_1', 'msg_v14_locator_upgrade_assistant_1',
              'call_v14_locator_upgrade_1', 'occ_v14_locator_upgrade_1',
              'set_default_course_preference', 3, 0, 'set_default_course_preference', 3,
              'agent_action', ${"c".repeat(64)}, 'admitted', 10,
              'trn_v14_locator_upgrade_1', 'inp_v14_locator_upgrade_1'
            ),
            (
              'prt_v14_locator_upgrade_2', 'ses_v14_locator_upgrade_2',
              'msg_v14_locator_upgrade_user_2', 'msg_v14_locator_upgrade_assistant_2',
              'call_v14_locator_upgrade_2', 'occ_v14_locator_upgrade_2',
              'set_default_course_preference', 3, 0, 'set_default_course_preference', 3,
              'agent_action', ${"d".repeat(64)}, 'admitted', 11,
              'trn_v14_locator_upgrade_2', 'inp_v14_locator_upgrade_2'
            ),
            (
              'prt_v14_locator_upgrade_3', 'ses_v14_locator_upgrade_3',
              'msg_v14_locator_upgrade_user_3', 'msg_v14_locator_upgrade_assistant_3',
              'call_v14_locator_upgrade_3', 'occ_v14_locator_upgrade_3',
              'set_default_course_preference', 3, 0, 'set_default_course_preference', 3,
              'agent_action', ${"e".repeat(64)}, 'admitted', 12,
              'trn_v14_locator_upgrade_3', 'inp_v14_locator_upgrade_3'
            ),
            (
              'prt_v14_locator_upgrade_4', 'ses_v14_locator_upgrade_4',
              'msg_v14_locator_upgrade_user_4', 'msg_v14_locator_upgrade_assistant_4',
              'call_v14_locator_upgrade_4', 'occ_v14_locator_upgrade_4',
              'set_default_course_preference', 3, 0, 'set_default_course_preference', 3,
              'agent_action', ${"f".repeat(64)}, 'admitted', 13,
              'trn_v14_locator_upgrade_4', 'inp_v14_locator_upgrade_4'
            ),
            (
              'prt_v14_locator_upgrade_5', 'ses_v14_locator_upgrade_5',
              'msg_v14_locator_upgrade_user_5', 'msg_v14_locator_upgrade_assistant_5',
              'call_v14_locator_upgrade_5', 'occ_v14_locator_upgrade_5',
              'set_default_course_preference', 3, 0, 'set_default_course_preference', 3,
              'agent_action', ${"9".repeat(64)}, 'admitted', 14,
              'trn_v14_locator_upgrade_5', 'inp_v14_locator_upgrade_5'
            )
        `)
        const validCourseID = "crs_00000000000000000000000012"
        const malformedCourseID = "crs_00000000000000000000000013"
        const recordedCourseID = "crs_00000000000000000000000014"
        const mixedMissingRevisionCourseID = "crs_00000000000000000000000015"
        const mixedMissingViewCourseID = "crs_00000000000000000000000016"
        yield* db.run(sql`
          INSERT INTO course (id, title, state_version, time_created, time_updated) VALUES
            (${validCourseID}, 'Valid upgraded V14 locator', 0, 10, 10),
            (${malformedCourseID}, 'Malformed upgraded V14 locator', 0, 11, 11),
            (${recordedCourseID}, 'Recorded upgraded V14 locator', 0, 12, 12),
            (${mixedMissingRevisionCourseID}, 'Mixed missing revision upgraded V14 locator', 0, 13, 13),
            (${mixedMissingViewCourseID}, 'Mixed missing view upgraded V14 locator', 0, 14, 14)
        `)
        yield* db.run(sql`
          INSERT INTO course_view (id, course_id, name, state_version, time_created, time_updated) VALUES
            ('cvw_00000000000000000000000014', ${recordedCourseID}, 'Recorded upgraded view', 0, 12, 12),
            ('cvw_00000000000000000000000015', ${mixedMissingRevisionCourseID}, 'Mixed missing revision upgraded view', 0, 13, 13),
            ('cvw_00000000000000000000000016', ${mixedMissingViewCourseID}, 'Mixed missing view upgraded view', 0, 14, 14)
        `)
        yield* db.run(sql`
          INSERT INTO course_view_revision (
            id, course_id, view_id, revision_number, authorship_basis, time_created
          ) VALUES
            ('cvr_00000000000000000000000014', ${recordedCourseID}, 'cvw_00000000000000000000000014', 1, 'tutor_proposed', 12),
            ('cvr_00000000000000000000000015', ${mixedMissingRevisionCourseID}, 'cvw_00000000000000000000000015', 1, 'tutor_proposed', 13),
            ('cvr_00000000000000000000000016', ${mixedMissingViewCourseID}, 'cvw_00000000000000000000000016', 1, 'tutor_proposed', 14)
        `)
        yield* db.run(sql`
          INSERT INTO course_view_revision_state (
            course_id, view_id, revision_id, state_version, time_updated
          ) VALUES
            (${recordedCourseID}, 'cvw_00000000000000000000000014', 'cvr_00000000000000000000000014', 0, 12),
            (${mixedMissingRevisionCourseID}, 'cvw_00000000000000000000000015', 'cvr_00000000000000000000000015', 0, 13),
            (${mixedMissingViewCourseID}, 'cvw_00000000000000000000000016', 'cvr_00000000000000000000000016', 0, 14)
        `)
        yield* db.run(sql`
          INSERT INTO course_working_selection (course_id, revision_id, version, time_updated) VALUES
            (${validCourseID}, NULL, 0, 10),
            (${recordedCourseID}, 'cvr_00000000000000000000000014', 1, 12),
            (${mixedMissingRevisionCourseID}, 'cvr_00000000000000000000000015', 1, 13),
            (${mixedMissingViewCourseID}, 'cvr_00000000000000000000000016', 1, 14)
        `)
        const provenance = (index: 1 | 2 | 3 | 4 | 5) => ({
          schemaVersion: 1,
          kind: "root",
          occurrenceID: `occ_v14_locator_upgrade_${index}`,
          causalRootOccurrenceID: `occ_v14_locator_upgrade_${index}`,
          sessionID: `ses_v14_locator_upgrade_${index}`,
          turnID: `trn_v14_locator_upgrade_${index}`,
          inputID: `inp_v14_locator_upgrade_${index}`,
          assistantMessageID: `msg_v14_locator_upgrade_assistant_${index}`,
          invocationPartID: `prt_v14_locator_upgrade_${index}`,
          providerCallID: `call_v14_locator_upgrade_${index}`,
          emissionOrdinal: 0,
          capabilityIdentity: "set_default_course_preference",
          capabilityVersion: 3,
          lineage: [],
        })
        const validLocator = yield* db
          .run(
            sql`
            INSERT INTO learner_default_course_disposition (
              invocation_part_id, disposition, agent_action_version, agent_action_fingerprint,
              agent_action_provenance, command_fingerprint, command_snapshot, preference_version,
              operation, from_locator, to_locator, time_disposed
            ) VALUES (
              'prt_v14_locator_upgrade_1', 'agent_action_v3', 3, ${"a".repeat(64)},
              ${JSON.stringify(provenance(1))}, ${"b".repeat(64)},
              ${JSON.stringify({ action: "set", courseID: validCourseID })}, 0, 'set',
              '{"kind":"absent"}',
              ${JSON.stringify({
                kind: "course",
                locator: {
                  courseID: validCourseID,
                  title: { availability: "recorded_v2", value: "Valid upgraded V14 locator" },
                  courseVersion: { availability: "recorded_v2", value: 0 },
                  workingSelection: {
                    availability: "recorded_v2",
                    value: {
                      revisionID: null,
                      selectionVersion: 0,
                      viewID: null,
                      viewName: null,
                      viewVersion: null,
                      revisionVersion: null,
                    },
                  },
                },
              })},
              10
            )
          `,
          )
          .pipe(Effect.exit)
        const malformedLocator = yield* db
          .run(
            sql`
            INSERT INTO learner_default_course_disposition (
              invocation_part_id, disposition, agent_action_version, agent_action_fingerprint,
              agent_action_provenance, command_fingerprint, command_snapshot, preference_version,
              operation, from_locator, to_locator, time_disposed
            ) VALUES (
              'prt_v14_locator_upgrade_2', 'agent_action_v3', 3, ${"a".repeat(64)},
              ${JSON.stringify(provenance(2))}, ${"b".repeat(64)},
              ${JSON.stringify({ action: "set", courseID: malformedCourseID })}, 0, 'set',
              '{"kind":"absent","unexpected":"accepted"}',
              ${JSON.stringify({
                kind: "course",
                unexpected: "accepted",
                locator: {
                  courseID: malformedCourseID,
                  unexpected: "accepted",
                  title: { availability: "recorded_v2" },
                  courseVersion: { availability: "recorded_v2" },
                  workingSelection: { availability: "recorded_v2" },
                },
              })},
              11
            )
          `,
          )
          .pipe(Effect.exit)
        const insertRecordedLocator = (
          index: 3 | 4 | 5,
          courseID: string,
          title: string,
          selection: Readonly<{
            revisionID: string | null
            selectionVersion: number
            viewID: string | null
            viewName: string | null
            viewVersion: number | null
            revisionVersion: number | null
          }>,
        ) =>
          db
            .run(
              sql`
                INSERT INTO learner_default_course_disposition (
                  invocation_part_id, disposition, agent_action_version, agent_action_fingerprint,
                  agent_action_provenance, command_fingerprint, command_snapshot, preference_version,
                  operation, from_locator, to_locator, time_disposed
                ) VALUES (
                  ${`prt_v14_locator_upgrade_${index}`}, 'agent_action_v3', 3, ${"a".repeat(64)},
                  ${JSON.stringify(provenance(index))}, ${"b".repeat(64)},
                  ${JSON.stringify({ action: "set", courseID })}, 0, 'set',
                  '{"kind":"absent"}',
                  ${JSON.stringify({
                    kind: "course",
                    locator: {
                      courseID,
                      title: { availability: "recorded_v2", value: title },
                      courseVersion: { availability: "recorded_v2", value: 0 },
                      workingSelection: { availability: "recorded_v2", value: selection },
                    },
                  })},
                  ${index + 9}
                )
              `,
            )
            .pipe(Effect.exit)
        const validRecordedSelection = yield* insertRecordedLocator(
          3,
          recordedCourseID,
          "Recorded upgraded V14 locator",
          {
            revisionID: "cvr_00000000000000000000000014",
            selectionVersion: 1,
            viewID: "cvw_00000000000000000000000014",
            viewName: "Recorded upgraded view",
            viewVersion: 0,
            revisionVersion: 0,
          },
        )
        const mixedMissingRevision = yield* insertRecordedLocator(
          4,
          mixedMissingRevisionCourseID,
          "Mixed missing revision upgraded V14 locator",
          {
            revisionID: null,
            selectionVersion: 1,
            viewID: "cvw_00000000000000000000000015",
            viewName: "Mixed missing revision upgraded view",
            viewVersion: 0,
            revisionVersion: 0,
          },
        )
        const mixedMissingView = yield* insertRecordedLocator(
          5,
          mixedMissingViewCourseID,
          "Mixed missing view upgraded V14 locator",
          {
            revisionID: "cvr_00000000000000000000000016",
            selectionVersion: 1,
            viewID: null,
            viewName: null,
            viewVersion: null,
            revisionVersion: null,
          },
        )
        return {
          before,
          after,
          structures,
          foreignKeys: yield* db.all(sql.raw("PRAGMA foreign_key_check")),
          legacyAgentColumns,
          retiredProposal,
          validLocator,
          malformedLocator,
          validRecordedSelection,
          mixedMissingRevision,
          mixedMissingView,
        }
      }),
    )
    const fresh = await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        return yield* structuralManifest(db)
      }),
    )

    expect(upgraded.after).toEqual(upgraded.before)
    expect(upgraded.structures).toEqual(fresh)
    expect(upgraded.foreignKeys).toEqual([])
    expect(upgraded.legacyAgentColumns).toEqual([
      {
        invocation_part_id: "prt_v13_v1",
        agent_action_version: null,
        agent_action_fingerprint: null,
      },
      {
        invocation_part_id: "prt_v13_v2",
        agent_action_version: null,
        agent_action_fingerprint: null,
      },
    ])
    expect(upgraded.retiredProposal._tag).toBe("Failure")
    if (upgraded.retiredProposal._tag === "Failure") {
      expect(String(upgraded.retiredProposal.cause)).toContain("learner_default_course_proposal_retired")
    }
    expect(upgraded.validLocator._tag).toBe("Success")
    expect(upgraded.malformedLocator._tag).toBe("Failure")
    expect(upgraded.validRecordedSelection._tag).toBe("Success")
    expect(upgraded.mixedMissingRevision._tag).toBe("Failure")
    expect(upgraded.mixedMissingView._tag).toBe("Failure")
  })

  test("classifies a frozen V15 admitted Goal as exact historical V1 without fabricating current facts", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.transaction((tx) => databaseV13Schema.up(tx))
        yield* db.transaction((tx) => installSchemaExtrasV13(tx))
        yield* db.run("PRAGMA foreign_keys = OFF")
        yield* db.transaction((tx) => agentNativeDefaultCourseMigration.up(tx))
        yield* db.transaction((tx) => messageDiffProjectionMigration.up(tx))
        yield* db.run("PRAGMA foreign_keys = ON")
        const triggers = yield* db.all<{ name: string }>(
          sql`SELECT name FROM sqlite_schema WHERE type = 'trigger' ORDER BY name`,
        )
        yield* Effect.forEach(triggers, (trigger) => db.run(sql`DROP TRIGGER ${sql.identifier(trigger.name)}`), {
          discard: true,
        })
        yield* db.run(sql`
          INSERT INTO learning_admitted_occurrence (
            id, origin_session_id, origin_message_id, time_admitted
          ) VALUES (
            'lco_v15_goal_admitted', 'ses_v15_goal', 'msg_v15_goal_user', 41
          )
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_invocation (
            part_id, session_id, parent_user_message_id, assistant_message_id,
            provider_call_id, occurrence_id, command_name, command_version,
            emission_ordinal, capability_identity, capability_version,
            authorization_basis, input_fingerprint, status, time_admitted,
            turn_id, input_id
          ) VALUES (
            'prt_v15_goal_admitted', 'ses_v15_goal', 'msg_v15_goal_user',
            'msg_v15_goal_assistant', 'call_v15_goal', 'lco_v15_goal_admitted',
            'update_learner_goals', 1, 0, 'update_learner_goals', 1,
            'learner_acceptance', ${"1".repeat(64)}, 'admitted', 42,
            'trn_v15_goal', 'inp_v15_goal'
          )
        `)
        const command =
          '{"operations":[{"type":"create","snapshot":{"outcome":"Frozen V1 Goal","conditions":[],"scope":{"type":"learner_home"},"target":{"type":"absent"},"fieldBases":{"outcome":{"type":"accepted"},"conditions":{"type":"accepted"},"scope":{"type":"accepted"},"target":{"type":"accepted"},"disposition":{"type":"accepted"}}},"disposition":"active"}]}'
        yield* db.run(sql`
          INSERT INTO learner_goal_command (
            invocation_part_id, semantic_fingerprint, command_snapshot,
            permission_request_id, confirmation_snapshot
          ) VALUES (
            'prt_v15_goal_admitted', ${"2".repeat(64)}, ${command},
            'per_v15_goal', NULL
          )
        `)
        const rawBefore = yield* db.get(sql`
          SELECT
            CAST(invocation.input_fingerprint AS blob) AS input_fingerprint,
            CAST(command.command_snapshot AS blob) AS command_snapshot,
            CAST(command.semantic_fingerprint AS blob) AS semantic_fingerprint,
            CAST(command.permission_request_id AS blob) AS permission_request_id
          FROM learning_command_invocation AS invocation
          JOIN learner_goal_command AS command
            ON command.invocation_part_id = invocation.part_id
          WHERE invocation.part_id = 'prt_v15_goal_admitted'
        `)

        yield* db.run("PRAGMA foreign_keys = OFF")
        yield* db.transaction((tx) => agentNativeLearnerGoalsMigration.up(tx))
        yield* db.run("PRAGMA foreign_keys = ON")

        expect(
          yield* db.get(sql`
            SELECT disposition, legacy_command_part_id, command_fingerprint,
                   canonical_command, agent_action_provenance, materialized_snapshot,
                   semantic_outcome, existing_effect_id
            FROM learner_goal_disposition_v2
            WHERE invocation_part_id = 'prt_v15_goal_admitted'
          `),
        ).toEqual({
          disposition: "legacy_v1",
          legacy_command_part_id: "prt_v15_goal_admitted",
          command_fingerprint: "2".repeat(64),
          canonical_command: null,
          agent_action_provenance: null,
          materialized_snapshot: null,
          semantic_outcome: null,
          existing_effect_id: null,
        })
        expect(
          yield* db.get(sql`
            SELECT
              CAST(invocation.input_fingerprint AS blob) AS input_fingerprint,
              CAST(command.command_snapshot AS blob) AS command_snapshot,
              CAST(command.semantic_fingerprint AS blob) AS semantic_fingerprint,
              CAST(command.permission_request_id AS blob) AS permission_request_id
            FROM learning_command_invocation AS invocation
            JOIN learner_goal_command AS command
              ON command.invocation_part_id = invocation.part_id
            WHERE invocation.part_id = 'prt_v15_goal_admitted'
          `),
        ).toEqual(rawBefore)
        expect(yield* db.get(sql`SELECT * FROM learner_goal_state`)).toEqual({ singleton: 1, revision_sequence: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_capability_issue_v2`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_capability_settlement_v2`)).toEqual({
          count: 0,
        })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 0 })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
        expect(
          Exit.isFailure(
            yield* db
              .run(sql`DELETE FROM learner_goal_disposition_v2 WHERE invocation_part_id = 'prt_v15_goal_admitted'`)
              .pipe(Effect.exit),
          ),
        ).toBe(true)
        yield* db.run(sql`DELETE FROM learning_command_invocation WHERE part_id = 'prt_v15_goal_admitted'`)
        expect(
          yield* db.get(sql`
            SELECT
              (SELECT count(*) FROM learner_goal_command WHERE invocation_part_id = 'prt_v15_goal_admitted') AS commands,
              (SELECT count(*) FROM learner_goal_disposition_v2 WHERE invocation_part_id = 'prt_v15_goal_admitted') AS dispositions
          `),
        ).toEqual({ commands: 0, dispositions: 0 })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("preserves the v12 route-anchor branch inside the v13 shared no-effect wrapper", () => {
    const previous = learningCommandStatements.find((statement) =>
      statement.includes("learner_navigation_learning_command_no_effect_validate_v12"),
    )
    if (!previous) throw new Error("The frozen v12 Navigation no-effect trigger is unavailable")
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim()
    const expected = [
      `NEW.command_name = 'set_course_route_anchor'
       AND NEW.command_version = 1
       AND NEW.capability_identity = 'set_course_route_anchor'
       AND NEW.capability_version = 1
       AND NEW.authorization_basis = 'learner_request'`,
      `NEW.command_name = 'set_course_route_anchor'
       AND json_extract(NEW.settlement, '$.navigationKind') = 'course_route_anchor'
       AND json_extract(NEW.settlement, '$.current.kind') = 'course_route_anchor'
       AND json_type(NEW.settlement, '$.current.courseID') = 'text'
       AND json_type(NEW.settlement, '$.current.headID') IN ('text', 'null')
       AND json_type(NEW.settlement, '$.current.version') = 'integer'
       AND json_extract(NEW.settlement, '$.current.version') >= 0
       AND json_type(NEW.settlement, '$.current.target') IN ('object', 'null')
       AND json_type(NEW.settlement, '$.current.usability') = 'object'`,
    ].map(normalize)
    const v12 = normalize(previous)
    const v13 = normalize(noEffectStatement)

    expect(v12.match(/NEW\.command_name = 'set_course_route_anchor'/g)).toHaveLength(2)
    expect(v13.match(/NEW\.command_name = 'set_course_route_anchor'/g)).toHaveLength(2)
    for (const clause of expected) {
      expect(v12).toContain(clause)
      expect(v13).toContain(clause)
    }
  })

  test("migrates v12 command and effect confirmations separately with partial historical locators", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* initializeDatabaseV11(db)
        yield* DatabaseMigration.apply(db, {
          path: "frozen-v12-default-course.db",
          migrations: [...databaseV11Migrations, domainNeutralLearningCommandLedgerMigration],
        })

        const triggers = yield* db.all<{ name: string }>(
          sql`SELECT name FROM sqlite_schema WHERE type = 'trigger' ORDER BY name`,
        )
        yield* Effect.forEach(
          triggers,
          (trigger) => db.run(sql.raw(`DROP TRIGGER "${trigger.name.replaceAll('"', '""')}"`)),
          { discard: true },
        )
        const confirmation = {
          permissionRequestID: "permission_v12_clear_effect",
          headID: "ndp_00000000000000000000000001",
          version: 1,
          fromCourseID: "crs_00000000000000000000000001",
          fromCourseTitle: "Frozen v11 migration fixture",
          target: null,
        }
        const effect = {
          id: "ndp_00000000000000000000000002",
          occurrenceID: "lco_00000000000000000000000013",
          previousCourseID: "crs_00000000000000000000000001",
          courseID: null,
          previousVersion: 1,
          version: 2,
          timeCommitted: 20,
          commitOrder: 10,
          frontierSequence: 2,
        }
        const current = {
          kind: "default_course_preference",
          headID: effect.id,
          version: 2,
          courseID: null,
          usability: { usable: false, cause: "absent" },
          source: {
            receiptID: "lcr_00000000000000000000000013",
            occurrenceID: effect.occurrenceID,
            originSessionID: "ses_v11",
            originMessageID: "msg_v12_clear",
            assistantMessageID: "msg_v12_assistant_clear",
            invocationPartID: "prt_v12_clear",
            availability: "available",
          },
          timeCommitted: 20,
          commitOrder: 10,
          frontierSequence: 2,
        }
        const applied = JSON.stringify({
          outcome: "applied",
          navigationKind: "default_course_preference",
          receiptID: current.source.receiptID,
          effectID: effect.id,
          effect,
          current,
          confirmation,
          settlementTime: 20,
          settlementOrder: 10,
        })
        const replay = JSON.stringify({
          outcome: "already_applied",
          navigationKind: "default_course_preference",
          receiptID: current.source.receiptID,
          effectID: effect.id,
          effect,
          current,
          confirmation,
          settlementTime: 21,
          settlementOrder: 11,
          relation: "active",
        })
        const noChange = JSON.stringify({
          outcome: "no_change",
          navigationKind: "default_course_preference",
          current,
          settlementTime: 22,
          settlementOrder: 12,
        })
        const error = JSON.stringify({
          outcome: "error",
          code: "stale",
          settlementTime: 23,
          settlementOrder: 13,
        })
        const rawPart =
          '{"type":"tool", "tool":"set_default_course_preference","callID":"call-v12-clear","state":{"status":"completed","input":{"target":null},"output":"frozen-v12"}}'
        yield* db.run(sql`
          INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
          VALUES ('project_v12', '/frozen-v12', 1, 1, '[]')
        `)
        yield* db.run(sql`
          INSERT INTO session (
            id, project_id, slug, directory, title, version, time_created, time_updated
          ) VALUES (
            'ses_v11', 'project_v12', 'frozen-v12', '/frozen-v12',
            'Frozen V12 migration fixture', 'test', 1, 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data)
          VALUES
            ('msg_v12_clear', 'ses_v11', 19, 19, '{"role":"user"}'),
            (
              'msg_v12_assistant_clear', 'ses_v11', 20, 20,
              '{"role":"assistant","parentID":"msg_v12_clear"}'
            )
        `)
        yield* db.run(sql`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES (
            'prt_v12_clear', 'msg_v12_assistant_clear', 'ses_v11', 20, 20, ${rawPart}
          )
        `)
        yield* db.run(sql`
          INSERT INTO learning_admitted_occurrence (
            id, origin_session_id, origin_message_id, time_admitted
          ) VALUES (
            ${effect.occurrenceID}, 'ses_v11', 'msg_v12_clear', 20
          )
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_invocation (
            part_id, session_id, parent_user_message_id, assistant_message_id,
            provider_call_id, occurrence_id, command_name, command_version,
            emission_ordinal, capability_identity, capability_version,
            authorization_basis, input_fingerprint, status, receipt_id,
            settlement, time_admitted, time_settled, settlement_order
          ) VALUES
            (
              'prt_v12_clear', 'ses_v11', 'msg_v12_clear', 'msg_v12_assistant_clear',
              'call-v12-clear', ${effect.occurrenceID}, 'set_default_course_preference', 1,
              0, 'set_default_course_preference', 1, 'learner_acceptance',
              ${"c".repeat(64)}, 'applied', ${current.source.receiptID},
              ${applied}, 20, 20, 10
            ),
            (
              'prt_v12_clear_replay', 'ses_v11', 'msg_v12_clear', 'msg_v12_assistant_clear_replay',
              'call-v12-clear-replay', ${effect.occurrenceID}, 'set_default_course_preference', 1,
              0, 'set_default_course_preference', 1, 'learner_acceptance',
              ${"d".repeat(64)}, 'already_applied', ${current.source.receiptID},
              ${replay}, 21, 21, 11
            ),
            (
              'prt_v12_no_change', 'ses_v11', 'msg_v12_clear', 'msg_v12_assistant_no_change',
              'call-v12-no-change', ${effect.occurrenceID}, 'set_default_course_preference', 1,
              0, 'set_default_course_preference', 1, 'learner_acceptance',
              ${"e".repeat(64)}, 'no_change', NULL, ${noChange}, 22, 22, 12
            ),
            (
              'prt_v12_error', 'ses_v11', 'msg_v12_clear', 'msg_v12_assistant_error',
              'call-v12-error', ${effect.occurrenceID}, 'set_default_course_preference', 1,
              0, 'set_default_course_preference', 1, 'learner_acceptance',
              ${"f".repeat(64)}, 'error', NULL, ${error}, 23, 23, 13
            ),
            (
              'prt_v12_admitted', 'ses_v11', 'msg_v12_clear', 'msg_v12_assistant_admitted',
              'call-v12-admitted', ${effect.occurrenceID}, 'set_default_course_preference', 1,
              0, 'set_default_course_preference', 1, 'learner_acceptance',
              ${"0".repeat(64)}, 'admitted', NULL, NULL, 24, NULL, NULL
            )
        `)
        yield* db.run(sql`
          INSERT INTO learner_default_course_command (invocation_part_id, permission_request_id)
          VALUES
            ('prt_v12_clear', 'permission_v12_clear_effect'),
            ('prt_v12_clear_replay', 'permission_v12_later_acceptance'),
            ('prt_v12_no_change', 'permission_v12_no_change'),
            ('prt_v12_error', 'permission_v12_error'),
            ('prt_v12_admitted', 'permission_v12_admitted')
        `)
        yield* db.run(sql`
          UPDATE learning_command_invocation
          SET turn_id = 'turn-v12-admitted', input_id = 'input-v12-admitted'
          WHERE part_id = 'prt_v12_admitted'
        `)
        yield* db.run(sql`
          UPDATE learning_shared_frontier
          SET sequence = 2, time_committed = 20
          WHERE singleton = 1
        `)
        yield* db.run(sql`
          INSERT INTO learner_default_course_transition (
            id, version, predecessor_id, previous_course_id, course_id, occurrence_id,
            permission_request_id, confirmation_snapshot, time_committed, commit_order,
            frontier_sequence, frontier_time
          ) VALUES (
            ${effect.id}, 2, 'ndp_00000000000000000000000001',
            'crs_00000000000000000000000001', NULL, ${effect.occurrenceID},
            'permission_v12_clear_effect', ${JSON.stringify(confirmation)},
            20, 10, 2, 20
          )
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_receipt (
            id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
            invocation_part_id, capability_identity, capability_version,
            authorization_basis, time_committed, commit_order
          ) VALUES (
            ${current.source.receiptID}, ${effect.occurrenceID}, 'ses_v11', 'msg_v12_clear',
            'msg_v12_assistant_clear', 'prt_v12_clear',
            'set_default_course_preference', 1, 'learner_acceptance', 20, 10
          )
        `)
        yield* db.run(sql`
          INSERT INTO learner_default_course_commit_seal (effect_id, receipt_id, invocation_part_id)
          VALUES (${effect.id}, ${current.source.receiptID}, 'prt_v12_clear')
        `)
        const preserved = yield* db.all<{
          part_id: string
          part: string | null
          settlement: string | null
          confirmation: string | null
        }>(sql`
          SELECT
            invocation.part_id,
            CAST(part.data AS text) AS part,
            CAST(invocation.settlement AS text) AS settlement,
            CAST(effect.confirmation_snapshot AS text) AS confirmation
          FROM learning_command_invocation AS invocation
          JOIN learner_default_course_command AS command
            ON command.invocation_part_id = invocation.part_id
          LEFT JOIN part ON part.id = invocation.part_id
          LEFT JOIN learner_default_course_commit_seal AS seal
            ON seal.receipt_id = invocation.receipt_id
          LEFT JOIN learner_default_course_transition AS effect ON effect.id = seal.effect_id
          ORDER BY invocation.part_id
        `)
        expect(preserved.find((row) => row.part_id === "prt_v12_clear")).toMatchObject({ part: rawPart })

        yield* DatabaseMigration.apply(db, { path: "frozen-v12-default-course.db" })

        expect(
          yield* db.all(sql`
            SELECT
              invocation.part_id,
              CAST(part.data AS text) AS part,
              CAST(invocation.settlement AS text) AS settlement,
              CAST(effect.confirmation_snapshot AS text) AS confirmation
            FROM learning_command_invocation AS invocation
            JOIN learner_default_course_command AS command
              ON command.invocation_part_id = invocation.part_id
            LEFT JOIN part ON part.id = invocation.part_id
            LEFT JOIN learner_default_course_commit_seal AS seal
              ON seal.receipt_id = invocation.receipt_id
            LEFT JOIN learner_default_course_transition AS effect ON effect.id = seal.effect_id
            ORDER BY invocation.part_id
          `),
        ).toEqual(preserved)
        expect(
          yield* db.get(sql`
            SELECT turn_id, input_id
            FROM learning_command_invocation
            WHERE part_id = 'prt_v12_admitted'
          `),
        ).toEqual({ turn_id: "turn-v12-admitted", input_id: "input-v12-admitted" })
        expect(
          yield* db.get(sql`
            SELECT
              disposition,
              command_permission_request_id,
              effect_confirmation_request_id,
              legacy_effect_id,
              legacy_receipt_id
            FROM learner_default_course_disposition
            WHERE invocation_part_id = 'prt_v12_clear_replay'
          `),
        ).toEqual({
          disposition: "legacy_v1",
          command_permission_request_id: "permission_v12_later_acceptance",
          effect_confirmation_request_id: "permission_v12_clear_effect",
          legacy_effect_id: effect.id,
          legacy_receipt_id: current.source.receiptID,
        })
        expect(
          yield* db.all(sql`
            SELECT
              invocation_part_id,
              disposition,
              legacy_row_class,
              confirmation_availability,
              effect_confirmation_request_id,
              legacy_effect_id,
              legacy_receipt_id
            FROM learner_default_course_disposition
            WHERE invocation_part_id IN (
              'prt_v12_admitted', 'prt_v12_error', 'prt_v12_no_change'
            )
            ORDER BY invocation_part_id
          `),
        ).toEqual([
          {
            invocation_part_id: "prt_v12_admitted",
            disposition: "legacy_v1",
            legacy_row_class: "admitted",
            confirmation_availability: "not_recorded_v1",
            effect_confirmation_request_id: null,
            legacy_effect_id: null,
            legacy_receipt_id: null,
          },
          {
            invocation_part_id: "prt_v12_error",
            disposition: "legacy_v1",
            legacy_row_class: "error",
            confirmation_availability: "not_recorded_v1",
            effect_confirmation_request_id: null,
            legacy_effect_id: null,
            legacy_receipt_id: null,
          },
          {
            invocation_part_id: "prt_v12_no_change",
            disposition: "legacy_v1",
            legacy_row_class: "no_change",
            confirmation_availability: "not_recorded_v1",
            effect_confirmation_request_id: null,
            legacy_effect_id: null,
            legacy_receipt_id: null,
          },
        ])
        expect(
          yield* db.get(sql`
            SELECT
              effect_authorization_part_id,
              operation,
              relation,
              json_extract(from_locator, '$.locator.courseID') AS from_course_id,
              json_extract(from_locator, '$.locator.title.value') AS from_title,
              json_extract(from_locator, '$.locator.courseVersion.availability') AS from_version,
              json_extract(from_locator, '$.locator.workingSelection.availability') AS from_selection,
              json_extract(to_locator, '$.kind') AS to_kind
            FROM learner_default_course_acknowledgement
            WHERE invocation_part_id = 'prt_v12_clear_replay'
          `),
        ).toEqual({
          effect_authorization_part_id: "prt_v12_clear",
          operation: "clear",
          relation: "active",
          from_course_id: "crs_00000000000000000000000001",
          from_title: "Frozen v11 migration fixture",
          from_version: "not_recorded_v1",
          from_selection: "not_recorded_v1",
          to_kind: "absent",
        })
        expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
      }),
    )
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* initializeDatabaseV11(db)
        yield* DatabaseMigration.apply(db, {
          path: "corrupt-v12-default-course.db",
          migrations: [...databaseV11Migrations, domainNeutralLearningCommandLedgerMigration],
        })
        const triggers = yield* db.all<{ name: string }>(
          sql`SELECT name FROM sqlite_schema WHERE type = 'trigger' ORDER BY name`,
        )
        yield* Effect.forEach(
          triggers,
          (trigger) => db.run(sql.raw(`DROP TRIGGER "${trigger.name.replaceAll('"', '""')}"`)),
          { discard: true },
        )
        yield* db.run(sql`
          UPDATE learner_default_course_transition
          SET confirmation_snapshot = json_set(
            confirmation_snapshot,
            '$.fromCourseID',
            'crs_00000000000000000000000001'
          )
          WHERE id = 'ndp_00000000000000000000000001'
        `)
        yield* db.run(sql`
          UPDATE learning_command_invocation
          SET settlement = json_set(
            settlement,
            '$.confirmation.fromCourseID',
            'crs_00000000000000000000000001'
          )
          WHERE part_id = 'prt_v11_default'
        `)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "corrupt-v12-default-course.db" }))

        expect(error).toMatchObject({
          _tag: "DatabaseMigrationError",
          migrationID: defaultCourseV2Migration.id,
          fromVersion: BASELINE_VERSION + 11,
          toVersion: BASELINE_VERSION + 12,
        })
        expect(
          yield* db.get(sql`
            SELECT json_extract(confirmation_snapshot, '$.fromCourseID') AS from_course_id
            FROM learner_default_course_transition
            WHERE id = 'ndp_00000000000000000000000001'
          `),
        ).toEqual({ from_course_id: "crs_00000000000000000000000001" })
        expect(
          yield* db.get(sql`
            SELECT name FROM sqlite_schema
            WHERE type = 'table' AND name = 'learner_default_course_disposition'
          `),
        ).toBeUndefined()
      }),
    )
  })

  test("upgrades the frozen v11 database and rows to the exact current structural manifest", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* initializeDatabaseV11(db)
        const preservedRouteInvocations = yield* db.all(sql`
          SELECT part_id, status, CAST(settlement AS text) AS settlement
          FROM learning_command_invocation
          WHERE command_name = 'set_course_route_anchor'
          ORDER BY part_id
        `)
        const preservedRouteEffect = yield* db.get(sql`
          SELECT
            effect.id,
            effect.course_id,
            effect.version,
            effect.predecessor_id,
            effect.previous_view_id,
            effect.previous_revision_id,
            effect.previous_item_id,
            effect.target_view_id,
            effect.target_revision_id,
            effect.target_item_id,
            effect.occurrence_id,
            effect.target_course_version,
            effect.target_selection_version,
            effect.target_view_version,
            effect.target_revision_version,
            effect.time_committed,
            effect.commit_order,
            effect.frontier_sequence,
            effect.frontier_time
          FROM learner_course_route_anchor_transition AS effect
        `)

        expect(yield* schemaManifestDigest(db)).toBe("6c8969cb8b0c167c672ca22ec42b1412fb2821b7d5f714a31b17c58705710838")
        expect(
          yield* db.get<{ definition: string }>(sql`
            SELECT sql AS definition
            FROM sqlite_schema
            WHERE type = 'trigger'
              AND name = 'learner_goal_commit_seal_acknowledgement_validate'
          `),
        ).toBeDefined()
        expect(
          yield* db.get<{ definition: string }>(sql`
            SELECT sql AS definition
            FROM sqlite_schema
            WHERE type = 'table' AND name = 'learning_command_invocation'
          `),
        ).toMatchObject({
          definition: expect.stringContaining("retained_steering_effect_id"),
        })

        const fresh = yield* makeDb
        yield* DatabaseMigration.apply(fresh)
        const freshStructuralManifest = yield* structuralManifest(fresh)
        const retainedSeal = freshStructuralManifest.find(
          (entry) => entry.name === "retained_steering_commit_seal_validate_insert_v12",
        )?.definition
        expect(retainedSeal).toContain("invocation.capability_identity = 'update_retained_learning_steering'")
        expect(retainedSeal).toContain("invocation.capability_version = 1")
        const goalSeal = freshStructuralManifest.find(
          (entry) => entry.name === "learner_goal_commit_seal_validate_insert_v16",
        )?.definition
        expect(goalSeal).toContain("receipt.capability_identity = 'update_learner_goals'")
        expect(goalSeal).toContain("receipt.capability_version = 2")
        expect(goalSeal).toContain("receipt.authorization_basis = 'agent_action'")
        expect(
          freshStructuralManifest.some(
            (entry) =>
              entry.name === "learner_goal_commit_seal_acknowledgement_validate" ||
              entry.name === "learner_goal_commit_seal_direct_validate",
          ),
        ).toBeFalse()
        expect(
          freshStructuralManifest.some((entry) => /\b(?:instr|lower|ltrim)\s*\(/i.test(entry.definition ?? "")),
        ).toBeFalse()

        yield* DatabaseMigration.apply(db, { path: "frozen-v11.db" })

        expect(yield* structuralManifest(db)).toEqual(freshStructuralManifest)
        expect(
          yield* db.all(sql`
            SELECT part_id, status, CAST(settlement AS text) AS settlement
            FROM learning_command_invocation
            WHERE command_name = 'set_course_route_anchor'
            ORDER BY part_id
          `),
        ).toEqual(preservedRouteInvocations)
        expect(
          yield* db.get(sql`
            SELECT
              effect.id,
              effect.course_id,
              effect.version,
              effect.predecessor_id,
              effect.previous_view_id,
              effect.previous_revision_id,
              effect.previous_item_id,
              effect.target_view_id,
              effect.target_revision_id,
              effect.target_item_id,
              effect.occurrence_id,
              effect.target_course_version,
              effect.target_selection_version,
              effect.target_view_version,
              effect.target_revision_version,
              effect.time_committed,
              effect.commit_order,
              effect.frontier_sequence,
              effect.frontier_time
            FROM learner_course_route_anchor_transition AS effect
          `),
        ).toEqual(preservedRouteEffect)
        expect(
          yield* db.get(sql`
            SELECT part_id, status, receipt_id
            FROM learning_command_invocation
            WHERE part_id = 'prt_v11_course'
          `),
        ).toEqual({
          part_id: "prt_v11_course",
          status: "applied",
          receipt_id: "lcr_00000000000000000000000001",
        })
        expect(
          yield* db.get(sql`
            SELECT id, invocation_part_id, capability_identity, capability_version,
                   authorization_basis, time_committed, commit_order
            FROM learning_command_receipt
            WHERE id = 'lcr_00000000000000000000000001'
          `),
        ).toEqual({
          id: "lcr_00000000000000000000000001",
          invocation_part_id: "prt_v11_course",
          capability_identity: "accept_course_view_revision",
          capability_version: 1,
          authorization_basis: "learner_request",
          time_committed: 11,
          commit_order: 1,
        })
        expect(
          yield* db.get(sql`
            SELECT effect_id, receipt_id, invocation_part_id
            FROM course_selection_acceptance_commit_seal
          `),
        ).toEqual({
          effect_id: "cse_00000000000000000000000001",
          receipt_id: "lcr_00000000000000000000000001",
          invocation_part_id: "prt_v11_course",
        })
        expect(
          yield* db.all(sql`
            SELECT status, count(*) AS count
            FROM learning_command_invocation
            GROUP BY status
            ORDER BY status
          `),
        ).toEqual([
          { status: "admitted", count: 1 },
          { status: "already_applied", count: 1 },
          { status: "applied", count: 6 },
          { status: "error", count: 1 },
          { status: "no_change", count: 1 },
        ])
        expect(
          yield* db.get(sql`
            SELECT status, receipt_id,
                   json_extract(settlement, '$.effectID') AS effect_id
            FROM learning_command_invocation
            WHERE part_id = 'prt_v11_replay'
          `),
        ).toEqual({
          status: "already_applied",
          receipt_id: "lcr_00000000000000000000000002",
          effect_id: "rfx_00000000000000000000000001",
        })
        expect(
          yield* db.all(sql`
            SELECT 'anchor' AS kind, effect_id, receipt_id, invocation_part_id
            FROM learner_course_route_anchor_commit_seal
            UNION ALL
            SELECT 'course', effect_id, receipt_id, invocation_part_id
            FROM course_selection_acceptance_commit_seal
            UNION ALL
            SELECT 'default', effect_id, receipt_id, invocation_part_id
            FROM learner_default_course_commit_seal
            UNION ALL
            SELECT 'goal', effect_id, receipt_id, invocation_part_id
            FROM learner_goal_commit_seal
            UNION ALL
            SELECT 'representation', effect_id, receipt_id, invocation_part_id
            FROM representation_command_commit_seal
            UNION ALL
            SELECT 'retained', transition_id, receipt_id, invocation_part_id
            FROM retained_steering_commit_seal
            ORDER BY kind
          `),
        ).toEqual([
          {
            kind: "anchor",
            effect_id: "nar_00000000000000000000000001",
            receipt_id: "lcr_00000000000000000000000004",
            invocation_part_id: "prt_v11_anchor",
          },
          {
            kind: "course",
            effect_id: "cse_00000000000000000000000001",
            receipt_id: "lcr_00000000000000000000000001",
            invocation_part_id: "prt_v11_course",
          },
          {
            kind: "default",
            effect_id: "ndp_00000000000000000000000001",
            receipt_id: "lcr_00000000000000000000000003",
            invocation_part_id: "prt_v11_default",
          },
          {
            kind: "goal",
            effect_id: "gle_00000000000000000000000001",
            receipt_id: "lcr_00000000000000000000000006",
            invocation_part_id: "prt_v11_goal",
          },
          {
            kind: "representation",
            effect_id: "rfx_00000000000000000000000001",
            receipt_id: "lcr_00000000000000000000000002",
            invocation_part_id: "prt_v11_representation",
          },
          {
            kind: "retained",
            effect_id: "rst_00000000000000000000000001",
            receipt_id: "lcr_00000000000000000000000005",
            invocation_part_id: "prt_v11_retained",
          },
        ])
        expect(
          yield* db.get(sql`
            SELECT
              authorization.disposition,
              authorization.authorization_version,
              authorization.authorization_kind,
              authorization.legacy_row_class,
              authorization.confirmation_availability,
              authorization.command_permission_request_id,
              authorization.effect_confirmation_request_id,
              authorization.legacy_effect_id,
              authorization.legacy_receipt_id,
              effect.authorization_part_id
            FROM learner_default_course_disposition AS authorization
            JOIN learner_default_course_transition AS effect
              ON effect.id = authorization.legacy_effect_id
            WHERE authorization.invocation_part_id = 'prt_v11_default'
          `),
        ).toEqual({
          disposition: "legacy_v1",
          authorization_version: 1,
          authorization_kind: "legacy_v1",
          legacy_row_class: "applied",
          confirmation_availability: "recorded_v1",
          command_permission_request_id: "permission_v11_default",
          effect_confirmation_request_id: "permission_v11_default",
          legacy_effect_id: "ndp_00000000000000000000000001",
          legacy_receipt_id: "lcr_00000000000000000000000003",
          authorization_part_id: "prt_v11_default",
        })
        expect(
          yield* db.get(sql`
            SELECT
              operation,
              relation,
              json_extract(from_locator, '$.kind') AS from_kind,
              json_extract(to_locator, '$.locator.courseID') AS to_course_id,
              json_extract(to_locator, '$.locator.title.availability') AS title_availability,
              json_extract(to_locator, '$.locator.courseVersion.availability') AS version_availability,
              json_extract(to_locator, '$.locator.workingSelection.availability') AS selection_availability
            FROM learner_default_course_acknowledgement
            WHERE invocation_part_id = 'prt_v11_default'
          `),
        ).toEqual({
          operation: "set",
          relation: "active",
          from_kind: "absent",
          to_course_id: "crs_00000000000000000000000001",
          title_availability: "recorded_v1",
          version_availability: "recorded_v1",
          selection_availability: "recorded_v1",
        })
        expect(
          yield* db.get(sql`
            SELECT effect.authorization_basis, effect.semantic_fingerprint,
                   operation.operation_kind, operation.result_kind,
                   command.permission_request_id,
                   json_extract(command.confirmation_snapshot, '$.semanticFingerprint')
                     AS confirmation_fingerprint
            FROM learner_goal_effect AS effect
            JOIN learner_goal_effect_operation AS operation ON operation.effect_id = effect.id
            JOIN learner_goal_commit_seal AS seal ON seal.effect_id = effect.id
            JOIN learner_goal_command AS command
              ON command.invocation_part_id = seal.invocation_part_id
            WHERE effect.id = 'gle_00000000000000000000000001'
          `),
        ).toEqual({
          authorization_basis: "learner_acceptance",
          semantic_fingerprint: "6".repeat(64),
          operation_kind: "create",
          result_kind: "changed",
          permission_request_id: "permission_v11_goal",
          confirmation_fingerprint: "6".repeat(64),
        })
        expect(
          yield* db.get(sql`
            SELECT revision.authorization_basis, revision.time_accepted,
                   effect.time_committed, receipt.time_committed AS receipt_time
            FROM representation_revision AS revision
            JOIN representation_effect AS effect ON effect.id = revision.effect_id
            JOIN representation_command_commit_seal AS seal ON seal.effect_id = effect.id
            JOIN learning_command_receipt AS receipt ON receipt.id = seal.receipt_id
            WHERE revision.id = 'rep_00000000000000000000000001'
          `),
        ).toEqual({
          authorization_basis: "learner_request",
          time_accepted: 12,
          time_committed: 12,
          receipt_time: 12,
        })
        expect(
          yield* db.all<{ name: string }>(sql`
            SELECT name
            FROM pragma_table_info('learning_command_invocation_constraint_v12')
            WHERE name IN (
              'effect_id', 'representation_effect_id', 'default_navigation_effect_id',
              'anchor_navigation_effect_id', 'retained_steering_effect_id', 'goal_effect_id'
            )
            ORDER BY cid
          `),
        ).toEqual([
          { name: "effect_id" },
          { name: "representation_effect_id" },
          { name: "default_navigation_effect_id" },
          { name: "anchor_navigation_effect_id" },
          { name: "retained_steering_effect_id" },
          { name: "goal_effect_id" },
        ])
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("rolls v11 conversion back when historical receipt settlement metadata is inconsistent", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* initializeDatabaseV11(db, { receiptCommitOrder: 99 })

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "invalid-v11-receipt.db" }))

        expect(error).toMatchObject({
          _tag: "DatabaseMigrationError",
          migrationID: domainNeutralLearningCommandLedgerMigration.id,
          fromVersion: BASELINE_VERSION + 10,
          toVersion: BASELINE_VERSION + 11,
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION + 10,
        })
        expect(
          yield* db.get(sql`
            SELECT commit_order
            FROM learning_command_receipt
            WHERE id = 'lcr_00000000000000000000000001'
          `),
        ).toEqual({ commit_order: 99 })
        expect(
          yield* db.get(sql`
            SELECT name
            FROM pragma_table_info('learning_command_invocation')
            WHERE name = 'effect_id'
          `),
        ).toEqual({ name: "effect_id" })
        expect(
          yield* db.get(sql`
            SELECT name
            FROM sqlite_schema
            WHERE type = 'table' AND name = 'course_selection_acceptance_commit_seal'
          `),
        ).toBeUndefined()
      }),
    )
  })

  test("rolls v11 conversion back for nonexistent receipt and wrong typed effect settlement bindings", async () => {
    for (const fixture of [
      { path: "missing-v11-receipt.db", settlementReceiptID: "receipt_v11_missing" },
      { path: "wrong-v11-effect.db", settlementEffectID: "effect_v11_wrong_domain_binding" },
    ]) {
      await run(
        Effect.gen(function* () {
          const db = yield* makeDb
          yield* initializeDatabaseV11(db, fixture)

          const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: fixture.path }))

          expect(error).toMatchObject({
            _tag: "DatabaseMigrationError",
            migrationID: domainNeutralLearningCommandLedgerMigration.id,
            fromVersion: BASELINE_VERSION + 10,
            toVersion: BASELINE_VERSION + 11,
          })
          expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
            user_version: BASELINE_VERSION + 10,
          })
          expect(
            yield* db.get(sql`
              SELECT name
              FROM pragma_table_info('learning_command_invocation')
              WHERE name = 'effect_id'
            `),
          ).toEqual({ name: "effect_id" })
          expect(
            yield* db.get(sql`
              SELECT name
              FROM sqlite_schema
              WHERE type = 'table' AND name = 'course_selection_acceptance_commit_seal'
            `),
          ).toBeUndefined()
        }),
      )
    }
  })

  test("rolls the frozen six-domain v11 fixture back for domain-owned semantic corruption", async () => {
    for (const fixture of [
      { corruption: "course_receipt_basis" as const, path: "invalid-v11-course-basis.db" },
      { corruption: "course_command_version" as const, path: "invalid-v11-command-version.db" },
      { corruption: "course_capability_version" as const, path: "invalid-v11-capability-version.db" },
      {
        corruption: "representation_revision_basis" as const,
        path: "invalid-v11-representation-basis.db",
      },
      { corruption: "default_confirmation" as const, path: "invalid-v11-default-confirmation.db" },
      { corruption: "anchor_receipt_time" as const, path: "invalid-v11-anchor-time.db" },
      { corruption: "retained_fingerprint" as const, path: "invalid-v11-retained-effect.db" },
      { corruption: "retained_seal" as const, path: "invalid-v11-retained-seal.db" },
      { corruption: "goal_confirmation" as const, path: "invalid-v11-goal-confirmation.db" },
      {
        corruption: "anchor_no_change_payload" as const,
        path: "invalid-v11-anchor-no-change.db",
      },
      {
        corruption: "anchor_no_change_usability" as const,
        path: "invalid-v11-anchor-no-change-usability.db",
      },
      {
        corruption: "anchor_no_change_partial_source" as const,
        path: "invalid-v11-anchor-no-change-partial-source.db",
      },
      {
        corruption: "goal_operation_meaning" as const,
        path: "invalid-v11-goal-operation-meaning.db",
      },
      {
        corruption: "goal_replacement_target" as const,
        path: "invalid-v11-goal-replacement-target.db",
      },
      { corruption: "retained_error_code" as const, path: "invalid-v11-retained-error.db" },
      {
        corruption: "retained_error_detail" as const,
        path: "invalid-v11-retained-error-detail.db",
      },
    ]) {
      await run(
        Effect.gen(function* () {
          const db = yield* makeDb
          yield* initializeDatabaseV11(db, { corruption: fixture.corruption })

          const violatesFrozenCheck =
            fixture.corruption === "course_command_version" || fixture.corruption === "course_capability_version"
          const violatesDomainValidator =
            fixture.corruption === "anchor_no_change_usability" ||
            fixture.corruption === "anchor_no_change_partial_source" ||
            fixture.corruption === "goal_operation_meaning" ||
            fixture.corruption === "goal_replacement_target"
          const error =
            violatesFrozenCheck || violatesDomainValidator
              ? yield* Effect.flip(db.transaction((tx) => domainNeutralLearningCommandLedgerMigration.up(tx)))
              : yield* Effect.flip(DatabaseMigration.apply(db, { path: fixture.path }))

          if (violatesFrozenCheck) {
            expect(String(error)).toContain("cannot be represented by v12")
          } else if (violatesDomainValidator) {
            expect(String(error)).toContain("fail their domain validators")
          } else {
            expect(error).toMatchObject({
              _tag: "DatabaseMigrationError",
              migrationID: domainNeutralLearningCommandLedgerMigration.id,
              fromVersion: BASELINE_VERSION + 10,
              toVersion: BASELINE_VERSION + 11,
            })
          }
          expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
            user_version: BASELINE_VERSION + 10,
          })
          expect(
            yield* db.get(sql`
              SELECT
                (SELECT count(*) FROM learning_command_invocation) AS invocations,
                (SELECT count(*) FROM learning_command_receipt) AS receipts
            `),
          ).toEqual({ invocations: 10, receipts: 6 })
          expect(
            yield* db.get(sql`
              SELECT name
              FROM pragma_table_info('learning_command_invocation')
              WHERE name = 'goal_effect_id'
            `),
          ).toEqual({ name: "goal_effect_id" })
          expect(
            yield* db.get(sql`
              SELECT name FROM sqlite_schema
              WHERE type = 'table' AND name = 'learner_default_course_command'
            `),
          ).toBeUndefined()
        }),
      )
    }
  })

  test("rejects current-version trigger drift against the versioned structural manifest", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(sql`DROP TRIGGER course_selection_acceptance_commit_seal_validate_insert_v12`)
        yield* db.run(sql`
          CREATE TRIGGER course_selection_acceptance_commit_seal_validate_insert_v12
          BEFORE INSERT ON course_selection_acceptance_commit_seal
          BEGIN
            SELECT 1;
          END
        `)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "structural-drift.db" }))

        expect(error).toMatchObject({ reason: "corrupt" })
        if (error._tag !== "DatabaseAdmissionError") return yield* Effect.die("Expected database admission failure")
        expect(error.detail).toContain("changed: course_selection_acceptance_commit_seal_validate_insert_v12")
      }),
    )
  })

  test("builds the same Gate 16 Goal authority from Gate 15 without fabricating Goal state", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* learnerGoalSchema(db)

        yield* removeGate15(db)
        yield* db.run(sql.raw("PRAGMA foreign_keys = OFF"))
        yield* db.transaction((tx) => retainedSteeringMigration.up(tx))
        yield* db.run(sql.raw("PRAGMA foreign_keys = ON"))
        yield* db.run(sql`
          INSERT INTO repa_migration (version, id, time_completed)
          VALUES (${BASELINE_VERSION + 9}, ${retainedSteeringMigration.id}, 1)
        `)
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 9}`))

        const triggers = yield* db.all<{ name: string }>(sql`
          SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name
        `)
        yield* Effect.forEach(triggers, (trigger) => db.run(sql`DROP TRIGGER ${sql.identifier(trigger.name)}`), {
          discard: true,
        })
        const defaultConfirmation = JSON.stringify({
          permissionRequestID: "permission_gate16_default",
          headID: null,
          version: 0,
          fromCourseID: null,
          fromCourseTitle: null,
          target: {
            courseID: "crs_00000000000000000000000011",
            courseTitle: "Gate 16 migration fixture",
            courseVersion: 0,
            selectionRevisionID: null,
            selectionVersion: 0,
            viewID: null,
            viewName: null,
            viewVersion: null,
            revisionVersion: null,
          },
        })
        const courseSettlement = JSON.stringify({
          outcome: "applied",
          receiptID: "lcr_00000000000000000000000011",
          effectID: "cse_00000000000000000000000011",
          courseID: "crs_00000000000000000000000011",
          revisionID: "cvr_00000000000000000000000011",
          previousSelection: { version: 0 },
          committedSelection: { revisionID: "cvr_00000000000000000000000011", version: 1 },
          settlementTime: 11,
          settlementOrder: 1,
        })
        const representationSettlement = JSON.stringify({
          outcome: "applied",
          receiptID: "lcr_00000000000000000000000012",
          effectID: "rfx_00000000000000000000000011",
          representationRevisionID: "rep_00000000000000000000000011",
          effectiveArtifactID: "art_00000000000000000000000011",
          sourceRevisionID: "arv_00000000000000000000000011",
          producerKind: "configured_model",
          settlementTime: 12,
          settlementOrder: 2,
        })
        const defaultCurrent = {
          kind: "default_course_preference",
          headID: "ndp_00000000000000000000000011",
          version: 1,
          courseID: "crs_00000000000000000000000011",
          usability: { usable: true, title: "Gate 16 migration fixture" },
          source: {
            receiptID: "lcr_00000000000000000000000013",
            occurrenceID: "lco_00000000000000000000000013",
            originSessionID: "ses_gate16",
            originMessageID: "msg_gate16_default",
            assistantMessageID: "msg_gate16_assistant_default",
            invocationPartID: "prt_gate16_default",
            availability: "available",
          },
          timeCommitted: 13,
          commitOrder: 3,
          frontierSequence: 1,
        }
        const defaultSettlement = JSON.stringify({
          outcome: "applied",
          navigationKind: "default_course_preference",
          receiptID: "lcr_00000000000000000000000013",
          effectID: "ndp_00000000000000000000000011",
          effect: {
            id: "ndp_00000000000000000000000011",
            occurrenceID: "lco_00000000000000000000000013",
            previousCourseID: null,
            courseID: "crs_00000000000000000000000011",
            previousVersion: 0,
            version: 1,
            timeCommitted: 13,
            commitOrder: 3,
            frontierSequence: 1,
          },
          current: defaultCurrent,
          confirmation: JSON.parse(defaultConfirmation),
          settlementTime: 13,
          settlementOrder: 3,
        })
        const anchorCurrent = {
          kind: "course_route_anchor",
          courseID: "crs_00000000000000000000000011",
          headID: "nar_00000000000000000000000011",
          version: 1,
          target: {
            courseID: "crs_00000000000000000000000011",
            viewID: "cvw_00000000000000000000000011",
            revisionID: "cvr_00000000000000000000000011",
            itemID: "cit_00000000000000000000000011",
          },
          usability: { usable: true },
          source: {
            receiptID: "lcr_00000000000000000000000014",
            occurrenceID: "lco_00000000000000000000000014",
            originSessionID: "ses_gate16",
            originMessageID: "msg_gate16_anchor",
            assistantMessageID: "msg_gate16_assistant_anchor",
            invocationPartID: "prt_gate16_anchor",
            availability: "available",
          },
          timeCommitted: 14,
          commitOrder: 4,
          frontierSequence: 2,
        }
        const anchorSettlement = JSON.stringify({
          outcome: "applied",
          navigationKind: "course_route_anchor",
          receiptID: "lcr_00000000000000000000000014",
          effectID: "nar_00000000000000000000000011",
          effect: {
            id: "nar_00000000000000000000000011",
            occurrenceID: "lco_00000000000000000000000014",
            courseID: "crs_00000000000000000000000011",
            previousTarget: null,
            target: {
              courseID: "crs_00000000000000000000000011",
              viewID: "cvw_00000000000000000000000011",
              revisionID: "cvr_00000000000000000000000011",
              itemID: "cit_00000000000000000000000011",
            },
            previousVersion: 0,
            version: 1,
            timeCommitted: 14,
            commitOrder: 4,
            frontierSequence: 2,
          },
          current: anchorCurrent,
          settlementTime: 14,
          settlementOrder: 4,
        })
        const noChangeSettlement = JSON.stringify({
          outcome: "no_change",
          navigationKind: "course_route_anchor",
          current: anchorCurrent,
          settlementTime: 17,
          settlementOrder: 7,
        })
        const retainedSettlement = JSON.stringify({
          outcome: "applied",
          receiptID: "lcr_00000000000000000000000015",
          effectID: "rst_00000000000000000000000011",
          policyID: "rsp_00000000000000000000000011",
          version: 1,
          state: "operative",
          acknowledgementTitle: "Preference retained",
          acknowledgementBody: "Concrete examples will be used first.",
          settlementTime: 15,
          settlementOrder: 5,
        })
        const representationReplaySettlement = JSON.stringify({
          ...JSON.parse(representationSettlement),
          outcome: "already_applied",
          settlementTime: 16,
          settlementOrder: 6,
        })
        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.run("PRAGMA defer_foreign_keys = ON")
            yield* tx.run(sql`
              INSERT INTO learning_occurrence_source_order (
                sequence, occurrence_id, origin_session_id, origin_message_id, time_allocated,
                source_temporal_state, source_timezone, source_utc_offset_minutes
              ) VALUES
                (1, 'lco_00000000000000000000000011', 'ses_gate16', 'msg_gate16_course', 1, 'resolved', 'UTC', 0),
                (2, 'lco_00000000000000000000000012', 'ses_gate16', 'msg_gate16_representation', 2, 'resolved', 'UTC', 0),
                (3, 'lco_00000000000000000000000013', 'ses_gate16', 'msg_gate16_default', 3, 'resolved', 'UTC', 0),
                (4, 'lco_00000000000000000000000014', 'ses_gate16', 'msg_gate16_anchor', 4, 'resolved', 'UTC', 0),
                (5, 'lco_00000000000000000000000015', 'ses_gate16', 'msg_gate16_retained', 5, 'resolved', 'UTC', 0),
                (6, 'lco_00000000000000000000000016', 'ses_gate16', 'msg_gate16_no_change', 6, 'resolved', 'UTC', 0),
                (7, 'lco_00000000000000000000000017', 'ses_gate16', 'msg_gate16_error', 7, 'resolved', 'UTC', 0),
                (8, 'lco_00000000000000000000000018', 'ses_gate16', 'msg_gate16_admitted', 8, 'resolved', 'UTC', 0)
            `)
            yield* tx.run(sql`
              INSERT INTO learning_admitted_occurrence (
                id, origin_session_id, origin_message_id, time_admitted, source_order,
                source_temporal_state, source_timezone, source_utc_offset_minutes
              ) VALUES
                ('lco_00000000000000000000000011', 'ses_gate16', 'msg_gate16_course', 1, 1, 'resolved', 'UTC', 0),
                ('lco_00000000000000000000000012', 'ses_gate16', 'msg_gate16_representation', 2, 2, 'resolved', 'UTC', 0),
                ('lco_00000000000000000000000013', 'ses_gate16', 'msg_gate16_default', 3, 3, 'resolved', 'UTC', 0),
                ('lco_00000000000000000000000014', 'ses_gate16', 'msg_gate16_anchor', 4, 4, 'resolved', 'UTC', 0),
                ('lco_00000000000000000000000015', 'ses_gate16', 'msg_gate16_retained', 5, 5, 'resolved', 'UTC', 0),
                ('lco_00000000000000000000000016', 'ses_gate16', 'msg_gate16_no_change', 6, 6, 'resolved', 'UTC', 0),
                ('lco_00000000000000000000000017', 'ses_gate16', 'msg_gate16_error', 7, 7, 'resolved', 'UTC', 0),
                ('lco_00000000000000000000000018', 'ses_gate16', 'msg_gate16_admitted', 8, 8, 'resolved', 'UTC', 0)
            `)
            yield* tx.run(sql`
              INSERT INTO course (id, title, state_version, time_created, time_updated)
              VALUES ('crs_00000000000000000000000011', 'Gate 16 migration fixture', 0, 1, 1)
            `)
            yield* tx.run(sql`
              INSERT INTO course_view (id, course_id, name, state_version, time_created, time_updated)
              VALUES ('cvw_00000000000000000000000011', 'crs_00000000000000000000000011', 'Gate 16 view', 0, 1, 1)
            `)
            yield* tx.run(sql`
              INSERT INTO course_view_revision (
                id, course_id, view_id, revision_number, authorship_basis, time_created
              ) VALUES ('cvr_00000000000000000000000011', 'crs_00000000000000000000000011', 'cvw_00000000000000000000000011', 1, 'learner_directed', 1)
            `)
            yield* tx.run(sql`
              INSERT INTO course_view_revision_state (
                course_id, view_id, revision_id, state_version, time_updated
              ) VALUES ('crs_00000000000000000000000011', 'cvw_00000000000000000000000011', 'cvr_00000000000000000000000011', 0, 1)
            `)
            yield* tx.run(sql`
              INSERT INTO course_item (id, course_id, time_created)
              VALUES ('cit_00000000000000000000000011', 'crs_00000000000000000000000011', 1)
            `)
            yield* tx.run(sql`
              INSERT INTO course_view_revision_item (
                course_id, view_id, revision_id, item_id, title, preorder_position, depth
              ) VALUES (
                'crs_00000000000000000000000011', 'cvw_00000000000000000000000011', 'cvr_00000000000000000000000011', 'cit_00000000000000000000000011', 'Gate 16 item', 0, 0
              )
            `)
            yield* tx.run(sql`
              INSERT INTO course_selection_acceptance_effect (
                id, occurrence_id, course_id, accepted_revision_id, previous_selection_version,
                committed_selection_version, time_committed
              ) VALUES (
                'cse_00000000000000000000000011', 'lco_00000000000000000000000011', 'crs_00000000000000000000000011', 'cvr_00000000000000000000000011', 0, 1, 11
              )
            `)
            yield* tx.run(sql`
              INSERT INTO artifact (
                id, admission_root_artifact_id, creation_basis, creation_capability_identity,
                creation_capability_version, disposition_version, lineage_version,
                correction_hidden, time_created, time_updated
              ) VALUES (
                'art_00000000000000000000000011', 'art_00000000000000000000000011', 'learner_instruction',
                'gate16-fixture', 1, 0, 0, 0, 1, 1
              )
            `)
            yield* tx.run(sql`
              INSERT INTO artifact_revision (
                id, recorded_artifact_id, fingerprint_algorithm, fingerprint_digest,
                byte_length, time_first_observed
              ) VALUES (
                'arv_00000000000000000000000011', 'art_00000000000000000000000011', 'sha256',
                ${"a".repeat(64)}, 1, 1
              )
            `)
            yield* tx.run(sql`
              INSERT INTO content_root (id, time_created)
              VALUES ('content_root_gate16', 1)
            `)
            yield* tx.run(sql`
              INSERT INTO content_root_binding (
                id, content_root_id, canonical_path, canonical_path_key, platform,
                volume_serial, object_id, creation_time, initial_change_time,
                verifier_version, time_created
              ) VALUES (
                'content_binding_gate16', 'content_root_gate16', 'C:\\gate16', 'c:\\gate16',
                'windows_ntfs', 'volume-gate16', '0123456789abcdef0123456789abcdef',
                'creation-gate16', 'change-gate16', 1, 1
              )
            `)
            yield* tx.run(sql`
              INSERT INTO content_root_binding_episode (
                id, content_root_id, binding_id, ordinal, approval_basis, time_started
              ) VALUES (
                'content_binding_episode_gate16', 'content_root_gate16',
                'content_binding_gate16', 1, 'learner approval', 1
              )
            `)
            yield* tx.run(sql`
              INSERT INTO content_root_grant_episode (
                id, content_root_id, binding_id, binding_episode_id, ordinal,
                approval_basis, time_approved, time_updated
              ) VALUES (
                'content_grant_episode_gate16', 'content_root_gate16',
                'content_binding_gate16', 'content_binding_episode_gate16', 1,
                'learner approval', 1, 1
              )
            `)
            yield* tx.run(sql`
              INSERT INTO representation_effect (id, operation_identity, semantic_fingerprint, time_committed)
              VALUES ('rfx_00000000000000000000000011', 'gate16-operation', ${"2".repeat(64)}, 12)
            `)
            yield* tx.run(sql`
              INSERT INTO representation_revision (
                id, effect_id, source_revision_id, effective_artifact_id, attribution_type,
                accepted_disposition_version, accepted_lineage_version, source_version,
                source_media_type, source_digest, source_byte_length, content_root_id,
                content_root_binding_id, content_root_binding_episode_id,
                content_root_binding_episode_ordinal, content_root_grant_episode_id,
                content_root_grant_version, normalized_relative_path, source_object_platform,
                source_object_verifier_version, source_object_canonical_path,
                source_object_canonical_path_key, source_object_volume_serial, source_object_id,
                source_object_creation_time, source_object_change_time,
                source_object_last_write_time, source_object_size, source_object_kind,
                source_observed_time, presented_input_digest, presented_input_byte_length,
                producer_kind, producer_identity, producer_version, provider_id, model_id,
                task_version, profile, canonicalizer_version, provenance_version, provenance,
                run_identity, result_boundary, terminal_status, diagnostics, usage,
                output_media_type, storage_key, output_digest, output_byte_length,
                profile_record_count, acceptance_basis, creation_basis, creation_identity,
                authorization_intent, authorization_basis, delivery_mode,
                causal_occurrence_id, causal_invocation_part_id, time_accepted
              ) VALUES (
                'rep_00000000000000000000000011', 'rfx_00000000000000000000000011',
                'arv_00000000000000000000000011', 'art_00000000000000000000000011', 'recorded', 0, 0, 0,
                'application/pdf', ${"a".repeat(64)}, 1, 'content_root_gate16',
                'content_binding_gate16', 'content_binding_episode_gate16', 1,
                'content_grant_episode_gate16', 1, 'source.pdf', 'windows_ntfs', 1,
                'C:\\gate16\\source.pdf', 'c:\\gate16\\source.pdf', 'volume-gate16',
                '0123456789abcdef0123456789abcdef', 'creation-gate16', 'change-gate16',
                'write-gate16', 1, 'file', 2, ${"a".repeat(64)}, 1, 'configured_model',
                'gate16-model', '1', 'gate16-provider', 'gate16-model', 1,
                'repa.model-rendition.v1', 1, 1, '{}', 'run-gate16', 'model_schema_v1',
                'stop', '[]', '{}', 'text/markdown', 'representation-gate16.md',
                ${"b".repeat(64)}, 1, 1, 'model_claimed_rendition', 'learning_command',
                'gate16-operation', 'persistent_readable_access', 'learner_request',
                'model_tool', 'lco_00000000000000000000000012', 'prt_gate16_representation', 12
              )
            `)
            yield* tx.run(sql`
              INSERT INTO learner_default_course_transition (
                id, version, previous_course_id, course_id, occurrence_id, permission_request_id,
                confirmation_snapshot, target_course_version, target_selection_version,
                time_committed, commit_order, frontier_sequence, frontier_time
              ) VALUES (
                'ndp_00000000000000000000000011', 1, NULL, 'crs_00000000000000000000000011', 'lco_00000000000000000000000013',
                'permission_gate16_default', ${defaultConfirmation}, 0, 0,
                13, 3, 1, 13
              )
            `)
            yield* tx.run(sql`
              INSERT INTO learner_course_route_anchor_transition (
                id, course_id, version, target_view_id, target_revision_id, target_item_id,
                occurrence_id, target_course_version, target_selection_version, target_view_version,
                target_revision_version, time_committed, commit_order, frontier_sequence, frontier_time
              ) VALUES (
                'nar_00000000000000000000000011', 'crs_00000000000000000000000011', 1, 'cvw_00000000000000000000000011', 'cvr_00000000000000000000000011',
                'cit_00000000000000000000000011', 'lco_00000000000000000000000014', 0, 0, 0, 0, 14, 4, 2, 14
              )
            `)
            yield* tx.run(sql`
              INSERT INTO retained_steering_state (singleton, steering_revision, latest_cut_as_of)
              VALUES (1, 1, 5)
            `)
            yield* tx.run(sql`
              INSERT INTO retained_steering_policy (id, time_created)
              VALUES ('rsp_00000000000000000000000011', 5)
            `)
            yield* tx.run(sql`
              INSERT INTO retained_steering_transition (
                id, commit_seal_id, policy_id, version, previous_state, occurrence_id, source_order,
                state, scope, source_excerpt, operative_instruction, learner_reason, effective_from,
                valid_until, valid_until_source, valid_until_normalized, boundary_timezone,
                boundary_utc_offset_minutes, semantic_fingerprint, steering_revision, time_committed,
                commit_order, frontier_sequence, frontier_time, acknowledgement_title,
                acknowledgement_body
              ) VALUES (
                'rst_00000000000000000000000011', 'rst_00000000000000000000000011', 'rsp_00000000000000000000000011', 1, 'absent',
                'lco_00000000000000000000000015', 5, 'operative', 'learning_wide', 'Keep examples concrete',
                'Use concrete examples first', 'I learn faster that way', 5, 500,
                'until the course ends', '1970-01-01T00:08:20.000Z', 'UTC', 0,
                ${"5".repeat(64)}, 1, 15, 5, 3, 15, 'Preference retained',
                'Concrete examples will be used first.'
              )
            `)
            yield* tx.run(sql`
              INSERT INTO learning_command_invocation (
                part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
                occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
                capability_version, authorization_basis, input_fingerprint,
                retained_steering_semantic_fingerprint, status, effect_id, representation_effect_id,
                default_navigation_effect_id, anchor_navigation_effect_id,
                retained_steering_effect_id, permission_request_id, settlement, time_admitted,
                time_settled, settlement_order, turn_id, input_id
              ) VALUES
                (
                  'prt_gate16_course', 'ses_gate16', 'msg_gate16_course', 'msg_gate16_assistant_course',
                  'call-gate16-course', 'lco_00000000000000000000000011', 'accept_course_view_revision', 1, 0,
                  'accept_course_view_revision', 1, 'learner_request', ${"1".repeat(64)}, NULL,
                  'applied', 'cse_00000000000000000000000011', NULL, NULL, NULL, NULL, NULL,
                  ${courseSettlement},
                  1, 11, 1, NULL, NULL
                ),
                (
                  'prt_gate16_representation', 'ses_gate16', 'msg_gate16_representation',
                  'msg_gate16_assistant_representation', 'call-gate16-representation',
                  'lco_00000000000000000000000012', 'representation.convert', 1, 0,
                  'representation.convert', 1, 'learner_request', ${"2".repeat(64)}, NULL,
                  'applied', NULL, 'rfx_00000000000000000000000011', NULL, NULL, NULL, NULL,
                  ${representationSettlement},
                  2, 12, 2,
                  'turn-gate16-representation', 'input-gate16-representation'
                ),
                (
                  'prt_gate16_default', 'ses_gate16', 'msg_gate16_default',
                  'msg_gate16_assistant_default', 'call-gate16-default', 'lco_00000000000000000000000013',
                  'set_default_course_preference', 1, 0, 'set_default_course_preference', 1,
                  'learner_acceptance', ${"3".repeat(64)}, NULL, 'applied', NULL, NULL,
                  'ndp_00000000000000000000000011', NULL, NULL, 'permission_gate16_default',
                  ${defaultSettlement},
                  3, 13, 3,
                  'turn-gate16-default', 'input-gate16-default'
                ),
                (
                  'prt_gate16_anchor', 'ses_gate16', 'msg_gate16_anchor',
                  'msg_gate16_assistant_anchor', 'call-gate16-anchor', 'lco_00000000000000000000000014',
                  'set_course_route_anchor', 1, 0, 'set_course_route_anchor', 1, 'learner_request',
                  ${"4".repeat(64)}, NULL, 'applied', NULL, NULL, NULL, 'nar_00000000000000000000000011',
                  NULL, NULL,
                  ${anchorSettlement},
                  4, 14, 4, 'turn-gate16-anchor', 'input-gate16-anchor'
                ),
                (
                  'prt_gate16_retained', 'ses_gate16', 'msg_gate16_retained',
                  'msg_gate16_assistant_retained', 'call-gate16-retained', 'lco_00000000000000000000000015',
                  'update_retained_learning_steering', 1, 0, 'update_retained_learning_steering', 1,
                  'learner_request', ${"5".repeat(64)}, ${"5".repeat(64)}, 'applied', NULL, NULL,
                  NULL, NULL, 'rst_00000000000000000000000011', NULL,
                  ${retainedSettlement},
                  5, 15, 5,
                  'turn-gate16-retained', 'input-gate16-retained'
                ),
                (
                  'prt_gate16_replay', 'ses_gate16', 'msg_gate16_representation',
                  'msg_gate16_assistant_replay', 'call-gate16-replay', 'lco_00000000000000000000000012',
                  'representation.convert', 1, 0, 'representation.convert', 1, 'learner_request',
                  ${"6".repeat(64)}, NULL, 'already_applied', NULL, 'rfx_00000000000000000000000011',
                  NULL, NULL, NULL, NULL,
                  ${representationReplaySettlement},
                  6, 16, 6, NULL, NULL
                ),
                (
                  'prt_gate16_no_change', 'ses_gate16', 'msg_gate16_no_change',
                  'msg_gate16_assistant_no_change', 'call-gate16-no-change', 'lco_00000000000000000000000016',
                  'set_course_route_anchor', 1, 0, 'set_course_route_anchor', 1, 'learner_request',
                  ${"7".repeat(64)}, NULL, 'no_change', NULL, NULL, NULL, NULL, NULL, NULL,
                  ${noChangeSettlement},
                  7, 17, 7, 'turn-gate16-no-change',
                  'input-gate16-no-change'
                ),
                (
                  'prt_gate16_error', 'ses_gate16', 'msg_gate16_error',
                  'msg_gate16_assistant_error', 'call-gate16-error', 'lco_00000000000000000000000017',
                  'update_retained_learning_steering', 1, 0, 'update_retained_learning_steering', 1,
                  'learner_request', ${"8".repeat(64)}, ${"8".repeat(64)}, 'error', NULL, NULL,
                  NULL, NULL, NULL, NULL,
                  '{"outcome":"error","code":"validation_error","settlementTime":18,"settlementOrder":8}',
                  8, 18, 8, 'turn-gate16-error', 'input-gate16-error'
                ),
                (
                  'prt_gate16_admitted', 'ses_gate16', 'msg_gate16_admitted',
                  'msg_gate16_assistant_admitted', 'call-gate16-admitted', 'lco_00000000000000000000000018',
                  'update_retained_learning_steering', 1, 0, 'update_retained_learning_steering', 1,
                  'learner_request', ${"9".repeat(64)}, ${"9".repeat(64)}, 'admitted', NULL, NULL,
                  NULL, NULL, NULL, NULL, NULL, 8, NULL, NULL, 'turn-gate16-admitted',
                  'input-gate16-admitted'
                )
            `)
            yield* tx.run(sql`
              INSERT INTO learning_command_receipt (
                id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
                invocation_part_id, capability_identity, capability_version, authorization_basis,
                effect_id, representation_effect_id, default_navigation_effect_id,
                anchor_navigation_effect_id, retained_steering_effect_id, permission_request_id,
                confirmation_snapshot, time_committed, commit_order
              ) VALUES
                (
                  'lcr_00000000000000000000000011', 'lco_00000000000000000000000011', 'ses_gate16', 'msg_gate16_course',
                  'msg_gate16_assistant_course', 'prt_gate16_course', 'accept_course_view_revision',
                  1, 'learner_request', 'cse_00000000000000000000000011', NULL, NULL, NULL, NULL, NULL, NULL, 11, 1
                ),
                (
                  'lcr_00000000000000000000000012', 'lco_00000000000000000000000012', 'ses_gate16',
                  'msg_gate16_representation', 'msg_gate16_assistant_representation',
                  'prt_gate16_representation', 'representation.convert', 1, 'learner_request',
                  NULL, 'rfx_00000000000000000000000011', NULL, NULL, NULL, NULL, NULL, 12, 2
                ),
                (
                  'lcr_00000000000000000000000013', 'lco_00000000000000000000000013', 'ses_gate16', 'msg_gate16_default',
                  'msg_gate16_assistant_default', 'prt_gate16_default',
                  'set_default_course_preference', 1, 'learner_acceptance', NULL, NULL,
                  'ndp_00000000000000000000000011', NULL, NULL, 'permission_gate16_default',
                  ${defaultConfirmation}, 13, 3
                ),
                (
                  'lcr_00000000000000000000000014', 'lco_00000000000000000000000014', 'ses_gate16', 'msg_gate16_anchor',
                  'msg_gate16_assistant_anchor', 'prt_gate16_anchor', 'set_course_route_anchor',
                  1, 'learner_request', NULL, NULL, NULL, 'nar_00000000000000000000000011', NULL, NULL, NULL, 14, 4
                ),
                (
                  'lcr_00000000000000000000000015', 'lco_00000000000000000000000015', 'ses_gate16',
                  'msg_gate16_retained', 'msg_gate16_assistant_retained', 'prt_gate16_retained',
                  'update_retained_learning_steering', 1, 'learner_request', NULL, NULL, NULL,
                  NULL, 'rst_00000000000000000000000011', NULL, NULL, 15, 5
                )
            `)
            yield* tx.run(sql`
              INSERT INTO retained_steering_commit_seal (
                transition_id, receipt_id, invocation_part_id
              ) VALUES (
                'rst_00000000000000000000000011', 'lcr_00000000000000000000000015', 'prt_gate16_retained'
              )
            `)
          }),
        )
        yield* db.transaction((tx) => installSchemaExtrasV10(tx))

        const preservedRows = () =>
          Effect.all({
            invocations: db.all<Record<string, unknown>>(sql`
              SELECT part_id, session_id, parent_user_message_id, assistant_message_id,
                     provider_call_id, occurrence_id, command_name, command_version,
                     emission_ordinal, capability_identity, capability_version,
                     authorization_basis, input_fingerprint,
                     retained_steering_semantic_fingerprint, status, effect_id,
                     representation_effect_id, default_navigation_effect_id,
                     anchor_navigation_effect_id, retained_steering_effect_id,
                     permission_request_id, settlement, time_admitted, time_settled,
                     settlement_order, turn_id, input_id
              FROM learning_command_invocation ORDER BY part_id
            `),
            receipts: db.all<Record<string, unknown>>(sql`
              SELECT id, occurrence_id, origin_session_id, origin_message_id,
                     assistant_message_id, invocation_part_id, capability_identity,
                     capability_version, authorization_basis, effect_id,
                     representation_effect_id, default_navigation_effect_id,
                     anchor_navigation_effect_id, retained_steering_effect_id,
                     permission_request_id, confirmation_snapshot, time_committed, commit_order
              FROM learning_command_receipt ORDER BY id
            `),
          })
        const before = yield* preservedRows()
        expect(before.invocations).toHaveLength(9)
        expect(before.receipts).toHaveLength(5)
        expect(
          yield* db.all(sql`
            SELECT status, count(*) AS count
            FROM learning_command_invocation GROUP BY status ORDER BY status
          `),
        ).toEqual([
          { status: "admitted", count: 1 },
          { status: "already_applied", count: 1 },
          { status: "applied", count: 5 },
          { status: "error", count: 1 },
          { status: "no_change", count: 1 },
        ])
        expect(
          yield* db.all(sql`
            SELECT capability_identity, effect_id, representation_effect_id,
                   default_navigation_effect_id, anchor_navigation_effect_id,
                   retained_steering_effect_id
            FROM learning_command_receipt ORDER BY capability_identity
          `),
        ).toEqual([
          {
            capability_identity: "accept_course_view_revision",
            effect_id: "cse_00000000000000000000000011",
            representation_effect_id: null,
            default_navigation_effect_id: null,
            anchor_navigation_effect_id: null,
            retained_steering_effect_id: null,
          },
          {
            capability_identity: "representation.convert",
            effect_id: null,
            representation_effect_id: "rfx_00000000000000000000000011",
            default_navigation_effect_id: null,
            anchor_navigation_effect_id: null,
            retained_steering_effect_id: null,
          },
          {
            capability_identity: "set_course_route_anchor",
            effect_id: null,
            representation_effect_id: null,
            default_navigation_effect_id: null,
            anchor_navigation_effect_id: "nar_00000000000000000000000011",
            retained_steering_effect_id: null,
          },
          {
            capability_identity: "set_default_course_preference",
            effect_id: null,
            representation_effect_id: null,
            default_navigation_effect_id: "ndp_00000000000000000000000011",
            anchor_navigation_effect_id: null,
            retained_steering_effect_id: null,
          },
          {
            capability_identity: "update_retained_learning_steering",
            effect_id: null,
            representation_effect_id: null,
            default_navigation_effect_id: null,
            anchor_navigation_effect_id: null,
            retained_steering_effect_id: "rst_00000000000000000000000011",
          },
        ])
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
        expect(yield* db.get(sql`PRAGMA integrity_check`)).toEqual({ integrity_check: "ok" })
        yield* DatabaseMigration.apply(db)

        expect(yield* learnerGoalSchema(db)).toEqual(fresh)
        expect(
          yield* db.all<Record<string, unknown>>(sql`
            SELECT part_id, session_id, parent_user_message_id, assistant_message_id,
                   provider_call_id, occurrence_id, command_name, command_version,
                   emission_ordinal, capability_identity, capability_version,
                   authorization_basis, input_fingerprint, status, receipt_id, settlement,
                   time_admitted, time_settled, settlement_order, turn_id, input_id
            FROM learning_command_invocation ORDER BY part_id
          `),
        ).toEqual(
          before.invocations.map((row) => ({
            part_id: row.part_id,
            session_id: row.session_id,
            parent_user_message_id: row.parent_user_message_id,
            assistant_message_id: row.assistant_message_id,
            provider_call_id: row.provider_call_id,
            occurrence_id: row.occurrence_id,
            command_name: row.command_name,
            command_version: row.command_version,
            emission_ordinal: row.emission_ordinal,
            capability_identity: row.capability_identity,
            capability_version: row.capability_version,
            authorization_basis: row.authorization_basis,
            input_fingerprint: row.input_fingerprint,
            status: row.status,
            receipt_id:
              row.status === "applied" || row.status === "already_applied"
                ? (JSON.parse(row.settlement as string).receiptID as string)
                : null,
            settlement: row.settlement,
            time_admitted: row.time_admitted,
            time_settled: row.time_settled,
            settlement_order: row.settlement_order,
            turn_id: row.turn_id,
            input_id: row.input_id,
          })),
        )
        expect(
          yield* db.all<Record<string, unknown>>(sql`
            SELECT id, occurrence_id, origin_session_id, origin_message_id,
                   assistant_message_id, invocation_part_id, capability_identity,
                   capability_version, authorization_basis, time_committed, commit_order
            FROM learning_command_receipt ORDER BY id
          `),
        ).toEqual(
          before.receipts.map((row) => ({
            id: row.id,
            occurrence_id: row.occurrence_id,
            origin_session_id: row.origin_session_id,
            origin_message_id: row.origin_message_id,
            assistant_message_id: row.assistant_message_id,
            invocation_part_id: row.invocation_part_id,
            capability_identity: row.capability_identity,
            capability_version: row.capability_version,
            authorization_basis: row.authorization_basis,
            time_committed: row.time_committed,
            commit_order: row.commit_order,
          })),
        )
        expect(
          yield* db.all(sql`
            SELECT 'course' AS kind, effect_id, receipt_id, invocation_part_id
            FROM course_selection_acceptance_commit_seal
            UNION ALL
            SELECT 'representation', effect_id, receipt_id, invocation_part_id
            FROM representation_command_commit_seal
            UNION ALL
            SELECT 'default', effect_id, receipt_id, invocation_part_id
            FROM learner_default_course_commit_seal
            UNION ALL
            SELECT 'anchor', effect_id, receipt_id, invocation_part_id
            FROM learner_course_route_anchor_commit_seal
            UNION ALL
            SELECT 'retained', transition_id, receipt_id, invocation_part_id
            FROM retained_steering_commit_seal
            ORDER BY kind
          `),
        ).toEqual([
          {
            kind: "anchor",
            effect_id: "nar_00000000000000000000000011",
            receipt_id: "lcr_00000000000000000000000014",
            invocation_part_id: "prt_gate16_anchor",
          },
          {
            kind: "course",
            effect_id: "cse_00000000000000000000000011",
            receipt_id: "lcr_00000000000000000000000011",
            invocation_part_id: "prt_gate16_course",
          },
          {
            kind: "default",
            effect_id: "ndp_00000000000000000000000011",
            receipt_id: "lcr_00000000000000000000000013",
            invocation_part_id: "prt_gate16_default",
          },
          {
            kind: "representation",
            effect_id: "rfx_00000000000000000000000011",
            receipt_id: "lcr_00000000000000000000000012",
            invocation_part_id: "prt_gate16_representation",
          },
          {
            kind: "retained",
            effect_id: "rst_00000000000000000000000011",
            receipt_id: "lcr_00000000000000000000000015",
            invocation_part_id: "prt_gate16_retained",
          },
        ])
        expect(yield* db.all(sql`SELECT * FROM course_state_history ORDER BY course_id, version`)).toEqual([
          {
            course_id: "crs_00000000000000000000000011",
            version: 0,
            title: "Gate 16 migration fixture",
            withdrawal_reason: null,
            time_updated: 1,
          },
        ])
        expect(yield* db.get(sql`SELECT * FROM learner_goal_time_zone_release`)).toEqual({
          id: "iana-tzdb-2026c",
          tzdb_version: "2026c",
          engine: "timezonecomplete@5.15.1+tzdata@1.0.50",
          data_sha256: "a4220c6c6efab292e7aac7dbe8d771cfc619e99b9235ed3e54d17445c232f995",
        })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_time_zone`)).toEqual({ count: 598 })
        expect(yield* db.all(sql`SELECT id FROM learner_goal`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM learner_goal_revision`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM learner_goal_effect`)).toEqual([])
        expect(yield* db.all(sql`SELECT effect_id FROM learner_goal_commit_seal`)).toEqual([])
        expect(yield* db.all(sql`SELECT invocation_part_id FROM learner_goal_command`)).toEqual([])
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
        expect(yield* db.get(sql`PRAGMA integrity_check`)).toEqual({ integrity_check: "ok" })
      }),
    )
  })

  test("builds the same Gate 15 authority from Gate 14 without qualifying legacy sources or model operations", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* retainedSteeringSchema(db)

        yield* removeGate15(db)
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 8}`))
        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.run("PRAGMA defer_foreign_keys = ON")
            yield* tx.run(sql`
              INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
              VALUES ('gate14-project', '/learning', 1, 1, '[]')
            `)
            yield* tx.run(sql`
              INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
              VALUES ('gate14-session', 'gate14-project', 'legacy', '/learning', 'Legacy Gate 14', 'test', 1, 1)
            `)
            yield* tx.run(sql`
              INSERT INTO message (id, session_id, time_created, time_updated, data)
              VALUES
                ('msg_gate14_user', 'gate14-session', 1, 1, '{"role":"user"}'),
                ('msg_gate14_assistant', 'gate14-session', 2, 2,
                 '{"role":"assistant","parentID":"msg_gate14_user"}')
            `)
            yield* tx.run(sql`
              INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
              VALUES ('prt_gate14_user', 'msg_gate14_user', 'gate14-session', 1, 1,
                      '{"type":"text","text":"legacy learner input"}')
            `)
            yield* tx.run(sql`
              INSERT INTO learning_admitted_occurrence (
                id, origin_session_id, origin_message_id, time_admitted
              ) VALUES ('occ_gate14_legacy', 'gate14-session', 'msg_gate14_user', 1)
            `)
            yield* tx.run(sql`
              INSERT INTO learning_occurrence_presentation (
                message_id, session_id, occurrence_id, provenance, content_fingerprint, time_created
              ) VALUES (
                'msg_gate14_user', 'gate14-session', 'occ_gate14_legacy', 'origin', ${"a".repeat(64)}, 1
              )
            `)
            yield* tx.run(sql`
              INSERT INTO turn_input (
                id, turn_id, session_id, message_id, source, ordinal, occurrence_id,
                time_admitted, envelope_fingerprint
              ) VALUES (
                'input_gate14_legacy', 'turn_gate14_legacy', 'gate14-session', 'msg_gate14_user',
                'learner_root', 0, 'occ_gate14_legacy', 1, ${"b".repeat(64)}
              )
            `)
            yield* tx.run(sql`
              INSERT INTO turn_input_presentation (input_id, message_id, session_id)
              VALUES ('input_gate14_legacy', 'msg_gate14_user', 'gate14-session')
            `)
            yield* tx.run(sql`
              INSERT INTO turn (
                id, session_id, admission_kind, initial_input_id, current_input_id,
                model_limit, tool_limit, model_count, tool_count, state, depth,
                normalized_envelope, envelope_fingerprint, policy_basis, time_admitted, causal_time
              ) VALUES (
                'turn_gate14_legacy', 'gate14-session', 'learner', 'input_gate14_legacy',
                'input_gate14_legacy', 2, 0, 1, 0, 'running', 0, '{}', ${"c".repeat(64)}, '{}', 1, 2
              )
            `)
            yield* tx.run(sql`
              INSERT INTO turn_model_operation (
                assistant_message_id, turn_id, session_id, input_id, causal_occurrence_id, ordinal,
                state, request_fingerprint, context_fingerprint, snapshot_frontier_sequence,
                snapshot_frontier_time, observed_shared_frontier_sequence, observed_shared_frontier_time,
                time_admitted, candidates_sealed
              ) VALUES (
                'msg_gate14_assistant', 'turn_gate14_legacy', 'gate14-session', 'input_gate14_legacy',
                'occ_gate14_legacy', 0, 'running', ${"d".repeat(64)}, ${"e".repeat(64)}, 0, 0, 0, 0, 2, 0
              )
            `)
            yield* tx.run(sql`
              INSERT INTO turn_model_presentation (assistant_message_id, session_id)
              VALUES ('msg_gate14_assistant', 'gate14-session')
            `)
          }),
        )

        yield* DatabaseMigration.apply(db)

        expect(yield* retainedSteeringSchema(db)).toEqual(fresh)
        expect(
          yield* db.get(sql`
            SELECT source_order, source_temporal_state, source_timezone, source_utc_offset_minutes,
                   source_temporal_unavailable_reason
            FROM learning_admitted_occurrence WHERE id = 'occ_gate14_legacy'
          `),
        ).toEqual({
          source_order: null,
          source_temporal_state: null,
          source_timezone: null,
          source_utc_offset_minutes: null,
          source_temporal_unavailable_reason: null,
        })
        expect(
          yield* db.get(sql`
            SELECT retained_steering_cut, retained_steering_cut_fingerprint, retained_steering_cut_as_of
            FROM turn_model_operation WHERE assistant_message_id = 'msg_gate14_assistant'
          `),
        ).toEqual({
          retained_steering_cut: null,
          retained_steering_cut_fingerprint: null,
          retained_steering_cut_as_of: null,
        })
        expect(yield* db.all(sql`SELECT sequence FROM learning_occurrence_source_order`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM retained_steering_policy`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM retained_steering_transition`)).toEqual([])
        expect(yield* db.all(sql`SELECT singleton FROM retained_steering_state`)).toEqual([])
        expect(
          yield* Effect.flip(
            db.run(sql`
              INSERT INTO learning_admitted_occurrence (
                id, origin_session_id, origin_message_id, time_admitted
              ) VALUES ('occ_gate15_missing_context', 'gate14-session', 'msg_gate14_assistant', 3)
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })

        const sessionID = SessionSchema.ID.create()
        const resolvedMessageID = SessionV1.MessageID.ascending("msg_gate15_resolved")
        const resolvedPartID = SessionV1.PartID.ascending("prt_gate15_resolved")
        const unavailableMessageID = SessionV1.MessageID.ascending("msg_gate15_unavailable")
        const unavailablePartID = SessionV1.PartID.ascending("prt_gate15_unavailable")
        yield* db.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES (${sessionID}, 'gate14-project', 'post-upgrade', '/learning', 'Post-upgrade Gate 15', 'test', 9, 9)
        `)
        yield* db.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data)
          VALUES
            (${resolvedMessageID}, ${sessionID}, 10, 10, '{"role":"user"}'),
            (${unavailableMessageID}, ${sessionID}, 11, 11, '{"role":"user"}')
        `)
        yield* db.run(sql`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES
            (${resolvedPartID}, ${resolvedMessageID}, ${sessionID}, 10, 10,
             '{"type":"text","text":"resolved source"}'),
            (${unavailablePartID}, ${unavailableMessageID}, ${sessionID}, 11, 11,
             '{"type":"text","text":"unavailable source"}')
        `)
        const admitted = yield* db.transaction((tx) =>
          Effect.all([
            Occurrence.admit(tx, {
              admission: LearnerAdmission.interactive({ timeZone: "UTC", instant: 10 }),
              sessionID,
              messageID: resolvedMessageID,
              timeAdmitted: 10,
            }),
            Occurrence.admit(tx, {
              admission: LearnerAdmission.interactive({ timeZone: null, instant: 11 }),
              sessionID,
              messageID: unavailableMessageID,
              timeAdmitted: 11,
            }),
          ]),
        )
        expect(admitted.map((item) => [item.sourceOrder, item.sourceTemporalContext])).toEqual([
          [1, { state: "resolved", instant: 10, timeZone: "UTC", utcOffsetMinutes: 0 }],
          [2, { state: "unavailable", instant: 11, reason: "timezone_unavailable" }],
        ])
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("builds the same Gate 14 schema from Gate 13 without fabricating navigation", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* learnerNavigationSchema(db)
        const freshTableStorage = yield* db.all<{ name: string; wr: number }>(sql`
          SELECT name, wr
          FROM pragma_table_list
          WHERE name IN (
            'learner_default_course_acknowledgement',
            'learner_default_course_disposition',
            'learner_default_course_capability_issue',
            'learner_default_course_capability_settlement',
            'learner_default_course_proposal',
            'learner_default_course_transition',
            'learner_course_route_anchor_transition',
            'learning_command_receipt'
          )
          ORDER BY name
        `)
        expect(freshTableStorage).toEqual([
          { name: "learner_course_route_anchor_transition", wr: 1 },
          { name: "learner_default_course_acknowledgement", wr: 1 },
          { name: "learner_default_course_capability_issue", wr: 1 },
          { name: "learner_default_course_capability_settlement", wr: 1 },
          { name: "learner_default_course_disposition", wr: 1 },
          { name: "learner_default_course_proposal", wr: 1 },
          { name: "learner_default_course_transition", wr: 1 },
          { name: "learning_command_receipt", wr: 1 },
        ])
        const freshDefaultConflictTrigger = fresh.find(
          (item) => item.name === "learner_default_course_conflict_forbidden",
        )?.definition
        expect(freshDefaultConflictTrigger).toContain("existing.id = NEW.id")
        expect(freshDefaultConflictTrigger).toContain("existing.version = NEW.version")
        expect(freshDefaultConflictTrigger).toContain("existing.predecessor_id = NEW.predecessor_id")
        expect(freshDefaultConflictTrigger).toContain("existing.occurrence_id = NEW.occurrence_id")
        expect(freshDefaultConflictTrigger).toContain("existing.frontier_sequence = NEW.frontier_sequence")
        const freshAnchorConflictTrigger = fresh.find(
          (item) => item.name === "learner_course_route_anchor_conflict_forbidden",
        )?.definition
        expect(freshAnchorConflictTrigger).toContain("existing.id = NEW.id")
        expect(freshAnchorConflictTrigger).toContain("existing.course_id = NEW.course_id")
        expect(freshAnchorConflictTrigger).toContain("existing.version = NEW.version")
        expect(freshAnchorConflictTrigger).toContain("existing.predecessor_id = NEW.predecessor_id")
        expect(freshAnchorConflictTrigger).toContain("existing.occurrence_id = NEW.occurrence_id")
        expect(freshAnchorConflictTrigger).toContain("existing.frontier_sequence = NEW.frontier_sequence")
        const freshDefaultSealTrigger = fresh.find(
          (item) => item.name === "learner_default_course_commit_seal_validate_insert_v14_history",
        )?.definition
        expect(freshDefaultSealTrigger).toContain("invocation.capability_identity = 'set_default_course_preference'")
        expect(freshDefaultSealTrigger).toContain("invocation.capability_version = authorization.authorization_version")
        expect(freshDefaultSealTrigger).toContain("effect.authorization_part_id = NEW.invocation_part_id")
        expect(freshDefaultSealTrigger).toContain("receipt.id = NEW.receipt_id")
        expect(freshDefaultSealTrigger).toContain("receipt.invocation_part_id = NEW.invocation_part_id")
        const freshAnchorSealTrigger = fresh.find(
          (item) => item.name === "learner_course_route_anchor_commit_seal_validate_insert_v17",
        )?.definition
        expect(freshAnchorSealTrigger).toContain("invocation.capability_identity = 'set_course_route_anchor'")
        expect(freshAnchorSealTrigger).toContain("invocation.capability_version = 1")
        expect(freshAnchorSealTrigger).toContain("invocation.capability_identity = 'update_learning_course'")
        expect(freshAnchorSealTrigger).toContain("learning_bootstrap_anchor_result")
        expect(freshAnchorSealTrigger).toContain("receipt.id = NEW.receipt_id")
        expect(freshAnchorSealTrigger).toContain("receipt.invocation_part_id = NEW.invocation_part_id")

        yield* removeGate14(db)
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 7}`))
        yield* db.run(sql`
          INSERT INTO course (id, title, state_version, time_created, time_updated)
          VALUES ('course_gate13', 'Preserved Course', 0, 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO learning_admitted_occurrence (id, origin_session_id, origin_message_id, time_admitted)
          VALUES ('occ_gate13_course', 'session_gate13', 'message_gate13_course', 1),
                 ('occ_gate13_representation', 'session_gate13', 'message_gate13_representation', 1)
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_invocation (
            part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
            occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
            capability_version, authorization_basis, input_fingerprint, status, time_admitted, turn_id, input_id
          ) VALUES
            ('part_gate13_course', 'session_gate13', 'message_gate13_course', 'assistant_gate13_course',
             'call_gate13_course', 'occ_gate13_course', 'accept_course_view_revision', 1, 0,
             'accept_course_view_revision', 1, 'learner_acceptance', ${"a".repeat(64)}, 'admitted', 1,
             'turn_gate13_course', 'input_gate13_course'),
            ('part_gate13_representation', 'session_gate13', 'message_gate13_representation',
             'assistant_gate13_representation', 'call_gate13_representation', 'occ_gate13_representation',
             'representation.convert', 1, 0, 'representation.convert', 1, 'learner_request',
             ${"b".repeat(64)}, 'admitted', 1, 'turn_gate13_representation', 'input_gate13_representation')
        `)

        yield* DatabaseMigration.apply(db)

        const upgraded = yield* learnerNavigationSchema(db)
        expect(upgraded).toEqual(fresh)
        expect(
          yield* db.all<{ name: string; wr: number }>(sql`
            SELECT name, wr
            FROM pragma_table_list
            WHERE name IN (
              'learner_default_course_acknowledgement',
              'learner_default_course_disposition',
              'learner_default_course_capability_issue',
              'learner_default_course_capability_settlement',
              'learner_default_course_proposal',
              'learner_default_course_transition',
              'learner_course_route_anchor_transition',
              'learning_command_receipt'
            )
            ORDER BY name
          `),
        ).toEqual(freshTableStorage)
        expect(upgraded.find((item) => item.name === "learner_default_course_conflict_forbidden")?.definition).toBe(
          freshDefaultConflictTrigger,
        )
        expect(
          upgraded.find((item) => item.name === "learner_course_route_anchor_conflict_forbidden")?.definition,
        ).toBe(freshAnchorConflictTrigger)
        expect(
          upgraded.find((item) => item.name === "learner_default_course_commit_seal_validate_insert_v14_history")
            ?.definition,
        ).toBe(freshDefaultSealTrigger)
        expect(
          upgraded.find((item) => item.name === "learner_course_route_anchor_commit_seal_validate_insert_v17")
            ?.definition,
        ).toBe(freshAnchorSealTrigger)
        expect(yield* db.all(sql`SELECT id FROM learner_default_course_transition`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM learner_course_route_anchor_transition`)).toEqual([])
        expect(yield* db.get(sql`SELECT id, title FROM course WHERE id = 'course_gate13'`)).toEqual({
          id: "course_gate13",
          title: "Preserved Course",
        })
        expect(
          yield* db.all(sql`
            SELECT part_id, command_name, receipt_id
            FROM learning_command_invocation
            ORDER BY part_id
          `),
        ).toEqual([
          {
            part_id: "part_gate13_course",
            command_name: "accept_course_view_revision",
            receipt_id: null,
          },
          {
            part_id: "part_gate13_representation",
            command_name: "representation.convert",
            receipt_id: null,
          },
        ])
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("upgrades a Gate 6 database without changing Session rows", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db, { migrations: [] })
        yield* dropCourseStateHistory(db)
        yield* Effect.forEach(
          learningCommandTables,
          (name) => db.run(sql`DROP TABLE IF EXISTS ${sql.identifier(name)}`),
          {
            discard: true,
          },
        )
        yield* Effect.forEach(courseTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('global', '/learning', 1, 1, '[]')`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES ('session', 'global', 'session', '/learning', 'Before Gate 7', 'test', 1, 1)`,
        )

        yield* DatabaseMigration.apply(db, {
          path: "gate-6.db",
          migrations: [courseViewAuthorityMigration],
        })

        expect(yield* db.get(sql`SELECT id, title, directory FROM session WHERE id = 'session'`)).toEqual({
          id: "session",
          title: "Before Gate 7",
          directory: "/learning",
        })
        expect(
          yield* db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'course%' ORDER BY name`),
        ).toHaveLength(12)
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION + 1,
        })
      }),
    )
  })

  test("builds the same Gate 7 schema through fresh and upgrade paths", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* courseSchema(db)

        yield* dropCourseStateHistory(db)
        yield* Effect.forEach(courseTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.transaction((tx) => courseViewAuthorityMigration.up(tx))

        expect(yield* courseSchema(db)).toEqual(fresh)
      }),
    )
  })

  test("builds the same Gate 8 schema from Gate 7 without fabricating legacy occurrence lineage", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)

        yield* Effect.forEach(
          learningCommandTables,
          (name) => db.run(sql`DROP TABLE IF EXISTS ${sql.identifier(name)}`),
          {
            discard: true,
          },
        )
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('gate7-project', '/learning', 1, 1, '[]')`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES ('gate7-session', 'gate7-project', 'gate7', '/learning', 'Gate 7', 'test', 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('msg_gate7_legacy', 'gate7-session', 1, 1, '{"role":"user"}')`,
        )
        yield* db.transaction((tx) => learningCommandSettlementMigration.up(tx))

        expect(
          (yield* db.all<{ name: string }>(sql`PRAGMA table_info('learning_command_invocation')`)).map(
            (column) => column.name,
          ),
        ).not.toContain("representation_effect_id")
        expect(
          (yield* db.all<{ name: string }>(sql`PRAGMA table_info('learning_command_receipt')`)).map(
            (column) => column.name,
          ),
        ).not.toContain("representation_effect_id")
        expect(yield* db.all(sql`SELECT * FROM learning_admitted_occurrence`)).toEqual([])
        expect(yield* db.get(sql`SELECT id, data FROM message WHERE id = 'msg_gate7_legacy'`)).toEqual({
          id: "msg_gate7_legacy",
          data: '{"role":"user"}',
        })
      }),
    )
  })

  test("builds the same Gate 9 schema from Gate 8 without fabricating Artifact authority", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* artifactSchema(db)

        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* restoreGate8LearningSchema(db)
        yield* Effect.forEach(contentRootTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* Effect.forEach(artifactTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(
          sql`DELETE FROM repa_migration WHERE version IN (${BASELINE_VERSION + 3}, ${BASELINE_VERSION + 4}, ${BASELINE_VERSION + 5}, ${BASELINE_VERSION + 6})`,
        )
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 2}`))
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('gate8-project', '/learning', 1, 1, '[]')`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES ('gate8-session', 'gate8-project', 'gate8', '/learning', 'Gate 8', 'test', 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('msg_gate8', 'gate8-session', 1, 1, '{"role":"user"}')`,
        )
        yield* db.run(
          sql`INSERT INTO course (id, title, state_version, time_created, time_updated) VALUES ('crs_gate8', 'Gate 8 course', 0, 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO learning_admitted_occurrence (id, origin_session_id, origin_message_id, time_admitted) VALUES ('loc_gate8', 'gate8-session', 'msg_gate8', 1)`,
        )

        yield* DatabaseMigration.apply(db)

        expect(yield* artifactSchema(db)).toEqual(fresh)
        expect(yield* db.all(sql`SELECT id FROM artifact`)).toEqual([])
        const memberForeignKeys = new Set(
          (yield* db.all<{ from: string }>(sql`PRAGMA foreign_key_list('artifact_lineage_correction_member')`)).map(
            (row) => row.from,
          ),
        )
        for (const column of [
          "boundary_binding_id",
          "boundary_observation_id",
          "boundary_descriptor_observation_id",
          "boundary_descriptor_correction_id",
        ]) {
          expect(memberForeignKeys).toContain(column)
        }
        expect(yield* db.get(sql`SELECT id, title FROM session WHERE id = 'gate8-session'`)).toEqual({
          id: "gate8-session",
          title: "Gate 8",
        })
        expect(yield* db.get(sql`SELECT id, title FROM course WHERE id = 'crs_gate8'`)).toEqual({
          id: "crs_gate8",
          title: "Gate 8 course",
        })
        expect(yield* db.get(sql`SELECT id FROM learning_admitted_occurrence WHERE id = 'loc_gate8'`)).toEqual({
          id: "loc_gate8",
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })

        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        yield* db.run(sql`
          INSERT INTO artifact (
            id, admission_root_artifact_id, creation_basis, creation_capability_identity,
            creation_capability_version, disposition_version, lineage_version, correction_hidden,
            time_created, time_updated
          ) VALUES ('artifact-fk', 'artifact-fk', 'learner_instruction', 'test', 1, 0, 0, 0, 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO artifact_revision (
            id, recorded_artifact_id, fingerprint_algorithm, fingerprint_digest,
            byte_length, time_first_observed
          ) VALUES ('revision-fk', 'artifact-fk', 'sha256', ${"a".repeat(64)}, 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO artifact_source_binding (
            id, recorded_artifact_id, binding_ordinal, canonical_location, basis_kind,
            basis_capability_identity, basis_capability_version, time_started
          ) VALUES ('binding-fk', 'artifact-fk', 1, '/fk.pdf', 'admission', 'test', 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO artifact_source_observation (
            id, recorded_artifact_id, binding_id, occurrence_ordinal, result, revision_id,
            media_type, observer_capability_identity, observer_capability_version,
            time_observed, time_committed
          ) VALUES (
            'observation-fk', 'artifact-fk', 'binding-fk', 1, 'present', 'revision-fk',
            'application/pdf', 'test', 1, 1, 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO artifact_lineage_correction_set (
            id, admission_root_artifact_id, basis, capability_identity, capability_version,
            time_committed
          ) VALUES ('set-fk', 'artifact-fk', 'learner_statement', 'test', 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO artifact_lineage_correction_member (
            id, set_id, recorded_artifact_id, lineage_version, start_after_ordinal,
            end_at_ordinal, time_effective, boundary_binding_id, boundary_observation_id,
            boundary_revision_id, boundary_descriptor_observation_id, boundary_media_type,
            boundary_availability, outcome_kind
          ) VALUES (
            'member-fk', 'set-fk', 'artifact-fk', 1, 0, 1, 1, 'binding-fk',
            'observation-fk', 'revision-fk', 'observation-fk', 'application/pdf',
            'available', 'recorded'
          )
        `)
        for (const column of [
          "boundary_binding_id",
          "boundary_observation_id",
          "boundary_descriptor_observation_id",
          "boundary_descriptor_correction_id",
        ]) {
          const dangling = yield* Effect.exit(
            db.run(
              sql`UPDATE artifact_lineage_correction_member SET ${sql.identifier(column)} = ${"missing"} WHERE id = 'member-fk'`,
            ),
          )
          expect(dangling._tag).toBe("Failure")
        }
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("builds the same Gate 10 schema from Gate 9 without fabricating filesystem authority", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* contentRootSchema(db)

        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* restoreGate8LearningSchema(db)
        yield* Effect.forEach(contentRootTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(
          sql`DELETE FROM repa_migration WHERE version IN (${BASELINE_VERSION + 4}, ${BASELINE_VERSION + 5}, ${BASELINE_VERSION + 6})`,
        )
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 3}`))
        yield* db.run(sql`
          INSERT INTO artifact (
            id, admission_root_artifact_id, creation_basis, creation_capability_identity,
            creation_capability_version, disposition_version, lineage_version, correction_hidden,
            time_created, time_updated
          ) VALUES ('gate9-artifact', 'gate9-artifact', 'learner_instruction', 'test', 1, 0, 0, 0, 1, 1)
        `)

        yield* DatabaseMigration.apply(db)

        expect(yield* contentRootSchema(db)).toEqual(fresh)
        expect(yield* db.all(sql`SELECT id FROM content_root`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM content_mutation_grant`)).toEqual([])
        expect(yield* db.get(sql`SELECT id FROM artifact WHERE id = 'gate9-artifact'`)).toEqual({
          id: "gate9-artifact",
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("builds the same Gate 11 schema from Gate 10 without fabricating Representation authority", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const freshLearning = yield* learningCommandSchema(db)
        const freshContentRoot = yield* contentRootSchema(db)
        const freshRepresentation = yield* representationSchema(db)

        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* restoreGate8LearningSchema(db)
        yield* Effect.forEach(contentRootTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.transaction((tx) => contentRootAuthorityMigration.up(tx))
        yield* db.run(
          sql`DELETE FROM repa_migration WHERE version IN (${BASELINE_VERSION + 5}, ${BASELINE_VERSION + 6})`,
        )
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 4}`))
        yield* db.run(
          sql`INSERT INTO learning_admitted_occurrence (id, origin_session_id, origin_message_id, time_admitted) VALUES ('lco_00000000000000000000000021', 'ses_gate10', 'msg_gate10', 1)`,
        )
        yield* db.run(sql`
          INSERT INTO learning_command_invocation (
            part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
            occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
            capability_version, authorization_basis, input_fingerprint, status, time_admitted
          ) VALUES (
            'prt_gate10', 'ses_gate10', 'msg_gate10_user', 'msg_gate10_assistant', 'call_gate10',
            'lco_00000000000000000000000021', 'accept_course_view_revision', 1, 0, 'accept_course_view_revision',
            1, 'learner_request', ${"a".repeat(64)}, 'admitted', 1
          )
        `)
        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        yield* db.run(
          sql`INSERT INTO course (id, title, state_version, time_created, time_updated) VALUES ('crs_00000000000000000000000021', 'Gate 10 course', 0, 1, 1)`,
        )
        yield* db.run(sql`
          INSERT INTO course_view (id, course_id, name, state_version, time_created, time_updated)
          VALUES ('cvw_00000000000000000000000021', 'crs_00000000000000000000000021', 'Gate 10 view', 0, 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO course_view_revision (
            id, course_id, view_id, revision_number, authorship_basis, time_created
          ) VALUES ('cvr_00000000000000000000000021', 'crs_00000000000000000000000021', 'cvw_00000000000000000000000021', 1, 'learner_directed', 1)
        `)
        yield* db.run(sql`
          INSERT INTO course_view_revision_state (course_id, view_id, revision_id, state_version, time_updated)
          VALUES ('crs_00000000000000000000000021', 'cvw_00000000000000000000000021', 'cvr_00000000000000000000000021', 0, 1)
        `)
        yield* db.run(sql`
          INSERT INTO learning_admitted_occurrence (id, origin_session_id, origin_message_id, time_admitted)
          VALUES ('lco_00000000000000000000000022', 'ses_gate10', 'msg_gate10_applied', 1)
        `)
        yield* db.run(sql`
          INSERT INTO course_selection_acceptance_effect (
            id, occurrence_id, course_id, accepted_revision_id, previous_selection_version,
            committed_selection_version, time_committed
          ) VALUES ('cse_00000000000000000000000021', 'lco_00000000000000000000000022', 'crs_00000000000000000000000021', 'cvr_00000000000000000000000021', 0, 1, 2)
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_invocation (
            part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
            occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
            capability_version, authorization_basis, input_fingerprint, status, effect_id, settlement,
            time_admitted, time_settled, settlement_order
          ) VALUES (
            'prt_gate10_applied', 'ses_gate10', 'msg_gate10_applied', 'msg_gate10_assistant_applied',
            'call_gate10_applied', 'lco_00000000000000000000000022', 'accept_course_view_revision', 1, 0,
            'accept_course_view_revision', 1, 'learner_request', ${"b".repeat(64)}, 'applied',
            'cse_00000000000000000000000021',
            '{"outcome":"applied","receiptID":"lcr_00000000000000000000000021","effectID":"cse_00000000000000000000000021","courseID":"crs_00000000000000000000000021","revisionID":"cvr_00000000000000000000000021","previousSelection":{"version":0},"committedSelection":{"revisionID":"cvr_00000000000000000000000021","version":1},"settlementTime":2,"settlementOrder":1}',
            1, 2, 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO learning_command_receipt (
            id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
            invocation_part_id, capability_identity, capability_version, authorization_basis,
            effect_id, time_committed, commit_order
          ) VALUES (
            'lcr_00000000000000000000000021', 'lco_00000000000000000000000022', 'ses_gate10', 'msg_gate10_applied',
            'msg_gate10_assistant_applied', 'prt_gate10_applied', 'accept_course_view_revision', 1,
            'learner_request', 'cse_00000000000000000000000021', 2, 1
          )
        `)
        yield* db.run(sql`INSERT INTO content_root (id, time_created) VALUES ('root_gate10', 1)`)
        yield* db.run(sql`
          INSERT INTO content_root_binding (
            id, content_root_id, canonical_path, canonical_path_key, platform, volume_serial,
            object_id, creation_time, initial_change_time, verifier_version, time_created
          ) VALUES (
            'binding_gate10', 'root_gate10', 'C:\\gate10', 'c:\\gate10', 'windows_ntfs', 'volume',
            '0123456789abcdef0123456789abcdef', 'creation', 'change', 1, 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO content_root_binding_episode (
            id, content_root_id, binding_id, ordinal, approval_basis, time_started
          ) VALUES ('binding_episode_gate10', 'root_gate10', 'binding_gate10', 1, 'learner approval', 1)
        `)
        yield* db.run(sql`
          INSERT INTO content_root_grant_episode (
            id, content_root_id, binding_id, binding_episode_id, ordinal, approval_basis,
            time_approved, time_updated
          ) VALUES (
            'grant_episode_gate10', 'root_gate10', 'binding_gate10', 'binding_episode_gate10', 1,
            'learner approval', 1, 1
          )
        `)
        yield* db.run(sql`
          INSERT INTO content_root_current (
            content_root_id, binding_id, binding_episode_id, grant_episode_id, disposition, time_updated
          ) VALUES (
            'root_gate10', 'binding_gate10', 'binding_episode_gate10', 'grant_episode_gate10', 'active', 1
          )
        `)
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])

        yield* DatabaseMigration.apply(db)

        expect(yield* learningCommandSchema(db)).toEqual(freshLearning)
        expect(yield* contentRootSchema(db)).toEqual(freshContentRoot)
        expect(yield* representationSchema(db)).toEqual(freshRepresentation)
        expect(yield* db.all(sql`SELECT id FROM representation_revision`)).toEqual([])
        expect(
          yield* db.get(
            sql`SELECT part_id, status, receipt_id, turn_id, input_id FROM learning_command_invocation WHERE part_id = 'prt_gate10'`,
          ),
        ).toEqual({
          part_id: "prt_gate10",
          status: "admitted",
          receipt_id: null,
          turn_id: null,
          input_id: null,
        })
        expect(
          yield* db.get(sql`
            SELECT receipt.id, receipt.invocation_part_id, seal.effect_id
            FROM learning_command_receipt AS receipt
            JOIN course_selection_acceptance_commit_seal AS seal ON seal.receipt_id = receipt.id
            WHERE receipt.id = 'lcr_00000000000000000000000021'
          `),
        ).toEqual({
          id: "lcr_00000000000000000000000021",
          invocation_part_id: "prt_gate10_applied",
          effect_id: "cse_00000000000000000000000021",
        })
        expect(
          yield* db.get(sql`
            SELECT content_root_id, binding_id, binding_episode_id, grant_episode_id, disposition
            FROM content_root_current
            WHERE content_root_id = 'root_gate10'
          `),
        ).toEqual({
          content_root_id: "root_gate10",
          binding_id: "binding_gate10",
          binding_episode_id: "binding_episode_gate10",
          grant_episode_id: "grant_episode_gate10",
          disposition: "active",
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA foreign_keys"))).toEqual({ foreign_keys: 1 })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("builds the same Gate 12 schema from Gate 11 without fabricating legacy Turns", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const fresh = yield* turnSchema(db)

        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 6}`)
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 5}`))
        yield* db.run(sql`
          INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
          VALUES ('gate11-project', '/learning', 1, 1, '[]')
        `)
        yield* db.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES ('gate11-legacy', 'gate11-project', 'legacy', '/learning', 'Legacy transcript', 'test', 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data)
          VALUES ('msg_gate11_legacy', 'gate11-legacy', 1, 1, '{"role":"user"}')
        `)
        yield* db.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES ('gate11-empty', 'gate11-project', 'empty', '/learning', 'Empty', 'test', 2, 2)
        `)
        yield* db.run(sql`INSERT INTO event_sequence (aggregate_id, seq) VALUES ('gate11-empty', 0)`)
        yield* db.run(sql`
          INSERT INTO event (id, aggregate_id, seq, type, data)
          VALUES ('evt_gate11_empty', 'gate11-empty', 0, 'session.created.1', '{}')
        `)

        yield* DatabaseMigration.apply(db)

        expect(yield* turnSchema(db)).toEqual(fresh)
        expect(yield* db.all(sql`SELECT id FROM turn`)).toEqual([])
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = 'gate11-legacy'`)).toEqual({ id: "gate11-legacy" })
        expect(yield* db.get(sql`SELECT id FROM message WHERE id = 'msg_gate11_legacy'`)).toEqual({
          id: "msg_gate11_legacy",
        })
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = 'gate11-empty'`)).toBeUndefined()
        expect(yield* db.get(sql`SELECT id FROM event WHERE aggregate_id = 'gate11-empty'`)).toBeUndefined()
        expect(
          yield* db.get(sql`SELECT aggregate_id FROM event_sequence WHERE aggregate_id = 'gate11-empty'`),
        ).toBeUndefined()
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: DatabaseMigration.version,
        })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("rolls Gate 12 migration back for a referenced empty legacy Session", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* removeGate13(db)
        yield* Effect.forEach(turnTables, (name) => db.run(sql`DROP TABLE ${sql.identifier(name)}`), {
          discard: true,
        })
        yield* db.run(sql`DELETE FROM repa_migration WHERE version = ${BASELINE_VERSION + 6}`)
        yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + 5}`))
        yield* db.run(sql`
          INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
          VALUES ('gate11-anomaly-project', '/learning', 1, 1, '[]')
        `)
        yield* db.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES ('gate11-anomaly', 'gate11-anomaly-project', 'anomaly', '/learning', 'Anomaly', 'test', 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO session_input (id, session_id, prompt, delivery, admitted_seq, time_created)
          VALUES ('input_gate11_anomaly', 'gate11-anomaly', '{}', 'steer', 0, 1)
        `)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "gate11-anomaly.db" }))

        expect(error).toMatchObject({ migrationID: durableTurnMigration.id })
        expect(String(error.cause)).toContain("cannot migrate referenced empty legacy Session gate11-anomaly")
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = 'gate11-anomaly'`)).toEqual({
          id: "gate11-anomaly",
        })
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE name = 'turn'`)).toBeUndefined()
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION + 5,
        })
        expect(
          yield* db.get(sql`SELECT version FROM repa_migration WHERE version = ${BASELINE_VERSION + 6}`),
        ).toBeUndefined()
      }),
    )
  })

  test("rejects a non-empty foreign database", async () => {
    await expect(
      run(
        Effect.gen(function* () {
          const db = yield* makeDb
          yield* db.run(sql`CREATE TABLE unrelated (id text PRIMARY KEY)`)
          yield* DatabaseMigration.apply(db)
        }),
      ),
    ).rejects.toThrow("is not a recognized Repa database")
  })

  test("backfills existing Context Epoch rows to the build agent", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(
          sql`CREATE TABLE session_context_epoch (session_id text PRIMARY KEY, baseline text NOT NULL, snapshot text NOT NULL, baseline_seq integer NOT NULL, replacement_seq integer, revision integer DEFAULT 0 NOT NULL)`,
        )
        yield* db.run(
          sql`INSERT INTO session_context_epoch (session_id, baseline, snapshot, baseline_seq) VALUES ('ses_existing', 'baseline', '{}', 0)`,
        )

        yield* applyHistorical(db, [contextEpochAgentMigration])

        expect(yield* db.get(sql`SELECT agent FROM session_context_epoch WHERE session_id = 'ses_existing'`)).toEqual({
          agent: "build",
        })
      }),
    )
  })

  test("keeps legacy credential fields nullable", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(
          sql`CREATE TABLE credential (id text PRIMARY KEY, connector_id text NOT NULL, method_id text NOT NULL, label text NOT NULL, value text NOT NULL, active integer DEFAULT false NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL)`,
        )
        yield* db.run(
          sql`CREATE UNIQUE INDEX credential_connector_active_idx ON credential (connector_id) WHERE active = 1`,
        )
        yield* applyHistorical(db, [simplifyIntegrationCredentialsMigration])

        yield* db.run(
          sql`INSERT INTO credential (id, connector_id, method_id, label, value, active, time_created, time_updated) VALUES ('legacy', 'openai', 'oauth', 'Legacy', '{}', 1, 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO credential (id, integration_id, label, value, time_created, time_updated) VALUES ('current', 'anthropic', 'Current', '{}', 2, 2)`,
        )
        expect(yield* db.get(sql`SELECT connector_id, method_id, active FROM credential WHERE id = 'current'`)).toEqual(
          { connector_id: null, method_id: null, active: null },
        )
      }),
    )
  })

  test("resets beta history and rebuilds event-sourced Session input storage", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY, workspace_id text)`)
        yield* db.run(sql`CREATE TABLE workspace (id text PRIMARY KEY)`)
        yield* db.run(sql`CREATE TABLE message (id text PRIMARY KEY)`)
        yield* db.run(sql`CREATE TABLE part (id text PRIMARY KEY)`)
        yield* db.run(sql`CREATE TABLE event_sequence (aggregate_id text PRIMARY KEY, seq integer NOT NULL)`)
        yield* db.run(
          sql`CREATE TABLE event (id text PRIMARY KEY, aggregate_id text NOT NULL, seq integer NOT NULL, type text NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(sql`CREATE INDEX event_aggregate_seq_idx ON event (aggregate_id, seq)`)
        yield* db.run(sql`CREATE INDEX event_aggregate_type_seq_idx ON event (aggregate_id, type, seq)`)
        yield* db.run(
          sql`CREATE TABLE session_message (id text PRIMARY KEY, session_id text NOT NULL, type text NOT NULL, seq integer NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(sql`CREATE INDEX session_message_session_seq_idx ON session_message (session_id, seq)`)
        yield* db.run(
          sql`CREATE TABLE session_input (seq integer PRIMARY KEY AUTOINCREMENT, id text NOT NULL UNIQUE, session_id text NOT NULL, prompt text NOT NULL, delivery text NOT NULL, promoted_seq integer, time_created integer NOT NULL)`,
        )
        yield* db.run(
          sql`CREATE INDEX session_input_session_pending_delivery_seq_idx ON session_input (session_id, promoted_seq, delivery, seq)`,
        )
        yield* db.run(sql`INSERT INTO session (id, workspace_id) VALUES ('session', 'wrk_old')`)
        yield* db.run(sql`INSERT INTO workspace (id) VALUES ('wrk_old')`)
        yield* db.run(sql`INSERT INTO message (id) VALUES ('message')`)
        yield* db.run(sql`INSERT INTO part (id) VALUES ('part')`)
        yield* db.run(sql`INSERT INTO event_sequence (aggregate_id, seq) VALUES ('session', 0)`)
        yield* db.run(
          sql`INSERT INTO event (id, aggregate_id, seq, type, data) VALUES ('evt_old', 'session', 0, 'old.1', '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES ('msg_old', 'session', 'user', 0, 1, 1, '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_input (id, session_id, prompt, delivery, time_created) VALUES ('msg_pending', 'session', '{}', 'steer', 1)`,
        )

        yield* applyHistorical(db, [eventSourcedSessionInputMigration])

        expect(yield* db.all(sql`SELECT id, workspace_id FROM session`)).toEqual([
          { id: "session", workspace_id: null },
        ])
        expect(yield* db.all(sql`SELECT id FROM workspace`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM message`)).toEqual([{ id: "message" }])
        expect(yield* db.all(sql`SELECT id FROM part`)).toEqual([{ id: "part" }])
        expect(yield* db.all(sql`SELECT id FROM event`)).toEqual([])
        expect(yield* db.all(sql`SELECT aggregate_id FROM event_sequence`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM session_message`)).toEqual([])
        expect(yield* db.all(sql`SELECT id FROM session_input`)).toEqual([])
        expect(
          (yield* db.all<{ name: string }>(sql`PRAGMA table_info(session_input)`)).map((column) => column.name),
        ).toEqual(["id", "session_id", "prompt", "delivery", "admitted_seq", "promoted_seq", "time_created"])
        expect(
          (yield* db.all<{ name: string; unique: number }>(sql`PRAGMA index_list(session_message)`)).find(
            (index) => index.name === "session_message_session_seq_idx",
          ),
        ).toMatchObject({ unique: 1 })
        expect(
          (yield* db.all<{ name: string; unique: number }>(sql`PRAGMA index_list(event)`)).find(
            (index) => index.name === "event_aggregate_seq_idx",
          ),
        ).toMatchObject({ unique: 1 })
        expect(
          (yield* db.all<{ name: string; unique: number }>(sql`PRAGMA index_list(session_input)`)).filter((index) =>
            ["session_input_session_admitted_seq_idx", "session_input_session_promoted_seq_idx"].includes(index.name),
          ),
        ).toEqual([
          expect.objectContaining({ name: "session_input_session_promoted_seq_idx", unique: 1 }),
          expect.objectContaining({ name: "session_input_session_admitted_seq_idx", unique: 1 }),
        ])
      }),
    )
  })

  test("preserves canonical V1 state and restarts its event stream", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        yield* DatabaseMigration.apply(db)
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('global', '/project', 1, 1, '[]')`,
        )
        yield* db.run(
          sql`INSERT INTO workspace (id, type, project_id, time_used) VALUES ('workspace', 'local', 'global', 1)`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, project_id, workspace_id, slug, directory, title, version, time_created, time_updated) VALUES ('session', 'global', 'workspace', 'session', '/project', 'Before', 'test', 1, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('message', 'session', 1, 1, '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES ('part', 'message', 'session', 1, 1, '{}')`,
        )
        yield* db.run(sql`INSERT INTO event_sequence (aggregate_id, seq) VALUES ('session', 9)`)
        yield* db.run(
          sql`INSERT INTO event (id, aggregate_id, seq, type, data) VALUES ('event', 'session', 9, 'session.updated.1', '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_input (id, session_id, prompt, delivery, admitted_seq, time_created) VALUES ('input', 'session', '{}', 'steer', 9, 1)`,
        )
        yield* db.run(
          sql`INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES ('projected', 'session', 'user', 9, 1, 1, '{}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_context_epoch (session_id, baseline, snapshot, baseline_seq) VALUES ('session', 'baseline', '{}', 9)`,
        )
        yield* applyHistorical(db, [simplifySessionInputMigration])

        const database = Layer.succeed(Database.Service, { db, filename: ":memory:" })
        yield* EventV2.Service.use((service) =>
          service.publish(SessionV1.Event.Updated, {
            sessionID: SessionSchema.ID.make("session"),
            info: {
              id: SessionSchema.ID.make("session"),
              slug: "session",
              projectID: ProjectV2.ID.global,
              directory: "/project",
              title: "After",
              version: "test",
              time: { created: 1, updated: 2 },
            },
          }),
        ).pipe(
          Effect.provide(
            AppNodeBuilder.build(LayerNode.group([EventV2.node, SessionProjector.node]), [[Database.node, database]]),
          ),
        )

        expect(
          yield* db.get(sql`
            SELECT
              (SELECT title FROM session WHERE id = 'session') AS title,
              (SELECT workspace_id FROM session WHERE id = 'session') AS workspaceID,
              (SELECT COUNT(*) FROM message WHERE id = 'message') AS messages,
              (SELECT COUNT(*) FROM part WHERE id = 'part') AS parts,
              (SELECT COUNT(*) FROM workspace) AS workspaces,
              (SELECT COUNT(*) FROM session_input) AS sessionInputs,
              (SELECT COUNT(*) FROM session_message) AS sessionMessages,
              (SELECT COUNT(*) FROM session_context_epoch) AS contextEpochs,
              (SELECT seq FROM event_sequence WHERE aggregate_id = 'session') AS seq,
              (SELECT type FROM event WHERE aggregate_id = 'session') AS eventType
          `),
        ).toEqual({
          title: "After",
          workspaceID: null,
          messages: 1,
          parts: 1,
          workspaces: 0,
          sessionInputs: 0,
          sessionMessages: 0,
          contextEpochs: 0,
          seq: 0,
          eventType: "session.updated.1",
        })
      }),
    )
  })

  test("resets incompatible projected Session messages before adding sequence order", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY)`)
        yield* db.run(
          sql`CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(
          sql`CREATE TABLE part (id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(sql`CREATE TABLE event (id text PRIMARY KEY, seq integer NOT NULL)`)
        yield* db.run(
          sql`CREATE TABLE session_message (id text PRIMARY KEY, session_id text NOT NULL, type text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)`,
        )
        yield* db.run(
          sql`CREATE INDEX session_message_session_time_created_id_idx ON session_message (session_id, time_created, id)`,
        )
        yield* db.run(
          sql`CREATE INDEX session_message_session_type_time_created_id_idx ON session_message (session_id, type, time_created, id)`,
        )
        yield* db.run(sql`INSERT INTO session (id) VALUES ('session')`)
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('legacy_message', 'session', 1, 1, '{"role":"user"}')`,
        )
        yield* db.run(
          sql`INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES ('legacy_part', 'legacy_message', 'session', 1, 1, '{"type":"text","text":"hello"}')`,
        )
        yield* db.run(
          sql`INSERT INTO session_message (id, session_id, type, time_created, time_updated, data) VALUES ('stale_projection', 'session', 'user', 1, 1, '{}')`,
        )

        yield* applyHistorical(db, [sessionMessageProjectionOrderMigration])

        expect(yield* db.all(sql`SELECT id, session_id, data FROM message`)).toEqual([
          { id: "legacy_message", session_id: "session", data: '{"role":"user"}' },
        ])
        expect(yield* db.all(sql`SELECT id, message_id, session_id, data FROM part`)).toEqual([
          {
            id: "legacy_part",
            message_id: "legacy_message",
            session_id: "session",
            data: '{"type":"text","text":"hello"}',
          },
        ])
        expect(yield* db.all(sql`SELECT id FROM session_message`)).toEqual([])

        yield* db.run(
          sql`INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES ('fresh_projection', 'session', 'user', 7, 2, 2, '{}')`,
        )
        expect(yield* db.get(sql`SELECT id, seq FROM session_message`)).toEqual({ id: "fresh_projection", seq: 7 })
      }),
    )
  })

  test("runs session usage backfill in order with schema changes", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY, time_updated integer NOT NULL)`)
        yield* db.run(sql`CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, data text NOT NULL)`)
        yield* db.run(sql`INSERT INTO session (id, time_updated) VALUES ('session_1', 1)`)
        yield* db.run(
          sql`INSERT INTO message (id, session_id, data) VALUES ('message_1', 'session_1', '{"role":"assistant","cost":1.25,"tokens":{"input":2,"output":3,"reasoning":4,"cache":{"read":5,"write":6}}}')`,
        )

        yield* applyHistorical(db, [sessionUsageMigration])

        expect(
          yield* db.get(
            sql`SELECT cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write FROM session WHERE id = 'session_1'`,
          ),
        ).toEqual({
          cost: 1.25,
          tokens_input: 2,
          tokens_output: 3,
          tokens_reasoning: 4,
          tokens_cache_read: 5,
          tokens_cache_write: 6,
        })
      }),
    )
  })

  test("normalizes Windows storage paths and leaves POSIX paths untouched", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE project (id text PRIMARY KEY, worktree text NOT NULL, sandboxes text NOT NULL)`)
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY, directory text NOT NULL, path text)`)
        // Windows-shaped rows (drive + backslash) must be normalized.
        yield* db.run(
          sql`INSERT INTO project (id, worktree, sandboxes) VALUES (${"win"}, ${"C:\\Repo\\Thing"}, ${JSON.stringify([
            "C:\\Repo\\Thing\\sandbox",
          ])})`,
        )
        yield* db.run(
          sql`INSERT INTO session (id, directory, path) VALUES (${"win"}, ${"C:\\Repo\\Thing\\packages\\api"}, ${"packages\\api"})`,
        )
        // UNC worktrees and their sandboxes must normalize too (not just drive paths).
        yield* db.run(
          sql`INSERT INTO project (id, worktree, sandboxes) VALUES (${"unc"}, ${"\\\\server\\share"}, ${JSON.stringify([
            "\\\\server\\share\\sandbox",
          ])})`,
        )
        // The "/" worktree sentinel and POSIX paths (including a pathological
        // backslash in a POSIX filename) must survive byte-for-byte.
        yield* db.run(sql`INSERT INTO project (id, worktree, sandboxes) VALUES (${"global"}, ${"/"}, ${"[]"})`)
        yield* db.run(
          sql`INSERT INTO session (id, directory, path) VALUES (${"posix"}, ${"/home/me/we\\ird"}, ${"src\\weird"})`,
        )

        yield* applyHistorical(db, [normalizeStoragePathsMigration])

        expect(yield* db.get(sql`SELECT worktree, sandboxes FROM project WHERE id = 'win'`)).toEqual({
          worktree: "C:/Repo/Thing",
          sandboxes: JSON.stringify(["C:/Repo/Thing/sandbox"]),
        })
        expect(yield* db.get(sql`SELECT directory, path FROM session WHERE id = 'win'`)).toEqual({
          directory: "C:/Repo/Thing/packages/api",
          path: "packages/api",
        })
        expect(yield* db.get(sql`SELECT worktree, sandboxes FROM project WHERE id = 'unc'`)).toEqual({
          worktree: "//server/share",
          sandboxes: JSON.stringify(["//server/share/sandbox"]),
        })
        expect(yield* db.get(sql`SELECT worktree FROM project WHERE id = 'global'`)).toEqual({ worktree: "/" })
        expect(yield* db.get(sql`SELECT directory, path FROM session WHERE id = 'posix'`)).toEqual({
          directory: "/home/me/we\\ird",
          path: "src\\weird",
        })
      }),
    )
  })

  test("maps native Windows paths through database columns", async () => {
    if (process.platform !== "win32") return
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const projectID = ProjectV2.ID.make("codec_project")
        const worktree = AbsolutePath.make("C:\\Repo\\Thing")
        const sandbox = AbsolutePath.make("C:\\Repo\\Thing\\sandbox")
        const directory = "C:\\Repo\\Thing\\packages\\api"
        const sessionID = SessionSchema.ID.make("ses_codec")

        expect(() =>
          Effect.runSync(
            db
              .insert(ProjectTable)
              .values({
                id: ProjectV2.ID.make("invalid_path"),
                worktree: AbsolutePath.make("not-absolute"),
                sandboxes: [],
                time_created: 1,
                time_updated: 1,
              })
              .run(),
          ),
        ).toThrow()

        yield* db
          .insert(ProjectTable)
          .values({
            id: projectID,
            worktree,
            sandboxes: [sandbox],
            time_created: 1,
            time_updated: 1,
          })
          .run()
        yield* db
          .insert(SessionTable)
          .values({
            id: sessionID,
            project_id: projectID,
            slug: "codec",
            directory,
            path: "packages\\api",
            title: "Codec",
            version: "test",
            time_created: 1,
            time_updated: 1,
          })
          .run()

        expect(
          yield* db.get<{ worktree: string; sandboxes: string }>(
            sql`SELECT worktree, sandboxes FROM project WHERE id = ${projectID}`,
          ),
        ).toEqual({
          worktree: "C:/Repo/Thing",
          sandboxes: JSON.stringify(["C:/Repo/Thing/sandbox"]),
        })
        expect(
          yield* db.get<{ directory: string; path: string }>(
            sql`SELECT directory, path FROM session WHERE id = ${sessionID}`,
          ),
        ).toEqual({
          directory: "C:/Repo/Thing/packages/api",
          path: "packages/api",
        })

        const project = yield* db.select().from(ProjectTable).where(eq(ProjectTable.worktree, worktree)).get()
        const session = yield* db.select().from(SessionTable).where(eq(SessionTable.directory, directory)).get()
        expect(project?.worktree).toBe(worktree)
        expect(project?.sandboxes).toEqual([sandbox])
        expect(session?.directory).toBe(directory)
        expect(session?.path).toBe("packages/api")

        expect((yield* db.select().from(SessionTable).where(eq(SessionTable.path, "packages\\api")).get())?.id).toBe(
          sessionID,
        )

        const moved = AbsolutePath.make("D:\\Moved\\Thing")
        const updated = yield* db
          .update(ProjectTable)
          .set({ worktree: moved, sandboxes: [moved] })
          .where(eq(ProjectTable.id, projectID))
          .returning()
          .get()
        expect(updated?.worktree).toBe(moved)
        expect(updated?.sandboxes).toEqual([moved])
        expect(
          yield* db.get<{ worktree: string; sandboxes: string }>(
            sql`SELECT worktree, sandboxes FROM project WHERE id = ${projectID}`,
          ),
        ).toEqual({ worktree: "D:/Moved/Thing", sandboxes: JSON.stringify(["D:/Moved/Thing"]) })
        expect(
          (yield* db
            .select()
            .from(ProjectTable)
            .where(inArray(ProjectTable.worktree, [moved]))
            .get())?.id,
        ).toBe(projectID)

        yield* db.run(sql`UPDATE project SET worktree = ${"not-absolute"} WHERE id = ${projectID}`)
        expect(() =>
          Effect.runSync(db.select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get()),
        ).toThrow()
      }),
    )
  })

  test("rejects an OpenCode-shaped database without importing its journal", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY)`)
        yield* db.run(
          sql`CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric, name text, applied_at TEXT)`,
        )
        yield* db.run(sql`
          INSERT INTO __drizzle_migrations (hash, created_at, name, applied_at)
          VALUES ('hash', 1, '20260127222353_familiar_lady_ursula', ${new Date().toISOString()})
        `)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "legacy.db" }))

        expect(error).toMatchObject({ reason: "foreign", path: "legacy.db" })
        expect(yield* db.all(sql`SELECT id FROM session`)).toEqual([])
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE name = 'repa_migration'`)).toBeUndefined()
        expect(yield* db.get(sql`SELECT name FROM __drizzle_migrations`)).toEqual({
          name: "20260127222353_familiar_lady_ursula",
        })
      }),
    )
  })

  test("rejects a future Repa database", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(sql.raw(`PRAGMA user_version = ${DatabaseMigration.version + 1}`))

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "future.db" }))

        expect(error).toMatchObject({ reason: "future" })
        expect(yield* db.all(sql`SELECT version, id FROM repa_migration ORDER BY version`)).toEqual([
          { version: BASELINE_VERSION, id: BASELINE_ID },
          { version: BASELINE_VERSION + 1, id: courseViewAuthorityMigration.id },
          { version: BASELINE_VERSION + 2, id: learningCommandSettlementMigration.id },
          { version: BASELINE_VERSION + 3, id: sourceArtifactAuthorityMigration.id },
          { version: BASELINE_VERSION + 4, id: contentRootAuthorityMigration.id },
          { version: BASELINE_VERSION + 5, id: readableRepresentationLineageMigration.id },
          { version: BASELINE_VERSION + 6, id: durableTurnMigration.id },
          { version: BASELINE_VERSION + 7, id: materialMapAlignmentMigration.id },
          { version: BASELINE_VERSION + 8, id: learnerNavigationMigration.id },
          { version: BASELINE_VERSION + 9, id: retainedSteeringMigration.id },
          { version: BASELINE_VERSION + 10, id: learnerGoalsMigration.id },
          { version: BASELINE_VERSION + 11, id: domainNeutralLearningCommandLedgerMigration.id },
          { version: BASELINE_VERSION + 12, id: defaultCourseV2Migration.id },
          { version: BASELINE_VERSION + 13, id: agentNativeDefaultCourseMigration.id },
          { version: BASELINE_VERSION + 14, id: messageDiffProjectionMigration.id },
          { version: BASELINE_VERSION + 15, id: agentNativeLearnerGoalsMigration.id },
          { version: BASELINE_VERSION + 16, id: learningBootstrapMigration.id },
        ])
      }),
    )
  })

  test("rejects an inconsistent Repa migration lineage", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db, { migrations: [] })
        yield* db.run(sql`UPDATE repa_migration SET id = 'not-the-repa-baseline' WHERE version = 1`)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "partial.db" }))

        expect(error).toMatchObject({ reason: "partial" })
        expect(yield* db.get(sql`SELECT id FROM repa_migration WHERE version = 1`)).toEqual({
          id: "not-the-repa-baseline",
        })
      }),
    )
  })

  test("rolls a failed Repa migration back with its version and journal", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db, { migrations: [] })
        const failing = {
          id: "repa_test_failure",
          up(tx) {
            return Effect.gen(function* () {
              yield* tx.run(sql`CREATE TABLE should_rollback (id text PRIMARY KEY)`)
              return yield* Effect.fail(new Error("injected migration failure"))
            })
          },
        } satisfies DatabaseMigration.Migration

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "migration.db", migrations: [failing] }))

        expect(error).toMatchObject({ _tag: "DatabaseMigrationError" })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION,
        })
        expect(yield* db.all(sql`SELECT version, id FROM repa_migration ORDER BY version`)).toEqual([
          { version: BASELINE_VERSION, id: BASELINE_ID },
        ])
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE name = 'should_rollback'`)).toBeUndefined()
      }),
    )
  })

  test("restores foreign-key enforcement after a failed graph-rebuild migration", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db, { migrations: [] })
        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        const failing = {
          id: "repa_test_graph_rebuild_failure",
          foreignKeyMode: "rebuild_graph",
          up(tx) {
            return Effect.gen(function* () {
              yield* tx.run(sql`CREATE TABLE graph_rebuild_should_rollback (id text PRIMARY KEY)`)
              return yield* Effect.fail(new Error("injected graph-rebuild failure"))
            })
          },
        } satisfies DatabaseMigration.Migration

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "graph.db", migrations: [failing] }))

        expect(error).toMatchObject({ _tag: "DatabaseMigrationError" })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA foreign_keys"))).toEqual({ foreign_keys: 1 })
        expect(yield* db.get<Record<string, number>>(sql.raw("PRAGMA user_version"))).toEqual({
          user_version: BASELINE_VERSION,
        })
        expect(yield* db.all(sql`SELECT version, id FROM repa_migration ORDER BY version`)).toEqual([
          { version: BASELINE_VERSION, id: BASELINE_ID },
        ])
        expect(
          yield* db.get(sql`SELECT name FROM sqlite_master WHERE name = 'graph_rebuild_should_rollback'`),
        ).toBeUndefined()
      }),
    )
  })

  test("rejects existing foreign-key violations", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(sql`PRAGMA foreign_keys = OFF`)
        yield* db.run(
          sql`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('orphan', 'missing', 1, 1, '{}')`,
        )
        yield* db.run(sql`PRAGMA foreign_keys = ON`)

        const error = yield* Effect.flip(DatabaseMigration.apply(db, { path: "orphan.db" }))

        expect(error).toMatchObject({ reason: "corrupt" })
        expect(yield* db.get(sql`SELECT id FROM message`)).toEqual({ id: "orphan" })
      }),
    )
  })

  test("reopens a current Repa baseline without changing durable rows", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(
          sql`INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('kept', '/', 1, 1, '[]')`,
        )

        yield* DatabaseMigration.apply(db, { path: "current.db" })

        expect(yield* db.get(sql`SELECT id FROM project WHERE id = 'kept'`)).toEqual({ id: "kept" })
      }),
    )
  })
})
