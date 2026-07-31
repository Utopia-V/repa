# Native learning data model

Status: Accepted post-Gate-6 logical data design. It governs the first
learning-owned migrations in the OpenCode fork without freezing every future
table, command, or learner ontology.

Date: 2026-07-14

Roadmap ownership and post-baseline data-lifecycle disposition clarified:
2026-07-17

First-principles ownership and context-cut corrections: 2026-07-27

Authority: [Product origin](../foundation/00-product-origin.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md),
[ADR-0014](../decisions/0014-one-time-opencode-fork.md), and the
[system architecture](./00-system-architecture.md).

Historical evidence: the immutable pre-fork Course, material, Agenda, Tutor,
and Interaction behavior oracles identified by the
[asset audit](../research/pre-fork-repa-asset-audit-2026-07-13.md). Their
meanings and counterexamples are evidence; their tables and APIs are not a
migration target.

## Purpose

Gate 6 established one native `repa.db` and a Repa-only forward migration
lineage, and accepted one state-owning process per LearnerHome as the runtime
invariant. A later audit found and corrected alias and acquisition gaps in that
runtime boundary without changing this logical data design. Gate 6 deliberately
added no learning tables. Before the fork extends Interaction in isolation,
this document fixes the learning data relationships that the native runtime
must eventually serve.

The design is intentionally between two bad extremes:

- it is more complete than adding one field whenever the latest local task
  happens to need it; and
- it is less rigid than materializing every old noun, transition, test fixture,
  or possible learner inference before a product consumer exists.

The stable target is a learning system whose normal context and actions can use
Course, material, learner, agenda-family, and policy meaning across Sessions. Exact
physical schemas are admitted in coherent product slices. Empty future tables
do not make learning first-class.

Before the roadmap is divided into implementation Gates, this document fixes
the shared logical skeleton across those authorities: stable identity,
ownership, version/provenance/correction relations, cross-authority reference
direction, authoritative versus projected state, and transaction/dependency
boundaries. It deliberately leaves complete physical schemas, commands,
algorithms, package names, and locally evidenced lifecycle details to later
Gate design.

## Decision summary

1. One LearnerHome contains all Courses, learning records, Goal,
   future-attention, Assignment, planning, and Tutor-policy meaning in one
   database. Those meanings retain separate semantic owners. A LearnerHome may
   be implicit in the database identity; every table does not need a redundant
   learner-home foreign key.
2. Several Courses may be ongoing at once. No global `active` Course status is
   introduced. An optional default Course preference is only a retrieval bias
   for underspecified input such as `continue`.
3. A Course is not owned by a directory or LearningSpace. It may use material
   from several approved roots or LearningSpaces, and the same material may
   support several Courses.
4. A Course may exist before any Course View has been formed. It may later
   retain several View strategies and their exact revisions while selecting
   zero or one eligible revision as its default working view. `Working`,
   `historical`, and `candidate` are derived relations of eligible revisions,
   not stored View lifecycles: the selected exact revision is working, an
   unselected revision with a later eligible revision in the same View is
   historical, and the latest eligible unselected revision is candidate.
   Absence of a working view is valid state, not an error that authorizes an
   invented placeholder route. A selection is correctable working state, not a
   claim that the view is the one true curriculum.
5. Course structure, material structure, learner continuity, temporary work,
   and current model context remain different meanings even when they reference
   the same item.
6. The current learning view is a bounded, immutable observation for one model
   sample. It references exact durable revisions; it is never another source of
   learning truth.
7. Physical learning tables may enter incrementally when their identity,
   ownership, legal transitions, failure behavior, and place in the accepted
   architecture are concrete enough to implement and verify. A Gate need not
   complete an end-to-end product loop. Empty speculative tables and knowingly
   false placeholder semantics remain out of scope.
8. The ordinary Agent may lazily query a domain owner for exact identities,
   current revisions, bounded semantic snapshots, cursors, and explicit
   truncation when resolving natural language. That query is neither automatic
   context injection nor a learner-facing browser. Its completeness describes
   returned state, not proof that one semantic interpretation is correct.

## Logical relationship map

