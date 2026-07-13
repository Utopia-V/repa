# Repa system architecture

Date: 2026-07-12

Status: Accepted architecture baseline under ADR-0012. This document is
normative for ownership, dependency direction, state authority, and failure
boundaries. Names shown in examples are not automatically production types,
tables, or packages.

## Decision in one paragraph

Repa is a single-process, local modular monolith centered on durable learning
authorities rather than on its model loop. One local `LearnerHome` contains a
single learner's state across courses, workspaces, and Sessions. The Agent
runtime is the Tutor's flexible execution arm: it composes an immutable,
bounded view of relevant state for each model sample, exposes ordinary agent
capabilities and authorized learning commands, and records the interaction.
The LLM may research, teach, choose a local move, propose a course, and initiate
real writes. It does not own the authoritative history, legal transitions, or
cross-Session continuity. SQLite owns machine state; local files and observed
source content remain revision-bound artifacts. No daemon runs while the
terminal is closed.

In plain language: the program keeps the long-term map and the books; the LLM
looks at the useful part of that map and does the flexible intellectual work.
Starting a new chat does not erase the map, and the whole map is never pasted
into every prompt.

## Product floor and ceiling

The useful floor is already more than chat: begin or form a course, teach from
relevant material, preserve route/progress and real constraints, continue in a
fresh Session, and keep all durable meaning inspectable and correctable.

The intended ceiling includes multiple courses, reusable domain foundations,
source-aware knowledge/capability maps, learner evidence and task families
where justified, adaptive review, assignments and examinations, rich artifacts
and generic Agent tools, and a terminal surface that exposes the system's
reasoning and state. Those capabilities must fit the same authorities and
feedback loop; they must not require rebuilding the product around chat memory,
one scheduler, or one universal ontology.

The ceiling is an architectural compatibility requirement, not permission to
pre-create every future class or table.

## Semantic checksum

| Check | Architecture meaning |
| --- | --- |
| Product-loop purpose | Connect goals, course/material position, teaching, learner activity, review, assignments, deadlines, and later continuation. |
| Owned invariant | Durable learning meaning survives Sessions independently of model context and remains source-linked, correctable, and legally transitioned. |
| Representative behavior | In a new Session, `continue` receives a compact current learning view, chooses a useful move, and reads exact old material or history only if that move needs it. |
| Counterexample | Replaying an old transcript, loading every course node, or trusting an LLM summary as the current learner state. |
| Failure/correction | A failed or stale command commits nothing; a later correction preserves the original source and changes the active projection through a new transition. |

## Architecture drivers and evidence

The design is constrained by executable evidence rather than by a desired
folder layout.

1. ADR-0011 and the real-provider dogfood trace establish one Repa-owned Tutor
   loop over AI SDK provider, streaming, and tool mechanics.
2. A real fresh Session received active learning-wide state without importing
   the old Session transcript. Session identity is therefore not the learning
   memory boundary.
3. ALS-012 found that a compact overview plus lazy exact reads preserved the
   tested action choice while using about one thirteenth of the model-facing
   input of a full state dump.
4. ALS-008/009 establish bounded reads and revision-bound source observations;
   an unversioned path/range can silently change meaning.
5. ALS-019 proves that an ordered list plus one current pointer loses
   distinctions required for hierarchy, branches, detour/rejoin, deadline
   jumps, relation authority, and material revision.
6. ADR-0003 and ALS-015/016 reject a universal mastery record and an elaborate
   evidence schema before a real future action consumes it.
7. ADR-0008/0009 establish that an LLM can initiate a real write while the
   system retains source, identity, transition, idempotency, and correction
   authority. The physical write-tool transport is generic Agent machinery.

The architecture also incorporates the maintainer's accepted product choices:

- one local learner authority spans multiple courses and Sessions;
- no background daemon is needed while the terminal is closed; and
- when no course exists, the Agent may research and create a coarse,
  correctable working route instead of requiring pre-authored material.

## First-principles model: a mixed-initiative feedback system

Control theory is useful here as an ownership model, not as a claim that the
learner is a passive plant to be controlled. Repa controls **its own future
Tutor behavior** in response to an autonomous learner and a changing world.

