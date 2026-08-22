import { describe, expect, test } from "bun:test"
import type { TurnInfo } from "@opencode-ai/sdk/v2"
import { inspectionExhaustionPresentation } from "../../src/util/learning-inspection-exhaustion"

function turn(counter: "model" | "tool", projection?: TurnInfo["inspectionExhaustion"]): TurnInfo {
  return {
    id: "trn_test",
    sessionID: "ses_test",
    admissionKind: "learner",
    initialInputID: "tri_test",
    currentInputID: "tri_test",
    limits: { model: 2, tool: 2 },
    counters: { model: 2, tool: 2 },
    state: "exhausted",
    depth: 0,
    timeAdmitted: 1,
    causalTime: 3,
    terminal: {
      outcome: "exhausted",
      reason: counter === "model" ? "model_limit" : "tool_limit",
      counters: { model: 2, tool: 2 },
      time: 3,
      exhaustion: {
        counter,
        observed: 2,
        limit: 2,
        rejectedAttemptID: "att_rejected",
        envelope: {},
        envelopeFingerprint: "f".repeat(64),
        time: 3,
      },
    },
    ...(projection ? { inspectionExhaustion: projection } : {}),
  }
}

const exact = {
  schemaVersion: 1 as const,
  type: "predecessor_continuation_exhausted" as const,
  counter: "model" as const,
  predecessorPartID: "prt_page_2",
  queryFingerprint: "a".repeat(64),
  outputFingerprint: "b".repeat(64),
  completeSoFar: false,
  gapCounts: { oversizedCandidateSkipped: 1, rangeItemsSkipped: 3 },
  gapFingerprint: "c".repeat(64),
  continuationPending: true,
  rangeNextOffset: 12,
}

describe("primary TUI Turn exhaustion presenter", () => {
  test("keeps missing, generic, and counter-mismatched database projections generic", () => {
    expect(inspectionExhaustionPresentation(turn("model"))).toMatchObject({ type: "generic", counter: "model" })
    expect(
      inspectionExhaustionPresentation(
        turn("model", { schemaVersion: 1, type: "generic", counter: "model", reason: "ambiguous" }),
      ),
    ).toMatchObject({ type: "generic", reason: "ambiguous" })
    expect(inspectionExhaustionPresentation(turn("tool", exact))).toMatchObject({
      type: "generic",
      counter: "tool",
    })
  })

  test("renders the database-verified immediate predecessor and cumulative gaps without rescanning hydrated Parts", () => {
    expect(inspectionExhaustionPresentation(turn("model", exact), [])).toEqual({
      type: "predecessor_continuation_exhausted",
      counter: "model",
      turnID: "trn_test",
      observed: 2,
      limit: 2,
      predecessorPartID: "prt_page_2",
      queryFingerprint: "a".repeat(64),
      completeSoFar: false,
      gapCounts: { oversizedCandidateSkipped: 1, rangeItemsSkipped: 3 },
      continuationPending: true,
      rangeNextOffset: 12,
    })
  })
})
