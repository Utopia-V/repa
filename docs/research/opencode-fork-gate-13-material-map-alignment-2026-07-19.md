# OpenCode fork Gate 13: Material Map and Course alignment

Status: Contract/theory and implementation/evidence accepted by independent
review run `gate13-whole-20260719-01`. `G13-CT-001` through `G13-CT-006` and
`G13-IE-001` through `G13-IE-003` are closed, with no new acceptance-changing
implementation finding. Gate 13 remains open only because the accepted snapshot
has no closing commit.

Date: 2026-07-19

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Primary predecessors:
[passed Gate 7 Course and Course View authority](opencode-fork-gate-07-course-view-authority-2026-07-15.md),
[passed Gate 9 source and Artifact authority](opencode-fork-gate-09-source-artifact-authority-2026-07-16.md),
[passed Gate 10 content-root authority](opencode-fork-gate-10-content-root-authority-2026-07-17.md),
and
[passed Gate 11 readable Representation lineage](opencode-fork-gate-11-readable-representation-lineage-2026-07-17.md)

Deferred model-write dependencies:
[passed Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md)
and
[passed Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md)

Successor boundary: Gate 17 may later expose natural-language, model-initiated
Material Map and alignment writes through Gate 8 and Gate 12. Gate 18 may
compose bounded current-use projections. Neither surface is part of Gate 13.

This record owns the proposed Gate 13 engineering contract. Product behavior
and expensive boundaries under **Accepted maintainer decisions** come from the
maintainer and accepted project authority. Selector encoding, physical records,
CAS details, query shape, and evidence are derived engineering proposals. A
fresh separate top-level reviewer may reject or revise those derivations. Only
the maintainer or an owning product/roadmap decision may change the accepted
product meaning.

## Terminology

A **Material Map snapshot** is one immutable authored outline plus exact
selectors bound to one exact material target. Its `MaterialMapID` is the
snapshot identity; Gate 13 does not introduce a stable Map series, revision
number, working pointer, preferred pointer, or canonical Map.

A **material target** is exactly one of:

- an exact Gate 9 Artifact Revision under its exact effective Artifact and
  AttributionBasis; or
- an exact Gate 11 Representation Revision.

A **selector** is a versioned, target-specific coordinate that resolves only
against the exact target of its owning Map. It is not an inherited read-tool
line number, filesystem path, storage key, semantic chunk, search hit, or
fuzzy anchor.

An **alignment** is a neutral, correctable relation between one exact selector
in one exact Map snapshot and one exact Gate 7 Course View Revision membership
`(Course, View, Revision, Item)`. Multiple relation rows give many-to-many
cardinality in both directions.

**Current-use resolution** means returning exact selected content for an
ordinary teaching or learning move after the Map authority revalidates that the
owning Map is active and the Artifact or Representation authority revalidates
current eligibility. Historical metadata inspection and historical byte access
are different capabilities.

## Why this Gate exists

Gate 9 can say which exact original bytes were observed. Gate 10 can read an
authorized stable local source. Gate 11 can retain and read exact typed
representations. Gate 7 can name an exact Course View Revision and item
membership. None of them owns these remaining meanings:

- an authored material outline that does not become a Course route;
- an exact semantic-use range within an original or representation revision;
- an optional relation between that range and exact Course membership; or
- correction of either structure without retargeting old references.

Gate 13 serves this part of the product loop:

```text
exact usable Artifact or Representation Revision
-> immutable Material Map outline and exact selectors
-> optional neutral alignment to exact Course membership
-> later Tutor behavior may lazily resolve the exact selected material
```

It does not choose a teaching move, compile model context, create or select a
Course route, infer prerequisites, or expose a model write.

Its owned invariant is:

> Every Material Map snapshot is immutable and binds one nonempty ordered
> outline plus validated exact selectors to one exact Artifact Revision or
> Representation Revision. No source path, working Course selection, newer
> source/representation, or successor Map can retarget it. Zero or more
> neutral alignments may independently bind its exact selectors to exact Course
> View Revision item memberships. Map and alignment correction creates explicit
> successor records while retaining history; independent alternatives may
> coexist and no canonical or working Map exists. Current-use resolution
> revalidates the owning material and Course authorities and fails closed on
> drift or unavailability. Historical identity remains inspectable without
> pretending unavailable bytes are readable.

## Accepted maintainer decisions

The following decisions were accepted during the 2026-07-19 Gate 13 grill.
They are recorded by consequence rather than as an interview transcript.

### Alignment is neutral and exact

The first alignment means only that one exact selected material range is
associated with one exact Course membership. It carries inspectable
authorship/provenance and a reason, and it is correctable.

It does not encode `teaches`, `requires`, `assesses`, prerequisite strength,
material completeness, learner mastery, evidence, or scheduling priority. It
does not imply that source order is a Course route or that aligned items must be
studied in selector order. Adding pedagogic relation kinds requires a later
consumer and evidence that the closed neutral relation cannot preserve the
needed distinction.

### Several immutable Maps may coexist without a preferred pointer

The same exact material target may have several independent immutable Material
Map snapshots. Gate 13 does not select one as canonical, current, working,
preferred, or latest.

A correction creates a new snapshot that explicitly names the exact Map it
supersedes. The predecessor remains readable. A separately authored alternative
has no supersession claim. Several successors or independent alternatives may
coexist; discovery reports that plurality instead of silently choosing one.

Every alignment binds one exact Map and selector. A successor Map does not copy,
retarget, or invalidate an old alignment. Realignment is a separate explicit
relation transition.

### Gate 13 stops at a trusted domain authority

Gate 13 establishes persistence, legal transitions, exact reads, correction,
CAS, and failure behavior behind a trusted application capability. It adds no
model-visible tool or command, no natural-language authoring path, and no
automatic Map or alignment generation or acceptance.

In the derived sections below, **acceptance** means the atomic commit of one
explicitly authorized proposal after exact validation. It does not mean
background generation, semantic-quality inference, or automatic promotion of a
model/parser candidate.

Gate 17 may later expose model-initiated authoring. That future path must reuse
Gate 8 physical/causal settlement and Gate 12 exact Turn/input/model/tool
registration while leaving Material Map semantic identity, validation,
correction, and transaction effects owned here.

## Decision provenance and revision authority

| Material decision                                                      | Authority and reason                                                                                                                                                                                                                     | May revise it                                                                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Neutral selector-to-Course-membership alignment                        | Maintainer, 2026-07-19. The first consumer needs exact grounding, while historical task-alignment evidence shows that `teaches/requires/assesses` introduces ambiguity, disjunction, and false pedagogic claims.                         | Maintainer or a revised roadmap/architecture owner after a concrete consumer and falsifying evidence.                     |
| Multiple immutable Map snapshots; no canonical/working/preferred Map   | Maintainer, 2026-07-19. Independent interpretations must coexist and a source or Course pointer must not silently choose among them.                                                                                                     | Maintainer or a revised Material Map owner with a demonstrated selection consumer and explicit lifecycle.                 |
| Explicit supersession for correction; exact alignments do not retarget | Maintainer, 2026-07-19, plus accepted revision/correction policy in ADR-0012 and Gates 7/9/11. History must remain inspectable and correction cannot rewrite old meaning.                                                                | Maintainer for product semantics; an accepted contract review may revise only the derived physical encoding.              |
| No Gate 13 model-visible write; defer it to Gate 17                    | Maintainer, 2026-07-19, consistent with Roadmap 09. Gate 8/12 are available mechanisms but do not earn a new product surface by themselves.                                                                                              | Maintainer or roadmap owner before implementation of a new model-facing path.                                             |
| Exact selectors belong to Material Map, not source/artifact            | Native data-model owner, later Gate 9/11 contracts and implementation evidence, and the corrected architecture owner. Artifact owns exact content identity; Representation owns exact readable records; neither owns semantic selection. | Accepted architecture/data-model revision. A lower implementation layer may not move the boundary.                        |
| Closed target/profile-specific selector family                         | Derived from the 2026-07-19 selector probe and actual Gate 10/11 readers. A universal character offset is under-specified across raw bytes and existing canonical profiles.                                                              | Fresh contract reviewer or later evidence from an admitted target/profile; product meaning remains exact and fail-closed. |

## Current evidence and falsification pressure

### Accepted project authority

- The product foundation requires source-grounded teaching inside the wider
  learning loop without making retrieval or practice the product center.
- ADR-0012 separates source/artifact, Course View, Material Map, learner record,
  Agenda, and Tutor policy and rejects a universal graph/fact table.
- The native data-model owner gives exact selectors to Material Map and makes
  alignment optional, many-to-many, and revision-bound.
