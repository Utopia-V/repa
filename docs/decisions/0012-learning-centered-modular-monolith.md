# ADR-0012: Center the modular monolith on learning authorities

Status: Accepted; runtime and persistence composition amended by
[ADR-0014](./0014-one-time-opencode-fork.md)

Date: 2026-07-12

Amendment (2026-07-17): the production fork does not carry the pre-fork
`system_state` or `durable_effect` schema. Their demonstrated behavior remains
oracle evidence; native retained steering and other authorities earn their own
revisions and records through the active roadmap.

Amendment (2026-07-27): `Agenda` is a family and composition label, not a
universal durable or transactional authority. Goal, future attention,
Assignment, planning, and any later consumer-earned detour or commitment keep
their own sources, legal transitions, correction, and failure semantics.
Semantic separation does not require one package, table, service, or Gate per
meaning.

Amendment (2026-08-08): an Assignment is an independently valid substantial
learning-relevant obligation; a planning allocation is a source-bearing,
correctable working plan. Neither is automatically a generic learner
commitment or activity record, and neither makes completing countable tasks the
product objective. Assignment state enters ordinary behavior only through a
real teaching, guided-work, review, or Planning consumer.
Repa may be used intermittently or alongside learning outside the program, so
clock passage, an elapsed allocation, silence, or absence cannot create
progress, non-progress, completion, cancellation, breach, or abandonment.
Assignment lifecycle changes require an explicit Assignment-owned transition;
planning re-entry preserves exact prior inputs, exposes stale or unknown truth,
and recomputes only from newly accepted facts. This semantic separation does
justify distinct acceptance boundaries when their migrations, recovery,
evidence, and reopen conditions are independently useful; Roadmap 09 owns the
resulting Gate topology.

Inside Planning, accepted portfolio input, deterministic assessment, and
source-bearing allocation also settle as staged facts under one authority. An
accepted correction survives later assessment or proposal failure, and an
assessment survives an invalid allocation; this recovery distinction does not
create three domain authorities or a second runtime.

## Context

The initial ADR-0011 runner established a real single-process Tutor loop and
proved that learning state can govern ordinary Agent execution. ADR-0014 later
superseded that runner with a one-time OpenCode fork. This decision answers the
larger question that survives the substrate change: what owns the product as
course, material, learner history, review, assignments, and long-term
continuation are added.

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
state is derived when the application wakes. A wake or later interaction does
not imply that Repa observed the interval while it was not running.

Courses belong directly to LearnerHome. Several Courses may remain ongoing at
once, and a Course may use material from several LearningSpaces or approved
roots. Filesystem grouping and the optional default Course used for
underspecified context are neither Course ownership nor Course lifecycle.

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
- separate Goal, future-attention, Assignment, planning, and any
  consumer-earned detour or commitment authorities; and
- Tutor policy and scoped learner steering.

They use typed references and explicit revisions. They are not stored in one
generic graph, event, fact, or mastery model.

Assignment owns obligation identity, exact revisions, source-bearing
correction, optional due meaning, and explicit lifecycle. Planning may consume
an exact Assignment or Goal revision but owns accepted workload/capacity facts,
feasibility, allocation, staleness, feedback, and recomputation instead. A
valid Assignment may exist without a plan, and planning failure does not roll
it back. Cross-owner create-and-plan therefore settles in stages unless a later
application operation demonstrates a genuine all-or-none learner invariant.
Within Planning, input, assessment, and allocation likewise have separate
settlement so downstream failure cannot restore obsolete inputs.
The ordinary Tutor still owns the open semantic choice of how to help the
learner; neither Assignment disposition nor Planning arithmetic is a substitute
for explanation, demonstration, guided work, practice, review, or adaptation.

A course view uses a versioned ordered hierarchy with sparse, module-owned,
typed and provenance-bearing relations. Material structure, learner state, and
agenda-family authorities remain separate overlays. A graph database is not
selected.

A Course may exist before an honest route has been formed. It may retain
several route-strategy Views and their exact revisions while selecting zero or
one eligible revision for default navigation and durable targets. Working,
historical, and candidate are derived relations of exact eligible revisions,
not stored View lifecycle states. Course creation does not require a fabricated
placeholder View. A selection is working state, not objective curriculum truth.
Temporary focus normally belongs to the current Interaction. A demonstrated
cross-Turn consumer may earn a distinct detour/rejoin authority within the
agenda family; the family name itself owns no generic current-item pointer.

A Course View is a stable identity for one continuing route strategy. Each
accepted structure is an immutable revision of that View, while a materially
different organizing strategy is another View under the same Course. The
working selection pins an exact revision and does not follow later revisions
automatically. This is not a general version-control or merge model.

A learner may explicitly author a View or directly request adoption of an
exact candidate revision without a redundant confirmation. Repa or the Tutor
may form an unselected candidate without changing navigation, but a
Tutor-initiated change to the working selection requires learner acceptance.
The old revision remains durable and existing references are not retargeted.

