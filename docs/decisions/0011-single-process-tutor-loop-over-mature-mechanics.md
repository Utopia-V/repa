# ADR-0011: Build one Repa-owned Tutor loop over mature agent mechanics

Status: Accepted

Date: 2026-07-12

## Clarification after the Session-context correction

This decision does not authorize a thin custom loop to stand in for a normal
terminal-agent harness. The ordinary Agent substrate may be adapted or cleanly
reimplemented from OpenCode or Codex as readily as it may be composed from a
library. Learning context and durable learning state are additional consumers
and contributions; they do not replace same-Session dialogue, structured tool
continuation, streaming, cancellation, compaction, or truthful resumption.

AI SDK supplies useful provider and tool-call transport. It is not the owner of
the complete Session, context-window, orchestration, or terminal-agent
architecture. The completed dogfood trace proves one vertical integration path,
not completion of the generic harness beneath the product.

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

Mature libraries own generic mechanics where their public contracts suffice;
otherwise Repa may adapt or reimplement the corresponding proven reference
mechanism without first manufacturing a learning-specific justification:

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
will adapt their demonstrated generic architecture, ownership, and failure
semantics where Repa has the same problem, without copying their module names,
dependency systems, coding tools, or product topology by default. No new
comparative architecture study is required for each ordinary harness feature.

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

Adapting or cleanly reimplementing generic OpenCode/Codex mechanisms is already
authorized by this decision and is not a fallback. Reconsider a direct OpenCode
fork, a sidecar engine, or another runtime when clean TypeScript/Bun adaptation
would require maintaining a substantial duplicate engine or when a measured
trace exposes a boundary the chosen substrate cannot preserve. Reconsider the
single-process execution lane only when a real concurrent or remote consumer
requires a different owner.

Line count, aesthetic preference, or the existence of a feature upstream is
not a reconsideration trigger.
