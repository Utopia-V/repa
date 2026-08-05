import { SqliteClient } from "@effect/sql-sqlite-bun"
import { admitLegacyModelWithoutLearningContext } from "./model-admission"
import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { Turn } from "@opencode-ai/schema/turn"
import { eq, sql } from "drizzle-orm"
import { Effect } from "effect"
import { APPLICATION_ID, BASELINE_ID, BASELINE_VERSION } from "../../src/database/admission"
import { migrations } from "../../src/database/migration.gen"
import agentNativeDefaultCourseMigration from "../../src/database/migration/repa/20260730115237_gate14_agent_native_default_course"
import messageDiffProjectionMigration from "../../src/database/migration/repa/20260731120541_gate08_message_diff_projection"
import { install as installSchemaExtrasV13 } from "../../src/database/schema-extras-v13"
import { LearnerGoal } from "../../src/learner-goal"
import { LearningCommand } from "../../src/learning-command"
import { ModelV2 } from "../../src/model"
import { Project } from "../../src/project"
import { ProjectTable } from "../../src/project/sql"
import { ProviderV2 } from "../../src/provider"
import { AbsolutePath } from "../../src/schema"
import { SessionSchema } from "../../src/session/schema"
import { MessageTable, PartTable, SessionTable } from "../../src/session/sql"
import { TurnLifecycle } from "../../src/turn/turn"
import { PermissionV1 } from "../../src/v1/permission"
import { SessionV1 } from "../../src/v1/session"
import databaseV13Schema from "./database-v13-schema"
import { HistoricalLearnerGoalV1 } from "../lib/historical-learner-goal-v1"

