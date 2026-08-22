import { describe, expect, test } from "bun:test"
import { LearningInspectionSchema as LearningInspection } from "@opencode-ai/core/learning-inspection-schema"
import { LearningInspectionOwner } from "@opencode-ai/core/learning-inspection-owner"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { inspectionLines, inspectionPresentation, inspectionStatus } from "../../src/util/learning-inspection"

const relations = {
  course_view: "immutable View revision with separate working selection",
  learning_navigation: "current learner-owned navigation transition",
  artifact: "exact observed Artifact revision",
  representation: "exact immutable Representation derivation",
  material_map: "one coexisting immutable Material Map",
  material_selector: "exact Map-scoped selector",
  material_alignment: "exact optional Course alignment",
  learner_goal: "exact current Goal head",
  retained_steering: "current operation retained-steering cut; policy history unsupported",
  learner_response_evidence: "exact fallible evidence revision",
  future_attention: "exact concern transition with separate finalization",
  assignment: "exact current obligation revision",
  learner_state_judgment: "exact fallible whole-record judgment",
  advisory_plan_suggestion: "exact authored advisory revision",
  learning_context: "exact immutable operation Context cut",
  learning_interaction: "exact Session/Turn Interaction presentation",
} satisfies Record<LearningInspection.OwnerArm, string>

function projection(arm: LearningInspection.OwnerArm = "learner_goal"): LearningInspection.Projection {
  const kind = LearningInspection.INSPECTION_OWNER_KIND[arm]
  const recordKind = kind === "retained_steering" || kind === "learning_context" ? undefined : kind
  return {
    schemaVersion: 1,
    status: "available",
    source: {
      learnerHomeID: "lhm_test",
      partID: "prt_test",
      tool: "learning_interaction_read",
      action: "inspect",
      assistantMessageID: "msg_test",
      turnID: "trn_test" as LearningInspection.Projection["source"]["turnID"],
      inputID: "tri_test" as LearningInspection.Projection["source"]["inputID"],
      observedFrontier: { sequence: 7, time: 70 },
      currentFrontier: { sequence: 7, time: 70 },
    },
    owner: {
      kind,
      ...LearningInspectionOwner.inspectionOwner(arm, relations[arm], [
        { label: "Epistemic/lifecycle truth", value: `${arm} fixture` },
      ]),
      capabilityID: "learning_interaction_read",
      action: "inspect",
      records: recordKind
        ? [
            {
              ownerKind: recordKind,
              recordID: `${recordKind}_record`,
              revisionID: `${recordKind}_revision`,
              revisionVersion: 2,
            },
          ]
        : [],
    },
    lineage: {
      coverage: "complete_page",
      scope: { status: "complete", operationCount: 1, terminalSealedCount: 1 },
      contextCoverage: [],
      items: [],
      omitted: false,
      pendingGap: false,
    },
    deletionAudit: { status: "unknown", items: [], omitted: false },
    sessionDeletion: { status: "not_applicable" },
    administrativeHistory: { status: "not_applicable", members: [], laterLocalMessages: [], omitted: false },
    nonCausality: "operational_lineage_not_per_record_answer_causality",
  }
}

function part(value: unknown, input: Partial<ToolPart> = {}): ToolPart {
  return {
    id: "prt_test",
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    callID: "call_test",
    tool: "learning_interaction_read",
    state: {
      status: "completed",
      input: {},
      output: "typed inspection",
      title: "Learning inspection",
      metadata: { [LearningInspection.METADATA_KEY]: value },
      time: { start: 1, end: 2 },
    },
    ...input,
  }
}

