# OpenCode fork Gate 9: source and artifact authority

Status: Passed at implementation commit `41db7c292`. Original top-level reviewer
task `019f6ae7-fff2-7800-9d7b-023cf918e201` accepted contract/theory and
implementation/evidence under review run
`gate9-contract-406beb29cd4e4ec4bb24725fb4d103f8`. Current disposition remains
owned by [the documentation index](../README.md).

Date: 2026-07-16

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Decisions: [ADR-0003](../decisions/0003-learning-state-follows-evidence.md),
[ADR-0006](../decisions/0006-atomic-local-learning-transaction.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md), and
[ADR-0014](../decisions/0014-one-time-opencode-fork.md)

This record owns the accepted Gate 9 engineering contract. The product decisions
below are maintainer authority. The physical and transition sections are the
independently accepted derived engineering boundary, still reopenable if later
implementation evidence contradicts it.

## Intended result

Gate 9 gives one LearnerHome a native source/artifact authority with stable
logical Artifact identity, exact immutable content revisions, mutable location
history, truthful availability, and inspectable provenance. Historical
references remain bound to the exact revision they used when a path moves,
bytes change, a source becomes unavailable, or an earlier attribution is
corrected.

This Gate establishes the domain and database boundary before Gate 10 grants
content-root authority or performs real bounded filesystem observation. Gate 11
owns readable derived representations, and Gate 12 owns Material Maps and
Course alignment. Gate 9 therefore does not make a root own a Course, scan or
classify a learner's files, translate content, or infer material/Course meaning.

## Accepted product decisions

### Artifact identity follows one concrete source lineage

An Artifact identifies one continuing concrete content source, not an abstract
work, title, or subject. Its identity is independent of its current path.

- A move or rename may preserve the Artifact identity by replacing its one
  active source location while retaining the prior location as history. An
  exact duplicate elsewhere is not attached simultaneously as another active
  location.
- A PDF, EPUB, different edition, scan, or learner-annotated copy is a separate
  Artifact even when a person would call it the same book.
- Digest equality does not globally merge independently admitted Artifacts.
  It can establish accepted exact-byte equality under the fingerprint policy
  and support an explicit source-location rebind; it cannot decide semantic
  identity by itself.
- A readable representation derived later is bound to one exact source
  revision through Gate 11 provenance. It is not folded into the original
  Artifact as an ordinary revision.

Product guidance should recommend that a learner choose the one edition or
format they consider most suitable for a book. This is a low-friction usage
habit, not a schema uniqueness rule or a prohibition: when several versions
are useful, Repa keeps them as distinct Artifacts rather than silently merging
them.

### One Artifact has at most one active source location

An Artifact is logical material rather than a physical file, but Repa does not
attach several live paths or locators to it. At any time it has zero or one
active source location. A move or explicit rebind changes that location and
preserves the previous location as inactive history; missing content leaves the
Artifact and its exact Revisions intact with no active available source.

An identical backup outside the active location is not registered as a replica,
fallback, or second source for the Artifact. Repa-owned retained bytes are also
not another active source location: they are immutable backing for one exact
Revision's audit or preservation lifetime. This avoids primary/replica roles,
independent writers, divergent current revisions, and merge semantics.

### Rebinding requires explicit learner intent

Discovery of matching bytes, digest equality, a model suggestion, or a retained
snapshot cannot change the active source location. When the current location is
missing, the Artifact remains `missing`; a later trusted Observation at that
same location may restore availability, while content found elsewhere still
requires the learner to choose an explicit rebind.

A direct learner command to move or rebind the Artifact is itself that explicit
choice and needs no redundant confirmation. If Repa performs the requested file
move, it changes the active location only after the physical move succeeds; an
unrequested backup or discovered copy never becomes the source automatically.

### Admission requires explicit learner instruction

A file becomes a durable Artifact only through an explicit learner instruction
to add or retain it, or through a learner-invoked initialization import with an
explicitly bounded input scope. The instruction may be ordinary natural
language; it does not require a special command spelling or a second approval
after its target is unambiguous.

An attachment, generic read, search result, root approval, or apparently useful
long-term content does not by itself authorize admission. When intent or scope
is unclear, an LLM may ask or suggest import but cannot commit it silently. One
explicit batch-import scope may authorize all selected members without a
separate confirmation for each Artifact.

The lineage-split correction below is not independent admission of a newly
discovered file. It may split only an already admitted source timeline when an
explicit learner statement or reliable non-model discontinuity establishes an
exact identity boundary.

Every correction remains inside exactly one independent-admission ancestry. An
Artifact created by correction inherits that immutable admission root. A set
cannot combine source histories rooted in separate learner-instruction or
initialization admissions, including by assigning them to one fresh target.
Artifacts inside one ancestry remain distinct concrete sources; the root is only
a correction-scope invariant, not identity equivalence or merge authority.

### Initialization import uses a bounded candidate manifest

Approving a content root establishes a discovery and search boundary; it does
not import the directory. A learner-invoked initialization import first builds
a deterministic, bounded candidate manifest. The learner may select individual
files, select bounded subtrees, or explicitly choose all supported candidates
in the manifest.

That one selection authorizes the resulting batch without per-Artifact approval.
Unselected, ignored, out-of-bound, or merely discovered files do not become
Artifacts. An LLM need not read or classify the candidates to construct the
manifest and cannot widen the authorized import scope by interpretation.

### Removal separates tracking, retained bytes, and the source file

