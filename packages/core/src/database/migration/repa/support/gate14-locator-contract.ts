import { Effect } from "effect"
import type { DatabaseMigration } from "../../../migration"

export const gate14LocatorContractMigration = {
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_learner_default_course_acknowledgement\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`effect_authorization_part_id\` text NOT NULL,
          \`authorization_version\` integer NOT NULL,
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
          CONSTRAINT \`fk_learner_default_course_acknowledgement_effect_id_learner_default_course_transition_id_fk\` FOREIGN KEY (\`effect_id\`) REFERENCES \`learner_default_course_transition\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_learner_default_course_acknowledgement_receipt_id_learning_command_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`learning_command_receipt\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "learner_default_course_acknowledgement_shape" CHECK("authorization_version" IN (1, 2) AND "operation" IN ('set', 'change', 'clear') AND json_valid("from_locator") AND json_valid("to_locator") AND (("authorization_version" = 1 AND (
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
          ) AND (
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
          )) OR ("authorization_version" = 2 AND (
            (
              json_extract("from_locator", '$.kind') = 'absent'
              AND json_type("from_locator", '$.locator') IS NULL
            )
            OR
            (
              json_extract("from_locator", '$.kind') = 'course'
              AND json_type("from_locator", '$.locator') = 'object'
              AND json_type("from_locator", '$.locator.courseID') = 'text'
              AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
              AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
              AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
            )
          ) AND (
            (
              json_extract("to_locator", '$.kind') = 'absent'
              AND json_type("to_locator", '$.locator') IS NULL
            )
            OR
            (
              json_extract("to_locator", '$.kind') = 'course'
              AND json_type("to_locator", '$.locator') = 'object'
              AND json_type("to_locator", '$.locator.courseID') = 'text'
              AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
              AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
              AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
            )
          ))) AND "relation" IN ('active', 'superseded') AND json_valid("presentation_snapshot")),
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
        CREATE TABLE \`__new_learner_default_course_disposition\` (
          \`invocation_part_id\` text PRIMARY KEY,
          \`disposition\` text NOT NULL,
          \`authorization_version\` integer,
          \`authorization_kind\` text,
          \`authorization_fingerprint\` text,
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
          CONSTRAINT "learner_default_course_disposition_fingerprints" CHECK(("authorization_fingerprint" IS NULL OR (length("authorization_fingerprint") = 64 AND "authorization_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND length("command_fingerprint") = 64 AND "command_fingerprint" NOT GLOB '*[^0-9a-f]*' AND ("semantic_address_fingerprint" IS NULL OR (length("semantic_address_fingerprint") = 64 AND "semantic_address_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("incoming_payload_fingerprint" IS NULL OR (length("incoming_payload_fingerprint") = 64 AND "incoming_payload_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("existing_payload_fingerprint" IS NULL OR (length("existing_payload_fingerprint") = 64 AND "existing_payload_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("resolution_fingerprint" IS NULL OR (length("resolution_fingerprint") = 64 AND "resolution_fingerprint" NOT GLOB '*[^0-9a-f]*')) AND ("proposal_fingerprint" IS NULL OR (length("proposal_fingerprint") = 64 AND "proposal_fingerprint" NOT GLOB '*[^0-9a-f]*'))),
          CONSTRAINT "learner_default_course_disposition_closed_union" CHECK((
                "disposition" = 'legacy_v1'
                AND "authorization_version" = 1
                AND "authorization_kind" = 'legacy_v1'
                AND "authorization_fingerprint" IS NOT NULL
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
              ) OR (
                "disposition" = 'candidate_v2'
                AND "authorization_version" = 2
                AND "authorization_kind" IN ('direct_request_v2', 'accepted_proposal_v2')
                AND "authorization_fingerprint" IS NOT NULL
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
                AND length("source_excerpt") > 0
                AND json_valid("resolution_scope")
                AND "resolution_fingerprint" IS NOT NULL
                AND "preference_version" IS NOT NULL
                AND (("preference_version" = 0 AND "preference_head_id" IS NULL)
                  OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL))
                AND "operation" IN ('set', 'change', 'clear')
                AND json_valid("from_locator")
                AND json_valid("to_locator")
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
              AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
              AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
              AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
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
              AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
              AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
              AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
            )
          )
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
          CONSTRAINT "learner_default_course_proposal_json" CHECK(json_valid("command_snapshot") AND json_valid("resolution_scope") AND json_valid("from_locator") AND json_valid("to_locator") AND (
            (
              json_extract("from_locator", '$.kind') = 'absent'
              AND json_type("from_locator", '$.locator') IS NULL
            )
            OR
            (
              json_extract("from_locator", '$.kind') = 'course'
              AND json_type("from_locator", '$.locator') = 'object'
              AND json_type("from_locator", '$.locator.courseID') = 'text'
              AND json_extract("from_locator", '$.locator.title.availability') = 'recorded_v2'
              AND json_extract("from_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
              AND json_extract("from_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
            )
          ) AND (
            (
              json_extract("to_locator", '$.kind') = 'absent'
              AND json_type("to_locator", '$.locator') IS NULL
            )
            OR
            (
              json_extract("to_locator", '$.kind') = 'course'
              AND json_type("to_locator", '$.locator') = 'object'
              AND json_type("to_locator", '$.locator.courseID') = 'text'
              AND json_extract("to_locator", '$.locator.title.availability') = 'recorded_v2'
              AND json_extract("to_locator", '$.locator.courseVersion.availability') = 'recorded_v2'
              AND json_extract("to_locator", '$.locator.workingSelection.availability') = 'recorded_v2'
            )
          )),
          CONSTRAINT "learner_default_course_proposal_head" CHECK(("preference_version" = 0 AND "preference_head_id" IS NULL) OR ("preference_version" > 0 AND "preference_head_id" IS NOT NULL)),
          CONSTRAINT "learner_default_course_proposal_operation" CHECK("operation" IN ('set', 'change', 'clear')),
          CONSTRAINT "learner_default_course_proposal_time_order" CHECK("emission_ordinal" >= 0 AND "time_presented" >= 0)
        ) WITHOUT ROWID;
      `)
      yield* tx.run(
        `INSERT INTO \`__new_learner_default_course_proposal\`(\`part_id\`, \`turn_id\`, \`session_id\`, \`assistant_message_id\`, \`call_id\`, \`emission_ordinal\`, \`command_snapshot\`, \`command_fingerprint\`, \`resolution_scope\`, \`resolution_fingerprint\`, \`preference_head_id\`, \`preference_version\`, \`operation\`, \`from_locator\`, \`to_locator\`, \`proposal_fingerprint\`, \`terminal_part_fingerprint\`, \`time_presented\`) SELECT \`part_id\`, \`turn_id\`, \`session_id\`, \`assistant_message_id\`, \`call_id\`, \`emission_ordinal\`, \`command_snapshot\`, \`command_fingerprint\`, \`resolution_scope\`, \`resolution_fingerprint\`, \`preference_head_id\`, \`preference_version\`, \`operation\`, \`from_locator\`, \`to_locator\`, \`proposal_fingerprint\`, \`terminal_part_fingerprint\`, \`time_presented\` FROM \`learner_default_course_proposal\`;`,
      )
      yield* tx.run(`DROP TABLE \`learner_default_course_proposal\`;`)
      yield* tx.run(
        `ALTER TABLE \`__new_learner_default_course_proposal\` RENAME TO \`learner_default_course_proposal\`;`,
      )
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE INDEX \`learner_default_course_acknowledgement_effect_idx\` ON \`learner_default_course_acknowledgement\` (\`effect_id\`,\`invocation_part_id\`);`,
      )
    })
  },
} satisfies Omit<DatabaseMigration.Migration, "id">
