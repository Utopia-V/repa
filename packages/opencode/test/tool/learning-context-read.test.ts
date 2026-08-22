import { describe, expect, test } from "bun:test"
import { MAX_LAZY_BYTES, MAX_LAZY_ITEMS, utf8Bytes } from "@opencode-ai/core/learning-context"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Effect, Exit } from "effect"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { Representation } from "@opencode-ai/core/representation"
import { TurnLineage } from "@opencode-ai/core/turn-lineage"
import { LearningInspectionSchema as LearningInspection } from "@opencode-ai/core/learning-inspection-schema"
import { LearningInspectionOwner } from "@opencode-ai/core/learning-inspection-owner"
import { attachInspection, learningContextReadResult, learningInspectionReadResult } from "@/tool/learning-context-read"
import { materialLineageValue } from "@/tool/learning-material-query"
import { classifyMaterialFailure } from "@/tool/learning-material-read"

describe("learningContextReadResult", () => {
  test("accepts the exact UTF-8 byte and typed-item ceilings without generic truncation", () => {
    const value = "界".repeat((MAX_LAZY_BYTES - 2) / 3)
    const result = learningContextReadResult({
      capabilityID: "learner_goal_query",
      title: "Exact lazy read",
      metadata: { owner: "test" },
      value,
      itemCount: MAX_LAZY_ITEMS,
    })

    expect(utf8Bytes(JSON.stringify(value))).toBe(MAX_LAZY_BYTES)
    expect(result.metadata).toMatchObject({
      status: "available",
      byteCount: MAX_LAZY_BYTES,
      itemCount: MAX_LAZY_ITEMS,
      truncated: false,
    })
    expect(result.metadata).not.toHaveProperty("outputPath")
    expect(result.output).toBe(JSON.stringify(value))
  })

  test("reports a one-byte UTF-8 overflow without returning a partial owner value", () => {
    const value = `${"界".repeat((MAX_LAZY_BYTES - 2) / 3)}a`
    const result = learningContextReadResult({
      capabilityID: "learner_goal_query",
      title: "Exact lazy read",
      metadata: { owner: "test" },
      value,
      itemCount: MAX_LAZY_ITEMS,
    })

    expect(utf8Bytes(JSON.stringify(value))).toBe(MAX_LAZY_BYTES + 1)
    expect(result.metadata).toMatchObject({
      status: "over_budget",
      reason: "byte_limit",
      observedBytes: MAX_LAZY_BYTES + 1,
      ceilingBytes: MAX_LAZY_BYTES,
      truncated: false,
    })
    expect(result.output).not.toContain(value)
    expect(result.metadata).not.toHaveProperty("outputPath")
  })

  test("rejects a sixty-fifth typed item even when its JSON body is small", () => {
    const result = learningContextReadResult({
      capabilityID: "learner_goal_query",
      title: "Exact lazy read",
      metadata: { owner: "test" },
      value: { entries: [] },
      itemCount: MAX_LAZY_ITEMS + 1,
    })

    expect(result.metadata).toMatchObject({
      status: "over_budget",
      reason: "item_limit",
      observedItems: MAX_LAZY_ITEMS + 1,
      ceilingItems: MAX_LAZY_ITEMS,
      truncated: false,
    })
  })

  test("replaces an oversized inspection in both output and metadata with one bounded typed failure", () => {
    const input = {
      capabilityID: "learner_goal_query" as const,
      title: "Goal inspection",
      metadata: { action: "get", status: "available" },
      value: { goalID: "gol_test", revisionID: "glr_test", version: 1 },
      itemCount: 1,
    }
    const base = learningContextReadResult(input)
    const inspection: LearningInspection.Projection = {
      schemaVersion: 1,
      status: "available",
      source: {
        learnerHomeID: "lhm_test",
        partID: "prt_test",
        tool: "learner_goal_query",
        action: "get",
        assistantMessageID: "msg_test",
        turnID: "trn_test" as LearningInspection.Projection["source"]["turnID"],
        inputID: "tri_test" as LearningInspection.Projection["source"]["inputID"],
        currentFrontier: { sequence: 1, time: 1 },
      },
      owner: {
        kind: "learner_goal",
        ...LearningInspectionOwner.inspectionOwner("learner_goal", "exact current Goal head", [
          { label: "oversized", value: "x".repeat(MAX_LAZY_BYTES) },
        ]),
        capabilityID: "learner_goal_query",
        action: "get",
        records: [{ ownerKind: "learner_goal", recordID: "gol_test", revisionID: "glr_test", revisionVersion: 1 }],
      },
      lineage: {
        coverage: "complete_page",
        scope: { status: "complete", operationCount: 0, terminalSealedCount: 0 },
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
    const result = attachInspection(base, input, inspection)
    expect(JSON.parse(result.output)).toMatchObject({ status: "inspection_output_over_budget" })
    const metadataInspection = result.metadata[LearningInspection.METADATA_KEY]
    expect(LearningInspection.isProjection(metadataInspection)).toBeTrue()
    expect(metadataInspection).toMatchObject({
      status: "integrity_validation_unavailable",
      owner: { records: [], facts: [] },
      lineage: { items: [], contextCoverage: [] },
      deletionAudit: { items: [] },
      administrativeHistory: { members: [], laterLocalMessages: [] },
    })
    expect(utf8Bytes(JSON.stringify(result.metadata))).toBeLessThan(MAX_LAZY_BYTES)
  })

  test("preserves an owner-produced not-found result instead of relabelling an empty record projection unsupported", () => {
    const input = {
      capabilityID: "learner_goal_query" as const,
      title: "Goal not found",
      metadata: { action: "get", found: false },
      value: { goal: null },
      itemCount: 0,
    }
    const inspection: LearningInspection.Projection = {
      schemaVersion: 1,
      status: "read_shape_unsupported",
      source: {
        learnerHomeID: "lhm_test",
        partID: "prt_test",
        tool: "learner_goal_query",
        action: "get",
        assistantMessageID: "msg_test",
        turnID: "trn_test" as LearningInspection.Projection["source"]["turnID"],
        inputID: "tri_test" as LearningInspection.Projection["source"]["inputID"],
        currentFrontier: { sequence: 1, time: 1 },
      },
      owner: {
        kind: "learner_goal",
        ...LearningInspectionOwner.inspectionOwner("learner_goal", "exact current Goal head"),
        capabilityID: "learner_goal_query",
        action: "get",
        records: [],
      },
      lineage: {
        coverage: "non_atomic_search_incomplete",
        scope: { status: "continued_fresh_cut", operationCount: 0, terminalSealedCount: 0 },
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
    const result = attachInspection(learningContextReadResult(input), input, inspection)
    expect(result.metadata[LearningInspection.METADATA_KEY]).toMatchObject({ status: "not_found" })
  })

  test("honors an already-aborted Tool context before starting the inspection transaction work", async () => {
    const abort = new AbortController()
    abort.abort()
    let touched = false
    const tx = new Proxy(
      {},
      {
        get() {
          touched = true
          throw new Error("aborted inspection touched the database")
        },
      },
    )
    const exit = await Effect.runPromise(
      learningInspectionReadResult(
        tx as never,
        {
          capabilityID: "learner_goal_query",
          title: "aborted",
          metadata: { action: "get" },
          value: { goalID: "gol_abort", revisionID: "glr_abort", version: 1 },
          itemCount: 1,
        },
        {
          sessionID: "ses_abort" as never,
          messageID: "msg_abort" as never,
          callID: "call_abort",
          agent: "repa",
          abort: abort.signal,
          interaction: {
            turnID: "trn_abort" as never,
            inputID: "tri_abort" as never,
            assistantMessageID: "msg_abort" as never,
            candidate: { partID: "prt_abort" as never, callID: "call_abort", emissionOrdinal: 0 },
            permission: { ruleset: [], authority: [] },
          },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
        LearningInspectionOwner.inspectionOwner("learner_goal", "exact current Goal head"),
      ).pipe(Effect.exit),
    )
    expect(Exit.isFailure(exit)).toBeTrue()
    expect(touched).toBeFalse()
  })

  test("projects production material action values and fences supplemental inspection objects", () => {
    const artifact = { id: "art_material_action", source: { currentRevisionID: "arv_material_action" } }
    const artifactRevision = {
      id: "arv_material_action",
      recordedArtifactID: "art_material_action",
      effectiveArtifactID: "art_material_action",
    }
    const representation = { id: "rpr_material_action" }
    const map = { id: "mmp_material_action", disposition: { version: 2 } }
    const selector = { id: "msl_material_action", mapID: "mmp_material_action" }
    const alignment = {
      id: "mca_material_action",
      mapID: "mmp_material_action",
      selectorID: "msl_must_not_win",
      disposition: { version: 4 },
    }
    const cases = [
      {
        action: "get_artifact",
        value: artifact,
        expected: ["art_material_action", "arv_material_action", 0],
      },
      {
        action: "list_artifacts",
        value: artifact,
        expected: ["art_material_action", "arv_material_action", 0],
      },
      {
        action: "get_artifact_revision",
        value: artifactRevision,
        expected: ["art_material_action", "arv_material_action", 0],
      },
      {
        action: "list_artifact_revisions",
        value: artifactRevision,
        expected: ["art_material_action", "arv_material_action", 0],
      },
      {
        action: "get_representation",
        value: representation,
        expected: ["rpr_material_action", "rpr_material_action", 0],
      },
      {
        action: "get_map",
        value: map,
        expected: ["mmp_material_action", "mmp_material_action", 2],
      },
      {
        action: "list_maps",
        value: map,
        expected: ["mmp_material_action", "mmp_material_action", 2],
      },
      {
        action: "list_map_successors",
        value: map,
        expected: ["mmp_material_action", "mmp_material_action", 2],
      },
      {
        action: "get_selector",
        value: selector,
        expected: ["mmp_material_action", "msl_material_action", 0],
      },
      {
        action: "list_selectors",
        value: selector,
        expected: ["mmp_material_action", "msl_material_action", 0],
      },
      {
        action: "list_outline_nodes",
        value: { id: "mon_material_action", mapID: "mmp_material_action" },
        expected: ["mmp_material_action", "mon_material_action", 0],
      },
      {
        action: "list_map_dispositions",
        value: { version: 3, disposition: "withdrawn" },
        scope: { mapID: "mmp_material_action" },
        expected: ["mmp_material_action", "mmp_material_action", 3],
      },
      {
        action: "get_alignment",
        value: alignment,
        expected: ["mca_material_action", "mca_material_action", 4],
      },
      ...[
        "list_alignments_for_map",
        "list_alignments_for_selector",
        "list_alignments_for_membership",
        "list_alignment_successors",
      ].map((action) => ({
        action,
        value: alignment,
        expected: ["mca_material_action", "mca_material_action", 4] as const,
      })),
      {
        action: "list_alignment_dispositions",
        value: { version: 5, disposition: "active" },
        scope: { alignmentID: "mca_material_action" },
        expected: ["mca_material_action", "mca_material_action", 5],
      },
    ] as const

    cases.forEach(({ action, value, expected, ...rest }) => {
      expect(
        TurnLineage.readProjection(
          "learning_material_query",
          materialLineageValue(action, value, "scope" in rest ? rest.scope : undefined),
        ),
      ).toMatchObject({
        resultSchemaVersion: 2,
        records: [
          {
            ownerKind: "learning_material",
            recordID: expected[0],
            revisionID: expected[1],
            revisionVersion: expected[2],
          },
        ],
      })
    })
    expect(() => materialLineageValue("future_unregistered_action", {})).toThrow(
      "Unsupported learning-material lineage action future_unregistered_action",
    )

    const pinnedArtifact = TurnLineage.readProjection(
      "learning_material_query",
      materialLineageValue("pinned_learning_context", {
        type: "available",
        value: {
          alignment,
          map,
          selector,
          target: {
            type: "artifact",
            recorded: { effectiveArtifactID: "art_recorded", revisionID: "arv_recorded" },
            current: {
              type: "available",
              value: { effectiveArtifactID: "art_current", currentRevisionID: "arv_current" },
            },
          },
        },
      }),
    )
    expect(pinnedArtifact).toMatchObject({ resultSchemaVersion: 2, outcome: "available" })
    expect(pinnedArtifact.records).toHaveLength(5)
    expect(pinnedArtifact.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recordID: "mca_material_action", revisionID: "mca_material_action" }),
        expect.objectContaining({ recordID: "mmp_material_action", revisionID: "mmp_material_action" }),
        expect.objectContaining({ recordID: "mmp_material_action", revisionID: "msl_material_action" }),
        expect.objectContaining({ recordID: "art_recorded", revisionID: "arv_recorded" }),
        expect.objectContaining({ recordID: "art_current", revisionID: "arv_current" }),
      ]),
    )

    const pinnedRepresentation = TurnLineage.readProjection(
      "learning_material_query",
      materialLineageValue("pinned_learning_context", {
        type: "available",
        value: {
          alignment,
          map,
          selector,
          target: {
            type: "representation",
            metadata: {
              representation,
              currentArtifact: { effectiveArtifactID: "art_rep_current", currentRevisionID: "arv_rep_current" },
            },
          },
        },
      }),
    )
    expect(pinnedRepresentation).toMatchObject({ resultSchemaVersion: 2, outcome: "available" })
    expect(pinnedRepresentation.records).toHaveLength(5)
    expect(pinnedRepresentation.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recordID: "rpr_material_action", revisionID: "rpr_material_action" }),
        expect.objectContaining({ recordID: "art_rep_current", revisionID: "arv_rep_current" }),
      ]),
    )

    const result = learningContextReadResult({
      capabilityID: "learning_material_query",
      title: "Material inspection",
      metadata: { action: "get_selector" },
      value: {
        value: { id: "msl_material_action", mapID: "mmp_material_action" },
        inspection: {
          lineageKind: "material_alignment",
          mapID: "mmp_forged_supplement",
          alignmentID: "mca_forged_supplement",
          version: 99,
        },
      },
      lineageValue: materialLineageValue("get_selector", {
        id: "msl_material_action",
        mapID: "mmp_material_action",
      }),
      itemCount: 1,
    })
    expect(result.metadata.repaLineage.records).toEqual([
      {
        ownerKind: "learning_material",
        recordID: "mmp_material_action",
        revisionID: "msl_material_action",
        revisionVersion: 0,
      },
    ])
    expect(result.metadata.repaLineage.resultSchemaVersion).toBe(2)
  })
})

