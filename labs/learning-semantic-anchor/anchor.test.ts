import { describe, expect, test } from "bun:test"
import {
  OperationConflictError,
  assembleLearningContext,
  commitFormalTaskResult,
  completeSelectedExplanation,
  correctInterpretation,
  countEvidenceInterpretations,
  countTaskResults,
  createLabDatabase,
  deleteProjectionForRebuildTest,
  getInvocationStatus,
  rebuildProjection,
  recordInvocation,
  recordSessionItem,
  registerFormalTask,
  scheduleReview,
  selectNextAction,
  type FormalTaskResultInput,
} from "./anchor"

const target = "page-offset-bits"
const now = 1_000

function setupTask() {
  const db = createLabDatabase()
  registerFormalTask(db, {
    taskId: "task-offset-check",
    target,
    purpose: "assessment",
    alignmentSource: "reviewed-course-source",
  })
  recordSessionItem(db, {
    itemId: "answer-1",
    kind: "user_text",
    body: "12 bits",
  })
  return db
}

function result(overrides: Partial<FormalTaskResultInput> = {}): FormalTaskResultInput {
  return {
    invocationId: "invocation-1",
    attemptId: "attempt-1",
    taskId: "task-offset-check",
    sourceItemId: "answer-1",
    target,
    outcome: "success",
    assistance: "none",
    evaluatorRevision: "rule-v1",
    occurredAt: now,
    ...overrides,
  }
}

