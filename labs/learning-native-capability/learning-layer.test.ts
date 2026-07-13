import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { OperationConflictError, StaleRevisionError, openLearningLab } from "./learning-layer"

const temporaryDirectories: string[] = []
const openedLabs: Array<{ close(): void }> = []

function openTestLab(databasePath: string) {
  const lab = openLearningLab(databasePath)
  openedLabs.push(lab)
  return lab
}

afterEach(async () => {
  for (const lab of openedLabs.splice(0).reverse()) {
    try {
      lab.close()
    } catch {
      // A test may have already closed this handle to exercise a fresh reopen.
    }
  }
  Bun.gc(true)
  await Bun.sleep(20)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  }
})

describe("learning-native capability lab", () => {
  test("course position and simple progress survive a fresh reopen while raw detail stays lazy", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")

    let lab = openTestLab(databasePath)
    lab.apply({
      operationId: "op:init-js",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Understand the language well enough to build and debug programs",
        sections: [
          { id: "objects", title: "Objects", materialRef: "https://javascript.info/object" },
          { id: "closures", title: "Closures", materialRef: "https://javascript.info/closure" },
        ],
      },
    })
    lab.appendSessionItem({
      itemId: "item:objects-explanation",
      sessionId: "session:one",
      role: "assistant",
      content: "A long explanation about object references that should stay out of compact context.",
      at: 1_100,
    })
    lab.apply({
      operationId: "op:objects-explained",
      expectedRevision: 1,
      sessionId: "session:one",
      at: 1_200,
      command: {
        type: "record-progress",
        courseId: "javascript",
        sectionId: "objects",
        progress: "explained",
        sourceItemId: "item:objects-explanation",
      },
    })
    lab.apply({
      operationId: "op:objects-demonstrated",
      expectedRevision: 2,
      sessionId: "session:one",
      at: 1_300,
      command: {
        type: "record-progress",
        courseId: "javascript",
        sectionId: "objects",
        progress: "demonstrated",
        sourceItemId: "item:objects-explanation",
      },
    })
    lab.apply({
      operationId: "op:move-to-closures",
      expectedRevision: 3,
      at: 1_400,
      command: {
        type: "set-current-section",
        courseId: "javascript",
        sectionId: "closures",
      },
    })
    lab.apply({
      operationId: "op:closures-read",
      expectedRevision: 4,
      at: 1_500,
      command: {
        type: "record-progress",
        courseId: "javascript",
        sectionId: "closures",
        progress: "read",
      },
    })
    lab.apply({
      operationId: "op:closures-followed",
      expectedRevision: 5,
      at: 1_600,
      command: {
        type: "record-progress",
        courseId: "javascript",
        sectionId: "closures",
        progress: "followed",
      },
    })
    lab.close()

    lab = openTestLab(databasePath)
    const context = lab.buildCurrentContext({ now: 2_000, availableMinutes: 45 })

    expect(context.revision).toBe(6)
    expect(context.course.currentSectionId).toBe("closures")
    expect(context.constraints).toEqual({ availableMinutes: 45 })
    expect(context.route[0]?.progress).toEqual(["explained", "demonstrated"])
    expect(context.route[1]?.progress).toEqual(["read", "followed"])
    expect(JSON.stringify(context)).not.toContain("long explanation")
    expect(lab.readSessionItem("item:objects-explanation").content).toContain("object references")

    lab.close()
  })

  test("revisit due state and assignment overdue state derive from time without new observations", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")

    let lab = openTestLab(databasePath)
    lab.apply({
      operationId: "op:init-time-course",
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
    lab.apply({
      operationId: "op:schedule-object-revisit",
      expectedRevision: 1,
      at: 1_100,
      command: {
        type: "schedule-revisit",
        revisitId: "revisit:objects",
        courseId: "javascript",
        sectionId: "objects",
        label: "Revisit object aliasing",
        dueAt: 2_000,
      },
    })
    lab.apply({
      operationId: "op:add-report",
      expectedRevision: 2,
      at: 1_200,
      command: {
        type: "record-assignment",
        assignmentId: "assignment:report",
        courseId: "javascript",
        title: "Submit the short report",
        dueAt: 1_500,
      },
    })

    const beforeDue = lab.buildContext({ courseId: "javascript", now: 1_400 })
    expect(beforeDue.revision).toBe(3)
    expect(beforeDue.dueRevisits).toEqual([])
    expect(beforeDue.assignments.map((assignment) => assignment.state)).toEqual(["open"])

    const atAssignmentDeadline = lab.buildContext({ courseId: "javascript", now: 1_500 })
    expect(atAssignmentDeadline.assignments.map((assignment) => assignment.state)).toEqual([
      "overdue",
    ])

    const atRevisitDeadline = lab.buildContext({ courseId: "javascript", now: 2_000 })
    expect(atRevisitDeadline.dueRevisits.map((revisit) => revisit.id)).toEqual([
      "revisit:objects",
    ])

    expect(() => lab.buildContext({ courseId: "javascript", now: 1_199 })).toThrow(
      "Context time precedes committed learning state",
    )

    const afterDue = lab.buildContext({ courseId: "javascript", now: 2_200 })
    expect(afterDue.revision).toBe(3)
    expect(afterDue.dueRevisits.map((revisit) => revisit.id)).toEqual(["revisit:objects"])
    expect(afterDue.assignments.map((assignment) => assignment.state)).toEqual(["overdue"])

    lab.appendSessionItem({
      itemId: "item:assignment-completed",
      sessionId: "session:assignment-completion",
      role: "user",
      content: "I submitted the short report.",
      at: 2_250,
    })
    lab.apply({
      operationId: "op:complete-report",
      expectedRevision: 3,
      sessionId: "session:assignment-completion",
      at: 2_300,
      command: {
        type: "resolve-assignment",
        assignmentId: "assignment:report",
        resolution: "completed",
        sourceItemId: "item:assignment-completed",
      },
    })
    lab.close()

    lab = openTestLab(databasePath)
    const reopened = lab.buildContext({ courseId: "javascript", now: 2_400 })
    expect(reopened.revision).toBe(4)
    expect(reopened.dueRevisits.map((revisit) => revisit.id)).toEqual(["revisit:objects"])
    expect(reopened.assignments).toEqual([])
    lab.appendSessionItem({
      itemId: "item:review-completed",
      sessionId: "session:review-completion",
      role: "user",
      content: "I completed the object aliasing revisit.",
      at: 2_450,
    })
    lab.apply({
      operationId: "op:complete-object-revisit",
      expectedRevision: 4,
      sessionId: "session:review-completion",
      at: 2_500,
      command: {
        type: "resolve-revisit",
        revisitId: "revisit:objects",
        resolution: "completed",
        sourceItemId: "item:review-completed",
      },
    })
    lab.close()

    lab = openTestLab(databasePath)
    const afterResolution = lab.buildContext({ courseId: "javascript", now: 2_600 })
    expect(afterResolution.revision).toBe(5)
    expect(afterResolution.dueRevisits).toEqual([])
    expect(afterResolution.assignments).toEqual([])
    expect(lab.readRevisit("revisit:objects").resolvedSourceItemId).toBe(
      "item:review-completed",
    )
    lab.close()
  })

  test("correction preserves the original progress history while changing current context", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")

    let lab = openTestLab(databasePath)
    lab.apply({
      operationId: "op:init-correction-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Learn the language",
        sections: [
          { id: "objects", title: "Objects" },
          { id: "closures", title: "Closures" },
        ],
      },
    })
    lab.appendSessionItem({
      itemId: "item:reported-read",
      sessionId: "session:one",
      role: "user",
      content: "I read the Objects section.",
      at: 1_100,
    })
    lab.apply({
      operationId: "op:objects-read",
      expectedRevision: 1,
      sessionId: "session:one",
      at: 1_200,
      command: {
        type: "record-progress",
        courseId: "javascript",
        sectionId: "objects",
        progress: "read",
        sourceItemId: "item:reported-read",
      },
    })
    lab.apply({
      operationId: "op:objects-explained-after-report",
      expectedRevision: 2,
      at: 1_300,
      command: {
        type: "record-progress",
        courseId: "javascript",
        sectionId: "objects",
        progress: "explained",
      },
    })
    lab.apply({
      operationId: "op:wrong-position",
      expectedRevision: 3,
      at: 1_400,
      command: {
        type: "set-current-section",
        courseId: "javascript",
        sectionId: "closures",
      },
    })
    lab.appendSessionItem({
      itemId: "item:read-correction",
      sessionId: "session:two",
      role: "user",
      content: "Correction: I only skimmed the heading; I did not read that section.",
      at: 2_000,
    })
    lab.apply({
      operationId: "op:retract-read",
      expectedRevision: 4,
      sessionId: "session:two",
      at: 2_100,
      command: {
        type: "retract-progress",
        progressOperationId: "op:objects-read",
        reason: "Learner corrected the earlier report",
        sourceItemId: "item:read-correction",
      },
    })
    lab.apply({
      operationId: "op:correct-position",
      expectedRevision: 5,
      at: 2_200,
      command: {
        type: "set-current-section",
        courseId: "javascript",
        sectionId: "objects",
      },
    })

    const current = lab.buildContext({ courseId: "javascript", now: 2_300 })
    expect(current.course.currentSectionId).toBe("objects")
    expect(current.route[0]?.progress).toEqual(["explained"])
    const history = lab.readProgressHistory({ courseId: "javascript", sectionId: "objects" })
    expect(history.map((entry) => [entry.kind, entry.status])).toEqual([
      ["read", "retracted"],
      ["explained", "active"],
    ])
    expect(history[0]?.correction?.reason).toBe("Learner corrected the earlier report")
    expect(history[0]?.correction?.sourceItemId).toBe("item:read-correction")
    lab.close()

    lab = openTestLab(databasePath)
    const reopened = lab.buildContext({ courseId: "javascript", now: 2_400 })
    expect(reopened.revision).toBe(6)
    expect(reopened.course.currentSectionId).toBe("objects")
    expect(reopened.route[0]?.progress).toEqual(["explained"])
    lab.close()
  })

  test("forged, stale, conflicting, and interrupted writes leave no partial learning state", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")
    const lab = openTestLab(databasePath)

    const initialize = {
      operationId: "op:init-authority-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course" as const,
        courseId: "javascript",
        title: "JavaScript",
        goal: "Learn the language",
        sections: [
          { id: "objects", title: "Objects" },
          { id: "closures", title: "Closures" },
        ],
      },
    }
    expect(lab.apply(initialize)).toEqual({ revision: 1, replayed: false })
    expect(lab.apply(initialize)).toEqual({ revision: 1, replayed: true })

    expect(() =>
      lab.apply({
        ...initialize,
        command: { ...initialize.command, goal: "A conflicting goal" },
      }),
    ).toThrow(OperationConflictError)

    expect(() =>
      lab.apply({
        operationId: "op:stale-position",
        expectedRevision: 0,
        at: 1_100,
        command: {
          type: "set-current-section",
          courseId: "javascript",
          sectionId: "closures",
        },
      }),
    ).toThrow(StaleRevisionError)

    expect(() =>
      lab.apply({
        operationId: "op:forged-section",
        expectedRevision: 1,
        at: 1_200,
        command: {
          type: "record-progress",
          courseId: "javascript",
          sectionId: "not-in-route",
          progress: "read",
        },
      }),
    ).toThrow("Unknown course section")

    expect(() =>
      lab.apply({
        operationId: "op:forged-source",
        expectedRevision: 1,
        at: 1_300,
        command: {
          type: "record-progress",
          courseId: "javascript",
          sectionId: "objects",
          progress: "explained",
          sourceItemId: "item:does-not-exist",
        },
      }),
    ).toThrow("Unknown session item")

    expect(() =>
      lab.apply({
        operationId: "op:set-mastery",
        expectedRevision: 1,
        at: 1_400,
        command: { type: "set-mastery", target: "objects", value: 1 } as never,
      }),
    ).toThrow("Unsupported learning command")

    expect(() =>
      lab.apply({
        operationId: "op:missing-assignment",
        expectedRevision: 1,
        at: 1_500,
        command: {
          type: "resolve-assignment",
          assignmentId: "assignment:missing",
          resolution: "completed",
        },
      }),
    ).toThrow("Unknown assignment")

    expect(() =>
      lab.apply({
        operationId: "op:interrupted-progress",
        expectedRevision: 1,
        at: 1_600,
        injectFailure: "after-command",
        toolInvocation: {
          invocationId: "tool:interrupted-progress",
          toolName: "record_progress",
        },
        command: {
          type: "record-progress",
          courseId: "javascript",
          sectionId: "objects",
          progress: "followed",
        },
      }),
    ).toThrow("Injected failure after learning command")

    const context = lab.buildContext({ courseId: "javascript", now: 2_000 })
    expect(context.revision).toBe(1)
    expect(context.course.currentSectionId).toBe("objects")
    expect(context.route.every((section) => section.progress.length === 0)).toBe(true)
    expect(context.dueRevisits).toEqual([])
    expect(context.assignments).toEqual([])
    expect(lab.readProgressHistory({ courseId: "javascript", sectionId: "objects" })).toEqual([])
    expect(() => lab.readToolSettlement("tool:interrupted-progress")).toThrow(
      "Unknown tool settlement",
    )
    lab.close()
  })

  test("an actual attempt records its conditions without inventing mastery or an automatic revisit", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")
    const lab = openTestLab(databasePath)

    lab.apply({
      operationId: "op:init-attempt-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Learn the language",
        sections: [{ id: "closures", title: "Closures" }],
      },
    })
    lab.appendSessionItem({
      itemId: "item:closure-answer",
      sessionId: "session:attempt",
      role: "user",
      content: "The callback loses x because the outer function has already returned.",
      at: 1_100,
    })
    lab.apply({
      operationId: "op:closure-attempt",
      expectedRevision: 1,
      sessionId: "session:attempt",
      at: 1_200,
      command: {
        type: "record-attempt",
        attemptId: "attempt:closure-1",
        courseId: "javascript",
        sectionId: "closures",
        outcome: "incorrect",
        assistance: "independent",
        sourceItemId: "item:closure-answer",
      },
    })

    const afterAttempt = lab.buildContext({ courseId: "javascript", now: 1_300 })
    expect(afterAttempt.revision).toBe(2)
    expect("recentAttempts" in afterAttempt).toBe(false)
    expect(lab.readAttempt("attempt:closure-1")).toEqual({
      id: "attempt:closure-1",
      courseId: "javascript",
      sectionId: "closures",
      outcome: "incorrect",
      assistance: "independent",
      sourceItemId: "item:closure-answer",
      occurredAt: 1_200,
    })
    expect(afterAttempt.route[0]?.progress).toEqual([])
    expect(afterAttempt.dueRevisits).toEqual([])
    expect(JSON.stringify(afterAttempt)).not.toContain("outer function has already returned")

    lab.apply({
      operationId: "op:schedule-closure-revisit",
      expectedRevision: 2,
      at: 1_400,
      command: {
        type: "schedule-revisit",
        revisitId: "revisit:closure-1",
        courseId: "javascript",
        sectionId: "closures",
        label: "Revisit lexical capture",
        dueAt: 2_000,
        sourceAttemptId: "attempt:closure-1",
      },
    })
    const due = lab.buildContext({ courseId: "javascript", now: 2_100 })
    expect(due.dueRevisits[0]?.sourceAttemptId).toBe("attempt:closure-1")
    expect(lab.readSessionItem("item:closure-answer").content).toContain("outer function")
    expect(() =>
      lab.apply({
        operationId: "op:resolve-with-pre-revisit-attempt",
        expectedRevision: 3,
        at: 2_200,
        command: {
          type: "resolve-revisit",
          revisitId: "revisit:closure-1",
          resolution: "completed",
          sourceAttemptId: "attempt:closure-1",
        },
      }),
    ).toThrow("Revisit completion source must occur after revisit was created")
    lab.close()
  })

  test("an attempt source must be an earlier learner or tool item from the current Session", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")
    const lab = openTestLab(databasePath)

    lab.apply({
      operationId: "op:init-source-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Learn the language",
        sections: [{ id: "closures", title: "Closures" }],
      },
    })
    lab.appendSessionItem({
      itemId: "item:assistant-explanation",
      sessionId: "session:current",
      role: "assistant",
      content: "A closure retains access to its lexical environment.",
      at: 1_100,
    })
    lab.appendSessionItem({
      itemId: "item:other-session-answer",
      sessionId: "session:other",
      role: "user",
      content: "An answer from another Session.",
      at: 1_150,
    })
    lab.appendSessionItem({
      itemId: "item:future-answer",
      sessionId: "session:current",
      role: "user",
      content: "An answer that did not exist at operation time.",
      at: 2_000,
    })

    const attemptFrom = (operationId: string, sourceItemId: string) =>
      lab.apply({
        operationId,
        expectedRevision: 1,
        sessionId: "session:current",
        at: 1_200,
        command: {
          type: "record-attempt",
          attemptId: `attempt:${operationId}`,
          courseId: "javascript",
          sectionId: "closures",
          outcome: "incorrect",
          assistance: "independent",
          sourceItemId,
        },
      })

    expect(() => attemptFrom("assistant-source", "item:assistant-explanation")).toThrow(
      "Attempt source must be learner or tool output",
    )
    expect(() => attemptFrom("other-session-source", "item:other-session-answer")).toThrow(
      "Source item is not from the current Session",
    )
    expect(() => attemptFrom("future-source", "item:future-answer")).toThrow(
      "Source item occurs after the learning operation",
    )
    expect(() =>
      lab.apply({
        operationId: "op:assistant-followed",
        expectedRevision: 1,
        sessionId: "session:current",
        at: 1_200,
        command: {
          type: "record-progress",
          courseId: "javascript",
          sectionId: "closures",
          progress: "followed",
          sourceItemId: "item:assistant-explanation",
        },
      }),
    ).toThrow("Learner progress source must be learner or tool output")
    expect(lab.buildContext({ courseId: "javascript", now: 2_100 }).revision).toBe(1)
    lab.close()
  })

  test("an attempt can be corrected without losing its recorded result", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")
    const lab = openTestLab(databasePath)

    lab.apply({
      operationId: "op:init-correct-attempt",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Learn the language",
        sections: [{ id: "closures", title: "Closures" }],
      },
    })
    lab.appendSessionItem({
      itemId: "item:answer",
      sessionId: "session:attempt-correction",
      role: "user",
      content: "A learner answer.",
      at: 1_100,
    })
    lab.apply({
      operationId: "op:record-wrong-grade",
      expectedRevision: 1,
      sessionId: "session:attempt-correction",
      at: 1_200,
      command: {
        type: "record-attempt",
        attemptId: "attempt:corrected",
        courseId: "javascript",
        sectionId: "closures",
        outcome: "incorrect",
        assistance: "guided",
        sourceItemId: "item:answer",
      },
    })
    lab.appendSessionItem({
      itemId: "item:grade-correction",
      sessionId: "session:attempt-correction",
      role: "tool",
      content: "The deterministic checker shows the answer was correct and independent.",
      at: 1_300,
    })
    lab.apply({
      operationId: "op:correct-grade",
      expectedRevision: 2,
      sessionId: "session:attempt-correction",
      at: 1_400,
      command: {
        type: "correct-attempt",
        attemptId: "attempt:corrected",
        outcome: "correct",
        assistance: "independent",
        reason: "The first grading pass was wrong",
        sourceItemId: "item:grade-correction",
      },
    })
    lab.apply({
      operationId: "op:z-same-time-correction",
      expectedRevision: 3,
      sessionId: "session:attempt-correction",
      at: 1_500,
      command: {
        type: "correct-attempt",
        attemptId: "attempt:corrected",
        outcome: "correct",
        assistance: "guided",
        reason: "First correction at the same virtual time",
        sourceItemId: "item:grade-correction",
      },
    })
    lab.apply({
      operationId: "op:a-same-time-correction",
      expectedRevision: 4,
      sessionId: "session:attempt-correction",
      at: 1_500,
      command: {
        type: "correct-attempt",
        attemptId: "attempt:corrected",
        outcome: "partial",
        assistance: "hinted",
        reason: "Second correction at the same virtual time",
        sourceItemId: "item:grade-correction",
      },
    })

    expect(lab.readAttempt("attempt:corrected")).toEqual({
      id: "attempt:corrected",
      courseId: "javascript",
      sectionId: "closures",
      outcome: "partial",
      assistance: "hinted",
      sourceItemId: "item:answer",
      occurredAt: 1_200,
      recorded: { outcome: "incorrect", assistance: "guided" },
      correction: {
        outcome: "partial",
        assistance: "hinted",
        reason: "Second correction at the same virtual time",
        sourceItemId: "item:grade-correction",
        correctedAt: 1_500,
      },
    })
    lab.close()
  })

  test("resolved planning facts remain inspectable and can be explicitly reopened or revised", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")
    const lab = openTestLab(databasePath)

    lab.apply({
      operationId: "op:init-live-facts",
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
    lab.apply({
      operationId: "op:add-live-assignment",
      expectedRevision: 1,
      at: 1_100,
      command: {
        type: "record-assignment",
        assignmentId: "assignment:report",
        courseId: "javascript",
        title: "Short report",
        dueAt: 2_000,
      },
    })
    lab.apply({
      operationId: "op:add-live-revisit",
      expectedRevision: 2,
      at: 1_200,
      command: {
        type: "schedule-revisit",
        revisitId: "revisit:objects",
        courseId: "javascript",
        sectionId: "objects",
        label: "Revisit aliasing",
        dueAt: 2_000,
      },
    })
    expect(() =>
      lab.apply({
        operationId: "op:source-less-assignment-completion",
        expectedRevision: 3,
        at: 1_250,
        command: {
          type: "resolve-assignment",
          assignmentId: "assignment:report",
          resolution: "completed",
        },
      }),
    ).toThrow("Assignment resolution requires a learner or tool source")
    lab.appendSessionItem({
      itemId: "item:mistaken-assignment-completion",
      sessionId: "session:live-facts",
      role: "user",
      content: "I thought the assignment was already submitted.",
      at: 1_250,
    })
    lab.apply({
      operationId: "op:mistaken-complete-assignment",
      expectedRevision: 3,
      sessionId: "session:live-facts",
      at: 1_300,
      command: {
        type: "resolve-assignment",
        assignmentId: "assignment:report",
        resolution: "completed",
        sourceItemId: "item:mistaken-assignment-completion",
      },
    })
    lab.appendSessionItem({
      itemId: "item:mistaken-review-completion",
      sessionId: "session:live-facts",
      role: "user",
      content: "I thought I had completed the revisit.",
      at: 1_350,
    })
    lab.apply({
      operationId: "op:mistaken-complete-revisit",
      expectedRevision: 4,
      sessionId: "session:live-facts",
      at: 1_400,
      command: {
        type: "resolve-revisit",
        revisitId: "revisit:objects",
        resolution: "completed",
        sourceItemId: "item:mistaken-review-completion",
      },
    })

    expect(lab.readAssignment("assignment:report").status).toBe("completed")
    expect(lab.readAssignment("assignment:report").resolvedSourceItemId).toBe(
      "item:mistaken-assignment-completion",
    )
    expect(lab.readRevisit("revisit:objects").status).toBe("completed")

    expect(() =>
      lab.apply({
        operationId: "op:revise-resolved-assignment",
        expectedRevision: 5,
        at: 1_450,
        command: {
          type: "revise-assignment",
          assignmentId: "assignment:report",
          dueAt: 4_000,
          reason: "This must not bypass reopen",
        },
      }),
    ).toThrow("Assignment must be reopened before revision")

    lab.apply({
      operationId: "op:reopen-assignment",
      expectedRevision: 5,
      at: 1_500,
      command: { type: "reopen-assignment", assignmentId: "assignment:report" },
    })
    lab.apply({
      operationId: "op:revise-assignment",
      expectedRevision: 6,
      at: 1_600,
      command: {
        type: "revise-assignment",
        assignmentId: "assignment:report",
        dueAt: 5_000,
        reason: "The published deadline was corrected",
      },
    })
    lab.apply({
      operationId: "op:reopen-revisit",
      expectedRevision: 7,
      at: 1_700,
      command: { type: "reopen-revisit", revisitId: "revisit:objects" },
    })
    lab.apply({
      operationId: "op:reschedule-revisit",
      expectedRevision: 8,
      at: 1_800,
      command: {
        type: "reschedule-revisit",
        revisitId: "revisit:objects",
        dueAt: 3_000,
        reason: "The first completion was accidental",
      },
    })

    const context = lab.buildCurrentContext({ now: 3_100 })
    expect(context.assignments).toEqual([
      {
        id: "assignment:report",
        title: "Short report",
        dueAt: 5_000,
        state: "open",
      },
    ])
    expect(JSON.stringify(context.assignments)).not.toContain("learningValue")
    expect(JSON.stringify(context.assignments)).not.toContain("goalRelevance")
    expect(context.dueRevisits.map((revisit) => revisit.id)).toEqual(["revisit:objects"])
    expect(lab.readAssignment("assignment:report").status).toBe("open")
    expect(lab.readRevisit("revisit:objects").dueAt).toBe(3_000)
    expect(lab.readOperation("op:revise-assignment").input.command).toMatchObject({
      type: "revise-assignment",
      reason: "The published deadline was corrected",
    })
    expect(lab.readOperation("op:reschedule-revisit").input.command).toMatchObject({
      type: "reschedule-revisit",
      reason: "The first completion was accidental",
    })
    lab.close()
  })

  test("an older lab database gains an active course before current context is read", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "learning.sqlite")
    const legacy = new Database(databasePath)
    legacy.exec(`
      CREATE TABLE lab_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        revision INTEGER NOT NULL
      );
      INSERT INTO lab_meta (singleton, revision) VALUES (1, 4);

      CREATE TABLE learning_operation (
        operation_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        revision_after INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      INSERT INTO learning_operation VALUES
        ('op:init-legacy', 'initialize-course', '{}', '{"revision":1}', 1, 1000),
        ('op:attempt-legacy', 'record-attempt', '{}', '{"revision":2}', 2, 1200),
        ('op:z-legacy-correction', 'correct-attempt', '{}', '{"revision":3}', 3, 1500),
        ('op:a-legacy-correction', 'correct-attempt', '{}', '{"revision":4}', 4, 1500);

      CREATE TABLE session_item (
        item_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      INSERT INTO session_item VALUES
        ('item:legacy-answer', 'session:legacy', 'user', 'Legacy answer', 1100),
        ('item:legacy-correction', 'session:legacy', 'tool', 'Legacy correction', 1300);

      CREATE TABLE course (
        course_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        current_section_id TEXT NOT NULL
      );
      INSERT INTO course (course_id, title, goal, current_section_id)
      VALUES ('javascript', 'JavaScript', 'Learn the language', 'objects');

      CREATE TABLE course_section (
        section_id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES course(course_id),
        ordinal INTEGER NOT NULL,
        title TEXT NOT NULL,
        material_ref TEXT,
        UNIQUE (course_id, ordinal)
      );
      INSERT INTO course_section (section_id, course_id, ordinal, title, material_ref)
      VALUES ('objects', 'javascript', 0, 'Objects', NULL);

      CREATE TABLE attempt (
        attempt_id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        assistance TEXT NOT NULL,
        source_item_id TEXT NOT NULL,
        occurred_at INTEGER NOT NULL
      );
      INSERT INTO attempt VALUES
        ('attempt:legacy', 'javascript', 'objects', 'incorrect', 'guided',
         'item:legacy-answer', 1200);

      CREATE TABLE attempt_correction (
        correction_id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        assistance TEXT NOT NULL,
        reason TEXT NOT NULL,
        source_item_id TEXT,
        created_at INTEGER NOT NULL
      );
      INSERT INTO attempt_correction VALUES
        ('attempt-correction:op:z-legacy-correction', 'attempt:legacy', 'correct', 'guided',
         'First legacy correction', 'item:legacy-correction', 1500),
        ('attempt-correction:op:a-legacy-correction', 'attempt:legacy', 'partial', 'hinted',
         'Second legacy correction', 'item:legacy-correction', 1500);
    `)
    legacy.close()

    const lab = openTestLab(databasePath)
    const context = lab.buildCurrentContext({ now: 1_500 })
    expect(context.course).toMatchObject({
      id: "javascript",
      currentSectionId: "objects",
    })
    expect(context.revision).toBe(4)
    expect(lab.readAttempt("attempt:legacy")).toMatchObject({
      outcome: "partial",
      assistance: "hinted",
      correction: { reason: "Second legacy correction" },
    })
    lab.close()
  })

  test("malformed Session items cannot become learning provenance", () => {
    const directory = mkdtempSync(join(tmpdir(), "repa-learning-capability-"))
    temporaryDirectories.push(directory)
    const lab = openTestLab(join(directory, "learning.sqlite"))

    expect(() =>
      lab.appendSessionItem({
        itemId: "",
        sessionId: "session:valid",
        role: "user",
        content: "Invalid item identifier",
        at: 1,
      }),
    ).toThrow("itemId must not be empty")
    expect(() =>
      lab.appendSessionItem({
        itemId: "item:valid",
        sessionId: "",
        role: "user",
        content: "Invalid Session identifier",
        at: 1,
      }),
    ).toThrow("sessionId must not be empty")
    expect(() =>
      lab.appendSessionItem({
        itemId: "item:negative-time",
        sessionId: "session:valid",
        role: "user",
        content: "Invalid time",
        at: -1,
      }),
    ).toThrow("Invalid at")
    lab.close()
  })
})