Ordinary removal from Repa is a reversible withdrawal from discovery and use.
It leaves the learner's source file untouched and preserves Artifact identity,
exact Revisions, location history, provenance, and downstream references.
Restoration changes only disposition and does not invent availability. A later
use must revalidate the active location and apply the ordinary present, missing,
or changed-byte transition; content found only elsewhere still requires an
explicit rebind.

Deleting Repa-owned retained source bytes is a separate explicit operation. It
marks the affected Revision backing unavailable while preserving identity and
lineage. Deleting the learner's original source is a distinct, high-impact
filesystem mutation with its own exact path, permission, and result; neither
withdrawal nor retained-byte deletion implies it.

Gate 9 defines no physical deep deletion of Artifact metadata. That operation
waits until every referring authority can present an exact impact scope for
explicit learner authorization.

### System knowledge, byte retention, and model access are separate

Admitting an Artifact means that Repa's system authority knows its identity,
active-location history, exact observed revisions, availability, and
provenance. It does not place the source bytes in a model request, grant a read
capability, or claim that the currently configured model can consume the
original media.

- Local source admission does not copy the whole source into Repa-owned storage
  by default. It records the exact revision and external location. A learner may
  explicitly retain a complete immutable snapshot, and a durable relation may
  retain the bounded exact content needed for its correction or audit lifetime.
- Retained raw bytes or bounded audit content remain source evidence. Their
  presence does not make them the representation routinely supplied to a model.
- Repeated long-term model use of a non-model-friendly source requires Gate
  11's immutable readable representation derived from one exact source
  revision. Later retrieval reads bounded ranges of that representation rather
  than repeatedly sending the original media. This path must remain usable when
  the configured model is not multimodal and may also avoid repeated multimodal
  token cost when it is.
- A readable original needs no fake conversion record. Conversely, model
  support and cost vary by configuration, so Gate 9 records objective media,
  revision, and availability facts rather than a universal
  `model_readable` property.
- Representation derivation remains lazy and learner-optional. If the learner
  declines it, conversion is unsupported, or bytes are unavailable, Repa may
  still know the Artifact but must report the resulting limit on long-term
  model use; none permits Repa to pretend that the model consumed content it
  could not read.

### Same-location change has rebuttable continuity

When new bytes are observed at an existing Artifact location and no trusted
fact establishes an identity break, Repa records a new exact Revision of the
same Artifact. The old Revision and every reference to it remain unchanged and
become stale relative to the newly observed source state where appropriate.

A trusted learner statement or reliable non-model source-native identity or
format discontinuity may instead establish that the location contains or
contained a different edition, format, or work. Repa then admits a new Artifact
and appends an exact lineage-boundary correction. The boundary may precede a
contiguous range of already recorded Revisions, and it may fall between
Observations when two concrete sources happen to contain identical bytes. The
old rows and every dependent reference remain unchanged while effective lineage
reads expose the correction. An LLM may point out a suspected replacement and
ask for clarification, but semantic similarity or model confidence cannot split
the identity by itself.

## Current evidence

- The accepted architecture separates mutable location from exact observed
  content and makes source independent of Course, LearningSpace, and Session.
- It also separates system-visible resource management, read authorization,
  model-visible retrieval, and learner-visible disclosure. Its accepted
  representation lineage is reusable across later Turns and fresh Sessions.
- The pre-fork oracle derived Artifact identity from one workspace root and
  relative Markdown path, coupled Course creation to that source, and could
  not represent moves or format-independent source authority. Its digest,
  stale-read, and bounded-selector behavior remains evidence; its schema and
  ownership do not.
- The current fork has native Course/View and learning-command authorities but
  no production source/artifact records, so no existing table needs backward
  compatibility or migration as product meaning.

## Proposed Gate result

After Gate 9, the native LearnerHome database can represent a local-file
Artifact independently of Course, Workspace, Project, Session, content-root,
and model context. A trusted application caller can atomically admit one exact
initial observation, accept later state-changing observations at the same
active source location, record missing and restored content, explicitly rebind
the location, append non-byte Observation corrections, split a mistaken source
lineage across an exact history interval without moving old references, and
withdraw or restore ordinary discovery.

The result is a Core-owned domain authority, not a user-visible import path.
Gate 9 consumes a prepared exact observation but performs no filesystem access.
Gate 10 later owns root approval, canonical path authority, bounded manifests,
mutation-safe byte observation, and production calls into this authority. A
model-issued source write must additionally reuse Gate 8's causal and physical
settlement boundary; Gate 9 exposes no model tool and claims no durable proof of
learner instruction.

## Identity and state vocabulary

The contract keeps seven meanings distinct:

1. **Artifact.** Stable LearnerHome identity for one continuing logical source.
   It owns ordinary withdrawal state and immutable creation basis.
2. **Content Revision.** Stable identity for one exact raw-byte content value as
   first recorded in one Artifact lineage. It is independent of path and of how
   often those bytes are observed. Independent admissions do not deduplicate;
   only an exact effective lineage-assignment member may add a second Artifact
   attribution without changing the Revision or its recorded attribution.
3. **Source binding.** One historical episode binding the Artifact to one
   trusted canonical local-file location. At most one episode is active.
4. **Source observation.** One immutable, state-changing occurrence at a binding:
   exact bytes were present or the source was missing. Observation order is not
   content identity.
5. **Observation correction.** Append-only supersession of one Observation's
   non-byte descriptor/provenance, without changing its Revision, binding, or
   logical Artifact attribution.
6. **Source lineage correction.** Append-only atomic delta over one or more exact
   intervals in recorded Artifact source histories. Each source history is
   globally ordered across all of that Artifact's binding episodes, so one
   interval spans moves/rebinds. Later deltas override only named ranges and
   never restate unaffected history, recorded rows, or old references.
