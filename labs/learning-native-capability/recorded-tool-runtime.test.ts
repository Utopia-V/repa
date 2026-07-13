import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openLearningLab } from "./learning-layer"
import {
  executeRecordedLearningTool,
  reprojectSettledLearningTool,
  type RecordedLearningToolEvent,
  type RecordedLearningToolCallEvent,
} from "./recorded-tool-runtime"

const temporaryDirectories: string[] = []
const openedLabs: Array<{ close(): void }> = []

afterEach(async () => {
  for (const lab of openedLabs.splice(0).reverse()) {
    try {
      lab.close()
    } catch {
      // A recovery test may close a handle before reopening the same file.
    }
  }
  Bun.gc(true)
  await Bun.sleep(20)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  }
})

describe("recorded learning tool runtime", () => {
  test("the runtime records a tool call and owns provenance, revision, and operation identity", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-recorded-learning-tool-"))
    temporaryDirectories.push(directory)
    const lab = openLearningLab(join(directory, "learning.sqlite"))
    openedLabs.push(lab)

    lab.apply({
      operationId: "op:init-tool-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Learn the language",
        sections: [{ id: "objects", title: "Objects" }],
      },
    })
    lab.appendSessionItem({
      itemId: "item:tool-explanation",
      sessionId: "session:tool-runtime",
      role: "assistant",
      content: "Objects are assigned and passed by reference value.",
      at: 1_100,
    })

    const events: RecordedLearningToolEvent[] = []
    const result = executeRecordedLearningTool({
      lab,
      call: {
        callId: "call:record-explanation",
        name: "record_progress",
        input: {
          courseId: "javascript",
          sectionId: "objects",
          progress: "explained",
        },
      },
      runtime: {
        sessionId: "session:tool-runtime",
        sourceItemId: "item:tool-explanation",
        expectedRevision: 1,
        at: 1_200,
        record: (event) => events.push(event),
      },
    })

    expect(result).toEqual({ revision: 2, replayed: false })
    expect(events.map((event) => event.type)).toEqual(["tool-call", "tool-result"])
    expect(events[0]).toMatchObject({
      type: "tool-call",
      callId: "call:record-explanation",
      name: "record_progress",
    })
    expect(lab.buildCurrentContext({ now: 1_300 }).route[0]?.progress).toEqual(["explained"])

    lab.appendSessionItem({
      itemId: "item:tool-answer",
      sessionId: "session:tool-runtime",
      role: "user",
      content: "The two variables refer to the same object.",
      at: 1_300,
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "call:record-attempt",
        name: "record_attempt",
        input: {
          attemptId: "attempt:objects-1",
          courseId: "javascript",
          sectionId: "objects",
          outcome: "correct",
          assistance: "independent",
        },
      },
      runtime: {
        sessionId: "session:tool-runtime",
        sourceItemId: "item:tool-answer",
        expectedRevision: 2,
        at: 1_400,
        record: (event) => events.push(event),
      },
    })
    lab.appendSessionItem({
      itemId: "item:assignment-report",
      sessionId: "session:tool-runtime",
      role: "user",
      content: "I have an object model report due at 2100.",
      at: 1_550,
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "call:schedule-revisit",
        name: "schedule_revisit",
        input: {
          revisitId: "revisit:objects-1",
          courseId: "javascript",
          sectionId: "objects",
          label: "Revisit object aliasing",
          dueAt: 2_000,
          sourceAttemptId: "attempt:objects-1",
        },
      },
      runtime: {
        sessionId: "session:tool-runtime",
        sourceItemId: "item:tool-answer",
        expectedRevision: 3,
        at: 1_500,
        record: (event) => events.push(event),
      },
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "call:record-assignment",
        name: "record_assignment",
        input: {
          assignmentId: "assignment:objects-report",
          courseId: "javascript",
          title: "Object model report",
          dueAt: 2_100,
        },
      },
      runtime: {
        sessionId: "session:tool-runtime",
        sourceItemId: "item:assignment-report",
        expectedRevision: 4,
        at: 1_600,
        record: (event) => events.push(event),
      },
    })

    const laterContext = lab.buildCurrentContext({ now: 2_200, availableMinutes: 30 })
    expect(laterContext.dueRevisits[0]?.sourceAttemptId).toBe("attempt:objects-1")
    expect(laterContext.assignments[0]).toMatchObject({
      id: "assignment:objects-report",
      state: "overdue",
    })
    expect(JSON.stringify(laterContext.assignments)).not.toContain("learningValue")
    expect(JSON.stringify(laterContext.assignments)).not.toContain("goalRelevance")
    expect(lab.readAttempt("attempt:objects-1").outcome).toBe("correct")
    expect(lab.readAssignment("assignment:objects-report").sourceItemId).toBe(
      "item:assignment-report",
    )

    expect(() =>
      executeRecordedLearningTool({
        lab,
        call: {
          callId: "call:forged-progress",
          name: "record_progress",
          input: {
            courseId: "javascript",
            sectionId: "objects",
            progress: "followed",
            sourceItemId: "item:forged",
            expectedRevision: 99,
            mastery: 1,
          },
        },
        runtime: {
          sessionId: "session:tool-runtime",
          sourceItemId: "item:tool-explanation",
          expectedRevision: 5,
          at: 1_700,
          record: (event) => events.push(event),
        },
      }),
    ).toThrow("Unexpected record_progress input")
    expect(events.slice(-2).map((event) => event.type)).toEqual(["tool-call", "tool-error"])

    expect(() =>
      executeRecordedLearningTool({
        lab,
        call: {
          callId: "call:assistant-followed",
          name: "record_progress",
          input: {
            courseId: "javascript",
            sectionId: "objects",
            progress: "followed",
          },
        },
        runtime: {
          sessionId: "session:tool-runtime",
          sourceItemId: "item:tool-explanation",
          expectedRevision: 5,
          at: 1_800,
          record: (event) => events.push(event),
        },
      }),
    ).toThrow("Learner progress source must be learner or tool output")
    expect(lab.buildCurrentContext({ now: 2_300 }).revision).toBe(5)
  })

  test("a durable tool settlement survives result projection failure and reprojects after reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-recorded-learning-tool-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")
    let lab = openLearningLab(databasePath)
    openedLabs.push(lab)

    lab.apply({
      operationId: "op:init-settlement-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Learn the language",
        sections: [{ id: "objects", title: "Objects" }],
      },
    })
    lab.appendSessionItem({
      itemId: "item:settlement-explanation",
      sessionId: "session:settlement",
      role: "assistant",
      content: "An object variable contains a reference value.",
      at: 1_100,
    })

    const durableEvents: RecordedLearningToolEvent[] = []
    let failResultProjection = true
    const record = (event: RecordedLearningToolEvent) => {
      if (event.type === "tool-result" && failResultProjection) {
        throw new Error("durable event sink failed")
      }
      if (!durableEvents.some((existing) => existing.eventId === event.eventId)) {
        durableEvents.push(structuredClone(event))
      }
    }

    expect(() =>
      executeRecordedLearningTool({
        lab,
        call: {
          callId: "call:settle-progress",
          name: "record_progress",
          input: {
            courseId: "javascript",
            sectionId: "objects",
            progress: "explained",
          },
        },
        runtime: {
          sessionId: "session:settlement",
          sourceItemId: "item:settlement-explanation",
          expectedRevision: 1,
          at: 1_200,
          record,
        },
      }),
    ).toThrow("durable event sink failed")

    expect(lab.readToolSettlement("tool:session:settlement:call:settle-progress")).toEqual({
      invocationId: "tool:session:settlement:call:settle-progress",
      operationId: "tool:session:settlement:call:settle-progress",
      toolName: "record_progress",
      result: { revision: 2, replayed: false },
      settledAt: 1_200,
    })
    expect(lab.buildCurrentContext({ now: 1_300 })).toMatchObject({
      revision: 2,
      route: [{ progress: ["explained"] }],
    })

    lab.close()
    lab = openLearningLab(databasePath)
    openedLabs.push(lab)
    failResultProjection = false
    const recordedCall = durableEvents.find(
      (event): event is RecordedLearningToolCallEvent => event.type === "tool-call",
    )
    expect(recordedCall).toBeDefined()
    expect(
      reprojectSettledLearningTool({
        lab,
        event: recordedCall!,
        record,
      }),
    ).toEqual({ revision: 2, replayed: false })
    expect(durableEvents.filter((event) => event.type === "tool-call")).toHaveLength(1)
    expect(durableEvents.filter((event) => event.type === "tool-result")).toHaveLength(1)
    expect(lab.buildCurrentContext({ now: 1_400 }).route[0]?.progress).toEqual(["explained"])

    const unbegunCall: RecordedLearningToolCallEvent = {
      eventId: "tool-call:tool:session:settlement:call:unbegun",
      type: "tool-call",
      callId: "call:unbegun",
      name: "record_progress",
      input: {
        courseId: "javascript",
        sectionId: "objects",
        progress: "demonstrated",
      },
      operationId: "tool:session:settlement:call:unbegun",
      sessionId: "session:settlement",
      sourceItemId: "item:settlement-explanation",
      expectedRevision: 2,
      at: 1_450,
    }
    expect(() =>
      reprojectSettledLearningTool({ lab, event: unbegunCall, record }),
    ).toThrow("Recorded tool call has no durable settlement")
    expect(lab.buildCurrentContext({ now: 1_450 }).revision).toBe(2)

    expect(() =>
      executeRecordedLearningTool({
        lab,
        call: {
          callId: "call:unrecorded",
          name: "record_progress",
          input: {
            courseId: "javascript",
            sectionId: "objects",
            progress: "demonstrated",
          },
        },
        runtime: {
          sessionId: "session:settlement",
          sourceItemId: "item:settlement-explanation",
          expectedRevision: 2,
          at: 1_500,
          record: () => {
            throw new Error("tool call was not recorded")
          },
        },
      }),
    ).toThrow("tool call was not recorded")
    expect(lab.buildCurrentContext({ now: 1_600 }).revision).toBe(2)
  })

  test("a model-facing progress correction binds its learner source and preserves history", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-recorded-learning-tool-"))
    temporaryDirectories.push(directory)
    const lab = openLearningLab(join(directory, "learning.sqlite"))
    openedLabs.push(lab)

    lab.apply({
      operationId: "op:init-correction-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Learn the language",
        sections: [{ id: "object-references", title: "Object references" }],
      },
    })
    lab.appendSessionItem({
      itemId: "item:reported-reading",
      sessionId: "session:write",
      role: "user",
      content: "I finished reading object references.",
      at: 1_100,
    })

    const events: RecordedLearningToolEvent[] = []
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "call:reported-reading",
        name: "record_progress",
        input: {
          courseId: "javascript",
          sectionId: "object-references",
          progress: "read",
        },
      },
      runtime: {
        sessionId: "session:write",
        sourceItemId: "item:reported-reading",
        expectedRevision: 1,
        at: 1_200,
        record: (event) => events.push(event),
      },
    })

    lab.appendSessionItem({
      itemId: "item:corrected-reading",
      sessionId: "session:correction",
      role: "user",
      content: "I only skimmed the heading; I did not finish that range.",
      at: 1_300,
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "call:correct-reading",
        name: "retract_progress",
        input: {
          progressOperationId: "tool:session:write:call:reported-reading",
          reason: "Learner corrected the earlier completion report",
        },
      },
      runtime: {
        sessionId: "session:correction",
        sourceItemId: "item:corrected-reading",
        expectedRevision: 2,
        at: 1_400,
        record: (event) => events.push(event),
      },
    })

    expect(lab.buildCurrentContext({ now: 1_500 }).route[0]?.progress).toEqual([])
    expect(lab.readProgressHistory({
      courseId: "javascript",
      sectionId: "object-references",
    })).toEqual([
      {
        id: "progress:tool:session:write:call:reported-reading",
        kind: "read",
        recordedAt: 1_200,
        status: "retracted",
        sourceItemId: "item:reported-reading",
        correction: {
          reason: "Learner corrected the earlier completion report",
          sourceItemId: "item:corrected-reading",
        },
      },
    ])
    expect(events.slice(-2).map((event) => event.type)).toEqual(["tool-call", "tool-result"])
  })
})