- Roadmap 09 places Gate 13 after the independent Course and material identity
  branches and explicitly excludes route equality, mandatory alignment,
  automatic generation/acceptance, and RAG/indexing.

The older architecture authority table and module sketch assigned `selector`
to source/artifact. Later text in the same document, the native data model,
Gate 9, Gate 11, and Roadmap 09 consistently assign exact material selectors
to Material Map. Git history confirms that the table predates the later owned
boundary. This contract corrects the stale owner wording rather than treating it
as a competing product decision.

### Actual closed predecessors

- Gate 7 implementation `3bd6eb9d4` supplies exact
  `(course_id, view_id, revision_id, item_id)` membership, independent
  Course/View/Revision/selection versions, immutable old revisions, and
  bounded reads. Working selection is not Course truth and never follows a new
  revision automatically.
- Gate 9 implementation `41db7c292` supplies immutable Artifact Revision IDs,
  fingerprints, exact effective Artifact attribution, ordinary-use state, and
  correction without retargeting. It deliberately opens no source bytes.
- Gate 10 implementation `fb6ed5763` supplies authorized mutation-safe local
  reads and immutable disclosure receipts. It owns roots and reads, not
  Artifact or selector meaning.
- Gate 11 implementation `bdbfa0c05` supplies immutable Representation
  Revisions, exact profiles, managed integrity, and distinct `CurrentUseReader`
  and `HistoricalReader` capabilities. It expressly leaves passages,
  noncontiguous selection, outlines, and Course relations to Gate 13.
- Gate 8 implementation `293ff6892` and Gate 12 implementation `80f5fa30a`
  supply the later model-write settlement and Turn registration mechanisms.
  Their current settlement schema is deliberately closed rather than a generic
  command registry. Gate 8 also proves the narrower computational ordering used
  here: an exact durable duplicate discovered after asynchronous work outranks
  a captured cancellation or stale result. Gate 13 reuses that ordering without
  creating a Gate 8 invocation or model-write surface.

Current production contains no Material Map, selector, or Course-alignment
schema or service. Gate 13 is a new learning authority, not completion of an
inherited partial module. This evidence preserves the Roadmap 09 number and
dependency boundary; it does not require reopening Gates 7–12.

### Selector/read pressure probe

The bounded 2026-07-19 probe asked whether one durable character-offset model
could honestly select content from all currently admitted targets without a
new content projection. It used only the production Gate 11 profile encoders,
created no external dependency, and deleted its temporary source immediately
after the result.

For source text containing decomposed `e` + accent, a non-BMP symbol, and CRLF,
the original had 10 UTF-16 code units, 9 Unicode scalar values, and 13 UTF-8
bytes. Gate 11 normalization produced 8 UTF-16 code units, 7 scalar values, and
11 bytes. The PDF profile additionally retained two separate text items and a
`lineBreakAfter` boundary, while the model profile retained one normalized
document rendition.

The falsified candidate was a universal `start/end character` selector. It
cannot say whether offsets address original bytes, UTF-16, Unicode scalar
values, normalized text, a flattened PDF page, or item structure. Flattening
the PDF records would invent a new unowned representation. The selected design
therefore uses a closed target/profile-specific selector family and makes
noncontiguous selections a set of exact selectors rather than a magic range.

### Mature mechanisms and historical counterexamples