7. **Current source projection.** Versioned pointer to the current effective
   Revision and its exact attribution basis, active binding if any, latest
   effective source-state basis (an Observation or lineage-correction member),
   effective media descriptor, and derived availability.

No global revision number or generic provenance/event table owns these meanings.

## Owned record families

Exact SQL and TypeScript names may change while preserving these records and
constraints.

1. **Artifact identity and disposition.** Generated stable ID, immutable
   admission-root Artifact reference, immutable application-bound creation basis
   (`learner_instruction`, `initialization_import`, or an exact
   `lineage_correction`), independent monotonic disposition and lineage versions,
   optional ordinary withdrawal reason, and creation/update times. An
   independently admitted Artifact names itself as its root. A correction-created
   Artifact inherits the one common root derived from the set's already admitted
   source histories; no caller chooses or later changes it. A lineage correction
   is not a third generic import path. The Artifact has no Course, Session,
   Project, Workspace, content-root, or model foreign key.
2. **Content Revision.** Generated stable ID, recorded Artifact attribution,
   tagged content-fingerprint algorithm, digest, exact byte length, and
   first-observed time. The baseline fingerprint is SHA-256 over the exact raw
   bytes; no text, newline, media, or parser normalization participates. The
   recorded Artifact has at most one Revision for the same tagged fingerprint
   and length. Independent Artifacts may record distinct Revision IDs for
   identical bytes. A lineage correction can make an existing Revision effective
   for another Artifact only through one exact interval member; it never rewrites
   or globally deduplicates the recorded Revision.
3. **Source binding history.** Generated stable ID, recorded Artifact, trusted
   canonical absolute file location, monotonic per-Artifact binding ordinal,
   application-bound binding basis, start time, and optional exact end
   time/reason. Partial uniqueness enforces at most one active binding per
   Artifact and prevents the same canonical location from being active for two
   Artifacts. A backup and retained snapshot create no binding.
4. **Source Observation.** Generated stable ID, recorded Artifact and binding,
   monotonic per-recorded-Artifact occurrence ordinal spanning every binding
   episode, result (`present` or `missing`), optional exact Revision plus
   attribution basis and observed media type for `present`, trusted observer
   capability identity and version, observation time, and commit time. Shape
   constraints forbid a Revision/media type on `missing` and require both on
   `present`. Normal attribution cites the Revision's recorded Artifact; only an
   exact effective lineage-assignment member may authorize a corrected Revision
   attribution.
5. **Observation correction.** Immutable generated ID, exact target `present` Observation,
   monotonic per-Observation correction sequence, expected predecessor including
   exact `null`, corrected media type and optional corrected external observation
   time, trusted correcting capability/basis, and commit time. It appends
   effective non-byte provenance without changing the target row, byte Revision,
   binding, occurrence order, or lineage. The latest accepted correction is the
   effective descriptor; older values remain inspectable.
6. **Source lineage correction set and interval members.** The immutable set
   header has a generated stable ID, trusted application basis, exact common
   admission-root Artifact, optional one newly created target Artifact, and commit
   time. It contains the exact finite members needed by that correction
   transaction; the contract imposes no fixed member cap. Each member has a
   stable ID, one recorded Artifact source history, that history's new lineage
   version, exact `start_after_ordinal` and `end_at_ordinal`, effective time,
   exact boundary source state (binding, supporting Observation or prior
   correction-member ID, Revision, descriptor/correction, and availability), and
   an attribution outcome.

   Every member's recorded Artifact must already have the header's exact
   admission root before the transaction. The outcome is the set's new target,
   an Artifact already reachable in the exact correction ancestry under that
   root, or `recorded`. A new target inherits the root and at least one member
   must name it. A set never establishes ancestry between independently admitted
   roots, even when its proposed target does not yet exist.

   The closed interval contains the recorded Artifact's Observations with
   `start_after < ordinal <= end_at`, regardless of binding changes. It may be
   empty only for an exact identical-byte boundary after `end_at`. The boundary
   Revision plus every `present` Revision in a member receives that member's
   effective attribution while all recorded attributions remain immutable.
   Members within one set cannot overlap on one source history. Across sets, the
   member with the greatest lineage version covering a coordinate is effective;
   `recorded` restores the row's recorded Artifact. A later set is an incremental
   override and need not copy any unaffected earlier member. The same precedence
   applies to an empty boundary coordinate by naming its exact current winning
   basis (`recorded` or member).
7. **Current source state.** One row per Artifact containing monotonic source
   version, optional active binding, optional current effective Revision and its
   recorded-or-corrected attribution basis, optional latest effective
   source-state basis (Observation or lineage-correction set/member), effective
   media descriptor/correction, and
   availability (`available`, `missing`, or `unbound`). Normal pointers require
   matching recorded Artifact; cross-recorded state support is legal only
   through one exact effective lineage-assignment member. Normal admission
   creates an available binding and non-null current Revision; an exact lineage
   correction may create or leave an unbound projection.

Repa-owned retained-source backing is deliberately not an empty Gate 9 record
family. No current producer retains such bytes. A later explicit retention
capability may add backing records tied to exact Revisions without turning them
into source locations or changing the identity model above.

## Content identity, observation, and attribution algebra

Four facts answer different questions:

```text
Revision:               which exact bytes?
Observation:            when and where did source state change?
Observation correction: which non-byte descriptor/provenance supersedes an error?
Lineage split:           which concrete Artifact effectively owns a timeline interval?
```