describe("classifyMaterialFailure", () => {
  const revisionID = Representation.createRevisionID()

  test("preserves typed Gate 13 grant, stale, authorization, and budget outcomes", () => {
    expect(
      classifyMaterialFailure(
        new Representation.CurrentUseDeniedError({
          revisionID,
          effectiveArtifactID: "art_gate18",
          reason: "grant_required",
        }),
      ),
    ).toBe("grant_required")
    expect(
      classifyMaterialFailure(
        new Representation.CurrentUseDeniedError({
          revisionID,
          effectiveArtifactID: "art_gate18",
          reason: "grant_revoked",
        }),
      ),
    ).toBe("stale")
    expect(
      classifyMaterialFailure(
        new Representation.ReturnBudgetExceededError({ revisionID, requiredBytes: 33_000, ceilingBytes: 32_768 }),
      ),
    ).toBe("over_budget")
    expect(
      classifyMaterialFailure(
        new MaterialMap.PreparationError({ code: "source_provenance", detail: "fresh authority required" }),
      ),
    ).toBe("not_authorized")
    expect(
      classifyMaterialFailure(
        new MaterialMap.PreparationError({ code: "witness_mismatch", detail: "selector changed" }),
      ),
    ).toBe("stale")
    expect(
      classifyMaterialFailure(
        new ContentRoot.PathError({ path: "C:\\material.pdf", reason: "budget_exceeded", detail: "too large" }),
      ),
    ).toBe("over_budget")
  })

  test("does not depend on tagged-error stringification", () => {
    expect(
      classifyMaterialFailure(
        new MaterialMap.PreparationError({ code: "source_unavailable", detail: "stored content missing" }),
      ),
    ).toBe("unavailable")
    expect(classifyMaterialFailure(new Error("not_authorized: workspace changed"))).toBe("not_authorized")
  })
})
