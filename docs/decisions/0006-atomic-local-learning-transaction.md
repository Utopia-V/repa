# ADR-0006: Settle related local learning writes atomically

Status: Accepted; amended after the learning-path review

Date: 2026-07-11

## Context

A runtime-owned learning command may write a simple progress fact, record a
formal task result, schedule a revisit, correct an earlier interpretation, or
combine several related local effects. If the durable effect commits while the
matching tool invocation is reported as failed, recovery and replay can produce
two conflicting accounts of the same operation.

The original version of this ADR prescribed a fixed bundle containing a formal
result, evidence interpretation, learner projection, and scheduling
consequence. ALS-015/ALS-016 did not earn that bundle as the first product path.
Teaching and material progress also do not naturally create all of those roles.

## Decision

SQLite is the sole authoritative machine store in the first implementation.

When a runtime-owned local command creates durable learning facts, one SQLite
transaction:

1. validates the operation identity, current preconditions, and any source
   reference the command actually requires;
2. writes only the progress, result, revisit, correction, or other local effects
   that the command owns; and
3. settles the matching tool invocation with its model-visible result.

All effects commit, or none do. Exact replay is idempotent. Reuse of an
operation identity with conflicting input is rejected.

When a command distinguishes an observation, a fallible interpretation, and a
resulting action, those roles and their provenance remain queryable. The
decision does not require every command to contain all three. It does not
require a learner projection, mastery value, or review obligation.

A simple "this section was explained" update may remain one progress fact. An
explanation with no useful durable change requires no learning transaction.

Corrections append provenance and update the affected derived state. They do
not erase the original Session item, artifact, or observed result.

## Consequences

- Atomicity protects the effects a command really owns; it does not define a
  universal learning record.
- A model may propose an interpretation but cannot make an unsupported source
  fact true by writing a mastery value.
- Assistance, grading method, and uncertainty are retained only when they
  change the meaning of the result or a future action.
- Time can make a stored revisit due without creating a new observation.
- Read-only tools and Tutor responses with no durable learning write need no
  effect receipt.
- Files, Anki, MCP, assignment submission, and other external effects remain
  outside this local transaction until their connectors define idempotency and
  reconciliation.

## Counterexample

A command records that a local revisit is due and returns a successful tool
result. The process crashes after the revisit commits but before the tool
settlement is durable. Without one transaction, recovery can repeat the command
or tell the Tutor that no revisit was recorded. The accepted boundary commits
the actual revisit and its tool settlement together; it does not invent a
learner projection to complete a fixed bundle.