The domain allocates a generated Revision ID and stores a versioned exact
fingerprint rather than using a digest as the Artifact or cross-Artifact ID.
Media type, observer, and time remain provenance; they do not change raw-byte
identity. Independently admitted Artifacts with equal fingerprints retain
different Revision IDs. A lineage-assignment member may make an existing
Revision effective for its corrected Artifact because it preserves one recorded
source timeline; that exception is explicit attribution, not digest
deduplication.

For one recorded Artifact at one active binding:

```text
observe A -> Revision A, Observation 1, current A
observe B -> Revision B, Observation 2, current B
observe A -> reuse Revision A, Observation 3, current A
```

The third occurrence proves a rollback or recurrence without creating a second
Revision for A or erasing B. Re-observing A while A is already available, with
the same effective media descriptor and no accepted identity boundary, is a
semantic no-op: it creates no Observation and advances no source version. A
better trusted media determination instead appends an Observation correction;
an exact lineage boundary instead invokes the split transition even when the
bytes are unchanged. A read or tool invocation that needs its own occurrence
provenance keeps that in its owning Interaction or later domain receipt rather
than turning polling into Artifact history.

Per-Artifact binding ordinal, the recorded Artifact's cross-binding Observation
ordinal, lineage version, and source version provide transaction order. Rebind
continues that recorded source history rather than opening a new correction
coordinate. `time_observed` and lineage-member `time_effective` preserve trusted
external timing but never override commit/version order or let older prepared
state commit after newer state. A future remote-source capability may add
source-native revision metadata when it has a concrete producer and consumer;
Gate 9 does not reserve an empty field for it.

Every typed Artifact–Revision reference carries an attribution basis:
`recorded` or one exact lineage-assignment member ID. Old references keep their
original basis forever. New effective reads may expose corrected attribution,
but no query silently rewrites a previously persisted reference.

## Trusted application boundary

Gate 9 accepts prepared source facts only from a capability-scoped trusted
application caller:

- normal admission binds either an explicit learner instruction or an exact
  selection from an initialization manifest;
- rebind always binds explicit learner intent; a lineage split binds either
  explicit learner intent or an exact trusted non-model identity-discontinuity
  fact and an exact timeline boundary;
- same-location content/missing observations bind the trusted observer
  capability that Gate 10 will own;
- an Observation correction binds explicit learner correction or a trusted
  observer's superseding descriptor determination; and
- the domain itself allocates persistent IDs, source versions, observation
  ordinals, and commit time.

These application-bound values are creation, correction, and observation
provenance, not durable proof of a Session message, model operation, tool
invocation, user permission, byte-read race safety, or replay settlement. No
model-authored payload may set or upgrade them. Gate 10 must bind real
filesystem authority and observation; a later model-issued import/rebind must
also bind Gate 8 causal and physical settlement without reinterpreting Gate 9
records.

The accepted initialization candidate manifest is therefore a Gate 10 caller,
not a Gate 9 table or batch coordinator. One selected batch may call the
single-Artifact transition repeatedly and report exact per-member outcomes; the
user's one authorization does not imply one long SQLite transaction or
all-or-nothing filesystem work.

## Legal transitions

Every state-changing transition commits its source/artifact-authority metadata
in one SQLite transaction. External reads, hashes, moves, permission prompts,
and learner decisions occur outside that transaction.

### Admit exact source

Admission requires a trusted canonical file location, one exact `present`
descriptor, observer provenance, and application-bound admission basis. It
atomically creates the Artifact, first Revision, first binding, first
Observation, and current source state. A missing, unreadable, or incompletely
observed candidate creates no placeholder Artifact. A location already active
for another Artifact fails rather than merges or silently reuses it.

### Observe the active source

An observation checks the exact expected Artifact disposition version, source
and lineage versions, active binding/location, current Revision/attribution
basis including `null`, and availability in the final transaction.

- Exact current bytes while already `available`, with the same effective media
  descriptor, are a no-op.
- Exact current bytes with a different trusted media determination do not create
  a byte Observation; the caller uses the Observation-correction transition
  against the exact supporting Observation/correction.
- New bytes at the same active location create or reuse a Revision already
  effective for the Artifact, append a `present` Observation, advance source
  version, and make that Revision current. Old references do not move.
- A first `missing` result appends a `missing` Observation, advances source
  version, and retains the current Revision while deriving `missing`.
- Repeated `missing` is a no-op.
- Bytes returning at the same active location append a new `present`
  Observation and restore `available`; exact old bytes reuse their Revision,
  while different bytes create a new Revision under the accepted continuity
  default.

An ambiguous or trusted identity discontinuity is not smuggled through the
ordinary observation input. A model may suggest that the source is another
edition, format, or work, but only the explicit lineage-split transition
may give that judgment durable force.

### Correct Observation provenance

An Observation correction names one exact `present` Observation, its exact
expected correction predecessor including `null`, the superseding media descriptor and
optional external observation time, and a trusted correction basis. It appends
the correction without changing bytes, result, binding, occurrence order, or
lineage. If the target currently supplies one or more effective projections
through recorded or corrected attribution, the same transaction checks the exact
affected Artifact/version set, advances each affected source version, and
updates their descriptor provenance atomically. A historical-only correction
leaves current source state unchanged. Stale, incomplete, or conflicting
corrections fail rather than merge, and the original detector result remains
inspectable.

### Explicit rebind

Rebind requires an application-bound explicit learner choice, the exact
expected old source state, a distinct canonical destination, and one exact
`present` observation at that destination. In one transaction it closes the old
binding, inserts the new binding and observation, creates or reuses the exact
Revision, advances current state, and assigns the next Observation ordinal in
the same recorded Artifact source history. Digest equality, path discovery, or
a retained snapshot cannot invoke this transition. Rebinding to a missing path
or a location active for another Artifact fails.