The diagram shows ownership and references, not required package or table
names.

```mermaid
flowchart TD
    HOME["LearnerHome<br/>one repa.db"]
    COURSE["Course<br/>stable learning endeavor"]
    PREF["Default Course preference<br/>optional retrieval bias"]
    SPACE["LearningSpace<br/>optional material/work grouping"]
    ART["Material artifact"]
    AREV["Artifact revision<br/>exact observed bytes"]
    REP["Readable representation revision<br/>optional derivation"]
    VIEW["Course View<br/>stable route strategy"]
    VREV["Course View revision<br/>immutable route snapshot"]
    WSEL["Working View selection<br/>optional exact revision"]
    ITEM["Course item identity<br/>stable when justified"]
    MEMBER["View membership<br/>revision-bound title, parent, order"]
    MAP["Material Map<br/>revision-bound outline and selectors"]
    ALIGN["Course alignment<br/>optional, both revisions bound"]
    ANCHOR["Route anchor<br/>default continuation"]
    AGENDA["Agenda family<br/>separate Goal, future attention, Assignment, planning"]
    LEARNER["Learner record<br/>occurrence, evidence, hypothesis when earned"]
    POLICY["Tutor policy<br/>profiles, constraints, retained steering"]
    IX["Interaction<br/>learner occurrence, model operation, Tool Part"]
    COMMAND["Learning command settlement<br/>causal receipt and exact result"]
    CUT["Context cut<br/>exact bounded references"]

    HOME --> COURSE
    HOME --> PREF
    PREF -. "may reference" .-> COURSE
    HOME --> SPACE
    HOME --> ART
    SPACE -. "optional grouping or location" .-> ART
    ART --> AREV
    AREV --> REP
    COURSE --> VIEW
    VIEW --> VREV
    COURSE --> WSEL
    WSEL -. "selects exact revision" .-> VREV
    COURSE --> ITEM
    VREV --> MEMBER
    MEMBER --> ITEM
    AREV --> MAP
    REP --> MAP
    MAP --> ALIGN
    ALIGN -. "exact target" .-> VREV
    ALIGN -. "exact target" .-> ITEM
    HOME --> AGENDA
    HOME --> LEARNER
    HOME --> POLICY
    LEARNER --> ANCHOR
    ANCHOR -. "typed target" .-> COURSE
    ANCHOR -. "typed target" .-> VREV
    ANCHOR -. "typed target" .-> ITEM
    AGENDA -. "typed target" .-> COURSE
    AGENDA -. "typed target" .-> ITEM
    LEARNER -. "typed target" .-> COURSE
    LEARNER -. "typed target" .-> ITEM
    IX -. "causal source and tool settlement" .-> COMMAND
    COMMAND -. "atomic transition in owning authority" .-> COURSE
    COMMAND -. "atomic transition in owning authority" .-> ART
    COMMAND -. "atomic transition in owning authority" .-> LEARNER
    COMMAND -. "atomic transition in owning authority" .-> AGENDA
    IX --> CUT
    POLICY -. "exact policy revision" .-> CUT
    CUT -. "observes exact revisions" .-> VREV
    CUT -. "observes exact revisions" .-> AREV
    CUT -. "observes exact revisions" .-> REP
    CUT -. "observes exact versions" .-> AGENDA
    CUT -. "observes exact versions" .-> LEARNER
```

There is deliberately no ownership edge from LearningSpace to Course or
artifact. LearningSpace may group work or locations; Course and material meet
through optional, revision-aware alignment rather than filesystem ancestry.
Stable Course View identity names one continuing route strategy, while each
View revision is an immutable snapshot of that strategy. Stable Course item
identity is Course-owned while title, parent, and order are View-revision
membership. Route anchor is learner-record meaning. Command settlement crosses
authorities without becoming another domain owner.

## Authority records

### Interaction and causal source

The inherited baseline already stores Session input, typed messages, parts,
events, tool activity, and terminal outcomes. Native learning records reference
the exact admitted learner occurrence, completed assistant/tool occurrence, or
other trusted source that gave the write its basis.

