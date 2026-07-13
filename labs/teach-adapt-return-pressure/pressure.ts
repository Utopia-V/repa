/**
 * Deterministic architecture-pressure fixtures.
 *
 * Every label in this file is an oracle name for a bounded counterexample.
 * None of these unions is a proposed production ontology or command schema.
 */

export type FixtureMove =
  | "memory-diagram-explanation"
  | "contrast-identity-cases"
  | "independent-prediction"
  | "contrasting-strategy-choice"

export type FixtureRole = "assistant" | "learner" | "tool"

export type ReturnConcernFixture = {
  id: string
  targetRef: string
  targetRevision: string
  originRef: string
  eligibleAt: number
  boundedReason: string
  acceptableMoves: readonly FixtureMove[]
}

export type LaterOccurrenceFixture = {
  id: string
  targetRef: string
  targetRevision: string
  role: FixtureRole
  occurredAfterCreation: boolean
  sourceStatus: "durable-complete" | "partial-uncommitted"
  learnerFacing: boolean
  description: string
}

export type LaterContextVariant = {
  concernId: string
  currentContext: string
  acceptableMove: FixtureMove
}

export type RelationOracle = {
  concernId: string
  occurrenceId: string
  servesConcern: boolean
  evidenceBearingForConcern: boolean
  explanation: string
}

const TARGET = "course:javascript/section:object-references"
const TARGET_REVISION = "course-view:javascript@3"
const ORIGIN = "attempt:aliasing-1"
const ELIGIBLE_AT = 10_000

/**
 * Three alternative accepted reasons for returning to the same source and
 * target at the same time. A representation that keeps only those shared
 * coordinates cannot tell which learning purpose must shape the later move.
 * One purpose deliberately permits more than one valid form.
 */
export const returnConcerns: readonly ReturnConcernFixture[] = [
  {
    id: "repair-with-another-representation",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    originRef: ORIGIN,
    eligibleAt: ELIGIBLE_AT,
    boundedReason:
      "Repair the learner's causal model of shared object identity after the earlier explanation failed.",
    acceptableMoves: ["memory-diagram-explanation", "contrast-identity-cases"],
  },
  {
    id: "check-independent-prediction",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    originRef: ORIGIN,
    eligibleAt: ELIGIBLE_AT,
    boundedReason:
      "Check whether the learner can predict object-aliasing behavior independently after a delay.",
    acceptableMoves: ["independent-prediction"],
  },
  {
    id: "discriminate-aliasing-from-copying",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    originRef: ORIGIN,
    eligibleAt: ELIGIBLE_AT,
    boundedReason:
      "Exercise choosing between aliasing and copying when both models are plausible.",
    acceptableMoves: ["contrasting-strategy-choice"],
  },
]

/**
 * The same stored purpose can support different concrete forms after current
 * learner steering is considered. ALS-020 does not test whether a model makes
 * either choice reliably.
 */
export const laterContextVariants: readonly LaterContextVariant[] = [
  {
    concernId: "repair-with-another-representation",
    currentContext: "The learner asks for a spatial account and is open to a diagram.",
    acceptableMove: "memory-diagram-explanation",
  },
  {
    concernId: "repair-with-another-representation",
    currentContext: "The learner says diagrams are not helping and asks to compare concrete cases.",
    acceptableMove: "contrast-identity-cases",
  },
]

export const laterOccurrences: readonly LaterOccurrenceFixture[] = [
  {
    id: "assistant-complete-visible-memory-diagram",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    role: "assistant",
    occurredAfterCreation: true,
    sourceStatus: "durable-complete",
    learnerFacing: true,
    description: "The Tutor uses a materially different memory diagram to explain shared object identity.",
  },
  {
    id: "assistant-partial-memory-diagram-delta",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    role: "assistant",
    occurredAfterCreation: true,
    sourceStatus: "partial-uncommitted",
    learnerFacing: true,
    description:
      "The provider streams part of a memory-diagram explanation, then the Turn is interrupted before a complete durable item exists.",
  },
  {
    id: "learner-independent-prediction",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    role: "learner",
    occurredAfterCreation: true,
    sourceStatus: "durable-complete",
    learnerFacing: true,
    description:
      "The learner independently predicts a new aliasing example; correctness is recorded separately from whether the check happened.",
  },
  {
    id: "learner-guided-prediction",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    role: "learner",
    occurredAfterCreation: true,
    sourceStatus: "durable-complete",
    learnerFacing: true,
    description: "The learner gives the requested prediction after the Tutor supplies the decisive hint.",
  },
  {
    id: "learner-contrasts-confusable-cases",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    role: "learner",
    occurredAfterCreation: true,
    sourceStatus: "durable-complete",
    learnerFacing: true,
    description: "The learner chooses between aliasing and copying in cases where either strategy is plausible.",
  },
  {
    id: "tool-reports-obvious-overlap",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    role: "tool",
    occurredAfterCreation: true,
    sourceStatus: "durable-complete",
    learnerFacing: false,
    description:
      "A later assignment happens to mention objects, but the completed step never requires alias/copy discrimination.",
  },
  {
    id: "learner-says-done",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    role: "learner",
    occurredAfterCreation: true,
    sourceStatus: "durable-complete",
    learnerFacing: true,
    description: "The learner says only that the revisit is done, without an activity that serves its recorded reason.",
  },
  {
    id: "learner-cancels-future-attention",
    targetRef: TARGET,
    targetRevision: TARGET_REVISION,
    role: "learner",
    occurredAfterCreation: true,
    sourceStatus: "durable-complete",
    learnerFacing: true,
    description:
      "The learner explicitly cancels the future concern; Agenda may dismiss it without claiming that its purpose was served.",
  },
  {
    id: "assistant-memory-diagram-before-realignment",
    targetRef: TARGET,
    targetRevision: "course-view:javascript@4",
    role: "assistant",
    occurredAfterCreation: true,
    sourceStatus: "durable-complete",
    learnerFacing: true,
    description:
      "A useful explanation is grounded in a newer course/material revision before the old target is explicitly realigned.",
  },
]

