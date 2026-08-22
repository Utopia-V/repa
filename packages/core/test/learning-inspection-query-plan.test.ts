import { describe, expect, test } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LearningInspection } from "@opencode-ai/core/learning-inspection"
import { Occurrence } from "@opencode-ai/core/learning-command/occurrence"
import { LearnerAdmission } from "@opencode-ai/core/learning-command/occurrence-schema"
import { ProjectV2 } from "@opencode-ai/core/project"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { TurnLearningContext } from "@opencode-ai/core/turn/learning-context"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { admitModelWithLearningContext } from "./fixture/model-admission"

describe("Gate 22 inspection production query plans", () => {
  test("uses the real migrated schema, production query builders, and production continuation beyond 64 roots", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        const sessionID = SessionSchema.ID.make("ses_gate22_query_plan_000000")
        yield* db.run(sql`
          INSERT OR IGNORE INTO project (id, worktree, time_created, time_updated, sandboxes)
          VALUES (${ProjectV2.ID.global}, '/', 1, 1, '[]')
        `)
        yield* db.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES (${sessionID}, ${ProjectV2.ID.global}, 'gate22-query-plan', '/', 'Gate 22 query plan', 'test', 1, 1)
        `)
        for (let index = 0; index < 66; index++) {
          const time = index * 10 + 10
          const turnID = Turn.ID.make(`trn_gate22_query_${index.toString().padStart(10, "0")}`)
          const inputID = Turn.InputID.make(`tri_query_${index}`)
          const messageID = SessionV1.MessageID.make(`msg_query_${index}`)
          const partID = SessionV1.PartID.make(`prt_query_${index}`)
          const assistantMessageID = SessionV1.MessageID.make(`msg_query_assistant_${index}`)
          yield* db.run(sql`
            INSERT INTO message (id, session_id, time_created, time_updated, data)
            VALUES (${messageID}, ${sessionID}, ${time}, ${time}, ${JSON.stringify({
              role: "user",
              time: { created: time },
              agent: "repa",
              model: { providerID: "test", modelID: "test" },
            })})
          `)
          yield* db.run(sql`
            INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
            VALUES (${partID}, ${messageID}, ${sessionID}, ${time}, ${time}, ${JSON.stringify({ type: "text", text: `query ${index}` })})
          `)
          const occurrence = yield* db.transaction((tx) =>
            Occurrence.admit(tx, {
              admission: LearnerAdmission.interactive({}),
              sessionID,
              messageID,
              timeAdmitted: time,
            }),
          )
          yield* db.transaction((tx) =>
            TurnLifecycle.admit(tx, {
              kind: "learner",
              turnID,
              sessionID,
              inputID,
              messageID,
              occurrenceID: occurrence.id,
              limits: { model: 0, tool: 0 },
              envelope: { index },
              policyBasis: { source: "query-plan-test" },
              timeAdmitted: time,
            }),
          )
          yield* db.run(sql`
            INSERT INTO message (id, session_id, time_created, time_updated, data)
            VALUES (${assistantMessageID}, ${sessionID}, ${time + 1}, ${time + 1}, ${JSON.stringify({
              role: "assistant",
              parentID: messageID,
              time: { created: time + 1 },
            })})
          `)
          yield* db.transaction((tx) =>
            admitModelWithLearningContext(tx, {
              turnID,
              sessionID,
              assistantMessageID,
              requestEnvelope: { index },
              contextFingerprint: "b".repeat(64),
              snapshotFrontier: { sequence: 0, time: 0 },
              timeAdmitted: time + 1,
            }),
          )
        }
        const first = yield* db.transaction((tx) => TurnLearningContext.listTerminalRoots(tx, { limit: 64 }))
        expect(first.items).toHaveLength(64)
        expect(first.omitted).toBeTrue()
        expect(first.next).toBeDefined()
        const second = yield* db.transaction((tx) =>
          TurnLearningContext.listTerminalRoots(tx, { limit: 64, after: first.next! }),
        )
        expect(second.items).toHaveLength(2)
        expect(new Set([...first.items, ...second.items].map((item) => item.turnID)).size).toBe(66)

        const plans = yield* db.transaction((tx) => {
          const record = {
            ownerKind: "learner_goal" as const,
            recordID: "gol_plan",
            revisionID: "glr_plan",
            revisionVersion: 1,
          }
          const live = LearningInspection.liveLineageQuerySet(tx, { records: [record], limit: 16 })
          const roots = TurnLearningContext.terminalRootQuerySet(tx, {
            limit: 64,
            after: { timeTerminal: 50, turnID: Turn.ID.make("trn_gate22_query_0000000050") },
          })
          const audit = LearningInspection.deletionAuditRecordQuery(tx, { records: [record], limit: 16 })
          const range = TurnLearningContext.exactRangePageQuerySet(tx, {
            sessionID,
            turnID: Turn.ID.make("trn_gate22_query_0000000000"),
            messageCount: 300,
            partCount: 0,
            offset: 250,
            maxItems: 1,
          })
          expect(range).toMatchObject({
            messageOffset: 250,
            messageTake: 1,
            messageWindowOffset: 248,
            messageWindowTake: 8,
          })
          expect(
            TurnLearningContext.exactRangeDatabaseRowsUpperBound({
              messageCount: 300,
              partCount: 0,
              messageRows: range.messageWindowTake,
              partRows: 0,
            }),
          ).toBe(3618)
          return Effect.all([
            Effect.forEach(
              [live.context, live.relations, live.finiteScope, roots.live, roots.unavailable, audit],
              (query) => tx.all<{ detail: string }>(sql.raw(`EXPLAIN QUERY PLAN ${bind(query.toSQL())}`)),
            ),
            Effect.all([
              tx.all<{ detail: string }>(sql`EXPLAIN QUERY PLAN ${range.messages}`),
              tx.all<{ detail: string }>(sql`EXPLAIN QUERY PLAN ${range.parts}`),
            ]),
          ]).pipe(Effect.map((groups) => groups.flat()))
        })
        const detail = plans.flat().map((item) => item.detail)
        for (const index of [
          "turn_terminal_root_discovery_idx",
          "turn_unavailable_root_discovery_idx",
          "turn_lineage_context_relation_record_idx",
          "turn_lineage_record_relation_record_idx",
          "session_deletion_audit_record_lookup_idx",
          "sqlite_autoindex_turn_input_2",
          "sqlite_autoindex_turn_model_operation_3",
          "sqlite_autoindex_message_1",
          "part_message_id_id_idx",
        ]) {
          expect(
            detail.some((item) => item.includes(index)),
            `${index}: ${detail.join(" | ")}`,
          ).toBeTrue()
        }
        expect(detail.some((item) => item.includes("CORRELATED"))).toBeFalse()
        expect(detail.some((item) => item.includes("message_session_time_created_id_idx"))).toBeFalse()
        expect(detail.some((item) => item.includes("part_session_idx"))).toBeFalse()
      }).pipe(Effect.provide(Database.layerFromPath(":memory:")), Effect.scoped),
    )
  })
})

function bind(query: { sql: string; params: unknown[] }) {
  let index = 0
  const value = query.sql.replace(/\?/g, () => literal(query.params[index++]))
  if (index !== query.params.length) throw new Error("Production query parameter binding was incomplete")
  return value
}

function literal(value: unknown) {
  if (value === null) return "NULL"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`
  throw new Error(`Unsupported EXPLAIN parameter ${String(value)}`)
}