export function seedFrozenV15AdmittedLearnerGoal(
  filename: string,
  options: Readonly<{
    state?: "admitted" | "terminal_applied"
    target?: LearnerGoal.Target
    terminalResult?: (
      settlement: LearningCommand.Settlement,
      envelope: Readonly<{
        partID: SessionV1.PartID
        assistantMessageID: SessionV1.MessageID
        sessionID: SessionSchema.ID
        providerCallID: string
        timeAdmitted: number
      }>,
      goalOperations: readonly LearnerGoal.ResultPresentationOperation[],
    ) => Readonly<{ title: string; metadata: Record<string, unknown>; output: string }>
  }> = {},
) {
  const makeDb = EffectDrizzleSqlite.makeWithDefaults()
  return Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* makeDb
      yield* db.transaction((tx) => databaseV13Schema.up(tx))
      yield* db.transaction((tx) => installSchemaExtrasV13(tx))
      yield* db.run("PRAGMA foreign_keys = OFF")
      yield* db.transaction((tx) => agentNativeDefaultCourseMigration.up(tx))
      yield* db.transaction((tx) => messageDiffProjectionMigration.up(tx))
      yield* db.run("PRAGMA foreign_keys = ON")
      yield* db.run("INSERT INTO learner_goal_state (singleton, revision_sequence) VALUES (1, 0)")
      // The current historical-V1 writer selects through the current table projection. Temporarily expose only
      // the later nullable/defaulted columns and the V2 table referenced by the versioned committed-effect
      // predicate while constructing the frozen V15 bytes, then remove them all before recording V15 lineage.
      yield* db.run("ALTER TABLE learner_goal_effect_operation ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1")
      yield* db.run("ALTER TABLE learner_goal_effect ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1")
      yield* db.run("ALTER TABLE learner_goal_effect ADD COLUMN agent_action_part_id TEXT")
      yield* db.run("ALTER TABLE learner_goal_effect ADD COLUMN materialized_snapshot TEXT")
      yield* db.run("ALTER TABLE learner_goal_revision ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1")
      yield* db.run("ALTER TABLE learner_goal_revision ADD COLUMN target_value_v2 TEXT")
      yield* db.run(`
        CREATE TABLE learner_goal_disposition_v2 (
          invocation_part_id TEXT PRIMARY KEY,
          disposition TEXT NOT NULL,
          command_fingerprint TEXT NOT NULL
        )
      `)

      const time = 71
      const sessionID = SessionSchema.ID.make("ses_frozen_v15_goal")
      const userMessageID = SessionV1.MessageID.ascending("msg_frozen_v15_goal_user")
      const userPartID = SessionV1.PartID.ascending("prt_frozen_v15_goal_user")
      const assistantMessageID = SessionV1.MessageID.ascending("msg_frozen_v15_goal_assistant")
      const partID = SessionV1.PartID.ascending("prt_frozen_v15_goal_tool")
      const turnID = Turn.ID.create()
      const inputID = Turn.InputID.create()
      const callID = "call-frozen-v15-goal"
      const permissionRequestID = PermissionV1.ID.ascending("per_frozen_v15_goal")
      const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
      const target = options.target ?? ({ type: "absent" } as const)
      const input = {
        authorizationBasis: "learner_acceptance" as const,
        operations: [
          {
            type: "create" as const,
            snapshot: {
              outcome: "Frozen V15 learner Goal",
              conditions: [] as const,
              scope: { type: "learner_home" as const },
              target,
              fieldBases: {
                outcome: { type: "accepted" as const },
                conditions: { type: "accepted" as const },
                scope: { type: "accepted" as const },
                target: { type: "accepted" as const },
                disposition: { type: "accepted" as const },
              },
            },
            disposition: "active" as const,
          },
        ],
      }
      const command = { operations: input.operations } satisfies LearnerGoal.Command

      yield* db
        .insert(ProjectTable)
        .values({
          id: Project.ID.global,
          worktree: AbsolutePath.make("C:\\frozen-v15"),
          sandboxes: [],
          time_created: time,
          time_updated: time,
        })
        .run()
      yield* db
        .insert(SessionTable)
        .values({
          id: sessionID,
          project_id: Project.ID.global,
          slug: sessionID,
          directory: "C:\\frozen-v15",
          title: "Frozen V15 admitted learner Goal",
          version: "test",
          time_created: time,
          time_updated: time,
        })
        .run()
      yield* db
        .insert(MessageTable)
        .values({
          id: userMessageID,
          session_id: sessionID,
          data: {
            role: "user",
            time: { created: time },
            agent: "repa",
            model,
          } as (typeof MessageTable.$inferInsert)["data"],
          time_created: time,
          time_updated: time,
        })
        .run()
      yield* db
        .insert(PartTable)
        .values({
          id: userPartID,
          session_id: sessionID,
          message_id: userMessageID,
          data: { type: "text", text: "Please remember the frozen Goal." } as (typeof PartTable.$inferInsert)["data"],
          time_created: time,
          time_updated: time,
        })
        .run()
      const occurrence = yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const admitted = yield* LearningCommand.Occurrence.admit(tx, {
            admission: LearningCommand.LearnerAdmission.interactive({ timeZone: "UTC" }),
            sessionID,
            messageID: userMessageID,
            timeAdmitted: time,
          })
          yield* TurnLifecycle.admit(tx, {
            kind: "learner",
            turnID,
            sessionID,
            inputID,
            messageID: userMessageID,
            occurrenceID: admitted.id,
            limits: { model: 1, tool: 1 },
            envelope: { input },
            policyBasis: { source: "frozen-v15-goal-recovery" },
            timeAdmitted: time,
          })
          return admitted
        }),
      )
      const envelope = {
        occurrenceID: occurrence.id,
        turnID,
        inputID,
        sessionID,
        parentUserMessageID: userMessageID,
        assistantMessageID,
        partID,
        providerCallID: callID,
        emissionOrdinal: 0,
        capabilityIdentity: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        capabilityVersion: 1,
        authorizationBasis: "learner_acceptance" as const,
        timeAdmitted: time + 1,
      }
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .insert(MessageTable)
            .values({
              id: assistantMessageID,
              session_id: sessionID,
              data: {
                role: "assistant",
                time: { created: time + 1 },
                parentID: userMessageID,
                modelID: model.modelID,
                providerID: model.providerID,
                mode: "repa",
                agent: "repa",
                path: { cwd: "C:\\frozen-v15", root: "C:\\frozen-v15" },
                cost: 0,
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              } as (typeof MessageTable.$inferInsert)["data"],
              time_created: time + 1,
              time_updated: time + 1,
            })
            .run()
          yield* tx
            .insert(PartTable)
            .values({
              id: partID,
              session_id: sessionID,
              message_id: assistantMessageID,
              data: {
                type: "tool",
                tool: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
                callID,
                state: { status: "pending", input, raw: JSON.stringify(input) },
              } as (typeof PartTable.$inferInsert)["data"],
              time_created: time + 1,
              time_updated: time + 1,
            })
            .run()
          yield* admitLegacyModelWithoutLearningContext(tx, {
            turnID,
            sessionID,
            assistantMessageID,
            requestEnvelope: { input },
            contextFingerprint: new Bun.CryptoHasher("sha256").update("frozen-v15-goal").digest("hex"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: time + 1,
          })
          yield* TurnLifecycle.sealCandidateSet(tx, {
            turnID,
            sessionID,
            assistantMessageID,
            candidates: [
              { partID, callID, tool: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, envelope: { input } },
            ],
            timeSealed: time + 1,
          })
          yield* TurnLifecycle.settleModel(tx, {
            turnID,
            assistantMessageID,
            state: "completed",
            time: time + 1,
          })
          yield* TurnLifecycle.admitTool(tx, { turnID, sessionID, assistantMessageID, partID, timeAdmitted: time + 1 })
          const reserved = yield* HistoricalLearnerGoalV1.reserveLearnerGoals(tx, {
            envelope,
            command,
            permissionRequestID,
          })
          if (reserved.type !== "candidate") return yield* Effect.die("Frozen V15 Goal did not remain admitted")
        }),
      )
      if (options.state === "terminal_applied") {
        const terminal = yield* db.transaction((tx) =>
          Effect.gen(function* () {
            const prepared = yield* HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
              envelope,
              command,
              permissionRequestID,
              settlement: { time: time + 2, order: 1 },
            })
            if (prepared.type !== "confirmation") {
              return yield* Effect.die("Frozen V15 Goal did not prepare its historical confirmation")
            }
            return yield* HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
              envelope,
              command,
              permissionRequestID,
              permission: { type: "allow" },
              displayedConfirmation: prepared.confirmation,
              preparedConfirmation: prepared.preparedConfirmation,
              settlement: { time: time + 3, order: 2 },
            })
          }),
        )
        if (terminal.type !== "settled") return yield* Effect.die("Frozen V15 Goal did not settle")
        if (terminal.settlement.outcome !== "applied") {
          return yield* Effect.die("Frozen V15 Goal did not reach its terminal applied state")
        }
        const applied = terminal.settlement
        if (options.terminalResult) {
          const goalOperations = yield* db.transaction((tx) =>
            LearnerGoal.prepareResultPresentation(tx, applied.operations, applied.settlementTime),
          )
          const exact = options.terminalResult(applied, envelope, goalOperations)
          yield* db
            .update(PartTable)
            .set({
              data: {
                type: "tool",
                tool: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
                callID,
                state: {
                  status: "completed",
                  input,
                  output: exact.output,
                  title: exact.title,
                  metadata: exact.metadata,
                  time: { start: time + 1, end: applied.settlementTime },
                },
              } as (typeof PartTable.$inferInsert)["data"],
              time_updated: applied.settlementTime,
            })
            .where(eq(PartTable.id, partID))
            .run()
          yield* db.transaction((tx) =>
            Effect.gen(function* () {
              yield* TurnLifecycle.settleTool(tx, {
                turnID,
                partID,
                state: "completed",
                time: applied.settlementTime,
              })
              yield* TurnLifecycle.settle(tx, {
                turnID,
                outcome: "completed",
                reason: "normal",
                time: applied.settlementTime,
              })
            }),
          )
        }
      }

      yield* db.run("DROP TABLE learner_goal_disposition_v2")
      yield* db.run("ALTER TABLE learner_goal_effect_operation DROP COLUMN schema_version")
      yield* db.run("ALTER TABLE learner_goal_effect DROP COLUMN materialized_snapshot")
      yield* db.run("ALTER TABLE learner_goal_effect DROP COLUMN agent_action_part_id")
      yield* db.run("ALTER TABLE learner_goal_effect DROP COLUMN schema_version")
      yield* db.run("ALTER TABLE learner_goal_revision DROP COLUMN target_value_v2")
      yield* db.run("ALTER TABLE learner_goal_revision DROP COLUMN schema_version")

      const lastV15 = migrations.findIndex((migration) => migration.id === messageDiffProjectionMigration.id)
      if (lastV15 < 0) return yield* Effect.die("Frozen V15 fixture cannot locate the V15 migration boundary")
      const historical = migrations.slice(0, lastV15 + 1)
      yield* db.run(`
        CREATE TABLE repa_migration (
          version INTEGER PRIMARY KEY,
          id TEXT NOT NULL UNIQUE,
          time_completed INTEGER NOT NULL
        )
      `)
      yield* Effect.forEach(
        [
          { version: BASELINE_VERSION, id: BASELINE_ID },
          ...historical.map((migration, index) => ({ version: BASELINE_VERSION + index + 1, id: migration.id })),
        ],
        (entry) =>
          db.run(sql`
            INSERT INTO repa_migration (version, id, time_completed)
            VALUES (${entry.version}, ${entry.id}, ${time})
          `),
        { discard: true },
      )
      yield* db.run(sql.raw(`PRAGMA application_id = ${APPLICATION_ID}`))
      yield* db.run(sql.raw(`PRAGMA user_version = ${BASELINE_VERSION + historical.length}`))
      const legacyGoal = yield* db.get<{ goalID: string; revisionID: string }>(sql`
        SELECT goal_id AS goalID, id AS revisionID
        FROM learner_goal_revision
        ORDER BY revision_order DESC
        LIMIT 1
      `)
      return {
        input,
        partID,
        permissionRequestID,
        legacyGoal,
        registration: {
          turnID,
          inputID,
          causalOccurrenceID: occurrence.id,
          partID,
          callID,
          emissionOrdinal: 0,
          sessionID,
          parentUserMessageID: userMessageID,
          assistantMessageID,
        },
      }
    }).pipe(Effect.provide(SqliteClient.layer({ filename, disableWAL: true })), Effect.scoped),
  )
}