| Control-system role | Repa meaning |
| --- | --- |
| reference signal | learner-owned goals, deadlines, intended outcomes, and current steering |
| observed system | learner interactions, materials, assignments, artifacts, time, and external results |
| state estimator | source-aware learner/course/agenda queries; uncertainty remains explicit |
| controller | Tutor composition using hard constraints, current state, learner intent, and model judgment |
| actuator | explanation, demonstration, questions, research, tools, artifact work, and authorized commands |
| feedback | later questions, attempts, corrections, completed work, time changes, and learner overrides |

The controller is receding-horizon: it chooses or proposes a useful current
move and near-term agenda, observes what happens, and chooses again. It does
not compile a whole course into a rigid workflow. This is the same reason plan,
study, review, and assignment behavior remain policy profiles over one loop.

The state also changes at different rates:

| Timescale | Typical authority | Consequence |
| --- | --- | --- |
| slow | domain foundations, course structure, accepted curricular relations | high-inertia; a learner error does not rewrite it |
| medium | material alignment, progress, activities, observations, evidence, correctable hypotheses | changes after meaningful interactions or source revisions |
| fast | goals, agenda focus, revisits, commitments, scoped steering | re-evaluated around each Turn |
| query-time | due/overdue/expired status and time pressure | derived from stored facts and the current clock; no daemon event is required |

In plain language: the course map changes slowly, today's route can change
quickly, and “due now” can become true simply because time passed.

## Chosen structural style

### Learning-centered modular monolith

All first-version components run in one Bun process and share one SQLite
transaction boundary. Internal modules are separated by the meaning they own,
not deployed as services. This keeps cross-domain corrections and commitments
atomic while avoiding network protocols, distributed locks, and eventual
consistency inside one learner's local system.

The design uses three established ideas selectively:

- **ports and adapters at real external boundaries**: model providers,
  terminal rendering, filesystem/source access, web research, and future
  external applications;
- **functional core plus imperative shell where useful**: pure relation and
  transition rules surrounded by explicit SQLite transaction scripts; and
- **command/query separation**: writes express legal domain transitions and
  reads build consumer-specific projections. This is not a generic command
  bus, separate CQRS deployment, or full event-sourced system.

SQLite is not hidden behind a repository interface merely for architectural
symmetry. A port is introduced only when a real second implementation or
external boundary exists. Domain-specific SQL remains acceptable when its
owner, transaction, and returned meaning are explicit.

### System view

```mermaid
flowchart TB
  UI["Terminal / future TUI"] --> RT["Tutor runtime\nSession and Turn owner"]
  RT <--> MODEL["Model port\nAI SDK + provider adapter"]
  RT --> COMPOSE["Tutor composition\ncontext, policy, capabilities"]
  COMPOSE --> Q["Learning queries\nsmall projections + source refs"]
  RT --> CAPS["Sample-bound capabilities"]
  CAPS --> CMD["Learning commands\nvalidated durable transitions"]
  CAPS --> AGENTTOOLS["Generic agent tools\nfiles, search, web, code"]

  Q --> AUTH["Learning authorities"]
  CMD --> AUTH
  AUTH --> DB[("SQLite LearnerHome")]
  RT --> INTERACTION["Interaction records"]
  INTERACTION --> DB

  AGENTTOOLS --> SOURCES["Workspace / web / tools"]
  SOURCES --> OBS["Revision-bound source observations"]
  OBS --> DB
```

The critical dependency direction is inward: learning authorities never
depend on AI SDK, a provider, or the terminal. The runtime asks them questions
and submits commands; they do not call the model to decide whether a stored
transition is legal.

## Authority and projection map

The first eight rows are separate durable authorities linked by typed
references. The current learning view is their bounded composition output, not
a ninth authority or a stored source of truth. None of these meanings is a
table in one universal graph.