Current Session deletion cascades through messages, parts, and the Session
event aggregate. Durable Course, Course View, material, learner, agenda-family,
route, and policy records are not cascade children of those inherited tables. Their
causal relationship uses a Repa-owned durable receipt that may retain the
original Interaction identifiers but does not require transcript content to
survive. Ordinary Session deletion removes the transcript and marks that source
unavailable while preserving independently owned learning state. The
post-baseline Data Lifecycle capability may later remove or supersede affected
learning state only after showing its exact domain impact and receiving
explicit learner authorization.

Truly Session-scoped projections, temporary runtime focus, streamed Parts, and
tool presentation remain Interaction-owned and may follow Session deletion.
This distinction is ownership, not a ban on provenance links.

The implementation must preserve distinct logical identities for:

- admitted learner occurrence versus replayed, synthetic, or compacted text;
- one provider/model sample;
- one physical tool invocation and its settled model-visible result;
- one immutable context cut; and
- the terminal lifecycle that says whether an occurrence actually completed.

These requirements do not authorize copies of the old `session_item`,
`model_operation`, `tool_invocation`, `system_state`, or `durable_effect`
tables. The first learning command must map the meanings onto existing
Session/message/part/event records and add only a missing identity or manifest
that a real consumer cannot otherwise recover honestly. Current provider
`callID` payloads and per-Session event sequence numbers are not universal
command, effect, or LearnerHome revision identities.

The missing cross-cut is one narrow shared command-settlement substrate. It
owns causal receipts, physical invocation replay/conflict, trusted execution
envelopes, exact model-visible results, and source-unavailable tombstones. It
does not own semantic learning effects. Course, source/material, learner, Goal,
future-attention, Assignment, planning, and policy commands define their own
effect addresses, transitions, preconditions, and corrections and commit them
with the shared settlement in one SQLite transaction where all effects are
local.

### Course

A Course is a stable LearnerHome-owned learning endeavor with a broad route. It
may represent a school course, a self-directed subject, examination preparation,
or another sustained body of learning. Its identity outlives directory moves,
material replacement, Session boundaries, and changes to its working route.

Several Courses may remain ongoing simultaneously. The baseline therefore
adds no single Course lifecycle column whose value implies that all other
Courses are inactive. Archiving, completion, abandonment, and institutional
enrolment become durable meanings only when a visible consumer requires them.

An optional default Course preference belongs to learner navigation continuity,
not to Course lifecycle or Context authority. It changes only through an
explicit learner-controlled operation. A Turn may load one or several other
relevant Courses without changing that preference. Current directory, material
discovery, Goal/Assignment/planning pressure, future attention, and model
preference cannot mutate it implicitly.

### Course View

A Course View has a stable identity for one continuing way of organizing the
Course route. Editing that same organizing approach creates another immutable
revision of the View; proposing a materially different organizing approach
creates another View. For example, a syllabus View and an examination-review
View can coexist, and each can accumulate its own revisions. This resembles
the useful Git distinction between a continuing branch and immutable commits,
but it does not import Git merging, rebasing, arbitrary branching, or a general
version-control API.

A Course can retain multiple immutable revisions and multiple unselected Views
with different provenance. A separate, versioned optional selection identifies
the exact default working revision used for broad navigation and durable
targets. It never follows a later revision automatically. Course creation does
not create that selection or require a placeholder View; the first working View
is attached through a later explicit transition when no honest route is
available yet.

The working revision may be provisional and model-proposed, source-grounded,
learner-declared, or reviewed. These bases describe provenance, not a single
confidence score. Before causal command settlement exists, a Course revision
can retain only an application-bound authorship-basis declaration; that value
is not proof of a learner message, model invocation, acceptance, or source
content, and it records creation basis rather than current acceptance state.
Replacing the working revision preserves the previous view and reconciles
surviving item identities explicitly; it never rewrites old references.

The learner may explicitly author a View or request that an exact candidate
revision become the working route. That request authorizes the selection
transition without a redundant confirmation. Repa or the Tutor may also form
an unselected candidate from new evidence or a proposed reorganization, but
candidate formation never mutates the working selection. A Tutor-initiated
selection change requires learner acceptance. This separates low-friction
proposal from authority to redirect later navigation.

