# ADR-0012: Center the modular monolith on learning authorities

Status: Accepted

Date: 2026-07-12

## Context

ADR-0011 established a real single-process Tutor loop over mature Agent
mechanics. The next decision is larger: what owns the product as course,
material, learner history, review, assignments, and long-term continuation are
added.

Continuing to place prompt rendering, tool definitions, domain transitions,
and learning queries directly in `runTutorTurn` would make the Agent loop the
architectural center. That would reproduce a generic Agent with learning tools
and make each new feature another branch in one orchestrator.

The opposite response—building a universal event store, workflow engine,
knowledge graph, or plugin platform before their consumers exist—would freeze
speculative abstractions.

The decision is informed by:

- accepted product intent and the six complete learning traces;
- ALS-008/009 bounded, revision-aware material retrieval;
- ALS-012 compact overview plus lazy detail;
- ALS-019's rejection of list-plus-one-pointer course state;
- the fresh-Session production verification;
- ADR-0003/0008/0009/0010 learning-state, authority, identity, and policy
  semantics; and
- the maintainer's choices that one local learner authority spans Sessions,
  no daemon is required, and the Agent may research/create a coarse course when
  none exists.

## Decision

Repa is a single-process, local **modular monolith centered on learning
authorities**.

### Root and process

One local `LearnerHome` is the logical authority for one learner across
LearningSpaces, courses, workspaces, and Sessions. SQLite is the sole machine
state authority. One process owns state-changing execution for a LearnerHome at
a time. No background daemon is part of the product baseline; time-dependent
state is derived when the application wakes.

Session remains a durable interaction container, not the long-term learning
memory boundary. A fresh Session receives relevant state through queries and
does not import the old transcript.

### Learning authorities

The architecture keeps these meanings separate:

- interaction history and execution lifecycle;
- source/artifact identity and revisions;
- optional reusable domain foundations;
- versioned course views;
- revision-bound material maps and alignments;
- learner progress, activities, observations, evidence, and correctable
  inference;
- goals, assignments, deadlines, revisits, commitments, and temporary agenda;
  and
- Tutor policy and scoped learner steering.

They use typed references and explicit revisions. They are not stored in one
generic graph, event, fact, or mastery model.

A course view uses a versioned ordered hierarchy with sparse, module-owned,
typed and provenance-bearing relations. Material structure, learner state, and
agenda remain separate overlays. A graph database is not selected.

### Tutor composition and the Agent runtime

The Agent runtime is an outer execution mechanism. It owns one Turn's model
samples, tool continuation, cancellation, limits, and terminal result. It does
not own course or learner semantics.

Before every model sample, Tutor composition queries a bounded current learning
view, policy contributions, source references, dependency versions, and the
capabilities available to that sample. Exact materials, old Sessions, full
maps, and detailed evidence remain lazy reads. The resulting context cut is an
immutable observation, never the state authority.

The Learning System is a mixed-initiative, receding-horizon controller of its
own Tutor behavior:

- code owns hard constraints, trusted time/source/identity, domain legality,
  and deterministic consequences;
- the LLM may research, explain, demonstrate, choose local moves, propose or
  refine routes, and initiate real authorized commands; and
- the learner owns goals and current steering and may interrupt or override.

Open conversational teaching does not require a domain transition. Only useful
long-term meaning, a commitment, learning-domain state, or an external effect
passes through an explicit command.

### Commands, queries, and capabilities

Writes use domain-owned commands with a trusted execution envelope,
command-specific causal/effect identity, entity-specific preconditions,
atomic SQLite settlement, an immutable causal receipt, and correction or
supersession behavior. Commands name meaningful transitions rather than generic
CRUD.

Reads use consumer-specific projections. Command/query separation is an
internal ownership rule, not authorization for a generic bus, separate CQRS
deployment, or event sourcing.

Generic Agent capabilities and learning commands are defined separately from
their sample-bound executable bindings. At minimum, capability metadata
distinguishes read-only observation, reversible local learning writes,
workspace/artifact mutation, and external effects. Generic tool output cannot
become learning state without an explicit domain command.

### Course creation without material

The same Tutor loop may use file/web/search/model capabilities to propose a
coarse Course View. A routine local command may commit it as a working,
provisional, correctable route. Model-prior assertions remain marked as such;
they cannot silently become hard prerequisites or learner ability. Later
sources create a new revision and explicit reconciliation rather than silently
rewriting the old route or progress.

### Persistence and revision

The system distinguishes Session order, local commit order, mutable entity
versions, immutable course-view revisions, artifact content revisions, policy
revisions, and model context cuts. One global revision is not a universal
stale-write guard. It may remain as a temporary commit watermark for the
existing steering slice, while new commands validate only their actual entity
and source preconditions.

Large source/material content may remain in files or a content cache. SQLite
stores authoritative metadata, identity, revisions, selectors, domain state,
and bounded observed content needed for provenance.

## Dependency rules

- Learning-domain modules do not import AI SDK, providers, or terminal code.
- Interaction lifecycle does not infer learning meaning from text.
- Context composition uses queries and performs no domain writes.
- Model-initiated learning changes enter only through sample-bound capability
  bindings and domain commands.
- Provider, filesystem, web, and terminal integrations are outer adapters.
- SQLite need not be hidden by repository interfaces without a second real
  storage implementation or external boundary.
- Future directories and abstractions are introduced with real consumers, not
  scaffolded from this ADR alone.

The complete ownership and failure model is recorded in
[`../architecture/00-system-architecture.md`](../architecture/00-system-architecture.md).

## Consequences

- `runTutorTurn` remains the current executable spine but cannot become the
  owner of every prompt contribution, tool, and learning transition.
- The next course/material consumers earn structured context contributions,
  capability composition, and migration separation; these are not built as an
  unused framework first.
- `system_state.state_revision` and `durable_effect` are proven mechanisms for
  the current steering slice, not mandatory universal schemas for future
  domains.
- Inspection and correction remain part of each domain slice even before a
  full-screen TUI exists.
- A global state machine, universal ontology, event-sourced blackboard,
  property-graph database, plugin platform, HTTP server, and microservices are
  outside the accepted architecture.

## Alternatives rejected

### Agent-loop-centered layering

Rejected because the loop would become a god orchestrator and durable learning
semantics would drift into prompts and tool glue.

### One global learning state machine

Rejected because open teaching and learner intervention do not have one legal
sequence. Explicit state machines remain appropriate for bounded objects such
as Turns, commands, assignments, and corrections.

### Event-sourced or graph blackboard

Rejected because it requires every concern to share one event/edge language
and projection engine before a real replay or dense traversal consumer exists.
Immutable receipts and provenance are retained without adopting that center.

### Artifact-centered workspace

Rejected as the center because artifacts cannot by themselves own goals,
course progress, due work, evidence meaning, and Tutor policy. Artifacts remain
first-class sources and outputs.

## Reconsideration triggers

Reconsider the process or storage topology only when a real second writer,
remote client, background execution requirement, or measured traversal/search
pressure cannot be handled by the current ownership boundary.

Reconsider a richer domain or learner ontology only when at least one concrete
Tutor decision cannot be represented honestly by course/material/history/
agenda state and its source provenance.

Do not reconsider because a framework, graph database, or upstream Agent
already exposes more machinery.