| Authority | Owns | Must not imply |
| --- | --- | --- |
| interaction | Session, Turn, durable item, model operation, tool invocation, terminal outcome, causal source identity | that assistant prose is a learning fact |
| source/artifact | origin, observed content, content revision, selector, license/trust metadata | that source order is the course route or that source text is trusted instruction |
| domain foundation | optional reusable concepts, capabilities, task families, aliases, and reviewed relations | that every course or subject needs a populated foundation |
| course view | one versioned ordered learning/curricular view, its items, authored order, sparse typed relations, and provenance | that one learner mastered it or must study an item today |
| material map | material outline and revision-bound many-to-many alignment to course/domain items | that exposition order proves prerequisites |
| learner record | route progress, meaningful activities, reports, observations, evidence, correctable hypotheses, and source links | a single global mastery score or today's plan |
| agenda | learner-owned goals, assignments, deadlines, revisits, commitments, deferrals, temporary focus, and intended rejoin | permanent curriculum structure or learner ability |
| Tutor policy | hard constraints, policy profiles, scoped learner steering, and future stable defaults | a second runtime or evidence about the learner |
| current learning view | a bounded query result for one model sample | a new source of truth or durable summary that replaces its sources |

### Route anchor, focus, and rejoin

ALS-019 requires three distinguishable meanings, but not three fields in one
table:

- learner/course progress owns the broad route anchor;
- the agenda may own a temporary current focus; and
- the same agenda item may name the intended rejoin point.

The current production slice may physically colocate route-progress storage
with Course View code. That does not transfer semantic ownership to the
curricular structure, and a later Agenda slice must not treat the learner's
anchor as a course revision.

The current view derives `activeFocus` from the agenda when a live detour
exists; otherwise it derives it from route progress. This prevents two durable
`currentNode` values from drifting while preserving the semantic distinction.

## LearnerHome, LearningSpace, and Session

`LearnerHome` is the logical root of one learner's local authority. Initially
it may be represented by a database path and home configuration rather than a
new table. It contains multiple `LearningSpace`s, courses, goals, and Sessions.

A `LearningSpace` scopes material roots, course views, artifacts, and ordinary
context selection for a real body of work. It is not an isolation boundary for
all learning state: a global deadline, retained steering, or cross-course goal
may still contribute when relevant.

A `Session` is an interaction history. It may begin in one space and later
switch focus; it is not permanently equated with a course. Each Turn records
the resolved learning references in its context cut. A fresh Session starts
with no copied old transcript and receives current state through queries.

## Course, domain, and material ontology

### Course views are graph-shaped, not a generic graph database

A course view uses a versioned ordered hierarchy as its backbone. Only a
relation with an actual consumer becomes a typed cross-relation. Relation kinds
belong to the module that defines their legality; they form a closed set for a
schema version. Unknown or generic `related_to` edges are rejected rather than
accepted as convenient future data.

Each durable curricular assertion retains:

- semantic author;
- source or explicit absence of a source;
- basis such as model-proposed, source-grounded, learner-declared, or reviewed;
- owning course/domain revision; and
- correction or supersession history when it changes.

These bases are not one confidence ladder. An official syllabus can be
authoritative about coverage while saying nothing about a prerequisite.

### Domain foundations are optional

A reusable Domain Foundation may later connect several courses to shared
concepts, capabilities, tasks, and high-value relations. A course does not wait
for one. Course items may remain coarse, source-local, or not yet aligned to a
domain concept. This preserves useful behavior in source-grounded and ad hoc
subjects without pretending that every field has a Math-Academy-quality graph.

### Materials remain separate

A material artifact has an origin and current revision. Its outline and exact
selectors belong to a Material Map. Alignment can be many-to-many in both
directions. A material change creates a new artifact revision; it never
silently changes what an old selector meant.

When a material revision invalidates a current alignment:

1. the old observed range remains available for audit;
2. the alignment becomes stale rather than resolving against new bytes;
3. the course view and learner progress remain intact;
4. an Agent may propose replacement alignment against the new revision; and
5. unresolved mappings appear in current context only when they affect the
   chosen move.

## Starting without a course or material

Research and route creation use the same Tutor loop and ordinary Agent
capabilities; they are not a separate course-builder runtime.

```text
learner: "I want to learn X"
-> establish or select a goal and LearningSpace
-> inspect local sources and/or research with ordinary read tools
-> model proposes a coarse Course View revision
-> course command validates structure, source references, scope, and identity
-> commit it as a working provisional route
-> teach immediately or refine local detail as the route is used
```

The current learner request authorizes a routine, local, reversible working
route. It does not authorize the model to create verified learner ability or a
hard curricular blocker.

A model-prior-only outline may be used for orientation when explicitly marked
provisional. Source-grounded or reviewed assertions have stronger planning
authority. A later syllabus or curated foundation creates a new course
revision and an explicit reconciliation from old item identities; it does not
turn the first outline into hidden truth or silently discard progress.

