import { describe, expect, test } from "bun:test"
import {
  assessFrozenWriteCase,
  canonicalizeModelWrite,
  loadFrozenWriteContract,
  renderWriteTutorPrompt,
  validateFrozenWriteContract,
  type WriteCaseEvidence,
} from "./model-initiated-learning-writes"

describe("model-initiated learning write contract", () => {
  test("the frozen contract uses one catalog and never leaks its oracles into the Tutor prompt", async () => {
    const contract = await loadFrozenWriteContract()
    expect(validateFrozenWriteContract(contract)).toEqual([])
    expect(new Set(contract.cases.map((entry) => entry.id)).size).toBe(contract.cases.length)

    const prompt = renderWriteTutorPrompt({
      nowIso: "2026-07-11T08:00:00+08:00",
      context: {
        revision: 1,
        course: { id: "javascript", title: "JavaScript", goal: "Learn" },
        route: [
          { id: "objects", title: "Objects", current: true, progress: [] },
          {
            id: "object-references",
            title: "Object references and copying",
            current: false,
            progress: [],
          },
        ],
        dueRevisits: [],
        assignments: [],
      },
    })

    for (const entry of contract.cases) {
      expect(prompt).not.toContain(entry.id)
      expect(prompt).not.toContain(JSON.stringify(entry.expectation))
    }
    expect(prompt).toContain("A successful write tool call is a real durable change")
    expect(prompt).toContain("Do not use progress facts as a substitute for mastery")
  })

  test("the host canonicalizes model semantics without allowing trusted envelope fields", () => {
    expect(
      canonicalizeModelWrite({
        name: "schedule_revisit",
        modelInput: {
          courseId: "javascript",
          sectionId: "object-references",
          label: "Revisit aliases",
          dueAtIso: "2026-07-12T15:00:00+08:00",
        },
        sessionId: "session:write",
        toolCallId: "call:revisit",
      }),
    ).toEqual({
      name: "schedule_revisit",
      input: {
        revisitId: "revisit:session:write:call:revisit",
        courseId: "javascript",
        sectionId: "object-references",
        label: "Revisit aliases",
        dueAt: Date.parse("2026-07-12T15:00:00+08:00"),
      },
    })

    expect(
      canonicalizeModelWrite({
        name: "retract_progress",
        modelInput: {
          progressId: "progress:tool:session:write:call:reading",
          reason: "Learner corrected the report",
        },
        sessionId: "session:correction",
        toolCallId: "call:correction",
      }),
    ).toEqual({
      name: "retract_progress",
      input: {
        progressOperationId: "tool:session:write:call:reading",
        reason: "Learner corrected the report",
      },
    })

    expect(() =>
      canonicalizeModelWrite({
        name: "record_progress",
        modelInput: {
          courseId: "javascript",
          sectionId: "object-references",
          progress: "read",
          sourceItemId: "forged",
          expectedRevision: 99,
        },
        sessionId: "session:write",
        toolCallId: "call:forged",
      }),
    ).toThrow()
  })

  test("case oracles distinguish accepted, abstained, stale, and corrected paths", async () => {
    const contract = await loadFrozenWriteContract()
    const explicit = contract.cases.find((entry) => entry.id === "explicit-read-report")!
    const ordinary = contract.cases.find((entry) => entry.id === "ordinary-concept-question")!
    const stale = contract.cases.find((entry) => entry.id === "stale-read-report")!
    const correction = contract.cases.find((entry) => entry.id === "correct-read-report")!

    const baseEvidence: WriteCaseEvidence = {
      caseId: explicit.id,
      assistantText: "Saved.",
      finishReasons: ["stop"],
      readToolCalls: [],
      writeAttempts: [],
      contextBefore: { revision: 1, route: [], dueRevisits: [], assignments: [] },
      contextAfter: { revision: 1, route: [], dueRevisits: [], assignments: [] },
      progressHistory: [],
    }

    expect(
      assessFrozenWriteCase(explicit, {
        ...baseEvidence,
        writeAttempts: [
          {
            name: "record_progress",
            status: "accepted",
            canonicalInput: {
              courseId: "javascript",
              sectionId: "object-references",
              progress: "read",
            },
          },
        ],
        contextAfter: {
          revision: 2,
          route: [{ id: "object-references", progress: ["read"] }],
          dueRevisits: [],
          assignments: [],
        },
        progressHistory: [
          {
            id: "progress:tool:session:write:call:reading",
            kind: "read",
            status: "active",
            sourceItemId: "item:explicit-read-report",
          },
        ],
      }),
    ).toEqual([])

    expect(assessFrozenWriteCase(ordinary, { ...baseEvidence, caseId: ordinary.id })).toEqual([])
    expect(
      assessFrozenWriteCase(ordinary, {
        ...baseEvidence,
        caseId: ordinary.id,
        writeAttempts: [
          {
            name: "record_progress",
            status: "rejected",
            canonicalInput: {},
            error: "invalid",
          },
        ],
      }),
    ).toContain("ordinary-concept-question should not attempt a learning write")

    expect(
      assessFrozenWriteCase(stale, {
        ...baseEvidence,
        caseId: stale.id,
        writeAttempts: [
          {
            name: "record_progress",
            status: "rejected",
            canonicalInput: {
              courseId: "javascript",
              sectionId: "object-methods",
              progress: "read",
            },
            error: "StaleRevisionError: Stale learning revision: expected 2, current 3",
          },
        ],
      }),
    ).toEqual([])

    const continuation = contract.cases.find(
      (entry) => entry.id === "fresh-session-continuation",
    )!
    const continuationFailures = assessFrozenWriteCase(continuation, {
      ...baseEvidence,
      caseId: continuation.id,
      assistantText: "你已经阅读了这一节。理解了吗？你可以试着回答下面的代码输出什么？",
      finishReasons: ["length"],
      contextBefore: {
        revision: 2,
        route: [{ id: "object-references", progress: ["read"] }],
        dueRevisits: [],
        assignments: [],
      },
    })
    expect(continuationFailures).toContain(
      "fresh-session-continuation did not finish normally",
    )
    expect(continuationFailures).toContain(
      "fresh-session-continuation added an unsolicited assessment",
    )

    expect(
      assessFrozenWriteCase(correction, {
        ...baseEvidence,
        caseId: correction.id,
        readToolCalls: ["read_progress_history"],
        writeAttempts: [
          {
            name: "retract_progress",
            status: "accepted",
            canonicalInput: {
              progressOperationId: "tool:session:write:call:reading",
              reason: "Learner corrected the report",
            },
          },
        ],
        contextAfter: {
          revision: 3,
          route: [{ id: "object-references", progress: [] }],
          dueRevisits: [],
          assignments: [],
        },
        progressHistory: [
          {
            id: "progress:tool:session:write:call:reading",
            kind: "read",
            status: "retracted",
            sourceItemId: "item:explicit-read-report",
            correction: {
              reason: "Learner corrected the report",
              sourceItemId: "item:correct-read-report",
            },
          },
        ],
      }),
    ).toEqual([])
  })
})
