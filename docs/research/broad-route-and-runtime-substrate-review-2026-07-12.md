# Broad route representation and runtime substrate review

Date: 2026-07-12

Status: Phase-boundary research synthesis and reversible working proposal. This
is not a production schema, an accepted implementation plan, or a replacement
for ADR-0001/0004. It records which claims are currently supported, which
ownership decisions should be reopened, and which independent experiments can
distinguish the remaining alternatives. Its sequencing becomes a project
decision only after maintainer acceptance or after the experiments earn the
relevant boundary.

## Questions

This review answers two related questions:

1. Should the learner's broad course route be represented as a graph, or is a
   sequence, tree, prerequisite DAG, statechart, or some other form a better
   primary model?
2. Did Repa begin production code before deciding whether OpenCode, Codex, or a
   smaller reusable runtime should own the generic agent machinery?

The questions are related because a route model should be owned by the
Learning System. It should not be shaped around a prematurely selected Session,
tool, or persistence API.

## Outcome

The route should be graph-shaped at the logical level, but not implemented as
one universal knowledge graph.

The current best hypothesis is:

> A versioned ordered course hierarchy, plus a small number of typed,
> source-grounded cross-relations, with material alignment, learner state, and
> the current plan retained as separate overlays.

This is an attributed, multi-relational graph if described mathematically. In
the product it is better called a `course view` or `course map`: the graph is a
means of answering route questions, not a claim that every learning fact is the
same kind of node or edge. SQLite recursive queries can express the initial
pressure-test structure; a graph database has not been earned.

The runtime recommendation is more corrective:

> The existing `src/` is a useful executable semantic prototype, not an
> established production spine. Preserve its learning-specific behavior as
> oracles and provisionally freeze growth of its generic
> Session/Turn/model/tool machinery while the runtime substrate is compared.

Directly forking either reference is not currently justified. Codex is a large
Rust coding-agent product. OpenCode matches TypeScript/Bun, but Repa's intended
differences cut across the exact areas a downstream fork would need to merge:
Session meaning, context construction, tool authority, persistence,
continuation, and TUI projection. OpenCode's public plugin and SDK seams also do
not currently provide the transaction and identity boundary Repa's learning
writes require.

The leading implementation hypothesis is therefore a Repa-owned learning
kernel and thin composition over mature provider/stream/tool/rendering
libraries. That hypothesis must now pass a runtime-seam lab. It is not a license
to build another general agent framework.

## First-principles frame

The Learning System is a feedback system, but the course map is not the whole
controller and the learner is not merely a pointer on a syllabus.

| Role | Product meaning | Typical rate of change |
| --- | --- | --- |
| reference | learner goals, course outcomes, assignment constraints | occasional |
| structural map | broad curriculum organization and accepted constraints | slow |
| observations | learner reports, attempts, questions, artifacts, interaction | event-driven |
| estimated state | fallible learner claims, progress, unresolved concerns | medium |
| policy/controller | the program and model jointly select a Tutor move | every interaction |
| near-term trajectory | current focus, detours, due work, and intended rejoin | fast |

In control terms, the course map constrains and orients possible motion; it is
not the learner-state estimator and not a permanently committed trajectory.
The Tutor should usually use receding-horizon judgment: select a sensible next
move from the current evidence and constraints, observe what happens, then
replan. Encoding the whole teaching policy into a route statechart would turn a
flexible Tutor into a pre-scripted LMS.

In plain language: the map says what the territory looks like. The learner's
record says what has happened. The plan says where to go next. Those three
things influence each other, but editing one must not silently rewrite the
others.

## Route representation

### Separate authorities

At least four kinds of structure must remain distinguishable:

| Authority | Owns | Must not imply |
| --- | --- | --- |
| course view | containment, authored order, alternatives, accepted curricular constraints, version and source | that a particular learner has mastered or must study an item today |
| material map | artifact revision, hierarchy, exact ranges/selectors, route alignment | that the material's expository order is a prerequisite proof |
| learner overlay | route anchor, active focus, observed progress, evidence and retained concerns | a mutation of the shared curriculum |
| agenda/plan | due review, deadline pressure, temporary detours, intended rejoin, available time | a permanent curriculum relation |

A future learner model may add claims and evidence over domain objects, but it
must still not write a scalar `mastery` value onto a chapter merely because the
chapter was read or explained.