Creating a route is optional. A direct learner question may be answered well
without first constructing a course ontology or persisting a plan.

## Epistemic and correction model

Every durable learning statement answers four different questions where they
matter:

1. **What occurred or was reported?** The immutable source-linked history.
2. **What does it support?** Evidence under stated conditions.
3. **What does the system currently infer?** A fallible, correctable
   projection for a consumer.
4. **What did the system or learner decide to do?** A goal, commitment,
   revisit, or other constitutive action.

The architecture does not create a universal `LearningFact` row that erases
these distinctions. Shared provenance fields may be reused, but the owning
domain defines the statement's meaning.

Learner inferences are rebuildable or explicitly superseded projections over
source records. Contradictory observations may coexist. A later failure does
not delete an earlier success, and neither one alone must become a scalar
mastery value. Exact inference rules wait for the future action that consumes
them.

To evaluate Tutor behavior without structuring every conversation, a meaningful
learning activity may retain its intended purpose, target, conditions, and
outcome references when a later decision will compare or revisit it. Ordinary
explanation remains Session history when no such consumer exists.

## Identity and revision semantics

The architecture deliberately rejects one overloaded `revision` number.

| Identity/version | Meaning | Not used for |
| --- | --- | --- |
| Session sequence | order of durable interaction items in one Session | learning-state conflict detection |
| commit sequence | monotonic local order/watermark of committed domain changes | rejecting a command merely because an unrelated course changed |
| entity version | optimistic precondition for one mutable goal, agenda item, progress record, or other aggregate | material content identity |
| course-view revision | immutable identity of one route/structure view | ordering Session messages |
| artifact revision | content identity, normally a digest or source-native immutable revision | learner-state confidence |
| policy profile revision | identity of selected Tutor defaults and enforced overlays | domain evidence |
| context cut | immutable manifest of the exact revisions, references, time, and capabilities shown to one model sample | durable authority after the sample finishes |

The current `system_state.state_revision` may remain temporarily as a coarse
commit watermark for the existing steering slice. New domains must not use it
as a universal stale-write guard. A domain command checks only the entity and
source preconditions that make its own transition legal.

One context cut records a commit watermark for audit plus the typed
dependencies/versions it actually consumed. The next model sample recompiles;
an already-dispatched request never changes underneath the model.

## Context is an observer and working set

Context construction has three depths:

| Depth | Typical contents | Delivery |
| --- | --- | --- |
| routine current view | relevant goals/course candidates, route anchor/current focus, urgent agenda items, time budget, active steering, compact source references | compiled automatically when relevant |
| current-move detail | route neighborhood, exact material range, active assignment/revisit, recent activity or evidence that changes the move | selected during composition or read through a tool |
| cold detail | complete old Sessions, full attempts, superseded interpretations, full course maps, unrelated materials | lazy search/read only |

The first sample in a fresh Session uses the current request, active agenda,
recent durable focus, and small home-level candidates to resolve scope. If
several choices would produce materially different behavior, the context
contains a bounded candidate list and the Tutor asks or chooses reversibly. It
does not load every course to avoid one clarification.

Context composition produces structured contributions before rendering a
prompt:

- selected facts and compact projections;
- typed source references and dependency versions;
- policy contributions with priority and provenance;
- the capability set available to this sample; and
- explicit omissions or truncation when a budget is reached.

Prompt rendering is an adapter over that plan. A prompt string is never the
only record of which state or authority was used.

## Tutor choice and policy arbitration

The program does not enumerate every legal explanation or teaching move. It
owns hard constraints, computable facts, domain legality, and any deterministic
consequence that must always occur. The LLM owns open semantic judgment inside
that space, including explanation, research, examples, route proposals, and
local action choice. The learner owns goals and can steer or interrupt.

Policy resolves in this order:

1. hard safety, domain legality, and external-effect permission;
2. the learner's explicit current request;
3. still-applicable retained learner steering;
4. real commitments and constraints exposed by the agenda;
5. the selected policy profile and stable defaults; and
6. model judgment for the current interaction.

Agenda facts do not always override the learner; they make the trade-off
visible. A goal change creates or supersedes goal/agenda state and triggers a
new current view. It does not rewrite the course structure or learner evidence.

