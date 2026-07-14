# OpenCode fork Gate 7: Course and Course View authority

Status: Accepted after maintainer contract review. No production implementation
has begun.

Date: 2026-07-15

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Decision: [ADR-0012](../decisions/0012-learning-centered-modular-monolith.md)

This record owns the accepted Gate 7 engineering contract. It translates the
accepted Course and Course View meaning into one database and domain boundary;
it does not promote later Gate concerns into this Gate.

## Why this Gate exists

Gate 6 established a Repa-owned SQLite lineage, atomic forward migrations, and
one state-owning process per LearnerHome. The database still contains no native
learning authority. Course, View, item, and working-route identities exist only
in documentation, so later material alignment, learner continuity, Agenda, and
context have no trustworthy target.

The pre-fork oracle proves useful behavior but not an admissible schema. Its
Course was owned by a LearningSpace, source paths could determine Course
identity, Course View and revision were one identity, one global learning focus
was built in, and Session items were mandatory long-lived provenance. It also
created Course, material alignment, route progress, and focus together. Gate 7
preserves the demonstrated revision and stale-write invariants while rejecting
those obsolete ownership and dependency choices.

## Accepted product meaning

- One LearnerHome may contain several ongoing Courses. A Course belongs to the
  LearnerHome database, not a directory, Project, Workspace, Session, source,
  or LearningSpace.
- A Course is meaningful before any route exists. It may have no Course View
  and no working selection without causing an error or placeholder outline.
- A Course View is the stable identity of one continuing route strategy. A
  materially different organization is another View; changes to the same
  strategy create immutable revisions of that View.
- The learner may explicitly author a View. Repa or the Tutor may form an
  unselected candidate, but candidate formation does not alter navigation.
  Explicit learner intent may adopt an exact revision without a redundant
  confirmation; Tutor-initiated promotion waits for learner acceptance.
- A Course has zero or one working selection, and that selection pins one exact
  revision. It never follows a View's newer revision automatically.
- Course item identity is Course-owned and independent of revision-bound title,
  parent, and order. Meaning-preserving rename or movement may retain identity
  through an explicit mapping. Split, merge, semantic change, ambiguity, or
  conflict defaults to new identities. Old downstream references are never
  retargeted implicitly.
- The learner may direct the LLM to author a split, merge, or mapping under
  supervision. Gate 7 can represent and validate the domain transition; Gate 8
  later binds a real model invocation to trusted causal and replay settlement.
- Ordinary removal is reversible withdrawal from discovery and selection. It
  is not completion, abandonment, mastery, or physical deletion. Deep deletion
  waits until all referring authorities can show an exact impact scope.

## Owned record families

The implementation may adjust exact TypeScript and SQL names while preserving
these distinct records and constraints:

1. **Course identity and state.** A generated stable ID, learner-facing title,
   monotonic state version, creation time, and reversible withdrawal state. No
   foreign key points to inherited Project, Workspace, Session, or filesystem
   records.
2. **Course View identity and state.** A generated stable ID owned by one
   Course, a learner-facing strategy name, monotonic state version, creation
   time, and reversible withdrawal state. A View is first committed together
   with its first non-empty revision; an empty label-only View has no current
   consumer because the Course already represents intention before a route.
3. **Course View revision.** A generated immutable ID, owning View, monotonic
   per-View revision number, application-bound authorship basis, and creation
   time. A later revision is based on the exact latest committed revision of
   the same View; a stale base fails instead of creating an implicit branch. A
   distinct route strategy creates another View rather than arbitrary revision
   DAG machinery.
4. **Course item identity.** A generated stable ID owned by one Course. It
   stores no revision-bound title, parent, order, progress, mastery, material,
   or Agenda state.
5. **Revision membership.** One row per exact revision/item occurrence,
   containing revision-bound title, parent item, and global preorder position.
   One revision is an ordered forest with 1–1024 items, roots and siblings
   ordered by depth-first preorder, maximum depth 16 with roots at depth zero,
   and item titles of 1–500 Unicode code points after trimming. Positions are
   exactly `0..item_count-1`; every parent precedes its children and each
   subtree occupies one contiguous position range. Course and View titles are
   1–200 Unicode code points after trimming. These are versioned Course-domain
   constants, not user configuration.
