import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260716152016_source_artifact_authority",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`artifact_current_source\` (
          \`artifact_id\` text PRIMARY KEY,
          \`source_version\` integer DEFAULT 0 NOT NULL,
          \`active_binding_id\` text,
          \`current_revision_id\` text,
          \`revision_attribution_member_id\` text,
          \`source_state_observation_id\` text,
          \`source_state_member_id\` text,
          \`descriptor_observation_id\` text,
          \`descriptor_correction_id\` text,
          \`effective_media_type\` text,
          \`availability\` text NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_current_source_artifact_id_artifact_id_fk\` FOREIGN KEY (\`artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_artifact_id_active_binding_id_artifact_source_binding_recorded_artifact_id_id_fk\` FOREIGN KEY (\`artifact_id\`,\`active_binding_id\`) REFERENCES \`artifact_source_binding\`(\`recorded_artifact_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_current_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`current_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_revision_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`revision_attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_artifact_id_source_state_observation_id_artifact_source_observation_recorded_artifact_id_id_fk\` FOREIGN KEY (\`artifact_id\`,\`source_state_observation_id\`) REFERENCES \`artifact_source_observation\`(\`recorded_artifact_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_source_state_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`source_state_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_descriptor_observation_id_artifact_source_observation_id_fk\` FOREIGN KEY (\`descriptor_observation_id\`) REFERENCES \`artifact_source_observation\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_current_source_descriptor_observation_id_descriptor_correction_id_artifact_observation_correction_observation_id_id_fk\` FOREIGN KEY (\`descriptor_observation_id\`,\`descriptor_correction_id\`) REFERENCES \`artifact_observation_correction\`(\`observation_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "artifact_current_source_version_nonnegative" CHECK("source_version" >= 0),
          CONSTRAINT "artifact_current_source_state_shape" CHECK(("current_revision_id" IS NULL AND "availability" = 'unbound' AND "active_binding_id" IS NULL AND "revision_attribution_member_id" IS NULL AND "source_state_observation_id" IS NULL AND "source_state_member_id" IS NULL AND "descriptor_observation_id" IS NULL AND "descriptor_correction_id" IS NULL AND "effective_media_type" IS NULL) OR ("current_revision_id" IS NOT NULL AND (("source_state_observation_id" IS NOT NULL AND "source_state_member_id" IS NULL) OR ("source_state_observation_id" IS NULL AND "source_state_member_id" IS NOT NULL)) AND "descriptor_observation_id" IS NOT NULL AND "effective_media_type" IS NOT NULL AND length("effective_media_type") > 0 AND (("availability" IN ('available', 'missing')) AND "active_binding_id" IS NOT NULL OR ("availability" = 'unbound' AND "active_binding_id" IS NULL)))),
          CONSTRAINT "artifact_current_source_descriptor_shape" CHECK("descriptor_correction_id" IS NULL OR "descriptor_observation_id" IS NOT NULL),
          CONSTRAINT "artifact_current_source_time_nonnegative" CHECK("time_updated" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_lineage_correction_member\` (
          \`id\` text PRIMARY KEY,
          \`set_id\` text NOT NULL,
          \`recorded_artifact_id\` text NOT NULL,
          \`lineage_version\` integer NOT NULL,
          \`start_after_ordinal\` integer NOT NULL,
          \`end_at_ordinal\` integer NOT NULL,
          \`time_effective\` integer NOT NULL,
          \`expected_winning_member_id\` text,
          \`boundary_binding_id\` text,
          \`boundary_observation_id\` text,
          \`boundary_source_member_id\` text,
          \`boundary_revision_id\` text,
          \`boundary_revision_attribution_member_id\` text,
          \`boundary_descriptor_observation_id\` text,
          \`boundary_descriptor_correction_id\` text,
          \`boundary_media_type\` text,
          \`boundary_availability\` text NOT NULL,
          \`outcome_kind\` text NOT NULL,
          \`outcome_artifact_id\` text,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_binding_id_artifact_source_binding_id_fk\` FOREIGN KEY (\`boundary_binding_id\`) REFERENCES \`artifact_source_binding\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_observation_id_artifact_source_observation_id_fk\` FOREIGN KEY (\`boundary_observation_id\`) REFERENCES \`artifact_source_observation\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_descriptor_observation_id_artifact_source_observation_id_fk\` FOREIGN KEY (\`boundary_descriptor_observation_id\`) REFERENCES \`artifact_source_observation\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_descriptor_correction_id_artifact_observation_correction_id_fk\` FOREIGN KEY (\`boundary_descriptor_correction_id\`) REFERENCES \`artifact_observation_correction\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_set_id_artifact_lineage_correction_set_id_fk\` FOREIGN KEY (\`set_id\`) REFERENCES \`artifact_lineage_correction_set\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_recorded_artifact_id_artifact_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`boundary_revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_outcome_artifact_id_artifact_id_fk\` FOREIGN KEY (\`outcome_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_expected_winning_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`expected_winning_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_source_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`boundary_source_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_member_boundary_revision_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`boundary_revision_attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_lineage_correction_member_set_id_unique\` UNIQUE(\`set_id\`,\`id\`),
          CONSTRAINT "artifact_lineage_correction_member_interval" CHECK("start_after_ordinal" >= 0 AND "end_at_ordinal" >= "start_after_ordinal"),
          CONSTRAINT "artifact_lineage_correction_member_version" CHECK("lineage_version" >= 1),
          CONSTRAINT "artifact_lineage_correction_member_time_nonnegative" CHECK("time_effective" >= 0),
          CONSTRAINT "artifact_lineage_correction_member_boundary_shape" CHECK(("boundary_revision_id" IS NULL AND "boundary_availability" = 'unbound' AND "boundary_binding_id" IS NULL AND "boundary_observation_id" IS NULL AND "boundary_source_member_id" IS NULL AND "boundary_revision_attribution_member_id" IS NULL AND "boundary_descriptor_observation_id" IS NULL AND "boundary_descriptor_correction_id" IS NULL AND "boundary_media_type" IS NULL) OR ("boundary_revision_id" IS NOT NULL AND (("boundary_observation_id" IS NOT NULL AND "boundary_source_member_id" IS NULL) OR ("boundary_observation_id" IS NULL AND "boundary_source_member_id" IS NOT NULL)) AND "boundary_descriptor_observation_id" IS NOT NULL AND "boundary_media_type" IS NOT NULL AND length("boundary_media_type") > 0 AND (("boundary_availability" IN ('available', 'missing')) AND "boundary_binding_id" IS NOT NULL OR ("boundary_availability" = 'unbound' AND "boundary_binding_id" IS NULL)))),
          CONSTRAINT "artifact_lineage_correction_member_descriptor_shape" CHECK("boundary_descriptor_correction_id" IS NULL OR "boundary_descriptor_observation_id" IS NOT NULL),
          CONSTRAINT "artifact_lineage_correction_member_outcome_shape" CHECK(("outcome_kind" = 'recorded' AND "outcome_artifact_id" IS NULL) OR ("outcome_kind" = 'artifact' AND "outcome_artifact_id" IS NOT NULL))
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_lineage_correction_set\` (
          \`id\` text PRIMARY KEY,
          \`admission_root_artifact_id\` text NOT NULL,
          \`basis\` text NOT NULL,
          \`capability_identity\` text NOT NULL,
          \`capability_version\` integer NOT NULL,
          \`new_artifact_id\` text CONSTRAINT \`artifact_lineage_correction_set_new_artifact_unique\` UNIQUE,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_lineage_correction_set_admission_root_artifact_id_artifact_id_fk\` FOREIGN KEY (\`admission_root_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_lineage_correction_set_new_artifact_id_artifact_id_fk\` FOREIGN KEY (\`new_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "artifact_lineage_correction_set_basis" CHECK("basis" IN ('learner_statement', 'trusted_non_model_discontinuity')),
          CONSTRAINT "artifact_lineage_correction_set_capability" CHECK(length("capability_identity") > 0 AND "capability_version" >= 1),
          CONSTRAINT "artifact_lineage_correction_set_time_nonnegative" CHECK("time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_observation_correction\` (
          \`id\` text PRIMARY KEY,
          \`observation_id\` text NOT NULL,
          \`correction_sequence\` integer NOT NULL,
          \`predecessor_correction_id\` text,
          \`media_type\` text NOT NULL,
          \`corrected_time_observed\` integer,
          \`basis\` text NOT NULL,
          \`capability_identity\` text NOT NULL,
          \`capability_version\` integer NOT NULL,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_observation_correction_observation_id_artifact_source_observation_id_fk\` FOREIGN KEY (\`observation_id\`) REFERENCES \`artifact_source_observation\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_observation_correction_observation_id_predecessor_correction_id_artifact_observation_correction_observation_id_id_fk\` FOREIGN KEY (\`observation_id\`,\`predecessor_correction_id\`) REFERENCES \`artifact_observation_correction\`(\`observation_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_observation_correction_observation_id_unique\` UNIQUE(\`observation_id\`,\`id\`),
          CONSTRAINT \`artifact_observation_correction_sequence_unique\` UNIQUE(\`observation_id\`,\`correction_sequence\`),
          CONSTRAINT "artifact_observation_correction_sequence_shape" CHECK(("correction_sequence" = 1 AND "predecessor_correction_id" IS NULL) OR ("correction_sequence" > 1 AND "predecessor_correction_id" IS NOT NULL)),
          CONSTRAINT "artifact_observation_correction_media" CHECK(length("media_type") > 0),
          CONSTRAINT "artifact_observation_correction_basis" CHECK("basis" IN ('learner_correction', 'trusted_observer')),
          CONSTRAINT "artifact_observation_correction_capability" CHECK(length("capability_identity") > 0 AND "capability_version" >= 1),
          CONSTRAINT "artifact_observation_correction_time_nonnegative" CHECK(("corrected_time_observed" IS NULL OR "corrected_time_observed" >= 0) AND "time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_revision\` (
          \`id\` text PRIMARY KEY,
          \`recorded_artifact_id\` text NOT NULL,
          \`fingerprint_algorithm\` text NOT NULL,
          \`fingerprint_digest\` text NOT NULL,
          \`byte_length\` integer NOT NULL,
          \`time_first_observed\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_revision_recorded_artifact_id_artifact_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_revision_recorded_id_unique\` UNIQUE(\`recorded_artifact_id\`,\`id\`),
          CONSTRAINT \`artifact_revision_fingerprint_unique\` UNIQUE(\`recorded_artifact_id\`,\`fingerprint_algorithm\`,\`fingerprint_digest\`,\`byte_length\`),
          CONSTRAINT "artifact_revision_algorithm" CHECK("fingerprint_algorithm" = 'sha256'),
          CONSTRAINT "artifact_revision_digest" CHECK(length("fingerprint_digest") = 64 AND "fingerprint_digest" NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT "artifact_revision_byte_length" CHECK("byte_length" >= 0),
          CONSTRAINT "artifact_revision_time_nonnegative" CHECK("time_first_observed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_source_binding\` (
          \`id\` text PRIMARY KEY,
          \`recorded_artifact_id\` text NOT NULL,
          \`binding_ordinal\` integer NOT NULL,
          \`canonical_location\` text NOT NULL,
          \`basis_kind\` text NOT NULL,
          \`basis_capability_identity\` text,
          \`basis_capability_version\` integer,
          \`basis_lineage_member_id\` text,
          \`time_started\` integer NOT NULL,
          \`time_ended\` integer,
          \`end_reason\` text,
          CONSTRAINT \`fk_artifact_source_binding_recorded_artifact_id_artifact_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_source_binding_basis_lineage_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`basis_lineage_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_source_binding_recorded_id_unique\` UNIQUE(\`recorded_artifact_id\`,\`id\`),
          CONSTRAINT \`artifact_source_binding_ordinal_unique\` UNIQUE(\`recorded_artifact_id\`,\`binding_ordinal\`),
          CONSTRAINT "artifact_source_binding_ordinal_positive" CHECK("binding_ordinal" >= 1),
          CONSTRAINT "artifact_source_binding_location_nonempty" CHECK(length("canonical_location") > 0),
          CONSTRAINT "artifact_source_binding_basis_shape" CHECK(("basis_kind" IN ('admission', 'explicit_rebind') AND "basis_capability_identity" IS NOT NULL AND length("basis_capability_identity") > 0 AND "basis_capability_version" >= 1 AND "basis_lineage_member_id" IS NULL) OR ("basis_kind" = 'lineage_correction' AND "basis_capability_identity" IS NULL AND "basis_capability_version" IS NULL AND "basis_lineage_member_id" IS NOT NULL)),
          CONSTRAINT "artifact_source_binding_end_shape" CHECK(("time_ended" IS NULL AND "end_reason" IS NULL) OR ("time_ended" IS NOT NULL AND "time_ended" >= "time_started" AND "end_reason" IN ('explicit_rebind', 'lineage_correction'))),
          CONSTRAINT "artifact_source_binding_time_nonnegative" CHECK("time_started" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact_source_observation\` (
          \`id\` text PRIMARY KEY,
          \`recorded_artifact_id\` text NOT NULL,
          \`binding_id\` text NOT NULL,
          \`occurrence_ordinal\` integer NOT NULL,
          \`result\` text NOT NULL,
          \`revision_id\` text,
          \`revision_attribution_member_id\` text,
          \`media_type\` text,
          \`observer_capability_identity\` text NOT NULL,
          \`observer_capability_version\` integer NOT NULL,
          \`time_observed\` integer NOT NULL,
          \`time_committed\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_source_observation_recorded_artifact_id_artifact_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_source_observation_recorded_artifact_id_binding_id_artifact_source_binding_recorded_artifact_id_id_fk\` FOREIGN KEY (\`recorded_artifact_id\`,\`binding_id\`) REFERENCES \`artifact_source_binding\`(\`recorded_artifact_id\`,\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_source_observation_revision_id_artifact_revision_id_fk\` FOREIGN KEY (\`revision_id\`) REFERENCES \`artifact_revision\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_artifact_source_observation_revision_attribution_member_id_artifact_lineage_correction_member_id_fk\` FOREIGN KEY (\`revision_attribution_member_id\`) REFERENCES \`artifact_lineage_correction_member\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`artifact_source_observation_recorded_id_unique\` UNIQUE(\`recorded_artifact_id\`,\`id\`),
          CONSTRAINT \`artifact_source_observation_ordinal_unique\` UNIQUE(\`recorded_artifact_id\`,\`occurrence_ordinal\`),
          CONSTRAINT "artifact_source_observation_ordinal_positive" CHECK("occurrence_ordinal" >= 1),
          CONSTRAINT "artifact_source_observation_result_shape" CHECK(("result" = 'present' AND "revision_id" IS NOT NULL AND "media_type" IS NOT NULL AND length("media_type") > 0) OR ("result" = 'missing' AND "revision_id" IS NULL AND "revision_attribution_member_id" IS NULL AND "media_type" IS NULL)),
          CONSTRAINT "artifact_source_observation_observer" CHECK(length("observer_capability_identity") > 0 AND "observer_capability_version" >= 1),
          CONSTRAINT "artifact_source_observation_time_nonnegative" CHECK("time_observed" >= 0 AND "time_committed" >= 0)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`artifact\` (
          \`id\` text PRIMARY KEY,
          \`admission_root_artifact_id\` text NOT NULL,
          \`creation_basis\` text NOT NULL,
          \`creation_capability_identity\` text,
          \`creation_capability_version\` integer,
          \`disposition_version\` integer DEFAULT 0 NOT NULL,
          \`lineage_version\` integer DEFAULT 0 NOT NULL,
          \`withdrawal_reason\` text,
          \`correction_hidden\` integer DEFAULT false NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_artifact_admission_root_artifact_id_artifact_id_fk\` FOREIGN KEY (\`admission_root_artifact_id\`) REFERENCES \`artifact\`(\`id\`) ON DELETE RESTRICT,
          CONSTRAINT "artifact_creation_shape" CHECK(("creation_basis" IN ('learner_instruction', 'initialization_import') AND "admission_root_artifact_id" = "id" AND "creation_capability_identity" IS NOT NULL AND length("creation_capability_identity") > 0 AND "creation_capability_version" >= 1) OR ("creation_basis" = 'lineage_correction' AND "creation_capability_identity" IS NULL AND "creation_capability_version" IS NULL)),
          CONSTRAINT "artifact_versions_nonnegative" CHECK("disposition_version" >= 0 AND "lineage_version" >= 0),
          CONSTRAINT "artifact_withdrawal_reason" CHECK("withdrawal_reason" IS NULL OR "withdrawal_reason" = 'removed'),
          CONSTRAINT "artifact_time_order" CHECK("time_created" >= 0 AND "time_updated" >= "time_created")
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`artifact_current_source_availability_idx\` ON \`artifact_current_source\` (\`availability\`,\`artifact_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_lineage_correction_member_history_idx\` ON \`artifact_lineage_correction_member\` (\`recorded_artifact_id\`,\`start_after_ordinal\`,\`end_at_ordinal\`,\`lineage_version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_lineage_correction_member_outcome_idx\` ON \`artifact_lineage_correction_member\` (\`outcome_artifact_id\`,\`lineage_version\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_lineage_correction_member_set_idx\` ON \`artifact_lineage_correction_member\` (\`set_id\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_lineage_correction_set_root_idx\` ON \`artifact_lineage_correction_set\` (\`admission_root_artifact_id\`,\`time_committed\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_observation_correction_page_idx\` ON \`artifact_observation_correction\` (\`observation_id\`,\`correction_sequence\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_revision_page_idx\` ON \`artifact_revision\` (\`recorded_artifact_id\`,\`time_first_observed\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`artifact_source_binding_active_artifact_idx\` ON \`artifact_source_binding\` (\`recorded_artifact_id\`) WHERE "artifact_source_binding"."time_ended" IS NULL;`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`artifact_source_binding_active_location_idx\` ON \`artifact_source_binding\` (\`canonical_location\`) WHERE "artifact_source_binding"."time_ended" IS NULL;`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_source_binding_history_idx\` ON \`artifact_source_binding\` (\`recorded_artifact_id\`,\`binding_ordinal\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_source_observation_history_idx\` ON \`artifact_source_observation\` (\`recorded_artifact_id\`,\`occurrence_ordinal\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_source_observation_revision_idx\` ON \`artifact_source_observation\` (\`revision_id\`,\`recorded_artifact_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_admission_root_idx\` ON \`artifact\` (\`admission_root_artifact_id\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`artifact_discovery_idx\` ON \`artifact\` (\`withdrawal_reason\`,\`correction_hidden\`,\`time_created\`,\`id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