describe("learning-significance contract", () => {
  test("ordinary clarification changes Session history but not learning state", () => {
    const db = createLabDatabase()
    recordSessionItem(db, {
      itemId: "clarification-1",
      kind: "user_text",
      body: "What does callback mean here?",
    })

    const context = assembleLearningContext(db, { target, now })
    expect(context).toMatchObject({
      target,
      projectionRevision: 0,
      localSignal: "unresolved",
      activeInterpretationIds: [],
      candidateReasons: ["formal_task_needed"],
    })
    expect(countTaskResults(db)).toBe(0)
    expect(countEvidenceInterpretations(db)).toBe(0)
    expect(selectNextAction(context)).toEqual({ kind: "offer_formal_task", target })
    db.close()
  })

  test("an explicitly declared explanation contract creates verification work without mastery evidence", () => {
    const db = createLabDatabase()
    recordSessionItem(db, {
      itemId: "explanation-1",
      kind: "assistant_text",
      body: "A page size of 4 KiB leaves twelve offset bits.",
    })
    completeSelectedExplanation(db, {
      obligationId: "verify-explanation-1",
      sourceItemId: "explanation-1",
      target,
      onCompletion: "verification_obligation",
    })

    const context = assembleLearningContext(db, { target, now })
    expect(countEvidenceInterpretations(db)).toBe(0)
    expect(context.localSignal).toBe("unresolved")
    expect(context.candidateReasons).toContain("verification_obligation")
    expect(selectNextAction(context)).toEqual({ kind: "verify", target })
    db.close()
  })

  test("different formal results produce different next actions", () => {
    const success = setupTask()
    recordInvocation(success, result())
    commitFormalTaskResult(success, result())

    const miss = setupTask()
    const missInput = result({ outcome: "miss" })
    recordInvocation(miss, missInput)
    commitFormalTaskResult(miss, missInput)

    const successContext = assembleLearningContext(success, { target, now })
    const missContext = assembleLearningContext(miss, { target, now })

    expect(successContext).toMatchObject({
      localSignal: "locally_positive",
      activeInterpretationIds: ["evidence:attempt-1:rule-v1"],
    })
    expect(missContext).toMatchObject({
      localSignal: "needs_review",
      activeInterpretationIds: ["evidence:attempt-1:rule-v1"],
    })
    expect(selectNextAction(successContext)).toEqual({ kind: "continue_ready_work", target })
    expect(selectNextAction(missContext)).toEqual({ kind: "targeted_review", target })

    success.close()
    miss.close()
  })

  test("assisted success remains a verification obligation", () => {
    const db = setupTask()
    const input = result({ assistance: "hinted" })
    recordInvocation(db, input)
    commitFormalTaskResult(db, input)

    const context = assembleLearningContext(db, { target, now })
    expect(context.localSignal).toBe("needs_verification")
    expect(context.candidateReasons).toContain("verification_obligation")
    expect(selectNextAction(context)).toEqual({ kind: "verify", target })
    db.close()
  })

  test("time can make review due without creating evidence", () => {
    const db = setupTask()
    recordInvocation(db, result())
    commitFormalTaskResult(db, result())
    scheduleReview(db, {
      obligationId: "scheduled-review-1",
      target,
      dueAt: now + 50,
    })
    const evidenceBefore = countEvidenceInterpretations(db)

    expect(assembleLearningContext(db, { target, now }).candidateReasons).not.toContain("naturally_due_review")
    const later = assembleLearningContext(db, { target, now: now + 60 })
    expect(later.candidateReasons).toContain("naturally_due_review")
    expect(selectNextAction(later)).toEqual({ kind: "due_review", target })
    expect(countEvidenceInterpretations(db)).toBe(evidenceBefore)
    db.close()
  })

  test("task result and tool settlement commit atomically", () => {
    const db = setupTask()
    const input = result()
    recordInvocation(db, input)

    expect(() => commitFormalTaskResult(db, input, { injectFailure: "before_settlement" })).toThrow(
      "injected failure before settlement",
    )
    expect(getInvocationStatus(db, input.invocationId)).toBe("recorded")
    expect(countTaskResults(db)).toBe(0)
    expect(countEvidenceInterpretations(db)).toBe(0)
    expect(assembleLearningContext(db, { target, now }).projectionRevision).toBe(0)

    commitFormalTaskResult(db, input)
    expect(getInvocationStatus(db, input.invocationId)).toBe("succeeded")
    expect(countTaskResults(db)).toBe(1)
    expect(countEvidenceInterpretations(db)).toBe(1)
    db.close()
  })

  test("exact operation retry is idempotent and conflicting reuse is rejected", () => {
    const db = setupTask()
    const input = result()
    recordInvocation(db, input)

    expect(commitFormalTaskResult(db, input)).toMatchObject({ inserted: true })
    expect(commitFormalTaskResult(db, input)).toMatchObject({ inserted: false })
    expect(countTaskResults(db)).toBe(1)

    const conflicting = { ...input, outcome: "miss" as const }
    expect(() => recordInvocation(db, conflicting)).toThrow(OperationConflictError)
    expect(() => commitFormalTaskResult(db, conflicting)).toThrow(OperationConflictError)
    db.close()
  })

  test("correction retracts interpretation without deleting the source result", () => {
    const db = setupTask()
    const input = result({ outcome: "miss" })
    recordInvocation(db, input)
    const committed = commitFormalTaskResult(db, input)
    expect(selectNextAction(assembleLearningContext(db, { target, now }))).toEqual({
      kind: "targeted_review",
      target,
    })

    correctInterpretation(db, {
      correctionId: "correction-1",
      interpretationId: committed.interpretationId,
      action: "retract",
      reason: "the evaluator used the wrong answer key",
    })

    expect(countTaskResults(db)).toBe(1)
    expect(countEvidenceInterpretations(db)).toBe(1)
    const corrected = assembleLearningContext(db, { target, now })
    expect(corrected.localSignal).toBe("unresolved")
    expect(corrected.activeInterpretationIds).toEqual([])
    expect(selectNextAction(corrected)).toEqual({ kind: "offer_formal_task", target })
    db.close()
  })

  test("learner projection rebuilds from active interpretations and obligations", () => {
    const db = setupTask()
    const input = result({ outcome: "miss" })
    recordInvocation(db, input)
    commitFormalTaskResult(db, input)
    const before = assembleLearningContext(db, { target, now })

    deleteProjectionForRebuildTest(db)
    expect(assembleLearningContext(db, { target, now }).localSignal).toBe("unresolved")
    rebuildProjection(db)

    expect(assembleLearningContext(db, { target, now })).toEqual(before)
    db.close()
  })
})
