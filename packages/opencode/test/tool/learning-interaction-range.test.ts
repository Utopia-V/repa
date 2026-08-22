import { describe, expect, test } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LearningInspectionCursor } from "@opencode-ai/core/learning-inspection-cursor-schema"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { rangeOffsetDecision } from "@/tool/learning-interaction-read"
import { hasSameTurnResetConflict, verifyPredecessor } from "@/tool/learning-interaction-search"
import type { Tool } from "@/tool/tool"

describe("learning_interaction_read range continuation", () => {
  test("requires a predecessor for every nonzero first offset", () => {
    expect(
      rangeOffsetDecision({
        hasPredecessor: false,
        priorWasRange: false,
        offset: 999,
        allowOffsetGap: false,
      }),
    ).toEqual({ type: "conflict", reason: "nonzero_range_requires_predecessor" })
  })

  test("binds continuation to the exact predecessor nextOffset", () => {
    expect(
      rangeOffsetDecision({
        hasPredecessor: true,
        priorWasRange: true,
        expectedOffset: 8,
        offset: 8,
        allowOffsetGap: false,
      }),
    ).toEqual({ type: "accepted", skipped: 0 })
    expect(
      rangeOffsetDecision({
        hasPredecessor: true,
        priorWasRange: true,
        expectedOffset: 8,
        offset: 1000,
        allowOffsetGap: false,
      }),
    ).toEqual({ type: "conflict", reason: "range_offset_not_exact_successor" })
  })

  test("admits deliberate forward random access only as an explicit permanent gap", () => {
    expect(
      rangeOffsetDecision({
        hasPredecessor: true,
        priorWasRange: true,
        expectedOffset: 8,
        offset: 12,
        allowOffsetGap: true,
      }),
    ).toEqual({ type: "accepted", skipped: 4 })
    expect(
      rangeOffsetDecision({
        hasPredecessor: true,
        priorWasRange: true,
        expectedOffset: 8,
        offset: 7,
        allowOffsetGap: true,
      }),
    ).toEqual({ type: "conflict", reason: "range_offset_rewinds" })
  })

  test("refuses another page when the predecessor declared the range complete", () => {
    expect(
      rangeOffsetDecision({
        hasPredecessor: true,
        priorWasRange: true,
        offset: 8,
        allowOffsetGap: false,
      }),
    ).toEqual({ type: "conflict", reason: "range_was_already_complete" })
  })

  test("keeps a missing predecessor address source-unavailable-or-unresolved without trusting the caller token", async () => {
    const search = LearningInspectionCursor.signSearch(
      {
        schemaVersion: 1,
        queryFingerprint: "a".repeat(64),
        source: {
          sessionID: "ses_missing",
          turnID: "trn_missing",
          inputID: "tri_missing",
          partID: "prt_missing",
          modelOrdinal: 0,
          toolOrdinal: 0,
        },
        completeSoFar: true,
        gapCounts: { oversizedCandidateSkipped: 0, rangeItemsSkipped: 0 },
        gapFingerprint: "b".repeat(64),
        continuationPending: true,
      },
      { status: "continuation_pending" },
    )
    const result = await Effect.runPromise(
      Database.Service.pipe(
        Effect.flatMap(({ db }) =>
          db.transaction((tx) =>
            verifyPredecessor(tx, {
              continuation: search.continuation,
              toolID: "learning_interaction_read",
              queryFingerprint: search.continuation.queryFingerprint,
            }),
          ),
        ),
        Effect.provide(Database.layerFromPath(":memory:")),
        Effect.scoped,
      ),
    )
    expect(result).toEqual({ type: "source_unavailable_or_unresolved" })
  })

  test("finds a durable same-Turn range gap before a predecessor-free range-zero reset", async () => {
    const queryFingerprint = LearningInspectionCursor.queryFingerprint({
      schemaVersion: 1,
      kind: "exact_interaction_range",
      locator: "test",
    })
    const signed = LearningInspectionCursor.signSearch(
      {
        schemaVersion: 1,
        queryFingerprint,
        source: {
          sessionID: "ses_range_reset",
          turnID: "trn_range_reset",
          inputID: "tri_range_reset",
          partID: "prt_range_reset",
          modelOrdinal: 0,
          toolOrdinal: 0,
        },
        completeSoFar: false,
        gapCounts: { oversizedCandidateSkipped: 0, rangeItemsSkipped: 3 },
        gapFingerprint: "c".repeat(64),
        continuationPending: true,
        rangeNextOffset: 4,
      },
      { status: "non_atomic_search_incomplete" },
    )
    const result = await Effect.runPromise(
      Database.Service.pipe(
        Effect.flatMap(({ db }) =>
          Effect.gen(function* () {
            yield* db.run("PRAGMA foreign_keys = OFF")
            const triggers = yield* db.all<{ name: string }>(sql`
              SELECT name FROM sqlite_master
              WHERE type = 'trigger'
                AND tbl_name IN ('turn_model_operation', 'turn_tool_candidate', 'turn_tool_invocation')
            `)
            yield* Effect.forEach(triggers, (trigger) => db.run(sql.raw(`DROP TRIGGER IF EXISTS ${trigger.name}`)), {
              discard: true,
            })
            return yield* db.transaction((tx) =>
              Effect.gen(function* () {
                yield* tx.run(sql`
                INSERT INTO turn_model_operation (
                  assistant_message_id, turn_id, session_id, input_id, ordinal, state,
                  request_fingerprint, context_fingerprint,
                  snapshot_frontier_sequence, snapshot_frontier_time,
                  observed_shared_frontier_sequence, observed_shared_frontier_time,
                  time_admitted, time_settled
                ) VALUES (
                  'msg_range_reset', 'trn_range_reset', 'ses_range_reset', 'tri_range_reset', 0, 'completed',
                  ${"a".repeat(64)}, ${"b".repeat(64)}, 0, 0, 0, 0, 1, 2
                )
              `)
                yield* tx.run(sql`
                INSERT INTO turn_tool_candidate (
                  part_id, turn_id, session_id, assistant_message_id, call_id, tool,
                  emission_ordinal, state, normalized_envelope, envelope_fingerprint,
                  time_registered, future_attention_service_source
                ) VALUES (
                  'prt_range_reset', 'trn_range_reset', 'ses_range_reset', 'msg_range_reset',
                  'call_range_reset', 'learning_interaction_read', 0, 'admitted', '{}',
                  ${"d".repeat(64)}, 1, 'internal_control'
                )
              `)
                yield* tx.run(sql`
                INSERT INTO turn_tool_invocation (
                  part_id, turn_id, session_id, assistant_message_id, ordinal, state,
                  observed_shared_frontier_sequence, observed_shared_frontier_time,
                  consumed_shared_frontier_sequence, consumed_shared_frontier_time,
                  time_admitted, time_settled
                ) VALUES (
                  'prt_range_reset', 'trn_range_reset', 'ses_range_reset', 'msg_range_reset', 0,
                  'completed', 0, 0, 0, 0, 1, 2
                )
              `)
                yield* tx.run(sql`
                INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
                VALUES (
                  'prt_range_reset', 'msg_range_reset', 'ses_range_reset', 1, 2,
                  ${JSON.stringify({
                    type: "tool",
                    callID: "call_range_reset",
                    tool: "learning_interaction_read",
                    state: {
                      status: "completed",
                      input: { action: "read_range" },
                      output: JSON.stringify({ ownerResult: { search: signed } }),
                      title: "Interaction range",
                      metadata: {},
                      time: { start: 1, end: 2 },
                    },
                  })}
                )
              `)
                return yield* hasSameTurnResetConflict(tx, {
                  context: {
                    sessionID: "ses_range_reset",
                    messageID: "msg_range_reset",
                    callID: "call_current_reset",
                    abort: new AbortController().signal,
                    interaction: {
                      turnID: "trn_range_reset",
                      inputID: "tri_range_reset",
                      assistantMessageID: "msg_current_reset",
                      candidate: { partID: "prt_current_reset", callID: "call_current_reset" },
                    },
                  } as unknown as Tool.Context,
                  toolID: "learning_interaction_read",
                  queryFingerprint,
                })
              }),
            )
          }),
        ),
        Effect.provide(Database.layerFromPath(":memory:")),
        Effect.scoped,
      ),
    )
    expect(result).toBeTrue()
  })
})
