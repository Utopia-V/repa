# OpenCode fork Gate 16: learner Goal authority

Status: Maintainer grill complete. The decisions under **Accepted maintainer
decisions** are accepted product meaning. Independent whole-Gate review run
`gate16-whole-20260721-01` has closed `G16-CT-001` through `G16-CT-005` and
`G16-IE-001` through `G16-IE-013`, then closed the bounded real-provider
qualification `G16-IE-U01`. It returned final `Accept` for the complete
contract/theory and implementation/evidence candidate. Gate 16 is closed by the
accepted implementation snapshot in this change.

Date: 2026-07-21

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Primary predecessors:
[passed Gate 7 Course and Course View authority](opencode-fork-gate-07-course-view-authority-2026-07-15.md),
[passed Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[passed Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md),
and [passed Gate 15 retained scoped steering](opencode-fork-gate-15-retained-scoped-steering-2026-07-20.md)

Successor boundaries: Gate 17 must remain usable without a Goal. Gate 18 may
project a bounded, exact Goal revision into model context. Gate 21 may consume
an exact Goal revision as one typed substantial planning demand. Gate 22 later
composes Goal inspection and correction into the terminal. Gate 23 proves the
integrated loop, including Goal-driven cross-day replanning. None of those
consumer behaviors belongs to Gate 16.

This record owns the accepted Gate 16 engineering contract and closing
evidence. Accepted product meaning comes from the product foundation, accepted
ADRs, architecture, Roadmap 09, and the maintainer decisions below. Storage,
command, projection, failure, and evidence details remain derived engineering
decisions rather than product authority; the fresh separate top-level reviewer
challenged, repaired, and accepted the complete candidate recorded here.

## Why this Gate exists

Repa needs to remember what the learner is trying to achieve after the current
request or Session ends. A Goal is durable learner intent used by later context,
teaching, and planning; it is not a transcript summary, Tutor inference, todo,
mastery claim, or execution target.

The intended product loop contribution is:

```text
learner states or accepts an intended outcome
-> Repa preserves the exact learner-owned Goal revision
-> later context, teaching, or planning uses that revision when relevant
-> learner correction or an explicit lifecycle decision changes later use
```

Persisting any sentence that resembles an aspiration is insufficient. The
system must distinguish learner-owned commitment from conversational material,
preserve what the learner actually accepted when a model helps clarify it, and
avoid inventing achievement from time, evidence, Tutor prose, or Agent work.

## Terminology

A **Goal** is one learner-recognized learning purpose under the interpretation
accepted by the learner at the time. Its stable identity is not the wording of
one utterance, one numeric threshold, or an objective system claim about the
learner's whole history.

The **intended outcome** is the nonempty learner-owned expression of what the
learner wants to reach. Every Goal has one.

An **attainment condition** is an optional learner-owned condition that makes
the intended outcome more discriminating. A Goal may have none or several.
Conditions are not evidence, program-owned scores, mastery state, or
program-owned completion rules.

A **target time** is an optional structured time or time boundary associated
with the Goal. Time passing may make the target reached or passed at query time;
it does not change Goal lifecycle by itself.

A **Goal revision** is one learner-authorized complete state of the expression,
optional conditions, target time, scope, and lifecycle disposition under the
same accepted identity. A new Goal may represent a distinct purpose, a distinct
outcome occurrence, or a pursuit the learner explicitly wants to keep separate;
replacing an old purpose may also supersede the former Goal. Elapsed time,
current ability, or later evidence does not decide that relation by itself.

## Accepted maintainer decisions

These decisions were accepted during the Gate 16 grill. They are recorded by
consequence rather than as an interview transcript. Examples explain the
boundary but do not become universal schemas or algorithms.

### Durable admission requires learner authorship or acceptance

A Goal may be persisted only after explicit learner initiation or explicit
learner acceptance. Entry is not restricted to `/goal`, another direct command,
or any fixed interaction shape. Model-assisted clarification is allowed and may
iterate until the consequential ambiguity is resolved.

A clear, fully learner-authored Goal expression may be committed and surfaced
visibly without a redundant confirmation round. Ordinary conversation may not
be silently promoted merely because a model detects an aspiration. If the
model adds or changes outcome meaning, conditions, target time, or scope, the
resulting candidate must be shown to and accepted by the learner before it
becomes durable Goal state.

The direct-command and model-clarification paths are possible mechanisms, not
separate Goal meanings and not mandatory product flows.

### Outcome is required; attainment conditions are optional

Every Goal has a nonempty intended outcome. Attainment conditions are optional,
may contain several learner-owned distinctions, and may be revised. The model
asks for a missing distinction only when different answers would materially
change later teaching, context, or planning. Gate 16 does not impose SMART
goals, a deadline, a score, a metric, or a mandatory clarification ritual.

A valid Goal with no attainment condition remains usable. Later `achieved`
still requires an explicit learner lifecycle decision; absence of a stored
criterion does not authorize model inference.

### Identity follows the continuing learning purpose

Wording and thresholds do not by themselves define Goal identity. For example,
`pass the data-structures final` and `score at least 85` will usually be two
expressions or condition revisions of one exam-oriented purpose rather than two
Goals. When that relationship is ambiguous at creation, the model should ask
before the first durable commit. Later changes that retain the purpose append a
revision under the same identity.

That is a common interpretation, not an exhaustive identity rule. A learner may
resume the same purpose after real abandonment, may treat a repeated target
occurrence as a new Goal, or may explicitly want a renewed pursuit recorded
separately. The model may propose an interpretation and ask when the choice
changes history or later behavior; the learner accepts the consequential
relation. The program may not infer it from a time gap, forgetting, current
performance, or wording similarity alone.

### Closure declarations are explicit but do not settle later learning history

`achieved` means the learner explicitly considers the Goal attained. It does
not create mastery, assessment evidence, or proof that an external result
occurred. `abandoned` means the learner has stopped pursuing it without claiming
attainment. `superseded` means a new Goal has replaced its underlying purpose.

Only explicit learner authorization, including acceptance of a surfaced model
proposal, may cause those transitions. Tutor behavior, Agent execution, Course
progress, elapsed time, a deadline, or learning evidence cannot automatically
achieve, abandon, supersede, or fail a Goal.

Each declaration preserves what the learner authorized about the exact Goal
meaning at that time. It does not erase history or force every later situation
into a permanent terminal interpretation. A later interaction may correct a
mistaken achievement, resume an abandoned pursuit after substantial forgetting,
retain a once-true achievement while acknowledging later decay, raise the
attainment standard, or begin a distinct purpose or outcome occurrence. Those
readings can overlap and none is inferred merely from the observable facts.

### Learning-history ambiguity is handled where it becomes consequential

Real learning situations do not form an exhaustive set of mutually exclusive
Goal cases. Abandonment, forgetting, shallow understanding, mistaken confidence,
later decay, a higher standard, a renewed attempt, and a changed purpose may
co-occur. Gate 16 therefore preserves the learner-accepted Goal interpretation
and its source rather than claiming the system has discovered the one true
classification of the learner's history.

The program owns the legal identity, revision, correction, and lifecycle
effects and the provenance of the accepted choice. A model may interpret the
situation, compare plausible readings, and ask only when their difference would
materially change durable history, context, teaching, or planning. The learner
accepts any model-supplied consequential interpretation. Gate 16 does not earn
an exhaustive learning-history enum or a mandatory durable pursuit-episode
entity merely to remove semantic ambiguity.

Forgetting, current depth, observed performance, learner report, evidence, and
model inference remain distinct learner-state meanings. They may later inform a
Goal decision or plan, but they neither become Goal identity nor automatically
rewrite Goal lifecycle. A later consumer must earn any durable learner-state
representation outside Gate 16.

### Target time is optional and is not a schedule

A Goal may carry an optional structured target time or boundary. When the model
interprets a learner's natural-language time expression, the normalized meaning
must be visible to and accepted by the learner. Reaching or passing that time is
a query-time fact only.

Frequency, cadence, daily allocation, and a study schedule do not belong to the
Goal. They may later be planning inputs or outputs, but they are not silently
encoded as Goal lifecycle or static Goal priority.

### Final examinations are a representative stress case, not the product center

Final-exam preparation is used to pressure-test admission, conditions, target
time, multiple concurrent Goals, and later planning because it exposes most of
those problems compactly. It is not the only supported Goal form and does not
authorize an exam-specific schema. Long-lived skill development and interview
preparation remain counterexamples against overfitting.

### Cross-day planning consumes Goal or Assignment without merging them

The initial Gate 21 roadmap wording incorrectly required an admitted Assignment
before cross-day planning. That derived restriction contradicted the product
foundation's broader requirement for ordinary substantial real work and failed
the accepted exam case, where two learner Goals create real deadline pressure
without any Assignment.

Goal and Assignment remain separate authorities. Gate 16 hands later consumers
an exact Goal identity and revision, intended outcome, optional conditions,
optional target time, and scope. Gate 21 may reference that exact revision or an
exact Assignment revision as a typed substantial planning demand. Gate 21 owns
the plan and the planning-side acceptance and use of remaining-work, capacity,
progress, feasibility, cross-day allocation, learner override, feedback, and
recomputation. Gate 16 owns neither a static priority field nor a scheduler.

The exact source authority for current ability or marginal-return judgments is
not settled here. Gate 19 may later earn a reusable learner-record distinction,
or Gate 21 may accept a plan-specific source-bearing estimate. Gate 21's
experiment and grill must settle that boundary before its contract can claim it.

The maintainer accepted keeping Gate 21's number while broadening its boundary.
A later Gate 21 experiment may still show that Assignment lifecycle and
cross-authority planning need different implementation or evidence slices; that
would require a later owning roadmap decision rather than an implicit split now.

## Decision provenance and revision authority

| Decision | Basis | May be revised by |
| --- | --- | --- |
| `G16-MD-001` learner initiation or acceptance is required; interaction shape is not fixed | 2026-07-21 maintainer grill, under learner-intent and non-silent-write product policy | maintainer or owning product decision |
| `G16-MD-002` outcome required; conditions optional and consequentially clarified | 2026-07-21 maintainer grill | maintainer or owning product decision |
| `G16-MD-003` identity follows the learner-accepted contextual relation; time, ability, evidence, and wording do not decide it | 2026-07-21 maintainer grill | maintainer or owning product decision |
| `G16-MD-004` achievement, abandonment, and supersession require learner authorization, create no evidence, and do not erase later interpretive ambiguity | 2026-07-21 maintainer grill plus accepted no-automatic-attainment roadmap boundary | maintainer or owning product decision |
| `G16-MD-005` target time optional; passage has query-time meaning only | 2026-07-21 maintainer grill plus no-background-daemon architecture | maintainer or owning product decision |
| `G16-MD-006` exam is a representative stress case, not a universal Goal model | 2026-07-21 maintainer grill | maintainer or owning product decision |
| `G16-MD-007` Gate 21 consumes typed Goal or Assignment planning demands | 2026-07-21 maintainer correction of an Assignment-only roadmap derivation | maintainer or owning product/architecture/roadmap decision |
| `G16-MD-008` overlapping learning histories remain semantically clarifiable rather than becoming one deterministic identity taxonomy | 2026-07-21 maintainer correction using abandonment, forgetting, shallow understanding, and later-depth counterexamples | maintainer or owning product decision |

The Gate 16 contract may make these decisions concrete but may not turn
optional conditions, model assistance, or one exemplar entry path into a
requirement. A reviewer may reject an engineering derivation without changing
the accepted decisions above.

## Proposed Gate result

After Gate 16:

- one LearnerHome may contain no Goals or several independent Goal identities;
- each Goal has one immutable linear revision history and one exact current
  head, while semantically similar Goals remain distinct unless the learner
  accepts an explicit replacement relation;
- every revision contains one nonempty intended outcome, zero or more ordered
  optional attainment conditions, one exact LearnerHome/Course/multi-Course
  scope, one optional normalized target boundary, and one learner-authorized
  lifecycle disposition;
- `achieved` and `abandoned` remain learner declarations attached to exact
  revisions rather than mastery or evidence, while `superseded` preserves one
  explicit relation to a distinct new or already-existing Goal and the exact
  target revision on which the learner based that relation;
- an unrelated semantic correction preserves the exact accepted lifecycle
  disposition unless the learner explicitly changes it; it cannot silently
  achieve, abandon, restore, retarget, or unsupersede a Goal;
- a later accepted revision may correct, resume, deepen, or otherwise reinterpret
  the same Goal without erasing the earlier declaration or encoding a taxonomy
  of why the learner's situation changed;
- one exact learner occurrence may authorize one bounded atomic Goal change set
  containing several Goal operations, so a natural request with two exam Goals
  does not require invented extra learner occurrences or partial commits;
- a fully learner-authored change set can commit visibly without a Gate-imposed
  confirmation, while any model-supplied consequential meaning is shown as one
  exact once-only candidate and commits only after learner acceptance;
- every applied change set reuses Gate 8/12 physical invocation, Turn,
  permission, receipt, ToolPart, frontier, cancellation, and recovery mechanics;
- exact physical replay and semantic duplicate return stored results, conflicting
  reuse fails, and concurrent corrections cannot branch a Goal history;
- bounded snapshot reads expose exact current revisions, lifecycle and target
  relations, scope availability, history, and truthful source provenance to
  later Context, planning, and terminal consumers;
- time passage, Course withdrawal, Session deletion, compaction, fork, restart,
  model prose, and learner evidence never synthesize a Goal transition; and
- a concise durable terminal acknowledgement makes each committed Goal change
  visible even if later assistant prose or the provider fails.

This establishes Goal authority and its truthful command/read boundary. It does
not inject Goal state into model context, allocate study time, infer learner
ability, or complete a user-visible multi-Session learning loop.

## Owned logical records

Exact SQL and TypeScript names remain implementation details. The physical
schema must nevertheless keep these meanings distinct and database-enforced.

1. **Goal identity.** A LearnerHome-owned generated Goal ID and trusted creation
   time. It contains no mutable current payload, Course owner, score, or global
   active flag.
2. **Goal revision.** A generated revision ID, owning Goal ID, positive lineage
   version, exact predecessor when noninitial, complete semantic snapshot,
   stored lifecycle disposition, causal learner occurrence, source order,
   trusted commit time/order, shared-learning frontier, and the applied Goal
   change-set effect that produced it. Revisions are immutable.
3. **Attainment-condition membership.** Zero or more ordered, bounded nonempty
   learner-owned condition strings attached to one immutable revision. Ordinals
   preserve accepted presentation order but are not stable criterion identities,
   evidence slots, program-owned score records, or decomposition nodes.
4. **Goal scope membership.** One closed scope arm on each revision: either
   LearnerHome-wide with no Course rows, or a nonempty bounded set of exact
   Course IDs. One Course is the ordinary Course-scoped case; several Courses
   form one multi-Course scope. Each resulting Course membership is sealed as
   either newly bound from an exact active Course-owner snapshot or carried
   from the identical membership of the exact predecessor Goal revision.
   Omitted predecessor memberships are removals represented by the complete
   before/after scope basis; they do not require a live Course row in the new
   revision. Scope membership never names a View, Revision, item, material,
   directory, or LearningSpace.
5. **Optional target boundary.** One closed absent, exact-instant, or local-date
   arm with the accepted source expression and normalized display/timezone
   facts needed to interpret it without consulting future host defaults. A
   local date remains a civil date; the system does not invent an exam time or
   silently convert it to end of day.
6. **Explicit supersession membership.** A `superseded` revision names exactly
   one distinct target Goal and the exact target revision that the learner saw
   when accepting the relation. The target may already exist or may be created
   atomically by the same replacement operation. A later source revision may
   preserve that exact relation independently of semantic correction, or may
   explicitly clear/retarget it. Immutable historical memberships never rewrite
   either Goal. Database-enforced current projection permits at most one outgoing
   target per source and one incoming supersession per target, and rejects a
   current cycle.
7. **Goal change-set effect.** A generated Goal-owned effect ID, one admitted
   learner occurrence, canonical semantic fingerprint, authorization arm,
   bounded ordered operations with per-field authored/accepted/carried bases,
   exact changed/no-change results, trusted settlement values, and deterministic
   acknowledgement. It is one domain effect for Gate 8's mutation slot even
   when several Goal revisions commit.
8. **Learning-command receipt arm.** The Gate 8 receipt and physical invocation
   link the exact occurrence, Turn/input, issuing model operation, Tool Part,
   provider call, capability/version, authorization basis, permission request
   when present, Goal change-set effect, and terminal settlement. Goal content
   stays Goal-owned rather than being embedded in a universal receipt payload.

Receipt, effect, Goal identity, revisions, conditions, scopes, and the first
applied settlement do not use Session, Message, or Part rows as cascade-owning
parents. Interaction records may become unavailable while accepted Goal meaning
and minimal source truth remain.

No mutable `current_goal` row, universal Agenda item, JSON fact bag, content
fingerprint identity, or model-authored external ID may replace these
relationships. A commit seal or an equivalent database-enforced construction
must prevent a revision or batch member from becoming visible without its exact
effect, receipt, and terminal settlement.

## Goal semantic snapshot

### Intended outcome and optional conditions

Every revision stores one bounded nonempty intended outcome. The direct
learner-request path retains the exact learner-authored wording except for
closed mechanical normalization such as line endings and Unicode validation; a
model paraphrase is model-supplied meaning and requires the acceptance path.

Attainment conditions are an ordered optional list. Empty, duplicate after
canonical equality, over-count, over-byte, malformed, or silently truncated
conditions are rejected. The program does not require conditions merely to make
the Goal measurable. Conditions may preserve learner-authored scores,
thresholds, or quantities when the learner means them as part of attainment.
They do not become program-owned weights, mastery state, work estimates,
scheduled tasks, allocation, completion evidence, or automatic lifecycle
rules.

A mixed learner utterance may include Goal meaning plus cadence, planned work,
or another authority's meaning. Gate 16 may commit only the exact Goal portion
after the learner authors or accepts that separation. Dropping `daily`,
inventing a broader outcome, or turning schedule language into an attainment
condition is a semantic change and therefore requires an exact accepted
candidate. The absence of Gate 21 does not authorize Goal to absorb deferred
planning work.

### LearnerHome, Course, and multi-Course scope

LearnerHome-wide is an explicit scope arm, not a null that means unknown. A
Course-scoped or multi-Course revision stores a canonical unique set of stable
Course IDs. Order is presentation metadata only and cannot imply priority,
allocation, prerequisite order, or decomposition.

On creation, an otherwise clear learner Goal with no learner-authored or
accepted Course restriction uses LearnerHome-wide scope. That records the
absence of Course scoping rather than inferring that every Course is a target.
An ambient directory, default Course, current route, or model guess cannot
silently narrow it. Explicit language such as “this Course” may resolve through
one exact trusted current Course identity; if that referent is not exact, the
scope requires clarification or candidate acceptance.

On initial scoped creation, every Course membership is newly bound. On a later
revision, a Course ID absent from the exact predecessor scope and present in
the result is newly bound; an identical predecessor/result membership is
carried; and a predecessor member absent from the result is removed. Each newly
bound member must name an exact Course-owner snapshot and still be active in
the final transaction. A carried member instead proves the exact sealed
predecessor membership and remains preservable when that Course is withdrawn
or otherwise unavailable. A removal likewise requires no current Course
eligibility. Semantic authorization for the complete resulting scope remains
subject to the dependency rules below; technical carry permission does not
manufacture learner intent.

These rules apply per member. In a multi-Course correction, retained withdrawn
members may be carried, any member may be removed, and only additions require
current active-Course proof. Withdrawal or owner-state drift between candidate
formation and settlement stales a newly bound member, but does not stale an
exact carried member or removal. Course withdrawal after commit leaves Goal
history intact and makes only that Course's current scope-availability
projection unavailable. Restoration of the same Course identity may make it
available again without a Goal write.

An explicit correction may remove, add, or replace Course membership while
consuming the exact Goal head. It may preserve a withdrawn Course restriction,
remove one withdrawn member, or clear an unusable Course scope to
LearnerHome-wide without requiring the old Course to be active. No scope change
follows automatically from a working-View change, route anchor, current
directory, active conversation, material alignment, Course withdrawal or
restoration, or model guess.

### Optional target boundary

The first closed temporal representation has three arms:

- **absent:** no target boundary was accepted;
- **exact instant:** one absolute instant plus the accepted source expression
  and normalized local/offset representation; or
- **local date:** one ISO civil date plus its accepted IANA timezone and source
  expression, without an invented time of day.

Relative or local language is interpreted from the exact learner occurrence's
Gate 15 source temporal context. The model cannot supply trusted current time,
host timezone, or offset. An explicit unambiguous offset-bearing instant may be
normalized without a source-timezone fallback. If required temporal authority
is unavailable or interpretation is materially ambiguous, the candidate does
not commit until the learner accepts an exact representable meaning or removes
the target; the runtime never silently drops it.

Reads derive before/on-or-reached/after relations from the stored arm and a
caller-supplied trusted as-of time. Exact vocabulary may differ by arm, but
passage creates no Goal revision, lifecycle disposition, evidence, event,
receipt, timer, or frontier advance. Host-timezone changes cannot reinterpret a
stored boundary.

## Revision, lifecycle, and replacement semantics

### Linear revision identity

The first revision has version `1`, no predecessor, and an absent previous
snapshot. Every later revision names the exact current head and version, names
that head as predecessor, and commits exactly `previousVersion + 1`. One head
may be consumed only once by one successor revision. Database constraints reject
branches, skipped/reused versions, cross-Goal predecessors, mutable/deleted
revisions, dangling batch membership, malformed disposition membership, or an
unsealed revision/effect/receipt construction.

Each revision carries a complete outcome, conditions, scope, target, and
lifecycle disposition rather than a patch. That makes every historical state
independently readable and prevents later defaults from reinterpreting an old
write. A later wording or threshold change remains the same Goal only because
the learner authorizes that identity continuity, not because a similarity
function matches it.

The producing operation also preserves one bounded basis for every complete
snapshot field: exact current learner wording, exact accepted-candidate meaning,
or dependency-valid carry from the named predecessor. This basis map explains
provenance; the complete revision remains the state authority. Textual equality
is necessary for carry but is never by itself proof that the field's exact
meaning survived.

### Stored lifecycle disposition

Every revision has exactly one closed disposition arm:

- **active:** the learner currently presents this Goal identity as pursued;
- **achieved:** the learner explicitly declares this exact Goal meaning attained;
- **abandoned:** the learner explicitly declares pursuit of this exact Goal
  meaning stopped without an attainment claim; or
- **superseded:** the learner explicitly says one distinct Goal has replaced
  this Goal's underlying purpose, naming the target Goal and the exact target
  basis revision accepted for that relation.

Initial ordinary creation is active. Initial achieved or abandoned meaning is
legal only when explicitly learner-authored or accepted. Initial creation does
not use the superseded arm; establishing that relation uses `replace` against an
exact source head. A model may never derive any arm from time passage, Course or
task completion, evidence, performance, wording similarity, or its confidence.

An update may preserve or explicitly change the complete disposition. An exact
same complete snapshot is a typed no-change. Changing only disposition is a real
revision. Updating other Goal meaning does not implicitly clear, restore,
retarget, or create supersession: the resulting revision must preserve the exact
accepted relation or explicitly leave it under the authorization rules below.
Earlier revisions and dispositions remain immutable.

The optional learner-authored explanation in the causal source may remain
inspectable, but Gate 16 neither requires a reason nor invents one. Later
learner-state authorities may record report, evidence, or inference separately;
none of those records rewrites this disposition.

### Dependency-complete carry authorization

A direct update is legal only when the current learner presentation authorizes
the exact resulting Goal identity, complete semantic meaning, and disposition.
The runtime records which fields are newly authored and which are carried, but
it cannot equate byte equality with semantic preservation. The minimum closed
dependency policy is:

- changing the outcome requires explicit authorization of identity continuity
  and of every carried condition, scope, target, and non-active disposition;
- changing scope requires explicit authorization of every carried outcome,
  condition, and target;
- carrying achieved or abandoned across any semantic-field change requires the
  learner to reauthorize that declaration for the complete revised meaning;
- carrying, clearing, or retargeting supersession across any semantic-field
  change requires explicit preservation or change of that exact relation; and
- a narrow active condition-only or target-only correction may carry the stable
  outcome, scope, other fields, and active disposition only when the learner's
  current wording unambiguously identifies the same Goal and the bounded change.

These are minimum prompt-forcing rules, not semantic proof. If the exact current
wording does not establish every dependency, the whole resulting candidate uses
the accepted-candidate arm. Implementations may conservatively route more cases
to acceptance but may not weaken the dependency closure. Thus changing `>=85`
to `>=90` cannot silently carry achieved, changing one exam outcome cannot
silently reuse another exam's target/scope/conditions, and correcting a typo in
a superseded Goal cannot silently unsupersede it.

### Supersession is an independently preservable one-to-one relation

A replacement consumes the exact current source head and appends a successor
whose disposition is `superseded`. Its target arm is closed:

- **existing target:** name a distinct Goal in the same LearnerHome and its
  exact current basis revision; or
- **new target:** atomically generate one distinct Goal with a complete initial
  non-superseded revision and use that generated revision as the basis.

The source successor may carry its semantic fields for a pure replacement or
contain separately authorized corrections, but the supersession meaning is
explicit. A carried source Course membership does not become a new binding
merely because `replace` appends the superseded successor. A generated target
revision evaluates its own initial scope independently, so each of its scoped
members is newly bound and needs active proof. An existing target is not
mutated by the relation. It must still have the exact accepted head when the
final transaction validates its pre-apply snapshot; an independently authorized
same-set update may then consume that head as already represented in the
accepted change set. Later target revisions do not invalidate the relation or
rewrite its recorded basis. Reads may show the target's current head separately
but never pretend that later meaning was the accepted basis.

At final settlement the complete projected current relations have at most one
outgoing target per source, at most one incoming supersession per target, and no
cycle. Historical incoming relations do not block a new current relation. A
bounded change set may explicitly clear an old relation and establish another
in one atomic final projection. The target may also receive an independently
authorized update in that same change set; its pre-change head remains the exact
accepted relation basis, and the final graph is validated after all operations.

A later source update can preserve the exact target relation while correcting
outcome, conditions, scope, or target time. It clears supersession only when the
learner explicitly authorizes a non-superseded disposition, and it changes the
target only through another `replace`. Current reads report only the direct
accepted target; they do not infer transitive replacement, merge identities, or
create decomposition topology. Unsupported one-to-many, many-to-one,
split/decomposition, or cyclic meaning requires clarification rather than a
fabricated relation.

## Bounded atomic Goal change set

### Closed operation union

Gate 16 adds one reserved versioned Goal capability whose canonical command is
one nonempty bounded ordered change set. Its operations form a closed union:

- **create:** generate one new Goal identity and initial complete
  non-superseded revision;
- **update:** consume one exact existing Goal head/version and append one
  complete next revision, preserving its exact disposition or explicitly
  changing it to active/achieved/abandoned, but not introducing or retargeting
  supersession; or
- **replace:** consume one exact source Goal head/version, append one complete
  superseded successor, and bind it either to an exact eligible existing Goal
  head or to one new Goal generated with a complete initial non-superseded
  revision inside that operation.

Runtime-generated Goal, revision, effect, receipt, permission, time, and order
identities are not model input. Existing Goal updates name exact IDs and
versions obtained from a trusted owner read or protected context projection.
An existing replacement target additionally names its exact accepted basis
head. Every resulting revision contains the complete proposed snapshot, bounded
field-basis map, per-member Course admission bases, and verbatim source excerpts
or accepted-candidate basis needed by the dependency policy. A new replacement
target's identities are internal results of that operation rather than
cross-operation model labels.

The change set has implementation-fixed operation, Course-membership,
condition-count, per-string, and aggregate-byte limits. Overflow rejects the
whole candidate; it never drops, truncates, summarizes, or commits a prefix.
Within one set, an existing Goal head may be consumed at most once and generated
identities cannot be cross-referenced by another operation. An exact consumed
head may additionally serve as a replacement target basis for an independent
operation in the same accepted set; the relation retains that pre-change basis
and the final one-to-one acyclic projection is validated after all operations.

### Why the change set is one effect

One learner utterance may explicitly establish several independent Goals, such
as operating-systems and data-structures exam outcomes. Treating that as one
Goal would merge meanings; requiring fabricated learner messages would corrupt
source identity; letting several independent domain commits race would make one
accepted candidate partially durable.

The bounded change set is therefore one Goal-owned semantic effect at address
`(admitted learner occurrence, Goal change-set slot)`. It consumes Gate 8's one
applied-learning-mutation slot once and may produce several Goal-owned rows in
one final transaction. This is not a generic command bus, transaction language,
Agenda batch, or authorization to group unrelated authorities.

All operations preflight against one database snapshot. If any real operation
is invalid, stale, unauthorized, over limit, has a newly bound Course member
whose exact target is no longer active, or produces an invalid final
supersession projection, the whole set settles with no Goal effect. A carried
or removed Course member is not made ineligible by current withdrawal.
Authorized no-change operations may coexist with real changes and are reported,
but create no revision of their own. If every operation is no-change, no effect,
receipt arm, mutation-slot use, or shared-frontier advance occurs.

## Learner source, clarification, and authorization

### Direct learner-request arm

A clear fully learner-authored change set uses the trusted current occurrence
under `learner_request`. The default Repa profile treats this as a routine local,
inspectable, reversible learning command and adds no Gate-imposed confirmation.
An explicit effective deny, missing delegated capability, or configured
ordinary `ask` policy still controls execution.

This arm is deliberately conservative. The runtime verifies each bounded source
excerpt against the exact current learner presentation and accepts only
mechanical normalization plus owner-validated exact identities. Outcome and
condition prose that changes must remain current learner wording. A carried
field must name the exact predecessor basis and pass the dependency policy;
textual equality alone is insufficient. Course resolution and target-time
normalization must be exact and unambiguous under the accepted owner/time
context. Existing-target replacement requires exact current source and target
identities plus learner wording that establishes the relation. A paraphrase,
new condition, widened or narrowed scope, inferred identity continuity,
unreauthorized achieved/abandoned meaning, silently preserved/cleared/retargeted
supersession, ambiguous relative date, or omitted mixed-intent clause is not
direct merely because the model labels it so.

The runtime cannot prove the full semantics of natural language. Its closed
checks bound what the model may claim, while the exact source, model-authored
invocation, canonical payload, result, and correction path remain inspectable.
A bounded native-provider qualification must still test that the default model
uses this arm only for a clearly explicit learner Goal.

### Model-assisted accepted-candidate arm

If the model supplies or changes any consequential outcome, condition, scope,
target interpretation, Goal identity relation, lifecycle disposition,
field-carry dependency, or replacement relation, the whole canonical change set uses
`learner_acceptance`. The runtime mints one stable once-only permission request
and visibly presents the complete bounded candidate, including:

- every create/update/replace operation and affected current Goal;
- intended outcome and ordered conditions;
- LearnerHome/Course/multi-Course scope with exact Course labels/IDs, current
  availability, and each resulting membership's new-binding or carry basis;
- normalized target boundary or explicit absence;
- each carried field and its exact predecessor basis when semantic dependency
  makes that preservation consequential;
- resulting disposition, including an exact supersession target and accepted
  target basis, whether that target already exists or will be created, and any
  relation preserved, cleared, or retargeted; and
- the fact that this is durable, correctable Goal state rather than evidence or
  a schedule.

Effective deny prevents the prompt. Otherwise the exact prompt is required even
under a wildcard allow or prior `always`; the baseline offers only one-time
approval and stores no reusable Goal-acceptance rule. Approve commits only that
request after final revalidation. Reject, correction, prompt disposal,
cancellation, or owner loss creates no Goal effect. Substantive correction must
enter ordinary learner Interaction as a new admitted occurrence before a
different candidate can commit; a permission outcome alone cannot become an
unrecorded semantic source.

The confirmation snapshot and permission request ID remain in the exact receipt
arm. The authorization basis truthfully says `learner_acceptance`; it does not
rewrite model-proposed prose into learner-authored source. The terminal
acknowledgement repeats the committed interpretation and correction path.

The intended model flow after iterative clarification is to call this exact
candidate surface rather than ask for an unstructured `yes` and then request a
second identical confirmation. Gate 16 does not require a `/goal` parser or
prohibit future direct surfaces that reuse the same domain and settlement
contract.

### Unresolved ambiguity remains no durable effect

When identity, correction versus later change, scope, target, or mixed intent
would materially change durable history and the learner neither supplies nor
accepts an interpretation, the command returns a typed no-effect result. The
Tutor may continue useful current learning from ordinary conversation context;
it may not block all teaching, silently choose a Goal identity, persist a draft
as accepted truth, or treat a model summary as the Goal.

Gate 16 adds no durable proposal/draft state. Pending permission is
process-local; accepted Goal state begins only in the atomic final settlement.
The durable transcript remains available under its existing owner, and a later
learner occurrence may form a new candidate.

## Command identity, settlement, and acknowledgement

### Replay and conflict precedence

The Goal capability reuses the shared learning-command preparation and final
settlement path. Both phases preserve this order; the final transaction is
authoritative:

1. Exact terminal physical Part/call replay validates the complete trusted
   envelope and canonical input, then returns the stored result without a new
   time, event, permission request, domain read, or Goal effect.
2. Reusing the Part ID or `(Assistant Message ID, provider call ID)` with a
   different tool, envelope, authorization arm, or canonical change set is a
   physical conflict and cannot alter the old result.
3. A physically new invocation validates only the immutable causal envelope
   needed to name the semantic slot: frozen Turn/input/message/tool membership,
   learner-occurrence identity, admitted capability/version membership, and the
   closed structural shape of the authorization arm and canonical input. This
   step does **not** evaluate current source availability, effective authority,
   permission, acceptance, cancellation, Goal/Course heads, or semantic carry.
4. If the occurrence's Goal change-set slot already has the exact same canonical
   fingerprint and authorization basis, settle `already_applied` with the
   original effect and a current relation projection. A different change set or
   basis is a semantic conflict requiring a new learner occurrence.
5. Only a genuinely new effect enforces the Assistant Message mutation slot,
   then evaluates effective authority and the applicable ordinary permission or
   exact accepted-candidate prompt. Its final settlement consumes that outcome
   before evaluating live source availability, direct-source/dependency rules,
   boundedness, exact source and existing-target heads, final supersession
   projection, no-change, target time, Course membership bases, and active-owner
   proofs only for newly bound Course members.

This is one total order. Immutable envelope/basis-shape validation precedes the
semantic address, while committed replay/duplicate/conflict precedes current
permission, acceptance, cancellation, source availability, newly bound Course
admission state, Goal-head checks, or carry validity. Later live state therefore
cannot rewrite history. Effective authority still precedes any live no-change
or current Goal projection for a genuinely new invocation.

### Reservation, permission, and final transaction

The common short-transaction pattern remains:

```text
register the physical call in the Session/Turn FIFO lane
-> reserve/admit the invocation and settle any replay/conflict
-> if a candidate remains, run ordinary permission or exact once-only acceptance outside SQLite
-> enter one final IMMEDIATE transaction
   -> repeat physical and semantic decisions
   -> consume permission/acceptance, then revalidate live source, field bases,
      limits, exact source/target heads, final supersession projection, Course
      membership bases, active-owner proofs for new bindings, and target interpretation
   -> derive all generated identities and the complete Goal change-set result
   -> atomically apply every real Goal operation
   -> write effect, receipt, confirmation snapshot when required, frontier, ToolPart, and event
-> commit and return the stored exact result
```

No SQLite transaction remains open while the learner considers a candidate.
The final transaction does not trust reservation-time Goal state or a newly
bound Course-owner snapshot. A concurrent Goal writer, changed head, or
withdrawal/owner drift of a newly bound Course after confirmation yields typed
stale/no-effect rather than applying a candidate the learner did not see.
Withdrawal or restoration of an exact carried or removed Course member does
not stale the Goal operation because availability was not its admission basis.
Target-time passage alone is not stale because it does not change the accepted
boundary.

For an applied change set, these values commit or roll back together:

- every generated Goal identity and immutable revision;
- condition and Course-scope memberships with their sealed admission bases;
- exact head consumption, lifecycle dispositions, and supersession memberships;
- Goal change-set effect and operation results;
- Gate 8 invocation, receipt, authorization and confirmation arm;
- the Assistant Message's applied-learning-mutation ownership;
- Turn consumed/resulting tool frontier;
- deterministic terminal acknowledgement, ToolPart, and Event projection; and
- one shared-learning-frontier advance.

All domain rows and the terminal settlement use one trusted settlement time
floored by command admission, source occurrence/order/time, Turn/tool causality,
the database-wide shared-learning frontier, every consumed Goal head, and every
Course owner snapshot. Exact replay retains the stored time and does not advance
anything.

### Exact result and terminal visibility

An applied or already-applied result contains at least:

- exact receipt and Goal change-set effect IDs;
- authorization basis and confirmation request ID when present;
- ordered per-operation outcome with generated/existing Goal and revision IDs,
  resulting lineage versions, complete lifecycle disposition, normalized
  scope and target summary, and no-change status where applicable; and
- trusted settlement time/order and shared-frontier sequence.

The result is bounded and contains no transcript attachment or raw permission
payload. A concise program-authored terminal projection becomes the ToolPart
title/body instead of generic `<tool> completed` output or raw settlement JSON.
It tells the learner what Goal meaning was stored, which items were unchanged,
the normalized target/scope, and how to correct it. This narrow acknowledgement
is not Gate 22's browser and does not claim that learning or planning occurred.

Once the terminal Part is durably settled, later provider hooks, truncation,
assistant prose, or provider failure cannot rewrite it. Post-commit observers
may observe but have no authority to turn committed success into an error.

## Goal owner reads

The Goal authority exposes bounded stable-snapshot reads for:

- one Goal identity's exact current head, lineage version, complete semantic
  snapshot, lifecycle disposition and exact supersession basis when present, scope
  availability, target relation at a caller-supplied trusted as-of time, and
  source receipt;
- stable cursor-bounded revision history for one Goal, including historical
  dispositions, supersession targets/bases, field-basis provenance, and exact
  source availability;
- stable cursor-bounded discovery of Goal identities and current heads with
  optional exact disposition and Course-ID filters; and
- exact change-set effect/receipt inspection by effect or Goal revision identity.

Current status is a closed projection of `active`, `achieved`, `abandoned`, or
`superseded` from the exact current revision's stored disposition. A superseded
read returns its accepted target Goal/basis revision and may separately show the
target's current head; it never substitutes the later head for the accepted
basis or follows wording similarity. Target-time relation and Course
availability are separately reported and cannot overwrite disposition.

All multi-row reads use one database snapshot, deterministic non-priority
ordering, opaque scope-bound cursors, and bounds on rows and nested conditions,
Courses, history, and source details. Reads fail closed on a branch, missing
commit seal, malformed disposition/temporal arm, dangling effect/receipt,
invalid current one-to-one/cycle projection, or incomplete scope union. They
never repair state by choosing the highest version.

Gate 16 registers no general model-visible Goal browser and performs no
automatic prompt/context injection. Gate 18 later chooses a bounded exact Goal
projection for a model sample; Gate 21 consumes exact revisions as planning
demands; Gate 22 composes learner-facing inspect/correct. A fresh Session can
query the same LearnerHome owner state without importing an old transcript, but
that fact does not pre-own Gate 18 selection.

## Failure, cancellation, restart, and destructive lifecycle

- **Invalid or semantically widened direct request:** changed source text,
  model paraphrase, invented condition, equality-only carry, incomplete
  dependency authorization, hidden scope/identity/disposition/relation change,
  ambiguous target normalization, unsupported mixed intent, or over-limit input
  settles with no Goal effect and requests only consequential clarification.
- **Unaccepted model candidate:** deny, reject, correction, disposal,
  cancellation, or owner loss leaves no Goal identity, revision, disposition/
  supersession membership, field basis, effect, receipt arm, mutation-slot use,
  or frontier advance.
- **Stale Goal head:** update or replace after another revision/replacement
  commits fails the whole change set. One exact head has one atomic winner and
  history never branches.
- **Stale or ineligible existing replacement target:** a changed target head,
  cross-LearnerHome/self target, duplicate current incoming relation, or cyclic
  final projection rejects the whole change set; later target revisions after a
  successful commit do not rewrite the accepted relation basis.
- **Stale newly bound Course membership:** withdrawal or changed owner state of
  an added Course before final commit rejects the whole candidate. Current
  unavailability of an exact carried or removed predecessor membership does
  not reject correction, lifecycle change, or replacement. Later withdrawal
  changes only read availability.
- **Concurrent duplicate:** the same occurrence/fingerprint produces one
  effect and exact duplicate results. A different interpretation for the same
  semantic slot conflicts rather than partially coexisting.
- **Transaction failure:** injected failure at every Goal identity, revision,
  condition, scope, disposition/supersession membership, field-basis, effect,
  receipt, frontier, ToolPart, or event boundary rolls the complete change set
  back.
- **Cancellation before commit:** no effect unless the uninterruptible final
  transaction already committed; durable reconciliation then returns exact
  success rather than false cancellation.
- **Failure after possible commit:** the runtime performs one uninterruptible
  physical/semantic reconciliation. If it cannot determine the durable result,
  it returns typed `outcome_unknown`, never a claimed no-effect or a retry that
  could duplicate Goals.
- **Process loss before commit:** admitted nonterminal work settles interrupted
  under the Gate 8/12 startup owner. It is not redispatched, re-prompted, or
  reconstructed as a durable Goal draft.
- **Process loss after commit:** restart exposes the exact effect, revisions,
  acknowledgement, and source. A new command uses fresh heads; an interrupted
  provider operation is not resumed against changed Goal state.
- **Compaction:** re-presentation retains the original occurrence and cannot
  create another Goal effect or turn a summary into source.
- **Fork:** cloned history remains a read-only presentation and cannot authorize
  a target-fork Goal write. The genuine fork-start learner input receives a new
  Turn/input/occurrence and may create one new change-set effect.
- **Whole-Session deletion:** applied Goals, revisions, dispositions,
  supersession memberships, field bases, effects, receipts, confirmation
  snapshots, acknowledgements, and bounded semantic content remain. The origin
  becomes truthfully unavailable through the existing occurrence tombstone;
  failed/no-effect invocation rows are removed under Gate 8 ownership.
- **Revert:** a cleanup set containing an applied Goal Part or its Assistant
  Message rejects atomically. Eligible unrelated/no-effect revert cleanup does
  not change Goal state or invent source loss.
- **Course withdrawal and target passage:** neither creates a Goal transition,
  auto-achievement, abandonment, failure, retarget, or replacement. Withdrawal
  also cannot prevent a later learner-authorized correction, disposition
  change, or replacement that carries or removes the exact existing membership.
- **Invariant corruption:** writes and reads fail closed. No prompt, model, or
  terminal projection may synthesize a head, condition, scope, target, effect,
  or receipt to continue.

## Implementation ownership and dependency direction

The production owner is a separate learner-Goal Core authority. It owns Goal
identity, immutable revision semantics, complete snapshots, lifecycle
dispositions, supersession relation, bounded change sets, semantic
duplicate/conflict, exact Course-scope relation, target interpretation,
acknowledgement data, and bounded reads. It is not a Goal manager, generic
Agenda service, learner-state store, planner, graph, or Agent memory.

Dependencies remain one-directional:

- learner occurrence and Turn own exact causal source, source order/temporal
  context, current input membership, presentation availability, and fork/
  compaction identity;
- learning command owns physical invocation, trusted envelope, effective
  permission, once-only confirmation request, receipt union, mutation slot,
  terminal ToolPart/event settlement, reconciliation, and startup recovery;
- Goal owns semantic address/effect, identities, revisions, conditions, scope,
  target, lifecycle/replacement legality, acknowledgement content, and reads;
- Course exposes an exact active-Course descriptor and transaction revalidator
  for scope targets without giving Goal its mutable service or View semantics;
- trusted clock/source temporal context supplies time facts without accepting
  model-supplied current time or host fallback;
- later Context, planning, and terminal owners receive read-only Goal
  projections or exact commands, never the mutable authority; and
- the released-v1 application layer composes the reserved tool with the shared
  runtime and cannot move Goal meaning into the generic Agent runner.

The reserved capability identity cannot be replaced by custom or MCP tools.
Default Agent composition may expose it under effective permission; delegated
Turns require explicit non-escalating Goal capability and the exact causal
learner occurrence. Internal title, compaction, project-copy, recovery, and
other noninteractive model operations receive no Goal writer.

No HTTP mutation route, background worker, daemon, provider-specific Goal path,
preview-v2 runner, slash-command-only executor, universal command bus, or
compatibility adapter is added. Existing generic slash expansion is only
interaction-mechanism evidence; Gate 16 neither requires nor forbids a later
direct terminal syntax that obeys the same authority.

## Migration and compatibility boundary

Gate 16 adds one Repa-owned forward migration after the accepted Gate 15 schema
and keeps the generated current schema equivalent to a fresh database.

The migration must:

- create empty Goal identity/revision/condition/scope/disposition/supersession/
  field-basis/effect state for fresh and upgraded LearnerHomes;
- install exact foreign keys, closed unions, unique successor/head-consumption
  guards, immutable history, version/CAS checks, exact existing/new replacement
  target membership, current one-to-one/acyclic supersession, field-basis and
  target-arm checks, bounded membership, effect/receipt ownership, and
  commit-seal integrity required by this contract;
- extend the closed learning-command invocation, settlement, effect, and receipt
  unions with one exact Goal change-set arm without changing replay meaning for
  Course, Representation, navigation, or retained-steering commands;
- preserve every predecessor row and pass foreign-key/integrity checks before
  commit; and
- produce schema-equivalent fresh and Gate-15-upgrade databases apart from
  truthful historical data.

No Goal, lifecycle disposition, scope, target, condition, supersession,
field-basis, or learner-state meaning is backfilled from old transcripts,
Session summaries, retained steering, navigation, Course titles, assignments,
todo state, oracle data, or model guesses. Historical learner occurrences
cannot be re-presented as new causal authority. There is no migration from the
old HarmonyOS project, OpenCode todos, Codex execution Goals, or pre-fork lab
tables and no reverse migration promise. Selective cross-authority physical
deep deletion remains a post-baseline Data Lifecycle concern.

## Current falsification pressure

The principal multi-Goal case is deliberately outside Gate 16's arithmetic:

- the learner starts from zero on the 16th;
- the operating-systems exam is on the 18th;
- the data-structures exam is on the 20th; and
- no Assignment record exists.

Giving the first two available days to operating systems and the following two
to data structures is a plausible consequence of those inputs. Starting ten
days earlier must permit a materially different allocation based on accepted
ability, targets, remaining work, capacity, and source-bearing marginal-return
judgments. Those example allocations are not hard-coded policy. Their purpose
is to falsify static Goal priority and Assignment-only planning.

Gate 16 must preserve enough exact Goal meaning for Gate 21 to distinguish the
demands without owning the allocation. Gate 21's bounded experiment must prove
that accepted input changes cause reproducible recomputation. Gate 23 must later
exercise that Goal-driven path through the sole production entrypoint.

## Fixed non-implications

Gate 16 does not imply:

- an OpenCode todo or Codex execution Goal;
- a mandatory Course, Course View, LearningSpace, deadline, score, or attainment
  condition;
- mastery, assessment evidence, automatic attainment, or a failed state derived
  from elapsed time;
- an exhaustive taxonomy or mandatory durable episode record for abandonment,
  forgetting, decay, shallow understanding, renewed pursuit, or raised standards;
- Goal decomposition, work estimates, capacity, allocation, scheduling, or a
  universal priority scalar;
- a required `/goal` command or a required model interview;
- persistence of every aspiration-like conversational sentence; or
- completion of Gate 18 context, Gate 21 planning, Gate 22 terminal projection,
  or Gate 23 product-loop work.

## Closing evidence contract

Gate 16 may close only if fresh evidence demonstrates the following against the
exact implementation candidate. Passing a plan or implementing the schema is
not evidence by itself.

### Schema, migration, and authority invariants

- fresh and Gate-15-upgrade schemas are equivalent and contain no fabricated
  Goal, revision, condition, scope, target, disposition, supersession,
  field-basis, effect, or receipt;
- raw SQLite attacks cannot forge Goal/change-set/receipt ownership, mutate or
  delete history, branch a lineage, skip/reuse a version, give one head multiple
  successors, attach a cross-Goal predecessor, forge an existing/new
  supersession target, field basis, or Course-membership admission basis outside
  its sealed operation, misclassify a newly added Course as carried from a
  predecessor that did not contain it, create a second current incoming/outgoing
  relation or current cycle, create a malformed disposition/target/scope union,
  duplicate condition ordinals or Course membership, or expose an unsealed
  partial batch;
- Goal IDs, revision IDs, effect IDs, receipts, trusted occurrence/Turn/time,
  source order, authorization basis, confirmation request, and generated
  create/replace identities remain program-owned;
- LearnerHome-wide scope has no Course memberships, Course scope has one, and
  multi-Course scope has a bounded unique nonempty set without View/item links;
  every resulting Course member is exactly a newly bound active-owner proof or
  an identical exact-predecessor carry, while removals cannot require a current
  Course row or be reclassified as additions;
- absent, exact-instant, and local-date target arms are exhaustive and cannot
  silently carry both, neither, an invented local time, or host-default timezone;
- each existing Goal head is consumed at most once in a change set and has one
  atomic winner across update and replacement, while an exact pre-change head
  may separately remain the accepted basis of a relation targeting that Goal;
  and
- migration preserves all Gate 8–15 rows, replay semantics, foreign keys, and
  current generated-schema parity.

### Goal identity, revision, and lifecycle behavior

- zero Goals is valid; independent create operations produce independent stable
  identities even when wording overlaps;
- one learner occurrence can atomically create the distinct OS and
  data-structures exam Goals in one bounded change set without merging them or
  consuming several Gate 8 mutation slots;
- create/update, replacement to a new Goal, replacement to an already-existing
  exact Goal, exact same-snapshot no-change, explicit disposition change,
  concurrent stale writers, and bounded mixed change/no-change batches follow
  the contract with no partial commit;
- active, achieved, abandoned, and superseded are exact learner-authorized
  dispositions, and no Tutor prose, Agent completion, Course progress, deadline
  passage, assessment result, evidence, or learner-state inference changes them
  automatically;
- after one scoped Course is withdrawn, explicit correction, achievement,
  abandonment, restoration to active, and replacement remain legal when the
  resulting complete revision carries or removes that exact membership;
- a mistaken achievement can be explicitly corrected under the same identity;
  an abandoned Goal can be explicitly resumed after substantial forgetting;
  a once-true achievement can remain historical while a later active revision
  reflects decay or a higher standard; and a learner-accepted distinct outcome
  can create a separate Goal, without any case becoming the universal default;
- if independent Goals A and B already exist, an explicit `B replaces A`
  operation records B's exact current basis without creating a third Goal;
- a semantic correction to superseded A can preserve its exact relation to B,
  while explicit restoration clears it and explicit retargeting uses another
  replacement; no ordinary correction changes relation state implicitly;
- stale existing-target heads, self/cross-LearnerHome targets, a second current
  incoming relation, and cycles fail atomically, while later B revisions preserve
  A's accepted relation basis and are shown separately on reads;
- semantically similar independent Goals are never merged, replaced, achieved,
  or reactivated by keyword, embedding, score, or model confidence; and
- unsupported merge/split/decomposition meaning requests clarification or a
  representable independent change rather than manufacturing Goal topology.

### Outcome, condition, scope, and target behavior

- every revision has one bounded nonempty outcome and a complete immutable
  snapshot; optional zero/multiple ordered conditions survive restart and exact
  history reads without becoming criterion identities or evidence;
- an accepted score/threshold/quantity condition remains learner-owned Goal
  meaning while producing no mastery, evidence, schedule, or automatic
  lifecycle transition;
- every update records exact authored/accepted/carried field bases; a narrow
  active target-only or condition-only correction may carry stable fields when
  the learner explicitly identifies that bounded change, without converting the
  complete revision into a patch;
- changing achieved `score >=85` to `score >=90` cannot carry achievement
  without exact reauthorization, and changing one exam outcome cannot reuse
  byte-equal conditions, scope, or target whose referent may have changed;
- outcome/scope changes and all non-active disposition carry exercise the
  dependency closure and route to the accepted-candidate arm whenever current
  learner wording is incomplete;
- condition and aggregate limits reject without truncation, summary, dropped
  items, or prefix commit;
- LearnerHome, one-Course, and multi-Course revisions can be created and
  corrected; initial and added Course memberships require exact active-owner
  proof at settlement, while exact predecessor memberships can be carried or
  removed after withdrawal and report availability separately;
- deterministic one-Course and multi-Course oracles withdraw one member, then
  preserve the exact source scope through wording and target correction,
  explicitly achieve and abandon the Goal, and replace it with both an existing
  and a new Goal while the superseded source successor still carries that
  scope; each target keeps its independently accepted eligible scope. Separate
  cases remove the withdrawn member, retain other members, and reject only an
  unavailable new addition;
- an otherwise explicit creation with no Course restriction is LearnerHome-wide,
  while a default Course, route, directory, or ambiguous “this Course” cannot
  silently narrow its scope;
- View/working-selection/route/material changes neither stale nor retarget an
  already committed Course scope;
- absent target, exact offset-bearing instant, explicit local date, and relative
  date interpreted from resolved source temporal context are exact;
- an unavailable temporal context blocks only a target interpretation that
  needs it, never invents UTC/host time, and does not block ordinary zero-write
  teaching or a later accepted target-free Goal;
- before/on/reached/after target reads create no transition, evidence, event,
  receipt, or frontier write, including after restart; and
- the mixed input `for the next two months, learn one data structure/algorithm
  every day` cannot silently store cadence as Goal meaning or drop it while
  claiming the whole learner request was persisted.

### Direct source and model-assisted acceptance

- a clearly explicit learner-authored Goal change uses the exact current
  occurrence, verified source excerpts, conservative normalization, and no
  Gate-imposed second confirmation under default allow;
- direct mode rejects a model paraphrase, invented condition, inferred
  achievement/abandonment, equality-only field carry, unpreserved supersession,
  semantic scope/outcome dependency, ambiguous date, or omitted material clause
  rather than trusting a model-selected basis label;
- a model-assisted candidate displays every consequential operation, outcome,
  condition, scope, target, lifecycle disposition, field basis, and existing/new
  supersession relation in one bounded stable once-only confirmation;
- effective deny prevents that prompt; approve commits only the exact candidate;
  reject/correct/cancel/dispose/owner loss commits nothing and stores no reusable
  acceptance rule or Goal draft;
- a correction returned through permission cannot become unrecorded new Goal
  source; a substantively changed candidate requires a new admitted learner
  occurrence;
- an unstructured aspiration, hypothetical example, quoted third-party goal,
  model suggestion, Tutor summary, or conversation about what goals generally
  mean creates no Goal without explicit initiation or acceptance;
- materially unresolved correction/resumption/new-purpose ambiguity creates no
  durable effect while the current learning interaction remains usable; and
- compaction text or an old fork-history clone cannot serve as the exact current
  learner authorization basis.

### Shared command settlement and failure behavior

- exact physical replay, conflicting Part/call reuse, semantic
  already-applied/conflict, effective authority, no-change, stale CAS, and
  genuinely-new live checks retain the specified precedence;
- a physically new exact semantic duplicate/conflict after source deletion,
  capability revocation, permission-policy change, cancellation, or target-head
  change still settles from committed history after immutable envelope/arm-shape
  validation and before every live check;
- one occurrence owns at most one applied Goal change-set effect, while one
  Assistant Message still owns at most one applied learning mutation across all
  Gate 8–16 command kinds;
- reverse-order physical execution cannot bypass the common FIFO lane or produce
  causally inverted source/settlement truth;
- failure injection at every new identity, revision, disposition/supersession/
  field-basis membership, effect, receipt, confirmation, frontier, ToolPart, and
  Event boundary leaves either the whole exact change set or no Goal-domain
  change;
- same-head writers and same-occurrence invocations produce one winner plus
  exact duplicate/conflict/stale results without a branch or partial batch;
- commit-versus-cancel, final reconciliation, and withdrawal of a newly bound
  Course race return exact success, typed no-effect, or `outcome_unknown`, never
  false cancellation or duplicate Goals; withdrawal racing an exact carry or
  removal does not stale that Goal operation solely because availability changed;
- crash recovery interrupts admitted nonterminal work without provider
  redispatch, Goal draft reconstruction, or confirmation replay; and
- a committed result remains exact after process failure, capability revoke,
  source deletion, later Goal revision, target passage, or Course withdrawal.

### Reads, terminal visibility, and destructive lifecycle

- current, by-ID, filtered discovery, per-Goal history, and effect/receipt reads
  use one snapshot, bounded nested detail, deterministic non-priority order, and
  opaque scope-bound cursors;
- current reads distinguish stored active/achieved/abandoned/superseded
  disposition, accepted supersession target basis, that target Goal's separately
  current head, target-time relation, per-member Course availability and
  admission basis, and source availability without collapsing them;
- a fresh Session reads the same LearnerHome Goal identities and exact revisions
  without importing prior transcript text or mutating default Course state;
- successful direct and confirmed writes render a concise deterministic
  acknowledgement even when provider failure prevents later assistant prose;
- no-change and typed failures remain visible without claiming a Goal changed;
- whole-Session deletion preserves applied Goal meaning, first settlement,
  receipt, confirmation basis, acknowledgement, and exact source tombstone while
  removing transcript-owned no-effect invocations;
- protected-effect revert rejects atomically; eligible unrelated/no-effect
  revert, compaction, fork-history clone, and genuine fork-start input preserve
  their distinct accepted behaviors; and
- restart preserves Goal heads, history, dispositions, supersession bases,
  field provenance, target/scope projection, source truth, acknowledgements, and
  stable pagination.

### Production-path and model qualification

Deterministic suites own identity, state, permission, settlement, and negative
oracles. One bounded real-provider qualification through the sole released-v1
production path must additionally demonstrate that model-facing semantics are
usable without treating stochastic prose as a unit-test oracle:

1. a clear fully learner-authored Goal is recognized as explicit, committed
   through the direct arm, and immediately acknowledged without an extra
   Gate-imposed confirmation;
2. ordinary discussion or a hypothetical aspiration does not silently write;
3. a genuinely ambiguous or model-expanded candidate is clarified and shown in
   the exact accepted-candidate surface before commit;
4. one accepted multi-Goal exam candidate creates two independent Goals with
   exact Course/target meaning and no Assignment or static priority;
5. deterministic capture proves the command used the exact current occurrence
   and the terminal result reached the actual provider/tool path; and
6. a later explicit correction changes the Goal owner read while no mastery,
   evidence, schedule, or automatic lifecycle claim appears.

Deterministic negative oracles—not stochastic provider prose—must prove the
field-dependency rules, including achieved-threshold change, cross-exam referent
change, supersession preservation during correction, existing-target
replacement, and duplicate/conflict precedence after live source/authority
changes. The provider qualification proves only that the model-facing surfaces
are usable and that captured tool input remains inside those enforced bounds.

A separate deterministic product-surface oracle commits a Goal change and then
injects provider failure before later prose; the terminal must retain the exact
acknowledgement rather than generic completion text or raw settlement JSON.
Focused carrier evidence covers every shared released-v1 path changed by the
implementation without enabling preview-v2 or claiming two runtimes.

### Ownership and negative reachability

- import/dependency checks prove Goal owns semantics, Course owns target
  validity, learning command owns settlement, Interaction/Turn owns source, and
  later consumers receive no mutable Goal service;
- the reserved capability cannot be shadowed by custom/MCP registration and an
  unpermitted delegated Turn cannot escalate to Goal writes;
- internal title, compaction, recovery, project-copy, preview-v2, HTTP, MCP,
  background, and provider-special paths cannot create Goal state; and
- no OpenCode todo, Codex execution Goal, universal Agenda item, general graph,
  learner activity/mastery store, pursuit taxonomy, scheduler, priority scalar,
  work estimate, capacity allocation, Goal decomposition, context injection, or
  shadow learning runtime becomes reachable.

Focused Core and OpenCode behavior suites, migration equivalence/integrity
checks, affected package typechecks, deterministic product/request capture, and
the bounded real-provider qualification are expected. Broader suites, packaged
oracles, or release builds are required only if the exact implementation changes
their carrier or leaves a cross-package claim unresolved. Documentation-only
contract work uses diff, link, formatting, and worktree checks.

## Design evidence provenance

This contract was derived against the accepted product and
architecture documents, Roadmap 09, and the closed Gate 8, Gate 12, Gate 14, and
Gate 15 contracts. The implementation audit used the production fork at base
HEAD `4fa0263e7` with the accepted Gate 15 implementation fixed by `03ea74ec4`.

| Evidence | Preserved invariant | Deliberate Gate 16 difference |
| --- | --- | --- |
| `packages/core/src/learning-command/*` and `packages/opencode/src/learning-command/runtime.ts` | trusted occurrence/Turn/invocation envelope, one mutation slot, physical replay, receipt, atomic ToolPart/event settlement, recovery | extend the closed command/effect/receipt union for one Goal-owned bounded change-set effect; do not add another runner |
| `packages/core/src/retained-steering*` | immutable owner lineage, exact source order/time, strict CAS, bounded source, deterministic acknowledgement, no fabricated backfill | Goal has no expiry policy/cut; one accepted occurrence may produce several Goal operations in one bounded effect |
| `packages/core/src/learner-navigation*` | exact owner target proof, one-time confirmation when learner acceptance is required, source projection, stale/read behavior | Course membership is Goal scope rather than navigation; new bindings require an active owner proof, exact predecessor carries survive withdrawal, and model-assisted Goal meaning confirms the whole semantic candidate |
| `packages/core/src/turn/learning-command-registration.ts` and released-v1 tool registry | only frozen current learner input and permitted tool membership authorize a write; copied history is read-only | add one reserved Goal capability without giving internal samples, custom tools, or MCP an alternate writer |
| `packages/opencode/src/cli/cmd/run/stream.transport.ts` | current slash commands may still enter the ordinary model path | no `/goal` syntax or deterministic parser is required by the contract |

No external scheduler, goal-management package, or preview-v2 runtime was used
as product authority. The inherited local mechanisms already own the
computational settlement and lineage problems; the new derivation is limited to
Goal meaning, bounded multi-Goal atomicity, and direct-versus-accepted semantic
authorization.

## Independent review state

Fresh top-level reviewer task `019f80b5-58a4-74a1-8530-1405a1e57a25` opened
whole-Gate run `gate16-whole-20260721-01`. It did not dispute `G16-MD-001`
through `G16-MD-008`, the bounded multi-Goal effect, successor-Gate exclusions,
or the propagated planning correction. Its first contract/theory pass returned
`Revise` with four acceptance-changing executor-derived defects. The closure
pass retested and closed all four, then returned `Revise` with one new
acceptance-changing Course/Goal separation defect. The next closure pass
retested that repair and returned `Accept`:

| Finding | Reviewer result | Current contract state |
| --- | --- | --- |
| `G16-CT-001` | closed: replacement had been unable to target an already-existing Goal | exact existing-target and generated-new-target arms, same-LearnerHome/distinct-head proof, and final one-to-one/acyclic validation remain in the candidate |
| `G16-CT-002` | closed: source-head coupling had let ordinary correction silently clear supersession | supersession remains the complete revision's independently preservable disposition, with explicit preserve, clear, and retarget rules |
| `G16-CT-003` | closed: byte equality had been treated as enough authority to carry terminal or referent-sensitive meaning | per-field basis and minimum dependency closure continue to require exact reauthorization or whole-candidate acceptance |
| `G16-CT-004` | closed: replay precedence had contradicted the passed duplicate/conflict-before-live-state invariant | the single total order continues to resolve immutable envelope/shape and committed history before live checks for a new effect |
| `G16-CT-005` | closed: requiring every Course in every successor revision to remain active had let reversible Course withdrawal block learner-owned Goal correction and lifecycle authority | active proof applies only to initial or newly added membership; an identical sealed predecessor membership may be preserved or removed while unavailable, per member in a multi-Course scope, with availability reported separately |

The reviewer retested one-Course and multi-Course wording/target correction,
active/achieved/abandoned disposition changes, existing/new replacement,
removal/addition, and withdrawal races. It found no new acceptance-changing
contract defect and reported every pass left the production checkout and Git
state unmodified.

The complete contract/theory candidate became implementation authority. The
accepted contract snapshot before this final status/evidence append had
SHA-256
`F5FEB90F65700CA830CE188628BFA332A08DB49365310B836974040BB5016469`;
the append does not revise its meaning. The
user-authorized whole-Gate loop retained the same reviewer for every later
implementation/evidence closure pass. It closed `G16-IE-001` through
`G16-IE-013`, including command/snapshot settlement, occurrence consumption,
direct-arm completeness, exact confirmation bases and immutable proof-owned
settlement, temporal and identifier integrity, state-frontier protection,
provider-shadow rejection, closed result shapes, raw database construction,
Course-withdrawal behavior, and migration preservation. No deterministic
implementation finding remains open.

The final accepted deterministic evidence included:

- Core learner-Goal behavior: `22 pass / 241 expects`, including the exact
  carried-Course `toJSON`/TOCTOU attack and recursively frozen released
  confirmation tree;
- Core database migration: `29 pass / 192 expects`, and Course authority:
  `8 pass / 67 expects`;
- released-v1 OpenCode learning-command runtime: `33 pass / 420 expects`,
  including once-only permission and the production prompt carrier;
- Core and OpenCode package typechecks, schema/migration parity, and final diff
  checks.

The separately authorized real-provider qualification then closed
`G16-IE-U01`. The guarded script used exact `openai/gpt-5.5`, denied every
non-Goal tool, and drove the production released-v1 Session, Turn, permission,
learning-command, receipt, effect, and terminal acknowledgement path. Across
three Sessions and five normally completed Turns, eight model operations
produced three applied Goal invocations, three Goals, four revisions, and three
Goal effects/receipts. The accepted observations proved a direct Goal write,
useful quoted/hypothetical discussion with no write, clarification across
outcome/conditions/Course/target, exact once-only acceptance and atomic creation
of two Course-scoped exam Goals, causal provider/tool linkage, and later exact
predecessor-CAS correction without automatic lifecycle or foreign state.

The qualification script SHA-256 is
`938654CD3864D0AA67C4F6245F8F4662A49AC9D77E9C3B780993B0C21E509D1B`.
The pinned provider catalog SHA-256 is
`F71C7EF836ADE8B32C6F629230B05AB593FF2F39C502F2348964AECD79C3D1BD`.
The secret-free 41,272-byte evidence JSON SHA-256 is
`46B59E8CA04A8EFD3502743B2DB1B2112E69E2417846CE907CA92960F09F5601`;
empty stderr SHA-256 is
`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.
SQLite integrity and foreign-key checks passed, the isolated root contained no
credential file, and the reviewer found no warning/error in the eight captured
OpenAI runtime selections. The hash-bound raw artifacts were transient review
evidence and were removed after acceptance rather than becoming a project or
runtime dependency.

This bounded stochastic run proves model-facing usability and captured
production-path conformance only. The deterministic suites remain the authority
for state, authorization, dependency, replay, recovery, and negative behavior.
The same reviewer returned final `Accept`; no material unknown remains for the
Gate 16 boundary.
