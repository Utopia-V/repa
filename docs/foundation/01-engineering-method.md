# Engineering method

## Objective

Use AI to increase the rate of understanding and implementation without delegating architectural ownership. The project should remain understandable to a developing engineer and should not accumulate generated structure that only another model can navigate.

## Work sequence

For a new mechanism:

1. Locate the corresponding behavior in a mature reference implementation.
2. Trace its inputs, outputs, state transitions, failure paths, and tests.
3. State whether this project has the same problem.
4. Design the smallest complete boundary that solves this project's problem.
5. Write or approve the critical types and invariants.
6. Let AI implement bounded code inside the approved boundary.
7. Verify behavior with tests or a recorded oracle.
8. Remove temporary scaffolding and update the decision record.

This is neither a one-prompt generation workflow nor a permanent prototype. Experiments are allowed, but they are isolated from production code and are discarded after their conclusions are captured.

## Human-owned decisions

The maintainer owns product goals, values, and acceptable trade-offs and must be
able to explain and approve:

- module boundaries and dependency direction;
- the agent run state machine;
- durable session and message semantics;
- tool-call states and interruption behavior;
- permission and confirmation boundaries;
- learning evidence and state semantics;
- transaction, recovery, and migration behavior.

Human ownership does not make every technical instruction correct. Source
behavior, failure properties, and empirical claims remain subject to evidence.
AI should challenge a technically unsound means with concrete reasoning while
preserving the maintainer's intended outcome.

## Appropriate AI work

AI is useful for:

- navigating and explaining reference source;
- finding call sites and missing failure paths;
- implementing adapters against an approved interface;
- writing tests that exercise real behavior;
- checking duplication and architecture drift;
- reviewing a change against repository invariants;
- performing mechanical edits after the semantic change is understood.

AI must not invent a new subsystem while implementing an unrelated feature. When a missing architectural decision is discovered, implementation stops at that boundary and records the decision explicitly.

## Meaning preservation

Conversation is useful for discovering intent but is not a durable
specification. Natural-language summaries can preserve the vocabulary while
losing the operational meaning.

Before a critical implementation slice, record a small semantic checksum:

```text
product-loop purpose
owned durable fact or invariant
one representative behavior
one counterexample or prohibited behavior
failure and correction behavior
```

Use more than one scenario when a single repeated example may bias the design.
An emergency exam-planning scenario, for example, cannot by itself define the
steady-state behavior of a long-running Tutor.

Accepted product intent, accepted ADRs, working hypotheses, research findings,
and illustrative examples have different authority. Promotion between them is
explicit. A research term such as `LearnerClaim` or `TaskFamily` does not become
a class, table, or package merely because it helped explain a problem.

Tests and recorded oracles should encode observable consequences rather than
internal wording. A refactor may change the prompt or representation while
preserving the meaning; an unchanged prompt may still violate the meaning if
its surrounding context or tools change.

## Disagreement protocol

Neither the maintainer nor an AI reviewer is treated as infallible.

When a requested means conflicts with evidence or an accepted invariant:

1. identify the intended product outcome separately from the proposed means;
2. cite the source, test, trace, or failure case that creates the conflict;
3. state whether the conflict is factual, architectural, or a value trade-off;
4. propose the smallest reversible way to preserve the outcome;
5. request a maintainer decision only when the remaining choice materially
   changes product behavior or an expensive-to-reverse boundary.

Do not use deference to conceal a known engineering problem. Do not use
technical confidence to replace a product value chosen by the maintainer.

For consequential boundaries, an independent model or human review can expose
blind spots. Agreement between reviewers is supporting evidence, not proof;
the repository's sources, invariants, and executable behavior remain decisive.

## Production and lab separation

- `labs/` contains mechanism experiments with an explicit question and deletion condition.
- Production code must never import from `labs/`.
- A successful experiment contributes a written conclusion and tests/oracles; its structure is not automatically promoted.
- A failed experiment is deleted rather than maintained for sentiment or sunk cost.

## Change acceptance

A production change is acceptable only when:

- its product-loop purpose is named;
- its owner and dependencies are clear;
- state transitions and failures are explicit;
- validation exists at untrusted boundaries;
- persistent changes have migration/recovery behavior;
- relevant checks pass;
- no duplicate domain concept was introduced.

## Avoiding local-gradient traps

At each phase boundary, review the repository from the product loop outward rather than from the latest file inward. A locally elegant implementation is rejected when it increases generic-agent scope, obscures learning semantics, creates a second source of truth, or makes future state correction harder.

The phase review also checks whether conversation shorthand, one vivid example,
or a temporary experiment has silently become architecture. If so, recover the
underlying invariant and delete the accidental structure.
