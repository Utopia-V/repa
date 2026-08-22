import { expect, test } from "bun:test"
import { LearningInspectionSchema as LearningInspection } from "@opencode-ai/core/learning-inspection-schema"
import { LearningInspectionOwner } from "@opencode-ai/core/learning-inspection-owner"
import type { ToolPart, TurnInfo } from "@opencode-ai/sdk/v2"
import { testRender } from "@opentui/solid"
import {
  LearningInspectionExhaustionContent,
  LearningInspectionToolContent,
} from "../../src/component/learning-inspection"

test("the actual primary-TUI component renders per-operation and coverage discriminants", async () => {
  const record = {
    ownerKind: "learner_goal" as const,
    recordID: "gol_test",
    revisionID: "glr_test",
    revisionVersion: 1,
  }
  const value: LearningInspection.Projection = {
    schemaVersion: 1,
    status: "available",
    source: {
      learnerHomeID: "lhm_test",
      partID: "prt_test",
      tool: "learner_goal_query",
      action: "get",
      assistantMessageID: "msg_current",
      turnID: "trn_current" as LearningInspection.Projection["source"]["turnID"],
      inputID: "tri_current" as LearningInspection.Projection["source"]["inputID"],
      observedFrontier: { sequence: 2, time: 20 },
      currentFrontier: { sequence: 2, time: 20 },
    },
    owner: {
      kind: "learner_goal",
      ...LearningInspectionOwner.inspectionOwner("learner_goal", "exact current Goal head"),
      capabilityID: "learner_goal_query",
      action: "get",
      records: [record],
    },
    lineage: {
      coverage: "complete_page",
      scope: { status: "complete", operationCount: 1, terminalSealedCount: 1 },
      contextCoverage: [
        {
          assistantMessageID: "msg_prior" as LearningInspection.ContextCoverageItem["assistantMessageID"],
          sectionOwner: "learner_goal",
          coverage: "truncated",
          countAtCut: 2,
          omission: { type: "exact", omitted: 1, reasons: [{ reason: "candidate_limit", omitted: 1 }] },
          targetRecordCount: 1,
        },
      ],
      items: [
        {
          assistantMessageID: "msg_prior" as LearningInspection.LineageItem["assistantMessageID"],
          sessionID: "ses_prior" as LearningInspection.LineageItem["sessionID"],
          turnID: "trn_prior" as LearningInspection.LineageItem["turnID"],
          inputID: "tri_prior" as LearningInspection.LineageItem["inputID"],
          record,
          contextClassification: "locator_only",
          exactRead: true,
          typedCitation: false,
          operationState: "completed",
          turnState: "completed",
          actionState: "intermediate",
        },
      ],
      omitted: false,
      pendingGap: false,
    },
    deletionAudit: { status: "unknown", items: [], omitted: false },
    sessionDeletion: { status: "not_applicable" },
    administrativeHistory: { status: "not_applicable", members: [], laterLocalMessages: [], omitted: false },
    nonCausality: "operational_lineage_not_per_record_answer_causality",
  }
  const part = {
    id: "prt_test",
    sessionID: "ses_current",
    messageID: "msg_current",
    type: "tool",
    callID: "call_inspect",
    tool: "learner_goal_query",
    state: {
      status: "completed",
      input: { action: "get", includeInspection: true },
      output: "typed owner result",
      title: "Goal",
      metadata: { [LearningInspection.METADATA_KEY]: value },
      time: { start: 1, end: 2 },
    },
  } satisfies ToolPart
  const app = await testRender(() => <LearningInspectionToolContent part={part} />, { width: 180, height: 32 })
  try {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    expect(frame).toContain("Learning inspection — Available")
    expect(frame).toContain("Context msg_prior: learner_goal; truncated")
    expect(frame).toContain("exact read yes; typed citation no")
    expect(frame).toContain("action intermediate")
    expect(frame).toContain("does not prove that one record caused")
    expect(frame).toContain("completed after the displayed observation cut")
  } finally {
    app.renderer.destroy()
  }
})

test("the actual primary-TUI exhaustion body preserves cumulative gaps from the database projection", async () => {
  const turn = {
    id: "trn_exhausted",
    sessionID: "ses_current",
    admissionKind: "learner",
    initialInputID: "tri_current",
    currentInputID: "tri_current",
    limits: { model: 2, tool: 2 },
    counters: { model: 2, tool: 2 },
    state: "exhausted",
    depth: 0,
    timeAdmitted: 1,
    causalTime: 3,
    terminal: {
      outcome: "exhausted",
      reason: "model_limit",
      counters: { model: 2, tool: 2 },
      time: 3,
      exhaustion: {
        counter: "model",
        observed: 2,
        limit: 2,
        rejectedAttemptID: "att_rejected",
        envelope: {},
        envelopeFingerprint: "f".repeat(64),
        time: 3,
      },
    },
    inspectionExhaustion: {
      schemaVersion: 1,
      type: "predecessor_continuation_exhausted",
      counter: "model",
      predecessorPartID: "prt_page_2",
      queryFingerprint: "a".repeat(64),
      outputFingerprint: "b".repeat(64),
      completeSoFar: false,
      gapCounts: { oversizedCandidateSkipped: 1, rangeItemsSkipped: 3 },
      gapFingerprint: "c".repeat(64),
      continuationPending: true,
      rangeNextOffset: 12,
    },
  } satisfies TurnInfo
  const app = await testRender(() => <LearningInspectionExhaustionContent turn={turn} />, {
    width: 160,
    height: 12,
  })
  try {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    expect(frame).toContain("Turn exhausted — model capacity 2/2")
    expect(frame).toContain("Coverage complete: no")
    expect(frame).toContain("1 oversized, 3 range item(s)")
    expect(frame).toContain("continuation pending")
  } finally {
    app.renderer.destroy()
  }
})
