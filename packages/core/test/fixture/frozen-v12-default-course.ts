import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { Turn } from "@opencode-ai/schema/turn"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { APPLICATION_ID, BASELINE_ID, BASELINE_VERSION } from "../../src/database/admission"
import { migrations } from "../../src/database/migration.gen"
import { install as installSchemaExtrasV12 } from "../../src/database/schema-extras-v12"
import { LearningCommand } from "../../src/learning-command"
import { LearningCommandInvocationTable } from "../../src/learning-command/sql"
import { LearnerDefaultCourseCommandTable } from "../../src/learner-navigation/sql"
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
import databaseV12Schema from "./database-v12-schema"

export function seedFrozenV12AdmittedDefaultCourse(filename: string) {
  const makeDb = EffectDrizzleSqlite.makeWithDefaults()
  return Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* makeDb
      yield* db.transaction((tx) => databaseV12Schema.up(tx))
      yield* db.transaction((tx) => installSchemaExtrasV12(tx))

      const time = 24
      const sessionID = SessionSchema.ID.make("ses_frozen_v12_default")
      const userMessageID = SessionV1.MessageID.ascending("msg_frozen_v12_default_user")
      const userPartID = SessionV1.PartID.ascending("prt_frozen_v12_default_user")
      const assistantMessageID = SessionV1.MessageID.ascending("msg_frozen_v12_default_assistant")
      const partID = SessionV1.PartID.ascending("prt_frozen_v12_default_tool")
      const turnID = Turn.ID.create()
      const inputID = Turn.InputID.create()
      const callID = "call-frozen-v12-default"
      const permissionRequestID = PermissionV1.ID.ascending("per_frozen_v12_default")
      const input = { expectedHeadID: null, expectedVersion: 0, target: null } as const
      const command = { kind: "default_course_preference", ...input } as const
      const model = {
        modelID: ModelV2.ID.make("model"),
        providerID: ProviderV2.ID.make("provider"),
      }

      yield* db
        .insert(ProjectTable)
        .values({
          id: Project.ID.global,
          worktree: AbsolutePath.make("C:\\frozen-v12"),
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
          directory: "C:\\frozen-v12",
          title: "Frozen V12 admitted Default Course",
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
          data: { type: "text", text: "Keep no default Course." } as (typeof PartTable.$inferInsert)["data"],
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
            limits: { model: 10, tool: 10 },
            envelope: { input },
            policyBasis: { source: "frozen-v12-recovery-oracle" },
            timeAdmitted: time,
          })
          return admitted
        }),
      )
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .insert(MessageTable)
            .values({
              id: assistantMessageID,
              session_id: sessionID,
              data: {
                role: "assistant",
                time: { created: time },
                parentID: userMessageID,
                modelID: model.modelID,
                providerID: model.providerID,
                mode: "repa",
                agent: "repa",
                path: { cwd: "C:\\frozen-v12", root: "C:\\frozen-v12" },
                cost: 0,
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              } as (typeof MessageTable.$inferInsert)["data"],
              time_created: time,
              time_updated: time,
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
                tool: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                callID,
                state: { status: "pending", input, raw: JSON.stringify(input) },
              } as (typeof PartTable.$inferInsert)["data"],
              time_created: time,
              time_updated: time,
            })
            .run()
          yield* TurnLifecycle.admitModel(tx, {
            turnID,
            sessionID,
            assistantMessageID,
            requestEnvelope: { input },
            contextFingerprint: new Bun.CryptoHasher("sha256").update("frozen-v12-context").digest("hex"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: time,
          })
          yield* TurnLifecycle.sealCandidateSet(tx, {
            turnID,
            sessionID,
            assistantMessageID,
            candidates: [
              {
                partID,
                callID,
                tool: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                envelope: { input },
              },
            ],
            timeSealed: time,
          })
          yield* TurnLifecycle.settleModel(tx, {
            turnID,
            assistantMessageID,
            state: "completed",
            time,
          })
          yield* TurnLifecycle.admitTool(tx, {
            turnID,
            sessionID,
            assistantMessageID,
            partID,
            timeAdmitted: time,
          })
        }),
      )

      const inputFingerprint = new Bun.CryptoHasher("sha256")
        .update(
          JSON.stringify({
            command: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            commandVersion: 1,
            occurrenceID: occurrence.id,
            turnID,
            inputID,
            sessionID,
            parentUserMessageID: userMessageID,
            assistantMessageID,
            partID,
            providerCallID: callID,
            emissionOrdinal: 0,
            capabilityIdentity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            capabilityVersion: 1,
            authorizationBasis: "learner_acceptance",
            timeAdmitted: time,
            input: command,
            trusted: { permissionRequestID },
          }),
        )
        .digest("hex")
      yield* db
        .insert(LearningCommandInvocationTable)
        .values({
          part_id: partID,
          turn_id: turnID,
          input_id: inputID,
          session_id: sessionID,
          parent_user_message_id: userMessageID,
          assistant_message_id: assistantMessageID,
          provider_call_id: callID,
          occurrence_id: occurrence.id,
          command_name: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          command_version: 1,
          emission_ordinal: 0,
          capability_identity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          capability_version: 1,
          authorization_basis: "learner_acceptance",
          input_fingerprint: inputFingerprint,
          status: "admitted",
          time_admitted: time,
        })
        .run()
      yield* db
        .insert(LearnerDefaultCourseCommandTable)
        .values({ invocation_part_id: partID, permission_request_id: permissionRequestID })
        .run()

      const historical = migrations.slice(0, -1)
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
          ...historical.map((migration, index) => ({
            version: BASELINE_VERSION + index + 1,
            id: migration.id,
          })),
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
      const part = yield* db.get<{ rawPart: string }>(sql`
        SELECT CAST(data AS text) AS rawPart FROM part WHERE id = ${partID}
      `)
      if (!part) return yield* Effect.die("Frozen V12 fixture lost its admitted Tool Part")
      return {
        partID,
        turnID,
        inputID,
        permissionRequestID,
        inputFingerprint,
        rawPart: part.rawPart,
      }
    }).pipe(Effect.provide(SqliteClient.layer({ filename, disableWAL: true })), Effect.scoped),
  )
}
