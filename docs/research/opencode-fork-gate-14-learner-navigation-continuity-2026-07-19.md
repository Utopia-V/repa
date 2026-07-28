# OpenCode fork Gate 14: learner navigation continuity

Status: Closed again at corrective integration commit
`9e91d43c629b66d65c8741e342bca7cf05de5667`. The 2026-07-27
first-principles audit had scoped-reopened the primary-TUI confirmation/result
and affected migration-evidence boundary. Default Course and exact route-anchor
identities, transitions, and fail-closed semantics remain accepted. The
corrective snapshot described below was accepted by the original database and
TUI reviewers. Historical independent review run
`gate14-whole-20260719-01` accepted contract/theory after closing `G14-CT-001`
through `G14-CT-005` and both nonblocking strengthenings. The contract is
implementation authority. The maintainer authorized implementation and the
whole-Gate review loop. The first implementation/evidence review returned
`Revise` with `G14-IE-001` and `G14-IE-002`. The retained reviewer closed both
repairs, then returned `Revise` with the new `G14-IE-003` SQLite replacement
counterexample. It closed that repair, then returned `Revise` with
`G14-IE-004`: an incoming navigation receipt could replace a legacy receipt
identity. It closed that repair, then returned `Revise` with `G14-IE-005`: the
three Gate-14 append-only authorities still exposed SQLite's hidden `rowid`
replacement key, and the two transition owners did not reject every explicit
conflict-replacement entry. The local storage/constraint boundary is repaired
with fresh focused evidence. That reviewer's final closure turn ended in an
external `systemError` and returned no verdict. Independent replacement review
run `gate14-replacement-20260720-01` then reviewed the complete current
implementation/evidence candidate, independently confirmed `G14-IE-001`
through `G14-IE-005` resolved, and returned `Accept` with no
acceptance-changing finding. Implementation/evidence is accepted. The accepted
implementation is fixed by maintainer-authorized commit
`a6b542d59879f0a4b1111eaef4ad23e446b473d0`. At that closure point, Gate 15
had not begun; current disposition is owned by
[the documentation index](../README.md).