Course item identity continues across revisions only through an explicit
accepted mapping. Meaning-preserving rename or movement may reuse an identity;
split, merge, semantic change, ambiguity, or conflict defaults to new
identities and a recorded transition mapping. The learner may direct the LLM
to author the transformation under supervision, while the domain authority
validates the mapping and never silently migrates downstream learning state.

Ordinary Course/View/Revision removal is reversible withdrawal from discovery
and selection. It preserves immutable identity, revisions, and references and
is not completion, abandonment, mastery, or physical deletion. Course
withdrawal clears its selection; View or Revision withdrawal may clear or
legally replace it within that Course. Any rejection or withdrawal that can
observe or change working selection compares the exact expected target and its
independent selection version in the same transaction. A non-null replacement
also checks the replacement View and Revision's expected versions; clear and
replacement both advance the selection version. Restoration never selects
implicitly. Physical deep deletion is a later cross-authority operation that
must show its impact and receive explicit learner authorization.

The post-Gate-6 logical relationships and staged native admission boundaries
are recorded in the
[native learning data model](../architecture/01-native-learning-data-model.md).

### Tutor composition and the Agent runtime

The Agent runtime is an outer execution mechanism. It owns one Turn's model
samples, tool continuation, cancellation, limits, and terminal result. It does
not own course or learner semantics.

Before every admitted interactive Tutor/Agent model sample, Tutor composition
queries a bounded current learning view, policy contributions, source
references, dependency versions, and the capabilities available to that
sample. Exact materials, old Sessions, full maps, and detailed evidence remain
lazy reads. The resulting context cut is an immutable observation, never the
state authority. Program-owned internal model operations retain their narrow
purpose contracts and do not receive the interactive learning view.

The Learning System is a mixed-initiative, receding-horizon controller of its
own Tutor behavior:

- code owns hard constraints, trusted time/source/identity, domain legality,
  and deterministic consequences;
- the ordinary interactive LLM is the default for open-language interpretation,
  contextual reference, research, explanation, demonstration, local move
  choice, route proposals, and real authorized command initiative; and
- the learner owns goals and current steering and may interrupt or override.

Code supplies bounded trustworthy views and typed tools to that Agent. It does
not add a parallel phrase parser, semantic resolver, candidate-proof protocol,
or preliminary controller unless a specific non-linguistic invariant or
observed product failure requires one. Explicit truncation helps the Agent
decide whether to read more or clarify; it does not let code certify a natural
language interpretation.

Open conversational teaching does not require a domain transition. Only useful
long-term meaning, a commitment, learning-domain state, or an external effect
passes through an explicit command.

### Commands, queries, and capabilities

Writes use domain-owned commands with a trusted execution envelope,
command-specific causal/effect identity, entity-specific preconditions,
atomic SQLite settlement, an immutable causal receipt, and correction or
supersession behavior. Commands name meaningful transitions rather than generic
CRUD.

Physical admission may establish the domain authority before model command
settlement exists. At that earlier boundary, an application-bound authorship
basis is only the trusted caller's declaration; it is not proof of a learner
message, model invocation, acceptance, or source grounding, and it does not
change when the Revision is later selected. Model-issued writes remain
unavailable until the causal receipt can bind those claims.

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
stale-write guard. A context cut may record a database commit watermark for
audit, while each command validates only the entity, source, and policy
preconditions that make its own transition legal.

Large source/material content may remain in files or a content cache. SQLite
stores authoritative metadata, identity, revisions, selectors, domain state,
and bounded observed content needed for provenance.

## Dependency rules

- Learning-domain modules do not import AI SDK, providers, or terminal code.
- Interaction lifecycle does not infer learning meaning from text.
- Context composition uses queries and performs no domain writes.
- Model-visible domain queries may support contextual reference and lazy detail
  without becoming automatic context injection or learner-facing management
  surfaces.
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

- The pre-fork `runTutorTurn` remains behavioral evidence in the immutable
  oracle, not a compatibility API. Source/runtime lineage cutover is complete;
  the forked Agent runtime still cannot become the owner of every prompt
  contribution, tool, and learning transition.
- The next course/material consumers earn structured context contributions,
  capability composition, and migration separation; these are not built as an
  unused framework first.
- Pre-fork `system_state.state_revision` and `durable_effect` behavior informs
  native steering and settlement design, but neither is a current production
  schema or a mandatory universal shape for future domains.
- Inspection and correction remain part of each domain slice even before a
  full-screen TUI exists.
- A global state machine, universal ontology, event-sourced learning
  blackboard, property-graph database, and microservices are outside the
  accepted architecture. Inherited local plugin and server mechanics may
  remain outer harness facilities; they do not own learning meaning.

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
Tutor decision cannot be represented honestly by course/material/history or
the exact Goal, future-attention, Assignment, planning, or other owning state
and its source provenance.

Do not reconsider because a framework, graph database, or upstream Agent
already exposes more machinery.
