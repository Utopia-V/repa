import { describe, expect } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { Effect, Exit, Layer } from "effect"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearnerGoalDispositionV2Table } from "@opencode-ai/core/learner-goal/sql"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Turn } from "@opencode-ai/schema/turn"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(LayerNode.compile(LayerNode.group([Course.node, Database.node]), [[Database.node, database]]))
const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

describe("Agent-native learner Goal authority", () => {
  it.effect("materializes trusted V2 identity and commits a normalized target", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const command = {
        operations: [
          {
            type: "create",
            outcome: "Pass the systems exam",
            conditions: ["Finish the practice set"],
            target: {
              type: "instant",
              localDateTime: "2026-08-05T09:30:00",
              timeZone: { type: "iana", name: "Asia/Shanghai" },
            },
          },
        ],
      } as const satisfies LearnerGoal.CommandV2
      const invocation = yield* seedAgentInvocation(db, "create", command, 1_000)

      const reserved = yield* db.transaction((tx) =>
        LearningCommand.reserveLearnerGoalsV2(tx, {
          ...invocation,
          settlement: { time: 1_001, order: 1 },
        }),
      )
      expect(reserved).toMatchObject({
        type: "admitted",
        candidate: {
          kind: "candidate_v2",
          agentAction: {
            kind: "root",
            occurrenceID: invocation.envelope.occurrenceID,
            turnID: invocation.envelope.turnID,
            invocationPartID: invocation.envelope.partID,
            lineage: [],
          },
          materialized: {
            schemaVersion: 2,
            canonicalCommand: {
              operations: [
                {
                  type: "create",
                  outcome: "Pass the systems exam",
                  scope: { type: "learner_home" },
                  disposition: "active",
                },
              ],
            },
          },
        },
      })
      if (reserved.type !== "admitted" || !reserved.candidate) {
        return yield* Effect.die("Expected a V2 Goal candidate")
      }
      yield* db.transaction((tx) =>
        LearningCommand.settleLearnerGoalPolicyV2(tx, {
          partID: invocation.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "test", rule: "allow" },
          time: 1_002,
          order: 2,
        }),
      )
      const settled = yield* db.transaction((tx) =>
        LearningCommand.settleLearnerGoalsV2(tx, {
          partID: invocation.envelope.partID,
          settlement: { time: 1_003, order: 3 },
        }),
      )
      expect(settled).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          goalKind: "learner_goal",
          schemaVersion: 2,
          provenance: "agent_action",
          operations: [{ schemaVersion: 2, operation: "create", result: "changed", version: 1 }],
        },
      })
      if (
        settled.type !== "settled" ||
        settled.settlement.outcome !== "applied" ||
        settled.settlement.goalKind !== "learner_goal" ||
        settled.settlement.schemaVersion !== 2
      ) {
        return yield* Effect.die("Expected a V2 Goal effect")
      }
      const applied = settled.settlement
      const operation = applied.operations[0]!
      expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, operation.goalID, 1_003))).toMatchObject({
        goalID: operation.goalID,
        head: {
          schemaVersion: 2,
          targetVersion: 2,
          target: {
            type: "instant",
            resolvedZone: { type: "iana", name: "Asia/Shanghai" },
            utcOffsetMinutes: 480,
          },
        },
      })
      expect(yield* db.transaction((tx) => LearnerGoal.readEffect(tx, applied.effectID))).toMatchObject({
        schemaVersion: 2,
        effectID: applied.effectID,
        authorizationBasis: "agent_action",
        command: reserved.candidate.canonicalCommand,
        agentAction: reserved.candidate.agentAction,
        materialized: reserved.candidate.materialized,
        capability: { outcome: "policy_allow" },
        operations: [
          {
            schemaVersion: 2,
            meaning: {
              target: {
                type: "instant",
                resolvedZone: { type: "iana", name: "Asia/Shanghai", releaseID: "iana-tzdb-2026c" },
                utcOffsetMinutes: 480,
              },
            },
          },
        ],
      })
      expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
    }),
  )

  it.effect("normalizes every V2 target and zone arm from trusted civil input", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const instant = Date.parse("2030-08-05T10:30:00+08:00")
      const cases: readonly Readonly<{
        name: string
        target: LearnerGoal.TargetIntentV2
        sourceTimeZone?: string | null
        expected: LearnerGoal.TargetValueV2
        display: string
      }>[] = [
        {
          name: "absent",
          target: { type: "absent" },
          expected: { type: "absent" },
          display: "no target",
        },
        {
          name: "instant-fixed-offset",
          target: {
            type: "instant",
            localDateTime: "2030-08-05T10:30:00",
            timeZone: { type: "fixed_offset", offsetMinutes: 480 },
          },
          expected: {
            type: "instant",
            instant,
            utcOffsetMinutes: 480,
            resolvedZone: { type: "fixed_offset", offsetMinutes: 480 },
          },
          display: new Date(instant).toISOString(),
        },
        {
          name: "instant-iana",
          target: {
            type: "instant",
            localDateTime: "2030-08-05T10:30:00",
            timeZone: { type: "iana", name: "Asia/Shanghai" },
          },
          expected: {
            type: "instant",
            instant,
            utcOffsetMinutes: 480,
            resolvedZone: { type: "iana", name: "Asia/Shanghai", releaseID: "iana-tzdb-2026c" },
          },
          display: new Date(instant).toISOString(),
        },
        {
          name: "instant-source",
          target: {
            type: "instant",
            localDateTime: "2030-08-05T10:30:00",
            timeZone: { type: "source" },
          },
          sourceTimeZone: "Asia/Shanghai",
          expected: {
            type: "instant",
            instant,
            utcOffsetMinutes: 480,
            resolvedZone: { type: "iana", name: "Asia/Shanghai", releaseID: "iana-tzdb-2026c" },
          },
          display: new Date(instant).toISOString(),
        },
        {
          name: "local-date-iana",
          target: {
            type: "local_date",
            date: "2030-08-05",
            timeZone: { type: "iana", name: "America/New_York" },
          },
          expected: {
            type: "local_date",
            date: "2030-08-05",
            resolvedZone: { type: "iana", name: "America/New_York", releaseID: "iana-tzdb-2026c" },
          },
          display: "2030-08-05",
        },
        {
          name: "local-date-fixed-offset",
          target: {
            type: "local_date",
            date: "2030-08-05",
            timeZone: { type: "fixed_offset", offsetMinutes: 330 },
          },
          expected: {
            type: "local_date",
            date: "2030-08-05",
            resolvedZone: { type: "fixed_offset", offsetMinutes: 330 },
          },
          display: "2030-08-05",
        },
        {
          name: "local-date-source",
          target: { type: "local_date", date: "2030-08-05", timeZone: { type: "source" } },
          sourceTimeZone: "Asia/Shanghai",
          expected: {
            type: "local_date",
            date: "2030-08-05",
            resolvedZone: { type: "iana", name: "Asia/Shanghai", releaseID: "iana-tzdb-2026c" },
          },
          display: "2030-08-05",
        },
      ]

      const normalized = yield* Effect.forEach(cases, (item, index) =>
        Effect.gen(function* () {
          const command = {
            operations: [{ type: "create", outcome: `Target ${item.name}`, target: item.target }],
          } as const satisfies LearnerGoal.CommandV2
          const invocation = yield* seedAgentInvocation(db, `target-${item.name}`, command, 4_000 + index * 100, {
            timeZone: item.sourceTimeZone,
          })
          const reserved = yield* db.transaction((tx) =>
            LearningCommand.reserveLearnerGoalsV2(tx, {
              ...invocation,
              settlement: { time: 4_001 + index * 100, order: index * 3 + 1 },
            }),
          )
          if (reserved.type !== "admitted") return yield* Effect.die(`Target ${item.name} was not admitted`)
          yield* db.transaction((tx) =>
            LearningCommand.settleLearnerGoalPolicyV2(tx, {
              partID: invocation.envelope.partID,
              outcome: "policy_allow",
              policyBasis: { source: "target-matrix", case: item.name },
              time: 4_002 + index * 100,
              order: index * 3 + 2,
            }),
          )
          const settled = yield* db.transaction((tx) =>
            LearningCommand.settleLearnerGoalsV2(tx, {
              partID: invocation.envelope.partID,
              settlement: { time: 4_003 + index * 100, order: index * 3 + 3 },
            }),
          )
          if (settled.type !== "settled" || settled.settlement.outcome !== "applied") {
            return yield* Effect.die(`Target ${item.name} did not settle`)
          }
          const operation = settled.settlement.operations[0]!
          const current = yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, operation.goalID, 10_000))
          return {
            target: current?.head.target,
            body: settled.settlement.acknowledgementBody,
          }
        }),
      )

      expect(normalized.map((item) => item.target)).toEqual(cases.map((item) => item.expected))
      cases.forEach((item, index) => expect(normalized[index]!.body).toContain(item.display))
    }),
  )

  it.effect("commits changed and no-change Goal operations in one atomic V2 effect", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const initialCommand = {
        operations: [
          { type: "create", outcome: "Keep this Goal" },
          { type: "create", outcome: "Change this Goal" },
        ],
      } as const satisfies LearnerGoal.CommandV2
      const initialInvocation = yield* seedAgentInvocation(db, "mixed-initial", initialCommand, 5_000)
      const initialReservation = yield* db.transaction((tx) =>
        LearningCommand.reserveLearnerGoalsV2(tx, {
          ...initialInvocation,
          settlement: { time: 5_001, order: 1 },
        }),
      )
      if (initialReservation.type !== "admitted") return yield* Effect.die("Expected initial Goal candidates")
      yield* db.transaction((tx) =>
        LearningCommand.settleLearnerGoalPolicyV2(tx, {
          partID: initialInvocation.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "mixed-v2-test", phase: "initial" },
          time: 5_002,
          order: 2,
        }),
      )
      const initial = yield* db.transaction((tx) =>
        LearningCommand.settleLearnerGoalsV2(tx, {
          partID: initialInvocation.envelope.partID,
          settlement: { time: 5_003, order: 3 },
        }),
      )
      if (
        initial.type !== "settled" ||
        initial.settlement.outcome !== "applied" ||
        initial.settlement.schemaVersion !== 2
      ) {
        return yield* Effect.die("Expected initial Goal effect")
      }
      const unchanged = initial.settlement.operations[0]!
      const changed = initial.settlement.operations[1]!
      const mixedCommand = {
        operations: [
          {
            type: "update",
            goalID: unchanged.goalID,
            headRevisionID: unchanged.revisionID,
            patch: { outcome: "Keep this Goal" },
          },
          {
            type: "update",
            goalID: changed.goalID,
            headRevisionID: changed.revisionID,
            patch: { outcome: "Changed Goal" },
          },
        ],
      } as const satisfies LearnerGoal.CommandV2
      const mixedInvocation = yield* seedAgentInvocation(db, "mixed-update", mixedCommand, 5_100)
      const mixedReservation = yield* db.transaction((tx) =>
        LearningCommand.reserveLearnerGoalsV2(tx, {
          ...mixedInvocation,
          settlement: { time: 5_101, order: 4 },
        }),
      )
      if (mixedReservation.type !== "admitted") return yield* Effect.die("Expected mixed Goal candidate")
      yield* db.transaction((tx) =>
        LearningCommand.settleLearnerGoalPolicyV2(tx, {
          partID: mixedInvocation.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "mixed-v2-test", phase: "mixed" },
          time: 5_102,
          order: 5,
        }),
      )
      const settled = yield* db.transaction((tx) =>
        LearningCommand.settleLearnerGoalsV2(tx, {
          partID: mixedInvocation.envelope.partID,
          settlement: { time: 5_103, order: 6 },
        }),
      )
      expect(settled).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          schemaVersion: 2,
          operations: [
            {
              result: "no_change",
              goalID: unchanged.goalID,
              revisionID: unchanged.revisionID,
              version: unchanged.version,
            },
            { result: "changed", goalID: changed.goalID, version: changed.version + 1 },
          ],
        },
      })
      expect(
        yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_revision WHERE goal_id = ${unchanged.goalID}`),
      ).toEqual({ count: 1 })
      expect(
        yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_revision WHERE goal_id = ${changed.goalID}`),
      ).toEqual({ count: 2 })
      expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
    }),
  )

  it.effect(
    "settles unrepresentable V2 temporal intents before any Goal candidate exists",
    () =>
      Effect.gen(function* () {
        const db = (yield* Database.Service).db
        const cases: readonly Readonly<{
          name: string
          target: LearnerGoal.TargetIntentV2
          sourceTimeZone?: string | null
          code: "validation_error" | "temporal_context_unavailable"
        }>[] = [
          {
            name: "nonexistent-iana-local-time",
            target: {
              type: "instant",
              localDateTime: "2026-03-08T02:30:00",
              timeZone: { type: "iana", name: "America/New_York" },
            },
            code: "validation_error",
          },
          {
            name: "ambiguous-iana-local-time",
            target: {
              type: "instant",
              localDateTime: "2026-11-01T01:30:00",
              timeZone: { type: "iana", name: "America/New_York" },
            },
            code: "validation_error",
          },
          {
            name: "missing-source-zone",
            target: { type: "instant", localDateTime: "2030-08-05T10:30:00", timeZone: { type: "source" } },
            sourceTimeZone: null,
            code: "temporal_context_unavailable",
          },
          {
            name: "unknown-iana-zone",
            target: {
              type: "instant",
              localDateTime: "2030-08-05T10:30:00",
              timeZone: { type: "iana", name: "Mars/Olympus" },
            },
            code: "validation_error",
          },
          {
            name: "invalid-calendar-date",
            target: {
              type: "local_date",
              date: "2030-02-30",
              timeZone: { type: "iana", name: "Asia/Shanghai" },
            },
            code: "validation_error",
          },
          {
            name: "pre-epoch-fixed-offset",
            target: {
              type: "instant",
              localDateTime: "1969-12-31T23:59:59",
              timeZone: { type: "fixed_offset", offsetMinutes: 0 },
            },
            code: "validation_error",
          },
          {
            name: "pre-epoch-iana",
            target: {
              type: "instant",
              localDateTime: "1969-12-31T23:59:59",
              timeZone: { type: "iana", name: "Asia/Shanghai" },
            },
            code: "validation_error",
          },
        ]

        const rejected = yield* Effect.forEach(cases, (item, index) =>
          Effect.gen(function* () {
            const command = {
              operations: [{ type: "create", outcome: `Reject ${item.name}`, target: item.target }],
            } as const satisfies LearnerGoal.CommandV2
            const invocation = yield* seedAgentInvocation(
              db,
              `invalid-target-${item.name}`,
              command,
              6_000 + index * 100,
              {
                timeZone: item.sourceTimeZone,
              },
            )
            const reserved = yield* db.transaction((tx) =>
              LearningCommand.reserveLearnerGoalsV2(tx, {
                ...invocation,
                settlement: { time: 6_001 + index * 100, order: index + 1 },
              }),
            )
            return {
              reserved,
              state: yield* db.transaction((tx) =>
                LearningCommand.readLearnerGoalInvocationVersion(tx, {
                  partID: invocation.envelope.partID,
                  assistantMessageID: invocation.envelope.assistantMessageID,
                  providerCallID: invocation.envelope.providerCallID,
                }),
              ),
              disposition: yield* db
                .select()
                .from(LearnerGoalDispositionV2Table)
                .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, invocation.envelope.partID))
                .get(),
            }
          }),
        )

        cases.forEach((item, index) => {
          expect(rejected[index]!.reserved).toMatchObject({
            type: "settled",
            settlement: { outcome: "error", code: item.code },
          })
          expect(rejected[index]!.state).toMatchObject({
            version: 2,
            status: "error",
            disposition: "physical_no_effect",
            settlement: { outcome: "error", code: item.code },
          })
          expect(rejected[index]!.disposition).toBeUndefined()
        })
        expect(() =>
          LearningCommand.canonicalizeCommandV2({
            operations: [
              {
                type: "create",
                outcome: "Reject an out-of-range offset",
                target: {
                  type: "instant",
                  localDateTime: "2030-08-05T10:30:00",
                  timeZone: { type: "fixed_offset", offsetMinutes: 841 },
                },
              },
            ],
          }),
        ).toThrow()
        expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 0 })
      }),
    15_000,
  )

  it.effect("rejects malformed canonical, temporal, and Agent-issuance candidate rows", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      expect(() =>
        LearningCommand.canonicalizeCommandV2({
          operations: [
            {
              type: "create",
              outcome: "Reject nested shadow facts",
              target: {
                type: "instant",
                localDateTime: "2030-08-05T10:30:00",
                timeZone: { type: "iana", name: "Asia/Shanghai", releaseID: "shadow" },
                instant: 1,
              },
            },
          ],
          authorization: { type: "learner_request" },
        } as never),
      ).toThrow()
      const command = {
        operations: [{ type: "create", outcome: "Reject shadow fields" }],
      } as const satisfies LearnerGoal.CommandV2
      const invocation = yield* seedAgentInvocation(db, "closed-row", command, 2_000)
      yield* db.transaction((tx) =>
        LearningCommand.reserveLearnerGoalsV2(tx, {
          ...invocation,
          settlement: { time: 2_001, order: 1 },
        }),
      )
      const row = yield* db
        .select()
        .from(LearnerGoalDispositionV2Table)
        .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, invocation.envelope.partID))
        .get()
      if (!row?.canonical_command || !row.agent_action_provenance || !row.materialized_snapshot) {
        return yield* Effect.die("Expected a complete candidate row")
      }
      const fingerprint = "a".repeat(64)
      const malformed = [
        {
          ...row,
          canonical_command: { ...row.canonical_command, authorization: { shadow: true } } as never,
        },
        {
          ...row,
          materialized_snapshot: {
            ...row.materialized_snapshot,
            sourceTemporalContext: { state: "resolved", timeZone: "Asia/Shanghai", utcOffsetMinutes: 841 },
          } as never,
        },
        {
          ...row,
          agent_action_provenance: {
            ...row.agent_action_provenance,
            kind: "delegated",
            effectiveDelegatedCapability: {
              identity: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              version: LearningCommand.UPDATE_LEARNER_GOALS_VERSION,
              projectionVersion: 2,
              fingerprint,
            },
            lineage: [
              {
                childTurnID: row.agent_action_provenance.turnID,
                childSessionID: row.agent_action_provenance.sessionID,
                childDepth: 1,
                parentTurnID: "trn_shadow_parent",
                parentSessionID: "ses_shadow_parent",
                parentDepth: 0,
                parentTaskPartID: "prt_shadow_parent",
                parentModelMessageID: "msg_shadow_parent",
                delegatedCapability: {
                  version: 2,
                  parent: [{ unexpected: true }],
                  inherited: [],
                  profile: [],
                  explicit: [],
                },
                delegatedCapabilityFingerprint: fingerprint,
              },
            ],
          } as never,
        },
      ]
      const rejected = yield* Effect.forEach(malformed, (candidate) =>
        db
          .transaction((tx) =>
            Effect.gen(function* () {
              yield* tx.run("DROP TRIGGER learner_goal_disposition_v2_delete_forbidden_v16")
              yield* tx
                .delete(LearnerGoalDispositionV2Table)
                .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, invocation.envelope.partID))
                .run()
              yield* tx.insert(LearnerGoalDispositionV2Table).values(candidate).run()
            }),
          )
          .pipe(Effect.exit),
      )
      expect(rejected.every(Exit.isFailure)).toBe(true)
    }),
  )

  it.effect("settles an issued prompt reply through the same candidate", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const command = {
        operations: [{ type: "create", outcome: "Prompted Goal" }],
      } as const satisfies LearnerGoal.CommandV2
      const invocation = yield* seedAgentInvocation(db, "ask", command, 3_000)
      yield* db.transaction((tx) =>
        LearningCommand.reserveLearnerGoalsV2(tx, {
          ...invocation,
          settlement: { time: 3_001, order: 1 },
        }),
      )
      const requestID = PermissionV1.ID.ascending()
      yield* db.transaction((tx) =>
        LearningCommand.issueLearnerGoalCapabilityPromptV2(tx, {
          partID: invocation.envelope.partID,
          requestID,
          policyBasis: { source: "test", rule: "ask" },
          shownScope: { goals: [{ operation: "create", outcome: "Prompted Goal" }] },
          time: 3_002,
          order: 2,
        }),
      )
      yield* db.transaction((tx) =>
        LearningCommand.settleLearnerGoalPromptV2(tx, {
          partID: invocation.envelope.partID,
          requestID,
          outcome: "prompted_allow",
          reply: { response: "allow", requestID },
          time: 3_003,
          order: 3,
        }),
      )
      expect(
        yield* db.transaction((tx) =>
          LearningCommand.settleLearnerGoalsV2(tx, {
            partID: invocation.envelope.partID,
            settlement: { time: 3_004, order: 4 },
          }),
        ),
      ).toMatchObject({ type: "settled", settlement: { outcome: "applied", schemaVersion: 2 } })
    }),
  )
})

