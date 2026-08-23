import { describe, expect, test } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LearningInspectionCursor } from "@opencode-ai/core/learning-inspection-cursor-schema"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { rangeOffsetDecision, resolveRecentRangeLocator } from "@/tool/learning-interaction-read"
import { hasSameTurnResetConflict, verifyPredecessor } from "@/tool/learning-interaction-search"
import type { Tool } from "@/tool/tool"

const compactLocator = {
  status: "available",
  sessionID: "ses_compact_source",
  turnID: "trn_compact_source",
  inputID: "tri_compact_source",
  causalOccurrenceID: "lco_compact_source",
  timeAdmitted: 1,
  timeTerminal: 2,
  terminalState: "completed",
  terminalReason: "normal",
  presentationProvenance: {
    count: 1,
    kinds: ["origin"],
    fingerprint: "a".repeat(64),
    historicalMessageOrPart: false,
  },
  messageRange: {
    first: "msg_compact_source",
    last: "msg_compact_source",
    count: 1,
    fingerprint: "b".repeat(64),
    chunks: [{ offset: 0, count: 1, fingerprint: "c".repeat(64) }],
  },
  partRange: {
    first: "prt_compact_source",
    last: "prt_compact_source",
    count: 1,
    fingerprint: "d".repeat(64),
    chunks: [{ offset: 0, count: 1, fingerprint: "e".repeat(64) }],
  },
} as const

function resolveCompact(input: {
  entryIndex?: number
  contextInputID?: string
  storedDirectoryCallID?: string
  storedPartCallID?: string
  deletePredecessor?: boolean
}) {
  return Database.Service.pipe(
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
        yield* db.run(sql`
          INSERT INTO turn_model_operation (
            assistant_message_id, turn_id, session_id, input_id, ordinal, state,
            request_fingerprint, context_fingerprint,
            snapshot_frontier_sequence, snapshot_frontier_time,
            observed_shared_frontier_sequence, observed_shared_frontier_time,
            time_admitted, time_settled
          ) VALUES
            (
              'msg_compact_directory', 'trn_compact', 'ses_compact', 'tri_compact', 0, 'completed',
              ${"1".repeat(64)}, ${"2".repeat(64)}, 0, 0, 0, 0, 1, 2
            ),
            (
              'msg_compact_current', 'trn_compact', 'ses_compact', 'tri_compact', 1, 'completed',
              ${"3".repeat(64)}, ${"4".repeat(64)}, 0, 0, 0, 0, 3, 4
            )
        `)
        yield* db.run(sql`
          INSERT INTO turn_tool_candidate (
            part_id, turn_id, session_id, assistant_message_id, call_id, tool,
            emission_ordinal, state, normalized_envelope, envelope_fingerprint,
            time_registered, future_attention_service_source
          ) VALUES
            (
              'prt_compact_directory', 'trn_compact', 'ses_compact', 'msg_compact_directory',
              'call_directory', 'learning_interaction_read', 0, 'admitted', '{}',
              ${"5".repeat(64)}, 1, 'internal_control'
            ),
            (
              'prt_compact_current', 'trn_compact', 'ses_compact', 'msg_compact_current',
              'call_current', 'learning_interaction_read', 0, 'admitted', '{}',
              ${"6".repeat(64)}, 3, 'internal_control'
            )
        `)
        yield* db.run(sql`
          INSERT INTO turn_tool_invocation (
            part_id, turn_id, session_id, assistant_message_id, ordinal, state,
            observed_shared_frontier_sequence, observed_shared_frontier_time,
            consumed_shared_frontier_sequence, consumed_shared_frontier_time,
            time_admitted, time_settled
          ) VALUES (
            'prt_compact_directory', 'trn_compact', 'ses_compact', 'msg_compact_directory', 0,
            'completed', 0, 0, 0, 0, 1, 2
          )
        `)
        yield* db.run(sql`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES (
            'prt_compact_directory', 'msg_compact_directory', 'ses_compact', 1, 2,
            ${JSON.stringify({
              type: "tool",
              callID: input.storedPartCallID ?? "call_directory",
              tool: "learning_interaction_read",
              state: {
                status: "completed",
                input: { action: "list_recent", limit: 4 },
                output: JSON.stringify({
                  status: "available",
                  rangeReadHandle: {
                    directoryCallID: input.storedDirectoryCallID ?? "call_directory",
                    entryCount: 1,
                  },
                  entries: [{ entryIndex: 0, locator: compactLocator }],
                  omitted: false,
                }),
                title: "Recent Interaction locators",
                metadata: {},
                time: { start: 1, end: 2 },
              },
            })}
          )
        `)
        if (input.deletePredecessor) {
          yield* db.run(sql`DELETE FROM part WHERE id = 'prt_compact_directory'`)
        }
        return yield* db.transaction((tx) =>
          resolveRecentRangeLocator(
            tx,
            {
              action: "read_recent_range",
              directoryCallID: "call_directory",
              entryIndex: input.entryIndex ?? 0,
            },
            {
              sessionID: "ses_compact",
              messageID: "msg_compact_current",
              callID: "call_current",
              abort: new AbortController().signal,
              interaction: {
                turnID: "trn_compact",
                inputID: input.contextInputID ?? "tri_compact",
                assistantMessageID: "msg_compact_current",
                candidate: { partID: "prt_compact_current", callID: "call_current", emissionOrdinal: 0 },
              },
            } as unknown as Tool.Context,
          ),
        )
      }),
    ),
    Effect.provide(Database.layerFromPath(":memory:")),
    Effect.scoped,
  )
}

describe("learning_interaction_read range continuation", () => {
  test("rehydrates one exact recent locator from a prior completed Tool call and entry index", async () => {
    const result = await Effect.runPromise(resolveCompact({}))
    expect(result.type).toBe("verified")
    if (result.type !== "verified") return
    expect(String(result.partID)).toBe("prt_compact_directory")
    expect(result.locator).toEqual(compactLocator)
  })

  test("rejects an out-of-range entry and a different current Input before reading", async () => {
    expect(await Effect.runPromise(resolveCompact({ entryIndex: 1 }))).toEqual({
      type: "conflict",
      reason: "predecessor_entry_index",
    })
    expect(await Effect.runPromise(resolveCompact({ contextInputID: "tri_other" }))).toEqual({
      type: "conflict",
      reason: "current_operation_identity_mismatch",
    })
  })

  test("rejects a tampered compact handle and reports a deleted predecessor as unavailable", async () => {
    expect(await Effect.runPromise(resolveCompact({ storedDirectoryCallID: "call_tampered" }))).toEqual({
      type: "conflict",
      reason: "predecessor_handle_mismatch",
    })
    expect(await Effect.runPromise(resolveCompact({ storedPartCallID: "call_tampered" }))).toEqual({
      type: "conflict",
      reason: "predecessor_identity_mismatch",
    })
    expect(await Effect.runPromise(resolveCompact({ deletePredecessor: true }))).toEqual({
      type: "source_unavailable_or_unresolved",
    })
  })

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