The backbone is a bounded ordered forest. Stable Course item identities are
separate from their title, parent, and order within one View revision so useful
continuity can survive a revision. A preserve mapping is one source to one
target with the same stable ID; a split is one source to several new IDs; a
merge is several sources to one new ID. An unmapped source or target means
removal or addition. Ambiguous many-to-many transformation is not silently
reduced to either operation. Reusing an item outside an immediate preserve
transition, including in the first revision of another View, names an exact
same-item source membership. Old references remain bound to their original
identities and revisions.

The learner may direct the LLM to author a split, merge, or identity mapping
under learner supervision. The Course authority validates exact source and
target revisions, ownership, uniqueness, and mapping shape before accepting
the new revision. The learner's instruction can authorize the operation, but
neither title similarity nor model confidence silently migrates learner
evidence, future-attention/Assignment/planning targets, or other downstream
records. Gate 7 owns the domain
representation and transition and accepts authorship basis only from a trusted
application capability, never from model-authored content. Gate 8 later binds
an LLM-issued invocation and learner acceptance to trusted causal settlement.

Ordinary removal of a Course, View, or rejected candidate revision is a
reversible withdrawal from ordinary discovery and selection. Withdrawal is a
separate disposition over immutable identity and revision content; it does not
mean completed, abandoned, or mastered. A working selection cannot point to a
withdrawn Course, View, or Revision. Withdrawing a Course therefore clears its
selection; it cannot replace the target because every Revision it owns becomes
ineligible. Withdrawing a selected View or Revision may clear or legally
replace the target inside the same Course. Every rejection or withdrawal that
may observe or change working selection compares both the exact expected target
and the independent selection version in the same transaction. A stale
proposal therefore cannot withdraw a candidate after the learner has selected
it. A non-null replacement must also satisfy ordinary selection's target View
and Revision version checks, preventing withdrawal-and-restoration ABA; every
successful clear or replacement advances the selection version. Restoration
makes the retained object eligible again without selecting it or rewriting
history.

Eligibility is hierarchical: Course, View, and Revision must all be locally
active. No View or revision is created under a withdrawn container, and a child
cannot be restored while its parent remains withdrawn. The exact Gate contract
owns the transition matrix and bounded hierarchy constants; these rules are
stable data meaning rather than UI convention.

Gate 7 defines no physical deep-delete command. The post-baseline Data
Lifecycle capability waits until every referring authority can calculate and
present an exact affected scope for explicit learner authorization. Raw
absence and ordinary withdrawal must not masquerade as physical deletion.

Only a demonstrated query admits a typed cross-relation. There is no generic
`related_to` edge table, open-ended relation registry, or requirement to model
all prerequisite, alternative, and joint-choice semantics in the first schema.

### Material and representation

A material artifact is a logical source with at most one active source location;
that location may change through an explicit learner move or rebind while prior
locations remain history. Exact backups and Repa-owned retained bytes are not
additional active locations. An artifact revision identifies exact observed
content. A location inside an approved root is a capability and provenance fact,
not the artifact's learning identity and not a Course owner. Root approval,
generic reads, and search results do not admit an Artifact: admission requires
an explicit learner instruction or selection from a bounded initialization
manifest.

Same-path byte change has rebuttable continuity within the current Artifact. A
trusted source-identity break appends an exact lineage boundary or interval over
the immutable observation history. Observation order spans location-binding
episodes, so one correction interval may cover an unnoticed replacement across
a later move/rebind; later deltas override only changed intervals. Each
independent admission starts an immutable correction-ancestry root, and every
correction-created Artifact inherits the one root shared by all member histories.
No correction can combine separately admitted histories through either an
existing or a fresh target. The same boundary can exist when replacement bytes
are identical, and no correction mutates recorded revisions or retargets old
references. Corrections to non-byte observation provenance are likewise
append-only and do not impersonate an Artifact identity change.

A model-readable derived representation, when needed, has its own immutable
revision and records:

- the exact original artifact revision;
- translator/tool identity and revision;
- media type, digest, and canonical Repa-owned location;
- acceptance time and trusted creation/operation identity, plus physical tool
  settlement when the derivation is model-issued; and
- availability, explicit deletion, or externally missing bytes without
  retargeting history.

Readable original content does not need a fake translation row merely to fit a
uniform pipeline. Selectors and alignments state whether they bind the original
or a derived representation. The physical schema may share content-revision
primitives when that removes duplication without erasing the derivation
relation.

For a non-model-friendly source that will be consumed repeatedly across later
Turns or Sessions, long-term model use requires such a representation. The
learner may decline derivation, in which case the Artifact remains system-known
but the limitation on long-term model use remains explicit. Withdrawing the
Artifact, deleting Repa-owned retained bytes, and deleting the learner's source
file are separate operations; none retargets historical references. A missing
active source and an exact Revision still resolvable from explicit retained
backing are compatible states; backing does not become another source location.

A Material Map owns the outline/selectors of one exact material or
representation revision. Alignment from material ranges to Course items is
many-to-many and revision-bound. Source order never becomes a Course route by
implication, and a Course may use material from several LearningSpaces.

Several immutable Material Map snapshots may coexist for the same exact target.
There is no canonical, working, preferred, or automatically selected Map.
Correction creates an explicit successor while retaining the predecessor;
independently authored alternatives remain distinct. An alignment binds one
exact Map selector and one exact Course/View/Revision/item membership. It is
optional and neutral: it does not by itself mean `teaches`, `requires`,
`assesses`, prerequisite, completeness, learner evidence, or Course order.

### Learner continuity and record

The first navigation-continuity slice owns two distinct learner-controlled
defaults: an optional LearnerHome-wide default Course preference and one broad
route anchor per Course. The preference biases underspecified Course selection;
the anchor is the default place from which that Course can resume. Neither is
the current Turn's exclusive focus or implies mastery, understanding, or
completion.

A temporary detour or selected current task normally belongs to the current
request. A future, demonstrated cross-Turn consumer may earn a distinct detour
and intended-rejoin authority within the agenda family; the first planned
product boundary does not pre-authorize that generic lifecycle. Context
composition derives current focus from the request and any live accepted
detour state, falling back to the route anchor only when no better target
exists. The system never stores two competing generic `current_item` fields.

Other learner records enter as separate source-linked meanings only when a
future Tutor action consumes them. Reading, receiving an explanation, watching
a demonstration, attempting with help, producing an artifact, observed
performance, evidence, and a model hypothesis are not synonyms. The design
does not pre-authorize one universal activity table, mastery score, or enum for
every possible interaction.

The first continuity slice may use the route anchor and exact recent
Interaction references without creating a general learner ontology. A later
adaptation path must admit only the modest occurrence/evidence distinctions it
actually uses and retain correction provenance.

### Agenda family

Agenda is a family and composition label, not a durable or transactional
authority and not one universal `agenda_item` aggregate. Goals,
future-attention concerns, assignments, planning demands, commitments,
deferrals, and temporary focus have different sources and legal completion
meanings. The first planned product boundary admits separate Goal,
source-linked future-attention/return, Assignment, and cross-day planning
consumers. Cross-day planning may reference an exact Goal or Assignment
revision without merging their identities or lifecycles. Generic commitment,
deferral, and durable detour/rejoin remain recorded, consumer-earned future
meanings rather than empty baseline record families.

Goals may be LearnerHome-wide, Course-scoped, or span several Courses. A Course
therefore has no mandatory single `goal` field. Immediate Turn intent remains
Interaction meaning unless it must survive the Session and alter later action.

Goal identity and learner state remain separate even when they interact.
Elapsed time, abandonment, prior achievement, forgetting, shallow understanding,
later evidence, or a raised standard does not by itself decide whether later
intent revises or resumes one Goal or creates another. The program preserves
the legal choices, exact revisions, and causal provenance; the ordinary Agent
interprets the semantic case and clarifies in conversation only when an
unresolved choice would materially change durable history. Program code does
not prove the language or require a separate candidate/acceptance protocol.
This does not pre-authorize a universal learning-history taxonomy or durable
pursuit-episode record.