The most immediate representation trap is a single `currentNode`. If the
learner has reached chapter 5 but temporarily returns to chapter 2 to repair a
gap, chapter 5 is the broad route anchor while chapter 2 is the active focus.
Whether both positions need durable production fields is an experimental
question; collapsing them in advance makes the detour impossible to describe
honestly.

### Why an ordered hierarchy is the backbone

Most real course and material sources arrive as books, syllabi, modules,
chapters, sections, and ranges. They have containment and an authored display
or exposition order. A pure prerequisite DAG loses that information and
invites the system to reinterpret every adjacent section as a causal
dependency.

The 1EdTech CASE model similarly distinguishes framework documents, items, and
typed associations rather than making one undifferentiated graph. Its
associations include hierarchical and peer relations while leaving the
internal management of a curriculum system to the implementation.
[CASE information model](https://standards.1edtech.org/case/specifications/standards/v1p1/im)

1EdTech Simple Sequencing is also instructive as a boundary, not a template. It
uses an activity tree together with separate tracking state and sequencing
rules. That separation supports Repa's decision not to store learner state or
the current control policy as curriculum edges. Its rule-heavy execution model
would, however, be too prescriptive for a general Tutor.
[Simple Sequencing information and behavior model](https://www.imsglobal.org/simplesequencing/ssv1p0/imsss_infov1p0.html)

### Why typed cross-relations are still needed

A tree cannot faithfully express:

- cross-chapter prerequisites;
- optional or alternative branches;
- several materials aligned with the same course unit;
- one material range supporting several units;
- a local dependency outside the authored sequence; or
- different legitimate course views over the same domain.

A detour's intended rejoin point belongs to the agenda or learner overlay and
references a course item; it is not itself a new course relation.

Those needs justify typed edges, not a generic `related_to` relation. At
minimum, containment, authored precedence, prerequisite/requirement, and
alignment have different legal transitions, provenance requirements, and cycle
rules.

Examples of invalid compression:

- `A precedes B` does not prove that B requires A.
- Two edges `C requires A` and `C requires B` cannot say whether C requires A
  **and** B or A **or** B. Relation groups or hyperedges may eventually be
  needed, but only after a real consumer demonstrates that pairwise edges fail.
- `related` may contain cycles; `requires` usually must not; `contains` must
  maintain a hierarchy. One global graph validator would be wrong.
- A deadline that makes the Tutor jump ahead changes the agenda, not the
  curriculum.
- One learner error may create a revisit or a learner-state hypothesis; it
  cannot silently rewrite a shared prerequisite relation.

K12-KGraph demonstrates both the value and the cost of a richer graph. It
separates structural containers such as books, chapters, and sections from
concepts, skills, exercises, and typed relations. Its construction also relies
on source citations, schema constraints, DAG checks, and human verification;
model fluency alone was not treated as curricular authority.
[K12-KGraph paper](https://arxiv.org/abs/2605.09635)

### Alternatives considered

| Representation | What it does well | Failure for the broad route | Current role |
| --- | --- | --- | --- |
| ordered list plus one pointer | cheap continuation for a linear course | cannot represent hierarchy, branching, detour/rejoin, or cross-block constraints | experimental baseline |
| ordered tree/forest | source-faithful navigation and human-readable orientation | cannot express many-to-many alignment or cross-branch relations alone | backbone |
| prerequisite DAG / partial order | blocker and frontier queries | confuses dependency with exposition; weak for hierarchy, alternatives, and multiple views | one typed projection |
| hypergraph / AND-OR graph | joint and alternative requirements | greater authoring and validation burden; no demonstrated consumer yet | deferred |
| statechart / HTN | execution policy and planned decomposition | scripts teaching behavior and conflates plan with curriculum | unsuitable as curriculum truth |
| event-sourced history | provenance and reconstruction | says how changes are recorded, not what the route means | separate persistence choice |
| property graph database | dense graph traversals and graph-native tooling | operational cost without current query pressure | not earned |

SQLite supports recursive common table expressions over trees and graphs, so
it can express the first route pressure test without choosing a graph database.
Whether it remains sufficient under real revision, traversal, and projection
pressure is an experimental result, not a consequence of recursive CTE support.
[SQLite recursive CTE documentation](https://www.sqlite.org/lang_with.html)

### Program and model responsibilities

The program should own:

- stable identities, versions, provenance, and correction history;
- relation-specific structural validation;
- material selectors bound to an artifact revision;
- authorization and atomic admission of durable changes; and
- compact, query-derived route projections for the current model operation.

The model may:

- propose or import route items and relations from source material;
- align course units with material ranges;
- notice a missing prerequisite or competing interpretation;
- explain the route and choose among currently legal directions; and
- directly initiate an authorized write when its provenance and effect address
  are bound by the runtime.

A model proposal is not automatically an accepted curricular relation. This is
the same program/model collaboration already intended elsewhere in the
Learning System: flexible semantic work can originate in the model, while the
program preserves durable meaning and makes unsupported transitions impossible.

Material anchors should be expressed as an artifact revision plus a selector,
not only a URL, title, or unversioned character offset. The W3C selector model
similarly separates a selector from the state/version of the resource it is
intended to select.
[W3C Selectors and States](https://www.w3.org/TR/selectors-states/)

### Queries that the route pressure test must earn

The representation should be evaluated by queries and behavior, not by schema
elegance:

1. Where is the learner in the broad route, and what nearby context is useful?
2. What exact material range should "continue" reopen?
3. Which branches are legitimate candidates now, and why?
4. Is an ordering authored exposition, a real prerequisite, or a temporary
   plan decision?
5. Which material revisions support a route item, in both directions?
6. What accepted constraints would be affected by skipping an item?
7. After a prerequisite detour, where should the Tutor rejoin?
8. What becomes stale when a route or material revision changes?

The fixture should compare the existing ordered-section baseline with an
ordered hierarchy plus only the one or two typed relations demanded by the
cases. It should cover branching, detour/rejoin, deadline-driven jumps, one
error that creates a revisit without editing the course, conflicting source
orders, stale material anchors, and an unverified prerequisite that must not
block progress.

Promotion rule: if the list passes, retain the list. If one typed relation is
the only reason the graph-shaped condition wins, promote only that relation.
Do not design a universal relation ontology from illustrative examples.

Routine context should contain a local projection around the current route
anchor and relevant concerns. The full map and detailed materials remain
available through lazy reads.

## Runtime substrate

### What the current code actually proves

The current formal source has five files and no provider loop, stream decoder,
general tool registry, permission broker, Session runner, compaction mechanism,
or TUI. It is not a runnable agent harness.

It does provide executable evidence for several learning-specific semantics:

- retained learner steering has a source, time interval, withdrawal, and
  correction history;
- a repeated physical tool call need not duplicate one semantic learning
  effect;
- expired steering does not create a new write merely because time passed;
- source excerpts are bounded and checked against the admitted learner item;
  and
- the next Tutor context can receive an active learning-policy contribution.

Those behaviors are worth preserving as tests even if every current table and
API changes.

The code also prematurely chooses a generic host model:

- `session`, `turn`, `session_item`, `model_operation`, and `tool_invocation`
  form a Repa-owned agent lifecycle;
- the learner-steering executor joins through all of those tables to discover
  its trusted envelope and directly settles the generic tool invocation;
- a single workspace-wide state revision serializes unrelated learning writes;
- `durable_effect` requires a user/Session item cause even though future causal
  occurrences may be activities, attempts, material revisions, or external
  events;
- a model-operation admission writes the entire context JSON inside the
  database transaction, but provider dispatch occurs later; and
- recovery and finite rollout budgets are implemented before a real runner
  exists.

Two omissions make the phase label especially misleading: the schema permits
assistant and tool Session items, but the production API only writes the user
item; and the generic successful-tool test updates SQL directly because no
general settlement API exists.

The correct classification is therefore `candidate semantic kernel and
substrate discriminator`, not `completed production spine`.

### ADR invariants versus candidate mechanisms

The substrate review does not revoke an accepted behavior merely because the
current tables may be replaced. It reopens ownership and mechanism at the
following boundary:

| ADR | Preserve as product/runtime meaning | Reopen in the substrate comparison |
| --- | --- | --- |
| ADR-0005 | one admitted user occurrence groups a finite user-visible Turn; model completion, tool settlement, and Turn completion differ | which host stores the Turn, exact tables, causal-timeline mechanism, and adapter mapping |
| ADR-0006 | a local learning command must not leave learner truth and its own receipt in contradictory partial states; replay is idempotent | one SQLite transaction versus same-store host integration versus inbox/outbox and reconciliation |
| ADR-0007 | execution is finite; reopen does not pretend unfinished process-local work completed or silently rerun it | exact budgets, leases, receipts, cancellation owner, and recovery implementation |
| ADR-0008 | a model may initiate an authorized learning write while the runtime binds trusted identity, time, source, and permission | how the final host supplies the trusted envelope |
| ADR-0009 | physical call, semantic effect, causal occurrence, and provenance are distinct | exact identifiers, storage layout, and cross-host mapping |
| ADR-0010 | retained scoped steering is policy state and contributes at the relevant sampling boundary | exact scope schema and the current same-SQLite atomic context-admission mechanism |

This distinction prevents two opposite mistakes: deleting a real semantic
guarantee because an upstream host uses different tables, or forcing every
future host to reproduce the current tables because a test happens to pass.

### What should survive independently of the host

| Preserve | Reopen |
| --- | --- |
| learning facts remain source-linked, inspectable, correctable, and reversible | whether Repa stores the complete conversation lifecycle |
| physical invocation and semantic effect are not the same identity | exact model/tool table shapes and ownership |
| active learning state contributes automatically to a model operation | how a host exposes the pre-sample admission boundary |
| durable learning commands validate a trusted envelope | whether the envelope comes from a Repa runner or an adapted host |
| finite execution and truthful recovery behavior | exact counters, receipts, leases, and restart mechanism |

The current implementation is allowed to be deleted or rewritten after the
substrate experiment. No compatibility layer should preserve an invalidated
shape.

### OpenCode audit

OpenCode is the more plausible direct-fork candidate because it uses
TypeScript/Bun and MIT licensing. The source review nevertheless finds that its
stable public seams are not an embeddable generic agent kernel:

- `@opencode-ai/sdk` is a generated client for the OpenCode server;
- `@opencode-ai/plugin` extends the OpenCode product;
- core, LLM, protocol, server, and TUI packages are private workspace packages;
  and
- the mature V1 orchestration is coupled to project/worktree, snapshots, MCP,
  LSP, coding tools, permissions, compaction, filesystem state, and coding
  message parts, while V2 is still an incomplete migration.

The plugin boundary has a particularly concrete mismatch. Its public
`ToolContext` exposes Session/message/agent, directory/worktree, cancellation,
metadata, and permission, but not a durable Turn, model-operation identity,
state revision, source occurrence, or execution time. OpenCode's internal tool
context currently contains an optional `callID`, and the registry's object
spread may leak it to a plugin at runtime, but the public plugin contract does
not promise that field. A durable semantic identity cannot depend on an
accidental property.

Before/after hooks do expose a physical call ID, but a plugin still cannot put
an OpenCode-owned tool settlement and a Repa SQLite learning effect into one
transaction. Using the server/SDK moves the split across a process boundary and
does not remove the dual-authority problem.

One database transaction is not the only possible recovery design. A durable
inbox/outbox, idempotent semantic command, and explicit reconciliation protocol
could tolerate the crash window between the Repa commit and the host-visible
tool result. That alternative must name which record is authoritative, what the
learner and model see while the two sides disagree, and how reopen converges
without repeating the effect. It is therefore a real candidate for the lab,
not a free compatibility trick. The current plugin API's lack of a promised
trusted envelope remains a separate problem.

This does not prove that every OpenCode fork is wrong. It says the fork is
earned only if a disposable spike shows that Repa's learning semantics can be
implemented as leaf-local changes, without regularly modifying upstream
Session, context, tool, persistence, and TUI hotspots. Current source evidence
predicts the opposite.

Relevant pinned source:

- `.reference/opencode/packages/plugin/src/tool.ts`
- `.reference/opencode/packages/plugin/src/index.ts`
- `.reference/opencode/packages/opencode/src/tool/registry.ts`
- `.reference/opencode/packages/opencode/src/session/llm/request.ts`
- `.reference/opencode/packages/opencode/src/session/prompt.ts`

### Codex audit

Codex independently supports several useful behavioral invariants: a user Turn
may contain several sample/tool/sample steps; each sample has a step context;
tool execution and authorization belong below the UI; and live coordination is
not invented as durable work after restart.

Its `app-server` is the only near-term executable reuse candidate worth a lab.
It offers a JSON-RPC process boundary, dynamic tools, client user-message IDs,
and additional context. But the relevant context and dynamic-tool facilities
are experimental; the public protocol does not expose every logical model
operation or a stable pre-sample callback to Repa; built-in coding tools are not
fully host-controlled; and durable Codex threads create a second history.
`thread/inject_items` can append prebuilt model-visible items and may help
reconstruct an externally owned history, so ephemeral recovery is a question to
test rather than a known impossibility. The experiment must still determine
whether injected items preserve the required Turn/call/provenance mapping and
whether Codex rollout state becomes a second authority.

A direct fork is a worse fit. It would replace the accepted TypeScript/Bun
direction with a large Rust workspace and inherit coding-specific prompts,
tools, protocol items, persistence projections, sandboxing, and TUI. The
license permits modification, but language, product, and upgrade cost dominate
the legal question.

Relevant pinned source:

- `.reference/codex/codex-rs/core/src/tasks/regular.rs`
- `.reference/codex/codex-rs/core/src/session/turn.rs`
- `.reference/codex/codex-rs/core/src/session/world_state.rs`
- `.reference/codex/codex-rs/ext/extension-api/src/contributors.rs`
- `.reference/codex/codex-rs/app-server/README.md`

### Candidate strategies

| Strategy | Benefit | Boundary risk | Current judgment |
| --- | --- | --- | --- |
| fork Codex | complete, mature coding-agent runtime | Rust and deep coding-product divergence | reject for now |
| fork OpenCode | TypeScript/Bun runtime, TUI, provider and tool machinery | Repa changes central upstream seams; V1/V2 migration | not earned; retain as falsifiable candidate |
| OpenCode plugin/server | fastest disposable experience test | OpenCode remains Session/tool authority; no cross-store atomicity | lab-only, not production core |
| Codex app-server | explicit process protocol and dynamic tools | experimental context boundary and second history | optional comparison lab |
| thin Repa composition over mature libraries | Repa owns learning semantics without reimplementing provider/rendering internals | may accidentally grow into a new generic framework | leading hypothesis; must be measured |

Thin composition means using libraries such as the AI SDK for provider calls,
streaming, tool continuation, and cancellation, and a terminal library for
rendering. Repa should write only the composition and semantics that those
libraries cannot own. It must not implement provider wire protocols, a generic
rendering engine, or speculative plugin/server compatibility layers.

### Architecture distillation before implementation

Architecture distillation is not another substrate beside fork, sidecar, or
thin composition. It is the design method that should precede the leading thin
composition hypothesis:

```text
pinned OpenCode and Codex behavior
-> convergent control and ownership model
-> deliberate Repa differences
-> mature-library capability check
-> one executable vertical Tutor trace
```

Extract these things:

- the end-to-end control sequence from admitted input through repeated
  sample/tool/sample operations to one terminal Turn;
- who owns durable history, active execution, tool authorization, domain
  effects, context contributions, cancellation, and UI projection;
- the boundary between provider events and product state;
- failure semantics for interruption, denial, tool failure, crash windows,
  replay, and reopen; and
- negative decisions: which reference mechanisms Repa deliberately omits.

Do not extract package topology, class names, dependency injection style,
Effect or Rust organization, server/plugin protocols, coding tools, worktrees,
LSP, snapshots, compatibility layers, or product-scale projection machinery.
Those are implementation and product history, not evidence of a Repa
invariant.

The extraction artifact is not a UML diagram. For one vertical trace it must
record, stage by stage:

| Field | Purpose |
| --- | --- |
| owner | which runtime or domain may change the state |
| authoritative input/output | what crosses the boundary |
| durable versus process-local state | what reopen may truthfully recover |
| OpenCode/Codex evidence | pinned source and test that expose the behavior |
| preserved invariant | the failure Repa must prevent |
| deliberate difference | coding/product machinery Repa omits or strengthens |
| library responsibility | mechanism supplied by AI SDK, SQLite, terminal library, or standard runtime |

This corrects the previous contract-by-contract path. Implementing Turn,
model-operation, tool-invocation, recovery, and budget records independently
created a partial host without a real runner producing and consuming the whole
sequence. The new unit of extraction and implementation is one complete
feedback loop. A durable record is promoted only when that loop has both its
producer and its later consumer.

### Runtime-seam lab

While this working proposal is under evaluation, do not extend the candidate
generic Session/model/tool host merely because its tables already exist. This
does not block the independent route-domain pressure test or a route model that
earns promotion without depending on those host tables.

First freeze the distilled architecture for one real Tutor trace, then realize
it once with mature libraries. AI SDK owns the provider adapter, streaming,
tool-call transport, schemas, and abort propagation; Repa owns the outer
sample/tool/sample composition, learning-context contribution, trusted domain
command, and semantic write. A terminal library is not needed until the
headless control trace passes.

The trace is:

```text
admit learner input
-> compile context C1
-> model sample M1 returns finish=stop plus a complete learning tool call
-> validate the trusted call envelope
-> commit the learning effect and its local receipt
-> crash before the tool observation is durably visible to later sampling
-> reopen and replay the same physical call
-> converge on one semantic effect and one correlated observation, or a
   truthful explicitly indeterminate outcome
-> compile updated context C2
-> model sample M2 observes the new learning state
-> settle the user Turn
```

The lab must answer:

1. Does the library preserve a complete tool call even when the provider also
   reports `finish=stop`?
2. Can provider streaming, schema transport, ordinary tool continuation, and
   cancellation remain library-owned?
3. Can the learning executor receive a trustworthy call/source/revision
   envelope without querying a self-invented generic host schema?
4. Does replay after the crash produce exactly one semantic effect and a
   truthful model-visible observation?
5. Does C2 contain the state revision committed between M1 and M2?
6. Does cancellation avoid both false completion and the unsupported claim
   that no side effect happened?
7. Which current Session/Turn/model/tool records have real producers and later
   consumers in the trace, and which merely duplicate the library runtime?

Use the current code as a behavior oracle, not as an interface the experiment
must preserve. Split its tests conceptually into learning semantics and host
compatibility. Compare the distilled state transitions and fault outcomes with
the pinned references' source and tests; this is a behavioral differential,
not a source port. Do not design an `EngineAdapter` before a second real engine
or surface exposes a shared seam.

The approach passes only if its glue remains loop composition and learning
semantics. It is falsified if passing the trace requires Repa to implement
provider parsing, a generic stream stack, retry/compaction infrastructure, a
plugin framework, or large reference-product modules. In that case, reopen an
OpenCode core modification/fork or a process-hosted engine with the exact
missing boundary identified by the failure. Forking is an escape hatch backed
by evidence, not the default comparison implementation.

Codex app-server is a secondary comparison, not a prerequisite to begin. It
becomes more valuable if the thin TypeScript path starts recreating generic
runtime machinery or if its public pre-sample/context boundary becomes stable.

## Proposed independent experiment sequence

1. Provisionally freeze additions to the generic host portion of the current
   candidate. Preserve it intact as an executable oracle until the runtime-seam
   lab is complete.
2. Distill one complete runtime control trace from the pinned references, then
   implement and fault-inject that trace with mature libraries. Run the route
   pressure test independently; neither experiment is evidence for delaying
   the other. The route test uses a list baseline and an
   ordered-hierarchy-plus-sparse-edges condition in `labs/`.
3. A route representation may be promoted independently when route cases earn
   it, provided the domain module does not depend on the candidate
   Session/model/tool tables. Runtime ownership need not be settled first.
4. Promote only the runtime ownership and route relations demonstrated by their
   respective failures. Rewrite or delete the current candidate where its host
   assumptions do not survive.
5. Re-read the product origin and accepted ADRs, then explicitly amend any ADR
   whose mechanism was mistaken for the invariant it was meant to protect.

This order avoids two opposite local-gradient traps: growing a generic harness
because the current prototype already has Turn tables, and growing a universal
knowledge graph because the next feature happens to need one cross-edge.

## Plain-language summary

The graph idea is right at the level that matters: a real course is not always
a straight list. But start with the course's versioned directory and draw only
the few lines that have a known meaning and a source. Keep the learner's actual
position, today's detour, the textbook page, and tonight's deadline in their
own records; do not scribble them onto the shared map.

The code already written is not useless, but it was promoted too early. It has
good tests for what a learning instruction means across time and repeated model
calls. It does not yet constitute an agent runtime. Keep those tests as a
measuring stick, stop building upward from its Session tables, and now test
whether a thin library-based engine or an adapted upstream host can carry the
same semantics without making Repa maintain a second Codex/OpenCode.