ALS-021 demonstrates that making a durable reason visible is not equivalent to
selecting it as the purpose of the current move. In all eight tested
independent-prediction returns, the eligible Agenda reason survived into the
fresh Session, yet the Tutor disclosed the answer before the unaided
opportunity that the reason required. Candidate state and selected control
intent therefore need distinct representation in composition.

When the Learning System chooses to let durable state govern a model sample,
the context cut must make that selection inspectable and preserve any
constraint that materially changes the learner's role. The selection may use
model judgment, but it is a Learning System composition decision rather than an
accidental implication of prompt prose. The model still owns flexible
realization: wording, explanation, example, question, representation, and
research. The exact projection is deliberately open; it need not be durable on
every Turn and does not authorize a mode, pedagogy enum, second runtime, or
universal action record.

ALS-022A supplies the first direct realization evidence for that distinction.
Under the same return trace and production model, explicit selected-purpose
binding produced 7/8 purpose-valid independent predictions and no answer
leakage in 8/8; candidate exposure alone had produced 0/8. When durable state
is chosen to govern a move, selected purpose is therefore a real composition
meaning, not an optional wording convention.

The selection is bounded to the current control interval. Agenda continues to
own the candidate; Tutor composition owns the active projection; interaction
owns any completed occurrence. Selection does not address the concern, create
evidence, or survive into a new Turn merely because the candidate remains
durable. Material reads and other non-mutating continuation may preserve the
selection in a newly compiled cut. Failure or interruption ends it without
inventing service.

ALS-022B/C reject a mandatory universal model selector as the baseline.
`Agenda candidate | none` produced false provenance and only 12/22 strict
passes; an exact `current request | candidate | unresolved` source choice still
passed only 10/18 and ignored Agenda in every generic continuation. The
production-default model is not the sole authority for that general control
decision.

ALS-022D supports a simpler bounded topology for the demonstrated
one-candidate case. Composition filters eligibility and target freshness,
preserves exact source meaning, and may bind one legal Agenda concern as a
**conditional default** inside the ordinary realizing sample. The exact
admitted learner request remains higher priority. An incompatible direct
request, requested form, completed occurrence, or redirection overrides the
default without rewriting or closing the concern; generic continuation lets
the default govern. This passed 10/10 tested behavior/state contrasts without
an extra selector sample.

Several materially different candidates remain unresolved unless an accepted
deterministic rule, reversible ordinary model choice, or learner clarification
settles them. Do not hide a universal scheduler or classifier behind the word
selection. The tested conditional default also restated one known
independent-prediction constraint. ALS-022E removed that restatement and strict
validity fell to 3/8: exact source reason plus default status did not reliably
stop answer or decisive-rule disclosure. For this demonstrated concern, Agenda
must preserve an explicit source-bound learner-role constraint equivalent to
`learner response before Tutor disclosure of answer or decisive hint`, and
Tutor composition renders it as operative. It affects both realization and
whether a guided occurrence can truthfully serve the concern. This one earned
constraint does not authorize a general compiler, registry, or pedagogy enum.

If a future model-assisted control sample is justified for another boundary,
it is control-only: it cannot mutate learning state, emit learner-visible
teaching, or share incidental prose with the persisted assistant answer before
the program validates and binds source/version/scope. This remains a phase in
the same finite loop, not another runtime. ALS-022A/D/E also expose a presentation
defect: current pre-tool and control-rationale text can enter learner-visible
`outcome.text`; production Tutor prose must not reveal internal Agenda/control
vocabulary merely because the model narrated it.

A conversational move such as explaining an idea may happen without a domain
transition. Only a move that creates useful long-term meaning, a commitment,
or an external effect needs a durable command. This keeps teaching flexible
without allowing model prose to become authority.

### Teaching and review are feedback behavior, not persisted stages

Repa may observe a learning situation, choose a move, respond to the learner,
and later use a relevant consequence. That describes feedback; it does not
authorize an `Intervention` aggregate, a universal difficulty taxonomy, or a
pedagogical workflow state machine.

Explanation and demonstration remain model-led interaction by default. A
working interpretation such as “the current representation may be the problem”
can guide the next conversational move without becoming a learner record. If a
future action genuinely needs durable meaning, its existing authority owns it:

