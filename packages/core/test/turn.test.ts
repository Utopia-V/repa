import { describe, expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { CourseSchema } from "@opencode-ai/core/course/schema"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Occurrence } from "@opencode-ai/core/learning-command/occurrence"
import { LearnerAdmission } from "@opencode-ai/core/learning-command/occurrence-schema"
import {
  ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
  removeOccurrencePresentation,
} from "@opencode-ai/core/learning-command/settlement"
import { ProjectV2 } from "@opencode-ai/core/project"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { DatabaseMigration } from "@opencode-ai/core/database/migration"
import { Turn } from "@opencode-ai/schema/turn"
import { DateTime, Effect, Exit } from "effect"
import { sql } from "drizzle-orm"
import type { SqlClient as SqlClientService } from "effect/unstable/sql/SqlClient"

const makeDb = EffectDrizzleSqlite.makeWithDefaults()
type TestDatabase = Effect.Success<typeof makeDb>

const run = <A, E>(effect: Effect.Effect<A, E, SqlClientService>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Effect.scoped),
  )

describe("TurnLifecycle", () => {
  test("admits one root Turn atomically and exact-replays its complete envelope", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 2, tool: 1 }, time: 10 })

        const replay = yield* db.transaction((tx) => TurnLifecycle.admit(tx, root.admission))
        expect(replay.replay).toBe(true)
        expect(replay.turn).toEqual(root.admitted.turn)
        expect(replay.turn.limits).toEqual({ model: 2, tool: 1 })
        expect(yield* db.transaction((tx) => TurnLifecycle.list(tx, root.sessionID))).toEqual([root.admitted.turn])

        const conflict = yield* Effect.flip(
          db.transaction((tx) => TurnLifecycle.admit(tx, { ...root.admission, limits: { model: 3, tool: 1 } })),
        )
        expect(conflict).toMatchObject({ _tag: "TurnAdmissionConflictError", turnID: root.turnID })
        expect(yield* db.get(sql`SELECT model_count, tool_count, state FROM turn WHERE id = ${root.turnID}`)).toEqual({
          model_count: 0,
          tool_count: 0,
          state: "running",
        })
      }),
    )
  })

  test("exact-replays model, tool, and terminal results without duplicating counted work", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 2, tool: 1 }, time: 10 })
        const firstMessageID = yield* addAssistantMessage(db, root.sessionID, root.messageID, 11)
        const firstRequest = {
          turnID: root.turnID,
          sessionID: root.sessionID,
          assistantMessageID: firstMessageID,
          requestEnvelope: { prompt: "same text" },
          contextFingerprint: fingerprint("exact-replay-context"),
          snapshotFrontier: { sequence: 0, time: 0 },
          timeAdmitted: 11,
        }
        const first = yield* db.transaction((tx) => TurnLifecycle.admitModel(tx, firstRequest))
        const firstReplay = yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, { ...firstRequest, timeAdmitted: 999 }),
        )
        expect(first).toMatchObject({ type: "admitted", replay: false, operation: { ordinal: 0 } })
        expect(firstReplay).toEqual({ ...first, replay: true })
        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              TurnLifecycle.admitModel(tx, {
                ...firstRequest,
                requestEnvelope: { prompt: "changed text" },
              }),
            ),
          ),
        ).toMatchObject({ _tag: "TurnAdmissionConflictError", turnID: root.turnID })

        const [candidate] = yield* addToolCandidates(db, root.sessionID, firstMessageID, ["A"], 12)
        if (!candidate) throw new Error("Expected Tool candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID: firstMessageID,
            candidates: [candidate],
            timeSealed: 12,
          }),
        )
        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              TurnLifecycle.sealCandidateSet(tx, {
                turnID: root.turnID,
                sessionID: root.sessionID,
                assistantMessageID: firstMessageID,
                candidates: [{ ...candidate, envelope: { ...candidate.envelope, changed: true } }],
                timeSealed: 500,
              }),
            ),
          ),
        ).toMatchObject({ _tag: "TurnAdmissionConflictError", turnID: root.turnID })
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: root.turnID,
            assistantMessageID: firstMessageID,
            state: "completed",
            time: 13,
          }),
        )
        const tool = yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID: firstMessageID,
            partID: candidate.partID,
            timeAdmitted: 14,
          }),
        )
        const toolReplay = yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID: firstMessageID,
            partID: candidate.partID,
            timeAdmitted: 999,
          }),
        )
        expect(tool).toMatchObject({ type: "admitted", replay: false, invocation: { ordinal: 0 } })
        expect(toolReplay).toEqual({ ...tool, replay: true })
        const settledTool = yield* db.transaction((tx) =>
          TurnLifecycle.settleTool(tx, {
            turnID: root.turnID,
            partID: candidate.partID,
            state: "completed",
            time: 15,
          }),
        )
        expect(
          yield* db.transaction((tx) =>
            TurnLifecycle.settleTool(tx, {
              turnID: root.turnID,
              partID: candidate.partID,
              state: "completed",
              time: 999,
            }),
          ),
        ).toEqual(settledTool)
        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              TurnLifecycle.settleTool(tx, {
                turnID: root.turnID,
                partID: candidate.partID,
                state: "failed",
                time: 999,
              }),
            ),
          ),
        ).toMatchObject({ _tag: "TurnIntegrityError", turnID: root.turnID })

        const secondMessageID = yield* addAssistantMessage(db, root.sessionID, root.messageID, 16)
        const second = yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            ...firstRequest,
            assistantMessageID: secondMessageID,
            timeAdmitted: 16,
          }),
        )
        expect(second).toMatchObject({ type: "admitted", replay: false, operation: { ordinal: 1 } })
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID: secondMessageID,
            candidates: [],
            timeSealed: 17,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: root.turnID,
            assistantMessageID: secondMessageID,
            state: "completed",
            time: 18,
          }),
        )
        expect(yield* db.transaction((tx) => TurnLifecycle.info(tx, root.turnID))).toMatchObject({
          limits: { model: 2, tool: 1 },
          counters: { model: 2, tool: 1 },
        })

        const rejectedMessageID = SessionV1.MessageID.ascending()
        const rejectedRequest = {
          ...firstRequest,
          assistantMessageID: rejectedMessageID,
          timeAdmitted: 19,
        }
        const exhausted = yield* db.transaction((tx) => TurnLifecycle.admitModel(tx, rejectedRequest))
        const exhaustedReplay = yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, { ...rejectedRequest, timeAdmitted: 999 }),
        )
        expect(exhausted).toMatchObject({
          type: "exhausted",
          replay: false,
          turn: {
            counters: { model: 2, tool: 1 },
            terminal: { exhaustion: { counter: "model", observed: 2, limit: 2, rejectedAttemptID: rejectedMessageID } },
          },
        })
        expect(exhaustedReplay).toEqual({ ...exhausted, replay: true })
        expect(
          yield* db.all(sql`SELECT assistant_message_id FROM turn_model_operation WHERE turn_id = ${root.turnID}`),
        ).toHaveLength(2)

        const terminalRoot = yield* createRoot(db, { limits: { model: 1, tool: 0 }, time: 30 })
        const terminalMessageID = yield* addAssistantMessage(db, terminalRoot.sessionID, terminalRoot.messageID, 31)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: terminalRoot.turnID,
            sessionID: terminalRoot.sessionID,
            assistantMessageID: terminalMessageID,
            requestEnvelope: { prompt: "finish" },
            contextFingerprint: fingerprint("terminal-replay-context"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 31,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: terminalRoot.turnID,
            sessionID: terminalRoot.sessionID,
            assistantMessageID: terminalMessageID,
            candidates: [],
            timeSealed: 32,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: terminalRoot.turnID,
            assistantMessageID: terminalMessageID,
            state: "completed",
            time: 33,
          }),
        )
        const terminal = yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: terminalRoot.turnID,
            outcome: "completed",
            reason: "normal",
            time: 34,
          }),
        )
        expect(
          yield* db.transaction((tx) =>
            TurnLifecycle.settle(tx, {
              turnID: terminalRoot.turnID,
              outcome: "completed",
              reason: "normal",
              time: 999,
            }),
          ),
        ).toEqual(terminal)
        expect(
          yield* db.transaction((tx) =>
            TurnLifecycle.settle(tx, {
              turnID: terminalRoot.turnID,
              outcome: "failed",
              reason: "provider_failure",
              time: 999,
            }),
          ),
        ).toEqual(terminal)
      }),
    )
  })

  test("freezes a model operation to one promoted learner occurrence", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 2, tool: 0 }, time: 10 })
        const steer = yield* addLearnerInput(db, root.sessionID, 20)

        yield* db.transaction((tx) =>
          TurnLifecycle.promoteSteer(tx, {
            sessionID: root.sessionID,
            expectedTurnID: root.turnID,
            inputID: steer.inputID,
            messageID: steer.messageID,
            occurrenceID: steer.occurrenceID,
            envelope: steer.envelope,
            timeAdmitted: 20,
          }),
        )

        const assistantMessageID = yield* addAssistantMessage(db, root.sessionID, steer.messageID, 21)
        const operation = yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            requestEnvelope: { prompt: "after steer" },
            contextFingerprint: fingerprint("steer-context"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 21,
          }),
        )

        expect(operation).toMatchObject({
          type: "admitted",
          replay: false,
          operation: {
            inputID: steer.inputID,
            causalOccurrenceID: steer.occurrenceID,
            ordinal: 0,
          },
        })
      }),
    )
  })

  test("authorizes a learning registration only through its exact model occurrence and admitted candidate", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 10 })
        const later = yield* addLearnerInput(db, root.sessionID, 11)
        const assistantMessageID = yield* addAssistantMessage(db, root.sessionID, root.messageID, 12)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            requestEnvelope: { prompt: "root occurrence A" },
            contextFingerprint: fingerprint("learning-registration"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 12,
          }),
        )
        const candidates = yield* addToolCandidates(db, root.sessionID, assistantMessageID, ["A"], 13)
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            candidates,
            timeSealed: 13,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: root.turnID,
            assistantMessageID,
            state: "completed",
            time: 14,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            partID: candidates[0]!.partID,
            timeAdmitted: 15,
          }),
        )
        const registration = {
          turnID: root.turnID,
          inputID: root.inputID,
          causalOccurrenceID: root.occurrenceID,
          partID: candidates[0]!.partID,
          callID: candidates[0]!.callID,
          emissionOrdinal: 0,
          sessionID: root.sessionID,
          assistantMessageID,
          capabilityIdentity: candidates[0]!.tool,
        }

        expect(
          yield* db.transaction((tx) => TurnLifecycle.validateLearningCommandRegistration(tx, registration)),
        ).toEqual({ modelTimeAdmitted: 12, candidateTimeRegistered: 13, toolTimeAdmitted: 15 })
        yield* db.transaction((tx) =>
          TurnLifecycle.promoteSteer(tx, {
            sessionID: root.sessionID,
            expectedTurnID: root.turnID,
            inputID: later.inputID,
            messageID: later.messageID,
            occurrenceID: later.occurrenceID,
            envelope: later.envelope,
            timeAdmitted: 16,
          }),
        )
        const modelIdentity = yield* db.get(sql`
          SELECT input_id, causal_occurrence_id, ordinal, request_fingerprint, context_fingerprint
          FROM turn_model_operation WHERE assistant_message_id = ${assistantMessageID}
        `)
        const candidateIdentity = yield* db.get(sql`
          SELECT call_id, tool, emission_ordinal, envelope_fingerprint
          FROM turn_tool_candidate WHERE part_id = ${candidates[0]!.partID}
        `)
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_input
              SET occurrence_id = ${later.occurrenceID}, ordinal = 2
              WHERE id = ${root.inputID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_model_operation
              SET input_id = ${later.inputID}, causal_occurrence_id = ${later.occurrenceID}, ordinal = 1,
                  request_fingerprint = ${fingerprint("rewritten-request")},
                  context_fingerprint = ${fingerprint("rewritten-context")},
                  snapshot_frontier_sequence = 1, snapshot_frontier_time = 1,
                  observed_shared_frontier_sequence = 1, observed_shared_frontier_time = 1
              WHERE assistant_message_id = ${assistantMessageID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_tool_candidate
              SET call_id = 'retargeted-call', tool = 'write', emission_ordinal = 1,
                  envelope_fingerprint = ${fingerprint("rewritten-candidate")}, time_registered = 14
              WHERE part_id = ${candidates[0]!.partID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_tool_invocation SET ordinal = 1
              WHERE part_id = ${candidates[0]!.partID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        const rewrittenTurnID = Turn.ID.create()
        const rewrittenSessionID = SessionSchema.ID.create()
        yield* db.run("PRAGMA foreign_keys = OFF")
        const ownerRewrites = yield* Effect.all([
          Effect.exit(
            db.run(sql`
              UPDATE turn_model_operation
              SET turn_id = ${rewrittenTurnID}, session_id = ${rewrittenSessionID}
              WHERE assistant_message_id = ${assistantMessageID}
            `),
          ),
          Effect.exit(
            db.run(sql`
              UPDATE turn_tool_candidate
              SET turn_id = ${rewrittenTurnID}, session_id = ${rewrittenSessionID}
              WHERE part_id = ${candidates[0]!.partID}
            `),
          ),
          Effect.exit(
            db.run(sql`
              UPDATE turn_tool_invocation
              SET turn_id = ${rewrittenTurnID}, session_id = ${rewrittenSessionID}
              WHERE part_id = ${candidates[0]!.partID}
            `),
          ),
        ])
        yield* db.run("PRAGMA foreign_keys = ON")
        expect(ownerRewrites.every(Exit.isFailure)).toBe(true)
        expect(
          yield* db.get(sql`
            SELECT input_id, causal_occurrence_id, ordinal, request_fingerprint, context_fingerprint
            FROM turn_model_operation WHERE assistant_message_id = ${assistantMessageID}
          `),
        ).toEqual(modelIdentity)
        expect(
          yield* db.get(sql`
            SELECT call_id, tool, emission_ordinal, envelope_fingerprint
            FROM turn_tool_candidate WHERE part_id = ${candidates[0]!.partID}
          `),
        ).toEqual(candidateIdentity)
        expect(
          yield* db.get(sql`SELECT ordinal FROM turn_tool_invocation WHERE part_id = ${candidates[0]!.partID}`),
        ).toEqual({ ordinal: 0 })
        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              TurnLifecycle.validateLearningCommandRegistration(tx, {
                ...registration,
                causalOccurrenceID: later.occurrenceID,
              }),
            ),
          ),
        ).toMatchObject({ _tag: "TurnIntegrityError", turnID: root.turnID })
        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              TurnLifecycle.validateLearningCommandRegistration(tx, {
                ...registration,
                causalOccurrenceID: undefined,
              }),
            ),
          ),
        ).toMatchObject({ _tag: "TurnIntegrityError", reason: expect.stringContaining("no runtime-bound") })
        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              TurnLifecycle.validateLearningCommandRegistration(tx, { ...registration, callID: "tampered" }),
            ),
          ),
        ).toMatchObject({ _tag: "TurnIntegrityError", reason: expect.stringContaining("candidate") })
      }),
    )
  })

  test("carries the parent model occurrence into an exact child learning registration", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const parent = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 10 })
        const later = yield* addLearnerInput(db, parent.sessionID, 11)
        const parentAssistantMessageID = yield* addAssistantMessage(db, parent.sessionID, parent.messageID, 12)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: parent.turnID,
            sessionID: parent.sessionID,
            assistantMessageID: parentAssistantMessageID,
            requestEnvelope: { prompt: "delegate under occurrence A" },
            contextFingerprint: fingerprint("parent-learning-delegation"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 12,
          }),
        )
        const [task] = yield* addToolCandidates(db, parent.sessionID, parentAssistantMessageID, ["task"], 13)
        if (!task) throw new Error("Expected parent Task candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: parent.turnID,
            sessionID: parent.sessionID,
            assistantMessageID: parentAssistantMessageID,
            candidates: [task],
            timeSealed: 13,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: parent.turnID,
            assistantMessageID: parentAssistantMessageID,
            state: "completed",
            time: 14,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: parent.turnID,
            sessionID: parent.sessionID,
            assistantMessageID: parentAssistantMessageID,
            partID: task.partID,
            timeAdmitted: 15,
          }),
        )

        const childSessionID = SessionSchema.ID.create()
        const childTurnID = Turn.ID.create()
        const childInputID = Turn.InputID.create()
        const childMessageID = SessionV1.MessageID.ascending()
        const childMessagePartID = SessionV1.PartID.ascending()
        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.run(sql`
              INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
              VALUES (${childSessionID}, ${ProjectV2.ID.global}, ${parent.sessionID}, 'child-learning-command', '/', 'Child learning command', 'test', 16, 16)
            `)
            yield* insertUserMessage(tx, childSessionID, childMessageID, childMessagePartID, 16)
            yield* TurnLifecycle.admit(tx, {
              kind: "delegated_task",
              turnID: childTurnID,
              sessionID: childSessionID,
              inputID: childInputID,
              messageID: childMessageID,
              limits: { model: 1, tool: 1 },
              envelope: { kind: "delegated_task", requestedOutput: "apply the learner-authorized write" },
              policyBasis: { source: "child-learning-registration-test" },
              delegatedCapability: { tools: [ACCEPT_COURSE_VIEW_REVISION_CAPABILITY] },
              parentTurnID: parent.turnID,
              parentTaskPartID: task.partID,
              parentModelMessageID: parentAssistantMessageID,
              depthLimit: 1,
              timeAdmitted: 16,
            })
          }),
        )

        const childAssistantMessageID = yield* addAssistantMessage(db, childSessionID, childMessageID, 17)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: childTurnID,
            sessionID: childSessionID,
            assistantMessageID: childAssistantMessageID,
            requestEnvelope: { prompt: "child write" },
            contextFingerprint: fingerprint("child-learning-command"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 17,
          }),
        )
        const [command] = yield* addToolCandidates(
          db,
          childSessionID,
          childAssistantMessageID,
          [ACCEPT_COURSE_VIEW_REVISION_CAPABILITY],
          18,
        )
        if (!command) throw new Error("Expected child learning-command candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: childTurnID,
            sessionID: childSessionID,
            assistantMessageID: childAssistantMessageID,
            candidates: [command],
            timeSealed: 18,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: childTurnID,
            assistantMessageID: childAssistantMessageID,
            state: "completed",
            time: 19,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: childTurnID,
            sessionID: childSessionID,
            assistantMessageID: childAssistantMessageID,
            partID: command.partID,
            timeAdmitted: 20,
          }),
        )
        const registration = {
          turnID: childTurnID,
          inputID: childInputID,
          causalOccurrenceID: parent.occurrenceID,
          partID: command.partID,
          callID: command.callID,
          emissionOrdinal: 0,
          sessionID: childSessionID,
          assistantMessageID: childAssistantMessageID,
          capabilityIdentity: command.tool,
        }

        expect(
          yield* db.transaction((tx) => TurnLifecycle.validateLearningCommandRegistration(tx, registration)),
        ).toEqual({ modelTimeAdmitted: 17, candidateTimeRegistered: 18, toolTimeAdmitted: 20 })
        expect(yield* db.transaction((tx) => TurnLifecycle.info(tx, parent.turnID))).toMatchObject({
          counters: { model: 1, tool: 1 },
          depth: 0,
        })
        expect(yield* db.transaction((tx) => TurnLifecycle.info(tx, childTurnID))).toMatchObject({
          counters: { model: 1, tool: 1 },
          depth: 1,
        })
        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              TurnLifecycle.validateLearningCommandRegistration(tx, {
                ...registration,
                causalOccurrenceID: later.occurrenceID,
              }),
            ),
          ),
        ).toMatchObject({ _tag: "TurnIntegrityError", turnID: childTurnID })
      }),
    )
  })

  test("seals all sibling candidates before FIFO execution and terminalizes A/B/C exactly once", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 10 })
        const assistantMessageID = yield* addAssistantMessage(db, root.sessionID, root.messageID, 11)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            requestEnvelope: { prompt: "tools" },
            contextFingerprint: fingerprint("tool-context"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 11,
          }),
        )
        const candidates = yield* addToolCandidates(db, root.sessionID, assistantMessageID, ["A", "B", "C"], 12)
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            candidates,
            timeSealed: 12,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: root.turnID,
            assistantMessageID,
            state: "completed",
            time: 13,
          }),
        )

        const first = yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            partID: candidates[0]!.partID,
            timeAdmitted: 14,
          }),
        )
        expect(first).toMatchObject({ type: "admitted", replay: false, invocation: { ordinal: 0 } })
        yield* db.transaction((tx) =>
          TurnLifecycle.settleTool(tx, {
            turnID: root.turnID,
            partID: candidates[0]!.partID,
            state: "completed",
            time: 15,
          }),
        )

        const exhausted = yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            partID: candidates[1]!.partID,
            timeAdmitted: 16,
          }),
        )
        expect(exhausted).toMatchObject({
          type: "not_started",
          replay: false,
          candidate: { state: "not_started_limit" },
          turn: {
            state: "exhausted",
            terminal: {
              reason: "tool_limit",
              exhaustion: { rejectedAttemptID: candidates[1]!.partID, observed: 1, limit: 1 },
            },
          },
        })
        expect(yield* db.all(sql`SELECT part_id, state FROM turn_tool_candidate ORDER BY emission_ordinal`)).toEqual([
          { part_id: candidates[0]!.partID, state: "admitted" },
          { part_id: candidates[1]!.partID, state: "not_started_limit" },
          { part_id: candidates[2]!.partID, state: "not_started_turn_exhausted" },
        ])
        expect(yield* db.all(sql`SELECT part_id FROM turn_tool_invocation ORDER BY ordinal`)).toEqual([
          { part_id: candidates[0]!.partID },
        ])

        const triggerReplay = yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            partID: candidates[1]!.partID,
            timeAdmitted: 100,
          }),
        )
        const siblingReplay = yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            partID: candidates[2]!.partID,
            timeAdmitted: 100,
          }),
        )
        expect(triggerReplay).toMatchObject({
          type: "not_started",
          replay: true,
          candidate: { state: "not_started_limit" },
        })
        expect(siblingReplay).toMatchObject({
          type: "not_started",
          replay: true,
          candidate: { state: "not_started_turn_exhausted" },
        })
      }),
    )
  })

  test("redacts removed transcript content while retaining terminal Turn and Tool identity", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 1, tool: 0 }, time: 10 })
        const assistantMessageID = yield* addAssistantMessage(db, root.sessionID, root.messageID, 11)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            requestEnvelope: { prompt: "remove me" },
            contextFingerprint: fingerprint("redaction-context"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 11,
          }),
        )
        const [candidate] = yield* addToolCandidates(db, root.sessionID, assistantMessageID, ["secret"], 12)
        if (!candidate) throw new Error("Expected Tool candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            candidates: [candidate],
            timeSealed: 12,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: root.turnID,
            assistantMessageID,
            state: "completed",
            time: 13,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            partID: candidate.partID,
            timeAdmitted: 14,
          }),
        )

        yield* Effect.flip(
          db.transaction((tx) =>
            Effect.gen(function* () {
              yield* TurnLifecycle.prepareTranscriptRemoval(tx, {
                sessionID: root.sessionID,
                messageIDs: [root.messageID],
                partIDs: [candidate.partID],
                timeRemoved: 20,
              })
              return yield* Effect.fail("injected_failure" as const)
            }),
          ),
        )
        expect(
          yield* db.get(sql`
            SELECT normalized_envelope AS envelope
            FROM turn WHERE id = ${root.turnID}
          `),
        ).not.toEqual({ envelope: "{}" })
        expect(yield* db.all(sql`SELECT turn_id FROM turn_transcript_redaction`)).toEqual([])
        expect(yield* db.all(sql`SELECT part_id FROM turn_candidate_redaction`)).toEqual([])

        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* TurnLifecycle.prepareTranscriptRemoval(tx, {
              sessionID: root.sessionID,
              messageIDs: [root.messageID],
              partIDs: [candidate.partID],
              timeRemoved: 20,
            })
            yield* tx.run(sql`DELETE FROM message WHERE id = ${root.messageID}`)
            yield* tx.run(sql`DELETE FROM part WHERE id = ${candidate.partID}`)
          }),
        )

        expect(
          yield* db.get(sql`
            SELECT state, model_count, tool_count, normalized_envelope AS envelope
            FROM turn WHERE id = ${root.turnID}
          `),
        ).toEqual({ state: "exhausted", model_count: 1, tool_count: 0, envelope: "{}" })
        expect(
          yield* db.get(sql`
            SELECT state, call_id, tool, normalized_envelope AS envelope
            FROM turn_tool_candidate WHERE part_id = ${candidate.partID}
          `),
        ).toEqual({ state: "not_started_limit", call_id: candidate.callID, tool: candidate.tool, envelope: "{}" })
        expect(yield* db.get(sql`SELECT reason FROM turn_transcript_redaction WHERE turn_id = ${root.turnID}`)).toEqual(
          {
            reason: "presentation_removed",
          },
        )
        expect(
          yield* db.get(sql`SELECT reason FROM turn_candidate_redaction WHERE part_id = ${candidate.partID}`),
        ).toEqual({
          reason: "presentation_removed",
        })
        expect(
          yield* db.get(sql`SELECT input_id FROM turn_input_presentation WHERE input_id = ${root.inputID}`),
        ).toBeUndefined()
        expect(
          yield* db.get(sql`SELECT part_id FROM turn_candidate_presentation WHERE part_id = ${candidate.partID}`),
        ).toBeUndefined()

        expect(yield* Effect.flip(db.transaction((tx) => TurnLifecycle.admit(tx, root.admission)))).toMatchObject({
          _tag: "TurnSourceUnavailableError",
          turnID: root.turnID,
        })
        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              TurnLifecycle.admitTool(tx, {
                turnID: root.turnID,
                sessionID: root.sessionID,
                assistantMessageID,
                partID: candidate.partID,
                timeAdmitted: 30,
              }),
            ),
          ),
        ).toMatchObject({ _tag: "TurnSourceUnavailableError", turnID: root.turnID })
      }),
    )
  })

  test("serializes concurrent first shared-frontier transitions without a replace path", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const transitions = yield* Effect.all(
          [
            db.transaction((tx) => LearningFrontier.advance(tx, { time: 100 })),
            db.transaction((tx) => LearningFrontier.advance(tx, { time: 200 })),
          ],
          { concurrency: "unbounded" },
        )
        expect(transitions.map((item) => item.sequence).sort((a, b) => a - b)).toEqual([1, 2])
        expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual({ sequence: 2, time: 200 })
      }),
    )
  })

  test("floors cross-Session work to the latest committed shared-state frontier", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const first = yield* createRoot(db, { limits: { model: 0, tool: 0 }, time: 100 })
        yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: first.turnID,
            outcome: "interrupted",
            reason: "learner_interrupt",
            time: 101,
          }),
        )
        const frontier = yield* db.transaction((tx) => LearningFrontier.advance(tx, { time: 1_000 }))
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE learning_shared_frontier
              SET sequence = 0, time_committed = 0
              WHERE singleton = 1
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(yield* Effect.flip(db.run(sql`DELETE FROM learning_shared_frontier WHERE singleton = 1`))).toMatchObject(
          { _tag: "EffectDrizzleQueryError" },
        )
        expect(
          yield* Effect.flip(
            db.run(sql`
              INSERT OR REPLACE INTO learning_shared_frontier (singleton, sequence, time_committed)
              VALUES (1, 1, 0)
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(frontier)

        const second = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 900 })
        expect(DateTime.toEpochMillis(second.admitted.turn.timeAdmitted)).toBe(1_000)
        const assistantMessageID = yield* addAssistantMessage(db, second.sessionID, second.messageID, 901)
        expect(
          yield* Effect.flip(
            db.run(sql`
              INSERT INTO turn_model_operation (
                assistant_message_id, turn_id, session_id, input_id, causal_occurrence_id, ordinal, state,
                request_fingerprint, context_fingerprint, snapshot_frontier_sequence, snapshot_frontier_time,
                observed_shared_frontier_sequence, observed_shared_frontier_time, time_admitted,
                candidates_sealed, candidate_count, time_candidates_sealed
              ) VALUES (
                ${assistantMessageID}, ${second.turnID}, ${second.sessionID}, ${second.inputID},
                ${second.occurrenceID}, 0, 'running', ${fingerprint("stale-frontier-request")},
                ${fingerprint("stale-frontier-context")}, 0, 0, 0, 0, 1000, 0, NULL, NULL
              )
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        const admitted = yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: second.turnID,
            sessionID: second.sessionID,
            assistantMessageID,
            requestEnvelope: { prompt: "regressed clock" },
            contextFingerprint: fingerprint("regressed-context"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 900,
          }),
        )
        expect(admitted.type).toBe("admitted")
        if (admitted.type !== "admitted") throw new Error("Expected model admission")
        expect(admitted.operation.observedSharedFrontier.sequence).toBe(frontier.sequence)
        expect(DateTime.toEpochMillis(admitted.operation.observedSharedFrontier.time)).toBe(frontier.time)
        expect(DateTime.toEpochMillis(admitted.operation.timeAdmitted)).toBe(1_000)

        const [candidate] = yield* addToolCandidates(db, second.sessionID, assistantMessageID, ["A"], 902)
        if (!candidate) throw new Error("Expected Tool candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: second.turnID,
            sessionID: second.sessionID,
            assistantMessageID,
            candidates: [candidate],
            timeSealed: 902,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: second.turnID,
            assistantMessageID,
            state: "completed",
            time: 903,
          }),
        )
        expect(
          yield* Effect.flip(
            db.run(sql`
              INSERT INTO turn_tool_invocation (
                part_id, turn_id, session_id, assistant_message_id, ordinal, state,
                observed_shared_frontier_sequence, observed_shared_frontier_time,
                consumed_shared_frontier_sequence, consumed_shared_frontier_time,
                resulting_shared_frontier_sequence, resulting_shared_frontier_time,
                time_admitted, time_settled
              ) VALUES (
                ${candidate.partID}, ${second.turnID}, ${second.sessionID}, ${assistantMessageID}, 0, 'running',
                ${frontier.sequence}, ${frontier.time}, ${frontier.sequence}, ${frontier.time},
                ${frontier.sequence}, ${frontier.time}, ${frontier.time}, NULL
              )
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              INSERT INTO turn_tool_invocation (
                part_id, turn_id, session_id, assistant_message_id, ordinal, state,
                observed_shared_frontier_sequence, observed_shared_frontier_time,
                consumed_shared_frontier_sequence, consumed_shared_frontier_time,
                resulting_shared_frontier_sequence, resulting_shared_frontier_time,
                time_admitted, time_settled
              ) VALUES (
                ${candidate.partID}, ${second.turnID}, ${second.sessionID}, ${assistantMessageID}, 0, 'running',
                0, 0, 0, 0, NULL, NULL, ${frontier.time}, NULL
              )
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        const tool = yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: second.turnID,
            sessionID: second.sessionID,
            assistantMessageID,
            partID: candidate.partID,
            timeAdmitted: 904,
          }),
        )
        expect(tool).toMatchObject({ type: "admitted" })
        if (tool.type !== "admitted") throw new Error("Expected Tool admission")
        expect(tool.invocation.observedSharedFrontier.sequence).toBe(frontier.sequence)
        expect(DateTime.toEpochMillis(tool.invocation.observedSharedFrontier.time)).toBe(frontier.time)
        expect(tool.invocation.consumedSharedFrontier.sequence).toBe(frontier.sequence)
        expect(DateTime.toEpochMillis(tool.invocation.consumedSharedFrontier.time)).toBe(frontier.time)

        const third = yield* createRoot(db, { limits: { model: 0, tool: 0 }, time: 950 })
        yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: third.turnID,
            outcome: "interrupted",
            reason: "learner_interrupt",
            time: 951,
          }),
        )
        const laterFrontier = yield* db.transaction((tx) => LearningFrontier.advance(tx, { time: 1_200 }))
        const consumed = yield* db.transaction((tx) =>
          TurnLifecycle.consumeToolFrontier(tx, { partID: candidate.partID, frontier: laterFrontier }),
        )
        expect(consumed?.consumedSharedFrontier.sequence).toBe(laterFrontier.sequence)
        expect(consumed && DateTime.toEpochMillis(consumed.consumedSharedFrontier.time)).toBe(laterFrontier.time)
        expect(consumed && DateTime.toEpochMillis(consumed.timeAdmitted)).toBe(1_200)

        const staleReplay = yield* db.transaction((tx) =>
          TurnLifecycle.consumeToolFrontier(tx, { partID: candidate.partID, frontier }),
        )
        expect(staleReplay).toEqual(consumed)
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_tool_invocation
              SET consumed_shared_frontier_sequence = ${frontier.sequence},
                  consumed_shared_frontier_time = ${frontier.time},
                  time_admitted = ${frontier.time}
              WHERE part_id = ${candidate.partID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* db.get(sql`
            SELECT consumed_shared_frontier_sequence AS sequence,
                   consumed_shared_frontier_time AS time,
                   time_admitted AS admitted
            FROM turn_tool_invocation WHERE part_id = ${candidate.partID}
          `),
        ).toEqual({ sequence: laterFrontier.sequence, time: laterFrontier.time, admitted: laterFrontier.time })
      }),
    )
  })

  test("startup recovery settles every orphan once without replaying admitted work", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const providerOrphan = yield* createRoot(db, { limits: { model: 1, tool: 0 }, time: 10 })
        const providerMessageID = yield* addAssistantMessage(db, providerOrphan.sessionID, providerOrphan.messageID, 11)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: providerOrphan.turnID,
            sessionID: providerOrphan.sessionID,
            assistantMessageID: providerMessageID,
            requestEnvelope: { prompt: "provider orphan" },
            contextFingerprint: fingerprint("provider-orphan"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 11,
          }),
        )

        const toolOrphan = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 20 })
        const toolMessageID = yield* addAssistantMessage(db, toolOrphan.sessionID, toolOrphan.messageID, 21)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: toolOrphan.turnID,
            sessionID: toolOrphan.sessionID,
            assistantMessageID: toolMessageID,
            requestEnvelope: { prompt: "tool orphan" },
            contextFingerprint: fingerprint("tool-orphan"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 21,
          }),
        )
        const [candidate] = yield* addToolCandidates(db, toolOrphan.sessionID, toolMessageID, ["A"], 22)
        if (!candidate) throw new Error("Expected Tool candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: toolOrphan.turnID,
            sessionID: toolOrphan.sessionID,
            assistantMessageID: toolMessageID,
            candidates: [candidate],
            timeSealed: 22,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: toolOrphan.turnID,
            assistantMessageID: toolMessageID,
            state: "completed",
            time: 23,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: toolOrphan.turnID,
            sessionID: toolOrphan.sessionID,
            assistantMessageID: toolMessageID,
            partID: candidate.partID,
            timeAdmitted: 24,
          }),
        )
        const frontier = yield* db.transaction((tx) => LearningFrontier.advance(tx, { time: 1_200 }))
        yield* db.transaction((tx) =>
          TurnLifecycle.recordToolResultingFrontier(tx, { partID: candidate.partID, frontier }),
        )
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_tool_invocation
              SET resulting_shared_frontier_sequence = NULL, resulting_shared_frontier_time = NULL
              WHERE part_id = ${candidate.partID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* db.get(sql`
            SELECT resulting_shared_frontier_sequence AS sequence, resulting_shared_frontier_time AS time
            FROM turn_tool_invocation WHERE part_id = ${candidate.partID}
          `),
        ).toEqual(frontier)

        const recovered = yield* db.transaction((tx) => TurnLifecycle.recoverRunning(tx, 900))
        expect(recovered.map((turn) => turn.id)).toEqual([providerOrphan.turnID, toolOrphan.turnID])
        expect(
          yield* db.all(sql`
            SELECT id, state, terminal_reason, time_terminal
            FROM turn ORDER BY time_admitted, id
          `),
        ).toEqual([
          {
            id: providerOrphan.turnID,
            state: "interrupted",
            terminal_reason: "startup_recovery",
            time_terminal: 1_200,
          },
          { id: toolOrphan.turnID, state: "interrupted", terminal_reason: "startup_recovery", time_terminal: 1_200 },
        ])
        expect(
          yield* db.get(sql`
            SELECT state, candidates_sealed, candidate_count, time_candidates_sealed
            FROM turn_model_operation WHERE assistant_message_id = ${providerMessageID}
          `),
        ).toEqual({ state: "interrupted", candidates_sealed: 1, candidate_count: 0, time_candidates_sealed: 1_200 })
        expect(
          yield* db.get(sql`SELECT state, time_settled FROM turn_tool_invocation WHERE part_id = ${candidate.partID}`),
        ).toEqual({
          state: "interrupted",
          time_settled: 1_200,
        })
        expect(yield* db.transaction((tx) => TurnLifecycle.recoverRunning(tx, 2_000))).toEqual([])
        expect(yield* db.get(sql`SELECT time_terminal FROM turn WHERE id = ${providerOrphan.turnID}`)).toEqual({
          time_terminal: 1_200,
        })
      }),
    )
  })

  test("retains only a typed unavailable receipt while a fork clone survives and collects it with the final clone", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const source = yield* createRoot(db, { limits: { model: 0, tool: 0 }, time: 10 })
        yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: source.turnID,
            outcome: "interrupted",
            reason: "learner_interrupt",
            time: 11,
          }),
        )
        const target = yield* createRoot(db, { limits: { model: 0, tool: 0 }, time: 20 })
        yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: target.turnID,
            outcome: "interrupted",
            reason: "learner_interrupt",
            time: 21,
          }),
        )
        const cloneMessageID = SessionV1.MessageID.ascending()
        const clonePartID = SessionV1.PartID.ascending()
        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* insertUserMessage(tx, target.sessionID, cloneMessageID, clonePartID, 22)
            yield* Occurrence.copyPresentation(tx, {
              sourceMessageID: source.messageID,
              sessionID: target.sessionID,
              messageID: cloneMessageID,
              provenance: "fork_clone",
            })
            yield* TurnLifecycle.recordHistoricalInputPresentation(tx, {
              sessionID: target.sessionID,
              messageID: cloneMessageID,
              sourceSessionID: source.sessionID,
              sourceTurnID: source.turnID,
              sourceInputID: source.inputID,
              occurrenceID: source.occurrenceID,
              timeCreated: 22,
            })
          }),
        )

        yield* db.transaction((tx) =>
          TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: source.sessionID,
            sessionIDs: [source.sessionID],
            timeDeleted: 30,
          }),
        )
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = ${source.sessionID}`)).toBeUndefined()
        expect(yield* db.get(sql`SELECT id FROM message WHERE id = ${cloneMessageID}`)).toEqual({ id: cloneMessageID })
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, source.turnID))).toMatchObject({
          type: "source_unavailable",
          source: {
            turnID: source.turnID,
            sessionID: source.sessionID,
            admissionKind: "learner",
            outcome: "interrupted",
            causalOccurrenceID: source.occurrenceID,
          },
          models: [],
          tools: [],
        })
        const replay = yield* Effect.flip(db.transaction((tx) => TurnLifecycle.admit(tx, source.admission)))
        expect(replay).toMatchObject({
          _tag: "TurnSourceUnavailableError",
          turnID: source.turnID,
          receipt: {
            source: {
              turnID: source.turnID,
              sessionID: source.sessionID,
              outcome: "interrupted",
            },
            models: [],
            tools: [],
          },
        })
        expect(yield* Effect.flip(db.transaction((tx) => TurnLifecycle.info(tx, source.turnID)))).toMatchObject({
          _tag: "TurnSourceUnavailableError",
          receipt: { source: { turnID: source.turnID, sessionID: source.sessionID } },
        })

        const secondTarget = yield* createRoot(db, { limits: { model: 0, tool: 0 }, time: 35 })
        yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: secondTarget.turnID,
            outcome: "interrupted",
            reason: "learner_interrupt",
            time: 36,
          }),
        )
        const secondCloneMessageID = SessionV1.MessageID.ascending()
        const secondClonePartID = SessionV1.PartID.ascending()
        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* insertUserMessage(tx, secondTarget.sessionID, secondCloneMessageID, secondClonePartID, 37)
            yield* Occurrence.copyPresentation(tx, {
              sourceMessageID: cloneMessageID,
              sessionID: secondTarget.sessionID,
              messageID: secondCloneMessageID,
              provenance: "fork_clone",
            })
            yield* TurnLifecycle.copyHistoricalInputPresentation(tx, {
              sessionID: secondTarget.sessionID,
              messageID: secondCloneMessageID,
              sourceSessionID: target.sessionID,
              sourceMessageID: cloneMessageID,
              timeCreated: 37,
            })
          }),
        )

        yield* db.transaction((tx) =>
          TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: target.sessionID,
            sessionIDs: [target.sessionID],
            timeDeleted: 40,
          }),
        )
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, source.turnID))).toMatchObject({
          type: "source_unavailable",
          source: { turnID: source.turnID },
        })
        expect(yield* db.get(sql`SELECT id FROM message WHERE id = ${secondCloneMessageID}`)).toEqual({
          id: secondCloneMessageID,
        })

        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* TurnLifecycle.prepareTranscriptRemoval(tx, {
              sessionID: secondTarget.sessionID,
              messageIDs: [secondCloneMessageID],
              partIDs: [],
              timeRemoved: 50,
            })
            yield* removeOccurrencePresentation(tx, { messageID: secondCloneMessageID, timeDeleted: 50 })
            yield* tx.run(sql`DELETE FROM message WHERE id = ${secondCloneMessageID}`)
          }),
        )
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, source.turnID))).toEqual({ type: "missing" })
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = ${secondTarget.sessionID}`)).toEqual({
          id: secondTarget.sessionID,
        })
        expect(
          yield* db.get(sql`SELECT id FROM learning_admitted_occurrence WHERE id = ${source.occurrenceID}`),
        ).toBeUndefined()
      }),
    )
  })

  test("freezes historical and unavailable source mappings until their final presentation owner disappears", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const source = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 10 })
        const sourceAssistantMessageID = yield* addAssistantMessage(db, source.sessionID, source.messageID, 11)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: source.turnID,
            sessionID: source.sessionID,
            assistantMessageID: sourceAssistantMessageID,
            requestEnvelope: { prompt: "historical source" },
            contextFingerprint: fingerprint("historical-source-context"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 11,
          }),
        )
        const [sourceCandidate] = yield* addToolCandidates(db, source.sessionID, sourceAssistantMessageID, ["A"], 12)
        if (!sourceCandidate) throw new Error("Expected source Tool candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: source.turnID,
            sessionID: source.sessionID,
            assistantMessageID: sourceAssistantMessageID,
            candidates: [sourceCandidate],
            timeSealed: 12,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: source.turnID,
            assistantMessageID: sourceAssistantMessageID,
            state: "completed",
            time: 13,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: source.turnID,
            sessionID: source.sessionID,
            assistantMessageID: sourceAssistantMessageID,
            partID: sourceCandidate.partID,
            timeAdmitted: 14,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleTool(tx, {
            turnID: source.turnID,
            partID: sourceCandidate.partID,
            state: "completed",
            time: 15,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: source.turnID,
            outcome: "completed",
            reason: "normal",
            time: 16,
          }),
        )

        const target = yield* createRoot(db, { limits: { model: 0, tool: 0 }, time: 20 })
        yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: target.turnID,
            outcome: "interrupted",
            reason: "learner_interrupt",
            time: 21,
          }),
        )
        const cloneInputMessageID = SessionV1.MessageID.ascending()
        const cloneInputPartID = SessionV1.PartID.ascending()
        const cloneAssistantMessageID = SessionV1.MessageID.ascending()
        const cloneToolPartID = SessionV1.PartID.ascending()
        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* insertUserMessage(tx, target.sessionID, cloneInputMessageID, cloneInputPartID, 22)
            yield* Occurrence.copyPresentation(tx, {
              sourceMessageID: source.messageID,
              sessionID: target.sessionID,
              messageID: cloneInputMessageID,
              provenance: "fork_clone",
            })
            yield* TurnLifecycle.recordHistoricalInputPresentation(tx, {
              sessionID: target.sessionID,
              messageID: cloneInputMessageID,
              sourceSessionID: source.sessionID,
              sourceTurnID: source.turnID,
              sourceInputID: source.inputID,
              occurrenceID: source.occurrenceID,
              timeCreated: 22,
            })
            yield* tx.run(sql`
              INSERT INTO message (id, session_id, time_created, time_updated, data)
              VALUES (
                ${cloneAssistantMessageID}, ${target.sessionID}, 23, 23,
                ${JSON.stringify({ role: "assistant", parentID: cloneInputMessageID })}
              )
            `)
            yield* tx.run(sql`
              INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
              VALUES (
                ${cloneToolPartID}, ${cloneAssistantMessageID}, ${target.sessionID}, 23, 23,
                ${JSON.stringify({
                  type: "tool",
                  callID: sourceCandidate.callID,
                  tool: sourceCandidate.tool,
                  state: { status: "completed", input: { name: "A" }, output: "historical" },
                })}
              )
            `)
            yield* TurnLifecycle.recordHistoricalModelPresentation(tx, {
              sessionID: target.sessionID,
              assistantMessageID: cloneAssistantMessageID,
              sourceSessionID: source.sessionID,
              sourceTurnID: source.turnID,
              sourceAssistantMessageID,
              causalOccurrenceID: source.occurrenceID,
              timeCreated: 23,
            })
            yield* TurnLifecycle.recordHistoricalToolPresentation(tx, {
              sessionID: target.sessionID,
              assistantMessageID: cloneAssistantMessageID,
              partID: cloneToolPartID,
              sourceSessionID: source.sessionID,
              sourceTurnID: source.turnID,
              sourceAssistantMessageID,
              sourcePartID: sourceCandidate.partID,
              callID: sourceCandidate.callID,
              timeCreated: 23,
            })
          }),
        )

        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_historical_input_presentation
              SET source_turn_id = ${target.turnID}, source_input_id = ${target.inputID}
              WHERE message_id = ${cloneInputMessageID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_historical_model_presentation
              SET source_turn_id = ${target.turnID}, causal_occurrence_id = ${target.occurrenceID}
              WHERE assistant_message_id = ${cloneAssistantMessageID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_historical_tool_presentation
              SET source_turn_id = ${target.turnID}, call_id = 'retargeted-call'
              WHERE part_id = ${cloneToolPartID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })

        yield* db.transaction((tx) =>
          TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: source.sessionID,
            sessionIDs: [source.sessionID],
            timeDeleted: 30,
          }),
        )
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, source.turnID))).toMatchObject({
          type: "source_unavailable",
          source: { turnID: source.turnID, sessionID: source.sessionID, outcome: "completed" },
          models: [
            {
              turnID: source.turnID,
              assistantMessageID: sourceAssistantMessageID,
              causalOccurrenceID: source.occurrenceID,
            },
          ],
          tools: [
            {
              turnID: source.turnID,
              assistantMessageID: sourceAssistantMessageID,
              partID: sourceCandidate.partID,
              callID: sourceCandidate.callID,
            },
          ],
        })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_unavailable_source SET session_id = ${target.sessionID}
              WHERE turn_id = ${source.turnID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_unavailable_model SET assistant_message_id = ${cloneAssistantMessageID}
              WHERE turn_id = ${source.turnID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_unavailable_tool SET call_id = 'retargeted-call'
              WHERE turn_id = ${source.turnID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })

        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* TurnLifecycle.prepareTranscriptRemoval(tx, {
              sessionID: target.sessionID,
              messageIDs: [cloneInputMessageID, cloneAssistantMessageID],
              partIDs: [cloneToolPartID],
              timeRemoved: 40,
            })
            yield* removeOccurrencePresentation(tx, { messageID: cloneInputMessageID, timeDeleted: 40 })
            yield* tx.run(sql`DELETE FROM message WHERE id = ${cloneAssistantMessageID}`)
            yield* tx.run(sql`DELETE FROM message WHERE id = ${cloneInputMessageID}`)
          }),
        )
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, source.turnID))).toEqual({ type: "missing" })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_source`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_model`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_tool`)).toEqual({ count: 0 })
      }),
    )
  })

  test("keeps a bounded child-unavailable receipt while its parent result survives", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const parent = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 10 })
        const assistantMessageID = yield* addAssistantMessage(db, parent.sessionID, parent.messageID, 11)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: parent.turnID,
            sessionID: parent.sessionID,
            assistantMessageID,
            requestEnvelope: { prompt: "delegate" },
            contextFingerprint: fingerprint("parent-task-context"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 11,
          }),
        )
        const [task] = yield* addToolCandidates(db, parent.sessionID, assistantMessageID, ["task"], 12)
        if (!task) throw new Error("Expected Task candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: parent.turnID,
            sessionID: parent.sessionID,
            assistantMessageID,
            candidates: [task],
            timeSealed: 12,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: parent.turnID,
            assistantMessageID,
            state: "completed",
            time: 13,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: parent.turnID,
            sessionID: parent.sessionID,
            assistantMessageID,
            partID: task.partID,
            timeAdmitted: 14,
          }),
        )

        const childSessionID = SessionSchema.ID.create()
        const childTurnID = Turn.ID.create()
        const childInputID = Turn.InputID.create()
        const childMessageID = SessionV1.MessageID.ascending()
        const childPartID = SessionV1.PartID.ascending()
        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.run(sql`
              INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
              VALUES (${childSessionID}, ${ProjectV2.ID.global}, ${parent.sessionID}, 'child-turn-test', '/', 'Child Turn test', 'test', 15, 15)
            `)
            yield* insertUserMessage(tx, childSessionID, childMessageID, childPartID, 15)
            yield* TurnLifecycle.admit(tx, {
              kind: "delegated_task",
              turnID: childTurnID,
              sessionID: childSessionID,
              inputID: childInputID,
              messageID: childMessageID,
              limits: { model: 0, tool: 0 },
              envelope: { kind: "delegated_task", requestedOutput: "answer" },
              policyBasis: { source: "test" },
              delegatedCapability: { tools: ["read"] },
              parentTurnID: parent.turnID,
              parentTaskPartID: task.partID,
              parentModelMessageID: assistantMessageID,
              depthLimit: 1,
              timeAdmitted: 15,
            })
            yield* TurnLifecycle.settle(tx, {
              turnID: childTurnID,
              outcome: "interrupted",
              reason: "learner_interrupt",
              time: 16,
            })
            yield* TurnLifecycle.recordChildResult(tx, {
              parentTurnID: parent.turnID,
              parentSessionID: parent.sessionID,
              parentTaskPartID: task.partID,
              childTurnID,
              childSessionID,
              requestedOutput: {
                state: "incomplete",
                partial: { answer: "bounded" },
                reason: "learner_interrupt",
              },
              timeSettled: 17,
            })
            yield* TurnLifecycle.settleTool(tx, {
              turnID: parent.turnID,
              partID: task.partID,
              state: "completed",
              time: 18,
            })
            yield* TurnLifecycle.settle(tx, {
              turnID: parent.turnID,
              outcome: "completed",
              reason: "normal",
              time: 19,
            })
          }),
        )

        expect(yield* db.transaction((tx) => TurnLifecycle.info(tx, childTurnID))).toMatchObject({
          lineage: {
            parentTurnID: parent.turnID,
            parentTaskPartID: task.partID,
            delegatedCapability: { tools: ["read"] },
          },
        })
        expect(yield* db.transaction((tx) => TurnLifecycle.childResult(tx, task.partID))).toMatchObject({
          childTurnID,
          terminalOutcome: "interrupted",
          requestedOutput: {
            state: "incomplete",
            partial: { answer: "bounded" },
            reason: "learner_interrupt",
          },
        })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_child_lineage
              SET delegated_capability = ${JSON.stringify({ tools: ["write"] })}
              WHERE child_turn_id = ${childTurnID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_child_result
              SET child_session_id = ${parent.sessionID}, terminal_outcome = 'failed'
              WHERE child_turn_id = ${childTurnID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* db.get(sql`
            SELECT delegated_capability FROM turn_child_lineage WHERE child_turn_id = ${childTurnID}
          `),
        ).toEqual({ delegated_capability: JSON.stringify({ tools: ["read"] }) })
        expect(
          yield* db.get(sql`
            SELECT child_session_id, terminal_outcome FROM turn_child_result WHERE child_turn_id = ${childTurnID}
          `),
        ).toEqual({ child_session_id: childSessionID, terminal_outcome: "interrupted" })
        yield* db.transaction((tx) =>
          TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: childSessionID,
            sessionIDs: [childSessionID],
            timeDeleted: 20,
          }),
        )
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, childTurnID))).toMatchObject({
          type: "source_unavailable",
          source: {
            turnID: childTurnID,
            sessionID: childSessionID,
            admissionKind: "delegated_task",
            parentTurnID: parent.turnID,
            parentTaskPartID: task.partID,
            outcome: "interrupted",
          },
        })
        expect(
          yield* db.get(sql`SELECT requested_output FROM turn_child_result WHERE child_turn_id = ${childTurnID}`),
        ).toEqual({
          requested_output: '{"answer":"bounded"}',
        })

        yield* db.transaction((tx) =>
          TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: parent.sessionID,
            sessionIDs: [parent.sessionID],
            timeDeleted: 30,
          }),
        )
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, childTurnID))).toEqual({ type: "missing" })
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, parent.turnID))).toEqual({ type: "missing" })
        expect(
          yield* db.get(sql`SELECT child_turn_id FROM turn_child_result WHERE child_turn_id = ${childTurnID}`),
        ).toBeUndefined()
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_source`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_model`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_tool`)).toEqual({ count: 0 })
      }),
    )
  })

  test("rolls back parent and descendant deletion when storage fails after unavailable preparation", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const tree = yield* createCompletedParentChild(db, 10)
        const target = yield* createRoot(db, { limits: { model: 0, tool: 0 }, time: 30 })
        yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: target.turnID,
            outcome: "interrupted",
            reason: "learner_interrupt",
            time: 31,
          }),
        )
        const cloneMessageID = SessionV1.MessageID.ascending()
        const clonePartID = SessionV1.PartID.ascending()
        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* insertUserMessage(tx, target.sessionID, cloneMessageID, clonePartID, 32)
            yield* TurnLifecycle.recordHistoricalInputPresentation(tx, {
              sessionID: target.sessionID,
              messageID: cloneMessageID,
              sourceSessionID: tree.childSessionID,
              sourceTurnID: tree.childTurnID,
              sourceInputID: tree.childInputID,
              occurrenceID: tree.parent.occurrenceID,
              timeCreated: 32,
            })
          }),
        )
        yield* db.run(`
          CREATE TRIGGER gate12_test_fail_tree_delete
          BEFORE DELETE ON session
          WHEN OLD.id = '${tree.parent.sessionID}'
          BEGIN
            SELECT RAISE(ABORT, 'gate12_test_fail_tree_delete');
          END
        `)

        const deletion = yield* Effect.exit(
          db.transaction((tx) =>
            TurnLifecycle.deleteSessionTree(tx, {
              rootSessionID: tree.parent.sessionID,
              sessionIDs: [tree.parent.sessionID, tree.childSessionID],
              timeDeleted: 40,
            }),
          ),
        )
        expect(Exit.isFailure(deletion)).toBe(true)
        expect(
          yield* db.all(sql`
            SELECT id FROM session
            WHERE id IN (${tree.parent.sessionID}, ${tree.childSessionID})
            ORDER BY id
          `),
        ).toEqual([{ id: tree.parent.sessionID }, { id: tree.childSessionID }].sort((a, b) => a.id.localeCompare(b.id)))
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, tree.parent.turnID))).toMatchObject({
          type: "available",
          turn: { id: tree.parent.turnID, state: "completed" },
        })
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, tree.childTurnID))).toMatchObject({
          type: "available",
          turn: { id: tree.childTurnID, state: "interrupted" },
        })
        expect(
          yield* db.get(sql`
            SELECT child_turn_id, requested_output FROM turn_child_result
            WHERE child_turn_id = ${tree.childTurnID}
          `),
        ).toEqual({ child_turn_id: tree.childTurnID, requested_output: '{"answer":"bounded"}' })
        expect(
          yield* db.get(sql`
            SELECT source_turn_id, source_input_id FROM turn_historical_input_presentation
            WHERE message_id = ${cloneMessageID}
          `),
        ).toEqual({ source_turn_id: tree.childTurnID, source_input_id: tree.childInputID })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_source`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_model`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_tool`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM learning_occurrence_tombstone`)).toEqual({ count: 0 })
      }),
    )
  })

  test("retains exact Turn mappings for an applied learning receipt and collects them only after its owner disappears", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const course = yield* seedAcceptableCourseRevision(db, 5)
        const root = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 10 })
        const assistantMessageID = yield* addAssistantMessage(db, root.sessionID, root.messageID, 11)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            requestEnvelope: { prompt: "apply Course View revision" },
            contextFingerprint: fingerprint("applied-learning-receipt"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 11,
          }),
        )
        const [commandCandidate] = yield* addToolCandidates(
          db,
          root.sessionID,
          assistantMessageID,
          [ACCEPT_COURSE_VIEW_REVISION_CAPABILITY],
          12,
        )
        if (!commandCandidate) throw new Error("Expected learning-command candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            candidates: [commandCandidate],
            timeSealed: 12,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: root.turnID,
            assistantMessageID,
            state: "completed",
            time: 13,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            partID: commandCandidate.partID,
            timeAdmitted: 14,
          }),
        )
        const invocation = {
          envelope: {
            occurrenceID: root.occurrenceID,
            turnID: root.turnID,
            inputID: root.inputID,
            sessionID: root.sessionID,
            parentUserMessageID: root.messageID,
            assistantMessageID,
            partID: commandCandidate.partID,
            providerCallID: commandCandidate.callID,
            emissionOrdinal: 0,
            capabilityIdentity: ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
            capabilityVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
            authorizationBasis: "learner_acceptance" as const,
            timeAdmitted: 14,
          },
          command: {
            courseID: course.courseID,
            revisionID: course.revisionID,
            expectedCourseVersion: 0,
            expectedSelectionRevisionID: undefined,
            expectedSelectionVersion: 0,
            expectedViewVersion: 0,
            expectedRevisionVersion: 0,
          },
        }
        expect(yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, invocation))).toEqual({
          type: "candidate",
        })
        const applied = yield* db.transaction((tx) =>
          Effect.gen(function* () {
            const result = yield* LearningCommand.settleAcceptance(tx, {
              ...invocation,
              permission: { type: "allow" },
              settlement: { time: 20, order: 1 },
            })
            if (result.type !== "settled" || result.settlement.outcome !== "applied") {
              return yield* Effect.die("Expected an applied learning settlement")
            }
            yield* TurnLifecycle.recordToolResultingFrontier(tx, {
              partID: commandCandidate.partID,
              frontier: yield* LearningFrontier.read(tx),
            })
            return result.settlement
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleTool(tx, {
            turnID: root.turnID,
            partID: commandCandidate.partID,
            state: "completed",
            time: 21,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settle(tx, {
            turnID: root.turnID,
            outcome: "completed",
            reason: "normal",
            time: 22,
          }),
        )
        expect(
          yield* db.get(sql`
            SELECT revision_id, version FROM course_working_selection WHERE course_id = ${course.courseID}
          `),
        ).toEqual({ revision_id: course.revisionID, version: 1 })
        expect(
          yield* db.get(sql`
            SELECT status, effect_id, time_settled, settlement_order, turn_id, input_id
            FROM learning_command_invocation WHERE part_id = ${commandCandidate.partID}
          `),
        ).toMatchObject({
          status: "applied",
          effect_id: applied.effectID,
          time_settled: 20,
          settlement_order: 1,
          turn_id: root.turnID,
          input_id: root.inputID,
        })

        yield* db.transaction((tx) =>
          TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: root.sessionID,
            sessionIDs: [root.sessionID],
            timeDeleted: 30,
          }),
        )
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = ${root.sessionID}`)).toBeUndefined()
        expect(
          yield* db.get(sql`
            SELECT revision_id, version FROM course_working_selection WHERE course_id = ${course.courseID}
          `),
        ).toEqual({ revision_id: course.revisionID, version: 1 })
        expect(
          yield* db.get(sql`
            SELECT status, effect_id, time_settled, settlement_order, turn_id, input_id
            FROM learning_command_invocation WHERE part_id = ${commandCandidate.partID}
          `),
        ).toMatchObject({
          status: "applied",
          effect_id: applied.effectID,
          time_settled: 20,
          settlement_order: 1,
          turn_id: root.turnID,
          input_id: root.inputID,
        })
        expect(
          yield* db.get(sql`
            SELECT id, effect_id, assistant_message_id, invocation_part_id
            FROM learning_command_receipt WHERE id = ${applied.receiptID}
          `),
        ).toEqual({
          id: applied.receiptID,
          effect_id: applied.effectID,
          assistant_message_id: assistantMessageID,
          invocation_part_id: commandCandidate.partID,
        })
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, root.turnID))).toMatchObject({
          type: "source_unavailable",
          source: { turnID: root.turnID, sessionID: root.sessionID, outcome: "completed" },
          models: [
            {
              turnID: root.turnID,
              assistantMessageID,
              causalOccurrenceID: root.occurrenceID,
            },
          ],
          tools: [
            {
              turnID: root.turnID,
              assistantMessageID,
              partID: commandCandidate.partID,
              callID: commandCandidate.callID,
            },
          ],
        })
        yield* db.transaction((tx) => TurnLifecycle.garbageCollectUnavailableSources(tx, [root.turnID]))
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, root.turnID))).toMatchObject({
          type: "source_unavailable",
          source: { turnID: root.turnID },
        })

        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            // This is not an ordinary Session lifecycle: it simulates retirement
            // of the final independently owned causal receipt and settlement.
            yield* tx.run(sql`DELETE FROM learning_command_receipt WHERE id = ${applied.receiptID}`)
            yield* tx.run(sql`DELETE FROM learning_command_invocation WHERE part_id = ${commandCandidate.partID}`)
            yield* TurnLifecycle.garbageCollectUnavailableSources(tx, [root.turnID])
          }),
        )
        expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, root.turnID))).toEqual({ type: "missing" })
        expect(
          yield* db.get(sql`
            SELECT id FROM course_selection_acceptance_effect WHERE id = ${applied.effectID}
          `),
        ).toEqual({ id: applied.effectID })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_source`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_model`)).toEqual({ count: 0 })
        expect(yield* db.get(sql`SELECT count(*) AS count FROM turn_unavailable_tool`)).toEqual({ count: 0 })
      }),
    )
  })

  test("refuses a Session-tree deletion while any selected Turn is running without partial mutation", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 0, tool: 0 }, time: 10 })
        const error = yield* Effect.flip(
          db.transaction((tx) =>
            TurnLifecycle.deleteSessionTree(tx, {
              rootSessionID: root.sessionID,
              sessionIDs: [root.sessionID],
              timeDeleted: 20,
            }),
          ),
        )
        expect(error).toMatchObject({
          _tag: "SessionTreeBusyError",
          sessionID: root.sessionID,
          activeTurnIDs: [root.turnID],
        })
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = ${root.sessionID}`)).toEqual({ id: root.sessionID })
        expect(yield* db.get(sql`SELECT state FROM turn WHERE id = ${root.turnID}`)).toEqual({ state: "running" })
      }),
    )
  })

  test("database constraints reject a model membership for a stale Turn input", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 2, tool: 0 }, time: 10 })
        const steer = yield* addLearnerInput(db, root.sessionID, 20)
        yield* db.transaction((tx) =>
          TurnLifecycle.promoteSteer(tx, {
            sessionID: root.sessionID,
            expectedTurnID: root.turnID,
            inputID: steer.inputID,
            messageID: steer.messageID,
            occurrenceID: steer.occurrenceID,
            envelope: steer.envelope,
            timeAdmitted: 20,
          }),
        )
        const assistantMessageID = yield* addAssistantMessage(db, root.sessionID, root.messageID, 21)

        const error = yield* Effect.flip(
          db.run(sql`
            INSERT INTO turn_model_operation (
              assistant_message_id, turn_id, session_id, input_id, causal_occurrence_id, ordinal, state,
              request_fingerprint, context_fingerprint, snapshot_frontier_sequence, snapshot_frontier_time,
              observed_shared_frontier_sequence, observed_shared_frontier_time, time_admitted,
              candidates_sealed, candidate_count, time_candidates_sealed
            ) VALUES (
              ${assistantMessageID}, ${root.turnID}, ${root.sessionID}, ${root.inputID}, ${root.occurrenceID}, 0, 'running',
              ${fingerprint("request")}, ${fingerprint("context")}, 0, 0, 0, 0, 21, 0, NULL, NULL
            )
          `),
        )
        expect(error).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(yield* db.all(sql`SELECT assistant_message_id FROM turn_model_operation`)).toEqual([])
      }),
    )
  })

  test("database constraints reject incomplete terminal and operation shapes under validation bypass", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 10 })

        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn
              SET state = 'failed', terminal_reason = 'owner_failure', time_terminal = NULL
              WHERE id = ${root.turnID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn
              SET state = 'exhausted', time_terminal = 10, terminal_reason = 'model_limit',
                  exhaustion_counter = 'model', exhaustion_observed = 0, exhaustion_limit = 1,
                  exhaustion_attempt_id = 'attempt', exhaustion_envelope = '{}',
                  exhaustion_envelope_fingerprint = NULL
              WHERE id = ${root.turnID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn
              SET state = 'exhausted', time_terminal = 10, terminal_reason = 'tool_limit',
                  exhaustion_counter = 'tool', exhaustion_observed = 0, exhaustion_limit = 1,
                  exhaustion_attempt_id = 'missing-candidate', exhaustion_envelope = '{}',
                  exhaustion_envelope_fingerprint = ${fingerprint("{}")}
              WHERE id = ${root.turnID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })

        const assistantMessageID = yield* addAssistantMessage(db, root.sessionID, root.messageID, 11)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            requestEnvelope: { prompt: "shape checks" },
            contextFingerprint: fingerprint("shape-check-context"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 11,
          }),
        )
        const [candidate] = yield* addToolCandidates(db, root.sessionID, assistantMessageID, ["A"], 12)
        if (!candidate) throw new Error("Expected Tool candidate")

        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_model_operation
              SET candidates_sealed = 1, candidate_count = NULL, time_candidates_sealed = NULL
              WHERE assistant_message_id = ${assistantMessageID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            candidates: [candidate],
            timeSealed: 12,
          }),
        )
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_model_operation
              SET state = 'completed', time_settled = NULL
              WHERE assistant_message_id = ${assistantMessageID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: root.turnID,
            assistantMessageID,
            state: "completed",
            time: 13,
          }),
        )

        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_tool_candidate
              SET state = 'not_started_failed', time_terminal = NULL
              WHERE part_id = ${candidate.partID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: root.turnID,
            sessionID: root.sessionID,
            assistantMessageID,
            partID: candidate.partID,
            timeAdmitted: 14,
          }),
        )
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn_tool_invocation
              SET state = 'completed', time_settled = NULL
              WHERE part_id = ${candidate.partID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(yield* db.get(sql`SELECT state FROM turn WHERE id = ${root.turnID}`)).toEqual({ state: "running" })
      }),
    )
  })

  test("database constraints reject delegated Turns with missing lineage or an invalid derived depth", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const parent = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time: 10 })
        const parentMessageID = yield* addAssistantMessage(db, parent.sessionID, parent.messageID, 11)
        yield* db.transaction((tx) =>
          TurnLifecycle.admitModel(tx, {
            turnID: parent.turnID,
            sessionID: parent.sessionID,
            assistantMessageID: parentMessageID,
            requestEnvelope: { prompt: "delegate" },
            contextFingerprint: fingerprint("invalid-child-context"),
            snapshotFrontier: { sequence: 0, time: 0 },
            timeAdmitted: 11,
          }),
        )
        const [task] = yield* addToolCandidates(db, parent.sessionID, parentMessageID, ["task"], 12)
        if (!task) throw new Error("Expected Task candidate")
        yield* db.transaction((tx) =>
          TurnLifecycle.sealCandidateSet(tx, {
            turnID: parent.turnID,
            sessionID: parent.sessionID,
            assistantMessageID: parentMessageID,
            candidates: [task],
            timeSealed: 12,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.settleModel(tx, {
            turnID: parent.turnID,
            assistantMessageID: parentMessageID,
            state: "completed",
            time: 13,
          }),
        )
        yield* db.transaction((tx) =>
          TurnLifecycle.admitTool(tx, {
            turnID: parent.turnID,
            sessionID: parent.sessionID,
            assistantMessageID: parentMessageID,
            partID: task.partID,
            timeAdmitted: 14,
          }),
        )

        const childSessionID = SessionSchema.ID.create()
        const childTurnID = Turn.ID.create()
        const childInputID = Turn.InputID.create()
        const childMessageID = SessionV1.MessageID.ascending()
        const childPartID = SessionV1.PartID.ascending()
        const childEnvelope = { kind: "delegated_task", requestedOutput: "answer" }
        yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.run(sql`
              INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
              VALUES (${childSessionID}, ${ProjectV2.ID.global}, ${parent.sessionID}, 'invalid-child', '/', 'Invalid child', 'test', 15, 15)
            `)
            yield* insertUserMessage(tx, childSessionID, childMessageID, childPartID, 15)
          }),
        )

        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              Effect.gen(function* () {
                yield* tx.run("PRAGMA defer_foreign_keys = ON")
                yield* tx.run(sql`
                  INSERT INTO turn_input (
                    id, turn_id, session_id, message_id, source, ordinal, occurrence_id,
                    parent_model_message_id, time_admitted, envelope_fingerprint
                  ) VALUES (
                    ${childInputID}, ${childTurnID}, ${childSessionID}, ${childMessageID}, 'delegated_task', 0,
                    ${parent.occurrenceID}, ${parentMessageID}, 15, ${fingerprint(JSON.stringify(childEnvelope))}
                  )
                `)
                yield* tx.run(sql`
                  INSERT INTO turn_input_presentation (input_id, message_id, session_id)
                  VALUES (${childInputID}, ${childMessageID}, ${childSessionID})
                `)
                yield* tx.run(sql`
                  INSERT INTO turn_child_lineage (
                    child_turn_id, child_session_id, child_depth, parent_turn_id, parent_session_id,
                    parent_depth, parent_task_part_id, parent_model_message_id, delegated_capability
                  ) VALUES (
                    ${childTurnID}, ${childSessionID}, 2, ${parent.turnID}, ${parent.sessionID}, 0,
                    ${task.partID}, ${parentMessageID}, ${JSON.stringify({ tools: ["read"] })}
                  )
                `)
              }),
            ),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })

        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              Effect.gen(function* () {
                yield* tx.run("PRAGMA defer_foreign_keys = ON")
                yield* tx.run(sql`
                  INSERT INTO turn_input (
                    id, turn_id, session_id, message_id, source, ordinal, occurrence_id,
                    parent_model_message_id, time_admitted, envelope_fingerprint
                  ) VALUES (
                    ${childInputID}, ${childTurnID}, ${childSessionID}, ${childMessageID}, 'delegated_task', 0,
                    ${parent.occurrenceID}, ${parentMessageID}, 15, ${fingerprint(JSON.stringify(childEnvelope))}
                  )
                `)
                yield* tx.run(sql`
                  INSERT INTO turn_input_presentation (input_id, message_id, session_id)
                  VALUES (${childInputID}, ${childMessageID}, ${childSessionID})
                `)
                yield* tx.run(sql`
                  INSERT INTO turn (
                    id, session_id, admission_kind, initial_input_id, current_input_id,
                    model_limit, tool_limit, model_count, tool_count, state, depth,
                    normalized_envelope, envelope_fingerprint, policy_basis, time_admitted, causal_time
                  ) VALUES (
                    ${childTurnID}, ${childSessionID}, 'delegated_task', ${childInputID}, ${childInputID},
                    1, 1, 0, 0, 'running', 1, ${JSON.stringify(childEnvelope)},
                    ${fingerprint(JSON.stringify(childEnvelope))}, '{}', 15, 15
                  )
                `)
              }),
            ),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(yield* db.get(sql`SELECT id FROM turn WHERE id = ${childTurnID}`)).toBeUndefined()
        expect(yield* db.get(sql`SELECT id FROM turn_input WHERE id = ${childInputID}`)).toBeUndefined()
        expect(
          yield* db.get(sql`SELECT child_turn_id FROM turn_child_lineage WHERE child_turn_id = ${childTurnID}`),
        ).toBeUndefined()
      }),
    )
  })

  test("database constraints reject concurrent roots, duplicate membership, lineage mutation, and time regression", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = yield* createRoot(db, { limits: { model: 2, tool: 0 }, time: 10 })
        const competing = yield* addLearnerInput(db, root.sessionID, 20)
        const competingTurnID = Turn.ID.create()

        expect(
          yield* Effect.flip(
            db.transaction((tx) =>
              Effect.gen(function* () {
                yield* tx.run("PRAGMA defer_foreign_keys = ON")
                yield* tx.run(sql`
                  INSERT INTO turn_input (
                    id, turn_id, session_id, message_id, source, ordinal, occurrence_id,
                    time_admitted, envelope_fingerprint
                  ) VALUES (
                    ${competing.inputID}, ${competingTurnID}, ${root.sessionID}, ${competing.messageID},
                    'learner_root', 0, ${competing.occurrenceID}, 20, ${fingerprint("competing-root")}
                  )
                `)
                yield* tx.run(sql`
                  INSERT INTO turn_input_presentation (input_id, message_id, session_id)
                  VALUES (${competing.inputID}, ${competing.messageID}, ${root.sessionID})
                `)
                yield* tx.run(sql`
                  INSERT INTO turn (
                    id, session_id, admission_kind, initial_input_id, current_input_id,
                    model_limit, tool_limit, model_count, tool_count, state, depth,
                    normalized_envelope, envelope_fingerprint, policy_basis, time_admitted, causal_time
                  ) VALUES (
                    ${competingTurnID}, ${root.sessionID}, 'learner', ${competing.inputID}, ${competing.inputID},
                    1, 0, 0, 0, 'running', 0, '{}', ${fingerprint("competing-root")}, '{}', 20, 20
                  )
                `)
              }),
            ),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(yield* db.get(sql`SELECT id FROM turn WHERE id = ${competingTurnID}`)).toBeUndefined()
        expect(yield* db.get(sql`SELECT id FROM turn_input WHERE id = ${competing.inputID}`)).toBeUndefined()

        const firstSteer = yield* addLearnerInput(db, root.sessionID, 30)
        yield* db.transaction((tx) =>
          TurnLifecycle.promoteSteer(tx, {
            sessionID: root.sessionID,
            expectedTurnID: root.turnID,
            inputID: firstSteer.inputID,
            messageID: firstSteer.messageID,
            occurrenceID: firstSteer.occurrenceID,
            envelope: firstSteer.envelope,
            timeAdmitted: 30,
          }),
        )
        const duplicate = yield* addLearnerInput(db, root.sessionID, 31)
        expect(
          yield* Effect.flip(
            db.run(sql`
              INSERT INTO turn_input (
                id, turn_id, session_id, message_id, source, ordinal, occurrence_id,
                time_admitted, envelope_fingerprint
              ) VALUES (
                ${duplicate.inputID}, ${root.turnID}, ${root.sessionID}, ${duplicate.messageID},
                'learner_steer', 1, ${duplicate.occurrenceID}, 31, ${fingerprint("duplicate-membership")}
              )
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(
            db.run(sql`
              UPDATE turn SET admission_kind = 'delegated_task', depth = 1 WHERE id = ${root.turnID}
            `),
          ),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* Effect.flip(db.run(sql`UPDATE turn SET causal_time = 20 WHERE id = ${root.turnID}`)),
        ).toMatchObject({ _tag: "EffectDrizzleQueryError" })
        expect(
          yield* db.get(sql`SELECT admission_kind, depth, causal_time FROM turn WHERE id = ${root.turnID}`),
        ).toEqual({
          admission_kind: "learner",
          depth: 0,
          causal_time: 30,
        })
      }),
    )
  })
})