/**
 * The matrix records scenario oracles, not a generic satisfaction algorithm.
 * An omitted pair is deliberately outside the proof rather than implicitly
 * false for every future product situation.
 */
export const relationOracles: readonly RelationOracle[] = [
  {
    concernId: "repair-with-another-representation",
    occurrenceId: "assistant-complete-visible-memory-diagram",
    servesConcern: true,
    evidenceBearingForConcern: false,
    explanation:
      "A complete learner-facing alternate representation served the future-attention purpose, but it is not evidence of learner understanding.",
  },
  {
    concernId: "repair-with-another-representation",
    occurrenceId: "assistant-partial-memory-diagram-delta",
    servesConcern: false,
    evidenceBearingForConcern: false,
    explanation:
      "A partial provider delta without a complete durable learner-facing occurrence cannot settle the concern.",
  },
  {
    concernId: "check-independent-prediction",
    occurrenceId: "assistant-complete-visible-memory-diagram",
    servesConcern: false,
    evidenceBearingForConcern: false,
    explanation: "More explanation does not perform the promised independent check.",
  },
  {
    concernId: "check-independent-prediction",
    occurrenceId: "learner-independent-prediction",
    servesConcern: true,
    evidenceBearingForConcern: true,
    explanation:
      "The independent attempt performs the check; its actual answer and conditions determine what evidence it supplies.",
  },
  {
    concernId: "check-independent-prediction",
    occurrenceId: "learner-guided-prediction",
    servesConcern: false,
    evidenceBearingForConcern: false,
    explanation: "A decisive hint changes the cognitive role and cannot stand in for the promised independent check.",
  },
  {
    concernId: "discriminate-aliasing-from-copying",
    occurrenceId: "learner-contrasts-confusable-cases",
    servesConcern: true,
    evidenceBearingForConcern: true,
    explanation:
      "The activity actually requires the intended discrimination; correctness remains a separate observed result.",
  },
  {
    concernId: "discriminate-aliasing-from-copying",
    occurrenceId: "tool-reports-obvious-overlap",
    servesConcern: false,
    evidenceBearingForConcern: false,
    explanation: "Topic overlap does not exercise strategy discrimination.",
  },
  {
    concernId: "repair-with-another-representation",
    occurrenceId: "learner-says-done",
    servesConcern: false,
    evidenceBearingForConcern: false,
    explanation:
      "A learner may cancel or dismiss future attention, but the statement alone does not show that the recorded purpose was served.",
  },
  {
    concernId: "repair-with-another-representation",
    occurrenceId: "learner-cancels-future-attention",
    servesConcern: false,
    evidenceBearingForConcern: false,
    explanation:
      "Cancellation can dismiss Agenda attention without serving the teaching purpose or producing learning evidence.",
  },
  {
    concernId: "repair-with-another-representation",
    occurrenceId: "assistant-memory-diagram-before-realignment",
    servesConcern: false,
    evidenceBearingForConcern: false,
    explanation: "A revision mismatch requires explicit realignment before target alignment can be claimed.",
  },
]

export const sameTurnAdaptation = {
  situation: "The learner says the first prose explanation did not help.",
  nextMove: "Use a memory diagram in the same Turn.",
  durableDomainWrites: [] as const,
}

export const directDeadlineHelp = {
  situation:
    "The learner asks for direct help before a deadline and neither party creates a later learning concern.",
  durableAgendaWrites: [] as const,
}

export function legacyCoordinateKey(concern: ReturnConcernFixture) {
  return JSON.stringify({
    targetRef: concern.targetRef,
    targetRevision: concern.targetRevision,
    originRef: concern.originRef,
    eligibleAt: concern.eligibleAt,
  })
}

export function boundedMeaningKey(concern: ReturnConcernFixture) {
  return JSON.stringify({
    coordinates: legacyCoordinateKey(concern),
    boundedReason: concern.boundedReason,
  })
}

export function targetOverlapWouldServe(
  concern: ReturnConcernFixture,
  occurrence: LaterOccurrenceFixture,
) {
  return (
    occurrence.occurredAfterCreation &&
    occurrence.targetRef === concern.targetRef &&
    occurrence.targetRevision === concern.targetRevision
  )
}

/**
 * A deliberately generous proxy for the old B1 completion rule. It still
 * demonstrates that source role plus chronology cannot establish alignment.
 */
export function laterLearnerOrToolWouldServe(occurrence: LaterOccurrenceFixture) {
  return occurrence.occurredAfterCreation && occurrence.role !== "assistant"
}

export function oracleFor(concernId: string, occurrenceId: string) {
  const oracle = relationOracles.find(
    (candidate) =>
      candidate.concernId === concernId && candidate.occurrenceId === occurrenceId,
  )
  if (!oracle) throw new Error(`No bounded oracle for ${concernId} -> ${occurrenceId}`)
  return oracle
}

export function fixtureById<T extends { id: string }>(fixtures: readonly T[], id: string) {
  const fixture = fixtures.find((candidate) => candidate.id === id)
  if (!fixture) throw new Error(`Unknown fixture: ${id}`)
  return fixture
}
