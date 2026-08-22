import { describe, expect, test } from "bun:test"
import { LearningInspectionCursor } from "@opencode-ai/core/learning-inspection-cursor-schema"
import { LearningInspectionSchema } from "@opencode-ai/core/learning-inspection-schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Schema } from "effect"

function signed() {
  return LearningInspectionCursor.signSearch(
    {
      schemaVersion: 1,
      queryFingerprint: LearningInspectionCursor.queryFingerprint({
        kind: "terminal_root_directory",
        scope: "learner_home",
      }),
      source: {
        sessionID: `ses_${"0".repeat(26)}`,
        turnID: "trn_source",
        inputID: "tri_source",
        partID: "prt_source",
        modelOrdinal: 0,
        toolOrdinal: 0,
      },
      lastKey: { timeTerminal: 10, turnID: "trn_last" },
      completeSoFar: false,
      gapCounts: { oversizedCandidateSkipped: 1, rangeItemsSkipped: 0 },
      gapFingerprint: "a".repeat(64),
      continuationPending: true,
    },
    {
      status: "candidate_skipped",
      gap: "oversized_candidate_skipped",
      candidate: { sessionID: "ses_candidate", turnID: "trn_candidate" },
    },
  )
}

describe("Gate 22 Interaction continuation authentication", () => {
  test("verifies canonical immutable search output and its cumulative gap state", () => {
    const search = signed()
    expect(LearningInspectionCursor.verifyStoredSearch(JSON.stringify({ search }), search.continuation)).toEqual({
      type: "verified",
      continuation: search.continuation,
      payload: search.payload,
    })
    expect(
      LearningInspectionCursor.verifyStoredSearch(
        JSON.stringify({ ownerResult: { search }, inspection: { status: "available" } }),
        search.continuation,
      ),
    ).toMatchObject({ type: "verified", continuation: search.continuation })
    expect(Schema.is(LearningInspectionCursor.Continuation)(search.continuation)).toBeTrue()
  })

  test("rejects caller-recomputed gap erasure, wrong scope identities, and changed output bytes", () => {
    const search = signed()
    const erased = LearningInspectionCursor.signSearch(
      {
        ...search.continuation,
        completeSoFar: true,
        gapCounts: { oversizedCandidateSkipped: 0, rangeItemsSkipped: 0 },
        gapFingerprint: "b".repeat(64),
      },
      search.payload,
    ).continuation
    expect(LearningInspectionCursor.verifyStoredSearch(JSON.stringify({ search }), erased)).toEqual({
      type: "conflict",
      reason: "predecessor_token_mismatch",
    })
    expect(
      LearningInspectionCursor.verifyStoredSearch(JSON.stringify({ search }), {
        ...search.continuation,
        source: { ...search.continuation.source, turnID: "trn_other" },
      }),
    ).toEqual({ type: "conflict", reason: "predecessor_token_mismatch" })
    expect(
      LearningInspectionCursor.verifyStoredSearch(
        JSON.stringify({ search: { ...search, payload: { ...search.payload, status: "complete" } } }),
        search.continuation,
      ),
    ).toEqual({ type: "conflict", reason: "predecessor_output_fingerprint" })
  })

  test("uses one closed search and continuation schema", () => {
    const search = signed()
    expect(
      Schema.is(LearningInspectionCursor.Continuation)({ ...search.continuation, callerChecksum: "trusted" }),
    ).toBeFalse()
    expect(
      Schema.is(LearningInspectionCursor.SearchInput)({
        action: "materialize_interaction_locator",
        candidate: {
          descriptor: {
            status: "available",
            sessionID: `ses_${"1".repeat(26)}`,
            turnID: "trn_candidate",
            timeAdmitted: 1,
            timeTerminal: 2,
            terminalState: "completed",
          },
        },
        predecessor: search.continuation,
        injected: true,
      }),
    ).toBeFalse()
  })

  test("binds reverse-read page cursors to one exact record set and rejects tampering", () => {
    const records = [
      { ownerKind: "learner_goal" as const, recordID: "gol_test", revisionID: "glr_test", revisionVersion: 3 },
    ]
    const cursor = LearningInspectionSchema.createPageCursor(
      "live_lineage",
      SessionV1.PartID.make("prt_cursor_source"),
      records,
      "msg_after",
    )
    expect(LearningInspectionSchema.readPageCursor(cursor)).toMatchObject({
      schemaVersion: 1,
      section: "live_lineage",
      targetFingerprint: LearningInspectionSchema.recordSetFingerprint(records),
      after: "msg_after",
    })
    const changed = JSON.parse(cursor)
    changed.after = "msg_erased"
    expect(LearningInspectionSchema.readPageCursor(JSON.stringify(changed))).toBeUndefined()
    expect(LearningInspectionSchema.recordSetFingerprint([{ ...records[0]!, revisionVersion: 4 }])).not.toBe(
      LearningInspectionSchema.readPageCursor(cursor)?.targetFingerprint,
    )
  })
})