6. **Revision transition and item mapping.** Every revision after the first
   records its exact predecessor. Mapping is a closed algebra of bounded groups:
   `preserve` is 1→1 with the same stable item ID; `split` is 1→N for `N >= 2`
   with newly allocated target IDs; `merge` is N→1 for `N >= 2` with a newly
   allocated target ID. Each source and target membership participates in at
   most one group, and N→M with both sides greater than one is rejected.
   Mapping sources belong to the exact predecessor and targets to the new
   revision. Unmapped source and target memberships mean removal and addition.
   A target that reuses an existing Course item without a predecessor
   `preserve`—in particular in the first revision of another View—must name one
   previously committed exact source membership with the same item ID. Mapping
   records lineage only; it never retargets downstream records.
7. **Working selection.** One Course-owned state record holds a nullable exact
   revision target and a monotonic version. Persisting the empty state avoids
   losing stale-write protection when a selection is cleared and later set
   again. A selected revision must belong to the same Course and the Course,
   View, and Revision must all be locally active.
8. **Revision disposition.** Withdrawal/restoration is mutable state separate
   from immutable revision content. It has its own monotonic state version and,
   while withdrawn, a closed reason of `rejected_candidate` or `removed`.
   Course and View withdrawal use their own state versions and `removed`
   reason; none of these states imply completion, abandonment, or mastery.

### Derived revision relations

`candidate`, `historical`, and `working` apply to exact revisions and are not
stored lifecycle values. First compute eligibility: a revision is eligible only
when its Course, View, and Revision are all locally active. Then apply these
mutually exclusive formulas:

- `working`: eligible and equal to the Course's exact selected revision;
- `historical`: eligible, not working, and followed by a later eligible
  revision in the same View;
- `candidate`: eligible, not working, and not followed by a later eligible
  revision in the same View; and
- `withdrawn`: ineligible because its own or an ancestor's withdrawal applies.

Thus a learner-authored but unselected latest revision is a candidate. A latest
revision that was once selected and later cleared is also a candidate; Gate 7
does not claim or persist “ever selected” history. An older selected revision
remains working even while a newer candidate exists. A rejected proposal is
distinguished from ordinary removal by its persisted withdrawal reason, not by
the derived candidate relation.

## Authorship basis and the Gate 8 boundary

Gate 7 stores one closed `authorship_basis` value: `learner_authored` for
content directly supplied through a learner action, `learner_directed` for
model-authored content requested by the learner, or `tutor_proposed` for
content initiated by the Tutor and created in proposal form. These immutable
values describe the content's creation basis, not its current selection or
acceptance state. The value is bound by a capability-scoped trusted application
caller and is not a field accepted from a model-authored payload. It records
the application boundary's assertion, not durable proof of the causal learner
message, model operation, physical invocation, acceptance, or replay.

No Gate 7 API claims that the enum alone proves learner authorization. A direct
trusted application action may invoke the domain transition; a model cannot.
Gate 8 later binds model-issued calls and learner acceptance to durable causal
receipts without reinterpreting Gate 7 content. Gate 7 cannot claim
source-grounded authority before Gate 9 can bind an exact source revision.

## Legal transitions

All state-changing transitions are Course-authority operations committed in
one SQLite transaction. Every expected target means exact ID including `null`;
every expected version is compared-and-swapped. A mismatch fails the whole
transition rather than being reinterpreted from current state.

