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

The maintainer must be able to explain and approve:

- module boundaries and dependency direction;
- the agent run state machine;
- durable session and message semantics;
- tool-call states and interruption behavior;
- permission and confirmation boundaries;
- learning evidence and state semantics;
- transaction, recovery, and migration behavior.

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
