import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { isDeepStrictEqual } from "node:util"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV14 } from "../../schema-extras-v14"

export default {
  id: "20260730115237_gate14_agent_native_default_course",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      const preserved = yield* preserveV13Ledger(tx)
      const triggers = yield* tx
        .all<{ name: string }>(sql`SELECT name FROM sqlite_schema WHERE type = 'trigger' ORDER BY name`)
        .pipe(Effect.orDie)
      yield* Effect.forEach(
        triggers,
        (trigger) => tx.run(sql.raw(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`)).pipe(Effect.orDie),
        { discard: true },
      )
      yield* tx.run(`DROP VIEW IF EXISTS learning_command_invocation_constraint_v12`)
      yield* tx.run(`DROP VIEW IF EXISTS learning_command_receipt_constraint_v12`)
      yield* tx.run(
        `ALTER TABLE \`learner_default_course_transition\` ADD \`agent_action_part_id\` text REFERENCES learner_default_course_disposition(invocation_part_id);`,
      )
      yield* tx.run(
        `ALTER TABLE \`learner_default_course_acknowledgement\` ADD \`effect_agent_action_part_id\` text REFERENCES learner_default_course_disposition(invocation_part_id);`,
      )
      yield* tx.run(`ALTER TABLE \`learner_default_course_acknowledgement\` ADD \`agent_action_version\` integer;`)
      yield* tx.run(`ALTER TABLE \`learner_default_course_capability_issue\` ADD \`agent_action_fingerprint\` text;`)
      yield* tx.run(
        `ALTER TABLE \`learner_default_course_capability_settlement\` ADD \`agent_action_fingerprint\` text;`,
      )
      yield* tx.run(`ALTER TABLE \`learner_default_course_disposition\` ADD \`agent_action_version\` integer;`)
      yield* tx.run(`ALTER TABLE \`learner_default_course_disposition\` ADD \`agent_action_fingerprint\` text;`)
      yield* tx.run(`ALTER TABLE \`learner_default_course_disposition\` ADD \`agent_action_provenance\` text;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_default_course_transition\` (
          \`id\` text PRIMARY KEY,
          \`version\` integer NOT NULL CONSTRAINT \`learner_default_course_version_unique\` UNIQUE,
          \`predecessor_id\` text CONSTRAINT \`learner_default_course_predecessor_unique\` UNIQUE,
          \`previous_course_id\` text,
          \`course_id\` text,
          \`occurrence_id\` text NOT NULL CONSTRAINT \`learner_default_course_occurrence_unique\` UNIQUE,
          \`authorization_part_id\` text,
          \`agent_action_part_id\` text,
          \`permission_request_id\` text,
          \`confirmation_snapshot\` text,
          \`target_course_version\` integer,
          \`target_selection_revision_id\` text,
          \`target_selection_version\` integer,
          \`target_view_id\` text,
          \`target_view_version\` integer,
          \`target_revision_version\` integer,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          \`frontier_sequence\` integer NOT NULL CONSTRAINT \`learner_default_course_frontier_unique\` UNIQUE,
          \`frontier_time\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_transition_predecessor_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`predecessor_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_previous_course_id_course_id_fk\` FOREIGN KEY (\`previous_course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_course_id_course_id_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_course_id_target_view_id_course_view_course_id_id_fk\` FOREIGN KEY (\`course_id\`,\`target_view_id\`) REFERENCES \`course_view\`(\`course_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_course_id_target_view_id_target_selection_revision_id_course_view_revision_course_id_view_id_id_fk\` FOREIGN KEY (\`course_id\`,\`target_view_id\`,\`target_selection_revision_id\`) REFERENCES \`course_view_revision\`(\`course_id\`,\`view_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_authorization_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`authorization_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_transition_agent_action_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`agent_action_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_chain_shape" CHECK(("version" = 1 AND "predecessor_id" IS NULL AND "previous_course_id" IS NULL) OR ("version" > 1 AND "predecessor_id" IS NOT NULL)),
          CONSTRAINT "learner_default_course_value_changed" CHECK(NOT ("course_id" IS "previous_course_id")),
          CONSTRAINT "learner_default_course_target_shape" CHECK(("course_id" IS NULL AND "target_course_version" IS NULL AND "target_selection_revision_id" IS NULL AND "target_selection_version" IS NULL AND "target_view_id" IS NULL AND "target_view_version" IS NULL AND "target_revision_version" IS NULL) OR ("course_id" IS NOT NULL AND "target_course_version" IS NOT NULL AND "target_selection_version" IS NOT NULL AND (("target_selection_revision_id" IS NULL AND "target_view_id" IS NULL AND "target_view_version" IS NULL AND "target_revision_version" IS NULL) OR ("target_selection_revision_id" IS NOT NULL AND "target_view_id" IS NOT NULL AND "target_view_version" IS NOT NULL AND "target_revision_version" IS NOT NULL)))),
          CONSTRAINT "learner_default_course_versions" CHECK("version" >= 1 AND ("target_course_version" IS NULL OR "target_course_version" >= 0) AND ("target_selection_version" IS NULL OR "target_selection_version" >= 0) AND ("target_view_version" IS NULL OR "target_view_version" >= 0) AND ("target_revision_version" IS NULL OR "target_revision_version" >= 0)),
          CONSTRAINT "learner_default_course_legacy_confirmation_shape" CHECK(("permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL) OR ("permission_request_id" IS NOT NULL AND length("permission_request_id") > 0 AND json_valid("confirmation_snapshot"))),
          CONSTRAINT "learner_default_course_provenance_shape" CHECK(("authorization_part_id" IS NOT NULL AND "agent_action_part_id" IS NULL) OR ("authorization_part_id" IS NULL AND "agent_action_part_id" IS NOT NULL AND "permission_request_id" IS NULL AND "confirmation_snapshot" IS NULL)),
          CONSTRAINT "learner_default_course_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0 AND "frontier_sequence" >= 1 AND "frontier_time" = "time_committed")
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_default_course_transition\`(\`id\`, \`version\`, \`predecessor_id\`, \`previous_course_id\`, \`course_id\`, \`occurrence_id\`, \`authorization_part_id\`, \`permission_request_id\`, \`confirmation_snapshot\`, \`target_course_version\`, \`target_selection_revision_id\`, \`target_selection_version\`, \`target_view_id\`, \`target_view_version\`, \`target_revision_version\`, \`time_committed\`, \`commit_order\`, \`frontier_sequence\`, \`frontier_time\`) SELECT \`id\`, \`version\`, \`predecessor_id\`, \`previous_course_id\`, \`course_id\`, \`occurrence_id\`, \`authorization_part_id\`, \`permission_request_id\`, \`confirmation_snapshot\`, \`target_course_version\`, \`target_selection_revision_id\`, \`target_selection_version\`, \`target_view_id\`, \`target_view_version\`, \`target_revision_version\`, \`time_committed\`, \`commit_order\`, \`frontier_sequence\`, \`frontier_time\` FROM \`learner_default_course_transition\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_default_course_transition\`;`)
      yield* tx.run(
        `ALTER TABLE \`__new_learner_default_course_transition\` RENAME TO \`learner_default_course_transition\`;`,
      )
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_default_course_acknowledgement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`effect_authorization_part_id\` text,
          \`authorization_version\` integer,
          \`effect_agent_action_part_id\` text,
          \`agent_action_version\` integer,
          \`effect_id\` text NOT NULL,
          \`receipt_id\` text NOT NULL,
          \`operation\` text NOT NULL,
          \`from_locator\` text NOT NULL,
          \`to_locator\` text NOT NULL,
          \`relation\` text NOT NULL,
          \`presentation_snapshot\` text NOT NULL,
          \`presentation_fingerprint\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_invocation_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_effect_authorization_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`effect_authorization_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_effect_agent_action_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`effect_agent_action_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_effect_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_acknowledgement_shape" CHECK(
                "operation" IN ('set', 'change', 'clear')
                AND json_valid("from_locator")
                AND json_valid("to_locator")
                AND json_valid("presentation_snapshot")
                AND "relation" IN ('active', 'superseded')
                AND (
                  (
                    "authorization_version" = 1
                    AND "effect_authorization_part_id" IS NOT NULL
                    AND "agent_action_version" IS NULL
                    AND "effect_agent_action_part_id" IS NULL
                    AND (
            (
              json_extract("from_locator", '$.kind') = 'absent'
              AND json_type("from_locator", '$.locator') IS NULL
            )
            OR
            (
              json_extract("from_locator", '$.kind') = 'course'
              AND json_type("from_locator", '$.locator') = 'object'
              AND json_type("from_locator", '$.locator.courseID') = 'text'
              AND json_extract("from_locator", '$.locator.title.availability') IN ('recorded_v1', 'not_recorded_v1')
              AND json_extract("from_locator", '$.locator.courseVersion.availability') IN ('recorded_v1', 'not_recorded_v1')
              AND json_extract("from_locator", '$.locator.workingSelection.availability') IN ('recorded_v1', 'not_recorded_v1')
            )
          )
                    AND (
            (
              json_extract("to_locator", '$.kind') = 'absent'
              AND json_type("to_locator", '$.locator') IS NULL
            )
            OR
            (
              json_extract("to_locator", '$.kind') = 'course'
              AND json_type("to_locator", '$.locator') = 'object'
              AND json_type("to_locator", '$.locator.courseID') = 'text'
              AND json_extract("to_locator", '$.locator.title.availability') IN ('recorded_v1', 'not_recorded_v1')
              AND json_extract("to_locator", '$.locator.courseVersion.availability') IN ('recorded_v1', 'not_recorded_v1')
              AND json_extract("to_locator", '$.locator.workingSelection.availability') IN ('recorded_v1', 'not_recorded_v1')
            )
          )
                    AND json_extract("presentation_snapshot", '$.schemaVersion') = 1
                    AND json_extract("presentation_snapshot", '$.authorizationVersion') = 1
                    AND json_extract("presentation_snapshot", '$.effectAuthorizationPartID') =
                      "effect_authorization_part_id"
                    AND json_type("presentation_snapshot", '$.agentActionVersion') IS NULL
                    AND json_type("presentation_snapshot", '$.effectAgentActionPartID') IS NULL
                  )
                  OR (
                    "authorization_version" = 2
                    AND "effect_authorization_part_id" IS NOT NULL
                    AND "agent_action_version" IS NULL
                    AND "effect_agent_action_part_id" IS NULL
                    AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                    AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                    AND json_extract("presentation_snapshot", '$.schemaVersion') = 1
                    AND json_extract("presentation_snapshot", '$.authorizationVersion') = 2
                    AND json_extract("presentation_snapshot", '$.effectAuthorizationPartID') =
                      "effect_authorization_part_id"
                    AND json_type("presentation_snapshot", '$.agentActionVersion') IS NULL
                    AND json_type("presentation_snapshot", '$.effectAgentActionPartID') IS NULL
                  )
                  OR (
                    "authorization_version" IS NULL
                    AND "effect_authorization_part_id" IS NULL
                    AND "agent_action_version" = 3
                    AND "effect_agent_action_part_id" IS NOT NULL
                    AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                    AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                    AND json_extract("presentation_snapshot", '$.schemaVersion') = 2
                    AND json_extract("presentation_snapshot", '$.agentActionVersion') = 3
                    AND json_extract("presentation_snapshot", '$.effectAgentActionPartID') =
                      "effect_agent_action_part_id"
                    AND json_type("presentation_snapshot", '$.authorizationVersion') IS NULL
                    AND json_type("presentation_snapshot", '$.effectAuthorizationPartID') IS NULL
                  )
                )
              ),
          CONSTRAINT "learner_default_course_acknowledgement_fingerprint" CHECK(length("presentation_fingerprint") = 64 AND "presentation_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_default_course_acknowledgement_time" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_default_course_acknowledgement\`(\`invocation_part_id\`, \`effect_authorization_part_id\`, \`authorization_version\`, \`effect_id\`, \`receipt_id\`, \`operation\`, \`from_locator\`, \`to_locator\`, \`relation\`, \`presentation_snapshot\`, \`presentation_fingerprint\`, \`time_committed\`, \`commit_order\`) SELECT \`invocation_part_id\`, \`effect_authorization_part_id\`, \`authorization_version\`, \`effect_id\`, \`receipt_id\`, \`operation\`, \`from_locator\`, \`to_locator\`, \`relation\`, \`presentation_snapshot\`, \`presentation_fingerprint\`, \`time_committed\`, \`commit_order\` FROM \`learner_default_course_acknowledgement\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_default_course_acknowledgement\`;`)
      yield* tx.run(
        `ALTER TABLE \`__new_learner_default_course_acknowledgement\` RENAME TO \`learner_default_course_acknowledgement\`;`,
      )
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_default_course_capability_issue\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`permission_request_id\` text NOT NULL UNIQUE,
          \`authorization_fingerprint\` text,
          \`agent_action_fingerprint\` text,
          \`policy_basis\` text NOT NULL,
          \`policy_fingerprint\` text NOT NULL,
          \`shown_scope\` text NOT NULL,
          \`shown_scope_fingerprint\` text NOT NULL,
          \`time_issued\` integer NOT NULL,
          \`issue_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_capability_issue_invocation_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_default_course_capability_issue_invocation_request_unique\` UNIQUE(\`invocation_part_id\`,\`permission_request_id\`),
          CONSTRAINT "learner_default_course_capability_issue_fingerprints" CHECK(((length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*' AND "agent_action_fingerprint" IS NULL) OR ("authorization_fingerprint" IS NULL AND length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("shown_scope_fingerprint") = 64 AND "shown_scope_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_default_course_capability_issue_shape" CHECK(length("permission_request_id") > 0 AND json_valid("policy_basis") AND json_valid("shown_scope") AND "time_issued" >= 0 AND "issue_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_default_course_capability_issue\`(\`invocation_part_id\`, \`permission_request_id\`, \`authorization_fingerprint\`, \`policy_basis\`, \`policy_fingerprint\`, \`shown_scope\`, \`shown_scope_fingerprint\`, \`time_issued\`, \`issue_order\`) SELECT \`invocation_part_id\`, \`permission_request_id\`, \`authorization_fingerprint\`, \`policy_basis\`, \`policy_fingerprint\`, \`shown_scope\`, \`shown_scope_fingerprint\`, \`time_issued\`, \`issue_order\` FROM \`learner_default_course_capability_issue\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_default_course_capability_issue\`;`)
      yield* tx.run(
        `ALTER TABLE \`__new_learner_default_course_capability_issue\` RENAME TO \`learner_default_course_capability_issue\`;`,
      )
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_default_course_capability_settlement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`outcome\` text NOT NULL,
          \`permission_request_id\` text,
          \`authorization_fingerprint\` text,
          \`agent_action_fingerprint\` text,
          \`policy_basis\` text,
          \`policy_fingerprint\` text,
          \`reply\` text,
          \`reply_fingerprint\` text,
          \`time_settled\` integer NOT NULL,
          \`settlement_order\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_capability_settlement_invocation_part_id_learner_default_course_disposition_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learner_default_course_disposition\`(\`invocation_part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_capability_settlement_invocation_part_id_permission_request_id_learner_default_course_capability_issue_invocation_part_id_permission_request_id_fk\` FOREIGN KEY (\`invocation_part_id\`,\`permission_request_id\`) REFERENCES \`learner_default_course_capability_issue\`(\`invocation_part_id\`,\`permission_request_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_capability_settlement_fingerprints" CHECK(((length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*' AND "agent_action_fingerprint" IS NULL) OR ("authorization_fingerprint" IS NULL AND length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("policy_fingerprint" IS NULL OR (length("policy_fingerprint") = 64 AND "policy_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("reply_fingerprint" IS NULL OR (length("reply_fingerprint") = 64 AND "reply_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_default_course_capability_settlement_closed_union" CHECK((
                "outcome" = 'not_evaluated'
                AND "permission_request_id" IS NULL
                AND "policy_basis" IS NULL
                AND "policy_fingerprint" IS NULL
                AND "reply" IS NULL
                AND "reply_fingerprint" IS NULL
              ) OR (
                "outcome" IN ('policy_allow', 'policy_deny')
                AND "permission_request_id" IS NULL
                AND json_valid("policy_basis")
                AND "policy_fingerprint" IS NOT NULL
                AND "reply" IS NULL
                AND "reply_fingerprint" IS NULL
              ) OR (
                "outcome" = 'prompted_abort'
                AND "permission_request_id" IS NOT NULL
                AND "policy_basis" IS NULL
                AND "policy_fingerprint" IS NULL
                AND "reply" IS NULL
                AND "reply_fingerprint" IS NULL
              ) OR (
                "outcome" IN ('prompted_allow', 'prompted_deny', 'prompted_correct', 'prompted_cancel')
                AND "permission_request_id" IS NOT NULL
                AND "policy_basis" IS NULL
                AND "policy_fingerprint" IS NULL
                AND json_valid("reply")
                AND "reply_fingerprint" IS NOT NULL
              )),
          CONSTRAINT "learner_default_course_capability_settlement_time" CHECK("time_settled" >= 0 AND "settlement_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_default_course_capability_settlement\`(\`invocation_part_id\`, \`outcome\`, \`permission_request_id\`, \`authorization_fingerprint\`, \`policy_basis\`, \`policy_fingerprint\`, \`reply\`, \`reply_fingerprint\`, \`time_settled\`, \`settlement_order\`) SELECT \`invocation_part_id\`, \`outcome\`, \`permission_request_id\`, \`authorization_fingerprint\`, \`policy_basis\`, \`policy_fingerprint\`, \`reply\`, \`reply_fingerprint\`, \`time_settled\`, \`settlement_order\` FROM \`learner_default_course_capability_settlement\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_default_course_capability_settlement\`;`)
      yield* tx.run(
        `ALTER TABLE \`__new_learner_default_course_capability_settlement\` RENAME TO \`learner_default_course_capability_settlement\`;`,
      )
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_default_course_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`authorization_version\` integer,
          \`authorization_kind\` text,
          \`authorization_fingerprint\` text,
          \`agent_action_version\` integer,
          \`agent_action_fingerprint\` text,
          \`agent_action_provenance\` text,
          \`command_fingerprint\` text NOT NULL,
          \`semantic_outcome\` text,
          \`semantic_address\` text,
          \`semantic_address_fingerprint\` text,
          \`incoming_payload_fingerprint\` text,
          \`existing_effect_id\` text,
          \`existing_payload_fingerprint\` text,
          \`legacy_row_class\` text,
          \`confirmation_availability\` text,
          \`command_permission_request_id\` text,
          \`effect_confirmation_request_id\` text,
          \`legacy_effect_id\` text,
          \`legacy_receipt_id\` text,
          \`command_snapshot\` text,
          \`source_excerpt\` text,
          \`resolution_scope\` text,
          \`resolution_fingerprint\` text,
          \`preference_head_id\` text,
          \`preference_version\` integer,
          \`operation\` text,
          \`from_locator\` text,
          \`to_locator\` text,
          \`selected_course_id\` text,
          \`proposal_part_id\` text,
          \`proposal_presentation_part_id\` text,
          \`proposal_presentation_assistant_message_id\` text,
          \`proposal_assistant_message_id\` text,
          \`proposal_emission_ordinal\` integer,
          \`proposal_fingerprint\` text,
          \`proposal_selection\` text,
          \`time_disposed\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_disposition_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_disposition_proposal_part_id_learner_default_course_proposal_part_id_fk\` FOREIGN KEY (\`proposal_part_id\`) REFERENCES \`learner_default_course_proposal\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_disposition_fingerprints" CHECK(("authorization_fingerprint" IS NULL OR (length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("agent_action_fingerprint" IS NULL OR (length("agent_action_fingerprint") = 64 AND "agent_action_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*' AND ("semantic_address_fingerprint" IS NULL OR (length("semantic_address_fingerprint") = 64 AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("incoming_payload_fingerprint" IS NULL OR (length("incoming_payload_fingerprint") = 64 AND "incoming_payload_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("existing_payload_fingerprint" IS NULL OR (length("existing_payload_fingerprint") = 64 AND "existing_payload_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("resolution_fingerprint" IS NULL OR (length("resolution_fingerprint") = 64 AND "resolution_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("proposal_fingerprint" IS NULL OR (length("proposal_fingerprint") = 64 AND "proposal_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_default_course_disposition_closed_union" CHECK((
                "disposition" = 'legacy_v1'
                AND "authorization_version" = 1
                AND "authorization_kind" = 'legacy_v1'
                AND "authorization_fingerprint" IS NOT NULL
                AND "agent_action_version" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "semantic_outcome" IS NULL
                AND "semantic_address" IS NULL
                AND "semantic_address_fingerprint" IS NULL
                AND "incoming_payload_fingerprint" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_payload_fingerprint" IS NULL
                AND "legacy_row_class" IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')
                AND "command_permission_request_id" IS NOT NULL
                AND length("command_permission_request_id") > 0
                AND "command_snapshot" IS NULL
                AND "source_excerpt" IS NULL
                AND "resolution_scope" IS NULL
                AND "resolution_fingerprint" IS NULL
                AND "preference_head_id" IS NULL
                AND "preference_version" IS NULL
                AND "operation" IS NULL
                AND "from_locator" IS NULL
                AND "to_locator" IS NULL
                AND "selected_course_id" IS NULL
                AND "proposal_part_id" IS NULL
                AND "proposal_presentation_part_id" IS NULL
                AND "proposal_presentation_assistant_message_id" IS NULL
                AND "proposal_assistant_message_id" IS NULL
                AND "proposal_emission_ordinal" IS NULL
                AND "proposal_fingerprint" IS NULL
                AND "proposal_selection" IS NULL
                AND (
                  (
                    "legacy_row_class" IN ('applied', 'already_applied')
                    AND "confirmation_availability" = 'recorded_v1'
                    AND "effect_confirmation_request_id" IS NOT NULL
                    AND "legacy_effect_id" IS NOT NULL
                    AND "legacy_receipt_id" IS NOT NULL
                  )
                  OR
                  (
                    "legacy_row_class" IN ('admitted', 'no_change', 'error')
                    AND "confirmation_availability" = 'not_recorded_v1'
                    AND "effect_confirmation_request_id" IS NULL
                    AND "legacy_effect_id" IS NULL
                    AND "legacy_receipt_id" IS NULL
                  )
                )
              ) OR (
                "disposition" = 'semantic_terminal_v2'
                AND "authorization_version" IS NULL
                AND "authorization_kind" IS NULL
                AND "authorization_fingerprint" IS NULL
                AND "agent_action_version" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                AND json_valid("command_snapshot")
                AND json_valid("semantic_address")
                AND json_extract("semantic_address", '$.slot') = 'default_course_preference'
                AND "semantic_address_fingerprint" IS NOT NULL
                AND "incoming_payload_fingerprint" IS NOT NULL
                AND "existing_effect_id" IS NOT NULL
                AND "existing_payload_fingerprint" IS NOT NULL
                AND "legacy_row_class" IS NULL
                AND "confirmation_availability" IS NULL
                AND "command_permission_request_id" IS NULL
                AND "effect_confirmation_request_id" IS NULL
                AND "legacy_effect_id" IS NULL
                AND "legacy_receipt_id" IS NULL
                AND "source_excerpt" IS NULL
                AND "resolution_scope" IS NULL
                AND "resolution_fingerprint" IS NULL
                AND "preference_head_id" IS NULL
                AND "preference_version" IS NULL
                AND "operation" IS NULL
                AND "from_locator" IS NULL
                AND "to_locator" IS NULL
                AND "selected_course_id" IS NULL
                AND "proposal_part_id" IS NULL
                AND "proposal_presentation_part_id" IS NULL
                AND "proposal_presentation_assistant_message_id" IS NULL
                AND "proposal_assistant_message_id" IS NULL
                AND "proposal_emission_ordinal" IS NULL
                AND "proposal_fingerprint" IS NULL
                AND "proposal_selection" IS NULL
                AND (
            json_type("command_snapshot") = 'object'
            AND json_extract("command_snapshot", '$.kind') = 'default_course_preference'
            AND json_type("command_snapshot", '$.expectedHeadID') IN ('null', 'text')
            AND json_type("command_snapshot", '$.expectedVersion') = 'integer'
            AND json_extract("command_snapshot", '$.expectedVersion') >= 0
            AND json_type("command_snapshot", '$.target') IN ('null', 'object')
            AND json_remove("command_snapshot", '$.kind', '$.expectedHeadID', '$.expectedVersion', '$.target') = '{}'
            AND (
              json_type("command_snapshot", '$.target') = 'null'
              OR (
                json_type("command_snapshot", '$.target.courseID') = 'text'
                AND json_extract("command_snapshot", '$.target.courseID') GLOB 'crs_[0-9A-Za-z]*'
                AND length(json_extract("command_snapshot", '$.target.courseID')) = 30
                AND json_type("command_snapshot", '$.target.courseVersion') = 'integer'
                AND json_extract("command_snapshot", '$.target.courseVersion') >= 0
                AND json_type("command_snapshot", '$.target.selectionRevisionID') IN ('null', 'text')
                AND json_type("command_snapshot", '$.target.selectionVersion') = 'integer'
                AND json_extract("command_snapshot", '$.target.selectionVersion') >= 0
                AND json_type("command_snapshot", '$.target.viewID') IN ('null', 'text')
                AND json_type("command_snapshot", '$.target.viewVersion') IN ('null', 'integer')
                AND json_type("command_snapshot", '$.target.revisionVersion') IN ('null', 'integer')
                AND json_remove(
                  json_extract("command_snapshot", '$.target'),
                  '$.courseID',
                  '$.courseVersion',
                  '$.selectionRevisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
              )
            )
          )
              ) OR (
                "disposition" = 'semantic_terminal_v3'
                AND "authorization_version" IS NULL
                AND "authorization_kind" IS NULL
                AND "authorization_fingerprint" IS NULL
                AND "agent_action_version" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "semantic_outcome" IN ('already_applied', 'semantic_conflict')
                AND json_valid("command_snapshot")
                AND (
            json_type("command_snapshot") = 'object'
            AND (
              (
                json_extract("command_snapshot", '$.action') = 'clear'
                AND json_remove("command_snapshot", '$.action') = '{}'
              )
              OR (
                json_extract("command_snapshot", '$.action') = 'set'
                AND json_type("command_snapshot", '$.courseID') = 'text'
                AND json_extract("command_snapshot", '$.courseID') GLOB 'crs_[0-9A-Za-z]*'
                AND length(json_extract("command_snapshot", '$.courseID')) = 30
                AND json_remove("command_snapshot", '$.action', '$.courseID') = '{}'
              )
            )
          )
                AND json_valid("semantic_address")
                AND json_extract("semantic_address", '$.slot') = 'default_course_preference'
                AND "semantic_address_fingerprint" IS NOT NULL
                AND "incoming_payload_fingerprint" IS NOT NULL
                AND "existing_effect_id" IS NOT NULL
                AND "existing_payload_fingerprint" IS NOT NULL
                AND "legacy_row_class" IS NULL
                AND "confirmation_availability" IS NULL
                AND "command_permission_request_id" IS NULL
                AND "effect_confirmation_request_id" IS NULL
                AND "legacy_effect_id" IS NULL
                AND "legacy_receipt_id" IS NULL
                AND "source_excerpt" IS NULL
                AND "resolution_scope" IS NULL
                AND "resolution_fingerprint" IS NULL
                AND "preference_head_id" IS NULL
                AND "preference_version" IS NULL
                AND "operation" IS NULL
                AND "from_locator" IS NULL
                AND "to_locator" IS NULL
                AND "selected_course_id" IS NULL
                AND "proposal_part_id" IS NULL
                AND "proposal_presentation_part_id" IS NULL
                AND "proposal_presentation_assistant_message_id" IS NULL
                AND "proposal_assistant_message_id" IS NULL
                AND "proposal_emission_ordinal" IS NULL
                AND "proposal_fingerprint" IS NULL
                AND "proposal_selection" IS NULL
              ) OR (
                "disposition" = 'candidate_v2'
                AND "authorization_version" = 2
                AND "authorization_kind" IN ('direct_request_v2', 'accepted_proposal_v2')
                AND "authorization_fingerprint" IS NOT NULL
                AND "agent_action_version" IS NULL
                AND "agent_action_fingerprint" IS NULL
                AND "agent_action_provenance" IS NULL
                AND "semantic_outcome" IS NULL
                AND "semantic_address" IS NULL
                AND "semantic_address_fingerprint" IS NULL
                AND "incoming_payload_fingerprint" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_payload_fingerprint" IS NULL
                AND "legacy_row_class" IS NULL
                AND "confirmation_availability" IS NULL
                AND "command_permission_request_id" IS NULL
                AND "effect_confirmation_request_id" IS NULL
                AND "legacy_effect_id" IS NULL
                AND "legacy_receipt_id" IS NULL
                AND json_valid("command_snapshot")
                AND (
            json_type("command_snapshot") = 'object'
            AND json_extract("command_snapshot", '$.kind') = 'default_course_preference'
            AND json_type("command_snapshot", '$.expectedHeadID') IN ('null', 'text')
            AND json_type("command_snapshot", '$.expectedVersion') = 'integer'
            AND json_extract("command_snapshot", '$.expectedVersion') >= 0
            AND json_type("command_snapshot", '$.target') IN ('null', 'object')
            AND json_remove("command_snapshot", '$.kind', '$.expectedHeadID', '$.expectedVersion', '$.target') = '{}'
            AND (
              json_type("command_snapshot", '$.target') = 'null'
              OR (
                json_type("command_snapshot", '$.target.courseID') = 'text'
                AND json_extract("command_snapshot", '$.target.courseID') GLOB 'crs_[0-9A-Za-z]*'
                AND length(json_extract("command_snapshot", '$.target.courseID')) = 30
                AND json_type("command_snapshot", '$.target.courseVersion') = 'integer'
                AND json_extract("command_snapshot", '$.target.courseVersion') >= 0
                AND json_type("command_snapshot", '$.target.selectionRevisionID') IN ('null', 'text')
                AND json_type("command_snapshot", '$.target.selectionVersion') = 'integer'
                AND json_extract("command_snapshot", '$.target.selectionVersion') >= 0
                AND json_type("command_snapshot", '$.target.viewID') IN ('null', 'text')
                AND json_type("command_snapshot", '$.target.viewVersion') IN ('null', 'integer')
                AND json_type("command_snapshot", '$.target.revisionVersion') IN ('null', 'integer')
                AND json_remove(
                  json_extract("command_snapshot", '$.target'),
                  '$.courseID',
                  '$.courseVersion',
                  '$.selectionRevisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
              )
            )
          )
                AND length("source_excerpt") > 0
                AND json_valid("resolution_scope")
                AND "resolution_fingerprint" IS NOT NULL
                AND "preference_version" IS NOT NULL
                AND (("preference_version" = 0 AND "preference_head_id" IS NULL)
                  OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL))
                AND "operation" IN ('set', 'change', 'clear')
                AND json_valid("from_locator")
                AND json_valid("to_locator")
                AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                AND (
                  (
                    "authorization_kind" = 'direct_request_v2'
                    AND json_extract("resolution_scope", '$.coverage') = 'complete'
                    AND "proposal_part_id" IS NULL
                    AND "proposal_presentation_part_id" IS NULL
                    AND "proposal_presentation_assistant_message_id" IS NULL
                    AND "proposal_assistant_message_id" IS NULL
                    AND "proposal_emission_ordinal" IS NULL
                    AND "proposal_fingerprint" IS NULL
                    AND "proposal_selection" IS NULL
                  )
                  OR
                  (
                    "authorization_kind" = 'accepted_proposal_v2'
                    AND "proposal_part_id" IS NOT NULL
                    AND "proposal_presentation_part_id" IS NOT NULL
                    AND "proposal_presentation_assistant_message_id" IS NOT NULL
                    AND "proposal_assistant_message_id" IS NOT NULL
                    AND "proposal_emission_ordinal" IS NOT NULL
                    AND "proposal_emission_ordinal" >= 0
                    AND "proposal_fingerprint" IS NOT NULL
                    AND "proposal_selection" IN ('sole_presented', 'explicit_reference')
                  )
                )
              ) OR (
                "disposition" = 'agent_action_v3'
                AND "authorization_version" IS NULL
                AND "authorization_kind" IS NULL
                AND "authorization_fingerprint" IS NULL
                AND "agent_action_version" = 3
                AND "agent_action_fingerprint" IS NOT NULL
                AND json_valid("agent_action_provenance")
                AND json_extract("agent_action_provenance", '$.schemaVersion') = 1
                AND json_extract("agent_action_provenance", '$.kind') IN ('root', 'delegated')
                AND json_extract("agent_action_provenance", '$.capabilityIdentity') = 'set_default_course_preference'
                AND json_extract("agent_action_provenance", '$.capabilityVersion') = 3
                AND json_type("agent_action_provenance", '$.lineage') = 'array'
                AND (
                  (
                    json_extract("agent_action_provenance", '$.kind') = 'root'
                    AND json_array_length("agent_action_provenance", '$.lineage') = 0
                  )
                  OR (
                    json_extract("agent_action_provenance", '$.kind') = 'delegated'
                    AND json_array_length("agent_action_provenance", '$.lineage') > 0
                  )
                )
                AND "semantic_outcome" IS NULL
                AND "semantic_address" IS NULL
                AND "semantic_address_fingerprint" IS NULL
                AND "incoming_payload_fingerprint" IS NULL
                AND "existing_effect_id" IS NULL
                AND "existing_payload_fingerprint" IS NULL
                AND "legacy_row_class" IS NULL
                AND "confirmation_availability" IS NULL
                AND "command_permission_request_id" IS NULL
                AND "effect_confirmation_request_id" IS NULL
                AND "legacy_effect_id" IS NULL
                AND "legacy_receipt_id" IS NULL
                AND json_valid("command_snapshot")
                AND "source_excerpt" IS NULL
                AND "resolution_scope" IS NULL
                AND "resolution_fingerprint" IS NULL
                AND "preference_version" IS NOT NULL
                AND (("preference_version" = 0 AND "preference_head_id" IS NULL)
                  OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL))
                AND "operation" IN ('set', 'change', 'clear')
                AND json_valid("from_locator")
                AND json_valid("to_locator")
                AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)
                AND (
            json_type("command_snapshot") = 'object'
            AND (
              (
                json_extract("command_snapshot", '$.action') = 'clear'
                AND json_remove("command_snapshot", '$.action') = '{}'
              )
              OR (
                json_extract("command_snapshot", '$.action') = 'set'
                AND json_type("command_snapshot", '$.courseID') = 'text'
                AND json_extract("command_snapshot", '$.courseID') GLOB 'crs_[0-9A-Za-z]*'
                AND length(json_extract("command_snapshot", '$.courseID')) = 30
                AND json_remove("command_snapshot", '$.action', '$.courseID') = '{}'
              )
            )
          )
                AND "selected_course_id" IS NULL
                AND (
                  (
                    json_extract("command_snapshot", '$.action') = 'clear'
                    AND json_extract("to_locator", '$.kind') = 'absent'
                  )
                  OR (
                    json_extract("command_snapshot", '$.action') = 'set'
                    AND json_extract("to_locator", '$.kind') = 'course'
                    AND json_extract("command_snapshot", '$.courseID') =
                      json_extract("to_locator", '$.locator.courseID')
                  )
                )
                AND "proposal_part_id" IS NULL
                AND "proposal_presentation_part_id" IS NULL
                AND "proposal_presentation_assistant_message_id" IS NULL
                AND "proposal_assistant_message_id" IS NULL
                AND "proposal_emission_ordinal" IS NULL
                AND "proposal_fingerprint" IS NULL
                AND "proposal_selection" IS NULL
              )),
          CONSTRAINT "learner_default_course_disposition_time" CHECK("time_disposed" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_default_course_disposition\`(\`invocation_part_id\`, \`disposition\`, \`authorization_version\`, \`authorization_kind\`, \`authorization_fingerprint\`, \`command_fingerprint\`, \`semantic_outcome\`, \`semantic_address\`, \`semantic_address_fingerprint\`, \`incoming_payload_fingerprint\`, \`existing_effect_id\`, \`existing_payload_fingerprint\`, \`legacy_row_class\`, \`confirmation_availability\`, \`command_permission_request_id\`, \`effect_confirmation_request_id\`, \`legacy_effect_id\`, \`legacy_receipt_id\`, \`command_snapshot\`, \`source_excerpt\`, \`resolution_scope\`, \`resolution_fingerprint\`, \`preference_head_id\`, \`preference_version\`, \`operation\`, \`from_locator\`, \`to_locator\`, \`selected_course_id\`, \`proposal_part_id\`, \`proposal_presentation_part_id\`, \`proposal_presentation_assistant_message_id\`, \`proposal_assistant_message_id\`, \`proposal_emission_ordinal\`, \`proposal_fingerprint\`, \`proposal_selection\`, \`time_disposed\`) SELECT \`invocation_part_id\`, \`disposition\`, \`authorization_version\`, \`authorization_kind\`, \`authorization_fingerprint\`, \`command_fingerprint\`, \`semantic_outcome\`, \`semantic_address\`, \`semantic_address_fingerprint\`, \`incoming_payload_fingerprint\`, \`existing_effect_id\`, \`existing_payload_fingerprint\`, \`legacy_row_class\`, \`confirmation_availability\`, \`command_permission_request_id\`, \`effect_confirmation_request_id\`, \`legacy_effect_id\`, \`legacy_receipt_id\`, \`command_snapshot\`, \`source_excerpt\`, \`resolution_scope\`, \`resolution_fingerprint\`, \`preference_head_id\`, \`preference_version\`, \`operation\`, \`from_locator\`, \`to_locator\`, \`selected_course_id\`, \`proposal_part_id\`, \`proposal_presentation_part_id\`, \`proposal_presentation_assistant_message_id\`, \`proposal_assistant_message_id\`, \`proposal_emission_ordinal\`, \`proposal_fingerprint\`, \`proposal_selection\`, \`time_disposed\` FROM \`learner_default_course_disposition\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_default_course_disposition\`;`)
      yield* tx.run(
        `ALTER TABLE \`__new_learner_default_course_disposition\` RENAME TO \`learner_default_course_disposition\`;`,
      )
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learning_command_invocation\` (
          \`part_id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`parent_user_message_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`provider_call_id\` text NOT NULL,
          \`occurrence_id\` text NOT NULL,
          \`command_name\` text NOT NULL,
          \`command_version\` integer NOT NULL,
          \`emission_ordinal\` integer NOT NULL,
          \`capability_identity\` text NOT NULL,
          \`capability_version\` integer NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`input_fingerprint\` text NOT NULL,
          \`status\` text NOT NULL,
          \`receipt_id\` text,
          \`settlement\` text,
          \`time_admitted\` integer NOT NULL,
          \`time_settled\` integer,
          \`settlement_order\` integer,
          \`turn_id\` text,
          \`input_id\` text,
          CONSTRAINT \`fk_learning_command_invocation_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learning_command_invocation_assistant_call_unique\` UNIQUE(\`assistant_message_id\`,\`provider_call_id\`),
          CONSTRAINT \`learning_command_invocation_assistant_ordinal_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learning_command_invocation_call_nonempty" CHECK(length("provider_call_id") > 0),
          CONSTRAINT "learning_command_invocation_command_nonempty" CHECK(length("command_name") > 0),
          CONSTRAINT "learning_command_invocation_command_version" CHECK("command_version" >= 1),
          CONSTRAINT "learning_command_invocation_emission_ordinal" CHECK("emission_ordinal" >= 0),
          CONSTRAINT "learning_command_invocation_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_invocation_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_invocation_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance', 'agent_action')),
          CONSTRAINT "learning_command_invocation_fingerprint" CHECK(length("input_fingerprint") = 64 AND "input_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learning_command_invocation_status" CHECK("status" IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')),
          CONSTRAINT "learning_command_invocation_settlement_shape" CHECK(("status" = 'admitted' AND "receipt_id" IS NULL AND "settlement" IS NULL AND "time_settled" IS NULL AND "settlement_order" IS NULL) OR ("status" <> 'admitted' AND json_valid("settlement") AND json_type("settlement") = 'object' AND json_extract("settlement", '$.outcome') = "status" AND json_extract("settlement", '$.settlementTime') = "time_settled" AND json_extract("settlement", '$.settlementOrder') = "settlement_order")),
          CONSTRAINT "learning_command_invocation_receipt_shape" CHECK(("status" IN ('applied', 'already_applied') AND "receipt_id" IS NOT NULL AND length("receipt_id") > 0 AND json_extract("settlement", '$.receiptID') = "receipt_id") OR ("status" IN ('admitted', 'no_change', 'error') AND "receipt_id" IS NULL AND ("settlement" IS NULL OR json_extract("settlement", '$.receiptID') IS NULL))),
          CONSTRAINT "learning_command_invocation_time_order" CHECK("time_admitted" >= 0 AND ("time_settled" IS NULL OR "time_settled" >= "time_admitted") AND ("settlement_order" IS NULL OR "settlement_order" >= 0))
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_invocation\`(\`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`status\`, \`receipt_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\`, \`turn_id\`, \`input_id\`) SELECT \`part_id\`, \`session_id\`, \`parent_user_message_id\`, \`assistant_message_id\`, \`provider_call_id\`, \`occurrence_id\`, \`command_name\`, \`command_version\`, \`emission_ordinal\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`input_fingerprint\`, \`status\`, \`receipt_id\`, \`settlement\`, \`time_admitted\`, \`time_settled\`, \`settlement_order\`, \`turn_id\`, \`input_id\` FROM \`learning_command_invocation\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_command_invocation\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_command_invocation\` RENAME TO \`learning_command_invocation\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learning_command_receipt\` (
          \`id\` text PRIMARY KEY,
          \`occurrence_id\` text NOT NULL,
          \`origin_session_id\` text NOT NULL,
          \`origin_message_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`invocation_part_id\` text NOT NULL CONSTRAINT \`learning_command_receipt_invocation_unique\` UNIQUE,
          \`capability_identity\` text NOT NULL,
          \`capability_version\` integer NOT NULL,
          \`authorization_basis\` text NOT NULL,
          \`time_committed\` integer NOT NULL,
          \`commit_order\` integer NOT NULL,
          CONSTRAINT \`fk_learning_command_receipt_occurrence_id_learning_admitted_occurrence_id_fk\` FOREIGN KEY (\`occurrence_id\`) REFERENCES \`learning_admitted_occurrence\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learning_command_receipt_invocation_part_id_learning_command_invocation_part_id_fk\` FOREIGN KEY (\`invocation_part_id\`) REFERENCES \`learning_command_invocation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT "learning_command_receipt_capability" CHECK(length("capability_identity") > 0),
          CONSTRAINT "learning_command_receipt_capability_version" CHECK("capability_version" >= 1),
          CONSTRAINT "learning_command_receipt_authorization_basis" CHECK("authorization_basis" IN ('learner_request', 'learner_acceptance', 'agent_action')),
          CONSTRAINT "learning_command_receipt_time_order" CHECK("time_committed" >= 0 AND "commit_order" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learning_command_receipt\`(\`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`time_committed\`, \`commit_order\`) SELECT \`id\`, \`occurrence_id\`, \`origin_session_id\`, \`origin_message_id\`, \`assistant_message_id\`, \`invocation_part_id\`, \`capability_identity\`, \`capability_version\`, \`authorization_basis\`, \`time_committed\`, \`commit_order\` FROM \`learning_command_receipt\`;`,
      )
      yield* tx.run(`DROP TABLE \`learning_command_receipt\`;`)
      yield* tx.run(`ALTER TABLE \`__new_learning_command_receipt\` RENAME TO \`learning_command_receipt\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_default_course_proposal\` (
          \`part_id\` text PRIMARY KEY,
          \`turn_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`call_id\` text NOT NULL,
          \`emission_ordinal\` integer NOT NULL,
          \`command_snapshot\` text NOT NULL,
          \`command_fingerprint\` text NOT NULL,
          \`resolution_scope\` text NOT NULL,
          \`resolution_fingerprint\` text NOT NULL,
          \`preference_head_id\` text,
          \`preference_version\` integer NOT NULL,
          \`operation\` text NOT NULL,
          \`from_locator\` text NOT NULL,
          \`to_locator\` text NOT NULL,
          \`proposal_fingerprint\` text NOT NULL,
          \`terminal_part_fingerprint\` text NOT NULL,
          \`time_presented\` integer NOT NULL,
          CONSTRAINT \`fk_learner_default_course_proposal_turn_id_part_id_assistant_message_id_turn_tool_candidate_turn_id_part_id_assistant_message_id_fk\` FOREIGN KEY (\`turn_id\`,\`part_id\`,\`assistant_message_id\`) REFERENCES \`turn_tool_candidate\`(\`turn_id\`,\`part_id\`,\`assistant_message_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_proposal_part_id_turn_candidate_presentation_part_id_fk\` FOREIGN KEY (\`part_id\`) REFERENCES \`turn_candidate_presentation\`(\`part_id\`) ON DELETE RESTRICT,
          CONSTRAINT \`learner_default_course_proposal_assistant_emission_unique\` UNIQUE(\`assistant_message_id\`,\`emission_ordinal\`),
          CONSTRAINT "learner_default_course_proposal_fingerprints" CHECK(length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("resolution_fingerprint") = 64 AND "resolution_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("proposal_fingerprint") = 64 AND "proposal_fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("terminal_part_fingerprint") = 64 AND "terminal_part_fingerprint" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "learner_default_course_proposal_json" CHECK(json_valid("command_snapshot") AND json_valid("resolution_scope") AND json_valid("from_locator") AND json_valid("to_locator") AND COALESCE((
            json_type("from_locator") = 'object'
            AND (
              (
                json_extract("from_locator", '$.kind') = 'absent'
                AND json_remove("from_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("from_locator", '$.kind') = 'course'
                AND json_type("from_locator", '$.locator') = 'object'
                AND json_remove("from_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("from_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("from_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("from_locator", '$.locator.courseID')) > 0
                AND json_type("from_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.title.value') = 'text'
                AND json_type("from_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("from_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("from_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("from_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("from_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("from_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("from_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("from_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("from_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("from_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("from_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0) AND COALESCE((
            json_type("to_locator") = 'object'
            AND (
              (
                json_extract("to_locator", '$.kind') = 'absent'
                AND json_remove("to_locator", '$.kind') = '{}'
              )
              OR
              (
                json_extract("to_locator", '$.kind') = 'course'
                AND json_type("to_locator", '$.locator') = 'object'
                AND json_remove("to_locator", '$.kind', '$.locator') = '{}'
                AND json_remove(
                  json_extract("to_locator", '$.locator'),
                  '$.courseID',
                  '$.title',
                  '$.courseVersion',
                  '$.workingSelection'
                ) = '{}'
                AND json_type("to_locator", '$.locator.courseID') = 'text'
                AND length(json_extract("to_locator", '$.locator.courseID')) > 0
                AND json_type("to_locator", '$.locator.title') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.title'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.title.value') = 'text'
                AND json_type("to_locator", '$.locator.courseVersion') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.courseVersion'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.courseVersion.value') = 'integer'
                AND json_extract("to_locator", '$.locator.courseVersion.value') >= 0
                AND json_type("to_locator", '$.locator.workingSelection') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection'),
                  '$.availability',
                  '$.value'
                ) = '{}'
                AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
                AND json_type("to_locator", '$.locator.workingSelection.value') = 'object'
                AND json_remove(
                  json_extract("to_locator", '$.locator.workingSelection.value'),
                  '$.revisionID',
                  '$.selectionVersion',
                  '$.viewID',
                  '$.viewName',
                  '$.viewVersion',
                  '$.revisionVersion'
                ) = '{}'
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.selectionVersion') = 'integer'
                AND json_extract("to_locator", '$.locator.workingSelection.value.selectionVersion') >= 0
                AND json_type("to_locator", '$.locator.workingSelection.value.viewID') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewName') IN ('text', 'null')
                AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.viewVersion') >= 0
                )
                AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') IN ('integer', 'null')
                AND (
                  json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  OR json_extract("to_locator", '$.locator.workingSelection.value.revisionVersion') >= 0
                )
                AND (
                  (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'null'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'null'
                  )
                  OR (
                    json_type("to_locator", '$.locator.workingSelection.value.revisionID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewID') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewName') = 'text'
                    AND json_type("to_locator", '$.locator.workingSelection.value.viewVersion') = 'integer'
                    AND json_type("to_locator", '$.locator.workingSelection.value.revisionVersion') = 'integer'
                  )
                )
              )
            )
          ), 0)),
          CONSTRAINT "learner_default_course_proposal_head" CHECK(("preference_version" = 0 AND "preference_head_id" IS NULL) OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL)),
          CONSTRAINT "learner_default_course_proposal_operation" CHECK("operation" IN ('set', 'change', 'clear')),
          CONSTRAINT "learner_default_course_proposal_time_order" CHECK("emission_ordinal" >= 0 AND "time_presented" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_default_course_proposal\`(\`part_id\`,\`turn_id\`,\`session_id\`,\`assistant_message_id\`,\`call_id\`,\`emission_ordinal\`,\`command_snapshot\`,\`command_fingerprint\`,\`resolution_scope\`,\`resolution_fingerprint\`,\`preference_head_id\`,\`preference_version\`,\`operation\`,\`from_locator\`,\`to_locator\`,\`proposal_fingerprint\`,\`terminal_part_fingerprint\`,\`time_presented\`) SELECT \`part_id\`,\`turn_id\`,\`session_id\`,\`assistant_message_id\`,\`call_id\`,\`emission_ordinal\`,\`command_snapshot\`,\`command_fingerprint\`,\`resolution_scope\`,\`resolution_fingerprint\`,\`preference_head_id\`,\`preference_version\`,\`operation\`,\`from_locator\`,\`to_locator\`,\`proposal_fingerprint\`,\`terminal_part_fingerprint\`,\`time_presented\` FROM \`learner_default_course_proposal\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_default_course_proposal\`;`)
      yield* tx.run(
        `ALTER TABLE \`__new_learner_default_course_proposal\` RENAME TO \`learner_default_course_proposal\`;`,
      )
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE INDEX \`learner_default_course_history_idx\` ON \`learner_default_course_transition\` (\`version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_default_course_frontier_idx\` ON \`learner_default_course_transition\` (\`frontier_sequence\`,\`version\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learner_default_course_acknowledgement_effect_idx\` ON \`learner_default_course_acknowledgement\` (\`effect_id\`,\`invocation_part_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`learning_command_invocation_one_mutation_idx\` ON \`learning_command_invocation\` (\`assistant_message_id\`) WHERE "learning_command_invocation"."status" = 'applied';`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_invocation_session_owner_idx\` ON \`learning_command_invocation\` (\`session_id\`,\`assistant_message_id\`,\`part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_invocation_occurrence_idx\` ON \`learning_command_invocation\` (\`occurrence_id\`,\`part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_invocation_admitted_idx\` ON \`learning_command_invocation\` (\`status\`,\`session_id\`,\`time_admitted\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_invocation_receipt_idx\` ON \`learning_command_invocation\` (\`receipt_id\`,\`part_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`learning_command_receipt_occurrence_idx\` ON \`learning_command_receipt\` (\`occurrence_id\`,\`id\`);`,
      )
      const observed = yield* preserveV13Ledger(tx, preserved)
      if (!isDeepStrictEqual(observed, preserved)) {
        return yield* Effect.fail(new Error("V14 migration changed frozen V13 learning-command bytes"))
      }
      yield* installSchemaExtrasV14(tx)
    })
  },
} satisfies DatabaseMigration.Migration