- route progress owns navigation continuity;
- Agenda owns a specific reason or commitment to return;
- learner history/evidence owns an actual response or artifact and the
  conditions consumed by a later decision; and
- Session history retains the full explanation and immediate dialogue.

Review is a Tutor move, not one stored object type. A durable revisit is an
Agenda-owned, source-linked future-attention concern: there is a reason to
return to a target under a trigger or time condition. It preserves enough
bounded meaning to distinguish why the system should return without absorbing
the old interaction, activity conditions, or learner evidence into Agenda.
`Future-attention concern` is behavioral language for this Agenda meaning, not
a required class name or a generic record shared by all future work.

Beginning the return does not settle the concern. A later recall, explanation,
comparison, application, or real task may serve it only through an explicit,
inspectable transition whose legal, complete later occurrence, target revision,
and purpose align. A partial provider delta or interrupted, uncommitted
assistant item cannot supply that occurrence. Assistance, result, artifact
state, and evidence meaning remain with their owning authorities. Serving the
concern means that the intended future attention occurred; it does not mean the
learner answered correctly, retained the knowledge, or mastered the target.
Cancellation or dismissal is an Agenda decision and does not pretend that the
purpose was served.

Time can make a concern eligible or due without selecting it, beginning it,
settling it, or claiming that the learner forgot. A failed explanation can also
be adapted entirely inside one Session without creating a revisit, difficulty
record, or evidence transition.

The code may derive eligibility, due status, and deterministic lifecycle
consequences. The model may choose or adapt the form of teaching or review when
no accepted rule settles it and may initiate an authorized domain command. The
learner may redirect or request direct help. No universal scheduler or
`FutureAction` record arbitrates all of these meanings.

### Program/model allocation

The boundary is responsibility-based, not a fixed percentage and not a claim
that “program” always decides while “model” only writes prose.

| Program-led | Model-led | Mixed initiative |
| --- | --- | --- |
| identity, revisions, source binding, time math, due/overdue derivation, legal transitions, atomicity, correction mechanics, context budgets, capability/permission enforcement | open-source research, semantic material interpretation, coarse route proposals, explanations, examples, questions, comparisons, and interaction-level adaptation | selecting a next move among real concerns, refining a course view, interpreting open-ended work, forming a gap hypothesis, and making a near-term plan |

For mixed work, code supplies trustworthy facts, hard boundaries, available
capabilities, and any deterministic consequence; the model supplies semantic
judgment; the learner may redirect. The model may directly commit an authorized
local transition, so “mixed” does not mean every action waits for a hidden
second controller.

In plain language: the program is strongest at keeping continuity and rules
straight; the LLM is strongest at understanding and teaching messy content;
neither replaces the other where both are needed.

## Capabilities and commands

A stable capability definition is separate from its sample-bound executable
binding. The binding receives trusted Session/Turn/model-operation identity,
source references, clock, cancellation, policy, and permission.

The initial capability metadata distinguishes at least:

- read-only local or remote observation;
- reversible local learning-state change;
- workspace/artifact mutation; and
- external or difficult-to-reverse effect.

It may also carry scope, trust of returned content, and a bounded cost/time
policy. This is complete mediation metadata, not a plugin platform.

Generic agent tools can read or change files, search the web, run code, or
produce artifacts. Their outputs are untrusted observations from the learning
domain's point of view. Only an explicit learning command may import one of
those observations into course, material, learner, agenda, or policy state.

A learning command is not generic CRUD. It names a meaningful transition and
owns:

- delegated semantic input;
- trusted execution envelope;
- legal source relationship;
- command-specific causal occurrence and effect identity;
- entity-specific preconditions;
- atomic domain changes and command receipt;
- correction/supersession behavior; and
- a model-visible result.

Every successful state-changing command writes an immutable causal receipt in
the same transaction. The receipt links physical invocation, semantic effect,
source/actor, affected domain references, versions, and time. Domain payload
stays in domain-owned records. This is an audit and recovery ledger, not an
event store from which the whole database must replay.

A cross-domain transition, such as completing an assignment with activity that
also serves a revisit, is one explicit application operation over one SQLite
transaction. It must name both domain consequences; it cannot arise from a
trigger that silently turns every artifact change into learning evidence.

## Runtime and interaction lifecycle

