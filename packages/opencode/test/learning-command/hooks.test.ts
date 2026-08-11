import { ArtifactSchema } from "@opencode-ai/core/artifact/schema"
import { AdvisoryPlanSuggestion } from "@opencode-ai/core/advisory-plan-suggestion"
import { ContentRootSchema } from "@opencode-ai/core/content-root/schema"
import { Course } from "@opencode-ai/core/course"
import { FutureAttention } from "@opencode-ai/core/future-attention"
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { LearnerStateJudgment } from "@opencode-ai/core/learner-state-judgment"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { Plugin } from "@/plugin"
import {
  normalizeAdvisoryPlanSuggestion,
  normalizeFutureAttention,
  normalizeLearnerStateJudgment,
} from "@/learning-command/input"
import { MessageID, SessionID } from "@/session/schema"
import { observeLearningCommandResult, prepareLearningCommandCall } from "@/session/tools"
import { SessionProcessor } from "@/session/processor"
import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"

const courseID = Schema.decodeUnknownSync(Course.CourseID)("crs_00000000000000000000000000")
const viewID = Schema.decodeUnknownSync(Course.ViewID)("cvw_00000000000000000000000000")
const revisionID = Schema.decodeUnknownSync(Course.RevisionID)("cvr_00000000000000000000000000")
const itemID = Schema.decodeUnknownSync(Course.ItemID)("cit_00000000000000000000000000")
const canonical = {
  courseID,
  revisionID,
  expectedCourseVersion: 0,
  expectedSelectionRevisionID: null,
  expectedSelectionVersion: 0,
  expectedViewVersion: 0,
  expectedRevisionVersion: 0,
}
const registration = Object.freeze({
  turnID: Turn.ID.create(),
  inputID: Turn.InputID.create(),
  partID: SessionV1.PartID.ascending("prt_learning_hook"),
  callID: "call-learning-hook",
  emissionOrdinal: 0,
  sessionID: SessionID.make("ses_learning_hook"),
  parentUserMessageID: MessageID.make("msg_learning_hook_user"),
  assistantMessageID: MessageID.make("msg_learning_hook_assistant"),
}) satisfies SessionProcessor.RegisteredToolCall