type Transaction = Parameters<DatabaseMigration.Migration["up"]>[0]

type PreservedTable = Readonly<{
  name: string
  columns: readonly string[]
  rows: readonly Readonly<Record<string, unknown>>[]
}>

const preservedTables = [
  "learning_command_invocation",
  "learning_command_receipt",
  "learner_default_course_proposal",
  "learner_default_course_disposition",
  "learner_default_course_capability_issue",
  "learner_default_course_capability_settlement",
  "learner_default_course_transition",
  "learner_default_course_commit_seal",
  "learner_default_course_acknowledgement",
] as const

function preserveV13Ledger(tx: Transaction, expected?: readonly PreservedTable[]) {
  return Effect.forEach(expected ?? preservedTables, (entry) =>
    Effect.gen(function* () {
      const name = typeof entry === "string" ? entry : entry.name
      const info = yield* tx
        .all<{ name: string; pk: number }>(sql.raw(`PRAGMA table_info(${quoteIdentifier(name)})`))
        .pipe(Effect.orDie)
      const columns = typeof entry === "string" ? info.map((column) => column.name) : [...entry.columns]
      if (columns.length === 0) {
        return yield* Effect.fail(new Error(`V14 migration cannot preserve missing V13 table ${name}`))
      }
      const order = info
        .filter((column) => column.pk > 0)
        .toSorted((left, right) => left.pk - right.pk)
        .map((column) => quoteIdentifier(column.name))
      const projection = columns.map(quoteIdentifier).join(", ")
      const rows = yield* tx
        .all<
          Record<string, unknown>
        >(sql.raw(`SELECT ${projection} FROM ${quoteIdentifier(name)}${order.length > 0 ? ` ORDER BY ${order.join(", ")}` : ""}`))
        .pipe(Effect.orDie)
      return { name, columns, rows } satisfies PreservedTable
    }),
  )
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}