If Repa later performs a learner-requested physical move, Gate 10 owns the
external failure boundary. A failed move calls no Gate 9 transition. A crash or
database failure after physical success leaves Gate 9 unchanged and requires a
visible explicit rebind/recovery; it never authorizes automatic discovery-based
repair.

### Correct a mistaken source lineage

One lineage-correction set names an exact finite member list plus an accepted
learner or trusted non-model discontinuity basis. Each member names one recorded
Artifact source history, global `start_after_ordinal`/`end_at_ordinal` bounds,
trusted effective time, exact boundary source state, exact expected lineage
version, and the currently winning attribution basis for the affected range.
The set also names every Artifact disposition/source version whose current
projection or binding can change. Preparation may inspect arbitrarily long
history outside the final write transaction, but one final transaction accepts
the complete finite delta or none of it.

Preparation derives one immutable admission root from every touched recorded
Artifact; a supplied root is only an exact expectation, never a choice. All
members must have that root before the transaction begins. An optional new target
is created with the same root and only when at least one member names it.

The global Observation ordinal crosses binding episodes. Therefore X/A at path
p, unnoticed Y/B at p, and a later explicit rebind of the still-recorded X
history to q with Y/C all occupy one X source history. One member after A through
C can atomically create Y and attribute B→C across p and q. Members are ranges,
not one row per binding, Revision, or Observation.

An initial point misattribution is the explicit interval after ordinal `0`
through the first Observation. A later replacement starts after its exact prior
ordinal and may cover a multi-Revision suffix or bounded historical interval.
The interval may be empty only when its exact boundary state establishes that
another concrete source with the same bytes replaced the old source after the
named ordinal. Digest equality neither proves nor prevents a correction.

A set may contain any finite number of non-overlapping members per touched
source history and may atomically create at most one target Artifact. Every
touched history must already carry the same admission root. Members may target
that new Artifact, an Artifact already established in the exact correction
ancestry under that root, or `recorded` attribution. This permits one correction
to cover several recorded histories produced inside one prior correction
ancestry without publishing a partial intermediate attribution. It cannot route
histories from independent admissions P and Q through a fresh R: their roots
differ before R exists, so the whole set fails without creating R.

Each touched recorded Artifact increments its lineage version once. Among all
members covering one history coordinate, the member with the greatest lineage
version supplies effective attribution; a `recorded` outcome restores the row's
recorded Artifact. Members in later sets are incremental overrides: unaffected
older members remain effective without being copied. An empty boundary uses the
same precedence by naming its currently winning basis (`recorded` or member).
The contract imposes no fixed member cap because every valid finite history must
remain correctable.

The boundary Revision and every `present` Revision in a member receive its
attribution outcome through that member ID. Recorded Revision, binding, and
Observation attributions never change. Effective reads expose the winning
member while old persisted references keep their original Artifact, Revision,
and attribution basis. New references using corrected lineage cite the exact
winning member.

If a winning member reaches the exact latest occurrence, or an empty member
names the latest boundary state, the set may transfer that active location. The
transaction closes the exact currently active binding named by the affected
projection, opens the same canonical location for the outcome Artifact, and
carries exact current Revision, descriptor,
supporting source-state basis, and `available`/`missing` state through the
member. That member becomes the target projection's state basis while citing
the prior Observation/correction; this is not discovery-based rebind or a fresh
filesystem Observation. The transaction advances every affected source version
and rejects any final state with two active bindings for one Artifact or one
location owned by two Artifacts.

Because the current projection retains that exact member basis, a later delta
can override and transfer the binding even when no new Observation has yet been
recorded under the current owner. It does not need a synthetic Observation or a
binding-local correction member.

An interval ending before its history's latest occurrence changes no active
binding. An Artifact-targeting outcome begins or remains unbound with the latest
effective Revision in that interval; a `recorded` outcome restores recorded
attribution. A later correction can override only the ranges that changed,
including intervals recorded after an earlier correction, or restore them to
recorded attribution. An Artifact losing all effective source history and its
active binding becomes unbound and correction-hidden rather than deleted.
Database/resource failure
rolls back the one correction set; there is no staged publish, complete-set
copy-forward, or correction recovery identity. An ambiguous boundary remains a
hypothesis and commits no correction.

### Withdraw and restore

Ordinary withdrawal checks the exact expected disposition version, increments
it, and hides the Artifact from ordinary discovery. It does not close or rebind
the source, delete any bytes, alter current Revision, or claim completion,
abandonment, or invalid content. Restoration checks the exact expected version,
changes only disposition, and never claims that previously observed bytes are
still present. A future read must revalidate the source through Gate 10 before
using content.

A lineage-correction disposition is not ordinary learner removal and cannot be
silently restored as if the correction had not occurred; only an exact
superseding lineage correction may change that derived disposition.

Gate 9 defines no transition that deletes the learner's source file, deletes
future retained backing, physically deletes metadata, imports a directory, or
changes another learning authority.

## Concurrency and transaction invariants

- Artifact disposition, current source, and recorded-history lineage have
  independent monotonic versions because withdrawal, source state, and effective
  attribution are different. Every source transition checks exact disposition
  and source versions plus the current winning attribution/lineage version, so
  withdrawal or correction ABA invalidates older prepared work.
- Every nullable expectation means exact `null`, never "do not care". Stale
  location, Revision/attribution basis, Observation correction predecessor,
  lineage/history upper bound, availability, or version input fails the whole
  transaction with current references.
- The final transaction is authoritative. Two prepared Observations, rebinds,
  Observation corrections, lineage-correction sets, or withdrawal races
  serialize whichever commits first; the stale transition cannot append history
  under a no-longer-current premise.