| Transition | Required current state and expectations | Selection effect |
| --- | --- | --- |
| Create Course | Validated title; identity is generated. | Atomically creates target `null` at initial version. |
| Correct Course metadata | Course locally active; expected Course state version. | None. |
| Create View and first revision | Course locally active; expected Course state version; generated View, revision, and new item IDs; any reused item has an exact source-membership citation. | None. |
| Correct View metadata | Course and View locally active; expected Course and View state versions. | None. |
| Add View revision | Course and View locally active; expected Course and View state versions; expected predecessor is the exact latest committed revision of that View. | None. |
| Select or clear | Course locally active; expected Course state version and exact selection target/version. A non-null target also supplies the expected View and Revision state versions and must be eligible in that Course. | Writes the supplied exact target, including `null`, and advances the selection version. |
| Reject candidate Revision | Course, View, and Revision locally active; target is still derived `candidate`; expected Course, View, and Revision state versions; exact expected selection target/version prove the target is not selected. | None; the Revision becomes withdrawn with reason `rejected_candidate`. |
| Withdraw Revision | Course, View, and Revision locally active; expected Course, View, and Revision state versions; exact expected selection target/version. | If selected, explicitly clear or replace with another eligible Revision in the Course; a non-null replacement supplies its expected View and Revision state versions. Either change advances the selection version. Otherwise leave selection unchanged. |
| Withdraw View | Course and View locally active; expected Course and View state versions; exact expected selection target/version. | If the selected Revision belongs to the View, explicitly clear or replace with an eligible Revision of another active View in the Course; a replacement supplies its expected View and Revision state versions. Either change advances the selection version. Otherwise leave selection unchanged. |
| Withdraw Course | Course locally active; expected Course state version; exact expected selection target and version. | Writes target `null` and advances the selection version. No Revision of the withdrawing Course can be a valid replacement. |
| Restore Course | Course locally withdrawn; expected Course state version. | Remains `null`. |
| Restore View | Course locally active and View locally withdrawn; expected Course and View state versions. | None. |
| Restore Revision | Course and View locally active and Revision locally withdrawn; expected Course, View, and Revision state versions. | None. |

Parent state versions are expectations whenever a child transition relies on
their active state; withdrawing and restoring a parent therefore cannot create
an ABA window for an older child command. The selection expectation in every
reject or withdrawal is mandatory even when the caller expects the selection
to remain unchanged. It closes the race in
which a stale rejection observes an unselected candidate after the learner has
selected it. Selection and withdrawal serialize whichever commits first: a
later stale operation fails.

A non-null replacement is the target side of `Select`: the transaction checks
the already-required Course state version plus the replacement View and
Revision's exact expected state versions and current eligibility. A replacement
that was withdrawn and restored after the command was formed therefore fails
instead of surviving an ABA cycle. Every successful clear or replacement
advances the selection version; an unrelated withdrawal that leaves selection
unchanged does not.

Creation and correction never cross a withdrawn container. A withdrawn Course
cannot receive a View, and a withdrawn Course or View cannot receive a new
revision. A View or Revision cannot be restored while its Course or View parent
remains withdrawn. Restoration changes only the named local disposition and
never restores a former working selection.

Adding a revision requires the exact latest committed predecessor, preventing
an implicit branch. That predecessor may itself be locally withdrawn: its
immutable content remains a valid lineage input for a corrected proposal even
though it is not eligible for selection. The new revision is locally active.

The command surface may use temporary item keys inside one proposed snapshot so
the domain allocates trusted new IDs and resolves parent, mapping, and source
membership references. An LLM does not obtain authority merely by inventing
persistent identifiers.

No Gate 7 transition marks a Course complete, abandoned, enrolled, mastered,
merged, physically deleted, or globally active.

## Database and transaction invariants

- IDs are opaque, namespaced, and program-generated; title, order, path, source,
  Session, and content hashes do not define identity.
- Foreign and composite keys prevent a View, revision, item, membership,
  mapping, or selection from crossing Course ownership.
- Per-View revision numbers are unique and strictly increasing. Every
  non-initial revision points to the immediately preceding committed revision;
  no merge, rebase, or branch-head abstraction is introduced.
- Revision content, membership, and accepted transition mappings have no update
  path. Correction creates a later revision. Mutable display, selection, and
  Course/View/Revision withdrawal state use their respective monotonic
  versions; working selection has an independent monotonic version.
- A successor occurrence that retains an immediately preceding item identity
  requires exactly one `preserve` group. A reused identity absent from the
  predecessor requires exactly one same-Course, same-item source-membership
  citation. Split and merge targets are new identities; no mapping or citation
  changes an existing reference.
- Hierarchy validation enforces the ordered-forest formula and bounds in this
  contract and rejects duplicate local or persistent identities, missing or
  cross-revision parents, cycles, non-contiguous subtrees, invalid preorder, or
  parents owned by another Course.
