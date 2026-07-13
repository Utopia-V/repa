# ADR-0003: Learning state follows evidence without treating the learner as an adversary

Status: Accepted
Date: 2026-07-10

Scope clarification (2026-07-11): this ADR governs claims about ability,
retention, and actions derived from those claims. A simple progress fact such
as "this material range was read" or "this range was explained" can be kept
without becoming learning evidence, an ability inference, or a verification
obligation.

## Context

Learning requires a cooperative learner. Designing an anti-cheat system for a
user who deliberately deceives their own private learning tool would add
friction without making learning reliable.

Cooperation does not imply perfect self-knowledge. Honest learners routinely
confuse recent familiarity, prompted performance, recognition, or time spent
with independent recall and durable ability. The system therefore needs to
respect self-report without assigning it the evidential force of an observed
assessment.

Requiring approval for every derived-state change through a mandatory StateDiff
would make routine use noisy. Many users would approve without reading it, so
the ceremony would not provide meaningful control.

## Decision

The system trusts the learner's intent but keeps provenance and evidence
strength explicit.

It distinguishes:

- an occurrence or report: what the system observed or the user stated;
- evidence: what that occurrence supports and under which conditions;
- inference: the system's current, fallible conclusion about learning state;
- action: a resulting change to plans, reviews, artifacts, or external systems.

A user report is recorded as the fact that the report occurred. Its content is
not silently promoted to independently verified performance. For example,
"watched a 45-minute video" may support exposure, but not verified mastery.

Session text is not learning evidence by default. An ordinary question,
clarification, or assistant explanation does not automatically change learner
state. If an interaction is admitted as learning-significant, it needs enough
educational purpose, observable conditions, and source provenance for the
resulting review or task-selection consequence to remain explainable. This ADR
does not require the interaction to have been marked in advance; that promotion
boundary remains a proposal-level question. The learning layer refers to the
original message, attempt, tool result, or artifact version rather than copying
the source content into a second authority.

Routine evidence and derived-state updates are non-blocking. They are applied
automatically when the provenance and rule are known, while remaining
inspectable, correctable, and reversible.

The system actively requests attention when:

- an inference is materially uncertain;
- plausible error attributions lead to different next actions;
- new evidence conflicts strongly with prior state or self-assessment;
- a proposed change has unusually large planning consequences;
- an action has an external or difficult-to-reverse effect.

Ambiguous evidence produces a hypothesis or diagnostic action rather than a
false precise conclusion. A learner may always override the immediate action,
such as skipping a review, without forcing the system to claim unsupported
mastery.

Corrections append new provenance. They do not erase the original observation
or rewrite history invisibly.

## StateDiff role

StateDiff is an audit and correction surface, not the universal permission gate
for learning-state updates.

Normal interaction may show a compact summary and keep details folded. Full
diffs remain available on demand. Exceptional uncertainty, contradiction, or
high-impact actions may expand the relevant evidence automatically.

External writes and irreversible actions continue to use the separate execution
permission policy; this decision does not weaken tool authorization.

## Consequences

- Evidence records require source and observable conditions such as
  self-report, independent answer, hints, and grading method. Confidence belongs
  to an inference and may be recomputed; it is not an original observation.
- Learner-state inference cannot be a direct copy of self-assessment.
- A learner error can change review pressure or local task priority without
  changing source-grounded curricular relations.
- The passage of time can change a derived review priority without creating a
  new evidence record.
- "I know this; skip it" may alter the immediate plan without producing a
  verified state transition.
- The planner must tolerate disagreement between self-assessment and observed
  performance.
- The UI should explain contradictions with evidence rather than moral language.
- Retraction and correction semantics are required before finalizing the event
  model.
- The product is not responsible for defeating a deliberately dishonest user.

## Rejected alternatives

### Treat all user reports as ground truth

Rejected because it collapses reported activity and demonstrated learning.

### Require confirmation for every inferred change

Rejected because repeated low-value confirmation becomes habituated approval
and interrupts the learning flow.

### Ignore user self-assessment

Rejected because the learner owns their goals, constraints, attention, and
immediate choices even when the system's epistemic assessment differs.