describe("learning-command hooks", () => {
  test("runs the before observer before admission without allowing it to change canonical input", async () => {
    const order: string[] = []
    let prepared: unknown
    const plugin = mockPlugin(((name: unknown, _input: unknown, output: unknown) =>
      Effect.sync(() => {
        expect(name).toBe("tool.execute.before")
        order.push("before")
        const observed = output as { args: { expectedCourseVersion: number } }
        observed.args.expectedCourseVersion = 99
        return output
      })) as Plugin.Interface["trigger"])

    await Effect.runPromise(
      prepareLearningCommandCall(
        plugin,
        LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        canonical,
        registration,
        (input) =>
          Effect.sync(() => {
            order.push("prepare")
            prepared = input
          }),
      ),
    )

    expect(order).toEqual(["before", "prepare"])
    expect(prepared).toEqual(canonical)
    expect(canonical.expectedCourseVersion).toBe(0)
  })

  test("isolates a failing after observer from the exact committed result", async () => {
    const output = {
      title: "Course view revision acceptance",
      metadata: { durablySettled: true, outcome: "applied" },
      output: '{"outcome":"applied"}',
    }
    const plugin = mockPlugin(((_name: unknown, _input: unknown, observed: unknown) =>
      Effect.gen(function* () {
        const clone = observed as { title: string; metadata: { outcome: string }; output: string }
        clone.title = "tampered"
        clone.metadata.outcome = "error"
        clone.output = "tampered"
        return yield* Effect.die(new Error("observer failed after durable settlement"))
      })) as Plugin.Interface["trigger"])

    const result = await Effect.runPromise(
      observeLearningCommandResult(
        plugin,
        LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        registration.sessionID,
        registration.callID,
        canonical,
        output,
      ),
    )

    expect(result).toBe(output)
    expect(result).toEqual({
      title: "Course view revision acceptance",
      metadata: { durablySettled: true, outcome: "applied" },
      output: '{"outcome":"applied"}',
    })
  })

  test("normalizes the closed representation command before the observer and admission", async () => {
    const input = {
      effectiveArtifactID: ArtifactSchema.createArtifactID(),
      sourceRevisionID: ArtifactSchema.createRevisionID(),
      contentRootID: ContentRootSchema.createContentRootID(),
      relativePath: "folder/lecture.pdf",
    }
    let prepared: unknown
    const plugin = mockPlugin(((_name: unknown, _input: unknown, output: unknown) =>
      Effect.sync(() => {
        const observed = output as { args: { relativePath: string } }
        observed.args.relativePath = "tampered.pdf"
        return output
      })) as Plugin.Interface["trigger"])

    await Effect.runPromise(
      prepareLearningCommandCall(
        plugin,
        LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
        input,
        registration,
        (canonical) => Effect.sync(() => (prepared = canonical)),
      ),
    )

    expect(prepared).toEqual({ ...input, relativePath: "folder\\lecture.pdf" })
    expect(input.relativePath).toBe("folder/lecture.pdf")
  })

  test("keeps the FutureAttention model input recursively closed and UTF-8 bounded", () => {
    const input = futureAttentionInput("Explain the semaphore invariant")
    expect(normalizeFutureAttention(input)).toEqual(input)

    expect(() =>
      normalizeFutureAttention({
        ...input,
        operations: [
          {
            ...input.operations[0],
            concern: { ...input.operations[0].concern, unsupportedControl: true },
          },
        ],
      }),
    ).toThrow()
    expect(() => normalizeFutureAttention(futureAttentionInput("界".repeat(257)))).toThrow()
    expect(new TextEncoder().encode("界".repeat(256))).toHaveLength(FutureAttention.MAX_PURPOSE_BYTES)
    expect(normalizeFutureAttention(futureAttentionInput("界".repeat(256))).operations).toHaveLength(1)
  })

  test("keeps the learner-state provider boundary at eight anchors and sixteen bases while admitting evidence v0", () => {
    const maximum = learnerStateJudgmentInput(8, 16)
    const normalized = normalizeLearnerStateJudgment(maximum)
    if (normalized.operation !== "create") throw new Error("Expected the maximum provider fixture to remain a create")
    expect(normalized.snapshot.subject.scope).toMatchObject({ type: "anchored" })
    expect(normalized.snapshot.exactBasisRefs).toHaveLength(LearnerStateJudgment.MAX_BASIS_REFS)
    expect(normalized.snapshot.exactBasisRefs).toContainEqual(
      expect.objectContaining({ type: "learner_response_evidence_revision", version: 0 }),
    )

    expect(() => normalizeLearnerStateJudgment(learnerStateJudgmentInput(9, 16))).toThrow()
    expect(() => normalizeLearnerStateJudgment(learnerStateJudgmentInput(8, 17))).toThrow()
  })

  test("keeps advisory change sets at eight ordered intents with eight anchors and sixteen bases", () => {
    const maximum = advisoryPlanSuggestionInput(8, 8, 16)
    const normalized = normalizeAdvisoryPlanSuggestion(maximum)
    expect(normalized.intents).toHaveLength(AdvisoryPlanSuggestion.MAX_INTENTS)
    expect(normalized.intents.map((item) => item.operationOrdinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    const first = normalized.intents[0]
    if (!first || first.operation !== "create") throw new Error("Expected the maximum advisory fixture to create")
    expect(first.snapshot.retrievalScope.type).toBe("anchored")
    if (first.snapshot.retrievalScope.type !== "anchored") throw new Error("Expected anchored retrieval")
    expect(first.snapshot.retrievalScope.anchors).toHaveLength(AdvisoryPlanSuggestion.MAX_RETRIEVAL_ANCHORS)
    expect(first.snapshot.exactBasisRefs).toHaveLength(AdvisoryPlanSuggestion.MAX_BASIS_REFS)

    expect(() => normalizeAdvisoryPlanSuggestion(advisoryPlanSuggestionInput(9, 8, 16))).toThrow()
    expect(() => normalizeAdvisoryPlanSuggestion(advisoryPlanSuggestionInput(8, 9, 16))).toThrow()
    expect(() => normalizeAdvisoryPlanSuggestion(advisoryPlanSuggestionInput(8, 8, 17))).toThrow()
    expect(() =>
      normalizeAdvisoryPlanSuggestion({
        ...maximum,
        intents: maximum.intents.map((intent, index) =>
          index === 7 ? { ...intent, operationOrdinal: 6, createOrdinal: 6 } : intent,
        ),
      }),
    ).toThrow()
  })
})

function mockPlugin(trigger: Plugin.Interface["trigger"]): Plugin.Interface {
  return {
    trigger,
    init: () => Effect.void,
    list: () => Effect.succeed([]),
  }
}

function futureAttentionInput(purpose: string) {
  return {
    operations: [
      {
        type: "create" as const,
        concern: {
          purpose,
          source: { type: "tutor_initiated" as const },
          target: {
            endpoint: { courseID, viewID, revisionID, itemID },
            selection: { type: "explicit_exact" as const },
          },
          notBefore: {
            sourceExpression: "tomorrow morning",
            localDateTime: "2026-08-08T09:00:00",
            timeZone: { type: "fixed_offset" as const, offsetMinutes: 480 },
          },
          serviceTiming: "after_creation" as const,
        },
      },
    ],
  }
}

function learnerStateJudgmentInput(anchorCount: number, basisCount: number) {
  const source = "Remember this as a fallible teaching judgment."
  const mapID = MaterialMap.createMapID()
  const materialRefs = Array.from({ length: 16 }, () => ({
    type: "material_selector" as const,
    mapID,
    selectorID: MaterialMap.createSelectorID(),
  }))
  return {
    operation: "create" as const,
    cause: {
      type: "interpreted_learner_report" as const,
      excerpt: { text: source, startByte: 0, endByte: new TextEncoder().encode(source).byteLength },
    },
    snapshot: {
      subject: {
        label: "Semaphore boundary reasoning",
        scope: { type: "anchored" as const, anchors: materialRefs.slice(0, anchorCount) },
      },
      judgmentBody: "Can state the bound; applying it remains uncertain.",
      exactBasisRefs: [
        ...materialRefs.slice(0, basisCount - 1),
        {
          type: "learner_response_evidence_revision" as const,
          recordID: LearnerResponseEvidence.createRecordID(),
          revisionID: LearnerResponseEvidence.createRevisionID(),
          version: 0,
        },
      ],
      uncertaintyAndLimits: "Whole-judgment sources remain fallible.",
      basisScope: "whole_judgment" as const,
    },
  }
}

function advisoryPlanSuggestionInput(intentCount: number, anchorCount: number, basisCount: number) {
  const source = "Use examples first, then adapt this advice naturally when it stops helping."
  const mapID = MaterialMap.createMapID()
  const materialRefs = Array.from({ length: 17 }, () => ({
    type: "material_selector" as const,
    mapID,
    selectorID: MaterialMap.createSelectorID(),
  }))
  const snapshot = {
    learnerVisibleScope: "Continuation practice across the next few Sessions",
    retrievalScope: {
      type: "anchored" as const,
      anchors: materialRefs.slice(0, anchorCount).map((ref) => ({
        stableOwnerKey: { type: "material_selector" as const, mapID: ref.mapID, selectorID: ref.selectorID },
        exactBoundRef: ref,
      })),
    },
    purpose: "Help later teaching continue without a rigid schedule.",
    directorySummary: "Examples first, then one guided attempt.",
    body: "Work through one concrete example, then try one guided continuation; keep later steps provisional.",
    exactBasisRefs: materialRefs.slice(0, basisCount),
    assumptionsAndUncertainty: "Fallible Tutor advice; revise naturally when it stops helping.",
  }
  return {
    cause: {
      type: "responsive_tutor_proposal" as const,
      excerpt: { text: source, startByte: 0, endByte: new TextEncoder().encode(source).byteLength },
      rationale: "Preserve useful, source-bearing advice for later teaching.",
    },
    intents: Array.from({ length: intentCount }, (_, operationOrdinal) => ({
      operation: "create" as const,
      operationOrdinal,
      createOrdinal: operationOrdinal,
      snapshot,
    })),
  }
}
