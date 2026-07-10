import { describe, expect, test } from "bun:test"
import {
  OperationConflictError,
  assembleContext,
  commitOccurrence,
  createLabDatabase,
  deleteProjectionForRebuildTest,
  occurrenceCount,
  rebuildProjection,
  recordSessionFact,
  selectTutorAction,
  type OccurrenceInput,
} from "./anchor"

const goal = "continue-course"
const target = "current-capability"
const relatedTarget = "supporting-capability"

function occurrence(input: Partial<OccurrenceInput> & Pick<OccurrenceInput, "operationId" | "occurrenceId">): OccurrenceInput {
  return {
    operationId: input.operationId,
    occurrenceId: input.occurrenceId,
    target: input.target ?? target,
    outcome: input.outcome ?? "success",
    independent: input.independent ?? true,
    delayed: input.delayed ?? true,
    ...(input.relatedTarget ? { relatedTarget: input.relatedTarget } : {}),
  }
}

describe("learning-semantic anchor", () => {
  test("Session assertions and failed tool calls are not learning evidence", () => {
    const db = createLabDatabase()
    recordSessionFact(db, { id: "msg-1", kind: "assistant_text", body: "The learner has mastered this." })
    recordSessionFact(db, { id: "tool-1", kind: "tool_failed", body: "record observation failed" })

    const context = assembleContext(db, { goal, target })
    expect(context).toEqual({
      goal,
      target,
      projectionRevision: 0,
      learnerState: "needs_probe",
      sourceOccurrenceIds: [],
    })
    expect(selectTutorAction(context)).toEqual({ kind: "probe", target })
    db.close()
  })

  test("different committed evidence changes context provenance and next action", () => {
    const stable = createLabDatabase()
    commitOccurrence(stable, occurrence({ operationId: "op-stable", occurrenceId: "occ-stable" }))

    const repair = createLabDatabase()
    commitOccurrence(
      repair,
      occurrence({
        operationId: "op-failure-1",
        occurrenceId: "occ-failure-1",
        outcome: "failure",
        delayed: false,
        relatedTarget,
      }),
    )
    commitOccurrence(
      repair,
      occurrence({
        operationId: "op-failure-2",
        occurrenceId: "occ-failure-2",
        outcome: "failure",
        delayed: false,
        relatedTarget,
      }),
    )

    const stableContext = assembleContext(stable, { goal, target })
    const repairContext = assembleContext(repair, { goal, target })

    expect(stableContext).toMatchObject({
      learnerState: "stable",
      sourceOccurrenceIds: ["occ-stable"],
    })
    expect(repairContext).toMatchObject({
      learnerState: "needs_repair",
      sourceOccurrenceIds: ["occ-failure-1", "occ-failure-2"],
      repairTarget: relatedTarget,
    })
    expect(selectTutorAction(stableContext)).toEqual({ kind: "advance", target })
    expect(selectTutorAction(repairContext)).toEqual({ kind: "repair", target: relatedTarget })

    stable.close()
    repair.close()
  })

  test("a weaker success remains a probe instead of being promoted by fluent text", () => {
    const db = createLabDatabase()
    commitOccurrence(
      db,
      occurrence({ operationId: "op-assisted", occurrenceId: "occ-assisted", independent: false, delayed: false }),
    )
    recordSessionFact(db, { id: "msg-confident", kind: "assistant_text", body: "Excellent, completely understood." })

    const context = assembleContext(db, { goal, target })
    expect(context).toMatchObject({
      projectionRevision: 1,
      learnerState: "needs_probe",
      sourceOccurrenceIds: ["occ-assisted"],
    })
    expect(selectTutorAction(context)).toEqual({ kind: "probe", target })
    db.close()
  })

  test("exact operation retry is idempotent and conflicting reuse is rejected", () => {
    const db = createLabDatabase()
    const input = occurrence({ operationId: "op-once", occurrenceId: "occ-once" })

    expect(commitOccurrence(db, input)).toEqual({ occurrenceId: "occ-once", projectionRevision: 1, inserted: true })
    expect(commitOccurrence(db, input)).toEqual({ occurrenceId: "occ-once", projectionRevision: 1, inserted: false })
    expect(occurrenceCount(db)).toBe(1)

    expect(() => commitOccurrence(db, { ...input, outcome: "failure" })).toThrow(OperationConflictError)
    expect(occurrenceCount(db)).toBe(1)
    db.close()
  })

  test("the learner projection is rebuildable from committed occurrences", () => {
    const db = createLabDatabase()
    commitOccurrence(
      db,
      occurrence({
        operationId: "op-rebuild-1",
        occurrenceId: "occ-rebuild-1",
        outcome: "failure",
        delayed: false,
        relatedTarget,
      }),
    )
    commitOccurrence(
      db,
      occurrence({
        operationId: "op-rebuild-2",
        occurrenceId: "occ-rebuild-2",
        outcome: "failure",
        delayed: false,
        relatedTarget,
      }),
    )
    const before = assembleContext(db, { goal, target })

    deleteProjectionForRebuildTest(db)
    expect(assembleContext(db, { goal, target })).toMatchObject({ learnerState: "needs_probe" })
    rebuildProjection(db)

    expect(assembleContext(db, { goal, target })).toEqual(before)
    db.close()
  })
})