- A state-changing transaction commits its Revision, binding, Observation,
  Observation correction/lineage set, disposition, and current projection
  together. Injected failure leaves none of those partial rows or pointer
  changes.
- Foreign keys, shape checks, and uniqueness enforce known identities, immutable
  admission-root references, self-rooted independent admission, recorded
  attribution, correction-chain shape, and active-location cardinality. Domain
  code enforces exact expected state, one common pre-existing root per correction
  set, inherited and used new targets, non-overlap within one delta, cross-set
  lineage-version precedence, correction-authorized attribution, no-op
  classification, lineage fallback, trusted-basis construction, and legal
  transition shape.
- No transaction remains open during filesystem I/O, model sampling, user
  confirmation, or permission waiting.
- Domain returns are same-transaction snapshots convenient for trusted callers,
  not exact model-visible command receipts. A later model command must use Gate
  8 settlement rather than exposing a post-commit convenience read as its
  durable outcome.

## Availability semantics

Availability is a truthful last accepted source-state basis, not a live
guarantee. The basis is normally an Observation and may be an exact lineage
correction member carrying prior accepted state:

- `available` means the active location was last accepted with the current
  exact Revision;
- `missing` means a trusted observation found no source at that still-bound
  location; and
- `unbound` means no source location is currently attached, normally after an
  explicit correction.

Permission revocation, an unreadable root, converter failure, and model media
support are not Artifact byte-availability values; their owning capabilities
report them separately. With no background daemon, availability changes only
when Repa wakes and a relevant trusted operation observes it, or when an exact
lineage correction changes attribution/binding while carrying already accepted
state. The latter never claims a fresh filesystem Observation. Any operation
that reads through the active source must recheck exact path/revision through
Gate 10 rather than trusting this projection or falling back to whatever bytes
now occupy the path.

Active-source availability and exact-Revision resolvability are separate. A
historical Revision is not resolvable merely because its metadata exists. It may
resolve from the active source when exact current bytes match, or later from an
explicit exact Revision backing even while the active source remains `missing`
or `unbound`. Such backing changes neither active location nor source
availability. Gate 9 adds no backing table, byte reader, or automatic retention
policy.

## Read boundary

Gate 9 exposes bounded, same-snapshot domain reads sufficient for later
capabilities and its own evidence:

- list ordinary non-withdrawn Artifacts, with an explicit inclusive filter for
  withdrawn history;
- inspect one Artifact with immutable creation basis and admission root, exact
  disposition, current effective Revision and attribution basis, active binding,
  latest effective source-state basis/descriptor, source and lineage versions,
  and derived availability;
- look up one exact trusted canonical active location and return zero or its one
  binding owner plus current state, including a withdrawn owner whose binding
  still reserves the location;
- list and inspect immutable Revisions effectively attributed to one Artifact,
  distinguishing recorded and exact correction-member attribution;
- list binding episodes plus the recorded Artifact's one cross-binding
  Observation history and effective lineage intervals in stable order; and
- list exact Observation corrections and lineage-correction sets involving
  one Artifact.

Every collection uses fixed maximum page size, stable keyset order, and an
opaque cursor scoped to endpoint, parent Artifact, attribution view, and filters.
A cursor from another endpoint, Artifact, view, or filter fails. Exact active
location lookup is cardinality-bounded by its uniqueness constraint and does not
scan Artifact histories. Composite reads run in one database snapshot and do
not assemble a current pointer beside a Revision, lineage-correction set/member,
or binding from another committed state.

No Gate 9 read opens source bytes, searches directories, builds a candidate
manifest, compiles model context, emits model-readable content, or infers a
Course/material role.

## Implementation ownership

- A Repa learning-domain module in `packages/core` owns Artifact schemas, SQL
  tables, exact transition logic, errors, and bounded reads. It may depend on
  the native database and existing identity/schema utilities, but not on
  Session, providers, tools, terminal code, Course, Material Map, learner state,
  Agenda, filesystem services, or permission services.
- The Repa migration generator owns one forward migration from the accepted
  Gate 8 schema and the regenerated fresh-database schema. No pre-fork or
  inherited OpenCode material tables are imported or mirrored.
- The outer `packages/opencode` runtime receives no Artifact tool, prompt
  contribution, initialization command, root scan, TUI surface, or startup
  behavior in this Gate.
- Gate 10 must construct the trusted canonical location and exact observation.
  Gate 9 neither imports `FSUtil` nor accepts an arbitrary model path as
  authority.

Package/file names are implementation placement, not product ontology. A
single `Artifact` module with nearby schema, SQL, and cursor support is preferred
unless actual implementation pressure establishes another owner; no manager,
repository, generic provenance service, or compatibility layer is admitted.

## Failure behavior

- Invalid identifiers, malformed fingerprints, impossible Observation or
  correction shapes, unknown recorded/effective attribution, same-set overlap,
  mixed independent-admission roots, an unused proposed new target, a target
  outside exact correction ancestry, and a canonical location active elsewhere
  fail with typed domain errors and no state change. Active-location conflict
  identifies the exact owning Artifact/binding so Gate 10 does not create a
  second path authority.
- Stale disposition/source/lineage versions, active location, current Revision
  and attribution basis, Observation-correction predecessor, winning lineage
  member/boundary, or availability fail with current exact references; there is
  no automatic retry or last-write-wins merge.
- A caller cannot admit a missing placeholder, rebind without explicit trusted
  learner basis, turn a backup into a fallback, infer a lineage boundary from
  digest equality, or upgrade model prose into source identity.