The durable path for one Turn is:

```text
boot LearnerHome and recover orphaned work
-> admit learner input and running Turn
-> compile and persist one immutable context/capability cut
-> run one model sample through mature Agent mechanics
-> stream live output to the terminal
-> execute generic tools and/or validated learning commands
-> recompile after accepted state changes
-> persist complete assistant/tool outcomes
-> terminate the Turn truthfully
```

Provider deltas are live presentation data. Durable interaction records contain
complete, correlated items and terminal outcomes. Provider completion, tool
settlement, and Turn completion remain distinct.

At startup, ambiguous in-flight work is marked interrupted and is not blindly
redispatched. Exact settled commands replay their receipts; new semantic work
requires a new admitted occurrence. Finite model/tool budgets remain
code-enforced.

## Persistence, process ownership, and migration

SQLite remains the sole machine-state authority. Large source/material content
may stay in local files or a content-addressed cache; SQLite retains identity,
revision, selector, provenance, and any bounded observed content required for
audit.

One process owns state-changing execution for a `LearnerHome` at a time. The
application will acquire a local writer lease/lock at boot. A second writer
fails clearly or opens an explicitly read-only inspection path; it does not
silently run a competing Tutor. This matches the accepted single-user,
non-daemon product while preventing two terminals from planning against the
same stale agenda.

SQLite still enforces entity versions and uniqueness. If a conflict occurs,
the later command fails with current state and can be reconsidered; there is no
automatic last-write-wins merge of learning meaning.

Schema migration has one ordered registry and one transaction per supported
migration. Domain modules own the meaning and validation of their schema
changes, but migration execution remains centralized so the database cannot
partially advance. Before a destructive migration exists, backup/export and
rollback behavior must be specified.

There is no timer worker or daemon. At application wake, queries derive due,
overdue, and expired state from stored times and the trusted clock.

## External and untrusted boundaries

- Material, web, and tool output is untrusted content, never privileged prompt
  policy.
- Filesystem tools are confined to declared LearningSpace/workspace roots
  unless the learner grants a broader capability.
- Provider and model identifiers are runtime metadata, not learning evidence.
- External writes use explicit permission and connector-specific idempotency or
  reconciliation; they are not covered by the local SQLite transaction.
- Secrets and provider transport metadata never enter learning context or
  durable research artifacts.

## Failure and correction behavior

| Failure | Required behavior |
| --- | --- |
| provider error or cancellation | preserve admitted input; fail/interrupt the model operation and Turn truthfully; do not invent assistant completion |
| crash during a local learning command | SQLite commits both domain effect and receipt or neither; recovery returns settled state by identity |
| crash during provider/text work | close/recover as interrupted; do not automatically repeat ambiguous model or external work |
| stale entity or course revision | reject the command with current references; let the Tutor re-read and decide again |
| material content drift | fail the old selector closed; preserve old observation; propose explicit re-alignment |
| poor provisional course route | create a corrected/superseding revision and reconcile item lineage; retain the old route as provenance |
| learner corrects a report or inference | append correction/supersession; preserve the original source; rebuild active projections |
| generic tool changes an artifact | record the artifact/tool result; create no learner/course fact until an explicit domain command imports it |
| context omitted relevant state | model may inspect state lazily; recorded selection manifest and source refs make the omission diagnosable and correctable |
| conflicting local writer | reject/serialize through the LearnerHome owner and entity preconditions; never silently merge semantic state |

## Target module ownership

The target names below guide imports. Directories are created only when a real
consumer arrives; this document does not authorize empty scaffolding.

```text
src/
  interaction/              Session, Turn, item, model/tool lifecycle
  sources/                  generic workspace/source observations and revisions
  learning/
    curriculum/             Domain Foundation and Course View semantics
    materials/              material maps, selectors, and alignments
    learner/                progress, activity, evidence, inference projections
    agenda/                 goals, assignments, deadlines, revisits, commitments
  tutor/
    policy/                 policy profiles and scoped steering
    context/                current-view selection and dependency manifests
  runtime/                  one Tutor loop and sample-bound capability binding
  providers/                model adapters
  terminal/                 CLI/TUI adapters
  storage/                  SQLite boot, migrations, shared transaction utilities
```