describe("primary TUI learning inspection decoder", () => {
  test("keeps every closed owner arm on its own typed owner kind and semantic relation", () => {
    for (const arm of LearningInspectionOwner.INSPECTION_OWNER_ARMS) {
      const value = projection(arm)
      expect(LearningInspection.isProjection(value)).toBeTrue()
      expect(inspectionPresentation(part(value))).toEqual({ type: "valid", value })
      expect(inspectionLines(value)).toContainEqual({ label: "Owner relation", value: `${arm} — ${relations[arm]}` })
      expect(value.owner.kind).toBe(LearningInspection.INSPECTION_OWNER_KIND[arm])
      expect(inspectionLines(value).at(-1)?.value).toContain("does not prove")
    }
  })

  test("rejects cross-owner arm/kind/record combinations and mismatched Tool Part binding", () => {
    const artifact = projection("artifact")
    expect(
      LearningInspection.isProjection({ ...artifact, owner: { ...artifact.owner, kind: "learner_goal" } }),
    ).toBeFalse()
    expect(
      LearningInspection.isProjection({
        ...artifact,
        owner: {
          ...artifact.owner,
          records: [{ ownerKind: "learner_goal", recordID: "g", revisionID: "r", revisionVersion: 1 }],
        },
      }),
    ).toBeFalse()
    const context = projection("learning_context")
    expect(
      LearningInspection.isProjection({
        ...context,
        owner: {
          ...context.owner,
          records: [{ ownerKind: "learning_interaction", recordID: "s", revisionID: "t", revisionVersion: 0 }],
        },
      }),
    ).toBeFalse()
    expect(inspectionPresentation(part(artifact, { id: "prt_other" }))).toEqual({ type: "invalid" })
  })

  test("rejects forged owner semantics and malformed nested administrative members", () => {
    const goal = projection("learner_goal")
    expect(
      LearningInspection.isProjection({
        ...goal,
        owner: { ...goal.owner, meaning: "generic record", potentialEffects: ["anything"] },
      }),
    ).toBeFalse()
    expect(
      LearningInspection.isProjection({
        ...goal,
        lineage: {
          ...goal.lineage,
          items: [
            {
              assistantMessageID: "msg_foreign",
              sessionID: "ses_foreign",
              turnID: "trn_foreign",
              inputID: "tri_foreign",
              record: {
                ownerKind: "assignment",
                recordID: "asn_foreign",
                revisionID: "asr_foreign",
                revisionVersion: 1,
              },
              contextClassification: "not_entered",
              exactRead: true,
              typedCitation: false,
              operationState: "completed",
              turnState: "completed",
              actionState: "intermediate",
            },
          ],
        },
      }),
    ).toBeFalse()
    const interaction = projection("learning_interaction")
    expect(
      LearningInspection.isProjection({
        ...interaction,
        sessionDeletion: {
          status: "live",
          rootSessionID: "ses_live",
          deletionTime: 99,
          auditAvailable: true,
        },
        administrativeHistory: {
          status: "not_applicable",
          kind: "offline_exact_restore",
          sessionID: "ses_live",
          historyFrontierTime: 1,
          presentationFrontierTime: 1,
          importedRevertAbsent: true,
          messageCount: 1,
          partCount: 0,
          members: [],
          laterLocalMessages: [],
          omitted: false,
        },
      }),
    ).toBeFalse()
    expect(
      LearningInspection.isProjection({
        ...goal,
        administrativeHistory: {
          status: "available",
          kind: "offline_exact_restore",
          sessionID: "ses_history",
          historyFrontierTime: 1,
          presentationFrontierTime: 1,
          importedRevertAbsent: true,
          messageCount: 1,
          partCount: 0,
          members: [null],
          laterLocalMessages: [],
          omitted: false,
        },
      }),
    ).toBeFalse()
  })

  test("renders per-operation Context/read/citation/action and retained audit facts", () => {
    const base = projection("future_attention")
    const record = base.owner.records[0]!
    const value: LearningInspection.Projection = {
      ...base,
      lineage: {
        coverage: "complete_page",
        scope: { status: "complete", operationCount: 1, terminalSealedCount: 1 },
        contextCoverage: [
          {
            assistantMessageID: "msg_prior" as LearningInspection.ContextCoverageItem["assistantMessageID"],
            sectionOwner: "future_attention",
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
            contextClassification: "semantic_full",
            exactRead: true,
            typedCitation: true,
            operationState: "completed",
            turnState: "completed",
            actionState: "completed",
            action: {
              type: "assistant_presentation",
              assistantMessageID: "msg_prior" as LearningInspection.LineageItem["assistantMessageID"],
            },
            ownerFinalization: {
              receiptID: "far_test",
              outcome: "not_served",
              timeFinalized: 88,
              member: {
                ordinal: 0,
                concernID: record.recordID,
                outcome: "not_served",
                reason: "no_eligible_output",
              },
              currentConcern: {
                transitionID: "fat_current",
                version: 3,
                disposition: "open",
              },
            },
          },
        ],
        omitted: false,
        pendingGap: false,
      },
      deletionAudit: {
        status: "available",
        items: [
          {
            rootSessionID: "ses_root",
            bundleID: "dab_test",
            operationID: "dao_test",
            record,
            contextClassification: "semantic_full",
            exactRead: true,
            typedCitation: true,
            terminalStatus: "completed",
            deletionTime: 90,
            bodyDeleted: true,
          },
        ],
        omitted: false,
      },
    }
    const lines = inspectionLines(value)
    expect(lines.find((item) => item.label === "Context msg_prior")?.value).toContain("truncated")
    expect(lines.find((item) => item.label === "Interaction msg_prior")?.value).toContain("typed citation yes")
    expect(lines.find((item) => item.label === "Interaction msg_prior")?.value).toContain("action completed")
    expect(lines.find((item) => item.label === "Owner finalization msg_prior")?.value).toContain(
      "not_served (no_eligible_output)",
    )
    expect(lines.find((item) => item.label === "Owner finalization msg_prior")?.value).toContain("current concern open")
    expect(lines.find((item) => item.label === "Audit dao_test")?.value).toContain("body deleted")
  })

  test("preserves every typed status, including not-found and unresolved cursor source", () => {
    expect(
      [
        "not_found",
        "stale_inspection",
        "read_shape_unsupported",
        "ambiguous_source",
        "source_unavailable",
        "integrity_validation_unavailable",
        "cursor_source_unavailable",
        "cursor_source_unavailable_or_unresolved",
        "cursor_predecessor_conflict",
        "cursor_reset_conflict",
        "interaction_locator_over_budget",
        "discovery_incomplete",
      ].map((status) => inspectionStatus({ ...projection(), status } as LearningInspection.Projection)),
    ).toEqual([
      "Not found",
      "Stale",
      "Unsupported",
      "Ambiguous",
      "Source unavailable",
      "Integrity unavailable",
      "Cursor source unavailable",
      "Cursor source unavailable or unresolved",
      "Cursor conflict",
      "Cursor reset refused",
      "Locator over budget",
      "Discovery incomplete",
    ])
  })
})