- A `missing` active source cannot resolve through that live path, another digest
  match, an unregistered snapshot, or a future fetch. Live-source reads fail
  visibly until restoration or explicit rebind. A later explicit exact Revision
  backing may independently resolve that Revision without changing this failure
  or active-source availability.
- A database failure rolls back all Gate 9 rows and current pointers. An
  external failure before the transaction leaves no Gate 9 record; external
  success followed by database failure belongs to Gate 10 recovery and grants
  no implicit rebind.
- SQLite integrity/foreign-key admission detects physical and referential
  corruption only. Repa's public transitions prevent semantic inconsistency, but
  an out-of-band SQL edit that remains structurally valid is unsupported and may
  not be detected at startup. Gate 9 claims no generalized semantic-forensics or
  repair engine.
- Restart reloads all state from SQLite. No process-local Artifact identity,
  location, Revision attribution, availability, Observation correction, or
  lineage-correction truth exists.

## Explicit non-goals

- no content-root approval/revocation, directory inventory, candidate-manifest
  construction, symlink/junction containment, mutation-safe file read, file
  watcher, search, or automatic import (Gate 10);
- no readable representation, converter/OCR/model translation, retained source
  snapshot writer, canonical derived bytes, selector, Material Map, or Course
  alignment (Gates 11–12);
- no model-visible Artifact command, Session causal receipt, physical invocation
  replay, or exact tool result; a later model command reuses Gate 8;
- no remote URL acquisition, website mirror, content-addressed source cache,
  blob garbage collector, provider-specific media policy, or local-RAG system;
- no title/edition ontology, automatic role/classification, global digest
  deduplication, multi-location replica model, branch/merge/rebase system, or
  fuzzy semantic identity migration;
- no generic event/provenance/correction framework beyond the two source-local
  correction records required by this Gate;
- no Course, LearningSpace, learner record, Agenda, policy, context, progress,
  mastery, completion, or assignment state;
- no deletion of learner files, deep metadata deletion, automatic eviction, or
  retention lifecycle without a real retained-byte producer; and
- no bulk port of the pre-fork Markdown parser, material schema, Course coupling,
  source tools, labs, or tests.

## Closing evidence

Evidence must be able to falsify the owned boundary rather than only show rows
were inserted:

- one generated migration upgrades an existing Gate 8 database without changing
  Session, Course, or learning-command rows; fresh initialization produces the
  same Gate 9 schema and foreign keys;
- normal admission atomically creates one Artifact, exact Revision, one active
  binding, one `present` Observation, and current projection; missing or injected
  failure creates none;
- independently admitted Artifacts record distinct Revision IDs for identical
  raw bytes, while one canonical location cannot be active for two Artifacts and
  one Artifact cannot have two active bindings;
- same-location A→B preserves Revision A and every exact reference while making
  B current; A→B→A stores two Revisions and three state-changing observations,
  then points current state back to the original A Revision;
- repeated available-A with the same effective descriptor and repeated-missing
  Observations are exact no-ops with no new Observation or source-version
  increment; correcting `application/octet-stream` to `application/pdf` appends
  exact correction provenance, preserves the old detector result, updates a
  current descriptor once, and rejects stale correction reuse;
- available→missing retains the exact current Revision and fails live-path
  resolution; missing→same-A appends a restoration observation, while
  missing→different-C creates a new Revision under same-location continuity;
- source availability never becomes a global Revision-resolvability flag: Gate
  9 adds no backing row or byte fallback, and its contracts permit a later exact
  backing to resolve one Revision without changing a `missing` active source;
- explicit rebind closes the old binding and establishes exactly one new active
  location; digest discovery without application-bound learner intent cannot
  call that transition, stale rebind/update races leave the winner intact, and
  exact active-location lookup returns that owner—including a withdrawn owner—
  without scanning every Artifact;
- after X/A at path p is replaced unnoticed by Y/B and then Y/C, one exact
  lineage split before B attributes both B and C to one new Y Artifact, transfers
  the available or missing current binding/state when the interval reaches
  current, leaves X unbound at its pre-boundary effective Revision, and changes
  no old persisted reference;
- if the still-recorded X history explicitly rebinds from p to q between B and
  C, its global Observation ordinals remain one history; the initial correction
  still uses one member spanning both bindings and creates/assigns Y atomically,
  while injected failure publishes neither target nor partial attribution;
- an explicit same-byte source replacement after A can create Y from an empty
  Observation interval plus exact boundary state/Revision A; the split—not a
  fabricated filesystem Observation—supports Y's current projection, proving
  that ordinary byte no-op does not erase lineage correction and that digest
  equality does not merge X and Y;
- after a prior correction, a generated sequence of N legal Y rebinds remains one
  Y source-history interval and requires one Y member independent of N; a later
  atomic correction to Z uses only actually affected history ranges, while
  schema/API source audit finds no fixed member cap or copy-forward rule;
- independently admit P and Q, then propose bounded historical members from both
  histories with one fresh target R; exact common-root validation rejects before
  creating R, a correction set, or any version change, while a multi-history
  delta whose histories already share one correction root remains admissible;
- a bounded historical correction leaves current binding unchanged; same-set
  overlap, ambiguous ranges, stale lineage versions/winning bases, an unused new
  target, and a target outside exact ancestry fail, while a later delta can
  override a subrange or restore recorded attribution without erasing prior
  members;
- withdrawal/restoration survives restart, ordinary lists hide withdrawn
  Artifacts, restoration creates no source Observation, changes no recorded
  availability, performs no rebind, and stale source work fails across
  withdraw/restore ABA;