Date: 2026-07-19

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Primary predecessors:
[passed Gate 7 Course and Course View authority](opencode-fork-gate-07-course-view-authority-2026-07-15.md),
[passed Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[passed Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md),
and the Course-owned opaque proof seam accepted by
[passed Gate 13 Material Map and Course alignment](opencode-fork-gate-13-material-map-alignment-2026-07-19.md)

Successor boundaries: Gate 17 may create or correct Courses and Course Views
through natural language. Gate 18 may use navigation state as one bounded
input to current learning-context selection. Gate 22 may compose the owning
inspection and correction paths into a learner-facing terminal surface. None
of those later loops belongs to Gate 14.

This record owns the proposed Gate 14 engineering contract. Product meaning
and the two maintainer decisions under **Accepted maintainer decisions** are
authority. Tagged transition encoding, exact compare-and-swap tuples, command
input shape, query shape, and closing evidence are derived engineering
proposals. A fresh separate top-level reviewer may reject or revise those
derivations. Only the maintainer or an owning product, architecture, or roadmap
decision may change accepted product meaning.

## Terminology

A **default Course preference** is the optional LearnerHome-wide Course used
only as a retrieval prior when a later caller has no more specific Course
target. It does not select a View and is not an active-Course designation.

A **route anchor** is the optional exact
`(Course, View, Revision, Item)` checkpoint from which one Course may resume
when a later caller has no more specific focus. There is at most one current
anchor per Course, and different Courses have independent anchors.

A **navigation transition** is one committed change from the exact current
preference or anchor state to a different value, including an explicit clear.
It retains its predecessor, exact causal source, trusted commit order, and the
version it consumed and produced. Asking for the already-current value is a
typed no-change result, not a transition.

A **usable** target is one whose exact owning Course state still satisfies the
rules below. A durable preference or anchor may remain present while unusable;
unusable does not mean deleted, cleared, completed, or superseded by a guessed
replacement.

## Why this Gate exists

Gate 7 can identify several independent Courses, immutable View Revisions,
exact item membership, and one exact working Revision per Course. Gate 8 can
settle one model-issued learning command against a durable causal occurrence.
Gate 12 can identify the finite Turn and exact model/tool work that issued it.
None owns these two learner-continuity meanings:

- which Course should be the fallback for an underspecified future request;
- where a Course should broadly resume when the current request or Agenda does
  not supply a better focus;
- how either value is corrected without overwriting its source and history; or
- how a deleted source transcript remains truthfully unavailable without
  deleting the resulting durable navigation state.

Gate 14 serves this part of the product loop:

```text
one exact learner Interaction
-> optional navigation command
-> versioned default-Course or per-Course anchor transition
-> later bounded selection may consult it as a fallback
```

It does not choose a teaching move, compile model context, record mastery,
advance a curriculum automatically, create an Agenda focus, or make every
Interaction produce a navigation write.

Its owned invariant is:

> Learner navigation contains exactly two distinct correctable meanings: one
> optional LearnerHome-wide default Course preference and one optional exact
> route anchor per Course. Every real change is a linear versioned transition
> bound to one exact admitted learner occurrence. For the default preference,
> that occurrence must semantically express an explicit learner request or
> acceptance and a separate non-reusable visible confirmation must authorize
> the exact proposal. Direct or multi-Course
> targeting never mutates the preference. A route anchor never retargets
> across Course View Revisions and never implies focus, completion, evidence,
> understanding, or mastery. Missing or inactive targets remain inspectable
> and fail closed for fallback use; Session deletion may make the source
> unavailable but cannot erase or fabricate navigation meaning.

## Accepted maintainer decisions

The following decisions were accepted during the Gate 14 grill. They are
recorded by consequence rather than as an interview transcript.

### Default preference confirmation remains explicit

A genuinely new set, change, or clear of the LearnerHome default Course
preference requires two distinct learner-controlled acts. First, the current
admitted learner occurrence must be the semantic basis for an explicit request
or acceptance of that preference change. Model judgment may interpret the
natural-language occurrence; Gate 14 does not claim deterministic NLP proof.
Second, the exact proposal must show one separate visible, once-only
confirmation. The confirmation is required even when ordinary tool policy
would allow the capability, and an `always` approval cannot suppress later
confirmations.

The confirmation is bound to the exact current preference version and, for a
non-null target, the exact active Course plus its current working-selection
snapshot. A Course with no working View is a valid target, represented by an
exact null selection. Rejecting, correcting, cancelling, interrupting, or
answering after any bound state has become stale changes nothing.

The exact admitted occurrence and the exact permission request/bound snapshot
are both retained. Confirmation is the final committing authorization; it does
not replace the initiating explicit learner request or acceptance. A model may
not surface an unsolicited preference proposal and use the permission prompt
as the learner's only initiating act.

The preference remains a low-consequence navigation choice. Gate 14 does not
invent importance levels, confirmation modes, pedagogic preference classes,
or a reusable preference framework around it.

### Route-anchor updates are routine and nonblocking

A model may set, change, or clear a route anchor through the current admitted
learner occurrence without a second mandatory confirmation. The command still
obeys the effective capability policy: an explicit deny wins, and an ordinary
`ask` policy may still prompt. Under the baseline allow policy it commits
without an additional blocker.

This permission does not authorize automatic ordinal advancement, progress or
mastery inference, a global current item, or writes detached from an exact
learner occurrence. The learner can later correct or clear the anchor through
the same versioned path.

## Decision provenance and revision authority

| Material decision                                                                                                           | Authority and reason                                                                                                                                                                                                                                                    | May revise it                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| One optional default Course and one independent anchor per Course are distinct meanings                                     | Accepted architecture, native data model, and Roadmap 09. One global current pointer cannot preserve simultaneous Courses or distinguish fallback from focus.                                                                                                           | Maintainer or an accepted architecture/roadmap revision.                                                            |
| Every default-preference change follows an explicit learner request/acceptance with an exact visible once-only confirmation | Accepted architecture/native data model plus maintainer confirmation decision, 2026-07-19. Directory, source discovery, Agenda pressure, and model judgment must not silently change the fallback Course, and the confirmation does not replace the initiating request. | Maintainer or a revised architecture/navigation owner with a different accepted authorization boundary.             |
| Route-anchor changes do not receive an extra mandatory confirmation                                                         | Maintainer, 2026-07-19. The anchor is a reversible low-consequence resume preference; existing capability policy and exact correction remain sufficient.                                                                                                                | Maintainer if later product evidence shows that routine updates carry materially higher consequence.                |
| Navigation does not imply focus, progress, completion, evidence, or mastery                                                 | Product origin, ADR-0012, architecture, native data model, and Roadmap 09. These are different owners and epistemic claims.                                                                                                                                             | An accepted product/architecture revision; a Gate-local implementation may not promote the anchor.                  |
| Exact Revision binding and no silent retarget                                                                               | Gate 7 and accepted correction policy. Stable item identity and preserve/split/merge mappings do not make two Revision memberships the same checkpoint.                                                                                                                 | Accepted Course/navigation contract revision with a demonstrated consumer and explicit migration semantics.         |
| Tagged linear transitions and exact CAS shape                                                                               | Derived engineering proposal. It preserves correction history and prevents two concurrent heads without introducing a general learner ontology.                                                                                                                         | Fresh contract reviewer or later falsifying implementation evidence, provided the product invariant remains intact. |

The maintainer also authorized the whole-Gate independent review and
implementation loop. That is workflow authority, not durable product meaning;
it does not expand Gate 14, authorize a commit, or pre-accept this draft.

## Current evidence and falsification pressure

### Accepted project authority

- The product supports several simultaneous Courses in one LearnerHome. A
  Course is not owned by the invocation directory or one Session.
- ADR-0012 separates Interaction, Course View, learner record, Agenda, and
  Tutor policy. Navigation is the first bounded learner-continuity slice, not a
  universal state graph.
- The architecture assigns the broad route anchor to learner/course progress,
  temporary focus and intended rejoin to Agenda, and the sample's effective
  focus to a later derived view.
- The native data model names the default Course and route anchor as separate
  learner-controlled defaults and explicitly rejects competing generic
  `current_item` fields.
- Roadmap 09 places Gate 14 after exact Course, command, and Turn identity and
  asks for confirmation/correction, stale targets, deleted-source truth,
  restart, and no semantic promotion.

Gate 18, not Gate 14, owns selection and budgeting of model context. An older
Gate 8 record used the former roadmap numbering when it said Gate 14 would own
routine context and continuation. The accepted 2026-07-17 Roadmap 09 revision
supersedes that number while retaining Gate 8's settlement invariant.

### Actual closed predecessors

- Gate 7 stores Course and View state versions, immutable View Revisions,
  exact Revision item membership, and a nullable exact working-selection row
  with its own monotonic version. A working selection never follows a newer
  Revision automatically.
- Gate 8 stores exact admitted occurrences, presentation lineage, physical
  invocation identity, semantic effects, immutable receipts, one applied
  mutation per Assistant Message, transaction-first settlement, replay,
  conflict, deletion tombstones, and occurrence garbage collection.
- Gate 12 binds the current root or delegated request, model operation, and
  tool invocation to one durable finite Turn and preserves truthful
  interruption and source-unavailable receipts.
- Gate 13 establishes the narrow Course-owned opaque membership proof and
  transaction revalidator pattern reused for an exact navigation target. Gate
  14 consumes that seam without making Material Map a navigation dependency.
- The released-v1 permission service already supports `requirePrompt` and
  `onceOnly`. A required prompt overrides an allow rule, a deny still wins,
  and required/once-only approval is never added to reusable `always` rules.
  The baseline TUI hides `always` for a once-only request. If a lower-level
  client nevertheless sends raw reply `always`, the service approves only the
  current pending request and persists no reusable approval.
- The current learning-command schema and runtime are deliberately closed over
  accepted Course-selection and Representation commands. Gate 14 must extend
  that closed union; it must not introduce a universal effect registry or a
  second tool runner.

Production currently has no default-Course or route-anchor state, schema,
query, or command. The migration sequence ends after Gate 13 Material Map
alignment. Gate 14 is a new bounded learner-record authority, not completion of
an inherited partial implementation.

### Historical counterexample

The pre-fork oracle is read-only behavioral evidence. Its route experiment used
one current pointer and ordinal advancement. That shape could not distinguish a
broad resume anchor from temporary task focus, a detour, an Agenda rejoin
point, or several simultaneously active Courses. It also allowed route and
material realignment pressure to move together.

Gate 14 preserves only the demonstrated needs: per-Course independence, exact
Revision membership, a separate fallback Course, explicit correction, bounded
source identity, and fail-closed staleness. It rejects the old table/API,
automatic successor selection, path-derived Course identity, and any claim
that visiting an item proves learning.

## Proposed Gate result

After Gate 14:

- one LearnerHome database has either no default Course or one exact preferred
  Course;
- every Course independently has either no current route anchor or one exact
  anchor bound to one View Revision item membership;
- each real change increments only its own scope version and retains a linear
  predecessor chain, exact occurrence, trusted time/order, and command receipt;
- same-value and clear-absent requests return typed no-change results without a
  transition or version increment;
- the default preference can target an active Course that has no working View,
  but every change still receives an exact visible once-only confirmation;
- route-anchor changes normally proceed without an additional confirmation and
  remain subject to effective deny/ask policy;
- direct one-Course or multi-Course selection overrides the preference for that
  read without writing navigation state;
- withdrawn Courses, replaced working Revisions, and withdrawn Views or
  Revisions make exact targets unusable without clearing or retargeting them;
- reactivation or exact reselection may make the same retained target usable
  again, but never changes its identity, source, version, or history;
- compaction re-presentation keeps its original occurrence; fork-history
  clones keep their original read-only identities and cannot authorize a
  command, while the genuine fork-start learner input owns a new target Turn,
  input, and occurrence that may form a new semantic address;
- whole-Session deletion preserves effects and truthful source tombstones,
  while a revert that would remove an applied navigation Part or its Assistant
  Message rejects atomically and an eligible unrelated/no-effect revert cannot
  alter navigation or invent source unavailability;
- restart preserves the accepted occurrence/receipt semantics and never
  synthesizes a navigation change; and
- bounded trusted reads expose current state, usability, history, and truthful
  source availability for later Context and terminal consumers.

This is a durable navigation boundary, not a complete learner-visible learning
loop.

## Logical state and legal transitions

### LearnerHome default Course

The first LearnerHome remains the admitted native database/home identity; Gate
14 does not add a one-row learner or home table merely to host a singleton.
Absence of a default transition means version `0` and no preferred Course.

Legal committed transitions are:

- no preference -> active Course;
- Course A -> a different active Course B; and
- Course A -> no preference.

Course A -> Course A and no preference -> no preference are typed no-change
results. Under effective `allow` they do not prompt. A deny or missing delegated
capability settles denied before returning the live projection, and effective
`ask` follows ordinary permission. An authorized no-change does not write an
effect, consume the Assistant Message's applied-mutation slot, advance the
frontier, or increment a version.

The persisted target is only `CourseID`. A non-null commit must nevertheless
bind and revalidate the learner-visible proposal against:

- exact current preference head and version;
- exact target Course identity, active state, and Course state version;
- exact working-selection Revision ID or exact null plus selection version;
- when non-null, the owning View identity and the current View and Revision
  state versions; and
- one program-minted permission request identity scoped to the physical
  invocation.

These additional facts are the confirmation and commit snapshot, not the
meaning of the stored preference. A later working-View change therefore does
not mutate or stale the Course preference. A later Course withdrawal makes it
unusable for fallback; restoration of that same Course may make it usable
again. Neither event chooses another Course or changes the preference version.

Clearing is bound to the exact current preference head/version. It remains
legal when the preferred Course is inactive or has no working View. A clear
does not need a replacement target or a live target-Course snapshot.

### Per-Course route anchor

Absence of an anchor transition for a Course means anchor version `0` and no
checkpoint. Each Course has its own linear version space.

Legal committed transitions are:

- no anchor -> one exact item in the Course's current eligible working View
  Revision;
- one anchor -> a different exact item in that current eligible working View
  Revision; and
- one anchor -> no anchor.

Setting an anchor requires one Course-owned immutable target proof covering:

- exact Course identity, active state, and Course state version;
- exact working-selection Revision and selection version;
- exact active View and View state version;
- exact active Revision and Revision state version; and
- exact membership of the item in that
  `(Course, View, Revision)` tuple.

The navigation authority consumes the opaque proof and asks the Course owner
to revalidate it inside the commit transaction. It does not infer membership
by querying or duplicating Course tables outside that owner seam.

Clearing is bound only to the exact current anchor head/version and remains
legal when the Course, View, Revision, or current selection is inactive or
different. Same-target and clear-absent requests are typed no-change results
without a write.

Any item in the exact working Revision may be selected. Gate 14 does not define
`next`, choose an ordinal successor, map through preserve/split/merge, or infer
that a conversation completed the previous item.

### Stale and usable anchor behavior

The current durable anchor remains exact and inspectable. It is usable only
while:

- its Course, View, and Revision are active;
- the Course's exact working selection still equals its Revision; and
- the exact item membership remains present.

Immutable membership makes the last predicate structural, but reads still
fail closed if integrity is unavailable. Selecting any other Revision makes
the anchor stale. A successor Revision with a preserved item ID, explicit
split/merge mapping, or cross-View reuse citation never retargets it. Returning
the working selection to the exact original Revision may make it usable again;
that is revalidation of the same identity, not reactivation of an old effect or
a new transition.

A stale anchor does not fall forward to an ancestor, descendant, mapped item,
neighbor, first item, or default Course. Later context selection receives the
stale reason and either uses a more specific accepted target or proceeds
without an anchor.

## Version, correction, and relational invariants

The proposed physical authority uses one strict tagged append-only navigation
transition relation. A row's kind is either `default_course_preference` or
`course_route_anchor`; closed checks make every target arm, scope arm,
confirmation arm, and previous-value arm exact for that kind.

The following invariants are database-enforced, not prompt conventions:

- default transitions use the singleton LearnerHome scope; route transitions
  carry exactly one Course scope;
- a first transition consumes version `0`, has no predecessor, and records an
  absent previous value;
- every later transition names the exact previous transition, previous value,
  and previous version, and commits exactly `previousVersion + 1`;
- predecessor kind and scope must equal successor kind and scope;
- one transition has at most one successor, so every scope is a linear chain;
- target and previous values differ, including explicit null clears;
- every non-null Course, View, Revision, and item arm has an exact owning
  foreign key;
- one occurrence has at most one committed semantic effect for the singleton
  preference slot and at most one per Course anchor slot; and
- rows are immutable and cannot be physically deleted through ordinary
  application capability.

The current state is the unique transition in a scope with no successor.
Inserting the successor and advancing the learning frontier happen in one
transaction. SQLite's serialized writer is useful implementation behavior but
is not the concurrency contract; exact predecessor/version checks reject stale
writers even if another storage engine later permits concurrent writes.

If a strict tagged relation cannot enforce the complete closed union and
predecessor ownership without fragile trigger-only publication, the
implementation may use separate transition relations plus a closed exact
receipt arm. It may not replace the invariant with a universal event/fact
table, a mutable current row without immutable history, or polymorphic IDs
whose owner cannot be checked.

## Causal source and bounded Interaction references

Every navigation effect cites the Gate 8 admitted occurrence supplied by the
trusted released-v1 tool envelope. The model cannot supply or override
occurrence, Session, Turn, Message, Part, provider call, authorization basis,
trusted time, effect identity, or confirmation request identity.

Gate 8's invocation and receipt already bind that occurrence to the exact
Assistant Message, tool Part, provider call, physical settlement, and durable
source availability. Gate 12 already binds the operation and tool to an exact
Turn. Gate 14 therefore adds no general learner activity, evidence, mastery,
or Interaction-reference table. Its bounded source projection is:

- exact navigation transition/effect;
- exact admitted occurrence and immutable original Session/User Message IDs;
- exact learning-command receipt and issuing Assistant Message/tool Part;
- exact Turn when still present, or Gate 12's minimal unavailable receipt; and
- current occurrence availability or immutable tombstone reason/time.

Source deletion changes only that availability projection. It does not clear,
undo, re-source, or make the navigation assertion false. Occurrence garbage
collection must treat a retained navigation effect as a durable reference even
after all transcript presentations and invocation-owned rows are gone.

Compaction re-presentation keeps the original occurrence and cannot
manufacture a new semantic address. Fork materialization has two separate
identity classes:

- every cloned historical Message/Part remains a read-only presentation of its
  source occurrence, model operation, tool, and Turn identity, belongs to no
  target Turn, creates no target budget or replay key, and cannot authorize a
  navigation command; and
- the genuine fork-start learner input is admitted as a new root Turn/input
  with a new occurrence. A model operation whose frozen current membership is
  that input may therefore form a genuinely new navigation semantic address.

Navigation admission resolves occurrence provenance only through Gate 12's
exact current model-operation membership. A clone, later-current input, prompt
text, or copied Part cannot substitute for that frozen membership. Ordinary
physical replay returns the stored settlement.

Whole-Session deletion follows Gate 8's explicit retention/tombstone
transaction and cannot cascade through the receipt into navigation state. A
revert is not that exception: if its cleanup set contains the original applied
navigation Part or its Assistant Message, it rejects before transcript
mutation. An otherwise eligible revert of unrelated or no-effect work leaves
navigation and its source availability unchanged.

## Model command and confirmation settlement

Gate 14 adds two reserved released-v1 learning capabilities: one for the
default Course preference and one for a Course route anchor. Exact tool names
and input field spelling are implementation details, but their canonical
commands must carry the target or explicit clear plus all caller-visible
expected versions described above.

Both commands reuse one shared learning-command admission, FIFO/serialization,
Turn registration, permission, settlement, recovery, and ToolPart path. The
implementation may refactor the existing closed runtime around genuine shared
steps, but it must not add a navigation-only runner, executor, queue, recovery
loop, or generic domain-effect registry.

The semantic addresses are:

- `(occurrenceID, default-course-preference-slot)`; and
- `(occurrenceID, CourseID, route-anchor-slot)`.

For a committed effect, a physically new command at the same semantic address
and same target returns `already_applied` with the original effect and current
state projection. A different target is a semantic conflict. Both decisions
precede permission, cancellation, and live-state checks. A genuinely later
occurrence may make a correction by consuming the then-current head/version.
If later transitions have superseded the original effect, replay or semantic
duplicate reports that fact and never restores the old value or makes that
effect current again.

Physical Part/call replay requires the complete trusted envelope and canonical
input to match and returns the stored terminal result exactly. Conflicting ID
reuse fails without touching the original settlement. Stored physical replay
and committed semantic duplicate/conflict retain Gate 8 precedence over
cancellation and live policy/state checks.

For a physically new candidate with no committed semantic effect, the runtime
next evaluates effective capability through Gate 12's deny-first authority
intersection before returning any live state projection. An explicit target
deny or absence in any required delegated layer settles `denied`; it cannot
obtain a current-state/no-change result. Under effective `allow`, the runtime
may then evaluate the exact current head and return no-change without an
interactive prompt. Under effective `ask`, ordinary permission must resolve
before a live no-change result is returned. An authorized no-change creates no
semantic effect, state version, receipt effect arm, mutation-slot consumption,
or frontier advance. A real change continues through the command-specific
permission path below.

Only one navigation or other learning mutation may apply under one Assistant
Message. Navigation therefore shares Gate 8's applied-mutation slot with Course
selection acceptance and Representation acceptance; it does not create a
separate quota.

### Default preference confirmation

The model may propose a genuinely new non-no-change default command only when
its exact frozen current learner occurrence is the semantic basis for an
explicit learner request or acceptance of that preference change. The
model-visible tool contract states this precondition; model judgment may
interpret the occurrence, but cannot replace or detach it. The runtime then
mints a stable permission request ID for a separate confirmation and supplies:

- `requirePrompt: true`;
- `onceOnly: true` and no reusable `always` target;
- exact from/to Course IDs and bounded display labels;
- exact target working View/Revision or explicit `no working View`;
- exact current preference version; and
- exact issuing tool Part/call identity.

An effective deny fails before a prompt. Otherwise the required prompt is
visible even under a wildcard allow rule. Only an explicit approving reply for
that exact pending request may reach commit. The baseline TUI offers only the
one-time approval for this once-only request. A raw lower-level `always` reply
approves this pending request only; `requirePrompt`/`onceOnly` prevents it from
storing or satisfying any later
approval. Rejection, correction feedback, prompt disposal, owner loss, or
cancellation yields a terminal no-effect settlement. A correction may guide a
later proposal but does not itself change the preference.

The final transaction rechecks semantic replay/conflict, the one-mutation
slot, current preference head/version, target Course/View snapshot, occurrence
availability, and Turn/tool frontier. The applied effect and immutable receipt
retain both the exact initiating occurrence and the permission request/bound
snapshot under `learner_acceptance` basis. The program does not claim
deterministic proof of the occurrence's natural-language semantics; the
model-visible precondition preserves the explicit-request requirement, and the
separate exact visible approval is the final committing learner authority.

### Route-anchor permission

The route-anchor command uses `learner_request` basis and the ordinary
effective capability rules. It does not set `requirePrompt` or `onceOnly` merely
because the write is durable. Explicit deny, ask, correction, and cancellation
still behave through the common permission path.

Here `learner_request` names the exact causal request in whose service the
model selected a resume preference; it does not assert that the learner named
the exact anchor or completed the item. The model-authored Tool invocation and
receipt remain visible in the source projection.

The final transaction rechecks semantic replay/conflict, the one-mutation
slot, current anchor head/version, the Course-owned exact target proof for a
set, occurrence availability, and Turn/tool frontier. No prompt, tool prose,
or model assertion may weaken exact Course validation or promote the anchor to
progress.

### Atomic terminal settlement

For an applied command, these changes commit or roll back together:

- navigation transition/effect;
- navigation version advance;
- Gate 8 invocation and immutable command receipt with its exact effect arm;
- the Assistant Message's applied-mutation ownership;
- Turn consumed/resulting tool frontier;
- terminal ToolPart and associated Event projection; and
- global learning frontier advance.

Inside that final transaction, the runtime first reads the current
database-wide shared-learning frontier and the command's consumed Turn/tool
frontier. It derives one navigation settlement time no earlier than the
command admission/causal time, the current shared frontier, and every consumed
owner snapshot. The transition/effect, receipt, terminal ToolPart, and emitted
settlement event use that same time wherever those records carry a timestamp.
The runtime then advances `LearningFrontier` with the consumed snapshot and
records the resulting frontier for the Tool result. A regressing wall clock
therefore cannot timestamp navigation before state consumed from this or
another Session. Exact replay retains its original stored time and creates no
new frontier event.

An implementation may extend Gate 8's closed receipt union with one strict
tagged navigation arm or two exact navigation arms. Exactly one arm must match
the command, and the database must reject dangling, cross-kind, or multiply
owned effects. A universal effect table with owner strings is out of scope.

Cancellation before commit produces no effect. If a concurrent or
uninterruptible transaction already committed, durable reconciliation returns
that exact success rather than a false cancellation or stale result. Failure
after preparation but before a terminal return performs one uninterruptible
durable physical/semantic reconciliation; inability to decide yields typed
`outcome_unknown`, not a claimed no-effect result.

An admitted command found nonterminal after process restart settles as
interrupted through the existing recovery owner. It is never automatically
re-prompted or redispatched. Gate 14 does not add durable provider-work replay.

## Read and fallback boundary

The learner-navigation owner supplies bounded stable-snapshot reads for:

- the current default preference, version, target usability, source receipt,
  and exact stale/unavailable reason;
- one Course's current route anchor, version, usability, source receipt, and
  exact stale reason;
- cursor-bounded default-preference and per-Course anchor history;
- cursor-bounded discovery of Courses with anchor state; and
- fallback resolution from a caller-supplied exact Course set.

Fallback resolution accepts already-resolved explicit Course IDs; it does not
parse natural language. Its rules are closed:

1. one or more explicit Course IDs are returned as the requested set, with
   exact availability results, and the durable preference is not consulted as
   a replacement and is never mutated;
2. with no explicit target, one usable default Course may be returned;
3. with no usable default, return no Course plus the exact absence or stale
   reason; never guess another Course.

An explicit inactive or missing Course produces an exact unavailable result;
it does not silently fall back to the preference. Duplicate explicit IDs are
canonicalized without changing first occurrence order. Querying one or several
Courses is read-only and leaves navigation versions, effects, receipts, and the
learning frontier unchanged.

All multi-query projections run under one database snapshot and use
scope-bound opaque cursors with deterministic tie-breakers. Cursor limits bound
rows as well as nested source/history detail. Current reads never synthesize a
latest View, map old item IDs through revision mappings, or import transcript
text.

Gate 14 registers no model-visible navigation inspection tool and injects no
automatic model context. Its two write tools can be exercised with exact
arguments through the released-v1 tool path; Gate 18 later decides which
bounded navigation projection enters a sample, and Gate 22 later provides
ordinary terminal inspection/correction. This prevents a write Gate from
quietly absorbing either successor.

## Implementation ownership

The production realization belongs in a learner-navigation module representing
the first narrow slice of learner record. It may physically colocate SQL with
Course code when required by the single database, but it must present a
separate semantic owner and cannot add navigation mutation methods to the
generic Agent runner.

Dependencies remain narrow:

- Course exposes an owner-read descriptor and opaque transaction revalidator
  for target Course, working selection, View/Revision state, and item
  membership. Navigation does not receive Course's complete mutable service.
- Learning command owns physical admission, trusted invocation/occurrence/Turn
  envelope, permission, receipt, recovery, and ToolPart settlement.
- Learner navigation owns semantic address, current value, transition history,
  exact target rules, version/CAS, stale/useful projection, and correction.
- Interaction owns source presentation and tombstone truth.
- Later Context and terminal consumers receive read-only navigation
  capabilities, never the mutable service.

The released-v1 tool registry reserves both capability IDs against custom or
MCP replacement. Tool discovery continues to obey effective permission
visibility. Default Repa Agent composition may expose the capabilities, but
the default-preference runtime still forces exact confirmation and a denied
delegation layer still removes or rejects authority. A delegated Turn cannot
invent a new learner occurrence or exceed its frozen parent capability.

No HTTP mutation route, MCP command, background worker, provider special case,
preview-v2 path, generic preference service, or compatibility adapter is added.

## Failure and recovery contract

- **Stale preference confirmation:** any change to the bound preference head,
  Course state, selection target/version, View state, or Revision state before
  commit fails with no effect and requires a fresh visible confirmation.
- **Stale anchor command:** any change to the bound anchor head or non-null
  Course target proof before commit fails with no effect. A stale anchor may
  still be cleared using only its exact head/version.
- **Concurrent writers:** at most one successor of a head commits. The loser
  receives typed stale state and never branches the history.
- **Permission denial/correction:** no domain write, receipt effect arm,
  mutation-slot consumption, or frontier advance occurs.
- **Cancellation:** captured cancellation loses to a matching durable replay or
  already-committed effect; otherwise it settles with no effect.
- **Transaction failure:** injected failure at every transition, receipt,
  ToolPart, frontier, and event boundary rolls the complete transaction back.
- **Process loss:** admitted nonterminal commands recover as interrupted and do
  not ask again. A committed transaction remains discoverable by exact replay.
- **Whole-Session deletion:** the accepted Gate 8/12 deletion transaction may
  remove transcript-owned rows while retaining minimal
  occurrence/receipt/tombstone truth and every navigation effect. Current
  navigation state is unchanged and the exact source may become unavailable.
- **Revert:** the complete cleanup set is validated first. A revert containing
  the original applied navigation Part or its Assistant Message rejects
  atomically before transcript mutation. An otherwise eligible unrelated or
  no-effect revert follows Gate 8 cleanup but neither changes navigation nor
  invents source unavailability.
- **Source unavailable:** current and history reads return exact original IDs
  plus availability/tombstone metadata, never invented transcript text.
- **Course withdrawal or selection replacement:** durable targets remain exact
  and historical; fallback use reports unusable/stale and never clears,
  advances, maps, or substitutes them.
- **Database corruption or invariant failure:** admission or the owning query
  fails closed. It never derives state from the highest version while ignoring
  a forked chain or incomplete tagged row.

## Migration and compatibility boundary

Gate 14 adds one forward migration after the accepted Gate 13 schema. The same
schema is represented in the generated current database definition.

The migration:

- creates empty navigation state/history for both fresh and upgraded
  LearnerHomes; absence means version `0` and null state;
- extends the closed learning-command invocation/receipt/effect union without
  changing accepted Gate 8/11 rows or their replay meaning;
- installs exact foreign keys, checks, unique indexes, and immutability/chain
  guards needed by this contract;
- preserves all predecessor data and passes foreign-key/integrity checks before
  commit; and
- has schema-equivalent fresh and Gate-13-upgrade results.

It does not infer a default Course from the invocation directory, most recent
Session, Course creation time, working selection, source location, Agenda
pressure, or legacy oracle data. It does not infer anchors from transcript
order, last viewed items, Course mappings, or current working Revision. No
backfill is more truthful than the initial absent state.

There is no compatibility API for the oracle's old route state and no reverse
migration promise. Physical deep deletion remains outside the baseline.

## Explicit non-goals

Gate 14 does not add:

- one active Course, Course completion, Course abandonment, or a global current
  item;
- current Turn focus, durable detour, Agenda intended rejoin, Goal, Assignment,
  future attention, or scheduling;
- progress percentage, visit history, practice outcome, evidence, mastery,
  confidence, or learner-model hypothesis;
- automatic ordinal advancement, successor mapping, fuzzy item reattachment,
  or anchor retargeting across View Revisions;
- natural-language Course identification, Course/View creation, provisional
  route bootstrap, or Material Map mutation;
- automatic context construction, transcript import, selection budgets,
  compaction policy, or Session continuation;
- a general learner ontology, activity table, fact graph, event store,
  preference framework, or policy framework;
- terminal history browsing/correction UI beyond the exact mandatory
  permission prompt and ordinary tool result;
- background work, reminders, daemon behavior, HTTP/MCP mutation surfaces,
  preview-v2 execution, or a second learning-command runtime; or
- Gate 15 retained steering, Gate 17 bootstrap, Gate 18 context, Gate 19
  learner adaptation, Gate 20 return, Gate 21 planning, Gate 22 terminal, Gate
  23 integration, or post-baseline selective deep deletion.

## Closing evidence contract

Gate 14 may close only if fresh evidence demonstrates the following against
the exact candidate.

### Navigation authority and database invariants

- fresh and Gate-13-upgrade schemas are equivalent and contain no fabricated
  preference or anchor;
- raw SQLite attacks cannot create malformed tagged arms, wrong-owner foreign
  keys, branch a scope, skip/reuse a version, mutate/delete history, attach a
  predecessor from another kind/Course, or leave a receipt with a dangling or
  wrong-kind effect;
- two Courses maintain independent anchor heads and versions while the default
  Course has its own singleton version;
- set/change/clear and same-value/clear-absent no-change behavior is exact; and
- a regressing clock and a newer shared-learning write committed by another
  Session floor transition/receipt/ToolPart/event settlement to one consistent
  time at or after the consumed database-wide frontier; and
- restart preserves current state, history, versions, trusted ordering, and
  stable bounded pagination.

### Default preference behavior

- an active Course with and without a working View can be preferred;
- the exact current occurrence is retained as the semantic basis for an
  explicit learner request or acceptance, and an unsolicited model proposal
  cannot treat confirmation as the only initiating act;
- every real set/change/clear prompts even under wildcard allow or a prior
  attempted `always`, while explicit deny prevents the prompt; a raw lower-level
  `always` reply may approve only that pending request and stores no reusable
  rule, so the next real change prompts again;
- the visible request is once-only, exact from/to state is shown, its stable ID
  is retained, and approve/reject/correct/cancel/owner-loss outcomes are exact;
- a Course/preference/selection/View/Revision race after the prompt fails stale
  without state, receipt effect, mutation-slot, or frontier change;
- Course withdrawal makes the retained preference unusable; restoration of the
  same Course may make it usable without a write;
- direct another-Course and multi-Course fallback-resolution calls do not
  consult the preference as a replacement and do not mutate it; and
- an unavailable explicit target never silently falls through to the default.

### Route-anchor behavior

- ordinary allow applies without an extra mandatory prompt; explicit deny and
  ordinary ask policy still work;
- target-specific deny and delegated-capability absence settle denied before a
  physically new same-target or clear-absent command can return a live
  no-change projection; an authorized no-change remains effect-, slot-, and
  frontier-free;
- exact set/change/clear validates the Course-owned working-Revision item proof
  and consumes the anchor CAS;
- wrong-Course, wrong-View, inactive, non-working, and missing-membership
  targets fail closed;
- Course withdrawal and working-selection replacement make the retained anchor
  unusable/stale without rewriting it;
- preserve, split, merge, cross-View reuse, and a same-ID successor never
  retarget the anchor; exact reselection of the original Revision may make the
  same anchor usable again; and
- two Courses and concurrent same-Course writers cannot interfere or branch.

### Shared command, Interaction, and failure behavior

- physical exact replay, conflicting ID reuse, semantic duplicate/conflict,
  one applied mutation per Assistant Message, exact later correction, and
  trusted-envelope rejection preserve Gate 8 semantics across all admitted
  command kinds;
- root and permitted delegated Turn paths retain the exact causal learner
  occurrence and cannot exceed frozen authority;
- injected failures and cancellation at every new atomic boundary cannot leave
  partial navigation/effect/receipt/ToolPart/frontier state;
- commit-versus-cancel/stale races and final-reconciliation failure return exact
  success or typed `outcome_unknown`, never false no-effect;
- crash recovery interrupts admitted work without redispatch or re-prompt;
- compaction re-presentation retains its occurrence; fork-history clones retain
  old read-only identities, belong to no target Turn, and cannot authorize a
  command, while the genuine fork-start root input receives a new
  Turn/input/occurrence and may form a new semantic address;
- whole-Session deletion leaves navigation and history intact while exact
  source reads become truthfully unavailable and occurrence collection retains
  every still-referenced source;
- a revert whose cleanup set contains the original applied navigation Part or
  Assistant Message rejects before mutation; and
- an eligible unrelated/no-effect revert leaves navigation and source
  availability unchanged.

### Ownership and negative evidence

- production imports and dependency tests prove that navigation owns semantic
  transition/CAS while Course owns target proof, Interaction owns source, and
  learning command owns physical settlement;
- later read consumers cannot obtain the mutable navigation or Course service;
- the sole released-v1 registry reserves the two tools and no custom/MCP tool
  can replace them;
- no preview-v2, HTTP mutation, background, context-injection, TUI inspection,
  learner ontology, progress/mastery, auto-advance, or universal-effect path is
  reachable; and
- the shared application layer and released-v1 tool runtime remain
  constructible after registering the narrow authority and command paths.

Focused Core and OpenCode behavioral suites plus the affected package
typechecks are expected. Migration generation/checking is required because the
schema changes. Broader suites, release builds, packaged-app oracles, and real
provider calls are required only if the implementation changes those carriers
or the focused result leaves an acceptance claim unresolved. Documentation-only
checks remain diff, link, formatting, and worktree checks.

## Design evidence provenance

| Evidence                                                                  | Stable identity                                                              | Preserved conclusion                                                                                                                                                                                        | Deliberate difference                                                                                                                                                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product origin, ADR-0012, architecture, native data model, and Roadmap 09 | Current accepted documents linked above                                      | Separate navigation meanings, simultaneous Courses, learner control, exact revision binding, correction, and no false semantic promotion                                                                    | This contract makes the first executable boundary concrete without absorbing later Context, Agenda, learner-record, or terminal loops.                                                     |
| Gates 7, 8, 12, and 13                                                    | Accepted records and implementation commits indexed by `docs/fork-ledger.md` | Exact Course targets and versions, causal occurrence, physical/semantic command settlement, finite Turn and unavailable-source truth, plus the narrow Course-owned opaque membership proof/revalidator seam | Extends the closed command union and reuses owner proofs; does not make Material Map a navigation dependency or generalize the predecessors into an event store or universal learning API. |
| Released-v1 permission implementation                                     | `packages/opencode/src/permission/index.ts` at the contract snapshot         | `requirePrompt`, `onceOnly`, deny precedence, and non-persistence of forced approval satisfy exact preference confirmation; a raw `always` reply resolves only the current required/once-only request       | Reuses the existing permission owner; does not create a preference-specific modal runtime or permanent approval mode.                                                                      |
| Pre-fork route oracle                                                     | Immutable tag `repa-prefork-oracle`; read-only behavioral evidence           | A route anchor must be separate per Course, exact, durable, and correctable                                                                                                                                 | Rejects one current pointer, ordinal auto-advance, path identity, coupled material/route movement, old schema, and mastery implications.                                                   |

No oracle source or schema is copied into production. This draft introduces no
temporary experiment or external dependency.

## Implementation/evidence candidate

The candidate implements the accepted two-relation choice directly:

- `learner_default_course_transition` is the one append-only LearnerHome-wide
  default-preference chain;
- `learner_course_route_anchor_transition` is one append-only chain per exact
  Course;
- `set_default_course_preference` and `set_course_route_anchor` extend the
  released-v1 learning-command path rather than creating another runner;
- the Course owner issues and revalidates opaque preference-target and exact
  membership proofs inside the final transaction;
- default changes carry one stable permission request ID and a closed exact
  confirmation snapshot, and the released-v1 permission footer renders its
  exact bounded from/to Course, working View/Revision, and version state;
  route-anchor changes retain ordinary effective permission behavior;
- current/history/discovery reads use database snapshots, cursor limits of at
  most 100 rows, and a maximum of 100 caller-supplied explicit Course IDs for
  fallback resolution; and
- fresh and Gate-13-upgrade databases install the same append-only,
  predecessor, shared-frontier, confirmation, receipt, and immutability
  constraints without fabricating navigation state. The receipt and both
  transition authorities are physically `WITHOUT ROWID`, removing SQLite's
  hidden replacement-conflict key on both schema paths. Default and anchor
  INSERT guards enumerate every explicit primary/unique conflict surface, and
  their unconditional UPDATE/DELETE guards remain. Receipt UPDATE is denied
  whenever either the old or new row contains either navigation effect arm,
  so a legacy receipt cannot be promoted into navigation authority. Local
  INSERT and UPDATE conflict guards also reject any primary-key, invocation,
  default-effect, or anchor-effect collision that could let SQLite conflict
  replacement displace an existing navigation receipt. INSERT protection is
  bidirectional when either the existing or incoming row has a navigation arm,
  so an incoming navigation receipt cannot consume a legacy receipt identity;
  no process-wide recursive-trigger behavior is introduced.

The production boundary is limited to:

- Course proof/revalidation seams, the new Core learner-navigation owner, the
  closed learning-command effect/receipt union, generated native schema, and
  migration `20260719155243_learner_navigation`;
- released-v1 command input, permission, runtime, registry, and the generic
  Session preparation/interruption hooks already owned by learning commands;
  and
- focused migration, command, permission, registry, Session lifecycle,
  fork/compaction, and processor evidence. One predecessor fork-root test was
  corrected to select its asserted historical source message exactly instead
  of using an unordered first row.

No Context projection, TUI inspection surface, HTTP mutation, background
worker, progress/mastery state, learner ontology, active-Course meaning,
automatic advancement, preview-v2 path, or Gate-15 work was added.

Fresh repaired-candidate evidence on 2026-07-20:

| Claim boundary                                                          | Command/result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core and released-v1 type safety                                        | `bun run typecheck` from `packages/core` and `packages/opencode`: both passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Generated schema/migration coherence                                    | `bun run migration --check` from `packages/core`: passed with no incremental schema drift.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Fresh/upgrade equivalence and empty migration                           | `bun test test/database-migration.test.ts` from `packages/core`: 27 passed, 0 failed, 163 assertions; includes exact Gate 13 -> Gate 14 preservation, empty navigation tables, identical `WITHOUT ROWID` storage for all three append-only authorities, and identical transition/receipt conflict guards on both schema paths.                                                                                                                                                                                                                                                          |
| Shared Gate-8 settlement compatibility                                  | `bun test test/learning-command-settlement.test.ts` from `packages/core`: 2 passed, 0 failed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Gate-14 command, navigation, race, restart, deletion, and read behavior | `bun test test/learning-command/runtime.test.ts` from `packages/opencode`: 13 passed, 0 failed, 183 assertions. Before the IE-005 repair, focused receipt `rowid` INSERT/UPDATE and receipt-free default/anchor transition identity/`rowid` probes succeeded. After repair those and added non-ID unique-conflict probes all fail atomically. The same oracles preserve transition/frontier state, receipt/effect/invocation linkage, source projection, and physical replay on the actual `recursive_triggers = 0` connection.                                                                                       |
| Released-v1 exact confirmation projection                               | `bun test test/cli/run/permission.shared.test.ts` from `packages/opencode`: 7 passed, 0 failed, 27 assertions; covers set, change, clear, and no-working-View prompt projections plus bounded labels and once-only controls.                                                                                                                                                                                                                                                                                                                                                       |
| Deny-first and exact one-shot permission semantics                      | `bun test test/permission/next.test.ts`: 83 passed, 0 failed, including delegated absence-denies, forced one-shot prompting, and raw `always` non-persistence.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Reserved released-v1 tool IDs and exposure                              | The two focused `test/tool/registry.test.ts` cases for learning-command override rejection and closed-capability exposure each passed.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Fork/compaction identity                                                | Focused Session cases for a genuine fork root, admitted User clone, and historical Tool clone each passed; the compaction occurrence-replay case passed.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Destructive lifecycle                                                   | Focused Session cases for no-effect cleanup, applied-Part/Assistant immutability, and whole-Session receipt/effect retention each passed; Gate 14 also directly deletes an applied navigation Session and reads its source as unavailable.                                                                                                                                                                                                                                                                                                                                         |
| Processor integration/recovery                                          | Four focused processor cases for preparation-before-body, terminal preservation, commit reconciliation, and admitted interruption each passed.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| New-boundary static quality                                             | `oxlint` over the seven new learner-navigation/tool-owner files: 0 warnings and 0 errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Two deliberately non-acceptance observations are retained rather than hidden.
A broad `test/tool/registry.test.ts` run also reaches an unrelated existing
assertion that expects the current `repa` agent to expose `task`; current
baseline policy returns no such tool, while both Gate-14 registry cases pass.
A broad unfiltered Session test-file run exceeded a 180-second command bound
without a buffered assertion result; every causally relevant Session slice
listed above passes. Neither broad run is required by this Gate's evidence
contract, and no unrelated product policy was changed to make it green.

## Independent review state

The maintainer explicitly invoked the whole-Gate independent review loop and
authorized continuation from contract writing through implementation/evidence
approval. Run `gate14-whole-20260719-01` must use one zero-dialogue-inheritance,
user-visible, production-nonmutating top-level reviewer for both layers.

Reviewer task `019f7ace-da04-7b92-9b2a-722a236b1ba7` returned `Revise` for the
contract/theory layer. It accepted the Gate framing and found five
acceptance-changing derived-contract defects. The executor classified all five
as valid and repaired them in this revision. The same reviewer then returned
`Accept` and closed every finding:

| Finding      | Acceptance impact                                                                                  | Final disposition                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G14-CT-001` | Fork-history clones and the genuine fork-start learner input were conflated.                       | Closed by the original reviewer after compaction, read-only fork clones, and the new root Turn/input/occurrence received distinct command and semantic-address behavior bound through exact model-operation membership. |
| `G14-CT-002` | The deletion/revert oracle contradicted Gate 8 applied-Part immutability.                          | Closed by the original reviewer after whole-Session tombstone retention, protected applied-effect revert rejection, and eligible unrelated/no-effect revert behavior were separated.                                    |
| `G14-CT-003` | Visible confirmation replaced the separately required explicit learner request.                    | Closed by the original reviewer after the current occurrence became the semantic request/acceptance basis and the separate exact confirmation remained the committing authorization, with both sources retained.        |
| `G14-CT-004` | A live no-change projection could bypass deny-first effective authority.                           | Closed by the original reviewer after physically new candidates check deny-first authority before live no-change; allow may skip ask, ask resolves normally, and no-change remains mutation-free.                       |
| `G14-CT-005` | Transition timestamps were not explicitly floored to the consumed database-wide learning frontier. | Closed by the original reviewer after one transaction derives and consistently uses a settlement time at or after command admission and every consumed frontier before advancing the shared frontier.                   |

The reviewer also accepted both nonblocking strengthenings: Gate 13 is named
as the source of the reused Course proof seam, and raw lower-level `always`
behavior matches the actual permission implementation. It found no new
acceptance-changing defect.

This `Accept` verdict establishes implementation authority; it does not review
or pre-accept implementation/evidence. The same reviewer returned `Revise` on
the first implementation/evidence candidate with two new localized blockers.
After both were repaired, its second implementation/evidence review closed
them and returned `Revise` with one new data-integrity counterexample. Its
third review closed that repair and returned `Revise` with the symmetric entry
counterexample. Its fourth review closed that repair and returned `Revise`
with the remaining hidden-`rowid` and transition replacement surfaces:

| Finding      | Acceptance impact                                                                                                                                                                                                                           | Repaired candidate disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G14-IE-001` | The navigation receipt validator ran only on INSERT, while the immutability UPDATE guard inspected only old navigation arms; raw SQL could therefore promote a legacy non-navigation receipt into a structurally shaped navigation receipt. | Closed by the original reviewer. The shared fresh/upgrade constraint rejects an UPDATE when either OLD or NEW contains either navigation arm; focused raw-SQL evidence proves otherwise exact default and anchor promotions fail without changing the source receipt or navigation state.                                                                                                                                                                                                                |
| `G14-IE-002` | The exact default confirmation snapshot reached Permission, but the released-v1 footer fell back to a generic tool title and hid the state being authorized.                                                                                | Closed by the original reviewer. The released-v1 projection renders exact current head/version, bounded from/to Course identity, exact working View/Revision and versions, or explicit clear/no-working-View state, with focused evidence for every accepted shape and once-only controls.                                                                                                                                                                                                               |
| `G14-IE-003` | With production `recursive_triggers = 0`, SQLite conflict replacement could delete a protected navigation receipt through its primary key or unique invocation/effect links without firing the ordinary DELETE guard.                       | Closed by the original reviewer. The shared fresh/upgrade installer rejects both INSERT and collateral UPDATE when any protected navigation receipt would conflict on receipt ID, invocation Part, default effect, or anchor effect; both navigation arms, wrong-kind removal, exact linkage, and source state were independently rerun.                                                                                                                                                                 |
| `G14-IE-004` | The INSERT guard considered only an existing navigation row, so an exact incoming navigation receipt could reuse and replace a legacy Gate-8/Gate-11 receipt ID.                                                                            | Closed by the original reviewer. The shared INSERT predicate is symmetric when either the existing or incoming row has a navigation arm; both default and anchor replacement paths fail while the legacy receipt, effect, invocation settlement, lookup, and replay remain exact.                                                                                                                                                                                                                         |
| `G14-IE-005` | The receipt and both transition tables remained ordinary SQLite rowid tables, exposing a hidden conflict-deletion key; the transition INSERT boundary also lacked guards for its explicit primary/unique conflicts.                          | Resolved by independent replacement review `gate14-replacement-20260720-01`. Fresh and Gate-13-upgrade schemas make all three authorities `WITHOUT ROWID`; shared default/anchor INSERT guards cover their explicit conflict keys while UPDATE/DELETE immutability remains. Receipt INSERT/UPDATE and transition identity/non-ID-unique/rowid probes fail with rows, frontier, exact linkage, source projection, and replay unchanged. |

No contract or product decision changed, and no adjacent TUI inspection,
Context, ontology, progress/mastery, automatic advancement, preview-v2, Gate
15, or broad-suite work was imported. Retained reviewer task
`019f7ace-da04-7b92-9b2a-722a236b1ba7` ended in `systemError` during the final
closure pass and supplied no replacement verdict or closure authority.
Independent replacement reviewer task
`019f7bcb-a5b1-7612-a094-f093389a38cf` returned `Accept` for the complete
implementation/evidence layer under run `gate14-replacement-20260720-01`; its
only finding, `G14-RR-001`, was low-severity status/provenance bookkeeping and
was addressed by the pre-integration status reconciliation. The maintainer then
separately authorized integration. Commit `a6b542d59` fixes the independently
accepted implementation provenance and formally closes Gate 14. At that
closure point, this local integration did not authorize push, merge,
publication, cleanup, or Gate 15. Current disposition is owned by
[the documentation index](../README.md).

## 2026-07-27 first-principles correction

The historical review established that the exact default-Course snapshot
reached Permission and that direct-run could format it. The primary TUI,
however, falls through to a generic
`Call tool set_default_course_preference` prompt, so it does not show the exact
from/to Course, working View/Revision, or clear state being authorized.
Gate 22 cannot retroactively repair an under-specified pre-commit approval.

Gate 14 is therefore scoped-reopened for a shared semantic confirmation
and result projection, primary-TUI behavior, and focused evidence. Both default
preference and route-anchor settlement must remain visible after commit. Its
trigger and migration-equivalence evidence is also subject to the cross-Gate
versioned-DDL repair. No product evidence currently falsifies the separate
default-Course and route-anchor authorities or their exact-revision fail-closed
rule.

## 2026-07-28 corrective integration

The corrective presenter derives readable Course, View, Revision, and Item
locators from the exact owner snapshot and committed effect. It displays an
opaque identity only when the readable hierarchy cannot disambiguate the
object, so same-named Courses and otherwise identical route anchors no longer
produce indistinguishable approvals. Results are generated once inside the
committing transaction and replay validates the stored typed Part rather than
recomputing historical meaning from today's owner state.

The domain decoder also rejects recursively malformed usability state and
partial source/time/order/frontier groups; a null head requires the whole group
absent and a non-null head requires it complete. The original database and TUI
reviewers accepted the live-replay, migration, exact-object, once-only, and
post-commit counterexamples. Commit
`9e91d43c629b66d65c8741e342bca7cf05de5667` durably fixes the
shared-tree snapshot and closes this scoped reopen.