Current Goal commands use one versioned disposition boundary. Historical V1
keeps its exact direct/accepted authorization and confirmation bytes for
replay. A physically new V2 call at an occupied semantic address records only a
semantic terminal with immutable existing-effect/address evidence; it has no
current Agent-issuance, capability, or fabricated owner snapshot. A free
address may admit a V2 candidate only after exact root/delegated Goal-write
membership is valid, then records Agent issuance separately from capability
policy. A candidate that later loses the semantic race retains that truthful
history but creates no effect. V2 semantic identity is the canonical typed Goal
intent, never the root/child Agent lineage or permission result.

The current optional Goal target is a closed absent, civil instant, or local
date intent. For the latter two the Agent supplies the exact civil value and a
source-zone, named-IANA-zone, or fixed-offset selector; the runtime binds the
trusted source zone or tzdb release and derives canonical epoch/offset facts.
V2 revisions store only normalized target values, while the effect preserves
the typed intent and exact versioned before/after snapshots. Carrying a V1
target into a V2 successor projects only its immutable value; the V1
source-expression, normalization basis, raw bytes, and field provenance remain
historical and are neither copied nor promoted into current semantic proof.

The source-linked future-attention loop remains the first experimentally
settled future-attention topology: eligible does not mean mandatory, begun, served,
correct, or mastered. Its native lifecycle is admitted together with
conditional Tutor purpose and truthful service through the teach-adapt-return
path, not as an empty storage Gate.

Cross-day planning waits for representative Goal-driven and Assignment-driven
multi-day workload, capacity, allocation, correction, and recomputation
behavior. The withdrawn minute-scale emergency schema and its compatibility
tombstone are not design inputs.

### Tutor policy and context cuts

Tutor composition queries bounded projections from the authorities above. One
context cut records the exact Interaction position, Course/View revisions,
material/representation revisions, learner, Goal, future-attention,
Assignment, planning and policy revisions, trusted time, and granted
capabilities actually shown to one model sample.

The cut is an audit manifest and records candidate dependencies for
command-specific stale checks. It is not itself a universal stale-write
precondition, a durable summary that can overwrite its sources, or the learning
database in serialized JSON. Each command checks only the exact revisions it
actually depends on. Detail remains lazy: the ordinary sample receives route
neighborhood, live constraints, and source references; exact material and old
history are loaded only for the selected move.

## Native structural families

The accepted logical model implies the following structural families. They may
be implemented and verified incrementally. This list does not require one Gate
to complete a user-visible trace and does not pre-assign Gate order.

The resulting schema may eventually represent the following record families,
but each family first appears only with a demonstrated consumer:

| Consumer pressure               | Record family                              | Required relation or behavior                                                                                                                                               |
| ------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| native Course use               | Course identity                            | LearnerHome-owned; no LearningSpace owner and no global active status                                                                                                       |
| durable navigation              | default Course preference                  | optional, versioned learner-controlled retrieval bias; Context reads but does not own it                                                                                    |
| native Course use               | Course View identity                       | one stable identity per continuing route strategy; alternatives remain distinct within a Course                                                                             |
| native Course use               | Course View revision and working selection | immutable revisions per View, zero or one exact working selection per Course; a Course without a View is valid and selection does not follow a newer revision automatically |
| native Course use               | Course item identity and View membership   | Course-owned stable identity where justified; revision-bound title, parent, and order                                                                                       |
| exact material use              | artifact and exact revision                | mutable location separated from exact observed content                                                                                                                      |
| exact material use              | readable representation                    | optional exact derivation from one artifact revision with availability truth                                                                                                |
| material structure              | material map                               | immutable alternative snapshots with exact selectors bound to one artifact or representation revision; no Course dependency or preferred pointer                            |
| grounded material use           | Course alignment                           | optional neutral many-to-many relation bound to one exact Map selector and exact Course/View/Revision/item membership                                                       |
| durable continuation            | route anchor                               | learner-record-owned Course/View/item reference, distinct from current focus and mastery                                                                                    |
| first durable command           | causal source and command receipt          | trusted Interaction/source identity and atomic domain/tool settlement                                                                                                       |
| exact continuation, if required | context cut                                | exact bounded manifest when existing Interaction records cannot express it honestly                                                                                         |
| cross-Session learner intent    | Goal identity and revision                 | learner-owned source, scope, correction, and supersession; no automatic attainment inference                                                                                |
| retained learner direction      | scoped steering policy                     | source-linked applicability and correction projected through an exact policy revision                                                                                       |
| future return                   | future-attention concern and service       | eligibility, conditional purpose, and complete source-aligned service remain distinct                                                                                       |
| substantial obligation          | Assignment identity and revision           | obligation and its correction remain distinct from Goal identity and planning arithmetic                                                                                    |
| substantial cross-day work      | planning demand and allocation              | references an exact Goal or Assignment revision; accepted workload, capacity, progress, infeasibility, learner override, and recomputation use program-owned arithmetic      |