- Mapping validation enforces the complete preserve/split/merge algebra,
  rejects N-to-M groups and repeated group membership, and treats unmapped
  memberships only as explicit addition or removal.
- Course/View/revision creation, selection, mapping, withdrawal, and
  restoration commit all owned rows or none. No partially visible revision or
  dangling selection can survive failure.
- Reject and withdrawal transitions compare the exact selection target and
  version in the same transaction as the disposition update. A selected target
  cannot be made ineligible unless the transaction also produces its legal
  clear or replacement state.
- A non-null withdrawal replacement satisfies the same target eligibility and
  expected View/Revision version checks as `Select`. Both clear and replacement
  advance the independent selection version.
- Authorship basis is bound by the capability-scoped application entry point;
  the untrusted proposed hierarchy cannot set or upgrade it.
- Session deletion and inherited Project/Workspace cascade have no path to any
  Gate 7 row.

SQLite enforces structural ownership and uniqueness. Domain code enforces
semantic mapping, expected-version, hierarchy, authorization-input, and
transition rules that cannot be expressed honestly as static foreign keys.
Gate 7 does not create triggers, a universal event log, a graph database, or a
generic repository/manager layer to make immutability appear stronger than the
owned application boundary.

## Read boundary

Gate 7 exposes bounded domain reads sufficient for later consumers and its own
evidence:

- list ordinary non-withdrawn Courses without inventing one active Course;
- inspect a Course including its nullable exact working selection;
- list its Views and exact revision summaries, deriving `working`, `historical`,
  or `candidate` for each eligible Revision from the formulas above without
  loading membership content;
- read an exact revision in bounded pages with stable authored order; and
- inspect an exact revision transition and item mapping.

Every list-shaped read, including mapping groups and reuse citations, defaults
to 50 entries, accepts at most 100, uses a stable total keyset order with a
unique identity tie-breaker, and returns an opaque continuation cursor scoped
to the endpoint, parent identity, and withdrawn-record filter. Course order is
`(created_at, course_id)`, View order is `(created_at, view_id)`, Revision order
within a View is `(revision_number, revision_id)`, and membership order is
`(preorder_position, item_id)`. Collections without authored order use their
canonical source/target keys followed by a program-generated record ID. A
cursor from another scope or filter is invalid rather than reinterpreted.

Ordinary discovery excludes effectively withdrawn records. Explicit inclusive
or exact-ID reads accept them and expose both local disposition and effective
ineligibility, including which ancestor applies and the local withdrawal reason
where one exists. Gate 7 persists no hidden adoption history and does not infer
one from the derived relations.

Gate 7 does not compile model context, choose a relevant Course, maintain a
route anchor, or add a user interface.

## Implementation ownership

- A Repa learning-domain module inside `packages/core` owns Course schemas,
  SQL tables, errors, reads, and transitions. It may depend on the native
  database and small schema/identity utilities, but not on Session services,
  provider code, tools, terminal code, Material Map, learner state, or Agenda.
- The existing Repa migration generator owns the first post-baseline forward
  migration and regenerated fresh-database schema. No inherited migration is
  reactivated and no compatibility migration is added.
- The outer OpenCode-named runtime receives no Course tool, prompt injection,
  TUI screen, or startup behavior in this Gate. Those are real later consumers,
  not reasons to invert the learning authority's dependency direction.

Package names remain an implementation placement, not product ontology. If the
actual import graph shows that a narrower existing core boundary can own the
same invariants without circular dependencies, file placement may change while
the domain and dependency direction above remain fixed.

## Failure behavior

- Unknown and wrong-Course identities fail with typed domain errors and leave
  state unchanged. Operations requiring eligibility reject an effectively
  withdrawn target; explicit inclusive/exact reads and a legal restoration
  accept the withdrawn identity they are defined to inspect or restore.
- A transition forbidden by the state matrix fails rather than silently
  restoring a parent, mutating under a withdrawn container, or selecting an
  ineligible Revision.
- A stale revision base does not create a sibling revision. The caller reloads
  the latest exact revision and decides again.
- A stale Course, View, Revision, or working-selection expectation reports a
  conflict. In particular, a stale candidate rejection cannot withdraw or
  clear a Revision selected by the learner after the proposal was formed.
