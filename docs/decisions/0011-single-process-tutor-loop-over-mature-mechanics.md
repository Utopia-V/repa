# ADR-0011: Build one Repa-owned Tutor loop over mature agent mechanics

Status: Accepted

Date: 2026-07-12

## Context

The repository has enough source research to stop treating the runtime shape as
an open-ended architecture survey. OpenCode and Codex converge on a small
control kernel: one admitted user interaction may contain several model
samples, tools execute through a runtime-owned capability boundary, tool
observations feed later samples, cancellation belongs to the active executor,
and durable product state is separate from provider deltas and UI projection.

The references do not expose a stable, product-neutral embedded kernel that
Repa can adopt without also inheriting coding-agent Session, context,
persistence, tool, and UI semantics. Directly copying their package topology
would preserve product history rather than the demonstrated invariant.

ALS-018 implemented several useful learning-semantic oracles but also created a
partial generic host before a real runner existed. Continuing contract by
contract would add more tables without producing a usable Tutor.

## Decision

Repa will implement one single-process, model-led Tutor loop in TypeScript/Bun.

The project owns the composition and product meaning of:

- admission of one learner input into a user-visible Turn;
- the boundary between that Turn, each model-sampling step, and tool work;
- compilation of learning state and Tutor policy before each model sample;
- trusted identity, source, revision, time, permission, and transaction
  semantics for durable learning commands;
- truthful terminal, interruption, and reopen behavior; and
- the durable Session and learning projections needed for later continuation.

Mature libraries own generic mechanics where their public contracts suffice:

- AI SDK owns provider adapters, model-request transport, streaming reduction,
  tool-call schema/transport, ordinary tool continuation, and abort
  propagation;
- Bun and SQLite provide the process and authoritative local machine store; and
- a terminal rendering library may later own input/rendering primitives while
  consuming runtime events rather than owning execution.

The mere existence of a model-callable write tool is ordinary Agent machinery,
not a Repa subsystem or product differentiator. Repa-specific work begins only
where a call would change durable learning meaning: the system binds authority,
source, scope, identity, time, and legal state transitions, while the generic
runtime still carries the call.

One active Session has one Turn-driving execution lane. A Turn may perform
several model samples. Before every sample, Repa compiles the relevant current
learning contribution. A model-initiated learning command may change durable
state between samples; the next sample receives a newly compiled contribution.

OpenCode and Codex remain pinned behavioral references and fault oracles. Repa
will adapt their demonstrated ownership and failure semantics, not their
module names, dependency systems, server protocols, coding tools, or product
topology. No new comparative architecture study is required before the first
dogfood loop.

## First product consequence

The next production milestone is a headless/terminal Tutor Turn that can:

```text
admit natural-language learner input
-> compile current learning context
-> call a real model through the AI SDK
-> execute a source-bound learning command when selected
-> compile the changed context for the next sample
-> produce and persist the Tutor response
-> close and reopen without duplicating the learning effect
```

This is the first consumer that decides which ALS-018 interaction records
survive. Existing code is an oracle, not a compatibility target; wrong host
shapes may be deleted rather than wrapped.

## Consequences

- Product feedback now takes priority over further general harness research.
- A new runtime abstraction requires two real consumers or one demonstrated
  ownership/failure boundary.
- Provider wire protocols, a general event bus, plugin platform, HTTP server,
  workflow engine, distributed actor system, and product-scale TUI are outside
  the first loop.
- Course-route and material-position work remains independent. It may advance
  when its own behavior cases earn a representation, but it does not block the
  Tutor loop.
- The first UI may be plain terminal I/O. Rendering quality is not allowed to
  delay a truthful headless runtime, and the headless runtime is not allowed to
  become the permanent UI owner.

## Reconsideration triggers

Reconsider direct OpenCode modification, a sidecar engine, or another runtime
only if a measured product trace shows that the selected libraries hide a
required sampling/tool/cancellation boundary and Repa would otherwise have to
reimplement substantial generic machinery. Reconsider the single-process
execution lane only when a real concurrent or remote consumer requires a
different owner.

Line count, aesthetic preference, or the existence of a feature upstream is
not a reconsideration trigger.