Learning modules may depend on small shared identity/provenance primitives and
SQLite utilities, but not on `ai`, provider implementations, or terminal code.
`tutor/context` uses read projections and performs no domain writes.
`runtime` may depend on all inward application boundaries; nothing inward
depends back on `runtime`.

## Current-code audit

The current production spine is retained as executable evidence, not treated
as the final package topology.

| Current shape | Architectural treatment |
| --- | --- |
| `interaction/records.ts` owns durable lifecycle invariants | preserve behavior; split only when course/material work creates real ownership seams |
| `run-tutor-turn.ts` renders policy, defines tools, executes a domain command, and drives the model | prevent it from becoming a god module by extracting structured context rendering and sample-bound capability composition when the next capabilities arrive |
| `compile-context.ts` returns one steering prompt | evolve it into structured contributions and a dependency manifest; prompt rendering becomes separate |
| `learner-steering.ts` mixes domain transition and invocation settlement | retain its semantics; separate stable command execution from AI-SDK tool binding when a second learning command proves the boundary |
| `open-database.ts` contains schema version 1 in one function | introduce an ordered migration registry before schema version 2 |
| global `system_state.state_revision` | retain as a temporary commit watermark; do not make new domains conflict on unrelated writes |
| generic `durable_effect` | keep for the proven slice; do not force all course, material, agenda, and learner records into its JSON payload |
| final assistant text is one Session item | sufficient for the current CLI; typed content blocks wait for attachments, partial recovery, or TUI consumers |

This is structural refactoring through real consumers, not a preliminary rewrite
of the working runtime.

## Rejected centers of gravity

### Agent-loop-centered layered application

Rejected because context selection, tool definitions, domain SQL, and Tutor
policy would continue accumulating in `runTutorTurn`. The Agent loop is a
necessary execution mechanism, not the product's long-term state model.

### One global learning state machine

Rejected because open teaching, research, learner interruption, and mixed
activities do not share one legal pedagogical sequence. Bounded objects such as
a Turn, assignment, tool invocation, or correction may still have explicit
state machines.

### Event-sourced blackboard or universal graph

Rejected as the default because it makes every interaction conform to one
event/edge language and requires generic projection/replay machinery before a
consumer exists. Repa borrows immutable receipts, provenance, and derived
views without making event replay or one graph table the source of truth.

### Artifact-centered workspace

Useful as an adapter and source model, but insufficient as the architecture
center. Files do not by themselves own goals, due revisits, course progress,
evidence meaning, or cross-Session Tutor policy.

### Microservices, embedded HTTP server, or plugin kernel

Rejected until a second process, frontend, deployment, or independent
extension owner creates a real boundary. Package count is not future-proofing.

## Architecture fitness rules

Every production extension must answer:

1. Which product-loop step does it improve?
2. Which authority owns its durable meaning?
3. Is it a command, a query/projection, an interaction record, or an artifact?
4. Which source, revision, and correction path make it inspectable?
5. What enters routine context, what is current-move detail, and what stays
   lazy?
6. What happens on retry, stale input, interruption, and restart?
7. Does it add a learning-native capability or merely grow generic Agent
   infrastructure?

Architecture-level behavioral checks must continue to cover:

- a fresh Session uses relevant state without transcript replay;
- context does not eagerly load full courses/materials/history;
- generic tool output cannot mutate learning state by itself;
- goal changes alter agenda without rewriting course/evidence;
- one learner error does not mutate shared curriculum;
- provisional model routes remain visibly provisional and correctable;
- stale material selectors fail closed; and
- domain code has no dependency on provider or terminal packages.

## Deliberately deferred

- multi-user, cloud, or cross-device synchronization;
- a background daemon or notification scheduler;
- property-graph or vector databases;
- a universal knowledge or learner ontology;
- a general plugin/MCP host owned by Repa;
- microservices, HTTP APIs, or remote runtime placement;
- full event sourcing and deterministic replay of model work;
- a universal scheduler score or global mastery scalar;
- a fixed workflow for teaching; and
- detailed production types whose first consumer has not arrived.

These omissions do not make the architecture a disposable MVP. The durable
boundaries that prevent future pile-up—authority separation, dependency
direction, version semantics, context stratification, correction, and command
ownership—are fixed now. Feature-specific shapes remain deliberately earned by
their first real behavior.