The [W3C Web Annotation Selectors and States](https://www.w3.org/TR/selectors-states/#selectors)
model usefully separates a source from a selector and supports media-specific,
refined selectors. Gate 13 preserves those computational distinctions. It does
not copy RDF/IRI identity, an open selector registry, quote-based fuzzy
reattachment, or Web Annotation's package topology because exact Repa revisions
already own target state and correction.

The pre-fork oracle is evidence, not implementation material:

- its Markdown path derived Course items and material alignments together from
  headings and line ranges, making material structure and the Course route one
  generation path;
- its working route and aligned ranges moved together during Markdown
  realignment; and
- its typed task-alignment experiment showed that a flat
  `teaches/requires/assesses` edge vocabulary misrepresented a disjunctive
  requirement and could produce high-confidence false edges.

Gate 13 keeps only the demonstrated needs: exact revision binding, bounded
reads, fail-closed drift, many-to-many cardinality, visible provenance, and
explicit correction. It rejects path/line identity, coupled route generation,
automatic acceptance, and the old physical schema.

## Proposed Gate result

After Gate 13:

- one exact Artifact or Representation Revision can have zero or more
  independent immutable Material Map snapshots;
- every Map atomically owns a nonempty ordered forest and a nonempty set of
  validated exact selectors;
- every selector uses one closed, versioned coordinate system justified by its
  exact target and profile;
- Map correction and independent alternatives preserve history without a
  canonical or working pointer;
- a Map is valid with zero Course alignments;
- one selector may align to several exact Course memberships and one Course
  membership may align to selectors in several Maps;
- every alignment is neutral, provenance-bearing, reason-bearing, immutable in
  meaning, explicitly correctable, and reversibly withdrawable;
- current-use selector resolution reuses Gate 9/10 or Gate 11 admission and
  never bypasses storage, authorization, drift, or availability truth;
- working Course replacement, source drift, retranslation, withdrawal,
  restoration, and successor Maps never retarget old records; and
- bounded bidirectional queries expose exact current and historical state
  without compiling Tutor context or indexing content.

This is a durable material-grounding boundary, not a learner-visible product
loop.

## Identity and state vocabulary

### Exact material target

An Artifact target stores:

- exact effective `ArtifactID`;
- exact `ArtifactRevisionID`;
- exact Gate 9 `AttributionBasis`; and
- an immutable target snapshot of the Revision fingerprint and the media type
  accepted at Map creation for audit and selector validation.

The Gate 9 rows remain authoritative. The copied fingerprint/media facts are a
creation receipt and must match the owning authority at Map acceptance; they do
not become a second source projection. A later Gate 9 media correction that
preserves the same exact Revision, AttributionBasis, and bytes does not mutate,
retarget, stale, or invalidate the Map or its byte selectors. Current-use
resolution revalidates ordinary eligibility and exact Revision/Attribution/
fingerprint, not continued equality with the historical media receipt.

A Representation target stores the exact `RepresentationRevisionID`. Its
Gate 11 record supplies the exact source proof, profile, digest, and
availability. Map reads may project those facts but may not duplicate or
reinterpret their authority.

Exactly one target arm is populated. An Artifact path, ContentRoot, binding,
working source pointer, Representation storage key, profile name, or digest
alone is not a target identity.

### Material Map snapshot

One snapshot owns:

- one trusted-application-minted `MaterialMapID` known before preparation or
  dispatch;
- exact material target;
- immutable trusted-application authorship receipt;
- optional exact predecessor `supersedesMapID`;
- creation time from the trusted clock;
- immutable ordered outline nodes and selectors; and
- versioned reversible withdrawal state kept separately from immutable
  content.

The predecessor may target the same or a different exact material revision.
Cross-target supersession records an explicit correction or re-map; it never
reuses selector identity, moves alignments, or makes old bytes current. One
snapshot names at most one predecessor, but a predecessor may have several
successors because Gate 13 has no branch-selecting pointer.

### Authorship receipt

Map and alignment creation require an opaque trusted-application capability
with a nonempty bounded basis plus capability identity/version. The capability
is not serializable proposal data and is bound to the prepared operation. A
model-shaped payload, filesystem content, title, reason, or caller-supplied
string cannot mint or upgrade it.

At Gate 13 this receipt means only that the trusted application admitted the
write under the recorded basis. It is not proof of a learner Message, model
invocation, causal acceptance, or source truth. Gate 17 must add exact Gate
8/12 causality for model-issued writes rather than relabel these receipts.

### Selector and outline identity

Every selector has a generated `MaterialSelectorID` and belongs to exactly one
Map snapshot. Every outline node has a generated `MaterialOutlineNodeID` and
belongs to exactly one Map snapshot. These identities never cross Map
snapshots, including a superseding snapshot with textually identical content.

### Alignment identity

Every alignment has one trusted-application-minted
`MaterialCourseAlignmentID` known before preparation or dispatch, one selector
endpoint, one exact Course membership endpoint, an immutable authorship receipt
and reason, optional exact `supersedesAlignmentID`, creation time, and separate
versioned withdrawal state.

Endpoint equality does not merge independent authoring episodes. Reusing one
identity with the same canonical proposal is exact replay; reusing it with
different content is a conflict. No digest or endpoint tuple becomes the
semantic identity.

### Stable authoring identity and exact replay

The final Map or alignment ID is minted by the trusted application before any
source I/O, Course preparation, or database dispatch. It is the stable identity
of that authoring episode, not a commit-generated result. Callers retain it
across cancellation, transport loss, and restart and can reconcile through an
exact-ID query.

A Map's canonical creation proposal contains its exact requested target,
complete normalized ordered outline and selector coordinates, optional
predecessor, and immutable authorship basis/capability identity and version. A
selector witness, target receipt, and creation time are acceptance-derived and
are not caller-chosen replay fields. An alignment's canonical creation proposal
contains its exact endpoints, required reason, selection basis and observed
selection tuple when present, optional predecessor, and immutable authorship
basis/capability identity and version. Its fresh content receipt, mutable
expected versions, and creation time are acceptance preconditions, not semantic
input that can turn an already committed operation into a conflict.

Creation checks the exact ID before target/content preparation or live endpoint
revalidation. If the row exists, identical canonical input returns the stored
immutable acceptance result together with its current disposition even when
current eligibility later changed; replay never claims current usability.
Different input fails as conflicting reuse. If the ID does not exist,
preparation and commit continue. The commit repeats the same identity comparison
so concurrent exact retries produce one row and one frontier advance. Different
IDs remain distinct independent authoring episodes even when every canonical
field is identical.

Once the initial identity lookup reports absence, every later preparation,
cancellation, validation, target/Course stale, or precommit database failure is
only a captured candidate outcome. Before returning it, the create operation
performs one short uninterruptible durable reconciliation by the exact final ID
and canonical input:

- an identical committed row returns its stored immutable acceptance result and
  current disposition, overriding the captured failure;
- a committed row with different canonical input returns conflicting reuse;
- only an ID still absent at that reconciliation point may return the captured
  failure; and
- if durable reconciliation itself cannot establish committed/absent state, the
  caller receives typed `outcome_unknown` with the exact ID and must query or
  retry, never a false no-effect result.

The reconciliation needs no prepared target proof, current source bytes,
Course eligibility, or active endpoint. A process-local same-ID coordinator may
coalesce work as an optimization, but cannot replace this durable final check.
The final check supplies the linearization point for a failed attempt racing a
separate successful attempt.

## Target admission and content access

### Prepared target proof

Map acceptance never trusts raw proposal bytes or self-asserted target facts.
After exact-replay resolution, a target-specific preparation capability
validates selectors outside the database transaction and returns an opaque
one-operation proof bound to the exact `MaterialMapID`, canonical proposal, and
target snapshot. Acceptance consumes that proof and revalidates the mutable
facts that make current admission legal.

No SQLite transaction remains open while reading a source, scanning a managed
Representation object, decoding a profile, calculating selector witnesses, or
waiting for cancellation.

### Original Artifact target

The first Artifact path composes existing Gate 9/10 public behavior:

1. load the exact current effective Artifact and require ordinary-use
   eligibility;
2. require the requested exact Revision and AttributionBasis to equal its
   current ordinary-use snapshot, and capture the full expected Gate 9 source
   state including active Binding ID, canonical location, source version, and
   effective descriptor;
3. resolve one sealed learner-authorized ContentRoot, Binding/Grant episode,
   and normalized relative path selected by the application rather than the Map
   proposal, and require that exact path to resolve to the captured active
   Artifact location;
4. if overlapping roots can reach that location, require the exact inherited or
   explicitly learner-selected provenance episode; without one unique named
   episode fail `ambiguous_content_root`, never choose by path length, lexical
   order, inventory order, or equal digest;
5. perform one bounded Gate 10 stable read and preserve its exact root/binding/
   grant/read receipt;
6. construct the Gate 9 observation only from that read result and commit it
   against the captured full expected source state; a different path containing
   equal bytes is not an observation of this Artifact and cannot restore its
   availability;
7. require the exact fingerprint, length, media type, effective Artifact,
   Revision, AttributionBasis, lineage version, and ordinary disposition to
   match; and
8. validate every Artifact selector against that exact byte buffer.

Revocation, rebind, grant drift, a missing active source, or a path that no
longer resolves to the captured binding fails that named episode without
fallback. Wrong-path/equal-bytes reads create neither a Gate 9 observation nor a
Map. The preparation proof binds the active Artifact source location to the
exact Gate 10 episode and relative path; a fingerprint alone never supplies
that provenance.

Gate 10 currently returns one complete bounded file observation rather than a
ranged file handle. Gate 13 therefore admits an original target only when the
exact bytes fit the explicit preparation budget. It does not bypass Gate 10 or
invent a ranged reader. A too-large source fails typed and may instead receive
an admitted Representation; a later consumer-earned ranged source capability
would require an explicit predecessor-boundary revision.

The stable-read authorization receipt remains immutable provenance. As in Gate
11, revocation after authorized disclosure does not retroactively erase the
buffer, while cancellation or disclosure may win. Final acceptance revalidates
Gate 9 ordinary target facts; it does not require the old root episode to stay
active after disclosure.

### Representation target

Preparation receives only Gate 11 `CurrentUseReader`, never raw managed storage
or `HistoricalReader`. It requests the exact Representation Revision and exact
effective Artifact, verifies complete-object integrity under an independent
scan ceiling, reads only complete declared profile records, and retains the
current-use admission basis and mutable versions for final revalidation.

Several selector reads in one preparation must describe one coherent target
and Gate 11 admission generation. A disposition, source, attribution,
availability, or continued-use-grant version change discards all buffered
content and requires a fresh preparation.

The current Gate 11 PDF reader returns verified complete page-record bytes but
does not expose its internally decoded page/item structure. Gate 13 may add one
narrow `repa.pdf-text.v1` profile decoder for an already verified contiguous
page-record sequence, or an equivalent typed result from the same profile
owner. It must reuse the canonical Gate 11 validation rules, require the exact
starting page and complete sequence, and reject trailing, missing, reordered,
or noncanonical records. It does not create a parser registry, new
Representation profile, storage bypass, or second integrity owner.

If current Gate 9/11 public results cannot be revalidated inside the final Map
transaction without reproducing private predicates, their owners may expose a
narrow opaque prepared-proof revalidation hook. That is a consumer-earned API
for the already accepted ordinary-use/availability invariant, not authority for
Material Map to reinterpret Artifact or Representation state.

### Historical access

Map and selector metadata remain inspectable after drift, withdrawal,
supersession, source loss, or Representation deletion.

- An old raw Artifact Revision is readable only if the active source still
  resolves to those exact bytes or a future accepted retained-revision backing
  exists. Gate 13 does not create that backing and never substitutes future
  bytes at the old path.
- An old Representation Revision may be read through Gate 11
  `HistoricalReader` only by an explicit audit/inspection capability and only
  while its accepted object remains verifiable.
- A current Tutor/material consumer receives only current-use resolution. It
  cannot pass a `historical=true` flag to one common byte-returning method.
- A withdrawn Map remains available for exact metadata inspection. Selector
  content for audit, when the underlying bytes are honestly available, requires
  a distinct explicit audit capability; it cannot be obtained through the
  Tutor current-use resolver or by relabeling `HistoricalReader`.

### Current-use selector resolution

Current-use resolution first requires the exact owning Map to be active and
captures its disposition version before content I/O. Artifact resolution then
repeats the exact active-location-to-Gate-10-episode composition above under
fresh budgets: require the exact ordinary-use target, perform an authorized
stable full-byte read, admit only that source-bound observation through Gate 9,
capture the resulting exact Revision/AttributionBasis/fingerprint and ordinary
mutable versions, then retain only the exact selected bytes after witness
verification. It uses the current Gate 9 media descriptor to construct and
validate the observation but does not compare it with the Map's creation-time
media receipt. A detected same-path change may append Gate 9 observation truth
before the old selector fails; it creates no Gate 13 state and never returns the
new bytes under the old target.

Representation resolution translates the persistent selector only into the
existing exact Gate 11 read operations:

- `whole_target.v1` uses `whole`;
- `pdf_page_range.v1` and `pdf_text_range.v1` use `pdf_pages` from the exact
  first page with enough record/return budget to cover the exact end page, then
  the profile-owned contiguous-record decoder above; and
- `model_text_range.v1` uses `model_document` and the existing canonical model
  profile decoder.

If Gate 11 returns a prefix that does not reach the selector end, Gate 13
returns a typed budget failure and no partial selected content. It verifies the
persisted witness after profile decoding and before returning. It never changes
the selector because another read budget, Representation, or profile could
produce a more convenient result.

After either target path has buffered and witness-verified content, one short
final SQLite transaction requires the same exact active Map and disposition
version and invokes the Gate 9 or Gate 11 owner revalidator for the captured
current-use target state. Artifact revalidation uses exact ordinary eligibility,
Revision, AttributionBasis, lineage/disposition versions, and immutable
fingerprint; it deliberately excludes equality with the historical media
receipt. If Map withdrawal, withdrawal/restore ABA, or target drift won, the
buffer is discarded and current use fails. If final revalidation wins, that is
the current-use disclosure linearization point; a later Map or target change
does not retroactively retract bytes already admitted. Audit content access has
its own capability and does not use this active-Map precondition.

## Closed selector algebra

All offsets are nonnegative safe integers, ranges are nonempty unless the
selector is `whole_target`, and every end boundary is exclusive except the
explicitly inclusive PDF page number shown below. Every selector stores its
algorithm/version and a SHA-256 witness over the exact selected canonical
bytes or Gate 13 selection serialization. Acceptance recalculates the witness;
resolution recalculates it after the owning reader verifies the target.

| Selector kind            | Legal target                                     | Exact coordinate and validation                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whole_target.v1`        | Any admitted Artifact or Representation target   | Selects the complete exact target object. Empty original bytes are rejected. The owning Gate 9 fingerprint or Gate 11 output digest is the witness.                                                                                                                                                                              |
| `artifact_byte_range.v1` | Exact Artifact Revision                          | Half-open `[start_byte, end_byte)` into the exact original byte buffer, plus selected-byte digest. It makes no UTF-8, line, normalization, or document-structure claim.                                                                                                                                                          |
| `pdf_page_range.v1`      | Representation profile `repa.pdf-text.v1`        | Inclusive `[start_page, end_page]` over complete mechanical page records, plus digest of their ordered canonical record bytes. Page numbers are one-based. No rectangle, reading-order, formula, figure, or image claim is implied.                                                                                              |
| `pdf_text_range.v1`      | Representation profile `repa.pdf-text.v1`        | Start and end endpoints `(page, zero-based item index, Unicode-scalar offset)` in ordered normalized PDF text items. Start is inclusive and end exclusive. The witness is computed over a versioned structured sequence of selected item fragments and intervening `lineBreakAfter` facts, not a silently flattened page string. |
| `model_text_range.v1`    | Representation profile `repa.model-rendition.v1` | Half-open Unicode-scalar range in the exact normalized `rendition` field, plus selected-text digest. Uncertainty and omission arrays remain Representation metadata and are not selectable prose.                                                                                                                                |

Unicode scalar offsets are counted after the exact profile's existing NFC and
line-ending normalization. They are not UTF-16 code units, UTF-8 bytes,
grapheme clusters, terminal columns, or source-document coordinates. Gate 13
does not normalize original Artifact bytes.

A noncontiguous passage is represented by several selectors attached in
explicit order to the same outline node. There is no recursive union,
intersection, subtraction, quote-search, regular expression, CSS/XPath, PDF
rectangle, open JSON extension, or plugin-selected selector kind in this Gate.

An unknown future Representation profile may use `whole_target.v1` when Gate
11 can return the complete exact object. It receives no finer selector until
its owning profile establishes inspectable mechanical coordinates and an
accepted contract extends this closed family.

Read budgets change whether resolution succeeds and how callers page through
records. They never truncate, widen, or reinterpret a persisted selector.

## Material Map outline

One Map proposal is accepted atomically as a bounded nonempty ordered forest:

- node IDs and selector IDs are unique inside the proposal and owned by the
  new Map;
- each node has a nonempty bounded title, optional parent in the same Map,
  contiguous preorder position, and structurally valid depth;
- each selector belongs to exactly one node and has an explicit position
  within that node;
- every leaf owns at least one selector; an internal grouping node may own none;
- the Map owns at least one selector overall; and
- every selector validates against the one exact Map target under the closed
  algebra above.

Selectors may overlap, repeat the same content under distinct selector
identities, omit parts of the target, or select the whole target. Gate 13 does
not infer a partition, completeness, topic ontology, or preferred granularity.
Limits on total nodes, selectors, depth, titles, and canonical proposal bytes
are fixed in the public contract and reject over-budget input without partial
acceptance or silent truncation.

Outline order is authored material organization within that Map. It is not a
Course View order, prerequisite order, Tutor action sequence, learner route,
Agenda priority, or evidence of understanding.

A superseding Map is a complete new snapshot. It cannot borrow mutable node or
selector rows from its predecessor. Textual or coordinate equality does not
reuse identities, and no old alignment follows it automatically.

## Neutral Course alignment

### Exact endpoints

One alignment relates:

```text
(MaterialMapID, MaterialSelectorID)
<->
(CourseID, ViewID, CourseViewRevisionID, CourseItemID)
```

The material foreign key proves that the selector belongs to the named Map.
The Course foreign key proves that the item is a member of the named exact View
Revision under the named Course and View. An Item ID without exact membership,
a View without a Revision, or a working-selection pointer is not an endpoint.

One selector can have several alignment rows to different memberships. One
Course membership can have rows from several selectors, Maps, Artifacts, or
Representations. A Map with no alignment and a Course with no aligned material
are both valid.

Creating or correcting an alignment also requires a fresh opaque current-use
resolution receipt for the exact selector. Exact foreign keys prove identity
but do not prove that an author could still inspect the selected content.
Preparation resolves and witness-verifies the selector outside the database
transaction; final acceptance revalidates the material admission versions.
Unavailable historical metadata alone cannot ground a new current alignment.
Later drift does not erase an already accepted relation.

### Course-owned endpoint proof

Course endpoint preparation is owned by Gate 7. It returns an opaque exact
membership proof carrying:

- exact `CourseID`, `ViewID`, `CourseViewRevisionID`, and `CourseItemID`;
- expected Course, View, and Revision state versions and their active/eligible
  status;
- immutable proof that the Item is a member of that exact Revision; and
- only for `observed_working`, the exact selected Revision and selection
  version.

Revision membership is immutable and has no independent state version. Gate 13
must not invent one. Gate 7 may expose one narrow consumer-earned transaction
revalidator, analogous to its existing owner-private eligibility checks: given
the shared SQLite transaction and opaque expected proof, the Course owner
checks active Course/View/Revision state, their three real versions, exact
immutable membership, and the optional working-selection tuple. It mutates no
Course state and exposes no tables or private predicates. Material Map calls
that owner function inside its alignment transaction; it may not reproduce the
Course predicates through separate reads or create a generic cross-domain
transaction abstraction.

### Meaning and provenance

An alignment has no relation-kind column in Gate 13. Its required bounded
reason explains why the trusted author associated the exact endpoints; it is
inspectable provenance, not an executable prerequisite or proof of pedagogic
truth. The authorship receipt remains separate from the reason so proposal text
cannot claim trusted origin.

The proposal records whether the Course endpoint was chosen as:

- `explicit_exact`, independent of the working selection; or
- `observed_working`, with the exact observed working Revision and selection
  version.

Both cases persist the same exact membership. `observed_working` adds a CAS and
provenance fact; it does not make the relation follow future working changes.
An explicit exact relation may target any eligible candidate, working, or
historical Revision. New relations cannot target a withdrawn Course, View,
Revision, or missing membership.

### Correction, withdrawal, and replacement

Correction creates a complete new alignment and may change either endpoint or
the reason. It names the exact predecessor and preserves both records. A source
Revision change, successor Map, or Course View replacement can therefore be
addressed explicitly without retargeting the old relation.

Independent alternative alignments have no predecessor. A predecessor may
have several successors; Gate 13 does not choose among them. Current discovery
can exclude superseded records while an exact/history read exposes the full
branch.

An alignment may be reversibly withdrawn with a bounded reason and expected
state version. Restoration makes only that exact relation discoverable again;
it does not restore, select, or make usable either endpoint and does not erase
successors.

Gate 7 preserve/split/merge mappings may help a future author propose a new
alignment. Gate 13 never treats them as authorization to carry, split, merge,
accept, or retarget an alignment automatically.

## Lifecycle and derived usability

Map content, selectors, and alignment endpoints are immutable. Only reversible
withdrawal state is mutable, with an independent nonnegative version and
append-only disposition history. Supersession is an immutable edge created by
the successor, not a mutable `current` pointer on the predecessor.

Current usability is derived at read time:

| Condition                                                                    | Durable meaning                                    | Current-use consequence                                                                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New Artifact Revision becomes current                                        | Old Map still names the exact old Revision         | Original-byte resolution fails unless those exact bytes again become current or accepted backing exists; no retarget.                                                 |
| Gate 9 corrects media type without changing exact Revision/Attribution/bytes | Map retains the media receipt accepted at creation | Artifact byte selectors remain current-usable when every ordinary-use fact still passes; no stale cause or mutation. A later Map records the corrected media receipt. |
| Representation source drifts                                                 | Map still names the exact Representation Revision  | Gate 11 current-use admission requires its exact continued-use rules; historical reader remains separate.                                                             |
| Representation is missing, mismatched, or deleted                            | Map and selector metadata remain                   | Current resolution fails with Gate 11 availability truth.                                                                                                             |
| Map is withdrawn                                                             | Snapshot and descendants remain                    | Ordinary discovery, current-use selector resolution, and new alignment reject it; exact metadata and explicitly authorized audit access remain.                       |
| Successor Map exists                                                         | Predecessor remains exact and inspectable          | Discovery may classify it `superseded`; no selector or alignment moves.                                                                                               |
| Course/View/Revision is withdrawn                                            | Alignment still names exact historical membership  | Current eligible alignment projection reports Course-side unavailability.                                                                                             |
| Working Course selection changes                                             | Alignment still names exact old membership         | Working-Course projection stops using it; exact/history query remains.                                                                                                |
| Exact working Revision is later reselected                                   | Relation identity is unchanged                     | It may become working-projectable again if every other endpoint is eligible.                                                                                          |
| Alignment is withdrawn or superseded                                         | Original relation remains                          | Ordinary discovery excludes it; exact/history query remains.                                                                                                          |

`stale` is therefore a read projection with a typed material-side, Map-side,
relation-side, or Course-side cause. It is not one stored boolean that loses
which authority changed. Restoration or exact recurrence may make a relation
usable again without rewriting it.

## CAS, transactions, cancellation, and recovery

### Map acceptance

The create entrypoint first performs exact-ID replay/conflict resolution before
source preparation. For a new identity, one short SQLite transaction:

1. repeats exact-ID replay/conflict resolution for a concurrent duplicate;
2. consumes the exact opaque prepared-target proof;
3. revalidates the Gate 9 ordinary Artifact snapshot or Gate 11 current-use
   admission/availability versions captured by preparation; Artifact Map
   creation also revalidates the exact descriptor/media receipt at this
   acceptance boundary, while later current-use reads do not;
4. validates any exact predecessor Map exists without treating it as a pointer;
5. inserts the Map snapshot, target receipt, authorship receipt, outline,
   selectors, selector witnesses, and initial active state; and
6. advances the shared learning frontier only after all rows succeed.

Any target drift, invalid selector, cancellation before the transaction,
constraint failure, or database failure prevents this attempt from publishing
a Map and becomes a captured failure subject to the final identity
reconciliation below. Once the short commit begins, Repa awaits its real
outcome; a later abort cannot report cancellation while a durable Map exists.

### Alignment acceptance

The create entrypoint first performs exact-ID replay/conflict resolution before
selector or Course preparation. For a new identity, one short SQLite
transaction revalidates:

- concurrent exact-ID replay/conflict, then exact active Map and selector
  ownership plus expected Map withdrawal version;
- the fresh selector-resolution receipt and exact Gate 9/11 mutable admission
  versions captured outside the transaction;
- the opaque Gate 7 membership proof through the Course-owned transaction
  revalidator: exact active Course, View, and Revision with their three expected
  state versions, exact immutable membership, and no invented membership
  version;
- exact Course selection Revision/version only when the proposal basis is
  `observed_working`;
- exact predecessor alignment when correction is claimed; and
- the trusted authorship capability bound to this proposal.

It then inserts the immutable alignment, provenance/reason, predecessor edge,
initial active state, and frontier advance atomically. A working-selection race
rejects `observed_working`; it never silently falls back to `explicit_exact`.

### Failure-path identity reconciliation

Map and alignment creation share the durable reconciliation rule above. It runs
after buffers and opaque proofs are released but before a captured failure is
returned, under an uninterruptible bounded database scope. Exact replay or
conflict discovered there outranks cancellation, stale endpoint state,
withdrawal, over-budget preparation, invalid live proof, or another precommit
failure captured after the initial absence check. An absent result linearizes
that attempt's failure before a later same-ID commit; a row already committed
before or during the final lookup wins. A database error that prevents the
lookup cannot be reported as proof that no effect exists.

### State transitions

Map and alignment withdrawal/restore compare exact ID, expected state version,
and expected current disposition in one transaction. An ABA withdrawal/restore
advances the version and rejects a stale caller. Restoring an exact record does
not validate or change other authorities; current-use queries still derive
endpoint eligibility.

No operation uses a database-wide revision or holds a transaction over source
I/O. Course/View/Revision state, Artifact, Representation, Map, alignment, and
selection versions remain independent preconditions because they protect
different invariants. Immutable Course membership is revalidated exactly but
has no version of its own.

### Crash and restart

All accepted state lives in the native Repa database and existing managed
Representation storage. Gate 13 has no background worker, staging directory,
index, cache owner, or recovery queue. Caller-visible ambiguity after a commit
is resolved by the pre-dispatch final Map/alignment ID and exact replay rules;
there is no unidentifiable generated result or external effect to rediscover.

A crash before a domain commit leaves no partial Map/alignment. A crash after
commit leaves the complete durable result, reconcilable by the caller-retained
exact ID and canonical retry before any live-state checks. Startup performs no
automatic Map generation, selector repair,
realignment, preferred-Map selection, or content scan.

## Read surfaces

The Material Map authority exposes bounded same-snapshot reads for:

- listing Map snapshots by exact Artifact target or Representation Revision,
  with explicit active/superseded/withdrawn filters and no singular current
  result;
- inspecting one exact Map header, target receipt, authorship, predecessor,
  successors, and disposition;
- paging one Map's ordered outline nodes and selectors in stable order;
- listing exact predecessor/successor correction branches;
- listing alignments from one Map or selector toward Course memberships;
- listing alignments from one exact Course membership toward material
  selectors;
- inspecting one exact alignment with provenance, reason, correction branch,
  disposition, stored endpoint eligibility, and typed known stale causes; and
- resolving one exact selector through a current-use capability, or inspecting
  its metadata without content.

Every collection has a fixed maximum page size, stable keyset order, and opaque
cursor scoped to endpoint, parent identity, direction, and filters. A cursor
from another Map, target, Course membership, direction, or filter fails.
Composite reads use one database snapshot and never join a mutable working
selection or endpoint state from a different commit.

Current-use content resolution is lazy and separately budgeted. List and
inspection queries never open source/Representation bytes, compile prompt
context, rank relevance, or fetch every aligned range. They distinguish a
stored-state eligibility result from `content_unverified`; they never claim
that an Artifact path or managed object still resolves merely because the last
database snapshot was eligible. Only a successful current-use selector
resolution supplies that stronger receipt.

## Program, learner, and model surfaces

Gate 13 exposes typed Core/application capabilities for direct trusted domain
use and focused evidence. It adds no terminal command, HTTP endpoint, Agent
tool, system prompt contribution, startup scan, automatic import, default Map,
or Context producer.

Generic read/search tools do not create a Map or alignment. A model response,
tool output, filename, heading, Course title, or apparent relation in prose is
not a durable write.

When Gate 17 later adds model-visible authoring:

- Gate 12 must validate the exact running Turn, admitted input/occurrence,
  sealed model operation, candidate Tool Part, and physical invocation;
- Gate 8 must settle the exact physical invocation, domain effect, Tool Part,
  result, and receipt atomically;
- Material Map must define the command-specific semantic effect identity,
  permissions, payload, CAS, correction, and failure behavior; and
- the current closed learning-command schema must be explicitly extended, not
  replaced by a universal registry or inferred from arbitrary tool names.

Those later commands may author proposals but cannot auto-accept semantic
quality, choose a preferred Map, infer relation kinds, or bypass exact target
admission.

## Implementation ownership

- A new Repa learning-domain module in `packages/core` owns Material Map and
  alignment IDs, schemas, SQL records, validation, legal transitions, errors,
  CAS, bounded reads, and migration.
- It may depend on the native database plus typed Gate 7/9/11 domain contracts.
  It does not import providers, Session/Turn runners, terminal code, generic
  tools, embeddings, search indexes, or Representation storage internals.
- Gate 7 may add the narrow Course-owned transaction membership revalidator
  defined above. It remains the sole owner of active Course/View/Revision and
  immutable membership predicates; Material Map receives only the opaque proof
  and typed result.
- Exact Artifact preparation composes Gate 9 and Gate 10 through a narrow
  cross-authority application capability following the proven Gate 11
  conversion pattern. It does not move Artifact semantics into ContentRoot or
  duplicate Gate 10's private filesystem predicates.
- Representation preparation receives only `CurrentUseReader`. A separately
  wired audit surface may receive `HistoricalReader`; the Material Map current
  consumer and future Tutor Context cannot.
- The migration is forward-only from the accepted Gate 12 schema. No pre-fork
  Material Map/alignment table, Markdown parser, path, line range, stable hash
  ID, or old database is imported or migrated.
- The physical schema uses dedicated Map/selector/alignment tables and exact
  foreign keys. It does not create a generic edge, fact, revision, event,
  command, or provenance graph.

## Failure behavior

Every `no Map` or `no relation` result below is returned only after the
failure-path identity reconciliation proves the exact ID absent. An identical
committed twin returns replay and a conflicting committed twin returns conflict
instead of the listed captured failure.

| Failure                                                                                                               | Required result                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unknown, withdrawn, correction-hidden, or non-current Artifact target at preparation/commit                           | typed rejection; no Map                                                                                                                                                                 |
| Artifact bytes exceed stable-read budget                                                                              | typed over-budget rejection; no ranged bypass or partial selector                                                                                                                       |
| selected path does not resolve to the Artifact's exact active location, including a different equal-bytes file        | typed source-provenance failure before Gate 9 observation; no Map and no availability restoration                                                                                       |
| overlapping roots without one exact named provenance episode                                                          | `ambiguous_content_root`; no fallback, observation, or Map                                                                                                                              |
| root revoke/rebind or source mutation during stable read                                                              | Gate 10/Gate 9 typed failure or exact newly observed Revision; old target is never returned as current                                                                                  |
| Artifact media descriptor changes before Map commit                                                                   | prepared creation receipt is stale; no Map. A correction after commit preserves the accepted receipt and is not a byte-selector stale cause                                             |
| selector range is empty, out of bounds, profile-incompatible, malformed, or witness-mismatched                        | reject the whole Map; no partial outline                                                                                                                                                |
| Representation unavailable, integrity-mismatched, deleted, drift-ungranted, or changes admission version              | discard buffered content and fail closed; metadata remains                                                                                                                              |
| unknown future profile receives a fine-grained selector                                                               | typed unsupported-selector failure; `whole_target` remains the only generic option                                                                                                      |
| Map proposal has a cycle, orphan, invalid preorder/depth, leaf without selector, or exceeds bounds                    | reject atomically                                                                                                                                                                       |
| predecessor Map/alignment is missing or from an impossible owner relation                                             | typed invalid transition; no successor                                                                                                                                                  |
| Map withdrawn or withdrawal/restoration ABA wins before current-use disclosure or alignment commit                    | discard buffered content and fail stale; no relation and no selector-withdrawal fiction                                                                                                 |
| selector target drifts or becomes unavailable between alignment preparation and commit                                | discard the prepared relation and fail stale; no blind alignment                                                                                                                        |
| Course/View/Revision withdrawn, immutable membership absent, or one of the three real state versions changed          | Course-owned typed stale/invalid target; no relation                                                                                                                                    |
| `observed_working` selection changes or ABA-restores                                                                  | selection-version conflict; never downgrade to exact historical targeting                                                                                                               |
| Course working selection changes after alignment                                                                      | preserve exact relation; working projection reports mismatch; no carry-forward                                                                                                          |
| source/Representation/Map changes after alignment                                                                     | preserve exact relation and typed current-usability cause; no retarget                                                                                                                  |
| cancellation before commit                                                                                            | release prepared buffers, then reconcile exact ID; return cancellation only while it remains absent                                                                                     |
| database failure during Map/alignment creation                                                                        | a definite rollback leaves no partial domain row/frontier advance, then exact-ID reconciliation decides replay/conflict/absent; an unavailable reconciliation returns `outcome_unknown` |
| database failure during withdrawal/restore                                                                            | transaction rolls back every state/history row and frontier advance                                                                                                                     |
| Map/alignment retry reuses an identity with changed canonical input                                                   | typed conflicting reuse before live-state/proof checks; no second row                                                                                                                   |
| same-ID twin commits while this call exits preparation through cancellation, stale state, or another captured failure | final durable reconciliation returns the committed replay before the captured failure; changed canonical input returns conflict                                                         |
| crash after commit before caller observes result                                                                      | retry/query by the caller-retained pre-dispatch exact ID returns the committed result before live-state checks; no duplicate and no startup replay                                      |
| generic read/search/model prose appears to describe structure                                                         | zero durable Gate 13 writes                                                                                                                                                             |

## Explicit non-goals

Gate 13 does not add:

- a Course, Course View, route, route anchor, progress, mastery, learner record,
  Agenda item, or Tutor action;
- material order as Course order, prerequisite inference, or automatic route
  mutation;
- required alignment, one-to-one alignment, completeness scoring, preferred
  material, or a canonical Map;
- `teaches`, `requires`, `assesses`, prerequisite, evidence, or other pedagogic
  relation kinds;
- automatic Map/alignment generation, acceptance, migration, carry-forward,
  repair, or model-visible authoring;
- a universal selector, semantic chunk, document parser registry, quote-based
  fuzzy reattachment, path/line identity, or storage-key access;
- embeddings, vector search, full-text indexing, RAG, background crawling,
  computer-wide search, or Context compilation;
- retained old Artifact bytes, a new ContentRoot ranged reader, a second
  Representation pipeline, or a historical-reader escape for current teaching;
- deep deletion, garbage collection across referring authorities, export, or
  Session-transcript cascade; or
- a generic graph, relation registry, event store, command bus, service layer,
  repository abstraction, or second runtime.

## Closing evidence required

### Schema, migration, and authority

- fresh and Gate-12-upgraded databases contain the exact Map, outline,
  selector, alignment, correction, and versioned withdrawal constraints;
- impossible target-arm combinations, cross-Map selector ownership,
  cross-Course membership, cycles, orphan parents, and partial rows fail at
  both domain and database boundaries;
- production dependency tests reject provider/Session/terminal/storage-internal
  imports, and Material target preparation cannot obtain the mutable
  Representation service or `HistoricalReader`; it receives only the narrow
  `CurrentUseReader` capability.

### Selector algebra and target reads

- `whole_target`, Artifact byte, PDF page, PDF item/scalar, and model
  rendition/scalar selectors round-trip their versioned encoding and exact
  witness;
- decomposed Unicode, CRLF, non-BMP scalars, empty PDF pages, adjacent and
  cross-item ranges, page boundaries, noncontiguous node selectors, first
  record over budget, and unknown profiles preserve exact semantics or reject
  typed;
- source mutation, same-path replacement, root revoke/rebind, Artifact
  withdrawal, lineage reattribution, Representation drift/grant revocation,
  deletion, integrity mismatch, and availability ABA discard buffered content
  without partial acceptance or retargeting;
- a wrong path containing byte-identical content cannot observe or restore the
  target Artifact; missing active source, overlapping-root ambiguity, and named
  root/binding/grant episode drift fail without fallback or a Gate 9
  observation;
- Artifact media correction before Map commit loses the creation-receipt CAS,
  while the same correction after commit preserves the immutable receipt and
  does not invalidate exact byte-selector current use;
- a valid Unicode case-bearing Windows source path persists through both the
  Gate 11 Representation receipt and Gate 13 Artifact target receipt. The
  Gate 10 canonical path key remains the owner-issued value; SQLite's
  ASCII-only `lower()` is not treated as an equivalent Unicode case fold;
- historical Artifact metadata remains while unavailable old raw bytes fail
  truthfully, and Representation historical access remains confined to the
  explicit audit capability.

### Map alternatives and correction

- two independent Maps for one exact target coexist with no preferred result;
- one Map can have several explicit successors, and a successor can change
  target without reusing selector/node identity or moving alignment;
- withdrawal/restore uses exact versions, rejects ABA callers, preserves
  history, and never selects a Map;
- current-use resolution captures active Map disposition before I/O, discards
  buffered content when withdrawal or withdrawal/restore ABA wins final
  revalidation, and treats a later withdrawal as nonretroactive to an already
  admitted disclosure;
- caller-retained pre-dispatch Map IDs distinguish two identical independent
  authoring episodes, exact retry returns one committed row before target
  revalidation, and conflicting reuse fails without another frontier advance;
- with a controlled barrier after two same-ID calls both observe initial
  absence, call A commits while call B exits preparation through cancellation,
  target stale, or another injected failure; B's final durable reconciliation
  returns A's exact result, while changed canonical input conflicts and an ID
  still absent returns only B's captured failure;
- injected failure at every publication boundary leaves no partial Map,
  outline, selector, receipt, state, or frontier advance.

### Alignment cardinality and Course races

- an unaligned Map remains valid;
- one selector aligns to several exact memberships and one membership aligns
  to selectors from several Maps/targets;
- creating or correcting a relation without a fresh successful current-use
  selector receipt fails, and a material drift race rejects before commit;
- exact composite foreign keys reject wrong Course/View/Revision/Item
  combinations;
- the Course-owned transaction revalidator rejects Course/View/Revision
  withdrawal/restore ABA and concurrent version changes, proves immutable exact
  membership without an invented membership version, and is the only
  production owner of those predicates;
- `explicit_exact` can target an eligible non-working Revision while
  `observed_working` rejects a stale selection before commit;
- working replacement, withdrawal/restoration, and preserve/split/merge
  mappings preserve old alignment history and create no automatic replacement;
- correction can change either endpoint/reason, several successors coexist,
  and withdrawal/restore never mutates endpoints.
- caller-retained pre-dispatch alignment IDs return exact committed replay even
  after endpoint drift, while conflicting canonical reuse fails before selector
  or Course live-state checks;
- with the same controlled initial-absence barrier, alignment A commits while
  alignment B exits selector/Course preparation through cancellation or stale
  state; B's final durable reconciliation returns A's exact result, changed
  canonical input conflicts, and an absent ID preserves only the captured
  failure.

### Restart and negative product behavior

- restart preserves exact Maps, correction branches, selectors, witnesses,
  alignments, dispositions, cursor behavior, and typed stale causes without a
  startup scan or repair;
- if the final durable identity lookup is unavailable, creation reports typed
  `outcome_unknown` with the exact caller-retained ID; exact query/retry later
  reconciles it without blind regeneration;
- generic read/search, model prose, ordinary Session deletion, Course
  selection change, and source observation create no unintended Gate 13 write;
- no terminal/model tool, command-settlement member, prompt contribution,
  index, embedding, chunk, preferred-Map pointer, or background job is reachable
  in the Gate 13 production boundary.

Focused implementation tests run from the owning package. Broader package or
release evidence is required only if the accepted implementation changes a
shared production carrier or executable boundary.

## Design evidence provenance

| Source                                                                                                                                       | Pin / status                                                                                                                   | Preserved invariant                                                                                                                             | Deliberate difference                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repa foundation, ADR-0012, architecture, native data model, Roadmap 09                                                                       | Current owner documents on 2026-07-19; volatile status remains `docs/README.md`                                                | Separate learning authorities; exact material identity; optional revision-bound many-to-many alignment; no route equality or RAG                | This contract makes only Map/selector/alignment meaning concrete and corrects the stale selector owner wording                                             |
| Gate 7                                                                                                                                       | Passed implementation `3bd6eb9d4`                                                                                              | Exact Course/View/Revision/item membership, immutable history, independent selection/CAS                                                        | Alignment references membership but does not own Course order, selection, or transition mappings and never carries automatically                           |
| Gate 9                                                                                                                                       | Passed implementation `41db7c292`                                                                                              | Exact Artifact Revision/fingerprint/AttributionBasis, ordinary-use versions, correction without retarget                                        | Map stores an exact typed reference and creation receipt; it does not own locations, source state, or bytes                                                |
| Gate 10                                                                                                                                      | Passed implementation `fb6ed5763`                                                                                              | Authorized mutation-safe local read and immutable disclosure receipt                                                                            | Gate 13 composes it for bounded original-byte validation; no Artifact meaning or ranged-read invention moves into ContentRoot                              |
| Gate 11                                                                                                                                      | Passed implementation `bdbfa0c05`                                                                                              | Exact Representation profiles, integrity, availability, and distinct current/historical readers                                                 | Gate 13 adds semantic selectors over declared mechanics without importing storage or inventing a preferred Representation                                  |
| Gates 8 and 12                                                                                                                               | Passed implementations `293ff6892` and `80f5fa30a`                                                                             | Exact committed duplicate outranks captured asynchronous failure; exact model-command settlement and running Turn/input/model/tool registration | Gate 13 reuses only the replay ordering for direct authoring IDs; no invocation/Turn settlement is wired until Gate 17 explicitly adds model-issued writes |
| Current production fork                                                                                                                      | Independently accepted working-tree implementation/evidence snapshot over context-recovery `HEAD 461a1acc2`; no closing commit | TypeScript/Bun modular monolith, native database, Effect services, closed domain APIs                                                           | New dedicated authority rather than inherited OpenCode or pre-fork schema                                                                                  |
| W3C Web Annotation [Selectors and States](https://www.w3.org/TR/selectors-states/) and [Data Model](https://www.w3.org/TR/annotation-model/) | The former is a 2017 Working Group Note; the latter is the Recommendation owning formal semantics                              | Source/selector separation and media-specific/refined coordinates                                                                               | No RDF/IRI, open registry, fuzzy reattachment, or web-resource state model                                                                                 |
| Pre-fork oracle route/material code and alignment experiments                                                                                | Immutable tag `repa-prefork-oracle`; read-only evidence                                                                        | Exact revision binding, fail-closed drift, bounded ranges, relation provenance, and need to preserve Course/material distinction                | Reject coupled Markdown heading→Course/alignment generation, path/line identity, automatic realignment, old schema, and premature pedagogic edge kinds     |
| Gate 13 selector/read probe                                                                                                                  | Temporary local source, executed and deleted 2026-07-19 under Bun 1.3.14                                                       | Coordinate units and profile structure must be explicit; budgets cannot change selector meaning                                                 | Promotes only a closed selector algebra, not the probe code, sample text, or a new profile                                                                 |

No source code or external material was copied from the oracle or W3C material
into production. The temporary selector probe left no tracked or untracked
file.

## Independent contract review

The maintainer explicitly invoked whole-Gate independent review automation.
Fresh top-level reviewer task `019f7996-36e0-72e1-8429-9e7f0d8b57f0`, run
`gate13-whole-20260719-01`, returned `Revise` on its first contract/theory pass.
It preserved the Gate framing and found six derived-contract defects. The
executor classified all six as valid. The first closure pass closed
`G13-CT-001`, `G13-CT-002`, and `G13-CT-004` through `G13-CT-006`, and narrowed
`G13-CT-003` to failure-path reconciliation when a concurrent same-ID call
commits during asynchronous preparation. The second closure pass accepted that
repair, closed `G13-CT-003`, found no related acceptance-changing defect, and
returned `Accept` for the contract/theory layer.

| Finding      | First-pass acceptance impact                                                                                                            | Current disposition                                                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G13-CT-001` | Blocking: Artifact preparation could observe a different equal-bytes path as the target source.                                         | Closed by the original reviewer after exact Gate 9 location → Gate 10 episode binding and no-fallback evidence obligations.                                                                                                     |
| `G13-CT-002` | Blocking: Map withdrawal was not a current-use resolution precondition or race boundary.                                                | Closed by the original reviewer after active-Map final revalidation, ABA handling, and audit/current-use separation.                                                                                                            |
| `G13-CT-003` | Blocking: commit-generated identity made post-commit retry ambiguous.                                                                   | Closed by the original reviewer after an uninterruptible durable ID/canonical-input reconciliation was required before any post-initial-check failure return, with Map/alignment commit-versus-cancellation/stale race oracles. |
| `G13-CT-004` | Blocking: the draft promised atomic Course membership checks without a Course-owned transaction seam and invented a membership version. | Closed by the original reviewer after the Course-owned opaque proof/revalidator and real CAS tuple were defined.                                                                                                                |
| `G13-CT-005` | Blocking: later Gate 9 media correction had no Map lifecycle rule.                                                                      | Closed by the original reviewer after creation-time media CAS and post-commit provenance-only semantics were defined.                                                                                                           |
| `G13-CT-006` | Nonblocking alone: W3C source status was overstated.                                                                                    | Closed by the original reviewer after correcting the Note/Recommendation provenance.                                                                                                                                            |

All six findings are closed and the original reviewer accepted this
contract/theory layer. The verdict establishes implementation authority under
project policy; it did not review or claim the later implementation. The
maintainer subsequently authorized that implementation and the whole-Gate loop.
The same reviewer completed the implementation/evidence review recorded below.

## Accepted implementation and evidence

This section records the implementation and causal evidence accepted by the
retained reviewer. The review verdict accepts the implementation/evidence
layer; only a later closing commit may formally close the Gate.

### Candidate realization

- `packages/core/src/material-map.ts` owns the trusted Material Map service,
  current-use selector resolver, exact-ID replay/conflict, final durable failure
  reconciliation, bounded reads, lifecycle transitions, and shared-frontier
  commits. The closed selector, target, cursor, schema, SQL, and database
  constraint concerns live in the adjacent `material-map/` modules.
- The physical authority uses dedicated Map target, outline, selector,
  disposition, and Course-alignment tables. Composite foreign keys preserve
  exact Map/selector and Course/View/Revision/item ownership. Publication and
  immutability triggers reject incomplete aggregates, invalid forests, missing
  selector ownership, direct mutation/deletion, and disposition changes without
  exact append-only history.
- Gate 9 exposes narrow owner-owned ordinary-byte and exact-source revalidators;
  Gate 11 exposes only its narrow `CurrentUseReader` to target preparation,
  including owner-read metadata needed to plan profile-specific selection plus
  an opaque current-use proof/revalidator and the canonical contiguous
  PDF-page-record decoder; Gate 7 exposes an opaque membership proof and
  transaction revalidator over its real Course, View, Revision, membership,
  and optional selection predicates. Material Map does not obtain Gate 11's
  mutable service or duplicate any of those authorities.
- Original-Artifact preparation binds one sealed inherited-provenance or
  explicitly learner-authorized ContentRoot episode and normalized path to the
  exact active Artifact location before constructing a Gate 9 observation.
  Representation preparation receives only Gate 11 `CurrentUseReader`.
- Map and alignment IDs are caller-known before preparation. Canonical input is
  persisted in full; exact replay precedes live preparation, and every captured
  post-absence failure performs one uninterruptible durable ID reconciliation.
  An unavailable reconciliation returns typed `outcome_unknown` rather than a
  false no-effect result.
- The single Gate 13 `+7` forward migration upgrades the accepted Gate 12
  schema, removes the predecessor Gate 11 table's invalid assumption that
  SQLite `lower()` reproduces Gate 10's JavaScript Unicode path key, and is
  generated consistently with the full current schema. The application runtime
  registers only the trusted service and current-use reader. It adds no Tool,
  learning command, terminal/HTTP surface, Context producer, historical-reader
  path, index, embedding, RAG, preferred Map, or background worker.

### Independent implementation/evidence review

The retained reviewer returned `Revise` on the first implementation/evidence
pass. The accepted Gate framing survived; the executor classified all three
localized findings as valid and repaired the candidate without a new product
decision:

| Finding      | Reviewer acceptance impact                                                                                                                                         | Final disposition                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G13-IE-001` | Blocking: Representation target preparation held the complete mutable `Representation.Interface`.                                                                  | Closed by the retained reviewer. Target dependencies now accept only `Representation.CurrentUseReaderInterface`; its owner-read descriptor exposes just revision ID, effective Artifact ID, and profile. The ownership oracle rejects the mutable service, service tag, node, and historical reader from all Gate 13 production sources.  |
| `G13-IE-002` | Blocking: SQLite's ASCII-only `lower()` rejected valid non-ASCII Gate 10 canonical path keys in both the new Artifact target and predecessor Representation table. | Closed by the retained reviewer. The invalid derived checks are removed from both owner schemas. The same Gate 13 `+7` graph-rebuild migration reconstructs `representation_revision` before creating the corrected Material tables; generated/full schemas agree, and a real `Ä` → `ä` Windows-path oracle accepts both Map target arms. |
| `G13-IE-003` | Blocking evidence defect: the record denied a shared executable-carrier change despite registering Material Map nodes in `AppLayer`.                               | Closed by the retained reviewer. This record names the AppLayer composition change and the focused runtime-construction test while making no broader packaging, release, or model/provider claim.                                                                                                                                         |

The closure pass returned `Accept` for the implementation/evidence layer and
found no new acceptance-changing defect. The reviewer independently ran the
three repaired Core suites (**20 tests, 0 failures, 161 expectations**) and the
focused AppLayer construction suite (**4 tests, 0 failures, 5 expectations**),
then audited the broader executor evidence below against the exact candidate.

The verdict is bound to `HEAD 461a1acc28b41550539496f58a5cedcb2339a583`,
tracked binary diff hash `79551428adcb103366d6cbf83401e2c9bf674d17`,
Gate-record SHA-256
`8360CC185E3E871197B2E43B1EF02C49AB2418D4D37EF096A94624DED8B4DF64`,
and README SHA-256
`61DB6157E8625A3F34E9A8A69FE5B825E1B1993D29C8438EAFC7A74CF5270944`.
The reviewer observed identical start/end bindings and made no mutation.

One nonblocking strengthening remains available: a future migration oracle may
install a populated predecessor Representation graph before applying `+7`.
This does not qualify the verdict: the predecessor/current DDL difference is
only removal of the invalid `lower()` predicate, the migration copy is
column-for-column, dependent foreign keys are checked before commit, and the
accepted runtime evidence includes a real Windows Unicode persistence path.

### Executor evidence

| Claim boundary                                                                                                                                                                                                                             | Fresh evidence                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact targets, source provenance, Unicode Windows path keys, media correction, target/Map ABA, alternatives, correction branches, neutral many-to-many alignment, Course/Representation owner proofs, restart, and typed stale projections | `packages/core/test/material-map-authority.test.ts` passes 17 tests. A real non-ASCII case-bearing source persists through Representation acceptance and both Map target arms. Controlled `Deferred` barriers exercise Map disclosure races, Map/alignment same-ID commit-versus-cancellation/staleness, final-lookup outage, and Course/Representation ABA.                 |
| Complete publication, rollback, immutable history, target arms, forest/selector ownership, exact composite foreign keys, and frontier atomicity                                                                                            | The authority suite injects failure at every Map/alignment publication table and frontier boundary and performs raw SQLite attacks against every aggregate family.                                                                                                                                                                                                           |
| Every public Map/alignment collection is bounded and cursor-scoped                                                                                                                                                                         | The authority suite pages Maps, outlines, Map successors/dispositions, alignments by Map/selector/membership, alignment successors/dispositions, and rejects cross-filter cursor reuse.                                                                                                                                                                                      |
| Closed selector coordinates and canonical profile fragments                                                                                                                                                                                | `packages/core/test/material-selector.test.ts` plus the extended PDF profile tests cover whole/byte/page/item-scalar/model-scalar selection, CRLF/NFC/non-BMP coordinates, empty pages, contiguous record windows, malformed sequences, witnesses, and unknown-profile whole-only behavior.                                                                                  |
| Fresh and Gate-12-upgrade schema equality, predecessor path-key repair, and migration integrity                                                                                                                                            | `packages/core/test/material-map-migration.test.ts` and the updated `packages/core/test/database-migration.test.ts` pass with foreign-key checks enabled. Both persisted path-key tables exclude the invalid SQLite `lower()` comparison; the migration generator reports no incremental schema drift, retains one Gate 13 `+7` migration, and reconstructs the full schema. |
| Authority remains outside runners, providers, terminal, tools, managed storage, and historical content access                                                                                                                              | `packages/core/test/material-map-ownership.test.ts` proves the dependency/import boundary, rejects access to the complete mutable Representation service and `HistoricalReader`, and proves the absence of a model-visible Material command.                                                                                                                                 |
| Shared application runtime composition remains constructible                                                                                                                                                                               | From `packages/opencode`, `bun test test/effect/app-runtime-logger.test.ts` passes 4 tests, 0 failures, and 5 expectations after `AppLayer` registers the Material Map service/current-use nodes.                                                                                                                                                                            |

The fresh focused behavioral command from `packages/core` passed **100 tests,
0 failures, and 752 expectations** across the affected Gate 7/9/11 authorities,
their storage/profile and migration boundaries, and all Gate 13 suites:

```powershell
bun test test/artifact-authority.test.ts test/course-authority.test.ts test/course-pagination.test.ts test/representation-authority.test.ts test/representation-storage.test.ts test/representation-ownership.test.ts test/representation/pdf-text-profile.test.ts test/representation/model-rendition-profile.test.ts test/database-migration.test.ts test/material-selector.test.ts test/material-map-migration.test.ts test/material-map-ownership.test.ts test/material-map-authority.test.ts
```

The following focused executable checks also passed:

```powershell
# packages/core
bun run typecheck
bun run migration --check

# packages/opencode
bun test test/effect/app-runtime-logger.test.ts
bun run typecheck
```

The final documentation/link/whitespace and working-tree checks are recorded at
the reviewer handoff after this candidate record is complete. No root-level test,
unrelated package suite, release build, packaged application oracle, or model
provider call was run. Gate 13 does change the shared `AppLayer` executable
composition by registering its trusted service/current-use nodes; the focused
runtime-construction oracle covers that carrier change. It does not change
packaging, startup policy, or model/provider surfaces, so no broader release
claim or release build is made.