function withDatabase(effect: (db: TestDatabase) => Effect.Effect<void, unknown>) {
  return run(
    Effect.gen(function* () {
      const db = yield* makeDb
      yield* db.run("PRAGMA foreign_keys = ON")
      yield* DatabaseMigration.apply(db)
      yield* db.run(sql`
        INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
        VALUES (${ProjectV2.ID.global}, '/', 1, 1, '[]')
      `)
      yield* effect(db)
    }),
  )
}

function createRoot(db: TestDatabase, input: { readonly limits: Turn.Limits; readonly time: number }) {
  return Effect.gen(function* () {
    const sessionID = SessionSchema.ID.create()
    const turnID = Turn.ID.create()
    const inputID = Turn.InputID.create()
    const messageID = SessionV1.MessageID.ascending()
    const partID = SessionV1.PartID.ascending()
    const envelope = { kind: "learner", sessionID, inputID, messageID, content: "hello" }

    const admitted = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES (${sessionID}, ${ProjectV2.ID.global}, 'turn-test', '/', 'Turn test', 'test', ${input.time}, ${input.time})
        `)
        yield* insertUserMessage(tx, sessionID, messageID, partID, input.time)
        const occurrence = yield* Occurrence.admit(tx, {
          admission: LearnerAdmission.interactive(),
          sessionID,
          messageID,
          timeAdmitted: input.time,
        })
        return {
          occurrence,
          admitted: yield* TurnLifecycle.admit(tx, {
            kind: "learner",
            turnID,
            sessionID,
            inputID,
            messageID,
            occurrenceID: occurrence.id,
            limits: input.limits,
            envelope,
            policyBasis: { source: "test" },
            timeAdmitted: input.time,
          }),
        }
      }),
    )

    return {
      sessionID,
      turnID,
      inputID,
      messageID,
      occurrenceID: admitted.occurrence.id,
      envelope,
      admission: {
        kind: "learner" as const,
        turnID,
        sessionID,
        inputID,
        messageID,
        occurrenceID: admitted.occurrence.id,
        limits: input.limits,
        envelope,
        policyBasis: { source: "test" },
        timeAdmitted: input.time,
      },
      admitted: admitted.admitted,
    }
  })
}

function addLearnerInput(db: TestDatabase, sessionID: SessionSchema.ID, time: number) {
  return Effect.gen(function* () {
    const inputID = Turn.InputID.create()
    const messageID = SessionV1.MessageID.ascending()
    const partID = SessionV1.PartID.ascending()
    const envelope = { kind: "steer", sessionID, inputID, messageID, content: "steer" }
    const occurrenceID = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* insertUserMessage(tx, sessionID, messageID, partID, time)
        return (yield* Occurrence.admit(tx, {
          admission: LearnerAdmission.interactive(),
          sessionID,
          messageID,
          timeAdmitted: time,
        })).id
      }),
    )
    return { inputID, messageID, occurrenceID, envelope }
  })
}

function insertUserMessage(
  tx: Parameters<Parameters<TestDatabase["transaction"]>[0]>[0],
  sessionID: SessionSchema.ID,
  messageID: SessionV1.MessageID,
  partID: SessionV1.PartID,
  time: number,
) {
  return Effect.gen(function* () {
    yield* tx.run(sql`
      INSERT INTO message (id, session_id, time_created, time_updated, data)
      VALUES (${messageID}, ${sessionID}, ${time}, ${time}, ${JSON.stringify({ role: "user" })})
    `)
    yield* tx.run(sql`
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
      VALUES (${partID}, ${messageID}, ${sessionID}, ${time}, ${time}, ${JSON.stringify({ type: "text", text: "hello" })})
    `)
  })
}

function addAssistantMessage(
  db: TestDatabase,
  sessionID: SessionSchema.ID,
  parentID: SessionV1.MessageID,
  time: number,
) {
  return Effect.gen(function* () {
    const messageID = SessionV1.MessageID.ascending()
    yield* db.run(sql`
      INSERT INTO message (id, session_id, time_created, time_updated, data)
      VALUES (${messageID}, ${sessionID}, ${time}, ${time}, ${JSON.stringify({ role: "assistant", parentID })})
    `)
    return messageID
  })
}

function addToolCandidates(
  db: TestDatabase,
  sessionID: SessionSchema.ID,
  assistantMessageID: SessionV1.MessageID,
  names: readonly string[],
  time: number,
) {
  return Effect.forEach(names, (name) =>
    Effect.gen(function* () {
      const partID = SessionV1.PartID.ascending()
      const callID = `call-${name}`
      const tool =
        name === "A" ? "read" : name === "task" || name === ACCEPT_COURSE_VIEW_REVISION_CAPABILITY ? name : "write"
      const envelope = { callID, tool, input: { name } }
      yield* db.run(sql`
        INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
        VALUES (
          ${partID}, ${assistantMessageID}, ${sessionID}, ${time}, ${time},
          ${JSON.stringify({ type: "tool", callID, tool, state: { status: "pending", input: { name }, raw: "" } })}
        )
      `)
      return { partID, callID, tool, envelope }
    }),
  )
}

function seedAcceptableCourseRevision(db: TestDatabase, time: number) {
  return Effect.gen(function* () {
    const courseID = CourseSchema.createCourseID()
    const viewID = CourseSchema.createViewID()
    const revisionID = CourseSchema.createRevisionID()
    const itemID = CourseSchema.createItemID()
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.run(sql`
          INSERT INTO course (id, title, state_version, withdrawal_reason, time_created, time_updated)
          VALUES (${courseID}, 'Gate 12 Course', 0, NULL, ${time}, ${time})
        `)
        yield* tx.run(sql`
          INSERT INTO course_view (id, course_id, name, state_version, withdrawal_reason, time_created, time_updated)
          VALUES (${viewID}, ${courseID}, 'Main', 0, NULL, ${time}, ${time})
        `)
        yield* tx.run(sql`
          INSERT INTO course_item (id, course_id, time_created)
          VALUES (${itemID}, ${courseID}, ${time})
        `)
        yield* tx.run(sql`
          INSERT INTO course_view_revision (
            id, course_id, view_id, revision_number, predecessor_revision_id, authorship_basis, time_created
          ) VALUES (${revisionID}, ${courseID}, ${viewID}, 1, NULL, 'tutor_proposed', ${time})
        `)
        yield* tx.run(sql`
          INSERT INTO course_view_revision_state (
            course_id, view_id, revision_id, state_version, withdrawal_reason, time_updated
          ) VALUES (${courseID}, ${viewID}, ${revisionID}, 0, NULL, ${time})
        `)
        yield* tx.run(sql`
          INSERT INTO course_view_revision_item (
            course_id, view_id, revision_id, item_id, parent_item_id, title, preorder_position, depth
          ) VALUES (${courseID}, ${viewID}, ${revisionID}, ${itemID}, NULL, 'Root', 0, 0)
        `)
        yield* tx.run(sql`
          INSERT INTO course_working_selection (course_id, revision_id, version, time_updated)
          VALUES (${courseID}, NULL, 0, ${time})
        `)
      }),
    )
    return { courseID, viewID, revisionID, itemID }
  })
}

function createCompletedParentChild(db: TestDatabase, time: number) {
  return Effect.gen(function* () {
    const parent = yield* createRoot(db, { limits: { model: 1, tool: 1 }, time })
    const parentAssistantMessageID = yield* addAssistantMessage(db, parent.sessionID, parent.messageID, time + 1)
    yield* db.transaction((tx) =>
      TurnLifecycle.admitModel(tx, {
        turnID: parent.turnID,
        sessionID: parent.sessionID,
        assistantMessageID: parentAssistantMessageID,
        requestEnvelope: { prompt: "delegate" },
        contextFingerprint: fingerprint("completed-parent-child"),
        snapshotFrontier: { sequence: 0, time: 0 },
        timeAdmitted: time + 1,
      }),
    )
    const [task] = yield* addToolCandidates(db, parent.sessionID, parentAssistantMessageID, ["task"], time + 2)
    if (!task) throw new Error("Expected Task candidate")
    yield* db.transaction((tx) =>
      TurnLifecycle.sealCandidateSet(tx, {
        turnID: parent.turnID,
        sessionID: parent.sessionID,
        assistantMessageID: parentAssistantMessageID,
        candidates: [task],
        timeSealed: time + 2,
      }),
    )
    yield* db.transaction((tx) =>
      TurnLifecycle.settleModel(tx, {
        turnID: parent.turnID,
        assistantMessageID: parentAssistantMessageID,
        state: "completed",
        time: time + 3,
      }),
    )
    yield* db.transaction((tx) =>
      TurnLifecycle.admitTool(tx, {
        turnID: parent.turnID,
        sessionID: parent.sessionID,
        assistantMessageID: parentAssistantMessageID,
        partID: task.partID,
        timeAdmitted: time + 4,
      }),
    )
    const childSessionID = SessionSchema.ID.create()
    const childTurnID = Turn.ID.create()
    const childInputID = Turn.InputID.create()
    const childMessageID = SessionV1.MessageID.ascending()
    const childPartID = SessionV1.PartID.ascending()
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.run(sql`
          INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
          VALUES (
            ${childSessionID}, ${ProjectV2.ID.global}, ${parent.sessionID}, 'completed-child', '/',
            'Completed child', 'test', ${time + 5}, ${time + 5}
          )
        `)
        yield* insertUserMessage(tx, childSessionID, childMessageID, childPartID, time + 5)
        yield* TurnLifecycle.admit(tx, {
          kind: "delegated_task",
          turnID: childTurnID,
          sessionID: childSessionID,
          inputID: childInputID,
          messageID: childMessageID,
          limits: { model: 0, tool: 0 },
          envelope: { kind: "delegated_task", requestedOutput: "answer" },
          policyBasis: { source: "test" },
          delegatedCapability: { tools: ["read"] },
          parentTurnID: parent.turnID,
          parentTaskPartID: task.partID,
          parentModelMessageID: parentAssistantMessageID,
          depthLimit: 1,
          timeAdmitted: time + 5,
        })
        yield* TurnLifecycle.settle(tx, {
          turnID: childTurnID,
          outcome: "interrupted",
          reason: "learner_interrupt",
          time: time + 6,
        })
        yield* TurnLifecycle.recordChildResult(tx, {
          parentTurnID: parent.turnID,
          parentSessionID: parent.sessionID,
          parentTaskPartID: task.partID,
          childTurnID,
          childSessionID,
          requestedOutput: {
            state: "incomplete",
            partial: { answer: "bounded" },
            reason: "learner_interrupt",
          },
          timeSettled: time + 7,
        })
        yield* TurnLifecycle.settleTool(tx, {
          turnID: parent.turnID,
          partID: task.partID,
          state: "completed",
          time: time + 8,
        })
        yield* TurnLifecycle.settle(tx, {
          turnID: parent.turnID,
          outcome: "completed",
          reason: "normal",
          time: time + 9,
        })
      }),
    )
    return { parent, parentAssistantMessageID, task, childSessionID, childTurnID, childInputID, childMessageID }
  })
}

function fingerprint(value: string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}
