import { describe, expect, test } from "bun:test"

import {
  boundedMeaningKey,
  fixtureById,
  laterLearnerOrToolWouldServe,
  laterContextVariants,
  laterOccurrences,
  legacyCoordinateKey,
  oracleFor,
  returnConcerns,
  directDeadlineHelp,
  sameTurnAdaptation,
  targetOverlapWouldServe,
} from "./pressure"

describe("teach, adapt, and return architecture pressure", () => {
  test("target, source, revision, and time collapse distinct learning purposes", () => {
    expect(new Set(returnConcerns.map(legacyCoordinateKey)).size).toBe(1)
    expect(new Set(returnConcerns.map(boundedMeaningKey)).size).toBe(3)
    expect(
      fixtureById(returnConcerns, "repair-with-another-representation").acceptableMoves,
    ).toHaveLength(2)
  })

  test("one stored purpose permits different forms under later learner context", () => {
    expect(new Set(laterContextVariants.map((variant) => variant.concernId)).size).toBe(1)
    expect(new Set(laterContextVariants.map((variant) => variant.acceptableMove)).size).toBe(2)
    const concern = fixtureById(returnConcerns, laterContextVariants[0]!.concernId)
    for (const variant of laterContextVariants) {
      expect(concern.acceptableMoves).toContain(variant.acceptableMove)
    }
  })

  test("same-target overlap cannot decide whether a later activity serves the concern", () => {
    const concern = fixtureById(returnConcerns, "discriminate-aliasing-from-copying")
    const occurrence = fixtureById(laterOccurrences, "tool-reports-obvious-overlap")

    expect(targetOverlapWouldServe(concern, occurrence)).toBe(true)
    expect(oracleFor(concern.id, occurrence.id).servesConcern).toBe(false)
  })

  test("one universal learner-or-tool completion rule has false positives and false negatives", () => {
    const repair = fixtureById(returnConcerns, "repair-with-another-representation")
    const explanation = fixtureById(
      laterOccurrences,
      "assistant-complete-visible-memory-diagram",
    )
    const doneClaim = fixtureById(laterOccurrences, "learner-says-done")

    expect(laterLearnerOrToolWouldServe(explanation)).toBe(false)
    expect(oracleFor(repair.id, explanation.id).servesConcern).toBe(true)

    expect(laterLearnerOrToolWouldServe(doneClaim)).toBe(true)
    expect(oracleFor(repair.id, doneClaim.id).servesConcern).toBe(false)
  })

  test("serving future attention remains separate from evidence of learning", () => {
    const explanation = oracleFor(
      "repair-with-another-representation",
      "assistant-complete-visible-memory-diagram",
    )
    const independentCheck = oracleFor(
      "check-independent-prediction",
      "learner-independent-prediction",
    )

    expect(explanation).toMatchObject({
      servesConcern: true,
      evidenceBearingForConcern: false,
    })
    expect(independentCheck).toMatchObject({
      servesConcern: true,
      evidenceBearingForConcern: true,
    })
  })

  test("a partial assistant delta cannot settle a future-attention concern", () => {
    const concern = fixtureById(returnConcerns, "repair-with-another-representation")
    const partial = fixtureById(laterOccurrences, "assistant-partial-memory-diagram-delta")

    expect(targetOverlapWouldServe(concern, partial)).toBe(true)
    expect(partial.sourceStatus).toBe("partial-uncommitted")
    expect(oracleFor(concern.id, partial.id).servesConcern).toBe(false)
  })

  test("assistance conditions can change alignment even when target and chronology match", () => {
    const concern = fixtureById(returnConcerns, "check-independent-prediction")
    const guided = fixtureById(laterOccurrences, "learner-guided-prediction")

    expect(targetOverlapWouldServe(concern, guided)).toBe(true)
    expect(oracleFor(concern.id, guided.id)).toMatchObject({
      servesConcern: false,
      evidenceBearingForConcern: false,
    })
  })

  test("learner cancellation can dismiss attention without serving or evidencing it", () => {
    expect(
      oracleFor(
        "repair-with-another-representation",
        "learner-cancels-future-attention",
      ),
    ).toMatchObject({
      servesConcern: false,
      evidenceBearingForConcern: false,
    })
  })

  test("a stale target revision cannot be silently treated as aligned", () => {
    const concern = fixtureById(returnConcerns, "repair-with-another-representation")
    const stale = fixtureById(
      laterOccurrences,
      "assistant-memory-diagram-before-realignment",
    )

    expect(targetOverlapWouldServe(concern, stale)).toBe(false)
    expect(oracleFor(concern.id, stale.id).servesConcern).toBe(false)
  })

  test("same-Turn adaptation has a complete zero-domain-write counterexample", () => {
    expect(sameTurnAdaptation.nextMove).toContain("memory diagram")
    expect(sameTurnAdaptation.durableDomainWrites).toEqual([])
  })

  test("direct deadline help has a zero-Agenda-write counterexample", () => {
    expect(directDeadlineHelp.situation).toContain("deadline")
    expect(directDeadlineHelp.durableAgendaWrites).toEqual([])
  })
})