- Invalid hierarchy or mapping fails before any revision is published. A
  database failure after insertion begins rolls back identity, membership,
  transition, mapping, and selection changes together.
- An identity collision never falls back to title matching or accidental reuse;
  the operation rejects or allocates a new identity according to the explicit
  input.
- Withdrawal of a selected target without the legal clear or replacement in
  the same transaction fails. Course withdrawal never replaces its selection;
  restoration never makes any Revision working implicitly.
- Reopen reads exactly the committed identities, revisions, mappings,
  dispositions, and selection; no process-local Course truth exists.

## Explicit non-goals

- no model/tool invocation settlement, semantic-effect replay, Session causal
  receipt, or model-visible tool result (Gate 8);
- no artifact, source, root, representation, Material Map, or alignment
  identity (Gates 9–12);
- no route anchor, learner progress, evidence, mastery, Agenda, Assignment, or
  Tutor adaptation;
- no default Course preference, automatic context selection, prompt projection,
  slash command, CLI/TUI management screen, or background agent;
- no source-grounded revision claim before exact source authority exists;
- no Course completion/abandonment/enrolment ontology and no physical deep
  deletion;
- no generic node/edge table, arbitrary revision DAG, merge/rebase engine,
  universal event store, compatibility layer, or speculative domain framework;
  and
- no bulk port of the pre-fork schema, SQL, command executor, or tests.

## Closing evidence

Evidence is limited to claims this Gate changes and must be able to falsify the
boundary:

- the generated forward migration upgrades an existing Gate 6 database without
  changing Session rows, and a fresh database contains the same Course schema;
- multiple Courses persist independently, including a Course with no View and
  a nullable versioned working selection;
- distinct Views and immutable linear revisions survive reopen, while creating
  a candidate or a newer revision does not move the exact working selection;
- after a caller reads an unselected candidate, a learner can select it and
  advance the selection version; the caller's stale reject and withdrawal both
  fail while the Revision remains active and selected;
- after a caller prepares withdrawal with a non-null replacement, withdrawing
  and restoring that replacement advances its state version; the stale command
  then fails without changing the original selection, while every successful
  clear or replacement advances the selection version;
- derived relation cases cover a learner-authored unselected latest Revision,
  an older selected Revision beside a newer candidate, a cleared latest
  Revision, an older unselected historical Revision, and a rejected candidate
  whose persisted reason remains inspectable;
- the transition matrix rejects child creation or restoration under a
  withdrawn parent, proves Course withdrawal is clear-only, and proves the
  narrower View/Revision replacement rules;
- stale revision, metadata, selection, withdrawal, and restoration expectations
  fail without partial writes;
- database constraints reject cross-Course revisions, memberships, parents,
  mappings, and selections;
- hierarchy evidence covers ordered forests, preorder and contiguous subtrees,
  title/item/depth bounds, and invalid parents;
- mapping evidence covers 1-to-1 same-ID preservation, 1-to-N split, N-to-1
  merge, additions/removals, N-to-M rejection, and exact source citation when a
  different View first reuses a Course item identity;
- injected failure during revision publication leaves no partial View,
  revision, item, membership, transition, or mapping rows;
- the application capability binds authorship basis independently of the
  proposed content, no model-shaped input can promote its own provenance, and
  selecting a `tutor_proposed` Revision does not rewrite its creation basis;
- Course, View, Revision, membership, mapping, and citation collections cross
  the fixed page boundary in stable order without duplicate or omitted records,
  and reject a cursor from a different endpoint, parent, or withdrawal filter;
- withdrawing a selected Course clears its selection; withdrawing a selected
  View or Revision atomically clears or legally replaces it; restoration does
  not reactivate it; and
- the focused Course authority tests, migration-generator check, and
  `packages/core` typecheck pass.

No root-level, monorepo-wide, provider, Session, TUI, or later-learning-authority
suite is part of this claim.

## Acceptance boundary

The Gate closes only when the native database and Course authority enforce the
record ownership, legal transitions, failure behavior, and focused evidence
above. Passing a migration test alone does not prove the authority. Conversely,
the Gate does not wait for a model command, material import, visible learning
screen, route progress, or Tutor context consumer that belongs to a later Gate.
