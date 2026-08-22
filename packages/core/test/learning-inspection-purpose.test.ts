import { describe, expect, test } from "bun:test"
import { LearningInspection } from "@opencode-ai/core/learning-inspection"
import type { LearningContext } from "@opencode-ai/core/learning-context"

const record = {
  ownerKind: "future_attention" as const,
  recordID: "fat_concern",
  revisionID: "fat_transition",
  revisionVersion: 3,
}
const owner = {
  currentOwner: {
    transitionID: record.revisionID,
    version: record.revisionVersion,
    ownerCutFingerprint: "e".repeat(64),
  },
  sourceFingerprint: "a".repeat(64),
  targetFingerprint: "b".repeat(64),
  notBefore: 40,
  serviceTiming: "at_or_after_not_before",
}

function cut(input: { coverage: "complete" | "truncated"; countAtCut: number; exact?: boolean }) {
  return {
    cutAsOf: 50,
    fingerprint: "f".repeat(64),
    sections: [
      {
        owner: "future_attention",
        scope: "all_due_open_target_current_concerns_in_learner_home",
        selectionBasis: "not_before_then_created_then_id_non_priority",
        coverage: input.coverage,
        countAtCut: input.countAtCut,
        omission:
          input.coverage === "complete"
            ? { type: "none" }
            : { type: "exact", omitted: 1, reasons: [{ reason: "candidate_limit", omitted: 1 }] },
        entries: input.exact
          ? [
              {
                kind: "future_attention",
                locator: {
                  concernID: record.recordID,
                  headTransitionID: record.revisionID,
                  version: record.revisionVersion,
                },
                semantic: {
                  state: "value",
                  value: {
                    source: { type: "learner_occurrence", occurrenceID: "occ_test" },
                    target: { courseID: "crs_test", itemID: "itm_test" },
                    notBefore: { instant: 40 },
                    serviceTiming: "at_or_after_not_before",
                  },
                },
              },
            ]
          : [],
      },
    ],
  } as unknown as LearningContext.Cut
}

describe("Gate 22 FutureAttention purpose binding", () => {
  test("requires one complete semantic exact entry for a sole conditional binding", () => {
    const binding = LearningInspection.futureAttentionPurposeBinding(
      cut({ coverage: "complete", countAtCut: 1, exact: true }),
      record,
      owner,
    )
    expect(binding).toMatchObject({
      state: "sole_conditional",
      scope: "all_due_open_target_current_concerns_in_learner_home",
      selectionBasis: "not_before_then_created_then_id_non_priority",
      cutFingerprint: "f".repeat(64),
      controlInterval: { cutAsOf: 50, notBefore: 40, serviceTiming: "at_or_after_not_before" },
    })
    expect(binding.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(binding.targetFingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  test("keeps truncated sole-looking, multiple, and absent exact entries distinct", () => {
    expect(
      LearningInspection.futureAttentionPurposeBinding(
        cut({ coverage: "complete", countAtCut: 1, exact: true }),
        record,
      ).state,
    ).toBe("partial_or_withheld")
    expect(
      LearningInspection.futureAttentionPurposeBinding(
        cut({ coverage: "truncated", countAtCut: 1, exact: true }),
        record,
        owner,
      ).state,
    ).toBe("partial_or_withheld")
    expect(
      LearningInspection.futureAttentionPurposeBinding(
        cut({ coverage: "truncated", countAtCut: 2, exact: true }),
        record,
        owner,
      ).state,
    ).toBe("multiple_unresolved")
    expect(
      LearningInspection.futureAttentionPurposeBinding(cut({ coverage: "complete", countAtCut: 1 }), record).state,
    ).toBe("not_bound")
  })

  test("requires one exact typed finalization member instead of treating malformed owner state as absence", () => {
    expect(
      LearningInspection.futureAttentionFinalizationMember(
        [{ ordinal: 0, concernID: record.recordID, outcome: "not_served", reason: "no_eligible_output" }],
        0,
        record.recordID,
        "not_served",
      ),
    ).toEqual({
      ordinal: 0,
      concernID: record.recordID,
      outcome: "not_served",
      reason: "no_eligible_output",
    })
    expect(LearningInspection.futureAttentionFinalizationMember([], 0, record.recordID, "not_served")).toBeUndefined()
    expect(
      LearningInspection.futureAttentionFinalizationMember(
        [{ ordinal: 0, concernID: record.recordID, outcome: "not_served" }],
        0,
        record.recordID,
        "not_served",
      ),
    ).toBeUndefined()
  })
})
