import { Effect, Option, Schema } from "effect"
import { sql } from "drizzle-orm"
import { isCourseSettlement } from "../../../course/learning-command-settlement"
import { isGoalSettlement } from "../../../learner-goal/learning-command-settlement"
import { isNavigationSettlement } from "../../../learner-navigation/learning-command-settlement-v12"
import { isRepresentationSettlement } from "../../../representation/learning-command-settlement"
import { isRetainedSettlement } from "../../../retained-steering/learning-command-settlement"
import type { DatabaseMigration } from "../../migration"
import { install as installSchemaExtrasV12 } from "../../schema-extras-v12"

export default {
  id: "20260727121200_domain_neutral_learning_command_ledger",
  foreignKeyMode: "rebuild_graph",
  up(tx) {
    return Effect.gen(function* () {
      const before = yield* tx
        .get<{ invocations: number; receipts: number }>(
          sql`
          SELECT
            (SELECT count(*) FROM learning_command_invocation) AS invocations,
            (SELECT count(*) FROM learning_command_receipt) AS receipts
        `,
        )
        .pipe(Effect.orDie)
      if (!before) return yield* Effect.fail(new Error("The v11 learning-command ledger is unreadable"))

      const triggers = yield* tx
        .all<{ name: string }>(sql`SELECT name FROM sqlite_schema WHERE type = 'trigger' ORDER BY name`)
        .pipe(Effect.orDie)
      yield* Effect.forEach(
        triggers,
        (trigger) => tx.run(sql.raw(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`)).pipe(Effect.orDie),
        { discard: true },
      )
      yield* tx.run(`DROP VIEW IF EXISTS learning_command_invocation_constraint_v12`).pipe(Effect.orDie)
      yield* tx.run(`DROP VIEW IF EXISTS learning_command_receipt_constraint_v12`).pipe(Effect.orDie)

      yield* tx.run(`CREATE TABLE __v11_learning_command_invocation AS SELECT * FROM learning_command_invocation`)
      yield* tx.run(`CREATE TABLE __v11_learning_command_receipt AS SELECT * FROM learning_command_receipt`)
      yield* tx.run(`CREATE TABLE __v11_retained_steering_commit_seal AS SELECT * FROM retained_steering_commit_seal`)
      yield* tx.run(`CREATE TABLE __v11_learner_goal_commit_seal AS SELECT * FROM learner_goal_commit_seal`)

      yield* tx.run(`DROP TABLE retained_steering_commit_seal`)
      yield* tx.run(`DROP TABLE learner_goal_commit_seal`)
      yield* tx.run(`DROP TABLE learning_command_receipt`)
      yield* tx.run(`DROP TABLE learning_command_invocation`)

      yield* tx.run(`
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
          receipt_id text,
          settlement text,
          time_admitted integer NOT NULL,
          time_settled integer,
          settlement_order integer,
          turn_id text,
          input_id text,
          CONSTRAINT fk_learning_command_invocation_occurrence_id_learning_admitted_occurrence_id_fk
            FOREIGN KEY (occurrence_id) REFERENCES learning_admitted_occurrence(id) ON DELETE RESTRICT,
          CONSTRAINT learning_command_invocation_assistant_call_unique
            UNIQUE(assistant_message_id, provider_call_id),
          CONSTRAINT learning_command_invocation_assistant_ordinal_unique
            UNIQUE(assistant_message_id, emission_ordinal),
          CONSTRAINT learning_command_invocation_call_nonempty CHECK(length(provider_call_id) > 0),
          CONSTRAINT learning_command_invocation_command_nonempty CHECK(length(command_name) > 0),
          CONSTRAINT learning_command_invocation_command_version CHECK(command_version >= 1),
          CONSTRAINT learning_command_invocation_emission_ordinal CHECK(emission_ordinal >= 0),
          CONSTRAINT learning_command_invocation_capability CHECK(length(capability_identity) > 0),
          CONSTRAINT learning_command_invocation_capability_version CHECK(capability_version >= 1),
          CONSTRAINT learning_command_invocation_authorization_basis
            CHECK(authorization_basis IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT learning_command_invocation_fingerprint
            CHECK(length(input_fingerprint) = 64 AND input_fingerprint NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT learning_command_invocation_status
            CHECK(status IN ('admitted', 'applied', 'already_applied', 'no_change', 'error')),
          CONSTRAINT learning_command_invocation_settlement_shape CHECK(
            (status = 'admitted' AND receipt_id IS NULL AND settlement IS NULL
              AND time_settled IS NULL AND settlement_order IS NULL)
            OR
            (status <> 'admitted' AND json_valid(settlement) AND json_type(settlement) = 'object'
              AND json_extract(settlement, '$.outcome') = status
              AND json_extract(settlement, '$.settlementTime') = time_settled
              AND json_extract(settlement, '$.settlementOrder') = settlement_order)
          ),
          CONSTRAINT learning_command_invocation_receipt_shape CHECK(
            (status IN ('applied', 'already_applied') AND receipt_id IS NOT NULL
              AND length(receipt_id) > 0 AND json_extract(settlement, '$.receiptID') = receipt_id)
            OR
            (status IN ('admitted', 'no_change', 'error') AND receipt_id IS NULL
              AND (settlement IS NULL OR json_extract(settlement, '$.receiptID') IS NULL))
          ),
          CONSTRAINT learning_command_invocation_time_order CHECK(
            time_admitted >= 0
              AND (time_settled IS NULL OR time_settled >= time_admitted)
              AND (settlement_order IS NULL OR settlement_order >= 0)
          )
        )
      `)
      yield* tx.run(`
        INSERT INTO learning_command_invocation (
          part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
          occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
          capability_version, authorization_basis, input_fingerprint, status, receipt_id,
          settlement, time_admitted, time_settled, settlement_order, turn_id, input_id
        )
        SELECT
          part_id, session_id, parent_user_message_id, assistant_message_id, provider_call_id,
          occurrence_id, command_name, command_version, emission_ordinal, capability_identity,
          capability_version, authorization_basis, input_fingerprint, status,
          CASE WHEN status IN ('applied', 'already_applied')
            THEN json_extract(settlement, '$.receiptID') ELSE NULL END,
          settlement, time_admitted, time_settled, settlement_order, turn_id, input_id
        FROM __v11_learning_command_invocation
      `)

      yield* tx.run(`
        CREATE TABLE learning_command_receipt (
          id text PRIMARY KEY,
          occurrence_id text NOT NULL,
          origin_session_id text NOT NULL,
          origin_message_id text NOT NULL,
          assistant_message_id text NOT NULL,
          invocation_part_id text NOT NULL CONSTRAINT learning_command_receipt_invocation_unique UNIQUE,
          capability_identity text NOT NULL,
          capability_version integer NOT NULL,
          authorization_basis text NOT NULL,
          time_committed integer NOT NULL,
          commit_order integer NOT NULL,
          CONSTRAINT fk_learning_command_receipt_occurrence_id_learning_admitted_occurrence_id_fk
            FOREIGN KEY (occurrence_id) REFERENCES learning_admitted_occurrence(id) ON DELETE RESTRICT,
          CONSTRAINT fk_learning_command_receipt_invocation_part_id_learning_command_invocation_part_id_fk
            FOREIGN KEY (invocation_part_id) REFERENCES learning_command_invocation(part_id) ON DELETE RESTRICT,
          CONSTRAINT learning_command_receipt_capability CHECK(length(capability_identity) > 0),
          CONSTRAINT learning_command_receipt_capability_version CHECK(capability_version >= 1),
          CONSTRAINT learning_command_receipt_authorization_basis
            CHECK(authorization_basis IN ('learner_request', 'learner_acceptance')),
          CONSTRAINT learning_command_receipt_time_order CHECK(time_committed >= 0 AND commit_order >= 0)
        ) WITHOUT ROWID
      `)
      yield* tx.run(`
        INSERT INTO learning_command_receipt (
          id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
          invocation_part_id, capability_identity, capability_version, authorization_basis,
          time_committed, commit_order
        )
        SELECT
          id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
          invocation_part_id, capability_identity, capability_version, authorization_basis,
          time_committed, commit_order
        FROM __v11_learning_command_receipt
      `)

      yield* tx.run(`
        CREATE TABLE learner_default_course_command (
          invocation_part_id text PRIMARY KEY,
          permission_request_id text NOT NULL,
          CONSTRAINT fk_learner_default_course_command_invocation_part_id_learning_command_invocation_part_id_fk
            FOREIGN KEY (invocation_part_id) REFERENCES learning_command_invocation(part_id) ON DELETE CASCADE,
          CONSTRAINT learner_default_course_command_permission CHECK(length(permission_request_id) > 0)
        )
      `)
      yield* tx.run(`
        INSERT INTO learner_default_course_command (invocation_part_id, permission_request_id)
        SELECT part_id, permission_request_id
        FROM __v11_learning_command_invocation
        WHERE command_name = 'set_default_course_preference'
      `)
      yield* tx.run(`
        CREATE TABLE retained_steering_command (
          invocation_part_id text PRIMARY KEY,
          semantic_fingerprint text NOT NULL,
          CONSTRAINT fk_retained_steering_command_invocation_part_id_learning_command_invocation_part_id_fk
            FOREIGN KEY (invocation_part_id) REFERENCES learning_command_invocation(part_id) ON DELETE CASCADE,
          CONSTRAINT retained_steering_command_fingerprint
            CHECK(length(semantic_fingerprint) = 64 AND semantic_fingerprint NOT GLOB '*[^0-9a-f]*')
        )
      `)
      yield* tx.run(`
        INSERT INTO retained_steering_command (invocation_part_id, semantic_fingerprint)
        SELECT part_id, retained_steering_semantic_fingerprint
        FROM __v11_learning_command_invocation
        WHERE command_name = 'update_retained_learning_steering'
      `)
      yield* tx.run(`
        CREATE TABLE learner_goal_command (
          invocation_part_id text PRIMARY KEY,
          semantic_fingerprint text NOT NULL,
          command_snapshot text NOT NULL,
          permission_request_id text,
          confirmation_snapshot text,
          CONSTRAINT fk_learner_goal_command_invocation_part_id_learning_command_invocation_part_id_fk
            FOREIGN KEY (invocation_part_id) REFERENCES learning_command_invocation(part_id) ON DELETE CASCADE,
          CONSTRAINT learner_goal_command_fingerprint
            CHECK(length(semantic_fingerprint) = 64 AND semantic_fingerprint NOT GLOB '*[^0-9a-f]*'),
          CONSTRAINT learner_goal_command_snapshot
            CHECK(json_valid(command_snapshot) AND json_type(command_snapshot) = 'object'),
          CONSTRAINT learner_goal_command_permission
            CHECK(permission_request_id IS NULL OR length(permission_request_id) > 0),
          CONSTRAINT learner_goal_command_confirmation
            CHECK(confirmation_snapshot IS NULL
              OR (json_valid(confirmation_snapshot) AND json_type(confirmation_snapshot) = 'object'))
        )
      `)
      yield* tx.run(`
        INSERT INTO learner_goal_command (
          invocation_part_id, semantic_fingerprint, command_snapshot,
          permission_request_id, confirmation_snapshot
        )
        SELECT
          part_id, goal_semantic_fingerprint, goal_command_snapshot,
          permission_request_id, goal_confirmation_snapshot
        FROM __v11_learning_command_invocation
        WHERE command_name = 'update_learner_goals'
      `)

      yield* createSeal(
        tx,
        "course_selection_acceptance_commit_seal",
        "effect_id",
        "course_selection_acceptance_effect",
        "effect_id",
      )
      yield* createSeal(
        tx,
        "representation_command_commit_seal",
        "effect_id",
        "representation_effect",
        "representation_effect_id",
      )
      yield* createSeal(
        tx,
        "learner_default_course_commit_seal",
        "effect_id",
        "learner_default_course_transition",
        "default_navigation_effect_id",
      )
      yield* createSeal(
        tx,
        "learner_course_route_anchor_commit_seal",
        "effect_id",
        "learner_course_route_anchor_transition",
        "anchor_navigation_effect_id",
      )

      yield* tx.run(`
        CREATE TABLE retained_steering_commit_seal (
          transition_id text PRIMARY KEY,
          receipt_id text NOT NULL CONSTRAINT retained_steering_commit_seal_receipt_unique UNIQUE,
          invocation_part_id text NOT NULL CONSTRAINT retained_steering_commit_seal_invocation_unique UNIQUE,
          CONSTRAINT fk_retained_steering_commit_seal_transition_id_retained_steering_transition_id_fk
            FOREIGN KEY (transition_id) REFERENCES retained_steering_transition(id) ON DELETE RESTRICT,
          CONSTRAINT fk_retained_steering_commit_seal_receipt_id_learning_command_receipt_id_fk
            FOREIGN KEY (receipt_id) REFERENCES learning_command_receipt(id) ON DELETE RESTRICT,
          CONSTRAINT fk_retained_steering_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk
            FOREIGN KEY (invocation_part_id) REFERENCES learning_command_invocation(part_id) ON DELETE RESTRICT
        )
      `)
      yield* tx.run(`
        INSERT INTO retained_steering_commit_seal (transition_id, receipt_id, invocation_part_id)
        SELECT transition_id, receipt_id, invocation_part_id
        FROM __v11_retained_steering_commit_seal
      `)
      yield* tx.run(`
        CREATE TABLE learner_goal_commit_seal (
          effect_id text PRIMARY KEY,
          receipt_id text NOT NULL CONSTRAINT learner_goal_commit_seal_receipt_unique UNIQUE,
          invocation_part_id text NOT NULL CONSTRAINT learner_goal_commit_seal_invocation_unique UNIQUE,
          CONSTRAINT fk_learner_goal_commit_seal_effect_id_learner_goal_effect_id_fk
            FOREIGN KEY (effect_id) REFERENCES learner_goal_effect(id) ON DELETE RESTRICT,
          CONSTRAINT fk_learner_goal_commit_seal_receipt_id_learning_command_receipt_id_fk
            FOREIGN KEY (receipt_id) REFERENCES learning_command_receipt(id) ON DELETE RESTRICT,
          CONSTRAINT fk_learner_goal_commit_seal_invocation_part_id_learning_command_invocation_part_id_fk
            FOREIGN KEY (invocation_part_id) REFERENCES learning_command_invocation(part_id) ON DELETE RESTRICT
        )
      `)
      yield* tx.run(`
        INSERT INTO learner_goal_commit_seal (effect_id, receipt_id, invocation_part_id)
        SELECT effect_id, receipt_id, invocation_part_id
        FROM __v11_learner_goal_commit_seal
      `)

      yield* tx.run(`
        CREATE UNIQUE INDEX learning_command_invocation_one_mutation_idx
        ON learning_command_invocation (assistant_message_id)
        WHERE status = 'applied'
      `)
      yield* tx.run(`
        CREATE INDEX learning_command_invocation_session_owner_idx
        ON learning_command_invocation (session_id, assistant_message_id, part_id)
      `)
      yield* tx.run(`
        CREATE INDEX learning_command_invocation_occurrence_idx
        ON learning_command_invocation (occurrence_id, part_id)
      `)
      yield* tx.run(`
        CREATE INDEX learning_command_invocation_admitted_idx
        ON learning_command_invocation (status, session_id, time_admitted)
      `)
      yield* tx.run(`
        CREATE INDEX learning_command_invocation_receipt_idx
        ON learning_command_invocation (receipt_id, part_id)
      `)
      yield* tx.run(`
        CREATE INDEX learning_command_receipt_occurrence_idx
        ON learning_command_receipt (occurrence_id, id)
      `)

      const validation = yield* tx
        .get<{
          invocations: number
          receipts: number
          reservations: number
        }>(
          sql`
          SELECT
            (
              SELECT count(*)
              FROM __v11_learning_command_invocation AS historical
              LEFT JOIN learning_command_invocation AS invocation
                ON invocation.part_id = historical.part_id
              LEFT JOIN __v11_learning_command_receipt AS receipt
                ON receipt.id = invocation.receipt_id
              WHERE invocation.part_id IS NULL
                 OR (
                   historical.status IN ('applied', 'already_applied')
                   AND (
                     receipt.id IS NULL
                     OR json_extract(historical.settlement, '$.effectID') IS NOT COALESCE(
                       historical.effect_id,
                       historical.representation_effect_id,
                       historical.default_navigation_effect_id,
                       historical.anchor_navigation_effect_id,
                       historical.retained_steering_effect_id,
                       historical.goal_effect_id
                     )
                     OR receipt.occurrence_id <> historical.occurrence_id
                     OR receipt.capability_identity <> historical.capability_identity
                     OR receipt.capability_version <> historical.capability_version
                     OR receipt.authorization_basis <> historical.authorization_basis
                     OR (
                       historical.status = 'applied'
                       AND (
                         receipt.invocation_part_id <> historical.part_id
                         OR receipt.time_committed <> historical.time_settled
                         OR receipt.commit_order <> historical.settlement_order
                       )
                     )
                     OR NOT (
                       (
                         historical.command_name = 'accept_course_view_revision'
                         AND historical.capability_identity = 'accept_course_view_revision'
                         AND historical.capability_version = 1
                         AND historical.effect_id = receipt.effect_id
                         AND historical.representation_effect_id IS NULL
                         AND historical.default_navigation_effect_id IS NULL
                         AND historical.anchor_navigation_effect_id IS NULL
                         AND historical.retained_steering_effect_id IS NULL
                         AND historical.goal_effect_id IS NULL
                         AND EXISTS (
                           SELECT 1 FROM course_selection_acceptance_commit_seal AS seal
                           WHERE seal.effect_id = receipt.effect_id
                             AND seal.receipt_id = receipt.id
                             AND seal.invocation_part_id = receipt.invocation_part_id
                         )
                       )
                       OR (
                         historical.command_name = 'representation.convert'
                         AND historical.capability_identity = 'representation.convert'
                         AND historical.capability_version = 1
                         AND historical.representation_effect_id = receipt.representation_effect_id
                         AND historical.effect_id IS NULL
                         AND historical.default_navigation_effect_id IS NULL
                         AND historical.anchor_navigation_effect_id IS NULL
                         AND historical.retained_steering_effect_id IS NULL
                         AND historical.goal_effect_id IS NULL
                         AND EXISTS (
                           SELECT 1 FROM representation_command_commit_seal AS seal
                           WHERE seal.effect_id = receipt.representation_effect_id
                             AND seal.receipt_id = receipt.id
                             AND seal.invocation_part_id = receipt.invocation_part_id
                         )
                       )
                       OR (
                         historical.command_name = 'set_default_course_preference'
                         AND historical.capability_identity = 'set_default_course_preference'
                         AND historical.capability_version = 1
                         AND historical.default_navigation_effect_id = receipt.default_navigation_effect_id
                         AND historical.effect_id IS NULL
                         AND historical.representation_effect_id IS NULL
                         AND historical.anchor_navigation_effect_id IS NULL
                         AND historical.retained_steering_effect_id IS NULL
                         AND historical.goal_effect_id IS NULL
                         AND EXISTS (
                           SELECT 1 FROM learner_default_course_commit_seal AS seal
                           WHERE seal.effect_id = receipt.default_navigation_effect_id
                             AND seal.receipt_id = receipt.id
                             AND seal.invocation_part_id = receipt.invocation_part_id
                         )
                       )
                       OR (
                         historical.command_name = 'set_course_route_anchor'
                         AND historical.capability_identity = 'set_course_route_anchor'
                         AND historical.capability_version = 1
                         AND historical.anchor_navigation_effect_id = receipt.anchor_navigation_effect_id
                         AND historical.effect_id IS NULL
                         AND historical.representation_effect_id IS NULL
                         AND historical.default_navigation_effect_id IS NULL
                         AND historical.retained_steering_effect_id IS NULL
                         AND historical.goal_effect_id IS NULL
                         AND EXISTS (
                           SELECT 1 FROM learner_course_route_anchor_commit_seal AS seal
                           WHERE seal.effect_id = receipt.anchor_navigation_effect_id
                             AND seal.receipt_id = receipt.id
                             AND seal.invocation_part_id = receipt.invocation_part_id
                         )
                       )
                       OR (
                         historical.command_name = 'update_retained_learning_steering'
                         AND historical.capability_identity = 'update_retained_learning_steering'
                         AND historical.capability_version = 1
                         AND historical.retained_steering_effect_id = receipt.retained_steering_effect_id
                         AND historical.effect_id IS NULL
                         AND historical.representation_effect_id IS NULL
                         AND historical.default_navigation_effect_id IS NULL
                         AND historical.anchor_navigation_effect_id IS NULL
                         AND historical.goal_effect_id IS NULL
                         AND EXISTS (
                           SELECT 1 FROM retained_steering_commit_seal AS seal
                           WHERE seal.transition_id = receipt.retained_steering_effect_id
                             AND seal.receipt_id = receipt.id
                             AND seal.invocation_part_id = receipt.invocation_part_id
                         )
                       )
                       OR (
                         historical.command_name = 'update_learner_goals'
                         AND historical.capability_identity = 'update_learner_goals'
                         AND historical.capability_version = 1
                         AND historical.goal_effect_id = receipt.goal_effect_id
                         AND historical.effect_id IS NULL
                         AND historical.representation_effect_id IS NULL
                         AND historical.default_navigation_effect_id IS NULL
                         AND historical.anchor_navigation_effect_id IS NULL
                         AND historical.retained_steering_effect_id IS NULL
                         AND EXISTS (
                           SELECT 1 FROM learner_goal_commit_seal AS seal
                           WHERE seal.effect_id = receipt.goal_effect_id
                             AND seal.receipt_id = receipt.id
                             AND seal.invocation_part_id = receipt.invocation_part_id
                         )
                       )
                     )
                   )
                 )
                 OR (
                   historical.status IN ('admitted', 'no_change', 'error')
                   AND (
                     invocation.receipt_id IS NOT NULL
                     OR json_extract(historical.settlement, '$.receiptID') IS NOT NULL
                     OR json_extract(historical.settlement, '$.effectID') IS NOT NULL
                     OR historical.effect_id IS NOT NULL
                     OR historical.representation_effect_id IS NOT NULL
                     OR historical.default_navigation_effect_id IS NOT NULL
                     OR historical.anchor_navigation_effect_id IS NOT NULL
                     OR historical.retained_steering_effect_id IS NOT NULL
                     OR historical.goal_effect_id IS NOT NULL
                   )
                 )
            ) AS invocations,
            (
              SELECT count(*)
              FROM __v11_learning_command_receipt AS receipt
              WHERE NOT (
                (
                  receipt.capability_identity = 'accept_course_view_revision'
                  AND receipt.capability_version = 1
                  AND receipt.effect_id IS NOT NULL
                  AND receipt.representation_effect_id IS NULL
                  AND receipt.default_navigation_effect_id IS NULL
                  AND receipt.anchor_navigation_effect_id IS NULL
                  AND receipt.retained_steering_effect_id IS NULL
                  AND receipt.goal_effect_id IS NULL
                  AND EXISTS (
                    SELECT 1 FROM course_selection_acceptance_commit_seal AS seal
                    WHERE seal.effect_id = receipt.effect_id
                      AND seal.receipt_id = receipt.id
                      AND seal.invocation_part_id = receipt.invocation_part_id
                  )
                )
                OR (
                  receipt.capability_identity = 'representation.convert'
                  AND receipt.capability_version = 1
                  AND receipt.effect_id IS NULL
                  AND receipt.representation_effect_id IS NOT NULL
                  AND receipt.default_navigation_effect_id IS NULL
                  AND receipt.anchor_navigation_effect_id IS NULL
                  AND receipt.retained_steering_effect_id IS NULL
                  AND receipt.goal_effect_id IS NULL
                  AND EXISTS (
                    SELECT 1 FROM representation_command_commit_seal AS seal
                    WHERE seal.effect_id = receipt.representation_effect_id
                      AND seal.receipt_id = receipt.id
                      AND seal.invocation_part_id = receipt.invocation_part_id
                  )
                )
                OR (
                  receipt.capability_identity = 'set_default_course_preference'
                  AND receipt.capability_version = 1
                  AND receipt.effect_id IS NULL
                  AND receipt.representation_effect_id IS NULL
                  AND receipt.default_navigation_effect_id IS NOT NULL
                  AND receipt.anchor_navigation_effect_id IS NULL
                  AND receipt.retained_steering_effect_id IS NULL
                  AND receipt.goal_effect_id IS NULL
                  AND EXISTS (
                    SELECT 1 FROM learner_default_course_commit_seal AS seal
                    WHERE seal.effect_id = receipt.default_navigation_effect_id
                      AND seal.receipt_id = receipt.id
                      AND seal.invocation_part_id = receipt.invocation_part_id
                  )
                )
                OR (
                  receipt.capability_identity = 'set_course_route_anchor'
                  AND receipt.capability_version = 1
                  AND receipt.effect_id IS NULL
                  AND receipt.representation_effect_id IS NULL
                  AND receipt.default_navigation_effect_id IS NULL
                  AND receipt.anchor_navigation_effect_id IS NOT NULL
                  AND receipt.retained_steering_effect_id IS NULL
                  AND receipt.goal_effect_id IS NULL
                  AND EXISTS (
                    SELECT 1 FROM learner_course_route_anchor_commit_seal AS seal
                    WHERE seal.effect_id = receipt.anchor_navigation_effect_id
                      AND seal.receipt_id = receipt.id
                      AND seal.invocation_part_id = receipt.invocation_part_id
                  )
                )
                OR (
                  receipt.capability_identity = 'update_retained_learning_steering'
                  AND receipt.capability_version = 1
                  AND receipt.effect_id IS NULL
                  AND receipt.representation_effect_id IS NULL
                  AND receipt.default_navigation_effect_id IS NULL
                  AND receipt.anchor_navigation_effect_id IS NULL
                  AND receipt.retained_steering_effect_id IS NOT NULL
                  AND receipt.goal_effect_id IS NULL
                  AND EXISTS (
                    SELECT 1 FROM retained_steering_commit_seal AS seal
                    WHERE seal.transition_id = receipt.retained_steering_effect_id
                      AND seal.receipt_id = receipt.id
                      AND seal.invocation_part_id = receipt.invocation_part_id
                  )
                )
                OR (
                  receipt.capability_identity = 'update_learner_goals'
                  AND receipt.capability_version = 1
                  AND receipt.effect_id IS NULL
                  AND receipt.representation_effect_id IS NULL
                  AND receipt.default_navigation_effect_id IS NULL
                  AND receipt.anchor_navigation_effect_id IS NULL
                  AND receipt.retained_steering_effect_id IS NULL
                  AND receipt.goal_effect_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM learner_goal_commit_seal AS seal
                    WHERE seal.effect_id = receipt.goal_effect_id
                      AND seal.receipt_id = receipt.id
                      AND seal.invocation_part_id = receipt.invocation_part_id
                  )
                )
              )
            ) AS receipts,
            (
              SELECT count(*)
              FROM __v11_learning_command_invocation AS historical
              WHERE (
                  historical.command_name = 'set_default_course_preference'
                  AND NOT EXISTS (
                    SELECT 1 FROM learner_default_course_command AS command
                    WHERE command.invocation_part_id = historical.part_id
                      AND command.permission_request_id = historical.permission_request_id
                  )
                )
                OR (
                  historical.command_name = 'update_retained_learning_steering'
                  AND NOT EXISTS (
                    SELECT 1 FROM retained_steering_command AS command
                    WHERE command.invocation_part_id = historical.part_id
                      AND command.semantic_fingerprint = historical.retained_steering_semantic_fingerprint
                  )
                )
                OR (
                  historical.command_name = 'update_learner_goals'
                  AND NOT EXISTS (
                    SELECT 1 FROM learner_goal_command AS command
                    WHERE command.invocation_part_id = historical.part_id
                      AND command.semantic_fingerprint = historical.goal_semantic_fingerprint
                      AND json(command.command_snapshot) = json(historical.goal_command_snapshot)
                      AND command.permission_request_id IS historical.permission_request_id
                      AND command.confirmation_snapshot IS historical.goal_confirmation_snapshot
                  )
                )
            ) AS reservations
        `,
        )
        .pipe(Effect.orDie)
      if (!validation || validation.invocations || validation.receipts || validation.reservations) {
        return yield* Effect.fail(
          new Error(
            `The v11 learning-command ledger cannot be represented by v12 without loss: ${JSON.stringify(validation)}`,
          ),
        )
      }
      const terminalSemantics = yield* validateHistoricalTerminalSemantics(tx)
      if (!terminalSemantics || terminalSemantics.violations) {
        return yield* Effect.fail(
          new Error(
            `The v11 learning-command terminal semantics cannot be represented by v12: ${JSON.stringify(terminalSemantics)}`,
          ),
        )
      }
      const domainSettlements = yield* validateMigratedDomainSettlements(tx)
      if (domainSettlements.violations) {
        return yield* Effect.fail(
          new Error(
            `The v11 learning-command settlements fail their domain validators: ${JSON.stringify(domainSettlements)}`,
          ),
        )
      }

      const after = yield* tx
        .get<{ invocations: number; receipts: number }>(
          sql`
          SELECT
            (SELECT count(*) FROM learning_command_invocation) AS invocations,
            (SELECT count(*) FROM learning_command_receipt) AS receipts
        `,
        )
        .pipe(Effect.orDie)
      if (!after || after.invocations !== before.invocations || after.receipts !== before.receipts) {
        return yield* Effect.fail(new Error("The v12 learning-command ledger rebuild changed durable row counts"))
      }

      yield* tx.run(`DROP TABLE __v11_learning_command_invocation`)
      yield* tx.run(`DROP TABLE __v11_learning_command_receipt`)
      yield* tx.run(`DROP TABLE __v11_retained_steering_commit_seal`)
      yield* tx.run(`DROP TABLE __v11_learner_goal_commit_seal`)
      yield* installSchemaExtrasV12(tx)
    })
  },
} satisfies DatabaseMigration.Migration

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

function validateMigratedDomainSettlements(tx: Parameters<DatabaseMigration.Migration["up"]>[0]) {
  return tx
    .all<{ partID: string; commandName: string; settlement: string }>(
      sql`
      SELECT part_id AS partID, command_name AS commandName, settlement
      FROM learning_command_invocation
      WHERE status <> 'admitted'
    `,
    )
    .pipe(
      Effect.orDie,
      Effect.map((rows) => {
        const invalid = rows.filter((row) => {
          const settlement = decodeJson(row.settlement)
          return Option.isNone(settlement) || !validDomainSettlement(row.commandName, settlement.value)
        })
        return {
          violations: invalid.length,
          invalid: invalid.map((row) => ({ partID: row.partID, commandName: row.commandName })),
        }
      }),
    )
}

function validDomainSettlement(commandName: string, settlement: unknown) {
  if (commandName === "accept_course_view_revision") return isCourseSettlement(settlement)
  if (commandName === "representation.convert") return isRepresentationSettlement(settlement)
  if (commandName === "set_default_course_preference") return isNavigationSettlement(settlement)
  if (commandName === "set_course_route_anchor") return isNavigationSettlement(settlement)
  if (commandName === "update_retained_learning_steering") return isRetainedSettlement(settlement)
  if (commandName === "update_learner_goals") return isGoalSettlement(settlement)
  return false
}

function validateHistoricalTerminalSemantics(tx: Parameters<DatabaseMigration.Migration["up"]>[0]) {
  return tx
    .get<{ violations: number }>(
      sql`
      SELECT count(*) AS violations
      FROM __v11_learning_command_invocation AS historical
      WHERE historical.status <> 'admitted'
        AND NOT (
          (
            historical.command_name = 'accept_course_view_revision'
            AND historical.command_version = 1
            AND historical.capability_identity = 'accept_course_view_revision'
            AND historical.capability_version = 1
            AND historical.authorization_basis IN ('learner_request', 'learner_acceptance')
            AND (SELECT count(*) FROM json_each(historical.settlement))
                = CASE historical.status WHEN 'applied' THEN 9 ELSE 11 END
            AND (
              historical.status = 'applied'
              OR (
                json_type(historical.settlement, '$.currentSelection') = 'object'
                AND json_extract(historical.settlement, '$.relation') IN ('active', 'superseded')
              )
            )
            AND EXISTS (
              SELECT 1
              FROM __v11_learning_command_receipt AS receipt
              JOIN course_selection_acceptance_commit_seal AS seal
                ON seal.receipt_id = receipt.id
              JOIN course_selection_acceptance_effect AS effect
                ON effect.id = seal.effect_id
              WHERE receipt.id = json_extract(historical.settlement, '$.receiptID')
                AND receipt.effect_id = historical.effect_id
                AND seal.effect_id = historical.effect_id
                AND seal.effect_id = json_extract(historical.settlement, '$.effectID')
                AND receipt.occurrence_id = historical.occurrence_id
                AND receipt.capability_identity = historical.capability_identity
                AND receipt.capability_version = historical.capability_version
                AND receipt.authorization_basis = historical.authorization_basis
                AND receipt.time_committed = effect.time_committed
                AND json_extract(historical.settlement, '$.courseID') = effect.course_id
                AND json_extract(historical.settlement, '$.revisionID') = effect.accepted_revision_id
                AND json_extract(historical.settlement, '$.previousSelection.revisionID')
                    IS effect.previous_revision_id
                AND json_extract(historical.settlement, '$.previousSelection.version')
                    = effect.previous_selection_version
                AND json_extract(historical.settlement, '$.committedSelection.revisionID')
                    = effect.accepted_revision_id
                AND json_extract(historical.settlement, '$.committedSelection.version')
                    = effect.committed_selection_version
                AND (
                  (
                    historical.status = 'applied'
                    AND seal.invocation_part_id = historical.part_id
                    AND receipt.invocation_part_id = historical.part_id
                    AND receipt.origin_session_id = historical.session_id
                    AND receipt.origin_message_id = historical.parent_user_message_id
                    AND receipt.assistant_message_id = historical.assistant_message_id
                    AND historical.time_settled = effect.time_committed
                    AND historical.settlement_order = receipt.commit_order
                  )
                  OR (
                    historical.status = 'already_applied'
                    AND seal.invocation_part_id = receipt.invocation_part_id
                    AND historical.time_settled >= effect.time_committed
                  )
                )
            )
          )
          OR (
            historical.command_name = 'representation.convert'
            AND historical.command_version = 1
            AND historical.capability_identity = 'representation.convert'
            AND historical.capability_version = 1
            AND historical.authorization_basis = 'learner_request'
            AND (SELECT count(*) FROM json_each(historical.settlement)) = 9
            AND EXISTS (
              SELECT 1
              FROM __v11_learning_command_receipt AS receipt
              JOIN representation_command_commit_seal AS seal
                ON seal.receipt_id = receipt.id
              JOIN representation_effect AS effect
                ON effect.id = seal.effect_id
              JOIN representation_revision AS revision
                ON revision.effect_id = effect.id
              WHERE receipt.id = json_extract(historical.settlement, '$.receiptID')
                AND receipt.representation_effect_id = historical.representation_effect_id
                AND seal.effect_id = historical.representation_effect_id
                AND seal.effect_id = json_extract(historical.settlement, '$.effectID')
                AND revision.id = json_extract(historical.settlement, '$.representationRevisionID')
                AND revision.effective_artifact_id
                    = json_extract(historical.settlement, '$.effectiveArtifactID')
                AND revision.source_revision_id
                    = json_extract(historical.settlement, '$.sourceRevisionID')
                AND revision.producer_kind = json_extract(historical.settlement, '$.producerKind')
                AND revision.creation_basis = 'learning_command'
                AND revision.delivery_mode = 'model_tool'
                AND revision.authorization_basis = historical.authorization_basis
                AND revision.causal_occurrence_id = historical.occurrence_id
                AND effect.operation_identity = revision.creation_identity
                AND effect.time_committed = revision.time_accepted
                AND receipt.occurrence_id = historical.occurrence_id
                AND receipt.capability_identity = historical.capability_identity
                AND receipt.capability_version = historical.capability_version
                AND receipt.authorization_basis = historical.authorization_basis
                AND receipt.time_committed >= revision.time_accepted
                AND (
                  (
                    historical.status = 'applied'
                    AND seal.invocation_part_id = historical.part_id
                    AND receipt.invocation_part_id = historical.part_id
                    AND receipt.origin_session_id = historical.session_id
                    AND receipt.origin_message_id = historical.parent_user_message_id
                    AND receipt.assistant_message_id = historical.assistant_message_id
                    AND revision.causal_invocation_part_id = historical.part_id
                    AND historical.time_settled = receipt.time_committed
                    AND historical.settlement_order = receipt.commit_order
                  )
                  OR (
                    historical.status = 'already_applied'
                    AND seal.invocation_part_id = receipt.invocation_part_id
                    AND revision.causal_invocation_part_id = seal.invocation_part_id
                    AND historical.time_settled >= revision.time_accepted
                  )
                )
            )
          )
          OR (
            historical.command_name = 'set_default_course_preference'
            AND historical.command_version = 1
            AND historical.capability_identity = 'set_default_course_preference'
            AND historical.capability_version = 1
            AND historical.authorization_basis = 'learner_acceptance'
            AND json_extract(historical.settlement, '$.navigationKind') = 'default_course_preference'
            AND (SELECT count(*) FROM json_each(historical.settlement))
                = CASE historical.status WHEN 'applied' THEN 9 ELSE 10 END
            AND json_type(historical.settlement, '$.current') = 'object'
            AND json_extract(historical.settlement, '$.current.kind') = 'default_course_preference'
            AND json_type(historical.settlement, '$.current.headID') IN ('text', 'null')
            AND json_type(historical.settlement, '$.current.version') = 'integer'
            AND json_extract(historical.settlement, '$.current.version') >= 0
            AND json_type(historical.settlement, '$.current.courseID') IN ('text', 'null')
            AND json_type(historical.settlement, '$.current.usability') = 'object'
            AND (
              historical.status = 'applied'
              OR json_extract(historical.settlement, '$.relation') IN ('active', 'superseded')
            )
            AND EXISTS (
              SELECT 1
              FROM __v11_learning_command_receipt AS receipt
              JOIN learner_default_course_commit_seal AS seal
                ON seal.receipt_id = receipt.id
              JOIN learner_default_course_transition AS effect
                ON effect.id = seal.effect_id
              WHERE receipt.id = json_extract(historical.settlement, '$.receiptID')
                AND receipt.default_navigation_effect_id = historical.default_navigation_effect_id
                AND seal.effect_id = historical.default_navigation_effect_id
                AND seal.effect_id = json_extract(historical.settlement, '$.effectID')
                AND effect.occurrence_id = historical.occurrence_id
                AND historical.permission_request_id = effect.permission_request_id
                AND receipt.permission_request_id = effect.permission_request_id
                AND json(receipt.confirmation_snapshot) = json(effect.confirmation_snapshot)
                AND json(effect.confirmation_snapshot)
                    = json(json_extract(historical.settlement, '$.confirmation'))
                AND receipt.occurrence_id = historical.occurrence_id
                AND receipt.capability_identity = historical.capability_identity
                AND receipt.capability_version = historical.capability_version
                AND receipt.authorization_basis = historical.authorization_basis
                AND receipt.time_committed = effect.time_committed
                AND receipt.commit_order = effect.commit_order
                AND json_extract(historical.settlement, '$.effect.id') = effect.id
                AND json_extract(historical.settlement, '$.effect.occurrenceID') = effect.occurrence_id
                AND json_extract(historical.settlement, '$.effect.previousCourseID')
                    IS effect.previous_course_id
                AND json_extract(historical.settlement, '$.effect.courseID') IS effect.course_id
                AND json_extract(historical.settlement, '$.effect.previousVersion') = effect.version - 1
                AND json_extract(historical.settlement, '$.effect.version') = effect.version
                AND json_extract(historical.settlement, '$.effect.timeCommitted') = effect.time_committed
                AND json_extract(historical.settlement, '$.effect.commitOrder') = effect.commit_order
                AND json_extract(historical.settlement, '$.effect.frontierSequence')
                    = effect.frontier_sequence
                AND (
                  (
                    historical.status = 'applied'
                    AND seal.invocation_part_id = historical.part_id
                    AND receipt.invocation_part_id = historical.part_id
                    AND receipt.origin_session_id = historical.session_id
                    AND receipt.origin_message_id = historical.parent_user_message_id
                    AND receipt.assistant_message_id = historical.assistant_message_id
                    AND historical.time_settled = effect.time_committed
                    AND historical.settlement_order = effect.commit_order
                  )
                  OR (
                    historical.status = 'already_applied'
                    AND seal.invocation_part_id = receipt.invocation_part_id
                    AND historical.time_settled >= effect.time_committed
                  )
                )
            )
          )
          OR (
            historical.command_name = 'set_course_route_anchor'
            AND historical.command_version = 1
            AND historical.capability_identity = 'set_course_route_anchor'
            AND historical.capability_version = 1
            AND historical.authorization_basis = 'learner_request'
            AND json_extract(historical.settlement, '$.navigationKind') = 'course_route_anchor'
            AND (SELECT count(*) FROM json_each(historical.settlement))
                = CASE historical.status WHEN 'applied' THEN 8 ELSE 9 END
            AND json_type(historical.settlement, '$.current') = 'object'
            AND json_extract(historical.settlement, '$.current.kind') = 'course_route_anchor'
            AND json_type(historical.settlement, '$.current.courseID') = 'text'
            AND json_type(historical.settlement, '$.current.headID') IN ('text', 'null')
            AND json_type(historical.settlement, '$.current.version') = 'integer'
            AND json_extract(historical.settlement, '$.current.version') >= 0
            AND json_type(historical.settlement, '$.current.target') IN ('object', 'null')
            AND json_type(historical.settlement, '$.current.usability') = 'object'
            AND (
              historical.status = 'applied'
              OR json_extract(historical.settlement, '$.relation') IN ('active', 'superseded')
            )
            AND EXISTS (
              SELECT 1
              FROM __v11_learning_command_receipt AS receipt
              JOIN learner_course_route_anchor_commit_seal AS seal
                ON seal.receipt_id = receipt.id
              JOIN learner_course_route_anchor_transition AS effect
                ON effect.id = seal.effect_id
              WHERE receipt.id = json_extract(historical.settlement, '$.receiptID')
                AND receipt.anchor_navigation_effect_id = historical.anchor_navigation_effect_id
                AND seal.effect_id = historical.anchor_navigation_effect_id
                AND seal.effect_id = json_extract(historical.settlement, '$.effectID')
                AND effect.occurrence_id = historical.occurrence_id
                AND receipt.occurrence_id = historical.occurrence_id
                AND receipt.capability_identity = historical.capability_identity
                AND receipt.capability_version = historical.capability_version
                AND receipt.authorization_basis = historical.authorization_basis
                AND receipt.time_committed = effect.time_committed
                AND receipt.commit_order = effect.commit_order
                AND json_extract(historical.settlement, '$.effect.id') = effect.id
                AND json_extract(historical.settlement, '$.effect.occurrenceID') = effect.occurrence_id
                AND json_extract(historical.settlement, '$.effect.courseID') = effect.course_id
                AND json_extract(historical.settlement, '$.effect.previousVersion') = effect.version - 1
                AND json_extract(historical.settlement, '$.effect.version') = effect.version
                AND json_extract(historical.settlement, '$.effect.timeCommitted') = effect.time_committed
                AND json_extract(historical.settlement, '$.effect.commitOrder') = effect.commit_order
                AND json_extract(historical.settlement, '$.effect.frontierSequence')
                    = effect.frontier_sequence
                AND (
                  (
                    historical.status = 'applied'
                    AND seal.invocation_part_id = historical.part_id
                    AND receipt.invocation_part_id = historical.part_id
                    AND receipt.origin_session_id = historical.session_id
                    AND receipt.origin_message_id = historical.parent_user_message_id
                    AND receipt.assistant_message_id = historical.assistant_message_id
                    AND historical.time_settled = effect.time_committed
                    AND historical.settlement_order = effect.commit_order
                  )
                  OR (
                    historical.status = 'already_applied'
                    AND seal.invocation_part_id = receipt.invocation_part_id
                    AND historical.time_settled >= effect.time_committed
                  )
                )
            )
          )
          OR (
            historical.command_name = 'update_retained_learning_steering'
            AND historical.command_version = 1
            AND historical.capability_identity = 'update_retained_learning_steering'
            AND historical.capability_version = 1
            AND historical.authorization_basis = 'learner_request'
            AND (SELECT count(*) FROM json_each(historical.settlement)) = 10
            AND EXISTS (
              SELECT 1
              FROM __v11_learning_command_receipt AS receipt
              JOIN retained_steering_commit_seal AS seal
                ON seal.receipt_id = receipt.id
              JOIN retained_steering_transition AS effect
                ON effect.id = seal.transition_id
              WHERE receipt.id = json_extract(historical.settlement, '$.receiptID')
                AND receipt.retained_steering_effect_id = historical.retained_steering_effect_id
                AND seal.transition_id = historical.retained_steering_effect_id
                AND seal.transition_id = json_extract(historical.settlement, '$.effectID')
                AND effect.occurrence_id = historical.occurrence_id
                AND effect.semantic_fingerprint
                    = historical.retained_steering_semantic_fingerprint
                AND receipt.occurrence_id = historical.occurrence_id
                AND receipt.capability_identity = historical.capability_identity
                AND receipt.capability_version = historical.capability_version
                AND receipt.authorization_basis = historical.authorization_basis
                AND receipt.time_committed = effect.time_committed
                AND receipt.commit_order = effect.commit_order
                AND json_extract(historical.settlement, '$.policyID') = effect.policy_id
                AND json_extract(historical.settlement, '$.version') = effect.version
                AND json_extract(historical.settlement, '$.state') = effect.state
                AND json_extract(historical.settlement, '$.acknowledgementTitle')
                    = effect.acknowledgement_title
                AND json_extract(historical.settlement, '$.acknowledgementBody')
                    = effect.acknowledgement_body
                AND (
                  (
                    historical.status = 'applied'
                    AND seal.invocation_part_id = historical.part_id
                    AND receipt.invocation_part_id = historical.part_id
                    AND receipt.origin_session_id = historical.session_id
                    AND receipt.origin_message_id = historical.parent_user_message_id
                    AND receipt.assistant_message_id = historical.assistant_message_id
                    AND historical.time_settled = effect.time_committed
                    AND historical.settlement_order = effect.commit_order
                  )
                  OR (
                    historical.status = 'already_applied'
                    AND seal.invocation_part_id = receipt.invocation_part_id
                    AND historical.time_settled >= effect.time_committed
                  )
                )
            )
          )
          OR (
            historical.command_name = 'update_learner_goals'
            AND historical.command_version = 1
            AND historical.capability_identity = 'update_learner_goals'
            AND historical.capability_version = 1
            AND historical.authorization_basis IN ('learner_request', 'learner_acceptance')
            AND json_extract(historical.settlement, '$.goalKind') = 'learner_goal'
            AND json_extract(historical.settlement, '$.authorizationBasis')
                = historical.authorization_basis
            AND (SELECT count(*) FROM json_each(historical.settlement))
                = 11
                  + CASE WHEN historical.authorization_basis = 'learner_acceptance' THEN 1 ELSE 0 END
                  + CASE WHEN historical.status = 'already_applied' THEN 1 ELSE 0 END
            AND (
              historical.status = 'applied'
              OR json_type(historical.settlement, '$.currentHeads') = 'array'
            )
            AND EXISTS (
              SELECT 1
              FROM __v11_learning_command_receipt AS receipt
              JOIN learner_goal_commit_seal AS seal
                ON seal.receipt_id = receipt.id
              JOIN learner_goal_effect AS effect
                ON effect.id = seal.effect_id
              WHERE receipt.id = json_extract(historical.settlement, '$.receiptID')
                AND receipt.goal_effect_id = historical.goal_effect_id
                AND seal.effect_id = historical.goal_effect_id
                AND seal.effect_id = json_extract(historical.settlement, '$.effectID')
                AND effect.occurrence_id = historical.occurrence_id
                AND effect.authorization_basis = historical.authorization_basis
                AND effect.semantic_fingerprint = historical.goal_semantic_fingerprint
                AND json(effect.command) = json(historical.goal_command_snapshot)
                AND receipt.occurrence_id = historical.occurrence_id
                AND receipt.capability_identity = historical.capability_identity
                AND receipt.capability_version = historical.capability_version
                AND receipt.authorization_basis = historical.authorization_basis
                AND receipt.time_committed = effect.time_committed
                AND receipt.commit_order = effect.commit_order
                AND json_extract(historical.settlement, '$.frontierSequence')
                    = effect.frontier_sequence
                AND json_extract(historical.settlement, '$.acknowledgementTitle')
                    = effect.acknowledgement_title
                AND json_extract(historical.settlement, '$.acknowledgementBody')
                    = effect.acknowledgement_body
                AND json_array_length(historical.settlement, '$.operations')
                    = effect.operation_count
                AND NOT EXISTS (
                  SELECT 1
                  FROM json_each(historical.settlement, '$.operations') AS settled
                  LEFT JOIN learner_goal_effect_operation AS operation
                    ON operation.effect_id = effect.id
                   AND operation.ordinal = CAST(settled.key AS INTEGER)
                  WHERE operation.effect_id IS NULL
                     OR (SELECT count(*) FROM json_each(settled.value))
                          <> CASE
                               WHEN json_type(settled.value, '$.replacementTarget') = 'object' THEN 9
                               ELSE 8
                             END
                     OR json_extract(settled.value, '$.ordinal') IS NOT operation.ordinal
                     OR json_extract(settled.value, '$.operation') IS NOT operation.operation_kind
                     OR json_extract(settled.value, '$.result') IS NOT operation.result_kind
                     OR json_extract(settled.value, '$.goalID') IS NOT operation.goal_id
                     OR json_extract(settled.value, '$.revisionID') IS NOT operation.revision_id
                     OR json_extract(settled.value, '$.version') IS NOT operation.version
                     OR json_extract(settled.value, '$.disposition') IS NOT operation.disposition
                     OR json(json_extract(settled.value, '$.meaning')) <> json(operation.meaning)
                     OR json_extract(settled.value, '$.replacementTarget.type')
                          IS NOT operation.replacement_target_kind
                     OR json_extract(settled.value, '$.replacementTarget.goalID')
                          IS NOT operation.replacement_target_goal_id
                     OR json_extract(settled.value, '$.replacementTarget.revisionID')
                          IS NOT operation.replacement_target_revision_id
                     OR json_extract(settled.value, '$.replacementTarget.version')
                          IS NOT operation.replacement_target_version
                )
                AND (
                  (
                    effect.authorization_basis = 'learner_request'
                    AND historical.permission_request_id IS NULL
                    AND historical.goal_confirmation_snapshot IS NULL
                    AND receipt.permission_request_id IS NULL
                    AND receipt.confirmation_snapshot IS NULL
                    AND json_extract(historical.settlement, '$.confirmationRequestID') IS NULL
                  )
                  OR (
                    effect.authorization_basis = 'learner_acceptance'
                    AND historical.permission_request_id IS NOT NULL
                    AND historical.goal_confirmation_snapshot IS NOT NULL
                    AND receipt.permission_request_id = historical.permission_request_id
                    AND json(receipt.confirmation_snapshot)
                        = json(historical.goal_confirmation_snapshot)
                    AND json_extract(historical.goal_confirmation_snapshot, '$.semanticFingerprint')
                        = effect.semantic_fingerprint
                    AND json(json_extract(historical.goal_confirmation_snapshot, '$.command'))
                        = json(effect.command)
                    AND json_extract(historical.settlement, '$.confirmationRequestID')
                        = historical.permission_request_id
                  )
                )
                AND (
                  (
                    historical.status = 'applied'
                    AND seal.invocation_part_id = historical.part_id
                    AND receipt.invocation_part_id = historical.part_id
                    AND receipt.origin_session_id = historical.session_id
                    AND receipt.origin_message_id = historical.parent_user_message_id
                    AND receipt.assistant_message_id = historical.assistant_message_id
                    AND historical.time_settled = effect.time_committed
                    AND historical.settlement_order = effect.commit_order
                  )
                  OR (
                    historical.status = 'already_applied'
                    AND seal.invocation_part_id = receipt.invocation_part_id
                    AND historical.time_settled >= effect.time_committed
                  )
                )
            )
          )
          OR (
            historical.status = 'no_change'
            AND (
              (
                historical.command_name = 'set_default_course_preference'
                AND historical.command_version = 1
                AND historical.capability_identity = 'set_default_course_preference'
                AND historical.capability_version = 1
                AND historical.authorization_basis = 'learner_acceptance'
                AND json_extract(historical.settlement, '$.navigationKind')
                    = 'default_course_preference'
                AND (SELECT count(*) FROM json_each(historical.settlement)) = 5
                AND json_type(historical.settlement, '$.current') = 'object'
                AND json_extract(historical.settlement, '$.current.kind')
                    = 'default_course_preference'
                AND json_type(historical.settlement, '$.current.headID') IN ('text', 'null')
                AND json_type(historical.settlement, '$.current.version') = 'integer'
                AND json_extract(historical.settlement, '$.current.version') >= 0
                AND json_type(historical.settlement, '$.current.courseID') IN ('text', 'null')
                AND json_type(historical.settlement, '$.current.usability') = 'object'
              )
              OR (
                historical.command_name = 'set_course_route_anchor'
                AND historical.command_version = 1
                AND historical.capability_identity = 'set_course_route_anchor'
                AND historical.capability_version = 1
                AND historical.authorization_basis = 'learner_request'
                AND json_extract(historical.settlement, '$.navigationKind')
                    = 'course_route_anchor'
                AND (SELECT count(*) FROM json_each(historical.settlement)) = 5
                AND json_type(historical.settlement, '$.current') = 'object'
                AND json_extract(historical.settlement, '$.current.kind')
                    = 'course_route_anchor'
                AND json_type(historical.settlement, '$.current.courseID') = 'text'
                AND json_type(historical.settlement, '$.current.headID') IN ('text', 'null')
                AND json_type(historical.settlement, '$.current.version') = 'integer'
                AND json_extract(historical.settlement, '$.current.version') >= 0
                AND json_type(historical.settlement, '$.current.target') IN ('object', 'null')
                AND json_type(historical.settlement, '$.current.usability') = 'object'
              )
              OR (
                historical.command_name = 'update_retained_learning_steering'
                AND historical.command_version = 1
                AND historical.capability_identity = 'update_retained_learning_steering'
                AND historical.capability_version = 1
                AND historical.authorization_basis = 'learner_request'
                AND historical.retained_steering_semantic_fingerprint IS NOT NULL
                AND json_extract(historical.settlement, '$.steeringKind') = 'retained_steering'
                AND (SELECT count(*) FROM json_each(historical.settlement)) = 9
                AND json_type(historical.settlement, '$.policyID') = 'text'
                AND json_type(historical.settlement, '$.version') = 'integer'
                AND json_extract(historical.settlement, '$.version') >= 1
                AND json_extract(historical.settlement, '$.state') IN ('operative', 'retracted')
                AND json_type(historical.settlement, '$.acknowledgementTitle') = 'text'
                AND length(json_extract(historical.settlement, '$.acknowledgementTitle')) > 0
                AND json_type(historical.settlement, '$.acknowledgementBody') = 'text'
                AND length(json_extract(historical.settlement, '$.acknowledgementBody')) > 0
              )
              OR (
                historical.command_name = 'update_learner_goals'
                AND historical.command_version = 1
                AND historical.capability_identity = 'update_learner_goals'
                AND historical.capability_version = 1
                AND historical.authorization_basis IN ('learner_request', 'learner_acceptance')
                AND historical.goal_semantic_fingerprint IS NOT NULL
                AND historical.goal_command_snapshot IS NOT NULL
                AND json_extract(historical.settlement, '$.goalKind') = 'learner_goal'
                AND (SELECT count(*) FROM json_each(historical.settlement)) = 7
                AND json_type(historical.settlement, '$.operations') = 'array'
                AND json_array_length(historical.settlement, '$.operations') BETWEEN 1 AND 8
                AND json_type(historical.settlement, '$.acknowledgementTitle') = 'text'
                AND length(json_extract(historical.settlement, '$.acknowledgementTitle')) > 0
                AND json_type(historical.settlement, '$.acknowledgementBody') = 'text'
                AND length(json_extract(historical.settlement, '$.acknowledgementBody')) > 0
                AND NOT EXISTS (
                  SELECT 1
                  FROM json_each(historical.settlement, '$.operations') AS operation
                  WHERE json_type(operation.value) IS NOT 'object'
                     OR (SELECT count(*) FROM json_each(operation.value))
                          <> CASE
                               WHEN json_type(operation.value, '$.replacementTarget') = 'object' THEN 9
                               ELSE 8
                             END
                     OR json_extract(operation.value, '$.ordinal') IS NOT CAST(operation.key AS INTEGER)
                     OR NOT COALESCE(
                          json_extract(operation.value, '$.operation') IN ('create', 'update', 'replace'),
                          0
                        )
                     OR json_extract(operation.value, '$.result') IS NOT 'no_change'
                     OR json_type(operation.value, '$.goalID') IS NOT 'text'
                     OR json_type(operation.value, '$.revisionID') IS NOT 'text'
                     OR json_type(operation.value, '$.version') IS NOT 'integer'
                     OR json_extract(operation.value, '$.version') < 1
                     OR NOT COALESCE(
                          json_extract(operation.value, '$.disposition')
                            IN ('active', 'achieved', 'abandoned', 'superseded'),
                          0
                        )
                     OR json_type(operation.value, '$.meaning') IS NOT 'object'
                )
              )
            )
          )
          OR (
            historical.status = 'error'
            AND (SELECT count(*) FROM json_each(historical.settlement))
                = CASE WHEN json_type(historical.settlement, '$.detail') = 'object' THEN 5 ELSE 4 END
            AND (
              json_type(historical.settlement, '$.detail') IS NULL
              OR (
                json_type(historical.settlement, '$.detail') = 'object'
                AND NOT EXISTS (
                  SELECT 1
                  FROM json_each(historical.settlement, '$.detail') AS detail
                  WHERE detail.key NOT IN ('entity', 'id', 'effectID', 'acceptedRevisionID')
                     OR detail.type <> 'text'
                     OR (detail.key = 'entity'
                         AND detail.value NOT IN ('course', 'view', 'revision', 'selection', 'goal'))
                )
              )
            )
            AND (
              (
                historical.command_name = 'accept_course_view_revision'
                AND historical.command_version = 1
                AND historical.capability_identity = 'accept_course_view_revision'
                AND historical.capability_version = 1
                AND historical.authorization_basis IN ('learner_request', 'learner_acceptance')
                AND NOT EXISTS (
                  SELECT 1
                  FROM json_each(historical.settlement, '$.detail') AS detail
                  WHERE detail.key = 'entity' AND detail.value = 'goal'
                )
                AND json_extract(historical.settlement, '$.code') IN (
                  'semantic_conflict', 'context_refresh_required', 'permission_rejected',
                  'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
                  'outcome_unknown', 'stale', 'inactive', 'validation_error'
                )
              )
              OR (
                historical.command_name = 'representation.convert'
                AND historical.command_version = 1
                AND historical.capability_identity = 'representation.convert'
                AND historical.capability_version = 1
                AND historical.authorization_basis = 'learner_request'
                AND json_type(historical.settlement, '$.detail') IS NULL
                AND (SELECT count(*) FROM json_each(historical.settlement)) = 4
                AND json_extract(historical.settlement, '$.code') IN (
                  'semantic_conflict', 'context_refresh_required', 'permission_rejected',
                  'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
                  'ambiguous_content_root', 'unsupported_source', 'source_too_large',
                  'producer_unavailable', 'producer_failed', 'producer_timeout',
                  'invalid_producer_output', 'publication_failed', 'outcome_unknown',
                  'stale', 'inactive', 'validation_error'
                )
              )
              OR (
                historical.command_name = 'set_default_course_preference'
                AND historical.command_version = 1
                AND historical.capability_identity = 'set_default_course_preference'
                AND historical.capability_version = 1
                AND historical.authorization_basis = 'learner_acceptance'
                AND json_type(historical.settlement, '$.detail') IS NULL
                AND (SELECT count(*) FROM json_each(historical.settlement)) = 4
                AND json_extract(historical.settlement, '$.code') IN (
                  'semantic_conflict', 'context_refresh_required', 'permission_rejected',
                  'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
                  'outcome_unknown', 'stale', 'inactive', 'validation_error'
                )
              )
              OR (
                historical.command_name = 'set_course_route_anchor'
                AND historical.command_version = 1
                AND historical.capability_identity = 'set_course_route_anchor'
                AND historical.capability_version = 1
                AND historical.authorization_basis = 'learner_request'
                AND json_type(historical.settlement, '$.detail') IS NULL
                AND (SELECT count(*) FROM json_each(historical.settlement)) = 4
                AND json_extract(historical.settlement, '$.code') IN (
                  'semantic_conflict', 'context_refresh_required', 'permission_rejected',
                  'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
                  'outcome_unknown', 'stale', 'inactive', 'validation_error'
                )
              )
              OR (
                historical.command_name = 'update_retained_learning_steering'
                AND historical.command_version = 1
                AND historical.capability_identity = 'update_retained_learning_steering'
                AND historical.capability_version = 1
                AND historical.authorization_basis = 'learner_request'
                AND historical.retained_steering_semantic_fingerprint IS NOT NULL
                AND json_extract(historical.settlement, '$.code') IN (
                  'semantic_conflict', 'context_refresh_required', 'permission_rejected',
                  'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
                  'temporal_context_unavailable', 'capacity_exceeded', 'outcome_unknown',
                  'stale', 'validation_error'
                )
                AND (
                  (
                    json_extract(historical.settlement, '$.code') <> 'semantic_conflict'
                    AND json_type(historical.settlement, '$.detail') IS NULL
                    AND (SELECT count(*) FROM json_each(historical.settlement)) = 4
                  )
                  OR (
                    json_extract(historical.settlement, '$.code') = 'semantic_conflict'
                    AND json_type(historical.settlement, '$.detail') = 'object'
                    AND (SELECT count(*) FROM json_each(historical.settlement)) = 5
                    AND (SELECT count(*) FROM json_each(historical.settlement, '$.detail')) = 1
                    AND json_type(historical.settlement, '$.detail.effectID') = 'text'
                  )
                )
              )
              OR (
                historical.command_name = 'update_learner_goals'
                AND historical.command_version = 1
                AND historical.capability_identity = 'update_learner_goals'
                AND historical.capability_version = 1
                AND historical.authorization_basis IN ('learner_request', 'learner_acceptance')
                AND historical.goal_semantic_fingerprint IS NOT NULL
                AND historical.goal_command_snapshot IS NOT NULL
                AND json_extract(historical.settlement, '$.code') IN (
                  'semantic_conflict', 'context_refresh_required', 'permission_rejected',
                  'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
                  'temporal_context_unavailable', 'capacity_exceeded', 'outcome_unknown',
                  'stale', 'inactive', 'validation_error'
                )
                AND (
                  (
                    json_type(historical.settlement, '$.detail') IS NULL
                    AND (SELECT count(*) FROM json_each(historical.settlement)) = 4
                  )
                  OR (
                    json_extract(historical.settlement, '$.code') = 'semantic_conflict'
                    AND json_type(historical.settlement, '$.detail') = 'object'
                    AND (SELECT count(*) FROM json_each(historical.settlement)) = 5
                    AND (SELECT count(*) FROM json_each(historical.settlement, '$.detail')) = 1
                    AND json_type(historical.settlement, '$.detail.effectID') = 'text'
                  )
                )
              )
            )
          )
        )
    `,
    )
    .pipe(Effect.orDie)
}

function createSeal(
  tx: Parameters<DatabaseMigration.Migration["up"]>[0],
  table: string,
  sealEffectColumn: string,
  effectTable: string,
  receiptEffectColumn: string,
) {
  return Effect.gen(function* () {
    yield* tx.run(`
      CREATE TABLE ${quoteIdentifier(table)} (
        ${quoteIdentifier(sealEffectColumn)} text PRIMARY KEY,
        receipt_id text NOT NULL CONSTRAINT ${quoteIdentifier(`${table}_receipt_unique`)} UNIQUE,
        invocation_part_id text NOT NULL CONSTRAINT ${quoteIdentifier(`${table}_invocation_unique`)} UNIQUE,
        CONSTRAINT ${quoteIdentifier(`fk_${table}_${sealEffectColumn}_${effectTable}_id_fk`)}
          FOREIGN KEY (${quoteIdentifier(sealEffectColumn)})
          REFERENCES ${quoteIdentifier(effectTable)}(id) ON DELETE RESTRICT,
        CONSTRAINT ${quoteIdentifier(`fk_${table}_receipt_id_learning_command_receipt_id_fk`)}
          FOREIGN KEY (receipt_id) REFERENCES learning_command_receipt(id) ON DELETE RESTRICT,
        CONSTRAINT ${quoteIdentifier(`fk_${table}_invocation_part_id_learning_command_invocation_part_id_fk`)}
          FOREIGN KEY (invocation_part_id) REFERENCES learning_command_invocation(part_id) ON DELETE RESTRICT
      )
    `)
    yield* tx.run(`
      INSERT INTO ${quoteIdentifier(table)} (${quoteIdentifier(sealEffectColumn)}, receipt_id, invocation_part_id)
      SELECT ${quoteIdentifier(receiptEffectColumn)}, id, invocation_part_id
      FROM __v11_learning_command_receipt
      WHERE ${quoteIdentifier(receiptEffectColumn)} IS NOT NULL
    `)
  })
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}