function seedAgentInvocation(
  db: Database.Interface["db"],
  suffix: string,
  command: LearnerGoal.CommandV2,
  time: number,
  options: Readonly<{ timeZone?: string | null }> = {},
) {
  return Effect.gen(function* () {
    const sessionID = SessionSchema.ID.make(`ses_goal_v2_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_goal_v2_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_goal_v2_user_${suffix}`)
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_goal_v2_assistant_${suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_goal_v2_tool_${suffix}`)
    const callID = `call-goal-v2-${suffix}`
    const turnID = Turn.ID.create()
    const inputID = Turn.InputID.create()
    yield* db
      .insert(ProjectTable)
      .values({
        id: Project.ID.global,
        worktree: AbsolutePath.make("C:\\project"),
        sandboxes: [],
        time_created: time,
        time_updated: time,
      })
      .onConflictDoNothing()
      .run()
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: sessionID,
        directory: "C:\\project",
        title: suffix,
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
        data: userData(time),
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
        data: { type: "text", text: `Goal ${suffix}` } as (typeof PartTable.$inferInsert)["data"],
        time_created: time,
        time_updated: time,
      })
      .run()
    const occurrence = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const admitted = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive({
            timeZone: options.timeZone === undefined ? "Asia/Shanghai" : options.timeZone,
          }),
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
          envelope: { command },
          policyBasis: { source: "learner-goal-agent-v2-test" },
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
            data: assistantData(userMessageID, time + 1),
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
              state: { status: "pending", input: command, raw: JSON.stringify(command) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: time + 1,
            time_updated: time + 1,
          })
          .run()
        yield* TurnLifecycle.admitModel(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          requestEnvelope: { command },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`context:${suffix}`).digest("hex"),
          snapshotFrontier: { sequence: 0, time: 0 },
          timeAdmitted: time + 1,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          candidates: [
            {
              partID,
              callID,
              tool: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              envelope: { command },
            },
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
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID, frontier: yield* LearningFrontier.read(tx) })
      }),
    )
    return {
      envelope: {
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
        capabilityVersion: LearningCommand.UPDATE_LEARNER_GOALS_VERSION,
        authorizationBasis: "agent_action" as const,
        timeAdmitted: time + 1,
      },
      command,
    } satisfies LearnerGoal.AgentInvocationV2
  }).pipe(Effect.orDie)
}

function userData(time: number): Omit<SessionV1.User, "id" | "sessionID"> {
  return { role: "user", time: { created: time }, agent: "repa", model }
}

function assistantData(parentID: SessionV1.MessageID, time: number): Omit<SessionV1.Assistant, "id" | "sessionID"> {
  return {
    role: "assistant",
    time: { created: time },
    parentID,
    modelID: model.modelID,
    providerID: model.providerID,
    mode: "repa",
    agent: "repa",
    path: { cwd: "C:\\project", root: "C:\\project" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}