An accepted Gate may establish any causally sound subset whose invariants and
integration boundary are real. This document neither authorizes empty future
tables nor decides whether Course, material, and continuation belong in one
Gate or several.

No early native table is created for generic learner activity, evidence,
mastery, a universal Agenda item, a generic scheduler, Domain Foundation,
embeddings, or a universal graph. Specific Assignment and planning authorities
enter only through behavior that can state their honest meaning and consumer.

## Migration and command rules

- Gate 6 baseline version 1 remains unchanged. The first learning schema is a
  normal Repa-owned forward migration in the empty post-baseline registry.
- Fresh databases continue to receive the generated complete current schema;
  existing recognized Repa databases advance through the same ordered
  migrations. No oracle or OpenCode journal is imported.
- A learning command validates only its actual source, entity, working-view,
  material, and permission preconditions. A global revision is not a universal
  stale-write guard.
- An open-language command may use an exact identity/version selected by the
  Agent from model-visible owner reads. The program validates that state and
  transition without requiring internal IDs in learner wording or persisting
  an exhaustive candidate universe as semantic authorization.
- Domain transition, immutable domain receipt, physical Tool Part settlement,
  exact model-visible result, and required Interaction projection commit in one
  SQLite transaction when all effects are local.
- External conversion or filesystem work completes before a short acceptance
  transaction. A crash may leave unreferenced staging bytes, never a database
  reference that falsely claims available accepted content.
- Generic file, shell, search, or model activity creates no Course, learner,
  Goal, future-attention, Assignment, planning, or policy fact without a
  capability-scoped domain command.
- Corrections preserve old sources and revisions. No command silently retargets
  history to new bytes, a new view, or a different Course item.

## Design checks

The model fails if any implementation requires one of these false equations:

```text
Course = directory or LearningSpace
default Course preference = the only ongoing Course
working Course View = objective curriculum truth
route anchor = current Turn focus = mastery
material outline = Course route
Session transcript = long-term learner state
context JSON = authoritative learning storage
tool invocation ID = semantic learning identity
Agenda item = goal = assignment = revisit
explained or read = understood or retained
```

It also fails if a supposedly narrow first migration forces later authorities
to use compatibility columns, duplicate current pointers, untyped JSON facts,
or a universal event/graph table to escape the initial shape.

## Deferred physical choices

The following remain implementation questions because current product meaning
does not select one answer yet:

- exact table and package names;
- the first typed Course cross-relation beyond hierarchy and authored order;
- when a material grouping earns a durable LearningSpace entity rather than
  remaining roots plus explicit Course/material relations;
- which modest activity occurrence first changes Tutor adaptation beyond route
  continuity; and
- retention, evidence aggregation, review scheduling, and long-horizon planning
  algorithms;
- cross-day planning-demand encoding across exact Goal and Assignment revisions;
- additional steering scopes and multiple-candidate future-attention
  arbitration;
- whether a future consumer earns generic commitment, deferral, or durable
  detour/rejoin records; and
- the post-baseline Data Lifecycle representation for selective
  cross-authority deep deletion and impact preview.

These choices are resolved by the product Gate that consumes them, without
reopening the ownership and non-implication decisions above.