- every Artifact collection crosses the fixed page boundary without duplicates
  or omissions and rejects cursors from another endpoint, parent, attribution
  view, or withdrawal filter; recorded/effective correction reads and composite
  current reads remain one SQLite snapshot;
- a production-source audit finds no Artifact import path in Session tools,
  prompts, root bootstrap, TUI, filesystem services, or provider code; and
- focused Artifact authority, migration, and failure-injection tests plus Core
  typecheck, migration-generator, formatting, link, and diff checks pass. No
  provider call, full monorepo suite, real root traversal, or Gate 10 evidence is
  required.

## Design evidence provenance

The contract derives from the current fork and fixed local evidence:

- Gate 7's Core-owned domain/API, generated-migration, versioned withdrawal,
  scoped cursor, and same-snapshot read patterns, without copying Course
  semantics;
- Gate 8's distinction between application/domain state and durable
  model-command settlement;
- annotated tag object `3056c7855c349e421e26c2ffa8e9d677cfce801b`
  (`repa-prefork-oracle`), peeled commit
  `db1ffdc4c84d52299c96e25121a776f7720ff9f2`, especially
  `labs/source-reference-anchor/source-reference.ts`,
  `labs/source-reference-anchor/source-reference.test.ts`, and
  `docs/research/source-reference-revision-2026-07-11.md`: it preserves the
  invariant that a mutable live path cannot stand in for exact content already
  cited, while its SHA-256 marker, Markdown parser, workspace-derived identity,
  and old schema are deliberately not production designs;
- inherited `packages/core/src/snapshot.ts`, whose content-addressed Git-tree
  behavior originated at commit
  `9bb5370205283688cc653eec5255c7c2b93cfd94`: Gate 9 preserves only the
  demonstrated separation between captured content identity and a mutable
  current filesystem view. It deliberately does not import the project-scoped
  Git repository/tree, capture/restore API, best-effort failure, untracked-file
  size limit, or project ownership, and it creates no retained-byte producer;
  and
- the inherited generic read and tool-output mechanisms as negative evidence:
  they can observe or temporarily retain bytes but do not provide learning-domain
  Artifact identity, revision lifetime, location correction, or provenance.

No external source file, oracle worktree, pinned reference checkout, or generic
tool output becomes a production dependency.

## Implementation candidate and evidence

The maintainer authorized implementation after contract/theory acceptance. The
independently accepted implementation candidate is confined to Core:

- `packages/core/src/artifact.ts` and nearby `artifact/{schema,sql,cursor}.ts`
  own trusted inputs, stable IDs, all legal transitions, exact conflicts,
  snapshot reads, recorded/effective attribution, and bounded cursors;
- generated migration `20260716152016_source_artifact_authority` adds the eight
  Artifact record families and constrained indexes, while regenerated fresh
  schema and migration registration retain one native database lineage; and
- `artifact-authority.test.ts` plus the Gate 9 additions to
  `database-migration.test.ts` exercise the contract counterexamples, atomic
  failure, restart, cursor scopes, fresh/upgrade equivalence, and non-fabrication.

The first implementation/evidence pass returned `Revise` for three realization
defects and two coupled evidence gaps. The repaired candidate resolves an
immutable corrected Revision through its exact member after supersession,
preserves a cross-recorded Revision's stored attribution through effective and
historical reads and fallback projection, and gives all four lineage-boundary
IDs physical foreign keys with negative migration probes. The original reviewer
replayed those counterexamples and closed `G9-I01`–`G9-I03` and
`G9-E03`–`G9-E04` without a replacement issue.

Fresh focused evidence on the repaired candidate passed:

- 13 Artifact authority tests with 133 assertions;
- 21 database migration tests with 86 assertions;
- 11 directly adjacent Course, Course pagination, and learning-command tests
  with 167 assertions;
- Core typecheck and migration-generator incremental/full equivalence checks;
- production Artifact source lint with no warning or error; and
- source audit finding no Artifact import in Session tools, prompts, root
  bootstrap, TUI, filesystem services, provider code, or any production owner
  outside the Artifact module and generated database registration.

An optional broad Core test run was also attempted on the current Windows host.
It is not claimed passing: existing parallel tests contended for shared database,
credential, permission, and environment state and returned unrelated
`DatabaseBusyError` and duplicate-state failures. No Gate 9 focused or adjacent
test failed when rerun in its owning boundary. The accepted evidence contract
does not require that unrelated monorepo-wide campaign, and this record does not
promote the invalid broad run into either green evidence or a Gate 9 defect.

The original independent reviewer accepted implementation/evidence on
2026-07-16. That acceptance establishes review readiness only; it does not
authorize staging, a commit, publication, or Gate 10 work.

## Review status and remaining boundary

Original top-level reviewer task `019f6ae7-fff2-7800-9d7b-023cf918e201`
accepted the contract/theory layer of review run
`gate9-contract-406beb29cd4e4ec4bb24725fb4d103f8` on 2026-07-16 after
closing `G9-C01`–`G9-C08` and `G9-E01`–`G9-E02`. The accepted reviewed snapshot
had SHA-256
`ffff7b05196e6e167383aa937b525969d7a81e593de805aa5094fa50ddeb5be0`;
this status/provenance update changes no contract rule.

The explicitly invoked `independent-review-loop` preserved that reviewer through
the implementation/evidence closure pass. It independently closed `G9-I01`–
`G9-I03` and `G9-E03`–`G9-E04`, then returned `Accept` with no new
acceptance-changing finding. Both review layers are closed. The working tree is
integrated at implementation commit `41db7c292`; this closes Gate 9 without
authorizing or starting Gate 10. A later material contract revision reopens
contract/theory review.
